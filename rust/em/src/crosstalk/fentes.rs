//! L'impedance commune d'une fente du plan de reference : le modele d'Ott, les termes de
//! chaque victime, et leur ajout au niveau 2.

use super::*;
use crate::simulation_em::base::*;
use std::f64::consts::PI;

// ==========================================================================
// L'IMPEDANCE COMMUNE D'UNE FENTE DU PLAN DE REFERENCE (Ott)
// --------------------------------------------------------------------------
// LA SECTION DROITE SUPPOSE UN PLAN CONTINU : la ou il est fendu, le courant
// de retour fait le tour de la fente par ses deux bouts, et ce detour n'est
// dans aucune des matrices [C] et [L]. Quand l'agresseur ET la victime
// franchissent la meme fente, leurs deux retours empruntent le MEME cuivre :
// c'est un couplage par impedance commune, et il se chiffre a part.
//
// LE DETOUR EST UNE SELF (Ott, EMC Engineering, 2009, fentes du plan) :
// L = mu0/2pi . D . ln(D/W) pour une fente de longueur D franchie en son
// milieu par une piste de largeur W ; pour un detour d d'un seul cote, c'est
// la moitie d'une boucle de 2d, L_d = mu0/pi . 2d . ln(2d/W), et les deux
// detours sont en parallele -- exactement la forme de `rf_reseau.z_fente`,
// pour que l'onglet RF et l'onglet Crosstalk designent la meme physique.
//
// LA MUTUELLE A LA MEME FORME, l'entraxe S remplacant W : le flux du retour
// de l'agresseur que la boucle de la victime embrasse s'integre de S (la
// piste victime) a 2d (le bout de la fente). M <= L_d par construction, et
// M = L_d quand les deux retours sont confondus.
//
// LA F.E.M. M . dI/dt induite dans la boucle de la victime se partage entre
// ses deux bouts adaptes (2 Z0 en serie) : +M/(2 Z0 t_r) renvoye vers la
// source (NEXT), -M/(2 Z0 t_r) vers la charge (FEXT), en fraction de
// l'echelon unitaire de l'agresseur. La self du detour, en serie dans la
// boucle de l'agresseur (2 Z0), limite elle-meme la pente du courant : la
// rampe de t_r est lissee par tau = L_d / 2 Z0, d'ou le facteur
// (1 - exp(-t_r / tau)) -- le terme ne depasse jamais M / L_d, la part du
// retour de l'agresseur que la victime partage.
//
// LA FOURCHETTE. Le logarithme ne sait pas ou passe exactement le courant.
// Mutuelle HAUTE : M = L_d, les deux retours confondus (c'est l'option E,
// la borne). Mutuelle BASSE : l'entraxe compte depuis le bord d'un courant
// de retour etale sur W + 2H sous un microruban, ln(2d / (S + W + 2H)).
// La valeur centrale est celle d'Ott, S d'axe a axe.
//
// LA RESONANCE (option C). Chaque detour est un troncon de fente
// court-circuite au bout : sa self vaut L_d . tan(beta d)/(beta d) a la
// frequence f, beta dans la permittivite moyenne des deux faces du plan, avec
// la perte Q = 50 de `z_fente` qui tient lieu de son rayonnement. Au genou du
// front, 0,35 / t_r, elle ne pese que sous ~300 ps : une fente de 20 mm dans
// du FR-4 (eps 4,5 des deux faces) resonne vers 3,5 GHz. La fiche dit quand
// elle a compte.
//
// LIMITES, et elles sont dites : une fente droite, franchie a peu pres
// perpendiculairement, TOUS les plans de retour coupes. Une fente qui laisse
// un plan intact dessous (cas 4b du banc) n'applique pas ce terme : le
// retour change de plan au lieu de contourner, et c'est la section retombee
// sur ce plan qui est rendue -- la mesure dira lequel a raison.
// ==========================================================================

