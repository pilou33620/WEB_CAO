//! L'oeil, a partir d'une fonction de transfert.

use std::f64::consts::PI;

use em::obj;
use em::simulation_em::base::*;

use crate::briques::*;
use crate::gabarits::{fiabilite_texte, poly_json, polygone};
use crate::nl::NonLineaire;
use crate::np::*;
use crate::statistique::{oeil_statistique, CASES_STAT, NIVEAUX_BER, SUR_ECHANTILLONNAGE};
use crate::{ErreurOeil, Params, Res, ECHANTILLONS_UI, LIGNES_DENSITE, M2, TR_SUR_SIGMA};

/// Les reglages de CTLE a essayer : un seul, ou la liste de gains.
pub fn _candidats_ctle(spec: Option<&Json>) -> Vec<Option<Json>> {
    let Some(spec) = spec.filter(|s| s.vrai()) else { return vec![None] };
    if let Some(Json::Liste(liste)) = spec.get("adc_db") {
        return liste
            .iter()
            .map(|x| {
                let mut s = spec.clone();
                poser(&mut s, "adc_db", nb(x));
                Some(s)
            })
            .collect();
    }
    vec![Some(spec.clone())]
}

/// Les curseurs de la reponse a un bit autour de l'echantillon i_s :
/// (rang du principal, tableau des curseurs).
pub fn _curseurs(p_eq: &[f64], i_s: usize, spu: usize) -> (usize, Vec<f64>) {
    let k_avant = i_s / spu;
    let debut = i_s - k_avant * spu;
    (k_avant, p_eq[debut.min(p_eq.len())..].iter().step_by(spu).copied().collect())
}

// amp * np.delete(c, k0), les prises du DFE retirees : `prises` donnees (pire cas), ou choisies
// dans la plage ±dfe_max (`_ouverture`)
fn reste_de(c: &[f64], k0: usize, amp: f64) -> Vec<f64> {
    c.iter().enumerate().filter(|(i, _)| *i != k0).map(|(_, x)| amp * x).collect()
}

/// (demi-ouverture pire cas en V, prises DFE en V, residu ISI en V).
pub fn _ouverture(c: &[f64], k0: usize, amp: f64, dfe_prises: i64, dfe_max: f64) -> (f64, Vec<f64>, f64) {
    let principal = amp * c[k0];
    let mut reste = reste_de(c, k0, amp);
    let mut prises = Vec::new();
    for j in 1..=dfe_prises.max(0) as usize {
        // rangs == j : le curseur k0 + j, un rang plus bas une fois le principal ote
        let i = k0 + j;
        if i >= c.len() {
            prises.push(0.0);
            continue;
        }
        // np.clip : minimum(maximum(x, -dfe_max), dfe_max)
        let dj = reste[i - 1].max(-dfe_max).min(dfe_max);
        prises.push(dj);
        reste[i - 1] -= dj;
    }
    let isi = somme(&reste.iter().map(|x| x.abs()).collect::<Vec<f64>>());
    (principal - isi, prises, isi)
}

