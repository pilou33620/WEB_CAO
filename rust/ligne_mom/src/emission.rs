// ==========================================================================
// CE QUE LA BOUCLE DE RETOUR RAYONNE -- UN ORDRE DE GRANDEUR, ET SES LIMITES
// --------------------------------------------------------------------------
// POURQUOI CE CHIFFRE EXISTE. « Une boucle de retour ouverte rayonne » est un
// conseil qu'on repete sans jamais le chiffrer, et un conseil qu'on ne chiffre
// pas ne se hierarchise pas : on ne sait pas s'il faut refaire le routage ou
// passer a autre chose. Une boucle de trois millimetres carres a 36 MHz et une
// boucle de deux cents a 500 MHz ne demandent pas la meme journee de travail.
//
// LE MODELE : DIPOLE MAGNETIQUE, CHAMP LOINTAIN. Une boucle de courant petite
// devant la longueur d'onde est un dipole magnetique de moment m = I*A. Son
// champ lointain vaut
//
//     E = eta0 * k^2 * m / (4 pi r)     avec k = 2 pi f / c
//       = (eta0 pi / c^2) * f^2 * I * A / r
//       = 1,3169e-14 * f^2 * A * I / r      [SI : Hz, m^2, A, m]
//
// C'est la forme fermee exacte pour cette geometrie, pas un ajustement -- elle
// se derive en trois lignes du potentiel vecteur. C'est la formule du
// « differential mode radiation » des manuels de CEM (Ott, Paul).
//
// CE QU'ELLE NE DIT PAS, ET C'EST LE PLUS IMPORTANT :
//
//   · LE MODE COMMUN DOMINE PRESQUE TOUJOURS. Sur une carte reelle, l'emission
//     qui fait echouer l'essai vient du courant de mode commun sur les CABLES,
//     pas de la boucle differentielle sur le cuivre. Quelques microamperes de
//     mode commun sur un cordon d'un metre rayonnent autant que des dizaines de
//     milliamperes dans une boucle de quelques millimetres carres -- l'ecart
//     courant est de vingt a quarante decibels. Ce chiffre-ci est donc un
//     PLANCHER de l'emission, jamais une prediction du resultat d'essai.
//   · LE CHAMP LOINTAIN COMMENCE A lambda/2pi. A trois metres, cela veut dire
//     au-dessus de 16 MHz ; en dessous, la formule ne vaut plus et on le dit.
//   · PAS DE BOITIER, PAS DE PLAN DE SOL REEL, PAS DE RESONANCE DE STRUCTURE.
//     Le facteur deux du sol d'un site d'essai est pris au pire ; le reste est
//     hors de portee d'une forme fermee.
//
// ON REND DONC UN ORDRE DE GRANDEUR ET SA MARGE, en le nommant comme tel.
// ==========================================================================

use crate::discontinuites::{abcd_via_complet, cascade_to_s};
use crate::traversee::{impedance_traversee_param, Traversee};
use crate::{arrondi, C_0, MU_0};
use num_complex::Complex64;
use serde::Serialize;
use std::f64::consts::PI;

// eta0 * pi / c^2 = mu0 * pi / c : le coefficient du dipole magnetique en
// champ lointain. On l'ECRIT a partir de mu0 et c plutot que de recopier le
// 1,3169e-14 des manuels -- une constante recopiee est une constante qu'on ne
// peut plus verifier.
pub const COEFF_DIPOLE_MAGNETIQUE: f64 = MU_0 * PI / C_0;

// Le champ lointain d'une boucle ne commence qu'a lambda / 2 pi de la boucle.
// En deca, la formule surestime -- le champ y decroit en 1/r^3, pas en 1/r.
/// La distance a partir de laquelle le champ lointain vaut, en metres.
pub fn distance_champ_lointain(freq: f64) -> f64 {
    if freq > 0.0 {
        C_0 / (2.0 * PI * freq)
    } else {
        f64::INFINITY
    }
}

