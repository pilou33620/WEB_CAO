//! Le démarrage : arguments, mise à jour, ouverture du port et annonce dans la console.
//!
//!     web_cao                 # ecoute sur le reseau local, port 8000
//!     web_cao --local         # localhost uniquement
//!     web_cao --port 9000
//!     web_cao --navigateur        # forcer l'ouverture du navigateur
//!     web_cao --sans-navigateur   # ne pas ouvrir le navigateur (defaut sur Raspberry Pi)
//!
//! Un double-clic sur demarrer_WEB_CAO.cmd suffit sous Windows : le navigateur s'ouvre sur
//! la bonne adresse et la console reste ouverte -- le journal des requetes y
//! defile, et rien ne disparait si le demarrage echoue. --sans-pause rend la main
//! tout de suite (scripts, service).

use std::io::Write;
use std::net::{Ipv4Addr, TcpListener};
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use web_tools_commun::appairage;
use web_tools_commun::serveur::{Requete, Serveur};

use crate::chemins::{abspath, existe, expanduser, realpath};
use crate::plateforme::*;
use crate::poste::Poste;

pub const PORT_DEFAUT: u16 = 8000;
const NB_PORTS_VOISINS: u16 = 20;

/// Ce que la ligne de commande demande.
#[derive(Debug, PartialEq)]
pub struct Options {
    pub port: u16,
    pub hote: String,
    pub local: bool,
    /// None : au choix du poste (`doit_ouvrir_navigateur`).
    pub navigateur: Option<bool>,
    pub sans_pause: bool,
    pub verifier_maj: bool,
    pub projets: Vec<String>,
    pub projets_reseau: bool,
    pub lib: Option<String>,
}

/// Ce que `analyser` rend quand il n'y a rien à lancer : l'aide, ou une erreur d'argument.
#[derive(Debug, PartialEq)]
pub enum Arret {
    Aide,
    Erreur(String),
}

const USAGE: &str = "usage: web_cao [-h] [--port PORT] [--host HOST] [--local] [--navigateur]\n\
                     \x20              [--sans-navigateur] [--sans-pause] [--sans-maj]\n\
                     \x20              [--projets DOSSIER] [--projets-reseau] [--lib DOSSIER]";

fn aide() {
    let sep = if cfg!(windows) { ';' } else { ':' };
    println!("{}\n", USAGE);
    println!("Petit serveur HTTP pour ouvrir les editeurs depuis un autre appareil.\n");
    println!("options:");
    println!("  -h, --help         show this help message and exit");
    println!("  --port PORT        port d'ecoute (defaut : {} ; 0 = au choix du systeme)", PORT_DEFAUT);
    println!("  --host HOST        adresse d'ecoute (defaut : toutes les interfaces ; sinon");
    println!("                     127.0.0.1, comme --local)");
    println!("  --local            n'ecouter que sur 127.0.0.1 : aucun acces reseau");
    println!("  --navigateur       ouvrir le navigateur au demarrage (defaut sous Windows/bureau)");
    println!("  --sans-navigateur  ne pas ouvrir le navigateur au demarrage (defaut sur");
    println!("                     Raspberry Pi / terminal)");
    println!("  --sans-pause       rendre la main sans attendre Entree a la fermeture (Windows)");
    println!("  --sans-maj         ne pas verifier les mises a jour GitHub au demarrage");
    println!("  --projets DOSSIER  racine des dossiers de projet (defaut : projets/ a cote");
    println!("                     d'index.html). Repetable, ou plusieurs chemins separes par");
    println!("                     « {} ». Aucun projet ne peut etre lu ni ecrit hors de ces", sep);
    println!("                     racines");
    println!("  --projets-reseau   en ecoute reseau, ouvrir quand meme les projets (sous");
    println!("                     --projets seulement) et l'ecriture dans la LIB active. Sans");
    println!("                     mot de passe : reseau de confiance uniquement");
    println!("  --lib DOSSIER      chemin d'acces au dossier de la bibliotheque LIB (defaut :");
    println!("                     LIB/ a cote d'index.html ou config_lib.json)");
}

