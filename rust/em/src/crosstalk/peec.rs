//! Option B : le courant de retour resolu autour de la fente (PEEC), et la scene que la page
//! envoie.
//!
//! Ce que numpy faisait sur des tableaux se fait ici case par case ; `faer` porte les deux
//! resolutions denses (les selfs partielles, puis les potentiels), et le remplissage de la
//! matrice des selfs se partage entre les coeurs.

use super::*;
use crate::simulation_em::base::*;
use faer::linalg::solvers::Solve;
use faer::Mat;
use std::f64::consts::PI;
use std::sync::Arc;

// ==========================================================================
// OPTION B : LE COURANT DE RETOUR RESOLU AUTOUR DE LA FENTE (PEEC)
// --------------------------------------------------------------------------
// LE MODELE D'OTT SUPPOSE CE QU'IL NE SAIT PAS : ou passe le courant. Une
// fente droite, franchie a angle droit, tous les plans coupes -- le detour
// est alors un demi-tour de boucle, et le logarithme le chiffre. Une fente en
// L, franchie en biais, un plan intact dessous (le cas 4b du banc), des vias
// qui relient les plans pres de la fente, une victime sur une autre couche :
// rien de cela n'a de formule.
//
// ON RESOUT DONC LE PLAN. La page envoie l'image exacte du cuivre des plans
// autour du franchissement (lignes a pas fin, bords de cuivre exacts le long
// de la piste) et les vias de masse ; on y pose un maillage gradue -- fin
// pres des pistes et des bords de fente, large au loin --, chaque maille
// portant un courant en u et en v. Selfs et mutuelles partielles de rubans
// minces (Neumann, distance moyenne geometrique exacte de deux rubans), la
// piste agresseur en filament au-dessus, le retour injecte sous ses deux
// bouts de fenetre. Entre deux plans, la capacite de chaque maille en regard,
// et au bord de la fenetre une conductance qui laisse partir l'onde de la
// cavite (frontiere absorbante : une carte grande devant la fenetre). Un via
// de masse est une branche verticale.
//
// AU GENOU DU FRONT, 0,35 / t_r, on resout (PEEC quasi statique, sans
// resistance : le courant s'y repartit par les selfs) et l'on lit la
// tension de la boucle de l'agresseur et celle, a vide, de chaque victime.
// On resout DEUX FOIS : avec le cuivre tel qu'il est, puis avec les plans
// pleins dans la fenetre ; la difference est ce que la fente ajoute -- la
// self du detour L_d et la mutuelle M qui remplacent celles d'Ott dans la
// meme formule du terme (f.e.m. M.dI/dt partagee en +NEXT / -FEXT, lissee par
// tau = L_d / 2 Z0). Tout vide du plan dans la fenetre y est compte.
//
// LIMITES, dites : quasi statique (la piste n'est pas une ligne a l'echelle
// de la fenetre, la resonance de la fente seule n'y est pas -- le facteur de
// l'option C s'y applique quand tous les plans sont coupes) ; la cavite hors
// fenetre est sans fin ; le maillage borne la finesse (budget de branches).
// ==========================================================================

pub const PEEC_BRANCHES_MAX: usize = 3000; // branches de courant, tous plans : la memoire
pub const PEEC_CROISSANCES: [(f64, f64); 5] = [(1.35, 3.0), (1.5, 4.0), (1.7, 6.0), (2.0, 8.0),
                                               (2.6, 12.0)];
pub const PEEC_REG: f64 = 1e-18; // F : chaque noeud a la terre lointaine
pub const ETA_0: f64 = 376.730313668;
pub const EPS_0: f64 = 8.8541878128e-12;

/// « Du cuivre ici ? » : dedans(u, v), dans le repere de la fenetre.
pub type Dedans = Arc<dyn Fn(f64, f64) -> bool + Send + Sync>;
/// Un morceau de piste dans la fenetre : (u0, v0, u1, v1, z, w).
pub type Piece = (f64, f64, f64, f64, f64, f64);
/// Un troncon de cuivre dans le repere de la carte : (x1, y1, x2, y2, largeur, couche).
pub type Trc = (f64, f64, f64, f64, f64, i64);
/// Un via de masse de la scene : (u, v, rayon, rangs des plans relies).
pub type ViaScene = (f64, f64, f64, Vec<usize>);

/// Un plan de la scene : son nom, son cuivre, son rang dans l'empilage et sa cote.
#[derive(Clone)]
pub struct PlanScene {
    pub nom: String,
    pub dedans: Dedans,
    pub k: usize,
    pub z: f64,
}

/// La scene du PEEC (le dict `scene` de Python). `u` et `v` : les demi-cotes U et V.
#[derive(Clone)]
pub struct Scene {
    pub u: f64,
    pub v: f64,
    pub s_min: f64,
    pub plans: Vec<PlanScene>,
    pub eps: Vec<f64>,
    pub vias: Vec<ViaScene>,
    pub pistes: Vec<Vec<Piece>>,
    pub cles_u: Vec<f64>,
    pub cles_v: Vec<f64>,
}

/// ln de la distance moyenne geometrique de deux rubans minces de largeurs
/// a et b, d'axes decales de d dans leur plan et de h hors de leur plan
/// (memes unites). Forme exacte : double integrale de ln r sur les deux
/// largeurs ; au loin, ln de la distance des axes.
pub fn _ln_gmd(a: f64, b: f64, d: f64, h: f64) -> f64 {
    let f2 = |x: f64| {
        let r2 = x * x + h * h;
        0.5 * (x * x - h * h) * r2.max(1e-300).ln()
            - 1.5 * x * x + 2.0 * h * x * x.atan2(h)
    };
    let (s, t) = (0.5 * (a + b), 0.5 * (a - b));
    let r2 = d * d + h * h;
    let loin = r2 > 25.0 * a.max(b).powi(2);
    if loin {
        return 0.5 * r2.max(1e-300).ln();
    }
    (f2(d + s) - f2(d - t) - f2(d + t) + f2(d - s)) / (2.0 * a * b)
}

