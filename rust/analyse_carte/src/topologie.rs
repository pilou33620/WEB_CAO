//! Les bouts de piste orphelins, les moignons de vias, les branches en T, les quartz, la
//! protection ESD et le courant face à la largeur.

use crate::angles::{Noeud, Noeuds, _accrocher};
use crate::base::*;
use crate::commun::*;
use crate::regles::{Carte, Regle, RE_CONNECTEUR};
use regex::Regex;
use std::sync::LazyLock;

// ==========================================================================
// BOUTS DE PISTE ORPHELINS
// --------------------------------------------------------------------------
// Un bout de piste qui ne touche rien -- ni pastille, ni via, ni une autre piste du net, ni
// le versement de son net -- est un bout libre. On remonte la piste jusqu'à ce qui la
// retient : une pastille (la piste est une antenne), un embranchement (un moignon ; un
// dépassement s'il est court), ou rien (une piste isolée, reliée à rien). Ce qui retient
// peut tomber au milieu d'un segment : le T d'une autre piste posé sur son corps, une
// pastille qu'il traverse, le versement du net où il entre. Sur un net de signal, le bout se
// juge aussi à la cadence de sa classe : un moignon réfléchit dès que son aller-retour 2T_d
// dépasse 10 % du front (20 % : critique).
// ==========================================================================

pub const DEPASSEMENT_MM: f64 = 0.5;