/// Les arguments de la ligne de commande (argparse de web_CAO.py).
pub fn analyser(argv: &[String]) -> Result<Options, Arret> {
    let mut o = Options {
        port: PORT_DEFAUT,
        hote: String::new(),
        local: false,
        navigateur: None,
        sans_pause: false,
        verifier_maj: true,
        projets: Vec::new(),
        projets_reseau: false,
        lib: None,
    };
    let erreur = |texte: String| Arret::Erreur(texte);
    let mut args = argv.iter().map(String::as_str);
    while let Some(arg) = args.next() {
        let (nom, mut valeur) = match arg.split_once('=') {
            Some((nom, valeur)) if nom.starts_with("--") => (nom, Some(valeur)),
            _ => (arg, None),
        };
        match nom {
            "-h" | "--help" => return Err(Arret::Aide),
            "--port" | "--host" | "--projets" | "--lib" => {
                let Some(v) = valeur.take().or_else(|| args.next()) else {
                    return Err(erreur(format!("argument {}: expected one argument", nom)));
                };
                match nom {
                    "--port" => o.port = v.parse().map_err(|_| erreur(format!("argument --port: invalid int value: '{}'", v)))?,
                    "--host" => o.hote = v.to_string(),
                    "--projets" => o.projets.push(v.to_string()),
                    _ => o.lib = Some(v.to_string()),
                }
            }
            "--local" => o.local = true,
            "--navigateur" => o.navigateur = Some(true),
            "--sans-navigateur" => o.navigateur = Some(false),
            "--sans-pause" => o.sans_pause = true,
            "--sans-maj" => o.verifier_maj = false,
            "--projets-reseau" => o.projets_reseau = true,
            _ => return Err(erreur(format!("unrecognized arguments: {}", arg))),
        }
        if valeur.is_some() {
            return Err(erreur(format!("argument {}: ignored explicit argument", nom)));
        }
    }
    Ok(o)
}

/// La recherche de mise à jour a-t-elle lieu ? Ni avec --sans-maj, ni dans le processus
/// relancé après une mise à jour (WEB_CAO_DEJA_MAJ=1 : pas de boucle de redémarrage).
pub fn doit_verifier_maj(o: &Options, deja_maj: Option<&str>) -> bool {
    o.verifier_maj && deja_maj != Some("1")
}

/// --projets se repete, et chaque valeur peut en contenir plusieurs :
/// « --projets D:\projets;E:\clients » comme « --projets a --projets b ».
pub fn racines_declarees(projets: &[String]) -> Vec<String> {
    let mut vues: Vec<String> = Vec::new();
    for brut in projets {
        for part in std::env::split_paths(brut) {
            let part = part.to_string_lossy();
            let part = crate::json::strip(&part).trim_matches('"');
            if part.is_empty() {
                continue;
            }
            let chemin = abspath(&expanduser(part));
            if !vues.contains(&chemin) {
                vues.push(chemin);
            }
        }
    }
    vues
}

/// Les guillemets et apostrophes typographiques que Windows met dans ses
/// messages d'erreur ne passent pas la console (cp850).
fn lisible(texte: &str) -> String {
    [("’", "'"), ("‘", "'"), ("“", "\""), ("”", "\""), ("–", "-"), ("—", "-"), ("\u{a0}", " ")].iter().fold(texte.to_string(), |t, (a, b)| t.replace(a, b))
}

/// Ouvre un serveur sur le port, ou rend la ligne qui dit pourquoi non.
///
/// C'est a l'appelant de dire ce qu'il en pense : une tentative ratee suivie d'un repli
/// reussi n'est pas une erreur, et l'afficher comme telle donne l'impression d'un plantage.
/// Le serveur commun ne rend pas la raison d'un refus : on la redemande au systeme.
fn ouvrir(reseau: bool, port: u16) -> Result<Arc<Serveur>, String> {
    Serveur::ouvrir(port, reseau, 1).map_err(|_| {
        let ip = if reseau { Ipv4Addr::UNSPECIFIED } else { Ipv4Addr::LOCALHOST };
        let pourquoi = TcpListener::bind((ip, port)).err().map_or_else(|| "l'ecoute est refusee".to_string(), |e| lisible(&e.to_string()));
        format!("IPv4, {}:{} -- {}", if reseau { "toutes" } else { "127.0.0.1" }, port, pourquoi)
    })
}

static ARRET: AtomicBool = AtomicBool::new(false);

#[cfg(unix)]
extern "C" fn sur_signal(_: libc::c_int) {
    ARRET.store(true, Ordering::SeqCst);
}

