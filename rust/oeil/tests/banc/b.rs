//! Les modeles IBIS (2.0.0), les vias de la paire, le boitier, les broches, la paire de
//! tampons et le fichier .ami (2.1.0).

use crate::*;
use em::simulation_em as se;

fn ibis_o(base: &Json, cle: &str, texte: &str, ajouts: Json) -> Json {
    avec(base, obj! {cle => avec(&obj! {"texte" => texte}, ajouts)})
}

/// Courbes V-I droites et front gaussien : le tampon IBIS EST le
/// generateur de Thevenin. Ligne ouverte attaquee par 30 ohms -- les echos
/// reviennent sur le tampon et y repartent : c'est la boucle tampon-canal
/// qui est eprouvee. Le lissage du canal (un front de la moitie de celui
/// du tampon) se compose en quadrature avec le front.
fn un_tampon_ibis_lineaire_rend_l_oeil_lineaire() {
    let sigma = 40e-12;
    let o = ibis_o(&j(r#"{"debit": 1e9, "r_charge": 0.0, "c_charge": 0.0}"#), "ibis_emetteur", &_ibis_lineaire(&Lin { sigma, ..Lin::default() }), obj! {});
    let (r, nl) = _oeil_ibis(&o, 1e-9, 1.0, 50.0, None);
    let nl = nl.unwrap();
    let tr_eq = 2.5631 * sigma * (1.0 + LISSAGE_SUR_FRONT.powi(2)).sqrt();
    let r2 = _canal(30.0, 0.0, C { tr: tr_eq, pertes: 1.0, ..C::default() }, obj! {}, None);
    for k in ["hauteur_prbs", "hauteur_pire", "niveau_1", "niveau_0", "principal"] {
        assert!((mes(&r, k) - mes(&r2, k)).abs() < 0.01, "{k} {} {}", mes(&r, k), mes(&r2, k));
    }
    proche(mes(&r, "retard"), mes(&r2, "retard"), 0.01, "retard");
    assert!(n(&nl.infos["asymetrie"]) < 1e-3);
}

/// Le pas de temps ne sait rien de la linearite : sur un tampon
/// lineaire, la forme d'onde PRBS qu'il rend doit etre, au pas pres, la
/// somme des reponses a un echelon qu'il rend aussi.
fn la_simulation_temporelle_est_la_superposition_si_tout_est_lineaire() {
    let o = ibis_o(&j(r#"{"debit": 1e9, "r_charge": 0.0, "c_charge": 1e-12}"#), "ibis_emetteur", &_ibis_lineaire(&Lin { c_comp: 1e-12, ..Lin::default() }), obj! {});
    let mut p = ok(_params(&o, None));
    let ctx = ok(preparer_ibis(&o, &mut p)).unwrap();
    let (df, np_, _, _) = grille(1e9, ctx.tr_lissage, 1e-9, 4.0 * p.tr);
    let f = frequences(df, np_);
    let mut nl = ok(simuler_non_lineaire(&ctx, &f, &ligne_ideale(&f, 50.0, 1e-9, 1.0), &p, 50.0));
    let bits = ok(prbs(7));
    let y = ok((nl.onde)(&bits));
    let spu = ECHANTILLONS_UI;
    let dt_e = 1e-9 / spu as f64;
    let s = &nl.s;
    let ts: Vec<f64> = (0..s.len()).map(|i| i as f64 * nl.dt).collect();
    let per = bits.len() as f64 * 1e-9;
    let ampl = nl.v_haut - nl.v_bas;
    // avant la premiere transition comptee, l'etat du dernier bit
    let mut sup = vec![nl.v_bas + ampl * bits[bits.len() - 1] as f64; y.len()];
    // la sequence est periodique : les transitions des periodes d'avant
    for rep in -6..1 {
        for i in 0..bits.len() {
            let prec = bits[(i + bits.len() - 1) % bits.len()];
            if bits[i] != prec {
                let signe = if bits[i] != 0 { 1.0 } else { -1.0 };
                let t0 = i as f64 * 1e-9 + rep as f64 * per;
                let t: Vec<f64> = (0..y.len()).map(|k| k as f64 * dt_e - t0).collect();
                for (a, b) in sup.iter_mut().zip(interp(&t, &ts, s, 0.0, s[s.len() - 1])) {
                    *a += signe * ampl * b;
                }
            }
        }
    }
    let ecart = maxi(y.iter().zip(&sup).map(|(a, b)| (a - b).abs()));
    assert!(ecart < 2e-3 * ampl, "{ecart}");
}

/// Un recepteur IBIS sans diode n'est que son C_comp : meme oeil, au
/// chiffre pres, que la capacite de charge saisie a la main.
fn le_c_comp_du_recepteur_vaut_une_capacite_de_charge() {
    let txt = CMOS33.replace("[GND Clamp]\n-3.3 -300mA NA NA\n-1.0 -50mA NA NA\n-0.7 -5mA NA NA\n-0.3 0 NA NA\n0 0 NA NA\n", "");
    let o = ibis_o(&j(r#"{"debit": 1e9, "tr": 100e-12, "v_haut": 1.0, "v_bas": 0.0, "r_source": 30.0, "r_charge": 0.0}"#),
                   "ibis_recepteur", &txt, obj! {"modele" => "IN33"});
    let (r, nl) = _oeil_ibis(&o, 1e-9, 1.0, 50.0, None);
    assert!(nl.is_none());
    let r2 = _canal(30.0, 0.0, C { tr: 100e-12, pertes: 1.0, ..C::default() }, obj! {"c_charge" => 4e-12}, None);
    // (a la grille pres : celle de l'IBIS compte aussi le front du tampon)
    for k in ["hauteur_prbs", "hauteur_pire", "v_max_vu"] {
        proche(mes(&r, k), mes(&r2, k), 1e-3, k);
    }
}

/// Ligne ouverte, tampon fort : la broche deborde de pres de deux fois
/// l'excursion. Les diodes du recepteur (franches, 0,5 V de seuil) la
/// tiennent a quelques dixiemes de volt des rails.
fn les_diodes_du_recepteur_ecretent() {
    let vcc = 1.0;
    let base = ibis_o(&j(r#"{"debit": 1e9, "r_charge": 0.0, "c_charge": 0.0}"#), "ibis_emetteur", &_ibis_lineaire(&Lin { r: 10.0, vcc, ..Lin::default() }), obj! {});
    let (r0, _) = _oeil_ibis(&base, 1e-9, 0.2, 50.0, None);
    let avec_rx = ibis_o(&base, "ibis_recepteur", &_ibis_lineaire(&Lin { r: 10.0, vcc, clamps: true, nom: "RX", ..Lin::default() }), obj! {});
    let (r1, nl) = _oeil_ibis(&avec_rx, 1e-9, 0.2, 50.0, None);
    let nl = nl.unwrap();
    assert!(nl.infos["recepteur"]["diodes"].vrai());
    assert!(mes(&r0, "v_max_vu") > vcc + 0.55, "{}", mes(&r0, "v_max_vu"));
    assert!(mes(&r1, "v_max_vu") < vcc + 0.55, "{}", mes(&r1, "v_max_vu"));
    assert!(mes(&r1, "v_min_vu") > -0.55, "{}", mes(&r1, "v_min_vu"));
    assert!(mes(&r0, "v_min_vu") < -0.55, "{}", mes(&r0, "v_min_vu"));
    // les niveaux etablis ne bougent pas : les diodes ne conduisent pas
    proche(nl.v_haut, vcc, 1e-3, "niveau haut etabli");
}

/// Le tampon CMOS de [Ramp] seule, au coin typ : niveaux 0 et 3,3 V a
/// vide, fronts montant et descendant differents (la note le dit), et le
/// coin max -- plus fort -- deborde davantage.
fn un_tampon_cmos_non_lineaire() {
    let base = j(r#"{"debit": 25e6, "r_charge": 0.0, "c_charge": 5e-12}"#);
    let o = ibis_o(&base, "ibis_emetteur", CMOS33, obj! {"modele" => "OUT33"});
    let (r, nl) = _oeil_ibis(&o, 1e-9, 0.0, 50.0, None);
    let nl = nl.unwrap();
    proche(nl.v_haut, 3.3, 1e-3, "niveau haut");
    assert!(nl.v_bas.abs() < 1e-3);
    assert!(n(&nl.infos["asymetrie"]) > 0.05);
    assert!(txt(&nl.infos["emetteur"], "commande").contains("Ramp"));
    let o2 = ibis_o(&base, "ibis_emetteur", CMOS33, obj! {"modele" => "OUT33", "coin" => "max"});
    let (r2, nl2) = _oeil_ibis(&o2, 1e-9, 0.0, 50.0, None);
    proche(nl2.unwrap().v_haut, 3.6, 1e-3, "niveau haut max");
    assert!(mes(&r2, "v_max_vu") - 3.6 > mes(&r, "v_max_vu") - 3.3);
}

fn les_refus_ibis() {
    let doc = |o: Json| _doc(vec![_piste(0.0, 0.0, 30.0, 0.0, "SIG", 0.35)], o, vec![], &[]);
    _refus(&doc(obj! {"debit" => 1e8, "motif" => "prbs15", "ibis_emetteur" => obj! {"texte" => CMOS33}}), "PRBS15 et IBIS");
    let e = _refus(&doc(obj! {"debit" => 1e8, "ibis_emetteur" => obj! {"texte" => CMOS33, "modele" => "XX"}}), "modele inconnu");
    assert!(e.conseil.contains("OUT33"), "{}", e.conseil);
    let e = _refus(&doc(obj! {"debit" => 1e8, "ibis_emetteur" => obj! {"texte" => CMOS33, "modele" => "IN33"}}), "un Input n'emet pas");
    assert!(e.message.contains("émetteur"), "{}", e.message);
    _refus(&doc(obj! {"debit" => 1e8, "rj" => -1e-12}), "gigue negative");
}

/// `se._cascade_differentielle` rejouee sur ce que `simuler` a resolu -- segments, couplage,
/// topologie --, SANS les vias ni les coudes (`modeles_via`, `coudes_par_troncon` et `z_trav`
/// vides) : ce que le banc Python obtenait en doublant l'appel dans `simuler`. (`quatre_acces` :
/// None, ou la cascade a quatre acces d'office.)
pub fn cascade_sans_vias(d: &Json, res: &Json, f: &[f64], quatre_acces: Option<bool>) -> se::SDiff {
    let mut d2 = d.clone();
    let (couches, objets, analyse) = se::doc_valide(&d2).unwrap();
    let objets = se::_partager_paire(&mut d2, objets);
    let opts = se::options_modele(&d2);
    let mut av = Vec::new();
    se::_cascade_differentielle(&couches, &objets, els(&res["segments"]), &res["couplage"], f, 100.0, &d2, &analyse, &mut av,
                                &res["topologie"], true, &Default::default(), &Default::default(), &Default::default(), Some(&opts), quatre_acces)
        .unwrap_or_else(|e| panic!("{}", e.message))
        .expect("une cascade differentielle")
}

/// Une paire qui plonge de TOP a une couche interne par deux vias
/// traversants laisse sous elle deux moignons de 2,6 mm : ils resonnent
/// vers 14 GHz, et l'oeil a 16 Gb/s se ferme. La cascade differentielle ne
/// le voyait pas -- elle n'avait que les troncons. On compare la MEME
/// geometrie avec et sans ses vias, dans le meme calcul. Et un element pose
/// sur les deux brins double sa serie et divise sa derivation en mode
/// impair.
fn les_vias_de_la_paire_entrent_dans_la_cascade() {
    let c = |x: f64| Complex64::new(x, 0.0);
    let m = [[c(1.0), c(7.0)], [c(0.2), c(1.0)]];
    let dd = se::_abcd_deux_brins(&m, "diff");
    let cc = se::_abcd_deux_brins(&m, "comm");
    assert!(dd[0][1] == c(14.0) && dd[1][0] == c(0.1));
    assert!(cc[0][1] == c(3.5) && cc[1][0] == c(0.4));

    // Traversant de TOP a BOT : la portee percee fait le moignon.
    let objets = vec![_brin(0.0, 20.0, 0.0, "P", 0.2, 0, false), _brin(20.0, 40.0, 0.0, "P", 0.2, 4, true)];
    let vois = vec![_brin(0.0, 20.0, 0.35, "N", 0.2, 0, false), _brin(20.0, 40.0, 0.35, "N", 0.2, 4, true)];
    let d = avec_pile(_doc(objets, obj! {}, vois, &[("P", "N")]), SIX());
    let o = j(r#"{"debit": 16e9, "tr": 20e-12, "v_haut": 1.0, "v_bas": -1.0,
                  "r_source": 100.0, "r_charge": 100.0, "c_charge": 0.0, "mode": "diff"}"#);
    let p = ok(_params(&o, None));
    let (df, np_, _, _) = grille(16e9, 20e-12, 0.3e-9, 0.0);
    let f = frequences(df, np_);
    // LA MEME CASCADE, SANS SES VIAS, dans le meme appel : le couplage --
    // le plus cher -- n'est resolu qu'une fois.
    let res = simg(&d, &f);
    let s0 = cascade_sans_vias(&d, &res.json, &f, None);
    let sd = &res.json["s_diff"];
    assert!(n(&sd["vias"]) == 1.0 && n(&s0.json["vias"]) == 0.0, "{} {}", dumps(&sd["vias"]), dumps(&s0.json["vias"]));
    let h_avec = mes(&ok(oeil(&f, Canal::Abcd(&res.abcd_dd), &p, None, None, None, None, None)), "hauteur_pire");
    let h_sans = mes(&ok(oeil(&f, Canal::Abcd(&s0.abcd_dd), &p, None, None, None, None, None)), "hauteur_pire");
    assert!(h_avec < h_sans - 0.02, "{h_avec} {h_sans}");
}

// =============================================================================
// 2.1.0 -- le boitier, les broches, la paire de tampons, l'AMI
// =============================================================================

fn base_bt() -> Json {
    j(r#"{"debit": 1e9, "r_charge": 50.0, "c_charge": 0.0}"#)
}

/// Un [Package] et des [Pin] tout a zero : l'oeil est celui d'un
/// fichier sans boitier, au bit pres -- la cascade n'est pas touchee.
fn un_boitier_nul_ne_change_rien() {
    let nul_ = "[Package]\nR_pkg 0 0 0\nL_pkg 0 0 0\nC_pkg 0 0 0\n[Pin] signal_name model_name R_pin L_pin C_pin\nA1 SIG LIN 0 0 0\n";
    let (r0, _, _) = _oeil_boitier(&ibis_o(&base_bt(), "ibis_emetteur", &_ibis_boitier(&Bt::default()), obj! {}), 0.3e-9, 50.0);
    let (r1, _, ctx) = _oeil_boitier(&ibis_o(&base_bt(), "ibis_emetteur", &_ibis_boitier(&bt(nul_, 40e-12)), obj! {"broche" => "A1"}), 0.3e-9, 50.0);
    assert!(ctx.bt_em == (None, None), "{:?}", ctx.bt_em);
    assert!(r1["mesures"] == r0["mesures"], "{} {}", dumps(&r1["mesures"]), dumps(&r0["mesures"]));
    assert!(r1["densite"]["comptes"] == r0["densite"]["comptes"]);
}

/// Tampon de 50 ohms, L_pkg 5 nH, ligne de 50 ohms adaptee : le front
/// passe par un premier ordre de constante L / (Rs + Z0) = 50 ps. Le
/// 10-90 % simule est celui de la loi exponentielle-gaussienne (front du
/// tampon compose avec le lissage, puis le premier ordre) a 3 % pres.
fn l_inductance_du_boitier_ralentit_le_front() {
    let sigma = 10e-12;
    let pkg = "[Package]\nR_pkg 0 0 0\nL_pkg 5nH 5nH 5nH\nC_pkg 0 0 0\n";
    let (_, nl0, _) = _oeil_boitier(&ibis_o(&base_bt(), "ibis_emetteur", &_ibis_boitier(&bt("", sigma)), obj! {}), 0.3e-9, 50.0);
    let (_, nl1, ctx) = _oeil_boitier(&ibis_o(&base_bt(), "ibis_emetteur", &_ibis_boitier(&bt(pkg, sigma)), obj! {}), 0.3e-9, 50.0);
    assert!(txt(&ctx.infos["emetteur"]["boitier"], "source") == "[Package]");
    let sig = sigma * (1.0 + LISSAGE_SUR_FRONT.powi(2)).sqrt();
    let t = arange(-8.0 * sig, 30.0 * 50e-12, 0.05e-12);
    let attendu = _dix_quatre_vingt_dix(&_ex_gauss(&t, sig, 50e-12), 0.05e-12);
    let vu0 = _dix_quatre_vingt_dix(&nl0.s, nl0.dt);
    let vu1 = _dix_quatre_vingt_dix(&nl1.s, nl1.dt);
    proche(vu0, 2.5631 * sig, 0.03, "10-90 sans boitier");
    proche(vu1, attendu, 0.03, "10-90 avec L_pkg");
    // les niveaux ne bougent pas : L est un court-circuit en continu
    proche(nl1.v_haut, nl0.v_haut, 1e-6, "niveau haut");
}

/// C_pkg de 2 pF a la broche d'un recepteur adapte (50 ohms) : la
/// charge vaut Z0 / (1 + p C Z0), le coefficient de reflexion
/// -p tau / (1 + p tau), tau = Z0 C / 2 = 50 ps -- vu de l'emetteur
/// adapte, l'echo d'un echelon est -e^(-t/tau), lisse par le front. Le creux simule a l'emetteur est le creux
/// calcule a 3 % pres ; sans C_pkg, il n'y en a pas.
fn la_capacite_du_boitier_renvoie_une_reflexion() {
    let (sigma, retard) = (10e-12, 0.3e-9);
    let rx_txt = _ibis_boitier(&Bt {
        entete: "[Package]\nR_pkg 0 0 0\nL_pkg 0 0 0\nC_pkg 2pF 2pF 2pF\n".into(),
        lin: Lin { r: 50.0, nom: "RX", ..Lin::default() }, type_: "Input", suite: String::new() });
    let mut creux = Vec::new();
    for rx in [None, Some(&rx_txt)] {
        let mut o = ibis_o(&base_bt(), "ibis_emetteur", &_ibis_boitier(&bt("", sigma)), obj! {});
        if let Some(rx) = rx {
            o = ibis_o(&o, "ibis_recepteur", rx, obj! {"modele" => "RX"});
        }
        let (_, nl, _) = _oeil_boitier(&o, retard, 50.0);
        let pas = n(&nl.infos["pas_par_ui"]) as usize;
        let (v1, _) = nl.liaison.as_ref().unwrap().simuler(&[0, 0, 1, 1, 1], pas, 1e-9);
        let dt = nl.dt;
        let t50 = 2e-9 + nl.t50;
        // l'echo revient a 2 T apres le front ; avant lui, le palier E/2
        let i0 = ((t50 + 2.0 * retard - 4.0 * sigma) / dt) as usize;
        let i1 = ((t50 + 2.0 * retard + 300e-12) / dt) as usize;
        let palier = v1[((t50 + retard) / dt) as usize];
        creux.push((palier, palier - mini(v1[i0..i1].iter().copied())));
    }
    proche(creux[0].0, 0.5, 1e-3, "palier E/2");
    assert!(creux[0].1 < 0.005, "{creux:?}");
    let sig = sigma * (1.0 + LISSAGE_SUR_FRONT.powi(2)).sqrt();
    let tau = 50.0 * 2e-12 / 2.0;
    let pas_t = 0.05e-12;
    let t = arange(-8.0 * sig, 10.0 * tau, pas_t);
    // echo = - (front lisse, en pente) * e^(-t/tau)
    let pente: Vec<f64> = t.iter().map(|t| (-0.5 * (t / sig).powi(2)).exp() / (sig * (2.0 * PI).sqrt())).collect();
    // np.convolve(pente, noyau)[:len(t)] * pas_t, le noyau exp(-k pas / tau) : une recurrence
    let q = (-pas_t / tau).exp();
    let mut acc = 0.0;
    let mut plus_bas = f64::INFINITY;
    for x in &pente {
        acc = acc * q + x;
        plus_bas = plus_bas.min(-acc * pas_t);
    }
    let attendu = 0.5 * -plus_bas;
    proche(creux[1].1, attendu, 0.03, "creux de l'echo de C_pkg");
}

/// [Pin] L_pin 2 nH contre [Package] L_pkg 8 nH : la broche A1 prend la
/// sienne, la broche A2 (« NA ») celle du boitier -- et son front est plus
/// lent. Sans broche, le boitier moyen ; `boitier: false`, aucun.
fn la_broche_prime_sur_le_boitier() {
    let txt_ = _ibis_boitier(&bt(&BOITIER.replace("[Package Model] PKG_ESSAI\n", ""), 10e-12));
    let mut vus = Vec::new();
    for broche in ["A1", "A2", ""] {
        let o = ibis_o(&base_bt(), "ibis_emetteur", &txt_, obj! {"broche" => broche});
        let mut p = ok(_params(&o, None));
        vus.push(ok(preparer_ibis(&o, &mut p)).unwrap().bt_em.0.unwrap());
    }
    proche(vus[0].l, 2e-9, 1e-12, "L de A1");
    proche(vus[1].l, 8e-9, 1e-12, "L de A2");
    proche(vus[2].l, 8e-9, 1e-12, "L sans broche");
    assert!(vus[0].source == "[Pin]");
    assert!(vus[1].source.contains("[Package]"));
    assert!(vus[2].source == "[Package]");
    let o = ibis_o(&avec(&base_bt(), obj! {"boitier" => false}), "ibis_emetteur", &txt_, obj! {"broche" => "A1"});
    assert!(ok(preparer_ibis(&o, &mut ok(_params(&o, None)))).unwrap().bt_em == (None, None));
    let (_, nl1, _) = _oeil_boitier(&ibis_o(&base_bt(), "ibis_emetteur", &txt_, obj! {"broche" => "A1"}), 0.3e-9, 50.0);
    let (_, nl2, _) = _oeil_boitier(&ibis_o(&base_bt(), "ibis_emetteur", &txt_, obj! {"broche" => "A2"}), 0.3e-9, 50.0);
    assert!(_dix_quatre_vingt_dix(&nl2.s, nl2.dt) > 1.5 * _dix_quatre_vingt_dix(&nl1.s, nl1.dt));
}

/// [Diff Pin] A1 A2, tdelay 40 ps : choisie par sa broche, la paire
/// prend le modele de chaque broche et retarde le brin inverse. Les deux
/// modes adaptes (100 ohms entre les brins, 25 ohms de mode commun), chaque
/// brin du recepteur voit son propre tampon : l'ecart entre le front du
/// brin p et celui du brin n EST le tdelay. Le vdiff du recepteur devient
/// son seuil.
fn le_tdelay_de_diff_pin_decale_les_brins() {
    let txt_ = _ibis_boitier(&bt(&BOITIER.replace("[Package Model] PKG_ESSAI\n", "")
                                 .replace("L_pkg 8nH 6nH 10nH", "L_pkg 0 0 0")
                                 .replace("C_pkg 1pF 0.8pF 1.2pF", "C_pkg 0 0 0")
                                 .replace("0.05 2nH 0.4pF", "0 0 0")
                                 .replace("NA NA 0.6pF", "0 0 0"), 20e-12));
    let o = obj! {"debit" => 1e9, "mode" => "diff", "r_charge" => 100.0, "c_charge" => 0.0,
                  "r_charge_mc" => 25.0,
                  "ibis_emetteur" => obj! {"texte" => &txt_, "broche" => "A1"},
                  "ibis_recepteur" => obj! {"texte" => &txt_, "broche" => "A1", "modele" => "LIN"}};
    let (nl, ctx, _) = _paire_ideale(&o);
    proche(ctx.decalage, 40e-12, 1e-12, "tdelay lu");
    assert!(ctx.vdiff == Some(0.1), "{:?}", ctx.vdiff);
    assert!(txt(&ctx.infos["emetteur"], "inverse") == "A2");
    let pas = nl.pas_bit;
    let v = nl.liaison_paire.as_ref().unwrap().simuler(&[0, 0, 1, 1, 1], pas, 1e-9);
    let dt = nl.dt;
    let fin = |x: &[f64]| x[x.len() - 1];
    let (hp, bp) = (fin(&v[2]), v[2][0]);
    let (hn, bn) = (v[3][0], fin(&v[3]));
    let tp = _croisement(&v[2], dt, 0.5 * (hp + bp), true, 2 * pas);
    let tn = _croisement(&v[3], dt, 0.5 * (hn + bn), false, 2 * pas);
    proche(tn - tp, 40e-12, 0.02, "decalage mesure");
    // coin max : le tdelay max
    let o2 = avec(&o, obj! {"ibis_emetteur" => obj! {"texte" => &txt_, "broche" => "A1", "coin" => "max"}});
    let mut p2 = ok(_params(&o2, None));
    proche(ok(preparer_ibis(&o2, &mut p2)).unwrap().decalage, 50e-12, 1e-12, "tdelay max");
    // le seuil du recepteur, contre l'oeil
    let mut r = j(r#"{"mode": "diff", "mesures": {"hauteur_prbs": 0.3, "hauteur_pire": 0.15}, "avertissements": []}"#);
    _seuil_vdiff(&mut r, Some(&ctx));
    proche(mes(&r, "marge_vdiff_pire"), -0.025, 1e-9, "marge vdiff");
    assert!(!avertis(&r).is_empty());
}

/// Deux tampons lineaires opposes, sans decalage : le mode commun ne
/// bouge pas (au milliardieme). Decales de 30 ps, terminaison flottante en
/// mode commun et source adaptee dans les deux modes : le mode commun au
/// recepteur est (E_p + E_n)/2, et son excursion crete a crete vaut
/// Vcc erf(dt / (2 sqrt 2 sigma)) -- sigma, celui du front compose avec
/// le lissage -- a 2 % pres. L'oeil differentiel brut de la paire decalee
/// n'est pas plus ouvert que celui de la paire symetrique.
fn une_paire_symetrique_n_a_pas_de_mode_commun() {
    let sigma = 40e-12;
    let base = ibis_o(&j(r#"{"debit": 1e9, "mode": "diff", "r_charge": 100.0, "c_charge": 0.0}"#), "ibis_emetteur",
                      &_ibis_boitier(&bt("", sigma)), obj! {});
    let bits = ok(prbs(7))[..63].to_vec();
    let (mut nl, _, _) = _paire_ideale(&base);
    ok((nl.onde)(&bits));
    let mc = ok(mode_commun(&nl, None)).unwrap();
    assert!(n(&mc["crete_crete"]) < 1e-6, "{}", n(&mc["crete_crete"]));
    proche(n(&mc["continu"]), 0.5, 1e-4, "mode commun continu");
    let (mut nl2, ctx2, _) = _paire_ideale(&avec(&base, obj! {"decalage_n" => 30e-12}));
    assert!(!asymetries(Some(&ctx2)).is_empty());
    ok((nl2.onde)(&bits));
    let sig = sigma * (1.0 + LISSAGE_SUR_FRONT.powi(2)).sqrt();
    let mc2 = ok(mode_commun(&nl2, None)).unwrap();
    // math.erf(x) = 1 - erfc(x)
    proche(n(&mc2["crete_crete"]), 1.0 - erfc_py(30e-12 / (2.0 * 2f64.sqrt() * sig)), 0.02, "mode commun crete a crete");
    assert!(!nul(&mc2["conversion_db"]) && n(&mc2["conversion_db"]) < 0.0);
    assert!(n(&mc2["hauteur_brute"]) <= n(&mc["hauteur_brute"]) + 1e-6, "{} {}", n(&mc2["hauteur_brute"]), n(&mc["hauteur_brute"]));
}

/// Le chemin complet, sur une paire couplee dessinee : la cascade du mode
/// commun se reconstruit des S_cc de `simulation_em` (aller-retour exact
/// sur une ligne ideale), les deux brins sont simules, et le resultat porte
/// le mode commun. Tampons identiques sans decalage : rien en mode commun,
/// meme couple (Z_pair != Z_impair). Avec le tdelay de [Diff Pin] et les
/// boitiers de leurs broches : un mode commun, sa courbe, et l'oeil de la
/// paire symetrique pour comparer.
fn la_paire_dessinee_rend_son_mode_commun() {
    let f = linspace(1e8, 2e10, 40);
    let cc = ligne_ideale(&f, 22.0, 0.4e-9, 0.5);
    let plat = Json::Liste(cc.iter().map(|m| {
        let s = ligne_mom::cascade_to_s(m, 25.0);
        Json::Liste(s.iter().flatten().map(|v| vec![v.re, v.im].j()).collect())
    }).collect());
    let retour = abcd_depuis_s(&plat, 25.0).unwrap();
    let e = maxi(retour.iter().zip(&cc).flat_map(|(a, b)| (0..4).map(move |k| (a[k / 2][k % 2] - b[k / 2][k % 2]).norm())));
    assert!(e < 1e-9, "{e}");
    let entete = BOITIER.replace("[Package Model] PKG_ESSAI\n", "");
    let o = j(r#"{"debit": 2e8, "mode": "diff", "r_charge": 100.0, "c_charge": 0.0}"#);
    let sym = an(&_paire(20.0, ibis_o(&o, "ibis_emetteur", &_ibis_boitier(&bt("", 150e-12)), obj! {})));
    assert!(sym["ibis"]["deux_brins"].vrai(), "{}", dumps(&sym["ibis"]));
    assert!(n(&sym["mode_commun"]["crete_crete"]) < 1e-6, "{}", dumps(&sym["mode_commun"]["crete_crete"]));
    assert!(!contient(&sym["mode_commun"], "hauteur_symetrique"));
    let r = an(&_paire(20.0, ibis_o(&o, "ibis_emetteur", &_ibis_boitier(&bt(&entete, 150e-12)), obj! {"broche" => "A1"})));
    let mc = &r["mode_commun"];
    assert!(n(&mc["crete_crete"]) > 0.01, "{}", n(&mc["crete_crete"]));
    let asy: Vec<String> = els(&mc["asymetries"]).iter().map(str_py).collect();
    assert!(dit(&asy, "décalé"), "{asy:?}");
    assert!(dit(&asy, "boîtiers"), "{asy:?}");
    assert!(els(&mc["courbe"]["v"]).len() == els(&mc["courbe"]["v_diff"]).len() && els(&mc["courbe"]["v"]).len() > 100);
    assert!(n(&mc["hauteur_brute"]) <= n(&mc["hauteur_symetrique"]) + 1e-6);
    assert!(txt(&r["ibis"]["emetteur"]["boitier_n"], "source") == "[Package] + [Pin]", "{}", dumps(&r["ibis"]["emetteur"]["boitier_n"]));
    assert!(dit(&avertis(&r), "broche par broche"));
}

/// Un .ami en arbre : parametres reserves et propres au modele, Range,
/// List, Value, chaines entre guillemets. Les prises de FFE (-1, 0, 1)
/// donnent une FFE ramenee a sum |c| = 1 ; le nombre de prises du DFE et
/// leur plage, le DFE ; une liste de gains en dB, le CTLE (poles supposes) ;
/// Tx_Rj et Rx_Rj, la RJ en quadrature. Le [Algorithmic Model] du .ibs est
/// lu comme un renvoi -- la bibliotheque n'est pas executee.
/// (La lecture elle-meme est dans rust/ibis ; ici, ce que l'oeil en fait.)
fn un_fichier_ami_se_lit_et_propose_l_egaliseur() {
    let tx = r#"(essai_tx
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
    let rx = r#"(essai_rx
  (Reserved_Parameters
    (AMI_Version (Usage Info) (Type String) (Value "7.0"))
    (Rx_Rj (Usage Info) (Type Float) (Value 1.6e-12))
    (Rx_Receiver_Sensitivity (Usage Info) (Type Float) (Value 0.02)))
  (Model_Specific
    (CTLE (CTLE_Boost_dB (Usage In) (Type Float) (List 0 3 6 9)))
    (DFE (Taps (Usage In) (Type Integer) (Range 5 1 5))
         (Tap1 (Usage In) (Type Float) (Range 0 -0.08 0.08)))))
"#;
    let a = ibis::lire_ami(tx, "tx.ami").unwrap();
    let b = ibis::lire_ami(rx, "rx.ami").unwrap();
    let prop = ibis::proposer_egaliseur(Some(&a), Some(&b), 10e9).unwrap();
    // appliquee a la demande, et l'AMI le dit ; la gigue saisie l'emporte
    let txt_ = _ibis_boitier(&Bt { suite: "[Algorithmic Model]\nExecutable Linux_gcc_x86_64 tx.so tx.ami\n[End Algorithmic Model]\n".into(), ..Bt::default() });
    let o = obj! {"debit" => 10e9, "mode" => "diff", "r_charge" => 100.0, "rj" => 1e-12,
                  "ami_regler" => true,
                  "ibis_emetteur" => obj! {"texte" => &txt_, "ami" => obj! {"texte" => tx, "fichier" => "tx.ami"}},
                  "ibis_recepteur" => obj! {"texte" => &txt_, "ami" => obj! {"texte" => rx}}};
    let mut p = ok(_params(&o, None));
    let mut ctx = ok(preparer_ibis(&o, &mut p));
    let ami = ok(preparer_ami(&o, &mut p, ctx.as_mut())).unwrap();
    assert!(Some(&p.ffe) == prop.ffe.as_ref() && p.dfe_prises == 5);
    assert!(txt(p.ctle.as_ref().unwrap(), "forme") == "pcie3" && p.rj_ui == 1e-12 * 10e9);
    proche(p.dj_ui, 5e-12 * 10e9, 1e-9, "DJ appliquee");
    assert!(ctx.unwrap().vdiff == Some(0.02));
    assert!(txt(&ami.json["renvois"][0], "bibliotheque") == "tx.so");
    assert!(txt(&ami.json, "note").contains("pas exécuté") || txt(&ami.json, "note").contains("PAS exécuté"));
}

pub fn banc() {
    T("un tampon ibis lineaire rend l oeil lineaire", un_tampon_ibis_lineaire_rend_l_oeil_lineaire);
    T("la simulation temporelle est la superposition si tout est lineaire", la_simulation_temporelle_est_la_superposition_si_tout_est_lineaire);
    T("le c comp du recepteur vaut une capacite de charge", le_c_comp_du_recepteur_vaut_une_capacite_de_charge);
    T("les diodes du recepteur ecretent", les_diodes_du_recepteur_ecretent);
    T("un tampon cmos non lineaire", un_tampon_cmos_non_lineaire);
    T("les refus ibis", les_refus_ibis);
    T("les vias de la paire entrent dans la cascade", les_vias_de_la_paire_entrent_dans_la_cascade);
    T("un boitier nul ne change rien", un_boitier_nul_ne_change_rien);
    T("l inductance du boitier ralentit le front", l_inductance_du_boitier_ralentit_le_front);
    T("la capacite du boitier renvoie une reflexion", la_capacite_du_boitier_renvoie_une_reflexion);
    T("la broche prime sur le boitier", la_broche_prime_sur_le_boitier);
    T("le tdelay de diff pin decale les brins", le_tdelay_de_diff_pin_decale_les_brins);
    T("une paire symetrique n a pas de mode commun", une_paire_symetrique_n_a_pas_de_mode_commun);
    T("la paire dessinee rend son mode commun", la_paire_dessinee_rend_son_mode_commun);
    T("un fichier ami se lit et propose l egaliseur", un_fichier_ami_se_lit_et_propose_l_egaliseur);
}
