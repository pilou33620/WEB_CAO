//! L'empilage, l'impédance de chaque net, les fentes des plans, les vias de couture, le
//! découplage, le bord de carte et les paires différentielles.

use crate::base::*;
use crate::commun::*;
use crate::surfaces::{anneau, boucher_trous, distance_edt, Surfaces};
use regex::Regex;
use std::sync::LazyLock;

/// Ce que chaque règle lit : le document, l'empilage, les réglages, les tronçons en mm et
/// l'image des plans.
pub struct Carte<'a> {
    pub doc: &'a Doc<'a>,
    pub couches: &'a [Json],
    pub reg: &'a Json,
    pub unite: f64,
    pub troncons: &'a [Troncon],
    pub surf: Option<&'a Surfaces>,
}

/// Les constats d'une règle et son bilan (un objet, vide s'il n'y a rien à dire).
pub type Regle = R<(Vec<Json>, Json)>;

/// `str(couches[i].get("name") or i)`
fn nom_ou_rang(couches: &[Json], i: usize) -> String {
    let n = &couches[i]["name"];
    if n.vrai() { str_py(n) } else { i.to_string() }
}

fn est_plan(couches: &[Json], i: usize) -> bool {
    couches[i]["role"].as_str() == Some("plane")
}

fn cuivres(couches: &[Json]) -> Vec<usize> {
    (0..couches.len()).filter(|i| couches[*i]["type"].as_str() == Some("copper")).collect()
}

// ==========================================================================
// 1. L'EMPILAGE
// ==========================================================================

pub const H_LOIN_MM: f64 = 0.5; // plan de référence au-delà : boucle large pour un front rapide
pub const CAVITE_MINCE_MM: f64 = 0.25; // paire alimentation / masse : au-delà, peu de capacité entre plans
pub const SYMETRIE: f64 = 0.10; // écart toléré entre deux couches en miroir

/// L'empilage lui-même : chaque couche de signal a-t-elle un plan collé contre elle, deux
/// couches de signal se font-elles face, l'alimentation est-elle collée à sa masse,
/// l'empilage est-il symétrique ? Des constats de carte (n = None, sans position).
pub fn empilage(doc: &Doc, couches: &[Json]) -> R<Vec<Json>> {
    let cu = cuivres(couches);
    let rang = _rangs(couches);
    let nom = |i: usize| nom_ou_rang(couches, i);
    let plan = |i: usize| est_plan(couches, i);
    let pos = |j: usize| cu.iter().position(|x| *x == j).unwrap_or(0) as i64;

    let mut nets: HashMap<usize, BTreeSet<String>> = HashMap::new();
    for p in doc.liste("pistes").iter().chain(doc.liste("arcs")) {
        let p = dict(p)?;
        let n = str_ou_vide(&p["n"]);
        if let Some(&i) = rang.get(&cle(&p["c"])) {
            if doc.signal(&n) {
                nets.entry(i).or_default().insert(n);
            }
        }
    }
    let vide = BTreeSet::new();
    let nets_de = |i: usize| nets.get(&i).unwrap_or(&vide);
    let mut out = Vec::new();
    let mut constat = |sev: &str, c: String, msg: String| {
        out.push(obj! {"regle" => "empilage", "severite" => sev, "x" => Json::Nul, "y" => Json::Nul, "c" => c, "n" => Json::Nul,
                       "frequences" => Vec::<Json>::new(), "msg" => msg});
    };
    let compte = |i: usize| -> (String, Vec<&String>) {
        let rapides: Vec<&String> = nets_de(i).iter().filter(|n| RAPIDES.contains(&xt::famille(&doc.classe(n)))).collect();
        let mut txt = format!("{} net{} de signal", nets_de(i).len(), s_si(nets_de(i).len()));
        if !rapides.is_empty() {
            txt += &format!(", dont {} rapide{} ({}{})", rapides.len(), s_si(rapides.len()),
                            rapides.iter().take(4).map(|s| s.as_str()).collect::<Vec<_>>().join(", "), if rapides.len() > 4 { "…" } else { "" });
        }
        (txt, rapides)
    };

    for (k, &i) in cu.iter().enumerate() {
        if plan(i) || nets_de(i).is_empty() {
            continue;
        }
        let (txt, rapides) = compte(i);
        let refs = _plans_voisins(couches, i);
        let ecart = |j: &usize| (pos(*j) - k as i64).abs();
        if refs.is_empty() {
            constat(if rapides.is_empty() { "vigilance" } else { "critique" }, nom(i),
                    format!("Aucun plan de référence dans l'empilage : {txt} ; leur courant de retour n'a pas de chemin défini"));
        } else if !refs.iter().any(|j| ecart(j) == 1) {
            let j = *premier_min(&refs, |j| ecart(j) as f64).unwrap();
            constat("vigilance", nom(i), format!("Le plan le plus proche, {}, est à {:.2} mm derrière une autre couche de cuivre : {txt}, \
                                                  qui se couplent au lieu de s'y référer", nom(j), _ep(couches, i, j)?));
        } else if !rapides.is_empty() {
            let mut hs = Vec::new();
            for j in refs.iter().filter(|j| ecart(j) == 1) {
                hs.push(_ep(couches, i, *j)?);
            }
            let h = minf(&hs);
            if h > H_LOIN_MM {
                constat("vigilance", nom(i), format!("Plan de référence à {h:.2} mm : {txt} ; une boucle de retour large, un Z₀ haut, une \
                                                      diaphonie forte"));
            }
        }
        if k + 1 < cu.len() && !plan(cu[k + 1]) && !nets_de(cu[k + 1]).is_empty() {
            constat("vigilance", format!("{} ↔ {}", nom(i), nom(cu[k + 1])),
                    format!("Deux couches de signal face à face ({:.2} mm) sans plan entre elles : leurs pistes parallèles se couplent sur \
                             toute leur largeur ; croisez-les à angle droit", _ep(couches, i, cu[k + 1])?));
        }
    }

    for &i in &cu {
        let pn = str_ou_vide(&couches[i]["net"]);
        if !plan(i) || doc.classe(&pn) != "Alimentation" {
            continue;
        }
        let masses: Vec<usize> = cu.iter().copied().filter(|j| *j != i && plan(*j) && doc.classe(&str_ou_vide(&couches[*j]["net"])) == "Masse").collect();
        if masses.is_empty() {
            constat("vigilance", nom(i), format!("Plan d'alimentation {pn} sans plan de masse dans l'empilage : pas de cavité pour découpler \
                                                  en haute fréquence"));
            continue;
        }
        let j = *premier_min(&masses, |j| (*j as f64 - i as f64).abs()).unwrap();
        let (d, er) = (_ep(couches, i, j)?, _er_entre(couches, i, j)?);
        let cpf = 8.854e-12 * er / maxf(&[d * 1e-3, 1e-6]) * 1e-4 * 1e12;
        if (i.min(j) + 1..i.max(j)).any(|x| couches[x]["type"].as_str() == Some("copper")) {
            constat("vigilance", format!("{} ↔ {}", nom(i), nom(j)),
                    format!("Le plan {pn} est séparé de sa masse par une couche de signal : cavité de {d:.2} mm, {cpf:.0} pF/cm²"));
        } else if d > CAVITE_MINCE_MM {
            constat("info", format!("{} ↔ {}", nom(i), nom(j)),
                    format!("Cavité {pn} / masse de {d:.2} mm : {cpf:.0} pF/cm². Un diélectrique mince (≤ 0,1 mm) fait une capacité répartie \
                             qui découple au-delà de 100 MHz"));
        }
    }

    if cu.len() >= 3 && cu.len() % 2 == 1 {
        constat("vigilance", "empilage".into(), format!("Nombre impair de couches de cuivre ({}) : l'empilage est dissymétrique par \
                                                         construction, la carte voile", cu.len()));
    }
    let mut ecarts = Vec::new();
    for a in 0..couches.len() / 2 {
        let b = couches.len() - 1 - a;
        let (ta, tb) = (fl_ou(&couches[a]["thickness"], 0.0)?, fl_ou(&couches[b]["thickness"], 0.0)?);
        if cle(&couches[a]["type"]) != cle(&couches[b]["type"]) {
            ecarts.push(format!("{} face à {}", nom(a), nom(b)));
        } else if ta > 0.0 && tb > 0.0 && (ta - tb).abs() / maxf(&[ta, tb]) > SYMETRIE {
            ecarts.push(format!("{} {ta:.3} / {} {tb:.3} mm", nom(a), nom(b)));
        }
    }
    if !ecarts.is_empty() {
        constat("vigilance", "empilage".into(), format!(
            "Empilage dissymétrique autour de son milieu ({}{}) : les contraintes ne s'équilibrent pas au refusion, la carte voile (bow & twist)",
            ecarts.iter().take(3).cloned().collect::<Vec<_>>().join("; "), if ecarts.len() > 3 { "…" } else { "" }));
    }
    let n = cu.len();
    let roles: Vec<String> = (0..n / 2).filter(|k| plan(cu[*k]) != plan(cu[n - 1 - k])).map(|k| {
        let (p, s) = if plan(cu[k]) { (cu[k], cu[n - 1 - k]) } else { (cu[n - 1 - k], cu[k]) };
        format!("{} plan / {} signal", nom(p), nom(s))
    }).collect();
    if !roles.is_empty() {
        constat("info", "empilage".into(), format!("Cuivre réparti de façon dissymétrique ({}) : une face plus chargée que l'autre tire la carte",
                                                    roles.join("; ")));
    }
    Ok(out)
}

