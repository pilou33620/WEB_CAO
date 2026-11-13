//! Le tampon a un coin donne, ses commandes Ku(t), Kd(t), et la liaison dans le temps.

use crate::abcd::{plafond, resoudre, somme, MAX_ECHANTILLONS};
use crate::lecture::{Modele, Onde, Rampe};
use crate::py::{max, min};
use crate::ErreurIbis;

extern "C" {
    // math.erfc de Python est celle de la libm : la meme, pour le meme dernier chiffre
    fn erfc(x: f64) -> f64;
}

// ==========================================================================
// Le tampon, a un coin donne
// ==========================================================================

/// Une courbe V-I lineaire par morceaux, prolongee par ses pentes
/// extremes. Rapide sur des scalaires : c'est elle que le pas de temps
/// interroge des dizaines de milliers de fois.
#[derive(Debug, Clone, PartialEq)]
pub struct Courbe {
    pub v: Vec<f64>,
    pub i: Vec<f64>,
}

impl Courbe {
    pub fn new(vs: &[f64], is_: &[f64]) -> Courbe {
        let mut paires: Vec<(f64, f64)> = vs.iter().copied().zip(is_.iter().copied()).collect();
        paires.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
        Courbe { v: paires.iter().map(|p| p.0).collect(), i: paires.iter().map(|p| p.1).collect() }
    }

    /// (courant, conductance) a la tension x.
    pub fn appel(&self, x: f64) -> (f64, f64) {
        let (v, i) = (&self.v, &self.i);
        let n = v.len();
        if n == 0 {
            return (0.0, 0.0);
        }
        if n == 1 {
            return (i[0], 0.0);
        }
        // bisect.bisect_right(v, x) - 1, borne a [0, n - 2]
        let k = v.partition_point(|e| !(x < *e)).saturating_sub(1).min(n - 2);
        let dv = v[k + 1] - v[k];
        let g = if dv != 0.0 { (i[k + 1] - i[k]) / dv } else { 0.0 };
        (i[k] + g * (x - v[k]), g)
    }
}

fn courbe(m: &Modele, cle: &str, col: usize) -> Option<Courbe> {
    let tab = m.tableaux.get(cle).filter(|t| !t.is_empty())?;
    Some(Courbe::new(&tab.iter().map(|r| r[0]).collect::<Vec<_>>(), &tab.iter().map(|r| r[1 + col]).collect::<Vec<_>>()))
}

// float(None) : une reference ou un C_comp tout en « NA » plantait
fn sans_valeur(quoi: &str) -> ErreurIbis {
    ErreurIbis::plantage("TypeError", format!("{quoi} sans valeur (« NA »)"))
}

fn ref_(m: &Modele, cle: &str, col: usize, defaut: f64) -> Result<f64, ErreurIbis> {
    match m.refs.get(cle) {
        Some(t) => t[col].ok_or_else(|| sans_valeur(cle)),
        None => Ok(defaut),
    }
}

/// Les courbes d'un [Model] a un coin (typ, min ou max), et le courant
/// qu'il prend a la broche pour des commandes (Ku, Kd) donnees.
#[derive(Debug, Clone, PartialEq)]
pub struct Tampon {
    pub nom: String,
    pub type_: String,
    pub coin: String,
    pub v_pu: f64,
    pub v_pd: f64,
    pub v_pc: f64,
    pub v_gc: f64,
    pub c_comp: f64,
    pub pu: Option<Courbe>,
    pub pd: Option<Courbe>,
    pub pc: Option<Courbe>,
    pub gc: Option<Courbe>,
    pub g_gnd: f64,
    pub g_pow: f64,
    pub vinl: Option<f64>,
    pub vinh: Option<f64>,
}

impl Tampon {
    pub fn new(m: &Modele, coin: &str) -> Result<Tampon, ErreurIbis> {
        let Some(col) = crate::coin(coin) else {
            return Err(ErreurIbis::new(format!("Coin « {coin} » inconnu."), "Choisissez typ, min ou max."));
        };
        let vr = ref_(m, "voltage_range", col, 0.0)?;
        // Les terminaisons d'entree IBIS 3 : une resistance vers la masse,
        // une vers l'alimentation.
        let g = |cle: &str| m.refs.get(cle).and_then(|t| t[col]).filter(|r| *r != 0.0).map_or(0.0, |r| 1.0 / r);
        Ok(Tampon {
            nom: m.nom.clone(),
            type_: m.type_.clone(),
            coin: coin.to_string(),
            v_pu: ref_(m, "pullup_ref", col, vr)?,
            v_pd: ref_(m, "pulldown_ref", col, 0.0)?,
            v_pc: ref_(m, "power_clamp_ref", col, vr)?,
            v_gc: ref_(m, "gnd_clamp_ref", col, 0.0)?,
            c_comp: match &m.c_comp {
                Some(c) => c[col].ok_or_else(|| sans_valeur("C_comp"))?,
                None => 0.0,
            },
            pu: courbe(m, "pullup", col),
            pd: courbe(m, "pulldown", col),
            pc: courbe(m, "power clamp", col),
            gc: courbe(m, "gnd clamp", col),
            g_gnd: g("rgnd"),
            g_pow: g("rpower"),
            vinl: m.vinl,
            vinh: m.vinh,
        })
    }

    pub fn a_des_diodes(&self) -> bool {
        self.pc.is_some() || self.gc.is_some()
    }

