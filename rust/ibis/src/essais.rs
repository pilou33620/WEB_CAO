//! Les essais : les assertions de python/test/banc-oeil.py qui visent ibis, et la non-regression
//! contre les references figees de essais/ (tirées de l'ancien python/ibis.py, avant son retrait).

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

// ---------------------------------------------------------------------------
// Les cas de python/test/banc-oeil.py qui visent ibis
// ---------------------------------------------------------------------------

/// Suffixes (m milli, M mega), « NA » renvoyant a typ, caractere de
/// commentaire change en cours de fichier, rapports de [Ramp], conventions
/// de signe des tableaux.
#[test]
fn la_lecture_ibis() {
    proche(nombre("1.5nH").unwrap().unwrap(), 1.5e-9, 1e-12, "n");
    proche(nombre("2M").unwrap().unwrap(), 2e6, 1e-12, "M mega");
    proche(nombre("2mA").unwrap().unwrap(), 2e-3, 1e-12, "m milli");
    proche(nombre("-3.3e-1V").unwrap().unwrap(), -0.33, 1e-12, "exposant");
    assert_eq!(nombre("NA"), Ok(None));
    assert!(nombre("1,5pF").is_err());
    let lu = lire(&fichier("cmos33.ibs"), "cmos33.ibs", false).unwrap();
    assert_eq!(lu.modeles.keys().collect::<Vec<_>>(), ["OUT33", "IN33"]);
    assert!(lu.ignores.contains(&"[Package]".to_string()));
    let m = &lu.modeles["OUT33"];
    assert!(m.type_ == "I/O" && m.c_comp == Some([Some(3e-12), Some(2.5e-12), Some(3.5e-12)]));
    proche(m.vinh.unwrap(), 2.0, 1e-12, "Vinh");
    let Rampe::Rapports(rr) = &m.rampe["r"] else { panic!("dV/dt_r") };
    assert_eq!(rr[0], Some((1.6, 0.6e-9)));
    let dernier = m.tableaux["pulldown"].last().unwrap();
    assert_eq!(dernier[2], dernier[1]);
    assert_eq!(lu.modeles["IN33"].c_comp, Some([Some(4e-12); 3]));
    let t = Tampon::new(m, "typ").unwrap();
    proche(t.v_pu, 3.3, 1e-12, "Vcc typ");
    proche(Tampon::new(m, "max").unwrap().v_pu, 3.6, 1e-12, "Vcc max");
    assert_eq!(Tampon::new(m, "moyen").unwrap_err().message, "Coin « moyen » inconnu.");
    // a l'etat haut a vide, la broche est a Vcc ; a l'etat bas, a 0
    proche(t.niveau(1.0, 0.0, None, 0.0), 3.3, 1e-6, "niveau haut");
    assert!(t.niveau(0.0, 1.0, None, 0.0).abs() < 1e-6);
    // un courant ENTRANT est positif : etat haut tire vers 0 V -> il sort
    assert!(t.i_total(0.0, 1.0, 0.0).0 < 0.0);
    assert!(t.i_statique(-1.0).0 < 0.0); // diode de masse : il sort
    assert!(est_emetteur(m) && !est_emetteur(&lu.modeles["IN33"]));
    // un fichier sans [Model] doit etre refuse
    let e = lire("[IBIS Ver] 5.0\n[Component] X\n", "", false).unwrap_err();
    assert_eq!((e.message.as_str(), e.conseil.as_str()), ("Aucun [Model] dans ce fichier IBIS.", "Le fichier est-il bien un .ibs ?"));
}

