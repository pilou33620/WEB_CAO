//! IBIS-AMI : le fichier .ami, la chaine de parametres et l'execution du modele.

// ==========================================================================
// IBIS-AMI : le fichier .ami
// --------------------------------------------------------------------------
// Un [Algorithmic Model] renvoie a une bibliotheque binaire du fabricant
// (.dll, .so) -- son egaliseur, sa recuperation d'horloge, ses algorithmes
// d'adaptation -- et a un fichier .ami, texte, qui en decrit les PARAMETRES :
// ceux que la norme reserve (AMI_Version, Init_Returns_Impulse, Tx_Rj,
// Rx_Noise...) et ceux propres au modele (Model_Specific : prises de FFE, de
// DFE, gains de CTLE...). Executer du code natif venu d'un fichier televerse
// n'est pas une option : la bibliotheque ne s'execute (1.3.0, plus bas) que
// depuis un fichier designe sur le disque du serveur.
// On LIT donc le .ami -- syntaxe en arbre, a parentheses --, on le montre,
// et l'on en tire, quand ils sont lisibles, de quoi REGLER L'EGALISEUR DE
// REFERENCE de l'oeil (FFE, DFE, CTLE) et sa gigue : c'est une proposition
// fondee sur des noms de parametres usuels, pas le comportement du modele --
// le repli quand le modele ne s'execute pas.
// ==========================================================================

use std::collections::BTreeMap;
use std::ffi::{c_char, c_long, c_void, CStr, CString};

use indexmap::IndexMap;
use ipc2581::py::{blanc, repr_flottant, strip, Json, Objet};

use crate::abcd::{plafond, MAX_ECHANTILLONS};
use crate::lecture::{nombre, nombres, objet, opt, textes};
use crate::py::{chiffre, int, max, min, pct_f, pct_g};
use crate::ErreurIbis;

pub const MAX_AMI: usize = 2 * 1024 * 1024;
pub const MAX_PARAMS_AMI: usize = 400;
const CLES_PARAM: [&str; 14] = [
    "usage", "type", "format", "value", "default", "range", "list", "description", "increment", "steps", "corner",
    "table", "list_tip", "labels",
];

enum Jeton {
    Ouvre,
    Ferme,
    Atome(String),
    /// Un atome AMI ecrit entre guillemets : du texte, meme s'il a l'air
    /// d'un nombre (« "7.0" »).
    Chaine(String),
}

/// Les jetons d'un .ami : « ( », « ) », et des atomes (une chaine entre
/// guillemets est un seul atome). Le refus d'une chaine non fermee vient avec les jetons qui
/// la precedent : Python les avait deja lus quand il le levait.
fn jetons_ami(texte: &str) -> (Vec<Jeton>, Option<ErreurIbis>) {
    let t: Vec<char> = texte.chars().collect();
    let n = t.len();
    let mut out = Vec::new();
    let mut i = 0;
    while i < n {
        let c = t[i];
        if c == '(' || c == ')' {
            out.push(if c == '(' { Jeton::Ouvre } else { Jeton::Ferme });
            i += 1;
        } else if blanc(c) {
            i += 1;
        } else if c == '"' {
            let Some(j) = (i + 1..n).find(|j| t[*j] == '"') else {
                return (out, Some(ErreurIbis::new("Chaîne entre guillemets non fermée dans le fichier AMI.", "")));
            };
            out.push(Jeton::Chaine(t[i + 1..j].iter().collect()));
            i = j + 1;
        } else if c == '|' {
            // L'usage des fichiers du commerce : « | » commente la ligne.
            i = (i..n).find(|j| t[*j] == '\n').unwrap_or(n);
        } else {
            let mut j = i;
            while j < n && !blanc(t[j]) && !matches!(t[j], '(' | ')' | '"') {
                j += 1;
            }
            out.push(Jeton::Atome(t[i..j].iter().collect()));
            i = j;
        }
    }
    (out, None)
}

enum Brut {
    Liste(Vec<Brut>),
    Atome(String),
    Chaine(String),
}

/// Pourquoi l'arbre ne se ferme pas.
enum Arbre {
    FermanteEnTrop,
    Incomplet,
    Vide,
}

/// Les listes de premier niveau d'un texte AMI.
fn arbres(texte: &str) -> Result<Vec<Vec<Brut>>, Result<Arbre, ErreurIbis>> {
    let (jetons, refus) = jetons_ami(texte);
    let mut pile: Vec<Vec<Brut>> = Vec::new();
    let mut racines = Vec::new();
    for j in jetons {
        match j {
            Jeton::Ouvre => pile.push(Vec::new()),
            Jeton::Ferme => {
                let Some(fini) = pile.pop() else { return Err(Ok(Arbre::FermanteEnTrop)) };
                match pile.last_mut() {
                    Some(parent) => parent.push(Brut::Liste(fini)),
                    None => racines.push(fini),
                }
            }
            Jeton::Atome(a) => {
                if let Some(l) = pile.last_mut() {
                    l.push(Brut::Atome(a));
                }
            }
            Jeton::Chaine(a) => {
                if let Some(l) = pile.last_mut() {
                    l.push(Brut::Chaine(a));
                }
            }
        }
    }
    if let Some(e) = refus {
        return Err(Err(e));
    }
    if !pile.is_empty() {
        return Err(Ok(Arbre::Incomplet));
    }
    if racines.is_empty() {
        return Err(Ok(Arbre::Vide));
    }
    Ok(racines)
}

struct Noeud {
    nom: String,
    // (texte, entre guillemets)
    valeurs: Vec<(String, bool)>,
    enfants: Vec<Noeud>,
}

fn noeud(liste: Vec<Brut>) -> Noeud {
    let mut it = liste.into_iter();
    let nom = match it.next() {
        Some(Brut::Atome(a)) | Some(Brut::Chaine(a)) => a,
        _ => String::new(),
    };
    let mut n = Noeud { nom, valeurs: Vec::new(), enfants: Vec::new() };
    for x in it {
        match x {
            Brut::Liste(l) => n.enfants.push(noeud(l)),
            Brut::Atome(a) => n.valeurs.push((a, false)),
            Brut::Chaine(a) => n.valeurs.push((a, true)),
        }
    }
    n
}

