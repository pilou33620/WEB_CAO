//! L'empilage, les vias et le chemin de retour (cas de banc-ligne-mom.py).

use crate::*;

/// `_ruptures` accepte un troncon dans n'importe quel sens ; `_coudes`
/// doit donc l'orienter par le raccord, pas par start -> end.
fn un_troncon_trace_a_l_envers_n_est_pas_un_demi_tour() {
    let o = |a: (f64, f64), b: (f64, f64)| obj! {"start" => vec![a.0, a.1], "end" => vec![b.0, b.1], "layer" => 0i64, "width" => 0.2};
    assert!(_coudes(&[o((0.0, 0.0), (10.0, 0.0)), o((20.0, 0.0), (10.0, 0.0))]).is_empty());
    assert!(_coudes(&[o((10.0, 0.0), (0.0, 0.0)), o((10.0, 0.0), (10.0, 5.0))])
            == vec![obj! {"troncon" => 1i64, "angle_deg" => 90.0}]);
}

/// LE MEME empilage physique doit rendre LE MEME chiffre.
///
/// Une piste exterieure porte du vernis, qu'on l'ait ecrit dans l'empilage ou
/// non : le repli est de 25 um a er 3,8, et c'est exactement ce que vaut le
/// masque declare ici. Les deux doivent donc coincider AU BIT PRES.
///
/// Ils ne coincidaient pas. Le vernis declare etait compte DEUX FOIS : une
/// fois par la Green a trois regions, ce qui est juste, et une fois de plus en
/// moyenne ponderee dans l'epsilon du SUBSTRAT, ce qui ne l'est pas -- comme
/// si la resine se trouvait ENTRE la piste et le plan alors qu'elle est
/// au-dessus. er tombait de 4,3 a 4,2444, Z0 montait de 0,56 % et eps_eff
/// baissait de 1,12 %. Autrement dit : renseigner son empilage rendait le
/// resultat faux, et le taire le rendait juste.
fn declarer_le_masque_ne_change_pas_le_resultat() {
    let (geo_i, _) = section(&_FACE(), 2, 0.38, 0.035);
    let (geo_d, _) = section(&plus(_FACE(), _di("Solder Mask", 0.025, 3.8)), 2, 0.38, 0.035);
    proche(n(&geo_d["epsilon_r"]), 4.3, 1e-12,
           "l'epsilon du substrat sous un masque declare");
    let (r_i, r_d) = (ligne(&geo_i), ligne(&geo_d));
    proche(r_d.z0, r_i.z0, 1e-9, "Z0, masque declare contre implicite");
    proche(r_d.eps_eff, r_i.eps_eff, 1e-9,
           "eps_eff, masque declare contre implicite");
}

/// Plus de vernis, c'est plus de dielectrique autour du ruban : Z0 baisse
/// et eps_eff monte. On verifie le SENS et la MONOTONIE.
fn un_masque_plus_epais_pese_plus() {
    let mut r = Vec::new();
    for ep in [0.015, 0.025, 0.050] {
        let (geo, _) = section(&plus(_FACE(), _di("Solder Mask", ep, 3.8)), 2, 0.38, 0.035);
        r.push(ligne(&geo));
    }
    for w in r.windows(2) {
        let (a, b) = (&w[0], &w[1]);
        assert!(b.z0 < a.z0, "Z0 ne baisse pas : {:.4} puis {:.4}", a.z0, b.z0);
        assert!(b.eps_eff > a.eps_eff, "eps_eff ne monte pas : {:.4} puis {:.4}", a.eps_eff, b.eps_eff);
    }
}

/// Sous du prepreg, la piste est ENTERREE, pas vernie.
///
/// Le test d'exterieur posait la question du MAUVAIS COTE : il regardait la
/// couche d'indice - 1, celle du cote du PLAN, pour decider ce qu'il y avait
/// du cote de la FACE, et il y cherchait du cuivre la ou c'est le dielectrique
/// qui tranche. Une piste couverte de 0,1 mm de prepreg recevait donc par
/// dessus un vernis de 25 um, et son prepreg -- le dielectrique qui compte --
/// partait a la poubelle.
fn une_piste_enterree_ne_recoit_pas_de_vernis() {
    let (geo, _) = section(&plus(_FACE(), _di("PP2", 0.1, 3.6)), 2, 0.38, 0.035);
    assert!(nul(&geo["masque"]), "vernis invente sur une piste enterree : {}", dumps(&geo["masque"]));
    proche(n(&geo["couverture"]), 0.1e-3, 1e-9, "la couverture de prepreg");
    proche(n(&geo["epsilon_r"]), (4.3 * 0.2 + 3.6 * 0.1) / 0.3, 1e-12,
           "l'epsilon melange de la piste enterree");
}

/// La meme resine ne doit pas etre nommee deux fois.
///
/// Ou bien la piste est a la face et ce qui la couvre est un MASQUE, ou bien
/// elle est enterree et c'est une COUVERTURE. Jamais les deux a la fois : la
/// section porterait deux fois la meme epaisseur de dielectrique.
fn couverture_et_masque_ne_sont_jamais_les_deux() {
    for cs in [_FACE(),
               plus(_FACE(), _di("Solder Mask", 0.025, 3.8)),
               plus(_FACE(), _di("PP2", 0.1, 3.6))] {
        let (geo, _) = section(&cs, 2, 0.38, 0.035);
        let deux = !nul(&geo["masque"]) && numd(&geo, "couverture", 0.0) > 0.0;
        assert!(!deux, "masque ET couverture sur {:?}", cs.iter().map(|c| t(&c["name"])).collect::<Vec<_>>());
    }
}

// ==========================================================================
// Les vias : leur hauteur, leurs cotes, ce qu'ils pesent
// ==========================================================================

