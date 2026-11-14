//! Module de calcul de la qualité de placement PCB pour WEB_CAO.
//! Le portage en Rust de python/pcb_scoring.py.
//!
//! Métriques calculées :
//! 1. HPWL (Half-Perimeter Wirelength) : estimation de la longueur minimale de cuivre.
//! 2. Détection des 5 composants qui étirent le plus le chevelu (worst contributors).
//! 3. Carte de congestion spatiale (grille 5 mm) et localisation du point chaud (hotspot).
//! 4. Proximité des condensateurs de découplage par rapport aux circuits intégrés.
//! 5. Recommandation d'ordre de placement par niveaux (Tiers 1 à 4).
//!
//! Une erreur (`Err`) porte le message de l'exception que Python levait.

use crate::pattern_recognition::{cherche, est_masse};
use crate::py::{self, elements, flottant, get, get_opt, nom_type, objet, sans_attribut, textes, Json, Objet};
use regex::Regex;
use std::collections::HashMap;
use std::sync::LazyLock;

macro_rules! rx {
    ($nom:ident, $motif:expr) => {
        static $nom: LazyLock<Regex> = LazyLock::new(|| Regex::new($motif).unwrap());
    };
}

rx!(RE_POWER_NET, r"(?i)VCC|VDD|VEE|VBAT|3V3|3\.3V|5V|12V|\bPWR\b|AVCC|DVCC|\+V");
// « 0V » seul, pas le 0V de 10V / 20V : ces rails ne sont pas des masses
// (_RE_GROUND_NET : le même motif que celui des motifs du schéma, `est_masse`)

// Préfixes de repères pour la classification par tiers. Le préfixe doit être
// suivi d'un chiffre (ou finir le repère) : LED1 n'est pas une inductance L,
// TRANS1 n'est pas un transistor T.
// (`regex` n'a pas d'assertion (?=\d|$) : la suite est consommée, ce qui revient au même pour
// un simple « correspond ou non » ; le $ de Python admet un saut de ligne final)
rx!(RE_TIER_ANCHOR, r"(?i)^(?:J|P|CONN|USB|SMA|HEADER|H|MH|TP)(?:\d|\n?\z)");
rx!(RE_TIER_SEMI_FIXED, r"(?i)^(?:U|IC|VR|REG|Q|T)(?:\d|\n?\z)");
rx!(RE_TIER_FLEXIBLE, r"(?i)^(?:Y|X|OSC|K|RLY|L|TRANS)(?:\d|\n?\z)");
rx!(RE_REF_CAPA, r"(?i)^C\d");

fn pas_un_texte(v: &Json) -> String {
    format!("expected string or bytes-like object, got '{}'", nom_type(v))
}

/// fp.get("pads", [])
fn pastilles(fp: &Json) -> Result<&Json, String> {
    static AUCUNE: Json = Json::Liste(Vec::new());
    Ok(get_opt(fp, "pads")?.unwrap_or(&AUCUNE))
}

/// Le net d'une pastille, None s'il est vide : `not net or _RE_GROUND_NET.search(net)`
/// butait sur un net qui n'est pas un texte.
fn net_de(pad: &Json) -> Result<Option<&str>, String> {
    let net = get(pad, "net")?;
    match net {
        _ if !net.vrai() => Ok(None),
        Json::Texte(t) => Ok(Some(t)),
        _ => Err(pas_un_texte(net)),
    }
}

/// float(v.get(cle, défaut))
fn coord(v: &Json, cle: &str, defaut: f64) -> Result<f64, String> {
    get_opt(v, cle)?.map_or(Ok(defaut), flottant)
}

/// fp.get("ref", "") là où une expression régulière le lisait
fn repere(fp: &Json) -> Result<&str, String> {
    match get_opt(fp, "ref")? {
        None => Ok(""),
        Some(Json::Texte(t)) => Ok(t),
        Some(r) => Err(pas_un_texte(r)),
    }
}

/// max() et min() de Python : le premier élément, remplacé par tout suivant strictement plus grand (petit).
fn max(v: &[f64]) -> f64 {
    v.iter().copied().reduce(|m, x| if x > m { x } else { m }).unwrap_or(0.0)
}
fn min(v: &[f64]) -> f64 {
    v.iter().copied().reduce(|m, x| if x < m { x } else { m }).unwrap_or(0.0)
}

