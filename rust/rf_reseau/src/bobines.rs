//! Le couplage magnetique des selfs, et les fentes du plan de reference.

use crate::alg::*;
use crate::couplage::_bouts;
use crate::surfaces::{Cache, _ligne, MU_0};
use crate::tl;
use em::simulation_em::base::*;
use std::f64::consts::PI;

// ==========================================================================
// Le couplage magnetique des selfs
// --------------------------------------------------------------------------
// DEUX SELFS CMS COTE A COTE SE PARLENT, et une self parle aux pistes qui
// passent sous son flanc. Chaque self est un SOLENOIDE : son axe va d'une
// pastille a l'autre (c'est une self bobinee CMS, LQW et consoeurs), son
// diametre est 70 % de la largeur du boitier -- tiree de la pastille --, sa
// longueur 60 % de l'entraxe, son centre a mi-hauteur du boitier au-dessus du
// cuivre. On le decoupe en six spires-filaments de N/6 tours, plus le courant
// qui avance le long de l'axe. N se tire de la self du modele par Wheeler,
// L = mu0 N^2 pi r^2 / (l + 0,9 r) : la mutuelle ne depend donc que de la
// geometrie et des selfs, pas d'un nombre de tours qu'on ne connait pas.
//
// LES MUTUELLES SONT DE NEUMANN, M = mu0/4pi SS dl.dl'/r, par Gauss-Legendre
// sur des segments, AVEC L'IMAGE dans le plan de reference : le plan
// conducteur renverse les courants horizontaux de l'image, et c'est lui qui
// ferme la boucle d'une piste. Une self et une piste d'une autre face, ou
// d'une couche interne sous le plan, ne se voient pas.
//
// LE SENS D'ENROULEMENT n'est pas sur le dessin. Il ne change rien entre deux
// selfs de la meme serie (le signe se compense) ; entre une self et une piste,
// on le prend DROIT, et la fiche le dit.
// ==========================================================================

pub const BOBINE_SPIRES: usize = 6;
pub const BOBINE_COTES: usize = 12;
pub const COUPLAGE_BOBINES_MM: f64 = 6.0; // entraxe au-dela duquel deux selfs sont seules
pub const COUPLAGE_PISTE_MM: f64 = 3.0; // piste au-dela de laquelle une self est seule
// np.polynomial.legendre.leggauss(6)
pub const _GL_X: [f64; 6] = [-0.9324695142031519, -0.6612093864662645, -0.2386191860831969, 0.2386191860831969, 0.6612093864662645, 0.9324695142031519];
pub const _GL_W: [f64; 6] = [0.17132449237917027, 0.3607615730481387, 0.46791393457269104, 0.46791393457269104, 0.3607615730481387, 0.17132449237917027];

pub type P3 = [f64; 3];
/// Une famille de segments P -> Q (m) et le courant que chacun porte.
pub type Segments = (Vec<P3>, Vec<P3>, Vec<f64>);

/// La mutuelle (H) entre deux familles de segments P -> Q (m), chaque
/// segment pondere par le courant qu'il porte.
pub fn _neumann(a: &Segments, b: &Segments) -> f64 {
    let ((pa, qa, wa), (pb, qb, wb)) = (a, b);
    if pa.is_empty() || pb.is_empty() {
        return 0.0;
    }
    let t: Vec<f64> = _GL_X.iter().map(|x| 0.5 * (x + 1.0)).collect();
    let w: Vec<f64> = _GL_W.iter().map(|x| 0.5 * x).collect();
    let point = |p: &P3, q: &P3, t: f64| -> P3 { [p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1]), p[2] + t * (q[2] - p[2])] };
    let mut total = 0.0;
    for i0 in (0..pa.len()).step_by(64) {
        // par paquets : la memoire reste bornee
        let mut termes = Vec::new();
        for i in i0..(i0 + 64).min(pa.len()) {
            let ra: Vec<P3> = t.iter().map(|&t| point(&pa[i], &qa[i], t)).collect();
            for j in 0..pb.len() {
                let mut integ = Vec::with_capacity(36);
                for (ka, pa_) in ra.iter().enumerate() {
                    for (kb, &tb) in t.iter().enumerate() {
                        let rb = point(&pb[j], &qb[j], tb);
                        let d = [pa_[0] - rb[0], pa_[1] - rb[1], pa_[2] - rb[2]];
                        let inv = 1.0 / (d[0] * d[0] + d[1] * d[1] + d[2] * d[2]).sqrt().max(1e-9);
                        integ.push(inv * w[ka] * w[kb]);
                    }
                }
                let dot = (0..3).map(|k| (qa[i][k] - pa[i][k]) * (qb[j][k] - pb[j][k])).sum::<f64>();
                termes.push(wa[i] * wb[j] * dot * somme_np(&integ));
            }
        }
        total += somme_np(&termes);
    }
    1e-7 * total
}

