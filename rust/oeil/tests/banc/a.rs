//! Les etalons, les gabarits verifies, l'oeil statistique (2.0.0).

use crate::*;
use em::crosstalk;

/// Periode 2^n - 1 et un « 1 » de plus que de « 0 » : la signature d'une
/// sequence a longueur maximale. Une prise fausse donne une periode courte.
fn les_sequences_prbs() {
    for nn in [7usize, 9, 15] {
        let b = ok(prbs(nn as i64));
        assert!(b.len() == (1 << nn) - 1, "PRBS{nn} : {} bits", b.len());
        assert!(b.iter().sum::<i32>() == 1 << (nn - 1), "PRBS{nn} desequilibree");
        // la plus longue suite de 1 fait n bits, et elle est unique
        let txt: String = b.iter().chain(&b[..nn]).map(|x| if *x != 0 { '1' } else { '0' }).collect();
        assert!(txt.contains(&"1".repeat(nn)) && !txt.contains(&"1".repeat(nn + 1)));
    }
}

fn la_ligne_adaptee_rend_un_oeil_parfait() {
    let r = _canal(50.0, 50.0, C::default(), obj! {}, None);
    // 1 V a vide dans 50 + 50 ohms : 0,5 V a la charge, crete a crete.
    proche(mes(&r, "hauteur_prbs"), 0.5, 1e-3, "hauteur PRBS");
    proche(mes(&r, "hauteur_pire"), 0.5, 1e-3, "hauteur pire cas");
    assert!(mes(&r, "largeur_prbs_ui") > 0.97, "{}", mes(&r, "largeur_prbs_ui"));
    proche(mes(&r, "retard"), 1e-9, 0.02, "retard de la ligne");
    assert!(mes(&r, "isi_pire") < 1e-3, "{}", mes(&r, "isi_pire"));
    assert!(avertis(&r).is_empty(), "{:?}", avertis(&r));
}

/// Rs = 30 ohms, ligne de 1 ns ouverte, 1 Gb/s : les echos reviennent
/// tous les 2 ns, soit aux curseurs pairs. Principal 2 x 50/80 = 1,25 ;
/// echos 1,25 (Gs GL)^m avec Gs = -0,25 et GL = 1 ; somme 1,25/3. Demi-
/// excursion 0,5 V : oeil pire cas 2 x 0,5 x (1,25 - 1,25/3) = 0,8333 V.
fn le_treillis_de_bewley_donne_le_pire_cas() {
    let r = _canal(30.0, 0.0, C::default(), obj! {}, None);
    proche(mes(&r, "principal"), 0.625, 2e-3, "curseur principal");
    proche(mes(&r, "hauteur_pire"), 2.0 * 0.5 * (1.25 - 1.25 / 3.0), 3e-3, "oeil pire cas");
    assert!(mes(&r, "hauteur_prbs") >= mes(&r, "hauteur_pire") - 1e-6);
}

/// Rs = 10 ohms : Gs = -2/3, la somme des echos (2 x 1,667) depasse le
/// principal (1,667) -- l'oeil pire cas est ferme, sa hauteur negative.
fn un_oeil_ferme_se_dit_ferme() {
    let r = _canal(10.0, 0.0, C::default(), obj! {}, None);
    proche(mes(&r, "hauteur_pire"), 0.5 * (1.6667 - 3.3333) * 2.0, 0.01, "oeil pire cas ferme");
    assert!(mes(&r, "largeur_pire_ui") == 0.0);
}

fn le_pire_cas_n_est_jamais_plus_ouvert_que_le_prbs() {
    for pertes in [0.5, 2.0, 5.0] {
        for motif in ["prbs7", "prbs9"] {
            let r = _canal(50.0, 50.0, c5(pertes), obj! {"motif" => motif}, None);
            assert!(mes(&r, "hauteur_pire") <= mes(&r, "hauteur_prbs") + 1e-9,
                    "{pertes} {motif} {} {}", mes(&r, "hauteur_pire"), mes(&r, "hauteur_prbs"));
        }
    }
}

