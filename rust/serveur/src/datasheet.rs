//! Datasheets des composants : le serveur télécharge le PDF (jamais vers le réseau local)
//! et le range dans le dossier du projet.

use std::io::Read;
use std::net::{IpAddr, SocketAddr, ToSocketAddrs};
use std::sync::LazyLock;
use std::time::Duration;

use regex::Regex;
use web_tools_commun::appairage::{deballer, globale};
use web_tools_commun::serveur::{Reponse, Requete};

use crate::chemins::*;
use crate::ecriture::ecrire_exclusif;
use crate::json::strip;
use crate::obj;
use crate::poste::{erreur, param, proteger, refus, rendre_detail, rendre_json, Poste, Refus, MAX_CORPS};
use crate::projets::{nom_projet, texte_ou_vide, NOM_INTERDIT};

const MAX_DATASHEET: usize = 50 * 1024 * 1024; // 50 Mo max
const REDIRECTIONS: usize = 10;

/// socket.getaddrinfo : les adresses d'un « hôte:port ».
type Resolution<'a> = &'a dyn Fn(&str) -> std::io::Result<Vec<SocketAddr>>;

fn dns(hote_port: &str) -> std::io::Result<Vec<SocketAddr>> {
    Ok(hote_port.to_socket_addrs()?.collect())
}

/// Refus si l'adresse est locale, privee ou reservee (anti-SSRF).
pub fn verifier_ip_publique(ip: IpAddr) -> Result<(), String> {
    // « ::ffff:127.0.0.1 » est 127.0.0.1 : on juge l'adresse IPv4 qu'elle porte
    let jugee = deballer(ip);
    // globale : 100.64.0.0/10 (CGNAT, Tailscale) n'est ni « privee » ni « reservee », et passait
    if !globale(jugee) || jugee.is_loopback() || jugee.is_multicast() || jugee.is_unspecified() {
        return Err(format!("Acces refuse a l'adresse privee ou locale ({})", ip));
    }
    Ok(())
}

/// (schéma, hôte, port explicite) d'une URL http(s).
fn decouper(url: &str) -> Result<(String, String, Option<u16>), String> {
    let (schema, reste) = url.split_once("://").ok_or("Protocole non autorise (http ou https uniquement)")?;
    let schema = schema.to_lowercase();
    if schema != "http" && schema != "https" {
        return Err("Protocole non autorise (http ou https uniquement)".into());
    }
    let autorite = reste.split(['/', '?', '#']).next().unwrap_or("");
    let autorite = autorite.rsplit('@').next().unwrap_or("");
    let (hote, port) = match autorite.strip_prefix('[').and_then(|a| a.split_once(']')) {
        Some((v6, suite)) => (v6, suite.strip_prefix(':')),
        None => autorite.split_once(':').map_or((autorite, None), |(h, p)| (h, Some(p))),
    };
    if hote.is_empty() {
        return Err("Nom d'hote manquant dans l'URL".into());
    }
    let port = match port.filter(|p| !p.is_empty()) {
        Some(p) => Some(p.parse::<u16>().map_err(|_| format!("Port illisible : {}", p))?),
        None => None,
    };
    Ok((schema, hote.to_lowercase(), port))
}

fn hote_port(hote: &str, port: u16) -> String {
    if hote.contains(':') { format!("[{}]:{}", hote, port) } else { format!("{}:{}", hote, port) }
}

/// Valide qu'une URL est http/https et ne pointe pas vers le reseau local ou prive (anti-SSRF).
pub fn valider_url(url: &str, resoudre: Resolution) -> Result<String, String> {
    let url = strip(url);
    if url.is_empty() {
        return Err("URL manquante ou invalide".into());
    }
    let (schema, hote, port) = decouper(url)?;
    // Verification du port si specifie
    if let Some(p) = port.filter(|p| *p != 0 && ![80, 443, 8080, 8443].contains(p)) {
        return Err(format!("Port {} non autorise", p));
    }
    // Resolution DNS et verification des adresses IP
    let adresses = resoudre(&hote_port(&hote, port.unwrap_or(if schema == "https" { 443 } else { 80 }))).map_err(|_| format!("Nom d'hote introuvable : {}", hote))?;
    if adresses.is_empty() {
        return Err(format!("Impossible de resoudre l'hote : {}", hote));
    }
    for a in &adresses {
        verifier_ip_publique(a.ip())?;
    }
    Ok(url.to_string())
}

