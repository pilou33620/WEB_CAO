// ==========================================================================
// Du tronçon aux paramètres S
// --------------------------------------------------------------------------
// Un tracé n'est pas une ligne unique : il change de largeur, il change de
// couche. Chaque tronçon est une ligne uniforme, dont la matrice ABCD est
// exacte ; les mettre bout à bout, c'est multiplier les matrices. La matrice S
// s'en déduit sur l'impédance de référence des ports.
//
// C'est exact POUR CE MODÈLE : une suite de lignes uniformes. Ce qui se passe
// au raccord — la discontinuité elle-même, sa capacité parasite — n'y est pas.
// ==========================================================================

use crate::alg;
use crate::pertes::resistance_surface;
use crate::{refus, Res, C_0, EPSILON_0, MU_0};
use faer::Mat;
use num_complex::Complex64;
use serde::Serialize;
use std::f64::consts::PI;

/// Une matrice 2 x 2 complexe : ABCD d'un troncon, ou S d'un deux-ports.
pub type Abcd = [[Complex64; 2]; 2];

const J: Complex64 = Complex64::new(0.0, 1.0);

fn c(x: f64) -> Complex64 {
    Complex64::new(x, 0.0)
}

/// Le produit de deux matrices ABCD : la mise en cascade (`a @ b` de numpy).
pub fn produit_abcd(a: &Abcd, b: &Abcd) -> Abcd {
    [
        [a[0][0] * b[0][0] + a[0][1] * b[1][0], a[0][0] * b[0][1] + a[0][1] * b[1][1]],
        [a[1][0] * b[0][0] + a[1][1] * b[1][0], a[1][0] * b[0][1] + a[1][1] * b[1][1]],
    ]
}

/// `np.eye(2, dtype=complex)`
pub fn abcd_identite() -> Abcd {
    [[c(1.0), c(0.0)], [c(0.0), c(1.0)]]
}

// ==========================================================================
// Les discontinuités, modélisées en éléments localisés
// --------------------------------------------------------------------------
// LOT 3b : à 5 GHz le via et le coude ne sont plus négligeables. Les modèles
// sont analytiques et valent mieux que rien — même si le 2,5D les rendrait mieux.
// ==========================================================================

/// Le coude de microruban en T : (L serie, C shunt), en SI.
///
/// LE MODELE DE GUPTA, celui de Microstrip Lines and Slotlines, et non une
/// formule inventee. Ce qui etait ecrit ici avant -- « C(fF) = 0,5 W(mm)
/// racine(er) », donnee pour du Gupta -- n'avait ni la hauteur au plan, qui
/// est le parametre DOMINANT, ni l'angle : un coude a dix degres pesait autant
/// qu'un coude a angle droit.
///
///     w/h < 1 :  C/w = [(14 er + 12,5) w/h - (1,83 er - 2,25)]/racine(w/h)
///                      + 0,02 er/(w/h)
///     w/h >= 1 : C/w = (9,5 er + 1,25) w/h + 5,2 er + 7,0     [pF/m]
///     L/h = 100 (4 racine(w/h) - 4,21)                        [nH/m]
///
/// L'ANGLE. Gupta est publie pour l'angle DROIT, et lui seul. La reactance
/// d'exces s'annule a angle nul et croit avec l'angle ; on interpole donc
/// lineairement en theta/90. Ce n'est pas Gupta, c'est une interpolation entre
/// Gupta et zero -- et il faut le lire ainsi.
///
/// Rend (L, C) en henrys et en farads. C'est la MEME fonction qui sert au
/// calcul et a l'affichage : deux formules pour la meme grandeur, c'est deux
/// chiffres differents dans la meme fiche.
pub fn elements_coude(w: f64, h: f64, epsilon_r: f64, angle_deg: f64) -> (f64, f64) {
    let (w_m, h_m, er) = (w, h, epsilon_r);
    let theta = angle_deg.abs();
    if !(w_m > 0.0 && h_m > 0.0) || theta <= 0.0 {
        return (0.0, 0.0);
    }

    let u = w_m / h_m;
    let c_sur_w = if u < 1.0 {
        // LE CROCHET ENTIER SE DIVISE PAR racine(w/h) (2.10.0). Jusqu'a la
        // 2.9.0 seul le second terme l'etait, et le terme en 0,02 er/(w/h)
        // manquait : 0,2 fF pour 5,7 sur 0,3 mm a 1,6 mm du plan.
        ((14.0 * er + 12.5) * u - (1.83 * er - 2.25)) / u.sqrt() + 0.02 * er / u
    } else {
        (9.5 * er + 1.25) * u + 5.2 * er + 7.0
    };
    let c = c_sur_w.max(0.0) * 1e-12 * w_m; // pF/m * m -> F

    let l_sur_h = 100.0 * (4.0 * u.sqrt() - 4.21);
    let l = l_sur_h.max(0.0) * 1e-9 * h_m; // nH/m * m -> H

    let part = theta.min(180.0) / 90.0;
    (l * part, c * part)
}

/// Regle de pouce des manuels pour un via traversant, en henrys. EN METRES.
///
/// ELLE N'EST PLUS DANS LE CHEMIN DE CALCUL, et il faut savoir pourquoi. Ce
/// n'est ni une self partielle ni une inductance de boucle : c'est la self
/// partielle de Grover -- (mu0 h/2pi)[ln(4h/d) - 1] -- ou le -1 a ete remplace
/// par +1. L'ecart, mu0 h/pi, est le retour implicite qu'elle contient sans le
/// dire, et il vaut pres du double sur un via ordinaire (1,295 nH annonces
/// pour 0,703 de self reelle).
///
/// Ce que la chaine emploie desormais : `inductance_boucle_vias` quand des
/// vias de masse referment le courant, `inductance_partielle_propre` sinon --
/// et cette derniere est alors annoncee comme un PLANCHER, pas comme une
/// mesure. On garde celle-ci parce qu'elle est la valeur que citent les
/// manuels et qu'il faut pouvoir s'y comparer.
///
///     L = (mu0 h / 2pi) [ln(4h/d) + 1]
///
/// `h` est la hauteur traversee, `d` le diametre du percage. Le rapport h/d
/// est sans dimension, donc le logarithme survit a une erreur d'unite -- mais
/// le prefacteur mu0*h, lui, non : appeler ceci en millimetres rend une
/// inductance MILLE FOIS trop grande, et le resultat reste plausible a l'oeil.
pub fn inductance_via(h: f64, d: f64) -> f64 {
    let (h_m, d_m) = (h, d);
    if !(h_m > 0.0 && d_m > 0.0) {
        return 0.0;
    }
    (MU_0 * h_m / (2.0 * PI)) * ((4.0 * h_m / d_m).ln() + 1.0)
}