/// Calcule le HPWL (Half-Perimeter Wirelength) total et par net.
///
/// Pour chaque net ayant au moins 2 pastilles :
/// HPWL = (X_max - X_min) + (Y_max - Y_min)
pub fn calculer_hpwl(footprints: &[Json]) -> Result<(f64, Objet), String> {
    let mut rang: HashMap<&str, usize> = HashMap::new();
    let mut net_pads: Vec<(&str, Vec<f64>, Vec<f64>)> = Vec::new();

    for fp in footprints {
        for pad in elements(pastilles(fp)?)? {
            let Some(net) = net_de(pad)?.filter(|n| !est_masse(n)) else {
                // On exclut la masse générale du HPWL car elle est généralement
                // absorbée par un plan de cuivre et fausserait la mesure
                continue;
            };
            let x = coord(pad, "x", 0.0)?;
            let y = coord(pad, "y", 0.0)?;
            let i = *rang.entry(net).or_insert_with(|| {
                net_pads.push((net, Vec::new(), Vec::new()));
                net_pads.len() - 1
            });
            net_pads[i].1.push(x);
            net_pads[i].2.push(y);
        }
    }

    let mut total_hpwl = 0.0;
    let mut hpwl_par_net = Objet::new();

    for (net, xs, ys) in &net_pads {
        if xs.len() < 2 {
            continue;
        }
        let dx = max(xs) - min(xs);
        let dy = max(ys) - min(ys);
        let score = dx + dy;
        hpwl_par_net.insert(net.to_string(), score.into());
        total_hpwl += score;
    }

    Ok((py::round(total_hpwl, 2), hpwl_par_net))
}

/// Identifie les composants dont les connexions sont les plus étirées
///
/// Pour chaque composant, calcule la distance moyenne entre sa position
/// et le barycentre de chacun des nets auxquels il est raccordé.
pub fn top_contributeurs_hpwl(footprints: &[Json], n: usize) -> Result<Vec<Json>, String> {
    let mut rang_net: HashMap<&str, usize> = HashMap::new();
    let mut net_pads: Vec<Vec<(&Json, f64, f64)>> = Vec::new();
    // un repère est une clé de dict : il n'est pas forcément un texte, son écriture JSON le distingue
    let mut rang_fp: HashMap<String, usize> = HashMap::new();
    let mut fp_positions: Vec<(&Json, f64, f64)> = Vec::new();

    for fp in footprints {
        let ref_ = get_opt(fp, "ref")?.unwrap_or(&py::VIDE);
        if !ref_.vrai() {
            continue;
        }
        let fx = coord(fp, "x", 0.0)?;
        let fy = coord(fp, "y", 0.0)?;
        if matches!(ref_, Json::Liste(_) | Json::Objet(_)) {
            return Err(format!("unhashable type: '{}'", nom_type(ref_)));
        }
        match rang_fp.get(&py::dumps(ref_)) {
            Some(i) => fp_positions[*i] = (ref_, fx, fy),
            None => {
                rang_fp.insert(py::dumps(ref_), fp_positions.len());
                fp_positions.push((ref_, fx, fy));
            }
        }

        for pad in elements(pastilles(fp)?)? {
            let Some(net) = net_de(pad)?.filter(|n| !est_masse(n)) else { continue };
            let px = coord(pad, "x", fx)?;
            let py_ = coord(pad, "y", fy)?;
            let i = *rang_net.entry(net).or_insert_with(|| {
                net_pads.push(Vec::new());
                net_pads.len() - 1
            });
            net_pads[i].push((ref_, px, py_));
        }
    }

    // Calcul du barycentre de chaque net
    let net_centroids: Vec<Option<(f64, f64)>> = net_pads
        .iter()
        .map(|pads| {
            (pads.len() >= 2).then(|| {
                let avg_x = py::sum(pads.iter().map(|p| p.1)) / pads.len() as f64;
                let avg_y = py::sum(pads.iter().map(|p| p.2)) / pads.len() as f64;
                (avg_x, avg_y)
            })
        })
        .collect();

    // Écart moyen de chaque composant par rapport aux barycentres
    let mut fp_displacements: Vec<(&Json, f64)> = Vec::new();
    for (ref_, fx, fy) in &fp_positions {
        let connected_nets: Vec<(f64, f64)> =
            net_pads.iter().zip(&net_centroids).filter(|(pads, _)| pads.iter().any(|p| p.0 == *ref_)).filter_map(|(_, c)| *c).collect();
        if connected_nets.is_empty() {
            continue;
        }
        let total_d = py::sum(connected_nets.iter().map(|c| py::hypot(fx - c.0, fy - c.1)));
        fp_displacements.push((ref_, total_d / connected_nets.len() as f64));
    }

    // sorted(..., reverse=True) : stable, les égaux gardent leur ordre
    // shortcut: un écart NaN (coordonnée « nan » ou infinie) est rangé en tête ; Python le laissait
    // là où son tri le croisait. À reprendre (tri de Python à l'identique) si un tel document
    // devait être comparé.
    fp_displacements.sort_by(|a, b| b.1.total_cmp(&a.1));
    Ok(fp_displacements
        .into_iter()
        .take(n)
        .map(|(ref_, dist)| objet([("ref", ref_.clone()), ("deplacement_moyen_mm", py::round(dist, 2).into())]))
        .collect())
}

