//! Les briques : sequences, CTLE, transfert, condensateurs de liaison, grille, reponse a un
//! echelon, jauge d'un gabarit.

use std::f64::consts::PI;

use em::obj;
use em::simulation_em::base::*;

use crate::np::*;
use crate::{ErreurOeil, Res, M2, M4, MAX_FREQS, TR_SUR_SIGMA};

pub(crate) fn re(x: f64) -> Complex64 {
    Complex64::new(x, 0.0)
}

pub(crate) const UN: Complex64 = Complex64::new(1.0, 0.0);

/// a @ b, deux matrices carrees.
pub(crate) fn mul<const N: usize>(a: &[[Complex64; N]; N], b: &[[Complex64; N]; N]) -> [[Complex64; N]; N] {
    let mut m = [[ZERO; N]; N];
    for i in 0..N {
        for j in 0..N {
            for k in 0..N {
                m[i][j] += a[i][k] * b[k][j];
            }
        }
    }
    m
}

/// a @ b, deux piles de matrices.
pub(crate) fn mul_n<const N: usize>(a: &[[[Complex64; N]; N]], b: &[[[Complex64; N]; N]]) -> Vec<[[Complex64; N]; N]> {
    a.iter().zip(b).map(|(x, y)| mul(x, y)).collect()
}

/// « %.Nf » de Python.
pub(crate) fn pf(x: f64, n: usize) -> String {
    if x.is_nan() {
        return "nan".into();
    }
    if x.is_infinite() {
        return if x > 0.0 { "inf" } else { "-inf" }.into();
    }
    format!("{:.*}", n, x)
}

/// Une periode de la sequence PRBS `ordre` (7, 9 ou 15), en 0/1.
///
/// Registres a decalage des polynomes usuels : x^7+x^6+1, x^9+x^5+1,
/// x^15+x^14+1 (ITU-T O.150). Periode 2^ordre - 1.
pub fn prbs(ordre: i64) -> Res<Vec<i32>> {
    let (a, b) = match ordre {
        7 => (7, 6),
        9 => (9, 5),
        15 => (15, 14),
        _ => return Err(ErreurOeil::new(format!("Motif PRBS{ordre} inconnu."), "Choisissez PRBS7, PRBS9 ou PRBS15.")),
    };
    let n: u32 = (1 << ordre) - 1;
    let mut reg = n; // tous les bits a 1
    let mut bits = Vec::with_capacity(n as usize);
    for _ in 0..n {
        let nouveau = ((reg >> (a - 1)) ^ (reg >> (b - 1))) & 1;
        bits.push((reg & 1) as i32);
        reg = ((reg << 1) | nouveau) & n;
    }
    Ok(bits)
}

// float(spec[cle]) d'un reglage que `_params` a deja rendu numerique
fn fl(spec: &Json, cle: &str) -> f64 {
    nb(&spec[cle])
}

/// La reponse du CTLE `spec` sur `freqs` (Hz), complexe.
///
/// Deux formes, normalisees a un gain continu Adc :
///   usb3   Adc * wp1 wp2 / wz * (s + wz) / ((s + wp1)(s + wp2))
///   pcie3  wp2 * (s + Adc wp1) / ((s + wp1)(s + wp2)) -- gain 1 en haut
pub fn ctle(freqs: &[f64], spec: &Json) -> Vec<Complex64> {
    let wp1 = 2.0 * PI * fl(spec, "fp1");
    let wp2 = 2.0 * PI * fl(spec, "fp2");
    let s = |f: f64| Complex64::new(0.0, 2.0 * PI * f);
    if spec["forme"].as_str() == Some("pcie3") {
        let adc = 10f64.powf(fl(spec, "adc_db") / 20.0);
        return freqs.iter().map(|f| (s(*f) + adc * wp1) * wp2 / ((s(*f) + wp1) * (s(*f) + wp2))).collect();
    }
    let adc = _gain_continu_ctle(Some(spec));
    let wz = 2.0 * PI * fl(spec, "fz");
    let k = adc * wp1 * wp2 / wz;
    freqs.iter().map(|f| (s(*f) + wz) * k / ((s(*f) + wp1) * (s(*f) + wp2))).collect()
}

pub fn _gain_continu_ctle(spec: Option<&Json>) -> f64 {
    let Some(spec) = spec.filter(|s| s.vrai()) else { return 1.0 };
    if spec["forme"].as_str() == Some("pcie3") {
        return 10f64.powf(fl(spec, "adc_db") / 20.0);
    }
    match spec.get("adc") {
        Some(a) => nb(a),
        None => 10f64.powf(numd(spec, "adc_db", 0.0) / 20.0),
    }
}

