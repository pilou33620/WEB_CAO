//! Recomposition d'un fichier HTML unique à partir d'une version découpée.
//!
//! Module commun aux deux éditeurs : `build-monofichier` n'a qu'un appel de trois
//! lignes par éditeur. Aucune minification, aucune transformation :
//! le contenu est recopié tel quel, dans l'ordre déclaré par les balises
//! <link rel="stylesheet"> et <script src> de la page.
//!
//! Les chemins relatifs sont résolus depuis le dossier de l'éditeur, ce qui permet
//! d'inliner les ressources partagées (« ../commun/workspace.js »).

use crate::{ecrire_texte, lire_texte, quitter, relpath};
use regex::{Captures, Regex};
use std::path::Path;

fn read(root: &Path, rel: &str) -> String {
    let path = root.join(rel);
    lire_texte(&path).unwrap_or_else(|e| quitter(&format!("{} : {e}", path.display())))
}

/// Inline les styles et scripts de `page` (relatif à `root`).
///
/// Écrit le HTML autonome dans `dst_html` et, si `dst_js` est fourni, le
/// bundle JavaScript seul — c'est lui que le banc d'essai charge.
/// Renvoie (n_css, n_scripts).
pub fn build(root: &Path, page: &str, dst_html: &Path, dst_js: Option<&Path>) -> (usize, usize) {
    let link_re = Regex::new(r#"<link rel="stylesheet" href="([^"]+)">"#).unwrap();
    let src_re = Regex::new(r#"<script src="([^"]+)"></script>"#).unwrap();
    let html = read(root, page);

    let mut n_css = 0;
    let html = link_re
        .replace_all(&html, |m: &Captures| {
            n_css += 1;
            format!("<style>\n{}\n</style>", read(root, &m[1]).trim_end_matches('\n'))
        })
        .into_owned();

    let scripts: Vec<String> = src_re.captures_iter(&html).map(|m| m[1].to_string()).collect();
    if scripts.is_empty() {
        quitter(&format!("aucune balise <script src> trouvée dans {page} : le gabarit a changé ?"));
    }

    let mut parts = Vec::new();
    for rel in &scripts {
        let code = read(root, rel);
        if code.to_lowercase().contains("</script") {
            quitter(&format!("« </script » présent dans {rel} : impossible d'inliner tel quel."));
        }
        parts.push(format!("/* ---------- {rel} ---------- */\n{}", code.trim_end_matches('\n')));
    }

    let js_bundle = parts.join("\n\n");

    // la première balise devient le bloc complet, les suivantes disparaissent
    let mut first = true;
    let html = Regex::new(r#"<script src="[^"]+"></script>\n?"#).unwrap().replace_all(&html, |_: &Captures| {
        if first {
            first = false;
            format!("<script>\n{js_bundle}\n</script>")
        } else {
            String::new()
        }
    });
    let html = Regex::new(r"\n{3,}").unwrap().replace_all(&html, "\n\n");

    for (path, text) in [(Some(dst_html), &*html), (dst_js, &*js_bundle)] {
        let Some(path) = path else { continue };
        let ecrit = std::fs::create_dir_all(path.parent().unwrap()).and_then(|_| ecrire_texte(path, text));
        if let Err(e) = ecrit {
            quitter(&format!("{} : {e}", path.display()));
        }
    }

    let written: Vec<String> =
        [Some(dst_html), dst_js].iter().flatten().map(|p| relpath(p, root).display().to_string()).collect();
    println!(
        "écrit : {}  ({} Ko, {} feuille(s) de style, {} scripts)",
        written.join(" et "),
        std::fs::metadata(dst_html).map(|m| m.len()).unwrap_or(0) / 1024,
        n_css,
        scripts.len()
    );
    (n_css, scripts.len())
}

/// Les deux éditeurs : (dossier, page, bundle JavaScript de dist/).
pub const EDITEURS: [(&str, &str, &str); 2] =
    [("editeur-pcb", "editeur-pcb.html", "pcb.js"), ("editeur-schematique", "editeur-schematique.html", "schema.js")];

/// Ce que faisait `<editeur>/outils/build-monofichier.py` : dist/<page> et dist/<bundle>.
pub fn build_editeur(racine: &Path, editeur: &str) -> Option<(usize, usize)> {
    let (dossier, page, js) = EDITEURS.iter().find(|e| e.0 == editeur)?;
    let root = racine.join(dossier);
    let dist = root.join("dist");
    Some(build(&root, page, &dist.join(page), Some(&dist.join(js))))
}
