// --------------------------------------------------------------------------
// LA PAIRE PAR BRIN : LA CASCADE A QUATRE ACCES (5.1.0)
// --------------------------------------------------------------------------
// LES MODES PAIR ET IMPAIR NE SONT LES MODES PROPRES QUE D'UNE PAIRE
// SYMETRIQUE. Deux largeurs differentes, une masse coplanaire d'un seul
// cote, un via sur un seul brin, un brin plus long que l'autre : le mode
// impair ne reste plus impair en chemin, une part part en mode commun, et la
// cascade des deux modes, chacun de son cote, ne sait pas le dire. La 5.0.x
// moyennait les deux diagonales (`modes_paire`) et ESTIMAIT Scd21 d'apres la
// surlongueur ; le Scd ne se mettait dans aucune autre case.
//
// LA PAIRE EST DONC MISE EN CASCADE BRIN PAR BRIN, quatre acces (1p, 1n, 2p,
// 2n), matrices ABCD 4 x 4 en blocs 2 x 2 [[A, B], [C, D]] sur (p, n) --
// la meme convention que `ibis.abcd_brins` :
//   · un troncon couple : la ligne a DEUX conducteurs de [L] et [C] 2 x 2
//     (la section de la carte de chaleur, `matrices_paire`), decomposee en
//     ses deux modes propres (`_modes_brins`) -- l'un a composantes de signes
//     opposes (« impair »), l'autre de meme signe (« pair ») ;
//         A = Tv ch Tv^-1   B = Tv Zm sh Ti^-1
//         C = Ti sh/Zm Tv^-1   D = Ti ch Ti^-1
//     Tv les tensions modales, Ti = (Tv^T)^-1 les courants ;
//   · un troncon que la partenaire ne longe pas : deux lignes seules, celle
//     de la piste et -- quand la partenaire reste sur UNE autre couche --
//     celle de la partenaire sur sa couche, a sa largeur ;
//   · un via ou un coude : sur les deux brins quand la partenaire a le sien
//     au meme raccord, sur un seul sinon (`_brins_de_la_paire`) ;
//   · la surlongueur : une ligne seule sur le brin LE PLUS LONG -- celui que
//     les longueurs designent, et non plus le brin N d'office --, posee cote
//     recepteur (le dessin ne dit pas ou elle se loge).
// Sdd, Scc, Sdc et Scd sortent des S 4 x 4 (R0 = Z_ref,diff / 2 par brin)
// par la matrice des modes mixtes : Sdd sur Z_ref,diff, Scc sur Z_ref,diff/4,
// comme avant.
//
// LES PERTES, MODE PAR MODE, comme la cascade des deux modes : celles du
// mode impair a l'impedance PAR BRIN du mode impair (Z_d / 2), celles du
// pair a la sienne (2 Z_c), a la largeur moyenne des deux brins. A la limite
// symetrique, les modes propres sont exactement pair et impair et la cascade
// rejoint celle des deux modes.
//
// UNE PAIRE SYMETRIQUE RESTE CE QU'ELLE ETAIT, AU BIT PRES : sans
// dissymetrie (sous SEUIL_DISSYMETRIE sur les diagonales de [L] et [C],
// sous DELTA_L_SYMETRIE_MM de surlongueur, vias et coudes sur les deux
// brins), la sortie est celle de la cascade des deux modes, inchangee. La
// cascade a quatre acces d'une paire symetrique la rejoint a 1e-9 pres
// (banc) : chaque element y est pose par la meme transformation des modes.
// --------------------------------------------------------------------------

use super::base::*;
use ligne_mom as tl;

// Ecart relatif des deux diagonales de [L] ou de [C] au-dessus duquel une
// section est dissymetrique. En dessous, la moyenne des diagonales
// (`modes_paire`) est exacte au carre de l'ecart pres.
pub const SEUIL_DISSYMETRIE: f64 = 1e-3;
// Surlongueur (mm) en dessous de laquelle les deux brins sont egaux.
pub const DELTA_L_SYMETRIE_MM: f64 = 1e-3;
// Deux bouts de piste se raccordent a moins de cela (mm).
pub const TOLERANCE_RACCORD_MM: f64 = 0.01;