/// Capacite parasite pastille/plan, en farads. TOUT EN METRES.
///
/// Plan parallele avec un coefficient de bord de 0,8. Meme avertissement
/// d'unite que `inductance_via`, et il est pire ici : C va comme d^2/h, donc
/// une saisie en millimetres se trompe d'un facteur mille.
pub fn capacite_pastille(d_pastille: f64, h: f64, epsilon_r: f64) -> f64 {
    let (d, h_m, er) = (d_pastille, h, epsilon_r);
    if !(d > 0.0 && h_m > 0.0) {
        return 0.0;
    }
    0.8 * EPSILON_0 * er * (PI * (d / 2.0) * (d / 2.0)) / h_m
}

/// Matrice ABCD d'un via : reseau en pi, C/2 - L - C/2. TOUT EN METRES.
pub fn abcd_via(h: f64, d: f64, d_pastille: f64, epsilon_r: f64, freq: f64) -> Abcd {
    let l = inductance_via(h, d);
    let cap = capacite_pastille(d_pastille, h, epsilon_r) / 2.0;

    let omega = 2.0 * PI * freq;
    let z = J * omega * l;
    let y = J * omega * cap;

    // Le pi exact : [1 0; Y 1] [1 Z; 0 1] [1 0; Y 1]
    [[1.0 + z * y, z], [y * (2.0 + z * y), 1.0 + z * y]]
}

// ==========================================================================
// L'INDUCTANCE D'UN VIA N'EXISTE PAS TOUTE SEULE
// --------------------------------------------------------------------------
// CE QUE `inductance_via` CALCULE, ET POURQUOI CE N'EST PAS LA BONNE GRANDEUR.
// Elle rend une inductance PARTIELLE PROPRE : celle d'un conducteur seul, sans
// dire par ou le courant revient. Or un courant revient toujours, et c'est la
// SURFACE DE BOUCLE qu'il enferme qui porte l'inductance. Un via de signal avec
// son via de masse a 0,4 mm et le meme via avec son retour a 3 mm n'ont pas la
// meme inductance -- ils en ont dans un rapport de deux et demi -- et rien dans
// une self partielle ne peut le voir.
//
// CE QUE CELA CHANGE, MESURE. Sur 1,54 mm de hauteur et 0,25 mm de percage, la
// self partielle de `inductance_via` donne 1,295 nH. L'inductance de boucle vaut
// 0,616 nH avec un retour a 0,4 mm et 1,252 nH avec un retour a 3 mm. La self
// partielle ne tombe juste pour aucun ecartement utile.
//
// POURQUOI LA FORME EXACTE ET NON L'APPROXIMATION. La formule qu'on lit partout,
// L = (mu0 h / pi) ln(2s/d), suppose h >> s : un conducteur long devant
// l'ecartement. Sur une carte, h vaut 1,5 mm et s vaut 0,6 mm -- le rapport
// vaut 2,6, l'hypothese est fausse, et elle coute 21 % ; a 3 mm d'ecart elle en
// coute 56, toujours en surestimant. On prend donc la forme exacte de Grover,
// valable a tout rapport h/s : mesuree contre l'approximation a h/s = 257, elle
// la rejoint a 0,2 %, et l'approximation n'est plus qu'un cas limite qu'elle
// contient.
//
// LE RAYON GEOMETRIQUE MOYEN EST LE RAYON, ET NON 0,7788 r. Un conducteur
// parcouru uniformement a pour RGM r*exp(-1/4) ; un conducteur en regime de peau
// porte tout son courant en surface et a pour RGM le rayon lui-meme. Au-dessus
// de quelques megahertz un via est dans le second cas -- l'ecart vaut un quart
// sur le logarithme, soit 8 % sur L, toujours dans le sens qui rassure.
// ==========================================================================

/// La primitive de Grover : F(u) = u*asinh(u/d) - sqrt(u^2 + d^2).
///
/// Elle n'a d'interet qu'assemblee par `mutuelle_partielle` ; isolee, elle n'a
/// pas de sens physique. `d` est une distance STRICTEMENT positive.
pub fn _grover_f(u: f64, d: f64) -> f64 {
    u * (u / d).asinh() - (u * u + d * d).sqrt()
}

/// Mutuelle partielle de deux filaments PARALLELES, en henrys. EN METRES.
///
/// Le premier occupe l'intervalle [z1, z2] sur son axe, le second [z3, z4] sur
/// un axe parallele distant de `d`. Les deux intervalles sont donnes dans le
/// MEME repere : c'est ce qui permet de traiter un via de masse borgne, qui ne
/// couvre qu'une partie de la hauteur du via de signal.
///
///     M = (mu0/4pi) [ F(z4-z1) + F(z3-z2) - F(z4-z2) - F(z3-z1) ]
///
/// C'est la forme exacte, integrale double du noyau de Neumann sur les deux
/// segments. Pour deux filaments de meme longueur h parfaitement en regard elle
/// se reduit a (mu0/2pi)[h*asinh(h/d) - sqrt(h^2+d^2) + d], et pour h >> d a
/// (mu0 h/2pi)[ln(2h/d) - 1] -- l'expression des manuels.
///
/// RECOUVREMENT NUL, MUTUELLE NON NULLE. Deux vias qui ne se font pas face du
/// tout se couplent quand meme, faiblement et par leurs extremites : la formule
/// le rend, et c'est juste. On ne coupe donc rien a la main.
pub fn mutuelle_partielle(z1: f64, z2: f64, z3: f64, z4: f64, d: f64) -> Res<f64> {
    let d = d.abs();
    if d <= 0.0 {
        return refus("mutuelle_partielle : distance nulle entre deux axes");
    }
    Ok((MU_0 / (4.0 * PI)) * (_grover_f(z4 - z1, d) + _grover_f(z3 - z2, d) - _grover_f(z4 - z2, d) - _grover_f(z3 - z1, d)))
}

