//! L'oeil statistique.

use em::obj;
use em::simulation_em::base::*;

use crate::np::*;
use crate::trace::_curseurs;

// ==========================================================================
// L'oeil statistique : gigue aleatoire, bruit, diaphonie bornee
// --------------------------------------------------------------------------
// LA QUESTION QUE LE PIRE CAS NE POSE PAS. L'oeil pire cas est la frontiere
// qu'AUCUNE sequence ne franchit ; il ne dit pas combien de fois on s'en
// approche. Une liaison se juge pourtant a un taux d'erreur (10^-12 pour
// PCIe et SATA), et deux choses le fixent que la reponse a un bit ne porte
// pas : la gigue de l'emetteur, qui deplace l'instant ou l'on lit, et le
// bruit, qui deplace la tension lue.
//
// LA METHODE EST CELLE DES YEUX STATISTIQUES (StatEye, mode statistique de
// l'IBIS-AMI), sans tirage au sort :
//
//   1. A CHAQUE PHASE, la tension lue pour un « 1 » est
//          v_c + A c_0 + sum_k a_k A c_k        (a_k = ±1, independants)
//      -- sa densite est le produit de convolution de deux Dirac par
//      curseur. On la construit sur une grille de tensions, curseur apres
//      curseur, dans le domaine des PROBABILITES (jamais negatives, d'ou des
//      queues justes jusqu'a 10^-300 ; une transformee de Fourier
//      plafonnerait au bruit d'arrondi, vers 10^-16).
//   2. LE BRUIT GAUSSIEN DU RECEPTEUR (V rms) se convolue ensuite, et chaque
//      AGRESSEUR borne y entre comme un curseur de plus : deux Dirac a ±A.
//      C'est l'hypothese du pire cas borne -- l'agresseur bascule, il n'a
//      pas de queue -- et c'est elle qui fait converger cet oeil vers le pire
//      cas quand le taux vise descend.
//   3. LA GIGUE (RJ gaussienne en UI rms, DJ en double Dirac crete a crete)
//      melange les phases : lire a tau + J, c'est lire la densite de la
//      phase tau + J. Les poids sont les probabilites de J sur chaque case
//      de phase (1/64 UI), integrees exactement (erfc).
//   4. Le taux d'erreur a (tau, v) vaut
//          BER = 1/2 P(V1 < v) + 1/2 P(V0 > v)
//      et, les donnees etant symetriques, V0 - v_c a la loi de -(V1 - v_c) :
//      une seule densite suffit. Le CONTOUR a 10^-n est la frontiere
//      BER = 10^-n ; la BAIGNOIRE est le BER au seuil, phase par phase.
//
// LA QUANTIFICATION ne s'additionne pas au pire endroit. Chaque curseur est
// arrondi a la case, et l'erreur d'arrondi est REPORTEE sur le suivant (les
// curseurs ranges du plus fort au plus faible) : l'extreme -- tous les bits
// contre l'oeil, la ou se lisent les petits taux -- reste exact a une demi-
// case pres, au lieu de cumuler une demi-case par curseur.
//
// CE QUE CE MODELE SUPPOSE, et le resultat le redit : des bits independants
// et equiprobables (pas la sequence PRBS), une gigue rapportee a
// l'echantillonneur -- celle de l'emetteur n'y est pas filtree par le canal,
// ce qui est PRUDENT sur une liaison a pertes --, et une decision du DFE
// toujours juste.
// ==========================================================================

pub const NIVEAUX_BER: [f64; 4] = [1e-6, 1e-9, 1e-12, 1e-15];
pub const CASES_STAT: usize = 2048;
// Ecarts-types gardes dans les queues gaussiennes : Q(8,5) = 9,5e-18, sous
// le plus petit des niveaux traces.
pub const QUEUE_GAUSS: f64 = 8.5;
pub const PLANCHER_BER: f64 = 1e-40;
// Phases de l'oeil statistique par phase affichee : voir `oeil_statistique`.
pub const SUR_ECHANTILLONNAGE: usize = 4;

/// La queue gaussienne Q(x) = P(N(0,1) > x).
pub fn q_gauss(x: f64) -> f64 {
    0.5 * erfc_py(x / 2f64.sqrt())
}

