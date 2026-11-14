//! Les vias de masse, les surfaces de cuivre (pastilles, zones, chemins de masse) et le
//! domaine de validite.

use crate::alg::*;
use crate::{se, tl, ErreurRF, Res};
use dc_solver::pyth::{elements, float_py, int_py, str_py};
use em::simulation_em::base::*;
use std::collections::HashMap;
use std::f64::consts::PI;
use std::rc::Rc;
use std::sync::Mutex;

// ==========================================================================
// Les vias de masse d'un composant en derivation
// ==========================================================================

/// L des vias qui descendent une pastille au plan, EN HENRYS.
///
/// Chaque via est un filament de la pastille jusqu'au plan qu'il rejoint ;
/// plusieurs vias en parallele portent chacun 1/n du courant, et leur
/// mutuelle compte : L = somme(M_ij) / n^2. C'est la self PARTIELLE -- un
/// plancher, le retour par le plan n'y est pas.
pub fn inductance_masse(couches: &[Json], couche_pastille: i64, vias: &[Json]) -> Res<f64> {
    let mut fil = Vec::new();
    for v in vias {
        let h = se::_hauteur_via(couches, &Json::Entier(couche_pastille), &Json::Entier(ent(&v["couche_plan"], couche_pastille)));
        let r = 0.5 * _nombre(&v["percage"], 0.3);
        if h > 0.0 && r > 0.0 {
            fil.push((nb(&v["x"]) * 1e-3, nb(&v["y"]) * 1e-3, h * 1e-3, r * 1e-3));
        }
    }
    if fil.is_empty() {
        return Ok(0.0);
    }
    let mut total = 0.0;
    for (i, &(xi, yi, hi, ri)) in fil.iter().enumerate() {
        for (j, &(xj, yj, hj, _)) in fil.iter().enumerate() {
            if i == j {
                total += tl::inductance_partielle_propre(0.0, hi, ri)?;
            } else {
                let d = maxf(&[py::hypot(xi - xj, yi - yj), ri]);
                total += tl::mutuelle_partielle(0.0, hi, 0.0, hj, d)?;
            }
        }
    }
    Ok(total / (fil.len() * fil.len()) as f64)
}

pub fn _db(x: Complex64) -> f64 {
    20.0 * maxf(&[x.norm(), 1e-15]).log10()
}

// ==========================================================================
// Les surfaces de cuivre : pastilles, zones, chemins de masse
// --------------------------------------------------------------------------
// TOUT SE CHIFFRE PAR LE MEME SOLVEUR QUE LES PISTES. Une pastille est une
// capacite au plan : la capacite par metre d'une ligne de sa largeur (MoM)
// fois sa longueur, allongee a chaque bout de l'extension de bout ouvert de
// Hammerstad -- la frange que la section droite ne voit pas. La piste qui y
// entre est deja comptee par sa branche : ce morceau-la est retranche.
//
// UNE ZONE EST MAILLEE, pas reduite a un noeud : une grille de cellules, une
// capacite par cellule (surface ET bord, les deux tires de deux resolutions
// MoM), une self et une resistance de peau par lien entre cellules voisines.
// Ce qui la touche s'accroche a la cellule la plus proche.
// ==========================================================================

pub const SIGMA_CU: f64 = 5.8e7;
pub const MU_0: f64 = 4e-7 * PI;
pub const MAX_CELLULES: usize = 30000;

/// Ce que `_ligne` rend (un dict en Python).
#[derive(Debug, Clone, PartialEq)]
pub struct LigneSeule {
    /// F/m
    pub c: f64,
    /// H/m
    pub l: f64,
    pub z0: f64,
    pub eps: f64,
    /// m
    pub h: f64,
    pub er: f64,
    pub tan_delta: f64,
    pub kw_pertes: Json,
    pub ep: f64,
}

/// Le `cache` d'un calcul (un dict en Python) : les lignes seules, les pastilles et la
/// capacite par metre du modele 3D.
#[derive(Debug, Default)]
pub struct Cache {
    lignes: HashMap<(i64, u64, u64), Option<Rc<LigneSeule>>>,
    pastilles: HashMap<(i64, u64, u64, u64), Option<(f64, f64)>>,
    lineique: HashMap<(i64, u64), f64>,
}

// la cle d'un flottant : 0.0 et -0.0 sont la meme, comme dans un dict
fn bits(x: f64) -> u64 {
    (x + 0.0).to_bits()
}

/// La ligne seule de cette largeur : {c (F/m), l (H/m), z0, eps, h (m),
/// er}, ou None si la section n'a pas de plan en face.
pub fn _ligne(couches: &[Json], couche: i64, largeur_mm: f64, ep_mm: f64, cache: &mut Cache) -> Option<Rc<LigneSeule>> {
    let cle = (couche, bits(round(largeur_mm, 5)), bits(round(ep_mm, 5)));
    if let Some(l) = cache.lignes.get(&cle) {
        return l.clone();
    }
    let (geo, info) = se::section_de_couche(couches, couche, largeur_mm, ep_mm, 0.0, Some(0.0), &[], false);
    let r = geo.as_ref().and_then(|g| tl::solve_line(&se::geometrie(g)).ok()).filter(|r| r.z0 > 0.0);
    let l = r.map(|r| {
        Rc::new(LigneSeule {
            c: r.eps_eff.sqrt() / (tl::C_0 * r.z0),
            l: r.z0 * r.eps_eff.sqrt() / tl::C_0,
            z0: r.z0,
            eps: r.eps_eff,
            h: num(&info, "h"),
            er: num(&info, "er"),
            tan_delta: num(&info, "tan_delta"),
            // LES OPTIONS DE PERTES DE CETTE SECTION (1.6.0) : la ligne est
            // seule face a son plan, sans masse coplanaire -- elle recoit sa
            // topologie, sa hauteur (h au plan, ou b entre plans) et la
            // rugosite de sa couche. Voir `simulation_em._geometrie_pertes`.
            kw_pertes: se::kw_reunis(se::_geometrie_pertes(&info, false, false), se::_rugosite_section(couches, couche, &info)),
            ep: ep_mm,
        })
    });
    cache.lignes.insert(cle, l.clone());
    l
}

