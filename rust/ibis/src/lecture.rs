//! La lecture du fichier .ibs, le boitier et les broches.

use std::collections::BTreeSet;

use indexmap::IndexMap;
use ipc2581::py::{blanc, strip, Json, Objet};

use crate::py::{chiffre, int, pct_f, split, splitlines};
use crate::ErreurIbis;

/// SUFFIXES : M est le mega, m le milli.
pub fn suffixe(c: char) -> Option<f64> {
    Some(match c {
        'T' => 1e12,
        'G' => 1e9,
        'M' => 1e6,
        'k' | 'K' => 1e3,
        'm' => 1e-3,
        'u' => 1e-6,
        'n' => 1e-9,
        'p' => 1e-12,
        'f' => 1e-15,
        _ => return None,
    })
}

// Plafond du texte d'un fichier : les plus gros .ibs du commerce (FPGA a
// mille broches) pesent quelques megaoctets.
pub const MAX_TEXTE: usize = 12 * 1024 * 1024;

/// Le ValueError de `nombre` : « nombre illisible : ... ».
#[derive(Debug, Clone, PartialEq)]
pub struct Illisible(pub String);

impl Illisible {
    fn plantage(self) -> ErreurIbis {
        ErreurIbis::plantage("ValueError", self.0)
    }
}

// ==========================================================================
// La lecture
// ==========================================================================

/// Un nombre IBIS (« 1.5nH », « -3.3e-1 », « 2.0k »), None pour « NA ».
pub fn nombre(txt: &str) -> Result<Option<f64>, Illisible> {
    let txt = strip(txt);
    if txt.is_empty() || txt.to_uppercase() == "NA" {
        return Ok(None);
    }
    // ^([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)([A-Za-z]*)
    let c: Vec<char> = txt.chars().collect();
    let est = |i: usize, f: &dyn Fn(char) -> bool| c.get(i).is_some_and(|x| f(*x));
    let num = |i: usize| est(i, &|x| chiffre(x).is_some());
    let signe = |i: usize| est(i, &|x| x == '+' || x == '-');
    // « 1,5pF » lu 1 farad : refuse plutot que tronque
    let refus = || Illisible(format!("nombre illisible : '{txt}'"));
    let mut i = usize::from(signe(0));
    if num(i) {
        while num(i) {
            i += 1;
        }
        if est(i, &|x| x == '.') {
            i += 1;
        }
    } else if est(i, &|x| x == '.') && num(i + 1) {
        i += 1;
    } else {
        return Err(refus());
    }
    while num(i) {
        i += 1;
    }
    if est(i, &|x| x == 'e' || x == 'E') {
        let mut j = i + 1 + usize::from(signe(i + 1));
        if num(j) {
            while num(j) {
                j += 1;
            }
            i = j;
        }
    }
    let fin = i;
    while est(i, &|x| x.is_ascii_alphabetic()) {
        i += 1;
    }
    if i != c.len() {
        return Err(refus());
    }
    let mut v = ipc2581::py::float(&c[..fin].iter().collect::<String>()).ok_or_else(refus)?;
    if let Some(k) = c.get(fin).and_then(|s| suffixe(*s)) {
        v *= k;
    }
    Ok(Some(v))
}

/// (typ, min, max).
pub type Trois = [Option<f64>; 3];

/// (typ, min, max) d'une liste de champs ; min et max absents ou « NA »
/// renvoient a typ.
fn trois(champs: &[&str]) -> Result<Trois, Illisible> {
    let mut vals: Trois = [None; 3];
    for (k, c) in champs.iter().take(3).enumerate() {
        vals[k] = nombre(c)?;
    }
    if vals[0].is_none() {
        vals[0] = vals.iter().flatten().next().copied();
    }
    Ok(vals.map(|v| v.or(vals[0])))
}

/// « 1.0/0.5n » -> (1.0, 0.5e-9), ou None.
fn rapport(txt: &str) -> Result<Option<(f64, f64)>, Illisible> {
    let Some((a, b)) = txt.split_once('/') else { return Ok(None) };
    Ok(nombre(a)?.zip(nombre(b)?))
}

/// Le nom d'un mot-cle, normalise : minuscules, espaces et soulignes
/// confondus. « [Rising Waveform] » -> « rising waveform ».
fn cle_de(mot: &str) -> String {
    let mut s = String::new();
    let mut dans = false;
    for c in strip(mot).to_lowercase().chars() {
        if blanc(c) || c == '_' {
            if !dans {
                s.push(' ');
            }
            dans = true;
        } else {
            s.push(c);
            dans = false;
        }
    }
    s
}

pub const TABLEAUX_VI: [&str; 4] = ["pullup", "pulldown", "gnd clamp", "power clamp"];

fn reference(cle: &str) -> Option<&'static str> {
    Some(match cle {
        "voltage range" => "voltage_range",
        "pullup reference" => "pullup_ref",
        "pulldown reference" => "pulldown_ref",
        "power clamp reference" => "power_clamp_ref",
        "gnd clamp reference" => "gnd_clamp_ref",
        "rgnd" => "rgnd",
        "rpower" => "rpower",
        _ => return None,
    })
}

// LE BOITIER ET LES BROCHES (1.1.0), lus quand `lire(..., complet = true)` :
// les mots-cles du [Component] et ceux des modeles de boitier.

/// Les grandeurs d'un boitier, dans l'ordre des dict de Python : r, l, c.
pub const R: usize = 0;
pub const L: usize = 1;
pub const C: usize = 2;
pub const LETTRES: [&str; 3] = ["r", "l", "c"];

fn matrice(cle: &str) -> Option<usize> {
    match cle {
        "resistance matrix" => Some(R),
        "inductance matrix" => Some(L),
        "capacitance matrix" => Some(C),
        _ => None,
    }
}

const MOTS_COMPLETS: [&str; 16] = [
    "package", "pin", "diff pin", "model selector", "package model", "define package model", "end package model",
    "number of sections", "pin numbers", "resistance matrix", "inductance matrix", "capacitance matrix",
    "bandwidth", "row", "algorithmic model", "end algorithmic model",
];
// Ceux d'un [Define Package Model] qui ne portent rien d'utile au calcul :
// lus, et tus.
const DECOR_BOITIER: [&str; 7] =
    ["manufacturer", "oem", "description", "model data", "end model data", "number of pins", "merged pins"];
// Les « modeles » de [Pin] qui n'en sont pas : alimentations et broches
// libres.
pub const BROCHES_PASSIVES: [&str; 4] = ["POWER", "GND", "NC", "NA"];

/// Une forme d'onde sous sa charge d'essai. `autres` : l_fixture, r_dut, l_dut, c_dut, dans
/// l'ordre ou le fichier les donne.
#[derive(Debug, Clone, PartialEq)]
pub struct Onde {
    pub r_fixture: Option<f64>,
    pub v_fixture: Option<f64>,
    pub v_fixture_min: Option<f64>,
    pub v_fixture_max: Option<f64>,
    pub c_fixture: Option<f64>,
    /// (t, typ, min, max)
    pub table: Vec<[f64; 4]>,
    pub autres: IndexMap<String, Option<f64>>,
}

/// Une entree de [Ramp] : dV/dt_r et dV/dt_f (« r », « f ») sont trois rapports, R_load une valeur.
#[derive(Debug, Clone, PartialEq)]
pub enum Rampe {
    Rapports([Option<(f64, f64)>; 3]),
    Charge(Option<f64>),
}

/// Une ligne « Executable » d'un [Algorithmic Model].
#[derive(Debug, Clone, PartialEq)]
pub struct RenvoiAmi {
    pub plateforme: String,
    pub bibliotheque: String,
    pub fichier_ami: String,
}