/// x tel que Q(x) = p, par dichotomie sur erfc (p entre 1e-300 et 0,5).
pub fn q_inverse(p: f64) -> f64 {
    let p = minf(&[maxf(&[p, 1e-300]), 0.5]);
    let (mut lo, mut hi) = (0.0, 40.0);
    for _ in 0..200 {
        let mi = 0.5 * (lo + hi);
        if q_gauss(mi) > p {
            lo = mi;
        } else {
            hi = mi;
        }
    }
    0.5 * (lo + hi)
}

/// P(a < N(0,1) < b), juste dans les deux queues (erfc, jamais 1 - 1).
pub fn _masse_gauss(a: f64, b: f64) -> f64 {
    if a >= 0.0 {
        return q_gauss(a) - q_gauss(b);
    }
    if b <= 0.0 {
        return q_gauss(-b) - q_gauss(-a);
    }
    1.0 - q_gauss(b) - q_gauss(-a)
}

/// Le noyau d'un bruit gaussien sur des cases de largeur `pas`, ou None.
pub fn _noyau_gauss(sigma: f64, pas: f64) -> Option<Vec<f64>> {
    if !(sigma > 0.0) {
        return None;
    }
    let k = (QUEUE_GAUSS * sigma / pas).ceil() as i64;
    if k < 1 {
        return None;
    }
    Some((-k..=k).map(|i| _masse_gauss((i as f64 - 0.5) * pas / sigma, (i as f64 + 0.5) * pas / sigma)).collect())
}

/// Les poids de la gigue sur les decalages de phase -m_max..m_max.
///
/// J = DJ (double Dirac a ±DJ/2) + RJ (gaussienne). Le poids du decalage m
/// est P(J dans [(m - 1/2)/spu, (m + 1/2)/spu]). Sans RJ, chaque Dirac se
/// partage entre les deux phases qui l'encadrent.
pub fn poids_gigue(rj_ui: f64, dj_ui: f64, spu: usize, m_max: usize) -> Vec<f64> {
    let (spu, m_max) = (spu as f64, m_max as i64);
    let mut w = vec![0.0; (2 * m_max + 1) as usize];
    let diracs: Vec<f64> = if dj_ui > 0.0 { vec![-dj_ui / 2.0, dj_ui / 2.0] } else { vec![0.0] };
    for d in &diracs {
        let part = 1.0 / diracs.len() as f64;
        if rj_ui > 0.0 {
            for (i, mm) in (-m_max..=m_max).enumerate() {
                let mm = mm as f64;
                w[i] += part * _masse_gauss(((mm - 0.5) / spu - d) / rj_ui, ((mm + 0.5) / spu - d) / rj_ui);
            }
        } else {
            let x = d * spu;
            let k = x.floor();
            let f = x - k;
            for (kk, pp) in [(k as i64, 1.0 - f), (k as i64 + 1, f)] {
                if -m_max <= kk && kk <= m_max {
                    w[(kk + m_max) as usize] += part * pp;
                }
            }
        }
    }
    w
}

/// (case du principal, decalages entiers) avec report de l'erreur.
///
/// L'extreme bas principal - sum |a| est rendu a une demi-case pres, quel
/// que soit le nombre de curseurs : chaque arrondi rattrape le precedent.
pub fn _quantifier(principal: f64, amplitudes: &[f64], pas: f64) -> (i64, Vec<i64>) {
    let x0 = principal / pas;
    let f0 = x0.floor();
    let mut d = x0 - (f0 + 0.5);
    let mut q = Vec::with_capacity(amplitudes.len());
    for a in amplitudes {
        let x = a / pas;
        let k = ((x - d).round_ties_even() as i64).max(0);
        d = d - x + k as f64;
        q.push(k);
    }
    (f0 as i64, q)
}

