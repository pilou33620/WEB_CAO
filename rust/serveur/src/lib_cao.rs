//! Bibliothèques CAO (LIB) : le dossier actif, ses fichiers, le catalogue LIB_composants.csv.

use std::sync::LazyLock;

use regex::Regex;
use web_tools_commun::serveur::Requete;

use crate::chemins::*;
use crate::csv;
use crate::ecriture::{ecrire_atomique, ecrire_exclusif};
use crate::json::{self, dumps_indente, fmt_g, str_py, strip, Json, Objet};
use crate::obj;
use crate::poste::{interne, param, refus, verrou, Poste, Refus, Rendu, LIB_EXTENSIONS, STEP_EXTENSIONS};
use crate::projets::{lister, texte_ou_vide, NOM_INTERDIT};

const LIB_DIR_NAME: &str = "LIB";
// Le catalogue entier part dans un seul POST : ~560 composants a 39 colonnes
// pesent deja 300 Ko en JSON, cinq fois le plafond commun (MAX_CORPS, 64 Ko,
// taille pour les arguments d'outil). Sous ce plafond-la, « Enregistrer »
// echouait a chaque fois. Un BGA-256 ou un modele SPICE depassent eux aussi
// les 64 Ko des qu'ils grossissent un peu.
pub const MAX_LIB: usize = 16 * 1024 * 1024;
const LIB_CONFIG_FICHIER: &str = "config_lib.json";
const CATALOGUE: &str = "LIB_composants.csv";
// modele3d : maillages des modeles STEP de Models/ ; step : les modeles STEP
// eux-memes, que l'export STEP recopie (lecture seule)
const LIB_SOUS_DOSSIERS: [(&str, &[&str]); 5] =
    [("pcb", &["lib_empreinte_pcb"]), ("schematique", &["lib_empreinte_schematique"]), ("simulation", &["lib_simulation"]), ("modele3d", &["Models", "maillages"]), ("step", &["Models"])];

fn sous_dossier(base: &str, genre: &str) -> String {
    let morceaux = LIB_SOUS_DOSSIERS.iter().find(|(g, _)| *g == genre).map_or(&[][..], |(_, m)| m);
    morceaux.iter().fold(base.to_string(), |c, m| joindre(&c, m))
}

/// Les fichiers (et non les dossiers) d'un dossier, dans l'ordre du système.
fn fichiers(rep: &str) -> std::io::Result<Vec<String>> {
    Ok(std::fs::read_dir(rep)?.filter_map(|e| e.ok()).filter(|e| e.path().is_file()).map(|e| e.file_name().to_string_lossy().into_owned()).collect())
}

/// open(chemin, "r", encoding="utf-8", errors="replace").read() : toute fin de ligne devient « \n ».
fn lire_texte(chemin: &str) -> std::io::Result<String> {
    let texte = String::from_utf8_lossy(&std::fs::read(chemin)?).into_owned();
    Ok(if texte.contains('\r') { texte.replace("\r\n", "\n").replace('\r', "\n") } else { texte })
}

/// C/ESR/ESL d'un condensateur Murata, ou L/DCR d'une self, lus dans son .sub.
///
/// UN MLCC est une ECHELLE d'etages en serie de Port1 a Port2, chaque etage
/// un groupe C / L / R en parallele entre deux noeuds : C01 (C nominale, et
/// sa fuite R01), L02, R03, puis des etages L||R, C||R, C||L||R. Sous la
/// resonance, la self d'un etage court-circuite ce qui lui est parallele :
/// l'ESL est la SOMME des L de l'echelle -- L02 seul n'en est parfois qu'un
/// dixieme. L'ESR est la partie reelle de l'echelle entiere a
/// f0 = 1 / (2 pi racine(C01 ESL)) : R03 plus ce que les etages R||L et R||C
/// y ajoutent. Les deux suivent la resonance et le |Z| min de l'echelle
/// complete a 10 % pres (sauf quelques pF, dont les etages hauts resonnent
/// pres de f0). UNE LQW (branches L-R en parallele) garde L2 (L) et R2 (DCR),
/// sa branche principale. Un modele generique ({C}, {L}) ne donne rien : None.
pub fn parasites_spice(texte: &str) -> Option<Json> {
    static LIGNE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^\s*([CLR]\w*)\s+(\S+)\s+(\S+)\s+([-+]?[0-9.]+(?:[eE][-+]?[0-9]+)?)\s*$").unwrap());
    let mut v: Vec<(String, f64)> = Vec::new();
    let mut etages: Vec<((String, String), Vec<(char, f64)>)> = Vec::new();
    for ligne in texte.lines() {
        let Some(m) = LIGNE.captures(ligne) else { continue };
        let Ok(x) = m[4].parse::<f64>() else { continue };
        let nom = m[1].to_uppercase();
        let (a, b) = (m[2].to_uppercase(), m[3].to_uppercase());
        let noeuds = if a <= b { (a, b) } else { (b, a) };
        match etages.iter_mut().find(|(n, _)| *n == noeuds) {
            Some((_, groupe)) => groupe.push((nom.chars().next().unwrap_or('R'), x)),
            None => etages.push((noeuds, vec![(nom.chars().next().unwrap_or('R'), x)])),
        }
        if !v.iter().any(|(n, _)| *n == nom) {
            v.push((nom, x));
        }
    }
    let val = |nom: &str| v.iter().find(|(n, _)| n == nom).map(|(_, x)| *x);
    if let (Some(c01), Some(_), Some(r03)) = (val("C01"), val("L02"), val("R03")) {
        let esl = ipc2581::py::sum(etages.iter().flat_map(|(_, g)| g).filter(|(k, x)| *k == 'L' && *x > 0.0).map(|(_, x)| *x));
        if !(c01 > 0.0 && esl > 0.0) {
            return Some(obj! {"c" => c01, "esl" => esl, "esr" => r03});
        }
        let w = (c01 * esl).powf(-0.5);
        let mut z_re = 0.0;
        for (_, g) in &etages {
            // l'admittance de l'etage : j w C, 1 / (j w L), 1 / R
            let (mut re, mut im) = (0.0, 0.0);
            for (k, x) in g.iter().filter(|(_, x)| *x > 0.0) {
                match k {
                    'C' => im += w * x,
                    'L' => im -= 1.0 / (w * x),
                    _ => re += 1.0 / x,
                }
            }
            if re != 0.0 || im != 0.0 {
                z_re += re / (re * re + im * im);
            }
        }
        let g3 = |x: f64| fmt_g(x, 3).parse::<f64>().unwrap_or(x);
        return Some(obj! {"c" => c01, "esl" => g3(esl), "esr" => g3(z_re)});
    }
    match (val("L2"), val("R2")) {
        (Some(l), Some(dcr)) => Some(obj! {"l" => l, "dcr" => dcr}),
        _ => None,
    }
}