pub const MU_0: f64 = 4e-7 * PI;
// La perte qui tient lieu du rayonnement de la fente -- la meme que
// `rf_reseau.FENTE_Q`, pour que les deux onglets resonnent au meme endroit.
pub const FENTE_Q: f64 = 50.0;
// Le plafond du detour que la page mesure (un plan coupe de bord a bord), le
// meme que `SIM_RF_FENTE_MAX` et `analyse_carte.FENTE_MAX_MM`.
pub const FENTE_MAX: f64 = 30.0;
// Au-dela de ce facteur, la resonance a PESE sur le chiffre et la fiche le dit.
pub const FENTE_RESONANCE_SENSIBLE: f64 = 1.05;

/// La self d'un detour de d mm du courant de retour, en henrys :
/// L_d = mu0/pi . 2d . ln(2d / W) (Ott), pour un courant de largeur W.
/// Nulle quand le detour n'est pas plus long que la largeur.
pub fn self_detour(d_mm: f64, w_mm: f64) -> f64 {
    let d = d_mm * 1e-3;
    let w = maxf(&[w_mm, 1e-6]) * 1e-3;
    if d <= 0.0 || 2.0 * d <= w {
        return 0.0;
    }
    MU_0 / PI * 2.0 * d * (2.0 * d / w).ln()
}

/// |tan(x) / x|, x = beta.d.(1 - j/2Q) : ce qu'un detour de d mm, troncon
/// de fente court-circuite au bout, vaut EN PLUS de sa self a la frequence f
/// (Hz). 1 au continu ; ~2Q/pi au quart d'onde.
pub fn facteur_resonance(d_mm: f64, eps_r: f64, f: f64) -> f64 {
    if !(f > 0.0 && d_mm > 0.0) {
        return 1.0;
    }
    let beta = 2.0 * PI * f * maxf(&[eps_r, 1.0]).sqrt() / C_0;
    let x = Complex64::new(beta * d_mm * 1e-3, 0.0) * Complex64::new(1.0, -0.5 / FENTE_Q);
    if x.norm() < 1e-9 {
        return 1.0;
    }
    (x.tan() / x).norm()
}

/// La permittivite moyenne des deux dielectriques qui bordent la couche
/// `indice` (1 pour l'air) : c'est dans ce milieu que la fente resonne.
/// Meme lecture que `rf_reseau._eps_plan`.
pub fn eps_autour_plan(couches: &[Json], indice: i64) -> f64 {
    let mut ers = Vec::new();
    for k in [indice - 1, indice + 1] {
        if 0 <= k && (k as usize) < couches.len() && couches[k as usize]["type"].as_str() == Some("dielectric") {
            ers.push(_nb(&couches[k as usize]["epsilon_r"], 4.3));
        } else {
            ers.push(1.0);
        }
    }
    0.5 * py::sum(ers)
}

