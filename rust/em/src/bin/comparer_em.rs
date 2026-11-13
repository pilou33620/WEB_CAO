//! Passe des documents JSON a `simuler` et aux autres points d'entree, et sort les resultats
//! en JSON : la meme liste que le script Python jetable de la verification par comparaison.
//!
//!     cargo run --release -p em --bin comparer_em -- cas.json > rust.json
//!
//! `cas.json` : {nom: {"f": fonction, "doc": document, ...}}. La sortie : {nom: resultat}.

use em::simulation_em::base::*;
use em::simulation_em::*;

fn cplx(m: &[[Complex64; 2]; 2]) -> Json {
    Json::Liste(m.iter().flatten().map(|v| vec![v.re, v.im].j()).collect())
}

fn un_cas(cas: &Json) -> Json {
    let mut doc = cas["doc"].clone();
    match cas["f"].as_str().unwrap_or("simuler") {
        "simuler" => {
            let garder = cas["garder_abcd"].vrai();
            let freqs: Option<Vec<f64>> = cas["freqs"].as_liste().map(|l| l.iter().map(|f| f.as_f64().unwrap_or(0.0)).collect());
            match simuler(&mut doc, None, garder, freqs.as_deref()) {
                Err(e) => obj! {"erreur" => e.message, "conseil" => e.conseil, "interne" => e.interne},
                Ok(r) => {
                    let mut j = r.json;
                    if garder {
                        poser(&mut j, "abcd", r.abcd.iter().map(cplx).collect::<Vec<Json>>());
                        if j["s_diff"].vrai() {
                            let s = dans(&mut j, "s_diff");
                            poser(s, "abcd_dd", r.abcd_dd.iter().map(cplx).collect::<Vec<Json>>());
                            poser(s, "abcd_cc", r.abcd_cc.iter().map(cplx).collect::<Vec<Json>>());
                            if !r.abcd_brins.is_empty() {
                                poser(s, "abcd_brins", r.abcd_brins.iter().map(|m| Json::Liste(m.iter().flatten().map(|v| vec![v.re, v.im].j()).collect())).collect::<Vec<Json>>());
                            }
                        }
                    }
                    // le document, que `_partager_paire` modifie sur place
                    obj! {"resultat" => j, "doc" => doc}
                }
            }
        }
        "doc_valide" => match doc_valide(&doc) {
            Err(e) => obj! {"erreur" => e.message, "conseil" => e.conseil},
            Ok((c, o, a)) => vec![Json::Liste(c), Json::Liste(o), a].j(),
        },
        "section_de_couche" => {
            let a = &cas["args"];
            let n = |k: usize| a[k].as_f64().unwrap_or(0.0);
            let plans: Vec<String> = els(&a[6]).iter().map(str_py).collect();
            let (geo, info) = section_de_couche(els(&doc["stackup"]["layers"]), n(0) as i64, n(1), n(2), n(3), a[4].as_f64(), &plans, a[5].vrai());
            vec![geo.unwrap_or(Json::Nul), info].j()
        }
        "options_modele" => {
            let o = options_modele(&doc);
            obj! {"causal" => o.causal, "f_ref" => o.f_ref, "modele_via" => o.modele_via}
        }
        "topologie" => {
            let t = _topologie(els(&doc["geometry"]["objects"]));
            obj! {"raison" => raison_topologie(&t), "topo" => t}
        }
        "etat" => etat(),
        autre => obj! {"erreur" => format!("fonction inconnue : {autre}")},
    }
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let texte = std::fs::read_to_string(&args[1]).expect("fichier des cas");
    let cas = loads(&texte).expect("JSON des cas");
    let seul = args.get(2);
    let repetitions: usize = args.get(3).and_then(|n| n.parse().ok()).unwrap_or(0);
    let mut out = obj! {};
    for (nom, c) in cas.as_objet().expect("un objet de cas") {
        if seul.is_some_and(|s| !s.is_empty() && s != nom) {
            continue;
        }
        if repetitions > 0 {
            // le meilleur de N passages : la machine est partagee
            let mut meilleur = f64::INFINITY;
            for _ in 0..repetitions {
                let t0 = std::time::Instant::now();
                let _ = un_cas(c);
                meilleur = meilleur.min(t0.elapsed().as_secs_f64());
            }
            poser(&mut out, nom, meilleur);
        } else {
            poser(&mut out, nom, un_cas(c));
        }
    }
    println!("{}", dumps(&out));
}
