//! La passerelle MCP. Le cas 29 de python/test/banc-serveur-routes.py (un refus dès
//! l'ouverture de session remonte tel quel), et le déballage des réponses.

use outils::passerelle_mcp::{deballer, ClientMCP, ErreurPasserelle};
use serde_json::json;
use std::io::{Read, Write};
use std::net::TcpListener;

/// Un faux pcbparts.dev : à chaque requête, la réponse que rend `repondre(corps reçu)`.
fn faux_serveur(repondre: impl Fn(&str) -> String + Send + 'static) -> String {
    let ecoute = TcpListener::bind("127.0.0.1:0").unwrap();
    let url = format!("http://{}/mcp", ecoute.local_addr().unwrap());
    std::thread::spawn(move || {
        for flux in ecoute.incoming() {
            let mut flux = flux.unwrap();
            let (mut recu, mut tampon) = (Vec::new(), [0u8; 4096]);
            let corps = loop {
                let n = flux.read(&mut tampon).unwrap_or(0);
                recu.extend(&tampon[..n]);
                let texte = String::from_utf8_lossy(&recu).into_owned();
                if let Some((tete, corps)) = texte.split_once("\r\n\r\n") {
                    let taille = tete
                        .lines()
                        .find_map(|l| l.to_lowercase().strip_prefix("content-length:").map(|v| v.trim().parse::<usize>().unwrap()))
                        .unwrap_or(0);
                    if corps.len() >= taille {
                        break corps.to_string();
                    }
                }
                if n == 0 {
                    break String::new();
                }
            };
            let _ = flux.write_all(repondre(&corps).as_bytes());
        }
    });
    url
}

fn http(statut: &str, entetes: &str, corps: &str) -> String {
    format!("HTTP/1.1 {statut}\r\nContent-Length: {}\r\nConnection: close\r\n{entetes}\r\n{corps}", corps.len())
}

// 29. Passerelle MCP : un refus des la premiere requete (initialize)
// doit remonter avec son code et son message, pas en « Erreur interne ».
#[test]
fn un_refus_a_l_ouverture_de_session_remonte_tel_quel() {
    let client = ClientMCP::new(&faux_serveur(|_| http("429 Too Many Requests", "", "quota depasse")), 5.0);
    let e = client.appeler(&json!("jlc_search"), &json!({"query": "10k"})).expect_err("le refus aurait du remonter");
    assert!(e.code == 429 && e.message.contains("quota"), "{e:?}");
    assert_eq!(e.message, "pcbparts.dev a repondu 429 : quota depasse");
    let e = client.appeler(&json!("jlc_search"), &json!(["pas", "un", "objet"])).expect_err("arguments non objet acceptes");
    assert_eq!(e.code, 400);
    let e = client.appeler(&json!("rm_rf"), &json!({})).unwrap_err();
    assert_eq!(e, ErreurPasserelle::new(400, "Outil inconnu : rm_rf"));
    assert_eq!(client.appeler(&json!(null), &json!({})).unwrap_err().message, "Outil inconnu : None");
}

/// La session s'ouvre, l'identifiant suit, les arguments vides sont retirés, et la réponse
/// arrive en flux SSE comme en JSON.
#[test]
fn un_appel_complet() {
    let url = faux_serveur(|corps| {
        let v: serde_json::Value = serde_json::from_str(corps).unwrap();
        match v["method"].as_str().unwrap() {
            "initialize" => http("200 OK", "Mcp-Session-Id: abc\r\nContent-Type: application/json\r\n", "{\"result\":{}}"),
            "notifications/initialized" => http("202 Accepted", "", ""),
            "tools/list" => http("200 OK", "Content-Type: application/json\r\n", "{\"result\":{\"tools\":[{\"name\":\"jlc_search\"}]}}"),
            _ => {
                let rendu = json!({"result": {"content": [{"type": "text", "text": v["params"]["arguments"].to_string()}]}});
                http("200 OK", "Content-Type: text/event-stream\r\n", &format!("event: message\ndata: {{}}\ndata: {rendu}\n\n"))
            }
        }
    });
    let client = ClientMCP::new(&url, 5.0);
    let vu = client.appeler(&json!("jlc_search"), &json!({"query": "10k", "a": null, "b": "", "c": [], "d": 0, "e": false}));
    assert_eq!(vu, Ok(json!({"query": "10k", "d": 0, "e": false})));
    assert_eq!(client.outils(), Ok(json!([{"name": "jlc_search"}])));
}

#[test]
fn une_panne_ou_une_reponse_illisible_se_disent() {
    let client = ClientMCP::new(&faux_serveur(|_| http("200 OK", "", "<html>proxy</html>")), 5.0);
    let e = client.rpc("tools/list", None).unwrap_err();
    assert_eq!(e, ErreurPasserelle::new(502, "Reponse illisible de pcbparts.dev : <html>proxy</html>"));
    let client = ClientMCP::new(&faux_serveur(|_| http("200 OK", "Content-Type: text/event-stream\r\n", "rien")), 5.0);
    assert_eq!(client.rpc("tools/list", None).unwrap_err(), ErreurPasserelle::new(502, "Flux SSE vide"));
    let e = ClientMCP::new("http://127.0.0.1:1/mcp", 2.0).rpc("tools/list", None).unwrap_err();
    assert!(e.code == 503 && e.message.starts_with("Connexion impossible : "), "{e:?}");
}

#[test]
fn deballage() {
    assert_eq!(deballer(json!([1])), Ok(json!([1])));
    assert_eq!(deballer(json!({"error": {"code": -32602, "message": "non"}})), Err(ErreurPasserelle::new(502, "Erreur MCP -32602 : non")));
    assert_eq!(deballer(json!({"error": null})), Err(ErreurPasserelle::new(502, "Erreur MCP None : None")));
    assert_eq!(deballer(json!({"result": 3})), Ok(json!(3)));
    assert_eq!(deballer(json!({"result": {"structuredContent": {"a": 1}, "content": []}})), Ok(json!({"a": 1})));
    assert_eq!(deballer(json!({"result": {"content": [{"type": "text", "text": "[1, 2]"}]}})), Ok(json!([1, 2])));
    assert_eq!(deballer(json!({"content": [{"type": "text", "text": "pas du JSON"}]})), Ok(json!({"_message": "pas du JSON"})));
    assert_eq!(deballer(json!({"result": {"content": [{"type": "image"}]}})), Ok(json!({"content": [{"type": "image"}]})));
}

/// Contre le vrai pcbparts.dev : `cargo test -p outils --test passerelle -- --ignored`.
#[test]
#[ignore = "demande le réseau"]
fn en_vrai() {
    let liste = outils::passerelle_mcp::liste_outils().unwrap();
    assert!(!liste["tools"].as_array().unwrap().is_empty());
    assert_eq!(liste["allowed"].as_array().unwrap().len(), 14);
}
