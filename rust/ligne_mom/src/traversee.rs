//! La traversee entre deux plans : la cavite vue en constantes localisees, ses ponts, et la
//! lecture des parametres de cavite (localises ou modaux).

use crate::cavite::{impedance_cavite_modale_vec, Cavite};
use crate::MU_0;
use num_complex::Complex64;
use std::f64::consts::PI;

const J: Complex64 = Complex64::new(0.0, 1.0);

/// La cavite vue comme un condensateur plan, en farads. EN METRES.
///
/// Elle ne sert PAS a chiffrer le retour -- une paire de plans n'est un
/// condensateur qu'en dessous de sa premiere resonance de cavite, et le retour
/// d'un signal passe par les ponts bien avant. Elle sert a dire ce qu'on a en
/// l'absence de tout pont : c'est ce qui reste, et c'est peu.
pub fn capacite_paire_plans(aire: f64, hauteur_plans: f64, epsilon_r: f64) -> f64 {
    let (a, h) = (aire, hauteur_plans);
    if !(a > 0.0 && h > 0.0) {
        return 0.0;
    }
    crate::EPSILON_0 * epsilon_r * a / h
}

// ==========================================================================
// LA TRAVERSEE ENTRE DEUX PLANS -- CE QUE BOGATIN EN DIT, ET CE QU'ON AVAIT FAUX
// --------------------------------------------------------------------------
// SOURCE : Eric Bogatin, « Signal and Power Integrity -- Simplified », 2e ed.,
// Prentice Hall 2010. Section 7.14 « When Return Paths Switch Reference
// Planes » (p. 244-247) et section 13.14 « Approximating Loop Inductance »
// (p. 653-659, equations 13-31 et 13-35).
//
// DEUX CHOSES QUE LE MODELE PRECEDENT RATAIT, ET ELLES VONT DANS DES SENS
// OPPOSES.
//
// 1. IL FAUT UN PONT -- NON. C'etait l'erreur de fond. Le courant de retour
//    n'attend pas un condensateur de decouplage pour changer de plan : il passe
//    par la PAIRE DE PLANS ELLE-MEME, en courant de deplacement a travers sa
//    capacite. Bogatin le montre en 7.14 : le conducteur du milieu, meme
//    FLOTTANT, porte des courants de Foucault induits qui referment la boucle,
//    et le pilote voit simplement deux lignes en serie -- Z(1-2) + Z(2-3).
//    L'impedance de la paire de plans vaut typiquement quelques ohms, souvent
//    moins d'un ohm. Refuser de chiffrer la traversee faute de condensateur,
//    c'etait declarer impossible ce qui se produit sur toute carte multicouche.
//
// 2. L'ETALEMENT ETAIT QUATRE FOIS TROP PETIT. On employait l'equation 13-31,
//    qui decrit un via central rejoignant un ANNEAU exterieur lointain :
//    L = 5,1 * h[mil] * ln(b/a) pH -- soit exactement mu0/(2 pi) en unites SI.
//    Or le cas d'un via de signal et d'un condensateur est celui de DEUX
//    CONTACTS PONCTUELS, ou le courant s'etale au depart ET se resserre a
//    l'arrivee, dans les DEUX plans. Bogatin lui consacre l'equation 13-35 :
//    L = 21 * h[mil] * ln(B/D) pH, soit environ quatre fois plus. Mesure sur le
//    cas du banc : 1,72 nH au lieu de 0,55.
//
// CE QUI RESTE HORS DE PORTEE, ET LE LIVRE LE DIT AUSSI. Une paire de plans est
// une CAVITE : elle a ses propres resonances, et l'impedance vue depuis un via
// n'est un simple L-C serie qu'en dessous de la premiere. Bogatin : « the only
// accurate way of estimating the impedance profile is with a 3D simulator ».
// On modelise donc le premier ordre, et la fiche dit ou il cesse de valoir.
// ==========================================================================

