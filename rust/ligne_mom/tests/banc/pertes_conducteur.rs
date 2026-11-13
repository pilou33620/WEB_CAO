// ==========================================================================
// LES PERTES DU CONDUCTEUR, LA RUGOSITE, LE DIELECTRIQUE CAUSAL, LE VIA-LIGNE
// --------------------------------------------------------------------------
// ligne_mom 2.7.0. Etalons : la ligne coaxiale (alpha_c exact), les plaques
// paralleles (exactes en limite), Pucel-Masse-Hartwig 1968 pour le microruban
// (forme fermee publiee, telle que la donnent Gupta et Wadell, en dB par unite
// de longueur) et la formule de Pozar (Microwave Engineering, triplaque,
// incrementale sur Wheeler) -- toutes recopiees ici, independamment du module.
// ===================================================================

use crate::sections::det;
use crate::*;

fn o() -> OptionsPertes {
    OptionsPertes::default()
}

/// Les options de `line_losses` a epaisseur t, hauteur et topologie donnees.
fn oht(t: f64, hauteur: Option<f64>, topologie: Option<&str>) -> OptionsPertes {
    OptionsPertes { epaisseur: t, hauteur, topologie: topologie.map(String::from), ..o() }
}

/// Pucel-Masse-Hartwig, alpha_c en Np/m. Discontinue de ~8 % a w/h = 2 :
/// c'est la limite connue de la formule, d'ou la tolerance plus bas.
fn _pucel_np(w: f64, t: f64, h: f64, z0: f64, eps_eff: f64, rs: f64) -> f64 {
    let u = w / h;
    let (we, b) = if u >= 1.0 / (2.0 * PI) {
        (w + (t / PI) * (1.0 + (2.0 * h / t).ln()), h)
    } else {
        (w + (t / PI) * (1.0 + (4.0 * PI * w / t).ln()), 2.0 * PI * w)
    };
    let a = 1.0 + h / we * (1.0 + (2.0 * b / t).ln() / PI);
    let ue = we / h;
    let db = if u <= 2.0 {
        1.38 * a * rs / (h * z0) * (32.0 - ue * ue) / (32.0 + ue * ue)
    } else {
        6.1e-5 * a * rs * z0 * eps_eff / h * (ue + 0.667 * ue / (ue + 1.444))
    };
    db / 8.686
}

/// Pozar, alpha_c d'une triplaque centree, en Np/m.
fn _pozar_triplaque_np(w: f64, t: f64, b: f64, er: f64, z0: f64, rs: f64) -> (f64, f64) {
    if er.sqrt() * z0 < 120.0 {
        let a = 1.0 + 2.0 * w / (b - t) + (1.0 / PI) * ((b + t) / (b - t)) * ((2.0 * b - t) / t).ln();
        return (2.7e-3 * rs * er * z0 / (30.0 * PI * (b - t)) * a, a);
    }
    let bb = 1.0 + b / (0.5 * w + 0.7 * t) * (0.5 + 0.414 * t / w + (4.0 * PI * w / t).ln() / (2.0 * PI));
    (0.16 * rs / (z0 * b) * bb, bb)
}

/// LA REGLE ELLE-MEME, la ou alpha_c est exact : R = Rs/(2pi) (1/a + 1/b).
///
/// C'est le facteur 1/eta0 et le sens du recul qui sont en jeu -- l'ancienne
/// erreur etait justement un facteur deux.
fn wheeler_sur_la_coaxiale() {
    let (a, b) = (0.15e-3, 0.5e-3);
    let rs = resistance_surface(5e9);
    let k = resistance_wheeler(|n| Some(ETA_0 / (2.0 * PI) * ((b + n) / (a - n)).ln()), 1e-9).unwrap();
    proche(rs * k, rs / (2.0 * PI) * (1.0 / a + 1.0 / b), 1e-6, "R de la coaxiale par la regle contre la formule exacte");
}

