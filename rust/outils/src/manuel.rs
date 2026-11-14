//! Assemble les chapitres Markdown de docs/manuel/ en une page unique, docs/manuel/manuel.html,
//! et ceux de docs/regles/ en docs/regles/regles.html (le bouton « Règles »).
//!
//! Page autonome (styles et script en ligne) : elle s'ouvre en double-clic, sans serveur.
//! Sommaire à gauche, recherche plein texte. Les chapitres sont pris dans l'ordre alphabétique
//! de leur nom (01-…, 02-…) ; index.md est le seuil et passe toujours en premier.
//!
//! Sous-ensemble de Markdown compris : titres, paragraphes, listes (une imbrication par
//! indentation), tableaux, blocs de code, citations (dont > [!NOTE]), règle, et en ligne
//! `code`, **gras**, *italique*, [lien](cible). Rien d'autre : un chapitre qui en demande
//! plus se réécrit.
//!
//! Contrôle : un lien vers un autre chapitre (x.md, x.md#ancre) ou vers un fichier du dépôt
//! doit exister ; sinon l'outil liste les liens cassés et rend le code 1.
//!
//!     build-manuel
//!
//! Les expressions régulières sont celles du script Python ; `\w` et `\s` y sont écrits
//! `[\p{L}\p{N}_]` et `[\s\x1c-\x1f]`, qui sont ce que Python entend par là.

use crate::{lire_texte, normpath, relpath};
use regex::{Captures, Regex};
use std::collections::{BTreeSet, HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

/// (dossier des chapitres, page produite dans ce dossier, titre de la page)
pub const LIVRES: [(&str, &str, &str); 2] =
    [("manuel", "manuel.html", "Manuel WEB_CAO"), ("regles", "regles.html", "Règles de conception WEB_CAO")];
const DEPOT_WEB: &str = "https://github.com/pilou33620/WEB_CAO/blob/main/";

const STYLE: &str = include_str!("manuel-style.css");
const SCRIPT: &str = include_str!("manuel-script.js");

macro_rules! re {
    ($motif:expr) => {{
        static R: OnceLock<Regex> = OnceLock::new();
        R.get_or_init(|| Regex::new($motif).unwrap())
    }};
}

/// str.isspace() d'un caractère.
fn blanc(c: char) -> bool {
    c.is_whitespace() || ('\x1c'..='\x1f').contains(&c)
}

/// `\w` de Python.
fn mot(c: char) -> bool {
    re!(r"[\p{L}\p{N}_]").is_match(c.encode_utf8(&mut [0; 4]))
}

fn strip(t: &str) -> &str {
    t.trim_matches(blanc)
}

fn lstrip(t: &str) -> &str {
    t.trim_start_matches(blanc)
}

/// len(l) - len(l.lstrip()), en caractères.
fn indentation(l: &str) -> usize {
    l.chars().take_while(|c| blanc(*c)).count()
}

/// str.splitlines()
fn splitlines(t: &str) -> Vec<&str> {
    let mut out = Vec::new();
    let mut debut = 0;
    let mut it = t.char_indices().peekable();
    while let Some((i, c)) = it.next() {
        if matches!(c, '\n' | '\r' | '\x0b' | '\x0c' | '\x1c' | '\x1d' | '\x1e' | '\u{85}' | '\u{2028}' | '\u{2029}') {
            out.push(&t[debut..i]);
            debut = i + c.len_utf8();
            if c == '\r' && matches!(it.peek(), Some((_, '\n'))) {
                it.next();
                debut += 1;
            }
        }
    }
    if debut < t.len() {
        out.push(&t[debut..]);
    }
    out
}

/// html.escape(s, quote)
fn escape(s: &str, quote: bool) -> String {
    let s = s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;");
    if quote {
        s.replace('"', "&quot;").replace('\'', "&#x27;")
    } else {
        s
    }
}

fn slug(texte: &str) -> String {
    let t = re!(r"<[^>]+>").replace_all(texte, "").to_lowercase();
    let t = re!(r"[`*_]").replace_all(&t, "");
    let t = re!(r"[^\p{L}\p{N}_\s\x1c-\x1f-]").replace_all(&t, "");
    let t = re!(r"[\s\x1c-\x1f_]+").replace_all(strip(&t), "-");
    if t.is_empty() {
        "section".into()
    } else {
        t.into_owned()
    }
}

/// `(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])` -> `<i>\1</i>` : la caisse regex n'a pas les
/// regards en arrière, le motif est déroulé à la main.
fn italique(s: &str) -> String {
    let c: Vec<char> = s.chars().collect();
    let colle = |ch: char| mot(ch) || ch == '*';
    let mut out = String::with_capacity(s.len());
    let mut i = 0;
    while i < c.len() {
        if c[i] == '*' && (i == 0 || !colle(c[i - 1])) && i + 1 < c.len() && !blanc(c[i + 1]) {
            let mut j = i + 2;
            let mut fin = None;
            while j < c.len() && c[j - 1] != '\n' {
                if c[j] == '*' && !blanc(c[j - 1]) && (j + 1 == c.len() || !colle(c[j + 1])) {
                    fin = Some(j);
                    break;
                }
                j += 1;
            }
            if let Some(j) = fin {
                out.push_str("<i>");
                out.extend(&c[i + 1..j]);
                out.push_str("</i>");
                i = j + 1;
                continue;
            }
        }
        out.push(c[i]);
        i += 1;
    }
    out
}

/// Un lien vers un autre chapitre, à contrôler une fois tous les chapitres lus.
struct LienChapitre {
    de: String,
    vers: String,
    frag: String,
    brut: String,
}

struct Convertisseur<'a> {
    racine: &'a Path,
    src: &'a Path,
    stem: &'a str,
    chapitres: &'a mut Vec<LienChapitre>,
    erreurs: &'a mut Vec<String>,
    ancres: HashSet<String>,
    titres: Vec<(usize, String, String)>, // (niveau, id, texte)
}

