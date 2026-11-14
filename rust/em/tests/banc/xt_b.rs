//! python/test/banc-crosstalk.py, deuxieme partie : ce qui a ete trouve faux, et qui ne doit
//! plus le redevenir (le plan qui manque, les gardes, les couches, l'ordre du cuivre).

use crate::xt::*;
use crate::*;

fn sans_plan(nom_bas: &str, epaisseur: f64) -> Json {
    j(&format!(r#"{{"layers": [
        {{"type": "copper", "name": "Top", "thickness": 0.035,
         "role": "signal"}},
        {{"type": "dielectric", "name": "FR-4", "thickness": {epaisseur:?},
         "epsilon_r": 4.3, "tan_delta": 0.02}},
        {{"type": "copper", "name": "{nom_bas}", "thickness": 0.035,
         "role": "signal"}}
    ]}}"#))
}

/// L'agresseur change de couche, la victime longe A PLAT : elle est RETENUE.
///
/// C'EST LE FAUX NEGATIF LE PLUS COUTEUX DE TOUTE LA SECTION, et il se rendait
/// en silence. Les candidats etaient indexes par (net, couche) et leur `type`,
/// leur `distance` et leur `blinde` etaient figes a la PREMIERE rencontre : il
/// suffisait que l'agresseur ait commence sur une AUTRE couche pour que la
/// voisine soit vue « verticale, separee par un plan », donc ecartee -- alors
/// qu'elle longe franchement a plat sur la seconde moitie du parcours. Une
/// piste a 0,2 mm sur 20 mm ressortait « aucune candidate ne passe la
/// preselection », et la fiche annoncait « aucun couple confirme ».
fn un_longement_lateral_reel_n_est_plus_ecarte_comme_blinde() {
    let doc = obj! {
        "format" => "cao-crosstalk-1", "carte" => "banc", "agresseurs" => vec!["CLK"],
        "stackup" => STACK(),
        // 20 mm sur Top, puis 20 mm sur Bottom.
        "geometry" => obj! {"objects" => vec![pis_c(0.0, 0.0, 20.0, 0.0, "CLK", 0),
                                              pis_c(20.0, 0.0, 40.0, 0.0, "CLK", 4)]},
        // La victime est sur Bottom du bout en bout : vue par-dessous (avec un
        // plan entre les deux) sur la premiere moitie, A COTE sur la seconde.
        "voisinage" => vec![pis_c(0.0, 0.45, 40.0, 0.45, "VIC", 4)],
        "reference_nets" => vec!["GND"],
        "reglages" => obj! {"t_r" => 100e-12},
    };
    let res = an(&doc);
    assert!(res["etape0"]["retenus"] == j(r#"["VIC"]"#),
            "un longement lateral reel doit etre retenu : {:?}",
            els(&res["etape0"]["candidats"]).iter().map(|c| (t(&c["net"]), t(&c["type"]), t(&c["raison"]))).collect::<Vec<_>>());
    let c = candidat(&res, "VIC").unwrap();
    assert!(t(&c["type"]) == "latéral", "{}", t(&c["type"]));
    assert!(!c["blinde"].vrai(), "deux pistes de la meme couche ne sont pas separees");
    // LES DEUX NATURES SONT MESUREES A PART, et la longueur laterale est celle
    // du longement a plat -- 20 mm, pas la somme des deux.
    assert!((n(&c["longueur_laterale"]) - 20.0).abs() < 1.0, "{}", n(&c["longueur_laterale"]));
    assert!((n(&c["longueur_verticale"]) - 20.0).abs() < 1.0, "{}", n(&c["longueur_verticale"]));
    assert!(c["blinde_verticalement"].vrai(), "un plan separe bien Top de Bottom");
    // ET LE COUPLAGE EST MASSIF : c'est ce que l'ancien code rendait « nul ».
    let couple = &res["couples"][0];
    assert!(couple["confirmee"].vrai() && n(&couple["next_db"]) > -30.0, "{}", n(&couple["next_db"]));
    // LA PORTION SUPERPOSEE NON COUPLEE EST DITE, jamais comptee zero en
    // silence -- ici elle est blindee, donc une note et non une reserve.
    assert!(avertis(&res).iter().any(|a| a.contains("de deux façons")),
            "{:?}", avertis(&res));
}

/// Pas de plan de reference : le zero rendu est une ABSENCE de mesure.
///
/// C'EST LE FAUX NEGATIF LE PLUS GRAVE que ce module puisse produire. Quand la
/// section droite n'est pas resoluble -- pas de plan sous la piste --, chaque
/// conducteur retombe sur sa ligne isolee, [C] et [L] restent DIAGONALES, et
/// le terme croise vaut exactement zero. Le calcul aboutit, la carte se
/// dessine, la fiche annonce « aucune voisine ne depasse le seuil », et rien
/// ne distingue « elles ne couplent pas » de « on n'a pas su calculer ». Or
/// c'est justement le cas ou le couplage reel EXPLOSE, faute de chemin de
/// retour court.
///
/// DEPUIS LA LIGNE COPLANAIRE SANS PLAN, ce cas exige AUSSI l'absence de
/// masse arrosee sur la couche : avec elle, la section se resout (voir le cas
/// suivant). Les ecarts de l'agresseur sont donc mis a zero -- rien ne porte
/// le retour, et c'est le solveur qui le dit.
fn le_couplage_non_calcule_ne_se_lit_plus_comme_un_couplage_nul() {
    let mut doc = doc_avec(doc_essai(vec![pis(0.0, 0.45, 40.0, 0.45, "VIC")], &[]), "stackup", sans_plan("L2", 0.2));
    ecarts_selection(&mut doc, 0.0);
    let res = an(&doc);
    assert!(res["etape0"]["retenus"] == j(r#"["VIC"]"#), "{}", dumps(&res["etape0"]["retenus"]));
    assert!(!res["couples"][0]["confirmee"].vrai(),
            "sans plan, le terme croise tombe au plancher -- c'est le fait");
    assert!(titres(&res).contains("NON CALCULÉ"),
            "un couplage non calcule doit lever une reserve GRAVE : {}", titres(&res));
    let dit: Vec<String> = avertis(&res).into_iter().filter(|a| a.contains("NON CALCULÉ")).collect();
    assert!(!dit.is_empty() && dit[0].to_lowercase().contains("plancher"), "{dit:?}");
    assert!(avertis(&res).iter().any(|a| a.contains("Section droite non résoluble")), "{:?}", avertis(&res));
}

/// Carte deux couches, masse arrosee sur la couche : le couplage SE CALCULE.
///
/// C'EST LE CAS ORDINAIRE D'UNE CARTE SANS PLAN : le retour passe par le
/// cuivre de masse de la meme couche, de part et d'autre des pistes. La
/// section est alors une ligne coplanaire SANS PLAN dessous, et elle se
/// resout. Trois choses se verifient :
///   · le couple est CONFIRME, avec un niveau -- pas un plancher ;
///   · le Kb du bloc est celui de `ligne_mom` sur la meme section : la
///     cascade ne retranche ni n'ajoute rien a la section droite ;
///   · la fiche DIT que la section a ete resolue sans plan.
fn sans_plan_la_masse_de_la_couche_porte_le_retour() {
    let pile = sans_plan("Bottom", 1.6);
    let mut doc = doc_avec(doc_essai(vec![pis(0.0, 0.45, 40.0, 0.45, "VIC")], &[]), "stackup", &pile);
    let res = an(&doc);
    let c = couple(&res, "VIC").unwrap();
    assert!(c["confirmee"].vrai() && n(&c["next_db"]) > -40.0, "{}", dumps(&c));
    assert!(avertis(&res).iter().any(|a| a.contains("SANS PLAN")),
            "{:?}", avertis(&res));
    assert!(!titres(&res).contains("NON CALCULÉ"), "{}", titres(&res));

    // LE MEME KB QUE LA SECTION DROITE. La selection (0,25 mm) a ses masses a
    // 0,5 mm de cuivre a cuivre ; la victime, centree a 0,45 mm, borde le
    // groupe a droite -- l'ecart du groupe y est de 0,05 mm.
    let (geo, _) = section_de_couche(els(&pile["layers"]), 0, 0.25, 0.035,
                                     0.5, Some(0.05), &[], true);
    let mut geo = geo.unwrap();
    poser(&mut geo, "conducteurs", j(r#"[{"w": 0.25e-3, "x": 0.0},
                                         {"w": 0.25e-3, "x": 0.45e-3}]"#));
    let r = tl::solve_multiline(&geometrie(&geo)).unwrap();
    let (kb_ref, _kf) = ct::coefficients_couple(&r.c, &r.l, 0, 1);
    poser(&mut doc, "mode", "simple");
    let simple = an(&doc);
    let kb = n(&couple(&simple, "VIC").unwrap()["kb_max"]);
    assert!((kb / kb_ref - 1.0).abs() < 1e-3, "{kb} {kb_ref}");
}

/// Pas de plan : le seuil auto ne tombe pas a trois largeurs de piste.
///
/// LE PIEGE EST DANS LA DEDUCTION ELLE-MEME. `_hauteur_de_couche` rend ZERO
/// quand la couche n'a pas de plan de reference, et « 3 x max(largeur,
/// hauteur) » tombait alors a 3 x 0,25 = 0,75 mm : le seuil le PLUS SEVERE de
/// tous, applique exactement la ou le champ porte le plus loin faute de plan
/// pour le borner. Une voisine a 1 mm -- celle qui pose probleme sur une
/// carte sans plan -- ressortait « au-dela du seuil de 0,750 mm : vue mais
/// non simulee ».
fn sans_plan_le_seuil_de_distance_s_ouvre_au_lieu_de_se_fermer() {
    // Une voisine a 1 mm de l'axe, soit 0,75 mm de bord a bord.
    let doc = doc_avec(doc_essai(vec![pis(0.0, 1.0, 40.0, 1.0, "VIC")], &[]), "stackup", sans_plan("L2", 0.2));
    let res = an(&doc);
    let seuils = &res["etape0"]["seuils"];
    assert!(n(&seuils["hauteur"]) == 0.0, "{}", dumps(seuils));
    assert!(n(&seuils["distance_max"]) >= 3.0 - 1e-9,
            "sans plan, le seuil doit s'OUVRIR : {}", dumps(seuils));
    assert!(t(&seuils["source"]).contains("maximum du voisinage"), "{}", t(&seuils["source"]));
    assert!(res["etape0"]["retenus"] == j(r#"["VIC"]"#),
            "{:?}", els(&res["etape0"]["candidats"]).iter().map(|c| (t(&c["net"]), t(&c["raison"]))).collect::<Vec<_>>());
    // ET LE FAIT SE DIT UNE FOIS, EN RESERVE : tout le calcul en depend.
    assert!(titres(&res).contains("aucun plan de référence"), "{}", titres(&res));

    // AVEC UN PLAN, LA DEDUCTION NE BOUGE PAS D'UN POUCE.
    let avec = an(&doc_essai(vec![pis(0.0, 1.0, 40.0, 1.0, "VIC")], &[]));
    assert!(n(&avec["etape0"]["seuils"]["hauteur"]) > 0.0);
    assert!(t(&avec["etape0"]["seuils"]["source"]).contains("déduit (3 ×"),
            "{}", t(&avec["etape0"]["seuils"]["source"]));
}

/// Le modele suppose un plan continu ; la fente dit qu'il n'y en a pas.
///
/// LA SECTION DROITE QUASI-TEM N'EXISTE QUE SI LE RETOUR PASSE JUSTE DESSOUS.
/// Une fente sondee par la page sous un longement retenu rend le chiffre
/// OPTIMISTE -- l'inductance mutuelle monte, le couplage reel avec elle --, et
/// « sous le seuil » n'y est plus un verdict. Une fente AILLEURS, en revanche,
/// ne dit rien de la carte de couplage : elle n'invalide que ce qu'elle
/// touche, et confondre les deux ferait une alerte permanente.
fn une_fente_sous_le_longement_leve_une_reserve() {
    let dedans = doc_avec(doc_essai(vec![pis(10.0, 0.45, 30.0, 0.45, "VIC")], &[]), "fentes",
                          j(r#"[{"s": 12.0, "longueur": 6.0,
                                 "quoi": "pas de cuivre de masse sous le parcours"}]"#));
    let res = an(&dedans);
    assert!(titres(&res).contains("plan de référence absent sous"), "{}", titres(&res));

    let ailleurs = doc_avec(doc_essai(vec![pis(10.0, 0.45, 30.0, 0.45, "VIC")], &[]), "fentes",
                            j(r#"[{"s": 33.0, "longueur": 4.0,
                                   "quoi": "pas de cuivre de masse sous le parcours"}]"#));
    let res2 = an(&ailleurs);
    assert!(!titres(&res2).contains("plan de référence absent sous"), "{}", titres(&res2));
}

/// [C](1 - j tan d) : lambda ET W portent la racine du facteur.
///
/// L'ETALON EST ANALYTIQUE ET IL NE PARTAGE AUCUNE LIGNE DE CODE avec le
/// module : Zc = sqrt(L / (C(1 - j tan d))), gamma = j w sqrt(LC(1 - j tan d)),
/// puis S11 d'une ligne chargee par sa reference. La version precedente ne
/// multipliait que `racines` : l'impedance caracteristique restait celle du
/// sans-perte, une ligne « adaptee » rendait S11 = 0 a la precision machine,
/// et le Touchstone exporte -- ce qu'on compare justement a un solveur pleine
/// onde -- annoncait une ligne sans aucun retour.
fn tan_delta_porte_aussi_sur_l_impedance_caracteristique() {
    let (eps, z0, td, f, d) = (4.3f64, 50.0, 0.02, 5e9, 0.040);
    let racine = eps.sqrt();
    let c = racine / (ct::C_0 * z0);
    let l = z0 * racine / ct::C_0;
    let w = 2.0 * PI * f;
    let s = &ct::s_depuis_chaine(
        &ct::chaine_mtl(&[vec![l]], &[vec![c]], d, &[w], td).unwrap(), z0).unwrap()[0];

    let zc = (Complex64::new(l, 0.0) / (c * Complex64::new(1.0, -td))).sqrt();
    let gamma = Complex64::new(0.0, w) * (l * c * Complex64::new(1.0, -td)).sqrt();
    let th = (gamma * d).tanh();
    let zin = zc * (z0 + zc * th) / (zc + z0 * th);
    let s11 = (zin - z0) / (zin + z0);
    assert!((s[0][0] - s11).norm() < 1e-9,
            "S11 avec pertes : {} contre {} (analytique)", s[0][0], s11);
    // ET IL N'EST PLUS NUL : c'est le retour qui manquait au fichier exporte.
    assert!(ct::_db(s[0][0].norm()) > -60.0, "{}", ct::_db(s[0][0].norm()));
    // SANS PERTES, RIEN NE CHANGE : la ligne adaptee ne reflechit rien.
    let sans = &ct::s_depuis_chaine(
        &ct::chaine_mtl(&[vec![l]], &[vec![c]], d, &[w], 0.0).unwrap(), z0).unwrap()[0];
    assert!(sans[0][0].norm() < 1e-12, "{}", sans[0][0]);
}

/// Rien n'a ete simule n'est pas « rien ne couple ».
///
/// LA PAGE RENDAIT LE MEME VERDICT dans les deux cas -- « AUCUN COUPLE
/// CONFIRME », suivi de « leurs courbes sont tracees quand meme » -- pour une
/// presélection vide et pour un calcul complet dont tout tombe sous le seuil.
/// Le premier est une absence de mesure, le second en est une ; la clef le
/// dit, et le titre de la fiche en depend.
fn une_preselection_vide_ne_se_lit_pas_comme_un_verdict() {
    let vide = an(&doc_essai(vec![], &[]));
    assert!(vide["preselection_vide"] == true.j());
    let loin = an(&doc_essai(vec![pis(0.0, 0.45, 40.0, 0.45, "VIC")],
                             &[("seuil_db", 0.0.j())]));
    assert!(loin["preselection_vide"] == false.j());
    assert!(loin["couples"].vrai() && !loin["couples"][0]["confirmee"].vrai());
}

/// La piste de masse tracee entre l'agresseur et sa victime COMPTE.
///
/// ELLE ETAIT JETEE A L'ETAPE 0a, avec le motif « c'est une garde, pas une
/// victime » -- ce qui est vrai de son PORT et faux de son CUIVRE. La coupe
/// resolue ne la contenait pas : le NEXT annonce etait celui d'un routage
/// qu'on n'avait pas fait, et poser une garde ne changeait pas un decibel.
///
/// LES DEUX SENS SONT VERIFIES, et c'est le point. Cousue, elle est tenue a
/// zero volt et le couplage TOMBE ; sans vias, elle est posee FLOTTANTE et le
/// couplage ne tombe plus -- il remonte au-dessus de ce qu'il vaut sans
/// aucune garde, parce qu'un tel cuivre ne blinde pas, il transfere. Un banc
/// qui ne verifierait que le premier sens laisserait passer une garde posee a
/// zero volt quoi qu'il arrive, qui rassurerait toujours.
fn une_garde_routee_entre_dans_la_section() {
    let loin = || vec![pis(0.0, 0.9, 40.0, 0.9, "VIC")];
    let garde = || vec![pis(0.0, 0.45, 40.0, 0.45, "GND"), pis(0.0, 0.9, 40.0, 0.9, "VIC")];
    let nue = || vec![pis_o(0.0, 0.45, 40.0, 0.45, "GND", 0, 0.25, 30.0),
                      pis(0.0, 0.9, 40.0, 0.9, "VIC")];
    let next_db = |res: &Json| n(&res["couples"][0]["next_db"]);
    let sans = next_db(&an(&doc_essai(loin(), &[])));
    let avec = an(&doc_essai(garde(), &[]));
    let sans_vias = next_db(&an(&doc_essai(nue(), &[])));
    assert!(next_db(&avec) < sans - 3.0,
            "une garde cousue doit faire tomber le NEXT : {:.2} -> {:.2} dB",
            sans, next_db(&avec));
    assert!(sans_vias > next_db(&avec) + 3.0,
            "une garde non cousue ne doit pas blinder : {:.2} dB contre {:.2}",
            sans_vias, next_db(&avec));
    assert!(sans_vias >= sans - 0.1,
            "un cuivre flottant TRANSFERE : {sans_vias:.2} dB contre {sans:.2} sans garde");

    // ET ELLE N'EST PAS UNE VICTIME POUR AUTANT : pas de port, pas de courbe.
    assert!(avec["etape0"]["gardes"] == j(r#"["GND"]"#), "{}", dumps(&avec["etape0"]["gardes"]));
    assert!(!els(&avec["etape0"]["retenus"]).iter().any(|x| t(x) == "GND"), "{}", dumps(&avec["etape0"]["retenus"]));
    assert!(couple(&avec, "GND").is_none(),
            "une garde n'a pas de bruit a elle");
    let pose = &avec["blindage"]["gardes"][0];
    assert!((n(&pose["longueur"]) - 40.0).abs() < 0.1, "{}", dumps(pose));
    assert!(n(&pose["longueur_flottante"]) == 0.0, "{}", dumps(pose));
    let flotte = an(&doc_essai(nue(), &[]))["blindage"]["gardes"][0].clone();
    assert!((n(&flotte["longueur_flottante"]) - 40.0).abs() < 0.1, "{}", dumps(&flotte));
}

/// Le plan arrose qui borde le groupe n'est a zero volt que s'il est cousu.
///
/// IL Y ETAIT TOUJOURS, ET PARFAITEMENT. Le solveur posait l'ecart au plan
/// lateral quel que soit le nombre de vias de ce plan : un plan sans une seule
/// couture sur trente millimetres blindait dans le calcul exactement comme un
/// plan cousu au pas du millimetre. Le defaut sortait en TEXTE, et les
/// decibels ne bougeaient pas -- ce qui est la pire des deux facons de le
/// dire, puisque c'est le chiffre qu'on lit.
///
/// L'ecart de ce cote-la est donc mis a ZERO -- « pas de masse coplanaire
/// ici » pour `ligne_mom` --, et le couplage rendu remonte.
fn un_plan_de_bord_non_cousu_cesse_de_blinder() {
    // L'agresseur, avec un plan arrose SERRE et cousu comme on veut.
    let borde = |couture: f64| {
        let mut doc = doc_essai(vec![pis(0.0, 0.9, 40.0, 0.9, "VIC")], &[]);
        ecarts_selection(&mut doc, 0.15);
        if let Json::Liste(objets) = dans(dans(&mut doc, "geometry"), "objects") {
            for o in objets {
                poser(o, "couture_left", couture);
                poser(o, "couture_right", couture);
            }
        }
        doc
    };

    let cousu = an(&borde(0.4));
    let nu = an(&borde(30.0));
    let next_db = |res: &Json| n(&res["couples"][0]["next_db"]);
    assert!(next_db(&nu) > next_db(&cousu) + 0.3,
            "un plan non cousu doit faire REMONTER le couplage : {:.2} contre {:.2}",
            next_db(&nu), next_db(&cousu));
    assert!(!cousu["blindage"]["bords_non_cousus"].vrai(),
            "{}", dumps(&cousu["blindage"]["bords_non_cousus"]));
    let bords = els(&nu["blindage"]["bords_non_cousus"]);
    assert!(!bords.is_empty() && n(&bords[0]["couture"]) == 30.0, "{bords:?}");
    assert!(avertis(&nu).iter().any(|a| a.contains("PLAN ARROSÉ NON COUSU")),
            "{:?}", avertis(&nu));
    // UN BORD DONT L'ECART ETAIT DEJA NUL NE PERD RIEN, et ne se compte donc
    // pas : le groupe s'etend au-dela du cuivre que la sonde a trouve de ce
    // cote-la, et l'annoncer ferait compter un defaut sans effet.
    assert!(bords.len() == 1, "{bords:?}");
}

/// Un net est un NOEUD ELECTRIQUE : il n'a qu'une paire de ports.
///
/// LE CAS EST ORDINAIRE SUR UNE VRAIE CARTE : une voisine longe a plat, puis
/// repasse SOUS l'agresseur sur la couche d'en dessous. La preselection range
/// par (net, couche) -- il le faut, ce sont deux situations de dessin -- et le
/// reseau, lui, indexait par NET. Le dictionnaire `par_net` de `_matrices_bloc`
/// ecrasait donc le doublon, et les rangees de [C] et [L] du longement LATERAL
/// partaient au conducteur VERTICAL : la victime qui couple a 0,15 mm sortait
/// a -300 dB et « non confirmee », pendant que l'autre ligne -- celle que
/// l'avertissement annonce comme « non modelisee, elle ressortira au
/// plancher » -- portait les -10,6 dB.
///
/// RIEN NE LEVAIT, ET LES DEUX CHIFFRES ETAIENT CREDIBLES. `_fiche_candidat`
/// rendant par-dessus le marche la PREMIERE fiche du nom, les deux lignes
/// s'affichaient avec la meme distance et la meme couche, dont une au moins
/// etait fausse. C'est le resultat faux et silencieux que tout ce module est
/// ecrit pour ne pas produire, et il ne demandait qu'un net sur deux couches.
fn un_net_sur_deux_couches_est_un_seul_conducteur() {
    let stack = j(r#"{"layers": [
        {"type": "copper", "name": "Top", "thickness": 0.035,
         "role": "signal"},
        {"type": "dielectric", "name": "haut", "thickness": 0.2,
         "epsilon_r": 4.3, "tan_delta": 0.02},
        {"type": "copper", "name": "In1", "thickness": 0.035,
         "role": "signal"},
        {"type": "dielectric", "name": "bas", "thickness": 0.2,
         "epsilon_r": 4.3, "tan_delta": 0.02},
        {"type": "copper", "name": "GND", "thickness": 0.035,
         "role": "plane", "net": "GND"}
    ]}"#);
    let doc = doc_avec(doc_essai(vec![pis(0.0, 0.4, 40.0, 0.4, "DATA"),
                                      pis_c(0.0, 0.0, 40.0, 0.0, "DATA", 2)], &[]), "stackup", stack);
    let res = an(&doc);

    // LE TABLEAU GARDE SES DEUX LIGNES : fondre les couches effacerait
    // justement ce qu'on veut lire.
    let fiches: Vec<&Json> = els(&res["etape0"]["candidats"]).iter().filter(|c| t(&c["net"]) == "DATA").collect();
    assert!(fiches.len() == 2, "{fiches:?}");
    let mut types: Vec<&str> = fiches.iter().map(|c| t(&c["type"])).collect();
    types.sort();
    assert!(types == ["latéral", "vertical"], "{fiches:?}");

    // LE CALCUL, LUI, N'EN POSE QU'UN CONDUCTEUR.
    assert!(res["etape0"]["retenus"] == j(r#"["DATA"]"#), "{}", dumps(&res["etape0"]["retenus"]));
    let couples: Vec<&Json> = els(&res["couples"]).iter().filter(|c| t(&c["victime"]) == "DATA").collect();
    assert!(couples.len() == 1, "{couples:?}");

    // ET LA FICHE EST CELLE DU LONGEMENT QUE LA SECTION RESOUT, pas celle du
    // premier candidat venu : c'est la que l'erreur se lisait.
    let c = couples[0];
    assert!(t(&c["type"]) == "latéral", "{}", dumps(c));
    assert!((n(&c["distance"]) - 0.15).abs() < 1e-6, "{}", dumps(c));
    assert!(t(&c["nom_couche"]) == "Top", "{}", dumps(c));
    assert!(c["confirmee"].vrai() && n(&c["next_db"]) > -60.0, "{}", dumps(c));

    // LA PORTION SUPERPOSEE EST RESOLUE ET COMPTEE, sur la meme ligne -- pas
    // comme un couplage nul, et pas sur une ligne fantome.
    assert!(c["superposee"].vrai() && (n(&c["longueur_superposee"]) - 40.0).abs() < 1.0, "{}", dumps(c));
    assert!(avertis(&res).iter().any(|a| a.contains("SUPERPOSÉES")),
            "{:?}", avertis(&res));
    assert!(avertis(&res).iter().any(|a| a.contains("qu'UN conducteur")),
            "la fusion par net doit se dire");
}

/// L'abscisse curviligne SUPPOSE que les troncons se suivent.
///
/// `s` se cumule bout a bout dans l'ordre ou la page envoie les objets, et
/// rien ne verifiait que le bout d'un troncon touche le debut du suivant. Une
/// liste mal ordonnee donne alors un axe de position FAUX sans que rien ne
/// leve : la carte reste lisse, les pics tombent a des millimetres qui
/// existent, et aucun chiffre ne parait anormal.
///
/// LE FAUX POSITIF EST LE VRAI RISQUE ICI : une alerte qui se declenche sur
/// une liaison ordinaire ferait ignorer toutes les autres. Le premier cas est
/// donc un parcours normal, et il doit rester MUET.
fn un_cuivre_non_contigu_le_dit() {
    let ordre = |objets: Vec<Json>| -> Vec<String> {
        let mut doc = doc_essai(vec![pis(0.0, 0.4, 40.0, 0.4, "VIC")], &[]);
        poser(dans(&mut doc, "geometry"), "objects", objets);
        avertis(&an(&doc)).into_iter().filter(|a| a.contains("CONTIGU") || a.contains("L'ENVERS")).collect()
    };

    assert!(ordre(vec![pis(0.0, 0.0, 20.0, 0.0, "CLK"), pis(20.0, 0.0, 40.0, 0.0, "CLK")]).is_empty(),
            "un parcours contigu ne doit rien dire");
    let casse = ordre(vec![pis(20.0, 0.0, 40.0, 0.0, "CLK"), pis(0.0, 0.0, 20.0, 0.0, "CLK")]);
    assert!(!casse.is_empty() && casse[0].contains("N'EST PAS CONTIGU"), "{casse:?}");
    // UN TRONCON RETOURNE EST UN AUTRE DEFAUT : les bouts se touchent, donc
    // l'abscisse reste juste ; c'est le SIGNE du cote qui s'inverse.
    let envers = ordre(vec![pis(0.0, 0.0, 20.0, 0.0, "CLK"), pis(40.0, 0.0, 20.0, 0.0, "CLK")]);
    assert!(!envers.is_empty() && envers[0].contains("L'ENVERS"), "{envers:?}");
}

/// La GEOMETRIE du plan entre dans [C] et [L], pas seulement l'empilage.
///
/// C'EST LE FAUX LE PLUS COUTEUX QUE CE MODULE AIT PORTE, et il ne se voyait
/// sur aucune carte : l'empilage est GLOBAL -- il declare qu'une couche est un
/// plan --, alors que la presence de cuivre est LOCALE. Deux longements de
/// meme dessin, l'un sur plan plein et l'autre survolant une decoupe, se
/// resolvaient BIT POUR BIT pareil. Sur une carte d'essai portant expres les
/// deux configurations cote a cote, les deux NEXT sortaient au centieme de dB
/// identiques, et rien dans le resultat ne s'en etonnait.
///
/// TROIS CHOSES SE VERIFIENT ICI, et elles sont independantes :
///   · la fente CHANGE le resultat -- sans quoi le champ ne sert a rien ;
///   · quand un SECOND plan existe derriere, le bloc retombe dessus : plus
///     loin, donc plus couple, et non pas « non calculable » ;
///   · quand il n'y en a pas d'autre, le bloc est declare NON CALCULE et le
///     dit dans les defauts graves -- le plancher ne doit jamais se lire
///     comme un decouplage.
fn une_fente_change_le_couplage_et_ne_le_laisse_pas_identique() {
    // Un empilage a DEUX plans sous la piste : le proche a 0,2 mm, le lointain
    // a 1,2 mm. Une fente dans le proche doit faire descendre la reference.
    let deux = DEUX_PLANS();

    let lancer = |stack: &Json, fentes: Json| {
        an(&doc_avec(doc_avec(doc_essai(vec![pis(0.0, 0.5, 40.0, 0.5, "VICT")], &[]), "stackup", stack), "fentes", fentes))
    };

    let next_db = |res: &Json| n(&couple(res, "VICT").expect("pas de couple VICT dans le resultat")["next_db"]);

    let fente = j(r#"[{"s": 0.0, "longueur": 40.0, "plans": ["GND1"],
                       "quoi": "le plan GND1 n'a pas de cuivre de retour"}]"#);

    // (1) DEUX PLANS : la fente fait descendre la reference d'un etage.
    let plein = next_db(&lancer(&deux, j("[]")));
    let perce = next_db(&lancer(&deux, fente));
    assert!((plein - perce).abs() > 0.5,
            "une fente sur le plan proche ne change RIEN au couplage : {plein:.2} dB \
             contre {perce:.2} dB. C'est exactement le defaut que ce cas garde.");
    // Plus loin du plan, c'est plus couple : le signe n'est pas libre.
    assert!(perce > plein,
            "la reference descendue d'un etage doit COUPLER PLUS : {perce:.2} dB au lieu \
             de {plein:.2} dB");

    // (2) UN SEUL PLAN, PERCE, MAIS LA MASSE ARROSEE DE LA COUCHE RESTE : la
    // section retombe sur la coplanaire SANS PLAN -- plus loin de toute
    // reference, donc plus couplee que sur le plan plein -- et le dit.
    let perce_seul = j(r#"[{"s": 0.0, "longueur": 40.0, "plans": ["GND"],
                            "quoi": "le plan GND n'a pas de cuivre de retour"}]"#);
    let cpw = lancer(&STACK(), perce_seul.clone());
    assert!(next_db(&cpw) > plein,
            "sans plan, la masse coplanaire seule doit coupler PLUS : {:.2} dB \
             contre {:.2} dB", next_db(&cpw), plein);
    assert!(avertis(&cpw).iter().any(|a| a.contains("SANS PLAN")),
            "{:?}", avertis(&cpw));

    // (2 bis) ET SANS MASSE ARROSEE NON PLUS : il ne reste aucune reference.
    // Le bloc n'est pas calculable, et cela se dit -- ce n'est pas un
    // couplage nul.
    let mut d = doc_avec(doc_essai(vec![pis(0.0, 0.5, 40.0, 0.5, "VICT")], &[]), "fentes", perce_seul);
    ecarts_selection(&mut d, 0.0);
    let nu = an(&d);
    assert!(next_db(&nu) < -100.0,
            "sans aucune reference, le couplage ne peut pas etre calcule : {:.2} dB",
            next_db(&nu));
    assert!(titres(&nu).to_uppercase().contains("NON CALCUL"),
            "le plancher sort sans etre annonce comme non calcule : {}", titres(&nu));

    // (3) UNE FENTE SANS NOM DE PLAN NE FAIT RIEN. Les pages anterieures au
    // champ `plans` n'envoient que la prose ; elles doivent continuer de rendre
    // ce qu'elles rendaient, et non un plancher surgi de nulle part.
    let muette = next_db(&lancer(&STACK(), j(r#"[{"s": 0.0, "longueur": 40.0,
                                                  "quoi": "fente sans nom de plan"}]"#)));
    let temoin = next_db(&lancer(&STACK(), j("[]")));
    assert!((muette - temoin).abs() < 1e-9,
            "une fente sans champ `plans` a change le calcul : {muette:.4} contre {temoin:.4}");
}

pub fn banc() {
    titre("Ce qui a ete trouve faux, et qui ne doit plus le redevenir");
    T("un longement lateral reel n'est plus ecarte comme blinde",
      un_longement_lateral_reel_n_est_plus_ecarte_comme_blinde);
    T("le couplage non calcule ne se lit plus comme un couplage nul",
      le_couplage_non_calcule_ne_se_lit_plus_comme_un_couplage_nul);
    T("sans plan, la masse de la couche porte le retour et le couplage se calcule",
      sans_plan_la_masse_de_la_couche_porte_le_retour);
    T("sans plan, le seuil de distance s'ouvre au lieu de se fermer",
      sans_plan_le_seuil_de_distance_s_ouvre_au_lieu_de_se_fermer);
    T("une fente sous le longement leve une reserve, ailleurs non",
      une_fente_sous_le_longement_leve_une_reserve);
    T("tan delta porte aussi sur l'impedance caracteristique",
      tan_delta_porte_aussi_sur_l_impedance_caracteristique);
    T("une preselection vide ne se lit pas comme un verdict",
      une_preselection_vide_ne_se_lit_pas_comme_un_verdict);
    T("une garde routee entre dans la section, cousue ou non",
      une_garde_routee_entre_dans_la_section);
    T("un plan de bord non cousu cesse de blinder, et le dit",
      un_plan_de_bord_non_cousu_cesse_de_blinder);
    T("un net qui longe sur deux couches reste UN conducteur",
      un_net_sur_deux_couches_est_un_seul_conducteur);
    T("un cuivre envoyé dans le désordre le dit", un_cuivre_non_contigu_le_dit);
    T("une fente sous le longement change le couplage, et le dit quand elle \
       l'empeche",
      une_fente_change_le_couplage_et_ne_le_laisse_pas_identique);
}