/// Self partielle d'un filament cylindrique [z1, z2], en henrys. EN METRES.
///
/// C'est `mutuelle_partielle` du segment avec lui-meme, prise a la distance du
/// RAYON GEOMETRIQUE MOYEN. En regime de peau -- tout via au-dessus de quelques
/// megahertz -- le RGM d'un cylindre plein vaut son rayon : le courant est
/// entierement en surface.
///
/// UNE SEULE FORMULE POUR LA SELF ET LA MUTUELLE, et c'est voulu : deux
/// expressions pour deux membres du meme systeme lineaire, c'est une matrice
/// qui cesse d'etre coherente sans que rien ne le signale.
pub fn inductance_partielle_propre(z1: f64, z2: f64, rayon: f64) -> Res<f64> {
    let r = rayon.abs();
    if r <= 0.0 {
        return refus("inductance_partielle_propre : rayon nul");
    }
    mutuelle_partielle(z1, z2, z1, z2, r)
}

/// Un via de `inductance_boucle_vias` : la position de l'axe, les deux bouts du percage sur
/// cet axe, et le rayon du barreau. EN METRES.
#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub struct Via {
    pub x: f64,
    pub y: f64,
    pub z1: f64,
    pub z2: f64,
    pub rayon: f64,
}

/// L'inductance de boucle d'un via et de ses retours, en henrys. EN METRES.
///
/// `signal` et chaque element de `retours` sont des dicts
/// {x, y, z1, z2, rayon} : la position de l'axe, les deux bouts du percage sur
/// cet axe, et le rayon du barreau.
///
/// LA REPARTITION DU COURANT N'EST PAS IMPOSEE, ELLE EST CALCULEE, et c'est
/// tout l'interet. Le via de signal porte +1 A ; les vias de retour se
/// partagent -1 A, en proportions a_k inconnues. A haute frequence le courant
/// se distribue de facon a MINIMISER L'ENERGIE MAGNETIQUE -- c'est-a-dire
/// l'inductance de boucle elle-meme. On resout donc
///
///     minimiser   L(a) = L_ss - 2 b.a + a.M.a     sous   somme(a_k) = 1
///
/// ou M est la matrice des inductances partielles des retours entre eux et
/// b_k la mutuelle du signal au retour k. C'est un systeme lineaire sous
/// contrainte, resolu par un multiplicateur de Lagrange -- pas une iteration,
/// pas une heuristique.
///
/// POURQUOI PAS « LE PLUS PROCHE ». Prendre le seul via le plus proche
/// surestime L des qu'il y en a d'autres qui aident ; le prendre comme unique
/// retour quand il est mal place la sous-estime. Et surtout, trois vias a
/// 0,6 mm ne divisent PAS L par trois : la mutuelle entre les retours eux-memes
/// les empeche de travailler independamment. C'est ce que la matrice M porte,
/// et c'est ce qu'aucune somme de contributions separees ne peut rendre.
///
/// UN a_k NEGATIF EST UNE REPONSE, PAS UNE ERREUR. Un via de retour peut se
/// trouver dans une position ou le courant s'y inverse ; c'est physique, et
/// c'est le signe qu'il ne sert pas ce via-la. On le rend tel quel plutot que
/// de le forcer a zero -- un chiffre corrige en silence est un chiffre faux.
///
/// LA LIMITE HAUTE FREQUENCE EST LA BONNE ICI. Le partage minimise l'energie
/// magnetique, ce qui suppose que l'inductance domine la resistance. Sur un via
/// metallise ordinaire, omega*L passe R des quelques centaines de kilohertz, et
/// vaut plusieurs centaines de fois R a 200 MHz : l'hypothese est acquise
/// partout ou ce modele sert.
///
/// LE COURANT DOIT SE REFERMER, ET C'EST UNE CONDITION, PAS UN DETAIL. Une
/// inductance de boucle n'est definie que pour un courant a divergence nulle :
/// ce qui descend par le via de signal doit remonter INTEGRALEMENT par les
/// retours, sur la MEME hauteur. Un via de masse borgne qui ne couvre que la
/// moitie de la hauteur ne referme rien -- le reste du chemin passe par le
/// cuivre des plans, que ce modele ne represente pas. Nourrir la formule avec
/// lui rend un nombre, et ce nombre est PLUS PETIT que la verite : on mesure
/// -18 % sur un retour a mi-hauteur. C'est le pire des defauts possibles,
/// puisqu'il flatte. On refuse donc, plutot que de le rendre.
///
/// Chaque retour est donc RECADRE sur la hauteur du via de signal, et doit la
/// couvrir entierement. Celui qui ne la couvre pas leve `ValueError` : c'est a
/// l'appelant de l'ecarter et de dire pourquoi.
///
/// Rend (L_boucle, parts) : l'inductance en henrys, et la liste des a_k dans
/// l'ordre des `retours`. Sans aucun retour, rend la self partielle du via de
/// signal et une liste vide -- la seule chose qu'on puisse dire alors.
///
/// Le defaut du Python : `minimum_ecart` = 1e-6.
pub fn inductance_boucle_vias(signal: &Via, retours: &[Via], minimum_ecart: f64) -> Res<(f64, Vec<f64>)> {
    let r_s = signal.rayon;
    let (mut z1s, mut z2s) = (signal.z1, signal.z2);
    if z2s < z1s {
        (z1s, z2s) = (z2s, z1s);
    }
    let l_ss = inductance_partielle_propre(z1s, z2s, r_s)?;

    let n = retours.len();
    if n == 0 {
        return Ok((l_ss, Vec::new()));
    }

    // Le recadrage, et le refus. La tolerance vaut le micron : c'est la
    // resolution des epaisseurs d'empilage, pas un seuil de jugement.
    let tol = 1e-9;
    for rk in retours {
        let (mut a, mut b) = (rk.z1, rk.z2);
        if b < a {
            (a, b) = (b, a);
        }
        if a > z1s + tol || b < z2s - tol {
            return refus(
                "inductance_boucle_vias : un via de retour ne couvre pas la hauteur du via de signal ; le courant ne se \
                 referme pas et l'inductance de boucle n'est pas definie",
            );
        }
    }

    let ecart = |a: &Via, b: &Via| {
        let d = (a.x - b.x).hypot(a.y - b.y);
        // DEUX AXES CONFONDUS N'ONT PAS DE MUTUELLE FINIE. Cela n'arrive pas sur
        // une carte -- deux vias au meme XY seraient le meme trou -- mais un
        // arrondi de coordonnees peut le produire, et le plancher le dit.
        d.max(minimum_ecart)
    };

    let mut b = vec![0.0; n];
    let mut m = Mat::<f64>::zeros(n, n);
    for (k, rk) in retours.iter().enumerate() {
        b[k] = mutuelle_partielle(z1s, z2s, z1s, z2s, ecart(signal, rk))?;
        m[(k, k)] = inductance_partielle_propre(z1s, z2s, rk.rayon)?;
        for (j, rj) in retours.iter().enumerate().skip(k + 1) {
            let v = mutuelle_partielle(z1s, z2s, z1s, z2s, ecart(rk, rj))?;
            m[(k, j)] = v;
            m[(j, k)] = v;
        }
    }

    // Lagrange : M a = b + (lambda/2) 1, avec 1.a = 1.
    let seconds = Mat::from_fn(n, 2, |i, j| if j == 0 { b[i] } else { 1.0 });
    let a: Vec<f64> = match alg::resoudre(&m, &seconds) {
        Err(_) => {
            // Matrice singuliere : deux retours indiscernables. On retombe sur le
            // seul retour le plus proche, ET ON LE DIT par la liste rendue.
            let mut k = 0;
            for i in 1..n {
                if ecart(signal, &retours[i]) < ecart(signal, &retours[k]) {
                    k = i;
                }
            }
            (0..n).map(|i| if i == k { 1.0 } else { 0.0 }).collect()
        }
        Ok(x) => {
            let mi_b: Vec<f64> = (0..n).map(|i| x[(i, 0)]).collect();
            let mi_1: Vec<f64> = (0..n).map(|i| x[(i, 1)]).collect();
            let denom: f64 = mi_1.iter().sum();
            if denom.abs() < 1e-300 {
                mi_b
            } else {
                let demi_lambda = (1.0 - mi_b.iter().sum::<f64>()) / denom;
                mi_b.iter().zip(&mi_1).map(|(x, u)| x + demi_lambda * u).collect()
            }
        }
    };

    let b_a: f64 = b.iter().zip(&a).map(|(x, y)| x * y).sum();
    let a_m_a: f64 = (0..n).map(|j| (0..n).map(|i| a[i] * m[(i, j)]).sum::<f64>() * a[j]).sum();
    let l_boucle = l_ss - 2.0 * b_a + a_m_a;
    // L'ENERGIE D'UNE BOUCLE EST POSITIVE. Un resultat negatif ne peut venir que
    // d'une geometrie degeneree ; on le refuse plutot que de le cascader.
    if !l_boucle.is_finite() || l_boucle <= 0.0 {
        return Ok((l_ss, vec![0.0; n]));
    }
    Ok((l_boucle, a))
}