/// LA RESISTANCE SERIE CONTINUE de la cascade : au continu une ligne
/// n'est plus que sa resistance serie, que la partie reelle de B au premier
/// point approche -- trop haut, l'effet de peau y est deja (1,3 a 2,6 fois
/// la resistance continue). `exces` est ce surplus, celui de la ligne seule
/// (`analyser` le pose dans `p["exces_continu"]`, d'apres le `r_continu`
/// de `simulation_em`) : boitiers et condensateurs poses autour gardent
/// leur part.
pub fn r_continu(abcds: &[M2], exces: f64) -> f64 {
    match abcds.first() {
        Some(m) => maxf(&[0.0, m[0][1].re - exces]),
        None => 0.0,
    }
}

fn g_charge(r_charge: f64) -> f64 {
    if r_charge != 0.0 && r_charge < 1e9 {
        1.0 / r_charge
    } else {
        0.0
    }
}

/// V_charge / V_generateur a travers la cascade ABCD, sur `freqs`.
///
///     H = 1 / (A + B Y_L + Z_s (C + D Y_L)),  Y_L = 1/R_L + j w C_L
///
/// R_L nul ou infini : haute impedance, il ne reste que la capacite.
/// `exces` : voir `r_continu`.
pub fn transfert(abcds: &[M2], freqs: &[f64], r_source: f64, r_charge: f64, c_charge: f64, exces: f64) -> (Vec<Complex64>, f64) {
    let g_l = g_charge(r_charge);
    let h = abcds
        .iter()
        .zip(freqs)
        .map(|(m, f)| {
            let (a, b, c, d) = (m[0][0], m[0][1], m[1][0], m[1][1]);
            let w = 2.0 * PI * f;
            let y_l = Complex64::new(g_l, w * c_charge);
            UN / (a + b * y_l + (c + d * y_l) * r_source)
        })
        .collect();
    // LE CONTINU : la resistance serie de la cascade (`r_continu`).
    let r_ligne = r_continu(abcds, exces);
    let h0 = 1.0 / (1.0 + (r_ligne + r_source) * g_l);
    (h, h0)
}

/// Les condensateurs de liaison, tels que `couplage_ac` les rend.
#[derive(Debug, Clone, PartialEq)]
pub struct CouplageAc {
    pub c: f64,
    pub esr: f64,
    pub esl: f64,
    pub boitier: Option<String>,
    pub position: String,
    pub c_x: f64,
    pub f_c: Option<f64>,
    pub tau: Option<f64>,
}

impl CouplageAc {
    pub fn json(&self) -> Json {
        obj! {"c" => self.c, "esr" => self.esr, "esl" => self.esl, "boitier" => self.boitier.clone(),
              "position" => &self.position, "c_x" => self.c_x, "f_c" => self.f_c, "tau" => self.tau}
    }

    /// `ca["tau"]` pris pour vrai : une constante de decharge, et non nulle.
    pub fn tau_vrai(&self) -> Option<f64> {
        self.tau.filter(|t| *t != 0.0)
    }
}

/// Le pole lent des condensateurs de liaison : {h0, tau}.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Lent {
    pub h0: f64,
    pub tau: f64,
}

/// La case du continu de l'IFFT quand la cascade porte des condensateurs
/// de liaison (voir l'en-tete « LES CONDENSATEURS DE LIAISON ») : le
/// transfert au continu avec `resistance_continu_ac` a la place du
/// condensateur -- la boucle de decharge est R_s + R_ligne + R_L --, ou,
/// sans terminaison, le pont diviseur C_x / (C_x + C_L). `transfert` rend
/// le continu SANS condensateur, celui autour duquel l'oeil se centre.
pub fn continu_couplage_ac(ca: &CouplageAc, abcds: &[M2], freqs: &[f64], r_source: f64, r_charge: f64, c_charge: f64, exces: f64) -> f64 {
    let g_l = g_charge(r_charge);
    let r_ligne = r_continu(abcds, exces);
    if g_l <= 0.0 {
        return if c_charge > 0.0 { ca.c_x / (ca.c_x + c_charge) } else { 1.0 };
    }
    let r_x = resistance_continu_ac(ca.c_x, r_ligne + r_source + 1.0 / g_l, 1.0 / (freqs[1] - freqs[0]));
    1.0 / (1.0 + (r_ligne + r_x + r_source) * g_l)
}

