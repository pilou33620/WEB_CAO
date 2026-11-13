// ==========================================================================
// LA CAVITE MODALE -- LE MEME MODELE QUE LA SIMULATION PI
// --------------------------------------------------------------------------
// La traversee « capacite des plans en parallele avec les ponts » est un
// modele a constantes localisees : il ne voit ni les modes de la paire de
// plans, ni ou sont les condensateurs. Il fallait donc, faute de pont, en
// supposer un -- et ce pont fictif resonnait avec la capacite des plans (pic
// de 466 ohms vers 220 MHz sur P01x291, la ou rien n'existe).
//
// Ici la cavite est un reseau a ports (Okoshi / Novak), celui de la
// simulation PI (commun/simulation-em.js, `simPDNCalculerModesCavite`,
// `simPDNInductancesEpandage`) : le port 0 est le via, les autres les VRAIS
// ponts a leur position, chacun termine par son impedance, et le reseau se
// reduit au port 0 par complement de Schur.
//
//   Z_ij = 1/(jwC) + jw L_ij(queue) + somme_mn jw c_m^2 c_n^2 / C k_i k_j
//                                          / (w_mn^2 - w^2 + jw w_mn / Q_mn)
//   k_i  = cos(m pi x_i/a) cos(n pi y_i/b) sinc(m pi w_i/2a) sinc(n pi w_i/2b)
//
// ponytail: cavite RECTANGULAIRE (la boite du recouvrement), C de l'aire
// reelle ; un contour quelconque demanderait un solveur de plans (BEM/FDTD).

use crate::alg;
use crate::grille::Bord;
use crate::{C_0, MU_0, SIGMA_CU};
use faer::Mat;
use num_complex::Complex64;
use std::collections::HashSet;
use std::f64::consts::PI;

pub const FREQ_MAX_MODES: f64 = 6e9;
pub const PORT_MIN: f64 = 50e-6;

/// La cavite a ports que `cavite_modale` et `cavite_grille` preparent, et que
/// `impedance_cavite_modale` evalue. `kappa` est (modes x ports), `l_queue` et `statique`
/// (ports x ports). Les champs sous `noeuds` ne viennent que de la cavite maillee.
#[derive(Debug, Clone, Default)]
pub struct Cavite {
    pub c: f64,
    pub tan_d: f64,
    pub kappa: Vec<Vec<f64>>,
    pub poids: Vec<f64>,
    pub w_mn: Vec<f64>,
    pub inv_q: Vec<f64>,
    pub l_queue: Vec<Vec<f64>>,
    pub f_premier: Option<f64>,
    pub statique: Vec<Vec<f64>>,
    pub noeuds: usize,
    pub hors: usize,
    pub ilots: usize,
    pub liens_page: usize,
    /// (L_min / L, L_somme / L, L, PEEC calculee) de l'ilot du via
    pub bornes_ilot: Option<(f64, f64, f64, bool)>,
    pub sur_ilot: bool,
    pub ecart_via_mm: f64,
    pub convergence: Option<f64>,
    pub q_rad_min: Option<f64>,
    pub bord: Option<Bord>,
}

/// np.sinc(u) = sin(pi u)/(pi u)
pub(crate) fn sinc(u: f64) -> f64 {
    let y = PI * if u == 0.0 { 1.0e-20 } else { u };
    y.sin() / y
}

