//! Banc d'essai du solveur resistif DC : le portage de python/test/banc-dc.py, cas pour cas
//! (58), memes valeurs etalons, memes tolerances.
//!
//!     cargo test -p dc_solver --test banc_dc -- --nocapture      (pour lire les chiffres)
//!
//! POURQUOI CE BANC EXISTE. La premiere version de dc_solver.py rendait un
//! potentiel identiquement NUL sur toute la carte, en silence : elle passait un
//! argument retire de SciPy, rattrapait le TypeError, et remplacait le resultat
//! par des zeros. Rien ne l'a vu, parce que rien ne mesurait. Zero volt de chute
//! est le pire des faux resultats : il a l'air d'une bonne nouvelle.
//!
//! Ce que ce banc verifie est donc, d'abord, que le chiffre EST le bon -- contre
//! rho*L/(W*t), qui se pose a la main -- et ensuite que les refus sont des
//! refus : un probleme flottant doit lever, pas rendre zero.
//!
//! Les documents sont ecrits en JSON et relus (`loads`), comme les dict du banc Python ; un
//! flottant ecrit par « {:?} » se relit a l'identique. Deux etalons que le banc Python tirait
//! a l'execution sont figes ici : les vingt polygones de random.Random(7)
//! (tests/polygones_alea.json) et la valeur que donnaient scipy.special.k0 et k1.

use dc_solver::*;
use std::f64::consts::PI;

fn j(texte: &str) -> Json {
    loads(texte).unwrap_or_else(|e| panic!("{e} : {texte}"))
}

fn f(v: &Json) -> f64 {
    v.as_f64().unwrap_or_else(|| panic!("un nombre attendu : {v:?}"))
}

fn liste(v: &Json) -> &Vec<Json> {
    v.as_liste().unwrap_or_else(|| panic!("une liste attendue : {v:?}"))
}

fn nombres(v: &Json) -> Vec<f64> {
    liste(v).iter().map(f).collect()
}

fn maxi(v: impl IntoIterator<Item = f64>) -> f64 {
    v.into_iter().fold(f64::NEG_INFINITY, f64::max)
}

fn mini(v: impl IntoIterator<Item = f64>) -> f64 {
    v.into_iter().fold(f64::INFINITY, f64::min)
}

fn document(texte: &str) -> Json {
    resoudre_document(&j(texte), None).unwrap_or_else(|e| panic!("refus inattendu : {} ({})", e.message, e.conseil))
}

/// resoudre_dc(polygones, sources=..., references=..., vias=..., pas=..., rho=...)
fn resoudre(polygones: &str, sources: &str, references: &str, vias: &str, pas: Option<f64>, rho: f64) -> Result<Json, ErreurDC> {
    let (s, r, v) = (j(sources), j(references), j(vias));
    resoudre_dc(&j(polygones), &Entrees { sources: Some(&s), references: Some(&r), vias: Some(&v), pas, rho, ..Entrees::default() }, None)
}

fn rectangle(x0: f64, y0: f64, x1: f64, y1: f64, couche: i64, net: &str, epaisseur: f64) -> String {
    format!(
        r#"{{"vertices": [[{x0:?}, {y0:?}], [{x1:?}, {y0:?}], [{x1:?}, {y1:?}], [{x0:?}, {y1:?}]],
            "couche": {couche}, "net": "{net}", "epaisseur": {epaisseur:?}}}"#
    )
}

