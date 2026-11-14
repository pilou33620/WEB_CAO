//! Banc de test des routes de gestion des bibliothèques (/api/lib/...) :
//! python/test/banc-lib-routes.py, cas pour cas (les noms sont les siens).
//!
//! Les essais travaillent sur une copie jetable de la LIB. Sans la vraie (dépôt privé
//! WEB_SUITE_PROJETS absent), une LIB factice la remplace : les cas qui éprouvent le
//! CONTENU de la vraie -- le catalogue de plus de 500 composants, ses 39 colonnes, les
//! modèles Murata -- sont sautés avec un avertissement, les autres tournent quand même.

use crate::commun::*;
use web_cao::chemins::realpath;
use web_cao::poste::Poste;

/// Un serveur en écoute locale dont le dépôt est un dossier d'essai (config_lib.json s'y
/// écrit) et la LIB par défaut une copie jetable ; rend aussi « la vraie LIB est là ».
fn serveur(nom: &str, regler: impl FnOnce(&mut Poste)) -> (String, Lance, bool) {
    let d = dossier_neuf(nom);
    let (lib, reelle) = lib_copie(&d);
    let mut poste = Poste::new(&format!("{d}/depot"), true);
    std::fs::create_dir_all(&poste.racine).unwrap();
    poste.lib_defaut = Some(lib);
    regler(&mut poste);
    (d, lancer(poste), reelle)
}

fn saute(quoi: &str) {
    println!("[!] sauté : {quoi} (la vraie LIB n'est pas sur ce poste)");
}

