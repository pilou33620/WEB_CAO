//! Le serveur des pages : ce que faisait la classe `CustomHandler` de web_CAO.py. Les
//! fichiers par liste blanche, la garde (Host, appairage, CSRF), la lecture des corps et
//! l'aiguillage ; les familles de routes sont dans `projets`, `lib_cao`, `calculs` et
//! `datasheet`.

use std::io::Read;
use std::path::Path;
use std::sync::{Condvar, LazyLock, Mutex, MutexGuard};

use regex::Regex;
use web_tools_commun::appairage::{self, Garde};
use web_tools_commun::pilote::Pilote;
use web_tools_commun::serveur::{Reponse, Requete};

use crate::chemins::{abspath, dessous, est_dossier, existe, joindre, realpath};
use crate::json::{self, ascii, dumps, sans_non_finis, Json};
use crate::obj;

/// Taille maximale d'un corps POST : les arguments d'outil sont minuscules.
pub const MAX_CORPS: usize = 64 * 1024;
pub const DETAIL_INTERNE: &str = "Erreur interne (details dans le terminal du serveur)";

// Fichiers statiques : liste blanche (REGLES-NOUVEAU-WEB-TOOL §3.1). Ne sort que
// ce que les pages chargent : leur .html, leurs js/ et css/, commun/, le manuel, les regles,
// les regles des fabricants (24-pcb-capabilities.js) et les monofichiers dist/.
// Le reste est 404 : rust/, tests, bancs-mesure/, tasks/, graphify-out/,
// *.md, profils d'utilisateur, projets/ (ils ont leurs routes /api/...).
// Un segment commence par une lettre, un chiffre, « _ » ou « - » : ni « .. »,
// ni fichier cache, ni « : » (flux NTFS ::$DATA), ni « \ ».
pub static STATIQUE: LazyLock<Regex> = LazyLock::new(|| {
    let pages = r"(?:editeur-pcb|editeur-schematique|gestion-lib|visionneuse-ipc2581|recherche-composants)";
    Regex::new(&format!(
        concat!(
            r"^/(?:index\.html)?$",
            r"|^/{p}/?$", // dossier -> <dossier>.html
            r"|^/{p}/[\w-]+\.html$",
            r"|^/editeur-(?:pcb|schematique)/dist/[\w-]+\.html$",
            r"|^/{p}/(?:js|css)(?:/[\w-]+)*/[\w-][\w.-]*\.(?:js|css|json|png|svg|gif|woff2?|ttf|wasm)$",
            r"|^/commun(?:/vendor)?/[\w-][\w.-]*\.(?:js|css|json)$",
            r"|^/docs/(?:manuel/manuel|regles/regles)\.html$",
            r"|^/profils/fabricants/[\w-][\w.-]*\.json$"
        ),
        p = pages
    ))
    .unwrap()
});
// /LIB/ : les fichiers de donnees de la bibliotheque active (memes extensions que
// l'API) ; son catalogue passe par /api/lib/composants.
pub static STATIQUE_LIB: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^/LIB(?:/[^/.:\\][^/:\\]*)+$").unwrap());
// Extensions qu'une route LIB accepte d'ecrire : des donnees, jamais une page
// (.html servie sur l'origine de l'outil = script avec tous ses droits) ni un
// executable.
pub static STEP_EXTENSIONS: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)\.(stp|step)$").unwrap());
pub static LIB_EXTENSIONS: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)\.(json|mod|sub|lib|cir|sp|spi|spice|txt|ibs|s\dp|kicad_mod|kicad_sym)$").unwrap());

/// Refus explicite d'une route : code HTTP + message lisible (ErreurHTTP de web_CAO.py).
#[derive(Debug)]
pub struct Refus {
    pub code: u16,
    pub message: String,
}

pub type Rendu = Result<Json, Refus>;

pub fn refus(code: u16, message: impl Into<String>) -> Refus {
    Refus { code, message: message.into() }
}

/// L'imprévu : toujours générique au client (le texte brut porte des chemins absolus du
/// poste, REGLES §3.3). Le détail part dans le terminal.
pub fn interne(trace: impl std::fmt::Display) -> Refus {
    eprintln!("  {}", trace);
    refus(500, DETAIL_INTERNE)
}

/// Une panique tient lieu d'exception inattendue : sa trace est déjà dans le terminal.
pub fn proteger<T>(action: impl FnOnce() -> Result<T, Refus>) -> Result<T, Refus> {
    std::panic::catch_unwind(std::panic::AssertUnwindSafe(action)).unwrap_or_else(|_| Err(refus(500, DETAIL_INTERNE)))
}