// Le coefficient de l'equation 13-35, en henrys par metre de separation entre
// plans. Bogatin l'ecrit 21 pH par mil ; en SI cela fait 21e-12 / 25,4e-6.
// Il vaut 4,13 fois mu0/(2 pi), qui est le coefficient du cas a un seul contact
// (equation 13-31).
//
// CE QUE LA FORME FERMEE 2D EN DIT, ET POURQUOI ON GARDE QUAND MEME LE CHIFFRE
// DU LIVRE. Le rapport de 4,13 ne se derive PAS de « deux constrictions au lieu
// d'une » -- c'est ce que ce commentaire affirmait, et c'est faux. Dans la
// limite plans minces (h << s), le probleme est 2D et se resout exactement :
// le champ entre les plaques est celui de deux fils, H = I/(2 pi rho) autour
// de chacun, et le flux embrasse sur la hauteur h vaut
//
//     Phi = mu0 h I / (2 pi) * 2 ln((s - r) / r)   ->   L = (mu0 h / pi) ln(s/r)
//
// soit DEUX fois l'equation 13-31, et non quatre. Le facteur exact de la
// geometrie a deux contacts est 2.
//
// On garde neanmoins 21 pH/mil, pour deux raisons qui se disent :
//   · Le livre ecrit ln(B/D) avec le DIAMETRE, la forme fermee ln(s/r) avec le
//     rayon ; l'ecart de ln(2) reprend une partie du facteur. Net, sur les
//     geometries de ce simulateur, le coefficient du livre rend 1,3 a 1,7 fois
//     la forme fermee 2D -- pas 2.
//   · Le reste va dans le sens PRUDENT. La limite 2D suppose h << s, ce qui
//     cesse d'etre vrai des que le condensateur est proche ; l'ajustement
//     empirique couvre ce que le 2D neglige, et une inductance de traversee
//     surestimee n'a jamais flatte une carte.
//
// La forme fermee reste donc la BORNE INFERIEURE de cette grandeur, et c'est
// `inductance_etalement_via_via_2d` qui la rend, pour qui veut comparer.
pub const COEFF_ETALEMENT_VIA_VIA: f64 = 21.0e-12 / 25.4e-6;

/// Etalement d'un via vers un anneau exterieur lointain. EN METRES.
///
///     L = (mu0 h / 2pi) * ln(b/a)          [Bogatin eq. 13-31]
///
/// C'est le SEUL cas de cette famille qui ait une forme fermee exacte : la
/// symetrie de revolution la donne. Elle decrit le courant qui descend par un
/// via central, s'etale radialement jusqu'a un contact annulaire de rayon `b`,
/// et revient par le plan du dessous.
///
/// ELLE NE DECRIT PAS DEUX VIAS. Pour deux contacts ponctuels, voir
/// `inductance_etalement_via_via` : le courant y subit deux constrictions au
/// lieu d'une, et l'inductance vaut quatre fois plus. Employer celle-ci a la
/// place de l'autre -- ce que faisait la version precedente -- sous-estime d'un
/// facteur trois a quatre.
///
/// On la garde parce qu'elle est la bonne quand le retour se fait vers la
/// cavite ENTIERE plutot que vers un point : c'est le cas quand aucun
/// condensateur ne joint les deux plans et que le courant se referme par la
/// capacite repartie des plans.
pub fn inductance_etalement_via_anneau(hauteur_plans: f64, rayon_via: f64, rayon_exterieur: f64) -> f64 {
    let (h, a, b) = (hauteur_plans, rayon_via, rayon_exterieur);
    if !(h > 0.0 && a > 0.0 && b > a) {
        return 0.0;
    }
    (MU_0 * h / (2.0 * PI)) * (b / a).ln()
}

