//! Modeles IBIS : lecture d'un fichier .ibs et tampons non lineaires -- le portage en Rust de
//! python/ibis.py (1.5.0).
//!
//! ```text
//! let m = ibis::lire(&texte, "composant.ibs", false)?;
//! m.modeles.keys()
//! ```
//!
//! POURQUOI. L'oeil de `oeil.py` ferme la liaison sur un generateur de Thevenin
//! -- une source et une resistance --, ce qu'un tampon CMOS n'est pas : sa
//! resistance de sortie depend de la tension qu'il voit, ses diodes de
//! protection ecretent les depassements, et son front est celui que le
//! fabricant a mesure, pas une gaussienne. Le fichier IBIS (ANSI/EIA-656) est
//! la facon dont les fabricants le decrivent, sans devoiler le transistor :
//! des tableaux, et rien d'autre.
//!
//! CE QUI EST LU, de chaque [Model] :
//!     Model_type, C_comp (typ/min/max), Vinl, Vinh ;
//!     [Voltage Range], [Pullup Reference], [Pulldown Reference],
//!     [POWER Clamp Reference], [GND Clamp Reference] ;
//!     [Pullup], [Pulldown], [GND Clamp], [POWER Clamp] : courbes V-I ;
//!     [Ramp] : dV/dt montant et descendant, R_load ;
//!     [Rising Waveform], [Falling Waveform] : formes d'onde sous charge
//!     d'essai (R_fixture, V_fixture, C_fixture), autant qu'il y en a ;
//!     [Rgnd], [Rpower] : terminaisons d'entree.
//! Et, en lecture complete (1.1.0, `lire(..., complet = true)`), le BOITIER ET
//! LES BROCHES : [Package], [Pin], [Diff Pin], [Model Selector],
//! [Package Model] -> [Define Package Model] (diagonale des matrices ; les
//! mutuelles de la paire comptees depuis la 1.2.0, celles vers les broches
//! voisines depuis la 1.4.0 -- `voisins_boitier`, `abcd_boitier_couple`), le
//! renvoi [Algorithmic Model] -- voir
//! « Le boitier et les broches ». Depuis la 1.2.0, les BOITIERS PAR SECTIONS
//! (Len= dans [Pin Numbers], Fork/Endfork) se lisent et se mettent en cascade
//! de lignes (`abcd_sections`), et les mutuelles entre les deux broches d'une
//! paire se rendent pour etre comptees (`mutuelle_paire`,
//! `abcd_boitier_paire`). Le reste (sous-modeles, [Model Spec]) est ignore,
//! et dit dans le resultat.
//!
//! LE FICHIER .AMI d'un modele IBIS-AMI se lit aussi (`lire_ami`) : l'arbre de
//! ses parametres, et ce qu'ils proposent pour un egaliseur de reference
//! (`proposer_egaliseur`). DEPUIS LA 1.3.0, LA BIBLIOTHEQUE DU FABRICANT
//! S'EXECUTE (`ModeleAmi` : AMI_Init, AMI_GetWave, AMI_Close selon
//! IBIS 7.x), la chaine de parametres se construit du .ami
//! (`parametres_ami_in`) et se relit (`lire_parametres_ami`) -- seulement
//! depuis un fichier que l'utilisateur designe sous un dossier autorise
//! (`chemin_bibliotheque_ami`). Voir « IBIS-AMI : l'execution du modele ».
//!
//! LA PAIRE (1.1.0) : deux tampons sur les deux brins d'une paire couplee,
//! remise par brin depuis ses deux modes -- voir `LiaisonPaire`.
//!
//! LES CONVENTIONS DE LA NORME, a ne pas confondre :
//!   · un courant est COMPTE POSITIF QUAND IL ENTRE dans le composant par la
//!     broche ;
//!   · les tensions de [Pullup] et de [POWER Clamp] sont RELATIVES A LEUR
//!     REFERENCE : V_tableau = V_ref - V_broche ; celles de [Pulldown] et de
//!     [GND Clamp] le sont a la leur : V_tableau = V_broche - V_ref ;
//!   · les colonnes sont typ, min, max ; « NA » renvoie a typ ;
//!   · les suffixes sont T G M k m u n p f -- M est le MEGA, m le milli --, et
//!     ce qui suit le suffixe (V, A, F, H, s...) est ignore.
//!
//! LE TAMPON EMETTEUR, dans le temps. A chaque instant
//!     I_broche(V, t) = Ku(t) I_pu(V) + Kd(t) I_pd(V) + I_pc(V) + I_gc(V)
//!                      + C_comp dV/dt
//! ou Ku et Kd, entre 0 et 1, disent a quel point le transistor du haut et
//! celui du bas conduisent. On les tire des formes d'onde du fichier : sous la
//! charge d'essai, l'equation ci-dessus doit rendre la forme d'onde mesuree.
//!   · DEUX formes d'onde par front (deux charges d'essai) : deux equations,
//!     deux inconnues, a chaque instant ;
//!   · UNE seule : on suppose Kd = 1 - Ku, et l'equation donne Ku ;
//!   · AUCUNE, seulement [Ramp] : Ku monte lineairement sur la duree du front
//!     (dt 20-80 / 0,6), Kd = 1 - Ku -- la plus pauvre des trois, et dite.
//!
//! CE QUE LE PORTAGE CHANGE. Les dict de Python sont des structures ; chacune rend par `json()`
//! le dict que Python tenait, cles et ordre compris (`ipc2581::py::dumps` l'ecrit comme
//! json.dumps). Les tableaux numpy (N, 2, 2) et (N, 4, 4) sont des `Vec<M2>` et `Vec<M4>`.
//! La ou Python laissait echapper une exception qui n'est pas ErreurIbis (ValueError d'une
//! matrice illisible, OverflowError d'un « 1e999 », LinAlgError d'une matrice singuliere), la
//! fonction rend une ErreurIbis dont le message nomme cette exception.

mod abcd;
mod ami;
mod lecture;
mod py;
mod tampon;

#[cfg(test)]
mod essais;

pub use abcd::*;
pub use ami::*;
pub use lecture::*;
pub use tampon::*;

pub use ipc2581::py::{dumps, Json, Objet};

pub const VERSION: &str = "1.5.0";

/// COINS = {"typ": 0, "min": 1, "max": 2} ; None pour un coin inconnu.
pub fn coin(nom: &str) -> Option<usize> {
    match nom {
        "typ" => Some(0),
        "min" => Some(1),
        "max" => Some(2),
        _ => None,
    }
}

/// Refus explicite : un message d'une ligne et ce qu'il faut changer.
#[derive(Debug, Clone, PartialEq)]
pub struct ErreurIbis {
    pub message: String,
    pub conseil: String,
}

impl ErreurIbis {
    pub fn new(message: impl Into<String>, conseil: impl Into<String>) -> ErreurIbis {
        ErreurIbis { message: message.into(), conseil: conseil.into() }
    }

    /// Ce que Python laissait echapper sans le tourner en ErreurIbis : `genre` est le nom de
    /// l'exception (ValueError, OverflowError, TypeError, LinAlgError...).
    pub(crate) fn plantage(genre: &str, detail: impl std::fmt::Display) -> ErreurIbis {
        ErreurIbis::new(format!("Lecture IBIS interrompue ({genre}) : {detail}"), "")
    }
}

impl std::fmt::Display for ErreurIbis {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.message)
    }
}

impl std::error::Error for ErreurIbis {}
