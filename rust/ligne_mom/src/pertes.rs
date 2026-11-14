//! La dispersion, les pertes du conducteur (regle de Wheeler), la rugosite et le dielectrique
//! causal.

use crate::{refus, Res, C_0, ETA_0, MU_0, SIGMA_CU};
use num_complex::Complex64;
use serde::Serialize;
use std::collections::HashMap;
use std::f64::consts::{E, PI};
use std::sync::Mutex;

/// Ce que la fréquence fait à un microruban (Getsinger).
///
/// Le calcul de section est quasi-statique : il ne connaît pas la fréquence.
/// Or ε_eff monte avec elle — le champ se concentre dans le stratifié — et Z₀
/// monte un peu avec. Getsinger tient cela en deux lignes et reste honnête
/// jusqu'à quelques gigahertz sur du stratifié courant.
///
/// C'est un MODÈLE, pas un calcul : au-delà, l'écart se creuse, et c'est dit
/// dans le résultat plutôt que caché.
pub fn dispersion_getsinger(z0_statique: f64, eps_eff_statique: f64, epsilon_r: f64, h: f64, freq: f64) -> (f64, f64) {
    if !(freq > 0.0) || !(h > 0.0) || !(z0_statique > 0.0) {
        return (eps_eff_statique, z0_statique);
    }
    let f_p = z0_statique / (2.0 * MU_0 * h);
    let g = 0.6 + 0.009 * z0_statique;
    let x = (freq / f_p) * (freq / f_p);
    let eps_f = epsilon_r - (epsilon_r - eps_eff_statique) / (1.0 + g * x);
    if eps_f <= 1.0 {
        return (eps_eff_statique, z0_statique);
    }
    let z_f = if eps_eff_statique > 1.0 {
        z0_statique * ((eps_f - 1.0) / (eps_eff_statique - 1.0)) * (eps_eff_statique / eps_f).sqrt()
    } else {
        z0_statique
    };
    (eps_f, z_f)
}

// ==========================================================================
// LES PERTES DU CONDUCTEUR : LA REGLE DE L'INDUCTANCE INCREMENTALE
// --------------------------------------------------------------------------
// CE QUI ETAIT COMPTE JUSQU'A LA 2.6.0, ET CE QUI MANQUAIT. alpha_c valait
// Rs / (2 Z0 w) : une nappe de courant de largeur w sur UNE face du ruban,
// rien d'autre. Ni le courant de RETOUR dans le plan, qui traverse la meme
// epaisseur de peau ; ni la face superieure et les flancs du ruban ; ni la
// CONCENTRATION du courant sur les bords, ou la densite monte comme
// 1/racine(distance a l'arete) et ou se dissipe une bonne part de la perte.
//
// POURQUOI LE CHIFFRE ETAIT POURTANT A PEU PRES JUSTE A 50 OHMS, ET FAUX
// AILLEURS. Les oublis se compensent par hasard : le plan ajoute une perte, et
// l'etalement du courant au-dela de w (champ de bord, face superieure) en
// retire. Sur un microruban 50 ohms de FR-4 les deux s'annulent a quelques
// pour cent pres. Sur une piste ETROITE (90 ohms et plus) l'ancien modele
// surestime la perte de moitie, parce qu'il entasse sur w un courant qui
// s'etale en fait sur tout le perimetre ; sur une piste LARGE il en oublie la
// moitie, celle du plan, et tend vers Rs/(2 Z0 w) la ou les plaques
// paralleles imposent Rs/(Z0 w). En triplaque, ou le courant se partage entre
// les deux faces du ruban, il surestime d'un tiers.
//
// LA REGLE DE WHEELER (1942), exacte tant que la profondeur de peau est petite
// devant l'epaisseur et les rayons de courbure : la resistance lineique est la
// derivee de l'inductance quand TOUTES les parois parcourues reculent d'une
// meme distance n a l'interieur du metal,
//
//     R = (Rs / mu0) . dL/dn  =  (Rs / eta0) . dZ0_air/dn      [ohm/m]
//     alpha_c = R / (2 Z0)                                    [Np/m]
//
// puisque L = Z0_air / c ne depend pas du dielectrique. Pucel (1968) pour le
// microruban et Cohn / Wheeler (1978) pour la triplaque n'ont pas fait autre
// chose : ils ont derive A LA MAIN une formule de Z0 avec epaisseur. On fait
// la meme derivation numeriquement, en differences centrees, sur la formule de
// Z0 la plus juste dont on dispose : Hammerstad-Jensen (1980) avec sa
// correction d'epaisseur pour le microruban, Wheeler (1978) pour la triplaque.
// Le bord est dans la correction d'epaisseur -- c'est elle qui fait croitre la
// perte quand t baisse --, le plan dans le recul de h.
//
// CE QUE LA SECTION NE DONNE PAS ICI, ET COMMENT ON S'EN PASSE. `line_losses`
// ne recoit ni la hauteur au plan ni la topologie, et ses appelants ne
// changent pas. La topologie se lit sur eps_eff : un milieu homogene
// (eps_eff = er) est une triplaque, sinon c'est un microruban. La hauteur se
// DEDUIT de l'impedance : Z0_air = Z0 . racine(eps_eff) ne depend que de w, t
// et h, et la formule de Z0_air croit avec h -- une dichotomie la retrouve.
// Sur un coplanaire ou un mode impair, c'est la hauteur du microruban de meme
// Z0_air, plus basse que la vraie : la perte monte, ce qui est le sens de la
// physique (le courant se resserre sur les aretes en regard). Quand la
// hauteur est connue, `hauteur=` la donne et rien n'est deduit.
//
// REPLI : si la formule ne peut rendre ce Z0_air (impedance hors de sa plage),
// on prend les plaques paralleles, R = 2 Rs / w, et le detail le dit.
//
// LE CONTINU. Sous la profondeur de peau la regle n'a plus de sens et Rs tend
// vers zero : le ruban retrouve sa resistance continue 1/(sigma w t), qu'on
// compose en quadrature avec la part alternative. Au-dessus du megahertz sur
// du 35 um, la difference est sous le pour cent.
//
// CE QUE LE BANC VERIFIE (python/test/banc-ligne-mom.py) : la regle sur la
// ligne COAXIALE, ou alpha_c est exact ; les plaques paralleles en limite de
// ruban large ; Pucel en microruban et la formule de Pozar (incrementale sur
// Wheeler) en triplaque, toutes deux publiees et algebriquement independantes
// de ce code.
// ==========================================================================