// ==========================================================================
// 2. L'IMPÉDANCE DE CHAQUE NET
// --------------------------------------------------------------------------
// Chaque section (couche, largeur, écarts à la masse coplanaire) résolue par la méthode des
// moments : Z₀, vitesse, C'. Par net : longueur, retard, R, L, C. La masse coplanaire se
// mesure dans l'image de la couche, de chaque côté, jusqu'à 2 mm : une ligne RF noyée dans
// sa masse n'est pas un microruban, et vingt pour cent d'impédance en dépendent. Une piste
// posée DANS une zone de masse (l'éditeur envoie ses zones sans les isolations) prend
// l'isolement de la zone. Un tronçon d'impédance Z dans une ligne de référence Z_ref
// réfléchit |Z - Z_ref| / (Z + Z_ref) -- mais seulement s'il est assez long pour que le
// front le voie : une discontinuité courte réfléchit Γ · 2T_d / t_r. La référence est la
// cible Z₀ pour les classes à impédance tenue (Horloge, Rapide, RF, et toute classe à qui
// `z0_classes` donne sa propre cible), l'impédance dominante du net sinon.
// ==========================================================================

pub const ECART_COPLANAIRE_MM: f64 = 2.0;

/// Un écart ramené sur une échelle géométrique de 25 % : Z₀ n'en bouge pas de 2 %, et le
/// nombre de sections à résoudre fond.
fn _quantifier(e: f64) -> f64 {
    if !(e > 0.0) {
        return 0.0;
    }
    round(0.05 * 1.25f64.powf(round0((e / 0.05).ln() / 1.25f64.ln()) as f64), 3)
}

/// (gauche, droite) : l'écart de la piste au cuivre de masse de sa couche, en mm, 0 quand il
/// n'y en a pas à moins de 2 mm.
fn _ecarts_masse(k: &Carte, t: &Troncon) -> R<(f64, f64)> {
    let Some(surf) = k.surf else { return Ok((0.0, 0.0)) };
    let Some(img) = surf.image(&t.c) else { return Ok((0.0, 0.0)) };
    let masses = surf.masses(k.doc);
    if masses.is_empty() {
        return Ok((0.0, 0.0));
    }
    let l = t.longueur();
    let (nx, ny) = (-(t.y2 - t.y1) / l, (t.x2 - t.x1) / l);
    let pts: Vec<(f64, f64)> = [0.25, 0.5, 0.75].iter().map(|f| (t.x1 + (t.x2 - t.x1) * f, t.y1 + (t.y2 - t.y1) * f)).collect();
    let dedans = surf.lire_img(img, pts[1].0, pts[1].1);
    if masses.contains(&dedans) {
        let mut iso = Vec::new();
        for p in k.doc.liste("plans") {
            if p.as_objet().is_some() && str_py(&p["c"]) == str_py(&t.c) && surf.ids.get(&str_ou_vide(&p["n"])) == Some(&dedans) {
                iso.push(fl_ou(&p["isolement"], 0.0)? * k.unite);
            }
        }
        let e = _quantifier(if iso.is_empty() { 0.0 } else { maxf(&iso) });
        return Ok((e, e));
    }
    let (a, b) = (_ecart_cote(surf, masses, img, &pts, nx, ny, t.w, 1.0), _ecart_cote(surf, masses, img, &pts, nx, ny, t.w, -1.0));
    Ok(if a <= b { (a, b) } else { (b, a) }) // la section est symétrique
}

/// L'écart au cuivre de masse d'UN côté (sg = ±1 le long de la normale), médiane de trois
/// points, quantifié ; 0 sans masse à moins de 2 mm.
fn _ecart_cote(surf: &Surfaces, masses: &HashSet<i32>, img: &[i32], pts: &[(f64, f64)], nx: f64, ny: f64, w: f64, sg: f64) -> f64 {
    let n = (ECART_COPLANAIRE_MM / surf.pas) as usize;
    let mut ecarts: Vec<f64> = pts.iter().map(|(px, py)| {
        for q in 1..=n {
            let pas = q as f64 * surf.pas;
            let d = w / 2.0 + pas;
            let lab = surf.lire_img(img, px + sg * nx * d, py + sg * ny * d);
            if lab != 0 {
                return if masses.contains(&lab) { pas } else { 0.0 };
            }
        }
        0.0
    }).collect();
    ecarts.sort_by(f64::total_cmp);
    _quantifier(ecarts[ecarts.len() / 2])
}

/// L'écart à la masse coplanaire du côté de `a` qui NE regarde PAS `b` : deux moitiés d'une
/// paire.
fn _ecart_exterieur(k: &Carte, c: &Json, a: &Seg, b: &Seg) -> f64 {
    let Some(surf) = k.surf else { return 0.0 };
    let Some(img) = surf.image(c) else { return 0.0 };
    let masses = surf.masses(k.doc);
    if masses.is_empty() {
        return 0.0;
    }
    let (_, x1, y1, x2, y2, w) = *a;
    let l = hyp(x2 - x1, y2 - y1);
    let (nx, ny) = (-(y2 - y1) / l, (x2 - x1) / l);
    let vers_b = ((b.1 + b.3) / 2.0 - (x1 + x2) / 2.0) * nx + ((b.2 + b.4) / 2.0 - (y1 + y2) / 2.0) * ny;
    let pts: Vec<(f64, f64)> = [0.25, 0.5, 0.75].iter().map(|f| (x1 + (x2 - x1) * f, y1 + (y2 - y1) * f)).collect();
    _ecart_cote(surf, masses, img, &pts, nx, ny, w, if vers_b > 0.0 { -1.0 } else { 1.0 })
}

pub fn impedances(k: &Carte, notes: &mut Vec<String>) -> Regle {
    let (doc, couches, reg, unite) = (k.doc, k.couches, k.reg, k.unite);
    let rang = _rangs(couches);
    // net -> (couche, largeur, écarts) -> longueur
    let mut parts: IndexMap<&str, IndexMap<(usize, u64, u64, u64), f64>> = IndexMap::new();
    let mut ou: HashMap<&str, (f64, f64, f64, &Json)> = HashMap::new();
    for t in k.troncons {
        let Some(&i) = rang.get(&cle(&t.c)) else { continue };
        if !doc.signal(&t.n) {
            continue;
        }
        let l = t.longueur();
        let (eg, ed) = _ecarts_masse(k, t)?;
        *parts.entry(&t.n).or_default().entry((i, bits(round(t.w, 3)), bits(eg), bits(ed))).or_insert(0.0) += l;
        if l > ou.get(t.n.as_str()).map_or(0.0, |o| o.0) {
            ou.insert(&t.n, (l, (t.x1 + t.x2) / 2.0, (t.y1 + t.y2) / 2.0, &t.c));
        }
    }
    let mut cache: HashMap<(usize, u64, u64, u64), Option<(f64, f64, f64, f64)>> = HashMap::new();
    let mut section = |q: (usize, u64, u64, u64)| -> R<Option<(f64, f64, f64, f64)>> {
        if let Some(v) = cache.get(&q) {
            return Ok(*v);
        }
        let (i, w, eg, ed) = (q.0, f64::from_bits(q.1), f64::from_bits(q.2), f64::from_bits(q.3));
        let t = ep_cuivre(couches, i)?;
        let (geo, _) = se::section_de_couche(couches, i as i64, w, t, eg, Some(ed), &[], false);
        let v = geo.and_then(|geo| tl::solve_line(&se::geometrie(&geo)).ok()).map(|r| (r.z0, C0 / maxf(&[r.eps_eff, 1.0]).sqrt(), r.c, t));
        cache.insert(q, v);
        Ok(v)
    };

    let (mut out, mut n_nets, mut sans) = (Vec::new(), 0usize, 0usize);
    for (n, groupes) in &parts {
        // (z, L, td, c, l, r)
        let mut pieces = Vec::new();
        for (q, l) in groupes {
            if let Some((z, v, c, t)) = section(*q)? {
                let w = f64::from_bits(q.1);
                pieces.push((z, *l, l * 1e-3 / v, c * l * 1e-3, z * z * c * l * 1e-3, dc_solver::RESISTIVITE_CUIVRE * l / (w * t) * 1e3));
            }
        }
        if pieces.is_empty() {
            sans += 1;
            continue;
        }
        n_nets += 1;
        let cls = doc.classe(n);
        let tenu = _tient_z(reg, &cls);
        let zref = if tenu { _z0(reg, &cls) } else { premier_max(&pieces, |p| p.1).unwrap().0 };
        let freqs = _par_frequence(reg, &cls, Some(n), |_f_eval, tr| {
            let g = maxf(&pieces.iter().map(|p| (p.0 - zref).abs() / (p.0 + zref) * minf(&[1.0, 2.0 * p.2 / tr])).collect::<Vec<_>>());
            Ok((g, _gamma(g), Json::Nul))
        })?;
        let sev = _pire(verdicts(&freqs));
        if sev == "ok" {
            continue;
        }
        let mut zs: Vec<f64> = pieces.iter().map(|p| p.0).collect();
        zs.sort_by(f64::total_cmp);
        let tot = |f: fn(&(f64, f64, f64, f64, f64, f64)) -> f64| py::sum(pieces.iter().map(f));
        let (_, x, y, c) = ou[n];
        let (z_min, z_max) = (zs[0], zs[zs.len() - 1]);
        out.push(obj! {"regle" => "impedance", "severite" => sev, "frequences" => freqs, "x" => x / unite, "y" => y / unite, "c" => c, "n" => *n,
                       "msg" => format!("{:.1} mm, Z₀ {} Ω{}, T_d {:.0} ps ; R {:.0} mΩ, L {:.1} nH, C {:.1} pF", tot(|p| p.1),
                                        if z_max - z_min < 0.5 { format!("{z_min:.0}") } else { format!("{z_min:.0}–{z_max:.0}") },
                                        if tenu { format!(" (cible {zref:.0} Ω)") } else { String::new() },
                                        tot(|p| p.2) * 1e12, tot(|p| p.5) * 1e3, tot(|p| p.4) * 1e9, tot(|p| p.3) * 1e12)});
    }
    if sans > 0 {
        notes.push(format!("{sans} net(s) sur des couches sans plan de référence : impédance non chiffrée."));
    }
    Ok((out, obj! {"nets" => n_nets, "sections" => cache.values().filter(|v| v.is_some()).count()}))
}

