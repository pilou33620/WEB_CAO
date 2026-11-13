// =============================================================================
// Banc d'essai de l'export IPC-2581 de l'editeur PCB, par aller-retour.
// (portage de editeur-pcb/test/banc-ipc2581-export.py)
//
//     cargo run -p outils --bin build-monofichier -- editeur-pcb && node editeur-pcb/test/harness.js
//     cargo test -p outils --test banc_ipc2581_export -- --nocapture
//
// L'export s'ecrit en JavaScript (js/35-ipc2581-export.js) ; il se relit ici
// par la chaine de la visionneuse, telle quelle : le lecteur IPC-2581 (caisse
// ipc2581). Un export qui ne se relirait que par lui-meme ne
// prouverait rien -- c'est le lecteur d'en face qui juge.
//
// Le banc d'essai de l'editeur (test/harness.js) charge les deux cartes
// d'exemple, et une troisieme qui ajoute ce que les exemples n'ont pas
// (contre-percage, rugosite, composants dessous a angle quelconque, pastilles
// chanfreinee, polygonale et oblongue, arc, decoupe de carte, trous NPTH,
// variante de montage). Il ecrit chaque export dans dist/essai-ipc2581/, a
// cote de ce que l'editeur en attend (<nom>.attendu.json) : ce banc compare.
//
// LE XSD. IPC-2581C.xsd n'est pas dans le depot : il appartient a l'IPC.
// KiCad en garde une copie (qa/data/pcbnew/ipc2581/IPC-2581C.xsd). Donne par
// la variable IPC2581_XSD, et xmllint installe (libxml2, le validateur que lxml
// appelait cote Python), chaque export est valide contre lui ; sans eux, la
// validation est sautee et le banc le dit.
//
// Sans les exports (dist/essai-ipc2581/ vide) : le banc le dit et ne conclut rien.
// =============================================================================

use ipc2581::roxmltree;
use regex::Regex;
use serde_json::{json, Map, Value};
use std::collections::{BTreeMap, BTreeSet};
use std::path::Path;

const NS: &str = "http://webstds.ipc.org/2581";

// =============================================================================
// Le harnais, celui de visionneuse-ipc2581/test/banc-essai.py : un T() par
// cas, et un cas rate n'arrete pas les autres.
// =============================================================================
#[derive(Default)]
struct Banc {
    cas: Vec<String>,
    echecs: Vec<(String, String)>,
    sautes: Vec<String>,
}

type Cas = Result<(), String>;

impl Banc {
    fn t(&mut self, titre: String, fonction: impl FnOnce() -> Cas) {
        self.cas.push(titre.clone());
        // une cle absente, un type inattendu : une exception en Python, une panique ici
        let vu = std::panic::catch_unwind(std::panic::AssertUnwindSafe(fonction)).unwrap_or_else(|p| {
            Err(p.downcast_ref::<String>().cloned().or(p.downcast_ref::<&str>().map(|s| s.to_string())).unwrap_or("panique".into()))
        });
        match vu {
            Err(exc) => {
                println!("  ECHEC  {titre}");
                println!("         {exc}");
                self.echecs.push((titre, exc));
            }
            Ok(()) => println!("  ok     {titre}"),
        }
    }
}

/// == de Python entre deux valeurs JSON : 1 == 1.0, l'ordre des cles ne compte pas.
fn memes(a: &Value, b: &Value) -> bool {
    match (a, b) {
        (Value::Number(x), Value::Number(y)) => x.as_f64() == y.as_f64(),
        (Value::Array(x), Value::Array(y)) => x.len() == y.len() && x.iter().zip(y).all(|(p, q)| memes(p, q)),
        (Value::Object(x), Value::Object(y)) => x.len() == y.len() && x.iter().all(|(k, p)| y.get(k).is_some_and(|q| memes(p, q))),
        _ => a == b,
    }
}

fn egal(vu: impl Into<Value>, attendu: impl Into<Value>, quoi: &str) -> Cas {
    let (vu, attendu) = (vu.into(), attendu.into());
    if memes(&vu, &attendu) {
        Ok(())
    } else {
        Err(format!("{quoi} : {attendu} attendu, {vu} vu"))
    }
}

