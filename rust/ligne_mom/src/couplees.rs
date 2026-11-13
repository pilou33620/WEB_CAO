// ==========================================================================
// N CONDUCTEURS : Z DIFFERENTIELLE ET DIAPHONIE, MEME CHANTIER
// --------------------------------------------------------------------------
// CE QUI CHANGE, ET C'EST TOUT CE QUI CHANGE : LE SECOND MEMBRE.
// `capacitance_coplanaire` assemblait deja une matrice MULTI-CONDUCTEURS --
// plusieurs blocs de panneaux a la meme hauteur, une seule matrice, une seule
// fonction de Green -- mais elle ne resolvait qu'un vecteur :
//
//     [A] [q] = [V]     avec V = 1 sur le ruban, 0 sur les plans coplanaires
//
// On en resout N : potentiel unite sur le conducteur i, zero sur les autres et
// sur les plans, et l'on releve la charge portee par CHACUN. Cela donne la
// MATRICE DE CAPACITE DE MAXWELL (dite de court-circuit) [C], celle-la meme que
// la theorie des lignes multiconducteurs demande :
//
//     Q = [C] V     diagonale positive, hors-diagonale negative,
//                   somme de ligne = capacite vers la reference
//
// On refait avec er = 1 -> [C0], et comme le milieu n'est pas magnetique,
//
//     [L] = mu0 eps0 [C0]^-1
//
// De ces deux matrices sortent, SANS AUCUN SOLVEUR DE PLUS : Z differentielle
// et Z commune (modes pair/impair pour une paire, decomposition modale de
// [L][C] au-dela), les coefficients de couplage, et la diaphonie NEXT/FEXT.
//
// CE QUE CA COUTE. `_matrice` -- la partie chere, avec sa quadrature spectrale
// -- est construite UNE SEULE FOIS ; `np.linalg.solve` recoit les N seconds
// membres D'UN COUP et n'en factorise qu'une fois. Le surcout sur le calcul
// d'un conducteur seul est celui des N-1 substitutions arriere : negligeable.
// La precision est la meme -- meme discretisation, memes panneaux resserres.
//
// CE QUE CELA NE COUVRE PAS, et qui doit etre dit la ou on l'emploie : le
// couplage entre pistes PARALLELES, c'est-a-dire l'immense majorite de la
// diaphonie qui compte sur une carte. Deux pistes qui se croisent sur des
// couches differentes, ou qui couplent par un champ de vias, ne sont plus une
// section : la, et la seulement, il faut le 2,5D.
// ==========================================================================

use crate::alg;
use crate::green::Green;
use crate::ligne::*;
use crate::matrice::*;
use crate::{refus, Res, BETA_MAX, C_0, EPSILON_0, MAX_CONDUCTEURS, MU_0, N_PANNEAUX, N_QUADRATURE};
use faer::Mat;
use serde::Serialize;
use std::f64::consts::PI;

/// Un ruban pose par `_conducteurs_places` : centre et largeur effective, en metres.
#[derive(Debug, Clone, PartialEq)]
pub struct Place {
    pub x: f64,
    pub w_nue: f64,
    /// le numero d'ENTREE du conducteur
    pub rang: usize,
    pub w: f64,
    pub masse: bool,
    pub flottant: bool,
}

