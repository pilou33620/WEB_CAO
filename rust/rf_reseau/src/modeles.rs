//! SPICE lineaire : R, L, C et sous-circuits imbriques ; et les modeles de composants.

use crate::alg::*;
use crate::touchstone::*;
use crate::{ErreurRF, Res, MASSE, MAX_ELEMENTS, Y_COURT};
use dc_solver::pyth::str_py;
use em::simulation_em::base::*;
use std::collections::HashMap;
use std::f64::consts::PI;

const _SUFFIXES: [(&str, f64); 10] = [("meg", 1e6), ("mil", 25.4e-6), ("f", 1e-15), ("p", 1e-12), ("n", 1e-9), ("u", 1e-6), ("m", 1e-3),
                                      ("k", 1e3), ("g", 1e9), ("t", 1e12)];

/// Ce que `^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?` prend en tete de `j` : sa longueur.
/// shortcut: chiffres ASCII ; `\d` de Python admettait ceux d'autres ecritures
fn _nombre_en_tete(j: &str) -> Option<usize> {
    let o = j.as_bytes();
    let chiffres = |mut i: usize| {
        while i < o.len() && o[i].is_ascii_digit() {
            i += 1;
        }
        i
    };
    let mut i = usize::from(matches!(o.first(), Some(b'+' | b'-')));
    let fin = chiffres(i);
    if fin > i {
        i = fin;
        if o.get(i) == Some(&b'.') {
            i = chiffres(i + 1);
        }
    } else if o.get(i) == Some(&b'.') && chiffres(i + 1) > i + 1 {
        i = chiffres(i + 1);
    } else {
        return None;
    }
    if matches!(o.get(i), Some(b'e' | b'E')) {
        let k = i + 1 + usize::from(matches!(o.get(i + 1), Some(b'+' | b'-')));
        if chiffres(k) > k {
            i = chiffres(k);
        }
    }
    Some(i)
}

pub type Params = HashMap<String, f64>;

/// « 1.2n », « 10k », « 2pF », « {C} » -> float.
pub fn valeur_spice(jeton: &str, params: Option<&Params>) -> Res<f64> {
    let j = py::strip(jeton);
    if j.starts_with('{') && j.ends_with('}') && j.len() >= 2 {
        let cle = py::strip(&j[1..j.len() - 1]).to_uppercase();
        if let Some(v) = params.and_then(|p| p.get(&cle)) {
            return Ok(*v);
        }
        return Err(ErreurRF::new(format!("Paramètre SPICE « {} » sans valeur.", cle), ""));
    }
    let Some(fin) = _nombre_en_tete(j) else {
        return Err(ErreurRF::new(format!("Valeur SPICE illisible : « {} ».", j), ""));
    };
    let v: f64 = j[..fin].parse().unwrap_or(f64::NAN);
    let reste = j[fin..].to_lowercase().replace('µ', "u");
    if reste.chars().next().is_some_and(|ch| !ch.is_alphabetic()) {
        // « 1,5n » lu 1 : refuse plutot que tronque
        return Err(ErreurRF::new(format!("Valeur SPICE illisible : « {} ».", j), "Le séparateur décimal est le point."));
    }
    for (suf, mult) in _SUFFIXES {
        if reste.starts_with(suf) {
            return Ok(v * mult);
        }
    }
    Ok(v)
}

/// [« C=100n », « ESR=0.05 »] -> {« C »: 1e-7, ...}.
pub fn _params(jetons: &[String], params: Option<&Params>) -> Res<Params> {
    let mut out = Params::new();
    for j in jetons {
        if let Some((k, v)) = j.split_once('=') {
            out.insert(py::strip(k).to_uppercase(), valeur_spice(v, params)?);
        }
    }
    Ok(out)
}

/// Un element d'un sous-circuit : (genre, noeud, noeud, valeur) ou l'instance d'un autre.
#[derive(Debug, Clone, PartialEq)]
pub enum ElementSpice {
    Rlc(char, String, String, String),
    X(Vec<String>, String, Vec<String>),
}

#[derive(Debug, Clone, PartialEq, Default)]
pub struct Circuit {
    pub broches: Vec<String>,
    pub elements: Vec<ElementSpice>,
    pub params: Params,
}

/// Les sous-circuits dans l'ordre du fichier (un dict en Python).
pub type Circuits = Vec<(String, Circuit)>;

