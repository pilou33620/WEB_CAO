//! Le moignon et la cavite entre plans (cas de banc-ligne-mom.py).

use crate::*;
use crate::empilage_vias::*;

pub fn _SIX() -> Vec<Json> {
    vec![
        _cu("TOP", "signal"),
        _di("PP1", 0.150, 4.30),
        avec(&_cu("GND", "plane"), &[("net", "GND".j())]),
        _di("C1", 0.400, 4.30),
        _cu("IN3", "signal"),
        _di("C2", 0.400, 4.30),
        avec(&_cu("GND2", "plane"), &[("net", "GND".j())]),
        _di("PP2", 0.150, 4.30),
        _cu("BOT", "signal"),
    ]
}

pub fn _GND_PWR() -> Vec<Json> {
    _QUATRE_NETS()
}

pub fn _SANS_NETS() -> Vec<Json> {
    _QUATRE()
}

pub fn _doc_moignon_f(couches: &[Json], dep: i64, arr: i64, via: &Json, fc: f64, fmax: f64) -> Json {
    let mut d = _doc_via_c(vec![_piste_l(0.0, 0.0, 10.0, 0.0, dep, 0.15, None),
                                _piste_l(10.0, 0.0, 20.0, 0.0, arr, 0.15, Some(via))],
                           couches, fc);
    poser(&mut d, "analyse", obj! {"f_debut" => 0.1e9, "f_fin" => fmax, "f_centre" => fc,
                                   "points" => 21i64});
    poser(&mut d, "reference_nets", vec!["GND"]);
    d
}

pub fn _doc_moignon(couches: &[Json], dep: i64, arr: i64, via: &Json) -> Json {
    _doc_moignon_f(couches, dep, arr, via, 3e9, 20e9)
}

pub fn _via_moignon_p(portee: Option<(i64, i64)>, ponts: Option<Vec<Json>>, retours: &[Json], rayon: Option<f64>) -> Json {
    let mut v = obj! {"drill_diameter" => 0.25, "pad_diameter" => 0.55,
                      "antipad_diameter" => 0.80, "x" => 10.0, "y" => 0.0,
                      "retours" => retours.to_vec()};
    if let Some((lf, lt)) = portee {
        poser(&mut v, "layer_from", lf);
        poser(&mut v, "layer_to", lt);
    }
    if let Some(ponts) = ponts {
        poser(&mut v, "ponts", ponts);
    }
    if let Some(rayon) = rayon {
        poser(&mut v, "ponts_rayon_mm", rayon);
    }
    v
}

pub fn _via_moignon(lf: i64, lt: i64) -> Json {
    _via_moignon_p(Some((lf, lt)), None, &[], None)
}

/// La premiere transition du resultat.
pub fn tr0(r: &Json) -> &Json {
    &r["discontinuites"]["transitions"][0]
}

/// `min(20 log10 |S21|)` sur la bande.
pub fn creux_s21(r: &Json) -> f64 {
    minf(&els(&r["s"]).iter().map(|m| 20.0 * maxf(&[Complex64::new(n(&m[2][0]), n(&m[2][1])).norm(), 1e-15]).log10()).collect::<Vec<_>>())
}

/// LA LONGUEUR EST CE QU'ON PERCE MOINS CE QU'ON EMPRUNTE.
///
/// Le via est perce de TOP a BOT ; le signal ne va que de TOP a IN3. Ce qui
/// depasse pend en circuit ouvert. La somme des morceaux doit rendre EXACTEMENT
/// la longueur percee -- c'est ce qui prouve qu'on prend les bonnes bornes, et
/// non les dessus de couche, qui feraient manquer une epaisseur de cuivre a
/// chaque bout.
fn le_moignon_se_soustrait_il_ne_se_devine_pas() {
    let r = sim(&_doc_moignon(&_SIX(), 0, 4, &_via_moignon(0, 8)));
    let tr = tr0(&r);
    let mo = &tr["moignons"];
    assert!(mo["connu"].vrai(), "la portee est envoyee, le moignon devrait etre connu");
    assert!(nul(&mo["depart"]),
            "le signal part de TOP, qui est le bout du percage : rien ne depasse\
             \x20de ce cote");
    assert!(!nul(&mo["arrivee"]), "le moignon sous IN3 n'est pas vu");

    let perce = _hauteur_via(&_SIX(), &0i64.j(), &8i64.j());
    let utile = n(&tr["cotes"]["hauteur_mm"]);
    proche(n(&mo["arrivee"]["longueur_mm"]), perce - utile, 1e-9,
           "moignon = perce - emprunte");
}

