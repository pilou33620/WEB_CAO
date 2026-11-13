//! Relie les composants Murata du catalogue a leurs vrais modeles SPICE.
//! Le portage en Rust de python/lier_modeles_murata.py.
//!
//! Le catalogue (LIB/LIB_composants.csv) sort de l'extraction avec un modele
//! generique dans la colonne « Modele Simulation » : capacitor.sub pour tout
//! condensateur, inductor.sub pour toute self. Ces deux fichiers ne sont qu'un
//! C ou un L ideal -- utilisables pour un point de polarisation, inutiles des
//! qu'on regarde une resonance ou une impedance en frequence.
//!
//! Murata publie, lui, un modele par reference : un reseau RLC a une quinzaine
//! de noeuds qui reproduit la vraie courbe jusqu'a plusieurs GHz. Les packs
//! telecharges se deposent tels quels dans lib_simulation/<pack>/. Ce script
//! fait le lien : pour chaque reference Murata du catalogue -- la reference
//! principale, puis les secondes sources -- il cherche le .mod correspondant, le
//! recopie a plat dans lib_simulation/ sous le nom de la reference, et remplace
//! le modele generique dans le CSV. Les packs se suppriment ensuite : seuls les
//! .sub a plat servent, et le calcul PDN en tire lui-meme C/ESR/ESL et L/DCR
//! (/api/lib/parasites) -- aucune table a regenerer.
//!
//! La LIB est celle de l'outil (dossier_lib_defaut : WEB_SUITE/PROJETS/
//! LIB_CAO), ou celle que designe la variable WEB_CAO_LIB.
//!
//! A plat, et pas en place : la route /api/lib/fichier refuse tout nom qui
//! contient un separateur de dossier (chemin_lib_fichier). Un modele
//! laisse au fond de « CAPA GCM/gcm-n-v68/... » serait donc illisible depuis le
//! navigateur. L'extension devient .sub, comme les modeles deja presents -- le
//! contenu, lui, est recopie mot pour mot, en-tete et copyright Murata compris.
//!
//!     lier_modeles_murata             # rapport seul
//!     lier_modeles_murata --appliquer # ecrit les .sub et le CSV

use crate::py;
use regex::Regex;
use std::collections::HashMap;
use std::io::Write;
use std::path::{Component, Path, PathBuf};
use std::sync::LazyLock;

pub const COL_MODELE: &str = "Modèle Simulation";
// La reference principale d'abord, puis les secondes sources : un composant
// d'un autre fabricant dont la 2e source est une Murata prend son modele.
pub const COLS_REFERENCE: [&str; 4] = ["Part Number", "2nd source P/N", "3nd source P/N", "4nd source P/N"];
pub const COL_NOM: &str = "Part Name";
pub const COL_VALEUR: &str = "Value";

// Les familles Murata dont un pack peut etre depose. Les MLCC partagent le
// meme codage de reference (voir cle_sans_tolerance), ce qui permet les
// rapprochements par valeur ; les autres ne se relient qu'a l'identique.
pub const MLCC: [&str; 6] = ["GCM", "GRM", "GJM", "GCQ", "GRT", "GCJ"];
pub const FAMILLES: [&str; 11] = ["GCM", "GRM", "GJM", "GCQ", "GRT", "GCJ", "LQW", "LQG", "LQP", "LQM", "BLM"];

// Les modeles generiques que ce script a le droit de remplacer. Tout autre
// contenu deja present dans la colonne est un choix fait par quelqu'un : on
// ne l'ecrase pas sans le dire.
pub const GENERIQUES: [&str; 3] = ["capacitor.sub", "inductor.sub", ""];

/// Les dossiers de travail : RACINE (le dépôt WEB_CAO, pour l'affichage des chemins), LIB,
/// SIM (LIB/lib_simulation) et CSV_CATALOGUE.
pub struct Lieux {
    pub racine: PathBuf,
    pub lib: PathBuf,
    pub sim: PathBuf,
    pub csv_catalogue: PathBuf,
}

impl Lieux {
    /// La LIB de `WEB_CAO_LIB`, sinon celle de l'outil. L'exécutable n'est pas rangé dans
    /// python/ comme l'était le script : la racine du dépôt est cherchée en remontant depuis
    /// l'exécutable, puis depuis le dossier courant, jusqu'au dossier qui porte gestion-lib/.
    pub fn du_systeme() -> Lieux {
        let departs = [std::env::current_exe().ok(), std::env::current_dir().ok()];
        let racine = departs
            .into_iter()
            .flatten()
            .find_map(|d| d.ancestors().find(|a| a.join("gestion-lib").is_dir()).map(Path::to_path_buf))
            .unwrap_or_else(|| std::env::current_dir().unwrap_or_default());
        let lib = std::env::var_os("WEB_CAO_LIB").filter(|l| !l.is_empty()).map(PathBuf::from).unwrap_or_else(|| dossier_lib_defaut(&racine));
        Lieux::de(racine, lib)
    }

