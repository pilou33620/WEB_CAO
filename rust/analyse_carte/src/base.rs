//! Ce que Python faisait tout seul et que les règles partagent : les exceptions qu'il levait
//! sur une valeur d'un autre type, les clés opaques (couche, net : un rang ou un nom), le
//! modulo et les formats.

pub use dc_solver::pyth::{float_py, int_py, ErreurPy};
pub use em::crosstalk as xt;
pub use em::simulation_em as se;
pub use em::simulation_em::base::*;
pub use indexmap::{IndexMap, IndexSet};
pub use ligne_mom as tl;
pub use std::collections::{BTreeSet, HashMap, HashSet};
pub use std::f64::consts::PI;

/// Ce qu'une règle laisse remonter.
#[derive(Debug, Clone, PartialEq)]
pub enum Exc {
    /// `ErreurAnalyse` : le message part tel quel.
    Analyse(String),
    /// KeyError, TypeError, ValueError, IndexError : « Document mal formé : … ».
    MalForme(String),
    /// Toute autre exception (AttributeError…) : l'« Erreur interne » de la route.
    Interne(String),
}

pub type R<T> = Result<T, Exc>;

impl From<ErreurPy> for Exc {
    fn from(e: ErreurPy) -> Self {
        Exc::MalForme(e.0)
    }
}

// le ValueError de ligne_mom
impl From<tl::Erreur> for Exc {
    fn from(e: tl::Erreur) -> Self {
        Exc::MalForme(e.0)
    }
}

impl From<se::ErreurSimulation> for Exc {
    fn from(e: se::ErreurSimulation) -> Self {
        if e.interne { Exc::MalForme(e.message) } else { Exc::Interne(e.message) }
    }
}

/// float(v)
pub fn fl(v: &Json) -> R<f64> {
    Ok(float_py(v)?)
}

/// float(v or defaut)
pub fn fl_ou(v: &Json, defaut: f64) -> R<f64> {
    if v.vrai() { fl(v) } else { Ok(defaut) }
}

/// d[cle] : KeyError si la clé manque.
pub fn req<'a>(d: &'a Json, cle: &str) -> R<&'a Json> {
    d.get(cle).ok_or_else(|| Exc::MalForme(format!("'{cle}'")))
}

/// float(d[cle])
pub fn flr(d: &Json, cle: &str) -> R<f64> {
    fl(req(d, cle)?)
}

/// L'élément d'une liste du document sur lequel Python appelait `.get` : AttributeError
/// s'il n'est pas un objet.
pub fn dict(v: &Json) -> R<&Json> {
    match v {
        Json::Objet(_) => Ok(v),
        _ => Err(Exc::Interne(format!("'{}' object has no attribute 'get'", dc_solver::pyth::type_py(v)))),
    }
}

/// Un nombre du document pris tel quel dans une opération (`x2 - x1`) : TypeError sinon.
pub fn nombre(v: &Json) -> R<f64> {
    match v {
        Json::Bool(b) => Ok(*b as u8 as f64),
        Json::Entier(_) | Json::Flottant(_) | Json::GrandEntier(_) => Ok(v.as_f64().unwrap_or(f64::NAN)),
        _ => Err(Exc::MalForme(format!("unsupported operand type(s): '{}'", dc_solver::pyth::type_py(v)))),
    }
}

/// Le TypeError d'une opération de Python entre deux valeurs du document, dont une n'est pas
/// un nombre (`b` : le type du second opérande quand il n'est pas dans le document).
fn operande(op: &str, a: &Json, b: Result<&Json, &str>) -> Exc {
    let nom = |v: &Json| dc_solver::pyth::type_py(v);
    Exc::MalForme(format!("unsupported operand type(s) for {op}: '{}' and '{}'", nom(a), b.map_or_else(|t| t, nom)))
}

fn est_nombre(v: &Json) -> bool {
    matches!(v, Json::Bool(_) | Json::Entier(_) | Json::Flottant(_) | Json::GrandEntier(_))
}

/// `a - b`
pub fn moins(a: &Json, b: &Json) -> R<f64> {
    if est_nombre(a) && est_nombre(b) { Ok(nombre(a)? - nombre(b)?) } else { Err(operande("-", a, Ok(b))) }
}