/// {REFERENCE: parasites} pour chaque modele fabricant de lib_simulation.
///
/// Relu a chaque appel (une centaine de petits fichiers) : un .sub ajoute a
/// la bibliotheque compte au calcul suivant, sans table a regenerer.
fn parasites_lib(rep: &str) -> Json {
    let mut res = Objet::new();
    for f in lister(rep).unwrap_or_default() {
        let p = std::path::Path::new(&f);
        let ext = p.extension().map(|e| e.to_string_lossy().to_lowercase());
        if !matches!(ext.as_deref(), Some("sub" | "mod")) {
            continue;
        }
        let Ok(texte) = lire_texte(&joindre(rep, &f)) else { continue };
        if let Some(parasites) = parasites_spice(&texte) {
            res.insert(p.file_stem().unwrap_or_default().to_string_lossy().to_uppercase(), parasites);
        }
    }
    Json::Objet(res)
}

/// Copie la structure par defaut de la LIB (CSV, empreintes, symboles) dans cible.
fn initialiser_lib_dans_dossier(source: &str, cible: &str) -> std::io::Result<i64> {
    if !existe(source) {
        return Ok(0);
    }
    std::fs::create_dir_all(cible)?;
    let mut copies = 0;
    let mut copier = |src: String, dst: String| -> std::io::Result<()> {
        if std::path::Path::new(&src).is_file() && !existe(&dst) {
            std::fs::copy(&src, &dst)?;
            copies += 1;
        }
        Ok(())
    };
    copier(joindre(source, CATALOGUE), joindre(cible, CATALOGUE))?;
    for (genre, _) in LIB_SOUS_DOSSIERS {
        let (src_rep, dst_rep) = (sous_dossier(source, genre), sous_dossier(cible, genre));
        std::fs::create_dir_all(&dst_rep)?;
        if est_dossier(&src_rep) {
            for f in fichiers(&src_rep)? {
                copier(joindre(&src_rep, &f), joindre(&dst_rep, &f))?;
            }
        }
    }
    Ok(copies)
}

/// Calcule les statistiques et l'etat d'un dossier de bibliotheque : (existe, statistiques).
fn statistiques_lib(dossier: &str) -> (bool, Json) {
    let present = !dossier.is_empty() && existe(dossier);
    let mut stats = Objet::new();
    for cle in ["composants", "pcb", "schematique", "simulation", "modele3d"] {
        stats.insert(cle.into(), Json::Entier(0));
    }
    stats.insert("csv_present".into(), false.into());
    if present && est_dossier(dossier) {
        let csv_path = joindre(dossier, CATALOGUE);
        if existe(&csv_path) {
            stats.insert("csv_present".into(), true.into());
            if let Ok(texte) = lire_texte(&csv_path) {
                let lignes = texte.split('\n').filter(|l| !strip(l).is_empty()).count();
                stats.insert("composants".into(), Json::from(lignes.saturating_sub(1)));
            }
        }
        for (genre, _) in LIB_SOUS_DOSSIERS {
            let rep = sous_dossier(dossier, genre);
            if est_dossier(&rep) {
                if let Ok(f) = fichiers(&rep) {
                    stats.insert(genre.into(), Json::from(f.len()));
                }
            }
        }
    }
    (present, Json::Objet(stats))
}

/// Une case du catalogue telle qu'elle s'ecrit : sans formule de tableur ni caractere invisible.
/// Une description peut garder deux lignes (champ entre guillemets).
fn valeur_catalogue(k: &str, v: &Json) -> Result<String, Refus> {
    static CONTROLE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"[\x00-\x09\x0b\x0c\x0e-\x1f\x7f]").unwrap());
    static FORMULE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^\s*([=@]|[+-]\s*[A-Za-z(])").unwrap());
    static INVISIBLE: LazyLock<Regex> =
        LazyLock::new(|| Regex::new("[\u{80}-\u{9f}\u{a0}\u{ad}\u{200b}-\u{200f}\u{2028}-\u{202e}\u{2060}-\u{206f}\u{feff}]").unwrap());
    if !matches!(v, Json::Texte(_) | Json::Entier(_) | Json::GrandEntier(_) | Json::Flottant(_)) {
        return Err(refus(400, format!("Colonne « {} » : texte attendu", k)));
    }
    let v = str_py(v).replace('\u{a0}', " "); // espace insecable (Excel, texte de distributeur) : une espace
    if v.chars().count() > 500 || CONTROLE.is_match(&v) {
        return Err(refus(400, format!("Colonne « {} » : 500 caracteres au plus, sans caractere de controle", k)));
    }
    if FORMULE.is_match(&v) {
        return Err(refus(400, format!("Colonne « {} » : commence comme une formule de tableur", k)));
    }
    if INVISIBLE.is_match(&v) {
        return Err(refus(400, format!("Colonne « {} » : caractere invisible ou de controle Unicode", k)));
    }
    Ok(v)
}

/// L'encodage du catalogue sur le disque : Excel l'enregistre en cp1252.
#[derive(Clone, Copy, PartialEq)]
enum Encodage {
    Utf8,
    Cp1252,
    Latin1,
}