    /// (courant entrant, conductance) des diodes et des terminaisons.
    pub fn i_statique(&self, v: f64) -> (f64, f64) {
        let (mut i, mut g) = (0.0, 0.0);
        if let Some(pc) = &self.pc {
            let (a, b) = pc.appel(self.v_pc - v);
            (i, g) = (i + a, g - b);
        }
        if let Some(gc) = &self.gc {
            let (a, b) = gc.appel(v - self.v_gc);
            (i, g) = (i + a, g + b);
        }
        if self.g_gnd != 0.0 {
            (i, g) = (i + self.g_gnd * v, g + self.g_gnd);
        }
        if self.g_pow != 0.0 {
            (i, g) = (i + self.g_pow * (v - self.v_pu), g + self.g_pow);
        }
        (i, g)
    }

    /// (courant entrant, conductance) de l'etage de sortie seul.
    pub fn i_commande(&self, v: f64, ku: f64, kd: f64) -> (f64, f64) {
        let (mut i, mut g) = (0.0, 0.0);
        if let (Some(pu), true) = (&self.pu, ku != 0.0) {
            let (a, b) = pu.appel(self.v_pu - v);
            (i, g) = (i + ku * a, g - ku * b);
        }
        if let (Some(pd), true) = (&self.pd, kd != 0.0) {
            let (a, b) = pd.appel(v - self.v_pd);
            (i, g) = (i + kd * a, g + kd * b);
        }
        (i, g)
    }

    pub fn i_total(&self, v: f64, ku: f64, kd: f64) -> (f64, f64) {
        let (a, ga) = self.i_commande(v, ku, kd);
        let (b, gb) = self.i_statique(v);
        (a + b, ga + gb)
    }

    /// La tension de broche en regime etabli, a vide ou sous une charge
    /// R vers v_charge, par dichotomie (le courant est monotone en V).
    pub fn niveau(&self, ku: f64, kd: f64, r_charge: Option<f64>, v_charge: f64) -> f64 {
        let f = |v: f64| {
            let (mut i, _) = self.i_total(v, ku, kd);
            if let Some(r) = r_charge.filter(|r| *r != 0.0) {
                i += (v - v_charge) / r;
            }
            i
        };
        let (mut lo, mut hi) = (min(self.v_pd, self.v_gc) - 5.0, max(self.v_pu, self.v_pc) + 5.0);
        let (flo, mut fhi) = (f(lo), f(hi));
        if flo * fhi > 0.0 {
            return 0.5 * (lo + hi);
        }
        for _ in 0..100 {
            let mi = 0.5 * (lo + hi);
            let fm = f(mi);
            if (fm > 0.0) == (fhi > 0.0) {
                (hi, fhi) = (mi, fm);
            } else {
                lo = mi;
            }
        }
        0.5 * (lo + hi)
    }
}

// ==========================================================================
// Les commandes Ku(t), Kd(t)
// ==========================================================================

/// Le front d'une commande : « montant » ou « descendant ».
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Front {
    Montant,
    Descendant,
}

/// (Ku, Kd), echantillonnes au pas dt depuis le debut du front.
pub type KuKd = (Vec<f64>, Vec<f64>);

/// {"montant": (Ku, Kd), "descendant": (Ku, Kd), "source": texte}.
#[derive(Debug, Clone, PartialEq)]
pub struct Commandes {
    pub montant: KuKd,
    pub descendant: KuKd,
    pub source: String,
}

impl Commandes {
    pub fn front(&self, sens: Front) -> &KuKd {
        match sens {
            Front::Montant => &self.montant,
            Front::Descendant => &self.descendant,
        }
    }
}

// la recherche de np.interp : la dichotomie de numpy, partie de l'indice precedent -- sur un
// tableau qui n'est pas croissant (un fichier abime), elle seule rend ce que numpy rendait
fn recherche(cle: f64, arr: &[f64], guess: isize) -> isize {
    let len = arr.len() as isize;
    let a = |i: isize| arr[i as usize];
    if cle > a(len - 1) {
        return len;
    } else if cle < a(0) {
        return -1;
    }
    if len <= 4 {
        let mut i = 1;
        while i < len && cle >= a(i) {
            i += 1;
        }
        return i - 1;
    }
    let guess = guess.min(len - 3).max(1);
    let (mut imin, mut imax) = (0, len);
    if cle < a(guess) {
        if cle < a(guess - 1) {
            imax = guess - 1;
            if guess > 8 && cle >= a(guess - 8) {
                imin = guess - 8;
            }
        } else {
            return guess - 1;
        }
    } else if cle < a(guess + 1) {
        return guess;
    } else if cle < a(guess + 2) {
        return guess + 1;
    } else {
        imin = guess + 2;
        if guess < len - 8 - 1 && cle < a(guess + 8) {
            imax = guess + 8;
        }
    }
    while imin < imax {
        let imid = imin + ((imax - imin) >> 1);
        if cle >= a(imid) {
            imin = imid + 1;
        } else {
            imax = imid;
        }
    }
    imin - 1
}

/// np.interp(x, xp, fp), xp d'au moins un point.
pub(crate) fn interp(x: &[f64], xp: &[f64], fp: &[f64]) -> Vec<f64> {
    let n = xp.len();
    let (lval, rval) = (fp[0], fp[n - 1]);
    if n == 1 {
        return x.iter().map(|v| if *v < xp[0] { lval } else if *v > xp[0] { rval } else { fp[0] }).collect();
    }
    let pente = |j: usize| (fp[j + 1] - fp[j]) / (xp[j + 1] - xp[j]);
    let mut j: isize = 0;
    x.iter()
        .map(|&v| {
            if v.is_nan() {
                return v;
            }
            j = recherche(v, xp, j);
            if j == -1 {
                lval
            } else if j == n as isize {
                rval
            } else if j == n as isize - 1 || xp[j as usize] == v {
                fp[j as usize]
            } else {
                let k = j as usize;
                let p = pente(k);
                // un NaN dans un sens (pente infinie fois zero) : l'autre
                let mut r = p * (v - xp[k]) + fp[k];
                if r.is_nan() {
                    r = p * (v - xp[k + 1]) + fp[k + 1];
                    if r.is_nan() && fp[k] == fp[k + 1] {
                        r = fp[k];
                    }
                }
                r
            }
        })
        .collect()
}