/// (h0_bin, lent) d'une cascade simple (ou du mode impair) qui porte des
/// condensateurs de liaison : `lent` {h0, tau} quand une terminaison les
/// decharge -- le pole lent, separe exactement par
/// `reponse_indicielle_ac` --, sinon la case du pont diviseur
/// (`continu_couplage_ac`). (None, None) sans condensateur.
pub fn _continu_ac_simple(ca: Option<&CouplageAc>, abcds: &[M2], freqs: &[f64], p: &crate::Params) -> (Option<f64>, Option<Lent>) {
    let Some(ca) = ca else { return (None, None) };
    let exces = p.exces_continu;
    let h0_bin = continu_couplage_ac(ca, abcds, freqs, p.r_source, p.r_charge, p.c_charge, exces);
    if !(0.0 < p.r_charge && p.r_charge < 1e9) {
        return (Some(h0_bin), None);
    }
    let r_tot = r_continu(abcds, exces) + p.r_source + p.r_charge;
    let (_, h0) = transfert(&abcds[..1.min(abcds.len())], &freqs[..1.min(freqs.len())], p.r_source, p.r_charge, p.c_charge, exces);
    (Some(h0_bin), Some(Lent { h0, tau: ca.c_x * r_tot }))
}

/// `reponse_indicielle` d'un transfert qui porte le POLE LENT des
/// condensateurs de liaison (voir « LES CONDENSATEURS DE LIAISON »), sa
/// decharge comptee EXACTEMENT, quelle que soit la fenetre.
///
/// Au-dessous des frequences de la ligne, le canal n'est que la boucle
/// R_tot et C_x : H = h0 s tau / (1 + s tau) = h0 - h0 / (1 + s tau), h0
/// son continu SANS condensateur. Le terme -h0 / (1 + s tau) est le seul
/// qui deborde la fenetre ; on le retire du spectre -- ce qui reste n'a
/// plus de pole lent, sa case du continu vaut h0 et l'IFFT ne replie
/// rien -- et l'on rajoute sa reponse a un echelon, connue :
/// -h0 (1 - exp(-t / tau)), au retard du front gaussien.
pub fn reponse_indicielle_ac(freqs: &[f64], h: &[Complex64], h0: f64, tr: f64, n_fft_min: usize, tau: f64) -> (f64, Vec<f64>) {
    let reste: Vec<Complex64> = h
        .iter()
        .zip(freqs)
        .map(|(h, f)| {
            let w = 2.0 * PI * f;
            h - re(-h0) / Complex64::new(1.0, w * tau)
        })
        .collect();
    let (dt, s) = reponse_indicielle(freqs, &reste, h0, tr, n_fft_min);
    let s = s
        .iter()
        .enumerate()
        .map(|(i, v)| {
            let t = i as f64 * dt - 4.0 * tr / TR_SUR_SIGMA;
            v - h0 * (1.0 - (-maxf(&[t, 0.0]) / tau).exp())
        })
        .collect();
    (dt, s)
}

/// La matrice ABCD d'une ligne uniforme, pour les bancs et les essais.
///
/// `pertes_db_ghz` : pertes en dB a 1 GHz, proportionnelles a la racine de
/// la frequence (effet de peau seul).
pub fn ligne_ideale(freqs: &[f64], z0: f64, retard: f64, pertes_db_ghz: f64) -> Vec<M2> {
    freqs
        .iter()
        .map(|f| {
            let alpha_l = pertes_db_ghz / 8.686 * (f / 1e9).sqrt();
            let gl = Complex64::new(alpha_l, 2.0 * PI * f * retard);
            let (ch, sh) = (gl.cosh(), gl.sinh());
            [[ch, sh * z0], [sh / z0, ch]]
        })
        .collect()
}

