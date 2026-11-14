//! L'appariement, la scene couplee, la carte de chaleur et la couture (cas de banc-ligne-mom.py).

use crate::*;

/// `_poser_section` mesure avec `largeur_effective` ; le solveur elargit
/// par `_milieu`. En triplaque les deux doivent dire le meme chiffre, sans
/// quoi une voisine acceptee a la pose fait lever la section entiere.
fn la_pose_d_une_triplaque_elargit_comme_le_solveur() {
    let (b, tc, w) = (0.3e-3, 35e-6, 0.12e-3);
    let m = tl::_milieu(&tl::Geometrie { kind: tl::Kind::Strip, t: tc, b, y0: Some(0.1e-3),
                                         epsilon_r: 4.3, ..Default::default() }).unwrap();
    proche(tl::largeur_effective(w * 1e3, tc * 1e3, 0.1, b * 1e3) * 1e-3,
           tl::_elargir(&m, w, tc), 1e-9, "largeur effective");
    let sc = j(r#"{"net": "SIG", "largeur": 0.12, "epaisseur": 0.035, "gap_g": 0.0,
          "gap_d": 0.0, "voisins": [
              {"net": "V", "x": 0.1575, "largeur": 0.12, "garde": false,
               "longueur": 1.0, "ecart": 0.0375, "ecart_min": 0.0375,
               "troncons": 1, "cote": "droite", "deux_cotes": false}]}"#);
    // 0,0375 mm de cuivre nu : l'elargissement de la triplaque (b = 0,3,
    // y0 = 0,1) en ajoute 0,0368 et laisse passer, celui du microruban
    // (h = 0,1) 0,0385. (Avant le constat 30 le microruban n'ajoutait que
    // 0,031 -- Wheeler ruban large -- et l'essai separait les deux a 0,036,
    // dans l'autre sens.)
    assert!(!_poser_section(&sc, 0.1, 0.0, 0.0).1.is_empty());
    assert!(_poser_section(&sc, 0.1, 0.0, 0.3).1.is_empty());
}

pub fn _doc_couplage_p(objets: Vec<Json>, voisinage: Vec<Json>, couches: Option<Vec<Json>>, paires: Option<Json>) -> Json {
    let couches = couches.unwrap_or_else(|| vec![_cu("TOP", "signal"), _di("core", 0.2, 4.3),
                                                 _cu("GND", "plane"), _di("ame", 0.8, 4.3),
                                                 _cu("IN2", "signal"), _di("bas", 0.2, 4.3),
                                                 _cu("BOT", "plane")]);
    let mut doc = obj! {"format" => "cao-sim-em-3", "carte" => "banc", "net" => "SIG",
                        "stackup" => obj! {"layers" => couches},
                        "geometry" => obj! {"objects" => objets},
                        "voisinage" => voisinage,
                        "reference_nets" => vec!["GND"],
                        "ports" => j(r#"[{"id": 1, "impedance": 50}, {"id": 2, "impedance": 50}]"#),
                        "analyse" => j(r#"{"f_debut": 1e8, "f_fin": 5e9, "points": 11,
                       "f_centre": 1e9}"#)};
    if let Some(p) = paires.filter(Json::vrai) {
        poser(&mut doc, "paires", p);
    }
    doc
}

pub fn _doc_couplage(objets: Vec<Json>, voisinage: Vec<Json>) -> Json {
    _doc_couplage_p(objets, voisinage, None, None)
}

pub fn _pis_l(x1: f64, y1: f64, x2: f64, y2: f64, net: &str, couche: i64, largeur: f64) -> Json {
    obj! {"type" => "track", "start" => vec![x1, y1], "end" => vec![x2, y2],
          "width" => largeur, "layer" => couche, "net" => net,
          "copper_thickness" => 0.035}
}

pub fn _pis_c(x1: f64, y1: f64, x2: f64, y2: f64, net: &str, couche: i64) -> Json {
    _pis_l(x1, y1, x2, y2, net, couche, 0.25)
}

pub fn _pis(x1: f64, y1: f64, x2: f64, y2: f64, net: &str) -> Json {
    _pis_l(x1, y1, x2, y2, net, 0, 0.25)
}

/// Les nets voisins d'une liste de fiches (`[f["net_voisin"] for f in ...]`).
pub fn nets_de(l: &Json, cle: &str) -> Vec<String> {
    els(l).iter().map(|f| t(&f[cle]).to_string()).collect()
}

/// La fiche du longement avec ce net voisin.
pub fn paire_de<'a>(c: &'a Json, net: &str) -> &'a Json {
    els(&c["paires"]).iter().find(|f| t(&f["net_voisin"]) == net).unwrap_or_else(|| panic!("pas de longement avec {net}"))
}

/// CE QUI EST RETENU, ET AVEC QUELLES COTES.
///
/// Deux pistes de 0,25 mm dont les AXES sont a 0,5 mm laissent 0,25 mm de
/// cuivre a cuivre : l'ecart rendu est celui-la, et pas la distance entre
/// axes. C'est la meme convention que partout ailleurs dans cette chaine, et
/// s'en ecarter ferait sortir Z_diff de plusieurs ohms.
fn deux_pistes_qui_se_longent_sont_appariees() {
    let r = sim(&_doc_couplage(vec![_pis(0.0, 0.0, 25.0, 0.0, "SIG")],
                               vec![_pis(0.0, 0.5, 25.0, 0.5, "AGR")]));
    let paires = els(&r["couplage"]["paires"]);
    assert!(paires.len() == 1, "{} longement(s) au lieu d'un", paires.len());
    let f = &paires[0];
    proche(n(&f["ecart"]), 0.25, 1e-6, "ecart de cuivre a cuivre");
    proche(n(&f["longueur"]), 25.0, 1e-6, "longueur de recouvrement");
    assert!(t(&f["net_voisin"]) == "AGR", "{}", t(&f["net_voisin"]));
    assert!(n(&f["z_diff"]) > 0.0 && n(&f["z_commune"]) > 0.0, "{}", dumps(f));
}

/// QUATRE FACONS DE NE PAS ETRE APPARIE, et aucune ne doit faire de paire.
///
/// Une perpendiculaire, une piste trop loin, une piste sur une autre couche,
/// et une piste du MEME net -- qui est la meme liaison, pas un agresseur.
///
/// ET CELLE DE L'AUTRE COUCHE NE SE TAIT PLUS TOUT A FAIT : elle ne peut pas
/// entrer dans la section -- un seul plan de conducteurs --, mais l'empilage
/// du banc pose GND entre TOP et IN2, et c'est ce PLAN qui la rend inoffensive.
/// Elle est donc comptee comme BLINDEE, ce qui n'est pas la meme chose que de
/// ne pas l'avoir vue. Voir le test suivant pour le cas sans plan.
fn ce_qui_ne_longe_pas_est_ecarte() {
    let r = sim(&_doc_couplage(
        vec![_pis(0.0, 0.0, 25.0, 0.0, "SIG")],
        vec![_pis(12.0, -5.0, 12.0, 5.0, "CROISE"),          // perpendiculaire
             _pis(0.0, 4.0, 25.0, 4.0, "LOIN"),              // au-dela de 3 mm
             _pis_c(0.0, 0.5, 25.0, 0.5, "DESSOUS", 4),      // une autre couche, sous GND
             _pis(0.0, 0.5, 25.0, 0.5, "SIG")]));            // le meme net
    let c = &r["couplage"];
    assert!(!c["paires"].vrai(),
            "apparie a tort : {:?}", nets_de(&c["paires"], "net_voisin"));
    assert!(!c["superposes"].vrai(),
            "signale a tort par-dessus : {:?}", nets_de(&c["superposes"], "net"));
    assert!(n(&c["superposes_blindes"]) == 1.0,
            "{} longement(s) blinde(s) au lieu d'un", n(&c["superposes_blindes"]));
}

pub fn _ADOSSEES() -> Vec<Json> {
    vec![_cu("TOP", "signal"), _di("pp", 0.1, 4.3),
         _cu("IN1", "signal"), _di("ame", 0.8, 4.3),
         _cu("GND", "plane"), _di("bas", 0.2, 4.3),
         _cu("BOT", "plane")]
}