pub fn orphelins(k: &Carte) -> Regle {
    let (doc, couches, reg, unite, surf) = (k.doc, k.couches, k.reg, k.unite, k.surf);
    let eps = EPS_MM;
    let mut noeuds: Noeuds<usize> = IndexMap::new();
    // (tronçon, nœud de départ, nœud d'arrivée)
    let mut segs: Vec<(&Troncon, usize, usize)> = Vec::new();
    for t in k.troncons {
        if t.n.is_empty() || sans_net(&t.n) {
            continue;
        }
        let n = t.n.as_str().j();
        let a = _accrocher(&mut noeuds, &t.c, &n, (t.x1, &Json::Nul), (t.y1, &Json::Nul), eps);
        let b = _accrocher(&mut noeuds, &t.c, &n, (t.x2, &Json::Nul), (t.y2, &Json::Nul), eps);
        if a != b {
            noeuds[a].attaches.push(segs.len());
            noeuds[b].attaches.push(segs.len());
            segs.push((t, a, b));
        }
    }
    if segs.is_empty() {
        return Ok((Vec::new(), obj! {}));
    }
    // Une pastille couvre ici jusqu'à sa demi-longueur R : une piste qui s'arrête au bout
    // d'une pastille rectangulaire, hors de son cercle inscrit, y est quand même reliée.
    let mut couvert: HashMap<(i64, i64), Vec<(f64, f64, f64, &Json)>> = HashMap::new();
    for t in doc.liste("pastilles") {
        let t = dict(t)?;
        let (x, y) = (flr(t, "x")? * unite, flr(t, "y")? * unite);
        let r = maxf(&[fl_ou(ou(&t["R"], &t["r"]), 0.0)? * unite, eps]);
        for c in _cases(CASE_MM, x, y, x, y, r)? {
            couvert.entry(c).or_default().push((x, y, r, &t["c"]));
        }
    }
    let mut grille: HashMap<(String, &str, i64, i64), Vec<usize>> = HashMap::new();
    for (q, (s, _, _)) in segs.iter().enumerate() {
        for c in _cases(CASE_MM, s.x1, s.y1, s.x2, s.y2, s.w / 2.0)? {
            grille.entry((cle(&s.c), &s.n, c.0, c.1)).or_default().push(q);
        }
    }
    let rang = _rangs(couches);
    let net_de = |nd: &Noeud<usize>| -> String { nd.n.as_str().unwrap_or("").to_string() };
    let sur_pastille = |c: &Json, x: f64, y: f64, case: &(i64, i64)| {
        couvert.get(case).is_some_and(|l| l.iter().any(|(tx, ty, r, tc)| hyp(x - tx, y - ty) <= *r && (nul(tc) || cle(tc) == cle(c))))
    };

    let attache = |nd: &Noeud<usize>| -> Option<&'static str> {
        let (x, y, c, n) = (nd.x, nd.y, &nd.c, net_de(nd));
        let case = ((x / CASE_MM).floor() as i64, (y / CASE_MM).floor() as i64);
        if sur_pastille(c, x, y, &case) {
            return Some("pastille");
        }
        if let Some(surf) = surf {
            if surf.ids.get(&n).is_some_and(|id| surf.lire(c, x, y) == *id) {
                return Some("pastille");
            }
        }
        // Un bout posé DANS le cuivre d'une autre piste du net y est relié, même à quelques
        // microns de son extrémité (un export qui arrondit les bouts d'arcs) ; un bout qui
        // la frôle sans y entrer ne l'est pas.
        for &q in grille.get(&(cle(c), n.as_str(), case.0, case.1)).into_iter().flatten() {
            if nd.attaches.contains(&q) {
                continue;
            }
            let s = segs[q].0;
            let (dx, dy) = (s.x2 - s.x1, s.y2 - s.y1);
            let f = maxf(&[0.0, minf(&[1.0, ((x - s.x1) * dx + (y - s.y1) * dy) / (dx * dx + dy * dy)])]);
            if hyp(x - s.x1 - f * dx, y - s.y1 - f * dy) <= maxf(&[s.w / 2.0, eps]) {
                return Some("noeud");
            }
        }
        match nd.attaches.len() {
            1 => Some("libre"),
            n if n >= 3 => Some("noeud"),
            _ => None,
        }
    };

    // Sur le segment q parcouru depuis `depart`, (distance, quoi) du premier point qui
    // retient le cuivre avant l'autre bout, ou None.
    let arret = |q: usize, depart: usize| -> R<Option<(f64, &'static str)>> {
        let (s, a, _) = segs[q];
        let (x1, y1, x2, y2) = if depart == a { (s.x1, s.y1, s.x2, s.y2) } else { (s.x2, s.y2, s.x1, s.y1) };
        let l = hyp(x2 - x1, y2 - y1);
        let (ux, uy) = ((x2 - x1) / l, (y2 - y1) / l);
        let mut prises: Vec<(f64, &'static str)> = Vec::new();
        for case in _cases(CASE_MM, x1, y1, x2, y2, s.w / 2.0)? {
            for &q2 in grille.get(&(cle(&s.c), s.n.as_str(), case.0, case.1)).into_iter().flatten() {
                if q2 == q || noeuds[depart].attaches.contains(&q2) {
                    continue;
                }
                let s2 = segs[q2].0;
                for (ex, ey) in [(s2.x1, s2.y1), (s2.x2, s2.y2)] {
                    let d = (ex - x1) * ux + (ey - y1) * uy;
                    if eps < d && d < l - eps && ((ex - x1) * uy - (ey - y1) * ux).abs() <= maxf(&[s.w / 2.0, eps]) {
                        prises.push((d, "noeud"));
                    }
                }
            }
            for &(tx, ty, r, tc) in couvert.get(&case).into_iter().flatten() {
                let d = ((tx - x1) * uy - (ty - y1) * ux).abs();
                if (nul(tc) || cle(tc) == cle(&s.c)) && d <= r {
                    let p = (tx - x1) * ux + (ty - y1) * uy - (r * r - d * d).sqrt();
                    if eps < p && p < l - eps {
                        prises.push((p, "pastille"));
                    }
                }
            }
        }
        if let Some(surf) = surf {
            if let (Some(id), Some(img)) = (surf.ids.get(&s.n), surf.image(&s.c)) {
                // np.arange(pas, L - eps, pas)
                let n = (((l - eps) - surf.pas) / surf.pas).ceil().max(0.0) as usize;
                if let Some(d) = (0..n).map(|q| surf.pas + q as f64 * surf.pas).find(|d| surf.lire_img(img, x1 + ux * d, y1 + uy * d) == *id) {
                    prises.push((d, "pastille"));
                }
            }
        }
        // min() de couples : la distance, puis « noeud » avant « pastille »
        Ok(prises.into_iter().reduce(|m, p| if p.0 < m.0 || (p.0 == m.0 && p.1 < m.1) { p } else { m }))
    };

    let (mut out, mut bouts) = (Vec::new(), 0i64);
    let mut vus: HashSet<usize> = HashSet::new();
    for (i_nd, nd) in noeuds.values().enumerate() {
        if nd.attaches.len() != 1 || attache(nd) != Some("libre") {
            continue;
        }
        bouts += 1;
        let (c, n) = (&nd.c, net_de(nd));
        let (mut long_, mut cur, mut q, mut fin) = (0.0, i_nd, nd.attaches[0], None);
        for _ in 0..segs.len() {
            let (s, a, b) = segs[q];
            if let Some(prise) = arret(q, cur)? {
                long_ += prise.0;
                fin = Some(prise.1);
                break;
            }
            long_ += s.longueur();
            cur = if a == cur { b } else { a };
            fin = attache(&noeuds[cur]);
            if fin.is_some() {
                break;
            }
            let att = &noeuds[cur].attaches;
            q = if att[0] == q { att[1] } else { att[0] };
        }
        if fin == Some("libre") {
            if vus.contains(&cur) {
                continue;
            }
            vus.insert(i_nd);
        }
        let w = segs[nd.attaches[0]].0.w;
        // Plus court que le bout arrondi de la piste elle-même : un arrondi d'export, pas du
        // cuivre qui dépasse.
        if (fin == Some("pastille") && long_ < w) || (fin == Some("noeud") && long_ < w / 2.0) {
            bouts -= 1;
            continue;
        }
        if fin != Some("libre") && doc.classe(&n) == ANTENNE {
            continue; // une antenne est ouverte au bout
        }
        let (base, msg) = if fin == Some("libre") {
            ("critique", format!("Piste isolée de {long_:.2} mm : reliée à rien à ses deux bouts"))
        } else if fin == Some("pastille") {
            ("vigilance", format!("Bout libre : {long_:.2} mm de piste partent d'une pastille et ne mènent nulle part (antenne)"))
        } else if long_ <= maxf(&[DEPASSEMENT_MM, 2.0 * w]) {
            ("vigilance", format!("Dépassement de {long_:.2} mm après un coin : du cuivre qui ne mène nulle part"))
        } else {
            ("vigilance", format!("Moignon de {long_:.2} mm en bout de branche, ouvert à son extrémité"))
        };
        let mut freqs = Vec::new();
        if doc.signal(&n) {
            let er = match rang.get(&cle(c)) {
                Some(&i) => _er_entre(couches, i.saturating_sub(1), i + 1)?,
                None => 4.3,
            };
            let td = long_ * 1e-3 * er.sqrt() / C0;
            freqs = _par_frequence(reg, &doc.classe(&n), Some(&n), |_f_eval, tr| Ok((2.0 * td / tr, _dixieme(2.0 * td / tr), Json::Nul)))?;
        }
        let sev = _pire(std::iter::once(base).chain(verdicts(&freqs)));
        out.push(obj! {"regle" => "orphelin", "severite" => sev, "frequences" => freqs, "x" => nd.x / unite, "y" => nd.y / unite, "c" => c,
                       "n" => n, "msg" => msg});
    }
    Ok((out, obj! {"bouts" => bouts}))
}