// Les deux modeles de conducteur. « wheeler » est le defaut depuis la 2.7.0 ;
// « ancien » rend au bit pres le Rs/(2 Z0 w) des versions precedentes, pour
// comparer ou pour retrouver un chiffre deja publie.
pub const MODELES_CONDUCTEUR: [&str; 2] = ["wheeler", "ancien"];

// En dessous de ce cuivre, la regle de Wheeler derive sans fin -- la perte
// d'arete d'un ruban d'epaisseur nulle est infinie. On calcule alors la part
// alternative sur un micron, et le continu sur l'epaisseur vraie.
pub const EPAISSEUR_MIN_WHEELER: f64 = 1e-6;

/// delta = racine(2 / (omega mu0 sigma)), en metres. Zero a frequence nulle.
///
/// Ecrite operation pour operation comme dans les versions precedentes : le
/// modele « ancien » doit rendre son chiffre AU BIT PRES.
///
/// `profondeur_peau(f)` prend le cuivre ; `profondeur_peau_sigma` une autre conductivite.
pub fn profondeur_peau(freq: f64) -> f64 {
    profondeur_peau_sigma(freq, SIGMA_CU)
}

pub fn profondeur_peau_sigma(freq: f64, sigma: f64) -> f64 {
    let f = freq;
    if !(f > 0.0) {
        return 0.0;
    }
    let omega = 2.0 * PI * f;
    (2.0 / (omega * MU_0 * sigma)).sqrt()
}

/// Rs = 1 / (sigma delta) = racine(pi f mu0 / sigma), en ohms par carre.
pub fn resistance_surface(freq: f64) -> f64 {
    resistance_surface_sigma(freq, SIGMA_CU)
}

pub fn resistance_surface_sigma(freq: f64, sigma: f64) -> f64 {
    let d = profondeur_peau_sigma(freq, sigma);
    if d > 0.0 {
        1.0 / (sigma * d)
    } else {
        0.0
    }
}

/// Z0 d'un microruban dans l'air, Hammerstad-Jensen 1980, epaisseur comprise.
///
///     u1 = u + (t/pi) ln(1 + 4e / (t coth^2 racine(6,517 u)))
///     Z  = (eta0 / 2pi) ln(f(u1)/u1 + racine(1 + 4/u1^2))
///     f(u) = 6 + (2pi - 6) exp(-(30,666/u)^0,7528)
///
/// u et t rapportes a h. Donnee a 0,01 % pour u <= 1000 et t/h < 0,1 ; lisse
/// partout, ce qui compte ici parce qu'on la derive. Rend None hors domaine.
pub fn _z_air_microruban(w: f64, t: f64, h: f64) -> Option<f64> {
    if !(w > 0.0 && h > 0.0 && t >= 0.0) {
        return None;
    }
    let mut u = w / h;
    let tn = t / h;
    if tn > 0.0 {
        let cth = 1.0 / (6.517 * u).sqrt().tanh();
        u += (tn / PI) * (1.0 + 4.0 * E / (tn * cth * cth)).ln();
    }
    let fu = 6.0 + (2.0 * PI - 6.0) * (-(30.666 / u).powf(0.7528)).exp();
    Some((ETA_0 / (2.0 * PI)) * (fu / u + (1.0 + 4.0 / (u * u)).sqrt()).ln())
}

