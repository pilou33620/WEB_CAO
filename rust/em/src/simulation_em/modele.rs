// ==========================================================================
// LES OPTIONS DE ligne_mom 2.7.0, BRANCHEES ICI
// --------------------------------------------------------------------------
// `line_losses` sait depuis la 2.7.0 la hauteur, la topologie, la rugosite et
// le dielectrique causal, et `abcd_via_ligne` pose le via en troncon de ligne.
// Rien ne les lui passait. Ce qui suit les lit dans le document et les remet
// a qui calcule -- la cascade simple, la paire, la RF et l'oeil, qui passent
// tous par ici.
//
//   · HAUTEUR ET TOPOLOGIE : ACTIVES. La topologie se lisait sur eps_eff, et un
//     microruban COUVERT, dont eps_eff frole er, passait pour une triplaque ;
//     la hauteur se deduisait de Z0.racine(eps_eff), qui derive avec la
//     dispersion de Getsinger. On les donne quand la section les connait.
//     PAS LA HAUTEUR d'une section coplanaire ou d'un mode de paire : la
//     regle de Wheeler ne voit alors que le microruban, et la hauteur DEDUITE
//     -- plus basse -- est celle qui rend le courant resserre sur les aretes
//     en regard. Ni celle d'une triplaque nettement decentree, que la formule
//     de Wheeler 1978 suppose centree : la deduction rend mieux l'asymetrie.
//   · RUGOSITE : par couche de cuivre, dans l'empilage. Zero par defaut, et
//     zero rend K = 1 exactement. Le ruban prend celle de sa couche, le plan
//     de reference celle de la sienne quand elle la declare (5.1.0,
//     `_rugosite_section`), celle de la piste sinon.
//   · DIELECTRIQUE CAUSAL : dans l'empilage. Desactive par defaut. Il entre
//     dans les pertes ET dans la vitesse de phase : er(f) fait eps_eff(f) a
//     remplissage constant, et Z0 suit -- Z0.racine(eps_eff) ne depend que de
//     la geometrie. A f_ref, tout est identique au calcul non causal.
//   · MODELE DE VIA : « pi », « ligne » ou « auto » (defaut). La ligne porte
//     le MEME L et le MEME C que le pi -- elle le rejoint en basse frequence --
//     mais repartis : c'est le pi qui derive quand le via n'est plus court
//     devant la longueur d'onde. « auto » garde le pi tant que la phase du
//     via au haut de la bande reste sous SEUIL_VIA_LIGNE, ou les deux sont le
//     meme chiffre a 3e-4 pres, et passe en ligne au-dessus. ACTIF PAR
//     DEFAUT : sous le seuil le resultat est celui du pi au bit pres, et tous
//     les bancs passent avec (oeil a 16 Gb/s et RF compris).
// ==========================================================================

use super::base::*;
use super::transition::{ModeleVia, _admittance_moignon};
use super::ErreurSimulation;
use ligne_mom as tl;
use std::f64::consts::PI;

pub const MODELES_VIA: [&str; 3] = ["pi", "ligne", "auto"];
pub const MODELE_VIA_DEFAUT: &str = "auto";

// La frequence a laquelle la fiche du stratifie donne er et tan delta, quand
// l'empilage ne la dit pas. C'est celle des fiches de FR-4 courantes.
pub const F_REF_DIELECTRIQUE: f64 = 1e9;

// « auto » passe le via en ligne quand sa phase propre, omega.racine(L C) au
// haut de la bande, depasse ce seuil. A 0,3 rad, le pi C/2-L-C/2 s'ecarte de
// la ligne de theta^4/24 = 3e-4 sur le terme A : en dessous, les deux sont le
// meme chiffre et le pi garde ses resultats au bit pres.
pub const SEUIL_VIA_LIGNE: f64 = 0.3;

// Au-dela de cette dissymetrie (|t_haut - t_bas| / max), une triplaque ne
// recoit pas sa hauteur entre plans : Wheeler 1978 la suppose centree.
pub const DISSYM_MAX_HAUTEUR: f64 = 0.2;