pub const EPS_0: f64 = 8.8541878128e-12;

static _CACHE_3D: Mutex<Option<HashMap<[u64; 6], f64>>> = Mutex::new(None);

/// Voir `_plaque_3d`. Le resultat ne depend que de la geometrie : il est
/// garde d'un calcul a l'autre, et un « et si » ne le refait pas.
///
/// Les defauts du Python : `h2` None, `n` 20, `er` 1.
pub fn capacite_plaque_3d(w: f64, l: f64, h1: f64, h2: Option<f64>, n: usize, er: f64) -> Res<f64> {
    let r = |v: f64| bits(round(v, 12));
    let cle = [r(w), r(l), r(h1), h2.map_or(u64::MAX, r), r(er), n as u64];
    if let Some(v) = _CACHE_3D.lock().unwrap().as_ref().and_then(|c| c.get(&cle)) {
        return Ok(*v);
    }
    let v = _plaque_3d(w, l, h1, h2, n, er)?;
    let mut garde = _CACHE_3D.lock().unwrap();
    let cache = garde.get_or_insert_with(HashMap::new);
    if cache.len() > 2000 {
        cache.clear();
    }
    cache.insert(cle, v);
    Ok(v)
}

/// Remplit une matrice n x n rangee par rangee, sur tous les coeurs des qu'elle est grande :
/// chaque case ne depend que de ses indices, le resultat est le meme quel que soit le nombre
/// de fils -- c'est ce que numpy faisait d'un trait.
fn par_rangees(n: usize, f: impl Fn(usize, &mut [f64]) + Sync) -> Vec<f64> {
    let mut k = vec![0.0; n * n];
    let fils = if n < 200 { 1 } else { std::thread::available_parallelism().map_or(1, |k| k.get()).min(n) };
    let par_fil = n.div_ceil(fils.max(1)).max(1);
    std::thread::scope(|s| {
        for (g, bloc) in k.chunks_mut(par_fil * n).enumerate() {
            let f = &f;
            let mut tache = move || bloc.chunks_mut(n).enumerate().for_each(|(i, rangee)| f(g * par_fil + i, rangee));
            if fils == 1 {
                tache();
            } else {
                s.spawn(tache);
            }
        }
    });
    k
}

/// C (F) d'une plaque rectangulaire w x l (m), mince, a h1 au-dessus d'un
/// plan de masse -- et a h2 sous un second en triplaque --, DANS LE VIDE.
///
/// Methode des moments en 3D : n x n panneaux a densite de charge uniforme,
/// serres vers les bords (pas en cosinus : c'est la que la charge se
/// concentre), plans remplaces par leurs images. Toutes les interactions
/// sont EXACTES : l'integrale de 1/r sur un rectangle a une primitive,
/// F = u ln(v + R) + v ln(u + R) - z atan(uv / zR).
pub fn _plaque_3d(w: f64, l: f64, h1: f64, h2: Option<f64>, n: usize, er: f64) -> Res<f64> {
    // LE PAS SUIT AUSSI LA HAUTEUR AU PLAN : au milieu d'une plaque longue,
    // un panneau plus grand que h ne resout plus l'image. Au moins n panneaux
    // par cote, et un pas median sous h/2.
    let h_min = h2.map_or(h1, |h2| dc_solver::pyth::min_py(h1, h2));

    let bords = |a: f64| -> Res<Vec<f64>> {
        let q = (PI * a / h_min).ceil();
        if !q.is_finite() {
            // `math.ceil` d'un infini ou d'un NaN, ou la division par une hauteur nulle
            return Err(ErreurRF::interne("plaque 3D : hauteur ou cote non calculable"));
        }
        let m = (q.max(n as f64).min(120.0)) as usize;
        let pas = PI / m as f64;
        Ok((0..=m).map(|k| ((1.0 - if k == m { PI } else { k as f64 * pas }.cos()) / 2.0 - 0.5) * a).collect())
    };
    let (xb, yb) = (bords(w)?, bords(l)?);
    let (mx, my) = (xb.len() - 1, yb.len() - 1);
    let nn = mx * my;
    let (mut x1, mut x2, mut y1, mut y2) = (Vec::with_capacity(nn), Vec::with_capacity(nn), Vec::with_capacity(nn), Vec::with_capacity(nn));
    for i in 0..mx {
        for j in 0..my {
            x1.push(xb[i]);
            x2.push(xb[i + 1]);
            y1.push(yb[j]);
            y2.push(yb[j + 1]);
        }
    }
    let cx: Vec<f64> = (0..nn).map(|k| (x1[k] + x2[k]) / 2.0).collect();
    let cy: Vec<f64> = (0..nn).map(|k| (y1[k] + y2[k]) / 2.0).collect();
    let aire: Vec<f64> = (0..nn).map(|k| (x2[k] - x1[k]) * (y2[k] - y1[k])).collect();

    fn ln_plus(a: f64, r: f64, s2: f64) -> f64 {
        // ln(a + R) sans perte quand a est negatif : (a + R)(R - a) = s2.
        if a >= 0.0 { (a + r).max(1e-300).ln() } else { s2.max(1e-300).ln() - (r - a).max(1e-300).ln() }
    }

    fn prim(u: f64, v: f64, z: f64) -> f64 {
        let r = (u * u + v * v + z * z).sqrt();
        let mut f = u * ln_plus(v, r, u * u + z * z) + v * ln_plus(u, r, v * v + z * z);
        if z != 0.0 {
            f -= z * (u * v).atan2(z * r);
        }
        f
    }

    let noyau = |i: usize, j: usize, dz: f64| -> f64 {
        let (xi, yi) = (cx[i], cy[i]);
        prim(x2[j] - xi, y2[j] - yi, dz) - prim(x1[j] - xi, y2[j] - yi, dz) - prim(x2[j] - xi, y1[j] - yi, dz) + prim(x1[j] - xi, y1[j] - yi, dz)
    };

    let echelle = 4.0 * PI * EPS_0;
    let k = match h2 {
        None => {
            // LE STRATIFIE, EXACTEMENT (quasi-statique) : une charge posee sur un
            // dielectrique d'epaisseur h au-dessus de son plan voit une serie
            // d'images, G = 2/(1+er) sum (-K)^m [1/R(2mh) - 1/R(2(m+1)h)],
            // K = (er-1)/(er+1). Dans le vide, K = 0 : l'image seule.
            let kk = (er - 1.0) / (er + 1.0);
            let pan = maxf(&[maxf(&(0..nn).map(|k| x2[k] - x1[k]).collect::<Vec<_>>()), maxf(&(0..nn).map(|k| y2[k] - y1[k]).collect::<Vec<_>>())]);
            par_rangees(nn, |i, rangee| {
                for (j, case) in rangee.iter_mut().enumerate() {
                    let rho = ((cx[i] - cx[j]).powi(2) + (cy[i] - cy[j]).powi(2)).sqrt();
                    // loin : le panneau vaut un point
                    let image = |dz: f64| if dz > 4.0 * pan { aire[j] / (rho * rho + dz * dz).sqrt() } else { noyau(i, j, dz) };
                    let (mut total, mut g_prec, mut coef, mut m) = (0.0, noyau(i, j, 0.0), 1.0f64, 0usize);
                    loop {
                        let g_suiv = image(2.0 * (m + 1) as f64 * h1);
                        total += coef * (g_prec - g_suiv);
                        m += 1;
                        coef *= -kk;
                        if coef.abs() < 1e-7 || m > 200 {
                            break;
                        }
                        g_prec = g_suiv;
                    }
                    *case = total * 2.0 / (1.0 + er) / echelle;
                }
            })
        }
        Some(h2) => {
            let b = h1 + h2;
            let mut images = Vec::new();
            for m in -6i32..7 {
                if m != 0 {
                    images.push((2.0 * m as f64 * b, 1.0));
                }
                images.push((2.0 * m as f64 * b - 2.0 * h1, -1.0));
            }
            par_rangees(nn, |i, rangee| {
                for (j, case) in rangee.iter_mut().enumerate() {
                    let mut k = noyau(i, j, 0.0);
                    for &(dz, signe) in &images {
                        k += signe * noyau(i, j, dz.abs());
                    }
                    *case = k / echelle;
                }
            })
        }
    };
    let sigma = resoudre_uns(nn, &k).ok_or_else(|| ErreurRF::interne("LinAlgError : Singular matrix"))?;
    Ok(somme_np(&sigma.iter().zip(&aire).map(|(s, a)| s * a).collect::<Vec<_>>()))
}