/// Les rubans, ramenes a (centre, largeur effective) en metres.
///
/// Chaque conducteur porte sa largeur `w` et, au choix, son centre `x` ou son
/// ecart `s` au precedent -- de cuivre a cuivre, comme partout ailleurs ici.
/// `masse` a vrai en fait une PISTE DE GARDE : elle occupe la place, prend du
/// champ, et reste a zero volt. `flottant` a vrai en fait un cuivre ISOLE :
/// meme place, meme champ, mais charge totale nulle et potentiel libre -- ce
/// qu'est un plan ou une garde que rien ne coud a la masse.
///
/// L'EPAISSEUR ELARGIT CHAQUE RUBAN AUTOUR DE SON CENTRE, et l'ecart se reduit
/// donc tout seul de ce que les deux bords se sont avances : c'est la meme
/// correction de Wheeler que pour un ruban seul, et poser les centres AVANT de
/// l'appliquer est ce qui la rend juste sans avoir a corriger l'ecart a la
/// main.
///
/// `elargir(w, t)` rend la largeur du ruban mince qui remplace le ruban epais.
pub fn _conducteurs_places(conducteurs: &[Conducteur], epaisseur: f64, elargir: impl Fn(f64, f64) -> f64) -> Res<Vec<Place>> {
    let mut places: Vec<Place> = Vec::new();
    let mut x: Option<f64> = None;
    for (k, cond) in conducteurs.iter().enumerate() {
        let w = cond.w;
        if !(w > 0.0) {
            return refus(format!("conducteur {} : largeur nulle", k + 1));
        }
        let centre = if let Some(cx) = cond.x {
            cx
        } else if let Some(x) = x {
            let ecart = cond.s;
            if !(ecart > 0.0) {
                return refus(format!("conducteur {} : ecart nul au precedent", k + 1));
            }
            x + places[places.len() - 1].w_nue / 2.0 + ecart + w / 2.0
        } else {
            0.0
        };
        let t = cond.t.unwrap_or(epaisseur);
        places.push(Place {
            x: centre,
            w_nue: w,
            rang: k,
            w: elargir(w, t),
            // UNE PISTE DE GARDE EST UN CONDUCTEUR TENU A ZERO
            // VOLT, et rien d'autre : elle entre dans la matrice
            // comme les plans coplanaires, avec ses panneaux et sa
            // condition aux limites, mais elle ne porte pas de port
            // et ne sort donc pas dans [C].
            masse: cond.masse,
            // UN CONDUCTEUR FLOTTANT N'EST PAS UNE GARDE. Il occupe
            // la meme place et prend le meme champ, mais sa
            // condition aux limites est l'inverse : la garde a un
            // POTENTIEL impose (zero) et une charge quelconque ; le
            // flottant a une CHARGE imposee (zero) et un potentiel
            // quelconque. C'est ce qui distingue un cuivre de masse
            // cousu de vias d'un cuivre qui ne l'est pas -- et le
            // second ne blinde pas, il transfere.
            flottant: cond.flottant && !cond.masse,
        });
        x = Some(centre);
    }
    // RANGES DE GAUCHE A DROITE, ce que la matrice exige -- les bandes de
    // panneaux se posent dans l'ordre, et l'ecart entre deux conducteurs est
    // celui de deux voisins dans cette liste. `rang` garde le numero d'ENTREE,
    // sans quoi l'appelant ne saurait plus quelle ligne de [C] est sa piste.
    places.sort_by(|a, b| a.x.total_cmp(&b.x));
    // DEUX CONDUCTEURS QUI SE TOUCHENT NE FONT PAS DEUX LIGNES. L'elargissement
    // de Wheeler peut les faire se rejoindre alors que le cuivre ne se touche
    // pas : on le dit plutot que de resoudre une matrice singuliere.
    for p in places.windows(2) {
        let (a, b) = (&p[0], &p[1]);
        let libre = (b.x - b.w / 2.0) - (a.x + a.w / 2.0);
        if libre <= 0.0 {
            return refus(format!(
                "conducteurs trop proches : l'epaisseur de cuivre les fait se toucher ({:.4} mm de cuivre a cuivre)",
                1e3 * ((b.x - b.w_nue / 2.0) - (a.x + a.w_nue / 2.0))
            ));
        }
    }
    Ok(places)
}

/// La matrice de Maxwell [C] de N rubans coplanaires, en F/m.
///
/// `conducteurs` sort de `_conducteurs_places` : (centre, largeur effective).
/// `ecart_g` et `ecart_d` sont les ecarts au cuivre de masse qui borde le
/// GROUPE, a gauche du premier ruban et a droite du dernier ; zero d'un cote
/// veut dire pas de masse coplanaire de ce cote-la, exactement comme pour un
/// conducteur seul.
///
/// Rend un tableau N x N tel que Q = [C] V, ou N est le nombre de
/// conducteurs QUI SONT DES PORTS : ni une piste de garde, ni un cuivre
/// flottant n'ont de ligne dans la matrice -- tous deux occupent la place et
/// prennent du champ, mais on ne leur demande pas leur impedance. Ce qui les
/// separe est leur condition aux limites : la garde a un POTENTIEL impose a
/// zero, le flottant une CHARGE totale imposee a zero.
#[allow(clippy::too_many_arguments)]
pub fn capacitance_matrice(
    conducteurs: &[Place], ecart_g: f64, ecart_d: f64, green: &Green, distance_plan: f64, epsilon_moyen: f64, n: usize,
    n_quadrature: usize, echelles: &[f64], etendue: Option<f64>, n_plan: Option<usize>, symetriser: bool,
) -> Res<Vec<Vec<f64>>> {
    capacitance_matrice_mat(
        conducteurs, ecart_g, ecart_d, green, distance_plan, epsilon_moyen, n, n_quadrature, echelles, etendue, n_plan,
        symetriser,
    )
    .map(|c| alg::vers_listes(&c))
}

