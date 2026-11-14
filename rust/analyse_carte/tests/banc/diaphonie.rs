//! La diaphonie de la carte entière (test_diaphonie*).

use crate::*;

fn paires(res: &Json) -> &[Json] {
    els(&res["bilan"]["diaphonie"]["paires"])
}

fn k_total(m: &str) -> f64 {
    nombre_apres(m, "k_total ", " %")
}

fn couple(a: &str, b: &str, x2: f64) -> Vec<Json> {
    vec![droite_(a, 0.0, 0.0, x2, "Top", 0.2), droite_(b, 0.4, 0.0, x2, "Top", 0.2)]
}

fn diaphonie() {
    // 100 mm côte à côte à 0,2 mm (écart = hauteur au plan) : Kb ≈ 9 %
    let res = analyser(obj! {"pistes" => couple("CLK", "DATA", 100.0), "natures" => j(r#"{"CLK": "Horloge", "DATA": "Lent"}"#)});
    // UN FRONT GLOBAL (niveau 2) : les deux sens se valent, une seule ligne qui dit la
    // réciproque.
    let k = de(&res, "diaphonie");
    assert!(k.len() == 1 && msg(&k[0]).contains("réciproquement"), "{k:?}");
    let v = &k[0];
    // deux horloges s'agressent l'une l'autre : toujours une ligne, qui le dit
    let mu = de(&analyser(obj! {"pistes" => couple("CLK", "CLK2", 100.0), "natures" => j(r#"{"CLK": "Horloge", "CLK2": "Horloge"}"#)}), "diaphonie");
    assert!(mu.len() == 1 && msg(&mu[0]).contains("réciproquement"), "{mu:?}");
    assert!(txt(v, "severite") == "critique" && 16.0 < k_total(msg(v)) && k_total(msg(v)) < 20.0, "{v:?}");
    // LE TUPLE DE DIAGNOSTIC : NEXT et FEXT, chacun son statut.
    let f0 = &v["frequences"][0];
    assert!(n(&f0["tr"]) == 1e-9 && ["next", "fext", "statut_next", "statut_fext"].iter().all(|c| contient(f0, c)), "{f0:?}");
    assert!(msg(v).contains("100.0 mm en regard") && msg(v).contains("écart mini 0.200 mm"), "{}", msg(v));
    // le NEXT sature : au front le plus raide il vaut Kb, pas davantage
    assert!(valeur_max(v) < 0.10, "{:?}", v["frequences"]);
    // 10 mm seulement : sous la longueur de saturation, le niveau baisse
    let court = de(&analyser(obj! {"pistes" => couple("CLK", "DATA", 10.0), "natures" => j(r#"{"CLK": "Horloge", "DATA": "Lent"}"#)}), "diaphonie");
    assert!(court.iter().all(|c| valeur_max(c) < valeur_max(v)), "{court:?}");
    // hors jeu : la masse, une paire différentielle, une voisine lointaine
    assert!(de(&analyser(obj! {"pistes" => couple("CLK", "GND", 100.0), "natures" => j(r#"{"GND": "Masse"}"#)}), "diaphonie").is_empty());
    assert!(de(&analyser(obj! {"pistes" => couple("CLK", "AGND", 100.0), "reference_nets" => vec!["AGND"]}), "diaphonie").is_empty());
    assert!(de(&analyser(obj! {"pistes" => couple("USB_P", "USB_N", 100.0), "paires" => j(r#"[["USB_P", "USB_N"]]"#)}), "diaphonie").is_empty());
    assert!(de(&analyser(obj! {"pistes" => vec![droite("CLK", 0.0), droite("DATA", 2.0)]}), "diaphonie").is_empty());
    // un nœud de découpage agresse, une alimentation calme non
    let sw = analyser(obj! {"pistes" => couple("SW", "DATA", 100.0), "natures" => j(r#"{"SW": "Alimentation"}"#), "bruyants" => vec!["SW"]});
    assert!(n(&sw["bilan"]["diaphonie"]["couples"]) >= 1.0, "{:?}", sw["bilan"]);
    assert!(!de(&analyser(obj! {"pistes" => couple("SW", "DATA", 100.0), "natures" => j(r#"{"SW": "Alimentation"}"#), "bruyants" => vec!["SW"],
                                "reglages" => j(r#"{"xt_tr": 1e-9}"#)}), "diaphonie").is_empty());
    // ... mais n'est jamais victime : à côté d'une horloge, la ligne est sur l'horloge
    // (« depuis SW »), pas sur le nœud de découpage
    let swv = de(&analyser(obj! {"pistes" => couple("SW", "CLK", 100.0), "natures" => j(r#"{"SW": "Alimentation", "CLK": "Horloge"}"#), "bruyants" => vec!["SW"]}),
                 "diaphonie");
    assert!(!swv.is_empty() && swv.iter().all(|x| txt(x, "n") != "SW"), "{swv:?}");
    let vcc = analyser(obj! {"pistes" => couple("VCC", "DATA", 100.0), "natures" => j(r#"{"VCC": "Alimentation"}"#)});
    assert!(n(&vcc["bilan"]["diaphonie"]["couples"]) == 0.0 && de(&vcc, "diaphonie").is_empty());
    // UN ARC compte comme les pistes droites : un quart de cercle de 20 mm de rayon, décalé
    // de 0,4 mm, suit la victime et la couple (agresseur à 1 ns : sur 31 mm, une horloge à
    // 2 ns resterait sous le budget)
    let arc = j(r#"{"c": "Top", "n": "CLK", "w": 0.2, "s": [0.0, 20.0], "e": [20.0, 0.0], "m": [0.0, 0.0], "h": true}"#);
    let arc2 = j(r#"{"c": "Top", "n": "DATA", "w": 0.2, "s": [0.0, 20.4], "e": [20.4, 0.0], "m": [0.0, 0.0], "h": true}"#);
    let k = de(&analyser(obj! {"arcs" => vec![arc, arc2], "natures" => j(r#"{"CLK": "Rapide", "DATA": "Lent"}"#)}), "diaphonie");
    assert!(!k.is_empty() && msg(&k[0]).contains("réciproquement"), "{k:?}");
    // LARGES FACES : deux couches de signal voisines (Top, In1) sans plan entre elles,
    // pistes superposées : couplées ; décalées de 3 mm : non
    let st = j(r#"{"layers": [{"type": "copper", "name": "Top", "role": "signal", "thickness": 0.035},
                              {"type": "dielectric", "name": "d1", "thickness": 0.2, "epsilon_r": 4.3},
                              {"type": "copper", "name": "In1", "role": "signal", "thickness": 0.035},
                              {"type": "dielectric", "name": "d2", "thickness": 0.2, "epsilon_r": 4.3},
                              {"type": "copper", "name": "L3", "role": "plane", "net": "GND", "thickness": 0.035}]}"#);
    let superposees = |st: &Json, y: f64| doc_ok(&obj! {"format" => "cao-analyse-carte-1", "unite_mm" => 1i64, "stackup" => st,
                                                        "pistes" => vec![droite("CLK", 0.0), droite_("DATA", y, 0.0, 100.0, "In1", 0.2)],
                                                        "natures" => j(r#"{"CLK": "Horloge", "DATA": "Lent"}"#)});
    let voisines = |res: &Json| -> Vec<Json> { de(res, "diaphonie").into_iter().filter(|x| msg(x).contains("couche voisine")).collect() };
    let sup = superposees(&st, 0.0);
    let k = voisines(&sup);
    // un front global : les deux sens se valent, la ligne dit la réciproque
    assert!(!k.is_empty() && ["CLK", "DATA"].contains(&txt(&k[0], "n")) && txt(&k[0], "c") == "Top ↔ In1", "{:?}", de(&sup, "diaphonie"));
    assert!(n(&sup["bilan"]["diaphonie"]["couples_larges_faces"]) >= 1.0, "{:?}", sup["bilan"]);
    // RÉSOLU, pas estimé : les rubans à leurs deux hauteurs. Un plan de plus au-dessus de la
    // paire ferme le domaine et réduit le couplage.
    assert!(msg(&k[0]).contains("MoM, un plan"), "{}", msg(&k[0]));
    let mut couches = j(r#"[{"type": "copper", "name": "L0", "role": "plane", "net": "GND", "thickness": 0.035},
                            {"type": "dielectric", "name": "d0", "thickness": 0.2, "epsilon_r": 4.3}]"#);
    for c in els(&st["layers"]) {
        ajouter(&mut couches, c);
    }
    let k2 = voisines(&superposees(&obj! {"layers" => couches}, 0.0));
    assert!(!k2.is_empty() && msg(&k2[0]).contains("MoM, deux plans"), "{k2:?}");
    assert!(k_total(msg(&k2[0])) < k_total(msg(&k[0])), "{} {}", msg(&k2[0]), msg(&k[0]));
    let loin = superposees(&st, 3.0);
    assert!(voisines(&loin).is_empty(), "{loin:?}");
    // LA SOMME : deux agresseurs de part et d'autre, chacun orange (vigilance), ensemble
    // au-delà du rouge (critique)
    let tri = || vec![droite_("A1", -0.4, 0.0, 40.0, "Top", 0.2), droite_("V", 0.0, 0.0, 40.0, "Top", 0.2), droite_("A2", 0.4, 0.0, 40.0, "Top", 0.2)];
    let nat = || j(r#"{"A1": "Rapide", "A2": "Rapide", "V": "Lent"}"#);
    let res = de(&analyser(obj! {"pistes" => tri(), "natures" => nat()}), "diaphonie");
    let seuls: Vec<&Json> = res.iter().filter(|x| txt(x, "n") == "V" && !msg(x).contains("Somme")).collect();
    let somme: Vec<&Json> = res.iter().filter(|x| msg(x).contains("de 2 agresseurs")).collect();
    assert!(!somme.is_empty() && seuls.iter().all(|x| txt(x, "severite") != "critique"), "{res:?}");
    assert!(txt(somme[0], "severite") == "critique", "{somme:?}");
    // LE FRONT GLOBAL ET LES SEUILS SE RÈGLENT : un front plus lent calme la carte, des
    // seuils plus larges aussi.
    let court2 = || couple("CLK", "DATA", 10.0);
    let vif = de(&analyser(obj! {"pistes" => court2(), "reglages" => j(r#"{"xt_tr": 100e-12}"#)}), "diaphonie");
    let lent = de(&analyser(obj! {"pistes" => court2(), "reglages" => j(r#"{"xt_tr": 10e-9}"#)}), "diaphonie");
    assert!(!vif.is_empty() && txt(&vif[0], "severite") == "critique" && lent.is_empty(), "{vif:?} {lent:?}");
    let large = de(&analyser(obj! {"pistes" => couple("CLK", "DATA", 100.0), "reglages" => j(r#"{"xt_orange": 0.5, "xt_rouge": 0.6}"#)}), "diaphonie");
    assert!(large.is_empty(), "{large:?}");
    // LE TABLEAU « TOUTE LA CARTE » : chaque paire, verte comprise, et la seule règle
    // demandée.
    let seule = analyser(obj! {"regles" => vec!["diaphonie"], "pistes" => vec![droite("CLK", 0.0), droite("DATA", 0.4), droite("LOIN", 1.2)]});
    assert!(els(&seule["constats"]).iter().all(|k| txt(k, "regle") == "diaphonie"), "{:?}", seule["constats"]);
    let p = paires(&seule);
    assert!(!p.is_empty() && ["k_total", "next", "fext", "statut"].iter().all(|c| contient(&p[0], c)), "{p:?}");
    assert!(p.iter().any(|q| txt(q, "statut") == "vert"), "{p:?}");
    assert!(n(&seule["bilan"]["diaphonie"]["t_r"]) == 1e-9);
    // LES TRAITS À COLORER : la portion de la victime en regard, en mm.
    let p0 = p.iter().find(|q| txt(q, "statut") != "vert").unwrap();
    let t = els(&p0["traits"][0]);
    assert!(t.len() == 4, "{p0:?}");
    let (x1, y1, x2, y2) = (n(&t[0]), n(&t[1]), n(&t[2]), n(&t[3]));
    assert!(((x2 - x1).abs() - 100.0).abs() < 1.0 && (y1 - y2).abs() < 1e-6, "{:?}", p0["traits"]);
    // LA SOMME QUADRATIQUE est plus douce que le pire cas, jamais plus forte.
    let pire = analyser(obj! {"pistes" => tri(), "natures" => nat()})["bilan"]["diaphonie"]["sommes"][0].clone();
    let rss = analyser(obj! {"pistes" => tri(), "natures" => nat(), "reglages" => j(r#"{"xt_somme": "rss"}"#)})["bilan"]["diaphonie"]["sommes"][0].clone();
    assert!(txt(&rss, "mode") == "rss" && txt(&pire, "mode") == "pire", "{rss:?} {pire:?}");
    assert!(n(&rss["next"]) < n(&pire["next"]) && n(&rss["next"]) > 0.7 * n(&pire["next"]), "{rss:?} {pire:?}");
    // LES PERTES R et G ne font que RETIRER du bruit, et peu à 1 ns.
    let sans = analyser(obj! {"pistes" => couple("CLK", "DATA", 100.0)});
    let avec_p = analyser(obj! {"pistes" => couple("CLK", "DATA", 100.0), "reglages" => j(r#"{"xt_pertes": true}"#)});
    let (ps, pa) = (&paires(&sans)[0], &paires(&avec_p)[0]);
    assert!(n(&pa["next"]) < n(&ps["next"]) && n(&pa["next"]) > 0.85 * n(&ps["next"]), "{pa:?} {ps:?}");
    assert!(avec_p["bilan"]["diaphonie"]["pertes"] == Json::Bool(true));
    let refus = |reglages: &str| matches!(analyser_r(obj! {"pistes" => court2(), "reglages" => j(reglages)}), Err(e) if !e.interne);
    assert!(refus(r#"{"xt_somme": "moyenne"}"#), "une somme inconnue a été acceptée");
    assert!(refus(r#"{"xt_orange": 0.08, "xt_rouge": 0.03}"#), "des seuils inversés ont été acceptés");
}

fn diaphonie_fext_plafonne() {
    // 300 mm de microruban sous 50 ps : la loi linéaire |Kf|·Td/t_r annonçait plus de 100 % ;
    // deux lignes adaptées ne dépassent pas 50 %, et la paire le dit comme elle dit le NEXT
    // saturé.
    let nat = || j(r#"{"CLK": "Horloge", "DATA": "Lent"}"#);
    let res = analyser(obj! {"pistes" => couple("CLK", "DATA", 300.0), "natures" => nat(), "reglages" => j(r#"{"xt_tr": 50e-12}"#)});
    let p = &paires(&res)[0];
    assert!(n(&p["fext"]) == 0.5 && p["fext_sature"] == Json::Bool(true), "{p:?}");
    let court = analyser(obj! {"pistes" => couple("CLK", "DATA", 100.0), "natures" => nat()});
    let q = &paires(&court)[0];
    assert!(n(&q["fext"]) < 0.5 && q["fext_sature"] == Json::Bool(false), "{q:?}");
}

/// Les constats de la carte d'essai du banc crosstalk, côté « toute la carte ».
fn diaphonie_garde_seuil_front_rf() {
    let nat = || j(r#"{"A": "Rapide", "V": "Rapide", "GND": "Masse"}"#);
    let seule = |champs: Json| analyser(avec(&obj! {"regles" => vec!["diaphonie"], "natures" => nat()}, champs));
    let garde = || vec![droite("A", 0.0), droite("GND", 0.5), droite("V", 1.0)];
    // LA PISTE DE GARDE ENTRE DANS LA SECTION (cas 3 contre cas 2 : 0,58 % au lieu de 0,90 %
    // de NEXT à 1 ns sur la carte d'essai). Ici : agresseur, garde à mi-chemin, victime à
    // S = 0,8 mm (seuil = 5 H = 1 mm), garde cousue tous les 5 mm.
    let vias: Vec<Json> = (0..101).step_by(5).map(|x| obj! {"x" => x as f64, "y" => 0.5, "d" => 0.5, "n" => "GND"}).collect();
    let sans = seule(obj! {"pistes" => vec![droite("A", 0.0), droite("V", 1.0)]});
    let avec_g = seule(obj! {"percages" => vias, "pistes" => garde()});
    let (ps, pa) = (paires(&sans)[0].clone(), paires(&avec_g)[0].clone());
    assert!(els(&ps["gardes"]).is_empty() && pa["gardes"] == j(r#"["GND"]"#) && els(&pa["gardes_flottantes"]).is_empty(), "{ps:?} {pa:?}");
    assert!(n(&pa["next"]) < 0.8 * n(&ps["next"]) && n(&pa["fext"]) < 0.8 * n(&ps["fext"]), "{pa:?} {ps:?}");
    assert!(avec_g["bilan"]["diaphonie"]["gardes_posees"] == j(r#"["GND"]"#));
    // ET C'EST LE MÊME CHIFFRE QUE « ANALYSER LA PISTE » sur la même géométrie.
    let objet = |net: &str, y: f64, couture: f64| obj! {
        "type" => "track", "start" => vec![0.0, y], "end" => vec![100.0, y], "length" => 100.0, "width" => 0.2, "layer" => 0i64, "net" => net,
        "copper_thickness" => 0.035, "gap_left" => 0i64, "gap_right" => 0i64, "couture_left" => couture, "couture_right" => couture};
    let piste_seule = xt::analyser(&obj! {
        "format" => "cao-crosstalk-1", "carte" => "banc", "agresseurs" => vec!["A"], "stackup" => empilage("GND"),
        "geometry" => obj! {"objects" => vec![objet("A", 0.0, 100.0)]},
        "voisinage" => vec![objet("GND", 0.5, 5.0), objet("V", 1.0, 100.0)],
        "reference_nets" => vec!["GND"], "natures" => j(r#"{"A": "Rapide"}"#),
        // le seuil 3W de l'analyse de piste vaut 0,6 mm ici, celui de la carte 5 H = 1,0 mm :
        // on l'ouvre pour voir la même victime
        "reglages" => j(r#"{"t_r": 1e-9, "distance_max": 1.0}"#)}, None).unwrap_or_else(|e| panic!("{}", e.message));
    let cv = els(&piste_seule["couples"]).iter().find(|c| txt(c, "victime") == "V").unwrap();
    assert!(piste_seule["etape0"]["gardes"] == j(r#"["GND"]"#), "{:?}", piste_seule["etape0"]["gardes"]);
    assert!((n(&cv["next"]) / n(&pa["next"]) - 1.0).abs() < 0.03 && (n(&cv["fext"]) / n(&pa["fext"]) - 1.0).abs() < 0.03, "{cv:?} {pa:?}");
    // UNE GARDE SANS VIAS FLOTTE quand le document porte des perçages (un via de masse loin
    // d'elle) : la couture est mesurée, elle transfère, le NEXT ne tombe plus.
    let loin = || j(r#"[{"x": 50.0, "y": 20.0, "d": 0.5, "n": "GND"}]"#);
    let flot = seule(obj! {"percages" => loin(), "pistes" => garde()});
    let pf = &paires(&flot)[0];
    assert!(pf["gardes_flottantes"] == j(r#"["GND"]"#) && n(&pf["next"]) >= n(&ps["next"]), "{pf:?} {ps:?}");
    assert!(!contient(&flot["bilan"]["diaphonie"], "gardes_couture_supposee"));
    // SANS AUCUN PERÇAGE, la couture n'est pas mesurée : la garde est supposée tenue, comme
    // « Analyser la piste » le fait d'une couture nulle, et c'est dit.
    let muet = seule(obj! {"pistes" => garde()});
    let pm = &paires(&muet)[0];
    assert!(els(&pm["gardes_flottantes"]).is_empty() && (n(&pm["next"]) / n(&pa["next"]) - 1.0).abs() < 1e-6, "{pm:?} {pa:?}");
    assert!(muet["bilan"]["diaphonie"]["gardes_couture_supposee"] == j(r#"["GND"]"#));
    assert!(notes(&muet).iter().any(|x| x.contains("supposée cousue")), "{:?}", muet["notes"]);
    // Serré (S = 0,3 mm) pour franchir le seuil orange : le constat nomme la garde, et dit
    // qu'elle flotte.
    let k = de(&analyser(obj! {"natures" => j(r#"{"A": "Rapide", "V": "Lent", "GND": "Masse"}"#), "percages" => loin(),
                               "pistes" => vec![droite_("A", 0.0, 0.0, 100.0, "Top", 0.3), droite_("GND", 0.3, 0.0, 100.0, "Top", 0.1),
                                                droite_("V", 0.6, 0.0, 100.0, "Top", 0.3)]}), "diaphonie");
    assert!(!k.is_empty() && msg(&k[0]).contains("FLOTTANTE") && msg(&k[0]).contains("« GND »"), "{k:?}");
    // UNE VOISINE DE SIGNAL intercalée est posée avec le couple, et nommée.
    let tri = analyser(obj! {"regles" => vec!["diaphonie"], "natures" => j(r#"{"A": "Rapide", "V": "Rapide", "X": "Lent"}"#),
                             "pistes" => vec![droite("A", 0.0), droite("X", 0.5), droite("V", 1.0)]});
    let pav = paires(&tri).iter().find(|p| txt(p, "victime") != "X" && txt(p, "agresseur") != "X").unwrap();
    assert!(pav["voisines"] == j(r#"["X"]"#) && n(&pav["next"]) < n(&ps["next"]), "{pav:?} {ps:?}");
    // S = 3W PILE SUR LE SEUIL : retenu. Le seuil est max(5 H, 3 max(W, H)) = 1,0 mm ici ;
    // l'égalité et 2 % au-dessus sont dedans ; à 1,3 × le seuil le couple est écarté MAIS
    // NOMMÉ ; à 2 × il est simplement loin.
    let ecartes = |y: f64| seule(obj! {"pistes" => vec![droite("A", 0.0), droite("V", y)]});
    let egal = ecartes(1.2);
    assert!(!paires(&egal).is_empty() && (n(&paires(&egal)[0]["ecart"]) - 1.0).abs() < 1e-6, "{:?}", paires(&egal));
    assert!(!paires(&ecartes(1.22)).is_empty());
    let loin = ecartes(1.5);
    assert!(paires(&loin).is_empty(), "{:?}", paires(&loin));
    let e = els(&loin["bilan"]["diaphonie"]["ecartes_proches"]);
    assert!(e.len() == 1 && e[0]["nets"] == j(r#"["A", "V"]"#) && (n(&e[0]["ecart"]) - 1.3).abs() < 1e-6 && (n(&e[0]["seuil"]) - 1.0).abs() < 1e-6
            && txt(&e[0], "couche") == "Top", "{e:?}");
    assert!(notes(&loin).iter().any(|x| x.contains("écarté(s) par la présélection") && x.contains("A ↔ V")), "{:?}", loin["notes"]);
    let tres = ecartes(2.2);
    assert!(paires(&tres).is_empty() && els(&tres["bilan"]["diaphonie"]["ecartes_proches"]).is_empty(), "{:?}", tres["bilan"]);
    assert!(!notes(&tres).iter().any(|x| x.contains("présélection")), "{:?}", tres["notes"]);
    // LE FRONT IMPOSÉ PAR LA CLASSE RF EST DIT : une note, et `front_rf` au bilan ; une
    // porteuse (de la carte, ou du net) le tait.
    let ant = |reglages: Json| analyser(obj! {"pistes" => vec![droite("ANT", 0.0)], "natures" => j(r#"{"ANT": "RF"}"#), "reglages" => reglages});
    let rf = ant(obj! {});
    assert!(notes(&rf).iter().any(|x| x.contains("IMPOSÉ par la classe RF") && x.contains("ANT")), "{:?}", rf["notes"]);
    assert!(rf["bilan"]["front_rf"] == j(r#"{"nets": ["ANT"], "t_r": 1e-10, "porteuse_rf": null}"#));
    let por = ant(j(r#"{"porteuse_rf": 868e6}"#));
    assert!(!contient(&por["bilan"], "front_rf") && !notes(&por).iter().any(|x| x.contains("imposé")));
    assert!(!contient(&ant(j(r#"{"porteuses": {"ANT": 2.4e9}}"#))["bilan"], "front_rf"));
    assert!(!contient(&analyser(obj! {"pistes" => vec![droite("CLK", 0.0)], "natures" => j(r#"{"CLK": "Horloge"}"#)})["bilan"], "front_rf"));
}

/// La règle diaphonie compte l'impédance commune d'une fente du plan que l'agresseur et la
/// victime franchissent ensemble : le courant de retour RÉSOLU sur l'image des plans (option
/// B, PEEC, crosstalk 4.6.0) -- le même terme que « Analyser la piste » --, plan intact
/// dessous (cas 4b) et victime sur la couche voisine compris ; Ott en repli et en fourchette.
fn diaphonie_fente() {
    let pistes = || vec![droite_("CLK", 0.0, 0.0, 100.0, "Top", 0.35), droite_("DATA", 1.2, 0.0, 100.0, "Top", 0.35)];
    let nat = || j(r#"{"CLK": "Rapide", "DATA": "Rapide", "GND": "Masse"}"#);
    let plan = |c: &str, trous: Vec<Json>| obj! {"c" => c, "n" => "GND", "o" => carre(-10.0, -20.0, 110.0, 20.0), "t" => trous};
    let fente = || vec![carre(49.0, -10.0, 51.0, 10.0)]; // 2 mm de large, ±10 mm, en travers des deux
    let carte = |l2: Vec<Json>, l3: Vec<Json>| analyser(obj! {"pistes" => pistes(), "natures" => nat(), "plans" => vec![plan("L2", l2), plan("L3", l3)]});
    let sans = carte(vec![], vec![]);
    let avec_f = carte(fente(), fente());
    let (ps, pa) = (&paires(&sans)[0], &paires(&avec_f)[0]);
    assert!(!contient(ps, "fente") && pa["fente"].vrai(), "{:?} {:?}", ps["fente"], pa["fente"]);
    assert!(n(&sans["bilan"]["diaphonie"]["fentes_communes"]) == 0.0);
    assert!(n(&avec_f["bilan"]["diaphonie"]["fentes_communes"]) == 2.0); // les deux sens
    // LE TERME S'AJOUTE AUX LIGNES SEULES, qui restent le chiffre d'avant. Le retour résolu
    // d'une fente ÉTROITE (2 mm) est bien sous Ott : les deux bords portent des courants
    // opposés qui se compensent (4,3 nH de détour contre 16 nH) -- quelques pour-cent au lieu
    // d'une dizaine.
    let t = &pa["fente"]["detail"][0];
    assert!(txt(t, "modele") == "B", "{t:?}");
    assert!(3.0 < n(&t["ld_nh"]) && n(&t["ld_nh"]) < 6.0 && 0.0 < n(&t["m_nh"]) && n(&t["m_nh"]) <= n(&t["ld_nh"]), "{t:?}");
    let fn_ = n(&pa["fente"]["next"]);
    assert!(0.02 < fn_ && fn_ < 0.06, "{:?}", pa["fente"]);
    assert!((n(&pa["lignes"]["next"]) - n(&ps["next"])).abs() < 1e-9, "{:?} {:?}", pa["lignes"], ps["next"]);
    assert!((n(&pa["next"]) - (n(&ps["next"]) + fn_)).abs() < 1e-6, "{:?}", pa["next"]);
    // LA FOURCHETTE ENCADRE LES DEUX MODÈLES : Ott (tous les plans coupés, fente droite) en
    // tient la borne haute.
    let ott = n(&t["ott"]["next_pc"]) / 100.0;
    assert!(0.08 < ott && ott < 0.14, "{:?}", t["ott"]);
    assert!(n(&t["fourchette"][0]) <= n(&t["next"]) && n(&t["next"]) < ott && ott <= n(&t["fourchette"][1]), "{t:?}");
    assert!(n(&pa["next_fourchette"][0]) <= n(&pa["next"]) && n(&pa["next"]) <= n(&pa["next_fourchette"][1]));
    assert!(["orange", "rouge"].contains(&txt(pa, "statut")) && txt(ps, "statut") == "vert", "{:?} {:?}", pa["statut"], ps["statut"]);
    assert!(9.0 < n(&t["d1"]) && n(&t["d1"]) < 11.0 && 9.0 < n(&t["d2"]) && n(&t["d2"]) < 11.0, "{t:?}");
    assert!((n(&t["entraxe"]) - 1.2).abs() < 0.05, "{:?}", t["entraxe"]);
    let k = de(&avec_f, "diaphonie");
    assert!(k.len() == 1 && msg(&k[0]).contains("impédance commune") && msg(&k[0]).contains("résolu"), "{k:?}");
    // UN PLAN QUI RESTE DESSOUS (L3 intact, cas 4b) : le retour y passe en partie, le terme
    // est chiffré quand même -- plus petit -- et la ligne le dit.
    let part = carte(fente(), vec![]);
    let pp = &paires(&part)[0];
    let tp = &pp["fente"]["detail"][0];
    assert!(txt(tp, "modele") == "B" && tp["retour"] == j(r#"["L3"]"#) && !contient(tp, "ott"), "{tp:?}");
    assert!(0.0 < n(&pp["fente"]["next"]) && n(&pp["fente"]["next"]) < fn_, "{:?} {:?}", pp["fente"], pa["fente"]);
    assert!(n(&part["bilan"]["diaphonie"]["fentes_communes"]) == 2.0);
    assert!(!notes(&part).iter().any(|x| x.contains("SANS terme d'impédance commune")), "{:?}", part["notes"]);
    // UNE FENTE QUI S'ARRÊTE AVANT LA VICTIME (à 0,8 mm de ce côté, la victime à 1,2 mm) : la
    // victime ne la franchit pas, son terme résolu est bien plus petit que celui de la fente
    // entière.
    let courte = || vec![carre(49.0, -10.0, 51.0, 0.8)];
    let loin = carte(courte(), courte());
    let pl = &paires(&loin)[0];
    assert!(!contient(pl, "fente") || n(&pl["fente"]["next"]) < 0.5 * fn_, "{pl:?}");
    // UNE VICTIME SUR LA COUCHE VOISINE (larges faces, sans plan entre les deux) porte
    // maintenant le terme : seul le PEEC sait le chiffrer.
    let st = j(r#"{"layers": [{"type": "copper", "name": "Top", "role": "signal", "thickness": 0.035},
                              {"type": "dielectric", "name": "d1", "thickness": 0.1, "epsilon_r": 4.3},
                              {"type": "copper", "name": "In1", "role": "signal", "thickness": 0.035},
                              {"type": "dielectric", "name": "d2", "thickness": 0.1, "epsilon_r": 4.3},
                              {"type": "copper", "name": "L2", "role": "plane", "net": "GND", "thickness": 0.035}]}"#);
    let sup = doc_ok(&obj! {"format" => "cao-analyse-carte-1", "unite_mm" => 1i64, "stackup" => st,
                            "pistes" => vec![droite_("CLK", 0.0, 0.0, 100.0, "Top", 0.35), droite_("DATA", 0.3, 0.0, 100.0, "In1", 0.35)],
                            "natures" => nat(), "plans" => vec![plan("L2", fente())]});
    let psup = &paires(&sup)[0];
    assert!(psup["superposee"].vrai() && psup["fente"].vrai(), "{psup:?}");
    assert!(txt(&psup["fente"]["detail"][0], "modele") == "B", "{:?}", psup["fente"]);
}

pub fn banc() {
    println!("\nLa diaphonie");
    T("test_diaphonie", diaphonie);
    T("test_diaphonie_fext_plafonne", diaphonie_fext_plafonne);
    T("test_diaphonie_garde_seuil_front_rf", diaphonie_garde_seuil_front_rf);
    T("test_diaphonie_fente", diaphonie_fente);
}
