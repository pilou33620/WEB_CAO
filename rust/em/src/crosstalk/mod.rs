//! Crosstalk Niveau 2 : le pic de bruit relatif, paire par paire.
//!
//!     >>> import crosstalk
//!     >>> crosstalk.etat()["dispo"]
//!     True
//!
//! LA QUESTION. Quel pic de bruit, en pour-cent de l'amplitude de l'agresseur,
//! une piste victime subit-elle -- sans connaitre ni la tension reelle du signal
//! ni le protocole ? Le resultat se lit en % et en dB de l'agresseur.
//!
//! LES HYPOTHESES DE DEPART.
//!   * Tension normalisee : l'agresseur fait un echelon UNITAIRE (1 V, 100 %).
//!   * Temps de montee de reference t_r : SAISI pour l'analyse, ou deduit de la
//!     classe du net agresseur (Horloge 2 ns, Rapide 1 ns, RF 100 ps, ... -- les
//!     memes fronts que la verification de carte, reglables la-bas). Un
//!     agresseur RF sans front saisi se juge a la porteuse RF du panneau si elle
//!     est reglee (t_r = 0,35 / f) ; sinon le front de la classe s'impose, et la
//!     fiche le dit en RESERVE (`front_impose`).
//!   * Lignes adaptees a leurs deux bouts sur leur Z0 : on evalue le couplage
//!     direct, sans allers-retours de reflexions.
//!
//! LES GRANDEURS D'ENTREE, issues du solveur 2D MoM (`ligne_mom`) sur la coupe
//! tiree du design (IPC-2581 ou editeur PCB) :
//!   * [C] et [L] par bloc : C11 (diagonale de Maxwell, capacite totale), L11,
//!     et les mutuelles Cm, Lm ;
//!   * la vitesse v = c0 / racine(eps_eff), eps_eff = C11 / C11(vide) -- egale a
//!     1 / racine(L11 . C11) pour une ligne seule, et sans le biais que ce
//!     produit de deux diagonales prend des qu'il y a couplage ;
//!   * T_d, le temps de propagation le long du couplage : la somme, bloc par
//!     bloc, des retards de la victime la ou elle longe. Un longement dont
//!     l'ecart varie est donc compte morceau par morceau.
//!
//! LES FORMULES.
//!   k_total = 1/2 (Cm/C11 + Lm/L11)       couplage geometrique pur
//!   Kb      = k_total / 2                 NEXT sature
//!   Kf      = 1/2 (Lm/L11 - Cm/C11)       nul en stripline homogene
//!   NEXT    = Kb_max                       si 2 T_d >= t_r  (sature)
//!           = Sum(Kb . 2 dT) / t_r         sinon            (non sature)
//!   FEXT    = |Sum(Kf . dT)| / t_r        plafonne a 50 % (`fext_sature`)
//! Avec un couplage uniforme, Sum(Kb . 2 dT) = Kb . 2 T_d et l'on retrouve
//! exactement les deux cas classiques ; avec un couplage qui varie, la somme
//! pondere chaque morceau par son propre Kb, et la saturation se lit sur le
//! plus fort.
//!
//! CE QUI SORT, PAR PAIRE (agresseur, victime) : k_total, NEXT et FEXT en % et
//! en dB, T_d, saturation, et un STATUT DRC par metrique -- vert sous le seuil
//! orange (3 %), orange jusqu'au seuil rouge (7 %), rouge au-dela, les deux
//! reglables -- plus le statut de la paire, le pire des deux. A cote, la CARTE
//! LOCALE : ou, le long de l'agresseur, le NEXT se fabrique.
//!
//! LES DEUX ETAPES ZERO RESTENT DEUX.
//!
//!   (a) LA PRESELECTION GEOMETRIQUE ne demande que l'AGRESSEUR et cherche seule
//!       ce qui longe -- meme couche, et couches adjacentes : deux pistes
//!       superposees couplent souvent PLUS que les memes cote a cote. Chaque
//!       candidat porte sa distance et sa longueur de parallelisme MESUREES le
//!       long du cuivre, et son profil d'espacement.
//!   (b) LA CONFIRMATION ne retient comme VICTIME que ce dont le pire des deux
//!       niveaux depasse un seuil (-40 dB par defaut). Les ecartees restent au
//!       tableau, avec leur niveau.
//!
//! Fusionnees, elles ne permettraient plus de distinguer une piste LOIN d'une
//! piste PROCHE ET BLINDEE -- deux situations de dessin opposees.
//!
//! LE PLAN DE MASSE n'est pas modelise a part : son blindage est deja dans [C] et
//! [L], chaque section etant resolue avec son plan de reference et le cuivre de
//! masse a portee. On controle en parallele le pas de couture, les fentes et les
//! changements de couche sans via de masse : des CAUSES, posees a cote de la
//! carte.
//!
//! LA CARTE ENTIERE, avec un t_r GLOBAL, est le travail de `analyse_carte` (regle
//! « diaphonie ») : memes formules, memes seuils, toutes les paires voisines.
//!
//! --------------------------------------------------------------------------
//! LE DOCUMENT D'ENTREE, format « cao-crosstalk-1 », en MILLIMETRES :
//!
//!     format      "cao-crosstalk-1"
//!     carte       nom du document
//!     agresseurs  [net, ...] -- les nets SELECTIONNES. Celui qui porte le plus
//!                 de cuivre donne l'axe de position
//!     natures     {net: classe}              la classe des nets (t_r deduit)
//!     stackup     {"layers": [...]}          comme « cao-sim-em-3 »
//!     geometry    {"objects": [...]}         les troncons de l'agresseur, DANS
//!                                            L'ORDRE DU PARCOURS
//!     voisinage   [...]                      le cuivre qui passe a portee
//!     reference_nets  les nets tenus pour de la masse
//!     paires      [[netP, netN], ...]        les paires declarees
//!     reglages    voir DEFAUTS, plus bas -- dont t_r (s, 0 = deduit),
//!                 tr_classes {classe: s}, seuil_orange, seuil_rouge (fractions)
//!     couture     {"positions": [{"s": mm le long du parcours, "cote": +-1}]}
//!     fentes      [{"s": mm, "longueur": mm, "plans": [nom de couche, ...],
//!                   "quoi": texte,
//!                   -- depuis la 4.5.0, ce que la page mesure au franchissement :
//!                   "d1": mm, "d2": mm   les detours du retour, a gauche (+1,
//!                                        comme le cote de la couture) et a
//!                                        droite du sens de marche,
//!                   "largeur": mm        la largeur de la fente le long de la piste,
//!                   "borne": bool        un detour plafonne (plan coupe de bord a bord),
//!                   "retour": [noms]     les plans qui FERMENT encore le retour
//!                                        sous la fente ; vide = tous coupes,
//!                   "x", "y": mm         le point du franchissement,
//!                   -- depuis la 4.6.0, l'image des plans (option B) :
//!                   "maillage": {"x", "y", "ux", "uy",  centre (mm) et sens de
//!                                                       marche de la piste,
//!                                "U", "V",              demi-cotes de la fenetre,
//!                                "v0", "pas",           la ligne k est a
//!                                                       v = v0 + k.pas (v a
//!                                                       gauche du sens de marche),
//!                                "plans": [{"nom", "lignes": [[u0, u1, ...]]}],
//!                                                       bords des plages de
//!                                                       cuivre en u, par ligne,
//!                                "vias": [{"u", "v", "d", "couches"}]}}]
//!     vias_masse  [{x, y, a, b}]             les vias de masse a portee
//!
//! LE RESULTAT, format « cao-crosstalk-resultat-1 » : voir `analyser`.
//!
//! Le portage de python/crosstalk.py (4.6.0), fonction pour fonction et sous les memes noms.
//! Comme pour `simulation_em`, les documents echanges avec les pages restent des `Json` (les
//! dict de Python, ordre des cles compris) : memes cles, meme ordre, memes arrondis, memes
//! textes. Ce qui levait `ErreurCrosstalk` rend `Err(ErreurCrosstalk)`.

