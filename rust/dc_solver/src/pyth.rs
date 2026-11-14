//! Ce que Python faisait tout seul sur les valeurs d'un document : float(), int(), str(), len(),
//! l'itération, `.get` -- avec le texte de l'exception quand la valeur n'a pas le type attendu,
//! puisque `resoudre_document` le rend dans son refus --, le format « %g », et json.loads.

use ipc2581::py::{self, Json, Objet};
use std::borrow::Cow;

/// Un TypeError, ValueError ou AttributeError de Python : son texte.
#[derive(Debug, Clone, PartialEq)]
pub struct ErreurPy(pub String);

pub type Py<T> = Result<T, ErreurPy>;

/// type(v).__name__
pub fn type_py(v: &Json) -> &'static str {
    match v {
        Json::Nul => "NoneType",
        Json::Bool(_) => "bool",
        Json::Entier(_) | Json::GrandEntier(_) => "int",
        Json::Flottant(_) => "float",
        Json::Texte(_) => "str",
        Json::Liste(_) => "list",
        Json::Objet(_) => "dict",
    }
}

/// repr() d'un texte : apostrophes, sauf s'il en contient et pas de guillemets.
fn repr_texte(t: &str) -> String {
    let q = if t.contains('\'') && !t.contains('"') { '"' } else { '\'' };
    let mut s = String::from(q);
    for c in t.chars() {
        match c {
            '\\' => s.push_str("\\\\"),
            '\n' => s.push_str("\\n"),
            '\r' => s.push_str("\\r"),
            '\t' => s.push_str("\\t"),
            c if c == q => {
                s.push('\\');
                s.push(c)
            }
            c if (c as u32) < 0x20 || c as u32 == 0x7f => s.push_str(&format!("\\x{:02x}", c as u32)),
            c => s.push(c),
        }
    }
    s.push(q);
    s
}

/// repr(v)
pub fn repr_py(v: &Json) -> String {
    match v {
        Json::Texte(t) => repr_texte(t),
        Json::Liste(l) => format!("[{}]", l.iter().map(repr_py).collect::<Vec<_>>().join(", ")),
        Json::Objet(o) => {
            format!("{{{}}}", o.iter().map(|(k, v)| format!("{}: {}", repr_texte(k), repr_py(v))).collect::<Vec<_>>().join(", "))
        }
        _ => str_py(v),
    }
}

/// str(v)
pub fn str_py(v: &Json) -> String {
    match v {
        Json::Nul => "None".into(),
        Json::Bool(b) => if *b { "True" } else { "False" }.into(),
        Json::Entier(i) => i.to_string(),
        Json::GrandEntier(t) => t.clone(),
        Json::Flottant(f) => py::repr_flottant(*f),
        Json::Texte(t) => t.clone(),
        _ => repr_py(v),
    }
}

/// float(v)
pub fn float_py(v: &Json) -> Py<f64> {
    match v {
        Json::Bool(b) => Ok(*b as u8 as f64),
        Json::Entier(i) => Ok(*i as f64),
        // shortcut: un entier au-delà de 1e308 rend l'infini au lieu d'OverflowError
        Json::GrandEntier(t) => Ok(t.parse().unwrap_or(f64::INFINITY)),
        Json::Flottant(f) => Ok(*f),
        Json::Texte(t) => {
            py::float(t).ok_or_else(|| ErreurPy(format!("could not convert string to float: {}", repr_texte(t))))
        }
        _ => Err(ErreurPy(format!("float() argument must be a string or a real number, not '{}'", type_py(v)))),
    }
}

