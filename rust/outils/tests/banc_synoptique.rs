//! Banc du synoptique : charge chaque schématique de PROJETS/CAO dans l'éditeur (Chromium sans
//! écran), applique Ranger et imprime une ligne de bilan par projet : blocs, liaisons, alims,
//! liaisons non routées (traits directs), blocs sans titre deviné, blocs isolés.
//!
//!     cargo test -p outils --test banc_synoptique -- --ignored --nocapture
//!
//! Prérequis : dist/ régénéré (build-monofichier editeur-schematique) et Chromium (dans le
//! PATH, ou par la variable CHROMIUM).
//! SYNOPTIQUE_CAPTURES=1 (le --captures du banc Python) : une capture PNG par projet dans le
//! dossier de travail affiché à la fin. WEB_CAO_PROJETS : un autre dossier que ../PROJETS/CAO.
//! Sans Chromium, sans dist/ ou sans schématique : le banc le dit et ne conclut rien (le banc
//! Python, lancé à la main, sortait alors en erreur).

use regex::Regex;
use std::path::PathBuf;
use std::time::Duration;

const JS: &str = include_str!("banc-synoptique-bilan.js");

fn chromium(chrome: &std::path::Path, args: &[String]) -> String {
    let fixes = ["--headless", "--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1", "--window-size=1700,1000", "--virtual-time-budget=60000"];
    let tous: Vec<String> = fixes.iter().map(|a| a.to_string()).chain(args.iter().cloned()).collect();
    // « timeout 180 chromium … » : passé le délai, pas de sortie, donc pas de bilan
    outils::chromium::lancer(chrome, &tous, Duration::from_secs(180)).map(|s| s.0).unwrap_or_default()
}

/// html.unescape
// shortcut: les entités que Chromium écrit dans le texte d'un <pre> (&amp; &lt; &gt;) et les
// guillemets ; pas la table entière de HTML 5.
fn unescape(t: &str) -> String {
    t.replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"").replace("&#39;", "'").replace("&#x27;", "'").replace("&amp;", "&")
}

#[test]
#[ignore = "demande Chromium et les schématiques de PROJETS/CAO ; à lancer avec --ignored"]
fn synoptique() {
    let racine = outils::racine();
    let Some(chrome) = outils::chromium::trouver() else {
        println!("synoptique : Chromium absent, banc non exécuté");
        return;
    };
    let dist = racine.join("editeur-schematique/dist/editeur-schematique.html");
    if !dist.exists() {
        println!("dist/editeur-schematique.html absent : lancer build-monofichier -- banc non exécuté");
        return;
    }
    let projets = std::env::var_os("WEB_CAO_PROJETS").map(PathBuf::from).unwrap_or_else(|| racine.join("../PROJETS/CAO"));
    let out = std::env::temp_dir().join(format!("banc-synoptique-{}", std::process::id()));
    let page_src = outils::lire_texte(&dist).unwrap();
    // sorted(glob("PROJETS/*/*-SCH.json"))
    let mut fichiers: Vec<PathBuf> = std::fs::read_dir(&projets)
        .into_iter()
        .flatten()
        .flatten()
        .flat_map(|d| std::fs::read_dir(d.path()).into_iter().flatten().flatten().map(|f| f.path()).collect::<Vec<_>>())
        .filter(|f| f.file_name().is_some_and(|n| n.to_string_lossy().ends_with("-SCH.json")))
        .collect();
    fichiers.sort();
    if fichiers.is_empty() {
        println!("aucune schématique dans {} -- banc non exécuté", outils::normpath(&projets).display());
        return;
    }
    std::fs::create_dir_all(&out).unwrap();
    let mut ko = 0;
    for f in &fichiers {
        let dossier = f.parent().unwrap().file_name().unwrap().to_string_lossy();
        let nom = Regex::new(r"[^\p{L}\p{N}_]+").unwrap().replace_all(&dossier, "_").into_owned();
        std::fs::write(out.join(format!("{nom}.js")), JS.replacen("%s", &outils::lire_texte(f).unwrap(), 1)).unwrap();
        let page = out.join(format!("{nom}.html"));
        std::fs::write(&page, page_src.replace("</body>", &format!("<script src=\"{nom}.js\"></script></body>"))).unwrap();
        let dom = chromium(&chrome, &["--dump-dom".into(), outils::chromium::url(&page)]);
        let bilan = match Regex::new(r#"(?s)<pre id="OUT">(.*?)</pre>"#).unwrap().captures(&dom) {
            Some(m) => unescape(&m[1]),
            None => r#"{"erreur":"pas de bilan (délai ou plantage)"}"#.to_string(),
        };
        ko += (bilan.contains("\"erreur\"") || !bilan.contains("\"direct\":0")) as usize;
        println!("{:<22} {}", nom.chars().take(22).collect::<String>(), bilan.chars().take(300).collect::<String>());
        if std::env::var_os("SYNOPTIQUE_CAPTURES").is_some() {
            chromium(&chrome, &[format!("--screenshot={}", out.join(format!("{nom}.png")).display()), outils::chromium::url(&page)]);
        }
    }
    println!("\n{} projets, {ko} avec erreur ou liaison non routée. Fichiers : {}", fichiers.len(), out.display());
    assert!(ko == 0, "{ko} projet(s) avec erreur ou liaison non routée");
}