/// [Package] typ/min/max, [Pin] (« NA » renvoie a [Package]), [Diff Pin]
/// pris aussi par sa broche inverse, [Model Selector], et la diagonale
/// d'un [Package Model] (matrice pleine et creuse), qui prime ; ses
/// mutuelles sont dites. Sans `complet`, la lecture est celle de la 1.0.0.
#[test]
fn le_boitier_et_les_broches_se_lisent() {
    let txt = fichier("essai.ibs");
    assert!(lire(&txt, "", false).unwrap().ignores.contains(&"[Package]".to_string()));
    let lu = lire(&txt, "essai.ibs", true).unwrap();
    assert!(!lu.ignores.contains(&"[Package]".to_string()), "{:?}", lu.ignores);
    for (vu, attendu) in lu.boitier.unwrap()[L].unwrap().iter().zip([8e-9, 6e-9, 10e-9]) {
        proche(vu.unwrap(), attendu, 1e-12, "L_pkg");
    }
    assert_eq!(lu.ordre_broches, ["A1", "A2", "A3", "A4", "B1"]);
    // sans modele de boitier : [Pin] puis [Package], valeur par valeur
    let sans = Lu { modele_boitier: String::new(), ..lu.clone() };
    let rlc = |b: &Boitier, attendu: (f64, f64, f64)| {
        for (v, a) in [(b.r, attendu.0), (b.l, attendu.1), (b.c, attendu.2)] {
            proche(v, a, 1e-12, &format!("{attendu:?}"));
        }
    };
    let b = boitier_broche(&sans, "A1", "typ", None);
    rlc(&b, (0.05, 2e-9, 0.4e-12));
    assert_eq!(b.source, "[Pin]");
    rlc(&boitier_broche(&sans, "A2", "max", None), (0.3, 10e-9, 0.6e-12));
    rlc(&boitier_broche(&sans, "", "typ", None), (0.2, 8e-9, 1e-12));
    // le [Package Model] : sa diagonale prime, ses mutuelles se disent
    let b = boitier_broche(&lu, "A1", "typ", None);
    proche(b.l, 3e-9, 1e-12, "L du modele de boitier");
    proche(b.c, 0.7e-12, 1e-12, "C du modele de boitier (creuse)");
    assert!(b.r == 0.05 && b.source.contains("[Package Model] PKG_ESSAI"));
    assert!(b.notes[0].contains("k_L 0.19"), "{:?}", b.notes);
    proche(boitier_broche(&lu, "B1", "typ", None).l, 4e-9, 1e-12, "L de B1");
    let k = couplage_boitier(&lu.modeles_boitier["PKG_ESSAI"], "A1", Some("A2"), None);
    proche(k.l, 0.6 / (3.0f64 * 3.5).sqrt(), 1e-9, "k_L A1-A2");
    // [Diff Pin], dans les deux sens
    let p = paire_diff(&lu, "A1").unwrap();
    assert!(p.inverse == "A2" && p.vdiff == Some(0.1), "{p:?}");
    for (vu, attendu) in p.tdelay.iter().zip([40e-12, 30e-12, 50e-12]) {
        proche(*vu, attendu, 1e-12, "tdelay");
    }
    let q = paire_diff(&lu, "A2").unwrap();
    assert!(q.inverse == "A1" && q.tdelay[0] == -p.tdelay[0]);
    assert_eq!(paire_diff(&lu, "B1"), None);
    // les modeles des broches, selecteur compris
    assert_eq!(modele_broche(&lu, "A1", "").unwrap().0, "LIN");
    assert_eq!(modele_broche(&lu, "A4", "").unwrap(), ("LIN".into(), "LIN, premier du sélecteur SELECT".into()));
    assert_eq!(modele_broche(&lu, "A4", "LIN2").unwrap().0, "LIN2");
    assert_eq!(modele_broche(&lu, "A3", "").unwrap_err().message, "La broche A3 est POWER : elle n'a pas de tampon.");
    assert_eq!(modele_broche(&lu, "Z9", "").unwrap_err().message, "Pas de broche « Z9 » dans [Pin].");
}

