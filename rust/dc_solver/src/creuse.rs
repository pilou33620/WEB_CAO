//! Ce que scipy faisait pour le solveur : la matrice creuse CSR (scipy.sparse.csr_matrix), le
//! gradient conjugué préconditionné (scipy.sparse.linalg.cg, repris ligne pour ligne de
//! SciPy 1.18) et le plus proche voisin (scipy.interpolate.NearestNDInterpolator).

/// Une matrice creuse par lignes ; dans chaque ligne, les colonnes sont croissantes et uniques.
pub struct Csr {
    pub debuts: Vec<usize>,
    pub colonnes: Vec<u32>,
    pub valeurs: Vec<f64>,
}

impl Csr {
    /// csr_matrix((valeurs, (lignes, colonnes))) d'un laplacien : les termes hors diagonale
    /// `hors` (ligne, colonne, valeur) et la diagonale. Comme scipy, les colonnes d'une ligne
    /// sont triées et les doublons sommés -- un via pose plusieurs fois la même paire.
    pub fn laplacien(n: usize, hors: &[(u32, u32, f64)], diagonale: &[f64]) -> Csr {
        let mut debuts = vec![0usize; n + 1];
        for &(l, _, _) in hors {
            debuts[l as usize + 1] += 1;
        }
        for i in 0..n {
            debuts[i + 1] += debuts[i] + 1; // + la diagonale
        }
        let mut place: Vec<usize> = debuts[..n].to_vec();
        let mut brut = vec![(0u32, 0.0f64); debuts[n]];
        for &(l, c, v) in hors {
            brut[place[l as usize]] = (c, v);
            place[l as usize] += 1;
        }
        for i in 0..n {
            brut[place[i]] = (i as u32, diagonale[i]);
        }
        let mut m = Csr { debuts: Vec::with_capacity(n + 1), colonnes: Vec::with_capacity(brut.len()), valeurs: Vec::with_capacity(brut.len()) };
        m.debuts.push(0);
        for i in 0..n {
            let ligne = &mut brut[debuts[i]..debuts[i + 1]];
            ligne.sort_by_key(|t| t.0); // stable : les doublons se somment dans l'ordre de pose
            for &(c, v) in ligne.iter() {
                if m.colonnes.len() > m.debuts[i] && m.colonnes[m.colonnes.len() - 1] == c {
                    *m.valeurs.last_mut().unwrap() += v;
                } else {
                    m.colonnes.push(c);
                    m.valeurs.push(v);
                }
            }
            m.debuts.push(m.colonnes.len());
        }
        m
    }

    pub fn n(&self) -> usize {
        self.debuts.len() - 1
    }

    /// La ligne i : (colonnes, valeurs).
    pub fn ligne(&self, i: usize) -> (&[u32], &[f64]) {
        let (a, b) = (self.debuts[i], self.debuts[i + 1]);
        (&self.colonnes[a..b], &self.valeurs[a..b])
    }

    /// y = A x, ligne par ligne dans l'ordre des colonnes, comme csr_matvec.
    pub fn produit(&self, x: &[f64], y: &mut [f64]) {
        for (i, yi) in y.iter_mut().enumerate() {
            let (cols, vals) = self.ligne(i);
            let mut s = 0.0;
            for (c, v) in cols.iter().zip(vals) {
                s += v * x[*c as usize];
            }
            *yi = s;
        }
    }

    pub fn diagonale(&self) -> Vec<f64> {
        (0..self.n())
            .map(|i| {
                let (cols, vals) = self.ligne(i);
                cols.binary_search(&(i as u32)).map(|k| vals[k]).unwrap_or(0.0)
            })
            .collect()
    }
}

/// np.dot de deux vecteurs. Huit accumulateurs : BLAS ne somme pas non plus dans l'ordre, et
/// c'est ce qui laisse le compilateur vectoriser.
fn dot(a: &[f64], b: &[f64]) -> f64 {
    let mut s = [0.0f64; 8];
    let (ca, cb) = (a.chunks_exact(8), b.chunks_exact(8));
    let (ra, rb) = (ca.remainder(), cb.remainder());
    for (x, y) in ca.zip(cb) {
        for k in 0..8 {
            s[k] += x[k] * y[k];
        }
    }
    let mut total = ((s[0] + s[4]) + (s[2] + s[6])) + ((s[1] + s[5]) + (s[3] + s[7]));
    for (x, y) in ra.iter().zip(rb) {
        total += x * y;
    }
    total
}