/// Etalement entre DEUX contacts de via dans une paire de plans. EN METRES.
///
///     L = 21 * h[mil] * ln(B/D) pH         [Bogatin eq. 13-35]
///
/// C'est la geometrie reelle du chemin de retour quand la reference change :
/// le courant descend par le via de signal, s'etale dans le plan du haut, se
/// resserre dans le via du condensateur de decouplage, et revient par le plan
/// du bas. Deux etalements, deux constrictions, deux plans.
///
/// IL N'Y A PAS DE FORME FERMEE EXACTE, et le livre le dit : « There are no
/// exact analytical equations that describe this loop spreading inductance ».
/// Le coefficient est ajuste. On le prend tel quel plutot que de bricoler une
/// derivation qui aurait l'air exacte.
///
/// LE PARAMETRE DOMINANT EST L'ECART ENTRE PLANS, pas la distance au
/// condensateur : L croit lineairement avec `hauteur_plans` et seulement en
/// logarithme avec `ecart`. Rapprocher le decouplage de moitie ne gagne que
/// ln(2) ; amincir le dielectrique entre plans de moitie gagne la moitie. C'est
/// le conseil que la fiche doit porter, et il n'est pas celui qu'on attend.
///
/// Voir `inductance_etalement_via_via_2d` pour la borne inferieure exacte, et
/// le commentaire de `COEFF_ETALEMENT_VIA_VIA` pour ce qui les separe.
pub fn inductance_etalement_via_via(hauteur_plans: f64, ecart: f64, diametre_via: f64) -> f64 {
    let (h, b, d) = (hauteur_plans, ecart, diametre_via);
    if !(h > 0.0 && d > 0.0 && b > d) {
        return 0.0;
    }
    COEFF_ETALEMENT_VIA_VIA * h * (b / d).ln()
}

/// La MEME grandeur, dans la limite plans minces. Forme fermee. EN METRES.
///
///     L = (mu0 h / pi) * ln((s - r) / r)          h << s
///
/// C'est l'integrale exacte du flux entre deux plaques paralleles pour deux
/// contacts ponctuels portant +I et -I : le champ y est celui de deux fils, et
/// le calcul se fait a la main. Elle vaut DEUX fois l'equation 13-31, et c'est
/// le facteur exact de la geometrie a deux contacts.
///
/// ELLE N'EST PAS LA VALEUR RETENUE PAR LE MODELE, et c'est voulu : elle
/// suppose h << s, ce qui cesse d'etre vrai des que le condensateur est
/// proche, et elle neglige alors ce que l'ajustement empirique du livre
/// couvre. Elle sert de BORNE INFERIEURE -- pour verifier que le chiffre
/// retenu reste du bon cote -- et de reference quand on veut savoir ce que
/// l'empirique ajoute.
pub fn inductance_etalement_via_via_2d(hauteur_plans: f64, ecart: f64, diametre_via: f64) -> f64 {
    let (h, s) = (hauteur_plans, ecart);
    let r = diametre_via / 2.0;
    if !(h > 0.0 && r > 0.0 && s > 2.0 * r) {
        return 0.0;
    }
    (MU_0 * h / PI) * ((s - r) / r).ln()
}

/// Impedance caracteristique d'une paire de plans larges. EN METRES.
///
///     Z0 = (377 / sqrt(er)) * h / w         [Bogatin eq. 7-18, h << w]
///
/// C'EST LE CHIFFRE QUI DIT SI LA TRAVERSEE COMPTE. Le pilote voit deux lignes
/// en serie -- celle de la piste a son plan, et celle des deux plans entre eux
/// (section 7.14). Quand la seconde vaut un ohm devant cinquante, le
/// changement de reference ne se voit pas ; quand elle vaut dix, si.
///
/// Sur du FR-4, deux plans de 50 mm de large separes par 1 mm donnent 3,6 ohms ;
/// separes par 0,1 mm, 0,36 ohm. C'est encore l'ecart entre plans qui commande.
pub fn impedance_paire_plans(hauteur_plans: f64, largeur: f64, epsilon_r: f64) -> f64 {
    let (h, w, er) = (hauteur_plans, largeur, epsilon_r);
    if !(h > 0.0 && w > 0.0 && er > 0.0) {
        return 0.0;
    }
    (377.0 / er.sqrt()) * h / w
}

/// Un pont entre les deux plans : serie R-L-C (`c` absent : pas de condensateur en serie),
/// et, pour un pont INDIRECT, ses condensateurs `aval`.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct Pont {
    pub l: f64,
    pub c: Option<f64>,
    pub esr: f64,
    pub aval: Option<Vec<Pont>>,
}

