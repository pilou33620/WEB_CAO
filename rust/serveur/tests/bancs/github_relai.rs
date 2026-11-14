//! Banc d'essai du relai « Enregistrer + GitHub » : python/test/banc-github-relai.py, cas pour cas.
//!
//!     GET  /api/github             -- l'envoi est-il possible d'ici ?
//!     POST /api/github/envoyer     -- relaye au lanceur WEB_SUITE (/api/envoyer)
//!     POST /api/github/identite    -- relaye au lanceur WEB_SUITE (/api/identite)
//!
//! Un faux lanceur, sur la boucle locale, note ce qu'il recoit et repond comme le
//! vrai. Rien n'est commite ni pousse. Ce qui compte surtout ici : un autre
//! appareil du reseau ne passe qu'avec le jeton du lanceur, comme chez le lanceur
//! lui-meme -- sans quoi n'importe qui pousserait sur GitHub avec les identifiants
//! du poste. Chaque reglage du banc Python est ici un serveur lance avec ce reglage.

use std::io::{BufRead, BufReader, Read, Write};
use std::net::TcpListener;
use std::sync::{Arc, Mutex};

use crate::commun::*;

const JETON: &str = "jeton-du-lanceur-0123456789";

struct Recu {
    route: String,
    entetes: Vec<(String, String)>,
    corps: Json,
}

/// Le faux lanceur : note chaque POST et rend `reponse`.
struct FauxLanceur {
    port: u16,
    recus: Arc<Mutex<Vec<Recu>>>,
    reponse: Arc<Mutex<String>>,
}

impl FauxLanceur {
    fn demarrer() -> FauxLanceur {
        let ecoute = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = ecoute.local_addr().unwrap().port();
        let recus = Arc::new(Mutex::new(Vec::new()));
        let reponse = Arc::new(Mutex::new(String::new()));
        let (r2, rep2) = (recus.clone(), reponse.clone());
        std::thread::spawn(move || {
            for flux in ecoute.incoming().flatten() {
                let mut lecteur = BufReader::new(flux);
                let mut ligne = String::new();
                lecteur.read_line(&mut ligne).unwrap();
                let route = ligne.split(' ').nth(1).unwrap_or("").to_string();
                let mut entetes = Vec::new();
                loop {
                    ligne.clear();
                    lecteur.read_line(&mut ligne).unwrap();
                    match ligne.trim_end().split_once(':') {
                        Some((k, v)) => entetes.push((k.to_string(), v.trim().to_string())),
                        None => break,
                    }
                }
                let n = entetes.iter().find(|(k, _)| k.eq_ignore_ascii_case("Content-Length")).and_then(|(_, v)| v.parse().ok()).unwrap_or(0);
                let mut corps = vec![0u8; n];
                lecteur.read_exact(&mut corps).unwrap();
                r2.lock().unwrap().push(Recu { route, entetes, corps: loads(&String::from_utf8_lossy(&corps)).unwrap_or(Json::Nul) });
                let rendu = rep2.lock().unwrap().clone();
                let _ = write!(lecteur.get_mut(), "HTTP/1.0 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{}", rendu.len(), rendu);
            }
        });
        FauxLanceur { port, recus, reponse }
    }

    fn repondre(&self, reponse: &str) {
        *self.reponse.lock().unwrap() = reponse.to_string();
    }

    fn compte(&self) -> usize {
        self.recus.lock().unwrap().len()
    }
}

/// Le réglage d'un serveur du banc (`regler` du banc Python).
struct Reglage<'a> {
    lanceur: &'a str,
    local: bool,
    ouvert: bool,
    reseau: bool,
    jeton: &'a str,
}

fn regler(dossier: &str, r: Reglage) -> Lance {
    let mut poste = poste_essai(dossier);
    (poste.lanceur, poste.jeton_lanceur) = (r.lanceur.to_string(), r.jeton.to_string());
    (poste.projets_ouvert, poste.projets_reseau, poste.distant) = (r.ouvert, r.reseau, !r.local);
    lancer(poste)
}

fn req(s: &Lance, methode: &str, route: &str, corps: &str, entetes: &[(&str, &str)]) -> (u16, Json) {
    let r = requete(s.port, methode, route, entetes, corps.as_bytes());
    (r.code, loads(&r.texte()).unwrap_or(Json::Nul))
}