/// Un barreau, courant injecte a un bout, reference a l'autre.
///
/// LES DEUX BOUTS SONT PRIS SUR TOUTE LA LARGEUR ET SUR UNE SEULE COLONNE
/// de carreaux -- d'ou la `boite` plutot qu'un rayon. Un disque assez large
/// pour couvrir la largeur deborde aussi EN LONGUEUR : il court-circuite les
/// premieres colonnes et raccourcit le barreau, ce qui se lit comme une
/// resistance trop faible. Une pastille est un rectangle ; le solveur sait
/// donc prendre un rectangle.
fn barreau(longueur: f64, largeur: f64, epaisseur: f64, courant: f64, pas: f64) -> Json {
    let demi = pas / 2.0;
    resoudre(
        &format!("[{}]", rectangle(0.0, 0.0, longueur, largeur, 0, "VCC", epaisseur)),
        &format!(r#"[{{"couche": 0, "net": "VCC", "courant": {courant:?}, "boite": [{:?}, {:?}, {demi:?}, {:?}]}}]"#, -demi, -demi, largeur + demi),
        &format!(
            r#"[{{"couche": 0, "net": "VCC", "tension": 0.0, "boite": [{:?}, {:?}, {:?}, {:?}]}}]"#,
            longueur - 3.0 * demi,
            -demi,
            longueur + demi,
            largeur + demi
        ),
        "[]",
        Some(pas),
        RESISTIVITE_CUIVRE,
    )
    .unwrap()
}

fn chute(r: &Json, net: &str) -> f64 {
    f(&r["chute_par_net"][net])
}

// -----------------------------------------------------------------------------
// 1. LE CHIFFRE, contre la formule qu'on pose a la main
// -----------------------------------------------------------------------------

/// Un barreau de cuivre : dV = I * rho * L / (W * t), et rien d'autre.
///
/// C'est LA verification du banc. La trame carree rend exactement la
/// resistance de couche -- la conductance d'une arete vaut sigma*t quel que
/// soit le pas --, donc le seul ecart possible vient de la distance entre les
/// CENTRES des colonnes d'extremite, pas de la longueur du polygone.
#[test]
fn un_barreau_de_cuivre_rend_exactement_sa_resistance_de_couche() {
    let (l, w, t, i) = (20e-3, 2e-3, 35e-6, 1.0);
    let pas = 0.2e-3;
    let r = barreau(l, w, t, i, pas);
    let obtenu = chute(&r, "VCC");

    // La distance effective : du centre de la premiere colonne de noeuds au
    // centre de la derniere. Les noeuds sont poses tous les `pas` a partir de 0.
    let n_colonnes = (l / pas).round(); // x = 0 .. L-pas : le bord x = L
    let longueur_effective = (n_colonnes - 1.0) * pas; // tombe hors du polygone
    let largeur_effective = (w / pas).round() * pas;
    let attendu = i * RESISTIVITE_CUIVRE * longueur_effective / (largeur_effective * t);

    let ecart = (obtenu - attendu).abs() / attendu;
    assert!(ecart < 0.02, "{obtenu:.6} V contre {attendu:.6} V attendus, soit {:.2} %", 100.0 * ecart);
    println!("{} noeuds, {obtenu:.4} V contre {attendu:.4} V attendus, {:.3} %", r["n_noeuds"].as_i64().unwrap(), 100.0 * ecart);
}

/// Raffiner la trame ne DEPLACE pas le resultat : il est deja juste.
///
/// C'est la propriete qui distingue ce maillage d'une approximation : sur une
/// trame carree, la conductance d'arete ne depend pas du pas. Trois pas dans
/// un rapport de quatre doivent donner la meme chute a un pour cent pres, une
/// fois ramenee a la meme longueur effective.
#[test]
fn raffiner_la_trame_ne_deplace_pas_le_resultat() {
    let (l, w, t, i) = (10e-3, 1e-3, 35e-6, 1.0);
    for pas in [0.2e-3, 0.1e-3, 0.05e-3] {
        let r = barreau(l, w, t, i, pas);
        let longueur = ((l / pas).round() - 1.0) * pas;
        let largeur = (w / pas).round() * pas;
        let attendu = i * RESISTIVITE_CUIVRE * longueur / (largeur * t);
        let obtenu = chute(&r, "VCC");
        let ecart = (obtenu - attendu).abs() / attendu;
        assert!(ecart < 0.02, "pas {:.3} mm : {:.2} % d'ecart", pas * 1e3, 100.0 * ecart);
        println!("{:.2} mm : {obtenu:.4} V", pas * 1e3);
    }
}

/// Deux fois plus large, deux fois moins de chute. La loi d'Ohm, pas plus.
#[test]
fn deux_fois_plus_large_deux_fois_moins_de_chute() {
    let (l, t, i, pas) = (10e-3, 35e-6, 1.0, 0.1e-3);
    let etroit = chute(&barreau(l, 1e-3, t, i, pas), "VCC");
    let large = chute(&barreau(l, 2e-3, t, i, pas), "VCC");
    let rapport = etroit / large;
    assert!((rapport - 2.0).abs() < 0.05, "rapport {rapport:.4} au lieu de 2");
    println!("{etroit:.4} V contre {large:.4} V, rapport {rapport:.4}");
}

/// Deux fois plus epais, deux fois moins de chute.
#[test]
fn deux_fois_plus_epais_deux_fois_moins_de_chute() {
    let (l, w, i, pas) = (10e-3, 1e-3, 1.0, 0.1e-3);
    let mince = chute(&barreau(l, w, 35e-6, i, pas), "VCC");
    let epais = chute(&barreau(l, w, 70e-6, i, pas), "VCC");
    let rapport = mince / epais;
    assert!((rapport - 2.0).abs() < 0.02, "rapport {rapport:.4} au lieu de 2");
    println!("{mince:.4} V contre {epais:.4} V, rapport {rapport:.4}");
}

/// Un probleme LINEAIRE : doubler le courant double la chute, exactement.
#[test]
fn doubler_le_courant_double_la_chute_exactement() {
    let (l, w, t, pas) = (10e-3, 1e-3, 35e-6, 0.1e-3);
    let un = chute(&barreau(l, w, t, 1.0, pas), "VCC");
    let deux = chute(&barreau(l, w, t, 2.0, pas), "VCC");
    assert!((deux - 2.0 * un).abs() < 1e-9, "{deux:.9} contre {:.9}", 2.0 * un);
    println!("{un:.6} V et {deux:.6} V");
}

// -----------------------------------------------------------------------------
// 2. LA TOPOLOGIE : ce que le maillage surfacique voit et que le perimetre ne
//    voyait pas
// -----------------------------------------------------------------------------

/// DEUX chemins de cuivre en parallele : la moitie de la resistance.
///
/// C'est le cas que la version « reseau sur le perimetre » ne pouvait pas
/// traiter : elle faisait le tour de chaque forme au lieu de la traverser, et
/// deux formes accolees ne se voyaient pas.
#[test]
fn deux_polygones_accoles_ne_font_qu_un_seul_conducteur() {
    let (l, w, t, i, pas) = (10e-3, 1e-3, 35e-6, 1.0, 0.1e-3);
    let simple = chute(&barreau(l, w, t, i, pas), "VCC");

    // Deux barreaux accoles, donc un barreau de largeur double decrit en deux
    // polygones : le maillage doit les recoller.
    let demi = pas / 2.0;
    let double = chute(
        &resoudre(
            &format!("[{}, {}]", rectangle(0.0, 0.0, l, w, 0, "VCC", t), rectangle(0.0, w, l, 2.0 * w, 0, "VCC", t)),
            &format!(r#"[{{"couche": 0, "net": "VCC", "courant": {i:?}, "boite": [{:?}, {:?}, {demi:?}, {:?}]}}]"#, -demi, -demi, 2.0 * w + demi),
            &format!(
                r#"[{{"couche": 0, "net": "VCC", "tension": 0.0, "boite": [{:?}, {:?}, {:?}, {:?}]}}]"#,
                l - 3.0 * demi,
                -demi,
                l + demi,
                2.0 * w + demi
            ),
            "[]",
            Some(pas),
            RESISTIVITE_CUIVRE,
        )
        .unwrap(),
        "VCC",
    );
    let rapport = simple / double;
    assert!((rapport - 2.0).abs() < 0.06, "rapport {rapport:.4} au lieu de 2");
    println!("{simple:.4} V seul, {double:.4} V accoles, rapport {rapport:.4}");
}

/// Deux nets sur la meme couche NE CONDUISENT PAS l'un dans l'autre.
///
/// Le lancer de rayon seul ne le saurait pas : deux polygones qui se touchent
/// au carreau pres seraient recolles. C'est le net qui tranche.
#[test]
fn deux_nets_sur_la_meme_couche_ne_conduisent_pas_l_un_dans_l_autre() {
    let (t, i, pas) = (35e-6, 1.0, 0.1e-3);
    let demi = pas / 2.0;
    let r = resoudre(
        &format!("[{}, {}]", rectangle(0.0, 0.0, 10e-3, 1e-3, 0, "VCC", t), rectangle(0.0, 1e-3, 10e-3, 2e-3, 0, "GND", t)),
        &format!(r#"[{{"couche": 0, "net": "VCC", "courant": {i:?}, "boite": [{:?}, {:?}, {demi:?}, 1e-3]}}]"#, -demi, -demi),
        &format!(
            r#"[{{"couche": 0, "net": "VCC", "tension": 0.0, "boite": [{:?}, {:?}, 10e-3, 1e-3]}},
                {{"couche": 0, "net": "GND", "tension": 0.0, "boite": [{:?}, 1e-3, 10e-3, 2e-3]}}]"#,
            10e-3 - demi,
            -demi,
            -demi
        ),
        "[]",
        Some(pas),
        RESISTIVITE_CUIVRE,
    )
    .unwrap();
    let chute_gnd = chute(&r, "GND");
    assert!(chute_gnd < 1e-12, "le net GND a bougé de {chute_gnd:.3e} V");
    assert!(chute(&r, "VCC") > 1e-4, "VCC ne chute pas");
    println!("VCC : {:.4} V ; GND : {chute_gnd:.3e} V", chute(&r, "VCC"));
}

fn deux_couches(avec_via: bool) -> Result<Json, ErreurDC> {
    let (l, w, t, i, pas) = (5e-3, 1e-3, 35e-6, 1.0, 0.1e-3);
    let (percage, placage, hauteur) = (0.3e-3, 25e-6, 1.6e-3);
    let demi = pas / 2.0;
    let vias = format!(
        r#"[{{"x": {:?}, "y": {:?}, "couche_a": 0, "couche_b": 1, "net": "VCC", "percage": {percage:?}, "placage": {placage:?}, "hauteur": {hauteur:?}}}]"#,
        l - pas,
        w / 2.0
    );
    resoudre(
        &format!("[{}, {}]", rectangle(0.0, 0.0, l, w, 0, "VCC", t), rectangle(0.0, 0.0, l, w, 1, "VCC", t)),
        &format!(r#"[{{"couche": 0, "net": "VCC", "courant": {i:?}, "boite": [{:?}, {:?}, {demi:?}, {:?}]}}]"#, -demi, -demi, w + demi),
        &format!(r#"[{{"couche": 1, "net": "VCC", "tension": 0.0, "boite": [{:?}, {:?}, {demi:?}, {:?}]}}]"#, -demi, -demi, w + demi),
        if avec_via { &vias } else { "[]" },
        Some(pas),
        RESISTIVITE_CUIVRE,
    )
}

/// UN VIA EN SERIE ajoute sa resistance, et on la retrouve par difference.
///
/// Deux barreaux sur deux couches, relies par un seul via : la chute totale
/// doit valoir celle des deux barreaux plus R_via * I, a la resistance
/// d'etalement pres.
#[test]
fn un_via_en_serie_coute_sa_resistance_d_anneau() {
    let (l, w, t, i, pas) = (5e-3, 1e-3, 35e-6, 1.0, 0.1e-3);
    let (percage, placage, hauteur) = (0.3e-3f64, 25e-6, 1.6e-3);
    let aire = PI * ((percage / 2.0 + placage).powi(2) - (percage / 2.0).powi(2));
    let r_via = RESISTIVITE_CUIVRE * hauteur / aire;

    let r = deux_couches(true).unwrap();
    assert_eq!(r["n_vias"].as_i64(), Some(1), "le via n'a pas été relié");
    let total = chute(&r, "VCC");
    // Les deux barreaux, du point d'injection au via, puis du via au retour.
    let deux_barreaux = 2.0 * i * RESISTIVITE_CUIVRE * (l - 1.5 * pas) / (w * t);
    let part_via = total - deux_barreaux;
    assert!(part_via > 0.0, "le via ne coûte rien : {part_via:.6} V");
    let ecart = (part_via - r_via * i).abs() / (r_via * i);
    assert!(ecart < 0.35, "le via pèse {:.4} mV pour {:.4} mV attendus ({:.1} %)", part_via * 1e3, r_via * i * 1e3, 100.0 * ecart);
    println!("total {:.4} mV, dont {:.4} mV pour le via (formule : {:.4} mV)", total * 1e3, part_via * 1e3, r_via * i * 1e3);
}

/// Sans via, les deux couches sont deux ilots : le solveur doit REFUSER.
///
/// Un ilot flottant rend la sous-matrice singuliere. Ce qu'il ne faut pas,
/// c'est laisser le gradient conjugue divaguer et rendre un chiffre.
#[test]
fn sans_via_deux_couches_sont_deux_ilots_le_solveur_refuse() {
    match deux_couches(false) {
        Err(exc) => println!("refus : {}", exc.message),
        Ok(r) => panic!("aucun refus : chute rendue = {:.6} V", chute(&r, "VCC")),
    }
}

// -----------------------------------------------------------------------------
// 3. LES REFUS -- c'est la moitie qui manquait
// -----------------------------------------------------------------------------

/// PAS DE REFERENCE, PAS DE CHUTE : le probleme est flottant, on refuse.
///
/// La 1.0.0 ancrait le noeud numero zero -- le premier de la liste, c'est-a-
/// dire un coin de la boite englobante, sur n'importe quel net. La chute
/// rendue etait alors mesuree depuis un point que personne n'avait choisi.
#[test]
fn sans_reference_le_probleme_est_flottant_et_le_solveur_refuse() {
    let exc = resoudre(
        &format!("[{}]", rectangle(0.0, 0.0, 10e-3, 1e-3, 0, "VCC", 35e-6)),
        r#"[{"x": 0.0, "y": 0.5e-3, "couche": 0, "net": "VCC", "courant": 1.0}]"#,
        "[]",
        "[]",
        Some(0.2e-3),
        RESISTIVITE_CUIVRE,
    )
    .expect_err("aucun refus alors que le problème est flottant");
    assert!(!exc.conseil.is_empty(), "le refus ne dit pas quoi faire");
    println!("{}", exc.message);
}

/// Aucun polygone : un refus, pas une pile d'appels.
#[test]
fn sans_cuivre_un_refus_et_pas_une_pile_d_appels() {
    let exc = resoudre("[]", "[]", r#"[{"x": 0, "y": 0, "couche": 0}]"#, "[]", None, RESISTIVITE_CUIVRE).expect_err("aucun refus");
    println!("{}", exc.message);
}

/// Zero ampere donne zero volt -- et LE DIT, plutot que de le laisser lire
/// comme un bon resultat.
#[test]
fn zero_ampere_donne_zero_volt_et_le_dit() {
    let r = barreau(10e-3, 1e-3, 35e-6, 0.0, 0.2e-3);
    assert!(chute(&r, "VCC") < 1e-15);
    let avertissements = liste(&r["avertissements"]);
    assert!(avertissements.iter().any(|a| a.as_str().unwrap().contains("Aucun courant")), "le silence n'est pas signalé : {avertissements:?}");
    println!("{}...", avertissements[0].as_str().unwrap().chars().take(60).collect::<String>());
}

/// Un pas plus grand que la forme : un refus qui dit de le diminuer.
#[test]
fn une_trame_plus_grossiere_que_la_forme_est_refusee() {
    let exc = resoudre(
        &format!("[{}]", rectangle(0.0, 0.0, 0.1e-3, 0.1e-3, 0, "VCC", 35e-6)),
        "[]",
        r#"[{"x": 0, "y": 0, "couche": 0}]"#,
        "[]",
        Some(10e-3),
        RESISTIVITE_CUIVRE,
    )
    .expect_err("aucun refus");
    println!("{}", exc.message);
}

// -----------------------------------------------------------------------------
// 4. LA CHAINE COMPLETE : le document en millimetres, et la carte
// -----------------------------------------------------------------------------

/// Le document d'echange est en MILLIMETRES, et le resultat aussi.
///
/// C'est le contrat de `resoudre_document`, et c'est la seule chose qui
/// separe la page du solveur. Un facteur mille se voit ici ou nulle part.
#[test]
fn le_document_d_echange_est_en_millimetres_des_deux_cotes() {
    let r = document(
        r#"{"format": "cao-sim-dc-1",
            "polygones": [{"vertices": [[0, 0], [20, 0], [20, 2], [0, 2]], "couche": 0, "net": "VCC", "epaisseur": 0.035}],
            "sources": [{"couche": 0, "net": "VCC", "courant": 1.0, "boite": [-0.1, -0.1, 0.1, 2.1]}],
            "references": [{"couche": 0, "net": "VCC", "tension": 0.0, "boite": [19.7, -0.1, 20.1, 2.1]}],
            "pas": 0.2}"#,
    );
    // Le meme calcul, pose en metres a la main.
    let attendu = chute(&barreau(20e-3, 2e-3, 35e-6, 1.0, 0.2e-3), "VCC");
    let obtenu = chute(&r, "VCC");
    assert!((obtenu - attendu).abs() / attendu < 0.02, "{obtenu:.6} V contre {attendu:.6} V");
    assert!((f(&r["pas"]) - 0.2).abs() < 1e-9, "le pas rendu n'est pas en mm");
    assert!(maxi(liste(&r["noeuds"]).iter().map(|nd| f(&nd[0]))) > 15.0, "les noeuds rendus ne sont pas en mm");
    println!("{obtenu:.4} V, {} noeuds, pas {:.2} mm", r["n_noeuds"].as_i64().unwrap(), f(&r["pas"]));
}

/// La carte de chaleur est une grille finie, bornee par les potentiels.
#[test]
fn la_carte_de_chaleur_est_finie_et_bornee() {
    let r = barreau(10e-3, 1e-3, 35e-6, 1.0, 0.1e-3);
    let c = carte_chaleur(&r, 40, None).unwrap();
    assert!(liste(&c["x"]).len() == 40 && liste(&c["V"]).len() == 40);
    let plat: Vec<f64> = liste(&c["V"]).iter().flat_map(nombres).collect();
    assert!(plat.iter().all(|v| v == v), "des NaN dans la carte");
    let (vmin, vmax) = (mini(plat.iter().copied()), maxi(plat.iter().copied()));
    assert!(vmin >= mini(nombres(&r["potentiel"])) - 1e-12);
    assert!(vmax <= maxi(nombres(&r["potentiel"])) + 1e-12);
    println!("40 x 40, de {vmin:.4} a {vmax:.4} V");
}

/// L'etat dit `dispo` vrai quand le solveur est la, et le format qu'il attend.
#[test]
fn l_etat_annonce_ce_que_le_solveur_sait_faire() {
    let e = etat();
    assert_eq!(e["dispo"], Json::Bool(true), "{e:?}");
    assert_eq!(e["format"].as_str(), Some("cao-sim-dc-1"));
    println!("{}", e["methode"].as_str().unwrap());
}

// =============================================================================
// LE CHEMIN VERTICAL : ce que chaque via porte
// -----------------------------------------------------------------------------
// Le panneau annonce, via par via, le courant et la chute. Ce sont des chiffres
// qu'on lit et sur lesquels on decide de doubler un via ou non -- ils doivent
// donc etre justes, et pas seulement plausibles. La verification ne demande
// aucune formule : quand DEUX plans ne sont relies que par UN via, la loi des
// noeuds impose que tout le courant le traverse. C'est un etalon exact.
// =============================================================================

/// Deux plans superposes, relies par les `vias` donnes.
///
/// Source a gauche sur la couche 0, reference a droite sur la couche 1 : le
/// courant DOIT changer de couche pour aller de l'une a l'autre.
fn deux_plans(vias: &[String]) -> String {
    format!(
        r#"{{"format": "cao-sim-dc-1",
             "polygones": [
                 {{"vertices": [[0, 0], [20, 0], [20, 5], [0, 5]], "couche": 0, "net": "VDD", "epaisseur": 0.035}},
                 {{"vertices": [[0, 0], [20, 0], [20, 5], [0, 5]], "couche": 1, "net": "VDD", "epaisseur": 0.035}}],
             "vias": [{}],
             "sources": [{{"couche": 0, "net": "VDD", "courant": 1.5, "boite": [0, 0, 0.5, 5]}}],
             "references": [{{"couche": 1, "net": "VDD", "tension": 0.0, "boite": [19.5, 0, 20, 5]}}],
             "pas": 0.25}}"#,
        vias.join(", ")
    )
}

/// dict(VIA_TYPE, x=..., y=..., couche_a=0, couche_b=1, repere=...)
fn via_type(x: f64, y: f64, net: &str, repere: Option<&str>) -> String {
    let repere = repere.map_or(String::new(), |r| format!(r#", "repere": "{r}""#));
    format!(r#"{{"percage": 0.3, "placage": 0.025, "hauteur": 1.6, "net": "{net}", "x": {x:?}, "y": {y:?}, "couche_a": 0, "couche_b": 1{repere}}}"#)
}

/// UN seul via entre deux plans : il porte 1,5 A, ni plus ni moins.
///
/// C'est la loi des noeuds, pas une approximation : il n'existe aucun autre
/// chemin d'une couche a l'autre. Si le chiffre du panneau s'ecarte de la, il
/// est faux, et aucune finesse de trame n'y changera rien.
#[test]
fn un_via_unique_entre_deux_plans_porte_tout_le_courant() {
    let r = document(&deux_plans(&[via_type(10.0, 2.5, "VDD", Some("V1"))]));
    assert_eq!(r["n_vias"].as_i64(), Some(1));
    let d = &r["vias"][0];
    assert_eq!(d["relie"], Json::Bool(true), "{d:?}");
    let (courant, resistance) = (f(&d["courant"]), f(&d["resistance"]));
    assert!((courant.abs() - 1.5).abs() < 1e-9, "le via porte {courant:.6} A au lieu de 1,5");
    let aire = PI * ((0.15e-3f64 + 25e-6).powi(2) - (0.15e-3f64).powi(2));
    let attendu = RESISTIVITE_CUIVRE * 1.6e-3 / aire;
    assert!((resistance - attendu).abs() < 1e-9, "{resistance} {attendu}");
    // chute = I R et puissance = R I^2 : les trois chiffres doivent se recouper
    assert!((f(&d["chute"]) - courant.abs() * resistance).abs() < 1e-12);
    assert!((f(&d["puissance"]) - resistance * courant * courant).abs() < 1e-12);
    println!("1 via : {courant:.4} A, R = {:.4} mohm, chute = {:.4} mV", resistance * 1e3, f(&d["chute"]) * 1e3);
}

/// Quatre vias cote a cote : la somme fait le courant, et chacun en prend
/// moins qu'un via seul. C'est le seul chiffre qui justifie d'en doubler un.
#[test]
fn quatre_vias_se_partagent_le_courant_et_chacun_chute_moins() {
    let vias: Vec<String> = (0..4).map(|k| via_type(10.0, 1.0 + k as f64, "VDD", Some(&format!("V{}", k + 1)))).collect();
    let r = document(&deux_plans(&vias));
    assert_eq!(r["n_vias"].as_i64(), Some(4));
    let courants: Vec<f64> = liste(&r["vias"]).iter().map(|d| f(&d["courant"])).collect();
    let total: f64 = courants.iter().sum();
    assert!((total.abs() - 1.5).abs() < 1e-9, "la somme fait {total:.6} A");
    for c in &courants {
        assert!(c.abs() < 1.5, "{c}");
    }
    let seul = document(&deux_plans(&[via_type(10.0, 2.5, "VDD", None)]));
    assert!(
        maxi(liste(&r["vias"]).iter().map(|d| f(&d["chute"]).abs())) < f(&seul["vias"][0]["chute"]),
        "quatre vias ne chutent pas moins qu'un seul"
    );
    println!(
        "4 vias : somme {total:.4} A, le plus charge {:.4} A contre {:.4} A seul",
        maxi(courants.iter().map(|c| c.abs())),
        f(&seul["vias"][0]["courant"])
    );
}

/// Un via pose la ou son net n'a pas de cuivre ne peut pas etre monte.
///
/// Le taire serait rendre le resultat d'une carte OU CE VIA N'EXISTE PAS,
/// sans le dire. On verifie donc qu'il ressort marque, avec son motif, et que
/// le calcul le signale.
#[test]
fn un_via_qui_ne_trouve_pas_son_cuivre_est_dit_pas_oublie() {
    let r = document(&deux_plans(&[via_type(10.0, 2.5, "VDD", Some("V1")), via_type(80.0, 80.0, "VDD", Some("V2"))]));
    assert_eq!(r["n_vias"].as_i64(), Some(1));
    let absents: Vec<&Json> = liste(&r["vias"]).iter().filter(|d| !d["relie"].vrai()).collect();
    assert_eq!(absents.len(), 1, "{:?}", r["vias"]);
    assert_eq!(absents[0]["repere"].as_str(), Some("V2"));
    assert!(absents[0]["motif"].vrai(), "un via ecarte sans motif");
    assert!(liste(&r["avertissements"]).iter().any(|a| a.as_str().unwrap().contains("vertical")), "{:?}", r["avertissements"]);
    println!("{}", absents[0]["motif"].as_str().unwrap());
}

/// Le net du via traverse le document.
///
/// Il ne sert pas qu'a l'affichage : le maillage ne raccorde le via qu'au
/// cuivre de SON net. Perdu en chemin, le via s'accrochait au premier carreau
/// venu -- celui d'un autre net compris.
#[test]
fn le_net_du_via_traverse_le_document() {
    let r = document(&deux_plans(&[via_type(10.0, 2.5, "VDD", Some("V1"))]));
    assert_eq!(r["vias"][0]["net"].as_str(), Some("VDD"));
    match resoudre_document(&j(&deux_plans(&[via_type(10.0, 2.5, "AUTRE", Some("VX"))])), None) {
        Err(_) => println!("un via d'un autre net ne raccorde rien : le calcul refuse"),
        Ok(r2) => {
            assert_eq!(r2["n_vias"].as_i64(), Some(0), "un via du net AUTRE a quand meme raccorde le cuivre VDD");
            println!("un via du net AUTRE ne raccorde pas le cuivre VDD");
        }
    }
}

/// Une decoupe evide le plan, et la chute MONTE.
///
/// Un plan evide qu'on calculerait plein rendrait une chute trop faible : une
/// erreur du cote qui rassure, la pire. On verifie le SENS, et qu'une decoupe
/// posee AVANT le plan dans la liste l'evide quand meme.
#[test]
fn une_decoupe_retire_du_cuivre_quel_que_soit_son_rang() {
    let base = |trou: &str| {
        format!(
            r#"{{"format": "cao-sim-dc-1",
                 "polygones": [{trou}{{"vertices": [[0, 0], [40, 0], [40, 10], [0, 10]], "couche": 0, "net": "VDD", "epaisseur": 0.035}}],
                 "sources": [{{"couche": 0, "net": "VDD", "courant": 2.0, "boite": [39.5, 0, 40, 10]}}],
                 "references": [{{"couche": 0, "net": "VDD", "tension": 0.0, "boite": [0, 0, 0.5, 10]}}],
                 "pas": 0.25}}"#
        )
    };
    let plein = chute(&document(&base("")), "VDD");
    let trou = r#"{"vertices": [[18, 2], [22, 2], [22, 8], [18, 8]], "couche": 0, "net": "VDD", "epaisseur": 0.035, "trou": true}, "#;
    let apres = chute(&document(&base(trou)), "VDD");
    assert!(apres > plein, "evider n'a pas fait monter la chute : {apres:.6} contre {plein:.6}");
    println!("plein {:.4} mV, evide {:.4} mV (+{:.1} %)", plein * 1e3, apres * 1e3, 100.0 * (apres - plein) / plein);
}

// =============================================================================
// PLUSIEURS INJECTIONS SUR LE MEME NET
// -----------------------------------------------------------------------------
// Un net d'alimentation nourrit plusieurs composants, et la chute que chacun
// voit depend de ce que TIRENT LES AUTRES. Ce n'est pas une commodite : c'est
// la raison d'etre du calcul. Un barreau a une dimension le rend exactement
// calculable a la main, ce qui en fait un etalon et pas une non-regression.
// =============================================================================

/// `_barreau` du banc : 40 x 10 mm, 35 um, pas 0,25 ; les bornes sont des (courant ou tension, x).
///
/// Une borne est prise sur TOUTE la largeur (`_bande`) : le probleme reste a une dimension, et
/// aucune resistance d'etranglement ne vient brouiller l'etalon.
fn barreau_doc(sources: &[(f64, f64)], references: &[(f64, f64)]) -> String {
    let bornes = |cle: &str, l: &[(f64, f64)]| {
        l.iter()
            .map(|(v, x)| format!(r#"{{"couche": 0, "net": "VDD", "{cle}": {v:?}, "boite": [{:?}, 0.0, {:?}, 10.0]}}"#, x - 0.25, x + 0.25))
            .collect::<Vec<_>>()
            .join(", ")
    };
    format!(
        r#"{{"format": "cao-sim-dc-1",
             "polygones": [{{"vertices": [[0, 0], [40.0, 0], [40.0, 10.0], [0, 10.0]], "couche": 0, "net": "VDD", "epaisseur": 0.035}}],
             "sources": [{}], "references": [{}], "pas": 0.25}}"#,
        bornes("courant", sources),
        bornes("tension", references)
    )
}

/// Deux consommateurs sur le meme rail, et le calcul exact.
///
/// Reference a gauche (x = 0), une source en x1 qui tire I1, une autre en x2
/// qui tire I2, avec x1 < x2. Tout le courant passe par le troncon [0, x1],
/// puis seul I2 continue jusqu'a x2 :
///
///     V(x1) = r (I1 + I2) x1
///     V(x2) = V(x1) + r I2 (x2 - x1)          avec r = rho / (W t)
///
/// C'est de l'arithmetique, pas un modele -- et c'est precisement ce qu'un
/// calcul par source SEPARE ne saurait pas rendre.
#[test]
fn deux_sources_se_superposent_et_le_calcul_est_exact() {
    let (w, ep) = (10e-3, 35e-6);
    let r = RESISTIVITE_CUIVRE / (w * ep); // ohms par metre de barreau
    let (i1, i2) = (1.0, 0.6);
    let (x1, x2) = (15.0, 35.0);
    let res = document(&barreau_doc(&[(i1, x1), (i2, x2)], &[(0.0, 0.25)]));
    let v = nombres(&res["potentiel"]);
    let noeuds = liste(&res["noeuds"]);

    let au = |x: f64| -> f64 {
        let proches: Vec<f64> = noeuds.iter().enumerate().filter(|(_, n)| (f(&n[0]) - x).abs() <= 0.13).map(|(k, _)| v[k]).collect();
        assert!(!proches.is_empty(), "aucun noeud vers x = {x:.2}");
        proches.iter().sum::<f64>() / proches.len() as f64
    };

    // L'ETALON EXACT : l'ECART entre les deux sources. La reference occupe une
    // bande de 0,5 mm, et l'endroit ou se trouve son bord EFFECTIF est connu a
    // un quart de millimetre pres -- soit pres de deux pour cent sur les 15 mm
    // qui la separent de la premiere source. Cette ambiguite disparait dans la
    // DIFFERENCE : entre x1 et x2, seul I2 circule, et la longueur est connue
    // exactement. C'est donc la que se joue la verification, au dixieme de
    // pour cent.
    let ecart = r * i2 * (x2 - x1) * 1e-3;
    let mesure = au(x2) - au(x1);
    let e = 100.0 * (mesure - ecart) / ecart;
    assert!(e.abs() < 0.6, "entre les deux sources : {mesure:.6} V contre {ecart:.6} ({e:.3} %)");
    // Et l'absolu, a la tolerance que le bord de la borne impose.
    let attendu1 = r * (i1 + i2) * (x1 - 0.25) * 1e-3;
    let e1 = 100.0 * (au(x1) - attendu1) / attendu1;
    assert!(e1.abs() < 3.0, "en x1 : {:.4} V contre {attendu1:.4} ({e1:.2} %)", au(x1));
    assert!((f(&res["courant_par_net"]["VDD"]) - (i1 + i2)).abs() < 1e-9);
    println!("ecart entre sources {:.4} mV contre {:.4} attendu ({e:.3} %)", mesure * 1e3, ecart * 1e3);
}

/// Ajouter un consommateur en amont fait monter ce que voit celui d'aval.
///
/// C'est LE resultat que deux calculs separes rendraient faux, chacun ignorant
/// le courant de l'autre.
#[test]
fn un_consommateur_de_plus_en_amont_fait_monter_la_chute_d_aval() {
    let a = chute(&document(&barreau_doc(&[(0.6, 35.0)], &[(0.0, 0.25)])), "VDD");
    let b = chute(&document(&barreau_doc(&[(1.0, 15.0), (0.6, 35.0)], &[(0.0, 0.25)])), "VDD");
    assert!(b > a * 1.5, "le voisin ne pese pas : {:.4} mV contre {:.4}", b * 1e3, a * 1e3);
    println!("seule {:.3} mV, avec un voisin en amont {:.3} mV", a * 1e3, b * 1e3);
}

/// Deux references encadrant la source se partagent le courant, et la chute
/// tombe : c'est ce qu'on gagne a doubler une arrivee d'alimentation.
#[test]
fn deux_references_se_partagent_le_retour_et_la_chute_tombe() {
    let a = chute(&document(&barreau_doc(&[(2.0, 20.0)], &[(0.0, 0.25)])), "VDD");
    let b = chute(&document(&barreau_doc(&[(2.0, 20.0)], &[(0.0, 0.25), (0.0, 39.75)])), "VDD");
    assert!(b < a * 0.75, "doubler l'arrivee n'a rien change : {:.4} contre {:.4} mV", b * 1e3, a * 1e3);
    println!("une arrivee {:.3} mV, deux arrivees {:.3} mV", a * 1e3, b * 1e3);
}

/// Deux references a des tensions differentes : le cuivre entre elles porte
/// un courant, meme sans source. C'est un cas limite, et il doit tenir.
#[test]
fn deux_references_a_des_tensions_differentes_tiennent() {
    let ch = chute(&document(&barreau_doc(&[], &[(0.0, 0.25), (0.1, 39.75)])), "VDD");
    assert!((ch - 0.1).abs() < 1e-3, "l'ecart des deux references vaut {ch:.6} V");
    println!("0,1 V impose d'un bout a l'autre, retrouve a {ch:.6} V");
}

// =============================================================================
// LE CHEMIN QUI CHANGE DE COUCHE PLUSIEURS FOIS
// -----------------------------------------------------------------------------
// LA TOPOLOGIE REELLE D'UN RAIL D'ALIMENTATION, et c'est celle qu'on pose quand
// on demande « est-ce que le changement de couche et les vias sont pris en
// compte ? » :
//
//   connecteur sur un plan en COUCHE 1
//     -> 3 vias qui plongent
//   plan d'alimentation en COUCHE 3
//     -> 5 vias repartis qui remontent
//   pastille du composant en COUCHE 1
//
// CE QUE CES CAS PROUVENT, ET IL FAUT LES TROIS.
//
//   1. LE COURANT PASSE. Sans les vias montes, le plan de la couche 3 serait
//      flottant et le solveur REFUSERAIT -- il ne rendrait pas un chiffre
//      optimiste. Le calcul aboutit, donc les deux etages sont relies.
//   2. LE COURANT SE PARTAGE, et le solveur dit comment. La somme des courants
//      des vias d'un MEME etage vaut le courant total : c'est la loi des noeuds,
//      et c'est ce qui permet de lire « le plus charge en prend 31 % » sans se
//      raconter d'histoires. Les vias d'un etage sont en PARALLELE ; les deux
//      etages, eux, sont en SERIE, et les sommer ensemble donnerait deux fois le
//      courant -- c'est le piege que `simDesequilibreVias` evite en groupant par
//      couple de couches.
//   3. LA CHUTE COMPTE LES VIAS. Le meme rail avec 5 vias au retour et avec un
//      seul ne rend pas la meme chose : la resistance de passage tombe comme le
//      nombre de vias en parallele.
// =============================================================================

/// Un rail a deux plans et deux etages de vias.
///
/// Quatre couches de cuivre : DEUX ILOTS en couche 0 -- la plage du
/// connecteur a gauche, celle du composant a droite -- et le plan
/// d'alimentation en couche 2. Les couches 1 et 3 ne portent rien, ce qui est
/// le cas ordinaire, et ce qui verifie au passage qu'un via ne s'accroche pas
/// a une couche vide.
///
/// DEUX ILOTS ET NON UN PLAN CONTINU, et c'est ce qui fait de ce cas un
/// ETALON. Avec du cuivre d'un bout a l'autre en couche 0, le courant a un
/// second chemin -- il reste en surface -- et la verticale ne porte plus qu'une
/// part qu'on ne sait pas poser a la main (mesure : 2,23 A sur 3). Coupes,
/// les deux ilots n'ont plus AUCUN chemin entre eux que les vias : la loi des
/// noeuds donne alors le total exactement, et c'est verifiable.
///
/// C'est aussi la topologie qu'on decrit quand on demande si le changement de
/// couche est pris en compte : le connecteur arrive en surface, plonge, court
/// dans le plan, et remonte au pad du composant.
fn rail_deux_etages(retours: usize, charges: usize) -> String {
    let (plonges, courant, pas) = (3, 3.0, 0.4);
    let (l, w) = (60.0, 30.0);
    let mut vias = Vec::new();
    // LES PLONGES, groupees a gauche sous le connecteur.
    for i in 0..plonges {
        vias.push(format!(
            r#"{{"x": 5.0, "y": {:?}, "couche_a": 0, "couche_b": 2, "percage": 0.3, "placage": 0.025, "hauteur": 0.8, "net": "VDD", "repere": "P{}"}}"#,
            8.0 + 5.0 * i as f64,
            i + 1
        ));
    }
    // LES RETOURS, repartis a droite sous le composant.
    for i in 0..retours {
        vias.push(format!(
            r#"{{"x": 52.0, "y": {:?}, "couche_a": 2, "couche_b": 0, "percage": 0.3, "placage": 0.025, "hauteur": 0.8, "net": "VDD", "repere": "R{}"}}"#,
            6.0 + 4.0 * i as f64,
            i + 1
        ));
    }
    let part = courant / charges.max(1) as f64;
    // LES CHARGES : sur le plan de la couche 0, a droite. Autant qu'on veut.
    let sources: Vec<String> = (0..charges)
        .map(|k| {
            format!(
                r#"{{"couche": 0, "net": "VDD", "courant": {:?}, "boite": [57.0, {:?}, 59.0, {:?}], "repere": "U{}.1"}}"#,
                -part,
                6.0 + 8.0 * k as f64,
                12.0 + 8.0 * k as f64,
                k + 1
            )
        })
        .collect();
    format!(
        r#"{{"format": "cao-sim-dc-1",
             "polygones": [
                 {{"vertices": [[0, 0], [12.0, 0], [12.0, {w:?}], [0, {w:?}]], "couche": 0, "net": "VDD", "epaisseur": 0.035}},
                 {{"vertices": [[46.0, 0], [{l:?}, 0], [{l:?}, {w:?}], [46.0, {w:?}]], "couche": 0, "net": "VDD", "epaisseur": 0.035}},
                 {{"vertices": [[0, 0], [{l:?}, 0], [{l:?}, {w:?}], [0, {w:?}]], "couche": 2, "net": "VDD", "epaisseur": 0.035}}],
             "vias": [{}],
             "references": [{{"couche": 0, "net": "VDD", "tension": 3.3, "boite": [1.0, 5.0, 3.0, 25.0], "repere": "J1.1"}}],
             "sources": [{}],
             "couches_externes": [0, 3],
             "pas": {pas:?}}}"#,
        vias.join(", "),
        sources.join(", ")
    )
}

/// La somme des |courants| des vias relies dont le repere commence par `prefixe`.
fn courant_des_vias(r: &Json, prefixe: &str) -> Vec<f64> {
    liste(&r["vias"])
        .iter()
        .filter(|v| v["relie"].vrai() && v["repere"].as_str().unwrap().starts_with(prefixe))
        .map(|v| f(&v["courant"]).abs())
        .collect()
}

/// LE COURANT PASSE, ET IL SE PARTAGE. Loi des noeuds a chaque etage.
///
/// Huit vias, deux etages, un plan a chaque bout : le courant n'a AUCUN autre
/// chemin que la verticale. Si les vias n'etaient pas montes, le plan de la
/// couche 2 serait flottant et le solveur refuserait -- il ne rendrait pas un
/// chiffre trop beau.
#[test]
fn un_rail_traverse_deux_etages_de_vias_et_le_courant_se_partage() {
    let r = document(&rail_deux_etages(5, 1));
    // Les courants des vias, groupes par COUPLE DE COUCHES (`_par_etage`) : c'est le seul
    // groupement qui ait un sens.
    let mut etages: Vec<(i64, i64)> = liste(&r["vias"])
        .iter()
        .filter(|v| v["relie"].vrai())
        .map(|v| {
            let (a, b) = (v["couche_a"].as_i64().unwrap(), v["couche_b"].as_i64().unwrap());
            (a.min(b), a.max(b))
        })
        .collect();
    let montes = etages.len();
    etages.sort();
    etages.dedup();
    assert_eq!(etages, [(0, 2)], "les vias ne relient pas tous le meme couple");
    assert_eq!(montes, 8, "{montes} via(s) montes au lieu de 8");
    // LE COURANT TOTAL SE RETROUVE DEUX FOIS : une fois qui descend, une fois
    // qui remonte, et chaque etage doit porter les trois amperes.
    //
    // PAS PAR LE SIGNE : il suit le sens couche_a -> couche_b, qui est une
    // convention PAR VIA. Les plonges sont declarees 0->2 et les retours 2->0,
    // donc les deux ressortent POSITIFS et les sommer par le signe rendait six
    // amperes. On groupe par repere, qui dit a quel etage un via appartient.
    let descend: f64 = courant_des_vias(&r, "P").iter().sum();
    let retours = courant_des_vias(&r, "R");
    let remonte: f64 = retours.iter().sum();
    for (nom, somme) in [("descentes", descend), ("remontees", remonte)] {
        assert!((somme - 3.0).abs() / 3.0 < 0.01, "{nom} : {somme:.4} A au lieu de 3");
    }
    // ET LE PARTAGE N'EST PAS EGAL : les vias du bord voient une resistance de
    // plan differente de ceux du milieu, et c'est tout l'interet du chiffre.
    let part = 100.0 * maxi(retours.iter().copied()) / remonte;
    assert!(100.0 / retours.len() as f64 <= part && part < 60.0, "le plus charge en prend {part:.1} %");
    println!("8 vias sur un couple de couches, {descend:.4} A qui descendent et {remonte:.4} A qui remontent, le plus charge en prend {part:.1} % de son etage");
}

/// LA RESISTANCE DE PASSAGE TOMBE COMME LE NOMBRE DE VIAS.
///
/// C'est la decision qu'on prend en lisant ce panneau : « faut-il en ajouter
/// un ? ». Avec UN seul via au retour, la chute doit etre nettement plus
/// grande qu'avec cinq -- et l'ecart doit valoir la resistance qu'on a
/// retiree, a la resistance des plans pres.
#[test]
fn doubler_les_vias_de_retour_fait_tomber_la_chute_du_bon_montant() {
    let derniere = |r: &Json| f(&liste(&r["bornes"]).last().unwrap()["chute"]);
    let cu = derniere(&document(&rail_deux_etages(1, 1)));
    let cc = derniere(&document(&rail_deux_etages(5, 1)));
    assert!(cu > cc, "un seul via ne coute rien : {:.4} contre {:.4} mV", cu * 1e3, cc * 1e3);
    // LA RESISTANCE D'UN VIA, posee a la main : rho*h/A avec A l'anneau plaque.
    let (d, p, h) = (0.3e-3f64, 0.025e-3, 0.8e-3);
    let aire = PI * ((d / 2.0 + p).powi(2) - (d / 2.0).powi(2));
    let rv = RESISTIVITE_CUIVRE * h / aire;
    // De 5 en parallele a 1 : la resistance de PASSAGE monte de
    // rv*(1 - 1/5) = 0,8*rv, soit 1,30 mV sous trois amperes.
    let plancher = 3.0 * rv * 0.8;
    let ecart = cu - cc;
    // C'EST UN PLANCHER, PAS UNE EGALITE, et la difference est instructive :
    // tout le courant du plan doit converger sur UN trou de 0,3 mm, et cette
    // CONSTRICTION du cuivre coute plus que le tube lui-meme -- mesure, 2,98 mV
    // la ou le tube seul en predit 1,30. C'est une seconde raison d'ajouter des
    // vias, et celle qu'on ne calcule pas de tete : elle est dans la carte de
    // densite, au droit du via.
    assert!(ecart >= plancher, "l'ecart de chute vaut {:.4} mV, moins que la resistance retiree ({:.4} mV) : le tube n'est pas compte", ecart * 1e3, plancher * 1e3);
    assert!(ecart < 6.0 * plancher, "l'ecart de chute vaut {:.4} mV pour un plancher de {:.4} : ce n'est plus une constriction, c'est autre chose", ecart * 1e3, plancher * 1e3);
    println!(
        "un via au retour : {:.3} mV ; cinq : {:.3} mV. L'ecart vaut {:.4} mV, dont {:.4} pour le tube et le reste pour la constriction du cuivre sur un seul trou",
        cu * 1e3,
        cc * 1e3,
        ecart * 1e3,
        plancher * 1e3
    );
}

/// X SOURCES ET X CHARGES, sur un rail qui change deux fois de couche.
///
/// Le nombre de bornes n'est borne par rien : chacune est un point d'injection
/// ou de Dirichlet de plus. Ce que ce cas verifie, c'est que le TOTAL se
/// conserve quand on repartit le meme courant sur trois consommateurs -- et
/// que chacun voit sa propre chute, qui n'est pas celle du net.
#[test]
fn x_charges_sur_un_rail_a_deux_etages_le_total_se_conserve() {
    let r = document(&rail_deux_etages(5, 3));
    let charges: Vec<&Json> = liste(&r["bornes"]).iter().filter(|b| b["role"].as_str() == Some("courant")).collect();
    assert_eq!(charges.len(), 3, "{} charge(s) rendues", charges.len());
    let total: f64 = charges.iter().map(|b| f(&b["consigne"]).abs()).sum();
    assert!((total - 3.0).abs() < 1e-9, "consignes : {total:.6} A");
    // LE COURANT DES VIAS VAUT TOUJOURS LE TOTAL : peu importe comment on le
    // repartit entre les consommateurs, il passe par la meme verticale.
    let descend: f64 = courant_des_vias(&r, "P").iter().sum();
    assert!((descend - 3.0).abs() / 3.0 < 0.01, "{descend:.4} A descendus");
    // ET CHAQUE CHARGE A SA CHUTE : trois consommateurs a trois endroits ne
    // voient pas la meme tension, et c'est la question posee au calcul.
    let mut chutes: Vec<f64> = charges.iter().map(|b| f(&b["chute"])).collect();
    chutes.sort_by(f64::total_cmp);
    assert!(chutes[2] > chutes[0], "les trois charges voient la meme chose : {chutes:?}");
    println!("3 charges, {descend:.4} A descendus par les vias, chutes de {:.3} a {:.3} mV", chutes[0] * 1e3, chutes[2] * 1e3);
}

/// UN VIA QUI DESCEND VERS UNE PASTILLE ISOLEE.
///
/// Un rail va de la source a la charge en couche 0. Au milieu, un via descend
/// en couche 1 vers une pastille que RIEN d'autre ne touche. `charge_au_bout`
/// y pose ou non un consommateur.
fn cul_de_sac(charge_au_bout: f64) -> String {
    let au_bout = if charge_au_bout != 0.0 {
        format!(r#", {{"couche": 1, "net": "VDD", "courant": {:?}, "boite": [19, 0.4, 21, 1.6], "repere": "U2"}}"#, -charge_au_bout)
    } else {
        String::new()
    };
    format!(
        r#"{{"format": "cao-sim-dc-1",
             "polygones": [
                 {{"vertices": [[0, 0], [40, 0], [40, 2], [0, 2]], "couche": 0, "net": "VDD", "epaisseur": 0.035}},
                 {{"vertices": [[19, 0.4], [21, 0.4], [21, 1.6], [19, 1.6]], "couche": 1, "net": "VDD", "epaisseur": 0.035}}],
             "vias": [{{"x": 20, "y": 1, "couche_a": 0, "couche_b": 1, "percage": 0.3, "placage": 0.025, "hauteur": 0.2,
                        "net": "VDD", "repere": "V_cul"}}],
             "sources": [{{"couche": 0, "net": "VDD", "courant": -3.0, "boite": [39, 0, 40, 2], "repere": "U1"}}{au_bout}],
             "references": [{{"couche": 0, "net": "VDD", "tension": 3.3, "boite": [0, 0, 1, 2], "repere": "J1"}}],
             "pas": 0.2}}"#
    )
}