/// Resout `hote_port`, verifie CHAQUE adresse, et rend celles auxquelles se connecter.
///
/// C'est la parade au « DNS rebinding » : valider une URL puis laisser
/// le client la resoudre a nouveau laissait un serveur DNS malveillant repondre
/// une adresse publique au controle et 127.0.0.1 a la connexion. Ici,
/// l'adresse verifiee EST celle a laquelle on se connecte.
pub fn adresses_verifiees(hote_port: &str, resoudre: Resolution) -> std::io::Result<Vec<SocketAddr>> {
    let autre = |texte: String| std::io::Error::other(texte);
    let adresses = resoudre(hote_port).map_err(|_| autre(format!("Nom d'hote introuvable : {}", hote_port)))?;
    if adresses.is_empty() {
        return Err(autre(format!("Impossible de resoudre l'hote : {}", hote_port)));
    }
    for a in &adresses {
        verifier_ip_publique(a.ip()).map_err(autre)?;
    }
    Ok(adresses)
}

/// Le proxy du poste s'applique-t-il à cette URL ? (HTTPS_PROXY, HTTP_PROXY, NO_PROXY)
// shortcut: l'environnement seulement ; urllib lisait aussi les réglages de Windows et de macOS.
fn par_proxy(schema: &str, hote: &str) -> bool {
    let env = |nom: &str| std::env::var(nom).or_else(|_| std::env::var(nom.to_uppercase())).unwrap_or_default();
    if env(&format!("{}_proxy", schema)).is_empty() {
        return false;
    }
    !env("no_proxy").split(',').map(|n| n.trim().trim_start_matches(['*', '.']).to_lowercase()).any(|n| !n.is_empty() && (n == "*" || hote == n || hote.ends_with(&format!(".{}", n))))
}

/// Le client d'un telechargement de datasheet.
///
/// Sans proxy : connexions verifiees a l'IP pres (adresses_verifiees). Derriere un proxy
/// d'entreprise, c'est lui qui resout les noms et l'on ne peut rien epingler : on garde le
/// controle prealable de l'URL et de chaque redirection.
fn client(url: &str) -> Result<ureq::Agent, String> {
    let (schema, hote, _) = decouper(url)?;
    // les redirections sont suivies ici, une par une : chacune est validée
    let fabrique = ureq::AgentBuilder::new().redirects(0).timeout(Duration::from_secs(25));
    Ok(if par_proxy(&schema, &hote) { fabrique.try_proxy_from_env(true) } else { fabrique.resolver(|hp: &str| adresses_verifiees(hp, &dns)) }.build())
}

/// L'adresse d'une redirection, depuis celle qui la rend.
// shortcut: absolue, « //hôte/... », « /chemin » ou relative au dossier ; pas de « ../ » résolu.
fn suivre(depuis: &str, vers: &str) -> String {
    let (schema, reste) = depuis.split_once("://").unwrap_or(("http", depuis));
    let autorite = reste.split(['/', '?', '#']).next().unwrap_or("");
    if vers.contains("://") {
        vers.to_string()
    } else if vers.starts_with("//") {
        format!("{}:{}", schema, vers)
    } else if vers.starts_with('/') {
        format!("{}://{}{}", schema, autorite, vers)
    } else {
        let sans_requete = depuis.split(['?', '#']).next().unwrap_or(depuis);
        let dossier = if reste.contains('/') { sans_requete.rsplit_once('/').map_or(sans_requete, |(d, _)| d) } else { sans_requete };
        format!("{}/{}", dossier, vers)
    }
}