/// float(v) : un nombre, ou une chaine qui en ecrit un (le Dk du modele est une chaine).
fn flottant(v: &Value) -> Option<f64> {
    v.as_f64().or_else(|| v.as_str()?.trim().parse().ok())
}

fn proche_a(vu: &Value, attendu: &Value, quoi: &str, tol: f64) -> Cas {
    let a = flottant(attendu).unwrap_or_else(|| panic!("{quoi} : attendu {attendu} n'est pas un nombre"));
    match flottant(vu) {
        Some(v) if (v - a).abs() <= tol => Ok(()),
        _ => Err(format!("{quoi} : {attendu} attendu, {vu} vu")),
    }
}

fn proche(vu: &Value, attendu: &Value, quoi: &str) -> Cas {
    proche_a(vu, attendu, quoi, 1e-6)
}

fn vrai(condition: bool, quoi: impl FnOnce() -> String) -> Cas {
    if condition {
        Ok(())
    } else {
        Err(quoi())
    }
}

/// bool(v) de Python
fn oui(v: &Value) -> bool {
    match v {
        Value::Null => false,
        Value::Bool(b) => *b,
        Value::Number(n) => n.as_f64() != Some(0.0),
        Value::String(s) => !s.is_empty(),
        Value::Array(a) => !a.is_empty(),
        Value::Object(o) => !o.is_empty(),
    }
}

fn f(v: &Value) -> f64 {
    v.as_f64().unwrap_or_else(|| panic!("nombre attendu, {v} vu"))
}

fn liste(v: &Value) -> &[Value] {
    v.as_array().map_or(&[], |l| l)
}

fn a(v: &Value, cle: &str) -> bool {
    v.get(cle).is_some()
}

/// couches[c["c"]], nets[p["n"]]
fn rang<'a>(table: &'a Value, i: &Value) -> &'a Value {
    &table[i.as_u64().unwrap_or_else(|| panic!("rang attendu, {i} vu")) as usize]
}

// =============================================================================
// Geometrie, dans le repere du fichier
// =============================================================================
fn points(plat: &Value) -> Vec<(f64, f64)> {
    liste(plat).chunks_exact(2).map(|p| (f(&p[0]), f(&p[1]))).collect()
}

/// Aire d'un polygone donne a plat [x1, y1, x2, y2, ...].
fn aire(plat: &Value) -> f64 {
    let p = points(plat);
    let n = p.len();
    (0..n).map(|i| p[(i + n - 1) % n].0 * p[i].1 - p[i].0 * p[(i + n - 1) % n].1).sum::<f64>().abs() / 2.0
}

