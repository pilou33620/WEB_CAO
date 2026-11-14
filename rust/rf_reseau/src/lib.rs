//! Simulation RF : le S21 d'un reseau pistes + composants entre deux ports. Le portage de
//! python/rf_reseau.py (1.9.0), fonction pour fonction et sous les memes noms.
//!
//!     rf_reseau::etat()["dispo"] == true
//!
//! LA QUESTION. On sort d'une puce radio dont la sortie vaut 14+8j ohms, on
//! traverse un reseau d'adaptation -- une self en serie, une capacite a la masse,
//! quelques millimetres de piste -- et l'on arrive sur un connecteur U.FL ou une
//! antenne d'impedance connue. Combien de la puissance disponible arrive au bout,
//! et qu'est-ce qu'il faut retoucher ?
//!
//! LES PISTES SONT CALCULEES PAR LE SIMULATEUR DU DEPOT, ET PAR LUI SEUL. Chaque
//! BRANCHE de cuivre -- d'une pastille a une autre, ou a une derivation -- part
//! dans `simulation_em.simuler` exactement comme une selection de l'onglet
//! Impedance : methode des moments sur la section droite, dispersion, pertes,
//! coudes, vias et moignons. On lui demande sa matrice ABCD a chaque frequence
//! (`garder_abcd`) et on n'y retouche pas. Une piste a donc ici le meme Z0 que
//! sous l'onglet Impedance, au chiffre pres.
//!
//! CE QUE CE MODULE AJOUTE : l'assemblage. Une chaine ABCD ne sait pas ce qu'est
//! une capacite a la masse au milieu d'un T ; une analyse NODALE, si. Chaque
//! branche devient un quadripole Y, chaque composant son admittance (R, L, C
//! ideal, sous-circuit SPICE lineaire, ou fichier Touchstone a N ports), chaque
//! via de masse sous un composant en derivation son inductance -- et l'on reduit
//! le tout aux deux ports.
//!
//! LES PORTS ONT DES IMPEDANCES COMPLEXES, d'ou des parametres S GENERALISES
//! (ondes de puissance, Kurokawa 1965) :
//!
//!     a = (V + Z I) / (2 sqrt(Re Z)),   b = (V - Z* I) / (2 sqrt(Re Z))
//!
//! obtenus en fermant chaque port sur sa reference et en attaquant l'autre --
//! voir `_s_ports`.
//!
//! Avec la sortie de la puce en Z1 et la charge en Z2, |S21|^2 est le GAIN
//! TRANSDUCIQUE : la part de la puissance disponible de la puce qui arrive dans
//! la charge. S11 = 0 veut dire que la puce voit le conjugue de sa sortie --
//! l'adaptation parfaite. Avec deux references reelles egales, on retombe sur les
//! S ordinaires : c'est ce que le banc verifie contre `cascade_to_s`.
//!
//! LES COMPOSANTS ACTIFS n'entrent que par un Touchstone. Un transistor SPICE est
//! non lineaire : il lui faut un point de polarisation, et ce n'est pas le sujet.
//! Il est refuse avec cette phrase, pas linearise en silence.
//!
//! Le document d'entree, format « cao-sim-rf-1 », EN MILLIMETRES :
//!
//!     stackup, reference_nets, analyse   comme pour `simulation_em`
//!     ports       [{noeud, noeud_n?, z: [re, im]}] x 2 -- l'impedance de SORTIE
//!                 de la puce au port 1, celle de la charge au port 2 ; un port
//!                 DIFFERENTIEL porte `noeud_n` (RFI_N face a RFI_P) : sa tension
//!                 est V(noeud) - V(noeud_n), sans masse ; sinon noeud_n = « 0 »
//!     branches    [{a, b, net, objets, vias, fentes?}] -- `objets` rangés de a
//!                 vers b, au format de `geometry.objects` de simulation_em ;
//!                 `fentes` [{d1, d2, g, largeur, plan, borne}] les fentes du plan
//!                 de reference franchies, d1 / d2 les detours (mm)
//!     composants  [{ref, noeuds: [..], modele, genre?, geo?}] -- un noeud par
//!                 broche, « 0 » pour la masse ; modele = {type: "ideal", genre:
//!                 R|L|C, valeur} | {type: "spice", texte, nom, sous_circuit?,
//!                 params?} | {type: "snp", texte, nom} ; une self (genre "L")
//!                 porte `geo` {x0, y0, x1, y1, largeur, couche} pour ses mutuelles
//!     voisines    [{net, objets}] -- les pistes d'AUTRES nets qui longent le
//!                 reseau, fermees par le calcul sur leur Z0
//!     masses      [{noeud, couche, vias: [{x, y, percage, couche_plan}]}] --
//!                 la pastille de masse d'un composant et les vias qui la
//!                 descendent au plan ; sans via, la page met « 0 » directement
//!
//! Les documents echanges avec les pages restent des `Json` (les dict de Python, ordre des
//! cles compris). Ce qui levait `ErreurRF` rend `Err(ErreurRF)` ; ce que Python laissait
//! remonter tel quel (une « Erreur interne » de la route) porte `interne`.

