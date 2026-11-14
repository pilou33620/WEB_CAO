//! os.path de Python, sur des textes : les chemins voyagent tels quels dans les réponses.

use std::path::{Component, Path, PathBuf, MAIN_SEPARATOR};

/// os.path.abspath : absolu et normalisé, sans toucher au disque.
pub fn abspath(chemin: &str) -> String {
    let p = std::path::absolute(chemin).unwrap_or_else(|_| PathBuf::from(chemin));
    let mut out = PathBuf::new();
    for c in p.components() {
        match c {
            Component::ParentDir => {
                out.pop();
            }
            Component::CurDir => {}
            c => out.push(c),
        }
    }
    out.to_string_lossy().into_owned()
}

/// Sous Windows, canonicalize rend « \\?\C:\... » : la page afficherait ce préfixe.
fn sans_prefixe(p: PathBuf) -> PathBuf {
    #[cfg(windows)]
    {
        let t = p.to_string_lossy();
        if let Some(unc) = t.strip_prefix(r"\\?\UNC\") {
            return PathBuf::from(format!(r"\\{}", unc));
        }
        if let Some(reste) = t.strip_prefix(r"\\?\") {
            return PathBuf::from(reste.to_string());
        }
    }
    p
}

/// os.path.realpath : les liens suivis ; ce qui n'existe pas encore reste tel quel au bout.
pub fn realpath(chemin: &str) -> String {
    let p = PathBuf::from(abspath(chemin));
    let mut reste = Vec::new();
    let mut tete = p.as_path();
    loop {
        if let Ok(reel) = tete.canonicalize() {
            return reste.iter().rev().fold(sans_prefixe(reel), |c, m| c.join(m)).to_string_lossy().into_owned();
        }
        match (tete.parent(), tete.file_name()) {
            (Some(parent), Some(nom)) => {
                reste.push(nom.to_os_string());
                tete = parent;
            }
            _ => return p.to_string_lossy().into_owned(),
        }
    }
}

/// `chemin` est `racine` ou se trouve dessous (deux chemins déjà résolus).
pub fn dessous(chemin: &str, racine: &str) -> bool {
    chemin == racine || chemin.strip_prefix(racine).is_some_and(|r| racine.ends_with(MAIN_SEPARATOR) || r.starts_with(MAIN_SEPARATOR))
}

/// os.path.join(a, b).
pub fn joindre(a: &str, b: &str) -> String {
    if b.is_empty() {
        return a.to_string();
    }
    Path::new(a).join(b).to_string_lossy().into_owned()
}

/// os.path.expanduser : « ~ » et « ~/... ».
pub fn expanduser(chemin: &str) -> String {
    match chemin.strip_prefix('~') {
        Some(reste) if reste.is_empty() || reste.starts_with(['/', MAIN_SEPARATOR]) => {
            let maison = web_tools_commun::appairage::dossier_personnel();
            joindre(&maison.to_string_lossy(), reste.trim_start_matches(['/', MAIN_SEPARATOR]))
        }
        _ => chemin.to_string(),
    }
}

/// os.path.basename.
pub fn basename(chemin: &str) -> &str {
    let seps: &[char] = if cfg!(windows) { &['/', '\\', ':'] } else { &['/'] };
    chemin.rsplit(seps).next().unwrap_or("")
}

/// os.path.dirname d'un chemin absolu normalisé ; la racine d'un disque est son propre parent.
pub fn dirname(chemin: &str) -> String {
    Path::new(chemin).parent().map_or_else(|| chemin.to_string(), |p| p.to_string_lossy().into_owned())
}

/// os.path.relpath(chemin, depart), deux chemins absolus normalisés.
pub fn relpath(chemin: &str, depart: &str) -> String {
    let (a, b): (Vec<_>, Vec<_>) = (Path::new(chemin).components().collect(), Path::new(depart).components().collect());
    let commun = a.iter().zip(&b).take_while(|(x, y)| x == y).count();
    let mut out = PathBuf::new();
    for _ in commun..b.len() {
        out.push("..");
    }
    for c in &a[commun..] {
        out.push(c);
    }
    if out.as_os_str().is_empty() { ".".into() } else { out.to_string_lossy().into_owned() }
}

pub fn existe(chemin: &str) -> bool {
    Path::new(chemin).exists()
}

pub fn est_dossier(chemin: &str) -> bool {
    Path::new(chemin).is_dir()
}

/// Vrai si ce fichier peut vraiment être ouvert et lu.
pub fn lisible(chemin: &str) -> bool {
    use std::io::Read;
    std::fs::File::open(chemin).and_then(|mut f| f.read(&mut [0u8; 1])).is_ok()
}

/// Date de dernière écriture d'un fichier, en ms depuis l'époque (0 s'il manque) :
/// int(os.path.getmtime(chemin) * 1000), flottant de Python compris.
pub fn mtime_ms(chemin: &str) -> i64 {
    let Ok(t) = std::fs::metadata(chemin).and_then(|m| m.modified()) else { return 0 };
    match t.duration_since(std::time::UNIX_EPOCH) {
        Ok(d) => ((d.as_secs() as f64 + d.subsec_nanos() as f64 * 1e-9) * 1000.0) as i64,
        Err(_) => 0,
    }
}

/// str(OSError) de Python : « [Errno 13] Permission denied: '/chemin' ».
pub fn errno(e: &std::io::Error, chemin: &str) -> String {
    let texte = e.to_string();
    match e.raw_os_error() {
        Some(n) => format!("[Errno {}] {}: '{}'", n, texte.split(" (os error").next().unwrap_or(&texte), chemin),
        None => texte,
    }
}