// ==========================================================================
// LA CAPACITE D'UN VIA N'EST PAS CELLE DE SES DEUX PASTILLES
// --------------------------------------------------------------------------
// CE QUI MANQUAIT, ET CE QUE CELA COUTAIT. Le modele ne comptait que les deux
// pastilles d'extremite, et il les comptait a la HAUTEUR DU VIA -- 1,54 mm --
// alors qu'une pastille voit le plan qui lui fait face a 0,2 mm. Un facteur
// sept, dans le sens qui rassure. Manquaient en plus, entierement :
//
//   · L'ANTIPAD. Le via traverse les plans qu'il ne touche pas, et chaque plan
//     est perce d'un trou autour de lui. Barreau au centre, bord du trou tout
//     autour : c'est un condensateur coaxial, et il vaut de dix a quarante
//     femtofarads PAR PLAN TRAVERSE.
//   · LES PASTILLES NON FONCTIONNELLES. Sur les couches internes qu'il ne
//     raccorde pas, un via porte -- ou ne porte pas -- une pastille inutile. Si
//     elle est la, c'est elle qui fait face au bord de l'antipad, et non le
//     barreau : le diametre interieur du coaxial passe de 0,25 a 0,55 mm, et la
//     capacite double. C'est le seul parametre de fabrication qui change la
//     capacite d'un via d'un facteur deux, et il ne coute rien a demander.
//
// CE QUE CELA DONNE, MESURE, sur le via traversant du banc : de 4,70 fF a
// 86,8 fF pastilles retirees, 117,1 fF pastilles conservees -- dont 72,4 pour
// les deux seules pastilles d'extremite, ramenees a la distance du plan qu'elles
// regardent. L'impedance caracteristique du via tombe de 525 a 96 ohms :
// invisible a 200 MHz, dominante au-dela de deux gigahertz.
//
// POURQUOI LA FORME LOGARITHMIQUE. La formule industrielle qu'on lit partout,
// C[pF] = 1,41 er T D1/(D2-D1) en pouces, est le coaxial 2 pi eps T/ln(D2/D1)
// ou l'on a remplace ln(D2/D1) par (D2-D1)/D1. C'est la meme chose tant que
// l'antipad serre la pastille ; des que D2 vaut deux fois D1 elle sous-estime de
// 44 %, et sur un antipad de 0,8 mm autour d'un barreau de 0,25 -- ce qui est
// courant sur un via de signal soigne -- d'un facteur 1,9 (3,8 fF annonces pour
// 7,2). On garde donc le logarithme, et la formule industrielle en est le cas
// limite.
// ==========================================================================

