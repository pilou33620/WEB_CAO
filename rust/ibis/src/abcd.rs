//! Les cascades ABCD des boitiers, les parametres S et leur passage en temporel : ce que
//! ibis.py faisait avec numpy.

use std::f64::consts::PI;
use std::ops::{Div, Mul, Sub};

use rustfft::num_traits::{One, Zero};
use rustfft::FftPlanner;

pub use rustfft::num_complex::Complex64;

use crate::lecture::{mutuelle, Boitier, Couple, Mutuelle, Section, C, L, R};
use crate::py::{int, max};
use crate::ErreurIbis;

/// Une matrice ABCD d'un tableau numpy (N, 2, 2).
pub type M2 = [[Complex64; 2]; 2];
/// Une matrice par brin d'un tableau numpy (N, 4, 4) : blocs [[A, B], [C, D]] sur (p, n).
pub type M4 = [[Complex64; 4]; 4];
/// Une matrice carree de taille libre (le boitier couple : 2m x 2m).
pub type Mat = Vec<Vec<Complex64>>;

const ZERO: Complex64 = Complex64::new(0.0, 0.0);
const UN: Complex64 = Complex64::new(1.0, 0.0);
const UN2: M2 = [[UN, ZERO], [ZERO, UN]];

fn re(x: f64) -> Complex64 {
    Complex64::new(x, 0.0)
}

fn mul<const N: usize>(a: &[[Complex64; N]; N], b: &[[Complex64; N]; N]) -> [[Complex64; N]; N] {
    let mut m = [[ZERO; N]; N];
    for i in 0..N {
        for j in 0..N {
            for k in 0..N {
                m[i][j] += a[i][k] * b[k][j];
            }
        }
    }
    m
}

fn linalg() -> ErreurIbis {
    ErreurIbis::plantage("LinAlgError", "Singular matrix")
}

/// np.linalg.solve(a, b), b en colonnes : l'elimination de LAPACK (pivot partiel par ligne, le
/// premier des plus grands ; multiplicateurs par l'inverse du pivot). None : matrice singuliere.
pub(crate) fn resoudre<T>(mut a: Vec<Vec<T>>, mut b: Vec<Vec<T>>, module: impl Fn(T) -> f64) -> Option<Vec<Vec<T>>>
where
    T: Copy + Zero + One + Sub<Output = T> + Mul<Output = T> + Div<Output = T>,
{
    let n = a.len();
    for k in 0..n {
        let mut p = k;
        for i in k + 1..n {
            if module(a[i][k]) > module(a[p][k]) {
                p = i;
            }
        }
        if module(a[p][k]) == 0.0 {
            return None;
        }
        a.swap(k, p);
        b.swap(k, p);
        let inverse = T::one() / a[k][k];
        for i in k + 1..n {
            let l = a[i][k] * inverse;
            for j in k + 1..n {
                a[i][j] = a[i][j] - l * a[k][j];
            }
            for j in 0..b[i].len() {
                b[i][j] = b[i][j] - l * b[k][j];
            }
        }
    }
    for i in (0..n).rev() {
        for j in 0..b[i].len() {
            let mut x = b[i][j];
            for k in i + 1..n {
                x = x - a[i][k] * b[k][j];
            }
            b[i][j] = x / a[i][i];
        }
    }
    Some(b)
}

// le choix du pivot de LAPACK pour un complexe : |re| + |im|
fn cabs1(z: Complex64) -> f64 {
    z.re.abs() + z.im.abs()
}

fn identite(n: usize) -> Mat {
    (0..n).map(|i| (0..n).map(|j| if i == j { UN } else { ZERO }).collect()).collect()
}

fn inverse(a: &Mat) -> Result<Mat, ErreurIbis> {
    resoudre(a.clone(), identite(a.len()), cabs1).ok_or_else(linalg)
}

fn produit(a: &Mat, b: &Mat) -> Mat {
    let colonnes = b.first().map_or(0, Vec::len);
    a.iter()
        .map(|ligne| (0..colonnes).map(|j| ligne.iter().zip(b).fold(ZERO, |s, (x, lb)| s + *x * lb[j])).collect())
        .collect()
}

fn combiner(a: &Mat, b: &Mat, f: impl Fn(Complex64, Complex64) -> Complex64) -> Mat {
    a.iter().zip(b).map(|(la, lb)| la.iter().zip(lb).map(|(x, y)| f(*x, *y)).collect()).collect()
}

fn bloc(m: &Mat, lignes: &[usize], colonnes: &[usize]) -> Mat {
    lignes.iter().map(|i| colonnes.iter().map(|j| m[*i][*j]).collect()).collect()
}

