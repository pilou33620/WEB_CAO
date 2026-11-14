//! La rugosite du plan dans la paire, le couplage AC, l'execution AMI (2.3.0), l'horloge
//! recuperee (2.4.0), les niveaux etablis ; et la part oeil de banc-entrees-malformees.py.

use crate::*;

/// L'empilage a quatre couches, la piste du dessus rugueuse (Rq en um),
/// et le plan GND qui declare -- ou non -- la sienne (0 : lisse).
fn _pile_rugueuse(piste_um: f64, plan_um: Option<f64>) -> Vec<Json> {
    let mut p = QUATRE();
    poser(&mut p[0], "rugosite_rms_um", piste_um);
    if let Some(x) = plan_um {
        poser(&mut p[2], "rugosite_rms_um", x);
    }
    p
}

/// `simulation_em` 5.4.0 : la cascade differentielle lit la rugosite du
/// plan de reference comme la cascade simple. Un plan qui ne declare rien
/// prend celle de la piste -- Sdd, Scc (et Scd a quatre acces) sont ceux
/// d'avant AU BIT PRES, c'est le cas de non-regression ; un plan lisse
/// declare sous une piste a Rq 1 um perd moins, pour la paire symetrique
/// (deux modes) comme pour la paire dissymetrique (quatre acces), et l'oeil
/// s'ouvre d'autant.
fn la_rugosite_du_plan_entre_dans_la_cascade_de_la_paire() {
    let f = linspace(1e9, 20e9, 8);
    let sdd = |pile: Vec<Json>, n_long: f64| -> Json {
        let mut d = _doc(vec![brin(0.0, 20.0, 0.0, "P")], obj! {}, vec![brin(0.0, n_long, 0.35, "N")], &[("P", "N")]);
        oter(&mut d, "oeil");
        simg(&avec_pile(d, pile), &f).json["s_diff"].clone()
    };
    for n_long in [20.0, 24.0] {
        let muet = sdd(_pile_rugueuse(1.0, None), n_long);
        let egal = sdd(_pile_rugueuse(1.0, Some(1.0)), n_long);
        let lisse = sdd(_pile_rugueuse(1.0, Some(0.0)), n_long);
        assert!(muet["quatre_acces"].vrai() == (n_long > 20.0));
        for cle in ["s_dd", "s_cc", "s_cd"] {
            assert!(muet[cle] == egal[cle], "{cle} : un plan qui declare la rugosite de la piste change la paire ({})",
                    if n_long > 20.0 { "quatre acces" } else { "deux modes" });
        }
        let s_r: Vec<f64> = _plats(&muet["s_dd"]).iter().map(|m| m[2].norm()).collect();
        let s_l: Vec<f64> = _plats(&lisse["s_dd"]).iter().map(|m| m[2].norm()).collect();
        assert!(s_l.iter().zip(&s_r).all(|(a, b)| a > b), "{s_l:?} {s_r:?}");
        assert!(20.0 * (s_l[s_l.len() - 1] / s_r[s_r.len() - 1]).log10() > 0.03);
    }
    let o = j(r#"{"debit": 10e9, "tr": 20e-12, "v_haut": 1.0, "v_bas": -1.0,
                  "r_source": 100.0, "r_charge": 100.0, "c_charge": 0.0, "mode": "diff"}"#);
    let oeil_de = |pile: Vec<Json>| -> f64 {
        let d = _doc(vec![brin(0.0, 20.0, 0.0, "P")], o.clone(), vec![brin(0.0, 20.0, 0.35, "N")], &[("P", "N")]);
        mes(&an(&avec_pile(d, pile)), "hauteur_pire")
    };
    assert!(oeil_de(_pile_rugueuse(1.0, Some(0.0))) > oeil_de(_pile_rugueuse(1.0, None)));
}

fn base_1g() -> Json {
    j(r#"{"debit": 1e9, "tr": 50e-12, "v_haut": 1.0, "v_bas": 0.0,
          "r_source": 50.0, "r_charge": 50.0, "c_charge": 0.0}"#)
}

fn p20() -> Vec<Json> {
    vec![_piste(0.0, 0.0, 20.0, 0.0, "SIG", 0.35)]
}