#[allow(clippy::too_many_arguments)]
fn capacitance_matrice_mat(
    conducteurs: &[Place], ecart_g: f64, ecart_d: f64, green: &Green, distance_plan: f64, epsilon_moyen: f64, n: usize,
    n_quadrature: usize, echelles: &[f64], etendue: Option<f64>, n_plan: Option<usize>, symetriser: bool,
) -> Res<Mat<f64>> {
    let (g, d) = (ecart_g, ecart_d);
    let (Some(premier), Some(dernier)) = (conducteurs.first(), conducteurs.last()) else {
        return refus("aucun conducteur");
    };
    let gauche = premier.x - premier.w / 2.0;
    let droite = dernier.x + dernier.w / 2.0;
    let etendue = etendue.unwrap_or_else(|| _etendue(green, distance_plan, (droite - gauche) / 2.0 + g.max(d)));
    let n_plan = n_plan.unwrap_or_else(|| _n_plan(green, n));

    let (mut centres, mut largeurs) = (Vec::new(), Vec::new());
    let (mut tranches, mut flottants) = (Vec::new(), Vec::new());
    let mut rang = 0;
    if g > 0.0 {
        let a0 = gauche - g;
        let (cg, wg) = _panneaux_bande(a0 - etendue, a0, n_plan, Serrer::Droite);
        centres.extend(cg);
        largeurs.extend(wg);
        rang += n_plan;
    }
    for cond in conducteurs {
        let (cs, ws) = _panneaux_bande(cond.x - cond.w / 2.0, cond.x + cond.w / 2.0, n, Serrer::Deux);
        centres.extend(cs);
        largeurs.extend(ws);
        // UNE PISTE DE GARDE N'A PAS DE COLONNE : ses panneaux sont dans la
        // matrice et sa tension y vaut zero dans TOUS les seconds membres, ce
        // qui est exactement la condition d'un plan coplanaire. Elle prend du
        // champ aux deux signaux -- c'est tout l'objet d'une garde --, mais on
        // ne lui demande pas son impedance.
        if cond.flottant {
            flottants.push((rang, n));
        } else if !cond.masse {
            tranches.push((rang, n));
        }
        rang += n;
    }
    if d > 0.0 {
        let a0 = droite + d;
        let (cd, wd) = _panneaux_bande(a0, a0 + etendue, n_plan, Serrer::Gauche);
        centres.extend(cd);
        largeurs.extend(wd);
    }

    // LES ECARTS SONT DES LONGUEURS DU PROBLEME, tous : c'est sur eux que le
    // champ varie le plus vite quand ils sont petits devant la hauteur au plan.
    // Celui qui separe deux rubans compte autant que celui qui les separe de la
    // masse -- c'est meme lui qui porte tout le couplage.
    let mut ech = echelles.to_vec();
    ech.extend([g, d].into_iter().filter(|&e| e > 0.0));
    ech.extend(conducteurs.windows(2).map(|p| (p[1].x - p[1].w / 2.0) - (p[0].x + p[0].w / 2.0)).filter(|&e| e > 0.0));

    let mat = _matrice(
        &centres, &largeurs, green, distance_plan, epsilon_moyen, _n_quadrature(n_quadrature, droite - gauche, distance_plan),
        BETA_MAX, &ech,
    );

    // LES N SECONDS MEMBRES D'UN COUP. `np.linalg.solve` factorise la matrice
    // une fois et substitue N fois : c'est exactement la LU reutilisee, sans
    // avoir a sortir de numpy.
    let n_c = tranches.len();
    if n_c == 0 {
        return refus("tous les conducteurs sont a la masse");
    }
    let n_p = centres.len();
    // SANS PLAN, LA MASSE EST CE QUI PORTE LE RETOUR, et il en faut : une
    // bande coplanaire d'un cote au moins, ou une piste de garde tenue a zero.
    // Sans elle, la section neutre n'a pas de reference et [C] serait
    // singuliere -- on le dit plutot que de rendre une matrice sans sens.
    if green.sans_plan() && !(g > 0.0 || d > 0.0 || conducteurs.iter().any(|c| c.masse)) {
        return refus("sans plan et sans masse coplanaire : aucun conducteur ne porte le retour");
    }

    // LE SYSTEME AUGMENTE D'UN CONDUCTEUR FLOTTANT, et c'est exact -- pas
    // une correction. Un cuivre isole n'a ni potentiel impose ni charge
    // libre : c'est l'INVERSE d'une garde. On ajoute donc une inconnue par
    // flottant, son potentiel phi, et une equation, sa charge totale nulle :
    //
    //     sum_k A[m,k] q_k - phi_f = 0   pour chaque panneau m du flottant
    //     sum_{k dans f} w_k q_k   = 0   sa charge totale
    //
    // Le reste du systeme ne bouge pas. C'est la meme discretisation, la
    // meme fonction de Green, et le meme cout a un rang pres. La section sans
    // plan s'ajoute de la meme facon -- voir `_resoudre`.
    let mut tension = Mat::<f64>::zeros(n_p, n_c);
    for (j, &(debut, taille)) in tranches.iter().enumerate() {
        for k in debut..debut + taille {
            tension[(k, j)] = 1.0;
        }
    }
    let charges = _resoudre(&mat, &tension, &largeurs, green, &flottants)?;

    let c = Mat::from_fn(n_c, n_c, |i, j| {
        let (debut, taille) = tranches[i];
        (debut..debut + taille).map(|k| largeurs[k] * charges[(k, j)]).sum::<f64>()
    });
    // LA MATRICE EST SYMETRIQUE PAR CONSTRUCTION PHYSIQUE, et la collocation ne
    // l'est qu'a la discretisation pres : les panneaux ne portent pas tous la
    // meme largeur, et A[m,k] depend de celle de k seule. On symetrise donc,
    // comme le fait tout extracteur. `symetriser=False` rend la matrice BRUTE,
    // et c'est ce que le banc mesure : une asymetrie qui grandirait dirait que
    // la discretisation ne suffit plus, et la symetrisation la cacherait.
    Ok(if symetriser { alg::symetrise(&c) } else { c })
}

