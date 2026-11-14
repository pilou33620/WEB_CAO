//!     fonte-plans [Regular.ttf Bold.ttf]   -> editeur-pcb/js/fontes/plans-sans.js
//!
//! La fonte que les plans (29-draftsman.js) embarquent dans leur PDF, PRÉ-RÉDUITE
//! ici, une fois pour toutes, à ce qu'un plan écrit : ASCII, Latin-1 et Latin
//! étendu A (accents d'Europe), ponctuation WinAnsi, grec (Ω, µ, Δ, εr…) et les
//! symboles d'un technicien (± ° ≤ ≥ ≈ ≠ ∞ √ → ‰ …). Le PDF, lui, n'emporte que
//! les glyphes qu'il emploie : 33-draftsman-export.js resserre encore ce
//! sous-ensemble à la volée.
//!
//! La source est Liberation Sans 2.x (SIL Open Font License 1.1), cherchée par
//! défaut dans /usr/share/fonts/truetype/liberation/. Pourquoi elle et pas DejaVu
//! Sans : ses chasses sont celles d'Arial, donc d'Helvetica, à l'unité près. Les
//! plans centrent les repères et coupent les colonnes avec la table d'Helvetica ;
//! avec DejaVu, plus large d'un dixième, les tableaux déborderaient.
//!
//! Ce que l'outil fait à la fonte, sans caisse externe :
//!   · ne garde que les glyphes des caractères voulus, composants des glyphes
//!     composites compris, renumérotés de 0 (.notdef) à n-1 ;
//!   · retire les instructions de hinting (fpgm, prep, cvt, gasp et le code de
//!     chaque glyphe) et les tables de mise en page (GSUB, GPOS, GDEF, kern) :
//!     un PDF imprimé ou zoomé n'en a pas l'usage, et c'est la moitié du poids ;
//!   · réécrit cmap (format 4), hmtx (une métrique pleine par glyphe), loca
//!     (format long), maxp, hhea, head, post (format 3, sans noms de glyphes) ;
//!   · RENOMME la fonte « PlansSans » : la licence OFL interdit qu'une version
//!     modifiée porte les noms réservés « Liberation » et « Arimo ». Le copyright
//!     et la licence restent dans la table name, et OFL-PlansSans.txt les
//!     accompagne dans le dépôt.
//!
//! Le résultat est écrit en base64 dans js/fontes/plans-sans.js, que l'éditeur
//! charge comme ses autres scripts : la fonte est là quand on ouvre la page
//! depuis le disque, sans serveur, et dans le monofichier dist/editeur-pcb.html.

use crate::quitter;
use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::path::Path;

pub const SOURCES: [&str; 2] = [
    "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
];
const NOM: &str = "PlansSans";

/// Les points de code gardés : ce qu'un plan de fabrication écrit.
pub fn jeu_de_caracteres() -> BTreeSet<u32> {
    let mut cs: BTreeSet<u32> = (0x20..0x7F).chain(0xA0..0x180).collect(); // ASCII, Latin-1, Latin étendu A
    cs.extend([0x192, 0x2C6, 0x2C7, 0x2D8, 0x2D9, 0x2DA, 0x2DB, 0x2DC, 0x2DD]);
    cs.extend(0x391..0x3CA); // grec
    cs.extend([
        0x2009, 0x202F, 0x2013, 0x2014, 0x2018, 0x2019, 0x201A, 0x201C, 0x201D, 0x201E, 0x2020, 0x2021, 0x2022, 0x2026,
        0x2030, 0x2032, 0x2033, 0x2039, 0x203A, 0x20AC, 0x2116, 0x2122, 0x2126,
    ]);
    cs.extend(0x2190..0x2196); // flèches
    cs.extend([
        0x2202, 0x2206, 0x220F, 0x2211, 0x2212, 0x2215, 0x2219, 0x221A, 0x221E, 0x222B, 0x2248, 0x2260, 0x2261, 0x2264,
        0x2265, 0x25A0, 0x25A1, 0x25CB, 0x25CF,
    ]);
    cs
}