/// Un ruban tres large : ruban et plan portent chacun Rs/w, R -> 2 Rs/w.
fn plaques_paralleles() {
    let (h, t, f) = (0.1e-3, 35e-6, 10e9);
    for (wh, tol) in [(1000.0, 0.015), (10000.0, 0.002)] {
        let w = wh * h;
        let za = _z_air_microruban(w, t, h).unwrap();
        let d = line_losses_detaillees(za, 1.0, w, 1.0, 0.0, f, &oht(t, Some(h), Some("micro"))).unwrap();
        let detail = d.detail.unwrap();
        proche(d.r_ac_par_m, 2.0 * d.rs / w, tol, &format!("R a w/h = {wh} contre 2 Rs/w"));
        proche(detail.r_ruban, detail.r_plan, 2.0 * tol, &format!("ruban et plan a parts egales, w/h = {wh}"));
    }
}

fn microruban_contre_pucel() {
    let (h, t, er, f) = (0.3e-3, 35e-6, 4.3, 5e9);
    let rs = resistance_surface(f);
    for u in [0.3, 0.5, 1.0, 3.0, 8.0] {
        let w = u * h;
        let r = solve_line(&micro(w, t, h, er)).unwrap();
        let (ac, _) = line_losses(r.z0, r.eps_eff, w, er, 0.0, f, &oht(t, Some(h), Some("micro"))).unwrap();
        proche(ac, _pucel_np(w, t, h, r.z0, r.eps_eff, rs), 0.08, &format!("alpha_c a w/h = {u:.1} contre Pucel"));
    }
}

/// L'exemple de Pozar : b = 3,2 mm, er = 2,2, t = 0,01 mm, 10 GHz. Son
/// facteur A y vaut 4,74 -- on le retrouve d'abord, pour etre sur de la
/// formule recopiee.
fn triplaque_contre_pozar() {
    let (b, t, er, f) = (3.2e-3, 1e-5, 2.2f64, 10e9);
    let rs = resistance_surface(f);
    for w in [2.66e-3, 1.0e-3, 0.3e-3] {
        let za = _z_air_triplaque(w, t, b).unwrap();
        let z0 = za / er.sqrt();
        let (reference, a) = _pozar_triplaque_np(w, t, b, er, z0, rs);
        if w == 2.66e-3 {
            proche(z0, 50.0, 0.02, "Z0 de l'exemple de Pozar");
            proche(a, 4.74, 0.002, "le facteur A de l'exemple de Pozar");
        }
        let (ac, _) = line_losses(z0, er, w, er, 0.0, f, &oht(t, Some(b), None)).unwrap();
        proche(ac, reference, 0.05, &format!("alpha_c triplaque w = {:.2} mm contre Pozar", w * 1e3));
    }
}

/// Sans `hauteur`, elle se lit sur Z0.racine(eps_eff) : a quelques pour
/// cent de la vraie, et la perte a moins de 2 % de celle a hauteur donnee.
fn la_hauteur_se_deduit_de_z0() {
    for (kind, haut) in [("micro", 0.3e-3), ("strip", 0.5e-3)] {
        let (w, t, er, f) = (0.2e-3, 17.5e-6, 4.3, 5e9);
        let g = if kind == "micro" { micro(w, t, haut, er) } else { Geometrie { kind: Kind::Strip, w, t, b: haut, epsilon_r: er, ..Default::default() } };
        let r = solve_line(&g).unwrap();
        let d = line_losses_detaillees(r.z0, r.eps_eff, w, er, 0.0, f, &oht(t, None, None)).unwrap();
        let detail = d.detail.clone().unwrap();
        assert!(detail.hauteur_source == Some("deduite"), "{:?}", detail.hauteur_source);
        assert!(detail.topologie.nom() == if kind == "micro" { "micro" } else { "triplaque" });
        proche(detail.hauteur.unwrap(), haut, 0.08, &format!("hauteur deduite ({kind})"));
        let (ac_h, _) = line_losses(r.z0, r.eps_eff, w, er, 0.0, f, &oht(t, Some(haut), None)).unwrap();
        proche(d.alpha_c, ac_h, 0.02, &format!("alpha_c deduit contre donne ({kind})"));
    }
}