    pub fn de(racine: PathBuf, lib: PathBuf) -> Lieux {
        let sim = lib.join("lib_simulation");
        let csv_catalogue = lib.join("LIB_composants.csv");
        Lieux { racine, lib, sim, csv_catalogue }
    }
}

/// La LIB par defaut : LIB/ a cote d'index.html si elle existe, sinon celle
/// de WEB_SUITE, ../PROJETS/LIB_CAO -- la LIB suivie par git, dont le depot
/// WEB_CAO ne garde plus de copie. Une seule LIB, ou que l'outil soit lance.
pub fn dossier_lib_defaut(racine: &Path) -> PathBuf {
    let propre = racine.join("LIB");
    if propre.is_dir() {
        return propre;
    }
    let suite = absolu(racine).parent().unwrap_or(Path::new("/")).join("PROJETS").join("LIB_CAO");
    if suite.is_dir() {
        suite
    } else {
        propre
    }
}

/// os.path.abspath : absolu et sans « . » ni « .. », sans suivre les liens.
fn absolu(p: &Path) -> PathBuf {
    let complet = if p.is_absolute() { p.to_path_buf() } else { std::env::current_dir().unwrap_or_default().join(p) };
    let mut net = PathBuf::new();
    for c in complet.components() {
        match c {
            Component::CurDir => {}
            Component::ParentDir => {
                net.pop();
            }
            c => net.push(c),
        }
    }
    net
}

/// os.path.relpath(chemin, depart)
fn relatif(chemin: &Path, depart: &Path) -> String {
    let (chemin, depart) = (absolu(chemin), absolu(depart));
    let (c, d): (Vec<_>, Vec<_>) = (chemin.components().collect(), depart.components().collect());
    let commun = c.iter().zip(&d).take_while(|(a, b)| a == b).count();
    let mut r = PathBuf::new();
    for _ in commun..d.len() {
        r.push("..");
    }
    for x in &c[commun..] {
        r.push(x);
    }
    if r.as_os_str().is_empty() {
        ".".into()
    } else {
        r.to_string_lossy().into_owned()
    }
}

/// os.walk(haut) : chaque dossier avec ses fichiers, d'abord lui puis ses sous-dossiers, dans
/// l'ordre où le système les donne. `visite` voit un dossier avant que ses sous-dossiers
/// soient lus (ce qu'il y écrit est donc parcouru) ; un lien vers un dossier n'est pas suivi.
fn parcourir(haut: &Path, visite: &mut dyn FnMut(&Path, &[String]) -> Result<(), String>) -> Result<(), String> {
    let Ok(entrees) = std::fs::read_dir(haut) else { return Ok(()) };
    let (mut sous, mut fichiers) = (Vec::new(), Vec::new());
    for e in entrees.flatten() {
        let nom = e.file_name().to_string_lossy().into_owned();
        if e.path().is_dir() {
            sous.push(nom);
        } else {
            fichiers.push(nom);
        }
    }
    visite(haut, &fichiers)?;
    for s in sous {
        let d = haut.join(s);
        if !d.is_symlink() {
            parcourir(&d, visite)?;
        }
    }
    Ok(())
}

/// nom.lower().endswith(ext)
fn finit_par(nom: &str, ext: &str) -> bool {
    nom.to_lowercase().ends_with(ext)
}

// -- index des modeles fabricant --------------------------------------------