/// int(v) : la troncature d'un flottant, la lecture d'un texte d'entier.
/// shortcut: borné à i64 (Python n'a pas de borne) ; un rang de couche n'en approche pas.
pub fn int_py(v: &Json) -> Py<i64> {
    match v {
        Json::Bool(b) => Ok(*b as i64),
        Json::Entier(i) => Ok(*i),
        Json::GrandEntier(t) => Ok(if t.starts_with('-') { i64::MIN } else { i64::MAX }),
        Json::Flottant(f) if f.is_nan() => Err(ErreurPy("cannot convert float NaN to integer".into())),
        Json::Flottant(f) if f.is_infinite() => Err(ErreurPy("cannot convert float infinity to integer".into())),
        Json::Flottant(f) => Ok(f.trunc() as i64),
        Json::Texte(t) => {
            let refus = || ErreurPy(format!("invalid literal for int() with base 10: {}", repr_texte(t)));
            let s = py::strip(t);
            let chiffres = s.strip_prefix(['+', '-']).unwrap_or(s);
            let o = chiffres.as_bytes();
            let bien = !o.is_empty()
                && o.iter().enumerate().all(|(i, c)| {
                    c.is_ascii_digit() || (*c == b'_' && i > 0 && i + 1 < o.len() && o[i - 1] != b'_' && o[i + 1] != b'_')
                });
            if !bien {
                return Err(refus());
            }
            let n: i64 = chiffres.replace('_', "").parse().unwrap_or(i64::MAX);
            Ok(if s.starts_with('-') { -n } else { n })
        }
        _ => Err(ErreurPy(format!(
            "int() argument must be a string, a bytes-like object or a real number, not '{}'",
            type_py(v)
        ))),
    }
}

/// L'objet sur lequel on appelle `.get` : AttributeError s'il n'en est pas un.
pub fn objet(v: &Json) -> Py<&Objet> {
    v.as_objet().ok_or_else(|| ErreurPy(format!("'{}' object has no attribute 'get'", type_py(v))))
}

/// `for x in v` : les éléments d'une liste, les caractères d'un texte, les clés d'un dict.
pub fn elements(v: &Json) -> Py<Cow<'_, [Json]>> {
    match v {
        Json::Liste(l) => Ok(Cow::Borrowed(l)),
        Json::Texte(t) => Ok(Cow::Owned(t.chars().map(|c| Json::Texte(c.to_string())).collect())),
        Json::Objet(o) => Ok(Cow::Owned(o.keys().map(|k| Json::Texte(k.clone())).collect())),
        _ => Err(ErreurPy(format!("'{}' object is not iterable", type_py(v)))),
    }
}

/// len(v)
pub fn len_py(v: &Json) -> Py<usize> {
    match v {
        Json::Liste(l) => Ok(l.len()),
        Json::Texte(t) => Ok(t.chars().count()),
        Json::Objet(o) => Ok(o.len()),
        _ => Err(ErreurPy(format!("object of type '{}' has no len()", type_py(v)))),
    }
}

/// max(a, b) de Python : le premier, sauf si le second est strictement plus grand (un NaN en
/// tête y reste, ce que f64::max ne fait pas).
pub fn max_py(a: f64, b: f64) -> f64 {
    if b > a { b } else { a }
}

/// min(a, b) de Python.
pub fn min_py(a: f64, b: f64) -> f64 {
    if b < a { b } else { a }
}

/// « %.{precision}g » ; « %g » est fmt_g(x, 6).
pub fn fmt_g(x: f64, precision: usize) -> String {
    if x.is_nan() {
        return "nan".into();
    }
    if x.is_infinite() {
        return if x > 0.0 { "inf" } else { "-inf" }.into();
    }
    let p = precision.max(1);
    let e = format!("{:.*e}", p - 1, x); // l'exposant APRES arrondi a p chiffres
    let (mantisse, exposant) = e.split_once('e').unwrap_or((&e, "0"));
    let exposant: i32 = exposant.parse().unwrap_or(0);
    let sans_zeros = |t: &str| if t.contains('.') { t.trim_end_matches('0').trim_end_matches('.').to_string() } else { t.to_string() };
    if (-4..p as i32).contains(&exposant) {
        sans_zeros(&format!("{:.*}", (p as i32 - 1 - exposant) as usize, x))
    } else {
        format!("{}e{}{:02}", sans_zeros(mantisse), if exposant < 0 { '-' } else { '+' }, exposant.abs())
    }
}

