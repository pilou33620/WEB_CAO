//! Ce qui distingue les deux brins d'une paire, troncon par troncon.

use super::base::*;
use super::discontinuites::{ANGLE_COUDE_MINIMAL, _hauteur_via};
use super::longement::{_nom_de_couche, _plan_entre, _superposition};
use super::modele::*;
use super::modes::*;
use super::mutuelle::{ECART_VIAS_PAIRE_MAX, _via_de_la_partenaire};
use super::section::{geometrie, section_de_couche};
use super::transition::{GeoVia, ModeleVia};
use super::ErreurSimulation;
use ligne_mom as tl;
use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::f64::consts::PI;

type Res<T> = Result<T, ErreurSimulation>;

/// Le point commun de deux bouts de piste consecutifs, et leurs deux
/// directions orientees dans le sens du parcours : (x, y, v1, v2), ou None
/// s'ils ne se touchent pas.
#[allow(clippy::type_complexity)]
pub fn _raccord(a: &Json, b: &Json) -> Option<(f64, f64, (f64, f64), (f64, f64))> {
    let pa = [_bout(a, "start")?, _bout(a, "end")?];
    let pb = [_bout(b, "start")?, _bout(b, "end")?];
    for ia in [1, 0] {
        for ib in [0, 1] {
            if py::hypot(pa[ia].0 - pb[ib].0, pa[ia].1 - pb[ib].1) <= TOLERANCE_RACCORD_MM {
                let v1 = (pa[ia].0 - pa[1 - ia].0, pa[ia].1 - pa[1 - ia].1);
                let v2 = (pb[1 - ib].0 - pb[ib].0, pb[1 - ib].1 - pb[ib].1);
                return Some((pa[ia].0, pa[ia].1, v1, v2));
            }
        }
    }
    None
}

pub fn _angle(v1: (f64, f64), v2: (f64, f64)) -> f64 {
    let (n1, n2) = (py::hypot(v1.0, v1.1), py::hypot(v2.0, v2.1));
    if !(n1 > 1e-9 && n2 > 1e-9) {
        return 0.0;
    }
    let c = ((v1.0 * v2.0 + v1.1 * v2.1) / (n1 * n2)).min(1.0).max(-1.0);
    c.acos().to_degrees()
}

/// Un coude d'un brin : sa position, son angle, la largeur de la piste qui en part.
#[derive(Debug, Clone, PartialEq)]
pub struct CoudeBrin {
    pub x: f64,
    pub y: f64,
    pub angle_deg: f64,
    pub largeur: f64,
}

/// Les coudes d'un brin dont les bouts se suivent : [{x, y, angle_deg,
/// largeur}], ou None si la suite n'est pas une chaine -- on ne sait alors
/// pas ou sont ses coudes, et l'on suppose ceux de la piste.
pub fn _coudes_brin(objs: &[&Json]) -> Option<Vec<CoudeBrin>> {
    let mut out = Vec::new();
    for w in objs.windows(2) {
        let (a, b) = (w[0], w[1]);
        let r = _raccord(a, b)?;
        if ent(&a["layer"], -1) != ent(&b["layer"], -1) {
            continue;
        }
        let ang = _angle(r.2, r.3);
        if ang >= ANGLE_COUDE_MINIMAL {
            out.push(CoudeBrin { x: r.0, y: r.1, angle_deg: round(ang, 1),
                                 largeur: _nombre(&b["width"], 0.0) });
        }
    }
    Some(out)
}

/// La section d'un brin seul (`_ligne_seule`).
#[derive(Debug, Clone, PartialEq)]
pub struct LigneSeule {
    pub z0: f64,
    pub eps: f64,
    pub info: Json,
    pub largeur: f64,
    pub ep: f64,
    pub couche: i64,
}

pub type CacheSeul = HashMap<String, Option<LigneSeule>>;

/// La section d'un brin SEUL sur sa couche (ni masse coplanaire ni
/// voisine) : {z0, eps, info, largeur, ep, couche}, en cache, ou None.
pub fn _ligne_seule(couches: &[Json], couche: i64, largeur_mm: f64, ep_mm: f64, cache: &mut CacheSeul) -> Option<LigneSeule> {
    let cle = format!("{:?}", (couche, round(largeur_mm, 4) + 0.0, round(ep_mm, 4) + 0.0));
    if !cache.contains_key(&cle) {
        let mut v = None;
        let (geo, info) = section_de_couche(couches, couche, largeur_mm, ep_mm, 0.0, Some(0.0), &[], false);
        if let Some(geo) = geo {
            if let Ok(r) = tl::solve_line(&geometrie(&geo)) {
                if r.z0 > 0.0 {
                    v = Some(LigneSeule { z0: r.z0, eps: r.eps_eff, info, largeur: largeur_mm, ep: ep_mm, couche });
                }
            }
        }
        cache.insert(cle.clone(), v);
    }
    cache[&cle].clone()
}