/// LA LOI, ET ELLE NE SE DISCUTE PAS.
///
/// Un morceau de cuivre relie au reste par UN SEUL chemin, et qui ne porte ni
/// source ni charge, ne peut porter aucun courant : ce qui entre doit sortir,
/// et il n'y a pas d'autre porte.
///
/// C'EST LA QUESTION QU'ON POSE DEVANT LA FICHE : « ce via remonte a une
/// pastille ou je n'ai regle aucune charge, pourquoi porte-t-il du courant ? ».
/// Il n'y a que deux reponses, et ce cas fixe laquelle est la bonne : sur un
/// VRAI cul-de-sac, le solveur rend ZERO. Un via qui porte du courant n'est
/// donc PAS un cul-de-sac -- le cuivre continue au-dela de la pastille.
///
/// Ce n'est pas la loi qu'on a resolue : on a resolu un systeme lineaire. La
/// verifier apprend donc quelque chose.
#[test]
fn un_cul_de_sac_ne_porte_aucun_courant_et_une_charge_au_bout_le_remplit() {
    let r = document(&cul_de_sac(0.0));
    let i = f(&r["vias"][0]["courant"]).abs();
    // LE SEUIL EST CELUI DU SOLVEUR. Le gradient conjugue s'arrete sur un
    // residu relatif de 1e-12 ; on demande mieux qu'un microampere sur un rail
    // de trois amperes, soit trois cents fois plus severe que « ca se voit ».
    assert!(i < 1e-6, "le cul-de-sac porte {i:e} A");
    let c = &r["culs_de_sac"];
    assert_eq!(c["morceaux"].as_i64(), Some(1), "cul(s)-de-sac vu(s)");
    assert!(c["noeuds"].as_i64().unwrap() > 10, "{:?} noeud(s) dans le cul-de-sac", c["noeuds"]);
    assert!(liste(&r["avertissements"]).is_empty(), "{:?}", r["avertissements"]);

    // LE REVERS, ET C'EST LUI QUI PROUVE QUE LE ZERO N'EST PAS UN ZERO PAR
    // OUBLI : la meme geometrie, une charge au bout, et le via porte TOUT son
    // courant. Sans ce second controle, un solveur qui ignorerait ce via
    // passerait le premier.
    let r2 = document(&cul_de_sac(0.5));
    let i2 = f(&r2["vias"][0]["courant"]).abs();
    assert!((i2 - 0.5).abs() / 0.5 < 0.01, "avec une charge de 0,5 A au bout, le via porte {i2:.4} A");
    assert_eq!(r2["culs_de_sac"]["morceaux"].as_i64(), Some(0), "une pastille qui porte une charge est comptee cul-de-sac");
    println!("sans charge au bout : {i:.3e} A ; avec 0,5 A au bout : {i2:.4} A");
}

