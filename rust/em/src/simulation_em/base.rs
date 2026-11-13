//! Ce que Python faisait tout seul sur les dict du document : `.get`, `x or y`, float(),
//! l'écriture d'un dict littéral. Les documents échangés avec les pages restent des `Json`
//! (les dict de Python, ordre des clés compris) d'un bout à l'autre.

pub use dc_solver::pyth::{fmt_g, loads, str_py};
pub use ipc2581::py::{self, dumps, Json, Objet};
pub use ligne_mom::Complex64;

/// Ce qui s'écrit dans un dict littéral.
pub trait EnJson {
    fn j(self) -> Json;
}
impl EnJson for Json {
    fn j(self) -> Json {
        self
    }
}
impl EnJson for &Json {
    fn j(self) -> Json {
        self.clone()
    }
}
impl EnJson for f64 {
    fn j(self) -> Json {
        Json::Flottant(self)
    }
}
impl EnJson for i64 {
    fn j(self) -> Json {
        Json::Entier(self)
    }
}
impl EnJson for usize {
    fn j(self) -> Json {
        Json::Entier(self as i64)
    }
}
impl EnJson for bool {
    fn j(self) -> Json {
        Json::Bool(self)
    }
}
impl EnJson for &str {
    fn j(self) -> Json {
        Json::Texte(self.to_string())
    }
}
impl EnJson for String {
    fn j(self) -> Json {
        Json::Texte(self)
    }
}
impl EnJson for &String {
    fn j(self) -> Json {
        Json::Texte(self.clone())
    }
}
impl<T: EnJson> EnJson for Vec<T> {
    fn j(self) -> Json {
        Json::Liste(self.into_iter().map(EnJson::j).collect())
    }
}
impl<T: EnJson + Clone> EnJson for &[T] {
    fn j(self) -> Json {
        Json::Liste(self.iter().cloned().map(EnJson::j).collect())
    }
}
impl<T: EnJson> EnJson for Option<T> {
    fn j(self) -> Json {
        self.map_or(Json::Nul, EnJson::j)
    }
}
impl<A: EnJson, B: EnJson> EnJson for (A, B) {
    fn j(self) -> Json {
        Json::Liste(vec![self.0.j(), self.1.j()])
    }
}

/// Un dict littéral de Python : `obj! {"cle" => valeur, ...}`.
#[macro_export]
macro_rules! obj {
    ($($k:expr => $v:expr),* $(,)?) => {{
        #[allow(unused_mut)]
        let mut o = $crate::simulation_em::base::Objet::new();
        $( o.insert(($k).to_string(), $crate::simulation_em::base::EnJson::j($v)); )*
        $crate::simulation_em::base::Json::Objet(o)
    }};
}
pub use obj;

/// d[cle] = valeur (une clé déjà là garde sa place, comme en Python).
pub fn poser(d: &mut Json, cle: &str, valeur: impl EnJson) {
    if let Json::Objet(o) = d {
        o.insert(cle.to_string(), valeur.j());
    }
}

/// d.pop(cle, None)
pub fn oter(d: &mut Json, cle: &str) -> Json {
    match d {
        Json::Objet(o) => o.shift_remove(cle).unwrap_or(Json::Nul),
        _ => Json::Nul,
    }
}

/// d[cle], à modifier sur place (la clé est créée, à Nul, si elle manque).
pub fn dans<'a>(d: &'a mut Json, cle: &str) -> &'a mut Json {
    match d {
        Json::Objet(o) => o.entry(cle.to_string()).or_insert(Json::Nul),
        _ => panic!("dans : pas un dict"),
    }
}

/// liste.append(valeur)
pub fn ajouter(l: &mut Json, valeur: impl EnJson) {
    if let Json::Liste(l) = l {
        l.push(valeur.j());
    }
}

/// `cle in d`
pub fn contient(d: &Json, cle: &str) -> bool {
    d.get(cle).is_some()
}

/// d.get(cle) quand c'est un texte ; "" sinon (`d.get(cle) or ""`).
pub fn txt<'a>(d: &'a Json, cle: &str) -> &'a str {
    d[cle].as_str().unwrap_or("")
}

/// d[cle] quand la clé porte un nombre posé par le module lui-même ; 0 sinon.
pub fn num(d: &Json, cle: &str) -> f64 {
    d[cle].as_f64().unwrap_or(0.0)
}

/// Les éléments d'une liste ; rien pour ce qui n'en est pas une.
pub fn els(v: &Json) -> &[Json] {
    v.as_liste().map_or(&[], |l| l.as_slice())
}

