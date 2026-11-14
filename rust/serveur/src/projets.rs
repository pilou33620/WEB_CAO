//! Profils d'utilisateur, dossiers de projet et relai « Enregistrer + GitHub ».

use std::io::{Read, Write};
use std::net::{Ipv4Addr, SocketAddr, TcpStream};
use std::sync::LazyLock;
use std::time::Duration;

use regex::Regex;
use web_tools_commun::appairage;
use web_tools_commun::serveur::Requete;

use crate::chemins::*;
use crate::ecriture::{ecrire_atomique, ecrire_exclusif};
use crate::json::{self, ascii, blanc, dumps, dumps_indente, str_py, Json, Objet};
use crate::obj;
use crate::poste::{param, refus, verrou, Corps, Poste, Refus, Rendu};

// -- profils utilisateur ----------------------------------------------------
// Un fichier par utilisateur, portant son nom : profils/Pilou.json. Le
// navigateur en garde une copie (localStorage) pour le cas ou la page est
// ouverte en double-clic, mais c'est ce fichier-ci qui fait foi -- c'est lui
// qu'on sauvegarde et qu'on emporte. Voir commun/profils.js.
const PROFILS: &str = "profils";
const MAX_PROFIL: usize = 512 * 1024; // un profil, ce sont des reglages : quelques Ko
pub static NOM_INTERDIT: LazyLock<Regex> = LazyLock::new(|| Regex::new(r#"[\\/:*?"<>|\x00-\x1f]"#).unwrap());
static NOMS_RESERVES: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)^(con|prn|aux|nul|com[1-9]|lpt[1-9])$").unwrap());

// -- dossiers de projet -----------------------------------------------------
// Un dossier par projet, et dedans un fichier principal projet.cao.json qui
// porte le nom et fait le lien vers le schema et la carte :
//
//     D:\projets\carte PIR\
//         projet.cao.json          <- le nom, la revision, les liens
//         carte PIR-SCH.json
//         carte PIR-PCB.json
//
// Deux garde-fous, et ils ne sont pas negociables : tout reste sous une racine
// declaree (--projets), et la route ne s'ouvre pas si le serveur ecoute sur le
// reseau. Sans cela, une API qui ecrit un chemin venu du navigateur donnerait a
// quiconque sur le reseau un acces en ecriture a tout le disque.
const PROJETS: &str = "projets"; // racine par defaut, a cote d'index.html
const PROJETS_PROFONDEUR: usize = 3; // niveaux explores en listant (clients/acme/carte)
const MAX_PROJET: usize = 16 * 1024 * 1024; // un schema ou une carte : quelques centaines de Ko
pub const PROJET_FICHIER: &str = "projet.cao.json";
const PROJET_FORMAT: &str = "cao-projet-1";
// Un document de projet par outil. La visionneuse IPC-2581 y figure comme
// les deux editeurs : ce qu'elle range dans le dossier est le modele traduit
// d'une carte recue, piece du projet au meme titre que le schema et le
// circuit imprime. Cette table est la moitie serveur de PROJD_SUFFIXE
// (commun/projet-disque.js) : les deux se lisent ensemble.
const PROJET_SUFFIXE: [(&str, &str); 3] = [("schema", "-SCH.json"), ("pcb", "-PCB.json"), ("ipc2581", "-IPC.json")];

const BISCUIT_LANCEUR: &str = "websuite_jeton"; // le cookie que pose le lanceur (meme hote)
const DELAI_LANCEUR: u64 = 660; // le push du lanceur peut prendre 600 s

fn suffixe(outil: &str) -> &'static str {
    PROJET_SUFFIXE.iter().find(|(o, _)| *o == outil).map_or("", |(_, s)| s)
}

/// Les règles communes aux noms de profil et de projet.
fn nom_sur(brut: &str, max: usize) -> Option<String> {
    let nom = brut.split(blanc).filter(|m| !m.is_empty()).collect::<Vec<_>>().join(" ");
    if nom.is_empty() || nom.chars().count() > max || NOM_INTERDIT.is_match(&nom) {
        return None;
    }
    if nom.trim_matches('.').is_empty() || nom.starts_with('.') || nom.ends_with(['.', ' ']) || NOMS_RESERVES.is_match(&nom) {
        return None;
    }
    Some(nom)
}

/// Nom d'utilisateur -> nom de fichier sur, ou None.
///
/// Le nom vient du navigateur : il n'a le droit ni de traverser un dossier,
/// ni de designer un fichier reserve de Windows. On refuse plutot que de
/// corriger en silence -- a moitie nettoye, un nom ne designe plus la meme
/// personne, et la page sait dire pourquoi il est refuse.
pub fn nom_profil(brut: &str) -> Option<String> {
    nom_sur(brut, 40)
}