/// Le corps JSON d'une requête. `brise` : il porte un « \udXXX » isolé, que Python lisait
/// mais ne pouvait pas écrire sur le disque.
pub struct Corps {
    pub json: Json,
    pub brise: bool,
}

pub fn rendre_json(code: u16, mut charge: Json) -> Reponse {
    // NaN/Infinity ne sont pas du JSON, la page ne relirait pas la reponse ; un calcul
    // qui en rend (une frequence limite infinie...) part avec null a leur place
    sans_non_finis(&mut charge);
    let corps = ascii(dumps(&charge)).into_bytes();
    Reponse {
        code,
        entetes: vec![("Content-Type".into(), "application/json; charset=utf-8".into()), ("Content-Length".into(), corps.len().to_string())],
        corps,
        suite: None,
    }
}

pub fn rendre_detail(code: u16, texte: &str) -> Reponse {
    rendre_json(code, obj! {"detail" => texte})
}

/// send_error de http.server : la même page d'erreur.
pub fn erreur(code: u16, message: &str) -> Reponse {
    let explication = match code {
        400 => "Bad request syntax or unsupported method",
        403 => "Request forbidden -- authorization will not help",
        404 => "Nothing matches the given URI",
        405 => "Specified method is invalid for this resource",
        500 => "Server got itself in trouble",
        _ => "Server does not support this operation",
    };
    eprintln!("  code {}, message {}", code, message);
    let message = message.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;");
    let corps = format!(
        "<!DOCTYPE HTML>\n<html lang=\"en\">\n    <head>\n        <meta charset=\"utf-8\">\n        <title>Error response</title>\n    </head>\n    <body>\n        <h1>Error response</h1>\n        <p>Error code: {code}</p>\n        <p>Message: {message}.</p>\n        <p>Error code explanation: {code} - {explication}.</p>\n    </body>\n</html>\n"
    );
    Reponse { code, entetes: vec![("Content-Type".into(), "text/html;charset=utf-8".into())], corps: corps.into_bytes(), suite: None }
}

fn introuvable() -> Reponse {
    erreur(404, "File not found")
}

/// Les types que ce serveur distribue : ceux que rendait la table de Python, sans s'en
/// remettre au registre du système.
pub fn type_mime(chemin: &str) -> &'static str {
    let ext = Path::new(chemin).extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
    match ext.as_str() {
        "html" => "text/html",
        "js" => "text/javascript",
        "css" => "text/css",
        "json" => "application/json",
        "png" => "image/png",
        "svg" => "image/svg+xml",
        "gif" => "image/gif",
        "woff" => "font/woff",
        "woff2" => "font/woff2",
        "ttf" => "font/ttf",
        "wasm" => "application/wasm",
        "txt" => "text/plain",
        "stp" | "step" => "model/step",
        _ => "application/octet-stream",
    }
}

/// urllib.parse.unquote : %XX, et « + » reste « + ».
pub fn decoder_chemin(s: &str) -> String {
    let b = s.as_bytes();
    let hex = |i: usize| b.get(i).and_then(|c| (*c as char).to_digit(16));
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        match (b[i], hex(i + 1), hex(i + 2)) {
            (b'%', Some(h), Some(l)) => {
                out.push((h * 16 + l) as u8);
                i += 3;
            }
            (c, _, _) => {
                out.push(c);
                i += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Le chemin d'URL (déjà décodé) est-il un fichier que les pages chargent ?
pub fn statique_permis(chemin: &str) -> bool {
    STATIQUE.is_match(chemin) || (STATIQUE_LIB.is_match(chemin) && (LIB_EXTENSIONS.is_match(chemin) || STEP_EXTENSIONS.is_match(chemin)))
}

/// La route : le chemin sans sa barre finale.
pub fn route(r: &Requete) -> String {
    let chemin = r.chemin().trim_end_matches('/');
    if chemin.is_empty() { "/".into() } else { chemin.to_string() }
}

/// Le premier paramètre non vide de ce nom, « » sinon.
pub fn param(r: &Requete, nom: &str) -> String {
    r.param(nom).unwrap_or_default()
}

/// (hote, port) du lanceur, s'il est sur ce poste ; None sinon.
///
/// Le relai ne part que vers la boucle locale : une adresse venue d'ailleurs
/// ferait de cette route un tremplin vers n'importe quel serveur.
pub fn adresse_lanceur(lanceur: &str) -> Option<u16> {
    let reste = lanceur.get(..7).filter(|s| s.eq_ignore_ascii_case("http://")).map(|_| &lanceur[7..])?;
    let autorite = reste.split(['/', '?', '#']).next().unwrap_or("");
    let (hote, port) = autorite.rsplit('@').next().unwrap_or("").rsplit_once(':')?;
    let hote = hote.to_lowercase();
    let port: u16 = port.parse().ok().filter(|p| *p != 0)?;
    (hote == "127.0.0.1" || hote == "localhost").then_some(port)
}

/// Calculs lourds simultanes (corps jusqu'a 192 Mo) : au-dela, on attend son
/// tour plutot que de laisser le reseau remplir la memoire.
pub struct Places {
    libres: Mutex<usize>,
    signal: Condvar,
}

pub struct Place<'a>(&'a Places);

impl Places {
    pub fn new(n: usize) -> Self {
        Places { libres: Mutex::new(n), signal: Condvar::new() }
    }
    pub fn prendre(&self) -> Place<'_> {
        let mut libres = verrou(&self.libres);
        while *libres == 0 {
            libres = self.signal.wait(libres).unwrap_or_else(|e| e.into_inner());
        }
        *libres -= 1;
        Place(self)
    }
}

impl Drop for Place<'_> {
    fn drop(&mut self) {
        *verrou(&self.0.libres) += 1;
        self.0.signal.notify_one();
    }
}