// 0x80 à 0x9F de cp1252 ; 0 : octet sans caractère (le décodage échoue, comme en Python)
const CP1252: [u16; 32] = [
    0x20AC, 0, 0x201A, 0x0192, 0x201E, 0x2026, 0x2020, 0x2021, 0x02C6, 0x2030, 0x0160, 0x2039, 0x0152, 0, 0x017D, 0, 0, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022,
    0x2013, 0x2014, 0x02DC, 0x2122, 0x0161, 0x203A, 0x0153, 0, 0x017E, 0x0178,
];

impl Encodage {
    fn nom(self) -> &'static str {
        match self {
            Encodage::Utf8 => "utf-8",
            Encodage::Cp1252 => "cp1252",
            Encodage::Latin1 => "latin1",
        }
    }

    /// Le texte du catalogue : utf-8-sig, puis cp1252, puis latin1 (qui ne refuse rien).
    fn decoder(brut: &[u8]) -> (String, Encodage) {
        if let Ok(t) = std::str::from_utf8(brut) {
            return (t.strip_prefix('\u{feff}').unwrap_or(t).to_string(), Encodage::Utf8);
        }
        let cp1252: Option<String> = brut
            .iter()
            .map(|&o| match o {
                0x80..=0x9F => char::from_u32(CP1252[(o - 0x80) as usize] as u32).filter(|c| *c != '\0'),
                o => Some(o as char),
            })
            .collect();
        match cp1252 {
            Some(t) => (t, Encodage::Cp1252),
            None => (brut.iter().map(|&o| o as char).collect(), Encodage::Latin1),
        }
    }

    fn encoder(self, texte: &str) -> Option<Vec<u8>> {
        match self {
            Encodage::Utf8 => Some(texte.as_bytes().to_vec()),
            Encodage::Latin1 => texte.chars().map(|c| u8::try_from(c as u32).ok()).collect(),
            Encodage::Cp1252 => texte
                .chars()
                .map(|c| match c as u32 {
                    n @ (0..=0x7F | 0xA0..=0xFF) => Some(n as u8),
                    n => CP1252.iter().position(|&u| u as u32 == n && u != 0).map(|i| 0x80 + i as u8),
                })
                .collect(),
        }
    }
}

type LignesCatalogue<'a> = (Vec<&'a str>, Vec<csv::Ligne>, Vec<String>);

/// (physiques, lignes, colonnes) : les lignes physiques du texte, chacune avec sa fin, et les
/// lignes CSV non vides sous la forme (cellules, premiere physique, apres la derniere). On sait
/// ainsi lesquelles portent une ligne, meme si un champ entre guillemets court sur plusieurs.
fn catalogue_lignes(texte: &str) -> Result<LignesCatalogue<'_>, Refus> {
    let physiques = csv::physiques(texte);
    let lignes: Vec<csv::Ligne> = csv::lire(&physiques).into_iter().filter(|(r, _, _)| r.iter().any(|c| !strip(c).is_empty())).collect();
    let Some((entete, _, _)) = lignes.first() else { return Err(refus(500, "Catalogue sans en-tete")) };
    let colonnes = entete.iter().map(|c| strip(c).to_string()).collect();
    Ok((physiques, lignes, colonnes))
}

/// La ligne (cellules, debut, fin) dont la Part Name est `nom` (casse ignoree) ; 404 si
/// absente, 409 si elle est en double.
fn catalogue_viser<'a>(lignes: &'a [csv::Ligne], colonnes: &[String], nom: &str) -> Result<&'a csv::Ligne, Refus> {
    let i_nom = colonnes.iter().position(|c| c == "Part Name");
    let visees: Vec<&csv::Ligne> =
        lignes[1..].iter().filter(|l| i_nom.and_then(|i| l.0.get(i)).is_some_and(|c| strip(c).to_uppercase() == nom.to_uppercase())).collect();
    match visees.len() {
        0 => Err(refus(404, format!("« {} » n'est pas au catalogue", nom))),
        1 => Ok(visees[0]),
        n => Err(refus(409, format!("« {} » est {} fois au catalogue : a corriger dans Gestion LIB", nom, n))),
    }
}

/// La fin d'une ligne physique : ce qui suit son texte (« \r\n », « \n », rien).
fn fin_de(ligne: &str) -> &str {
    &ligne[ligne.trim_end_matches(['\r', '\n']).len()..]
}

impl Poste {
    /// Chemin absolu vers le fichier de persistance de la LIB.
    fn chemin_config_lib(&self) -> String {
        joindre(&self.racine, LIB_CONFIG_FICHIER)
    }

    /// La LIB par defaut : LIB/ a cote d'index.html si elle existe, sinon celle
    /// de WEB_SUITE, ../PROJETS/LIB_CAO -- la LIB suivie par git, dont le depot
    /// WEB_CAO ne garde plus de copie. Une seule LIB, ou que l'outil soit lance.
    pub fn dossier_lib_defaut(&self) -> String {
        if let Some(d) = &self.lib_defaut {
            return d.clone();
        }
        let propre = joindre(&self.racine, LIB_DIR_NAME);
        if est_dossier(&propre) {
            return propre;
        }
        let suite = joindre(&joindre(&dirname(&abspath(&self.racine)), "PROJETS"), "LIB_CAO");
        if est_dossier(&suite) { suite } else { propre }
    }

    /// Lit config_lib.json s'il existe pour restaurer le dossier personnalise de la LIB.
    fn charger_config_lib(&self) -> Option<String> {
        let cfg = self.chemin_config_lib();
        if self.lib_impose || !existe(&cfg) {
            return None;
        }
        let lu = std::fs::read_to_string(&cfg).map_err(|e| e.to_string()).and_then(|t| json::loads(&t));
        match lu {
            Ok(data @ Json::Objet(_)) => {
                let chemin = texte_ou_vide(&data["chemin"]);
                let chemin = strip(&chemin);
                (!chemin.is_empty() && existe(chemin)).then(|| abspath(chemin))
            }
            // Sans ce message, la LIB choisie était oubliée en silence et
            // l'outil repartait sur celle par défaut.
            autre => {
                println!("[!] {} illisible ({}) : LIB par defaut utilisee.", cfg, autre.err().unwrap_or_else(|| "objet JSON attendu".into()));
                None
            }
        }
    }

