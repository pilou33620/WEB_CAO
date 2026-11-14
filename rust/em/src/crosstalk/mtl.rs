//! Les lignes couplees en cascade : `_modes_mtl`, `chaine_mtl`, `s_depuis_chaine`.
//!
//! Les matrices sont des listes de listes, comme `ligne_mom` les rend ; `faer` porte le
//! calcul (Cholesky, valeurs propres symetriques, LU), a la place de numpy.

use super::ErreurCrosstalk;
use faer::linalg::solvers::{DenseSolveCore, Solve};
use faer::{Mat, Side};
use ligne_mom::Complex64;

/// Une matrice complexe, ligne par ligne.
pub type MatC = Vec<Vec<Complex64>>;

// ==========================================================================
// LES LIGNES COUPLEES EN CASCADE -- une bibliotheque, plus un chemin de calcul
// --------------------------------------------------------------------------
// LE NIVEAU 2 NE S'EN SERT PAS : il lit [C] et [L] bloc par bloc et n'a besoin
// d'aucune frequence. Ces trois fonctions restent parce que `rf_reseau` et son
// banc y prennent leur reference de lignes couplees.
//
// UNE LIGNE MULTICONDUCTEUR UNIFORME SE MET SOUS FORME DE MATRICE DE CHAINE en
// tension-courant, et c'est cette forme-la qu'il faut ici -- pas la matrice S
// de chaque morceau. Deux morceaux de la ligne n'ont pas les memes conducteurs
// couples (une voisine commence, une autre s'arrete) ; leurs matrices modales
// n'ont donc rien de commun. Leurs matrices de CHAINE, elles, sont ecrites
// dans la meme base physique -- les N tensions et les N courants des memes N
// conducteurs -- et se multiplient sans autre precaution. C'est la seule
// facon d'assembler un parcours dont la section change.
//
//     dV/dz = -Z I ,  dI/dz = -Y V ,  Z = jwL , Y = jwC
//     V(z) = T (E a + E^-1 b) ,  E = exp(-G z) ,  G = diag(gamma_i)
//     I(z) = W (E a - E^-1 b) ,  W = Z^-1 T G = L^-1 T diag(sqrt(lambda_i))
//
// W NE DEPEND PAS DE LA FREQUENCE, et ce n'est pas un detail d'optimisation :
// le 1/jw de Z^-1 s'annule exactement contre le jw de G. C'est ce qui rend le
// CONTINU calculable -- a w = 0 la matrice de chaine vaut l'identite, le
// reseau est un jeu de fils, et la matrice S vaut ce qu'elle doit valoir. Une
// ecriture qui divise par w y aurait rendu des infinis, et le point k = 0 est
// precisement celui que la grille harmonique exige.
//
// LES MODES SORTENT D'UN PROBLEME SYMETRIQUE, pas de `eig` sur [L][C]. [L] et
// [C] sont definies positives ; avec [L] = Lh Lh^T, la matrice Lh^T [C] Lh est
// symetrique definie positive, ses valeurs propres sont reelles positives par
// construction et `eigh` les rend triees. T = Lh U redonne les vecteurs
// propres de [L][C]. Passer par `eig` rendrait des valeurs propres complexes a
// 1e-16 pres sur une geometrie symetrique -- et une racine carree de complexe
// la ou il faut un retard reel.
// ==========================================================================

fn fini(m: &Mat<f64>) -> bool {
    (0..m.ncols()).all(|j| (0..m.nrows()).all(|i| m[(i, j)].is_finite()))
}

fn fini_c(m: &Mat<Complex64>) -> bool {
    (0..m.ncols()).all(|j| (0..m.nrows()).all(|i| m[(i, j)].re.is_finite() && m[(i, j)].im.is_finite()))
}

fn listes(m: &Mat<f64>) -> Vec<Vec<f64>> {
    (0..m.nrows()).map(|i| (0..m.ncols()).map(|j| m[(i, j)]).collect()).collect()
}

fn listes_c(m: &Mat<Complex64>) -> MatC {
    (0..m.nrows()).map(|i| (0..m.ncols()).map(|j| m[(i, j)]).collect()).collect()
}