/// Mutuelle partielle (H) de deux barres paralleles [a1, b1] et [a2, b2]
/// sur leur axe (m), a la distance moyenne geometrique exp(ln_g).
pub fn _m_barres(a1: f64, b1: f64, a2: f64, b2: f64, ln_g: f64) -> f64 {
    let g = ln_g.exp();
    let gg = |x: f64| x * (x / g).asinh() - (x * x + g * g).sqrt();
    MU_0 / (4.0 * PI) * (gg(b1 - a2) - gg(a1 - a2)
                         - gg(b1 - b2) + gg(a1 - b2))
}

/// Les bords des mailles de lo a hi (mm) : s_min aux cles, une croissance
/// geometrique g au-dela, s_max au plus. Les cles sont des bords.
pub fn _bords_maille(lo: f64, hi: f64, cles: &[f64], s_min: f64, g: f64, s_max: f64) -> Vec<f64> {
    let mut cles: Vec<f64> = cles.iter().copied().filter(|c| lo < *c && *c < hi).collect();
    cles.sort_by(f64::total_cmp);
    let reference = if cles.is_empty() { vec![0.5 * (lo + hi)] } else { cles.clone() };
    let (mut bords, mut x) = (vec![lo], lo);
    while x < hi - 1e-9 {
        let proche = reference.iter().map(|r| (r - x).abs()).fold(f64::INFINITY, f64::min);
        x = hi.min(x + s_max.min(s_min + (g - 1.0) * proche));
        bords.push(x);
    }
    let mut tous: Vec<f64> = bords.iter().chain(&cles).copied().collect();
    tous.sort_by(f64::total_cmp);
    tous.dedup();
    let mut out = vec![tous[0]];
    for &x in &tous[1..] {
        let dernier = out[out.len() - 1];
        if x - dernier < 0.3 * s_min {
            if cles.contains(&x) && !cles.contains(&dernier) && out.len() > 1 {
                let k = out.len() - 1;
                out[k] = x;
            }
            continue;
        }
        out.push(x);
    }
    if out[out.len() - 1] < hi - 1e-9 {
        out.push(hi);
    }
    out
}

/// Les morceaux de piste (u0, v0, u1, v1, z, w), coupes aux bords des
/// mailles : chaque morceau tient dans une maille.
pub fn _decouper(pieces: &[Piece], eu: &[f64], ev: &[f64]) -> Vec<Piece> {
    let mut out = Vec::new();
    for &(u0, v0, u1, v1, z, w) in pieces {
        let mut ts = vec![0.0, 1.0];
        for (e, a, b) in [(eu, u0, u1), (ev, v0, v1)] {
            if (b - a).abs() > 1e-12 {
                for x in e {
                    let t = (x - a) / (b - a);
                    if 0.0 < t && t < 1.0 {
                        ts.push(t);
                    }
                }
            }
        }
        ts.sort_by(f64::total_cmp);
        ts.dedup();
        for (&ta, &tb) in ts.iter().zip(&ts[1..]) {
            if tb - ta > 1e-9 {
                out.push((u0 + (u1 - u0) * ta, v0 + (v1 - v0) * ta,
                          u0 + (u1 - u0) * tb, v0 + (v1 - v0) * tb, z, w));
            }
        }
    }
    out
}

/// Le maillage gradue de la fenetre : bords en u et en v (mm).
pub fn _maillage_peec(scene: &Scene, g: f64, s_max: f64) -> (Vec<f64>, Vec<f64>) {
    (_bords_maille(-scene.u, scene.u, &scene.cles_u,
                   scene.s_min, g, s_max),
     _bords_maille(-scene.v, scene.v, &scene.cles_v,
                   scene.s_min, g, s_max))
}

/// Ce que `_resoudre_peec` rend : Z[j][k] avec le cuivre reel (`vide`) et les plans pleins.
#[derive(Debug, Clone)]
pub struct Resolu {
    pub vide: Vec<Vec<Option<Complex64>>>,
    pub plein: Vec<Vec<Option<Complex64>>>,
    pub branches: usize,
    pub mailles: (usize, usize),
}

/// Une branche de courant du plan plein : (debut, fin, transverse, largeur, z, de, a,
/// presente dans le cuivre reel). Pour un via : (z0, z1, -, -, -, de, a, reel).
#[derive(Clone, Copy)]
struct Branche {
    debut: f64,
    fin: f64,
    transverse: f64,
    largeur: f64,
    z: f64,
    de: usize,
    a: usize,
    reel: bool,
}

/// Une matrice n x n remplie colonne par colonne, sur tous les coeurs : `f(j, colonne)`.
/// Chaque case ne depend que de ses indices : le resultat ne depend pas du nombre de fils.
fn par_colonnes(n: usize, f: impl Fn(usize, &mut [f64]) + Sync) -> Vec<f64> {
    let mut tampon = vec![0.0; n * n];
    if n == 0 {
        return tampon;
    }
    let fils = if n * n < 20_000 { 1 } else { std::thread::available_parallelism().map_or(1, |k| k.get()).min(n) };
    let par_fil = n.div_ceil(fils);
    std::thread::scope(|s| {
        for (g, bloc) in tampon.chunks_mut(par_fil * n).enumerate() {
            let f = &f;
            let mut tache = move || bloc.chunks_mut(n).enumerate().for_each(|(k, col)| f(g * par_fil + k, col));
            if fils == 1 {
                tache();
            } else {
                s.spawn(tache);
            }
        }
    });
    tampon
}