// ==========================================================================
// CE QUE LES RÈGLES DE TOPOLOGIE PARTAGENT : le graphe d'un net
// --------------------------------------------------------------------------
// Des nœuds (couche, x, y) au pas de 20 µm, une arête par segment de piste. Un bout de piste
// posé AU MILIEU d'un autre segment du même net (un T) coupe ce segment : sans cela, la
// moitié des embranchements d'un vrai routage ne seraient pas des nœuds.
// ==========================================================================

pub const GRAIN_MM: f64 = 0.02;

type NoeudTopo = (String, i64, i64);

/// Le graphe d'un net : ses nœuds dans leur ordre d'apparition, avec leur couche et leur
/// position, et leurs arêtes (voisin, longueur).
#[derive(Default)]
struct GrapheTopo<'a> {
    noeuds: IndexMap<NoeudTopo, (&'a Json, f64, f64)>,
    adj: Vec<Vec<(usize, f64)>>,
}

/// segs : les tronçons d'un net.
fn _graphe_topo<'a>(segs: &[&'a Troncon]) -> GrapheTopo<'a> {
    let mut g = GrapheTopo::default();
    let bouts: Vec<(String, f64, f64)> = segs.iter().flat_map(|t| [(cle(&t.c), t.x1, t.y1), (cle(&t.c), t.x2, t.y2)]).collect();
    for t in segs {
        let l = t.longueur();
        if l <= 0.0 {
            continue;
        }
        let (ux, uy) = ((t.x2 - t.x1) / l, (t.y2 - t.y1) / l);
        let kc = cle(&t.c);
        let mut coupes: Vec<f64> = bouts.iter().filter(|b| b.0 == kc).filter_map(|(_, x, y)| {
            let d = (x - t.x1) * ux + (y - t.y1) * uy;
            (GRAIN_MM < d && d < l - GRAIN_MM && ((x - t.x1) * uy - (y - t.y1) * ux).abs() <= t.w / 2.0).then_some(d)
        }).collect();
        coupes.sort_by(f64::total_cmp);
        coupes.dedup();
        let mut pts = vec![0.0];
        pts.extend(coupes);
        pts.push(l);
        for d in pts.windows(2) {
            let (pa, pb) = ((t.x1 + ux * d[0], t.y1 + uy * d[0]), (t.x1 + ux * d[1], t.y1 + uy * d[1]));
            let ka = (kc.clone(), round0(pa.0 / GRAIN_MM), round0(pa.1 / GRAIN_MM));
            let kb = (kc.clone(), round0(pb.0 / GRAIN_MM), round0(pb.1 / GRAIN_MM));
            if ka == kb {
                continue;
            }
            // pos[a], pos[b] : la dernière position vue ; adj[a], adj[b] : créés dans cet ordre
            let a = match g.noeuds.get_full_mut(&ka) {
                Some((i, _, v)) => {
                    (v.1, v.2) = pa;
                    i
                }
                None => g.noeuds.insert_full(ka, (&t.c, pa.0, pa.1)).0,
            };
            let b = match g.noeuds.get_full_mut(&kb) {
                Some((i, _, v)) => {
                    (v.1, v.2) = pb;
                    i
                }
                None => g.noeuds.insert_full(kb, (&t.c, pb.0, pb.1)).0,
            };
            g.adj.resize(g.noeuds.len(), Vec::new());
            g.adj[a].push((b, d[1] - d[0]));
            g.adj[b].push((a, d[1] - d[0]));
        }
    }
    g
}

// ==========================================================================
// LES MOIGNONS DE VIAS
// --------------------------------------------------------------------------
// Un via percé de L1 à L6 dont le signal n'emprunte que L1 à L3 laisse pendre L3 à L6 en
// circuit ouvert : un moignon, qui résonne au quart d'onde. On le garde sous λ/20 au genou
// (λ/10 pour condamner) -- il résonne alors cinq fois plus haut que le genou. La portée
// percée vient du document (`de`, `a` d'un perçage) ; absente, le via est SUPPOSÉ
// traversant, et le message le dit. Un via CONTRE-PERCÉ (`cp` du perçage : face, couche
// gardée, moignon résiduel) ne garde de ce côté que le bout entre la couche empruntée et la
// pointe du foret (`_contre_percage`) ; sans `cp`, rien ne change. Les couches empruntées :
// celles où une piste du net arrive dans le via. Une broche traversante de composant n'est
// pas un via de routage : pas jugée. Une ligne par net, sur le pire via.
// ==========================================================================