// ce que Python laissait remonter d'une liste trop courte
fn hors_liste() -> ErreurRF {
    ErreurRF::interne("IndexError : list index out of range")
}

/// Texte SPICE -> {NOM: {broches, elements, params}}.
///
/// Seuls R, L, C et X sont acceptes : c'est tout ce qu'il faut aux modeles
/// Murata, et c'est la frontiere du lineaire. Un Q, un M, un D, une source
/// commandee est refuse -- il faudrait un point de polarisation.
pub fn lire_spice(texte: &str, nom: &str) -> Res<Circuits> {
    let mut lignes: Vec<String> = Vec::new();
    for brute in crate::alg::lignes(texte) {
        let l = py::strip(brute.split(';').next().unwrap_or(""));
        if l.is_empty() || l.starts_with('*') {
            continue;
        }
        match lignes.last_mut() {
            Some(derniere) if l.starts_with('+') => {
                derniere.push(' ');
                derniere.push_str(&l[1..]);
            }
            _ => lignes.push(l.to_string()),
        }
    }
    let mut circuits: Circuits = Vec::new();
    let mut courant: Option<usize> = None;
    for l in &lignes {
        // « PARAMS: C=1 » et « C = 1 » se lisent comme « C=1 ».
        let l = _egal_serre(l);
        let jetons = jetons(&l);
        let tete = jetons[0].to_lowercase();
        if tete == ".subckt" {
            let (mut broches, mut params) = (Vec::new(), Params::new());
            let reste = jetons.get(2..).unwrap_or(&[]);
            for (i, j) in reste.iter().enumerate() {
                if j.to_lowercase() == "params:" || j.contains('=') {
                    let p: Vec<String> = reste[i..].iter().filter(|x| x.to_lowercase() != "params:").map(|x| x.to_string()).collect();
                    params = _params(&p, None)?;
                    break;
                }
                broches.push(j.to_lowercase());
            }
            let circuit = Circuit { broches, elements: Vec::new(), params };
            let cle = jetons.get(1).ok_or_else(hors_liste)?.to_uppercase();
            courant = Some(match circuits.iter().position(|(k, _)| *k == cle) {
                Some(i) => {
                    circuits[i].1 = circuit;
                    i
                }
                None => {
                    circuits.push((cle, circuit));
                    circuits.len() - 1
                }
            });
            continue;
        }
        if tete == ".ends" || tete == ".end" {
            courant = None;
            continue;
        }
        if tete.starts_with('.') {
            continue; // .model, .param... : lus par l'element
        }
        let Some(ic) = courant else {
            continue; // rien hors sous-circuit
        };
        let genre = tete.chars().next().unwrap_or(' ');
        if "rlc".contains(genre) {
            if jetons.len() < 4 {
                return Err(ErreurRF::new(format!("{} : élément incomplet « {} ».", nom, l), ""));
            }
            circuits[ic].1.elements.push(ElementSpice::Rlc(genre, jetons[1].to_lowercase(), jetons[2].to_lowercase(), jetons[3].to_string()));
        } else if genre == 'x' {
            let args: Vec<&str> = jetons[1..].iter().filter(|j| j.to_lowercase() != "params:").copied().collect();
            let mut noeuds: Vec<String> = args.iter().filter(|j| !j.contains('=')).map(|j| j.to_lowercase()).collect();
            let surcharges: Vec<String> = args.iter().filter(|j| j.contains('=')).map(|j| j.to_string()).collect();
            let sous = noeuds.pop().ok_or_else(hors_liste)?.to_uppercase();
            circuits[ic].1.elements.push(ElementSpice::X(noeuds, sous, surcharges));
        } else {
            return Err(ErreurRF::new(
                format!("{} : « {} » n'est pas un élément linéaire (seuls R, L, C et les sous-circuits le sont).",
                        if nom.is_empty() { "Modèle SPICE" } else { nom }, jetons[0]),
                "Un composant actif ou non linéaire se simule en RF par ses paramètres S : fournissez son fichier .sNp."));
        }
    }
    if circuits.is_empty() {
        return Err(ErreurRF::new(format!("{} : aucun .SUBCKT trouvé.", if nom.is_empty() { "Modèle SPICE" } else { nom }), ""));
    }
    Ok(circuits)
}

/// Un element deplie : (genre, noeud, noeud, valeur).
pub type ElementPlat = (char, String, String, f64);

