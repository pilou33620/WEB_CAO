// ==========================================
// VERSIONING (repris de python/passerelle_mcp.py, dont ce module est le portage)
// Version: 1.1.0
// Date: 2026-08-21
// Explication: serveur-composants.py (FastAPI/uvicorn) est supprime. Depuis que
//   ce module existe, web_CAO.py expose exactement les memes routes en
//   bibliotheque standard, et la page interroge d'abord l'origine qui la sert :
//   le second serveur ne dupliquait plus que deux routes, au prix de fastapi +
//   uvicorn + pydantic. Ce module reste le seul detenteur de la logique de
//   protocole MCP ; il n'a plus qu'un appelant.
//
// Version: 1.0.0
// Date: 2026-08-21
// Explication: Le client MCP vers pcbparts.dev vivait dans
//   serveur-composants.py et dependait de httpx, donc de fastapi/uvicorn.
//   Resultat : la page recherche-composants servie par web_CAO.py (stdlib,
//   sans dependance) ne trouvait aucune passerelle et repondait « HTTP 404 »
//   sur /api/tools. Le client est deplace ici, reecrit en bibliotheque
//   standard uniquement, pour que les deux serveurs exposent la meme API.
// Fonctions:
// - ErreurPasserelle : erreur portant un code HTTP a renvoyer au navigateur
// - ClientMCP : session MCP Streamable HTTP (initialize + tools/list + tools/call)
// - deballer : structuredContent > content[].text parse > result
// - liste_outils / appeler_outil : les deux reponses JSON attendues par 01-api.js
// ==========================================
//! Passerelle vers le serveur MCP pcbparts.dev.
//!
//! Le navigateur ne peut pas appeler pcbparts.dev directement (CORS + protocole
//! MCP), il faut donc un relais local. Ce module en contient toute la logique ;
//! le serveur ne fait que l'exposer en HTTP.
//!
//! Ce qui ne peut pas etre celui de Python, a l'octet : le texte d'une panne de reseau
//! (« Connexion impossible : ... » cite l'erreur de la bibliotheque HTTP), et l'ecriture du
//! JSON envoye a pcbparts.dev (compacte ici, « , » et « : » espaces chez Python) -- le meme
//! JSON. Les reponses, leurs codes et leurs autres messages sont les memes.

use serde_json::{json, Map, Value};
use std::io::Read;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

pub const MCP_URL: &str = "https://pcbparts.dev/mcp";
pub const TIMEOUT: f64 = 30.0;

/// Outils que le frontend a le droit d'appeler.
pub const ALLOWED_TOOLS: [&str; 14] = [
    "jlc_search",
    "jlc_search_help",
    "jlc_stock_check",
    "jlc_get_part",
    "jlc_find_alternatives",
    "jlc_get_pinout",
    "mouser_get_part",
    "digikey_get_part",
    "cse_search",
    "cse_get_kicad",
    "sensor_recommend",
    "board_search",
    "board_get",
    "get_design_rules",
];

/// Erreur a renvoyer telle quelle au navigateur.
#[derive(Debug, Clone, PartialEq)]
pub struct ErreurPasserelle {
    pub code: u16,
    pub message: String,
}

impl ErreurPasserelle {
    pub fn new(code: u16, message: impl Into<String>) -> Self {
        ErreurPasserelle { code, message: message.into() }
    }
}

impl std::fmt::Display for ErreurPasserelle {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        f.write_str(&self.message)
    }
}

impl std::error::Error for ErreurPasserelle {}

/// « %s » d'une valeur JSON dans un message.
// shortcut: une liste ou un objet s'ecrivent en JSON, pas en repr() de Python (apostrophes) ;
// a reprendre si un message doit citer autre chose qu'un nom ou un code.
fn py_str(v: Option<&Value>) -> String {
    match v {
        None | Some(Value::Null) => "None".into(),
        Some(Value::Bool(b)) => if *b { "True" } else { "False" }.into(),
        Some(Value::String(s)) => s.clone(),
        Some(autre) => autre.to_string(),
    }
}