#[test]
fn test_00_a_11_lecture_et_configuration() {
    let (d, s, reelle) = serveur("webcao-lib-lecture", |_| {});
    let p = s.port;

    // test_00 : la table du calcul PDN suit la bibliotheque : chaque .sub Murata y
    // figure, un modele generique ({C}, {L}) non (les cas de parasites_spice : src/lib_cao.rs)
    let data = get(p, "/api/lib/parasites").json();
    assert!(data.get("CAPACITOR").is_none() && data.get("RESISTOR").is_none());
    if reelle {
        // ESL = somme des selfs de l'echelle, ESR = Re Z a f0 (avant : L02 / R03 du seul premier etage)
        assert_eq!(dumps(&data["GCM155R71C104KA55"]), r#"{"c": 1.02e-07, "esl": 3.86e-10, "esr": 0.0195}"#);
        assert_eq!(dumps(&data["LQW15AN10NG00"]), r#"{"l": 1.2e-08, "dcr": 0.12}"#);
    } else {
        saute("test_00, les parasites des modeles Murata");
    }

    // test_01_lib_fichiers
    let r = get(p, "/api/lib/fichiers");
    let data = r.json();
    assert_eq!(r.code, 200);
    let noms = |genre: &str| data[genre].as_liste().unwrap_or_else(|| panic!("{genre} absent")).clone();
    assert!(!noms("pcb").is_empty() && !noms("schematique").is_empty() && !noms("simulation").is_empty());
    assert!(noms("pcb").contains(&"0603.json".into()) && noms("schematique").contains(&"resistor.json".into()));

    // test_02_lib_fichier_pcb
    let r = get(p, "/api/lib/fichier?type=pcb&nom=0603.json");
    let data = r.json();
    assert!(r.code == 200 && data["type"].as_str() == Some("pcb") && data["nom"].as_str() == Some("0603.json"));
    let fp = &data["data"];
    assert!(fp["name"].as_str() == Some("0603") && fp["pins"].as_i64() == Some(2) && fp["pads"].as_liste().is_some());
    // test_02b : le nom des commandes de pilotage, sans .json : le fichier .json est rendu
    let data = get(p, "/api/lib/fichier?type=pcb&nom=0603").json();
    assert!(data["nom"].as_str() == Some("0603.json") && data["data"]["name"].as_str() == Some("0603"));
    // test_03_lib_fichier_schematique
    let data = get(p, "/api/lib/fichier?type=schematique&nom=resistor.json").json();
    assert!(data["type"].as_str() == Some("schematique") && data["data"]["id"].as_str() == Some("resistor") && data["data"]["prefix"].as_str() == Some("R"));
    // test_04_lib_fichier_simulation
    let data = get(p, "/api/lib/fichier?type=simulation&nom=resistor.sub").json();
    assert!(data["type"].as_str() == Some("simulation") && data["contenu"].as_str().unwrap().contains("RESISTOR"));

    // test_05_lib_composants
    let r = get(p, "/api/lib/composants");
    let data = r.json();
    assert!(r.code == 200 && data.get("composants").is_some());
    let colonnes: Vec<&str> = data["colonnes"].as_liste().unwrap().iter().filter_map(Json::as_str).collect();
    for col in ["Empreinte PCB", "Empreinte Schématique", "Modèle Simulation"] {
        assert!(colonnes.contains(&col), "{col}");
    }
    // test_09_exact_39_colonnes_catalogue
    if reelle {
        assert!(data["total"].as_i64().unwrap() > 500);
        let attendues = [
            "Part Name", "Part Type", "Description", "Par class", "Reference designator Prefix", "Number Of pins", "Maximun Height", "Standoof Height", "Value",
            "Device type", "Part Number", "Manufacturer", "manufacturer part Number", "Vendor", "Dielectrique", "vendor reference", "Source alternative",
            "2nd source P/N", "2nd source Manufacturer", "3nd source P/N", "3nd source Manufacturer", "4nd source P/N", "4nd source Manufacturer", "tolerance",
            "wattage", "fréquency", "PPM", "Voltage Rating", "current Rating", "Maximum operating temperature", "Minimum operating temperature", "Package type",
            "Dimenssions", "terminal pitch", "mounting type", "gender", "Empreinte PCB", "Empreinte Schématique", "Modèle Simulation",
        ];
        assert_eq!(attendues.len(), 39);
        assert_eq!(colonnes[..39], attendues);
        // « Brochage » (broche du symbole -> patte de l'empreinte), puis le
        // modele 3D et sa pose viennent en fin de
        // ligne ; une LIB plus ancienne ne les a pas encore
        let fin = ["Brochage", "Modèle 3D", "Position 3D"];
        assert!(colonnes.len() <= 42 && colonnes[39..] == fin[..colonnes.len() - 39], "{:?}", &colonnes[39..]);
    } else {
        saute("test_05 et test_09, le catalogue de plus de 500 composants et ses 39 colonnes");
    }

    // test_06_traversal_rejet
    assert_eq!(get(p, "/api/lib/fichier?type=pcb&nom=../../web_CAO.py").code, 400);
    // test_07 : l'assistant IA intégré est retiré : la route qui rendait sa clé n'existe plus
    assert_eq!(get(p, "/api/ia/cle").code, 404);

    // test_08_creer_modifier_fichier_lib
    let fp = r#"{"type": "pcb", "nom": "_test_tmp_fp.json", "data": {"format": "pcbfp-1", "name": "TEST_FP", "pkg": "TEST", "pins": 2, "pads": [
        {"n": 1, "x": -1.0, "y": 0, "w": 0.8, "h": 1.0, "shape": "rect", "drill": 0, "rot": 0},
        {"n": 2, "x": 1.0, "y": 0, "w": 0.8, "h": 1.0, "shape": "rect", "drill": 0, "rot": 0}]}}"#;
    let r = post(p, "/api/lib/fichier", fp);
    assert!(r.code == 200 && r.json()["ok"] == Json::Bool(true), "{}", r.texte());
    let r = get(p, "/api/lib/fichier?type=pcb&nom=_test_tmp_fp.json");
    assert!(r.code == 200 && r.json()["data"]["name"].as_str() == Some("TEST_FP"));
    // ce qui est écrit : json.dumps(data, indent=2)
    let ecrit = std::fs::read_to_string(format!("{d}/LIB/lib_empreinte_pcb/_test_tmp_fp.json")).unwrap();
    assert!(ecrit.starts_with("{\n  \"format\": \"pcbfp-1\",\n  \"name\": \"TEST_FP\",") && ecrit.contains("\"x\": -1.0,"), "{ecrit}");
    assert_eq!(requete(p, "DELETE", "/api/lib/fichier?type=pcb&nom=_test_tmp_fp.json", &[], b"").code, 200);
    assert_eq!(get(p, "/api/lib/fichier?type=pcb&nom=_test_tmp_fp.json").code, 404);

    // test_10_lib_config_get
    let r = get(p, "/api/lib/config");
    let data = r.json();
    assert!(r.code == 200 && data.get("chemin").is_some() && data.get("defaut").is_some());
    assert!(data["est_defaut"] == Json::Bool(true) && data["existe"] == Json::Bool(true));
    assert!(data["statistiques"]["composants"].as_i64().unwrap() > 0, "{}", r.texte());

    // test_11_lib_config_post_personnalise_et_reset
    let perso = format!("{d}/_test_tmp_lib_custom");
    // 1. Configurer un dossier personnalisé avec initialisation automatique
    let r = post(p, "/api/lib/config", &format!(r#"{{"chemin": "{perso}", "initialiser": true}}"#));
    let data = r.json();
    assert!(r.code == 200 && data["ok"] == Json::Bool(true) && data["est_defaut"] == Json::Bool(false), "{}", r.texte());
    assert!(data["fichiers_copies"].as_i64().unwrap() > 0 && std::path::Path::new(&format!("{perso}/LIB_composants.csv")).exists());
    assert!(data["statistiques"]["csv_present"] == Json::Bool(true));
    // 2. Vérifier que GET /api/lib/config reflète ce nouveau dossier
    let data = get(p, "/api/lib/config").json();
    assert!(data["est_defaut"] == Json::Bool(false) && realpath(data["chemin"].as_str().unwrap()) == realpath(&perso));
    // le choix se retient d'un lancement à l'autre (config_lib.json), et un autre serveur du même dépôt le reprend
    let cfg = loads(&std::fs::read_to_string(format!("{d}/depot/config_lib.json")).unwrap()).unwrap();
    assert!(cfg["chemin"].as_str() == Some(perso.as_str()) && cfg["date"].as_str().is_some_and(|t| t.len() == 26 && t.as_bytes()[10] == b'T'), "{}", dumps(&cfg));
    assert_eq!(Poste::new(&format!("{d}/depot"), true).dossier_lib(), perso);
    // 3. Réinitialiser par défaut
    let r = post(p, "/api/lib/config", r#"{"chemin": "", "initialiser": false}"#);
    let data = r.json();
    assert!(r.code == 200 && data["ok"] == Json::Bool(true) && data["est_defaut"] == Json::Bool(true));
    assert!(!std::path::Path::new(&format!("{d}/depot/config_lib.json")).exists());
    for (corps, code) in [(r#"{"chemin": "https://exemple.fr/lib"}"#, 400), (r#"{"chemin": "/nulle/part/du/tout", "initialiser": false}"#, 404), ("[1]", 400)] {
        assert_eq!(post(p, "/api/lib/config", corps).code, code, "{corps}");
    }
}

/// Les essais qui ECRIVENT : une bibliotheque jetable hors du depot (`tmp`), avec le
/// catalogue de la LIB et un dossier d'empreintes vide.
fn serveur_tmp(nom: &str, regler: impl FnOnce(&mut Poste)) -> (String, Lance, bool) {
    let (d, s, reelle) = serveur(nom, regler);
    let tmp = format!("{d}/webcao_lib");
    std::fs::create_dir_all(format!("{tmp}/lib_empreinte_pcb")).unwrap();
    std::fs::copy(format!("{d}/LIB/LIB_composants.csv"), format!("{tmp}/LIB_composants.csv")).unwrap();
    s.poste.definir_dossier_lib(&tmp, false, false).unwrap();
    (tmp, s, reelle)
}

fn json_de(s: &Lance, url: &str, corps: Option<&str>) -> Json {
    let r = match corps {
        None => get(s.port, url),
        Some(c) => post(s.port, url, c),
    };
    assert_eq!(r.code, 200, "{url} : {}", r.texte());
    r.json()
}

fn refus(s: &Lance, url: &str, corps: &str) -> u16 {
    post(s.port, url, corps).code
}

#[test]
fn test_12_catalogue_enregistre_sans_ligne_vide_et_relu_a_l_identique() {
    let (tmp, s, _) = serveur_tmp("webcao-lib-12", |_| {});
    let cat = json_de(&s, "/api/lib/composants", None);
    let total = cat["total"].as_i64().unwrap();
    // le cas qui cassait la relecture : un champ sur deux lignes, avec
    // le separateur et des guillemets dedans
    let piege = "ligne 1\nligne 2 ; \"cite\"";
    let mut composants = cat["composants"].as_liste().unwrap().clone();
    if let Json::Objet(o) = &mut composants[3] {
        o.insert("Description".into(), piege.into());
    }
    json_de(&s, "/api/lib/composants", Some(&format!(r#"{{"colonnes": {}, "composants": {}}}"#, dumps(&cat["colonnes"]), dumps(&Json::Liste(composants)))));
    let brut = std::fs::read(format!("{tmp}/LIB_composants.csv")).unwrap();
    let contient = |motif: &[u8]| brut.windows(motif.len()).any(|f| f == motif);
    assert!(!contient(b"\r\r\n"), "fins de ligne doublees a l'ecriture");
    assert!(!contient(b"\r\n\r\n"), "ligne vide dans le CSV enregistre");
    let relu = json_de(&s, "/api/lib/composants", None);
    assert_eq!(relu["total"].as_i64(), Some(total));
    assert_eq!(relu["colonnes"], cat["colonnes"]);
    assert_eq!(relu["composants"][3]["Description"].as_str(), Some(piege));
    assert_eq!(relu["composants"][4]["Part Name"], cat["composants"][4]["Part Name"]);
}

#[test]
fn test_12b_corps_trop_gros_refuse_en_413_et_non_en_500() {
    let (_, s, _) = serveur_tmp("webcao-lib-12b", |poste| poste.max_lib = 1024);
    assert_eq!(refus(&s, "/api/lib/composants", &format!(r#"{{"colonnes": ["Part Name"], "composants": [{{"Part Name": "{}"}}]}}"#, "x".repeat(4096))), 413);
}

#[test]
fn test_13_catalogue_ancien_format_crcrlf_toujours_lisible() {
    let (tmp, s, reelle) = serveur_tmp("webcao-lib-13", |_| {});
    let chemin = format!("{tmp}/LIB_composants.csv");
    let propre = String::from_utf8(std::fs::read(&chemin).unwrap()).unwrap();
    let avant = json_de(&s, "/api/lib/composants", None)["total"].as_i64().unwrap();
    ecrire(&chemin, propre.replace("\r\n", "\r\r\n"));
    let cat = json_de(&s, "/api/lib/composants", None);
    assert!(cat["total"].as_i64() == Some(avant) && (avant > 500 || !reelle));
    assert!(cat["composants"].as_liste().unwrap().iter().all(|c| c["Part Name"].vrai()), "une ligne vide est devenue un composant");
}

#[test]
fn test_13b_fichier_si_absent_jamais_d_ecrasement() {
    let (tmp, s, _) = serveur_tmp("webcao-lib-13b", |_| {});
    let corps = |nom: &str, si_absent: bool| format!(r#"{{"type": "pcb", "nom": "ESSAI.json", "data": {{"format": "pcbfp-1", "name": "{nom}", "pads": []}}{}}}"#, if si_absent { r#", "si_absent": true"# } else { "" });
    assert!(json_de(&s, "/api/lib/fichier", Some(&corps("ESSAI", true)))["ok"] == Json::Bool(true));
    let chemin = format!("{tmp}/lib_empreinte_pcb/ESSAI.json");
    let avant = std::fs::read(&chemin).unwrap();
    assert_eq!(refus(&s, "/api/lib/fichier", &corps("AUTRE", true)), 409);
    assert_eq!(std::fs::read(&chemin).unwrap(), avant, "le fichier existant a bouge");
    // sans si_absent : le comportement d'avant (remplacement)
    assert!(json_de(&s, "/api/lib/fichier", Some(&corps("AUTRE", false)))["ok"] == Json::Bool(true));
    assert!(std::fs::read_to_string(&chemin).unwrap().contains("AUTRE"));
    let restes: Vec<String> = std::fs::read_dir(format!("{tmp}/lib_empreinte_pcb")).unwrap().flatten().map(|e| e.file_name().to_string_lossy().into_owned()).filter(|n| n.ends_with(".tmp")).collect();
    assert!(restes.is_empty(), "fichier temporaire laisse : {restes:?}");
}

/// Une case modifiée : les autres lignes du catalogue restent octet pour octet, dans son
/// encodage et avec ses fins de ligne. Rend le chemin et la Part Name visée.
fn modifier_garde_les_octets(s: &Lance, tmp: &str, latin1: bool, fin: &str, bom: bool) -> (String, String) {
    let chemin = format!("{tmp}/LIB_composants.csv");
    let lu = String::from_utf8(std::fs::read(&chemin).unwrap()).unwrap();
    let texte = lu.trim_start_matches('\u{feff}').replace("\r\n", "\n");
    let texte = texte.trim_end_matches('\n').replace('\n', fin) + fin;
    let mut brut = if bom { b"\xef\xbb\xbf".to_vec() } else { Vec::new() };
    // encode(encodage, errors="replace")
    brut.extend(if latin1 { texte.chars().map(|c| u8::try_from(c as u32).unwrap_or(b'?')).collect() } else { texte.into_bytes() });
    if latin1 {
        // un octet que cp1252 ne connaît pas : sans lui, un catalogue Latin-1 se lit en cp1252
        // (qui écrit « € »), et le refus attendu par test_13d dépendrait du contenu de la LIB
        brut.extend(b"ZZ-LATIN1;\x81");
        brut.extend(fin.as_bytes());
    }
    ecrire(&chemin, &brut);
    let cat = json_de(s, "/api/lib/composants", None);
    let visee = cat["composants"][1].clone();
    let part = visee["Part Name"].as_str().unwrap().to_string();
    let r = json_de(s, "/api/lib/composants", Some(&format!("{{\"modifier\": {{\"part\": {}, \"champs\": {{\"Value\": \"3V3 \u{e9}\"}}, \"avant\": {{\"Value\": {}}}}}}}", dumps(&visee["Part Name"]), dumps(&visee["Value"]))));
    assert_eq!((dumps(&r["champs"]), r["mtime_avant"].as_i64()), ("{\"Value\": \"3V3 \u{e9}\"}".to_string(), cat["mtime_ms"].as_i64()));
    let apres = std::fs::read(&chemin).unwrap();
    assert_eq!(apres.starts_with(b"\xef\xbb\xbf"), bom, "BOM");
    let relu = json_de(s, "/api/lib/composants", None);
    assert_eq!(relu["composants"][1]["Value"].as_str(), Some("3V3 \u{e9}"));
    let mut attendus = cat["composants"].as_liste().unwrap().clone();
    if let Json::Objet(o) = &mut attendus[1] {
        o.insert("Value".into(), "3V3 \u{e9}".into());
    }
    assert!(relu["composants"] == Json::Liste(attendus), "une autre case a change");
    let lignes = |o: &[u8]| -> Vec<Vec<u8>> { String::from_utf8_lossy(&o.iter().map(|&c| if c < 0x80 { c } else { b'#' }).collect::<Vec<u8>>()).split(fin).zip(0..).map(|(l, _)| l.as_bytes().to_vec()).collect() };
    let (avant_l, apres_l) = (lignes(&brut), lignes(&apres));
    assert_eq!(avant_l.len(), apres_l.len());
    assert_eq!(avant_l.iter().zip(&apres_l).filter(|(a, b)| a != b).count(), 1, "une autre ligne a change");
    (chemin, part)
}

#[test]
fn test_13c_modifier_utf8_crlf_octet_pour_octet() {
    let (tmp, s, _) = serveur_tmp("webcao-lib-13c", |_| {});
    modifier_garde_les_octets(&s, &tmp, false, "\r\n", true);
}

#[test]
fn test_13d_modifier_latin1_lf_octet_pour_octet() {
    let (tmp, s, _) = serveur_tmp("webcao-lib-13d", |_| {});
    let (chemin, nom) = modifier_garde_les_octets(&s, &tmp, true, "\n", false);
    let avant = std::fs::read(&chemin).unwrap();
    assert_eq!(refus(&s, "/api/lib/composants", &format!("{{\"modifier\": {{\"part\": \"{nom}\", \"champs\": {{\"Value\": \"\u{20ac}\"}}}}}}")), 400);
    assert_eq!(std::fs::read(&chemin).unwrap(), avant, "un refus a ecrit");
}

#[test]
fn test_13h_si_absent_texte_non_encodable_ne_laisse_rien() {
    let (tmp, s, _) = serveur_tmp("webcao-lib-13h", |_| {});
    let corps = r#"{"type": "pcb", "nom": "BRISE.json", "si_absent": true, "data": {"format": "pcbfp-1", "name": "BRISE", "description": "a\ud800b"}}"#;
    assert_eq!(refus(&s, "/api/lib/fichier", corps), 400);
    assert_eq!(std::fs::read_dir(format!("{tmp}/lib_empreinte_pcb")).unwrap().count(), 0, "fichier laisse");
}

#[test]
fn test_14_lib_en_ligne_de_commande_non_persistee() {
    let (tmp, s, _) = serveur_tmp("webcao-lib-14", |_| {});
    let cfg = format!("{}/config_lib.json", s.poste.racine);
    assert_eq!(realpath(&s.poste.dossier_lib()), realpath(&tmp));
    assert!(!std::path::Path::new(&cfg).exists(), "--lib ne doit pas s'ecrire dans config_lib.json");
    // le choix fait depuis la page d'accueil, lui, se retient
    s.poste.definir_dossier_lib(&tmp, false, true).unwrap();
    assert!(std::path::Path::new(&cfg).exists());
}

#[test]
fn test_15_lib_statique_suit_le_dossier_actif() {
    let marqueur = |tmp: &str| ecrire(format!("{tmp}/lib_empreinte_pcb/_marqueur.json"), r#"{"marqueur": "dossier actif"}"#);
    // ecoute locale : la bibliotheque hors du depot est servie
    let (tmp, s, _) = serveur_tmp("webcao-lib-15", |_| {});
    marqueur(&tmp);
    let r = get(s.port, "/LIB/lib_empreinte_pcb/_marqueur.json");
    assert!(r.code == 200 && r.texte().contains("dossier actif") && r.entete("Content-type") == Some("application/json"));
    // et la remontee hors de la bibliotheque reste refusee
    assert!([400, 403, 404].contains(&get(s.port, "/LIB/..%2F..%2Fweb_CAO.py").code));
    // ecoute reseau : un dossier hors du depot ne s'ouvre pas
    let (tmp, s, _) = serveur_tmp("webcao-lib-15r", |poste| poste.projets_ouvert = false);
    marqueur(&tmp);
    assert_eq!(get(s.port, "/LIB/lib_empreinte_pcb/_marqueur.json").code, 404);
}