// struct.unpack(">H"), (">h"), (">I") et leurs pack_into
fn u16_(b: &[u8], p: usize) -> u16 {
    u16::from_be_bytes([b[p], b[p + 1]])
}
fn i16_(b: &[u8], p: usize) -> i16 {
    u16_(b, p) as i16
}
fn u32_(b: &[u8], p: usize) -> u32 {
    u32::from_be_bytes([b[p], b[p + 1], b[p + 2], b[p + 3]])
}
fn pose16(b: &mut [u8], p: usize, v: u16) {
    b[p..p + 2].copy_from_slice(&v.to_be_bytes());
}
fn pose32(b: &mut [u8], p: usize, v: u32) {
    b[p..p + 4].copy_from_slice(&v.to_be_bytes());
}
fn h(out: &mut Vec<u8>, v: u16) {
    out.extend(v.to_be_bytes());
}
fn i(out: &mut Vec<u8>, v: u32) {
    out.extend(v.to_be_bytes());
}

// ---------------------------------------------------------------------------
//  Lecture
// ---------------------------------------------------------------------------
fn tables(data: &[u8]) -> BTreeMap<String, &[u8]> {
    let n = u16_(data, 4) as usize;
    let mut t = BTreeMap::new();
    for k in 0..n {
        let e = 12 + 16 * k;
        let (off, ln) = (u32_(data, e + 8) as usize, u32_(data, e + 12) as usize);
        let tag: String = data[e..e + 4].iter().map(|o| *o as char).collect();
        t.insert(tag, &data[off.min(data.len())..(off + ln).min(data.len())]);
    }
    t
}

/// Unicode -> glyphe, depuis la sous-table (3,10) format 12 ou (3,1) format 4.
fn lire_cmap(cmap: &[u8]) -> HashMap<u32, u32> {
    let n = u16_(cmap, 2) as usize;
    let mut subs = HashMap::new();
    for k in 0..n {
        subs.insert((u16_(cmap, 4 + 8 * k), u16_(cmap, 6 + 8 * k)), u32_(cmap, 8 + 8 * k) as usize);
    }
    let mut out = HashMap::new();
    if let Some(&o) = subs.get(&(3, 10)) {
        let ng = u32_(cmap, o + 12) as usize;
        for k in 0..ng {
            let p = o + 16 + 12 * k;
            let (a, b, g) = (u32_(cmap, p), u32_(cmap, p + 4), u32_(cmap, p + 8));
            for c in a..=b {
                out.insert(c, g + c - a);
            }
        }
        return out;
    }
    let Some(&o) = subs.get(&(3, 1)).or(subs.get(&(0, 3))) else { quitter("pas de table cmap Unicode") };
    let segx2 = u16_(cmap, o + 6) as usize;
    let seg = segx2 / 2;
    let ro_pos = o + 16 + 3 * segx2;
    for s in 0..seg {
        let end = u16_(cmap, o + 14 + 2 * s) as u32;
        let start = u16_(cmap, o + 16 + segx2 + 2 * s) as u32;
        let delta = i16_(cmap, o + 16 + 2 * segx2 + 2 * s) as i32;
        let ro = u16_(cmap, ro_pos + 2 * s) as usize;
        for c in start..=end {
            if c == 0xFFFF {
                continue;
            }
            let g = if ro == 0 {
                (c as i32 + delta) as u32 & 0xFFFF
            } else {
                let p = ro_pos + 2 * s + ro + 2 * (c - start) as usize;
                match u16_(cmap, p) as i32 {
                    0 => 0,
                    g => (g + delta) as u32 & 0xFFFF,
                }
            };
            if g != 0 {
                out.insert(c, g);
            }
        }
    }
    out
}

fn glyphes<'a>(t: &BTreeMap<String, &'a [u8]>) -> Vec<&'a [u8]> {
    let (head, maxp, loca, glyf) = (t["head"], t["maxp"], t["loca"], t["glyf"]);
    let ng = u16_(maxp, 4) as usize;
    let longue = i16_(head, 50) == 1;
    let off = |k: usize| if longue { u32_(loca, 4 * k) as usize } else { 2 * u16_(loca, 2 * k) as usize };
    // glyf[a:b] de Python : une tranche hors bornes est vide, pas une erreur
    (0..ng).map(|k| glyf.get(off(k).min(glyf.len())..off(k + 1).min(glyf.len())).unwrap_or(&[])).collect()
}