pub fn _QUATRE() -> Vec<Json> {
    vec![
        _cu("TOP", "signal"),
        _di("PP", 0.200, 4.20),
        _cu("GND", "plane"),
        _di("CORE", 0.800, 4.50),
        _cu("PWR", "plane"),
        _di("PP2", 0.200, 4.20),
        _cu("BOT", "signal"),
    ]
}
pub const _EPAISSEUR_CARTE: f64 = 4.0 * 0.035 + 0.200 + 0.800 + 0.200;

pub fn _piste_l(x1: f64, y1: f64, x2: f64, y2: f64, couche: i64, largeur: f64, via: Option<&Json>) -> Json {
    let mut o = obj! {"type" => "track", "start" => vec![x1, y1], "end" => vec![x2, y2],
                      "width" => largeur, "layer" => couche, "net" => "SIG",
                      "copper_thickness" => 0.035};
    if let Some(via) = via {
        poser(&mut o, "via", via);
    }
    o
}

pub fn _piste(x1: f64, y1: f64, x2: f64, y2: f64, couche: i64) -> Json {
    _piste_l(x1, y1, x2, y2, couche, 0.35, None)
}

pub fn _piste_via(x1: f64, y1: f64, x2: f64, y2: f64, couche: i64, via: &Json) -> Json {
    _piste_l(x1, y1, x2, y2, couche, 0.35, Some(via))
}

pub fn _doc_via_c(objets: Vec<Json>, couches: &[Json], fc: f64) -> Json {
    obj! {"format" => "cao-sim-em-1",
          "stackup" => obj! {"layers" => couches.to_vec()},
          "geometry" => obj! {"objects" => objets},
          "analyse" => obj! {"f_debut" => fc / 10.0, "f_fin" => fc * 2.0,
                             "f_centre" => fc, "points" => 11i64}}
}

pub fn _doc_via(objets: Vec<Json>) -> Json {
    _doc_via_c(objets, &_QUATRE(), 200e6)
}

/// LA HAUTEUR N'A JAMAIS EU BESOIN D'ETRE SUPPOSEE.
///
/// Un via traversant perce toute la carte : sa longueur est la somme des
/// epaisseurs, bornes comprises. L'ancien repli comptait « 0,2 mm par couche
/// traversee » en indices d'EMPILAGE -- qui alternent cuivre et dielectrique,
/// donc 0,4 mm par couche de cuivre -- et rendait 1,200 mm la ou la carte en
/// fait 1,340 : 12 % d'erreur, que l'inductance emporte au premier ordre.
fn la_hauteur_du_via_se_lit_dans_l_empilage() {
    let hv = |a: i64, b: i64| _hauteur_via(&_QUATRE(), &a.j(), &b.j());
    let h = hv(0, 6);
    proche(h, _EPAISSEUR_CARTE, 1e-9,
           "la hauteur d'un via traversant TOP -> BOT");
    assert!((h - 0.2 * 6.0).abs() > 0.1, "la hauteur vaut encore le repli 0,2 x sauts ({:.4})", h);

    let h_borgne = hv(0, 2);
    proche(h_borgne, 0.035 + 0.200 + 0.035, 1e-9,
           "la hauteur d'un via borgne TOP -> GND");

    proche(hv(6, 0), h, 1e-12,
           "la hauteur ne depend pas du sens");
}

/// DEUX TRONCONS SUR DEUX COUCHES NE SE RACCORDENT PAS DANS UN PLAN.
///
/// Ce qui les joint est un via, et le via a son propre modele. Un modele de
/// coude planaire n'a rien a faire la, meme si les deux troncons font un
/// angle vu de dessus -- et la version precedente en posait un, a 0 degre,
/// 0 pH, 0 fF, affiche dans la fiche a cote du via.
///
/// ON VERIFIE AUSSI LE CAS COLINEAIRE SUR LA MEME COUCHE : deux troncons
/// alignes n'ont pas de coude non plus, et le seuil qui le dit est celui de la
/// RESOLUTION des coordonnees, pas un jugement de modelisation. Un coude de
/// 5 degres, lui, reste emis.
fn un_changement_de_couche_n_est_pas_un_coude() {
    let d = _doc_via(vec![_piste(0.0, 0.0, 15.0, 0.0, 0), _piste(15.0, 0.0, 30.0, 0.0, 6)]);
    let r = sim(&d);
    assert!(!r["discontinuites"]["coudes"].vrai(),
            "un changement de couche a produit un coude : {}", dumps(&r["discontinuites"]["coudes"]));
    assert!(els(&r["discontinuites"]["transitions"]).len() == 1,
            "la transition de couche n'a pas ete vue");

    let d = _doc_via(vec![_piste(0.0, 0.0, 15.0, 0.0, 0), _piste(15.0, 0.0, 15.0, 15.0, 6)]);
    let r = sim(&d);
    assert!(!r["discontinuites"]["coudes"].vrai(),
            "un via coude a produit un coude planaire : {}", dumps(&r["discontinuites"]["coudes"]));

    let d = _doc_via(vec![_piste(0.0, 0.0, 15.0, 0.0, 0), _piste(15.0, 0.0, 30.0, 0.0, 0)]);
    let r = sim(&d);
    assert!(!r["discontinuites"]["coudes"].vrai(),
            "deux troncons colineaires ont produit un coude : {}", dumps(&r["discontinuites"]["coudes"]));

    let d = _doc_via(vec![_piste(0.0, 0.0, 15.0, 0.0, 0), _piste(15.0, 0.0, 15.0, 15.0, 0)]);
    let r = sim(&d);
    let coudes = els(&r["discontinuites"]["coudes"]);
    assert!(coudes.len() == 1, "le coude a angle droit n'a pas ete vu");
    proche(n(&coudes[0]["angle_deg"]), 90.0, 1e-6, "l'angle du coude");
    assert!(n(&coudes[0]["modelise"]["capacite_fF"]) > 0.0,
            "le coude a angle droit ne pese rien");

    let (dx, dy) = (15.0 * 5f64.to_radians().cos(), 15.0 * 5f64.to_radians().sin());
    let d = _doc_via(vec![_piste(0.0, 0.0, 15.0, 0.0, 0),
                          _piste(15.0, 0.0, 15.0 + dx, dy, 0)]);
    let r = sim(&d);
    let coudes = els(&r["discontinuites"]["coudes"]);
    assert!(coudes.len() == 1, "un coude de 5 degres a ete jete");
    proche(n(&coudes[0]["angle_deg"]), 5.0, 0.05, "l'angle du petit coude");
}