/// Un verrou reste utilisable après une panique du fil qui le tenait.
pub fn verrou<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

pub struct Poste {
    /// Le dépôt : index.html, les pages, commun/, profils/, config_lib.json.
    pub racine: String,
    /// Host contrôlé (DNS rebinding) et code d'appairage exigé des autres appareils du réseau.
    pub garde: Garde,
    /// Canal de pilotage des pages par le MCP de web_suite.
    pub pilote: Pilote,
    /// WEBSUITE_LANCEUR : l'adresse du lanceur sur ce poste ; WEBSUITE_JETON : son jeton.
    pub lanceur: String,
    pub jeton_lanceur: String,
    /// Vrai seulement si l'écoute est locale : les dossiers de projet et l'écriture de la LIB.
    pub projets_ouvert: bool,
    /// --projets-reseau : ouvre aussi au reseau la lecture/ecriture des projets SOUS
    /// LES RACINES DECLAREES et des fichiers de la LIB active -- rien d'autre.
    pub projets_reseau: bool,
    /// Fixées au démarrage par --projets ; vide : projets/ à côté d'index.html.
    pub racines_projets: Vec<String>,
    /// La LIB par défaut imposée (bancs d'essai) ; None : LIB/ du dépôt, sinon ../PROJETS/LIB_CAO.
    pub lib_defaut: Option<String>,
    pub lib_actif: Mutex<Option<String>>,
    /// --lib : config_lib.json n'est plus relu.
    pub lib_impose: bool,
    pub max_lib: usize,
    /// Bancs d'essai : ce poste est traité comme un autre appareil (ne peut que retirer des droits).
    pub distant: bool,
    // le controle de date et l'ecriture du catalogue : deux enregistrements simultanes ne doivent pas se croiser
    pub(crate) verrou_catalogue: Mutex<()>,
    // controle de date + ecriture d'un document de projet, d'un seul tenant
    pub(crate) verrou_docs: Mutex<()>,
    pub(crate) calculs: Places,
}

impl Poste {
    /// `local` : l'écoute obtenue est 127.0.0.1 (pas d'appairage, dossiers de projet ouverts).
    pub fn new(racine: &str, local: bool) -> Poste {
        Poste {
            racine: racine.to_string(),
            garde: Garde::new("WEB_CAO", !local, None, None),
            pilote: Pilote::default(),
            lanceur: String::new(),
            jeton_lanceur: String::new(),
            projets_ouvert: local,
            projets_reseau: false,
            racines_projets: Vec::new(),
            lib_defaut: None,
            lib_actif: Mutex::new(None),
            lib_impose: false,
            max_lib: crate::lib_cao::MAX_LIB,
            distant: false,
            verrou_catalogue: Mutex::new(()),
            verrou_docs: Mutex::new(()),
            calculs: Places::new(2),
        }
    }