/// Un [Model]. `refs` : voltage_range, pullup_ref, pulldown_ref, power_clamp_ref,
/// gnd_clamp_ref, rgnd, rpower -- ceux que le fichier donne, dans son ordre.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct Modele {
    pub nom: String,
    pub type_: String,
    pub c_comp: Option<Trois>,
    pub vinl: Option<f64>,
    pub vinh: Option<f64>,
    /// (v, typ, min, max), tries par tension
    pub tableaux: IndexMap<String, Vec<[f64; 4]>>,
    pub rampe: IndexMap<String, Rampe>,
    pub montant: Vec<Onde>,
    pub descendant: Vec<Onde>,
    pub refs: IndexMap<String, Trois>,
    /// le renvoi [Algorithmic Model], en lecture complete
    pub ami: Option<Vec<RenvoiAmi>>,
    // la place de la cle « ami » parmi `refs`, pour rendre le dict dans l'ordre de Python
    pub(crate) rang_ami: usize,
}

/// [Package] : R_pkg, L_pkg, C_pkg (indices R, L, C).
pub type BoitierMoyen = [Option<Trois>; 3];

/// Une ligne de [Pin] ; `rlc` : R_pin, L_pin, C_pin.
#[derive(Debug, Clone, PartialEq)]
pub struct Broche {
    pub nom: String,
    pub signal: String,
    pub modele: String,
    pub rlc: [Option<f64>; 3],
}

/// Une ligne de [Diff Pin] ; `note` vient de `paire_diff`.
#[derive(Debug, Clone, PartialEq)]
pub struct PaireDiff {
    pub broche: String,
    pub inverse: String,
    pub vdiff: Option<f64>,
    pub tdelay: [f64; 3],
    pub note: Option<String>,
}

/// Une section d'un boitier : {len, r, l, c, g}, ou une derivation lue depuis son point de depart.
#[derive(Debug, Clone, PartialEq)]
pub enum Section {
    Ligne { len: f64, r: f64, l: f64, c: f64, g: f64 },
    Fourche(Vec<Section>),
}

/// Un terme hors diagonale : (broche, broche) -> valeur.
pub type Mutuelles = IndexMap<(String, String), f64>;

/// Un [Define Package Model]. `diag` et `mutuelles` : indices R, L, C.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct ModeleBoitier {
    pub nom: String,
    pub broches: Vec<String>,
    pub sections: i64,
    pub genres: IndexMap<&'static str, String>,
    pub diag: [IndexMap<String, f64>; 3],
    pub mutuelles: [Mutuelles; 3],
    pub sections_broche: IndexMap<String, Vec<Section>>,
    // les lignes des matrices, telles que lues : (lettre, rang) -> champs
    lignes: IndexMap<(usize, i64), Vec<String>>,
}

/// Un fichier lu. Les champs apres `ignores` ne sont remplis qu'en lecture complete.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct Lu {
    pub fichier: String,
    pub version: String,
    pub composant: String,
    pub modeles: IndexMap<String, Modele>,
    pub ignores: Vec<String>,
    pub complet: bool,
    pub boitier: Option<BoitierMoyen>,
    pub broches: IndexMap<String, Broche>,
    pub ordre_broches: Vec<String>,
    pub paires_diff: Vec<PaireDiff>,
    pub selecteurs: IndexMap<String, Vec<String>>,
    pub modele_boitier: String,
    pub modeles_boitier: IndexMap<String, ModeleBoitier>,
    pub composants: i64,
}

#[derive(Default)]
struct Etat {
    composants: i64,
    colonnes: Vec<String>,
    selecteur: Option<String>,
    mb: Option<String>,
    matrice: Option<usize>,
    rang: Option<i64>,
    // la broche et la profondeur de derivation ou vont les sections lues
    pile: Option<(String, usize)>,
}