/// Un mode propre de la ligne multiconducteurs.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Mode {
    pub eps_eff: f64,
    pub vitesse: f64,
    pub tensions: Vec<f64>,
}

/// Les modes propres de la ligne multiconducteurs.
///
/// [L][C] a pour valeurs propres les 1/v^2 des modes, et pour vecteurs propres
/// leurs distributions de tension. En milieu homogene toutes les vitesses sont
/// egales et il n'y a qu'une valeur propre, N fois : c'est le cas de la
/// triplaque, et c'est ce qui fait qu'elle n'a pas de diaphonie avant.
pub fn _modes(l_mat: &[Vec<f64>], c_mat: &[Vec<f64>]) -> Vec<Mode> {
    let produit = alg::depuis_listes(l_mat) * alg::depuis_listes(c_mat);
    let n = produit.nrows();
    let Ok(propres) = produit.eigen() else { return Vec::new() };
    let valeurs: Vec<f64> = (0..n).map(|k| propres.S()[k].re).collect();
    let mut ordre: Vec<usize> = (0..n).collect();
    ordre.sort_by(|&a, &b| valeurs[a].total_cmp(&valeurs[b]));
    let mut modes = Vec::new();
    for k in ordre {
        // le vecteur propre d'une valeur propre reelle est reel a une phase pres : on la retire
        let col: Vec<num_complex::Complex64> = (0..n).map(|i| propres.U()[(i, k)]).collect();
        let phase = col.iter().copied().fold(num_complex::Complex64::new(0.0, 0.0), |m, z| if z.norm() > m.norm() { z } else { m });
        let mut v: Vec<f64> = col.iter().map(|z| if phase.norm() > 0.0 { (z / phase).re } else { z.re }).collect();
        let mut pic = 0;
        for i in 1..n {
            if v[i].abs() > v[pic].abs() {
                pic = i;
            }
        }
        if v[pic] < 0.0 {
            v.iter_mut().for_each(|x| *x = -*x);
        }
        let vitesse = if valeurs[k] > 0.0 { 1.0 / valeurs[k].sqrt() } else { 0.0 };
        let max_v = v.iter().fold(0.0f64, |m, x| m.max(x.abs()));
        let norm = if max_v > 1e-15 { max_v } else { 1.0 };
        modes.push(Mode { eps_eff: valeurs[k] * C_0 * C_0, vitesse, tensions: v.iter().map(|x| x / norm).collect() });
    }
    modes
}

/// Le detail d'un conducteur de `solve_multiline`.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct LigneCouplee {
    pub w: f64,
    pub x: f64,
    pub z0: f64,
    pub eps_eff: f64,
    pub c: f64,
    pub l: f64,
}

/// Ce que `solve_multiline` rend : [C] et [C0] en F/m, [L] en H/m.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Multiligne {
    pub n: usize,
    pub gardes: usize,
    // QUELLE LIGNE DE [C] EST QUEL CONDUCTEUR. Les rubans sont ranges de
    // gauche a droite pour la matrice ; `ordre[i]` rend le numero d'ENTREE
    // du port i. Sans lui, un appelant qui pose ses conducteurs dans un
    // autre ordre lirait la diaphonie de la mauvaise paire -- en silence.
    pub ordre: Vec<usize>,
    pub c: Vec<Vec<f64>>,
    pub c0: Vec<Vec<f64>>,
    pub l: Vec<Vec<f64>>,
    pub lignes: Vec<LigneCouplee>,
    pub modes: Vec<Mode>,
    pub ecart_g: f64,
    pub ecart_d: f64,
    pub couvert: bool,
    pub ecart_conducteurs: Vec<f64>,
    pub flancs_en_regard: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub masque: Option<Masque>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub paire: Option<Paire>,
}

/// `solve_multiline(geometry)` avec les 120 panneaux et les 300 points de quadrature par defaut.
pub fn solve_multiline(geometry: &Geometrie) -> Res<Multiligne> {
    solve_multiline_avec(geometry, N_PANNEAUX, N_QUADRATURE)
}

