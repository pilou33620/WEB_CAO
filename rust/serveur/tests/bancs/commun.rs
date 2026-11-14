//! Le socle des bancs du serveur : un serveur lancé dans le processus sur un port libre de
//! 127.0.0.1, un client HTTP d'une requête, et la LIB des bancs (python/test/lib_essai.py).
#![allow(dead_code)]
use std::io::{self, Read, Write};
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use web_cao::chemins::abspath;
#[allow(unused_imports)]
pub use web_cao::json::{dumps, loads, Json};
use web_cao::poste::Poste;
use web_tools_commun::serveur::{Requete, Serveur};

pub struct Rep {
    pub code: u16,
    pub entetes: Vec<(String, String)>,
    pub corps: Vec<u8>,
}

impl Rep {
    pub fn entete(&self, nom: &str) -> Option<&str> {
        self.entetes.iter().find(|(k, _)| k.eq_ignore_ascii_case(nom)).map(|(_, v)| v.as_str())
    }
    pub fn texte(&self) -> String {
        String::from_utf8_lossy(&self.corps).into_owned()
    }
    pub fn json(&self) -> Json {
        loads(&self.texte()).unwrap_or_else(|e| panic!("JSON attendu ({e}) : {}", self.texte()))
    }
    /// Le « detail » d'un refus.
    pub fn detail(&self) -> String {
        self.json()["detail"].as_str().unwrap_or("").to_string()
    }
}

/// Écrit la requête et lit la réponse. Host et Content-Length sont ajoutés s'ils ne sont
/// pas dans `entetes` (Content-Length : seulement avec un corps, ou hors GET et HEAD).
pub fn echanger(flux: &mut TcpStream, port: u16, methode: &str, chemin: &str, entetes: &[(&str, &str)], corps: &[u8]) -> io::Result<Rep> {
    let a = |nom: &str| entetes.iter().any(|(k, _)| k.eq_ignore_ascii_case(nom));
    let mut d = format!("{methode} {chemin} HTTP/1.1\r\n");
    if !a("Host") {
        d += &format!("Host: 127.0.0.1:{port}\r\n");
    }
    for (k, v) in entetes {
        d += &format!("{k}: {v}\r\n");
    }
    if !a("Content-Length") && (!corps.is_empty() || !matches!(methode, "GET" | "HEAD")) {
        d += &format!("Content-Length: {}\r\n", corps.len());
    }
    // l'envoi peut être coupé par un serveur qui a déjà refusé (corps annoncé géant) : on lit quand même
    let _ = flux.write_all(d.as_bytes()).and_then(|_| flux.write_all(b"\r\n")).and_then(|_| flux.write_all(corps));
    let _ = flux.flush();

    let (mut brut, mut bloc) = (Vec::new(), [0u8; 65536]);
    let coupe = loop {
        if let Some(i) = brut.windows(4).position(|w| w == b"\r\n\r\n") {
            break i;
        }
        match flux.read(&mut bloc)? {
            0 => return Err(io::Error::new(io::ErrorKind::UnexpectedEof, "réponse HTTP sans en-têtes")),
            n => brut.extend_from_slice(&bloc[..n]),
        }
    };
    let tete = String::from_utf8_lossy(&brut[..coupe]).into_owned();
    let mut lignes = tete.split("\r\n");
    let code = lignes.next().and_then(|l| l.split(' ').nth(1)).and_then(|c| c.parse().ok()).ok_or_else(|| io::Error::new(io::ErrorKind::InvalidData, "ligne d'état HTTP illisible"))?;
    let entetes: Vec<(String, String)> = lignes.filter_map(|l| l.split_once(':')).map(|(k, v)| (k.to_string(), v.trim().to_string())).collect();
    let mut rep = Rep { code, entetes, corps: brut[coupe + 4..].to_vec() };
    let attendu = if methode == "HEAD" || code == 204 || code == 304 { Some(0) } else { rep.entete("Content-Length").and_then(|n| n.parse::<usize>().ok()) };
    while attendu.is_none_or(|n| rep.corps.len() < n) {
        match flux.read(&mut bloc) {
            Ok(0) | Err(_) => break,
            Ok(n) => rep.corps.extend_from_slice(&bloc[..n]),
        }
    }
    if let Some(n) = attendu {
        rep.corps.truncate(n);
    }
    Ok(rep)
}