/// `modele_conducteur="ancien"` rend AU BIT PRES Rs / (2 Z0 w).
fn l_ancien_modele_reste_disponible() {
    for (w, f) in [(0.38e-3, 1e9), (0.05e-3, 7e9)] {
        let (ac, ad) = line_losses(50.0, 3.3, w, 4.3, 0.02, f, &OptionsPertes { modele_conducteur: "ancien".into(), ..o() }).unwrap();
        let rs = 1.0 / (SIGMA_CU * (2.0 / (2.0 * PI * f * MU_0 * SIGMA_CU)).sqrt());
        assert!(ac == rs / w / (2.0 * 50.0), "{ac} {}", rs / w / 100.0);
        assert!(ad == line_losses(50.0, 3.3, w, 4.3, 0.02, f, &o()).unwrap().1);
    }
}

/// Sous la peau le ruban retrouve 1/(sigma w t) ; au-dessus, R va comme
/// racine(f) -- un facteur racine(10) par decade, a 1 % pres.
fn le_continu_et_la_peau() {
    let (w, t) = (0.2e-3, 35e-6);
    let d = line_losses_detaillees(50.0, 3.3, w, 4.3, 0.0, 1e3, &oht(t, None, None)).unwrap();
    proche(d.detail.unwrap().r_ruban, 1.0 / (SIGMA_CU * w * t), 0.01, "R du ruban a 1 kHz contre la resistance continue");
    let a1 = line_losses(50.0, 3.3, w, 4.3, 0.0, 1e9, &oht(t, None, None)).unwrap().0;
    let a2 = line_losses(50.0, 3.3, w, 4.3, 0.0, 10e9, &oht(t, None, None)).unwrap().0;
    proche(a2 / a1, 10f64.sqrt(), 0.01, "alpha_c(10 GHz)/alpha_c(1 GHz)");
}

/// CE QUE L'ANCIEN MODELE FAISAIT DE TRAVERS, dans les deux sens : il
/// entassait le courant d'une piste etroite sur w (perte trop forte) et
/// oubliait le plan sous une piste large (perte trop faible).
fn la_piste_etroite_et_la_piste_large() {
    let (h, t, er, f) = (0.3e-3, 35e-6, 4.3, 5e9);
    let mut rapports = Vec::new();
    for w in [0.15e-3, 1.5e-3] {
        let r = solve_line(&micro(w, t, h, er)).unwrap();
        let neuf = line_losses(r.z0, r.eps_eff, w, er, 0.0, f, &oht(t, None, None)).unwrap().0;
        let ancien = line_losses(r.z0, r.eps_eff, w, er, 0.0, f, &OptionsPertes { modele_conducteur: "ancien".into(), ..oht(t, None, None) }).unwrap().0;
        rapports.push(neuf / ancien);
    }
    assert!(rapports[0] < 0.8 && rapports[1] > 1.15, "{rapports:?}");
}

fn hammerstad(f: f64, rms: f64) -> f64 {
    facteur_rugosite(f, rms, "hammerstad", 0.0, 0.0)
}

fn croissant(k: &[f64]) -> bool {
    k.windows(2).all(|p| p[1] - p[0] > 0.0)
}

fn rugosite_hammerstad() {
    let k = facteur_rugosite_vec(&[1e5, 1e9, 1e11, 1e13], 1.0e-6, "hammerstad", 0.0, 0.0);
    assert!((k[0] - 1.0).abs() < 1e-3, "{k:?}");
    assert!((k[3] - 2.0).abs() < 1e-3, "{k:?}");
    assert!(croissant(&k), "{k:?}");
    // A delta = Delta : 1 + (2/pi) atan(1,4), la formule elle-meme.
    let f = 1.0 / (PI * MU_0 * SIGMA_CU * 1e-12);
    proche(hammerstad(f, 1e-6), 1.0 + 2.0 / PI * 1.4f64.atan(), 1e-9, "K a delta = Delta");
}