#[cfg(windows)]
unsafe extern "system" fn sur_ctrl_c(evenement: u32) -> i32 {
    if evenement != windows_sys::Win32::System::Console::CTRL_C_EVENT {
        return 0; // fenêtre fermée : le système arrête le processus
    }
    ARRET.store(true, Ordering::SeqCst);
    1
}

#[cfg(windows)]
unsafe extern "system" fn ctrl_c_ignore(evenement: u32) -> i32 {
    (evenement == windows_sys::Win32::System::Console::CTRL_C_EVENT) as i32
}

/// Ctrl+C (et SIGTERM) demandent l'arrêt.
fn ecouter_ctrl_c() {
    #[cfg(unix)]
    unsafe {
        libc::signal(libc::SIGINT, sur_signal as extern "C" fn(libc::c_int) as libc::sighandler_t);
        libc::signal(libc::SIGTERM, sur_signal as extern "C" fn(libc::c_int) as libc::sighandler_t);
    }
    #[cfg(windows)]
    unsafe {
        windows_sys::Win32::System::Console::SetConsoleCtrlHandler(Some(sur_ctrl_c), 1);
    }
}

/// Relance l'outil avec les memes arguments apres une mise a jour.
fn redemarrer_application(argv: &[String]) {
    let _ = std::io::stdout().flush();
    if std::env::var("WEB_CAO_RELANCEUR").as_deref() == Ok("1") {
        // Le script demarrer_* reboucle : il récupère le nouvel exécutable et le relance
        // (ce binaire-ci ne peut pas se recompiler).
        std::process::exit(75);
    }
    let lancer = || -> std::io::Result<i32> {
        let mut cmd = std::process::Command::new(std::env::current_exe()?);
        cmd.args(argv).env("WEB_CAO_DEJA_MAJ", "1");
        #[cfg(unix)]
        {
            // Sous Unix / macOS, exec remplace l'image du processus courant
            Err(std::os::unix::process::CommandExt::exec(&mut cmd))
        }
        #[cfg(not(unix))]
        {
            // Sous Windows, attendre l'enfant permet de conserver la fenetre console
            // ouverte (en particulier lors d'un lancement par double-clic).
            // Ctrl+C atteint aussi l'enfant, qui s'arrête proprement : on l'attend.
            #[cfg(windows)]
            unsafe {
                windows_sys::Win32::System::Console::SetConsoleCtrlHandler(Some(ctrl_c_ignore), 1);
            }
            Ok(cmd.status()?.code().unwrap_or(1))
        }
    };
    match lancer() {
        Ok(code) => std::process::exit(code),
        Err(exc) => {
            println!("[!] Erreur lors du redemarrage automatique : {}", exc);
            println!("[*] Poursuite avec le processus actuel...");
        }
    }
}