    pub fn servir(&self, r: &mut Requete) -> Reponse {
        // « //ailleurs.example » en tete d'adresse : une seule barre, comme http.server le
        // faisait avant toute route (une redirection vers un autre site s'ecrirait ainsi).
        if r.cible.starts_with("//") {
            r.cible = format!("/{}", r.cible.trim_start_matches('/'));
        }
        // Host (parade au DNS rebinding) puis code d'appairage : tous deux dans garde.filtrer.
        let rendu = match self.garde.filtrer(r) {
            Some(refus) => refus,
            None => match r.methode.as_str() {
                "GET" => self.get(r),
                "HEAD" => self.head(r),
                "POST" => self.post(r),
                "PUT" => self.put(r),
                "DELETE" => self.delete(r),
                autre => erreur(501, &format!("Unsupported method ('{}')", autre)),
            },
        };
        // une ligne par requete, jeton masque
        eprintln!("  {}", appairage::masquer(&format!("\"{} {}\" {} -", r.methode, r.cible, rendu.code)));
        let mut rendu = rendu;
        // un seul Cache-Control, le même pour tout : les réponses de la garde et du pilote en portent déjà un
        rendu.entetes.retain(|(k, _)| !k.eq_ignore_ascii_case("Cache-Control"));
        rendu
            .entete("Cache-Control", "no-cache, no-store, must-revalidate")
            .entete("Pragma", "no-cache")
            .entete("Expires", "0")
            // un .txt ou un .json de la LIB ne doit jamais etre interprete en page
            .entete("X-Content-Type-Options", "nosniff")
            // Pas d'affichage dans le cadre d'un autre site : un clic piégé sur « Appliquer » du panneau Claude
            .entete("X-Frame-Options", "SAMEORIGIN")
            .entete("Content-Security-Policy", "frame-ancestors 'self'")
    }

    /// La requete vient-elle de ce poste (boucle locale) ?
    pub fn client_local(&self, r: &Requete) -> bool {
        !self.distant && appairage::ce_poste(r)
    }

    pub fn lanceur_port(&self) -> Option<u16> {
        adresse_lanceur(&self.lanceur)
    }

    // -- fichiers statiques ------------------------------------------------
    /// /LIB/... -> fichier du dossier de bibliotheque actif, ou None.
    ///
    /// Le dossier actif peut vivre hors du depot (--lib) : sans
    /// ce detour, /LIB/ servait toujours le LIB/ du depot. Hors du depot, il
    /// n'est servi qu'en ecoute locale -- meme regle que les dossiers de
    /// projet : un chemin choisi par /api/lib/config ne s'ouvre pas au reseau.
    fn chemin_lib(&self, clean: &str) -> Option<String> {
        if !(clean == "/LIB" || clean.starts_with("/LIB/")) {
            return None;
        }
        let real_lib = realpath(&self.dossier_lib());
        let hors_depot = !dessous(&real_lib, &realpath(&self.racine));
        if hors_depot && !(self.projets_ouvert || self.projets_reseau) {
            return None;
        }
        let rel = clean.get(5..).unwrap_or("").trim_start_matches(['/', '\\']);
        let cible = abspath(&joindre(&real_lib, rel));
        dessous(&realpath(&cible), &real_lib).then_some(cible)
    }

    /// Vrai si le fichier (liens resolus) sort de la racine, ou de la
    /// bibliotheque active quand elle vit ailleurs : un lien symbolique
    /// d'un dossier permis ne doit pas ouvrir le reste du disque.
    fn hors_racine(&self, chemin: &str) -> bool {
        let real = realpath(chemin);
        if dessous(&real, &realpath(&self.racine)) {
            return false;
        }
        // hors du depot, seule la bibliotheque active peut etre servie
        // (chemin_lib a deja verifie qu'elle en a le droit)
        let dans_lib = dessous(&real, &realpath(&self.dossier_lib()));
        !((self.projets_ouvert || self.projets_reseau) && dans_lib)
    }

    /// Chemin URL -> fichier : /LIB/ vers la bibliotheque active, le reste
    /// sous la racine, avec <dossier>/<dossier>.html pour un dossier sans index.
    fn traduire(&self, chemin: &str) -> String {
        if let Some(cible) = self.chemin_lib(chemin) {
            return cible;
        }
        let fichier = chemin.split('/').filter(|m| !m.is_empty() && *m != "." && *m != "..").fold(self.racine.clone(), |c, m| joindre(&c, m));
        if est_dossier(&fichier) && !existe(&joindre(&fichier, "index.html")) {
            let candidat = joindre(&fichier, &format!("{}.html", crate::chemins::basename(&fichier)));
            if existe(&candidat) {
                return candidat;
            }
        }
        fichier
    }