/// ([L],[C]) -> (T, W, sqrt(lambda)) -- la base modale de la section.
///
/// `lambda_i` est le carre de l'inverse de la vitesse du mode i : le retard du
/// mode sur une longueur d est d . sqrt(lambda_i).
///
/// Le signe de chaque colonne de T (donc de W) est celui que rend le solveur de valeurs
/// propres : il n'est pas forcement celui de LAPACK, et rien de ce qui s'en tire n'en depend.
pub fn _modes_mtl(l_mat: &[Vec<f64>], c_mat: &[Vec<f64>]) -> Result<(Vec<Vec<f64>>, Vec<Vec<f64>>, Vec<f64>), ErreurCrosstalk> {
    let n = l_mat.len();
    let l = Mat::from_fn(n, n, |i, j| l_mat[i][j]);
    let c = Mat::from_fn(n, n, |i, j| c_mat[i][j]);
    let non_definie = || ErreurCrosstalk::new(
        "Section non physique : matrice d'inductance non définie positive.",
        "La géométrie de la section est incohérente.");
    if !fini(&l) {
        return Err(non_definie());
    }
    let llt = l.llt(Side::Lower).map_err(|_| non_definie())?;
    // la triangulaire inferieure seule, comme numpy la rend
    let lh = Mat::from_fn(n, n, |i, j| if j <= i { llt.L()[(i, j)] } else { 0.0 });
    let sym = lh.transpose() * &c * &lh;
    let sym = Mat::from_fn(n, n, |i, j| (sym[(i, j)] + sym[(j, i)]) / 2.0);
    let imaginaire = || ErreurCrosstalk::new(
        "Section non physique : un mode de propagation a une vitesse imaginaire.",
        "La géométrie de la section est incohérente — deux conducteurs \
         qui se touchent, ou une permittivité nulle.");
    let propres = sym.self_adjoint_eigen(Side::Lower).map_err(|_| imaginaire())?;
    let valeurs: Vec<f64> = (0..n).map(|k| propres.S()[k]).collect();
    if valeurs.iter().any(|v| !(*v > 0.0)) {
        return Err(imaginaire());
    }
    let racines: Vec<f64> = valeurs.iter().map(|v| v.sqrt()).collect();
    let t_mat = &lh * propres.U();
    let second = Mat::from_fn(n, n, |i, j| t_mat[(i, j)] * racines[j]);
    let w_mat = l.partial_piv_lu().solve(&second);
    if !fini(&w_mat) {
        return Err(ErreurCrosstalk::new(
            "Section non physique : matrice d'inductance singulière.",
            "La géométrie de la section est incohérente."));
    }
    Ok((listes(&t_mat), listes(&w_mat), racines))
}

/// La matrice de chaine 2N x 2N d'un troncon uniforme, une par pulsation.
///
/// `longueur` est en METRES, `omegas` en rad/s. `tan_delta` entre dans [C] par
/// une permittivite complexe : c'est la seule perte que ce reseau porte, et
/// elle est exacte dans cette ecriture -- lambda est simplement multiplie par
/// (1 - j tan d), T et W ne bougent pas. La perte CONDUCTRICE, elle, n'y est
/// pas : elle rendrait W dependant de la frequence, et elle est dite dans les
/// hypotheses plutot que devinee.
pub fn chaine_mtl(l_mat: &[Vec<f64>], c_mat: &[Vec<f64>], longueur: f64, omegas: &[f64], tan_delta: f64) -> Result<Vec<MatC>, ErreurCrosstalk> {
    let n = l_mat.len();
    let (t_mat, w_mat, racines) = _modes_mtl(l_mat, c_mat)?;
    let mut facteur = Complex64::new(1.0, 0.0);
    if tan_delta > 0.0 {
        // LES DEUX PORTENT LE FACTEUR, ET C'EST LA SEULE ECRITURE JUSTE.
        // [C] devient [C](1 - j tan d) : lambda est multiplie par ce facteur,
        // donc `racines` = sqrt(lambda) ET `w_mat` = L^-1 T sqrt(lambda) le
        // sont par sa RACINE -- w_mat en porte une, exactement comme racines.
        // Ne l'appliquer qu'aux racines laissait l'IMPEDANCE CARACTERISTIQUE a
        // sa valeur sans perte : une ligne « adaptee » rendait alors S11 = 0 a
        // la precision machine au lieu des -42 dB de retour qu'une ligne a
        // pertes dielectriques presente sur une reference reelle. Les decibels
        // de couplage n'en bougeaient guere -- le facteur est une similitude
        // commune a tous les blocs, il ne survit qu'a la conversion aux ports
        // --, mais le Touchstone exporte est justement ce qu'on compare a un
        // solveur pleine onde, et c'est la que le retour manquant se voit.
        facteur = Complex64::new(1.0, -tan_delta).sqrt();
    }
    let racines: Vec<Complex64> = racines.iter().map(|r| r * facteur).collect();
    let t_c = |i: usize, j: usize| Complex64::new(t_mat[i][j], 0.0);
    let w_c = |i: usize, j: usize| w_mat[i][j] * facteur;
    let q = Mat::from_fn(2 * n, 2 * n, |i, j| match (i < n, j < n) {
        (true, true) => t_c(i, j),
        (true, false) => t_c(i, j - n),
        (false, true) => w_c(i - n, j),
        (false, false) => -w_c(i - n, j - n),
    });
    let q_inv = q.partial_piv_lu().inverse();
    if !fini_c(&q_inv) {
        return Err(ErreurCrosstalk::new(
            "Réseau non physique : matrice modale singulière.",
            "Vérifiez l'espacement entre conducteurs."));
    }

    // TOUTE LA BANDE D'UN SEUL PRODUIT. `e` et `ei` ne ponderent que les
    // COLONNES de T et de W : les quatre quadrants de P se remplissent donc par
    // diffusion, et `np.matmul` enchaine les K produits en une fois. Le calcul
    // est le MEME a l'ordre des operations pres ; ce qui disparait est la
    // boucle Python qui appelait `np.block` UNE FOIS PAR FREQUENCE ET PAR BLOC
    // -- cent soixante mille fois sur un parcours au plafond, et la moitie du
    // temps de l'analyse y passait. Une fonction qui coute cher se fait
    // appeler moins souvent ; ici elle ne coutait cher que de la facon dont
    // elle etait ecrite.
    let j1 = Complex64::new(0.0, 1.0);
    Ok(omegas.iter().map(|&omega| {
        let e: Vec<Complex64> = racines.iter().map(|r| (-(j1 * omega * r) * longueur).exp()).collect();
        let ei: Vec<Complex64> = racines.iter().map(|r| ((j1 * omega * r) * longueur).exp()).collect();
        let p = Mat::from_fn(2 * n, 2 * n, |i, j| match (i < n, j < n) {
            (true, true) => t_c(i, j) * e[j],
            (true, false) => t_c(i, j - n) * ei[j - n],
            (false, true) => w_c(i - n, j) * e[j],
            (false, false) => -w_c(i - n, j - n) * ei[j - n],
        });
        listes_c(&(p * &q_inv))
    }).collect())
}