// ==========================================================================
// 4. LES FENTES ET LES VIDES DES PLANS DE RÉFÉRENCE
// --------------------------------------------------------------------------
// Sous chaque piste de signal, le plan de référence est lu dans l'image de sa couche, pas à
// pas. Là où il manque, le retour contourne le vide par ses deux bouts : on mesure d1 et d2
// le long de la normale à la piste, plafonnés à 30 mm (plan coupé de bord à bord). Chaque
// détour est une self (Ott), et c'est `rf_reseau.z_fente` -- le moteur de la simulation RF
// -- qui donne son impédance. Verdict par |Γ|, comme un via. Le dégagement du propre via ou
// de la propre pastille du net n'est pas un vide : la piste y plonge. Une ligne par net et
// par plan : le pire franchissement, et leur nombre -- une antenne posée sur une réserve de
// plan en franchit des centaines.
// ==========================================================================

pub const FENTE_MAX_MM: f64 = 30.0;
pub const MARGE_DEGAGEMENT_MM: f64 = 0.3;

/// Les suites de vrais d'un masque : (début, fin exclue).
fn suites(vide: &[bool]) -> Vec<(usize, usize)> {
    let (mut out, mut a) = (Vec::new(), 0);
    while a < vide.len() {
        if !vide[a] {
            a += 1;
            continue;
        }
        let mut b = a;
        while b < vide.len() && vide[b] {
            b += 1;
        }
        out.push((a, b));
        a = b;
    }
    out
}

pub fn fentes(k: &Carte, surf: &Surfaces, notes: &mut Vec<String>) -> Regle {
    let (doc, couches, reg, unite) = (k.doc, k.couches, k.reg, k.unite);
    let pas = surf.pas;
    let rang = _rangs(couches);
    let mut propres: HashMap<(String, i64, i64), Vec<(f64, f64, f64)>> = HashMap::new();
    for t in doc.liste("pastilles").iter().chain(doc.liste("percages")) {
        let t = dict(t)?;
        if t["n"].vrai() {
            let (x, y) = (flr(t, "x")? * unite, flr(t, "y")? * unite);
            let r = (if nul(&t["r"]) { nombre_ou0(&t["d"])? / 2.0 } else { fl(&t["r"])? }) * unite + MARGE_DEGAGEMENT_MM;
            for (i, j) in _cases(CASE_MM, x, y, x, y, r)? {
                propres.entry((str_py(&t["n"]), i, j)).or_default().push((x, y, r));
            }
        }
    }
    let mut sans_image: BTreeSet<String> = BTreeSet::new();
    let mut vus: HashSet<(&str, usize, i64, i64)> = HashSet::new();
    // (net, plan) -> (rang du pire, constat, nombre)
    let mut pires: IndexMap<(&str, usize), ((usize, f64), Json, usize)> = IndexMap::new();
    let mut franchissements = 0usize;
    let marche: Vec<f64> = (1..=(FENTE_MAX_MM / pas) as usize).map(|q| q as f64 * pas).collect();
    for t in k.troncons {
        let Some(&i) = rang.get(&cle(&t.c)) else { continue };
        if !doc.signal(&t.n) || est_plan(couches, i) {
            continue;
        }
        let refs = _plans_voisins(couches, i);
        if refs.is_empty() {
            continue;
        }
        let l = t.longueur();
        let (ux, uy) = ((t.x2 - t.x1) / l, (t.y2 - t.y1) / l);
        let m = ((l / pas) as usize).max(1);
        let pts: Vec<(f64, f64)> = (0..m).map(|q| {
            let s = (q as f64 + 0.5) / m as f64 * l;
            (t.x1 + ux * s, t.y1 + uy * s)
        }).collect();
        let mut excuse = vec![false; m];
        for c in _cases(CASE_MM, t.x1, t.y1, t.x2, t.y2, 0.0)? {
            for &(qx, qy, r) in propres.get(&(t.n.clone(), c.0, c.1)).into_iter().flatten() {
                for (e, (px, py)) in excuse.iter_mut().zip(&pts) {
                    *e |= (px - qx).hypot(py - qy) <= r;
                }
            }
        }
        for &p in &refs {
            let nomp = &couches[p]["name"];
            let Some(img) = surf.image(nomp) else {
                sans_image.insert(str_py(nomp));
                continue;
            };
            let vide: Vec<bool> = (0..m).map(|q| surf.lire_img(img, pts[q].0, pts[q].1) == 0 && !excuse[q]).collect();
            for (a, b) in suites(&vide) {
                let (xm, ym) = pts[(a + b - 1) / 2];
                if !vus.insert((&t.n, p, round0(xm), round0(ym))) {
                    continue;
                }
                franchissements += 1;
                let ds: Vec<f64> = [1.0, -1.0].iter().map(|sg| {
                    marche.iter().find(|d| surf.lire_img(img, xm - sg * uy * **d, ym + sg * ux * **d) != 0).copied().unwrap_or(FENTE_MAX_MM)
                }).collect();
                let autre: Vec<usize> = refs.iter().copied().filter(|q| *q != p && surf.image(&couches[*q]["name"]).is_some()
                                                                    && surf.lire(&couches[*q]["name"], xm, ym) != 0).collect();
                let fe = obj! {"largeur" => t.w, "plan" => p, "d1" => ds[0], "d2" => ds[1]};
                let classe = doc.classe(&t.n);
                let z0 = _z0(reg, &classe);
                let freqs = _par_frequence(reg, &classe, Some(&t.n), |f_eval, _tr| {
                    let z = rf_reseau::z_fente(couches, &fe, f_eval);
                    let g = z.norm() / (z + 2.0 * z0).norm();
                    Ok((g, _gamma(g), Json::Nul))
                })?;
                let mut sev = _pire(verdicts(&freqs));
                if !autre.is_empty() && sev == "critique" {
                    sev = "vigilance";
                }
                if sev == "ok" {
                    continue;
                }
                let mut msg = format!("Plan {} : {:.2} mm de vide sous la piste, le retour contourne à {:.1} / {:.1} mm", str_py(nomp),
                                      (b - a) as f64 * l / m as f64, ds[0], ds[1]);
                if minf(&ds) >= FENTE_MAX_MM {
                    msg += " — plan coupé d'un bord à l'autre";
                }
                if let Some(q) = autre.first() {
                    msg += &format!(" ; {} reste dessous et porte une part du retour", str_py(&couches[*q]["name"]));
                }
                let rang_k = (["ok", "vigilance", "critique"].iter().position(|s| *s == sev).unwrap_or(0),
                              maxf(&freqs.iter().map(|f| num(f, "valeur")).collect::<Vec<_>>()));
                let kc = obj! {"regle" => "fente", "severite" => sev, "frequences" => freqs, "x" => xm / unite, "y" => ym / unite,
                               "c" => &t.c, "n" => &t.n, "msg" => msg};
                match pires.get_mut(&(t.n.as_str(), p)) {
                    None => {
                        pires.insert((&t.n, p), (rang_k, kc, 1));
                    }
                    Some(p0) => {
                        p0.2 += 1;
                        if rang_k > p0.0 {
                            (p0.0, p0.1) = (rang_k, kc);
                        }
                    }
                }
            }
        }
    }
    let mut out = Vec::new();
    for (_, mut kc, nb) in pires.into_values() {
        if nb > 1 {
            let msg = format!("{} (le pire de {nb} franchissements sur ce plan)", txt(&kc, "msg"));
            poser(&mut kc, "msg", msg);
        }
        out.push(kc);
    }
    if !sans_image.is_empty() {
        notes.push(format!("Plans {} déclarés dans l'empilage sans cuivre dans le document : fentes non vérifiées sous eux.",
                           sans_image.into_iter().collect::<Vec<_>>().join(", ")));
    }
    Ok((out, obj! {"franchissements" => franchissements}))
}

// ==========================================================================
// 5. LES VIAS DE COUTURE
// --------------------------------------------------------------------------
// Deux couches qui portent le cuivre d'une même masse forment une cavité ; les vias de ce
// net qui les traversent l'une et l'autre la cousent. Entre deux vias, la cavité résonne
// quand l'écart approche la demi-longueur d'onde : on garde le pas sous λ/20 au genou du
// front le plus rapide de la carte (λ/10 pour condamner). Le plus grand trou sans via se lit
// par une transformée de distance sur le cuivre commun aux deux couches ; son rayon d_max
// fait un pas équivalent √2 · d_max (maille carrée).
//
// LE LONG DU BORD, UNE CLÔTURE : dans la bande de 2 mm du détourage, là où la cavité s'ouvre
// sur l'extérieur et rayonne, les vias de masse forment une rangée ; son plus grand écart,
// 2 · d_max le long d'une ligne, se juge au même λ/20. Le constat range sous « Bord de
// carte ».
// ==========================================================================

pub const AIRE_PLAN_MM2: f64 = 100.0;
pub const AIRE_COMMUNE_MM2: f64 = 25.0;
pub const BANDE_BORD_MM: f64 = 2.0;

/// np.argmax : le rang du PREMIER des plus grands.
fn argmax(v: &[f64]) -> usize {
    (0..v.len()).fold(0, |m, q| if v[q] > v[m] { q } else { m })
}

/// Les nets de signal des pistes et des arcs, triés (un `set` en Python, dont l'ordre de
/// parcours changeait d'un lancement à l'autre).
fn nets_de_signal(doc: &Doc) -> Vec<String> {
    let s: BTreeSet<String> = doc.liste("pistes").iter().chain(doc.liste("arcs")).map(|p| str_ou_vide(&p["n"])).filter(|n| doc.signal(n)).collect();
    s.into_iter().collect()
}

