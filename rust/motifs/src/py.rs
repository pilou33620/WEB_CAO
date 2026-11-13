//! Ce que Python faisait tout seul et que les trois modules laissent voir : json.loads, str()
//! d'une valeur quelconque, `a or b`, le nom des types dans les messages d'exception. Le reste
//! (json.dumps, float(), round(), sum(), math.hypot) vient de `ipc2581::py`.

pub use ipc2581::py::{dumps, float, hypot, repr_flottant, round, strip, sum};
pub use ipc2581::{Json, Objet};

pub static NUL: Json = Json::Nul;
pub static VIDE: Json = Json::Texte(String::new());

/// type(v).__name__, tel que les messages d'exception de Python le citent.
pub fn nom_type(v: &Json) -> &'static str {
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

/// AttributeError d'une méthode appelée sur autre chose que ce qui la porte.
pub fn sans_attribut(v: &Json, attribut: &str) -> String {
    format!("'{}' object has no attribute '{}'", nom_type(v), attribut)
}

/// v.get(cle, défaut) : None pour une clé absente ; une erreur si v n'est pas un dict.
pub fn get_opt<'a>(v: &'a Json, cle: &str) -> Result<Option<&'a Json>, String> {
    match v {
        Json::Objet(o) => Ok(o.get(cle)),
        _ => Err(sans_attribut(v, "get")),
    }
}

/// v.get(cle)
pub fn get<'a>(v: &'a Json, cle: &str) -> Result<&'a Json, String> {
    Ok(get_opt(v, cle)?.unwrap_or(&NUL))
}

/// v.get(a) or v.get(b) or ""
pub fn ou<'a>(v: &'a Json, a: &str, b: &str) -> Result<&'a Json, String> {
    let x = get(v, a)?;
    if x.vrai() {
        return Ok(x);
    }
    let y = get(v, b)?;
    Ok(if y.vrai() { y } else { &VIDE })
}

/// `for x in v` : les éléments d'une liste. Une chaîne ou un dict se parcourent aussi (leurs
/// caractères, leurs clés : des str, sur lesquelles l'appelant butait à `.get`) ; le reste ne
/// se parcourt pas.
pub fn elements(v: &Json) -> Result<&[Json], String> {
    match v {
        Json::Liste(l) => Ok(l),
        Json::Texte(t) if t.is_empty() => Ok(&[]),
        Json::Objet(o) if o.is_empty() => Ok(&[]),
        Json::Texte(_) | Json::Objet(_) => Err("'str' object has no attribute 'get'".into()),
        _ => Err(format!("'{}' object is not iterable", nom_type(v))),
    }
}

/// str(v)
pub fn str(v: &Json) -> String {
    match v {
        Json::Texte(t) => t.clone(),
        _ => repr(v),
    }
}

/// repr(v)
/// shortcut: dans une chaîne, seuls les caractères de contrôle ASCII sont échappés (Python
/// échappe aussi les non imprimables d'Unicode) ; à compléter si une valeur de composant en
/// forme de liste de tels textes devait un jour être affichée.
pub fn repr(v: &Json) -> String {
    match v {
        Json::Nul => "None".into(),
        Json::Bool(b) => if *b { "True" } else { "False" }.into(),
        Json::Entier(i) => i.to_string(),
        Json::GrandEntier(t) => t.clone(),
        Json::Flottant(f) => repr_flottant(*f),
        Json::Texte(t) => {
            let guillemet = if t.contains('\'') && !t.contains('"') { '"' } else { '\'' };
            let mut s = String::from(guillemet);
            for c in t.chars() {
                match c {
                    '\\' => s.push_str("\\\\"),
                    '\n' => s.push_str("\\n"),
                    '\r' => s.push_str("\\r"),
                    '\t' => s.push_str("\\t"),
                    c if c == guillemet => {
                        s.push('\\');
                        s.push(c);
                    }
                    c if (c as u32) < 0x20 || c as u32 == 0x7f => s.push_str(&format!("\\x{:02x}", c as u32)),
                    c => s.push(c),
                }
            }
            s.push(guillemet);
            s
        }
        Json::Liste(l) => format!("[{}]", l.iter().map(repr).collect::<Vec<_>>().join(", ")),
        Json::Objet(o) => {
            let paires: Vec<String> = o.iter().map(|(k, e)| format!("{}: {}", repr(&Json::Texte(k.clone())), repr(e))).collect();
            format!("{{{}}}", paires.join(", "))
        }
    }
}