// `!(x > 0.0)` n'est pas `x <= 0.0` : il refuse aussi NaN, comme le `not (x > 0)` du Python.
#![allow(clippy::neg_cmp_op_on_partial_ord, clippy::needless_range_loop, clippy::too_many_arguments, clippy::type_complexity)]

pub mod analyse;
pub mod blocs;
pub mod fentes;
pub mod masse;
pub mod mtl;
pub mod niveau2;
pub mod peec;
pub mod preselection;

pub use analyse::*;
pub use blocs::*;
pub use fentes::*;
pub use masse::*;
pub use mtl::*;
pub use niveau2::*;
pub use peec::*;
pub use preselection::*;

// On importe `simulation_em` parce que toute la geometrie -- l'appariement, la
// section droite, la pose des conducteurs -- est chez lui et doit le rester :
// deux implementations de la meme regle auraient derive, et l'onglet Diaphonie
// et l'onglet Crosstalk auraient cesse de designer le meme cuivre.
pub use crate::simulation_em as se;
pub use crate::simulation_em::base::{dumps, loads, Json, Noms};
use crate::simulation_em::base::*;
pub use ligne_mom as tl;

pub const FORMAT: &str = "cao-crosstalk-1";
pub const FORMAT_RESULTAT: &str = "cao-crosstalk-resultat-1";
pub const VERSION: &str = "4.6.0";