/// Deballe les .zip des packs qui ne l'ont pas encore ete ou partiellement.
///
/// Murata livre un zip par serie ; certains ont ete ouverts a la main, pas
/// tous. On deballe a cote du zip, dans un dossier du meme nom, et on complete
/// ceux dont l'extraction etait partielle.
pub fn deballer_packs(lieux: &Lieux, mut verbeux: Option<&mut dyn Write>) -> Result<Vec<String>, String> {
    let mut ouverts = Vec::new();
    if !lieux.sim.is_dir() {
        return Ok(ouverts);
    }
    let ouvrir = |chemin: &Path| -> Result<zip::ZipArchive<std::fs::File>, String> {
        let f = std::fs::File::open(chemin).map_err(|e| format!("{} : {e}", chemin.display()))?;
        zip::ZipArchive::new(f).map_err(|e| format!("{} : {e}", chemin.display()))
    };
    parcourir(&lieux.sim, &mut |dossier, fichiers| {
        for f in fichiers {
            if !finit_par(f, ".zip") {
                continue;
            }
            let chemin = dossier.join(f);
            let cible = dossier.join(&f[..f.len() - 4]);
            let mut doit_extraire = false;
            if !cible.is_dir() {
                doit_extraire = true;
            } else if let Ok(z) = ouvrir(&chemin) {
                // (une archive illisible : on ne sait pas compter, on n'extrait pas)
                let n_zip = z.file_names().filter(|x| finit_par(x, ".mod")).count();
                let mut n_cible = 0;
                parcourir(&cible, &mut |_, fs| {
                    n_cible += fs.iter().filter(|x| finit_par(x, ".mod")).count();
                    Ok(())
                })?;
                if n_cible < n_zip {
                    doit_extraire = true;
                }
            }
            if doit_extraire {
                ouvrir(&chemin)?.extract(&cible).map_err(|e| format!("{} : {e}", chemin.display()))?;
                ouverts.push(relatif(&cible, &lieux.racine));
                if let Some(sortie) = verbeux.as_mut() {
                    writeln!(sortie, "  deballe : {}", relatif(&cible, &lieux.sim)).map_err(|e| e.to_string())?;
                }
            }
        }
        Ok(())
    })?;
    Ok(ouverts)
}

/// Tous les .mod des packs, indexes par reference fabricant (majuscules).
pub fn indexer_modeles(sim: &Path) -> HashMap<String, PathBuf> {
    let mut index = HashMap::new();
    let _ = parcourir(sim, &mut |dossier, fichiers| {
        for f in fichiers {
            if finit_par(f, ".mod") {
                // os.path.splitext : un nom fait de points puis « mod » n'a pas d'extension
                let base = &f[..f.len() - 4];
                let base = if base.chars().all(|c| c == '.') { f.as_str() } else { base };
                index.insert(base.to_uppercase(), dossier.join(f));
            }
        }
        Ok(())
    });
    index
}

// -- correspondance reference catalogue -> modele ---------------------------

pub const ARBITRAGES: [(&str, &str); 9] = [
    // Références GCM C0G 0402 50V sans modèle GCM : le GRM de même boîtier,
    // même valeur et même tension (le réseau RLC ne dépend pas de la
    // qualification auto) plutôt qu'un GCM d'un autre boîtier.
    ("GCM1555C1HR70WA16D", "GRM1555C1HR70WA01"), // 0.7 pF
    ("GCM1555C1H2R1BA16D", "GRM1555C1H2R1BA01"), // 2.1 pF
    ("GCM1555C1H2R4BA16D", "GRM1555C1H2R4BA01"), // 2.4 pF
    ("GCM1555C1H3R6BA16D", "GRM1555C1H3R6BA01"), // 3.6 pF
    ("GCM1555C1H7R5DA16D", "GRM1555C1H7R5DA01"), // 7.5 pF
    // Aucune valeur exacte publiée : la plus proche
    ("GCM1555G1H8R7CA16J", "GCM1555C1H8R2DA16"), // 8.7 pF -> 8.2 pF GCM C0G
    ("GCM1555C1H131JA16D", "GCM1555C1H121JA16"), // 130 pF -> 120 pF GCM C0G
    // Inductances : la LQW15 (0402) de même valeur
    ("LQW03AW9N1J00D", "LQW15AN9N1H00"), // 9.1 nH
    ("LQW04AN2N6C00D", "LQW15AN2N6C00"), // 2.6 nH
];

/// texte[a:b], en caractères
fn tranche(t: &str, a: usize, b: usize) -> &str {
    let mut bornes = t.char_indices().map(|(i, _)| i).chain([t.len()]);
    let debut = bornes.clone().nth(a).unwrap_or(t.len());
    let fin = bornes.nth(b).unwrap_or(t.len());
    &t[debut..fin.max(debut)]
}

fn longueur(t: &str) -> usize {
    t.chars().count()
}

fn est_mlcc(reference: &str) -> bool {
    MLCC.iter().any(|f| reference.starts_with(f))
}