/// Le bout de perçage qu'un contre-perçage laisse, ou None.
///
/// `cp` vient du perçage : {cote : "dessous" | "dessus", garde : le nom de la couche de
/// cuivre à ne pas couper, res : le moignon résiduel en mm}. Le foret repassé s'arrête à
/// `res` sous (ou sur) la couche gardée : le moignon de ce côté va de la couche empruntée à
/// sa pointe, jamais plus loin qu'avant. Rend (0 pour le haut, 1 pour le bas ; (L, i1, i2)).
/// Un contre-perçage qui couperait une couche empruntée, ou dont la couche n'est pas dans
/// l'empilage, n'est pas appliqué : sans lui, rien ne change.
fn _contre_percage(cp: &Json, rang: &HashMap<String, usize>, couches: &[Json], z: &[f64], vlo: usize, vhi: usize, ulo: usize, uhi: usize)
                   -> R<Option<(usize, (f64, usize, usize))>> {
    if cp.as_objet().is_none() {
        return Ok(None);
    }
    let g = rang.get(&cle(&cp["garde"])).copied();
    let Ok(res) = (if cp["res"].vrai() { float_py(&cp["res"]) } else { Ok(0.0) }) else { return Ok(None) };
    let res = maxf(&[0.0, res]);
    let Some(g) = g else { return Ok(None) };
    let demi = fl_ou(&couches[g]["thickness"], 0.0)? / 2.0;
    if cp["cote"].as_str() == Some("dessous") && uhi <= g && g < vhi {
        let pointe = minf(&[z[g] + demi + res, z[vhi]]);
        return Ok(Some((1, (maxf(&[0.0, minf(&[z[vhi] - z[uhi], pointe - z[uhi]])]), uhi, (g + 1).min(vhi)))));
    }
    if cp["cote"].as_str() == Some("dessus") && vlo < g && g <= ulo {
        let pointe = maxf(&[z[g] - demi - res, z[vlo]]);
        return Ok(Some((0, (maxf(&[0.0, minf(&[z[ulo] - z[vlo], z[ulo] - pointe])]), (g - 1).max(vlo), ulo))));
    }
    Ok(None)
}

pub fn moignons_vias(k: &Carte) -> Regle {
    let (doc, couches, reg, unite) = (k.doc, k.couches, k.reg, k.unite);
    let rang = _rangs(couches);
    let mut cu: Vec<usize> = rang.values().copied().collect();
    cu.sort_unstable();
    if cu.len() < 3 {
        return Ok((Vec::new(), obj! {}));
    }
    // cote du milieu de chaque couche
    let (mut z, mut h) = (Vec::new(), 0.0);
    for c in couches {
        let t = fl_ou(&c["thickness"], 0.0)?;
        z.push(h + t / 2.0);
        h += t;
    }
    let mut broches: HashMap<(i64, i64), Vec<(f64, f64)>> = HashMap::new();
    for cp in doc.liste("composants") {
        for b in els(&dict(cp)?["broches"]) {
            let (bx, by) = (flr(b, "x")? * unite, flr(b, "y")? * unite);
            broches.entry(((bx / CASE_MM).floor() as i64, (by / CASE_MM).floor() as i64)).or_default().push((bx, by));
        }
    }
    let mut bouts: HashMap<(&str, i64, i64), Vec<(f64, f64, usize)>> = HashMap::new();
    for t in k.troncons {
        if let Some(&r) = rang.get(&cle(&t.c)) {
            for (x, y) in [(t.x1, t.y1), (t.x2, t.y2)] {
                for c in _cases(CASE_MM, x, y, x, y, 0.0)? {
                    bouts.entry((&t.n, c.0, c.1)).or_default().push((x, y, r));
                }
            }
        }
    }
    // net -> (poids du pire, constat, nombre)
    let mut pires: IndexMap<String, ((usize, f64), Json, usize)> = IndexMap::new();
    let mut n_vias = 0usize;
    for t in doc.liste("percages") {
        let t = dict(t)?;
        let n = str_ou_vide(&t["n"]);
        if !doc.signal(&n) {
            continue;
        }
        let (x, y) = (flr(t, "x")? * unite, flr(t, "y")? * unite);
        let mut sur_broche = false;
        for c in _cases(CASE_MM, x, y, x, y, 0.1)? {
            sur_broche |= broches.get(&c).is_some_and(|l| l.iter().any(|(bx, by)| hyp(bx - x, by - y) < 0.1));
        }
        if sur_broche {
            continue;
        }
        let r = fl_ou(&t["d"], 0.3)? * unite / 2.0 + 0.1;
        let mut pris: BTreeSet<usize> = BTreeSet::new();
        for c in _cases(CASE_MM, x, y, x, y, r)? {
            pris.extend(bouts.get(&(n.as_str(), c.0, c.1)).into_iter().flatten().filter(|(bx, by, _)| hyp(bx - x, by - y) <= r).map(|b| b.2));
        }
        if pris.len() < 2 {
            continue;
        }
        n_vias += 1;
        let portee = rang.get(&cle(&t["de"])).zip(rang.get(&cle(&t["a"])));
        let suppose = portee.is_none();
        let (vlo, vhi) = portee.map_or((cu[0], cu[cu.len() - 1]), |(de, a)| tri2(*de, *a));
        let (ulo, uhi) = (*pris.first().unwrap(), *pris.last().unwrap());
        let mut bouts_ = [(z[ulo] - z[vlo], vlo, ulo), (z[vhi] - z[uhi], uhi, vhi)];
        let perce = _contre_percage(&t["cp"], &rang, couches, &z, vlo, vhi, ulo, uhi)?;
        if let Some((cote, bout)) = perce {
            bouts_[cote] = bout;
        }
        // max() de triplets : le premier des plus grands
        let (l, i1, i2) = if bouts_[1] > bouts_[0] { bouts_[1] } else { bouts_[0] };
        if l <= 0.05 {
            continue;
        }
        let er = _er_entre(couches, i1, i2)?;
        let freqs = _par_frequence(reg, &doc.classe(&n), Some(&n), |f_eval, _tr| {
            let r = l / (C0 / (f_eval * er.sqrt()) / 20.0 * 1e3);
            Ok((r, _ratio(r), Json::Nul))
        })?;
        let sev = _pire(verdicts(&freqs));
        if sev == "ok" {
            continue;
        }
        let f_res = C0 / (4.0 * l * 1e-3 * er.sqrt());
        let nom = |i: usize| str_py(&couches[i]["name"]);
        let kc = obj! {"regle" => "moignon_via", "severite" => sev, "frequences" => freqs, "x" => x / unite, "y" => y / unite,
                       "c" => format!("{} → {}", nom(ulo), nom(uhi)), "n" => &n,
                       "msg" => format!("Moignon de {l:.2} mm ({} → {} inemprunté), résonance au quart d'onde à {}{}{}", nom(i1), nom(i2), _hz(f_res),
                                        if suppose { " ; perçage supposé traversant (portée absente du document)" } else { "" },
                                        match perce {
                                            Some((cote, _)) => format!(" ; contre-percé par {}", if cote != 0 { "dessous" } else { "dessus" }),
                                            None => String::new(),
                                        })};
        let poids = (["ok", "vigilance", "critique"].iter().position(|s| *s == sev).unwrap_or(0), l);
        match pires.get_mut(&n) {
            None => {
                pires.insert(n, (poids, kc, 1));
            }
            Some(p0) => {
                p0.2 += 1;
                if poids > p0.0 {
                    (p0.0, p0.1) = (poids, kc);
                }
            }
        }
    }
    let mut out = Vec::new();
    for (_, mut kc, nb) in pires.into_values() {
        if nb > 1 {
            let msg = format!("{} (le pire de {nb} vias à moignon sur ce net)", txt(&kc, "msg"));
            poser(&mut kc, "msg", msg);
        }
        out.push(kc);
    }
    Ok((out, obj! {"vias" => n_vias}))
}

