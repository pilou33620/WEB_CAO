//! Le JSON tel que Python le lisait et l'écrivait : les pages et les fichiers du disque
//! gardent leurs octets.

use std::fmt::Write as _;

pub use dc_solver::pyth::{float_py, fmt_g, repr_py, str_py};
pub use ipc2581::py::{blanc, dumps, strip, Json, Objet};

/// Un dict de Python, clé par clé dans l'ordre.
#[macro_export]
macro_rules! obj {
    ($($cle:expr => $valeur:expr),* $(,)?) => {{
        #[allow(unused_mut)]
        let mut o = $crate::json::Objet::new();
        $( o.insert($cle.to_string(), $crate::json::Json::from($valeur)); )*
        $crate::json::Json::Objet(o)
    }};
}

/// json.dumps(charge) : tout ce qui sort de l'ASCII imprimable s'écrit \uXXXX.
pub fn ascii(texte: String) -> String {
    if texte.chars().all(|c| (' '..='~').contains(&c)) {
        return texte;
    }
    let mut out = String::with_capacity(texte.len() + texte.len() / 4);
    let mut paire = [0u16; 2];
    for c in texte.chars() {
        if (' '..='~').contains(&c) {
            out.push(c);
        } else {
            for u in c.encode_utf16(&mut paire) {
                let _ = write!(out, "\\u{:04x}", u);
            }
        }
    }
    out
}

/// NaN et ±inf deviennent null : ce ne sont pas du JSON, la page ne relirait pas la réponse.
pub fn sans_non_finis(v: &mut Json) {
    match v {
        Json::Flottant(f) if !f.is_finite() => *v = Json::Nul,
        Json::Liste(l) => l.iter_mut().for_each(sans_non_finis),
        Json::Objet(o) => o.values_mut().for_each(sans_non_finis),
        _ => {}
    }
}

/// Le premier NaN ou infini du document, sous le nom que Python lui donne.
pub fn non_fini(v: &Json) -> Option<&'static str> {
    match v {
        Json::Flottant(f) if f.is_nan() => Some("NaN"),
        Json::Flottant(f) if f.is_infinite() => Some(if *f > 0.0 { "Infinity" } else { "-Infinity" }),
        Json::Liste(l) => l.iter().find_map(non_fini),
        Json::Objet(o) => o.values().find_map(non_fini),
        _ => None,
    }
}

/// json.dumps(v, ensure_ascii=False, indent=n).
pub fn dumps_indente(v: &Json, n: usize) -> String {
    fn ecrire(v: &Json, n: usize, niveau: usize, s: &mut String) {
        let marge = |s: &mut String, niveau: usize| {
            s.push('\n');
            s.extend(std::iter::repeat_n(' ', n * niveau));
        };
        match v {
            Json::Liste(l) if !l.is_empty() => {
                s.push('[');
                for (i, e) in l.iter().enumerate() {
                    if i > 0 {
                        s.push(',');
                    }
                    marge(s, niveau + 1);
                    ecrire(e, n, niveau + 1, s);
                }
                marge(s, niveau);
                s.push(']');
            }
            Json::Objet(o) if !o.is_empty() => {
                s.push('{');
                for (i, (k, e)) in o.iter().enumerate() {
                    if i > 0 {
                        s.push(',');
                    }
                    marge(s, niveau + 1);
                    s.push_str(&dumps(&Json::Texte(k.clone())));
                    s.push_str(": ");
                    ecrire(e, n, niveau + 1, s);
                }
                marge(s, niveau);
                s.push('}');
            }
            feuille => s.push_str(&dumps(feuille)),
        }
    }
    let mut s = String::new();
    ecrire(v, n, 0, &mut s);
    s
}

// Python s'arrête vers mille niveaux (RecursionError) ; le lecteur d'ici descendrait
// jusqu'à faire déborder la pile du fil.
const PROFONDEUR_MAX: usize = 900;

/// Le crochet ou l'accolade qui dépasse la profondeur admise, s'il y en a un.
fn trop_profond(texte: &str) -> Option<u8> {
    let (mut niveau, mut dans_texte, mut echappe) = (0usize, false, false);
    for c in texte.bytes() {
        if dans_texte {
            match c {
                _ if echappe => echappe = false,
                b'\\' => echappe = true,
                b'"' => dans_texte = false,
                _ => {}
            }
            continue;
        }
        match c {
            b'"' => dans_texte = true,
            b'[' | b'{' => {
                niveau += 1;
                if niveau > PROFONDEUR_MAX {
                    return Some(c);
                }
            }
            b']' | b'}' => niveau = niveau.saturating_sub(1),
            _ => {}
        }
    }
    None
}

/// json.loads, avec le texte de l'exception de Python : « ... : line 1 column 5 (char 4) ».
pub fn loads(texte: &str) -> Result<Json, String> {
    if let Some(c) = trop_profond(texte) {
        return Err(format!("maximum recursion depth exceeded while decoding a JSON {} from a unicode string", if c == b'[' { "array" } else { "object" }));
    }
    dc_solver::pyth::loads(texte).map_err(|e| {
        let Some((message, octet)) = e.rsplit_once(": char ").and_then(|(m, n)| Some((m, n.parse::<usize>().ok()?))) else { return e };
        let Some(avant) = texte.get(..octet) else { return e };
        let ligne = avant.matches('\n').count() + 1;
        let colonne = avant.rsplit('\n').next().unwrap_or("").chars().count() + 1;
        format!("{}: line {} column {} (char {})", message, ligne, colonne, avant.chars().count())
    })
}

