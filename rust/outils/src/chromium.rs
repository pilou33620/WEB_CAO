//! Chromium sans fenêtre, pour les bancs qui lisent leur bilan dans une page rendue.

use std::io::Read;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

/// shutil.which("chromium") or which("chromium-browser") or which("google-chrome") des bancs
/// Python ; la variable CHROMIUM, si elle est donnée, passe devant (un Chromium hors du PATH,
/// ou chrome-headless-shell).
pub fn trouver() -> Option<PathBuf> {
    if let Some(c) = std::env::var_os("CHROMIUM").filter(|c| !c.is_empty()) {
        return Some(PathBuf::from(c));
    }
    let chemins: Vec<PathBuf> = std::env::split_paths(&std::env::var_os("PATH")?).collect();
    let suffixe = if cfg!(windows) { ".exe" } else { "" };
    ["chromium", "chromium-browser", "google-chrome"]
        .iter()
        .find_map(|nom| chemins.iter().map(|d| d.join(format!("{nom}{suffixe}"))).find(|p| p.is_file()))
}

/// subprocess.run(..., capture_output=True, text=True, timeout=delai) : (stdout, stderr), ou
/// une erreur si le programme ne se lance pas ou n'a pas fini dans le délai (il est alors tué).
pub fn lancer(programme: &std::path::Path, args: &[String], delai: Duration) -> Result<(String, String), String> {
    let mut enfant = Command::new(programme)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("{} : {e}", programme.display()))?;
    // les deux tuyaux se lisent à part : un Chromium bavard remplirait le sien et attendrait
    let lecteur = |mut t: Box<dyn Read + Send>| {
        std::thread::spawn(move || {
            let mut octets = Vec::new();
            let _ = t.read_to_end(&mut octets);
            String::from_utf8_lossy(&octets).into_owned()
        })
    };
    let (sortie, erreurs) = (lecteur(Box::new(enfant.stdout.take().unwrap())), lecteur(Box::new(enfant.stderr.take().unwrap())));
    let fin = Instant::now() + delai;
    let mut expire = false;
    while enfant.try_wait().map_err(|e| e.to_string())?.is_none() {
        if Instant::now() >= fin {
            expire = true;
            let _ = enfant.kill();
            let _ = enfant.wait();
            break;
        }
        std::thread::sleep(Duration::from_millis(20));
    }
    if expire {
        return Err(format!("{} n'a pas fini en {} s", programme.display(), delai.as_secs()));
    }
    Ok((sortie.join().unwrap_or_default(), erreurs.join().unwrap_or_default()))
}

/// file://chemin
pub fn url(chemin: &std::path::Path) -> String {
    let c = chemin.to_string_lossy().replace('\\', "/");
    if c.starts_with('/') {
        format!("file://{c}")
    } else {
        format!("file:///{c}")
    }
}