/// Une matrice 2 x 2 reelle.
pub type M2 = [[f64; 2]; 2];
/// Une matrice 2 x 2 complexe (ABCD d'un quadripole, S d'un deux-ports).
pub type C2 = tl::Abcd;
/// Une matrice 4 x 4 complexe : ABCD par brin en blocs 2 x 2, ou S a quatre acces.
pub type C4 = [[Complex64; 4]; 4];

const Z: Complex64 = Complex64::new(0.0, 0.0);
const UN: Complex64 = Complex64::new(1.0, 0.0);

pub fn c(x: f64) -> Complex64 {
    Complex64::new(x, 0.0)
}

pub fn mul2r(a: &M2, b: &M2) -> M2 {
    std::array::from_fn(|i| std::array::from_fn(|j| a[i][0] * b[0][j] + a[i][1] * b[1][j]))
}

pub fn t2(a: &M2) -> M2 {
    [[a[0][0], a[1][0]], [a[0][1], a[1][1]]]
}

pub fn inv2r(a: &M2) -> M2 {
    let det = a[0][0] * a[1][1] - a[0][1] * a[1][0];
    [[a[1][1] / det, -a[0][1] / det], [-a[1][0] / det, a[0][0] / det]]
}

pub fn mul2c(a: &C2, b: &C2) -> C2 {
    std::array::from_fn(|i| std::array::from_fn(|j| a[i][0] * b[0][j] + a[i][1] * b[1][j]))
}

pub fn inv2c(a: &C2) -> C2 {
    let det = a[0][0] * a[1][1] - a[0][1] * a[1][0];
    [[a[1][1] / det, -a[0][1] / det], [-a[1][0] / det, a[0][0] / det]]
}

pub fn cplx(a: &M2) -> C2 {
    std::array::from_fn(|i| std::array::from_fn(|j| c(a[i][j])))
}

pub fn mul4(a: &C4, b: &C4) -> C4 {
    std::array::from_fn(|i| std::array::from_fn(|j| (0..4).map(|k| a[i][k] * b[k][j]).sum()))
}

pub fn identite4() -> C4 {
    std::array::from_fn(|i| std::array::from_fn(|j| if i == j { UN } else { Z }))
}

fn bloc(m: &C4, r: usize, col: usize) -> C2 {
    std::array::from_fn(|i| std::array::from_fn(|j| m[2 * r + i][2 * col + j]))
}

fn poser_bloc(m: &mut C4, r: usize, col: usize, b: &C2) {
    for i in 0..2 {
        for j in 0..2 {
            m[2 * r + i][2 * col + j] = b[i][j];
        }
    }
}

/// np.linalg.eigh d'une matrice 2 x 2 symetrique (son triangle bas) : valeurs propres
/// croissantes, vecteurs propres en colonnes.
pub fn eigh2(m: &M2) -> ([f64; 2], M2) {
    let (a, b, d) = (m[0][0], m[1][0], m[1][1]);
    if b == 0.0 {
        return if a <= d { ([a, d], [[1.0, 0.0], [0.0, 1.0]]) } else { ([d, a], [[0.0, 1.0], [1.0, 0.0]]) };
    }
    let theta = 0.5 * (2.0 * b).atan2(a - d);
    let (s, co) = theta.sin_cos();
    // les deux vecteurs (co, s) et (-s, co), et leurs valeurs par le quotient de Rayleigh
    let l1 = a * co * co + 2.0 * b * s * co + d * s * s;
    let l2 = a * s * s - 2.0 * b * s * co + d * co * co;
    if l1 <= l2 { ([l1, l2], [[co, -s], [s, co]]) } else { ([l2, l1], [[-s, co], [co, s]]) }
}