fn metriques(t: &BTreeMap<String, &[u8]>, ng: usize) -> Vec<(u16, i16)> {
    let nh = u16_(t["hhea"], 34) as usize;
    let hm = t["hmtx"];
    (0..ng)
        .map(|k| {
            if k < nh {
                (u16_(hm, 4 * k), i16_(hm, 4 * k + 2))
            } else {
                (u16_(hm, 4 * (nh - 1)), i16_(hm, 4 * nh + 2 * (k - nh)))
            }
        })
        .collect()
}

// Drapeaux des composants d'un glyphe composite
const ARG_WORDS: u16 = 0x1;
const HAS_SCALE: u16 = 0x8;
const MORE: u16 = 0x20;
const XY_SCALE: u16 = 0x40;
const TWO_BY_TWO: u16 = 0x80;
const INSTR: u16 = 0x100;

/// La place que prend un composant après ses drapeaux et son index.
fn suite_composant(fl: u16) -> usize {
    (if fl & ARG_WORDS != 0 { 4 } else { 2 })
        + if fl & HAS_SCALE != 0 {
            2
        } else if fl & XY_SCALE != 0 {
            4
        } else if fl & TWO_BY_TWO != 0 {
            8
        } else {
            0
        }
}

/// Les glyphes qu'un composite appelle, avec la position de leur index.
fn composants(g: &[u8]) -> Vec<(usize, u16, u16)> {
    let mut out = Vec::new();
    if g.len() < 10 || i16_(g, 0) >= 0 {
        return out;
    }
    let mut p = 10;
    loop {
        let (fl, gi) = (u16_(g, p), u16_(g, p + 2));
        out.push((p + 2, gi, fl));
        p += 4 + suite_composant(fl);
        if fl & MORE == 0 {
            return out;
        }
    }
}

/// Longueur exacte des drapeaux et coordonnées d'un glyphe simple : sans
/// elle, le bourrage de la fonte d'origine s'ajouterait au nôtre.
fn longueur_points(g: &[u8], nc: usize, p: usize) -> usize {
    if nc == 0 {
        return 0;
    }
    let npts = u16_(g, 10 + 2 * (nc - 1)) as usize + 1;
    let (mut q, mut vus, mut lx, mut ly) = (p, 0, 0, 0);
    while vus < npts {
        let f = g[q];
        q += 1;
        let mut n = 1;
        if f & 8 != 0 {
            // répété
            n += g[q] as usize;
            q += 1;
        }
        vus += n;
        lx += n * if f & 2 != 0 { 1 } else if f & 16 != 0 { 0 } else { 2 };
        ly += n * if f & 4 != 0 { 1 } else if f & 32 != 0 { 0 } else { 2 };
    }
    q - p + lx + ly
}

/// Le glyphe sans son code de hinting, composants renumérotés.
fn sans_instructions(g: &[u8], remap: &HashMap<u32, u16>) -> Vec<u8> {
    if g.is_empty() {
        return Vec::new();
    }
    let nc = i16_(g, 0);
    if nc >= 0 {
        let nc = nc as usize;
        let p = 10 + 2 * nc;
        let il = u16_(g, p) as usize;
        let debut = p + 2 + il;
        let fin = (debut + longueur_points(g, nc, debut)).min(g.len());
        let mut b = g[..p].to_vec();
        b.extend([0, 0]);
        b.extend(&g[debut..fin]);
        return b;
    }
    let mut b = g.to_vec();
    let comps = composants(g);
    for &(pos, gi, _) in &comps {
        pose16(&mut b, pos, remap[&(gi as u32)]);
    }
    let &(pos, _, fl) = comps.last().unwrap();
    let fin = pos - 2 + 4 + suite_composant(fl);
    if fl & INSTR != 0 {
        pose16(&mut b, pos - 2, fl & !INSTR);
    }
    b.truncate(fin);
    b
}