/// L'AVERTISSEMENT QUI CRIAIT A TORT.
///
/// `_ruptures` exigeait DEUX points de contact pour reconnaitre un via, en
/// commentant « les deux bouts du via sont au meme XY ». Non : un via joint la
/// FIN d'un troncon au DEBUT du suivant, ce qui fait UN point commun. Toute
/// liaison changeant de couche etait donc declaree rompue.
///
/// UN AVERTISSEMENT QUI CRIE A TORT FINIT PAR NE PLUS ETRE LU, et c'est ce qui
/// rend ce defaut plus grave que son ampleur : le jour ou la selection est
/// VRAIMENT rompue, personne ne le voit. On verifie donc les deux sens --
/// qu'il se taise sur un via, et qu'il parle sur une vraie rupture.
fn un_via_n_est_pas_une_rupture() {
    let genre = |objets: &[Json]| t(&sim(&_doc_via(objets.to_vec()))["topologie"]["genre"]).to_string();
    let cascade = |objets: &[Json]| sim(&_doc_via(objets.to_vec()))["topologie"]["cascadable"].vrai();

    let via = [_piste(0.0, 0.0, 15.0, 0.0, 0), _piste(15.0, 0.0, 30.0, 0.0, 6)];
    let meme_couche = [_piste(0.0, 0.0, 15.0, 0.0, 0), _piste(20.0, 0.0, 30.0, 0.0, 0)];
    let deux_couches = [_piste(0.0, 0.0, 15.0, 0.0, 0), _piste(20.0, 0.0, 30.0, 0.0, 6)];

    assert!(genre(&via) == "chaine", "un via est annonce comme une rupture");
    assert!(cascade(&via), "un via interdit la cascade");

    assert!(genre(&meme_couche) == "eparse", "une vraie rupture sur une couche n'est plus signalee");
    assert!(!cascade(&meme_couche), "une selection eparse rend quand meme des parametres S");

    assert!(genre(&deux_couches) == "eparse", "une rupture entre deux couches n'est plus signalee");
}

/// UN CHIFFRE SUPPOSE AFFICHE COMME UN CHIFFRE MESURE EST PIRE QUE RIEN.
///
/// Les pages n'envoient pas encore le percage et la pastille : le modele
/// tourne sur des replis. Il le DIT, cote par cote -- et il doit cesser de le
/// dire des que la page les envoie, sans quoi la mention perd son sens.
fn la_provenance_de_chaque_cote_est_dite() {
    let r = sim(&_doc_via(vec![_piste(0.0, 0.0, 15.0, 0.0, 0),
                               _piste(15.0, 0.0, 30.0, 0.0, 6)]));
    let tr = &r["discontinuites"]["transitions"][0];
    assert!(tr["cotes_supposees"] == Json::Bool(true), "les replis ne sont pas signales");
    assert!(t(&tr["cotes"]["hauteur_source"]) == "empilage", "{}", dumps(&tr["cotes"]));
    assert!(t(&tr["cotes"]["percage_source"]) == "repli", "{}", dumps(&tr["cotes"]));
    assert!(t(&tr["cotes"]["pastille_source"]) == "repli", "{}", dumps(&tr["cotes"]));
    proche(n(&tr["cotes"]["hauteur_mm"]), _EPAISSEUR_CARTE, 1e-6,
           "la hauteur annoncee dans les cotes");

    let via = obj! {"drill_diameter" => 0.25, "pad_diameter" => 0.55};
    let r = sim(&_doc_via(vec![_piste(0.0, 0.0, 15.0, 0.0, 0),
                               _piste_via(15.0, 0.0, 30.0, 0.0, 6, &via)]));
    let tr = &r["discontinuites"]["transitions"][0];
    assert!(tr["cotes_supposees"] == Json::Bool(false),
            "la page a envoye les cotes et la fiche les dit encore supposees");
    assert!(t(&tr["cotes"]["percage_source"]) == "page", "{}", dumps(&tr["cotes"]));
    assert!(t(&tr["cotes"]["pastille_source"]) == "page", "{}", dumps(&tr["cotes"]));
    proche(n(&tr["cotes"]["percage_mm"]), 0.25, 1e-9, "le percage envoye");
    proche(n(&tr["cotes"]["pastille_mm"]), 0.55, 1e-9, "la pastille envoyee");
}