/// `VERSION_MOTEURS` : {"crosstalk", "simulation_em", "ligne_mom"}
pub fn version_moteurs() -> Json {
    obj! {
        "crosstalk" => VERSION,
        "simulation_em" => se::VERSION,
        "ligne_mom" => tl::VERSION,
    }
}

pub const C_0: f64 = 299792458.0;

// -- les garde-fous ---------------------------------------------------------
// Une section par bloc, N conducteurs par section : cinq victimes restent
// immediates, cinquante ne se liraient plus de toute facon.
pub const MAX_VICTIMES: usize = 5;
pub const MAX_AGRESSEURS: usize = 3;
pub const MAX_BLOCS: usize = 400;
pub const MAX_PORTS: usize = 64;
pub const MAX_CORPS: usize = 4 * 1024 * 1024;

// LE MULTIPLE QUI DONNE LE SEUIL DE DISTANCE PAR DEFAUT. Trois largeurs de
// piste est la regle 3W, celle que tout le monde dessine ; trois hauteurs de
// dielectrique est la meme idee vue de l'autre cote -- c'est la hauteur au plan
// qui fixe l'etendue du champ, et une piste fine sur un stratifie epais couple
// bien au-dela de trois fois sa largeur. On prend le PLUS GRAND des deux : le
// seuil doit MAJORER, et c'est la confirmation qui fait le tri.
pub const DISTANCE_AUTO: f64 = 3.0;
// L'EGALITE EST RETENUE, ET UN PEU AU-DELA. Un couple dessine a S = 3W tombe
// PILE sur le seuil 3 x max(W, H) quand la hauteur au plan est plus petite que
// la largeur -- c'est le cas de la carte d'essai du banc crosstalk (S = 1,05 mm,
// seuil 1,05 mm) --, et une comparaison stricte l'ecartait sans un chiffre, a
// la merci d'un arrondi d'export au micron. Deux pour cent au-dessus du seuil
// sont donc encore DEDANS : la regle des 3W est une regle de dessin, pas une
// marche d'escalier.
pub const TOLERANCE_SEUIL: f64 = 0.02;
// UN COUPLE ECARTE A MOINS DE 1,5 x LE SEUIL EST DIT EXPLICITEMENT -- avec son
// ecart, le seuil, et le geste qui le chiffre (ouvrir « distance max »). Au-dela,
// il est loin, et la fiche se contente de sa distance.
pub const PRESELECTION_PROCHE: f64 = 1.5;

