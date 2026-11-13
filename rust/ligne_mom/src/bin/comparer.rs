//! Sort en JSON les resultats des fonctions principales sur un jeu d'entrees variees : la
//! meme liste que le script Python jetable de la verification par comparaison.
//!
//!     cargo run --release -p ligne_mom --bin comparer > rust.json

use ligne_mom::*;
use serde_json::{json, Map, Value};

fn geo(kind: Kind, w: f64, t: f64, er: f64) -> Geometrie {
    Geometrie { kind, w, t, epsilon_r: er, ..Default::default() }
}

fn sections() -> Vec<(&'static str, Geometrie)> {
    let m = |w, t, h, er| Geometrie { h, ..geo(Kind::Micro, w, t, er) };
    let paire = |w: f64, s: f64| vec![Conducteur { w, ..Default::default() }, Conducteur { w, s, ..Default::default() }];
    vec![
        ("micro_nu", m(0.38e-3, 0.0, 0.2e-3, 4.3)),
        ("micro_epais", m(0.38e-3, 35e-6, 0.2e-3, 4.3)),
        ("micro_large", m(5e-3, 35e-6, 0.1e-3, 9.8)),
        ("micro_couvert", Geometrie { couverture: 0.3e-3, ..m(0.2e-3, 35e-6, 0.2e-3, 4.3) }),
        ("micro_masque", Geometrie { masque: Some(Masque { epaisseur: 25e-6, epsilon_r: 3.8 }), ..m(0.3e-3, 35e-6, 0.2e-3, 4.3) }),
        ("cpw_sym", Geometrie { ecart: 0.15e-3, ..m(0.3e-3, 35e-6, 0.2e-3, 4.3) }),
        ("cpw_asym", Geometrie { ecart_g: Some(0.1e-3), ecart_d: Some(0.4e-3), ..m(0.3e-3, 18e-6, 0.25e-3, 3.66) }),
        ("cpw_un_cote", Geometrie { ecart_g: Some(0.12e-3), ..m(0.3e-3, 35e-6, 1.6e-3, 4.5) }),
        ("cpw_serre", Geometrie { ecart: 60e-6, ..m(0.3e-3, 35e-6, 1.6e-3, 4.3) }),
        ("strip_centre", Geometrie { b: 0.6e-3, ..geo(Kind::Strip, 0.2e-3, 0.0, 4.3) }),
        ("strip_epais_decentre", Geometrie { b: 0.5e-3, y0: Some(0.15e-3), ..geo(Kind::Strip, 0.15e-3, 35e-6, 3.9) }),
        ("sans_plan", Geometrie { h: 1.6e-3, ecart: 0.2e-3, ..geo(Kind::SansPlan, 1.0e-3, 0.0, 4.3) }),
        (
            "strates_micro",
            Geometrie {
                h: 1.1e-3,
                strates: Some(Strates { dessous: vec![(3.6, 0.1e-3), (4.6, 1.0e-3)], dessus: vec![(3.8, 25e-6)], plan_dessus: false }),
                ..geo(Kind::Micro, 0.2e-3, 35e-6, 4.3)
            },
        ),
        (
            "strates_strip",
            Geometrie {
                strates: Some(Strates { dessous: vec![(3.6, 0.1e-3), (4.6, 0.2e-3)], dessus: vec![(4.2, 0.15e-3)], plan_dessus: true }),
                ..geo(Kind::Strip, 0.12e-3, 17.5e-6, 4.3)
            },
        ),
        ("paire_micro", Geometrie { conducteurs: paire(0.2e-3, 0.15e-3), ..m(0.0, 35e-6, 0.2e-3, 4.3) }),
        ("paire_strip", Geometrie { b: 0.6e-3, conducteurs: paire(0.15e-3, 0.1e-3), ..geo(Kind::Strip, 0.0, 17.5e-6, 4.3) }),
        (
            "paire_cpw_masque",
            Geometrie {
                ecart: 0.2e-3,
                masque: Some(Masque { epaisseur: 25e-6, epsilon_r: 3.8 }),
                conducteurs: paire(0.2e-3, 0.12e-3),
                ..m(0.0, 35e-6, 0.2e-3, 4.3)
            },
        ),
        (
            "trois_dissym",
            Geometrie {
                conducteurs: vec![
                    Conducteur { w: 0.3e-3, x: Some(1.0e-3), ..Default::default() },
                    Conducteur { w: 0.15e-3, x: Some(0.0), ..Default::default() },
                    Conducteur { w: 0.2e-3, x: Some(0.45e-3), t: Some(18e-6), ..Default::default() },
                ],
                ..m(0.0, 35e-6, 0.2e-3, 4.3)
            },
        ),
        (
            "garde_et_flottant",
            Geometrie {
                conducteurs: vec![
                    Conducteur { w: 0.2e-3, ..Default::default() },
                    Conducteur { w: 0.2e-3, s: 0.2e-3, masse: true, ..Default::default() },
                    Conducteur { w: 0.2e-3, s: 0.2e-3, ..Default::default() },
                    Conducteur { w: 0.3e-3, s: 0.2e-3, flottant: true, ..Default::default() },
                ],
                ..m(0.0, 0.0, 0.2e-3, 4.3)
            },
        ),
        (
            "sans_plan_paire",
            Geometrie { h: 1.0e-3, ecart: 0.3e-3, conducteurs: paire(0.5e-3, 0.2e-3), ..geo(Kind::SansPlan, 0.0, 0.0, 4.3) },
        ),
        (
            "bus_huit",
            Geometrie {
                conducteurs: (0..8).map(|k| Conducteur { w: 0.15e-3, s: if k == 0 { 0.0 } else { 0.15e-3 }, ..Default::default() }).collect(),
                ..m(0.0, 35e-6, 0.1e-3, 4.3)
            },
        ),
    ]
}

fn main() {
    let mut out = Map::new();
    let quoi = std::env::args().nth(1).unwrap_or_default();
    if quoi == "temps" {
        return temps();
    }
    for (nom, g) in sections() {
        let v = if g.conducteurs.is_empty() {
            solve_line(&g).map(|r| json!(r))
        } else {
            solve_multiline(&g).map(|r| json!(r))
        };
        out.insert(format!("section/{nom}"), v.unwrap_or_else(|e| json!({ "erreur": e.0 })));
    }
    autres(&mut out);
    println!("{}", serde_json::to_string(&Value::Object(out)).unwrap());
}

fn temps() {
    for (nom, g) in sections() {
        let t0 = std::time::Instant::now();
        let n = 5;
        for _ in 0..n {
            if g.conducteurs.is_empty() {
                let _ = solve_line(&g);
            } else {
                let _ = solve_multiline(&g);
            }
        }
        println!("{nom} {:.2} ms", t0.elapsed().as_secs_f64() * 1e3 / n as f64);
    }
}

fn autres(_out: &mut Map<String, Value>) {}
