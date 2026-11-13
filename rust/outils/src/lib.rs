//! Les outils de construction de WEB_CAO, portés de Python : le manuel et les règles
//! (`manuel`), les monofichiers des deux éditeurs (`monofichier`), la fonte des plans
//! (`fonte_plans`). Chaque exécutable de `src/bin/` n'est qu'un appel ; la mécanique est ici.

pub mod fonte_plans;
pub mod manuel;
pub mod monofichier;
pub mod passerelle_mcp;

use std::path::{Component, Path, PathBuf};

/// La racine du dépôt. Les scripts Python la déduisaient de leur propre place
/// (`__file__`) ; un exécutable n'a pas de place fixe : on prend la variable
/// WEB_CAO_RACINE, sinon le premier dossier au-dessus de l'exécutable, puis du dossier
/// courant, qui porte `editeur-pcb/editeur-pcb.html`, sinon le dépôt d'où il a été compilé.
pub fn racine() -> PathBuf {
    if let Some(r) = std::env::var_os("WEB_CAO_RACINE") {
        return PathBuf::from(r);
    }
    let departs = [std::env::current_exe().ok(), std::env::current_dir().ok()];
    for depart in departs.iter().flatten() {
        for d in depart.ancestors() {
            if d.join("editeur-pcb").join("editeur-pcb.html").is_file() {
                return d.to_path_buf();
            }
        }
    }
    normpath(&Path::new(env!("CARGO_MANIFEST_DIR")).join("..").join(".."))
}

/// sys.exit("message") : le message sur la sortie d'erreur, code 1.
pub fn quitter(message: &str) -> ! {
    eprintln!("{message}");
    std::process::exit(1)
}

/// io.open(chemin, encoding="utf-8").read() : les fins de ligne « \r\n » et « \r »
/// deviennent « \n » (mode texte de Python).
pub fn lire_texte(chemin: &Path) -> std::io::Result<String> {
    let texte = String::from_utf8(std::fs::read(chemin)?)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
    Ok(if texte.contains('\r') { texte.replace("\r\n", "\n").replace('\r', "\n") } else { texte })
}

/// io.open(chemin, "w", encoding="utf-8").write(texte) : « \n » devient la fin de ligne
/// du système (« \r\n » sous Windows), comme le mode texte de Python.
pub fn ecrire_texte(chemin: &Path, texte: &str) -> std::io::Result<()> {
    if cfg!(windows) {
        std::fs::write(chemin, texte.replace('\n', "\r\n"))
    } else {
        std::fs::write(chemin, texte)
    }
}

/// os.path.normpath : « . » et « .. » résolus sur le texte du chemin, sans toucher au disque.
pub fn normpath(chemin: &Path) -> PathBuf {
    let mut out: Vec<Component> = Vec::new();
    for c in chemin.components() {
        match c {
            Component::CurDir => {}
            Component::ParentDir => match out.last() {
                Some(Component::Normal(_)) => {
                    out.pop();
                }
                Some(Component::RootDir) | Some(Component::Prefix(_)) => {}
                _ => out.push(c),
            },
            _ => out.push(c),
        }
    }
    if out.is_empty() {
        return PathBuf::from(".");
    }
    out.iter().collect()
}

/// os.path.relpath(chemin, base), les deux déjà absolus et normalisés.
pub fn relpath(chemin: &Path, base: &Path) -> PathBuf {
    let (a, b): (Vec<_>, Vec<_>) = (chemin.components().collect(), base.components().collect());
    let commun = a.iter().zip(&b).take_while(|(x, y)| x == y).count();
    let mut out = PathBuf::new();
    for _ in commun..b.len() {
        out.push("..");
    }
    for c in &a[commun..] {
        out.push(c);
    }
    if out.as_os_str().is_empty() {
        out.push(".");
    }
    out
}