/// DEUX CHIFFRES, ET LE SECOND EST CELUI QUI DECIDE.
///
/// Une capacite en femtofarads ne dit pas si le moignon est un probleme ; la
/// frequence a laquelle il court-circuite la liaison, si.
fn le_moignon_pese_et_resonne() {
    let r = sim(&_doc_moignon(&_SIX(), 0, 4, &_via_moignon(0, 8)));
    let tr = tr0(&r);
    let f = &tr["moignons"]["arrivee"];
    let m = &tr["modelise"];

    // LA RESONANCE EST CELLE DU QUART D'ONDE, et on la refait a la main.
    let attendu = tl::C_0 / (4.0 * n(&f["longueur_mm"]) * 1e-3 * n(&f["er"]).sqrt());
    proche(n(&f["resonance_hz"]), attendu, 1e-6, "la resonance quart d'onde");

    // ET IL PESE PLUS QUE LE VIA. C'est le chiffre qui justifie tout le palier.
    assert!(n(&f["capacite_fF"]) > n(&m["capacite_fF"]),
            "le moignon ({:.1} fF) devrait peser plus que le via ({:.1} fF)",
            n(&f["capacite_fF"]), n(&m["capacite_fF"]));
    // LA TOLERANCE EST CELLE DE L'AFFICHAGE, pas celle du calcul : les trois
    // chiffres sont arrondis separement avant d'arriver ici, et leur somme ne
    // peut pas retomber au bit pres. Un millieme de femtofarad d'ecart dit que
    // c'est bien la meme grandeur ; exiger mieux ne testerait que l'arrondi.
    proche(n(&m["capacite_totale_fF"]), n(&m["capacite_fF"]) + n(&f["capacite_fF"]), 1e-4,
           "la capacite totale est celle du via plus celle du moignon");

    // LE MEME LIEN AVEC UN VIA ENTERRE AJUSTE N'A PAS DE MOIGNON, et la phase
    // tombe. C'est la seule difference entre les deux cartes.
    let r2 = sim(&_doc_moignon(&_SIX(), 0, 4, &_via_moignon(0, 4)));
    let m2 = &tr0(&r2)["modelise"];
    assert!(nul(&tr0(&r2)["moignons"]["arrivee"]));
    assert!(n(&m2["phase_deg"]) < 0.7 * n(&m["phase_deg"]),
            "supprimer le moignon ne change presque rien : {:.3} contre {:.3} deg",
            n(&m2["phase_deg"]), n(&m["phase_deg"]));
}

/// A LA RESONANCE, LE MOIGNON EFFACE LA LIAISON, et le modele doit le
/// rendre -- c'est le seul defaut de cette fiche qui tue un lien au lieu de le
/// degrader. On balaye la bande autour de la resonance et on exige un creux
/// profond, et fini : une constante de propagation purement imaginaire
/// donnerait l'infini, ce qui n'est pas un resultat mais une division par
/// zero. La perte du dielectrique borne le creux.
fn le_moignon_court_circuite_a_sa_resonance() {
    let via = _via_moignon(0, 8);
    let r0 = sim(&_doc_moignon_f(&_SIX(), 0, 4, &via, 1e9, 2e9));
    let f_res = n(&tr0(&r0)["moignons"]["arrivee"]["resonance_hz"]);
    let mut d = _doc_moignon_f(&_SIX(), 0, 4, &via, f_res, f_res * 1.4);
    poser(dans(&mut d, "analyse"), "f_debut", f_res * 0.6);
    poser(dans(&mut d, "analyse"), "points", 81i64);
    let r = sim(&d);

    let pire = creux_s21(&r);
    assert!(pire < -20.0,
            "le moignon ne court-circuite pas a sa resonance : creux de {:.1} dB", pire);
    assert!(pire.is_finite(), "la resonance a diverge");
}