// ==========================================================================
// LES CONDENSATEURS DE LIAISON (couplage AC, 2.3.0)
// --------------------------------------------------------------------------
// Un condensateur en SERIE sur chaque brin, entre l'emetteur et le canal ou
// entre le canal et le recepteur : Z = ESR + j w ESL + 1 / (j w C). Il coupe
// le continu -- la coupure basse est f_c = 1 / (2 pi C_x (R_tx + R_rx)), C_x
// le condensateur que la boucle voit : C en simple, C/2 en differentiel (les
// deux brins en serie) -- et, au-dessus, il laisse passer la ligne telle
// quelle. Ce qu'il fait a l'oeil : une longue suite de bits identiques se
// decharge dans R_tx + R_rx avec tau = C_x (R_tx + R_rx) ; le niveau derive
// (« droop », « baseline wander ») de UI / tau par bit, et le bit qui suit
// la suite part d'un niveau fausse. Le pire cas (PDA) le compte sur toute la
// memoire de la fenetre, le PRBS sur ses plus longues suites.
//
// LE CONTINU DANS L'IFFT. Les S sont echantillonnes a partir de df = 1 / T_w
// (T_w la fenetre) ; en dessous, c'est la case du continu qui dit ce que la
// reponse fait de lent. Avec un condensateur, H(0) = 0 -- mais poser 0 dans
// la case du continu force la reponse a revenir a zero DANS la fenetre : la
// decharge, qui dure tau >> T_w, serait etalee sur T_w (repliement). La case
// du continu doit porter l'integrale de la reponse SUR LA FENETRE, c'est-a-
// dire la reponse a un echelon a t = T_w : h0 . exp(-T_w / tau). On l'obtient
// en remplacant le condensateur, au continu seulement, par la resistance
// R_x = R_tot (exp(T_w / tau) - 1) -- T_w / C quand tau >> T_w : la tension
// moyenne d'un condensateur charge par I pendant T_w --, R_tot la resistance
// de la boucle de decharge. Les cases k >= 1 sont exactes ; l'erreur restante
// est du second ordre en T_w / tau (jusqu'a ~4 % quand T_w ~ tau). Quand
// tau << T_w, R_x -> infini et le continu vaut 0, exactement ce que H(0) dit.
//
// LE POLE LENT SEPARE (2.4.0), pour tous les chemins lineaires -- simple,
// paire par brin, reponse que lit l'AMI. Au-dessous des frequences de la
// ligne, le canal n'est que la boucle : H = h0 - h0 / (1 + s tau). On retire
// ce terme du spectre, ce qui reste n'a plus de pole lent et ne replie rien,
// et l'on rajoute sa reponse a un echelon, connue, -h0 (1 - exp(-t / tau)) :
// la decharge est EXACTE quelle que soit la fenetre (4e-4 quand T_w ~ tau,
// contre 4e-2 par la case corrigee) -- `reponse_indicielle_ac`. La case
// corrigee ne sert plus qu'aux tampons IBIS simules dans le temps, dont les
// reponses sont bornees a la fenetre : une decharge plus longue n'y tient
// pas, et le resultat le dit. Sans terminaison, rien ne decharge : le
// condensateur et C_L font un pont diviseur, en simple comme pour la paire
// par brin.
// ==========================================================================

// L'inductance serie (ESL) montee des boitiers CMS usuels, EN HENRYS -- ce
// que les fiches de condensateurs donnent (pastilles comprises).
pub const ESL_BOITIERS: [(&str, f64); 6] =
    [("01005", 0.2e-9), ("0201", 0.25e-9), ("0402", 0.4e-9), ("0603", 0.6e-9), ("0805", 0.8e-9), ("1206", 1.0e-9)];
pub const POSITIONS_AC: [&str; 2] = ["emetteur", "recepteur"];

/// ESL_BOITIERS.get(boitier)
pub fn esl_boitier(boitier: &str) -> Option<f64> {
    ESL_BOITIERS.iter().find(|(k, _)| *k == boitier).map(|(_, v)| *v)
}

/// Les condensateurs de liaison du document, ou None s'il n'y en a pas.
///
/// `spec` {c (F, par brin), esr (ohm), esl (H), boitier ("0402"...),
/// position "emetteur"|"recepteur"} -> {c, esr, esl, boitier, position,
/// c_x, f_c, tau} : C_x le condensateur vu par la boucle, f_c la coupure
/// basse, tau la constante de decharge (None sans terminaison : rien ne
/// decharge, le condensateur et C_L font un pont diviseur).
/// (`p` : ce que Python y lisait -- mode, r_source, r_charge.)
pub fn couplage_ac(spec: &Json, mode: &str, r_source: f64, r_charge: f64) -> Res<Option<CouplageAc>> {
    if spec.as_objet().is_none() {
        return Ok(None);
    }
    let c = _nombre(&spec["c"], 0.0);
    if !(c > 0.0) {
        return Ok(None);
    }
    if c > 1.0 {
        return Err(ErreurOeil::new(
            format!("Condensateur de liaison de {} F : la valeur se saisit en farads.", fmt_g(c, 3)),
            "100 nF s'écrit 1e-7.",
        ));
    }
    let boitier = py::strip(&str_ou_vide(&spec["boitier"])).to_string();
    let mut esl = _nombre(&spec["esl"], -1.0);
    if esl < 0.0 {
        esl = esl_boitier(&boitier).unwrap_or(0.0);
    }
    let esr = maxf(&[0.0, _nombre(&spec["esr"], 0.0)]);
    let position = if spec["position"].vrai() { str_py(&spec["position"]) } else { "emetteur".to_string() }.to_lowercase();
    if !POSITIONS_AC.contains(&position.as_str()) {
        return Err(ErreurOeil::new(
            format!("Position « {position} » des condensateurs de liaison inconnue."),
            "« emetteur » (entre l'émetteur et la piste) ou « recepteur » (entre la piste et le récepteur).",
        ));
    }
    let c_x = if mode == "diff" { c / 2.0 } else { c };
    let r_l = r_charge;
    let (mut tau, mut f_c) = (None, None);
    if 0.0 < r_l && r_l < 1e9 {
        let t = c_x * (r_source + r_l);
        tau = Some(t);
        f_c = Some(1.0 / (2.0 * PI * t));
    }
    Ok(Some(CouplageAc { c, esr, esl, boitier: if boitier.is_empty() { None } else { Some(boitier) }, position, c_x, f_c, tau }))
}