    fn statique(&self, r: &Requete) -> Reponse {
        let rel = r.chemin();
        // Le depot n'a pas de favicon : repondre « rien a afficher » plutot
        // qu'un 404 par onglet ouvert dans le journal des requetes.
        if rel == "/favicon.ico" && !existe(&joindre(&self.racine, "favicon.ico")) {
            return Reponse { code: 204, entetes: Vec::new(), corps: Vec::new(), suite: None };
        }
        let chemin = decoder_chemin(rel);
        if !statique_permis(&chemin) {
            return introuvable();
        }
        let mut cible = self.traduire(&chemin);
        if self.hors_racine(&cible) {
            return introuvable();
        }
        if est_dossier(&cible) {
            if !rel.ends_with('/') {
                let requete = if r.requete().is_empty() { String::new() } else { format!("?{}", r.requete()) };
                return Reponse { code: 301, entetes: Vec::new(), corps: Vec::new(), suite: None }.entete("Location", &format!("{}/{}", rel, requete));
            }
            cible = joindre(&cible, "index.html");
        }
        // Par blocs : un monofichier ou un modèle STEP pèsent plusieurs méga-octets.
        match std::fs::File::open(&cible).and_then(|f| Ok((f.metadata()?, f))) {
            Ok((st, f)) if st.is_file() => Reponse {
                code: 200,
                entetes: vec![("Content-type".into(), type_mime(&cible).into()), ("Content-Length".into(), st.len().to_string())],
                corps: Vec::new(),
                suite: Some(Box::new(f)),
            },
            _ => introuvable(),
        }
    }

    // -- garde-fous ---------------------------------------------------------
    /// Vrai si `origine` est ce serveur-ci : « http://<Host> », rien d'autre.
    ///
    /// Etre sur le reseau prive ne suffit pas : une box, une imprimante ou
    /// un autre serveur de dev du LAN lisait les projets et ecrivait sur le
    /// disque. Toutes les pages sont servies par ce serveur :
    /// leur origine est « http://<Host> », rien d'autre n'en a besoin.
    ///
    /// Le Host, lui, a deja ete verifie (garde.filtrer) : c'est une adresse de
    /// ce poste ou localhost, jamais un nom qu'un DNS piege pourrait rebrancher.
    /// Exiger EN PLUS une plage privee (192.168/10/172.16) n'ajoutait rien et
    /// cassait le telephone serveur : partage de connexion, 4G, Tailscale
    /// (100.64-127.x) ou liaison directe (169.254.x) donnaient une page qui
    /// lisait le projet mais ne pouvait plus l'enregistrer (403 CSRF).
    fn origine_permise(r: &Requete, origine: &str) -> bool {
        let hote = r.entete("Host").unwrap_or("").trim().to_lowercase();
        let origine = origine.to_lowercase();
        !hote.is_empty() && (origine == format!("http://{}", hote) || origine == format!("https://{}", hote))
    }

    /// Rejette les requetes modificatrices provenant d'une origine non autorisee.
    ///
    /// En-tete maison X-WEB_CAO exige (REGLES §2.3) : une page d'un autre site ne
    /// peut pas l'ajouter sans pre-vol CORS, que ce serveur ne valide pas.
    fn csrf(r: &Requete) -> Option<Reponse> {
        // « X-Web-Cao » : le meme, sans souligne. Certains relais (nginx par defaut...)
        // retirent en silence un en-tete dont le nom porte un « _ » ; la page pose les deux.
        if r.entete("X-WEB_CAO") != Some("1") && r.entete("X-Web-Cao") != Some("1") {
            // le motif nomme l'outil et la cause : WEB_ANTENNA repond le meme 403, et
            // « Requete refusee » seul ne disait ni qui refusait ni pourquoi
            return Some(rendre_detail(
                403,
                "Requete refusee par WEB_CAO : en-tete X-WEB_CAO absent. Rechargez la page ; sinon, un relais le retire en route.",
            ));
        }
        match r.entete("Origin") {
            Some(origine) if !origine.is_empty() && !Self::origine_permise(r, origine) => {
                Some(rendre_detail(403, "Origine inter-site refusee (protection CSRF)"))
            }
            _ => None,
        }
    }

    // -- lecture des corps ----------------------------------------------------
    /// Content-Length de la requete ; refus s'il est illisible ou negatif.
    pub fn taille_corps(r: &Requete) -> Result<u64, Refus> {
        match r.entete("Content-Length").map(json::strip) {
            None | Some("") => Ok(0),
            Some(v) => v.parse::<u64>().map_err(|_| refus(400, "Content-Length invalide")),
        }
    }

    /// Les `taille` octets du corps, ou le refus `trop` s'il dépasse le plafond.
    ///
    /// UN REFUS QUI N'ARRIVE PAS N'EST PAS UN REFUS. On repondait 413
    /// sans lire le corps -- economie legitime : pourquoi ingerer cinq
    /// megaoctets pour les jeter ? --, mais les octets non lus restaient
    /// dans le tuyau, et le systeme coupait la connexion avant que le
    /// client ait pu lire la reponse. Cote page, cela donnait un
    /// « Failed to fetch » au lieu de « Document trop grand : 5,2 Mo,
    /// maximum 4 Mo », c'est-a-dire une panne au lieu d'une consigne.
    ///
    /// ON VIDE DONC, MAIS PAS SANS LIMITE : de quoi laisser passer un
    /// depassement ordinaire (le double du plafond), et l'on FERME au
    /// lieu de lire au-dela. Un client qui annonce un gigaoctet n'a pas
    /// droit a ce qu'on le lise pour lui dire non.
    pub fn octets(r: &mut Requete, taille: u64, plafond: usize, trop: impl FnOnce() -> String) -> Result<Vec<u8>, Refus> {
        let plafond = plafond as u64;
        if taille > plafond {
            let _ = std::io::copy(&mut Read::take(r.flux_corps(), taille.min(2 * plafond)), &mut std::io::sink());
            return Err(refus(413, trop()));
        }
        let mut corps = Vec::with_capacity(taille as usize);
        let _ = Read::take(r.flux_corps(), taille).read_to_end(&mut corps); // un envoi coupe rend ce qui est arrive
        Ok(corps)
    }