/// LE PIRE CAS DU METIER NE DOIT PAS S'AFFICHER COMME LE MEILLEUR.
///
/// Deux couches de signal ADOSSEES, une piste exactement sous l'autre sur
/// toute sa longueur : la section droite ne sait pas le decrire -- elle pose
/// tous ses conducteurs a la meme hauteur -- et rendait donc « aucune voisine
/// ne longe ». On verifie les trois choses qui font la difference entre un
/// silence et une reserve :
///
///   · aucune PAIRE, parce que le couplage n'est toujours pas chiffre ;
///   · une entree dans `superposes`, avec la geometrie qui decide -- longueur
///     en regard, decalage de cuivre a cuivre NUL (les deux pistes se
///     chevauchent en projection), et l'epaisseur de PREPREG, pas la distance
///     entre les milieux des deux cuivres ;
///   · un AVERTISSEMENT, parce qu'une hypothese ne dit pas si le cas se
///     produit ici.
fn ce_qui_longe_par_dessus_est_vu_sans_etre_chiffre() {
    let r = sim(&_doc_couplage_p(vec![_pis(0.0, 0.0, 25.0, 0.0, "SIG")],
                                 vec![_pis_c(0.0, 0.0, 25.0, 0.0, "DESSUS", 2)],
                                 Some(_ADOSSEES()), None));
    let c = &r["couplage"];
    assert!(!c["paires"].vrai(), "chiffre ce qu'il ne sait pas resoudre");
    assert!(els(&c["superposes"]).len() == 1,
            "{} longement(s) entre couches", els(&c["superposes"]).len());
    let f = &c["superposes"][0];
    assert!(t(&f["net"]) == "DESSUS", "{}", t(&f["net"]));
    assert!(t(&f["nom_couche"]) == "IN1" && t(&f["nom_depuis"]) == "TOP", "{}", dumps(f));
    proche(n(&f["longueur"]), 25.0, 1e-6, "longueur en regard");
    assert!(n(&f["decalage"]) == 0.0, "decalage {:.3} au lieu de 0", n(&f["decalage"]));
    proche(n(&f["hauteur"]), 0.1, 1e-6, "prepreg entre les deux faces");
    assert!(avertis(&r).iter().any(|a| a.contains("ENTRE COUCHES")),
            "aucun avertissement : le silence se lit comme un couplage nul");
}

/// LA MEME CONVENTION QUE POUR L'ECART COPLANAIRE, et pour la meme raison.
///
/// Deux pistes de 0,25 mm dont les axes sont a 0,4 mm laissent 0,15 mm de
/// cuivre a cuivre. Compter la distance entre AXES deguiserait un pire cas en
/// cas moyen -- deux pistes qui se chevauchent encore largement en projection
/// seraient annoncees « decalees de 0,4 mm ».
///
/// ET AU-DELA DE LA PORTEE, PLUS RIEN : une piste a 4 mm sur la couche
/// adossee ne se voit plus lateralement, comme sur la meme couche.
fn le_decalage_entre_couches_se_compte_de_cuivre_a_cuivre() {
    let r = sim(&_doc_couplage_p(
        vec![_pis(0.0, 0.0, 25.0, 0.0, "SIG")],
        vec![_pis_c(0.0, 0.4, 25.0, 0.4, "DECALEE", 2),
             _pis_c(0.0, 4.0, 25.0, 4.0, "HORS", 2)],
        Some(_ADOSSEES()), None));
    let sup = els(&r["couplage"]["superposes"]);
    assert!(sup.len() == 1, "{:?}", nets_de(&r["couplage"]["superposes"], "net"));
    assert!(t(&sup[0]["net"]) == "DECALEE", "{}", t(&sup[0]["net"]));
    proche(n(&sup[0]["decalage"]), 0.15, 1e-6, "decalage de cuivre a cuivre");
}

/// SIGNALER UN CROISEMENT SERAIT SIGNALER LA SOLUTION.
///
/// L'aire de recouvrement d'une traversee orthogonale est minuscule, et c'est
/// precisement pourquoi la regle du metier est de router deux couches
/// adossees a angle droit. Une carte correctement routee ne doit donc pas
/// recevoir une alarme par croisement.
///
/// Le meme net d'une couche a l'autre ne compte pas non plus : c'est la meme
/// liaison qui change de couche par un via, pas un agresseur.
fn un_croisement_entre_couches_ne_se_signale_pas() {
    let r = sim(&_doc_couplage_p(
        vec![_pis(0.0, 0.0, 25.0, 0.0, "SIG")],
        vec![_pis_c(12.0, -5.0, 12.0, 5.0, "CROISE", 2),
             _pis_c(0.0, 0.0, 25.0, 0.0, "SIG", 2)],
        Some(_ADOSSEES()), None));
    assert!(!r["couplage"]["superposes"].vrai(),
            "signale a tort : {:?}", nets_de(&r["couplage"]["superposes"], "net"));
}

/// UNE VOISINE QUI NE LONGE QUE LA MOITIE NE COUPLE QUE SUR LA MOITIE.
///
/// C'est tout l'objet de la projection sur l'axe : prendre la longueur de la
/// voisine, ou celle de la victime, donnerait un couplage deux fois trop long
/// -- et le NEXT sature justement sur la longueur.
fn le_recouvrement_partiel_compte_pour_ce_quil_est() {
    let r = sim(&_doc_couplage(vec![_pis(0.0, 0.0, 20.0, 0.0, "SIG")],
                               vec![_pis(12.0, 0.5, 40.0, 0.5, "AGR")]));
    let f = &r["couplage"]["paires"][0];
    proche(n(&f["longueur"]), 8.0, 1e-6, "recouvrement partiel");
}

/// TROIS TRONCONS QUI LONGENT LA MEME VOISINE FONT UNE SEULE LIGNE.
///
/// La fiche repond a « combien ce net me prend-il », pas a « combien de
/// segments ai-je dessines » : les longueurs s'additionnent, et l'ecart rendu
/// est la moyenne PONDEREE, l'ecart le plus serre restant a part.
fn les_longements_dun_meme_net_se_cumulent() {
    let r = sim(&_doc_couplage(
        vec![_pis(0.0, 0.0, 10.0, 0.0, "SIG"), _pis(10.0, 0.0, 20.0, 0.0, "SIG")],
        vec![_pis(0.0, 0.5, 10.0, 0.5, "AGR"), _pis(10.0, 0.8, 20.0, 0.8, "AGR")]));
    let paires = els(&r["couplage"]["paires"]);
    assert!(paires.len() == 1, "{} lignes pour un seul net voisin", paires.len());
    let f = &paires[0];
    proche(n(&f["longueur"]), 20.0, 1e-6, "longueur cumulee");
    assert!(n(&f["troncons"]) == 2.0, "{} troncons", n(&f["troncons"]));
    proche(n(&f["ecart_min"]), 0.25, 1e-6, "ecart le plus serre");
    proche(n(&f["ecart"]), 0.4, 1e-6, "ecart moyen pondere");
}

