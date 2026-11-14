//! Passe des documents JSON a `simuler`, a `crosstalk.analyser` et aux autres points d'entree, et sort les resultats
//! en JSON : la meme liste que le script Python jetable de la verification par comparaison.
//!
//!     cargo run --release -p em --bin comparer_em -- cas.json > rust.json
//!
//! `cas.json` : {nom: {"f": fonction, "doc": document, ...}}. La sortie : {nom: resultat}.

use em::crosstalk as xt;
use em::simulation_em::base::*;
use em::simulation_em::*;

fn mat(v: &Json) -> Vec<Vec<f64>> {
    els(v).iter().map(|l| els(l).iter().map(nb).collect()).collect()
}

fn cplx_n(m: &[Vec<Complex64>]) -> Json {
    Json::Liste(m.iter().map(|l| Json::Liste(l.iter().map(|z| vec![z.re, z.im].j()).collect())).collect())
}

fn trc(v: &Json) -> Vec<xt::Trc> {
    els(v).iter().map(|t| (nb(&t[0]), nb(&t[1]), nb(&t[2]), nb(&t[3]), nb(&t[4]), ent(&t[5], 0))).collect()
}

/// Les points d'entree de crosstalk, un par un ; None si la fonction n'en est pas.
fn un_cas_xt(cas: &Json) -> Option<Json> {
    let a = |k: usize, i: usize| nb(&cas["args"][k][i]);
    let args = els(&cas["args"]);
    Some(match cas["f"].as_str()? {
        "xt_analyser" => match xt::analyser(&cas["doc"], None) {
            Err(e) if e.interne => obj! {"exception" => "interne", "message" => e.message},
            Err(e) => obj! {"erreur" => e.message, "conseil" => e.conseil},
            Ok(r) => r,
        },
        "xt_etat" => xt::etat(),
        "xt_geosup" => els(&cas["piles"]).iter().map(|p| {
            let p = els(p);
            let mut l = Vec::new();
            for i in 0..p.len() {
                for k in 0..p.len() {
                    let g = xt::geometrie_superposee(p, i as i64, k as i64);
                    l.push(vec![i.j(), k.j(), g.map(|g| vec![g.0.j(), g.1.j(), g.2.j(), g.3.j()]).j()].j());
                }
            }
            Json::Liste(l)
        }).collect::<Vec<Json>>().j(),
        "xt_niveau2" => (0..args.len()).map(|k| {
            let m: Vec<xt::Morceau> = els(&args[k][0]).iter().map(|m| (nb(&m[0]), nb(&m[1]), nb(&m[2]), _nombre(&m[3], 1.0))).collect();
            xt::niveau2(&m, a(k, 1), a(k, 2), a(k, 3), a(k, 4))
        }).collect::<Vec<Json>>().j(),
        "xt_ott" => (0..args.len()).map(|k| xt::impedance_commune_fente(a(k, 0), a(k, 1), a(k, 2), a(k, 3), a(k, 4), a(k, 5), a(k, 6),
                                                                      args[k][7].as_f64(), a(k, 8), args[k][9].vrai(), args[k][10].vrai())).collect::<Vec<Json>>().j(),
        "xt_front" => args.iter().map(|x| {
            let (t, s) = xt::front_de_classe(x[0].as_str().unwrap_or(""), &x[1], nb(&x[2]));
            vec![t.j(), s.j()].j()
        }).collect::<Vec<Json>>().j(),
        "xt_kbsup" => (0..args.len()).map(|k| xt::kb_superposees(a(k, 0), a(k, 1), a(k, 2), a(k, 3), a(k, 4), args[k][5].as_f64()).ok()).collect::<Vec<_>>().j(),
        "xt_seuil_couture" => args.iter().map(|x| {
            let (s, o, e) = xt::_seuil_couture(x);
            vec![s.j(), o.j(), e.j()].j()
        }).collect::<Vec<Json>>().j(),
        "xt_mtl" => {
            let (l, c) = (mat(&cas["l"]), mat(&cas["c"]));
            let omegas: Vec<f64> = els(&cas["omegas"]).iter().map(nb).collect();
            let ch = xt::chaine_mtl(&l, &c, nb(&cas["longueur"]), &omegas, nb(&cas["tan_delta"])).unwrap();
            let s = xt::s_depuis_chaine(&ch, nb(&cas["z0"])).unwrap();
            obj! {"racines" => xt::_modes_mtl(&l, &c).unwrap().2,
                  "chaine" => ch.iter().map(|m| cplx_n(m)).collect::<Vec<Json>>(),
                  "s" => s.iter().map(|m| cplx_n(m)).collect::<Vec<Json>>()}
        }
        "xt_peec" => {
            let vict: Vec<(String, Vec<xt::Trc>)> = els(&cas["vict"]).iter().map(|v| (str_py(&v[0]), trc(&v[1]))).collect();
            let (scene, noms, raison) = xt::scene_fente(&cas["maillage"], els(&cas["couches"]), &trc(&cas["agr"]), &vict);
            let Some(scene) = scene else { return Some(obj! {"scene" => Json::Nul, "raison" => raison}) };
            match xt::peec_fente(&scene, nb(&cas["freq"])) {
                Err(e) => obj! {"noms" => noms, "refus" => e},
                Ok(None) => obj! {"noms" => noms, "peec" => Json::Nul},
                Ok(Some(r)) => obj! {"noms" => noms, "cles_u" => scene.cles_u.clone(), "cles_v" => scene.cles_v.clone(), "s_min" => scene.s_min, "eps" => scene.eps.clone(),
                                     "ld" => r.ld, "m" => r.m.clone(), "selfs" => r.selfs.clone(), "mailles" => vec![r.mailles.0, r.mailles.1],
                                     "branches" => r.branches, "croissance" => r.croissance, "pas_max" => r.pas_max},
            }
        }
        _ => return None,
    })
}

fn cplx(m: &[[Complex64; 2]; 2]) -> Json {
    Json::Liste(m.iter().flatten().map(|v| vec![v.re, v.im].j()).collect())
}

fn un_cas(cas: &Json) -> Json {
    if let Some(r) = un_cas_xt(cas) {
        return r;
    }
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
    std::panic::set_hook(Box::new(|_| {}));
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
            // un cas qui passe par crosstalk (pas encore porte) le dit au lieu d'arreter le lot
            let r = std::panic::catch_unwind(|| un_cas(c)).unwrap_or_else(|e| {
                obj! {"panique" => e.downcast_ref::<String>().cloned().or_else(|| e.downcast_ref::<&str>().map(|s| s.to_string())).unwrap_or_default()}
            });
            poser(&mut out, nom, r);
        }
    }
    println!("{}", dumps(&out));
}