    /// Le dossier centralise LIB (personnalise, ou par defaut : dossier_lib_defaut).
    pub fn dossier_lib(&self) -> String {
        let mut actif = verrou(&self.lib_actif);
        if actif.is_none() {
            *actif = self.charger_config_lib();
        }
        actif.clone().unwrap_or_else(|| self.dossier_lib_defaut())
    }

    /// Enregistre le chemin de la LIB dans config_lib.json ou efface le fichier si par defaut.
    fn enregistrer_config_lib(&self, chemin: Option<&str>) -> Result<(), Refus> {
        let cfg = self.chemin_config_lib();
        let defaut = realpath(&self.dossier_lib_defaut());
        let Some(chemin) = chemin.filter(|c| !(existe(c) && realpath(c) == defaut)) else {
            let _ = std::fs::remove_file(&cfg);
            return Ok(());
        };
        let data = obj! {"chemin" => abspath(chemin), "date" => chrono::Local::now().format("%Y-%m-%dT%H:%M:%S%.6f").to_string()};
        ecrire_atomique(&cfg, dumps_indente(&data, 2).as_bytes()).map_err(|e| refus(500, format!("Impossible d'enregistrer config_lib.json : {}", errno(&e, &cfg))))
    }

    /// Change le dossier actif de la LIB, initialise si vide si demande, et persiste.
    ///
    /// persister=false : le choix vaut pour ce lancement seulement. C'est le cas
    /// de --lib, argument de ligne de commande : il ne doit pas survivre au
    /// processus en s'ecrivant dans config_lib.json, sans quoi le lancement
    /// suivant, sans --lib, continuait d'ouvrir ce dossier-la.
    pub fn definir_dossier_lib(&self, chemin_brut: &str, initialiser: bool, persister: bool) -> Rendu {
        let defaut = self.dossier_lib_defaut();
        let chemin = strip(chemin_brut).trim_matches('"');
        let poser = |actif: &str| *verrou(&self.lib_actif) = Some(actif.to_string());
        if chemin.is_empty() || ["defaut", "default", "standard"].contains(&chemin.to_lowercase().as_str()) {
            let actif = abspath(&defaut);
            poser(&actif);
            if persister {
                self.enregistrer_config_lib(None)?;
            }
            return Ok(obj! {"ok" => true, "chemin" => actif, "est_defaut" => true, "fichiers_copies" => 0i64,
            "message" => "Bibliotheque reinitialisee au dossier par defaut du depot."});
        }
        let minuscules = chemin.to_lowercase();
        if ["http://", "https://", "www."].iter().any(|p| minuscules.starts_with(p)) {
            return Err(refus(400, "Un lien web (URL) n'est pas un dossier : indiquez un chemin sur le disque."));
        }
        let cible = abspath(&expanduser(chemin));
        // /LIB/ sert ce dossier en statique : la racine d'un disque, ce serait
        // servir le disque entier
        if dirname(&cible) == cible {
            return Err(refus(400, format!("La bibliotheque ne peut pas etre la racine d'un disque : « {} »", cible)));
        }
        let mut copies = 0;
        if !existe(&cible) {
            if !initialiser {
                return Err(refus(404, format!("Le dossier « {} » n'existe pas.", cible)));
            }
            copies = initialiser_lib_dans_dossier(&defaut, &cible)
                .map_err(|e| refus(500, format!("Impossible de creer le dossier « {} » : {}", cible, errno(&e, &cible))))?;
        } else {
            if !est_dossier(&cible) {
                return Err(refus(400, format!("Le chemin « {} » n'est pas un dossier.", cible)));
            }
            if initialiser && !existe(&joindre(&cible, CATALOGUE)) {
                copies = initialiser_lib_dans_dossier(&defaut, &cible).map_err(interne)?;
            }
        }
        poser(&cible);
        if persister {
            self.enregistrer_config_lib(Some(&cible))?;
        }
        let mut message = format!("Bibliotheque configuree sur {}", cible);
        if copies > 0 {
            message += &format!(" ({} fichiers par defaut copies)", copies);
        }
        Ok(obj! {"ok" => true, "chemin" => cible.as_str(), "est_defaut" => realpath(&cible) == realpath(&defaut), "fichiers_copies" => copies, "message" => message})
    }

    /// Valide le genre et le nom de fichier pour eviter toute traversee de dossier.
    ///
    /// `creer` fabrique le sous-dossier s'il manque : utile a l'ecriture, pas a
    /// la lecture -- un GET n'a pas a creer de dossier. C'est aussi l'ecriture,
    /// et elle seule, qui est limitee a LIB_EXTENSIONS.
    pub fn chemin_lib_fichier(&self, genre: &str, nom_brut: &str, creer: bool) -> Result<String, Refus> {
        let genre_canon = match genre {
            "pcb" | "empreinte" => "pcb",
            "schematique" | "symbole" => "schematique",
            "simulation" | "modele3d" | "step" => genre,
            _ => return Err(refus(400, "Genre de bibliotheque invalide (attendu: pcb, schematique, simulation, modele3d, step)")),
        };
        let s = strip(nom_brut).replace('\\', "/");
        if s.split('/').any(|p| p == "..") || s.starts_with('/') {
            return Err(refus(400, "Nom de fichier invalide"));
        }
        let nom = basename(&s);
        if nom.is_empty() || nom == "." || NOM_INTERDIT.is_match(nom) {
            return Err(refus(400, "Nom de fichier invalide"));
        }
        if genre_canon == "step" && (creer || !STEP_EXTENSIONS.is_match(nom)) {
            return Err(refus(400, "Modele STEP : lecture seule, .stp ou .step"));
        }
        if creer && !LIB_EXTENSIONS.is_match(nom) {
            return Err(refus(400, format!("Extension refusee : « {} » (bibliotheque = fichiers de donnees : .json, .mod, .sub, .lib, .cir, .sp, .txt...)", nom)));
        }
        let rep = sous_dossier(&self.dossier_lib(), genre_canon);
        if creer {
            std::fs::create_dir_all(&rep).map_err(|e| interne(errno(&e, &rep)))?;
        }
        Ok(joindre(&rep, nom))
    }