// -- NIVEAU 2 ---------------------------------------------------------------
// Le front de reference quand rien d'autre ne le donne : 1 ns, la majorite
// des fronts rapides du numerique moderne.
pub const TR_DEFAUT: f64 = 1e-9;
// LES FRONTS PAR CLASSE DE NET, repris par analyse_carte -- la page envoie
// ceux du panneau de verification quand on les a regles.
pub const TR_CLASSES: [(&str, f64); 6] = [("Horloge", 2e-9), ("Rapide", 1e-9), ("RF", 1e-10),
                                          ("Analogique", 1e-7), ("Lent", 1e-8), ("Découpage", 5e-9)];

/// Une entree de `INTERFACES`.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Interface {
    pub classe: &'static str,
    pub nom: &'static str,
    pub famille: &'static str,
    pub tr: f64,
    pub cadence: f64,
    pub zdiff: f64,
}

const fn interface(classe: &'static str, nom: &'static str, famille: &'static str, tr: f64, cadence: f64, zdiff: f64) -> Interface {
    Interface { classe, nom, famille, tr, cadence, zdiff }
}

// UNE CLASSE D'INTERFACE APPARTIENT A UNE FAMILLE : la famille (une classe
// ci-dessus) decide des regles, l'interface donne son front, sa cadence (Hz)
// et la Z_diff de sa norme. Pas de Z0 de brin : la norme n'en fixe pas, le
// panneau peut en donner une (`z0_classes`). Meme table dans
// commun/classes-interface.js.
pub const INTERFACES: [Interface; 7] = [
    interface("USB FS", "USB 2.0 Full Speed", "Lent", 4e-9, 6e6, 90.0),
    interface("USB HS", "USB 2.0 High Speed", "Rapide", 5e-10, 2e8, 90.0),
    interface("ETH 100", "Ethernet 100BASE-TX", "Rapide", 3e-9, 3.125e7, 100.0),
    interface("ETH 1000", "Ethernet 1000BASE-T", "Rapide", 2e-9, 5e7, 100.0),
    interface("LVDS", "LVDS (TIA-644)", "Rapide", 3e-10, 3.3e8, 100.0),
    interface("CAN", "CAN (ISO 11898)", "Lent", 5e-8, 5e5, 120.0),
    interface("RS-485", "RS-485 (TIA-485)", "Lent", 2e-8, 5e6, 120.0),
];

/// `INTERFACES.get(classe)`
pub fn interface_de(classe: &str) -> Option<&'static Interface> {
    INTERFACES.iter().find(|i| i.classe == classe)
}

/// La classe d'origine qui decide des regles : celle de l'interface, la
/// classe elle-meme sinon.
pub fn famille(classe: &str) -> &str {
    interface_de(classe).map_or(classe, |i| i.famille)
}
// LES SEUILS DRC, en fraction de l'agresseur : vert dessous, rouge au-dela.
pub const SEUIL_ORANGE: f64 = 0.03;
pub const SEUIL_ROUGE: f64 = 0.07;
// Le FEXT de deux lignes adaptees ne depasse pas la moitie de l'agresseur.
pub const FEXT_PLAFOND: f64 = 0.5;

/// `DEFAUTS`
pub fn defauts() -> Json {
    obj! {
        // -- etape 0a : la preselection geometrique
        "distance_max" => 0.0,        // mm ; 0 = deduit de la largeur et de la hauteur
        "longueur_min" => 0.0,        // mm ; 0 = deduit de l'ecart et de la hauteur
        "couches_adjacentes" => true,
        // -- etape 0b : la confirmation
        "seuil_db" => -40.0,
        // -- le niveau 2
        "t_r" => 0.0,                 // s ; 0 = deduit de la classe de l'agresseur
        "tr_classes" => obj! {},      // {classe: s} -- les fronts du panneau carte
        "porteuse_rf" => 0.0,         // Hz ; > 0 : un agresseur de classe RF se juge
                                      // a sa porteuse, t_r = 0,35 / f (analyse_carte)
        "seuil_orange" => SEUIL_ORANGE,
        "seuil_rouge" => SEUIL_ROUGE,
        "pertes" => false,            // R et G au genou du front : voir alpha_genou
        "somme" => "pire",            // plusieurs agresseurs : « pire » ou « rss »
        // -- la lecture
        "risque" => 0.5,              // fraction du pire point d'une victime au-dela
                                      // de laquelle la plage se peint sur le cuivre
    }
}