/// Capacite barreau-plan a la traversee d'un plan, en farads. EN METRES.
///
///     C = 2 pi eps0 er t / ln(D_antipad / D_interieur)
///
/// `d_interieur` est ce qui fait face au bord du trou : le PERCAGE quand les
/// pastilles non fonctionnelles sont retirees, la PASTILLE quand elles sont
/// conservees. `epaisseur_plan` est celle du cuivre du plan.
///
/// L'EPAISSEUR NUE SOUS-ESTIME, ET ON NE LA CORRIGE PAS. Le champ deborde de
/// part et d'autre du plan sur une distance de l'ordre de l'ecart radial, ce
/// qui ajoute quelques femtofarads qu'on ne compte pas. Le coefficient 1,41 de
/// la formule industrielle les absorbe empiriquement ; on prefere une formule
/// dont on sait ce qu'elle contient a un chiffre ajuste dont on ne sait pas
/// dans quel cas il a ete ajuste. L'erreur va dans le sens qui rassure et elle
/// est nommee, ce qui est la seule chose qui compte.
pub fn capacite_antipad(d_interieur: f64, d_antipad: f64, epaisseur_plan: f64, epsilon_r: f64) -> f64 {
    let (di, da, t, er) = (d_interieur, d_antipad, epaisseur_plan, epsilon_r);
    if !(di > 0.0 && da > di && t > 0.0) {
        return 0.0;
    }
    2.0 * PI * EPSILON_0 * er * t / (da / di).ln()
}

/// Capacite d'une pastille d'extremite au plan qu'elle regarde. EN METRES.
///
/// `h_au_plan` est la distance de la pastille AU PLAN LE PLUS PROCHE, et non la
/// hauteur du via : c'est la correction qui vaut un facteur sept sur un
/// empilage quatre couches ordinaire.
///
/// ELLE COMPTE UN PEU DEUX FOIS, ET DANS LE BON SENS. Une part de ce disque
/// prolonge la piste et se trouve deja dans l'impedance de la ligne. La
/// retrancher demanderait de savoir quelle part du disque la piste couvre, ce
/// que le document d'echange ne porte pas. On la laisse donc entiere : le via
/// en ressort legerement trop capacitif, donc legerement trop desadapte, ce
/// qui est le cote ou une erreur ne fait pas prendre une mauvaise carte pour
/// une bonne.
pub fn capacite_pastille_au_plan(d_pastille: f64, h_au_plan: f64, epsilon_r: f64) -> f64 {
    let (d, h, er) = (d_pastille, h_au_plan, epsilon_r);
    if !(d > 0.0 && h > 0.0) {
        return 0.0;
    }
    0.8 * EPSILON_0 * er * (PI * (d / 2.0) * (d / 2.0)) / h
}

/// Le detail de `capacite_via_complete` : les trois parts en farads.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct DetailCapaciteVia {
    pub antipad: f64,
    pub pastille_depart: f64,
    pub pastille_arrivee: f64,
    pub diametre_interieur: f64,
    pub plans_traverses: usize,
}

/// La capacite totale d'un via, en farads, et son detail. EN METRES.
///
/// `plans_traverses` est la liste des epaisseurs de cuivre des plans que le via
/// TRAVERSE SANS LES TOUCHER -- un par antipad. Les deux `h_pastille_*` sont
/// les distances de chaque pastille d'extremite au plan qui lui fait face, zero
/// quand il n'y en a pas de ce cote-la.
///
/// `pastilles_internes` dit si les pastilles non fonctionnelles sont
/// CONSERVEES. C'est un choix de fabrication, et il double la part d'antipad.
/// A defaut d'information on suppose qu'elles sont RETIREES -- c'est le
/// reglage courant des fondeurs depuis vingt ans, et c'est aussi le choix qui
/// sous-estime, donc celui qu'on doit annoncer plutot que subir.
///
/// Rend (C_totale, detail) ou `detail` porte les trois parts en farads.
#[allow(clippy::too_many_arguments)]
pub fn capacite_via_complete(
    d_percage: f64, d_pastille: f64, d_antipad: f64, epsilon_r: f64, plans_traverses: &[f64], h_pastille_depart: f64,
    h_pastille_arrivee: f64, pastilles_internes: bool,
) -> (f64, DetailCapaciteVia) {
    let d_int = if pastilles_internes { d_pastille } else { d_percage };
    let mut c_anti = 0.0;
    for &t in plans_traverses {
        c_anti += capacite_antipad(d_int, d_antipad, t, epsilon_r);
    }

    let c_dep = capacite_pastille_au_plan(d_pastille, h_pastille_depart, epsilon_r);
    let c_arr = capacite_pastille_au_plan(d_pastille, h_pastille_arrivee, epsilon_r);

    let total = c_anti + c_dep + c_arr;
    let detail = DetailCapaciteVia {
        antipad: c_anti,
        pastille_depart: c_dep,
        pastille_arrivee: c_arr,
        diametre_interieur: d_int,
        plans_traverses: plans_traverses.len(),
    };
    (total, detail)
}

/// Matrice ABCD d'un via a partir de son L de boucle et de son C. EN SI.
///
/// Meme reseau en pi que `abcd_via` -- C/2, L, C/2 -- mais nourri par les deux
/// grandeurs que les paliers 1 et 2 calculent au lieu des deux formules
/// fermees. Les deux fonctions existent, et c'est voulu : `abcd_via` reste le
/// modele de repli quand la page n'envoie ni via de retour ni antipad, et il
/// faut pouvoir comparer les deux sur la meme geometrie.
pub fn abcd_via_boucle(l_boucle: f64, c_totale: f64, freq: f64) -> Abcd {
    let omega = 2.0 * PI * freq;
    let z = J * omega * l_boucle;
    let y = J * omega * c_totale / 2.0;
    [[1.0 + z * y, z], [y * (2.0 + z * y), 1.0 + z * y]]
}