/// Z (N,) d'un condensateur de liaison, par brin : ESR + j w ESL
/// + 1 / (j w C).
pub fn impedance_couplage_ac(freqs: &[f64], ca: &CouplageAc) -> Vec<Complex64> {
    freqs
        .iter()
        .map(|f| {
            let w = 2.0 * PI * f;
            Complex64::new(ca.esr, w * ca.esl - 1.0 / (w * ca.c))
        })
        .collect()
}

/// (N, 2, 2) des condensateurs de liaison : Z en serie par brin ; en mode
/// impair (V_d = V_p - V_n, I_d = (I_p - I_n) / 2) la paire en voit 2 Z,
/// en mode commun (V_c, I_c = I_p + I_n) Z / 2.
pub fn abcd_couplage_ac(freqs: &[f64], ca: &CouplageAc, mode: &str) -> Vec<M2> {
    impedance_couplage_ac(freqs, ca)
        .into_iter()
        .map(|z| {
            let z = match mode {
                "diff" => z * 2.0,
                "comm" => z / 2.0,
                _ => z,
            };
            [[UN, z], [ZERO, UN]]
        })
        .collect()
}

/// La cascade `m` avec les condensateurs devant (position emetteur) ou
/// derriere (recepteur).
fn _poser_ac<const N: usize>(m: &[[[Complex64; N]; N]], m_ac: &[[[Complex64; N]; N]], ca: &CouplageAc) -> Vec<[[Complex64; N]; N]> {
    if ca.position == "emetteur" {
        mul_n(m_ac, m)
    } else {
        mul_n(m, m_ac)
    }
}

/// Les condensateurs de liaison dans les cascades du canal : la cascade
/// (simple, ou du mode impair), celle du mode commun et la paire par brin
/// (N, 4, 4) quand elles existent. Rend (abcds, abcd_cc, m_brins).
pub fn poser_couplage_ac(
    ca: Option<&CouplageAc>, freqs: &[f64], abcds: &[M2], abcd_cc: Option<&[M2]>, m_brins: Option<&[M4]>, mode: &str,
) -> (Vec<M2>, Option<Vec<M2>>, Option<Vec<M4>>) {
    let Some(ca) = ca else {
        return (abcds.to_vec(), abcd_cc.map(<[M2]>::to_vec), m_brins.map(<[M4]>::to_vec));
    };
    let abcds = _poser_ac(abcds, &abcd_couplage_ac(freqs, ca, mode), ca);
    let abcd_cc = abcd_cc.map(|m| _poser_ac(m, &abcd_couplage_ac(freqs, ca, "comm"), ca));
    let m_brins = m_brins.map(|m| {
        let un = abcd_couplage_ac(freqs, ca, "simple");
        _poser_ac(m, &ibis::abcd_par_brin(Some(&un), Some(&un), freqs.len()), ca)
    });
    (abcds, abcd_cc, m_brins)
}

/// « 100 nF », « 4,7 µF » : une capacite lisible.
pub fn _farads(c: f64) -> String {
    for (seuil, unite) in [(1e-6, "µF"), (1e-9, "nF"), (1e-12, "pF")] {
        if c >= seuil {
            return format!("{} {}", fmt_g(c / seuil, 3), unite).replace('.', ",");
        }
    }
    format!("{} F", fmt_g(c, 3))
}

