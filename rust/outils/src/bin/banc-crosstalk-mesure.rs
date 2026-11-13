//!     banc-crosstalk-mesure
//!     banc-crosstalk-mesure --tr 2.5   # un front en ns
//!
//! Voir outils::banc_crosstalk.

use serde_json::Value;
use std::io::Write;
use std::process::{Command, Stdio};

/// POINT D'ACCROCHE -- A REMPLACER. Le moteur crosstalk n'est pas encore porte en Rust :
/// en attendant, `crosstalk.analyser` de python/crosstalk.py est appele dans un Python
/// (variable PYTHON, sinon « python3 », sinon « python »). Le jour ou une caisse `crosstalk`
/// existe, cette fonction devient un appel a son `analyser`, et rien d'autre ne change.
fn analyser(doc: &Value) -> Result<Value, String> {
    const CODE: &str = "import sys, json\nsys.path.insert(0, sys.argv[1])\nimport crosstalk\njson.dump(crosstalk.analyser(json.load(sys.stdin)), sys.stdout)";
    let python = outils::racine().join("python");
    let noms: Vec<String> = std::env::var("PYTHON").into_iter().chain(["python3".into(), "python".into()]).collect();
    let mut enfant = noms
        .iter()
        .find_map(|p| Command::new(p).arg("-c").arg(CODE).arg(&python).stdin(Stdio::piped()).stdout(Stdio::piped()).spawn().ok())
        .ok_or("crosstalk n'est pas encore porte en Rust, et aucun Python n'a ete trouve pour python/crosstalk.py")?;
    // l'ecriture echoue si Python est deja tombe : c'est son code de sortie qui le dira
    let _ = enfant.stdin.take().unwrap().write_all(doc.to_string().as_bytes());
    let sortie = enfant.wait_with_output().map_err(|e| e.to_string())?;
    if !sortie.status.success() {
        return Err("python/crosstalk.py a echoue (voir ci-dessus)".into());
    }
    serde_json::from_slice(&sortie.stdout).map_err(|e| format!("reponse de python/crosstalk.py illisible : {e}"))
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let ici = outils::racine().join("bancs-mesure").join("crosstalk");
    std::process::exit(outils::banc_crosstalk::main(&ici, &args, &analyser));
}
