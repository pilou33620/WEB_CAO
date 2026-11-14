//! Banc d'essai du solveur d'impedance (python/ligne_mom.py) -- la part qui passe par
//! simulation_em.
//!
//!     cargo test -p em
//!
//! Le portage des cas de python/test/banc-ligne-mom.py que le banc de `ligne_mom`
//! (rust/ligne_mom/tests/banc/) avait laisses de cote parce qu'ils passent par
//! simulation_em : memes cas, memes titres, memes etalons, memes tolerances. Le style est
//! celui du banc Python : pas de harnais, un decompte a la fin, un code de retour.
//!
//! S'y ajoutent python/test/banc-usimmics.py (`usimmics`) et la part simulation_em de
//! python/test/banc-entrees-malformees.py (`malformees`).
//!
//! EN ATTENTE DE rf_reseau : les deux dernieres verifications du cas « la section passe la
//! rugosite de son plan de reference » (`rf_reseau._ligne`) ; le reste du cas est porte.
//!
//! S'y ajoute python/test/banc-crosstalk.py en entier (`xt_a`, `xt_b`, `xt_c` ; `xt` porte la
//! carte d'essai) : 56 de ses 57 cas, memes titres, memes etalons, memes tolerances.
//! EN ATTENTE DE rf_reseau : « rf_reseau : deux instances SPICE ont chacune leurs noeuds
//! internes ». EN ATTENTE DE analyse_carte : la comparaison au fil fin de « deux niveaux »
//! (`analyse_carte._kb_larges_faces`), dont le reste est porte. Et la part crosstalk de
//! banc-entrees-malformees.py.

#![allow(clippy::excessive_precision, clippy::approx_constant, non_snake_case)]

mod appariement;
mod empilage_vias;
mod hors_chaine_topologie;
mod moignons_cavite;
mod options;
mod paire;
mod retour_cavite;
mod malformees;
mod usimmics;
mod xt;
mod xt_a;
mod xt_b;
mod xt_c;

pub use em::simulation_em::base::*;
pub use em::simulation_em::*;
pub use std::f64::consts::PI;
use std::sync::atomic::{AtomicUsize, Ordering};

pub const H: f64 = 0.2e-3;
static OK: AtomicUsize = AtomicUsize::new(0);
static KO: AtomicUsize = AtomicUsize::new(0);

/// Un cas : `fonction` passe, ou panique avec ce qui cloche (l'`assert` du Python).
pub fn T(titre: &str, fonction: impl FnOnce()) {
    match std::panic::catch_unwind(std::panic::AssertUnwindSafe(fonction)) {
        Ok(()) => {
            OK.fetch_add(1, Ordering::Relaxed);
            println!("  ok  {titre}");
        }
        Err(e) => {
            KO.fetch_add(1, Ordering::Relaxed);
            let message = e.downcast_ref::<String>().cloned().or_else(|| e.downcast_ref::<&str>().map(|s| s.to_string())).unwrap_or_default();
            println!("  KO  {titre}\n        {message}");
        }
    }
}

/// Ajoute au decompte les cas d'un banc qui tient le sien (uSimmics).
pub fn compter(ok: usize, ko: usize) {
    OK.fetch_add(ok, Ordering::Relaxed);
    KO.fetch_add(ko, Ordering::Relaxed);
}

pub fn proche(vu: f64, attendu: f64, tol: f64, quoi: &str) {
    let ecart = (vu - attendu).abs() / attendu.abs();
    assert!(ecart < tol, "{quoi} : {vu:.4} contre {attendu:.4}, soit {:.2} % (tolere {:.2} %)", 100.0 * ecart, 100.0 * tol);
}

pub fn titre(t: &str) {
    println!("\n{t}");
}

// ==========================================================================
// Ce que Python ecrivait d'un trait sur ses dict
// ==========================================================================

/// Un document ou un morceau de document, ecrit en JSON.
pub fn j(texte: &str) -> Json {
    loads(texte).unwrap_or_else(|e| panic!("JSON du banc : {e} dans {texte}"))
}

/// La valeur d'un nombre du resultat (panique si ce n'en est pas un, comme `v > 0` sur None).
pub fn n(v: &Json) -> f64 {
    v.as_f64().unwrap_or_else(|| panic!("un nombre etait attendu, pas {}", dumps(v)))
}

/// Le texte d'une valeur du resultat ("" si ce n'en est pas un).
pub fn t(v: &Json) -> &str {
    v.as_str().unwrap_or("")
}

/// `dict(d, cle=valeur, ...)`
pub fn avec(d: &Json, ajouts: &[(&str, Json)]) -> Json {
    let mut d = d.clone();
    for (k, v) in ajouts {
        poser(&mut d, k, v);
    }
    d
}

/// `simuler(doc)` : le dict du resultat. Le document n'est pas touche.
pub fn sim(doc: &Json) -> Json {
    simuler(&mut doc.clone(), None, false, None).unwrap_or_else(|e| panic!("ErreurSimulation : {}", e.message)).json
}

/// Les avertissements du resultat.
pub fn avertis(r: &Json) -> Vec<String> {
    els(&r["avertissements"]).iter().map(|a| t(a).to_string()).collect()
}

/// `section_de_couche(couches, indice, largeur, epaisseur)` : (geometrie, description).
pub fn section(couches: &[Json], indice: i64, largeur: f64, epaisseur: f64) -> (Json, Json) {
    let (geo, info) = section_de_couche(couches, indice, largeur, epaisseur, 0.0, None, &[], false);
    (geo.unwrap_or_else(|| panic!("pas de section : {}", dumps(&info))), info)
}

/// `solve_line(geo)` sur le dict de section.
pub fn ligne(geo: &Json) -> tl::Ligne {
    tl::solve_line(&geometrie(geo)).unwrap()
}

pub fn _cu(nom: &str, role: &str) -> Json {
    obj! {"name" => nom, "type" => "copper", "thickness" => 0.035, "role" => role}
}

pub fn _di(nom: &str, ep: f64, er: f64) -> Json {
    obj! {"name" => nom, "type" => "dielectric", "thickness" => ep,
          "epsilon_r" => er, "tan_delta" => 0.02}
}

pub fn _FACE() -> Vec<Json> {
    vec![_cu("Bot", "plane"), _di("Core", 0.2, 4.3), _cu("Top", "signal")]
}

/// `liste + [element]`
pub fn plus(mut l: Vec<Json>, e: Json) -> Vec<Json> {
    l.push(e);
    l
}

fn main() {
    std::panic::set_hook(Box::new(|_| {})); // le message sort sur la ligne KO, pas en vrac
    println!("{}", "=".repeat(62));
    println!("  BANC D'ESSAI  --  python/simulation_em.py et python/crosstalk.py (portage Rust)");
    println!("{}", "=".repeat(62));
    empilage_vias::banc();
    moignons_cavite::banc();
    retour_cavite::banc();
    hors_chaine_topologie::banc();
    appariement::banc();
    paire::banc();
    options::banc();
    malformees::banc();
    usimmics::banc();
    xt_a::banc();
    xt_b::banc();
    xt_c::banc();
    let (ok, ko) = (OK.load(Ordering::Relaxed), KO.load(Ordering::Relaxed));
    println!("\n{}", "-".repeat(62));
    println!("  {} cas, {}", ok + ko, if ko == 0 { "tous passes".to_string() } else { format!("{ko} en echec") });
    std::process::exit(if ko == 0 { 0 } else { 1 });
}