/// C au plan d'une pastille w x l, EN FARADS, franges comprises.
///
/// LA FORME EST RESOLUE EN 3D (`capacite_plaque_3d`) : plaque mince sur son
/// stratifie -- fonction de Green exacte du dielectrique sur plan -- ou entre
/// deux plans en triplaque. Ses bouts, ses coins, ses bords, tout y est.
///
/// L'EMPILAGE REEL, lui, est celui du MoM 2D : vernis epargne, epaisseur du
/// cuivre, dielectriques empiles. On etalonne donc le 3D sur la ligne
/// infinie : C = C3D(w, l) x C'2D / C'3D, ou C'3D est la capacite par metre
/// que le MEME modele 3D donne a une plaque tres longue (difference de deux
/// longueurs, pour que les bouts s'annulent).
pub fn capacite_pastille(couches: &[Json], couche: i64, w_mm: f64, l_mm: f64, ep: f64, cache: &mut Cache) -> Res<Option<(f64, f64)>> {
    let cle = (couche, bits(round(w_mm, 5)), bits(round(l_mm, 5)), bits(round(ep, 5)));
    if let Some(r) = cache.pastilles.get(&cle) {
        return Ok(*r);
    }
    let (geo, info) = se::section_de_couche(couches, couche, w_mm, ep, 0.0, Some(0.0), &[], false);
    let li = _ligne(couches, couche, w_mm, ep, cache);
    let (Some(geo), Some(li)) = (geo, li) else {
        cache.pastilles.insert(cle, None);
        return Ok(None);
    };
    let (h1, h2, er, h_min);
    if geo["kind"].as_str() == Some("strip") {
        (h1, h2, er) = (num(&geo, "y0"), Some(num(&geo, "b") - num(&geo, "y0")), 1.0);
        h_min = dc_solver::pyth::min_py(h1, h2.unwrap_or(h1));
    } else {
        (h1, h2, er) = (num(&info, "h"), None, num(&info, "er"));
        h_min = h1;
    }
    let w = w_mm * 1e-3;
    let cle_l = (couche, bits(round(w_mm, 5)));
    if !cache.lineique.contains_key(&cle_l) {
        let (l1, l2) = (6.0 * h_min, 12.0 * h_min);
        let c1 = capacite_plaque_3d(w, l1, h1, h2, 20, er)?;
        let c2 = capacite_plaque_3d(w, l2, h1, h2, 20, er)?;
        cache.lineique.insert(cle_l, (c2 - c1) / (l2 - l1));
    }
    let c3 = capacite_plaque_3d(w, l_mm * 1e-3, h1, h2, 20, er)?;
    let r = Some((c3 * li.c / cache.lineique[&cle_l], li.eps));
    cache.pastilles.insert(cle, r);
    Ok(r)
}