/// Le dW de Wheeler 1978 (Wadell, eq. 3.5.1), en unites de w : ce dont un
/// ruban d'epaisseur t entre deux plans a b s'elargit en ruban mince dans
/// b - t. Nul a t = 0.
pub fn _elargissement_triplaque(w: f64, t: f64, b: f64) -> f64 {
    let x = t / b;
    if !(x > 0.0) {
        return 0.0;
    }
    let m = 2.0 / (1.0 + (2.0 / 3.0) * x / (1.0 - x));
    let dw = (x / (PI * (1.0 - x)))
        * (1.0 - 0.5 * ((x / (2.0 - x)) * (x / (2.0 - x)) + (0.0796 * x / (w / b + 1.1 * x)).powf(m)).ln());
    dw * (b - t)
}

/// Z0 d'une triplaque centree dans l'air, Wheeler 1978 (Wadell, eq. 3.5.1).
///
///     x = t/b,  m = 2 / (1 + (2/3) x/(1-x))
///     dW/(b-t) = x/(pi(1-x)) [1 - 1/2 ln((x/(2-x))^2 + (0,0796 x/(W/b + 1,1 x))^m)]
///     W'/(b-t) = W/(b-t) + dW/(b-t),  a = 4 / (pi W'/(b-t))
///     Z = (eta0 / 4pi) ln(1 + a (2a + racine(4a^2 + 6,27)))
///
/// Donnee a 0,5 % pour W/(b-t) > 0,1 et t/b < 0,5 -- elle rejoint la solution
/// exacte en integrales elliptiques quand t tend vers zero. b est la distance
/// ENTRE LES DEUX PLANS. Rend None hors domaine.
pub fn _z_air_triplaque(w: f64, t: f64, b: f64) -> Option<f64> {
    if !(w > 0.0 && b > 0.0 && 0.0 <= t && t < b) {
        return None;
    }
    let wp = (w + _elargissement_triplaque(w, t, b)) / (b - t);
    if !(wp > 0.0) {
        return None;
    }
    let a = 4.0 / (PI * wp);
    Some((ETA_0 / (4.0 * PI)) * (1.0 + a * (2.0 * a + (4.0 * a * a + 6.27).sqrt())).ln())
}

/// La topologie des pertes : « micro » ou « triplaque ».
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize)]
pub enum Topologie {
    #[serde(rename = "micro")]
    Micro,
    #[serde(rename = "triplaque")]
    Triplaque,
}

impl Topologie {
    pub fn nom(self) -> &'static str {
        match self {
            Topologie::Micro => "micro",
            Topologie::Triplaque => "triplaque",
        }
    }
}

/// « micro » ou « triplaque » : donnee, ou lue sur eps_eff (milieu homogene
/// -> triplaque).
pub fn _topologie_pertes(topologie: Option<&str>, eps_eff: f64, epsilon_r: f64) -> Topologie {
    let t = topologie.unwrap_or("").trim().to_lowercase();
    if ["strip", "stripline", "triplaque"].contains(&t.as_str()) {
        return Topologie::Triplaque;
    }
    if ["micro", "microstrip", "microruban"].contains(&t.as_str()) {
        return Topologie::Micro;
    }
    let er = epsilon_r;
    if !(er > 1.0) {
        // Dans l'air tout milieu est homogene : rien ne les distingue, et le
        // microruban est le cas courant d'une carte.
        return Topologie::Micro;
    }
    if eps_eff >= er * (1.0 - 2e-3) {
        Topologie::Triplaque
    } else {
        Topologie::Micro
    }
}

pub fn _z_air_section(topo: Topologie, w: f64, t: f64, h: f64) -> Option<f64> {
    match topo {
        Topologie::Triplaque => _z_air_triplaque(w, t, h),
        Topologie::Micro => _z_air_microruban(w, t, h),
    }
}

/// La paroi qui recule dans `_recul`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Paroi {
    Ruban,
    Plan,
}

/// La section quand les parois de `paroi` reculent de n dans le metal.
///
/// Microruban : le ruban perd n sur chaque flanc et chaque face (w - 2n,
/// t - 2n), sa face inferieure monte de n ; le plan descend de n. Triplaque :
/// meme ruban, centre, et chacun des deux plans recule de n (b + 2n).
pub fn _recul(topo: Topologie, paroi: Paroi, w: f64, t: f64, h: f64, n: f64) -> (f64, f64, f64) {
    let micro = topo == Topologie::Micro;
    match paroi {
        Paroi::Ruban => (w - 2.0 * n, t - 2.0 * n, h + if micro { n } else { 0.0 }),
        Paroi::Plan => (w, t, h + if micro { n } else { 2.0 * n }),
    }
}

/// La regle de l'inductance incrementale, sur une section quelconque.
///
/// `z_air_recule(n)` rend le Z0 DANS L'AIR de la section dont les parois
/// parcourues ont recule de n (metres) dans le metal. On rend
///
///     (1 / eta0) . dZ0_air/dn    [1/m]
///
/// qu'il suffit de multiplier par Rs pour avoir R en ohms par metre. La
/// derivee est centree, a +-`pas` : erreur en pas^2. Rend None si la section
/// reculee sort du domaine de la formule.
pub fn resistance_wheeler(z_air_recule: impl Fn(f64) -> Option<f64>, pas: f64) -> Option<f64> {
    let p = pas;
    let z_p = z_air_recule(p)?;
    let z_m = z_air_recule(-p)?;
    let k = (z_p - z_m) / (2.0 * p * ETA_0);
    (k.is_finite() && k > 0.0).then_some(k)
}