/// Extrait la charge utile : structuredContent > content[].text > result.
pub fn deballer(enveloppe: Value) -> Result<Value, ErreurPasserelle> {
    let Value::Object(env) = &enveloppe else { return Ok(enveloppe) };

    if let Some(err) = env.get("error") {
        return Err(ErreurPasserelle::new(
            502,
            format!("Erreur MCP {} : {}", py_str(err.get("code")), py_str(err.get("message"))),
        ));
    }

    let resultat = env.get("result").unwrap_or(&enveloppe);
    let Value::Object(res) = resultat else { return Ok(resultat.clone()) };

    if let Some(s) = res.get("structuredContent") {
        return Ok(s.clone());
    }

    if let Some(premier) = res.get("content").and_then(Value::as_array).and_then(|c| c.first()) {
        if premier.get("type").and_then(Value::as_str) == Some("text") {
            let texte = premier.get("text").and_then(Value::as_str).unwrap_or("");
            return Ok(match serde_json::from_str(texte) {
                Ok(v) => v,
                // Le serveur renvoie ses erreurs de validation en texte brut.
                Err(_) => json!({ "_message": texte }),
            });
        }
    }
    Ok(resultat.clone())
}

/// Ce que `_envoyer` levait : une HTTPError brute, ou l'erreur deja prete.
enum Echec {
    /// remontee brute : rpc() decide s'il faut rouvrir la session
    Http(u16, String),
    Passerelle(ErreurPasserelle),
}

struct Session {
    session_id: Option<String>,
    pret: bool,
    outils: Option<Value>,
}

/// Client MCP Streamable HTTP. Le serveur pcbparts.dev est stateless.
///
/// Les serveurs qui utilisent ce client sont multi-thread : un verrou serialise
/// les echanges, la session MCP n'etant pas partageable en parallele.
pub struct ClientMCP {
    pub url: String,
    agent: ureq::Agent,
    verrou: Mutex<Session>,
}

/// L'hote de `url` est-il de ceux qu'on joint sans proxy : la machine elle-meme, ou un nom
/// de NO_PROXY (le nom entier, ou un suffixe de domaine).
fn hors_proxy(url: &str) -> bool {
    let apres = url.split_once("://").map_or(url, |(_, r)| r);
    let hote = apres.split(['/', '?']).next().unwrap_or("");
    let hote = hote.rsplit_once('@').map_or(hote, |(_, h)| h);
    let hote = match hote.strip_prefix('[') {
        Some(v6) => v6.split(']').next().unwrap_or(""),
        None => hote.split(':').next().unwrap_or(""),
    }
    .to_lowercase();
    if hote == "localhost" || hote == "::1" || hote.starts_with("127.") {
        return true;
    }
    let liste = std::env::var("NO_PROXY").or_else(|_| std::env::var("no_proxy")).unwrap_or_default().to_lowercase();
    liste.split(',').map(|e| e.trim().trim_start_matches(['*', '.'])).any(|e| {
        !e.is_empty() && (e == "*" || hote == e || hote.ends_with(&format!(".{e}")))
    })
}

fn decoder(octets: &[u8]) -> String {
    String::from_utf8_lossy(octets).into_owned()
}

impl ClientMCP {
    pub fn new(url: &str, timeout: f64) -> Self {
        ClientMCP {
            url: url.into(),
            // native-certs lit le magasin de certificats du systeme :
            // indispensable derriere un proxy d'entreprise qui reecrit le TLS.
            // try_proxy_from_env : urllib suivait HTTPS_PROXY tout seul, NO_PROXY compris.
            agent: ureq::AgentBuilder::new()
                .timeout(Duration::from_secs_f64(timeout))
                .try_proxy_from_env(!hors_proxy(url))
                .build(),
            verrou: Mutex::new(Session { session_id: None, pret: false, outils: None }),
        }
    }

