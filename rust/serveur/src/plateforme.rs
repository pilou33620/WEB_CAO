//! Ce qui dépend du poste : Raspberry Pi ou bureau, navigateur, console de Windows.

use std::path::{Path, PathBuf};

/// Vrai si la machine hote est un Raspberry Pi ; `systeme` est la racine du système de
/// fichiers (« / », ou un dossier d'essai).
pub fn sur_raspberry_pi(systeme: &Path) -> bool {
    if cfg!(windows) {
        return false;
    }
    let lire = |chemin: &str| std::fs::read(systeme.join(chemin)).map(|o| String::from_utf8_lossy(&o).to_lowercase()).unwrap_or_default();
    ["proc/device-tree/model", "sys/firmware/devicetree/base/model"].iter().any(|c| lire(c).contains("raspberry pi"))
        || systeme.join("etc/rpi-issue").exists()
        || ["raspbian", "raspberry pi"].iter().any(|m| lire("etc/os-release").contains(m))
}

/// Determine si le navigateur doit s'ouvrir automatiquement au demarrage.
///
/// - Windows : oui par defaut (bureau interactif).
/// - Raspberry Pi : non par defaut (usage serveur headless / terminal).
/// - Linux sans session graphique (pas de DISPLAY ni WAYLAND_DISPLAY) : non (terminal/SSH).
/// - Linux avec session graphique ou macOS : oui.
pub fn doit_ouvrir_navigateur(windows: bool, raspberry_pi: bool, linux: bool, affichage: bool) -> bool {
    windows || (!raspberry_pi && (!linux || affichage))
}

/// Cette session a-t-elle un affichage graphique ?
pub fn affichage() -> bool {
    ["DISPLAY", "WAYLAND_DISPLAY"].iter().any(|v| std::env::var_os(v).is_some_and(|d| !d.is_empty()))
}

/// shutil.which : l'exécutable `nom` dans le PATH.
pub fn quel(nom: &str) -> Option<PathBuf> {
    let extensions: &[&str] = if cfg!(windows) { &[".exe", ".cmd", ".bat", ""] } else { &[""] };
    std::env::split_paths(&std::env::var_os("PATH")?).flat_map(|d| extensions.iter().map(move |e| d.join(format!("{}{}", nom, e)))).find(|p| p.is_file())
}

/// webbrowser.open : la page dans le navigateur par défaut du poste.
pub fn ouvrir_navigateur(url: &str) {
    let mut cmd = if cfg!(windows) {
        let mut c = std::process::Command::new("rundll32");
        c.args(["url.dll,FileProtocolHandler", url]);
        c
    } else {
        let mut c = std::process::Command::new(if cfg!(target_os = "macos") { "open" } else { "xdg-open" });
        c.arg(url);
        c
    };
    use std::process::Stdio;
    if let Err(exc) = cmd.stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null()).spawn() {
        println!("[!] Ouverture du navigateur impossible : {}", exc);
    }
}

/// Adresse IP de la machine sur le reseau local.
///
/// Le connect() d'un socket UDP n'envoie rien : il demande seulement au
/// systeme par quelle interface il sortirait.
pub fn ip_reseau() -> String {
    let par_route = || {
        let s = std::net::UdpSocket::bind("0.0.0.0:0").ok()?;
        s.connect("10.255.255.255:1").ok()?;
        Some(s.local_addr().ok()?.ip().to_string()).filter(|ip| ip != "0.0.0.0")
    };
    par_route().unwrap_or_else(|| "127.0.0.1".into())
}

/// Noms des executables attaches a la console, le notre compris.
///
/// Vide quand la question n'a pas de reponse sure -- pas de console, ou
/// un processus qu'on n'a pas le droit de nommer. L'appelant doit alors s'en
/// tenir au comportement par defaut plutot que de deviner.
#[cfg(windows)]
fn processus_de_la_console() -> Vec<String> {
    use windows_sys::Win32::Foundation::CloseHandle;
    use windows_sys::Win32::System::Console::GetConsoleProcessList;
    use windows_sys::Win32::System::Threading::{OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION};
    let mut pids = [0u32; 16];
    let combien = unsafe { GetConsoleProcessList(pids.as_mut_ptr(), pids.len() as u32) } as usize;
    if combien == 0 || combien > pids.len() {
        return Vec::new();
    }
    let mut noms = Vec::new();
    for &pid in &pids[..combien] {
        let handle = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid) };
        if handle.is_null() {
            return Vec::new();
        }
        let mut chemin = vec![0u16; 32768];
        let mut longueur = chemin.len() as u32;
        let lu = unsafe { QueryFullProcessImageNameW(handle, 0, chemin.as_mut_ptr(), &mut longueur) };
        unsafe { CloseHandle(handle) };
        if lu == 0 {
            return Vec::new();
        }
        let chemin = String::from_utf16_lossy(&chemin[..longueur as usize]);
        noms.push(chemin.rsplit(['\\', '/']).next().unwrap_or("").to_lowercase());
    }
    noms
}