/// np.gradient(v, dt), v d'au moins deux points.
fn gradient(v: &[f64], dt: f64) -> Vec<f64> {
    let n = v.len();
    (0..n)
        .map(|k| {
            if k == 0 {
                (v[1] - v[0]) / dt
            } else if k == n - 1 {
                (v[n - 1] - v[n - 2]) / dt
            } else {
                (v[k + 1] - v[k - 1]) / (2.0 * dt)
            }
        })
        .collect()
}

fn taille(n: i64) -> Result<usize, ErreurIbis> {
    if n as f64 > MAX_ECHANTILLONS {
        return Err(ErreurIbis::plantage("MemoryError", "front trop long pour ce pas de temps"));
    }
    Ok(n.max(0) as usize)
}

/// Une forme d'onde (t, v...) sur une grille reguliere de pas dt.
fn echantillonner(table: &[[f64; 4]], col: usize, dt: f64, duree: Option<f64>) -> Result<Vec<f64>, ErreurIbis> {
    let t: Vec<f64> = table.iter().map(|r| r[0]).collect();
    let v: Vec<f64> = table.iter().map(|r| r[1 + col]).collect();
    let t0 = t[0];
    let fin = match duree {
        None => t[t.len() - 1],
        Some(d) => t0 + d,
    };
    let n = taille(plafond((fin - t0) / dt)?.saturating_add(1).max(2))?;
    let tt: Vec<f64> = (0..n).map(|k| t0 + dt * k as f64).collect();
    Ok(interp(&tt, &t, &v))
}

// `x or defaut` de Python : None et 0 sont faux
fn ou(x: Option<f64>, defaut: f64) -> f64 {
    x.filter(|v| *v != 0.0).unwrap_or(defaut)
}

/// (r_f, v_f, c_tot) de la charge d'essai d'une forme d'onde.
fn charge(tampon: &Tampon, onde: &Onde, col: usize) -> (f64, f64, f64) {
    let coin = match col {
        1 => onde.v_fixture_min,
        2 => onde.v_fixture_max,
        _ => None,
    };
    let v_f = coin.filter(|v| *v != 0.0).unwrap_or(ou(onde.v_fixture, 0.0));
    (ou(onde.r_fixture, 50.0), v_f, tampon.c_comp + ou(onde.c_fixture, 0.0))
}

fn un_moins(ku: &[f64]) -> Vec<f64> {
    ku.iter().map(|k| 1.0 - k).collect()
}

/// Ku(t) d'une seule forme d'onde, Kd = 1 - Ku. Voir l'en-tete.
fn commande_une_onde(tampon: &Tampon, onde: &Onde, col: usize, dt: f64, montant: bool) -> Result<KuKd, ErreurIbis> {
    let v = echantillonner(&onde.table, col, dt, None)?;
    let (r_f, v_f, c_tot) = charge(tampon, onde, col);
    let dvdt = gradient(&v, dt);
    let ku: Vec<f64> = (0..v.len())
        .map(|k| {
            let (i_u, _) = tampon.i_commande(v[k], 1.0, 0.0);
            let (i_d, _) = tampon.i_commande(v[k], 0.0, 1.0);
            let (i_s, _) = tampon.i_statique(v[k]);
            let reste = i_s + c_tot * dvdt[k] + (v[k] - v_f) / r_f;
            let den = i_u - i_d;
            let ku = if den.abs() > 1e-15 {
                -(i_d + reste) / den
            } else if (k != 0) == montant {
                1.0
            } else {
                0.0
            };
            ku.clamp(-0.25, 1.25)
        })
        .collect();
    let kd = un_moins(&ku);
    Ok((ku, kd))
}

/// (Ku, Kd) de deux formes d'onde sous deux charges : deux equations.
fn commande_deux_ondes(tampon: &Tampon, a: &Onde, b: &Onde, col: usize, dt: f64) -> Result<Option<KuKd>, ErreurIbis> {
    let etendue = |o: &Onde| o.table[o.table.len() - 1][0] - o.table[0][0];
    let duree = min(etendue(a), etendue(b));
    let mut va = echantillonner(&a.table, col, dt, Some(duree))?;
    let mut vb = echantillonner(&b.table, col, dt, Some(duree))?;
    let n = va.len().min(vb.len());
    va.truncate(n);
    vb.truncate(n);
    let lignes = [(a, va), (b, vb)].map(|(onde, v)| {
        let dv = gradient(&v, dt);
        (v, dv, charge(tampon, onde, col))
    });
    let (mut ku, mut kd) = (Vec::with_capacity(n), Vec::with_capacity(n));
    for k in 0..n {
        let mut m = vec![vec![0.0; 2]; 2];
        let mut y = vec![vec![0.0]; 2];
        for (r, (v, dv, (r_f, v_f, c_tot))) in lignes.iter().enumerate() {
            m[r][0] = tampon.i_commande(v[k], 1.0, 0.0).0;
            m[r][1] = tampon.i_commande(v[k], 0.0, 1.0).0;
            let (i_s, _) = tampon.i_statique(v[k]);
            y[r][0] = -(i_s + c_tot * dv[k] + (v[k] - v_f) / r_f);
        }
        let Some(x) = resoudre(m, y, f64::abs) else { return Ok(None) };
        ku.push(x[0][0]);
        kd.push(x[1][0]);
    }
    if !ku.iter().chain(&kd).all(|x| x.is_finite()) {
        return Ok(None);
    }
    let borner = |k: Vec<f64>| k.into_iter().map(|x| x.clamp(-0.25, 1.25)).collect();
    Ok(Some((borner(ku), borner(kd))))
}

