//! LES SURFACES DE CUIVRE, PEINTES UNE FOIS.
//!
//! Plans et versements arrivent en contours -- le cuivre réel d'un IPC-2581, troué de ses
//! dégagements ; les zones de l'éditeur, découpes en trous. Plusieurs règles posent la même
//! question en des milliers de points : y a-t-il du cuivre ici, et de quel net ? On peint
//! donc chaque couche UNE fois dans une image, un net par pixel, et on y lit.
//!
//! Un contour se peint par ses traversées de ligne : chaque arête bascule les pixels à sa
//! droite, et la parité cumulée le long de la ligne dit dedans ou dehors. Chaque contour se
//! peint puis ses trous s'effacent, du plus grand au plus petit : un îlot posé dans le
//! dégagement d'un autre n'est pas effacé par lui.
//!
//! Et les deux fonctions de scipy.ndimage dont les règles se servaient : la transformée de
//! distance euclidienne et le bouchage des trous.

use crate::base::*;
use crate::commun::Doc;
use std::sync::{Arc, OnceLock};

pub const PIXELS_MAX: f64 = 4e6; // par couche : le pas s'élargit au-delà
pub const PAS_MIN_MM: f64 = 0.05;

/// Le cuivre des plans et versements, une image par couche : l'entier d'un net par pixel
/// (-1 : cuivre sans net), 0 là où il n'y a rien.
pub struct Surfaces {
    pub ids: IndexMap<String, i32>,
    /// Par nom de couche (`str(c)`), lignes puis colonnes.
    pub images: IndexMap<String, Arc<Vec<i32>>>,
    pub pas: f64,
    pub x0: f64,
    pub y0: f64,
    pub w: usize,
    pub h: usize,
    /// Les entiers des nets de masse (`surf.masses`), cherchés une fois.
    masses: OnceLock<HashSet<i32>>,
}

fn _aire(o: &[f64]) -> f64 {
    let n = o.len();
    0.5 * py::sum((0..n.saturating_sub(3)).step_by(2).map(|k| o[k] * o[k + 3] - o[k + 2] * o[k + 1])) + 0.5 * (o[n - 2] * o[1] - o[0] * o[n - 1])
}

/// `[float(v) * unite for v in liste]`
pub fn anneau(v: &Json, unite: f64) -> R<Vec<f64>> {
    els(v).iter().map(|x| Ok(fl(x)? * unite)).collect()
}

impl Surfaces {
    pub fn new(plans: &[&Json], unite: f64) -> R<Surfaces> {
        let mut s = Surfaces { ids: IndexMap::new(), images: IndexMap::new(), pas: 0.0, x0: 0.0, y0: 0.0, w: 0, h: 0, masses: OnceLock::new() };
        let mut anneaux = Vec::new();
        for p in plans {
            let o = anneau(&p["o"], unite)?;
            if o.len() < 6 {
                continue;
            }
            let mut trous = Vec::new();
            for t in els(&p["t"]) {
                if dc_solver::pyth::len_py(t)? >= 6 {
                    trous.push(anneau(t, unite)?);
                }
            }
            let n = str_ou_vide(&p["n"]);
            if !n.is_empty() && !s.ids.contains_key(&n) {
                let id = s.ids.len() as i32 + 1;
                s.ids.insert(n.clone(), id);
            }
            anneaux.push((_aire(&o).abs(), str_py(&p["c"]), n, o, trous));
        }
        if anneaux.is_empty() {
            return Ok(s);
        }
        let xs: Vec<f64> = anneaux.iter().flat_map(|a| a.3.iter().step_by(2).copied()).collect();
        let ys: Vec<f64> = anneaux.iter().flat_map(|a| a.3.iter().skip(1).step_by(2).copied()).collect();
        let (xmin, xmax, ymin, ymax) = (minf(&xs), maxf(&xs), minf(&ys), maxf(&ys));
        s.pas = maxf(&[PAS_MIN_MM, ((xmax - xmin) * (ymax - ymin) / PIXELS_MAX).sqrt()]);
        (s.x0, s.y0) = (xmin - s.pas, ymin - s.pas);
        s.w = ((xmax - s.x0) / s.pas) as usize + 2;
        s.h = ((ymax - s.y0) / s.pas) as usize + 2;
        anneaux.sort_by(|a, b| b.0.total_cmp(&a.0)); // du plus grand au plus petit, tri stable
        let mut images: IndexMap<String, Vec<i32>> = IndexMap::new();
        for (_, c, n, o, trous) in &anneaux {
            let img = images.entry(c.clone()).or_insert_with(|| vec![0; s.w * s.h]);
            s.peindre(img, o, s.ids.get(n).copied().unwrap_or(-1));
            for t in trous {
                s.peindre(img, t, 0);
            }
        }
        s.images = images.into_iter().map(|(k, v)| (k, Arc::new(v))).collect();
        Ok(s)
    }