/// UNE PAGE QUI NE DIT PAS N'EST PAS UNE CARTE QUI N'A PAS.
///
/// Sans la portee percee, un via traversant et un via enterre bien ajuste ont
/// exactement la meme apparence. Conclure « pas de moignon » serait le cas le
/// plus flatteur choisi par defaut.
fn la_portee_inconnue_ne_vaut_pas_moignon_nul() {
    let r = sim(&_doc_moignon(&_SIX(), 0, 4, &_via_moignon_p(None, None, &[], None)));
    assert!(!tr0(&r)["moignons"]["connu"].vrai());
    assert!(avertis(&r).iter().any(|a| a.contains("portée percée")),
            "le silence de la page sur la portee n'est pas dit");
}

/// LE RETOUR QUI CHANGE DE PLAN A UN PRIX, ET ON PEUT LE DIRE.
///
/// Jusqu'ici la fiche rendait un plancher et disait « ne changez pas de
/// reference ». Avec le decouplage qui joint les deux plans, on chiffre : la
/// boucle passe par lui, et son eloignement se paie.
fn la_cavite_chiffre_ce_qui_etait_un_conseil() {
    let proche_pont = _via_moignon_p(Some((0, 6)), Some(vec![obj! {"x" => 12.0, "y" => 0.0,
                                                                   "repere" => "C1"}]), &[], Some(10.0));
    let loin = _via_moignon_p(Some((0, 6)), Some(vec![obj! {"x" => 20.0, "y" => 0.0,
                                                            "repere" => "C2"}]), &[], Some(10.0));
    let a = sim(&_doc_moignon(&_GND_PWR(), 0, 6, &proche_pont));
    let b = sim(&_doc_moignon(&_GND_PWR(), 0, 6, &loin));
    let ta = tr0(&a);
    let tb = tr0(&b);

    // CE N'EST PLUS UNE INDUCTANCE, ET C'EST TOUT LE POINT. La capacite
    // repartie des plans et l'inductance du decouplage forment une resonance
    // PARALLELE -- la « PRF » du chapitre 13 de Bogatin --, ou l'impedance de
    // la traversee CULMINE. Une inductance equivalente figee au point central
    // manquerait exactement ce qu'on veut voir. On compare donc des ohms.
    assert!(!nul(&ta["cavite"]["impedance_fc_ohm"]),
            "la traversee n'est pas chiffree");
    assert!(t(&ta["modelise"]["inductance_source"]).contains("cavite"),
            "la traversee n'est pas signalee dans la source");
    assert!(n(&tb["cavite"]["impedance_fc_ohm"]) > n(&ta["cavite"]["impedance_fc_ohm"]),
            "eloigner le decouplage ne coute rien : {:.4} contre {:.4} ohm",
            n(&tb["cavite"]["impedance_fc_ohm"]), n(&ta["cavite"]["impedance_fc_ohm"]));
    // L'ETALEMENT SUIT L'EQUATION 13-35 DE BOGATIN, refaite a la main.
    let h = n(&ta["cavite"]["hauteur_mm"]) * 1e-3;
    let attendu = tl::inductance_etalement_via_via(h, 2.0e-3, 0.25e-3);
    // La tolerance est celle de l'AFFICHAGE : la fiche arrondit au dix
    // millieme de nanohenry, et exiger mieux ne testerait que l'arrondi.
    proche(n(&ta["cavite"]["etalement_nH"]), attendu * 1e9, 1e-4,
           "l'etalement contre l'equation 13-35");
    // ET IL EST TROIS FOIS PLUS GRAND QUE CE QUE DONNAIT 13-31, l'equation du
    // via vers un anneau, employee a tort par la version precedente.
    let anneau = tl::inductance_etalement_via_anneau(h, 0.125e-3, 2.0e-3);
    assert!(attendu > 2.5 * anneau,
            "l'equation des deux contacts devrait valoir bien plus que celle de\
             \x20l'anneau : {:.4} contre {:.4} nH", attendu * 1e9, anneau * 1e9);
}