/// Resout une section a N conducteurs. Meme `geometry` que `solve_line`.
///
/// `geometry["conducteurs"]` remplace `w` : une liste de {w, x} ou {w, s}, en
/// METRES, chacun pouvant porter `masse` a vrai pour etre une PISTE DE GARDE
/// -- dans la matrice, a zero volt, mais sans port. `ecart_g` / `ecart_d` bordent le GROUPE, comme pour une ligne
/// seule ; tout le reste de la section -- kind, h, b, y0, couverture, masque,
/// epsilon_r -- se lit exactement comme dans `solve_line`, et par le meme
/// `_milieu`.
///
/// Rend {n, c, c0, l, lignes, modes, paire, ecart_g, ecart_d} : [C] et [C0] en
/// F/m, [L] en H/m, `lignes` le detail conducteur par conducteur, `paire` les
/// grandeurs differentielles quand il y en a exactement deux.
pub fn solve_multiline_avec(geometry: &Geometrie, n: usize, n_quadrature: usize) -> Res<Multiligne> {
    let conducteurs = &geometry.conducteurs;
    if conducteurs.len() < 2 {
        return refus("une ligne couplee demande au moins deux conducteurs");
    }

    if conducteurs.len() > MAX_CONDUCTEURS {
        return refus(format!("{} conducteurs, maximum {}", conducteurs.len(), MAX_CONDUCTEURS));
    }

    let m = _milieu(geometry)?;
    let t = geometry.t;
    let places = _conducteurs_places(conducteurs, t, |w, ep| _elargir(&m, w, ep))?;
    // NI UNE GARDE NI UN FLOTTANT N'EST UN PORT : on ne demande son impedance
    // ni a l'un ni a l'autre. Les deux occupent la place et prennent du champ,
    // et c'est justement pour cela qu'on les pose.
    let ports: Vec<&Place> = places.iter().filter(|c| !c.masse && !c.flottant).collect();
    if ports.len() < 2 {
        return refus("une ligne couplee demande au moins deux conducteurs qui ne soient ni masses ni flottants");
    }

    // Les ecarts au cuivre de masse, ramenes comme dans `solve_line` : ils sont
    // mesures de cuivre a cuivre, et c'est la largeur EFFECTIVE qui borde le
    // calcul. Sous une epaisseur de cuivre, l'ecart est borne a cette epaisseur
    // (`_ecart_retenu`).
    let (ecart_g, ecart_d) = ecarts_donnes(geometry);
    let seuil = t.max(1e-9);

    let dernier = places.len() - 1;
    let marge_g = (places[0].w - places[0].w_nue) / 2.0;
    let marge_d = (places[dernier].w - places[dernier].w_nue) / 2.0;
    let e_g = _ecart_retenu(ecart_g, marge_g, seuil);
    let e_d = _ecart_retenu(ecart_d, marge_d, seuil);

    let matrice = |pl: &[Place], green: &Green, eps: f64| {
        capacitance_matrice_mat(
            pl,
            _ecart_retenu(ecart_g, (pl[0].w - pl[0].w_nue) / 2.0, seuil),
            _ecart_retenu(ecart_d, (pl[dernier].w - pl[dernier].w_nue) / 2.0, seuil),
            green, m.distance, eps, n, n_quadrature, &m.echelles, None, None, true,
        )
    };

    // DEUX LARGEURS, comme dans `solve_line` (constat 30) : [C0] sur les rubans
    // elargis dans l'air, [C] sur ceux, moins elargis, du dielectrique, et
    // [C] = [C(w_d)] [C0(w)]^-1 [C0(w_d)] -- la formule d'un ruban seul, mode
    // par mode sur une paire symetrique ou les trois matrices commutent.
    // shortcut: sur une section dissymetrique elles ne commutent qu'a peu
    // pres, et l'on symetrise -- verifie sur UN cas a trois conducteurs
    // (banc : eps_eff a 1 %, kC - kL a 6 %) ; a reprendre avec le solveur a
    // cuivre epais.
    let c0 = matrice(&places, &m.g_vide, m.eps_vide)?;
    let part = m.flancs.unwrap_or(1.0);
    let places_d: Vec<Place> = places.iter().map(|pl| Place { w: pl.w_nue + part * (pl.w - pl.w_nue), ..pl.clone() }).collect();
    let mut c = matrice(&places_d, &m.g_diel, m.eps_moyen)?;
    if places_d.iter().zip(&places).any(|(d, pl)| d.w < pl.w) {
        c = &c * alg::resoudre(&c0, &matrice(&places_d, &m.g_vide, m.eps_vide)?)?;
        c = alg::symetrise(&c);
    }
    let n_ports = ports.len();
    if (0..n_ports).any(|i| c[(i, i)] <= 0.0 || c0[(i, i)] <= 0.0) {
        return refus("capacite non physique : geometrie incoherente");
    }

    // [L] = mu0 eps0 [C0]^-1, et rien de plus : le milieu n'est pas magnetique,
    // donc l'inductance est celle de la MEME geometrie sans dielectrique. C'est
    // la seule facon d'obtenir [L] sans un second solveur, et elle est exacte.
    let Some(inv) = alg::inverse(&c0) else {
        return refus("matrice de capacite singuliere : geometrie incoherente");
    };
    let l_mat = Mat::from_fn(n_ports, n_ports, |i, j| MU_0 * EPSILON_0 * inv[(i, j)]);

    let mut lignes = Vec::new();
    for (i, place) in ports.iter().enumerate() {
        // Z0 DU CONDUCTEUR i, LES AUTRES A LA MASSE : c'est ce que la diagonale
        // de Maxwell decrit, et ce n'est PAS l'impedance de la piste seule --
        // une voisine tenue a la masse lui prend du champ. Les deux chiffres
        // sont utiles, celui-ci pour lire la matrice, `solve_line` pour la
        // piste isolee.
        //
        // eps_eff EST C/C0 SUR LA DIAGONALE, comme dans `solve_line`, et pas
        // c^2.L_ii.C_ii. Le second melange les diagonales de deux matrices
        // INVERSES l'une de l'autre -- [L] vient de [C0]^-1 --, et pour une
        // matrice definie positive (A^-1)_ii.A_ii >= 1, avec egalite seulement
        // sans couplage. Il gonflait donc eps_eff d'autant plus que la voisine
        // etait proche : 4,53 au lieu de 4,30 en triplaque a 0,1 mm d'ecart,
        // ou le milieu homogene impose 4,30 EXACTEMENT a tout ecart. Le
        // crosstalk en tire son profil de retard -- l'axe de position de la
        // carte, T_d et Kf.T_d --, qui s'allongeait de 2 a 3 % sur les blocs
        // serres.
        lignes.push(LigneCouplee {
            w: place.w_nue,
            x: place.x,
            z0: (l_mat[(i, i)] / c[(i, i)]).sqrt(),
            eps_eff: c[(i, i)] / c0[(i, i)],
            c: c[(i, i)],
            l: l_mat[(i, i)],
        });
    }

    let (c_l, c0_l, l_l) = (alg::vers_listes(&c), alg::vers_listes(&c0), alg::vers_listes(&l_mat));
    let ecart_conducteurs: Vec<f64> =
        places.windows(2).map(|p| (p[1].x - p[1].w_nue / 2.0) - (p[0].x + p[0].w_nue / 2.0)).collect();
    let mut tous_ecarts = vec![ecart_g, ecart_d];
    tous_ecarts.extend(&ecart_conducteurs);
    let paire = if n_ports == 2 { Some(modes_paire(&c_l, &l_l)?) } else { None };
    Ok(Multiligne {
        n: n_ports,
        gardes: places.len() - n_ports,
        ordre: ports.iter().map(|c| c.rang).collect(),
        modes: _modes(&l_l, &c_l),
        c: c_l,
        c0: c0_l,
        l: l_l,
        lignes,
        ecart_g: e_g,
        ecart_d: e_d,
        couvert: m.couvert,
        flancs_en_regard: _flancs_en_regard(m.flancs, t, &tous_ecarts),
        ecart_conducteurs,
        masque: m.masque,
        paire,
    })
}