/// Le champ E rayonne par une boucle de courant, en V/m. EN SI.
///
///     E = 1,3169e-14 * f^2 * A * I / r
///
/// `courant` est la valeur EFFICACE de l'harmonique -- les limites de CEM se
/// lisent sur un recepteur calibre en efficace, et donner l'amplitude ferait
/// trois decibels de pessimisme gratuit.
///
/// `sol` a vrai ajoute le facteur DEUX de la reflexion sur le plan de sol d'un
/// site d'essai : c'est le pire cas, celui ou l'onde directe et l'onde
/// reflechie arrivent en phase sur l'antenne. C'est ainsi que la mesure se
/// fait, donc c'est ainsi qu'on compare.
pub fn champ_boucle_rayonnant(freq: f64, aire: f64, courant: f64, distance: f64, sol: bool) -> f64 {
    let (f, a, i, r) = (freq, aire, courant, distance);
    if !(f > 0.0 && a > 0.0 && i > 0.0 && r > 0.0) {
        return 0.0;
    }
    let e = COEFF_DIPOLE_MAGNETIQUE * f * f * a * i / r;
    e * if sol { 2.0 } else { 1.0 }
}

/// Un champ en V/m vers les dB microvolts par metre des normes.
pub fn en_dbuv_par_metre(champ: f64) -> f64 {
    let e = champ;
    if e <= 0.0 {
        return f64::NEG_INFINITY;
    }
    20.0 * (e / 1e-6).log10()
}

// CISPR 32 / EN 55032, emission rayonnee, en dB(uV/m). Les valeurs a 10 m sont
// celles de la norme ; celles a 3 m sont celles de sa table pour cette
// distance, et NON une extrapolation en 1/r -- la norme les donne, on les lit.
///
/// (classe, distance) -> les bandes (f1, f2, limite).
pub const LIMITES_CISPR32: [((&str, f64), [(f64, f64, f64); 2]); 4] = [
    (("B", 10.0), [(30e6, 230e6, 30.0), (230e6, 1e9, 37.0)]),
    (("B", 3.0), [(30e6, 230e6, 40.0), (230e6, 1e9, 47.0)]),
    (("A", 10.0), [(30e6, 230e6, 40.0), (230e6, 1e9, 47.0)]),
    (("A", 3.0), [(30e6, 230e6, 50.0), (230e6, 1e9, 57.0)]),
];

/// La limite d'emission rayonnee a cette frequence, en dB(uV/m).
///
/// Rend None HORS DE LA BANDE REGLEMENTEE, et ce n'est pas un detail : sous
/// 30 MHz, CISPR 32 ne fixe AUCUNE limite rayonnee. Un signal de 12 MHz n'a
/// donc pas de limite sur sa fondamentale -- seules ses harmoniques a partir
/// de la troisieme y tombent. Rendre zero ferait croire au contraire.
pub fn limite_cispr32(freq: f64, distance: f64, classe: &str) -> Option<f64> {
    let classe = classe.to_uppercase();
    let table = LIMITES_CISPR32.iter().find(|((c, d), _)| *c == classe && *d == distance)?.1;
    let f = freq;
    table.iter().find(|&&(f1, f2, _)| f1 <= f && f < f2).map(|t| t.2)
}

/// Le rang d'une harmonique : entier, ou reel quand on suit l'enveloppe.
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(untagged)]
pub enum Ordre {
    Entier(i64),
    Reel(f64),
}

impl Ordre {
    pub fn valeur(self) -> f64 {
        match self {
            Ordre::Entier(n) => n as f64,
            Ordre::Reel(x) => x,
        }
    }
}

/// Une harmonique de `rayonnement_boucle`.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct LigneRayonnement {
    pub harmonique: Ordre,
    pub freq_hz: f64,
    pub courant_eff_ma: f64,
    pub champ_dbuv_m: Option<f64>,
    pub limite_dbuv_m: Option<f64>,
    pub marge_db: Option<f64>,
    // Le champ lointain commence a lambda/2pi : plus loin que la sonde,
    // et la formule ne vaut plus. On le porte par harmonique, parce que
    // c'est par harmonique que cela bascule.
    pub champ_lointain: bool,
}

/// Ce que `rayonnement_boucle` rend.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Rayonnement {
    pub aire_boucle_mm2: f64,
    pub distance_m: f64,
    pub classe: String,
    pub calcul: &'static str,
    pub harmoniques: Vec<LigneRayonnement>,
    pub pire: Option<LigneRayonnement>,
    // Aucune harmonique dans la bande reglementee : c'est une information,
    // pas une absence de resultat.
    pub hors_bande: bool,
}

/// `10 ** np.linspace(a, b, n)`
fn logspace(a: f64, b: f64, n: usize) -> Vec<f64> {
    let pas = (b - a) / (n - 1) as f64;
    (0..n).map(|i| 10f64.powf(if i == n - 1 { b } else { i as f64 * pas + a })).collect()
}

