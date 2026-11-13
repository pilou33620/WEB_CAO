//! Banc de comparaison du crosstalk : WEB_CAO, ANSYS SIwave, et la carte mesuree.
//!
//!     banc-crosstalk-mesure
//!     banc-crosstalk-mesure --tr 2.5   # un front en ns
//!
//! A QUOI IL SERT. La carte d'essai (generer-carte.js) porte six couples
//! agresseur / victime. Pour chacun, cet outil :
//!   1. calcule ce que WEB_CAO predit -- par le MEME chemin que le bouton
//!      « Analyser la piste » de l'onglet Crosstalk : le document que la page
//!      envoie (docs-sim/casN.json, produit par exporter-docs-sim.js) passe dans
//!      le moteur crosstalk ;
//!   2. lit les releves (releves.csv) : la mesure a l'oscilloscope, et le
//!      « Crosstalk Scan » de SIwave ;
//!   3. imprime les trois cote a cote, au front REELLEMENT mesure sur la carte.
//!
//! LE FRONT, C'EST LE POINT DELICAT. Les formules du niveau 2 supposent une
//! rampe lineaire de duree t_r (0 -> 100 %). Un oscilloscope rend un temps de
//! montee 10 -> 90 % ; pour une rampe lineaire, t_r = t_10-90 / 0,8. Un front
//! reel n'est pas une rampe : la prevision est donc rendue pour LES DEUX lectures,
//! et l'ecart entre elles est une incertitude, pas une erreur. Le NEXT sature
//! (longement > t_r / 2 de retard) n'en depend pas ; le FEXT lui est inversement
//! proportionnel.
//!
//! CE QUE LES POURCENTAGES VEULENT DIRE. NEXT % = crete de la victime cote
//! source (J{n}2) / amplitude de l'agresseur mesuree sur sa charge (J{n}3).
//! FEXT % = crete de la victime cote charge (J{n}4) / la meme amplitude. Ce sont
//! les grandeurs que rend WEB_CAO, et celles qu'on lit dans SIwave en divisant
//! ses millivolts par l'amplitude de l'echelon saisi.
//!
//! POINT D'ACCROCHE. Le moteur (`crosstalk.analyser` de python/crosstalk.py) n'est pas
//! encore porte : il est recu en parametre (`Analyser`), document JSON -> resultat JSON.
//! Tout le reste du banc est ici.

use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::path::Path;

/// crosstalk.analyser(doc) : le document de la page -> {couples, avertissements, ...}.
pub type Analyser<'a> = &'a dyn Fn(&Value) -> Result<Value, String>;

pub const CAS: [(i64, &str); 6] = [
    (0, "plancher - pistes a 12 mm"),
    (1, "S = W (0,35 mm)"),
    (2, "S = 3W (1,05 mm)"),
    (3, "S = 3W + piste de garde cousue"),
    (4, "S = 3W + fente de 2 mm dans les plans"),
    (5, "S = 3W + fente de 2 mm dans L2 seule (4b)"),
];
pub const FRONTS_NS: [f64; 5] = [0.5, 1.0, 2.5, 5.0, 10.0];
// La presélection geometrique de l'outil s'arrete a 3 x max(W, H) = 1,05 mm.
// Le cas S = 3W tombe pile dessus : il etait ecarte avant crosstalk 4.4.1, qui
// retient l'egalite (et 2 % au-dessus). Le banc garde la fenetre ouverte pour
// voir aussi les voisines plus lointaines (gardes, lignes d'etalonnage).
pub const DISTANCE_MAX: f64 = 3.0;

/// Un releve de releves.csv.
#[derive(Debug, Clone, PartialEq)]
pub struct Releve {
    pub tr: f64,
    pub v_ag: f64,
    pub next: Option<f64>,
    pub fext: Option<f64>,
    pub note: String,
}

fn titre(n: i64) -> &'static str {
    CAS.iter().find(|c| c.0 == n).map_or("?", |c| c.1)
}