/// ENTRE DEUX PLANS DE MASSE, LE RETOUR N'A RIEN A TRAVERSER.
///
/// Il passe par le premier via de masse venu, ce dont la boucle du palier 1
/// rend deja compte. Y ajouter une cavite compterait deux fois le meme chemin
/// -- et sur une carte bien cousue cela vaut le double du via lui-meme.
fn la_cavite_ne_se_traverse_pas_entre_deux_masses() {
    let v = _via_moignon_p(Some((0, 8)), Some(vec![obj! {"x" => 11.0, "y" => 0.0}]),
                           &[_retour_via_p(10.6, 0.0, "GND", 0, 8, 0.25)], Some(10.0));
    let r = sim(&_doc_moignon(&_SIX(), 0, 8, &v));
    let tr = tr0(&r);
    assert!(nul(&tr["cavite"]),
            "une cavite a ete comptee entre deux plans de MASSE");
    assert!(t(&tr["modelise"]["inductance_source"]) == "boucle");
}

/// LE DEFAUT QUI CRIAIT SUR LES CARTES SAINES.
///
/// Sur une carte quatre couches, une piste sur TOP se refere au plan du haut
/// et la meme piste sur BOT au plan du bas : les NOMS different TOUJOURS. La
/// premiere version en concluait au defaut grave -- « aucun via de masse ne
/// joint les deux » -- y compris quand les deux plans sont de la masse et
/// qu'un via de masse les joint parfaitement.
fn deux_noms_de_plan_ne_font_pas_deux_nets() {
    // Deux plans de MASSE : le plan change, ce n'est pas grave.
    let r = sim(&_doc_moignon(
        &_SIX(), 0, 8, &_via_moignon_p(Some((0, 8)), None, &[_retour_via_p(10.6, 0.0, "GND", 0, 8, 0.25)], None)));
    let ret = &tr0(&r)["retour"];
    assert!(ret["plan_change"].vrai(), "le plan change bel et bien");
    assert!(ret["nets_differents"] == Json::Bool(false),
            "deux plans de net GND ne sont pas de nets differents");
    assert!(!ret["reference_change"].vrai(),
            "le defaut grave a ete leve sur deux plans de masse");
    assert!(!avertis(&r).iter().any(|a| a.contains("de la masse à de la masse")));

    // Deux plans de NETS differents : la, c'est grave.
    let r2 = sim(&_doc_moignon(&_GND_PWR(), 0, 6, &_via_moignon(0, 6)));
    let ret2 = &tr0(&r2)["retour"];
    assert!(ret2["nets_differents"] == Json::Bool(true));
    assert!(ret2["reference_change"].vrai());
}