/// Nom de projet -> nom de dossier sur, ou None.
///
/// Memes regles que pour un profil : ni traversee de dossier, ni nom reserve
/// de Windows, et un refus franc plutot qu'un nettoyage silencieux.
pub fn nom_projet(brut: &str) -> Option<String> {
    nom_sur(brut, 60)
}

/// str(v or "") de Python.
pub fn texte_ou_vide(v: &Json) -> String {
    if v.vrai() { str_py(v) } else { String::new() }
}

/// Nom de fichier declare dans projet.cao.json -> sur, ou None.
///
/// Ce nom vient d'un fichier sur le disque, pas d'un champ de formulaire :
/// a demi confiance seulement. Un simple nom de fichier .json, sans dossier.
fn nom_fichier_doc(valeur: &str) -> Option<String> {
    let nom = json::strip(valeur);
    if nom.is_empty() || nom.chars().count() > 120 || basename(nom) != nom || !nom.to_lowercase().ends_with(".json") {
        return None;
    }
    (!NOM_INTERDIT.is_match(nom) && !nom.starts_with('.')).then(|| nom.to_string())
}

/// Le brouillon d'un document : la sauvegarde automatique de l'editeur,
/// a cote de lui (carte-SCH.json -> carte-SCH.brouillon.json). Il ne finit
/// plus par le suffixe de l'outil : ni le releve des documents, ni le repli
/// projet_doc_trouver, ni derniere_sauvegarde ne le prennent pour le
/// document. Ignore par git (lanceur de web_suite, GITIGNORE).
fn chemin_brouillon(chemin: &str) -> String {
    format!("{}.brouillon.json", &chemin[..chemin.len() - ".json".len()])
}

/// La derniere ecriture dans un projet : son fichier projet ou l'un de ses
/// documents (schema, carte, IPC). C'est l'heure que l'accueil affiche ; celle
/// du seul projet.cao.json ne bougeait pas quand on enregistrait le schema.
pub fn derniere_sauvegarde(dossier: &str) -> i64 {
    let mut quand = mtime_ms(&joindre(dossier, PROJET_FICHIER));
    for entree in lister(dossier).unwrap_or_default() {
        if PROJET_SUFFIXE.iter().any(|(_, s)| entree.to_lowercase().ends_with(&s.to_lowercase())) {
            quand = quand.max(mtime_ms(&joindre(dossier, &entree)));
        }
    }
    quand
}

/// sorted(os.listdir(dossier)).
pub fn lister(dossier: &str) -> std::io::Result<Vec<String>> {
    let mut noms: Vec<String> = std::fs::read_dir(dossier)?.filter_map(|e| Some(e.ok()?.file_name().to_string_lossy().into_owned())).collect();
    noms.sort();
    Ok(noms)
}

/// json.load d'un fichier du disque : Ok(None) s'il n'est pas du JSON.
fn charger(chemin: &str) -> std::io::Result<Option<Json>> {
    let brut = std::fs::read(chemin)?;
    Ok(String::from_utf8(brut).ok().and_then(|t| json::loads(&t).ok()))
}

impl Poste {
    // ======================================================================
    // Profils : trois routes, et un seul dossier : profils/. La page d'accueil
    // liste les utilisateurs, chaque outil lit et reecrit celui qui travaille.
    // ======================================================================
    /// Le dossier des profils, a cote d'index.html.
    pub fn dossier_profils(&self) -> String {
        joindre(&self.racine, PROFILS)
    }

    fn profil_nom(r: &Requete) -> Result<String, Refus> {
        nom_profil(&param(r, "nom")).ok_or_else(|| refus(400, "Nom d'utilisateur invalide"))
    }

    /// La liste des utilisateurs, c'est le contenu du dossier.
    pub(crate) fn profils_index(&self) -> Rendu {
        let dossier = self.dossier_profils();
        let mut out = Vec::new();
        // dossier absent : aucun profil, pas une erreur
        for f in lister(&dossier).unwrap_or_default() {
            if !f.to_lowercase().ends_with(".json") {
                continue;
            }
            if let Some(nom) = nom_profil(&f[..f.len() - ".json".len()]) {
                out.push(obj! {"nom" => nom, "t" => mtime_ms(&joindre(&dossier, &f))});
            }
        }
        Ok(obj! {"profils" => Json::Liste(out)})
    }

    pub(crate) fn profil_lire(&self, r: &Requete) -> Rendu {
        let nom = Self::profil_nom(r)?;
        let chemin = joindre(&self.dossier_profils(), &format!("{}.json", nom));
        match charger(&chemin) {
            Ok(Some(profil)) => Ok(profil),
            Ok(None) => Err(refus(422, "Profil illisible : ce n'est pas du JSON")),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Err(refus(404, format!("Aucun profil pour « {} »", nom))),
            Err(e) => Err(refus(500, format!("Profil illisible : {}", errno(&e, &chemin)))),
        }
    }