/// Ce qu'une boucle de retour d'aire `aire` rayonne, harmonique par
/// harmonique, et ce qu'il reste de marge sur la limite. EN SI.
///
/// Le courant de chaque harmonique est celui que la ligne porte : l'amplitude
/// du spectre trapezoidal divisee par l'impedance caracteristique, ramenee en
/// efficace. C'est le meme spectre que `bilan_sante_transition`, et il faut
/// que ce soit le meme : deux spectres pour un meme signal, ce sont deux
/// verdicts le jour ou l'un bouge.
///
/// LES HARMONIQUES IMPAIRES JUSQU'A 1 GHZ, comme `_rayonnement_cavite` de
/// simulation_em : dix seulement laissaient une horloge sous 1,58 MHz sans
/// une harmonique dans la bande, donc sans verdict. Au-dela de 400 dans la
/// bande, l'enveloppe, comme si une harmonique tombait partout -- le pire.
///
/// Rend un dict avec la liste des harmoniques et la PIRE marge -- celle qui
/// decide. `marge_db` positive veut dire sous la limite.
///
/// Les defauts du Python : z0 50, v0 3,3, distance 3, classe « B ».
pub fn rayonnement_boucle(f0: f64, tr: f64, aire: f64, z0: f64, v0: f64, distance: f64, classe: &str) -> Option<Rayonnement> {
    if !(aire > 0.0) {
        return None;
    }
    let z0 = if z0 > 0.0 { z0 } else { 50.0 };
    let (f_lo, f_hi) = (30e6, 1e9);
    let f0 = (if f0.is_nan() { 0.0 } else { f0 }).max(1.0);
    let (ordres, calcul): (Vec<Ordre>, _) = if (f_hi - f_lo) / (2.0 * f0) <= 400.0 {
        let mut o: Vec<Ordre> = (1..(f_hi / f0) as i64 + 1).step_by(2).map(Ordre::Entier).collect();
        if o.is_empty() {
            o.push(Ordre::Entier(1));
        }
        (o, "harmoniques")
    } else {
        // np.geomspace(f_lo, f_hi, 160) / f0
        let mut g = logspace(f_lo.log10(), f_hi.log10(), 160);
        g[0] = f_lo;
        g[159] = f_hi;
        (g.into_iter().map(|f| Ordre::Reel(f / f0)).collect(), "enveloppe")
    };
    let spectre = spectre_signal_trapeze(f0, tr, v0, 10, Some(&ordres));
    let r = distance;
    let mut lignes = Vec::new();
    let mut pire: Option<LigneRayonnement> = None;
    for item in spectre {
        let f = item.freq;
        let i_eff = item.amplitude / z0 / 2.0f64.sqrt();
        let e = champ_boucle_rayonnant(f, aire, i_eff, r, true);
        let e_db = en_dbuv_par_metre(e);
        let lim = limite_cispr32(f, r, classe);
        let d_ll = distance_champ_lointain(f);
        let ligne = LigneRayonnement {
            harmonique: item.harmonique,
            freq_hz: f,
            courant_eff_ma: arrondi(i_eff * 1e3, 4),
            champ_dbuv_m: e_db.is_finite().then(|| arrondi(e_db, 2)),
            limite_dbuv_m: lim,
            marge_db: lim.filter(|_| e_db.is_finite()).map(|lim| arrondi(lim - e_db, 2)),
            champ_lointain: r >= d_ll,
        };
        if let Some(marge) = ligne.marge_db {
            if pire.as_ref().and_then(|p| p.marge_db).is_none_or(|p| marge < p) {
                pire = Some(ligne.clone());
            }
        }
        lignes.push(ligne);
    }
    Some(Rayonnement {
        aire_boucle_mm2: arrondi(aire * 1e6, 4),
        distance_m: r,
        classe: classe.to_uppercase(),
        calcul,
        harmoniques: lignes,
        hors_bande: pire.is_none(),
        pire,
    })
}

/// Une harmonique de `spectre_signal_trapeze`.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Harmonique {
    pub harmonique: Ordre,
    pub freq: f64,
    pub amplitude: f64,
    pub puissance_relative: f64,
}

