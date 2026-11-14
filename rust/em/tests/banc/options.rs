//! Les options de modele dans la cascade, le sans-plan et l'audit de justesse (cas de banc-ligne-mom.py).

use crate::*;
use crate::empilage_vias::*;
use crate::moignons_cavite::*;

pub fn _FACE_SEULE() -> Vec<Json> {
    vec![_cu("GND", "plane"), _di("C", 0.2, 4.3), _cu("TOP", "signal")]
}

pub fn _TRIPLAQUE() -> Vec<Json> {
    vec![_cu("G1", "plane"), _di("A", 0.2, 4.0), _cu("S", "signal"),
         _di("B", 0.2, 4.0), _cu("G2", "plane")]
}

/// `simuler(doc, garder_abcd=True, freqs_imposees=freqs)`
pub fn sim_abcd(doc: &Json, freqs: &[f64]) -> Resultat {
    simuler(&mut doc.clone(), None, true, Some(freqs)).unwrap_or_else(|e| panic!("ErreurSimulation : {}", e.message))
}

/// `np.allclose(a, b, rtol=1e-12, atol=0)` sur deux suites de complexes.
fn tout_proche(a: &[Complex64], b: &[Complex64]) -> bool {
    a.len() == b.len() && a.iter().zip(b).all(|(x, y)| (x - y).norm() <= 1e-12 * y.norm())
}

fn plat(m: &tl::Abcd) -> Vec<Complex64> {
    m.iter().flatten().copied().collect()
}

/// Une liste de [re, im] du resultat, en complexes.
fn cplx(l: &Json) -> Vec<Complex64> {
    els(l).iter().map(|v| Complex64::new(n(&v[0]), n(&v[1]))).collect()
}

/// gamma d'une ligne uniforme seule, lu sur son ABCD : A = ch(gamma l).
fn _gamma(abcd: &tl::Abcd, longueur_m: f64) -> Complex64 {
    abcd[0][0].acosh() / longueur_m
}

/// beta = w racine(L C) d'une ligne uniforme seule, lu sur son ABCD.
///
/// Depuis la 2.11.0 la ligne est un RLGC exact : Im gamma n'est plus beta
/// qu'au second ordre pres, (alpha_c - alpha_d)^2 / (2 beta^2). Mais
/// Z' = gamma Zc = R + j w L et Y' = gamma / Zc = G + j w C, avec
/// w L = beta Z0 et w C = beta / Z0 : Im Z' . Im Y' = beta^2 EXACTEMENT.
fn _beta_lc(abcd: &tl::Abcd, longueur_m: f64) -> f64 {
    let g = _gamma(abcd, longueur_m);
    let zc = (abcd[0][1] / abcd[1][0]).sqrt();
    ((g * zc).im * (g / zc).im).sqrt()
}

/// (le document, son resultat) ; `stack` : les options posees dans `stackup`.
fn _ligne_seule_p(couches: &[Json], couche: i64, longueur: f64, freqs: &[f64], largeur: f64, stack: Json) -> (Json, Resultat) {
    let mut d = _doc_via_c(vec![_piste_l(0.0, 0.0, longueur, 0.0, couche, largeur, None)],
                           couches, 1e9);
    maj(dans(&mut d, "stackup"), stack);
    let r = sim_abcd(&d, freqs);
    (d, r)
}

fn _ligne_seule(couches: &[Json], couche: i64, longueur: f64, freqs: &[f64]) -> (Json, Resultat) {
    _ligne_seule_p(couches, couche, longueur, freqs, 0.3, obj! {})
}

/// `[dict(c, tan_delta=0.0) if c["type"] == "dielectric" else c for c in _FACE_SEULE]`
fn sans_pertes() -> Vec<Json> {
    _FACE_SEULE().iter().map(|c| if t(&c["type"]) == "dielectric" { avec(c, &[("tan_delta", 0.0.j())]) } else { c.clone() }).collect()
}