/// Les admittances des chemins par lesquels le retour change de plan.
///
/// Rend (y_cavite, [y_pont_k]) a la pulsation de `freq`. Un chemin dont
/// l'impedance est nulle -- resonance serie sans perte -- rend une admittance
/// infinie : l'appelant le traite, on ne l'inverse pas ici.
///
/// LE COURANT NE CHOISIT PAS UN SEUL PONT. Chaque condensateur qui joint les
/// deux plans est une branche en parallele, et le courant s'y repartit en
/// raison de leurs ADMITTANCES. Ne compter que le plus proche -- ce que
/// faisait la version precedente -- surestime l'impedance de la traversee :
/// c'etait le sens prudent, ce n'est pas le sens juste, et sur un plan
/// correctement decouple l'ecart atteint un facteur trois.
///
/// Une admittance infinie se rend `None` ; a frequence nulle, `None` : pas de branches.
#[allow(clippy::type_complexity)]
pub fn _branches_traversee(freq: f64, l_cavite: f64, c_plans: f64, ponts: &[Pont]) -> Option<(Option<Complex64>, Vec<Option<Complex64>>)> {
    let omega = 2.0 * PI * freq;
    if omega <= 0.0 {
        return None;
    }

    let y = |l_serie: f64, c_serie: Option<f64>, r_serie: f64| -> Option<Complex64> {
        let mut z = Complex64::new(r_serie, omega * l_serie);
        if let Some(c_serie) = c_serie.filter(|&c| c > 0.0) {
            z += 1.0 / (J * omega * c_serie);
        }
        if z.norm() < 1e-15 {
            None
        } else {
            Some(1.0 / z)
        }
    };

    let y_cav = y(l_cavite, Some(c_plans), 0.0);
    let y_ponts = ponts.iter().map(|p| y(p.l, p.c, p.esr)).collect();
    Some((y_cav, y_ponts))
}

fn somme(ys: &[Complex64]) -> Complex64 {
    ys.iter().fold(Complex64::new(0.0, 0.0), |s, y| s + y)
}

/// L'impedance de la traversee, TOUS les ponts comptes. EN SI, complexe.
///
/// La cavite et chaque pont sont en PARALLELE : Z = 1 / (Y_cav + somme Y_k).
/// Sans pont, c'est la cavite seule -- le chemin qui existe toujours.
pub fn impedance_traversee_ponts(freq: f64, l_cavite: f64, c_plans: f64, ponts: &[Pont]) -> Complex64 {
    let zero = Complex64::new(0.0, 0.0);
    // A frequence nulle : ni cavite ni pont.
    let Some((y_cav, y_ponts)) = _branches_traversee(freq, l_cavite, c_plans, ponts) else {
        return zero;
    };
    // Une branche en court-circuit franc emporte tout : Z de la traversee = 0.
    let (Some(y_cav), Some(y_ponts)) = (y_cav, y_ponts.into_iter().collect::<Option<Vec<_>>>()) else {
        return zero;
    };
    let total = y_cav + somme(&y_ponts);
    if total.norm() < 1e-300 {
        // Antiresonance idealement sans perte : l'impedance diverge. On rend un
        // grand nombre fini plutot qu'un infini qui contaminerait la cascade.
        return Complex64::new(1e12, 0.0);
    }
    1.0 / total
}