/// Point dans un polygone a plat (pair-impair).
fn dans(x: f64, y: f64, plat: &Value) -> bool {
    let p = points(plat);
    let mut dedans = false;
    let mut j = p.len().wrapping_sub(1);
    for i in 0..p.len() {
        let ((xi, yi), (xj, yj)) = (p[i], p[j]);
        if (yi > y) != (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi {
            dedans = !dedans;
        }
        j = i;
    }
    dedans
}

/// Distance du point (x, y) au segment [a, b].
fn dist_segment(x: f64, y: f64, a: (f64, f64), b: (f64, f64)) -> f64 {
    let (dx, dy) = (b.0 - a.0, b.1 - a.1);
    let l2 = dx * dx + dy * dy;
    let t = if l2 == 0.0 { 0.0 } else { (((x - a.0) * dx + (y - a.1) * dy) / l2).clamp(0.0, 1.0) };
    (x - a.0 - t * dx).hypot(y - a.1 - t * dy)
}

/// La plus petite distance du point au contour ferme `p`.
fn dist_contour(x: f64, y: f64, p: &[(f64, f64)]) -> f64 {
    (0..p.len()).map(|i| dist_segment(x, y, p[(i + p.len() - 1) % p.len()], p[i])).fold(f64::INFINITY, f64::min)
}

/// Le placement d'une broche, comme la visionneuse (mdlPlacer) : miroir
/// en X d'abord, rotation ensuite, sens trigonometrique.
fn placer(mut px: f64, py: f64, cx: f64, cy: f64, rot: f64, mir: bool) -> (f64, f64) {
    if mir {
        px = -px;
    }
    let a = rot.to_radians();
    (cx + px * a.cos() - py * a.sin(), cy + px * a.sin() + py * a.cos())
}

/// Milieu et longueur d'un arc du modele : debut, fin, centre, sens.
fn milieu_arc(a: &Value) -> ((f64, f64), f64) {
    let p = |k: &str| (f(&a[k][0]), f(&a[k][1]));
    let ((sx, sy), (ex, ey), (mx, my)) = (p("s"), p("e"), p("m"));
    let r = (sx - mx).hypot(sy - my);
    let a1 = (sy - my).atan2(sx - mx);
    let mut d = (ey - my).atan2(ex - mx) - a1;
    if oui(&a["h"]) {
        while d > 0.0 {
            d -= 2.0 * std::f64::consts::PI;
        }
    } else {
        while d < 0.0 {
            d += 2.0 * std::f64::consts::PI;
        }
    }
    let t = a1 + d / 2.0;
    ((mx + r * t.cos(), my + r * t.sin()), r * d.abs())
}

/// json.dump(M, f) : ensure_ascii, donc « \uXXXX » pour ce qui n'est pas de l'ASCII.
fn en_ascii(json: &str) -> String {
    let mut s = String::with_capacity(json.len());
    for c in json.chars() {
        if c.is_ascii() {
            s.push(c);
        } else {
            for u in c.encode_utf16(&mut [0; 2]) {
                s.push_str(&format!("\\u{u:04x}"));
            }
        }
    }
    s
}

fn element<'a>(n: roxmltree::Node<'a, 'a>, nom: &str) -> bool {
    n.is_element() && n.tag_name().name() == nom && n.tag_name().namespace() == Some(NS)
}