/// np.sum d'un tableau de flottants : la somme par paires de numpy (blocs de 8, moities au-dela
/// de 128), qui ne rend pas le dernier chiffre d'une addition de gauche a droite.
pub(crate) fn somme(a: &[f64]) -> f64 {
    let n = a.len();
    if n < 8 {
        // numpy part de -0.0, pour que la somme de zeros negatifs le reste ; d'un tableau vide, 0.0
        return if n == 0 { 0.0 } else { a.iter().fold(-0.0, |s, x| s + x) };
    }
    if n <= 128 {
        let mut r = [0.0; 8];
        r.copy_from_slice(&a[..8]);
        let mut i = 8;
        while i < n - n % 8 {
            for j in 0..8 {
                r[j] += a[i + j];
            }
            i += 8;
        }
        let mut res = ((r[0] + r[1]) + (r[2] + r[3])) + ((r[4] + r[5]) + (r[6] + r[7]));
        for x in &a[i..] {
            res += x;
        }
        return res;
    }
    let mut n2 = n / 2;
    n2 -= n2 % 8;
    somme(&a[..n2]) + somme(&a[n2..])
}

/// sinh(x) / x, 1 en zero.
fn sinhc(x: Complex64) -> Complex64 {
    if x.norm() < 1e-6 {
        UN + x * x / 6.0
    } else {
        x.sinh() / x
    }
}

/// La matrice ABCD (N, 2, 2) d'une suite de sections donnee dans l'ordre
/// du fichier (du die vers la broche, 1.5.0 -- avant, lue a l'envers),
/// rendue DE LA BROCHE VERS LE DIE.
///
/// Ordre de la norme d'apres sources secondaires : l'exemple de [Pin
/// Numbers] repris au sommet IBIS de novembre 2014 (KEI Systems, fil de
/// cablage en premier) et la presentation ICM d'Intel (le modele part du
/// die). Confirme le 22/10/2026 dans le texte de la norme : IBIS 8.0,
/// p. 184, une description de boitier commence cote puce.
pub fn abcd_sections(freqs: &[f64], sections: &[Section]) -> Vec<M2> {
    let renverse: Vec<&Section> = sections.iter().rev().collect();
    cascade(freqs, &renverse)
}

/// La cascade des sections dans l'ordre donne, du premier acces au
/// second.
///
/// · Len > 0 : une LIGNE, R, L, G, C par unite de longueur ; avec
///   zl = (R + jwL) Len et yl = (G + jwC) Len, theta = racine(zl yl) :
///   A = D = ch theta, B = zl sh(theta)/theta, C = yl sh(theta)/theta --
///   ce qui reste juste quand C ou L est nul (serie ou derivation pure) ;
/// · Len = 0 : LOCALISEE, valeurs totales : C (et G) a la broche, puis R
///   et L en serie -- la topologie de [Package], a laquelle une section
///   unique revient exactement ;
/// · une derivation (Fork ... Endfork) : la branche, ouverte au bout, posee
///   en derivation, Y = C_b / A_b.
fn cascade(freqs: &[f64], sections: &[&Section]) -> Vec<M2> {
    let w: Vec<f64> = freqs.iter().map(|f| 2.0 * PI * f).collect();
    let mut m = vec![UN2; w.len()];
    for s in sections {
        let e: Vec<M2> = match s {
            Section::Fourche(f) => {
                // du depart de la branche a son bout ouvert
                let mb = cascade(freqs, &f.iter().collect::<Vec<_>>());
                mb.iter()
                    .map(|b| {
                        let a = if b[0][0].norm() > 1e-300 { b[0][0] } else { re(1e-300) };
                        [[UN, ZERO], [b[1][0] / a, UN]]
                    })
                    .collect()
            }
            Section::Ligne { len, r, l, c, g } => w
                .iter()
                .map(|w| {
                    let z = Complex64::new(*r, w * l);
                    let y = Complex64::new(*g, w * c);
                    if *len > 0.0 {
                        let (zl, yl) = (z * *len, y * *len);
                        let th = (zl * yl).sqrt();
                        let sc = sinhc(th);
                        [[th.cosh(), zl * sc], [yl * sc, th.cosh()]]
                    } else {
                        [[UN, z], [y, UN + y * z]]
                    }
                })
                .collect(),
        };
        for (a, b) in m.iter_mut().zip(&e) {
            *a = mul(a, b);
        }
    }
    m
}

