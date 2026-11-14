// --------------------------------------------------------------------------
// LA MUTUELLE DES DEUX FUTS DE LA PAIRE
// --------------------------------------------------------------------------
// La cascade de la paire posait le pi de chaque via sur chaque brin comme si
// l'autre n'existait pas. En mode impair les deux futs portent des courants
// OPPOSES : le flux de l'un retranche celui de l'autre, et l'inductance vue
// par brin est L - M -- d'autant plus basse que les futs sont proches. C'est
// la regle du metier : on serre les vias d'une paire pour baisser leur
// impedance differentielle.
//
// LE CALCUL, PAR L'ENERGIE, comme `inductance_boucle_vias`. Les deux futs et
// les vias de masse retenus forment un jeu de conducteurs paralleles ; leurs
// inductances partielles sont celles de Grover (`mutuelle_partielle`). En mode
// impair les futs portent +1 et -1, les retours a_k avec somme(a_k) = 0 ; en
// mode commun +1 et +1, et les retours rendent les deux. Les a_k minimisent
// l'energie -- c'est un systeme lineaire sous contrainte. L_impair et L_pair
// par brin sont la moitie de ces energies ; M_impair et M_pair sont leurs
// ecarts a l'inductance du fut seul DANS LE MEME JEU, et c'est cet ecart qu'on
// retranche ou qu'on ajoute au L du pi -- qui reste celui que la fiche affiche.
//
// LES RETOURS DE LA PARTENAIRE ne sont pas dans le document : ce sont ceux du
// via principal, RENVOYES PAR SYMETRIE autour du milieu des deux futs. C'est
// la paire routee comme telle, et c'est dit dans la fiche.
//
// LA CAPACITE MUTUELLE. Entre deux plans, deux futs se voient comme une ligne
// bifilaire (pi eps / acosh(s/2r) par metre), mais les plans ecrantent ce
// couplage : le champ d'un fut s'y eteint comme exp(-pi x / b), b l'ecart des
// deux plans qui encadrent le dielectrique traverse. On somme dielectrique par
// dielectrique. En mode impair chaque brin voit 2 C_m de plus vers le plan
// median ; en mode commun, rien.
// --------------------------------------------------------------------------

use super::base::*;
use super::discontinuites::_z_empilage;
use super::transition::ModeleVia;
use ligne_mom as tl;
use std::f64::consts::PI;

// Au-dela de cet ecart, le via de la partenaire trouve dans le document n'est
// pas celui de la paire : on retombe sur l'ecart de la paire.
pub const ECART_VIAS_PAIRE_MAX: f64 = 3.0; // mm

/// (x, y) en mm du via de la partenaire le plus proche, ou None.
pub fn _via_de_la_partenaire(doc: &Json, partenaire: &str, x0: f64, y0: f64) -> Option<(f64, f64)> {
    let mut meilleur: Option<(f64, f64, f64)> = None;
    // (le via, le net du troncon qui le porte)
    let mut candidats: Vec<(&Json, &Json)> = els(&doc["vias"]).iter().map(|v| (v, &Json::Nul)).collect();
    for o in els(&doc["voisinage"]) {
        if o["via"].as_objet().is_some() {
            candidats.push((&o["via"], &o["net"]));
        }
    }
    for (v, net_troncon) in candidats {
        if str_ou_vide(ou(&v["net"], net_troncon)) != partenaire {
            continue;
        }
        if nul(&v["x"]) || nul(&v["y"]) {
            continue;
        }
        let (x, y) = (nb(&v["x"]), nb(&v["y"]));
        let d = py::hypot(x - x0, y - y0);
        if d <= 0.0 || d > ECART_VIAS_PAIRE_MAX {
            continue;
        }
        if meilleur.is_none_or(|m| d < m.0) {
            meilleur = Some((d, x, y));
        }
    }
    meilleur.map(|m| (m.1, m.2))
}