/// `(v or 0) / 2`
pub fn moitie(v: &Json) -> R<f64> {
    if !v.vrai() {
        Ok(0.0)
    } else if est_nombre(v) {
        Ok(nombre(v)? / 2.0)
    } else {
        Err(operande("/", v, Err("int")))
    }
}

/// Une coordonnée dont Python retranchait une marge flottante (`min(x1, x2) - marge`).
pub fn coordonnee(v: &Json) -> R<f64> {
    if est_nombre(v) { nombre(v) } else { Err(operande("-", v, Err("float"))) }
}

/// `v or 0`, en nombre.
pub fn nombre_ou0(v: &Json) -> R<f64> {
    if v.vrai() { nombre(v) } else { Ok(0.0) }
}

/// `a, b = v` : les deux éléments d'une liste du document, ValueError ou TypeError sinon.
pub fn deux(v: &Json) -> R<(&Json, &Json)> {
    match v.as_liste() {
        Some(l) if l.len() == 2 => Ok((&l[0], &l[1])),
        Some(l) if l.len() < 2 => Err(Exc::MalForme(format!("not enough values to unpack (expected 2, got {})", l.len()))),
        Some(_) => Err(Exc::MalForme("too many values to unpack (expected 2)".into())),
        None => Err(Exc::MalForme(format!("cannot unpack non-iterable {} object", dc_solver::pyth::type_py(v)))),
    }
}

/// Une clé de dict de Python : TypeError pour une liste ou un objet.
pub fn hachable(v: &Json) -> R<()> {
    match v {
        Json::Liste(_) | Json::Objet(_) => Err(Exc::MalForme(format!("unhashable type: '{}'", dc_solver::pyth::type_py(v)))),
        _ => Ok(()),
    }
}

/// Une clé opaque (couche ou net : un rang ou un nom) telle qu'un dict de Python la compare :
/// 1, 1.0 et True sont la même clé, « 1 » en est une autre.
pub fn cle(v: &Json) -> String {
    match v {
        Json::Nul => "N".into(),
        Json::Bool(b) => format!("i{}", *b as u8),
        Json::Entier(i) => format!("i{i}"),
        Json::Flottant(f) if f.fract() == 0.0 && f.abs() < 9e15 => format!("i{}", *f as i64),
        Json::Flottant(f) => format!("f{}", f.to_bits()),
        Json::Texte(t) => format!("s{t}"),
        _ => format!("j{}", dumps(v)),
    }
}

/// a % b de Python sur des flottants : du signe de b.
pub fn pymod(a: f64, b: f64) -> f64 {
    let r = a % b;
    if r != 0.0 && (r < 0.0) != (b < 0.0) { r + b } else { r }
}

/// math.hypot
pub fn hyp(x: f64, y: f64) -> f64 {
    py::hypot(x, y)
}

/// sorted((a, b)) de deux rangs.
pub fn tri2(a: usize, b: usize) -> (usize, usize) {
    if a <= b { (a, b) } else { (b, a) }
}

/// Les bits d'un flottant pour une clé de dict (0.0 et -0.0 sont la même).
pub fn bits(x: f64) -> u64 {
    (x + 0.0).to_bits()
}

/// max(..., key=f) de Python : le PREMIER des plus grands.
pub fn premier_max<T>(v: &[T], f: impl Fn(&T) -> f64) -> Option<&T> {
    let mut m: Option<&T> = None;
    for x in v {
        if m.is_none_or(|y| f(x) > f(y)) {
            m = Some(x);
        }
    }
    m
}

/// min(..., key=f) de Python : le PREMIER des plus petits.
pub fn premier_min<T>(v: &[T], f: impl Fn(&T) -> f64) -> Option<&T> {
    let mut m: Option<&T> = None;
    for x in v {
        if m.is_none_or(|y| f(x) < f(y)) {
            m = Some(x);
        }
    }
    m
}

/// « %.3g ps » ou « %.3g ns »
pub fn _s(t: f64) -> String {
    if t < 1e-9 { format!("{} ps", fmt_g(t * 1e12, 3)) } else { format!("{} ns", fmt_g(t * 1e9, 3)) }
}