/// Ku lineaire sur la duree du front tiree de [Ramp].
fn commande_rampe(m: &Modele, col: usize, dt: f64, montant: bool) -> Result<Option<KuKd>, ErreurIbis> {
    let Some(Rampe::Rapports(r)) = m.rampe.get(if montant { "r" } else { "f" }) else { return Ok(None) };
    let Some((_dv, dt_2080)) = r[col] else { return Ok(None) };
    let duree = max(dt_2080.abs() / 0.6, dt);
    let n = taille(plafond(duree / dt)?.saturating_add(1))?;
    let mut ku: Vec<f64> = (0..n).map(|k| (k as f64 * dt / duree).clamp(0.0, 1.0)).collect();
    if !montant {
        ku = un_moins(&ku);
    }
    let kd = un_moins(&ku);
    Ok(Some((ku, kd)))
}

/// {"montant": (Ku, Kd), "descendant": (Ku, Kd), "source": texte}.
///
/// Les deux tableaux sont echantillonnes au pas dt, depuis le debut du
/// front. Rend ErreurIbis si le modele ne permet pas de les construire.
pub fn commandes(m: &Modele, tampon: &Tampon, dt: f64) -> Result<Commandes, ErreurIbis> {
    let col = crate::coin(&tampon.coin).unwrap_or(0);
    let mut sources = Vec::new();
    let mut un_sens = |sens: &str, liste: &[Onde], montant: bool| -> Result<KuKd, ErreurIbis> {
        let liste: Vec<&Onde> = liste.iter().filter(|o| o.table.len() >= 2).collect();
        let mut k = None;
        if liste.len() >= 2 {
            k = commande_deux_ondes(tampon, liste[0], liste[1], col, dt)?;
            if k.is_some() {
                sources.push(format!("{sens} : deux formes d'onde"));
            }
        }
        if let (None, Some(o)) = (&k, liste.first()) {
            k = Some(commande_une_onde(tampon, o, col, dt, montant)?);
            sources.push(format!("{sens} : une forme d'onde (Kd = 1 − Ku)"));
        }
        if k.is_none() {
            k = commande_rampe(m, col, dt, montant)?;
            if k.is_some() {
                sources.push(format!("{sens} : [Ramp] seule, Ku linéaire"));
            }
        }
        k.ok_or_else(|| {
            ErreurIbis::new(
                format!("Le modèle {} n'a ni forme d'onde ni [Ramp] pour le front {}.", m.nom, sens),
                "Un émetteur IBIS doit décrire ses fronts.",
            )
        })
    };
    let montant = un_sens("montant", &m.montant, true)?;
    let descendant = un_sens("descendant", &m.descendant, false)?;
    Ok(Commandes { montant, descendant, source: sources.join(" ; ") })
}

/// Un emetteur de Thevenin ecrit comme un tampon IBIS : Ku est le front
/// gaussien de `oeil.py`, Kd = 1 - Ku, les courbes sont des droites.
///
/// C'est l'etalon des bancs (un tampon lineaire doit rendre l'oeil
/// lineaire), et l'emetteur qu'on prend quand seul le RECEPTEUR est IBIS :
/// ses diodes rendent le calcul non lineaire, et l'emetteur doit alors
/// passer par le meme pas de temps.
pub fn tampon_lineaire(r_source: f64, v_haut: f64, v_bas: f64, tr: f64, dt: f64, c_comp: f64) -> Result<(Tampon, Commandes), ErreurIbis> {
    let mut m = Modele { nom: "thevenin".into(), type_: "Output".into(), c_comp: Some([Some(c_comp); 3]), ..Modele::default() };
    m.refs.insert("pullup_ref".into(), [Some(v_haut); 3]);
    m.refs.insert("pulldown_ref".into(), [Some(v_bas); 3]);
    m.refs.insert("voltage_range".into(), [Some(v_haut); 3]);
    let vs = [-100.0, 100.0];
    m.tableaux.insert("pullup".into(), vs.iter().map(|x| [*x, -x / r_source, -x / r_source, -x / r_source]).collect());
    m.tableaux.insert("pulldown".into(), vs.iter().map(|x| [*x, x / r_source, x / r_source, x / r_source]).collect());
    let t = Tampon::new(&m, "typ")?;
    let sigma = tr / 2.5631;
    let n = taille(plafond(8.0 * sigma / dt)?.saturating_add(1))?;
    let ku: Vec<f64> = (0..n)
        .map(|k| {
            let x = k as f64 * dt;
            // SAFETY: erfc de la libm, une fonction pure sur un flottant
            0.5 * unsafe { erfc(-(x - 4.0 * sigma) / (sigma * 2f64.sqrt())) }
        })
        .collect();
    let kd = un_moins(&ku);
    let cmd = Commandes {
        montant: (ku.clone(), kd.clone()),
        descendant: (kd, ku),
        source: "émetteur de Thévenin (front gaussien)".into(),
    };
    Ok((t, cmd))
}

// (ku - a) / (b - a) >= seuil : le premier indice, 0 s'il n'y en a pas (np.argmax d'un booleen)
fn premier(ku: &[f64], a: f64, b: f64, seuil: f64) -> usize {
    ku.iter().position(|k| (k - a) / (b - a) >= seuil).unwrap_or(0)
}

/// Le temps de montee 10-90 % de Ku sur un front montant, en s.
pub fn duree_front(k: &KuKd, dt: f64) -> f64 {
    let ku = &k.0;
    let (a, b) = (ku[0], ku[ku.len() - 1]);
    if (b - a).abs() < 1e-9 {
        return dt;
    }
    let (i10, i90) = (premier(ku, a, b, 0.1) as f64, premier(ku, a, b, 0.9) as f64);
    max(dt, (i90 - i10) * dt)
}