pub fn connecter(port: u16) -> TcpStream {
    let c = TcpStream::connect(("127.0.0.1", port)).unwrap();
    c.set_read_timeout(Some(Duration::from_secs(120))).unwrap();
    c
}

/// La requête telle quelle, sans l'en-tête maison.
pub fn brute(port: u16, methode: &str, chemin: &str, entetes: &[(&str, &str)], corps: &[u8]) -> Rep {
    echanger(&mut connecter(port), port, methode, chemin, entetes, corps).unwrap_or_else(|e| panic!("{methode} {chemin} : {e}"))
}

/// Toute ecriture du banc porte l'en-tete maison que le serveur exige (REGLES §2.3), comme les pages.
pub fn requete(port: u16, methode: &str, chemin: &str, entetes: &[(&str, &str)], corps: &[u8]) -> Rep {
    let mut tous: Vec<(&str, &str)> = entetes.to_vec();
    if !matches!(methode, "GET" | "HEAD") {
        tous.insert(0, ("X-WEB_CAO", "1"));
        tous.insert(1, ("Content-Type", "application/json"));
    }
    brute(port, methode, chemin, &tous, corps)
}

pub fn get(port: u16, chemin: &str) -> Rep {
    requete(port, "GET", chemin, &[], b"")
}

pub fn post(port: u16, chemin: &str, corps: &str) -> Rep {
    requete(port, "POST", chemin, &[], corps.as_bytes())
}

/// urllib.parse.quote d'un chemin du disque dans une adresse.
pub fn quote(s: &str) -> String {
    s.bytes().map(|c| if c.is_ascii_alphanumeric() || b"_.-~/".contains(&c) { (c as char).to_string() } else { format!("%{:02X}", c) }).collect()
}

/// La racine du dépôt : index.html, les pages, commun/.
pub fn racine() -> String {
    abspath(concat!(env!("CARGO_MANIFEST_DIR"), "/../.."))
}

/// Un serveur lancé dans le processus ; arrêté quand la valeur tombe.
pub struct Lance {
    pub port: u16,
    pub poste: Arc<Poste>,
    serveur: Arc<Serveur>,
}

impl Drop for Lance {
    fn drop(&mut self) {
        self.serveur.arreter();
    }
}

/// Sert `poste` sur un port libre de 127.0.0.1.
pub fn lancer(poste: Poste) -> Lance {
    let serveur = Serveur::ouvrir(0, false, 1).unwrap();
    let poste = Arc::new(poste);
    let p = poste.clone();
    serveur.servir_en_fond(Arc::new(move |r: &mut Requete| p.servir(r)));
    Lance { port: serveur.port(), poste, serveur }
}