/// Ouvre le port, annonce le serveur et sert jusqu'à Ctrl+C. `preparer` reçoit le poste
/// une fois l'écoute obtenue (LIB et racines de la ligne de commande).
fn demarrer_serveur(racine: &str, o: &Options, mut reseau: bool, navigateur: bool, preparer: impl FnOnce(&mut Poste) -> Result<(), String>) -> i32 {
    let detailler = |echecs: &[String]| echecs.iter().for_each(|ligne| println!("      {}", ligne));
    let port = o.port;
    let mut echecs = Vec::new();
    let essayer = |reseau: bool, port: u16, echecs: &mut Vec<String>| ouvrir(reseau, port).map_err(|e| echecs.push(e)).ok();
    let mut serveur = essayer(reseau, port, &mut echecs);
    if serveur.is_none() && port != 0 {
        println!("[!] Le port {} est refuse (securite entreprise, ou deja utilise) :", port);
        detailler(&echecs);
        println!("[*] Recherche du premier port voisin libre ({} a {})...", port.saturating_add(1), port.saturating_add(NB_PORTS_VOISINS));
        // POURQUOI PAS LE PORT 0. Laisser le systeme choisir marche du premier coup,
        // mais donne un port different a chaque lancement -- et le navigateur range
        // localStorage par origine, donc par port : reglages, profils et liste des
        // projets recents disparaissent a chaque demarrage. Une suite fixe garde la
        // meme adresse d'un jour a l'autre tant que la machine refuse le meme port.
        serveur = (1..=NB_PORTS_VOISINS).filter_map(|n| port.checked_add(n)).find_map(|voisin| essayer(reseau, voisin, &mut echecs));
    }
    if serveur.is_none() && port != 0 {
        println!("[!] Aucun port voisin libre : le systeme en choisira un au hasard.");
        println!("    L'adresse changera d'un lancement a l'autre, et le navigateur");
        println!("    rangeant reglages, profils et projets recents par origine,");
        println!("    l'outil s'ouvrira sur un espace de travail vide.");
        echecs.clear();
        serveur = essayer(reseau, 0, &mut echecs);
    }
    if serveur.is_none() && reseau {
        println!("[!] Aucune interface reseau n'accepte l'ecoute :");
        detailler(&echecs);
        println!("[*] Tentative en mode local uniquement (inaccessible depuis l'iPad)...");
        echecs.clear();
        reseau = false;
        serveur = essayer(false, 0, &mut echecs);
    }
    let Some(serveur) = serveur else {
        println!("[X] Impossible de demarrer le serveur :");
        detailler(&echecs);
        return 1;
    };
    // Un client muet (corps annonce jamais envoye, connexion d'un octet) ne garde
    // pas son fil : la lecture abandonne apres 120 s.
    serveur.regler_delai(120);

    let port_obtenu = serveur.port();
    let local_seul = !reseau;
    let url = format!("http://127.0.0.1:{}/", port_obtenu);
    // Les dossiers de projet ne s'ouvrent que sur une ecoute locale. Le choix
    // se fait ici, sur l'adresse reellement obtenue -- pas sur l'intention :
    // un repli sur 127.0.0.1 apres un port refuse doit compter comme local.
    let mut poste = Poste::new(racine, local_seul);
    poste.projets_reseau = o.projets_reseau;
    poste.lanceur = std::env::var("WEBSUITE_LANCEUR").unwrap_or_default();
    poste.jeton_lanceur = std::env::var("WEBSUITE_JETON").unwrap_or_default();
    if let Err(exc) = preparer(&mut poste) {
        println!("[X] {}", exc);
        return 1;
    }
    poste.garde.brancher(&serveur); // en mode reseau : HTTPS sur le meme port

    if port_obtenu != port && port != 0 {
        println!("[*] Port retenu a la place de {} : {}", port, port_obtenu);
        println!();
    }
    let trait_ = "=".repeat(60);
    println!("{}", trait_);
    println!("SERVEUR CAO WEB DEMARRE");
    println!("{}", trait_);
    println!("  dossier servi : {}", racine);
    println!("  passerelle    : /api/tools et /api/tool -> pcbparts.dev");
    println!("  simulation EM : /api/simulation -> MoM sur la section droite (rust/ligne_mom)");
    println!("  crosstalk     : /api/crosstalk -> matrice S synthetisee depuis le design + IFFT (rust/em)");
    println!("  simulation RF : /api/simulation-rf -> S21 port a port, pistes + composants (rust/rf_reseau)");
    println!("  oeil          : /api/oeil -> reponse a un bit, PRBS, pire cas, gabarits (rust/oeil)");
    println!("  scoring PCB   : /api/pcb/score-placement -> HPWL, congestion, decouplage (rust/motifs)");
    println!("  motifs schema : /api/schema/patterns -> alim, bus, osc, filtres (rust/motifs)");
    if poste.projets_ouvert || poste.projets_reseau {
        println!("  projets       : /api/projets, /api/projet, /api/projet/doc{}", if poste.projets_ouvert { "" } else { "  (ouvertes au reseau : --projets-reseau)" });
        let racines = poste.racines();
        for (i, r) in racines.iter().enumerate() {
            println!("                  {} {}", if i == 0 { "racine :" } else { "        " }, r);
        }
        if racines.len() > 1 {
            println!("                  (la premiere sert de defaut a la creation)");
        }
    }
    let (d_lib, defaut_lib) = (poste.dossier_lib(), poste.dossier_lib_defaut());
    let lib_est_defaut = if existe(&d_lib) && existe(&defaut_lib) { realpath(&d_lib) == realpath(&defaut_lib) } else { d_lib == defaut_lib };
    println!("  bibliotheque  : {} {}", d_lib, if lib_est_defaut { "(par defaut)" } else { "(personnalisee)" });
    if local_seul {
        println!("  adresse       : {}", url);
        println!();
        println!("  Mode local : le serveur n'est PAS accessible depuis un autre");
        println!("  appareil. Relancez sans --local pour ouvrir l'acces au reseau.");
    } else {
        println!("  adresse       : {}", poste.garde.adresse(&ip_reseau(), port_obtenu));
        if let Some(ip) = appairage::ip_tailscale() {
            println!("  tailscale     : {}", poste.garde.adresse(&ip.to_string(), port_obtenu));
        }
        println!();
        println!("  Depuis un autre appareil du meme reseau WiFi (iPad par exemple),");
        println!("  ouvrez le navigateur et tapez cette adresse.");
        println!();
        println!("  La premiere fois, l'autre appareil demande le code d'appairage");
        println!("  ci-dessous ; il s'en souvient ensuite, pour tous les web tools");
        println!("  de ce poste. --local limite l'acces a cette machine.");
        poste.garde.annoncer();
        println!();
        if poste.projets_reseau {
            println!("  Les dossiers de projet sont ouverts au reseau (--projets-reseau),");
            println!("  confines aux racines declarees.");
        } else {
            println!("  Les dossiers de projet sont refuses dans ce mode : lire et");
            println!("  ecrire sur le disque ne s'ouvre pas a un reseau sans mot de");
            println!("  passe. Relancez avec --local, ou avec --projets-reseau.");
        }
    }
    println!();
    println!("{}", trait_);
    println!("(Ctrl+C pour arreter)");
    println!();

    if navigateur {
        println!("  Ouverture du navigateur sur {}", url);
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(800));
            ouvrir_navigateur(&url);
        });
    } else if sur_raspberry_pi(Path::new("/")) {
        println!("  Raspberry Pi detecte (mode serveur/terminal) :");
        println!("  Le navigateur local n'est pas ouvert.");
        println!("  Connectez-vous depuis votre PC ou tablette a l'adresse ci-dessus.");
        println!();
    } else if cfg!(target_os = "linux") && !affichage() {
        println!("  Session terminal sans affichage graphique :");
        println!("  Le navigateur local n'est pas ouvert.");
        println!("  Connectez-vous depuis un navigateur a l'adresse ci-dessus.");
        println!();
    }
    let _ = std::io::stdout().flush();

    ecouter_ctrl_c();
    // Une requete par fil : un appel a pcbparts.dev (jusqu'a 30 s) ne doit
    // pas geler le service des fichiers.
    serveur.servir_en_fond(Arc::new(move |r: &mut Requete| poste.servir(r)));
    while !ARRET.load(Ordering::SeqCst) {
        std::thread::sleep(Duration::from_millis(100));
    }
    println!("\nServeur arrete.");
    serveur.arreter();
    0
}