fn rugosite_huray() {
    let (a, sr) = (0.5e-6, 1.6);
    let f = logspace(6.0, 13.0, 50);
    let k = facteur_rugosite_vec(&f, 0.0, "huray", a, sr);
    assert!(k.iter().all(|&k| (1.0..=1.0 + 1.5 * sr).contains(&k)), "{k:?}");
    assert!(croissant(&k), "{k:?}");
    assert!(k[0] < 1.01 && k[49] > 1.0 + 1.5 * sr * 0.95, "{} {}", k[0], k[49]);
}

fn sans_rugosite_rien_ne_change() {
    let pertes = |opt: &OptionsPertes| line_losses(50.0, 3.3, 0.2e-3, 4.3, 0.02, 5e9, opt).unwrap();
    assert!(pertes(&o()) == pertes(&OptionsPertes { rugosite_rms: 0.0, ..o() }));
    assert!(hammerstad(5e9, 0.0) == 1.0);
    let a0 = pertes(&o()).0;
    let a1 = pertes(&OptionsPertes { rugosite_rms: 1.5e-6, ..o() }).0;
    proche(a1 / a0, hammerstad(5e9, 1.5e-6), 2e-3, "alpha_c rugueux / lisse contre K");
}

fn ds(er: f64, td: f64, f_ref: f64, f: f64) -> (f64, f64) {
    djordjevic_sarkar(er, td, f_ref, f, 1e3, 1e12).unwrap()
}

fn ds_rend_la_fiche_a_f_ref() {
    let (er, td) = ds(4.3, 0.02, 1e9, 1e9);
    assert!((er - 4.3).abs() < 1e-12 && (td - 0.02).abs() < 1e-14, "{er} {td}");
    let (er, td) = djordjevic_sarkar_vec(3.5, 0.004, 10e9, &[10e9], 1e3, 1e12).unwrap();
    assert!((er[0] - 3.5).abs() < 1e-12 && (td[0] - 0.004).abs() < 1e-14, "{er:?} {td:?}");
}

fn ds_er_decroit() {
    let f = logspace(4.0, 11.5, 60);
    let (er, td) = djordjevic_sarkar_vec(4.3, 0.02, 1e9, &f, 1e3, 1e12).unwrap();
    assert!(er.windows(2).all(|p| p[1] - p[0] < 0.0), "{er:?}");
    assert!(td.iter().all(|&t| t > 0.0), "{td:?}");
    let (er0, td0) = ds(4.3, 0.02, 1e9, 0.0);
    assert!(td0 == 0.0 && er0 > er[0], "{er0} {td0}");
}

/// eps'(f) - eps_inf = (2/pi) VP int x eps''(x) / (x^2 - f^2) dx.
///
/// Integrale soustraite (le terme retranche a une valeur principale nulle),
/// en ln x de 1e-2 a 1e16 Hz : a 1e-4 pres sur quatre decades.
fn ds_kramers_kronig() {
    let (e_inf, _) = ds(4.3, 0.02, 1e9, 1e30);
    let n = 400001;
    let (u0, u1) = (1e-2f64.ln(), 1e16f64.ln());
    let u: Vec<f64> = (0..n).map(|i| u0 + (u1 - u0) * i as f64 / (n - 1) as f64).collect();
    let x: Vec<f64> = u.iter().map(|u| u.exp()).collect();
    let (er, td) = djordjevic_sarkar_vec(4.3, 0.02, 1e9, &x, 1e3, 1e12).unwrap();
    let epp: Vec<f64> = er.iter().zip(&td).map(|(e, t)| e * t).collect();
    for f in [1e6, 1e8, 1e9, 1e10] {
        let (erf, tdf) = ds(4.3, 0.02, 1e9, f);
        let g: Vec<f64> = (0..n).map(|i| if (x[i] - f).abs() < 1e-9 * f { 0.0 } else { (x[i] * epp[i] - f * erf * tdf) / (x[i] * x[i] - f * f) }).collect();
        let kk = 2.0 / PI * (1..n).map(|i| 0.5 * (g[i] * x[i] + g[i - 1] * x[i - 1]) * (u[i] - u[i - 1])).sum::<f64>();
        proche(kk, erf - e_inf, 1e-4, &format!("Kramers-Kronig a {f:.0e} Hz"));
    }
    // Et la forme locale : d eps'/d ln f = -(2/pi) eps'' au milieu de la bande.
    let f = 1e8;
    let (e1, _) = ds(4.3, 0.02, 1e9, f * 1.001);
    let (e0, _) = ds(4.3, 0.02, 1e9, f / 1.001);
    let (erf, tdf) = ds(4.3, 0.02, 1e9, f);
    proche((e1 - e0) / (2.0 * 1.001f64.ln()), -2.0 / PI * erf * tdf, 1e-3, "pente de eps' contre eps''");
}