// `!(x > 0.0)` n'est pas `x <= 0.0` : il refuse aussi NaN, comme le `not (x > 0)` du Python.
#![allow(clippy::neg_cmp_op_on_partial_ord, clippy::needless_range_loop, clippy::too_many_arguments, clippy::type_complexity)]

pub mod alg;
pub mod analyse;
pub mod bobines;
pub mod couplage;
pub mod modeles;
pub mod surfaces;
pub mod touchstone;

pub use alg::{MatC, MatR};
pub use analyse::*;
pub use bobines::*;
pub use couplage::*;
pub use em::simulation_em as se;
pub use em::simulation_em::base::{Complex64, Json, _nombre};
pub use ligne_mom as tl;
pub use modeles::*;
pub use surfaces::*;
pub use touchstone::*;

use em::simulation_em::base::*;

pub const VERSION: &str = "1.9.0";
pub const FORMAT: &str = "cao-sim-rf-1";
pub const FORMAT_RESULTAT: &str = "cao-sim-rf-resultat-1";
pub const MASSE: &str = "0";

// Un Touchstone de quelques milliers de points pese vite plusieurs megaoctets.
pub const MAX_CORPS: usize = 8 * 1024 * 1024;
pub const MAX_BRANCHES: usize = 200;
pub const MAX_COMPOSANTS: usize = 200;
pub const MAX_ELEMENTS: usize = 5000; // R, L, C d'un modele SPICE deplie : matrice pleine par frequence

// Une resistance ou une self NULLE est un court-circuit : on la pose en tres
// grande admittance plutot que de fusionner les noeuds.
// shortcut: court-circuit en 1e9 S, fusion de noeuds si le conditionnement gene
pub const Y_COURT: f64 = 1e9;

/// Refus explicite : un message d'une ligne et ce qu'il faut changer.
///
/// `interne` : ce n'est pas un refus du module mais une exception que Python laissait
/// remonter telle quelle (donc une « Erreur interne » de la route).
#[derive(Debug, Clone, PartialEq)]
pub struct ErreurRF {
    pub message: String,
    pub conseil: String,
    pub interne: bool,
}

impl ErreurRF {
    pub fn new(message: impl Into<String>, conseil: impl Into<String>) -> Self {
        ErreurRF { message: message.into(), conseil: conseil.into(), interne: false }
    }

    pub fn interne(message: impl Into<String>) -> Self {
        ErreurRF { message: message.into(), conseil: String::new(), interne: true }
    }
}

impl std::fmt::Display for ErreurRF {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.message)
    }
}

impl std::error::Error for ErreurRF {}

// Hors des deux `try` d'`analyser`, une erreur d'un autre module n'etait pas une ErreurRF.
impl From<tl::Erreur> for ErreurRF {
    fn from(e: tl::Erreur) -> Self {
        ErreurRF::interne(e.0)
    }
}

impl From<se::ErreurSimulation> for ErreurRF {
    fn from(e: se::ErreurSimulation) -> Self {
        ErreurRF { message: e.message, conseil: e.conseil, interne: true }
    }
}

impl From<em::crosstalk::ErreurCrosstalk> for ErreurRF {
    fn from(e: em::crosstalk::ErreurCrosstalk) -> Self {
        ErreurRF { message: e.message, conseil: e.conseil, interne: true }
    }
}

pub type Res<T> = Result<T, ErreurRF>;

pub fn etat() -> Json {
    obj! {"dispo" => true, "format" => FORMAT, "resultat" => FORMAT_RESULTAT,
          "version" => VERSION, "max" => MAX_CORPS,
          "methode" => "pistes par simulation_em (MoM + cascade ABCD),\
                        \x20assemblage nodal, S generalises"}
}