    pub(crate) fn profil_ecrire(&self, r: &mut Requete) -> Rendu {
        // le corps d'abord : un nom refuse ne doit pas laisser la requete a
        // moitie lue dans la connexion
        let Corps { json: mut charge, brise } = Self::corps_json(r, MAX_PROFIL, "Profil trop volumineux")?;
        let nom = Self::profil_nom(r)?;
        let Json::Objet(o) = &mut charge else { return Err(refus(400, "Ce n'est pas un profil (format attendu : cao-profil-1)")) };
        if o.get("format").and_then(Json::as_str) != Some("cao-profil-1") {
            return Err(refus(400, "Ce n'est pas un profil (format attendu : cao-profil-1)"));
        }
        let dos = self.dossier_profils();
        std::fs::create_dir_all(&dos).map_err(|e| refus(500, format!("Dossier profils/ impossible a creer : {}", errno(&e, &dos))))?;
        o.insert("nom".into(), nom.as_str().into());
        let t = o.get("t").cloned().unwrap_or(Json::Entier(0));
        let chemin = joindre(&dos, &format!("{}.json", nom));
        if brise {
            return Err(refus(400, "Profil : contenu impossible a ecrire en JSON UTF-8"));
        }
        // ecriture en deux temps : une coupure de courant au mauvais moment
        // laisse l'ancien profil entier plutot qu'un fichier a moitie ecrit
        ecrire_atomique(&chemin, dumps_indente(&charge, 1).as_bytes()).map_err(|e| refus(500, format!("Profil non enregistre : {}", errno(&e, &chemin))))?;
        Ok(obj! {"ok" => true, "nom" => nom, "t" => t})
    }

    pub(crate) fn profil_effacer(&self, r: &Requete) -> Rendu {
        let nom = Self::profil_nom(r)?;
        let chemin = joindre(&self.dossier_profils(), &format!("{}.json", nom));
        match std::fs::remove_file(&chemin) {
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(refus(500, format!("Profil non supprime : {}", errno(&e, &chemin)))),
            _ => Ok(obj! {"ok" => true, "nom" => nom}), // deja parti : le resultat est celui voulu
        }
    }

    // ======================================================================
    // Dossiers de projet : un dossier, un fichier principal (projet.cao.json),
    // les documents a cote. La page d'accueil designe le dossier ; chaque outil
    // y lit et y reecrit le sien, et c'est ainsi que schema et carte restent lies.
    // ======================================================================
    /// Les racines declarees, sous lesquelles tout projet doit se trouver.
    ///
    /// Plusieurs, parce que les projets ne vivent pas tous au meme endroit -- un
    /// disque de travail, un dossier client. Elles se declarent au demarrage et
    /// nulle part ailleurs : c'est ce qui fait de cette liste une frontiere. Si le
    /// navigateur pouvait en ajouter une, il n'y aurait plus de frontiere du tout.
    pub fn racines(&self) -> Vec<String> {
        if self.racines_projets.is_empty() { vec![abspath(&joindre(&self.racine, PROJETS))] } else { self.racines_projets.clone() }
    }

    /// La racine par defaut : celle ou l'on cree quand rien n'est precise.
    pub fn racine_projets(&self) -> String {
        self.racines().remove(0)
    }

    /// La racine qui contient ce chemin, ou None s'il n'en a aucune.
    ///
    /// Le verdict se fonde sur realpath : un lien symbolique qui sortirait des
    /// racines est donc vu comme ce qu'il est, et refuse. C'est la vraie frontiere
    /// de securite -- les controles de nom, eux, ne font que donner des messages
    /// clairs.
    fn sous_racine(&self, chemin: &str) -> Option<String> {
        let cible = realpath(chemin);
        self.racines().into_iter().find(|racine| dessous(&cible, &realpath(racine)))
    }

