//! Images de l'animation 3D, prises dans Chromium sans fenêtre.
//!
//!     cargo run -p outils --bin build-monofichier -- editeur-pcb && node editeur-pcb/test/harness.js
//!     cargo test -p outils --test banc_anim3d_images -- --ignored --nocapture
//!
//! Le banc d'essai écrit la page de la carte d'exemple dans dist/essai-anim3d/ ;
//! ici, chaque instant est figé (la boucle de la page remplacée par un seul rendu)
//! et photographié en 1280 × 720. Bilan court : une ligne par image (part de
//! pixels non noirs, erreurs JavaScript), les PNG à côté de la page.
//!
//! Les arguments du banc Python sont des variables : ANIM3D_PAGE (une autre page :
//! visionneuse…) et ANIM3D_INSTANTS (les instants en s, séparés par des espaces).
//! Sans Chromium, ou sans la page : le banc le dit et ne conclut rien.

use regex::{NoExpand, Regex};
use serde_json::Value;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::Duration;

/// La part des pixels dont le gris (celui de PIL, convert("L")) dépasse 20.
// shortcut: PNG 8 bits non entrelacé, gris, RVB ou RVBA -- ce que Chromium écrit ; à
// reprendre avec la caisse png si une capture arrive sous une autre forme.
fn part_claire(png: &[u8]) -> f64 {
    assert!(png.starts_with(b"\x89PNG\r\n\x1a\n"), "pas un PNG");
    let (mut p, mut idat, mut entete) = (8, Vec::new(), Vec::new());
    while p + 8 <= png.len() {
        let n = u32::from_be_bytes(png[p..p + 4].try_into().unwrap()) as usize;
        match &png[p + 4..p + 8] {
            b"IHDR" => entete = png[p + 8..p + 8 + n].to_vec(),
            b"IDAT" => idat.extend(&png[p + 8..p + 8 + n]),
            _ => {}
        }
        p += 12 + n;
    }
    let (l, h) = (u32::from_be_bytes(entete[..4].try_into().unwrap()) as usize, u32::from_be_bytes(entete[4..8].try_into().unwrap()) as usize);
    let canaux = match (entete[8], entete[9], entete[12]) {
        (8, 0, 0) => 1,
        (8, 2, 0) => 3,
        (8, 6, 0) => 4,
        autre => panic!("PNG inattendu (profondeur, couleur, entrelacement) : {autre:?}"),
    };
    let mut brut = Vec::new();
    flate2::read::ZlibDecoder::new(&idat[..]).read_to_end(&mut brut).unwrap();
    let pas = l * canaux;
    let (mut avant, mut clairs) = (vec![0u8; pas], 0usize);
    for y in 0..h {
        let filtre = brut[y * (pas + 1)];
        let mut ligne = brut[y * (pas + 1) + 1..(y + 1) * (pas + 1)].to_vec();
        for i in 0..pas {
            let a = if i >= canaux { ligne[i - canaux] as i32 } else { 0 };
            let (b, c) = (avant[i] as i32, if i >= canaux { avant[i - canaux] as i32 } else { 0 });
            let pred = match filtre {
                0 => 0,
                1 => a,
                2 => b,
                3 => (a + b) / 2,
                _ => {
                    let (pa, pb, pc) = ((b - c).abs(), (a - c).abs(), (a + b - 2 * c).abs());
                    if pa <= pb && pa <= pc { a } else if pb <= pc { b } else { c }
                }
            };
            ligne[i] = ligne[i].wrapping_add(pred as u8);
        }
        clairs += ligne
            .chunks(canaux)
            .filter(|px| {
                let gris = if canaux == 1 { px[0] as u32 } else { (px[0] as u32 * 19595 + px[1] as u32 * 38470 + px[2] as u32 * 7471 + 0x8000) >> 16 };
                gris > 20
            })
            .count();
        avant = ligne;
    }
    clairs as f64 / (l * h) as f64
}