// ==========================================================================
// LE MOIGNON DE VIA, ET LA CAVITE ENTRE PLANS
// --------------------------------------------------------------------------
// LES DEUX CHOSES QUE LE RESEAU EN PI NE DIT PAS, et elles ne se ressemblent
// pas : l'une est un bout de conducteur en trop, l'autre est un chemin de
// retour qui manque.
//
// 1. LE MOIGNON. Un via traversant qui ne sert que de TOP a une couche interne
//    laisse pendre le reste du percage. Ce bout-la n'est raccorde a rien par le
//    bas : c'est un TRONCON DE LIGNE EN CIRCUIT OUVERT, en derivation sur le
//    signal. Sous sa resonance il se comporte comme une capacite -- et pas une
//    petite : 1 mm de moignon vaut 206 fF a 3 GHz, deux fois et demie la
//    capacite du via lui-meme. A sa resonance quart d'onde il devient un
//    COURT-CIRCUIT et efface la liaison ; c'est le defaut qui tue un lien
//    multi-gigabit, et aucune inspection visuelle ne le montre.
//
// 2. LA CAVITE. Quand la reference change -- GND d'un cote du via, PWR de
//    l'autre --, le courant de retour doit passer d'un plan a l'autre. Il ne
//    peut le faire que la ou quelque chose joint les deux : un condensateur de
//    decouplage. La boucle qu'il decrit alors -- descendre par le via, courir
//    dans un plan jusqu'au condensateur, remonter, revenir dans l'autre plan --
//    est une boucle de PAIRE DE PLANS, et son inductance se calcule.
//
//    C'EST CE QUI TRANSFORME UN CONSEIL EN CHIFFRE. Jusqu'ici le modele disait
//    « ne changez pas de reference » et rendait un plancher ; il peut desormais
//    dire combien cela coute, et donc si l'on peut se le permettre.
// ==========================================================================

/// Z0 du coax barreau/antipad, en ohms. EN METRES.
///
///     Z0 = (60 / sqrt(er)) * ln(D_antipad / d_barreau)
///
/// LE MOIGNON EST UN COAX, ET C'EST L'APPROXIMATION DU METIER. Le barreau est
/// l'ame ; le bord de l'antipad, dans chaque plan traverse, est le blindage.
/// Entre deux plans il n'y a pas de blindage a ce rayon-la, et le champ
/// s'evase : on garde quand meme D_antipad sur toute la longueur, ce qui
/// SURESTIME Z0, donc sous-estime la capacite du moignon. L'erreur va dans le
/// sens qui rassure, et c'est pour cela qu'elle est ecrite ici.
///
/// Sur un percage de 0,25 mm dans un antipad de 0,80 en FR-4, Z0 vaut 33,6
/// ohms -- l'ordre de grandeur que donnent les mesures de moignons.
pub fn impedance_moignon(d_barreau: f64, d_antipad: f64, epsilon_r: f64) -> f64 {
    let (d, da, er) = (d_barreau, d_antipad, epsilon_r);
    if !(d > 0.0 && da > d && er > 0.0) {
        return 0.0;
    }
    (60.0 / er.sqrt()) * (da / d).ln()
}

/// Admittance d'entree d'un moignon en circuit ouvert, en siemens. EN SI.
///
///     Y = Y0 * tanh(gamma L),    gamma = j*beta*sqrt(1 - j tan_delta)
///
/// LA CONSTANTE DE PROPAGATION EST COMPLEXE, ET CE N'EST PAS UN DETAIL. Avec
/// un beta purement imaginaire, Y = j Y0 tan(beta L) DIVERGE au quart d'onde :
/// la matrice ABCD devient infinie et la cascade rend n'importe quoi. Ce n'est
/// pas une difficulte numerique a contourner par un plafond arbitraire -- c'est
/// la PERTE qui manque. Un moignon reel a un facteur de qualite fini, de
/// l'ordre de 1/tan_delta, et sa resonance a une profondeur finie. En mettant
/// la perte dans gamma, `tanh` ne diverge jamais et le creux a la bonne
/// profondeur : sur du FR-4 a tan_delta = 0,02, Y culmine a 64 fois Y0.
///
/// ON NEGLIGE LA PERTE DU CONDUCTEUR, et cela SUR-estime le facteur de qualite,
/// donc la profondeur du creux. C'est le sens prudent : on annonce une
/// resonance plus mechante qu'elle ne sera.
pub fn admittance_moignon(longueur: f64, d_barreau: f64, d_antipad: f64, epsilon_r: f64, tan_delta: f64, freq: f64) -> Complex64 {
    let lg = longueur;
    let z0 = impedance_moignon(d_barreau, d_antipad, epsilon_r);
    if !(lg > 0.0 && z0 > 0.0) {
        return c(0.0);
    }
    let omega = 2.0 * PI * freq;
    let beta = omega * epsilon_r.sqrt() / C_0;
    let gamma = J * beta * Complex64::new(1.0, -tan_delta).sqrt();
    (gamma * lg).tanh() / z0
}

/// La frequence quart d'onde d'un moignon, en hertz. LONGUEUR EN METRES.
///
/// C'est LE chiffre a montrer : au-dessous, le moignon est une capacite qu'on
/// peut compenser ; a cette frequence-la, il court-circuite la liaison. Un
/// moignon de 1 mm dans du FR-4 resonne a 36 GHz, un de 1,1 mm a 33 -- et un
/// canal a 25 Gbit/s travaille jusqu'au troisieme harmonique de 12,5 GHz.
pub fn frequence_resonance_moignon(longueur: f64, epsilon_r: f64) -> f64 {
    let lg = longueur;
    if !(lg > 0.0) {
        return f64::INFINITY;
    }
    C_0 / (4.0 * lg * epsilon_r.sqrt())
}