/// La matrice 2 x 2 d'une ligne seule (`_ligne_seule`) a la frequence f :
/// le calcul de la cascade simple (`_ligne_a`), rugosite propre du plan
/// comprise (`_rugosite_section`, 5.4.0).
pub fn _abcd_ligne_seule(ls: &LigneSeule, couches: &[Json], f: f64, opts: Option<&OptionsModele>, longueur_m: f64) -> Res<C2> {
    let kw = kw_reunis(_geometrie_pertes(&ls.info, false, false), _rugosite_section(couches, ls.couche, &ls.info));
    let (eps_f, z_f, a_c, a_d) = _ligne_a(ls.z0, ls.eps, &ls.info, f, ls.largeur * 1e-3, ls.ep * 1e-3, &kw, opts)?;
    let beta = 2.0 * PI * f * eps_f.sqrt() / tl::C_0;
    let (zc, gamma) = tl::ligne_a_pertes(z_f, a_c, a_d, beta);
    Ok(tl::abcd_line(zc, gamma, longueur_m))
}

/// (troncon, abscisse en mm depuis son debut) du point de la piste le plus
/// proche de (x, y) : la ou poser un via du brin N seul. Projete sur l'axe
/// de chaque troncon cascade, borne a ses deux bouts.
pub fn _abscisse_sur_la_piste(objets: &[Json], segments: &[Json], x: f64, y: f64) -> (usize, f64) {
    let mut meilleur = (f64::INFINITY, 0usize, 0.0);
    for (i, o) in objets.iter().enumerate() {
        if i >= segments.len() || numd(&segments[i], "z0", 0.0) <= 0.0 {
            continue;
        }
        let (Some(a), Some(b)) = (_bout(o, "start"), _bout(o, "end")) else { continue };
        let (ux, uy) = (b.0 - a.0, b.1 - a.1);
        let lg = py::hypot(ux, uy);
        let t = if lg < 1e-12 { 0.0 } else { maxf(&[0.0, minf(&[lg, ((x - a.0) * ux + (y - a.1) * uy) / lg])]) };
        let (px, py_) = if lg > 1e-12 { (a.0 + ux * t / lg, a.1 + uy * t / lg) } else { a };
        let d = py::hypot(x - px, y - py_);
        if d < meilleur.0 - 1e-9 {
            // l'abscisse rapportee a la longueur que la cascade emploie
            let k = if lg > 1e-12 { numd(&segments[i], "longueur", lg) / lg } else { 0.0 };
            meilleur = (d, i, t * k);
        }
    }
    (meilleur.1, meilleur.2)
}

/// Le meme via traverse dans l'autre sens : moignons et pastilles de
/// depart et d'arrivee echanges.
pub fn _retourner_via(mv: &ModeleVia) -> ModeleVia {
    let mut out = mv.clone();
    if let Some(lg) = out.ligne.as_mut() {
        std::mem::swap(&mut lg.c_depart, &mut lg.c_arrivee);
    }
    std::mem::swap(&mut out.moignon_depart, &mut out.moignon_arrivee);
    out
}