    /// Corps JSON d'une route de bibliotheque.
    ///
    /// Son plafond est MAX_LIB et non MAX_CORPS : un catalogue trop gros ressortait en
    /// « Erreur interne » 500.
    fn lire_json_lib(&self, r: &mut Requete) -> Result<crate::poste::Corps, Refus> {
        Self::corps_json(r, self.max_lib, &format!("Requete trop grande ({} Mo au plus)", self.max_lib / (1024 * 1024)))
    }

    /// Ecrire dans la bibliotheque n'existe que sur une ecoute locale.
    ///
    /// Meme regle que les dossiers de projet : lire le catalogue et les
    /// empreintes reste ouvert (les editeurs d'un iPad en ont besoin), mais
    /// ecrire, effacer ou deplacer la bibliotheque -- /api/lib/config accepte
    /// un chemin quelconque du disque -- ne s'offre pas a un reseau sans mot
    /// de passe. --projets-reseau ouvre l'ecriture DANS la LIB active ; la
    /// deplacer (`reseau` a faux) reste local.
    fn lib_garde(&self, reseau: bool) -> Result<(), Refus> {
        if self.projets_ouvert || (reseau && self.projets_reseau) {
            return Ok(());
        }
        Err(refus(403, "Bibliotheque en lecture seule : ce serveur ecoute sur le reseau. Relancez-le avec --local pour la modifier."))
    }

    fn chemin_catalogue(&self) -> String {
        joindre(&self.dossier_lib(), CATALOGUE)
    }

    /// (chemin, octets, texte, encodage) du catalogue ; l'appelant tient verrou_catalogue.
    fn catalogue_brut(&self) -> Result<(String, Vec<u8>, String, Encodage), Refus> {
        let chemin = self.chemin_catalogue();
        if !existe(&chemin) {
            return Err(refus(404, "Fichier LIB_composants.csv introuvable"));
        }
        let brut = std::fs::read(&chemin).map_err(|e| interne(errno(&e, &chemin)))?;
        let (texte, enc) = Encodage::decoder(&brut);
        Ok((chemin, brut, texte, enc))
    }

    /// Lit LIB/LIB_composants.csv et renvoie colonnes + liste de composants en JSON.
    pub(crate) fn lib_composants_lire(&self) -> Rendu {
        let chemin = self.chemin_catalogue();
        // date du fichier lu : l'enregistrement complet la renvoie (409 si elle a change)
        let mtime = mtime_ms(&chemin);
        let (_, _, contenu, _) = self.catalogue_brut()?;
        // Pas de decoupage ligne a ligne : il coupait en deux une ligne dont
        // un champ entre guillemets contient un retour a la ligne, et tout ce
        // qui suivait changeait de colonne. Les lignes vides (dont celles
        // qu'ecrivait l'ancien enregistrement, en \r\r\n) sont ecartees
        // apres lecture.
        let mut lecteur = csv::lire(&csv::physiques(&contenu)).into_iter().map(|l| l.0).filter(|r| r.iter().any(|c| !strip(c).is_empty()));
        let colonnes: Vec<String> = lecteur.next().unwrap_or_default().iter().map(|c| strip(c).to_string()).collect();
        let mut composants = Vec::new();
        for (i, row) in lecteur.enumerate() {
            let mut item = Objet::new();
            for (j, col) in colonnes.iter().enumerate() {
                item.insert(col.clone(), row.get(j).map_or("", |c| strip(c)).into());
            }
            item.insert("_id".into(), Json::from(i));
            composants.push(Json::Objet(item));
        }
        let total = composants.len();
        Ok(obj! {"colonnes" => Json::Liste(colonnes.into_iter().map(Json::from).collect()), "composants" => Json::Liste(composants), "total" => total, "mtime_ms" => mtime})
    }

    /// Reecrit le catalogue dans son encodage d'origine (BOM compris).
    fn catalogue_ecrire(chemin: &str, brut: &[u8], enc: Encodage, neuf: &str) -> Result<(), Refus> {
        let prefixe = if brut.starts_with(b"\xef\xbb\xbf") { "\u{feff}" } else { "" };
        let Some(octets) = enc.encoder(&format!("{}{}", prefixe, neuf)) else {
            return Err(refus(400, format!("Un caractere ne passe pas dans l'encodage du catalogue ({})", enc.nom())));
        };
        ecrire_atomique(chemin, &octets).map_err(|e| refus(500, format!("Impossible d'ecrire {} : {}", chemin, errno(&e, chemin))))
    }