/// octets.decode("utf-8"), avec le texte de l'UnicodeDecodeError de Python.
pub fn decoder_utf8(octets: Vec<u8>) -> Result<String, String> {
    String::from_utf8(octets).map_err(|e| {
        let (i, o) = (e.utf8_error().valid_up_to(), e.as_bytes());
        let raison = match e.utf8_error().error_len() {
            None => "unexpected end of data",
            Some(_) if (0xC2..=0xF4).contains(&o[i]) => "invalid continuation byte",
            Some(_) => "invalid start byte",
        };
        format!("'utf-8' codec can't decode byte 0x{:02x} in position {}: {}", o[i], i, raison)
    })
}

/// Le texte JSON porte-t-il un « \udXXX » sans son jumeau ? Python le lisait, puis ne
/// pouvait pas l'écrire en UTF-8 (UnicodeEncodeError) ; ici il deviendrait U+FFFD en silence.
pub fn substitut_seul(texte: &str) -> bool {
    let o = texte.as_bytes();
    let hex = |i: usize| o.get(i..i + 4).and_then(|h| u32::from_str_radix(std::str::from_utf8(h).ok()?, 16).ok());
    let mut i = 0;
    while i + 1 < o.len() {
        if o[i] != b'\\' {
            i += 1;
            continue;
        }
        if o[i + 1] != b'u' {
            i += 2;
            continue;
        }
        match hex(i + 2) {
            Some(haut @ 0xD800..=0xDBFF) => {
                let bas = (o.get(i + 6..i + 8) == Some(b"\\u")).then(|| hex(i + 8)).flatten();
                if !matches!(bas, Some(0xDC00..=0xDFFF)) {
                    let _ = haut;
                    return true;
                }
                i += 12;
            }
            Some(0xDC00..=0xDFFF) => return true,
            _ => i += 6,
        }
    }
    false
}

/// Ce que rend la passerelle MCP (serde_json), dans le JSON des réponses.
pub fn de_serde(v: serde_json::Value) -> Json {
    use serde_json::Value;
    match v {
        Value::Null => Json::Nul,
        Value::Bool(b) => Json::Bool(b),
        Value::Number(n) => match (n.as_i64(), n.as_f64()) {
            (Some(i), _) => Json::Entier(i),
            (None, Some(f)) if n.is_f64() => Json::Flottant(f),
            _ => Json::GrandEntier(n.to_string()),
        },
        Value::String(s) => Json::Texte(s),
        Value::Array(l) => Json::Liste(l.into_iter().map(de_serde).collect()),
        Value::Object(o) => Json::Objet(o.into_iter().map(|(k, v)| (k, de_serde(v))).collect()),
    }
}

#[cfg(test)]
mod essais {
    use super::*;

    #[test]
    fn comme_python() {
        let v = loads(r#"{"détail": "été €😀", "n": [1, 2.5, null], "v": {}, "l": []}"#).unwrap();
        assert_eq!(ascii(dumps(&v)), r#"{"d\u00e9tail": "\u00e9t\u00e9 \u20ac\ud83d\ude00", "n": [1, 2.5, null], "v": {}, "l": []}"#);
        assert_eq!(dumps_indente(&v, 1), "{\n \"détail\": \"été €😀\",\n \"n\": [\n  1,\n  2.5,\n  null\n ],\n \"v\": {},\n \"l\": []\n}");
        assert_eq!(loads("{\"a\": 1,\n \"é\": x}").unwrap_err(), "Expecting value: line 2 column 7 (char 15)");
        assert_eq!(loads(&"[".repeat(100000)).unwrap_err(), "maximum recursion depth exceeded while decoding a JSON array from a unicode string");
        assert_eq!(decoder_utf8(vec![b'a', 0xff]).unwrap_err(), "'utf-8' codec can't decode byte 0xff in position 1: invalid start byte");
        assert_eq!(decoder_utf8(vec![0xc3]).unwrap_err(), "'utf-8' codec can't decode byte 0xc3 in position 0: unexpected end of data");
        assert_eq!(decoder_utf8(vec![0xc3, b'a']).unwrap_err(), "'utf-8' codec can't decode byte 0xc3 in position 0: invalid continuation byte");
        let mut n = loads(r#"{"a": [NaN, -Infinity, 1.5]}"#).unwrap();
        assert_eq!(non_fini(&n), Some("NaN"));
        sans_non_finis(&mut n);
        assert_eq!(dumps(&n), r#"{"a": [null, null, 1.5]}"#);
        assert!(substitut_seul(r#"{"a": "\ud800"}"#) && substitut_seul(r#""\udc00""#) && substitut_seul(r#""\ud800\u0041""#));
        assert!(!substitut_seul(r#"{"a": "\ud83d\ude00 \\ud800 \u00e9"}"#));
        assert_eq!(dumps(&de_serde(serde_json::json!({"a": [1, 1.0, "x", null, 18446744073709551615u64]}))), r#"{"a": [1, 1.0, "x", null, 18446744073709551615]}"#);
    }
}
