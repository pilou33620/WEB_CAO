//! Touchstone (.sNp), versions 1 et 2.

use crate::alg::*;
use crate::{ErreurRF, Res};
use dc_solver::pyth::repr_py;
use em::simulation_em::base::*;

fn unite_f(j: &str) -> Option<f64> {
    Some(match j {
        "hz" => 1.0,
        "khz" => 1e3,
        "mhz" => 1e6,
        "ghz" => 1e9,
        _ => return None,
    })
}

/// `_nombre(texte, defaut)` sur un jeton.
fn nombre(t: &str, defaut: f64) -> f64 {
    py::float(t).filter(|v| v.is_finite()).unwrap_or(defaut)
}

/// Texte d'un .sNp -> (freqs [Hz], S (nf, n, n), z0 (n,)).
///
/// Le nombre de ports vient de l'extension du nom (.s2p), du mot-cle
/// [Number of Ports] en version 2, ou de `n_ports`. Les Y et Z sont convertis
/// en S. Les donnees de bruit d'un .s2p -- qui suivent le reseau, frequences
/// reparties de zero -- sont ignorees.
pub fn lire_touchstone(texte: &str, nom: &str, n_ports: Option<i64>) -> Res<(Vec<f64>, Vec<MatC>, Vec<f64>)> {
    let ou_touchstone = if nom.is_empty() { "Touchstone" } else { nom };
    // shortcut: l'extension se lit en chiffres ASCII ; `\d` de Python admettait ceux d'autres ecritures
    let bas = py::strip(nom).to_lowercase();
    let mut n: Option<i64> = n_ports;
    if let Some(avant) = bas.strip_suffix('p') {
        let chiffres = avant.len() - avant.trim_end_matches(|ch: char| ch.is_ascii_digit()).len();
        let tete = &avant[..avant.len() - chiffres];
        if chiffres > 0 && tete.ends_with(".s") {
            n = Some(avant[avant.len() - chiffres..].parse().unwrap_or(i64::MAX));
        }
    }
    let (mut unite, mut param, mut forme, mut r_ref) = (1e9, "s".to_string(), "ma".to_string(), 50.0);
    let mut refs: Option<Vec<f64>> = None;
    let mut ref_ouverte = false; // [Reference] peut continuer sur les lignes suivantes
    let mut ordre_21_12 = true;
    let mut nombres: Vec<&str> = Vec::new();
    for brute in lignes(texte) {
        let ligne = py::strip(brute.split('!').next().unwrap_or(""));
        if ligne.is_empty() {
            continue;
        }
        if let Some(reste) = ligne.strip_prefix('#') {
            let bas = reste.to_lowercase();
            let jetons = jetons(&bas);
            let mut k = 0;
            while k < jetons.len() {
                let j = jetons[k];
                if let Some(u) = unite_f(j) {
                    unite = u;
                } else if ["s", "y", "z"].contains(&j) {
                    param = j.to_string();
                } else if ["ma", "db", "ri"].contains(&j) {
                    forme = j.to_string();
                } else if j == "r" && k + 1 < jetons.len() {
                    r_ref = nombre(jetons[k + 1], 50.0);
                    k += 1;
                } else if j == "g" || j == "h" {
                    return Err(ErreurRF::new(format!("{} : paramètres {} non gérés (seuls S, Y et Z le sont).", nom, j.to_uppercase()), ""));
                }
                k += 1;
            }
            continue;
        }
        if let Some(corps) = ligne.strip_prefix('[') {
            let (cle, reste) = corps.split_once(']').unwrap_or((corps, ""));
            let cle = py::strip(cle).to_lowercase();
            ref_ouverte = cle == "reference";
            if cle == "number of ports" {
                n = Some(nombre(reste, 0.0) as i64);
            } else if cle == "two-port data order" {
                ordre_21_12 = reste.contains("21_12");
            } else if cle == "reference" {
                refs = Some(jetons(reste).iter().map(|x| nombre(x, 50.0)).collect());
            } else if cle == "matrix format" && py::strip(reste).to_lowercase() != "full" {
                // Upper / Lower : n(n+1)/2 valeurs par frequence. Lues comme
                // n^2, la frequence suivante devenait un parametre S, sans erreur.
                return Err(ErreurRF::new(format!("{} : matrice « {} » non prise en charge.", ou_touchstone, py::strip(reste)),
                                         "Réexportez le modèle en matrice pleine (Full)."));
            } else if cle == "end" {
                break;
            }
            continue;
        }
        if ref_ouverte && n.is_some_and(|n| n != 0) {
            if let Some(r) = refs.as_mut().filter(|r| (r.len() as i64) < n.unwrap_or(0)) {
                r.extend(jetons(ligne).iter().map(|x| nombre(x, 50.0)));
                continue;
            }
        }
        nombres.extend(jetons(ligne));
    }
    let Some(n) = n.filter(|n| *n >= 1) else {
        return Err(ErreurRF::new(format!("{} : nombre de ports inconnu.", ou_touchstone), "Nommez le fichier .s1p, .s2p, ... .sNp."));
    };
    let mut valeurs = Vec::with_capacity(nombres.len());
    for x in &nombres {
        match py::float(x) {
            Some(v) => valeurs.push(v),
            None => {
                return Err(ErreurRF::new(
                    format!("{} : donnée illisible (could not convert string to float: {}).", nom, repr_py(&Json::Texte(x.to_string()))), ""))
            }
        }
    }
    if !valeurs.iter().all(|v| v.is_finite()) {
        return Err(ErreurRF::new(format!("{} : valeur non finie (nan ou inf) dans les données.", ou_touchstone), ""));
    }
    if r_ref <= 0.0 || refs.as_ref().is_some_and(|r| !r.is_empty() && minf(r) <= 0.0) {
        return Err(ErreurRF::new(format!("{} : impédance de référence nulle ou négative.", ou_touchstone), ""));
    }
    let pas = (n as u128) * (n as u128) * 2 + 1;
    let (mut freqs, mut mats): (Vec<f64>, Vec<MatC>) = (Vec::new(), Vec::new());
    if pas <= valeurs.len() as u128 {
        let (n, pas) = (n as usize, pas as usize);
        let mut i = 0;
        while i + pas <= valeurs.len() {
            let f = valeurs[i] * unite;
            if freqs.last().is_some_and(|d| f <= *d) {
                break; // donnees de bruit : fin du reseau
            }
            let paires = &valeurs[i + 1..i + pas];
            let mut cplx = Vec::with_capacity(n * n);
            for ab in paires.chunks(2) {
                let (a, b) = (ab[0], ab[1]);
                if forme == "ri" {
                    cplx.push(Complex64::new(a, b));
                } else {
                    let module = if forme == "db" { 10f64.powf(a / 20.0) } else { a };
                    if module.is_infinite() {
                        // `10 ** x` de Python leve plutot que de rendre l'infini
                        return Err(ErreurRF::interne("OverflowError : (34, 'Numerical result out of range')"));
                    }
                    let angle = b.to_radians();
                    cplx.push(c(module) * Complex64::new(angle.cos(), angle.sin()));
                }
            }
            let mut m: MatC = cplx.chunks(n).map(|l| l.to_vec()).collect();
            // En version 1, un 2 ports s'ecrit S11 S21 S12 S22 : colonne d'abord.
            // C'est la norme, pas une coquille -- voir `simulation_em.touchstone`.
            if n == 2 && ordre_21_12 {
                let t = m[0][1];
                m[0][1] = m[1][0];
                m[1][0] = t;
            }
            freqs.push(f);
            mats.push(m);
            i += pas;
        }
    }
    if freqs.is_empty() {
        return Err(ErreurRF::new(format!("{} : aucun point de fréquence lu.", ou_touchstone), ""));
    }
    let n = n as usize;
    let z0: Vec<f64> = match &refs {
        Some(r) if !r.is_empty() && r.len() == n => r.clone(),
        _ => vec![r_ref; n],
    };
    let version2 = refs.is_some() || texte.to_lowercase().contains("[version]");
    if param != "s" {
        // En version 1, Y et Z sont normalises a R ; en version 2, non.
        let echelle = if version2 { 1.0 } else { r_ref };
        mats = mats.iter().map(|m| _zy_vers_s(m, &param, echelle, &z0)).collect::<Res<Vec<_>>>()?;
    }
    Ok((freqs, mats, z0))
}

