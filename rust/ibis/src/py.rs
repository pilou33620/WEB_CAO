//! Ce que Python faisait tout seul et que ce module laisse voir, en plus de `ipc2581::py` :
//! str.splitlines, str.split, les formats « %g » et « %.2f », les chiffres de `\d`, min et max.

use ipc2581::py::blanc;

/// str.splitlines() : les fins de ligne d'Unicode, pas seulement « \n ».
pub fn splitlines(t: &str) -> Vec<&str> {
    let mut lignes = Vec::new();
    let mut debut = 0;
    let mut it = t.char_indices().peekable();
    while let Some((i, c)) = it.next() {
        if matches!(c, '\n' | '\r' | '\u{b}' | '\u{c}' | '\u{1c}' | '\u{1d}' | '\u{1e}' | '\u{85}' | '\u{2028}' | '\u{2029}') {
            lignes.push(&t[debut..i]);
            debut = i + c.len_utf8();
            if c == '\r' && matches!(it.peek(), Some((_, '\n'))) {
                it.next();
                debut += 1;
            }
        }
    }
    if debut < t.len() {
        lignes.push(&t[debut..]);
    }
    lignes
}

/// str.split() sans argument.
pub fn split(t: &str) -> Vec<&str> {
    t.split(blanc).filter(|m| !m.is_empty()).collect()
}

/// Un chiffre de `\d` et de int() : tout chiffre decimal d'Unicode, et sa valeur.
pub fn chiffre(c: char) -> Option<u32> {
    if c.is_ascii() {
        return c.to_digit(10);
    }
    // la table des chiffres est celle de ipc2581::py::float, qui les lit tous
    ipc2581::py::float(c.encode_utf8(&mut [0; 4])).map(|v| v as u32)
}

/// max(a, b) de Python : le premier, sauf si le second est plus grand (un NaN ne l'est pas).
pub fn max(a: f64, b: f64) -> f64 {
    if b > a {
        b
    } else {
        a
    }
}

/// min(a, b) de Python.
pub fn min(a: f64, b: f64) -> f64 {
    if b < a {
        b
    } else {
        a
    }
}

/// « %.Nf » : l'ecriture de Rust, sauf « nan ».
pub fn pct_f(x: f64, n: usize) -> String {
    if x.is_nan() {
        return "nan".into();
    }
    format!("{:.*}", n, x)
}

/// « %.Ng » (« %g » : n = 6).
pub fn pct_g(x: f64, n: usize) -> String {
    if x.is_nan() {
        return "nan".into();
    }
    if x.is_infinite() {
        return if x > 0.0 { "inf" } else { "-inf" }.into();
    }
    let n = n.max(1);
    let e = format!("{:.*e}", n - 1, x); // « 1.23457e-5 »
    let (mantisse, exposant) = e.split_once('e').unwrap_or((&e, "0"));
    let exposant: i32 = exposant.parse().unwrap_or(0);
    let sans_zeros = |t: &str| -> String {
        if t.contains('.') {
            t.trim_end_matches('0').trim_end_matches('.').to_string()
        } else {
            t.to_string()
        }
    };
    if exposant >= -4 && exposant < n as i32 {
        return sans_zeros(&format!("{:.*}", (n as i32 - 1 - exposant) as usize, x));
    }
    format!("{}e{}{:02}", sans_zeros(mantisse), if exposant < 0 { '-' } else { '+' }, exposant.abs())
}

/// int(x) d'un flottant fini, borne a i64 ; None pour un infini (OverflowError) ou un NaN.
pub fn int(x: f64) -> Option<i64> {
    if x.is_finite() {
        Some(x.trunc() as i64)
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ecritures_de_python() {
        assert_eq!(splitlines("a\r\nb\rc\n\nd\u{85}e\u{2028}"), ["a", "b", "c", "", "d", "e"]);
        assert_eq!(split(" a\u{1f}b \t c\u{a0}"), ["a", "b", "c"]);
        for (x, n, attendu) in [(0.08, 6, "0.08"), (1e-5, 6, "1e-05"), (123456789.0, 6, "1.23457e+08"),
                                (2.0, 3, "2"), (0.0, 6, "0"), (1234.5, 3, "1.23e+03"), (-9.0, 6, "-9"),
                                (0.0001, 6, "0.0001"), (999999.5, 6, "1e+06"), (5.000000000000001, 3, "5")] {
            assert_eq!(pct_g(x, n), attendu);
        }
        assert_eq!((chiffre('7'), chiffre('٣'), chiffre('x'), chiffre('é')), (Some(7), Some(3), None, None));
        assert_eq!((max(1.0, f64::NAN), min(0.5, f64::NAN)), (1.0, 0.5));
    }
}