/// Le via entier : le pi L-C, plus un moignon a chaque bout s'il y en a.
///
///     [1 0; Y1+jwC/2 1] [1 Z; 0 1] [1 0; Y2+jwC/2 1]
///
/// LE MOIGNON SE POSE EN DERIVATION AU NOEUD, ET NON EN SERIE. C'est un bout
/// de ligne raccorde au barreau par un bout et ouvert par l'autre : le courant
/// du signal ne le traverse pas, il s'y engage et revient. Le mettre en serie
/// -- l'erreur naturelle -- en ferait un allongement du via, ce qu'il n'est
/// pas : un moignon ne retarde pas le signal, il le charge.
///
/// `y_depart` charge le noeud d'ENTREE, `y_arrivee` celui de sortie : un via
/// traversant utilise de TOP a une couche interne laisse son moignon du cote
/// de la sortie, et l'y mettre du mauvais cote change |S11| sans changer
/// |S21|, donc se voit mal.
///
/// `z_traversee` s'ajoute EN SERIE a l'inductance du via : c'est l'impedance
/// que le retour paie pour changer de plan de reference. Ce n'est pas une
/// inductance -- la cavite entre plans est un L-C, elle resonne -- et c'est
/// pour cela qu'elle arrive ici en impedance complexe deja evaluee a la
/// frequence, et non en henrys. Voir `impedance_traversee_plans`.
pub fn abcd_via_complet(l_boucle: f64, c_totale: f64, freq: f64, y_depart: Complex64, y_arrivee: Complex64, z_traversee: Complex64) -> Abcd {
    let omega = 2.0 * PI * freq;
    let z = J * omega * l_boucle + z_traversee;
    let y_c = J * omega * c_totale / 2.0;
    let y1 = y_c + y_depart;
    let y2 = y_c + y_arrivee;
    // [1 0; y1 1] [1 z; 0 1] [1 0; y2 1]
    let a = 1.0 + z * y2;
    let b = z;
    let cc = y1 + y2 + z * y1 * y2;
    let d = 1.0 + z * y1;
    [[a, b], [cc, d]]
}

/// Les options nommees de `abcd_via_ligne`, avec leurs defauts.
#[derive(Debug, Clone, PartialEq)]
pub struct OptionsViaLigne {
    pub longueur_moignon: f64,
    pub tan_delta: f64,
    /// « arrivee » ou « depart »
    pub cote_moignon: String,
    pub c_depart: f64,
    pub c_arrivee: f64,
    pub pertes_conducteur: bool,
    pub z_via: Option<f64>,
}

impl Default for OptionsViaLigne {
    fn default() -> Self {
        OptionsViaLigne {
            longueur_moignon: 0.0,
            tan_delta: 0.0,
            cote_moignon: "arrivee".into(),
            c_depart: 0.0,
            c_arrivee: 0.0,
            pertes_conducteur: true,
            z_via: None,
        }
    }
}

/// Le via comme un TRONCON DE LIGNE COAXIALE, moignon compris. TOUT EN SI.
///
///     [1 0; Yd 1] . ABCD_ligne(Zc, gamma, longueur) . [1 0; Ya 1]
///
/// CE QUE LE PI NE SAIT PAS. `abcd_via` et `abcd_via_boucle` concentrent le
/// via en C/2 - L - C/2 : juste tant que le via est court devant la longueur
/// d'onde, et muet sur ce qui se passe quand il ne l'est plus. Un barreau de
/// 1,6 mm dans du FR-4 fait un dixieme de longueur d'onde vers 9 GHz ; au-dela
/// le pi derive, et c'est justement la bande des liaisons multi-gigabits. Ici
/// le barreau est une LIGNE : l'ame est le percage, le blindage le bord des
/// antipads -- la meme approximation que `impedance_moignon`, avec les memes
/// reserves (elle surestime Zc entre deux plans).
///
///     L' = (mu0 / 2pi) ln(D/d)          C' = 2pi eps0 er / ln(D/d)
///     R' = Rs (1/(pi d) + 1/(pi D))     G' = omega C' tan_delta
///
/// R' est la perte exacte du coaxial (ame + blindage) ; `pertes_conducteur`
/// l'eteint. `z_via`, s'il est donne, remplace Zc = racine(L'/C') (par un Z0
/// mesure ou calcule ailleurs) en gardant le meme retard racine(er)/c.
///
/// LE MOIGNON se pose EN DERIVATION -- voir `abcd_via_complet` --, du cote
/// `cote_moignon` (« arrivee » ou « depart ») : une ligne de meme Zc et meme
/// gamma, ouverte au bout, d'admittance tanh(gamma l)/Zc. A son quart d'onde
/// elle court-circuite le noeud : c'est la `frequence_resonance_moignon`.
///
/// `c_depart`, `c_arrivee` : capacites de pastille au plan
/// (`capacite_pastille_au_plan`), en derivation a chaque bout.
///
/// A BASSE FREQUENCE, ce modele REJOINT le pi : B -> j omega L' l et
/// C -> j omega C' (l + l_moignon) + pastilles, soit `capacite_antipad` sur
/// toute la longueur du barreau -- le banc le verifie. Il ne remplace pas
/// `abcd_via_complet` (inductance de boucle, traversee de cavite) : il en est
/// le complement pour le haut du spectre.
pub fn abcd_via_ligne(longueur: f64, d_barreau: f64, d_antipad: f64, epsilon_r: f64, freq: f64, o: &OptionsViaLigne) -> Abcd {
    let lg = longueur;
    let lm = o.longueur_moignon.max(0.0);
    let (d, da, er, f) = (d_barreau, d_antipad, epsilon_r, freq);
    if !(d > 0.0 && da > d && er > 0.0 && lg >= 0.0) {
        return abcd_identite();
    }
    let ln_r = (da / d).ln();
    let mut l_p = MU_0 / (2.0 * PI) * ln_r;
    let mut c_p = 2.0 * PI * EPSILON_0 * er / ln_r;
    if let Some(z_via) = o.z_via.filter(|&z| z > 0.0) {
        // Meme retard, autre impedance.
        let v = C_0 / er.sqrt();
        l_p = z_via / v;
        c_p = 1.0 / (z_via * v);
    }
    let omega = 2.0 * PI * f;
    let mut r_p = 0.0;
    if o.pertes_conducteur && f > 0.0 {
        r_p = resistance_surface(f) * (1.0 / (PI * d) + 1.0 / (PI * da));
    }
    if !(f > 0.0) {
        // Le continu : la resistance du barreau, rien d'autre.
        return [[c(1.0), c(r_p * lg)], [c(0.0), c(1.0)]];
    }
    let z_s = Complex64::new(r_p, omega * l_p);
    let y_p = Complex64::new(omega * c_p * o.tan_delta, omega * c_p);
    let zc = (z_s / y_p).sqrt();
    let mut gamma = (z_s * y_p).sqrt();
    if gamma.re < 0.0 {
        gamma = -gamma;
    }
    let m = abcd_line(zc, gamma, lg);

    let y_moignon = if lm > 0.0 { (gamma * lm).tanh() / zc } else { c(0.0) };
    let mut yd = J * omega * o.c_depart;
    let mut ya = J * omega * o.c_arrivee;
    let cote = if o.cote_moignon.is_empty() { "arrivee".to_string() } else { o.cote_moignon.trim().to_lowercase() };
    if cote.starts_with("dep") {
        yd += y_moignon;
    } else {
        ya += y_moignon;
    }
    let gauche = [[c(1.0), c(0.0)], [yd, c(1.0)]];
    let droite = [[c(1.0), c(0.0)], [ya, c(1.0)]];
    produit_abcd(&produit_abcd(&gauche, &m), &droite)
}