    /// Ecrit la liste des composants dans LIB/LIB_composants.csv.
    pub(crate) fn lib_composants_ecrire(&self, r: &mut Requete) -> Rendu {
        let corps = self.lire_json_lib(r)?;
        self.lib_garde(true)?;
        let Json::Objet(charge) = &corps.json else { return Err(refus(400, "Corps JSON invalide (objet attendu)")) };
        if let Some(demande) = charge.get("modifier") {
            return self.lib_composants_modifier(demande);
        }
        let Some(Json::Liste(composants)) = charge.get("composants") else { return Err(refus(400, "Liste de composants manquante ou invalide")) };
        // Une colonne oubliee par la liste ne doit pas effacer ce que portent
        // les composants (catalogue vide au depart : seule « Modele Simulation »
        // etait annoncee, et tout le reste partait).
        let mut colonnes: Vec<String> = charge.get("colonnes").and_then(Json::as_liste).map(|l| l.iter().map(|c| if matches!(c, Json::Nul) { String::new() } else { str_py(c) }).collect()).unwrap_or_default();
        for comp in composants.iter().filter_map(Json::as_objet) {
            let neuves: Vec<String> = comp.keys().filter(|k| !colonnes.contains(k) && !k.starts_with('_')).cloned().collect();
            colonnes.extend(neuves);
        }
        if colonnes.is_empty() {
            return Err(refus(400, "Colonnes non definies"));
        }
        let mut texte = csv::ecrire(&colonnes, "\r\n");
        for comp in composants.iter().filter_map(Json::as_objet) {
            let ligne: Result<Vec<String>, Refus> = colonnes.iter().map(|col| valeur_catalogue(col, comp.get(col).unwrap_or(&Json::Texte(String::new())))).collect();
            // dire quelle ligne : le catalogue en a des centaines
            let ligne = ligne.map_err(|exc| {
                let part: String = comp.get("Part Name").map(str_py).unwrap_or_default().chars().take(80).collect();
                refus(exc.code, format!("« {} » : {}", part, exc.message))
            })?;
            texte += &csv::ecrire(&ligne, "\r\n");
        }
        let dossier = self.dossier_lib();
        std::fs::create_dir_all(&dossier).map_err(|e| interne(errno(&e, &dossier)))?;
        let cible = joindre(&dossier, CATALOGUE);
        let _tenu = verrou(&self.verrou_catalogue); // deux enregistrements simultanes : la date se controle sous le verrou
        // `mtime_ms` : la date du catalogue que la page a lu. Il a change depuis (autre
        // appareil) : 409, sinon on effacerait ce changement. Sans
        // date (ancienne page, script), ecriture comme avant.
        if matches!(charge.get("mtime_ms"), Some(vu @ (Json::Entier(_) | Json::GrandEntier(_))) if vu.as_i64() != Some(mtime_ms(&cible))) {
            return Err(refus(409, "Le catalogue a ete modifie ailleurs depuis son chargement : rien n'est enregistre, recharge la page pour le reprendre"));
        }
        if corps.brise {
            return Err(refus(400, "Texte invalide (caractere non encodable en UTF-8)"));
        }
        let impossible = |e: std::io::Error| refus(500, format!("Impossible d'ecrire {} : {}", cible, errno(&e, &cible)));
        if existe(&cible) {
            // encodage et BOM d'origine gardes, comme pour une case : sans BOM,
            // Excel relit les accents en « Ã© ». Un caractere hors cp1252 : UTF-8 avec BOM.
            let (_, brut, _, enc) = self.catalogue_brut()?;
            match Self::catalogue_ecrire(&cible, &brut, enc, &texte) {
                Err(exc) if exc.code == 400 => ecrire_atomique(&cible, format!("\u{feff}{}", texte).as_bytes()).map_err(impossible)?,
                autre => autre?,
            }
        } else {
            ecrire_atomique(&cible, texte.as_bytes()).map_err(impossible)?;
        }
        Ok(obj! {"ok" => true, "total" => composants.len(), "message" => "Composants enregistres", "mtime_ms" => mtime_ms(&cible)})
    }

    /// Modifie des cases d'UNE reference existante : `champs` {colonne: valeur} remplace ces cases,
    /// les autres restent. `avant` {colonne: valeur} donne ce que le demandeur a lu : une case qui a
    /// change depuis est un refus (409, a relire), jamais un ecrasement a l'aveugle. La Part Name ne
    /// change pas (elle designe la ligne) ; une colonne absente de l'en-tete est refusee. Les autres
    /// lignes restent octet pour octet.
    fn lib_composants_modifier(&self, demande: &Json) -> Rendu {
        let vide = Objet::new();
        let (Some(part), Some(champs), Some(avant)) =
            (demande["part"].as_str(), demande["champs"].as_objet(), demande.get("avant").map_or(Some(&vide), Json::as_objet))
        else {
            return Err(refus(400, "« modifier » : {part, champs, avant} attendus"));
        };
        let nom = strip(part);
        if nom.is_empty() {
            return Err(refus(400, "« part » : la Part Name de la reference"));
        }
        if champs.is_empty() || champs.len() > 41 {
            return Err(refus(400, "« champs » : de 1 a 41 cases a modifier"));
        }
        if champs.keys().any(|k| strip(k).to_uppercase() == "PART NAME") {
            return Err(refus(400, "« Part Name » ne se modifie pas : elle designe la ligne"));
        }
        // un \r seul (hors \r\n) couperait la ligne : toute fin de ligne devient « \n »
        let mut valeurs = Objet::new();
        for (k, v) in champs {
            let v = valeur_catalogue(k, v)?.replace("\r\n", "\n").replace('\r', "\n");
            valeurs.insert(k.clone(), strip(&v).into());
        }
        let _tenu = verrou(&self.verrou_catalogue);
        let (chemin, brut, texte, enc) = self.catalogue_brut()?;
        let vu = mtime_ms(&chemin); // la page qui a lu cette date peut la suivre (pas de faux 409)
        let (mut physiques, lignes, colonnes) = catalogue_lignes(&texte)?;
        let rang = |k: &String| colonnes.iter().position(|c| c == k);
        let mut inconnues: Vec<&String> = valeurs.keys().chain(avant.keys()).filter(|k| rang(k).is_none()).collect();
        if !inconnues.is_empty() {
            inconnues.sort();
            inconnues.dedup();
            return Err(refus(400, format!("Colonne(s) inconnue(s) du catalogue : {}", inconnues.iter().map(|k| k.as_str()).collect::<Vec<_>>().join(", "))));
        }
        let (cellules, d, f) = catalogue_viser(&lignes, &colonnes, nom)?;
        let mut ligne = cellules.clone();
        ligne.resize(ligne.len().max(colonnes.len()), String::new());
        let changees: Vec<&str> = avant.iter().filter(|(k, v)| strip(&str_py(v)) != strip(&ligne[rang(k).unwrap_or(0)])).map(|(k, _)| k.as_str()).collect();
        if !changees.is_empty() {
            return Err(refus(409, format!("La reference a change depuis sa lecture ({}) : relis-la", changees.join(", "))));
        }
        for (k, v) in &valeurs {
            ligne[rang(k).unwrap_or(0)] = v.as_str().unwrap_or("").to_string();
        }
        // la ligne est ecrite avec la fin de ligne du fichier
        let fin = [fin_de(physiques[f - 1]), fin_de(physiques[0]), "\r\n"].into_iter().find(|f| !f.is_empty()).unwrap_or("\r\n");
        let neuve = csv::ecrire(&ligne, fin);
        physiques.splice(*d..*f, [neuve.as_str()]);
        Self::catalogue_ecrire(&chemin, &brut, enc, &physiques.concat())?;
        Ok(obj! {"ok" => true, "part" => nom, "champs" => Json::Objet(valeurs), "mtime_avant" => vu, "mtime_ms" => mtime_ms(&chemin)})
    }