    /// Corps JSON de la requete ({} s'il est vide), ou un refus.
    pub fn corps_json(r: &mut Requete, plafond: usize, trop: &str) -> Result<Corps, Refus> {
        let taille = Self::taille_corps(r)?;
        let brut = Self::octets(r, taille, plafond, || trop.to_string())?;
        let illisible = || refus(400, "Corps JSON illisible");
        let texte = if brut.is_empty() { "{}".to_string() } else { String::from_utf8(brut).map_err(|_| illisible())? };
        let json = json::loads(&texte).map_err(|_| illisible())?;
        // NaN/Infinity : Python les accepte, mais un fichier qui en contient
        // n'est plus du JSON et la page ne le rouvrirait pas
        if let Some(nom) = json::non_fini(&json) {
            return Err(refus(400, format!("Corps JSON illisible ({} n'est pas du JSON)", nom)));
        }
        Ok(Corps { json, brise: json::substitut_seul(&texte) })
    }

    // -- enveloppes ----------------------------------------------------------
    /// Execute action() et traduit les refus (et l'imprevu, en 500) en JSON {"detail": ...}.
    pub(crate) fn json_api(&self, r: &mut Requete, action: impl FnOnce(&mut Requete) -> Rendu) -> Reponse {
        match proteger(|| action(r)) {
            Ok(charge) => rendre_json(200, charge),
            Err(exc) => {
                let mut detail = exc.message;
                if exc.code == 500 && detail != DETAIL_INTERNE && !self.client_local(r) {
                    // « Impossible d'ecrire /home/... : [Errno 13] » : le chemin reste dans le terminal
                    eprintln!("  ERREUR 500 {} : {}", route(r), detail);
                    detail = DETAIL_INTERNE.into();
                }
                rendre_detail(exc.code, &detail)
            }
        }
    }

    /// La passerelle composants : ses refus portent leur code.
    fn passerelle(&self, r: &mut Requete, action: impl FnOnce(&mut Requete) -> Result<serde_json::Value, outils::passerelle_mcp::ErreurPasserelle>) -> Reponse {
        self.json_api(r, |r| action(r).map(json::de_serde).map_err(|e| refus(e.code, e.message)))
    }

    // -- aiguillage ----------------------------------------------------------
    /// Les routes de lecture, les memes pour GET et HEAD (le serveur n'ecrit pas le corps d'un HEAD).
    fn lecture(&self, r: &mut Requete) -> Option<Reponse> {
        let route = route(r);
        Some(match route.as_str() {
            "/api/datasheet/ouvrir" => self.datasheet_api(r, |r| self.datasheet_ouvrir(r)),
            "/api/tools" => self.passerelle(r, |_| outils::passerelle_mcp::liste_outils()),
            "/api/profils" => self.json_api(r, |_| self.profils_index()),
            "/api/profil" => self.json_api(r, |r| self.profil_lire(r)),
            "/api/github" => self.json_api(r, |r| Ok(self.github_etat(r))),
            "/api/projets" => self.json_api(r, |_| self.projets_index()),
            "/api/projet" => self.json_api(r, |r| self.projet_lire(r)),
            "/api/projet/doc" => self.json_api(r, |r| self.projet_doc_lire(r)),
            "/api/ipc2581" => self.ipc_api(r, |_| Ok(crate::calculs::ipc2581_etat())),
            "/api/simulation" => self.ipc_api(r, |_| Ok(em::simulation_em::etat())),
            "/api/simulation-dc" => self.ipc_api(r, |_| Ok(dc_solver::etat())),
            "/api/crosstalk" => self.ipc_api(r, |_| Ok(em::crosstalk::etat())),
            "/api/simulation-rf" => self.ipc_api(r, |_| Ok(rf_reseau::etat())),
            "/api/oeil" => self.ipc_api(r, |_| Ok(oeil::etat())),
            "/api/pcb/score-placement" => self.ipc_api(r, |_| Ok(obj! {"dispo" => true, "nom" => "Scoring de placement PCB"})),
            "/api/schema/patterns" => self.ipc_api(r, |_| Ok(obj! {"dispo" => true, "nom" => "Reconnaissance de motifs de schéma"})),
            "/api/analyse-carte" => self.ipc_api(r, |_| Ok(crate::calculs::analyse_etat())),
            "/api/lib/composants" => self.json_api(r, |_| self.lib_composants_lire()),
            "/api/lib/fichiers" => self.json_api(r, |_| Ok(self.lib_fichiers_liste())),
            "/api/lib/parasites" => self.json_api(r, |_| Ok(self.lib_parasites())),
            "/api/lib/fichier" => self.json_api(r, |r| self.lib_fichier_lire(r)),
            "/api/lib/config" => self.json_api(r, |r| Ok(self.lib_config_lire(r))),
            _ => return None,
        })
    }

