// ==========================================================================
// La matrice des potentiels
// --------------------------------------------------------------------------
// A[m,k] est le potentiel au centre du panneau m dû au panneau k portant une
// densité de charge unité. On résout ensuite A·q = 1 : la charge qui met tout
// le ruban à un volt.
//
// L'INTÉGRALE SPECTRALE ET SON PIÈGE. On a
//     A[m,k] = (w_k/π) ∫₀^∞ G(β) sinc(βw_k/2) cos(β·d) dβ
// et G ~ 1/(2εβ) quand β est grand : l'intégrale converge mal, et c'est la
// singularité logarithmique du noyau. On extrait donc un terme dont on connaît
// la transformée spatiale — mais PAS le simple 1/(2εβ), qui diverge en β=0
// alors que le vrai G y est fini. Extraire celui-là fait sortir ε_eff
// AU-DESSUS de εr, ce qui est impossible : la capacité extraite est plus grande
// que la vraie. On extrait donc le noyau du même milieu moyen AVEC SON IMAGE
// dans le plan de masse :
//     Gx(β) = (1 - e^(-2βd)) / (2εβ)
// qui tend vers 1/(2εβ) en β grand (même singularité) et vers d/ε en β=0
// (fini, comme G). Sa transformée spatiale est exacte :
//     Gx(x) = ln(√(x² + 4d²) / |x|) / (2πε)
// Le reste G - Gx est fini partout et s'annule exponentiellement : trois cents
// points de Gauss-Legendre en viennent à bout.
// ==========================================================================

use crate::alg;
use crate::green::Green;
use crate::{refus, Res, BETA_MAX};
use faer::Mat;
use std::f64::consts::PI;
use std::sync::{Arc, Mutex};

/// ∫ Gx sur le panneau [d-w/2, d+w/2] portant une densité unité.
///
/// Primitives : ∫ -ln|u| du = u - u ln|u|
///              ∫ ln(u²+a²)/2 du = u ln(u²+a²)/2 - u + a atan(u/a)
pub fn _integrale_extraite(d: f64, largeur: f64, distance_plan: f64, epsilon: f64) -> f64 {
    let a = 2.0 * distance_plan;
    let lo = d - largeur / 2.0;
    let hi = d + largeur / 2.0;

    let p_log = |u: f64| {
        let au = u.abs();
        if au < 1e-300 {
            0.0
        } else {
            u - u * au.ln()
        }
    };

    let p_image = |u: f64| 0.5 * u * (u * u + a * a).ln() - u + a * (u / a).atan();

    ((p_log(hi) - p_log(lo)) + (p_image(hi) - p_image(lo))) / (2.0 * PI * epsilon)
}

// LES NOEUDS DE GAUSS-LEGENDRE NE DEPENDENT QUE DE LEUR NOMBRE, et les
// recalculer a chaque section coutait plus cher que la section elle-meme :
// `leggauss(300)` passe par les valeurs propres d'une matrice compagnon, soit
// une douzaine de millisecondes, quand resoudre une ligne seule en demande une
// cinquantaine en tout. Une section les redemande deux fois, un crosstalk une
// fois par troncon -- c'etait la moitie du temps de calcul depensee a refaire
// la meme table.
//
// LES TABLEAUX SONT RENDUS EN LECTURE SEULE. Ils sont partages par tous les
// appelants : une ecriture en place les corromprait pour toute la suite du
// processus, et sans cela le jour ou quelqu'un ecrirait `noeuds *= 2` la faute
// se lirait des sections plus loin, sur un resultat faux mais plausible. En
// lecture seule, elle leve tout de suite et a l'endroit ou elle est commise.
//
// (En Rust un `Arc` partage ne s'ecrit pas : la lecture seule est acquise. Les noeuds sortent
// d'une iteration de Newton sur P_n et non des valeurs propres de la matrice compagnon de
// numpy : memes noeuds a 1e-15 pres, en une fraction de milliseconde.)
type Table = Arc<(Vec<f64>, Vec<f64>)>;
static TABLES: Mutex<Vec<(usize, Table)>> = Mutex::new(Vec::new());