/// La matrice de chaine -> la matrice S du reseau a 2N ports.
///
/// Les N premiers ports sont les bouts PROCHES (z = 0), les N suivants les
/// bouts LOINTAINS (z = L), et les courants sont comptes ENTRANTS aux deux
/// bouts -- c'est la convention des parametres S, et c'est elle qui donne au
/// terme S(victime_proche, agresseur_proche) le sens de « NEXT ».
///
/// ON NE PASSE PAS PAR [Y]. La conversion chaine -> Y demande l'inverse du
/// bloc B, qui s'annule au continu (une ligne de longueur nulle est un
/// court-circuit) et a chaque demi-onde. Les ondes, elles, se posent
/// directement : V = sqrt(z0)(a+b), I = (a-b)/sqrt(z0), et les deux equations
/// de la chaine deviennent un systeme lineaire en (a, b) qui n'a de singularite
/// nulle part.
pub fn s_depuis_chaine(phi: &[MatC], z0: f64) -> Result<Vec<MatC>, ErreurCrosstalk> {
    let mut sortie = Vec::with_capacity(phi.len());
    let (zero, un) = (Complex64::new(0.0, 0.0), Complex64::new(1.0, 0.0));
    for p in phi {
        let n = p.len() / 2;
        let id = |i: usize, j: usize| if i == j { un } else { zero };
        // m_v = [[-A, I], [C, 0]] ; m_i = [[-B, 0], [D, I]]
        let m_v = |i: usize, j: usize| match (i < n, j < n) {
            (true, true) => -p[i][j],
            (true, false) => id(i, j - n),
            (false, true) => p[i][j],
            (false, false) => zero,
        };
        let m_i = |i: usize, j: usize| match (i < n, j < n) {
            (true, true) => -p[i][j + n],
            (true, false) => zero,
            (false, true) => p[i][j + n],
            (false, false) => id(i - n, j - n),
        };
        let gauche = Mat::from_fn(2 * n, 2 * n, |i, j| z0 * m_v(i, j) - m_i(i, j));
        let droite = Mat::from_fn(2 * n, 2 * n, |i, j| z0 * m_v(i, j) + m_i(i, j));
        let s = gauche.partial_piv_lu().solve(&droite);
        if !fini_c(&s) {
            return Err(ErreurCrosstalk::new(
                "Réseau singulier : impossible de calculer les paramètres S.",
                "Vérifiez l'adaptation d'impédance de référence."));
        }
        sortie.push(listes_c(&Mat::from_fn(2 * n, 2 * n, |i, j| -s[(i, j)])));
    }
    Ok(sortie)
}