/// CE QUI EST AFFICHE EST CE QUI EST APPLIQUE, et on le mesure.
///
/// La fiche annonce une inductance et une capacite ; la cascade en applique.
/// Si les deux divergent, la fiche ment -- c'est exactement le defaut qui
/// avait ete trouve sur les coudes, ou 21,28 fF etaient affiches pour 0,394
/// appliques. On refait donc le calcul a la main, avec les memes fonctions de
/// `ligne_mom`, et on exige l'egalite.
///
/// ET ON VERIFIE QUE LE VIA PESE : un percage plus fin donne PLUS
/// d'inductance, ce qui est le sens physique -- moins de section, plus de
/// self. Si le chiffre ne bougeait pas, c'est que les cotes n'arrivent pas
/// jusqu'au modele.
fn le_via_pese_ce_que_la_fiche_annonce() {
    let via = obj! {"drill_diameter" => 0.25, "pad_diameter" => 0.55};
    let r = sim(&_doc_via(vec![_piste(0.0, 0.0, 15.0, 0.0, 0),
                               _piste_via(15.0, 0.0, 30.0, 0.0, 6, &via)]));
    let m = &r["discontinuites"]["transitions"][0]["modelise"];

    let l_attendu = tl::inductance_partielle_propre(0.0, _EPAISSEUR_CARTE * 1e-3,
                                                    0.125e-3).unwrap();
    proche(n(&m["inductance_nH"]), round(l_attendu * 1e9, 4), 1e-9,
           "l'inductance affichee contre celle de ligne_mom");

    let via_fin = obj! {"drill_diameter" => 0.15, "pad_diameter" => 0.40};
    let r2 = sim(&_doc_via(vec![_piste(0.0, 0.0, 15.0, 0.0, 0),
                                _piste_via(15.0, 0.0, 30.0, 0.0, 6, &via_fin)]));
    let m2 = &r2["discontinuites"]["transitions"][0]["modelise"];
    assert!(n(&m2["inductance_nH"]) > n(&m["inductance_nH"]),
            "un percage plus fin ne donne pas plus d'inductance ({:.3} contre {:.3})",
            n(&m2["inductance_nH"]), n(&m["inductance_nH"]));
}

// ==========================================================================
// Le chemin de retour
// ==========================================================================

pub fn _QUATRE_NETS() -> Vec<Json> {
    vec![
        _cu("TOP", "signal"),
        _di("PP", 0.200, 4.20),
        avec(&_cu("GND", "plane"), &[("net", "GND".j())]),
        _di("CORE", 0.800, 4.50),
        avec(&_cu("PWR", "plane"), &[("net", "PWR".j())]),
        _di("PP2", 0.200, 4.20),
        _cu("BOT", "signal"),
    ]
}

pub fn _QUATRE_GND() -> Vec<Json> {
    let mut c = _QUATRE_NETS();
    c[4] = avec(&_cu("IN2", "plane"), &[("net", "GND".j())]);
    c
}

pub fn _retour_via_p(x: f64, y: f64, net: &str, lf: i64, lt: i64, percage: f64) -> Json {
    obj! {"x" => x, "y" => y, "layer_from" => lf, "layer_to" => lt,
          "drill_diameter" => percage, "pad_diameter" => 0.55, "net" => net}
}

pub fn _retour_via(x: f64, y: f64) -> Json {
    _retour_via_p(x, y, "GND", 0, 6, 0.25)
}

/// Deux troncons, TOP puis BOT, avec le via et ses retours.
pub fn _doc_retour(couches: &[Json], retours: &[Json], x_via: f64, antipad: f64) -> Json {
    let via = obj! {"drill_diameter" => 0.25, "pad_diameter" => 0.55,
                    "x" => x_via, "y" => 0.0, "antipad_diameter" => antipad,
                    "retours" => retours.to_vec()};
    let mut d = _doc_via_c(vec![_piste(0.0, 0.0, x_via, 0.0, 0),
                                _piste_via(x_via, 0.0, x_via + 15.0, 0.0, 6, &via)],
                           couches, 200e6);
    poser(&mut d, "reference_nets", vec!["GND"]);
    d
}

/// (le resultat, sa premiere transition)
pub fn _trans_a(couches: &[Json], retours: &[Json], antipad: f64) -> (Json, Json) {
    let r = sim(&_doc_retour(couches, retours, 15.0, antipad));
    let tr = r["discontinuites"]["transitions"][0].clone();
    (r, tr)
}

pub fn _trans(couches: &[Json], retours: &[Json]) -> (Json, Json) {
    _trans_a(couches, retours, 0.80)
}

/// LE DEFAUT LE PLUS GRAVE EST CELUI QU'ON NE VOIT PAS SUR LE DESSIN.
///
/// Sur TOP/GND/PWR/BOT, une piste sur TOP se refere a GND et la meme piste sur
/// BOT se refere a PWR. Le courant de retour doit changer de plan -- et un via
/// de masse ne peut pas l'y aider : il joindrait du GND a du GND. Le retour
/// passe alors par la cavite entre plans, que ce modele ne represente pas.
///
/// Le via de masse est bien la, a 0,6 mm, parfaitement place. Il ne sert a
/// rien, et c'est CELA qu'il faut dire -- pas afficher une belle inductance de
/// boucle qui ne decrit pas le circuit.
fn la_reference_qui_change_sans_retour_est_nommee() {
    let (r, tr) = _trans(&_QUATRE_NETS(), &[_retour_via(15.6, 0.0)]);
    let ret = &tr["retour"];
    assert!(ret["reference_change"].vrai(),
            "GND d'un cote, PWR de l'autre : la reference change et ce n'est pas vu");
    assert!(!ret["raccorde"].vrai(),
            "un via de masse a ete cru capable de joindre GND a PWR");
    assert!(n(&ret["trouves"]) == 1.0 && n(&ret["retenus"]) == 0.0,
            "le via devait etre trouve puis ecarte, pas ignore");
    assert!(t(&ret["vias"][0]["raison"]).contains("PWR"),
            "la raison de l'ecart ne nomme pas le plan qui n'est pas rejoint : « {} »",
            t(&ret["vias"][0]["raison"]));
    assert!(t(&tr["modelise"]["inductance_source"]).starts_with("self"),
            "sans boucle refermee, l'inductance du via doit etre celle d'un\
             \x20conducteur seul (source lue : {})",
            t(&tr["modelise"]["inductance_source"]));
    assert!(avertis(&r).iter().any(|a| a.contains("de la masse à de la masse")),
            "le defaut grave n'est pas remonte en avertissement");
}

