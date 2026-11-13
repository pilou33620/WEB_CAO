//! Les essais : les assertions de python/test/banc-oeil.py qui visent ibis, et la non-regression
//! contre les references figees de essais/ (voir essais/references.py, qui les tire du Python).

use std::collections::HashMap;
use std::f64::consts::PI;

use crate::tampon::interp;
use crate::*;

fn fichier(nom: &str) -> String {
    std::fs::read_to_string(format!("{}/essais/{}", env!("CARGO_MANIFEST_DIR"), nom)).unwrap()
}

fn proche(vu: f64, attendu: f64, tol: f64, quoi: &str) {
    assert!((vu - attendu).abs() <= tol * attendu.abs().max(1.0), "{quoi} : {vu} au lieu de {attendu}");
}

// ---------------------------------------------------------------------------
// La non-regression numerique
// ---------------------------------------------------------------------------

struct References(HashMap<String, (bool, Vec<f64>)>, std::cell::Cell<usize>);

impl References {
    fn lire() -> References {
        let mut m = HashMap::new();
        for ligne in fichier("numerique.txt").lines() {
            let mut mots = ligne.split(' ');
            let nom = mots.next().unwrap();
            let (exact, nom) = match nom.strip_prefix("exact:") {
                Some(n) => (true, n),
                None => (false, nom),
            };
            m.insert(nom.to_string(), (exact, mots.filter(|x| !x.is_empty()).map(|x| x.parse().unwrap()).collect()));
        }
        References(m, std::cell::Cell::new(0))
    }

    fn entree(&self, nom: &str) -> &[f64] {
        self.1.set(self.1.get() + 1);
        &self.0[&format!("entree:{nom}")].1
    }

    fn verifier(&self, nom: &str, vu: &[f64]) {
        let (exact, attendu) = &self.0[nom];
        self.1.set(self.1.get() + 1);
        assert_eq!(vu.len(), attendu.len(), "{nom} : longueur");
        let echelle = attendu.iter().fold(1.0f64, |m, x| m.max(x.abs()));
        for (k, (a, b)) in vu.iter().zip(attendu).enumerate() {
            if *exact {
                assert!(a.to_bits() == b.to_bits() || (a.is_nan() && b.is_nan()), "{nom}[{k}] : {a:e} au lieu de {b:e}");
            } else {
                assert!((a - b).abs() <= 1e-9 * echelle, "{nom}[{k}] : {a:e} au lieu de {b:e} (echelle {echelle:e})");
            }
        }
    }
}

fn plat<const N: usize>(m: &[[[Complex64; N]; N]]) -> Vec<f64> {
    m.iter().flatten().flatten().flat_map(|z| [z.re, z.im]).collect()
}

fn plat_libre(m: &[Mat]) -> Vec<f64> {
    m.iter().flatten().flatten().flat_map(|z| [z.re, z.im]).collect()
}

fn fois(a: &[M2], b: &[M2]) -> Vec<M2> {
    a.iter()
        .zip(b)
        .map(|(a, b)| std::array::from_fn(|i| std::array::from_fn(|j| a[i][0] * b[0][j] + a[i][1] * b[1][j])))
        .collect()
}

/// boitier, ligne (55 ohms, 0,3 ns), charge (10 kohms // 1 pF)
fn canal(fr: &[f64]) -> Vec<M2> {
    let (un, zero) = (Complex64::new(1.0, 0.0), Complex64::new(0.0, 0.0));
    let ligne: Vec<M2> = fr
        .iter()
        .map(|f| {
            let th = 2.0 * PI * f * 0.3e-9;
            [[th.cos().into(), Complex64::new(0.0, 55.0) * th.sin()], [Complex64::new(0.0, 1.0) * th.sin() / 55.0, th.cos().into()]]
        })
        .collect();
    let ch: Vec<M2> = fr.iter().map(|f| [[un, zero], [Complex64::new(1e-4, 2.0 * PI * f * 1e-12), un]]).collect();
    let bt = Boitier::rlc(0.5, 3e-9, 1e-12);
    fois(&fois(&abcd_boitier(fr, Some(&bt), "emission").unwrap(), &ligne), &ch)
}