type CleHauteur = (Topologie, u64, u64, u64);
static HAUTEURS: Mutex<Option<HashMap<CleHauteur, Option<f64>>>> = Mutex::new(None);

/// La hauteur (h, ou b en triplaque) qui rend ce Z0_air a cette largeur.
///
/// Z0_air croit avec la hauteur, et doucement en log h : fausse position de
/// l'Illinois sur ln h, dans [w/1e4, 1e4 w], jusqu'a 1e-12 pres sur Z0_air --
/// une dizaine d'evaluations. En cache : un meme troncon revient a chaque
/// frequence. None si la cible sort de la plage de la formule.
pub fn _hauteur_deduite(topo: Topologie, z_air: f64, w: f64, t: f64) -> Option<f64> {
    let cle = (topo, z_air.to_bits(), w.to_bits(), t.to_bits());
    if let Some(h) = HAUTEURS.lock().unwrap_or_else(|e| e.into_inner()).get_or_insert_with(HashMap::new).get(&cle) {
        return *h;
    }
    let h = hauteur_deduite(topo, z_air, w, t);
    let mut cache = HAUTEURS.lock().unwrap_or_else(|e| e.into_inner());
    let cache = cache.get_or_insert_with(HashMap::new);
    if cache.len() >= 4096 {
        cache.clear(); // shortcut: le cache se vide d'un coup a 4096 entrees, la ou lru_cache retirait la plus ancienne
    }
    cache.insert(cle, h);
    h
}

fn hauteur_deduite(topo: Topologie, z_air: f64, w: f64, t: f64) -> Option<f64> {
    let lo = if topo == Topologie::Triplaque { (w * 1e-4).max(1.25 * t) } else { w * 1e-4 };
    let hi = w.max(t) * 1e4;
    let z_lo = _z_air_section(topo, w, t, lo)?;
    let z_hi = _z_air_section(topo, w, t, hi)?;
    if !(z_lo <= z_air && z_air <= z_hi) {
        return None;
    }
    let (mut a, mut fa) = (lo.ln(), z_lo - z_air);
    let (mut b, mut fb) = (hi.ln(), z_hi - z_air);
    if fa == 0.0 {
        return Some(lo);
    }
    if fb == 0.0 {
        return Some(hi);
    }
    let mut cote = 0;
    let mut c = 0.5 * (a + b);
    for _ in 0..200 {
        c = (a * fb - b * fa) / (fb - fa);
        let z = _z_air_section(topo, w, t, c.exp())?;
        let fc = z - z_air;
        if fc.abs() <= 1e-12 * z_air || (b - a).abs() <= 1e-14 {
            break;
        }
        if fc * fb > 0.0 {
            (b, fb) = (c, fc);
            if cote == -1 {
                fa *= 0.5;
            }
            cote = -1;
        } else {
            (a, fa) = (c, fc);
            if cote == 1 {
                fb *= 0.5;
            }
            cote = 1;
        }
    }
    Some(c.exp())
}

// ==========================================================================
// LA RUGOSITE DU CUIVRE
// --------------------------------------------------------------------------
// Le cuivre electrodepose est rugueux, et ses dents -- quelques microns --
// sont de l'ordre de la profondeur de peau des le gigahertz : le courant suit
// le relief et le chemin s'allonge. Les deux modeles du metier rendent un
// FACTEUR K >= 1 sur alpha_c :
//
//   HAMMERSTAD-GROISS (1975) : K = 1 + (2/pi) atan(1,4 (Delta/delta)^2)
//       Delta = rugosite RMS. K -> 1 en basse frequence, -> 2 en haute :
//       le relief au plus double le chemin -- c'est sa limite connue, il sature
//       la ou les mesures continuent de monter.
//
//   HURAY (2010), « boules de neige », une seule taille de nodule :
//       K = 1 + (3/2) . SR / (1 + delta/a + delta^2/(2 a^2))
//       a = rayon du nodule, SR = N . 4 pi a^2 / A_plat le rapport de la
//       surface des nodules a la surface plane. K est BORNE par 1 + 3/2 SR,
//       et n'a pas la saturation a 2 de Hammerstad.
//
// Zero rugosite rend K = 1 exactement : rien ne change pour qui ne la donne pas.
// ==========================================================================