pub fn coutures(k: &Carte, surf: &Surfaces) -> Regle {
    let (doc, couches, reg, unite) = (k.doc, k.couches, k.reg, k.unite);
    let a2 = surf.pas * surf.pas;
    let (h, w) = (surf.h, surf.w);
    let rang = _rangs(couches);
    let (nv, vite) = _plus_vite(reg, doc, &nets_de_signal(doc));
    let mut trous = Vec::new();
    for t in doc.liste("percages") {
        let t = dict(t)?;
        let (lo, hi) = match (rang.get(&cle(&t["de"])), rang.get(&cle(&t["a"]))) {
            (Some(&de), Some(&a)) => tri2(de, a),
            _ => (0, couches.len()),
        };
        trous.push((flr(t, "x")? * unite, flr(t, "y")? * unite, str_ou_vide(&t["n"]), lo, hi));
    }
    let (mut out, mut cavites) = (Vec::new(), 0usize);
    let mut bord: Option<Vec<f64>> = None;
    let ct = &doc.d["contour"];
    if els(&ct["o"]).len() >= 6 {
        let mut dedans = vec![0i32; h * w];
        surf.peindre(&mut dedans, &anneau(&ct["o"], unite)?, 1);
        for t in els(&ct["t"]) {
            if dc_solver::pyth::len_py(t)? >= 6 {
                surf.peindre(&mut dedans, &anneau(t, unite)?, 0);
            }
        }
        if dedans.iter().any(|x| *x != 0) {
            let masque: Vec<bool> = dedans.iter().map(|x| *x != 0).collect();
            bord = Some(distance_edt(&masque, h, w).into_iter().map(|d| d * surf.pas).collect());
        }
    }
    let mut ids: Vec<(&String, i32)> = surf.ids.iter().map(|(g, id)| (g, *id)).collect();
    ids.sort();
    for (g, gid) in ids {
        if doc.classe(g) != "Masse" {
            continue;
        }
        let mut couvre: Vec<(usize, &String, Vec<bool>)> = Vec::new();
        for (c, img) in &surf.images {
            if let Some(&r) = rang.get(&format!("s{c}")) {
                let masque: Vec<bool> = img.iter().map(|x| *x == gid).collect();
                if masque.iter().filter(|x| **x).count() as f64 * a2 >= AIRE_PLAN_MM2 {
                    couvre.push((r, c, masque));
                }
            }
        }
        couvre.sort_by_key(|x| x.0);
        for paire in couvre.windows(2) {
            let ((ia, na, ma), (ib, nb, mb)) = (&paire[0], &paire[1]);
            let commun: Vec<bool> = ma.iter().zip(mb).map(|(a, b)| *a && *b).collect();
            let aire = commun.iter().filter(|x| **x).count() as f64 * a2;
            if aire < AIRE_COMMUNE_MM2 {
                continue;
            }
            cavites += 1;
            let vias: Vec<(f64, f64)> = trous.iter().filter(|t| &t.2 == g && t.3 <= *ia && *ib <= t.4).map(|t| (t.0, t.1)).collect();
            let constat = |regle: &str, severite: &str, frequences: Vec<Json>, x: f64, y: f64, msg: String| {
                obj! {"regle" => regle, "c" => format!("{na} ↔ {nb}"), "n" => g, "severite" => severite, "frequences" => frequences,
                      "x" => x / unite, "y" => y / unite, "msg" => msg}
            };
            if vias.is_empty() {
                let (mut si, mut sj, mut nb_px) = (0u64, 0u64, 0u64);
                for (q, _) in commun.iter().enumerate().filter(|(_, c)| **c) {
                    si += (q / w) as u64;
                    sj += (q % w) as u64;
                    nb_px += 1;
                }
                let (x, y) = surf.point(si as f64 / nb_px as f64, sj as f64 / nb_px as f64);
                out.push(constat("couture", "critique", vec![], x, y, format!(
                    "Aucun via de {g} ne relie {na} à {nb} : {:.1} cm² de cuivre en regard, sans couture", aire / 100.0)));
                continue;
            }
            let mut sans_via = vec![true; h * w];
            for (x, y) in &vias {
                // int() de Python : vers zéro
                let (j, i) = (((x - surf.x0) / surf.pas).trunc(), ((y - surf.y0) / surf.pas).trunc());
                if 0.0 <= i && i < h as f64 && 0.0 <= j && j < w as f64 {
                    sans_via[i as usize * w + j as usize] = false;
                }
            }
            let mut dist: Vec<f64> = distance_edt(&sans_via, h, w).into_iter().map(|d| d * surf.pas).collect();
            let er = _er_entre(couches, *ia, *ib)?;
            let lambda20 = |f_eval: f64| C0 / (f_eval * er.sqrt()) / 20.0 * 1e3;
            if let Some(bord) = &bord {
                let bande: Vec<bool> = (0..h * w).map(|q| commun[q] && bord[q] > 0.0 && bord[q] <= BANDE_BORD_MM).collect();
                // 10 mm de bord au moins
                if bande.iter().filter(|x| **x).count() as f64 * surf.pas >= 10.0 * BANDE_BORD_MM {
                    let db: Vec<f64> = (0..h * w).map(|q| if bande[q] { dist[q] } else { 0.0 }).collect();
                    let q = argmax(&db);
                    let s_bord = 2.0 * db[q];
                    let fb = _par_frequence(reg, &vite, nv.as_deref(), |f_eval, _tr| {
                        let r = s_bord / lambda20(f_eval);
                        Ok((r, _ratio(r), Json::Nul))
                    })?;
                    let sev_b = _pire(verdicts(&fb));
                    if sev_b != "ok" {
                        let (x, y) = surf.point((q / w) as f64, (q % w) as f64);
                        out.push(constat("bord", sev_b, fb, x, y, format!(
                            "Clôture de vias {g} le long du bord : le plus grand écart entre deux vias fait {s_bord:.1} mm dans la bande de \
                             {BANDE_BORD_MM:.0} mm du détourage ; la cavité s'y ouvre et rayonne (réglé sur le plus rapide de la carte : {vite})")));
                    }
                }
            }
            for q in 0..h * w {
                if !commun[q] {
                    dist[q] = 0.0;
                }
            }
            let q = argmax(&dist);
            let d_max = dist[q];
            let s_eq = 2f64.sqrt() * d_max;
            let freqs = _par_frequence(reg, &vite, nv.as_deref(), |f_eval, _tr| {
                let r = s_eq / lambda20(f_eval);
                Ok((r, _ratio(r), Json::Nul))
            })?;
            let sev = _pire(verdicts(&freqs));
            if sev == "ok" {
                continue;
            }
            let (x, y) = surf.point((q / w) as f64, (q % w) as f64);
            let tient = 0.35 * 20.0 * s_eq * 1e-3 * er.sqrt() / C0;
            out.push(constat("couture", sev, freqs, x, y, format!(
                "{} via{} de couture sur {:.1} cm² en regard ; le plus grand trou sans via fait Ø {:.1} mm, un pas de {s_eq:.1} mm ; tient des \
                 fronts jusqu'à {} ns (réglé sur le plus rapide de la carte : {vite})",
                vias.len(), s_si(vias.len()), aire / 100.0, 2.0 * d_max, fmt_g(tient * 1e9, 2))));
        }
    }
    Ok((out, obj! {"cavites" => cavites}))
}

// ==========================================================================
// 7. LE DÉCOUPLAGE
// --------------------------------------------------------------------------
// Chaque broche d'alimentation d'un circuit intégré doit trouver, tout près, un condensateur
// entre ce rail et la masse. « Tout près » se mesure sur le CHEMIN RÉEL : les pistes du rail
// de la broche au condensateur (plus court chemin, vias compris), à vol d'oiseau seulement
// quand le rail passe par un plan. Ce chemin se juge face à λ/40 au genou du front le plus
// rapide des signaux du circuit (λ/20 pour condamner). Et il donne une INDUCTANCE de boucle
// -- pistes (L' de leur section), vias (0,76 nH/mm), montage du boîtier (0402 : 0,5 nH…) --
// qui, avec la VALEUR du condensateur, fixe sa résonance : au-delà, un condensateur n'est
// plus qu'une self. Un condensateur qui résonne plus d'une décade sous le genou ne découple
// pas ce circuit (vigilance).
// ==========================================================================

fn re(motif: &str) -> Regex {
    Regex::new(motif).unwrap()
}
pub static RE_CI: LazyLock<Regex> = LazyLock::new(|| re(r"^(?i)(U|IC|VR|REG)\d"));
pub static RE_CAPA: LazyLock<Regex> = LazyLock::new(|| re(r"^(?i)C\d"));
pub static RE_CONNECTEUR: LazyLock<Regex> = LazyLock::new(|| re(r"^(?i)(J|P|CN|CONN|X)\d"));
static RE_FARADS: LazyLock<Regex> = LazyLock::new(|| re(r"(?i)([0-9]+(?:[.,][0-9]+)?)\s*([pnuµm])F?"));
static RE_MONTAGE_GROS: LazyLock<Regex> = LazyLock::new(|| re(r"(?i)radial|elec|tant"));
// Mêmes valeurs que SIM_PDN_L_MOUNT_BOITIER (commun/simulation-em.js).
pub const L_MONTAGE: [(&str, f64); 5] = [("0201", 0.35e-9), ("0402", 0.50e-9), ("0603", 0.75e-9), ("0805", 1.00e-9), ("1206", 1.30e-9)];
pub const L_MONTAGE_DEFAUT: f64 = 0.8e-9;
pub const L_VIA_PAR_MM: f64 = 0.76e-9;
pub const L_PISTE_PAR_MM: f64 = 1.0e-9; // sans empilage : la règle de pouce d'une piste fine
pub const ACCROCHE_MM: f64 = 0.6; // une broche touche une piste du rail à moins de ça