#[test]
fn les_references_numeriques_du_python() {
    let r = References::lire();
    // -- les fonctions de numpy refaites a la main
    for n in [1, 2, 3, 4, 5, 7, 9, 23, 60] {
        let (xp, fp, x) = (r.entree(&format!("interp_xp_{n}")), r.entree(&format!("interp_fp_{n}")), r.entree(&format!("interp_x_{n}")));
        r.verifier(&format!("interp_{n}"), &interp(x, xp, fp));
    }
    for n in [0, 1, 5, 7, 8, 9, 17, 100, 128, 129, 300, 1000] {
        r.verifier(&format!("somme_{n}"), &[crate::abcd::somme(r.entree(&format!("somme_{n}")))]);
    }
    // -- les boitiers en frequence
    let f: Vec<f64> = (0..20).map(|k| 1e8 * (1 + 5 * k) as f64).collect();
    let lu = lire(&fichier("riche.ibs"), "riche.ibs", true).unwrap();
    let ls = lire(&fichier("sections.ibs"), "sections.ibs", true).unwrap();
    r.verifier("sections_a2", &plat(&abcd_sections(&f, &ls.modeles_boitier["PKG_S"].sections_broche["A2"])));
    let bp = boitier_broche(&lu, "A1", "typ", Some("A2"));
    let bn = boitier_broche(&lu, "A2", "typ", Some("A1"));
    let mu = mutuelle_paire(&lu, "A1", "A2");
    let mut paire = Vec::new();
    for sens in ["emission", "reception"] {
        let a1 = boitier_broche(&lu, "A1", "typ", None);
        r.verifier(&format!("boitier_a1_{sens}"), &plat(&abcd_boitier(&f, Some(&a1), sens).unwrap()));
        let s1 = boitier_broche(&ls, "A1", "typ", None);
        r.verifier(&format!("boitier_sections_{sens}"), &plat(&abcd_boitier(&f, Some(&s1), sens).unwrap()));
        paire = abcd_boitier_paire(&f, Some(&bp), Some(&bn), mu.as_ref(), sens);
        r.verifier(&format!("paire_{sens}"), &plat(&paire));
        let cpl = voisins_boitier(&lu, &["A1", "A2"]).unwrap();
        let couple = abcd_boitier_couple(&f, &cpl, sens, 50.0).unwrap();
        r.verifier(&format!("couple_{sens}"), &plat_libre(&couple));
        r.verifier(&format!("impair_{sens}"), &plat(&mode_impair_couple(&en_m4(&couple))));
        let b1 = abcd_boitier_couple(&f, &voisins_boitier(&lu, &["B1"]).unwrap(), sens, 75.0).unwrap();
        r.verifier(&format!("couple_b1_{sens}"), &plat(&en_m2(&b1)));
    }
    let m_dd = abcd_boitier(&f, Some(&bp), "emission").unwrap();
    let m_cc = abcd_boitier(&f, Some(&bn), "reception").unwrap();
    let brins = abcd_brins(&m_dd, &m_cc);
    r.verifier("brins", &plat(&brins));
    r.verifier("par_brin", &plat(&abcd_par_brin(Some(&m_dd), None, f.len())));
    let y: M2 = [[0.012.into(), (-0.002).into()], [(-0.002).into(), 0.012.into()]];
    r.verifier("charges", &plat(&charger_brins(&brins, &vec![y; f.len()])));
    r.verifier("s4", &plat(&s_depuis_abcd_4(&charger_brins(&paire, &vec![y; f.len()]), 50.0).unwrap()));
    r.verifier("s2", &s_depuis_abcd(&m_dd, 50.0).iter().flatten().flat_map(|z| [z.re, z.im]).collect::<Vec<_>>());

    // -- le passage en temporel
    let (n, df, dt, tr) = (400, 25e6, 10e-12, 60e-12);
    let freqs: Vec<f64> = (1..=n).map(|k| df * k as f64).collect();
    let s_f = s_depuis_abcd(&canal(&freqs), 50.0);
    let s_dc = s_depuis_abcd(&canal(&[0.0]), 50.0);
    let mut reps = Vec::new();
    for i in 0..4 {
        let (h, inst) = reponses_impulsionnelles(&freqs, &s_f[i], s_dc[i][0].re, dt, None, tr).unwrap();
        r.verifier(&format!("reponse_{i}"), &h);
        r.verifier(&format!("instantane_{i}"), &[inst]);
        reps.push(h);
    }
    r.verifier("tronquer", &[tronquer(&reps, 1e-7) as f64, tronquer(&reps, 1e-3) as f64]);

    // -- les commandes
    let mut cmds = HashMap::new();
    for (nom, coin) in [("IO1", "typ"), ("IO1", "max"), ("IO2", "min")] {
        let m = &lu.modeles[nom];
        let t = Tampon::new(m, coin).unwrap();
        let c = commandes(m, &t, dt).unwrap();
        for (sens, k) in [("montant", &c.montant), ("descendant", &c.descendant)] {
            r.verifier(&format!("ku_{nom}_{coin}_{sens}"), &k.0);
            r.verifier(&format!("kd_{nom}_{coin}_{sens}"), &k.1);
        }
        r.verifier(&format!("fronts_{nom}_{coin}"), &[duree_front(&c.montant, dt), instant_mi_front(&c.montant, dt)]);
        cmds.insert((nom, coin), (t, c));
    }
    assert_eq!(cmds[&("IO1", "typ")].1.source, "montant : deux formes d'onde ; descendant : une forme d'onde (Kd = 1 − Ku)");
    assert_eq!(cmds[&("IO2", "min")].1.source, "montant : [Ramp] seule, Ku linéaire ; descendant : [Ramp] seule, Ku linéaire");
    let (t_lin, c_lin) = tampon_lineaire(30.0, 1.0, 0.0, 100e-12, dt, 1e-12).unwrap();
    r.verifier("ku_lineaire", &c_lin.montant.0);
    r.verifier("fronts_lineaire", &[duree_front(&c_lin.montant, dt), instant_mi_front(&c_lin.montant, dt)]);

    // -- la liaison dans le temps
    let bits = [0, 1, 0, 1, 1, 0, 0, 1];
    let lr = tronquer(&reps, 1e-7);
    let court: [Vec<f64>; 4] = std::array::from_fn(|i| reps[i][..lr].to_vec());
    let rx = Tampon::new(&lu.modeles["IN1"], "typ").unwrap();
    for (nom, (t, c), rx_) in [
        ("io1", cmds[&("IO1", "typ")].clone(), Some(rx.clone())),
        ("io2", cmds[&("IO2", "min")].clone(), None),
        ("lin", (t_lin, c_lin), Some(rx.clone())),
    ] {
        let (v1, v2) = Liaison::new(court.clone(), 50.0, dt, t, c, rx_, 0.1).simuler(&bits, 20, 200e-12);
        r.verifier(&format!("liaison_{nom}_v1"), &v1);
        r.verifier(&format!("liaison_{nom}_v2"), &v2);
    }

    // -- la paire
    let plus_haut: Vec<f64> = freqs.iter().map(|f| f * 1.1).collect();
    let ligne4 = abcd_brins(&canal(&freqs), &canal(&plus_haut));
    let s4 = s_depuis_abcd_4(&charger_brins(&ligne4, &vec![y; n]), 50.0).unwrap();
    let s4_0 = s_depuis_abcd_4(&charger_brins(&abcd_brins(&canal(&[0.0]), &canal(&[0.0])), &[y]), 50.0).unwrap();
    let mut reps4: [[Vec<f64>; 4]; 4] = std::array::from_fn(|i| {
        std::array::from_fn(|j| {
            let colonne: Vec<Complex64> = s4.iter().map(|m| m[i][j]).collect();
            reponses_impulsionnelles(&freqs, &colonne, s4_0[0][i][j].re, dt, None, tr).unwrap().0
        })
    });
    let l4 = tronquer(&reps4.iter().flatten().collect::<Vec<_>>(), 1e-7);
    r.verifier("tronquer4", &[l4 as f64]);
    for h in reps4.iter_mut().flatten() {
        h.truncate(l4);
    }
    let (t1, c1) = cmds[&("IO1", "typ")].clone();
    let (t2, c2) = cmds[&("IO1", "max")].clone();
    for (nom, rxs, dec) in [
        ("sans", [None, None], [0.0, 0.0]),
        ("diodes", [Some(rx.clone()), Some(rx.clone())], [0.0, 33e-12]),
        ("avance", [None, Some(rx.clone())], [-17e-12, 0.0]),
    ] {
        let lp = LiaisonPaire::new(reps4.clone(), 50.0, dt, [t1.clone(), t2.clone()], [c1.clone(), c2.clone()], rxs, dec).unwrap();
        r.verifier(&format!("paire_{nom}"), &lp.simuler(&bits, 20, 200e-12).concat());
    }
    assert_eq!(r.1.get(), r.0.len(), "des references ne sont pas verifiees");
}
