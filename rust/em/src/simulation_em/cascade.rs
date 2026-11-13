//! La cascade de la paire differentielle : les deux modes, ou brin par brin.

use super::base::*;
use super::brins::*;
use super::modele::*;
use super::modes::*;
use super::mutuelle::_mutuelle_paire;
use super::retour::_impedance_traversee;
use super::transition::ModeleVia;
use super::{touchstone, ErreurSimulation};
use ligne_mom as tl;
use std::collections::BTreeMap;
use std::f64::consts::PI;

type Res<T> = Result<T, ErreurSimulation>;

/// Ce que `_cascade_differentielle` rend : le dict `s_diff` du resultat, et -- avec
/// `garder_abcd` -- les matrices que Python y rangeait en tableaux numpy, hors JSON.
#[derive(Debug, Clone)]
pub struct SDiff {
    pub json: Json,
    pub abcd_dd: Vec<C2>,
    pub abcd_cc: Vec<C2>,
    /// la paire par brin (4 x 4), quand la cascade a quatre acces a servi
    pub abcd_brins: Vec<C4>,
}

fn plat(matrices: &[C2]) -> Json {
    Json::Liste(matrices.iter().map(|m| Json::Liste(m.iter().flatten().map(|v| vec![v.re, v.im].j()).collect())).collect())
}

const ID2: C2 = [[Complex64::new(1.0, 0.0), Complex64::new(0.0, 0.0)], [Complex64::new(0.0, 0.0), Complex64::new(1.0, 0.0)]];