/// C au plan d'une pastille, EN FARADS, par `capacite_pastille`, moins
/// les recouvrements de piste deja comptes par leur branche. Rend
/// (C, eps_eff).
pub fn capacite_surface(couches: &[Json], s: &Json, cache: &mut Cache) -> Res<(f64, f64)> {
    let couche = ent(&s["couche"], 0);
    let ep = _nombre(&s["cuivre"], 0.035);
    let (a, b) = (nb(&s["largeur"]), nb(&s["longueur"]));
    let (mut w, mut l) = if b < a { (b, a) } else { (a, b) };
    if s["forme"].as_str() == Some("rond") {
        w = w * PI.sqrt() / 2.0; // le carre de meme aire
        l = w;
    }
    if !(w > 0.0 && l > 0.0) {
        return Ok((0.0, 0.0));
    }
    let Some((mut c, eps)) = capacite_pastille(couches, couche, w, l, ep, cache)? else {
        return Ok((0.0, 0.0));
    };
    for rec in els(&s["recouvrements"]) {
        if let Some(lr) = _ligne(couches, couche, nb(&rec["largeur"]), ep, cache) {
            c -= lr.c * nb(&rec["longueur"]) * 1e-3;
        }
    }
    Ok((maxf(&[c, 0.0]), eps))
}

/// Resistance par carre du cuivre a la frequence f, en ohms.
/// shortcut: une seule face conduit (celle du plan), pas de rugosite
pub fn r_peau(f: f64, ep_mm: f64) -> f64 {
    let delta = 1.0 / (PI * f * MU_0 * SIGMA_CU).sqrt();
    1.0 / (SIGMA_CU * dc_solver::pyth::min_py(ep_mm * 1e-3, delta))
}

/// Point dans polygone (parite).
pub fn _poly_np(x: f64, y: f64, p: &[f64]) -> bool {
    let n = p.len() / 2;
    let mut dedans = false;
    let mut j = n.wrapping_sub(1);
    for i in 0..n {
        let (xi, yi, xj, yj) = (p[2 * i], p[2 * i + 1], p[2 * j], p[2 * j + 1]);
        let dy = if yj - yi != 0.0 { yj - yi } else { 1e-300 };
        dedans ^= ((yi > y) != (yj > y)) && (x < (xj - xi) * (y - yi) / dy + xi);
        j = i;
    }
    dedans
}

/// Le carre [qx, qx + s] x [qy, qy + s] est-il traverse par un bord du polygone p ?
/// Liang-Barsky. C'est ce qui garde un cuivre plus etroit que l'echantillonnage d'un
/// grand carre.
pub fn _croise(qx: f64, qy: f64, s: f64, p: &[f64]) -> bool {
    let n = p.len() / 2;
    let mut out = false;
    for i in 0..n {
        let k = if i == 0 { n - 1 } else { i - 1 };
        let (x1, y1, x2, y2) = (p[2 * k], p[2 * k + 1], p[2 * i], p[2 * i + 1]);
        let (dx, dy) = (x2 - x1, y2 - y1);
        let (mut t0, mut t1, mut ok) = (0.0f64, 1.0f64, true);
        for (pp, qq) in [(-dx, x1 - qx), (dx, qx + s - x1), (-dy, y1 - qy), (dy, qy + s - y1)] {
            if pp == 0.0 {
                ok &= qq >= 0.0;
                continue;
            }
            let r = qq / pp;
            if pp < 0.0 {
                t0 = t0.max(r);
            } else {
                t1 = t1.min(r);
            }
        }
        out |= ok && (t0 <= t1);
    }
    out
}

/// Ce que `lire_masque` rend : la grille de bits et sa place.
#[derive(Debug, Clone, PartialEq)]
pub struct Masque {
    nx: i64,
    ny: i64,
    x0: f64,
    y0: f64,
    pas: f64,
    bits: Vec<bool>,
}

impl Masque {
    pub fn dedans(&self, x: f64, y: f64) -> bool {
        let i = ((x - self.x0) / self.pas).floor() as i64;
        let j = ((y - self.y0) / self.pas).floor() as i64;
        (i >= 0) && (i < self.nx) && (j >= 0) && (j < self.ny) && self.bits[(j * self.nx + i) as usize]
    }
}

/// Le cuivre REMPLI d'une zone, tel que l'outil le peint : dégagements et
/// liaisons thermiques compris. Une grille de pas `pas` (mm) depuis (x0, y0),
/// en plages alternees vide / cuivre, rangee par rangee. Rend une fonction
/// (x, y) -> bool, ou None.
pub fn lire_masque(m: &Json) -> Option<Masque> {
    m.as_objet()?;
    let cle = |k: &str| m.get(k);
    let (nx, ny) = (int_py(cle("nx")?).ok()?, int_py(cle("ny")?).ok()?);
    let (x0, y0, pas) = (float_py(cle("x0")?).ok()?, float_py(cle("y0")?).ok()?, float_py(cle("pas")?).ok()?);
    let plages: Vec<i64> = elements(cle("plages")?).ok()?.iter().map(|v| int_py(v).ok()).collect::<Option<_>>()?;
    if !(nx > 0 && ny > 0 && pas > 0.0) || plages.iter().map(|p| *p as i128).sum::<i128>() != nx as i128 * ny as i128 {
        return None;
    }
    let total = nx.checked_mul(ny)?;
    let mut bits = vec![false; total as usize];
    let (mut k, mut plein) = (0i64, false);
    // la borne d'une tranche de Python : un indice negatif compte depuis la fin
    let borne = |i: i64| (if i < 0 { i + total } else { i }).clamp(0, total) as usize;
    for n in plages {
        if plein {
            let (a, b) = (borne(k), borne(k.saturating_add(n)));
            if a < b {
                bits[a..b].fill(true);
            }
        }
        k = k.saturating_add(n);
        plein = !plein;
    }
    Some(Masque { nx, ny, x0, y0, pas, bits })
}