/// Le couplage AC (2.3.0). Sur une ligne ideale adaptee, |H| avec les
/// condensateurs rapporte a |H| sans eux passe a -3 dB a
/// f_c = 1 / (2 pi C (Z_tx + Z_rx)) ; en differentiel la boucle voit C/2.
/// Sans condensateur declare (ou C = 0), l'oeil est celui d'avant au bit
/// pres et le resultat n'en parle pas. Le continu de l'IFFT est
/// `resistance_continu_ac` : R_tot (exp(T_w / tau) - 1), T_w / C quand
/// tau >> T_w, infini quand la fenetre couvre la decharge.
fn les_condensateurs_de_liaison_coupent_le_continu() {
    let o = avec(&base_1g(), j(r#"{"couplage_ac": {"c": 1e-9}}"#));
    let p = ok(_params(&o, None));
    let ca = p.couplage_ac.as_ref().unwrap();
    proche(ca.f_c.unwrap(), 1.0 / (2.0 * PI * 1e-9 * 100.0), 1e-12, "f_c");
    proche(ca.tau.unwrap(), 1e-9 * 100.0, 1e-12, "tau");
    assert!(ca.esl == 0.0 && ca.position == "emetteur");
    // np.logspace(5, 9, 400)
    let f: Vec<f64> = linspace(5.0, 9.0, 400).iter().map(|x| 10f64.powf(*x)).collect();
    let m = ligne_ideale(&f, 50.0, 1e-9, 0.0);
    let (m2, _, _) = poser_couplage_ac(Some(ca), &f, &m, None, None, "simple");
    let (h, _) = transfert(&m2, &f, 50.0, 50.0, 0.0, 0.0);
    let (hb, _) = transfert(&m, &f, 50.0, 50.0, 0.0, 0.0);
    let rap: Vec<f64> = h.iter().zip(&hb).map(|(a, b)| a.norm() / b.norm()).collect();
    let cible = 1.0 / 2f64.sqrt();
    let mut i = 0;
    for k in 0..rap.len() {
        if (rap[k] - cible).abs() < (rap[i] - cible).abs() {
            i = k;
        }
    }
    proche(f[i], ca.f_c.unwrap(), 0.01, "coupure a -3 dB");
    assert!(rap[rap.len() - 1] > 0.999 && rap[0] < 0.1);
    // en differentiel : C/2 dans la boucle, et l'ESL du boitier
    let pd_ = ok(_params(&avec(&o, j(r#"{"mode": "diff", "v_bas": -1.0, "r_source": 100.0, "r_charge": 100.0,
                                         "couplage_ac": {"c": 1e-9, "boitier": "0402"}}"#)), None));
    let cad = pd_.couplage_ac.as_ref().unwrap();
    proche(cad.f_c.unwrap(), 1.0 / (2.0 * PI * 0.5e-9 * 200.0), 1e-12, "f_c differentiel");
    assert!(Some(cad.esl) == esl_boitier("0402"));
    // la resistance du continu
    proche(resistance_continu_ac(1e-9, 100.0, 1e-9), 1e-9 / 1e-9, 0.01, "R_x = T_w / C quand tau >> T_w");
    assert!(resistance_continu_ac(1e-9, 100.0, 100e-6) >= 1e12);
    // sans condensateur : rien ne change, rien de plus
    let r0 = an(&_doc(p20(), base_1g(), vec![], &[]));
    let r00 = an(&_doc(p20(), avec(&base_1g(), j(r#"{"couplage_ac": {"c": 0}}"#)), vec![], &[]));
    for cle in ["mesures", "pire_cas", "densite", "reponse_bit", "seuil"] {
        assert!(r0[cle] == r00[cle], "{cle}");
    }
    assert!(!contient(&r0, "couplage_ac") && !contient(&r0["parametres"], "couplage_ac"));
    assert!(dit(&avertis(&r0), "sans condensateurs de liaison"));
    for mauvais in [r#"{"c": 2.0}"#, r#"{"c": 1e-9, "position": "milieu"}"#] {
        assert!(_params(&avec(&base_1g(), obj! {"couplage_ac" => j(mauvais)}), None).is_err(), "couplage accepte : {mauvais}");
    }
}

/// Le droop. A 100 Mb/s, 1 nF dans 100 ohms : tau = 100 ns, 10 % par
/// bit. La fenetre couvre six tau, le continu de l'IFFT est exact : la
/// reponse a un echelon -- le motif 1111... -- derive en exp(-t / tau) a
/// 1 % pres sur 32 bits, et le bit qui suit une longue suite de zeros
/// (0000...1) part du niveau fausse. L'oeil PRBS15 (suites de 15) se ferme
/// devant celui d'avant, le pire cas (toute la memoire) plus encore, et le
/// resultat le dit. Fenetre plus courte que tau (10 Gb/s, 100 nF) : le
/// pole lent separe (2.4.0) rend la derive de la fenetre a 1e-3 pres, et
/// le resultat dit que la fenetre ne couvre pas la decharge ; fenetre de
/// l'ordre de tau, la ou la case corrigee se trompait de 4 % : 1e-3.
fn le_couplage_ac_fait_deriver_les_longues_suites() {
    let b2 = j(r#"{"debit": 100e6, "tr": 1e-9, "v_haut": 1.0, "v_bas": 0.0,
                   "r_source": 50.0, "r_charge": 50.0, "c_charge": 0.0, "motif": "prbs15"}"#);
    let r0 = an(&_doc(p20(), b2.clone(), vec![], &[]));
    let r1 = an(&_doc(p20(), avec(&b2, j(r#"{"couplage_ac": {"c": 1e-9, "position": "recepteur"}}"#)), vec![], &[]));
    let ca = &r1["couplage_ac"];
    assert!(ca["fenetre_couvre"] == Json::Bool(true) && txt(ca, "position") == "recepteur");
    proche(n(&ca["droop_par_ui"]), 1.0 - (-10e-9f64 / 100e-9).exp(), 1e-9, "droop par bit");
    assert!(mes(&r1, "hauteur_prbs") < 0.5 * mes(&r0, "hauteur_prbs"));
    assert!(mes(&r1, "hauteur_pire") < mes(&r1, "hauteur_prbs"));
    // l'oeil reste centre sur le niveau SANS derive (la grille, plus longue
    // de trois tau, deplace le continu extrapole de la ligne d'un rien)
    proche(n(&r1["seuil"]), n(&r0["seuil"]), 1e-3, "seuil de l'oeil couple");
    assert!(avertis(&r1).iter().any(|a| a.contains("droop") && a.contains("1 nF")));
    // le motif 1111...0000 : la reponse a un echelon, sur la grille de l'oeil
    let p = ok(_params(&avec(&b2, j(r#"{"couplage_ac": {"c": 1e-9}}"#)), None));
    let cap = p.couplage_ac.as_ref().unwrap();
    let tau = cap.tau.unwrap();
    let (df, np_, fen, pleine) = grille(100e6, 1e-9, 0.1e-9, 3.0 * tau);
    assert!(pleine && fen >= 6.0 * tau);
    let f = frequences(df, np_);
    let (m, _, _) = poser_couplage_ac(Some(cap), &f, &ligne_ideale(&f, 50.0, 0.1e-9, 0.0), None, None, "simple");
    let (h, h0) = transfert(&m, &f, 50.0, 50.0, 0.0, 0.0);
    let h0b = continu_couplage_ac(cap, &m, &f, 50.0, 50.0, 0.0, 0.0);
    assert!(h0b < 0.01 * h0, "{h0} {h0b}");
    let (dt, s) = reponse_indicielle(&f, &h, h0b, 1e-9, 4096);
    let ui = 10e-9;
    let t0 = 0.1e-9 + 2.0 * ui;
    let a = |t: f64| s[(t / dt).round_ties_even() as usize];
    for k in [8.0, 16.0, 32.0] {
        // l'ecart se juge a l'amplitude : le niveau derive devient petit
        let ecart = (a(t0 + k * ui) / a(t0) - (-k * ui / tau).exp()).abs();
        assert!(ecart < 0.005, "droop du motif 1111 apres {k} bits : {:.4} contre {:.4}", a(t0 + k * ui) / a(t0), (-k * ui / tau).exp());
    }
    // 1111...0000 : apres 32 bits a 1, la suite de 0 part de a(t0 + 32 UI)
    // et redescend SOUS le niveau bas de a(t0 + 32 UI) - a(t0) (la reponse
    // est lineaire : la descente est l'echelon renverse, derive compris)
    assert!(a(t0 + 32.0 * ui) - a(t0) < -0.2 * a(t0));
    // fenetre plus courte que tau : le continu corrige
    let (df, np_, fen, pleine) = grille(10e9, 20e-12, 1e-9, 3.0 * 10e-6);
    assert!(!pleine);
    let f = frequences(df, np_);
    let ca2 = ok(couplage_ac(&j(r#"{"c": 100e-9}"#), "simple", 50.0, 50.0)).unwrap();
    let (m, _, _) = poser_couplage_ac(Some(&ca2), &f, &ligne_ideale(&f, 50.0, 1e-9, 0.0), None, None, "simple");
    let (h, h0) = transfert(&m, &f, 50.0, 50.0, 0.0, 0.0);
    let h0b = continu_couplage_ac(&ca2, &m, &f, 50.0, 50.0, 0.0, 0.0);
    proche(h0b, h0 * (-fen / ca2.tau.unwrap()).exp(), 1e-6, "continu de la fenetre");
    // {"r_source": 50.0, "r_charge": 50.0, "c_charge": 0.0}
    let p50 = ok(_params(&j(r#"{"debit": 1e9, "r_source": 50.0, "r_charge": 50.0, "c_charge": 0.0}"#), None));
    let (_, lent) = _continu_ac_simple(Some(&ca2), &m, &f, &p50);
    let lent = lent.unwrap();
    proche(lent.tau, ca2.tau.unwrap(), 0.01, "tau de la boucle (ligne comprise)");
    let (dt, s) = reponse_indicielle_ac(&f, &h, lent.h0, 20e-12, 4096, lent.tau);
    let th = fen / 2.0;
    proche(s[(th / dt) as usize - 1] / s[(3e-9 / dt) as usize], (-(th - 3e-9) / lent.tau).exp(), 1e-3, "derive dans la fenetre");
    // fenetre de l'ordre de tau (1 Gb/s, 2 nF : T_w / tau ~ 1,3)
    let ca3 = ok(couplage_ac(&j(r#"{"c": 2e-9}"#), "simple", 50.0, 50.0)).unwrap();
    let (df, np_, fen, _) = grille(1e9, 50e-12, 0.5e-9, 3.0 * ca3.tau.unwrap());
    let f = frequences(df, np_);
    let (m, _, _) = poser_couplage_ac(Some(&ca3), &f, &ligne_ideale(&f, 50.0, 0.5e-9, 0.0), None, None, "simple");
    let (h, _) = transfert(&m, &f, 50.0, 50.0, 0.0, 0.0);
    let (_, lent) = _continu_ac_simple(Some(&ca3), &m, &f, &p50);
    let lent = lent.unwrap();
    assert!(0.5 < fen / lent.tau && fen / lent.tau < 3.0, "{}", fen / lent.tau);
    let (dt, s) = reponse_indicielle_ac(&f, &h, lent.h0, 50e-12, 4096, lent.tau);
    let t0 = 1e-9;
    for t in linspace(2e-9, 0.98 * fen / 2.0, 6) {
        let ecart = (s[(t / dt) as usize] / s[(t0 / dt) as usize] - (-(t - t0) / lent.tau).exp()).abs();
        assert!(ecart < 1e-3, "fenetre ~ tau : {ecart:.2e} a {} ns", t * 1e9);
    }
    let r2 = an(&_doc(p20(), j(r#"{"debit": 10e9, "tr": 20e-12, "v_haut": 1.0,
                                   "v_bas": 0.0, "r_source": 50.0,
                                   "r_charge": 50.0, "c_charge": 0.0,
                                   "couplage_ac": {"c": 100e-9}}"#), vec![], &[]));
    assert!(r2["couplage_ac"]["fenetre_couvre"] == Json::Bool(false));
    assert!(dit(&avertis(&r2), "ne couvre pas"));
}

/// La paire par brin (cascade a quatre acces) porte les memes
/// condensateurs que le mode impair : terminee, son pole lent est celui
/// du mode impair (C/2 dans R_s + R_L, lignes comprises) et sa reponse a
/// un echelon est celle de `transfert` a 1e-3 pres ; sans terminaison,
/// sa case du continu est le pont diviseur C_x / (C_x + C_L), comme en
/// simple -- elle valait h0 avant la 2.4.0.
fn le_couplage_ac_de_la_paire_par_brin() {
    let o = j(r#"{"debit": 1e9, "tr": 50e-12, "r_source": 100.0, "r_charge": 100.0,
                  "c_charge": 0.0, "mode": "diff", "couplage_ac": {"c": 2e-9}}"#);
    let p = ok(_params(&o, None));
    let ca = p.couplage_ac.as_ref().unwrap();
    let (df, np_, fen, _) = grille(1e9, 50e-12, 0.5e-9, 3.0 * ca.tau.unwrap());
    let f = frequences(df, np_);
    let m_dd = ligne_ideale(&f, 100.0, 0.5e-9, 0.5);
    let m_cc = ligne_ideale(&f, 30.0, 0.5e-9, 0.5);
    let m4 = ibis::abcd_brins(&m_dd, &m_cc);
    let (m_dd, _, m4) = poser_couplage_ac(Some(ca), &f, &m_dd, None, Some(&m4), "diff");
    let m4 = m4.unwrap();
    let mut bins = Continu::default();
    let (h4, _, _) = ok(transfert_paire(None, &f, &m4, &p, Some(&mut bins)));
    let (_, lent) = _continu_ac_simple(Some(ca), &m_dd, &f, &p);
    let (lent, lent4) = (lent.unwrap(), bins.lent.unwrap());
    proche(lent4.tau, lent.tau, 1e-3, "tau de la paire par brin");
    let (dt, s4) = reponse_indicielle_ac(&f, &h4, lent4.h0, 50e-12, 4096, lent4.tau);
    let (h2, _) = transfert(&m_dd, &f, 100.0, 100.0, 0.0, 0.0);
    let (dt2, s2) = reponse_indicielle_ac(&f, &h2, lent.h0, 50e-12, 4096, lent.tau);
    for t in linspace(2e-9, 0.98 * fen / 2.0, 5) {
        assert!((s4[(t / dt) as usize] - s2[(t / dt2) as usize]).abs() < 1e-3, "{t}");
    }
    // sans terminaison : le pont diviseur, en simple comme par brin
    let p2 = ok(_params(&avec(&o, obj! {"r_charge" => 0.0, "c_charge" => 1e-12}), None));
    let mut bins = Continu::default();
    let (_, h0n, _) = ok(transfert_paire(None, &f, &m4, &p2, Some(&mut bins)));
    let ca2 = p2.couplage_ac.as_ref().unwrap();
    let cx = ca2.c_x;
    proche(bins.bin, h0n * cx / (cx + 1e-12), 1e-9, "pont diviseur");
    assert!(bins.lent.is_none());
    proche(continu_couplage_ac(ca2, &m_dd, &f, 100.0, 0.0, 1e-12, 0.0), cx / (cx + 1e-12), 1e-9, "pont diviseur en simple");
}

fn base_2g() -> Json {
    j(r#"{"debit": 2e9, "tr": 50e-12, "v_haut": 1.0, "v_bas": -1.0,
          "r_source": 100.0, "r_charge": 100.0, "c_charge": 0.0, "mode": "diff"}"#)
}

fn doc60(oe: Json) -> Json {
    _doc(vec![brin(0.0, 60.0, 0.0, "P")], oe, vec![brin(0.0, 60.0, 0.35, "N")], &[("P", "N")])
}

/// L'AMI_GetWave de l'EMETTEUR (oeil 2.4.0) : il n'etait pas joue, seul
/// AMI_Init l'etait. Un emetteur dont la FFE n'est QUE dans GetWave (son
/// AMI_Init rend l'impulsion telle quelle) : l'oeil PRBS -- le flot
/// temporel -- est celui de la FFE de reference a 1e-4, le pire cas -- le
/// flot statistique, par AMI_Init -- celui sans FFE. La meme FFE dans
/// Init ET GetWave : les deux sont ceux de la FFE. Un recepteur sans
/// GetWave derriere lui : son egaliseur est initialise une seconde fois
/// sur le canal brut.
fn l_ami_getwave_de_l_emetteur_fait_la_forme_d_onde() {
    let base = base_2g();
    let r0 = an(&doc60(base.clone()));
    let rf = an(&doc60(avec(&base, j(r#"{"ffe": [0.7, -0.3], "ffe_principal": 0}"#))));

    let gw = an_faux(&doc60(avec(&base, obj! {"ibis_emetteur" => _faux(j(r#"{"c0": 0.7, "c1": -0.3, "gw_seul": 1}"#))})));
    let ex = &gw["ami"]["execution"]["emetteur"];
    assert!(ex["init"].vrai() && ex["getwave"].vrai(), "{}", dumps(ex));
    assert!(dit(&avertis(&gw), "AMI_GetWave de l'émetteur"), "{:?}", avertis(&gw));
    // (a 2e-3 : la phase d'echantillonnage se choisit sur le flot
    // statistique, ici sans FFE, et tombe un peu a cote de la sienne)
    proche(mes(&gw, "hauteur_prbs"), mes(&rf, "hauteur_prbs"), 2e-3, "GetWave seul : oeil PRBS de la FFE");
    assert!(mes(&gw, "hauteur_prbs") < 0.8 * mes(&r0, "hauteur_prbs"), "la FFE de GetWave doit compter");
    proche(mes(&gw, "hauteur_pire"), mes(&r0, "hauteur_pire"), 1e-4, "GetWave seul : pire cas sans FFE (AMI_Init identite)");
    let les2 = an_faux(&doc60(avec(&base, obj! {"ibis_emetteur" => _faux(j(r#"{"c0": 0.7, "c1": -0.3}"#))})));
    for k in ["hauteur_prbs", "hauteur_pire"] {
        proche(mes(&les2, k), mes(&rf, k), 1e-4, &format!("Init et GetWave : {k}"));
    }
    // un recepteur a Init seul derriere l'emetteur a GetWave
    let txt_rx = FAUX_AMI.replace("(GetWave_Exists (Usage Info) (Type Boolean) (Value True))",
                                  "(GetWave_Exists (Usage Info) (Type Boolean) (Value False))");
    let rx = obj! {"ami" => obj! {"texte" => txt_rx, "fichier" => "rx.ami", "bibliotheque" => "rx.so", "parametres" => obj! {}}};
    let r2 = an_faux(&doc60(avec(&base, obj! {"ibis_emetteur" => _faux(j(r#"{"c0": 0.7, "c1": -0.3, "gw_seul": 1}"#)), "ibis_recepteur" => rx})));
    proche(mes(&r2, "hauteur_prbs"), mes(&rf, "hauteur_prbs"), 2e-3, "Rx Init seul derriere Tx GetWave");
    assert!(!dit(&avertis(&r2), "Seconde initialisation"), "{:?}", avertis(&r2));
}

/// L'horloge recuperee par le recepteur AMI (oeil 2.4.0) : lue et
/// montree jusqu'ici, elle FIXE desormais l'echantillonnage (IBIS : chaque
/// instant + bit / 2). Recepteur identite :
///   · horloge a la phase que l'outil prenait : l'oeil d'avant, a 1e-6 ;
///   · decalee d'un quart d'UI : la fiche le dit (0,25 UI), l'oeil PRBS
///     lu la se ferme, le pire cas aussi ;
///   · une gigue alternee de +-0,1 UI : 0,1 UI rms, 0,2 crete a crete, et
///     l'oeil PRBS plus ferme qu'a gigue nulle.
fn l_horloge_recuperee_par_l_ami_fixe_l_echantillonnage() {
    let base = base_2g();
    let avec_rx = |par: Json| an_faux(&doc60(avec(&base, obj! {"ibis_recepteur" => _faux(par)})));
    let ref_ = avec_rx(obj! {});
    assert!(!contient(&ref_, "horloge_ami"));
    let ui = 1.0 / 2e9;
    let t50 = 4.0 * 50e-12 / TR_SUR_SIGMA;
    let phi = fmod_py((mes(&ref_, "retard") + ui / 2.0 + t50) / ui, 1.0);
    let r = avec_rx(obj! {"horloge" => phi});
    let h = &r["horloge_ami"];
    assert!(h["imposee"].vrai() && n(&h["decalage_ui"]).abs() < 1.0 / 64.0 + 1e-9, "{}", dumps(h));
    assert!(n(&h["gigue_rms_ui"]) < 1e-9 && n(&h["ticks"]) >= 127.0, "{}", dumps(h));
    for k in ["hauteur_prbs", "hauteur_pire"] {
        proche(mes(&r, k), mes(&ref_, k), 1e-6, &format!("a sa phase : {k}"));
    }
    let rq = avec_rx(obj! {"horloge" => fmod_py(phi + 0.25, 1.0)});
    let hq = &rq["horloge_ami"];
    // le resultat part en JSON, instants exclus
    assert!(!dumps(&rq).is_empty());
    assert!(!contient(&rq["ami"]["horloges"], "instants"));
    assert!(rq["ami"]["horloges"]["imposee"].vrai());
    assert!((n(&hq["decalage_ui"]) - 0.25).abs() < 1.0 / 64.0 + 1e-9, "{}", dumps(hq));
    assert!(mes(&rq, "hauteur_prbs") < mes(&ref_, "hauteur_prbs"));
    assert!(mes(&rq, "hauteur_pire") < mes(&ref_, "hauteur_pire"));
    assert!(dit(&avertis(&rq), "Horloge récupérée"));
    let rg = avec_rx(obj! {"horloge" => phi, "gigue" => 0.1});
    let hg = &rg["horloge_ami"];
    proche(n(&hg["gigue_rms_ui"]), 0.1, 0.05, "gigue rms");
    proche(n(&hg["gigue_cc_ui"]), 0.2, 0.05, "gigue crete a crete");
    assert!(mes(&rg, "hauteur_prbs") < mes(&r, "hauteur_prbs"));
}

/// AMI sur un canal IBIS NON LINEAIRE (oeil 2.4.0) : le GetWave du
/// recepteur recevait la forme d'onde du canal LINEARISE (la reponse
/// moyenne des deux fronts) ; il recoit celle que les tampons simules dans
/// le temps donnent a la broche. Tampon CMOS aux fronts dissymetriques,
/// ligne ouverte : un recepteur AMI identite rend l'oeil PRBS des tampons
/// seuls a 1e-6, et la note dit le flot.
fn l_ami_lit_la_forme_d_onde_des_tampons_ibis() {
    let o = obj! {"debit" => 25e6, "r_charge" => 0.0, "c_charge" => 5e-12, "motif" => "prbs7",
                  "ibis_emetteur" => obj! {"texte" => CMOS33, "modele" => "OUT33"}};
    let doc = |oe: Json| _doc(vec![_piste(0.0, 0.0, 40.0, 0.0, "SIG", 0.35)], oe, vec![], &[]);
    let r0 = an(&doc(o.clone()));
    let r = an_faux(&doc(avec(&o, obj! {"ibis_recepteur" => _faux(obj! {})})));
    assert!(r["ami"]["execution"]["recepteur"]["getwave"].vrai());
    assert!(dit(&avertis(&r), "tampons IBIS simulés"));
    proche(mes(&r, "hauteur_prbs"), mes(&r0, "hauteur_prbs"), 1e-6, "identite sur la forme d'onde des tampons");
    proche(mes(&r, "v_max_vu"), mes(&r0, "v_max_vu"), 1e-6, "depassement des tampons");
}

/// La bibliotheque AMI d'essai (rust/ibis/essais/ami_ffe.c), compilee
/// a la volee dans un dossier temporaire : (dossier, texte du .ami), ou
/// None sans compilateur.
fn _modele_ami_compile() -> Option<(String, String)> {
    let src = format!("{}/../ibis/essais", env!("CARGO_MANIFEST_DIR"));
    let d = std::env::temp_dir().join(format!("ami_essai_{}", std::process::id()));
    std::fs::create_dir_all(&d).ok()?;
    let fait = ["cc", "gcc", "clang"].iter().any(|cc| {
        std::process::Command::new(cc)
            .args(["-shared", "-fPIC", "-O1", "-o"])
            .arg(d.join("ami_ffe.so"))
            .arg(format!("{src}/ami_ffe.c"))
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .is_ok_and(|s| s.success())
    });
    if !fait {
        return None;
    }
    Some((d.to_str()?.to_string(), std::fs::read_to_string(format!("{src}/ami_ffe.ami")).ok()?))
}

/// L'execution AMI (oeil 2.3.0, ibis 1.3.0) sur le modele d'essai
/// compile a la volee -- une FFE a deux coefficients. Identite (c0 = 1,
/// c1 = 0) au recepteur, par AMI_Init puis AMI_GetWave : l'oeil d'avant a
/// 1e-6 pres. FFE 0,7 / -0,3 a l'emetteur par AMI_Init : l'oeil de la FFE
/// interne de reference a 1e-4 pres, les parametres Out relus, la FFE de
/// reference effacee ; une surcharge (c1 = -0,2) passe dans la chaine et
/// change l'oeil comme la FFE interne ; la meme FFE au recepteur par
/// GetWave (par blocs, avec Ignore_Bits) rend le meme oeil. Les replis :
/// fichier absent, URL, aucune racine, AMI_Init qui rend 0 -- un
/// avertissement, l'oeil d'avant, jamais une exception. Saute proprement
/// sans compilateur C.
fn le_modele_ami_execute_concorde_avec_la_ffe_interne() {
    let Some((d, ami_txt)) = _modele_ami_compile() else {
        println!("        (pas de compilateur C : execution AMI non essayee)");
        return;
    };
    let base = base_2g();
    let ami = |lib: &str, par: Json| -> Json {
        let mut a = obj! {"texte" => &ami_txt, "fichier" => "ami_ffe.ami", "bibliotheque" => lib};
        if par.vrai() {
            poser(&mut a, "parametres", par);
        }
        obj! {"ami" => a}
    };
    let lance = |oe: Json, rac: Option<&[&str]>| ok(analyser(&doc60(oe), None, rac));
    let rac: &[&str] = &[&d];
    let r0 = an(&doc60(base.clone()));
    let rf = an(&doc60(avec(&base, j(r#"{"ffe": [0.7, -0.3], "ffe_principal": 0}"#))));
    let rf2 = an(&doc60(avec(&base, j(r#"{"ffe": [0.7, -0.2], "ffe_principal": 0}"#))));
    assert!(mes(&rf, "hauteur_prbs") < 0.5 * mes(&r0, "hauteur_prbs"));
    // l'identite, par Init et GetWave
    let rid = lance(avec(&base, obj! {"ibis_recepteur" => ami("ami_ffe.so", j(r#"{"c0": 1, "c1": 0}"#))}), Some(rac));
    let ex = &rid["ami"]["execution"]["recepteur"];
    assert!(ex["chargee"].vrai() && ex["init"].vrai() && ex["getwave"].vrai(), "{}", dumps(ex));
    assert!(ex["parametres_out"] == j(r#"{"c0": 1.0, "c1": 0.0, "taps": 2.0}"#), "{}", dumps(ex));
    assert!(txt(ex, "parametres_in") == "(ffe_test (c0 1) (c1 0) (echec 0))", "{}", dumps(ex));
    assert!(txt(ex, "message").contains("64 ech./bit"));
    // 1e-6 : il reste 6e-8, la reponse a un echelon du flot AMI etant tenue a
    // sa valeur un pas d'oeil plus tot que celle de l'oeil. Les 2,8e-6 d'avant
    // venaient de la reponse a un bit coupee une UI trop tot (`oeil._un_bit`).
    for cle in ["hauteur_prbs", "hauteur_pire", "retard"] {
        proche(mes(&rid, cle), mes(&r0, cle), 1e-6, &format!("identite : {cle}"));
    }
    assert!(mes(&rid, "largeur_prbs_ui") == mes(&r0, "largeur_prbs_ui"));
    assert!(dit(&avertis(&rid), "exécuté(s) : récepteur"));
    assert!(rid["ami"]["execution_ok"] == j(r#"["recepteur"]"#));
    // la FFE a l'emetteur, par AMI_Init
    let rtx = lance(avec(&base, obj! {"ibis_emetteur" => ami("ami_ffe.so", obj! {})}), Some(rac));
    proche(mes(&rtx, "hauteur_prbs"), mes(&rf, "hauteur_prbs"), 1e-4, "FFE AMI emetteur : hauteur PRBS");
    proche(mes(&rtx, "hauteur_pire"), mes(&rf, "hauteur_pire"), 1e-4, "FFE AMI emetteur : pire cas");
    assert!(rtx["egalisation"]["ffe"] == j("[1.0]"));
    assert!(n(&rtx["ami"]["execution"]["emetteur"]["parametres_out"]["taps"]) == 2.0);
    // une surcharge passe dans la chaine
    let rtx2 = lance(avec(&base, obj! {"ibis_emetteur" => ami("ami_ffe.so", j(r#"{"c1": -0.2}"#))}), Some(rac));
    assert!(txt(&rtx2["ami"]["execution"]["emetteur"], "parametres_in").contains("(c1 -0.2)"));
    proche(mes(&rtx2, "hauteur_prbs"), mes(&rf2, "hauteur_prbs"), 1e-4, "surcharge c1");
    // la meme FFE au recepteur, par GetWave : lineaire, meme oeil
    let rrx = lance(avec(&base, obj! {"ibis_recepteur" => ami("ami_ffe.so", obj! {})}), Some(rac));
    proche(mes(&rrx, "hauteur_prbs"), mes(&rf, "hauteur_prbs"), 1e-4, "FFE AMI recepteur (GetWave) : hauteur PRBS");
    proche(mes(&rrx, "hauteur_pire"), mes(&rf, "hauteur_pire"), 1e-4, "FFE AMI recepteur (Init) : pire cas");
    assert!(n(&rrx["ami"]["horloges"]["n"]) == 0.0);
    assert!(dit(&avertis(&rrx), "GetWave"));
    // les replis
    for (lib, racines, par, attendu) in [
        ("absent.so", Some(rac), obj! {}, "introuvable"),
        ("http://exemple/x.so", Some(rac), obj! {}, "invalide"),
        ("ami_ffe.so", None, obj! {}, "Aucun dossier"),
        ("ami_ffe.so", Some(rac), j(r#"{"echec": 1}"#), "a échoué"),
    ] {
        let r = lance(avec(&base, obj! {"ibis_recepteur" => ami(lib, par)}), racines);
        let ex = &r["ami"]["execution"]["recepteur"];
        assert!(!ex["init"].vrai(), "{lib} {}", dumps(ex));
        assert!(mes(&r, "hauteur_prbs") == mes(&r0, "hauteur_prbs"), "{lib}");
        assert!(avertis(&r).iter().any(|a| a.contains(attendu) && a.contains("repli")), "{lib} {:?}", avertis(&r));
        assert!(!r["ami"]["execution_ok"].vrai(), "{lib}");
    }
    // (une bibliotheque sans AMI_Init n'est pas un modele : dans rust/ibis)
    let _ = std::fs::remove_dir_all(&d);
}

/// 32767 bits a 64 echantillons : chaque tableau pese 17 Mo, et l'oeil en
/// tenait treize a la fois (219 Mo). Les tableaux morts sont rendus : 126 Mo,
/// et le PRBS15 atteint toujours le pire cas de la liaison.
/// (Le pic de memoire, que tracemalloc mesurait en Python, n'est pas mesure ici.)
fn le_prbs15_tient_dans_un_petit_poste() {
    let o = j(r#"{"debit": 1e8, "tr": 50e-12, "v_haut": 1.0, "v_bas": 0.0,
                  "r_source": 20.0, "r_charge": 0.0, "c_charge": 0.0, "motif": "prbs15"}"#);
    let p = ok(_params(&o, None));
    let (df, np_, _, _) = grille(1e8, 50e-12, 20e-9, 0.0);
    let f = frequences(df, np_);
    let canal = ligne_ideale(&f, 50.0, 20e-9, 1.0);
    let r = ok(oeil(&f, Canal::Abcd(&canal), &p, None, None, None, None, None));
    proche(mes(&r, "hauteur_prbs"), mes(&r, "hauteur_pire"), 1e-6, "hauteur");
    assert!(els(&r["densite"]["comptes"]).iter().map(n).sum::<f64>() >= 32767.0 * 64.0);
}

/// Le niveau etabli de l'oeil est le diviseur Rl / (Rs + Rdc + Rl), Rdc
/// la resistance continue de la piste (1 / sigma w t) : Re(B) au premier
/// point de la grille, effet de peau compris, le mettait 0,24 a 0,78 % trop
/// bas (`oeil.r_continu`, `simulation_em.simuler` « r_continu »).
fn niveau_etabli_diviseur_resistif_exact() {
    for (longueur, debit) in [(60.0, 2e9), (300.0, 2e9), (1000.0, 1e9)] {
        let r_dc = longueur * 1e-3 / (5.8e7 * 0.2e-3 * 35e-6);
        let d = _doc(vec![brin(0.0, longueur, 0.0, "P")],
                     obj! {"debit" => debit, "tr" => 50e-12, "v_haut" => 1.0, "v_bas" => 0.0,
                           "r_source" => 50.0, "r_charge" => 50.0, "c_charge" => 0.0}, vec![], &[]);
        let r = an(&d);
        proche(n(&r["grille"]["h0"]), 50.0 / (100.0 + r_dc), 1e-4, &format!("niveau etabli, {longueur} mm"));
        assert!(!contient(&r["parametres"], "exces_continu"));
    }
}

/// Paire dissymetrique, simulee brin par brin : le niveau etabli est le
/// diviseur Rl / (Rs + Rdc_P + Rdc_N + Rl), chaque Rdc la resistance
/// continue de son brin (largeur, surlongueur) -- Re(B) au premier point,
/// effet de peau compris, le mettait trop bas (`_continu_brins`,
/// `simulation_em` « r_continu_brins »).
fn niveau_etabli_paire_dissymetrique_exact() {
    let o = base_2g();
    for ((lp, wp), (ln, wn)) in [((300.0, 0.2), (300.0, 0.4)), ((300.0, 0.2), (306.0, 0.2))] {
        let r = an(&_doc(vec![_brin(0.0, lp, 0.0, "P", wp, 0, false)], o.clone(),
                         vec![_brin(0.0, ln, 1.2, "N", wn, 0, false)], &[("P", "N")]));
        assert!(contient(&r, "paire_brins"), "paire non dissymetrique");
        let r_dc: f64 = [(lp, wp), (ln, wn)].iter().map(|(l, w)| l * 1e-3 / (5.8e7 * w * 1e-3 * 35e-6)).sum();
        proche(n(&r["grille"]["h0"]), 100.0 / (200.0 + r_dc), 1e-4, &format!("niveau etabli, brins ({lp}, {wp}) / ({ln}, {wn})"));
        assert!(!contient(&r["parametres"], "exces_brins"));
    }
}

/// La part oeil de python/test/banc-entrees-malformees.py : un champ d'un autre type que prevu
/// doit sortir par l'erreur du module (422 lisible), jamais par une « Erreur interne ».
fn malformees() {
    let mut docs: Vec<Json> = [r#"{"adc_db": 3}"#, r#"{"fp1": 0, "fz": 0}"#, r#""pcie3""#, r#"{"fp1": "abc"}"#, r#"{"forme": "pcie3", "fp1": 1e9}"#]
        .iter()
        .map(|c| obj! {"oeil" => obj! {"debit" => 1e9, "ctle" => j(c)}})
        .collect();
    // la cle lue est « stackup » : avec un format valide, un empilage qui n'est pas un objet est un refus
    docs.push(j(r#"{"format": "cao-sim-em-3", "stackup": "x"}"#));
    for doc in &docs {
        match analyser(doc, None, None) {
            Err(e) if !e.interne => {}
            Err(e) => panic!("oeil.analyser({}) : {} au lieu de ErreurOeil", dumps(doc), e.message),
            Ok(_) => panic!("oeil.analyser({}) : accepte", dumps(doc)),
        }
    }
}

pub fn banc() {
    T("la rugosite du plan entre dans la cascade de la paire", la_rugosite_du_plan_entre_dans_la_cascade_de_la_paire);
    T("les condensateurs de liaison coupent le continu", les_condensateurs_de_liaison_coupent_le_continu);
    T("le couplage ac fait deriver les longues suites", le_couplage_ac_fait_deriver_les_longues_suites);
    T("le couplage ac de la paire par brin", le_couplage_ac_de_la_paire_par_brin);
    T("l ami getwave de l emetteur fait la forme d onde", l_ami_getwave_de_l_emetteur_fait_la_forme_d_onde);
    T("l horloge recuperee par l ami fixe l echantillonnage", l_horloge_recuperee_par_l_ami_fixe_l_echantillonnage);
    T("l ami lit la forme d onde des tampons ibis", l_ami_lit_la_forme_d_onde_des_tampons_ibis);
    T("le modele ami execute concorde avec la ffe interne", le_modele_ami_execute_concorde_avec_la_ffe_interne);
    T("le prbs15 tient dans un petit poste", le_prbs15_tient_dans_un_petit_poste);
    T("niveau etabli diviseur resistif exact", niveau_etabli_diviseur_resistif_exact);
    T("niveau etabli paire dissymetrique exact", niveau_etabli_paire_dissymetrique_exact);
    T("entrees malformees : oeil.analyser refuse proprement", malformees);
}