/// Amplitudes des harmoniques impaires d'un signal carre a fronts finis,
/// d'excursion 0 -> v0 (la fondamentale d'un carre 0 -> 1 V vaut 2/pi).
///
/// Rend une liste de dicts pour les premieres harmoniques impaires, ou pour
/// les `ordres` donnes (non entiers pour suivre l'enveloppe) :
/// [{"harmonique": n, "freq": f_n, "amplitude": A_n, "puissance_relative": P_n}]
///
/// `ordres` absent : les `nb_harmoniques` premieres impaires (10 par defaut en Python, v0 3,3).
pub fn spectre_signal_trapeze(f0: f64, tr: f64, v0: f64, nb_harmoniques: usize, ordres: Option<&[Ordre]>) -> Vec<Harmonique> {
    let tr = tr.max(1e-15);
    let impaires: Vec<Ordre>;
    let ordres = match ordres {
        Some(o) => o,
        None => {
            impaires = (1..2 * nb_harmoniques as i64).step_by(2).map(Ordre::Entier).collect(); // 1, 3, 5, 7, ...
            &impaires
        }
    };
    let mut harmoniques = Vec::new();
    let mut p_totale = 0.0;
    for &ordre in ordres {
        let n = ordre.valeur();
        let fn_ = n * f0;
        let arg = PI * n * f0 * tr;
        let sinc = if arg.abs() > 1e-12 { arg.sin() / arg } else { 1.0 };
        let an = (2.0 * v0 / (n * PI) * sinc).abs();
        let pn = an * an;
        p_totale += pn;
        harmoniques.push(Harmonique { harmonique: ordre, freq: fn_, amplitude: an, puissance_relative: pn });
    }

    for h in &mut harmoniques {
        h.puissance_relative = if p_totale > 0.0 { h.puissance_relative / p_totale } else { 0.0 };
    }
    harmoniques
}

/// Les options nommees de `bilan_sante_transition`, avec leurs defauts.
#[derive(Debug, Clone, PartialEq)]
pub struct OptionsBilan {
    pub z0: f64,
    pub y_depart: Complex64,
    pub y_arrivee: Complex64,
    pub f0: f64,
    pub tr: f64,
    pub v0: f64,
    pub nb_harmoniques: usize,
    pub retour_ferme: Option<bool>,
}

impl Default for OptionsBilan {
    fn default() -> Self {
        OptionsBilan {
            z0: 50.0,
            y_depart: Complex64::new(0.0, 0.0),
            y_arrivee: Complex64::new(0.0, 0.0),
            f0: 10e3,
            tr: 1e-9,
            v0: 3.3,
            nb_harmoniques: 10,
            retour_ferme: None,
        }
    }
}

/// Ce que `bilan_sante_transition` rend.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Bilan {
    pub f0_hz: f64,
    pub f_fondamentale: f64,
    pub temps_montee_s: f64,
    pub temps_montee: f64,
    pub f_knee_hz: f64,
    pub f_knee: f64,
    pub score_reconstruction_pct: f64,
    pub verdict: String,
}