/// Ce que le resultat dit des condensateurs de liaison, et l'avertissement
/// qui va avec : coupure basse, constante de temps, droop par bit et sur la
/// memoire de la fenetre (t_h = fenetre / 2, la part de la reponse que
/// l'oeil lit), fenetre couverte ou non.
pub fn _fiche_couplage_ac(ca: &CouplageAc, p: &crate::Params, fenetre: f64, av: &mut Vec<String>) -> Json {
    let ui = p.ui;
    let t_h = fenetre / 2.0;
    let bits_memoire = (t_h / ui) as i64;
    let mut fiche = obj! {"c" => ca.c, "esr" => ca.esr, "esl" => ca.esl,
                          "boitier" => ca.boitier.clone(), "position" => &ca.position,
                          "c_boucle" => ca.c_x, "f_c" => ca.f_c, "tau" => ca.tau,
                          "fenetre" => fenetre, "fenetre_couvre" => Json::Nul,
                          "droop_par_ui" => Json::Nul, "droop_fenetre" => Json::Nul,
                          "bits_memoire" => bits_memoire};
    let ou = if ca.position == "emetteur" { "entre l'émetteur et la piste" } else { "entre la piste et le récepteur" };
    let texte;
    if let Some(tau) = ca.tau_vrai() {
        let couvre = fenetre >= 6.0 * tau * 0.999;
        let droop_ui = 1.0 - (-ui / tau).exp();
        let droop_f = 1.0 - (-t_h / tau).exp();
        poser(&mut fiche, "fenetre_couvre", couvre);
        poser(&mut fiche, "droop_par_ui", droop_ui);
        poser(&mut fiche, "droop_fenetre", droop_f);
        let mut t = format!(
            "Condensateurs de liaison : {} par brin (ESL {} nH, ESR {} Ω) {} ; coupure basse f_c = {} MHz, τ = C·(R_tx + \
             R_rx) = {} µs : chaque bit d'une longue suite dérive de {} % (droop), {} % sur les {} bits de mémoire du \
             pire cas.",
            _farads(ca.c), fmt_g(ca.esl * 1e9, 2), fmt_g(ca.esr, 2), ou,
            fmt_g(ca.f_c.unwrap_or(f64::NAN) / 1e6, 3), fmt_g(tau * 1e6, 3),
            fmt_g(100.0 * droop_ui, 2), pf(100.0 * droop_f, 1), bits_memoire);
        if !couvre {
            t += &format!(
                " La fenêtre de calcul ({} ns) ne couvre pas la décharge (τ = {} µs) : le continu est corrigé pour \
                 la fenêtre, et le droop n'est compté que sur ces {} bits — les suites plus longues dériveraient \
                 davantage.",
                fmt_g(fenetre * 1e9, 3), fmt_g(tau * 1e6, 3), bits_memoire);
        }
        texte = t;
    } else {
        texte = format!(
            "Condensateurs de liaison : {} par brin {}, sans terminaison au récepteur : rien ne les décharge, ils font \
             un pont diviseur avec la capacité d'entrée (C/(C + C_L) = {}).",
            _farads(ca.c), ou,
            pf(if p.c_charge > 0.0 { ca.c_x / (ca.c_x + p.c_charge) } else { 1.0 }, 3));
    }
    av.push(texte);
    fiche
}

/// La resistance qui remplace le condensateur C_x AU CONTINU de l'IFFT
/// (voir l'en-tete) : R_tot (exp(T_w / tau) - 1), tau = C_x R_tot. Infinie
/// (1e12) quand la fenetre couvre bien plus que tau : le continu est 0.
pub fn resistance_continu_ac(c_x: f64, r_tot: f64, fenetre: f64) -> f64 {
    if !(c_x > 0.0) || !(r_tot > 0.0) {
        return 1e12;
    }
    let x = fenetre / (c_x * r_tot);
    if x > 60.0 {
        return 1e12;
    }
    r_tot * (x.exp() - 1.0)
}

/// La grille de frequences du passage en temporel : (df, n, fenetre, pleine).
///
/// LA FENETRE doit contenir toute la reponse : trente traversees de la ligne
/// (les reflexions s'eteignent en quelques allers-retours, meme sur une
/// charge haute impedance), douze fronts, et les constantes de temps du
/// recepteur. On en prend le DOUBLE, pour que la queue ne revienne pas par
/// l'autre bout de l'IFFT.
/// LE HAUT DE LA GRILLE est la ou le front gaussien ne laisse plus rien :
/// 1,6 / tr, ou il vaut 5e-4.
pub fn grille(debit: f64, tr: f64, retard_estime: f64, tau_extra: f64) -> (f64, usize, f64, bool) {
    let ui = 1.0 / debit;
    let mut t_h = 30.0 * retard_estime + 12.0 * tr + tau_extra + 2.0 * ui;
    t_h = maxf(&[t_h, 2e-9]);
    let mut fenetre = 2.0 * t_h;
    let f_max = maxf(&[1.6 / tr, 2.0 / ui]);
    // (au-dela du plafond, la valeur exacte ne compte plus : elle est ramenee a MAX_FREQS)
    let n = (f_max * fenetre).ceil();
    let mut pleine = true;
    let mut n = if n > MAX_FREQS as f64 {
        fenetre = MAX_FREQS as f64 / f_max;
        pleine = false;
        MAX_FREQS
    } else {
        n.max(0.0) as usize
    };
    n = n.max(64);
    (1.0 / fenetre, n, fenetre, pleine)
}