/// La reference, puis la meme amputee de son suffixe de conditionnement.
///
/// Une reference de catalogue porte souvent un code d'emballage que le modele
/// n'a pas : GCM1555C1H150JA16D (bande) contre GCM1555C1H150JA16 (modele),
/// LQW15AN10NG00D contre LQW15AN10NG00. Le caractere '#' final (revision
/// interne) part d'abord. On raccourcit d'au plus trois caracteres : au-dela
/// on ne rogne plus un emballage, on change de composant.
pub fn variantes(reference: &str) -> Vec<String> {
    let ref_ = reference.trim_end_matches('#');
    let n = longueur(ref_);
    let mut l = vec![ref_.to_string()];
    l.extend((1..=3).filter(|k| n > *k).map(|k| tranche(ref_, 0, n - k).to_string()));
    l
}

/// Cle d'une reference MLCC ou la tolerance est mise de cote, ou None.
///
/// Une reference Murata de condensateur fait 17 caracteres :
/// GCM | 15 | 5 | 5C | 1H | 1R5 | B | A16, soit serie, dimensions, epaisseur,
/// dielectrique, tension, capacite, tolerance, code individuel. Seul le 14e
/// caractere (la tolerance) distingue GCM1555C1H121FA16 de ...JA16 : meme
/// capacite nominale, meme dielectrique, meme tension, donc meme reseau RLC.
/// Murata ne publie qu'une des deux ; la faire servir pour l'autre est un
/// rapprochement legitime, mais il est signale comme tel dans le rapport.
pub fn cle_sans_tolerance(reference: &str) -> Option<String> {
    if longueur(reference) != 17 || !est_mlcc(reference) {
        return None;
    }
    Some(format!("{}{}", tranche(reference, 0, 13), tranche(reference, 14, 17)))
}

/// Les index tires des .mod presents : par reference, sans la tolerance, par base de 13
/// caracteres, et par (boitier ou "ANY", dielectrique, valeur).
#[derive(Default)]
pub struct Index {
    pub modeles: HashMap<String, PathBuf>,
    pub tolerance: HashMap<String, Vec<String>>,
    pub base_13: HashMap<String, Vec<String>>,
    pub val_diel: HashMap<(String, String, String), Vec<String>>,
}

impl Index {
    pub fn de(modeles: HashMap<String, PathBuf>) -> Index {
        let mut index = Index::default();
        for ref_ in modeles.keys() {
            if let Some(cle) = cle_sans_tolerance(ref_) {
                index.tolerance.entry(cle).or_default().push(ref_.clone());
            }
            if longueur(ref_) >= 13 && est_mlcc(ref_) {
                index.base_13.entry(tranche(ref_, 0, 13).to_string()).or_default().push(ref_.clone());
            }
            if let Some(m) = RE_MLCC.captures(ref_) {
                let (taille, diel, val_code) = (m[2].to_string(), m[3].to_string(), m[5].to_string());
                index.val_diel.entry((taille, diel.clone(), val_code.clone())).or_default().push(ref_.clone());
                index.val_diel.entry(("ANY".into(), diel, val_code)).or_default().push(ref_.clone());
            }
        }
        index.modeles = modeles;
        index
    }
}

/// (nom du modele, qualite) pour une reference, ou None.
///
/// Qualite : 'exact', 'emballage', 'tolerance', 'variante_code', 'meme_boitier',
/// 'compatible_boitier', 'arbitrage'.
pub fn resoudre(reference: &str, index: &Index) -> Option<(String, &'static str)> {
    let essais = variantes(reference);
    // 0. Table d'arbitrage explicite
    for essai in &essais {
        if let Some((_, modele)) = ARBITRAGES.iter().find(|(r, m)| r == essai && index.modeles.contains_key(*m)) {
            return Some((modele.to_string(), "arbitrage"));
        }
    }

    // 1. Correspondance exacte ou emballage
    for (rang, essai) in essais.iter().enumerate() {
        if index.modeles.contains_key(essai) {
            return Some((essai.clone(), if rang == 0 { "exact" } else { "emballage" }));
        }
    }

    // 2. Tolérance équivalente
    for essai in &essais {
        let proches = cle_sans_tolerance(essai).and_then(|cle| index.tolerance.get(&cle));
        if let Some(premier) = proches.and_then(|p| p.iter().min()) {
            return Some((premier.clone(), "tolerance"));
        }
    }

    // 3. Même base de 13 caractères (diélectrique, tension, valeur identiques, code usine/emballage différent)
    for essai in &essais {
        if longueur(essai) >= 13 && est_mlcc(essai) {
            if let Some(premier) = index.base_13.get(tranche(essai, 0, 13)).and_then(|p| p.iter().min()) {
                return Some((premier.clone(), "variante_code"));
            }
        }
    }

    // 4. Même boîtier, même diélectrique, même valeur, toutes familles MLCC
    //    confondues -- puis, en dernier recours, un autre boîtier. Parmi les
    //    candidats : même tension, puis même tolérance, puis même famille.
    for essai in &essais {
        let Some(m) = RE_MLCC.captures(essai) else { continue };
        let (fam, taille, diel, val_code) = (&m[1], &m[2], &m[3], &m[5]);
        for (boitier, qualite) in [(taille, "meme_boitier"), ("ANY", "compatible_boitier")] {
            let proches = index.val_diel.get(&(boitier.to_string(), diel.to_string(), val_code.to_string()));
            let choix = proches.and_then(|p| {
                p.iter().min_by_key(|c| (tranche(c, 8, 10) != tranche(essai, 8, 10), tranche(c, 13, 14) != tranche(essai, 13, 14), tranche(c, 0, 3) != fam, *c))
            });
            if let Some(c) = choix {
                return Some((c.clone(), qualite));
            }
        }
    }

    None
}