// ==========================================================================
// LES BRANCHES EN T
// --------------------------------------------------------------------------
// Un net qui se ramifie hors pastille -- un T vers une deuxième charge -- n'est plus une
// ligne : chaque branche courte pend comme un moignon, et se juge pareil, 2T_d / t_r face au
// front (10 % vigilance, 20 % critique). À chaque embranchement, les deux branches les plus
// longues font le tronc ; les autres sont des dérivations. Une dérivation qui finit dans le
// vide est un orphelin (règle à part) ; ici, celles qui mènent à une pastille.
// ==========================================================================

pub fn branches_t(k: &Carte) -> Regle {
    let (doc, couches, reg, unite) = (k.doc, k.couches, k.reg, k.unite);
    let rang = _rangs(couches);
    let mut par: IndexMap<&str, Vec<&Troncon>> = IndexMap::new();
    for t in k.troncons {
        if doc.signal(&t.n) {
            par.entry(&t.n).or_default().push(t);
        }
    }
    let mut pads: HashMap<String, Vec<(f64, f64, f64)>> = HashMap::new();
    for t in doc.liste("pastilles") {
        let t = dict(t)?;
        if t["n"].vrai() {
            pads.entry(str_py(&t["n"])).or_default().push((flr(t, "x")? * unite, flr(t, "y")? * unite,
                                                          maxf(&[fl_ou(ou(&t["R"], &t["r"]), 0.0)? * unite, 0.05])));
        }
    }
    let (mut out, mut embranchements) = (Vec::new(), 0usize);
    for (n, segs) in &par {
        let g = _graphe_topo(segs);
        let sur_pad = |q: usize| {
            let (_, x, y) = g.noeuds[q];
            pads.get(*n).is_some_and(|l| l.iter().any(|(px, py, r)| hyp(x - px, y - py) <= *r))
        };
        // (L, nœud, colonnes, sévérité, nombre de branches)
        let mut pire: Option<(f64, usize, Vec<Json>, &str, usize)> = None;
        for (q, v) in g.adj.iter().enumerate() {
            if v.len() < 3 || sur_pad(q) {
                continue;
            }
            embranchements += 1;
            let mut branches: Vec<(f64, bool)> = Vec::new();
            for &(b, l) in v {
                let (mut prec, mut cur, mut tot) = (q, b, l);
                while g.adj[cur].len() == 2 && !sur_pad(cur) {
                    // piste tracee deux fois : les deux aretes menent au meme voisin
                    let Some(&(nxt, dl)) = g.adj[cur].iter().find(|(x, _)| *x != prec) else { break };
                    (prec, cur, tot) = (cur, nxt, tot + dl);
                    if cur == q {
                        break;
                    }
                }
                branches.push((tot, sur_pad(cur)));
            }
            branches.sort_by(|a, b| b.partial_cmp(a).unwrap_or(std::cmp::Ordering::Equal));
            let derivs: Vec<f64> = branches.iter().skip(2).filter(|b| b.1).map(|b| b.0).collect();
            if derivs.is_empty() {
                continue;
            }
            let l = maxf(&derivs);
            let er = match rang.get(&g.noeuds.get_index(q).unwrap().0.0) {
                Some(&i) => _er_entre(couches, i.saturating_sub(1), i + 1)?,
                None => 4.3,
            };
            let td = l * 1e-3 * er.sqrt() / C0;
            let freqs = _par_frequence(reg, &doc.classe(n), Some(n), |_f_eval, tr| Ok((2.0 * td / tr, _dixieme(2.0 * td / tr), Json::Nul)))?;
            let sev = _pire(verdicts(&freqs));
            if sev != "ok" && pire.as_ref().is_none_or(|p| l > p.0) {
                pire = Some((l, q, freqs, sev, v.len()));
            }
        }
        if let Some((l, q, freqs, sev, nb)) = pire {
            let (c, x, y) = g.noeuds[q];
            out.push(obj! {"regle" => "branche", "severite" => sev, "frequences" => freqs, "x" => x / unite, "y" => y / unite, "c" => c, "n" => *n,
                           "msg" => format!("Embranchement en T hors pastille ({nb} branches) : une dérivation de {l:.1} mm vers une charge \
                                             pend comme un moignon ; routez en chaîne (daisy chain) ou terminez")});
        }
    }
    Ok((out, obj! {"embranchements" => embranchements}))
}