/// Noeuds et poids de Gauss-Legendre a n points, calcules une seule fois.
pub fn _leggauss(n: usize) -> Table {
    let mut tables = TABLES.lock().unwrap_or_else(|e| e.into_inner());
    if let Some((_, t)) = tables.iter().find(|(k, _)| *k == n) {
        return t.clone();
    }
    let mut noeuds = vec![0.0; n];
    let mut poids = vec![0.0; n];
    for i in 0..n.div_ceil(2) {
        let mut x = (PI * (i as f64 + 0.75) / (n as f64 + 0.5)).cos();
        let mut dp = 1.0;
        for _ in 0..100 {
            // P_n et P_(n-1) par la recurrence a trois termes
            let (mut p0, mut p1) = (1.0, x);
            for k in 2..=n {
                let p2 = ((2 * k - 1) as f64 * x * p1 - (k - 1) as f64 * p0) / k as f64;
                p0 = p1;
                p1 = p2;
            }
            dp = n as f64 * (x * p1 - p0) / (x * x - 1.0);
            let dx = p1 / dp;
            if dx.abs() <= 2e-15 {
                break; // dp est celui de ce x : le poids en sort juste
            }
            x -= dx;
        }
        let w = 2.0 / ((1.0 - x * x) * dp * dp);
        noeuds[i] = -x;
        noeuds[n - 1 - i] = x;
        poids[i] = w;
        poids[n - 1 - i] = w;
    }
    if n % 2 == 1 {
        noeuds[n / 2] = 0.0;
    }
    let t: Table = Arc::new((noeuds, poids));
    if tables.len() >= 16 {
        tables.remove(0);
    }
    tables.push((n, t.clone()));
    t
}

/// Les nœuds en β, sur autant d'intervalles qu'il y a d'échelles.
///
/// UNE SECTION PEUT AVOIR DEUX LONGUEURS, et c'est le cas dès qu'une piste est
/// couverte : la hauteur au plan, et l'épaisseur de diélectrique au-dessus.
/// Le reste spectral s'éteint en e^(-2βd) pour CHACUNE — la plus petite
/// commande donc jusqu'où il faut intégrer, et la plus grande où se trouve la
/// structure. Trois cents points de Gauss-Legendre étalés d'un coup de 0 à
/// 40/d_min manqueraient tout ce qui se passe autour de 1/d_max quand les deux
/// sont d'un ordre de grandeur d'écart.
///
/// On découpe donc en un intervalle par échelle, du plus grossier au plus fin,
/// avec la quadrature entière sur chacun. Une seule échelle -> un seul
/// intervalle, et c'est mot pour mot ce qui existait.
pub fn _quadrature(distance_plan: f64, echelles: &[f64], n_quadrature: usize, beta_max: f64) -> (Vec<f64>, Vec<f64>) {
    let mut ech: Vec<f64> = echelles.iter().copied().filter(|&e| e > 0.0).collect();
    ech.push(distance_plan);
    ech.sort_by(|a, b| b.total_cmp(a));
    ech.dedup();
    let table = _leggauss(n_quadrature);
    let (noeuds, poids_ref) = (&table.0, &table.1);
    let (mut betas, mut poids) = (Vec::new(), Vec::new());
    let mut b0 = 1e-12;
    for e in ech {
        let b1 = beta_max / e;
        if !(b1 > b0) {
            continue;
        }
        betas.extend(noeuds.iter().map(|x| 0.5 * (b1 - b0) * x + 0.5 * (b0 + b1)));
        poids.extend(poids_ref.iter().map(|p| 0.5 * (b1 - b0) * p));
        b0 = b1;
    }
    (betas, poids)
}

// Plafond de la quadrature etiree par `_n_quadrature` : w/h = 6 600.
pub const N_QUADRATURE_MAX: usize = 20000;

/// Le nombre de points de quadrature, ETIRE AVEC L'ETENDUE des rubans.
///
/// Le reste spectral oscille en cos(beta x) jusqu'a x = l'etendue du ou des
/// rubans, et s'eteint en e^(-2 beta d) : il faut des noeuds en proportion
/// de etendue/d. Trois cents tiennent jusqu'a etendue/d = 100 (eps_eff a
/// 0,03 % de la quadrature fine) et decrochent au-dela SANS RIEN DIRE : a
/// w/h = 1000, eps_eff sortait a 5,06 pour un er de 4,3. Trois points par
/// unite de etendue/d rendent 4,285 (Hammerstad-Jensen : 4,285). En dessous
/// de 100, rien ne change, au bit pres.
pub fn _n_quadrature(n_quadrature: usize, etendue: f64, distance_plan: f64) -> usize {
    if !(etendue > 0.0 && distance_plan > 0.0) {
        return n_quadrature;
    }
    n_quadrature.max(N_QUADRATURE_MAX.min((3.0 * etendue / distance_plan).ceil() as usize))
}