/// Le terme de couplage par IMPEDANCE COMMUNE d'une fente franchie par
/// l'agresseur et la victime -- voir le cartouche ci-dessus.
///
/// d1, d2    les detours du retour de chaque cote du franchissement, en mm ;
/// w_a       la largeur de l'agresseur (mm), celle du courant d'Ott ;
/// entraxe   la distance d'axe a axe des deux pistes au franchissement (mm) ;
/// t_r       le front (s) ; z0 l'impedance des lignes (ohm) ;
/// hauteur   la hauteur de l'agresseur a son plan (mm), pour la borne basse ;
/// w_v       la largeur de la victime (mm ; celle de l'agresseur a defaut) ;
/// eps_plan  la permittivite autour du plan coupe, pour la resonance ;
/// borne     un detour plafonne par la page (plan coupe de bord a bord).
///
/// Rend un dictionnaire : les selfs en nH (L_d, M, et M basse / haute), le
/// NEXT et le FEXT du terme (fractions, egaux en module), leur fourchette,
/// le lissage par la self du detour et ce que la resonance a pese.
///
/// Les defauts du Python : `z0` 50, `hauteur` 0, `w_v` None, `eps_plan` 1, `resonance` vrai,
/// `borne` faux.
pub fn impedance_commune_fente(d1: f64, d2: f64, w_a: f64, entraxe: f64, t_r: f64, z0: f64, hauteur: f64,
                               w_v: Option<f64>, eps_plan: f64, resonance: bool, borne: bool) -> Json {
    let t_r = if t_r > 0.0 { t_r } else { TR_DEFAUT };
    let z0 = if z0 > 0.0 { z0 } else { 50.0 };
    let w_a = maxf(&[w_a, 1e-3]);
    let w_v = w_v.filter(|w| *w > 0.0).unwrap_or(w_a);
    // UN ENTRAXE SOUS LA LARGEUR DE L'AGRESSEUR : les deux retours sont
    // confondus, et la mutuelle vaut la self. Le logarithme s'arrete la.
    let s = maxf(&[entraxe, w_a]);
    let f_genou = 0.35 / t_r;
    let w_retour = w_a + 2.0 * maxf(&[hauteur, 0.0]);
    // un detour : (d, facteur, l, m, m_bas, m_haut)
    let detours: Vec<[f64; 6]> = [d1, d2].iter().map(|&d| {
        let r = if resonance { facteur_resonance(d, eps_plan, f_genou) } else { 1.0 };
        let l_d = self_detour(d, w_a);
        [round(d, 3), round(r, 4),
         l_d * r,
         minf(&[self_detour(d, s), l_d]) * r,
         minf(&[self_detour(d, s + w_retour), l_d]) * r,
         l_d * r]
    }).collect();

    // Les deux detours en parallele ; un detour nul court-circuite.
    let parallele = |cle: usize| {
        let (a, b) = (detours[0][cle], detours[1][cle]);
        if a <= 0.0 || b <= 0.0 {
            return 0.0;
        }
        a * b / (a + b)
    };

    let l_d = parallele(2);
    let (m, m_bas, m_haut) = (parallele(3), parallele(4), parallele(5));
    // LA SELF DU DETOUR LISSE LA PENTE : tau = L_d / 2 Z0 dans la boucle de
    // l'agresseur. Sans ce facteur, un front de 100 ps sur un detour de 10 mm
    // rendrait un terme de 100 %, ce qui ne veut rien dire ; avec lui, il
    // tend vers M / L_d, la part du retour que la victime partage.
    let tau = if l_d > 0.0 { l_d / (2.0 * z0) } else { 0.0 };
    let lissage = if tau > 0.0 { 1.0 - (-t_r / tau).exp() } else { 1.0 };

    let niveau = |mutuelle: f64| mutuelle / (2.0 * z0 * t_r) * lissage;

    let nxt = niveau(m);
    let (bas, haut) = (niveau(m_bas), niveau(m_haut));
    let facteur = maxf(&[detours[0][1], detours[1][1]]);
    let quart: Vec<f64> = detours.iter().filter(|x| x[0] > 0.0)
        .map(|x| C_0 / (4.0 * x[0] * 1e-3 * maxf(&[eps_plan, 1.0]).sqrt())).collect();
    obj! {
        "d1" => detours[0][0], "d2" => detours[1][0], "borne" => borne,
        "largeur_agresseur" => round(w_a, 4), "largeur_victime" => round(w_v, 4),
        "entraxe" => round(s, 4), "hauteur" => round(hauteur, 4),
        "z0" => round(z0, 2), "t_r" => t_r,
        "ld_nh" => round(1e9 * l_d, 3), "m_nh" => round(1e9 * m, 3),
        "m_bas_nh" => round(1e9 * m_bas, 3), "m_haut_nh" => round(1e9 * m_haut, 3),
        "k" => if l_d > 0.0 { round(m / l_d, 4) } else { 0.0 },
        "tau_ps" => round(1e12 * tau, 2), "lissage" => round(lissage, 4),
        // LE TERME : +NEXT et -FEXT, le meme module aux deux bouts.
        "next" => round(nxt, 6), "fext" => round(nxt, 6),
        "next_pc" => round(100.0 * nxt, 3), "fext_pc" => round(100.0 * nxt, 3),
        "fourchette" => vec![round(bas, 6), round(haut, 6)],
        "fourchette_pc" => vec![round(100.0 * bas, 3), round(100.0 * haut, 3)],
        "resonance" => obj! {"appliquee" => resonance, "facteur" => round(facteur, 4),
                             "sensible" => resonance
                                           && facteur > FENTE_RESONANCE_SENSIBLE,
                             "f_genou" => f_genou,
                             "f_quart_onde" => if quart.is_empty() { 0.0 } else { minf(&quart) },
                             "eps_plan" => round(eps_plan, 3)},
        "methode" => "impédance commune du retour (Ott) : L_d = μ0/π·2d·ln(2d/W), \
                      M de même forme avec l'entraxe, deux détours en parallèle, \
                      f.é.m. M·dI/dt partagée en +NEXT / −FEXT, lissée par \
                      τ = L_d/2Z0 ; fourchette entre M basse (S + W + 2H) et \
                      M = L_d"}
}