/// Les options de rugosite de `line_losses` pour une couche de cuivre, EN
/// METRES. Rien quand la couche n'en porte pas : K = 1.
///
/// Le document les ecrit EN MICROMETRES, et la cle le dit : rugosite_rms_um,
/// rayon_nodule_um. C'est l'unite dans laquelle les fiches de cuivre les
/// donnent, et une rugosite en millimetres ne se relit pas.
///
/// C'EST LA RUGOSITE D'UNE COUCHE, celle de la piste quand on l'appelle sur
/// la piste. Le plan de reference a la sienne depuis la 5.1.0 : voir
/// `_rugosite_section`, qui l'ajoute quand elle differe.
pub fn _rugosite_couche(couches: &[Json], indice: i64) -> Json {
    if !(0 <= indice && indice < couches.len() as i64) {
        return obj! {};
    }
    let c = &couches[indice as usize];
    if c["type"].as_str() != Some("copper") {
        return obj! {};
    }
    let modele = if c["modele_rugosite"].vrai() { str_py(&c["modele_rugosite"]) } else { "hammerstad".to_string() };
    let modele = py::strip(&modele).to_lowercase();
    let rms = maxf(&[0.0, _nombre(&c["rugosite_rms_um"], 0.0)]);
    let a = maxf(&[0.0, _nombre(&c["rayon_nodule_um"], 0.0)]);
    let sr = maxf(&[0.0, _nombre(&c["rapport_surface"], 0.0)]);
    if modele == "huray" && a > 0.0 && sr > 0.0 {
        return obj! {"modele_rugosite" => "huray", "rayon_nodule" => a * 1e-6,
                     "rapport_surface" => sr};
    }
    if rms > 0.0 {
        return obj! {"modele_rugosite" => "hammerstad", "rugosite_rms" => rms * 1e-6};
    }
    obj! {}
}

// Les cles par lesquelles une couche DECLARE sa rugosite -- zero compris : un
// plan qui ecrit « rugosite_rms_um: 0 » se dit lisse, un plan qui n'ecrit rien
// ne dit rien.
const _CLES_RUGOSITE_DOC: [&str; 4] = ["modele_rugosite", "rugosite_rms_um", "rayon_nodule_um", "rapport_surface"];

/// L'indice du plan de reference nomme `nom`, cherche depuis la piste dans
/// la direction ou `section_de_couche` l'a trouve. -1 sans nom ou sans
/// plan de ce nom : on ne devine pas lequel c'est.
pub fn _indice_plan(couches: &[Json], indice: i64, nom: &str, vers_le_haut: bool) -> i64 {
    if nom.is_empty() {
        return -1;
    }
    let pas = if vers_le_haut { -1 } else { 1 };
    let mut k = indice + pas;
    while 0 <= k && k < couches.len() as i64 {
        let c = &couches[k as usize];
        if c["type"].as_str() == Some("copper") && c["role"].as_str() == Some("plane") && txt(c, "name") == nom {
            return k;
        }
        k += pas;
    }
    -1
}

/// Les options de rugosite de `line_losses` pour une SECTION : celle de la
/// couche de la piste (`_rugosite_couche`), et celle de son ou ses plans de
/// reference quand elle en differe (`rugosite_plan`, ligne_mom 2.8.0).
///
/// LA RUGOSITE DU PLAN EST CELLE DE SA COUCHE. `line_losses` separe la
/// resistance du ruban de celle du plan ; jusqu'a la 5.0.1, un seul facteur
/// -- celui de la piste -- valait pour les deux. Un plan d'un autre
/// feuillard (un cuivre standard sous une piste en HVLP) etait donc compte
/// avec la rugosite de la piste.
///
/// UN PLAN QUI NE DECLARE RIEN PREND CELLE DE LA PISTE, comme avant : c'est le
/// meme feuillard dans la plupart des empilages, et c'est la regle qui garde
/// au bit pres tous les documents qui ne la donnent que pour la piste.
/// Declaree -- zero compris, `rugosite_rms_um: 0` dit un plan lisse --, elle
/// est la sienne. Les deux plans d'une triplaque partent ensemble, et
/// `line_losses` moyenne leurs facteurs. Un plan qu'on ne retrouve pas par
/// son nom garde celle de la piste.
///
/// EGALE A CELLE DE LA PISTE, ou non declaree : rien de plus ne part, et le
/// calcul est celui d'avant au bit pres.
pub fn _rugosite_section(couches: &[Json], indice: i64, info: &Json) -> Json {
    let mut kw = _rugosite_couche(couches, indice);
    let mut plans = Vec::new();
    for (cle, haut) in [("plan_haut", true), ("plan_bas", false)] {
        if info[cle].vrai() {
            plans.push(_indice_plan(couches, indice, txt(info, cle), haut));
        }
    }
    if plans.is_empty() {
        return kw;
    }
    let propres: Vec<Json> = plans.iter().map(|&k| {
        if k >= 0 && _CLES_RUGOSITE_DOC.iter().any(|cle| contient(&couches[k as usize], cle)) {
            _rugosite_couche(couches, k)
        } else {
            kw.clone()
        }
    }).collect();
    if propres.iter().all(|p| *p == kw) {
        return kw;
    }
    poser(&mut kw, "rugosite_plan", if propres.len() == 1 { propres[0].clone() } else { Json::Liste(propres) });
    kw
}

