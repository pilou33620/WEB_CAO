//! Diagramme de l'oeil : la liaison vue par le recepteur, bit apres bit.
//!
//! ```text
//! oeil::etat()["dispo"]
//! ```
//!
//! LA QUESTION. Les parametres S disent ce que la liaison fait a une sinusoide ;
//! le recepteur, lui, voit une suite de bits. Chaque bit deborde sur ses voisins
//! -- pertes, reflexions, moignons -- et l'oeil est ce qu'il reste d'ouvert quand
//! on superpose tous les bits les uns sur les autres. C'est aussi ce que les
//! normes jugent : un gabarit (« masque ») dans lequel aucune trace n'a le droit
//! d'entrer.
//!
//! LA LIAISON EST CELLE DU DEPOT, ET RIEN D'AUTRE. La selection part dans
//! `simulation_em.simuler` exactement comme sous l'onglet Impedance -- methode
//! des moments sur la section droite, dispersion, pertes, coudes, vias,
//! moignons -- et l'on demande sa matrice ABCD a chaque frequence d'une grille
//! reguliere (`freqs_imposees`). En differentiel, c'est la cascade du mode
//! impair (`s_diff["abcd_dd"]`). Ce module n'ajoute que ce qui est AUTOUR :
//!
//!     1. l'emetteur, un generateur de Thevenin lineaire : tension a vide
//!        (v_bas, v_haut), resistance de sortie, front gaussien de temps de
//!        montee tr (10-90 %) et, au besoin, une pre-accentuation (FFE) ;
//!     2. le recepteur : resistance de terminaison et capacite de broche, et
//!        l'egaliseur de reference du protocole quand le gabarit en suppose un
//!        (CTLE, DFE) ;
//!     3. le passage en temporel : la fonction de transfert generateur -> broche
//!        du recepteur, IFFT, reponse a un echelon puis a UN BIT ;
//!     4. deux yeux tires de cette meme reponse a un bit :
//!        - l'oeil PRBS (PRBS7, 9 ou 15) par superposition -- la liaison est
//!          lineaire, la somme des reponses decalees EST la forme d'onde ;
//!        - l'oeil PIRE CAS par analyse de distorsion crete (PDA) : la pire
//!          combinaison de bits voisins, toutes sequences confondues, et pas
//!          seulement celles que le PRBS contient ;
//!     5. le gabarit du protocole, et la marge : de combien on peut l'agrandir
//!        avant qu'une trace le touche.
//!
//! DEPUIS LA 2.0.0, TROIS CHOSES DE PLUS, toutes FACULTATIVES -- sans elles,
//! le resultat est celui de la 1.0.0 :
//!     6. l'OEIL STATISTIQUE : gigue aleatoire (RJ) et deterministe (DJ) de
//!        l'emetteur, bruit du recepteur, contours de taux d'erreur (10^-6 a
//!        10^-15) et baignoire -- voir `oeil_statistique` ;
//!     7. la DIAPHONIE des voisines, bornee, dans le pire cas et dans l'oeil
//!        statistique : saisie, ou reprise du couplage de `simulation_em` par le
//!        niveau 2 de `crosstalk.py` -- voir `agresseurs_du_couplage` ;
//!     8. des tampons IBIS a l'emetteur et au recepteur, simules dans le temps
//!        contre le canal (`ibis.py`) -- voir `simuler_non_lineaire`.
//! Et la cascade differentielle porte maintenant les vias et les coudes de la
//! paire (`simulation_em` 4.4.0).
//!
//! DEPUIS LA 2.1.0, l'IBIS va jusqu'au bout, toujours FACULTATIF :
//!     9. le BOITIER de chaque broche ([Package], [Pin], diagonale d'un
//!        [Package Model]), fondu dans la cascade entre le die et la piste --
//!        voir `appliquer_boitiers` ; un boitier nul rend l'oeil d'avant ;
//!    10. en differentiel, les DEUX BRINS de la paire, chacun son tampon, son
//!        modele, son coin, son boitier ([Diff Pin]) et le tdelay du brin
//!        inverse ; le MODE COMMUN qui en sort, et l'oeil d'une paire
//!        symetrique pour comparer -- voir `simuler_paire`, `mode_commun` ;
//!        le vdiff du recepteur devient son seuil ;
//!    11. le fichier .ami d'un modele IBIS-AMI, LU et montre, et l'egaliseur
//!        de reference regle d'apres lui sur demande -- la bibliotheque du
//!        fabricant n'est PAS executee : voir `preparer_ami`.
//!
//! DEPUIS LA 2.2.0, la paire et le boitier vont jusqu'au bout :
//!    12. une paire DISSYMETRIQUE -- largeurs ou masses differentes, vias ou
//!        coudes sur un seul brin, un brin plus long -- passe par la cascade a
//!        quatre acces de `simulation_em` 5.1.0 (`s_diff["abcd_brins"]`) : en
//!        lineaire, son transfert differentiel (`transfert_paire`) ; avec des
//!        tampons IBIS, les deux brins simules sur elle. Le brin le plus long
//!        est celui que les longueurs designent, plus le brin N d'office. Une
//!        paire symetrique rend l'oeil d'avant, au bit pres ;
//!    13. les MUTUELLES du [Package Model] entre les deux broches d'une paire
//!        de [Diff Pin] sont comptees (`ibis.mutuelle_paire`) : boitier couple
//!        brin par brin, ou L - L_m et C + C_m dans la moyenne du mode impair ;
//!    14. un boitier PAR SECTIONS (Len=) est une cascade de lignes
//!        (`ibis.abcd_sections`).
//!
//! DEPUIS LA 2.3.0, toujours FACULTATIF :
//!    15. les CONDENSATEURS DE LIAISON (couplage AC) : un condensateur en
//!        serie sur chaque brin, ESL et ESR compris, cote emetteur ou
//!        recepteur, dans la cascade du canal (simple, deux modes, quatre
//!        acces) ; coupure basse, et le droop des longues suites dans le pire
//!        cas et le PRBS -- voir « LES CONDENSATEURS DE LIAISON » ;
//!    16. l'EXECUTION DU MODELE AMI (bibliotheque du fabricant, par ctypes,
//!        `ibis.ModeleAmi`) : AMI_Init de l'emetteur sur la reponse
//!        impulsionnelle du canal, AMI_Init et AMI_GetWave du recepteur par
//!        blocs, parametres In/InOut du .ami surchargeables, Out rendus --
//!        voir « L'EXECUTION DES MODELES AMI ». Seul un fichier designe par
//!        l'utilisateur sous la LIB ou un projet s'execute ; tout echec est un
//!        avertissement et un repli sur l'egaliseur de reference ;
//!    17. la rugosite propre du plan de reference dans la cascade de la paire
//!        (`simulation_em` 5.4.0) : l'oeil differentiel la suit.
//!
//! DEPUIS LA 2.4.0, ce qui restait dit et pas compte l'est :
//!    18. les MUTUELLES du [Package Model] vers les broches VOISINES
//!        (`ibis.abcd_boitier_couple`) : voisines au repos, fermees sur
//!        `r_voisin` (50 ohms) aux deux bouts -- alimentations et masses en
//!        court-circuit, NC ouvertes -- et eliminees ; `boitier_voisins: false`
//!        rend le boitier d'avant. Un boitier PAR SECTIONS n'a pas de
//!        mutuelles : [Number Of Sections] et les matrices s'excluent (BIRD 54) ;
//!    19. l'AMI_GETWAVE DE L'EMETTEUR : la stimulation (+-0,5 par bit) passe
//!        par lui, puis par le canal brut ; un recepteur a AMI_Init seul
//!        derriere lui est initialise une seconde fois sur le canal brut ;
//!    20. l'HORLOGE RECUPEREE par le recepteur AMI FIXE l'echantillonnage
//!        (instant + bit / 2, BIRD 214) : phase moyenne pour le pire cas et
//!        l'oeil statistique, chaque bit de l'oeil PRBS a son instant -- voir
//!        « L'HORLOGE RECUPEREE » dans `oeil` ;
//!    21. l'AMI SUR DES TAMPONS IBIS SIMULES DANS LE TEMPS : le GetWave du
//!        recepteur recoit la forme d'onde NON LINEAIRE de la broche,
//!        l'egalisation de l'emetteur ajoutee par le canal linearise (la
//!        norme suppose le canal analogique lineaire ; ce qui ne l'est pas
//!        reste dans la forme d'onde) ;
//!    22. le via sur le brin N seul et les brins superposes sur deux couches
//!        (`simulation_em` 5.5.0), dans la cascade a quatre acces ;
//!    23. les condensateurs de liaison : le pole lent SEPARE dans les
//!        chemins lineaires (decharge exacte quelle que soit la fenetre), le
//!        pont diviseur de la paire par brin sans terminaison.
//!
//! CE QUI N'EST PAS LA, et se dit dans chaque resultat : un recepteur AMI a
//! AMI_Init seul sur des tampons non lineaires egalise la part lineaire de la
//! forme d'onde, pas ce que les tampons y ajoutent ; un Tx AMI ne pilote pas
//! le tampon IBIS lui-meme (multi-niveaux), son egalisation passe par le canal
//! linearise.
//! Les gabarits portent chacun leur FIABILITE : les normes sont payantes, et
//! une valeur qui n'a pas pu etre recoupee le dit.
//!
//! Le document d'entree est celui de `simulation_em` (format « cao-sim-em-* »)
//! avec un champ de plus, EN UNITES SI :
//!
//!     oeil {debit (bit/s), tr (s), v_haut, v_bas (V, a vide), r_source (ohm),
//!           r_charge (ohm, 0 = haute impedance), c_charge (F),
//!           mode "simple"|"diff", motif "prbs7"|"prbs9"|"prbs15",
//!           gabarit (id de GABARITS ou ""), egaliseur (bool),
//!           ffe [coefficients], ffe_principal (rang du curseur principal),
//!           dfe_prises, dfe_max (V), ctle {adc_db, fz, fp1, fp2},
//!           setup, hold (s, pour les gabarits « seuils »),
//!           -- facultatifs, 2.0.0 --
//!           rj (s rms) ou rj_ui, dj (s crete a crete, double Dirac) ou dj_ui,
//!           bruit_v (V rms au recepteur), ber_cible, statistique (bool),
//!           agresseurs [{nom, crete_v} ou {nom, coef, v}],
//!           agresseurs_auto (bool), agresseurs_sens "meme"|"oppose"|"inconnu",
//!           agresseurs_v (V), agresseurs_tr (s),
//!           ibis_emetteur, ibis_recepteur {texte, fichier, modele,
//!                                          coin "typ"|"min"|"max",
//!           -- facultatifs, 2.1.0 --
//!                                          broche (de [Pin] ; en differentiel,
//!                                          celle d'une paire de [Diff Pin]),
//!                                          modele_n, coin_n (brin inverse),
//!                                          ami {texte, fichier,
//!           -- facultatifs, 2.3.0 --
//!                                               bibliotheque (chemin du .so /
//!                                               .dll sous la LIB ou un projet),
//!                                               parametres {nom ou chemin:
//!                                               valeur}}},
//!           boitier (bool, vrai par defaut), decalage_n (s, retard du brin
//!           inverse : remplace le tdelay), r_charge_mc (ohm, impedance de mode
//!           commun du recepteur, 0 = flottant), ami_regler (bool),
//!           couplage_ac {c (F, par brin), esr (ohm), esl (H), boitier ("0402"
//!           ...), position "emetteur"|"recepteur"}}
//!
//! CE QUE LE PORTAGE CHANGE. Les reglages `p` de Python sont la structure `Params` (son
//! `json()` rend le dict, cles et ordre compris) ; le contexte IBIS, `Ctx` ; ce que
//! `oeil(non_lineaire=...)` lit, `NonLineaire`. Les tableaux numpy (N, 2, 2) et (N, 4, 4) sont
//! des `Vec<M2>` et `Vec<M4>` de `ibis`. `ibis.ModeleAmi` passe par le trait `ModeleAmiT` et un
//! `ChargeurAmi`, que le banc remplace par un faux. La ou Python laissait echapper une
//! exception qui n'est pas ErreurOeil (une « Erreur interne » de la route), l'erreur porte
//! `interne`.