// ==========================================================================
// LES QUARTZ
// --------------------------------------------------------------------------
// Un quartz se tient tout contre son oscillateur : pistes courtes (10 mm en vigilance, 25 mm
// critique, règle de pouce des notes d'application), et rien d'autre que la masse dessous ni
// tout autour -- une piste qui passe y injecte son bruit dans un circuit à gain élevé et à
// très haute impédance. Quartz : repère Y, XT, XTAL (ou X, G avec une valeur en Hz), et deux
// broches de signal.
// ==========================================================================

fn re(motif: &str) -> Regex {
    Regex::new(motif).unwrap()
}
static RE_QUARTZ: LazyLock<Regex> = LazyLock::new(|| re(r"^(?i)(Y|XT|XTAL)\d"));
// X (aussi un connecteur) et G (oscillateur, CEI) : quartz seulement si la valeur le dit. Un
// filtre SAW (FLT, 868 MHz) n'en est pas un.
static RE_QUARTZ_SI_VALEUR: LazyLock<Regex> = LazyLock::new(|| re(r"^(?i)(X|G)\d"));
static RE_VAL_QUARTZ: LazyLock<Regex> = LazyLock::new(|| re(r"(?i)\d\s*(k|M)Hz|quartz|crystal|xtal"));
pub const QUARTZ_VIGILANCE_MM: f64 = 10.0;
pub const QUARTZ_CRITIQUE_MM: f64 = 25.0;
pub const QUARTZ_MARGE_MM: f64 = 1.0;

pub fn quartz(k: &Carte) -> Regle {
    let (doc, unite, surf) = (k.doc, k.unite, k.surf);
    let mut longueur: HashMap<&str, f64> = HashMap::new();
    for t in k.troncons {
        *longueur.entry(&t.n).or_insert(0.0) += t.longueur();
    }
    let long = |n: &String| longueur.get(n.as_str()).copied().unwrap_or(0.0);
    let (mut out, mut n_quartz) = (Vec::new(), 0usize);
    for cp in doc.liste("composants") {
        let cp = dict(cp)?;
        let repere = str_ou_vide(&cp["ref"]);
        let br = els(&cp["broches"]);
        if !(RE_QUARTZ.is_match(&repere) || (RE_QUARTZ_SI_VALEUR.is_match(&repere) && RE_VAL_QUARTZ.is_match(&str_ou_vide(&cp["val"])))) {
            continue;
        }
        let mut nets: BTreeSet<String> = BTreeSet::new();
        for b in br {
            let n = str_ou_vide(&dict(b)?["n"]);
            if doc.signal(&n) {
                nets.insert(n);
            }
        }
        let sig: Vec<String> = nets.into_iter().collect();
        if sig.len() != 2 {
            continue;
        }
        n_quartz += 1;
        let (mut xs, mut ys) = (Vec::new(), Vec::new());
        for b in br {
            xs.push(flr(b, "x")? * unite);
            ys.push(flr(b, "y")? * unite);
        }
        let (x0, x1_, y0, y1_) = (minf(&xs) - QUARTZ_MARGE_MM, maxf(&xs) + QUARTZ_MARGE_MM, minf(&ys) - QUARTZ_MARGE_MM, maxf(&ys) + QUARTZ_MARGE_MM);
        let (cx, cy) = ((x0 + x1_) / 2.0, (y0 + y1_) / 2.0);
        let constat = |severite: &str, msg: String| {
            obj! {"x" => cx / unite, "y" => cy / unite, "c" => str_ou_vide(&cp["c"]), "n" => &sig[0], "frequences" => Vec::<Json>::new(),
                  "regle" => "quartz", "severite" => severite, "msg" => msg}
        };
        let l = maxf(&sig.iter().map(long).collect::<Vec<_>>());
        if l > QUARTZ_VIGILANCE_MM {
            out.push(constat(if l > QUARTZ_CRITIQUE_MM { "critique" } else { "vigilance" }, format!(
                "{repere} : {l:.1} mm de piste sur {} entre le quartz et son oscillateur ({}) ; rapprochez-le à moins de {QUARTZ_VIGILANCE_MM:.0} mm",
                premier_max(&sig, long).unwrap(), sig.join(" / "))));
        }
        let mut dessous: BTreeSet<String> = BTreeSet::new();
        for t in k.troncons {
            if sig.contains(&t.n) || t.n.is_empty() || sans_net(&t.n) || doc.classe(&t.n) == "Masse" {
                continue;
            }
            let (xa, ya, xb, yb) = (t.x1, t.y1, t.x2, t.y2);
            if maxf(&[xa, xb]) >= x0 && minf(&[xa, xb]) <= x1_ && maxf(&[ya, yb]) >= y0 && minf(&[ya, yb]) <= y1_ {
                let m = ((hyp(xb - xa, yb - ya) / 0.1) as usize).max(2);
                if (0..=m).any(|s| {
                    let (px, py) = (xa + (xb - xa) * s as f64 / m as f64, ya + (yb - ya) * s as f64 / m as f64);
                    x0 <= px && px <= x1_ && y0 <= py && py <= y1_
                }) {
                    dessous.insert(t.n.clone());
                }
            }
        }
        if let Some(surf) = surf {
            for (c, img) in &surf.images {
                let g = surf.lire_img(img, cx, cy);
                let nom = if g > 0 { surf.ids.iter().find(|(_, v)| **v == g).map(|(nm, _)| nm) } else { None };
                if let Some(nom) = nom.filter(|nom| !nom.is_empty() && !sig.contains(nom) && doc.classe(nom) != "Masse") {
                    dessous.insert(format!("{nom} (plan {c})"));
                }
            }
        }
        if !dessous.is_empty() {
            out.push(constat("vigilance", format!(
                "{repere} : {} passe{} sous le quartz ou à moins de {QUARTZ_MARGE_MM:.0} mm ; ne laissez que la masse",
                dessous.iter().take(5).cloned().collect::<Vec<_>>().join(", "), if dessous.len() > 1 { "nt" } else { "" })));
        }
    }
    Ok((out, obj! {"quartz" => n_quartz}))
}

