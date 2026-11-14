//! Les outils de construction contre ce que leurs scripts Python écrivaient : `essais/` garde
//! des entrées retorses et, dans `attendu/`, la sortie de commun/outils/build-manuel.py et de
//! commun/outils/monofichier.py (Python 3.13) sur ces entrées. Le Rust doit rendre la même
//! chose, à l'octet.

use std::path::{Path, PathBuf};

fn essais(nom: &str) -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("essais").join(nom)
}

fn copier(de: &Path, vers: &Path) {
    std::fs::create_dir_all(vers).unwrap();
    for e in std::fs::read_dir(de).unwrap().flatten() {
        if e.path().is_dir() {
            copier(&e.path(), &vers.join(e.file_name()));
        } else {
            std::fs::copy(e.path(), vers.join(e.file_name())).unwrap();
        }
    }
}

/// Une copie de travail des entrées : les outils écrivent à côté de ce qu'ils lisent.
fn travail(nom: &str) -> PathBuf {
    let t = std::env::temp_dir().join(format!("outils-{nom}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&t);
    copier(&essais(nom), &t);
    t
}

#[test]
fn le_manuel_est_celui_du_script_python() {
    let t = travail("manuel");
    assert_eq!(outils::manuel::main(&t), 0);
    for (dossier, page) in [("manuel", "manuel.html"), ("regles", "regles.html")] {
        let vu = std::fs::read(t.join("docs").join(dossier).join(page)).unwrap();
        assert!(vu == std::fs::read(t.join("attendu").join(page)).unwrap(), "{page} diffère");
    }
    // un lien cassé : rien n'est écrit pour ce livre, code 1
    std::fs::remove_file(t.join("autre").join("fichier.txt")).unwrap();
    std::fs::remove_file(t.join("docs/manuel/manuel.html")).unwrap();
    std::fs::write(t.join("docs/regles/index.md"), "# Seul\n").unwrap();
    assert_eq!(outils::manuel::main(&t), 1);
    assert!(!t.join("docs/manuel/manuel.html").exists());
    std::fs::remove_dir_all(&t).unwrap();
}

#[test]
fn le_monofichier_est_celui_du_script_python() {
    let t = travail("monofichier");
    let (html, js) = (t.join("dist").join("page.html"), t.join("dist").join("bundle.js"));
    assert_eq!(outils::monofichier::build(&t.join("editeur"), "page.html", &html, Some(&js)), (2, 3));
    // sous Windows, Python écrivait en « \r\n » : la comparaison se fait fins de ligne ramenées
    let lire = |p: &Path| outils::lire_texte(p).unwrap();
    assert!(lire(&html) == lire(&t.join("attendu").join("page.html")), "page.html diffère");
    assert!(lire(&js) == lire(&t.join("attendu").join("bundle.js")), "bundle.js diffère");
    std::fs::remove_dir_all(&t).unwrap();
}

/// La fonte des plans suivie dans le dépôt est celle que l'outil refait depuis Liberation Sans.
/// Sans la fonte du système, ou avec une autre version que celle qui a servi : l'essai le dit
/// et ne conclut rien.
#[test]
fn la_fonte_des_plans_est_celle_du_depot() {
    let depot = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../editeur-pcb/js/fontes/plans-sans.js");
    let Ok(attendu) = std::fs::read_to_string(&depot) else {
        println!("fonte des plans : {} absent, essai non exécuté", depot.display());
        return;
    };
    for source in outils::fonte_plans::SOURCES {
        let taille = std::fs::metadata(source).map(|m| m.len()).unwrap_or(0);
        if !attendu.contains(&format!("(original {taille})")) {
            println!("fonte des plans : {source} absente ou d'une autre version, essai non exécuté");
            return;
        }
    }
    let t = std::env::temp_dir().join(format!("outils-fonte-{}", std::process::id()));
    outils::fonte_plans::main(&t, &[]);
    let vu = std::fs::read_to_string(t.join("js/fontes/plans-sans.js")).unwrap();
    std::fs::remove_dir_all(&t).unwrap();
    assert!(vu == attendu, "plans-sans.js diffère de celui du dépôt");
}