/// Le texte d'un fichier .ibs -> {version, composant, modeles, ignores}.
///
/// `complet` (1.1.0) lit AUSSI le boitier et les broches -- [Package],
/// [Pin], [Diff Pin], [Model Selector], [Package Model],
/// [Define Package Model] -- et le renvoi [Algorithmic Model] de chaque
/// [Model] : voir `boitier_broche`, `paire_diff`, `modele_broche`. Sans
/// lui, la lecture est celle de la 1.0.0 au mot pres, et ces mots-cles
/// sont dits ignores.
///
/// Rend ErreurIbis si aucun [Model] n'est lisible.
pub fn lire(texte: &str, nom_fichier: &str, complet: bool) -> Result<Lu, ErreurIbis> {
    let taille = texte.chars().count();
    if taille > MAX_TEXTE {
        return Err(ErreurIbis::new(
            format!("Fichier IBIS de {} Mo : au-delà de ce que la route accepte.", pct_f(taille as f64 / 1e6, 1)),
            "Extrayez le [Model] utile dans un fichier à part.",
        ));
    }
    let mut commentaire = '|';
    let mut res = Lu { fichier: nom_fichier.to_string(), complet, ..Lu::default() };
    let mut modele: Option<String> = None;
    let mut section: Option<String> = None; // le mot-cle en cours, normalise
    let mut onde: Option<bool> = None; // la forme d'onde en cours : la derniere montante (true) ou descendante
    let mut etat = Etat::default();
    let mut ignores = BTreeSet::new();
    for (n_ligne, brute) in splitlines(texte).into_iter().enumerate() {
        let n_ligne = n_ligne + 1;
        let mut ligne = brute;
        if ligne.trim_start_matches(blanc).to_lowercase().starts_with("[comment char]") {
            if let Some(c) = ligne.split_once(']').and_then(|(_, r)| strip(r).chars().next()) {
                commentaire = c;
            }
            continue;
        }
        if let Some(i) = ligne.find(commentaire) {
            ligne = &ligne[..i];
        }
        let ligne = strip(ligne);
        if ligne.is_empty() {
            continue;
        }
        if let Some(reste) = ligne.strip_prefix('[') {
            let Some((mot, arg)) = reste.split_once(']') else { continue };
            let cle = cle_de(mot);
            let cle = cle.as_str();
            let arg = strip(arg);
            section = Some(cle.to_string());
            onde = None;
            if complet && (MOTS_COMPLETS.contains(&cle) || (etat.mb.is_some() && DECOR_BOITIER.contains(&cle))) {
                mot_complet(&mut res, &mut etat, cle, arg, modele.as_deref())?;
                continue;
            }
            let actuel = modele.as_ref().and_then(|n| res.modeles.get_mut(n));
            if cle == "ibis ver" {
                res.version = arg.to_string();
            } else if cle == "component" {
                if res.composant.is_empty() {
                    res.composant = arg.to_string();
                }
                etat.composants += 1;
            } else if cle == "model" {
                let nom = match split(arg).first() {
                    Some(n) => n.to_string(),
                    None => format!("modele{}", res.modeles.len() + 1),
                };
                res.modeles.insert(nom.clone(), Modele { nom: nom.clone(), ..Modele::default() });
                modele = Some(nom);
            } else if matches!(cle, "end" | "end model" | "end component") {
                section = None;
            } else if let (Some(m), Some(r)) = (actuel, reference(cle)) {
                let champs = split(arg);
                if !champs.is_empty() {
                    // hors de tout `try` dans ibis.py : une valeur illisible y plantait
                    let v = trois(&champs).map_err(Illisible::plantage)?;
                    m.refs.insert(r.to_string(), v);
                }
                section = None;
            } else if cle == "submodel" {
                // ses tableaux ne sont pas ceux du [Model] precedent (ODT des .ibs DDR)
                modele = None;
                ignores.insert(format!("[{}]", strip(mot)));
            } else if let (Some(m), true) = (modele.as_ref().and_then(|n| res.modeles.get_mut(n)), TABLEAUX_VI.contains(&cle))
            {
                m.tableaux.insert(cle.to_string(), Vec::new());
            } else if let (Some(m), true) = (
                modele.as_ref().and_then(|n| res.modeles.get_mut(n)),
                matches!(cle, "rising waveform" | "falling waveform"),
            ) {
                let o = Onde {
                    r_fixture: None,
                    v_fixture: None,
                    v_fixture_min: None,
                    v_fixture_max: None,
                    c_fixture: Some(0.0),
                    table: Vec::new(),
                    autres: IndexMap::new(),
                };
                let montante = cle.starts_with("rising");
                if montante { &mut m.montant } else { &mut m.descendant }.push(o);
                onde = Some(montante);
            } else if modele.is_some() && cle == "ramp" {
            } else if !matches!(
                cle,
                "file name" | "file rev" | "date" | "source" | "notes" | "disclaimer" | "copyright" | "manufacturer"
                    | "model spec" | "receiver thresholds" | "temperature range"
            ) {
                ignores.insert(format!("[{}]", strip(mot)));
            }
            continue;
        }
        let section = section.as_deref().unwrap_or("");
        // -- le boitier et les broches, en lecture complete ------------------
        if complet && MOTS_COMPLETS.contains(&section) {
            if ligne_complete(&mut res, &mut etat, section, ligne, modele.as_deref()).is_err() {
                return Err(ErreurIbis::new(
                    format!("Ligne {} illisible dans [{}] : « {} ».", n_ligne, section, strip(brute)),
                    "Vérifiez le fichier : une valeur IBIS n'a que des chiffres, un suffixe et « NA ».",
                ));
            }
            continue;
        }
        let Some(m) = modele.as_ref().and_then(|n| res.modeles.get_mut(n)) else { continue };
        let espace = ligne.replace('=', " = ");
        let champs = split(&espace);
        let k = champs[0].to_lowercase();
        let k = k.as_str();
        let vals: Vec<&str> = champs[1..].iter().copied().filter(|c| *c != "=").collect();
        // -- les sous-parametres du [Model] ---------------------------------
        if section == "model" {
            let lu = (|| -> Result<(), Illisible> {
                if let Some(v) = vals.first() {
                    match k {
                        "model_type" => m.type_ = v.to_string(),
                        "c_comp" => m.c_comp = Some(trois(&vals)?),
                        "vinl" => m.vinl = nombre(v)?,
                        "vinh" => m.vinh = nombre(v)?,
                        _ => {}
                    }
                }
                Ok(())
            })();
            if lu.is_err() {
                return Err(ErreurIbis::new(
                    format!("Ligne {} illisible dans le [Model] {} : « {} ».", n_ligne, m.nom, strip(brute)),
                    "",
                ));
            }
            continue;
        }
        let lu = (|| -> Result<(), Illisible> {
            let fin = champs.len().min(4);
            if TABLEAUX_VI.contains(&section) {
                if champs.len() >= 2 {
                    let v = nombre(champs[0])?;
                    let i = trois(&champs[1..fin])?;
                    if let (Some(v), [Some(a), Some(b), Some(c)]) = (v, i) {
                        // la section n'a pu s'ouvrir que sur ce modele : son tableau existe
                        m.tableaux.entry(section.to_string()).or_default().push([v, a, b, c]);
                    }
                }
            } else if section == "ramp" {
                if k == "dv/dt_r" || k == "dv/dt_f" {
                    let mut rr = [None; 3];
                    for (x, c) in vals.iter().take(3).enumerate() {
                        rr[x] = rapport(c)?;
                    }
                    let rr = rr.map(|x| x.or(rr[0]));
                    m.rampe.insert(k[k.len() - 1..].to_string(), Rampe::Rapports(rr));
                } else if let ("r_load", Some(v)) = (k, vals.first()) {
                    m.rampe.insert("r_load".to_string(), Rampe::Charge(nombre(v)?));
                }
            } else if let (true, Some(montante)) = (matches!(section, "rising waveform" | "falling waveform"), onde) {
                // la derniere forme d'onde du modele : celle que ce mot-cle a ouverte
                let Some(o) = if montante { &mut m.montant } else { &mut m.descendant }.last_mut() else {
                    return Ok(());
                };
                if matches!(
                    k,
                    "r_fixture" | "v_fixture" | "v_fixture_min" | "v_fixture_max" | "c_fixture" | "l_fixture"
                        | "r_dut" | "l_dut" | "c_dut"
                ) {
                    if let Some(v) = vals.first() {
                        let v = nombre(v)?;
                        match k {
                            "r_fixture" => o.r_fixture = v,
                            "v_fixture" => o.v_fixture = v,
                            "v_fixture_min" => o.v_fixture_min = v,
                            "v_fixture_max" => o.v_fixture_max = v,
                            "c_fixture" => o.c_fixture = v,
                            _ => {
                                o.autres.insert(k.to_string(), v);
                            }
                        }
                    }
                } else if champs.len() >= 2 {
                    let t = nombre(champs[0])?;
                    let v = trois(&champs[1..fin])?;
                    if let (Some(t), [Some(a), Some(b), Some(c)]) = (t, v) {
                        o.table.push([t, a, b, c]);
                    }
                }
            }
            Ok(())
        })();
        if lu.is_err() {
            return Err(ErreurIbis::new(
                format!("Ligne {} illisible dans le [Model] {} : « {} ».", n_ligne, m.nom, strip(brute)),
                "Vérifiez le fichier : un tableau IBIS n'a que des nombres, des suffixes et « NA ».",
            ));
        }
    }
    if res.modeles.is_empty() {
        return Err(ErreurIbis::new("Aucun [Model] dans ce fichier IBIS.", "Le fichier est-il bien un .ibs ?"));
    }
    for m in res.modeles.values_mut() {
        for tab in m.tableaux.values_mut() {
            tab.sort_by(|a, b| a[0].partial_cmp(&b[0]).unwrap_or(std::cmp::Ordering::Equal));
        }
    }
    if complet {
        res.composants = etat.composants;
        for mb in res.modeles_boitier.values_mut() {
            matrices(mb)?;
        }
    }
    res.ignores = ignores.into_iter().collect();
    Ok(res)
}

// ==========================================================================
// Le boitier et les broches
// --------------------------------------------------------------------------
// CE QUE LA NORME EN DIT, et ce qui est lu :
//   [Package]   R_pkg, L_pkg, C_pkg (typ/min/max) : le boitier MOYEN, celui
//               de toute broche qui n'en dit pas plus ;
//   [Pin]       nom, signal, modele, et R_pin, L_pin, C_pin facultatifs (une
//               seule colonne) : ils PRIMENT sur [Package], valeur par
//               valeur -- un « NA » renvoie a [Package] ;
//   [Package Model] nom -> [Define Package Model] : des matrices R, L, C
//               par broche (pleine, en bande ou creuse). Elles priment sur
//               les deux autres. On en prend la DIAGONALE ; les mutuelles
//               sont lues pour etre DITES (le plus fort couplage), et celles
//               entre les deux broches d'une paire se rendent pour etre
//               COMPTEES (1.2.0, `mutuelle_paire`). Une description par
//               sections (Len=, [Number Of Sections]) se lit broche par
//               broche (1.2.0, `ligne_sections`) et devient une cascade de
//               lignes (`abcd_sections`) ; une broche sans section retombe
//               sur [Pin] et [Package], et on le dit ;
//   [Diff Pin]  broche, broche inverse, vdiff, tdelay typ/min/max ;
//   [Model Selector] : un nom de [Pin] qui designe plusieurs modeles, le
//               premier etant celui par defaut.
// LA TOPOLOGIE, celle des simulateurs IBIS : C_comp au die, puis R_pkg et
// L_pkg en serie, puis C_pkg a la broche, vers la masse. Les colonnes
// min/max de [Package] suivent le coin choisi pour le tampon.
// ==========================================================================