/// La matrice des impedances de boucle des pistes (Z[j][k] : la tension
/// a vide dans la boucle j pour 1 A dans la boucle k), avec le cuivre tel
/// qu'il est (`vide`) puis avec les plans pleins (`plein`). Les branches du
/// premier sont un sous-ensemble de celles du second : les selfs partielles
/// se calculent une fois, et chaque piste est excitee a son tour sur la
/// meme factorisation.
pub fn _resoudre_peec(scene: &Scene, f: f64, g: f64, s_max: f64) -> Option<Resolu> {
    let (eu, ev) = _maillage_peec(scene, g, s_max);
    let milieux = |e: &[f64]| e.windows(2).map(|p| 0.5 * (p[1] + p[0])).collect::<Vec<f64>>();
    let pas = |e: &[f64]| e.windows(2).map(|p| p[1] - p[0]).collect::<Vec<f64>>();
    let (cu, cv) = (milieux(&eu), milieux(&ev));
    let (du, dv) = (pas(&eu), pas(&ev));
    let (nu, nv) = (cu.len(), cv.len());
    let plans = &scene.plans;
    if plans.is_empty() {
        return None;
    }
    let pas_t = (0.4 * scene.s_min).max(0.02);
    // masques[p][i * nv + j]
    let masques: Vec<Vec<bool>> = plans.iter().map(|p| (0..nu * nv).map(|c| (p.dedans)(cu[c / nv], cv[c % nv])).collect()).collect();
    let cell = nu * nv;
    let noeud = |p: usize, i: usize, j: usize| p * cell + i * nv + j;
    let n_n = cell * plans.len();

    // Le cuivre est-il continu d'un centre a l'autre (sondes fines) ?
    let continu = |p: usize, axe: usize, i: usize, j: usize| -> bool {
        let (a, b, c) = if axe == 0 { (cu[i], cu[i + 1], cv[j]) } else { (cv[j], cv[j + 1], cu[i]) };
        let n = (((b - a) / pas_t).ceil() as i64 + 1).max(2);
        (0..n).all(|k| {
            let x = a + (b - a) * k as f64 / (n - 1) as f64;
            if axe == 0 { (plans[p].dedans)(x, c) } else { (plans[p].dedans)(c, x) }
        })
    };

    // LES BRANCHES DU PLAN PLEIN : (debut, fin, transverse, largeur, z, de, a,
    // presente dans le cuivre reel)
    let mut br: [Vec<Branche>; 2] = [Vec::new(), Vec::new()];
    for (p, pl) in plans.iter().enumerate() {
        let m = &masques[p];
        for ii in 0..nu.saturating_sub(1) {
            for jj in 0..nv {
                let ok = m[ii * nv + jj] && m[(ii + 1) * nv + jj] && continu(p, 0, ii, jj);
                br[0].push(Branche { debut: cu[ii], fin: cu[ii + 1], transverse: cv[jj], largeur: dv[jj],
                                     z: pl.z,
                                     de: noeud(p, ii, jj), a: noeud(p, ii + 1, jj), reel: ok });
            }
        }
        for ii in 0..nu {
            for jj in 0..nv.saturating_sub(1) {
                let ok = m[ii * nv + jj] && m[ii * nv + jj + 1] && continu(p, 1, ii, jj);
                br[1].push(Branche { debut: cv[jj], fin: cv[jj + 1], transverse: cu[ii], largeur: du[ii],
                                     z: pl.z,
                                     de: noeud(p, ii, jj), a: noeud(p, ii, jj + 1), reel: ok });
            }
        }
    }
    // np.searchsorted(e, x) - 1, borne a [0, n - 1]
    let case = |e: &[f64], x: f64, n: usize| (e.partition_point(|b| *b < x) as i64 - 1).clamp(0, n as i64 - 1) as usize;
    // un via : (u, v, rayon) et sa branche verticale
    let mut vias: Vec<((f64, f64, f64), Branche)> = Vec::new();
    for (vu, vv, r, sur) in &scene.vias {
        let (i, j) = (case(&eu, *vu, nu), case(&ev, *vv, nv));
        let mut sur = sur.clone();
        sur.sort();
        sur.dedup();
        for (&pa, &pb) in sur.iter().zip(sur.iter().skip(1)) {
            vias.push(((*vu, *vv, *r), Branche {
                debut: plans[pa].z.min(plans[pb].z), fin: plans[pa].z.max(plans[pb].z), transverse: 0.0, largeur: 0.0, z: 0.0,
                de: noeud(pa, i, j), a: noeud(pb, i, j),
                reel: masques[pa][i * nv + j] && masques[pb][i * nv + j] }));
        }
    }
    let mm = 1e-3;
    let (n0, n1) = (br[0].len(), br[1].len());
    let n_b = n0 + n1 + vias.len();
    let toutes: Vec<Branche> = br[0].iter().chain(&br[1]).copied().chain(vias.iter().map(|v| v.1)).collect();
    let l_tampon = par_colonnes(n_b, |j, col| {
        let (deb, fin) = if j < n0 { (0, n0) } else if j < n0 + n1 { (n0, n0 + n1) } else { (n0 + n1, n_b) };
        let bj = &toutes[j];
        for i in deb..fin {
            let bi = &toutes[i];
            let ln_g = if j < n0 + n1 {
                _ln_gmd(bi.largeur * mm, bj.largeur * mm,
                        (bi.transverse - bj.transverse) * mm,
                        (bi.z - bj.z).abs() * mm)
            } else {
                let (vi, vj) = (vias[i - n0 - n1].0, vias[j - n0 - n1].0);
                let dist = (vi.0 - vj.0).hypot(vi.1 - vj.1);
                (dist.max(vi.2) * mm).ln()
            };
            col[i] = _m_barres(bi.debut * mm, bi.fin * mm,
                               bj.debut * mm, bj.fin * mm, ln_g);
        }
    });
    let reel_n: Vec<bool> = masques.iter().flatten().copied().collect();

    // LES PISTES : leur mutuelle avec chaque branche
    let mut mps: Vec<Vec<f64>> = Vec::new();
    for piste in &scene.pistes {
        let mut mp = vec![0.0; n_b];
        for (u0, v0, u1, v1, z, w) in _decouper(piste, &eu, &ev) {
            for ax in 0..2 {
                let (d0, n) = if ax == 0 { (0, n0) } else { (n0, n1) };
                let (lo, hi) = if ax == 0 { (u0, u1) } else { (v0, v1) };
                if (hi - lo).abs() < 1e-12 {
                    continue;
                }
                let sg = if hi > lo { 1.0 } else { -1.0 };
                let (lo, hi) = (lo.min(hi), lo.max(hi));
                let tr = if ax == 0 { 0.5 * (v0 + v1) } else { 0.5 * (u0 + u1) };
                for k in 0..n {
                    let b = &toutes[d0 + k];
                    let ln_g = _ln_gmd(w * mm, b.largeur * mm, (tr - b.transverse) * mm,
                                       (z - b.z).abs() * mm);
                    mp[d0 + k] += sg * _m_barres(lo * mm, hi * mm, b.debut * mm,
                                                 b.fin * mm, ln_g);
                }
            }
        }
        mps.push(mp);
    }

    // Le noeud du plan de retour sous un bout de piste ; le plus proche
    // qui porte du cuivre quand il n'y en a pas dessous.
    let bout = |piste: &[Piece], fin: bool, reel: bool| -> Option<usize> {
        let q = if fin { piste[piste.len() - 1] } else { piste[0] };
        let (u, v, z) = if fin { (q.2, q.3, q.4) } else { (q.0, q.1, q.4) };
        let mut p = 0;
        for (k, pl) in plans.iter().enumerate() {
            if (pl.z - z).abs() < (plans[p].z - z).abs() {
                p = k;
            }
        }
        let mut meilleur: Option<(f64, usize)> = None;
        for i in 0..nu {
            for j in 0..nv {
                if reel && !masques[p][i * nv + j] {
                    continue;
                }
                let d = (cu[i] - u).powi(2) + (cv[j] - v).powi(2);
                if meilleur.is_none_or(|m| d < m.0) {
                    meilleur = Some((d, noeud(p, i, j)));
                }
            }
        }
        meilleur.map(|m| m.1)
    };

    let w = 2.0 * PI * f;
    let aire = |i: usize, j: usize| du[i] * dv[j] * mm * mm;
    let bord = |i: usize, j: usize| {
        let mut b = 0.0;
        if i == 0 {
            b += dv[j] * mm;
        }
        if i == nu - 1 {
            b += dv[j] * mm;
        }
        if j == 0 {
            b += du[i] * mm;
        }
        if j == nv - 1 {
            b += du[i] * mm;
        }
        b
    };
    let nc = |x: f64| Complex64::new(x, 0.0);
    let jw = Complex64::new(0.0, w);

    let resoudre = |reel: bool| -> Option<Vec<Vec<Option<Complex64>>>> {
        // les branches et les noeuds gardes, et leur rang local
        let sb: Vec<usize> = (0..n_b).filter(|&b| !reel || toutes[b].reel).collect();
        let sn: Vec<usize> = (0..n_n).filter(|&k| !reel || reel_n[k]).collect();
        let bouts: Vec<(Option<usize>, Option<usize>)> = scene.pistes.iter().map(|p| (bout(p, false, reel), bout(p, true, reel))).collect();
        let (Some(s_), Some(e_)) = bouts[0] else { return None };
        if s_ == e_ {
            return None;
        }
        let np = bouts.len();
        let (nb_s, n) = (sb.len(), sn.len());
        let mut loc = vec![usize::MAX; n_n];
        for (k, &g) in sn.iter().enumerate() {
            loc[g] = k;
        }
        // X = L^-1 [A^T | mutuelles des pistes]
        let l = Mat::from_fn(nb_s, nb_s, |i, j| l_tampon[sb[j] * n_b + sb[i]]);
        let mut second = Mat::<f64>::zeros(nb_s, n + np);
        for (bl, &b) in sb.iter().enumerate() {
            let (de, a) = (loc[toutes[b].de], loc[toutes[b].a]);
            if de != usize::MAX {
                second[(bl, de)] = 1.0;
            }
            if a != usize::MAX {
                second[(bl, a)] = -1.0;
            }
            for (k, mp) in mps.iter().enumerate() {
                second[(bl, n + k)] = mp[b];
            }
        }
        let x = l.partial_piv_lu().solve(&second);
        drop(l);
        drop(second);
        // A X, ligne par ligne : chaque branche ajoute a son noeud de depart et retire a l'autre
        let ax = |col: usize, sortie: &mut [f64]| {
            for (bl, &b) in sb.iter().enumerate() {
                let (de, a) = (loc[toutes[b].de], loc[toutes[b].a]);
                let v = x[(bl, col)];
                if de != usize::MAX {
                    sortie[de] += v;
                }
                if a != usize::MAX {
                    sortie[a] -= v;
                }
            }
        };
        // LA CAPACITE DE CHAQUE MAILLE EN REGARD ENTRE PLANS VOISINS, ET AU
        // BORD DE LA FENETRE L'ONDE DE LA CAVITE QUI S'EN VA.
        let mut s = Mat::<Complex64>::zeros(n, n);
        let mut colonne = vec![0.0; n];
        for col in 0..n {
            colonne.iter_mut().for_each(|v| *v = 0.0);
            ax(col, &mut colonne);
            for i in 0..n {
                s[(i, col)] = nc(colonne[i]) / jw;
            }
            s[(col, col)] += jw * PEEC_REG;
        }
        for p in 0..plans.len() - 1 {
            let h = (plans[p + 1].z - plans[p].z).abs() * mm;
            let er = scene.eps[p];
            for i in 0..nu {
                for j in 0..nv {
                    if reel && !(masques[p][i * nv + j] && masques[p + 1][i * nv + j]) {
                        continue;
                    }
                    let yv = jw * EPS_0 * er * aire(i, j) / h
                        + nc(bord(i, j) * er.sqrt() / (ETA_0 * h));
                    let (ia, ib) = (loc[noeud(p, i, j)], loc[noeud(p + 1, i, j)]);
                    s[(ia, ia)] += yv;
                    s[(ib, ib)] += yv;
                    s[(ia, ib)] -= yv;
                    s[(ib, ia)] -= yv;
                }
            }
        }
        let mut rhs = Mat::<Complex64>::zeros(n, np);
        for (k, (a0, a1)) in bouts.iter().enumerate() {
            colonne.iter_mut().for_each(|v| *v = 0.0);
            ax(n + k, &mut colonne);
            for i in 0..n {
                rhs[(i, k)] = nc(colonne[i]);
            }
            if let (Some(a0), Some(a1)) = (a0, a1) {
                rhs[(loc[*a1], k)] += 1.0;
                rhs[(loc[*a0], k)] -= 1.0;
            }
        }
        // le noeud de depart de l'agresseur est la reference des potentiels
        let garde: Vec<usize> = (0..n).filter(|&k| k != loc[s_]).collect();
        let s_g = Mat::from_fn(n - 1, n - 1, |i, j| s[(garde[i], garde[j])]);
        let rhs_g = Mat::from_fn(n - 1, np, |i, k| rhs[(garde[i], k)]);
        drop(s);
        let phi_g = s_g.partial_piv_lu().solve(&rhs_g);
        let mut phi = Mat::<Complex64>::zeros(n, np);
        for (i, &gi) in garde.iter().enumerate() {
            for k in 0..np {
                phi[(gi, k)] = phi_g[(i, k)];
            }
        }
        // I = X[:, :n] phi / jw - X[:, n:], puis Z[j][k]
        let mut z = vec![vec![None; np]; np];
        for (k, (b0, b1)) in bouts.iter().enumerate() {
            if b0.is_none() || b1.is_none() {
                continue;
            }
            let courant: Vec<Complex64> = (0..nb_s).map(|bl| {
                let mut somme = Complex64::new(0.0, 0.0);
                for i in 0..n {
                    somme += phi[(i, k)] * x[(bl, i)];
                }
                somme / jw - x[(bl, n + k)]
            }).collect();
            for (j, (a0, a1)) in bouts.iter().enumerate() {
                if let (Some(a0), Some(a1)) = (a0, a1) {
                    let mut flux = Complex64::new(0.0, 0.0);
                    for (bl, &b) in sb.iter().enumerate() {
                        flux += courant[bl] * mps[j][b];
                    }
                    z[j][k] = Some(jw * flux
                                   + phi[(loc[*a1], k)] - phi[(loc[*a0], k)]);
                }
            }
        }
        Some(z)
    };

    let vide = resoudre(true)?;
    let plein = resoudre(false)?;
    Some(Resolu { vide, plein, branches: toutes.iter().filter(|b| b.reel).count(),
                  mailles: (nu, nv) })
}