/// La matrice N x N d'une grandeur (r, l, c) des conducteurs couples.
fn matrice_boitier(cpl: &Couple, lettre: usize) -> Vec<Vec<f64>> {
    let cond = &cpl.conducteurs;
    let n = cond.len();
    let mut m = vec![vec![0.0; n]; n];
    for a in 0..n {
        m[a][a] = cpl.diag[lettre].get(&cond[a]).copied().unwrap_or(0.0);
        for b in 0..n {
            if a == b {
                continue;
            }
            if let Some(v) = mutuelle(&cpl.mutuelles[lettre], &cond[a], &cond[b]).filter(|v| *v != 0.0) {
                // Maxwell : la capacite de couplage est hors diagonale, en
                // negatif ; des fichiers l'ecrivent positive
                m[a][b] = if lettre == C { -v.abs() } else { v };
            }
        }
    }
    m
}

/// L'ABCD (N, 2m, 2m) -- blocs [[A, B], [C, D]] sur les m broches de la
/// liaison -- de leur boitier couple a ses voisines au repos, celles-ci
/// fermees et eliminees (voir l'en-tete). Meme topologie et meme `sens` que
/// `abcd_boitier` ; m = 2 rend le boitier de la paire par brin (p, n).
/// (`r_voisin` : 50 ohms dans ibis.py quand il n'est pas donne.)
pub fn abcd_boitier_couple(freqs: &[f64], cpl: &Couple, sens: &str, r_voisin: f64) -> Result<Vec<Mat>, ErreurIbis> {
    let (rm, mut lm, cm) = (matrice_boitier(cpl, R), matrice_boitier(cpl, L), matrice_boitier(cpl, C));
    let n = cpl.conducteurs.len();
    // une broche sans self dans le fichier : un plancher, pour que la
    // matrice serie s'inverse
    for a in 0..n {
        lm[a][a] = max(lm[a][a], 1e-13);
    }
    let m_ = cpl.victimes;
    let mut y_t = vec![0.0; n];
    for k in m_..n {
        y_t[k] = match cpl.genres.get(&cpl.conducteurs[k]).map_or("signal", |g| g.as_str()) {
            "court" => 1e6,
            "ouvert" => 0.0,
            _ => 1.0 / max(r_voisin, 1e-6),
        };
    }
    let v_idx: Vec<usize> = (0..m_).chain(n..n + m_).collect();
    let x_idx: Vec<usize> = (m_..n).chain(n + m_..2 * n).collect();
    let (haut, bas): (Vec<usize>, Vec<usize>) = ((0..n).collect(), (n..2 * n).collect());
    let (v1, v2): (Vec<usize>, Vec<usize>) = ((0..m_).collect(), (m_..2 * m_).collect());
    let mut out = Vec::with_capacity(freqs.len());
    for f in freqs {
        let wq = max(2.0 * PI * f, 2.0 * PI * 1.0);
        let mut serie = identite(2 * n);
        let mut derive = identite(2 * n);
        for i in 0..n {
            for j in 0..n {
                serie[i][n + j] = Complex64::new(rm[i][j], wq * lm[i][j]);
                derive[n + i][j] = Complex64::new(0.0, wq * cm[i][j]);
            }
        }
        let m = if sens == "emission" { produit(&serie, &derive) } else { produit(&derive, &serie) };
        let (a, b, c, d) = (bloc(&m, &haut, &haut), bloc(&m, &haut, &bas), bloc(&m, &bas, &haut), bloc(&m, &bas, &bas));
        let bi = inverse(&b)?;
        // les admittances, courants entrants aux deux bouts
        let dbi = produit(&d, &bi);
        let (y12, y22) = (combiner(&c, &produit(&dbi, &a), |x, y| x - y), produit(&bi, &a));
        let mut yy = vec![vec![ZERO; 2 * n]; 2 * n];
        for i in 0..n {
            for j in 0..n {
                yy[i][j] = dbi[i][j];
                yy[i][n + j] = y12[i][j];
                yy[n + i][j] = -bi[i][j];
                yy[n + i][n + j] = y22[i][j];
            }
        }
        for k in m_..n {
            yy[k][k] += y_t[k];
            yy[n + k][n + k] += y_t[k];
        }
        let (yvv, yvx) = (bloc(&yy, &v_idx, &v_idx), bloc(&yy, &v_idx, &x_idx));
        let (yxv, yxx) = (bloc(&yy, &x_idx, &v_idx), bloc(&yy, &x_idx, &x_idx));
        let yr = combiner(&yvv, &produit(&yvx, &resoudre(yxx, yxv, cabs1).ok_or_else(linalg)?), |x, y| x - y);
        let (y11, y12) = (bloc(&yr, &v1, &v1), bloc(&yr, &v1, &v2));
        let (y21, y22) = (bloc(&yr, &v2, &v1), bloc(&yr, &v2, &v2));
        let bb: Mat = inverse(&y21)?.iter().map(|l| l.iter().map(|x| -x).collect()).collect();
        let aa = produit(&bb, &y22);
        let cc = combiner(&produit(&y11, &aa), &y12, |x, y| x + y);
        let dd = produit(&y11, &bb);
        let mut o = vec![vec![ZERO; 2 * m_]; 2 * m_];
        for i in 0..m_ {
            for j in 0..m_ {
                o[i][j] = aa[i][j];
                o[i][m_ + j] = bb[i][j];
                o[m_ + i][j] = cc[i][j];
                o[m_ + i][m_ + j] = dd[i][j];
            }
        }
        out.push(o);
    }
    Ok(out)
}