fn mb_courant<'a>(res: &'a mut Lu, etat: &Etat) -> Option<&'a mut ModeleBoitier> {
    res.modeles_boitier.get_mut(etat.mb.as_ref()?)
}

/// Un mot-cle du boitier ou des broches : l'etat qu'il ouvre.
fn mot_complet(res: &mut Lu, etat: &mut Etat, cle: &str, arg: &str, modele: Option<&str>) -> Result<(), ErreurIbis> {
    let premier_mot = split(arg).first().map(|m| m.to_string());
    if cle == "model selector" {
        let s = premier_mot.unwrap_or_default();
        res.selecteurs.entry(s.clone()).or_default();
        etat.selecteur = Some(s);
    } else if cle == "package model" {
        if let (Some(nom), true, true) = (premier_mot, res.modele_boitier.is_empty(), etat.composants <= 1) {
            res.modele_boitier = nom;
        }
    } else if cle == "define package model" {
        let mb = ModeleBoitier { nom: premier_mot.unwrap_or_default(), ..ModeleBoitier::default() };
        (etat.mb, etat.matrice, etat.rang, etat.pile) = (Some(mb.nom.clone()), None, None, None);
        res.modeles_boitier.insert(mb.nom.clone(), mb);
    } else if cle == "end package model" {
        (etat.mb, etat.matrice, etat.rang) = (None, None, None);
    } else if let Some(mb) = mb_courant(res, etat) {
        if let Some(lettre) = matrice(cle) {
            etat.matrice = Some(lettre);
            mb.genres.insert(LETTRES[lettre], premier_mot.unwrap_or_else(|| "full_matrix".into()).to_lowercase());
            etat.rang = None;
        } else if cle == "row" {
            etat.rang = rang(mb, arg)?;
        } else if cle == "number of sections" {
            mb.sections = match nombre(arg) {
                Ok(v) => int(v.unwrap_or(0.0)).ok_or_else(|| {
                    ErreurIbis::plantage("OverflowError", "cannot convert float infinity to integer")
                })?,
                Err(_) => 0,
            };
        } else {
            mots_hors_boitier(res, etat, cle, arg, modele);
        }
    } else {
        mots_hors_boitier(res, etat, cle, arg, modele);
    }
    Ok(())
}

fn mots_hors_boitier(res: &mut Lu, etat: &mut Etat, cle: &str, arg: &str, modele: Option<&str>) {
    if cle == "pin" {
        etat.colonnes = split(arg).iter().map(|c| c.to_lowercase()).collect();
    } else if cle == "algorithmic model" {
        if let Some(m) = modele.and_then(|n| res.modeles.get_mut(n)) {
            renvois(m);
        }
    }
}

/// modele.setdefault("ami", [])
fn renvois(m: &mut Modele) -> &mut Vec<RenvoiAmi> {
    if m.ami.is_none() {
        m.rang_ami = m.refs.len();
    }
    m.ami.get_or_insert_with(Vec::new)
}

/// L'indice (0..N-1) de la broche d'une [Row] : son nom dans
/// [Pin Numbers], ou son rang compte depuis 1.
fn rang(mb: &ModeleBoitier, arg: &str) -> Result<Option<i64>, ErreurIbis> {
    let a = split(arg).first().copied().unwrap_or("");
    if let Some(i) = mb.broches.iter().position(|b| b == a) {
        return Ok(Some(i as i64));
    }
    let Some(f) = ipc2581::py::float(a) else { return Ok(None) };
    if f.is_nan() {
        return Ok(None);
    }
    let k = int(f)
        .ok_or_else(|| ErreurIbis::plantage("OverflowError", "cannot convert float infinity to integer"))?
        .saturating_sub(1);
    Ok((k >= 0).then_some(k))
}

/// Une ligne de donnees du boitier ou des broches.
fn ligne_complete(res: &mut Lu, etat: &mut Etat, section: &str, ligne: &str, modele: Option<&str>) -> Result<(), Illisible> {
    let espace = ligne.replace('=', " = ");
    let champs = split(&espace);
    let bruts = split(ligne);
    let premier = etat.composants <= 1;
    if section == "package" && premier {
        let k = champs[0].to_lowercase();
        let vals: Vec<&str> = champs[1..].iter().copied().filter(|c| *c != "=").collect();
        let lettre = match k.as_str() {
            "r_pkg" => R,
            "l_pkg" => L,
            "c_pkg" => C,
            _ => return Ok(()),
        };
        if !vals.is_empty() {
            let v = trois(&vals)?;
            res.boitier.get_or_insert([None; 3])[lettre] = Some(v);
        }
    } else if section == "pin" && premier {
        if bruts.len() < 3 {
            return Ok(());
        }
        let mut b = Broche { nom: bruts[0].into(), signal: bruts[1].into(), modele: bruts[2].into(), rlc: [None; 3] };
        // Les colonnes R/L/C_pin, a la place que leur donne l'en-tete.
        for (j, col) in etat.colonnes.iter().enumerate() {
            let lettre = match col.as_str() {
                "r_pin" => R,
                "l_pin" => L,
                "c_pin" => C,
                _ => continue,
            };
            if j + 1 < bruts.len() {
                b.rlc[lettre] = nombre(bruts[j + 1])?;
            }
        }
        if !res.broches.contains_key(&b.nom) {
            res.ordre_broches.push(b.nom.clone());
        }
        res.broches.insert(b.nom.clone(), b);
    } else if section == "diff pin" && premier {
        if bruts.len() < 2 {
            return Ok(());
        }
        let vdiff = if bruts.len() > 2 { nombre(bruts[2])? } else { None };
        let td = if bruts.len() > 3 { trois(&bruts[3..bruts.len().min(6)])? } else { [None; 3] };
        res.paires_diff.push(PaireDiff {
            broche: bruts[0].into(),
            inverse: bruts[1].into(),
            vdiff,
            tdelay: td.map(|x| x.unwrap_or(0.0)),
            note: None,
        });
    } else if section == "model selector" && etat.selecteur.is_some() {
        if let Some(s) = etat.selecteur.as_ref().and_then(|s| res.selecteurs.get_mut(s)) {
            s.push(champs[0].to_string());
        }
    } else if section == "pin numbers" && etat.mb.is_some() {
        ligne_sections(res, etat, ligne)?;
    } else if section == "row" && etat.mb.is_some() {
        if let (Some(lettre), Some(r)) = (etat.matrice, etat.rang) {
            if let Some(mb) = mb_courant(res, etat) {
                mb.lignes.entry((lettre, r)).or_default().extend(bruts.iter().map(|c| c.to_string()));
            }
        }
    } else if section == "algorithmic model" {
        if let Some(m) = modele.and_then(|n| res.modeles.get_mut(n)) {
            if bruts.len() >= 4 && bruts[0].to_lowercase().starts_with("executable") {
                renvois(m).push(RenvoiAmi {
                    plateforme: bruts[1].into(),
                    bibliotheque: bruts[2].into(),
                    fichier_ami: bruts[3].into(),
                });
            }
        }
    }
    Ok(())
}

/// La liste ou vont les sections : celle de la broche, ou la derivation ouverte la plus profonde.
fn liste_ouverte<'a>(mb: &'a mut ModeleBoitier, broche: &str, profondeur: usize) -> &'a mut Vec<Section> {
    let mut l = mb.sections_broche.entry(broche.to_string()).or_default();
    for _ in 0..profondeur {
        l = match l.last_mut() {
            Some(Section::Fourche(f)) => f,
            // une derivation ouverte est le dernier element de sa liste : rien ne s'y ajoute avant « Endfork »
            _ => unreachable!("derivation ouverte sans son element"),
        };
    }
    l
}