/// LA MEME GEOMETRIE, ET UN EMPILAGE QUI CHANGE TOUT.
///
/// Seul le net du plan interne differe. Le via de retour, lui, n'a pas bouge.
/// C'est le cas ou l'avertissement NE DOIT PAS sortir : un avertissement qui
/// crie sur le cas ordinaire cesse d'etre lu, et emporte avec lui celui qui
/// comptait.
fn la_meme_carte_avec_deux_plans_de_masse_se_referme() {
    let (r, tr) = _trans(&_QUATRE_GND(), &[_retour_via(15.6, 0.0)]);
    let ret = &tr["retour"];
    assert!(ret["raccorde"].vrai() && n(&ret["retenus"]) == 1.0,
            "le via de masse joint deux plans de masse et n'a pas ete retenu");
    assert!(t(&ret["source"]) == "boucle", "ret['source'] doit valoir 'boucle'");
    assert!(t(&tr["modelise"]["inductance_source"]) == "boucle");
    assert!(contient(&tr, "bilan_sante"), "bilan_sante doit être calculé pour la boucle de masse");
    assert!(n(&tr["bilan_sante"]["score_reconstruction_pct"]) > 90.0);
    assert!(!avertis(&r).iter().any(|a| a.contains("de la masse à de la masse")),
            "l'avertissement grave est sorti sur une liaison saine");

    // ET LE CHIFFRE A CHANGE DE NATURE, CE QUI N'EST PAS LA MEME CHOSE QUE
    // D'AVOIR BAISSE. Sans boucle refermee on rend la self partielle : un
    // PLANCHER, la valeur qu'aurait la boucle si le retour etait colle au via.
    // La refermer a 0,6 mm rend forcement DAVANTAGE -- et c'est bien ce qu'on
    // exige ici, parce qu'un plancher qu'on pourrait passer par en dessous ne
    // serait pas un plancher. Ce qui a change, c'est que le chiffre depend
    // desormais du routage ; c'est l'essai suivant qui le mesure.
    let (_, t_sans) = _trans(&_QUATRE_NETS(), &[_retour_via(15.6, 0.0)]);
    let plancher = n(&t_sans["modelise"]["inductance_nH"]);
    let boucle = n(&tr["modelise"]["inductance_nH"]);
    assert!(boucle > plancher,
            "la boucle refermee passe SOUS le plancher : {:.4} contre {:.4} nH", boucle, plancher);
    assert!(t(&t_sans["modelise"]["inductance_source"]).starts_with("self"));
}

/// C'EST LA QUESTION QUE L'UTILISATEUR POSE EN CLIQUANT SUR LE VIA.
///
/// « Faut-il le rapprocher ? » n'a de reponse que si le chiffre bouge quand on
/// le rapproche. On mesure donc la monotonie sur toute la plage utile, et
/// l'ampleur : 0,4 mm contre 3 mm, c'est un facteur deux.
fn rapprocher_le_via_de_retour_baisse_l_inductance() {
    let mut vus = Vec::new();
    for ecart in [0.4, 0.6, 1.0, 2.0, 3.0] {
        let (_, tr) = _trans(&_QUATRE_GND(), &[_retour_via(15.0 + ecart, 0.0)]);
        vus.push(n(&tr["modelise"]["inductance_nH"]));
    }
    for w in vus.windows(2) {
        assert!(w[1] > w[0], "l'inductance ne croit pas avec l'ecartement : {:?}", vus);
    }
    assert!(vus[vus.len() - 1] > 1.9 * vus[0],
            "eloigner le retour de 0,4 a 3 mm ne double pas l'inductance :\
             \x20{:.4} contre {:.4} nH", vus[vus.len() - 1], vus[0]);
}

/// TROIS VIAS, ET NI UN NI TROIS SELFS EN PARALLELE.
///
/// Ne garder que le plus proche SURESTIME -- on mesure 31 % sur ce cas. Les
/// traiter comme trois inductances en parallele SOUS-estime d'autant : leur
/// mutuelle les empeche de travailler independamment, et c'est pour cela qu'on
/// resout la repartition au lieu de la postuler.
fn trois_vias_de_retour_comptent_pour_trois() {
    let trois = [_retour_via(15.5, 0.0), _retour_via(14.4, 0.3),
                 _retour_via(15.0, -0.7)];
    let (_, t3) = _trans(&_QUATRE_GND(), &trois);
    let (_, t1) = _trans(&_QUATRE_GND(), &trois[..1]);
    let l3 = n(&t3["modelise"]["inductance_nH"]);
    let l1 = n(&t1["modelise"]["inductance_nH"]);
    assert!(n(&t3["retour"]["retenus"]) == 3.0, "les trois n'ont pas ete retenus");
    assert!(l3 < l1, "trois retours ne valent pas mieux qu'un");
    assert!(l3 > l1 / 3.0,
            "trois retours ont divise l'inductance par trois ou plus ({:.4} contre\
             \x20{:.4}) : la mutuelle entre eux n'est pas comptee", l3, l1);

    // LA REPARTITION EST RENDUE, ET ELLE SOMME A UN. C'est elle que le chevelu
    // affiche : elle dit lequel travaille vraiment.
    let vias = els(&t3["retour"]["vias"]);
    let parts: f64 = vias.iter().filter(|f| f["retenu"].vrai()).map(|f| n(&f["part"])).sum();
    proche(parts, 1.0, 1e-6, "la somme des parts de courant de retour");
    let mut ordre: Vec<&Json> = vias.iter().collect();
    ordre.sort_by(|f, g| n(&f["distance_mm"]).total_cmp(&n(&g["distance_mm"])));
    assert!(n(&ordre[0]["part"]) > n(&ordre[ordre.len() - 1]["part"]),
            "le via le plus proche ne porte pas la plus grosse part");
}