/// Ce que `maillage_zone` rend (un dict en Python).
#[derive(Debug, Clone, PartialEq)]
pub struct Maillage {
    pub cx: Vec<f64>,
    pub cy: Vec<f64>,
    pub c: Vec<f64>,
    pub aire: Vec<f64>,
    pub ia: Vec<usize>,
    pub ib: Vec<usize>,
    pub l_lien: Vec<f64>,
    pub r_lien: Vec<f64>,
    pub ep: f64,
    pub acces: Vec<(String, usize)>,
    pub grossier: bool,
    pub pas_min: f64,
    pub pas_max: f64,
    pub lam: f64,
}

/// Le maillage ADAPTATIF d'une zone de cuivre, en arbre quaternaire.
///
/// Fin pres des acces -- la moitie de la hauteur au plan --, il grossit avec
/// la distance jusqu'a λ/40 a la frequence haute ; le bord du cuivre est
/// raffine a la moitie de la taille visee localement, la ou le courant passe.
/// Le cuivre est celui du contour, moins ses trous, et -- quand l'outil le
/// donne -- restreint a son remplissage reel (`masque`).
///
/// Les cellules sont des volumes finis : chacune porte sa capacite au plan
/// (surface c_s et bord libre c_b, tires de deux resolutions MoM), chaque
/// paire de cellules voisines un lien de conductance g = e / d (longueur de
/// bord commune sur distance des centres), soit une admittance
/// g / (R_carre(f) + jw L_carre). Rend None si la couche n'a pas de plan.
pub fn maillage_zone(couches: &[Json], z: &Json, f_max: f64, cache: &mut Cache) -> Res<Option<Maillage>> {
    let pts: Vec<f64> = els(&z["pts"]).iter().map(nb).collect();
    let trous: Vec<Vec<f64>> = els(&z["trous"]).iter().filter(|t| els(t).len() >= 6).map(|t| els(t).iter().map(nb).collect()).collect();
    if pts.len() < 6 {
        return Ok(None);
    }
    let rempli = lire_masque(&z["masque"]);
    let couche = ent(&z["couche"], 0);
    let ep = _nombre(&z["cuivre"], 0.035);
    let xs: Vec<f64> = pts.iter().step_by(2).copied().collect();
    let ys: Vec<f64> = pts.iter().skip(1).step_by(2).copied().collect();
    let (x0, x1, y0, y1) = (minf(&xs), maxf(&xs), minf(&ys), maxf(&ys));
    let Some(li) = _ligne(couches, couche, 1.0, ep, cache) else {
        return Ok(None);
    };
    if pts.len() % 2 == 1 || trous.iter().any(|t| t.len() % 2 == 1) {
        // un contour au nombre impair de coordonnees : numpy levait dans `_poly_np`
        return Err(ErreurRF::interne("IndexError : contour de zone au nombre impair de coordonnées"));
    }
    let h = 1e3 * li.h;
    let lam = 1e3 * tl::C_0 / (f_max * li.eps.sqrt());
    let mut s_max = lam / 40.0;
    let mut s_min = dc_solver::pyth::min_py(s_max, maxf(&[0.02, h / 2.0]));
    let acces: Vec<(String, f64, f64)> = els(&z["acces"]).iter().map(|a| (str_py(&a["noeud"]), nb(&a["x"]), nb(&a["y"]))).collect();

    let cuivre = |x: f64, y: f64| -> bool {
        let mut d = _poly_np(x, y, &pts);
        for t in &trous {
            d &= !_poly_np(x, y, t);
        }
        if let Some(r) = &rempli {
            d &= r.dedans(x, y);
        }
        d
    };

    let visee = |cx: f64, cy: f64, s_min: f64, s_max: f64| -> f64 {
        if acces.is_empty() {
            return s_max;
        }
        let d = acces.iter().fold(f64::INFINITY, |d, a| d.min((cx - a.1).hypot(cy - a.2)));
        s_max.min(s_min + 0.5 * d)
    };

    let mut grossier = false;
    let mut feuilles: Vec<(i64, i64, i64, f64)> = Vec::new(); // (niveau, ix, iy, part)
    let mut cote = 0.0;
    let mut niv_max = 0i64;
    let ech: Vec<f64> = (0..5).map(|k| (k as f64 + 0.5) / 5.0).collect();
    for _essai in 0..8 {
        cote = dc_solver::pyth::max_py(x1 - x0, y1 - y0) * 1.0001;
        if !(cote / s_min > 0.0) {
            // `math.log2` d'un cote nul
            return Err(ErreurRF::interne("ValueError : math domain error"));
        }
        niv_max = ((cote / s_min).log2().ceil() as i64 + 1).max(0);
        feuilles.clear();
        let (mut niv, mut qi, mut qj) = (0i64, vec![0i64], vec![0i64]);
        let mut trop = false;
        while !qi.is_empty() {
            let s = cote / 2f64.powi(niv as i32);
            let (mut fi, mut fj) = (Vec::new(), Vec::new());
            for (&i, &j) in qi.iter().zip(&qj) {
                let (qx, qy) = (x0 + i as f64 * s, y0 + j as f64 * s);
                let mut dans = 0;
                for ox in &ech {
                    for oy in &ech {
                        dans += usize::from(cuivre(qx + s * ox, qy + s * oy));
                    }
                }
                let part = dans as f64 / 25.0;
                let mut bord = _croise(qx, qy, s, &pts);
                for tr in &trous {
                    bord |= _croise(qx, qy, s, tr);
                }
                let garde = (part > 0.0) || bord;
                let cible = visee(qx + s / 2.0, qy + s / 2.0, s_min, s_max);
                let fendre = garde && ((s > cible) || (((part < 1.0) || bord) && (s > s_min.max(cible / 2.0)))) && (niv < niv_max);
                // UNE CELLULE A CHEVAL SUR LE BORD est gardee avec sa FRACTION
                // de cuivre : sa capacite et sa conduction la suivent.
                if garde && !fendre && (part > 0.0) {
                    feuilles.push((niv, i, j, part));
                }
                if fendre {
                    fi.push(i);
                    fj.push(j);
                }
            }
            if feuilles.len() > MAX_CELLULES {
                trop = true;
                break;
            }
            qi = [fi.iter().map(|i| 2 * i).collect::<Vec<_>>(), fi.iter().map(|i| 2 * i + 1).collect(), fi.iter().map(|i| 2 * i).collect(),
                  fi.iter().map(|i| 2 * i + 1).collect()].concat();
            qj = [fj.iter().map(|j| 2 * j).collect::<Vec<_>>(), fj.iter().map(|j| 2 * j).collect(), fj.iter().map(|j| 2 * j + 1).collect(),
                  fj.iter().map(|j| 2 * j + 1).collect()].concat();
            niv += 1;
        }
        if !trop {
            break;
        }
        grossier = true;
        s_min *= 1.5;
        s_max *= 1.5;
    }
    if feuilles.is_empty() {
        // plus etroite que tout : une cellule
        feuilles = vec![(0, 0, 0, 1.0)];
        cote = maxf(&[x1 - x0, y1 - y0, 1e-3]);
        niv_max = 0;
    }
    // LES VOISINAGES, entre cellules de tailles differentes : en unites de la
    // grille la plus fine, on longe le bord droit et le bord haut de chaque
    // cellule, et l'on demande quelle cellule est de l'autre cote.
    let unite = cote / 2f64.powi(niv_max as i32);
    let mut par_cle: HashMap<(i64, i64, i64), usize> = HashMap::new();
    let (mut fx, mut fy, mut fk) = (Vec::new(), Vec::new(), Vec::new());
    for (n_, &(lv, i, j, _)) in feuilles.iter().enumerate() {
        let k = 1i64 << (niv_max - lv);
        par_cle.insert((lv, i, j), n_);
        fx.push(i * k);
        fy.push(j * k);
        fk.push(k);
    }
    let mut niveaux: Vec<i64> = feuilles.iter().map(|f| f.0).collect();
    niveaux.sort();
    niveaux.dedup();
    let frac: Vec<f64> = feuilles.iter().map(|f| f.3).collect();

    let trouve = |xu: i64, yu: i64| -> Option<usize> {
        niveaux.iter().find_map(|&lv| {
            let d = niv_max - lv;
            par_cle.get(&(lv, xu >> d, yu >> d)).copied()
        })
    };
    // Pour chaque lien : les deux cellules, la longueur de bord commune e,
    // la distance des centres d, et le sens (horizontal ou vertical). Chaque
    // cellule garde, cote par cote, la part de son bord partagee.
    let (mut ia, mut ib, mut le, mut ld, mut lh) = (Vec::new(), Vec::new(), Vec::new(), Vec::new(), Vec::new());
    let n_f = feuilles.len();
    let (mut sh_d, mut sh_g, mut sh_h, mut sh_b) = (vec![0.0; n_f], vec![0.0; n_f], vec![0.0; n_f], vec![0.0; n_f]);
    for a in 0..n_f {
        let (xa, ya, ka) = (fx[a], fy[a], fk[a]);
        for droite in [true, false] {
            let mut pos = if droite { ya } else { xa };
            let fin = pos + ka;
            while pos < fin {
                let Some(b) = (if droite { trouve(xa + ka, pos) } else { trouve(pos, ya + ka) }) else {
                    pos += 1;
                    continue;
                };
                let debut_b = if droite { fy[b] } else { fx[b] };
                let bout = fin.min(debut_b + fk[b]);
                let e = (bout - pos) as f64;
                ia.push(a);
                ib.push(b);
                le.push(e);
                ld.push((ka + fk[b]) as f64 / 2.0);
                lh.push(droite);
                if droite {
                    sh_d[a] += e;
                    sh_g[b] += e;
                } else {
                    sh_h[a] += e;
                    sh_b[b] += e;
                }
                pos = bout;
            }
        }
    }
    let fkf: Vec<f64> = fk.iter().map(|k| *k as f64).collect();
    let cote_mm: Vec<f64> = fkf.iter().map(|k| k * unite).collect();
    let cx: Vec<f64> = (0..n_f).map(|a| x0 + (fx[a] as f64 + fkf[a] / 2.0) * unite).collect();
    let cy: Vec<f64> = (0..n_f).map(|a| y0 + (fy[a] as f64 + fkf[a] / 2.0) * unite).collect();
    // SURFACE ET BORD, par MoM : c_s d'un cuivre tres large (10 h et 20 h),
    // c_b la frange d'un bord libre -- dans le stratifie, et dans le vide.
    let (w1, w2) = (10.0 * h, 20.0 * h);
    let (Some(l1), Some(l2)) = (_ligne(couches, couche, w1, ep, cache), _ligne(couches, couche, w2, ep, cache)) else {
        return Err(ErreurRF::interne("TypeError : 'NoneType' object is not subscriptable"));
    };

    let s_b = |c1: f64, c2: f64| -> (f64, f64) {
        let cs = (c2 - c1) / ((w2 - w1) * 1e-3);
        (cs, maxf(&[(c1 - cs * w1 * 1e-3) / 2.0, 0.0]))
    };
    let (c_s, c_b) = s_b(l1.c, l2.c);
    let (c_sa, c_ba) = s_b(l1.c / l1.eps, l2.c / l2.eps);
    let c_cel: Vec<f64> = (0..n_f)
        .map(|a| {
            let partage = sh_d[a] + sh_g[a] + sh_h[a] + sh_b[a];
            let libre = (4.0 * fkf[a] - partage).max(0.0) * unite;
            c_s * frac[a] * (cote_mm[a] * 1e-3) * (cote_mm[a] * 1e-3) + c_b * libre * 1e-3
        })
        .collect();
    // LA SELF DE CHAQUE LIEN, PAR DUALITE : en quasi-TEM, L' = mu0 eps0 /
    // C'_vide. Chaque lien porte une « rangee » de cuivre, de largeur e : sa
    // capacite dans le vide par metre est sa surface, plus la frange des bords
    // LIBRES paralleles au courant. Des rangees en parallele redonnent
    // exactement L' = mu0 eps0 / C'_vide(W) d'un ruban : la frange -- qui fait
    // toute la self d'un cuivre etroit -- est comptee, la ou le courant
    // s'entasse, sur ses bords.
    let (mut l_lien, mut r_lien) = (Vec::with_capacity(ia.len()), Vec::with_capacity(ia.len()));
    for q in 0..ia.len() {
        let (a, b) = (ia[q], ib[q]);
        let (k_a, k_b) = (fkf[a], fkf[b]);
        let libres = |n: usize, k: f64| if lh[q] { (2.0 * k - sh_h[n] - sh_b[n]) / k } else { (2.0 * k - sh_d[n] - sh_g[n]) / k };
        let n_bords = (0.5 * (libres(a, k_a) + libres(b, k_b))).clamp(0.0, 2.0);
        let e_mm = le[q] * unite * frac[a].min(frac[b]);
        let d_mm = ld[q] * unite;
        let c_rangee = c_sa * e_mm * 1e-3 + c_ba * n_bords;
        l_lien.push(MU_0 * EPS_0 * d_mm * 1e-3 / c_rangee.max(1e-30));
        r_lien.push(d_mm / e_mm.max(1e-12)); // x R par carre(f)
    }
    let mut ou = Vec::new();
    for (nom, px_, py_) in &acces {
        let xu = ((px_ - x0) / unite).floor() as i64;
        let yu = ((py_ - y0) / unite).floor() as i64;
        let n_ = if 0 <= xu && 0 <= yu { trouve(xu, yu) } else { None };
        let n_ = n_.unwrap_or_else(|| {
            // np.argmin : le premier des plus petits
            let d: Vec<f64> = (0..n_f).map(|a| (cx[a] - px_) * (cx[a] - px_) + (cy[a] - py_) * (cy[a] - py_)).collect();
            (0..n_f).fold(0, |m, a| if d[a] < d[m] { a } else { m })
        });
        ou.push((nom.clone(), n_));
    }
    let aire = (0..n_f).map(|a| frac[a] * (cote_mm[a] * cote_mm[a])).collect();
    Ok(Some(Maillage { cx, cy, c: c_cel, aire, ia, ib, l_lien, r_lien, ep, acces: ou, grossier, pas_min: minf(&cote_mm), pas_max: maxf(&cote_mm), lam }))
}

