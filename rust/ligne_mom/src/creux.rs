//! Ce que scipy.sparse faisait pour la cavite maillee : le laplacien d'un reseau de liens, sa
//! factorisation (`splu`), ses composantes connexes (`csgraph.connected_components`) et ses
//! premiers modes propres (`eigsh` en decalage-inversion).

use faer::linalg::solvers::Solve;
use faer::sparse::linalg::solvers::Llt;
use faer::sparse::{SparseColMat, Triplet};
use faer::{Mat, Side};

/// Les etiquettes de `connected_components(adj, directed=False)` : les composantes sont
/// numerotees dans l'ordre ou leur premier noeud apparait.
pub(crate) fn composantes(n: usize, liens: &[(usize, usize)]) -> (usize, Vec<usize>) {
    let mut parent: Vec<usize> = (0..n).collect();
    fn racine(p: &mut [usize], mut i: usize) -> usize {
        while p[i] != i {
            p[i] = p[p[i]];
            i = p[i];
        }
        i
    }
    for &(a, b) in liens {
        let (ra, rb) = (racine(&mut parent, a), racine(&mut parent, b));
        if ra != rb {
            parent[ra.max(rb)] = ra.min(rb);
        }
    }
    let mut etiquette = vec![usize::MAX; n];
    let mut comp = vec![0; n];
    let mut ncomp = 0;
    for i in 0..n {
        let r = racine(&mut parent, i);
        if etiquette[r] == usize::MAX {
            etiquette[r] = ncomp;
            ncomp += 1;
        }
        comp[i] = etiquette[r];
    }
    (ncomp, comp)
}

/// Le laplacien pondere d'un reseau de liens, restreint aux noeuds gardes, factorise
/// (Cholesky creux : la matrice est symetrique definie positive des qu'un noeud de chaque
/// composante est retire). `None` si elle ne l'est pas -- la ou `splu` levait.
pub(crate) struct Facteur {
    llt: Llt<usize, f64>,
    /// noeud -> rang dans le systeme reduit
    rang: Vec<Option<usize>>,
    n: usize,
}

impl Facteur {
    pub(crate) fn new(n: usize, liens: &[(usize, usize)], poids: &[f64], garde: impl Fn(usize) -> bool) -> Option<Facteur> {
        let mut rang = vec![None; n];
        let mut m = 0;
        for (i, r) in rang.iter_mut().enumerate() {
            if garde(i) {
                *r = Some(m);
                m += 1;
            }
        }
        if m == 0 {
            return None;
        }
        let mut t = Vec::with_capacity(4 * liens.len());
        for (&(a, b), &w) in liens.iter().zip(poids) {
            let (ra, rb) = (rang[a], rang[b]);
            if let Some(ra) = ra {
                t.push(Triplet::new(ra, ra, w));
            }
            if let Some(rb) = rb {
                t.push(Triplet::new(rb, rb, w));
            }
            if let (Some(ra), Some(rb)) = (ra, rb) {
                t.push(Triplet::new(ra, rb, -w));
                t.push(Triplet::new(rb, ra, -w));
            }
        }
        let mat = SparseColMat::<usize, f64>::try_new_from_triplets(m, m, &t).ok()?;
        let llt = mat.sp_cholesky(Side::Lower).ok()?;
        Some(Facteur { llt, rang, n: m })
    }

    /// Resout sur les noeuds gardes ; les autres valent zero dans le second membre comme dans
    /// la solution. Une colonne par second membre.
    pub(crate) fn resoudre(&self, seconds: &[Vec<f64>]) -> Vec<Vec<f64>> {
        let b = Mat::from_fn(self.n, seconds.len(), |_, _| 0.0);
        let mut b = b;
        for (j, s) in seconds.iter().enumerate() {
            for (i, r) in self.rang.iter().enumerate() {
                if let Some(r) = *r {
                    b[(r, j)] = s[i];
                }
            }
        }
        let x = self.llt.solve(&b);
        (0..seconds.len()).map(|j| self.rang.iter().map(|r| r.map_or(0.0, |r| x[(r, j)])).collect()).collect()
    }
}

fn dot(a: &[f64], b: &[f64]) -> f64 {
    a.iter().zip(b).map(|(x, y)| x * y).sum()
}

fn axpy(y: &mut [f64], a: f64, x: &[f64]) {
    for (y, x) in y.iter_mut().zip(x) {
        *y += a * x;
    }
}