/// Un tableau (N, 2, 2) de taille libre en `M2` (une broche : m = 1).
pub fn en_m2(m: &[Mat]) -> Vec<M2> {
    m.iter().map(|x| [[x[0][0], x[0][1]], [x[1][0], x[1][1]]]).collect()
}

/// Un tableau (N, 4, 4) de taille libre en `M4` (une paire : m = 2).
pub fn en_m4(m: &[Mat]) -> Vec<M4> {
    m.iter().map(|x| std::array::from_fn(|i| std::array::from_fn(|j| x[i][j]))).collect()
}

/// Le mode impair (N, 2, 2) d'un boitier couple par brin (N, 4, 4) :
/// V_d = V_p - V_n, I_d = (I_p - I_n) / 2, la moyenne des deux brins quand
/// les voisines les traitent differemment.
pub fn mode_impair_couple(m4: &[M4]) -> Vec<M2> {
    m4.iter()
        .map(|m| {
            let mut out = [[ZERO; 2]; 2];
            for (r, c, k) in [(0, 0, 0.5), (0, 1, 1.0), (1, 0, 0.25), (1, 1, 0.5)] {
                let bl = |i: usize, j: usize| m[2 * r + i][2 * c + j];
                out[r][c] = (bl(0, 0) - bl(0, 1) - bl(1, 0) + bl(1, 1)) * k;
            }
            out
        })
        .collect()
}

/// La matrice ABCD (N, 4, 4) par brin -- blocs [[A, B], [C, D]] sur
/// (p, n) -- des boitiers des deux broches d'une paire, COUPLES par leurs
/// mutuelles `mut_` (`mutuelle_paire`) : impedance serie
/// [[R_p + jwL_p, R_m + jwL_m], [R_m + jwL_m, R_n + jwL_n]], admittance a la
/// broche jw [[C_p, -C_m], [-C_m, C_n]]. Meme topologie et meme `sens`
/// que `abcd_boitier` ; sans mutuelle, c'est elle, brin par brin.
pub fn abcd_boitier_paire(
    freqs: &[f64], bt_p: Option<&Boitier>, bt_n: Option<&Boitier>, mut_: Option<&Mutuelle>, sens: &str,
) -> Vec<M4> {
    let rlc = |b: Option<&Boitier>| b.map_or((0.0, 0.0, 0.0), |b| (b.r, b.l, b.c));
    let (p, q) = (rlc(bt_p), rlc(bt_n));
    let mu = mut_.map_or((0.0, 0.0, 0.0), |m| (m.r, m.l, m.c));
    freqs
        .iter()
        .map(|f| {
            let w = 2.0 * PI * f;
            let zm = Complex64::new(mu.0, w * mu.1);
            let z = [[Complex64::new(p.0, w * p.1), zm], [zm, Complex64::new(q.0, w * q.1)]];
            let ym = Complex64::new(0.0, -(w * mu.2));
            let y = [[Complex64::new(0.0, w * p.2), ym], [ym, Complex64::new(0.0, w * q.2)]];
            let mut serie = [[ZERO; 4]; 4];
            let mut derive = [[ZERO; 4]; 4];
            for i in 0..4 {
                serie[i][i] = UN;
                derive[i][i] = UN;
            }
            for i in 0..2 {
                for j in 0..2 {
                    serie[i][2 + j] = z[i][j];
                    derive[2 + i][j] = y[i][j];
                }
            }
            if sens == "emission" {
                mul(&serie, &derive)
            } else {
                mul(&derive, &serie)
            }
        })
        .collect()
}