const AMI_TX: &str = r#"(essai_tx
  (Description "Emetteur d'essai (FFE 3 prises)")
  (Reserved_Parameters
    (AMI_Version (Usage Info) (Type String) (Value "7.0"))
    (Init_Returns_Impulse (Usage Info) (Type Boolean) (Value True))
    (Tx_Rj (Usage Info) (Type Float) (Value 1.2e-12))
    (Tx_Dj (Usage Info) (Type Float) (Value 5e-12)))
  (Model_Specific
    (TX_FFE
      (Tap
        (-1 (Usage In) (Type Float) (Range -0.1 -0.25 0) (Description "pre"))
        (0 (Usage In) (Type Float) (Range 0.7 0.5 1.0))
        (1 (Usage In) (Type Float) (Range -0.2 -0.35 0))))
    (Swing (Usage In) (Type Float) (List 0.8 0.6 1.0) (Description "V"))))
"#;
const AMI_RX: &str = r#"(essai_rx
  (Reserved_Parameters
    (AMI_Version (Usage Info) (Type String) (Value "7.0"))
    (Rx_Rj (Usage Info) (Type Float) (Value 1.6e-12))
    (Rx_Receiver_Sensitivity (Usage Info) (Type Float) (Value 0.02)))
  (Model_Specific
    (CTLE (CTLE_Boost_dB (Usage In) (Type Float) (List 0 3 6 9)))
    (DFE (Taps (Usage In) (Type Integer) (Range 5 1 5))
         (Tap1 (Usage In) (Type Float) (Range 0 -0.08 0.08)))))
"#;

/// Un .ami en arbre : parametres reserves et propres au modele, Range,
/// List, Value, chaines entre guillemets. Les prises de FFE (-1, 0, 1)
/// donnent une FFE ramenee a sum |c| = 1 ; le nombre de prises du DFE et
/// leur plage, le DFE ; une liste de gains en dB, le CTLE (poles supposes) ;
/// Tx_Rj et Rx_Rj, la RJ en quadrature.
#[test]
fn un_fichier_ami_se_lit_et_propose_l_egaliseur() {
    let a = lire_ami(AMI_TX, "tx.ami").unwrap();
    assert!(a.modele == "essai_tx" && a.description.contains("FFE"));
    let ch = |c: &str| a.parametres.iter().find(|p| p.chemin == c).unwrap();
    assert_eq!(ch("Reserved_Parameters/AMI_Version").valeur, Some(Valeur::Texte("7.0".into())));
    assert_eq!(ch("Model_Specific/TX_FFE/Tap/-1").plage, Some((-0.25, 0.0)));
    assert_eq!(ch("Model_Specific/TX_FFE/Tap/-1").valeur, Some(Valeur::Nombre(-0.1)));
    assert_eq!(ch("Model_Specific/Swing").liste, Some(vec![Valeur::Nombre(0.8), Valeur::Nombre(0.6), Valeur::Nombre(1.0)]));
    let b = lire_ami(AMI_RX, "rx.ami").unwrap();
    let prop = proposer_egaliseur(Some(&a), Some(&b), 10e9).unwrap();
    let ffe = prop.ffe.clone().unwrap();
    proche(ffe.iter().map(|c| c.abs()).sum(), 1.0, 1e-3, "sum |c|");
    assert!(prop.ffe_principal == Some(1) && ffe[0] < 0.0, "{ffe:?}");
    assert!(prop.dfe_prises == Some(5) && prop.dfe_max == Some(0.08), "{prop:?}");
    assert_eq!(prop.ctle.as_ref().unwrap().adc_db, [-9.0, -6.0, -3.0, 0.0]);
    proche(prop.rj.unwrap(), 2e-12, 1e-9, "RJ en quadrature");
    proche(prop.dj.unwrap(), 5e-12, 1e-9, "DJ");
    assert_eq!(prop.sensibilite, Some(0.02));
    // releve sur ibis.py
    assert_eq!(
        dumps(&prop.json()),
        "{\"notes\": [\"FFE : 3 prises (rangs -1 à 1) tirées des valeurs par défaut de Model_Specific/TX_FFE/Tap…, ramenées à Σ|c| = 1.\", \
         \"DFE : 5 prise(s) d'après Model_Specific/DFE/Taps, amplitude bornée à 0.08 (lue telle quelle, en volts si le modèle les exprime ainsi).\", \
         \"CTLE : gains continus -9, -6, -3, -0 dB essayés, d'après Model_Specific/CTLE/CTLE_Boost_dB ; pôles SUPPOSÉS (fp1 = débit/4, fp2 = débit) — le .ami ne les donne pas.\", \
         \"RJ 2 ps rms : Tx_Rj et Rx_Rj en quadrature.\", \"DJ 5 ps c-c : somme de Tx_Dj, Tx_DCD, Rx_Dj et Rx_DCD présents.\"], \
         \"ffe\": [-0.1, 0.7, -0.2], \"ffe_principal\": 1, \"dfe_prises\": 5, \"dfe_max\": 0.08, \
         \"ctle\": {\"forme\": \"pcie3\", \"fp1\": 2500000000.0, \"fp2\": 10000000000.0, \"adc_db\": [-9.0, -6.0, -3.0, -0.0]}, \
         \"rj\": 2e-12, \"dj\": 5e-12, \"sensibilite\": 0.02}"
    );
    for (faux, message) in [
        ("(a (b (c)", "Fichier AMI incomplet : parenthèses non équilibrées."),
        ("(a))", "Parenthèse fermante en trop dans le fichier AMI."),
        ("rien", "Aucun arbre « (modèle ...) » dans le fichier AMI."),
        ("  ", "Fichier AMI vide."),
        ("(a \"b", "Chaîne entre guillemets non fermée dans le fichier AMI."),
    ] {
        assert_eq!(lire_ami(faux, "").unwrap_err().message, message);
    }
    // le renvoi [Algorithmic Model] du .ibs, en lecture complete
    let lu = lire(&fichier("riche.ibs"), "", true).unwrap();
    assert_eq!(lu.modeles["IO1"].ami.as_ref().unwrap()[0].bibliotheque, "tx.so");
    assert_eq!(lire(&fichier("riche.ibs"), "", false).unwrap().modeles["IO1"].ami, None);
}

