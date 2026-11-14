//! Les vias hors chaine et la topologie de la selection (cas de banc-ligne-mom.py).

use crate::*;
use crate::empilage_vias::*;
use crate::moignons_cavite::*;

/// La fiche du premier via hors chaine.
fn seul0(r: &Json) -> &Json {
    &r["discontinuites"]["vias_hors_chaine"][0]
}

/// DE QUOI TRACER LE CHEVELU, ET D'UNE SEULE SOURCE.
///
/// La fiche disait deja quels vias de masse entourent un via de signal, a
/// quelle distance, lesquels sont retenus et quelle part chacun porte. Il y
/// manquait l'ORIGINE des traits : la position du via lui-meme. Sans elle une
/// page qui veut dessiner ce que le modele a retenu doit retrouver le point
/// par un autre chemin -- et deux chemins pour une meme grandeur finissent
/// toujours par en donner deux valeurs, le dessin d'un cote et la fiche de
/// l'autre.
fn la_fiche_du_retour_dit_ou_est_le_via() {
    let v = _via_moignon_p(Some((0, 6)), None, &[j(r#"{"x": 10.6, "y": 0.0, "net": "GND",
                                     "layer_from": 0, "layer_to": 6,
                                     "drill_diameter": 0.25}"#)], None);
    let r = sim(&_doc_moignon(&_QUATRE_GND(), 0, 6, &v));
    let ret = &tr0(&r)["retour"];
    proche(n(&ret["x"]), 10.0, 1e-9, "l'abscisse du via de signal");
    // `proche` compare en RELATIF : une valeur attendue nulle y divise par
    // zero. L'ordonnee se compare donc en absolu, ce qui est de toute facon
    // ce qu'on veut dire ici -- un point, pas un rapport.
    assert!(n(&ret["y"]).abs() < 1e-9, "l'ordonnee du via de signal : {}", n(&ret["y"]));
    // ET C'EST LE MEME REPERE QUE CELUI DES VIAS DE RETOUR : le trait va de
    // l'un a l'autre, il faut donc que les deux bouts soient dans la meme
    // unite et la meme origine.
    proche(n(&ret["vias"][0]["x"]), 10.6, 1e-9, "l'abscisse du via de retour");
    proche(((n(&ret["vias"][0]["x"]) - n(&ret["x"])).powi(2)
            + (n(&ret["vias"][0]["y"]) - n(&ret["y"])).powi(2)).sqrt(),
           n(&ret["vias"][0]["distance_mm"]), 1e-6,
           "la distance annoncee contre celle des deux points");
}

/// ON N'INVENTE PAS UN POINT QU'ON N'A PAS.
///
/// Une page qui envoie des vias de masse sans dire ou est le via de signal ne
/// peut pas se voir dessiner un chevelu : poser l'origine au raccord serait
/// affirmer une position que l'outil ne connait pas. La cle doit donc etre
/// ABSENTE, et non valoir zero -- un zero se dessine, lui.
fn sans_position_la_fiche_ne_l_invente_pas() {
    let mut v = _via_moignon_p(Some((0, 6)), None, &[j(r#"{"x": 10.6, "y": 0.0, "net": "GND",
                                     "layer_from": 0, "layer_to": 6}"#)], None);
    oter(&mut v, "x");
    oter(&mut v, "y");
    let r = sim(&_doc_moignon(&_QUATRE_GND(), 0, 6, &v));
    let ret = &tr0(&r)["retour"];
    assert!(!contient(ret, "x") && !contient(ret, "y"),
            "la position est inventee alors que la page ne l'envoie pas");
}

/// Une seule piste -- donc aucune transition -- et des vias a part.
fn _doc_vias_seuls(couches: &[Json], vias: Vec<Json>) -> Json {
    let mut d = _doc_via_c(vec![_piste(0.0, 0.0, 10.0, 0.0, 0)], couches, 200e6);
    poser(&mut d, "reference_nets", vec!["GND"]);
    poser(&mut d, "vias", vias);
    d
}

/// LE CAS QUI MOTIVE TOUT LE LOT.
///
/// Aucune transition -- la selection ne change pas de couche --, et pourtant
/// un via avec ses retours. Avant, le resultat etait muet.
fn un_via_hors_chaine_a_quand_meme_un_retour() {
    let mut v = j(r#"{"x": 10.0, "y": 0.0, "layer_from": 0, "layer_to": 6,
         "drill_diameter": 0.25, "pad_diameter": 0.55}"#);
    poser(&mut v, "retours", vec![_retour_via(10.6, 0.0)]);
    let r = sim(&_doc_vias_seuls(&_QUATRE_GND(), vec![v]));
    assert!(!r["discontinuites"]["transitions"].vrai(),
            "la selection ne change pas de couche : il ne doit y avoir aucune\
             \x20transition");
    let seuls = els(&r["discontinuites"]["vias_hors_chaine"]);
    assert!(seuls.len() == 1, "{} via(s) hors chaine au lieu de 1", seuls.len());
    let f = &seuls[0];
    let ret = &f["retour"];
    assert!(n(&ret["retenus"]) == 1.0,
            "le via de masse ne referme pas la boucle : {}", dumps(&ret["raison"]));
    assert!(t(&f["modelise"]["inductance_source"]) == "boucle",
            "l'inductance rendue est un plancher alors qu'un retour la referme");
    // LA POSITION EST CE QUI PERMET DE DESSINER LE CHEVELU. Sans elle, la page
    // n'a qu'un chiffre et rien a montrer.
    assert!((n(&ret["x"]) - 10.0).abs() < 1e-9 && n(&ret["y"]).abs() < 1e-9,
            "la position du via n'est pas rendue : {}", dumps(ret));
    assert!(f["cascade"] == Json::Bool(false),
            "un via hors parcours ne doit pas se donner pour cascade");
}

/// Le via d'un net ramifie qui change de reference (GND -> PWR) : sa
/// traversee entre plans se chiffre comme celle d'une transition -- la
/// verification de carte le faisait, l'onglet non.
fn un_via_hors_chaine_chiffre_sa_traversee() {
    let mut v = j(r#"{"x": 10.0, "y": 0.0, "layer_from": 0, "layer_to": 6,
         "drill_diameter": 0.25, "pad_diameter": 0.55, "retours": [],
         "ponts": [], "ponts_rayon_mm": 10.0, "aire_plans_mm2": 2500.0,
         "cavite_rect": {"x0": -15.0, "y0": -25.0, "a": 50.0, "b": 50.0},
         "ponts_carte": [{"x": 12.0, "y": 0.0, "repere": "C5", "capacite_F": 100e-9}],
         "ponts_indirects": []}"#);
    let r = sim(&_doc_vias_seuls(&_GND_PWR(), vec![v.clone()]));
    let f = seul0(&r);
    assert!(t(&f["cavite"]["modele"]) == "modal", "{}", dumps(&f["cavite"]));
    assert!(n(&f["modelise"]["traversee_ohm"]) > 0.0, "{}", dumps(&f["modelise"]));
    assert!(t(&f["cavite"]["ponts_detail"][0]["repere"]) == "C5");
    assert!(avertis(&r).iter().any(|a| a.contains("Cavité modale")), "{:?}", avertis(&r));
    // LA MEME, MAILLEE par la page : la grille passe devant le rectangle, et
    // sur un carre plein la traversee reste celle du rectangle a 15 % pres
    let pleines: Vec<Json> = (0..100i64).map(|k| vec![k.j(), vec![0i64, 100].j()].j()).collect();
    poser(&mut v, "cavite_grille", obj! {"pas" => 0.5, "x0" => -15.0, "y0" => -25.0,
                                         "lignes" => pleines.clone()});
    let r2 = sim(&_doc_vias_seuls(&_GND_PWR(), vec![v.clone()]));
    let f2 = seul0(&r2);
    assert!(n(&f2["cavite"]["grille"]["noeuds"]) == 10000.0, "{}", dumps(&f2["cavite"]["grille"]));
    assert!(avertis(&r2).iter().any(|a| a.contains("Cavité maillée")), "{:?}", avertis(&r2));
    // sous le premier mode (1,4 GHz), les deux modeles s'accordent ; au-dessus,
    // la grille et le rectangle different legitimement par les ports
    let z_de = |cav: &Json| tl::impedance_traversee_param(1e8, _param_cavite(&mut cav.clone(), 1.0).unwrap().as_ref()).norm();
    let zr = z_de(&f["cavite"]);
    let zg = z_de(&f2["cavite"]);
    assert!((zg / zr - 1.0).abs() < 0.15, "{} {} {}", zg, zr, dumps(&f2["modelise"]["traversee_f_hz"]));
    // LA CAVITE RAYONNE PAR SES BORDS : une marge CISPR 32 sort, en classe B a 3 m
    let ry = &f2["cavite"]["rayonnement"];
    assert!(t(&ry["classe"]) == "B" && n(&ry["pire"]["limite_dbuv_m"]) > 0.0, "{}", dumps(ry));
    assert!(-60.0 < n(&ry["pire"]["marge_db"]) && n(&ry["pire"]["marge_db"]) < 120.0, "{}", dumps(ry));
    // UN ILOT RELIE PAR SON VRAI CHEMIN : deux bandes, le via sur la petite,
    // le pont sur la grande. Le net du plan 1 s'interrompt entre elles et une
    // piste de 0,3 mm sur la couche 0 les relie par deux percages ; le net du
    // plan 2 est plein. La page en envoie le reseau, le serveur le resout.
    let mut v3 = avec(&v, &[("x", 33.0.j()), ("ponts_carte", j(r#"[{"x": 0.0, "y": 0.0, "repere": "C5", "capacite_F": 100e-9}]"#))]);
    let bandes: Vec<Json> = (0..100i64).map(|k| vec![k.j(), vec![0i64, 80, 90, 100].j()].j()).collect();
    let net1 = |pistes: &str, vias: &str| obj! {"plan" => 1i64, "couches" => vec![obj! {"cu" => 1i64, "h" => 0.71, "lignes" => bandes.clone()}],
                                               "pistes" => j(pistes), "vias" => j(vias)};
    let net2 = obj! {"plan" => 2i64, "couches" => vec![obj! {"cu" => 2i64, "h" => 0.71,
                                                            "lignes" => pleines.clone()}]};
    let reseau_de = |n1: Json| obj! {"i1" => -10i64, "i2" => 110i64, "j1" => -10i64, "j2" => 110i64, "ep" => vec![0.2, 0.71, 0.2],
                                     "nets" => vec![n1, net2.clone()]};
    let reseau = reseau_de(net1("[[0, 0.3, 24.0, 0.0, 31.0, 0.0]]",
                                "[[24.0, 0.0, [0, 1]], [31.0, 0.0, [0, 1]]]"));
    let grille_de_reseau = |reseau: &Json| obj! {"pas" => 0.5, "x0" => -15.0, "y0" => -25.0, "lignes" => bandes.clone(),
                                                  "reseau" => reseau};
    poser(&mut v3, "cavite_grille", grille_de_reseau(&reseau));
    // le lien vaut la piste (7 mm a 0,35 nH/mm) et les percages, pas 1 nH/mm
    let (mut ii, mut jj, mut comp) = (Vec::new(), Vec::new(), Vec::new());
    for k in 0..100i64 {
        for (a, b) in [(0i64, 80i64), (90, 100)] {
            for i in a..b {
                ii.push(i);
                jj.push(k);
                comp.push(if i < 80 { 0usize } else { 1 });
            }
        }
    }
    let liens_de = |reseau: &Json| tl::_liens_par_reseau(grille_de(&grille_de_reseau(reseau)).reseau.as_ref().unwrap(),
                                                         0.5e-3, -15e-3, -25e-3, &ii, &jj, &comp, 0);
    let liens = liens_de(&reseau);
    assert!(liens.keys().copied().collect::<Vec<_>>() == [1], "{:?}", liens.keys());
    let li = &liens[&1];
    assert!(2e-9 < li.l && li.l < 8e-9, "{}", li.l);
    // LA MUTUELLE : la piste aller longe son retour dans le plan, la PEEC
    // en tient compte et la self de boucle reste sous la somme des deux nets ;
    // les bornes encadrent la valeur retenue
    assert!(li.peec.is_some() && li.l <= li.l_somme, "{} {}", li.l, li.l_somme);
    assert!(li.l_min <= li.l && li.l <= li.l_somme, "{} {} {}", li.l_min, li.l, li.l_somme);
    // LES POINTS D'ENTREE : le courant quitte l'ilot par le percage de la
    // piste (x = 31 mm, colonne 92), pas n'importe ou
    let xs: Vec<f64> = li.liens.iter().map(|l| -15.0 + (ii[l.0] as f64 + 0.5) * 0.5).collect();
    assert!(!li.liens.is_empty() && xs.iter().all(|x| (x - 31.0).abs() < 2.5), "{:?}", xs);
    // et la cavite qui s'y accroche par PLUSIEURS liens (deux percages : deux
    // points de sortie) reste coherente avec son maillage
    let deux = reseau_de(net1("[[0, 0.3, 24.0, -5.0, 31.0, -5.0], [0, 0.3, 24.0, 5.0, 31.0, 5.0]]",
                              "[[24.0, -5.0, [0, 1]], [31.0, -5.0, [0, 1]], [24.0, 5.0, [0, 1]], [31.0, 5.0, [0, 1]]]"));
    let cd = tl::cavite_grille(&grille_de(&grille_de_reseau(&deux)),
                               0.71e-3, 4.37, 0.02, &[(33e-3, 0.0, 0.25e-3), (0.0, 0.0, 1e-3)], tl::FREQ_MAX_MODES, 1.0).unwrap();
    assert!(cd.liens_page == 1 && cd.bornes_ilot.is_some(), "{} {:?}", cd.liens_page, cd.bornes_ilot);
    // la meme piste EN BIAIS : ses cellules ne se touchent que par un coin, la
    // cellule de coin les relie (sans elle, aucun lien)
    let biais = reseau_de(net1("[[0, 0.3, 24.0, -2.0, 31.0, 3.0]]",
                               "[[24.0, -2.0, [0, 1]], [31.0, 3.0, [0, 1]]]"));
    let lb = liens_de(&biais);
    assert!(lb.keys().copied().collect::<Vec<_>>() == [1] && lb[&1].l > li.l, "{:?}", lb.keys());
    let r3 = sim(&_doc_vias_seuls(&_GND_PWR(), vec![v3]));
    let c3 = &seul0(&r3)["cavite"];
    assert!(n(&c3["grille"]["ilots"]) == 1.0 && n(&c3["grille"]["ilots_par_la_page"]) == 1.0, "{}", dumps(&c3["grille"]));
    assert!(c3["grille"]["via_sur_ilot"].vrai() && c3["fourchette_ilots"].vrai(), "{}", dumps(&c3["fourchette_ilots"]));
    let fo = &c3["fourchette_ilots"];
    assert!(fo["f_bas"] != fo["f_haut"], "{}", dumps(fo));
}

/// PAS DE TRONCON, MAIS UN EMPILAGE -- et c'est lui qui porte la hauteur.
///
/// Le via va de la couche 0 a la couche 6 : sa longueur percee est celle que
/// `_hauteur_via` somme, bornes comprises, et elle ne depend d'aucun troncon.
fn la_hauteur_vient_de_l_empilage_sans_troncon() {
    let v = j(r#"{"x": 10.0, "y": 0.0, "layer_from": 0, "layer_to": 6,
         "drill_diameter": 0.25, "pad_diameter": 0.55, "retours": []}"#);
    let r = sim(&_doc_vias_seuls(&_QUATRE_GND(), vec![v]));
    let f = seul0(&r);
    let attendu = _hauteur_via(&_QUATRE_GND(), &0i64.j(), &6i64.j());
    assert!((n(&f["cotes"]["hauteur_mm"]) - attendu).abs() < 1e-9,
            "hauteur {:.4} au lieu de {:.4}", n(&f["cotes"]["hauteur_mm"]), attendu);
    assert!(t(&f["cotes"]["hauteur_source"]) == "empilage",
            "la hauteur est donnee pour supposee alors qu'elle est lue");
}

/// LE VERDICT SUR LA REFERENCE TIENT SANS TRONCON.
///
/// `_analyse_retour` lisait les plans dans les deux troncons qui encadrent la
/// transition. Sans troncon, il faut les lire dans l'empilage -- c'est ce que
/// fait `_plans_de_couche`, et le verdict doit etre le MEME.
fn les_plans_se_lisent_dans_l_empilage_pas_dans_la_chaine() {
    let mut v = j(r#"{"x": 10.0, "y": 0.0, "layer_from": 0, "layer_to": 6,
         "drill_diameter": 0.25, "pad_diameter": 0.55}"#);
    poser(&mut v, "retours", vec![_retour_via(10.6, 0.0)]);
    let seuls = sim(&_doc_vias_seuls(&_QUATRE_GND(), vec![v]));
    let ret = &seul0(&seuls)["retour"];
    // Les memes deux troncons, mais en chaine cette fois : le retour doit
    // dire la meme chose des deux cotes, sinon on a deux verites.
    let chaine = _trans(&_QUATRE_GND(), &[_retour_via(15.6, 0.0)]).1["retour"].clone();
    assert!(ret["plans_depart"] == chaine["plans_depart"],
            "plans de depart : {} hors chaine contre {} en chaine",
            dumps(&ret["plans_depart"]), dumps(&chaine["plans_depart"]));
    assert!(ret["plans_arrivee"] == chaine["plans_arrivee"],
            "plans d'arrivee : {} contre {}",
            dumps(&ret["plans_arrivee"]), dumps(&chaine["plans_arrivee"]));
    assert!(ret["reference_change"] == chaine["reference_change"]);
}

/// DEUX CHIFFRES POUR UNE MEME GRANDEUR, C'EST LE DEFAUT A NE PAS FAIRE.
///
/// La page envoie ses vias sans savoir lesquels la chaine retiendra. Celui
/// qu'elle a deja pris doit sortir des vias hors chaine, sinon la fiche
/// affiche le meme via deux fois -- et rien ne dit lequel croire.
fn un_via_deja_pris_par_la_chaine_ne_compte_pas_deux_fois() {
    let ret = vec![_retour_via(15.6, 0.0)];
    let mut d = _doc_retour(&_QUATRE_GND(), &ret, 15.0, 0.80);
    let mut v = j(r#"{"x": 15.0, "y": 0.0, "layer_from": 0, "layer_to": 6,
                  "drill_diameter": 0.25, "pad_diameter": 0.55}"#);
    poser(&mut v, "retours", ret);
    poser(&mut d, "vias", vec![v]);
    let r = sim(&d);
    assert!(els(&r["discontinuites"]["transitions"]).len() == 1,
            "la chaine devait voir ce via");
    assert!(!r["discontinuites"]["vias_hors_chaine"].vrai(),
            "le via de la chaine est compte une seconde fois hors chaine");
}

/// Une boucle de hauteur nulle n'est pas une boucle. On ne le compte pas
/// plutot que de rendre zero, qui se dessine et se lit comme une mesure.
fn un_via_sans_changement_de_couche_n_en_est_pas_un() {
    let v = j(r#"{"x": 10.0, "y": 0.0, "layer_from": 2, "layer_to": 2,
         "drill_diameter": 0.25, "pad_diameter": 0.55, "retours": []}"#);
    let r = sim(&_doc_vias_seuls(&_QUATRE_GND(), vec![v]));
    assert!(!r["discontinuites"]["vias_hors_chaine"].vrai(),
            "un via qui ne change pas de couche a ete compte");
}

/// Quand aucun retour n'est dans le rayon, la distance du plus proche au-delà est transmise.
fn distance_du_plus_proche_via_hors_rayon_est_conservee() {
    let mut doc = _doc_retour(&_QUATRE_GND(), &[], 15.0, 0.80);
    let mut objets = els(&doc["geometry"]["objects"]).to_vec();
    poser(dans(&mut objets[1], "via"), "retours_rayon_mm", 3.0);
    poser(dans(&mut objets[1], "via"), "retour_hors_rayon_mm", 4.2);
    poser(dans(&mut doc, "geometry"), "objects", objets);
    let r = sim(&doc);
    let ret = &tr0(&r)["retour"];
    assert!(n(&ret["retenus"]) == 0.0);
    assert!(n(&ret["plus_proche_hors_rayon_mm"]) == 4.2);
    assert!(t(&ret["raison"]).contains("4.20 mm"));
    assert!(t(&ret["raison"]).contains("trop éloigné"));
}

/// Quand aucun découplage n'est dans le rayon, la distance du plus proche au-delà est transmise.
fn distance_du_plus_proche_pont_hors_rayon_est_conservee() {
    let stack = vec![_cu("TOP", "signal"), _di("PP", 0.200, 4.30),
                     avec(&_cu("L1", "plane"), &[("net", "GND".j())]), _di("CORE", 1.065, 4.50),
                     avec(&_cu("L2", "plane"), &[("net", "PWR".j())]), _di("PP2", 0.200, 4.30),
                     _cu("BOT", "signal")];
    let mut via = _via_moignon_p(Some((0, 6)), Some(vec![]), &[], Some(10.0));
    poser(&mut via, "pont_hors_rayon_mm", 14.5);
    poser(&mut via, "pont_hors_rayon_ref", "C42");
    let d = _doc_moignon_f(&stack, 0, 6, &via, 10e6, 100e6);
    let r = sim(&d);
    let cav = &tr0(&r)["cavite"];
    assert!(cav["borne"] == Json::Bool(true));
    assert!(n(&cav["plus_proche_hors_rayon_mm"]) == 14.5);
    assert!(t(&cav["plus_proche_hors_rayon_ref"]) == "C42");
    assert!(avertis(&r).iter().any(|a| a.contains("14.50 mm") && a.contains("C42")),
            "la présence du découplage hors rayon doit être notée dans les avertissements");
}

/// LE DRAPEAU SUIT LES COTES, SANS QUOI IL NE SUIT RIEN.
///
/// La fiche d'un via hors parcours recopiait `cotes` -- ou chaque champ porte
/// sa provenance -- mais pas le booleen `cotes_supposees`. Or c'est sur CE
/// booleen que le panneau filtre pour ecrire « ce via est chiffre avec des
/// valeurs supposees ». Les provenances partaient donc completes, et personne
/// ne les lisait : un via chiffre sur une pastille devinee par le lecteur
/// IPC-2581 se presentait comme un via mesure.
fn le_via_hors_chaine_emporte_le_doute_sur_ses_cotes() {
    let v = j(r#"{"x": 10.0, "y": 0.0, "layer_from": 0, "layer_to": 6,
         "drill_diameter": 0.25,
         "pad_diameter": 0.55, "pad_diameter_supposee": true, "retours": []}"#);
    let r = sim(&_doc_vias_seuls(&_QUATRE(), vec![v.clone()]));
    let fiche = seul0(&r);
    assert!(t(&fiche["cotes"]["pastille_source"]) == "supposee", "la provenance de la pastille est « {} »", t(&fiche["cotes"]["pastille_source"]));
    assert!(fiche["cotes_supposees"] == Json::Bool(true), "le via hors parcours ne porte pas le doute jusqu'au panneau : {}", dumps(fiche));

    // LE REVERS : des cotes LUES ne doivent pas lever le drapeau, sans quoi la
    // mention s'afficherait partout et ne se lirait plus nulle part.
    let mut lu = v;
    oter(&mut lu, "pad_diameter_supposee");
    let r2 = sim(&_doc_vias_seuls(&_QUATRE(), vec![lu]));
    let f2 = seul0(&r2);
    assert!(t(&f2["cotes"]["pastille_source"]) == "page", "une pastille envoyee sans reserve passe pour supposee");
    assert!(f2["cotes_supposees"] == Json::Bool(false), "des cotes lues levent quand meme le doute");
}

/// Trois branches sur un meme point : un bus qui dessert deux boitiers.
pub fn _en_T() -> Vec<Json> {
    vec![_piste(0.0, 0.0, 10.0, 0.0, 0),
         _piste(10.0, 0.0, 20.0, 0.0, 0),
         _piste(10.0, 0.0, 10.0, 10.0, 0)]
}

/// AUCUN ORDRE NE SAUVE UN T, et c'est ce qu'il faut dire.
///
/// Trois bouts sur un point : la liaison n'a pas deux acces mais trois. La
/// mise en cascade ABCD suppose une entree et une sortie ; ici il faudrait
/// choisir laquelle des deux branches est « la suite », et ce choix
/// changerait le resultat tout en ayant l'air d'un calcul.
fn un_net_ramifie_n_est_pas_une_chaine() {
    let r = sim(&_doc_via(_en_T()));
    let topo = &r["topologie"];
    assert!(t(&topo["genre"]) == "ramifiee",
            "un T est classe « {} »", t(&topo["genre"]));
    assert!(!topo["cascadable"].vrai(), "un T laisse passer la cascade");
    assert!(els(&topo["derivations"]).len() == 1,
            "{} derivation(s) vues au lieu d'une", els(&topo["derivations"]).len());
    let d = &topo["derivations"][0];
    proche(n(&d["x"]), 10.0, 1e-6, "l'abscisse de la derivation");
    assert!(n(&d["branches"]) == 3.0, "{} branches comptees", n(&d["branches"]));

    // ET LES PARAMETRES S NE SORTENT PAS. C'est la moitie qui manquait : le
    // diagnostic ne vaut que s'il empeche quelque chose.
    assert!(els(&r["s"]).is_empty(), "{} matrices S rendues sur un net ramifie", els(&r["s"]).len());
    assert!(t(&r["touchstone"]).is_empty(), "un .s2p est exporte sur un net ramifie");
    assert!(t(&r["cascade_refusee"]).contains("ramifie"),
            "la raison ne nomme pas la ramification : {}", t(&r["cascade_refusee"]));
}

/// « RANGEZ LA SELECTION » N'A DE SENS QUE SI C'EN EST UNE.
///
/// Les memes trois troncons colineaires, envoyes dans le desordre, forment un
/// parcours : la page peut les ranger. Un T, non. Les confondre revient a
/// demander a l'un l'impossible et a taire a l'autre ce qu'il suffirait de
/// faire -- c'est pour cette phrase-la que le diagnostic existe.
fn le_desordre_se_distingue_de_la_ramification() {
    let ordre = vec![_piste(0.0, 0.0, 10.0, 0.0, 0), _piste(10.0, 0.0, 20.0, 0.0, 0),
                     _piste(20.0, 0.0, 30.0, 0.0, 0)];
    let desordre = vec![ordre[0].clone(), ordre[2].clone(), ordre[1].clone()];

    assert!(t(&sim(&_doc_via(ordre))["topologie"]["genre"]) == "chaine",
            "un parcours range n'est pas reconnu");
    let r = sim(&_doc_via(desordre));
    let tp = &r["topologie"];
    assert!(t(&tp["genre"]) == "desordre", "le desordre est classe « {} »", t(&tp["genre"]));
    assert!(n(&tp["morceaux"]) == 1.0,
            "un parcours mal range est vu en {} morceaux", n(&tp["morceaux"]));
    assert!(n(&tp["bouts_libres"]) == 2.0, "un parcours n'a pas deux extremites");

    // LE MEME CUIVRE, LE MEME NOMBRE DE TRONCONS, UN DIAGNOSTIC DIFFERENT.
    assert!(t(&sim(&_doc_via(_en_T()))["topologie"]["genre"]) == "ramifiee",
            "le T et le desordre recoivent le meme verdict");
}

/// UNE BOUCLE FERMEE N'A NI ENTREE NI SORTIE.
///
/// Un anneau de cuivre est connexe, sans derivation, et chaque troncon touche
/// le suivant : les trois criteres precedents le declarent chaine. Il n'en est
/// pas une pour autant -- le cascader reviendrait a le couper en un point
/// arbitraire, et le S11 rendu dependrait de ce choix.
fn une_boucle_n_a_pas_deux_acces() {
    let anneau = vec![_piste(0.0, 0.0, 10.0, 0.0, 0), _piste(10.0, 0.0, 10.0, 10.0, 0),
                      _piste(10.0, 10.0, 0.0, 10.0, 0), _piste(0.0, 10.0, 0.0, 0.0, 0)];
    let r = sim(&_doc_via(anneau));
    let tp = &r["topologie"];
    assert!(t(&tp["genre"]) == "boucle", "un anneau est classe « {} »", t(&tp["genre"]));
    assert!(n(&tp["bouts_libres"]) == 0.0,
            "{} extremites libres sur un anneau", n(&tp["bouts_libres"]));
    assert!(!tp["cascadable"].vrai(), "un anneau laisse passer la cascade");
}

/// LE RETARD D'UN T N'EST LE TRAJET DE PERSONNE.
///
/// Additionner les longueurs des trois branches d'une derivation donne une
/// quantite de cuivre, pas un retard de propagation : aucun front ne parcourt
/// les deux branches. Le chiffre reste rendu -- il repond a « combien de
/// cuivre ai-je selectionne » -- mais il doit se presenter pour ce qu'il est.
fn les_cumuls_disent_s_ils_valent_quelque_chose() {
    let droit = sim(&_doc_via(vec![_piste(0.0, 0.0, 10.0, 0.0, 0),
                                   _piste(10.0, 0.0, 20.0, 0.0, 0)]));
    assert!(droit["ligne"]["cumuls_valides"] == Json::Bool(true),
            "les cumuls d'une chaine sont annonces douteux");

    let te = sim(&_doc_via(_en_T()));
    assert!(te["ligne"]["cumuls_valides"] == Json::Bool(false),
            "les cumuls d'un net ramifie passent pour un retard de liaison");
    // Les impedances par troncon, elles, restent rendues : chacune ne depend
    // que de sa propre section, et c'est tout l'interet de la distinction.
    assert!(n(&te["ligne"]["troncons"]) == 3.0,
            "{} troncons chiffres sur le T", n(&te["ligne"]["troncons"]));
    assert!(n(&te["ligne"]["z0_moyen"]) > 0.0, "le T ne rend plus d'impedance");
}

/// ON NE REFUSE PAS CE QU'ON NE PEUT PAS JUGER.
///
/// Un document ecrit a la main qui ne porte que des longueurs est une chaine
/// parfaitement legitime, envoyee dans l'ordre. Faute de coordonnees on ne
/// peut ni le confirmer ni l'infirmer -- et refuser par defaut ferait taire un
/// calcul juste. Le doute profite au document.
fn un_document_sans_coordonnees_reste_calculable() {
    let objets = vec![j(r#"{"type": "track", "length": 10.0, "width": 0.35, "layer": 0,
               "net": "SIG", "copper_thickness": 0.035}"#),
                      j(r#"{"type": "track", "length": 5.0, "width": 0.35, "layer": 0,
               "net": "SIG", "copper_thickness": 0.035}"#)];
    let r = sim(&_doc_via(objets));
    assert!(t(&r["topologie"]["genre"]) == "sans_coordonnees",
            "un document sans XY est classe « {} »", t(&r["topologie"]["genre"]));
    assert!(r["topologie"]["cascadable"].vrai(),
            "un document sans XY se voit refuser la cascade");
    assert!(!els(&r["s"]).is_empty(), "un document sans XY ne rend plus de parametres S");
    assert!(r["touchstone"].vrai(), "un document sans XY ne rend plus de .s2p");
    assert!(t(&r["cascade_refusee"]).is_empty(), "un refus est annonce sans raison");
}

pub fn banc() {
    titre("La mise en cascade et les parametres S");
    T("un via hors chaîne a quand même un retour", un_via_hors_chaine_a_quand_meme_un_retour);
    T("un via hors chaine chiffre sa traversee", un_via_hors_chaine_chiffre_sa_traversee);
    T("sa hauteur vient de l'empilage, sans tronçon", la_hauteur_vient_de_l_empilage_sans_troncon);
    T("les plans se lisent dans l'empilage, même verdict", les_plans_se_lisent_dans_l_empilage_pas_dans_la_chaine);
    T("un via déjà pris par la chaîne ne compte pas deux fois", un_via_deja_pris_par_la_chaine_ne_compte_pas_deux_fois);
    T("un via sans changement de couche n'en est pas un", un_via_sans_changement_de_couche_n_en_est_pas_un);
    T("la fiche du retour dit où est le via", la_fiche_du_retour_dit_ou_est_le_via);
    T("sans position, la fiche ne l'invente pas", sans_position_la_fiche_ne_l_invente_pas);
    T("la distance du plus proche retour hors rayon est notée", distance_du_plus_proche_via_hors_rayon_est_conservee);
    T("la distance du plus proche découplage hors rayon est notée", distance_du_plus_proche_pont_hors_rayon_est_conservee);
    T("un via hors chaine emporte le doute sur ses cotes", le_via_hors_chaine_emporte_le_doute_sur_ses_cotes);
    titre("La topologie de la selection");
    T("un net ramifie n'est pas une chaine, et ne rend pas de parametres S", un_net_ramifie_n_est_pas_une_chaine);
    T("un parcours mal range n'est pas un net ramifie", le_desordre_se_distingue_de_la_ramification);
    T("une boucle fermee n'est pas une chaine", une_boucle_n_a_pas_deux_acces);
    T("les cumuls disent s'ils valent quelque chose", les_cumuls_disent_s_ils_valent_quelque_chose);
    T("un document sans coordonnees reste calculable", un_document_sans_coordonnees_reste_calculable);
}