/// Deplie un sous-circuit en elements R/L/C sur des noeuds globaux.
pub fn _aplatir(circuits: &Circuits, nom: &str, noeuds: &[String], params: &Params, prefixe: &str, sortie: &mut Vec<ElementPlat>,
                profondeur: usize) -> Res<()> {
    if profondeur > 20 {
        return Err(ErreurRF::new("Sous-circuits SPICE imbriqués trop profondément.", ""));
    }
    let Some((_, c)) = circuits.iter().find(|(k, _)| k == nom) else {
        return Err(ErreurRF::new(format!("Sous-circuit SPICE « {} » introuvable.", nom), ""));
    };
    if noeuds.len() != c.broches.len() {
        return Err(ErreurRF::new(format!("« {} » a {} broches, {} branchées.", nom, c.broches.len(), noeuds.len()), ""));
    }
    let mut p = c.params.clone();
    p.extend(params.iter().map(|(k, v)| (k.clone(), *v)));
    let carte: HashMap<&str, &str> = c.broches.iter().map(String::as_str).zip(noeuds.iter().map(String::as_str)).collect();

    let g = |n: &str| -> String {
        if n == "0" || n == "gnd" {
            return MASSE.to_string();
        }
        carte.get(n).map_or_else(|| format!("{prefixe}{n}"), |x| x.to_string())
    };

    for (i, el) in c.elements.iter().enumerate() {
        match el {
            ElementSpice::X(ns, sous, surch) => {
                // un préfixe par instance : deux X d'un même circuit ne partagent pas leurs nœuds internes
                let ns: Vec<String> = ns.iter().map(|n| g(n)).collect();
                _aplatir(circuits, sous, &ns, &_params(surch, Some(&p))?, &format!("{prefixe}x{i}."), sortie, profondeur + 1)?;
            }
            ElementSpice::Rlc(genre, a, b, v) => {
                sortie.push((*genre, g(a), g(b), valeur_spice(v, Some(&p))?));
                if sortie.len() > MAX_ELEMENTS {
                    return Err(ErreurRF::new(format!("Modèle SPICE trop gros : plus de {} éléments une fois déplié.", MAX_ELEMENTS), ""));
                }
            }
        }
    }
    Ok(())
}

pub fn _admittance(genre: char, valeur: f64, omega: f64) -> Complex64 {
    if genre == 'r' {
        return c(if valeur != 0.0 { 1.0 / valeur } else { Y_COURT });
    }
    if genre == 'c' {
        return Complex64::new(0.0, omega * valeur);
    }
    if valeur != 0.0 { inv(Complex64::new(0.0, omega * valeur)) } else { c(Y_COURT) }
}

/// Reduction de Kron : ne garde que les noeuds d'indices `garder`.
pub fn _reduire(y: &MatC, garder: &[usize]) -> Res<MatC> {
    let enlever: Vec<usize> = (0..y.len()).filter(|i| !garder.contains(i)).collect();
    let bloc = |li: &[usize], co: &[usize]| -> MatC { li.iter().map(|&i| co.iter().map(|&j| y[i][j]).collect()).collect() };
    let ypp = bloc(garder, garder);
    if enlever.is_empty() {
        return Ok(ypp);
    }
    let Some(x) = resoudre(&bloc(&enlever, &enlever), &bloc(&enlever, garder)) else {
        return Err(ErreurRF::new("Réseau singulier : un nœud interne est isolé ou en l'air.", "Vérifiez que chaque pastille du chemin RF est reliée."));
    };
    Ok(plus(&ypp, c(-1.0), &mul(&bloc(garder, &enlever), &x)))
}

/// Ce sur quoi l'on fait `y[i, j] += v` : une matrice pleine, ou l'assemblage creux.
pub trait Pose {
    fn ajouter(&mut self, i: usize, j: usize, v: Complex64);
}

impl Pose for MatC {
    fn ajouter(&mut self, i: usize, j: usize, v: Complex64) {
        self[i][j] += v;
    }
}

/// Les noeuds numerotes, dans l'ordre ou ils sont apparus (la masse n'y est pas).
pub type Index = HashMap<String, usize>;

/// Une admittance entre deux noeuds (la masse n'a pas de ligne).
pub fn _poser(y: &mut impl Pose, index: &Index, a: &str, b: &str, adm: Complex64) {
    let (ia, ib) = (index.get(a).copied(), index.get(b).copied());
    if let Some(ia) = ia {
        y.ajouter(ia, ia, adm);
    }
    if let Some(ib) = ib {
        y.ajouter(ib, ib, adm);
    }
    if let (Some(ia), Some(ib)) = (ia, ib) {
        y.ajouter(ia, ib, -adm);
        y.ajouter(ib, ia, -adm);
    }
}