/// La valeur d'un condensateur en farads (« 100nF », « 0,1 µF », « 10p ») ; 0 si on ne sait
/// pas la lire. Même lecture que `simValeurFaradsIpc`.
pub fn _farads(txt: &Json) -> f64 {
    let t = str_ou_vide(txt);
    let Some(m) = RE_FARADS.captures(&t) else { return 0.0 };
    let v = py::float(&m[1].replace(',', ".")).unwrap_or(0.0);
    v * match m[2].to_lowercase().as_str() {
        "p" => 1e-12,
        "n" => 1e-9,
        "m" => 1e-3,
        _ => 1e-6, // u, µ, μ
    }
}

fn _l_montage(pkg: &Json) -> f64 {
    let p = str_ou_vide(pkg);
    L_MONTAGE.iter().find(|(m, _)| p.contains(m)).map(|(_, l)| *l).unwrap_or(if RE_MONTAGE_GROS.is_match(&p) { 2.50e-9 } else { L_MONTAGE_DEFAUT })
}

/// Un flottant ordonné, pour le tas de `chemin`.
#[derive(PartialEq, Clone, Copy)]
struct Ord64(f64);
impl Eq for Ord64 {}
impl PartialOrd for Ord64 {
    fn partial_cmp(&self, o: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(o))
    }
}
impl Ord for Ord64 {
    fn cmp(&self, o: &Self) -> std::cmp::Ordering {
        self.0.total_cmp(&o.0)
    }
}

/// Le graphe d'un net : ses nœuds (couche, x, y au pas de 20 µm), dans l'ordre où ils
/// apparaissent, et leurs arêtes (voisin, inductance en H, longueur en mm).
#[derive(Default)]
struct Graphe {
    noeuds: IndexMap<(String, i64, i64), Json>,
    adj: Vec<Vec<(usize, f64, f64)>>,
}

/// Le plus court chemin, en inductance, sur les pistes d'un net : nœuds (couche, x, y) au
/// pas de 20 µm, un segment de piste par arête (L' de sa section), et un via supposé partout
/// où deux couches ont un nœud au même point.
/// shortcut: un T posé au milieu d'un segment n'est pas un nœud (il faudrait couper le
/// segment) ; le plan du rail n'est pas maillé.
struct Chemins<'a> {
    couches: &'a [Json],
    resoudre: bool,
    rang: HashMap<String, usize>,
    par_net: HashMap<&'a str, Vec<&'a Troncon>>,
    lp: HashMap<(String, u64), f64>,
    graphes: HashMap<String, Graphe>,
}

impl<'a> Chemins<'a> {
    fn new(troncons: &'a [Troncon], couches: &'a [Json], resoudre: bool) -> Self {
        let mut par_net: HashMap<&str, Vec<&Troncon>> = HashMap::new();
        for t in troncons.iter().filter(|t| !t.n.is_empty()) {
            par_net.entry(&t.n).or_default().push(t);
        }
        Chemins { couches, resoudre, rang: _rangs(couches), par_net, lp: HashMap::new(), graphes: HashMap::new() }
    }

    fn _l_par_m(&mut self, c: &Json, w: f64) -> f64 {
        let cle_l = (cle(c), bits(round(w, 3)));
        if let Some(l) = self.lp.get(&cle_l) {
            return *l;
        }
        let mut l = L_PISTE_PAR_MM * 1e3;
        if let (true, Some(&i), true) = (self.resoudre, self.rang.get(&cle(c)), w > 0.0) {
            // une section impossible garde la règle de pouce (`except Exception: pass`)
            if let Ok(t) = ep_cuivre(self.couches, i) {
                let (geo, _) = se::section_de_couche(self.couches, i as i64, w, t, 0.0, None, &[], false);
                if let Some(r) = geo.and_then(|geo| tl::solve_line(&se::geometrie(&geo)).ok()) {
                    l = r.z0 * maxf(&[r.eps_eff, 1.0]).sqrt() / C0;
                }
            }
        }
        self.lp.insert(cle_l, l);
        l
    }

    fn _l_via(&self, c1: &Json, c2: &Json) -> R<f64> {
        let h = match (self.rang.get(&cle(c1)), self.rang.get(&cle(c2))) {
            (Some(&i), Some(&j)) => _ep(self.couches, i, j)?,
            _ => 1.6,
        };
        Ok(L_VIA_PAR_MM * maxf(&[h, 0.1]))
    }

    fn graphe(&mut self, n: &str) -> R<()> {
        if self.graphes.contains_key(n) {
            return Ok(());
        }
        let mut g = Graphe::default();
        let mut pos: IndexMap<(i64, i64), IndexSet<usize>> = IndexMap::new();
        let troncons = self.par_net.get(n).cloned().unwrap_or_default();
        for t in troncons {
            let noeud = |g: &mut Graphe, x: f64, y: f64| {
                let k = (cle(&t.c), round0(x / 0.02), round0(y / 0.02));
                let i = g.noeuds.insert_full(k.clone(), t.c.clone()).0;
                if i == g.adj.len() {
                    g.adj.push(Vec::new());
                }
                (i, (k.1, k.2))
            };
            let (a, pa) = noeud(&mut g, t.x1, t.y1);
            let (b, pb) = noeud(&mut g, t.x2, t.y2);
            let long = t.longueur();
            let l = self._l_par_m(&t.c, t.w) * long * 1e-3;
            g.adj[a].push((b, l, long));
            g.adj[b].push((a, l, long));
            pos.entry(pa).or_default().insert(a);
            pos.entry(pb).or_default().insert(b);
        }
        for noeuds in pos.values() {
            for &a in noeuds {
                for &b in noeuds {
                    if a != b {
                        let l = self._l_via(&g.noeuds[a], &g.noeuds[b])?;
                        g.adj[a].push((b, l, 0.0));
                    }
                }
            }
        }
        self.graphes.insert(n.to_string(), g);
        Ok(())
    }

    /// Les nœuds du net à moins de ACCROCHE_MM de (x, y), et l'inductance de via pour les
    /// rejoindre depuis la couche `c` de la broche.
    fn accroches(&mut self, n: &str, x: f64, y: f64, c: &Json) -> R<Vec<(usize, f64)>> {
        self.graphe(n)?;
        let mut out = Vec::new();
        for (i, (k, kc)) in self.graphes[n].noeuds.iter().enumerate() {
            if hyp(k.1 as f64 * 0.02 - x, k.2 as f64 * 0.02 - y) <= ACCROCHE_MM {
                out.push((i, if k.0 == cle(c) { 0.0 } else { self._l_via(c, kc)? }));
            }
        }
        Ok(out)
    }

    /// (inductance en H, longueur en mm, index de l'arrivée atteinte) du plus court chemin de
    /// `depart` vers l'une des `arrivees` -- chacune une liste d'accroches --, ou None.
    fn chemin(&mut self, n: &str, depart: &[(usize, f64)], arrivees: &[Vec<(usize, f64)>]) -> R<Option<(f64, f64, usize)>> {
        use std::cmp::Reverse;
        self.graphe(n)?;
        let adj = &self.graphes[n].adj;
        let mut cible: HashMap<usize, (f64, usize)> = HashMap::new();
        for (idx, acc) in arrivees.iter().enumerate() {
            for &(k, l) in acc {
                if cible.get(&k).is_none_or(|c| l < c.0) {
                    cible.insert(k, (l, idx));
                }
            }
        }
        let mut vus: HashSet<usize> = HashSet::new();
        // (à inductance et longueur égales, Python départageait par la clé du nœud ; ici par
        // son rang d'apparition)
        let mut tas: std::collections::BinaryHeap<Reverse<(Ord64, Ord64, usize)>> = depart.iter().map(|(k, l)| Reverse((Ord64(*l), Ord64(0.0), *k))).collect();
        let mut meilleur: Option<(f64, f64, usize)> = None;
        while let Some(Reverse((Ord64(l), Ord64(long), k))) = tas.pop() {
            if !vus.insert(k) {
                continue;
            }
            if let Some(c) = cible.get(&k) {
                let tot = l + c.0;
                if meilleur.is_none_or(|m| tot < m.0) {
                    meilleur = Some((tot, long, c.1));
                }
            }
            if meilleur.is_some_and(|m| l > m.0) {
                break;
            }
            for &(b, dl, d_long) in &adj[k] {
                if !vus.contains(&b) {
                    tas.push(Reverse((Ord64(l + dl), Ord64(long + d_long), b)));
                }
            }
        }
        Ok(meilleur)
    }
}

struct Capa {
    x: f64,
    y: f64,
    repere: String,
    c: Json,
    farads: f64,
    lm: f64,
    val: Json,
}

/// Les broches d'un composant et leur net.
fn broches(cp: &Json) -> R<Vec<(&Json, String)>> {
    els(&cp["broches"]).iter().map(|b| Ok((dict(b)?, str_ou_vide(&b["n"])))).collect()
}