fn image(chrome: &Path, html: &str, t: f64, png: &Path) -> String {
    let boucle = Regex::new(r"\(function boucle\(now\)\{.*?\}\)\(t0\);").unwrap();
    let fige = boucle.replace(html, NoExpand(&format!("(function boucle(){{A.rendre({t:?});requestAnimationFrame(boucle);}})();")));
    if fige == html {
        return "boucle introuvable dans la page".into();
    }
    let d = std::env::temp_dir().join(format!("banc-anim3d-{}", std::process::id()));
    std::fs::create_dir_all(&d).unwrap();
    let f = d.join("p.html");
    std::fs::write(&f, format!("{fige}<script>addEventListener('error',e=>console.error('ERREUR '+e.message))</script>")).unwrap();
    let args: Vec<String> = [
        "--headless",
        "--no-sandbox",
        "--hide-scrollbars",
        "--enable-unsafe-swiftshader",
        "--use-angle=swiftshader",
        "--enable-logging=stderr",
        "--v=0",
        "--window-size=1280,720",
        "--virtual-time-budget=4000",
    ]
    .iter()
    .map(|a| a.to_string())
    .chain([format!("--screenshot={}", png.display()), outils::chromium::url(&f)])
    .collect();
    let r = outils::chromium::lancer(chrome, &args, Duration::from_secs(180));
    let _ = std::fs::remove_dir_all(&d);
    let (_, stderr) = r.unwrap();
    let err: Vec<&str> = stderr
        .lines()
        .filter(|l| l.contains("CONSOLE") && (l.contains("ERREUR") || l.contains("Error")))
        .take(3)
        .map(|e| e.split('"').nth(1).unwrap_or(e))
        .collect();
    err.join("; ")
}

#[test]
#[ignore = "demande Chromium et la page du banc de l'éditeur ; à lancer avec --ignored"]
fn images_de_l_animation_3d() {
    let Some(chrome) = outils::chromium::trouver() else {
        println!("anim3d : Chromium absent, banc non exécuté");
        return;
    };
    // une autre page (visionneuse…)
    let page = std::env::var_os("ANIM3D_PAGE")
        .map(PathBuf::from)
        .unwrap_or_else(|| outils::racine().join("editeur-pcb/dist/essai-anim3d/carte-ASSEMBLAGE-3D.html"));
    if !page.exists() {
        println!("page absente : lancer d'abord node test/harness.js -- banc non exécuté");
        return;
    }
    let html = outils::lire_texte(&page).unwrap();
    let j: Value = serde_json::from_str(&Regex::new(r"(?s)const J=(\{.*?\});\n").unwrap().captures(&html).expect("const J absent de la page")[1]).unwrap();
    let v: Vec<Value> = j["vedettes"].as_array().cloned().unwrap_or_default();
    let noms: Vec<String> = v.iter().map(|v| format!("{} {}", v["ref"].as_str().unwrap(), v["nom"].as_str().unwrap())).collect();
    println!("composants présentés : {}", if noms.is_empty() { "aucun".into() } else { noms.join(", ") });
    // shortcut: les instants de anim3dLancer recopiés (pose des composants, gros plans de 3,4 s) ; à revoir s'ils changent
    let c = j["composants"].as_array().unwrap();
    let vrai = |f: &Value| !(f.is_null() || f == &Value::Bool(false) || f.as_f64() == Some(0.0) || f.as_str() == Some(""));
    let n_d = c.iter().filter(|c| !vrai(&c["face"])).count() as f64;
    let n_b = c.len() as f64 - n_d;
    let pas = (7.0 / (c.len().max(1) as f64)).clamp(0.04, 0.35);
    let t0_b = 6.0 + n_d * pas + if n_b > 0.0 { 1.4 } else { 0.0 };
    let pose = (if n_b > 0.0 { t0_b + n_b * pas } else { 6.0 + n_d * pas }) + 0.9;
    let tour = if v.is_empty() { pose } else { pose + v.len() as f64 * 3.4 + 1.2 };
    let mut defaut = vec![3.0, pose - 0.5];
    defaut.extend((0..v.len().min(2)).map(|i| pose + i as f64 * 3.4 + 2.2));
    defaut.push(tour + 3.0);
    let donnes: Vec<f64> = std::env::var("ANIM3D_INSTANTS").unwrap_or_default().split_whitespace().map(|a| a.parse().unwrap()).collect();
    // round(t, 1)
    let instants = if donnes.is_empty() { defaut.iter().map(|t| format!("{t:.1}").parse().unwrap()).collect() } else { donnes };
    let (dossier, stem) = (page.parent().unwrap(), page.file_stem().unwrap().to_string_lossy());
    let mut ok = true;
    for t in instants {
        let png = dossier.join(format!("{stem}-{t:05.1}s.png"));
        let _ = std::fs::remove_file(&png);
        let err = image(&chrome, &html, t, &png);
        let Ok(octets) = std::fs::read(&png) else {
            println!("t={t:5.1} s  PAS D'IMAGE {err}");
            ok = false;
            continue;
        };
        let clair = part_claire(&octets);
        println!("t={t:5.1} s  {:4.1} % non noir{}", 100.0 * clair, if err.is_empty() { String::new() } else { format!("  ERREUR {err}") });
        ok = ok && err.is_empty() && clair > 0.02;
    }
    println!("bilan : {} — images dans {}", if ok { "ok" } else { "ÉCHEC" }, dossier.display());
    assert!(ok, "images de l'animation 3D : ÉCHEC");
}