// ==========================================================================
// Le domaine de validite
// --------------------------------------------------------------------------
// CE SIMULATEUR EST QUASI-STATIQUE -- sections en 2D, pastilles en 3D,
// dispersion de Getsinger par-dessus. Il ne voit ni les modes superieurs, ni
// les ondes de surface, ni le rayonnement : cela demande un solveur pleine
// onde. Ce qu'il PEUT faire, c'est dire ou il cesse d'etre valable, a partir
// de la geometrie meme qu'il resout, et le dire des que la bande le depasse.
// ==========================================================================

/// La largeur du condensateur plan qui a la capacite MoM de la section
/// (mm), et la permittivite du stratifie : de quoi placer le premier mode
/// superieur d'une ligne.
pub fn _largeur_equivalente(couches: &[Json], couche: i64, w: f64, ep: f64, cache: &mut Cache) -> Option<(f64, Json)> {
    let (geo, info) = se::section_de_couche(couches, couche, w, ep, 0.0, Some(0.0), &[], false);
    let li = _ligne(couches, couche, w, ep, cache);
    let (geo, li) = (geo?, li?);
    let inv_h = if geo["kind"].as_str() == Some("strip") { 1.0 / num(&geo, "y0") + 1.0 / (num(&geo, "b") - num(&geo, "y0")) } else { 1.0 / num(&info, "h") };
    Some((1e3 * li.c / (EPS_0 * num(&info, "er") * inv_h), info))
}