/// `parametres_ami_in` : les parametres In et InOut, valeur par defaut,
/// sans les branches Reserved_Parameters / Model_Specific, surcharges par
/// le nom de la feuille ou le chemin, les inconnues dites ; les Out et Info
/// n'y vont pas. `lire_parametres_ami` relit ce qu'un modele rend, chaines
/// comprises. `reserve_ami` lit les booleens de la norme.
#[test]
fn la_chaine_de_parametres_ami_s_ecrit_et_se_relit() {
    let a = lire_ami(&fichier("ami_ffe.ami"), "ami_ffe.ami").unwrap();
    let (txt, _, _) = parametres_ami_in(Some(&a), None, None).unwrap();
    assert_eq!(txt, "(ffe_test (c0 0.7) (c1 -0.3) (echec 0))");
    let sur: Objet = [("c1".to_string(), Json::Flottant(-0.2)), ("zz".into(), Json::Entier(1)), ("Model_Specific/echec".into(), Json::Entier(1))]
        .into_iter()
        .collect();
    let (txt, appl, ign) = parametres_ami_in(Some(&a), Some(&sur), None).unwrap();
    assert_eq!(txt, "(ffe_test (c0 0.7) (c1 -0.2) (echec 1))");
    assert!(appl == ["c1", "echec"] && ign == ["zz"], "{appl:?} {ign:?}");
    let lu = lire_parametres_ami("(ffe_test (c0 0.7) (c1 -0.3) (taps 2) (B (x \"a b\") (y True)))");
    assert_eq!(dumps(&Json::Objet(lu)), "{\"c0\": 0.7, \"c1\": -0.3, \"taps\": 2.0, \"B/x\": \"a b\", \"B/y\": \"True\"}");
    assert!(lire_parametres_ami("").is_empty() && lire_parametres_ami("(a (b").is_empty());
    assert_eq!(reserve_ami(Some(&a), "Init_Returns_Impulse", Json::Nul), Json::Bool(true));
    assert_eq!(reserve_ami(Some(&a), "GetWave_Exists", Json::Nul), Json::Bool(true));
    assert_eq!(reserve_ami(Some(&a), "Ignore_Bits", Json::Nul), Json::Flottant(4.0));
    assert_eq!(reserve_ami(Some(&a), "Absent", "d".into()), Json::Texte("d".into()));
    // un arbre a branches : le chemin est garde, les mots de groupe non
    let tx = lire_ami(
        r#"(tx (Reserved_Parameters
        (AMI_Version (Usage Info) (Type String) (Value "7.0"))
        (Tx_Rj (Usage Info) (Type Float) (Value 1e-12)))
      (Model_Specific (TX_FFE (Tap (-1 (Usage In) (Type Float) (Range -0.1 -0.3 0))
                                    (0 (Usage InOut) (Type Float) (Range 0.7 0.5 1))))
                      (Swing (Usage In) (Type String) (List "0.8V" "1V"))))"#,
        "",
    )
    .unwrap();
    let sur: Objet = [("TX_FFE/Tap/-1".to_string(), Json::Flottant(-0.2))].into_iter().collect();
    let (txt, _, _) = parametres_ami_in(Some(&tx), Some(&sur), None).unwrap();
    assert_eq!(txt, "(tx (TX_FFE (Tap (-1 -0.2) (0 0.7))) (Swing \"0.8V\"))");
    // la bibliotheque : seulement sous une racine, seulement un .so/.dll
    for (brut, rac, message) in [
        ("x.so", &[][..], "Aucun dossier autorisé pour les bibliothèques AMI."),
        ("http://a/b.so", &["/tmp"], "Chemin de bibliothèque AMI invalide."),
        ("fichier.txt", &["/tmp"], "« fichier.txt » n'est pas une bibliothèque (.so, .dll, .dylib)."),
        ("", &["/tmp"], "Aucune bibliothèque AMI désignée."),
        ("/etc/hostname", &["/etc"], "« hostname » n'est pas une bibliothèque (.so, .dll, .dylib)."),
        ("../absent.so", &["/tmp"], "Bibliothèque AMI « ../absent.so » introuvable sous les dossiers autorisés (LIB, projets)."),
    ] {
        assert_eq!(chemin_bibliotheque_ami(brut, rac).unwrap_err().message, message);
    }
}

