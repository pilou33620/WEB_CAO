//! Ce que oeil.py demandait a numpy et que ce module refait a la main, dans le meme ordre
//! d'operations : np.sum (par paires), np.interp, np.fft.rfft / irfft, np.argmax.

use std::cell::RefCell;
use std::sync::Arc;

use rustfft::{Fft, FftPlanner};

pub use ibis::Complex64;

pub const ZERO: Complex64 = Complex64::new(0.0, 0.0);

extern "C" {
    fn erfc(x: f64) -> f64;
}

/// math.erfc : celle de la libm, comme Python.
pub fn erfc_py(x: f64) -> f64 {
    // SAFETY: erfc de la libm, une fonction pure sur un flottant
    unsafe { erfc(x) }
}

/// np.sum d'un tableau de flottants : la somme par paires de numpy (blocs de 8, moities au-dela
/// de 128), qui ne rend pas le dernier chiffre d'une addition de gauche a droite.
pub fn somme(a: &[f64]) -> f64 {
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

/// np.mean
pub fn moyenne(a: &[f64]) -> f64 {
    somme(a) / a.len() as f64
}

/// np.std
pub fn ecart_type(a: &[f64]) -> f64 {
    let m = moyenne(a);
    let d: Vec<f64> = a.iter().map(|x| (x - m) * (x - m)).collect();
    moyenne(&d).sqrt()
}

/// np.min / np.max (NaN si le tableau est vide : Python levait ValueError).
pub fn mini(a: impl IntoIterator<Item = f64>) -> f64 {
    a.into_iter().fold(f64::NAN, |m, x| if m.is_nan() || x < m { x } else { m })
}

pub fn maxi(a: impl IntoIterator<Item = f64>) -> f64 {
    a.into_iter().fold(f64::NAN, |m, x| if m.is_nan() || x > m { x } else { m })
}

/// np.argmax : le premier des plus grands (un NaN l'emporte, comme dans numpy).
pub fn argmax(a: &[f64]) -> usize {
    let mut k = 0;
    for (i, x) in a.iter().enumerate() {
        if x.is_nan() {
            return i;
        }
        if *x > a[k] {
            k = i;
        }
    }
    k
}

/// np.interp(x, xp, fp, left, right), `xp` croissant.
pub fn interp(x: &[f64], xp: &[f64], fp: &[f64], left: f64, right: f64) -> Vec<f64> {
    let n = xp.len();
    let mut j = 0usize;
    x.iter()
        .map(|&v| {
            if v.is_nan() {
                return v;
            }
            if n == 0 || v < xp[0] {
                return left;
            }
            if v > xp[n - 1] {
                return right;
            }
            if v == xp[n - 1] {
                return fp[n - 1];
            }
            // xp[j] <= v < xp[j + 1] : les abscisses demandees montent presque toujours
            if !(j + 1 < n && xp[j] <= v && v < xp[j + 1]) {
                j = xp.partition_point(|a| *a <= v) - 1;
            }
            if v == xp[j] {
                return fp[j];
            }
            let pente = (fp[j + 1] - fp[j]) / (xp[j + 1] - xp[j]);
            pente * (v - xp[j]) + fp[j]
        })
        .collect()
}

thread_local! {
    static PLANS: RefCell<FftPlanner<f64>> = RefCell::new(FftPlanner::new());
}

fn plan(n: usize, inverse: bool) -> Arc<dyn Fft<f64>> {
    PLANS.with(|p| if inverse { p.borrow_mut().plan_fft_inverse(n) } else { p.borrow_mut().plan_fft_forward(n) })
}

/// np.fft.rfft(x, n) : `x` coupe ou complete de zeros a n, rend n // 2 + 1 termes.
pub fn rfft_n(x: &[f64], n: usize) -> Vec<Complex64> {
    let mut t: Vec<Complex64> = (0..n).map(|i| Complex64::new(x.get(i).copied().unwrap_or(0.0), 0.0)).collect();
    if n > 0 {
        plan(n, false).process(&mut t);
    }
    t.truncate(n / 2 + 1);
    t
}

/// np.fft.fft(x) d'un tableau reel : les n termes.
pub fn fft_reel(x: &[f64]) -> Vec<Complex64> {
    let mut t: Vec<Complex64> = x.iter().map(|v| Complex64::new(*v, 0.0)).collect();
    if !t.is_empty() {
        plan(t.len(), false).process(&mut t);
    }
    t
}

/// np.fft.rfft(x)
pub fn rfft(x: &[f64]) -> Vec<Complex64> {
    rfft_n(x, x.len())
}

/// np.fft.irfft(x, n) : les n // 2 + 1 premiers termes de x (completes de zeros), n pair ou non.
pub fn irfft(x: &[Complex64], n: usize) -> Vec<f64> {
    let mut t = vec![ZERO; n];
    for k in 0..=n / 2 {
        let v = x.get(k).copied().unwrap_or(ZERO);
        if k < n {
            t[k] = v;
        }
        if k > 0 && k < n - k {
            t[n - k] = v.conj();
        }
    }
    if n > 0 {
        plan(n, true).process(&mut t);
    }
    t.iter().map(|z| z.re / n as f64).collect()
}

/// np.fft.rfftfreq(n, d)
pub fn rfftfreq(n: usize, d: f64) -> Vec<f64> {
    let val = 1.0 / (n as f64 * d);
    (0..=n / 2).map(|k| k as f64 * val).collect()
}

/// np.cumsum
pub fn cumsum(a: &[f64]) -> Vec<f64> {
    let mut s = 0.0;
    a.iter()
        .map(|x| {
            s += x;
            s
        })
        .collect()
}

/// a % n de Python sur des entiers : jamais negatif.
pub fn modulo(a: i64, n: i64) -> usize {
    a.rem_euclid(n) as usize
}

/// a % n de Python sur des flottants (n > 0).
pub fn fmod_py(a: f64, n: f64) -> f64 {
    let r = a % n;
    if r != 0.0 && (r < 0.0) != (n < 0.0) {
        r + n
    } else {
        r
    }
}
