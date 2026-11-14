//! --projets-reseau : en ecoute reseau, les projets (sous les racines declarees)
//! et l'ecriture dans la LIB active s'ouvrent ; le reste reste local.
//! Autonome : une racine de projets et une LIB jetables, rien du depot.
//! C'est python/test/banc-projets-reseau.py, cas pour cas ; s'y ajoutent les cas qui
//! demandent l'exécutable lancé : la console du démarrage et le journal des calculs (cas 4c de
//! banc-serveur-routes.py).

use std::io::{BufRead, BufReader, Read, Write};
use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant};

use crate::commun::*;
use web_cao::poste::Poste;

/// Une racine CAO avec un projet, une LIB vide : (dossier, poste en écoute réseau).
fn poste_reseau(nom: &str, projets_reseau: bool) -> (String, Poste) {
    let d = dossier_neuf(nom);
    std::fs::create_dir_all(format!("{d}/LIB_CAO/lib_empreinte_pcb")).unwrap();
    ecrire(format!("{d}/CAO/carte PIR/projet.cao.json"), r#"{"format": "cao-projet-1", "nom": "carte PIR"}"#);
    let mut poste = Poste::new(&racine(), false);
    poste.garde = web_tools_commun::appairage::Garde::new("WEB_CAO", false, None, None); // le banc n'éprouve pas l'appairage
    poste.racines_projets = vec![format!("{d}/CAO")];
    poste.definir_dossier_lib(&format!("{d}/LIB_CAO"), false, false).unwrap();
    poste.lib_impose = true;
    poste.projets_reseau = projets_reseau;
    (d, poste)
}

#[test]
fn sans_option_tout_reste_ferme() {
    let (_, poste) = poste_reseau("webcao-reseau-ferme", false);
    let s = lancer(poste);
    assert_eq!(get(s.port, "/api/projets").code, 403);
    assert_eq!(requete(s.port, "PUT", "/api/lib/fichier", &[], br#"{"type": "pcb", "nom": "x.json", "data": {}}"#).code, 403);
}

#[test]
fn option_ouvre_projets_et_lib_seulement() {
    let (d, poste) = poste_reseau("webcao-reseau-ouvert", true);
    let s = lancer(poste);
    assert_eq!(get(s.port, "/api/projets").code, 200);
    assert_eq!(get(s.port, "/api/projet?chemin=carte%20PIR").code, 200);
    assert_eq!(requete(s.port, "PUT", "/api/lib/fichier", &[], br#"{"type": "pcb", "nom": "x.json", "data": {"name": "x"}}"#).code, 200);
    assert!(std::path::Path::new(&format!("{d}/LIB_CAO/lib_empreinte_pcb/x.json")).is_file());
    // un chemin complet hors des racines : toujours refuse au reseau
    let dehors = format!("{d}/ailleurs");
    std::fs::create_dir_all(&dehors).unwrap();
    assert_eq!(get(s.port, &format!("/api/projet?chemin={}", quote(&dehors))).code, 403);
    // deplacer la LIB, la cle IA, les datasheets : toujours local
    assert_eq!(post(s.port, "/api/lib/config", &format!(r#"{{"chemin": "{dehors}"}}"#)).code, 403);
    assert_eq!(get(s.port, "/api/datasheet/ouvrir?fichier=a.pdf").code, 403);
    // la LIB hors du dépôt se sert en statique ; sans l'option, non
    assert_eq!(get(s.port, "/LIB/lib_empreinte_pcb/x.json").code, 200);
}

// -- l'exécutable lancé ---------------------------------------------------------

struct Processus {
    proc: Child,
    port: u16,
    annonce: String,
    journal: String,
}

impl Drop for Processus {
    fn drop(&mut self) {
        let _ = self.proc.kill();
        let _ = self.proc.wait();
    }
}

/// Lance web_cao sur un port libre et rend la main quand il sert ; son dossier personnel
/// est `maison` (le jeton d'appairage du poste ne bouge pas), sa sortie d'erreur va dans
/// `maison`/journal.txt.
fn demarrer(maison: &str, args: &[&str], env: &[(&str, &str)]) -> Processus {
    let journal = format!("{maison}/journal.txt");
    let mut proc = Command::new(env!("CARGO_BIN_EXE_web_cao"))
        .args(["--sans-navigateur", "--sans-maj", "--sans-pause", "--port", "0", "--lib"])
        .arg(format!("{maison}/LIB_CAO"))
        .args(args)
        .env_remove("WEBSUITE_LANCEUR").env_remove("WEBSUITE_JETON").env_remove("WEB_TOOLS_BANC_DISTANT")
        .env("HOME", maison).env("USERPROFILE", maison).env("WEB_CAO_RACINE", racine()).envs(env.iter().copied())
        .stdout(Stdio::piped())
        .stderr(std::fs::File::create(&journal).unwrap())
        .spawn()
        .unwrap();
    let mut stdout = BufReader::new(proc.stdout.take().unwrap());
    let mut annonce = String::new();
    while !annonce.contains("(Ctrl+C pour arreter)") {
        assert!(stdout.read_line(&mut annonce).unwrap() > 0, "web_cao s'est arrêté au démarrage :\n{annonce}");
    }
    // la suite de la sortie est vidée en fond : le serveur ne doit pas rester bloqué sur un tuyau plein
    std::thread::spawn(move || std::io::copy(&mut stdout, &mut std::io::sink()));
    let port = annonce.split_once("adresse       : http").and_then(|(_, s)| s.split('/').nth(2)).and_then(|h| h.rsplit(':').next()?.parse().ok())
        .unwrap_or_else(|| panic!("adresse attendue dans :\n{annonce}"));
    Processus { proc, port, annonce, journal }
}

/// Le message de demarrage en reseau suit --projets-reseau.
#[test]
fn console_dit_la_verite() {
    let (d, _) = poste_reseau("webcao-reseau-console", false);
    let s = demarrer(&d, &[], &[("WEB_TOOLS_BANC_DISTANT", "1")]);
    assert!(s.annonce.contains("refuses dans ce mode"), "{}", s.annonce);
    // un autre appareil arrive en clair : il recoit une reponse (renvoi vers https://, page du
    // code ou refus), jamais une route ; le cas 52 lui-meme est dans banc_appairage.rs
    assert!([303, 307, 403].contains(&brute(s.port, "GET", "/api/lib/fichiers", &[], b"").code));
    drop(s);

    let s = demarrer(&d, &["--projets-reseau", "--projets", &format!("{d}/CAO")], &[]);
    assert!(!s.annonce.contains("refuses dans ce mode") && s.annonce.contains("ouverts au reseau"), "{}", s.annonce);
    // ce poste (boucle locale) passe sans code ; les projets sont ouverts sous la racine declaree
    assert_eq!(get(s.port, "/api/projets").code, 200);
    let s2 = demarrer(&d, &["--local"], &[]);
    assert!(s2.annonce.contains("Mode local") && get(s2.port, "/api/projets").code == 200);
}

/// 4c. Les echecs d'un calcul s'ecrivent dans le terminal avec leur code ; une page fermee
/// en plein calcul sort en 499.
#[test]
#[cfg(unix)]
fn journal_des_calculs() {
    let (d, _) = poste_reseau("webcao-journal", false);
    let s = demarrer(&d, &["--local"], &[]);
    assert_eq!(post(s.port, "/api/crosstalk", r#"{"format": "autre"}"#).code, 422);
    // un calcul d'une demi-seconde au moins, et la page se ferme pendant qu'il tourne
    let corps = r#"{"format": "cao-sim-dc-1", "polygones": [{"layer": 0, "net": "VCC", "epaisseur": 0.035, "sommets": [[0, 0], [60, 0], [60, 20], [0, 20]]}],
                    "sources": [{"x": 1.0, "y": 10, "layer": 0, "net": "VCC", "courant": 1.0}],
                    "references": [{"x": 59.0, "y": 10, "layer": 0, "net": "VCC", "tension": 0.0}], "pas": 0.1}"#;
    let mut c = connecter(s.port);
    write!(c, "POST /api/simulation-dc HTTP/1.1\r\nHost: 127.0.0.1\r\nX-WEB_CAO: 1\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{}", corps.len(), corps).unwrap();
    drop(c);
    let lu = || std::fs::read_to_string(&s.journal).unwrap();
    let limite = Instant::now() + Duration::from_secs(120);
    while !lu().contains("ERREUR 499 /api/simulation-dc") {
        assert!(Instant::now() < limite, "pas de ligne 499 :\n{}", lu());
        std::thread::sleep(Duration::from_millis(100));
    }
    assert!(lu().contains("ERREUR 422 /api/crosstalk"), "{}", lu());
    // un client qui attend sa réponse n'est pas « parti »
    let mut c = connecter(s.port);
    write!(c, "GET /api/simulation-dc HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n").unwrap();
    let mut rep = String::new();
    c.read_to_string(&mut rep).unwrap();
    assert!(rep.starts_with("HTTP/1.0 200") && lu().matches("ERREUR 499").count() == 1, "{rep}\n{}", lu());
}