/// La matrice des potentiels, terme extrait + reste spectral.
pub fn _matrice(
    centres: &[f64], largeurs: &[f64], green: &Green, distance_plan: f64, epsilon_moyen: f64, n_quadrature: usize,
    beta_max: f64, echelles: &[f64],
) -> Mat<f64> {
    let green = match green {
        Green::SansPlan(noyau) => return noyau.matrice(centres, largeurs),
        Green::Spectral(g) => g,
    };
    let (betas, poids) = _quadrature(distance_plan, echelles, n_quadrature, beta_max);

    let poids_spectral: Vec<f64> = betas
        .iter()
        .zip(&poids)
        .map(|(&be, &p)| {
            let g = green(be);
            let gx = (1.0 - (-2.0 * (be * distance_plan).clamp(0.0, 700.0)).exp()) / (2.0 * epsilon_moyen * be);
            p * (g - gx)
        })
        .collect();

    // LA SOMME EN β SE FACTORISE, et c'est ce qui rend le plan coplanaire
    // abordable. Écrite naïvement, elle demande une matrice N×N par point de
    // quadrature :
    //     R[m,k] = Σ_β  p_β · cos(β(x_m − x_k)) · sinc(β w_k/2)
    // soit, à 240 panneaux et 900 points, une cinquantaine de millions
    // d'opérations en Python. Mais
    //     cos(β(x_m − x_k)) = cos(βx_m)cos(βx_k) + sin(βx_m)sin(βx_k)
    // sépare le m du k, et la somme devient DEUX PRODUITS DE MATRICES que BLAS
    // exécute d'un trait. Le résultat est le même au bit près — ce n'est pas une
    // approximation, c'est la formule d'addition du cosinus — et le calcul passe
    // d'une demi-seconde à quelques dizaines de millisecondes.
    //
    // (Ici `faer` tient le role de BLAS, et les cosinus se calculent sur tous les coeurs.)
    let (n, nb) = (centres.len(), betas.len());
    // une colonne par noeud b, quatre blocs de n lignes : cos.p, sin.p, cos.sinc, sin.sinc
    let blocs = alg::par_colonnes(4 * n, nb, |b, col| {
        let (be, ps) = (betas[b], poids_spectral[b]);
        for m in 0..n {
            let (sin_m, cos_m) = (centres[m] * be).sin_cos();
            // np.sinc(u) = sin(pi u)/(pi u)
            let u = largeurs[m] * be / (2.0 * PI);
            let y = PI * if u == 0.0 { 1.0e-20 } else { u };
            let sinc = y.sin() / y;
            col[m] = cos_m * ps;
            col[n + m] = sin_m * ps;
            col[2 * n + m] = cos_m * sinc;
            col[3 * n + m] = sin_m * sinc;
        }
    });
    let bloc = |k: usize| blocs.as_ref().subrows(k * n, n);
    let reste = bloc(0) * bloc(2).transpose() + bloc(1) * bloc(3).transpose();

    alg::par_colonnes(n, n, |k, col| {
        for (m, v) in col.iter_mut().enumerate() {
            *v = _integrale_extraite(centres[m] - centres[k], largeurs[k], distance_plan, epsilon_moyen) + reste[(m, k)] * (largeurs[k] / PI);
        }
    })
}

/// De quel cote resserrer les panneaux d'une bande.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Serrer {
    Deux,
    Gauche,
    Droite,
}

/// `np.linspace(a, b, n + 1)`, operation pour operation.
fn linspace(a: f64, b: f64, n: usize) -> Vec<f64> {
    let pas = (b - a) / n as f64;
    let mut v: Vec<f64> = (0..=n).map(|i| i as f64 * pas + a).collect();
    v[n] = b;
    v
}