/// Refus explicite, avec de quoi corriger le tir.
///
/// Meme forme que `simulation_em.ErreurSimulation` : le motif, et ce qu'il
/// faut changer. Les pages affichent les deux, separes d'une ligne vide.
///
/// `interne` : ce n'est pas un refus du module mais une exception que Python laissait
/// remonter telle quelle (un `ValueError` de `ligne_mom`, donc une « Erreur interne » de la
/// route) ; le message est le sien.
#[derive(Debug, Clone, PartialEq)]
pub struct ErreurCrosstalk {
    pub message: String,
    pub conseil: String,
    pub interne: bool,
}

impl ErreurCrosstalk {
    pub fn new(message: impl Into<String>, conseil: impl Into<String>) -> Self {
        ErreurCrosstalk { message: message.into(), conseil: conseil.into(), interne: false }
    }
}

impl std::fmt::Display for ErreurCrosstalk {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.message)
    }
}

impl std::error::Error for ErreurCrosstalk {}

impl From<tl::Erreur> for ErreurCrosstalk {
    fn from(e: tl::Erreur) -> Self {
        ErreurCrosstalk { message: e.0, conseil: String::new(), interne: true }
    }
}

/// Ce que le serveur sait faire ; la page le demande avant de lancer.
pub fn etat() -> Json {
    obj! {"dispo" => true, "format" => FORMAT, "resultat" => FORMAT_RESULTAT,
          "version" => VERSION,
          "moteurs" => version_moteurs(),
          "max" => MAX_CORPS,
          "source" => "le design seul (IPC-2581 ou editeur PCB)",
          "methode" => "niveau 2 : [C] et [L] par bloc (MoM 2D) -> k_total,\
                        \x20NEXT et FEXT normalises a un echelon unitaire sous\
                        \x20un front t_r, lignes adaptees",
          "defauts" => defauts(),
          "tr_classes" => Json::Objet(TR_CLASSES.iter().map(|(k, v)| (k.to_string(), Json::Flottant(*v))).collect()),
          "limites" => obj! {"victimes" => MAX_VICTIMES,
                             "agresseurs" => MAX_AGRESSEURS,
                             "blocs" => MAX_BLOCS}}
}

/// Un nombre, ou le defaut. Meme repli que `simulation_em._nombre`.
pub fn _nb(valeur: &Json, defaut: f64) -> f64 {
    _nombre(valeur, defaut)
}

/// Un module en decibels, avec un plancher qui ne soit pas moins l'infini.
///
/// -300 dB est le plancher qu'emploie deja le panneau (`SIM_PLANCHER`) : un
/// zero exact -- et il y en a, sur une victime que rien ne couple dans le
/// modele -- afficherait « -inf » au milieu d'une colonne de nombres.
pub fn _db(x: f64) -> f64 {
    let m = x.abs();
    if m <= 1e-15 { -300.0 } else { (20.0 * m.log10()).max(-300.0) }
}

/// « %.{n}f » d'une valeur du document (0 si ce n'est pas un nombre).
pub(crate) fn f(v: &Json, n: usize) -> String {
    format!("{:.*}", n, v.as_f64().unwrap_or(0.0))
}

/// « %s » sur une liste de noms : « a », « b »
pub(crate) fn guillemets<S: AsRef<str>>(noms: impl IntoIterator<Item = S>, sep: &str) -> String {
    noms.into_iter().map(|n| format!("« {} »", n.as_ref())).collect::<Vec<_>>().join(sep)
}