// ---------------------------------------------------------------------------
//  Écriture
// ---------------------------------------------------------------------------
/// cmap avec une seule sous-table (3,1) format 4 : un segment par suite de
/// points de code consécutifs, delta quand les glyphes suivent aussi.
fn cmap4(carte: &BTreeMap<u32, u16>) -> Vec<u8> {
    let mut segs: Vec<[u32; 2]> = Vec::new();
    for (&c, &g) in carte {
        match segs.last_mut() {
            Some(s) if c == s[1] + 1 && g == carte[&s[1]] + 1 => s[1] = c,
            _ => segs.push([c, c]),
        }
    }
    segs.push([0xFFFF, 0xFFFF]);
    let n = segs.len();
    let mut e = 1;
    while e * 2 <= n {
        e *= 2;
    }
    let sr = 2 * e;
    let mut corps = Vec::new();
    for v in [2 * n, sr, e.trailing_zeros() as usize, 2 * n - sr] {
        h(&mut corps, v as u16);
    }
    segs.iter().for_each(|s| h(&mut corps, s[1] as u16));
    h(&mut corps, 0);
    segs.iter().for_each(|s| h(&mut corps, s[0] as u16));
    for s in &segs {
        h(&mut corps, if s[0] != 0xFFFF { (carte[&s[0]] as u32).wrapping_sub(s[0]) as u16 } else { 1 });
    }
    corps.extend(vec![0; 2 * n]);
    let mut out = Vec::new();
    for v in [0, 1, 3, 1] {
        h(&mut out, v);
    }
    i(&mut out, 12);
    for v in [4, 6 + corps.len() as u16, 0] {
        h(&mut out, v);
    }
    out.extend(corps);
    out
}

/// Les noms : la fonte s'appelle PlansSans (nom réservé oblige), le
/// copyright, la version et la licence de l'original restent.
fn table_name(ancienne: &[u8], style: &str) -> Vec<u8> {
    let n = u16_(ancienne, 2) as usize;
    let so = u16_(ancienne, 4) as usize;
    let mut garde: BTreeMap<u16, String> = BTreeMap::new();
    for k in 0..n {
        let e = 6 + 12 * k;
        let (pid, eid, lid, nid) = (u16_(ancienne, e), u16_(ancienne, e + 2), u16_(ancienne, e + 4), u16_(ancienne, e + 6));
        let (ln, off) = (u16_(ancienne, e + 8) as usize, u16_(ancienne, e + 10) as usize);
        if pid == 3 && eid == 1 && lid == 0x409 && [0, 5, 13, 14].contains(&nid) {
            let unites: Vec<u16> = (0..ln / 2).map(|j| u16_(ancienne, so + off + 2 * j)).collect();
            garde.insert(nid, String::from_utf16(&unites).unwrap_or_else(|e| quitter(&format!("table name : {e}"))));
        }
    }
    garde.entry(0).or_default().push_str(&format!(" Sous-ensemble renommé {NOM} pour WEB_CAO (OFL 1.1, nom réservé)."));
    garde.insert(1, NOM.into());
    garde.insert(2, style.into());
    garde.insert(3, format!("{NOM}-{style} WEB_CAO"));
    garde.insert(4, format!("{NOM} {style}"));
    garde.insert(6, format!("{NOM}-{style}"));
    let (mut enr, mut donnees) = (Vec::new(), Vec::new());
    for (nid, texte) in &garde {
        let b: Vec<u8> = texte.encode_utf16().flat_map(u16::to_be_bytes).collect();
        for v in [3, 1, 0x409, *nid, b.len() as u16, donnees.len() as u16] {
            h(&mut enr, v);
        }
        donnees.extend(b);
    }
    let mut out = Vec::new();
    for v in [0, garde.len() as u16, 6 + 12 * garde.len() as u16] {
        h(&mut out, v);
    }
    out.extend(enr);
    out.extend(donnees);
    out
}

fn somme(b: &[u8]) -> u32 {
    b.chunks(4).fold(0u32, |s, c| {
        let mut mot = [0; 4];
        mot[..c.len()].copy_from_slice(c);
        s.wrapping_add(u32::from_be_bytes(mot))
    })
}