/// La matrice ABCD (N, 2, 2) d'un boitier, ou None s'il est nul.
///
/// `sens` « emission » : du die vers la broche -- R et L en serie, puis
/// C_pkg ; « reception » : de la broche vers le die -- C_pkg, puis R et L.
/// Un boitier PAR SECTIONS (1.2.0) est leur cascade (`abcd_sections`), de
/// la broche vers le die (fichier lu du die vers la broche) ; vue du die, la meme retournee -- un reseau
/// reciproque se retourne en echangeant A et D.
pub fn abcd_boitier(freqs: &[f64], bt: Option<&Boitier>, sens: &str) -> Option<Vec<M2>> {
    let bt = bt.filter(|b| !crate::lecture::boitier_nul(Some(b)))?;
    if let Some(sections) = bt.sections.as_ref().filter(|s| !s.is_empty()) {
        let mut m = abcd_sections(freqs, sections);
        if sens == "emission" {
            for x in &mut m {
                *x = [[x[1][1], x[0][1]], [x[1][0], x[0][0]]];
            }
        }
        return Some(m);
    }
    Some(
        freqs
            .iter()
            .map(|f| {
                let w = 2.0 * PI * f;
                let z = Complex64::new(bt.r, w * bt.l);
                let y = Complex64::new(0.0, w * bt.c);
                if sens == "emission" {
                    // [1 Z ; 0 1] @ [1 0 ; Y 1]
                    [[UN + z * y, z], [y, UN]]
                } else {
                    // [1 0 ; Y 1] @ [1 Z ; 0 1]
                    [[UN, z], [y, UN + y * z]]
                }
            })
            .collect(),
    )
}

// ==========================================================================
// La liaison dans le temps : tampon -- canal -- recepteur
// --------------------------------------------------------------------------
// LE CANAL EST LINEAIRE, LES DEUX BOUTS NE LE SONT PAS. On ecrit le canal en
// ondes de puissance sur une resistance de reference R0 : a1, a2 entrent,
// b1, b2 sortent, et
//     b = s * a       (produit de convolution, terme a terme)
// avec s(t) la reponse impulsionnelle des parametres S du canal -- la
// cascade ABCD de `simulation_em`, charge lineaire du recepteur comprise.
// A chaque pas, l'histoire (tout sauf l'echantillon courant) est connue :
//     b1 = s11[0] a1 + s12[0] a2 + h1      b2 = s21[0] a1 + s22[0] a2 + h2
// et il reste DEUX equations a deux inconnues (a1, a2), celles des bouts :
//     (a1 - b1)/R0 = - I_tampon(V1, t)     V1 = a1 + b1
//     (a2 - b2)/R0 = - I_diodes(V2)        V2 = a2 + b2
// qu'un Newton resout en deux ou trois iterations. C'est la methode des
// simulateurs de liaison qui melangent IBIS et parametres S, et elle est
// exacte au pas de temps pres -- la capacite C_comp est integree en Euler
// implicite.
//
// LE PASSAGE EN TEMPOREL DEMANDE UNE BANDE BORNEE. Un parametre S ne
// s'eteint pas en frequence (un echo garde son amplitude), et l'IFFT d'une
// grille coupee net sonnerait. On le multiplie donc par une fenetre
// gaussienne, nulle (5e-4) au haut de la grille, qui revient a lisser chaque
// trajet par un front gaussien -- mais PAS la reflexion instantanee de
// l'entree (R0 contre l'impedance haute frequence du canal), retiree avant la
// fenetre et remise a part : lissee, elle serait non causale, et la boucle
// tampon-canal ne la verrait plus au bon instant. Le lissage se rend dans le
// resultat ; le haut de la grille est pris pour qu'il reste sous la moitie du
// front du tampon (`oeil.LISSAGE_SUR_FRONT`).
// ==========================================================================

/// Les quatre S (N,) d'une cascade ABCD (N, 2, 2) sur R0 aux deux ports : [s11, s12, s21, s22].
pub fn s_depuis_abcd(abcd: &[M2], r0: f64) -> [Vec<Complex64>; 4] {
    let mut s: [Vec<Complex64>; 4] = Default::default();
    for m in abcd {
        let (a, b, c, d) = (m[0][0], m[0][1], m[1][0], m[1][1]);
        let den = a + b / r0 + c * r0 + d;
        s[0].push((a + b / r0 - c * r0 - d) / den);
        s[1].push((a * d - b * c) * 2.0 / den);
        s[2].push(re(2.0) / den);
        s[3].push((-a + b / r0 - c * r0 + d) / den);
    }
    s
}