/// Resout A x = b par elimination a pivot partiel (np.linalg.solve) ; None si singulier.
pub fn resoudre(mut a: Vec<Vec<f64>>, mut b: Vec<f64>) -> Option<Vec<f64>> {
    let n = b.len();
    for k in 0..n {
        let p = (k..n).max_by(|&i, &j| a[i][k].abs().total_cmp(&a[j][k].abs()))?;
        if a[p][k] == 0.0 {
            return None;
        }
        a.swap(k, p);
        b.swap(k, p);
        for i in k + 1..n {
            let f = a[i][k] / a[k][k];
            if f != 0.0 {
                for j in k..n {
                    a[i][j] -= f * a[k][j];
                }
                b[i] -= f * b[k];
            }
        }
    }
    for k in (0..n).rev() {
        let s: f64 = (k + 1..n).map(|j| a[k][j] * b[j]).sum();
        b[k] = (b[k] - s) / a[k][k];
    }
    Some(b)
}

/// (L_seul, L_impair, L_pair) par brin, en henrys. Conducteurs en {x, y,
/// z1, z2, rayon}, EN METRES. Voir l'en-tete de section.
pub fn _inductances_paire_vias(s1: &tl::Via, s2: &tl::Via, retours: &[tl::Via]) -> Option<(f64, f64, f64)> {
    let cond: Vec<&tl::Via> = [s1, s2].into_iter().chain(retours.iter()).collect();
    let n = cond.len();
    let mut lp = vec![vec![0.0; n]; n];
    for i in 0..n {
        lp[i][i] = tl::inductance_partielle_propre(cond[i].z1, cond[i].z2, cond[i].rayon).ok()?;
        for j in i + 1..n {
            let d = py::hypot(cond[i].x - cond[j].x, cond[i].y - cond[j].y);
            lp[i][j] = tl::mutuelle_partielle(cond[i].z1, cond[i].z2, cond[j].z1, cond[j].z2, d).ok()?;
            lp[j][i] = lp[i][j];
        }
    }

    let energie = |i_sig: [f64; 2], total: f64| -> Option<f64> {
        let a_ss: f64 = (0..2).map(|i| i_sig[i] * (0..2).map(|j| lp[i][j] * i_sig[j]).sum::<f64>()).sum();
        let k = n - 2;
        if k == 0 {
            return Some(a_ss);
        }
        let b: Vec<f64> = (0..k).map(|i| lp[2 + i][0] * i_sig[0] + lp[2 + i][1] * i_sig[1]).collect();
        let mut sys_ = vec![vec![0.0; k + 1]; k + 1];
        for i in 0..k {
            for j in 0..k {
                sys_[i][j] = 2.0 * lp[2 + i][2 + j];
            }
            sys_[i][k] = 1.0;
            sys_[k][i] = 1.0;
        }
        let mut rhs: Vec<f64> = b.iter().map(|x| -2.0 * x).collect();
        rhs.push(total);
        let a = resoudre(sys_, rhs)?;
        let ba: f64 = (0..k).map(|i| b[i] * a[i]).sum();
        let aga: f64 = (0..k).map(|i| a[i] * (0..k).map(|j| lp[2 + i][2 + j] * a[j]).sum::<f64>()).sum();
        Some(a_ss + 2.0 * ba + aga)
    };

    // Sans retour, le fut seul n'a pas de boucle : sa self partielle, comme
    // le plancher de `_inductance_transition`, et le mode commun de meme.
    let sans = n == 2;
    let l_seul = if sans { lp[0][0] } else { energie([1.0, 0.0], -1.0)? };
    let l_impair = energie([1.0, -1.0], 0.0)? / 2.0;
    let l_pair = (if sans { energie([1.0, 1.0], 0.0)? } else { energie([1.0, 1.0], -2.0)? }) / 2.0;
    Some((l_seul, l_impair, l_pair))
}