/// LE VIA D'UN CHANGEMENT DE COUCHE DU BRIN N SEUL (5.5.0) : (mv, note).
///
/// Le document ne dessine pas le via de la partenaire avec ses retours et sa
/// cavite ; la piste, si. On prend donc le modele d'un via de la piste :
///   · DE MEMES COUCHES, tel quel -- c'est le meme dessin, a cote --,
///     retourne s'il est traverse dans l'autre sens (`_retourner_via`) ;
///   · sinon celui dont la hauteur traversee est la plus proche, son L et la
///     part repartie de son C ramenes a la hauteur du via de N (les
///     pastilles restent), sans moignon -- ses moignons sont ceux d'autres
///     couches ;
///   · sans via sur la piste, un barreau seul : la self partielle de Grover
///     d'un percage de 0,3 mm sur la hauteur traversee, sans capacite --
///     un PLANCHER, dit comme tel.
/// `vias_piste` : [(mv, couche de depart, couche d'arrivee)] de la piste.
pub fn _via_du_brin_n(vias_piste: &[(ModeleVia, i64, i64)], couches: &[Json], a: i64, b: i64) -> Res<(ModeleVia, String)> {
    let (lo, hi) = (a.min(b), a.max(b));
    let h_n = _hauteur_via(couches, &lo.j(), &hi.j());
    for (mv, a_p, b_p) in vias_piste {
        if (*a_p, *b_p) == (a, b) {
            return Ok((mv.clone(), "celui de la piste, mêmes couches".into()));
        }
    }
    for (mv, a_p, b_p) in vias_piste {
        if (*b_p, *a_p) == (a, b) {
            return Ok((_retourner_via(mv), "celui de la piste, mêmes couches".into()));
        }
    }
    let mut proche: Option<(f64, &ModeleVia, f64)> = None;
    for (mv, _, _) in vias_piste {
        let (g_lo, g_hi) = mv.geo.as_ref().map_or((0, 0), |g| (g.lo, g.hi));
        let h_p = _hauteur_via(couches, &g_lo.j(), &g_hi.j());
        if h_p > 0.0 && proche.is_none_or(|p| (h_p - h_n).abs() < p.0) {
            proche = Some(((h_p - h_n).abs(), mv, h_p));
        }
    }
    if let Some((_, mv, h_p)) = proche.filter(|_| h_n > 0.0) {
        let k = h_n / h_p;
        let mut out = mv.clone();
        let c_pastilles = out.ligne.as_ref().map_or(0.0, |lg| lg.c_depart + lg.c_arrivee);
        if let Some(lg) = out.ligne.as_mut() {
            lg.longueur *= k;
        }
        out.l = mv.l * k;
        out.c = c_pastilles + (mv.c - c_pastilles) * k;
        out.moignon_depart = Json::Nul;
        out.moignon_arrivee = Json::Nul;
        return Ok((out, format!("celui de la piste ramené à {} mm de hauteur", fmt_g(h_n, 3))));
    }
    let d_m = 0.3e-3;
    let l_v = if h_n > 0.0 { tl::inductance_partielle_propre(0.0, maxf(&[h_n, 1e-3]) * 1e-3, d_m / 2.0)? } else { 0.0 };
    Ok((ModeleVia { l: l_v, c: 0.0, percage: 0.3, antipad: 0.6,
                    modele: Some("pi"),
                    geo: Some(GeoVia { lo, hi, ..Default::default() }),
                    ..Default::default() },
        "barreau seul (self partielle, plancher), la piste n'ayant pas \
         de via à reprendre".into()))
}

/// Un coude du parcours, brin par brin : l'angle sur P, l'angle sur N, la largeur de N.
#[derive(Debug, Clone, PartialEq)]
pub struct CoudePaire {
    pub p: Option<f64>,
    pub n: Option<f64>,
    pub largeur_n: f64,
}

/// Deux brins superposes sur un troncon (`superposees`).
#[derive(Debug, Clone, PartialEq)]
pub struct Superposee {
    pub md: ModesBrins,
    pub recouvrement_mm: f64,
    pub decalage_mm: f64,
    pub homogene: bool,
}

/// Ce que `_brins_de_la_paire` rend.
#[derive(Debug, Clone, Default)]
pub struct Brins {
    /// par troncon : « deux » ou « p »
    pub vias: BTreeMap<usize, &'static str>,
    /// par troncon : (abscisse en mm, modele) des vias du brin N seul
    pub vias_n: BTreeMap<usize, Vec<(f64, ModeleVia)>>,
    pub superposees: BTreeMap<usize, Superposee>,
    pub coudes: BTreeMap<usize, CoudePaire>,
    pub sections: BTreeMap<usize, ModesBrins>,
    pub seuls_n: BTreeMap<usize, LigneSeule>,
    pub brin_long: Option<&'static str>,
    pub surlongueur_mm: f64,
    pub largeur_n: Option<f64>,
    pub couche_n: Option<i64>,
    pub dissymetries: Vec<String>,
    pub notes: Vec<String>,
}

fn m2(m: &Json) -> M2 {
    std::array::from_fn(|i| std::array::from_fn(|j| m[i][j].as_f64().unwrap_or(0.0)))
}