/// int(math.floor((v - origine) / grille)) : le rang de la cellule, gardé en flottant (un
/// entier de Python n'a pas de borne, et c'est en flottant qu'il resservait).
fn cellule(v: f64, origine: f64, grille: f64) -> Result<f64, String> {
    if grille == 0.0 {
        return Err("float division by zero".into());
    }
    let q = ((v - origine) / grille).floor();
    if q.is_nan() {
        return Err("cannot convert float NaN to integer".into());
    }
    if q.is_infinite() {
        return Err("cannot convert float infinity to integer".into());
    }
    Ok(q + 0.0) // -0.0 et 0.0 : la même cellule
}

/// Découpe la carte en cellules de grille_mm x grille_mm et compte la densité
///
/// Renvoie le pic de densité et les coordonnées (x, y) du hotspot.
pub fn analyser_congestion(footprints: &[Json], board: Option<&Json>, grille_mm: f64) -> Result<Json, String> {
    if footprints.is_empty() {
        return Ok(objet([
            ("peak_density", 0i64.into()),
            ("hotspot_x", 0.0.into()),
            ("hotspot_y", 0.0.into()),
            ("cell_size_mm", grille_mm.into()),
        ]));
    }

    // Bounding box
    // `board and "w" in board and "h" in board` : sur une liste ou un texte, « in » répondait
    // aussi, et c'est board.get qui butait ensuite
    let carte = match board.filter(|b| b.vrai()) {
        None => None,
        Some(b @ Json::Objet(o)) => (o.contains_key("w") && o.contains_key("h")).then_some(b),
        Some(b @ Json::Liste(l)) => {
            if ["w", "h"].iter().all(|k| l.iter().any(|e| e.as_str() == Some(k))) {
                return Err(sans_attribut(b, "get"));
            }
            None
        }
        Some(b @ Json::Texte(t)) => {
            if t.contains('w') && t.contains('h') {
                return Err(sans_attribut(b, "get"));
            }
            None
        }
        Some(b) => return Err(format!("argument of type '{}' is not iterable", nom_type(b))),
    };
    let (min_x, min_y) = if let Some(b) = carte {
        (coord(b, "x", 0.0)?, coord(b, "y", 0.0)?)
    } else {
        let xs = footprints.iter().map(|fp| coord(fp, "x", 0.0)).collect::<Result<Vec<_>, _>>()?;
        let ys = footprints.iter().map(|fp| coord(fp, "y", 0.0)).collect::<Result<Vec<_>, _>>()?;
        (min(&xs), min(&ys))
    };

    let mut rang: HashMap<(u64, u64), usize> = HashMap::new();
    let mut cells: Vec<((f64, f64), i64)> = Vec::new();
    let mut compter = |x: f64, y: f64| -> Result<(), String> {
        let cx = cellule(x, min_x, grille_mm)?;
        let cy = cellule(y, min_y, grille_mm)?;
        let i = *rang.entry((cx.to_bits(), cy.to_bits())).or_insert_with(|| {
            cells.push(((cx, cy), 0));
            cells.len() - 1
        });
        cells[i].1 += 1;
        Ok(())
    };
    for fp in footprints {
        // On compte les pastilles si disponibles, sinon le composant lui-même
        let pads = pastilles(fp)?;
        if pads.vrai() {
            for pad in elements(pads)? {
                compter(coord(pad, "x", 0.0)?, coord(pad, "y", 0.0)?)?;
            }
        } else {
            compter(coord(fp, "x", 0.0)?, coord(fp, "y", 0.0)?)?;
        }
    }

    // (le « if not cells » de Python ne pouvait pas arriver : chaque empreinte compte au moins une fois)
    // max(cells.keys(), key=...) : la première des cellules les plus denses
    let (peak_cell, peak_count) = cells.iter().copied().reduce(|m, c| if c.1 > m.1 { c } else { m }).unwrap_or(((0.0, 0.0), 0));
    let hotspot_x = min_x + (peak_cell.0 + 0.5) * grille_mm;
    let hotspot_y = min_y + (peak_cell.1 + 0.5) * grille_mm;

    Ok(objet([
        ("peak_density", peak_count.into()),
        ("hotspot_x", py::round(hotspot_x, 2).into()),
        ("hotspot_y", py::round(hotspot_y, 2).into()),
        ("cell_size_mm", grille_mm.into()),
    ]))
}