/// Le partage du courant de retour entre la cavite et CHAQUE pont.
///
/// Rend (parts_ponts, part_cavite) : les MODULES |I_k / I_total|, dans l'ordre
/// des `ponts`. Comme pour deux branches, la somme depasse un au voisinage de
/// l'antiresonance -- c'est le courant circulant, et c'est une lecture, pas
/// une erreur. Voir `repartition_retour_plans`.
///
/// C'EST CE QUE LE CHEVELU DOIT PEINDRE. Un via de masse porte sa part du
/// retour, et le dessin l'ecrit depuis toujours ; un condensateur de pontage
/// porte la sienne, et le dessin n'en montrait qu'un, sans part. Sur une carte
/// ou trois decouplages entourent la transition, « lequel travaille » est
/// exactement la question qu'on se pose.
pub fn repartition_traversee(freq: f64, l_cavite: f64, c_plans: f64, ponts: &[Pont]) -> (Vec<f64>, f64) {
    let Some((y_cav, y_ponts)) = _branches_traversee(freq, l_cavite, c_plans, ponts) else {
        return (vec![0.0; ponts.len()], 1.0);
    };
    // Un court-circuit franc prend tout le courant.
    let courts: Vec<usize> = y_ponts.iter().enumerate().filter(|(_, y)| y.is_none()).map(|(k, _)| k).collect();
    if !courts.is_empty() {
        let mut parts = vec![0.0; y_ponts.len()];
        for &k in &courts {
            parts[k] = 1.0 / courts.len() as f64;
        }
        return (parts, 0.0);
    }
    let y_ponts: Vec<Complex64> = y_ponts.into_iter().flatten().collect();
    let Some(y_cav) = y_cav else {
        return (vec![0.0; y_ponts.len()], 1.0);
    };
    let total = y_cav + somme(&y_ponts);
    if total.norm() < 1e-300 {
        return (vec![1.0; y_ponts.len()], 1.0);
    }
    (y_ponts.iter().map(|y| (y / total).norm()).collect(), (y_cav / total).norm())
}

/// Le dict de parametres d'une cavite : `modal` (la cavite a ports) ou le modele localise
/// (`l_cavite`, `c_plans`), et les ponts sous l'une de leurs deux formes.
#[derive(Debug, Clone, Default)]
pub struct Traversee {
    pub modal: Option<Cavite>,
    pub ponts: Vec<Pont>,
    pub l_pont: Option<f64>,
    pub esr_pont: f64,
    pub c_pont: Option<f64>,
    pub l_cavite: Option<f64>,
    pub c_plans: Option<f64>,
}

impl Traversee {
    /// `not param` : le dict vide de Python.
    fn vide(&self) -> bool {
        self.modal.is_none() && self.ponts.is_empty() && self.l_pont.is_none() && self.c_pont.is_none() && self.l_cavite.is_none() && self.c_plans.is_none()
    }
}

fn present(param: Option<&Traversee>) -> Option<&Traversee> {
    param.filter(|p| !p.vide())
}

/// Les branches de pont d'un dict de parametres de cavite.
///
/// `ponts` (liste) est la forme generale ; `l_pont`/`esr_pont`/`c_pont` le
/// raccourci a un pont, garde pour les appelants qui n'en ont qu'un. UNE SEULE
/// LECTURE de ces deux formes, ici, pour que l'impedance cascadee et la
/// repartition affichee ne puissent pas divorcer.
pub fn _ponts_du_param(param: &Traversee) -> Vec<Pont> {
    if !param.ponts.is_empty() {
        return param.ponts.clone();
    }
    match param.l_pont {
        None => Vec::new(),
        Some(l) => vec![Pont { l, esr: param.esr_pont, c: param.c_pont, aval: None }],
    }
}

/// L'impedance d'un pont : serie R-L-C, plus en serie, pour un pont
/// INDIRECT (0 ohm vers un autre rail), ses condensateurs `aval` en parallele.
/// `w` scalaire ou tableau.
pub fn _z_branche(w: f64, p: &Pont) -> Complex64 {
    let mut z = Complex64::new(p.esr, w * p.l);
    if let Some(c) = p.c.filter(|&c| c != 0.0) {
        z += 1.0 / (J * w * c);
    }
    if let Some(aval) = &p.aval {
        let y = aval.iter().fold(Complex64::new(0.0, 0.0), |s, q| s + 1.0 / _z_branche(w, q));
        z += if y.norm() > 0.0 { 1.0 / y } else { Complex64::new(1e12, 0.0) };
    }
    z
}