/// La bibliotheque AMI d'essai (essais/ami_ffe.c), compilee a la
/// volee : AMI_Init applique la FFE a l'impulsion, AMI_GetWave a la forme d'onde, bloc apres
/// bloc ; le chemin n'est accepte que sous une racine ; une bibliotheque sans AMI_Init n'est pas
/// un modele. Sans compilateur, le cas ne verifie que les refus.
#[test]
fn le_modele_ami_s_execute() {
    let d = std::env::temp_dir().join(format!("ami_essai_{}", std::process::id()));
    std::fs::create_dir_all(&d).unwrap();
    let so = d.join("ami_ffe.so");
    let source = format!("{}/essais/ami_ffe.c", env!("CARGO_MANIFEST_DIR"));
    let compile = std::process::Command::new("cc").args(["-shared", "-fPIC", "-O1", "-o"]).arg(&so).arg(&source).status();
    if compile.is_ok_and(|s| s.success()) {
        let racine = d.to_string_lossy().into_owned();
        let chemin = chemin_bibliotheque_ami("ami_ffe.so", &[&racine]).unwrap();
        assert_eq!(chemin_bibliotheque_ami(&chemin, &["", &racine]).unwrap(), chemin);
        assert!(chemin_bibliotheque_ami(&chemin, &["/usr"]).is_err());
        let a = lire_ami(&fichier("ami_ffe.ami"), "ami_ffe.ami").unwrap();
        let (params, _, _) = parametres_ami_in(Some(&a), None, None).unwrap();
        let mut m = ModeleAmi::new(&chemin).unwrap();
        assert!(m.getwave_existe && m.close_existe);
        let imp: Vec<f64> = (0..12).map(|k| (k * k) as f64).collect();
        let (ok, rendu, p_out, msg) = m.init(&imp, 25e-12, 100e-12, &params);
        assert!(ok && msg == "FFE d'essai : 4 ech./bit", "{msg}");
        assert_eq!(dumps(&Json::Objet(lire_parametres_ami(&p_out))), "{\"c0\": 0.7, \"c1\": -0.3, \"taps\": 2.0}");
        let ffe = |x: &[f64], avant: &[f64]| -> Vec<f64> {
            (0..x.len()).map(|i| 0.7 * x[i] + -0.3 * if i >= 4 { x[i - 4] } else { avant[i] }).collect()
        };
        assert_eq!(rendu, ffe(&imp, &[0.0; 4]));
        // deux blocs : l'etat (les 4 derniers echantillons) passe de l'un a l'autre
        let (ok, w1, horloges, _) = m.getwave(&imp[..8], 4).unwrap();
        assert!(ok && horloges.is_empty());
        assert_eq!(w1, ffe(&imp[..8], &[0.0; 4]));
        let (_, w2, _, p_out) = m.getwave(&imp[8..], 4).unwrap();
        assert_eq!(w2, ffe(&imp[8..], &imp[4..8]));
        assert_eq!(p_out, "(ffe_test (c0 0.7) (c1 -0.3) (taps 2))");
        m.fermer();
        m.fermer();
        // le repli : AMI_Init rend 0 et son message
        let sur: Objet = [("echec".to_string(), Json::Entier(1))].into_iter().collect();
        let (params, _, _) = parametres_ami_in(Some(&a), Some(&sur), None).unwrap();
        let mut m = ModeleAmi::new(&chemin).unwrap();
        let (ok, rendu, p_out, msg) = m.init(&imp, 25e-12, 100e-12, &params);
        assert!(!ok && rendu == imp && p_out.is_empty() && msg == "echec demande par le banc");
    }
    let absent = d.join("absent.so").to_string_lossy().into_owned();
    let e = ModeleAmi::new(&absent).err().unwrap();
    assert!(e.message.starts_with("La bibliothèque AMI « absent.so » ne se charge pas : "), "{}", e.message);
    assert!(e.message.contains("absent.so: cannot open shared object file") || !cfg!(target_os = "linux"), "{}", e.message);
    // une bibliotheque sans AMI_Init n'est pas un modele
    for libm in ["/lib/x86_64-linux-gnu/libm.so.6", "/usr/lib64/libm.so.6", "/lib/aarch64-linux-gnu/libm.so.6"] {
        if std::path::Path::new(libm).exists() {
            let e = ModeleAmi::new(libm).err().unwrap();
            assert_eq!(e.message, "La bibliothèque « libm.so.6 » n'a pas de fonction AMI_Init : ce n'est pas un modèle AMI.");
        }
    }
    let _ = std::fs::remove_dir_all(&d);
}