    /// Liste les fichiers d'empreintes PCB, symboles schematiques et modeles de simulation.
    pub(crate) fn lib_fichiers_liste(&self) -> Json {
        let dossier = self.dossier_lib();
        let mut res = Objet::new();
        for genre in ["pcb", "schematique", "simulation"] {
            res.insert(genre.into(), Json::Liste(Vec::new()));
        }
        for (genre, _) in LIB_SOUS_DOSSIERS {
            let rep = sous_dossier(&dossier, genre);
            if existe(&rep) {
                let mut noms = fichiers(&rep).unwrap_or_default();
                noms.sort_by_cached_key(|n| n.to_lowercase());
                res.insert(genre.into(), Json::Liste(noms.into_iter().map(Json::from).collect()));
            }
        }
        Json::Objet(res)
    }

    /// C/ESR/ESL et L/DCR des modeles fabricant, pour le calcul PDN.
    pub(crate) fn lib_parasites(&self) -> Json {
        parasites_lib(&sous_dossier(&self.dossier_lib(), "simulation"))
    }

    /// Lit un fichier individuel d'empreinte ou de modele.
    pub(crate) fn lib_fichier_lire(&self, r: &Requete) -> Rendu {
        let (genre, mut nom) = (param(r, "type"), param(r, "nom"));
        if genre.is_empty() || nom.is_empty() {
            return Err(refus(400, "Parametres 'type' et 'nom' requis"));
        }
        let mut chemin = self.chemin_lib_fichier(&genre, &nom, false)?;
        // « 2512 » comme les commandes de pilotage le nomment : le .json s'il existe
        if !existe(&chemin) && !basename(&chemin).contains('.') && existe(&format!("{}.json", chemin)) {
            (chemin, nom) = (format!("{}.json", chemin), format!("{}.json", nom));
        }
        if !existe(&chemin) {
            return Err(refus(404, format!("Fichier introuvable : {}", nom)));
        }
        // un STEP de fabricant porte parfois du Latin-1 dans ses chaines
        let contenu = lire_texte(&chemin).map_err(|e| refus(500, format!("Erreur de lecture : {}", errno(&e, &chemin))))?;
        if nom.ends_with(".json") {
            if let Ok(data) = json::loads(&contenu) {
                return Ok(obj! {"type" => genre, "nom" => nom, "data" => data});
            }
        }
        Ok(obj! {"type" => genre, "nom" => nom, "contenu" => contenu})
    }

    /// Ecrit un fichier individuel d'empreinte ou de modele.
    pub(crate) fn lib_fichier_ecrire(&self, r: &mut Requete) -> Rendu {
        let corps = self.lire_json_lib(r)?;
        self.lib_garde(true)?;
        let Json::Objet(charge) = &corps.json else { return Err(refus(400, "Corps JSON invalide")) };
        let (genre, nom) = (&corps.json["type"], &corps.json["nom"]);
        if !genre.vrai() || !nom.vrai() {
            return Err(refus(400, "Champs 'type' et 'nom' requis"));
        }
        let chemin = self.chemin_lib_fichier(genre.as_str().unwrap_or(""), &str_py(nom), true)?;
        let contenu = match (charge.get("data"), charge.get("contenu")) {
            (Some(data @ (Json::Objet(_) | Json::Liste(_))), _) => dumps_indente(data, 2),
            (_, Some(contenu)) => str_py(contenu),
            _ => return Err(refus(400, "Champ 'data' ou 'contenu' requis")),
        };
        let ecriture = |e: std::io::Error| refus(500, format!("Erreur d'ecriture : {}", errno(&e, &chemin)));
        if charge.get("si_absent") == Some(&Json::Bool(true)) {
            if corps.brise {
                return Err(refus(400, format!("Texte invalide (caractere non encodable en UTF-8) : {}", str_py(nom))));
            }
            // jamais d'ecrasement : complet ou pas du tout (ecrire_exclusif)
            ecrire_exclusif(&chemin, contenu.as_bytes()).map_err(|e| match e.kind() {
                std::io::ErrorKind::AlreadyExists => refus(409, format!("Le fichier existe deja : {} (jamais d'ecrasement)", str_py(nom))),
                _ => ecriture(e),
            })?;
        } else {
            if corps.brise {
                return Err(interne("UnicodeEncodeError : caractere non encodable en UTF-8"));
            }
            ecrire_atomique(&chemin, contenu.as_bytes()).map_err(ecriture)?;
        }
        Ok(obj! {"ok" => true, "type" => genre.clone(), "nom" => nom.clone()})
    }

    /// Supprime un fichier individuel d'empreinte ou de modele.
    pub(crate) fn lib_fichier_effacer(&self, r: &Requete) -> Rendu {
        self.lib_garde(true)?;
        let (genre, nom) = (param(r, "type"), param(r, "nom"));
        if genre.is_empty() || nom.is_empty() {
            return Err(refus(400, "Parametres 'type' et 'nom' requis"));
        }
        if genre == "step" {
            return Err(refus(400, "Modele STEP : lecture seule"));
        }
        let chemin = self.chemin_lib_fichier(&genre, &nom, false)?;
        if !existe(&chemin) {
            return Err(refus(404, format!("Fichier introuvable : {}", nom)));
        }
        std::fs::remove_file(&chemin).map_err(|e| refus(500, format!("Erreur suppression : {}", errno(&e, &chemin))))?;
        Ok(obj! {"ok" => true, "supprime" => nom})
    }