/// Le contenu d'une adresse (au plus `MAX_DATASHEET` + 1 octets), redirections suivies et validées.
fn telecharger(url: &str) -> Result<Vec<u8>, String> {
    let mut url = url.to_string();
    for _ in 0..=REDIRECTIONS {
        let rep = client(&url)?
            .get(&url)
            .set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
            .set("Accept", "application/pdf,*/*")
            .call()
            .map_err(|e| e.to_string())?;
        if (300..400).contains(&rep.status()) {
            let vers = rep.header("Location").ok_or(format!("HTTP Error {}: redirection sans adresse", rep.status()))?;
            // Interdit les redirections vers des adresses locales ou privees.
            url = valider_url(&suivre(&url, vers), &dns)?;
            continue;
        }
        let mut contenu = Vec::new();
        rep.into_reader().take(MAX_DATASHEET as u64 + 1).read_to_end(&mut contenu).map_err(|e| e.to_string())?;
        return Ok(contenu);
    }
    Err("trop de redirections".into())
}

/// urllib.parse.quote : tout sauf les lettres, les chiffres et « _.-~/ ».
fn quote(s: &str) -> String {
    s.bytes().map(|c| if c.is_ascii_alphanumeric() || b"_.-~/".contains(&c) { (c as char).to_string() } else { format!("%{:02X}", c) }).collect()
}

impl Poste {
    /// Execute action() et gere les reponses de telechargement/consultation.
    pub(crate) fn datasheet_api(&self, r: &mut Requete, action: impl FnOnce(&mut Requete) -> Result<Reponse, Refus>) -> Reponse {
        proteger(|| action(r)).unwrap_or_else(|exc| rendre_detail(exc.code, &exc.message))
    }

    /// Dossier de destination : projet si specifie, sinon dossier datasheets commun.
    fn dossier_datasheets(&self, projet: &str) -> (String, String) {
        let parent = (!projet.is_empty())
            .then(|| self.chemin_projet(projet, None).ok().or_else(|| nom_projet(projet).map(|nom| joindre(&self.racine_projets(), &nom))))
            .flatten()
            .unwrap_or_else(|| joindre(&self.racine_projets(), "_communs"));
        let datasheets = joindre(&parent, "datasheets");
        (parent, datasheets)
    }

