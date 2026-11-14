//! Passe des documents JSON a `analyser` et aux autres points d'entree de la caisse, et sort les
//! resultats en JSON : la meme liste que le script Python jetable de la verification par
//! comparaison.
//!
//!     cargo run --release -p oeil --bin comparer_oeil -- cas.json > rust.json
//!
//! `cas.json` : {nom: {"f": fonction, "doc": document, ...}}. La sortie : {nom: resultat}, et
//! sur la sortie d'erreur le temps de chaque cas.

use em::obj;
use em::simulation_em::base::*;
use oeil::*;

#[path = "../../tests/banc/faux.rs"]
mod faux;

fn erreur(e: ErreurOeil) -> Json {
    if e.interne {
        obj! {"exception" => "interne", "message" => e.message}
    } else {
        obj! {"erreur" => e.message, "conseil" => e.conseil}
    }
}

fn cplx(v: &[Complex64]) -> Json {
    Json::Liste(v.iter().map(|z| vec![z.re, z.im].j()).collect())
}

fn un_cas(cas: &Json) -> Json {
    let a = &cas["args"];
    let f = |i: usize| nb(&a[i]);
    match cas["f"].as_str().unwrap_or("") {
        "analyser" => {
            let racines: Vec<&str> = els(&cas["racines"]).iter().filter_map(Json::as_str).collect();
            let rac = if nul(&cas["racines"]) { None } else { Some(racines.as_slice()) };
            let r = if cas["faux"].vrai() { analyser_avec(&cas["doc"], None, rac, &faux::Faux) } else { analyser(&cas["doc"], None, rac) };
            r.unwrap_or_else(erreur)
        }
        "etat" => etat(),
        "prbs" => prbs(f(0) as i64).map(|b| b.iter().map(|x| *x as i64).collect::<Vec<i64>>().j()).unwrap_or_else(erreur),
        "params" => _params(&cas["doc"], gabarit(txt(&cas["doc"], "gabarit"))).map(|p| {
            let mut j = p.json();
            poser(&mut j, "ctle", p.ctle.clone());
            j
        }).unwrap_or_else(erreur),
        "grille" => {
            let (df, n, fen, pleine) = grille(f(0), f(1), f(2), f(3));
            vec![df.j(), n.j(), fen.j(), pleine.j()].j()
        }
        // l'oeil d'une ligne ideale : [o, retard, pertes, z0, gab]
        "canal" => {
            let o = &a[0];
            let gab = if a[4].vrai() { Some(&a[4]) } else { None };
            (|| -> Res<Json> {
                let mut p = _params(o, gab)?;
                let ctx = preparer_ibis(o, &mut p)?;
                let temporel = ctx.as_ref().is_some_and(|c| c.temporel);
                let (df, n, _, _) = match &ctx {
                    Some(c) => grille(p.debit, if temporel { c.tr_lissage } else { p.tr }, f(1), 4.0 * p.tr),
                    None => grille(p.debit, p.tr, f(1), 0.0),
                };
                let fr = frequences(df, n);
                let mut abcd = ligne_ideale(&fr, f(3), f(1), f(2));
                if a[5].vrai() {
                    abcd = appliquer_boitiers(ctx.as_ref(), &fr, &abcd, "simple")?.0;
                }
                let mut nl = None;
                if let (true, Some(c)) = (temporel, &ctx) {
                    let x = simuler_non_lineaire(c, &fr, &abcd, &p, f(3))?;
                    (p.v_haut, p.v_bas) = (x.v_haut, x.v_bas);
                    nl = Some(x);
                }
                let mut r = oeil(&fr, Canal::Abcd(&abcd), &p, gab, None, nl.as_mut(), None, None)?;
                if let Some(x) = &nl {
                    poser(&mut r, "ibis", x.infos.clone());
                    poser(&mut r, "s_nl", x.s.iter().step_by(37).copied().collect::<Vec<f64>>());
                }
                Ok(r)
            })().unwrap_or_else(erreur)
        }
        "q_inverse" => els(a).iter().map(|x| q_inverse(nb(x))).collect::<Vec<f64>>().j(),
        "ctle" => {
            let fr: Vec<f64> = els(&a[0]).iter().map(nb).collect();
            cplx(&ctle(&fr, &a[1]))
        }
        "poids_gigue" => poids_gigue(f(0), f(1), f(2) as usize, f(3) as usize).j(),
        "jauge" => {
            let pts = |v: &Json| -> Vec<[f64; 2]> { els(v).iter().map(|q| [nb(&q[0]), nb(&q[1])]).collect() };
            jauge(&pts(&a[0]), &pts(&a[1])).j()
        }
        "reponse" => {
            let (df, n, _, _) = grille(f(0), f(1), f(2), 0.0);
            let fr = frequences(df, n);
            let (h, h0) = transfert(&ligne_ideale(&fr, 50.0, f(2), f(3)), &fr, f(4), f(5), f(6), 0.0);
            let (dt, s) = reponse_indicielle(&fr, &h, h0, f(1), 4096);
            vec![dt.j(), h0.j(), s.iter().step_by(11).copied().collect::<Vec<f64>>().j()].j()
        }
        x => obj! {"erreur" => format!("fonction inconnue : {x}")},
    }
}

fn main() {
    let chemin = std::env::args().nth(1).expect("cas.json");
    let cas = loads(&std::fs::read_to_string(&chemin).expect("lecture")).expect("JSON");
    let mut sortie = Objet::new();
    for (nom, c) in cas.as_objet().expect("objet") {
        let t = std::time::Instant::now();
        let r = std::panic::catch_unwind(|| un_cas(c)).unwrap_or_else(|_| obj! {"exception" => "panique"});
        eprintln!("{nom}\t{:.3}", t.elapsed().as_secs_f64());
        sortie.insert(nom.clone(), r);
    }
    println!("{}", dumps(&Json::Objet(sortie)));
}