/// df * np.arange(1, n + 1) : la grille de `grille`.
pub fn frequences(df: f64, n: usize) -> Vec<f64> {
    (1..=n).map(|k| df * k as f64).collect()
}

/// Reponse a un echelon unite, (dt, s), du transfert `h` (Hz -> V/V).
///
/// Le front gaussien de l'emetteur est inclus, decale de quatre ecarts-types
/// pour qu'il commence apres t = 0 : un front gaussien n'est pas causal.
pub fn reponse_indicielle(freqs: &[f64], h: &[Complex64], h0: f64, tr: f64, n_fft_min: usize) -> (f64, Vec<f64>) {
    let df = freqs[1] - freqs[0];
    let n = freqs.len();
    let sigma = tr / TR_SUR_SIGMA;
    let retard = 4.0 * sigma;
    let mut n_fft = 1;
    while n_fft < (2 * n + 2).max(n_fft_min) {
        n_fft *= 2;
    }
    let mut x = vec![ZERO; n_fft / 2 + 1];
    x[0] = re(h0);
    for k in 0..n {
        let f = freqs[k];
        let a = PI * sigma * f;
        let g = Complex64::new(0.0, -2.0 * PI * f * retard).exp() * (-2.0 * (a * a)).exp();
        x[k + 1] = h[k] * g;
    }
    let impulsion = irfft(&x, n_fft);
    let dt = 1.0 / (n_fft as f64 * df);
    (dt, cumsum(&impulsion))
}

/// Une reponse a un echelon `s` (pas dt) passee par le CTLE `spec`.
///
/// Derivee, transformee, produit, retour, integrale : le CTLE est lineaire,
/// et c'est exact des que la fenetre contient sa constante de temps la plus
/// longue -- on la complete d'autant par la valeur finale.
pub fn filtrer_ctle(s: &[f64], dt: f64, spec: Option<&Json>) -> Vec<f64> {
    let Some(spec) = spec.filter(|x| x.vrai()) else { return s.to_vec() };
    let fz = if spec["fz"].vrai() { fl(spec, "fz") } else { fl(spec, "fp1") };
    let f_bas = minf(&[fz, fl(spec, "fp1")]);
    let queue = (8.0 / (2.0 * PI * f_bas) / dt).ceil() as usize;
    let mut n = 1;
    while n < 2 * (s.len() + queue) {
        n *= 2;
    }
    // np.diff(np.concatenate([[0.0], s, np.full(queue, s[-1])]))
    let mut imp = Vec::with_capacity(s.len() + queue);
    let mut avant = 0.0;
    for v in s {
        imp.push(v - avant);
        avant = *v;
    }
    imp.resize(s.len() + queue, 0.0);
    let f = rfftfreq(n, dt);
    let c = ctle(&f, spec);
    let x: Vec<Complex64> = rfft_n(&imp, n).iter().zip(&c).map(|(a, b)| a * b).collect();
    let sortie = irfft(&x, n);
    cumsum(&sortie[..s.len() + queue])
}

/// (centre, normales, distances) d'un polygone convexe.
///
/// LA MARGE EXACTE. Pour un polygone convexe qui entoure son centre c, la
/// jauge g(q) = max_i n_i.(q - c) / d_i vaut 1 sur le bord, moins dedans,
/// plus dehors -- et le polygone agrandi d'un facteur k autour de c est
/// exactement {g <= k}. La plus petite jauge des traces EST donc le facteur
/// d'agrandissement que le gabarit supporte. Elle ne depend pas des unites
/// des axes : une transformation lineaire la laisse invariante.
pub fn _jauge(poly: &[[f64; 2]]) -> ([f64; 2], Vec<[f64; 2]>, Vec<f64>) {
    let c = centre(poly);
    let n = poly.len();
    let mut normales = Vec::with_capacity(n);
    let mut d = Vec::with_capacity(n);
    for i in 0..n {
        let (p, q) = (poly[i], poly[(i + 1) % n]);
        let arete = [q[0] - p[0], q[1] - p[1]];
        let nm = [arete[1], -arete[0]];
        d.push(nm[0] * (p[0] - c[0]) + nm[1] * (p[1] - c[1]));
        normales.push(nm);
    }
    // Sens trigonometrique ou horaire : les normales doivent sortir.
    if d.iter().all(|x| *x < 0.0) {
        for i in 0..n {
            normales[i] = [-normales[i][0], -normales[i][1]];
            d[i] = -d[i];
        }
    }
    (c, normales, d)
}