/// Une ligne de [Pin Numbers] : une broche, et ses sections s'il y en a
/// (1.2.0) -- « A1 Len=0 L=1.2n / », puis « Len=1.2 L=2.3n C=4.3p / » sur
/// les lignes suivantes, « Fork » ... « Endfork » pour une derivation.
/// Les sections se rangent dans `sections_broche[broche]` dans l'ordre du
/// fichier, DU DIE VERS LA BROCHE (le fil de cablage d'abord, comme
/// l'exemple de la norme), chacune {len, r, l, c, g} -- ou {fourche: [...]},
/// une derivation lue depuis son point de depart.
fn ligne_sections(res: &mut Lu, etat: &mut Etat, ligne: &str) -> Result<(), Illisible> {
    let Some(nom_mb) = etat.mb.clone() else { return Ok(()) };
    let Some(mb) = res.modeles_boitier.get_mut(&nom_mb) else { return Ok(()) };
    let espace = ligne.replace('=', " = ").replace('/', " / ");
    let mut jetons = split(&espace);
    if jetons.is_empty() {
        return Ok(());
    }
    if !matches!(jetons[0].to_lowercase().as_str(), "len" | "fork" | "endfork") {
        mb.broches.push(jetons[0].to_string());
        mb.sections_broche.entry(jetons[0].to_string()).or_default();
        etat.pile = Some((jetons[0].to_string(), 0));
        jetons.remove(0);
    }
    let Some((broche, profondeur)) = etat.pile.as_mut() else { return Ok(()) };
    // les valeurs de la section en cours ; `ouverte` : une cle au moins y est posee, connue ou non
    let mut courant: [Option<f64>; 5] = [None; 5];
    let mut ouverte = false;
    fn poser(mb: &mut ModeleBoitier, broche: &str, profondeur: usize, courant: &mut [Option<f64>; 5], ouverte: &mut bool) {
        if *ouverte {
            let v = courant.map(|x| x.unwrap_or(0.0));
            liste_ouverte(mb, broche, profondeur).push(Section::Ligne { len: v[0], r: v[1], l: v[2], c: v[3], g: v[4] });
            *courant = [None; 5];
            *ouverte = false;
            mb.sections = mb.sections.max(1);
        }
    }
    let mut i = 0;
    while i < jetons.len() {
        let j = jetons[i];
        let jl = j.to_lowercase();
        if jl == "fork" {
            poser(mb, broche, *profondeur, &mut courant, &mut ouverte);
            liste_ouverte(mb, broche, *profondeur).push(Section::Fourche(Vec::new()));
            *profondeur += 1;
        } else if jl == "endfork" {
            poser(mb, broche, *profondeur, &mut courant, &mut ouverte);
            *profondeur = profondeur.saturating_sub(1);
        } else if j == "/" {
            poser(mb, broche, *profondeur, &mut courant, &mut ouverte);
        } else if i + 2 < jetons.len() && jetons[i + 1] == "=" {
            let v = nombre(jetons[i + 2])?;
            if let Some(k) = ["len", "r", "l", "c", "g"].iter().position(|x| *x == jl) {
                courant[k] = v;
            }
            ouverte = true;
            i += 3;
            continue;
        }
        i += 1;
    }
    poser(mb, broche, *profondeur, &mut courant, &mut ouverte);
    Ok(())
}

/// {r, l, c} d'une suite de sections : les valeurs par unite de longueur
/// multipliees par la longueur, les localisees telles quelles ; la
/// capacite d'une derivation s'ajoute.
pub(crate) fn totaux_sections(sections: &[Section]) -> [f64; 3] {
    let mut tot = [0.0; 3];
    for s in sections {
        match s {
            Section::Fourche(f) => tot[C] += totaux_sections(f)[C],
            Section::Ligne { len, r, l, c, .. } => {
                let k = if *len > 0.0 { *len } else { 1.0 };
                tot[R] += r * k;
                tot[L] += l * k;
                tot[C] += c * k;
            }
        }
    }
    tot
}

/// Les matrices d'un modele de boitier -> diagonale et mutuelles.
fn matrices(mb: &mut ModeleBoitier) -> Result<(), ErreurIbis> {
    let n = mb.broches.len() as i64;
    for ((lettre, i), vals) in std::mem::take(&mut mb.lignes) {
        let creuse = mb.genres.get(LETTRES[lettre]).is_some_and(|g| g.starts_with("sparse"));
        if !(0..n).contains(&i) {
            continue;
        }
        let mut ligne = Vec::new();
        if creuse {
            for j in (0..vals.len().saturating_sub(1)).step_by(2) {
                if let Some(col) = rang(mb, &vals[j])? {
                    ligne.push((col, nombre(&vals[j + 1]).map_err(Illisible::plantage)?));
                }
            }
        } else {
            // Pleine ou en bande : la ligne i part de la diagonale.
            for (k, v) in vals.iter().enumerate() {
                ligne.push((i + k as i64, nombre(v).map_err(Illisible::plantage)?));
            }
        }
        for (col, v) in ligne {
            let Some(v) = v else { continue };
            if !(0..n).contains(&col) {
                continue;
            }
            let (a, b) = (mb.broches[i as usize].clone(), mb.broches[col as usize].clone());
            if col == i {
                mb.diag[lettre].insert(a, v);
            } else if v != 0.0 {
                mb.mutuelles[lettre].insert((a, b), v);
            }
        }
    }
    Ok(())
}

/// Les coefficients de couplage les plus forts d'une broche, en L et en C.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Couplage {
    pub l: f64,
    pub c: f64,
}

fn couplage(diag: &[IndexMap<String, f64>; 3], mutuelles: &[Mutuelles; 3], a: &str, b: Option<&str>, sauf: Option<&str>) -> Couplage {
    let un = |lettre: usize| {
        let d = &diag[lettre];
        let mut k_max = 0.0;
        for ((i, j), v) in &mutuelles[lettre] {
            let dans = |x: &str| x == i || x == j;
            if !dans(a) || b.is_some_and(|b| !dans(b)) {
                continue;
            }
            if sauf.is_some_and(dans) {
                continue;
            }
            if let (Some(di), Some(dj)) = (d.get(i).filter(|x| **x != 0.0), d.get(j).filter(|x| **x != 0.0)) {
                k_max = crate::py::max(k_max, v.abs() / (di * dj).abs().sqrt());
            }
        }
        k_max
    };
    Couplage { l: un(L), c: un(C) }
}

/// Le coefficient de couplage |Mij| / sqrt(Mii Mjj) le plus fort de la
/// broche `a` (avec `b` seule si elle est donnee, hors `sauf` sinon), en L
/// et en C.
pub fn couplage_boitier(mb: &ModeleBoitier, a: &str, b: Option<&str>, sauf: Option<&str>) -> Couplage {
    couplage(&mb.diag, &mb.mutuelles, a, b, sauf)
}

/// (nom du [Model], note) de la broche `broche` d'un fichier lu en
/// entier. Un [Model Selector] rend `voulu` s'il en fait partie, son
/// premier modele sinon. Rend ErreurIbis pour une broche inconnue ou
/// passive (POWER, GND, NC).
pub fn modele_broche(lu: &Lu, broche: &str, voulu: &str) -> Result<(String, String), ErreurIbis> {
    let Some(b) = lu.broches.get(broche) else {
        return Err(ErreurIbis::new(
            format!("Pas de broche « {broche} » dans [Pin]."),
            "Choisissez une broche de la liste.",
        ));
    };
    let nom = &b.modele;
    if BROCHES_PASSIVES.contains(&nom.to_uppercase().as_str()) {
        return Err(ErreurIbis::new(
            format!("La broche {broche} est {nom} : elle n'a pas de tampon."),
            "Choisissez une broche de signal.",
        ));
    }
    if let Some(sel) = lu.selecteurs.get(nom).filter(|s| !s.is_empty()) {
        if sel.iter().any(|s| s == voulu) {
            return Ok((voulu.to_string(), format!("{voulu} parmi le sélecteur {nom}")));
        }
        return Ok((sel[0].clone(), format!("{}, premier du sélecteur {}", sel[0], nom)));
    }
    if !lu.modeles.contains_key(nom) {
        return Err(ErreurIbis::new(
            format!("La broche {broche} renvoie au [Model] « {nom} », absent du fichier."),
            "Le fichier est-il complet ?",
        ));
    }
    Ok((nom.clone(), String::new()))
}