    /// Ce que le navigateur designe -> dossier de projet, ou une erreur.
    ///
    /// On accepte un simple nom (« carte PIR »), un chemin relatif avec des
    /// sous-dossiers (« clients/acme/carte PIR ») et un chemin complet
    /// (« D:\projets\carte PIR ») : dire ou un projet se range est justement ce
    /// qu'on veut pouvoir faire. Mais tape ou construit, il doit tomber sous une
    /// des racines declarees.
    ///
    /// `base` designe la racine visee pour un chemin relatif ; a defaut c'est la
    /// premiere. Elle doit elle-meme etre declaree -- sinon il suffirait de
    /// l'inventer pour sortir.
    pub fn chemin_projet(&self, brut: &str, base: Option<&str>) -> Result<String, Refus> {
        let brut = json::strip(brut).trim_matches('"');
        if brut.is_empty() {
            return Err(refus(400, "Aucun projet indique"));
        }
        if brut.chars().count() > 400 {
            return Err(refus(400, "Chemin de projet trop long"));
        }
        if brut.contains('\0') {
            return Err(refus(400, "Chemin de projet invalide"));
        }
        let mut depart = self.racine_projets();
        if let Some(base) = base {
            match self.sous_racine(base) {
                Some(d) if realpath(base) == realpath(&d) => depart = d,
                _ => return Err(refus(403, format!("Racine inconnue : « {} ». Declarez-la au demarrage avec --projets.", base))),
            }
        }
        let etendu = expanduser(brut);
        let absolu = std::path::Path::new(&etendu).is_absolute();
        let dossier = abspath(&if absolu { etendu } else { joindre(&depart, &etendu) });
        let mut racine = self.sous_racine(&dossier);
        // Lance par WEB_SUITE, un projet ne vit que sous PROJETS/CAO : c'est le
        // seul dossier que le lanceur envoie sur GitHub, et « Enregistrer » y est
        // la seule sauvegarde. Un chemin tape ailleurs ne serait jamais envoye.
        if racine.is_none() && self.lanceur_port().is_some() {
            return Err(refus(
                403,
                format!("Lance par WEB_SUITE : les projets vivent dans {} (le dossier envoye sur GitHub). Ouvrez ou creez le projet la.", self.racines().join(" ; ")),
            ));
        }
        if racine.is_none() && self.projets_ouvert && absolu {
            // Un chemin complet TAPE hors des racines (« D:\clients\carte PIR ») est
            // accepte en ecoute locale, pour CET appel seulement : son dossier
            // parent sert de racine le temps de la verification. On n'ajoute RIEN
            // aux racines -- sinon la premiere racine ajoutee remplacait la
            // racine par defaut (liste vide jusque-la), et chaque chemin tape
            // elargissait durablement la frontiere (jusqu'a « C:\ »).
            let parent = dirname(&dossier);
            if parent.is_empty() || parent == dossier {
                return Err(refus(400, format!("Un projet ne peut pas etre la racine d'un disque : « {} »", dossier)));
            }
            racine = Some(parent);
        }
        let Some(racine) = racine else {
            return Err(refus(403, format!("Hors des racines declarees : refuse. Racines : {}", self.racines().join(" ; "))));
        };
        // Chaque element du chemin doit etre un nom acceptable : le confinement
        // suffirait a la surete, mais un « .. » avale en silence rendrait le
        // message incomprehensible le jour ou il faudra le lire.
        let reste = relpath(&dossier, &abspath(&racine));
        if reste != "." {
            for part in reste.split(['/', std::path::MAIN_SEPARATOR]) {
                if nom_projet(part).is_none() {
                    return Err(refus(400, format!("Element de chemin invalide : « {} »", part)));
                }
            }
        }
        Ok(dossier)
    }

    /// Ces routes n'existent que sur une ecoute locale.
    ///
    /// Ecrire sur le disque a la demande du navigateur est deja beaucoup ;
    /// l'offrir au reseau serait offrir le disque. Le refus dit quoi faire.
    /// Exception : --projets-reseau, confine aux racines declarees ; `reseau`
    /// a faux la refuse quand meme (datasheets : telechargement cote serveur).
    pub(crate) fn projet_garde(&self, reseau: bool) -> Result<(), Refus> {
        if self.projets_ouvert || (reseau && self.projets_reseau) {
            return Ok(());
        }
        Err(refus(403, "Dossiers de projet refuses : ce serveur ecoute sur le reseau. Relancez-le avec --local pour ouvrir cette route."))
    }

    fn projet_dossier(&self, r: &Requete) -> Result<String, Refus> {
        self.projet_garde(true)?;
        let brut = r.param("chemin").or_else(|| r.param("nom")).unwrap_or_default();
        // « racine » dit sous laquelle des racines declarees ranger un chemin
        // relatif ; elle doit etre declaree, sinon l'inventer suffirait a sortir
        self.chemin_projet(&brut, r.param("racine").as_deref())
    }

    fn projet_outil(r: &Requete) -> Result<String, Refus> {
        let outil = param(r, "doc");
        if suffixe(&outil).is_empty() {
            // La liste attendue se lit dans la table : un outil de plus ne
            // doit pas laisser un message qui en annonce deux.
            let attendus: Vec<&str> = PROJET_SUFFIXE.iter().map(|(o, _)| *o).collect();
            return Err(refus(400, format!("Document inconnu : « {} » (attendu : {})", outil, attendus.join(", "))));
        }
        Ok(outil)
    }