fn principal(argv: &[String]) -> i32 {
    let o = match analyser(argv) {
        Ok(o) => o,
        Err(Arret::Aide) => {
            aide();
            return 0;
        }
        Err(Arret::Erreur(texte)) => {
            eprintln!("{}\nweb_cao: error: {}", USAGE, texte);
            return 2;
        }
    };
    // shortcut: le serveur commun (web_tools_commun) n'ecoute que sur toutes les interfaces
    // ou sur 127.0.0.1 ; une adresse precise demande une ouverture de plus dans cette caisse.
    let local = match o.hote.as_str() {
        "" | "0.0.0.0" | "::" => o.local,
        "127.0.0.1" | "localhost" | "::1" => true,
        autre => {
            eprintln!("{}\nweb_cao: error: argument --host: {} : seules toutes les interfaces (defaut) ou 127.0.0.1 (--local) sont possibles", USAGE, autre);
            return 2;
        }
    };
    let racine = outils::racine().to_string_lossy().into_owned();
    // Un double-clic n'a pas d'argument a donner : c'est a lui de choisir le
    // mode le plus utile. Le mode reseau, lui, reste ce qu'on obtient en
    // lancant le programme a la main -- il ne s'obtient donc pas par accident.
    let double_clic = argv.is_empty() && lance_par_double_clic();
    // La mise a jour avant tout le reste : le code telecharge ne sert a rien tant que
    // c'est l'ancien qui tourne. Elle est un plus : son echec ne doit jamais empecher
    // l'outil de demarrer.
    if doit_verifier_maj(&o, std::env::var("WEB_CAO_DEJA_MAJ").ok().as_deref()) && crate::maj::verifier_et_appliquer_maj(Path::new(&racine)) {
        redemarrer_application(argv);
    }
    let mut reseau = !local;
    if double_clic && reseau {
        // Sans cela, le double-clic ouvrait l'ecoute sur tout le reseau -- et
        // dans ce mode le serveur refuse les dossiers de projet (lire et
        // ecrire sur le disque sans mot de passe). L'outil demarrait donc
        // amoindri, sans que rien ne relie la cause a l'effet.
        reseau = false;
        println!("[*] Lance par double-clic : mode local (les dossiers de projet");
        println!("    sont accessibles, le serveur n'est visible que de ce PC).");
        println!("    Pour l'ouvrir a l'iPad, lancez-le depuis un terminal :");
        println!("    web_cao");
        println!();
    }
    let navigateur =
        o.navigateur.unwrap_or_else(|| doit_ouvrir_navigateur(cfg!(windows), sur_raspberry_pi(Path::new("/")), cfg!(target_os = "linux"), affichage()));
    demarrer_serveur(&racine, &o, reseau, navigateur, |poste| {
        if let Some(lib) = &o.lib {
            // --lib ne vaut que pour ce lancement : il ne s'ecrit pas dans config_lib.json
            poste.definir_dossier_lib(lib, false, false).map_err(|exc| format!("--lib : {}", exc.message))?;
            poste.lib_impose = true;
        }
        poste.racines_projets = racines_declarees(&o.projets);
        Ok(())
    })
}