fn assembler(tabs: &BTreeMap<&str, Vec<u8>>) -> Vec<u8> {
    let n = tabs.len();
    let mut e = 1;
    while e * 2 <= n {
        e *= 2;
    }
    let mut fonte = Vec::new();
    i(&mut fonte, 0x00010000);
    for v in [n, 16 * e, e.trailing_zeros() as usize, 16 * n - 16 * e] {
        h(&mut fonte, v as u16);
    }
    let off = 12 + 16 * n;
    let mut corps = Vec::new();
    for (tg, d) in tabs {
        fonte.extend(tg.bytes());
        for v in [somme(d), (off + corps.len()) as u32, d.len() as u32] {
            i(&mut fonte, v);
        }
        corps.extend(d);
        corps.resize(corps.len().next_multiple_of(4), 0);
    }
    fonte.extend(corps);
    // checkSumAdjustment de head : 0xB1B0AFBA moins la somme de tout le fichier
    let p = 12 + 16 * tabs.keys().position(|t| *t == "head").unwrap();
    let ho = u32_(&fonte, p + 8) as usize;
    let ajustement = 0xB1B0AFBAu32.wrapping_sub(somme(&fonte));
    pose32(&mut fonte, ho + 8, ajustement);
    fonte
}

/// (la fonte réduite, la taille de l'original, le nombre de glyphes, de caractères)
pub fn reduire(chemin: &str, style: &str) -> (Vec<u8>, usize, usize, usize) {
    let data = std::fs::read(chemin).unwrap_or_else(|e| quitter(&format!("{chemin} : {e}")));
    if data.len() < 4 || (data[..4] != [0, 1, 0, 0] && &data[..4] != b"true") {
        quitter(&format!("{chemin} : pas une fonte TrueType (glyf)"));
    }
    let t = tables(&data);
    for tag in ["cmap", "head", "maxp", "loca", "glyf", "hhea", "hmtx", "OS/2", "name", "post"] {
        if !t.contains_key(tag) {
            quitter(&format!("{chemin} : table {tag} absente"));
        }
    }
    let uni = lire_cmap(t["cmap"]);
    let gl = glyphes(&t);
    let mt = metriques(&t, gl.len());
    let carte: BTreeMap<u32, u32> = jeu_de_caracteres().into_iter().filter_map(|c| Some((c, *uni.get(&c)?))).collect();
    let mut garde: BTreeSet<u32> = carte.values().copied().chain([0]).collect();
    let mut pile: Vec<u32> = garde.iter().copied().collect();
    while let Some(g) = pile.pop() {
        // composants des composites
        for (_, gi, _) in composants(gl[g as usize]) {
            if garde.insert(gi as u32) {
                pile.push(gi as u32);
            }
        }
    }
    let remap: HashMap<u32, u16> = garde.iter().enumerate().map(|(k, g)| (*g, k as u16)).collect();

    let (mut glyf, mut loca, mut hmtx) = (Vec::new(), Vec::new(), Vec::new());
    i(&mut loca, 0);
    for &g in &garde {
        glyf.extend(sans_instructions(gl[g as usize], &remap));
        glyf.resize(glyf.len().next_multiple_of(4), 0);
        i(&mut loca, glyf.len() as u32);
        h(&mut hmtx, mt[g as usize].0);
        h(&mut hmtx, mt[g as usize].1 as u16);
    }
    let n = garde.len();

    let mut head = t["head"].to_vec();
    pose32(&mut head, 8, 0);
    pose16(&mut head, 50, 1); // loca longue
    let mut hhea = t["hhea"].to_vec();
    pose16(&mut hhea, 34, n as u16);
    let mut maxp = t["maxp"].to_vec();
    pose16(&mut maxp, 4, n as u16);
    if maxp.len() >= 32 {
        // plus de hinting : rien à réserver
        for off in [14, 16, 18, 20, 22, 24, 26] {
            // zones gardées à 2 (14), le reste à 0
            pose16(&mut maxp, off, if off == 14 { 2 } else { 0 });
        }
    }
    let mut post = t["post"][..t["post"].len().min(32)].to_vec();
    pose32(&mut post, 0, 0x00030000);

    let tabs: BTreeMap<&str, Vec<u8>> = BTreeMap::from([
        ("head", head),
        ("hhea", hhea),
        ("maxp", maxp),
        ("OS/2", t["OS/2"].to_vec()),
        ("hmtx", hmtx),
        ("cmap", cmap4(&carte.iter().map(|(c, g)| (*c, remap[g])).collect())),
        ("loca", loca),
        ("glyf", glyf),
        ("name", table_name(t["name"], style)),
        ("post", post),
    ]);
    (assembler(&tabs), data.len(), n, carte.len())
}

