//! Le niveau 2 : statuts, pic de bruit relatif, pertes au genou, somme des agresseurs, front
//! de classe.

use super::*;
use crate::simulation_em::base::*;

// ==========================================================================
// LE NIVEAU 2 : LE PIC DE BRUIT RELATIF, SANS TENSION NI PROTOCOLE
// --------------------------------------------------------------------------
// Un echelon d'agresseur UNITAIRE, un front t_r, des lignes ADAPTEES : le
// NEXT et le FEXT sortent alors en fraction de l'agresseur, et rien d'autre
// n'est a connaitre. Ce sont les formules des lignes faiblement couplees --
// les memes que `analyse_carte.diaphonie` pour la carte entiere, et c'est
// voulu : deux outils qui jugent le meme longement doivent rendre le meme
// chiffre.
//
// LE COUPLAGE PEUT VARIER LE LONG DU LONGEMENT, et la somme le suit : chaque
// morceau (bloc de section constante, ou superposition) apporte son Kb.dT et
// son Kf.dT. Avec un couplage uniforme, Sum(Kb.2dT) = Kb.2T_d et l'on
// retrouve exactement les deux cas du NEXT :
//     2 T_d >= t_r  ->  NEXT = Kb              (sature)
//     2 T_d <  t_r  ->  NEXT = Kb . 2T_d / t_r  (non sature)
// Avec un couplage qui varie, la saturation se lit sur le plus fort des Kb :
// aucun morceau ne peut renvoyer plus que son propre plafond.
// ==========================================================================

/// « vert » sous le seuil orange, « rouge » au-dela du rouge, « orange »
/// entre les deux -- les deux seuils en fraction de l'agresseur.
pub fn statut(valeur: f64, orange: f64, rouge: f64) -> &'static str {
    if valeur > rouge {
        return "rouge";
    }
    if valeur >= orange {
        return "orange";
    }
    "vert"
}

/// `ORDRE_STATUT.get(s, 0)`
pub fn ordre_statut(s: &str) -> i64 {
    match s {
        "orange" => 1,
        "rouge" => 2,
        _ => 0,
    }
}

/// Le plus grave d'une liste de statuts ; « vert » pour une liste vide.
pub fn pire_statut<'a>(statuts: &[&'a str]) -> &'a str {
    let mut pire = match statuts.first() {
        Some(s) => *s,
        None => return "vert",
    };
    for s in &statuts[1..] {
        if ordre_statut(s) > ordre_statut(pire) {
            pire = s;
        }
    }
    pire
}

/// Un morceau couple : (Kb, Kf, dT, att). `att` vaut 1 quand les pertes ne sont pas comptees
/// (les triplets de Python).
pub type Morceau = (f64, f64, f64, f64);