    /// GET /api/lib/config : etat, statistiques et chemin actif.
    pub(crate) fn lib_config_lire(&self, r: &Requete) -> Json {
        let (mut dossier, mut defaut) = (self.dossier_lib(), self.dossier_lib_defaut());
        let est_defaut = if existe(&dossier) && existe(&defaut) { realpath(&dossier) == realpath(&defaut) } else { dossier == defaut };
        let (present, statistiques) = statistiques_lib(&dossier);
        if !self.client_local(r) {
            // un appareil du reseau n'a pas a connaitre l'arborescence du poste
            (dossier, defaut) = (basename(&dossier).to_string(), basename(&defaut).to_string());
        }
        let suite = self.lanceur_port().is_some();
        obj! {
            "chemin" => dossier, "defaut" => defaut, "est_defaut" => est_defaut, "existe" => present, "statistiques" => statistiques,
            // Lance par WEB_SUITE, la LIB est celle de PROJETS (LIB_CAO) :
            // le lanceur l'envoie sur GitHub, elle ne se deplace pas.
            "modifiable" => self.projets_ouvert && !suite, "suite" => suite,
        }
    }

    /// POST /api/lib/config : definir le chemin de la LIB.
    pub(crate) fn lib_config_ecrire(&self, r: &mut Requete) -> Rendu {
        let charge = self.lire_json_lib(r)?.json;
        self.lib_garde(false)?;
        let Json::Objet(o) = &charge else { return Err(refus(400, "Corps JSON invalide (objet attendu)")) };
        if self.lanceur_port().is_some() {
            return Err(refus(403, "Lance par WEB_SUITE : la bibliotheque est celle de PROJETS (LIB_CAO), envoyee sur GitHub avec les projets. Elle ne se deplace pas d'ici."));
        }
        let mut res = self.definir_dossier_lib(&texte_ou_vide(&charge["chemin"]), o.get("initialiser").is_none_or(Json::vrai), true)?;
        let statistiques = statistiques_lib(res["chemin"].as_str().unwrap_or("")).1;
        if let Json::Objet(res) = &mut res {
            res.insert("statistiques".into(), statistiques);
        }
        Ok(res)
    }
}

#[cfg(test)]
mod essais {
    use super::*;
    use crate::json::dumps;

    /// Cas de test_00 de banc-lib-routes.py qui ne demandent pas la vraie bibliothèque.
    #[test]
    fn parasites() {
        let p = parasites_spice("C01 Port1 N01 1e-12\nL02 N01 N02 2e-10\nR03 N02 Port2 0.3").unwrap();
        assert_eq!(dumps(&p), r#"{"c": 1e-12, "esl": 2e-10, "esr": 0.3}"#);
        // UNE ECHELLE A DEUX ETAGES : la self de l'etage L||R est en serie sous
        // la resonance (ESL = L1 + L2) ; l'ESR y ajoute (wL)^2 R / (R^2 + (wL)^2) a f0.
        let p = parasites_spice("C01 Port1 N01 1e-7\nL02 N01 N02 2e-10\nR03 N02 N03 0.01\nL04 N03 Port2 3e-10\nR04 N03 Port2 1.0").unwrap();
        assert_eq!(p["esl"].as_f64(), Some(5e-10));
        let wl = 3e-10 / (1e-7f64 * 5e-10).powf(0.5);
        let attendu: f64 = fmt_g(0.01 + wl * wl / (1.0 + wl * wl), 3).parse().unwrap();
        assert!((p["esr"].as_f64().unwrap() - attendu).abs() < 1e-6, "{:?}", p);
        assert_eq!(dumps(&parasites_spice("L2 1 2 1.2e-08\nR2 2 3 0.12\n").unwrap()), r#"{"l": 1.2e-08, "dcr": 0.12}"#);
        assert!(parasites_spice(".SUBCKT CAPACITOR 1 2\nC1 1 2 {C}\n.ENDS").is_none());
    }

    #[test]
    fn cases_du_catalogue() {
        assert_eq!(valeur_catalogue("V", &"10\u{a0}µF".into()).unwrap(), "10 µF");
        assert_eq!(valeur_catalogue("V", &Json::Flottant(1.5)).unwrap(), "1.5");
        for refuse in ["=1+1", "+cmd|' /C calc'!A0", " @x", "-(1)", "AMS1117\u{200b}-3.3", "a\u{7}b", &"x".repeat(501)] {
            assert_eq!(valeur_catalogue("V", &refuse.into()).unwrap_err().code, 400, "{:?}", refuse);
        }
        assert_eq!(valeur_catalogue("V", &Json::Bool(true)).unwrap_err().code, 400);
        assert_eq!(valeur_catalogue("V", &"-5 V".into()).unwrap(), "-5 V");
    }

    #[test]
    fn encodages() {
        let (t, e) = Encodage::decoder(b"\xef\xbb\xbfr\xc3\xa9");
        assert!(t == "ré" && e == Encodage::Utf8);
        let (t, e) = Encodage::decoder(b"r\x92sistance \x96 0603");
        assert!(t == "r’sistance – 0603" && e == Encodage::Cp1252);
        assert_eq!(e.encoder(&t).unwrap(), b"r\x92sistance \x96 0603");
        assert!(Encodage::Cp1252.encoder("\u{20ac}").is_some() && Encodage::Latin1.encoder("\u{20ac}").is_none() && Encodage::Cp1252.encoder("\u{3a9}").is_none());
        assert!(Encodage::decoder(b"\x81\xe9").1 == Encodage::Latin1);
    }
}