/// Ce que `modes_paire` rend.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Paire {
    pub z_impair: f64,
    pub z_pair: f64,
    pub z_diff: f64,
    pub z_commune: f64,
    pub eps_eff_impair: f64,
    pub eps_eff_pair: f64,
    // LA MUTUELLE, EN CLAIR. C_m = -C12 est la capacite entre les deux
    // rubans ; L_m = L12 leur inductance mutuelle. Ce sont elles qui font
    // toute la diaphonie, et les afficher evite d'avoir a inverser les
    // modes pour les retrouver.
    pub c_mutuelle: f64,
    pub l_mutuelle: f64,
    pub k_c: f64,
    pub k_l: f64,
}

/// Les modes pair et impair d'une paire, et ce qu'on en lit.
///
/// LES DEUX MODES, ET RIEN D'AUTRE. Le mode IMPAIR est celui du signal
/// differentiel -- les deux rubans a +V et -V, un plan de symetrie a zero volt
/// entre eux : le couplage capacitif s'AJOUTE (les deux armatures se font
/// face) et le couplage inductif se RETRANCHE. Le mode PAIR est celui du
/// signal commun, et c'est l'inverse.
///
///     L_impair = (L11 + L22)/2 - L12      C_impair = (C11 + C22)/2 - C12
///     L_pair   = (L11 + L22)/2 + L12      C_pair   = (C11 + C22)/2 + C12
///
/// C12 est NEGATIF dans la convention de Maxwell : « - C12 » ajoute donc bien
/// la mutuelle au mode impair. La moyenne des deux diagonales est ce qui rend
/// la formule utilisable sur une paire LEGEREMENT dissymetrique -- deux pistes
/// de largeurs voisines ; sur une paire franchement asymetrique, ce sont les
/// modes propres de `_modes` qu'il faut lire, et rien d'autre.
///
///     Z_diff = 2 Z_impair       Z_commune = Z_pair / 2
///
/// Le facteur deux n'est pas une convention d'affichage : la tension
/// differentielle est celle qui existe ENTRE les deux conducteurs, soit deux
/// fois celle de chacun au plan de symetrie.
pub fn modes_paire(c_mat: &[Vec<f64>], l_mat: &[Vec<f64>]) -> Res<Paire> {
    let c11 = 0.5 * (c_mat[0][0] + c_mat[1][1]);
    let l11 = 0.5 * (l_mat[0][0] + l_mat[1][1]);
    let (c12, l12) = (c_mat[0][1], l_mat[0][1]);
    let (c_impair, c_pair) = (c11 - c12, c11 + c12);
    let (l_impair, l_pair) = (l11 - l12, l11 + l12);
    if !(c_impair > 0.0 && c_pair > 0.0 && l_impair > 0.0 && l_pair > 0.0) {
        return refus("modes non physiques : matrices incoherentes");
    }
    let z_impair = (l_impair / c_impair).sqrt();
    let z_pair = (l_pair / c_pair).sqrt();
    Ok(Paire {
        z_impair,
        z_pair,
        z_diff: 2.0 * z_impair,
        z_commune: z_pair / 2.0,
        eps_eff_impair: C_0 * C_0 * l_impair * c_impair,
        eps_eff_pair: C_0 * C_0 * l_pair * c_pair,
        c_mutuelle: -c12,
        l_mutuelle: l12,
        k_c: -c12 / c11,
        k_l: l12 / l11,
    })
}