/// Calcule la cascade de paramètres S en mode mixte pour la paire différentielle :
/// - Sdd : différentiel pur 2x2 (sur z_ref_diff, ex: 100 Ω ou 90 Ω)
/// - Scc : mode commun pur 2x2 (sur z_ref_comm = z_ref_diff / 4.0, ex: 25 Ω)
/// - Scd : conversion différentiel -> commun issue du déséquilibre / skew (ΔL)
///   -- EXACTE, avec Sdc, pour une paire dissymétrique (5.1.0, voir « LA
///   PAIRE PAR BRIN ») ; une estimation d'après la surlongueur sinon
///
/// `quatre_acces` : None (defaut) met la paire en cascade brin par brin
/// quand elle est dissymetrique (`_brins_de_la_paire`), et rend alors les
/// S de la cascade a quatre acces ; True le fait toujours (le banc compare
/// les deux cascades sur une paire symetrique), False jamais.
/// - touchstone_sdd : chaîne au format Touchstone .s2p différentiel
/// - touchstone_scc : chaîne au format Touchstone .s2p mode commun
///
/// LES VIAS ET LES COUDES DE LA PAIRE (`modeles_via`, `coudes_par_troncon`,
/// ceux que la cascade simple a deja modelises sur la piste principale) se
/// posent au meme rang que dans la cascade simple, sur les DEUX brins : la
/// partenaire d'une paire change de couche au meme endroit, par un via de
/// meme dessin -- c'est ce que la symetrie de la paire suppose, et c'est
/// le cas de toute paire routee comme telle. Voir `_abcd_deux_brins`.
///
/// CE QUE LE VIA DEVIENT EN MODE IMPAIR. Son pi (L de boucle de Grover,
/// capacite des antipads et des pastilles, moignons a chaque bout) est
/// applique a chaque brin, AVEC LA MUTUELLE DES DEUX FUTS (5.0.0, voir
/// `_mutuelle_paire`) : L - M_impair et C + 2 C_m en mode impair, L + M_pair
/// en mode commun. Sans via de la partenaire dans le document, l'ecart des
/// futs est celui de la paire, jamais moins que l'antipad ; `vias_mutuelle`
/// dit ce qui a ete pris. La traversee de la cavite entre plans, chemin du
/// courant de RETOUR, n'est comptee qu'en mode commun : en mode impair les
/// retours des deux brins sont opposes et s'annulent.
///
/// `opts` (`options_modele`) : le dielectrique causal fait er(f) dans les
/// pertes ET dans les eps_eff des deux modes, a remplissage constant ; le
/// modele de via est celui que la cascade simple a resolu (`mv["modele"]`).
///
/// LA RUGOSITE DU PLAN DE REFERENCE (5.4.0) : chaque troncon lit
/// `_rugosite_section` sur sa couche et ses plans (`plan_haut`, `plan_bas`
/// du segment), pour les deux modes et la section dissymetrique ; la ligne
/// seule d'un brin (`_abcd_ligne_seule`) aussi. Plan muet : celle de la
/// piste, et la paire d'avant au bit pres.
#[allow(clippy::too_many_arguments)]
pub fn _cascade_differentielle(
    couches: &[Json], objets: &[Json], segments: &[Json], couplage: &Json, freqs: &[f64], z_ref_diff: f64, doc: &Json,
    analyse: &Json, avertissements: &mut Vec<String>, topo: &Json, garder_abcd: bool, modeles_via: &BTreeMap<usize, ModeleVia>,
    coudes_par_troncon: &BTreeMap<usize, Json>, z_trav: &BTreeMap<usize, Vec<Complex64>>, opts: Option<&OptionsModele>,
    quatre_acces: Option<bool>,
) -> Res<Option<SDiff>> {
    if !topo.vrai() || !topo["cascadable"].vrai() || freqs.is_empty() {
        return Ok(None);
    }

    let chaleur = els(&couplage["chaleur"]);
    let paires = els(&couplage["paires"]);
    let mut partenaire: Json = Json::Nul;
    for p in paires {
        if p["differentielle"].vrai() {
            partenaire = p["net_voisin"].clone();
            break;
        }
    }
    if nul(&partenaire) && !paires.is_empty() {
        partenaire = paires[0]["net_voisin"].clone();
    }
    if nul(&partenaire) {
        for c in chaleur {
            if c.vrai() && c["z_diff_net"].vrai() {
                partenaire = c["z_diff_net"].clone();
                break;
            }
        }
    }
    if nul(&partenaire) {
        // UNE PAIRE DECLAREE (5.5.0) dont la partenaire n'est longee a plat
        // nulle part -- elle passe au-dessus ou au-dessous, sur une autre
        // couche : le couplage a plat ne l'a pas vue, la declaration la
        // nomme, et le voisinage dit ou elle est.
        let net = str_ou_vide(&doc["net"]);
        let presents: Noms = els(&doc["voisinage"]).iter().map(|v| str_ou_vide(&v["net"])).collect();
        for pr in els(&doc["paires"]) {
            let pr: Vec<String> = els(pr).iter().map(str_py).take(2).collect();
            if pr.len() == 2 && pr.contains(&net) {
                let autre = if pr[0] == net { &pr[1] } else { &pr[0] };
                if !autre.is_empty() && *autre != net && presents.contains(autre) {
                    partenaire = autre.j();
                    break;
                }
            }
        }
    }

    let mode_force = doc["mode_diff"].vrai() || analyse["mode_diff"].vrai();
    if !partenaire.vrai() && !mode_force {
        return Ok(None);
    }
    let nom_partenaire: Option<String> = if nul(&partenaire) { None } else { Some(str_py(&partenaire)) };

    let mut z_ref_diff = if z_ref_diff == 0.0 || z_ref_diff.is_nan() { 100.0 } else { z_ref_diff };
    if z_ref_diff <= 0.0 {
        z_ref_diff = 100.0;
    }
    let z_ref_comm = z_ref_diff / 4.0;

    let valide = |s: &Json| numd(s, "z0", 0.0) > 0.0;
    let long_p = py::sum(segments.iter().filter(|s| valide(s)).map(|s| num(s, "longueur")));
    let voisinage = els(&doc["voisinage"]);
    let _longueur_v = |v: &Json| -> f64 {
        if v["length"].vrai() {
            return _nombre(&v["length"], 0.0);
        }
        if v["longueur"].vrai() {
            return _nombre(&v["longueur"], 0.0);
        }
        let n = |j: &Json| j.as_f64().unwrap_or(0.0);
        if v["start"].vrai() && v["end"].vrai() {
            return py::hypot(n(&v["end"][0]) - n(&v["start"][0]), n(&v["end"][1]) - n(&v["start"][1]));
        }
        if contient(v, "x1") && contient(v, "y1") && contient(v, "x2") && contient(v, "y2") {
            return py::hypot(n(&v["x2"]) - n(&v["x1"]), n(&v["y2"]) - n(&v["y1"]));
        }
        0.0
    };

    let long_n = py::sum(voisinage.iter().filter(|v| v["net"] == partenaire).map(_longueur_v));
    let delta_l_mm = if long_n > 0.0 && long_p > 0.0 { (long_p - long_n).abs() } else { 0.0 };

    // LA MUTUELLE DES FUTS, une fois par via : elle ne depend pas de la
    // frequence.
    let mut mutuelles: BTreeMap<usize, Json> = BTreeMap::new();
    for (&i_v, mv) in modeles_via {
        if let Some(m) = _mutuelle_paire(mv, doc, nom_partenaire.as_deref().unwrap_or(""), couplage, couches) {
            mutuelles.insert(i_v, m);
        }
    }

    // LES DEUX BRINS, ce qui les distingue : voir « LA PAIRE PAR BRIN ».
    let brins = _brins_de_la_paire(couches, objets, segments, chaleur, doc,
                                   nom_partenaire.as_deref(), modeles_via, coudes_par_troncon,
                                   long_p, long_n)?;
    let dissymetrique = !brins.dissymetries.is_empty();
    let quatre = quatre_acces.unwrap_or(dissymetrique);
    let r0_brin = z_ref_diff / 2.0;
    let mut cache_seul = CacheSeul::new();
    let mut surlong: Option<LigneSeule> = None;
    if let Some(long) = brins.brin_long.filter(|_| quatre) {
        // LA LIGNE SEULE DU BRIN LE PLUS LONG, celle de son dernier troncon.
        if let Some(der) = segments.iter().filter(|s| valide(s)).last() {
            let (couche_l, larg_l) = if long == "n" {
                (brins.couche_n.unwrap_or_else(|| numd(der, "couche", 0.0) as i64),
                 brins.largeur_n.filter(|w| *w != 0.0).unwrap_or_else(|| numd(der, "largeur", 0.2)))
            } else {
                (numd(der, "couche", 0.0) as i64, numd(der, "largeur", 0.2))
            };
            surlong = _ligne_seule(couches, couche_l, larg_l, numd(der, "cuivre", 0.035), &mut cache_seul);
            if surlong.is_none() {
                avertissements.push(
                    "Surlongueur de la paire non modélisée : la section du brin \
                     seul n'a pas pu être résolue.".into());
            }
        }
    }

    let (mut matrices_sdd, mut matrices_scc, mut matrices_scd, mut matrices_sdc): (Vec<C2>, Vec<C2>, Vec<C2>, Vec<C2>) =
        (Vec::new(), Vec::new(), Vec::new(), Vec::new());
    let (mut abcds_dd, mut abcds_cc, mut abcds_brins): (Vec<C2>, Vec<C2>, Vec<C4>) = (Vec::new(), Vec::new(), Vec::new());
    let ligne = |z: Complex64, g: Complex64, longueur: f64| -> C2 {
        let (ch, sh) = ((g * longueur).cosh(), (g * longueur).sinh());
        [[ch, z * sh], [sh / z, ch]]
    };

    for (k_f, &f_flt) in freqs.iter().enumerate() {
        let mut abcd_diff = ID2;
        let mut abcd_comm = ID2;
        let mut m4 = identite4();

        for (i, seg) in segments.iter().enumerate() {
            if !valide(seg) {
                continue;
            }
            let l_m = num(seg, "longueur") * 1e-3;
            let c = chaleur.get(i).filter(|c| c.vrai());
            let seg_er = numd(seg, "er", 4.3);
            let h_m = maxf(&[numd(seg, "h", 0.0), 1e-9]) * 1e-3;

            // LES DISCONTINUITES AVANT LE TRONCON, comme dans la cascade
            // simple : le coude, puis le via.
            if let Some(coude) = coudes_par_troncon.get(&i) {
                let m_c = tl::abcd_coude(num(seg, "largeur") * 1e-3, h_m, seg_er, f_flt, num(coude, "angle_deg"));
                abcd_diff = mul2c(&abcd_diff, &_abcd_deux_brins(&m_c, "diff"));
                abcd_comm = mul2c(&abcd_comm, &_abcd_deux_brins(&m_c, "comm"));
            }
            // PAR BRIN, chaque coude sur le brin qui l'a (`brins["coudes"]`).
            if let Some(ec) = brins.coudes.get(&i).filter(|_| quatre) {
                let cp = ec.p.map(|ang| tl::abcd_coude(num(seg, "largeur") * 1e-3, h_m, seg_er, f_flt, ang));
                let cn = ec.n.map(|ang| tl::abcd_coude(ec.largeur_n * 1e-3, h_m, seg_er, f_flt, ang));
                m4 = mul4(&m4, &_par_brin(cp.as_ref(), cn.as_ref()));
            }
            if let Some(mv) = modeles_via.get(&i) {
                let z_t = match z_trav.get(&i) {
                    Some(z) => z[k_f],
                    None => _impedance_traversee(mv.cavite.as_ref(), f_flt),
                };
                let mut_ = mutuelles.get(&i).unwrap_or(&Json::Nul);
                let modele = mv.modele.unwrap_or("pi");
                let v_dd = _abcd_deux_brins(
                    &_abcd_via(mv, f_flt, Complex64::new(0.0, 0.0), modele,
                               Some(mv.l - numd(mut_, "m_impair", 0.0)),
                               Some(mv.c + 2.0 * numd(mut_, "c_m", 0.0))),
                    "diff");
                let v_cc = _abcd_deux_brins(
                    &_abcd_via(mv, f_flt, z_t, modele,
                               Some(mv.l + numd(mut_, "m_pair", 0.0)), None),
                    "comm");
                abcd_diff = mul2c(&abcd_diff, &v_dd);
                abcd_comm = mul2c(&abcd_comm, &v_cc);
                if quatre {
                    // LE VIA SUR LES DEUX BRINS, mutuelle des futs comprise,
                    // par ses deux modes ; SUR LE BRIN P SEUL, le via de la
                    // cascade simple -- traversee de cavite comprise, son
                    // courant de retour n'a plus de vis-a-vis.
                    if brins.vias.get(&i).copied().unwrap_or("deux") == "deux" {
                        m4 = mul4(&m4, &_brins_des_modes(&v_dd, &v_cc));
                    } else {
                        m4 = mul4(&m4, &_par_brin(Some(&_abcd_via(mv, f_flt, z_t, modele, None, None)), None));
                    }
                }
            }

            let ou_num = |v: &Json, defaut: f64| if v.vrai() { v.as_f64().unwrap_or(defaut) } else { defaut };
            let seg_eps = numd(seg, "eps_eff", 4.0);
            let (mut z_diff_k, mut z_comm_k, mut eps_odd, mut eps_even);
            match c.filter(|c| c["z_diff"].vrai()) {
                Some(c) => {
                    z_diff_k = num(c, "z_diff");
                    z_comm_k = ou_num(&c["z_commune"], z_diff_k / 4.0);
                    eps_odd = ou_num(&c["eps_eff_impair"], seg_eps);
                    eps_even = ou_num(&c["eps_eff_pair"], seg_eps);
                }
                None => {
                    z_diff_k = 2.0 * num(seg, "z0");
                    z_comm_k = num(seg, "z0") / 2.0;
                    eps_odd = seg_eps;
                    eps_even = seg_eps;
                }
            }

            let w_m = numd(seg, "largeur", 0.2) * 1e-3;
            let mut er = seg_er;
            let mut tand = numd(seg, "tan_delta", 0.02);
            let ep_m = numd(seg, "cuivre", 0.035) * 1e-3;

            // LES OPTIONS DE PERTES, comme sur la ligne seule : la topologie
            // et la rugosite de la couche -- pas la hauteur, un mode de paire
            // n'est pas le ruban seul (`_geometrie_pertes`). Et le
            // dielectrique causal, dans les pertes ET dans les deux eps_eff.
            // LA RUGOSITE PROPRE DU PLAN (5.4.0) : lue sur la couche du plan
            // de reference du troncon, comme dans la cascade simple
            // (`_rugosite_section`) ; un plan qui ne declare rien prend celle
            // de la piste, et la paire est celle d'avant au bit pres.
            let kw = kw_reunis(_geometrie_pertes(&obj! {"topo" => &seg["topo"]}, false, true),
                               _rugosite_section(
                                   couches, ent(&seg["couche"], -1),
                                   &obj! {"plan_haut" => &seg["plan_haut"],
                                          "plan_bas" => &seg["plan_bas"]}));
            let pertes = options_pertes(&kw, ep_m);
            let (er_f, tand_f) = _dielectrique(er, tand, f_flt, opts)?;
            if er_f != er {
                let (z_odd_f, e_o) = _milieu_causal(z_diff_k / 2.0, eps_odd, er, er_f);
                let (z_even_f, e_e) = _milieu_causal(2.0 * z_comm_k, eps_even, er, er_f);
                eps_odd = e_o;
                eps_even = e_e;
                z_diff_k = 2.0 * z_odd_f;
                z_comm_k = z_even_f / 2.0;
                er = er_f;
                tand = tand_f;
            }

            let (ac_odd, ad_odd) = tl::line_losses(z_diff_k / 2.0, eps_odd, w_m, er, tand, f_flt, &pertes)?;
            let beta_odd = 2.0 * PI * f_flt * maxf(&[eps_odd, 1.0]).sqrt() / tl::C_0;
            // Zc ET gamma COMPLEXES, par brin (`tl.ligne_a_pertes`) ; le mode
            // differentiel vaut deux fois le brin, le commun la moitie.
            let (zc_odd, gamma_odd) = tl::ligne_a_pertes(z_diff_k / 2.0, ac_odd, ad_odd, beta_odd);
            let z_diff_c = 2.0 * zc_odd;
            abcd_diff = mul2c(&abcd_diff, &ligne(z_diff_c, gamma_odd, l_m));

            let (ac_even, ad_even) = tl::line_losses(2.0 * z_comm_k, eps_even, w_m, er, tand, f_flt, &pertes)?;
            let beta_even = 2.0 * PI * f_flt * maxf(&[eps_even, 1.0]).sqrt() / tl::C_0;
            let (zc_even, gamma_even) = tl::ligne_a_pertes(2.0 * z_comm_k, ac_even, ad_even, beta_even);
            let z_comm_c = zc_even / 2.0;
            abcd_comm = mul2c(&abcd_comm, &ligne(z_comm_c, gamma_even, l_m));

            if !quatre {
                continue;
            }
            let md = brins.sections.get(&i);
            let ls_n = brins.seuls_n.get(&i);
            let sup = brins.superposees.get(&i);

            // LA SECTION A DEUX CONDUCTEURS, par ses deux modes propres :
            // les pertes de chacun a son impedance par brin, a la largeur
            // moyenne ; le dielectrique causal a remplissage constant.
            let couplee = |md: &ModesBrins, longueur: f64| -> Res<C4> {
                let w_moy = md.largeur * 1e-3;
                let (mut gam, mut zm) = ([Complex64::new(0.0, 0.0); 2], [Complex64::new(0.0, 0.0); 2]);
                for k in 0..2 {
                    let (z_b, e_k) = (md.z_brin[k], md.eps[k]);
                    let (mut z_bf, mut e_f) = (z_b, e_k);
                    if er_f != seg_er {
                        (z_bf, e_f) = _milieu_causal(z_b, e_k, seg_er, er_f);
                    }
                    let (a_c, a_d) = tl::line_losses(z_bf, e_f, w_moy, er, tand, f_flt, &pertes)?;
                    let (zc_k, g_k) = tl::ligne_a_pertes(z_bf, a_c, a_d, 2.0 * PI * f_flt * maxf(&[e_f, 1.0]).sqrt() / tl::C_0);
                    gam[k] = g_k;
                    zm[k] = md.zm[k] * zc_k / z_b;
                }
                Ok(_abcd_ligne_couplee(md, gam, zm, longueur))
            };

            // la piste seule d'un cote (le mode impair d'un troncon non
            // couple EST la ligne seule), la partenaire seule de l'autre
            let seuls = |ls_n: &LigneSeule, longueur: f64| -> Res<C4> {
                Ok(_par_brin(Some(&ligne(zc_odd, gamma_odd, longueur)),
                             Some(&_abcd_ligne_seule(ls_n, couches, f_flt, opts, longueur)?)))
            };
            let modes = |longueur: f64| -> C4 {
                _brins_des_modes(&ligne(z_diff_c, gamma_odd, longueur), &ligne(z_comm_c, gamma_even, longueur))
            };

            // UNE PORTION DU TRONCON, de `longueur` metres.
            let bloc = |longueur: f64| -> Res<C4> {
                if let Some(md) = md {
                    return couplee(md, longueur);
                }
                if let (Some(sup), Some(ls_n)) = (sup, ls_n) {
                    // LES BRINS SUPERPOSES (5.5.0) : couples en large face
                    // sur leur recouvrement -- la meme part de chaque
                    // portion --, seuls chacun sur sa couche au-dela.
                    let l_ov = longueur * minf(&[1.0, sup.recouvrement_mm * 1e-3 / maxf(&[l_m, 1e-12])]);
                    let mut m_ = couplee(&sup.md, l_ov)?;
                    if longueur - l_ov > 1e-12 {
                        m_ = mul4(&m_, &seuls(ls_n, longueur - l_ov)?);
                    }
                    return Ok(m_);
                }
                if let Some(ls_n) = ls_n {
                    // LA PARTENAIRE RESTEE SUR SA COUCHE, un plan entre les
                    // deux ou sans recouvrement : chacun seul.
                    return seuls(ls_n, longueur);
                }
                Ok(modes(longueur))
            };
            // LES VIAS DU BRIN N SEUL (5.5.0), a leur abscisse le long du
            // troncon : la portion d'avant, le via -- traversee de cavite
            // comprise quand le modele repris en a une --, la suite.
            let mut fait = 0.0;
            let mut vias_n: Vec<&(f64, ModeleVia)> = brins.vias_n.get(&i).map_or(Vec::new(), |v| v.iter().collect());
            vias_n.sort_by(|x, y| x.0.total_cmp(&y.0));
            for (t_mm, mv_n) in vias_n {
                let t = minf(&[maxf(&[t_mm * 1e-3, fait]), l_m]);
                if t - fait > 1e-12 {
                    m4 = mul4(&m4, &bloc(t - fait)?);
                }
                let z_tn = _impedance_traversee(mv_n.cavite.as_ref(), f_flt);
                m4 = mul4(&m4, &_par_brin(None, Some(&_abcd_via(mv_n, f_flt, z_tn, mv_n.modele.unwrap_or("pi"), None, None))));
                fait = t;
            }
            if l_m - fait > 1e-12 || fait == 0.0 {
                m4 = mul4(&m4, &bloc(l_m - fait)?);
            }
        }

        let (s_dd, s_cc, s_cd);
        if quatre {
            // LA SURLONGUEUR, sur le brin le plus long, cote recepteur.
            if let Some(surlong) = &surlong {
                let lg = _abcd_ligne_seule(surlong, couches, f_flt, opts, brins.surlongueur_mm * 1e-3)?;
                m4 = mul4(&m4, &if brins.brin_long == Some("p") { _par_brin(Some(&lg), None) } else { _par_brin(None, Some(&lg)) });
            }
            let (dd, dc, cd, cc) = _modes_mixtes(&_s_brins(&m4, r0_brin));
            (s_dd, s_cd, s_cc) = (dd, cd, cc);
            matrices_sdc.push(dc);
            if garder_abcd {
                abcds_brins.push(m4);
            }
        } else {
            s_dd = tl::cascade_to_s(&abcd_diff, z_ref_diff);
            s_cc = tl::cascade_to_s(&abcd_comm, z_ref_comm);

            let eps_moy = segments.first().map_or(4.0, |s| numd(s, "eps_eff", 4.0));
            let delta_tau = (delta_l_mm * 1e-3 * maxf(&[eps_moy, 1.0]).sqrt()) / tl::C_0;
            let phi_skew = PI * f_flt * delta_tau;
            let scd21_mag = s_dd[1][0].norm() * phi_skew.sin().abs();
            let scd21_mag = maxf(&[1e-7, minf(&[1.0, scd21_mag])]);
            s_cd = [[c(1e-7), c(1e-7)],
                    [c(scd21_mag), c(1e-7)]];
        }

        matrices_sdd.push(s_dd);
        matrices_scc.push(s_cc);
        matrices_scd.push(s_cd);
        if garder_abcd {
            abcds_dd.push(abcd_diff);
            abcds_cc.push(abcd_comm);
        }
    }

    let nom_p = if doc["net"].vrai() { str_py(&doc["net"]) } else { "P".to_string() };
    let nom_n = match &nom_partenaire {
        Some(n) if !n.is_empty() => n.clone(),
        _ => "N".to_string(),
    };
    let mut entete_sdd = vec![
        "WEB_CAO -- Parametres S differentiels purs (Sdd)".to_string(),
        format!("Paire : {} / {}", nom_p, nom_n),
        format!("Impedance de reference differentielle : {:.1} ohm", z_ref_diff),
        format!("Skew mesure : {:.3} mm", delta_l_mm),
    ];
    let mut entete_scc = vec![
        "WEB_CAO -- Parametres S de mode commun pur (Scc)".to_string(),
        format!("Paire : {} / {}", nom_p, nom_n),
        format!("Impedance de reference mode commun : {:.1} ohm", z_ref_comm),
        format!("Skew mesure : {:.3} mm", delta_l_mm),
    ];
    if quatre {
        for ent in [&mut entete_sdd, &mut entete_scc] {
            ent.push("Cascade a quatre acces, brin par brin (paire \
                      dissymetrique) : conversions de mode comprises".to_string());
        }
        avertissements.push(format!(
            "Paire dissymétrique ({}) : cascade à quatre accès, brin par \
             brin — Sdd, Scc, Scd et Sdc en sortent exacts.",
            if brins.dissymetries.is_empty() { "forcée".to_string() } else { brins.dissymetries.join("; ") }));
    }
    avertissements.extend(brins.notes.iter().cloned());
    let brin_long: Json = match brins.brin_long {
        Some("p") => nom_p.j(),
        Some(_) => partenaire.clone(),
        None => Json::Nul,
    };

    let mut sortie = obj! {
        "partenaire" => &partenaire,
        // CE QUE LA CASCADE DE LA PAIRE PORTE, au-dela des troncons : la page
        // et l'oeil le disent, plutot que de le supposer.
        "vias" => modeles_via.len(),
        "coudes" => coudes_par_troncon.len(),
        // LA MUTUELLE DES FUTS, via par via : ce qui a ete retranche en mode
        // impair et ajoute en mode commun, et d'ou vient l'ecart.
        "vias_mutuelle" => mutuelles.iter().map(|(i_v, m)| obj! {
            "troncon" => *i_v,
            "m_impair_nH" => round(num(m, "m_impair") * 1e9, 4),
            "m_pair_nH" => round(num(m, "m_pair") * 1e9, 4),
            "c_mutuelle_fF" => round(num(m, "c_m") * 1e15, 3),
            "l_impair_nH" => rnp((modeles_via[i_v].l - num(m, "m_impair")) * 1e9, 4),
            "ecart_mm" => &m["ecart_mm"], "ecart_source" => &m["source"],
            "retours" => &m["retours"]}).collect::<Vec<Json>>(),
        "delta_l_mm" => round(delta_l_mm, 4),
        "z_ref_diff" => z_ref_diff,
        "z_ref_comm" => z_ref_comm,
        "s_dd" => plat(&matrices_sdd),
        "s_cc" => plat(&matrices_scc),
        "s_cd" => plat(&matrices_scd),
        "touchstone_sdd" => if !matrices_sdd.is_empty() { touchstone(freqs, &matrices_sdd, z_ref_diff, &entete_sdd) } else { String::new() },
        "touchstone_scc" => if !matrices_scc.is_empty() { touchstone(freqs, &matrices_scc, z_ref_comm, &entete_scc) } else { String::new() },
        // LA PAIRE PAR BRIN (5.1.0) : si la cascade a quatre acces a servi,
        // ce qui la rendait necessaire, et le brin le plus long (son net),
        // que l'oeil n'a plus a supposer.
        "quatre_acces" => quatre,
        "dissymetrique" => dissymetrique,
        "dissymetries" => brins.dissymetries.clone(),
        "brin_long" => brin_long,
        "brin_long_role" => brins.brin_long,
        "vias_brins" => obj! {"deux" => brins.vias.values().filter(|x| **x == "deux").count(),
                              "p" => brins.vias.values().filter(|x| **x == "p").count(),
                              "n" => brins.vias_n.values().map(Vec::len).sum::<usize>()},
        "superposees" => brins.superposees.iter().map(|(i, x)| obj! {
            "troncon" => *i, "recouvrement_mm" => round(x.recouvrement_mm, 4),
            "decalage_mm" => round(x.decalage_mm, 4),
            "z_diff" => round(x.md.zm[0], 3),
            "z_commune" => round(x.md.zm[1], 3)}).collect::<Vec<Json>>(),
    };
    if quatre {
        poser(&mut sortie, "s_dc", plat(&matrices_sdc));
    }
    // LA MATRICE ABCD DU MODE DIFFERENTIEL, comme `garder_abcd` le fait pour
    // la ligne seule : tableaux numpy, hors JSON, pour python/oeil.py. Et
    // celle du mode commun, et -- cascade a quatre acces -- celle de la paire
    // par brin (4 x 4). Pour une paire dissymetrique, `abcd_dd` et `abcd_cc`
    // sont ceux de la paire SYMETRISEE (diagonales moyennees, vias et coudes
    // sur les deux brins, sans surlongueur) : la reference de l'oeil.
    if garder_abcd && quatre {
        // LA RESISTANCE CONTINUE DE CHAQUE BRIN (P, N), en ohms : comme
        // le « r_continu » de `simuler` (1 / sigma w t), a la largeur que
        // la cascade donne a chaque brin, surlongueur comprise.
        let mut r_brins = [0.0, 0.0];
        for (i, seg) in segments.iter().enumerate() {
            let t = numd(seg, "cuivre", 0.0);
            if !valide(seg) || numd(seg, "largeur", 0.0) <= 0.0 || t <= 0.0 {
                continue;
            }
            let mut w_n = num(seg, "largeur");
            if brins.sections.contains_key(&i) {
                w_n = num(&chaleur[i]["matrices_paire"], "largeur_n");
            } else if brins.seuls_n.contains_key(&i) || brins.superposees.contains_key(&i) {
                w_n = brins.largeur_n.filter(|w| *w != 0.0).unwrap_or(w_n);
            }
            for (k, w) in [(0, num(seg, "largeur")), (1, w_n)] {
                r_brins[k] += num(seg, "longueur") / (tl::SIGMA_CU * w * t) * 1e3;
            }
        }
        if let Some(surlong) = &surlong {
            r_brins[if brins.brin_long == Some("p") { 0 } else { 1 }] +=
                brins.surlongueur_mm / (tl::SIGMA_CU * surlong.largeur * surlong.ep) * 1e3;
        }
        poser(&mut sortie, "r_continu_brins", r_brins.to_vec());
    }
    Ok(Some(SDiff { json: sortie, abcd_dd: abcds_dd, abcd_cc: abcds_cc, abcd_brins: abcds_brins }))
}