/// np.fft.irfft(x, n) : n pair, x de n / 2 + 1 termes.
fn irfft(x: &[Complex64], n: usize) -> Vec<f64> {
    let mut tampon = vec![ZERO; n];
    for (k, v) in x.iter().enumerate() {
        tampon[k] = *v;
        if k > 0 && k < n - k {
            tampon[n - k] = v.conj();
        }
    }
    FftPlanner::<f64>::new().plan_fft_inverse(n).process(&mut tampon);
    tampon.iter().map(|z| z.re / n as f64).collect()
}

// Au-dela, Python lui-meme manquait de memoire (MemoryError) : on refuse au lieu d'allouer.
pub(crate) const MAX_ECHANTILLONS: f64 = 4e8;

/// int(math.ceil(x)) : un NaN (ValueError) et un infini (OverflowError) plantaient.
pub(crate) fn plafond(x: f64) -> Result<i64, ErreurIbis> {
    if x.is_nan() {
        return Err(ErreurIbis::plantage("ValueError", "cannot convert float NaN to integer"));
    }
    int(x.ceil()).ok_or_else(|| ErreurIbis::plantage("OverflowError", "cannot convert float infinity to integer"))
}

/// Les reponses impulsionnelles (L,) des S, au pas dt.
///
/// `s_f` : S sur la grille `freqs` (reguliere, partant de df) ; `s_dc` :
/// leur valeur au continu ; `tr_lissage` : le front gaussien equivalent a
/// la fenetre (10-90 %). Rend (rep, partie instantanee). (`_fenetre` : l'argument que
/// ibis.py recevait sans le lire.)
pub fn reponses_impulsionnelles(
    freqs: &[f64], s_f: &[Complex64], s_dc: f64, dt: f64, _fenetre: Option<f64>, tr_lissage: f64,
) -> Result<(Vec<f64>, f64), ErreurIbis> {
    if freqs.len() < 2 {
        return Err(ErreurIbis::plantage("IndexError", "index 1 is out of bounds"));
    }
    let df = freqs[1] - freqs[0];
    let n = (1.0 / (df * dt)).round_ties_even();
    if n.is_nan() || n.is_infinite() {
        return Err(ErreurIbis::plantage(if n.is_nan() { "ValueError" } else { "OverflowError" }, "grille de frequences"));
    }
    if n > MAX_ECHANTILLONS {
        return Err(ErreurIbis::plantage("MemoryError", "grille de frequences trop fine"));
    }
    let mut n_fft = n as i64;
    n_fft += n_fft.rem_euclid(2);
    if n_fft < 1 {
        return Err(ErreurIbis::plantage("ValueError", format!("Invalid number of FFT data points ({n_fft}) specified.")));
    }
    let n_fft = n_fft as usize;
    let nb = n_fft / 2 + 1;
    let sigma = tr_lissage / 2.5631;
    let m = freqs.len().min(nb - 1);
    let fen: Vec<f64> = freqs[..m].iter().map(|f| (-2.0 * (PI * sigma * f).powi(2)).exp()).collect();
    if s_f.len() < m {
        return Err(ErreurIbis::plantage("ValueError", "could not broadcast input array"));
    }
    let mut x = vec![ZERO; nb];
    x[0] = re(s_dc);
    for k in 0..m {
        x[k + 1] = s_f[k] * fen[k];
    }
    let h = irfft(&x, n_fft);
    // LE NOYAU DU LISSAGE, au meme pas et par le meme chemin : une gaussienne
    // centree sur t = 0, dont la moitie gauche est repliee en fin de tableau.
    let mut xg = vec![ZERO; nb];
    xg[0] = UN;
    for k in 0..m {
        xg[k + 1] = re(fen[k]);
    }
    let g = irfft(&xg, n_fft);
    // LA PART INSTANTANEE se lit a ce qui deborde AVANT t = 0 : un trajet
    // retarde n'y laisse rien, une reflexion immediate y laisse la moitie de
    // sa gaussienne. Sa moyenne sur le haut de la grille la donnerait mal --
    // un echo retarde y tourne en phase et n'y fait pas zero.
    let k = plafond(6.0 * sigma / dt)?.saturating_add(1).min((n_fft / 4) as i64);
    // h[n_fft - k:] ; un k negatif (lissage negatif) part au-dela de la fin : tranche vide
    let depart = if k >= 0 { n_fft - k as usize } else { n_fft };
    let (sh, sg) = (somme(&h[depart..]), somme(&g[depart..]));
    let num = h[0] + 2.0 * sh;
    let den = g[0] + 2.0 * sg;
    let inst = if den.abs() > 1e-12 { num / den } else { 0.0 };
    // Elle est remise en Dirac, au pas zero, a la place de sa gaussienne ;
    // le reste de la partie non causale tombe.
    // LE DEBORD QUI N'EST PAS LE DIRAC. Une reponse rapide qui demarre a
    // t = 0 (la capacite d'entree contre R0) deborde elle aussi un peu avant
    // zero, et ce debord tombait avec le reste : le niveau etabli derivait
    // alors de quelques pour cent. Il revient au pas zero -- la ou se trouve,
    // a la resolution du lissage, ce qui l'a produit. Un trajet retarde n'en
    // laisse pas : sa correction est nulle.
    let debord = sh - inst * sg;
    let mut h: Vec<f64> = (0..n_fft / 2).map(|i| h[i] - inst * g[i]).collect();
    h[0] += inst + debord;
    Ok((h, inst))
}