pub fn instant_mi_front(k: &KuKd, dt: f64) -> f64 {
    let ku = &k.0;
    let (a, b) = (ku[0], ku[ku.len() - 1]);
    if (b - a).abs() < 1e-9 {
        return 0.0;
    }
    premier(ku, a, b, 0.5) as f64 * dt
}

// ==========================================================================
// La liaison dans le temps : tampon -- canal -- recepteur (voir abcd.rs pour l'en-tete)
// ==========================================================================

/// (Ku, Kd) a l'instant t du front `sens` ; hors front, l'etat.
fn k_de(cmd: &Commandes, dt: f64, etat_bas: bool, sens: Option<Front>, t: f64) -> (f64, f64) {
    let Some(sens) = sens else { return if etat_bas { (0.0, 1.0) } else { (1.0, 0.0) } };
    let (ku, kd) = cmd.front(sens);
    let i = (t / dt) as i64; // int() : vers zero
    if i >= ku.len() as i64 - 1 {
        return (ku[ku.len() - 1], kd[kd.len() - 1]);
    }
    let f = t / dt - i as f64;
    // un indice negatif de Python se compte depuis la fin
    let j = |x: i64| x.rem_euclid(ku.len() as i64) as usize;
    (ku[j(i)] + f * (ku[j(i + 1)] - ku[j(i)]), kd[j(i)] + f * (kd[j(i + 1)] - kd[j(i)]))
}

/// Le decalage dans le tableau du front `sens` ou Ku vaut deja
/// `ku_actuel` : un front qui en interrompt un autre repart de la ou
/// le premier s'est arrete, sans saut de commande.
fn depart(cmd: &Commandes, dt: f64, sens: Front, ku_actuel: f64) -> f64 {
    let ku = &cmd.front(sens).0;
    let (a, b) = (ku[0], ku[ku.len() - 1]);
    if (b - a).abs() < 1e-12 {
        return 0.0;
    }
    let x = (ku_actuel - a) / (b - a);
    if x <= 0.0 {
        return 0.0;
    }
    premier(ku, a, b, min(x, 1.0)) as f64 * dt
}

fn borne(d: f64) -> f64 {
    // Pas borne : une diode qui s'ouvre fait des sauts de pente, et
    // un Newton nu y oscille.
    let lim = 0.5;
    max(-lim, min(lim, d))
}

/// Un tampon emetteur, un canal en ondes, des diodes de reception.
///
/// `canal` : (s11, s12, s21, s22) reponses impulsionnelles au pas dt sur R0 ;
/// `emetteur` : Tampon ; `cmd` : sortie de `commandes()` ;
/// `recepteur` : Tampon (diodes seulement : sa capacite et ses resistances
/// sont deja dans le canal) ou None ; `v_ref` : la tension a laquelle
/// les ondes sont rapportees (0 en simple, le mode commun en differentiel).
#[derive(Debug, Clone)]
pub struct Liaison {
    pub s: [Vec<f64>; 4],
    pub l: usize,
    pub r0: f64,
    pub dt: f64,
    pub em: Tampon,
    pub cmd: Commandes,
    pub rx: Option<Tampon>,
    pub v_ref: f64,
    pub s0: [f64; 4],
}

impl Liaison {
    pub fn new(canal: [Vec<f64>; 4], r0: f64, dt: f64, emetteur: Tampon, cmd: Commandes, recepteur: Option<Tampon>, v_ref: f64) -> Liaison {
        let s0 = [0, 1, 2, 3].map(|q| canal[q][0]);
        Liaison { l: canal[0].len(), s: canal, r0, dt, em: emetteur, cmd, rx: recepteur, v_ref, s0 }
    }

    /// La tension a la broche du recepteur, un echantillon par pas, pour
    /// la suite de `bits` (0/1) emise a raison d'un bit par UI. Le bit n
    /// bascule a l'instant n UI. Rend (v1, v2) en volts absolus.
    pub fn simuler(&self, bits: &[i32], spu_sim: usize, _ui: f64) -> (Vec<f64>, Vec<f64>) {
        let n_pas = bits.len() * spu_sim;
        if bits.is_empty() {
            return (Vec::new(), Vec::new());
        }
        let dt = self.dt;
        let l = self.l;
        // -- le point de repos du premier bit -------------------------------
        let mut etat_bas = bits[0] == 0;
        let (ku0, kd0) = k_de(&self.cmd, dt, etat_bas, None, 0.0);
        let s_dc = [0, 1, 2, 3].map(|q| somme(&self.s[q]));
        // Le continu : pas de C_comp (v_prec absent), les reponses sommees.
        let (mut a1, mut a2) = self.newton(ku0, kd0, 0.0, 0.0, &s_dc, None, None);
        let mut aa1 = vec![a1; l - 1 + n_pas];
        let mut aa2 = vec![a2; l - 1 + n_pas];
        let mut v1_prec = a1 + s_dc[0] * a1 + s_dc[1] * a2;
        let mut v2_prec = a2 + s_dc[2] * a1 + s_dc[3] * a2;
        let (mut v1, mut v2) = (Vec::with_capacity(n_pas), Vec::with_capacity(n_pas));
        let (mut sens, mut t_front, mut ku_cour) = (None, 0.0, ku0);
        // Les noyaux renverses, pour l'histoire : sum_k>=1 s[k] a[n-k].
        let histoire = |q: usize, a: &[f64], n: usize| -> f64 {
            self.s[q][1..].iter().rev().zip(&a[n..n + l - 1]).map(|(h, x)| h * x).sum()
        };
        for n in 0..n_pas {
            let (ib, ph) = (n / spu_sim, n % spu_sim);
            if ph == 0 && ib > 0 && bits[ib] != bits[ib - 1] {
                let f = if bits[ib] != 0 { Front::Montant } else { Front::Descendant };
                sens = Some(f);
                t_front = depart(&self.cmd, dt, f, ku_cour);
                etat_bas = bits[ib] == 0;
            } else if sens.is_some() {
                t_front += dt;
            }
            let (ku, kd) = k_de(&self.cmd, dt, etat_bas, sens, t_front);
            ku_cour = ku;
            let j = n + l - 1;
            let h1 = histoire(0, &aa1, n) + histoire(1, &aa2, n);
            let h2 = histoire(2, &aa1, n) + histoire(3, &aa2, n);
            (a1, a2) = self.newton(ku, kd, h1, h2, &self.s0, Some((v1_prec, v2_prec)), Some((a1, a2)));
            (aa1[j], aa2[j]) = (a1, a2);
            let b1 = self.s0[0] * a1 + self.s0[1] * a2 + h1;
            let b2 = self.s0[2] * a1 + self.s0[3] * a2 + h2;
            (v1_prec, v2_prec) = (a1 + b1, a2 + b2);
            v1.push(v1_prec + self.v_ref);
            v2.push(v2_prec + self.v_ref);
        }
        (v1, v2)
    }