/// Deux conducteurs d'une section a N, LES AUTRES TENUS A LA MASSE.
///
/// Rend (C, L) du systeme reduit -- de quoi appeler `modes_paire` ou
/// `diaphonie` sur une paire prise dans un bus.
///
/// POURQUOI C'EST EXACT, ET PAS UNE APPROXIMATION. Tenir un conducteur a zero
/// volt, c'est exactement ce que fait un plan de reference : la matrice de
/// Maxwell des conducteurs restants est alors la SOUS-MATRICE de [C] -- il
/// suffit d'ecrire Q_i = somme_j C_ij V_j avec V_k = 0 pour les autres. Et
/// l'inductance suit : [L] = mu0 eps0 [C0_sous]^-1, ou C0_sous est la meme
/// sous-matrice prise a vide. Le conducteur mis a la masse porte alors du
/// courant de retour, ce qui est precisement ce qu'on suppose de lui.
///
/// CE QUE CETTE HYPOTHESE VAUT, et il faut la dire la ou on l'emploie : une
/// troisieme piste TERMINEE sur son impedance n'est pas une piste a la masse.
/// L'ecart est du second ordre pour un couplage faible -- c'est la convention
/// de tous les extracteurs --, mais c'en est un.
#[allow(clippy::type_complexity)]
pub fn sous_systeme(c_mat: &[Vec<f64>], c0_mat: &[Vec<f64>], indices: &[usize]) -> Res<(Vec<Vec<f64>>, Vec<Vec<f64>>)> {
    let sous = |m: &[Vec<f64>]| -> Vec<Vec<f64>> { indices.iter().map(|&i| indices.iter().map(|&j| m[i][j]).collect()).collect() };
    let c_sous = sous(c_mat);
    let c0_sous = sous(c0_mat);
    let Some(inv) = alg::inverse(&alg::depuis_listes(&c0_sous)) else {
        return refus("sous-matrice de capacite singuliere");
    };
    let l_sous = alg::vers_listes(&Mat::from_fn(inv.nrows(), inv.ncols(), |i, j| MU_0 * EPSILON_0 * inv[(i, j)]));
    Ok((c_sous, l_sous))
}

// ==========================================================================
// DEUX NIVEAUX : DES RUBANS A DES HAUTEURS DIFFERENTES
// --------------------------------------------------------------------------
// Deux pistes de couches voisines sans plan entre elles se couplent par leur
// LARGEUR, face a face : c'est la le couplage le plus fort d'une carte, et le
// fil fin des images (rayon w/4) le connait mal des que les pistes se
// superposent. Ici chaque ruban est decoupe en panneaux a SA hauteur, et la
// fonction de Green est celle d'une charge lineique en milieu homogene :
//
//   un plan (y = 0)        phi = 1/(4 pi eps) . ln[(dx2+(y+y')2) / (dx2+(y-y')2)]
//   deux plans (0 et b)    phi = 1/(4 pi eps) . ln[(ch(pi dx/b) - cos(pi(y+y')/b))
//                                                 / (ch(pi dx/b) - cos(pi(y-y')/b))]
//
// la seconde est la serie des images entre deux plans, sommee. Sur un meme
// niveau, la partie en 2.ln|dx| s'integre exactement sur chaque panneau, et le
// reste, lisse, a la quadrature.
//
// CE QUE LE MILIEU HOMOGENE VEUT DIRE : un seul diélectrique entre les plans.
// Le couplage Kb n'en depend alors pas (Kf est nul), et c'est le cas de deux
// couches internes entre deux plans. Une paire de couches EXTERIEURES, avec
// de l'air au-dessus, est un milieu stratifie : le resultat y reste une
// estimation, du meme ordre que celle des images, mais resolue en largeur.
// ==========================================================================

/// ln(cosh a - cos c) sans debordement pour |a| grand.
pub fn _ln_ch_moins_cos(a: f64, c: f64) -> f64 {
    let a = a.abs();
    a + (0.5 * (1.0 + (-2.0 * a).exp()) - c.cos() * (-a).exp()).ln()
}

/// ln(ch(pi dx/b) - 1) - 2 ln|dx| : la partie lisse du noyau sur un niveau.
pub fn _reste_meme_niveau(dx: f64, b: f64) -> f64 {
    let t = PI * dx.abs() / (2.0 * b);
    let ts = t.max(1e-300);
    let lsh = if t < 1e-3 {
        t * t / 6.0
    } else if t > 20.0 {
        ts - (2.0 * ts).ln()
    } else {
        (ts.min(20.0).sinh() / ts).ln()
    };
    2.0f64.ln() + 2.0 * ((PI / (2.0 * b)).ln() + lsh)
}

/// Un ruban fin de `section_deux_niveaux` : centre, hauteur au-dessus du plan du bas, largeur.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Ruban {
    pub x: f64,
    pub y: f64,
    pub w: f64,
}