// =============================================================================
// Les cas, pour chaque export
// =============================================================================
fn cas_export(banc: &mut Banc, dossier: &Path, nom: &str) {
    let octets = std::fs::read(dossier.join(format!("{nom}.xml"))).unwrap();
    let att: Value = serde_json::from_str(&std::fs::read_to_string(dossier.join(format!("{nom}.attendu.json"))).unwrap()).unwrap();
    let att = &att;
    let texte = String::from_utf8_lossy(&octets);
    let doc = roxmltree::Document::parse(&texte);

    banc.t(format!("{nom} : XML bien forme, IPC-2581 revision C, sections dans l'ordre"), || {
        let racine = doc.as_ref().map_err(|e| e.to_string())?.root_element();
        vrai(element(racine, "IPC-2581"), || format!("element racine : IPC-2581 attendu, {:?} vu", racine.tag_name()))?;
        egal(racine.attribute("revision"), "C", "revision")?;
        let sections: Vec<&str> = racine.children().filter(|e| e.is_element()).map(|e| e.tag_name().name()).collect();
        let attendues: &[&str] = if racine.children().any(|e| element(e, "Bom")) {
            &["Content", "LogisticHeader", "HistoryRecord", "Bom", "Ecad"]
        } else {
            &["Content", "LogisticHeader", "HistoryRecord", "Ecad"]
        };
        egal(json!(sections), json!(attendues), "sections")
    });
    let racine = || doc.as_ref().expect("XML illisible").root_element();

    match std::env::var("IPC2581_XSD") {
        Ok(xsd) if Path::new(&xsd).is_file() => {
            let xml = dossier.join(format!("{nom}.xml"));
            match std::process::Command::new("xmllint").arg("--noout").arg("--schema").arg(&xsd).arg(&xml).output() {
                Err(_) => banc.sautes.push(format!("{nom} : xmllint absent, XSD non verifie")),
                Ok(r) => banc.t(format!("{nom} : conforme a {}", Path::new(&xsd).file_name().unwrap().to_string_lossy()), || {
                    let premiere = String::from_utf8_lossy(&r.stderr).lines().next().unwrap_or("").to_string();
                    vrai(r.status.success(), || premiere)
                }),
            }
        }
        _ => banc.sautes.push(format!("{nom} : XSD non fourni (IPC2581_XSD)")),
    }

    let modele = ipc2581::ipc2581_en_dict_avec(&octets, &format!("{nom}.xml"), true, Some(&motifs::motifs_ipc2581))
        .unwrap_or_else(|e| panic!("{nom}.xml : {e}"));
    // le modele relu, pour le banc de la visionneuse (dossier meca : le meme
    // dossier que l'editeur, harness-sim.js)
    let ecrit = ipc2581::dumps(&modele);
    std::fs::write(dossier.join(format!("{nom}.modele.json")), en_ascii(&ecrit)).unwrap();
    let m: Value = serde_json::from_str(&ecrit).unwrap();
    let m = &m;
    let (couches, nets, st) = (&m["couches"], &m["nets"], &m["stats"]);
    let re_cuivre = Regex::new("COND|SIGNAL|PLANE|POWER|GROUND|MIXED").unwrap();
    let cuivre: Vec<&Value> =
        liste(couches).iter().filter(|c| re_cuivre.is_match(m["calques"][c.as_str().unwrap()]["f"].as_str().unwrap_or(""))).collect();
    let cuivre = &cuivre;
    let parref = || -> BTreeMap<&str, &Value> { liste(&m["composants"]).iter().map(|c| (c["ref"].as_str().unwrap(), c)).collect() };
    let rf = |a: &Value| a["ref"].as_str().unwrap().to_string();

    banc.t(format!("{nom} : composants -- place, rotation, face, valeur, MPN, hauteur"), || {
        egal(st["composants"].clone(), liste(&att["composants"]).len(), "composants")?;
        let parref = parref();
        for a_ in liste(&att["composants"]) {
            let r = rf(a_);
            let Some(c) = parref.get(r.as_str()) else { return Err(format!("{r} absent")) };
            proche_a(&c["x"], &a_["x"], &format!("{r} x"), 1e-4)?;
            proche_a(&c["y"], &a_["y"], &format!("{r} y"), 1e-4)?;
            proche_a(&c["r"], &a_["r"], &format!("{r} rotation"), 1e-3)?;
            egal(c["m"].clone(), a_["m"].clone(), &format!("{r} miroir (face)"))?;
            egal(rang(couches, &c["c"]).clone(), a_["couche"].clone(), &format!("{r} couche"))?;
            egal(c["val"].clone(), a_["val"].clone(), &format!("{r} valeur"))?;
            if oui(&a_["mpn"]) {
                egal(c["part"].clone(), a_["mpn"].clone(), &format!("{r} MPN"))?;
            }
            if !a_["h"].is_null() {
                proche_a(c.get("hauteur").unwrap_or(&json!(0)), &a_["h"], &format!("{r} hauteur (dossier meca)"), 1e-6)?;
            } else {
                vrai(!a(c, "hauteur"), || format!("{r} : hauteur inventee"))?;
            }
        }
        Ok(())
    });

    banc.t(format!("{nom} : chaque broche posee sur sa pastille (miroir puis rotation)"), || {
        // la broche de l'empreinte, posee par le composant, tombe sur la
        // pastille que l'editeur a gravee : rotation et miroir sont bons
        let parref = parref();
        for a_ in liste(&att["composants"]) {
            let r = rf(a_);
            let c = parref[r.as_str()];
            let vues = liste(&c["pins"]);
            vrai(!vues.is_empty(), || format!("{r} sans broches"))?;
            for b in vues {
                let (x, y) = placer(f(&b["x"]), f(&b["y"]), f(&c["x"]), f(&c["y"]), c["r"].as_f64().unwrap_or(0.0), oui(&c["m"]));
                let ok = liste(&a_["pins"]).iter().any(|p| memes(&p["num"], &b["num"]) && (f(&p["x"]) - x).abs() < 1e-3 && (f(&p["y"]) - y).abs() < 1e-3);
                vrai(ok, || format!("{r} broche {} posee en ({x:.4} ; {y:.4}), hors de sa pastille", b["num"]))?;
            }
            let nums = |l: &[Value]| l.iter().map(|b| b["num"].to_string()).collect::<BTreeSet<_>>().into_iter().collect::<Vec<_>>();
            egal(nums(vues), nums(liste(&a_["pins"])), &format!("{r} numeros de broche"))?;
        }
        Ok(())
    });

    banc.t(format!("{nom} : memes nets"), || {
        let vus: BTreeSet<&str> = liste(nets).iter().map(|n| n.as_str().unwrap()).filter(|n| *n != "Non-Net").collect();
        egal(json!(vus), att["nets"].clone(), "nets")?;
        vrai(liste(&m["composants"]).iter().all(|c| !liste(&c["pins"]).is_empty()), || "composant sans broche".into())?;
        let lies = liste(&m["composants"]).iter().flat_map(|c| liste(&c["pins"])).filter(|b| a(b, "n")).count();
        vrai(lies > 0, || "aucune broche reliee a son net (<LogicalNet>)".into())
    });

    banc.t(format!("{nom} : memes pistes, arcs gardes en arcs (milieu, longueur)"), || {
        let mut par = Map::new();
        for p in liste(&m["pistes"]) {
            let nomc = rang(couches, &p["c"]);
            if cuivre.contains(&nomc) {
                let n = par.get(nomc.as_str().unwrap()).and_then(Value::as_u64).unwrap_or(0);
                par.insert(nomc.as_str().unwrap().into(), json!(n + 1));
            }
        }
        egal(par, att["pistes"].clone(), "pistes par couche de cuivre")?;
        let arcs: Vec<&Value> = liste(&m["arcs"]).iter().filter(|x| cuivre.contains(&rang(couches, &x["c"]))).collect();
        egal(arcs.len(), liste(&att["arcs"]).len(), "arcs")?;
        for a_ in liste(&att["arcs"]) {
            let relu = arcs.iter().any(|b| {
                let (mid, len) = milieu_arc(b);
                rang(couches, &b["c"]) == &a_["couche"]
                    && (mid.0 - f(&a_["mid"][0])).abs() < 1e-3
                    && (mid.1 - f(&a_["mid"][1])).abs() < 1e-3
                    && (len - f(&a_["len"])).abs() < 1e-3
            });
            vrai(relu, || format!("arc de {}, milieu {} : pas relu au meme endroit", a_["couche"], a_["mid"]))?;
        }
        Ok(())
    });

    banc.t(format!("{nom} : memes vias et trous, portee et anneau declares"), || {
        let compte = |quoi: &str| liste(&m["percages"]).iter().filter(|d| d["p"] == quoi).count();
        egal(compte("VIA"), att["vias"].clone(), "vias")?;
        egal(compte("PLATED"), att["trous"]["PLATED"].clone(), "trous de pastilles")?;
        egal(compte("NONPLATED"), att["trous"]["NONPLATED"].clone(), "trous NPTH")?;
        let tout: f64 = att["trous"].as_object().unwrap().values().map(f).sum();
        egal(liste(&m["percages"]).len(), tout, "trous en tout")?;
        for d in liste(&m["percages"]) {
            if d["p"] == "VIA" {
                vrai(a(d, "sa") && a(d, "sb"), || "via sans portee declaree".into())?;
                vrai(d["a"].as_f64().unwrap_or(0.0) > 0.0 && !oui(&d["a_sup"]), || "anneau du via suppose".into())?;
            }
        }
        Ok(())
    });

    banc.t(format!("{nom} : meme contour (aire au millieme, decoupes, arcs gardes)"), || {
        let (c, a_) = (&m["contour"], &att["contour"]);
        let trous = liste(&c["t"]);
        egal(trous.len(), a_["decoupes"].clone(), "decoupes")?;
        // les arcs du profil : ceux que l'editeur reconnait dans ses cordes
        fn fils<'a>(n: roxmltree::Node<'a, 'a>, nom: &str) -> Vec<roxmltree::Node<'a, 'a>> {
            n.children().filter(|e| element(*e, nom)).collect()
        }
        let profil = fils(racine(), "Ecad")
            .into_iter()
            .flat_map(|e| fils(e, "CadData"))
            .flat_map(|e| fils(e, "Step"))
            .flat_map(|e| fils(e, "Profile"))
            .next()
            .expect("<Profile> absent");
        egal(profil.descendants().filter(|e| element(*e, "PolyStepCurve")).count(), a_["arcs"].clone(), "arcs du profil")?;
        let vu = aire(&c["o"]) - trous.iter().map(aire).sum::<f64>();
        if !oui(&a_["arcs"]) {
            return proche_a(&json!(vu), &a_["aire"], "aire", 1e-3);
        }
        // un arc remplace des cordes : l'aire change de leurs fleches (au
        // millieme pres, relativement), les sommets de l'editeur restent sur
        // le contour relu, et le contour relu ne s'ecarte pas des cordes
        proche_a(&json!(vu), &a_["aire"], "aire (relative)", 1e-3 * f(&a_["aire"]))?;
        for (lu, bord) in std::iter::once(&c["o"]).chain(trous).zip(liste(&a_["bords"])) {
            let p = points(lu);
            let bord: Vec<(f64, f64)> = liste(bord).iter().map(|s| (f(&s[0]), f(&s[1]))).collect();
            for &(x, y) in &bord {
                vrai(dist_contour(x, y, &p) < 1e-3, || format!("sommet ({x} ; {y}) de l'editeur hors du contour relu"))?;
            }
            for &(x, y) in &p {
                vrai(dist_contour(x, y, &bord) < 0.01, || format!("le contour relu s'ecarte des cordes en ({x} ; {y})"))?;
            }
        }
        Ok(())
    });

    banc.t(format!("{nom} : meme empilage (epaisseurs, er, tan d, matieres)"), || {
        egal(json!(cuivre), att["cuivres"].clone(), "couches de cuivre")?;
        let (e_, a_) = (liste(&m["empilage"]), liste(&att["empilage"]));
        let noms = |l: &[Value]| l.iter().map(|e| e["nom"].clone()).collect::<Vec<_>>();
        egal(noms(e_), noms(a_), "empilage")?;
        for (e, x) in e_.iter().zip(a_) {
            let n = e["nom"].as_str().unwrap();
            proche(&e["ep"], &x["ep"], &format!("{n} epaisseur"))?;
            for cle in ["dk", "df"] {
                if a(x, cle) {
                    proche(&e[cle], &x[cle], &format!("{n} {cle}"))?;
                }
            }
            if a(x, "mat") {
                egal(e["mat"].clone(), x["mat"].clone(), &format!("{n} matiere"))?;
            }
            if a(x, "type") {
                egal(e["type"].clone(), x["type"].clone(), &format!("{n} fonction"))?;
            }
        }
        proche(&m["epaisseur"], &att["epaisseur"], "epaisseur hors-tout")
    });

    banc.t(format!("{nom} : rugosite du cuivre retrouvee (Rq, et Huray a part)"), || {
        let huray = &att["rugosite_huray"];
        for e in liste(&m["empilage"]) {
            let n = e["nom"].as_str().unwrap();
            if a(&att["rugosite"], n) {
                proche(&e["rug"], &att["rugosite"][n], &format!("{n} rugosite"))?;
            } else {
                vrai(!a(e, "rug"), || format!("{n} : rugosite inventee"))?;
            }
            if a(huray, n) {
                // Huray : les deux parametres, et pas de Rq de substitution
                let h = &e["rug_huray"];
                proche(&h["a"], &huray[n]["a"], &format!("{n} rayon des nodules (um)"))?;
                proche(&h["sr"], &huray[n]["sr"], &format!("{n} rapport de surface"))?;
            } else {
                vrai(!a(e, "rug_huray"), || format!("{n} : Huray invente"))?;
            }
        }
        Ok(())
    });

    banc.t(format!("{nom} : classes, paires et contraintes retrouvees a la relecture"), || {
        // ce que la visionneuse reprend tel quel : la classe de chaque net
        // (nomme dans sa classe s'il n'a pas de broche), les regles des classes, les contraintes des nets, les
        // paires, les groupes et la matrice -- par NOM de net et de couche
        let (r, a_) = (&m["regles"], &att["regles"]);
        egal(r["classes"].clone(), a_["classes"].clone(), "classe de chaque net")?;
        egal(r["regles_classes"].clone(), a_["regles_classes"].clone(), "regles des classes")?;
        egal(r["contraintes"].clone(), a_["contraintes"].clone(), "contraintes propres aux nets")?;
        let paires: Vec<Value> = liste(&r["paires"]).iter().map(|p| json!({"nom": p["nom"], "p": p["p"], "n": p["n"], "zdiff": p["zdiff"]})).collect();
        egal(paires, a_["paires"].clone(), "paires differentielles")?;
        egal(r["groupes"].clone(), a_["groupes"].clone(), "groupes d'appariement")?;
        egal(r["matrice"].clone(), a_["matrice"].clone(), "matrice d'isolation")?;
        // la classe de la norme reste lue a cote, pour les nets a broche
        let avec: Vec<String> = match a_.get("avec_broche") {
            Some(l) => liste(l).iter().map(|n| n.as_str().unwrap().to_string()).collect(),
            None => a_["classes"].as_object().unwrap().keys().cloned().collect(),
        };
        for n in avec {
            vrai(oui(&m["classes_nets"][&n]), || format!("{n} sans netClass"))?;
        }
        Ok(())
    });

    banc.t(format!("{nom} : contre-percage retrouve (face, couche gardee, moignon, foret)"), || {
        egal(st["contre_percages"].clone(), liste(&att["contre_percage"]).len(), "vias contre-perces")?;
        egal(st["contre_percages_orphelins"].clone(), 0, "forets sans via")?;
        for a_ in liste(&att["contre_percage"]) {
            let d = liste(&m["percages"])
                .iter()
                .find(|d| (f(&d["x"]) - f(&a_["x"])).abs() < 1e-4 && (f(&d["y"]) - f(&a_["y"])).abs() < 1e-4 && a(d, "cp"));
            let Some(d) = d else { return Err(format!("via ({} ; {}) sans contre-percage", a_["x"], a_["y"])) };
            let cp = &d["cp"];
            egal(cp["cote"].clone(), a_["cote"].clone(), "face")?;
            egal(rang(couches, &cp["g"]).clone(), a_["garde"].clone(), "couche a ne pas couper")?;
            proche(&cp["res"], &a_["res"], "moignon residuel")?;
            proche(&cp["d"], &a_["diam"], "diametre du foret")?;
            proche_a(&cp["prof"], &a_["prof"], "profondeur", 1e-4)?;
        }
        Ok(())
    });

    banc.t(format!("{nom} : zones remplies -- le net raccorde, les autres degages"), || {
        for z in liste(&att["zones"]) {
            let ilots: Vec<&Value> = liste(&m["plans"])
                .iter()
                .filter(|p| rang(couches, &p["c"]) == &z["couche"] && rang(nets, &p["n"]) == &z["net"])
                .flat_map(|p| liste(&p["g"]))
                .collect();
            vrai(!ilots.is_empty(), || format!("zone {} de {} absente", z["net"], z["couche"]))?;
            let cuivre_en = |x: f64, y: f64| ilots.iter().any(|g| dans(x, y, &g["o"]) && !liste(&g["t"]).iter().any(|t| dans(x, y, t)));
            let (c, n) = (z["couche"].as_str().unwrap(), z["net"].as_str().unwrap());
            for p in liste(&z["dedans"]) {
                let (x, y) = (f(&p[0]), f(&p[1]));
                vrai(cuivre_en(x, y), || format!("{c}/{n} : le via du net en ({x} ; {y}) n'est pas dans le cuivre"))?;
            }
            for p in liste(&z["dehors"]) {
                let (x, y) = (f(&p[0]), f(&p[1]));
                vrai(!cuivre_en(x, y), || format!("{c}/{n} : du cuivre sous l'objet d'un autre net en ({x} ; {y})"))?;
            }
        }
        Ok(())
    });

    banc.t(format!("{nom} : masque, pate et textes de serigraphie"), || {
        let mut par: BTreeMap<String, u64> = BTreeMap::new();
        for p in liste(&m["pads"]) {
            let cle = p["ps"].as_str().map(str::to_string).unwrap_or_else(|| p["ps"].to_string());
            let sur: BTreeSet<String> = liste(&m["padstacks"][&cle]["pads"]).iter().map(|q| q["c"].to_string()).collect();
            for c in sur {
                *par.entry(c).or_default() += 1;
            }
        }
        // q["c"] : le nom du calque, ou son rang dans la table des couches
        let n = |calque: &str| {
            let rang = liste(couches).iter().position(|c| c == calque).map(|i| i.to_string()).unwrap_or_default();
            par.get(&format!("\"{calque}\"")).or(par.get(&rang)).copied().unwrap_or(0)
        };
        egal(json!([n("MASQUE_DESSUS"), n("MASQUE_DESSOUS")]), att["masque"].clone(), "ouvertures de masque")?;
        egal(json!([n("PATE_DESSUS"), n("PATE_DESSOUS")]), att["pate"].clone(), "ouvertures de pate")?;
        egal(st["textes"].clone(), att["textes"].clone(), "textes de serigraphie")
    });

    banc.t(format!("{nom} : nomenclature, non-montes de la variante marques"), || {
        vrai(doc.is_ok(), || "XML illisible".into())?;
        let pose: Map<String, Value> = racine()
            .descendants()
            .filter(|e| element(*e, "RefDes"))
            .map(|r| (r.attribute("name").unwrap_or("None").to_string(), json!(r.attribute("populate") == Some("true"))))
            .collect();
        let attendu: Map<String, Value> = liste(&att["composants"]).iter().map(|x| (rf(x), x["pose"].clone())).collect();
        egal(pose.clone(), attendu, "repere -> monte")?;
        // relu par la visionneuse : populate="false" -> "nm", le reste monte
        let relu: Map<String, Value> = liste(&m["composants"]).iter().map(|c| (rf(c), json!(!oui(&c["nm"])))).collect();
        egal(relu, pose, "modele relu : repere -> monte")
    });
}