/// Valeurs (croissantes) et vecteurs propres d'une matrice tridiagonale symetrique -- diagonale
/// `d`, sous-diagonale `e` -- par QL implicite a decalage. `z[j][k]` : composante j du vecteur k.
/// (Le solveur symetrique de faer 0.24 s'est montre faux a 5e-5 pres au-dela de 128 lignes
/// sur ces matrices ; celui-ci tient en quarante lignes.)
fn propres_tridiagonale(d: &[f64], e: &[f64]) -> Option<(Vec<f64>, Vec<Vec<f64>>)> {
    let n = d.len();
    let mut d = d.to_vec();
    let mut e: Vec<f64> = e.iter().copied().chain(std::iter::repeat(0.0)).take(n).collect();
    let mut z: Vec<Vec<f64>> = (0..n).map(|i| (0..n).map(|j| if i == j { 1.0 } else { 0.0 }).collect()).collect();
    for l in 0..n {
        let mut tours = 0;
        loop {
            let mut m = l;
            while m + 1 < n {
                let dd = d[m].abs() + d[m + 1].abs();
                if e[m].abs() <= f64::EPSILON * dd {
                    break;
                }
                m += 1;
            }
            if m == l {
                break;
            }
            tours += 1;
            if tours > 200 {
                return None;
            }
            let mut g = (d[l + 1] - d[l]) / (2.0 * e[l]);
            let mut r = g.hypot(1.0);
            g = d[m] - d[l] + e[l] / (g + if g >= 0.0 { r } else { -r });
            let (mut s, mut c, mut p) = (1.0, 1.0, 0.0);
            let mut rompu = false;
            for i in (l..m).rev() {
                let f = s * e[i];
                let b = c * e[i];
                r = f.hypot(g);
                e[i + 1] = r;
                if r == 0.0 {
                    d[i + 1] -= p;
                    e[m] = 0.0;
                    rompu = true;
                    break;
                }
                s = f / r;
                c = g / r;
                g = d[i + 1] - p;
                r = (d[i] - g) * s + 2.0 * c * b;
                p = s * r;
                d[i + 1] = g + p;
                g = c * r - b;
                for zk in z.iter_mut() {
                    let f = zk[i + 1];
                    zk[i + 1] = s * zk[i] + c * f;
                    zk[i] = c * zk[i] - s * f;
                }
            }
            if rompu {
                continue;
            }
            d[l] -= p;
            e[l] = g;
            e[m] = 0.0;
        }
    }
    let mut ordre: Vec<usize> = (0..n).collect();
    ordre.sort_by(|&a, &b| d[a].total_cmp(&d[b]));
    Some((ordre.iter().map(|&k| d[k]).collect(), z.iter().map(|zj| ordre.iter().map(|&k| zj[k]).collect()).collect()))
}

/// Les `nev` plus petites valeurs propres NON NULLES de K phi = lambda M phi, croissantes, et
/// leurs vecteurs (M-normes), pour le laplacien K d'un reseau CONNEXE et M diagonale positive.
///
/// C'est ce que `eigsh(K, k=nev + 1, M=M, sigma=-1.0, which="LM")` rendait une fois le mode
/// statique ecarte. ARPACK n'est pas ici : Lanczos a reorthogonalisation complete sur l'inverse
/// de K pris dans le complement du mode statique (un noeud a la masse, puis projection), relance
/// sur le complement des modes trouves tant qu'il en sort un de plus -- une valeur propre
/// multiple ne se montre qu'une fois par passe.
pub(crate) fn modes_propres(n: usize, liens: &[(usize, usize)], poids: &[f64], m_diag: &[f64], nev: usize) -> Option<(Vec<f64>, Vec<Vec<f64>>)> {
    let nev = nev.min(n.saturating_sub(1));
    if nev == 0 {
        return Some((Vec::new(), Vec::new()));
    }
    let rac: Vec<f64> = m_diag.iter().map(|m| m.sqrt()).collect();

    let facteur = Facteur::new(n, liens, poids, |i| i != 0)?;
    // le mode statique, dans la base ou M vaut l'identite
    let norme = dot(&rac, &rac).sqrt();
    let u0: Vec<f64> = rac.iter().map(|r| r / norme).collect();
    let op = |y: &[f64]| -> Vec<f64> {
        let b: Vec<f64> = y.iter().zip(&rac).map(|(y, r)| y * r).collect();
        let z = facteur.resoudre(&[b]).remove(0);
        let mut x: Vec<f64> = z.iter().zip(&rac).map(|(z, r)| z * r).collect();
        let p = dot(&u0, &x);
        axpy(&mut x, -p, &u0);
        x
    };

    // (theta = 1 / lambda, vecteur) des modes acquis, theta decroissant
    let mut acquis: Vec<(f64, Vec<f64>)> = Vec::new();
    let mut graine: u64 = 0x9E3779B97F4A7C15;
    for passe in 0..64 {
        let seuil = if acquis.len() >= nev { acquis[nev - 1].0 } else { 0.0 };
        let mut verrou: Vec<&[f64]> = vec![&u0];
        verrou.extend(acquis.iter().map(|(_, v)| v.as_slice()));
        let libre = n - verrou.len();
        if libre == 0 {
            break;
        }
        // tant qu'il en manque, on les demande ; ensuite, tout ce qui depasse le seuil
        let manque = nev.saturating_sub(acquis.len());
        let nouveaux = lanczos(&op, n, &verrou, &mut graine, manque, seuil, libre);
        let _ = passe;
        if nouveaux.is_empty() {
            break;
        }
        acquis.extend(nouveaux);
        acquis.sort_by(|a, b| b.0.total_cmp(&a.0));
    }
    if acquis.len() < nev {
        return None;
    }
    acquis.truncate(nev);
    let lam = acquis.iter().map(|(t, _)| 1.0 / t).collect();
    let vec = acquis.iter().map(|(_, v)| v.iter().zip(&rac).map(|(v, r)| v / r).collect()).collect();
    Some((lam, vec))
}