    /// Les ondes entrantes (a1, a2) qui satisfont les deux bouts.
    #[allow(clippy::too_many_arguments)]
    fn newton(&self, ku: f64, kd: f64, h1: f64, h2: f64, s: &[f64; 4], v_prec: Option<(f64, f64)>, a: Option<(f64, f64)>) -> (f64, f64) {
        let (r0, dt) = (self.r0, self.dt);
        let cc = if v_prec.is_some() { self.em.c_comp } else { 0.0 };
        let v1_prec = v_prec.map_or(0.0, |v| v.0);
        let (mut a1, mut a2) = a.unwrap_or((0.0, 0.0));
        for _ in 0..60 {
            let b1 = s[0] * a1 + s[1] * a2 + h1;
            let b2 = s[2] * a1 + s[3] * a2 + h2;
            let (v1, v2) = (a1 + b1, a2 + b2);
            let (mut i_e, mut g_e) = self.em.i_total(v1 + self.v_ref, ku, kd);
            if cc != 0.0 {
                i_e += cc * (v1 - v1_prec) / dt;
                g_e += cc / dt;
            }
            let (i_r, g_r) = match &self.rx {
                Some(rx) => rx.i_statique(v2 + self.v_ref),
                None => (0.0, 0.0),
            };
            // F1 = (a1 - b1)/R0 + I_e(V1) ; F2 = (a2 - b2)/R0 + I_r(V2)
            let f1 = (a1 - b1) / r0 + i_e;
            let f2 = (a2 - b2) / r0 + i_r;
            let j11 = (1.0 - s[0]) / r0 + g_e * (1.0 + s[0]);
            let j12 = -s[1] / r0 + g_e * s[1];
            let j21 = -s[2] / r0 + g_r * s[2];
            let j22 = (1.0 - s[3]) / r0 + g_r * (1.0 + s[3]);
            let det = j11 * j22 - j12 * j21;
            if det.abs() < 1e-30 {
                break;
            }
            let d1 = borne((f1 * j22 - f2 * j12) / det);
            let d2 = borne((j11 * f2 - j21 * f1) / det);
            a1 -= d1;
            a2 -= d2;
            if d1.abs() < 1e-10 && d2.abs() < 1e-10 {
                break;
            }
        }
        (a1, a2)
    }
}

/// Deux tampons, la paire en ondes par brin, deux recepteurs.
///
/// `canal` : 4 x 4 reponses impulsionnelles au pas dt (acces 1p, 1n, 2p,
/// 2n) ; `emetteurs`, `cmds`, `recepteurs` : un par brin (p, n) ;
/// `decalages` : le retard de chaque brin sur la sequence (s) -- tdelay.
#[derive(Debug, Clone)]
pub struct LiaisonPaire {
    pub s: [[Vec<f64>; 4]; 4],
    pub l: usize,
    pub r0: f64,
    pub dt: f64,
    pub em: [Tampon; 2],
    pub cmd: [Commandes; 2],
    pub rx: [Option<Tampon>; 2],
    pub dec: [f64; 2],
    pub s0: [[f64; 4]; 4],
    s0_12: [[f64; 2]; 2],
    s0_21: [[f64; 2]; 2],
    s0_1: [f64; 4],
    s0_2: [f64; 4],
    lin_2: Option<[[f64; 2]; 2]>,
}