fn ecart_max<const N: usize>(a: &[[[Complex64; N]; N]], b: &[[[Complex64; N]; N]]) -> f64 {
    a.iter().flatten().flatten().zip(b.iter().flatten().flatten()).fold(0.0, |m, (x, y)| m.max((x - y).norm()))
}

fn module_max<const N: usize>(a: &[[[Complex64; N]; N]]) -> f64 {
    a.iter().flatten().flatten().fold(0.0, |m, x| m.max(x.norm()))
}

fn linspace(a: f64, b: f64, n: usize) -> Vec<f64> {
    (0..n).map(|k| a + (b - a) * k as f64 / (n - 1) as f64).collect()
}

/// Deux broches de paire a 6 nH, couplees a 3 nH et 0,3 pF : le mode
/// impair voit L - L_m = 3 nH et C + C_m = 1,3 pF. La mutuelle est lue,
/// le Sdd21 du boitier monte. Sans mutuelle, le boitier couple est
/// exactement les deux boitiers brin par brin.
#[test]
fn la_mutuelle_du_boitier() {
    let lu = lire(&fichier("mutuelle.ibs"), "", true).unwrap();
    let mu = mutuelle_paire(&lu, "A1", "A2").unwrap();
    proche(mu.l, 3e-9, 1e-12, "L_m");
    proche(mu.c, 0.3e-12, 1e-12, "C_m");
    assert_eq!(mutuelle_paire(&lire(&fichier("mutuelle_sans.ibs"), "", true).unwrap(), "A1", "A2"), None);
    let bt = boitier_broche(&lu, "A1", "typ", None);
    let f = linspace(1e8, 1e10, 50);
    let m_c = abcd_boitier_paire(&f, Some(&bt), Some(&bt), Some(&mu), "emission");
    let m_0 = abcd_boitier_paire(&f, Some(&bt), Some(&bt), None, "emission");
    let seul = abcd_boitier(&f, Some(&bt), "emission").unwrap();
    let m_s = abcd_par_brin(Some(&seul), Some(&seul), f.len());
    assert!(ecart_max(&m_0, &m_s) < 1e-12);
    // Sdd21 = (S31 - S32 - S41 + S42) / 2, acces (1p, 1n, 2p, 2n)
    let sdd = |m: &[M4]| -> Vec<f64> {
        s_depuis_abcd_4(m, 50.0).unwrap().iter().map(|s| ((s[2][0] - s[2][1] - s[3][0] + s[3][1]) / 2.0).norm()).collect()
    };
    let (sdd_c, sdd_0) = (sdd(&m_c), sdd(&m_0));
    assert!(sdd_c[10..].iter().zip(&sdd_0[10..]).all(|(c, z)| c > z), "{:?}", (sdd_c[49], sdd_0[49]));
    // la moyenne en mode impair : L - L_m et C + C_m
    let impair = mode_impair_couple(&m_c);
    let attendu = abcd_boitier(&f, Some(&Boitier::rlc(0.0, 6e-9, 0.65e-12)), "emission").unwrap();
    assert!(ecart_max(&impair, &attendu) < 1e-9);
}