// ==========================================================================
// LA PROTECTION ESD AU PIED DES CONNECTEURS
// --------------------------------------------------------------------------
// Chaque signal qui sort par un connecteur doit trouver, tout près de la broche (10 mm), une
// protection vers la masse : diode, TVS, réseau ESD (repère D, TVS, ESD, Z, ou valeur PESD,
// USBLC, SMAJ…). Un connecteur dont AUCUN signal n'est protégé est sans doute interne
// (programmation, nappe) : info. Un connecteur protégé en partie, ou protégé trop loin :
// vigilance.
// ==========================================================================

static RE_PROTECTION: LazyLock<Regex> = LazyLock::new(|| re(r"^(?i)(D|TVS|ESD|Z|DZ)\d"));
static RE_VAL_PROTECTION: LazyLock<Regex> =
    LazyLock::new(|| re(r"(?i)ESD|TVS|PESD|USBLC|SMAJ|SMBJ|SMF|PRTR|TPD\d|IP4|RCLAMP|SP05|NUP|CDSOT|ESDA"));
pub const ESD_MM: f64 = 10.0;

pub fn esd(k: &Carte) -> Regle {
    let (doc, unite) = (k.doc, k.unite);
    let comps: Vec<&Json> = doc.liste("composants").iter().filter(|c| c.as_objet().is_some()).collect();
    // net -> [(x, y, ref)] broches de protection
    let mut gardes: HashMap<String, Vec<(f64, f64, String)>> = HashMap::new();
    for cp in &comps {
        let repere = str_ou_vide(&cp["ref"]);
        if !(RE_PROTECTION.is_match(&repere) || RE_VAL_PROTECTION.is_match(&str_ou_vide(&cp["val"]))) {
            continue;
        }
        let mut br = Vec::new();
        for b in els(&cp["broches"]) {
            br.push((dict(b)?, str_ou_vide(&b["n"])));
        }
        if !br.iter().any(|(_, n)| doc.classe(n) == "Masse") {
            continue;
        }
        for (b, n) in br {
            if !n.is_empty() && doc.classe(&n) != "Masse" {
                gardes.entry(n).or_default().push((flr(b, "x")? * unite, flr(b, "y")? * unite, repere.clone()));
            }
        }
    }
    let (mut out, mut connecteurs) = (Vec::new(), 0usize);
    for cp in &comps {
        let repere = str_ou_vide(&cp["ref"]);
        if !RE_CONNECTEUR.is_match(&repere) {
            continue;
        }
        let mut sig = Vec::new();
        for b in els(&cp["broches"]) {
            let n = str_ou_vide(&dict(b)?["n"]);
            if doc.signal(&n) {
                sig.push((b, n));
            }
        }
        if sig.is_empty() {
            continue;
        }
        connecteurs += 1;
        let (mut nus, mut loin, mut bons) = (Vec::new(), Vec::new(), 0usize);
        for (b, n) in &sig {
            let (bx, by) = (flr(b, "x")? * unite, flr(b, "y")? * unite);
            // min() de couples (distance, repère)
            let g = gardes.get(n).into_iter().flatten().map(|(x, y, r)| (hyp(bx - x, by - y), r))
                .reduce(|m, p| if p.0 < m.0 || (p.0 == m.0 && p.1 < m.1) { p } else { m });
            match g {
                None => nus.push(n.clone()),
                Some((d, r)) if d > ESD_MM => loin.push(format!("{r} à {d:.0} mm ({n})")),
                Some(_) => bons += 1,
            }
        }
        if nus.is_empty() && loin.is_empty() {
            continue;
        }
        let b0 = sig[0].0;
        let sev = if bons == 0 && loin.is_empty() { "info" } else { "vigilance" };
        let mut msg = format!("{repere} : ");
        if !nus.is_empty() {
            let uniques: BTreeSet<&String> = nus.iter().collect();
            msg += &format!("pas de protection ESD vers la masse sur {}{}", uniques.iter().take(6).map(|s| s.as_str()).collect::<Vec<_>>().join(", "),
                            if uniques.len() > 6 { "…" } else { "" });
        }
        if !loin.is_empty() {
            msg += &format!("{}protection trop loin de la broche : {}", if nus.is_empty() { "" } else { " ; " },
                            loin.iter().take(4).cloned().collect::<Vec<_>>().join(", "));
        }
        if sev == "info" {
            msg += " — aucun signal protégé : connecteur interne ?";
        }
        out.push(obj! {"regle" => "esd", "severite" => sev, "frequences" => Vec::<Json>::new(), "x" => flr(b0, "x")?, "y" => flr(b0, "y")?,
                       "c" => str_ou_vide(&cp["c"]), "n" => &sig[0].1, "msg" => msg});
    }
    Ok((out, obj! {"connecteurs" => connecteurs}))
}