    pub(crate) fn datasheet_telecharger(&self, r: &mut Requete) -> Result<Reponse, Refus> {
        static HORS_NOM: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"[^a-zA-Z0-9_\-.]").unwrap());
        static LIEN_PDF: LazyLock<Regex> = LazyLock::new(|| Regex::new(r#"https?://[^\s"'<>]+\.pdf(?:\?[^\s"'<>]*)?"#).unwrap());
        self.projet_garde(false)?;
        let corps = Self::corps_json(r, MAX_CORPS, "Requete trop grande")?.json;
        if corps.as_objet().is_none() {
            return Err(refus(400, "Corps JSON attendu : un objet"));
        }
        let champ = |cle: &str| strip(&texte_ou_vide(&corps[cle])).to_string();
        let url = valider_url(&champ("url"), &dns).map_err(|exc| refus(400, format!("URL invalide ou interdite (anti-SSRF) : {}", exc)))?;
        let mpn = Some(champ("mpn")).filter(|m| !m.is_empty()).unwrap_or_else(|| "datasheet".into());
        let (dossier_parent, dossier_datasheets) = self.dossier_datasheets(&champ("projet"));
        std::fs::create_dir_all(&dossier_datasheets)
            .map_err(|exc| refus(500, format!("Impossible de creer le dossier datasheets : {}", errno(&exc, &dossier_datasheets))))?;

        let mut nom_base = Some(HORS_NOM.replace_all(&mpn, "_").trim_matches('_').to_string()).filter(|n| !n.is_empty()).unwrap_or_else(|| "datasheet".into());
        if !nom_base.to_lowercase().ends_with(".pdf") {
            nom_base += ".pdf";
        }

        let echec = |exc: String| refus(502, format!("Echec du telechargement distant : {}", exc));
        let mut contenu = telecharger(&url).map_err(echec)?;
        if contenu.len() > MAX_DATASHEET {
            return Err(refus(413, "Le fichier distant depasse la taille limite de 50 Mo"));
        }
        if contenu.starts_with(b"<!doctype") || contenu[..contenu.len().min(300)].to_ascii_lowercase().windows(5).any(|f| f == b"<html") {
            let html = String::from_utf8_lossy(&contenu).replace('\u{fffd}', "");
            let liens: Vec<&str> = LIEN_PDF.find_iter(&html).map(|m| m.as_str()).collect();
            let choisi = liens.iter().find(|l| l.to_lowercase().contains("datasheet") || l.to_lowercase().contains("pdf")).or(liens.first());
            if let Some(pdf) = choisi {
                let pdf = valider_url(pdf, &dns).map_err(|exc| refus(400, format!("Lien PDF distant refuse (anti-SSRF) : {}", exc)))?;
                contenu = telecharger(&pdf).map_err(echec)?;
                if contenu.len() > MAX_DATASHEET {
                    return Err(refus(413, "Le fichier PDF distant depasse la taille limite de 50 Mo"));
                }
            }
        }
        if contenu.is_empty() {
            return Err(refus(502, "Fichier telecharge vide"));
        }
        // Une page HTML sans lien PDF exploitable (ou une page d'erreur)
        // finissait enregistree sous « .pdf », illisible a l'ouverture. Un PDF
        // commence par « %PDF » ; on tolere quelques octets parasites avant.
        if !contenu[..contenu.len().min(1024)].windows(4).any(|f| f == b"%PDF") {
            return Err(refus(422, "Le document telecharge n'est pas un PDF (page web sans lien vers la fiche ?)."));
        }

        // jamais d'ecrasement (REGLES §3.2) : « nom (2).pdf » si le nom est pris
        let racine_nom = nom_base[..nom_base.len() - 4].to_string();
        let mut pose = false;
        for n in 1..100 {
            nom_base = format!("{}{}.pdf", racine_nom, if n > 1 { format!(" ({})", n) } else { String::new() });
            let cible = joindre(&dossier_datasheets, &nom_base);
            match ecrire_exclusif(&cible, &contenu) {
                Ok(()) => {
                    pose = true;
                    break;
                }
                Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
                Err(e) => return Err(refus(500, format!("Ecriture disque impossible : {}", errno(&e, &cible)))),
            }
        }
        if !pose {
            return Err(refus(409, "Trop de datasheets de ce nom : faites le menage dans datasheets/"));
        }

        // Le lien doit redesigner CE dossier : le seul nom du dernier dossier
        // (basename) renvoyait « clients/acme/carte » vers <racine>/carte, et un
        // projet d'une autre racine vers la premiere -- 404 a l'ouverture.
        // Relatif a la premiere racine quand il y est (le lien reste valable
        // sur un autre poste), complet sinon.
        let (premiere, vrai) = (realpath(&self.racine_projets()), realpath(&dossier_parent));
        let rel_nom = if vrai != premiere && dessous(&vrai, &premiere) { relpath(&vrai, &premiere).replace(std::path::MAIN_SEPARATOR, "/") } else { dossier_parent };
        Ok(rendre_json(
            200,
            obj! {
                "ok" => true, "fichier" => nom_base.as_str(), "chemin_rel" => format!("datasheets/{}", nom_base),
                "url_locale" => format!("/api/datasheet/ouvrir?projet={}&fichier={}", quote(&rel_nom), quote(&nom_base)),
                "taille" => contenu.len(),
            },
        ))
    }

    pub(crate) fn datasheet_ouvrir(&self, r: &Requete) -> Result<Reponse, Refus> {
        self.projet_garde(false)?;
        let fichier = param(r, "fichier");
        if fichier.is_empty() {
            return Ok(erreur(400, "Nom de fichier manquant"));
        }
        let nom_base = basename(&fichier);
        if !nom_base.to_lowercase().ends_with(".pdf") || nom_base.contains("..") || NOM_INTERDIT.is_match(nom_base) {
            return Ok(erreur(400, "Nom de fichier datasheet invalide"));
        }
        let (_, dossier_datasheets) = self.dossier_datasheets(&param(r, "projet"));
        let chemin = abspath(&joindre(&dossier_datasheets, nom_base));
        let (real_parent, real_chemin) = (realpath(&dossier_datasheets), realpath(&chemin));
        if real_chemin == real_parent || !dessous(&real_chemin, &real_parent) {
            return Ok(erreur(403, "Acces refuse hors du dossier datasheets"));
        }
        if !existe(&chemin) {
            return Ok(erreur(404, "Datasheet introuvable"));
        }
        let Ok(data) = std::fs::read(&chemin) else { return Ok(erreur(500, "Erreur de lecture de la datasheet")) };
        Ok(Reponse {
            code: 200,
            entetes: vec![
                ("Content-Type".into(), "application/pdf".into()),
                ("Content-Disposition".into(), format!("inline; filename=\"{}\"", nom_base)),
                ("Content-Length".into(), data.len().to_string()),
            ],
            corps: data,
            suite: None,
        })
    }
}

