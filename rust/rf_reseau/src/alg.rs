//! Ce que numpy faisait en une ligne sur des matrices complexes : produit, resolution,
//! inverse, division. `faer` porte les factorisations ; ici, la colle et le refus d'une matrice
//! singuliere (numpy levait `LinAlgError`, faer rend des infinis).

use em::simulation_em::base::Complex64;
use faer::linalg::solvers::{DenseSolveCore, Solve};
use faer::sparse::{SparseColMat, Triplet};
use faer::Mat;

pub type MatC = Vec<Vec<Complex64>>;
pub type MatR = Vec<Vec<f64>>;

pub const J: Complex64 = Complex64::new(0.0, 1.0);

pub fn c(re: f64) -> Complex64 {
    Complex64::new(re, 0.0)
}

/// a / b comme numpy divise deux complexes (Smith) : `1 / (0 + jx)` rend (0, -1/x) sans
/// passer par x², et une division par zero rend des infinis au lieu de lever.
pub fn div(a: Complex64, b: Complex64) -> Complex64 {
    let (br, bi) = (b.re.abs(), b.im.abs());
    if br >= bi {
        if br == 0.0 && bi == 0.0 {
            return Complex64::new(a.re / br, a.im / bi);
        }
        let rat = b.im / b.re;
        let scl = 1.0 / (b.re + b.im * rat);
        Complex64::new((a.re + a.im * rat) * scl, (a.im - a.re * rat) * scl)
    } else {
        let rat = b.re / b.im;
        let scl = 1.0 / (b.im + b.re * rat);
        Complex64::new((a.re * rat + a.im) * scl, (a.im * rat - a.re) * scl)
    }
}

/// 1 / b
pub fn inv(b: Complex64) -> Complex64 {
    div(c(1.0), b)
}

pub fn zeros(n: usize, m: usize) -> MatC {
    vec![vec![c(0.0); m]; n]
}

pub fn ident(n: usize) -> MatC {
    (0..n).map(|i| (0..n).map(|j| c(if i == j { 1.0 } else { 0.0 })).collect()).collect()
}

/// a @ b
pub fn mul(a: &MatC, b: &MatC) -> MatC {
    let p = b.first().map_or(0, Vec::len);
    a.iter().map(|la| (0..p).map(|j| la.iter().zip(b).map(|(x, lb)| x * lb[j]).sum()).collect()).collect()
}

/// a + k b
pub fn plus(a: &MatC, k: Complex64, b: &MatC) -> MatC {
    a.iter().zip(b).map(|(la, lb)| la.iter().zip(lb).map(|(x, y)| x + k * y).collect()).collect()
}

fn vers_faer(a: &MatC) -> Mat<Complex64> {
    Mat::from_fn(a.len(), a.first().map_or(0, Vec::len), |i, j| a[i][j])
}

fn depuis_faer(m: &Mat<Complex64>) -> Option<MatC> {
    let l: MatC = (0..m.nrows()).map(|i| (0..m.ncols()).map(|j| m[(i, j)]).collect()).collect();
    l.iter().flatten().all(|z| z.re.is_finite() && z.im.is_finite()).then_some(l)
}

// Jusqu'a cette taille, l'elimination s'ecrit ici, dans l'ordre de LAPACK sans blocs : un
// reseau de quelques noeuds aux valeurs exactes (un fil, un bloc S ideal) rend alors ses
// zeros exacts, la ou une factorisation par blocs laisse 1e-16.
const PETIT: usize = 48;

/// Gauss a pivot partiel (le plus grand |re| + |im|, comme `izamax`), None si un pivot est nul.
fn resoudre_petit(a: &MatC, b: &MatC) -> Option<MatC> {
    let n = a.len();
    let (mut a, mut x) = (a.clone(), b.clone());
    for k in 0..n {
        let p = (k..n).fold(k, |m, i| if a[i][k].re.abs() + a[i][k].im.abs() > a[m][k].re.abs() + a[m][k].im.abs() { i } else { m });
        if a[p][k] == c(0.0) || !(a[p][k].re.is_finite() && a[p][k].im.is_finite()) {
            return None;
        }
        a.swap(k, p);
        x.swap(k, p);
        let r = inv(a[k][k]);
        for i in k + 1..n {
            let l = a[i][k] * r;
            if l == c(0.0) {
                continue;
            }
            for j in k + 1..n {
                let v = a[k][j];
                a[i][j] -= l * v;
            }
            for j in 0..x[i].len() {
                let v = x[k][j];
                x[i][j] -= l * v;
            }
        }
    }
    for k in (0..n).rev() {
        for j in 0..x[k].len() {
            let mut v = x[k][j];
            for i in k + 1..n {
                v -= a[k][i] * x[i][j];
            }
            x[k][j] = div(v, a[k][k]);
        }
    }
    x.iter().flatten().all(|z| z.re.is_finite() && z.im.is_finite()).then_some(x)
}