/// scipy.sparse.linalg.cg(A, b, rtol=rtol, atol=atol, maxiter=maxiter, M=Jacobi), x0 nul.
/// Rend la solution, ou le code d'échec de scipy : `maxiter`, quand la boucle s'épuise.
pub fn gradient_conjugue(a: &Csr, b: &[f64], rtol: f64, atol: f64, maxiter: usize) -> Result<Vec<f64>, usize> {
    let n = b.len();
    // Le préconditionneur de Jacobi : v / diagonale, une diagonale nulle prise pour 1.
    let inverse: Vec<f64> = a.diagonale().iter().map(|d| if d.abs() > 0.0 { *d } else { 1.0 }).collect();
    let bnrm2 = dot(b, b).sqrt();
    let atol = crate::pyth::max_py(atol, rtol * bnrm2);
    if bnrm2 == 0.0 {
        return Ok(b.to_vec());
    }
    let mut x = vec![0.0; n];
    let mut r = b.to_vec();
    let mut z = vec![0.0; n];
    let mut p = vec![0.0; n];
    let mut q = vec![0.0; n];
    let mut rho_prev = 0.0;
    for iteration in 0..maxiter {
        if dot(&r, &r).sqrt() < atol {
            return Ok(x); // Are we done?
        }
        for i in 0..n {
            z[i] = r[i] / inverse[i];
        }
        let rho_cur = dot(&r, &z);
        if iteration > 0 {
            let beta = rho_cur / rho_prev;
            for i in 0..n {
                p[i] = p[i] * beta + z[i];
            }
        } else {
            p.copy_from_slice(&z);
        }
        a.produit(&p, &mut q);
        let alpha = rho_cur / dot(&p, &q);
        for i in 0..n {
            x[i] += alpha * p[i];
            r[i] -= alpha * q[i];
        }
        rho_prev = rho_cur;
    }
    Err(maxiter)
}

/// NearestNDInterpolator(points, valeurs) : pour chaque requête, le rang du point le plus
/// proche. Les points sont rangés dans une grille de cases, fouillée par anneaux autour de la
/// requête.
/// shortcut: à distance EXACTEMENT égale, le plus petit rang ; l'arbre k-d de scipy tranche
/// selon l'ordre de son parcours. A reprendre si une carte peinte doit être la même au pixel
/// près sur un axe de symétrie du cuivre.
pub struct PlusProche<'a> {
    points: &'a [(f64, f64)],
    origine: (f64, f64),
    cote: (f64, f64),
    nb: (usize, usize),
    debuts: Vec<usize>,
    rangs: Vec<u32>,
}

impl<'a> PlusProche<'a> {
    pub fn new(points: &'a [(f64, f64)]) -> Self {
        let (mut x0, mut y0, mut x1, mut y1) = (f64::INFINITY, f64::INFINITY, f64::NEG_INFINITY, f64::NEG_INFINITY);
        for &(x, y) in points {
            (x0, y0, x1, y1) = (x0.min(x), y0.min(y), x1.max(x), y1.max(y));
        }
        let g = (((points.len() as f64) / 2.0).sqrt().ceil() as usize).clamp(1, 2048);
        let cote = |a: f64, b: f64| if b > a { (b - a) / g as f64 } else { 1.0 };
        let mut pp = PlusProche { points, origine: (x0, y0), cote: (cote(x0, x1), cote(y0, y1)), nb: (g, g), debuts: vec![0; g * g + 1], rangs: vec![0; points.len()] };
        let cases: Vec<usize> = points.iter().map(|&(x, y)| pp.case(x, y)).map(|(i, j)| i * g + j).collect();
        for &c in &cases {
            pp.debuts[c + 1] += 1;
        }
        for c in 0..g * g {
            pp.debuts[c + 1] += pp.debuts[c];
        }
        let mut place = pp.debuts[..g * g].to_vec();
        for (k, &c) in cases.iter().enumerate() {
            pp.rangs[place[c]] = k as u32;
            place[c] += 1;
        }
        pp
    }