/// Le facteur K >= 1 de la rugosite sur alpha_c. TOUT EN METRES.
///
/// `freq` scalaire ou tableau (rend alors un tableau). « hammerstad » lit
/// `rugosite_rms` ; « huray » lit `rayon_nodule` et `rapport_surface`. Un
/// parametre nul, ou un modele inconnu, rend 1.
///
/// La forme scalaire ; `facteur_rugosite_vec` rend le tableau.
pub fn facteur_rugosite(freq: f64, rugosite_rms: f64, modele: &str, rayon_nodule: f64, rapport_surface: f64) -> f64 {
    facteur_rugosite_sigma(freq, rugosite_rms, modele, rayon_nodule, rapport_surface, SIGMA_CU)
}

pub fn facteur_rugosite_sigma(freq: f64, rugosite_rms: f64, modele: &str, rayon_nodule: f64, rapport_surface: f64, sigma: f64) -> f64 {
    let m = if modele.is_empty() { "hammerstad".to_string() } else { modele.trim().to_lowercase() };
    // Le chemin scalaire, sans tableau : `line_losses` l'appelle a chaque
    // frequence de chaque troncon.
    let f = freq;
    if !(f > 0.0) {
        return 1.0;
    }
    let delta = (1.0 / (PI * f * MU_0 * sigma)).sqrt();
    if m == "hammerstad" && rugosite_rms > 0.0 {
        return 1.0 + (2.0 / PI) * (1.4 * (rugosite_rms / delta) * (rugosite_rms / delta)).atan();
    }
    if m == "huray" && rayon_nodule > 0.0 && rapport_surface > 0.0 {
        let a = rayon_nodule;
        return 1.0 + 1.5 * rapport_surface / (1.0 + delta / a + delta * delta / (2.0 * a * a));
    }
    1.0
}

/// `facteur_rugosite` sur un tableau de frequences.
pub fn facteur_rugosite_vec(freqs: &[f64], rugosite_rms: f64, modele: &str, rayon_nodule: f64, rapport_surface: f64) -> Vec<f64> {
    freqs.iter().map(|&f| facteur_rugosite(f, rugosite_rms, modele, rayon_nodule, rapport_surface)).collect()
}

/// Les options de rugosite qu'un plan peut porter : celles de `facteur_rugosite`, sous les
/// noms de `line_losses`. (La cle inconnue que le Python refusait ne peut plus s'ecrire.)
#[derive(Debug, Clone, PartialEq)]
pub struct RugositePlan {
    pub rugosite_rms: f64,
    pub modele_rugosite: String,
    pub rayon_nodule: f64,
    pub rapport_surface: f64,
}

impl Default for RugositePlan {
    fn default() -> Self {
        RugositePlan { rugosite_rms: 0.0, modele_rugosite: "hammerstad".into(), rayon_nodule: 0.0, rapport_surface: 0.0 }
    }
}

/// Le facteur K du ou des plans de reference, ou None quand le plan n'a
/// pas de rugosite propre (il prend alors celui du ruban).
///
/// `rugosite_plan` : un dict d'options de rugosite (vide : plan lisse,
/// K = 1), ou une liste de tels dicts -- les deux plans d'une triplaque --,
/// dont on rend la MOYENNE des facteurs. Une cle inconnue est refusee : une
/// faute de frappe rendrait sinon un plan lisse sans rien dire.
pub fn _facteur_rugosite_plan(freq: f64, rugosite_plan: Option<&[RugositePlan]>) -> Option<f64> {
    let plans = rugosite_plan?;
    if plans.is_empty() {
        return None;
    }
    let ks: f64 = plans
        .iter()
        .map(|o| {
            let modele = if o.modele_rugosite.is_empty() { "hammerstad" } else { &o.modele_rugosite };
            facteur_rugosite(freq, o.rugosite_rms, modele, o.rayon_nodule, o.rapport_surface)
        })
        .fold(0.0, |s, k| s + k);
    Some(ks / plans.len() as f64)
}

// ==========================================================================
// LE DIELECTRIQUE CAUSAL : DJORDJEVIC-SARKAR
// --------------------------------------------------------------------------
// Un er et un tan delta CONSTANTS sur toute la bande ne sont la permittivite
// d'aucun materiau : Kramers-Kronig lie les deux parties, et une perte non
// nulle impose une permittivite qui DECROIT avec la frequence. Le defaut ne se
// voit pas sur un |S21|, il se voit apres transformee de Fourier : une reponse
// impulsionnelle qui commence AVANT le front, et un oeil qui s'ouvre de travers.
//
// LE MODELE DE DJORDJEVIC ET SARKAR (2001), « large bande de Debye » : une
// infinite de poles de Debye repartis uniformement en log entre f1 et f2, dont
// la somme s'ecrit fermee :
//
//     eps(f) = eps_inf + Delta_eps / log10(f2/f1) . log10((f2 + j f)/(f1 + j f))
//
// Entre f1 et f2, er decroit LINEAIREMENT EN log f et tan delta est presque
// plat -- ce que mesurent les fiches de stratifie. On le cale sur la valeur
// donnee a f_ref : deux equations (partie reelle, partie imaginaire), deux
// inconnues (eps_inf, Delta_eps). Causal par construction : c'est une somme de
// Debye, analytique dans le demi-plan.
// ==========================================================================

