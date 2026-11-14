//! Ce que numpy faisait en une ligne : resoudre, inverser, passer d'une liste de listes a une
//! matrice. `faer` porte le calcul ; ici, seulement la colle et le refus d'une matrice singuliere
//! (numpy levait `LinAlgError`, faer rend des infinis).

use crate::{refus, Res};
use faer::linalg::solvers::{DenseSolveCore, Solve};
use faer::Mat;
use num_complex::Complex64;

fn tout_fini(m: &Mat<f64>) -> bool {
    (0..m.ncols()).all(|j| (0..m.nrows()).all(|i| m[(i, j)].is_finite()))
}

/// `np.linalg.solve(a, b)`.
pub(crate) fn resoudre(a: &Mat<f64>, b: &Mat<f64>) -> Res<Mat<f64>> {
    let x = a.partial_piv_lu().solve(b);
    if !tout_fini(&x) {
        return refus("Singular matrix");
    }
    Ok(x)
}

/// `np.linalg.inv(a)`, None quand numpy aurait leve `LinAlgError`.
pub(crate) fn inverse(a: &Mat<f64>) -> Option<Mat<f64>> {
    let inv = a.partial_piv_lu().inverse();
    tout_fini(&inv).then_some(inv)
}

/// `np.linalg.solve` en complexe, None si la matrice est singuliere.
pub(crate) fn resoudre_c(a: &Mat<Complex64>, b: &Mat<Complex64>) -> Option<Mat<Complex64>> {
    let x = a.partial_piv_lu().solve(b);
    (0..x.ncols()).all(|j| (0..x.nrows()).all(|i| x[(i, j)].re.is_finite() && x[(i, j)].im.is_finite())).then_some(x)
}

pub(crate) fn vers_listes(m: &Mat<f64>) -> Vec<Vec<f64>> {
    (0..m.nrows()).map(|i| (0..m.ncols()).map(|j| m[(i, j)]).collect()).collect()
}

pub(crate) fn depuis_listes(l: &[Vec<f64>]) -> Mat<f64> {
    Mat::from_fn(l.len(), l.first().map_or(0, Vec::len), |i, j| l[i][j])
}

/// 0,5 (m + m^T)
pub(crate) fn symetrise(m: &Mat<f64>) -> Mat<f64> {
    Mat::from_fn(m.nrows(), m.ncols(), |i, j| 0.5 * (m[(i, j)] + m[(j, i)]))
}

/// Remplit une matrice n x p, colonne par colonne et sur tous les coeurs : `f(k, colonne)`
/// ecrit la colonne k. Chaque case ne depend que de ses indices : le resultat est le meme, au
/// bit pres, quel que soit le nombre de fils -- c'est ce que numpy faisait d'un trait.
pub(crate) fn par_colonnes(n: usize, p: usize, f: impl Fn(usize, &mut [f64]) + Sync) -> Mat<f64> {
    let mut tampon = vec![0.0; n * p];
    if n > 0 && p > 0 {
        // un petit tableau va plus vite d'un seul trait que par des fils a lancer
        let fils = if n * p < 100_000 { 1 } else { std::thread::available_parallelism().map_or(1, |k| k.get()).min(p) };
        let par_fil = p.div_ceil(fils);
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
    }
    Mat::from_fn(n, p, |i, j| tampon[j * n + i])
}
