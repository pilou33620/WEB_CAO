//! Trois modules de WEB_CAO sans calcul lourd, portés de Python en Rust :
//!   - `pattern_recognition` (python/pattern_recognition.py) : motifs du schéma, classes de nets ;
//!   - `pcb_scoring` (python/pcb_scoring.py) : qualité d'un placement PCB ;
//!   - `lier_modeles_murata` (python/lier_modeles_murata.py) : l'outil qui relie les composants
//!     Murata du catalogue à leurs modèles SPICE (exécutable du même nom).
//!
//! Les documents sont des `Json` (le dict de Python, ordre des clés gardé) et les résultats
//! s'écrivent avec `dumps` : à l'octet ce que rendait `json.dumps(..., ensure_ascii=False)`.

pub mod lier_modeles_murata;
pub mod pattern_recognition;
pub mod pcb_scoring;
pub mod py;

#[cfg(test)]
mod essais;

pub use pattern_recognition::analyser_motifs_schema;
pub use pcb_scoring::evaluer_placement_pcb;
pub use py::{dumps, loads, Json, Objet};

/// Le moteur de motifs tel que le lecteur IPC-2581 l'attend (`ipc2581::Motifs`) :
///
///     ipc2581::ipc2581_en_dict_avec(&octets, "carte.xml", true, Some(&motifs::motifs_ipc2581))
///
/// Un echec n'empeche pas l'import (None, comme le `except Exception` du pont Python). Le
/// lecteur lit « nets_bruyants » comme la liste des noms (Python en faisait `sorted(dict)`,
/// qui ne garde que les clés) : l'objet nom -> raison lui est donc rendu réduit à ses clés.
pub fn motifs_ipc2581(entree: &Json) -> Option<Json> {
    let mut res = analyser_motifs_schema(entree).ok()?;
    if let Json::Objet(o) = &mut res {
        let noms: Vec<Json> = o.get("nets_bruyants")?.as_objet()?.keys().map(|n| n.as_str().into()).collect();
        o.insert("nets_bruyants".into(), Json::Liste(noms));
    }
    Some(res)
}