/// LA SONDE A BESOIN DU DISQUE DU VIA, et le resultat doit le porter.
///
/// Sans le percage, la page devrait retrouver chaque via dans sa propre
/// geometrie et esperer que les deux listes soient encore dans le meme ordre.
/// Il repart en MILLIMETRES comme la position -- c'est une longueur.
#[test]
fn le_percage_repart_avec_chaque_via_pour_la_sonde() {
    let r = document(&rail_deux_etages(5, 1));
    for v in liste(&r["vias"]) {
        assert!((f(&v["percage"]) - 0.3).abs() < 1e-9, "percage rendu : {:?} mm", v["percage"]);
    }
}

// =============================================================================
// LA DENSITE DE COURANT, ET CE QU'ELLE ECHAUFFE
// -----------------------------------------------------------------------------
// LA CHUTE NE DIT PAS TOUT : une piste peut tenir sa chute et fondre quand meme,
// parce que c'est la SECTION qui chauffe et non la longueur. Ces deux grandeurs
// se posent a la main sur un barreau -- J = I/(W t) et la charte IPC-2221 --,
// donc ce sont des ETALONS et pas des non-regressions.
// =============================================================================

/// Les arguments de `_piste`, avec leurs valeurs par defaut.
#[derive(Clone)]
struct Piste {
    w: f64,
    courant: f64,
    externe: bool,
    pas: f64,
    retrecissement: Option<(f64, f64, f64)>,
    thermique: Option<String>,
}