struct PastilleAlim<'a> {
    ref_: &'a str,
    net: &'a str,
    x: f64,
    y: f64,
}

/// Analyse la proximité des condensateurs de découplage par rapport aux CI.
///
/// Détecte les CI (U..., IC... ou >= 4 broches) et les condensateurs (C... avec <= 3 broches).
/// Pour chaque condensateur relié à un rail d'alimentation VCC/3V3/etc.,
/// cherche la broche d'alimentation de CI la plus proche sur le même net.
pub fn analyser_decouplage(footprints: &[Json], distance_cible_mm: f64) -> Result<Json, String> {
    let mut ic_power_pads: Vec<PastilleAlim> = Vec::new();
    let mut cap_power_pads: Vec<PastilleAlim> = Vec::new();

    for fp in footprints {
        let pads = pastilles(fp)?;
        let nb_pads = match pads {
            Json::Liste(l) => l.len(),
            Json::Objet(o) => o.len(),
            Json::Texte(t) => t.chars().count(),
            _ => return Err(format!("object of type '{}' has no len()", nom_type(pads))),
        };
        let ref_ = repere(fp)?;

        let is_ic = cherche(&RE_TIER_SEMI_FIXED, ref_) || nb_pads >= 8;
        let is_cap = cherche(&RE_REF_CAPA, ref_) && nb_pads <= 3;

        for pad in elements(pads)? {
            let Some(net) = get_opt(pad, "net")?.filter(|n| n.vrai()) else { continue };
            let net = net.as_str().ok_or_else(|| pas_un_texte(net))?;
            if cherche(&RE_POWER_NET, net) && !est_masse(net) {
                let x = match get_opt(pad, "x")? {
                    Some(x) => flottant(x)?,
                    None => coord(fp, "x", 0.0)?,
                };
                let y = match get_opt(pad, "y")? {
                    Some(y) => flottant(y)?,
                    None => coord(fp, "y", 0.0)?,
                };
                let pad_info = PastilleAlim { ref_, net, x, y };
                if is_ic {
                    ic_power_pads.push(pad_info);
                } else if is_cap {
                    cap_power_pads.push(pad_info);
                }
            }
        }
    }

    if cap_power_pads.is_empty() || ic_power_pads.is_empty() {
        return Ok(objet([
            ("mean_dist_mm", Json::Nul),
            ("conform_pct", if cap_power_pads.is_empty() { 100.0 } else { 0.0 }.into()),
            ("total_caps_decouplage", cap_power_pads.len().into()),
            ("details", Json::Liste(vec![])),
        ]));
    }

    let mut details = Vec::new();
    let mut distances = Vec::new();

    for cap in &cap_power_pads {
        // Cherche le CI sur le même net le plus proche
        // min(candidats, key=...) : le premier des plus proches
        let Some((dist, plus_proche)) = ic_power_pads
            .iter()
            .filter(|ic| ic.net == cap.net)
            .map(|ic| (py::hypot(cap.x - ic.x, cap.y - ic.y), ic))
            .reduce(|m, c| if c.0 < m.0 { c } else { m })
        else {
            continue;
        };
        distances.push(dist);

        details.push(objet([
            ("cap_ref", cap.ref_.into()),
            ("ic_ref", plus_proche.ref_.into()),
            ("net", cap.net.into()),
            ("dist_mm", py::round(dist, 2).into()),
            ("conforme", (dist <= distance_cible_mm).into()),
            ("cap_pos", Json::Liste(vec![py::round(cap.x, 2).into(), py::round(cap.y, 2).into()])),
            ("ic_pos", Json::Liste(vec![py::round(plus_proche.x, 2).into(), py::round(plus_proche.y, 2).into()])),
        ]));
    }

    let (mean_d, pct) = if distances.is_empty() {
        (Json::Nul, 100.0)
    } else {
        let n = distances.len() as f64;
        let conformes = distances.iter().filter(|d| **d <= distance_cible_mm).count() as f64;
        (py::round(py::sum(distances.iter().copied()) / n, 2).into(), py::round((conformes / n) * 100.0, 1))
    };

    Ok(objet([
        ("mean_dist_mm", mean_d),
        ("conform_pct", pct.into()),
        ("total_caps_decouplage", details.len().into()),
        ("details", Json::Liste(details)),
    ]))
}