/// UN RETOUR BORGNE REND UNE INDUCTANCE TROP PETITE, ET C'EST LE PIRE CAS.
///
/// L'inductance de boucle n'est definie que pour un courant a divergence
/// nulle. Un via de masse qui ne couvre que la moitie de la hauteur ne referme
/// rien : le reste du chemin passe par le cuivre des plans, absent du modele.
/// Nourrir la formule avec lui rend un nombre, et ce nombre est PLUS PETIT que
/// la verite -- on mesure -18 %. On refuse donc, plutot que de flatter.
fn un_retour_qui_ne_referme_pas_est_ecarte() {
    let (_, tr) = _trans(&_QUATRE_GND(), &[_retour_via_p(15.6, 0.0, "GND", 0, 2, 0.25)]);
    let ret = &tr["retour"];
    assert!(n(&ret["retenus"]) == 0.0, "un via borgne mi-hauteur a ete pris pour un retour");
    assert!(t(&ret["vias"][0]["raison"]).contains("couvre"),
            "la raison ne dit pas que la hauteur n'est pas couverte : « {} »",
            t(&ret["vias"][0]["raison"]));
    // Et la formule elle-meme refuse, meme si on la force.
    let h = _EPAISSEUR_CARTE * 1e-3;
    let sig = tl::Via { x: 0.0, y: 0.0, z1: 0.0, z2: h, rayon: 1.25e-4 };
    assert!(tl::inductance_boucle_vias(
                &sig, &[tl::Via { x: 6e-4, y: 0.0, z1: 0.0, z2: h / 2.0, rayon: 1.25e-4 }], 1e-6).is_err(),
            "inductance_boucle_vias accepte un courant ouvert");
}

/// UN VIA A COTE N'EST PAS UN VIA DE RETOUR. Seul le cuivre des nets de
/// reference porte le courant de retour ; un via d'un autre signal, aussi
/// proche soit-il, ne referme rien. C'est la meme regle que la masse
/// coplanaire, et elle etait deja tombee une fois faute d'etre ecrite.
fn un_via_d_un_autre_signal_n_est_pas_un_retour() {
    let (_, tr) = _trans(&_QUATRE_GND(), &[_retour_via_p(15.4, 0.0, "D+", 0, 6, 0.25)]);
    assert!(n(&tr["retour"]["retenus"]) == 0.0, "un via de signal a servi de retour");
    assert!(t(&tr["retour"]["vias"][0]["raison"]).contains("référence"),
            "la raison ne dit pas que ce n'est pas une reference : « {} »",
            t(&tr["retour"]["vias"][0]["raison"]));
}

/// L'ABSENCE D'INFORMATION N'EST PAS UN DEFAUT DE LA CARTE.
///
/// Une page qui n'envoie pas les vias voisins n'est pas une carte sans vias de
/// masse. Les deux donnent la meme inductance, et il faut pourtant les
/// distinguer : dans un cas c'est le routage qu'on juge, dans l'autre l'outil.
fn la_page_qui_n_envoie_rien_le_dit() {
    let via = obj! {"drill_diameter" => 0.25, "pad_diameter" => 0.55};
    let r = sim(&_doc_via_c(vec![_piste(0.0, 0.0, 15.0, 0.0, 0),
                                 _piste_via(15.0, 0.0, 30.0, 0.0, 6, &via)],
                            &_QUATRE_GND(), 200e6));
    let ret = &r["discontinuites"]["transitions"][0]["retour"];
    assert!(t(&ret["source"]) == "absent",
            "une page muette est comptee comme une carte sans via de masse");
    assert!(avertis(&r).iter().any(|a| a.contains("ne sont pas envoyés")),
            "le silence de la page n'est pas dit");
}

/// SANS LE NET DES PLANS, LE TEST QUI COMPTE NE PEUT PAS SE FAIRE.
///
/// Distinguer un plan de masse d'un plan d'alimentation demande leur net.
/// Refuser tous les retours rendrait la mesure impossible sur ces empilages ;
/// les accepter en silence ferait passer le cas GND/PWR pour sain. On accepte,
/// et `plans_incertains` le porte jusqu'a la fiche.
fn un_empilage_sans_net_de_plan_le_dit_aussi() {
    let (_, tr) = _trans(&_QUATRE(), &[_retour_via(15.6, 0.0)]);
    assert!(tr["retour"]["plans_incertains"].vrai(),
            "un empilage sans net de plan ne se declare pas incertain");
    assert!(n(&tr["retour"]["retenus"]) == 1.0,
            "l'incertitude a fait refuser le via au lieu de l'accepter en le disant");
}