/// `resoudre` : l'empilage est là, L' des pistes sort de leur section (le `se` de Python).
pub fn decouplages(k: &Carte, notes: &mut Vec<String>, resoudre: bool) -> Regle {
    let (doc, couches, reg, unite) = (k.doc, k.couches, k.reg, k.unite);
    let comps: Vec<&Json> = doc.liste("composants").iter().filter(|c| c.as_objet().is_some()).collect();
    if comps.is_empty() {
        notes.push("Pas de composants dans le document : découplage non vérifié.".into());
        return Ok((Vec::new(), obj! {}));
    }
    let mut ers = Vec::new();
    for c in couches {
        if c["type"].as_str() == Some("dielectric") {
            let e = fl_ou(&c["epsilon_r"], 0.0)?;
            if e > 0.0 {
                ers.push(e);
            }
        }
    }
    let er = if ers.is_empty() { 4.3 } else { py::sum(ers.iter().copied()) / ers.len() as f64 };
    let mut chemins = Chemins::new(k.troncons, couches, resoudre);
    let mut caps: HashMap<String, Vec<Capa>> = HashMap::new();
    let mut vers_masse: HashSet<String> = HashSet::new();
    for cp in &comps {
        let repere = str_ou_vide(&cp["ref"]);
        let br = broches(cp)?;
        if RE_CAPA.is_match(&repere) && br.len() <= 3 && br.iter().any(|(_, n)| doc.classe(n) == "Masse") {
            for (b, n) in &br {
                if !n.is_empty() && doc.classe(n) == "Alimentation" {
                    caps.entry(n.clone()).or_default().push(Capa {
                        x: flr(b, "x")? * unite, y: flr(b, "y")? * unite, repere: repere.clone(), c: str_ou_vide(&cp["c"]).j(),
                        farads: _farads(&cp["val"]), lm: _l_montage(&cp["pkg"]), val: cp["val"].clone() });
                } else if !n.is_empty() && !sans_net(n) {
                    vers_masse.insert(n.clone());
                }
            }
        }
    }
    // UN RAIL AU NOM AUTOMATIQUE (SIGN00358) SORT SOUVENT « ANALOGIQUE » : ses broches
    // échappent alors à la règle. On ne le reclasse pas -- on le montre.
    let mut suspects = Vec::new();
    let mut out = Vec::new();
    let (mut circuits, mut n_broches, mut chemins_routes) = (0usize, 0usize, 0usize);
    for cp in &comps {
        let repere = str_ou_vide(&cp["ref"]);
        let br = broches(cp)?;
        if !(RE_CI.is_match(&repere) || (br.len() >= 8 && !RE_CONNECTEUR.is_match(&repere) && !RE_CAPA.is_match(&repere))) {
            continue;
        }
        let mut alims: std::collections::BTreeMap<String, Vec<&Json>> = Default::default();
        let mut signaux: BTreeSet<String> = BTreeSet::new();
        for (b, n) in &br {
            if !n.is_empty() && doc.classe(n) == "Alimentation" {
                alims.entry(n.clone()).or_default().push(b);
            } else if doc.signal(n) {
                signaux.insert(n.clone());
                if vers_masse.contains(n) && ["Analogique", "Lent"].contains(&xt::famille(&doc.classe(n))) {
                    suspects.push(format!("{repere}.{} ({n})", b.get("pin").map_or("?".into(), str_py)));
                }
            }
        }
        if alims.is_empty() {
            continue;
        }
        circuits += 1;
        // (Python cherchait le plus vif dans un `set`, à l'ordre changeant ; ici trié)
        let (nv, vite) = _plus_vite(reg, doc, &signaux.into_iter().collect::<Vec<_>>());
        let c_ci = str_ou_vide(&cp["c"]).j();
        for (n, pins) in &alims {
            n_broches += pins.len();
            let constat = |severite: &str, frequences: Vec<Json>, b: &Json, msg: String| -> R<Json> {
                Ok(obj! {"regle" => "decouplage", "c" => &c_ci, "n" => n, "severite" => severite, "frequences" => frequences,
                         "x" => flr(b, "x")?, "y" => flr(b, "y")?, "msg" => msg})
            };
            let Some(caps_n) = caps.get(n).filter(|c| !c.is_empty()) else {
                out.push(constat("critique", vec![], pins[0], format!(
                    "{repere} : {} broche{} sur ce rail et aucun condensateur entre {n} et la masse sur la carte. Si c'est une sortie de \
                     {repere} qui alimente une autre puce, classer ce net en signal", pins.len(), s_si(pins.len())))?);
                continue;
            };
            let mut arrivees = Vec::new();
            for q in caps_n {
                arrivees.push(chemins.accroches(n, q.x, q.y, &q.c)?);
            }
            // (longueur, broche, condensateur, vol d'oiseau, inductance, routé ?)
            let mut pires: Vec<(f64, &Json, &Capa, f64, f64, bool)> = Vec::new();
            for b in pins {
                let (bx, by) = (flr(b, "x")? * unite, flr(b, "y")? * unite);
                let vol: Vec<f64> = caps_n.iter().map(|q| hyp(bx - q.x, by - q.y)).collect();
                let depart = chemins.accroches(n, bx, by, &c_ci)?;
                let (long_, l_ch, idx, route) = match chemins.chemin(n, &depart, &arrivees)? {
                    Some((l_ch, long_, idx)) => (long_, l_ch, idx, true),
                    None => {
                        // par le plan : la plus proche à vol d'oiseau
                        let idx = (0..vol.len()).fold(0, |m, q| if vol[q] < vol[m] { q } else { m });
                        (vol[idx], 0.0, idx, false)
                    }
                };
                let q = &caps_n[idx];
                pires.push((long_, b, q, vol[idx], l_ch + q.lm, route));
            }
            let &(long_, b, q, vol, l_b, route) = premier_max(&pires, |t| t.0).unwrap();
            chemins_routes += route as usize;
            let f_res = if q.farads > 0.0 { Some(1.0 / (2.0 * PI * (l_b * q.farads).sqrt())) } else { None };
            // LES AUTRES CONDENSATEURS DU RAIL autour de cette broche : un 10 µF tout près et
            // un 100 nF à côté, c'est le 100 nF qui découple le haut du spectre. Leur boucle,
            // comme celle du condensateur choisi : le montage, plus la piste à vol d'oiseau
            // quand le rail est routé.
            let (bx, by) = (flr(b, "x")? * unite, flr(b, "y")? * unite);
            let autour: Vec<(f64, f64)> = caps_n.iter().filter(|x| x.farads > 0.0).map(|x| {
                let dq = hyp(bx - x.x, by - x.y);
                let lq = x.lm + if route { L_PISTE_PAR_MM * dq } else { 0.0 };
                (dq, 1.0 / (2.0 * PI * (lq * x.farads).sqrt()))
            }).collect();
            let freqs = _par_frequence(reg, &vite, nv.as_deref(), |f_eval, _tr| {
                let r40 = C0 / (f_eval * er.sqrt()) / 40.0 * 1e3;
                let r = long_ / r40;
                let mut v = _ratio(r);
                let mut extra = obj! {};
                if let Some(f_res) = f_res.filter(|f| *f != 0.0) {
                    poser(&mut extra, "f_res", round0(f_res));
                    let mut hauts: Vec<f64> = autour.iter().filter(|(dq, _)| *dq <= maxf(&[r40, long_])).map(|(_, f)| *f).collect();
                    hauts.push(f_res);
                    if maxf(&hauts) < f_eval / 10.0 && v == "ok" {
                        v = "vigilance";
                    }
                }
                Ok((r, v, extra))
            })?;
            let sev = _pire(verdicts(&freqs));
            if sev == "ok" {
                continue;
            }
            let tient = 0.35 * 40.0 * long_ * 1e-3 * er.sqrt() / C0;
            let quoi = if route {
                format!("{} à {long_:.1} mm par la piste ({vol:.1} à vol d'oiseau)", q.repere)
            } else {
                format!("{} à {long_:.1} mm à vol d'oiseau (par le plan)", q.repere)
            };
            let res = match f_res {
                Some(f_res) => format!(" ; {}, boucle {:.1} nH : résonance à {}", str_py(&q.val), l_b * 1e9, _hz(f_res)),
                None => format!(" ; boucle {:.1} nH (valeur illisible : « {} »)", l_b * 1e9, str_ou_vide(&q.val)),
            };
            out.push(constat(sev, freqs, b, format!(
                "{repere} : {} broche{} sur ce rail ; la plus mal servie ({}) a {quoi}{res} ; signaux {vite} ; la distance tient des fronts \
                 jusqu'à {} ns", pins.len(), s_si(pins.len()), if b["pin"].vrai() { str_py(&b["pin"]) } else { "?".into() }, fmt_g(tient * 1e9, 2)))?);
        }
    }
    let mut bilan = obj! {"circuits" => circuits, "broches" => n_broches, "chemins_routes" => chemins_routes};
    if !suspects.is_empty() {
        notes.push(format!("Broches de circuit reliées à la masse par un condensateur mais pas classées Alimentation, donc non jugées en \
                            découplage — des rails à reclasser ? {}{}",
                           suspects.iter().take(12).cloned().collect::<Vec<_>>().join(", "), if suspects.len() > 12 { " …" } else { "" }));
        poser(&mut bilan, "rails_suspects", suspects.len());
    }
    Ok((out, bilan))
}

// ==========================================================================
// 8. LE BORD DE LA CARTE
// --------------------------------------------------------------------------
// Deux raisons de s'en écarter. La fabrication : le détourage met à nu le cuivre trop proche
// (0,25 mm critique, 0,5 mm vigilance ; tous nets). La CEM : le champ d'une piste déborde de
// ~5 h de son axe ; près du bord, il déborde du plan de référence et rayonne. On cumule par
// net la longueur qui court à moins de max(1 mm, 5 h) du bord, jugée face à λ/20 au genou
// (λ/10 pour condamner). Et la règle des 20 H : un plan d'alimentation se tient en retrait
// de 20 fois son écart à la masse sur le bord de celle-ci (info : la règle se discute, elle
// vaut surtout au-delà du GHz).
// ==========================================================================

pub const BORD_CRITIQUE_MM: f64 = 0.25;
pub const BORD_VIGILANCE_MM: f64 = 0.5;
pub const BORD_H: f64 = 5.0;
pub const PAS_BORD_MM: f64 = 0.1;