/// La matrice ABCD d'un element pose a l'identique sur les DEUX brins de
/// la paire, vue en mode differentiel ou commun.
///
/// Deux quadripoles identiques et non couples, l'un sur chaque brin. En
/// differentiel, V_d = 2 V et I_d = I (convention de la cascade : Z_diff =
/// 2 Z0) : l'impedance serie double, l'admittance en derivation est
/// divisee par deux -- [A, 2B ; C/2, D]. En commun, V_c = V et I_c = 2 I :
/// [A, B/2 ; 2C, D].
pub fn _abcd_deux_brins(m: &C2, mode: &str) -> C2 {
    if mode == "diff" {
        return [[m[0][0], 2.0 * m[0][1]], [0.5 * m[1][0], m[1][1]]];
    }
    [[m[0][0], 0.5 * m[0][1]], [2.0 * m[1][0], m[1][1]]]
}

/// La matrice 4 x 4 de deux quadripoles 2 x 2 poses chacun sur son brin,
/// sans couplage ; None vaut un fil.
pub fn _par_brin(m_p: Option<&C2>, m_n: Option<&C2>) -> C4 {
    let mut out = [[Z; 4]; 4];
    for (k, mm) in [m_p, m_n].into_iter().enumerate() {
        match mm {
            None => {
                out[k][k] = UN;
                out[2 + k][2 + k] = UN;
            }
            Some(mm) => {
                out[k][k] = mm[0][0];
                out[k][2 + k] = mm[0][1];
                out[2 + k][k] = mm[1][0];
                out[2 + k][2 + k] = mm[1][1];
            }
        }
    }
    out
}

/// (TV, TI) : les brins depuis les modes (d, c) -- V_d = V_p - V_n,
/// I_d = (I_p - I_n)/2, V_c = (V_p + V_n)/2, I_c = I_p + I_n. TI est
/// (TV^T)^-1 : c'est ce qui fait de (d, c) un couple de bases modales.
pub fn _bases_des_modes() -> (M2, M2) {
    ([[0.5, 1.0], [-0.5, 1.0]],
     [[1.0, 0.5], [-1.0, 0.5]])
}

/// La matrice 4 x 4 par brin d'un element SYMETRIQUE donne par ses deux
/// modes (2 x 2, differentiel et commun). La transformation de
/// `ibis.abcd_brins`, a une frequence.
pub fn _brins_des_modes(m_d: &C2, m_c: &C2) -> C4 {
    let (tv, ti) = _bases_des_modes();
    let (tvi, tii) = (inv2r(&tv), inv2r(&ti));
    let mut out = [[Z; 4]; 4];
    for ((r, col), (ga, dr)) in [((0, 0), (&tv, &tvi)), ((0, 1), (&tv, &tii)),
                                 ((1, 0), (&ti, &tvi)), ((1, 1), (&ti, &tii))] {
        let diag = [[m_d[r][col], Z], [Z, m_c[r][col]]];
        poser_bloc(&mut out, r, col, &mul2c(&mul2c(&cplx(ga), &diag), &cplx(dr)));
    }
    out
}

/// Les deux modes propres d'une section a deux conducteurs (`_modes_brins`).
#[derive(Debug, Clone, PartialEq)]
pub struct ModesBrins {
    pub tv: M2,
    pub ti: M2,
    pub tvi: M2,
    pub tii: M2,
    pub zm: [f64; 2],
    pub eps: [f64; 2],
    pub z_brin: [f64; 2],
    /// la largeur moyenne des deux brins, en mm (posee par `_brins_de_la_paire`)
    pub largeur: f64,
}