fn signe(u: f64) -> f64 {
    if u > 0.0 {
        1.0
    } else if u < 0.0 {
        -1.0
    } else {
        0.0
    }
}

fn centres_largeurs(x: &[f64]) -> (Vec<f64>, Vec<f64>) {
    (x.windows(2).map(|p| 0.5 * (p[1] + p[0])).collect(), x.windows(2).map(|p| p[1] - p[0]).collect())
}

/// Panneaux sur [x0, x1], resserrés là où la charge se concentre.
///
/// `serrer` dit de quel côté :
///     "deux"     les deux arêtes — c'est le ruban signal ;
///     "gauche"   l'arête x0 seule — un plan de masse à droite du ruban, dont
///                le bord intérieur est en x0 et qui s'étend vers la droite ;
///     "droite"   l'arête x1 seule — le plan de masse à gauche.
///
/// Un plan coplanaire porte sa charge contre le ruban et la perd vite en
/// s'éloignant : la resserrer sur la seule arête intérieure met les panneaux
/// là où il se passe quelque chose, et laisse les larges là où il n'y a rien.
pub fn _panneaux_bande(x0: f64, x1: f64, n: usize, serrer: Serrer) -> (Vec<f64>, Vec<f64>) {
    let t: Vec<f64> = match serrer {
        Serrer::Deux => linspace(-1.0, 1.0, n).iter().map(|&u| 0.5 * (signe(u) * u.abs().powf(1.5) + 1.0)).collect(),
        Serrer::Gauche => linspace(0.0, 1.0, n).iter().map(|&u| u * u).collect(),
        Serrer::Droite => linspace(0.0, 1.0, n).iter().rev().map(|&u| 1.0 - u * u).collect(),
    };
    let x: Vec<f64> = t.iter().map(|&t| x0 + (x1 - x0) * t).collect();
    centres_largeurs(&x)
}

/// Le ruban découpé, panneaux resserrés aux bords.
///
/// La charge se concentre aux arêtes — elle y diverge, en théorie. Un
/// découpage régulier y perdrait la moitié de la charge ; l'exposant 1,5
/// resserre juste ce qu'il faut.
pub fn _panneaux(largeur: f64, n: usize) -> (Vec<f64>, Vec<f64>) {
    let x: Vec<f64> = linspace(-1.0, 1.0, n).iter().map(|&u| signe(u) * u.abs().powf(1.5) * (largeur / 2.0)).collect();
    centres_largeurs(&x)
}

/// Les charges des panneaux sous chaque second membre.
///
/// DEUX CONTRAINTES PEUVENT S'AJOUTER AU SYSTEME, et elles s'ecrivent de la
/// meme facon -- une inconnue de potentiel, une equation de charge :
///   · un conducteur FLOTTANT : son potentiel est libre, sa charge nulle ;
///   · la section SANS PLAN : le potentiel de l'infini est libre, la charge
///     de toute la section est nulle (voir `NoyauSansPlan`).
/// Sans l'une ni l'autre, c'est `np.linalg.solve` tel quel.
///
/// `seconds` porte un second membre par colonne ; `flottants` les (debut, taille) des blocs
/// de panneaux flottants.
pub fn _resoudre(mat: &Mat<f64>, seconds: &Mat<f64>, largeurs: &[f64], green: &Green, flottants: &[(usize, usize)]) -> Res<Mat<f64>> {
    let n_p = mat.nrows();
    let neutre = green.sans_plan();
    let n_x = flottants.len() + usize::from(neutre);
    if n_x == 0 {
        return alg::resoudre(mat, seconds);
    }
    let mut a = Mat::<f64>::zeros(n_p + n_x, n_p + n_x);
    for j in 0..n_p {
        for i in 0..n_p {
            a[(i, j)] = mat[(i, j)];
        }
    }
    for (j, &(debut, taille)) in flottants.iter().enumerate() {
        for k in debut..debut + taille {
            a[(k, n_p + j)] = -1.0;
            a[(n_p + j, k)] = largeurs[k];
        }
    }
    if neutre {
        for k in 0..n_p {
            a[(k, n_p + n_x - 1)] = 1.0;
            a[(n_p + n_x - 1, k)] = largeurs[k];
        }
    }
    let b = Mat::from_fn(n_p + n_x, seconds.ncols(), |i, j| if i < n_p { seconds[(i, j)] } else { 0.0 });
    let q = alg::resoudre(&a, &b)?;
    Ok(Mat::from_fn(n_p, seconds.ncols(), |i, j| q[(i, j)]))
}