/// `np.linalg.solve(a, b)`, None la ou numpy levait `LinAlgError`.
pub fn resoudre(a: &MatC, b: &MatC) -> Option<MatC> {
    if a.is_empty() {
        return Some(b.clone());
    }
    if a.len() <= PETIT {
        return resoudre_petit(a, b);
    }
    depuis_faer(&vers_faer(a).partial_piv_lu().solve(vers_faer(b)))
}

/// `np.linalg.inv(a)`, None la ou numpy levait `LinAlgError`.
pub fn inverse(a: &MatC) -> Option<MatC> {
    if a.is_empty() {
        return Some(Vec::new());
    }
    if a.len() <= PETIT {
        return resoudre_petit(a, &ident(a.len()));
    }
    depuis_faer(&vers_faer(a).partial_piv_lu().inverse())
}

/// `np.linalg.inv` d'une matrice reelle.
pub fn inverse_r(a: &MatR) -> Option<MatR> {
    let n = a.len();
    let m = Mat::from_fn(n, n, |i, j| a[i][j]).partial_piv_lu().inverse();
    let l: MatR = (0..n).map(|i| (0..n).map(|j| m[(i, j)]).collect()).collect();
    l.iter().flatten().all(|x| x.is_finite()).then_some(l)
}

/// `np.linalg.solve(k, 1)` : `k` rangee par rangee, n x n, et un second membre de uns.
pub fn resoudre_uns(n: usize, k: &[f64]) -> Option<Vec<f64>> {
    let x = Mat::from_fn(n, n, |i, j| k[i * n + j]).partial_piv_lu().solve(Mat::from_fn(n, 1, |_, _| 1.0));
    let v: Vec<f64> = (0..n).map(|i| x[(i, 0)]).collect();
    v.iter().all(|x| x.is_finite()).then_some(v)
}

/// `scipy.sparse.linalg.splu(m).solve(rhs)` sur des triplets (les doublons s'ajoutent, comme
/// dans `coo_matrix`) ; None la ou `splu` levait.
pub fn resoudre_creux(n: usize, triplets: &[(usize, usize, Complex64)], rhs: &MatC) -> Option<MatC> {
    let t: Vec<Triplet<usize, usize, Complex64>> = triplets.iter().map(|&(i, j, v)| Triplet::new(i, j, v)).collect();
    let mat = SparseColMat::<usize, Complex64>::try_new_from_triplets(n, n, &t).ok()?;
    let lu = mat.sp_lu().ok()?;
    depuis_faer(&lu.solve(vers_faer(rhs)))
}

/// `a.sum()` de numpy : la somme par paires (blocs de 8, moities au-dela de 128), pas
/// l'addition de gauche a droite -- le dernier chiffre n'est pas le meme.
pub fn somme_np(a: &[f64]) -> f64 {
    let n = a.len();
    if n < 8 {
        // numpy part de -0.0 : la somme de rien vaut 0.0 quand meme
        return a.iter().fold(-0.0, |s, x| s + x) + 0.0;
    }
    if n <= 128 {
        let mut r = [0.0f64; 8];
        r.copy_from_slice(&a[..8]);
        let mut i = 8;
        while i + 8 <= n {
            for k in 0..8 {
                r[k] += a[i + k];
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
    somme_np(&a[..n2]) + somme_np(&a[n2..])
}

/// Les blancs de `str.split()` et de `\s`.
pub fn blanc(ch: char) -> bool {
    em::simulation_em::base::py::blanc(ch)
}

/// `texte.split()`
pub fn jetons(texte: &str) -> Vec<&str> {
    texte.split(blanc).filter(|j| !j.is_empty()).collect()
}

/// `texte.splitlines()` : les fins de ligne de Python, pas seulement `\n`.
pub fn lignes(texte: &str) -> Vec<&str> {
    let fin = |ch: char| matches!(ch, '\n' | '\r' | '\x0b' | '\x0c' | '\x1c' | '\x1d' | '\x1e' | '\u{85}' | '\u{2028}' | '\u{2029}');
    let mut out = Vec::new();
    let mut debut = 0;
    let mut it = texte.char_indices().peekable();
    while let Some((i, ch)) = it.next() {
        if fin(ch) {
            out.push(&texte[debut..i]);
            let mut suite = i + ch.len_utf8();
            if ch == '\r' && it.peek().is_some_and(|(_, s)| *s == '\n') {
                it.next();
                suite += 1;
            }
            debut = suite;
        }
    }
    if debut < texte.len() {
        out.push(&texte[debut..]);
    }
    out
}