/// Les deux modes propres d'une section a deux conducteurs, [L] et [C]
/// (H/m, F/m) ranges (p, n) : {tv, ti, tvi, tii, zm, eps, z_brin}, les
/// modes ranges (impair, pair), ou None si la section ne s'y prete pas.
///
/// LA DECOMPOSITION PAR [L]^1/2 : [L]^1/2 [C] [L]^1/2 est symetrique, ses
/// vecteurs propres U sont orthogonaux meme quand les deux vitesses se
/// confondent, et Tv = [L]^1/2 U diagonalise [L][C]. En milieu homogene
/// (triplaque), les deux vitesses sont EGALES et toute base convient a la
/// propagation : on prend alors les vecteurs propres de [L], qui sont
/// impair et pair a la symetrie pres.
///
/// LA NORMALISATION : le mode impair a V_p - V_n = 1, le pair
/// (V_p + V_n)/2 = 1. Pour une paire symetrique, Tv est alors exactement
/// la base (d, c) de `_bases_des_modes`, Zm vaut (Z_diff, Z_commune), et
/// l'impedance PAR BRIN du mode (`z_brin`, celle des pertes) Z_impair et
/// Z_pair.
pub fn _modes_brins(lm_: &M2, cm_: &M2) -> Option<ModesBrins> {
    let (w, q) = eigh2(lm_);
    if !(w[0] > 0.0 && w[1] > 0.0) {
        return None;
    }
    let ls = mul2r(&mul2r(&q, &[[w[0].sqrt(), 0.0], [0.0, w[1].sqrt()]]), &t2(&q));
    let (mu, u) = eigh2(&mul2r(&mul2r(&ls, cm_), &ls));
    if !(mu[0] > 0.0 && mu[1] > 0.0) {
        return None;
    }
    let tv = if (mu[1] - mu[0]).abs() <= 1e-9 * maxf(&mu) { q } else { mul2r(&ls, &u) };
    let prod = [tv[0][0] * tv[1][0], tv[0][1] * tv[1][1]];
    let k_imp = if prod[1] < prod[0] { 1 } else { 0 };
    let k_pair = 1 - k_imp;
    if !(prod[k_imp] < 0.0 && 0.0 < prod[k_pair]) {
        return None;
    }
    let nd = tv[0][k_imp] - tv[1][k_imp];
    let nc = 0.5 * (tv[0][k_pair] + tv[1][k_pair]);
    let tv: M2 = [[tv[0][k_imp] / nd, tv[0][k_pair] / nc], [tv[1][k_imp] / nd, tv[1][k_pair] / nc]];
    let ti = inv2r(&t2(&tv));
    let (tvi, tii) = (inv2r(&tv), t2(&tv));
    let lm = mul2r(&mul2r(&tvi, lm_), &ti);
    let cm = mul2r(&mul2r(&tii, cm_), &tv);
    let (l_mod, c_mod) = ([lm[0][0], lm[1][1]], [cm[0][0], cm[1][1]]);
    if !(l_mod[0] > 0.0 && l_mod[1] > 0.0 && c_mod[0] > 0.0 && c_mod[1] > 0.0) {
        return None;
    }
    let zm = [(l_mod[0] / c_mod[0]).sqrt(), (l_mod[1] / c_mod[1]).sqrt()];
    Some(ModesBrins { tv, ti, tvi, tii, zm,
                      eps: [tl::C_0 * tl::C_0 * l_mod[0] * c_mod[0], tl::C_0 * tl::C_0 * l_mod[1] * c_mod[1]],
                      z_brin: [zm[0] / 2.0, 2.0 * zm[1]], largeur: 0.0 })
}