fn diag(v: impl Iterator<Item = f64>) -> MatC {
    let v: Vec<f64> = v.collect();
    (0..v.len()).map(|i| (0..v.len()).map(|j| c(if i == j { v[i] } else { 0.0 })).collect()).collect()
}

// numpy laissait remonter `LinAlgError` : une « Erreur interne », pas un refus
fn singuliere() -> ErreurRF {
    ErreurRF::interne("LinAlgError : Singular matrix")
}

pub fn _zy_vers_s(m: &MatC, param: &str, echelle: f64, z0: &[f64]) -> Res<MatC> {
    let n = m.len();
    let rac = diag(z0.iter().map(|z| z.sqrt()));
    let irac = diag(z0.iter().map(|z| 1.0 / z.sqrt()));
    let id = ident(n);
    if param == "z" {
        let me: MatC = m.iter().map(|l| l.iter().map(|v| v * echelle).collect()).collect();
        let zn = mul(&mul(&irac, &me), &irac);
        return Ok(mul(&plus(&zn, c(-1.0), &id), &inverse(&plus(&zn, c(1.0), &id)).ok_or_else(singuliere)?));
    }
    let me: MatC = m.iter().map(|l| l.iter().map(|v| v / echelle).collect()).collect();
    let yn = mul(&mul(&rac, &me), &rac);
    Ok(mul(&plus(&id, c(-1.0), &yn), &inverse(&plus(&id, c(1.0), &yn)).ok_or_else(singuliere)?))
}