/// Capacité linéique du ruban, en farads par mètre.
pub fn capacitance(
    largeur: f64, green: &Green, distance_plan: f64, epsilon_moyen: f64, n: usize, n_quadrature: usize, echelles: &[f64],
) -> Res<f64> {
    if green.sans_plan() {
        return refus("sans plan et sans masse coplanaire : aucun conducteur ne porte le retour");
    }
    let (centres, largeurs) = _panneaux(largeur, n);
    let a = _matrice(
        &centres, &largeurs, green, distance_plan, epsilon_moyen, _n_quadrature(n_quadrature, largeur, distance_plan),
        BETA_MAX, echelles,
    );
    let q = alg::resoudre(&a, &Mat::from_fn(n, 1, |_, _| 1.0))?;
    Ok((0..n).map(|i| q[(i, 0)] * largeurs[i]).sum())
}

// ==========================================================================
// Le plan de masse COPLANAIRE
// --------------------------------------------------------------------------
// UNE PISTE NOYÉE DANS UN PLAN ARROSÉ n'est pas un microruban. Le cuivre de
// masse qui la borde sur SA PROPRE COUCHE, à deux ou trois dixièmes de
// millimètre, lui prend une part de son champ et fait tomber son impédance de
// vingt pour cent et davantage. Sur une carte RF, où l'on arrose et où l'on
// coud de vias, c'est le cas ordinaire et non l'exception.
//
// CE QUE ÇA COÛTE ICI, ET POURQUOI C'EST SI PEU. Le solveur résout déjà une
// distribution de charge sur des panneaux ALIGNÉS À UNE MÊME HAUTEUR ; la
// fonction de Green ne connaît que l'écart horizontal entre deux panneaux. Un
// plan coplanaire, c'est donc simplement d'autres panneaux dans la même
// matrice — à la même hauteur, avec le même noyau. Rien de la physique ne
// change : seule la condition aux limites change.
//
//     [A] [q] = [V]     avec V = 1 sur le ruban, 0 sur les plans
//
// La capacité est la charge PORTÉE PAR LE RUBAN, sous un volt. Les plans en
// portent une, négative, qui est le courant de retour ; elle n'entre pas dans
// le compte, elle l'explique.
//
// JUSQU'OÙ S'ÉTEND LE PLAN. Nulle part il ne s'arrête vraiment, mais sa charge
// décroît vite : au-delà de quelques hauteurs de diélectrique il ne reste rien.
// On l'étend donc sur ce qui domine — la hauteur au plan du dessous, l'écart,
// la largeur du ruban — et le banc d'essai vérifie qu'aller plus loin ne change
// plus le résultat.
//
// LES DEUX CÔTÉS SONT INDÉPENDANTS, et c'est ce qui a été corrigé en 1.3.0. Un
// seul écart posé de part et d'autre suppose la masse symétrique ; le cuivre
// d'une carte ne l'est pas. Une piste qui longe une découpe d'un côté et du
// plan serré de l'autre n'a qu'UNE bande de masse, et la prendre pour deux fait
// tomber Z₀ deux fois trop. Chaque bande a donc son écart, et un côté sans
// masse est simplement un côté sans panneaux — pas un écart infini qu'il
// faudrait borner quelque part.
// ==========================================================================

/// Jusqu'ou poser la masse coplanaire, de chaque cote.
///
/// SOUS UN PLAN, sa charge s'eteint en quelques hauteurs de dielectrique.
/// SANS PLAN, rien ne la borne que la masse elle-meme : la densite ne decroit
/// plus qu'en 1/x^2, et c'est la taille du GROUPE qui commande -- pas
/// l'epaisseur du stratifie : sur une plaque epaisse, l'etendre a dix
/// epaisseurs elargissait les premiers panneaux au-dela de l'ecart lui-meme.
/// Quarante fois le demi-groupe tiennent la ligne coplanaire exacte
/// (transformation conforme) a quelques dixiemes de pour cent -- voir le banc.
pub fn _etendue(green: &Green, distance_plan: f64, demi_groupe: f64) -> f64 {
    if green.sans_plan() {
        return 40.0 * demi_groupe;
    }
    (20.0 * distance_plan).max(10.0 * demi_groupe)
}