#[cfg(test)]
mod essais {
    use super::*;

    fn fixe(ip: &'static str) -> impl Fn(&str) -> std::io::Result<Vec<SocketAddr>> {
        move |hp| Ok(vec![SocketAddr::new(ip.parse().unwrap(), hp.rsplit(':').next().unwrap().parse().unwrap())])
    }

    /// Cas 8 et 28 de banc-serveur-routes.py : un DNS qui repond une IP publique au controle
    /// de l'URL puis 127.0.0.1 a la connexion. La connexion verifiee juge l'adresse A LAQUELLE
    /// elle se connecte, et refuse.
    #[test]
    fn dns_rebinding_et_ssrf() {
        let appels = std::cell::Cell::new(0);
        let changeant = |hp: &str| {
            appels.set(appels.get() + 1);
            fixe(if appels.get() == 1 { "93.184.216.34" } else { "127.0.0.1" })(hp)
        };
        let url = valider_url("http://rebind.example/fiche.pdf", &changeant).unwrap();
        let (_, hote, _) = decouper(&url).unwrap();
        let exc = adresses_verifiees(&hote_port(&hote, 80), &changeant).unwrap_err();
        assert!(exc.to_string().contains("privee ou locale"), "{}", exc);
        assert_eq!(appels.get(), 2);
        for ip in ["127.0.0.1", "::1", "::ffff:127.0.0.1", "10.1.2.3", "169.254.1.1", "192.168.1.1", "100.84.12.7", "0.0.0.0", "224.0.0.1", "fd7a:115c:a1e0::1"] {
            assert!(verifier_ip_publique(ip.parse().unwrap()).is_err(), "{} acceptee", ip);
        }
        verifier_ip_publique("93.184.216.34".parse().unwrap()).unwrap();
        // les adresses que la route refuse (400), DNS compris pour « localhost »
        for (url, ip) in [("http://127.0.0.1/secret.pdf", "127.0.0.1"), ("http://localhost/secret.pdf", "127.0.0.1"), ("http://10.0.0.1/secret.pdf", "10.0.0.1"),
                          ("http://192.168.1.1/secret.pdf", "192.168.1.1"), ("http://169.254.169.254/latest/meta-data", "169.254.169.254")] {
            assert!(valider_url(url, &fixe(ip)).is_err(), "{}", url);
        }
        let public = fixe("93.184.216.34");
        assert_eq!(valider_url("ftp://invalide", &public).unwrap_err(), "Protocole non autorise (http ou https uniquement)");
        assert_eq!(valider_url("https://exemple.fr:22/x.pdf", &public).unwrap_err(), "Port 22 non autorise");
        assert_eq!(valider_url("http:///x.pdf", &public).unwrap_err(), "Nom d'hote manquant dans l'URL");
        assert_eq!(valider_url(" https://u:p@Exemple.fr:8443/x.pdf ", &public).unwrap(), "https://u:p@Exemple.fr:8443/x.pdf");
        assert!(valider_url("", &public).is_err() && valider_url("http://[::1]:80/x", &fixe("::1")).is_err());
    }

    #[test]
    fn redirections_et_liens() {
        assert_eq!(suivre("https://a.fr/d/x.pdf?v=1", "https://b.fr/y.pdf"), "https://b.fr/y.pdf");
        assert_eq!(suivre("https://a.fr/d/x.pdf?v=1", "//b.fr/y.pdf"), "https://b.fr/y.pdf");
        assert_eq!(suivre("https://a.fr/d/x.pdf?v=1", "/y.pdf"), "https://a.fr/y.pdf");
        assert_eq!(suivre("https://a.fr/d/x.pdf?v=1", "y.pdf"), "https://a.fr/d/y.pdf");
        assert_eq!(suivre("https://a.fr", "y.pdf"), "https://a.fr/y.pdf");
        assert_eq!(quote("clients/acme/carte PIR é.pdf"), "clients/acme/carte%20PIR%20%C3%A9.pdf");
    }
}