/// QUI EST UNE PAIRE, ET QUI N'EST QU'UN VOISIN.
///
/// Le calcul est le meme -- deux pistes qui se longent sont couplees, quels
/// que soient leurs noms. Ce qui change est la QUESTION : sur une paire, Z_diff
/// est la reponse ; sur un voisin quelconque, c'est le NEXT. Les suffixes
/// tranchent a defaut de declaration, et la declaration de la page l'emporte.
fn la_paire_differentielle_se_nomme() {
    let r = sim(&_doc_couplage(vec![_pis(0.0, 0.0, 25.0, 0.0, "USB_DP")],
                               vec![_pis(0.0, 0.5, 25.0, 0.5, "USB_DM"),
                                    _pis(0.0, -0.8, 25.0, -0.8, "CLK")]));
    assert!(paire_de(&r["couplage"], "USB_DM")["differentielle"].vrai(),
            "USB_DP / USB_DM n'est pas reconnu comme une paire");
    assert!(!paire_de(&r["couplage"], "CLK")["differentielle"].vrai(),
            "CLK passe pour la moitie d'une paire differentielle");

    // LA DECLARATION DE LA PAGE L'EMPORTE : deux nets qui ne se ressemblent pas
    // forment une paire des lors qu'on l'a dit dans l'editeur.
    let r2 = sim(&_doc_couplage_p(vec![_pis(0.0, 0.0, 25.0, 0.0, "ALPHA")],
                                  vec![_pis(0.0, 0.5, 25.0, 0.5, "BETA")],
                                  None, Some(j(r#"[["ALPHA", "BETA"]]"#))));
    assert!(r2["couplage"]["paires"][0]["differentielle"].vrai(),
            "une paire declaree par la page n'est pas reconnue");
}

/// LA FICHE SE LIT DE HAUT EN BAS, donc le pire doit y etre.
///
/// Un longement long et lache fait moins de bruit qu'un court et serre : c'est
/// le BRUIT qui ordonne la liste, pas la longueur.
fn le_pire_longement_vient_en_tete() {
    let r = sim(&_doc_couplage(
        vec![_pis(0.0, 0.0, 40.0, 0.0, "SIG")],
        vec![_pis(0.0, 2.0, 40.0, 2.0, "LACHE"),        // long, mais a 1,75 mm
             _pis(0.0, -0.4, 8.0, -0.4, "SERRE")]));    // court, mais a 0,15 mm
    let noms = nets_de(&r["couplage"]["paires"], "net_voisin");
    assert!(noms[0] == "SERRE", "la fiche met « {} » en tete", noms[0]);
}

/// SANS FRONT DONNE, ON LE DEDUIT -- ET ON DIT QU'ON L'A DEDUIT.
///
/// Le temps de montee ne change ni [C] ni [L] : il decide de la saturation du
/// NEXT et de l'amplitude du FEXT. Le poser en dur ferait mentir les deux ;
/// le deduire de la bande analysee par la regle du genou est une hypothese
/// defendable, a condition de l'ecrire.
fn le_temps_de_montee_se_deduit_de_la_bande() {
    let mut doc = _doc_couplage(vec![_pis(0.0, 0.0, 25.0, 0.0, "SIG")],
                                vec![_pis(0.0, 0.5, 25.0, 0.5, "AGR")]);
    let r = sim(&doc);
    let c = &r["couplage"];
    proche(n(&c["temps_montee"]), 0.35 / 5e9, 1e-9, "temps de montee deduit");
    assert!(t(&c["temps_montee_source"]).contains("deduit"), "{}", t(&c["temps_montee_source"]));

    poser(dans(&mut doc, "analyse"), "temps_montee", 500e-12);
    let r2 = sim(&doc);
    let c2 = &r2["couplage"];
    proche(n(&c2["temps_montee"]), 500e-12, 1e-9, "temps de montee saisi");
    assert!(t(&c2["temps_montee_source"]) == "saisi", "{}", t(&c2["temps_montee_source"]));
    // ET IL NE CHANGE RIEN A LA Z DIFFERENTIELLE : elle sort de [C] et [L],
    // que le front ne touche pas. C'est ce qui rend cette page-ci lisible
    // sans rien savoir du signal -- le front n'y sert qu'au seuil de
    // couture.
    proche(n(&c2["paires"][0]["z_diff"]), n(&c["paires"][0]["z_diff"]), 1e-9,
           "le front ne doit pas bouger la Z differentielle");
}

/// UN DOCUMENT SANS VOISINAGE RESTE UN DOCUMENT VALIDE.
///
/// Une page qui n'envoie pas de voisinage -- une version anterieure, un banc,
/// un fichier ecrit a la main -- doit obtenir tout le reste : les impedances,
/// la cascade, les discontinuites. Le couplage y est simplement vide, et la
/// fiche le dira.
fn sans_voisinage_il_ny_a_pas_de_couplage_et_ce_nest_pas_une_erreur() {
    let mut doc = _doc_couplage(vec![_pis(0.0, 0.0, 25.0, 0.0, "SIG")], vec![]);
    oter(&mut doc, "voisinage");
    let r = sim(&doc);
    assert!(els(&r["couplage"]["paires"]).is_empty(), "{}", dumps(&r["couplage"]["paires"]));
    assert!(n(&r["couplage"]["voisinage"]) == 0.0);
    assert!(n(&r["ligne"]["z0_moyen"]) > 0.0, "le reste du calcul a souffert");
}

pub fn _essai_scene_p(voisinage: Vec<Json>, gap: f64, refs: &[&str], tr: f64) -> Json {
    let mut doc = _doc_couplage(vec![avec(&_pis(0.0, 0.0, 25.0, 0.0, "SIG"), &[("gap_left", gap.j()), ("gap_right", gap.j())])], voisinage);
    poser(&mut doc, "reference_nets", refs.to_vec());
    poser(dans(&mut doc, "analyse"), "temps_montee", tr);
    sim(&doc)["couplage"].clone()
}

pub fn _essai_scene(voisinage: Vec<Json>, gap: f64) -> Json {
    _essai_scene_p(voisinage, gap, &["GND"], 150e-12)
}

/// DEUX VOISINES FONT UN PROBLEME A TROIS CONDUCTEURS, PAS DEUX A DEUX.
///
/// Une seule section est resolue, elle porte les trois rubans, et la piste du
/// milieu voit son impedance BAISSER -- deux voisines lui prennent du champ.
/// Deux paires resolues separement ne le verraient pas.
fn les_voisines_entrent_dans_une_seule_section() {
    let c = _essai_scene(vec![_pis(0.0, 0.5, 25.0, 0.5, "GAUCHE"),
                              _pis(0.0, -0.5, 25.0, -0.5, "DROITE")], 2.0);
    assert!(els(&c["sections"]).len() == 1, "{} sections", els(&c["sections"]).len());
    let sec = &c["sections"][0];
    assert!(els(&sec["conducteurs"]).len() == 3,
            "{} conducteurs dans la section", els(&sec["conducteurs"]).len());
    assert!(els(&c["paires"]).len() == 2, "{} longements", els(&c["paires"]).len());

    // LES DEUX COTES SONT DISTINGUES, et par la position : « gauche » et
    // « droite » ne sont pas une etiquette, c'est le signe de x.
    let mut cotes = nets_de(&c["paires"], "cote");
    cotes.sort();
    assert!(cotes == ["droite", "gauche"], "{:?}", cotes);
    let mut xs: Vec<f64> = els(&sec["conducteurs"]).iter().map(|d| round(n(&d["x"]), 4)).collect();
    xs.sort_by(f64::total_cmp);
    assert!(xs[0] < 0.0 && 0.0 < xs[2] && xs[1] == 0.0, "{:?}", xs);

    // La piste du milieu, prise seule, serait a 57,6 ohms ; encadree, moins.
    let seule = _essai_scene(vec![_pis(0.0, 0.5, 25.0, 0.5, "GAUCHE")], 2.0);
    assert!(n(&sec["z0_selection"]) < n(&seule["sections"][0]["z0_selection"]),
            "deux voisines ne font pas baisser Z0 : {:.2} puis {:.2}",
            n(&seule["sections"][0]["z0_selection"]), n(&sec["z0_selection"]));
}

/// L'ECART MESURE EST CELUI DE LA SELECTION ; LE PLAN BORDE LE GROUPE.
///
/// Les deux pages sondent les PLANS sans voir les pistes : `gap_left` est donc
/// la distance de la selection au plan de gauche MEME quand une voisine se
/// trouve entre les deux. L'ecart du groupe est celui-la moins le cuivre
/// ajoute de ce cote, et c'est ce qui rend la masse coplanaire recuperable
/// sans rien mesurer de plus.
fn le_plan_coplanaire_borde_le_groupe() {
    // Une voisine a gauche (axe a 0,5 mm), un plan mesure a 1,5 mm de part et
    // d'autre. A gauche le groupe s'est etendu de 0,5 mm : il reste 1,0 mm.
    let c = _essai_scene(vec![_pis(0.0, 0.5, 25.0, 0.5, "AGR")], 1.5);
    let sec = &c["sections"][0];
    proche(n(&sec["ecart_g"]), 1.0, 1e-6, "ecart du groupe cote voisine");
    proche(n(&sec["ecart_d"]), 1.5, 1e-6, "ecart du groupe cote libre");

    // ET IL COMPTE : le meme longement, plan serre contre plan lointain, ne
    // rend pas la meme Z differentielle. Le plan prend du champ au couple,
    // donc il baisse le mode impair.
    let loin = _essai_scene(vec![_pis(0.0, 0.5, 25.0, 0.5, "AGR")], 0.0);
    let pres = _essai_scene(vec![_pis(0.0, 0.5, 25.0, 0.5, "AGR")], 0.8);
    assert!(n(&pres["paires"][0]["z_diff"]) < n(&loin["paires"][0]["z_diff"]),
            "le plan ne baisse pas Z_diff : {:.2} contre {:.2}",
            n(&pres["paires"][0]["z_diff"]), n(&loin["paires"][0]["z_diff"]));
    // Sans plan a portee, l'ecart du groupe est nul et le calcul est majorant :
    // c'est la seule reserve qui reste, et elle se dit.
    assert!(n(&loin["sections"][0]["ecart_g"]) == 0.0, "{}", dumps(&loin["sections"][0]));
}

/// UNE VOISINE DE MASSE N'EST PAS UNE VOISINE, C'EST UN BOUCLIER.
///
/// Elle entre dans la section a ZERO VOLT -- elle occupe la place, elle prend
/// du champ -- et elle n'a ni port, ni Z differentielle, ni bruit a elle. La
/// prendre pour un agresseur afficherait une impedance differentielle entre un
/// signal et la masse, et un NEXT que personne ne subit.
///
/// CE QU'ELLE COUTE, et il faut le dire : elle fait BAISSER Z0 des deux
/// signaux. On ne pose pas une garde sans revoir la largeur.
fn une_piste_du_net_de_masse_est_une_garde() {
    let avec_g = _essai_scene(vec![_pis(0.0, 0.70, 25.0, 0.70, "AGR"),
                                   _pis(0.0, 0.35, 25.0, 0.35, "GND")], 2.0);
    let sans = _essai_scene(vec![_pis(0.0, 0.70, 25.0, 0.70, "AGR")], 2.0);

    let sec = &avec_g["sections"][0];
    assert!(n(&sec["gardes"]) == 1.0, "{} garde(s) posee(s)", n(&sec["gardes"]));
    assert!(els(&sec["conducteurs"]).len() == 3, "{}", dumps(&sec["conducteurs"]));
    let gardes: Vec<&Json> = els(&sec["conducteurs"]).iter().filter(|d| d["garde"].vrai()).collect();
    assert!(gardes.len() == 1 && t(&gardes[0]["net"]) == "GND", "{}", dumps(&sec["conducteurs"]));

    // LA GARDE N'A PAS DE LIGNE DE FICHE : un seul longement, celui du signal.
    assert!(els(&avec_g["paires"]).len() == 1,
            "{:?}", nets_de(&avec_g["paires"], "net_voisin"));
    assert!(t(&avec_g["paires"][0]["net_voisin"]) == "AGR");

    let a = n(&avec_g["paires"][0]["z_diff"]);
    let b = n(&sans["paires"][0]["z_diff"]);
    assert!(a < b,
            "la garde ne baisse pas Z_diff : {:.2} avec contre {:.2} sans", a, b);
    assert!(n(&sec["z0_selection"]) < n(&sans["sections"][0]["z0_selection"]),
            "une garde a zero volt ne fait pas baisser Z0");
}

/// UNE PAIRE PRISE DANS UN BUS N'A PAS LA Z_DIFF DE LA PAIRE SEULE.
///
/// La troisieme piste prend du champ au couple : sa Z differentielle baisse.
/// La reduction est exacte -- les autres conducteurs tenus a zero volt, ce qui
/// est la sous-matrice de Maxwell --, mais c'est une hypothese, et le panneau
/// la dit.
fn z_diff_dans_un_bus_tient_les_autres_a_la_masse() {
    let seule = _essai_scene(vec![_pis(0.0, 0.5, 25.0, 0.5, "AGR")], 0.0);
    let bus = _essai_scene(vec![_pis(0.0, 0.5, 25.0, 0.5, "AGR"),
                                _pis(0.0, -0.5, 25.0, -0.5, "TIERS")], 0.0);
    let z_seule = n(&seule["paires"][0]["z_diff"]);
    let z_bus = n(&paire_de(&bus, "AGR")["z_diff"]);
    assert!(z_bus < z_seule,
            "Z_diff ne baisse pas dans un bus : {:.2} puis {:.2}", z_seule, z_bus);
    assert!((z_bus - z_seule).abs() < 0.05 * z_seule,
            "Z_diff s'effondre : {:.2} contre {:.2}", z_bus, z_seule);
}

/// UNE VOISINE QUI DISPARAIT SANS UN MOT SE LIT COMME UN COUPLAGE NUL.
///
/// Deux nets qui passent tour a tour au meme endroit, chacun sur une moitie de
/// la longueur, se retrouvent a la MEME abscisse moyenne : il n'y a de place
/// que pour un. On pose le plus proche et l'on NOMME l'autre, avec la raison.
fn ce_qui_ne_tient_pas_dans_la_section_est_nomme() {
    let c = _essai_scene(vec![_pis(0.0, 0.5, 12.0, 0.5, "A"),
                              _pis(13.0, 0.5, 25.0, 0.5, "B")], 2.0);
    let sec = &c["sections"][0];
    assert!(els(&sec["conducteurs"]).len() == 2, "{}", dumps(&sec["conducteurs"]));
    assert!(els(&sec["ecartes"]).len() == 1, "{}", dumps(&sec["ecartes"]));
    assert!(t(&sec["ecartes"][0]["raison"]).contains("chevauche"), "{}", dumps(&sec["ecartes"]));
    assert!(els(&c["paires"]).len() == 1, "{:?}", nets_de(&c["paires"], "net_voisin"));
}

/// Une victime en PLUSIEURS troncons, et ce qui longe chacun d'eux.
pub fn _essai_chaleur(objets: Vec<Json>, voisinage: Vec<Json>, paires: Option<Json>, tr: f64, gap: f64) -> Json {
    let objets = objets.iter().map(|o| avec(o, &[("gap_left", gap.j()), ("gap_right", gap.j())])).collect();
    let mut doc = _doc_couplage_p(objets, voisinage, None, paires);
    poser(dans(&mut doc, "analyse"), "temps_montee", tr);
    sim(&doc)["couplage"].clone()
}

/// `_essai_chaleur(objets, voisinage)` aux valeurs par defaut du Python.
pub fn chaleur_de(objets: Vec<Json>, voisinage: Vec<Json>, paires: Option<&str>) -> Json {
    _essai_chaleur(objets, voisinage, paires.map(j), 25e-12, 2.0)
}

/// `[x for x in c["chaleur"] if x]`
pub fn peints(c: &Json) -> Vec<&Json> {
    els(&c["chaleur"]).iter().filter(|x| x.vrai()).collect()
}

/// `[d for d in sec["conducteurs"] if d["garde"]]`
pub fn gardes_de(sec: &Json) -> Vec<&Json> {
    els(&sec["conducteurs"]).iter().filter(|d| d["garde"].vrai()).collect()
}

/// Une piste avec ses deux ecarts a la masse.
pub fn avec_gaps(o: Json, gauche: f64, droite: f64) -> Json {
    avec(&o, &[("gap_left", gauche.j()), ("gap_right", droite.j())])
}

/// Le couplage d'un document, le temps de montee pose dans `analyse` s'il est donne.
pub fn couplage_de(mut doc: Json, tr: Option<f64>) -> Json {
    if let Some(tr) = tr {
        poser(dans(&mut doc, "analyse"), "temps_montee", tr);
    }
    sim(&doc)["couplage"].clone()
}

/// Trois troncons de dix millimetres, l'agresseur se rapproche a chacun.
fn _victime_a_ecart_variable() -> Json {
    let victime = vec![_pis(0.0, 0.0, 10.0, 0.0, "SIG"), _pis(10.0, 0.0, 20.0, 0.0, "SIG"),
                       _pis(20.0, 0.0, 30.0, 0.0, "SIG")];
    let voisinage = vec![_pis(0.0, 1.05, 10.0, 1.05, "AGR"),      // ecart 0,80
                         _pis(10.0, 0.65, 20.0, 0.65, "AGR"),     // ecart 0,40
                         _pis(20.0, 0.37, 30.0, 0.37, "AGR")];    // ecart 0,12
    chaleur_de(victime, voisinage, None)
}

/// LA CARTE SE LIT PAR LE RANG, comme les segments.
///
/// C'est par cet alignement que la page retrouve le cuivre a peindre : un
/// enregistrement de plus ou de moins, et elle peint la couleur d'un troncon
/// sur son voisin.
fn la_chaleur_est_alignee_sur_les_troncons_envoyes() {
    let c = _victime_a_ecart_variable();
    assert!(els(&c["chaleur"]).len() == 3, "{} entrees", els(&c["chaleur"]).len());
    assert!(els(&c["chaleur"]).iter().all(|x| !nul(x)), "{}", dumps(&c["chaleur"]));

    // UN TRONCON QUI NE LONGE RIEN VAUT None, ET PAS ZERO : « rien ne couple
    // ici » et « je n'en sais rien » ne se peignent pas pareil.
    let victime = vec![_pis(0.0, 0.0, 10.0, 0.0, "SIG"), _pis(10.0, 0.0, 20.0, 0.0, "SIG")];
    let seul = chaleur_de(victime, vec![_pis(0.0, 0.65, 10.0, 0.65, "AGR")], None);
    assert!(!nul(&seul["chaleur"][0]), "le troncon qui longe n'est pas peint");
    assert!(nul(&seul["chaleur"][1]),
            "un troncon qui ne longe rien porte une valeur : {}", dumps(&seul["chaleur"][1]));
}

/// « MA PAIRE EST-ELLE A 100 OHMS SUR TOUTE SA LONGUEUR ? »
///
/// Le tableau repond par un chiffre, obtenu sur l'ecart moyen. La carte
/// reprend chaque troncon a SON ecart -- et c'est la que se voit un
/// ecartement qui derive.
fn la_z_diff_est_reprise_a_l_ecart_de_chaque_troncon() {
    let paire = vec![_pis(0.0, 0.0, 10.0, 0.0, "USB_P"), _pis(10.0, 0.0, 20.0, 0.0, "USB_P")];
    let vois = vec![_pis(0.0, 0.40, 10.0, 0.40, "USB_N"),         // ecart 0,15
                    _pis(10.0, 0.65, 20.0, 0.65, "USB_N")];       // ecart 0,40
    let c = chaleur_de(paire, vois, Some(r#"[["USB_P", "USB_N"]]"#));
    let z: Vec<&Json> = els(&c["chaleur"]).iter().map(|x| &x["z_diff"]).collect();
    assert!(z.iter().all(|v| !nul(v)), "{}", dumps(&c["chaleur"]));
    assert!(n(z[1]) > n(z[0]),
            "l'ecart double et Z_diff ne monte pas : {} {}", n(z[0]), n(z[1]));
    assert!(els(&c["chaleur"]).iter().all(|x| t(&x["z_diff_net"]) == "USB_N"), "{}", dumps(&c["chaleur"]));
    assert!(els(&c["chaleur"]).iter().all(|x| x["z_diff_declare"].vrai()),
            "une paire declaree n'est pas signalee comme telle");

    // SANS PAIRE DECLAREE NI SUFFIXE, on peint quand meme -- la voisine la plus
    // proche -- et l'on DIT que ce n'en est pas une. Peindre du gris priverait
    // d'un renseignement juste ; le peindre en silence ferait croire a une
    // paire qui n'existe pas.
    let quelconque = vec![_pis(0.0, 0.0, 10.0, 0.0, "CLK"), _pis(10.0, 0.0, 20.0, 0.0, "CLK")];
    let v2 = vec![_pis(0.0, 0.40, 10.0, 0.40, "CLKB"), _pis(10.0, 0.65, 20.0, 0.65, "CLKB")];
    let c2 = chaleur_de(quelconque.clone(), v2.clone(), None);
    assert!(!nul(&c2["chaleur"][0]["z_diff"]), "rien n'est peint");
    assert!(!c2["chaleur"][0]["z_diff_declare"].vrai(),
            "une voisine quelconque est donnee pour une paire declaree");

    // ET LA PAGE PEUT LA DECLARER : c'est le meme champ que celui de l'editeur,
    // et le serveur ne fait pas de difference.
    let c3 = chaleur_de(quelconque, v2, Some(r#"[["CLK", "CLKB"]]"#));
    assert!(c3["chaleur"][0]["z_diff_declare"].vrai(),
            "une paire declaree a la main n'est pas reconnue");
}

/// LE DEFAUT QUI FAISAIT PERDRE SIX LONGEMENTS POUR DEUX CONDUCTEURS.
///
/// `ligne_mom` elargit chaque ruban de la correction de Wheeler avant de
/// resoudre. Deux voisines separees de trente-sept microns de cuivre nu s'y
/// rejoignent, et `_conducteurs_places` levait -- ce qui perdait TOUS les
/// longements de la section, y compris ceux de voisines qui n'avaient rien a
/// voir avec la collision. On mesure donc avant de poser, avec la meme
/// correction, et l'on ecarte la voisine de trop EN LE DISANT.
fn deux_voisines_jointives_n_emportent_plus_la_section() {
    // Six voisines ; N4 (a 1,187) et N2 (a 0,94) laissent 0,037 mm de cuivre
    // nu entre elles, moins que ce que l'epaisseur ajoute.
    let voisinage: Vec<Json> = [0.42, -0.42, 0.94, -0.94, 1.227, -1.45].iter().enumerate()
        .map(|(k, &y)| _pis(0.0, y, 20.0, y, &format!("N{}", k))).collect();
    let c = chaleur_de(vec![_pis(0.0, 0.0, 20.0, 0.0, "SIG")], voisinage, None);
    let sec = &c["sections"][0];
    assert!(!sec["raison"].vrai(),
            "la section entiere est perdue : {}", dumps(&sec["raison"]));
    let chiffres = els(&c["paires"]).iter().filter(|f| !f["raison"].vrai()).count();
    assert!(chiffres == 5,
            "{} longements chiffres au lieu de 5", chiffres);
    let ecartes = els(&sec["ecartes"]);
    assert!(ecartes.len() == 1, "{}", dumps(&sec["ecartes"]));
    assert!(t(&ecartes[0]["net"]) == "N4", "{}", dumps(&sec["ecartes"]));
    assert!(t(&ecartes[0]["raison"]).contains("cuivre epaissi"), "{}", dumps(&sec["ecartes"]));
    // ET LA RAISON PORTE LE CHIFFRE : « trop proches » sans dire de combien ne
    // se corrige pas sur un routage.
    assert!(t(&ecartes[0]["raison"]).contains("0.037"), "{}", t(&ecartes[0]["raison"]));
}

/// UNE CARTE PLATE PLUTOT QU'UN CALCUL SANS FIN.
///
/// Une piste de cinquante troncons a cinquante ecarts differents demanderait
/// cinquante resolutions de section. On plafonne, et au-dela l'on retombe sur
/// le couplage moyen : la carte devient plate sur la fin, elle ne devient
/// jamais fausse -- la somme vaut toujours le bruit de la fiche.
fn le_plafond_de_sections_locales_tient() {
    let nb = MAX_SECTIONS_LOCALES + 8;
    let victime: Vec<Json> = (0..nb).map(|i| _pis(i as f64, 0.0, i as f64 + 1.0, 0.0, "SIG")).collect();
    let voisinage: Vec<Json> = (0..nb).map(|i| _pis(i as f64, 0.35 + 0.03 * i as f64, i as f64 + 1.0, 0.35 + 0.03 * i as f64, "AGR"))
        .collect();
    let c = chaleur_de(victime, voisinage, None);
    assert!(n(&c["sections_locales"]) <= MAX_SECTIONS_LOCALES as f64,
            "{} resolutions locales", n(&c["sections_locales"]));
    assert!(peints(&c).len() == nb,
            "tous les troncons ne sont pas peints");
    // ET AU-DELA DU PLAFOND, LA Z DIFFERENTIELLE MANQUE PLUTOT QUE DE
    // MENTIR : la cellule est peinte, sa geometrie est la, et son ohm est
    // None. Une valeur reprise d'un autre ecart serait un chiffre faux et
    // propre.
    let chiffrees = peints(&c).iter().filter(|x| x["z_diff"].vrai()).count();
    assert!(0 < chiffrees && chiffrees < nb,
            "{} troncons chiffres sur {} : le plafond ne mord pas", chiffrees, nb);
}

/// LE DEFAUT LE PLUS COUTEUX DE CETTE PAGE, ET IL ETAIT INVISIBLE.
///
/// Les deux pages mesurent l'ecart de la SELECTION au cuivre de masse, cote
/// par cote. Quand une voisine se trouve PLUS LOIN que la ou ce cuivre
/// commence, il y a du plan entre les deux -- c'est le geste de routage le
/// plus banal : on glisse une garde, ou du plan arrose cousu de vias, entre un
/// signal rapide et son voisin.
///
/// Or `_ecarts_masse_du_groupe` place la masse au BORD du groupe. Elle passait
/// donc de l'autre cote de la voisine, l'ecart calcule devenait negatif, on le
/// ramenait a zero -- et la section se resolvait comme DEUX PISTES FACE A FACE
/// au-dessus du dielectrique nu, sans la masse qui, sur la carte, faisait tout
/// le travail. Le couplage annonce etait celui d'un routage qu'on n'avait pas
/// fait, et rien dans la fiche ne le disait.
fn la_masse_interposee_entre_dans_la_section() {
    // La selection porte de la masse a 0,2 mm de chaque bord ; la voisine est
    // a 2,0 mm : il y a donc 1,4 mm de cuivre de masse entre les deux.
    let victime = avec_gaps(_pis(0.0, 0.0, 20.0, 0.0, "SIG"), 0.2, 0.2);
    let voisine = avec_gaps(_pis(0.0, 2.0, 20.0, 2.0, "AGR"), 0.2, 0.2);
    let c = couplage_de(_doc_couplage(vec![victime], vec![voisine]), Some(100e-12));

    let sec = &c["sections"][0];
    let gardes = gardes_de(sec);
    assert!(gardes.len() == 1,
            "la masse interposee n'est pas posee : {}", dumps(&sec["conducteurs"]));
    let g = gardes[0];
    assert!(g["interposee"].vrai(),
            "elle est posee mais pas signalee comme deduite : {}", dumps(g));
    assert!(t(&g["net"]) == "GND", "{}", dumps(g));
    // ELLE EST ENTRE LES DEUX, et elle occupe la place qui reste entre les deux
    // degagements : 2,0 - 0,105 - 0,2 - (0,105 + 0,2) = 1,39 mm, moins ce que
    // l'epaisseur du cuivre ajoutera.
    assert!(-2.0 < n(&g["x"]) && n(&g["x"]) < 0.0, "la garde n'est pas entre les deux : {}", dumps(g));
    assert!(1.2 < n(&g["largeur"]) && n(&g["largeur"]) < 1.4, "largeur de garde : {}", n(&g["largeur"]));

    // ET LES DEUX PISTES CESSENT DE SE VOIR. C'est tout l'objet : la masse
    // interposee prend le champ qu'elles se passaient, et cela se lit sur
    // la CAPACITE MUTUELLE -- la grandeur qui porte le couplage, et la
    // seule que ce test puisse lire maintenant que le bruit n'est plus
    // chiffre ici. Z_diff, elle, ne conclut rien : la garde baisse aussi
    // les deux Z0, et les deux effets se compensent en partie.
    let nu = couplage_de(_doc_couplage(vec![_pis(0.0, 0.0, 20.0, 0.0, "SIG")],
                                       vec![_pis(0.0, 2.0, 20.0, 2.0, "AGR")]), Some(100e-12));
    let avec_m = n(&c["paires"][0]["c_mutuelle"]).abs();
    let sans = n(&nu["paires"][0]["c_mutuelle"]).abs();
    assert!(avec_m < sans / 1.5,
            "la masse interposee ne decouple pas : C_m {} contre {}", fmt_g(avec_m, 4), fmt_g(sans, 4));
}

/// LA VOISINE PLUS PROCHE QUE LA MASSE N'EST PAS PROTEGEE, et il ne faut
/// surtout pas lui inventer un bouclier.
///
/// C'est le cas ordinaire du bus serre : deux signaux cote a cote, le plan
/// commence au-dela. Le modele d'avant etait juste dans ce cas-la, et il doit
/// le rester -- une correction qui repare un cas en cassant l'autre n'est pas
/// une correction.
fn rien_ne_s_interpose_quand_la_voisine_est_devant_la_masse() {
    let victime = avec_gaps(_pis(0.0, 0.0, 20.0, 0.0, "SIG"), 0.6, 0.6);
    let voisine = avec_gaps(_pis(0.0, 0.5, 20.0, 0.5, "AGR"), 0.6, 0.6);
    let c = couplage_de(_doc_couplage(vec![victime], vec![voisine]), None);
    let sec = &c["sections"][0];
    assert!(gardes_de(sec).is_empty(),
            "une garde est inventee entre deux pistes qui se touchent presque : {}",
            dumps(&sec["conducteurs"]));

    // ET SANS MASSE DU TOUT DE CE COTE, on n'en invente pas davantage : un
    // ecart nul veut dire « pas de plan a portee », pas « plan colle ».
    let v2 = avec_gaps(_pis(0.0, 0.0, 20.0, 0.0, "SIG"), 0.0, 0.0);
    let c2 = couplage_de(_doc_couplage(vec![v2], vec![_pis(0.0, 2.0, 20.0, 2.0, "AGR")]), None);
    assert!(gardes_de(&c2["sections"][0]).is_empty(), "une garde sort d'un ecart nul");
}

/// PERDRE LE LONGEMENT POUR AVOIR POSE SON BOUCLIER remplacerait une
/// reponse fausse par une absence de reponse, ce qui n'est pas un progres.
///
/// La garde est retrecie de ce que l'epaisseur du cuivre lui ajoutera, et si
/// la voisine ne tient toujours pas apres, on retire la garde plutot que la
/// voisine.
fn la_garde_ne_coute_jamais_la_voisine_qu_elle_protege() {
    let victime = avec_gaps(_pis(0.0, 0.0, 20.0, 0.0, "SIG"), 0.06, 0.06);
    let voisine = avec_gaps(_pis(0.0, 0.42, 20.0, 0.42, "AGR"), 0.06, 0.06);
    let c = couplage_de(_doc_couplage(vec![victime], vec![voisine]), None);
    let sec = &c["sections"][0];
    assert!(!sec["raison"].vrai(), "la section est perdue : {}", dumps(&sec["raison"]));
    let ports = els(&sec["conducteurs"]).iter().filter(|d| !d["garde"].vrai()).count();
    assert!(ports == 2,
            "la voisine a ete perdue au profit de sa garde : {}",
            dumps(&sec["conducteurs"]));
    assert!(els(&c["paires"]).len() == 1 && !c["paires"][0]["raison"].vrai(), "{}", dumps(&c["paires"]));
}

/// UNE VOISINE DESSINEE A REBOURS A SES DEUX ETIQUETTES ECHANGEES.
///
/// Chaque troncon porte ses deux ecarts nommes dans SON sens de parcours. Pour
/// savoir ou finit la masse interposee, il faut celui de la voisine qui REGARDE
/// la selection -- et lire le mauvais bord poserait une garde de travers une
/// piste sur deux, selon le sens ou le routeur l'a tracee.
fn l_ecart_de_la_voisine_se_lit_dans_SON_sens() {
    let victime = avec_gaps(_pis(0.0, 0.0, 20.0, 0.0, "SIG"), 0.2, 0.2);

    let largeur_garde = |voisine: Json| -> Option<f64> {
        let c = couplage_de(_doc_couplage(vec![victime.clone()], vec![voisine]), None);
        gardes_de(&c["sections"][0]).first().map(|g| n(&g["largeur"]))
    };

    // Meme piste, meme place, dessinee dans un sens puis dans l'autre. Ses
    // deux ecarts sont FRANCHEMENT differents : 0,2 mm d'un bord, 1,0 de
    // l'autre. Le modele doit lire le meme des deux dans les deux cas.
    let droit = avec_gaps(_pis(0.0, 2.0, 20.0, 2.0, "AGR"), 1.0, 0.2);
    let envers = avec_gaps(_pis(20.0, 2.0, 0.0, 2.0, "AGR"), 0.2, 1.0);

    let (a, b) = (largeur_garde(droit), largeur_garde(envers));
    let (Some(a), Some(b)) = (a, b) else { panic!("{:?} {:?}", a, b) };
    assert!((a - b).abs() < 1e-6,
            "la meme piste dessinee a rebours donne une autre garde : {:.4} puis\
             \x20{:.4}", a, b);
}

/// LE PARTENAIRE DECLARE SORT DE LA CARTE, ET LUI SEUL.
///
/// Une paire nommee par ses suffixes -- USB_DP / USB_DN -- couple fort : la
/// section rend une dizaine de pour cent de NEXT a 0,15 mm. Ce n'est pas du
/// bruit sur USB_DP, c'est sa propre paire. La fiche garde la ligne, marquee ;
/// la carte de chaleur, elle, ne doit rien lui compter, sans quoi le vrai
/// agresseur d'a cote disparait sous la couleur.
///
/// ET LA VOISINE ORDINAIRE RESTE COMPTEE : c'est la moitie de l'essai. Une
/// exclusion qui emporterait aussi SPI_CLK ne serait pas une correction, ce
/// serait un trou.
fn le_partenaire_declare_nest_pas_peint_comme_un_agresseur() {
    let c = couplage_de(_doc_couplage(vec![_pis(0.0, 0.0, 25.0, 0.0, "USB_DP")],
                                      vec![_pis(0.0, 0.4, 25.0, 0.4, "USB_DN"),
                                           _pis(0.0, -0.65, 25.0, -0.65, "SPI_CLK")]), Some(150e-12));

    assert!(paire_de(&c, "USB_DN")["differentielle"].vrai(), "USB_DP / USB_DN doit etre reconnue comme paire");
    assert!(n(&paire_de(&c, "USB_DN")["z_diff"]) > 0.0,
            "la paire doit avoir une Z differentielle : {}", dumps(paire_de(&c, "USB_DN")));

    let peints = peints(&c);
    assert!(!peints.is_empty(), "la carte de chaleur est vide");
    let cellule = peints[0];
    // LA Z DIFFERENTIELLE PEINTE EST CELLE DE LA PAIRE DECLAREE, et non
    // celle de la voisine la plus proche : c'est la declaration qui
    // tranche, pas la distance.
    assert!(cellule["z_diff"].vrai() && cellule["z_diff_declare"].vrai(),
            "la Z differentielle de la paire declaree doit etre sur la carte");
    assert!(t(&cellule["z_diff_net"]) == "USB_DN", "{}", t(&cellule["z_diff_net"]));
    assert!(cellule["z_diff"].vrai() && cellule["z_diff_declare"].vrai(), "la Z differentielle de la paire declaree doit rester sur la carte");
}

/// LE REPLI « LA PLUS PROCHE » NE FAIT PAS UNE PAIRE.
///
/// `_chaleur_scene` retient la voisine la plus proche pour y peindre une Z
/// differentielle, faute de paire declaree. C'est un renseignement utile, et
/// ce n'est PAS une declaration : exclure son bruit ferait disparaitre en
/// silence l'agresseur le plus serre de la carte, c'est-a-dire exactement
/// celui qu'on cherche.
fn la_voisine_proche_non_declaree_reste_un_agresseur() {
    let c = couplage_de(_doc_couplage(vec![_pis(0.0, 0.0, 25.0, 0.0, "SIG")],
                                      vec![_pis(0.0, 0.4, 25.0, 0.4, "CLK")]), Some(150e-12));
    let f = &c["paires"][0];
    assert!(!f["differentielle"].vrai(), "SIG / CLK n'est pas une paire nommee");
    let peints = peints(&c);
    // LE REPLI PEINT SA Z DIFFERENTIELLE, ET IL SE DIT REPLI.
    assert!(t(&peints[0]["z_diff_net"]) == "CLK", "{}", dumps(peints[0]));
    assert!(!peints[0]["z_diff_declare"].vrai(),
            "le repli ne doit pas se donner pour une paire declaree");
}

/// LE CRITERE EST UNE LONGUEUR D'ONDE, PAS UN NOMBRE DE VIAS.
///
/// Une couture tous les dix millimetres tient pour un front lent et ne tient
/// plus pour un front rapide : c'est lambda/10 a la frequence du genou, donc
/// proportionnel au temps de montee. Un seuil fixe en millimetres serait faux
/// d'un facteur dix entre du 74HC et du LVDS.
fn le_seuil_de_couture_suit_le_temps_de_montee() {
    let lent = _couture_max(2e-9);
    let rapide = _couture_max(100e-12);
    proche(lent / rapide, 20.0, 1e-9,
           "le seuil doit etre proportionnel au temps de montee");
    // Ordre de grandeur : 6,4 mm pour 150 ps sur stratifie courant.
    proche(_couture_max(150e-12), 6.43, 0.02, "seuil a 150 ps");
}

/// LE REPLI EST DU BON COTE, et ce n'est pas un detail.
///
/// Une page qui n'envoie pas la couture -- un outil plus ancien, un document
/// ecrit a la main -- ne doit pas voir TOUT son cuivre de masse declare
/// flottant : elle verrait le bruit doubler partout sans avoir rien change.
/// Zero veut donc dire « pas mesure », et l'on suppose tenu.
fn sans_mesure_de_couture_le_cuivre_reste_suppose_tenu() {
    let pis = |y: f64, net: &str, w: f64| avec_gaps(_pis_l(0.0, y, 25.0, y, net, 0, w), 0.5, 0.5);
    let mut doc = _doc_couplage(vec![pis(0.0, "SIG", 0.25)],
                                vec![pis(0.6, "GND", 0.35), pis(1.2, "AGR", 0.25)]);
    poser(dans(&mut doc, "analyse"), "temps_montee", 150e-12);
    let r = sim(&doc);
    let gardes = gardes_de(&r["couplage"]["sections"][0]);
    assert!(!gardes.is_empty() && !gardes[0]["flottant"].vrai(),
            "sans mesure, le cuivre doit rester suppose TENU : {:?}", gardes.iter().map(|g| dumps(g)).collect::<Vec<_>>());
    assert!(!avertis(&r).iter().any(|a| a.contains("COUS")),
            "et rien ne doit etre signale");
}

/// LA MEME REGLE POUR LE PLAN ARROSE EXTERIEUR QUE POUR UNE GARDE.
///
/// `_ecarts_masse_du_groupe` rendait l'ecart au cuivre lateral sans jamais
/// regarder ses vias : le solveur posait donc ce plan a ZERO VOLT PARFAIT,
/// qu'il porte une couture au millimetre ou aucune sur trente. Le defaut ne
/// sortait qu'en texte -- les ohms et les decibels, eux, ne bougeaient pas,
/// et c'est le chiffre qu'on lit.
///
/// L'ecart du cote mal cousu est donc mis a ZERO, ce que `ligne_mom` lit
/// « pas de masse coplanaire ici » : le calcul cesse de faire cadeau d'un
/// blindage que la carte n'a pas. Un bord dont l'ecart etait DEJA nul -- le
/// groupe s'etend au-dela du cuivre trouve par la sonde -- ne perd rien, et
/// ne se compte pas.
fn le_plan_qui_borde_ne_compte_que_s_il_est_cousu() {
    let pis = |y: f64, net: &str, couture: f64| {
        let mut o = avec_gaps(_pis(0.0, y, 25.0, y, net), 0.2, 0.2);
        if couture != 0.0 {
            poser(&mut o, "couture_left", couture);
            poser(&mut o, "couture_right", couture);
        }
        o
    };

    let essai = |couture: f64| {
        let mut doc = _doc_couplage(vec![pis(0.0, "SIG", couture)], vec![pis(0.5, "AGR", 0.0)]);
        poser(dans(&mut doc, "analyse"), "temps_montee", 100e-12);
        sim(&doc)
    };

    let cousu = essai(0.4);
    let nu = essai(30.0);
    let sec_c = &cousu["couplage"]["sections"][0];
    let sec_n = &nu["couplage"]["sections"][0];
    assert!(!sec_c["masse_non_cousue"].vrai(), "{}", dumps(&sec_c["masse_non_cousue"]));
    // L'AGRESSEUR EST D'UN SEUL COTE : le groupe s'etend de ce cote-la, l'ecart
    // y etait deja nul, et c'est donc UN SEUL bord qui perd sa masse.
    assert!(sec_n["masse_non_cousue"] == vec!["droite"].j(), "{}", dumps(&sec_n["masse_non_cousue"]));
    assert!(n(&sec_c["ecart_d"]) > 0.0 && n(&sec_n["ecart_d"]) == 0.0,
            "l'ecart du bord mal cousu doit tomber a zero : {} -> {}",
            n(&sec_c["ecart_d"]), n(&sec_n["ecart_d"]));
    let z_c = n(&cousu["couplage"]["paires"][0]["z_diff"]);
    let z_n = n(&nu["couplage"]["paires"][0]["z_diff"]);
    assert!(z_n > z_c,
            "sans masse coplanaire a portee, la Z differentielle MONTE :\
             \x20{:.2} contre {:.2}", z_n, z_c);
    assert!(avertis(&nu).iter().any(|a| a.contains("PLAN ARROSÉ NON COUSU")),
            "{:?}", avertis(&nu));
}

/// LES MANQUES, EN UN SEUL ENDROIT, AVEC LEUR SENS.
///
/// Chacun est deja dit plus haut, la ou il se produit : le couplage entre
/// couches sous la regle d'appariement, la resonance sous la couture, les
/// rebonds sous les terminaisons. Il faut donc lire les douze hypotheses pour
/// se faire une idee de ce qui reste dehors, et personne ne le fait.
///
/// ET LE SENS EST LE VRAI APPORT. Les QUATRE manques rendent le chiffre
/// OPTIMISTE : ce qui est affiche est un PLANCHER sur une carte mal terminee,
/// mal cousue, ou routee en parallele sur deux couches adossees. Cela ne se
/// deduit d'aucune hypothese prise isolement, et c'est pourtant la seule chose
/// qu'il faut savoir avant de signer.
///
/// LE QUATRIEME A CHANGE DE NATURE, et le banc doit le suivre : le couplage
/// entre couches etait « ABSENT, ni majore ni minore, simplement pas vu ». Il
/// est desormais VU -- la geometrie est cherchee et rendue dans `superposes`
/// -- sans etre chiffre, ce qui n'est pas la meme chose et n'a pas le meme
/// sens. Un manque qu'on ne voit pas ne penche d'aucun cote ; un manque qu'on
/// voit penche du cote rassurant, et il faut le dire.
fn ce_que_le_calcul_ne_couvre_pas_est_rassemble_et_oriente() {
    let doc = _doc_couplage(vec![_pis(0.0, 0.0, 25.0, 0.0, "SIG")],
                            vec![_pis(0.0, 0.5, 25.0, 0.5, "AGR")]);
    let r = sim(&doc);
    let dits: Vec<&str> = els(&r["couplage"]["hypotheses"]).iter().map(t).collect();
    let cloture: Vec<&str> = dits.iter().copied().filter(|h| h.contains("NE COUVRE PAS")).collect();
    assert!(cloture.len() == 1, "il faut UNE ligne de cloture, pas {}", cloture.len());
    let bloc = cloture[0];
    for attendu in ["RÉSONANCE", "COUPLAGE ENTRE"] {
        assert!(bloc.contains(attendu), "le bloc de cloture ne dit pas {:?}", attendu);
    }
    assert!(bloc.matches("OPTIMISTE").count() == 2,
            "chaque manque doit dire dans quel sens il penche : {} fois\
             \x20OPTIMISTE", bloc.matches("OPTIMISTE").count());
    assert!(bloc.contains("VU mais NON CHIFFRÉ") && bloc.contains("PLANCHER"),
            "le bloc doit dire que le chiffre est un plancher, et que le couplage\
             \x20entre couches est vu sans etre chiffre : {}", bloc);
    // ET C'EST LA DERNIERE : une cloture au milieu ne cloture rien.
    assert!(dits[dits.len() - 1] == bloc, "le bloc de cloture doit fermer la liste");
}

pub fn banc() {
    titre("Les lignes couplees : les invariants de la matrice de Maxwell");
    T("la pose d'une triplaque elargit comme le solveur", la_pose_d_une_triplaque_elargit_comme_le_solveur);
    titre("L'appariement des troncons paralleles");
    T("deux pistes qui se longent sont appariees", deux_pistes_qui_se_longent_sont_appariees);
    T("ce qui ne longe pas est ecarte", ce_qui_ne_longe_pas_est_ecarte);
    T("ce qui longe par-dessus est vu sans etre chiffre", ce_qui_longe_par_dessus_est_vu_sans_etre_chiffre);
    T("le decalage entre couches se compte de cuivre a cuivre", le_decalage_entre_couches_se_compte_de_cuivre_a_cuivre);
    T("un croisement entre couches ne se signale pas", un_croisement_entre_couches_ne_se_signale_pas);
    T("le recouvrement partiel compte pour ce qu'il est", le_recouvrement_partiel_compte_pour_ce_quil_est);
    T("les longements d'un meme net se cumulent", les_longements_dun_meme_net_se_cumulent);
    T("la paire differentielle se nomme", la_paire_differentielle_se_nomme);
    T("le pire longement vient en tete", le_pire_longement_vient_en_tete);
    T("le temps de montee se deduit de la bande", le_temps_de_montee_se_deduit_de_la_bande);
    T("sans voisinage, le reste du calcul tient", sans_voisinage_il_ny_a_pas_de_couplage_et_ce_nest_pas_une_erreur);
    titre("La scene couplee : plusieurs voisines, le plan et la garde");
    T("les voisines entrent dans une seule section", les_voisines_entrent_dans_une_seule_section);
    T("le plan coplanaire borde le groupe, pas la seule piste", le_plan_coplanaire_borde_le_groupe);
    T("une piste du net de masse est une garde, pas un agresseur", une_piste_du_net_de_masse_est_une_garde);
    T("Z_diff d'une paire dans un bus tient les autres a la masse", z_diff_dans_un_bus_tient_les_autres_a_la_masse);
    T("ce qui ne tient pas dans la section est nomme", ce_qui_ne_tient_pas_dans_la_section_est_nomme);
    titre("La carte de chaleur du couplage");
    T("la chaleur est alignee sur les troncons envoyes", la_chaleur_est_alignee_sur_les_troncons_envoyes);
    T("la Z differentielle est reprise a l'ecart de chaque troncon", la_z_diff_est_reprise_a_l_ecart_de_chaque_troncon);
    T("deux voisines jointives n'emportent plus la section", deux_voisines_jointives_n_emportent_plus_la_section);
    T("le plafond de sections locales tient", le_plafond_de_sections_locales_tient);
    T("la masse interposee entre dans la section", la_masse_interposee_entre_dans_la_section);
    T("rien ne s'interpose quand la voisine est devant la masse", rien_ne_s_interpose_quand_la_voisine_est_devant_la_masse);
    T("la garde ne coute jamais la voisine qu'elle protege", la_garde_ne_coute_jamais_la_voisine_qu_elle_protege);
    T("l'ecart de la voisine se lit dans SON sens", l_ecart_de_la_voisine_se_lit_dans_SON_sens);
    titre("Ce que la carte de Z differentielle peint");
    T("le partenaire declare n'est pas peint comme un agresseur", le_partenaire_declare_nest_pas_peint_comme_un_agresseur);
    T("la voisine proche non declaree reste un agresseur", la_voisine_proche_non_declaree_reste_un_agresseur);
    titre("La couture du cuivre de masse");
    T("le seuil de couture suit le temps de montee", le_seuil_de_couture_suit_le_temps_de_montee);
    T("sans mesure de couture, le cuivre reste suppose tenu", sans_mesure_de_couture_le_cuivre_reste_suppose_tenu);
    T("le plan qui borde ne compte que s'il est cousu", le_plan_qui_borde_ne_compte_que_s_il_est_cousu);
    titre("Ce que le calcul ne couvre pas");
    T("ce que le calcul ne couvre pas est rassemble, et oriente", ce_que_le_calcul_ne_couvre_pas_est_rassemble_et_oriente);
}