/// Les options de modele que porte le document (`options_modele`).
#[derive(Debug, Clone, PartialEq)]
pub struct OptionsModele {
    pub causal: bool,
    pub f_ref: f64,
    pub modele_via: &'static str,
}

/// Les options de modele que porte le document : {causal, f_ref,
/// modele_via}.
///
/// Elles vivent dans l'EMPILAGE -- ce sont des proprietes de la carte et de
/// la facon de la decrire, et l'empilage voyage tel quel jusqu'a la RF et a
/// l'oeil -- ; `analyse` peut les surcharger, pour un « et si » qui ne touche
/// pas a la carte.
pub fn options_modele(doc: &Json) -> OptionsModele {
    let st = &doc["stackup"];
    let an = &doc["analyse"];

    let lire = |cle: &str| -> Option<&Json> { [an, st].into_iter().map(|src| &src[cle]).find(|v| !nul(v)) };

    let mut f_ref = lire("f_ref_dielectrique").map_or(F_REF_DIELECTRIQUE, |v| _nombre(v, F_REF_DIELECTRIQUE));
    if !(f_ref > 0.0) {
        f_ref = F_REF_DIELECTRIQUE;
    }
    let mv = lire("modele_via").map_or(MODELE_VIA_DEFAUT.to_string(), str_ou_vide);
    let mv = py::strip(&mv).to_lowercase();
    let mv = match mv.as_str() {
        "π" | "pi_l_c" => "pi",
        autre => autre,
    };
    OptionsModele {
        causal: matches!(lire("dielectrique_causal"), Some(Json::Bool(true))),
        f_ref,
        modele_via: MODELES_VIA.into_iter().find(|m| *m == mv).unwrap_or(MODELE_VIA_DEFAUT),
    }
}

/// (er, tan delta) a la frequence f : la fiche telle quelle, ou prolongee
/// par Djordjevic-Sarkar quand le dielectrique est causal.
pub fn _dielectrique(er: f64, td: f64, f: f64, opts: Option<&OptionsModele>) -> Result<(f64, f64), ErreurSimulation> {
    match opts {
        Some(o) if o.causal && er > 1.0 && td > 0.0 && f > 0.0 => Ok(tl::djordjevic_sarkar(er, td, o.f_ref, f, 1e3, 1e12)?),
        _ => Ok((er, td)),
    }
}

/// Z0 et eps_eff quand er devient er_f, a REMPLISSAGE CONSTANT.
///
/// q = (eps_eff - 1)/(er - 1) ne depend que de la geometrie ; Z0.racine(eps_eff)
/// non plus -- c'est Z0 dans l'air. La meme approximation que
/// `ligne_mom._pertes`, et elle est exacte en triplaque (q = 1).
pub fn _milieu_causal(z0: f64, eps: f64, er: f64, er_f: f64) -> (f64, f64) {
    if er_f == er || !(er > 1.0) || !(eps > 0.0) {
        return (z0, eps);
    }
    let q = (eps - 1.0) / (er - 1.0);
    let eps_f = 1.0 + q * (er_f - 1.0);
    if !(eps_f > 0.0) {
        return (z0, eps);
    }
    (z0 * (eps / eps_f).sqrt(), eps_f)
}