// p.mean(axis=0)
fn centre(poly: &[[f64; 2]]) -> [f64; 2] {
    let n = poly.len() as f64;
    let (mut x, mut y) = (0.0, 0.0);
    for p in poly {
        x += p[0];
        y += p[1];
    }
    [x / n, y / n]
}

/// La jauge de chaque point de `pts` (N x 2) dans le polygone `poly`.
pub fn jauge(poly: &[[f64; 2]], pts: &[[f64; 2]]) -> Vec<f64> {
    let (c, normales, d) = _jauge(poly);
    pts.iter()
        .map(|p| {
            let q = [p[0] - c[0], p[1] - c[1]];
            maxi(normales.iter().zip(&d).map(|(n, d)| (q[0] * n[0] + q[1] * n[1]) / d))
        })
        .collect()
}

/// L'intervalle [bas, haut] du polygone convexe a l'abscisse x, ou None.
pub fn _tranche(poly: &[[f64; 2]], x: f64) -> Option<(f64, f64)> {
    let n = poly.len();
    let (mut lo, mut hi) = (f64::INFINITY, f64::NEG_INFINITY);
    let mut vu = false;
    let mut pose = |y: f64| {
        vu = true;
        if y < lo {
            lo = y;
        }
        if y > hi {
            hi = y;
        }
    };
    for i in 0..n {
        let ([x0, y0], [x1, y1]) = (poly[i], poly[(i + 1) % n]);
        if (x0 - x) * (x1 - x) > 0.0 {
            continue;
        }
        if x0 == x1 {
            pose(y0);
            pose(y1);
        } else {
            pose(y0 + (y1 - y0) * (x - x0) / (x1 - x0));
        }
    }
    if vu {
        Some((lo, hi))
    } else {
        None
    }
}

/// La marge du gabarit contre l'oeil PIRE CAS : le plus grand facteur k tel
/// que le gabarit agrandi de k autour de son centre tienne, phase par phase,
/// entre la frontiere basse et la frontiere haute de l'oeil -- moins un.
///
/// CE N'EST PAS LA JAUGE DES POINTS DE LA FRONTIERE. Dans les croisements,
/// la frontiere pire cas plonge sous le seuil alors que de vraies traces y
/// passent par zero : juger ses points comme des traces rendrait une marge
/// plus large que celle de l'oeil PRBS, qui n'en est pourtant qu'un cas
/// particulier. Ici, une phase ou l'oeil pire cas est ferme ne laisse passer
/// AUCUNE part du gabarit.
pub fn marge_pire(poly: &[[f64; 2]], taus: &[f64], hauts: &[Option<f64>], bas: &[Option<f64>]) -> f64 {
    let c = centre(poly);
    let nph = taus.len().min(hauts.len()).min(bas.len());
    let tient = |k: f64| -> bool {
        let q: Vec<[f64; 2]> = poly.iter().map(|p| [c[0] + k * (p[0] - c[0]), c[1] + k * (p[1] - c[1])]).collect();
        for i in 0..nph {
            let Some(tr) = _tranche(&q, taus[i]) else { continue };
            match (hauts[i], bas[i]) {
                (Some(h), Some(b)) if !(tr.1 > h || tr.0 < b) => {}
                _ => return false,
            }
        }
        true
    };
    if !tient(1e-6) {
        return -1.0;
    }
    let (mut lo, mut hi) = (1e-6, 1.0);
    while tient(hi) && hi < 1e3 {
        (lo, hi) = (hi, hi * 2.0);
    }
    for _ in 0..40 {
        let mi = 0.5 * (lo + hi);
        if tient(mi) {
            lo = mi;
        } else {
            hi = mi;
        }
    }
    lo - 1.0
}

/// Le nombre de phases ouvertes d'affilee autour de `centre`.
///
/// `ouvert` couvre UNE UI, et l'oeil se repete d'une UI a l'autre : la
/// recherche fait le tour. Sans cela, un echantillonnage un peu decentre
/// tronquerait la largeur au bord de la fenetre au lieu de la mesurer.
pub fn _largeur(ouvert: &[bool], centre: usize) -> usize {
    let n = ouvert.len();
    if !ouvert[centre] {
        return 0;
    }
    if ouvert.iter().all(|x| *x) {
        return n;
    }
    let at = |k: i64| ouvert[modulo(k, n as i64)];
    let mut g = 0;
    while g + 1 < n && at(centre as i64 - g as i64 - 1) {
        g += 1;
    }
    let mut d = 0;
    while d + 1 < n && at((centre + d + 1) as i64) {
        d += 1;
    }
    n.min(g + d + 1)
}