// =============================================================================
#[test]
fn export_ipc2581_par_aller_retour() {
    let dossier = outils::racine().join("editeur-pcb").join("dist").join("essai-ipc2581");
    let mut noms: Vec<String> = std::fs::read_dir(&dossier)
        .into_iter()
        .flatten()
        .flatten()
        .filter_map(|e| e.file_name().to_string_lossy().strip_suffix(".attendu.json").map(str::to_string))
        .collect();
    noms.sort();
    if noms.is_empty() {
        println!(
            "Aucun export dans {} : lancer d'abord le banc de l'editeur\n    cargo run -p outils --bin build-monofichier -- editeur-pcb && node editeur-pcb/test/harness.js\n(banc non execute)",
            dossier.display()
        );
        return;
    }
    let mut banc = Banc::default();
    let muet = std::panic::take_hook();
    std::panic::set_hook(Box::new(|_| {})); // une panique dans un cas est un ECHEC, deja imprime
    for n in &noms {
        cas_export(&mut banc, &dossier, n);
    }
    std::panic::set_hook(muet);

    println!("{}", "-".repeat(62));
    for s in &banc.sautes {
        println!("  saute  {s}");
    }
    if !banc.echecs.is_empty() {
        println!("{} cas, {} ECHEC(S)", banc.cas.len(), banc.echecs.len());
        for (titre, exc) in &banc.echecs {
            println!("  - {titre} : {exc}");
        }
        panic!("{} cas, {} ECHEC(S)", banc.cas.len(), banc.echecs.len());
    }
    println!("{} cas, tous passes", banc.cas.len());
}