/// Matrice ABCD d'un coude : le T de Gupta, L/2 - C - L/2. EN METRES.
///
/// L'ancienne version ne posait qu'un shunt C, ce qui jette la moitie du
/// modele : c'est l'inductance serie qui porte l'essentiel de l'exces au-dela
/// de quelques gigahertz.
pub fn abcd_coude(w: f64, h: f64, epsilon_r: f64, freq: f64, angle_deg: f64) -> Abcd {
    let (l, cap) = elements_coude(w, h, epsilon_r, angle_deg);
    let omega = 2.0 * PI * freq;
    let z = J * omega * l / 2.0; // une moitie de chaque cote
    let y = J * omega * cap;

    // [1 Z; 0 1] [1 0; Y 1] [1 Z; 0 1]
    [[1.0 + z * y, 2.0 * z + z * z * y], [y, 1.0 + z * y]]
}

/// (Zc, gamma) COMPLEXES d'une ligne a pertes, depuis ses grandeurs
/// faibles pertes : Z0 reel, alpha_c et alpha_d en Np/m, beta en rad/m.
///
/// POURQUOI (2.11.0). Poser `abcd_line(Z0, alpha + j beta, l)` avec un Z0
/// REEL decrit une ligne ou R/L = G/C : la perte du cuivre s'y partage par
/// moitie entre une resistance serie et une conductance vers la masse qui
/// n'existe pas. Adaptee, |S21| est juste ; ailleurs non -- en basse
/// frequence le terme serie valait R l / 2 et la ligne fuyait R l/(2 Z0^2)
/// (100 mm de 0,1 mm x 35 um a 1 Hz : 0,246 ohm pour 0,493, et 26,5 kohm vus
/// d'un bout ouvert). On remonte donc aux quatre constantes lineiques,
///
///     R = 2 alpha_c Z0     G = 2 alpha_d / Z0
///     w L = beta Z0        w C = beta / Z0
///
/// et Zc = racine((R + jwL)/(G + jwC)), gamma = racine((R + jwL)(G + jwC)).
/// Quand R << wL et G << wC, c'est Z0 et alpha_c + alpha_d + j beta :
/// Re gamma et Im gamma s'en ecartent de (alpha_c - alpha_d)^2 / (2 beta^2)
/// en valeur relative, Zc de (alpha_c - alpha_d)/beta en phase. Sans pertes,
/// exactement.
pub fn ligne_a_pertes(z0: f64, alpha_c: f64, alpha_d: f64, beta: f64) -> (Complex64, Complex64) {
    let z_s = Complex64::new(2.0 * alpha_c * z0, beta * z0);
    let y_p = Complex64::new(2.0 * alpha_d / z0, beta / z0);
    if z_s == c(0.0) || y_p == c(0.0) {
        return (c(z0), Complex64::new(alpha_c + alpha_d, beta));
    }
    ((z_s / y_p).sqrt(), (z_s * y_p).sqrt())
}

/// Matrice ABCD d'un tronçon de ligne uniforme.
pub fn abcd_line(z_c: Complex64, gamma: Complex64, longueur: f64) -> Abcd {
    let gl = gamma * longueur;
    let (ch, sh) = (gl.cosh(), gl.sinh());
    [[ch, z_c * sh], [sh / z_c, ch]]
}

/// ABCD -> matrice S 2 ports, sur l'impédance de référence.
pub fn cascade_to_s(abcd: &Abcd, z_ref: f64) -> Abcd {
    let (a, b) = (abcd[0][0], abcd[0][1]);
    let (cc, d) = (abcd[1][0], abcd[1][1]);
    let z = z_ref;
    let den = a * z + b + cc * z * z + d * z;
    if den.norm() < 1e-300 {
        return [[c(0.0); 2]; 2];
    }
    let s11 = (a * z + b - cc * z * z - d * z) / den;
    let s12 = 2.0 * (a * d - b * cc) * z / den;
    let s21 = 2.0 * z / den;
    let s22 = (-a * z + b - cc * z * z + d * z) / den;
    [[s11, s12], [s21, s22]]
}
