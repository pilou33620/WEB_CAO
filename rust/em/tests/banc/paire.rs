//! Le bilan d'impact, la cascade differentielle et le partage de la paire (cas de banc-ligne-mom.py).

use crate::*;
use crate::appariement::*;
use crate::empilage_vias::*;
use crate::moignons_cavite::*;

/// Zone optimale (<= 1.8 mm) vs vigilance (1.8 < d <= 5.0 mm) et calcul d'impact HF.
fn bilan_impact_physique_hf_et_zone_de_vigilance() {
    let stack_gnd = vec![_cu("TOP", "signal"), _di("PP", 0.200, 4.30),
                         avec(&_cu("L1", "plane"), &[("net", "GND".j())]), _di("CORE", 1.065, 4.50),
                         avec(&_cu("L2", "plane"), &[("net", "GND".j())]), _di("PP2", 0.200, 4.30),
                         _cu("BOT", "signal")];
    let mut d_opt = _doc_moignon_f(&stack_gnd, 0, 6,
                                   &_via_moignon_p(Some((0, 6)), None, &[_retour_via(10.7, 0.0)], None),
                                   10e6, 1e9);
    poser(&mut d_opt, "temps_montee", 35e-12);
    let r_opt = sim(&d_opt);
    let t_opt = tr0(&r_opt);
    assert!(t(&t_opt["retour"]["statut"]) == "optimal", "statut opt: {}", t(&t_opt["retour"]["statut"]));
    let imp_opt = &t_opt["impact_retour"];
    assert!(t(&imp_opt["statut"]) == "optimal", "impact opt: {}", t(&imp_opt["statut"]));
    assert!((n(&imp_opt["fknee_hz"]) - 10e9).abs() < 1e6, "fknee: {}", n(&imp_opt["fknee_hz"]));
    assert!(n(&imp_opt["z_knee_ohm"]) > 0.0, "z_knee <= 0");
    assert!(n(&imp_opt["ground_bounce_v"]) > 0.0, "gb <= 0");

    let mut d_vigi = _doc_moignon_f(&stack_gnd, 0, 6,
                                    &_via_moignon_p(Some((0, 6)), None, &[_retour_via(13.65, 0.0)], None),
                                    10e6, 1e9);
    poser(&mut d_vigi, "temps_montee", 35e-12);
    let r_vigi = sim(&d_vigi);
    let t_vigi = tr0(&r_vigi);
    assert!(t(&t_vigi["retour"]["statut"]) == "vigilance", "statut vigi: {}", t(&t_vigi["retour"]["statut"]));
    assert!(n(&t_vigi["retour"]["retenus"]) == 1.0, "retenus: {}", n(&t_vigi["retour"]["retenus"]));
    let imp_vigi = &t_vigi["impact_retour"];
    assert!(t(&imp_vigi["statut"]) == "vigilance", "impact vigi statut: {}", t(&imp_vigi["statut"]));
    assert!(n(&imp_vigi["l_boucle_nh"]) > n(&imp_opt["l_boucle_nh"]), "l_boucle non superieure");
    assert!(n(&imp_vigi["z_knee_ohm"]) > n(&imp_opt["z_knee_ohm"]), "z_knee non superieure");
    assert!(n(&imp_vigi["ground_bounce_v"]) > n(&imp_opt["ground_bounce_v"]), "gb non superieur");
    assert!(n(&imp_vigi["gain_z_ohm"]) > 0.0, "gain_z <= 0");
    assert!(n(&imp_vigi["gain_gb_v"]) > 0.0, "gain_gb <= 0");
    if contient(imp_vigi, "gain_cem_db") {
        assert!(n(&imp_vigi["gain_cem_db"]) > 5.0, "gain_cem <= 5: {}", n(&imp_vigi["gain_cem_db"]));
    }
}