/// Le canal que `oeil` recoit : une cascade ABCD (N, 2, 2) -- on y ferme alors generateur et
/// charge --, ou un vecteur H(f) deja ferme.
#[derive(Debug, Clone, Copy)]
pub enum Canal<'a> {
    Abcd(&'a [M2]),
    H(&'a [Complex64]),
}

struct Candidat {
    spec: Option<Json>,
    x0: f64,
    s: Vec<f64>,
    dt: f64,
    n_h: usize,
    p_eq: Vec<f64>,
    i_pk: usize,
    ouv: f64,
    o: i64,
    prises: Vec<f64>,
    isi: f64,
}

fn opt6(v: Option<f64>, numpy: bool) -> Json {
    v.map(|x| rnd(x, 6, numpy)).j()
}

/// L'oeil complet a partir d'une cascade ABCD (ou d'un transfert H).
///
/// `abcds_ou_h` : (N, 2, 2) ABCD -- on y ferme alors generateur et charge --,
/// ou un vecteur H(f) deja ferme, accompagne de `h0`. C'est cette seconde
/// forme que les bancs emploient pour des canaux ideaux.
///
/// `non_lineaire` : la liaison simulee dans le temps avec ses tampons IBIS
/// (voir `simuler_non_lineaire`). La reponse a un echelon et la forme
/// d'onde PRBS viennent alors de la simulation, et non de la superposition ;
/// le reste -- egaliseur, pire cas, oeil statistique, gabarit -- est le
/// meme, sur la reponse a un bit MOYENNE des deux fronts. Un `x0` dans le
/// dictionnaire (flot AMI) est le niveau etabli de sa reponse a un echelon,
/// 1 sinon.
///
/// `h0_bin` : la case du continu de l'IFFT quand elle differe de `h0` --
/// des condensateurs de liaison sans terminaison (`continu_couplage_ac`,
/// le pont diviseur) : l'oeil reste centre sur `h0`, la reponse derive
/// vers `h0_bin`. `lent` {h0, tau} : leur POLE LENT quand une terminaison
/// les decharge -- la decharge est alors comptee exactement
/// (`reponse_indicielle_ac`), et `h0_bin` ne sert plus.
#[allow(clippy::too_many_arguments)]
pub fn oeil(
    freqs: &[f64], abcds_ou_h: Canal, p: &Params, gab: Option<&Json>, h0: Option<f64>, non_lineaire: Option<&mut NonLineaire>,
    h0_bin: Option<f64>, lent: Option<Lent>,
) -> Res<Json> {
    let mut av: Vec<String> = Vec::new();
    let mut nl = non_lineaire;
    let ca = p.couplage_ac.as_ref();
    let (mut h0_bin, mut lent) = (h0_bin, lent);
    let (h, h0): (Option<Vec<Complex64>>, f64) = if let Some(nl) = &nl {
        (None, nl.x0.unwrap_or(1.0))
    } else {
        match abcds_ou_h {
            Canal::Abcd(arr) => {
                let (h, h0) = transfert(arr, freqs, p.r_source, p.r_charge, p.c_charge, p.exces_continu);
                if ca.is_some() && h0_bin.is_none() && lent.is_none() {
                    (h0_bin, lent) = _continu_ac_simple(ca, arr, freqs, p);
                }
                (Some(h), h0)
            }
            Canal::H(h) => (Some(h.to_vec()), h0.unwrap_or_else(|| h.first().map_or(f64::NAN, |x| x.norm()))),
        }
    };
    let h0_bin = h0_bin.unwrap_or(h0);
    if freqs.len() < 2 {
        return Err(ErreurOeil::plantage("IndexError", "index 1 is out of bounds"));
    }
    let (ui, tr) = (p.ui, p.tr);
    let spu = ECHANTILLONS_UI;
    let spi = spu as i64;
    let dt_e = ui / spu as f64;
    let amp = (p.v_haut - p.v_bas) / 2.0;
    let v_mil = (p.v_haut + p.v_bas) / 2.0;
    let df = freqs[1] - freqs[0];
    let fenetre = 1.0 / df;
    let mut t_h = fenetre / 2.0;
    if let Some(nl) = &nl {
        t_h = nl.s.len() as f64 * nl.dt;
    }

    let mut meilleur: Option<Candidat> = None;
    for spec in _candidats_ctle(p.ctle.as_ref()) {
        let gain = _gain_continu_ctle(spec.as_ref());
        let x0 = h0 * gain;
        let (dt, s, n_h);
        if let Some(nl) = &nl {
            dt = nl.dt;
            s = filtrer_ctle(&nl.s, dt, spec.as_ref());
            n_h = s.len();
        } else {
            let h = h.as_ref().expect("un transfert, sans simulation");
            let hc: Vec<Complex64> = match &spec {
                Some(sp) => h.iter().zip(ctle(freqs, sp)).map(|(a, b)| a * b).collect(),
                None => h.clone(),
            };
            let n_min = (fenetre / minf(&[dt_e, tr / 8.0])).ceil() as usize;
            (dt, s) = match lent {
                Some(l) => reponse_indicielle_ac(freqs, &hc, l.h0 * gain, tr, n_min, l.tau),
                None => reponse_indicielle(freqs, &hc, h0_bin * gain, tr, n_min),
            };
            n_h = ((t_h / dt) as usize).min(s.len());
        }
        if n_h == 0 {
            return Err(ErreurOeil::plantage("IndexError", "index -1 is out of bounds for axis 0 with size 0"));
        }
        let s_h = &s[..n_h];
        // Le pas de l'oeil : interpolation lineaire de la reponse fine.
        let n_p = ((t_h + ui) / dt_e).ceil() as usize + 1;
        let t_fin = s_h[n_h - 1];
        let xp: Vec<f64> = (0..n_h).map(|i| i as f64 * dt).collect();
        let t_e: Vec<f64> = (0..n_p).map(|i| i as f64 * dt_e).collect();
        let t_d: Vec<f64> = t_e.iter().map(|t| t - ui).collect();
        let s_e = interp(&t_e, &xp, s_h, 0.0, t_fin);
        let s_dec = interp(&t_d, &xp, s_h, 0.0, t_fin);
        // LA PRE-ACCENTUATION, sur la reponse a un bit : le symbole emis est
        // sum c_j a_(n-j), donc la reponse est sum c_j p(t - j UI).
        let mut p_eq = vec![0.0; n_p + (p.ffe.len() - 1) * spu];
        for (j, cj) in p.ffe.iter().enumerate() {
            for i in 0..n_p {
                p_eq[j * spu + i] += cj * (s_e[i] - s_dec[i]);
            }
        }
        let i_pk = argmax(&p_eq);
        // L'INSTANT D'ECHANTILLONNAGE : celui qui ouvre le plus l'oeil pire
        // cas, a plus ou moins une demi-UI du sommet.
        // UN PLATEAU SE PREND PAR SON MILIEU : sur une liaison sans
        // interference entre bits, toutes les phases du plateau ouvrent
        // autant, et retenir la premiere decentrerait l'oeil d'autant.
        // On cherche sur une UI de part et d'autre du sommet : le sommet tombe
        // n'importe ou sur le plateau (une ondulation de Gibbs suffit), et
        // au-dela d'une UI le « principal » serait le bit voisin.
        let mut essais: Vec<(f64, i64, Vec<f64>, f64)> = Vec::new();
        for o_ in -spi..spi {
            let i_s = i_pk as i64 + o_;
            if i_s < 0 {
                continue;
            }
            let (k0, c) = _curseurs(&p_eq, i_s as usize, spu);
            if k0 >= c.len() {
                return Err(ErreurOeil::plantage("IndexError", "index out of bounds"));
            }
            let (ouv, prises, isi) = _ouverture(&c, k0, amp, p.dfe_prises, p.dfe_max);
            essais.push((ouv, o_, prises, isi));
        }
        // L'ECHANTILLONNAGE AU MILIEU DE L'OEIL, ENTRE LES DEUX CROISEMENTS :
        // c'est ce que fait une recuperation d'horloge, et c'est la qu'un
        // gabarit se pose. On prend la plage de phases ou l'oeil pire cas est
        // ouvert, autour du maximum, et son milieu. Un oeil ferme n'a pas de
        // plage : on garde le maximum, a un pour cent pres (une ondulation de
        // quelques millivolts sur un palier suffirait sinon a le placer au
        // bord du palier).
        let mut ib = 0;
        for (i, e) in essais.iter().enumerate() {
            if e.0 > essais[ib].0 {
                ib = i;
            }
        }
        let haut = essais[ib].0;
        let seuil = if haut > 0.0 { 0.0 } else { haut - (0.01 * haut.abs() + 1e-4 * maxf(&[amp.abs(), 1e-12])) };
        let (mut g_, mut d_) = (ib, ib);
        while g_ >= 1 && essais[g_ - 1].0 > seuil {
            g_ -= 1;
        }
        while d_ + 1 < essais.len() && essais[d_ + 1].0 > seuil {
            d_ += 1;
        }
        let best = essais.swap_remove((g_ + d_) / 2);
        let cand = Candidat { spec, x0, s, dt, n_h, p_eq, i_pk, ouv: best.0, o: best.1, prises: best.2, isi: best.3 };
        if meilleur.as_ref().map_or(true, |m| cand.ouv > m.ouv) {
            meilleur = Some(cand);
        }
    }

    let Some(mut m) = meilleur else {
        return Err(ErreurOeil::plantage("TypeError", "'NoneType' object is not subscriptable"));
    };
    let (dt, n_h, x0, i_pk) = (m.dt, m.n_h, m.x0, m.i_pk);
    let _ = dt;
    let mut o_s = m.o;
    let mut i_s = (i_pk as i64 + o_s) as usize;

    let ordre = match p.motif.as_str() {
        "prbs7" => 7,
        "prbs9" => 9,
        "prbs15" => 15,
        _ => return Err(ErreurOeil::new(format!("Motif « {} » inconnu.", p.motif), "Choisissez PRBS7, PRBS9 ou PRBS15.")),
    };
    let bits = prbs(ordre)?;
    // LA FORME D'ONDE SIMULEE, une periode du motif : demandee ici, avant
    // l'echantillonnage, parce qu'un recepteur AMI y rend son horloge.
    let onde_nl = match nl.as_mut() {
        Some(nl) => Some((nl.onde)(&bits)?),
        None => None,
    };
    // -- L'HORLOGE RECUPEREE (2.4.0) --------------------------------------
    // Un recepteur AMI dont l'AMI_GetWave rend ses instants d'horloge FIXE
    // l'echantillonnage, comme dans le circuit : la phase de l'oeil est leur
    // phase moyenne (et non plus le centre que l'outil choisit), le pire cas
    // et l'oeil statistique s'y lisent, et chaque bit de l'oeil PRBS est lu
    // a SON instant -- la gigue de la recuperation d'horloge comprise.
    let mut cdr: Option<(Vec<f64>, f64, f64)> = None;
    let instants = nl.as_ref().and_then(|n| n.ami.as_ref()).and_then(|a| a.horloges.borrow().instants.clone()).filter(|i| !i.is_empty());
    if let Some(inst) = instants {
        let mut moy = ZERO;
        for t in &inst {
            moy += Complex64::new(0.0, 2.0 * PI * t / spu as f64).exp();
        }
        moy /= inst.len() as f64;
        let phase = fmod_py(moy.arg() / (2.0 * PI) * spu as f64, spu as f64);
        let d = fmod_py((phase - i_s as f64) + spu as f64 / 2.0, spu as f64) - spu as f64 / 2.0;
        let dr = d.round_ties_even() as i64;
        if i_pk as i64 + o_s + dr >= 0 {
            o_s += dr;
            i_s = (i_pk as i64 + o_s) as usize;
            let (k0, c) = _curseurs(&m.p_eq, i_s, spu);
            if k0 >= c.len() {
                return Err(ErreurOeil::plantage("IndexError", "index out of bounds"));
            }
            let (ouv, prises, isi) = _ouverture(&c, k0, amp, p.dfe_prises, p.dfe_max);
            (m.ouv, m.prises, m.isi, m.o) = (ouv, prises, isi, o_s);
            cdr = Some((inst, phase / spu as f64, dr as f64 / spu as f64));
        }
    }
    let (s, p_eq, prises) = (&m.s, &m.p_eq, &m.prises);
    let v_c = v_mil * x0;
    let echelle = maxf(&[maxi(s[..n_h].iter().map(|x| x.abs())), 1e-12]);
    // Avec des condensateurs de liaison qui se dechargent, la reponse DOIT
    // deriver dans la fenetre : ce n'est pas une sonnerie, et la fiche du
    // couplage le dit.
    if (s[n_h - 1] - x0).abs() > 0.02 * echelle && !ca.is_some_and(|c| c.tau_vrai().is_some()) {
        av.push(format!(
            "La réponse ne s'est pas éteinte dans la fenêtre de calcul ({} ns) : la liaison sonne encore. Les niveaux peuvent \
             être faux de quelques pour cent.",
            fmt_g(t_h * 1e9, 3)));
    }
    if s[0].abs() > 0.02 * echelle {
        av.push("La réponse déborde de la fenêtre de calcul et revient par l'autre bout : l'œil est à prendre avec réserve.".into());
    }

    // -- la diaphonie bornee ---------------------------------------------
    // CHAQUE AGRESSEUR AJOUTE SA CRETE AU PIRE CAS, avec son signe le plus
    // defavorable et au meme instant que les autres : c'est la definition du
    // pire cas, et la somme arithmetique est la seule qui en soit un. Le
    // bruit est saisi A LA BROCHE ; derriere un CTLE il passe par le gain du
    // CTLE dans la bande d'un front (jusqu'au genou 0,35 / tr), ce qui
    // majore ce qu'un front d'agresseur y laisse.
    let agr = &p.bornes;
    let mut xt_gain = 1.0;
    if let (false, Some(spec)) = (agr.is_empty(), m.spec.as_ref()) {
        let borne = maxf(&[0.35 / tr, freqs[0]]);
        let f_g: Vec<f64> = freqs.iter().copied().filter(|f| *f <= borne).collect();
        xt_gain = maxi(ctle(&f_g, spec).iter().map(|z| z.norm()));
    }
    let xt_crete = xt_gain * py::sum(agr.iter().map(|b| nb(&b["crete_v"])));

    // -- l'oeil pire cas, phase par phase --------------------------------
    let (mut taus, mut hauts, mut bas_): (Vec<f64>, Vec<Option<f64>>, Vec<Option<f64>>) = (Vec::new(), Vec::new(), Vec::new());
    for o_ in -spi / 2..spi / 2 {
        let j = i_s as i64 + o_;
        taus.push(o_ as f64 / spu as f64);
        if j < 0 {
            hauts.push(None);
            bas_.push(None);
            continue;
        }
        let (k0, c) = _curseurs(p_eq, j as usize, spu);
        if k0 >= c.len() {
            return Err(ErreurOeil::plantage("IndexError", "index out of bounds"));
        }
        let principal = amp * c[k0];
        let mut reste = reste_de(&c, k0, amp);
        for (jj, dj) in prises.iter().enumerate() {
            let i = k0 + jj + 1;
            if i < c.len() {
                reste[i - 1] -= dj;
            }
        }
        let isi = somme(&reste.iter().map(|x| x.abs()).collect::<Vec<f64>>()) + xt_crete;
        hauts.push(Some(v_c + principal - isi));
        bas_.push(Some(v_c - principal + isi));
    }
    // Deux UI affichees : la periode se repete.
    let mi = spu / 2;
    let tau_aff: Vec<f64> =
        taus[mi..].iter().map(|t| t - 1.0).chain(taus.iter().copied()).chain(taus[..mi].iter().map(|t| t + 1.0)).chain([1.0]).collect();
    let deux_ui = |v: &[Option<f64>]| -> Vec<Option<f64>> {
        v[mi..].iter().chain(v.iter()).chain(v[..mi].iter()).chain([&v[mi]]).copied().collect()
    };
    let haut_aff = deux_ui(&hauts);
    let bas_aff = deux_ui(&bas_);
    let ouvert: Vec<bool> = hauts.iter().zip(&bas_).map(|(hh, bb)| matches!((hh, bb), (Some(hh), Some(bb)) if *hh > v_c && *bb < v_c)).collect();
    let larg_pire = _largeur(&ouvert, mi) as f64 / spu as f64;
    let h_pire = 2.0 * (m.ouv - xt_crete);

    // -- l'oeil PRBS, par superposition ----------------------------------
    let per = bits.len();
    // La convolution circulaire est exacte des que la periode emise couvre la
    // reponse a un bit : une repetition de plus ne doublerait que la memoire.
    let rep = 1.max((p_eq.len() as f64 / (per * spu) as f64).ceil() as usize);
    let a: Vec<f64> = (0..rep).flat_map(|_| bits.iter().map(|b| 2.0 * *b as f64 - 1.0)).collect();
    let nb_ = a.len();
    let ns = nb_ * spu;
    let nsi = ns as i64;
    let mut y: Vec<f64>;
    if let Some(onde_nl) = &onde_nl {
        // LA FORME D'ONDE SIMULEE, et non la superposition : le tampon non
        // lineaire ne la verifie pas. Elle est periodique (regime etabli),
        // et le CTLE s'y applique donc en circulaire, exactement.
        if onde_nl.len() * rep != ns {
            return Err(ErreurOeil::plantage("ValueError", "operands could not be broadcast together"));
        }
        y = (0..rep).flat_map(|_| onde_nl.iter().copied()).collect();
        if p.a_une_ffe() {
            // LA FFE SUR LA FORME D'ONDE SIMULEE, comme le flot IBIS-AMI la
            // pose sur la reponse du canal analogique : lineairement, la
            // somme des formes d'onde decalees d'un bit, autour du milieu.
            // Le tampon non lineaire n'a qu'un niveau par etat ; c'est la
            // meme approximation que celle d'un emetteur AMI.
            let mut yy = vec![0.0; ns];
            for (j, cj) in p.ffe.iter().enumerate() {
                for i in 0..ns {
                    yy[i] += cj * (y[modulo(i as i64 - (j * spu) as i64, nsi)] - v_mil);
                }
            }
            y = yy.iter().map(|v| v_mil + v).collect();
        }
        if let Some(spec) = m.spec.as_ref() {
            let fy = rfftfreq(ns, dt_e);
            let x: Vec<Complex64> = rfft(&y).iter().zip(ctle(&fy, spec)).map(|(a, b)| a * b).collect();
            y = irfft(&x, ns);
        }
    } else {
        let mut imp = vec![0.0; ns];
        for (k, v) in a.iter().enumerate() {
            imp[k * spu] = *v;
        }
        let mut pp = vec![0.0; ns];
        pp[..p_eq.len()].copy_from_slice(p_eq);
        let x: Vec<Complex64> = rfft(&imp).iter().zip(rfft(&pp)).map(|(a, b)| a * b).collect();
        // En PRBS15 chaque tableau de `ns` flottants pese 17 Mo : ceux qui ne
        // servent plus sont rendus (pic de 219 Mo ramene a 126).
        drop((imp, pp));
        y = irfft(&x, ns).iter().map(|v| v_c + amp * v).collect();
    }
    // LE DFE, sur la forme d'onde : la contre-reaction du bit n vaut
    // sum d_j a_(n-j) et tient toute l'UI centree sur son echantillonnage.
    if !prises.is_empty() {
        let mut fb = vec![0.0; nb_];
        for (j, dj) in prises.iter().enumerate() {
            for i in 0..nb_ {
                fb[i] += dj * a[modulo(i as i64 - (j as i64 + 1), nb_ as i64)];
            }
        }
        for i in 0..ns {
            let rang = modulo((i as i64 - i_s as i64 + spi / 2).div_euclid(spi), nb_ as i64);
            y[i] -= fb[rang];
        }
    }
    // Le rang de chaque echantillon dans les deux UI affichees.
    let col: Vec<usize> = (0..ns).map(|i| (modulo(i as i64 - i_s as i64, nsi) + spu) % (2 * spu)).collect();
    // Hauteur et largeur PRBS, phase par phase.
    let uns: Vec<bool> = a.iter().map(|x| *x > 0.0).collect();
    let lus = |dec: &dyn Fn(usize) -> i64| -> (Vec<f64>, Vec<f64>) {
        let (mut v1, mut v0) = (Vec::new(), Vec::new());
        for k in 0..nb_ {
            let v = y[modulo((k * spu) as i64 + i_s as i64 + dec(k), nsi)];
            if uns[k] {
                v1.push(v);
            } else {
                v0.push(v);
            }
        }
        (v1, v0)
    };
    let (mut h_phase, mut ouvert_prbs) = (Vec::new(), Vec::new());
    for o_ in -spi / 2..spi / 2 {
        let (v1, v0) = lus(&|_| o_);
        let mn1 = mini(v1);
        let mx0 = maxi(v0);
        h_phase.push(mn1 - mx0);
        ouvert_prbs.push(mn1 > v_c && v_c > mx0);
    }
    let mut h_prbs = h_phase[mi];
    let larg_prbs = _largeur(&ouvert_prbs, mi) as f64 / spu as f64;
    let (mut v1, mut v0) = lus(&|_| 0);
    let mut horloge_ami = None;
    if let Some((x, phase_ui, decalage_ui)) = &cdr {
        // chaque bit a l'instant de l'horloge recuperee qui le lit
        let mut dev = vec![0.0; per];
        let mut ecart = Vec::with_capacity(x.len());
        for t in x {
            let rang_b = ((t - i_s as f64) / spu as f64).round_ties_even() as i64;
            let e = t - (rang_b * spi + i_s as i64) as f64;
            dev[modulo(rang_b, per as i64)] = e;
            ecart.push(e);
        }
        (v1, v0) = lus(&|k| dev[k % per].round_ties_even() as i64);
        h_prbs = mini(v1.iter().copied()) - maxi(v0.iter().copied());
        let ticks = x.len();
        let gigue_rms_ui = ecart_type(&ecart) / spu as f64;
        let gigue_cc_ui = (maxi(ecart.iter().copied()) - mini(ecart.iter().copied())) / spu as f64;
        av.push(format!(
            "Horloge récupérée par le modèle AMI du récepteur, imposée à l'échantillonnage : phase {} UI ({}{} UI du \
             centre que l'outil aurait pris), gigue {} UI rms, {} UI crête à crête sur {} instants.",
            pf(*phase_ui, 3), if decalage_ui.is_sign_negative() { "" } else { "+" }, pf(*decalage_ui, 3),
            pf(gigue_rms_ui, 3), pf(gigue_cc_ui, 3), ticks));
        horloge_ami = Some(obj! {"phase_ui" => *phase_ui, "decalage_ui" => *decalage_ui, "ticks" => ticks,
                                 "gigue_rms_ui" => gigue_rms_ui, "gigue_cc_ui" => gigue_cc_ui, "imposee" => true});
    }
    let niveau_1 = moyenne(&v1);
    let niveau_0 = moyenne(&v0);
    drop((v1, v0));

    // -- le gabarit ------------------------------------------------------
    let mut g_out = Json::Nul;
    let mut mes_g = Objet::new();
    let mut poly: Vec<[f64; 2]> = Vec::new();
    let gab = gab.filter(|g| g.vrai());
    if let Some(gab) = gab {
        let perso = &gab["polygone_perso"];
        poly = if perso.vrai() { els(perso).iter().map(|q| [nb(&q[0]), nb(&q[1])]).collect() } else { polygone(Some(gab), Some(ui), Some(p.setup), Some(p.hold)) };
        let ou_ = |cle: &str, defaut: &str| gab.get(cle).cloned().unwrap_or_else(|| defaut.j());
        g_out = obj! {"id" => ou_("id", "perso"), "nom" => ou_("nom", ""),
                      "fiabilite" => ou_("fiabilite", ""),
                      "fiabilite_texte" => fiabilite_texte(txt(gab, "fiabilite")),
                      "source" => ou_("source", ""), "note" => ou_("note", ""),
                      "lieu" => ou_("lieu", ""), "polygone" => if perso.vrai() { perso.clone() } else { poly_json(&poly) },
                      "v_max" => &gab["v_max"], "v_min" => &gab["v_min"]};
        if poly.len() >= 3 {
            let mut pts = Vec::new();
            for i in 0..ns {
                let tau_ech = (col[i] as f64 - spu as f64) / spu as f64;
                if tau_ech.abs() <= 0.5 + 1e-9 {
                    pts.push([tau_ech, y[i]]);
                }
            }
            let jg = jauge(&poly, &pts);
            mes_g.insert("violations".into(), jg.iter().filter(|x| **x < 1.0).count().j());
            mes_g.insert("marge".into(), (mini(jg.iter().copied()) - 1.0).j());
            mes_g.insert("marge_pire".into(), marge_pire(&poly, &taus, &hauts, &bas_).j());
        } else if gab["masque"]["type"].as_str() == Some("seuils") {
            av.push("Gabarit à seuils sans fenêtre setup/hold : saisissez les temps du récepteur pour qu'il ait une largeur.".into());
        }
        let mut hors = 0;
        if !nul(&gab["v_max"]) {
            let v = nb(&gab["v_max"]);
            hors += y.iter().filter(|x| **x > v).count();
        }
        if !nul(&gab["v_min"]) {
            let v = nb(&gab["v_min"]);
            hors += y.iter().filter(|x| **x < v).count();
        }
        mes_g.insert("hors_limites".into(), hors.j());
    }

    // -- l'oeil statistique, s'il est demande -----------------------------
    let mut stat = None;
    if p.stat {
        let mut niveaux: Vec<f64> = NIVEAUX_BER.to_vec();
        if !niveaux.contains(&p.ber_cible) {
            niveaux.push(p.ber_cible);
        }
        niveaux.sort_by(|a, b| b.total_cmp(a));
        let bornes: Vec<f64> = agr.iter().map(|b| xt_gain * nb(&b["crete_v"])).collect();
        let st = oeil_statistique(p_eq, i_s, spu, amp, prises, &bornes, p.rj_ui, p.dj_ui, p.bruit_v, &niveaux, CASES_STAT, SUR_ECHANTILLONNAGE);
        let mut contours = Vec::new();
        for c in &st.contours {
            // Deux UI affichees, comme le pire cas : la periode se repete.
            let d_aff = deux_ui(&c.u);
            contours.push(obj! {
                "ber" => c.ber, "hauteur" => c.hauteur,
                "largeur_ui" => c.largeur_ui,
                "haut" => d_aff.iter().map(|x| opt6(x.map(|x| v_c + x), false)).collect::<Vec<Json>>(),
                "bas" => d_aff.iter().map(|x| opt6(x.map(|x| v_c - x), false)).collect::<Vec<Json>>()});
        }
        let Some(cible) = st.contours.iter().find(|c| c.ber == p.ber_cible) else {
            return Err(ErreurOeil::plantage("IndexError", "list index out of range"));
        };
        mes_g.insert("hauteur_ber".into(), cible.hauteur.j());
        mes_g.insert("largeur_ber_ui".into(), cible.largeur_ui.j());
        mes_g.insert("ber_cible".into(), p.ber_cible.j());
        if poly.len() >= 3 {
            let d = &cible.u;
            let h: Vec<Option<f64>> = d.iter().map(|x| x.map(|x| v_c + x)).collect();
            let b: Vec<Option<f64>> = d.iter().map(|x| x.map(|x| v_c - x)).collect();
            mes_g.insert("marge_ber".into(), marge_pire(&poly, &taus, &h, &b).j());
        }
        let b_aff = &st.baignoire;
        stat = Some(obj! {
            "niveaux" => st.contours.iter().map(|c| c.ber).collect::<Vec<f64>>(),
            "ber_cible" => p.ber_cible,
            "tau" => tau_aff.iter().map(|t| round(*t, 5)).collect::<Vec<f64>>(),
            "contours" => contours,
            "baignoire" => obj! {"tau" => taus.iter().map(|t| round(*t, 5)).chain([0.5]).collect::<Vec<f64>>(),
                                 "ber" => b_aff.iter().copied().chain([b_aff[0]]).collect::<Vec<f64>>()},
            "baignoire_v" => obj! {"v" => st.baignoire_v.0.iter().map(|x| round(v_c + x, 6)).collect::<Vec<f64>>(),
                                   "ber" => st.baignoire_v.1.clone()},
            "rj_ui" => p.rj_ui, "dj_ui" => p.dj_ui,
            "rj_s" => p.rj_ui * ui, "dj_s" => p.dj_ui * ui,
            "bruit_v" => p.bruit_v,
            "pas_v" => st.pas_v, "cases" => st.cases,
            "hypotheses" => vec![
                "Bits indépendants et équiprobables (et non la séquence \
                 PRBS) ; la gigue est rapportée à l'échantillonneur — celle \
                 de l'émetteur n'y est pas filtrée par le canal, ce qui est \
                 prudent sur une liaison à pertes ; décisions du DFE \
                 supposées justes ; chaque agresseur est un bruit borné à \
                 ±sa crête, comme au pire cas."],
        });
        if st.gigue_tronquee {
            av.push("Gigue de plus d'une demi-UI à 10⁻¹⁷ : elle est tronquée à ±0,5 UI, et l'œil statistique est fermé bien avant.".into());
        }
    }

    // -- la densite ------------------------------------------------------
    let (y_min, y_max) = (mini(y.iter().copied()), maxi(y.iter().copied()));
    let mut bornes = vec![y_min, y_max];
    for q in &poly {
        bornes.push(q[1]);
    }
    if let Some(gab) = gab {
        for cle in ["v_max", "v_min"] {
            if !nul(&gab[cle]) {
                bornes.push(nb(&gab[cle]));
            }
        }
    }
    let (lo, hi) = (minf(&bornes), maxf(&bornes));
    let marge = 0.06 * maxf(&[hi - lo, 1e-6]);
    let (lo, hi) = (lo - marge, hi + marge);
    let ny = LIGNES_DENSITE;
    // (la conversion en entier coupe vers zero, comme astype(np.int32))
    let ligne_v: Vec<i32> = y.iter().map(|v| (((hi - v) / (hi - lo) * ny as f64) as i32).clamp(0, ny as i32 - 1)).collect();
    // LES TRACES SONT CONTINUES, PAS EN POINTILLES. Un front de 1,5 ns sur
    // une UI de 40 ns ne tombe que dans deux ou trois des 128 colonnes : en
    // ne comptant que les echantillons, il disparait de la figure. Chaque
    // segment entre deux echantillons successifs remplit donc les lignes
    // qu'il traverse dans sa colonne. La forme d'onde est periodique (produit
    // de convolution circulaire) : le dernier echantillon rejoint le premier.
    let mut comptes = vec![0i64; ny * 2 * spu];
    for i in 0..ns {
        let (r0, r1) = (ligne_v[i], ligne_v[(i + 1) % ns]);
        for r in r0.min(r1)..=r0.max(r1) {
            comptes[r as usize * 2 * spu + col[i]] += 1;
        }
    }
    drop(ligne_v);

    // -- la reponse a un bit, pour la figure et l'export -----------------
    let debut = i_s.saturating_sub(2 * spu);
    let fin = p_eq.len().min(i_s + 10 * spu);
    let pas = 2;
    let rep_bit = obj! {"dt" => dt_e * pas as f64, "t0" => (debut as f64 - i_s as f64) * dt_e,
                        "v" => p_eq[debut.min(fin)..fin].iter().step_by(pas).map(|v| round(v * 2.0 * amp, 6)).collect::<Vec<f64>>()};

    let spec = m.spec.clone();
    if let Some(sp) = spec.as_ref().filter(|s| s["forme"].as_str() == Some("pcie3")) {
        av.push(format!("CTLE : gain continu retenu {} dB (le meilleur des réglages essayés).", pf(nb(&sp["adc_db"]), 0)));
    }
    let retard = match nl.as_ref() {
        Some(nl) => i_s as f64 * dt_e - ui / 2.0 - nl.t50 - p.ffe_principal as f64 * ui,
        None => i_s as f64 * dt_e - 4.0 * tr / TR_SUR_SIGMA - ui / 2.0 - p.ffe_principal as f64 * ui,
    };
    let mut mesures = obj! {
        "hauteur_prbs" => h_prbs,
        "largeur_prbs_ui" => larg_prbs,
        "hauteur_pire" => h_pire,
        "largeur_pire_ui" => larg_pire,
        "isi_pire" => m.isi,
        "principal" => amp * p_eq[i_s],
        "niveau_1" => niveau_1, "niveau_0" => niveau_0,
        "v_max_vu" => y_max, "v_min_vu" => y_min,
        "retard" => retard,
    };
    maj(&mut mesures, Json::Objet(mes_g));
    let comptes_max = comptes.iter().copied().max().unwrap_or(0);
    let mut r = obj! {
        "debit" => p.debit, "ui" => ui, "tr" => tr, "mode" => &p.mode,
        "motif" => &p.motif, "bits" => nb_,
        "seuil" => v_c,
        "densite" => obj! {"nx" => 2 * spu, "ny" => ny, "v_haut" => hi, "v_bas" => lo,
                           "comptes" => comptes, "max" => comptes_max},
        "pire_cas" => obj! {"tau" => tau_aff.iter().map(|t| round(*t, 5)).collect::<Vec<f64>>(),
                            "haut" => haut_aff.iter().map(|v| opt6(*v, true)).collect::<Vec<Json>>(),
                            "bas" => bas_aff.iter().map(|v| opt6(*v, true)).collect::<Vec<Json>>()},
        "mesures" => mesures,
        "gabarit" => g_out,
        "egalisation" => obj! {"ctle" => spec, "dfe_v" => prises.clone(),
                               "ffe" => p.ffe.clone(), "ffe_principal" => p.ffe_principal},
        "reponse_bit" => rep_bit,
        "grille" => obj! {"points" => freqs.len(), "df" => df,
                          "f_max" => freqs[freqs.len() - 1], "fenetre" => fenetre,
                          "h0" => x0},
        "avertissements" => av,
    };
    if let Some(stat) = stat {
        poser(&mut r, "statistique", stat);
    }
    if let Some(h) = horloge_ami {
        poser(&mut r, "horloge_ami", h);
    }
    if !agr.is_empty() {
        poser(&mut r, "diaphonie", obj! {
            "agresseurs" => agr.clone(), "gain_ctle" => xt_gain,
            "crete_totale_v" => xt_crete,
            "note" => "Somme arithmétique des crêtes (pire cas), ramenée à \
                       l'échantillonneur. L'œil PRBS, lui, est sans \
                       diaphonie : la séquence des voisines n'est pas connue."});
    }
    Ok(r)
}