pub fn bords(k: &Carte, notes: &mut Vec<String>) -> Regle {
    let (doc, couches, reg, unite) = (k.doc, k.couches, k.reg, k.unite);
    let ct = &doc.d["contour"];
    let mut anneaux = Vec::new();
    for a in std::iter::once(&ct["o"]).chain(els(&ct["t"])) {
        if a.vrai() && dc_solver::pyth::len_py(a)? >= 6 {
            anneaux.push(anneau(a, unite)?);
        }
    }
    if anneaux.is_empty() {
        notes.push("Pas de contour de carte dans le document : distance au bord non vérifiée.".into());
        return Ok((Vec::new(), obj! {}));
    }
    let mut aretes: Vec<(f64, f64, f64, f64)> = Vec::new();
    for o in &anneaux {
        let pts: Vec<(f64, f64)> = o.chunks_exact(2).map(|p| (p[0], p[1])).collect();
        for q in 0..pts.len() {
            let (a, b) = (pts[q], pts[(q + 1) % pts.len()]);
            aretes.push((a.0, a.1, b.0, b.1));
        }
    }
    let mut grille: HashMap<(i64, i64), BTreeSet<usize>> = HashMap::new();
    for (e, &(x1, y1, x2, y2)) in aretes.iter().enumerate() {
        let m = ((hyp(x2 - x1, y2 - y1) / (CASE_MM / 2.0)) as usize).max(1);
        for q in 0..=m {
            let f = q as f64;
            grille.entry((((x1 + (x2 - x1) * f / m as f64) / CASE_MM).floor() as i64, ((y1 + (y2 - y1) * f / m as f64) / CASE_MM).floor() as i64))
                .or_default().insert(e);
        }
    }
    let rang = _rangs(couches);
    let mut hauteurs: HashMap<usize, f64> = HashMap::new();

    // (net, couche) -> (cuivre au bord, x, y)
    let mut fab: IndexMap<(&str, String), (f64, f64, f64, &Json)> = IndexMap::new();
    // net -> (longueur, au plus près, x, y, couche, limite, rang)
    let mut cem: IndexMap<&str, (f64, f64, f64, f64, &Json, f64, usize)> = IndexMap::new();
    for t in k.troncons {
        if t.n.is_empty() || sans_net(&t.n) {
            continue;
        }
        let i = rang.get(&cle(&t.c)).copied();
        let vite = doc.signal(&t.n) || doc.classe(&t.n) == "Découpage";
        let lim_cem = match i {
            Some(i) if vite => {
                let h = match hauteurs.get(&i) {
                    Some(h) => *h,
                    None => {
                        let h = se::_hauteur_de_couche(couches, i as i64, 0.2, ep_cuivre(couches, i)?, &[], false, false);
                        hauteurs.insert(i, h);
                        h
                    }
                };
                maxf(&[1.0, BORD_H * h])
            }
            _ => 0.0,
        };
        let lim = maxf(&[BORD_VIGILANCE_MM + t.w / 2.0, lim_cem]);
        let mut ids: BTreeSet<usize> = BTreeSet::new();
        for c in _cases(CASE_MM, t.x1, t.y1, t.x2, t.y2, lim)? {
            ids.extend(grille.get(&c).into_iter().flatten());
        }
        if ids.is_empty() {
            continue;
        }
        let l = t.longueur();
        // np.linspace(0, 1, n) : k × pas, le dernier posé à 1
        let n = ((l / PAS_BORD_MM) as usize + 1).max(2);
        let pas_t = 1.0 / (n - 1) as f64;
        let pts: Vec<(f64, f64)> = (0..n).map(|q| {
            let f = if q == n - 1 { 1.0 } else { q as f64 * pas_t };
            (t.x1 + (t.x2 - t.x1) * f, t.y1 + (t.y2 - t.y1) * f)
        }).collect();
        // la distance de chaque point au plus proche des segments retenus
        let d: Vec<f64> = pts.iter().map(|&(px, py)| {
            minf(&ids.iter().map(|e| {
                let (x1, y1, x2, y2) = aretes[*e];
                let (dx, dy) = (x2 - x1, y2 - y1);
                let l2 = (dx * dx + dy * dy).max(1e-12);
                let f = (((px - x1) * dx + (py - y1) * dy) / l2).clamp(0.0, 1.0);
                (px - (x1 + f * dx)).hypot(py - (y1 + f * dy))
            }).collect::<Vec<_>>())
        }).collect();
        let q = (0..d.len()).fold(0, |m, q| if d[q] < d[m] { q } else { m });
        let cu = d[q] - t.w / 2.0;
        let cle_f = (t.n.as_str(), cle(&t.c));
        if cu < BORD_VIGILANCE_MM && cu < fab.get(&cle_f).map_or(9e9, |f| f.0) {
            fab.insert(cle_f, (cu, pts[q].0, pts[q].1, &t.c));
        }
        if lim_cem != 0.0 {
            let proches = d.iter().filter(|x| **x < lim_cem).count();
            if proches > 0 {
                let v = cem.entry(&t.n).or_insert((0.0, 9e9, 0.0, 0.0, &t.c, lim_cem, i.unwrap_or(0)));
                v.0 += l * (proches as f64 / d.len() as f64);
                if d[q] < v.1 {
                    *v = (v.0, d[q], pts[q].0, pts[q].1, &t.c, lim_cem, i.unwrap_or(0));
                }
            }
        }
    }
    let mut out = Vec::new();
    for ((n, _), (cu, x, y, c)) in &fab {
        out.push(obj! {"regle" => "bord", "severite" => if *cu < BORD_CRITIQUE_MM { "critique" } else { "vigilance" },
                       "frequences" => Vec::<Json>::new(), "x" => x / unite, "y" => y / unite, "c" => *c, "n" => *n,
                       "msg" => format!("Cuivre à {:.2} mm du bord de carte : le détourage peut le mettre à nu (0,25 à 0,5 mm selon le fabricant)",
                                        maxf(&[*cu, 0.0]))});
    }
    for (n, &(l, dmin, x, y, c, lim, i)) in &cem {
        let er = _er_entre(couches, i.saturating_sub(1), (i + 1).min(couches.len() - 1))?;
        let freqs = _par_frequence(reg, &doc.classe(n), Some(n), |f_eval, _tr| {
            let r = l / (C0 / (f_eval * er.sqrt()) / 20.0 * 1e3);
            Ok((r, _ratio(r), Json::Nul))
        })?;
        let sev = _pire(verdicts(&freqs));
        if sev != "ok" {
            out.push(obj! {"regle" => "bord", "severite" => sev, "frequences" => freqs, "x" => x / unite, "y" => y / unite, "c" => c, "n" => *n,
                           "msg" => format!("{l:.1} mm de piste à moins de {lim:.1} mm du bord (au plus près {dmin:.2} mm) : le champ déborde \
                                             du plan de référence et rayonne")});
        }
    }
    if let Some(surf) = k.surf {
        out.extend(_vingt_h(k, surf)?);
    }
    Ok((out, obj! {"pistes_pres_du_bord" => fab.len() + cem.len()}))
}

fn _vingt_h(k: &Carte, surf: &Surfaces) -> R<Vec<Json>> {
    let (doc, couches, unite) = (k.doc, k.couches, k.unite);
    let mut out = Vec::new();
    let cu = cuivres(couches);
    for &i in &cu {
        let pn = str_ou_vide(&couches[i]["net"]);
        if !est_plan(couches, i) || doc.classe(&pn) != "Alimentation" {
            continue;
        }
        let masses: Vec<usize> = cu.iter().copied().filter(|j| *j != i && est_plan(couches, *j) && doc.classe(&str_ou_vide(&couches[*j]["net"])) == "Masse").collect();
        let Some(&j) = premier_min(&masses, |j| (*j as f64 - i as f64).abs()) else { continue };
        let gn = str_ou_vide(&couches[j]["net"]);
        let (ni, nj) = (&couches[i]["name"], &couches[j]["name"]);
        let (Some(img_i), Some(img_j), Some(&id_p), Some(&id_g)) = (surf.image(ni), surf.image(nj), surf.ids.get(&pn), surf.ids.get(&gn)) else { continue };
        let pwr: Vec<bool> = img_i.iter().map(|x| *x == id_p).collect();
        let gnd = boucher_trous(&img_j.iter().map(|x| *x == id_g).collect::<Vec<_>>(), surf.h, surf.w);
        if !pwr.contains(&true) || !gnd.contains(&true) {
            continue;
        }
        let retrait = 20.0 * _ep(couches, i, j)?;
        let dist: Vec<f64> = distance_edt(&gnd, surf.h, surf.w).into_iter().map(|d| d * surf.pas).collect();
        let viol: Vec<bool> = (0..pwr.len()).map(|q| pwr[q] && dist[q] < retrait).collect();
        let n_viol = viol.iter().filter(|x| **x).count();
        if n_viol == 0 {
            continue;
        }
        let q = (0..dist.len()).filter(|q| viol[*q]).fold(usize::MAX, |m, q| if m == usize::MAX || dist[q] < dist[m] { q } else { m });
        let (x, y) = surf.point((q / surf.w) as f64, (q % surf.w) as f64);
        out.push(obj! {"regle" => "bord", "severite" => "info", "frequences" => Vec::<Json>::new(), "x" => x / unite, "y" => y / unite,
                       "c" => format!("{} ↔ {}", str_py(ni), str_py(nj)), "n" => &pn,
                       "msg" => format!("Règle des 20 H : le plan {pn} s'approche à {:.2} mm du bord de la masse {gn} (retrait conseillé \
                                         {retrait:.1} mm) sur {:.0} % de sa surface", dist[q],
                                        100.0 * n_viol as f64 / pwr.iter().filter(|x| **x).count() as f64)});
    }
    Ok(out)
}

// ==========================================================================
// 9. LES PAIRES DIFFÉRENTIELLES
// --------------------------------------------------------------------------
// Le long de la paire : les morceaux couplés (P face à N, même couche, à moins de 5 h) et
// leur Z_diff résolue par la méthode des moments à l'écart réel ; les morceaux découplés, qui
// valent deux lignes seules (2 Z₀). Chaque morceau réfléchit |Z - Z_cible| / (Z + Z_cible),
// pondéré par 2T_d / t_r comme une discontinuité courte. L'écart de longueur, en temps, se
// compare au front : il convertit le différentiel en mode commun (10 % du front en
// vigilance, 20 % critique). Des vias en nombre différent sur P et N dissymétrisent la
// paire. La masse coplanaire qui borde la paire, mesurée dans le cuivre de la couche du côté
// extérieur de chaque moitié, entre dans Z_diff. Et le plan de référence doit passer sous
// LES DEUX moitiés : là où une seule le voit, la paire se déséquilibre et convertit en mode
// commun -- jugé en temps face au front, comme l'écart de longueur.
// ==========================================================================