/// Desactive par defaut ; active, identique a f_ref et different ailleurs,
/// et le conducteur n'en est pas touche.
fn ds_dans_line_losses() {
    let causal = OptionsPertes { dielectrique_causal: true, ..o() };
    let pertes = |f: f64, opt: &OptionsPertes| line_losses(50.0, 3.3, 0.2e-3, 4.3, 0.02, f, opt).unwrap();
    let a = pertes(1e9, &o());
    let b = pertes(1e9, &causal);
    assert!((a.1 - b.1).abs() < 1e-12 * a.1 && a.0 == b.0, "{a:?} {b:?}");
    let a = pertes(20e9, &o());
    let b = pertes(20e9, &causal);
    assert!(a.0 == b.0 && (b.1 / a.1 - 1.0).abs() > 1e-3, "{a:?} {b:?}");
    let d = line_losses_detaillees(50.0, 3.3, 0.2e-3, 4.3, 0.02, 20e9, &causal).unwrap().detail.unwrap();
    assert!(d.er_f < 4.3 && d.eps_eff_f < 3.3, "{d:?}");
}

/// A 10 MHz, B = j omega L et C = j omega C, avec L et C TOTAUX : le
/// barreau et son moignon, la capacite de `capacite_antipad` sur toute la
/// longueur, et le pi existant les rend au millieme.
fn via_ligne_rejoint_le_pi() {
    let (lg, lm, d, da, er, f) = (1.2e-3, 0.4e-3, 0.25e-3, 0.8e-3f64, 4.3, 1e7);
    let m = abcd_via_ligne(lg, d, da, er, f, &OptionsViaLigne { longueur_moignon: lm, pertes_conducteur: false, ..Default::default() });
    let l_tot = MU_0 / (2.0 * PI) * (da / d).ln() * lg;
    let c_tot = capacite_antipad(d, da, lg + lm, er);
    let p = abcd_via_boucle(l_tot, c_tot, f);
    proche(m[0][1].im, p[0][1].im, 1e-3, "B du via-ligne contre le pi");
    proche(m[1][0].im, p[1][0].im, 1e-3, "C du via-ligne contre le pi");
    assert!((det(&m) - 1.0).norm() < 1e-9, "{}", det(&m));
}

fn via_ligne_resonance_du_moignon() {
    let (lm, er) = (1.0e-3, 4.3);
    let fr = frequence_resonance_moignon(lm, er);
    let fs: Vec<f64> = (0..1601).map(|i| 0.6 * fr + (1.4 * fr - 0.6 * fr) * i as f64 / 1600.0).collect();
    let avec = OptionsViaLigne { longueur_moignon: lm, tan_delta: 0.02, ..Default::default() };
    let s21: Vec<f64> = fs.iter().map(|&x| cascade_to_s(&abcd_via_ligne(0.6e-3, 0.25e-3, 0.8e-3, er, x, &avec), 50.0)[1][0].norm()).collect();
    let k = (0..s21.len()).fold(0, |k, i| if s21[i] < s21[k] { i } else { k });
    proche(fs[k], fr, 0.01, "creux de |S21| contre le quart d'onde du moignon");
    assert!(s21[k] < 0.1, "{}", s21[k]);
    // Le meme via sans moignon ne resonne pas : il reste presque transparent.
    let s = cascade_to_s(&abcd_via_ligne(0.6e-3, 0.25e-3, 0.8e-3, er, fr, &OptionsViaLigne { tan_delta: 0.02, ..Default::default() }), 50.0);
    assert!(s[1][0].norm() > 0.9 && s[1][0].norm() <= 1.0, "{}", s[1][0].norm());
}