/// Un sous-circuit SPICE vu depuis ses broches : Y(omega) a N ports.
#[derive(Debug, Clone)]
pub struct ModeleSpice {
    pub elements: Vec<ElementPlat>,
    pub nom: String,
    pub n: usize,
    _index: Index,
}

impl ModeleSpice {
    /// `sous_circuit` et `params` : ce que porte le document (None en Python : `Json::Nul`).
    pub fn new(texte: &str, nom: &str, sous_circuit: &Json, params: &Json) -> Res<ModeleSpice> {
        let circuits = lire_spice(texte, nom)?;
        let haut = if sous_circuit.vrai() {
            str_py(sous_circuit).to_uppercase()
        } else {
            let instancies: Vec<&String> = circuits.iter().flat_map(|(_, c)| &c.elements)
                .filter_map(|el| if let ElementSpice::X(_, sous, _) = el { Some(sous) } else { None }).collect();
            let mut hauts: Vec<&String> = circuits.iter().map(|(k, _)| k).filter(|k| !instancies.contains(k)).collect();
            if hauts.len() != 1 {
                hauts.sort();
                return Err(ErreurRF::new(
                    format!("{} : plusieurs sous-circuits, lequel prendre ? ({})", nom, hauts.iter().map(|h| h.as_str()).collect::<Vec<_>>().join(", ")), ""));
            }
            hauts[0].clone()
        };
        let n = circuits.iter().find(|(k, _)| *k == haut).map_or(0, |(_, c)| c.broches.len());
        let broches: Vec<String> = (0..n).map(|i| format!("@{i}")).collect();
        let mut p = Params::new();
        if params.vrai() {
            let Some(o) = params.as_objet() else {
                return Err(ErreurRF::interne("AttributeError : les paramètres du modèle ne sont pas un objet"));
            };
            for (k, v) in o {
                p.insert(k.to_uppercase(), nb(v));
            }
        }
        let mut elements = Vec::new();
        _aplatir(&circuits, &haut, &broches, &p, "", &mut elements, 0)?;
        let mut noms = broches.clone();
        for (_, a, b, _) in &elements {
            for x in [a, b] {
                if x != MASSE && !noms.contains(x) {
                    noms.push(x.clone());
                }
            }
        }
        let _index = noms.into_iter().enumerate().map(|(i, x)| (x, i)).collect();
        Ok(ModeleSpice { elements, nom: if nom.is_empty() { haut } else { nom.to_string() }, n, _index })
    }

    pub fn y(&self, f: f64) -> Res<MatC> {
        let omega = 2.0 * PI * f;
        let mut y = zeros(self._index.len(), self._index.len());
        for (genre, a, b, v) in &self.elements {
            _poser(&mut y, &self._index, a, b, _admittance(*genre, *v, omega));
        }
        _reduire(&y, &(0..self.n).collect::<Vec<_>>())
    }
}

#[derive(Debug, Clone)]
pub struct ModeleSnp {
    pub freqs: Vec<f64>,
    pub s: Vec<MatC>,
    pub z0: Vec<f64>,
    pub n: usize,
    pub nom: String,
    /// les ports rapportes a une broche de la puce (ses vias), sinon a la masse
    pub reference: String,
}

impl ModeleSnp {
    pub fn new(texte: &str, nom: &str) -> Res<ModeleSnp> {
        let (freqs, s, z0) = lire_touchstone(texte, nom, None)?;
        let n = s[0].len();
        Ok(ModeleSnp { freqs, s, z0, n, nom: nom.to_string(), reference: MASSE.to_string() })
    }

    pub fn y(&self, f: f64) -> Res<MatC> {
        // S = -1 (court-circuit ideal) : l'admittance est infinie
        _s_vers_y(&_interpoler(&self.freqs, &self.s, f, &self.nom)?, &self.z0).ok_or_else(|| {
            ErreurRF::new(format!("{} : court-circuit idéal (S = −1), sans admittance finie.", self.nom),
                          "Remplacez ce modèle par une résistance de quelques milliohms.")
        })
    }
}

#[derive(Debug, Clone)]
pub struct ModeleIdeal {
    pub genre: char,
    pub valeur: f64,
    pub nom: String,
}