#[test]
fn relai_github() {
    let d = dossier_neuf("webcao-github");
    let faux = FauxLanceur::demarrer();
    faux.repondre(r#"{"ok": true, "message": "Envoyé sur GitHub.", "outils": []}"#);
    let adresse = format!("http://127.0.0.1:{}", faux.port);
    let ici = || Reglage { lanceur: &adresse, local: true, ouvert: true, reseau: false, jeton: JETON };
    let detail = |d: &Json| d["detail"].as_str().unwrap_or("").to_string();

    // -- sans lanceur : la route n'existe pas ---------------------------
    let s = regler(&d, Reglage { lanceur: "", ..ici() });
    let (st, rep) = req(&s, "GET", "/api/github", "", &[]);
    assert!(st == 200 && rep["suite"] == Json::Bool(false) && rep["disponible"] == Json::Bool(false), "sans lanceur, mode WEB_SUITE absent : {}", dumps(&rep));
    let (st, _) = req(&s, "POST", "/api/github/envoyer", r#"{"message": "x"}"#, &[]);
    assert!(st == 404 && faux.compte() == 0, "sans lanceur, rien n'est relaye");
    // sans lanceur : un chemin tape hors des racines reste permis en ecoute locale
    let ailleurs = dossier_neuf("webcao-github-ailleurs");
    let (st, _) = req(&s, "GET", &format!("/api/projet?chemin={}", quote(&ailleurs)), "", &[]);
    assert_ne!(st, 403);

    // -- un « lanceur » hors de ce poste n'est jamais appele ------------
    let s = regler(&d, Reglage { lanceur: "http://192.168.1.50:8100", ..ici() });
    let (st, rep) = req(&s, "GET", "/api/github", "", &[]);
    assert!(st == 200 && rep["suite"] == Json::Bool(false), "lanceur hors boucle locale refuse");

    // -- ce poste, ecoute locale ------------------------------------------
    let s = regler(&d, ici());
    let (st, rep) = req(&s, "GET", "/api/github", "", &[]);
    assert!(st == 200 && rep["disponible"] == Json::Bool(true), "ce poste : envoi disponible");
    assert!(rep["suite"] == Json::Bool(true), "ce poste : mode WEB_SUITE annonce (seule sauvegarde : projet + GitHub)");

    // -- mode WEB_SUITE : un projet ne vit que sous les racines (PROJETS/CAO) --
    let (st, rep) = req(&s, "GET", &format!("/api/projet?chemin={}", quote(&ailleurs)), "", &[]);
    assert!(st == 403 && detail(&rep).contains("WEB_SUITE"), "WEB_SUITE : chemin tape hors de PROJETS refuse (jamais envoye sur GitHub) : {}", dumps(&rep));

    // -- mode WEB_SUITE : la LIB est celle de PROJETS, elle ne se deplace pas --
    let lib_avant = s.poste.dossier_lib();
    let (st, rep) = req(&s, "GET", "/api/lib/config", "", &[]);
    assert!(st == 200 && rep["suite"] == Json::Bool(true) && rep["modifiable"] == Json::Bool(false), "WEB_SUITE : LIB annoncee non deplacable");
    let (st, rep) = req(&s, "POST", "/api/lib/config", &format!(r#"{{"chemin": {}, "initialiser": false}}"#, dumps(&Json::from(ailleurs.as_str()))), &[]);
    assert!(st == 403 && detail(&rep).contains("WEB_SUITE") && s.poste.dossier_lib() == lib_avant, "WEB_SUITE : deplacer la LIB est refuse");
    let (st, rep) = req(&s, "POST", "/api/github/envoyer", r#"{"message": "Schema : ajout du regulateur"}"#, &[]);
    assert!(st == 200 && rep["ok"] == Json::Bool(true) && rep["message"].as_str() == Some("Envoyé sur GitHub."), "ce poste : envoi relaye au lanceur : {}", dumps(&rep));
    {
        let recus = faux.recus.lock().unwrap();
        let r = recus.last().unwrap();
        assert!(r.route == "/api/envoyer" && dumps(&r.corps) == r#"{"id": "web_cao", "message": "Schema : ajout du regulateur"}"#, "relai : route /api/envoyer, outil web_cao, message transmis");
        let entete = |nom: &str| r.entetes.iter().find(|(k, _)| k.eq_ignore_ascii_case(nom)).map(|(_, v)| v.as_str());
        assert!(entete("X-WebSuite") == Some("1") && entete("Host") == Some(format!("127.0.0.1:{}", faux.port).as_str()), "relai : en-tete X-WebSuite et Host local (exiges par le lanceur)");
    }

    // -- poste neuf : le lanceur demande l'identite git --------------------
    faux.repondre(r#"{"ok": false, "identite": true, "message": "git ne connaît pas encore"}"#);
    let (st, rep) = req(&s, "POST", "/api/github/envoyer", r#"{"message": "x"}"#, &[]);
    assert!(st == 200 && rep["identite"] == Json::Bool(true) && rep["ok"] == Json::Bool(false), "identite manquante transmise a l'editeur");
    faux.repondre(r#"{"ok": true, "message": "Identité git enregistrée pour PROJETS."}"#);
    let (st, rep) = req(&s, "POST", "/api/github/identite", r#"{"nom": "Pilou", "email": "p@example.com"}"#, &[]);
    {
        let recus = faux.recus.lock().unwrap();
        let r = recus.last().unwrap();
        assert!(st == 200 && rep["ok"] == Json::Bool(true) && r.route == "/api/identite" && dumps(&r.corps) == r#"{"nom": "Pilou", "email": "p@example.com"}"#, "identite relayee");
    }
    faux.repondre(r#"{"ok": true, "message": "Envoyé sur GitHub.", "outils": []}"#);
    // -- page d'un autre site : protection CSRF ----------------------------
    let avant = faux.compte();
    let (st, _) = req(&s, "POST", "/api/github/envoyer", r#"{"message": "x"}"#, &[("Origin", "https://exemple.com")]);
    assert!(st == 403 && faux.compte() == avant, "origine inter-site refusee");

    // -- autre appareil du reseau : le jeton du lanceur est exige ----------
    let s = regler(&d, Reglage { local: false, ouvert: false, reseau: true, ..ici() });
    let avant = faux.compte();
    let (st, rep) = req(&s, "GET", "/api/github", "", &[]);
    assert!(
        st == 200 && rep["suite"] == Json::Bool(true) && rep["disponible"] == Json::Bool(false) && detail(&rep).contains("jeton"),
        "autre appareil sans jeton : mode WEB_SUITE, envoi indisponible et explique : {}",
        dumps(&rep)
    );
    let (st, _) = req(&s, "POST", "/api/github/envoyer", r#"{"message": "x"}"#, &[]);
    assert!(st == 403 && faux.compte() == avant, "autre appareil sans jeton : refuse, rien de relaye");
    let (st, _) = req(&s, "POST", "/api/github/envoyer", r#"{"message": "x"}"#, &[("Cookie", "websuite_jeton=mauvais-jeton-0000000000")]);
    assert!(st == 403 && faux.compte() == avant, "autre appareil, mauvais jeton : refuse");
    let (st, rep) = req(&s, "GET", "/api/github", "", &[("Cookie", &format!("autre=1; websuite_jeton={JETON}"))]);
    assert!(st == 200 && rep["disponible"] == Json::Bool(true), "autre appareil, bon jeton (cookie du lanceur) : disponible");
    let (st, rep) = req(&s, "POST", "/api/github/envoyer", r#"{"message": "depuis l'iPad"}"#, &[("Cookie", &format!("websuite_jeton={JETON}"))]);
    assert!(
        st == 200 && rep["ok"] == Json::Bool(true) && faux.recus.lock().unwrap().last().unwrap().corps["message"].as_str() == Some("depuis l'iPad"),
        "autre appareil, bon jeton : envoi relaye"
    );

    let s = regler(&d, Reglage { local: false, ouvert: false, reseau: true, jeton: "", ..ici() });
    let avant = faux.compte();
    let (st, _) = req(&s, "POST", "/api/github/envoyer", r#"{"message": "x"}"#, &[("Cookie", "websuite_jeton=")]);
    assert!(st == 403 && faux.compte() == avant, "lanceur sans jeton : un autre appareil ne passe jamais");

    // -- ecoute reseau sans --projets-reseau : fermee comme les projets ----
    let s = regler(&d, Reglage { ouvert: false, reseau: false, ..ici() });
    let (st, _) = req(&s, "POST", "/api/github/envoyer", r#"{"message": "x"}"#, &[]);
    assert!(st == 403 && faux.compte() == avant, "ecoute reseau sans --projets-reseau : refuse");

    // -- lanceur arrete -----------------------------------------------------
    let libre = TcpListener::bind("127.0.0.1:0").unwrap().local_addr().unwrap().port(); // plus personne n'y écoute
    let s = regler(&d, Reglage { lanceur: &format!("http://127.0.0.1:{libre}"), ..ici() });
    let (st, rep) = req(&s, "POST", "/api/github/envoyer", r#"{"message": "x"}"#, &[]);
    assert!(st == 502 && detail(&rep).contains("injoignable"), "lanceur injoignable : 502 lisible : {}", dumps(&rep));
}