/// L'entree de [Diff Pin] de `broche` : {broche, inverse, vdiff, tdelay,
/// note}, ou None. Une broche donnee par son INVERSE rend la paire
/// retournee, tdelay de signe oppose.
pub fn paire_diff(lu: &Lu, broche: &str) -> Option<PaireDiff> {
    for p in &lu.paires_diff {
        if p.broche == broche {
            return Some(PaireDiff { note: Some(String::new()), ..p.clone() });
        }
        if p.inverse == broche {
            return Some(PaireDiff {
                broche: p.inverse.clone(),
                inverse: p.broche.clone(),
                vdiff: p.vdiff,
                tdelay: p.tdelay.map(|x| -x),
                note: Some("paire prise par sa broche inverse".into()),
            });
        }
    }
    None
}

/// Le boitier d'une broche, tel que `boitier_broche` le rend.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct Boitier {
    pub r: f64,
    pub l: f64,
    pub c: f64,
    pub source: String,
    pub notes: Vec<String>,
    pub sections: Option<Vec<Section>>,
}

impl Boitier {
    /// {"r": r, "l": l, "c": c} : le boitier localise qu'un banc ecrit a la main.
    pub fn rlc(r: f64, l: f64, c: f64) -> Boitier {
        Boitier { r, l, c, ..Boitier::default() }
    }
}

/// Le boitier d'une broche : {r, l, c (SI), source, notes, sections}.
///
/// Priorite, valeur par valeur : [Define Package Model] (diagonale), puis
/// [Pin], puis [Package] a la colonne du coin. Sans rien de tout cela,
/// r = l = c = 0. Une broche DECRITE PAR SECTIONS (1.2.0) les porte dans
/// `sections` -- r, l, c en sont alors les totaux, pour les dire -- et
/// elles remplacent tout le reste.
///
/// `comptee` : l'autre broche de la paire, dont la mutuelle est comptee
/// ailleurs (`mutuelle_paire`) -- la note ne dit que les autres.
pub fn boitier_broche(lu: &Lu, broche: &str, coin: &str, comptee: Option<&str>) -> Boitier {
    let col = crate::coin(coin).unwrap_or(0);
    let comptee = comptee.filter(|c| !c.is_empty());
    let mut notes = Vec::new();
    let mut val = [0.0; 3];
    let mut src = [String::new(), String::new(), String::new()];
    let mut sections = None;
    if let Some(pk) = &lu.boitier {
        for k in 0..3 {
            if let Some(v) = pk[k].and_then(|t| t[col]) {
                (val[k], src[k]) = (v, "[Package]".into());
            }
        }
    }
    if let Some(b) = lu.broches.get(broche).filter(|_| !broche.is_empty()) {
        for k in 0..3 {
            if let Some(v) = b.rlc[k] {
                (val[k], src[k]) = (v, "[Pin]".into());
            }
        }
    }
    let nom_mb = &lu.modele_boitier;
    if !nom_mb.is_empty() && !broche.is_empty() {
        match lu.modeles_boitier.get(nom_mb) {
            None => notes.push(format!("[Package Model] {nom_mb} défini hors du fichier (.pkg) : non lu.")),
            Some(mb) => {
                if let Some(s) = mb.sections_broche.get(broche).filter(|s| !s.is_empty()) {
                    val = totaux_sections(s);
                    src = [(); 3].map(|_| format!("[Package Model] {} ({} section(s))", nom_mb, s.len()));
                    sections = Some(s.clone());
                } else if mb.sections != 0 {
                    notes.push(format!(
                        "[Package Model] {nom_mb} décrit par sections, mais pas la broche {broche} : [Pin] et \
                         [Package] la décrivent."
                    ));
                } else if mb.broches.iter().any(|b| b == broche) {
                    for k in 0..3 {
                        if let Some(v) = mb.diag[k].get(broche) {
                            val[k] = *v;
                            src[k] = format!("[Package Model] {nom_mb}");
                        }
                    }
                    let kc = couplage_boitier(mb, broche, None, comptee);
                    if kc.l > 0.0 || kc.c > 0.0 {
                        notes.push(match comptee {
                            Some(comptee) => format!(
                                "Mutuelles du [Package Model] hors de la paire {}/{} ignorées (couplage le plus \
                                 fort de {} : k_L {}, k_C {}).",
                                broche, comptee, broche, pct_f(kc.l, 2), pct_f(kc.c, 2)
                            ),
                            None => format!(
                                "Mutuelles du [Package Model] ignorées (couplage le plus fort de {} : k_L {}, k_C {}).",
                                broche, pct_f(kc.l, 2), pct_f(kc.c, 2)
                            ),
                        });
                    }
                }
            }
        }
    }
    let sources: BTreeSet<&str> = src.iter().map(|s| s.as_str()).filter(|s| !s.is_empty()).collect();
    Boitier {
        r: val[R],
        l: val[L],
        c: val[C],
        source: if sources.is_empty() { "aucun".into() } else { sources.into_iter().collect::<Vec<_>>().join(" + ") },
        notes,
        sections,
    }
}

/// Les mutuelles entre les deux broches d'une paire, telles que `mutuelle_paire` les rend.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct Mutuelle {
    pub r: f64,
    pub l: f64,
    pub c: f64,
    pub k_l: f64,
    pub k_c: f64,
    pub source: String,
}

pub(crate) fn mutuelle(m: &Mutuelles, a: &str, b: &str) -> Option<f64> {
    m.get(&(a.to_string(), b.to_string())).or_else(|| m.get(&(b.to_string(), a.to_string()))).copied()
}

/// LES MUTUELLES DU [Package Model] ENTRE LES DEUX BROCHES D'UNE PAIRE
/// (1.2.0) : {r, l, c, k_l, k_c, source} en SI, ou None.
///
/// `l` et `r` sont les termes hors diagonale des matrices ; `c` est la
/// capacite de COUPLAGE, positive -- la norme ecrit la matrice de Maxwell,
/// terme hors diagonale negatif, et des fichiers l'ecrivent positif : on en
/// prend la valeur absolue. La diagonale reste celle de Maxwell (capacite
/// totale de la broche) : en mode impair, chaque broche voit C + C_m ; en
/// mode pair, C - C_m. Une broche decrite par sections n'a pas de mutuelle
/// lue.
pub fn mutuelle_paire(lu: &Lu, a: &str, b: &str) -> Option<Mutuelle> {
    let nom = &lu.modele_boitier;
    let mb = lu.modeles_boitier.get(nom)?;
    let dans = |x: &str| mb.broches.iter().any(|y| y == x);
    if a.is_empty() || b.is_empty() || !dans(a) || !dans(b) {
        return None;
    }
    let sec = |x: &str| mb.sections_broche.get(x).is_some_and(|s| !s.is_empty());
    if sec(a) || sec(b) {
        return None;
    }
    let vals = [R, L, C].map(|k| mutuelle(&mb.mutuelles[k], a, b).unwrap_or(0.0));
    if vals.iter().all(|v| *v == 0.0) {
        return None;
    }
    let kc = couplage_boitier(mb, a, Some(b), None);
    Some(Mutuelle {
        r: vals[R],
        l: vals[L],
        c: vals[C].abs(),
        k_l: kc.l,
        k_c: kc.c,
        source: format!("[Package Model] {nom}"),
    })
}

