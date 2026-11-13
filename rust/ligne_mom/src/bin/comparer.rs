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

fn cx(z: Complex64) -> Value {
    json!([z.re, z.im])
}

fn mat(m: &Abcd) -> Value {
    json!([[cx(m[0][0]), cx(m[0][1])], [cx(m[1][0]), cx(m[1][1])]])
}

fn pont(l: f64, esr: f64, c: Option<f64>) -> Pont {
    Pont { l, esr, c, aval: None }
}

fn autres(out: &mut Map<String, Value>) {
    let fs = [1.0, 1e3, 1e6, 1e8, 1e9, 5e9, 2e10];
    let d = OptionsPertes::default;
    let rp = RugositePlan::default;
    // pertes
    let cas: Vec<(&str, OptionsPertes)> = vec![
        ("defaut", d()),
        ("hauteur", OptionsPertes { hauteur: Some(0.2e-3), ..d() }),
        ("triplaque", OptionsPertes { topologie: Some("triplaque".into()), hauteur: Some(0.4e-3), ..d() }),
        ("ancien", OptionsPertes { modele_conducteur: "ancien".into(), ..d() }),
        ("hammerstad", OptionsPertes { rugosite_rms: 1.5e-6, ..d() }),
        ("huray", OptionsPertes { modele_rugosite: "huray".into(), rayon_nodule: 0.5e-6, rapport_surface: 2.0, ..d() }),
        ("causal", OptionsPertes { dielectrique_causal: true, ..d() }),
        ("plan", OptionsPertes { rugosite_rms: 1e-6, rugosite_plan: Some(vec![RugositePlan { rugosite_rms: 3e-6, ..rp() }]), ..d() }),
        (
            "plans2",
            OptionsPertes {
                rugosite_plan: Some(vec![rp(), RugositePlan { modele_rugosite: "huray".into(), rayon_nodule: 1e-6, rapport_surface: 1.0, ..rp() }]),
                ..d()
            },
        ),
        ("mince", OptionsPertes { epaisseur: 0.2e-6, ..d() }),
        ("repli", d()),
    ];
    for (nom, o) in &cas {
        let z0 = if *nom == "repli" { 900.0 } else { 50.0 };
        let eps = if *nom == "triplaque" { 4.3 } else { 3.3 };
        let v: Vec<Value> = fs.iter().map(|&f| json!(line_losses_detaillees(z0, eps, 0.38e-3, 4.3, 0.02, f, o).unwrap())).collect();
        out.insert(format!("pertes/{nom}"), json!(v));
    }
    out.insert("pertes/nul".into(), json!(line_losses_detaillees(50.0, 3.3, 0.38e-3, 4.3, 0.02, 0.0, &d()).unwrap()));
    out.insert("pertes/ll".into(), json!(fs.iter().map(|&f| line_losses(87.0, 2.9, 0.15e-3, 4.3, 0.02, f, &d()).unwrap()).collect::<Vec<_>>()));
    out.insert("getsinger".into(), json!(fs.iter().map(|&f| dispersion_getsinger(50.0, 3.3, 4.3, 0.2e-3, f)).collect::<Vec<_>>()));
    out.insert("ds".into(), json!(fs.iter().map(|&f| djordjevic_sarkar(4.3, 0.02, 1e9, f, 1e3, 1e12).unwrap()).collect::<Vec<_>>()));
    out.insert(
        "rug".into(),
        json!(fs.iter().map(|&f| [facteur_rugosite(f, 2e-6, "hammerstad", 0.0, 0.0), facteur_rugosite(f, 0.0, "huray", 0.5e-6, 3.0)]).collect::<Vec<_>>()),
    );
    out.insert(
        "zair".into(),
        json!([
            _z_air_microruban(0.3e-3, 35e-6, 0.2e-3),
            _z_air_triplaque(0.2e-3, 35e-6, 0.5e-3),
            _hauteur_deduite(Topologie::Micro, 90.0, 0.3e-3, 35e-6),
            _hauteur_deduite(Topologie::Triplaque, 60.0, 0.2e-3, 35e-6),
            Some(largeur_effective(0.3e-3, 35e-6, 0.2e-3, 0.0)),
            Some(largeur_effective(0.3e-3, 35e-6, 0.2e-3, 0.5e-3)),
        ]),
    );
    // deux niveaux
    let cd = [Ruban { x: 0.0, y: 0.2e-3, w: 0.2e-3 }, Ruban { x: 0.1e-3, y: 0.4e-3, w: 0.3e-3 }, Ruban { x: 0.6e-3, y: 0.2e-3, w: 0.15e-3 }];
    out.insert("deux_niveaux/un_plan".into(), json!(section_deux_niveaux(&cd, None, 4.3, 30, 8).unwrap()));
    out.insert("deux_niveaux/deux_plans".into(), json!(section_deux_niveaux(&cd, Some(0.7e-3), 3.8, 20, 8).unwrap()));
    // discontinuites
    out.insert(
        "coude".into(),
        json!([(0.3e-3, 1.6e-3, 90.0), (0.4e-3, 0.2e-3, 45.0), (1e-3, 0.2e-3, -135.0), (1e-3, 0.2e-3, 0.0)].map(|(w, h, a)| elements_coude(w, h, 4.3, a))),
    );
    let j = Complex64::new(0.0, 1.0);
    let abcd: Vec<Value> = fs
        .iter()
        .map(|&f| {
            let (zc, g) = ligne_a_pertes(47.0, 0.8, 0.5, 2.0 * std::f64::consts::PI * f * 1.8 / 3e8);
            json!([
                mat(&abcd_via(1.6e-3, 0.25e-3, 0.55e-3, 4.3, f)),
                mat(&abcd_coude(0.3e-3, 0.2e-3, 4.3, f, 90.0)),
                mat(&abcd_via_boucle(0.8e-9, 90e-15, f)),
                mat(&abcd_via_complet(0.8e-9, 90e-15, f, 1e-4 * j, 0.002 + 3e-4 * j, 0.3 + 2.0 * j)),
                mat(&abcd_via_ligne(
                    1.5e-3, 0.25e-3, 0.8e-3, 4.3, f,
                    &OptionsViaLigne { longueur_moignon: 1e-3, tan_delta: 0.02, c_depart: 30e-15, c_arrivee: 20e-15, ..Default::default() }
                )),
                mat(&abcd_via_ligne(
                    1.5e-3, 0.25e-3, 0.8e-3, 4.3, f,
                    &OptionsViaLigne { longueur_moignon: 0.5e-3, cote_moignon: "depart".into(), pertes_conducteur: false, z_via: Some(55.0), ..Default::default() }
                )),
                mat(&cascade_to_s(&abcd_line(zc, g, 0.1), 50.0)),
                cx(admittance_moignon(1e-3, 0.25e-3, 0.8e-3, 4.3, 0.02, f)),
            ])
        })
        .collect();
    out.insert("abcd".into(), json!(abcd));
    let sig = Via { x: 0.0, y: 0.0, z1: 0.0, z2: 1.54e-3, rayon: 0.125e-3 };
    let ret = [
        Via { x: 0.6e-3, y: 0.0, z1: 0.0, z2: 1.54e-3, rayon: 0.125e-3 },
        Via { x: -0.3e-3, y: 0.8e-3, z1: 1.6e-3, z2: -0.1e-3, rayon: 0.15e-3 },
        Via { x: 2e-3, y: -1e-3, z1: 0.0, z2: 1.54e-3, rayon: 0.1e-3 },
    ];
    out.insert("boucle".into(), json!((0..4).map(|k| inductance_boucle_vias(&sig, &ret[..k], 1e-6).unwrap()).collect::<Vec<_>>()));
    out.insert(
        "via_div".into(),
        json!([
            json!(inductance_via(1.6e-3, 0.25e-3)),
            json!(capacite_pastille(0.55e-3, 1.6e-3, 4.3)),
            json!(mutuelle_partielle(0.0, 1e-3, 0.5e-3, 2e-3, 0.4e-3).unwrap()),
            json!(inductance_partielle_propre(0.0, 1.5e-3, 0.125e-3).unwrap()),
            json!(capacite_via_complete(0.25e-3, 0.55e-3, 0.8e-3, 4.3, &[35e-6, 35e-6], 0.2e-3, 0.0, true)),
            json!(impedance_moignon(0.25e-3, 0.8e-3, 4.3)),
            json!(frequence_resonance_moignon(1e-3, 4.3)),
            json!(capacite_paire_plans(2.5e-3, 0.7e-3, 4.3)),
            json!(inductance_etalement_via_anneau(0.7e-3, 0.125e-3, 5e-3)),
            json!(inductance_etalement_via_via(0.7e-3, 5e-3, 0.25e-3)),
            json!(inductance_etalement_via_via_2d(0.7e-3, 5e-3, 0.25e-3)),
            json!(impedance_paire_plans(1e-3, 50e-3, 4.3)),
        ]),
    );
    // traversee localisee
    let ponts = [pont(1.2e-9, 0.03, Some(100e-9)), pont(2e-9, 0.01, None), pont(0.8e-9, 0.05, Some(1e-9))];
    let v: Vec<Value> = std::iter::once(0.0)
        .chain(fs)
        .map(|f| {
            json!([
                cx(impedance_traversee_ponts(f, 0.5e-9, 150e-12, &ponts)),
                json!(repartition_traversee(f, 0.5e-9, 150e-12, &ponts)),
                cx(impedance_traversee_plans(f, 0.5e-9, 150e-12, Some(1.5e-9), 0.02, Some(100e-9))),
                json!(repartition_retour_plans(f, 0.5e-9, 150e-12, Some(1.5e-9), 0.02, Some(100e-9))),
                cx(impedance_traversee_plans(f, 0.5e-9, 150e-12, None, 0.0, None)),
            ])
        })
        .collect();
    out.insert("traversee/ponts".into(), json!(v));
    // cavite modale
    let ports = [(0.012, 0.017, 0.25e-3), (0.030, 0.020, 1e-3), (0.041, 0.005, 1e-3)];
    let cav = cavite_modale(50e-3, 40e-3, 0.71e-3, 4.37, 0.02, 150e-12, &ports, FREQ_MAX_MODES);
    let fc = [1e5, 1e7, 3e8, 1.4e9, 2.2e9, 5e9];
    let pm = Traversee {
        modal: Some(cav.clone()),
        ponts: vec![
            pont(1e-9, 0.03, Some(100e-9)),
            Pont { l: 0.7e-9, esr: 0.02, c: Some(10e-9), aval: Some(vec![pont(1e-9, 0.01, Some(1e-6)), pont(2e-9, 0.1, None)]) },
        ],
        c_plans: Some(150e-12),
        l_cavite: Some(0.5e-9),
        ..Default::default()
    };
    out.insert(
        "cavite_modale".into(),
        json!({"c": cav.c, "n_modes": cav.w_mn.len(), "w_mn": cav.w_mn, "inv_q": cav.inv_q, "l_queue": cav.l_queue, "f_premier": cav.f_premier,
               "z": impedance_traversee_vec(&fc, Some(&pm)).into_iter().map(cx).collect::<Vec<_>>(),
               "rep": fc.iter().map(|&f| repartition_traversee_param(f, Some(&pm))).collect::<Vec<_>>()}),
    );
    let loc = Traversee { c_plans: Some(150e-12), l_cavite: Some(0.5e-9), l_pont: Some(1.5e-9), c_pont: Some(100e-9), ..Default::default() };
    out.insert(
        "bilan".into(),
        json!([
            bilan_sante_transition(0.8e-9, 90e-15, None, &OptionsBilan::default()),
            bilan_sante_transition(50e-9, 90e-15, Some(&pm), &OptionsBilan { tr: 0.2e-9, retour_ferme: Some(false), ..Default::default() }),
            bilan_sante_transition(2e-9, 300e-15, Some(&loc), &OptionsBilan { z0: 60.0, y_depart: 2e-4 * j, retour_ferme: Some(true), ..Default::default() }),
        ]),
    );
    out.insert(
        "rayonnement".into(),
        json!([
            json!(rayonnement_boucle(12e6, 1e-9, 3e-6, 50.0, 3.3, 3.0, "B")),
            json!(rayonnement_boucle(100e3, 2e-9, 2e-4, 60.0, 3.3, 10.0, "a")),
            json!(rayonnement_boucle(5e9, 1e-10, 1e-6, 50.0, 3.3, 3.0, "B")),
            json!(spectre_signal_trapeze(25e6, 1e-9, 3.3, 4, None)),
        ]),
    );
    // cavite maillee
    let mut cg = |nom: &str, grille: &Grille, ports: &[(f64, f64, f64)], ponts: &[Pont], f_max: f64, echelle: f64| {
        let c = match cavite_grille(grille, 0.71e-3, 4.37, 0.02, ports, f_max, echelle) {
            Ok(c) => c,
            Err(e) => {
                out.insert(format!("grille/{nom}"), json!({ "erreur": e.0 }));
                return;
            }
        };
        let p = Traversee { modal: Some(c.clone()), ponts: ponts.to_vec(), c_plans: Some(c.c), l_cavite: Some(0.0), ..Default::default() };
        let (e, pw) = rayonnement_cavite(&fc, &p);
        out.insert(
            format!("grille/{nom}"),
            json!({"c": c.c, "noeuds": c.noeuds, "hors": c.hors, "ilots": c.ilots, "liens_page": c.liens_page, "bornes_ilot": c.bornes_ilot,
                   "sur_ilot": c.sur_ilot, "ecart_via_mm": c.ecart_via_mm, "convergence": c.convergence, "f_premier": c.f_premier,
                   "l_queue": c.l_queue, "n_modes": c.w_mn.len(), "w_mn": c.w_mn, "inv_q": c.inv_q, "q_rad_min": c.q_rad_min,
                   "z": impedance_traversee_vec(&fc, Some(&p)).into_iter().map(cx).collect::<Vec<_>>(), "e": e, "p": pw}),
        );
    };
    let un = [pont(1e-9, 0.03, Some(100e-9))];
    let plein = |nj: i64, ni: i64| -> Vec<LigneCellules> { (0..nj).map(|j| (j, vec![0, ni])).collect() };
    let rect = Grille { pas: 0.5, lignes: plein(34, 60), ..Default::default() };
    cg("rect_30x17", &rect, &[(0.012, 0.007, 0.25e-3), (0.022, 0.012, 1e-3)], &un, FREQ_MAX_MODES, 1.0);
    let petit = Grille { pas: 0.5, x0: 1.0, y0: -2.0, lignes: plein(11, 18), ..Default::default() };
    cg("petit_dense", &petit, &[(0.004, 0.0, 0.25e-3), (0.008, 0.002, 1e-3)], &un, FREQ_MAX_MODES, 1.0);
    let ell = Grille {
        pas: 0.5,
        lignes: (0..53).map(|j| (j, if (5..11).contains(&j) { vec![0, 12, 18, 70] } else if j < 23 { vec![0, 70] } else { vec![0, 31] })).collect(),
        ..Default::default()
    };
    cg("ell_trou", &ell, &[(0.004, 0.02, 0.25e-3), (0.030, 0.006, 1e-3)], &un, 4e9, 1.0);
    let carre = Grille { pas: 0.5, lignes: plein(60, 60), ..Default::default() };
    cg("carre_30", &carre, &[(0.012, 0.017, 0.25e-3), (0.020, 0.008, 1e-3)], &un, FREQ_MAX_MODES, 1.0);
    let ilots = Grille {
        pas: 0.5,
        lignes: (0..47).map(|j| (j, if (20..24).contains(&j) { vec![0, 40, 50, 81, 83, 86] } else { vec![0, 40, 50, 81] })).collect(),
        ..Default::default()
    };
    cg("ilots", &ilots, &[(0.005, 0.011, 0.25e-3), (0.031, 0.012, 1e-3)], &un, FREQ_MAX_MODES, 1.0);
    cg("ilots_x3", &ilots, &[(0.005, 0.011, 0.25e-3), (0.031, 0.012, 1e-3)], &un, FREQ_MAX_MODES, 3.0);
    cg("loin", &ilots, &[(0.060, 0.011, 0.25e-3)], &[], FREQ_MAX_MODES, 1.0);
    let bandes: Vec<LigneCellules> = (0..100).map(|j| (j, vec![0, 80, 90, 100])).collect();
    let reseau = Reseau {
        i1: -10,
        i2: 110,
        j1: -10,
        j2: 110,
        ep: vec![0.2, 0.71, 0.2],
        nets: vec![
            NetReseau {
                plan: 1,
                couches: vec![CoucheReseau { cu: 1, h: Some(0.71), lignes: bandes.clone(), fractions: vec![(10, 79, 0.4), (11, 79, 0.9)] }],
                pistes: vec![[0.0, 0.3, 24.0, 0.0, 31.0, 0.0], [0.0, 0.2, 24.0, -6.0, 31.0, -3.0]],
                vias: vec![(24.0, 0.0, vec![0, 1]), (31.0, 0.0, vec![0, 1]), (24.0, -6.0, vec![1, 0]), (31.0, -3.0, vec![0, 1])],
            },
            NetReseau { plan: 2, couches: vec![CoucheReseau { cu: 2, h: Some(0.71), lignes: plein(100, 100), fractions: vec![] }], ..Default::default() },
        ],
    };
    let (ii, jj) = _cellules_lignes(&bandes);
    let comp: Vec<usize> = ii.iter().map(|&i| usize::from(i >= 80)).collect();
    let li = _liens_par_reseau(&reseau, 0.5e-3, -15e-3, -25e-3, &ii, &jj, &comp, 0);
    let mut m = Map::new();
    for (k, v) in &li {
        let mut liens = v.liens.clone();
        liens.sort_by(|a, b| a.0.cmp(&b.0).then(a.1.cmp(&b.1)));
        m.insert(k.to_string(), json!({"liens": liens, "L": v.l, "L_somme": v.l_somme, "L_min": v.l_min, "peec": v.peec}));
    }
    let liens_reseau = Value::Object(m);
    let g = Grille { pas: 0.5, x0: -15.0, y0: -25.0, lignes: bandes, reseau: Some(reseau) };
    cg("reseau", &g, &[(33e-3, 0.0, 0.25e-3), (0.0, 0.0, 1e-3)], &un, FREQ_MAX_MODES, 1.0);
    out.insert("liens_reseau".into(), liens_reseau);
}