/// Le diagnostic `niveau2` d'une paire, complete des termes de fente.
///
/// LE NEXT PREND LE PLUS FORT DES TERMES : deux fentes a des abscisses
/// differentes renvoient leur impulsion au bout proche a des instants
/// differents, elles ne s'additionnent pas. LE FEXT LES SOMME : le bruit
/// avant co-propage avec l'agresseur, et tout arrive ensemble au bout
/// lointain. Les deux s'ajoutent en module a ceux des lignes couplees -- en
/// phase, le pire cas, comme la somme des agresseurs. `lignes` garde le
/// chiffre des lignes seules ; `fente` porte le terme et sa fourchette.
pub fn ajouter_fentes_niveau2(n2: &Json, termes: &[Json], orange: f64, rouge: f64) -> Json {
    if termes.is_empty() {
        return n2.clone();
    }
    let mut out = n2.clone();
    let mut lignes = obj! {};
    for k in ["next", "fext", "next_pc", "fext_pc",
              "next_db", "fext_db", "statut_next",
              "statut_fext", "statut"] {
        if let Some(v) = n2.get(k) {
            poser(&mut lignes, k, v);
        }
    }
    poser(&mut out, "lignes", lignes);
    let liste = |f: &dyn Fn(&Json) -> f64| termes.iter().map(f).collect::<Vec<f64>>();
    let n_f = maxf(&liste(&|t| num(t, "next")));
    let f_f = py::sum(liste(&|t| num(t, "fext")));
    let n_bas = maxf(&liste(&|t| nb(&t["fourchette"][0])));
    let n_haut = maxf(&liste(&|t| nb(&t["fourchette"][1])));
    let f_bas = py::sum(liste(&|t| nb(&t["fourchette"][0])));
    let f_haut = py::sum(liste(&|t| nb(&t["fourchette"][1])));
    let nxt = num(n2, "next") + n_f;
    let fxt = num(n2, "fext") + f_f;
    let (s_n, s_f) = (statut(nxt, orange, rouge), statut(fxt, orange, rouge));
    maj(&mut out, obj! {
        "next" => round(nxt, 6), "next_pc" => round(100.0 * nxt, 3),
        "next_db" => round(_db(nxt), 2),
        "fext" => round(fxt, 6), "fext_pc" => round(100.0 * fxt, 3),
        "fext_db" => round(_db(fxt), 2),
        "next_fourchette" => vec![round(num(n2, "next") + n_bas, 6),
                                  round(num(n2, "next") + n_haut, 6)],
        "fext_fourchette" => vec![round(num(n2, "fext") + f_bas, 6),
                                  round(num(n2, "fext") + f_haut, 6)],
        "statut_next" => s_n, "statut_fext" => s_f,
        "statut" => pire_statut(&[s_n, s_f]),
        "fente" => obj! {"nombre" => termes.len(),
                         // B des qu'un terme a ete RESOLU (PEEC), A s'il n'y a qu'Ott
                         "modele" => if termes.iter().any(|t| t["modele"].as_str() == Some("B")) { "B" } else { "A" },
                         "next" => round(n_f, 6), "fext" => round(f_f, 6),
                         "next_pc" => round(100.0 * n_f, 3),
                         "fext_pc" => round(100.0 * f_f, 3),
                         "next_fourchette" => vec![round(n_bas, 6), round(n_haut, 6)],
                         "fext_fourchette" => vec![round(f_bas, 6), round(f_haut, 6)],
                         "statut" => pire_statut(&[statut(n_f, orange, rouge),
                                                   statut(f_f, orange, rouge)]),
                         "resonance_sensible" => termes.iter().any(|t| t["resonance"]["sensible"].vrai()),
                         "detail" => termes.to_vec()}});
    out
}