    fn get(&self, r: &mut Requete) -> Reponse {
        if let Some(rendu) = self.pilote.traiter(r) {
            return rendu;
        }
        self.lecture(r).unwrap_or_else(|| self.statique(r))
    }

    fn head(&self, r: &mut Requete) -> Reponse {
        self.lecture(r).unwrap_or_else(|| self.statique(r))
    }

    fn put(&self, r: &mut Requete) -> Reponse {
        if let Some(refus) = Self::csrf(r) {
            return refus;
        }
        match route(r).as_str() {
            "/api/profil" => self.json_api(r, |r| self.profil_ecrire(r)),
            "/api/projet" => self.json_api(r, |r| self.projet_ecrire(r)),
            "/api/projet/doc" => self.json_api(r, |r| self.projet_doc_ecrire(r)),
            "/api/lib/composants" => self.json_api(r, |r| self.lib_composants_ecrire(r)),
            "/api/lib/fichier" => self.json_api(r, |r| self.lib_fichier_ecrire(r)),
            "/api/lib/config" => self.json_api(r, |r| self.lib_config_ecrire(r)),
            _ => erreur(405, "Unsupported method (PUT)"),
        }
    }

    fn delete(&self, r: &mut Requete) -> Reponse {
        if let Some(refus) = Self::csrf(r) {
            return refus;
        }
        match route(r).as_str() {
            "/api/profil" => self.json_api(r, |r| self.profil_effacer(r)),
            "/api/projet/doc" => self.json_api(r, |r| self.projet_doc_effacer(r)),
            "/api/lib/fichier" => self.json_api(r, |r| self.lib_fichier_effacer(r)),
            _ => erreur(405, "Unsupported method (DELETE)"),
        }
    }

    fn post(&self, r: &mut Requete) -> Reponse {
        if let Some(refus) = Self::csrf(r) {
            return refus;
        }
        if let Some(rendu) = self.pilote.traiter(r) {
            return rendu;
        }
        let route = route(r);
        match route.as_str() {
            "/api/github/envoyer" => self.json_api(r, |r| self.github_envoyer(r)),
            "/api/github/identite" => self.json_api(r, |r| self.github_identite(r)),
            "/api/lib/composants" => self.json_api(r, |r| self.lib_composants_ecrire(r)),
            "/api/lib/fichier" => self.json_api(r, |r| self.lib_fichier_ecrire(r)),
            "/api/lib/config" => self.json_api(r, |r| self.lib_config_ecrire(r)),
            "/api/datasheet/telecharger" => self.datasheet_api(r, |r| self.datasheet_telecharger(r)),
            "/api/tool" => self.passerelle(r, |r| {
                use outils::passerelle_mcp::{appeler_outil, ErreurPasserelle};
                use serde_json::Value;
                let taille = Self::taille_corps(r).map_err(|e| ErreurPasserelle::new(e.code, e.message))?;
                let brut = Self::octets(r, taille, MAX_CORPS, || "Requete trop grande".into()).map_err(|e| ErreurPasserelle::new(e.code, e.message))?;
                let charge: Value =
                    if brut.is_empty() { Value::Object(Default::default()) } else { serde_json::from_slice(&brut).map_err(|_| {
                        // NaN/Infinity, que serde refuse : le message de _corps_json les nomme
                        let nom = std::str::from_utf8(&brut).ok().and_then(|t| json::loads(t).ok()).and_then(|j| json::non_fini(&j));
                        ErreurPasserelle::new(400, nom.map_or("Corps JSON illisible".to_string(), |n| format!("Corps JSON illisible ({} n'est pas du JSON)", n)))
                    })? };
                let vrai = |v: &Value| !matches!(v, Value::Null | Value::Bool(false)) && v.as_str() != Some("") && v.as_f64() != Some(0.0) && v.as_array().is_none_or(|l| !l.is_empty()) && v.as_object().is_none_or(|o| !o.is_empty());
                if !charge.is_object() || !vrai(&charge["name"]) {
                    return Err(ErreurPasserelle::new(400, "Outil non precise"));
                }
                let arguments = if vrai(&charge["arguments"]) { charge["arguments"].clone() } else { Value::Object(Default::default()) };
                appeler_outil(&charge["name"], &arguments)
            }),
            _ => match crate::calculs::calcul(&route) {
                Some(calcul) => {
                    let _place = self.calculs.prendre();
                    self.ipc_api(r, |r| calcul(self, r))
                }
                None => introuvable(),
            },
        }
    }
}