/// [C] en F/m et [L] en H/m de `section_deux_niveaux`, dans l'ordre d'entree.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct DeuxNiveaux {
    pub c: Vec<Vec<f64>>,
    pub l: Vec<Vec<f64>>,
}

/// [C] et [L] de rubans fins a des hauteurs quelconques, en milieu homogene.
///
/// `conducteurs` : [{x, y, w}] en metres -- centre, hauteur au-dessus du plan
/// du bas, largeur. `b` : ecart entre les deux plans, ou None pour un plan
/// seul. Rend {"c", "l"} en F/m et H/m, dans l'ordre d'entree.
///
/// LES PANNEAUX SUIVENT UN COSINUS, pas l'exposant 1,5 de `_panneaux_bande` :
/// la charge d'un ruban fin diverge en 1/racine a ses aretes, et c'est
/// exactement la densite de Tchebychev. Mesure en triplaque contre Cohn
/// (exact) : 0,05 % a 20 panneaux, la ou l'exposant 1,5 en laisse 1,2 %.
///
/// Les defauts du Python : `epsilon_r` 1, `n` 30 panneaux, `n_gauss` 8.
pub fn section_deux_niveaux(conducteurs: &[Ruban], b: Option<f64>, epsilon_r: f64, n: usize, n_gauss: usize) -> Res<DeuxNiveaux> {
    let t: Vec<f64> = (0..=n).map(|i| 0.5 * (1.0 - (PI * i as f64 / n as f64).cos())).collect();
    let (mut xc, mut wp, mut yc, mut qui) = (Vec::new(), Vec::new(), Vec::new(), Vec::new());
    for (k, cd) in conducteurs.iter().enumerate() {
        let (w, y) = (cd.w, cd.y);
        if !(w > 0.0 && y > 0.0 && b.is_none_or(|b| y < b)) {
            return refus(format!("conducteur {} : largeur ou hauteur hors du domaine", k + 1));
        }
        let x0 = cd.x;
        let bords: Vec<f64> = t.iter().map(|&t| x0 - w / 2.0 + w * t).collect();
        xc.extend(bords.windows(2).map(|p| 0.5 * (p[1] + p[0])));
        wp.extend(bords.windows(2).map(|p| p[1] - p[0]));
        yc.extend(std::iter::repeat_n(y, n));
        qui.extend(std::iter::repeat_n(k, n));
    }
    let table = _leggauss(n_gauss);
    let (g, pg) = (&table.0, &table.1);
    let np_ = xc.len();
    // le noyau direct d'un meme niveau peut toucher ln 0 : il est remplace
    // plus bas par son integrale exacte
    let prim = |u: f64| if u == 0.0 { 0.0 } else { u * u.abs().ln() - u };
    let a = Mat::from_fn(np_, np_, |i, j| {
        // points de Gauss de chaque panneau source
        let som = yc[i] + yc[j];
        let dif = yc[i] - yc[j];
        let meme = (yc[i] - yc[j]).abs() < 1e-12;
        let (mut s_image, mut s_direct, mut s_reste) = (0.0, 0.0, 0.0);
        for q in 0..n_gauss {
            let xg = xc[j] + 0.5 * wp[j] * g[q];
            let poids = 0.5 * wp[j] * pg[q];
            let dx = xc[i] - xg;
            let (image, direct) = match b {
                None => ((dx * dx + som * som).ln(), (dx * dx + dif * dif).ln()),
                Some(b) => (_ln_ch_moins_cos(PI * dx / b, PI * som / b), _ln_ch_moins_cos(PI * dx / b, PI * dif / b)),
            };
            s_image += image * poids;
            if meme {
                if let Some(b) = b {
                    s_reste += _reste_meme_niveau(dx, b) * poids;
                }
            } else {
                s_direct += (image - direct) * poids;
            }
        }
        // MEME NIVEAU : 2 ln|dx| exact sur le panneau, le reste en quadrature
        let v = if meme {
            let u1 = (xc[j] - wp[j] / 2.0) - xc[i];
            let u2 = (xc[j] + wp[j] / 2.0) - xc[i];
            let exact = 2.0 * (prim(u2) - prim(u1));
            s_image - (exact + s_reste)
        } else {
            s_direct
        };
        v / (4.0 * PI * EPSILON_0)
    });
    let nc = conducteurs.len();
    let v = Mat::from_fn(np_, nc, |i, k| if qui[i] == k { 1.0 } else { 0.0 });
    let sigma = alg::resoudre(&a, &v)?; // par unite d'eps_r
    let c0 = Mat::from_fn(nc, nc, |i, j| (0..np_).filter(|&p| qui[p] == i).map(|p| sigma[(p, j)] * wp[p]).sum::<f64>());
    let c0 = alg::symetrise(&c0);
    let Some(inv) = alg::inverse(&c0) else {
        return refus("Singular matrix");
    };
    Ok(DeuxNiveaux {
        c: alg::vers_listes(&Mat::from_fn(nc, nc, |i, j| epsilon_r * c0[(i, j)])),
        l: alg::vers_listes(&Mat::from_fn(nc, nc, |i, j| MU_0 * EPSILON_0 * inv[(i, j)])),
    })
}