    fn session(&self) -> std::sync::MutexGuard<'_, Session> {
        self.verrou.lock().unwrap_or_else(|e| e.into_inner())
    }

    // -- transport ---------------------------------------------------------
    fn lire(corps: &[u8], type_contenu: Option<&str>) -> Result<Value, Echec> {
        let texte = decoder(corps);
        let illisible = |_| {
            // JSON tronque ou page HTML d'un proxy : dire d'ou vient
            // la panne plutot qu'une « Erreur interne » du serveur local
            let debut = decoder(&corps[..corps.len().min(120)]);
            Echec::Passerelle(ErreurPasserelle::new(502, format!("Reponse illisible de pcbparts.dev : {debut}")))
        };
        if type_contenu.unwrap_or("").contains("text/event-stream") {
            let derniere = texte.lines().filter(|l| l.starts_with("data:")).map(|l| l[5..].trim()).last();
            let Some(derniere) = derniere else {
                return Err(Echec::Passerelle(ErreurPasserelle::new(502, "Flux SSE vide")));
            };
            return serde_json::from_str(derniere).map_err(illisible);
        }
        serde_json::from_str(&texte).map_err(illisible)
    }

    fn envoyer(&self, s: &mut Session, charge: &Value, attendre_reponse: bool) -> Result<Option<Value>, Echec> {
        let mut requete = self
            .agent
            .post(&self.url)
            .set("Content-Type", "application/json")
            // Les deux types sont obligatoires, sinon le serveur renvoie 406.
            .set("Accept", "application/json, text/event-stream");
        if let Some(sid) = &s.session_id {
            requete = requete.set("Mcp-Session-Id", sid);
        }
        let injoignable = |e: &dyn std::fmt::Display| Echec::Passerelle(ErreurPasserelle::new(503, format!("Connexion impossible : {e}")));
        match requete.send_bytes(charge.to_string().as_bytes()) {
            Ok(rep) => {
                if let Some(sid) = rep.header("Mcp-Session-Id").filter(|v| !v.is_empty()) {
                    s.session_id = Some(sid.to_string());
                }
                let type_contenu = rep.header("Content-Type").map(str::to_string);
                let mut corps = Vec::new();
                rep.into_reader().read_to_end(&mut corps).map_err(|e| injoignable(&e))?;
                if !attendre_reponse {
                    return Ok(None);
                }
                Self::lire(&corps, type_contenu.as_deref()).map(Some)
            }
            Err(ureq::Error::Status(code, rep)) => {
                let mut corps = Vec::new();
                let _ = rep.into_reader().take(300).read_to_end(&mut corps);
                Err(Echec::Http(code, decoder(&corps)))
            }
            Err(e) => Err(injoignable(&e)),
        }
    }

    fn initialiser(&self, s: &mut Session) -> Result<(), Echec> {
        if s.pret {
            return Ok(());
        }
        self.envoyer(
            s,
            &json!({
                "jsonrpc": "2.0", "id": 0, "method": "initialize",
                "params": {
                    "protocolVersion": "2025-06-18",
                    "capabilities": {},
                    "clientInfo": {"name": "pcbparts-local-tool", "version": "2.2.0"},
                },
            }),
            true,
        )?;
        self.envoyer(s, &json!({"jsonrpc": "2.0", "method": "notifications/initialized"}), false)?;
        s.pret = true;
        Ok(())
    }

    // -- API ---------------------------------------------------------------
    fn rpc_verrouille(&self, s: &mut Session, methode: &str, params: Option<Value>) -> Result<Value, ErreurPasserelle> {
        let mut charge = json!({"jsonrpc": "2.0", "id": 1, "method": methode});
        if let Some(p) = params {
            charge["params"] = p;
        }
        // L'ouverture de session est DANS l'essai : un refus des la
        // toute premiere requete (initialize) remontait en HTTPError
        // brute, et la page n'affichait qu'« Erreur interne ».
        let essai = |s: &mut Session| {
            self.initialiser(s)?;
            self.envoyer(s, &charge, true)
        };
        let mut vu = essai(s);
        if let Err(Echec::Http(code, _)) = &vu {
            // Session perimee : on repart de zero une fois.
            if [400, 404].contains(code) && s.session_id.is_some() {
                s.session_id = None;
                s.pret = false;
                vu = essai(s);
            }
        }
        match vu {
            Ok(v) => Ok(v.unwrap_or(Value::Null)),
            Err(Echec::Passerelle(e)) => Err(e),
            Err(Echec::Http(code, corps)) => {
                Err(ErreurPasserelle::new(code, format!("pcbparts.dev a repondu {code} : {corps}")))
            }
        }
    }

    /// Un appel JSON-RPC, session ouverte si besoin.
    pub fn rpc(&self, methode: &str, params: Option<Value>) -> Result<Value, ErreurPasserelle> {
        self.rpc_verrouille(&mut self.session(), methode, params)
    }

    /// Liste des outils et de leurs schemas, mise en cache.
    pub fn outils(&self) -> Result<Value, ErreurPasserelle> {
        let mut s = self.session();
        if s.outils.is_none() {
            let enveloppe = self.rpc_verrouille(&mut s, "tools/list", None)?;
            if !enveloppe.is_object() {
                return Err(ErreurPasserelle::new(502, "Liste d'outils illisible"));
            }
            if enveloppe.get("error").is_some_and(vrai) {
                deballer(enveloppe.clone())?; // leve avec le message MCP
            }
            s.outils = Some(enveloppe.get("result").and_then(|r| r.get("tools")).cloned().unwrap_or_else(|| json!([])));
        }
        Ok(s.outils.clone().unwrap())
    }

    /// Appel d'un outil de la liste blanche.
    pub fn appeler(&self, nom: &Value, arguments: &Value) -> Result<Value, ErreurPasserelle> {
        if !nom.as_str().is_some_and(|n| ALLOWED_TOOLS.contains(&n)) {
            return Err(ErreurPasserelle::new(400, format!("Outil inconnu : {}", py_str(Some(nom)))));
        }
        if !arguments.is_null() && !arguments.is_object() {
            return Err(ErreurPasserelle::new(400, "Arguments d'outil : objet JSON attendu"));
        }
        // On retire les valeurs vides pour laisser jouer les defauts du serveur.
        let args: Map<String, Value> = arguments
            .as_object()
            .into_iter()
            .flatten()
            .filter(|(_, v)| !(v.is_null() || *v == &json!("") || *v == &json!([])))
            .map(|(k, v)| (k.clone(), v.clone()))
            .collect();
        deballer(self.rpc("tools/call", Some(json!({"name": nom, "arguments": args})))?)
    }
}

/// bool(v) de Python.
fn vrai(v: &Value) -> bool {
    match v {
        Value::Null => false,
        Value::Bool(b) => *b,
        Value::Number(n) => n.as_f64() != Some(0.0),
        Value::String(s) => !s.is_empty(),
        Value::Array(a) => !a.is_empty(),
        Value::Object(o) => !o.is_empty(),
    }
}

/// Client partage : la session MCP est reutilisee d'une requete a l'autre.
pub fn client() -> &'static ClientMCP {
    static CLIENT: OnceLock<ClientMCP> = OnceLock::new();
    CLIENT.get_or_init(|| ClientMCP::new(MCP_URL, TIMEOUT))
}

/// Reponse de GET /api/tools.
pub fn liste_outils() -> Result<Value, ErreurPasserelle> {
    let mut allowed = ALLOWED_TOOLS;
    allowed.sort();
    Ok(json!({"tools": client().outils()?, "allowed": allowed}))
}

/// Reponse de POST /api/tool.
pub fn appeler_outil(nom: &Value, arguments: &Value) -> Result<Value, ErreurPasserelle> {
    Ok(json!({"data": client().appeler(nom, arguments)?}))
}