// ==========================================================================
// LE COURANT FACE À LA LARGEUR
// --------------------------------------------------------------------------
// Chaque rail (alimentation, nœud de découpage) passe par sa piste la plus étroite. Ce
// qu'elle tient se lit par IPC-2221 (ΔT = 10 K, couche externe ou interne) : c'est plus
// prudent que l'étalement que résout l'onglet Chute DC, qui reste l'outil pour un chiffre
// précis. Avec un courant donné par rail (`courants` du document, en A), verdict : au-delà
// de ce que la piste tient à +10 K, vigilance ; à +20 K, critique. Sans courant, on signale
// l'étranglement en info : une piste plus de deux fois plus étroite que le reste du rail,
// qui porte pourtant tout son courant -- et ce qu'elle tient.
// ==========================================================================

pub const COURANT_DT_VIGILANCE: f64 = 10.0;
pub const COURANT_DT_CRITIQUE: f64 = 20.0;
pub const ETRANGLEMENT: f64 = 0.5;

/// Le courant qu'une piste tient à +dt kelvins, IPC-2221.
fn _i_max(w_mm: f64, t_mm: f64, externe: bool, dt: f64) -> f64 {
    let k = if externe { dc_solver::IPC2221_K_EXT } else { dc_solver::IPC2221_K_INT };
    k * dt.powf(0.44) * (w_mm * t_mm * dc_solver::MILS2_PAR_MM2).powf(0.725)
}

pub fn courants(k: &Carte) -> Regle {
    let (doc, couches, unite) = (k.doc, k.couches, k.unite);
    let rang = _rangs(couches);
    let mut cu: Vec<usize> = rang.values().copied().collect();
    cu.sort_unstable();
    let mut donnes: HashMap<&str, f64> = HashMap::new();
    if doc.d["courants"].vrai() {
        for (n, v) in dc_solver::pyth::objet(&doc.d["courants"]).map_err(|e| Exc::Interne(e.0.replace("'get'", "'items'")))? {
            if !nul(v) && fl(v)? > 0.0 {
                donnes.insert(n, fl(v)?);
            }
        }
    }
    // net -> (largeur, couche) -> (longueur, largeur, couche)
    let mut par: IndexMap<&str, IndexMap<(u64, String), (f64, f64, &Json)>> = IndexMap::new();
    let mut lieu: HashMap<(&str, u64, String), (f64, f64, f64)> = HashMap::new();
    for t in k.troncons {
        if t.n.is_empty() || !["Alimentation", "Découpage"].contains(&doc.classe(&t.n).as_str()) || t.w <= 0.0 {
            continue;
        }
        let l = t.longueur();
        let w = round(t.w, 3);
        par.entry(&t.n).or_default().entry((bits(w), cle(&t.c))).or_insert((0.0, w, &t.c)).0 += l;
        let cle_l = (t.n.as_str(), bits(w), cle(&t.c));
        if l > lieu.get(&cle_l).map_or(0.0, |o| o.0) {
            lieu.insert(cle_l, (l, (t.x1 + t.x2) / 2.0, (t.y1 + t.y2) / 2.0));
        }
    }
    let mut out = Vec::new();
    let mut bilan = obj! {"rails" => 0usize};
    if !donnes.is_empty() {
        // que le rapport dise qu'un courant a été jugé, même sans constat
        poser(&mut bilan, "courants_donnes", donnes.keys().filter(|n| par.contains_key(*n)).count());
    }
    for (n, largeurs) in &par {
        let rails = bilan["rails"].as_i64().unwrap_or(0) + 1;
        poser(&mut bilan, "rails", rails);
        let groupes: Vec<&(f64, f64, &Json)> = largeurs.values().collect();
        let tot = py::sum(groupes.iter().map(|g| g.0));
        let &&(l_min, w_min, c_min) = premier_min(&groupes, |g| g.1).unwrap();
        let w_dom = premier_max(&groupes, |g| g.0).unwrap().1;
        let i = rang.get(&cle(c_min)).copied();
        let t = match i {
            Some(i) => ep_cuivre(couches, i)?,
            None => 0.035,
        };
        let externe = i.is_none_or(|i| cu.is_empty() || i == cu[0] || i == cu[cu.len() - 1]);
        let i10 = _i_max(w_min, t, externe, COURANT_DT_VIGILANCE);
        let i20 = _i_max(w_min, t, externe, COURANT_DT_CRITIQUE);
        let (_, x, y) = lieu[&(*n, bits(w_min), cle(c_min))];
        let constat = |severite: &str, msg: String| {
            obj! {"regle" => "courant", "frequences" => Vec::<Json>::new(), "x" => x / unite, "y" => y / unite, "c" => c_min, "n" => *n,
                  "severite" => severite, "msg" => msg}
        };
        if let Some(&courant) = donnes.get(n) {
            if courant > i10 {
                out.push(constat(if courant > i20 { "critique" } else { "vigilance" }, format!(
                    "{courant:.2} A dans une piste de {w_min:.2} mm ({}, {:.0} µm) : elle tient {i10:.2} A à +10 °C, {i20:.2} A à +20 °C \
                     (IPC-2221) ; élargissez-la ou doublez-la", str_py(c_min), t * 1e3)));
            }
        } else if w_min < ETRANGLEMENT * w_dom && l_min < 0.5 * tot {
            out.push(constat("info", format!(
                "Étranglement : {l_min:.1} mm de piste à {w_min:.2} mm sur un rail tiré à {w_dom:.2} mm ; tout le courant y passe, et elle ne \
                 tient que {i10:.2} A à +10 °C (IPC-2221). Pour le chiffre exact, onglet Chute DC")));
        }
    }
    Ok((out, bilan))
}