/// La valeur d'un parametre AMI : un nombre, ou son texte.
#[derive(Debug, Clone, PartialEq)]
pub enum Valeur {
    Nombre(f64),
    Texte(String),
}

impl Valeur {
    pub fn json(&self) -> Json {
        match self {
            Valeur::Nombre(x) => Json::Flottant(*x),
            Valeur::Texte(t) => Json::Texte(t.clone()),
        }
    }

    fn nombre(&self) -> Option<f64> {
        match self {
            Valeur::Nombre(x) => Some(*x),
            Valeur::Texte(_) => None,
        }
    }
}

fn num(v: &(String, bool)) -> Option<f64> {
    if v.1 {
        return None;
    }
    nombre(&v.0).ok().flatten()
}

fn valeur_de(v: &(String, bool)) -> Valeur {
    num(v).map_or_else(|| Valeur::Texte(v.0.clone()), Valeur::Nombre)
}

/// Un parametre d'un .ami, avec son chemin dans l'arbre.
#[derive(Debug, Clone, PartialEq)]
pub struct ParamAmi {
    pub nom: String,
    pub usage: String,
    pub type_: String,
    pub description: String,
    pub forme: String,
    pub valeur: Option<Valeur>,
    pub plage: Option<(f64, f64)>,
    pub liste: Option<Vec<Valeur>>,
    /// le pas d'un Increment : la cle n'existe que pour cette forme (et peut etre illisible)
    pub pas: Option<Option<f64>>,
    pub chemin: String,
    pub groupe: String,
}

/// Un parametre AMI (un noeud qui a Usage ou Type), ou None.
fn param_ami(n: &Noeud) -> Option<ParamAmi> {
    let mut enf: IndexMap<String, &Noeud> = IndexMap::new();
    for e in &n.enfants {
        enf.entry(e.nom.to_lowercase()).or_insert(e);
    }
    if !enf.contains_key("usage") && !enf.contains_key("type") {
        return None;
    }
    let textes_de = |cle: &str| -> Vec<&str> { enf.get(cle).map_or(Vec::new(), |e| e.valeurs.iter().map(|v| v.0.as_str()).collect()) };
    let mut p = ParamAmi {
        nom: n.nom.clone(),
        usage: textes_de("usage").first().copied().unwrap_or("").to_string(),
        type_: textes_de("type").join(" "),
        description: textes_de("description").join(" "),
        forme: String::new(),
        valeur: None,
        plage: None,
        liste: None,
        pas: None,
        chemin: String::new(),
        groupe: String::new(),
    };
    let mut vals: &[(String, bool)] = &[];
    if let Some(f) = enf.get("format").filter(|f| !f.valeurs.is_empty()) {
        p.forme = f.valeurs[0].0.to_lowercase();
        vals = &f.valeurs[1..];
    } else {
        for f in ["range", "list", "increment", "steps", "corner", "value", "table"] {
            if let Some(e) = enf.get(f) {
                p.forme = f.to_string();
                vals = &e.valeurs;
                break;
            }
        }
    }
    let nums: Vec<Option<f64>> = vals.iter().map(num).collect();
    if matches!(p.forme.as_str(), "range" | "increment" | "steps" | "corner") && nums.len() >= 3 {
        p.valeur = Some(valeur_de(&vals[0]));
        if let (Some(a), Some(b)) = (nums[1], nums[2]) {
            p.plage = Some((min(a, b), max(a, b)));
        }
        if p.forme == "increment" && nums.len() >= 4 {
            p.pas = Some(nums[3]);
        }
    } else if p.forme == "list" && !vals.is_empty() {
        let liste: Vec<Valeur> = vals.iter().map(valeur_de).collect();
        p.valeur = Some(liste[0].clone());
        p.liste = Some(liste);
        let mut lnum = nums.iter().flatten();
        if let Some(premier) = lnum.next() {
            p.plage = Some(lnum.fold((*premier, *premier), |(a, b), x| (min(a, *x), max(b, *x))));
        }
    } else if !vals.is_empty() {
        p.valeur = Some(valeur_de(&vals[0]));
    }
    for f in ["value", "default"] {
        if let Some(v) = enf.get(f).and_then(|e| e.valeurs.first()) {
            p.valeur = Some(valeur_de(v));
        }
    }
    Some(p)
}

/// Un fichier .ami lu.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct Ami {
    pub fichier: String,
    pub modele: String,
    pub description: String,
    pub parametres: Vec<ParamAmi>,
    pub tronque: bool,
    pub reserves: IndexMap<String, ParamAmi>,
}

