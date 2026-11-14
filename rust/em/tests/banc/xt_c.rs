//! python/test/banc-crosstalk.py, troisieme partie : l'impedance commune d'une fente (Ott,
//! puis le PEEC), les formules du niveau 2, la triplaque exacte, les classes d'interface.
//!
//! EN ATTENTE DE rf_reseau : « rf_reseau : deux instances SPICE ont chacune leurs noeuds
//! internes » (`rf_reseau.ModeleSpice`). EN ATTENTE DE analyse_carte : la comparaison au fil
//! fin (`analyse_carte._kb_larges_faces`) du cas « deux niveaux », dont le reste est porte.

use crate::xt::*;
use crate::*;
use std::sync::Arc;

// ==========================================================================
// L'IMPEDANCE COMMUNE D'UNE FENTE (Ott), 4.5.0 : le cas 4 du banc de mesure
// --------------------------------------------------------------------------
// Fente de +-10 mm coupant tous les plans, pistes de 0,35 mm a 1,4 mm d'axe
// a axe, 50 ohm : l'estimation faite a la main dans docs/HISTORIQUE_DEVELOPPEMENT.md donne une self
// de detour d'environ 16 nH, une mutuelle d'environ 11 nH, soit ~10 % a chaque
// bout de la victime a 1 ns et ~2 % a 5 ns -- contre 0,9 % pour les lignes
// couplees seules. C'est l'ordre de grandeur que le terme doit retrouver.
// ==========================================================================

/// `ct.impedance_commune_fente(d1, d2, w_a, entraxe, t_r, z0, hauteur, w_v, eps_plan)`
fn icf(d1: f64, d2: f64, w_a: f64, entraxe: f64, t_r: f64, z0: f64, hauteur: f64, w_v: Option<f64>, eps_plan: f64, resonance: bool) -> Json {
    ct::impedance_commune_fente(d1, d2, w_a, entraxe, t_r, z0, hauteur, w_v, eps_plan, resonance, false)
}

/// `ct.niveau2(morceaux, t_r)` sur des triplets (Kb, Kf, dT)
fn niveau2(morceaux: &[(f64, f64, f64)], t_r: f64, att_fext: f64) -> Json {
    let m: Vec<ct::Morceau> = morceaux.iter().map(|m| (m.0, m.1, m.2, 1.0)).collect();
    ct::niveau2(&m, t_r, ct::SEUIL_ORANGE, ct::SEUIL_ROUGE, att_fext)
}

/// Un cas joue avec un autre plafond de branches, remis ensuite quoi qu'il arrive.
fn avec_branches<R>(n: usize, f: impl FnOnce() -> R) -> R {
    let ancien = ct::peec_branches_max();
    ct::regler_peec_branches_max(n);
    let r = std::panic::catch_unwind(std::panic::AssertUnwindSafe(f));
    ct::regler_peec_branches_max(ancien);
    r.unwrap_or_else(|e| std::panic::resume_unwind(e))
}

const UN_PLAN: &[(&str, Cuivre)] = &[("GND", &fente_droite)];

/// Le terme, a la main, sur le cas 4 : L_d ~ 16 nH, M ~ 11 nH, ~10 % a
/// 1 ns, ~2 % a 5 ns -- et la fourchette l'encadre.
fn l_impedance_commune_retrouve_l_estimation_de_ott() {
    let t = icf(10.0, 10.0, 0.35, 1.4, 1e-9, 50.0, 0.21,
                Some(0.35), 4.5, true);
    // LA SELF DU DETOUR : deux demi-boucles de 2d en parallele redonnent la
    // formule d'Ott pour la fente entiere, L = mu0/2pi . D . ln(D/W), D = 2d.
    let l_ott = 1e9 * 2e-7 * 0.020 * (0.020f64 / 0.00035).ln();
    assert!((n(&t["ld_nh"]) / l_ott - 1.0).abs() < 0.02, "{} {l_ott}", n(&t["ld_nh"]));
    assert!(15.0 < n(&t["ld_nh"]) && n(&t["ld_nh"]) < 17.5, "{}", n(&t["ld_nh"]));
    assert!(10.0 < n(&t["m_nh"]) && n(&t["m_nh"]) < 11.5, "{}", n(&t["m_nh"]));
    // ~10 % A CHAQUE BOUT A 1 NS, le meme module en NEXT et en FEXT.
    assert!(0.095 < n(&t["next"]) && n(&t["next"]) < 0.115, "{}", n(&t["next"]));
    assert!(t["fext"] == t["next"], "{} {}", n(&t["fext"]), n(&t["next"]));
    // LA FOURCHETTE ENCADRE LA VALEUR CENTRALE, et sa borne haute est M = L_d.
    let (bas, haut) = (n(&t["fourchette"][0]), n(&t["fourchette"][1]));
    assert!(bas < n(&t["next"]) && n(&t["next"]) < haut, "{bas} {} {haut}", n(&t["next"]));
    assert!((n(&t["m_haut_nh"]) - n(&t["ld_nh"])).abs() < 1e-6, "{} {}", n(&t["m_haut_nh"]), n(&t["ld_nh"]));
    assert!(0.5 < n(&t["k"]) && n(&t["k"]) < 1.0, "{}", n(&t["k"]));
    // A 5 NS : cinq fois moins, ~2 %.
    let t5 = icf(10.0, 10.0, 0.35, 1.4, 5e-9, 50.0, 0.21,
                 Some(0.35), 4.5, true);
    assert!(0.019 < n(&t5["next"]) && n(&t5["next"]) < 0.023, "{}", n(&t5["next"]));
    assert!((n(&t5["next"]) * 5.0 / n(&t["next"]) - 1.0).abs() < 0.02, "{} {}", n(&t5["next"]), n(&t["next"]));
    // DEUX RETOURS CONFONDUS (entraxe sous la largeur) : la mutuelle vaut la
    // self, le terme est a sa borne haute.
    let tc = icf(10.0, 10.0, 0.35, 0.1, 1e-9, 50.0, 0.21, None, 1.0, true);
    assert!((n(&tc["m_nh"]) - n(&tc["ld_nh"])).abs() < 1e-6, "{} {}", n(&tc["m_nh"]), n(&tc["ld_nh"]));
    // UN DETOUR NUL COURT-CIRCUITE : pas de fente, pas de terme.
    assert!(n(&icf(0.0, 10.0, 0.35, 1.4, 1e-9, 50.0, 0.0, None, 1.0, true)["next"]) == 0.0);
    // UN FRONT TRES RAIDE NE FAIT PAS EXPLOSER LE TERME : la self du detour
    // lisse la pente, et le terme reste sous M / L_d.
    let tr = icf(10.0, 10.0, 0.35, 1.4, 20e-12, 50.0, 0.21,
                 Some(0.35), 1.0, true);
    assert!(n(&tr["next"]) <= n(&tr["k"]) + 1e-9, "{} {}", n(&tr["next"]), n(&tr["k"]));
}

/// Le document d'essai a une victime a 0,45 mm, front de 1 ns, et ses fentes.
fn doc_fentes(fentes: Vec<Json>, t_r: f64) -> Json {
    doc_avec(doc_essai(vec![pis(0.0, 0.45, 40.0, 0.45, "VIC")], &[("t_r", t_r.j())]), "fentes", fentes)
}