/// Le boitier de la paire A1/A2 couple a deux VOISINES : B1 (un signal,
/// au repos, ferme sur 50 ohms aux deux bouts) et G1 (une masse, en
/// court-circuit). Elles sont comptees (`abcd_boitier_couple`) :
///   · voisines ouvertes, c'est exactement le boitier de la paire couplee
///     (`abcd_boitier_paire`, mutuelle de la paire seule) ;
///   · une seule broche et une voisine en court-circuit, sans resistance :
///     L_eff = L - M^2 / L_v, a 1e-6.
#[test]
fn les_mutuelles_hors_de_la_paire_sont_comptees() {
    let lu = lire(&fichier("voisines.ibs"), "", true).unwrap();
    let cpl = voisins_boitier(&lu, &["A1", "A2"]).unwrap();
    assert_eq!(cpl.voisines, ["B1", "G1"]);
    assert_eq!(dumps(&cpl.json()["genres"]), "{\"B1\": \"signal\", \"G1\": \"court\"}");
    let f = linspace(1e8, 1e10, 20);
    // voisines ouvertes, couplees en self seulement (en capacite, une
    // voisine ouverte est un conducteur FLOTTANT, qui change la capacite
    // vue -- C - C_m^2 / C_v -- et c'est juste) : aucun courant n'y passe,
    // c'est la paire couplee d'avant, exactement
    let mut ouv = cpl.clone();
    for g in ouv.genres.values_mut() {
        *g = "ouvert".into();
    }
    ouv.mutuelles[C].retain(|(a, b), _| [a.as_str(), b.as_str()] == ["A1", "A2"] || [a.as_str(), b.as_str()] == ["A2", "A1"]);
    let bt = boitier_broche(&lu, "A1", "typ", None);
    let mu = mutuelle_paire(&lu, "A1", "A2");
    for sens in ["emission", "reception"] {
        let m_c = en_m4(&abcd_boitier_couple(&f, &ouv, sens, 50.0).unwrap());
        let m_p = abcd_boitier_paire(&f, Some(&bt), Some(&bt), mu.as_ref(), sens);
        let e = ecart_max(&m_c, &m_p) / module_max(&m_p);
        assert!(e < 1e-9, "{sens} {e}");
    }
    // une broche, la masse en court-circuit : L - M^2 / L_v
    let mut seul = voisins_boitier(&lu, &["A1"]).unwrap();
    seul.conducteurs = vec!["A1".into(), "G1".into()];
    seul.voisines = vec!["G1".into()];
    let m1 = en_m2(&abcd_boitier_couple(&f, &seul, "emission", 50.0).unwrap());
    let l_eff = 6e-9 - 2e-9f64.powi(2) / 4e-9;
    let attendu = abcd_boitier(&f, Some(&Boitier::rlc(0.0, l_eff, 1e-12)), "emission").unwrap();
    let e = m1.iter().flatten().flatten().zip(attendu.iter().flatten().flatten()).fold(0.0f64, |m, (x, y)| m.max((x - y).norm() / y.norm()));
    assert!(e < 1e-5, "{e}");
    // un boitier par sections n'a pas de mutuelles (BIRD 54)
    assert_eq!(voisins_boitier(&lire(&fichier("sections_banc.ibs"), "", true).unwrap(), &["A1"]), None);
}