/// Le texte d'un fichier .ami -> {modele, description, reserves,
/// specifiques, parametres, fichier}.
///
/// `parametres` : la liste a plat, chacun avec son CHEMIN dans l'arbre
/// (« Model_Specific/TX_FFE/Tap/-1 »), son Usage, son Type, sa valeur
/// (Value, Default ou typ), sa plage et sa liste. Rend ErreurIbis si le
/// texte n'est pas un arbre AMI.
pub fn lire_ami(texte: &str, nom_fichier: &str) -> Result<Ami, ErreurIbis> {
    if strip(texte).is_empty() {
        return Err(ErreurIbis::new("Fichier AMI vide.", ""));
    }
    let taille = texte.chars().count();
    if taille > MAX_AMI {
        return Err(ErreurIbis::new(
            format!("Fichier AMI de {} Mo : trop gros pour un .ami.", pct_f(taille as f64 / 1e6, 1)),
            "",
        ));
    }
    let conseil = "Un .ami s'écrit (Nom (Reserved_Parameters ...) (Model_Specific ...)).";
    let mut racines = arbres(texte).map_err(|e| match e {
        Err(e) => e,
        Ok(Arbre::FermanteEnTrop) => ErreurIbis::new("Parenthèse fermante en trop dans le fichier AMI.", ""),
        Ok(Arbre::Incomplet) => ErreurIbis::new("Fichier AMI incomplet : parenthèses non équilibrées.", conseil),
        Ok(Arbre::Vide) => ErreurIbis::new("Aucun arbre « (modèle ...) » dans le fichier AMI.", conseil),
    })?;
    let racine = noeud(racines.swap_remove(0));
    let mut res = Ami { fichier: nom_fichier.to_string(), modele: racine.nom.clone(), ..Ami::default() };
    for e in &racine.enfants {
        if e.nom.to_lowercase() == "description" {
            res.description = e.valeurs.iter().map(|v| v.0.as_str()).collect::<Vec<_>>().join(" ");
        }
    }
    fn parcourir(res: &mut Ami, n: &Noeud, chemin: &[&str]) {
        if let Some(mut p) = param_ami(n) {
            if res.parametres.len() >= MAX_PARAMS_AMI {
                res.tronque = true;
                return;
            }
            p.chemin = chemin.join("/");
            p.groupe = if chemin[0].to_lowercase().starts_with("reserved") { "reserve" } else { "specifique" }.to_string();
            res.parametres.push(p);
            return;
        }
        for e in &n.enfants {
            if CLES_PARAM.contains(&e.nom.to_lowercase().as_str()) {
                continue;
            }
            parcourir(res, e, &[chemin, &[e.nom.as_str()]].concat());
        }
    }
    for e in &racine.enfants {
        if e.nom.to_lowercase() != "description" {
            parcourir(&mut res, e, &[e.nom.as_str()]);
        }
    }
    for p in &res.parametres {
        if p.groupe == "reserve" {
            res.reserves.insert(p.nom.clone(), p.clone());
        }
    }
    Ok(res)
}

fn valeur(p: Option<&ParamAmi>) -> Option<f64> {
    p?.valeur.as_ref()?.nombre()
}

// int() d'une suite de chiffres ; None pour une suite vide.
// shortcut: un rang au-dela de i64 est borne (Python avait des entiers sans limite) ; a revoir
// si un .ami nomme un jour une prise par plus de dix-huit chiffres.
fn entier(chiffres: &str) -> Option<i64> {
    if chiffres.is_empty() {
        return None;
    }
    Some(chiffres.chars().fold(0i64, |n, c| n.saturating_mul(10).saturating_add(chiffre(c).unwrap_or(0) as i64)))
}

/// Un motif « alternatives, puis chiffres jusqu'au bout » : les chiffres, s'il y en a au moins
/// `mini`. Les alternatives de chaque partie sont dans l'ordre ou l'expression de ibis.py les essayait.
fn motif<'a>(n: &'a str, parties: &[&[&str]], mini: usize) -> Option<&'a str> {
    let Some((tete, suite)) = parties.split_first() else {
        return (n.chars().all(|c| chiffre(c).is_some()) && n.chars().count() >= mini).then_some(n);
    };
    tete.iter().find_map(|a| motif(n.strip_prefix(a)?, suite, mini))
}

// « $ » d'une expression de Python s'arrete aussi devant un saut de ligne final
fn sans_saut(n: &str) -> &str {
    n.strip_suffix('\n').unwrap_or(n)
}

/// Le rang d'une prise de FFE d'apres son nom : « -1 », « pre1 »,
/// « post2 », « main », « c_m1 », « c1 »... ou None.
fn indice_prise(nom: &str) -> Option<i64> {
    let entier_min = nom.to_lowercase();
    let n = sans_saut(&entier_min);
    let opt_ = ["_", ""];
    if let Some(d) = motif(n, &[&["+", "-", ""]], 1) {
        let v = entier(d)?;
        return Some(if n.starts_with('-') { -v } else { v });
    }
    if let Some(d) = motif(n, &[&["tap_", "tap", ""], &["pre"], &["_cursor", "cursor", ""], &opt_], 0) {
        return Some(-entier(d).unwrap_or(1));
    }
    if let Some(d) = motif(n, &[&["tap_", "tap", ""], &["post"], &["_cursor", "cursor", ""], &opt_], 0) {
        return Some(entier(d).unwrap_or(1));
    }
    if matches!(entier_min.as_str(), "main" | "main_cursor" | "tap_main" | "cursor" | "c0" | "tap0") {
        return Some(0);
    }
    if let Some(d) = motif(n, &[&["c"], &opt_, &["m", "n", "-"], &opt_], 1) {
        return entier(d).map(|v| -v);
    }
    motif(n, &[&["c"], &opt_, &["p", ""]], 1).and_then(entier)
}

/// Le CTLE propose : {forme, fp1, fp2, adc_db}.
#[derive(Debug, Clone, PartialEq)]
pub struct Ctle {
    pub forme: String,
    pub fp1: f64,
    pub fp2: f64,
    pub adc_db: Vec<f64>,
}

/// Ce que `proposer_egaliseur` rend. Une cle absente (None) : rien de lisible.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct Proposition {
    pub notes: Vec<String>,
    pub ffe: Option<Vec<f64>>,
    pub ffe_principal: Option<usize>,
    pub dfe_prises: Option<i64>,
    pub dfe_max: Option<f64>,
    pub ctle: Option<Ctle>,
    pub rj: Option<f64>,
    pub dj: Option<f64>,
    pub bruit_v: Option<f64>,
    pub sensibilite: Option<f64>,
}

fn debordement() -> ErreurIbis {
    ErreurIbis::plantage("OverflowError", "cannot convert float infinity to integer")
}