/// L'image dans le plan z = 0 : miroir, courant horizontal renverse.
pub fn _image(seg: &Segments) -> Segments {
    let miroir = |v: &Vec<P3>| v.iter().map(|p| [p[0], p[1], p[2] * -1.0]).collect();
    (miroir(&seg.0), miroir(&seg.1), seg.2.iter().map(|w| -w).collect())
}

/// Ce que `bobine` rend (un dict en Python).
#[derive(Debug, Clone, PartialEq)]
pub struct Bobine {
    pub seg: Segments,
    pub c: P3,
    pub u: P3,
    pub couche: i64,
    pub demi: (f64, f64),
    pub n: f64,
}

/// Les segments d'une self CMS (m, plan de reference en z = 0), ou None.
/// `geo` : pastilles x0, y0 -> x1, y1 (mm), largeur, couche.
pub fn bobine(couches: &[Json], geo: &Json, l_h: f64, cache: &mut Cache) -> Option<Bobine> {
    let (x0, y0) = (nb(&geo["x0"]), nb(&geo["y0"]));
    let (x1, y1) = (nb(&geo["x1"]), nb(&geo["y1"]));
    let entraxe = py::hypot(x1 - x0, y1 - y0);
    let larg = minf(&[maxf(&[_nombre(&geo["largeur"], 0.5), 0.2]), 3.0]);
    let couche = ent(&geo["couche"], 0);
    let li = _ligne(couches, couche, larg, 0.035, cache);
    if !(entraxe > 0.1 && l_h > 0.0) {
        return None;
    }
    let li = li?;
    let (ux, uy) = ((x1 - x0) / entraxe, (y1 - y0) / entraxe);
    let u = [ux, uy, 0.0];
    let nrm = [-uy, ux, 0.0];
    let z = [0.0, 0.0, 1.0];
    let r = 0.35 * larg * 1e-3;
    let lc = 0.6 * entraxe * 1e-3;
    let c = [0.5 * (x0 + x1) * 1e-3, 0.5 * (y0 + y1) * 1e-3, li.h + 35e-6 + 0.5 * larg * 1e-3];
    let n_tours = (l_h * (lc + 0.9 * r) / (MU_0 * PI * r * r)).sqrt();
    // np.linspace(0, 2 pi, BOBINE_COTES + 1)
    let pas = 2.0 * PI / BOBINE_COTES as f64;
    let th: Vec<f64> = (0..=BOBINE_COTES).map(|k| if k == BOBINE_COTES { 2.0 * PI } else { k as f64 * pas }).collect();
    let (mut p, mut q, mut w) = (Vec::new(), Vec::new(), Vec::new());
    for s in 0..BOBINE_SPIRES {
        let f = (s as f64 + 0.5) / BOBINE_SPIRES as f64 - 0.5;
        let cs: P3 = std::array::from_fn(|d| c[d] + u[d] * lc * f);
        // nrm x z = u : la spire tourne dans le sens droit autour de l'axe.
        let pts: Vec<P3> = th.iter().map(|t| std::array::from_fn(|d| cs[d] + r * (t.cos() * nrm[d] + t.sin() * z[d]))).collect();
        p.extend_from_slice(&pts[..BOBINE_COTES]);
        q.extend_from_slice(&pts[1..]);
    }
    w.resize(p.len(), n_tours / BOBINE_SPIRES as f64);
    p.push(std::array::from_fn(|d| c[d] - 0.5 * lc * u[d]));
    q.push(std::array::from_fn(|d| c[d] + 0.5 * lc * u[d]));
    w.push(1.0);
    Some(Bobine { seg: (p, q, w), c, u, couche, demi: (0.5 * entraxe + 0.25 * larg, 0.5 * larg), n: n_tours })
}

pub fn mutuelle_bobines(b1: &Bobine, b2: &Bobine) -> f64 {
    _neumann(&b1.seg, &b2.seg) + _neumann(&b1.seg, &_image(&b2.seg))
}