/// (Z au port du via, courants des ponts) a chaque frequence, par la cavite modale.
pub fn _traversee_modale_vec(freqs: &[f64], param: &Traversee) -> (Vec<Complex64>, Vec<Vec<Complex64>>) {
    let ponts = _ponts_du_param(param);
    let termes: Vec<Vec<Complex64>> = freqs
        .iter()
        .map(|&f| {
            let w = 2.0 * PI * f.max(1e-3);
            ponts.iter().map(|p| _z_branche(w, p)).collect()
        })
        .collect();
    match &param.modal {
        Some(cav) => impedance_cavite_modale_vec(freqs, cav, &termes),
        None => (vec![Complex64::new(0.0, 0.0); freqs.len()], vec![Vec::new(); freqs.len()]),
    }
}

pub fn _traversee_modale(freq: f64, param: &Traversee) -> (Complex64, Vec<Complex64>) {
    let (mut zin, mut i_l) = _traversee_modale_vec(&[freq], param);
    (zin.remove(0), i_l.remove(0))
}

/// L'impedance de la traversee a toutes les frequences de `freqs` : d'un
/// coup pour la cavite modale, une a une pour le modele localise.
pub fn impedance_traversee_vec(freqs: &[f64], param: Option<&Traversee>) -> Vec<Complex64> {
    let Some(p) = present(param) else {
        return vec![Complex64::new(0.0, 0.0); freqs.len()];
    };
    if p.modal.is_some() {
        return _traversee_modale_vec(freqs, p).0;
    }
    freqs.iter().map(|&f| impedance_traversee_param(f, param)).collect()
}

/// L'impedance de la traversee, lue depuis un dict de parametres. EN SI.
pub fn impedance_traversee_param(freq: f64, param: Option<&Traversee>) -> Complex64 {
    let Some(p) = present(param) else {
        return Complex64::new(0.0, 0.0);
    };
    if p.modal.is_some() {
        return _traversee_modale(freq, p).0;
    }
    impedance_traversee_ponts(freq, p.l_cavite.unwrap_or(0.0), p.c_plans.unwrap_or(0.0), &_ponts_du_param(p))
}

/// Le partage du courant, lu depuis un dict de parametres.
///
/// Rend (parts_ponts, part_cavite).
pub fn repartition_traversee_param(freq: f64, param: Option<&Traversee>) -> (Vec<f64>, f64) {
    let Some(p) = present(param) else {
        return (Vec::new(), 1.0);
    };
    if p.modal.is_some() {
        let (_, i_l) = _traversee_modale(freq, p);
        let total = i_l.iter().fold(Complex64::new(1.0, 0.0), |s, i| s + i);
        return (i_l.iter().map(|i| i.norm()).collect(), total.norm());
    }
    repartition_traversee(freq, p.l_cavite.unwrap_or(0.0), p.c_plans.unwrap_or(0.0), &_ponts_du_param(p))
}