    fn projet_corps(r: &mut Requete) -> Result<Corps, Refus> {
        Self::corps_json(r, MAX_PROJET, "Fichier trop volumineux")
    }

    fn projet_fichier_lire(chemin: &str, quoi: &str) -> Rendu {
        match charger(chemin) {
            Ok(Some(v)) => Ok(v),
            Ok(None) => Err(refus(422, format!("{} : ce n'est pas du JSON", quoi))),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Err(refus(404, format!("{} : introuvable", quoi))),
            Err(e) => Err(refus(500, format!("{} : illisible ({})", quoi, errno(&e, chemin)))),
        }
    }

    fn projet_fichier_ecrire(chemin: &str, charge: &Corps, quoi: &str, creer: bool) -> Result<(), Refus> {
        let dossier = dirname(chemin);
        std::fs::create_dir_all(&dossier).map_err(|e| refus(500, format!("Dossier impossible a creer : {}", errno(&e, &dossier))))?;
        if charge.brise {
            return Err(refus(400, format!("{} : contenu impossible a ecrire en JSON UTF-8", quoi)));
        }
        // ecriture en deux temps, comme pour les profils : une coupure de
        // courant laisse l'ancien fichier entier plutot qu'un fichier a
        // moitie ecrit -- et un schema a moitie ecrit, c'est du travail perdu
        let texte = dumps_indente(&charge.json, 1);
        let fait = if creer { ecrire_exclusif(chemin, texte.as_bytes()) } else { ecrire_atomique(chemin, texte.as_bytes()) };
        fait.map_err(|e| match e.kind() {
            std::io::ErrorKind::AlreadyExists => refus(409, format!("{} existe deja : ce nom de projet est pris", quoi)),
            _ => refus(500, format!("{} : non enregistre ({})", quoi, errno(&e, chemin))),
        })
    }

    fn projet_charge(dossier: &str) -> Rendu {
        Self::projet_fichier_lire(&joindre(dossier, PROJET_FICHIER), &format!("Le fichier projet ({})", PROJET_FICHIER))
    }

    /// Le fichier d'un outil dans ce dossier.
    ///
    /// projet.cao.json a le dernier mot : c'est lui qui fait le lien. A
    /// defaut de declaration lisible, le nom se deduit du projet -- un
    /// dossier prepare a la main reste donc utilisable.
    ///
    /// `lire` autorise un dernier repli, et seulement en lecture : si le nom
    /// attendu ne designe rien, on prend le premier fichier du dossier qui
    /// porte le suffixe de l'outil. Un projet renomme, ou un dossier rempli a
    /// la main, s'ouvre ainsi au lieu de paraitre vide -- mais on n'ecrit
    /// jamais sur un fichier trouve de cette facon : ce qu'on ecrit porte le
    /// nom canonique.
    fn projet_doc_chemin(dossier: &str, outil: &str, charge: &Json, lire: bool) -> String {
        let suff = suffixe(outil);
        // Le nom declare doit porter le suffixe de l'outil : sans cela, un
        // projet.cao.json pose dans n'importe quel dossier designait n'importe
        // quel .json (settings.json d'un editeur...) en lecture et en ecriture.
        let declare = charge["fichiers"].as_objet().and_then(|f| f.get(outil)).and_then(|v| nom_fichier_doc(&texte_ou_vide(v)));
        let nom = declare.filter(|n| n.to_lowercase().ends_with(&suff.to_lowercase())).unwrap_or_else(|| {
            let base = charge.as_objet().and_then(|o| nom_projet(&texte_ou_vide(o.get("nom").unwrap_or(&Json::Nul))));
            format!("{}{}", base.unwrap_or_else(|| basename(dossier.trim_end_matches(['/', std::path::MAIN_SEPARATOR])).to_string()), suff)
        });
        let chemin = joindre(dossier, &nom);
        if lire && !lisible(&chemin) {
            if let Some(trouve) = Self::projet_doc_trouver(dossier, outil) {
                return trouve;
            }
        }
        chemin
    }

    /// Le premier fichier du dossier qui porte le suffixe de l'outil.
    fn projet_doc_trouver(dossier: &str, outil: &str) -> Option<String> {
        let suff = suffixe(outil).to_lowercase();
        lister(dossier).ok()?.into_iter().filter(|e| e.to_lowercase().ends_with(&suff)).map(|e| (joindre(dossier, &e), e)).find(|(c, e)| nom_fichier_doc(e).is_some() && lisible(c)).map(|(c, _)| c)
    }