// serie, dimensions (3), epaisseur, dielectrique (2), tension (2), valeur (3)
static RE_MLCC: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(&format!(r"^({})([0-9A-Z]{{2}})[0-9A-Z]([A-Z0-9]{{2}})([0-9A-Z]{{2}})([0-9R]{{3}})", MLCC.join("|"))).unwrap());

// -- controle de coherence --------------------------------------------------

// (les blancs de Python comptent aussi les séparateurs \x1c à \x1f)
static RE_VALEUR: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^[\s\x1c-\x1f]*([0-9]*\.?[0-9]+)[\s\x1c-\x1f]*([PNUM]?)[FH][\s\x1c-\x1f]*$").unwrap());

/// « 1.5pF », « 10nH » -> valeur en farads ou henrys, ou None.
pub fn valeur_declaree(texte: &str) -> Option<f64> {
    let maj = texte.to_uppercase();
    let m = RE_VALEUR.captures(&maj)?;
    let multiple = match &m[2] {
        "P" => 1e-12,
        "N" => 1e-9,
        "U" => 1e-6,
        "M" => 1e-3,
        _ => 1.0,
    };
    Some(py::float(&m[1])? * multiple)
}

/// La valeur codee dans la reference Murata, en F ou H, ou None.
///
/// Condensateur : trois caracteres en position 11-13, en picofarads, soit
/// deux chiffres et un exposant (105 = 10x10^5 pF = 1 uF), soit un 'R' qui
/// tient lieu de virgule (1R5 = 1,5 pF). Self LQW : meme principe apres le
/// prefixe de serie, mais en nanohenrys et avec 'N' comme virgule
/// (1N5 = 1,5 nH, 10N = 10 nH).
pub fn valeur_reference(reference: &str) -> Option<f64> {
    let ref_ = reference.trim_end_matches('#');
    let (code, echelle) = if est_mlcc(ref_) && longueur(ref_) >= 13 {
        (tranche(ref_, 10, 13), 1e-12)
    } else if ref_.starts_with("LQW") && longueur(ref_) >= 11 {
        (tranche(tranche(ref_, 7, 11).trim_end_matches(|c| "ABCDFGHJKM".contains(c)), 0, 3), 1e-9)
    } else {
        return None;
    };
    if longueur(code) != 3 {
        return None;
    }
    if code.contains('R') || code.contains('N') {
        let code = code.replace('N', "R");
        let (entier, decimale) = code.split_once('R').unwrap_or((&code, ""));
        let texte = format!("{}.{}", if entier.is_empty() { "0" } else { entier }, if decimale.is_empty() { "0" } else { decimale });
        return Some(py::float(&texte)? * echelle);
    }
    // shortcut: str.isdigit() admet aussi les chiffres d'autres écritures ; seuls ceux d'ASCII
    // sont lus ici (une référence Murata n'en porte pas d'autres)
    if !code.bytes().all(|c| c.is_ascii_digit()) {
        return None;
    }
    Some(code[..2].parse::<f64>().ok()? * 10f64.powi((code.as_bytes()[2] - b'0') as i32) * echelle)
}

/// Vrai si la valeur du catalogue et celle codee dans la reference different.
pub fn valeurs_discordantes(reference: &str, valeur: &str) -> bool {
    match (valeur_declaree(valeur), valeur_reference(reference)) {
        (Some(a), Some(b)) => (a - b).abs() > 0.01 * if b > a { b } else { a },
        _ => false,
    }
}

// -- catalogue --------------------------------------------------------------

