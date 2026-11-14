//!     build-monofichier editeur-pcb          -> editeur-pcb/dist/editeur-pcb.html et dist/pcb.js
//!     build-monofichier editeur-schematique  -> editeur-schematique/dist/editeur-schematique.html
//!                                               et dist/schema.js
//!     build-monofichier                      -> les deux
//!
//! Utile pour distribuer l'éditeur : un seul fichier à envoyer, à archiver ou à
//! ouvrir en double-clic. Le développement, lui, se fait sur les fichiers séparés.
//! dist/pcb.js et dist/schema.js sont les bundles JavaScript seuls, chargés par test/harness.js.
//!
//! La mécanique est dans outils::monofichier, partagée par les deux éditeurs.

use outils::monofichier::{build_editeur, EDITEURS};

fn main() {
    let racine = outils::racine();
    let mut noms: Vec<String> = std::env::args().skip(1).map(|a| a.trim_end_matches(['/', '\\']).to_string()).collect();
    if noms.is_empty() {
        noms = EDITEURS.iter().map(|e| e.0.to_string()).collect();
    }
    for nom in &noms {
        if build_editeur(&racine, nom).is_none() {
            outils::quitter(&format!("éditeur inconnu : {nom} (editeur-pcb ou editeur-schematique)"));
        }
    }
}