// ==========================================================================
// LE PLAN A SA PROPRE RUGOSITE (ligne_mom 2.8.0, simulation_em 5.1.0)
// ==========================================================================

/// `rugosite_plan` : None ou egale a celle du ruban, le detail est celui
/// d'avant au bit pres ; differente, R_ruban ne bouge pas et R_plan suit SON
/// facteur ; deux plans (triplaque), la moyenne des deux ; une cle inconnue
/// est refusee.
///
/// (La cle inconnue que le Python refusait ne peut plus s'ecrire : `RugositePlan` n'a que
/// les quatre champs admis, et le compilateur refuse le reste.)
fn la_rugosite_du_plan_ne_touche_que_r_plan() {
    let dl = |opt: &OptionsPertes, eps: f64, er: f64| line_losses_detaillees(50.0, eps, 0.38e-3, er, 0.02, 5e9, opt).unwrap();
    let base = OptionsPertes { hauteur: Some(0.2e-3), topologie: Some("micro".into()), ..o() };
    let rug = OptionsPertes { rugosite_rms: 1e-6, ..base.clone() };
    let plan = |p: Vec<RugositePlan>, de: &OptionsPertes| OptionsPertes { rugosite_plan: Some(p), ..de.clone() };
    let rms = |r: f64| RugositePlan { rugosite_rms: r, ..Default::default() };
    let d0 = dl(&rug, 3.3, 4.3);
    let det0 = d0.detail.clone().unwrap();
    for egal in [None, Some(vec![rms(1e-6)]), Some(vec![RugositePlan { rugosite_rms: 1e-6, modele_rugosite: "hammerstad".into(), ..Default::default() }])] {
        let opt = OptionsPertes { rugosite_plan: egal.clone(), ..rug.clone() };
        let mut d1 = dl(&opt, 3.3, 4.3);
        if let Some(d) = d1.detail.as_mut() {
            d.facteur_rugosite_plan = None;
        }
        assert!(d1 == d0, "{egal:?} {d1:?} {d0:?}");
        assert!(line_losses(50.0, 3.3, 0.38e-3, 4.3, 0.02, 5e9, &opt).unwrap() == line_losses(50.0, 3.3, 0.38e-3, 4.3, 0.02, 5e9, &rug).unwrap(), "{egal:?}");
    }
    assert!(det0.facteur_rugosite_plan.is_none());
    let k1 = hammerstad(5e9, 1e-6);
    let lisse = dl(&base, 3.3, 4.3).detail.unwrap();
    // plan lisse sous un ruban rugueux : R_plan = celui du cuivre lisse
    let d2 = dl(&plan(vec![RugositePlan::default()], &rug), 3.3, 4.3).detail.unwrap();
    assert!(d2.r_ruban == det0.r_ruban, "{} {}", d2.r_ruban, det0.r_ruban);
    proche(d2.r_plan, lisse.r_plan, 1e-12, "R_plan d'un plan lisse");
    assert!(d2.facteur_rugosite_plan == Some(1.0));
    proche(det0.r_plan / d2.r_plan, k1, 1e-12, "K du ruban porte jadis au plan");
    // plan plus rugueux que le ruban, Huray compris
    let d3 = dl(&plan(vec![rms(2e-6)], &rug), 3.3, 4.3).detail.unwrap();
    assert!(d3.r_ruban == det0.r_ruban);
    proche(d3.r_plan / lisse.r_plan, hammerstad(5e9, 2e-6), 1e-12, "K propre du plan (Hammerstad)");
    let hu = RugositePlan { modele_rugosite: "huray".into(), rayon_nodule: 0.5e-6, rapport_surface: 1.5, ..Default::default() };
    let d4 = dl(&plan(vec![hu], &base), 3.3, 4.3);
    let det4 = d4.detail.unwrap();
    assert!(det4.r_ruban == lisse.r_ruban);
    proche(det4.r_plan / lisse.r_plan, facteur_rugosite(5e9, 0.0, "huray", 0.5e-6, 1.5), 1e-12, "K propre du plan (Huray)");
    proche(d4.alpha_c, (det4.r_ruban + det4.r_plan) / 100.0, 1e-12, "alpha_c = (R_ruban + R_plan) / 2 Z0");
    // triplaque : les deux plans, la moyenne de leurs facteurs
    let tri = OptionsPertes { hauteur: Some(0.43e-3), topologie: Some("triplaque".into()), ..o() };
    let t0 = dl(&tri, 4.0, 4.0).detail.unwrap();
    let t2 = dl(&plan(vec![rms(2e-6), RugositePlan::default()], &tri), 4.0, 4.0).detail.unwrap();
    proche(t2.facteur_rugosite_plan.unwrap(), (hammerstad(5e9, 2e-6) + 1.0) / 2.0, 1e-12, "moyenne des deux plans");
    proche(t2.r_plan / t0.r_plan, t2.facteur_rugosite_plan.unwrap(), 1e-12, "R_plan de la triplaque");
    assert!(t2.r_ruban == t0.r_ruban);
    // le modele « ancien » n'a pas de plan : rien ne change
    let ancien = OptionsPertes { modele_conducteur: "ancien".into(), ..rug.clone() };
    let a0 = dl(&ancien, 3.3, 4.3);
    let a1 = dl(&plan(vec![RugositePlan::default()], &ancien), 3.3, 4.3);
    assert!(a1.alpha_c == a0.alpha_c);
}