/// La capacite mutuelle de deux futs paralleles, en farads, ecrantee par
/// les plans. Voir l'en-tete de section.
pub fn _capacite_mutuelle_vias(couches: &[Json], lo: i64, hi: i64, s_mm: f64, rayon_mm: f64) -> f64 {
    let (s, r) = (s_mm, rayon_mm);
    if !(s > 2.0 * r && 2.0 * r > 0.0) {
        return 0.0;
    }
    let z = _z_empilage(couches);
    let plans: Vec<i64> = (0..couches.len()).filter(|&i| couches[i]["type"].as_str() == Some("copper") && couches[i]["role"].as_str() == Some("plane"))
        .map(|i| i as i64).collect();
    let mut c_m = 0.0;
    for k in lo..=hi {
        if !(0 <= k && k < couches.len() as i64) {
            continue;
        }
        let c = &couches[k as usize];
        if c["type"].as_str() != Some("dielectric") {
            continue;
        }
        let t = _nombre(&c["thickness"], 0.0);
        if t <= 0.0 {
            continue;
        }
        let haut = plans.iter().copied().filter(|&i| i < k).max();
        let bas = plans.iter().copied().filter(|&i| i > k).min();
        let zi = |i: i64| z[i as usize];
        let b = match (haut, bas) {
            (Some(h), Some(b)) => zi(b) - zi(h + 1),
            (Some(h), None) => 2.0 * (zi(k + 1) - zi(h + 1)),
            (None, Some(b)) => 2.0 * (zi(b) - zi(k)),
            (None, None) => f64::INFINITY,
        };
        let ecran = if b > 0.0 { (-PI * s / b).exp() } else { 0.0 };
        c_m += (PI * tl::EPSILON_0 * _nombre(&c["epsilon_r"], 4.3)
                / (s / (2.0 * r)).acosh()) * t * 1e-3 * ecran;
    }
    c_m
}

/// La mutuelle des futs d'un via de la paire : {m_impair, m_pair, c_m,
/// ecart_mm, source}, en henrys et farads. None quand on ne peut rien en
/// dire.
pub fn _mutuelle_paire(mv: &ModeleVia, doc: &Json, partenaire: &str, couplage: &Json, couches: &[Json]) -> Option<Json> {
    let geo = mv.geo.as_ref()?;
    if partenaire.is_empty() {
        return None;
    }
    // L'ECART DES FUTS : la geometrie d'abord, l'ecart de la paire sinon --
    // jamais moins que l'antipad, sous lequel deux vias ne se posent pas.
    let autre = if geo.a_position { _via_de_la_partenaire(doc, partenaire, geo.x_mm, geo.y_mm) } else { None };
    let (ecart, source, dx, dy);
    if let Some(autre) = autre {
        ecart = py::hypot(autre.0 - geo.x_mm, autre.1 - geo.y_mm);
        source = "geometrie";
        dx = (autre.0 - geo.x_mm) / ecart;
        dy = (autre.1 - geo.y_mm) / ecart;
    } else {
        let mut pas = 0.0;
        for p in els(&couplage["paires"]) {
            if p["net_voisin"].as_str() == Some(partenaire) {
                pas = _nombre(&p["ecart"], 0.0) + _nombre(&p["largeur"], 0.0);
                break;
            }
        }
        if !(pas > 0.0) {
            return None;
        }
        ecart = maxf(&[pas, mv.antipad]);
        source = if ecart == pas { "ecart de la paire" } else { "antipad" };
        dx = 0.0;
        dy = 1.0;
    }
    let rayon = mv.percage * 1e-3 / 2.0;
    if !(ecart * 1e-3 > 2.0 * rayon) {
        return None;
    }
    let (x0, y0) = (geo.x_mm * 1e-3, geo.y_mm * 1e-3);
    let s1 = tl::Via { x: x0, y: y0, z1: geo.z1, z2: geo.z2, rayon };
    let s2 = tl::Via { x: x0 + dx * ecart * 1e-3, y: y0 + dy * ecart * 1e-3, ..s1.clone() };
    let mut retours: Vec<tl::Via> = Vec::new();
    for g in &geo.retours {
        let miroir = tl::Via { x: s1.x + s2.x - g.x, y: s1.y + s2.y - g.y, ..g.clone() };
        for q in [g.clone(), miroir] {
            let libre = [&s1, &s2].into_iter().chain(retours.iter()).all(|o| py::hypot(q.x - o.x, q.y - o.y) > q.rayon + o.rayon);
            if libre {
                retours.push(q);
            }
        }
    }
    let (l_seul, l_impair, l_pair) = _inductances_paire_vias(&s1, &s2, &retours)?;
    let m_impair = minf(&[maxf(&[l_seul - l_impair, 0.0]), 0.9 * mv.l]);
    let m_pair = maxf(&[l_pair - l_seul, 0.0]);
    let c_m = _capacite_mutuelle_vias(couches, geo.lo, geo.hi, ecart, mv.percage / 2.0);
    Some(obj! {"m_impair" => m_impair, "m_pair" => m_pair,
               "c_m" => c_m,
               "ecart_mm" => round(ecart, 4), "source" => source,
               "retours" => retours.len()})
}