    /// Le contour `o` (x, y, x, y…, en mm) peint à `val` dans `img`.
    pub fn peindre(&self, img: &mut [i32], o: &[f64], val: i32) {
        // centre du pixel j : fj == j
        let fj: Vec<f64> = o.iter().step_by(2).map(|x| (x - self.x0) / self.pas - 0.5).collect();
        let fi: Vec<f64> = o.iter().skip(1).step_by(2).map(|y| (y - self.y0) / self.pas - 0.5).collect();
        if fi.is_empty() {
            return;
        }
        let (i0, i1) = ((minf(&fi).ceil() as i64).max(0), (maxf(&fi).floor() as i64).min(self.h as i64 - 1));
        let (j0, j1) = ((minf(&fj).ceil() as i64).max(0), (maxf(&fj).floor() as i64).min(self.w as i64 - 1));
        if i1 < i0 || j1 < j0 {
            return;
        }
        let (nl, nc) = ((i1 - i0 + 1) as usize, (j1 - j0 + 2) as usize);
        let mut bascules = vec![false; nl * nc];
        let mut touche = false;
        for e in 0..fi.len() {
            // np.roll : chacun sur sa propre longueur (un contour de longueur impaire)
            let (a, b) = (fi[e], fi[(e + 1) % fi.len()]);
            let (xa, xb) = (fj[e], fj[(e + 1) % fj.len()]);
            if a == b {
                continue;
            }
            // la ligne r compte si lo <= r < hi : un sommet n'est vu qu'une fois
            let r_lo = (a.min(b).ceil()).max(i0 as f64) as i64;
            let r_hi = (a.max(b).ceil() - 1.0).min(i1 as f64) as i64;
            for ligne in r_lo..=r_hi {
                let xc = xa + (ligne as f64 - a) / (b - a) * (xb - xa);
                let col = xc.ceil().clamp(j0 as f64, (j1 + 1) as f64) as i64;
                let k = (ligne - i0) as usize * nc + (col - j0) as usize;
                bascules[k] = !bascules[k];
                touche = true;
            }
        }
        if !touche {
            return;
        }
        for l in 0..nl {
            let mut dedans = false;
            let ligne = (i0 as usize + l) * self.w;
            for c in 0..nc - 1 {
                dedans ^= bascules[l * nc + c];
                if dedans {
                    img[ligne + j0 as usize + c] = val;
                }
            }
        }
    }

    /// L'image d'une couche : la clé du document n'y est que si c'est un nom.
    pub fn image(&self, c: &Json) -> Option<&Arc<Vec<i32>>> {
        c.as_str().and_then(|c| self.images.get(c))
    }

    /// Le pixel d'un point en mm, s'il est dans l'image.
    pub fn pixel(&self, x: f64, y: f64) -> Option<usize> {
        let j = ((x - self.x0) / self.pas).floor();
        let i = ((y - self.y0) / self.pas).floor();
        (i >= 0.0 && i < self.h as f64 && j >= 0.0 && j < self.w as f64).then(|| i as usize * self.w + j as usize)
    }

    /// Le net (entier) sous un point en mm d'une image ; 0 hors image.
    pub fn lire_img(&self, img: &[i32], x: f64, y: f64) -> i32 {
        self.pixel(x, y).map_or(0, |k| img[k])
    }

    /// Le net (entier) sous un point en mm de la couche `c` ; 0 hors image, ou sans image.
    pub fn lire(&self, c: &Json, x: f64, y: f64) -> i32 {
        self.image(c).map_or(0, |img| self.lire_img(img, x, y))
    }

    /// Le centre du pixel (i, j), en mm.
    pub fn point(&self, i: f64, j: f64) -> (f64, f64) {
        (self.x0 + (j + 0.5) * self.pas, self.y0 + (i + 0.5) * self.pas)
    }

    /// Les entiers des nets classés Masse.
    pub fn masses(&self, doc: &Doc) -> &HashSet<i32> {
        self.masses.get_or_init(|| self.ids.iter().filter(|(nm, _)| doc.classe(nm) == "Masse").map(|(_, g)| *g).collect())
    }
}

pub fn _surfaces(doc: &Doc, unite: f64) -> R<Option<Surfaces>> {
    let plans: Vec<&Json> = doc.liste("plans").iter().filter(|p| p.as_objet().is_some()).collect();
    if plans.is_empty() {
        return Ok(None);
    }
    let s = Surfaces::new(&plans, unite)?;
    Ok(if s.images.is_empty() { None } else { Some(s) })
}