/// Point d'entree : la fenetre d'un double-clic ne se ferme plus sur l'erreur.
pub fn lancer(argv: &[String]) -> i32 {
    let code = std::panic::catch_unwind(|| principal(argv)).unwrap_or(1);
    // Un double-clic sous Windows ouvre une console qui se referme des que le
    // programme rend la main : sans cette attente, ni l'erreur de demarrage ni le
    // dernier message d'arret n'ont le temps d'etre lus. Ailleurs, le terminal
    // survit au programme : ne rien attendre.
    let muet = argv.iter().any(|a| ["--sans-pause", "--help", "-h"].contains(&a.as_str()));
    if cfg!(windows) && !muet && (console_interactive() || lance_par_double_clic()) {
        attendre_touche();
    }
    code
}

#[cfg(test)]
mod essais {
    use super::*;

    fn args(liste: &[&str]) -> Vec<String> {
        liste.iter().map(|a| a.to_string()).collect()
    }

    /// banc-detection-plateforme.py (cas 08) et banc-maj-github.py (cas 08 et 09).
    #[test]
    fn ligne_de_commande() {
        // 08. --navigateur et --sans-navigateur ont priorite sur la detection
        let o = analyser(&args(&["--sans-navigateur"])).unwrap();
        assert_eq!((o.hote.as_str(), o.port, o.navigateur), ("", 8000, Some(false)));
        assert_eq!(analyser(&args(&["--navigateur"])).unwrap().navigateur, Some(true));
        assert_eq!(analyser(&[]).unwrap().navigateur, None);
        // --sans-maj desactive la recherche de mise a jour ; WEB_CAO_DEJA_MAJ=1 aussi
        let o = analyser(&args(&["--sans-maj", "--local", "--port", "0", "--sans-navigateur"])).unwrap();
        assert!(o.local && o.port == 0 && !doit_verifier_maj(&o, None));
        let o = analyser(&args(&["--local", "--port=0", "--sans-navigateur"])).unwrap();
        assert!(doit_verifier_maj(&o, None) && doit_verifier_maj(&o, Some("0")) && !doit_verifier_maj(&o, Some("1")));
        let o = analyser(&args(&["--projets", "a", "--projets=b", "--lib", "L", "--projets-reseau", "--sans-pause", "--host", "::"])).unwrap();
        assert_eq!((o.projets, o.lib, o.projets_reseau, o.sans_pause, o.hote.as_str()), (args(&["a", "b"]), Some("L".into()), true, true, "::"));
        assert_eq!(analyser(&args(&["-h"])), Err(Arret::Aide));
        for refuse in [&["--port"][..], &["--port", "x"], &["--inconnu"], &["--local=1"]] {
            assert!(matches!(analyser(&args(refuse)), Err(Arret::Erreur(_))), "{:?}", refuse);
        }
    }

    #[test]
    fn racines_de_la_ligne_de_commande() {
        let sep = if cfg!(windows) { ";" } else { ":" };
        let r = racines_declarees(&args(&[&format!("/tmp/a{sep}/tmp/b{sep}"), "/tmp/a", "\"/tmp/c\""]));
        assert_eq!(r, [abspath("/tmp/a"), abspath("/tmp/b"), abspath("/tmp/c")]);
    }
}