impl Default for Piste {
    fn default() -> Self {
        Piste { w: 2.0, courant: 3.0, externe: true, pas: 0.1, retrecissement: None, thermique: None }
    }
}

/// Une piste droite, alimentee d'un bout et tenue de l'autre, sur toute sa
/// largeur : le probleme reste a une dimension.
fn piste(p: &Piste) -> String {
    let (l, w, ep) = (40.0, p.w, 0.035);
    let mut polys = vec![format!(r#"{{"vertices": [[0, 0], [{l:?}, 0], [{l:?}, {w:?}], [0, {w:?}]], "couche": 0, "net": "VDD", "epaisseur": {ep:?}}}"#)];
    if let Some((x0, x1, w2)) = p.retrecissement {
        // On EVIDE les deux bords entre x0 et x1 pour ne laisser que w2.
        let marge = (w - w2) / 2.0;
        polys.push(format!(
            r#"{{"vertices": [[{x0:?}, 0], [{x1:?}, 0], [{x1:?}, {marge:?}], [{x0:?}, {marge:?}]], "couche": 0, "net": "VDD", "epaisseur": {ep:?}, "trou": true}}"#
        ));
        polys.push(format!(
            r#"{{"vertices": [[{x0:?}, {:?}], [{x1:?}, {:?}], [{x1:?}, {w:?}], [{x0:?}, {w:?}]], "couche": 0, "net": "VDD", "epaisseur": {ep:?}, "trou": true}}"#,
            w - marge,
            w - marge
        ));
    }
    format!(
        r#"{{"format": "cao-sim-dc-1",
             "polygones": [{}],
             "sources": [{{"couche": 0, "net": "VDD", "courant": {:?}, "boite": [{:?}, 0, {l:?}, {w:?}]}}],
             "references": [{{"couche": 0, "net": "VDD", "tension": 0.0, "boite": [0, 0, 0.25, {w:?}]}}],
             "couches_externes": {},
             "pas": {:?}{}}}"#,
        polys.join(", "),
        p.courant,
        l - 0.25,
        if p.externe { "[0]" } else { "[]" },
        p.pas,
        p.thermique.as_ref().map_or(String::new(), |t| format!(r#", "thermique": {t}"#))
    )
}

fn pire(p: &Piste) -> Json {
    document(&piste(p))["pire_par_net"]["VDD"].clone()
}

// LA CARTE NUE, POSEE UNE FOIS. C'est celle sur laquelle les etalons se
// calculent a la main : 1,6 mm de FR-4 a 0,8 W/(m.K) dans le plan, h = 12
// W/(m2.K) par face, et AUCUN cuivre etaleur. Les laisser au repli marcherait
// aussi -- ce sont les memes valeurs -- mais un etalon qui depend d'un repli
// cesse d'etre un etalon le jour ou le repli change.
const NUE: &str = r#"{"k_stratifie": 0.8, "epaisseur_stratifie": 1.6, "h_surface": 12.0, "cuivre_etaleur": 0.0}"#;
const NUE_AVEC_PLAN: &str = r#"{"k_stratifie": 0.8, "epaisseur_stratifie": 1.6, "h_surface": 12.0, "cuivre_etaleur": 0.035}"#;

fn nue() -> Option<String> {
    Some(NUE.to_string())
}

/// La conductance d'etalement de la carte, posee a la main, en W/(K.m).
///
///     Ks = k * h_lamine + 390 * t_cuivre        [W/K]
///     g  = 2 * sqrt(Ks * 2h)                    [W/(K.m)]
///
/// Deux ailettes semi-infinies, une de chaque cote du conducteur.
fn g_etalement(cuivre_etaleur: f64, h: f64) -> f64 {
    let (lamine, k) = (1.6, 0.8);
    let ks = k * (lamine * 1e-3) + 390.0 * (cuivre_etaleur * 1e-3);
    2.0 * (ks * 2.0 * h).sqrt()
}

/// L'echauffement du modele d'etalement, pose a la main.
///
///     p' = I^2 rho / A          g = g_etalement (+ h*W si externe)
///     dT = u / (1 - alpha u)    u = p'/g
fn dt_etalement(courant: f64, largeur_mm: f64, externe: bool, cuivre_etaleur: f64) -> f64 {
    let (ep_mm, h) = (0.035, 12.0);
    let (rho, alpha) = (1.724e-8, 3.93e-3);
    let a = (largeur_mm * 1e-3) * (ep_mm * 1e-3);
    let mut g = g_etalement(cuivre_etaleur, h);
    if externe {
        g += h * (largeur_mm * 1e-3);
    }
    let u = courant * courant * rho / (a * g);
    u / (1.0 - alpha * u)
}

/// J = I / (W t), et rien d'autre, sur un barreau.
///
/// C'est de l'arithmetique : trois amperes dans deux millimetres de 35 um font
/// 42,857 A/mm2. Le solveur doit y tomber, sinon la carte de chaleur ment.
#[test]
fn la_densite_est_le_calcul_a_la_main() {
    let p = pire(&Piste::default());
    let attendu = 3.0 / (2.0 * 0.035);
    let e = 100.0 * (f(&p["densite"]) - attendu) / attendu;
    assert!(e.abs() < 0.5, "{:.4} A/mm2 contre {attendu:.4} attendu ({e:.2} %)", f(&p["densite"]));
    // Et la LARGEUR LOCALE doit etre celle de la piste, mesuree sur la trame.
    assert!((f(&p["largeur"]) - 2.0).abs() < 0.15, "largeur vue : {:.3} mm", f(&p["largeur"]));
    println!("{:.4} A/mm2 contre {attendu:.4} a la main ({e:.3} %), largeur {:.2} mm", f(&p["densite"]), f(&p["largeur"]));
}

/// Deux fois plus etroit, deux fois plus dense.
///
/// C'EST LE DEFAUT QUE LA CHUTE NE MONTRE PAS. Un col de deux millimetres ne
/// pese presque rien sur la tension -- et il double la densite, donc il
/// chauffe. Aucun controle geometrique ne le voit : la piste y respecte sa
/// largeur minimale.
#[test]
fn un_retrecissement_concentre_le_courant_la_ou_la_chute_ne_le_montre_pas() {
    let large = document(&piste(&Piste::default()));
    let etroit = document(&piste(&Piste { retrecissement: Some((19.0, 21.0, 1.0)), ..Piste::default() }));
    let de = |r: &Json, cle: &str| f(&r["pire_par_net"]["VDD"][cle]);
    let (a, b) = (de(&large, "densite"), de(&etroit, "densite"));
    assert!(b > a * 1.7, "le col ne concentre rien : {b:.2} contre {a:.2}");
    // La borne HAUTE est large, et pour une raison : au coin rentrant la
    // densite est SINGULIERE, et le pic depend donc de la trame. C'est le cas
    // suivant qui s'en occupe.
    assert!(b < a * 4.0, "le col concentre trop : {b:.2} contre {a:.2}");
    // LA TEMPERATURE, elle, DOIT MONTER FRANCHEMENT -- et les deux modeles ne
    // disent pas de combien, ce qui est tout leur interet.
    //
    //   · IPC-2221 va en A^0,725 sous une racine 0,44 : 2^(0,725/0,44) = 3,1.
    //     Elle ne connait que la section, donc elle triple.
    //   · l'ETALEMENT double, a peu de chose pres : la puissance par metre
    //     double avec la section, et la carte evacue presque autant -- elle
    //     perd juste le h*W de la face nue que le col n'a plus. C'est MOINS
    //     alarmant, et c'est ce que la campagne IPC-2152 a mesure.
    let (ta, tb) = (de(&large, "echauffement"), de(&etroit, "echauffement"));
    assert!(1.9 < tb / ta && tb / ta < 2.3, "l'etalement fait x{:.3}, hors de [1,9 ; 2,3]", tb / ta);
    let (ca, cb) = (de(&large, "echauffement_ipc2221"), de(&etroit, "echauffement_ipc2221"));
    let attendu = 2.0f64.powf(0.725 / 0.44);
    assert!((cb / ca - attendu).abs() / attendu < 0.02, "la charte fait x{:.3} au lieu de x{attendu:.3}", cb / ca);
    // La chute, elle, bouge a peine : c'est tout le propos.
    let (da, db) = (chute(&large, "VDD"), chute(&etroit, "VDD"));
    assert!(db < da * 1.35, "la chute suffirait a le voir : {:.4} contre {:.4} mV", db * 1e3, da * 1e3);
    println!("densite x{:.2}, etalement x{:.2} ({ta:.1} -> {tb:.1} K), charte x{:.2}, chute x{:.2} seulement", b / a, tb / ta, cb / ca, db / da);
}

/// dT = (I / (k A^0,725))^(1/0,44), releve sur la charte.
///
/// On la repose ici a la main, avec les memes constantes, pour verifier que
/// c'est bien CELLE-LA qui est appliquee -- et pas une formule voisine.
///
/// ELLE N'EST PLUS LE MODELE D'OFFICE, et le cas le verifie des deux cotes :
/// le tableau `echauffement_ipc2221` la porte toujours, et la demander
/// explicitement la met dans `echauffement`. Sans ce second controle, un
/// document qui demanderait la charte pourrait recevoir l'etalement sans que
/// rien ne le dise.
#[test]
fn la_charte_ipc2221_reste_juste_a_cote_et_sur_demande() {
    let section_mils2 = (2.0 * 0.035) / (0.0254f64 * 0.0254);
    let attendu = (3.0 / (0.048 * section_mils2.powf(0.725))).powf(1.0 / 0.44);

    let p = pire(&Piste::default());
    let e = 100.0 * (f(&p["echauffement_ipc2221"]) - attendu) / attendu;
    assert!(e.abs() < 2.0, "a cote : {:.3} K contre {attendu:.3} attendu ({e:.2} %)", f(&p["echauffement_ipc2221"]));

    let d = document(&piste(&Piste { thermique: Some(r#"{"modele": "ipc2221"}"#.to_string()), ..Piste::default() }));
    let q = &d["pire_par_net"]["VDD"];
    assert!((f(&q["echauffement"]) - attendu).abs() / attendu < 0.02, "demandee : {:.3} K contre {attendu:.3}", f(&q["echauffement"]));
    assert_eq!(d["thermique"]["modele"].as_str(), Some("ipc2221"));
    assert!(d["modele_thermique"].as_str().unwrap().contains("IPC-2221"), "{:?}", d["modele_thermique"]);
    println!("{:.2} K contre {attendu:.2} a la main ({e:.2} %), des deux cotes", f(&p["echauffement_ipc2221"]));
}

/// dT = u / (1 - alpha u), avec u = p' / g. Pose a la main.
///
/// C'EST LE MODELE D'OFFICE, donc celui sur lequel on decide d'elargir une
/// piste : il doit tomber sur l'arithmetique, pas « a peu pres ». Les trois
/// termes se posent separement -- la conductance de nappe, les deux ailettes,
/// la face nue -- et la boucle en resistivite du cuivre par-dessus.
#[test]
fn l_echauffement_d_office_est_le_modele_d_etalement() {
    let r = document(&piste(&Piste { thermique: nue(), ..Piste::default() }));
    let p = &r["pire_par_net"]["VDD"];
    let attendu = dt_etalement(3.0, 2.0, true, 0.0);
    let e = 100.0 * (f(&p["echauffement"]) - attendu) / attendu;
    assert!(e.abs() < 1.0, "{:.4} K contre {attendu:.4} attendu ({e:.2} %)", f(&p["echauffement"]));
    // LA LONGUEUR D'ETALEMENT est ce qui explique le chiffre, et elle repart en
    // MILLIMETRES : sqrt(Ks / 2h) = sqrt(1,28e-3 / 24) = 7,3 mm.
    let th = &r["thermique"];
    assert!((f(&th["longueur_etalement"]) - 7.30).abs() < 0.05, "longueur d'etalement : {:.3} mm", f(&th["longueur_etalement"]));
    assert_eq!(th["modele"].as_str(), Some("etalement"));
    println!("{:.4} K contre {attendu:.4} a la main ({e:.2} %), etalement sur {:.2} mm", f(&p["echauffement"]), f(&th["longueur_etalement"]));
}

/// LE FACTEUR LE PLUS LOURD DE TOUT LE PROBLEME, ET IPC-2221 NE LE VOIT PAS.
///
/// Trente-cinq micrometres de cuivre pleine carte portent 390 * 35e-6 =
/// 1,37e-2 W/K, contre 0,8 * 1,6e-3 = 1,28e-3 pour le stratifie : le plan
/// etale DIX FOIS mieux que la carte nue. La temperature doit tomber d'un
/// facteur trois, et la charte doit rendre EXACTEMENT le meme chiffre qu'avant
/// -- elle ne connait que la section.
#[test]
fn un_plan_de_cuivre_refroidit_et_la_charte_ne_le_voit_pas() {
    let nue_ = pire(&Piste { thermique: nue(), ..Piste::default() });
    let avec = pire(&Piste { thermique: Some(NUE_AVEC_PLAN.to_string()), ..Piste::default() });
    let attendu = dt_etalement(3.0, 2.0, true, 0.035);
    let e = 100.0 * (f(&avec["echauffement"]) - attendu) / attendu;
    assert!(e.abs() < 1.0, "{:.4} K contre {attendu:.4} a la main ({e:.2} %)", f(&avec["echauffement"]));
    let rapport = f(&nue_["echauffement"]) / f(&avec["echauffement"]);
    assert!(rapport > 2.5, "le plan ne refroidit que d'un facteur {rapport:.2}");
    assert!(
        (f(&nue_["echauffement_ipc2221"]) - f(&avec["echauffement_ipc2221"])).abs() < 1e-6,
        "la charte a bouge avec le plan : {:.4} contre {:.4}",
        f(&nue_["echauffement_ipc2221"]),
        f(&avec["echauffement_ipc2221"])
    );
    println!(
        "carte nue {:.2} K, avec un plan {:.2} K (x{rapport:.2}) ; la charte reste a {:.2} K des deux cotes",
        f(&nue_["echauffement"]),
        f(&avec["echauffement"]),
        f(&nue_["echauffement_ipc2221"])
    );
}

/// LES DEUX MODELES SE SEPARENT ICI, ET C'EST LE POINT DE 2152.
///
/// IPC-2221 donne 0,024 a une couche interne contre 0,048 a l'exterieure. Le
/// coefficient est au DENOMINATEUR : une interne y ressort 2^(1/0,44) = 4,83
/// fois plus chaude. La seule facon d'ecarter deux couches autant est de
/// supposer que le stratifie n'evacue RIEN.
///
/// La campagne IPC-2152 a mesure le contraire : le lamine conduit mieux que
/// l'air calme, et une piste noyee est aussi bien refroidie -- a la face nue
/// pres, qu'elle n'a plus. Le modele d'etalement doit donc les rendre
/// VOISINES, quelques pour cent, et l'interne a peine plus chaude.
#[test]
fn la_charte_ecarte_les_couches_de_4_83_l_etalement_les_rapproche() {
    let ext = pire(&Piste { externe: true, thermique: nue(), ..Piste::default() });
    let intr = pire(&Piste { externe: false, thermique: nue(), ..Piste::default() });
    let charte = f(&intr["echauffement_ipc2221"]) / f(&ext["echauffement_ipc2221"]);
    let attendu = 2.0f64.powf(1.0 / 0.44);
    assert!((charte - attendu).abs() / attendu < 0.02, "charte : rapport {charte:.3} au lieu de {attendu:.3}");
    let etal = f(&intr["echauffement"]) / f(&ext["echauffement"]);
    assert!(1.0 < etal && etal < 1.15, "etalement : rapport {etal:.3}, hors de ]1 ; 1,15[");
    // Et l'ecart doit valoir exactement la face nue qu'on a retiree.
    let attendu_int = dt_etalement(3.0, 2.0, false, 0.0);
    assert!((f(&intr["echauffement"]) - attendu_int).abs() / attendu_int < 0.01, "interne : {:.4} K contre {attendu_int:.4} a la main", f(&intr["echauffement"]));
    println!(
        "charte x{charte:.2} (interne {:.1} K contre {:.1} K) ; etalement x{etal:.3} seulement ({:.2} K contre {:.2} K)",
        f(&intr["echauffement_ipc2221"]),
        f(&ext["echauffement_ipc2221"]),
        f(&intr["echauffement"]),
        f(&ext["echauffement"])
    );
}

/// AU-DELA D'UN SEUIL, LE MODELE N'A PLUS DE SOLUTION, ET IL DOIT LE DIRE.
///
/// dT = u / (1 - alpha u) part a l'infini quand alpha u atteint 1 : la
/// resistivite du cuivre monte plus vite que la carte n'evacue. C'est un vrai
/// phenomene -- c'est ainsi qu'une piste fond --, mais un nombre rendu
/// au-dela de ce seuil n'est plus une temperature. On le BORNE, et le resultat
/// porte un avertissement : sans lui, le panneau afficherait « 4200 K » avec
/// le meme aplomb que « 6 K ».
#[test]
fn l_emballement_thermique_se_dit_au_lieu_de_se_rendre() {
    // Une piste de 0,2 mm sous vingt amperes : rien ne tient.
    let r = document(&piste(&Piste { w: 0.2, courant: 20.0, pas: 0.025, thermique: nue(), ..Piste::default() }));
    let p = &r["pire_par_net"]["VDD"];
    let avert: String = liste(&r["avertissements"]).iter().map(|a| a.as_str().unwrap()).collect::<Vec<_>>().join(" ");
    assert!(avert.contains("EMBALLEMENT"), "aucun avertissement : {avert:?}");
    // Borne a u/(1-0,8), donc cinq fois la montee a froid, et pas plus.
    assert!(f(&p["echauffement"]) < 1e5, "{:.1} K rendu", f(&p["echauffement"]));
    println!("{:.0} K borne, et l'avertissement le dit : {}...", f(&p["echauffement"]), avert.chars().take(56).collect::<String>());
}

/// Le meme courant dans un plan de vingt millimetres : la densite s'effondre
/// et la temperature avec. Un chiffre qui ne ferait pas cette difference ne
/// servirait a rien.
#[test]
fn un_plan_large_ne_chauffe_pas() {
    let etroite = pire(&Piste { w: 1.0, ..Piste::default() });
    let plan = pire(&Piste { w: 20.0, pas: 0.25, ..Piste::default() });
    assert!(f(&plan["densite"]) < f(&etroite["densite"]) / 10.0, "{:.2} contre {:.2} A/mm2", f(&plan["densite"]), f(&etroite["densite"]));
    assert!(f(&plan["echauffement"]) < 1.0, "un plan de 20 mm monte de {:.2} K", f(&plan["echauffement"]));
    println!(
        "piste 1 mm : {:.1} A/mm2 et {:.1} K ; plan 20 mm : {:.2} A/mm2 et {:.2} K",
        f(&etroite["densite"]),
        f(&etroite["echauffement"]),
        f(&plan["densite"]),
        f(&plan["echauffement"])
    );
}

/// Le pire point porte SES COORDONNEES. Un maximum sans son adresse oblige
/// a le chercher dans dix mille nombres, ce qui n'est pas une lecture.
#[test]
fn le_pire_point_porte_ses_coordonnees() {
    let r = document(&piste(&Piste { retrecissement: Some((19.0, 21.0, 1.0)), ..Piste::default() }));
    let p = &r["pire_par_net"]["VDD"];
    let x = f(&p["densite_en"][0]);
    assert!((18.0..=22.0).contains(&x), "le pire point est en x = {x:.2}, hors du col");
    assert_eq!(p["densite_en"][2].as_i64(), Some(0), "couche");
    assert_eq!(liste(&r["densite"]).len(), liste(&r["noeuds"]).len(), "un tableau par noeud");
    assert_eq!(liste(&r["echauffement"]).len(), liste(&r["noeuds"]).len(), "un tableau par noeud");
    println!("pire densite en x = {x:.2} mm, dans le col");
}

/// CE CHIFFRE N'EST PAS UNE SIMULATION THERMIQUE, et le resultat doit le
/// dire lui-meme : IPC-2221 est une charte relevee sur un conducteur ISOLE,
/// l'etalement est un modele a trois cotes, et ni l'un ni l'autre ne resout la
/// thermique de la carte. Un utilisateur qui lit « 40 K » sans savoir d'ou ca
/// vient ne peut pas juger si le chiffre le concerne.
///
/// LES COTES SONT DANS LA PHRASE, et c'est ce qui permet de la contester :
/// « 6 K parce que ton stratifie conduit 0,8 » se discute, « 6 K » ne se
/// discute pas. ET LES REPLIS AUSSI : une conductivite supposee et une
/// conductivite declaree ne rendent pas le meme chiffre lisible.
#[test]
fn le_modele_thermique_se_nomme_et_nomme_son_successeur() {
    let r = document(&piste(&Piste::default()));
    let m = r["modele_thermique"].as_str().unwrap_or("");
    assert!(m.contains("IPC-2152"), "la campagne n'est pas nommee : {m:?}");
    assert!(m.contains("IPC-2221"), "la charte n'est pas signalee : {m:?}");
    assert!(m.contains("Supposé"), "les replis ne sont pas dits : {m:?}");
    assert!(r["thermique"]["replis"].vrai(), "aucun repli signale sur un document nu");
    // LES COTES SONT DANS `thermique`, PAS DANS LA PHRASE, et c'est voulu : la
    // page seule connait la virgule decimale francaise. Les poser des deux
    // cotes les faisait paraitre deux fois dans la meme fiche, « 0.80 » puis
    // « 0,80 ».
    for cle in ["k_stratifie", "epaisseur_stratifie", "cuivre_etaleur", "h_surface", "longueur_etalement"] {
        assert!(r["thermique"].get(cle).is_some_and(|v| *v != Json::Nul), "{cle} manque");
    }
    assert!(!m.contains("0.80") && !m.contains("0,80"), "la phrase porte encore les cotes : {m:?}");

    // Tout donne : plus aucun repli a signaler.
    let d = document(&piste(&Piste { thermique: Some(NUE_AVEC_PLAN.to_string()), ..Piste::default() }));
    assert!(!d["thermique"]["replis"].vrai(), "{:?}", d["thermique"]["replis"]);
    assert!(!d["modele_thermique"].as_str().unwrap().contains("Supposé"), "{:?}", d["modele_thermique"]);
    println!("{}...", m.chars().take(64).collect::<String>());
}

/// UN COIN RENTRANT REND LA DENSITE SINGULIERE, et il faut le savoir.
///
/// Le pic croit sans borne quand on raffine la trame : ce n'est pas un defaut
/// du solveur, c'est la solution exacte du probleme -- le champ diverge a
/// l'angle vif. Sur une vraie carte le coin est arrondi par la gravure, et le
/// pic est fini ; sur le modele il ne l'est pas.
///
/// CE QUE CE CAS FIXE, DONC : le pic ponctuel dit OU regarder, jamais COMBIEN.
/// Il est bon pour la carte de chaleur et mauvais comme chiffre. Si un jour il
/// se met a converger, c'est que quelqu'un a lisse quelque chose, et il faudra
/// savoir quoi.
#[test]
fn le_pic_de_densite_ne_converge_pas_et_c_est_la_physique() {
    let pics: Vec<f64> = [0.2, 0.1, 0.05]
        .iter()
        .map(|pas| f(&pire(&Piste { retrecissement: Some((19.0, 21.0, 1.0)), pas: *pas, ..Piste::default() })["densite"]))
        .collect();
    assert!(pics[1] > pics[0] * 1.05 && pics[2] > pics[1] * 1.05, "le pic ne croit plus au raffinement : {pics:?} -- le coin a ete lisse");
    println!("pic : {:.1} -> {:.1} -> {:.1} A/mm2 aux pas 0,2 / 0,1 / 0,05", pics[0], pics[1], pics[2]);
}

/// L'ECHAUFFEMENT, LUI, DOIT ETRE UN CHIFFRE. C'est celui qu'on lit et sur
/// lequel on decide d'elargir une piste : il ne peut pas dependre d'un reglage
/// de maillage.
///
/// Il n'en depend pas parce qu'il ne vient PAS du pic : il vient d'une COUPE.
/// La somme des courants qui franchissent une colonne de carreaux est un flux,
/// et un flux ne se soucie pas de la finesse de la trame. On verifie les deux
/// ensemble -- meme geometrie, memes pas que le cas precedent, ou le pic
/// variait de 38 pour cent.
#[test]
fn l_echauffement_lui_ne_bouge_pas_avec_la_trame() {
    let (mut temperatures, mut chartes, mut largeurs) = (Vec::new(), Vec::new(), Vec::new());
    for pas in [0.2, 0.1, 0.05] {
        let p = pire(&Piste { retrecissement: Some((19.0, 21.0, 1.0)), pas, thermique: nue(), ..Piste::default() });
        temperatures.push(f(&p["echauffement"]));
        chartes.push(f(&p["echauffement_ipc2221"]));
        largeurs.push(f(&p["largeur_chaude"]));
    }
    // LES DEUX MODELES SONT CONTROLES : ils lisent la MEME coupe, donc si le
    // flux derivait avec la trame, les deux deriveraient ensemble.
    let etendue = |serie: &[f64]| (maxi(serie.iter().copied()) - mini(serie.iter().copied())) / mini(serie.iter().copied());
    for (nom, serie) in [("etalement", &temperatures), ("charte", &chartes)] {
        assert!(etendue(serie) < 0.01, "{nom} : la temperature bouge de {:.1} % avec la trame : {serie:?}", 100.0 * etendue(serie));
    }
    // Et c'est bien la section du COL qui est vue, pas celle de la piste.
    for l in &largeurs {
        assert!((l - 1.0).abs() < 0.11, "largeur chaude vue : {l:.3} mm");
    }
    let section_mils2 = (1.0 * 0.035) / (0.0254f64 * 0.0254);
    let charte = (3.0 / (0.048 * section_mils2.powf(0.725))).powf(1.0 / 0.44);
    assert!((chartes[0] - charte).abs() / charte < 0.01, "charte : {:.3} K contre {charte:.3} a la main", chartes[0]);
    let attendu = dt_etalement(3.0, 1.0, true, 0.0);
    let e = 100.0 * (temperatures[0] - attendu) / attendu;
    assert!(e.abs() < 1.0, "{:.3} K contre {attendu:.3} a la main", temperatures[0]);
    println!(
        "{:.3} K aux trois pas ({:.3} % d'ecart), contre {attendu:.3} a la main ; la charte, elle, en annonce {:.1}",
        temperatures[0],
        100.0 * etendue(&temperatures),
        chartes[0]
    );
}

/// Le test vectorise (numpy) des cases dans un polygone rend exactement les
/// cases du test point par point, sommets sur la trame compris.
///
/// Les vingt polygones sont ceux que tirait random.Random(7) dans le banc Python, figes dans
/// tests/polygones_alea.json ; a eux tous ils couvrent 7975 cases (releve sur le Python).
#[test]
fn le_maillage_vectorise_donne_les_memes_cases_que_le_test_point_par_point() {
    let polygones = j(include_str!("polygones_alea.json"));
    assert_eq!(liste(&polygones).len(), 20);
    let mut total = 0;
    for p in liste(&polygones) {
        let sommets: Vec<(f64, f64)> = liste(p).iter().map(|s| (f(&s[0]), f(&s[1]))).collect();
        let vect = cases_dedans(&sommets, 0.0, 0.0, 0.1, 0, 52, 0, 52);
        let mut pur = Vec::new();
        for ix in 0..53i64 {
            for iy in 0..53i64 {
                if dans_polygone(ix as f64 * 0.1, iy as f64 * 0.1, &sommets) {
                    pur.push((ix, iy));
                }
            }
        }
        assert_eq!(vect, pur, "{sommets:?}");
        total += vect.len();
    }
    assert_eq!(total, 7975);
}

// L'echauffement d'un composant qui dissipe (echauffement_composants)

fn composants(texte: &str) -> Result<Json, ErreurDC> {
    echauffement_composants(&j(texte))
}

/// Source = ilot : pas d'etalement, il reste 1 / (2hA + ailette), pose a la main.
///
/// `attendu` est ce que rendait le banc Python avec scipy.special.k0 et k1 (scipy 1.18) :
/// 2 / (h2 * A + 2 * pi * ks * x * k1(x) / k0(x)), x = 0.7725484040463791.
#[test]
fn echauffement_d_un_composant_la_formule_posee_a_la_main() {
    let r = composants(
        r#"{"thermique": {"epaisseur_stratifie": 1.6, "k_stratifie": 0.8, "h_surface": 12},
            "composants": [{"ref": "U1", "puissance_w": 2, "surface_mm2": 100, "source_mm2": 100, "cuivre_um": 35}]}"#,
    )
    .unwrap();
    let r = &r["composants"][0];
    let attendu = 167.03548775206798;
    assert!(f(&r["r_etalement"]) == 0.0 && (f(&r["dT"]) - attendu).abs() < 1e-9 * attendu, "{r:?} {attendu}");
    // ... et la meme formule, avec les K0 et K1 de la caisse
    let (ks, h2, a_m2) = (0.8 * 1.6e-3, 24.0f64, 100e-6f64);
    let x = (a_m2 / PI).sqrt() / (ks / h2).sqrt();
    let ici = 2.0 / (h2 * a_m2 + 2.0 * PI * ks * x * (k1e(x) / k0e(x)));
    assert!((ici - attendu).abs() < 1e-9 * attendu, "{ici} {attendu}");
}

/// Plus de cuivre ou un cuivre plus epais : plus froid ; deux fois la puissance : deux fois dT.
#[test]
fn echauffement_d_un_composant_plus_de_cuivre_plus_froid_dt_proportionnel_a_p() {
    let dt = |puissance: f64, surface: f64, cuivre: f64| {
        let doc = format!(
            r#"{{"thermique": {{"epaisseur_stratifie": 1.6}},
                 "composants": [{{"ref": "D1", "puissance_w": {puissance:?}, "surface_mm2": {surface:?}, "source_mm2": 12, "cuivre_um": {cuivre:?}}}]}}"#
        );
        f(&composants(&doc).unwrap()["composants"][0]["dT"])
    };
    let d0 = dt(1.0, 400.0, 35.0);
    assert!(dt(1.0, 1600.0, 35.0) < d0 && d0 < dt(1.0, 100.0, 35.0), "{d0}");
    assert!(dt(1.0, 400.0, 70.0) < d0);
    assert!((dt(2.0, 400.0, 35.0) - 2.0 * d0).abs() < 1e-9 * d0);
    // l'ordre de grandeur connu : 1 W dans 20 x 20 mm de cuivre 35 um sur FR-4 nu, quelques dizaines de kelvins
    assert!(30.0 < d0 && d0 < 90.0, "{d0}");
}

/// L'ilot couvre la carte : la chaleur ne sort que par ses deux faces, dT >= P / (2 h A_carte).
#[test]
fn echauffement_d_un_composant_la_carte_est_finie() {
    let carte = PI * 13.0 * 13.0; // le disque de 26 mm de LED_UV
    let r = composants(&format!(
        r#"{{"thermique": {{"epaisseur_stratifie": 1.6, "h_surface": 12}}, "carte_mm2": {carte:?},
             "composants": [{{"ref": "LED1", "puissance_w": 1, "surface_mm2": {:?}, "source_mm2": 12, "cuivre_um": 35}}]}}"#,
        carte * 0.9
    ))
    .unwrap();
    let plancher = 1.0 / (2.0 * 12.0 * carte * 1e-6);
    assert!(f(&r["composants"][0]["dT"]) >= plancher, "{:?} {plancher}", r["composants"][0]["dT"]);
    // une surface plus grande que la carte est bornee a la carte
    let r2 = composants(
        r#"{"thermique": {"epaisseur_stratifie": 1.6}, "carte_mm2": 100,
            "composants": [{"ref": "X", "puissance_w": 1, "surface_mm2": 5000, "source_mm2": 1, "cuivre_um": 35}]}"#,
    )
    .unwrap();
    assert!((f(&r2["composants"][0]["surface_mm2"]) - 100.0).abs() < 1e-6, "{r2:?}");
}

