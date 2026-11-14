//!     banc-crosstalk-mesure
//!     banc-crosstalk-mesure --tr 2.5   # un front en ns
//!
//! Voir outils::banc_crosstalk.

use serde_json::Value;

/// Le moteur : `crosstalk.analyser` de la caisse `em` (le portage de python/crosstalk.py),
/// appele directement. Le document et le resultat traversent en JSON, comme ils
/// traversaient l'entree et la sortie du Python d'avant.
fn analyser(doc: &Value) -> Result<Value, String> {
    let doc = em::crosstalk::loads(&doc.to_string())?;
    let resultat = em::crosstalk::analyser(&doc, None).map_err(|e| if e.conseil.is_empty() { e.message } else { format!("{}\n\n{}", e.message, e.conseil) })?;
    serde_json::from_str(&em::crosstalk::dumps(&resultat)).map_err(|e| format!("resultat de crosstalk illisible : {e}"))
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let ici = outils::racine().join("bancs-mesure").join("crosstalk");
    std::process::exit(outils::banc_crosstalk::main(&ici, &args, &analyser));
}
