//! Banc d'essai des routes HTTP du serveur et de ses sécurités : python/test/banc-serveur-routes.py,
//! cas pour cas (les numéros sont les siens). Le serveur tourne dans le processus ; là où le
//! banc Python changeait un réglage en cours de route (PROJETS_OUVERT...), un serveur est
//! lancé avec ce réglage.
//!
//! Les cas qui n'éprouvaient pas le serveur lui-même sont là où vit ce qu'ils éprouvent :
//! 13 et 40 (lecteur IPC-2581, appairage) dans les caisses de web_suite, 29 (passerelle MCP)
//! dans rust/outils/tests/passerelle.rs, 28, 37, 39 et 49 dans les essais de src/. Trois cas
//! n'ont pas d'équivalent : 39 bis (numpy absent), 50 (fsync compté par substitution) et 53
//! (plafond de connexions, que le serveur commun ne tient pas).

use crate::commun::*;
use std::io::Write;
use web_cao::calculs::{MAX_CROSSTALK, MAX_DC, MAX_SIM};
use web_cao::chemins::{abspath, mtime_ms};
use web_cao::projets::{derniere_sauvegarde, explorer_projets};

const PCB: &str = r#"{"board": {"w": 60, "h": 40}, "footprints": [
    {"ref": "U1", "x": 10.0, "y": 10.0, "pads": [{"n": 1, "net": "VCC", "x": 10.0, "y": 10.0}]},
    {"ref": "C1", "x": 12.0, "y": 10.0, "pads": [{"n": 1, "net": "VCC", "x": 12.0, "y": 10.0}]}]}"#;
const ANALYSE: &str = r#"{"format": "cao-analyse-carte-1", "unite_mm": 1, "pistes": [{"c": "Top", "n": "CLK", "w": 0.2, "p": [0, 0, 10, 0, 10, 10]}]}"#;

fn gzip(texte: &str) -> Vec<u8> {
    let mut e = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
    e.write_all(texte.as_bytes()).unwrap();
    e.finish().unwrap()
}