/// ON NE SAIT PAS, ET ON LE DIT -- c'est le troisieme etat.
///
/// Sans le net des plans, « deux plans de masse » et « masse et alimentation »
/// se ressemblent exactement. Trancher dans un sens crie a tort sur les cartes
/// saines ; trancher dans l'autre tait un vrai defaut. On rend le doute.
fn sans_net_de_plan_on_ne_conclut_pas() {
    let r = sim(&_doc_moignon(
        &_SANS_NETS(), 0, 6,
        &_via_moignon_p(Some((0, 6)), None, &[_retour_via(10.6, 0.0)], None)));
    let ret = &tr0(&r)["retour"];
    assert!(ret["plan_change"].vrai(), "le plan change");
    assert!(nul(&ret["nets_differents"]),
            "sans net declare, on ne peut pas conclure -- ni oui ni non");
    assert!(!ret["reference_change"].vrai(),
            "le defaut grave exige la certitude");
    assert!(avertis(&r).iter().any(|a| a.contains("on ne peut pas dire si cela pose problème")),
            "le doute n'est pas remonte a l'utilisateur");
    assert!(!avertis(&r).iter().any(|a| a.contains("de la masse à de la masse")),
            "l'alerte grave est sortie sans preuve");
}

/// CE QU'ON PEUT DIRE SANS AVOIR CHERCHE, ET CE QU'ON NE PEUT PAS.
///
/// « Aucun via de masse ne peut joindre GND a PWR » est une DEDUCTION : elle
/// decoule des nets et reste vraie qu'on ait regarde ou non. « Aucun
/// decouplage n'est a cote » est une OBSERVATION : sans avoir cherche,
/// l'affirmer est un enonce sur la carte sans preuve. La premiere version les
/// disait d'un seul souffle, et affirmait donc la seconde sans jamais l'avoir
/// verifiee.
fn une_deduction_et_une_observation_ne_se_disent_pas_pareil() {
    // La page ne cherche pas les ponts : `ponts` absent.
    let v = _via_moignon(0, 6);
    let r = sim(&_doc_moignon(&_GND_PWR(), 0, 6, &v));
    let a = avertis(&r).join(" ");
    assert!(a.contains("de la masse à de la masse"),
            "la deduction sur les vias de masse doit sortir : elle ne demande pas\
             \x20qu'on ait cherche");
    assert!(a.contains("ne cherche pas les découplages"),
            "l'outil doit avouer qu'il n'a pas regarde les découplages");
    assert!(a.contains("SOUS-ESTIMÉE"),
            "sans les decouplages, la traversee est minoree et il faut le dire");
    assert!(!a.contains("MINORANT"),
            "on ne peut pas parler de minorant a un rayon qu'on n'a pas cherche");

    // La page cherche et ne trouve rien : le pont est AU MOINS au rayon.
    let mut v2 = _via_moignon_p(Some((0, 6)), Some(vec![]), &[], Some(10.0));
    poser(&mut v2, "pont_hors_rayon_mm", 25.0);
    let r2 = sim(&_doc_moignon(&_GND_PWR(), 0, 6, &v2));
    let a2 = avertis(&r2).join(" ");
    assert!(a2.contains("MINORANT"),
            "la recherche a eu lieu et n'a rien trouve : le chiffre est un minorant");
    let t2 = tr0(&r2);
    assert!(t2["cavite"]["borne"].vrai(), "le cas borne n'est pas marque");
    // ET IL COUTE PLUS QUE LE PONT MESURE A 2 mm : c'est la monotonie qui rend
    // le minorant utilisable.
    let v3 = _via_moignon_p(Some((0, 6)), Some(vec![obj! {"x" => 12.0, "y" => 0.0}]), &[], Some(10.0));
    let r3 = sim(&_doc_moignon(&_GND_PWR(), 0, 6, &v3));
    let t3 = tr0(&r3);
    assert!(n(&t2["cavite"]["impedance_fc_ohm"])
            > n(&t3["cavite"]["impedance_fc_ohm"]),
            "un decouplage suppose a 10 mm devrait couter plus qu'un mesure a 2");

    // Rien dans le rayon NI AU-DELA : aucun pont sur la carte. Le minorant
    // reste (l'impedance), mais la fiche le dit et la marque.
    assert!(!t2["cavite"]["aucun_pont_carte"].vrai(), "un pont existe a 25 mm");
    let v4 = _via_moignon_p(Some((0, 6)), Some(vec![]), &[], Some(10.0));
    let r4 = sim(&_doc_moignon(&_GND_PWR(), 0, 6, &v4));
    let t4 = tr0(&r4);
    assert!(t4["cavite"]["aucun_pont_carte"].vrai() && t4["cavite"]["borne"].vrai(), "{}", dumps(&t4["cavite"]));
    assert!(avertis(&r4).join(" ").contains("AUCUN découplage"), "{:?}", avertis(&r4));
}