pub fn paires_diff(k: &Carte) -> Regle {
    let (doc, couches, reg, unite, surf) = (k.doc, k.couches, k.reg, k.unite, k.surf);
    let mut paires = Vec::new();
    for pr in doc.liste("paires") {
        if dc_solver::pyth::len_py(pr)? == 2 {
            paires.push((str_py(&pr[0]), str_py(&pr[1])));
        }
    }
    if paires.is_empty() {
        return Ok((Vec::new(), obj! {}));
    }
    let rang = _rangs(couches);
    let mut par: IndexMap<(&str, usize), Vec<Seg>> = IndexMap::new();
    let mut longueur: HashMap<&str, f64> = HashMap::new();
    let mut plus_long: HashMap<&str, (f64, f64, f64, &Json)> = HashMap::new();
    for t in k.troncons {
        let l = t.longueur();
        *longueur.entry(&t.n).or_insert(0.0) += l;
        if l > plus_long.get(t.n.as_str()).map_or(0.0, |p| p.0) {
            plus_long.insert(&t.n, (l, (t.x1 + t.x2) / 2.0, (t.y1 + t.y2) / 2.0, &t.c));
        }
        if let Some(&i) = rang.get(&cle(&t.c)) {
            par.entry((&t.n, i)).or_default().push(seg(t));
        }
    }
    let mut vias: HashMap<String, usize> = HashMap::new();
    for t in doc.liste("percages") {
        *vias.entry(str_ou_vide(&dict(t)?["n"])).or_insert(0) += 1;
    }
    // (Z, vitesse) par section résolue
    let mut cache: HashMap<Vec<u64>, Option<(f64, f64)>> = HashMap::new();

    // Pour chaque plan de référence de la couche i : du cuivre en (x, y) ?
    let plan_sous = |i: usize, x: f64, y: f64| -> Vec<bool> {
        let Some(surf) = surf else { return Vec::new() };
        _plans_voisins(couches, i).into_iter().filter_map(|p| surf.image(&couches[p]["name"])).map(|img| surf.lire_img(img, x, y) != 0).collect()
    };
    // La longueur, en mm, où le plan ne passe que sous une des deux moitiés.
    let desequilibre = |i: usize, a: &Seg, b: &Seg, lg: &(f64, f64, (f64, f64))| -> f64 {
        let Some(surf) = surf else { return 0.0 };
        let l = long_seg(a);
        let (ux, uy) = ((a.3 - a.1) / l, (a.4 - a.2) / l);
        let (mx, my) = lg.2;
        // décalage de `a` vers `b`, le long de la normale
        let dn = (b.1 - mx) * (-uy) + (b.2 - my) * ux;
        let m = ((lg.0 / maxf(&[surf.pas, 0.05])) as usize).max(2);
        let mut rate = 0;
        for q in 0..m {
            let s_ = (q as f64 + 0.5) / m as f64 - 0.5;
            let (px, py) = (mx + ux * s_ * lg.0, my + uy * s_ * lg.0);
            if plan_sous(i, px, py) != plan_sous(i, px - uy * dn, py + ux * dn) {
                rate += 1;
            }
        }
        lg.0 * rate as f64 / m as f64
    };

    let (mut out, mut n_paires) = (Vec::new(), 0usize);
    for (p, q) in &paires {
        let long = |n: &String| longueur.get(n.as_str()).copied().unwrap_or(0.0);
        if !(long(p) != 0.0 && long(q) != 0.0) {
            continue;
        }
        // un brin reclassé à la main, l'autre resté Lent : la cible est celle de
        // l'interface, quel que soit l'ordre de la paire
        let zdc = &reg["zdiff_classes"];
        let zt = [doc.classe(p), doc.classe(q)].iter().find_map(|c| zdc.get(c)).and_then(Json::as_f64).unwrap_or_else(|| num(reg, "zdiff"));
        n_paires += 1;
        // (Z, L, v, couplé ?)
        let mut pieces: Vec<(f64, f64, f64, bool)> = Vec::new();
        let (mut couple, mut bancal) = (0.0, 0.0);
        let rangs: BTreeSet<usize> = par.keys().filter(|(n, _)| *n == p || *n == q).map(|(_, i)| *i).collect();
        for i in rangs {
            let ep = ep_cuivre(couches, i)?;
            let h = se::_hauteur_de_couche(couches, i as i64, 0.2, ep, &[], false, false);
            let smax = if h > 0.0 { 5.0 * h } else { 1.0 };
            let vide = Vec::new();
            for (moi, lui) in [(p, q), (q, p)] {
                for a in par.get(&(moi.as_str(), i)).unwrap_or(&vide) {
                    let (la, mut cov) = (long_seg(a), 0.0);
                    for b in par.get(&(lui.as_str(), i)).unwrap_or(&vide) {
                        let Some(lg) = face(a, b) else { continue };
                        if lg.0 < 0.01 || !(0.0 < lg.1 && lg.1 <= smax) {
                            continue;
                        }
                        cov += lg.0;
                        if moi != p {
                            continue;
                        }
                        let c_nom = &couches[i]["name"];
                        let (eg, ed) = (_ecart_exterieur(k, c_nom, a, b), _ecart_exterieur(k, c_nom, b, a));
                        let cle_c = vec![0, i as u64, bits(round(a.5, 3)), bits(round(b.5, 3)), bits(round(lg.1, 2)), bits(eg), bits(ed)];
                        let r = *cache.entry(cle_c).or_insert_with(|| {
                            let (geo, _) = se::section_de_couche(couches, i as i64, a.5, ep, eg, Some(ed), &[], false);
                            let mut geo = geo?;
                            poser(&mut geo, "conducteurs", vec![obj! {"w" => a.5 * 1e-3, "x" => 0.0, "masse" => false},
                                                                obj! {"w" => b.5 * 1e-3, "x" => ((a.5 + b.5) / 2.0 + lg.1) * 1e-3, "masse" => false}]);
                            let r = tl::solve_multiline(&se::geometrie(&geo)).ok()?;
                            let pr = match r.paire {
                                Some(pr) => pr,
                                None => tl::modes_paire(&r.c, &r.l).ok()?,
                            };
                            Some((pr.z_diff, C0 / maxf(&[pr.eps_eff_impair, 1.0]).sqrt()))
                        });
                        if let Some(r) = r {
                            pieces.push((r.0, lg.0, r.1, true));
                            couple += lg.0;
                        }
                        bancal += desequilibre(i, a, b, &lg);
                    }
                    if la - minf(&[cov, la]) > 0.01 {
                        let r = *cache.entry(vec![1, i as u64, bits(round(a.5, 3))]).or_insert_with(|| {
                            let (geo, _) = se::section_de_couche(couches, i as i64, a.5, ep, 0.0, Some(0.0), &[], false);
                            let r = tl::solve_line(&se::geometrie(&geo?)).ok()?;
                            Some((2.0 * r.z0, C0 / maxf(&[r.eps_eff, 1.0]).sqrt()))
                        });
                        if let Some(r) = r {
                            pieces.push((r.0, la - minf(&[cov, la]), r.1, false));
                        }
                    }
                }
            }
        }
        if pieces.is_empty() {
            continue;
        }
        let v_ref = premier_max(&pieces, |x| x.1).unwrap().2;
        let dl = (long(p) - long(q)).abs();
        let dt = dl * 1e-3 / v_ref;
        let (nv, vite) = _plus_vite(reg, doc, &[p.clone(), q.clone()]);
        let db = bancal * 1e-3 / v_ref;
        let freqs = _par_frequence(reg, &vite, nv.as_deref(), |_f_eval, tr| {
            let g = maxf(&pieces.iter().map(|(z, l, v, _)| (z - zt).abs() / (z + zt) * minf(&[1.0, 2.0 * l * 1e-3 / v / tr])).collect::<Vec<_>>());
            let (sk, mc) = (dt / tr, db / tr);
            Ok((g, _pire([_gamma(g), _dixieme(sk), _dixieme(mc)]), obj! {"skew" => round(sk, 4), "plan_bancal" => round(mc, 4)}))
        })?;
        let mut sev = _pire(verdicts(&freqs));
        let nvias = (vias.get(p).copied().unwrap_or(0), vias.get(q).copied().unwrap_or(0));
        if nvias.0 != nvias.1 && sev == "ok" {
            sev = "vigilance";
        }
        if sev == "ok" {
            continue;
        }
        let mut zc: Vec<f64> = pieces.iter().filter(|x| x.3).map(|x| x.0).collect();
        zc.sort_by(f64::total_cmp);
        let (_, x, y, c) = plus_long[p.as_str()];
        let zdiff = match (zc.first(), zc.last()) {
            (Some(a), Some(b)) if b - a >= 0.5 => format!("{a:.0}–{b:.0} Ω"),
            (Some(a), _) => format!("{a:.0} Ω"),
            _ => "jamais couplée".into(),
        };
        out.push(obj! {"regle" => "paire", "severite" => sev, "frequences" => freqs, "x" => x / unite, "y" => y / unite, "c" => c, "n" => p,
                       "msg" => format!("Paire {p} / {q} : Z_diff {zdiff} (cible {zt:.0} Ω), {couple:.1} mm couplés sur {:.1}, écart de longueur \
                                         {dl:.2} mm ({:.0} ps){}{}", maxf(&[long(p), long(q)]), dt * 1e12,
                                        if nvias.0 != nvias.1 { format!(" ; {} via(s) sur {p} contre {} sur {q}", nvias.0, nvias.1) } else { String::new() },
                                        if bancal >= 0.1 { format!(" ; plan de référence sous une seule moitié sur {bancal:.1} mm") } else { String::new() })});
    }
    Ok((out, obj! {"paires" => n_paires}))
}