/// str.splitlines(True) : les lignes avec leurs fins de ligne, toutes celles que Python connaît.
pub fn lignes_avec_fins(brut: &str) -> Vec<String> {
    let mut lignes = Vec::new();
    let mut debut = 0;
    let mut it = brut.char_indices().peekable();
    while let Some((i, c)) = it.next() {
        if matches!(c, '\n' | '\r' | '\u{b}' | '\u{c}' | '\u{1c}' | '\u{1d}' | '\u{1e}' | '\u{85}' | '\u{2028}' | '\u{2029}') {
            let mut fin = i + c.len_utf8();
            if c == '\r' && it.peek().is_some_and(|(_, s)| *s == '\n') {
                it.next();
                fin += 1;
            }
            lignes.push(brut[debut..fin].to_string());
            debut = fin;
        }
    }
    if debut < brut.len() {
        lignes.push(brut[debut..].to_string());
    }
    lignes
}

/// next(csv.reader([ligne], delimiter=";")) : les champs d'une ligne, lus comme le module csv
/// (guillemets doublés, champ entre guillemets laissé ouvert en fin de ligne).
pub fn champs_csv(ligne: &str) -> Vec<String> {
    #[derive(PartialEq)]
    enum Etat {
        DebutLigne,
        DebutChamp,
        Champ,
        Guillemets,
        GuillemetDansGuillemets,
        FinDeLigne,
    }
    let mut champs = Vec::new();
    let mut champ = String::new();
    let mut etat = Etat::DebutLigne;
    for c in ligne.chars() {
        let saut = c == '\n' || c == '\r';
        etat = match etat {
            Etat::DebutLigne if saut => Etat::FinDeLigne,
            Etat::DebutLigne | Etat::DebutChamp | Etat::Champ if saut => {
                champs.push(std::mem::take(&mut champ));
                Etat::FinDeLigne
            }
            Etat::DebutLigne | Etat::DebutChamp if c == '"' => Etat::Guillemets,
            Etat::DebutLigne | Etat::DebutChamp | Etat::Champ if c == ';' => {
                champs.push(std::mem::take(&mut champ));
                Etat::DebutChamp
            }
            Etat::DebutLigne | Etat::DebutChamp | Etat::Champ => {
                champ.push(c);
                Etat::Champ
            }
            Etat::Guillemets if c == '"' => Etat::GuillemetDansGuillemets,
            Etat::Guillemets => {
                champ.push(c);
                Etat::Guillemets
            }
            Etat::GuillemetDansGuillemets if c == '"' => {
                champ.push(c);
                Etat::Guillemets
            }
            Etat::GuillemetDansGuillemets if c == ';' => {
                champs.push(std::mem::take(&mut champ));
                Etat::DebutChamp
            }
            Etat::GuillemetDansGuillemets if saut => {
                champs.push(std::mem::take(&mut champ));
                Etat::FinDeLigne
            }
            Etat::GuillemetDansGuillemets => {
                champ.push(c);
                Etat::Champ
            }
            Etat::FinDeLigne => Etat::FinDeLigne, // rien ne suit une fin de ligne : splitlines a coupé là
        };
    }
    // fin du texte : un champ commencé (ou ouvert par un guillemet, ou attendu après un « ; ») est rendu
    if matches!(etat, Etat::DebutChamp | Etat::Champ | Etat::Guillemets | Etat::GuillemetDansGuillemets) {
        champs.push(champ);
    }
    champs
}

/// Remplace ce qui suit le dernier ';' en gardant la fin de ligne.
pub fn remplacer_dernier_champ(ligne: &str, valeur: &str) -> Option<String> {
    let corps = ligne.trim_end_matches(['\r', '\n']);
    let fin = &ligne[corps.len()..];
    Some(format!("{}{}{}", &corps[..corps.rfind(';')? + 1], valeur, fin))
}

// -- traitement -------------------------------------------------------------

const USAGE: &str = "usage: lier_modeles_murata [-h] [--appliquer]\n";
const AIDE: &str = "\nRelie les composants Murata du catalogue a leurs modeles SPICE.\n\noptions:\n  -h, --help   show this help message and exit\n  --appliquer  ecrit les .sub et met a jour le CSV (sinon : rapport seul)\n";