/// `a or b`
pub fn ou<'a>(x: &'a Json, y: &'a Json) -> &'a Json {
    if x.vrai() { x } else { y }
}

/// float(valeur), ou `defaut` quand ce n'est pas un nombre fini.
pub fn _nombre(valeur: &Json, defaut: f64) -> f64 {
    match dc_solver::pyth::float_py(valeur) {
        Ok(v) if v.is_finite() => v,
        _ => defaut,
    }
}

/// `_nombre(valeur)` : le repli à zéro.
pub fn nb(valeur: &Json) -> f64 {
    _nombre(valeur, 0.0)
}

/// max(...) de Python sur des flottants : le premier des plus grands.
pub fn maxf(v: &[f64]) -> f64 {
    v.iter().copied().reduce(|m, x| if x > m { x } else { m }).unwrap_or(f64::NAN)
}

/// min(...) de Python.
pub fn minf(v: &[f64]) -> f64 {
    v.iter().copied().reduce(|m, x| if x < m { x } else { m }).unwrap_or(f64::NAN)
}

pub fn round(x: f64, n: usize) -> f64 {
    py::round(x, n)
}

/// `v is None`
pub fn nul(v: &Json) -> bool {
    matches!(v, Json::Nul)
}

/// `str(v or "")`
pub fn str_ou_vide(v: &Json) -> String {
    if v.vrai() { str_py(v) } else { String::new() }
}

/// `int(_nombre(v, defaut))`
pub fn ent(v: &Json, defaut: i64) -> i64 {
    _nombre(v, defaut as f64) as i64
}

/// Le bout d'un troncon : `[x, y]` sous la cle, en nombres.
pub fn _bout(o: &Json, cle: &str) -> Option<(f64, f64)> {
    let l = o[cle].as_liste()?;
    if l.len() >= 2 { Some((nb(&l[0]), nb(&l[1]))) } else { None }
}

/// Un ensemble de noms, ordonne : la ou Python triait un `set` avant de l'ecrire.
pub type Noms = std::collections::BTreeSet<String>;

/// `_nombre(v, None)`
pub fn nb_opt(valeur: &Json) -> Option<f64> {
    dc_solver::pyth::float_py(valeur).ok().filter(|v| v.is_finite())
}

/// round(x) de Python : a l'entier, les moities au pair.
pub fn round0(x: f64) -> i64 {
    x.round_ties_even() as i64
}

/// `z[i] if i < len(z) else defaut`, l'indice negatif de Python compris.
pub fn zb(z: &[f64], i: i64, defaut: f64) -> f64 {
    let n = z.len() as i64;
    if i >= n {
        defaut
    } else if i >= 0 {
        z[i as usize]
    } else {
        z.get((n + i).max(0) as usize).copied().unwrap_or(defaut)
    }
}

/// Une structure de resultat de `ligne_mom` (un dict en Python), remise en dict.
/// shortcut: un flottant non fini devient null (serde_json), la ou Python ecrivait NaN ;
/// les resultats de ligne_mom sont finis.
pub fn en_json<T: serde::Serialize>(v: &T) -> Json {
    fn conv(v: serde_json::Value) -> Json {
        match v {
            serde_json::Value::Null => Json::Nul,
            serde_json::Value::Bool(b) => Json::Bool(b),
            serde_json::Value::Number(n) => match n.as_i64() {
                Some(i) if !n.is_f64() => Json::Entier(i),
                _ => Json::Flottant(n.as_f64().unwrap_or(f64::NAN)),
            },
            serde_json::Value::String(s) => Json::Texte(s),
            serde_json::Value::Array(l) => Json::Liste(l.into_iter().map(conv).collect()),
            serde_json::Value::Object(o) => Json::Objet(o.into_iter().map(|(k, v)| (k, conv(v))).collect()),
        }
    }
    conv(serde_json::to_value(v).unwrap_or(serde_json::Value::Null))
}

/// dict.update
pub fn maj(d: &mut Json, autre: Json) {
    if let (Json::Objet(o), Json::Objet(a)) = (d, autre) {
        o.extend(a);
    }
}

/// d[cle] a modifier sur place, si la cle y est.
pub fn dans_opt<'a>(d: &'a mut Json, cle: &str) -> Option<&'a mut Json> {
    match d {
        Json::Objet(o) => o.get_mut(cle),
        _ => None,
    }
}

/// `d.get(cle, defaut)` pour un nombre.
pub fn numd(d: &Json, cle: &str, defaut: f64) -> f64 {
    match d.get(cle) {
        Some(v) => v.as_f64().unwrap_or(0.0),
        None => defaut,
    }
}