// np.convolve(dens, noyau, mode="same"), le noyau plus court que la densite
fn convoluer(dens: &[f64], noyau: &[f64]) -> Vec<f64> {
    let (n, m) = (dens.len(), noyau.len());
    if m > n {
        // numpy echange alors les deux tableaux, et rend m termes
        return convoluer(noyau, dens);
    }
    let dec = (m - 1) / 2;
    // le noyau retourne, pour un produit scalaire de deux tranches
    let inv: Vec<f64> = noyau.iter().rev().copied().collect();
    // la densite n'est pas nulle que sur quelques cases : hors d'elles, la somme n'ajoute que des zeros
    let Some(premier) = dens.iter().position(|x| *x != 0.0) else { return vec![0.0; n] };
    let dernier = dens.iter().rposition(|x| *x != 0.0).unwrap_or(premier);
    (0..n)
        .map(|i| {
            // full[j] = sum_k dens[k] noyau[j - k], j = i + dec
            let j = i + dec;
            let k0 = (j + 1).saturating_sub(m).max(premier);
            let k1 = j.min(n - 1).min(dernier);
            if k0 > k1 {
                return 0.0;
            }
            let a = &dens[k0..=k1];
            let b = &inv[(m - 1) - (j - k0)..];
            // huit accumulateurs : la somme se vectorise, comme le produit scalaire de BLAS
            let mut acc = [0.0f64; 8];
            let blocs = a.len() / 8;
            for q in 0..blocs {
                for r in 0..8 {
                    acc[r] += a[8 * q + r] * b[8 * q + r];
                }
            }
            let mut s = ((acc[0] + acc[1]) + (acc[2] + acc[3])) + ((acc[4] + acc[5]) + (acc[6] + acc[7]));
            for q in 8 * blocs..a.len() {
                s += a[q] * b[q];
            }
            s
        })
        .collect()
}

/// Ce que `oeil_statistique` rend d'un contour : {ber, u, hauteur, largeur_ui}.
#[derive(Debug, Clone, PartialEq)]
pub struct Contour {
    pub ber: f64,
    pub u: Vec<Option<f64>>,
    pub hauteur: f64,
    pub largeur_ui: f64,
}

/// Ce que `oeil_statistique` rend.
#[derive(Debug, Clone, PartialEq)]
pub struct Statistique {
    pub contours: Vec<Contour>,
    pub baignoire: Vec<f64>,
    /// la baignoire verticale a l'echantillonnage : (u, ber)
    pub baignoire_v: (Vec<f64>, Vec<f64>),
    pub pas_v: f64,
    pub cases: usize,
    pub gigue_tronquee: bool,
    pub phases: usize,
    pub phases_affichees: usize,
}

impl Statistique {
    pub fn json(&self) -> Json {
        let opt = |u: &[Option<f64>]| Json::Liste(u.iter().map(|x| x.j()).collect());
        obj! {
            "contours" => self.contours.iter().map(|c| obj! {"ber" => c.ber, "u" => opt(&c.u), "hauteur" => c.hauteur,
                                                             "largeur_ui" => c.largeur_ui}).collect::<Vec<Json>>(),
            "baignoire" => self.baignoire.clone(),
            "baignoire_v" => obj! {"u" => self.baignoire_v.0.clone(), "ber" => self.baignoire_v.1.clone()},
            "pas_v" => self.pas_v, "cases" => self.cases, "gigue_tronquee" => self.gigue_tronquee,
            "phases" => self.phases, "phases_affichees" => self.phases_affichees,
        }
    }
}

