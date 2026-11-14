//! Passe des documents JSON a `analyser` et aux autres points d'entree de rf_reseau, et sort
//! les resultats en JSON : la meme liste que le script Python jetable de la verification par
//! comparaison.
//!
//!     cargo run --release -p rf_reseau --bin comparer_rf -- cas.json > rust.json
//!
//! `cas.json` : {nom: {"f": fonction, ...}}. La sortie : {nom: resultat}. Avec `--temps`, la
//! duree de chaque cas (s) a la place du resultat.

use em::simulation_em::base::*;
use rf_reseau::alg::{MatC, MatR};
use rf_reseau::*;

fn cplx_n(m: &MatC) -> Json {
    Json::Liste(m.iter().map(|l| Json::Liste(l.iter().map(|z| vec![z.re, z.im].j()).collect())).collect())
}

fn mat(v: &Json) -> MatR {
    els(v).iter().map(|l| els(l).iter().map(nb).collect()).collect()
}

fn vec_f(v: &Json) -> Vec<f64> {
    els(v).iter().map(nb).collect()
}

fn erreur(e: ErreurRF) -> Json {
    if e.interne { obj! {"exception" => "interne", "message" => e.message} } else { obj! {"erreur" => e.message, "conseil" => e.conseil} }
}

fn un_cas(cas: &Json) -> Res<Json> {
    let couches = els(&cas["couches"]);
    let freqs = vec_f(&cas["freqs"]);
    let texte = cas["texte"].as_str().unwrap_or("");
    let nom = cas["nom"].as_str().unwrap_or("");
    Ok(match cas["f"].as_str().unwrap_or("analyser") {
        "analyser" => {
            let mut lignes = Vec::new();
            let mut journal = |l: &str| lignes.push(l.to_string());
            let mut r = analyser(&cas["doc"], Some(&mut journal))?;
            oter(&mut r, "duree");
            // la duree, dans la ligne du journal aussi
            poser(&mut r, "journal", lignes.iter().map(|l| l.rsplit_once(", ").map_or(l.as_str(), |x| x.0).to_string()).collect::<Vec<_>>());
            r
        }
        "etat" => etat(),
        "touchstone" => {
            let (f, s, z0) = lire_touchstone(texte, nom, cas["n_ports"].as_i64())?;
            obj! {"freqs" => f, "s" => s.iter().map(cplx_n).collect::<Vec<Json>>(), "z0" => z0}
        }
        "spice" => {
            let m = ModeleSpice::new(texte, nom, &cas["sous_circuit"], &cas["params"])?;
            let mut ys = Vec::new();
            for f in &freqs {
                ys.push(cplx_n(&m.y(*f)?));
            }
            obj! {"nom" => &m.nom, "n" => m.n, "elements" => m.elements.len(), "y" => ys}
        }
        "valeur_spice" => els(&cas["jetons"]).iter().map(|j| match valeur_spice(j.as_str().unwrap_or(""), None) {
            Ok(v) => v.j(),
            Err(e) => erreur(e),
        }).collect::<Vec<Json>>().j(),
        "plaque" => {
            let mut out = Vec::new();
            for a in els(&cas["args"]) {
                out.push(capacite_plaque_3d(nb(&a[0]), nb(&a[1]), nb(&a[2]), a[3].as_f64(), 20, nb(&a[4]))?);
            }
            out.j()
        }
        "surface" => {
            let mut cache = Cache::default();
            let mut out = Vec::new();
            for s in els(&cas["pastilles"]) {
                let (cap, eps) = capacite_surface(couches, s, &mut cache)?;
                out.push(vec![cap, eps]);
            }
            out.j()
        }
        "maillage" => match maillage_zone(couches, &cas["zone"], nb(&cas["f_max"]), &mut Cache::default())? {
            None => Json::Nul,
            Some(m) => obj! {"cx" => m.cx, "cy" => m.cy, "c" => m.c, "aire" => m.aire, "ia" => m.ia, "ib" => m.ib, "l_lien" => m.l_lien,
                             "r_lien" => m.r_lien, "ep" => m.ep, "acces" => m.acces.iter().map(|(n, q)| vec![n.j(), q.j()].j()).collect::<Vec<Json>>(),
                             "grossier" => m.grossier, "pas_min" => m.pas_min, "pas_max" => m.pas_max, "lam" => m.lam},
        },
        "masse" => {
            let mut cache = Cache::default();
            let ys = admittance_masse(couches, &cas["masse"], &freqs, &mut cache)?;
            obj! {"l" => inductance_masse(couches, ent(&cas["masse"]["couche"], 0), els(&cas["masse"]["vias"]))?,
                  "y" => ys.iter().map(|z| vec![z.re, z.im]).collect::<Vec<_>>()}
        }
        "z_fente" => els(&cas["fentes"]).iter().map(|fe| freqs.iter().map(|f| {
            let z = z_fente(couches, fe, *f);
            vec![z.re, z.im]
        }).collect::<Vec<_>>()).collect::<Vec<_>>().j(),
        "phi" => {
            let (l, cm) = (mat(&cas["l"]), mat(&cas["c"]));
            let r: Vec<Vec<f64>> = els(&cas["r"]).iter().map(vec_f).collect();
            let td = nb(&cas["tan_delta"]);
            let phi = phi_mtl(ParFrequence::Une(&l), ParFrequence::Une(&cm), &r, ParFrequence::Une(&td), nb(&cas["longueur"]), &freqs)?;
            let (ls, cs) = dispersion_modale(&l, &cm, nb(&cas["er"]), nb(&cas["h"]), &freqs)?;
            obj! {"phi" => phi.iter().map(cplx_n).collect::<Vec<Json>>(), "ls" => ls, "cs" => cs}
        }
        "bobines" => {
            let mut cache = Cache::default();
            let b: Vec<Option<Bobine>> = els(&cas["geos"]).iter().map(|g| bobine(couches, g, nb(&cas["l_h"]), &mut cache)).collect();
            let mut out = Vec::new();
            for i in 0..b.len() {
                for k in i + 1..b.len() {
                    out.push(match (&b[i], &b[k]) {
                        (Some(x), Some(y)) => mutuelle_bobines(x, y).j(),
                        _ => Json::Nul,
                    });
                }
            }
            for x in b.iter().flatten() {
                out.push(segments_piste(couches, els(&cas["objets"]), x, &mut cache).map(|s| mutuelle_piste(x, &s)).j());
            }
            out.j()
        }
        "groupes" => {
            let (sections, coupes) = groupes_couples(couches, els(&cas["branches"]), &mut Cache::default());
            let mut cles: Vec<_> = coupes.keys().copied().collect();
            cles.sort();
            obj! {"sections" => sections.iter().map(|s| obj! {"t1" => s.t1, "t2" => s.t2,
                      "membres" => s.membres.iter().map(|m| obj! {"obj" => vec![m.obj.0, m.obj.1], "lat" => m.lat, "sens" => m.sens}).collect::<Vec<Json>>()}).collect::<Vec<Json>>(),
                  "coupes" => cles.iter().map(|k| vec![vec![k.0, k.1].j(),
                      coupes[k].iter().map(|x| vec![x.0.j(), x.1.j(), x.2.map(|r| vec![r.0, r.1]).j()].j()).collect::<Vec<Json>>().j()].j()).collect::<Vec<Json>>()}
        }
        autre => panic!("fonction inconnue : {autre}"),
    })
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let temps = args.iter().any(|a| a == "--temps");
    let chemin = args.iter().skip(1).find(|a| !a.starts_with("--")).expect("usage : comparer_rf cas.json [--temps]");
    let cas = loads(&std::fs::read_to_string(chemin).expect("fichier de cas illisible")).expect("JSON des cas");
    let mut out = Objet::new();
    for (nom, c) in cas.as_objet().expect("un objet {nom: cas}") {
        let t0 = std::time::Instant::now();
        let r = un_cas(c).unwrap_or_else(erreur);
        out.insert(nom.clone(), if temps { t0.elapsed().as_secs_f64().j() } else { r });
    }
    println!("{}", dumps(&Json::Objet(out)));
}