    /// Les projets, c'est ce que contiennent les racines declarees.
    ///
    /// Un dossier compte comme projet s'il porte un projet.cao.json ; le
    /// reste du disque n'est pas notre affaire. On explore les sous-dossiers
    /// jusqu'a une profondeur fixee : clients/acme/carte PIR, c'est un projet
    /// range dans sa filiere, et on veut qu'il remonte dans l'index.
    pub(crate) fn projets_index(&self) -> Rendu {
        self.projet_garde(true)?;
        let mut out = Vec::new();
        for racine in self.racines() {
            explorer_projets(&racine, &racine, 0, &mut out);
        }
        out.sort_by_cached_key(|p| (-p["t"].as_i64().unwrap_or(0), p["chemin"].as_str().unwrap_or("").to_lowercase()));
        Ok(obj! {"racines" => Json::Liste(self.racines().into_iter().map(Json::from).collect()), "projets" => Json::Liste(out)})
    }

    pub(crate) fn projet_lire(&self, r: &Requete) -> Rendu {
        let dossier = self.projet_dossier(r)?;
        let charge = Self::projet_charge(&dossier)?;
        let mut etat = Objet::new();
        for (outil, _) in PROJET_SUFFIXE {
            let chemin = Self::projet_doc_chemin(&dossier, outil, &charge, true);
            etat.insert(outil.into(), obj! {"fichier" => basename(&chemin), "present" => lisible(&chemin), "modifie" => mtime_ms(&chemin)});
        }
        let sauve = derniere_sauvegarde(&dossier);
        Ok(obj! {"projet" => charge, "dossier" => dossier, "documents" => Json::Objet(etat), "sauve" => sauve})
    }

    pub(crate) fn projet_ecrire(&self, r: &mut Requete) -> Rendu {
        // le corps d'abord : un chemin refuse ne doit pas laisser la requete a
        // moitie lue dans la connexion
        let charge = Self::projet_corps(r)?;
        let dossier = self.projet_dossier(r)?;
        if charge.json["format"].as_str() != Some(PROJET_FORMAT) {
            return Err(refus(400, format!("Ce n'est pas un fichier projet (format attendu : {})", PROJET_FORMAT)));
        }
        if nom_projet(&texte_ou_vide(&charge.json["nom"])).is_none() {
            return Err(refus(400, "Le fichier projet n'a pas de nom valide"));
        }
        // creer=1 (creation depuis l'accueil) : jamais d'ecrasement d'un projet existant, 409
        Self::projet_fichier_ecrire(&joindre(&dossier, PROJET_FICHIER), &charge, "Le fichier projet", param(r, "creer") == "1")?;
        Ok(obj! {"ok" => true, "dossier" => dossier, "nom" => charge.json["nom"].clone()})
    }

    /// `brouillon=1` : la route vise le brouillon du document, jamais le
    /// document lui-meme. Son nom derive du nom canonique (sans le repli en
    /// lecture) : meme dossier, memes gardes.
    fn projet_brouillon(r: &Requete) -> bool {
        param(r, "brouillon") == "1"
    }

    pub(crate) fn projet_doc_lire(&self, r: &Requete) -> Rendu {
        let dossier = self.projet_dossier(r)?;
        let outil = Self::projet_outil(r)?;
        let charge = Self::projet_charge(&dossier)?;
        let chemin = if Self::projet_brouillon(r) {
            chemin_brouillon(&Self::projet_doc_chemin(&dossier, &outil, &charge, false))
        } else {
            Self::projet_doc_chemin(&dossier, &outil, &charge, true)
        };
        let document = Self::projet_fichier_lire(&chemin, &format!("Le document {}", outil))?;
        Ok(obj! {"document" => document, "fichier" => basename(&chemin), "modifie" => mtime_ms(&chemin)})
    }

    pub(crate) fn projet_doc_ecrire(&self, r: &mut Requete) -> Rendu {
        let charge = Self::projet_corps(r)?;
        let dossier = self.projet_dossier(r)?;
        let outil = Self::projet_outil(r)?;
        if charge.json.as_objet().is_none() {
            return Err(refus(400, "Document illisible"));
        }
        // le fichier projet est l'ancre : sans lui, ce dossier n'est pas un
        // projet et on n'y ecrit pas de document
        let mut chemin = Self::projet_doc_chemin(&dossier, &outil, &Self::projet_charge(&dossier)?, false);
        // `modifie` : la date du fichier que la page a lu ou ecrit en dernier.
        // Si le fichier a change depuis (autre onglet, tablette, export vers
        // le PCB), 409 : la page demande avant d'ecraser. Sans parametre,
        // ecriture forcee (« ecraser quand meme »).
        let mut vu = param(r, "modifie");
        if Self::projet_brouillon(r) {
            (chemin, vu) = (chemin_brouillon(&chemin), String::new()); // pas de 409 : il n'est qu'a cette page
        }
        let _tenu = verrou(&self.verrou_docs);
        if !vu.is_empty() && vu.bytes().all(|c| c.is_ascii_digit()) && lisible(&chemin) && vu.parse::<i64>().ok() != Some(mtime_ms(&chemin)) {
            return Err(refus(409, format!("Le document {} a ete modifie ailleurs depuis sa lecture", outil)));
        }
        Self::projet_fichier_ecrire(&chemin, &charge, &format!("Le document {}", outil), false)?;
        Ok(obj! {"ok" => true, "fichier" => basename(&chemin), "modifie" => mtime_ms(&chemin)})
    }