impl LiaisonPaire {
    /// (`recepteurs` : (None, None) et `decalages` : (0, 0) dans ibis.py quand ils ne sont pas donnes.)
    pub fn new(
        canal: [[Vec<f64>; 4]; 4], r0: f64, dt: f64, emetteurs: [Tampon; 2], cmds: [Commandes; 2],
        recepteurs: [Option<Tampon>; 2], decalages: [f64; 2],
    ) -> Result<LiaisonPaire, ErreurIbis> {
        let d0 = min(decalages[0], decalages[1]);
        let s0: [[f64; 4]; 4] = std::array::from_fn(|i| std::array::from_fn(|j| canal[i][j][0]));
        // LES DEUX BOUTS SE RESOLVENT A TOUR DE ROLE : ce qui traverse la
        // paire en un pas n'est que le reste de la fenetre (1e-3 au plus
        // quand la ligne est plus longue que le pas). Deux Newton 2x2 en
        // scalaires, l'un apres l'autre, chacun avec la derniere valeur de
        // l'autre bout, jusqu'a ce que rien ne bouge -- trois fois plus
        // vite que le Newton 4x4 en numpy, qui reste le recours. Un bout
        // sans diode est lineaire, et se resout d'un produit.
        let mut lin_2 = None;
        if recepteurs[0].is_none() && recepteurs[1].is_none() {
            // (I - S22) a2 = h2
            let m = vec![vec![1.0 - s0[2][2], -s0[2][3]], vec![-s0[3][2], 1.0 - s0[3][3]]];
            let x = resoudre(m, vec![vec![1.0, 0.0], vec![0.0, 1.0]], f64::abs)
                .ok_or_else(|| ErreurIbis::plantage("LinAlgError", "Singular matrix"))?;
            lin_2 = Some([[x[0][0], x[0][1]], [x[1][0], x[1][1]]]);
        }
        Ok(LiaisonPaire {
            l: canal[0][0].len(),
            s: canal,
            r0,
            dt,
            em: emetteurs,
            cmd: cmds,
            rx: recepteurs,
            dec: decalages.map(|x| x - d0),
            s0,
            s0_12: [[s0[0][2], s0[0][3]], [s0[1][2], s0[1][3]]],
            s0_21: [[s0[2][0], s0[2][1]], [s0[3][0], s0[3][1]]],
            s0_1: [s0[0][0], s0[0][1], s0[1][0], s0[1][1]],
            s0_2: [s0[2][2], s0[2][3], s0[3][2], s0[3][3]],
            lin_2,
        })
    }

    /// Pour chaque brin, {pas: (sens, avance)} : le brin n emet
    /// l'inverse, chaque brin bascule a n UI + son decalage.
    fn evenements(&self, bits: &[i32], spu_sim: usize, n_pas: usize) -> [Vec<Option<(Front, f64)>>; 2] {
        let dt = self.dt;
        [0, 1].map(|x| {
            let mut ev = vec![None; n_pas];
            let b: Vec<i32> = if x == 0 { bits.to_vec() } else { bits.iter().map(|v| 1 - v).collect() };
            for ib in 1..b.len() {
                if b[ib] == b[ib - 1] {
                    continue;
                }
                let t_s = (ib * spu_sim) as f64 * dt + self.dec[x];
                let n_s = (t_s / dt - 1e-9).ceil();
                if n_s >= 0.0 && n_s < n_pas as f64 {
                    ev[n_s as usize] = Some((if b[ib] != 0 { Front::Montant } else { Front::Descendant }, n_s * dt - t_s));
                }
            }
            ev
        })
    }

    /// Les quatre tensions (4, n_pas) -- broche p et n de l'emetteur,
    /// puis du recepteur, au die --, en volts absolus.
    pub fn simuler(&self, bits: &[i32], spu_sim: usize, _ui: f64) -> [Vec<f64>; 4] {
        let n_pas = bits.len() * spu_sim;
        let mut sortie: [Vec<f64>; 4] = Default::default();
        if bits.is_empty() {
            return sortie;
        }
        let (dt, l) = (self.dt, self.l);
        let ev = self.evenements(bits, spu_sim, n_pas);
        let mut etat_bas = [bits[0] == 0, bits[0] == 1];
        let mut sens = [None, None];
        let mut t_front = [0.0, 0.0];
        let (mut ku, mut kd) = ([0.0, 0.0], [0.0, 0.0]);
        for x in 0..2 {
            (ku[x], kd[x]) = k_de(&self.cmd[x], dt, etat_bas[x], None, 0.0);
        }
        let mut ku_cour = ku;
        let s_dc: [[f64; 4]; 4] = std::array::from_fn(|i| std::array::from_fn(|j| somme(&self.s[i][j])));
        let fois = |s: &[[f64; 4]; 4], a: &[f64; 4]| -> [f64; 4] { std::array::from_fn(|i| (0..4).map(|j| s[i][j] * a[j]).sum()) };
        let mut a = self.newton(&ku, &kd, &[0.0; 4], &s_dc, None, None);
        let mut aa = vec![a; l - 1 + n_pas];
        let sa = fois(&s_dc, &a);
        let mut v_prec: [f64; 4] = std::array::from_fn(|i| a[i] + sa[i]);
        for n in 0..n_pas {
            for x in 0..2 {
                if let Some((f, avance)) = ev[x][n] {
                    sens[x] = Some(f);
                    t_front[x] = depart(&self.cmd[x], dt, f, ku_cour[x]) + avance;
                    etat_bas[x] = f == Front::Descendant;
                } else if sens[x].is_some() {
                    t_front[x] += dt;
                }
                (ku[x], kd[x]) = k_de(&self.cmd[x], dt, etat_bas[x], sens[x], t_front[x]);
                ku_cour[x] = ku[x];
            }
            let j = n + l - 1;
            // LE NOYAU A PLAT : l'histoire A[j-L+1:j] (L-1 lignes, 4 colonnes)
            // se lit d'un seul produit, K[i, 4k + j] = s_ij[L-1-k].
            let mut h = [0.0; 4];
            for (i, hi) in h.iter_mut().enumerate() {
                for k in 0..l - 1 {
                    let ligne = &aa[n + k];
                    for c in 0..4 {
                        *hi += self.s[i][c][l - 1 - k] * ligne[c];
                    }
                }
            }
            a = match self.deux_bouts(&ku, &kd, &h, &v_prec, &a) {
                Some(x) => x,
                None => self.newton(&ku, &kd, &h, &self.s0, Some(&v_prec), Some(&a)),
            };
            aa[j] = a;
            let sa = fois(&self.s0, &a);
            v_prec = std::array::from_fn(|i| a[i] + sa[i] + h[i]);
            for i in 0..4 {
                sortie[i].push(v_prec[i]);
            }
        }
        sortie
    }