/// Ce que les .ami permettent de proposer pour l'egaliseur de reference
/// et la gigue de l'oeil : {ffe, ffe_principal, dfe_prises, dfe_max, ctle,
/// rj, dj, bruit_v, sensibilite, notes}. Une cle absente : rien de lisible.
///
/// HEURISTIQUE, ET DITE : on reconnait des noms usuels (Tap, FFE, DFE,
/// CTLE, dB) et les parametres reserves de gigue et de bruit. Chaque
/// proposition dit le parametre d'ou elle vient.
/// (`debit` : 1e9 dans ibis.py quand il n'est pas donne.)
pub fn proposer_egaliseur(ami_tx: Option<&Ami>, ami_rx: Option<&Ami>, debit: f64) -> Result<Proposition, ErreurIbis> {
    let mut prop = Proposition::default();
    let tx: &[ParamAmi] = ami_tx.map_or(&[], |a| &a.parametres);
    let rx: &[ParamAmi] = ami_rx.map_or(&[], |a| &a.parametres);

    // -- la FFE de l'emetteur --------------------------------------------
    let mut prises: BTreeMap<i64, (f64, &str)> = BTreeMap::new();
    for p in tx {
        let ch = p.chemin.to_lowercase();
        if p.groupe != "specifique" || ch.contains("dfe") {
            continue;
        }
        if !["tap", "ffe", "emph", "cursor"].iter().any(|k| ch.contains(k)) {
            continue;
        }
        if let (Some(k), Some(v)) = (indice_prise(&p.nom), valeur(Some(p))) {
            prises.entry(k).or_insert((v, &p.chemin));
        }
    }
    if let (Some(principale), true) = (prises.get(&0), prises.len() >= 2) {
        let rangs: Vec<i64> = prises.keys().copied().collect();
        let coefs: Vec<f64> = prises.values().map(|p| p.0).collect();
        let plus_fort = coefs.iter().fold(coefs[0].abs(), |m, c| max(m, c.abs()));
        if plus_fort > 1.5 {
            prop.notes.push(format!(
                "FFE : les prises ({}…) valent jusqu'à {} — des codes de réglage, pas des coefficients : non proposée.",
                prises[&rangs[0]].1,
                pct_g(plus_fort, 6)
            ));
        } else {
            let somme = ipc2581::py::sum(coefs.iter().map(|c| c.abs()));
            let somme = if somme != 0.0 { somme } else { 1.0 };
            prop.ffe = Some(coefs.iter().map(|c| ipc2581::py::round(c / somme, 4)).collect());
            prop.ffe_principal = rangs.iter().position(|r| *r == 0);
            let branche: Vec<&str> = principale.1.split('/').collect();
            prop.notes.push(format!(
                "FFE : {} prises (rangs {} à {}) tirées des valeurs par défaut de {}…, ramenées à Σ|c| = 1.",
                rangs.len(),
                rangs[0],
                rangs[rangs.len() - 1],
                branche[..branche.len() - 1].join("/")
            ));
        }
    }

    // -- le DFE du recepteur ---------------------------------------------
    let (mut n_dfe, mut dfe_max, mut src): (Option<i64>, Option<f64>, &str) = (None, None, "");
    let mut rangs_dfe = Vec::new();
    for p in rx {
        let ch = p.chemin.to_lowercase();
        if p.groupe != "specifique" || !ch.contains("dfe") {
            continue;
        }
        let nom = p.nom.to_lowercase();
        let n = sans_saut(&nom);
        let v = valeur(Some(p));
        // ^(n|num|nb|number|nombre)?_?(of_)?taps?(_count)?$|^tap_?count$|^dfe_?taps$
        let compte = motif(n, &[&["number", "nombre", "num", "nb", "n", ""], &["_", ""], &["of_", ""], &["tap"], &["s", ""], &["_count", ""]], 0)
            .is_some_and(str::is_empty)
            || matches!(n, "tapcount" | "tap_count" | "dfetaps" | "dfe_taps");
        if let (true, Some(v)) = (compte, v.filter(|v| v.is_finite() && v.fract() == 0.0 && *v >= 1.0)) {
            (n_dfe, src) = (int(v), &p.chemin);
            if let Some((_, haut)) = p.plage {
                n_dfe = Some(int(haut).ok_or_else(debordement)?);
            }
            continue;
        }
        let rang = motif(n, &[&["dfe_", "dfe", ""], &["tap", "h"], &["_", ""]], 1).or_else(|| motif(n, &[], 1)).and_then(entier);
        if let Some(r) = rang.filter(|r| *r >= 1) {
            rangs_dfe.push(r);
            let borne = match p.plage {
                Some((a, b)) => Some(max(a.abs(), b.abs())),
                None => v.map(f64::abs),
            };
            if let Some(b) = borne {
                dfe_max = Some(max(dfe_max.filter(|x| *x != 0.0).unwrap_or(0.0), b));
            }
            if src.is_empty() {
                src = &p.chemin;
            }
        }
    }
    if n_dfe.is_none() {
        n_dfe = rangs_dfe.iter().copied().max();
    }
    if let Some(n) = n_dfe.filter(|n| *n != 0) {
        prop.dfe_prises = Some(n.min(8));
        let dfe_max = dfe_max.filter(|x| *x != 0.0);
        prop.dfe_max = dfe_max;
        prop.notes.push(format!(
            "DFE : {} prise(s){} d'après {}{}.",
            n,
            if n > 8 { " (limitées à 8)" } else { "" },
            src,
            dfe_max.map_or(String::new(), |m| format!(
                ", amplitude bornée à {} (lue telle quelle, en volts si le modèle les exprime ainsi)",
                pct_g(m, 6)
            ))
        ));
    }

    // -- le CTLE du recepteur --------------------------------------------
    for p in rx {
        let ch = p.chemin.to_lowercase();
        if p.groupe != "specifique" || !ch.contains("ctle") {
            continue;
        }
        let nom = p.nom.to_lowercase();
        let texte_db = nom.contains("db") || p.description.to_lowercase().contains("db");
        if !texte_db || !["gain", "boost", "peak", "db"].iter().any(|k| nom.contains(k)) {
            continue;
        }
        let vals: Vec<f64> = if let Some(l) = p.liste.as_ref().filter(|l| !l.is_empty()) {
            l.iter().filter_map(Valeur::nombre).collect()
        } else if let Some((a, b)) = p.plage {
            let pas = p.pas.flatten().filter(|x| *x != 0.0).unwrap_or_else(|| max(1.0, (b - a) / 12.0));
            // np.arange(a, b + 0.5 * pas, pas) : numpy pose les deux premiers termes, puis
            // a + i * (leur ecart)
            let n = (b + 0.5 * pas - a) / pas;
            if n.is_infinite() || n > MAX_ECHANTILLONS {
                return Err(ErreurIbis::plantage("ValueError", "Maximum allowed size exceeded"));
            }
            let delta = (a + pas) - a;
            (0..plafond(n)?.max(0)).map(|i| if i == 1 { a + pas } else { a + i as f64 * delta }).collect()
        } else if let Some(v) = valeur(Some(p)) {
            vec![v]
        } else {
            continue;
        };
        if vals.is_empty() {
            continue;
        }
        let continu = nom.contains("dc");
        let mut adc: Vec<f64> = vals.iter().map(|v| ipc2581::py::round(if continu { *v } else { -v.abs() }, 2)).collect();
        adc.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
        adc.dedup();
        adc.truncate(16);
        prop.notes.push(format!(
            "CTLE : gains continus {} dB essayés, d'après {} ; pôles SUPPOSÉS (fp1 = débit/4, fp2 = débit) — le .ami ne \
             les donne pas.",
            adc.iter().map(|x| pct_g(*x, 6)).collect::<Vec<_>>().join(", "),
            p.chemin
        ));
        prop.ctle = Some(Ctle { forme: "pcie3".into(), fp1: debit / 4.0, fp2: debit, adc_db: adc });
        break;
    }

    // -- la gigue et le bruit : les parametres reserves ------------------
    let res_ = |ami: Option<&Ami>, nom: &str| valeur(ami.and_then(|a| a.reserves.get(nom))).filter(|x| *x != 0.0);
    let rj = [res_(ami_tx, "Tx_Rj"), res_(ami_rx, "Rx_Rj")];
    let dj = [res_(ami_tx, "Tx_Dj"), res_(ami_tx, "Tx_DCD"), res_(ami_rx, "Rx_Dj"), res_(ami_rx, "Rx_DCD")];
    if rj.iter().any(Option::is_some) {
        let v = ipc2581::py::sum(rj.iter().flatten().map(|x| x * x)).sqrt();
        prop.rj = Some(v);
        prop.notes.push(format!("RJ {} ps rms : Tx_Rj et Rx_Rj en quadrature.", pct_g(v * 1e12, 3)));
    }
    if dj.iter().any(Option::is_some) {
        let v = ipc2581::py::sum(dj.iter().flatten().map(|x| x.abs()));
        prop.dj = Some(v);
        prop.notes.push(format!("DJ {} ps c-c : somme de Tx_Dj, Tx_DCD, Rx_Dj et Rx_DCD présents.", pct_g(v * 1e12, 3)));
    }
    prop.bruit_v = res_(ami_rx, "Rx_Noise").map(f64::abs);
    prop.sensibilite = res_(ami_rx, "Rx_Receiver_Sensitivity").map(f64::abs);
    Ok(prop)
}