/// Bilan de sante du signal a travers la transition et sa traversee de plan.
///
/// Evalue la preservation du front montant a travers la transition et sa
/// boucle de retour (bande 1 MHz a f_knee = 0.35 / tr) en combinant la
/// transmission spectrale sans reflexion et l'allongement du temps de montee.
///
/// Evalue un score global de reconstruction du signal (0 a 100 %).
///
/// `retour_ferme` dit si des vias de retour referment effectivement la boucle :
/// True, False, ou None quand on ne l'a pas verifie. LE SCORE NE LE SAIT PAS
/// TOUT SEUL -- il ne voit qu'une inductance, sans savoir si elle est une
/// mesure ou un plancher --, et le verdict le disait pourtant : « boucle de
/// retour refermee de facon optimale » sortait sur des transitions ou RIEN ne
/// la referme. Le score reste ce qu'il est, le verdict cesse de l'inventer.
pub fn bilan_sante_transition(l_boucle: f64, c_totale: f64, param_cavite: Option<&Traversee>, o: &OptionsBilan) -> Bilan {
    let f0 = if o.f0 > 0.0 { o.f0 } else { 10e3 };
    let tr = if o.tr > 0.0 { o.tr } else { 1e-9 };
    let z0 = if o.z0 > 0.0 { o.z0 } else { 50.0 };
    let f_knee = 0.35 / tr;

    let a_cavite = param_cavite.is_some_and(|p| p.c_plans.is_some() && p.l_cavite.is_some());

    // Calcul du score de fidelite / reconstruction du signal
    // Evalue la preservation du front montant (bande 1 MHz a f_knee)
    // combinant la transmission spectrale sans reflexion et la preservation du temps de montee.
    let freq_sweep = logspace(1e6f64.log10(), f_knee.max(2e6).log10(), 40);
    let mut scores_sweep = Vec::new();
    for &f in &freq_sweep {
        let zt = if a_cavite { impedance_traversee_param(f, param_cavite) } else { Complex64::new(0.0, 0.0) };
        let mat = abcd_via_complet(l_boucle, c_totale, f, o.y_depart, o.y_arrivee, zt);
        let s = cascade_to_s(&mat, z0);
        let s21 = s[1][0].norm();
        let s11 = s[0][0].norm();
        scores_sweep.push(s21 * (1.0 - s11).max(0.0));
    }

    let t_moyen = if scores_sweep.is_empty() { 1.0 } else { scores_sweep.iter().sum::<f64>() / scores_sweep.len() as f64 };

    // LE FRONT VOIT TOUTE L'INDUCTANCE SERIE, ET L'ANCIENNE VERSION EN JETAIT
    // LA MOITIE. Des qu'une cavite etait presente, `l_ret` valait l'inductance
    // du PONT seule -- ou `l_cavite + 5 nH`, une constante que rien ne
    // justifiait -- et l'inductance de boucle du via, celle que tout le reste
    // de l'outil sert a mesurer, DISPARAISSAIT du terme de temps de montee.
    // Consequence mesuree : un via a 50 nH de boucle notait 4,98 % sans
    // traversee de plan et 46,11 % avec. Ajouter un changement de reference
    // AMELIORAIT le score d'un facteur neuf -- l'inverse de la physique, et
    // l'inverse du classement que cette fiche existe pour rendre.
    //
    // Les deux inductances sont EN SERIE sur le meme courant : le barreau avec
    // sa boucle de retour, puis le passage d'un plan a l'autre. On les somme,
    // et on prend la traversee au GENOU DU FRONT, qui est la frequence dont le
    // temps de montee parle.
    let mut l_serie = l_boucle;
    if a_cavite {
        let z_knee = impedance_traversee_param(f_knee, param_cavite);
        let omega_knee = 2.0 * PI * f_knee;
        // Au-dessus de l'antiresonance la traversee devient CAPACITIVE : elle ne
        // ralentit alors pas le front, elle le derive. Ce n'est pas un
        // allongement du temps de montee, et `t_moyen` -- qui cascade
        // l'impedance complexe entiere -- en rend deja compte.
        if omega_knee > 0.0 {
            l_serie += z_knee.im.max(0.0) / omega_knee;
        }
    }
    let delta_tr = 2.2 * l_serie / (2.0 * z0);
    let eta_tr = tr / (tr + delta_tr);
    let score_pct = arrondi(t_moyen * eta_tr * 100.0, 2);
    let score_pct = score_pct.min(100.0).max(0.0);

    // LE VERDICT NE PARLE QUE DE CE QUE LE SCORE MESURE. « Excellent : signal
    // quasiment intact, boucle de retour refermee de facon optimale » sortait
    // sur une transition GND -> PWR ou RIEN ne referme la boucle et ou
    // l'inductance affichee est un PLANCHER : la premiere moitie de la phrase
    // etait vraie, la seconde inventee. Le score porte sur le FRONT ; il ne
    // sait rien de la boucle tant qu'on ne le lui dit pas.
    let mut verdict = if score_pct >= 95.0 {
        "Excellent : le front traverse la transition quasiment intact"
    } else if score_pct >= 90.0 {
        "Bon : front preserve, amortissement ou oscillations minimes"
    } else if score_pct >= 75.0 {
        "Degrade : depassements (ringing) et ralentissement notable du front"
    } else {
        "Critique : forte dispersion et attenuation, integrite compromise"
    }
    .to_string();

    // ET CE QU'IL NE MESURE PAS SE DIT, plutot que de se deviner au silence. Un
    // front intact ne prouve pas que le retour est referme : a basse frequence
    // une boucle ouverte coute quelques dizaines de picosecondes, invisibles
    // sur le front et bien reelles pour le rayonnement et le bruit de plan.
    match o.retour_ferme {
        Some(false) => verdict.push_str(
            " — mais rien ne referme la boucle de retour : l'inductance affichee est un plancher, la vraie est plus \
             grande, et le courant revient par un chemin que ce score ne mesure pas",
        ),
        None => verdict.push_str(" (l'etat de la boucle de retour n'a pas ete verifie)"),
        Some(true) => {}
    }

    Bilan {
        f0_hz: f0,
        f_fondamentale: f0,
        temps_montee_s: tr,
        temps_montee: tr,
        f_knee_hz: arrondi(f_knee, 1),
        f_knee: arrondi(f_knee, 1),
        score_reconstruction_pct: score_pct,
        verdict,
    }
}