/// Ce que `peec_fente` rend (un dict en Python).
#[derive(Debug, Clone)]
pub struct Peec {
    pub ld: f64,
    pub m: Vec<Option<f64>>,
    pub selfs: Vec<Option<f64>>,
    pub mutuelles: Vec<Vec<Option<f64>>>,
    pub mailles: (usize, usize),
    pub branches: usize,
    pub croissance: f64,
    pub pas_max: f64,
}

/// L'option B : ce que les vides des plans dans la fenetre ajoutent a la
/// boucle de l'agresseur (L_d) et a la mutuelle vers chaque victime (M), en
/// H, au genou f. Rend None si rien n'est maillable.
///
/// `Err` : le maillage depasse le budget (le `ValueError` de Python) ou la resolution n'a
/// rien rendu de fini.
pub fn peec_fente(scene: &Scene, f: f64) -> Result<Option<Peec>, String> {
    let n_plans = scene.plans.len().max(1);
    let mut choix = None;
    let mut n_b = 0;
    for (g, s_max) in PEEC_CROISSANCES {
        let (eu, ev) = _maillage_peec(scene, g, s_max);
        n_b = 2 * (eu.len() - 1) * (ev.len() - 1) * n_plans;
        if n_b <= PEEC_BRANCHES_MAX {
            choix = Some((g, s_max));
            break;
        }
    }
    // MEME LA CROISSANCE LA PLUS LACHE DEPASSE LE BUDGET : on refuse. La
    // resoudre quand meme, c'etait une matrice dense de n_b^2 (24 000
    // branches : 4,6 Go) et des minutes par fente -- vingt minutes
    // d'audit sur une carte reelle. Les appelants passent alors a Ott.
    let Some((g, s_max)) = choix else {
        return Err(format!("maillage trop fin : {n_b} branches, budget {PEEC_BRANCHES_MAX}"));
    };
    let Some(r) = _resoudre_peec(scene, f, g, s_max) else { return Ok(None) };
    let w = 2.0 * PI * f;
    let np = r.vide.len();
    // CE QUE LES VIDES AJOUTENT, piste par piste : la diagonale est la self
    // du detour de chaque boucle, le reste la mutuelle -- reciproque, on
    // moyenne les deux sens pour que l'arrondi du maillage n'en fasse pas deux.
    let mut dz: Vec<Vec<Option<f64>>> = (0..np).map(|j| (0..np).map(|k| match (r.vide[j][k], r.plein[j][k]) {
        (Some(v), Some(p)) => Some((v - p).norm() / w),
        _ => None,
    }).collect()).collect();
    for j in 0..np {
        for k in j + 1..np {
            if let (Some(a), Some(b)) = (dz[j][k], dz[k][j]) {
                dz[j][k] = Some(0.5 * (a + b));
                dz[k][j] = dz[j][k];
            }
        }
    }
    if dz.iter().flatten().flatten().any(|v| !v.is_finite()) {
        return Err("Singular matrix".into());
    }
    Ok(Some(Peec { ld: dz[0][0].unwrap_or(0.0), m: (1..np).map(|j| dz[j][0]).collect(),
                   selfs: (0..np).map(|j| dz[j][j]).collect(), mutuelles: dz,
                   mailles: r.mailles, branches: r.branches,
                   croissance: g, pas_max: s_max }))
}