/// S sur des references reelles z0 (par port) -> Y en siemens. None : (1 + S) singuliere.
pub fn _s_vers_y(s: &MatC, z0: &[f64]) -> Option<MatC> {
    let n = s.len();
    let irac = diag(z0.iter().map(|z| 1.0 / z.sqrt()));
    let id = ident(n);
    Some(mul(&mul(&mul(&irac, &plus(&id, c(-1.0), s)), &inverse(&plus(&id, c(1.0), s))?), &irac))
}

/// La matrice a la frequence f, lineaire en partie reelle et imaginaire.
///
/// PAS D'EXTRAPOLATION. Un modele mesure jusqu'a 6 GHz ne dit rien de 8 GHz,
/// et prolonger sa derniere pente inventerait une resonance ou en effacerait
/// une. On refuse, en donnant la bande du fichier.
pub fn _interpoler(freqs: &[f64], mats: &[MatC], f: f64, nom: &str) -> Res<MatC> {
    let tol = 1e-6 * maxf(&[f, 1.0]);
    let (premier, dernier) = (freqs[0], freqs[freqs.len() - 1]);
    if f < premier - tol || f > dernier + tol {
        return Err(ErreurRF::new(
            format!("{} ne couvre que {} à {} GHz ; la bande demandée va de ou jusqu'à {} GHz.",
                    nom, fmt_g(premier / 1e9, 4), fmt_g(dernier / 1e9, 4), fmt_g(f / 1e9, 4)),
            "Resserrez la bande d'analyse sur celle du fichier."));
    }
    let k = freqs.partition_point(|x| *x < f);
    if k == 0 {
        return Ok(mats[0].clone());
    }
    if k >= freqs.len() {
        return Ok(mats[mats.len() - 1].clone());
    }
    let (f0, f1) = (freqs[k - 1], freqs[k]);
    let t = if f1 > f0 { (f - f0) / (f1 - f0) } else { 0.0 };
    Ok(mats[k - 1].iter().zip(&mats[k]).map(|(la, lb)| la.iter().zip(lb).map(|(a, b)| a * (1.0 - t) + b * t).collect()).collect())
}