/// Parametres S en mode mixte pour une paire differentielle :
/// - Sdd : differentiel pur sur Zref,diff (ex: 100 ohm)
/// - Scc : mode commun pur sur Zref,comm = Zref,diff / 4 (ex: 25 ohm)
/// - Scd : conversion differentiel -> commun avec skew
/// - Exports Touchstone .s2p dedies
fn la_cascade_differentielle_produit_sdd_scc_scd() {
    let piste_p = vec![_pis(0.0, 0.0, 30.0, 0.0, "SIG_P")];
    let voisinage = vec![_pis(0.0, 0.45, 30.0, 0.45, "SIG_N")];
    let paires = || Some(j(r#"[["SIG_P", "SIG_N"]]"#));
    let mut doc = _doc_couplage_p(piste_p.clone(), voisinage, None, paires());
    poser(&mut doc, "net", "SIG_P");
    poser(&mut doc, "cible_diff", 100.0);

    let res = sim(&doc);
    assert!(!nul(&res["s_diff"]), "s_diff absent du resultat");
    let sd = &res["s_diff"];
    assert!(t(&sd["partenaire"]) == "SIG_N", "partenaire: {}", dumps(&sd["partenaire"]));
    assert!(n(&sd["z_ref_diff"]) == 100.0, "z_ref_diff: {}", n(&sd["z_ref_diff"]));
    assert!(n(&sd["z_ref_comm"]) == 25.0, "z_ref_comm: {}", n(&sd["z_ref_comm"]));
    let nf = els(&res["freqs"]).len();
    assert!(els(&sd["s_dd"]).len() == nf, "nb points s_dd");
    assert!(els(&sd["s_cc"]).len() == nf, "nb points s_cc");
    assert!(els(&sd["s_cd"]).len() == nf, "nb points s_cd");

    // Verifie la structure des matrices 2x2 aplaties (4 elements [re, im])
    assert!(els(&sd["s_dd"][0]).len() == 4, "format matrice s_dd");
    assert!(els(&sd["s_cc"][0]).len() == 4, "format matrice s_cc");

    // Touchstone .s2p
    assert!(t(&sd["touchstone_sdd"]).contains("# HZ S MA R 100"), "entete touchstone_sdd");
    assert!(t(&sd["touchstone_scc"]).contains("# HZ S MA R 25"), "entete touchstone_scc");

    // Verifie que le calcul single-ended est reste intact
    assert!(els(&res["s"]).len() == nf, "res['s'] intact");
    assert!(!t(&res["touchstone"]).is_empty(), "res['touchstone'] intact");

    // Test avec skew de longueur pour declencher la conversion Scd
    let voisinage_skew = vec![_pis(0.0, 0.45, 32.5, 0.45, "SIG_N")];
    let mut doc_skew = _doc_couplage_p(piste_p, voisinage_skew, None, paires());
    poser(&mut doc_skew, "net", "SIG_P");
    let res_skew = sim(&doc_skew);
    let sd_skew = &res_skew["s_diff"];
    assert!(n(&sd_skew["delta_l_mm"]) > 1.9, "delta_l_mm skew detecte: {}", n(&sd_skew["delta_l_mm"]));
    // Scd21 doit augmenter avec la frequence en presence de skew
    let scd = els(&sd_skew["s_cd"]);
    let scd_hf = &scd[scd.len() - 1][2]; // element 2 = Scd21 [re, im]
    assert!(Complex64::new(n(&scd_hf[0]), n(&scd_hf[1])).norm() > 1e-4, "conversion Scd21 presente");
}

/// Les deux moities d'une paire arrivent ensemble : on les separe ICI.
///
/// UNE PAIRE ENVOYEE ENTIERE N'EST PAS UNE LIGNE A DEUX MORCEAUX. La page
/// laisse designer les deux pistes d'un seul geste, et tout tombe alors dans
/// `geometry.objects`. Mise en cascade telle quelle, la fiche decrirait une
/// ligne unique qui saute d'un net a l'autre -- et ne trouverait AUCUN
/// couplage, la partenaire n'etant pas la ou le couplage se lit.
///
/// LE PARTAGE SE FAIT UNE FOIS, DANS `_partager_paire`, ET AVANT TOUT LE
/// RESTE. `_couplage` ne le refait pas : il recoit `objets` deja partage.
fn une_paire_envoyee_entiere_est_partagee_avant_la_cascade() {
    let p_plus = _pis(0.0, 0.0, 30.0, 0.0, "SIG_P");
    let p_moins = _pis(0.0, 0.45, 30.0, 0.45, "SIG_N");
    let nets = |l: &[Json]| l.iter().map(|o| t(&o["net"]).to_string()).collect::<Vec<_>>();

    // (1) UNE PAIRE DECLAREE DECIDE SEULE de qui est la principale.
    let mut doc = _doc_couplage_p(vec![p_plus.clone(), p_moins.clone()], vec![], None, Some(j(r#"[["SIG_N", "SIG_P"]]"#)));
    poser(&mut doc, "net", "");
    let retenus = _partager_paire(&mut doc, vec![p_plus.clone(), p_moins.clone()]);
    assert!(nets(&retenus) == ["SIG_N"], "{:?}", nets(&retenus));
    assert!(nets(els(&doc["voisinage"])) == ["SIG_P"], "{}", dumps(&doc["voisinage"]));
    assert!(t(&doc["net"]) == "SIG_N", "{}", dumps(&doc["net"]));

    // (2) SANS PAIRE DECLAREE, LE NET NOMME PAR LE DOCUMENT l'emporte, et la
    // paire est declaree pour que `_couplage` la retrouve.
    let mut doc = _doc_couplage(vec![p_plus.clone(), p_moins.clone()], vec![]);
    poser(&mut doc, "net", "SIG_N");
    let retenus = _partager_paire(&mut doc, vec![p_plus.clone(), p_moins.clone()]);
    assert!(nets(&retenus) == ["SIG_N"], "{:?}", nets(&retenus));
    assert!(doc["paires"] == j(r#"[["SIG_N", "SIG_P"]]"#), "{}", dumps(&doc["paires"]));

    // (3) SANS RIEN DU TOUT, L'ORDRE ALPHABETIQUE -- arbitraire, mais STABLE :
    // deux analyses du meme dessin ne doivent pas rendre deux fiches.
    for _ in 0..5 {
        let mut doc = _doc_couplage(vec![p_moins.clone(), p_plus.clone()], vec![]);
        poser(&mut doc, "net", "");
        let retenus = _partager_paire(&mut doc, vec![p_moins.clone(), p_plus.clone()]);
        assert!(nets(&retenus) == ["SIG_N"], "{:?}", nets(&retenus));
        assert!(doc["paires"] == j(r#"[["SIG_N", "SIG_P"]]"#), "{}", dumps(&doc["paires"]));
    }

    // (4) LE VOISINAGE DEJA FOURNI N'EST PAS JETE : la moitie versee passe
    // DEVANT, pour survivre a l'ecretage a MAX_VOISINAGE.
    let autre = _pis(0.0, 1.2, 30.0, 1.2, "BRUIT");
    let mut doc = _doc_couplage(vec![p_plus.clone(), p_moins.clone()], vec![autre]);
    poser(&mut doc, "net", "SIG_P");
    _partager_paire(&mut doc, vec![p_plus.clone(), p_moins.clone()]);
    assert!(nets(els(&doc["voisinage"])) == ["SIG_N", "BRUIT"],
            "{}", dumps(&doc["voisinage"]));

    // (5) UN SEUL NET : ON NE TOUCHE A RIEN. C'est le cas ordinaire, et une
    // ligne coupee en deux n'est pas une paire.
    let mut doc = _doc_couplage(vec![p_plus.clone(), _pis(30.0, 0.0, 60.0, 0.0, "SIG_P")], vec![]);
    let avant = doc["voisinage"].clone();
    let objets = els(&doc["geometry"]["objects"]).to_vec();
    let retenus = _partager_paire(&mut doc, objets);
    assert!(retenus.len() == 2, "{:?}", nets(&retenus));
    assert!(doc["voisinage"] == avant && !contient(&doc, "paires"), "{}", dumps(&doc));

    // (6) ET LE PARTAGE ARRIVE BIEN JUSQU'A LA CASCADE : une paire envoyee
    // entiere, sans voisinage, rend les memes modes mixtes qu'une paire
    // correctement separee a la main.
    let mut ensemble = _doc_couplage(vec![p_plus.clone(), p_moins.clone()], vec![]);
    poser(&mut ensemble, "net", "SIG_P");
    poser(&mut ensemble, "cible_diff", 100.0);
    let res = sim(&ensemble);
    assert!(!nul(&res["s_diff"]), "la partenaire doit etre vue");
    assert!(t(&res["s_diff"]["partenaire"]) == "SIG_N", "{}", dumps(&res["s_diff"]["partenaire"]));

    let mut separe = _doc_couplage_p(vec![p_plus], vec![p_moins], None, Some(j(r#"[["SIG_P", "SIG_N"]]"#)));
    poser(&mut separe, "net", "SIG_P");
    poser(&mut separe, "cible_diff", 100.0);
    let reference = sim(&separe);
    assert!((n(&res["ligne"]["z0_moyen"]) - n(&reference["ligne"]["z0_moyen"])).abs() < 1e-9,
            "{} {}", n(&res["ligne"]["z0_moyen"]), n(&reference["ligne"]["z0_moyen"]));
}

/// P ET N ECHANGENT LEURS COTES, LA PAIRE NE DISPARAIT PAS.
///
/// Le cas qui l'a demande : HD2_P / HD2_N sur une carte livree, croises par
/// la couche d'en face pour suivre le brochage d'un connecteur. La partenaire
/// etait a gauche sur la premiere moitie, a droite sur la seconde ; moyennee
/// avec son signe, elle tombait sur la selection et etait ecartee comme
/// « chevauchant » -- « aucun couplage trouve » sur la paire la plus serree
/// de la carte. Le miroir rend la MEME Z differentielle qu'une paire qui ne
/// se croise pas : une section et son image ont les memes impedances.
fn une_paire_qui_se_croise_reste_une_paire() {
    let nn = vec![_pis(0.0, 0.0, 10.0, 0.0, "SIG_N"), _pis(15.0, 0.0, 25.0, 0.0, "SIG_N")];
    let paires = || Some(j(r#"[["SIG_N", "SIG_P"]]"#));
    let mut croisee = _doc_couplage_p(nn.clone(), vec![_pis(0.0, 0.5, 10.0, 0.5, "SIG_P"),
                                                       _pis(15.0, -0.5, 25.0, -0.5, "SIG_P")],
                                      None, paires());
    let mut droite = _doc_couplage_p(nn, vec![_pis(0.0, 0.5, 10.0, 0.5, "SIG_P"),
                                              _pis(15.0, 0.5, 25.0, 0.5, "SIG_P")],
                                     None, paires());
    for d in [&mut croisee, &mut droite] {
        poser(d, "net", "SIG_N");
    }
    let c = couplage_de(croisee, None);
    let reference = couplage_de(droite, None);
    assert!(els(&c["paires"]).len() == 1, "la partenaire croisee est perdue : {:?}",
            els(&c["sections"]).iter().map(|s| dumps(&s["ecartes"])).collect::<Vec<_>>());
    assert!(t(&c["paires"][0]["net_voisin"]) == "SIG_P", "{}", dumps(&c["paires"][0]));
    assert!(n(&c["sections"][0]["croisements"]) == 1.0, "{}", dumps(&c["sections"][0]));
    assert!(n(&reference["sections"][0]["croisements"]) == 0.0, "{}", dumps(&reference["sections"][0]));
    proche(n(&c["paires"][0]["z_diff"]), n(&reference["paires"][0]["z_diff"]), 1e-9,
           "Z diff d'une paire croisee contre la meme sans croisement");
    // LA CARTE DE CHALEUR AUSSI : les deux moities sont peintes.
    assert!(els(&c["chaleur"]).iter().all(|x| x.vrai() && x["z_diff"].vrai()), "{}", dumps(&c["chaleur"]));
}

/// LA COUCHE COMPTE, SAUF AU DROIT D'UN VIA.
///
/// La piste monte au via par un moignon, et repart de l'autre cote en
/// repassant EXACTEMENT sous ce moignon avant de s'en aller. Vu de dessus,
/// le pied du moignon rejoint quatre bouts : le topologue qui ne regardait
/// pas la couche y voyait une derivation, et refusait la cascade -- donc les
/// parametres S en mode mixte de toute la paire. S'y ajoute un troncon de
/// six microns, que les pages produisent en coupant une piste : ses deux
/// bouts tombaient dans le meme noeud et y comptaient deux fois.
fn un_moignon_double_sur_deux_couches_n_est_pas_une_derivation() {
    let objets = vec![_piste(0.0, 0.0, 10.0, 0.0, 0), _piste(10.0, 0.0, 11.0, 1.0, 0),
                      _piste(11.0, 1.0, 10.0, 0.0, 6), _piste(10.0, 0.0, 10.0, -10.0, 6),
                      _piste(10.0, -10.0, 10.006, -10.0, 6), _piste(10.006, -10.0, 20.0, -10.0, 6)];
    let r = sim(&_doc_via(objets));
    let tp = &r["topologie"];
    assert!(t(&tp["genre"]) == "chaine", "un parcours qui repasse sous son moignon\
                                        \x20est classe « {} » : {}",
            t(&tp["genre"]), dumps(&tp["derivations"]));
    // LE MEME XY SANS VIA, SUR DEUX COUCHES, NE RELIE RIEN : deux morceaux.
    let r = sim(&_doc_via(vec![_piste(0.0, 0.0, 10.0, 0.0, 0),
                               _piste(20.0, 0.0, 30.0, 0.0, 6),
                               _piste(10.0, 0.0, 20.0, 0.0, 6)]));
    assert!(n(&r["topologie"]["morceaux"]) == 2.0, "deux couches jointes hors via : {} morceau(x)",
            n(&r["topologie"]["morceaux"]));
}

pub fn banc() {
    titre("Ce que le calcul ne couvre pas");
    T("bilan d'impact physique HF et zone de vigilance du retour", bilan_impact_physique_hf_et_zone_de_vigilance);
    T("cascade differentielle : modes Sdd, Scc, Scd et touchstone mixte", la_cascade_differentielle_produit_sdd_scc_scd);
    T("une paire envoyee entiere est partagee avant la cascade", une_paire_envoyee_entiere_est_partagee_avant_la_cascade);
    T("une paire qui se croise reste une paire", une_paire_qui_se_croise_reste_une_paire);
    T("un moignon double sur deux couches n'est pas une derivation", un_moignon_double_sur_deux_couches_n_est_pas_une_derivation);
}