/// Le nombre de panneaux de chaque bande de masse coplanaire.
pub fn _n_plan(green: &Green, n: usize) -> usize {
    if green.sans_plan() {
        n.max(120)
    } else {
        (n / 2).max(40)
    }
}

/// Capacité linéique d'un ruban bordé de masse, en farads par mètre.
///
/// `ecart_g` et `ecart_d` sont les distances de cuivre à cuivre entre le ruban
/// et la masse, à gauche et à droite. Zéro d'un côté veut dire « pas de masse
/// coplanaire de ce côté-là » : la bande correspondante n'entre pas dans la
/// matrice. Zéro des deux côtés, et l'on retombe sur le microruban nu, au bit
/// près — le banc le vérifie.
#[allow(clippy::too_many_arguments)]
pub fn capacitance_coplanaire(
    largeur: f64, ecart_g: f64, ecart_d: f64, green: &Green, distance_plan: f64, epsilon_moyen: f64, n: usize,
    n_quadrature: usize, echelles: &[f64], etendue: Option<f64>, n_plan: Option<usize>,
) -> Res<f64> {
    let (g, d) = (ecart_g, ecart_d);
    if !(g > 0.0) && !(d > 0.0) {
        return capacitance(largeur, green, distance_plan, epsilon_moyen, n, n_quadrature, echelles);
    }
    let etendue = etendue.unwrap_or_else(|| _etendue(green, distance_plan, largeur / 2.0 + g.max(d)));
    let n_plan = n_plan.unwrap_or_else(|| _n_plan(green, n));

    // On empile de gauche à droite : masse de gauche s'il y en a, le ruban, puis
    // masse de droite s'il y en a. `debut` retient où commence le ruban dans la
    // pile, puisque ce n'est plus toujours après un bloc de `n_plan` panneaux.
    let (cs, ws) = _panneaux_bande(-largeur / 2.0, largeur / 2.0, n, Serrer::Deux);
    let (mut centres, mut largeurs, mut tension) = (Vec::new(), Vec::new(), Vec::new());
    if g > 0.0 {
        let a0 = largeur / 2.0 + g; // bord intérieur de la masse gauche
        let (cg, wg) = _panneaux_bande(-a0 - etendue, -a0, n_plan, Serrer::Droite);
        centres.extend(cg);
        largeurs.extend(wg);
        tension.extend(std::iter::repeat_n(0.0, n_plan));
    }
    let debut = centres.len();
    centres.extend(&cs);
    largeurs.extend(&ws);
    tension.extend(std::iter::repeat_n(1.0, n));
    if d > 0.0 {
        let a0 = largeur / 2.0 + d; // bord intérieur de la masse droite
        let (cd, wd) = _panneaux_bande(a0, a0 + etendue, n_plan, Serrer::Gauche);
        centres.extend(cd);
        largeurs.extend(wd);
        tension.extend(std::iter::repeat_n(0.0, n_plan));
    }

    // L'écart devient une longueur du problème : c'est sur lui que le champ
    // varie le plus vite quand il est petit devant la hauteur au plan, et la
    // quadrature doit aller jusqu'à 1/écart pour le voir. Deux écarts
    // différents, ce sont donc DEUX échelles — la plus fine commande jusqu'où
    // intégrer, et `_quadrature` place un intervalle sur chacune.
    let mut ech = echelles.to_vec();
    ech.extend([g, d].into_iter().filter(|&e| e > 0.0));
    let mat = _matrice(
        &centres, &largeurs, green, distance_plan, epsilon_moyen, _n_quadrature(n_quadrature, largeur, distance_plan),
        BETA_MAX, &ech,
    );
    let q = _resoudre(&mat, &Mat::from_fn(tension.len(), 1, |i, _| tension[i]), &largeurs, green, &[])?;
    // La charge du RUBAN seul : c'est elle que le volt appliqué a fait monter.
    Ok((0..n).map(|i| q[(debut + i, 0)] * ws[i]).sum())
}