/// LE FACTEUR SEPT QUI MANQUAIT, ET LES ANTIPADS QUI MANQUAIENT TOUT COURT.
///
/// Les deux pastilles d'extremite etaient comptees a la HAUTEUR DU VIA --
/// 1,34 mm -- alors qu'une pastille voit le plan qui lui fait face a 0,2 mm.
/// Et les antipads, un par plan traverse, ne l'etaient pas du tout.
fn l_antipad_et_les_pastilles_entrent_dans_la_capacite() {
    let (_, tr) = _trans(&_QUATRE_GND(), &[_retour_via(15.6, 0.0)]);
    let cap = &tr["capacite"];
    let ancien = tl::capacite_pastille(0.55e-3, _EPAISSEUR_CARTE * 1e-3, 4.2) * 1e15;
    assert!(n(&cap["totale_fF"]) > 10.0 * ancien,
            "la capacite n'a pas change d'ordre : {:.2} contre {:.2} fF", n(&cap["totale_fF"]), ancien);
    assert!(n(&cap["antipad_fF"]) > 0.0, "aucun antipad compte sur un via traversant");
    assert!(els(&cap["plans_traverses"]).len() == 2,
            "un via TOP -> BOT traverse deux plans, pas {}", els(&cap["plans_traverses"]).len());
    // Un antipad plus SERRE donne PLUS de capacite : c'est le sens physique, et
    // c'est ce qui prouve que la cote arrive jusqu'au modele.
    let (_, t_serre) = _trans_a(&_QUATRE_GND(), &[_retour_via(15.6, 0.0)], 0.60);
    assert!(n(&t_serre["capacite"]["antipad_fF"]) > n(&cap["antipad_fF"]),
            "resserrer l'antipad n'augmente pas la capacite");
    assert!(t(&tr["cotes"]["antipad_source"]) == "page");
}

/// Le rang de la frequence centrale dans la grille du resultat.
pub fn rang_fc(r: &Json) -> usize {
    let f = n(&r["f_centre"]);
    let freqs = els(&r["freqs"]);
    (0..freqs.len()).min_by(|&a, &b| (n(&freqs[a]) - f).abs().total_cmp(&(n(&freqs[b]) - f).abs())).unwrap()
}

/// `complex(*r["s"][k][0])` : le S11 rendu a la frequence de rang k.
pub fn s11(r: &Json, k: usize) -> Complex64 {
    Complex64::new(n(&r["s"][k][0][0]), n(&r["s"][k][0][1]))
}

pub const ID: tl::Abcd = [[Complex64::new(1.0, 0.0), Complex64::new(0.0, 0.0)], [Complex64::new(0.0, 0.0), Complex64::new(1.0, 0.0)]];

/// `line_losses(z, eps, w, er, tand, f, epaisseur)`
pub fn pertes(z: f64, eps: f64, w: f64, er: f64, tand: f64, f: f64, epaisseur: f64) -> (f64, f64) {
    tl::line_losses(z, eps, w, er, tand, f, &tl::OptionsPertes { epaisseur, ..Default::default() }).unwrap()
}

/// CE QUI EST AFFICHE EST CE QUI EST APPLIQUE, et les deux paliers viennent
/// justement d'ajouter des arguments au modele -- c'est le moment ou les deux
/// chemins divergent, s'ils doivent diverger.
///
/// On recalcule la cascade a la main a partir des SEULS chiffres de la fiche,
/// et on exige la meme matrice S que celle rendue.
fn la_fiche_et_la_courbe_portent_le_meme_via() {
    let (r, tr) = _trans(&_QUATRE_GND(), &[_retour_via(15.6, 0.0)]);
    let m = &tr["modelise"];
    let f = n(&r["f_centre"]);
    let k = rang_fc(&r);

    let mut a = ID;
    for (i, seg) in els(&r["segments"]).iter().enumerate() {
        // TOUT EN METRES POUR ligne_mom, ET LE RESULTAT EST EN MILLIMETRES.
        // `seg["h"]` est la hauteur au plan en mm ; la passer telle quelle a
        // `dispersion_getsinger` donne un microruban mille fois trop haut, et
        // l'essai accuse alors le serveur.
        let (eps_f, z_f) = tl::dispersion_getsinger(n(&seg["z0_statique"]), n(&seg["eps_eff"]),
                                                    n(&seg["er"]), n(&seg["h"]) * 1e-3, f);
        let (ac, ad) = pertes(z_f, eps_f, n(&seg["largeur"]) * 1e-3, n(&seg["er"]),
                              n(&seg["tan_delta"]), f, n(&seg["cuivre"]) * 1e-3);
        let beta = 2.0 * PI * f * eps_f.sqrt() / tl::C_0;
        // LA DISCONTINUITE PRECEDE LE TRONCON QU'ELLE ANNONCE : « troncon 1 »
        // veut dire « entre le 0 et le 1 », donc AVANT la ligne du 1.
        if i as f64 == n(&tr["troncon"]) {
            a = mul2(&a, &tl::abcd_via_boucle(n(&m["inductance_nH"]) * 1e-9,
                                              n(&m["capacite_fF"]) * 1e-15, f));
        }
        // LA MEME LIGNE QUE LA CASCADE : Zc et gamma complexes depuis R, L, G,
        // C (`ligne_a_pertes`, 2.11.0), et non plus Z0 reel avec alpha + j beta.
        let (zc, gamma) = tl::ligne_a_pertes(z_f, ac, ad, beta);
        a = mul2(&a, &tl::abcd_line(zc, gamma, n(&seg["longueur"]) * 1e-3));
    }
    let s_main = tl::cascade_to_s(&a, n(&r["impedance_reference"]));
    let s_rendu = s11(&r, k);
    proche(s_main[0][0].norm(), s_rendu.norm(), 2e-3,
           "le |S11| refait depuis la fiche contre celui rendu");
}