/// De bout en bout : la fente mesuree par la page (d1 / d2, tous les
/// plans coupes) AJOUTE son terme au niveau 2, le dit, et pose son pic sur
/// la carte locale. La reserve grave « terme absent » disparait.
fn une_fente_franchie_par_les_deux_ajoute_le_terme_d_ott() {
    let muette = an(&doc_fentes(vec![j(r#"{"s": 19.0, "longueur": 2.0, "plans": ["GND"],
                                           "quoi": "pas de cuivre de masse sous le parcours"}"#)], 1e-9));
    let chiffree = an(&doc_fentes(vec![fente_mesuree(19.0, 2.0, &["GND"], 10.0, 10.0, &[], false)], 1e-9));
    let (cm, cc) = (couple(&muette, "VIC").unwrap(), couple(&chiffree, "VIC").unwrap());
    assert!(!contient(&cm, "fente") && cc["fente"].vrai(), "{} {}", dumps(&cm["fente"]), dumps(&cc["fente"]));
    // LE TERME EST CELUI DE LA FORMULE, a l'entraxe de la paire (0,45 mm) et
    // au Z0 de l'agresseur sur son bloc.
    let t = &cc["fente"]["detail"][0];
    let direct = icf(10.0, 10.0, 0.25, 0.45, 1e-9, n(&t["z0"]),
                     n(&t["hauteur"]), Some(0.25),
                     n(&t["resonance"]["eps_plan"]), true);
    // 2e-4 : la fiche rend Z0 au centieme d'ohm (1e-4 a 50 ohms) et le terme
    // a six decimales ; a 1e-6 l'essai tenait a la chance de l'arrondi.
    assert!((n(&t["next"]) / n(&direct["next"]) - 1.0).abs() < 2e-4, "{} {}", n(&t["next"]), n(&direct["next"]));
    assert!(n(&t["next"]) > 0.05, "{}", n(&t["next"]));
    // IL S'AJOUTE : les lignes seules sont le chiffre d'avant, le total les
    // depasse du terme, en NEXT comme en FEXT.
    assert!((n(&cc["lignes"]["next"]) - n(&cm["next"])).abs() < 1e-9, "{} {}", dumps(&cc["lignes"]), n(&cm["next"]));
    assert!((n(&cc["next"]) - (n(&cm["next"]) + n(&cc["fente"]["next"]))).abs() < 1e-6, "{}", n(&cc["next"]));
    assert!((n(&cc["fext"]) - (n(&cm["fext"]) + n(&cc["fente"]["fext"]))).abs() < 1e-6, "{}", n(&cc["fext"]));
    let (bas, haut) = (n(&cc["next_fourchette"][0]), n(&cc["next_fourchette"][1]));
    assert!(bas <= n(&cc["next"]) && n(&cc["next"]) <= haut && haut > bas, "{}", dumps(&cc["next_fourchette"]));
    // LE PIC DE LA CARTE LOCALE TOMBE SUR LA FENTE, vers 20 mm.
    let (x_pic, v_pic) = pic(&chiffree, "VIC", "next");
    assert!((18.5..=21.5).contains(&x_pic), "{x_pic}");
    assert!(v_pic > pic(&muette, "VIC", "next").1 + 0.5 * n(&t["next"]), "{v_pic} {}", n(&t["next"]));
    // LA FICHE LE DIT, et la reserve « terme absent » ne s'applique plus.
    assert!(avertis(&chiffree).iter().any(|a| a.contains("IMPÉDANCE COMMUNE est chiffré")), "{:?}", avertis(&chiffree));
    assert!(!titres(&chiffree).contains("plan de référence absent sous"), "{}", titres(&chiffree));
    assert!(titres(&muette).contains("plan de référence absent sous"), "{}", titres(&muette));
    assert!(chiffree["fentes"]["chiffrees"] == 1i64.j() && !chiffree["fentes"]["signalees"].vrai());
    assert!(els(&chiffree["hypotheses"]).iter().any(|h| t_(h).contains("Ott")));
    // LE STATUT SUIT LE TOTAL : un terme de plus de 7 % rend la paire rouge.
    assert!(t_(&cc["statut"]) == "rouge" && t_(&cm["statut"]) != "rouge", "{} {}", t_(&cc["statut"]), t_(&cm["statut"]));
}

/// `t(v)` du banc, la ou `t` nomme un terme de fente.
fn t_(v: &Json) -> &str {
    crate::t(v)
}

/// Le terme ne vaut que si la victime FRANCHIT la fente : une fente qui
/// s'arrete avant elle, de son cote, n'a pas de retour commun. Et c'est le
/// cote qui compte -- d1 a gauche du sens de marche, d2 a droite.
fn une_fente_qui_n_atteint_pas_la_victime_n_ajoute_rien() {
    // La victime a +0,45 mm : a GAUCHE d'un agresseur qui va vers +x.
    let lancer = |d1: f64, d2: f64| an(&doc_fentes(vec![fente_mesuree(19.0, 2.0, &["GND"], d1, d2, &[], false)], 1e-9));

    let courte = lancer(0.3, 10.0);
    let c = couple(&courte, "VIC").unwrap();
    assert!(!contient(&c, "fente"), "{}", dumps(&c["fente"]));
    assert!(courte["fentes"]["chiffrees"] == 0i64.j());
    assert!(els(&courte["fentes"]["signalees"]).iter().any(|s| t(&s["cause"]) == "hors fente"),
            "{}", dumps(&courte["fentes"]["signalees"]));
    // LA RESERVE D'AVANT RESTE : le terme n'a pas ete chiffre.
    assert!(titres(&courte).contains("plan de référence absent sous"));
    // LE MEME DETOUR COURT DE L'AUTRE COTE ne gene pas : la fente va jusqu'a
    // la victime a gauche.
    let longue = lancer(10.0, 0.3);
    let c2 = couple(&longue, "VIC").unwrap();
    assert!(c2["fente"].vrai(), "la fente franchie a gauche doit avoir son terme");
    assert!(longue["fentes"]["chiffrees"] == 1i64.j());
}

/// Le cas 4b du banc : la fente coupe le plan proche, le lointain reste.
/// Le retour change de plan au lieu de contourner : PAS de terme d'Ott, le
/// calcul de la 3.3.0 (section retombee sur l'autre plan) est garde, et la
/// fiche le signale comme ce que la mesure doit departager.
fn une_fente_sur_un_seul_plan_garde_le_calcul_sur_l_autre() {
    let lancer = |fente: Json| an(&doc_avec(doc_fentes(vec![fente], 1e-9), "stackup", DEUX_PLANS()));
    let de_cause = |res: &Json, cause: &str| els(&res["fentes"]["signalees"]).iter().any(|s| t(&s["cause"]) == cause);

    let avant = couple(&lancer(j(r#"{"s": 10.0, "longueur": 20.0, "plans": ["GND1"],
                                     "quoi": "GND1 n'a pas de cuivre de retour"}"#)), "VIC").unwrap();
    let res = lancer(fente_mesuree(10.0, 20.0, &["GND1"], 10.0, 10.0, &["GND2"], false));
    let c = couple(&res, "VIC").unwrap();
    assert!(!contient(&c, "fente"), "{}", dumps(&c["fente"]));
    assert!((n(&c["next"]) - n(&avant["next"])).abs() < 1e-9, "{} {}", n(&c["next"]), n(&avant["next"]));
    assert!(de_cause(&res, "retour"));
    let txt = avertis(&res).join(" | ");
    assert!(txt.contains("SANS terme d'impédance commune") && txt.contains("GND2"), "{txt}");
    // UNE PAGE QUI NE NOMME PAS `retour` : il se deduit de l'empilage, et le
    // verdict est le meme.
    let res2 = lancer(doc_avec(fente_mesuree(10.0, 20.0, &["GND1"], 10.0, 10.0, &[], false), "retour", Json::Nul));
    assert!(!contient(&couple(&res2, "VIC").unwrap(), "fente"));
    assert!(de_cause(&res2, "retour"));
    // ET LES DEUX PLANS COUPES : le terme vaut.
    let res3 = lancer(fente_mesuree(10.0, 20.0, &["GND1", "GND2"], 10.0, 10.0, &[], false));
    assert!(couple(&res3, "VIC").unwrap()["fente"].vrai(), "tous les plans coupes : le terme vaut");
}

/// Option C : tan(beta d)/(beta d) au genou du front, Q ~ 50. Negligeable
/// a 1 ns, sensible a 100 ps -- une fente de 20 mm dans du FR-4 resonne vers
/// 3,5 GHz.
fn la_resonance_de_la_fente_ne_compte_que_sous_300_ps() {
    let lent = icf(10.0, 10.0, 0.35, 1.4, 1e-9, 50.0, 0.21,
                   Some(0.35), 4.5, true);
    assert!(n(&lent["resonance"]["facteur"]) < 1.05, "{}", dumps(&lent["resonance"]));
    assert!(!lent["resonance"]["sensible"].vrai());
    let sans = icf(10.0, 10.0, 0.35, 1.4, 1e-9, 50.0, 0.21,
                   Some(0.35), 4.5, false);
    assert!((n(&lent["next"]) / n(&sans["next"]) - 1.0).abs() < 0.02, "{} {}", n(&lent["next"]), n(&sans["next"]));
    let f_q = n(&lent["resonance"]["f_quart_onde"]);
    assert!(3.2e9 < f_q && f_q < 3.8e9, "{f_q}");
    let raide = icf(10.0, 10.0, 0.35, 1.4, 100e-12, 50.0,
                    0.21, Some(0.35), 4.5, true);
    assert!(n(&raide["resonance"]["facteur"]) > 2.0, "{}", dumps(&raide["resonance"]));
    assert!(raide["resonance"]["sensible"].vrai());
    let raide_sans = icf(10.0, 10.0, 0.35, 1.4, 100e-12,
                         50.0, 0.21, Some(0.35), 4.5,
                         false);
    assert!(n(&raide["next"]) > n(&raide_sans["next"]), "{} {}", n(&raide["next"]), n(&raide_sans["next"]));
    // LE FACTEUR LUI-MEME : 1 au continu, borne par la perte au quart d'onde.
    assert!(ct::facteur_resonance(10.0, 4.5, 0.0) == 1.0);
    let pic_r = ct::facteur_resonance(10.0, 4.5, f_q);
    assert!(10.0 < pic_r && pic_r < 2.0 * ct::FENTE_Q, "{pic_r}");
    // ET DE BOUT EN BOUT, la fiche dit quand elle a pese.
    let res = an(&doc_fentes(vec![fente_mesuree(19.0, 2.0, &["GND"], 10.0, 10.0, &[], false)], 100e-12));
    let c = couple(&res, "VIC").unwrap();
    assert!(c["fente"]["resonance_sensible"].vrai());
    assert!(avertis(&res).iter().any(|a| a.contains("RÉSONANCE de la fente a pesé")));
}

/// Option B : la page envoie l'image du plan autour du franchissement, le
/// serveur y RESOUT le courant de retour (PEEC). Sur la fente etroite du
/// cas 4 (2 mm), le detour vaut ~4,5 nH et non 16 : les deux bords portent
/// des courants opposes qui se compensent. Le terme d'Ott reste dans la
/// fourchette, dont il tient la borne haute.
fn une_fente_avec_son_image_est_resolue_et_ott_l_encadre() {
    let d = doc_fentes(vec![fente_imagee(UN_PLAN, &[], &Json::Nul, &["GND"])], 1e-9);
    let res = an(&d);
    let (c, t) = le_terme(&res, "VIC");
    assert!(t.vrai() && t_(&t["modele"]) == "B", "{}", dumps(&t));
    assert!(3.0 < n(&t["ld_nh"]) && n(&t["ld_nh"]) < 6.0 && 0.0 < n(&t["m_nh"]) && n(&t["m_nh"]) <= n(&t["ld_nh"]), "{}", dumps(&t));
    assert!(0.01 < n(&t["next"]) && n(&t["next"]) < n(&t["ott"]["next_pc"]) / 100.0, "{}", dumps(&t));
    assert!(n(&t["fourchette"][0]) <= n(&t["next"]) &&
            n(&t["fourchette"][1]) >= n(&t["ott"]["fourchette_pc"][1]) / 100.0 - 1e-4, "{}", dumps(&t));
    // IL S'AJOUTE AUX LIGNES, comme le terme d'Ott, et la fiche le dit.
    assert!((n(&c["next"]) - (n(&c["lignes"]["next"]) + n(&c["fente"]["next"]))).abs() < 1e-6);
    assert!(avertis(&res).iter().any(|a| a.contains("RÉSOLU")), "{:?}", avertis(&res));
    assert!(!titres(&res).contains("plan de référence absent sous"));
    // CONVERGE : deux fois plus de mailles ne change pas le detour de 5 %.
    let ancien = ct::peec_branches_max();
    let t_fin = avec_branches(2 * ancien, || le_terme(&an(&d), "VIC").1);
    assert!((n(&t_fin["ld_nh"]) / n(&t["ld_nh"]) - 1.0).abs() < 0.05, "{} {}", n(&t_fin["ld_nh"]), n(&t["ld_nh"]));
    // HORS BUDGET MEME AU MAILLAGE LE PLUS LACHE : Ott, et c'est dit -- pas
    // une matrice de plusieurs Go (fentes de Leko : vingt minutes d'audit).
    let res_b = avec_branches(10, || an(&d));
    let (_c, t_b) = le_terme(&res_b, "VIC");
    assert!(t_b.vrai() && t_(&t_b["modele"]) != "B", "{}", dumps(&t_b));
    assert!(dumps(&res_b).contains("maillage trop fin"), "{}", dumps(&res_b["fentes"]));
}

/// La fente sur GND1 seul, GND2 intact dessous : Ott ne sait pas, le PEEC
/// si -- une part du retour passe par GND2 (couplage des deux plans et
/// capacite de la cavite), le terme existe et reste sous celui de la fente
/// qui coupe tout. Deux vias de masse a 2 mm de la fente le reduisent
/// encore.
fn le_cas_4b_avec_son_image_a_son_terme_et_les_vias_le_reduisent() {
    let lancer = |fente: Json| an(&doc_avec(doc_fentes(vec![fente], 1e-9), "stackup", DEUX_PLANS()));
    let tout = le_terme(&lancer(fente_imagee(&[("GND1", &fente_droite),
                                               ("GND2", &fente_droite)],
                                             &[], &Json::Nul, &["GND1", "GND2"])), "VIC").1;
    let un_seul: &[(&str, Cuivre)] = &[("GND1", &fente_droite), ("GND2", &PLEIN)];
    let res = lancer(fente_imagee(un_seul,
                                  &["GND2"], &Json::Nul, &["GND1"]));
    let (_c, t) = le_terme(&res, "VIC");
    assert!(t.vrai() && t_(&t["modele"]) == "B" && t["retour"] == j(r#"["GND2"]"#), "{}", dumps(&t));
    assert!(!contient(&t, "ott"), "{}", dumps(&t));
    assert!(0.0 < n(&t["next"]) && n(&t["next"]) < n(&tout["next"]), "{} {}", n(&t["next"]), n(&tout["next"]));
    assert!(!els(&res["fentes"]["signalees"]).iter().any(|s| t_(&s["cause"]) == "retour"));
    assert!(avertis(&res).iter().any(|a| a.contains("GND2") && a.contains("RÉSOLU")));
    let vias = j(r#"[{"u": -3.0, "v": 0.2, "d": 0.3}, {"u": 3.0, "v": 0.2, "d": 0.3}]"#);
    let tv = le_terme(&lancer(fente_imagee(un_seul,
                                           &["GND2"], &vias,
                                           &["GND1"])), "VIC").1;
    assert!(n(&tv["ld_nh"]) < 0.8 * n(&t["ld_nh"]) && n(&tv["next"]) < n(&t["next"]), "{} {}", dumps(&tv), dumps(&t));
}

/// Les limites de l'option A, levees : la victime est lue dans son
/// propre cuivre au franchissement (pas dans l'entraxe du profil), une
/// fente en biais se resout, et une victime superposee sur la couche
/// voisine porte le terme.
fn la_victime_est_prise_dans_son_cuivre_pas_dans_le_profil() {
    let terme = |voisinage: Vec<Json>, plans: &[(&str, Cuivre)], stack: Option<Json>| {
        let mut d = doc_essai(voisinage, &[("t_r", 1e-9.j())]);
        if let Some(stack) = stack {
            poser(&mut d, "stackup", stack);
        }
        poser(&mut d, "fentes", vec![fente_imagee(plans, &[], &Json::Nul, &["GND"])]);
        le_terme(&an(&d), "VIC").1
    };
    let droite = terme(vec![pis(0.0, 0.45, 40.0, 0.45, "VIC")], UN_PLAN, None);
    // LA VICTIME S'ECARTE A 6 MM AU DROIT DE LA FENTE, et revient : le profil
    // garde 0,45 mm de part et d'autre, le cuivre passe loin.
    let ecart = terme(vec![pis(0.0, 0.45, 16.0, 0.45, "VIC"), pis(16.0, 0.45, 17.0, 6.0, "VIC"),
                           pis(17.0, 6.0, 23.0, 6.0, "VIC"), pis(23.0, 6.0, 24.0, 0.45, "VIC"),
                           pis(24.0, 0.45, 40.0, 0.45, "VIC")], UN_PLAN, None);
    assert!(!nul(&ecart) && n(&ecart["m_nh"]) < 0.8 * n(&droite["m_nh"]), "{} {}", dumps(&ecart), dumps(&droite));
    // UNE FENTE EN BIAIS (45 degres) : plus longue sous la piste, resolue.
    let biais = terme(vec![pis(0.0, 0.45, 40.0, 0.45, "VIC")],
                      &[("GND", &|u: f64, v: f64| !((u - v).abs() < 1.4 && v.abs() < 10.0))], None);
    assert!(biais.vrai() && t_(&biais["modele"]) == "B" && n(&biais["next"]) > 0.0, "{}", dumps(&biais));
    assert!((n(&biais["ld_nh"]) / n(&droite["ld_nh"]) - 1.0).abs() > 0.02, "{} {}", dumps(&biais), dumps(&droite));
    // UNE VICTIME SUPERPOSEE, sur la couche du dessous sans plan entre les
    // deux : la fente du plan commun la couple aussi.
    let sup = j(r#"{"layers": [
        {"type": "copper", "name": "Top", "thickness": 0.035, "role": "signal"},
        {"type": "dielectric", "name": "d1", "thickness": 0.1, "epsilon_r": 4.3},
        {"type": "copper", "name": "In1", "thickness": 0.035, "role": "signal"},
        {"type": "dielectric", "name": "d2", "thickness": 0.1, "epsilon_r": 4.3},
        {"type": "copper", "name": "GND", "thickness": 0.035, "role": "plane",
         "net": "GND"}
    ]}"#);
    let t_sup = terme(vec![pis_c(0.0, 0.2, 40.0, 0.2, "VIC", 2)], UN_PLAN, Some(sup));
    assert!(t_sup.vrai() && t_(&t_sup["modele"]) == "B" && n(&t_sup["next"]) > 0.0, "{}", dumps(&t_sup));
}

/// Le PEEC coute quelques secondes : au-dela de PEEC_FENTES_MAX fentes,
/// le modele d'Ott d'avant, et la fiche le note.
fn au_dela_du_budget_ott_reprend_et_le_dit() {
    let d = doc_fentes(vec![fente_imagee(UN_PLAN, &[], &Json::Nul, &["GND"])], 1e-9);
    let ancien = ct::peec_fentes_max();
    ct::regler_peec_fentes_max(0);
    let res = ct::analyser(&d, None);
    ct::regler_peec_fentes_max(ancien);
    let res = res.unwrap_or_else(|e| panic!("ErreurCrosstalk : {}", e.message));
    let (_c, t) = le_terme(&res, "VIC");
    assert!(t.vrai() && t_(&t["modele"]) == "A", "{}", dumps(&t));
    assert!(els(&res["fentes"]["signalees"]).iter().any(|s| t_(&s["cause"]) == "budget"));
}

/// Le solveur nu : sans fente, la self de boucle d'une piste de 0,3 mm a
/// 0,2 mm de son plan est celle du microruban dans l'air (~0,35 nH/mm), et
/// la mutuelle de deux pistes est la meme dans les deux sens.
fn le_peec_seul_retrouve_la_ligne_et_reste_reciproque() {
    let scene = ct::Scene { u: 15.0, v: 15.0, s_min: 0.12, cles_u: vec![-1.0, 1.0],
                            cles_v: vec![0.0, 1.4, -10.0, 10.0],
                            plans: vec![ct::PlanScene { nom: "P".into(), k: 0, z: 0.0, dedans: Arc::new(fente_droite) }],
                            eps: vec![], vias: vec![],
                            pistes: vec![vec![(-15.0, 0.0, 15.0, 0.0, -0.2, 0.3)],
                                         vec![(-15.0, 1.4, 15.0, 1.4, -0.2, 0.3)]] };
    let (_eu, _ev) = ct::_maillage_peec(&scene, 1.5, 4.0);
    let r = ct::_resoudre_peec(&scene, 0.35e9, 1.5, 4.0).unwrap();
    let w = 2.0 * PI * 0.35e9;
    // LA SELF PROPRE DE LA PISTE (barre de 30 mm, 0,3 mm) n'est pas dans Z :
    // elle s'ajoute ici pour retrouver la boucle.
    let g: f64 = 0.2231 * 0.3e-3;
    let l_t = 2e-7 * 0.030 * ((2.0 * 0.030 / g).ln() - 1.0);
    let l_boucle = l_t + r.plein[0][0].unwrap().im / w;
    assert!(0.30e-9 < l_boucle / 30.0 && l_boucle / 30.0 < 0.45e-9, "{}", l_boucle / 30.0);
    let (m01, m10) = (r.vide[0][1].unwrap(), r.vide[1][0].unwrap());
    assert!((m01 - m10).norm() / m01.norm() < 0.02, "{m01} {m10}");
}

/// Kb et Kf sortent de [C] et [L] seules -- et le milieu homogene le prouve.
///
/// LE CONTROLE EST CELUI DU MANUEL : en triplaque, le dielectrique remplit
/// tout l'espace, Lm/L0 vaut Cm/C0 exactement, et le FEXT s'annule. En
/// microruban, une partie du champ passe par l'air, les deux rapports
/// divergent, et le FEXT existe. Si ces deux lignes de calcul se trompaient de
/// convention -- la mutuelle de Maxwell est NEGATIVE hors diagonale --, ce
/// controle-la tomberait le premier.
fn les_deux_coefficients_ne_dependent_que_de_la_geometrie() {
    let paire = |kind: &str, ecart: f64, plus: &str| {
        let mut geo = j(&format!(r#"{{"t": 35e-6, "epsilon_r": 4.3, {plus}}}"#));
        poser(&mut geo, "kind", kind);
        poser(&mut geo, "conducteurs", vec![obj! {"w" => 0.2e-3, "x" => -(0.2e-3 + ecart) / 2.0},
                                            obj! {"w" => 0.2e-3, "x" => (0.2e-3 + ecart) / 2.0}]);
        let r = tl::solve_multiline(&geometrie(&geo)).unwrap();
        ct::coefficients_couple(&r.c, &r.l, 0, 1)
    };
    let (micro, strip) = (r#""h": 0.2e-3"#, r#""b": 0.4e-3, "y0": 0.2e-3"#);

    let (kb_m, kf_m) = paire("micro", 0.3e-3, micro);
    let (kb_s, kf_s) = paire("strip", 0.3e-3, strip);
    assert!(kb_m > 0.0 && kb_s > 0.0, "{kb_m} {kb_s}");
    // LE FEXT DU MICRORUBAN EXISTE, celui de la triplaque est nul. On ne compare
    // pas a zero exactement : le cuivre a une epaisseur, elle perturbe un peu
    // l'homogeneite, et c'est physique. Deux ordres de grandeur suffisent a dire
    // que les deux cas ne sont pas le meme.
    assert!(kf_s.abs() < 0.05 * kf_m.abs(), "{kf_m} {kf_s}");
    assert!(kf_m > 0.01, "{kf_m}");

    // ET A ECART SERRE, OU LES DEFINITIONS SE SEPARENT. En milieu homogene,
    // [L] = mu*eps*[C]^-1 impose Lm/L0 = Cm/c[i][i] EXACTEMENT, donc Kf = 0 a
    // tout ecart. A 0,3 mm le couplage est trop faible pour trancher : une
    // premiere version prenait pour C0 la capacite ligne-a-masse, passait
    // ce controle-la, et rendait Kf = -0,026 a 0,1 mm -- un FEXT invente, et
    // un Kb surestime d'autant.
    for ecart in [0.1e-3, 0.05e-3] {
        let (kb_t, kf_t) = paire("strip", ecart, strip);
        assert!(kb_t > 0.05, "{ecart} {kb_t}");
        assert!(kf_t.abs() < 1e-4, "Kf doit etre nul en triplaque {ecart} {kf_t}");
    }

    // PLUS SERRE, PLUS COUPLE. Une monotonie, c'est peu -- et c'est ce qui
    // attrape une inversion de signe ou un indice permute.
    let serre = paire("micro", 0.15e-3, micro).0;
    let large = paire("micro", 1.2e-3, micro).0;
    assert!(serre > 3.0 * large, "{serre} {large}");

    // UNE MATRICE DIAGONALE -- section non resolue -- REND ZERO, et ce zero est
    // celui de l'appelant a distinguer : voir `mesure` sur chaque bloc.
    let diag_c = vec![vec![1e-10, 0.0], vec![0.0, 1e-10]];
    let diag_l = vec![vec![4e-7, 0.0], vec![0.0, 4e-7]];
    assert!(ct::coefficients_couple(&diag_c, &diag_l, 0, 1) == (0.0, 0.0));
    // ET UNE MATRICE VIDE DE SENS NE LEVE PAS : elle rend zero, parce qu'un
    // solveur en echec ne doit pas faire tomber toute la fiche.
    let zero = vec![vec![0.0, 0.0], vec![0.0, 0.0]];
    assert!(ct::coefficients_couple(&zero,
                                    &zero, 0, 1) == (0.0, 0.0));
}

/// Ni tension, ni protocole, ni classe : le front de reference, et un
/// tuple de diagnostic complet par paire.
///
/// LE RESULTAT EST UNE FRACTION DE L'AGRESSEUR : un echelon unitaire, des
/// lignes adaptees. Sans front saisi ni classe connue, c'est 1 ns qui juge,
/// et la fiche le dit.
fn le_niveau_2_repond_sans_tension_ni_protocole() {
    let vois = vec![pis(0.0, 0.95, 12.0, 0.95, "VIC"),
                    pis(12.0, 0.35, 22.0, 0.35, "VIC"),
                    pis(22.0, 0.95, 40.0, 0.95, "VIC")];
    let res = an(&doc_essai(vois, &[("distance_max", 1.5.j()), ("t_r", 0i64.j())]));
    assert!(n(&res["t_r"]) == 1e-9 && t(&res["source_tr"]).contains("1 ns"),
            "{} {}", n(&res["t_r"]), t(&res["source_tr"]));
    assert!(!contient(&res, "touchstone") && !contient(&res, "mode"));
    let c = &res["couples"][0];
    for cle in ["k_total", "next", "next_pc", "next_db", "fext", "fext_pc",
                "fext_db", "statut_next", "statut_fext", "statut", "td_s",
                "sature"] {
        assert!(contient(c, cle), "le tuple de diagnostic n'a pas « {cle} »");
    }
    assert!((n(&c["k_total"]) - 2.0 * n(&c["kb_max"])).abs() < 1e-6, "{}", dumps(c));
    assert!((n(&c["next_pc"]) - 100.0 * n(&c["next"])).abs() < 1e-2, "{}", dumps(c));
    assert!(["vert", "orange", "rouge"].contains(&t(&c["statut"])), "{}", t(&c["statut"]));
    assert!(n(&c["next"]) <= n(&c["kb_max"]) + 1e-9, "le NEXT ne depasse pas Kb");

    // LA CARTE DESIGNE LA SECTION SERREE, ET ELLE SEULE.
    let ligne = els(&res["carte_chaleur"]["lignes"]).iter().find(|x| t(&x["sens"]) == "next").unwrap();
    let axe = nums(&res["carte_chaleur"]["axe"]);
    let vals = nums(&ligne["valeurs"]);
    let dedans: Vec<f64> = axe.iter().zip(&vals).filter(|(x, _)| (13.0..=21.0).contains(*x)).map(|(_, v)| *v).collect();
    let dehors: Vec<f64> = axe.iter().zip(&vals).filter(|(x, _)| **x <= 10.0 || **x >= 24.0).map(|(_, v)| *v).collect();
    assert!(minf(&dedans) > 3.0 * maxf(&dehors), "{} {}", maxf(&dehors), minf(&dedans));
    let zones = els(&res["risques"]);
    assert!(zones.len() == 1, "{zones:?}");
    assert!((n(&zones[0]["s0"]) - 12.0).abs() < 1.5, "{}", dumps(&zones[0]));
    assert!((n(&zones[0]["s1"]) - 22.0).abs() < 1.5, "{}", dumps(&zones[0]));
    assert!(n(&c["resolution_next"]) < 1.0, "{}", n(&c["resolution_next"]));
    // LE FEXT N'A PAS DE COURBE : il co-propage. Son niveau est au tableau.
    assert!(res["axes"]["fext"]["lignes"] == 0i64.j() &&
            res["axes"]["fext"]["raison"].vrai(), "{}", dumps(&res["axes"]));
}

/// Une section non resolue rend Kb = 0, et ce zero n'est pas une mesure.
///
/// C'EST LE FAUX NEGATIF LE PLUS GRAVE QUE CE MODE PUISSE PRODUIRE, et il
/// serait parfaitement muet : la carte se dessine, la zone reste bleue, et
/// l'on conclut « ca ne couple pas ici » la ou l'on n'a pas su calculer. Or
/// c'est precisement la ou le plan de reference manque que le couplage reel
/// est le plus fort, faute de chemin de retour court.
fn le_mode_simple_ne_prend_pas_un_zero_non_calcule_pour_un_decouplage() {
    // 0,01 mm DE JOUR AU MILIEU : la section n'y est pas resoluble, et le
    // solveur le refuse -- a raison. (Un cuivre qui CHEVAUCHE, comme ce cas
    // l'employait d'abord, est ecarte des la preselection : il ne longe pas,
    // et le test ne passait que parce que « absente » se lisait « non
    // mesuree ».)
    let vois = vec![pis(0.0, 0.95, 12.0, 0.95, "VIC"),
                    pis(12.0, 0.26, 22.0, 0.26, "VIC"),
                    pis(22.0, 0.95, 40.0, 0.95, "VIC")];
    let doc = doc_essai(vois, &[("distance_max", 1.5.j())]);
    let res = an(&doc);
    let c = &res["couples"][0];
    assert!(c["mesure_partielle"] == true.j(), "{}", dumps(c));
    assert!(titres(&res).contains("n'y sont pas des mesures"), "{}", titres(&res));
    let dit: Vec<String> = avertis(&res).into_iter().filter(|x| x.contains("NON RÉSOLUE")).collect();
    assert!(!dit.is_empty(), "{:?}", avertis(&res));
    assert!(dit[0].contains("absence de mesure"), "{}", dit[0]);

    // EN PARTIE SEULEMENT : ce n'est pas « non calcule », il y a un Kb.
    assert!(c["non_calcule"] == false.j() && n(&c["kb_max"]) > 0.0, "{}", dumps(c));

    // SUR TOUT LE LONGEMENT, AUCUN CHIFFRE -- et la fiche doit le dire par
    // couple, pas seulement dans une reserve : sans quoi la page la classait
    // hors du classement, ce qui se lisait « elle ne couple pas ».
    // 0,01 mm DE JOUR : le solveur ne resout pas la section, sur toute la
    // longueur. (Un cuivre qui CHEVAUCHE, lui, est ecarte des la
    // preselection -- ce n'est pas une voisine.)
    let tout = doc_essai(vec![pis(0.0, 0.26, 40.0, 0.26, "VIC")], &[("distance_max", 1.5.j())]);
    let nul = an(&tout)["couples"][0].clone();
    assert!(nul["non_calcule"] == true.j(), "{}", dumps(&nul));
    assert!(n(&nul["kb_max"]) == 0.0 && nul["confirmee"] == false.j(), "{}", dumps(&nul));
    assert!(t(&nul["raison"]).contains("pas un couplage nul"), "{}", dumps(&nul));

    // ET UN DESSIN SAIN NE LEVE RIEN : une reserve qui s'affiche a chaque
    // analyse cesse d'etre lue, et emporte les vraies avec elle.
    let sain = doc_essai(vec![pis(0.0, 0.95, 40.0, 0.95, "VIC")], &[("distance_max", 1.5.j())]);
    let bon = an(&sain);
    assert!(bon["couples"][0]["mesure_partielle"] == false.j(), "{}", dumps(&bon["couples"][0]));
    assert!(!avertis(&bon).iter().any(|x| x.contains("NON RÉSOLUE")));
}

/// Sept « ecarter » ne font pas disparaitre « coudre le plan ».
///
/// LA COUPE A SIX GESTES gardait les six premiers, et sur une vraie carte les
/// six etaient des « ecarter » : le seul geste sur le plan de masse passait
/// dans « 2 gestes de plus ». Un geste d'une autre nature apprend plus que le
/// septieme du meme genre.
fn la_coupe_des_gestes_garde_chaque_nature() {
    let risques: Vec<Json> = (0..7).map(|k| obj! {"victime" => format!("V{k}"), "agresseur" => "A", "s0" => k as f64,
                                                 "s1" => k as f64 + 1.0, "niveau" => 1.0, "niveau_db" => -10.0 - k as f64,
                                                 "justifie" => true, "zone" => ""}).collect();
    let masse = j(r#"{"zones": [{"type": "couture", "s0": 2.0, "s1": 14.0,
                                 "pas": 12.0}], "seuil": 4.0, "vain": false}"#);
    let mut omises = Vec::new();
    let g = ct::actions(&risques, &masse, &[], &[], 0.5, None, Some(&mut omises), false);
    let quoi: Vec<&str> = g.iter().map(|x| t(&x["quoi"])).collect();
    assert!(g.len() == ct::ACTIONS_MAX, "{g:?}");
    assert!(quoi.contains(&"coudre le plan"),
            "{quoi:?}");
    // L'ORDRE RESTE CELUI DE L'EFFET : les « ecarter » d'abord.
    assert!(quoi[0] == "écarter" && quoi[quoi.len() - 1] == "coudre le plan",
            "{quoi:?}");
    // ET CE QUI EST COUPE SE DIT, AVEC SA NATURE.
    assert!(!omises.is_empty() && omises[0]["nombre"] == 2i64.j(), "{omises:?}");
    assert!(omises[0]["natures"] == j(r#"["écarter"]"#), "{omises:?}");
}

/// NEXT sature et non sature, FEXT, k_total, statuts -- a la main.
///
/// UN LONGEMENT UNIFORME : Kb = 5 %, Kf = 2 %, T_d = 100 ps.
///   t_r = 1 ns   : 2 T_d = 200 ps < t_r -> NEXT = Kb.2T_d/t_r = 1 %
///                  FEXT = |Kf|.T_d/t_r = 0,2 %
///   t_r = 100 ps : 2 T_d >= t_r          -> NEXT = Kb = 5 % (sature)
///                  FEXT = 2 %
fn les_formules_du_niveau_2() {
    let lent = niveau2(&[(0.05, 0.02, 100e-12)], 1e-9, 1.0);
    assert!(!lent["sature"].vrai(), "{}", dumps(&lent));
    assert!((n(&lent["next"]) - 0.01).abs() < 1e-9, "{}", dumps(&lent));
    assert!((n(&lent["fext"]) - 0.002).abs() < 1e-9, "{}", dumps(&lent));
    assert!((n(&lent["k_total"]) - 0.10).abs() < 1e-9, "{}", dumps(&lent));
    assert!((n(&lent["next_db"]) + 40.0).abs() < 1e-6, "{}", dumps(&lent));
    assert!(t(&lent["statut"]) == "vert", "{}", dumps(&lent));
    let vif = niveau2(&[(0.05, 0.02, 100e-12)], 100e-12, 1.0);
    assert!(vif["sature"].vrai() && (n(&vif["next"]) - 0.05).abs() < 1e-9, "{}", dumps(&vif));
    assert!((n(&vif["fext"]) - 0.02).abs() < 1e-9, "{}", dumps(&vif));
    assert!(t(&vif["statut_next"]) == "orange" && t(&vif["statut_fext"]) == "vert");
    assert!(t(&vif["statut"]) == "orange", "{}", dumps(&vif));
    // LE MEME LONGEMENT COUPE EN DEUX MORCEAUX REND LE MEME CHIFFRE.
    let deux = niveau2(&[(0.05, 0.02, 40e-12), (0.05, 0.02, 60e-12)], 1e-9, 1.0);
    assert!((n(&deux["next"]) - n(&lent["next"])).abs() < 1e-12, "{} {}", dumps(&deux), dumps(&lent));
    // UN COUPLAGE NON UNIFORME : chaque morceau compte pour son Kb, et la
    // saturation se lit sur le plus fort.
    let mix = niveau2(&[(0.10, 0.0, 50e-12), (0.01, 0.0, 50e-12)], 1e-9, 1.0);
    assert!((n(&mix["next"]) - (0.10 * 100e-12 + 0.01 * 100e-12) / 1e-9).abs() < 1e-12);
    assert!(n(&niveau2(&[(0.10, 0.0, 1e-9)], 100e-12, 1.0)["next"]) == 0.10);
    // LE FEXT NE DEPASSE PAS 50 %, et le dit (`fext_sature`), comme le NEXT
    // dit `sature`. 300 mm de microruban (Kf = 4,2 %, T_d = 1785 ps) sous
    // 100 ps : 74,6 % par la loi lineaire, 49,7 % par la simulation exacte de
    // deux lignes couplees adaptees. Avec pertes, le plafond s'attenue aussi.
    let loin = niveau2(&[(0.0818, 0.0418, 1785e-12)], 100e-12, 1.0);
    assert!(n(&loin["fext"]) == 0.5 && loin["fext_sature"] == true.j(), "{}", dumps(&loin));
    assert!(t(&loin["statut_fext"]) == "rouge", "{}", dumps(&loin));
    assert!(vif["fext_sature"] == false.j() && lent["fext_sature"] == false.j());
    let perdu = niveau2(&[(0.0818, 0.0418, 1785e-12)], 100e-12, 0.8);
    assert!((n(&perdu["fext"]) - 0.4).abs() < 1e-9 && perdu["fext_sature"].vrai(), "{}", dumps(&perdu));
    let statut = |v: f64| ct::statut(v, ct::SEUIL_ORANGE, ct::SEUIL_ROUGE);
    assert!(statut(0.029) == "vert" && statut(0.03) == "orange");
    assert!(statut(0.07) == "orange" && statut(0.0701) == "rouge");
    assert!(ct::statut(0.05, 0.01, 0.04) == "rouge");
    assert!(ct::pire_statut(&["vert", "rouge", "orange"]) == "rouge");
    assert!(ct::pire_statut(&[]) == "vert");
}

/// La victime du banc, et la classe de l'agresseur.
fn doc_classe(reglages: &[(&str, Json)], classe: &str) -> Json {
    doc_avec(doc_essai(vec![pis(0.0, 0.45, 40.0, 0.45, "VIC")], reglages), "natures", obj! {"CLK" => classe})
}

/// Saisi, il fait foi ; vide, il sort de la classe de l'agresseur.
fn le_front_se_deduit_de_la_classe_ou_se_saisit() {
    let vois = || vec![pis(0.0, 0.45, 40.0, 0.45, "VIC")];
    let res = an(&doc_classe(&[("t_r", 0i64.j())], "Horloge"));
    assert!(n(&res["t_r"]) == 2e-9 && t(&res["source_tr"]).contains("Horloge"),
            "{} {}", n(&res["t_r"]), t(&res["source_tr"]));
    // LES FRONTS DU PANNEAU DE VERIFICATION PASSENT DEVANT.
    let doc = doc_classe(&[("t_r", 0i64.j()), ("tr_classes", obj! {"Horloge" => 500e-12})], "Horloge");
    assert!(n(&an(&doc)["t_r"]) == 500e-12);
    // SAISI, IL FAIT FOI, CLASSE OU PAS.
    let res = an(&doc_classe(&[("t_r", 300e-12.j())], "Lent"));
    assert!(n(&res["t_r"]) == 300e-12 && t(&res["source_tr"]) == "saisi", "{}", t(&res["source_tr"]));
    // UN FRONT PLUS LENT DONNE MOINS DE BRUIT, jamais plus.
    let rapide = an(&doc_essai(vois(), &[("t_r", 50e-12.j())]))["couples"][0].clone();
    let lent = an(&doc_essai(vois(), &[("t_r", 5e-9.j())]))["couples"][0].clone();
    assert!(n(&lent["next"]) < n(&rapide["next"]) && n(&lent["fext"]) < n(&rapide["fext"]));
    assert!(rapide["sature"].vrai() && !lent["sature"].vrai(), "{} {}", dumps(&rapide), dumps(&lent));
    // UN FRONT NEGATIF EST REFUSE.
    assert!(ct::analyser(&doc_essai(vois(), &[("t_r", (-1e-9).j())]), None).is_err(), "un front negatif a ete accepte");
}

/// La classe RF impose 100 ps quand rien n'est saisi, ET LA FICHE LE CRIE.
///
/// SUR LA CARTE D'ESSAI DU BANC CROSSTALK, les nets XT* classes RF sortaient
/// un FEXT de 18 % au cas 1 sans qu'on sache d'ou venait le front : « deduit
/// de la classe » au milieu d'une ligne de methode. C'est maintenant une
/// RESERVE (graves), la premiere des hypotheses, et un bloc `front_impose`
/// que la page affiche en alerte. Saisi, ou venu d'une autre classe, RIEN de
/// tout cela ; une porteuse RF reglee le remplace par 0,35 / f.
fn le_front_impose_par_la_classe_rf_se_dit_fort() {
    let titres_de = |res: &Json| els(&res["graves"]).iter().map(|g| t(&g["titre"]).to_string()).collect::<Vec<_>>();
    let res = an(&doc_classe(&[("t_r", 0i64.j())], "RF"));
    assert!(n(&res["t_r"]) == 1e-10 && t(&res["source_tr"]).contains("RF"), "{} {}", n(&res["t_r"]), t(&res["source_tr"]));
    let fi = &res["front_impose"];
    assert!(fi.vrai() && t(&fi["classe"]) == "RF" && nul(&fi["porteuse_rf"]), "{}", dumps(fi));
    assert!(t(&fi["titre"]).contains("imposé par la classe RF") && t(&fi["titre"]).contains("porteuse"), "{}", dumps(fi));
    assert!(titres_de(&res).iter().any(|x| x.contains("imposé par la classe RF")), "{:?}", titres_de(&res));
    assert!(t(&res["hypotheses"][0]).starts_with("FRONT IMPOSÉ PAR LA CLASSE RF"),
            "{}", t(&res["hypotheses"][0]));
    // SAISI : plus rien, la fiche commence par le niveau 2.
    let res = an(&doc_classe(&[("t_r", 200e-12.j())], "RF"));
    assert!(nul(&res["front_impose"]) && t(&res["source_tr"]) == "saisi", "{}", t(&res["source_tr"]));
    assert!(!titres_de(&res).iter().any(|x| x.contains("classe RF")), "{:?}", titres_de(&res));
    assert!(t(&res["hypotheses"][0]).starts_with("NIVEAU 2"), "{}", t(&res["hypotheses"][0]));
    // UNE AUTRE CLASSE SANS FRONT : deduit, mais pas une reserve.
    let res = an(&doc_classe(&[("t_r", 0i64.j())], "Horloge"));
    assert!(nul(&res["front_impose"]) && !titres_de(&res).iter().any(|x| x.contains("classe")));
    // UNE PORTEUSE RF REGLEE : t_r = 0,35 / f, une note, pas de reserve.
    let res = an(&doc_classe(&[("t_r", 0i64.j()), ("porteuse_rf", 868e6.j())], "RF"));
    assert!((n(&res["t_r"]) - 0.35 / 868e6).abs() < 1e-15 && t(&res["source_tr"]).contains("porteuse"),
            "{} {}", n(&res["t_r"]), t(&res["source_tr"]));
    assert!(n(&res["front_impose"]["porteuse_rf"]) == 868e6, "{}", dumps(&res["front_impose"]));
    assert!(!titres_de(&res).iter().any(|x| x.contains("imposé")), "{:?}", titres_de(&res));
    assert!(t(&res["hypotheses"][0]).starts_with("FRONT DÉDUIT DE LA PORTEUSE RF"),
            "{}", t(&res["hypotheses"][0]));
    // Et `front_de_classe` seule, la meme regle.
    assert!(ct::front_de_classe("RF", &Json::Nul, 2.4e9).0 == 0.35 / 2.4e9);
    assert!(ct::front_de_classe("Horloge", &Json::Nul, 2.4e9).0 == 2e-9);
}

/// Des seuils plus severes font rougir ce qui etait vert.
fn les_seuils_drc_se_reglent_et_le_statut_suit() {
    let vois = || vec![pis(0.0, 0.45, 40.0, 0.45, "VIC")];
    let base = an(&doc_essai(vois(), &[]))["couples"][0].clone();
    let niveau = maxf(&[n(&base["next"]), n(&base["fext"])]);
    let severe = an(&doc_essai(vois(), &[("seuil_orange", (niveau / 4.0).j()),
                                         ("seuil_rouge", (niveau / 2.0).j())]));
    assert!(t(&severe["couples"][0]["statut"]) == "rouge", "{}", dumps(&severe["couples"][0]));
    assert!(t(&severe["statut"]) == "rouge", "{}", t(&severe["statut"]));
    let laxiste = an(&doc_essai(vois(), &[("seuil_orange", 0.9.j()), ("seuil_rouge", 0.95.j())]));
    assert!(t(&laxiste["couples"][0]["statut"]) == "vert");
    assert!(laxiste["seuils"] == j(r#"{"orange": 0.9, "rouge": 0.95,
                                       "confirmation_db": -40.0}"#), "{}", dumps(&laxiste["seuils"]));
    for (o, r) in [(0.07, 0.03), (0.0, 0.05), (0.03, 1.2)] {
        match ct::analyser(&doc_essai(vois(), &[("seuil_orange", o.j()), ("seuil_rouge", r.j())]), None) {
            Err(exc) => assert!(exc.message.contains("DRC"), "{}", exc.message),
            Ok(_) => panic!("seuils {o} / {r} acceptes"),
        }
    }
}

/// Une victime SOUS l'agresseur, sans plan entre les deux : chiffree.
///
/// ELLE RESSORTAIT « NON CALCULEE » : le solveur de section range ses
/// conducteurs cote a cote. Elle passe maintenant par le solveur a deux
/// niveaux -- milieu homogene, donc Kf nul et FEXT nul.
fn une_piste_seulement_superposee_a_son_chiffre() {
    let stack = j(r#"{"layers": [
        {"type": "copper", "name": "Top", "thickness": 0.035,
         "role": "signal"},
        {"type": "dielectric", "name": "haut", "thickness": 0.2,
         "epsilon_r": 4.3},
        {"type": "copper", "name": "In1", "thickness": 0.035,
         "role": "signal"},
        {"type": "dielectric", "name": "bas", "thickness": 0.2,
         "epsilon_r": 4.3},
        {"type": "copper", "name": "GND", "thickness": 0.035,
         "role": "plane", "net": "GND"}
    ]}"#);
    let doc = doc_avec(doc_essai(vec![pis_c(0.0, 0.0, 40.0, 0.0, "DATA", 2)], &[]), "stackup", &stack);
    let res = an(&doc);
    let c = &res["couples"][0];
    assert!(t(&c["victime"]) == "DATA" && c["superposee"].vrai(), "{}", dumps(c));
    assert!(!c["non_calcule"].vrai(), "{}", dumps(c));
    assert!(n(&c["k_total"]) > 0.05 && n(&c["next"]) > 0.0, "{}", dumps(c));
    assert!(n(&c["fext"]) == 0.0, "{}", dumps(c));
    assert!((n(&c["longueur_superposee"]) - 40.0).abs() < 0.5, "{}", dumps(c));
    // LE MEME SOLVEUR QUE LA VERIFICATION DE CARTE : memes hauteurs.
    let geo = ct::geometrie_superposee(els(&stack["layers"]), 0, 2);
    assert!(geo.is_some_and(|g| g.2.is_none()), "{geo:?}");
    assert!((geo.unwrap().0 - (0.2 + 0.035 + 0.2 + 0.0175)).abs() < 1e-9, "{geo:?}");
    // ET ELLE SE PLACE SUR LA CARTE LOCALE, A SON ABSCISSE : une victime qui
    // ne passe sous l'agresseur que de 10 a 25 mm y monte la, et nulle part
    // ailleurs.
    let doc = doc_avec(doc_essai(vec![pis_c(10.0, 0.0, 25.0, 0.0, "DATA", 2)], &[]), "stackup", &stack);
    let res = an(&doc);
    let ligne = ligne_de(&res, "DATA", "next").unwrap();
    let axe = nums(&res["carte_chaleur"]["axe"]);
    let vals = nums(&ligne["valeurs"]);
    let dedans: Vec<f64> = axe.iter().zip(&vals).filter(|(x, _)| (11.0..=24.0).contains(*x)).map(|(_, v)| *v).collect();
    let dehors: Vec<f64> = axe.iter().zip(&vals).filter(|(x, _)| **x <= 9.0 || **x >= 26.0).map(|(_, v)| *v).collect();
    assert!(!dedans.is_empty() && minf(&dedans) > 0.0, "la superposition doit etre tracee");
    assert!(maxf(&dehors) == 0.0, "rien hors de la superposition : {}", maxf(&dehors));
    let z = els(&res["risques"]);
    assert!(!z.is_empty() && (n(&z[0]["s0"]) - 10.0).abs() < 1.0 && (n(&z[0]["s1"]) - 25.0).abs() < 1.0, "{z:?}");
    // ET SEPAREE PAR UN PLAN, ELLE EST ECARTEE COMME AVANT.
    let doc = doc_essai(vec![pis_c(0.0, 0.0, 40.0, 0.0, "DATA", 4)], &[]);
    let res = an(&doc);
    assert!(!res["etape0"]["retenus"].vrai(), "{}", dumps(&res["etape0"]["retenus"]));
}

/// La victime la plus bruitee passe en tete, et le rang le dit.
fn le_classement_suit_le_statut_puis_le_niveau() {
    let res = an(&doc_essai(vec![pis(0.0, 0.45, 40.0, 0.45, "PRES"),
                                 pis(0.0, -0.80, 40.0, -0.80, "LOIN")],
                            &[("distance_max", 2.0.j())]));
    let c0 = &res["couples"][0];
    assert!(c0["rang"] == 1i64.j() && t(&c0["victime"]) == "PRES", "{}", dumps(&res["couples"]));
    let statuts: Vec<&str> = els(&res["couples"]).iter().filter(|c| c["confirmee"].vrai()).map(|c| t(&c["statut"])).collect();
    assert!(t(&res["statut"]) == ct::pire_statut(&statuts));
}

/// R et G au genou : moins de bruit, jamais plus -- et peu a 1 ns.
fn les_pertes_ne_font_que_retirer_du_bruit() {
    let doc = |t_r: f64, pertes: bool| {
        let mut d = doc_essai(vec![], &[("t_r", t_r.j()), ("pertes", pertes.j())]);
        poser(dans(&mut d, "geometry"), "objects", vec![pis(0.0, 0.0, 150.0, 0.0, "CLK")]);
        poser(&mut d, "voisinage", vec![pis(0.0, 0.45, 150.0, 0.45, "VIC")]);
        an(&d)["couples"][0].clone()
    };
    for (t_r, borne) in [(1e-9, 0.90), (100e-12, 0.60)] {
        let (sans, avec) = (doc(t_r, false), doc(t_r, true));
        assert!(n(&avec["next"]) < n(&sans["next"]) && n(&avec["fext"]) < n(&sans["fext"]),
                "{t_r} {} {}", dumps(&sans), dumps(&avec));
        assert!(n(&avec["next"]) > borne * n(&sans["next"]), "{t_r} {} {}", n(&sans["next"]),
                n(&avec["next"]));
        assert!(avec["pertes"].vrai() && !sans["pertes"].vrai());
    }
    let a = ct::alpha_genou(50.0, 3.3, 0.2, 4.3, 0.02, 1e-9, None).unwrap();
    assert!(0.1 < a && a < 1.0, "alpha a 350 MHz, 0,2 mm FR-4 : {a} Np/m");
    assert!(ct::alpha_genou(50.0, 3.3, 0.2, 4.3, 0.02, 100e-12, None).unwrap() > a);
}

/// Deux agresseurs selectionnes : pire cas arithmetique, ou quadratique.
fn plusieurs_agresseurs_se_somment_vers_une_victime() {
    assert!((ct::somme_agresseurs(&[0.03, 0.04], "rss") - 0.05).abs() < 1e-12);
    assert!((ct::somme_agresseurs(&[0.03, 0.04], "pire") - 0.07).abs() < 1e-12);
    let mut res = Vec::new();
    for mode in ["pire", "rss"] {
        let d = doc_avec(doc_essai(vec![pis(0.0, 0.45, 40.0, 0.45, "VIC"),
                                        pis(0.0, 0.9, 40.0, 0.9, "AG2")], &[("somme", mode.j())]),
                         "agresseurs", vec!["CLK", "AG2"]);
        let c = couple(&an(&d), "VIC").unwrap();
        assert!(c["somme"].vrai() && t(&c["somme"]["mode"]) == mode, "{}", dumps(&c));
        assert!(els(&c["somme"]["agresseurs"]).iter().map(|x| t(&x["agresseur"])).collect::<Vec<_>>() ==
                ["CLK", "AG2"], "{}", dumps(&c["somme"]));
        res.push(n(&c["somme"]["next"]));
    }
    assert!(res[1] < res[0], "{res:?}");
    assert!(ct::analyser(&doc_essai(vec![pis(0.0, 0.45, 40.0, 0.45, "VIC")], &[("somme", "max".j())]), None).is_err(),
            "une somme inconnue a ete acceptee");
}

// LES CAS PRECEDENTS VERIFIENT QUE LES DEUX MODES S'ACCORDENT ENTRE EUX. Ils
// ne disent pas s'ils ont raison ensemble : une erreur commune -- dans la
// section, le placement des rubans, l'ordre des ports -- passerait les deux.
//
// LA TRIPLAQUE A UNE SOLUTION EXACTE (Cohn, ruban mince), et elle fixe trois
// chiffres sans rien emprunter au code teste :
//   · Kb = (Ze - Zo) / 2(Ze + Zo), exactement, en milieu homogene ;
//   · Kf = 0 : une seule vitesse, donc pas de FEXT ;
//   · T_d = L.sqrt(er)/c, quel que soit l'ecart a la voisine.
// Le troisieme a trouve un defaut : le eps_eff par conducteur de
// `solve_multiline` grossissait avec le couplage, et T_d sortait a 284 ps au
// lieu de 276,7 sur 40 mm a 0,1 mm d'ecart -- l'axe de la carte avec lui.

fn STRIP() -> Json {
    j(r#"{"layers": [
        {"type": "copper", "name": "GND1", "thickness": 0.035, "role": "plane",
         "net": "GND"},
        {"type": "dielectric", "name": "p1", "thickness": 0.25, "epsilon_r": 4.3,
         "tan_delta": 0.0},
        {"type": "copper", "name": "In1", "thickness": 0.001, "role": "signal"},
        {"type": "dielectric", "name": "p2", "thickness": 0.25, "epsilon_r": 4.3,
         "tan_delta": 0.0},
        {"type": "copper", "name": "GND2", "thickness": 0.035, "role": "plane",
         "net": "GND"}
    ]}"#)
}

/// `scipy.special.ellipk(m)` : l'integrale elliptique complete K, de parametre m = k^2
/// (moyenne arithmetico-geometrique).
fn ellipk(m: f64) -> f64 {
    let (mut a, mut b) = (1.0f64, (1.0 - m).sqrt());
    for _ in 0..40 {
        (a, b) = (0.5 * (a + b), (a * b).sqrt());
    }
    PI / (2.0 * a)
}

/// Kb exact d'une paire triplaque centree, ruban mince (Cohn, 1955).
fn kb_cohn(w: f64, s: f64, b: f64) -> f64 {
    let z = |k: f64| ellipk(1.0 - k * k) / ellipk(k * k);
    let t1 = (PI * w / (2.0 * b)).tanh();
    let t2 = (PI * (w + s) / (2.0 * b)).tanh();
    let (ze, zo) = (z(t1 * t2), z(t1 / t2));
    (ze - zo) / (ze + zo) / 2.0
}

/// Deux pistes paralleles de 40 mm sur In1, sans masse coplanaire.
///
/// CUIVRE D'UN MICRON : la reference est a ruban mince, et 35 um sur 0,5 mm
/// de dielectrique deplacent deja Kb de quelques pour cent.
fn doc_triplaque(w: f64, s: f64, t_r: f64) -> Json {
    let piste = |y: f64, net: &str| {
        let mut p = pis_o(0.0, y, 40.0, y, net, 2, w, 0.4);
        poser(&mut p, "copper_thickness", 0.001);
        poser(&mut p, "gap_left", 0.0);
        poser(&mut p, "gap_right", 0.0);
        p
    };
    let reglages = obj! {"distance_max" => 2.0, "t_r" => t_r};
    obj! {"format" => "cao-crosstalk-1", "carte" => "banc",
          "agresseurs" => vec!["CLK"], "stackup" => STRIP(),
          "geometry" => obj! {"objects" => vec![piste(0.0, "CLK")]},
          "voisinage" => vec![piste(w + s, "VIC")],
          "reference_nets" => vec!["GND"], "reglages" => reglages}
}

/// Kb, Kf.T_d et T_d du mode SIMPLE, contre Cohn -- trois ecarts.
fn le_mode_simple_retrouve_la_triplaque_exacte() {
    let td_exact = 40e-3 * 4.3f64.sqrt() / ct::C_0;
    for (w, s) in [(0.15, 0.1), (0.15, 0.3), (0.25, 0.5)] {
        let c = an(&doc_triplaque(w, s, 1e-9))["couples"][0].clone();
        let reference = kb_cohn(w, s, 0.5);
        // 1 A 1,3 % MESURES, du serre au lache. La tolerance couvre le cuivre
        // d'un micron et la section posee par la page ; une permutation de
        // ports ou une mutuelle de mauvais signe la depasse de tres loin.
        assert!((n(&c["kb_max"]) / reference - 1.0).abs() < 0.03, "{w} {s} {} {reference}", n(&c["kb_max"]));
        assert!((n(&c["k_total"]) / (2.0 * reference) - 1.0).abs() < 0.03, "{w} {s} {}", dumps(&c));
        assert!(n(&c["fext"]) < 1e-5, "FEXT nul en triplaque {w} {s} {}", n(&c["fext"]));
        assert!((n(&c["td_s"]) / td_exact - 1.0).abs() < 1e-4,
                "T_d de {:.1} ps au lieu de {:.1} -- a {:.2} mm d'ecart",
                1e12 * n(&c["td_s"]), 1e12 * td_exact, s);
    }
}

/// `section_deux_niveaux` (larges faces) : Cohn, exact, en triplaque, un
/// ruban puis une paire ; et, rubans etroits et loin l'un de l'autre, la
/// methode des images a fil fin qu'il remplace.
fn deux_niveaux_tient_cohn_et_rejoint_le_fil_fin() {
    let c0 = 299792458.0;
    let kk = |k: f64| ellipk(k * k) / ellipk(1.0 - k * k);
    let (w, s, b) = (0.15e-3, 0.15e-3, 0.5e-3);
    let r = tl::section_deux_niveaux(&[tl::Ruban { x: 0.0, y: b / 2.0, w }], Some(b), 4.3, 30, 8).unwrap();
    let z = 4.3f64.sqrt() / (c0 * r.c[0][0]);
    let z_cohn = 30.0 * PI / 4.3f64.sqrt() * kk(1.0 / (PI * w / (2.0 * b)).cosh());
    assert!((z / z_cohn - 1.0).abs() < 2e-3, "{z} {z_cohn}");
    let r = tl::section_deux_niveaux(&[tl::Ruban { x: 0.0, y: b / 2.0, w },
                                       tl::Ruban { x: w + s, y: b / 2.0, w }], Some(b), 1.0, 30, 8).unwrap();
    let c = &r.c;
    let ke = (PI * w / (2.0 * b)).tanh() * (PI * (w + s) / (2.0 * b)).tanh();
    let ko = (PI * w / (2.0 * b)).tanh() / (PI * (w + s) / (2.0 * b)).tanh();
    for (z, k) in [(1.0 / (c0 * (c[0][0] + c[0][1])), ke), (1.0 / (c0 * (c[0][0] - c[0][1])), ko)] {
        let z_cohn = 30.0 * PI / kk(k);
        assert!((z / z_cohn - 1.0).abs() < 2e-3, "{z} {z_cohn}");
    }
    // le fil fin : 20 um de large, 2 mm d'ecart lateral, un plan
    let r = tl::section_deux_niveaux(&[tl::Ruban { x: 0.0, y: 0.2e-3, w: 20e-6 },
                                       tl::Ruban { x: 2e-3, y: 0.4e-3, w: 20e-6 }], None, 1.0, 30, 8).unwrap();
    let _kb = ct::coefficients_couple(&r.c, &r.l, 0, 1).0;
    // EN ATTENTE DE analyse_carte : ki = ac._kb_larges_faces(0.2, 0.4, 2.0, 0.02, 0.02),
    // et |kb / ki - 1| < 0,05.
    assert!((r.c[0][1] - r.c[1][0]).abs() < 1e-9 * r.c[0][1].abs(), "{:?}", r.c);
}

/// Une classe d'interface (USB HS, CAN...) porte son front ; elle ne tombe
/// plus sur « Lent ». Le panneau passe encore devant la table, et la
/// famille range l'interface dans une classe d'origine.
fn une_classe_d_interface_a_son_front_et_sa_famille() {
    let front = |classe: &str, panneau: Json| ct::front_de_classe(classe, &panneau, 0.0);
    assert!(front("USB HS", Json::Nul) == (5e-10, "déduit de la classe « USB HS »".to_string()));
    assert!(front("ETH 100", Json::Nul).0 == 3e-9);
    assert!(front("USB HS", obj! {"USB HS" => 3e-10}).0 == 3e-10);
    // borné par 10 % de la période de sa cadence, comme `analyse_carte` : un
    // front saisi plus lent que 0,1 / 200 MHz retombe à 500 ps
    assert!(front("USB HS", obj! {"USB HS" => 7e-10}).0 == 0.1 / 2e8);
    let de_classe = |c: &str| ct::TR_CLASSES.iter().find(|(k, _)| *k == c).map(|(_, v)| *v);
    assert!(Some(front("inconnue", Json::Nul).0) == de_classe("Lent"));
    assert!(ct::famille("CAN") == "Lent" && ct::famille("USB HS") == "Rapide");
    assert!(ct::famille("Rapide") == "Rapide" && ct::famille("inconnue") == "inconnue");
    assert!(ct::INTERFACES.len() == 7);
    for i in ct::INTERFACES {
        assert!(de_classe(i.famille).is_some() && i.tr > 0.0 && i.zdiff > 0.0, "{}", i.classe);
        // la norme ne fixe qu'une Z_diff : `Interface` n'a pas de champ z0
    }
}

/// commun/classes-interface.js porte la MEME table que `INTERFACES`, en
/// JSON, et les trois pages la chargent : deux copies qui divergent en
/// silence jugeraient un net autrement selon l'outil.
fn la_table_des_pages_est_celle_du_serveur() {
    let racine = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let src = std::fs::read_to_string(racine.join("commun").join("classes-interface.js")).unwrap();
    let table = j(src.split_once("const CLASSES_INTERFACE=").unwrap().1.split_once(";\n").unwrap().0);
    let table = table.as_objet().unwrap();
    assert!(table.len() == ct::INTERFACES.len(), "{table:?}");
    for i in ct::INTERFACES {
        let e = &table[i.classe];
        assert!(e.as_objet().is_some_and(|o| o.len() == 5) && t(&e["nom"]) == i.nom && t(&e["famille"]) == i.famille
                && n(&e["tr"]) == i.tr && n(&e["cadence"]) == i.cadence && n(&e["zdiff"]) == i.zdiff,
                "{} {i:?}", dumps(e));
    }
    for page in ["editeur-pcb/editeur-pcb.html", "editeur-schematique/editeur-schematique.html",
                 "visionneuse-ipc2581/visionneuse-ipc2581.html"] {
        let html = std::fs::read_to_string(racine.join(page)).unwrap();
        assert!(html.contains(r#"<script src="../commun/classes-interface.js"></script>"#), "{page}");
    }
}

pub fn banc() {
    T("l'impedance commune d'une fente retrouve l'estimation d'Ott du cas 4 \
       (~16 nH, ~11 nH, ~10 % a 1 ns, ~2 % a 5 ns)",
      l_impedance_commune_retrouve_l_estimation_de_ott);
    T("une fente franchie par les deux ajoute le terme d'Ott au niveau 2, le dit, \
       et pose son pic sur la carte",
      une_fente_franchie_par_les_deux_ajoute_le_terme_d_ott);
    T("une fente qui n'atteint pas la victime n'ajoute rien, et c'est le cote \
       qui en decide", une_fente_qui_n_atteint_pas_la_victime_n_ajoute_rien);
    T("une fente sur un seul plan garde le calcul sur l'autre, sans terme, et \
       le dit (cas 4b)", une_fente_sur_un_seul_plan_garde_le_calcul_sur_l_autre);
    T("la resonance de la fente (option C) est negligeable a 1 ns et sensible a \
       100 ps", la_resonance_de_la_fente_ne_compte_que_sous_300_ps);
    T("une fente avec son image est resolue (option B, PEEC) et Ott l'encadre",
      une_fente_avec_son_image_est_resolue_et_ott_l_encadre);
    T("le cas 4b avec son image a son terme (retour par l'autre plan), et les \
       vias de masse le reduisent",
      le_cas_4b_avec_son_image_a_son_terme_et_les_vias_le_reduisent);
    T("la victime est prise dans son cuivre, une fente en biais se resout, une \
       victime superposee porte le terme",
      la_victime_est_prise_dans_son_cuivre_pas_dans_le_profil);
    T("au-dela du budget de fentes resolues, Ott reprend et le dit",
      au_dela_du_budget_ott_reprend_et_le_dit);
    T("le PEEC seul retrouve la self du microruban et reste reciproque",
      le_peec_seul_retrouve_la_ligne_et_reste_reciproque);
    T("les deux coefficients ne dependent que de la geometrie",
      les_deux_coefficients_ne_dependent_que_de_la_geometrie);
    T("le niveau 2 repond sans tension ni protocole",
      le_niveau_2_repond_sans_tension_ni_protocole);
    T("le niveau 2 ne prend pas un zero non calcule pour un decouplage",
      le_mode_simple_ne_prend_pas_un_zero_non_calcule_pour_un_decouplage);
    T("la coupe des gestes garde chaque nature",
      la_coupe_des_gestes_garde_chaque_nature);

    titre("Le niveau 2 : les formules, les statuts, le front");
    T("les formules du niveau 2, saturees ou non, et les statuts",
      les_formules_du_niveau_2);
    T("le front se deduit de la classe du net, ou se saisit",
      le_front_se_deduit_de_la_classe_ou_se_saisit);
    T("la classe RF impose 100 ps, et la fiche le dit en tete ; saisi, rien",
      le_front_impose_par_la_classe_rf_se_dit_fort);
    T("les seuils DRC se reglent, et le statut suit",
      les_seuils_drc_se_reglent_et_le_statut_suit);
    T("une piste seulement superposee a son chiffre",
      une_piste_seulement_superposee_a_son_chiffre);
    T("les pertes R et G ne font que retirer du bruit",
      les_pertes_ne_font_que_retirer_du_bruit);
    T("plusieurs agresseurs se somment vers une victime, en phase ou en RSS",
      plusieurs_agresseurs_se_somment_vers_une_victime);
    T("le classement suit le statut, puis le niveau",
      le_classement_suit_le_statut_puis_le_niveau);

    titre("Le niveau 2, de bout en bout, contre une solution EXACTE");
    T("le niveau 2 retrouve la triplaque exacte : k_total, FEXT nul, T_d",
      le_mode_simple_retrouve_la_triplaque_exacte);
    T("deux niveaux : Cohn en triplaque, le fil fin a distance",
      deux_niveaux_tient_cohn_et_rejoint_le_fil_fin);
    T("classes d'interface : front de la table, famille d'origine",
      une_classe_d_interface_a_son_front_et_sa_famille);
    T("classes d'interface : la table des pages est celle du serveur",
      la_table_des_pages_est_celle_du_serveur);
    // EN ATTENTE DE rf_reseau : « rf_reseau : deux instances SPICE ont chacune leurs noeuds
    // internes » (deux_instances_spice_ne_partagent_pas_leurs_noeuds).
}