/// (er(f), tan_delta(f)) causaux, cales sur (er_ref, tand_ref) a f_ref.
///
/// `freqs` scalaire ou tableau, en hertz. Rend deux flottants ou deux
/// tableaux. A f_ref on retrouve exactement les valeurs donnees ; a frequence
/// nulle er vaut eps_inf + Delta_eps et tan delta zero.
///
/// La forme scalaire ; `djordjevic_sarkar_vec` rend les deux tableaux. Les defauts du
/// Python : f1 = 1e3, f2 = 1e12.
pub fn djordjevic_sarkar(er_ref: f64, tand_ref: f64, f_ref: f64, freq: f64, f1: f64, f2: f64) -> Res<(f64, f64)> {
    let (er0, td0, fr) = (er_ref, tand_ref, f_ref);
    if !(f2 > f1 && f1 > 0.0 && fr > 0.0) {
        return refus("djordjevic_sarkar : il faut 0 < f1 < f2 et f_ref > 0");
    }
    let m = (f2 / f1).log10();

    let forme = |x: f64| (Complex64::new(f2, x) / Complex64::new(f1, x)).log10() / m;

    let fr_c = forme(fr);
    let d_eps = -er0 * td0 / fr_c.im;
    let e_inf = er0 - d_eps * fr_c.re;
    let eps = e_inf + d_eps * forme(freq);
    Ok((eps.re, -eps.im / eps.re))
}

pub fn djordjevic_sarkar_vec(er_ref: f64, tand_ref: f64, f_ref: f64, freqs: &[f64], f1: f64, f2: f64) -> Res<(Vec<f64>, Vec<f64>)> {
    let mut er = Vec::with_capacity(freqs.len());
    let mut td = Vec::with_capacity(freqs.len());
    for &f in freqs {
        let (e, t) = djordjevic_sarkar(er_ref, tand_ref, f_ref, f, f1, f2)?;
        er.push(e);
        td.push(t);
    }
    Ok((er, td))
}

// ==========================================================================
// line_losses : le tout
// ==========================================================================

/// Les options nommees de `line_losses` et `line_losses_detaillees`, avec leurs defauts.
#[derive(Debug, Clone, PartialEq)]
pub struct OptionsPertes {
    pub epaisseur: f64,
    pub hauteur: Option<f64>,
    pub topologie: Option<String>,
    pub modele_conducteur: String,
    pub rugosite_rms: f64,
    pub modele_rugosite: String,
    pub rayon_nodule: f64,
    pub rapport_surface: f64,
    pub dielectrique_causal: bool,
    pub f_ref_dielectrique: f64,
    /// None : le plan prend la rugosite du ruban. Un plan, ou les deux d'une triplaque.
    pub rugosite_plan: Option<Vec<RugositePlan>>,
}

impl Default for OptionsPertes {
    fn default() -> Self {
        OptionsPertes {
            epaisseur: 35e-6,
            hauteur: None,
            topologie: None,
            modele_conducteur: "wheeler".into(),
            rugosite_rms: 0.0,
            modele_rugosite: "hammerstad".into(),
            rayon_nodule: 0.0,
            rapport_surface: 0.0,
            dielectrique_causal: false,
            f_ref_dielectrique: 1e9,
            rugosite_plan: None,
        }
    }
}

/// Le detail de `line_losses_detaillees`. Les cles depuis la 2.7.0 sont absentes (None) du
/// resultat degenere -- frequence, impedance ou largeur nulle --, comme en Python.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Pertes {
    pub alpha_c: f64,
    pub alpha_d: f64,
    #[serde(rename = "Rs")]
    pub rs: f64,
    pub delta_peau: f64,
    #[serde(rename = "R_ac_par_m")]
    pub r_ac_par_m: f64,
    #[serde(flatten, skip_serializing_if = "Option::is_none")]
    pub detail: Option<DetailPertes>,
    pub facteur_forme: f64,
    #[serde(rename = "alpha_c_dB")]
    pub alpha_c_db: f64,
    #[serde(rename = "alpha_d_dB")]
    pub alpha_d_db: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct DetailPertes {
    #[serde(rename = "R_ruban")]
    pub r_ruban: f64,
    #[serde(rename = "R_plan")]
    pub r_plan: f64,
    #[serde(rename = "R_dc")]
    pub r_dc: f64,
    #[serde(rename = "R_ancien")]
    pub r_ancien: f64,
    pub modele_conducteur: String,
    pub topologie: Topologie,
    pub hauteur: Option<f64>,
    pub hauteur_source: Option<&'static str>,
    pub facteur_rugosite: f64,
    pub er_f: f64,
    pub tan_delta_f: f64,
    pub eps_eff_f: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub facteur_rugosite_plan: Option<f64>,
}