impl ModeleIdeal {
    pub fn new(genre: &Json, valeur: f64, nom: &str) -> Res<ModeleIdeal> {
        let genre = str_ou_vide(genre).to_lowercase();
        if !["r", "l", "c"].contains(&genre.as_str()) || !(valeur >= 0.0) {
            return Err(ErreurRF::new(format!("{} : modèle idéal « {} = {} » invalide.", nom, genre.to_uppercase(), py::repr_flottant(valeur)), ""));
        }
        Ok(ModeleIdeal { genre: genre.chars().next().unwrap_or('r'), valeur, nom: nom.to_string() })
    }

    pub fn y(&self, f: f64) -> MatC {
        let a = _admittance(self.genre, self.valeur, 2.0 * PI * f);
        vec![vec![a, -a], vec![-a, a]]
    }
}

/// Une impedance fixe a la masse : une broche de la puce autre que le
/// port, dont on connait ce qu'elle presente (une entree RX, un PA eteint).
#[derive(Debug, Clone)]
pub struct ModeleZ {
    pub z: Complex64,
    pub nom: String,
}

impl ModeleZ {
    pub fn new(re: f64, im: f64, nom: &str) -> Res<ModeleZ> {
        let z = Complex64::new(re, im);
        let nom = if nom.is_empty() { "Z" } else { nom }.to_string();
        if !(z.norm() > 0.0) {
            return Err(ErreurRF::new(format!("{} : impédance nulle (utilisez un 0 Ω).", nom), ""));
        }
        Ok(ModeleZ { z, nom })
    }

    pub fn y(&self, _f: f64) -> MatC {
        vec![vec![inv(self.z)]]
    }
}

/// Ce que `modele` rend : un objet qui rend Y(f) sur ses broches.
#[derive(Debug, Clone)]
pub enum Modele {
    Spice(ModeleSpice),
    Snp(ModeleSnp),
    Ideal(ModeleIdeal),
    Z(ModeleZ),
}

impl Modele {
    pub fn n(&self) -> usize {
        match self {
            Modele::Spice(m) => m.n,
            Modele::Snp(m) => m.n,
            Modele::Ideal(_) => 2,
            Modele::Z(_) => 1,
        }
    }

    pub fn nom(&self) -> &str {
        match self {
            Modele::Spice(m) => &m.nom,
            Modele::Snp(m) => &m.nom,
            Modele::Ideal(m) => &m.nom,
            Modele::Z(m) => &m.nom,
        }
    }

    pub fn y(&self, f: f64) -> Res<MatC> {
        match self {
            Modele::Spice(m) => m.y(f),
            Modele::Snp(m) => m.y(f),
            Modele::Ideal(m) => Ok(m.y(f)),
            Modele::Z(m) => Ok(m.y(f)),
        }
    }
}

/// {type, ...} -> objet qui rend Y(f) sur ses broches.
pub fn modele(spec: &Json, ref_: &str) -> Res<Modele> {
    let t = &spec["type"];
    let nom = if spec["nom"].vrai() { str_py(&spec["nom"]) } else { ref_.to_string() };
    let texte = || if spec["texte"].vrai() { str_py(&spec["texte"]) } else { String::new() };
    match t.as_str() {
        Some("z") => Ok(Modele::Z(ModeleZ::new(nb(&spec["re"]), nb(&spec["im"]), ref_)?)),
        Some("ideal") => Ok(Modele::Ideal(ModeleIdeal::new(&spec["genre"], _nombre(&spec["valeur"], -1.0), ref_)?)),
        Some("spice") => Ok(Modele::Spice(ModeleSpice::new(&texte(), &nom, &spec["sous_circuit"], &spec["params"])?)),
        Some("snp") => Ok(Modele::Snp(ModeleSnp::new(&texte(), &nom)?)),
        _ => Err(ErreurRF::new(format!("{} : type de modèle « {} » inconnu.", ref_, str_py(t)), "")),
    }
}

/// `re.sub(r"\s*=\s*", "=", l)`
fn _egal_serre(l: &str) -> String {
    let mut out = String::with_capacity(l.len());
    let mut saute = false;
    for ch in l.chars() {
        if ch == '=' {
            out.truncate(out.trim_end_matches(blanc).len());
            out.push('=');
            saute = true;
        } else if !(saute && blanc(ch)) {
            out.push(ch);
            saute = false;
        }
    }
    out
}