#[test]
fn echauffement_d_un_composant_les_refus() {
    let x = |puissance: &str| format!(r#"[{{"ref": "X", "puissance_w": {puissance}, "surface_mm2": 1, "source_mm2": 1, "cuivre_um": 35}}]"#);
    for doc in [
        r#"{"composants": []}"#.to_string(),
        format!(r#"{{"composants": {}}}"#, x(r#""beaucoup""#)),
        format!(r#"{{"composants": {}}}"#, x("500")),
        format!(r#"{{"thermique": {{"k_stratifie": 1e-300}}, "composants": {}}}"#, x("1")),
        format!(r#"{{"thermique": {{"k_stratifie": Infinity}}, "composants": {}}}"#, x("1")),
    ] {
        assert!(composants(&doc).is_err(), "aurait du refuser : {doc}");
    }
}

/// Deux barreaux de 10 x 1 mm, nets VA (y 0..1) et `net_b` (y 2..3).
fn doc_deux_nets(liaisons: &str, net_b: &str, sources: Option<&str>) -> String {
    let defaut = format!(r#"[{{"couche": 0, "net": "{net_b}", "courant": -1.0, "boite": [0, 2, 0.2, 3], "repere": "U2.VDD"}}]"#);
    format!(
        r#"{{"format": "cao-sim-dc-1",
             "polygones": [{{"vertices": [[0, 0], [10, 0], [10, 1], [0, 1]], "couche": 0, "net": "VA", "epaisseur": 0.035}},
                           {{"vertices": [[0, 2], [10, 2], [10, 3], [0, 3]], "couche": 0, "net": "{net_b}", "epaisseur": 0.035}}],
             "references": [{{"couche": 0, "net": "VA", "tension": 3.3, "boite": [0, 0, 0.2, 1], "repere": "U1.OUT"}}],
             "sources": {},
             "liaisons": {liaisons},
             "pas": 0.1}}"#,
        sources.unwrap_or(&defaut)
    )
}

fn borne<'a>(r: &'a Json, repere: &str) -> &'a Json {
    liste(&r["bornes"]).iter().find(|b| b["repere"].as_str() == Some(repere)).unwrap_or_else(|| panic!("pas de borne {repere}"))
}

/// Une ferrite de 0,1 ohm entre VA et VB : tout le courant la traverse, et
/// sa chute I*R s'ajoute au cuivre des deux barreaux.
#[test]
fn un_composant_en_serie_relie_deux_nets_et_sa_chute_i_r_s_ajoute() {
    let li = r#"[{"a": {"couche": 0, "net": "VA", "boite": [9.8, 0, 10, 1]},
                  "b": {"couche": 0, "net": "VB", "boite": [9.8, 2, 10, 3]},
                  "resistance": 0.1, "repere": "FB1"}]"#;
    let r = document(&doc_deux_nets(li, "VB", None));
    let l0 = &r["liaisons"][0];
    assert!((f(&l0["courant"]).abs() - 1.0).abs() < 1e-6, "{l0:?}");
    let cuivre = 2.0 * RESISTIVITE_CUIVRE * 9.8e-3 / (1e-3 * 35e-6);
    let chute = f(&borne(&r, "U2.VDD")["chute"]);
    assert!((chute - (0.1 + cuivre)).abs() / (0.1 + cuivre) < 0.05, "{chute} {}", 0.1 + cuivre);
    println!("chute {:.1} mV dont 100 mV dans FB1", chute * 1e3);
}

