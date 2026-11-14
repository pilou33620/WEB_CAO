//! Banc d'essai de la simulation RF (python/rf_reseau.py).
//!
//!     cargo test -p rf_reseau
//!
//! Des etalons que ce code ne fabrique pas lui-meme :
//!
//!   · un reseau en L calcule A LA MAIN pour adapter 14+8j sur 50 ohms doit
//!     rendre S11 = 0 et S21 = 0 dB a sa frequence ;
//!   · deux ports relies directement : |S21|^2 = 4 R1 R2 / |Z1 + Z2|^2, le gain
//!     transducique d'une simple desadaptation ;
//!   · avec deux references reelles egales, les S generalises doivent redonner
//!     EXACTEMENT ceux de la cascade de `simulation_em` -- meme piste, meme
//!     moteur ;
//!   · un modele Murata doit resonner la ou son C et son ESL le disent.
//!
//! Le portage de python/test/banc-rf.py en entier (`rf`) : memes cas, memes titres, memes
//! etalons, memes tolerances. Style des autres bancs du depot : pas de harnais, un decompte,
//! un code de retour.
//!
//! S'y ajoutent (`restes`) ce que les bancs des autres modules attendaient de rf_reseau : les
//! deux dernieres verifications de « la section passe la rugosite de son plan de reference »
//! (banc-ligne-mom), « rf_reseau : deux instances SPICE ont chacune leurs noeuds internes »
//! (banc-crosstalk), « un .sNp en matrice Upper est refuse au lieu d'etre mal lu »
//! (visionneuse-ipc2581/test/banc-essai.py), et la part rf_reseau de
//! banc-entrees-malformees.py.
//!
//! LA LIB. Six cas lisent les modeles Murata et Skyworks de la vraie LIB (WEB_CAO_LIB, ou
//! ../PROJETS/LIB_CAO a cote du depot) : sans elle ils sont SAUTES et comptes a part, comme
//! ci.yml saute banc-rf.py sans la LIB.

#![allow(non_snake_case, clippy::excessive_precision)]

mod restes;
mod rf;

pub use em::simulation_em::base::*;
pub use rf_reseau::alg::{MatC, MatR};
pub use rf_reseau::*;
pub use std::f64::consts::PI;
use std::sync::atomic::{AtomicUsize, Ordering};

static OK: AtomicUsize = AtomicUsize::new(0);
static KO: AtomicUsize = AtomicUsize::new(0);
static SAUTES: AtomicUsize = AtomicUsize::new(0);

/// Ce qu'un cas panique quand la LIB manque : il est saute, pas en echec.
pub const SANS_LIB: &str = "LIB absente";

/// Un cas : `fonction` passe, ou panique avec ce qui cloche (l'`assert` du Python).
pub fn T(titre: &str, fonction: impl FnOnce()) {
    match std::panic::catch_unwind(std::panic::AssertUnwindSafe(fonction)) {
        Ok(()) => {
            OK.fetch_add(1, Ordering::Relaxed);
            println!("  ok  {titre}");
        }
        Err(e) => {
            let message = e.downcast_ref::<String>().cloned().or_else(|| e.downcast_ref::<&str>().map(|s| s.to_string())).unwrap_or_default();
            if message.starts_with(SANS_LIB) {
                SAUTES.fetch_add(1, Ordering::Relaxed);
                println!("  --  {titre} (sauté : {message})");
            } else {
                KO.fetch_add(1, Ordering::Relaxed);
                println!("  KO  {titre}\n        {message}");
            }
        }
    }
}

pub fn proche(vu: f64, attendu: f64, tol: f64, quoi: &str) {
    let ecart = (vu - attendu).abs() / attendu.abs().max(1e-30);
    assert!(ecart < tol, "{quoi} : {vu} contre {attendu}, soit {:.3} % (tolere {:.3} %)", 100.0 * ecart, 100.0 * tol);
}

/// `proche` sur deux complexes.
pub fn proche_c(vu: Complex64, attendu: Complex64, tol: f64, quoi: &str) {
    let ecart = (vu - attendu).norm() / attendu.norm().max(1e-30);
    assert!(ecart < tol, "{quoi} : {vu} contre {attendu}, soit {:.3} % (tolere {:.3} %)", 100.0 * ecart, 100.0 * tol);
}

pub fn titre(t: &str) {
    println!("\n{t}");
}

/// Un document ou un morceau de document, ecrit en JSON.
pub fn j(texte: &str) -> Json {
    loads(texte).unwrap_or_else(|e| panic!("JSON du banc : {e} dans {texte}"))
}

/// La valeur d'un nombre du resultat (panique si ce n'en est pas un, comme `v > 0` sur None).
pub fn n(v: &Json) -> f64 {
    v.as_f64().unwrap_or_else(|| panic!("un nombre etait attendu, pas {}", dumps(v)))
}

/// `dict(d, cle=valeur, ...)`
pub fn avec(d: &Json, ajouts: &[(&str, Json)]) -> Json {
    let mut d = d.clone();
    for (k, v) in ajouts {
        poser(&mut d, k, v);
    }
    d
}

pub fn cx(re: f64, im: f64) -> Complex64 {
    Complex64::new(re, im)
}

fn main() {
    // un cas en echec panique : son message est dans le decompte, pas besoin de la trace
    std::panic::set_hook(Box::new(|_| {}));
    rf::banc();
    restes::banc();
    let (ok, ko, sautes) = (OK.load(Ordering::Relaxed), KO.load(Ordering::Relaxed), SAUTES.load(Ordering::Relaxed));
    println!("\n{}", "-".repeat(62));
    println!("  {} cas, {}{}", ok + ko, if ko == 0 { "tous passes".to_string() } else { format!("{ko} en echec") },
             if sautes > 0 { format!(" ; {sautes} sautés faute de LIB") } else { String::new() });
    std::process::exit(if ko == 0 { 0 } else { 1 });
}