// -- La scene de l'option B : de ce que la page envoie au maillage ----------

pub const PEEC_FENTES_MAX: usize = 6; // fentes resolues par analyse ; au-dela, Ott

/// La cote (mm, vers le bas depuis le dessus de la carte) du milieu de la
/// couche k de l'empilage.
pub fn _z_couche(couches: &[Json], k: usize) -> f64 {
    py::sum(couches[..k].iter().map(|c| _nb(&c["thickness"], 0.0)))
        + _nb(&couches[k]["thickness"], 0.035) / 2.0
}

/// La permittivite moyenne des dielectriques entre les couches a et b.
pub fn _eps_entre(couches: &[Json], a: usize, b: usize) -> f64 {
    let (lo, hi) = (a.min(b), a.max(b));
    let ers: Vec<f64> = couches[(lo + 1).min(hi)..hi].iter()
        .filter(|c| c["type"].as_str() == Some("dielectric") && _nb(&c["epsilon_r"], 0.0) > 0.0)
        .map(|c| _nb(&c["epsilon_r"], 0.0)).collect();
    if ers.is_empty() { 4.3 } else { py::sum(ers.iter().copied()) / ers.len() as f64 }
}

/// « Du cuivre ici ? » pour un plan envoye en LIGNES : la ligne k est a
/// v = v0 + k.pas, et porte les bords [u0, u1, u2, u3, ...] de ses plages de
/// cuivre en u (mm, triees). Un point tombe dans une plage quand le nombre
/// de bords a sa gauche est impair.
pub fn dedans_lignes(v0: f64, pas: f64, lignes: Vec<Vec<f64>>) -> Dedans {
    let pas = pas.max(1e-6);
    Arc::new(move |u: f64, v: f64| {
        if lignes.is_empty() {
            return false;
        }
        let k = (((v - v0) / pas).round_ties_even() as i64).clamp(0, lignes.len() as i64 - 1) as usize;
        let l = &lignes[k];
        // np.searchsorted(l, u, side="right") % 2 == 1
        l.partition_point(|b| *b <= u) % 2 == 1
    })
}