/// Lanczos a reorthogonalisation complete sur `op`, dans le complement de `verrou`. Rend les
/// couples de Ritz CONVERGES de tete, theta decroissant : les `voulus` premiers, ou (voulus
/// nul) tous ceux qui depassent `seuil` -- la passe s'arrete alors quand le premier sous le
/// seuil a converge lui aussi, ce qui assure qu'il n'en reste pas au-dessus.
fn lanczos(
    op: &dyn Fn(&[f64]) -> Vec<f64>, n: usize, verrou: &[&[f64]], graine: &mut u64, voulus: usize, seuil: f64, libre: usize,
) -> Vec<(f64, Vec<f64>)> {
    let purge = |x: &mut Vec<f64>, base: &[Vec<f64>]| {
        for _ in 0..2 {
            for v in verrou {
                let p = dot(v, x);
                axpy(x, -p, v);
            }
            for v in base {
                let p = dot(v, x);
                axpy(x, -p, v);
            }
        }
    };
    let mut base: Vec<Vec<f64>> = Vec::new();
    let (mut alpha, mut beta): (Vec<f64>, Vec<f64>) = (Vec::new(), Vec::new());
    let mut q: Vec<f64> = (0..n)
        .map(|_| {
            *graine = graine.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
            (*graine >> 11) as f64 / (1u64 << 53) as f64 - 0.5
        })
        .collect();
    purge(&mut q, &base);
    let nq = dot(&q, &q).sqrt();
    if nq == 0.0 {
        return Vec::new();
    }
    q.iter_mut().for_each(|x| *x /= nq);
    let mut prochain_controle = (2 * voulus).max(20).min(libre);
    let mut echelle = 0.0f64;
    loop {
        let mut r = op(&q);
        let a = dot(&q, &r);
        alpha.push(a);
        base.push(q);
        purge(&mut r, &base);
        let b = dot(&r, &r).sqrt();
        let m = base.len();
        echelle = echelle.max(a.abs()).max(b);
        let epuise = m >= libre || b <= 1e-14 * echelle;
        if m >= prochain_controle || epuise {
            // les couples de Ritz de la tridiagonale
            let Some((d, s)) = propres_tridiagonale(&alpha, &beta) else {
                return Vec::new();
            };
            let theta_max = d[m - 1].abs().max(f64::MIN_POSITIVE);
            let converge = |k: usize| epuise || (b * s[m - 1][k]).abs() <= 1e-12 * d[k].abs() + 1e-15 * theta_max;
            // de la plus grande a la plus petite
            let mut tete = 0;
            let mut fini = false;
            for k in (0..m).rev() {
                if !converge(k) {
                    break;
                }
                if voulus > 0 {
                    tete += 1;
                    if tete == voulus {
                        fini = true;
                        break;
                    }
                } else if d[k] > seuil {
                    tete += 1;
                } else {
                    fini = true;
                    break;
                }
            }
            if fini || epuise {
                return (0..tete)
                    .map(|r| {
                        let k = m - 1 - r;
                        let mut v = vec![0.0; n];
                        for (j, bj) in base.iter().enumerate() {
                            axpy(&mut v, s[j][k], bj);
                        }
                        let nv = dot(&v, &v).sqrt();
                        v.iter_mut().for_each(|x| *x /= nv);
                        (d[k], v)
                    })
                    .collect();
            }
            prochain_controle = (m + m / 4 + 10).min(libre);
        }
        beta.push(b);
        r.iter_mut().for_each(|x| *x /= b);
        q = r;
    }
}
