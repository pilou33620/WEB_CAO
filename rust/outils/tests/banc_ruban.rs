//! Banc : le ruban des deux éditeurs, dans un vrai Chromium sans fenêtre.
//!     cargo test -p outils --test banc_ruban -- --ignored --nocapture
//!       → une ligne par éditeur, le détail des échecs seulement
//! Reconstruit les monofichiers, y ajoute les essais, lit le bilan dans le DOM rendu.
//! Sans Chromium : le banc le dit et ne conclut rien.
//!
//! Chromium se cherche comme le faisait le banc Python (chromium, chromium-browser,
//! google-chrome dans le PATH), ou se donne par la variable CHROMIUM.

use regex::Regex;
use std::time::Duration;

const ESSAIS: &str = include_str!("banc-ruban-essais.js");

fn essai(chrome: &std::path::Path, editeur: &str, page: &str) -> Vec<(String, bool)> {
    let racine = outils::racine();
    outils::monofichier::build_editeur(&racine, editeur).unwrap();
    let html = outils::lire_texte(&racine.join(editeur).join("dist").join(page)).unwrap();
    let t = std::env::temp_dir().join(format!("banc-ruban-{}-{editeur}", std::process::id()));
    std::fs::create_dir_all(&t).unwrap();
    let p = t.join("page.html");
    // la dernière balise : d'autres « </body> » vivent dans les chaînes des exports
    let i = html.rfind("</body>").expect("</body> absent de la page");
    std::fs::write(&p, format!("{}<script>{ESSAIS}</script>{}", &html[..i], &html[i..])).unwrap();
    let args = [
        "--headless".to_string(),
        "--no-sandbox".into(),
        "--disable-gpu".into(),
        "--window-size=1600,900".into(),
        format!("--user-data-dir={}", t.join("profil").display()),
        "--virtual-time-budget=8000".into(),
        "--dump-dom".into(),
        outils::chromium::url(&p),
    ];
    let r = outils::chromium::lancer(chrome, &args, Duration::from_secs(120));
    let _ = std::fs::remove_dir_all(&t);
    let (sortie, _) = r.unwrap();
    let Some(m) = Regex::new(r#"(?s)<pre id="bilan-ruban">(.*?)</pre>"#).unwrap().captures(&sortie) else {
        return vec![("pas de bilan dans la page".into(), false)];
    };
    serde_json::from_str(&m[1].replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&")).unwrap()
}

#[test]
#[ignore = "demande Chromium ; à lancer avec --ignored"]
fn ruban() {
    let Some(chrome) = outils::chromium::trouver() else {
        println!("ruban : Chromium absent, banc non exécuté");
        return;
    };
    let mut ko = 0;
    for (editeur, page) in [("editeur-schematique", "editeur-schematique.html"), ("editeur-pcb", "editeur-pcb.html")] {
        let res = essai(&chrome, editeur, page);
        let rates: Vec<&String> = res.iter().filter(|(_, ok)| !ok).map(|(n, _)| n).collect();
        ko += rates.len();
        println!("ruban {editeur} : {}/{} ok", res.len() - rates.len(), res.len());
        for n in rates {
            println!("  KO  {n}");
        }
    }
    assert!(ko == 0, "{ko} essai(s) du ruban en échec");
}