#[test]
fn un_composant_en_serie_hors_du_cuivre_est_un_refus_qui_le_nomme() {
    let li = r#"[{"a": {"couche": 0, "net": "AUTRE", "x": 5, "y": 0.5}, "b": {"couche": 0, "net": "VB", "x": 5, "y": 2.5},
                  "resistance": 0.1, "repere": "FB9"}]"#;
    let e = resoudre_document(&j(&doc_deux_nets(li, "VB", None)), None).expect_err("aurait du refuser");
    assert!(e.message.contains("FB9"), "{}", e.message);
}

/// Rail et masse dans le meme calcul : la charge tire 1 A du rail et le rend
/// a la masse. La borne de masse remonte de R*I au-dessus de 0 V, et sa chute
/// se lit contre SA reference (0 V), pas contre les 3,3 V du rail.
#[test]
fn la_masse_se_mesure_a_ses_0_v_dans_le_meme_calcul_que_le_rail() {
    let r = document(
        r#"{"format": "cao-sim-dc-1",
            "polygones": [{"vertices": [[0, 2], [10, 2], [10, 3], [0, 3]], "couche": 0, "net": "VB", "epaisseur": 0.035},
                          {"vertices": [[0, 4], [10, 4], [10, 5], [0, 5]], "couche": 0, "net": "GND", "epaisseur": 0.035}],
            "references": [{"couche": 0, "net": "VB", "tension": 3.3, "boite": [0, 2, 0.2, 3], "repere": "U1.OUT"},
                           {"couche": 0, "net": "GND", "tension": 0.0, "boite": [0, 4, 0.2, 5], "repere": "U1.GND"}],
            "sources": [{"couche": 0, "net": "VB", "courant": -1.0, "boite": [9.8, 2, 10, 3], "repere": "U2.VDD", "composant": "U2"},
                        {"couche": 0, "net": "GND", "courant": 1.0, "boite": [9.8, 4, 10, 5], "repere": "U2.GND", "composant": "U2"}],
            "liaisons": [],
            "pas": 0.1}"#,
    );
    let (gnd, vdd) = (borne(&r, "U2.GND"), borne(&r, "U2.VDD"));
    let attendu = RESISTIVITE_CUIVRE * 9.8e-3 / (1e-3 * 35e-6);
    assert!((f(&gnd["tension"]) - attendu).abs() / attendu < 0.05, "{gnd:?} {attendu}");
    assert!((-f(&gnd["chute"]) - attendu).abs() / attendu < 0.05, "{gnd:?}");
    assert!((f(&vdd["chute"]) - attendu).abs() / attendu < 0.05, "{vdd:?}");
    assert!(gnd["composant"].as_str() == Some("U2") && gnd["net"].as_str() == Some("GND"));
    println!("rail -{:.1} mV, masse +{:.1} mV", f(&vdd["chute"]) * 1e3, f(&gnd["tension"]) * 1e3);
}