/// Microruban : « micro » et h ; triplaque centree : « triplaque » et b
/// entre plans ; triplaque decentree, coplanaire ou mode de paire : pas de
/// hauteur, elle se deduit. Et la cascade calcule avec les MEMES options que
/// le tableau : alpha au point central = alpha de la cascade a fc.
fn la_section_recoit_sa_topologie_et_sa_hauteur() {
    let g = |info: &str, coplanaire: bool, couple: bool| _geometrie_pertes(&j(info), coplanaire, couple);
    assert!(g(r#"{"topo": "micro", "h": 2e-4}"#, false, false) == j(r#"{"topologie": "micro", "hauteur": 2e-4}"#));
    assert!(g(r#"{"topo": "strip", "h": 1e-4, "b": 4e-4, "dissym": 0.0}"#, false, false) ==
            j(r#"{"topologie": "triplaque", "hauteur": 4e-4}"#));
    assert!(g(r#"{"topo": "strip", "h": 1e-4, "b": 4e-4, "dissym": 0.8}"#, false, false) ==
            j(r#"{"topologie": "triplaque"}"#));
    assert!(g(r#"{"topo": "micro", "h": 2e-4}"#, true, false) == j(r#"{"topologie": "micro"}"#));
    assert!(g(r#"{"topo": "micro", "h": 2e-4}"#, false, true) == j(r#"{"topologie": "micro"}"#));
    let lg = 0.03;
    let (_d, r) = _ligne_seule(&_FACE_SEULE(), 2, lg * 1e3, &[1e9]);
    let seg = &r.json["segments"][0];
    let a_cascade = _gamma(&r.abcd[0], lg).re;
    let a_table = n(&seg["pertes_db"]) / 8.686 / lg;
    proche(a_cascade, a_table, 2e-3, "alpha de la cascade contre celle du tableau");
    // et c'est bien la hauteur de la section que `line_losses` a recue
    let (z, eps) = (n(&seg["z0"]), n(&seg["eps_eff"]));
    let (a_c, a_d) = tl::line_losses(z, eps, 0.3e-3, n(&seg["er"]), n(&seg["tan_delta"]), 1e9,
                                     &tl::OptionsPertes { epaisseur: 35e-6, hauteur: Some(n(&seg["h"]) * 1e-3),
                                                          topologie: Some("micro".into()), ..Default::default() }).unwrap();
    proche(a_c + a_d, a_table, 2e-3, "alpha du tableau contre line_losses(h donnee)");
}

/// Dielectrique sans perte : toute l'attenuation de la cascade est celle du
/// cuivre, et Rq = 1 um la multiplie par le K de Hammerstad-Groiss -- a la
/// resistance continue pres (0,2 %). Huray, borne par 1 + 3/2 SR. Zero : le
/// chiffre d'avant, au bit pres.
fn la_rugosite_multiplie_la_perte_du_cuivre() {
    let sans_pertes = sans_pertes();
    let (fs, lg) = ([1e9, 5e9, 20e9], 0.05);
    let (_, r0) = _ligne_seule(&sans_pertes, 2, lg * 1e3, &fs);
    let mut lisse = sans_pertes.clone();
    poser(&mut lisse[2], "rugosite_rms_um", 0.0);
    let (_, rz) = _ligne_seule(&lisse, 2, lg * 1e3, &fs);
    assert!(r0.abcd == rz.abcd,
            "une rugosite nulle change le resultat");
    let mut rug = sans_pertes.clone();
    poser(&mut rug[2], "rugosite_rms_um", 1.0);
    let (_, r1) = _ligne_seule(&rug, 2, lg * 1e3, &fs);
    let mut hu = sans_pertes.clone();
    maj(&mut hu[2], j(r#"{"modele_rugosite": "huray", "rayon_nodule_um": 0.5, "rapport_surface": 1.5}"#));
    let (_, r2) = _ligne_seule(&hu, 2, lg * 1e3, &fs);
    for (k, &f) in fs.iter().enumerate() {
        let a0 = _gamma(&r0.abcd[k], lg).re;
        let k_ham = _gamma(&r1.abcd[k], lg).re / a0;
        let k_hu = _gamma(&r2.abcd[k], lg).re / a0;
        proche(k_ham, tl::facteur_rugosite(f, 1e-6, "hammerstad", 0.0, 0.0), 3e-3,
               &format!("K de la cascade a {:.0} GHz (Hammerstad, Rq 1 um)", f / 1e9));
        proche(k_hu, tl::facteur_rugosite(f, 0.0, "huray", 0.5e-6, 1.5), 3e-3,
               &format!("K de la cascade a {:.0} GHz (Huray)", f / 1e9));
        assert!(1.0 < k_hu && k_hu < 1.0 + 1.5 * 1.5, "{}", k_hu);
    }
    assert!(r1.json["modeles"]["rugosite"] == vec![2i64].j(), "{}", dumps(&r1.json["modeles"]));
}

/// Triplaque : eps_eff = er, donc (beta causal / beta) ^ 2 = er(f) / er
/// EXACTEMENT. A f_ref la cascade est la meme au bit pres ; au-dessus, er
/// baisse et la phase avance ; au-dessous, l'inverse. Desactive par defaut.
fn le_dielectrique_causal_rend_la_fiche_a_f_ref() {
    let (fs, lg) = ([1e8, 1e9, 1e10], 0.002);
    let (_, r0) = _ligne_seule_p(&_TRIPLAQUE(), 2, lg * 1e3, &fs, 0.15, obj! {});
    let (_, r1) = _ligne_seule_p(&_TRIPLAQUE(), 2, lg * 1e3, &fs, 0.15,
                                 j(r#"{"dielectrique_causal": true, "f_ref_dielectrique": 1e9}"#));
    assert!(r0.json["modeles"]["dielectrique_causal"] == Json::Bool(false));
    assert!(r1.json["modeles"]["dielectrique_causal"] == Json::Bool(true));
    assert!(tout_proche(&plat(&r0.abcd[1]), &plat(&r1.abcd[1])),
            "a f_ref, le causal doit rendre la fiche");
    for (k, &f) in fs.iter().enumerate() {
        // beta = w racine(L C), et non Im gamma : voir `_beta_lc`. La
        // tolerance reste 1e-6, l'egalite reste exacte.
        let rapport = (_beta_lc(&r1.abcd[k], lg) / _beta_lc(&r0.abcd[k], lg)).powi(2);
        let (er_f, _) = tl::djordjevic_sarkar(4.0, 0.02, 1e9, f, 1e3, 1e12).unwrap();
        proche(rapport, er_f / 4.0, 1e-6, &format!("er(f)/er dans la vitesse de phase a {} Hz", fmt_g(f, 1)));
        // ET Im gamma S'EN ECARTE DE CE QUE LE RLGC DIT, pas davantage :
        // (alpha_c - alpha_d)^2 / (2 beta^2) <= (Re gamma / beta)^2 / 2.
        for r_ in [&r0, &r1] {
            let (g_, b_) = (_gamma(&r_.abcd[k], lg), _beta_lc(&r_.abcd[k], lg));
            let e = g_.im / b_ - 1.0;
            assert!(0.0 <= e && e <= 0.5 * (g_.re / b_).powi(2) + 1e-9,
                    "{} {} {}", f, g_, b_);
        }
    }
    assert!(_gamma(&r1.abcd[2], lg).im < _gamma(&r0.abcd[2], lg).im);
    assert!(_gamma(&r1.abcd[0], lg).im > _gamma(&r0.abcd[0], lg).im);
    // et le .s2p le dit
    assert!(t(&r1.json["touchstone"]).contains("Dielectrique causal") &&
            !t(&r0.json["touchstone"]).contains("causal"));
}

fn _doc_via_options(modele: Option<&str>, f_debut: f64, f_fin: f64) -> Json {
    let via = j(r#"{"drill_diameter": 0.25, "pad_diameter": 0.55,
           "antipad_diameter": 0.80, "layer_from": 0, "layer_to": 6}"#);
    let mut d = _doc_via(vec![_piste(0.0, 0.0, 10.0, 0.0, 0), _piste_via(10.0, 0.0, 20.0, 0.0, 6, &via)]);
    poser(&mut d, "analyse", obj! {"f_debut" => f_debut, "f_fin" => f_fin, "f_centre" => f_debut,
                                   "points" => 11i64});
    if let Some(m) = modele {
        poser(dans(&mut d, "stackup"), "modele_via", m);
    }
    d
}

/// Meme L, meme C : a 10 MHz la cascade avec le via en ligne est celle du
/// pi a 1e-5 pres ; a 40 GHz, ou le via n'est plus court, elles divergent.
/// « auto » garde le pi -- au bit pres -- sur une bande basse, et passe en
/// ligne sur une bande haute ; la fiche dit lequel a servi.
fn le_via_en_ligne_rejoint_le_pi() {
    let fs = [1e7, 4e10];
    let lance = |m: &str| {
        let r = sim_abcd(&_doc_via_options(Some(m), 1e7, 4e10), &fs);
        assert!(t(&tr0(&r.json)["modelise"]["modele_via"]) == m);
        r
    };
    let (s_pi_r, s_li_r) = (lance("pi"), lance("ligne"));
    let (a_pi, a_li) = (&s_pi_r.abcd, &s_li_r.abcd);
    // LES REACTANCES : la ligne porte en plus la resistance du barreau
    // (R' du coaxial, 1,8 milliohm a 10 MHz), que le pi n'a pas.
    proche(a_li[0][0][1].im, a_pi[0][0][1].im, 1e-5, "B (serie) a 10 MHz");
    proche(a_li[0][1][0].im, a_pi[0][1][0].im, 1e-5, "C (derivation) a 10 MHz");
    let dr = a_li[0][0][1].re - a_pi[0][0][1].re;
    assert!((0.0..5e-3).contains(&dr), "{:?} {:?}", a_li[0], a_pi[0]);
    let s_pi = tl::cascade_to_s(&a_pi[1], 50.0);
    let s_li = tl::cascade_to_s(&a_li[1], 50.0);
    assert!((s_li[0][0] - s_pi[0][0]).norm() > 1e-3, "{} {}", s_li[0][0], s_pi[0][0]);
    // « auto » : bande basse -> pi, au bit pres ; bande haute -> ligne
    let bas = sim(&_doc_via_options(Some("auto"), 1e8, 2e9));
    let bas_pi = sim(&_doc_via_options(Some("pi"), 1e8, 2e9));
    let tm = &tr0(&bas)["modelise"];
    assert!(t(&tm["modele_via"]) == "pi" && n(&tm["phase_via_rad"]) < SEUIL_VIA_LIGNE, "{}", dumps(tm));
    assert!(bas["s"] == bas_pi["s"], "sous le seuil, « auto » doit rendre le pi");
    let haut = sim(&_doc_via_options(None, 1e8, 4e10));
    let tm = &tr0(&haut)["modelise"];
    assert!(MODELE_VIA_DEFAUT == "auto" && t(&tm["modele_via_demande"]) == "auto");
    assert!(t(&tm["modele_via"]) == "ligne" && t(&tm["type"]).starts_with("ligne"), "{}", dumps(tm));
}

/// Le via en ligne porte les MEMES moignons que le pi (`_moignons`) : a la
/// resonance du moignon entier la liaison s'effondre, et le contre-percage la
/// releve -- comme avec le pi.
fn le_via_en_ligne_garde_le_moignon_et_le_contre_percage() {
    let via = _via_moignon(0, 8);
    let r0 = sim(&_doc_moignon_f(&_SIX(), 0, 4, &via, 1e9, 2e9));
    let f_res = n(&tr0(&r0)["moignons"]["arrivee"]["resonance_hz"]);
    let cp = avec(&via, &[("contre_percage", j(r#"{"cote": "dessous", "couche_garde": 4,
                                   "moignon_residuel_mm": 0.1}"#))]);

    let creux = |v: &Json| {
        let mut d = _doc_moignon_f(&_SIX(), 0, 4, v, f_res, f_res * 1.4);
        poser(dans(&mut d, "analyse"), "f_debut", f_res * 0.6);
        poser(dans(&mut d, "analyse"), "points", 41i64);
        poser(dans(&mut d, "stackup"), "modele_via", "ligne");
        let r = sim(&d);
        assert!(t(&tr0(&r)["modelise"]["modele_via"]) == "ligne");
        creux_s21(&r)
    };
    let (avant, apres) = (creux(&via), creux(&cp));
    assert!(avant < -20.0 && apres > avant + 20.0, "{} {}", avant, apres);
}

fn _doc_paire_vias(ecart_vias: f64, partenaire_connue: bool) -> Json {
    let vp = j(r#"{"drill_diameter": 0.3, "pad_diameter": 0.6, "layer_from": 0,
          "layer_to": 6, "x": 20.0, "y": 0.0, "net": "P"}"#);
    let vn = avec(&vp, &[("y", ecart_vias.j()), ("net", "N".j())]);

    let piste = |x1: f64, x2: f64, couche: i64, net: &str, y: f64, via: Option<&Json>| {
        avec(&_piste_l(x1, y, x2, y, couche, 0.2, via), &[("net", net.j())])
    };
    let mut voisinage = vec![piste(0.0, 20.0, 0, "N", 0.35, None),
                             piste(20.0, 40.0, 6, "N", 0.35, Some(&vn))];
    if !partenaire_connue {
        oter(&mut voisinage[1], "via");
    }
    obj! {"format" => "cao-sim-em-3", "net" => "P",
          "stackup" => obj! {"layers" => _QUATRE()},
          "geometry" => obj! {"objects" => vec![piste(0.0, 20.0, 0, "P", 0.0, None),
                                                piste(20.0, 40.0, 6, "P", 0.0, Some(&vp))]},
          "voisinage" => voisinage,
          "paires" => j(r#"[["P", "N"]]"#),
          "vias" => if partenaire_connue { vec![vn] } else { vec![] },
          "analyse" => j(r#"{"f_debut": 1e8, "f_fin": 2e10, "f_centre": 1e9,
                     "points": 11}"#)}
}

/// Deux futs de la paire, courants opposes en mode impair : L - M, d'autant
/// plus bas qu'ils sont proches -- Grover (`mutuelle_partielle`), et sans
/// retour M est EXACTEMENT la mutuelle partielle des deux futs. Le mode
/// commun prend L + M. Sans via de la partenaire dans le document, l'ecart
/// est celui de la paire, jamais moins que l'antipad.
fn la_mutuelle_des_futs_baisse_l_impair() {
    let mut vus = Vec::new();
    for e in [0.6, 1.0, 2.5] {
        let r = sim(&_doc_paire_vias(e, true));
        let m = r["s_diff"]["vias_mutuelle"][0].clone();
        assert!(t(&m["ecart_source"]) == "geometrie" && n(&m["ecart_mm"]) == e, "{}", dumps(&m));
        vus.push((n(&m["l_impair_nH"]), n(&m["m_impair_nH"]), n(&m["c_mutuelle_fF"]), r));
    }
    assert!(vus[0].0 < vus[1].0 && vus[1].0 < vus[2].0, "{:?}", vus.iter().map(|v| v.0).collect::<Vec<_>>());
    assert!(vus[0].2 > vus[1].2 && vus[1].2 > vus[2].2 && vus[2].2 >= 0.0, "{:?}", vus.iter().map(|v| v.2).collect::<Vec<_>>());
    // sans retour : la mutuelle partielle de Grover, au chiffre pres
    let tr = tr0(&vus[1].3);
    assert!(t(&tr["modelise"]["inductance_source"]) == "self", "{}", dumps(&tr["modelise"]));
    let h = n(&tr["cotes"]["hauteur_mm"]) * 1e-3;
    let m12 = tl::mutuelle_partielle(0.0, h, 0.0, h, 1.0e-3).unwrap();
    proche(vus[1].1 * 1e-9, m12, 1e-3, "M des futs a 1 mm contre Grover");
    // le mode impair voit la difference : |Sdd11| bouge entre 0,6 et 2,5 mm
    let dernier = |r: &Json| {
        let s = els(&r["s_diff"]["s_dd"]);
        cplx(&s[s.len() - 1])[0]
    };
    let (s06, s25) = (dernier(&vus[0].3), dernier(&vus[2].3));
    assert!((s06 - s25).norm() > 1e-3, "{} {}", s06, s25);
    // partenaire absente : l'ecart de la paire (0,35 mm) ramene a l'antipad
    let r = sim(&_doc_paire_vias(1.0, false));
    let m = &r["s_diff"]["vias_mutuelle"][0];
    assert!(t(&m["ecart_source"]) == "antipad" && n(&m["ecart_mm"]) >= 0.6, "{}", dumps(m));
}

/// La cascade differentielle -- celle de l'oeil -- prend er(f) dans ses
/// deux modes : identique a f_ref, plus rapide au-dessus.
fn le_dielectrique_causal_entre_dans_la_paire() {
    let fs = [1e9, 1e10];
    let d0 = _doc_paire_vias(1.0, true);
    let mut d1 = _doc_paire_vias(1.0, true);
    maj(dans(&mut d1, "stackup"), j(r#"{"dielectrique_causal": true, "f_ref_dielectrique": 1e9}"#));
    let r0 = sim_abcd(&d0, &fs);
    let r1 = sim_abcd(&d1, &fs);
    assert!(tout_proche(&plat(&r0.abcd_dd[0]), &plat(&r1.abcd_dd[0])));
    assert!(tout_proche(&cplx(&r0.json["s_diff"]["s_cc"][0]), &cplx(&r1.json["s_diff"]["s_cc"][0])));
    let p0 = cplx(&r0.json["s_diff"]["s_dd"][1])[2].arg();
    let p1 = cplx(&r1.json["s_diff"]["s_dd"][1])[2].arg();
    assert!((p1 - p0).abs() > 1e-3, "{} {}", p0, p1);
}

/// simulation_em 5.0.1 : en microruban, la cascade a la frequence du point
/// central rend la phase de la permittivite effective du TABLEAU (Getsinger
/// une fois). Avant, elle redispersait l'eps_eff deja disperse : beta trop
/// grand, d'autant plus que f est haute. 4 mm : beta l reste sous pi a
/// 10 GHz, ou arccosh se lit sans ambiguite.
fn la_cascade_ne_disperse_qu_une_fois() {
    let lg = 0.004;
    for f in [1e9, 10e9] {
        let d = _doc_via_c(vec![_piste_l(0.0, 0.0, lg * 1e3, 0.0, 2, 0.3, None)],
                           &_FACE_SEULE(), f);
        let r = sim_abcd(&d, &[f]);
        let seg = &r.json["segments"][0];
        let beta = _gamma(&r.abcd[0], lg).im;
        let eps_cascade = (beta * tl::C_0 / (2.0 * PI * f)).powi(2);
        proche(eps_cascade, n(&seg["eps_eff"]), 1e-3,
               &format!("eps_eff de la cascade a {:.0} GHz contre le tableau", f / 1e9));
    }
}

/// `_rugosite_section` : plan muet ou egal, les options de la piste telles
/// quelles ; plan declare, la sienne -- zero compris ; triplaque, les deux.
/// Et la cascade : un plan qui declare la rugosite de la piste rend la meme
/// ABCD au bit pres ; un plan lisse sous un ruban rugueux, le rapport des R
/// de `line_losses_detaillees(rugosite_plan={})`. La RF et le crosstalk
/// passent par la meme fonction.
fn la_section_passe_la_rugosite_de_son_plan() {
    let rs = |cou: &[Json], info: &str| _rugosite_section(cou, 2, &j(info));
    let mut cou = _FACE_SEULE();
    poser(&mut cou[2], "rugosite_rms_um", 1.0);
    let info = r#"{"topo": "micro", "plan_haut": "GND", "plan_bas": ""}"#;
    let piste = j(r#"{"modele_rugosite": "hammerstad", "rugosite_rms": 1e-6}"#);
    assert!(rs(&cou, info) == piste, "{}", dumps(&rs(&cou, info)));
    poser(&mut cou[0], "rugosite_rms_um", 1.0);
    assert!(rs(&cou, info) == piste);
    poser(&mut cou[0], "rugosite_rms_um", 0.0);
    assert!(rs(&cou, info) == avec(&piste, &[("rugosite_plan", obj! {})]), "{}", dumps(&rs(&cou, info)));
    maj(&mut cou[0], j(r#"{"modele_rugosite": "huray", "rayon_nodule_um": 0.5, "rapport_surface": 1.5}"#));
    let plan = rs(&cou, info)["rugosite_plan"].clone();
    assert!(t(&plan["modele_rugosite"]) == "huray" && n(&plan["rapport_surface"]) == 1.5
            && plan.as_objet().is_some_and(|o| o.len() == 3), "{}", dumps(&plan));
    proche(n(&plan["rayon_nodule"]), 0.5e-6, 1e-12, "rayon de nodule du plan");
    // piste lisse, plan rugueux
    let mut cou2 = _FACE_SEULE();
    poser(&mut cou2[0], "rugosite_rms_um", 2.0);
    assert!(rs(&cou2, info) == j(r#"{"rugosite_plan": {"modele_rugosite": "hammerstad",
                                                    "rugosite_rms": 2e-6}}"#));
    // un plan qu'on ne retrouve pas par son nom : celle de la piste
    assert!(rs(&cou2, r#"{"topo": "micro", "plan_haut": "AUTRE"}"#) == obj! {});
    // triplaque : les deux plans, chacun la sienne ou celle de la piste
    let mut tri = _TRIPLAQUE();
    poser(&mut tri[2], "rugosite_rms_um", 1.0);
    poser(&mut tri[4], "rugosite_rms_um", 3.0);
    let it = r#"{"topo": "strip", "plan_haut": "G1", "plan_bas": "G2"}"#;
    assert!(rs(&tri, it) == avec(&piste, &[("rugosite_plan", vec![
        piste.clone(), j(r#"{"modele_rugosite": "hammerstad", "rugosite_rms": 3e-6}"#)].j())]), "{}", dumps(&rs(&tri, it)));
    // la cascade, dielectrique sans perte
    let sans_pertes = sans_pertes();
    let (fs, lg) = ([1e9, 5e9, 20e9], 0.05);
    let mut rug = sans_pertes.clone();
    poser(&mut rug[2], "rugosite_rms_um", 1.0);
    let (_, r1) = _ligne_seule(&rug, 2, lg * 1e3, &fs);
    let mut egal = rug.clone();
    poser(&mut egal[0], "rugosite_rms_um", 1.0);
    let (_, re_) = _ligne_seule(&egal, 2, lg * 1e3, &fs);
    assert!(r1.abcd == re_.abcd,
            "un plan qui declare la rugosite de la piste change le resultat");
    let mut pl = rug.clone();
    poser(&mut pl[0], "rugosite_rms_um", 0.0);
    let (_, rp) = _ligne_seule(&pl, 2, lg * 1e3, &fs);
    let h = n(&rp.json["segments"][0]["h"]) * 1e-3;
    for (k, &f) in fs.iter().enumerate() {
        let a_p = _gamma(&rp.abcd[k], lg).re;
        let a_1 = _gamma(&r1.abcd[k], lg).re;
        // la hauteur donnee, R ne depend que de la section : le rapport des
        // alphas de la cascade est celui des R
        let o = tl::OptionsPertes { epaisseur: 35e-6, hauteur: Some(h), topologie: Some("micro".into()),
                                    rugosite_rms: 1e-6, ..Default::default() };
        let r_pl = tl::line_losses_detaillees(50.0, 3.0, 0.3e-3, 4.3, 0.0, f,
                                              &tl::OptionsPertes { rugosite_plan: Some(vec![tl::RugositePlan::default()]), ..o.clone() }).unwrap();
        let r_ru = tl::line_losses_detaillees(50.0, 3.0, 0.3e-3, 4.3, 0.0, f, &o).unwrap();
        assert!(a_p < a_1, "{} {} {}", f, a_p, a_1);
        proche(a_p / a_1, r_pl.r_ac_par_m / r_ru.r_ac_par_m, 3e-3,
               &format!("plan lisse sous ruban Rq 1 um a {:.0} GHz", f / 1e9));
    }
    // Les deux dernieres verifications du cas Python --
    // « la RF : la piste de masse de `rf_reseau` recoit la rugosite du plan »
    // (`rf_reseau._ligne(pl, ...)["kw_pertes"]["rugosite_plan"] == {}`, absent pour
    // `egal`) -- sont dans le banc de rf_reseau (`restes`).
}

/// `section_de_couche` : la plaque est le stratifie entier, et une couche
/// interne sans plan est refusee plutot que posee dans l'air.
fn sans_plan_n_a_que_la_couche_exterieure() {
    let couches = els(&j(r#"[
        {"type": "copper", "name": "Top", "thickness": 0.035},
        {"type": "dielectric", "name": "a", "thickness": 0.6,
         "epsilon_r": 4.0},
        {"type": "copper", "name": "In1", "thickness": 0.035},
        {"type": "dielectric", "name": "b", "thickness": 1.0,
         "epsilon_r": 4.6},
        {"type": "copper", "name": "Bot", "thickness": 0.035}
    ]"#)).to_vec();
    let (geo, _info) = section_de_couche(&couches, 0, 0.3, 0.035, 0.3, Some(0.3), &[], true);
    let geo = geo.unwrap();
    assert!(t(&geo["kind"]) == "sans_plan" && (n(&geo["h"]) - 1.6e-3).abs() < 1e-12);
    assert!((n(&geo["epsilon_r"]) - (0.6 * 4.0 + 1.0 * 4.6) / 1.6).abs() < 1e-12);
    let (geo, raison) = section_de_couche(&couches, 2, 0.3, 0.035, 0.3, Some(0.3), &[], true);
    assert!(geo.is_none() && t(&raison).contains("interne"), "{}", dumps(&raison));
    // SANS LE DRAPEAU, RIEN NE CHANGE : les autres onglets gardent leur refus.
    let (geo, _r) = section_de_couche(&couches, 0, 0.3, 0.035, 0.3, Some(0.3), &[], false);
    assert!(geo.is_none());
}

/// Triplaque : ame de 1,0 mm a er 4,6 au-dessus, prepreg de 0,1 mm a
/// er 3,6 en dessous -- l'empilage quatre couches ordinaire.
fn _deux_dielectriques(w_mm: f64) -> (Json, tl::Ligne) {
    let couches = els(&j(r#"[{"name": "G1", "type": "copper", "thickness": 0.035, "role": "plane"},
               {"name": "ame", "type": "dielectric", "thickness": 1.0,
                "epsilon_r": 4.6, "tan_delta": 0.02},
               {"name": "S", "type": "copper", "thickness": 0.035, "role": "signal"},
               {"name": "pp", "type": "dielectric", "thickness": 0.1,
                "epsilon_r": 3.6, "tan_delta": 0.02},
               {"name": "G2", "type": "copper", "thickness": 0.035, "role": "plane"}]"#)).to_vec();
    let (geo, _info) = section(&couches, 2, w_mm, 0.035);
    let r = ligne(&geo);
    (geo, r)
}

/// Le champ est du cote du plan PROCHE. Deux etalons independants du
/// solveur :
///   · RUBAN LARGE (w = 10 mm, w/h = 100) : deux condensateurs plans en
///     parallele, eps_eff = (er1/h1 + er2/h2)/(1/h1 + 1/h2) = 3,6909 --
///     analytique. 1 % : ce que le champ de bord laisse a w/h = 100 (mesure
///     +0,26 %). La moyenne a l'epaisseur rendait 4,509 (+22 %).
///   · 0,15 mm / 35 um : volumes finis 2D a cuivre epais (grille graduee,
///     energie ; audit du 2026-11-10, valides a 0,5-1 % sur Hammerstad-
///     Jensen et Cohn) : 45,73 ohms, eps_eff 3,957. 2,5 % : le 1 % de
///     l'etalon plus les flancs du cuivre, que le ruban mince elargi ne
///     place pas dans l'ame (mesure +1,2 % et -1,4 %). Avant : 43,03 ohms
///     (-5,9 %) et 4,509 (+14 %).
fn deux_dielectriques_ne_se_moyennent_pas() {
    let (geo, r) = _deux_dielectriques(10.0);
    assert!(geo["strates"].vrai(), "les deux dielectriques doivent partir en strates");
    proche(r.eps_eff, (3.6 / 0.1 + 4.6 / 1.0) / (1.0 / 0.1 + 1.0 / 1.0), 0.01,
           "eps_eff du ruban large, plaques paralleles");
    let (geo, r) = _deux_dielectriques(0.15);
    proche(r.z0, 45.73, 0.025, "Z0 contre volumes finis");
    proche(r.eps_eff, 3.957, 0.025, "eps_eff contre volumes finis");
    // ET LA PAIRE SUIT : meme milieu pour `solve_multiline`.
    let geo = avec(&geo, &[("conducteurs", j(r#"[{"w": 0.15e-3, "x": 0.0},
                                 {"w": 0.15e-3, "s": 0.15e-3}]"#))]);
    let rm = tl::solve_multiline(&geometrie(&geo)).unwrap();
    let e = rm.paire.as_ref().unwrap().eps_eff_impair;
    assert!(3.6 < e && e < 4.2, "{}", e);
}

/// Sans dielectriques differents, `strates` ne part pas : le calcul est
/// celui d'avant AU BIT PRES. Et la meme section passee de force par la
/// multicouche rend le meme chiffre a 1e-9.
fn un_empilage_homogene_ne_change_pas() {
    let cu = |nom: &str, role: &str| obj! {"name" => nom, "type" => "copper", "thickness" => 0.035, "role" => role};

    let di = |ep: f64| obj! {"name" => "d", "type" => "dielectric", "thickness" => ep,
                             "epsilon_r" => 4.3, "tan_delta" => 0.02};
    let quatre = vec![cu("T", "signal"), di(0.2), cu("G", "plane"), di(0.8),
                      cu("S", "signal"), di(0.2), cu("B", "plane")];
    for couche in [0, 4] {
        let (geo, _info) = section(&quatre, couche, 0.3, 0.035);
        assert!(!contient(&geo, "strates"), "{}", dumps(&geo));
    }
    let geo = j(r#"{"kind": "strip", "w": 0.15e-3, "t": 35e-6, "b": 1.135e-3,
           "y0": 0.1175e-3, "epsilon_r": 4.3}"#);
    let a = ligne(&geo);
    let b = ligne(&avec(&geo, &[("strates", j(r#"{"dessous": [[4.3, 0.1e-3]],
                                      "dessus": [[4.3, 1.0e-3]],
                                      "plan_dessus": true}"#))]));
    proche(b.z0, a.z0, 1e-9, "triplaque homogene par la multicouche");
    let geo = j(r#"{"kind": "micro", "w": 0.3e-3, "t": 35e-6, "h": 0.2e-3,
           "epsilon_r": 4.3, "ecart": 0.15e-3,
           "masque": {"epaisseur": 25e-6, "epsilon_r": 3.8}}"#);
    let a = ligne(&geo);
    let b = ligne(&avec(&geo, &[("strates", j(r#"{"dessous": [[4.3, 0.2e-3]],
                                      "dessus": [[3.8, 25e-6]]}"#))]));
    proche(b.z0, a.z0, 1e-9, "coplanaire verni par la multicouche");
    proche(b.eps_eff, a.eps_eff, 1e-9, "eps_eff, idem");
}

/// Basse frequence : 100 mm de piste 0,1 mm x 35 um, a 1 Hz. La ligne est
/// un RLGC exact (`ligne_a_pertes`), donc electriquement courte elle EST sa
/// resistance continue en serie, sans fuite :
///   · B -> R_dc l = l / (sigma w t) = 0,4926 ohm. 1 % : a 1 Hz l'effet de
///     peau et le plan n'ajoutent que 1e-4. Avec Z0 reel : 0,2463, la moitie.
///   · Re C -> G l, nul au tan delta pres (w C tan d l ~ 1e-13 S). Avec Z0
///     reel : 3,8e-5 S, soit R l / (2 Z0^2).
///   · bout ouvert : |Z| = 1/(w C l) ~ 1e10 ohms. Avec Z0 reel : 26,5 kohm.
/// Et sans pertes, `ligne_a_pertes` rend Z0 et j beta exactement.
fn la_ligne_a_pertes_a_sa_resistance_en_serie() {
    let couches = vec![_cu("TOP", "signal"), _di("core", 0.2, 4.3), _cu("GND", "plane")];
    let d = _doc_via_c(vec![_piste_l(0.0, 0.0, 100.0, 0.0, 0, 0.1, None)], &couches,
                       1e3);
    let r = sim_abcd(&d, &[1.0]);
    let m = &r.abcd[0];
    let r_dc = 0.1 / (5.8e7 * 0.1e-3 * 35e-6);
    proche(m[0][1].re, r_dc, 0.01, "le terme serie B, contre R continu");
    assert!(m[1][0].re.abs() < 1e-9, "conductance parasite : {:.3e} S", m[1][0].re);
    let z_ouvert = (m[0][0] / m[1][0]).norm();
    assert!(z_ouvert > 1e8, "ligne ouverte vue a {:.3e} ohms", z_ouvert);
    let (zc, g) = tl::ligne_a_pertes(50.0, 0.0, 0.0, 12.5);
    assert!(zc == Complex64::new(50.0, 0.0) && (g - Complex64::new(0.0, 12.5)).norm() < 1e-12, "{} {}", zc, g);
    // FAIBLES PERTES : Zc -> Z0 et gamma -> alpha + j beta, au second ordre.
    let (zc, g) = tl::ligne_a_pertes(50.0, 0.3, 0.2, 100.0);
    assert!((zc / 50.0 - 1.0).norm() < 2e-3 && (g / Complex64::new(0.5, 100.0) - 1.0).norm() < 1e-5, "{} {}", zc, g);
}

/// Le drapeau du solveur devient UNE phrase dans la fiche, pas une par
/// troncon ; une piste loin de tout cuivre n'en dit rien.
fn les_flancs_en_regard_remontent_en_avertissement() {
    assert!(tl::_flancs_en_regard(Some(0.66), 35e-6, &[0.0, 200e-6]));
    assert!(!tl::_flancs_en_regard(Some(0.66), 35e-6, &[0.0, 220e-6]));
    assert!(!tl::_flancs_en_regard(Some(0.66), 0.0, &[100e-6]));
    assert!(!tl::_flancs_en_regard(None, 35e-6, &[100e-6])); // triplaque

    let fiche = |gap: f64| -> Vec<String> {
        let doc = _doc_via(vec![avec(&_piste(0.0, 0.0, 15.0, 0.0, 0), &[("gap", gap.j())]),
                                avec(&_piste(15.0, 0.0, 30.0, 0.0, 0), &[("gap", gap.j())])]);
        avertis(&sim(&doc)).into_iter().filter(|a| a.contains("flancs face à face")).collect()
    };
    assert!(fiche(0.1).len() == 1, "{:?}", fiche(0.1));
    assert!(fiche(0.0).is_empty());
}

pub fn banc() {
    titre("Les options de ligne_mom dans la cascade (simulation_em 5.0.0)");
    T("le dielectrique causal entre dans la paire", le_dielectrique_causal_entre_dans_la_paire);
    T("la section donne sa topologie et sa hauteur aux pertes", la_section_recoit_sa_topologie_et_sa_hauteur);
    T("la rugosite multiplie la perte du cuivre de la cascade par K", la_rugosite_multiplie_la_perte_du_cuivre);
    T("le dielectrique causal rend la fiche a f_ref, er(f) dans la phase", le_dielectrique_causal_rend_la_fiche_a_f_ref);
    T("le via en ligne rejoint le pi en basse frequence, « auto » choisit", le_via_en_ligne_rejoint_le_pi);
    T("le via en ligne garde le moignon et le contre-percage", le_via_en_ligne_garde_le_moignon_et_le_contre_percage);
    T("la mutuelle des futs de la paire : plus proches, L impair plus bas", la_mutuelle_des_futs_baisse_l_impair);
    T("la cascade ne disperse le microruban qu'une fois (Getsinger)", la_cascade_ne_disperse_qu_une_fois);
    T("la section passe la rugosite de son plan de reference", la_section_passe_la_rugosite_de_son_plan);
    titre("Sans plan : ligne coplanaire dans l'air, contre la transformation conforme");
    T("sans plan : la plaque est le stratifie entier, couche externe seule", sans_plan_n_a_que_la_couche_exterieure);
    titre("Audit de justesse numerique : deux dielectriques, quadrature, coude");
    T("deux dielectriques differents : plaques paralleles et volumes finis", deux_dielectriques_ne_se_moyennent_pas);
    T("un empilage homogene ne part pas en strates et rend le meme chiffre", un_empilage_homogene_ne_change_pas);
    T("la ligne a pertes a sa resistance en serie : B -> R continu, pas de fuite", la_ligne_a_pertes_a_sa_resistance_en_serie);
    titre("Le cuivre epais contre Hammerstad-Jensen 1980 et les differences finies");
    T("les flancs en regard remontent en un avertissement, un seul", les_flancs_en_regard_remontent_en_avertissement);
}