/// Le segment coupe a la fenetre [-U, U] x [-V, V] (Liang-Barsky), ou
/// None.
pub fn _coupe_fenetre(u0: f64, v0: f64, u1: f64, v1: f64, u_max: f64, v_max: f64) -> Option<(f64, f64, f64, f64)> {
    let (mut t0, mut t1) = (0.0f64, 1.0f64);
    let (du, dv) = (u1 - u0, v1 - v0);
    for (p, q) in [(-du, u0 + u_max), (du, u_max - u0), (-dv, v0 + v_max), (dv, v_max - v0)] {
        if p.abs() < 1e-15 {
            if q < 0.0 {
                return None;
            }
            continue;
        }
        let r = q / p;
        if p < 0.0 {
            t0 = maxf(&[t0, r]);
        } else {
            t1 = minf(&[t1, r]);
        }
        if t0 > t1 {
            return None;
        }
    }
    if t1 - t0 < 1e-9 {
        return None;
    }
    Some((u0 + du * t0, v0 + dv * t0, u0 + du * t1, v0 + dv * t1))
}

/// L'exploration de `chaine_piste` : son etat, et le budget partage par tous les departs.
struct Exploration<'a> {
    voisins: &'a [[Vec<(usize, usize)>; 2]],
    longueur: &'a [f64],
    meilleur: (Vec<(usize, usize)>, f64),
    budget: i64,
}

impl Exploration<'_> {
    fn explorer(&mut self, chemin: &mut Vec<(usize, usize)>, vus: &mut Vec<bool>, total: f64, i: usize, e_sortie: usize) {
        self.budget -= 1;
        if total > self.meilleur.1 {
            self.meilleur = (chemin.clone(), total);
        }
        if self.budget <= 0 {
            return;
        }
        let voisins = self.voisins;
        for &(j, f) in &voisins[i][e_sortie] {
            if vus[j] {
                continue;
            }
            chemin.push((j, f));
            vus[j] = true;
            self.explorer(chemin, vus, total + self.longueur[j], j, 1 - f);
            vus[j] = false;
            chemin.pop();
        }
    }
}

/// Le plus long chemin d'une piste dans la fenetre, en morceaux
/// (u0, v0, u1, v1, z, w) mis bout a bout et orientes vers les u
/// croissants : c'est lui qui porte le courant de la boucle, d'un bout de
/// fenetre a l'autre. Un bout pendant (une derivation) ne porte rien.
///
/// Le `tol` du Python vaut 0,02.
pub fn chaine_piste(segments: &[Piece], tol: f64) -> Vec<Piece> {
    let segs: Vec<Piece> = segments.iter().copied().filter(|s| py::hypot(s.2 - s.0, s.3 - s.1) > 1e-6).collect();
    if segs.is_empty() {
        return Vec::new();
    }
    let bouts: Vec<[(f64, f64); 2]> = segs.iter().map(|s| [(s.0, s.1), (s.2, s.3)]).collect();

    let proches = |p: (f64, f64), q: (f64, f64)| (p.0 - q.0).abs() <= tol && (p.1 - q.1).abs() <= tol;
    let voisins: Vec<[Vec<(usize, usize)>; 2]> = (0..segs.len()).map(|i| [0, 1].map(|e| {
        let mut v = Vec::new();
        for j in 0..segs.len() {
            if j != i {
                for f in 0..2 {
                    if proches(bouts[i][e], bouts[j][f]) {
                        v.push((j, f));
                    }
                }
            }
        }
        v
    })).collect();
    let longueur: Vec<f64> = segs.iter().map(|s| py::hypot(s.2 - s.0, s.3 - s.1)).collect();
    let mut x = Exploration { voisins: &voisins, longueur: &longueur, meilleur: (Vec::new(), 0.0), budget: 4000 };

    let depart = |x: &mut Exploration, i: usize, e: usize| {
        let mut vus = vec![false; segs.len()];
        vus[i] = true;
        x.explorer(&mut vec![(i, e)], &mut vus, longueur[i], i, 1 - e);
    };
    for i in 0..segs.len() {
        for e in 0..2 {
            if voisins[i][e].is_empty() {
                depart(&mut x, i, e);
            }
        }
    }
    if x.meilleur.0.is_empty() {
        depart(&mut x, 0, 0);
    }
    let mut out: Vec<Piece> = x.meilleur.0.iter().map(|&(i, e)| {
        let (u0, v0, u1, v1, z, w) = segs[i];
        if e == 0 { (u0, v0, u1, v1, z, w) } else { (u1, v1, u0, v0, z, w) }
    }).collect();
    if py::sum(out.iter().map(|p| p.2 - p.0)) < 0.0 {
        out = out.iter().rev().map(|&(u0, v0, u1, v1, z, w)| (u1, v1, u0, v0, z, w)).collect();
    }
    out
}