/// « TRONCON 1 » VEUT DIRE « ENTRE LE 0 ET LE 1 », ET NON « APRES LE 1 ».
///
/// La cascade posait la ligne du troncon d'arrivee PUIS la discontinuite :
/// chacune se retrouvait decalee d'un troncon vers la sortie, et la derniere
/// sortait du parcours -- sur une liaison a trois troncons et deux vias, le
/// second via tombait AU-DELA DU PORT 2.
///
/// POURQUOI IL FAUT TROIS TRONCONS POUR LE VOIR. Sur deux troncons de meme
/// impedance, les deux ordres donnent exactement le meme |S11| : une ligne
/// uniforme et un reseau en pi sont tous deux symetriques. C'est pour cela que
/// le defaut a survecu aux essais a deux troncons, et c'est pour cela que
/// celui-ci en prend trois, d'impedances differentes.
fn la_discontinuite_se_pose_entre_les_deux_troncons() {
    let via = obj! {"drill_diameter" => 0.25, "pad_diameter" => 0.55};
    let r = sim(&_doc_via_c(vec![_piste_l(0.0, 0.0, 10.0, 0.0, 0, 0.35, None),
                                 _piste_l(10.0, 0.0, 22.0, 0.0, 6, 0.80, Some(&via)),
                                 _piste_l(22.0, 0.0, 32.0, 0.0, 0, 0.35, Some(&via))],
                            &_QUATRE_GND(), 3e9));
    let trans = els(&r["discontinuites"]["transitions"]);
    assert!(trans.len() == 2, "deux changements de couche attendus");
    let f = n(&r["f_centre"]);
    let k = rang_fc(&r);

    let cascade = |avant: bool| {
        let mut a = ID;
        for (i, seg) in els(&r["segments"]).iter().enumerate() {
            let (eps_f, z_f) = tl::dispersion_getsinger(
                n(&seg["z0_statique"]), n(&seg["eps_eff"]), n(&seg["er"]),
                n(&seg["h"]) * 1e-3, f);
            let (ac, ad) = pertes(z_f, eps_f, n(&seg["largeur"]) * 1e-3,
                                  n(&seg["er"]), n(&seg["tan_delta"]), f,
                                  n(&seg["cuivre"]) * 1e-3);
            let beta = 2.0 * PI * f * eps_f.sqrt() / tl::C_0;
            let ligne = tl::abcd_line(Complex64::new(z_f, 0.0), Complex64::new(ac + ad, beta),
                                      n(&seg["longueur"]) * 1e-3);
            let v = trans.iter().rev().find(|tr| n(&tr["troncon"]) == i as f64).map(|tr| {
                let m = &tr["modelise"];
                tl::abcd_via_boucle(n(&m["inductance_nH"]) * 1e-9,
                                    n(&m["capacite_fF"]) * 1e-15, f)
            });
            if let (true, Some(v)) = (avant, &v) {
                a = mul2(&a, v);
            }
            a = mul2(&a, &ligne);
            if let (false, Some(v)) = (avant, &v) {
                a = mul2(&a, v);
            }
        }
        tl::cascade_to_s(&a, n(&r["impedance_reference"]))
    };

    let rendu = s11(&r, k);
    let juste = cascade(true)[0][0];
    let faux = cascade(false)[0][0];
    // LES DEUX ORDRES DOIVENT DIFFERER, sans quoi l'essai ne prouve rien.
    assert!((juste.norm() - faux.norm()).abs() > 1e-3,
            "les deux ordres donnent le meme |S11| : ce cas ne teste rien");
    proche(rendu.norm(), juste.norm(), 2e-3,
           "le |S11| rendu contre la cascade ou le via precede son troncon");
    assert!((rendu.norm() - faux.norm()).abs() > (rendu.norm() - juste.norm()).abs(),
            "le resultat rendu colle a l'ordre FAUX");
}

pub fn banc() {
    titre("Ce que la physique impose");
    T("un troncon trace a l'envers n'est pas un demi-tour", un_troncon_trace_a_l_envers_n_est_pas_un_demi_tour);
    titre("La mise en cascade et les parametres S");
    T("declarer le masque dans l'empilage ne change pas le resultat", declarer_le_masque_ne_change_pas_le_resultat);
    T("un masque plus epais baisse Z0 et monte eps_eff", un_masque_plus_epais_pese_plus);
    T("une piste enterree sous prepreg ne recoit pas de vernis invente", une_piste_enterree_ne_recoit_pas_de_vernis);
    T("couverture et masque ne decrivent jamais la meme resine", couverture_et_masque_ne_sont_jamais_les_deux);
    T("la hauteur d'un via se lit dans l'empilage, elle ne se suppose plus", la_hauteur_du_via_se_lit_dans_l_empilage);
    T("un changement de couche n'est pas un coude, un alignement non plus", un_changement_de_couche_n_est_pas_un_coude);
    T("un via n'est pas une rupture, et une vraie rupture le reste", un_via_n_est_pas_une_rupture);
    T("chaque cote de via dit d'ou elle vient", la_provenance_de_chaque_cote_est_dite);
    T("le via pese ce que la fiche annonce, et les cotes le commandent", le_via_pese_ce_que_la_fiche_annonce);
    T("une référence qui change sans retour est nommée", la_reference_qui_change_sans_retour_est_nommee);
    T("la même carte avec deux plans de masse se referme", la_meme_carte_avec_deux_plans_de_masse_se_referme);
    T("rapprocher le via de retour baisse l'inductance", rapprocher_le_via_de_retour_baisse_l_inductance);
    T("trois vias de retour comptent pour trois", trois_vias_de_retour_comptent_pour_trois);
    T("un retour qui ne referme pas la boucle est écarté", un_retour_qui_ne_referme_pas_est_ecarte);
    T("un via d'un autre signal n'est pas un retour", un_via_d_un_autre_signal_n_est_pas_un_retour);
    T("la page qui n'envoie rien le dit", la_page_qui_n_envoie_rien_le_dit);
    T("un empilage sans net de plan le dit aussi", un_empilage_sans_net_de_plan_le_dit_aussi);
    T("l'antipad et les pastilles entrent dans la capacité", l_antipad_et_les_pastilles_entrent_dans_la_capacite);
    T("la fiche et la courbe portent le même via", la_fiche_et_la_courbe_portent_le_meme_via);
    T("la discontinuité se pose entre les deux tronçons", la_discontinuite_se_pose_entre_les_deux_troncons);
}