// ==========================================================================
// IBIS-AMI : l'execution du modele (1.3.0)
// --------------------------------------------------------------------------
// LA BIBLIOTHEQUE DU FABRICANT S'EXECUTE, selon la norme IBIS 7.x
// (section 10, « Algorithmic Modeling Interface ») :
//
//   long AMI_Init(double *impulse_matrix, long row_size, long aggressors,
//                 double sample_interval, double bit_time,
//                 char *AMI_parameters_in, char **AMI_parameters_out,
//                 void **AMI_memory_handle, char **msg);
//   long AMI_GetWave(double *wave, long wave_size, double *clock_times,
//                    char **AMI_parameters_out, void *AMI_memory);
//   long AMI_Close(void *AMI_memory);
//
// AMI_Init recoit la reponse impulsionnelle du canal analogique (une colonne
// par agresseur, aucun ici : row_size echantillons, EN VOLTS PAR SECONDE --
// sum h . dt est la reponse a un echelon de pleine excursion de l'emetteur,
// en volts), la MODIFIE EN PLACE si le modele a Init_Returns_Impulse, et rend
// un pointeur de memoire qu'AMI_GetWave et AMI_Close recevront. AMI_GetWave
// recoit une forme d'onde (volts, au meme pas) qu'il modifie en place, par
// blocs successifs -- l'etat (egaliseur adaptatif, recuperation d'horloge)
// vit dans la memoire du modele --, et ecrit les instants d'horloge qu'il a
// recuperes dans clock_times (termine par -1). Les deux rendent 1 quand tout
// va bien, 0 sinon ; les chaines qu'ils rendent appartiennent au modele et
// sont copiees aussitot.
//
// LA CHAINE DE PARAMETRES (AMI_parameters_in) : « (modele (feuille valeur)
// (branche (feuille valeur)) ...) » -- la racine est le nom du modele, les
// branches sont celles du .ami SANS les mots Reserved_Parameters et
// Model_Specific, et seuls les parametres d'Usage In et InOut y vont, avec
// leur valeur par defaut (`lire_ami` : Value, Default, ou typ d'un Range)
// que l'utilisateur peut surcharger par le chemin ou le nom de la feuille.
// Les chaines sont entre guillemets, les booleens True / False. Ce que le
// modele rend (Usage Out, InOut) s'ecrit dans la meme syntaxe et se relit
// (`lire_parametres_ami`).
//
// CE QUI EST EXECUTE, ET D'OU. Seul un fichier que l'utilisateur designe,
// sous un des dossiers autorises par le serveur (la LIB, les racines de
// projets), par son chemin relatif -- `chemin_bibliotheque_ami` le verifie
// par le chemin reel, comme les projets --, et seulement une bibliotheque
// (.so, .dll, .dylib). Rien n'est charge depuis une URL ni depuis le texte
// d'une requete : du code natif venu du navigateur n'est pas une option.
// Un fichier d'une autre architecture, absent ou sans les fonctions se
// refuse par ErreurIbis, que l'oeil tourne en avertissement et en repli sur
// l'egaliseur de reference.
// ==========================================================================

pub const EXTENSIONS_AMI: [&str; 3] = [".so", ".dll", ".dylib"];

// os.path.basename
fn nom_de_fichier(chemin: &str) -> &str {
    chemin.rsplit(std::path::MAIN_SEPARATOR).next().unwrap_or(chemin)
}