/// La longueur au-dela de laquelle les quatre reponses sont negligeables
/// (`seuil` : 1e-7 dans ibis.py quand il n'est pas donne).
pub fn tronquer<H: AsRef<[f64]>>(reps: &[H], seuil: f64) -> usize {
    let mut l_max = 1;
    for h in reps {
        let a = h.as_ref();
        if a.is_empty() {
            continue;
        }
        let mut cum = vec![0.0; a.len()];
        let mut s = 0.0;
        for i in (0..a.len()).rev() {
            s += a[i].abs();
            cum[i] = s;
        }
        let tot = if cum[0] > 0.0 { cum[0] } else { 1.0 };
        let k = cum.iter().position(|c| *c < seuil * tot).unwrap_or(a.len());
        l_max = l_max.max(k);
    }
    l_max
}

// ==========================================================================
// La paire : deux tampons, deux brins couples, deux recepteurs
// --------------------------------------------------------------------------
// POURQUOI DEUX BRINS. Le demi-circuit du mode impair suppose deux tampons
// parfaitement opposes : ce que l'un monte, l'autre le descend au meme
// instant et de la meme facon, et le mode commun ne bouge pas. Un vrai
// couple de tampons CMOS ne l'est pas -- montee et descente differentes,
// un brin en retard sur l'autre (tdelay de [Diff Pin]), deux coins, deux
// boitiers -- et ce qui n'est pas oppose part en MODE COMMUN : le bruit que
// le recepteur differentiel rejette (a peu pres), mais que la paire rayonne
// et que les diodes voient.
//
// LE CANAL, PAR BRIN. La paire symetrique de `simulation_em` est donnee par
// ses deux modes, sans couplage entre eux : la cascade du mode impair
// (V_d = V_p - V_n, I_d = (I_p - I_n)/2) et celle du mode commun
// (V_c = (V_p + V_n)/2, I_c = I_p + I_n). On les remet par brin -- quatre
// acces, p et n de chaque cote, ondes de tension sur R0 par brin --, et ce
// qui est propre a UN brin s'y pose tel quel : boitier de chaque broche,
// capacite d'entree de chaque recepteur, surlongueur d'un brin. La
// terminaison du recepteur est une resistance differentielle et, au
// besoin, une impedance de mode commun (prise mediane).
//
// LE PAS DE TEMPS, comme pour la ligne seule (`Liaison`), mais quatre ondes
// entrantes et un Newton 4x4 : b = S0 a + h, (a - b)/R0 = - I(V) a chaque
// acces. L'histoire est un seul produit matrice-vecteur par pas.
// ==========================================================================

fn mul2(a: &M2, b: &M2) -> M2 {
    mul(a, b)
}

fn reel2(m: [[f64; 2]; 2]) -> M2 {
    m.map(|l| l.map(re))
}

/// (N, 4, 4) ABCD par brin -- blocs 2x2 [[A, B], [C, D]] sur (p, n) --
/// d'une paire symetrique donnee par ses deux modes (N, 2, 2).
///
/// Les deux bases : V_brins = TV V_modes, I_brins = TI I_modes, les modes
/// dans l'ordre (d, c) ; A_brins = TV A_modes TV^-1, B = TV B TI^-1,
/// C = TI C TV^-1, D = TI D TI^-1.
pub fn abcd_brins(abcd_dd: &[M2], abcd_cc: &[M2]) -> Vec<M4> {
    let tv = reel2([[0.5, 1.0], [-0.5, 1.0]]);
    let ti = reel2([[1.0, 0.5], [-1.0, 0.5]]);
    // leurs inverses, exactes (determinant 1)
    let tvi = reel2([[1.0, -1.0], [0.5, 0.5]]);
    let tii = reel2([[0.5, -0.5], [1.0, 1.0]]);
    abcd_dd
        .iter()
        .zip(abcd_cc)
        .map(|(dd, cc)| {
            let mut m = [[ZERO; 4]; 4];
            for ((r, c), (ga, dr)) in [((0, 0), (tv, tvi)), ((0, 1), (tv, tii)), ((1, 0), (ti, tvi)), ((1, 1), (ti, tii))] {
                let b = mul2(&mul2(&ga, &[[dd[r][c], ZERO], [ZERO, cc[r][c]]]), &dr);
                for i in 0..2 {
                    for j in 0..2 {
                        m[2 * r + i][2 * c + j] = b[i][j];
                    }
                }
            }
            m
        })
        .collect()
}