fn le_ctle_ouvre_un_oeil_ferme_par_les_pertes() {
    let spec = j(r#"{"forme": "usb3", "adc": 0.667, "fz": 650e6, "fp1": 1.95e9, "fp2": 5e9}"#);
    let brut = _canal(50.0, 50.0, c5(6.0), obj! {}, None);
    let eg = _canal(50.0, 50.0, c5(6.0), obj! {"ctle" => &spec}, None);
    assert!(mes(&eg, "hauteur_pire") > mes(&brut, "hauteur_pire") + 0.02, "{} {}", mes(&brut, "hauteur_pire"), mes(&eg, "hauteur_pire"));
    // le gain continu du CTLE est bien celui annonce
    proche(ctle(&[1.0], &spec)[0].norm(), 0.667, 1e-6, "Adc du CTLE");
    let hf = avec(&spec, obj! {"forme" => "pcie3", "adc_db" => -6i64});
    proche(ctle(&[1.0], &hf)[0].norm(), 10f64.powf(-6.0 / 20.0), 1e-6, "Adc du CTLE PCIe");
    // entre ses deux poles, le CTLE PCIe remonte vers un gain de 1 (0,76 avec
    // des poles a 2 et 8 GHz, trop proches pour qu'il l'atteigne)
    let crete = maxi(ctle(&linspace(1e9, 1e10, 200), &hf).iter().map(|z| z.norm()));
    assert!(0.7 < crete && crete <= 1.0, "{crete}");
}

fn la_pre_accentuation_et_le_dfe_ouvrent_l_oeil() {
    let c = _de_emphase(-3.5);
    proche(20.0 * ((c[0] + c[1]) / (c[0] - c[1])).log10(), -3.5, 1e-3, "desaccentuation");
    proche(c[0] - c[1], 1.0, 1e-9, "excursion pleine");
    let brut = _canal(50.0, 50.0, c5(6.0), obj! {}, None);
    let ffe = _canal(50.0, 50.0, c5(6.0), obj! {"ffe" => c, "ffe_principal" => 0i64}, None);
    assert!(mes(&ffe, "hauteur_pire") > mes(&brut, "hauteur_pire"));
    let r = _canal(50.0, 50.0, c5(6.0), obj! {"dfe_prises" => 1i64, "dfe_max" => 1.0}, None);
    let d1 = n(&r["egalisation"]["dfe_v"][0]);
    assert!(d1 != 0.0);
    // LE DFE RETIRE EXACTEMENT LE PREMIER POST-CURSEUR : l'ouverture gagne
    // deux fois sa valeur, a l'instant d'echantillonnage retenu.
    assert!(mes(&r, "hauteur_pire") > mes(&brut, "hauteur_pire"));
    // Et il est borne : avec 1 mV de plage, il ne retire qu'1 mV.
    let r2 = _canal(50.0, 50.0, c5(6.0), obj! {"dfe_prises" => 1i64, "dfe_max" => 1e-3}, None);
    assert!(n(&r2["egalisation"]["dfe_v"][0]).abs() <= 1e-3 + 1e-12);
}

fn la_marge_est_le_facteur_d_agrandissement() {
    let carre = [[-1.0, -1.0], [1.0, -1.0], [1.0, 1.0], [-1.0, 1.0]];
    let jj = jauge(&carre, &[[0.0, 0.0], [1.0, 0.0], [0.5, 0.25], [2.0, 2.0], [-3.0, 0.0]]);
    for (vu, att) in jj.iter().zip([0.0, 1.0, 0.5, 2.0, 3.0]) {
        proche(vu + 1.0, att + 1.0, 1e-12, "jauge");
    }
    // Le sens de parcours ne change rien.
    let envers: Vec<[f64; 2]> = carre.iter().rev().copied().collect();
    proche(jauge(&envers, &[[0.5, 0.25]])[0], 0.5, 1e-12, "jauge sens horaire");
    // Les unites ne changent rien : axe des tensions en millivolts.
    let gros: Vec<[f64; 2]> = carre.iter().map(|q| [q[0], 1000.0 * q[1]]).collect();
    proche(jauge(&gros, &[[0.5, 250.0]])[0], 0.5, 1e-12, "jauge unites");
}

/// Un oeil pire cas plat a +-0,25 V sur toute l'UI, un carre de +-0,2 V :
/// le carre grandit de 25 % avant de toucher. Ferme sur une seule phase sous
/// le gabarit, l'oeil ne laisse plus rien passer.
fn la_marge_pire_cas_se_lit_dans_l_ouverture() {
    let taus: Vec<f64> = (0..64).map(|i| i as f64 / 64.0 - 0.5).collect();
    let carre = [[-0.1, -0.2], [0.1, -0.2], [0.1, 0.2], [-0.1, 0.2]];
    let m = marge_pire(&carre, &taus, &[Some(0.25); 64], &[Some(-0.25); 64]);
    proche(m + 1.0, 1.25, 1e-6, "marge pire cas");
    let mut h = [Some(0.25); 64];
    h[32] = Some(-0.01);
    assert!(marge_pire(&carre, &taus, &h, &[Some(-0.25); 64]) < 0.0);
}

/// Le PRBS n'est qu'un ensemble de sequences parmi toutes : sa marge est
/// au moins celle du pire cas. Le contraire est arrive, quand la frontiere
/// pire cas etait jugee comme une trace -- elle plonge sous le seuil dans les
/// croisements, la ou les vraies traces passent par zero.
fn la_marge_pire_cas_ne_depasse_jamais_celle_du_prbs() {
    let g = j(r#"{"id": "essai", "masque": {"type": "hexagone", "largeur_ui": 0.3, "plat_ui": 0.0, "hauteur_v": 0.05}}"#);
    for pertes in [0.5, 2.0, 4.0] {
        let r = _canal(50.0, 50.0, c5(pertes), obj! {"v_bas" => -1.0}, Some(&g));
        assert!(mes(&r, "marge_pire") <= mes(&r, "marge") + 1e-9, "{pertes} {}", dumps(&r["mesures"]));
    }
}

fn un_gabarit_touche_se_compte() {
    // Oeil parfait de 0,5 V centre sur 0,25 V : un hexagone de 0,4 V centre
    // sur 0 deborde sous le niveau bas... on le recentre sur le seuil.
    let g = j(r#"{"id": "essai", "nom": "essai", "fiabilite": "derive",
                  "masque": {"type": "polygone",
                             "points": [[-0.3, 0.25], [-0.1, 0.45], [0.1, 0.45],
                                        [0.3, 0.25], [0.1, 0.05], [-0.1, 0.05]]}}"#);
    let r = _canal(50.0, 50.0, C::default(), obj! {}, Some(&g));
    assert!(mes(&r, "violations") == 0.0, "{}", dumps(&r["mesures"]));
    // 0,25 V de demi-ouverture contre 0,20 : marge 25 %, a la resolution
    // d'echantillonnage pres.
    assert!(0.15 < mes(&r, "marge") && mes(&r, "marge") < 0.26, "{}", mes(&r, "marge"));
    let g2 = avec(&g, j(r#"{"masque": {"type": "polygone",
                                       "points": [[-0.3, 0.25], [-0.1, 0.6], [0.1, 0.6],
                                                  [0.3, 0.25], [0.1, -0.1], [-0.1, -0.1]]}}"#));
    let m2 = _canal(50.0, 50.0, C::default(), obj! {}, Some(&g2));
    assert!(mes(&m2, "violations") > 0.0 && mes(&m2, "marge") < 0.0, "{}", dumps(&m2["mesures"]));
    let g3 = avec(&g, obj! {"v_max" => 0.4});
    assert!(mes(&_canal(50.0, 50.0, C::default(), obj! {}, Some(&g3)), "hors_limites") > 0.0);
}

fn les_gabarits_sont_coherents() {
    let mut vus = Noms::new();
    for g in GABARITS() {
        let id = txt(g, "id");
        assert!(vus.insert(id.to_string()), "doublon {id}");
        for cle in ["famille", "nom", "debit", "mode", "lieu", "fiabilite", "source", "masque", "emetteur", "recepteur"] {
            assert!(contient(g, cle), "{id} : {cle} manque");
        }
        assert!(FIABILITES.iter().any(|(k, _)| *k == txt(g, "fiabilite")), "{id}");
        assert!(matches!(txt(g, "mode"), "simple" | "diff"), "{id}");
        let ui = 1.0 / n(&g["debit"]);
        let poly = polygone(Some(g), Some(ui), None, None);
        assert!(poly.len() >= 3, "{id}");
        // convexe et autour de son centre : la jauge du centre vaut 0
        let nn = poly.len() as f64;
        let c = [poly.iter().map(|q| q[0]).sum::<f64>() / nn, poly.iter().map(|q| q[1]).sum::<f64>() / nn];
        assert!(jauge(&poly, &[c])[0] < 1e-9, "{id}");
        assert!(poly.iter().all(|q| q[0].abs() <= 0.5), "{id}");
        let em = &g["emetteur"];
        assert!(n(&em["v_haut"]) > n(&em["v_bas"]), "{id}");
        if txt(g, "mode") == "diff" {
            assert!(c[1].abs() < 1e-9, "{id} : masque differentiel decentre");
        } else {
            // un gabarit a seuils est entre le niveau bas et le niveau haut
            assert!(n(&em["v_bas"]) < c[1] && c[1] < n(&em["v_haut"]), "{id}");
        }
    }
    let et = etat();
    assert!(et["dispo"].vrai() && els(&et["gabarits"]).len() == GABARITS().len());
}

fn les_seuils_prennent_setup_et_hold() {
    let g = gabarit("spi-lvcmos33");
    let poly = polygone(g, Some(40e-9), Some(4e-9), Some(2e-9));
    let mut xs: Vec<f64> = poly.iter().map(|q| q[0]).collect();
    xs.sort_by(f64::total_cmp);
    xs.dedup();
    proche(xs[0], -0.1, 1e-12, "setup en UI");
    proche(xs[1], 0.05, 1e-12, "hold en UI");
    assert!(polygone(g, Some(40e-9), Some(0.0), Some(0.0)).is_empty());
}

fn la_grille_imposee_rend_la_meme_cascade() {
    let d = _doc(vec![_piste(0.0, 0.0, 30.0, 0.0, "SIG", 0.35)], obj! {}, vec![], &[]);
    let libre = em::simulation_em::simuler(&mut d.clone(), None, false, None).unwrap().json;
    let f: Vec<f64> = els(&libre["freqs"]).iter().map(n).collect();
    let imp = simg(&d, &f);
    assert!(imp.abcd.len() == f.len());
    assert!(imp.json["freqs"] == libre["freqs"]);
    for (ml, mi) in els(&libre["s"]).iter().zip(els(&imp.json["s"])) {
        for (a, b) in els(ml).iter().zip(els(mi)) {
            assert!((n(&a[0]) - n(&b[0])).abs() < 1e-12 && (n(&a[1]) - n(&b[1])).abs() < 1e-12);
        }
    }
}

fn un_bus_spi_propre_passe_son_gabarit() {
    let r = an(&_doc(vec![_piste(0.0, 0.0, 60.0, 0.0, "MOSI", 0.35)], obj! {"gabarit" => "spi-lvcmos33"}, vec![], &[]));
    assert!(mes(&r, "violations") == 0.0 && mes(&r, "hors_limites") == 0.0, "{}", dumps(&r["mesures"]));
    assert!(mes(&r, "largeur_prbs_ui") > 0.9, "{}", mes(&r, "largeur_prbs_ui"));
    // haute impedance : presque toute l'excursion a vide arrive
    assert!(mes(&r, "hauteur_prbs") > 3.0, "{}", mes(&r, "hauteur_prbs"));
    assert!(txt(&r["gabarit"], "fiabilite") == "derive");
    assert!(n(&r["densite"]["nx"]) == 2.0 * ECHANTILLONS_UI as f64);
    assert!(els(&r["densite"]["comptes"]).len() as f64 == n(&r["densite"]["nx"]) * n(&r["densite"]["ny"]));
}

fn une_paire_usb2_passe_le_template_1() {
    let r = an(&_paire(60.0, obj! {"gabarit" => "usb2-hs-connecteur"}));
    assert!(txt(&r, "mode") == "diff" && txt(&r, "partenaire") == "USB_DN", "{}", dumps(&r["partenaire"]));
    assert!(mes(&r, "violations") == 0.0 && mes(&r, "hors_limites") == 0.0, "{}", dumps(&r["mesures"]));
    // ±0,4 V sur 90 ohms adaptes
    proche(mes(&r, "niveau_1"), 0.4, 0.03, "niveau haut USB 2.0");
}

fn un_emetteur_trop_faible_viole_le_gabarit() {
    let r = an(&_paire(60.0, obj! {"gabarit" => "usb2-hs-connecteur", "v_haut" => 0.5, "v_bas" => -0.5}));
    assert!(mes(&r, "violations") > 0.0 && mes(&r, "marge") < 0.0);
}

fn le_pcie3_choisit_son_ctle_et_son_dfe() {
    let r = an(&_paire(150.0, obj! {"gabarit" => "pcie-gen3"}));
    let eg = &r["egalisation"];
    let adc = n(&eg["ctle"]["adc_db"]);
    assert!((-12..-5).any(|x| x as f64 == adc), "{}", dumps(&eg["ctle"]));
    assert!(els(&eg["dfe_v"]).len() == 1 && n(&eg["dfe_v"][0]).abs() <= 0.030 + 1e-12);
    assert!(eg["ffe"] == vec![-0.1, 0.7, -0.2].j());
    // sans egaliseur, l'oeil est moins ouvert
    let r0 = an(&_paire(150.0, obj! {"gabarit" => "pcie-gen3", "egaliseur" => false}));
    assert!(nul(&r0["egalisation"]["ctle"]) && !r0["egalisation"]["dfe_v"].vrai());
}

fn les_refus() {
    let sig = || vec![_piste(0.0, 0.0, 30.0, 0.0, "SIG", 0.35)];
    _refus(&_doc(sig(), obj! {"gabarit" => "inconnu"}, vec![], &[]), "gabarit inconnu");
    _refus(&_doc(sig(), obj! {"debit" => 0i64}, vec![], &[]), "debit nul");
    _refus(&_doc(sig(), obj! {"debit" => 1e8, "v_haut" => 0i64, "v_bas" => 1i64}, vec![], &[]), "niveaux inverses");
    _refus(&_doc(sig(), obj! {"debit" => 1e8, "motif" => "prbs31"}, vec![], &[]), "motif inconnu");
    let e = _refus(&_doc(sig(), obj! {"debit" => 1e9, "mode" => "diff"}, vec![], &[]), "paire absente");
    assert!(e.message.to_lowercase().contains("paire"), "{}", e.message);
    // un net ramifie n'a pas de parcours : pas d'oeil
    let t = vec![_piste(0.0, 0.0, 20.0, 0.0, "SIG", 0.35), _piste(20.0, 0.0, 40.0, 0.0, "SIG", 0.35),
                 _piste(20.0, 0.0, 20.0, 15.0, "SIG", 0.35)];
    _refus(&_doc(t, obj! {"debit" => 1e8}, vec![], &[]), "net ramifie");
}

// =============================================================================
// 2.0.0 -- les gabarits verifies
// =============================================================================

/// SATA : la largeur est 1 - TJ de la tolerance du recepteur, en
/// losange ; PCIe 2 et 3 sont recoupes et se jugent a 10^-12 ; USB 2.0
/// extremite (Template 2) est recoupe sur la specification publique
/// (2.3.0) ; HDMI 1.4, dont la norme n'est diffusee que sous accord, est
/// recoupe sur le masque publie par ngscopeclient (figure 4-32). Plus aucun gabarit n'est « a verifier ».
fn les_gabarits_verifies_disent_leur_source() {
    let gb = |id: &str| gabarit(id).unwrap();
    for (gid, larg, h) in [("sata-gen1", 0.49, 0.325), ("sata-gen2", 0.43, 0.275), ("sata-gen3", 0.43, 0.240)] {
        let g = gb(gid);
        assert!(n(&g["masque"]["largeur_ui"]) == larg, "{gid}");
        assert!(n(&g["masque"]["hauteur_v"]) == h, "{gid}");
        assert!(n(&g["masque"]["plat_ui"]) == 0.0, "{gid}");
        assert!(txt(g, "fiabilite") == "corrobore" && n(&g["ber"]) == 1e-12, "{gid}");
    }
    for gid in ["pcie-gen2", "pcie-gen3"] {
        let g = gb(gid);
        assert!(txt(g, "fiabilite") == "corrobore" && n(&g["ber"]) == 1e-12, "{gid}");
    }
    proche(n(&gb("pcie-gen2")["masque"]["hauteur_v"]), 0.120, 1e-12, "PCIe 2 : 120 mV");
    proche(n(&gb("pcie-gen3")["masque"]["hauteur_v"]), 0.025, 1e-12, "PCIe 3 : 25 mV");
    assert!(n(&gb("pcie-gen3")["egaliseur"]["dfe"]["max_v"]) == 0.030);
    let g = gb("usb2-hs-recepteur");
    assert!(txt(g, "fiabilite") == "norme" && txt(g, "source").contains("figure 7-14"));
    assert!(g["masque"]["points"] == j("[[-0.375, 0.0], [-0.15, 0.175], [0.15, 0.175], [0.375, 0.0], [0.15, -0.175], [-0.15, -0.175]]"));
    let g = gb("hdmi14-tmds");
    assert!(txt(g, "fiabilite") == "corrobore" && txt(g, "source").contains("ngscopeclient"), "{}", txt(g, "source"));
    assert!(g["masque"]["points"][0] == j("[-0.35, 0.0]") && n(&g["v_max"]) == 0.780);
    assert!(!GABARITS().iter().any(|x| txt(x, "fiabilite") == "a_verifier"));
}

// =============================================================================
// 2.0.0 -- l'oeil statistique : gigue, bruit, diaphonie
// =============================================================================

/// Ligne adaptee sans pertes, RJ seule : l'oeil a 10^-n se ferme de
/// sigma Q^-1(2 BER) de chaque cote -- la moitie des transitions seulement
/// change de bit, d'ou le facteur deux --, a la resolution de phase pres.
fn la_gigue_aleatoire_suit_l_echelle_q() {
    let rj = 0.05;
    let r = _canal(50.0, 50.0, C::default(), obj! {"rj_ui" => rj}, None);
    let st = &r["statistique"];
    for c in els(&st["contours"]) {
        let att = 1.0 - 2.0 * rj * q_inverse(2.0 * n(&c["ber"]));
        assert!((n(&c["largeur_ui"]) - att).abs() < 0.004, "{} {} {att}", n(&c["ber"]), n(&c["largeur_ui"]));
    }
    // La baignoire, sommee des deux cotes, rend la meme largeur que le
    // contour au seuil : deux lectures de la meme distribution.
    let b: Vec<f64> = els(&st["baignoire"]["ber"]).iter().map(n).collect();
    assert!(maxf(&b) <= 0.5 + 1e-9 && minf(&b) >= 0.0);
    // Q de la baignoire, cote par cote, contre la distance au croisement :
    // la somme des deux Q-distances vaut 1 UI, quel que soit le centrage.
    let tau: Vec<f64> = els(&st["baignoire"]["tau"]).iter().map(n).collect();
    let i_g = tau.iter().position(|t| *t == -0.25).unwrap();
    let i_d = tau.iter().position(|t| *t == 0.25).unwrap();
    let d_g = rj * q_inverse(2.0 * b[i_g]);
    let d_d = rj * q_inverse(2.0 * b[i_d]);
    proche(0.5 + d_g + d_d, 1.0, 0.01, "baignoire en echelle Q");
}

/// DJ en double Dirac : TJ(BER) = DJ + 2 sigma Q^-1(4 BER) -- chaque
/// Dirac porte la moitie des transitions.
fn la_gigue_deterministe_s_ajoute_en_double_dirac() {
    let (rj, dj) = (0.03, 0.2);
    let r = _canal(50.0, 50.0, C::default(), obj! {"rj_ui" => rj, "dj_ui" => dj}, None);
    for c in els(&r["statistique"]["contours"]) {
        let att = 1.0 - dj - 2.0 * rj * q_inverse(4.0 * n(&c["ber"]));
        assert!((n(&c["largeur_ui"]) - att).abs() < 0.004, "{} {} {att}", n(&c["ber"]), n(&c["largeur_ui"]));
    }
}

/// Bruit de 20 mV rms sur un oeil parfait de 0,5 V : a 10^-n, la demi-
/// ouverture est 0,25 - sigma Q^-1(2 BER).
fn le_bruit_gaussien_ferme_l_oeil_comme_erfc() {
    let r = _canal(50.0, 50.0, C::default(), obj! {"bruit_v" => 0.02}, None);
    let st = &r["statistique"];
    for c in els(&st["contours"]) {
        let att = 2.0 * (0.25 - 0.02 * q_inverse(2.0 * n(&c["ber"])));
        assert!((n(&c["hauteur"]) - att).abs() < 2.0 * n(&st["pas_v"]), "{} {} {att}", n(&c["ber"]), n(&c["hauteur"]));
    }
}

/// Le treillis de Bewley (30 ohms, ligne ouverte) n'a qu'une poignee
/// d'echos qui comptent : leur pire alignement a une probabilite de
/// quelques pour mille, et des 10^-6 l'oeil statistique EST le pire cas,
/// a deux cases de tension pres. Il n'est jamais plus ferme que lui.
fn l_oeil_statistique_converge_vers_le_pire_cas() {
    let r = _canal(30.0, 0.0, C::default(), obj! {"statistique" => true}, None);
    let h_pire = mes(&r, "hauteur_pire");
    let st = &r["statistique"];
    for c in els(&st["contours"]) {
        assert!(n(&c["hauteur"]) >= h_pire - 2.0 * n(&st["pas_v"]), "{} {h_pire}", n(&c["hauteur"]));
        assert!((n(&c["hauteur"]) - h_pire).abs() < 2.0 * n(&st["pas_v"]), "{} {h_pire}", n(&c["hauteur"]));
    }
    // Sur une liaison a pertes, l'oeil a 10^-6 est plus ouvert que le pire
    // cas, et il se referme a mesure que le taux descend.
    let r = _canal(50.0, 50.0, C { retard: 3e-9, ..c5(6.0) }, obj! {"statistique" => true}, None);
    let h: Vec<f64> = els(&r["statistique"]["contours"]).iter().map(|c| n(&c["hauteur"])).collect();
    assert!(h.windows(2).all(|w| w[0] >= w[1] - 1e-12), "{h:?}");
    assert!(h[h.len() - 1] >= mes(&r, "hauteur_pire") - 2.0 * n(&r["statistique"]["pas_v"]));
}

/// Un agresseur de 50 mV de crete ferme le pire cas d'exactement deux
/// fois 50 mV, et l'oeil statistique profond d'autant.
fn la_diaphonie_bornee_retranche_sa_crete() {
    let r0 = _canal(30.0, 0.0, C::default(), obj! {}, None);
    let r = _canal(30.0, 0.0, C::default(), j(r#"{"agresseurs": [{"nom": "SCK", "coef": 0.05, "v": 1.0}]}"#), None);
    proche(mes(&r0, "hauteur_pire") - mes(&r, "hauteur_pire"), 0.1, 1e-9, "pire cas moins deux cretes");
    assert!(n(&r["diaphonie"]["crete_totale_v"]) == 0.05);
    let c = els(&r["statistique"]["contours"]).last().unwrap();
    assert!((n(&c["hauteur"]) - mes(&r, "hauteur_pire")).abs() < 3.0 * n(&r["statistique"]["pas_v"]), "{} {}", n(&c["hauteur"]), mes(&r, "hauteur_pire"));
    // L'oeil PRBS, lui, ne la connait pas : la sequence voisine est inconnue.
    proche(mes(&r, "hauteur_prbs"), mes(&r0, "hauteur_prbs"), 1e-12, "PRBS sans diaphonie");
}

/// Les reglages de la 2.0.0 sont facultatifs : sans eux, pas un champ de
/// plus, pas un chiffre de change.
fn sans_gigue_ni_diaphonie_rien_ne_change() {
    let r = _canal(30.0, 0.0, C::default(), obj! {}, None);
    assert!(!contient(&r, "statistique") && !contient(&r, "diaphonie"));
    let r2 = _canal(30.0, 0.0, C::default(), j(r#"{"rj_ui": 0.0, "dj_ui": 0.0, "bruit_v": 0.0, "agresseurs": []}"#), None);
    assert!(!contient(&r2, "statistique"));
    assert!(r["mesures"] == r2["mesures"]);
    assert!(r["pire_cas"] == r2["pire_cas"]);
}

fn le_gabarit_se_juge_aussi_au_taux_d_erreur() {
    let g = j(r#"{"id": "essai", "masque": {"type": "hexagone", "largeur_ui": 0.5, "plat_ui": 0.0, "hauteur_v": 0.2}}"#);
    let r = _canal(50.0, 50.0, C::default(), obj! {"v_bas" => -1.0, "rj_ui" => 0.04}, Some(&g));
    assert!(mes(&r, "ber_cible") == 1e-12);
    // la gigue mange la largeur que le pire cas sans gigue laissait
    assert!(mes(&r, "marge_ber") < mes(&r, "marge_pire"), "{}", dumps(&r["mesures"]));
    proche(mes(&r, "largeur_ber_ui"), 1.0 - 2.0 * 0.04 * q_inverse(2e-12), 0.01, "largeur a 1e-12");
}

/// La voisine de MOSI, prise dans la fiche de couplage, avec le NEXT et
/// le FEXT du niveau 2 de crosstalk.py : le pire cas perd deux fois sa
/// crete, et le coefficient est celui que crosstalk.niveau2 rend.
fn les_voisines_du_couplage_deviennent_des_agresseurs() {
    let objets = || vec![_piste(0.0, 0.0, 60.0, 0.0, "MOSI", 0.35)];
    let vois = || vec![_piste(0.0, 0.6, 60.0, 0.6, "SCK", 0.35)];
    let r = an(&_doc(objets(), obj! {"gabarit" => "spi-lvcmos33", "agresseurs_auto" => true}, vois(), &[]));
    let xt = els(&r["diaphonie"]["agresseurs"]);
    assert!(xt.len() == 1 && txt(&xt[0], "nom") == "SCK", "{}", dumps(&r["diaphonie"]));
    let a = &xt[0];
    assert!(n(&a["coef"]) == maxf(&[n(&a["next"]), n(&a["fext"])]));
    proche(n(&a["crete_v"]), n(&a["coef"]) * 3.3, 1e-9, "crete = coef x 3,3 V");
    assert!(n(&els(&r["statistique"]["contours"]).last().unwrap()["hauteur"]) < mes(&r, "hauteur_prbs"));
    // le meme chiffre que l'onglet Crosstalk, recalcule a la main
    let mut d = _doc(objets(), obj! {}, vois(), &[]);
    poser(dans(&mut d, "analyse"), "temps_montee", 1.5e-9);
    let res = em::simulation_em::simuler(&mut d, None, false, None).unwrap().json;
    let f = els(&res["couplage"]["paires"]).iter().find(|x| txt(x, "net_voisin") == "SCK").unwrap();
    let (zo, ze) = (n(&f["z_impair"]), n(&f["z_pair"]));
    let (eo, ee) = (n(&f["eps_eff_impair"]), n(&f["eps_eff_pair"]));
    let (co, ce) = (eo.sqrt() / zo, ee.sqrt() / ze);
    let (lo, le) = (zo * eo.sqrt(), ze * ee.sqrt());
    let (kc, kl) = ((co - ce) / (co + ce), (le - lo) / (le + lo));
    let td = n(&f["longueur"]) * 1e-3 * (0.5 * (eo + ee)).sqrt() / C_0;
    let n2 = crosstalk::niveau2(&[(0.25 * (kc + kl), 0.5 * (kl - kc), td, 1.0)], 1.5e-9, crosstalk::SEUIL_ORANGE, crosstalk::SEUIL_ROUGE, 1.0);
    proche(n(&a["next"]), n(&n2["next"]), 1e-6, "NEXT du niveau 2");
    proche(n(&a["fext"]), n(&n2["fext"]), 1e-6, "FEXT du niveau 2");
    // sens connu : le FEXT seul, ou le NEXT seul
    let p = ok(_params(&obj! {"gabarit" => "spi-lvcmos33"}, gabarit("spi-lvcmos33")));
    for (sens, cle) in [("meme", "fext"), ("oppose", "next")] {
        let (x, _) = agresseurs_du_couplage(&res["couplage"], &p, &obj! {"agresseurs_sens" => sens}, None, None);
        proche(n(&x[0]["coef"]), n(&a[cle]), 1e-9, sens);
    }
    // la partenaire d'une paire n'est jamais un agresseur
    let (x, notes) = agresseurs_du_couplage(&res["couplage"], &p, &obj! {}, Some("SCK"), None);
    assert!(x.is_empty() && !notes.is_empty());
}

pub fn banc() {
    T("les sequences prbs", les_sequences_prbs);
    T("la ligne adaptee rend un oeil parfait", la_ligne_adaptee_rend_un_oeil_parfait);
    T("le treillis de bewley donne le pire cas", le_treillis_de_bewley_donne_le_pire_cas);
    T("un oeil ferme se dit ferme", un_oeil_ferme_se_dit_ferme);
    T("le pire cas n est jamais plus ouvert que le prbs", le_pire_cas_n_est_jamais_plus_ouvert_que_le_prbs);
    T("le ctle ouvre un oeil ferme par les pertes", le_ctle_ouvre_un_oeil_ferme_par_les_pertes);
    T("la pre accentuation et le dfe ouvrent l oeil", la_pre_accentuation_et_le_dfe_ouvrent_l_oeil);
    T("la marge est le facteur d agrandissement", la_marge_est_le_facteur_d_agrandissement);
    T("la marge pire cas se lit dans l ouverture", la_marge_pire_cas_se_lit_dans_l_ouverture);
    T("la marge pire cas ne depasse jamais celle du prbs", la_marge_pire_cas_ne_depasse_jamais_celle_du_prbs);
    T("un gabarit touche se compte", un_gabarit_touche_se_compte);
    T("les gabarits sont coherents", les_gabarits_sont_coherents);
    T("les seuils prennent setup et hold", les_seuils_prennent_setup_et_hold);
    T("la grille imposee rend la meme cascade", la_grille_imposee_rend_la_meme_cascade);
    T("un bus spi propre passe son gabarit", un_bus_spi_propre_passe_son_gabarit);
    T("une paire usb2 passe le template 1", une_paire_usb2_passe_le_template_1);
    T("un emetteur trop faible viole le gabarit", un_emetteur_trop_faible_viole_le_gabarit);
    T("le pcie3 choisit son ctle et son dfe", le_pcie3_choisit_son_ctle_et_son_dfe);
    T("les refus", les_refus);
    T("les gabarits verifies disent leur source", les_gabarits_verifies_disent_leur_source);
    T("la gigue aleatoire suit l echelle q", la_gigue_aleatoire_suit_l_echelle_q);
    T("la gigue deterministe s ajoute en double dirac", la_gigue_deterministe_s_ajoute_en_double_dirac);
    T("le bruit gaussien ferme l oeil comme erfc", le_bruit_gaussien_ferme_l_oeil_comme_erfc);
    T("l oeil statistique converge vers le pire cas", l_oeil_statistique_converge_vers_le_pire_cas);
    T("la diaphonie bornee retranche sa crete", la_diaphonie_bornee_retranche_sa_crete);
    T("sans gigue ni diaphonie rien ne change", sans_gigue_ni_diaphonie_rien_ne_change);
    T("le gabarit se juge aussi au taux d erreur", le_gabarit_se_juge_aussi_au_taux_d_erreur);
    T("les voisines du couplage deviennent des agresseurs", les_voisines_du_couplage_deviennent_des_agresseurs);
}