/// La scene du PEEC d'une fente, d'apres l'image que la page a envoyee
/// (`maillage`) et le cuivre des pistes (listes de (x1, y1, x2, y2, largeur,
/// couche) en mm, repere de la carte). Rend (scene, noms des victimes
/// retenues, notes) ou (None, [], raison).
pub fn scene_fente(maillage: &Json, couches: &[Json], agresseur: &[Trc], victimes: &[(String, Vec<Trc>)]) -> (Option<Scene>, Vec<String>, String) {
    let incomplete = || (None, Vec::new(), "image du plan incomplète".to_string());
    let lire = |cle: &str| dc_solver::pyth::float_py(&maillage[cle]).ok();
    let (Some(cx), Some(cy), Some(ux), Some(uy), Some(u_max), Some(v_max), Some(v0), Some(pas)) =
        (lire("x"), lire("y"), lire("ux"), lire("uy"), lire("U"), lire("V"), lire("v0"), lire("pas")) else { return incomplete() };
    let n = py::hypot(ux, uy);
    if !(n > 0.0 && u_max > 0.0 && v_max > 0.0 && pas > 0.0) {
        return incomplete();
    }
    let plans: Vec<(String, Dedans)> = els(&maillage["plans"]).iter().filter(|p| p["lignes"].as_liste().is_some())
        .map(|p| (str_py(&p["nom"]),
                  dedans_lignes(v0, pas, els(&p["lignes"]).iter().map(|l| els(l).iter().map(nb).collect()).collect())))
        .collect();
    let mut vias = Vec::new();
    for v in els(&maillage["vias"]) {
        let (Ok(vu), Ok(vv)) = (dc_solver::pyth::float_py(&v["u"]), dc_solver::pyth::float_py(&v["v"])) else { continue };
        // shortcut: `couches` en texte est lu comme un seul nom (Python y cherchait une
        // sous-chaine) ; la page envoie une liste ou rien.
        let sur = match &v["couches"] {
            Json::Nul => None,
            Json::Liste(l) => Some(l.iter().map(str_py).collect()),
            autre => Some(vec![str_py(autre)]),
        };
        vias.push((vu, vv, _nb(&v["d"], 0.3), sur));
    }
    scene_plans(cx, cy, ux / n, uy / n, u_max, v_max, plans, &vias, couches,
                agresseur, victimes)
}

/// `np.arange(debut, fin, pas)`
fn arange(debut: f64, fin: f64, pas: f64) -> Vec<f64> {
    let n = ((fin - debut) / pas).ceil().max(0.0) as usize;
    let delta = (debut + pas) - debut;
    (0..n).map(|i| debut + i as f64 * delta).collect()
}

/// La scene du PEEC autour du point (cx, cy) de la carte, l'agresseur
/// allant selon (ux, uy) : les plans {nom, dedans(u, v)} dans ce repere
/// (v a gauche du sens de marche), les vias de masse (u, v, d, [noms de
/// plans] ou None pour tous), et le cuivre des pistes (x1, y1, x2, y2,
/// largeur, couche). Rend (scene, noms des victimes retenues, raison).
///
/// `u_max` et `v_max` : les demi-cotes U et V de la fenetre.
pub fn scene_plans(cx: f64, cy: f64, ux: f64, uy: f64, u_max: f64, v_max: f64, plans: Vec<(String, Dedans)>,
                   vias_l: &[(f64, f64, f64, Option<Vec<String>>)], couches: &[Json], agresseur: &[Trc],
                   victimes: &[(String, Vec<Trc>)]) -> (Option<Scene>, Vec<String>, String) {
    // {str(c.get("name")): k} : le dernier du nom l'emporte
    let rang = |nom: &str| couches.iter().rposition(|c| str_py(&c["name"]) == nom);
    let mut plans: Vec<PlanScene> = plans.into_iter().filter_map(|(nom, dedans)| {
        let k = rang(&nom)?;
        Some(PlanScene { nom, dedans, k, z: _z_couche(couches, k) })
    }).collect();
    if plans.is_empty() {
        return (None, Vec::new(), "aucun plan de l'image dans l'empilage".into());
    }
    plans.sort_by(|a, b| a.z.partial_cmp(&b.z).unwrap_or(std::cmp::Ordering::Equal));

    let local = |x: f64, y: f64| ((x - cx) * ux + (y - cy) * uy, -(x - cx) * uy + (y - cy) * ux);

    let pieces = |troncons: &[Trc]| -> Vec<Piece> {
        let mut segs = Vec::new();
        for &(x1, y1, x2, y2, w, k) in troncons {
            let (a, b) = (local(x1, y1), local(x2, y2));
            if let Some(c) = _coupe_fenetre(a.0, a.1, b.0, b.1, u_max, v_max) {
                if k < 0 || k as usize >= couches.len() {
                    continue;
                }
                segs.push((c.0, c.1, c.2, c.3, _z_couche(couches, k as usize), maxf(&[w, 0.01])));
            }
        }
        chaine_piste(&segs, 0.02)
    };

    let agr = pieces(agresseur);
    if agr.is_empty() {
        return (None, Vec::new(), "l'agresseur ne traverse pas l'image".into());
    }
    let (mut pistes, mut noms) = (vec![agr.clone()], Vec::new());
    for (nom, tr) in victimes {
        let p = pieces(tr);
        if !p.is_empty() {
            pistes.push(p);
            noms.push(nom.clone());
        }
    }
    let mut vias = Vec::new();
    for (vu, vv, d, sur) in vias_l {
        let idx: Vec<usize> = plans.iter().enumerate().filter(|(_, p)| sur.as_ref().is_none_or(|s| s.contains(&p.nom))).map(|(i, _)| i).collect();
        if idx.len() >= 2 && vu.abs() <= u_max && vv.abs() <= v_max {
            vias.push((*vu, *vv, maxf(&[*d, 0.05]) / 2.0, idx));
        }
    }
    // LES CLES DU MAILLAGE : ou il doit etre fin. Les bords de cuivre que
    // l'agresseur franchit (en u), son axe, celui des victimes, les bouts de
    // la fente et les vias (en v).
    let (z_a, w_a) = (agr[0].4, agr[0].5);
    let h_a = minf(&plans.iter().map(|p| (p.z - z_a).abs()).collect::<Vec<_>>());
    let s_min = minf(&[0.25, maxf(&[0.05, 0.5 * minf(&[w_a, maxf(&[h_a, 0.05])])])]);
    let pas_t = maxf(&[0.02, 0.4 * s_min]);
    let us = arange(-u_max, u_max + pas_t, pas_t);
    let (mut cles_u, mut cles_v) = (Vec::new(), vec![0.0]);
    for p in &plans {
        let d: Vec<bool> = us.iter().map(|&u| (p.dedans)(u, 0.0)).collect();
        for i in 0..d.len().saturating_sub(1) {
            if d[i + 1] == d[i] {
                continue;
            }
            // un flottant numpy : son arrondi est celui de numpy
            cles_u.push(rnp(0.5 * (us[i] + us[i + 1]), 4));
            if !d[i + 1] {
                // LE BOUT DE LA FENTE, de part et d'autre de la piste.
                let fin = d[i + 1..].iter().position(|x| *x).unwrap_or(0);
                let um = 0.5 * (us[i + 1] + us[i + 1 + fin]);
                let vs = arange(-v_max, v_max + pas_t, pas_t);
                let dv_: Vec<bool> = vs.iter().map(|&v| (p.dedans)(um, v)).collect();
                for j in 0..dv_.len().saturating_sub(1) {
                    if dv_[j + 1] != dv_[j] {
                        cles_v.push(rnp(0.5 * (vs[j] + vs[j + 1]), 4));
                    }
                }
            }
        }
    }
    for pi in &pistes[1..] {
        let mut q = pi[0];
        for x in &pi[1..] {
            if (0.5 * (x.0 + x.2)).abs() < (0.5 * (q.0 + q.2)).abs() {
                q = *x;
            }
        }
        cles_v.push(round(0.5 * (q.1 + q.3), 4));
    }
    for v in &vias {
        cles_u.push(v.0);
        cles_v.push(v.1);
    }
    let triees = |mut c: Vec<f64>| {
        c.sort_by(f64::total_cmp);
        c.dedup();
        c
    };
    let eps = (0..plans.len() - 1).map(|i| _eps_entre(couches, plans[i].k, plans[i + 1].k)).collect();
    let scene = Scene { u: u_max, v: v_max, s_min, plans,
                        eps,
                        vias, pistes,
                        cles_u: triees(cles_u), cles_v: triees(cles_v) };
    (Some(scene), noms, String::new())
}