/// Le chemin absolu de la bibliotheque AMI designee par `brut`, sous une
/// des `racines` autorisees (le verdict se fonde sur le chemin reel), ou rend
/// ErreurIbis. Un chemin absolu est accepte s'il tombe sous une racine.
pub fn chemin_bibliotheque_ami(brut: &str, racines: &[&str]) -> Result<String, ErreurIbis> {
    let brut = strip(brut).trim_matches('"');
    if brut.is_empty() {
        return Err(ErreurIbis::new("Aucune bibliothèque AMI désignée.", ""));
    }
    if brut.chars().count() > 400 || brut.contains('\0') || brut.contains("://") {
        return Err(ErreurIbis::new(
            "Chemin de bibliothèque AMI invalide.",
            "Un chemin de fichier sous la LIB ou le projet, pas une URL.",
        ));
    }
    // os.path.splitext : le dernier point du nom, hors ceux qui l'ouvrent
    let nom = nom_de_fichier(brut);
    let extension = nom.trim_start_matches('.').rfind('.').map_or("", |i| &nom[nom.len() - nom.trim_start_matches('.').len() + i..]);
    if !EXTENSIONS_AMI.contains(&extension.to_lowercase().as_str()) {
        return Err(ErreurIbis::new(format!("« {nom} » n'est pas une bibliothèque (.so, .dll, .dylib)."), ""));
    }
    let racines: Vec<&str> = racines.iter().copied().filter(|r| !r.is_empty()).collect();
    if racines.is_empty() {
        return Err(ErreurIbis::new(
            "Aucun dossier autorisé pour les bibliothèques AMI.",
            "Le serveur n'exécute un modèle que depuis la LIB ou un dossier de projets déclaré.",
        ));
    }
    for racine in racines {
        // Un chemin qui n'existe pas n'a pas de chemin reel ici, la ou os.path.realpath en rendait
        // un : rien ne s'y trouve de toute facon, et la racine est passee.
        let Ok(vraie) = std::fs::canonicalize(racine) else { continue };
        let Ok(cible) = std::fs::canonicalize(std::path::Path::new(racine).join(brut)) else { continue };
        let (vraie, cible_txt) = (vraie.to_string_lossy().into_owned(), cible.to_string_lossy().into_owned());
        if cible_txt == vraie || !cible_txt.starts_with(&format!("{}{}", vraie, std::path::MAIN_SEPARATOR)) {
            continue;
        }
        if cible.is_file() {
            return Ok(cible_txt);
        }
    }
    Err(ErreurIbis::new(
        format!("Bibliothèque AMI « {brut} » introuvable sous les dossiers autorisés (LIB, projets)."),
        "Déposez le fichier du fabricant dans la LIB ou le projet, et désignez-le par son chemin relatif.",
    ))
}

/// Une valeur en syntaxe AMI : nombre tel quel, booleen True/False,
/// chaine entre guillemets.
fn texte_ami(v: &Json) -> String {
    // un entier s'ecrit sans decimale (un Type Integer lu « 0 » reste
    // « 0 »), un reel tel que Python le relit
    let reel = |f: f64| {
        if f.is_finite() && f.fract() == 0.0 && f.abs() < 1e15 {
            format!("{}", f as i64)
        } else {
            repr_flottant(f)
        }
    };
    let s = match v {
        Json::Bool(b) => return if *b { "True" } else { "False" }.into(),
        Json::Entier(i) => return reel(*i as f64),
        Json::GrandEntier(t) => return reel(t.parse().unwrap_or(f64::INFINITY)),
        Json::Flottant(f) => return reel(*f),
        Json::Texte(s) => s.clone(),
        Json::Nul => "None".into(),
        // shortcut: une liste ou un objet en surcharge s'ecrit en JSON, pas en repr() de Python ;
        // a reprendre si une page envoie un jour autre chose qu'un nombre, un booleen ou un texte.
        autre => ipc2581::py::dumps(autre),
    };
    if s == "True" || s == "False" || ipc2581::py::float(&s).is_some() {
        return s;
    }
    format!("\"{}\"", s.replace('"', "'"))
}

enum Branche {
    Feuille(Json),
    Noeud(IndexMap<String, Branche>),
}

/// La chaine AMI_parameters_in d'un .ami lu (`lire_ami`) : les
/// parametres In et InOut avec leur valeur par defaut, `surcharges`
/// {chemin ou nom de feuille: valeur} par-dessus. Rend (chaine, surcharges
/// appliquees, surcharges ignorees).
pub fn parametres_ami_in(ami: Option<&Ami>, surcharges: Option<&Objet>, nom: Option<&str>) -> Result<(String, Vec<String>, Vec<String>), ErreurIbis> {
    let (mut appliques, mut ignores) = (Vec::new(), Vec::new());
    let groupe = |m: &str| matches!(m.to_lowercase().as_str(), "reserved_parameters" | "model_specific");
    let mut valeurs: IndexMap<Vec<&str>, Json> = IndexMap::new();
    for p in ami.map_or(&[][..], |a| &a.parametres) {
        if !matches!(p.usage.to_lowercase().as_str(), "in" | "inout") {
            continue;
        }
        let mut morceaux: Vec<&str> = p.chemin.split('/').collect();
        if groupe(morceaux[0]) {
            morceaux.remove(0);
        }
        if morceaux.is_empty() {
            continue;
        }
        let Some(v) = &p.valeur else { continue };
        valeurs.insert(morceaux, v.json());
    }
    for (cle, v) in surcharges.into_iter().flatten() {
        let cle = strip(cle).trim_matches('/');
        let mut chemin: Vec<&str> = cle.split('/').collect();
        if groupe(chemin[0]) {
            chemin.remove(0);
        }
        let mut cibles: Vec<usize> = valeurs.keys().enumerate().filter(|(_, c)| **c == chemin).map(|(i, _)| i).collect();
        if cibles.is_empty() {
            cibles = valeurs.keys().enumerate().filter(|(_, c)| c[c.len() - 1] == cle).map(|(i, _)| i).collect();
        }
        if let [i] = cibles[..] {
            valeurs[i] = v.clone();
            appliques.push(valeurs.get_index(i).map_or(String::new(), |(c, _)| c.join("/")));
        } else {
            ignores.push(cle.to_string());
        }
    }
    let mut arbre: IndexMap<String, Branche> = IndexMap::new();
    for (chemin, v) in valeurs {
        let mut d = Some(&mut arbre);
        for (rang, m) in chemin[..chemin.len() - 1].iter().enumerate() {
            let Some(ici) = d else {
                // d.setdefault d'une valeur : deux parametres de meme nom, l'un feuille, l'autre branche
                return Err(ErreurIbis::plantage(
                    "AttributeError",
                    format!("« {} » est a la fois un parametre et une branche", chemin[..rang].join("/")),
                ));
            };
            d = match ici.entry(m.to_string()).or_insert_with(|| Branche::Noeud(IndexMap::new())) {
                Branche::Noeud(n) => Some(n),
                Branche::Feuille(_) => None,
            };
        }
        if let Some(d) = d {
            d.insert(chemin[chemin.len() - 1].to_string(), Branche::Feuille(v));
        }
    }
    fn ecrire(d: &IndexMap<String, Branche>) -> String {
        let out: Vec<String> = d
            .iter()
            .map(|(k, v)| {
                let texte = match v {
                    Branche::Noeud(n) => ecrire(n),
                    Branche::Feuille(v) => texte_ami(v),
                };
                format!("({k} {texte})")
            })
            .collect();
        out.join(" ")
    }
    let racine = nom.filter(|n| !n.is_empty()).or(ami.map(|a| a.modele.as_str()).filter(|m| !m.is_empty())).unwrap_or("modele");
    Ok((format!("({} {})", racine, ecrire(&arbre)), appliques, ignores))
}