mod ami;
mod analyse;
mod briques;
mod gabarits;
mod nl;
pub mod np;
mod params;
mod statistique;
mod trace;

pub use ami::*;
pub use analyse::*;
pub use briques::*;
pub use gabarits::*;
pub use nl::*;
pub use params::*;
pub use statistique::*;
pub use trace::*;

pub use em::simulation_em::base::{dumps, loads, Json, Objet};
pub use ibis::{Complex64, M2, M4};

pub const VERSION: &str = "2.4.1";
pub const FORMAT_RESULTAT: &str = "cao-oeil-resultat-1";
// UN FICHIER IBIS VOYAGE DANS LA REQUETE, en texte : quelques megaoctets pour
// les plus gros composants, deux fois si l'emetteur et le recepteur en ont
// chacun un.
pub const MAX_CORPS: usize = 16 * 1024 * 1024;

// Echantillons par intervalle unitaire : 64 colonnes par UI, 128 sur les deux
// UI affichees. C'est aussi la resolution de la largeur d'oeil (1/64 UI).
pub const ECHANTILLONS_UI: usize = 64;
// Lignes de l'histogramme de densite.
pub const LIGNES_DENSITE: usize = 160;
// Plafond de la grille de frequences : au-dela, la fenetre est raccourcie et
// on le dit. 8192 points coutent moins d'une seconde de cascade.
pub const MAX_FREQS: usize = 8192;
// Le front gaussien : 10-90 % = 2 x 1,2816 sigma.
pub const TR_SUR_SIGMA: f64 = 2.5631;