/// scipy.ndimage.distance_transform_edt : la distance de chaque pixel VRAI au pixel FAUX le
/// plus proche, en pixels (0 sur les faux). Meijster, en entiers : le carré est exact, sa
/// racine est celle de scipy.
///
/// Sans aucun pixel faux, scipy rend la distance au point (-1, 0) -- on rend la même.
pub fn distance_edt(masque: &[bool], h: usize, w: usize) -> Vec<f64> {
    if !masque.contains(&false) {
        return (0..h * w).map(|k| ((((k / w + 1) * (k / w + 1)) + (k % w) * (k % w)) as f64).sqrt()).collect();
    }
    let inf = (h + w) as i64;
    // 1. par colonne : la distance verticale au faux le plus proche
    let mut g = vec![0i64; h * w];
    for j in 0..w {
        let mut d = inf;
        for i in 0..h {
            d = if masque[i * w + j] { (d + 1).min(inf) } else { 0 };
            g[i * w + j] = d;
        }
        let mut d = inf;
        for i in (0..h).rev() {
            d = if masque[i * w + j] { (d + 1).min(inf) } else { 0 };
            g[i * w + j] = g[i * w + j].min(d);
        }
    }
    // 2. par ligne : l'enveloppe basse des paraboles (x - i)² + g(i)²
    let mut out = vec![0.0; h * w];
    let (mut s, mut t) = (vec![0i64; w], vec![0i64; w]);
    for i in 0..h {
        let gl = &g[i * w..(i + 1) * w];
        let f = |x: i64, k: i64| (x - k) * (x - k) + gl[k as usize] * gl[k as usize];
        let sep = |a: i64, b: i64| (b * b - a * a + gl[b as usize] * gl[b as usize] - gl[a as usize] * gl[a as usize]).div_euclid(2 * (b - a));
        let mut q = 0usize;
        (s[0], t[0]) = (0, 0);
        for u in 1..w as i64 {
            let mut vide = false;
            while f(t[q], s[q]) > f(t[q], u) {
                if q == 0 {
                    vide = true;
                    break;
                }
                q -= 1;
            }
            if vide {
                s[0] = u;
            } else {
                let x = 1 + sep(s[q], u);
                if x < w as i64 {
                    q += 1;
                    (s[q], t[q]) = (u, x);
                }
            }
        }
        for u in (0..w as i64).rev() {
            out[i * w + u as usize] = (f(u, s[q]) as f64).sqrt();
            if u == t[q] && q > 0 {
                q -= 1;
            }
        }
    }
    out
}

/// scipy.ndimage.binary_fill_holes : les faux que le fond ne rejoint pas (voisinage à quatre)
/// deviennent vrais.
pub fn boucher_trous(masque: &[bool], h: usize, w: usize) -> Vec<bool> {
    let mut fond = vec![false; h * w];
    let mut pile = Vec::new();
    let semer = |k: usize, fond: &mut Vec<bool>, pile: &mut Vec<usize>| {
        if !masque[k] && !fond[k] {
            fond[k] = true;
            pile.push(k);
        }
    };
    for j in 0..w {
        semer(j, &mut fond, &mut pile);
        semer((h - 1) * w + j, &mut fond, &mut pile);
    }
    for i in 0..h {
        semer(i * w, &mut fond, &mut pile);
        semer(i * w + w - 1, &mut fond, &mut pile);
    }
    while let Some(k) = pile.pop() {
        let (i, j) = (k / w, k % w);
        if i > 0 {
            semer(k - w, &mut fond, &mut pile);
        }
        if i + 1 < h {
            semer(k + w, &mut fond, &mut pile);
        }
        if j > 0 {
            semer(k - 1, &mut fond, &mut pile);
        }
        if j + 1 < w {
            semer(k + 1, &mut fond, &mut pile);
        }
    }
    fond.iter().map(|f| !f).collect()
}

#[cfg(test)]
mod essais {
    use super::*;

    /// La transformée de distance contre la force brute, et le cas sans fond de scipy.
    #[test]
    fn distance_exacte() {
        let (h, w) = (17, 23);
        let masque: Vec<bool> = (0..h * w).map(|k| (k * 7919 + k / 5) % 11 != 0 || k % w > 15).collect();
        let d = distance_edt(&masque, h, w);
        for k in 0..h * w {
            let (i, j) = ((k / w) as i64, (k % w) as i64);
            let brut = (0..h * w).filter(|q| !masque[*q]).map(|q| (q as i64 / w as i64 - i).pow(2) + (q as i64 % w as i64 - j).pow(2)).min().unwrap();
            assert_eq!(d[k], (brut as f64).sqrt(), "pixel {k}");
        }
        let plein = distance_edt(&[true; 6], 2, 3);
        assert_eq!(plein, [1.0, 2f64.sqrt(), 5f64.sqrt(), 2.0, 5f64.sqrt(), 8f64.sqrt()]);
    }

    #[test]
    fn trous_bouches() {
        // un anneau : son centre se bouche, le dehors non
        let (h, w) = (5, 5);
        let m: Vec<bool> = (0..25).map(|k| { let (i, j) = (k / 5, k % 5); (1..=3).contains(&i) && (1..=3).contains(&j) && !(i == 2 && j == 2) }).collect();
        let b = boucher_trous(&m, h, w);
        assert!(b[12] && !b[0] && b.iter().filter(|x| **x).count() == 9);
    }
}