/// Le calcul commun a `line_losses` et `line_losses_detaillees`.
pub fn _pertes(z0: f64, eps_eff: f64, largeur: f64, epsilon_r: f64, tan_delta: f64, freq: f64, o: &OptionsPertes) -> Res<Pertes> {
    let er = epsilon_r;
    let f = freq;
    let w = largeur;
    let t = o.epaisseur;

    let delta_peau = profondeur_peau(f);
    let rs = resistance_surface(f);

    // -- L'ANCIEN MODELE, toujours calcule : il sert au modele « ancien » et
    // au detail, pour qu'on puisse lire l'ecart.
    let r_ancien = if w > 2.0 * t {
        rs / w
    } else {
        (rs * (1.0 / w + 1.0 / t.max(1e-9))).min(rs / w)
    };

    let modele = if o.modele_conducteur.is_empty() { "wheeler".to_string() } else { o.modele_conducteur.trim().to_lowercase() };
    if !MODELES_CONDUCTEUR.contains(&modele.as_str()) {
        return refus(format!("modele_conducteur inconnu : '{}'", o.modele_conducteur));
    }
    let k_rug = facteur_rugosite(f, o.rugosite_rms, &o.modele_rugosite, o.rayon_nodule, o.rapport_surface);
    // LE PLAN, AVEC LA SIENNE QUAND ON LA DONNE (2.8.0) ; sinon celle du
    // ruban, et c'est le meme objet : le produit ne change pas d'un bit.
    let k_rug_plan = _facteur_rugosite_plan(f, o.rugosite_plan.as_deref()).unwrap_or(k_rug);

    let topo = _topologie_pertes(o.topologie.as_deref(), eps_eff, er);
    let mut h = None;
    let source_h;
    let mut r_dc = 0.0;
    let (r_ruban, r_plan);
    if modele == "ancien" {
        r_ruban = r_ancien * k_rug;
        r_plan = 0.0;
        source_h = Some("sans objet");
    } else {
        let t_c = t.max(EPAISSEUR_MIN_WHEELER);
        let mut source = None;
        match o.hauteur {
            Some(hauteur) if hauteur > 0.0 => {
                h = Some(hauteur);
                source = Some("donnee");
            }
            _ => {
                h = _hauteur_deduite(topo, z0 * eps_eff.max(1.0).sqrt(), w, t_c);
                if h.is_some() {
                    source = Some("deduite");
                }
            }
        }
        let (mut k_ruban, mut k_plan) = (None, None);
        if let Some(h) = h {
            let pas = 1e-3 * w.min(t_c).min(h);
            let section = |paroi| {
                move |n: f64| {
                    let (w, t, h) = _recul(topo, paroi, w, t_c, h, n);
                    _z_air_section(topo, w, t, h)
                }
            };
            k_ruban = resistance_wheeler(section(Paroi::Ruban), pas);
            k_plan = resistance_wheeler(section(Paroi::Plan), pas);
        }
        let (k_ruban, k_plan) = match (k_ruban, k_plan) {
            (Some(r), Some(p)) => (r, p),
            _ => {
                // REPLI : les plaques paralleles, ruban et plan chacun Rs/w.
                source = Some("repli plaques paralleles");
                (1.0 / w, 1.0 / w)
            }
        };
        source_h = source;
        r_dc = if t > 0.0 { 1.0 / (SIGMA_CU * w * t) } else { 0.0 };
        r_ruban = (rs * k_rug * k_ruban).hypot(r_dc);
        r_plan = rs * k_rug_plan * k_plan;
    }

    let r_tot = r_ruban + r_plan;
    let alpha_c = r_tot / (2.0 * z0);

    // -- dielectrique
    let (mut er_f, mut td_f, mut eps_f) = (er, tan_delta, eps_eff);
    if o.dielectrique_causal && er > 1.0 && td_f > 0.0 {
        (er_f, td_f) = djordjevic_sarkar(er, td_f, o.f_ref_dielectrique, f, 1e3, 1e12)?;
        // Le remplissage du microruban ne bouge pas : seul er bouge.
        let q = (eps_eff - 1.0) / (er - 1.0);
        eps_f = 1.0 + q * (er_f - 1.0);
    }
    let remplissage = if er_f > 1.0 { (er_f * (eps_f - 1.0)) / (eps_f * (er_f - 1.0)) } else { 1.0 };
    let alpha_d = (PI * f * eps_f.sqrt() / C_0) * td_f * remplissage;

    Ok(Pertes {
        alpha_c,
        alpha_d,
        rs,
        delta_peau,
        r_ac_par_m: r_tot,
        detail: Some(DetailPertes {
            r_ruban,
            r_plan,
            r_dc,
            r_ancien,
            modele_conducteur: modele,
            topologie: topo,
            hauteur: h,
            hauteur_source: source_h,
            facteur_rugosite: k_rug,
            er_f,
            tan_delta_f: td_f,
            eps_eff_f: eps_f,
            facteur_rugosite_plan: o.rugosite_plan.as_ref().map(|_| k_rug_plan),
        }),
        facteur_forme: 0.0,
        alpha_c_db: 0.0,
        alpha_d_db: 0.0,
    })
}