// --------------------------------------------------------------------------
// LES MUTUELLES HORS DE LA PAIRE (1.4.0)
// --------------------------------------------------------------------------
// Une broche du [Package Model] couple a ses VOISINES, pas seulement a
// l'inverse de sa paire. Celles-ci ne sont pas dans la liaison : elles sont
// AU REPOS, fermees a chaque bout -- sur leur tampon cote die, sur leur piste
// cote carte --, et ce qu'elles font a la broche est ce qu'elles renvoient
// dans ses mutuelles : en serie, Z - Z_m^2 / (Z_v + terminaisons) ; a la
// broche, la capacite de Maxwell entiere (diagonale), dont la part vers les
// voisines tenues au repos retourne a la masse par elles.
//
// LE CALCUL : le boitier de TOUTES les broches couplees, R + jwL en serie
// (matrices pleines) et jwC a la broche (Maxwell : hors diagonale -|C_ij|),
// en ABCD 2N x 2N, passe en admittances ; chaque voisine recoit sa
// terminaison aux deux bouts, puis elle est ELIMINEE (reduction de Kron) --
// il ne reste que les broches de la liaison, et l'ABCD 2m x 2m qu'on pose
// a la place du boitier. Une voisine POWER ou GND est un court-circuit
// (alimentation decouplee), une NC est ouverte ; les autres sont fermees sur
// `r_voisin` (50 ohms par defaut, ce qu'on ne connait pas mieux).
//
// CE QUI N'EXISTE PAS : les mutuelles d'un boitier PAR SECTIONS. [Number Of
// Sections] et [Model Data] (les matrices) s'excluent dans la norme (BIRD 54) :
// une broche decrite par sections n'est couplee a rien.
// --------------------------------------------------------------------------

/// Les broches couplees a celles de la liaison, telles que `voisins_boitier` les rend.
/// `r_voisin` : la cle que l'oeil y ajoute (50 ohms tant qu'il ne l'a pas fait).
#[derive(Debug, Clone, PartialEq)]
pub struct Couple {
    pub nom: String,
    /// victimes puis voisines
    pub conducteurs: Vec<String>,
    pub victimes: usize,
    pub voisines: Vec<String>,
    /// broche -> « signal » | « court » | « ouvert »
    pub genres: IndexMap<String, String>,
    pub diag: [IndexMap<String, f64>; 3],
    pub mutuelles: [Mutuelles; 3],
    pub k_max: f64,
    pub r_voisin: f64,
}

/// Les broches du [Package Model] couplees aux broches `victimes` de la
/// liaison : {nom, conducteurs (victimes puis voisines), genres {broche:
/// "signal" | "court" | "ouvert"}, diag, mutuelles, k_max}, ou None --
/// pas de modele de boitier, une victime absente ou decrite par sections,
/// ou aucune voisine couplee.
pub fn voisins_boitier(lu: &Lu, victimes: &[&str]) -> Option<Couple> {
    let nom = &lu.modele_boitier;
    let mb = lu.modeles_boitier.get(nom)?;
    let victimes: Vec<&str> = victimes.iter().copied().filter(|v| !v.is_empty()).collect();
    let dans = |x: &str| mb.broches.iter().any(|y| y == x);
    if victimes.is_empty() || victimes.iter().any(|v| !dans(v)) {
        return None;
    }
    let sec = |x: &str| mb.sections_broche.get(x).is_some_and(|s| !s.is_empty());
    if victimes.iter().any(|v| sec(v)) {
        return None;
    }
    let mut voisines: Vec<String> = Vec::new();
    for lettre in [L, C, R] {
        for ((i, j), val) in &mb.mutuelles[lettre] {
            if *val == 0.0 {
                continue;
            }
            for (a, b) in [(i, j), (j, i)] {
                if victimes.contains(&a.as_str()) && !victimes.contains(&b.as_str()) && !voisines.contains(b) && dans(b) && !sec(b)
                {
                    voisines.push(b.clone());
                }
            }
        }
    }
    if voisines.is_empty() {
        return None;
    }
    let mut genres = IndexMap::new();
    for b in &voisines {
        let m = lu.broches.get(b).map(|x| x.modele.to_uppercase()).unwrap_or_default();
        genres.insert(
            b.clone(),
            if m == "POWER" || m == "GND" { "court" } else if m == "NC" { "ouvert" } else { "signal" }.to_string(),
        );
    }
    let mut k_max = 0.0;
    for v in &victimes {
        for b in &voisines {
            let kb = couplage_boitier(mb, v, Some(b), None);
            k_max = crate::py::max(crate::py::max(k_max, kb.l), kb.c);
        }
    }
    Some(Couple {
        nom: nom.clone(),
        conducteurs: victimes.iter().map(|v| v.to_string()).chain(voisines.iter().cloned()).collect(),
        victimes: victimes.len(),
        voisines,
        genres,
        diag: mb.diag.clone(),
        mutuelles: mb.mutuelles.clone(),
        k_max,
        r_voisin: 50.0,
    })
}

pub fn boitier_nul(bt: Option<&Boitier>) -> bool {
    bt.is_none_or(|bt| bt.r == 0.0 && bt.l == 0.0 && bt.c == 0.0)
}

/// Ce que la page affiche d'un fichier lu : les modeles et leur type.
pub fn resume(lu: &Lu) -> Json {
    let modeles = lu
        .modeles
        .values()
        .map(|m| {
            objet([
                ("nom", m.nom.as_str().into()),
                ("type", m.type_.as_str().into()),
                ("emetteur", est_emetteur(m).into()),
                ("formes_d_onde", (m.montant.len() + m.descendant.len()).into()),
            ])
        })
        .collect();
    objet([
        ("version", lu.version.as_str().into()),
        ("composant", lu.composant.as_str().into()),
        ("modeles", Json::Liste(modeles)),
        ("ignores", textes(&lu.ignores)),
    ])
}

pub fn est_emetteur(m: &Modele) -> bool {
    !m.type_.to_lowercase().starts_with("input") && (m.tableaux.contains_key("pullup") || m.tableaux.contains_key("pulldown"))
}

// ==========================================================================
// Les dict de Python, tels que json.dumps les ecrivait
// ==========================================================================

pub(crate) fn objet<const N: usize>(cles: [(&str, Json); N]) -> Json {
    Json::Objet(cles.into_iter().map(|(k, v)| (k.to_string(), v)).collect())
}

pub(crate) fn opt(x: Option<f64>) -> Json {
    x.map_or(Json::Nul, Json::Flottant)
}

pub(crate) fn nombres(v: &[f64]) -> Json {
    Json::Liste(v.iter().map(|x| Json::Flottant(*x)).collect())
}

pub(crate) fn textes(v: &[String]) -> Json {
    Json::Liste(v.iter().map(|x| x.as_str().into()).collect())
}

fn json_trois(t: &Trois) -> Json {
    Json::Liste(t.iter().map(|x| opt(*x)).collect())
}

fn json_rlc<T>(v: &[T; 3], f: impl Fn(&T) -> Json) -> Json {
    objet([("r", f(&v[R])), ("l", f(&v[L])), ("c", f(&v[C]))])
}

fn json_diag(d: &[IndexMap<String, f64>; 3]) -> Json {
    json_rlc(d, |m| Json::Objet(m.iter().map(|(k, v)| (k.clone(), Json::Flottant(*v))).collect()))
}

/// Les cles (broche, broche) n'ont pas d'ecriture en JSON : une liste de [broche, broche, valeur].
fn json_mutuelles(d: &[Mutuelles; 3]) -> Json {
    json_rlc(d, |m| {
        Json::Liste(
            m.iter().map(|((a, b), v)| Json::Liste(vec![a.as_str().into(), b.as_str().into(), Json::Flottant(*v)])).collect(),
        )
    })
}