pub fn _hz(f: f64) -> String {
    if f >= 1e9 {
        format!("{} GHz", fmt_g(f / 1e9, 3))
    } else if f >= 1e6 {
        format!("{} MHz", fmt_g(f / 1e6, 3))
    } else {
        format!("{} kHz", fmt_g(f / 1e3, 3))
    }
}

/// Le pluriel : « s » au-delà d'un.
pub fn s_si(n: usize) -> &'static str {
    if n > 1 { "s" } else { "" }
}

/// Un `set` d'entiers de CPython, pour le parcourir dans SON ordre : celui des cases de sa
/// table (rang = entier & masque, sondage linéaire sur dix cases puis saut pseudo-aléatoire,
/// table quadruplée aux trois cinquièmes), qui n'est pas l'ordre croissant dès qu'un entier
/// dépasse la table. L'ordre des constats de la diaphonie en dépend.
pub struct EnsembleEntiers {
    table: Vec<Option<usize>>,
    remplis: usize,
}

impl Default for EnsembleEntiers {
    fn default() -> Self {
        EnsembleEntiers { table: vec![None; 8], remplis: 0 }
    }
}

impl EnsembleEntiers {
    /// La case où va `k` : celle qui le porte déjà, ou la première vide de son sondage.
    fn case(table: &[Option<usize>], k: usize) -> usize {
        let masque = table.len() - 1;
        let (mut i, mut perturbation) = (k & masque, k);
        loop {
            let sondes = if i + 9 <= masque { 9 } else { 0 };
            for j in i..=i + sondes {
                if table[j].is_none() || table[j] == Some(k) {
                    return j;
                }
            }
            perturbation >>= 5;
            i = (i.wrapping_mul(5).wrapping_add(1).wrapping_add(perturbation)) & masque;
        }
    }

    /// set.add(k)
    pub fn ajouter(&mut self, k: usize) {
        let j = Self::case(&self.table, k);
        if self.table[j].is_some() {
            return;
        }
        self.table[j] = Some(k);
        self.remplis += 1;
        if self.remplis * 5 >= (self.table.len() - 1) * 3 {
            let voulu = if self.remplis > 50000 { self.remplis * 2 } else { self.remplis * 4 };
            let mut taille = 8;
            while taille <= voulu {
                taille <<= 1;
            }
            let mut table = vec![None; taille];
            for k in self.table.iter().flatten() {
                let j = Self::case(&table, *k);
                table[j] = Some(*k);
            }
            self.table = table;
        }
    }

    /// set.update(liste)
    pub fn etendre(&mut self, liste: impl IntoIterator<Item = usize>) {
        for k in liste {
            self.ajouter(k);
        }
    }

    /// `for k in ensemble`
    pub fn dans_l_ordre(&self) -> Vec<usize> {
        self.table.iter().flatten().copied().collect()
    }
}

#[cfg(test)]
mod essais {
    use super::*;

    /// L'ordre de parcours d'un set de CPython 3.13, relevé sur des listes au hasard
    /// (ANALYSE_ENSEMBLES : le fichier [[liste, ordre du set], ...]).
    #[test]
    fn ensemble_comme_cpython() {
        let Ok(chemin) = std::env::var("ANALYSE_ENSEMBLES") else { return };
        let cas = loads(&std::fs::read_to_string(chemin).unwrap()).unwrap();
        for c in els(&cas) {
            let mut e = EnsembleEntiers::default();
            e.etendre(els(&c[0]).iter().map(|k| k.as_i64().unwrap() as usize));
            let attendu: Vec<usize> = els(&c[1]).iter().map(|k| k.as_i64().unwrap() as usize).collect();
            assert_eq!(e.dans_l_ordre(), attendu);
        }
        assert!(!els(&cas).is_empty());
    }

    #[test]
    fn ensemble_petit() {
        // {8, 3} se parcourt 8 puis 3 : 8 & 7 = 0
        let mut e = EnsembleEntiers::default();
        e.etendre([3, 8, 3]);
        assert_eq!(e.dans_l_ordre(), [8, 3]);
    }
}