/// La matrice 4 x 4 d'une ligne a deux conducteurs : modes `md`
/// (`_modes_brins`), constantes de propagation modales `gammas` et
/// impedances modales `zm` a cette frequence, longueur en metres.
pub fn _abcd_ligne_couplee(md: &ModesBrins, gammas: [Complex64; 2], zm: [Complex64; 2], longueur_m: f64) -> C4 {
    let gl = [gammas[0] * longueur_m, gammas[1] * longueur_m];
    let ch = [gl[0].cosh(), gl[1].cosh()];
    let sh = [gl[0].sinh(), gl[1].sinh()];
    let (tv, ti, tvi, tii) = (cplx(&md.tv), cplx(&md.ti), cplx(&md.tvi), cplx(&md.tii));
    let d = |a: Complex64, b: Complex64| [[a, Z], [Z, b]];
    let mut out = [[Z; 4]; 4];
    poser_bloc(&mut out, 0, 0, &mul2c(&mul2c(&tv, &d(ch[0], ch[1])), &tvi));
    poser_bloc(&mut out, 0, 1, &mul2c(&mul2c(&tv, &d(zm[0] * sh[0], zm[1] * sh[1])), &tii));
    poser_bloc(&mut out, 1, 0, &mul2c(&mul2c(&ti, &d(sh[0] / zm[0], sh[1] / zm[1])), &tvi));
    poser_bloc(&mut out, 1, 1, &mul2c(&mul2c(&ti, &d(ch[0], ch[1])), &tii));
    out
}

/// Les S 4 x 4 (acces 1p, 1n, 2p, 2n ; ondes sur R0 a chaque brin)
/// d'une matrice ABCD 4 x 4 -- `ibis.s_depuis_abcd_4`, a une frequence.
pub fn _s_brins(m: &C4, r0: f64) -> C4 {
    let (a, b, cc, d) = (bloc(m, 0, 0), bloc(m, 0, 1), bloc(m, 1, 0), bloc(m, 1, 1));
    let comb = |x: &C2, kx: f64, y: &C2, ky: f64| -> C2 { std::array::from_fn(|i| std::array::from_fn(|j| x[i][j] * kx + y[i][j] * ky)) };
    let p = comb(&a, 0.5, &cc, r0 / 2.0);
    let q = comb(&b, 0.5, &d, r0 / 2.0);
    let r = comb(&a, 0.5, &cc, -r0 / 2.0);
    let u = comb(&b, 0.5, &d, -r0 / 2.0);
    let w = inv2c(&comb(&p, 1.0, &q, 1.0 / r0));
    let neg = |x: &C2| -> C2 { std::array::from_fn(|i| std::array::from_fn(|j| -x[i][j])) };
    let s22 = neg(&mul2c(&w, &comb(&p, 1.0, &q, -1.0 / r0)));
    let rpu = comb(&r, 1.0, &u, 1.0 / r0);
    let mut s = [[Z; 4]; 4];
    poser_bloc(&mut s, 0, 0, &mul2c(&rpu, &w));
    poser_bloc(&mut s, 0, 1, &comb(&comb(&r, 1.0, &u, -1.0 / r0), 1.0, &mul2c(&rpu, &s22), 1.0));
    poser_bloc(&mut s, 1, 0, &w);
    poser_bloc(&mut s, 1, 1, &s22);
    s
}

/// (Sdd, Sdc, Scd, Scc) 2 x 2 des S 4 x 4 par brin : la matrice des
/// modes mixtes, d = (p - n)/racine 2, c = (p + n)/racine 2, a chaque
/// acces. Sdd est rapporte a 2 R0, Scc a R0 / 2.
pub fn _modes_mixtes(s4: &C4) -> (C2, C2, C2, C2) {
    let k = 1.0 / 2.0f64.sqrt();
    let mm: [[f64; 4]; 4] = [[k, -k, 0.0, 0.0], [0.0, 0.0, k, -k],
                             [k, k, 0.0, 0.0], [0.0, 0.0, k, k]];
    let mmc: C4 = std::array::from_fn(|i| std::array::from_fn(|j| c(mm[i][j])));
    let mmt: C4 = std::array::from_fn(|i| std::array::from_fn(|j| c(mm[j][i])));
    let smm = mul4(&mul4(&mmc, s4), &mmt);
    (bloc(&smm, 0, 0), bloc(&smm, 0, 1), bloc(&smm, 1, 0), bloc(&smm, 1, 1))
}