/// Les termes de fente, victime par victime : le dict {net: [termes]} de Python, dans
/// l'ordre d'insertion.
pub type TermesFentes = Vec<(String, Vec<Json>)>;

fn ajouter_terme(termes: &mut TermesFentes, net: &str, terme: Json) {
    match termes.iter_mut().find(|(n, _)| n == net) {
        Some((_, l)) => l.push(terme),
        None => termes.push((net.to_string(), vec![terme])),
    }
}

/// Les termes d'impedance commune, victime par victime, d'apres les
/// fentes que la page a MESUREES. Rend ({net: [termes]}, signales).
///
/// UNE FENTE QUI ARRIVE AVEC SON IMAGE (`maillage`, depuis la 4.6.0) EST
/// RESOLUE (option B, `peec_fente`) : toute forme, tout angle, un plan qui
/// reste dessous, des vias, une victime sur une autre couche -- les
/// victimes sont prises dans leur propre cuivre, pas dans le profil
/// d'espacement. Sans image (page anterieure, budget epuise), le modele
/// d'Ott d'avant (option A) avec d1 / d2.
///
/// `signales` porte ce qui n'a PAS ete chiffre, et pourquoi -- une fente
/// sans detour mesure ni image, un plan qui ferme encore le retour sans
/// image, une victime que la fente n'atteint pas -- pour que la fiche le
/// dise a la place d'un silence.
pub fn termes_fentes(doc: &Json, couches: &[Json], parcours: &[Troncon], retenus: &[Json], blocs: &[Json], t_r: f64,
                     notes: &mut Vec<String>, voisinage: &[Json]) -> (TermesFentes, Vec<Json>) {
    let (mut termes, mut signales): (TermesFentes, Vec<Json>) = (Vec::new(), Vec::new());
    let fentes = els(&doc["fentes"]);
    // LE BUDGET VA AUX PLUS GRANDES FENTES, pas aux premieres du parcours :
    // un degagement d'antipad ne doit pas prendre la place d'une vraie fente.
    let mut imagees: Vec<usize> = (0..fentes.len()).filter(|&k| fentes[k].as_objet().is_some() && fentes[k]["maillage"].as_objet().is_some()).collect();
    let poids = |k: &usize| -(maxf(&[nb(&fentes[*k]["d1"]), nb(&fentes[*k]["d2"])]) + nb(&fentes[*k]["longueur"]));
    imagees.sort_by(|a, b| poids(a).partial_cmp(&poids(b)).unwrap_or(std::cmp::Ordering::Equal));
    imagees.truncate(peec_fentes_max());
    for (rang, f) in fentes.iter().enumerate() {
        if f.as_objet().is_none() {
            continue;
        }
        let image = f.get("maillage").filter(|m| m.as_objet().is_some());
        let sans_detours = nul(&f["d1"]) || nul(&f["d2"]);
        if image.is_none() && sans_detours {
            continue;
        }
        let s0 = nb(&f["s"]);
        let s1 = s0 + maxf(&[_nb(&f["longueur"], 0.0), 0.1]);
        let milieu = 0.5 * (s0 + s1);
        let (d1, d2) = (nb(&f["d1"]), nb(&f["d2"]));
        let borne = f["borne"].vrai();
        let plans: Vec<String> = els(&f["plans"]).iter().filter(|x| x.vrai()).map(str_py).collect();
        let Some(seg) = parcours.iter().find(|p| p.s0 - TOL_BORNE <= milieu && milieu <= p.s1 + TOL_BORNE) else { continue };
        // LES PLANS QUI FERMENT ENCORE LE RETOUR. La page les nomme ; une
        // page qui ne le fait pas les deduit de l'empilage, PRUDEMMENT : tout
        // plan declare que la fente ne coupe pas est tenu pour un retour --
        // le terme ne s'applique alors que si la page dit TOUS les plans
        // coupes.
        let retour: Vec<String> = if !nul(&f["retour"]) {
            els(&f["retour"]).iter().filter(|x| x.vrai()).map(str_py).collect()
        } else {
            couches.iter().filter(|c| c["type"].as_str() == Some("copper")
                                  && c["role"].as_str() == Some("plane") && c["name"].vrai())
                .map(|c| str_py(&c["name"])).filter(|n| !plans.contains(n)).collect::<Noms>().into_iter().collect()
        };
        let bloc = blocs.iter().find(|b| nb(&b["s0"]) - TOL_BORNE <= milieu
                                     && milieu <= nb(&b["s1"]) + TOL_BORNE);
        let z0 = bloc.map_or(0.0, |b| _nb(&b["z0"], 0.0));
        let z0 = if z0 != 0.0 { z0 } else { 50.0 };
        let hauteur = se::_hauteur_de_couche(couches, seg.couche, seg.largeur,
                                             seg.epaisseur, &[], false, false);
        let indice_plan = couches.iter().position(|c| c["name"].as_str().is_some_and(|n| plans.iter().any(|p| p == n)));
        let eps_plan = indice_plan.map_or(1.0, |k| eps_autour_plan(couches, k as i64));

        // Le terme d'Ott de la victime c, ou None quand il ne vaut pas.
        let ott = |c: &Json, entraxe: f64, resonance: bool| -> Option<Json> {
            if !retour.is_empty() || sans_detours {
                return None;
            }
            Some(impedance_commune_fente(
                d1, d2, seg.largeur, entraxe, t_r, z0, hauteur,
                c["largeur"].as_f64(), eps_plan, resonance, borne))
        };

        let intervalle = |c: &Json| -> Option<Json> {
            els(&c["intervalles"]).iter().find(|i| minf(&[num(i, "s1"), s1]) - maxf(&[num(i, "s0"), s0])
                                               > TOL_BORNE).cloned()
        };

        if let (Some(image), true) = (image, imagees.contains(&rang)) {
            let troncons = |objets: &mut dyn Iterator<Item = &Json>| -> Vec<Trc> {
                objets.filter_map(|o| {
                    let b = se::_extremites(o)?;
                    Some((b.0.0, b.0.1, b.1.0, b.1.1,
                          _nb(&o["width"], 0.1),
                          ent(&o["layer"], 0)))
                }).collect()
            };
            let agr = troncons(&mut parcours.iter().map(|p| &p.obj));
            let vict: Vec<(String, Vec<Trc>)> = retenus.iter().map(|c| {
                let net = str_py(&c["net"]);
                let tr = troncons(&mut voisinage.iter().filter(|o| str_ou_vide(&o["net"]) == net));
                (net, tr)
            }).collect();
            let (scene, noms, mut raison) = scene_fente(image, couches, &agr, &vict);
            let mut r = None;
            if let Some(scene) = &scene {
                match peec_fente(scene, 0.35 / (if t_r != 0.0 { t_r } else { TR_DEFAUT })) {
                    Ok(x) => r = x,
                    Err(exc) => raison = format!("résolution refusée ({exc})"),
                }
            }
            if let Some(r) = r {
                for (i, net) in noms.iter().enumerate() {
                    if r.m[i].is_none() {
                        continue;
                    }
                    let Some(c) = retenus.iter().find(|x| x["net"].as_str() == Some(net)) else { continue };
                    let it = intervalle(c);
                    let (mut a, mut b) = (None, None);
                    if let Some(it) = &it {
                        let e = nb(&it["x"]).abs();
                        (a, b) = (ott(c, e, true), ott(c, e, false));
                    }
                    let facteur = match (&a, &b) {
                        (Some(a), Some(b)) if num(b, "ld_nh") > 0.0 => num(a, "ld_nh") / num(b, "ld_nh"),
                        _ => 1.0,
                    };
                    let mut terme = terme_peec(&r, i, t_r, z0, a.as_ref(), facteur);
                    maj(&mut terme, obj! {
                        "s0" => round(s0, 3), "s1" => round(s1, 3), "victime" => net,
                        "plans" => plans.clone(), "retour" => retour.clone(), "borne" => borne,
                        "d1" => round(d1, 3), "d2" => round(d2, 3),
                        "entraxe" => it.as_ref().map(|it| round(nb(&it["x"]).abs(), 4)),
                        "largeur_fente" => round(_nb(&f["largeur"], s1 - s0), 3)});
                    ajouter_terme(&mut termes, net, terme);
                }
                continue;
            }
            signales.push(obj! {"s0" => round(s0, 3), "s1" => round(s1, 3),
                                "cause" => "image",
                                "texte" => format!("l'image du plan n'a pas pu être \
                                                    résolue ({}) : modèle d'Ott à la \
                                                    place", if raison.is_empty() { "rien à mailler" } else { &raison })});
        } else if image.is_some() {
            signales.push(obj! {"s0" => round(s0, 3), "s1" => round(s1, 3),
                                "cause" => "budget",
                                "texte" => format!("plus de {} fentes à résoudre : celle-ci \
                                                    prend le modèle d'Ott", peec_fentes_max())});
        }
        if sans_detours {
            continue;
        }
        if !retour.is_empty() {
            signales.push(obj! {"s0" => round(s0, 3), "s1" => round(s1, 3),
                                "cause" => "retour",
                                "texte" => format!("un plan ferme encore le retour sous la \
                                                    fente ({}) : le courant change de plan \
                                                    au lieu de la contourner, et c'est la \
                                                    section retombée sur ce plan qui est \
                                                    rendue, sans terme d'impédance commune",
                                                   guillemets(&retour, ", "))});
            continue;
        }
        for c in retenus {
            let Some(it) = intervalle(c) else { continue };
            let entraxe = nb(&it["x"]).abs();
            // `x` EST SIGNE : negatif a gauche du sens de marche (cote +1,
            // celui de d1), positif a droite (d2) -- la convention de la
            // couture, que la page suit pour les detours.
            let cote = if nb(&it["x"]) < 0.0 { 1 } else { -1 };
            let d_cote = if cote > 0 { d1 } else { d2 };
            let net = str_py(&c["net"]);
            if entraxe > d_cote + TOL_BORNE && !borne {
                signales.push(obj! {"s0" => round(s0, 3), "s1" => round(s1, 3),
                                    "victime" => &net, "cause" => "hors fente",
                                    "texte" => format!("la fente s'arrête à {d_cote:.1} mm du côté \
                                                        de « {net} », qui passe à {entraxe:.2} mm : \
                                                        elle ne la franchit pas, pas \
                                                        d'impédance commune")});
                continue;
            }
            let Some(mut terme) = ott(c, entraxe, true) else { continue };
            maj(&mut terme, obj! {"modele" => "A", "s0" => round(s0, 3), "s1" => round(s1, 3),
                                  "victime" => &net, "plans" => plans.clone(),
                                  "largeur_fente" => round(_nb(&f["largeur"],
                                                               s1 - s0), 3)});
            ajouter_terme(&mut termes, &net, terme);
        }
    }
    if !termes.is_empty() {
        let z: std::collections::BTreeSet<String> = termes.iter().flat_map(|(_, ts)| ts.iter().map(|t| f(&t["z0"], 0))).collect();
        notes.push(format!(
            "Z0 de l'agresseur pris dans le bloc du franchissement pour le \
             terme de fente ({} Ω).",
            z.into_iter().collect::<Vec<_>>().join(", ")));
    }
    (termes, signales)
}