/// L'impedance serie que la traversee entre deux plans ajoute. EN SI.
///
/// DEUX CHEMINS EN PARALLELE, et c'est toute la structure :
///
///   · LA CAVITE elle-meme -- le courant s'etale du via jusqu'a la capacite
///     repartie des deux plans et se referme par elle. Ce chemin EXISTE
///     TOUJOURS ; c'est ce que la version precedente refusait de chiffrer.
///         Z_cav = j w L_etalement + 1/(j w C_plans)
///   · LE PONT, quand il y en a un : un condensateur de decouplage, son
///     inductance de montage et l'etalement qui y mene.
///         Z_pont = j w L_pont + ESR [+ 1/(j w C_pont) si la valeur est connue]
///
/// LE PARALLELE DE CES DEUX-LA RESONNE, et ce n'est pas un artefact : c'est la
/// « parallel resonant frequency » du chapitre 13, ou l'inductance du
/// condensateur et la capacite des plans s'annulent. L'impedance de la
/// traversee y CULMINE. Le modele la rend, et c'est bien : c'est un vrai
/// defaut de conception, pas un accident numerique. Ce qu'il ne rend pas, ce
/// sont les resonances propres de la cavite plus haut en frequence -- il y
/// faudrait un solveur 3D, le livre le dit.
///
/// UN SEUL PONT EST LE CAS PARTICULIER, PAS LE MODELE. Sur une carte, plusieurs
/// condensateurs joignent les deux plans autour d'une transition, et ils sont
/// tous en parallele. `impedance_traversee_ponts` est la forme generale ; celle-ci
/// n'en est que le raccourci a un pont, gardee parce qu'elle se lit mieux la ou
/// il n'y en a qu'un. UNE SEULE IMPLEMENTATION derriere les deux : deux
/// calculs pour une meme grandeur, ce sont deux valeurs le jour ou l'un bouge.
///
/// Rend une impedance complexe, en ohms.
///
/// `l_pont` absent : pas de pont.
pub fn impedance_traversee_plans(freq: f64, l_etalement_cavite: f64, c_plans: f64, l_pont: Option<f64>, esr_pont: f64, c_pont: Option<f64>) -> Complex64 {
    let ponts: Vec<Pont> = l_pont.map(|l| Pont { l, esr: esr_pont, c: c_pont, aval: None }).into_iter().collect();
    impedance_traversee_ponts(freq, l_etalement_cavite, c_plans, &ponts)
}

// ==========================================================================
// BILAN DE SANTE DU SIGNAL ET REPARTITION SPECTRALE DU RETOUR (CAVITE / PONT)
// ==========================================================================

/// Partage du courant de retour entre cavite et pont de decouplage.
///
/// A la frequence `freq`, le retour qui traverse entre deux plans de references
/// differentes se partage entre le courant de deplacement de la cavite
/// inter-plans et le courant traversant le condensateur de decouplage (pont).
///
/// LE PARTAGE EST COMPLEXE, ET LE FORCER A SOMMER A UN ETAIT FAUX. Deux
/// branches en parallele se partagent le courant en raison de leurs
/// ADMITTANCES COMPLEXES : I_k / I_total = Y_k / (Y_cav + Y_pont). La version
/// precedente prenait 1/|Z| de chaque branche et normalisait la somme a 1,
/// ce qui n'est le bon calcul que si les deux impedances ont la meme phase.
///
/// ET LA DIFFERENCE N'EST PAS UN DETAIL : elle est maximale exactement la ou
/// ce modele existe pour regarder. A l'antiresonance parallele -- l'inductance
/// du pont contre la capacite des plans --, les deux courants sont EN
/// OPPOSITION DE PHASE et chacun DEPASSE le courant total : c'est le courant
/// circulant, et c'est le phenomene lui-meme. Sur le cas du banc a 300 MHz,
/// l'ancienne formule annoncait 73 % / 27 % la ou la verite est 159 % / 59 %.
/// Une somme forcee a 100 % ne peut pas l'ecrire, donc l'effacait.
///
/// Rend (part_pont, part_cavite) : les deux MODULES |I_k / I_total|. Ils
/// somment a 1 quand les deux branches sont en phase, et davantage -- jusqu'a
/// plusieurs fois -- au voisinage de l'antiresonance. Un total superieur a 1
/// est donc une LECTURE, pas une erreur : il dit combien de courant circule
/// entre les deux branches sans jamais rejoindre le signal.
pub fn repartition_retour_plans(freq: f64, l_cavite: f64, c_plans: f64, l_pont: Option<f64>, esr_pont: f64, c_pont: Option<f64>) -> (f64, f64) {
    if freq <= 0.0 {
        return if l_pont.is_none() { (0.0, 1.0) } else { (1.0, 0.0) };
    }
    let Some(l) = l_pont else {
        return (0.0, 1.0);
    };
    // UNE SEULE IMPLEMENTATION : `repartition_traversee` porte le calcul pour un
    // nombre quelconque de ponts, celle-ci n'en est que la lecture a un pont.
    let (parts, part_cav) = repartition_traversee(freq, l_cavite, c_plans, &[Pont { l, esr: esr_pont, c: c_pont, aval: None }]);
    (parts[0], part_cav)
}