/// json.loads : un entier reste un entier, NaN et Infinity sont admis comme Python les écrit.
pub fn loads(texte: &str) -> Result<Json, String> {
    let mut l = Lecteur { o: texte.as_bytes(), i: 0 };
    let v = l.valeur()?;
    l.blancs();
    if l.i < l.o.len() {
        return Err(format!("Extra data: char {}", l.i));
    }
    Ok(v)
}

struct Lecteur<'a> {
    o: &'a [u8],
    i: usize,
}

impl Lecteur<'_> {
    fn blancs(&mut self) {
        while self.i < self.o.len() && matches!(self.o[self.i], b' ' | b'\t' | b'\n' | b'\r') {
            self.i += 1;
        }
    }

    fn mot(&mut self, mot: &str, v: Json) -> Result<Json, String> {
        if self.o[self.i..].starts_with(mot.as_bytes()) {
            self.i += mot.len();
            Ok(v)
        } else {
            Err(format!("Expecting value: char {}", self.i))
        }
    }

    fn valeur(&mut self) -> Result<Json, String> {
        self.blancs();
        match self.o.get(self.i).copied() {
            Some(b'{') => {
                self.i += 1;
                let mut o = Objet::new();
                self.blancs();
                if self.o.get(self.i) == Some(&b'}') {
                    self.i += 1;
                    return Ok(Json::Objet(o));
                }
                loop {
                    self.blancs();
                    let cle = self.texte()?;
                    self.blancs();
                    if self.o.get(self.i) != Some(&b':') {
                        return Err(format!("Expecting ':' delimiter: char {}", self.i));
                    }
                    self.i += 1;
                    let v = self.valeur()?;
                    o.insert(cle, v); // une clé répétée : la dernière valeur, à la première place
                    self.blancs();
                    match self.o.get(self.i) {
                        Some(b',') => self.i += 1,
                        Some(b'}') => {
                            self.i += 1;
                            return Ok(Json::Objet(o));
                        }
                        _ => return Err(format!("Expecting ',' delimiter: char {}", self.i)),
                    }
                }
            }
            Some(b'[') => {
                self.i += 1;
                let mut l = Vec::new();
                self.blancs();
                if self.o.get(self.i) == Some(&b']') {
                    self.i += 1;
                    return Ok(Json::Liste(l));
                }
                loop {
                    l.push(self.valeur()?);
                    self.blancs();
                    match self.o.get(self.i) {
                        Some(b',') => self.i += 1,
                        Some(b']') => {
                            self.i += 1;
                            return Ok(Json::Liste(l));
                        }
                        _ => return Err(format!("Expecting ',' delimiter: char {}", self.i)),
                    }
                }
            }
            Some(b'"') => Ok(Json::Texte(self.texte()?)),
            Some(b't') => self.mot("true", Json::Bool(true)),
            Some(b'f') => self.mot("false", Json::Bool(false)),
            Some(b'n') => self.mot("null", Json::Nul),
            Some(b'N') => self.mot("NaN", Json::Flottant(f64::NAN)),
            Some(b'I') => self.mot("Infinity", Json::Flottant(f64::INFINITY)),
            Some(b'-') if self.o[self.i..].starts_with(b"-Infinity") => self.mot("-Infinity", Json::Flottant(f64::NEG_INFINITY)),
            Some(b'-' | b'0'..=b'9') => {
                let debut = self.i;
                self.i += 1;
                let mut entier = true;
                while let Some(c) = self.o.get(self.i) {
                    match c {
                        b'0'..=b'9' => {}
                        b'.' | b'e' | b'E' | b'+' | b'-' => entier = false,
                        _ => break,
                    }
                    self.i += 1;
                }
                let t = std::str::from_utf8(&self.o[debut..self.i]).unwrap_or("");
                if entier {
                    return Ok(t.parse::<i64>().map(Json::Entier).unwrap_or_else(|_| Json::GrandEntier(t.to_string())));
                }
                t.parse::<f64>().map(Json::Flottant).map_err(|_| format!("Expecting value: char {debut}"))
            }
            _ => Err(format!("Expecting value: char {}", self.i)),
        }
    }

    fn hex4(&mut self) -> Result<u32, String> {
        let t = self.o.get(self.i..self.i + 4).and_then(|h| std::str::from_utf8(h).ok());
        let n = t.and_then(|h| u32::from_str_radix(h, 16).ok()).ok_or(format!("Invalid \\uXXXX escape: char {}", self.i))?;
        self.i += 4;
        Ok(n)
    }

    fn texte(&mut self) -> Result<String, String> {
        if self.o.get(self.i) != Some(&b'"') {
            return Err(format!("Expecting property name enclosed in double quotes: char {}", self.i));
        }
        self.i += 1;
        let mut s = Vec::new();
        loop {
            let c = *self.o.get(self.i).ok_or("Unterminated string")?;
            self.i += 1;
            match c {
                b'"' => return String::from_utf8(s).map_err(|e| e.to_string()),
                b'\\' => {
                    let e = *self.o.get(self.i).ok_or("Unterminated string")?;
                    self.i += 1;
                    let car = match e {
                        b'n' => '\n',
                        b't' => '\t',
                        b'r' => '\r',
                        b'b' => '\u{8}',
                        b'f' => '\u{c}',
                        b'u' => {
                            let mut n = self.hex4()?;
                            // une paire de substitution : deux \u a la suite
                            if (0xD800..0xDC00).contains(&n) && self.o[self.i..].starts_with(b"\\u") {
                                self.i += 2;
                                let bas = self.hex4()?;
                                n = 0x10000 + ((n - 0xD800) << 10) + (bas.wrapping_sub(0xDC00) & 0x3ff);
                            }
                            char::from_u32(n).unwrap_or('\u{fffd}')
                        }
                        b'"' | b'\\' | b'/' => e as char,
                        _ => return Err(format!("Invalid \\escape: char {}", self.i - 1)),
                    };
                    s.extend_from_slice(car.encode_utf8(&mut [0; 4]).as_bytes());
                }
                c => s.push(c),
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn formats_de_python() {
        // relevés sur Python 3.13 : "%g" % x, "%.3g" % x, "%.4g" % x
        for (x, p, attendu) in [(1e-300, 6, "1e-300"), (0.01, 6, "0.01"), (500.0, 6, "500"), (1234567.0, 6, "1.23457e+06"),
                                (0.0001, 6, "0.0001"), (0.00001234, 6, "1.234e-05"), (7.266e-10, 3, "7.27e-10"),
                                (0.5, 4, "0.5"), (999999.5, 6, "1e+06"), (0.0, 6, "0"), (-2.5, 6, "-2.5"),
                                (f64::INFINITY, 6, "inf"), (123.456, 4, "123.5"), (100.0, 3, "100"), (1000.0, 3, "1e+03")] {
            assert_eq!(fmt_g(x, p), attendu);
        }
        assert_eq!(float_py(&Json::Texte("abc".into())).unwrap_err().0, "could not convert string to float: 'abc'");
        assert_eq!(float_py(&Json::Liste(vec![])).unwrap_err().0,
                   "float() argument must be a string or a real number, not 'list'");
        assert_eq!(int_py(&Json::Texte(" -1_2 ".into())), Ok(-12));
        assert_eq!(int_py(&Json::Texte("1.5".into())).unwrap_err().0, "invalid literal for int() with base 10: '1.5'");
        assert_eq!(int_py(&Json::Flottant(-1.7)), Ok(-1));
        assert_eq!(str_py(&loads(r#"[1, 2.0, "a'b", null, true, {"k": "v"}]"#).unwrap()),
                   "[1, 2.0, \"a'b\", None, True, {'k': 'v'}]");
    }

    #[test]
    fn lecture_json() {
        let v = loads(r#" {"a": [1, -2.5e3, 1E2, 12345678901234567890], "é": "x\né😀", "n": null, "i": -Infinity} "#).unwrap();
        assert_eq!(py::dumps(&v), "{\"a\": [1, -2500.0, 100.0, 12345678901234567890], \"é\": \"x\\né😀\", \"n\": null, \"i\": -Infinity}");
        assert!(loads("[1,]").is_err() && loads("{} x").is_err() && loads("").is_err());
    }
}