/// Le diagnostic d'une paire, a partir de ses morceaux couples.
///
/// `morceaux` : [(Kb, Kf, dT)] ou [(Kb, Kf, dT, att)] -- les deux
/// coefficients de chaque portion couplee, le retard de la victime sur cette
/// portion, en secondes, et, quand les PERTES sont comptees, l'attenuation
/// de l'aller-retour jusqu'a elle (exp(-2.alpha.x), voir `alpha_genou`).
/// `att_fext` : l'attenuation du trajet du bruit avant, exp(-alpha.L).
/// `t_r` : le front, en secondes. Rend le tuple de diagnostic sous forme de
/// dictionnaire : k_total, NEXT et FEXT (fraction, % et dB), T_d, la
/// saturation et les trois statuts.
pub fn niveau2(morceaux: &[Morceau], t_r: f64, orange: f64, rouge: f64, att_fext: f64) -> Json {
    let t_r = if t_r > 0.0 { t_r } else { TR_DEFAUT };
    let max0 = |v: Vec<f64>| if v.is_empty() { 0.0 } else { maxf(&v) };
    let kb_max = max0(morceaux.iter().map(|m| m.0).collect());
    let kf_max = max0(morceaux.iter().map(|m| m.1.abs()).collect());
    // LE PLAFOND SATURE, ATTENUE COMME SON MORCEAU : avec pertes, un morceau
    // lointain ne renvoie plus tout son Kb jusqu'au bout proche.
    let kb_plafond = max0(morceaux.iter().map(|m| m.0 * m.3).collect());
    let s_kb = py::sum(morceaux.iter().map(|m| m.0 * m.2 * m.3));
    let s_kf = py::sum(morceaux.iter().map(|m| m.1 * m.2));
    let td = py::sum(morceaux.iter().map(|m| m.2));
    let non_sature = 2.0 * s_kb / t_r;
    let sature = kb_plafond > 0.0 && non_sature >= kb_plafond;
    let nxt = if sature { kb_plafond } else { non_sature };
    // LE FEXT SATURE A 50 % : quand l'ecart de retard des modes pair et impair
    // depasse le front, la victime ne voit plus que la demi-difference de deux
    // echelons separes. La loi lineaire |Kf|.T_d/t_r, elle, n'a pas de borne
    // (300 mm de microruban sous 100 ps : 75 % annonces, 50 % reels).
    let fext_brut = s_kf.abs() / t_r;
    let fext_sature = fext_brut >= FEXT_PLAFOND;
    let fxt = if fext_sature { FEXT_PLAFOND * att_fext } else { s_kf.abs() * att_fext / t_r };
    let (s_n, s_f) = (statut(nxt, orange, rouge), statut(fxt, orange, rouge));
    obj! {
        // LE COUPLAGE GEOMETRIQUE PUR, au morceau le plus serre :
        // 1/2 (Cm/C11 + Lm/L11), soit deux fois le Kb.
        "k_total" => round(2.0 * kb_max, 6),
        "kb" => round(kb_max, 6), "kf" => round(kf_max, 6),
        "td_s" => td, "td_ps" => round(1e12 * td, 3),
        // LE FRONT AU-DESSOUS DUQUEL LE NEXT SATURE : 2 T_d pour un couplage
        // uniforme, moins quand il culmine sur une partie du longement.
        "t_sature_ps" => if kb_max > 0.0 { round(1e12 * 2.0 * s_kb / kb_max, 3) } else { 0.0 },
        "t_r" => t_r, "sature" => sature, "fext_sature" => fext_sature,
        "next" => round(nxt, 6), "next_pc" => round(100.0 * nxt, 3),
        "next_db" => round(_db(nxt), 2),
        "fext" => round(fxt, 6), "fext_pc" => round(100.0 * fxt, 3),
        "fext_db" => round(_db(fxt), 2),
        "statut_next" => s_n, "statut_fext" => s_f,
        "statut" => pire_statut(&[s_n, s_f])}
}

/// L'attenuation de la ligne au GENOU du front, 0,35 / t_r, en Np/m.
///
/// R (effet de peau, `ligne_mom.line_losses_detaillees`) et G (tan delta du
/// dielectrique) -- les deux termes de RLGC que [C] et [L] ne portent pas.
/// Au genou, c'est la composante la plus haute que le front porte vraiment :
/// l'attenuation qu'on en tire est une MAJORATION de celle du front entier,
/// donc une correction prudente -- elle ne retire jamais plus que la ligne.
///
/// `options_pertes` (4.2.0) : les options nommees de `line_losses` --
/// topologie et rugosite de la couche, que l'appelant lit dans l'empilage
/// (`simulation_em._geometrie_pertes`, `_rugosite_couche`). Sans elles, le
/// chiffre d'avant.
///
/// Sans options (`None`), celles par defaut de `line_losses`.
pub fn alpha_genou(z0: f64, eps_eff: f64, largeur_mm: f64, epsilon_r: f64, tan_delta: f64, t_r: f64,
                   options_pertes: Option<&tl::OptionsPertes>) -> tl::Res<f64> {
    if !(z0 > 0.0 && eps_eff > 0.0 && largeur_mm > 0.0 && t_r > 0.0) {
        return Ok(0.0);
    }
    let defaut = tl::OptionsPertes::default();
    let d = tl::line_losses_detaillees(z0, eps_eff,
                                       largeur_mm * 1e-3,
                                       if epsilon_r != 0.0 { epsilon_r } else { eps_eff },
                                       tan_delta, 0.35 / t_r,
                                       options_pertes.unwrap_or(&defaut))?;
    Ok(d.alpha_c + d.alpha_d)
}