/// Les morceaux (m) d'une branche qui passent a moins de 3 mm d'une self,
/// sur sa couche, hors de son empreinte, parcourus de a vers b.
pub fn segments_piste(couches: &[Json], objets: &[Json], bob: &Bobine, cache: &mut Cache) -> Option<Segments> {
    let (mut p, mut q) = (Vec::new(), Vec::new());
    for o in objets {
        if ent(&o["layer"], -1) != bob.couche {
            continue;
        }
        let ((ax, ay), (bx, by)) = _bouts(o);
        let lg = py::hypot(bx - ax, by - ay);
        let li = _ligne(couches, bob.couche, nb(&o["width"]), _nombre(&o["copper_thickness"], 0.035), cache);
        let Some(li) = li.filter(|_| !(lg < 1e-6)) else {
            continue;
        };
        let zt = li.h + 0.5e-3 * _nombre(&o["copper_thickness"], 0.035);
        let n = ((lg / 0.1).ceil() as i64).min(400);
        for i in 0..n {
            let (f1, f2) = (i as f64 / n as f64, (i + 1) as f64 / n as f64);
            let xm = (ax + (bx - ax) * 0.5 * (f1 + f2)) * 1e-3;
            let ym = (ay + (by - ay) * 0.5 * (f1 + f2)) * 1e-3;
            let (dx, dy) = (xm - bob.c[0], ym - bob.c[1]);
            let along = (dx * bob.u[0] + dy * bob.u[1]).abs() * 1e3;
            let across = (-dx * bob.u[1] + dy * bob.u[0]).abs() * 1e3;
            if py::hypot(dx, dy) * 1e3 > COUPLAGE_PISTE_MM || (along <= bob.demi.0 && across <= bob.demi.1) {
                continue;
            }
            p.push([(ax + (bx - ax) * f1) * 1e-3, (ay + (by - ay) * f1) * 1e-3, zt]);
            q.push([(ax + (bx - ax) * f2) * 1e-3, (ay + (by - ay) * f2) * 1e-3, zt]);
        }
    }
    if p.is_empty() {
        return None;
    }
    let w = vec![1.0; p.len()];
    Some((p, q, w))
}

pub fn mutuelle_piste(bob: &Bobine, seg: &Segments) -> f64 {
    _neumann(&bob.seg, seg) + _neumann(&bob.seg, &_image(seg))
}

// ==========================================================================
// Les fentes du plan de reference
// --------------------------------------------------------------------------
// UNE PISTE QUI FRANCHIT UNE FENTE DE SON PLAN y perd son retour : le courant
// de retour, qui la suivait dessous, doit contourner la fente par ses deux
// bouts. La page mesure, au franchissement, la distance d1 et d2 jusqu'a
// chaque bout (et plafonne a 30 mm un plan coupe de bord a bord). Chaque
// detour est une self, par la formule de Ott (EMC Engineering, 2009) :
// L = (mu0 / 2 pi) D ln(D / W) pour une fente de longueur D franchie en son
// milieu par une piste de largeur W. Cette L est celle des DEUX detours de
// D/2 en parallele : un detour d est donc une moitie de la fente D = 2d, et
// vaut le DOUBLE de L(2d), L_d = 2 (mu0 / 2 pi) 2d ln(2d / W) =
// (mu0 / pi) 2d ln(2d / W) ; deux detours egaux en parallele rendent bien
// L(2d). Les deux detours sont en parallele. En frequence, chacun est un tronçon de fente COURT-CIRCUITE
// au bout : Z = j w L tan(beta d) / (beta d), dans la permittivite moyenne
// des deux faces du plan, avec une perte (Q ~ 50) qui tient lieu de son
// rayonnement. C'est une estimation d'ingenieur -- la fente vraie rayonne --,
// et la fiche la donne pour ce qu'elle est.
// ==========================================================================

// `FENTE_Q` et `_eps_plan` n'existent qu'une fois : crosstalk en avait deja besoin, et `em`
// ne peut pas dependre de cette caisse. Meme valeur, meme lecture que rf_reseau.py.
pub use em::crosstalk::eps_autour_plan as _eps_plan;
pub use em::crosstalk::FENTE_Q;

pub fn z_fente(couches: &[Json], fe: &Json, f: f64) -> Complex64 {
    let w = maxf(&[_nombre(&fe["largeur"], 0.2), 0.01]);
    let beta = 2.0 * PI * f * _eps_plan(couches, ent(&fe["plan"], 0)).sqrt() / tl::C_0;
    let mut zs = Vec::new();
    for d in [nb(&fe["d1"]), nb(&fe["d2"])] {
        let l_d = MU_0 / PI * 2.0 * d * 1e-3 * maxf(&[2.0 * d / w, 1.0]).ln();
        let x = c(beta * d * 1e-3) * Complex64::new(1.0, -0.5 / FENTE_Q);
        zs.push(Complex64::new(0.0, 2.0 * PI * f * l_d) * if x.norm() > 1e-9 { div(x.tan(), x) } else { c(1.0) });
    }
    if zs[0].norm() == 0.0 || zs[1].norm() == 0.0 {
        return c(0.0);
    }
    div(zs[0] * zs[1], zs[0] + zs[1])
}