/// float(v) d'une valeur JSON : un nombre, un booléen, ou un texte que float() sait lire.
pub fn flottant(v: &Json) -> Result<f64, String> {
    match v {
        Json::Bool(b) => Ok(*b as u8 as f64),
        Json::Entier(i) => Ok(*i as f64),
        Json::Flottant(f) => Ok(*f),
        Json::GrandEntier(t) => match t.parse::<f64>() {
            Ok(f) if f.is_finite() => Ok(f),
            _ => Err("int too large to convert to float".into()),
        },
        Json::Texte(t) => float(t).ok_or_else(|| format!("could not convert string to float: {}", repr(v))),
        _ => Err(format!("float() argument must be a string or a real number, not '{}'", nom_type(v))),
    }
}

/// Un objet JSON, dans l'ordre donné.
pub fn objet<const N: usize>(paires: [(&str, Json); N]) -> Json {
    Json::Objet(paires.into_iter().map(|(k, v)| (k.to_string(), v)).collect())
}

/// Une liste JSON de textes.
pub fn textes<T: AsRef<str>>(l: &[T]) -> Json {
    Json::Liste(l.iter().map(|t| t.as_ref().into()).collect())
}

/// json.loads(texte) : les entiers restent des entiers (sans borne), NaN et Infinity sont lus.
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
        while matches!(self.o.get(self.i), Some(b' ' | b'\t' | b'\n' | b'\r')) {
            self.i += 1;
        }
    }
    fn mot(&mut self, mot: &str, v: Json) -> Option<Json> {
        self.o[self.i..].starts_with(mot.as_bytes()).then(|| {
            self.i += mot.len();
            v
        })
    }
    fn attendu(&self) -> String {
        format!("Expecting value: char {}", self.i)
    }
    fn valeur(&mut self) -> Result<Json, String> {
        self.blancs();
        match self.o.get(self.i) {
            Some(b'{') => {
                self.i += 1;
                let mut obj = Objet::new();
                self.blancs();
                if self.o.get(self.i) == Some(&b'}') {
                    self.i += 1;
                    return Ok(Json::Objet(obj));
                }
                loop {
                    self.blancs();
                    if self.o.get(self.i) != Some(&b'"') {
                        return Err(format!("Expecting property name enclosed in double quotes: char {}", self.i));
                    }
                    let cle = self.chaine()?;
                    self.blancs();
                    if self.o.get(self.i) != Some(&b':') {
                        return Err(format!("Expecting ':' delimiter: char {}", self.i));
                    }
                    self.i += 1;
                    let v = self.valeur()?;
                    obj.insert(cle, v);
                    self.blancs();
                    match self.o.get(self.i) {
                        Some(b',') => self.i += 1,
                        Some(b'}') => {
                            self.i += 1;
                            return Ok(Json::Objet(obj));
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
            Some(b'"') => Ok(Json::Texte(self.chaine()?)),
            Some(_) => {
                let constantes = [
                    ("null", Json::Nul),
                    ("true", Json::Bool(true)),
                    ("false", Json::Bool(false)),
                    ("NaN", Json::Flottant(f64::NAN)),
                    ("Infinity", Json::Flottant(f64::INFINITY)),
                    ("-Infinity", Json::Flottant(f64::NEG_INFINITY)),
                ];
                for (mot, v) in constantes {
                    if let Some(v) = self.mot(mot, v) {
                        return Ok(v);
                    }
                }
                self.nombre()
            }
            None => Err(self.attendu()),
        }
    }
    fn nombre(&mut self) -> Result<Json, String> {
        let debut = self.i;
        let chiffres = |l: &mut Self| {
            let d = l.i;
            while l.o.get(l.i).is_some_and(u8::is_ascii_digit) {
                l.i += 1;
            }
            l.i > d
        };
        if self.o.get(self.i) == Some(&b'-') {
            self.i += 1;
        }
        let zero = self.o.get(self.i) == Some(&b'0');
        let d = self.i;
        if !chiffres(self) {
            self.i = debut;
            return Err(self.attendu());
        }
        if zero {
            self.i = d + 1; // « 012 » : le 0 seul est lu, la suite est de trop
        }
        let mut entier = true;
        if self.o.get(self.i) == Some(&b'.') && self.o.get(self.i + 1).is_some_and(u8::is_ascii_digit) {
            self.i += 1;
            chiffres(self);
            entier = false;
        }
        if matches!(self.o.get(self.i), Some(b'e' | b'E')) {
            let avant = self.i;
            self.i += 1;
            if matches!(self.o.get(self.i), Some(b'+' | b'-')) {
                self.i += 1;
            }
            if chiffres(self) {
                entier = false;
            } else {
                self.i = avant;
            }
        }
        let t = std::str::from_utf8(&self.o[debut..self.i]).unwrap_or("");
        if entier {
            return Ok(match t.parse::<i64>() {
                Ok(i) => Json::Entier(i),
                Err(_) => Json::GrandEntier(t.to_string()),
            });
        }
        t.parse::<f64>().map(Json::Flottant).map_err(|_| self.attendu())
    }
    fn hexa4(&mut self) -> Result<u32, String> {
        let t = self.o.get(self.i..self.i + 4).and_then(|t| std::str::from_utf8(t).ok()).unwrap_or("");
        let n = u32::from_str_radix(t, 16).map_err(|_| format!("Invalid \\uXXXX escape: char {}", self.i))?;
        self.i += 4;
        Ok(n)
    }
    fn chaine(&mut self) -> Result<String, String> {
        self.i += 1;
        let mut s: Vec<u8> = Vec::new();
        loop {
            let Some(&c) = self.o.get(self.i) else {
                return Err(format!("Unterminated string starting at: char {}", self.i));
            };
            self.i += 1;
            match c {
                b'"' => break,
                b'\\' => {
                    let Some(&e) = self.o.get(self.i) else {
                        return Err(format!("Unterminated string starting at: char {}", self.i));
                    };
                    self.i += 1;
                    let car = match e {
                        b'"' => '"',
                        b'\\' => '\\',
                        b'/' => '/',
                        b'b' => '\u{8}',
                        b'f' => '\u{c}',
                        b'n' => '\n',
                        b'r' => '\r',
                        b't' => '\t',
                        b'u' => {
                            let mut n = self.hexa4()?;
                            if (0xD800..0xDC00).contains(&n) && self.o[self.i..].starts_with(b"\\u") {
                                let retour = self.i;
                                self.i += 2;
                                let bas = self.hexa4()?;
                                if (0xDC00..0xE000).contains(&bas) {
                                    n = 0x10000 + ((n - 0xD800) << 10) + (bas - 0xDC00);
                                } else {
                                    self.i = retour;
                                }
                            }
                            // shortcut: un demi-codet isolé (que Python garde dans sa str) devient U+FFFD
                            char::from_u32(n).unwrap_or('\u{FFFD}')
                        }
                        _ => return Err(format!("Invalid \\escape: char {}", self.i - 1)),
                    };
                    s.extend_from_slice(car.encode_utf8(&mut [0; 4]).as_bytes());
                }
                c if c < 0x20 => return Err(format!("Invalid control character at: char {}", self.i - 1)),
                c => s.push(c),
            }
        }
        String::from_utf8(s).map_err(|e| e.to_string())
    }
}