/// NEXT, FEXT (fractions) et les avertissements de WEB_CAO, pour le cas n
/// sous un front t_r (s). None si l'outil n'a pas de couple a chiffrer.
pub fn prevoir(docs: &Path, analyser: Analyser, n: i64, t_r: f64) -> Result<(Option<Value>, Vec<String>), String> {
    let chemin = docs.join(format!("cas{n}.json"));
    let texte = std::fs::read_to_string(&chemin).map_err(|e| format!("{} : {e}", chemin.display()))?;
    let mut doc: Value = serde_json::from_str(&texte).map_err(|e| format!("{} : {e}", chemin.display()))?;
    if !doc["reglages"].is_object() {
        doc["reglages"] = json!({});
    }
    doc["reglages"]["t_r"] = json!(t_r);
    doc["reglages"]["distance_max"] = json!(DISTANCE_MAX);
    let res = analyser(&doc)?;
    let victime = format!("XT{n}_V");
    let couple = res["couples"].as_array().into_iter().flatten().find(|c| c["victime"] == victime.as_str());
    let notes: Vec<String> = res["avertissements"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .filter(|a| a.contains("NON CALCUL") || a.contains("garde") || a.contains("IMPÉDANCE COMMUNE") || a.contains("SANS terme"))
        .map(str::to_string)
        .collect();
    // LE TERME DE FENTE (crosstalk 4.5.0 : Ott ; 4.6.0 : retour
    // resolu sur l'image des plans, option B),
    // et le chiffre des lignes seules : c'est leur ecart que le cas 4
    // doit confirmer ou infirmer. (Le couple est rendu entier : next, fext, fente, lignes.)
    Ok((couple.cloned(), notes))
}

/// csv.reader(delimiter=";") d'une ligne.
// shortcut: un champ entre guillemets ne peut pas porter de saut de ligne ; à reprendre si
// une note de releves.csv en demande un.
fn champs(ligne: &str) -> Vec<String> {
    let (mut out, mut champ, mut cite) = (Vec::new(), String::new(), false);
    let mut it = ligne.trim_end_matches(['\r', '\n']).chars().peekable();
    while let Some(c) = it.next() {
        match c {
            '"' if cite && it.peek() == Some(&'"') => {
                champ.push('"');
                it.next();
            }
            '"' if cite || champ.is_empty() => cite = !cite,
            ';' if !cite => out.push(std::mem::take(&mut champ)),
            c => champ.push(c),
        }
    }
    out.push(champ);
    out
}

fn nombre(s: &str) -> Option<f64> {
    s.trim().replace(',', ".").parse().ok()
}

/// {(cas, source): [ligne, ...]} ; source = MESURE ou SIWAVE.
pub fn lire_releves(releves: &Path) -> Result<BTreeMap<(i64, String), Vec<Releve>>, String> {
    let mut out: BTreeMap<(i64, String), Vec<Releve>> = BTreeMap::new();
    let Ok(texte) = crate::lire_texte(releves) else { return Ok(out) };
    let mut lignes = texte.split_inclusive('\n').filter(|l| !l.trim().is_empty() && !l.trim_start().starts_with('#'));
    let Some(entete) = lignes.next().map(champs) else { return Ok(out) };
    for ligne in lignes {
        let valeurs = champs(ligne);
        let champ = |k: &str| entete.iter().position(|e| e == k).and_then(|i| valeurs.get(i)).map(String::as_str);
        let (Some(n), Some(tr), Some(v_ag)) = (
            champ("cas").and_then(|s| s.trim().parse::<i64>().ok()),
            champ("t_10_90_ns").and_then(nombre),
            champ("V_agresseur_mV").and_then(nombre),
        ) else {
            continue;
        };
        let mv = |k: &str| -> Result<Option<f64>, String> {
            match champ(k).unwrap_or("").trim() {
                "" => Ok(None),
                s => nombre(s).map(Some).ok_or(format!("could not convert string to float: '{}'", s.replace(',', "."))),
            }
        };
        out.entry((n, champ("source").unwrap_or("").trim().to_uppercase())).or_default().push(Releve {
            tr: tr * 1e-9,
            v_ag,
            next: mv("V_NEXT_mV")?,
            fext: mv("V_FEXT_mV")?,
            note: champ("note").unwrap_or("").trim().to_string(),
        });
    }
    Ok(out)
}

fn pc(x: Option<f64>) -> String {
    x.map_or("   --  ".into(), |x| format!("{:6.2}%", 100.0 * x))
}

fn db(rapport: f64) -> String {
    if rapport.is_nan() || rapport <= 0.0 {
        "  --  ".into()
    } else {
        format!("{:+5.1} dB", 20.0 * rapport.log10())
    }
}

fn tableau_previsions(docs: &Path, analyser: Analyser, fronts: &[f64]) -> Result<(), String> {
    println!("\nPREVISIONS WEB_CAO (onglet Crosstalk, niveau 2, sans pertes)");
    println!("  rampe lineaire de duree t_r ; NEXT / FEXT en % de l'agresseur\n");
    let mut entete = format!("  cas  {:<38}", "configuration");
    for t in fronts {
        entete += &format!(" | t_r {t:4.1} ns   ");
    }
    println!("{entete}");
    println!("  {}", "-".repeat(entete.chars().count() - 2));
    for (n, titre) in CAS {
        let mut ligne = format!("  {n}    {titre:<38}");
        let (mut notes, mut fente): (Vec<String>, Option<(f64, Value)>) = (Vec::new(), None);
        for &t in fronts {
            let (p, nt) = prevoir(docs, analyser, n, t * 1e-9)?;
            if !nt.is_empty() {
                notes = nt;
            }
            let Some(p) = p else {
                ligne += " |  pas de couple ";
                continue;
            };
            ligne += &format!(" | {:>5} {:>6}", pc(p["next"].as_f64()).trim(), pc(p["fext"].as_f64()).trim());
            // Au front le plus proche de 1 ns, celui de l'estimation d'Ott
            // dans docs/HISTORIQUE_DEVELOPPEMENT.md.
            if p["fente"].as_object().is_some_and(|f| !f.is_empty())
                && fente.as_ref().is_none_or(|f| (t - 1.0).abs() < (f.0 - 1.0).abs())
            {
                fente = Some((t, p));
            }
        }
        println!("{ligne}");
        if let Some((t, p)) = fente {
            // LA PART DE LA FENTE, A PART : le niveau 2 des lignes seules et
            // le terme d'impedance commune (resolu, ou Ott) qui s'y ajoute, avec sa
            // fourchette, au dernier front du tableau.
            let f = &p["fente"];
            println!(
                "         + dont fente du plan (impedance commune, {}) a {t:.1} ns : +{} NEXT / FEXT, fourchette {} a {} ; lignes seules {} / {}",
                if f["modele"] == "B" { "retour resolu" } else { "Ott" },
                pc(f["next"].as_f64()).trim(),
                pc(f["next_fourchette"][0].as_f64()).trim(),
                pc(f["next_fourchette"][1].as_f64()).trim(),
                pc(p["lignes"]["next"].as_f64()).trim(),
                pc(p["lignes"]["fext"].as_f64()).trim()
            );
        }
        for a in notes.iter().take(2) {
            let debut: String = a.chars().take(150).collect();
            println!("         ! {debut}{}", if a.chars().count() > 150 { "..." } else { "" });
        }
    }
    println!("\n  (chaque case : NEXT puis FEXT)");
    Ok(())
}

fn comparaison(docs: &Path, analyser: Analyser, releves: &BTreeMap<(i64, String), Vec<Releve>>) -> Result<usize, String> {
    if releves.is_empty() {
        println!("\nAUCUN RELEVE dans releves.csv : remplissez-le apres la mesure et le Crosstalk Scan de SIwave, puis relancez.");
        return Ok(0);
    }
    println!("\nCOMPARAISON AUX RELEVES");
    println!(
        "  WEB_CAO est recalcule au front de CHAQUE releve, sous les deux lectures du front :\n  t_r = t_10-90 / 0,8 (rampe) et t_r = t_10-90 (borne haute du FEXT)."
    );
    let mut nb = 0;
    for ((n, source), lignes) in releves {
        for r in lignes {
            nb += 1;
            let (p_rampe, _) = prevoir(docs, analyser, *n, r.tr / 0.8)?;
            let (p_brut, _) = prevoir(docs, analyser, *n, r.tr)?;
            println!(
                "\n  cas {n} ({}) -- {source}, t_10-90 = {:.2} ns, agresseur {:.0} mV{}",
                titre(*n),
                r.tr * 1e9,
                r.v_ag,
                if r.note.is_empty() { String::new() } else { format!(" -- {}", r.note) }
            );
            for (cle, nom, v) in [("next", "NEXT", r.next), ("fext", "FEXT", r.fext)] {
                let rel = v.filter(|_| r.v_ag != 0.0).map(|v| v / r.v_ag);
                let (Some(p_rampe), Some(p_brut)) = (&p_rampe, &p_brut) else {
                    println!("    {nom}  releve {}   WEB_CAO : pas de couple chiffre", pc(rel));
                    continue;
                };
                let (a, b) = (p_rampe[cle].as_f64().unwrap_or(f64::NAN), p_brut[cle].as_f64().unwrap_or(f64::NAN));
                let (lo, hi) = (a.min(b), a.max(b));
                let Some(rel) = rel else {
                    println!("    {nom}  releve   --     WEB_CAO {} a {}", pc(Some(lo)), pc(Some(hi)));
                    continue;
                };
                let dans = lo * 0.8 <= rel && rel <= hi * 1.25;
                println!(
                    "    {nom}  releve {}   WEB_CAO {} a {}   ecart {}  {}",
                    pc(Some(rel)),
                    pc(Some(lo)),
                    pc(Some(hi)),
                    db(rel / ((lo + hi) / 2.0)),
                    if dans { "dans la fourchette (+-2 dB)" } else { "HORS" }
                );
            }
        }
    }
    Ok(nb)
}

const USAGE: &str = "usage: banc-crosstalk-mesure [-h] [--tr TR]";

/// `ici` : bancs-mesure/crosstalk ; `args` : la ligne de commande sans le nom du programme.
/// Rend le code de sortie.
pub fn main(ici: &Path, args: &[String], analyser: Analyser) -> i32 {
    let mut fronts: Vec<f64> = Vec::new();
    let mut it = args.iter();
    while let Some(a) = it.next() {
        let valeur = match a.as_str() {
            "-h" | "--help" => {
                println!("{USAGE}\n\nBanc de comparaison du crosstalk : WEB_CAO, ANSYS SIwave, et la carte mesuree.\n\noptions:\n  -h, --help  show this help message and exit\n  --tr TR     front(s) en ns pour le tableau des previsions");
                return 0;
            }
            "--tr" => it.next().map(String::as_str),
            a => a.strip_prefix("--tr="),
        };
        match valeur.and_then(|v| v.trim().parse::<f64>().ok()) {
            Some(t) => fronts.push(t),
            None => {
                eprintln!("{USAGE}\nbanc-crosstalk-mesure: error: argument invalide : {a}");
                return 2;
            }
        }
    }
    let docs = ici.join("docs-sim");
    let manquants: Vec<String> = CAS.iter().filter(|c| !docs.join(format!("cas{}.json", c.0)).exists()).map(|c| c.0.to_string()).collect();
    if !manquants.is_empty() {
        println!("docs-sim/ incomplet (cas {}) : lancez exporter-docs-sim.js", manquants.join(", "));
        return 2;
    }
    println!("{}", "=".repeat(78));
    println!("  BANC CROSSTALK  --  WEB_CAO / SIwave / mesure");
    println!("{}", "=".repeat(78));
    let suite = tableau_previsions(&docs, analyser, if fronts.is_empty() { &FRONTS_NS } else { &fronts })
        .and_then(|_| lire_releves(&ici.join("releves.csv")))
        .and_then(|releves| comparaison(&docs, analyser, &releves));
    match suite {
        Ok(_) => 0,
        Err(e) => {
            eprintln!("{e}");
            1
        }
    }
}