/// Vrai quand Windows a cree la console POUR ce programme -- c'est-a-dire
/// quand il a ete lance depuis l'Explorateur.
///
/// La distinction sert deux fois : choisir le mode local par defaut, et
/// retenir la fenetre a la fin -- sans quoi une erreur de demarrage disparait
/// avec la fenetre, et l'outil a « juste rien fait ».
///
/// COMMENT ON LE SAIT. Un terminal laisse son shell attache a la console :
/// cmd.exe, powershell.exe, bash.exe y figurent a cote de nous (et cmd.exe encore
/// quand c'est demarrer_WEB_CAO.cmd qui lance). Un double-clic sur l'executable,
/// lui, ne fait venir que lui.
pub fn lance_par_double_clic() -> bool {
    #[cfg(windows)]
    {
        let noms = processus_de_la_console();
        let moi = std::env::current_exe().ok().and_then(|e| Some(e.file_name()?.to_string_lossy().to_lowercase()));
        !noms.is_empty() && noms.iter().all(|n| Some(n) == moi.as_ref())
    }
    #[cfg(not(windows))]
    false
}

/// Vrai si une console est attachee : inutile d'attendre sinon.
pub fn console_interactive() -> bool {
    std::io::IsTerminal::is_terminal(&std::io::stdin())
}

/// Retient la fenetre ouverte a la fin (double-clic Windows).
pub fn attendre_touche() {
    use std::io::Write;
    print!("\nAppuyez sur Entree pour fermer cette fenetre...");
    let _ = std::io::stdout().flush();
    let _ = std::io::stdin().read_line(&mut String::new());
}

#[cfg(test)]
mod essais {
    use super::*;

    fn systeme(nom: &str, fichiers: &[(&str, &str)]) -> PathBuf {
        let d = std::env::temp_dir().join(format!("webcao-plateforme-{}-{}", nom, std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        for (chemin, contenu) in fichiers {
            std::fs::create_dir_all(d.join(chemin).parent().unwrap()).unwrap();
            std::fs::write(d.join(chemin), contenu).unwrap();
        }
        d
    }

    /// python/test/banc-detection-plateforme.py, cas 01 à 07.
    #[test]
    #[cfg(not(windows))]
    fn detection() {
        // 01. Windows : le navigateur s'ouvre par defaut, Pi ou non
        assert!(doit_ouvrir_navigateur(true, false, false, false));
        // 02. Raspberry Pi detecte via /proc/device-tree/model
        let pi = systeme("modele", &[("proc/device-tree/model", "Raspberry Pi 4 Model B Rev 1.4\0")]);
        assert!(sur_raspberry_pi(&pi));
        assert!(!doit_ouvrir_navigateur(false, true, true, true));
        // 03. via /etc/os-release (Raspbian)
        let raspbian = systeme("raspbian", &[("etc/os-release", "PRETTY_NAME=\"Raspbian GNU/Linux 11 (bullseye)\"\nNAME=\"Raspbian GNU/Linux\"\n")]);
        assert!(sur_raspberry_pi(&raspbian));
        // 04. via /etc/rpi-issue
        let issue = systeme("issue", &[("etc/rpi-issue", "")]);
        assert!(sur_raspberry_pi(&issue));
        // 05. Linux standard sans DISPLAY ni WAYLAND_DISPLAY (SSH, terminal) : pas de navigateur
        let linux = systeme("linux", &[("etc/os-release", "NAME=\"Debian GNU/Linux\"\n")]);
        assert!(!sur_raspberry_pi(&linux));
        assert!(!doit_ouvrir_navigateur(false, false, true, false));
        // 06. Linux avec bureau graphique
        assert!(doit_ouvrir_navigateur(false, false, true, true));
        // 07. macOS
        assert!(doit_ouvrir_navigateur(false, false, false, false));
        for d in [pi, raspbian, issue, linux] {
            std::fs::remove_dir_all(d).unwrap();
        }
    }
}