/// Prepare la cavite a x b (m), ecart h (m), et ses ports [(x, y, w)] en
/// metres depuis un coin -- w, le cote du port. Rend un dict que
/// `impedance_cavite_modale` evalue a chaque frequence, sans rien recalculer
/// de geometrique.
#[allow(clippy::too_many_arguments)]
pub fn cavite_modale(a: f64, b: f64, h: f64, epsilon_r: f64, tan_d: f64, c_plans: f64, ports: &[(f64, f64, f64)], f_max: f64) -> Cavite {
    let er = epsilon_r.max(1.0);
    let xs: Vec<f64> = ports.iter().map(|p| p.0.clamp(0.0, a)).collect();
    let ys: Vec<f64> = ports.iter().map(|p| p.1.clamp(0.0, b)).collect();
    let ws: Vec<f64> = ports.iter().map(|p| p.2.max(PORT_MIN)).collect();
    let v = C_0 / er.sqrt();

    let grille = |mx: usize, nx: usize| -> Vec<(usize, usize)> {
        (0..=mx).flat_map(|m| (0..=nx).map(move |n| (m, n))).filter(|&(m, n)| m + n > 0).collect()
    };

    // np.sinc(u) = sin(pi u)/(pi u) : l'argument se passe divise par pi
    let kappa = |modes: &[(usize, usize)]| -> Vec<Vec<f64>> {
        modes
            .iter()
            .map(|&(m, n)| {
                let (m, n) = (m as f64, n as f64);
                (0..ports.len())
                    .map(|i| (m * PI / a * xs[i]).cos() * (n * PI / b * ys[i]).cos() * sinc(m / (2.0 * a) * ws[i]) * sinc(n / (2.0 * b) * ws[i]))
                    .collect()
            })
            .collect()
    };

    // LES MODES QUI RESONNENT dans la bande : chacun son pole et son Q.
    let m_max = ((2.0 * a * f_max / v) as usize).clamp(1, 64);
    let n_max = ((2.0 * b * f_max / v) as usize).clamp(1, 64);
    let frequence = |&(m, n): &(usize, usize)| v / 2.0 * ((m as f64 / a) * (m as f64 / a) + (n as f64 / b) * (n as f64 / b)).sqrt();
    let modes: Vec<(usize, usize)> = grille(m_max, n_max).into_iter().filter(|mn| frequence(mn) <= f_max).collect();
    let f_mn: Vec<f64> = modes.iter().map(frequence).collect();
    let inv_q: Vec<f64> = f_mn.iter().map(|&f| tan_d + 1.0 / (PI * f * MU_0 * SIGMA_CU).sqrt() / h).collect();
    let double = |k: usize| if k > 0 { 2.0 } else { 1.0 };
    let poids: Vec<f64> = modes.iter().map(|&(m, n)| double(m) * double(n)).collect();

    // LA QUEUE : les modes au-dessus de la bande n'y resonnent plus, ils
    // inductent. Sommes une fois pour toutes (simPDNInductancesEpandage) ;
    // c'est elle qui porte l'etalement local autour de chaque port.
    let w_min = ws.iter().copied().fold(f64::INFINITY, f64::min);
    let borne = |cote: f64| ((1.6 * cote / w_min).ceil() as usize).clamp(8, 400);
    let deja: HashSet<(usize, usize)> = modes.iter().copied().collect();
    let queue: Vec<(usize, usize)> = grille(borne(a), borne(b)).into_iter().filter(|mn| !deja.contains(mn)).collect();
    let kq = kappa(&queue);
    let p = ports.len();
    let mut l_queue = vec![vec![0.0; p]; p];
    for (&(mq, nq), k) in queue.iter().zip(&kq) {
        let k2 = (mq as f64 / a) * (mq as f64 / a) + (nq as f64 / b) * (nq as f64 / b);
        let base = MU_0 * h * double(mq) * double(nq) / (PI * PI * a * b * k2);
        for i in 0..p {
            for j in 0..p {
                l_queue[i][j] += k[i] * base * k[j];
            }
        }
    }

    Cavite {
        c: c_plans,
        tan_d,
        kappa: kappa(&modes),
        poids,
        w_mn: f_mn.iter().map(|f| 2.0 * PI * f).collect(),
        inv_q,
        l_queue,
        f_premier: f_mn.iter().copied().reduce(f64::min),
        statique: vec![vec![1.0; p]; p],
        ..Default::default()
    }
}