/// Les frequences ou le modele quasi-statique cesse de valoir, par cause.
///
/// - le PREMIER MODE SUPERIEUR d'une piste : c0 / (2 W_eff rac(er)), W_eff
///   la largeur equivalente tiree de la capacite MoM ;
/// - la RESONANCE PROPRE d'une pastille (au-dela, ce n'est plus une
///   capacite) : c0 / (2 L_eff rac(eps_eff)), L_eff sa longueur allongee de
///   ses franges ;
/// - le COUPLAGE FORT AUX ONDES DE SURFACE d'un stratifie en microruban
///   (Bahl et Trivedi) : c0 atan(er) / (rac(2) pi h rac(er - 1)), et la
///   coupure du mode TE1, c0 / (4 h rac(er - 1)) ;
/// - le RAYONNEMENT des discontinuites, qui croit comme (k0 h)^2 : on rend
///   k0 h a la frequence haute, et la frequence ou il atteint 0,1.
pub fn domaine_validite(couches: &[Json], doc: &Json, cache: &mut Cache, f_fin: f64) -> Json {
    let c0 = tl::C_0;
    let mut limites: Vec<Json> = Vec::new();
    let mut vus: Vec<(i64, u64)> = Vec::new();
    let mut vus_sw: Vec<i64> = Vec::new();
    for br in els(&doc["branches"]) {
        for o in els(&br["objets"]) {
            let couche = ent(&o["layer"], 0);
            let w = round(nb(&o["width"]), 4);
            let ep = _nombre(&o["copper_thickness"], 0.035);
            if vus.contains(&(couche, bits(w))) || !(w > 0.0) {
                continue;
            }
            vus.push((couche, bits(w)));
            let Some((w_eff, info)) = _largeur_equivalente(couches, couche, w, ep, cache).filter(|r| r.0 != 0.0) else {
                continue;
            };
            let er = num(&info, "er");
            limites.push(obj! {"cause" => "mode supérieur", "net" => &br["net"],
                               "detail" => format!("piste de {} mm", fmt_g(w, 3)),
                               "f" => c0 / (2.0 * w_eff * 1e-3 * er.sqrt())});
            if info["topo"].as_str() == Some("micro") && !vus_sw.contains(&couche) {
                vus_sw.push(couche);
                let h = num(&info, "h");
                let nom = se::_nom_de_couche(couches, couche);
                if er > 1.0001 {
                    limites.push(obj! {
                        "cause" => "ondes de surface", "net" => "",
                        "detail" => format!("stratifié sous {} (h {} mm, εr {})", nom, fmt_g(1e3 * h, 3), fmt_g(er, 3)),
                        "f" => c0 * er.atan() / (2f64.sqrt() * PI * h * (er - 1.0).sqrt())});
                    limites.push(obj! {
                        "cause" => "mode TE1 du stratifié", "net" => "",
                        "detail" => format!("sous {}", nom),
                        "f" => c0 / (4.0 * h * (er - 1.0).sqrt())});
                }
                limites.push(obj! {
                    "cause" => "rayonnement", "net" => "",
                    "detail" => format!("discontinuités sur {} : (k0 h)² = 1 %", nom),
                    "f" => 0.1 * c0 / (2.0 * PI * h)});
            }
        }
    }
    for s in els(&doc["pastilles"]) {
        let couche = ent(&s["couche"], 0);
        let (la, lo) = (nb(&s["largeur"]), nb(&s["longueur"]));
        let cote = dc_solver::pyth::max_py(la, lo);
        let li = _ligne(couches, couche, maxf(&[dc_solver::pyth::min_py(la, lo), 0.01]), _nombre(&s["cuivre"], 0.035), cache);
        if let Some(li) = li.filter(|_| cote > 0.0) {
            let l_eff = cote * 1e-3 + 2.0 * 0.4 * li.h;
            limites.push(obj! {"cause" => "résonance de pastille",
                               "net" => str_ou_vide(&s["noeud"]),
                               "detail" => format!("{} mm", fmt_g(cote, 3)),
                               "f" => c0 / (2.0 * l_eff * li.eps.sqrt())});
        }
    }
    limites.sort_by(|a, b| num(a, "f").partial_cmp(&num(b, "f")).unwrap_or(std::cmp::Ordering::Equal));
    let f_ok = limites.first().map_or(f64::INFINITY, |l| num(l, "f"));
    let mut k0hs = Vec::new();
    for br in els(&doc["branches"]) {
        if let Some(o) = els(&br["objets"]).first() {
            let info = se::section_de_couche(couches, ent(&o["layer"], 0), maxf(&[nb(&o["width"]), 0.01]), 0.035, 0.0, Some(0.0), &[], false).1;
            let h_mm = numd(&info, "h", 0.0) * 1e3;
            k0hs.push(2.0 * PI * f_fin / c0 * 1e-3 * if h_mm.is_finite() { h_mm } else { 0.0 });
        }
    }
    let k0h = if k0hs.is_empty() { 0.0 } else { maxf(&k0hs) };
    limites.truncate(8);
    obj! {"f_max" => f_ok, "limites" => limites, "k0h" => k0h}
}