/// Un dossier d'essai neuf, sous le dossier temporaire du système.
pub fn dossier_neuf(nom: &str) -> String {
    let d = std::env::temp_dir().join(format!("{nom}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&d);
    std::fs::create_dir_all(&d).unwrap();
    d.canonicalize().unwrap().to_string_lossy().into_owned()
}

pub fn ecrire(chemin: impl AsRef<Path>, contenu: impl AsRef<[u8]>) {
    if let Some(parent) = chemin.as_ref().parent() {
        std::fs::create_dir_all(parent).unwrap();
    }
    std::fs::write(chemin, contenu).unwrap();
}

// -- la LIB des bancs (python/test/lib_essai.py) -------------------------------
// WEB_CAO ne versionne plus de LIB : elle vit dans le depot WEB_SUITE_PROJETS
// (WEB_SUITE/PROJETS/LIB_CAO), et c'est celle-la que l'outil prend par defaut. Les bancs
// lisent la meme, ou celle que designe la variable WEB_CAO_LIB ; ils travaillent tous sur
// une copie jetable, jamais sur la vraie bibliotheque. Sans elle (integration continue sans
// le depot prive), une LIB factice minimale : les cas qui eprouvent le CONTENU de la vraie
// sont alors sautes, avec un avertissement.

/// Le dossier de la vraie LIB, si ce poste l'a.
pub fn lib_source() -> Option<PathBuf> {
    let chemin = std::env::var("WEB_CAO_LIB").ok().filter(|c| !c.is_empty()).unwrap_or_else(|| Poste::new(&racine(), true).dossier_lib_defaut());
    Some(PathBuf::from(chemin)).filter(|c| c.join("LIB_composants.csv").is_file())
}

/// Une LIB factice : de quoi demarrer le serveur et eprouver ses routes et ses securites
/// sans la vraie bibliotheque.
fn lib_minimale(cible: &Path) {
    let colonnes = "Part Name;Part Type;Description;Value;Empreinte PCB;Empreinte Schématique;Modèle Simulation";
    let mut csv = format!("{colonnes}\r\n");
    for i in 1..=6 {
        csv += &format!("R{i};resistor;resistance {i};{i}k;0603;resistor;resistor\r\n");
    }
    ecrire(cible.join("LIB_composants.csv"), csv);
    ecrire(cible.join("lib_empreinte_pcb/0603.json"), r#"{"format": "pcbfp-1", "name": "0603", "pins": 2, "pads": []}"#);
    ecrire(cible.join("lib_empreinte_schematique/resistor.json"), r#"{"id": "resistor", "prefix": "R"}"#);
    ecrire(cible.join("lib_simulation/resistor.sub"), ".SUBCKT RESISTOR 1 2\nR1 1 2 {R}\n.ENDS\n");
}

fn copier(source: &Path, cible: &Path) {
    std::fs::create_dir_all(cible).unwrap();
    for e in std::fs::read_dir(source).unwrap().flatten() {
        let nom = e.file_name().to_string_lossy().into_owned();
        // Les milliers de modeles Murata de lib_simulation ne sont pas recopies :
        // aucun banc qui ecrit n'en a besoin.
        if nom.starts_with("CAPA G") || nom.starts_with("INDUC ") || nom.ends_with(".zip") || nom == ".git" {
            continue;
        }
        if e.path().is_dir() {
            copier(&e.path(), &cible.join(&nom));
        } else {
            std::fs::copy(e.path(), cible.join(&nom)).unwrap();
        }
    }
}

/// Une copie jetable de la LIB dans `dossier`/LIB ; le booléen dit si c'est la vraie.
pub fn lib_copie(dossier: &str) -> (String, bool) {
    let cible = Path::new(dossier).join("LIB");
    let reelle = match lib_source() {
        Some(source) => {
            copier(&source, &cible);
            true
        }
        None => {
            println!("[!] LIB introuvable (clonez WEB_SUITE_PROJETS en ../PROJETS, ou indiquez-la par WEB_CAO_LIB) : LIB factice, les cas qui eprouvent son contenu sont sautes.");
            lib_minimale(&cible);
            false
        }
    };
    (cible.to_string_lossy().into_owned(), reelle)
}

/// Un poste d'essai en écoute locale : la racine du dépôt, une LIB jetable par défaut et une
/// racine de projets à lui, dans `dossier`.
pub fn poste_essai(dossier: &str) -> Poste {
    let mut poste = Poste::new(&racine(), true);
    poste.lib_defaut = Some(lib_copie(dossier).0);
    poste.racines_projets = vec![format!("{dossier}/projets")];
    poste
}