/// (N, 4, 4) de deux 2-ports (N, 2, 2) poses chacun sur son brin, sans
/// couplage ; None vaut un fil.
pub fn abcd_par_brin(m_p: Option<&[M2]>, m_n: Option<&[M2]>, n: usize) -> Vec<M4> {
    (0..n)
        .map(|q| {
            let mut out = [[ZERO; 4]; 4];
            for (k, mm) in [m_p, m_n].into_iter().enumerate() {
                let mm = mm.map_or(UN2, |m| m[q]);
                for r in 0..2 {
                    for c in 0..2 {
                        out[2 * r + k][2 * c + k] = mm[r][c];
                    }
                }
            }
            out
        })
        .collect()
}

fn quart(m: &M4, r: usize, c: usize) -> M2 {
    std::array::from_fn(|i| std::array::from_fn(|j| m[2 * r + i][2 * c + j]))
}

fn sur2(a: &M2, b: &M2, f: impl Fn(Complex64, Complex64) -> Complex64) -> M2 {
    std::array::from_fn(|i| std::array::from_fn(|j| f(a[i][j], b[i][j])))
}

/// La charge (N, 2, 2) en admittance, posee au bout de la cascade
/// (N, 4, 4) : A' = A + B Y, C' = C + D Y.
pub fn charger_brins(m: &[M4], y_l: &[M2]) -> Vec<M4> {
    m.iter()
        .zip(y_l)
        .map(|(m, y)| {
            let mut out = *m;
            for r in 0..2 {
                let b = sur2(&quart(m, r, 0), &mul2(&quart(m, r, 1), y), |x, y| x + y);
                for i in 0..2 {
                    for j in 0..2 {
                        out[2 * r + i][j] = b[i][j];
                    }
                }
            }
            out
        })
        .collect()
}

/// (N, 4, 4) S, ondes de tension sur R0 a chaque brin, d'une cascade
/// (N, 4, 4) ; acces dans l'ordre (1p, 1n, 2p, 2n). C'est la formule du
/// deux-ports, ecrite en blocs : a1 = P V2 + Q I2, b1 = R V2 + U I2.
pub fn s_depuis_abcd_4(m: &[M4], r0: f64) -> Result<Vec<M4>, ErreurIbis> {
    m.iter()
        .map(|m| {
            let (a, b, c, d) = (quart(m, 0, 0), quart(m, 0, 1), quart(m, 1, 0), quart(m, 1, 1));
            let p = sur2(&a, &c, |x, y| (x + y * r0) / 2.0);
            let q = sur2(&b, &d, |x, y| (x + y * r0) / 2.0);
            let r = sur2(&a, &c, |x, y| (x - y * r0) / 2.0);
            let u = sur2(&b, &d, |x, y| (x - y * r0) / 2.0);
            let pq = sur2(&p, &q, |x, y| x + y / r0);
            let w = resoudre(pq.iter().map(|l| l.to_vec()).collect(), identite(2), cabs1).ok_or_else(linalg)?;
            let s21: M2 = [[w[0][0], w[0][1]], [w[1][0], w[1][1]]];
            let s22 = mul2(&s21.map(|l| l.map(|x| -x)), &sur2(&p, &q, |x, y| x - y / r0));
            let ru = sur2(&r, &u, |x, y| x + y / r0);
            let s11 = mul2(&ru, &s21);
            let s12 = sur2(&sur2(&r, &u, |x, y| x - y / r0), &mul2(&ru, &s22), |x, y| x + y);
            let mut s = [[ZERO; 4]; 4];
            for (r, c, q) in [(0, 0, s11), (0, 1, s12), (1, 0, s21), (1, 1, s22)] {
                for i in 0..2 {
                    for j in 0..2 {
                        s[2 * r + i][2 * c + j] = q[i][j];
                    }
                }
            }
            Ok(s)
        })
        .collect()
}