/// L'admittance de la broche a la masse, par frequence : les vias sous la
/// pastille (mutuelles comprises), et chaque chemin piste + via en parallele.
/// La piste de masse est une ligne au-dessus de son plan : sa self et sa
/// resistance de peau par le meme solveur que le reste.
pub fn admittance_masse(couches: &[Json], g: &Json, freqs: &[f64], cache: &mut Cache) -> Res<Vec<Complex64>> {
    let couche = ent(&g["couche"], 0);
    let vias = els(&g["vias"]);
    let directs: Vec<Json> = vias.iter().filter(|v| !v["piste"].vrai()).cloned().collect();
    let l_dir = if directs.is_empty() { 0.0 } else { inductance_masse(couches, couche, &directs)? };
    let mut chemins = Vec::new();
    for v in vias {
        let p = &v["piste"];
        if !p.vrai() {
            continue;
        }
        let lv = inductance_masse(couches, couche, std::slice::from_ref(v))?;
        let li = _ligne(couches, ent(&p["couche"], couche), _nombre(&p["largeur"], 0.3), _nombre(&p["cuivre"], 0.035), cache);
        let lg = nb(&p["longueur"]) * 1e-3;
        chemins.push((lv, li, lg, _nombre(&p["largeur"], 0.3)));
    }
    let mut ys = Vec::new();
    for &f in freqs {
        let w = 2.0 * PI * f;
        let mut y = if l_dir > 0.0 { inv(Complex64::new(0.0, w * l_dir)) } else { c(0.0) };
        for (lv, li, lg, larg) in &chemins {
            let mut z = Complex64::new(0.0, w * lv);
            if let Some(li) = li {
                let (a_c, _) = tl::line_losses(li.z0, li.eps, larg * 1e-3, li.er, 0.0, f, &se::options_pertes(&li.kw_pertes, li.ep * 1e-3))?;
                z += Complex64::new(2.0 * a_c * li.z0, w * li.l) * lg;
            }
            y += inv(z);
        }
        ys.push(y);
    }
    Ok(ys)
}
