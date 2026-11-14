//! Passe des documents JSON aux points d'entrée d'analyse_carte et sort les résultats en
//! JSON : la même liste que le script Python jetable de la vérification par comparaison.
//!
//!     cargo run --release -p analyse_carte --bin comparer_analyse -- cas.json > rust.json
//!
//! `cas.json` : {nom: {"f": fonction, ...}}. La sortie : {nom: résultat}, sans les durées.
//! Avec `--temps`, la durée de chaque cas (s) à la place du résultat. Avec `--peec=N`, le nombre
//! de fentes résolues par analyse (`crosstalk.PEEC_FENTES_MAX` ; 0 : le modèle d'Ott partout,
//! ce qui écarte de la comparaison le bruit numérique du PEEC).
//!
//! Et la ligne de commande de python/analyse_carte.py, les constats d'angles d'un IPC-2581 :
//!
//!     cargo run --release -p analyse_carte --bin comparer_analyse -- --ipc carte.xml [n]

use analyse_carte::base::*;
use analyse_carte::*;

fn erreur(e: ErreurAnalyse) -> Json {
    if e.interne { obj! {"exception" => "interne", "message" => e.message} } else { obj! {"erreur" => e.message} }
}

fn un_cas(cas: &Json) -> Json {
    match cas["f"].as_str().unwrap_or("document") {
        "angles" => {
            let unite = cas["unite_mm"].as_f64().unwrap_or(1.0);
            match angles(els(&cas["pistes"]), els(&cas["arcs"]), els(&cas["pastilles"]), unite, TOL_DEG) {
                Ok(r) => r.j(),
                Err(e) => erreur(e.into()),
            }
        }
        "modele" => analyser_modele(&cas["modele"]).map_or_else(erreur, |r| r.j()),
        "kb" => els(&cas["args"]).iter().map(|a| _kb_larges_faces(nb(&a[0]), nb(&a[1]), nb(&a[2]), nb(&a[3]), nb(&a[4]))).collect::<Vec<f64>>().j(),
        _ => match analyser_document(&cas["doc"]) {
            Ok(mut r) => {
                oter(&mut r, "durees_s");
                r
            }
            Err(e) => erreur(e),
        },
    }
}

/// `python analyse_carte.py carte.xml [n]`
fn ipc(fichier: &str, n: usize) -> Result<(), String> {
    let octets = std::fs::read(fichier).map_err(|e| format!("{fichier} : {e}"))?;
    let m = ipc2581::ipc2581_en_dict(&octets, fichier, true).map_err(|e| format!("{e:?}"))?;
    let res = analyser_modele(&m).map_err(|e| e.message)?;
    let mut compte: IndexMap<&str, usize> = IndexMap::new();
    for k in &res {
        *compte.entry(txt(k, "regle")).or_insert(0) += 1;
    }
    println!("{{{}}}", compte.iter().map(|(r, n)| format!("'{r}': {n}")).collect::<Vec<_>>().join(", "));
    let nom = |v: &Json, liste: &Json| match v.as_i64().and_then(|i| liste.at(usize::try_from(i).ok()?)) {
        Some(x) => str_py(x),
        None => str_py(v),
    };
    for k in res.iter().take(n) {
        println!("{:<9} {:<11} {:<12} {:<14} ({:.3}, {:.3})  {}", txt(k, "severite"), txt(k, "regle"), nom(&k["c"], &m["couches"]),
                 nom(&k["n"], &m["nets"]), nb(&k["x"]), nb(&k["y"]), txt(k, "msg"));
    }
    Ok(())
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.first().map(String::as_str) == Some("--ipc") {
        let Some(fichier) = args.get(1) else {
            eprintln!("usage : comparer_analyse --ipc carte.xml [n]");
            std::process::exit(2);
        };
        if let Err(e) = ipc(fichier, args.get(2).and_then(|n| n.parse().ok()).unwrap_or(20)) {
            eprintln!("{e}");
            std::process::exit(1);
        }
        return;
    }
    let temps = args.iter().any(|a| a == "--temps");
    if let Some(n) = args.iter().find_map(|a| a.strip_prefix("--peec=")).and_then(|n| n.parse().ok()) {
        xt::regler_peec_fentes_max(n);
    }
    let Some(chemin) = args.iter().find(|a| !a.starts_with("--")) else {
        eprintln!("usage : comparer_analyse [--temps] cas.json | --ipc carte.xml [n]");
        std::process::exit(2);
    };
    let texte = std::fs::read_to_string(chemin).unwrap_or_else(|e| {
        eprintln!("{chemin} : {e}");
        std::process::exit(1);
    });
    let cas = loads(&texte).unwrap_or_else(|e| {
        eprintln!("{chemin} : {e}");
        std::process::exit(1);
    });
    let mut out = obj! {};
    for (nom, c) in cas.as_objet().into_iter().flatten() {
        let t0 = std::time::Instant::now();
        let r = un_cas(c);
        if temps {
            poser(&mut out, nom, t0.elapsed().as_secs_f64());
        } else {
            poser(&mut out, nom, r);
        }
    }
    println!("{}", dumps(&out));
}