/// Topologie et hauteur pour `line_losses`, EN METRES. Voir l'en-tete :
/// la hauteur seulement quand la section est le ruban seul face a son ou
/// ses plans.
pub fn _geometrie_pertes(info: &Json, coplanaire: bool, couple: bool) -> Json {
    let triplaque = info["topo"].as_str() == Some("strip");
    let mut kw = obj! {"topologie" => if triplaque { "triplaque" } else { "micro" }};
    if coplanaire || couple {
        return kw;
    }
    if triplaque {
        if _nombre(&info["dissym"], 0.0) <= DISSYM_MAX_HAUTEUR && _nombre(&info["b"], 0.0) > 0.0 {
            poser(&mut kw, "hauteur", num(info, "b"));
        }
    } else if _nombre(&info["h"], 0.0) > 0.0 {
        poser(&mut kw, "hauteur", num(info, "h"));
    }
    kw
}

/// `dict(a, **b)` : les options de `_geometrie_pertes` et de `_rugosite_section` reunies.
pub fn kw_reunis(mut a: Json, b: Json) -> Json {
    maj(&mut a, b);
    a
}

/// Les mots-cles de `line_losses` (ceux de `_geometrie_pertes` et de `_rugosite_section`,
/// reunis dans un dict en Python), en structure.
pub fn options_pertes(kw: &Json, epaisseur: f64) -> tl::OptionsPertes {
    let plan = |p: &Json| tl::RugositePlan {
        rugosite_rms: num(p, "rugosite_rms"),
        modele_rugosite: p["modele_rugosite"].as_str().unwrap_or("hammerstad").to_string(),
        rayon_nodule: num(p, "rayon_nodule"),
        rapport_surface: num(p, "rapport_surface"),
    };
    let d = tl::OptionsPertes::default();
    tl::OptionsPertes {
        epaisseur,
        hauteur: kw["hauteur"].as_f64(),
        topologie: kw["topologie"].as_str().map(String::from),
        rugosite_rms: num(kw, "rugosite_rms"),
        modele_rugosite: kw["modele_rugosite"].as_str().unwrap_or(&d.modele_rugosite).to_string(),
        rayon_nodule: num(kw, "rayon_nodule"),
        rapport_surface: num(kw, "rapport_surface"),
        rugosite_plan: match &kw["rugosite_plan"] {
            Json::Nul => None,
            Json::Liste(l) => Some(l.iter().map(plan).collect()),
            p => Some(vec![plan(p)]),
        },
        ..d
    }
}

/// (eps_eff, Z0, alpha_c, alpha_d) d'une section a la frequence f.
///
/// LE MEME CALCUL AU POINT CENTRAL ET DANS LA CASCADE : dielectrique (causal
/// ou non), Getsinger en microruban, puis les pertes avec les options de la
/// section. Sans option, c'est exactement ce que les deux faisaient.
#[allow(clippy::too_many_arguments)]
pub fn _ligne_a(z_stat: f64, eps_stat: f64, info: &Json, f: f64, w_m: f64, ep_m: f64, kw: &Json, opts: Option<&OptionsModele>) -> Result<(f64, f64, f64, f64), ErreurSimulation> {
    let (er, td) = (num(info, "er"), num(info, "tan_delta"));
    let (er_f, td_f) = _dielectrique(er, td, f, opts)?;
    let (z0, eps) = _milieu_causal(z_stat, eps_stat, er, er_f);
    let (eps_f, z_f) = if info["topo"].as_str() == Some("micro") {
        tl::dispersion_getsinger(z0, eps, er_f, num(info, "h"), f)
    } else {
        (eps, z0)
    };
    let (a_c, a_d) = tl::line_losses(z_f, eps_f, w_m, er_f, td_f, f, &options_pertes(kw, ep_m))?;
    Ok((eps_f, z_f, a_c, a_d))
}