    /// Les quatre ondes entrantes, bout par bout, a tour de role ; None
    /// si cela ne converge pas.
    fn deux_bouts(&self, ku: &[f64; 2], kd: &[f64; 2], h: &[f64; 4], v_prec: &[f64; 4], a: &[f64; 4]) -> Option<[f64; 4]> {
        let dt = self.dt;
        let tampons = |x: usize, v: f64| {
            let (mut i, mut g) = self.em[x].i_total(v, ku[x], kd[x]);
            let cc = self.em[x].c_comp;
            if cc != 0.0 {
                i += cc * (v - v_prec[x]) / dt;
                g += cc / dt;
            }
            (i, g)
        };
        let diodes = |x: usize, v: f64| self.rx[x].as_ref().map_or((0.0, 0.0), |r| r.i_statique(v));
        let [[c00, c01], [c10, c11]] = self.s0_12;
        let [[e00, e01], [e10, e11]] = self.s0_21;
        let [h0, h1, h2, h3] = *h;
        let [mut a0, mut a1, mut a2, mut a3] = *a;
        for _ in 0..30 {
            let (p0, p1) = (a0, a1);
            (a0, a1) = self.newton2(&self.s0_1, h0 + c00 * a2 + c01 * a3, h1 + c10 * a2 + c11 * a3, tampons, a0, a1);
            let (g0, g1) = (h2 + e00 * a0 + e01 * a1, h3 + e10 * a0 + e11 * a1);
            let (n2, n3) = match self.lin_2 {
                Some([[l00, l01], [l10, l11]]) => (l00 * g0 + l01 * g1, l10 * g0 + l11 * g1),
                None => self.newton2(&self.s0_2, g0, g1, diodes, a2, a3),
            };
            let fini = (n2 - a2).abs() < 1e-11 && (n3 - a3).abs() < 1e-11 && (a0 - p0).abs() < 1e-11 && (a1 - p1).abs() < 1e-11;
            (a2, a3) = (n2, n3);
            if fini {
                return Some([a0, a1, a2, a3]);
            }
        }
        None
    }

    /// Un bout de la paire : deux ondes, deux equations, en scalaires --
    /// le Newton de `Liaison`, les deux brins a la place des deux bouts.
    fn newton2(&self, s: &[f64; 4], h0: f64, h1: f64, courant: impl Fn(usize, f64) -> (f64, f64), mut a0: f64, mut a1: f64) -> (f64, f64) {
        let r0 = self.r0;
        let [s00, s01, s10, s11] = *s;
        for _ in 0..60 {
            let b0 = s00 * a0 + s01 * a1 + h0;
            let b1 = s10 * a0 + s11 * a1 + h1;
            let (i0, g0) = courant(0, a0 + b0);
            let (i1, g1) = courant(1, a1 + b1);
            let f0 = (a0 - b0) / r0 + i0;
            let f1 = (a1 - b1) / r0 + i1;
            let j00 = (1.0 - s00) / r0 + g0 * (1.0 + s00);
            let j01 = -s01 / r0 + g0 * s01;
            let j10 = -s10 / r0 + g1 * s10;
            let j11 = (1.0 - s11) / r0 + g1 * (1.0 + s11);
            let det = j00 * j11 - j01 * j10;
            if det.abs() < 1e-30 {
                break;
            }
            let d0 = borne((f0 * j11 - f1 * j01) / det);
            let d1 = borne((j00 * f1 - j10 * f0) / det);
            a0 -= d0;
            a1 -= d1;
            if d0.abs() < 1e-10 && d1.abs() < 1e-10 {
                break;
            }
        }
        (a0, a1)
    }

    /// Les quatre ondes entrantes qui satisfont les quatre acces.
    fn newton(&self, ku: &[f64; 2], kd: &[f64; 2], h: &[f64; 4], s: &[[f64; 4]; 4], v_prec: Option<&[f64; 4]>, a: Option<&[f64; 4]>) -> [f64; 4] {
        let (r0, dt) = (self.r0, self.dt);
        let mut a = a.copied().unwrap_or([0.0; 4]);
        let un = |i: usize, j: usize| if i == j { 1.0 } else { 0.0 };
        let (mut i, mut g) = ([0.0; 4], [0.0; 4]);
        for _ in 0..60 {
            let b: [f64; 4] = std::array::from_fn(|r| (0..4).map(|c| s[r][c] * a[c]).sum::<f64>() + h[r]);
            let v: [f64; 4] = std::array::from_fn(|r| a[r] + b[r]);
            for x in 0..2 {
                let em = &self.em[x];
                let (mut ie, mut ge) = em.i_total(v[x], ku[x], kd[x]);
                if let (Some(vp), true) = (v_prec, em.c_comp != 0.0) {
                    ie += em.c_comp * (v[x] - vp[x]) / dt;
                    ge += em.c_comp / dt;
                }
                (i[x], g[x]) = (ie, ge);
                if let Some(rx) = &self.rx[x] {
                    (i[2 + x], g[2 + x]) = rx.i_statique(v[2 + x]);
                }
            }
            let f: Vec<Vec<f64>> = (0..4).map(|r| vec![(a[r] - b[r]) / r0 + i[r]]).collect();
            let jac: Vec<Vec<f64>> =
                (0..4).map(|r| (0..4).map(|c| (un(r, c) - s[r][c]) / r0 + g[r] * (un(r, c) + s[r][c])).collect()).collect();
            let Some(d) = resoudre(jac, f, f64::abs) else { break };
            // Pas borne, comme pour la ligne seule.
            let d: [f64; 4] = std::array::from_fn(|r| d[r][0].clamp(-0.5, 0.5));
            for r in 0..4 {
                a[r] -= d[r];
            }
            if d.iter().all(|x| x.abs() < 1e-10) {
                break;
            }
        }
        a
    }
}