impl Convertisseur<'_> {
    // ---- en ligne ----
    fn lien(&mut self, texte: &str, cible: &str) -> String {
        let cible = strip(cible);
        if re!(r"^(?:[a-z]+://|mailto:)").is_match(cible) {
            return format!(r#"<a href="{cible}" target="_blank" rel="noopener">{texte}</a>"#);
        }
        let (chemin, frag) = cible.split_once('#').unwrap_or((cible, ""));
        if chemin.is_empty() {
            return format!(r##"<a href="#{}--{frag}">{texte}</a>"##, self.stem);
        }
        let cible_abs = normpath(&self.src.join(chemin));
        if chemin.ends_with(".md") && cible_abs.parent() == Some(self.src) {
            let base = chemin.rsplit('/').next().unwrap();
            let autre = &base[..base.len() - 3];
            self.chapitres.push(LienChapitre {
                de: self.stem.into(),
                vers: autre.into(),
                frag: frag.into(),
                brut: cible.into(),
            });
            let ancre = if frag.is_empty() { String::new() } else { format!("--{frag}") };
            return format!(r##"<a href="#{autre}{ancre}">{texte}</a>"##);
        }
        if !cible_abs.exists() {
            self.erreurs.push(format!("{} : fichier introuvable : {cible}", self.stem));
        } else if chemin.ends_with(".html") {
            // une autre page servie (le manuel depuis les règles)
            return format!(r#"<a href="{}" target="_blank" rel="noopener">{texte}</a>"#, escape(cible, true));
        }
        // Un fichier du dépôt : web_CAO.py ne sert que manuel.html de ce dossier (liste
        // blanche), le lien relatif tombait en 404. On renvoie à sa page sur GitHub, et
        // data-local garde le chemin relatif que le script reprend en double-clic (file://).
        let rel: Vec<String> =
            relpath(&cible_abs, self.racine).components().map(|c| c.as_os_str().to_string_lossy().into_owned()).collect();
        let diese = if frag.is_empty() { String::new() } else { format!("#{frag}") };
        let url = format!("{DEPOT_WEB}{}{diese}", rel.join("/"));
        format!(
            r#"<a href="{}" data-local="{}" target="_blank" rel="noopener">{texte}</a>"#,
            escape(&url, true),
            escape(cible, true)
        )
    }

    fn en_ligne(&mut self, s: &str) -> String {
        let mut codes: Vec<String> = Vec::new();
        let s = re!(r"`([^`]+)`").replace_all(s, |m: &Captures| {
            codes.push(format!("<code>{}</code>", escape(&m[1], true)));
            format!("\x00{}\x00", codes.len() - 1)
        });
        let s = escape(&s, false);
        let s = re!(r"\[([^\]]+)\]\(([^)\s\x1c-\x1f]+)\)").replace_all(&s, |m: &Captures| self.lien(&m[1], &m[2]));
        let s = re!(r"\*\*(.+?)\*\*").replace_all(&s, "<b>${1}</b>");
        let s = italique(&s);
        re!(r"\x00(\d+)\x00").replace_all(&s, |m: &Captures| codes[m[1].parse::<usize>().unwrap()].clone()).into_owned()
    }

    // ---- blocs ----
    fn convertir(&mut self, texte: &str) -> String {
        let puce = re!(r"^[\s\x1c-\x1f]*(?:[-*]|\d+\.) ");
        let lignes = splitlines(texte);
        let n = lignes.len();
        let (mut sortie, mut i) = (Vec::new(), 0);
        while i < n {
            let l = lignes[i];
            if strip(l).is_empty() {
                i += 1;
            } else if l.starts_with("```") {
                let mut j = i + 1;
                while j < n && !lignes[j].starts_with("```") {
                    j += 1;
                }
                let code = if i + 1 < j { lignes[i + 1..j].join("\n") } else { String::new() };
                sortie.push(format!("<pre><code>{}</code></pre>", escape(&code, true)));
                i = j + 1;
            } else if re!(r"^#{1,4} ").is_match(l) {
                let niv = l.len() - l.trim_start_matches('#').len();
                let brut = strip(&l[niv..]);
                let mut id = format!("{}--{}", self.stem, slug(brut));
                while self.ancres.contains(&id) {
                    id.push_str("-2");
                }
                self.ancres.insert(id.clone());
                let corps = self.en_ligne(brut);
                self.titres.push((niv, id.clone(), re!(r"<[^>]+>").replace_all(&corps, "").into_owned()));
                sortie.push(format!(r#"<h{niv} id="{id}">{corps}</h{niv}>"#));
                i += 1;
            } else if re!(r"^-{3,}[\s\x1c-\x1f]*$").is_match(l) {
                sortie.push("<hr>".into());
                i += 1;
            } else if lstrip(l).starts_with('>') {
                let mut j = i;
                while j < n && lstrip(lignes[j]).starts_with('>') {
                    j += 1;
                }
                let mut bloc: Vec<String> =
                    lignes[i..j].iter().map(|x| re!(r"^[\s\x1c-\x1f]*> ?").replace(x, "").into_owned()).collect();
                let mut classe = String::new();
                if let Some(m) = re!(r"^\[!([\p{L}\p{N}_]+)\][\s\x1c-\x1f]*$").captures(&bloc[0]) {
                    classe = format!(r#" class="{}""#, m[1].to_lowercase());
                    bloc.remove(0);
                }
                let dedans = self.convertir(&bloc.join("\n"));
                sortie.push(format!("<blockquote{classe}>{dedans}</blockquote>"));
                i = j;
            } else if lstrip(l).starts_with('|')
                && i + 1 < n
                && re!(r"^[\s\x1c-\x1f]*\|[\s\x1c-\x1f:|-]+\|[\s\x1c-\x1f]*$").is_match(lignes[i + 1])
            {
                let mut j = i + 2;
                while j < n && lstrip(lignes[j]).starts_with('|') {
                    j += 1;
                }
                let cases = |x: &str| -> Vec<String> {
                    re!(r"^[\s\x1c-\x1f]*\||\|[\s\x1c-\x1f]*$").replace_all(x, "").split('|').map(|c| strip(c).to_string()).collect()
                };
                let tete: String = cases(l).iter().map(|c| format!("<th>{}</th>", self.en_ligne(c))).collect();
                let mut corps = String::new();
                for x in &lignes[i + 2..j] {
                    let rang: String = cases(x).iter().map(|c| format!("<td>{}</td>", self.en_ligne(c))).collect();
                    corps.push_str(&format!("<tr>{rang}</tr>"));
                }
                sortie.push(format!(
                    r#"<div class="tab"><table><thead><tr>{tete}</tr></thead><tbody>{corps}</tbody></table></div>"#
                ));
                i = j;
            } else if puce.is_match(l) {
                let mut j = i;
                while j < n && (puce.is_match(lignes[j]) || (lignes[j].starts_with("  ") && !strip(lignes[j]).is_empty())) {
                    j += 1;
                }
                sortie.push(self.liste(&lignes[i..j]));
                i = j;
            } else {
                let debut_bloc = re!(r"^(?:#{1,4} |```|[\s\x1c-\x1f]*>|[\s\x1c-\x1f]*\||[\s\x1c-\x1f]*(?:[-*]|\d+\.) )");
                let mut j = i;
                while j < n && !strip(lignes[j]).is_empty() && !debut_bloc.is_match(lignes[j]) {
                    j += 1;
                }
                if j == i {
                    // ligne qui ressemble à un début de bloc sans en être un
                    j = i + 1;
                }
                let para: Vec<&str> = lignes[i..j].iter().map(|x| strip(x)).collect();
                sortie.push(format!("<p>{}</p>", self.en_ligne(&para.join(" "))));
                i = j;
            }
        }
        sortie.join("\n")
    }

    fn liste(&mut self, lignes: &[&str]) -> String {
        let puce = re!(r"^[\s\x1c-\x1f]*(?:[-*]|\d+\.) ");
        let base = indentation(lignes[0]);
        let ordonnee = re!(r"^[\s\x1c-\x1f]*\d+\.").is_match(lignes[0]);
        let mut items: Vec<Vec<&str>> = Vec::new();
        for l in lignes {
            let m = re!(r"^[\s\x1c-\x1f]*(?:[-*]|\d+\.) (.*)").captures(l);
            match m {
                Some(m) if indentation(l) <= base => items.push(vec![m.get(1).unwrap().as_str()]),
                _ => {
                    if let Some(dernier) = items.last_mut() {
                        dernier.push(l);
                    }
                }
            }
        }
        let mut rendu = String::new();
        for it in &items {
            let (mut propre, mut sous) = (vec![it[0]], Vec::new());
            for l in &it[1..] {
                if puce.is_match(l) || !sous.is_empty() {
                    sous.push(*l);
                } else {
                    propre.push(*l);
                }
            }
            if !sous.is_empty() && !puce.is_match(sous[0]) {
                propre.append(&mut sous);
            }
            let texte: Vec<&str> = propre.iter().map(|x| strip(x)).collect();
            let corps = self.en_ligne(&texte.join(" "));
            let dessous = if sous.is_empty() { String::new() } else { self.liste(&sous) };
            rendu.push_str(&format!("<li>{corps}{dessous}</li>"));
        }
        let t = if ordonnee { "ol" } else { "ul" };
        format!("<{t}>{rendu}</{t}>")
    }
}

/// re.split(r"(?m)^(?=#{1,2} )", texte) : une section par titre de niveau 1 ou 2
fn morceaux(texte: &str) -> Vec<&str> {
    let mut out = Vec::new();
    let mut debut = 0;
    let mut ligne = 0;
    loop {
        let reste = &texte[ligne..];
        if reste.starts_with("# ") || reste.starts_with("## ") {
            out.push(&texte[debut..ligne]);
            debut = ligne;
        }
        match reste.find('\n') {
            Some(p) => ligne += p + 1,
            None => break,
        }
    }
    out.push(&texte[debut..]);
    out
}

/// Un livre : les chapitres de `src` assemblés dans `sortie`. Rend le code de sortie.
pub fn construire(racine: &Path, src: &Path, sortie: &Path, titre: &str) -> i32 {
    let mut fichiers: Vec<String> = match std::fs::read_dir(src) {
        Ok(d) => d.flatten().map(|e| e.file_name().to_string_lossy().into_owned()).filter(|f| f.ends_with(".md")).collect(),
        Err(e) => crate::quitter(&format!("{} : {e}", src.display())),
    };
    fichiers.sort();
    fichiers.sort_by_key(|f| f != "index.md");
    let (mut chapitres, mut erreurs, mut corps, mut nav) = (Vec::new(), Vec::new(), Vec::new(), Vec::new());
    let mut ancres: HashMap<String, HashSet<String>> = HashMap::new();
    for f in &fichiers {
        let stem = &f[..f.len() - 3];
        let texte = lire_texte(&src.join(f)).unwrap_or_else(|e| crate::quitter(&format!("{f} : {e}")));
        let mut cv = Convertisseur {
            racine,
            src,
            stem,
            chapitres: &mut chapitres,
            erreurs: &mut erreurs,
            ancres: HashSet::new(),
            titres: Vec::new(),
        };
        for (k, morceau) in morceaux(&texte).into_iter().filter(|m| !strip(m).is_empty()).enumerate() {
            cv.titres.clear();
            let sec = format!("s-{stem}-{k}");
            // « x.md » sans ancre vise #x : le premier morceau du chapitre porte ce nom
            let debut = if k == 0 { format!(r#"<span id="{stem}"></span>"#) } else { String::new() };
            corps.push(format!(r#"<section id="{sec}">{debut}{}</section>"#, cv.convertir(morceau)));
            for (niv, id, t) in &cv.titres {
                if *niv <= 2 {
                    let classe = if *niv == 1 { "c" } else { "s" };
                    nav.push(format!(r##"<a class="{classe}" href="#{id}" data-s="{sec}">{t}</a>"##));
                }
            }
        }
        ancres.insert(stem.to_string(), cv.ancres);
    }
    let html_corps = corps.join("\n");
    for l in &chapitres {
        match ancres.get(&l.vers) {
            None => erreurs.push(format!("{} : chapitre introuvable : {}", l.de, l.brut)),
            Some(a) if !l.frag.is_empty() && !a.contains(&format!("{}--{}", l.vers, l.frag)) => {
                erreurs.push(format!("{} : ancre introuvable : {}", l.de, l.brut))
            }
            _ => {}
        }
    }
    if !erreurs.is_empty() {
        println!("{titre} : {} lien(s) cassé(s) :", erreurs.len());
        let uniques: BTreeSet<&String> = erreurs.iter().collect();
        println!("{}", uniques.iter().map(|e| format!("  {e}")).collect::<Vec<_>>().join("\n"));
        return 1;
    }
    let page = format!(
        concat!(
            r#"<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">"#,
            r#"<meta name="viewport" content="width=device-width,initial-scale=1">"#,
            r#"<title>{}</title><style>{}</style></head><body>"#,
            r#"<nav><a class="acc" href="../../index.html">← Accueil WEB_CAO</a>"#,
            r#"<input id="q" type="search" placeholder="Rechercher dans la page…" autocomplete="off">{}</nav>"#,
            r#"<main>{}<p id="vide">Aucun passage ne contient tous ces mots.</p></main><script>{}</script></body></html>"#
        ),
        escape(titre, true),
        STYLE,
        nav.join("\n"),
        html_corps,
        SCRIPT
    );
    if let Err(e) = std::fs::write(sortie, page) {
        crate::quitter(&format!("{} : {e}", sortie.display()));
    }
    println!("{} chapitre(s), {} section(s) -> {}", fichiers.len(), corps.len(), relpath(sortie, racine).display());
    0
}

/// Les deux livres ; le code de sortie est le pire des deux.
pub fn main(racine: &Path) -> i32 {
    let racine: PathBuf = normpath(racine);
    let mut code = 0;
    for (dossier, page, titre) in LIVRES {
        let src = racine.join("docs").join(dossier);
        code = code.max(construire(&racine, &src, &src.join(page), titre));
    }
    code
}