/// base64.b64encode
fn base64(octets: &[u8]) -> String {
    const ALPHABET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(octets.len() / 3 * 4 + 4);
    for c in octets.chunks(3) {
        let v = (c[0] as u32) << 16 | (*c.get(1).unwrap_or(&0) as u32) << 8 | *c.get(2).unwrap_or(&0) as u32;
        for k in 0..4 {
            out.push(if k <= c.len() { ALPHABET[(v >> (18 - 6 * k) & 63) as usize] as char } else { '=' });
        }
    }
    out
}

/// `args` : les arguments de la ligne de commande, sans le nom du programme.
/// `root` : le dossier de l'éditeur PCB.
pub fn main(root: &Path, args: &[String]) {
    let dest = root.join("js").join("fontes").join("plans-sans.js");
    let src: Vec<&str> = if args.len() >= 2 { args[..2].iter().map(String::as_str).collect() } else { SOURCES.to_vec() };
    let (mut blocs, mut notes) = (Vec::new(), Vec::new());
    for (chemin, (style, cle)) in src.iter().zip([("Regular", "normal"), ("Bold", "gras")]) {
        if !Path::new(chemin).exists() {
            quitter(&format!("fonte introuvable : {chemin} (paquet fonts-liberation2, ou donner les deux chemins)"));
        }
        let (ttf, avant, ng, nc) = reduire(chemin, style);
        let b64 = base64(&ttf);
        let lignes: Vec<String> = b64.as_bytes().chunks(100).map(|l| format!("\"{}\"", std::str::from_utf8(l).unwrap())).collect();
        blocs.push(format!("  {cle}:[\n{}].join(\"\")", lignes.join(",\n")));
        let base = Path::new(chemin).file_name().map(|f| f.to_string_lossy().into_owned()).unwrap_or_default();
        notes.push(format!("{base} : {ng} glyphes pour {nc} caractères, {} octets (original {avant})", ttf.len()));
    }
    let entete = [
        "\"use strict\";\n",
        "/* ==========================================================================\n",
        "   PlansSans — fonte des plans PDF (29-draftsman.js, 33-draftsman-export.js)\n",
        "   --------------------------------------------------------------------------\n",
        "   FICHIER GÉNÉRÉ par fonte-plans (rust/outils) : ne pas modifier à la main.\n",
        "   Sous-ensemble de Liberation Sans 2.x (Regular et Bold), renommé comme\n",
        "   l'exige la licence SIL Open Font License 1.1 (noms réservés « Liberation »\n",
        "   et « Arimo ») ; texte de la licence dans js/fontes/OFL-PlansSans.txt.\n",
        "     Digitized data copyright (c) 2010 Google Corporation\n",
        "     Copyright (c) 2012 Red Hat, Inc.\n",
    ]
    .concat()
        + &notes.iter().map(|n| format!("   {n}\n")).collect::<String>()
        + "   ========================================================================== */\n";
    let texte = format!("{entete}var DF_FONTE_TTF={{\n{}\n}};\n", blocs.join(",\n"));
    if let Err(e) = std::fs::create_dir_all(dest.parent().unwrap()).and_then(|_| std::fs::write(&dest, texte)) {
        quitter(&format!("{} : {e}", dest.display()));
    }
    for n in &notes {
        println!("{n}");
    }
    println!(
        "écrit : {} ({} Ko)",
        crate::relpath(&dest, root).display(),
        std::fs::metadata(&dest).map(|m| m.len()).unwrap_or(0) / 1024
    );
}