    /// Efface le brouillon, apres un enregistrement. Seul le brouillon
    /// s'efface par cette route : le document, jamais. Absent, ce n'est pas
    /// une erreur.
    pub(crate) fn projet_doc_effacer(&self, r: &Requete) -> Rendu {
        let dossier = self.projet_dossier(r)?;
        let outil = Self::projet_outil(r)?;
        if !Self::projet_brouillon(r) {
            return Err(refus(405, "Seul le brouillon d'un document s'efface (brouillon=1)"));
        }
        let chemin = chemin_brouillon(&Self::projet_doc_chemin(&dossier, &outil, &Self::projet_charge(&dossier)?, false));
        let _tenu = verrou(&self.verrou_docs);
        match std::fs::remove_file(&chemin) {
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(refus(500, format!("Brouillon {} non efface ({})", outil, errno(&e, &chemin)))),
            _ => Ok(obj! {"ok" => true}),
        }
    }

    // ======================================================================
    // Envoi sur GitHub, relaye au lanceur WEB_SUITE
    // ----------------------------------------------------------------------
    // Le lanceur exige son jeton de tout autre appareil que ce poste : sans
    // cela, n'importe qui sur le reseau pousserait sur GitHub avec les
    // identifiants du poste. Le relai exige donc le meme jeton, que la tablette
    // porte deja : le cookie pose par le lanceur vaut pour tout l'hote, et le
    // navigateur l'envoie aussi a ce port-ci.
    // ======================================================================
    fn github_garde(&self, r: &Requete) -> Result<u16, Refus> {
        let Some(port) = self.lanceur_port() else {
            return Err(refus(404, "Envoi sur GitHub indisponible : cet outil n'a pas ete lance par WEB_SUITE."));
        };
        self.projet_garde(true)?;
        if self.client_local(r) {
            return Ok(port);
        }
        let recu = appairage::biscuit_recu(r, BISCUIT_LANCEUR).unwrap_or_default();
        if self.jeton_lanceur.is_empty() || recu.is_empty() || !appairage::egal(&recu, &self.jeton_lanceur) {
            return Err(refus(
                403,
                "Envoi sur GitHub refuse : ouvrez d'abord, sur cet appareil, l'adresse Reseau du lanceur WEB_SUITE (elle se termine par ?jeton=...).",
            ));
        }
        Ok(port)
    }

    fn github_relai(port: u16, chemin: &str, charge: &Json) -> Rendu {
        let (code, texte) = poster(port, chemin, &ascii(dumps(charge))).map_err(|exc| refus(502, format!("Lanceur WEB_SUITE injoignable : {}", exc)))?;
        let rep = match json::loads(&texte) {
            Ok(rep @ Json::Objet(_)) => rep,
            _ => return Err(refus(502, "Reponse illisible du lanceur WEB_SUITE")),
        };
        if code != 200 {
            let pourquoi = if rep["erreur"].vrai() { str_py(&rep["erreur"]) } else { code.to_string() };
            return Err(refus(502, format!("Le lanceur WEB_SUITE refuse : {}", pourquoi)));
        }
        Ok(obj! {"ok" => rep["ok"].vrai(), "identite" => rep["identite"].vrai(), "message" => texte_ou_vide(&rep["message"])})
    }

    /// Mode WEB_SUITE et envoi possible d'ici.
    ///
    /// `suite` dit que le lanceur a demarre cet outil : l'editeur n'offre
    /// alors qu'une sauvegarde, dans le projet puis sur GitHub, meme si
    /// l'envoi est refuse a cet appareil (`disponible` faux, `detail` dit
    /// pourquoi) -- le refus s'affiche a l'enregistrement, sans repli sur un
    /// telechargement. Sans lanceur, `suite` faux : chaque page pose la
    /// question au chargement, un 404 la faisait passer pour une panne.
    pub(crate) fn github_etat(&self, r: &Requete) -> Json {
        if self.lanceur_port().is_none() {
            return obj! {"suite" => false, "disponible" => false,
            "detail" => "Envoi sur GitHub indisponible : cet outil n'a pas ete lance par WEB_SUITE."};
        }
        match self.github_garde(r) {
            Err(exc) => obj! {"suite" => true, "disponible" => false, "detail" => exc.message},
            Ok(_) => obj! {"suite" => true, "disponible" => true},
        }
    }