impl Section {
    pub fn json(&self) -> Json {
        match self {
            Section::Ligne { len, r, l, c, g } => objet([
                ("len", (*len).into()),
                ("r", (*r).into()),
                ("l", (*l).into()),
                ("c", (*c).into()),
                ("g", (*g).into()),
            ]),
            Section::Fourche(f) => objet([("fourche", json_sections(f))]),
        }
    }
}

fn json_sections(s: &[Section]) -> Json {
    Json::Liste(s.iter().map(Section::json).collect())
}

impl Onde {
    pub fn json(&self) -> Json {
        let mut o = Objet::new();
        o.insert("r_fixture".into(), opt(self.r_fixture));
        o.insert("v_fixture".into(), opt(self.v_fixture));
        o.insert("v_fixture_min".into(), opt(self.v_fixture_min));
        o.insert("v_fixture_max".into(), opt(self.v_fixture_max));
        o.insert("c_fixture".into(), opt(self.c_fixture));
        o.insert("table".into(), Json::Liste(self.table.iter().map(|r| nombres(r)).collect()));
        for (k, v) in &self.autres {
            o.insert(k.clone(), opt(*v));
        }
        Json::Objet(o)
    }
}

impl RenvoiAmi {
    pub fn json(&self) -> Json {
        objet([
            ("plateforme", self.plateforme.as_str().into()),
            ("bibliotheque", self.bibliotheque.as_str().into()),
            ("fichier_ami", self.fichier_ami.as_str().into()),
        ])
    }
}

impl Modele {
    /// Une reference ([Voltage Range]...) par sa cle Python : « voltage_range », « pullup_ref »...
    pub fn reference(&self, cle: &str) -> Option<&Trois> {
        self.refs.get(cle)
    }

    pub fn json(&self) -> Json {
        let mut o = Objet::new();
        o.insert("nom".into(), self.nom.as_str().into());
        o.insert("type".into(), self.type_.as_str().into());
        o.insert("c_comp".into(), self.c_comp.as_ref().map_or(Json::Nul, json_trois));
        o.insert("vinl".into(), opt(self.vinl));
        o.insert("vinh".into(), opt(self.vinh));
        o.insert(
            "tableaux".into(),
            Json::Objet(
                self.tableaux.iter().map(|(k, t)| (k.clone(), Json::Liste(t.iter().map(|r| nombres(r)).collect()))).collect(),
            ),
        );
        let rampe = self.rampe.iter().map(|(k, v)| {
            let v = match v {
                Rampe::Charge(x) => opt(*x),
                Rampe::Rapports(rr) => {
                    Json::Liste(rr.iter().map(|x| x.map_or(Json::Nul, |(a, b)| nombres(&[a, b]))).collect())
                }
            };
            (k.clone(), v)
        });
        o.insert("rampe".into(), Json::Objet(rampe.collect()));
        o.insert("montant".into(), Json::Liste(self.montant.iter().map(Onde::json).collect()));
        o.insert("descendant".into(), Json::Liste(self.descendant.iter().map(Onde::json).collect()));
        for (i, (k, t)) in self.refs.iter().enumerate() {
            if let (Some(a), true) = (&self.ami, i == self.rang_ami) {
                o.insert("ami".into(), Json::Liste(a.iter().map(RenvoiAmi::json).collect()));
            }
            o.insert(k.clone(), json_trois(t));
        }
        if let (Some(a), false) = (&self.ami, o.contains_key("ami")) {
            o.insert("ami".into(), Json::Liste(a.iter().map(RenvoiAmi::json).collect()));
        }
        Json::Objet(o)
    }
}

impl PaireDiff {
    pub fn json(&self) -> Json {
        let mut o = Objet::new();
        o.insert("broche".into(), self.broche.as_str().into());
        o.insert("inverse".into(), self.inverse.as_str().into());
        o.insert("vdiff".into(), opt(self.vdiff));
        o.insert("tdelay".into(), nombres(&self.tdelay));
        if let Some(n) = &self.note {
            o.insert("note".into(), n.as_str().into());
        }
        Json::Objet(o)
    }
}

impl ModeleBoitier {
    pub fn json(&self) -> Json {
        objet([
            ("nom", self.nom.as_str().into()),
            ("broches", textes(&self.broches)),
            ("sections", self.sections.into()),
            ("genres", Json::Objet(self.genres.iter().map(|(k, v)| (k.to_string(), v.as_str().into())).collect())),
            ("diag", json_diag(&self.diag)),
            ("mutuelles", json_mutuelles(&self.mutuelles)),
            (
                "sections_broche",
                Json::Objet(self.sections_broche.iter().map(|(k, s)| (k.clone(), json_sections(s))).collect()),
            ),
        ])
    }
}

impl Lu {
    /// Le dict que `lire` rendait.
    pub fn json(&self) -> Json {
        let mut o = Objet::new();
        o.insert("fichier".into(), self.fichier.as_str().into());
        o.insert("version".into(), self.version.as_str().into());
        o.insert("composant".into(), self.composant.as_str().into());
        o.insert("modeles".into(), Json::Objet(self.modeles.iter().map(|(k, m)| (k.clone(), m.json())).collect()));
        o.insert("ignores".into(), textes(&self.ignores));
        if self.complet {
            o.insert(
                "boitier".into(),
                self.boitier.as_ref().map_or(Json::Nul, |b| json_rlc(b, |t| t.as_ref().map_or(Json::Nul, json_trois))),
            );
            let broches = self.broches.iter().map(|(k, b)| {
                let j = objet([
                    ("nom", b.nom.as_str().into()),
                    ("signal", b.signal.as_str().into()),
                    ("modele", b.modele.as_str().into()),
                    ("r", opt(b.rlc[R])),
                    ("l", opt(b.rlc[L])),
                    ("c", opt(b.rlc[C])),
                ]);
                (k.clone(), j)
            });
            o.insert("broches".into(), Json::Objet(broches.collect()));
            o.insert("ordre_broches".into(), textes(&self.ordre_broches));
            o.insert("paires_diff".into(), Json::Liste(self.paires_diff.iter().map(PaireDiff::json).collect()));
            o.insert(
                "selecteurs".into(),
                Json::Objet(self.selecteurs.iter().map(|(k, s)| (k.clone(), textes(s))).collect()),
            );
            o.insert("modele_boitier".into(), self.modele_boitier.as_str().into());
            o.insert(
                "modeles_boitier".into(),
                Json::Objet(self.modeles_boitier.iter().map(|(k, m)| (k.clone(), m.json())).collect()),
            );
            o.insert("composants".into(), self.composants.into());
        }
        Json::Objet(o)
    }
}

impl Boitier {
    pub fn json(&self) -> Json {
        objet([
            ("r", self.r.into()),
            ("l", self.l.into()),
            ("c", self.c.into()),
            ("source", self.source.as_str().into()),
            ("notes", textes(&self.notes)),
            ("sections", self.sections.as_ref().map_or(Json::Nul, |s| json_sections(s))),
        ])
    }
}

impl Mutuelle {
    pub fn json(&self) -> Json {
        objet([
            ("r", self.r.into()),
            ("l", self.l.into()),
            ("c", self.c.into()),
            ("k_l", self.k_l.into()),
            ("k_c", self.k_c.into()),
            ("source", self.source.as_str().into()),
        ])
    }
}

impl Couple {
    /// Le dict de `voisins_boitier` (sans `r_voisin`, que l'oeil ajoute).
    pub fn json(&self) -> Json {
        objet([
            ("nom", self.nom.as_str().into()),
            ("conducteurs", textes(&self.conducteurs)),
            ("victimes", self.victimes.into()),
            ("voisines", textes(&self.voisines)),
            ("genres", Json::Objet(self.genres.iter().map(|(k, v)| (k.clone(), v.as_str().into())).collect())),
            ("diag", json_diag(&self.diag)),
            ("mutuelles", json_mutuelles(&self.mutuelles)),
            ("k_max", self.k_max.into()),
        ])
    }
}