/// Le terme de la victime i (0 = la premiere) d'une resolution PEEC, au
/// format de `impedance_commune_fente` : la meme formule, avec la self du
/// detour et la mutuelle RESOLUES au lieu d'estimees. `ott`, quand le modele
/// d'Ott s'applique aussi (tous les plans coupes), donne sa fourchette, qui
/// encadre alors les deux modeles, et `facteur` la resonance de la fente
/// (option C) que le quasi statique ne voit pas.
pub fn terme_peec(r: &Peec, i: usize, t_r: f64, z0: f64, ott: Option<&Json>, facteur: f64) -> Json {
    let t_r = if t_r > 0.0 { t_r } else { TR_DEFAUT };
    let z0 = if z0 > 0.0 { z0 } else { 50.0 };
    let ott = ott.filter(|o| o.vrai());
    let (l_d, m) = (r.ld, r.m[i].unwrap_or(0.0));
    let reso = ott.map(|o| &o["resonance"]).filter(|x| x.vrai());
    let (l_d, m) = (l_d * facteur, m * facteur);
    let m = if l_d > 0.0 { minf(&[m, l_d]) } else { 0.0 };
    let tau = if l_d > 0.0 { l_d / (2.0 * z0) } else { 0.0 };
    let lissage = if tau > 0.0 { 1.0 - (-t_r / tau).exp() } else { 1.0 };
    let nxt = m / (2.0 * z0 * t_r) * lissage;
    let (mut bas, mut haut) = (nxt, nxt);
    if let Some(ott) = ott {
        (bas, haut) = (minf(&[nxt, nb(&ott["fourchette"][0])]), maxf(&[nxt, nb(&ott["fourchette"][1])]));
    }
    let de_reso = |cle: &str, defaut: f64| reso.and_then(|x| x.get(cle)).cloned().unwrap_or(Json::Flottant(defaut));
    let mut out = obj! {
        "modele" => "B", "z0" => round(z0, 2), "t_r" => t_r,
        "ld_nh" => round(1e9 * l_d, 3), "m_nh" => round(1e9 * m, 3),
        "k" => if l_d > 0.0 { round(m / l_d, 4) } else { 0.0 },
        "tau_ps" => round(1e12 * tau, 2), "lissage" => round(lissage, 4),
        "next" => round(nxt, 6), "fext" => round(nxt, 6),
        "next_pc" => round(100.0 * nxt, 3), "fext_pc" => round(100.0 * nxt, 3),
        "fourchette" => vec![round(bas, 6), round(haut, 6)],
        "fourchette_pc" => vec![round(100.0 * bas, 3), round(100.0 * haut, 3)],
        "resonance" => obj! {"appliquee" => ott.is_some(),
                             "facteur" => round(facteur, 4),
                             "sensible" => facteur > FENTE_RESONANCE_SENSIBLE,
                             "f_genou" => 0.35 / t_r,
                             "f_quart_onde" => de_reso("f_quart_onde", 0.0),
                             "eps_plan" => de_reso("eps_plan", 1.0)},
        "maillage" => obj! {"mailles" => vec![r.mailles.0, r.mailles.1], "branches" => r.branches,
                            "croissance" => r.croissance, "pas_max_mm" => r.pas_max},
        "methode" => "courant de retour résolu autour de la fente (PEEC quasi \
                      statique au genou 0,35/t_r : selfs partielles des mailles \
                      des plans, capacité entre plans, vias de masse) ; L_d et M \
                      = ce que les vides ajoutent aux plans pleins ; f.é.m. \
                      M·dI/dt partagée en +NEXT / −FEXT, lissée par \
                      τ = L_d/2Z0"};
    if let Some(ott) = ott {
        let mut o = obj! {};
        for k in ["ld_nh", "m_nh", "next_pc", "fourchette_pc"] {
            poser(&mut o, k, &ott[k]);
        }
        poser(&mut out, "ott", o);
    }
    out
}
