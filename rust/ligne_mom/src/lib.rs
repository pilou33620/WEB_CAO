//! Impedance caracteristique d'une ligne, par MoM sur la section droite : le portage en Rust
//! de python/ligne_mom.py (2.12.0), fonction pour fonction et sous les memes noms.
//!
//!     let r = ligne_mom::solve_line(&Geometrie { w: 0.38e-3, t: 35e-6, h: 0.2e-3, epsilon_r: 4.3,
//!                                                ..Default::default() })?;
//!     r.z0.round() == 48.0
//!
//! Toutes les longueurs sont en METRES ici -- c'est simulation_em qui convertit depuis les
//! millimetres du document d'echange.
//!
//! Ce qui etait un dict en Python est une structure : ses champs portent les memes noms, dans
//! le meme ordre, et `serde` les ecrit en JSON tels que les pages les lisent. Ce qui levait
//! `ValueError` rend `Err(Erreur)`, avec le meme message.
//!
//   CE QU'IL FAIT. On cherche la densite de charge sur le ruban qui met tout le
//   ruban a 1 volt. Le substrat et les plans de masse ne sont pas mailles : ils
//   entrent par la FONCTION DE GREEN du milieu, qui se derive exactement dans
//   le domaine spectral. De la la capacite lineique C ; la meme chose avec le
//   dielectrique remplace par du vide donne C0 ; et
//
//       Z0 = 1 / (c racine(C*C0))          eps_eff = C / C0
//
//   C'est la methode des moments classique -- celle de Harrington -- appliquee
//   a l'electrostatique de la section. Ce n'est pas une formule fermee de
//   plus : c'est un calcul de champ, qui converge quand on raffine et qui tient
//   sur une section quelconque la ou une formule ne tient que sur celle pour
//   laquelle elle a ete ajustee.
//
//   CE QU'IL VAUT. Verifie contre deux etalons exterieurs, refaits a chaque
//   execution du banc d'essai (python/test/banc-ligne-mom.py) :
//     · microruban contre Hammerstad-Jensen  -> 0,42 % d'ecart au pire ;
//     · triplaque contre la solution exacte en integrales elliptiques -> 0,30 %.
//
//   CE QU'IL NE FAIT PAS, et il faut le savoir avant de lire un chiffre :
//     · il est QUASI-STATIQUE. La dispersion est ajoutee par le modele de
//       Getsinger, qui est un modele, pas un calcul ;
//     · il voit une section, donc une ligne UNIFORME et DROITE. Une suite de
//       sections mises bout a bout, oui ; ce qui se passe au raccord, non ;
//     · il ne rayonne pas et ne resonne pas. Pour cela il faut l'onde complete,
//       que le depot n'a plus (mom_solver/, retire le 2026-09-16).

// `!(x > 0.0)` n'est pas `x <= 0.0` : il refuse aussi NaN, comme le `not (x > 0)` du Python.
#![allow(clippy::neg_cmp_op_on_partial_ord, clippy::needless_range_loop)]

mod alg;
mod creux;
pub mod cavite;
pub mod couplees;
pub mod discontinuites;
pub mod emission;
pub mod green;
pub mod grille;
pub mod ligne;
pub mod matrice;
pub mod pertes;
pub mod traversee;

pub use cavite::*;
pub use couplees::*;
pub use discontinuites::*;
pub use emission::*;
pub use green::*;
pub use grille::*;
pub use ligne::*;
pub use matrice::*;
pub use num_complex::Complex64;
pub use pertes::*;
pub use traversee::*;

use serde::Serialize;

pub const VERSION: &str = "2.12.0";

/// Ce que `ValueError` portait en Python : le message, mot pour mot.
#[derive(Debug, Clone, PartialEq)]
pub struct Erreur(pub String);

impl std::fmt::Display for Erreur {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for Erreur {}

pub type Res<T> = Result<T, Erreur>;

pub(crate) fn refus<T>(message: impl Into<String>) -> Res<T> {
    Err(Erreur(message.into()))
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Etat {
    pub dispo: bool,
    pub version: &'static str,
    pub nom: &'static str,
}

pub fn etat() -> Etat {
    Etat { dispo: true, version: VERSION, nom: "Solveur MoM (section droite et discontinuites)" }
}

pub const EPSILON_0: f64 = 8.854187817e-12;
pub const MU_0: f64 = 4.0 * std::f64::consts::PI * 1e-7;
pub const C_0: f64 = 2.99792458e8;
pub const SIGMA_CU: f64 = 5.8e7; // conductivité du cuivre, S/m

// Nombre de panneaux sur le ruban, et de points de quadrature en β. À 120
// panneaux Z₀ est convergée à 0,2 % près (51,25 à n=30, 50,87 à n=120, 50,77 à
// n=400) : au-delà on paie du temps pour des décimales que la dispersion et
// l'empilage ne garantissent de toute façon pas.
pub const N_PANNEAUX: usize = 120;
pub const N_QUADRATURE: usize = 300;
pub const BETA_MAX: f64 = 40.0; // en unités de 1/h ; au-delà, e^-80 ≈ 0

// Combien de conducteurs couples au plus dans une meme section. Le cout est en
// N sur les panneaux et en N^2 sur les seconds membres : huit pistes d'un bus
// tiennent largement, et au-dela ce n'est plus une section qu'on lit, c'est un
// tableau que personne ne lira.
pub const MAX_CONDUCTEURS: usize = 8;

/// Impedance du vide. Le Python la definissait DEUX FOIS -- `MU_0 * C_0` avec les pertes
/// (376,7303134617707), puis ce litteral avec la cavite maillee -- et c'est la seconde, lue a
/// l'appel, qui servait partout : Wheeler compris. On garde donc celle-ci, seule.
pub const ETA_0: f64 = 376.730313668;

/// `round(x, n)` de Python : l'arrondi DECIMAL exact de la valeur binaire, au pair.
pub(crate) fn arrondi(x: f64, n: usize) -> f64 {
    if !x.is_finite() {
        return x;
    }
    format!("{:.*}", n, x).parse().unwrap_or(x)
}