#[cfg(test)]
mod essais {
    use super::*;

    /// Cas 39 de banc-serveur-routes.py : ce que les pages chargent sort, le reste est 404 --
    /// casse changee comprise (macOS, Windows).
    #[test]
    fn liste_blanche() {
        for nom in [
            "/API_KEY_free_ia_studio.txt", "/Profils/x.json", "/LIB_COMPOSANTS.CSV", "/graphify-out/GRAPH_REPORT.md", "/exports/a.json", "/tasks/todo.md",
            "/bancs-mesure/crosstalk/banc-crosstalk-mesure.py", "/README.md", "/SPEC.md", "/python/oeil.py", "/commun/test/dom-stub.js",
            "/editeur-pcb/test/harness.js", "/editeur-pcb/outils/build-monofichier.py", "/screen/pcb.png", "/simulations-si-pi.json",
            "/docs/manuel/index.md", "/docs/regles/01-conception.md", "/commun/%2e%2e/web_CAO.py", "/commun/.env", "/commun/menus.js::$DATA",
            "/LIB/x.py", "/LIB/.git/config", "/LIB/LIB_composants.csv", "/rust/serveur/src/main.rs", "/Cargo.toml", "/bin/web_cao",
        ] {
            assert!(!statique_permis(&decoder_chemin(nom)), "{}", nom);
        }
        for nom in [
            "/", "/index.html", "/editeur-pcb/", "/editeur-pcb/editeur-pcb.html", "/commun/menus.js", "/commun/pilote-aide.json",
            "/commun/vendor/three-source.js", "/editeur-pcb/js/fontes/plans-sans.js", "/gestion-lib/css/gestion-lib.css",
            "/docs/manuel/manuel.html", "/docs/regles/regles.html", "/profils/fabricants/jlcpcb.json", "/LIB/lib_empreinte_pcb/0603.json",
            "/LIB/Models/R%C3%A9ed%20SMD.step",
        ] {
            assert!(statique_permis(&decoder_chemin(nom)), "{}", nom);
        }
        assert_eq!(decoder_chemin("/a+b%20c/%2e%2e/%C3%A9%zz"), "/a+b c/../é%zz");
        assert_eq!((type_mime("x.JS"), type_mime("a/b.step"), type_mime("x.sub")), ("text/javascript", "model/step", "application/octet-stream"));
    }

    #[test]
    fn le_lanceur_est_sur_ce_poste() {
        assert_eq!(adresse_lanceur("http://127.0.0.1:8100"), Some(8100));
        assert_eq!(adresse_lanceur("HTTP://LocalHost:8100/chemin?x=1"), Some(8100));
        for refuse in ["", "http://127.0.0.1", "https://127.0.0.1:8100", "http://192.168.1.50:8100", "http://127.0.0.1:0", "http://127.0.0.1:x", "127.0.0.1:8100", "http://evil.example@192.168.1.5:80"] {
            assert_eq!(adresse_lanceur(refuse), None, "{}", refuse);
        }
    }

    /// Une panne interne : 500 générique, sans le texte de l'exception (chemins du disque).
    #[test]
    fn panne_interne() {
        let exc = proteger(|| -> Rendu { panic!("/chemin/secret/introuvable.json") }).unwrap_err();
        assert_eq!((exc.code, exc.message.as_str()), (500, DETAIL_INTERNE));
        let rendu = rendre_json(200, obj! {"a" => f64::NAN, "é" => "ü"});
        assert_eq!(String::from_utf8(rendu.corps).unwrap(), r#"{"a": null, "\u00e9": "\u00fc"}"#);
    }

    #[test]
    fn deux_calculs_a_la_fois() {
        let places = Places::new(2);
        let (a, b) = (places.prendre(), places.prendre());
        assert_eq!(*verrou(&places.libres), 0);
        drop(a);
        let _c = places.prendre();
        drop(b);
        assert_eq!(*verrou(&places.libres), 1);
    }
}