/// Le traitement entier, avec les arguments de la ligne de commande (sans le nom du programme).
/// Rend le code de sortie ; `Err` : ce qui arrêtait le script Python sur une exception.
pub fn principal(args: &[String], lieux: &Lieux, sortie: &mut dyn Write) -> Result<i32, String> {
    // argparse : --appliquer (ou un début non ambigu), -h / --help
    let mut appliquer = false;
    let mut inconnus = Vec::new();
    for a in args {
        if a == "-h" || (a.starts_with("-h") && !a.starts_with("--")) || (a.len() >= 3 && "--help".starts_with(a.as_str())) {
            write!(sortie, "{USAGE}{AIDE}").map_err(|e| e.to_string())?;
            return Ok(0);
        } else if a.len() >= 3 && "--appliquer".starts_with(a.as_str()) {
            appliquer = true;
        } else if let Some((option, valeur)) = a.split_once('=').filter(|(o, _)| o.len() >= 3 && "--appliquer".starts_with(o)) {
            let _ = option;
            eprint!("{USAGE}lier_modeles_murata: error: argument --appliquer: ignored explicit argument '{valeur}'\n");
            return Ok(2);
        } else {
            inconnus.push(a.as_str());
        }
    }
    if !inconnus.is_empty() {
        eprint!("{USAGE}lier_modeles_murata: error: unrecognized arguments: {}\n", inconnus.join(" "));
        return Ok(2);
    }

    macro_rules! dire {
        ($($arg:tt)*) => { writeln!(sortie, $($arg)*).map_err(|e| e.to_string())? };
    }

    if !lieux.csv_catalogue.is_file() {
        dire!("Catalogue introuvable : {}", lieux.csv_catalogue.display());
        return Ok(1);
    }

    dire!("Packs fabricant :");
    deballer_packs(lieux, Some(sortie))?;
    let index = Index::de(indexer_modeles(&lieux.sim));

    dire!("  {} modeles .mod indexes dans {}", index.modeles.len(), relatif(&lieux.sim, &lieux.racine));

    // Le CSV est relu tel quel et reecrit ligne a ligne : seul le dernier champ
    // des lignes concernees change. Le repasser par csv.writer reguillemetterait
    // des colonnes intactes et ferait un diff illisible.
    let brut = std::fs::read(&lieux.csv_catalogue).map_err(|e| e.to_string())?;
    let brut = String::from_utf8(brut).map_err(|e| format!("{} : {e}", lieux.csv_catalogue.display()))?;
    let mut lignes = lignes_avec_fins(&brut);
    let entete = champs_csv(lignes.first().ok_or("catalogue vide")?);
    let colonne = |nom: &str| entete.iter().position(|c| c == nom);
    let exigee = |nom: &str| colonne(nom).ok_or_else(|| format!("'{nom}' is not in list"));
    let i_refs: Vec<usize> = COLS_REFERENCE.iter().filter_map(|c| colonne(c)).collect();
    let i_mod = exigee(COL_MODELE)?;
    let i_nom = exigee(COL_NOM)?;
    let i_val = exigee(COL_VALEUR)?;
    if i_mod != entete.len() - 1 {
        dire!("La colonne « {COL_MODELE} » n'est plus la derniere du CSV : la reecriture ligne a ligne ne tient plus.");
        return Ok(1);
    }

    let (mut lies, mut deja, mut conserves, mut absents, mut doutes) = (Vec::new(), Vec::new(), Vec::new(), Vec::new(), Vec::new());
    let mut a_copier: HashMap<String, PathBuf> = HashMap::new();

    for ligne in lignes.iter_mut().skip(1) {
        let champs = champs_csv(ligne);
        if champs.len() <= i_mod {
            continue;
        }
        let murata: Vec<String> = i_refs
            .iter()
            .filter(|i| **i < champs.len())
            .map(|i| py::strip(&champs[*i]).to_uppercase())
            .filter(|r| FAMILLES.iter().any(|f| r.starts_with(f)))
            .collect();
        let Some(premiere) = murata.first() else { continue };
        let nom = champs[i_nom].clone();
        // le catalogue ecrit « lib/simulation/X.sub » : on compare le nom seul
        let actuel = py::strip(&champs[i_mod]).replace('\\', "/");
        let actuel = actuel.rsplit('/').next().unwrap_or("").to_string();
        let (mut reference, mut resolu) = (premiere.clone(), None);
        for r in &murata {
            resolu = resoudre(r, &index);
            if resolu.is_some() {
                reference = r.clone();
                break;
            }
        }

        if valeurs_discordantes(&reference, &champs[i_val]) {
            // la reference ou la valeur est fausse : relier propagerait l'erreur
            doutes.push((reference, champs[i_val].clone()));
            continue;
        }

        let Some((modele, qualite)) = resolu else {
            absents.push((nom, reference));
            continue;
        };
        let fichier = format!("{modele}.sub");
        if actuel == fichier {
            deja.push((nom, reference));
            continue;
        }
        if !GENERIQUES.contains(&actuel.as_str()) {
            conserves.push((reference, actuel, fichier));
            continue;
        }
        a_copier.insert(fichier.clone(), index.modeles[&modele].clone());
        *ligne = remplacer_dernier_champ(ligne, &format!("lib/simulation/{fichier}")).ok_or("substring not found")?;
        lies.push((nom, reference, fichier, qualite));
    }

    let mut bloc = |titre: &str, elements: Vec<String>| -> Result<(), String> {
        dire!("\n{} ({})", titre, elements.len());
        for e in elements {
            dire!("  {e}");
        }
        Ok(())
    };

    for (qualite, titre) in [
        ("exact", "reference exacte"),
        ("emballage", "suffixe d'emballage ignore"),
        ("tolerance", "equivalent de tolerance (a verifier)"),
        ("variante_code", "variante de code usine/emballage"),
        ("meme_boitier", "meme boitier, valeur et dielectrique (a verifier)"),
        ("compatible_boitier", "autre boitier, meme valeur (a verifier)"),
        ("arbitrage", "arbitrage de valeur / serie"),
    ] {
        bloc(
            &format!("Modeles fabricant relies -- {titre}"),
            lies.iter().filter(|(_, _, _, k)| *k == qualite).map(|(nom, r, f, _)| format!("{r:<22} -> {f:<25} {nom}")).collect(),
        )?;
    }
    if !deja.is_empty() {
        bloc("Deja relies, inchanges", deja.iter().map(|(nom, r)| format!("{r:<22} {nom}")).collect())?;
    }
    if !conserves.is_empty() {
        bloc(
            "Modele non generique deja en place -- conserve",
            conserves.iter().map(|(r, a, f)| format!("{r:<22} garde {a} (candidat : {f})")).collect(),
        )?;
    }
    bloc("Sans modele dans les packs presents", absents.iter().map(|(nom, r)| format!("{r:<22} {nom}")).collect())?;
    if !doutes.is_empty() {
        bloc(
            "Valeur du catalogue en desaccord avec la reference (a corriger a la main)",
            doutes.iter().map(|(r, v)| format!("{r:<22} catalogue {v:<10} reference {}", lisible(valeur_reference(r), r))).collect(),
        )?;
    }

    dire!(
        "\n{} references Murata : {} reliees, {} deja a jour, {} conservees, {} sans modele.",
        lies.len() + deja.len() + conserves.len() + absents.len(),
        lies.len(),
        deja.len(),
        conserves.len(),
        absents.len()
    );

    if !appliquer {
        dire!("\nRapport seul. Relancer avec --appliquer pour ecrire.");
        return Ok(0);
    }

    let mut copies: Vec<(&String, &PathBuf)> = a_copier.iter().collect();
    copies.sort();
    for (fichier, source) in copies {
        // shutil.copyfile : le contenu seul
        let contenu = std::fs::read(source).map_err(|e| format!("{} : {e}", source.display()))?;
        std::fs::write(lieux.sim.join(fichier), contenu).map_err(|e| format!("{fichier} : {e}"))?;
    }
    std::fs::write(&lieux.csv_catalogue, lignes.concat()).map_err(|e| e.to_string())?;
    dire!("\n{} modeles copies dans {}, catalogue mis a jour.", a_copier.len(), relatif(&lieux.sim, &lieux.racine));
    Ok(0)
}