pub const SOMMES: [&str; 2] = ["pire", "rss"];

/// Le bruit cumule d'une victime sur plusieurs agresseurs.
///
/// « pire » : la somme ARITHMETIQUE, tous les agresseurs basculant ensemble
/// et en phase -- le pire cas. « rss » : la somme QUADRATIQUE (power sum),
/// racine de la somme des carres -- des agresseurs independants, qui ne
/// basculent pas tous au meme instant.
pub fn somme_agresseurs(niveaux: &[f64], mode: &str) -> f64 {
    if mode == "rss" {
        return py::sum(niveaux.iter().map(|x| x.abs() * x.abs())).sqrt();
    }
    py::sum(niveaux.iter().map(|x| x.abs()))
}

/// (t_r, source) du front d'un net de cette classe.
///
/// Les fronts du panneau de verification passent devant ceux d'origine ;
/// une classe sans front -- masse, alimentation, inconnue -- se juge comme
/// « Lent », comme dans `analyse_carte`.
///
/// UN NET RF A UNE PORTEUSE AVANT D'AVOIR UN FRONT. Quand `porteuse_rf` est
/// donnee, la classe « RF » se juge a t_r = 0,35 / f -- la meme regle que
/// `analyse_carte._reglages` --, et la source le dit. Sans elle, c'est le
/// front de la classe (100 ps) qui s'impose, et c'est `analyser` qui le fait
/// remarquer : un FEXT dix fois plus grand qu'a 1 ns ne doit pas sortir sans
/// un mot.
///
/// `tr_classes` : le dict {classe: s} du panneau, ou Nul.
pub fn front_de_classe(classe: &str, tr_classes: &Json, porteuse_rf: f64) -> (f64, String) {
    // fronts = TR_CLASSES, puis les interfaces, puis ceux du panneau : le dernier l'emporte
    let front = |c: &str| -> Option<Json> {
        if let Some(v) = tr_classes.get(c) {
            return Some(v.clone());
        }
        if let Some(i) = interface_de(c) {
            return Some(Json::Flottant(i.tr));
        }
        TR_CLASSES.iter().find(|(k, _)| *k == c).map(|(_, v)| Json::Flottant(*v))
    };
    let mut c = classe;
    if front(c).is_none() {
        c = "Lent";
    }
    let f = if porteuse_rf.is_finite() { porteuse_rf } else { 0.0 };
    if c == "RF" && f > 0.0 {
        return (0.35 / f, format!("déduit de la porteuse RF {} : t_r = 0,35 / f",
                                  _texte_frequence(f)));
    }
    let mut t_r = _nb(&front(c).unwrap_or(Json::Nul), 0.0);
    if !(t_r > 0.0) {
        return (TR_DEFAUT, "front de référence (1 ns)".into());
    }
    // UNE INTERFACE EST BORNEE PAR SA CADENCE, comme dans `analyse_carte`
    // (tr_effectif) : un front saisi trop lent pour sa cadence y est ramene.
    if let Some(i) = interface_de(c) {
        t_r = minf(&[t_r, 0.1 / i.cadence]);
    }
    (t_r, format!("déduit de la classe « {c} »"))
}

/// Une frequence lisible : « 868 MHz », « 2,4 GHz », « 13,6 MHz ».
pub fn _texte_frequence(f: f64) -> String {
    for (seuil, unite) in [(1e9, "GHz"), (1e6, "MHz"), (1e3, "kHz")] {
        if f >= seuil {
            return format!("{} {}", fmt_g(f / seuil, 3), unite).replace('.', ",");
        }
    }
    format!("{} Hz", fmt_g(f, 3)).replace('.', ",")
}

/// Une duree lisible : « 1 ns », « 250 ps ».
pub fn _texte_duree(t: f64) -> String {
    if t >= 1e-9 {
        return format!("{} ns", fmt_g(t * 1e9, 3));
    }
    format!("{} ps", fmt_g(t * 1e12, 3))
}