/// Classe les composants par priorité de placement (Tiers 1 à 4)
///
/// Tier 1 : Ancres (connecteurs, trous de montage, fixations)
/// Tier 2 : Actifs critiques (CI, régulateurs, transistors de puissance)
/// Tier 3 : Flexibles (quartz, relais, transformateurs, inductances)
/// Tier 4 : Libres (résistances, capas, diodes)
pub fn ordonnancer_placement(footprints: &[Json]) -> Result<Json, String> {
    let mut tiers: [(&str, Vec<&str>); 4] = [("anchor", vec![]), ("semi_fixed", vec![]), ("flexible", vec![]), ("free", vec![])];

    for fp in footprints {
        let Some(ref_) = get_opt(fp, "ref")?.filter(|r| r.vrai()) else { continue };
        let ref_ = ref_.as_str().ok_or_else(|| pas_un_texte(ref_))?;

        let rang = if cherche(&RE_TIER_ANCHOR, ref_) {
            0
        } else if cherche(&RE_TIER_SEMI_FIXED, ref_) {
            1
        } else if cherche(&RE_TIER_FLEXIBLE, ref_) {
            2
        } else {
            3
        };
        tiers[rang].1.push(ref_);
    }

    // Tri alphabétique dans chaque catégorie
    for (_, v) in &mut tiers {
        v.sort();
    }

    Ok(objet([
        ("tiers", Json::Objet(tiers.iter().map(|(k, v)| (k.to_string(), textes(v))).collect())),
        ("counts", Json::Objet(tiers.iter().map(|(k, v)| (k.to_string(), v.len().into())).collect())),
    ]))
}

/// Point d'entrée principal pour évaluer un document PCB.
///
/// `data` : objet contenant "footprints" et éventuellement "board".
///
/// Rend un objet avec les résultats de scoring complets.
pub fn evaluer_placement_pcb(data: &Json) -> Result<Json, String> {
    let footprints: &[Json] = match get_opt(data, "footprints")? {
        None => &[],
        Some(Json::Liste(l)) if l.iter().all(|f| matches!(f, Json::Objet(_))) => l,
        Some(_) => return Err("« footprints » : liste d'objets attendue".into()),
    };
    let board = get_opt(data, "board")?;

    let (hpwl_total, _hpwl_nets) = calculer_hpwl(footprints)?;
    let worst = top_contributeurs_hpwl(footprints, 5)?;
    let congestion = analyser_congestion(footprints, board, 5.0)?;
    let decouplage = analyser_decouplage(footprints, 3.5)?;
    let ordonnancement = ordonnancer_placement(footprints)?;

    Ok(objet([
        ("succes", true.into()),
        ("hpwl_mm", hpwl_total.into()),
        ("top_contributeurs", Json::Liste(worst)),
        ("congestion", congestion),
        ("decouplage", decouplage),
        ("ordonnancement", ordonnancement),
    ]))
}