pub fn banc() {
    titre("Les pertes du conducteur : ruban, plan et bords (Wheeler)");
    T("la regle de Wheeler rend la coaxiale exacte", wheeler_sur_la_coaxiale);
    T("plaques paralleles : ruban et plan, R -> 2 Rs/w", plaques_paralleles);
    T("microruban contre Pucel (+-8 %)", microruban_contre_pucel);
    T("triplaque contre Pozar (+-5 %)", triplaque_contre_pozar);
    T("la hauteur se deduit de Z0 sans la donner", la_hauteur_se_deduit_de_z0);
    T("l'ancien modele reste disponible au bit pres", l_ancien_modele_reste_disponible);
    T("le continu sous la peau, racine(f) au-dessus", le_continu_et_la_peau);
    T("piste etroite et piste large : les deux erreurs de l'ancien modele", la_piste_etroite_et_la_piste_large);

    titre("La rugosite du cuivre (Hammerstad-Groiss, Huray)");
    T("Hammerstad-Groiss : 1 en bas, 2 en haut", rugosite_hammerstad);
    T("Huray : borne par 1 + 3/2 SR, croissant", rugosite_huray);
    T("sans rugosite rien ne change, avec elle alpha_c est multiplie par K", sans_rugosite_rien_ne_change);

    titre("Le dielectrique causal (Djordjevic-Sarkar)");
    T("Djordjevic-Sarkar rend la fiche a f_ref", ds_rend_la_fiche_a_f_ref);
    T("er decroit avec la frequence, tan delta reste positif", ds_er_decroit);
    T("Kramers-Kronig verifie numeriquement", ds_kramers_kronig);
    T("l'option causale de line_losses", ds_dans_line_losses);

    titre("Le via comme ligne coaxiale");
    T("le via-ligne rejoint le pi en basse frequence", via_ligne_rejoint_le_pi);
    T("le moignon resonne a son quart d'onde", via_ligne_resonance_du_moignon);
    T("la rugosite propre du plan ne touche que R_plan (ligne_mom 2.8.0)", la_rugosite_du_plan_ne_touche_que_r_plan);
}