/// Ce qu'un modele rend dans AMI_parameters_out : {chemin: valeur}, les
/// feuilles de l'arbre « (modele (branche (feuille valeur))) », sans le nom
/// du modele. Un texte vide ou mal forme rend {}.
pub fn lire_parametres_ami(texte: &str) -> Objet {
    let mut out = Objet::new();
    let texte = strip(texte);
    if texte.is_empty() {
        return out;
    }
    let Ok(mut racines) = arbres(texte) else { return out };
    fn parcourir(out: &mut Objet, n: &Noeud, chemin: &[&str]) {
        if n.enfants.is_empty() {
            if !n.valeurs.is_empty() {
                let mut vals: Vec<Json> = n.valeurs.iter().map(|v| valeur_de(v).json()).collect();
                out.insert(chemin.join("/"), if vals.len() == 1 { vals.remove(0) } else { Json::Liste(vals) });
            }
            return;
        }
        for e in &n.enfants {
            parcourir(out, e, &[chemin, &[e.nom.as_str()]].concat());
        }
    }
    let racine = noeud(racines.swap_remove(0));
    for e in &racine.enfants {
        parcourir(&mut out, e, &[e.nom.as_str()]);
    }
    out
}

type AmiInit = unsafe extern "C" fn(
    *mut f64, c_long, c_long, f64, f64, *const c_char, *mut *const c_char, *mut *mut c_void, *mut *const c_char,
) -> c_long;
type AmiGetWave = unsafe extern "C" fn(*mut f64, c_long, *mut f64, *mut *const c_char, *mut c_void) -> c_long;
type AmiClose = unsafe extern "C" fn(*mut c_void) -> c_long;

/// Une bibliotheque AMI chargee : `init`, `getwave`, `fermer`.
///
/// Le tableau passe a `init` est MODIFIE EN PLACE par le modele, comme la
/// norme le veut ; on lui donne une copie contigue en double et on la
/// garde tant que le modele vit.
pub struct ModeleAmi {
    pub chemin: String,
    pub getwave_existe: bool,
    pub close_existe: bool,
    // Some des qu'AMI_Init a ete appele, meme si le modele n'a rien rendu (pointeur nul)
    memoire: Option<*mut c_void>,
    garde: Vec<f64>,
    ami_init: AmiInit,
    ami_getwave: Option<AmiGetWave>,
    ami_close: Option<AmiClose>,
    // en dernier : les fonctions ci-dessus vivent dans la bibliotheque
    _lib: libloading::Library,
}

// c.value : les octets jusqu'au zero, decodes en remplacant ce qui n'est pas de l'UTF-8
fn chaine_c(p: *const c_char) -> String {
    if p.is_null() {
        return String::new();
    }
    // SAFETY: le modele rend une chaine C terminee par un zero (IBIS 7.x, section 10)
    unsafe { CStr::from_ptr(p) }.to_string_lossy().into_owned()
}

impl ModeleAmi {
    pub fn new(chemin: &str) -> Result<ModeleAmi, ErreurIbis> {
        // SAFETY: charger une bibliotheque execute son code d'initialisation ; c'est l'objet de la
        // classe, et `chemin_bibliotheque_ami` a borne d'ou elle peut venir
        let lib = unsafe { libloading::Library::new(chemin) }.map_err(|exc| {
            ErreurIbis::new(
                format!("La bibliothèque AMI « {} » ne se charge pas : {}", nom_de_fichier(chemin), exc),
                "Architecture ou système différent de celui du serveur (une .dll ne se charge pas sous Linux, une \
                 bibliothèque 32 bits sous un Python 64 bits), ou dépendances absentes.",
            )
        })?;
        // SAFETY: les signatures sont celles de la norme ; un symbole de ce nom d'un autre type
        // serait un modele faux, que rien ne permet de deceler
        let (ami_init, ami_getwave, ami_close) = unsafe {
            let init = lib.get::<AmiInit>(b"AMI_Init\0").map(|s| *s).map_err(|_| {
                ErreurIbis::new(
                    format!(
                        "La bibliothèque « {} » n'a pas de fonction AMI_Init : ce n'est pas un modèle AMI.",
                        nom_de_fichier(chemin)
                    ),
                    "",
                )
            })?;
            (init, lib.get::<AmiGetWave>(b"AMI_GetWave\0").map(|s| *s).ok(), lib.get::<AmiClose>(b"AMI_Close\0").map(|s| *s).ok())
        };
        Ok(ModeleAmi {
            chemin: chemin.to_string(),
            getwave_existe: ami_getwave.is_some(),
            close_existe: ami_close.is_some(),
            memoire: None,
            garde: Vec::new(),
            ami_init,
            ami_getwave,
            ami_close,
            _lib: lib,
        })
    }

