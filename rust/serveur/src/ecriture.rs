//! Les deux écritures du serveur : remplacer un fichier d'un seul geste, ou le créer sans
//! jamais écraser.

use std::io::{self, Write};
use std::sync::atomic::{AtomicU64, Ordering};

// un nom par ecriture : deux requetes simultanees (un fil chacune) ecrivaient
// dans le meme .tmp et le rename posait un melange des deux
static NUMERO: AtomicU64 = AtomicU64::new(0);

fn temporaire(chemin: &str) -> String {
    format!("{}.{}-{}.tmp", chemin, std::process::id(), NUMERO.fetch_add(1, Ordering::Relaxed))
}

/// Les donnees sur le disque AVANT le renommage : sinon une coupure de courant
/// juste apres « Enregistrer » peut laisser le bon nom sur un fichier vide.
fn poser(chemin: &str, contenu: &[u8], exclusif: bool) -> io::Result<()> {
    let mut f = std::fs::File::options().write(true).create(true).truncate(!exclusif).create_new(exclusif).open(chemin)?;
    f.write_all(contenu)?;
    f.sync_all()
}

/// Ecrit `contenu` via un fichier temporaire puis un renommage.
///
/// Meme precaution que pour les profils et les projets : une coupure au
/// mauvais moment laisse l'ancien fichier entier plutot qu'un catalogue tronque.
pub fn ecrire_atomique(chemin: &str, contenu: &[u8]) -> io::Result<()> {
    let temp = temporaire(chemin);
    let fait = poser(&temp, contenu, false).and_then(|_| std::fs::rename(&temp, chemin));
    if fait.is_err() {
        let _ = std::fs::remove_file(&temp); // pas de .tmp laisse
    }
    fait
}

/// Cree `chemin` avec `contenu`, complet ou pas du tout.
///
/// AlreadyExists si le nom est pris : c'est le systeme qui refuse (lien ou
/// creation exclusive), pas un « lire puis ecrire ». Le contenu est ecrit a part puis lie
/// sous son nom.
pub fn ecrire_exclusif(chemin: &str, contenu: &[u8]) -> io::Result<()> {
    let temp = temporaire(chemin);
    let fait = poser(&temp, contenu, false).and_then(|_| match std::fs::hard_link(&temp, chemin) {
        Err(e) if e.kind() != io::ErrorKind::AlreadyExists => {
            // systeme de fichiers sans liens (FAT, exFAT) : creation exclusive, puis ecriture ;
            // un echec en cours d'ecriture retire le fichier, pour ne pas laisser un vide
            match poser(chemin, contenu, true) {
                Err(e) if e.kind() != io::ErrorKind::AlreadyExists => {
                    let _ = std::fs::remove_file(chemin);
                    Err(e)
                }
                autre => autre,
            }
        }
        autre => autre,
    });
    let _ = std::fs::remove_file(&temp);
    fait
}

#[cfg(test)]
mod essais {
    use super::*;

    /// Cas 49 de banc-serveur-routes.py : un nom pris n'est jamais ecrase, et rien de
    /// temporaire ne reste.
    #[test]
    fn exclusif_et_atomique() {
        let d = std::env::temp_dir().join(format!("webcao-ecriture-{}", std::process::id()));
        std::fs::create_dir_all(&d).unwrap();
        let cible = d.join("fiche.pdf").to_string_lossy().into_owned();
        ecrire_exclusif(&cible, b"%PDF-1").unwrap();
        assert_eq!(ecrire_exclusif(&cible, b"%PDF-2").unwrap_err().kind(), io::ErrorKind::AlreadyExists);
        assert_eq!(std::fs::read(&cible).unwrap(), b"%PDF-1");
        ecrire_atomique(&cible, b"%PDF-3").unwrap();
        assert_eq!(std::fs::read(&cible).unwrap(), b"%PDF-3");
        assert!(ecrire_atomique(&d.join("absent/x").to_string_lossy(), b"x").is_err());
        let restes: Vec<_> = std::fs::read_dir(&d).unwrap().map(|e| e.unwrap().file_name()).collect();
        assert_eq!(restes, ["fiche.pdf"]);
        std::fs::remove_dir_all(&d).unwrap();
    }
}