    pub(crate) fn github_envoyer(&self, r: &mut Requete) -> Rendu {
        let charge = Self::projet_corps(r)?.json;
        let port = self.github_garde(r)?;
        let message: String = texte_ou_vide(&charge["message"]).chars().take(500).collect();
        Self::github_relai(port, "/api/envoyer", &obj! {"id" => "web_cao", "message" => message})
    }

    pub(crate) fn github_identite(&self, r: &mut Requete) -> Rendu {
        let charge = Self::projet_corps(r)?.json;
        let port = self.github_garde(r)?;
        if charge.as_objet().is_none() {
            return Err(refus(400, "Corps JSON attendu"));
        }
        Self::github_relai(port, "/api/identite", &obj! {"nom" => texte_ou_vide(&charge["nom"]), "email" => texte_ou_vide(&charge["email"])})
    }
}

/// Parcourt recursivement un dossier pour trouver les projets.
pub fn explorer_projets(racine: &str, courant: &str, niveau: usize, accumule: &mut Vec<Json>) {
    if niveau > PROJETS_PROFONDEUR {
        return;
    }
    // dossier illisible (droits) ou racine absente : les autres projets restent listes
    for entree in lister(courant).unwrap_or_default() {
        let chemin = joindre(courant, &entree);
        // ni dossier cache (.git...) ni lien symbolique (il sortirait de la racine)
        let lien = std::fs::symlink_metadata(&chemin).is_ok_and(|m| m.file_type().is_symlink());
        if entree.starts_with('.') || lien || !est_dossier(&chemin) {
            continue;
        }
        let principal = joindre(&chemin, PROJET_FICHIER);
        if !lisible(&principal) {
            explorer_projets(racine, &chemin, niveau + 1, accumule);
            continue;
        }
        let relatif = relpath(&chemin, racine);
        // illisible ou pas un objet : liste sous son nom de dossier
        let nom = charger(&principal).ok().flatten().and_then(|p| nom_projet(&texte_ou_vide(p.as_objet()?.get("nom")?))).unwrap_or_else(|| relatif.clone());
        accumule.push(obj! {"nom" => nom, "chemin" => relatif, "racine" => racine, "t" => derniere_sauvegarde(&chemin)});
    }
}

/// Un POST JSON au lanceur, sur la boucle locale ; rend le code et le corps de sa reponse.
fn poster(port: u16, chemin: &str, corps: &str) -> std::io::Result<(u16, String)> {
    let delai = Duration::from_secs(DELAI_LANCEUR);
    let mut s = TcpStream::connect_timeout(&SocketAddr::from((Ipv4Addr::LOCALHOST, port)), delai)?;
    s.set_read_timeout(Some(delai))?;
    s.set_write_timeout(Some(delai))?;
    write!(
        s,
        "POST {} HTTP/1.0\r\nHost: 127.0.0.1:{}\r\nContent-Type: application/json\r\nX-WebSuite: 1\r\nContent-Length: {}\r\n\r\n{}",
        chemin,
        port,
        corps.len(),
        corps
    )?;
    let mut tout = Vec::new();
    s.read_to_end(&mut tout)?;
    let reponse = String::from_utf8_lossy(&tout);
    let invalide = || std::io::Error::new(std::io::ErrorKind::InvalidData, "reponse HTTP incomplete");
    let (tete, suite) = reponse.split_once("\r\n\r\n").ok_or_else(invalide)?;
    let code = tete.split(' ').nth(1).and_then(|c| c.parse().ok()).ok_or_else(invalide)?;
    Ok((code, suite.to_string()))
}

#[cfg(test)]
mod essais {
    use super::*;

    #[test]
    fn noms() {
        assert_eq!(nom_profil("  Pilou   le  Grand "), Some("Pilou le Grand".into()));
        for refuse in ["", ".", "..", ".cache", "a/b", "a\\b", "C:", "nul", "COM1", "fin.", "x\u{1}y", &"x".repeat(41)] {
            assert_eq!(nom_profil(refuse), None, "{:?}", refuse);
        }
        assert!(nom_projet(&"x".repeat(41)).is_some() && nom_projet(&"x".repeat(61)).is_none());
        assert_eq!(nom_fichier_doc(" carte-SCH.JSON "), Some("carte-SCH.JSON".into()));
        for refuse in ["", "a/b.json", ".x.json", "x.txt", "a:b.json"] {
            assert_eq!(nom_fichier_doc(refuse), None, "{:?}", refuse);
        }
        assert_eq!(chemin_brouillon("/p/carte-SCH.json"), "/p/carte-SCH.brouillon.json");
    }
}