/// Atténuation linéique, en nepers par mètre : (alpha_c, alpha_d). EN SI.
///
/// CONDUCTEUR (2.7.0) : la règle de l'inductance incrémentale de Wheeler,
/// ruban ET plan(s) de référence ET bords -- voir l'en-tête de section plus
/// haut. alpha_c = R / (2 Z0), R = (Rs/eta0) dZ0_air/dn, sur Hammerstad-
/// Jensen (microruban) ou Wheeler 1978 (triplaque), plus la résistance
/// continue du ruban en quadrature.
///
///   `hauteur`   : h au plan (microruban) ou b ENTRE les deux plans
///                 (triplaque). None : déduite de Z0.racine(eps_eff).
///   `topologie` : « micro » ou « triplaque ». None : triplaque si
///                 eps_eff = er (milieu homogène), microruban sinon.
///   `modele_conducteur` : « wheeler » (défaut) ou « ancien », qui rend au
///                 bit près le Rs/(2 Z0 w) des versions jusqu'à 2.6.0.
///
/// RUGOSITÉ : facteur K de `facteur_rugosite` sur alpha_c. `rugosite_rms`
/// (Hammerstad-Groiss) ou `rayon_nodule` + `rapport_surface` (Huray, avec
/// modele_rugosite="huray"). Zéro par défaut : K = 1, rien ne change.
/// `rugosite_plan` (2.8.0) : la rugosité PROPRE du ou des plans de
/// référence, qui ne touche que R_plan -- un dict des mêmes options (vide :
/// plan lisse), ou une liste de dicts (les deux plans d'une triplaque, dont
/// on prend la moyenne des facteurs). None : le plan prend celle du ruban,
/// au bit près comme en 2.7.0.
///
/// DIÉLECTRIQUE : alpha_d = (pi f racine(eps_eff) / c) tan_delta . q, q le
/// facteur de remplissage. Avec `dielectrique_causal=True`, er et tan_delta
/// sont lus comme les valeurs à `f_ref_dielectrique` et prolongés par
/// Djordjevic-Sarkar ; eps_eff suit er à remplissage constant. Désactivé par
/// défaut. Z0, lui, est celui que l'appelant passe : on ne le recalcule pas.
pub fn line_losses(z0: f64, eps_eff: f64, largeur: f64, epsilon_r: f64, tan_delta: f64, freq: f64, o: &OptionsPertes) -> Res<(f64, f64)> {
    if !(freq > 0.0) || !(z0 > 0.0) || !(largeur > 0.0) {
        return Ok((0.0, 0.0));
    }
    let d = _pertes(z0, eps_eff, largeur, epsilon_r, tan_delta, freq, o)?;
    Ok((d.alpha_c, d.alpha_d))
}

/// Atténuation détaillée avec toutes les composantes.
///
/// Mêmes options nommées que `line_losses`. Retourne un dict avec :
///     - alpha_c : atténuation conducteur (Np/m)
///     - alpha_d : atténuation diélectrique (Np/m)
///     - Rs : résistance de surface (Ω/carré)
///     - delta_peau : profondeur de peau (m)
///     - R_ac_par_m : résistance linéique totale du conducteur (Ω/m),
///       ruban + plan(s) : alpha_c = R_ac_par_m / (2 Z0)
///     - facteur_forme : rapport P/(w*t) (périmètre sur section, 1/m)
///     - alpha_c_dB : alpha_c en dB/m
///     - alpha_d_dB : alpha_d en dB/m
/// et, depuis la 2.7.0 :
///     - R_ruban, R_plan, R_dc : les parts de R (Ω/m)
///     - R_ancien : le Rs/w de l'ancien modèle, pour lire l'écart
///     - modele_conducteur, topologie, hauteur (m), hauteur_source
///       (« donnee », « deduite », « repli plaques paralleles »)
///     - facteur_rugosite
///     - er_f, tan_delta_f, eps_eff_f : le diélectrique à cette fréquence
/// et, depuis la 2.8.0, quand `rugosite_plan` est donné :
///     - facteur_rugosite_plan : le K appliqué à R_plan
pub fn line_losses_detaillees(z0: f64, eps_eff: f64, largeur: f64, epsilon_r: f64, tan_delta: f64, freq: f64, o: &OptionsPertes) -> Res<Pertes> {
    if !(freq > 0.0) || !(z0 > 0.0) || !(largeur > 0.0) {
        return Ok(Pertes {
            alpha_c: 0.0,
            alpha_d: 0.0,
            rs: 0.0,
            delta_peau: 0.0,
            r_ac_par_m: 0.0,
            detail: None,
            facteur_forme: 0.0,
            alpha_c_db: 0.0,
            alpha_d_db: 0.0,
        });
    }
    let mut d = _pertes(z0, eps_eff, largeur, epsilon_r, tan_delta, freq, o)?;
    let w = largeur;
    let t = o.epaisseur;
    d.facteur_forme = 2.0 * (w + t) / (w * t).max(1e-12);
    d.alpha_c_db = 8.686 * d.alpha_c;
    d.alpha_d_db = 8.686 * d.alpha_d;
    Ok(d)
}