/// Le produit de deux matrices 2 x 2 complexes.
pub fn mul2(a: &tl::Abcd, b: &tl::Abcd) -> tl::Abcd {
    [[a[0][0] * b[0][0] + a[0][1] * b[1][0], a[0][0] * b[0][1] + a[0][1] * b[1][1]],
     [a[1][0] * b[0][0] + a[1][1] * b[1][0], a[1][0] * b[0][1] + a[1][1] * b[1][1]]]
}

/// La matrice ABCD d'un via de la cascade, en pi ou en ligne. EN SI.
///
/// `l_via` et `c_via` remplacent le L et le C du modele -- c'est ce que fait
/// la paire en mode impair, ou la mutuelle des futs les change.
///
/// EN LIGNE, LE MEME L ET LE MEME C. Le C de la ligne est celui des antipads,
/// reparti sur le barreau ; les pastilles restent en derivation a chaque
/// bout, les moignons aussi (`_admittance_moignon`, contre-percage compris).
/// Zc = racine(L/C) et le retard racine(L C) font une permittivite equivalente
/// que `abcd_via_ligne` lit avec `z_via` : B -> j omega L et C -> j omega C en
/// basse frequence, le pi exactement. La traversee de cavite, en serie, se
/// pose au milieu du barreau.
pub fn _abcd_via(mv: &ModeleVia, f: f64, z_t: Complex64, modele: &str, l_via: Option<f64>, c_via: Option<f64>) -> tl::Abcd {
    let l_v = l_via.unwrap_or(mv.l);
    let c_v = c_via.unwrap_or(mv.c);
    let y_dep = _admittance_moignon(&mv.moignon_depart, mv.percage, mv.antipad, f);
    let y_arr = _admittance_moignon(&mv.moignon_arrivee, mv.percage, mv.antipad, f);
    if let Some(lg) = &mv.ligne {
        let c_dist = c_v - lg.c_depart - lg.c_arrivee;
        if modele == "ligne" && l_v > 0.0 && c_dist > 0.0 && lg.longueur > 0.0 {
            let tau = (l_v * c_dist).sqrt();
            let z_v = (l_v / c_dist).sqrt();
            let er_eq = (tl::C_0 * tau / lg.longueur).powi(2);
            let demi = lg.longueur / 2.0;
            let d = mv.percage * 1e-3;
            let da = mv.antipad * 1e-3;
            let haut = tl::abcd_via_ligne(demi, d, da, er_eq, f,
                                          &tl::OptionsViaLigne { tan_delta: lg.tan_delta, c_depart: lg.c_depart, z_via: Some(z_v), ..Default::default() });
            let bas = tl::abcd_via_ligne(demi, d, da, er_eq, f,
                                         &tl::OptionsViaLigne { tan_delta: lg.tan_delta, c_arrivee: lg.c_arrivee, z_via: Some(z_v), ..Default::default() });
            let (un, zero) = (Complex64::new(1.0, 0.0), Complex64::new(0.0, 0.0));
            let serie = [[un, z_t], [zero, un]];
            let gauche = [[un, zero], [y_dep, un]];
            let droite = [[un, zero], [y_arr, un]];
            return mul2(&mul2(&mul2(&mul2(&gauche, &haut), &serie), &bas), &droite);
        }
    }
    tl::abcd_via_complet(l_v, c_v, f, y_dep, y_arr, z_t)
}

/// « pi » ou « ligne » pour CE via. « auto » choisit la ligne quand la
/// phase du via au haut de la bande depasse SEUIL_VIA_LIGNE ; une ligne sans
/// capacite repartie (aucun plan traverse) reste un pi -- elle n'aurait pas
/// de quoi se repartir.
pub fn _modele_via_resolu(mv: &mut ModeleVia, demande: &str, f_max: f64) -> &'static str {
    let c_dist = mv.ligne.as_ref().map_or(mv.c, |lg| mv.c - lg.c_depart - lg.c_arrivee);
    let possible = mv.ligne.is_some() && mv.l > 0.0 && c_dist > 0.0;
    let theta = if possible { 2.0 * PI * f_max * (mv.l * c_dist).sqrt() } else { 0.0 };
    mv.phase_rad = theta;
    if demande == "ligne" && possible {
        return "ligne";
    }
    if demande == "auto" && possible && theta > SEUIL_VIA_LIGNE {
        return "ligne";
    }
    "pi"
}