/// 1 à 4, 14, 18 à 23 : les routes de calcul.
#[test]
fn routes_de_calcul() {
    let d = dossier_neuf("webcao-calcul");
    let s = lancer(poste_essai(&d));
    let p = s.port;
    // 1. GET /api/pcb/score-placement
    let r = get(p, "/api/pcb/score-placement");
    assert!(r.code == 200 && r.json()["dispo"] == Json::Bool(true));
    // 2. POST /api/pcb/score-placement
    let r = post(p, "/api/pcb/score-placement", PCB);
    let data = r.json();
    assert!(r.code == 200 && data["succes"] == Json::Bool(true), "{}", r.texte());
    assert!(data.get("hpwl_mm").is_some() && data.get("congestion").is_some() && data.get("decouplage").is_some());
    // 3. GET /api/schema/patterns
    assert!(get(p, "/api/schema/patterns").json()["dispo"] == Json::Bool(true));
    // 4. POST /api/schema/patterns
    let r = post(
        p,
        "/api/schema/patterns",
        r#"{"components": {"U1": {"val": "AMS1117-3.3", "type": "ic"}, "C1": {"val": "10uF", "type": "cap"}},
            "nets": {"VCC_3V3": [{"ref": "U1", "pin": 2}, {"ref": "C1", "pin": 1}], "GND": [{"ref": "U1", "pin": 1}, {"ref": "C1", "pin": 2}]}}"#,
    );
    let data = r.json();
    assert!(r.code == 200 && data["succes"] == Json::Bool(true) && data["total_motifs"].as_i64().unwrap() >= 1, "{}", r.texte());

    // 14. POST /api/simulation (moteur 2D standard)
    let r = post(
        p,
        "/api/simulation",
        r#"{"format": "cao-sim-em-3", "stackup": {"layers": [
              {"type": "copper", "role": "signal", "thickness": 0.035, "name": "TOP"},
              {"type": "dielectric", "thickness": 0.370, "epsilon_r": 4.37, "name": "FR4"},
              {"type": "copper", "role": "plane", "thickness": 0.035, "name": "GND"}]},
            "geometry": {"objects": [{"type": "track", "start": [0.0, 0.0], "end": [5.0, 0.0], "width": 1.05, "layer": 0, "net": "SIG"}]},
            "analyse": {"f_debut": 2e9, "f_fin": 2e9, "f_centrale": 2e9, "points": 1}}"#,
    );
    let data = r.json();
    assert!(r.code == 200 && data["format"].as_str() == Some("cao-sim-em-resultat-5") && data.get("ligne").is_some(), "{}", r.texte());

    // 18. GET /api/simulation-dc
    let data = get(p, "/api/simulation-dc").json();
    assert!(data["dispo"] == Json::Bool(true) && data.get("methode").is_some());
    // 19. POST /api/simulation-dc : un barreau, une source, une reference
    let r = post(
        p,
        "/api/simulation-dc",
        r#"{"format": "cao-sim-dc-1", "carte": "banc_routes",
            "polygones": [{"layer": 0, "net": "VCC", "epaisseur": 0.035, "sommets": [[0, 0], [20, 0], [20, 5], [0, 5]]}],
            "sources": [{"x": 1.0, "y": 2.5, "layer": 0, "net": "VCC", "courant": 1.0}],
            "references": [{"x": 19.0, "y": 2.5, "layer": 0, "net": "VCC", "tension": 0.0}], "pas": 0.5}"#,
    );
    let data = r.json();
    assert!(r.code == 200 && data["format"].as_str() == Some("cao-sim-dc-resultat-1"), "{}", &r.texte()[..300.min(r.corps.len())]);
    assert!(data.get("potentiel").is_some() && data.get("densite").is_some());
    // LA CARTE DE CHALEUR EST POSEE PAR LA ROUTE, une par couche : c'est
    // elle qui l'ajoute au resultat, pas le solveur.
    assert!(!data["cartes"].as_objet().expect("la route doit ajouter les cartes par couche").is_empty());

    // 19 bis. POST /api/thermique-composants : l'echauffement d'un composant qui dissipe
    let r = post(
        p,
        "/api/thermique-composants",
        r#"{"thermique": {"epaisseur_stratifie": 1.6}, "composants": [{"ref": "D1", "puissance_w": 1, "surface_mm2": 400, "source_mm2": 12, "cuivre_um": 35}]}"#,
    );
    let data = r.json();
    let dt = data["composants"][0]["dT"].as_f64().unwrap();
    assert!(r.code == 200 && data["composants"][0]["ref"].as_str() == Some("D1") && 30.0 < dt && dt < 90.0, "{}", r.texte());
    assert_eq!(post(p, "/api/thermique-composants", r#"{"composants": []}"#).code, 422);

    // 20. GET /api/crosstalk
    assert!(get(p, "/api/crosstalk").json()["dispo"] == Json::Bool(true));
    // 21. POST /api/crosstalk : un refus PROPRE valide la route aussi bien
    // qu'un calcul, et coute mille fois moins cher. Ce qu'on eprouve ici
    // est la chaine lecture -> module -> traduction du refus en 422.
    let r = post(p, "/api/crosstalk", r#"{"format": "n'importe quoi"}"#);
    assert!(r.code == 422 && r.detail().to_lowercase().contains("format"), "{} {}", r.code, r.texte());

    // 21b. /api/simulation-rf : l'etat, puis un vrai calcul -- un fil
    // entre la sortie d'une puce a 14+8j et 50 ohms, dont le S21 est le
    // gain de desadaptation 4 R1 R2 / |Z1+Z2|^2 --, puis un refus motive.
    assert!(get(p, "/api/simulation-rf").json()["dispo"] == Json::Bool(true));
    let r = post(
        p,
        "/api/simulation-rf",
        r#"{"format": "cao-sim-rf-1", "stackup": {"layers": [
              {"name": "TOP", "type": "copper", "thickness": 0.035, "role": "signal"},
              {"name": "PP", "type": "dielectric", "thickness": 0.2, "epsilon_r": 4.2, "tan_delta": 0.02},
              {"name": "GND", "type": "copper", "thickness": 0.035, "role": "plane"}]},
            "ports": [{"noeud": "a", "z": [14, 8]}, {"noeud": "b", "z": [50, 0]}],
            "composants": [{"ref": "R0", "noeuds": ["a", "b"], "modele": {"type": "ideal", "genre": "R", "valeur": 0}}],
            "analyse": {"f_debut": 2e9, "f_fin": 3e9, "points": 3, "f_centre": 2.44e9}}"#,
    );
    let attendu = 10.0 * (4.0 * 14.0 * 50.0 / (64.0f64 * 64.0 + 8.0 * 8.0)).log10();
    assert!(r.code == 200 && (r.json()["bilan"]["s21_db"].as_f64().unwrap() - attendu).abs() < 1e-3, "{}", &r.texte()[..300.min(r.corps.len())]);
    assert_eq!(post(p, "/api/simulation-rf", r#"{"format": "?"}"#).code, 422);
    // l'oeil : son etat (la route n'avait pas d'essai)
    assert!(get(p, "/api/oeil").json()["dispo"] == Json::Bool(true));

    // 22. LES QUATRE ROUTES DE CALCUL REFUSENT UN CORPS VIDE DE LA MEME
    // FACON. C'est le contrat de `lire_document`, et le seul moyen de
    // verifier qu'elles passent bien toutes les quatre par elle.
    for route in ["/api/simulation", "/api/simulation-dc", "/api/crosstalk", "/api/simulation-rf"] {
        let r = post(p, route, "");
        assert!(r.code == 400 && r.texte().contains("vide"), "{route} : {} {}", r.code, r.texte());
    }

    // 23. ET UN CORPS TROP GROS, de la meme facon. La route DC n'avait
    // aucun plafond : elle lisait ce qui venait, alors que son document
    // porte les polygones de couches entieres.
    let gros = format!(r#"{{"format": "cao-sim-em-3", "bourrage": "{}"}}"#, "x".repeat(5 * 1024 * 1024));
    let mut refuses = 0;
    for (route, plafond) in [("/api/simulation", MAX_SIM), ("/api/crosstalk", MAX_CROSSTALK), ("/api/simulation-dc", MAX_DC)] {
        if gros.len() <= plafond {
            continue;
        }
        let r = post(p, route, &gros);
        assert!(r.code == 413 && r.texte().contains("maximum"), "{route} : {} {}", r.code, r.texte());
        refuses += 1;
    }
    assert!(refuses == 2 && MAX_DC > 0, "la route DC doit avoir un plafond");

    // banc-entrees-malformees.py, cote routes : un champ d'un autre type que prevu sort par
    // le refus du module (422 lisible), jamais en 500 « Erreur interne »
    for (route, docs) in [
        ("/api/pcb/score-placement", &[r#"{"footprints": "x"}"#, r#"{"footprints": [null]}"#][..]),
        ("/api/schema/patterns", &[r#"{"components": "x"}"#, r#"{"components": [null]}"#, r#"{"nets": [null]}"#, r#"{"nets": [{"name": 1}]}"#, r#"{"components": {"U1": "x"}}"#]),
        ("/api/simulation-dc", &[r#"{"polygones": "x"}"#, r#"{"polygones": [null]}"#, r#"{"polygones": [{"vertices": [[0, 0], [1, 0], [1, 1]]}], "pas": "x"}"#]),
        ("/api/oeil", &[r#"{"oeil": {"debit": 1e9, "ctle": "pcie3"}}"#, r#"{"format": "cao-sim-em-3", "stackup": "x"}"#]),
        ("/api/simulation", &[r#""x""#, "[]", r#"{"format": 1}"#, r#"{"pistes": "x"}"#, r#"{"format": "cao-sim-em-3", "stackup": "x"}"#]),
        ("/api/crosstalk", &[r#""x""#, "[]", r#"{"format": 1}"#, r#"{"format": "cao-crosstalk-1", "stackup": "x"}"#]),
        ("/api/simulation-rf", &[r#""x""#, "[]", r#"{"format": 1}"#, r#"{"format": "cao-sim-rf-1", "stackup": "x"}"#]),
    ] {
        for doc in docs {
            let r = post(p, route, doc);
            assert_eq!(r.code, 422, "{route} {doc} : {}", r.texte());
        }
    }
}

/// 4b. /api/analyse-carte : la piste reliée à rien sort en critique (orphelin), son coude
/// à 90° en vigilance ; un document d'un autre format est refusé en clair (422).
#[test]
fn analyse_carte() {
    let d = dossier_neuf("webcao-analyse");
    let s = lancer(poste_essai(&d));
    let p = s.port;
    assert!(get(p, "/api/analyse-carte").json()["dispo"] == Json::Bool(true));
    let regles = |r: &Rep| -> Vec<String> { r.json()["constats"].as_liste().unwrap().iter().map(|k| k["regle"].as_str().unwrap().to_string()).collect() };
    let r = post(p, "/api/analyse-carte", ANALYSE);
    assert_eq!(r.code, 200, "{}", r.texte());
    let data = r.json();
    assert_eq!(regles(&r), ["orphelin", "angle_droit"], "{}", r.texte());
    assert!(data["compte"]["critique"].as_i64() == Some(1) && data["compte"]["vigilance"].as_i64() == Some(1));
    assert_eq!(data["constats"][0]["n"].as_str(), Some("CLK"));
    let r = post(p, "/api/analyse-carte", r#"{"format": "autre"}"#);
    assert!(r.code == 422 && r.detail().contains("cao-analyse-carte-1"), "{} {}", r.code, r.texte());
    // le meme document, compresse en gzip et avec une table de grilles :
    // la page envoie ainsi les grosses cartes (`simCorpsJson`)
    let doc_g = format!(r#"{},"cavites_grilles": {{"g0": {{"pas": 0.5, "lignes": []}}}}, "vias": [{{"x": 0, "y": 0, "cavite_grille": "g0"}}]}}"#, ANALYSE.trim_end_matches('}'));
    let r = requete(p, "POST", "/api/analyse-carte", &[("Content-Encoding", "gzip")], &gzip(&doc_g));
    assert_eq!(r.code, 200, "{}", r.texte());
    assert_eq!(regles(&r)[..2], ["orphelin", "angle_droit"]);
    let r = requete(p, "POST", "/api/analyse-carte", &[("Content-Encoding", "gzip")], b"pas du gzip");
    assert!(r.code == 400 && r.detail().contains("gzip"), "{} {}", r.code, r.texte());
    // une epaisseur de cuivre absurde (1e9 mm) faisait mailler la diaphonie
    // jusqu'a ce que le systeme tue le serveur : refus net, avant tout calcul
    let doc_e = format!(r#"{},"stackup": {{"layers": [{{"type": "copper", "name": "TOP", "thickness": 1e9}}]}}}}"#, ANALYSE.trim_end_matches('}'));
    let r = post(p, "/api/analyse-carte", &doc_e);
    assert!(r.code == 422 && r.detail().contains("hors bornes"), "{} {}", r.code, r.texte());
    // 51. un JSON tres imbrique : 400, pas 500
    assert_eq!(post(p, "/api/analyse-carte", &"[".repeat(100000)).code, 400);
}

/// 5 à 13, 24, 26, 30, 30a à 30c, 32, 38, 39, 41, 42 : fichiers servis, Host, origine,
/// en-tête maison, datasheets, canal de pilotage.
#[test]
fn securites() {
    let d = dossier_neuf("webcao-securites");
    let (lib, _) = lib_copie(&d);
    let s = lancer(poste_essai(&d));
    let p = s.port;
    let ds_inv = r#"{"url": "ftp://invalide", "mpn": "TEST"}"#;

    // 5a. ecoute reseau -> rejet 403 propre
    {
        let mut poste = poste_essai(&d);
        poste.projets_ouvert = false;
        let reseau = lancer(poste);
        let r = post(reseau.port, "/api/datasheet/telecharger", ds_inv);
        assert!(r.code == 403 && r.detail().contains("refuses"), "{} {}", r.code, r.texte());
    }
    // 5b. ecoute locale -> traitement et rejet URL invalide 400
    let r = post(p, "/api/datasheet/telecharger", ds_inv);
    assert!(r.code == 400 && r.detail().contains("URL invalide"), "{} {}", r.code, r.texte());
    // 6. GET /api/datasheet/ouvrir (fichier manquant -> 400)
    assert_eq!(get(p, "/api/datasheet/ouvrir").code, 400);
    // 7. fichier inexistant -> 404
    assert_eq!(get(p, "/api/datasheet/ouvrir?fichier=non_existant_test_12345.pdf").code, 404);
    // 8. Protection SSRF sur /api/datasheet/telecharger
    for url in ["http://127.0.0.1/secret.pdf", "http://localhost/secret.pdf", "http://10.0.0.1/secret.pdf", "http://192.168.1.1/secret.pdf", "http://169.254.169.254/latest/meta-data"] {
        let r = post(p, "/api/datasheet/telecharger", &format!(r#"{{"url": "{url}", "mpn": "TEST"}}"#));
        assert!(r.code == 400 && (r.detail().contains("non autorisee") || r.detail().contains("invalide")), "SSRF non bloque pour {url} : {} {}", r.code, r.texte());
    }
    // 30a. un corps JSON qui n'est pas un objet est un refus (400), pas une « Erreur interne » 500
    for corps in ["null", "[1]"] {
        assert_eq!(post(p, "/api/datasheet/telecharger", corps).code, 400, "datasheet, corps {corps}");
    }
    // une datasheet rangée se rouvre, en PDF
    ecrire(format!("{d}/projets/_communs/datasheets/fiche.pdf"), b"%PDF-1.4 essai");
    let r = get(p, "/api/datasheet/ouvrir?fichier=fiche.pdf");
    assert!(r.code == 200 && r.entete("Content-Type") == Some("application/pdf") && r.corps == b"%PDF-1.4 essai");
    assert_eq!(r.entete("Content-Disposition"), Some("inline; filename=\"fiche.pdf\""));

    // 9. Protection contre la fuite de fichiers sensibles
    for secret in ["/LIB_composants.csv", "/mom_solver.log", "/web_CAO.py", "/python/ipc2581_parser.py", "/Cargo.toml", "/rust/serveur/src/poste.rs"] {
        assert_eq!(get(p, secret).code, 404, "Fichier sensible non masque : {secret}");
    }
    // 10. Désactivation du listing de répertoire
    assert_eq!(get(p, "/datasheets/").code, 404);
    // 11. Validation Host Header / Anti-DNS Rebinding
    assert_eq!(brute(p, "GET", "/api/pcb/score-placement", &[("Host", "evil-attacker.com")], b"").code, 403);
    // 12. Protection CSRF (Origin header inter-origines non autorisé)
    assert_eq!(requete(p, "POST", "/api/pcb/score-placement", &[("Origin", "https://evil-attacker.com")], PCB.as_bytes()).code, 403);
    // 13. Protection XML Entity Expansion (Billion Laughs / DTD), par la route
    let xxe = r#"<?xml version="1.0"?>
        <!DOCTYPE lolz [
          <!ENTITY lol "lol">
          <!ENTITY lol2 "&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;">
        ]>
        <IPC-2581></IPC-2581>"#;
    let r = post(p, "/api/ipc2581?nom=carte.xml", xxe);
    assert!(r.code == 422 && r.detail().contains("interdite"), "{} {}", r.code, r.texte());
    let etat = get(p, "/api/ipc2581").json();
    assert!(etat["dispo"] == Json::Bool(true) && etat["extensions"].as_liste().unwrap().contains(&".zip".into()));
    assert_eq!(post(p, "/api/ipc2581", "").code, 400);

    // 24. Host IPv6 : « [::1]:port » est accepte, un Host entre crochets
    // quelconque ne contourne plus le controle (il etait coupe a « [ »).
    // Toute IP du poste est acceptee (un Pi a plusieurs adresses), un nom
    // quelconque non.
    for (hote, attendu) in [(format!("[::1]:{p}"), 200), ("[evil]:80".into(), 403), ("[".into(), 403), (format!("LocalHost:{p}"), 200), (format!("192.168.1.30:{p}"), 200), (format!("evil.example:{p}"), 403)] {
        assert_eq!(brute(p, "GET", "/api/pcb/score-placement", &[("Host", &hote)], b"").code, attendu, "Host {hote}");
    }

    // 26. profils/fabricants/ est servi, les profils d'utilisateur non.
    let r = get(p, "/profils/fabricants/jlcpcb.json");
    assert!(r.code == 200 && r.texte().to_lowercase().contains("jlcpcb"));
    for cache in ["/profils/LISEZ-MOI.md", "/profils/Pilou.json", "/profils/fabricants/../Pilou.json"] {
        assert_eq!(get(p, cache).code, 404, "{cache}");
    }

    // 30. Origine : ce serveur-ci seulement, plus tout le reseau prive.
    for (origine, attendu) in [(format!("http://127.0.0.1:{p}"), 200), ("http://192.168.1.50:8000".into(), 403), ("http://127.0.0.1:1".into(), 403), ("null".into(), 403)] {
        assert_eq!(requete(p, "POST", "/api/pcb/score-placement", &[("Origin", &origine)], PCB.as_bytes()).code, attendu, "Origin {origine}");
    }
    let r = requete(p, "GET", "/api/lib/fichiers", &[("Origin", "http://192.168.1.50:8000")], b"");
    assert!(r.entete("Access-Control-Allow-Origin").is_none(), "LIB lisible par une page d'un autre appareil du LAN");
    assert_eq!(r.entete("X-Content-Type-Options"), Some("nosniff"));
    // 30c. En-tete maison : sans « X-WEB_CAO: 1 », aucune ecriture (403), canal de pilotage compris.
    let sans = r#"{"type": "pcb", "nom": "sans-entete.json", "data": {}}"#;
    let battement = r#"{"navigateur": "n", "onglets": []}"#;
    for (methode, route, corps) in [("POST", "/api/lib/fichier", sans), ("PUT", "/api/lib/fichier", sans), ("DELETE", "/api/lib/fichier?type=pcb&nom=0603.json", ""), ("POST", "/api/pilote/battement", battement)] {
        for valeur in [None, Some("0")] {
            let mut h = vec![("Content-Type", "application/json")];
            h.extend(valeur.map(|v| ("X-WEB_CAO", v)));
            assert_eq!(brute(p, methode, route, &h, corps.as_bytes()).code, 403, "{methode} {route} sans en-tete");
        }
    }
    assert!(!std::path::Path::new(&format!("{lib}/lib_empreinte_pcb/sans-entete.json")).exists(), "ecrit sans en-tete");
    assert!(std::path::Path::new(&format!("{lib}/lib_empreinte_pcb/0603.json")).exists(), "efface sans en-tete");
    // le nom sans souligne (relais qui retire les « _ ») vaut l'autre, et le refus dit qui et pourquoi
    assert_eq!(brute(p, "POST", "/api/pilote/battement", &[("Content-Type", "application/json"), ("X-Web-Cao", "1")], battement.as_bytes()).code, 200);
    assert!(brute(p, "POST", "/api/pcb/score-placement", &[("Content-Type", "application/json")], b"{}").detail().contains("WEB_CAO"), "le refus ne nomme pas l'outil");

    // 30b. Telephone serveur hors des plages privees classiques (partage de
    // connexion, 4G, Tailscale 100.64/10, liaison directe 169.254) : sa propre
    // page doit pouvoir ecrire. Un 403 CSRF y laissait lire le projet sans
    // pouvoir l'enregistrer. Une autre origine reste refusee.
    for ip in ["100.84.12.7", "169.254.20.3"] {
        for (origine, attendu) in [(format!("http://{ip}:8000"), 200), (format!("http://{ip}:9999"), 403), ("http://evil.example".into(), 403), ("null".into(), 403)] {
            let r = requete(p, "POST", "/api/pcb/score-placement", &[("Origin", &origine), ("Host", &format!("{ip}:8000"))], PCB.as_bytes());
            assert_eq!(r.code, attendu, "{ip}, Origin {origine}");
        }
    }

    // 32. Flux NTFS : « ::$DATA » ne contourne plus la liste des caches.
    for chemin in ["/LIB_composants.csv::$DATA", "/config_lib.json::$DATA"] {
        assert_eq!(get(p, chemin).code, 404, "{chemin}");
    }

    // 38. Content-Length negatif : 400, pas de lecture sans fin.
    let r = brute(p, "PUT", "/api/profil?nom=neg", &[("X-WEB_CAO", "1"), ("Content-Type", "application/json"), ("Content-Length", "-1")], b"");
    assert_eq!(r.code, 400);
    assert!(!std::path::Path::new(&format!("{}/neg.json", s.poste.dossier_profils())).exists());

    // 39. Fichiers statiques par liste blanche (REGLES §3.1) : ce que les pages
    // chargent sort, le reste est 404 (la liste elle-même : essais de src/poste.rs).
    for (nom, attendu) in [("/README.md", 404), ("/graphify-out/GRAPH_REPORT.md", 404), ("/python/test/lib_essai.py", 404), ("/commun/menus.js", 200), ("/", 200), ("/editeur-pcb/", 200), ("/editeur-pcb", 200), ("/favicon.ico", 204)] {
        assert_eq!(get(p, nom).code, attendu, "{nom}");
    }
    let r = get(p, "/commun/menus.js");
    assert_eq!((r.entete("Content-type"), r.entete("Content-Length").map(|n| n.parse::<usize>().unwrap())), (Some("text/javascript"), Some(r.corps.len())));
    let tete = brute(p, "HEAD", "/commun/menus.js", &[], b"");
    assert!(tete.code == 200 && tete.corps.is_empty() && tete.entete("Content-Length") == r.entete("Content-Length"));
    assert_eq!(get(p, "/LIB/lib_empreinte_pcb/0603.json").code, 200);
    assert_eq!(get(p, "/LIB/LIB_composants.csv").code, 404);
    assert_eq!(get(p, "/api/ia/cle").code, 404, "la route de la cle IA est retiree");
    assert_eq!(brute(p, "OPTIONS", "/api/simulation", &[], b"").code, 501);
    assert_eq!(requete(p, "PUT", "/api/inconnue", &[], b"{}").code, 405);

    // 41. Canal de pilotage (module canal-pilote du MCP de web_suite) :
    // une page bat, le MCP de ce poste voit l'onglet ; une autre origine est refusée
    let bat = r#"{"navigateur": "n1", "onglets": [{"id": "o1", "page": "pcb", "projet": "essai", "focus_il_y_a": 0}]}"#;
    assert_eq!(requete(p, "POST", "/api/pilote/battement", &[("Origin", "http://evil.example")], bat.as_bytes()).code, 403);
    assert_eq!(requete(p, "POST", "/api/pilote/battement", &[("Origin", &format!("http://127.0.0.1:{p}"))], bat.as_bytes()).code, 200);
    let r = get(p, "/api/pilote/onglets");
    let onglets = r.json();
    assert!(r.code == 200 && onglets["onglets"].as_liste().unwrap().iter().any(|o| o["id"].as_str() == Some("o1")), "{}", r.texte());

    // 42. Pas d'affichage dans le cadre d'un autre site (clic piégé sur « Appliquer » du panneau Claude)
    let r = get(p, "/index.html");
    assert_eq!(r.entete("X-Frame-Options"), Some("SAMEORIGIN"));
    assert!(r.entete("Content-Security-Policy").unwrap_or("").contains("frame-ancestors 'self'"));
    assert_eq!(r.entete("Cache-Control"), Some("no-cache, no-store, must-revalidate"));

    // 51. Corps que le serveur ne sait pas lire ou ecrire : 400, pas 500.
    let r = requete(p, "PUT", "/api/profil?nom=zz-banc", &[], br#"{"format":"cao-profil-1","x":"\ud800"}"#);
    assert_eq!(r.code, 400, "{}", r.texte());
    assert!(!std::path::Path::new(&format!("{}/zz-banc.json", s.poste.dossier_profils())).exists());
    assert_eq!(requete(p, "PUT", "/api/profil?nom=zz-banc", &[], "[".repeat(100000).as_bytes()).code, 400);
    let r = post(p, "/api/tool", r#"{"name": ["a"]}"#);
    assert!(r.code == 400 && r.detail().contains("inconnu"), "{} {}", r.code, r.texte());
}

/// 25, 31, 31 bis, 30d, 44, 45, 45b, 46 : la bibliothèque.
#[test]
fn bibliotheque() {
    let d = dossier_neuf("webcao-bibliotheque");
    let (lib, _) = lib_copie(&d);
    let s = lancer(poste_essai(&d));
    let p = s.port;
    let lire = |chemin: &str| std::fs::read(chemin).unwrap();

    // 25. Ecoute reseau : la bibliotheque est en lecture seule, et la cle
    // IA n'est pas donnee.
    {
        let mut poste = poste_essai(&d);
        poste.projets_ouvert = false;
        let reseau = lancer(poste);
        for (methode, route, corps) in [
            ("POST", "/api/lib/config", r#"{"chemin": "C:/nulle-part"}"#),
            ("POST", "/api/lib/fichier", r#"{"type": "pcb", "nom": "x.json", "data": {}}"#),
            ("POST", "/api/lib/composants", r#"{"colonnes": ["a"], "composants": []}"#),
            ("DELETE", "/api/lib/fichier?type=pcb&nom=0603.json", ""),
        ] {
            let r = requete(reseau.port, methode, route, &[], corps.as_bytes());
            assert!(r.code == 403 && r.detail().contains("lecture seule"), "{methode} {route} : {} {}", r.code, r.texte());
        }
        assert!(std::path::Path::new(&format!("{lib}/lib_empreinte_pcb/0603.json")).exists());
        assert_eq!(get(reseau.port, "/api/lib/fichiers").code, 200, "la lecture de la LIB doit rester ouverte");
        assert_eq!(get(reseau.port, "/api/ia/cle").code, 404);
    }

    // 31. LIB : pas de page ni d'executable, pas de racine de disque.
    for nom in ["x.html", "x.bat", "x.svg", "x.json::$DATA"] {
        assert_eq!(post(p, "/api/lib/fichier", &format!(r#"{{"type": "pcb", "nom": "{nom}", "contenu": "<script>"}}"#)).code, 400, "{nom}");
    }
    s.poste.chemin_lib_fichier("simulation", "modele.sub", false).unwrap(); // lecture : admis
    assert_eq!(s.poste.definir_dossier_lib(&abspath("/"), true, false).unwrap_err().code, 400, "racine de disque acceptee comme LIB");
    // 31 bis. Modeles STEP de la LIB : lus pour l'export STEP, jamais ecrits ni effaces.
    assert!(s.poste.chemin_lib_fichier("step", "0402C.stp", false).unwrap().ends_with(&format!("Models{}0402C.stp", std::path::MAIN_SEPARATOR)));
    for (nom, creer) in [("x.json", false), ("x.stp", true), ("../x.stp", false)] {
        assert_eq!(s.poste.chemin_lib_fichier("step", nom, creer).unwrap_err().code, 400, "STEP {nom} (creer={creer}) accepte");
    }
    assert!([400, 403, 405].contains(&requete(p, "DELETE", "/api/lib/fichier?type=step&nom=0402C.stp", &[], b"").code));

    // 30d. Enregistrement complet du catalogue : le BOM reste (Excel), une espace insecable
    // devient une espace au lieu de bloquer, et un refus nomme la ligne fautive.
    let csv_cat = format!("{lib}/LIB_composants.csv");
    let garde = lire(&csv_cat);
    ecrire(&csv_cat, b"\xef\xbb\xbfPart Name;Description\r\nR1;x\r\n");
    let poster = |comps: &str| post(p, "/api/lib/composants", &format!(r#"{{"colonnes": ["Part Name", "Description"], "composants": {comps}}}"#));
    let r = poster("[{\"Part Name\": \"R1\", \"Description\": \"10\u{a0}\u{b5}F\"}]");
    assert_eq!(r.code, 200, "espace insecable : {}", r.texte());
    let ecrit = lire(&csv_cat);
    assert!(ecrit.starts_with(b"\xef\xbb\xbf"), "BOM du catalogue perdu");
    assert!(String::from_utf8_lossy(&ecrit).contains("10 \u{b5}F"));
    let r = poster(r#"[{"Part Name": "R1", "Description": "x"}, {"Part Name": "C7", "Description": "=1+1"}]"#);
    assert!(r.code == 400 && r.detail().contains("C7"), "{} {}", r.code, r.texte());
    ecrire(&csv_cat, garde);

    // 44. Modifier une reference existante (fiche de Gestion LIB) : seules les cases donnees
    // changent, la ligne lue a change = 409, les autres lignes restent octet pour octet.
    let lib2 = format!("{d}/webcao_cat");
    let csv_ = format!("{lib2}/LIB_composants.csv");
    let brut: Vec<u8> = b"Part Name;Value;Description;Brochage\r\nR1;1k;\"sur\r\ndeux lignes\";\r\nU1;;ldo;IN=1,GND=2\r\nC1;;\"a;b\";\r\n".to_vec();
    ecrire(&csv_, &brut);
    s.poste.definir_dossier_lib(&lib2, false, false).unwrap();
    let modifier = |demande: &str| {
        let r = post(p, "/api/lib/composants", &format!(r#"{{"modifier": {demande}}}"#));
        (r.code, r.json())
    };
    let composants = || get(p, "/api/lib/composants").json();
    let lu = mtime_ms(&csv_);
    std::thread::sleep(std::time::Duration::from_millis(10));
    let (code, rep) = modifier(r#"{"part": "u1", "champs": {"Brochage": "IN=1,GND=2,OUT=3", "Value": " 3.3V "}, "avant": {"Brochage": "IN=1,GND=2", "Value": ""}}"#);
    assert!(code == 200 && dumps(&rep["champs"]) == r#"{"Brochage": "IN=1,GND=2,OUT=3", "Value": "3.3V"}"#, "{}", dumps(&rep));
    // la page suit la date
    assert!(rep["mtime_avant"].as_i64() == Some(lu) && rep["mtime_ms"].as_i64() == Some(mtime_ms(&csv_)) && mtime_ms(&csv_) != lu, "{}", dumps(&rep));
    let apres = lire(&csv_);
    assert_eq!(String::from_utf8_lossy(&apres), String::from_utf8_lossy(&brut).replace("U1;;ldo;IN=1,GND=2\r\n", "U1;3.3V;ldo;IN=1,GND=2,OUT=3\r\n"));
    let long = format!(r#"{{"part": "U1", "champs": {{"Value": "{}"}}}}"#, "x".repeat(501));
    for (demande, attendu) in [
        (r#"{"part": "U1", "champs": {"Value": "5V"}, "avant": {"Value": ""}}"#, 409), // lue avant le changement
        (r#"{"part": "X", "champs": {"Value": "1"}}"#, 404),
        (r#"{"part": "U1", "champs": {"Part Name": "U2"}}"#, 400),
        (r#"{"part": "U1", "champs": {"Inconnue": "1"}}"#, 400),
        (r#"{"part": "U1", "champs": {"Value": "=1+1"}}"#, 400),
        (r#"{"part": "U1", "champs": {"Value": "+cmd|' /C calc'!A0"}}"#, 400),
        ("{\"part\": \"U1\", \"champs\": {\"Value\": \"AMS1117\u{200b}-3.3\"}}", 400),
        (long.as_str(), 400),
        (r#"{"part": "U1", "champs": {"Value": ["a"]}}"#, 400),
        (r#"{"part": "U1", "champs": {}}"#, 400),
        (r#"{"part": "U1"}"#, 400),
    ] {
        let (code, rep) = modifier(demande);
        assert_eq!(code, attendu, "{demande} : {}", dumps(&rep));
    }
    assert_eq!(lire(&csv_), apres, "un refus a ecrit");
    // plusieurs lignes : la case lue en CRLF se reconnait, la neuve reste entre guillemets, un \r seul ne coupe pas la ligne
    let cat = composants();
    let lue = cat["composants"].as_liste().unwrap().iter().find(|c| c["Part Name"].as_str() == Some("R1")).unwrap()["Description"].clone();
    let (code, rep) = modifier(&format!(r#"{{"part": "R1", "champs": {{"Description": "trois\r\nlignes\rici"}}, "avant": {{"Description": {}}}}}"#, dumps(&lue)));
    assert!(code == 200 && rep["champs"]["Description"].as_str() == Some("trois\nlignes\nici"), "{}", dumps(&rep));
    assert_eq!(String::from_utf8_lossy(&lire(&csv_)), String::from_utf8_lossy(&apres).replace("\"sur\r\ndeux lignes\"", "\"trois\nlignes\nici\""));
    let noms: Vec<(String, String)> =
        composants()["composants"].as_liste().unwrap().iter().map(|c| (c["Part Name"].as_str().unwrap().to_string(), c["Description"].as_str().unwrap().to_string())).collect();
    assert_eq!(noms, [("R1".into(), "trois\nlignes\nici".into()), ("U1".into(), "ldo".into()), ("C1".into(), "a;b".into())]);
    ecrire(&csv_, &brut);

    // 45. Catalogue entier : la date lue (mtime_ms) revient avec l'enregistrement ; changee
    // depuis (autre appareil) -> 409 et rien d'ecrit. Plus de copie a la racine du depot.
    let r = get(p, "/api/lib/composants");
    let cat = r.json();
    let date = cat["mtime_ms"].as_i64().unwrap();
    assert!(r.code == 200 && date > 0, "{}", r.texte());
    let avant = lire(&csv_);
    let tout = |mtime: Option<i64>| {
        let date = mtime.map_or(String::new(), |m| format!(r#", "mtime_ms": {m}"#));
        let r = post(p, "/api/lib/composants", &format!(r#"{{"colonnes": {}, "composants": [{}]{date}}}"#, dumps(&cat["colonnes"]), dumps(&cat["composants"][0])));
        (r.code, r.json())
    };
    assert!(tout(Some(date - 5000)).0 == 409 && lire(&csv_) == avant);
    let (code, rep) = tout(Some(date));
    assert!(code == 200 && rep["mtime_ms"].as_i64() == Some(mtime_ms(&csv_)), "{}", dumps(&rep));
    std::thread::sleep(std::time::Duration::from_millis(10));
    assert_eq!(tout(Some(date)).0, if rep["mtime_ms"].as_i64() == Some(date) { 200 } else { 409 }, "la date d'avant ne vaut plus");
    assert!(tout(Some(mtime_ms(&csv_))).0 == 200 && tout(None).0 == 200); // sans date : comme avant
    // les routes retirees (decision du 2026-11-04) : un corps sans « composants » est refuse
    for vieux in [r#"{"ajouter": {"Part Name": "X"}}"#, r#"{"lier_simulation": {"part": "R1", "modele": "x"}}"#] {
        assert_eq!(post(p, "/api/lib/composants", vieux).code, 400, "{vieux}");
    }
    // l'enregistrement complet refuse une formule
    let avant = lire(&csv_);
    let piege = dumps(&cat["composants"][0]).replacen(r#""Brochage": """#, r#""Brochage": "=HYPERLINK(\"http://x\")""#, 1);
    let r = post(p, "/api/lib/composants", &format!(r#"{{"colonnes": {}, "composants": [{piege}]}}"#, dumps(&cat["colonnes"])));
    assert!(r.code == 400 && r.texte().contains("formule") && lire(&csv_) == avant, "{} {}", r.code, r.texte());
    assert!(!std::path::Path::new(&format!("{}/LIB_composants.csv", racine())).exists());

    // 45b. Catalogue enregistre par Excel en cp1252 : « – » et « ’ » se lisent tels quels
    // (pas \x96 / \x92, refuses ensuite), et une modification le reecrit en cp1252.
    ecrire(&csv_, b"Part Name;Value;Description\r\nR1;1k;r\x92sistance \x96 0603\r\n");
    let lue = composants()["composants"][0]["Description"].clone();
    assert_eq!(lue.as_str(), Some("r’sistance – 0603"));
    let (code, rep) = modifier(&format!(r#"{{"part": "R1", "champs": {{"Value": "2k"}}, "avant": {{"Description": {}}}}}"#, dumps(&lue)));
    assert_eq!(code, 200, "{}", dumps(&rep));
    assert_eq!(lire(&csv_), b"Part Name;Value;Description\r\nR1;2k;r\x92sistance \x96 0603\r\n");

    // 46. Client du reseau : /api/lib/config ne donne que des noms de dossier, et un 500
    // ne porte ni le texte de l'exception ni un chemin du poste (REGLES §3.3).
    let mut poste = poste_essai(&d);
    poste.distant = true;
    let distant = lancer(poste);
    distant.poste.definir_dossier_lib(&lib2, false, false).unwrap();
    let cfg = get(distant.port, "/api/lib/config").json();
    assert!(cfg["chemin"].as_str() == Some("webcao_cat") && !cfg["defaut"].as_str().unwrap().contains(std::path::MAIN_SEPARATOR), "{}", dumps(&cfg));
    let local = get(p, "/api/lib/config").json();
    assert!(local["chemin"].as_str() == Some(lib2.as_str()) && local["modifiable"] == Json::Bool(true) && local["suite"] == Json::Bool(false), "{}", dumps(&local));
    #[cfg(unix)]
    if unsafe { libc::geteuid() } != 0 {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&lib2, std::fs::Permissions::from_mode(0o555)).unwrap(); // catalogue impossible a ecrire
        let r = post(distant.port, "/api/lib/composants", r#"{"colonnes": ["Part Name"], "composants": []}"#);
        std::fs::set_permissions(&lib2, std::fs::Permissions::from_mode(0o755)).unwrap();
        assert!(r.code == 500 && r.detail() == web_cao::poste::DETAIL_INTERNE, "{} {}", r.code, r.texte());
    }
}

/// 27, 33 à 36 bis, 47, 48 : les dossiers de projet.
#[test]
fn projets() {
    let d = dossier_neuf("webcao-projets");
    let s = lancer(poste_essai(&d));
    let p = s.port;
    let lire = |chemin: &str| std::fs::read(chemin).unwrap();
    let tmp = |dossier: &str| std::fs::read_dir(dossier).unwrap().flatten().filter(|e| e.file_name().to_string_lossy().ends_with(".tmp")).count();

    // 27. Un chemin complet tape hors des racines n'elargit PLUS la liste
    // des racines : la racine par defaut reste celle ou l'on cree.
    let avant = s.poste.racines();
    let hors = format!("{d}/_hors_racine_test/carte");
    assert_eq!(s.poste.chemin_projet(&hors, None).unwrap(), abspath(&hors));
    assert_eq!(s.poste.racines(), avant);
    assert!(s.poste.chemin_projet("carte PIR", None).unwrap().starts_with(&avant[0]));
    assert_eq!(s.poste.chemin_projet(&abspath("/"), None).unwrap_err().code, 400, "la racine d'un disque ne doit pas etre un projet");
    let mut ferme = poste_essai(&d);
    ferme.projets_ouvert = false;
    assert_eq!(ferme.chemin_projet(&hors, None).unwrap_err().code, 403, "hors racine en ecoute reseau : doit etre refuse");
    for (brut, code) in [("", 400), ("a/../../x", 403), ("a/.git", 400), ("clients/acme/carte PIR", 0)] {
        assert_eq!(s.poste.chemin_projet(brut, None).map_or_else(|e| e.code, |_| 0), code, "{brut:?}");
    }
    assert_eq!(s.poste.chemin_projet("x", Some("/nulle/part")).unwrap_err().code, 403);

    // 33. Un projet.cao.json ne designe plus n'importe quel .json.
    let dossier = format!("{d}/ailleurs/carte");
    ecrire(format!("{dossier}/projet.cao.json"), r#"{"format": "cao-projet-1", "nom": "carte", "fichiers": {"schema": "settings.json"}}"#);
    let url = format!("/api/projet/doc?doc=schema&chemin={}", quote(&dossier));
    let req = |methode: &str, route: &str, corps: &str, entetes: &[(&str, &str)]| {
        let r = requete(p, methode, route, entetes, corps.as_bytes());
        (r.code, loads(if r.corps.is_empty() { "{}" } else { std::str::from_utf8(&r.corps).unwrap() }).unwrap())
    };
    let (st, data) = req("PUT", &url, r#"{"a": 1}"#, &[]);
    assert!(st == 200 && data["fichier"].as_str() == Some("carte-SCH.json"), "{}", dumps(&data));
    assert!(!std::path::Path::new(&format!("{dossier}/settings.json")).exists());
    assert_eq!(lire(&format!("{dossier}/carte-SCH.json")), b"{\n \"a\": 1\n}");

    // 34. L'heure de la derniere sauvegarde suit l'ecriture du document :
    // l'accueil l'affiche, et celle du seul projet.cao.json ne bougeait pas.
    let ecrit = data["modifie"].as_i64().unwrap();
    assert!(ecrit > 0);
    let projet_url = format!("/api/projet?chemin={}", quote(&dossier));
    let (st, lu) = req("GET", &projet_url, "", &[]);
    assert_eq!(st, 200, "{}", dumps(&lu));
    assert_eq!(lu["documents"]["schema"]["modifie"].as_i64(), Some(ecrit));
    assert_eq!(lu["documents"]["pcb"]["modifie"].as_i64(), Some(0));
    assert!(lu["sauve"].as_i64().unwrap() >= ecrit && lu["dossier"].as_str() == Some(dossier.as_str()));
    // fichier projet ancien
    std::fs::File::options().write(true).open(format!("{dossier}/projet.cao.json")).unwrap().set_modified(std::time::UNIX_EPOCH + std::time::Duration::from_secs(1)).unwrap();
    assert_eq!(derniere_sauvegarde(&dossier), ecrit);

    // 35. Ecriture conditionnelle : la date vue par la page est fausse (le
    // fichier a change ailleurs) -> 409 ; la bonne date ou pas de date -> 200.
    let mut vue = ecrit;
    for (vu, attendu) in [(Some(ecrit - 5000), 409), (Some(ecrit), 200), (None, 200)] {
        let (st, rep) = req("PUT", &format!("{url}{}", vu.map_or(String::new(), |v| format!("&modifie={v}"))), r#"{"a": 2}"#, &[]);
        assert_eq!(st, attendu, "{vu:?} {}", dumps(&rep));
        vue = rep["modifie"].as_i64().unwrap_or(vue);
    }
    let _ = vue;

    // 36. Deux ecritures simultanees du meme document : le fichier reste
    // du JSON entier (un .tmp commun melangeait les deux).
    let gros = [format!(r#"{{"k": "{}"}}"#, "x".repeat(400000)), format!(r#"{{"k": "{}"}}"#, "y".repeat(300000))];
    for _ in 0..15 {
        std::thread::scope(|fils| {
            for g in &gros {
                fils.spawn(|| assert_eq!(requete(p, "PUT", &url, &[], g.as_bytes()).code, 200));
            }
        });
        let k = loads(&String::from_utf8(lire(&format!("{dossier}/carte-SCH.json"))).unwrap()).unwrap();
        assert!(["x", "y"].contains(&&k["k"].as_str().unwrap()[..1]));
    }
    assert_eq!(tmp(&dossier), 0);

    // 36 bis. Brouillon (sauvegarde automatique) : ecrit a cote du document
    // sans 409, relu avec sa date, absent du releve, efface par DELETE --
    // qui n'efface jamais le document ; memes gardes que le document.
    let brou = format!("{url}&brouillon=1");
    let (st, rep) = req("PUT", &format!("{brou}&modifie=1"), r#"{"b": 1}"#, &[]); // date fausse : pas de 409
    assert!(st == 200 && rep["fichier"].as_str() == Some("carte-SCH.brouillon.json"), "{}", dumps(&rep));
    assert!(std::path::Path::new(&format!("{dossier}/carte-SCH.brouillon.json")).is_file());
    assert!(!String::from_utf8(lire(&format!("{dossier}/carte-SCH.json"))).unwrap().contains("\"b\"")); // le document n'a pas bouge
    let (st, rep) = req("GET", &brou, "", &[]);
    assert!(st == 200 && dumps(&rep["document"]) == r#"{"b": 1}"# && rep["modifie"].as_i64().unwrap() > 0, "{}", dumps(&rep));
    let (st, rep) = req("GET", &url, "", &[]);
    assert!(st == 200 && rep["document"].get("b").is_none());
    let (_, lu) = req("GET", &projet_url, "", &[]);
    assert_eq!(lu["documents"]["schema"]["fichier"].as_str(), Some("carte-SCH.json"));
    assert_eq!(Some(derniere_sauvegarde(&dossier)), lu["documents"]["schema"]["modifie"].as_i64());
    // seul le brouillon reste : le repli au suffixe ne le prend pas pour le document
    std::fs::rename(format!("{dossier}/carte-SCH.json"), format!("{dossier}/_sch")).unwrap();
    let (_, lu) = req("GET", &projet_url, "", &[]);
    assert_eq!(lu["documents"]["schema"]["present"], Json::Bool(false));
    assert_eq!(req("GET", &url, "", &[]).0, 404);
    std::fs::rename(format!("{dossier}/_sch"), format!("{dossier}/carte-SCH.json")).unwrap();
    // memes gardes : autre origine (CSRF), puis hors racine en ecoute reseau
    for (m, c) in [("PUT", r#"{"x": 1}"#), ("DELETE", "")] {
        assert_eq!(req(m, &brou, c, &[("Origin", "http://evil.example")]).0, 403, "{m}");
    }
    {
        let mut poste = poste_essai(&d);
        (poste.projets_ouvert, poste.projets_reseau) = (false, true);
        let reseau = lancer(poste);
        for (m, c) in [("GET", ""), ("PUT", r#"{"x": 1}"#), ("DELETE", "")] {
            assert_eq!(requete(reseau.port, m, &brou, &[], c.as_bytes()).code, 403, "{m}");
        }
    }
    let (_, rep) = req("GET", &brou, "", &[]);
    assert_eq!(dumps(&rep["document"]), r#"{"b": 1}"#); // rien n'a ete ecrit ni efface
    assert_eq!(req("DELETE", &url, "", &[]).0, 405); // sans brouillon=1 : refuse
    assert!(std::path::Path::new(&format!("{dossier}/carte-SCH.json")).is_file());
    let (st, rep) = req("DELETE", &brou, "", &[]);
    assert!(st == 200 && dumps(&rep) == r#"{"ok": true}"#);
    assert!(!std::path::Path::new(&format!("{dossier}/carte-SCH.brouillon.json")).exists());
    assert_eq!(req("DELETE", &brou, "", &[]).0, 200); // absent : pas une erreur
    assert_eq!(req("GET", &brou, "", &[]).0, 404);

    // 47. Projet : NaN/Infinity (pas du JSON) et caractere non encodable -> 400, rien
    // d'ecrit, aucun .tmp laisse ; creer=1 refuse un nom pris (409) au lieu d'ecraser.
    let avant = lire(&format!("{dossier}/carte-SCH.json"));
    for corps in [r#"{"a": NaN}"#, r#"{"a": -Infinity}"#, r#"{"a": "\ud800"}"#] {
        let (st, rep) = req("PUT", &url, corps, &[]);
        assert_eq!(st, 400, "{corps} {}", dumps(&rep));
    }
    assert_eq!(lire(&format!("{dossier}/carte-SCH.json")), avant);
    assert_eq!(tmp(&dossier), 0);
    let projet = lire(&format!("{dossier}/projet.cao.json"));
    let (st, rep) = req("PUT", &format!("/api/projet?creer=1&chemin={}", quote(&dossier)), r#"{"format": "cao-projet-1", "nom": "carte"}"#, &[]);
    assert!(st == 409 && rep["detail"].as_str().unwrap().contains("pris"), "{}", dumps(&rep));
    assert_eq!(lire(&format!("{dossier}/projet.cao.json")), projet);
    let autre = format!("{d}/ailleurs/autre");
    let (st, rep) = req("PUT", &format!("/api/projet?creer=1&chemin={}", quote(&autre)), r#"{"format": "cao-projet-1", "nom": "autre"}"#, &[]);
    assert!(st == 200 && std::path::Path::new(&format!("{autre}/projet.cao.json")).is_file(), "{}", dumps(&rep));
    assert_eq!(tmp(&autre), 0);

    // 48. Liste des projets : un sous-dossier illisible ne la vide plus ; ni lien
    // symbolique ni dossier cache ; un projet.cao.json qui n'est pas un objet est liste
    // sous son nom de dossier (plus de 500).
    let racine = format!("{d}/webcao_index");
    for sous in ["a_ferme", "ok", ".cache/x", "liste"] {
        std::fs::create_dir_all(format!("{racine}/{sous}")).unwrap();
    }
    ecrire(format!("{racine}/liste/projet.cao.json"), "[1, 2]");
    for sous in ["ok", ".cache/x"] {
        ecrire(format!("{racine}/{sous}/projet.cao.json"), format!(r#"{{"format": "cao-projet-1", "nom": "{}"}}"#, sous.rsplit('/').next().unwrap()));
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::os::unix::fs::symlink(format!("{racine}/ok"), format!("{racine}/lien")).unwrap();
        std::fs::set_permissions(format!("{racine}/a_ferme"), std::fs::Permissions::from_mode(0)).unwrap();
    }
    let mut trouves = Vec::new();
    explorer_projets(&racine, &racine, 0, &mut trouves);
    #[cfg(unix)]
    std::fs::set_permissions(format!("{racine}/a_ferme"), std::os::unix::fs::PermissionsExt::from_mode(0o755)).unwrap();
    let vus: Vec<(&str, &str)> = trouves.iter().map(|t| (t["chemin"].as_str().unwrap(), t["nom"].as_str().unwrap())).collect();
    assert_eq!(vus, [("liste", "liste"), ("ok", "ok")]);
    // et par la route : les projets de la racine déclarée, le plus récent d'abord
    let mut poste = poste_essai(&d);
    poste.racines_projets = vec![racine.clone()];
    let index = lancer(poste);
    let liste = get(index.port, "/api/projets").json();
    assert_eq!(dumps(&liste["racines"]), dumps(&Json::Liste(vec![racine.as_str().into()])));
    assert_eq!(liste["projets"].as_liste().unwrap().len(), 2);
}

/// Les profils : écrits, relus, listés, effacés (les routes n'avaient pas d'essai), dans un
/// dépôt d'essai pour ne rien poser dans profils/.
#[test]
fn profils() {
    let d = dossier_neuf("webcao-profils");
    let mut poste = poste_essai(&d);
    poste.racine = d.clone();
    let s = lancer(poste);
    let p = s.port;
    assert_eq!(get(p, "/api/profils").texte(), r#"{"profils": []}"#);
    let r = requete(p, "PUT", "/api/profil?nom=%20Pilou%20%20le%20Grand", &[], "{\"format\": \"cao-profil-1\", \"t\": 12, \"x\": [1, 2.5, \"\u{e9}\"]}".as_bytes());
    assert_eq!((r.code, r.texte().as_str()), (200, r#"{"ok": true, "nom": "Pilou le Grand", "t": 12}"#));
    assert_eq!(std::fs::read_to_string(format!("{d}/profils/Pilou le Grand.json")).unwrap(), "{\n \"format\": \"cao-profil-1\",\n \"t\": 12,\n \"x\": [\n  1,\n  2.5,\n  \"\u{e9}\"\n ],\n \"nom\": \"Pilou le Grand\"\n}");
    assert_eq!(get(p, "/api/profil?nom=Pilou%20le%20Grand").texte(), "{\"format\": \"cao-profil-1\", \"t\": 12, \"x\": [1, 2.5, \"\\u00e9\"], \"nom\": \"Pilou le Grand\"}");
    let liste = get(p, "/api/profils").json();
    assert!(liste["profils"][0]["nom"].as_str() == Some("Pilou le Grand") && liste["profils"][0]["t"].as_i64().unwrap() > 0);
    for (corps, nom) in [(r#"{"format": "autre"}"#, "x"), ("[1]", "x"), (r#"{"format": "cao-profil-1"}"#, "con"), (r#"{"format": "cao-profil-1"}"#, "..%2Fx"), ("{pas json", "x")] {
        assert_eq!(requete(p, "PUT", &format!("/api/profil?nom={nom}"), &[], corps.as_bytes()).code, 400, "{corps} {nom}");
    }
    assert_eq!(requete(p, "PUT", "/api/profil?nom=x", &[], "x".repeat(600000).as_bytes()).code, 413);
    assert_eq!(get(p, "/api/profil?nom=absent").code, 404);
    ecrire(format!("{d}/profils/casse.json"), "{pas du json");
    assert_eq!(get(p, "/api/profil?nom=casse").code, 422);
    assert_eq!(requete(p, "DELETE", "/api/profil?nom=Pilou%20le%20Grand", &[], b"").code, 200);
    assert_eq!(requete(p, "DELETE", "/api/profil?nom=Pilou%20le%20Grand", &[], b"").code, 200); // deja parti
    assert_eq!(get(p, "/api/profil?nom=Pilou%20le%20Grand").code, 404);
}

/// 52 (seconde moitié) : un cookie du lanceur non ASCII recoit une reponse, pas une
/// connexion coupee.
#[test]
fn cookie_non_ascii() {
    let d = dossier_neuf("webcao-cookie");
    let mut poste = poste_essai(&d);
    (poste.lanceur, poste.jeton_lanceur, poste.distant) = ("http://127.0.0.1:1".into(), "abc".into(), true);
    let s = lancer(poste);
    let r = requete(s.port, "POST", "/api/github/identite", &[("Cookie", "websuite_jeton=\u{e9}")], b"{}");
    assert_eq!(r.code, 403, "{}", r.texte());
}