    /// AMI_Init : (ok, impulsion rendue, parametres_out, message).
    pub fn init(&mut self, impulsion: &[f64], dt: f64, bit_time: f64, parametres_in: &str) -> (bool, Vec<f64>, String, String) {
        // UNE COPIE, toujours : le modele ecrit dans le tableau.
        self.garde = impulsion.to_vec();
        // une chaine C s'arrete au premier zero
        let params = CString::new(parametres_in.split('\0').next().unwrap_or("")).unwrap_or_default();
        let (mut p_out, mut msg, mut mem) = (std::ptr::null(), std::ptr::null(), std::ptr::null_mut());
        // SAFETY: les pointeurs designent des tampons vivants de la taille annoncee
        let ret = unsafe {
            (self.ami_init)(
                self.garde.as_mut_ptr(),
                self.garde.len() as c_long,
                0,
                dt,
                bit_time,
                params.as_ptr(),
                &mut p_out,
                &mut mem,
                &mut msg,
            )
        };
        self.memoire = Some(mem);
        (ret == 1, self.garde.clone(), chaine_c(p_out), chaine_c(msg))
    }

    /// AMI_GetWave sur un bloc : (ok, onde rendue, instants d'horloge,
    /// parametres_out).
    pub fn getwave(&mut self, onde: &[f64], echantillons_par_bit: i64) -> Result<(bool, Vec<f64>, Vec<f64>, String), ErreurIbis> {
        let Some(getwave) = self.ami_getwave else {
            return Err(ErreurIbis::new("Le modèle n'a pas d'AMI_GetWave.", ""));
        };
        let mut w = onde.to_vec();
        let n_h = w.len() / echantillons_par_bit.max(1) as usize + 2;
        let mut horloges = vec![-1.0; n_h];
        let mut p_out = std::ptr::null();
        // SAFETY: comme pour AMI_Init ; la memoire est celle que le modele a rendue
        let ret = unsafe {
            getwave(w.as_mut_ptr(), w.len() as c_long, horloges.as_mut_ptr(), &mut p_out, self.memoire.unwrap_or(std::ptr::null_mut()))
        };
        horloges.retain(|h| *h >= 0.0);
        Ok((ret == 1, w, horloges, chaine_c(p_out)))
    }

    pub fn fermer(&mut self) {
        if let (Some(m), Some(close)) = (self.memoire, self.ami_close) {
            self.memoire = None;
            // SAFETY: la memoire rendue par AMI_Init, fermee une seule fois
            unsafe { close(m) };
        }
    }
}

impl Drop for ModeleAmi {
    fn drop(&mut self) {
        self.fermer();
    }
}

/// La valeur d'un parametre reserve du .ami (Init_Returns_Impulse,
/// GetWave_Exists, Ignore_Bits...), booleens compris, ou `defaut`.
pub fn reserve_ami(ami: Option<&Ami>, nom: &str, defaut: Json) -> Json {
    match ami.and_then(|a| a.reserves.get(nom)).and_then(|p| p.valeur.as_ref()) {
        None => defaut,
        Some(Valeur::Nombre(x)) => Json::Flottant(*x),
        Some(Valeur::Texte(v)) => match strip(v).to_lowercase().as_str() {
            "true" | "1" => Json::Bool(true),
            "false" | "0" => Json::Bool(false),
            _ => Json::Texte(v.clone()),
        },
    }
}

// ==========================================================================
// Les dict de Python
// ==========================================================================

impl ParamAmi {
    pub fn json(&self) -> Json {
        let mut o = Objet::new();
        o.insert("nom".into(), self.nom.as_str().into());
        o.insert("usage".into(), self.usage.as_str().into());
        o.insert("type".into(), self.type_.as_str().into());
        o.insert("description".into(), self.description.as_str().into());
        o.insert("forme".into(), self.forme.as_str().into());
        o.insert("valeur".into(), self.valeur.as_ref().map_or(Json::Nul, Valeur::json));
        o.insert("plage".into(), self.plage.map_or(Json::Nul, |(a, b)| nombres(&[a, b])));
        o.insert("liste".into(), self.liste.as_ref().map_or(Json::Nul, |l| Json::Liste(l.iter().map(Valeur::json).collect())));
        if let Some(pas) = self.pas {
            o.insert("pas".into(), opt(pas));
        }
        o.insert("chemin".into(), self.chemin.as_str().into());
        o.insert("groupe".into(), self.groupe.as_str().into());
        Json::Objet(o)
    }
}

impl Ami {
    pub fn json(&self) -> Json {
        objet([
            ("fichier", self.fichier.as_str().into()),
            ("modele", self.modele.as_str().into()),
            ("description", self.description.as_str().into()),
            ("parametres", Json::Liste(self.parametres.iter().map(ParamAmi::json).collect())),
            ("tronque", self.tronque.into()),
            ("reserves", Json::Objet(self.reserves.iter().map(|(k, p)| (k.clone(), p.json())).collect())),
        ])
    }
}

impl Proposition {
    pub fn json(&self) -> Json {
        let mut o = Objet::new();
        o.insert("notes".into(), textes(&self.notes));
        if let Some(f) = &self.ffe {
            o.insert("ffe".into(), nombres(f));
        }
        if let Some(p) = self.ffe_principal {
            o.insert("ffe_principal".into(), p.into());
        }
        if let Some(n) = self.dfe_prises {
            o.insert("dfe_prises".into(), n.into());
        }
        if let Some(m) = self.dfe_max {
            o.insert("dfe_max".into(), m.into());
        }
        if let Some(c) = &self.ctle {
            o.insert(
                "ctle".into(),
                objet([("forme", c.forme.as_str().into()), ("fp1", c.fp1.into()), ("fp2", c.fp2.into()), ("adc_db", nombres(&c.adc_db))]),
            );
        }
        for (cle, v) in [("rj", self.rj), ("dj", self.dj), ("bruit_v", self.bruit_v), ("sensibilite", self.sensibilite)] {
            if let Some(v) = v {
                o.insert(cle.into(), v.into());
            }
        }
        Json::Objet(o)
    }
}