#[test]
fn le_placage_de_chaque_via_repart_en_mm() {
    let r = document(
        r#"{"format": "cao-sim-dc-1",
            "polygones": [{"vertices": [[0, 0], [10, 0], [10, 1], [0, 1]], "couche": 0, "net": "VA", "epaisseur": 0.035},
                          {"vertices": [[0, 0], [10, 0], [10, 1], [0, 1]], "couche": 1, "net": "VA", "epaisseur": 0.035}],
            "references": [{"couche": 0, "net": "VA", "tension": 3.3, "boite": [0, 0, 0.2, 1], "repere": "U1.OUT"}],
            "sources": [{"couche": 1, "net": "VA", "courant": -1.0, "boite": [9.8, 0, 10, 1]}],
            "liaisons": [],
            "vias": [{"x": 5, "y": 0.5, "couche_a": 0, "couche_b": 1, "net": "VA", "percage": 0.3, "placage": 0.02}],
            "pas": 0.1}"#,
    );
    assert!((f(&r["vias"][0]["placage"]) - 0.02).abs() < 1e-12, "{:?}", r["vias"][0]);
}

/// Le plan GND, pose d'abord, et son degagement autour du barreau VA : le
/// degagement porte le net GND et laisse le barreau entier. Sans net, il
/// l'evide, et VA n'a plus de cuivre.
#[test]
fn un_trou_de_plan_n_evide_que_son_net_un_trou_sans_net_evide_tout() {
    let doc = |net_trou: &str| {
        format!(
            r#"{{"format": "cao-sim-dc-1",
                 "polygones": [
                     {{"vertices": [[0, 0], [10, 0], [10, 3], [0, 3]], "couche": 0, "net": "GND", "epaisseur": 0.035}},
                     {{"vertices": [[0, 0], [10, 0], [10, 1], [0, 1]], "couche": 0, "net": "VA", "epaisseur": 0.035}},
                     {{"vertices": [[0, 0], [10, 0], [10, 1.5], [0, 1.5]], "couche": 0, "net": "{net_trou}", "epaisseur": 0.035, "trou": true}}],
                 "references": [{{"couche": 0, "net": "VA", "tension": 3.3, "boite": [0, 0, 0.2, 1], "repere": "U1.OUT"}},
                                {{"couche": 0, "net": "GND", "tension": 0, "boite": [0, 2, 0.2, 3], "repere": "U1.GND"}}],
                 "sources": [{{"couche": 0, "net": "VA", "courant": -1.0, "boite": [9.8, 0, 10, 1], "repere": "U2.VDD"}}],
                 "pas": 0.1}}"#
        )
    };
    let r = document(&doc("GND"));
    let chute = f(&borne(&r, "U2.VDD")["chute"]);
    let attendu = RESISTIVITE_CUIVRE * 9.8e-3 / (1e-3 * 35e-6);
    assert!((chute - attendu).abs() / attendu < 0.05, "{chute} {attendu}");
    let r = document(&doc(""));
    assert!(!liste(&r["bornes"]).iter().any(|b| b["net"].as_str() == Some("VA")), "{:?}", r["bornes"]);
    println!("barreau intact : -{:.1} mV ; sans net, le trou l'evide", chute * 1e3);
}

/// Un morceau de VB que rien ne relie et qui ne porte rien : tenu a sa
/// consigne et signale. Le meme morceau avec une charge reste un refus.
#[test]
fn un_ilot_sans_courant_ni_reference_ne_bloque_pas_le_calcul() {
    let source = r#"{"couche": 0, "net": "VA", "courant": -1.0, "boite": [9.8, 0, 10, 1], "repere": "U2.VDD"}"#;
    let r = document(&doc_deux_nets("[]", "VA", Some(&format!("[{source}]"))));
    assert!(liste(&r["avertissements"]).iter().any(|a| a.as_str().unwrap().contains("isolé")), "{:?}", r["avertissements"]);
    let chargee = format!(r#"[{source}, {{"couche": 0, "net": "VA", "courant": -0.1, "boite": [9.8, 2, 10, 3]}}]"#);
    let e = resoudre_document(&j(&doc_deux_nets("[]", "VA", Some(&chargee))), None).expect_err("un ilot charge aurait du etre refuse");
    assert!(e.message.contains("aucune référence"), "{}", e.message);
    println!("ilot tolere, ilot charge refuse");
}

// -----------------------------------------------------------------------------
// LA PISTE OBLIQUE : la trame est carree, la carte ne l'est pas
// -----------------------------------------------------------------------------

/// Le barreau 40 x 2 mm, 35 um, 3 A, tourne de `angle` degres : R, donc
/// la chute et l'echauffement, ne dependent pas de l'angle.
fn barreau_tourne(angle: f64, pas: Option<f64>, rho: f64) -> Json {
    let (l, w) = (40e-3, 2e-3);
    let (c, s) = (angle.to_radians().cos(), angle.to_radians().sin());
    let rot = |x: f64, y: f64| (x * c - y * s, x * s + y * c);
    let sommet = |x: f64, y: f64| format!("[{:?}, {:?}]", rot(x, y).0, rot(x, y).1);
    let (a, b) = (rot(1e-3, w / 2.0), rot(l - 1e-3, w / 2.0));
    resoudre(
        &format!(
            r#"[{{"vertices": [{}, {}, {}, {}], "couche": 0, "net": "VCC", "epaisseur": 35e-6}}]"#,
            sommet(0.0, 0.0),
            sommet(l, 0.0),
            sommet(l, w),
            sommet(0.0, w)
        ),
        &format!(r#"[{{"x": {:?}, "y": {:?}, "couche": 0, "net": "VCC", "courant": 3.0, "rayon": 1e-3}}]"#, a.0, a.1),
        &format!(r#"[{{"x": {:?}, "y": {:?}, "couche": 0, "net": "VCC", "tension": 0.0, "rayon": 1e-3}}]"#, b.0, b.1),
        "[]",
        pas,
        rho,
    )
    .unwrap()
}

/// La coupe suit la trame : a 45 degres elle voyait W.racine(2) de cuivre
/// et rendait 4,2 K pour 6,06. La section est ramenee a la perpendiculaire
/// du courant.
#[test]
fn une_piste_oblique_chauffe_comme_la_meme_piste_droite() {
    let droit = maxi(nombres(&barreau_tourne(0.0, Some(0.25e-3), RESISTIVITE_CUIVRE)["echauffement"]));
    for angle in [30.0, 45.0] {
        let dt = maxi(nombres(&barreau_tourne(angle, Some(0.25e-3), RESISTIVITE_CUIVRE)["echauffement"]));
        assert!((dt / droit - 1.0).abs() < 0.05, "{angle} {dt} {droit}");
        println!("{angle} deg : {dt:.2} K (droit {droit:.2} K)");
    }
}

/// R = rho L / (W t) ne depend pas de l'angle. Au pas PAR DEFAUT (5
/// carreaux en travers) le bord en escalier rendait +14 % a 30 degres et
/// +18 % a 45 ; les aretes de bord ponderees par leur cuivre le ramenent sous
/// 3 %. La pente au milieu du barreau est celle du calcul a la main.
#[test]
fn une_piste_oblique_chute_comme_la_meme_piste_droite() {
    let main = RESISTIVITE_CUIVRE * 3.0 / (2e-3 * 35e-6); // V/m
    for angle in [0.0f64, 30.0, 45.0, 90.0] {
        let r = barreau_tourne(angle, None, RESISTIVITE_CUIVRE);
        let (c, s) = (angle.to_radians().cos(), angle.to_radians().sin());
        let le_long: Vec<(f64, f64)> =
            liste(&r["noeuds"]).iter().zip(nombres(&r["potentiel"])).map(|(n, v)| (f(&n[0]) * c + f(&n[1]) * s, v)).collect();
        // min(le_long, key=...) : le premier des plus proches
        let proche = |x: f64| le_long.iter().fold(le_long[0], |m, t| if (t.0 - x).abs() < (m.0 - x).abs() { *t } else { m });
        let (a, b) = (proche(12e-3), proche(28e-3));
        let ecart = (a.1 - b.1) / (b.0 - a.0) / main - 1.0;
        assert!(ecart.abs() < 0.03, "{angle} {ecart}");
        println!("{angle} deg : {:+.1} %", 100.0 * ecart);
    }
}

/// Une piste alignee dont la largeur n'est pas un multiple du pas : 1 mm
/// au pas de 0,4 comptait 3 carreaux, soit 1,2 mm et -17 % de chute.
#[test]
fn une_piste_droite_hors_trame_garde_sa_largeur() {
    let (l, w) = (40e-3, 1e-3);
    let r = resoudre(
        &format!(r#"[{{"vertices": [[0, 0], [{l:?}, 0], [{l:?}, {w:?}], [0, {w:?}]], "couche": 0, "net": "VCC", "epaisseur": 35e-6}}]"#),
        &format!(r#"[{{"boite": [0, 0, 0.5e-3, {w:?}], "couche": 0, "net": "VCC", "courant": 1.0}}]"#),
        &format!(r#"[{{"boite": [{:?}, 0, {l:?}, {w:?}], "couche": 0, "net": "VCC", "tension": 0.0}}]"#, l - 0.5e-3),
        "[]",
        Some(0.4e-3),
        RESISTIVITE_CUIVRE,
    )
    .unwrap();
    let potentiel = nombres(&r["potentiel"]);
    // v[(round(x mm, 1), round(y mm, 1))]
    let v = |x: f64, y: f64| {
        let dixieme = |a: f64| (a * 1e4).round() as i64;
        let k = liste(&r["noeuds"]).iter().position(|n| dixieme(f(&n[0])) == dixieme(x * 1e-3) && dixieme(f(&n[1])) == dixieme(y * 1e-3));
        potentiel[k.unwrap_or_else(|| panic!("pas de noeud en ({x}, {y})"))]
    };
    let pente = (v(10.0, 0.4) - v(30.0, 0.4)) / 20e-3;
    let main = RESISTIVITE_CUIVRE * 1.0 / (w * 35e-6);
    assert!((pente / main - 1.0).abs() < 0.005, "{pente} {main}");
    // ... et la densite du pire carreau est I / (W t), pas celle d'un bord.
    let dens = f(&r["pire_par_net"]["VCC"]["densite"]);
    assert!((dens / (1.0 / (1.0 * 0.035)) - 1.0).abs() < 0.02, "{dens}");
    println!("{pente:.4} V/m contre {main:.4} a la main, {dens:.2} A/mm2");
}

/// Sur l'axe des deux bornes, le courant longe la coupe et son flux net
/// est un reste : cos a tombait a 1e-9, la section avec lui, et le disque de
/// 10 mm rendait 48 millions de kelvins pour un demi-kelvin.
#[test]
fn un_disque_entre_deux_bornes_ne_fond_pas() {
    let rayon = 10e-3;
    let sommets: Vec<String> = (0..60)
        .map(|k| {
            let a = 2.0 * PI * k as f64 / 60.0;
            format!("[{:?}, {:?}]", rayon + rayon * a.cos(), rayon + rayon * a.sin())
        })
        .collect();
    let r = resoudre(
        &format!(r#"[{{"vertices": [{}], "couche": 0, "net": "VCC", "epaisseur": 35e-6}}]"#, sommets.join(", ")),
        &format!(r#"[{{"x": {:?}, "y": {rayon:?}, "couche": 0, "net": "VCC", "courant": 3.0, "rayon": 0.5e-3}}]"#, 0.4 * rayon),
        &format!(r#"[{{"x": {:?}, "y": {rayon:?}, "couche": 0, "net": "VCC", "tension": 0.0, "rayon": 0.5e-3}}]"#, 1.6 * rayon),
        "[]",
        Some(0.25e-3),
        RESISTIVITE_CUIVRE,
    )
    .unwrap();
    let pire = maxi(nombres(&r["echauffement"]));
    assert!(0.3 < pire && pire < 1.0, "{pire}");
    println!("pire {pire:.2} K");
}

/// `rho` double : la chute double, et l'echauffement d'etalement suit
/// (il restait a 6,06 K, calcule sur le cuivre par defaut).
#[test]
fn la_resistivite_saisie_entre_aussi_dans_l_echauffement() {
    let a = barreau_tourne(0.0, Some(0.25e-3), RESISTIVITE_CUIVRE);
    let b = barreau_tourne(0.0, Some(0.25e-3), 2.0 * RESISTIVITE_CUIVRE);
    let k = maxi(nombres(&b["echauffement_etalement"])) / maxi(nombres(&a["echauffement_etalement"]));
    assert!(2.0 < k && k < 2.15, "{k}"); // x2, plus la boucle en temperature
    println!("rho x2 : echauffement x{k:.3}");
}

/// La part dc_solver de python/test/banc-entrees-malformees.py : un champ d'un autre type
/// que prevu sort par le refus du module (422 lisible), jamais par une panique.
#[test]
fn les_documents_malformes_sont_refuses() {
    let tri = r#"{"vertices": [[0, 0], [1, 0], [1, 1]]}"#;
    for doc in [
        r#"{"polygones": "x"}"#.to_string(),
        r#"{"polygones": [null]}"#.to_string(),
        r#"{"polygones": [{"vertices": [[0, 0], [1, 0], [1, 1]], "epaisseur": "x"}]}"#.to_string(),
        format!(r#"{{"polygones": [{tri}], "pas": "x"}}"#),
        format!(r#"{{"polygones": [{tri}], "pas": [1]}}"#),
        format!(r#"{{"polygones": [{tri}], "pas": 1e-310}}"#),
        format!(r#"{{"polygones": [{tri}], "sources": [{{"x": "a"}}]}}"#),
    ] {
        assert!(resoudre_document(&j(&doc), None).is_err(), "accepte : {doc}");
    }
}