pub const C_0: f64 = 299792458.0;

/// Refus explicite : un message d'une ligne et ce qu'il faut changer.
///
/// `interne` : ce n'est pas un refus du module mais une exception que Python laissait
/// remonter telle quelle (une « Erreur interne » de la route) ; le message la nomme.
#[derive(Debug, Clone, PartialEq)]
pub struct ErreurOeil {
    pub message: String,
    pub conseil: String,
    pub interne: bool,
}

impl ErreurOeil {
    pub fn new(message: impl Into<String>, conseil: impl Into<String>) -> ErreurOeil {
        ErreurOeil { message: message.into(), conseil: conseil.into(), interne: false }
    }

    /// Ce que Python laissait echapper : `genre` est le nom de l'exception.
    pub fn plantage(genre: &str, detail: impl std::fmt::Display) -> ErreurOeil {
        ErreurOeil { message: format!("{genre} : {detail}"), conseil: String::new(), interne: true }
    }

    /// Une ErreurIbis que oeil.py ne rattrapait pas.
    pub fn ibis(e: ibis::ErreurIbis) -> ErreurOeil {
        ErreurOeil { message: e.message, conseil: e.conseil, interne: true }
    }
}

impl std::fmt::Display for ErreurOeil {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.message)
    }
}

impl std::error::Error for ErreurOeil {}

pub type Res<T> = Result<T, ErreurOeil>;