    fn case(&self, x: f64, y: f64) -> (usize, usize) {
        let i = ((x - self.origine.0) / self.cote.0).floor().max(0.0) as usize;
        let j = ((y - self.origine.1) / self.cote.1).floor().max(0.0) as usize;
        (i.min(self.nb.0 - 1), j.min(self.nb.1 - 1))
    }

    /// Le rang du point le plus proche de (x, y), pris dans la boîte des points.
    pub fn rang(&self, x: f64, y: f64) -> usize {
        let (ci, cj) = self.case(x, y);
        let (ci, cj) = (ci as isize, cj as isize);
        let (ni, nj) = (self.nb.0 as isize, self.nb.1 as isize);
        let h = self.cote.0.min(self.cote.1);
        let mut mieux = (f64::INFINITY, u32::MAX);
        let mut anneau = 0isize;
        loop {
            for i in (ci - anneau).max(0)..=(ci + anneau).min(ni - 1) {
                let bord = (i - ci).abs() == anneau;
                let mut j = (cj - anneau).max(0);
                while j <= (cj + anneau).min(nj - 1) {
                    if bord || (j - cj).abs() == anneau {
                        let c = (i * nj + j) as usize;
                        for &k in &self.rangs[self.debuts[c]..self.debuts[c + 1]] {
                            let (px, py) = self.points[k as usize];
                            let d2 = (x - px) * (x - px) + (y - py) * (y - py);
                            if d2 < mieux.0 || (d2 == mieux.0 && k < mieux.1) {
                                mieux = (d2, k);
                            }
                        }
                        j += 1;
                    } else {
                        j = cj + anneau; // l'interieur de l'anneau est deja vu
                    }
                }
            }
            // Au-dela de l'anneau, tout point est a plus de anneau * h de la requete.
            let garde = anneau as f64 * h;
            if mieux.0 < garde * garde || anneau > ni.max(nj) {
                return mieux.1 as usize;
            }
            anneau += 1;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn laplacien_trie_et_somme() {
        // 0 -1- 1 -2- 2, la paire (0, 1) posee deux fois
        let hors = [(1, 2, -2.0), (2, 1, -2.0), (0, 1, -0.5), (1, 0, -0.5), (0, 1, -0.5), (1, 0, -0.5)];
        let m = Csr::laplacien(3, &hors, &[1.0, 3.0, 2.0]);
        assert_eq!(m.colonnes, [0, 1, 0, 1, 2, 1, 2]);
        assert_eq!(m.valeurs, [1.0, -1.0, -1.0, 3.0, -2.0, -2.0, 2.0]);
        // le noeud 2 tenu a 0 V, 1 A injecte en 0 : V0 = 1.5, V1 = 0.5
        let r = Csr { debuts: vec![0, 2, 4], colonnes: vec![0, 1, 0, 1], valeurs: vec![1.0, -1.0, -1.0, 3.0] };
        let x = gradient_conjugue(&r, &[1.0, 0.0], 1e-12, 1e-18, 20000).unwrap();
        assert!((x[0] - 1.5).abs() < 1e-12 && (x[1] - 0.5).abs() < 1e-12, "{x:?}");
        assert_eq!(gradient_conjugue(&r, &[1.0, 0.0], 1e-12, 1e-18, 1), Err(1));
    }

    #[test]
    fn plus_proche_contre_la_force_brute() {
        let mut graine = 12345u64;
        let mut alea = || {
            graine = graine.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
            (graine >> 11) as f64 / (1u64 << 53) as f64
        };
        let points: Vec<(f64, f64)> = (0..500).map(|k| if k < 400 { (alea() * 10.0, alea()) } else { (9.0 + alea(), 50.0 + alea()) }).collect();
        let pp = PlusProche::new(&points);
        for _ in 0..2000 {
            let (x, y) = (alea() * 10.0, alea() * 51.0);
            let brut = (0..points.len())
                .min_by(|&a, &b| {
                    let d = |k: usize| (x - points[k].0).powi(2) + (y - points[k].1).powi(2);
                    d(a).total_cmp(&d(b))
                })
                .unwrap();
            assert_eq!(pp.rang(x, y), brut);
        }
    }
}