/// Le poids complexe de chaque mode a la pulsation `w` :
/// j w poids / C / (w_mn^2 - w^2 + j w w_mn / Q).
pub(crate) fn poids_modes(w: f64, cav: &Cavite) -> Vec<Complex64> {
    (0..cav.w_mn.len())
        .map(|m| Complex64::new(0.0, w * cav.poids[m]) / cav.c / Complex64::new(cav.w_mn[m] * cav.w_mn[m] - w * w, w * cav.w_mn[m] * cav.inv_q[m]))
        .collect()
}

/// Les matrices Z des ports, une par pulsation de `ws` : (F, P, P).
///
/// Le mode statique porte les pertes du dielectrique, comme dans la PI :
/// 1 / (w C tan d + j w C), pondere par `statique` (1 entre deux ports de la
/// meme cavite, 0 entre deux ilots qui ne se touchent pas).
///
/// Ici, la matrice (P, P) d'UNE pulsation.
pub fn _z_ports(w: f64, cav: &Cavite) -> Mat<Complex64> {
    let p = cav.statique.len();
    let g = poids_modes(w, cav);
    let stat = 1.0 / (w * cav.c * Complex64::new(cav.tan_d, 1.0));
    let mut z = Mat::<Complex64>::zeros(p, p);
    for (k, g) in cav.kappa.iter().zip(&g) {
        for i in 0..p {
            let kg = k[i] * g;
            for j in 0..p {
                z[(i, j)] += kg * k[j];
            }
        }
    }
    for i in 0..p {
        for j in 0..p {
            z[(i, j)] += stat * cav.statique[i][j] + Complex64::new(0.0, w * cav.l_queue[i][j]);
        }
    }
    z
}

/// Z vue au port 0 a chaque frequence de `freqs`, les ports 1..n termines
/// par `z_termes` (F, n), et les courants de ces ports pour un courant unite
/// injecte au port 0 (F, n). Toutes les frequences d'un coup. EN SI.
pub fn impedance_cavite_modale_vec(freqs: &[f64], cav: &Cavite, z_termes: &[Vec<Complex64>]) -> (Vec<Complex64>, Vec<Vec<Complex64>>) {
    let mut zin = Vec::with_capacity(freqs.len());
    let mut courants = Vec::with_capacity(freqs.len());
    for (f, &freq) in freqs.iter().enumerate() {
        let z = _z_ports(2.0 * PI * freq.max(1e-3), cav);
        let n = z.nrows().saturating_sub(1);
        if n == 0 {
            zin.push(if z.nrows() > 0 { z[(0, 0)] } else { Complex64::new(0.0, 0.0) });
            courants.push(Vec::new());
            continue;
        }
        let a = Mat::from_fn(n, n, |i, j| z[(i + 1, j + 1)] + if i == j { z_termes[f][i] } else { Complex64::new(0.0, 0.0) });
        let b = Mat::from_fn(n, 1, |i, _| z[(i + 1, 0)]);
        // une matrice singuliere rend des NaN, la ou numpy levait LinAlgError
        let i_l: Vec<Complex64> = match alg::resoudre_c(&a, &b) {
            Some(x) => (0..n).map(|i| -x[(i, 0)]).collect(),
            None => vec![Complex64::new(f64::NAN, f64::NAN); n],
        };
        zin.push((0..n).fold(z[(0, 0)], |s, i| s + z[(0, i + 1)] * i_l[i]));
        courants.push(i_l);
    }
    (zin, courants)
}

/// La meme chose a une seule frequence : (Z, [courants]).
pub fn impedance_cavite_modale(freq: f64, cav: &Cavite, z_termes: &[Complex64]) -> (Complex64, Vec<Complex64>) {
    let (mut zin, mut i_l) = impedance_cavite_modale_vec(&[freq], cav, &[z_termes.to_vec()]);
    (zin.remove(0), i_l.remove(0))
}
