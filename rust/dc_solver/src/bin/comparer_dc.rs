//! L'exécutable de comparaison avec l'ancien Python : rejoue une liste de cas et écrit ce que
//! la caisse rend, pour qu'un script Python le mette en face de python/dc_solver.py.
//!
//!     comparer_dc cas.json sortie.json
//!
//! cas.json : [{"f": fonction, ...arguments}] ; sortie.json : [{"r": résultat, "t": secondes}]
//! ou {"erreur": {message, conseil}, "t": ...}. Fonctions : resoudre_document {doc},
//! resoudre_dc {polygones, sources, references, vias, liaisons, externes, pas, rho, thermique},
//! echauffement_composants {doc}, carte {doc, resolution, couche} (resoudre_document puis
//! carte_chaleur), mailler {polygones, pas}, bessel {x: [...]}, etat {}.

use dc_solver::*;
use std::time::Instant;

fn jouer(cas: &Json) -> Result<Json, ErreurDC> {
    let champ = |cle: &str| cas.get(cle).filter(|v| !matches!(v, Json::Nul));
    let mut o = Objet::new();
    match cas["f"].as_str().unwrap_or("") {
        "resoudre_document" => return resoudre_document(&cas["doc"], None),
        "resoudre_dc" => {
            let entrees = Entrees {
                sources: champ("sources"),
                references: champ("references"),
                vias: champ("vias"),
                liaisons: champ("liaisons"),
                externes: champ("externes"),
                pas: champ("pas").and_then(Json::as_f64),
                rho: champ("rho").and_then(Json::as_f64).unwrap_or(RESISTIVITE_CUIVRE),
                thermique: champ("thermique"),
            };
            return resoudre_dc(&cas["polygones"], &entrees, None);
        }
        "echauffement_composants" => return echauffement_composants(&cas["doc"]),
        "carte" => {
            let r = resoudre_document(&cas["doc"], None)?;
            return carte_chaleur(&r, cas["resolution"].as_i64().unwrap_or(120) as usize, cas["couche"].as_i64());
        }
        "mailler" => {
            let m = mailler(&normaliser(&cas["polygones"])?, cas["pas"].as_f64().unwrap_or(0.0))?;
            let f = |v: &[f64]| Json::Liste(v.iter().map(|x| Json::Flottant(*x)).collect());
            o.insert("coords".into(), Json::Liste(m.coords.iter().map(|c| Json::Liste(vec![c.0.into(), c.1.into(), c.2.into()])).collect()));
            o.insert("nets".into(), Json::Liste((0..m.coords.len()).map(|k| Json::from(m.net(k))).collect()));
            o.insert("aretes".into(), Json::Liste(m.aretes.iter().map(|a| Json::Liste(vec![(a.0 as usize).into(), (a.1 as usize).into(), a.2.into()])).collect()));
            o.insert("epaisseurs".into(), f(&m.epaisseurs));
            o.insert("couvertures".into(), f(&m.couvertures));
        }
        "bessel" => {
            let x: Vec<f64> = cas["x"].as_liste().map(|l| l.iter().filter_map(Json::as_f64).collect()).unwrap_or_default();
            o.insert("k0e".into(), Json::Liste(x.iter().map(|x| Json::Flottant(k0e(*x))).collect()));
            o.insert("k1e".into(), Json::Liste(x.iter().map(|x| Json::Flottant(k1e(*x))).collect()));
        }
        "etat" => return Ok(etat()),
        autre => return Err(ErreurDC::new(format!("fonction inconnue : {autre}"), "")),
    }
    Ok(Json::Objet(o))
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() != 3 {
        eprintln!("usage : comparer_dc cas.json sortie.json");
        std::process::exit(2);
    }
    let texte = std::fs::read_to_string(&args[1]).expect("cas illisibles");
    let cas = loads(&texte).expect("cas : JSON invalide");
    let mut sorties = Vec::new();
    for c in cas.as_liste().expect("cas : une liste attendue") {
        let debut = Instant::now();
        let r = jouer(c);
        let mut o = Objet::new();
        match r {
            Ok(r) => o.insert("r".into(), r),
            Err(e) => {
                let mut err = Objet::new();
                err.insert("message".into(), e.message.into());
                err.insert("conseil".into(), e.conseil.into());
                o.insert("erreur".into(), Json::Objet(err))
            }
        };
        o.insert("t".into(), debut.elapsed().as_secs_f64().into());
        sorties.push(Json::Objet(o));
    }
    std::fs::write(&args[2], dumps(&Json::Liste(sorties))).expect("sortie non écrite");
}
