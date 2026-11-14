//! Banc d'essai du solveur d'impedance (python/ligne_mom.py).
//!
//!     python python/test/banc-ligne-mom.py
//!
//! C'est le module qui porte toute la simulation : l'editeur PCB et la visionneuse
//! peignent SUR LA CARTE les chiffres qu'il rend. Il a donc besoin d'etalons
//! EXTERIEURS, et pas seulement de non-regression -- un calcul faux qui ne change
//! pas reste faux.
//!
//! Deux etalons, tous deux independants de ce code :
//!
//!   · le MICRORUBAN contre Hammerstad-Jensen, la reference du domaine, annoncee
//!     a +-1 % ;
//!   · la TRIPLAQUE contre la solution EXACTE en integrales elliptiques
//!     (transformation conforme), qui n'est pas une approximation du tout.
//!
//! Un troisieme etalon s'y ajoute pour le MICRORUBAN COUVERT -- la piste interne
//! qui n'a de plan que d'un cote -- et il ne depend d'aucune formule exterieure :
//! un ruban profondement enterre est noye dans un milieu HOMOGENE, donc son
//! eps_eff vaut er et son Z0 vaut Z0(air)/racine(er), exactement. La fonction de
//! Green couverte doit en outre se reduire a la fonction nue quand la couverture
//! est nulle, et cette reduction-la se verifie a la precision machine.
//!
//! Le reste verifie des proprietes que la physique impose : eps_eff entre 1 et er,
//! Z0 qui baisse quand le ruban s'elargit, convergence au raffinement, et
//! conservation de la puissance sur une ligne sans pertes.
//!
//! Le SOLVEUR ne demande que numpy. Ce banc demande scipy en plus, pour les
//! integrales elliptiques de son etalon de triplaque -- c'est la seule chose du
//! depot qui en ait besoin, et c'est pourquoi requirements.txt ne le presente pas
//! comme une dependance de l'outil. Le style est celui des autres bancs du depot
//! (visionneuse-ipc2581/test/banc-essai.py) : pas de pytest, un decompte a la fin,
//! un code de retour.
//!
//! En Rust : le portage des cas de python/test/banc-ligne-mom.py qui ne demandent que
//! ligne_mom -- memes cas, memes titres, memes etalons, memes tolerances. Ceux qui passent par
//! simulation_em, rf_reseau ou crosstalk suivront ces modules. Les integrales elliptiques de
//! scipy sont ici une moyenne arithmetico-geometrique.
//!
//!     cargo test -p ligne_mom

#![allow(clippy::excessive_precision, clippy::approx_constant)]

mod cavites;
mod lignes_couplees;
mod cuivre_epais;
mod pertes_conducteur;
mod sections;

pub use ligne_mom::*;
use std::sync::atomic::{AtomicUsize, Ordering};

pub const H: f64 = 0.2e-3;
static OK: AtomicUsize = AtomicUsize::new(0);
static KO: AtomicUsize = AtomicUsize::new(0);

/// Un cas : `fonction` passe, ou panique avec ce qui cloche (l'`assert` du Python).
#[allow(non_snake_case)]
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

pub fn proche(vu: f64, attendu: f64, tol: f64, quoi: &str) {
    let ecart = (vu - attendu).abs() / attendu.abs();
    assert!(ecart < tol, "{quoi} : {vu:.4} contre {attendu:.4}, soit {:.2} % (tolere {:.2} %)", 100.0 * ecart, 100.0 * tol);
}

pub fn titre(t: &str) {
    println!("\n{t}");
}

// ==========================================================================
// Les deux etalons exterieurs
// ==========================================================================

/// Z0 et eps_eff d'un microruban de ruban mince. u = w/h.
pub fn hammerstad_jensen(u: f64, er: f64) -> (f64, f64) {
    let eeff = (er + 1.0) / 2.0 + (er - 1.0) / 2.0 / (1.0 + 12.0 / u).sqrt();
    let z = if u <= 1.0 {
        60.0 / eeff.sqrt() * (8.0 / u + u / 4.0).ln()
    } else {
        120.0 * PI / (eeff.sqrt() * (u + 1.393 + 0.667 * (u + 1.444).ln()))
    };
    (z, eeff)
}

/// `scipy.special.ellipk(m)` : l'integrale elliptique complete de premiere espece, de
/// PARAMETRE m = k^2, par la moyenne arithmetico-geometrique.
pub fn ellipk(m: f64) -> f64 {
    let (mut a, mut b) = (1.0f64, (1.0 - m).sqrt());
    for _ in 0..60 {
        if (a - b).abs() <= 1e-16 * a {
            break;
        }
        (a, b) = (0.5 * (a + b), (a * b).sqrt());
    }
    PI / (2.0 * a)
}

/// Triplaque centree, ruban mince : Z0 = (30 pi / sqrt(er)) K(k')/K(k).
///
/// k = tanh(pi w / 2b). C'est bien la TANGENTE et non la secante : Z0 doit
/// BAISSER quand le ruban s'elargit, et les intervertir donne la courbe a
/// l'envers -- l'erreur a ete faite ici meme avant d'etre vue, et l'etalon
/// accusait alors le solveur.
pub fn stripline_exacte(w: f64, b: f64, er: f64) -> f64 {
    let k = (PI * w / (2.0 * b)).tanh();
    let kp = 1.0 / (PI * w / (2.0 * b)).cosh();
    (30.0 * PI / er.sqrt()) * ellipk(kp * kp) / ellipk(k * k)
}

pub use std::f64::consts::PI;

pub fn micro(w: f64, t: f64, h: f64, er: f64) -> Geometrie {
    Geometrie { kind: Kind::Micro, w, t, h, epsilon_r: er, ..Default::default() }
}

pub fn strip(w: f64, t: f64, b: f64, y0: f64, er: f64) -> Geometrie {
    Geometrie { kind: Kind::Strip, w, t, b, y0: Some(y0), epsilon_r: er, ..Default::default() }
}

/// Deux conducteurs de largeur w, centres en -(w+s)/2 et (w+s)/2.
pub fn deux(w: f64, s: f64) -> Vec<Conducteur> {
    vec![Conducteur { w, x: Some(-(w + s) / 2.0), ..Default::default() }, Conducteur { w, x: Some((w + s) / 2.0), ..Default::default() }]
}

pub fn z0(g: &Geometrie) -> f64 {
    solve_line(g).unwrap().z0
}

/// `10 ** np.linspace(a, b, n)`
pub fn logspace(a: f64, b: f64, n: usize) -> Vec<f64> {
    (0..n).map(|i| 10f64.powf(a + (b - a) * i as f64 / (n - 1) as f64)).collect()
}

fn main() {
    std::panic::set_hook(Box::new(|_| {})); // le message sort sur la ligne KO, pas en vrac
    println!("{}", "=".repeat(62));
    println!("  BANC D'ESSAI  --  python/ligne_mom.py (portage Rust)");
    println!("{}", "=".repeat(62));
    sections::banc();
    lignes_couplees::banc();
    pertes_conducteur::banc();
    cavites::banc();
    cuivre_epais::banc();
    let (ok, ko) = (OK.load(Ordering::Relaxed), KO.load(Ordering::Relaxed));
    println!("\n{}", "-".repeat(62));
    println!("  {} cas, {}", ok + ko, if ko == 0 { "tous passes".to_string() } else { format!("{ko} en echec") });
    std::process::exit(if ko == 0 { 0 } else { 1 });
}