/// L'oeil statistique autour de l'echantillonnage i_s. Voir plus haut.
///
/// `p_eq` : reponse a un bit (normalisee, excursion 2 amp), egalisee ;
/// `prises` : DFE (V) ; `bornes` : cretes des agresseurs (V) ; `rj_ui`,
/// `dj_ui` : gigue en UI ; `bruit_v` : bruit du recepteur en V rms.
/// Les tensions rendues sont relatives au seuil (u = v - v_c), a chacune
/// des `spu` phases de l'affichage.
///
/// LES PHASES SONT AFFINEES `sur` FOIS. Le melange de gigue pose chaque
/// croisement au milieu d'une case de phase : a 1/64 UI, c'est une demi-
/// case de biais sur la largeur, 0,15 en echelle Q pour une gigue de
/// 0,05 UI rms -- un facteur deux sur le taux d'erreur. La reponse a un bit
/// est lisse a cette echelle : on l'interpole, et le biais tombe d'autant.
#[allow(clippy::too_many_arguments)]
pub fn oeil_statistique(
    p_eq: &[f64], i_s: usize, spu: usize, amp: f64, prises: &[f64], bornes: &[f64], rj_ui: f64, dj_ui: f64, bruit_v: f64,
    niveaux: &[f64], cases: usize, sur: usize,
) -> Statistique {
    let spu_aff = spu;
    let affine: Vec<f64>;
    let (mut p_eq, mut i_s, mut spu) = (p_eq, i_s, spu);
    if sur > 1 {
        let x: Vec<f64> = (0..p_eq.len() * sur).map(|i| i as f64 / sur as f64).collect();
        let xp: Vec<f64> = (0..p_eq.len()).map(|i| i as f64).collect();
        let fin = p_eq.last().copied().unwrap_or(0.0);
        affine = interp(&x, &xp, p_eq, p_eq.first().copied().unwrap_or(0.0), fin);
        p_eq = &affine;
        (i_s, spu) = (i_s * sur, spu * sur);
    }
    let ext = dj_ui / 2.0 + QUEUE_GAUSS * rj_ui;
    let mut m_max = if ext > 0.0 { (ext * spu as f64 - 1e-9).ceil() as usize } else { 0 };
    let tronquee = m_max > spu / 2;
    m_max = m_max.min(spu / 2);
    let bornes: Vec<f64> = bornes.iter().map(|b| b.abs()).filter(|b| *b > 0.0).collect();

    // -- les curseurs de chaque phase, et la plage des tensions ----------
    let mut phases: Vec<Option<(f64, Vec<f64>)>> = Vec::new();
    let mut y_max = 0.0;
    let demi = (spu / 2 + m_max) as i64;
    for o_ in -demi..demi {
        let j = i_s as i64 + o_;
        if j < 0 {
            phases.push(None);
            continue;
        }
        let (k0, c) = _curseurs(p_eq, j as usize, spu);
        let principal = amp * c[k0];
        let mut reste: Vec<f64> = c.iter().enumerate().filter(|(i, _)| *i != k0).map(|(_, x)| amp * x).collect();
        for (jj, dj) in prises.iter().enumerate() {
            // le curseur de rang jj + 1 apres le principal
            let i = k0 + jj + 1;
            if i < c.len() {
                reste[i - 1] -= dj;
            }
        }
        let mut mags: Vec<f64> = reste.iter().map(|x| x.abs()).chain(bornes.iter().copied()).collect();
        mags.sort_by(|a, b| b.total_cmp(a));
        y_max = maxf(&[y_max, principal.abs() + py::sum(mags.iter().copied())]);
        phases.push(Some((principal, mags)));
    }
    y_max += QUEUE_GAUSS * maxf(&[bruit_v, 0.0]);
    y_max = maxf(&[y_max * 1.02, 1e-9]);
    let n = cases / 2 * 2;
    let pas = 2.0 * y_max / n as f64;
    let noyau = _noyau_gauss(bruit_v, pas);

    // -- la densite de chaque phase, puis sa fonction de repartition -----
    let mut rep: Vec<Vec<f64>> = Vec::with_capacity(phases.len());
    for ph in &phases {
        let mut ligne = vec![0.0; n + 1];
        let Some((principal, mags)) = ph else {
            // rien a lire : tout est faux
            ligne[1..].fill(1.0);
            rep.push(ligne);
            continue;
        };
        let (f0, qs) = _quantifier(*principal, mags, pas);
        let mut dens = vec![0.0; n];
        dens[(f0 + (n / 2) as i64).clamp(0, n as i64 - 1) as usize] = 1.0;
        for q in qs {
            if q <= 0 {
                continue;
            }
            let q = q as usize;
            if q >= n {
                for x in dens.iter_mut() {
                    *x *= 0.5;
                }
                continue;
            }
            let mut nouv = vec![0.0; n];
            for i in q..n {
                nouv[i] += dens[i - q];
            }
            for i in 0..n - q {
                nouv[i] += dens[i + q];
            }
            for x in nouv.iter_mut() {
                *x *= 0.5;
            }
            dens = nouv;
        }
        if let Some(noyau) = &noyau {
            dens = convoluer(&dens, noyau);
        }
        let mut s = 0.0;
        for i in 0..n {
            s += dens[i];
            ligne[i + 1] = s;
        }
        rep.push(ligne);
    }

    // -- la gigue melange les phases --------------------------------------
    let w = poids_gigue(rj_ui, dj_ui, spu, m_max);
    let mut mel = vec![vec![0.0; n + 1]; spu];
    for (i, wi) in w.iter().enumerate() {
        if *wi > 0.0 {
            for ip in 0..spu {
                let src = &rep[i + ip];
                for (a, b) in mel[ip].iter_mut().zip(src) {
                    *a += wi * b;
                }
            }
        }
    }
    // Le taux d'erreur a la distance u du seuil : 1/2 (F(u) + F(-u)).
    let mi = n / 2;
    let g: Vec<Vec<f64>> = mel.iter().map(|l| (0..=mi).map(|k| maxf(&[0.5 * (l[mi + k] + l[mi - k]), 0.0])).collect()).collect();
    let u: Vec<f64> = (0..=mi).map(|k| pas * k as f64).collect();
    let baignoire: Vec<f64> = g.iter().map(|l| l[0]).collect();

    // La demi-ouverture u* (V) a chaque phase, ou None si fermee.
    let demi_ouverture = |b: f64| -> Vec<Option<f64>> {
        let lb = b.log10();
        let lg = |x: f64| maxf(&[x, 1e-300]).log10();
        (0..spu)
            .map(|ip| {
                if g[ip][0] > b {
                    return None;
                }
                let Some(k) = g[ip].iter().position(|x| *x > b) else { return Some(u[mi]) };
                let (a0, a1) = (lg(g[ip][k - 1]), lg(g[ip][k]));
                let f = if a1 > a0 { (lb - a0) / (a1 - a0) } else { 0.0 };
                Some(u[k - 1] + minf(&[maxf(&[f, 0.0]), 1.0]) * pas)
            })
            .collect()
    };

    // La largeur (UI) ou BER <= b au seuil, bords interpoles en log.
    let largeur = |b: f64| -> f64 {
        let c0 = spu / 2;
        if baignoire[c0] > b {
            return 0.0;
        }
        if baignoire.iter().all(|x| *x <= b) {
            return 1.0;
        }
        let lb = b.log10();
        let bord = |sens: i64| -> f64 {
            let at = |k: i64| baignoire[modulo(c0 as i64 + sens * k, spu as i64)];
            let mut k = 0i64;
            while k + 1 < spu as i64 && at(k + 1) <= b {
                k += 1;
            }
            let a0 = maxf(&[at(k), 1e-300]).log10();
            let a1 = maxf(&[at(k + 1), 1e-300]).log10();
            let f = if a1 > a0 { (lb - a0) / (a1 - a0) } else { 0.0 };
            k as f64 + minf(&[maxf(&[f, 0.0]), 1.0])
        };
        minf(&[1.0, (bord(1) + bord(-1)) / spu as f64])
    };

    let mut contours = Vec::new();
    for b in niveaux {
        let d = demi_ouverture(*b);
        let hauteur = d[spu / 2].map_or(0.0, |x| 2.0 * x);
        contours.push(Contour { ber: *b, u: d.into_iter().step_by(sur).collect(), hauteur, largeur_ui: largeur(*b) });
    }
    // La baignoire verticale a l'echantillonnage : BER en fonction de u.
    let pas_v = 1.max((mi + 1) / 200);
    Statistique {
        contours,
        baignoire: baignoire.iter().step_by(sur).map(|x| maxf(&[*x, PLANCHER_BER])).collect(),
        baignoire_v: (u.iter().step_by(pas_v).copied().collect(),
                      g[spu / 2].iter().step_by(pas_v).map(|x| maxf(&[*x, PLANCHER_BER])).collect()),
        pas_v: pas, cases: n, gigue_tronquee: tronquee,
        phases: spu, phases_affichees: spu_aff,
    }
}