/// [Number Of Sections] et ses [Pin Numbers] : chaque broche ses
/// sections (Len, et par unite de longueur ; Len = 0 localisee ; une
/// derivation Fork/Endfork). Les totaux se lisent. Une section de
/// longueur l rejoint le modele localise de memes totaux quand l tend vers
/// zero (l'ecart decroit comme l).
#[test]
fn un_boitier_par_sections_est_une_ligne() {
    let lu = lire(&fichier("sections_banc.ibs"), "", true).unwrap();
    let mb = &lu.modeles_boitier["PKG_S"];
    assert_eq!(mb.broches, ["A1", "A2"]);
    assert_eq!(mb.sections_broche["A1"].len(), 3);
    assert!(matches!(mb.sections_broche["A2"][1], Section::Fourche(_)));
    let bt = boitier_broche(&lu, "A1", "typ", None);
    proche(bt.l, 3e-9, 1e-12, "L totale");
    proche(bt.c, 1.2e-12, 1e-12, "C totale");
    assert!(bt.source.contains("section") && bt.sections.is_some());
    let b2 = boitier_broche(&lu, "A2", "typ", None);
    proche(b2.c, 1.2e-12, 1e-12, "C totale, derivation comprise");
    // l'ordre du fichier va du die (fil de cablage) a la broche : vue de la
    // broche, la capacite de la broche vient d'abord (A = 1), puis L
    let f = [5e9];
    let sec = |len: f64, l: f64, c: f64| Section::Ligne { len, r: 0.0, l, c, g: 0.0 };
    let m = abcd_sections(&f, &[sec(0.0, 1e-9, 0.0), sec(0.0, 0.0, 1e-12)])[0];
    let (z, y) = (Complex64::new(0.0, 2.0 * PI * 5e9 * 1e-9), Complex64::new(0.0, 2.0 * PI * 5e9 * 1e-12));
    assert!((m[0][0] - 1.0).norm() < 1e-12 && (m[1][1] - (y * z + 1.0)).norm() < 1e-12, "{m:?}");
    // la limite localisee
    let un: M2 = [[1.0.into(), 0.0.into()], [0.0.into(), 1.0.into()]];
    let ecarts: Vec<f64> = [1.0, 0.1, 0.01]
        .iter()
        .map(|lg| {
            let dist = abcd_sections(&f, &[sec(*lg, 0.25e-9, 0.1e-12)]);
            let loc = abcd_sections(&f, &[sec(0.0, 0.25e-9 * lg, 0.1e-12 * lg)]);
            ecart_max(&dist, &loc) / ecart_max(&loc, &[un])
        })
        .collect();
    assert!(ecarts[1] < 0.15 * ecarts[0] && ecarts[2] < 0.15 * ecarts[1], "{ecarts:?}");
}