/// CE QUI DISTINGUE LES DEUX BRINS de la paire, troncon par troncon :
/// {vias, vias_n, coudes, sections, seuls_n, superposees, brin_long,
///  surlongueur_mm, largeur_n, couche_n, dissymetries, notes}.
///
/// LA PARTENAIRE EST CE QUE LE DOCUMENT EN DIT (`voisinage`, son net). On
/// n'en tire que ce qui est sur :
///   · SES COUCHES, si chaque bout en porte une. Un via de la piste entre
///     les couches a et b n'a de vis-a-vis que si la partenaire a du
///     cuivre sur a ET sur b, ou un via dessine a moins de
///     ECART_VIAS_PAIRE_MAX ; sinon il est sur le brin P seul. Sans couche
///     connue, les deux brins ont le leur, comme avant ;
///   · SES COUDES, si ses bouts se suivent (`_coudes_brin`). Chacun se
///     range au coude de la piste le plus proche (a ECART_VIAS_PAIRE_MAX
///     pres), ou a son raccord le plus proche s'il n'a pas de vis-a-vis ;
///     un coude de la piste sans vis-a-vis reste sur P seul. Sans chaine,
///     ceux de la piste, sur les deux brins ;
///   · SA LONGUEUR : la plus longue des deux designe le brin qui porte la
///     surlongueur ;
///   · SES PROPRES CHANGEMENTS DE COUCHE (5.5.0) : un via de la partenaire
///     sans via de la piste a ECART_VIAS_PAIRE_MAX est un via sur le brin N
///     SEUL (`vias_n`), pose au raccord de la piste le plus proche, avec le
///     modele de `_via_du_brin_n` ; un via de la piste « sur les deux » que
///     plus aucun via de la partenaire n'accompagne passe sur P seul ;
///   · SA COUCHE, AU-DESSUS OU AU-DESSOUS (5.5.0) : une partenaire restee
///     sur une autre couche sans plan entre les deux, et qui passe au-dessus
///     de la piste, la COUPLE en large face (`superposees`) -- la section a
///     deux niveaux de `ligne_mom.section_deux_niveaux`, decalage lateral
///     compris, sur la longueur de recouvrement.
#[allow(clippy::too_many_arguments)]
pub fn _brins_de_la_paire(
    couches: &[Json], objets: &[Json], segments: &[Json], chaleur: &[Json], doc: &Json, partenaire: Option<&str>,
    modeles_via: &BTreeMap<usize, ModeleVia>, coudes_par_troncon: &BTreeMap<usize, Json>, long_p: f64, long_n: f64,
) -> Res<Brins> {
    let nom_n = partenaire.unwrap_or("");
    let nom_p = if doc["net"].vrai() { str_py(&doc["net"]) } else { "P".to_string() };
    let objs_n: Vec<&Json> = match partenaire {
        Some(p) if !p.is_empty() => els(&doc["voisinage"]).iter().filter(|v| str_ou_vide(&v["net"]) == p).collect(),
        _ => Vec::new(),
    };
    let mut sortie = Brins { vias: modeles_via.keys().map(|&i| (i, "deux")).collect(), ..Default::default() };
    for (&i, c) in coudes_par_troncon {
        let largeur = segments.get(i).map_or(0.2, |seg| numd(seg, "largeur", 0.2));
        sortie.coudes.insert(i, CoudePaire { p: c["angle_deg"].as_f64(), n: c["angle_deg"].as_f64(), largeur_n: largeur });
    }

    let largeurs_n: Vec<f64> = objs_n.iter().map(|v| _nombre(&v["width"], 0.0)).filter(|w| *w > 0.0).collect();
    // shortcut: a egalite de compte, la premiere largeur rencontree (Python prenait celle que
    // l'ordre de son `set` donnait) ; a trancher si une partenaire porte deux largeurs a parts egales
    let mut compte = 0;
    for w in &largeurs_n {
        let n = largeurs_n.iter().filter(|x| *x == w).count();
        if n > compte {
            compte = n;
            sortie.largeur_n = Some(*w);
        }
    }

    // -- les sections couplees ---------------------------------------------
    let mut premiere: Option<usize> = None;
    for (i, seg) in segments.iter().enumerate() {
        let c = chaleur.get(i).unwrap_or(&Json::Nul);
        let mp = &c["matrices_paire"];
        if !(c.vrai() && c["z_diff"].vrai() && mp.vrai() && numd(seg, "z0", 0.0) > 0.0) {
            continue;
        }
        let (lm_, cm_) = (m2(&mp["l"]), m2(&mp["c"]));

        let ecart = |m: &M2| (m[0][0] - m[1][1]).abs() / maxf(&[m[0][0].abs(), m[1][1].abs(), 1e-30]);
        if maxf(&[ecart(&lm_), ecart(&cm_)]) <= SEUIL_DISSYMETRIE && (num(mp, "largeur_p") - num(mp, "largeur_n")).abs() <= 1e-6 {
            continue;
        }
        let Some(mut md) = _modes_brins(&lm_, &cm_) else {
            sortie.notes.push(format!(
                "Tronçon {} : section de la paire sans modes propres \
                 lisibles, moyennée comme une paire symétrique.", i));
            continue;
        };
        md.largeur = 0.5 * (num(mp, "largeur_p") + num(mp, "largeur_n"));
        sortie.sections.insert(i, md);
        premiere.get_or_insert(i);
        if sortie.largeur_n.is_none() {
            sortie.largeur_n = Some(num(mp, "largeur_n"));
        }
    }
    if let Some(i) = premiere {
        let mp = &chaleur[i]["matrices_paire"];
        sortie.dissymetries.push(format!("section dissymétrique sur {} tronçon(s) (largeurs \
                                          {} / {} mm)", sortie.sections.len(), fmt_g(num(mp, "largeur_p"), 3),
                                         fmt_g(num(mp, "largeur_n"), 3)));
    }

    // -- les couches de la partenaire, et les vias ---------------------------
    let mut couches_n: BTreeSet<i64> = BTreeSet::new();
    let mut connu = !objs_n.is_empty();
    for v in &objs_n {
        let k = ent(&v["layer"], -1);
        if k < 0 {
            connu = false;
            break;
        }
        couches_n.insert(k);
    }
    if connu && couches_n.len() == 1 {
        sortie.couche_n = couches_n.first().copied();
    }
    let couche_de = |i: usize| ent(&objets[i]["layer"], -1);
    let mut n_seul_p = 0;
    for (&i, mv) in modeles_via {
        if !connu || i < 1 || i >= objets.len() {
            continue;
        }
        if couches_n.contains(&couche_de(i - 1)) && couches_n.contains(&couche_de(i)) {
            continue;
        }
        if let Some(geo) = mv.geo.as_ref().filter(|g| g.a_position) {
            if _via_de_la_partenaire(doc, nom_n, geo.x_mm, geo.y_mm).is_some() {
                continue;
            }
        }
        sortie.vias.insert(i, "p");
        n_seul_p += 1;
    }
    if n_seul_p > 0 {
        sortie.dissymetries.push(format!("{} via(s) sur le brin {} seul", n_seul_p, nom_p));
    }
    // LES VIAS DE LA PARTENAIRE SANS VIS-A-VIS (5.5.0) : chaque changement
    // de couche de sa chaine, apparie au via « sur les deux » de la piste le
    // plus proche (a ECART_VIAS_PAIRE_MAX) ; les autres sont sur N seul, au
    // raccord de la piste le plus proche, et un via « sur les deux » reste
    // sans partenaire passe sur P seul -- celui de N est ailleurs.
    let mut raccords: BTreeMap<usize, (f64, f64)> = BTreeMap::new();
    for i in 1..objets.len() {
        let pt = match _raccord(&objets[i - 1], &objets[i]) {
            Some(r) => Some((r.0, r.1)),
            None => _bout(&objets[i], "start"),
        };
        if let Some(pt) = pt {
            raccords.insert(i, pt);
        }
    }
    let vias_piste: Vec<(ModeleVia, i64, i64)> = modeles_via.iter().filter(|(&i, _)| 1 <= i && i < objets.len())
        .map(|(&i, mv)| (mv.clone(), couche_de(i - 1), couche_de(i))).collect();
    // le plus proche des `libres` qui ont un raccord : (distance, rang), le plus petit couple
    let plus_proche = |libres: &BTreeSet<usize>, x: f64, y: f64| -> Option<(f64, usize)> {
        libres.iter().filter_map(|i| raccords.get(i).map(|r| (py::hypot(r.0 - x, r.1 - y), *i)))
            .min_by(|a, b| a.0.total_cmp(&b.0).then(a.1.cmp(&b.1)))
    };
    let coudes_n = if objs_n.is_empty() { None } else { _coudes_brin(&objs_n) };
    if connu && couches_n.len() >= 2 && coudes_n.is_some() {
        let mut libres: BTreeSet<usize> = sortie.vias.iter().filter(|(_, x)| **x == "deux").map(|(i, _)| *i).collect();
        let mut n_seul_n = 0;
        for w in objs_n.windows(2) {
            let (a_o, b_o) = (w[0], w[1]);
            let ca_ = ent(&a_o["layer"], -1);
            let cb_ = ent(&b_o["layer"], -1);
            if ca_ == cb_ {
                continue;
            }
            let Some(r) = _raccord(a_o, b_o) else { continue };
            if let Some((d, i)) = plus_proche(&libres, r.0, r.1) {
                if d <= ECART_VIAS_PAIRE_MAX {
                    libres.remove(&i);
                    continue;
                }
            }
            let (i, t_mm) = _abscisse_sur_la_piste(objets, segments, r.0, r.1);
            let (mv_n, note) = _via_du_brin_n(&vias_piste, couches, ca_, cb_)?;
            sortie.vias_n.entry(i).or_default().push((t_mm, mv_n));
            n_seul_n += 1;
            sortie.notes.push(format!(
                "Via du brin {} seul ({} → {}) : modèle {}.",
                nom_n, _nom_de_couche(couches, ca_),
                _nom_de_couche(couches, cb_), note));
        }
        for &i in &libres {
            sortie.vias.insert(i, "p");
        }
        if !libres.is_empty() {
            sortie.dissymetries.push(format!("{} via(s) sur le brin {} seul", libres.len(), nom_p));
        }
        if n_seul_n > 0 {
            sortie.dissymetries.push(format!("{} via(s) sur le brin {} seul", n_seul_n, nom_n));
        }
    }

    // -- les troncons que la partenaire ne longe pas -------------------------
    if let Some(cn) = sortie.couche_n {
        let mut cache = CacheSeul::new();
        for (i, seg) in segments.iter().enumerate() {
            let c = chaleur.get(i).unwrap_or(&Json::Nul);
            if numd(seg, "z0", 0.0) <= 0.0 || (c.vrai() && c["z_diff"].vrai()) {
                continue;
            }
            if ent(&seg["couche"], -1) == cn {
                continue;
            }
            let largeur = sortie.largeur_n.filter(|w| *w != 0.0).unwrap_or_else(|| numd(seg, "largeur", 0.2));
            if let Some(ls) = _ligne_seule(couches, cn, largeur, numd(seg, "cuivre", 0.035), &mut cache) {
                sortie.seuls_n.insert(i, ls);
            }
        }
        if !sortie.seuls_n.is_empty() {
            sortie.dissymetries.push(format!("brin {} resté sur {} sur {} tronçon(s)",
                                             nom_n, _nom_de_couche(couches, cn),
                                             sortie.seuls_n.len()));
        }
        // LA PARTENAIRE AU-DESSUS OU AU-DESSOUS (5.5.0) : sans plan entre les
        // deux couches, deux pistes qui se recouvrent en projection couplent
        // en large face -- souvent PLUS qu'a plat. La section a deux niveaux
        // (milieu homogene, la permittivite moyenne entre les plans qui
        // encadrent la paire) en donne [L] et [C], decalage lateral compris.
        let mut n_sup = 0;
        for i in sortie.seuls_n.keys().copied().collect::<Vec<_>>() {
            let seg = &segments[i];
            let k = ent(&seg["couche"], -1);
            if k < 0 || i >= objets.len() || !_plan_entre(couches, k, cn).is_empty() {
                continue;
            }
            let mut meilleur: Option<(f64, f64)> = None;
            for o in &objs_n {
                if ent(&o["layer"], -1) != cn {
                    continue;
                }
                if let Some(sup) = _superposition(&objets[i], o, None, None) {
                    if meilleur.is_none_or(|m| sup.0 > m.0) {
                        meilleur = Some(sup);
                    }
                }
            }
            let Some(meilleur) = meilleur else { continue };
            // LE SEUL APPEL A crosstalk DE CE MODULE : la geometrie de deux couches superposees.
            let Some((h_lo, h_hi, b_mm, er_m)) = crate::crosstalk::geometrie_superposee(couches, k, cn) else { continue };
            let (h_p, h_n) = if k < cn { (h_lo, h_hi) } else { (h_hi, h_lo) };
            let w_p = numd(seg, "largeur", 0.2);
            let w_n = sortie.largeur_n.filter(|w| *w != 0.0).unwrap_or(w_p);
            let resolu = tl::section_deux_niveaux(
                &[tl::Ruban { x: 0.0, y: h_p * 1e-3, w: w_p * 1e-3 },
                  tl::Ruban { x: meilleur.1 * 1e-3, y: h_n * 1e-3,
                              w: w_n * 1e-3 }],
                b_mm.filter(|b| *b != 0.0).map(|b| b * 1e-3), er_m, 30, 8);
            let md = match resolu {
                Ok(r) => {
                    let m = |v: &[Vec<f64>]| -> M2 { std::array::from_fn(|a| std::array::from_fn(|b| v[a][b])) };
                    _modes_brins(&m(&r.l), &m(&r.c))
                }
                Err(exc) => {
                    sortie.notes.push(format!(
                        "Tronçon {} : brins superposés non résolus ({}), laissés \
                         seuls chacun sur sa couche.", i, exc));
                    None
                }
            };
            let Some(mut md) = md else { continue };
            md.largeur = 0.5 * (w_p + w_n);
            sortie.superposees.insert(i, Superposee {
                md, recouvrement_mm: minf(&[meilleur.0, numd(seg, "longueur", 0.0)]),
                decalage_mm: meilleur.1, homogene: b_mm.is_some() });
            n_sup += 1;
        }
        if n_sup > 0 {
            sortie.dissymetries.push(format!("brins {} et {} superposés sur {} tronçon(s), \
                                              couplés en large face", nom_p, nom_n, n_sup));
            if sortie.superposees.values().any(|x| !x.homogene) {
                sortie.notes.push(
                    "Brins superposés sous un seul plan : la section à deux \
                     niveaux est résolue en milieu homogène (sans l'air du \
                     dessus) — couplage approché.".into());
            }
        }
    }

    // -- les coudes, brin par brin -------------------------------------------
    if let Some(coudes_n) = coudes_n {
        let coudes = &mut sortie.coudes;
        for e in coudes.values_mut() {
            e.n = None;
        }
        let mut libres: BTreeSet<usize> = coudes.keys().copied().collect();
        let mut n_seul_n = 0;
        for cn in &coudes_n {
            if let Some((d, i)) = plus_proche(&libres, cn.x, cn.y) {
                if d <= ECART_VIAS_PAIRE_MAX {
                    libres.remove(&i);
                    if let Some(e) = coudes.get_mut(&i) {
                        e.n = Some(cn.angle_deg);
                        if cn.largeur != 0.0 {
                            e.largeur_n = cn.largeur;
                        }
                    }
                    continue;
                }
            }
            let i = raccords.iter().filter(|(i, _)| coudes.get(i).is_none_or(|e| e.n.is_none()))
                .map(|(i, p)| (py::hypot(p.0 - cn.x, p.1 - cn.y), *i))
                .min_by(|a, b| a.0.total_cmp(&b.0).then(a.1.cmp(&b.1))).map_or(0, |t| t.1);
            let largeur = if cn.largeur != 0.0 { cn.largeur } else { 0.2 };
            let e = coudes.entry(i).or_insert(CoudePaire { p: None, n: None, largeur_n: largeur });
            e.n = Some(cn.angle_deg);
            e.largeur_n = largeur;
            libres.remove(&i);
            n_seul_n += 1;
        }
        let n_seul_pc = coudes.values().filter(|e| e.p.is_some() && e.n.is_none()).count();
        if n_seul_pc > 0 || n_seul_n > 0 {
            sortie.dissymetries.push(format!("coudes sur un seul brin ({} sur {}, {} sur {})",
                                             n_seul_pc, nom_p, n_seul_n, nom_n));
        }
    }

    // -- la surlongueur, sur le brin le plus long ----------------------------
    if long_n > 0.0 && long_p > 0.0 {
        let dl = long_p - long_n;
        if dl.abs() > DELTA_L_SYMETRIE_MM {
            sortie.brin_long = Some(if dl > 0.0 { "p" } else { "n" });
            sortie.surlongueur_mm = dl.abs();
            sortie.dissymetries.push(format!("brin {} plus long de {} mm",
                                             if dl > 0.0 { &nom_p } else { nom_n }, fmt_g(dl.abs(), 3)));
        }
    }
    Ok(sortie)
}