/// L'onglet Current Return Path, quand la page donne la cavite et tous les
/// ponts : la fiche est modale, le relais 0 ohm porte le courant, la reponse
/// reste serialisable (les tableaux du reseau ne sortent pas).
fn current_return_path_passe_par_la_cavite_modale() {
    let mut v = _via_moignon_p(Some((0, 6)), Some(vec![]), &[], Some(10.0));
    maj(&mut v, j(r#"{"aire_plans_mm2": 2500.0, "ponts_carte": [],
              "cavite_rect": {"x0": -25.0, "y0": -25.0, "a": 50.0, "b": 50.0},
              "ponts_indirects": [{"x": 20.0, "y": 0.0, "repere": "R5", "r_ohm": 0.0,
                                   "relais": "VDD", "suivants": [],
                                   "caps": [{"x": 22.0, "y": 0.0, "repere": "C9",
                                             "capacite_F": 100e-9}]}]}"#));
    let r = sim(&_doc_moignon(&_GND_PWR(), 0, 6, &v));
    let mut cav = tr0(&r)["cavite"].clone();
    assert!(t(&cav["modele"]) == "modal" && t(&cav["pont"]["repere"]) == "R5 → VDD", "{}", dumps(&cav["pont"]));
    assert!(contient(&cav["ponts_detail"][0], "part"), "{}", dumps(&cav["ponts_detail"]));
    // en basse frequence, c'est le relais qui porte le retour ; en haut de
    // bande, la capacite des plans le reprend
    let p = _param_cavite(&mut cav, 1.0).unwrap();
    assert!(tl::repartition_traversee_param(1e6, p.as_ref()).0[0] > 0.9);
    assert!(tl::repartition_traversee_param(1e9, p.as_ref()).1 > 0.5);
    assert!(avertis(&r).iter().any(|a| a.contains("Cavité modale")), "{:?}", avertis(&r));
    let _ = dumps(&r);
}

/// LE FORET REPASSE RETIRE LE MOIGNON, ET LE CREUX S'EN VA AVEC LUI.
///
/// Meme via TOP -> BOT, meme signal TOP -> IN3 : contre-perce par-dessous en
/// gardant IN3, il ne reste que le moignon residuel sous IN3. Sa resonance
/// monte d'autant, et a la frequence ou le moignon entier court-circuitait la
/// liaison, |S21| se releve. Un contre-percage qui couperait la couche
/// empruntee n'est pas applique ; sans le champ, rien ne change ; par-dessus,
/// il arrete le moignon du haut.
fn le_contre_percage_ramene_le_moignon_au_residuel() {
    let via = _via_moignon(0, 8);
    let r0 = sim(&_doc_moignon_f(&_SIX(), 0, 4, &via, 1e9, 2e9));
    let m0 = &tr0(&r0)["moignons"];
    assert!(!contient(m0, "contre_percage") && !contient(&m0["arrivee"], "contre_perce"), "{}", dumps(m0));
    let f_res = n(&m0["arrivee"]["resonance_hz"]);

    let contre = |cote: &str, garde: i64, residuel: f64| avec(&via, &[("contre_percage", obj! {"cote" => cote, "couche_garde" => garde,
                                                                                            "moignon_residuel_mm" => residuel})]);
    let cp = contre("dessous", 4, 0.1);
    let r = sim(&_doc_moignon_f(&_SIX(), 0, 4, &cp, 1e9, 2e9));
    let m = &tr0(&r)["moignons"];
    assert!(t(&m["contre_percage"]) == "applique", "{}", dumps(m));
    proche(n(&m["arrivee"]["longueur_mm"]), 0.1, 1e-9, "moignon residuel");
    assert!(m["arrivee"]["contre_perce"] == Json::Bool(true));
    assert!(n(&m["arrivee"]["resonance_hz"]) > 5.0 * f_res, "{} {}", n(&m["arrivee"]["resonance_hz"]), f_res);

    let creux = |v: &Json| {
        let mut d = _doc_moignon_f(&_SIX(), 0, 4, v, f_res, f_res * 1.4);
        poser(dans(&mut d, "analyse"), "f_debut", f_res * 0.6);
        poser(dans(&mut d, "analyse"), "points", 41i64);
        creux_s21(&sim(&d))
    };
    // la reference : le via borgne TOP -> IN3, qui n'a pas de moignon du tout
    // (a 3 dB pres : le residuel reste, et le fut repasse n'a pas la meme self)
    let (avant, apres, borgne) = (creux(&via), creux(&cp), creux(&_via_moignon(0, 4)));
    assert!(avant < -20.0 && apres > avant + 20.0 && (apres - borgne).abs() < 3.0,
            "contre-perce, la liaison devrait valoir le via borgne : {:.1} dB -> {:.1} dB\
             \x20(borgne {:.1} dB)", avant, apres, borgne);

    // la couche a garder au-dessus de la couche empruntee : il couperait IN3
    let faux = contre("dessous", 2, 0.1);
    let rf = sim(&_doc_moignon(&_SIX(), 0, 4, &faux));
    let m = &tr0(&rf)["moignons"];
    assert!(t(&m["contre_percage"]) == "ignore", "{}", dumps(m));
    assert!(avertis(&rf).iter().any(|a| a.contains("couperait une couche")),
            "le contre-percage ecarte n'est pas dit");
    proche(n(&m["arrivee"]["longueur_mm"]), n(&m0["arrivee"]["longueur_mm"]), 1e-9,
           "un contre-percage fautif ne retire rien");

    // par-dessus : signal IN3 -> BOT, le moignon du haut tombe au residuel
    let haut = contre("dessus", 4, 0.15);
    let rh = sim(&_doc_moignon(&_SIX(), 4, 8, &haut));
    let tr = tr0(&rh);
    assert!(t(&tr["moignons"]["contre_percage"]) == "applique", "{}", dumps(&tr["moignons"]));
    proche(n(&tr["moignons"]["depart"]["longueur_mm"]), 0.15, 1e-9, "moignon du haut");
    assert!(nul(&tr["moignons"]["arrivee"]));
}

pub fn banc() {
    titre("La mise en cascade et les parametres S");
    T("current return path passe par la cavite modale", current_return_path_passe_par_la_cavite_modale);
    T("le moignon se soustrait, il ne se devine pas", le_moignon_se_soustrait_il_ne_se_devine_pas);
    T("le moignon pèse et résonne", le_moignon_pese_et_resonne);
    T("le moignon court-circuite à sa résonance, sans diverger", le_moignon_court_circuite_a_sa_resonance);
    T("une portée inconnue ne vaut pas moignon nul", la_portee_inconnue_ne_vaut_pas_moignon_nul);
    T("le contre-perçage ramène le moignon au résiduel", le_contre_percage_ramene_le_moignon_au_residuel);
    T("la cavité chiffre ce qui n'était qu'un conseil", la_cavite_chiffre_ce_qui_etait_un_conseil);
    T("la cavité ne se traverse pas entre deux masses", la_cavite_ne_se_traverse_pas_entre_deux_masses);
    T("deux noms de plan ne font pas deux nets", deux_noms_de_plan_ne_font_pas_deux_nets);
    T("sans net de plan, on ne conclut pas", sans_net_de_plan_on_ne_conclut_pas);
    T("une déduction et une observation ne se disent pas pareil", une_deduction_et_une_observation_ne_se_disent_pas_pareil);
}