/// Une valeur en F ou H rendue en pF ou nH, pour le rapport.
fn lisible(valeur: Option<f64>, reference: &str) -> String {
    match valeur {
        None => "?".into(),
        Some(v) if reference.starts_with("LQW") => format!("{} nH", format_g(v * 1e9)),
        Some(v) => format!("{} pF", format_g(v * 1e12)),
    }
}

/// "%g" % x : six chiffres significatifs, zéros de fin ôtés, exposant hors de 1e-4 .. 1e6.
pub fn format_g(x: f64) -> String {
    if x.is_nan() {
        return "nan".into();
    }
    if x.is_infinite() {
        return if x > 0.0 { "inf" } else { "-inf" }.into();
    }
    let e = format!("{x:.5e}");
    let (mantisse, exposant) = e.split_once('e').unwrap_or((&e, "0"));
    let exposant: i32 = exposant.parse().unwrap_or(0);
    let sans_zeros = |t: String| if t.contains('.') { t.trim_end_matches('0').trim_end_matches('.').to_string() } else { t };
    if (-4..6).contains(&exposant) {
        sans_zeros(format!("{:.*}", (5 - exposant) as usize, x))
    } else {
        format!("{}e{}{:02}", sans_zeros(mantisse.to_string()), if exposant < 0 { '-' } else { '+' }, exposant.abs())
    }
}
