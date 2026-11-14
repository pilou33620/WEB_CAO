//! Le chemin de retour de chaque via de signal qui change de couche.

use crate::base::*;
use crate::commun::*;

/// Chaque via de signal qui change de couche : son courant de retour trouve-t-il un chemin
/// court, et que coûte-t-il à la cadence de son net ?
///
/// LE MÊME MOTEUR QUE L'ONGLET CURRENT RETURN PATH (simulation_em) : plans de référence de
/// part et d'autre, net de ces plans AU DROIT du via (mesuré par la page), vias de masse
/// retenus et leur inductance de boucle, traversée de cavité par les condensateurs de
/// pontage quand les deux plans sont de nets différents. Ce qu'on ajoute : le verdict à la
/// cadence du net, par la réflexion |Γ| = |Z| / |Z + 2 Z0| que cette impédance série cause
/// sur la ligne.
pub fn retours(doc: &Doc, couches: &[Json], reg: &Json, unite: f64) -> R<(Vec<Json>, Json)> {
    let z_bornes = se::_z_empilage(couches);
    let refs: Noms = doc.liste("reference_nets").iter().map(str_py).filter(|x| !py::strip(x).is_empty()).collect();
    let nom = |i: i64| if 0 <= i && (i as usize) < couches.len() {
        let n = &couches[i as usize]["name"];
        if n.vrai() { str_py(n) } else { i.to_string() }
    } else {
        "?".to_string()
    };
    let noms_de = |v: &Json, defaut: &str| -> Vec<String> {
        if v.vrai() { els(v).iter().map(str_py).collect() } else { vec![defaut.to_string()] }
    };

    let mut out = Vec::new();
    let (mut n_vias, mut n_change) = (0usize, 0usize);
    for v in doc.liste("vias") {
        let v = dict(v)?;
        let rang = |cle: &str| -> R<i64> {
            match v.get(cle) {
                Some(x) => Ok(int_py(x)?),
                None => Ok(-1),
            }
        };
        let (a, b) = (rang("layer_from")?, rang("layer_to")?);
        if a < 0 || b < 0 || a == b || a.max(b) >= couches.len() as i64 {
            continue;
        }
        let net = str_ou_vide(&v["net"]);
        if doc.classe(&net) == ANTENNE {
            continue;
        }
        n_vias += 1;
        let mut trans = obj! {"troncon" => -1i64, "couche_depart" => a, "couche_arrivee" => b,
                              "hauteur_empilage" => se::_hauteur_via(couches, &a.j(), &b.j())};
        let (h_via, d_percage, _) = se::_cotes_via(&obj! {"via" => v}, &mut trans);
        let (refs_a, refs_b) = (se::_plans_de_couche(couches, a), se::_plans_de_couche(couches, b));
        let (mut l_via, source) =
            se::_inductance_transition(&mut trans, v, couches, &[], &z_bornes, &refs, h_via, d_percage, Some(refs_a.clone()), Some(refs_b.clone()))?;
        let r = trans["retour"].clone();
        if !r["plan_change"].vrai() {
            continue; // même plan des deux côtés : le retour suit
        }
        n_change += 1;
        let classe = doc.classe(&net);
        let z0 = _z0(reg, &classe);
        let (x, y) = (flr(v, "x")? / unite, flr(v, "y")? / unite);
        let plans = format!("{} → {}", noms_de(ou(&r["nets_depart"], &r["plans_depart"]), "?").join("/"),
                            noms_de(ou(&r["nets_arrivee"], &r["plans_arrivee"]), "?").join("/"));
        let constat = |severite: &str, frequences: Vec<Json>, msg: String| {
            obj! {"regle" => "retour", "x" => x, "y" => y, "c" => format!("{} → {}", nom(a), nom(b)), "n" => &net,
                  "severite" => severite, "frequences" => frequences, "msg" => msg}
        };

        if r["plans_sans_cuivre"].vrai() {
            out.push(constat("critique", vec![], format!("Référence {plans} : pas de cuivre de plan au droit du via sur {}",
                                                          noms_de(&r["plans_sans_cuivre"], "").join(", "))));
            continue;
        }
        if nul(&r["nets_differents"]) {
            out.push(constat("vigilance", vec![], format!("Le plan de référence change ({plans}), mais le net des plans \
                                                            n'est pas connu : un via de masse suffit-il ?")));
            continue;
        }

        let (mut param, mut chemin, mut dist): (Option<tl::Traversee>, String, Option<f64>) = (None, String::new(), None);
        let mut cav = obj! {};
        let non_nul = |d: f64| if d != 0.0 { Some(d) } else { None };
        if r["nets_differents"].vrai() {
            // La cavité lit ses deux plans dans les tronçons qui encadrent le via ; hors
            // parcours, on les lui pose depuis l'empilage.
            let encadre: Vec<Json> = [&refs_a, &refs_b].iter().map(|s| {
                let mut o = obj! {};
                for (k, p) in ["plan_haut", "plan_bas"].iter().zip(s.iter()) {
                    poser(&mut o, k, p);
                }
                o
            }).collect();
            let mut t1 = trans.clone();
            poser(&mut t1, "troncon", 1i64);
            cav = se::_cavite_de_retour(&t1, v, couches, &encadre, d_percage).unwrap_or_else(|| obj! {});
            param = se::_param_cavite(&mut cav, 1.0)?;
            // `borne` : le pont est SUPPOSÉ au rayon, rien n'y a été trouvé ; le nommer
            // « traversée par un découplage » inventait un composant.
            if cav["pont"].vrai() && !cav["borne"].vrai() {
                let d = fl_ou(&cav["pont"]["distance_mm"], 0.0)?;
                dist = Some(d);
                let repere = &cav["pont"]["repere"];
                chemin = format!("traversée par {} à {d:.2} mm", if repere.vrai() { str_py(repere) } else { "un découplage".into() });
            } else if cav["cherche"].vrai() {
                // rien dans le rayon : le pont est AU MOINS aussi loin
                dist = non_nul(fl_ou(&cav["rayon_mm"], 0.0)?);
                chemin = format!("aucun découplage à moins de {} mm", cav.get("rayon_mm").map_or("?".into(), str_py));
                if cav["aucun_pont_carte"].vrai() {
                    // Rien nulle part : au front rapide le retour s'étale dans toute la
                    // paire de plans, la boucle se prend à son rayon.
                    // shortcut: rayon de l'aire envoyée (celle de la carte, majorée) ; les
                    // modes de la cavité si le chiffre doit tenir.
                    dist = non_nul(maxf(&[dist.unwrap_or(0.0), (fl_ou(&cav["aire_plans_mm2"], 0.0)? / PI).sqrt()]));
                    chemin = "aucun découplage entre ces plans sur toute la carte".into();
                }
            }
            if param.is_none() {
                out.push(constat("critique", vec![], format!(
                    "Référence {plans} : le retour doit traverser entre plans et rien ne permet de le chiffrer ({})",
                    if chemin.is_empty() { "ni pont ni aire de plans" } else { &chemin })));
                continue;
            }
        } else if source != "boucle" {
            // Aucun via de masse dans le rayon cherché : la boucle se referme au plus
            // proche, plus loin. Même formule que le moteur, avec ce via-là. Sans aucun via
            // de masse, rien ne se chiffre.
            let d = &v["retour_hors_rayon_mm"];
            if nul(d) {
                out.push(constat("critique", vec![], format!("Référence {plans} : aucun via de masse ne referme la boucle")));
                continue;
            }
            let d = fl(d)?;
            dist = Some(d);
            let (lo, hi) = (a.min(b) as usize, a.max(b) as usize);
            let (z1, z2) = (z_bornes[lo] * 1e-3, z_bornes[hi + 1] * 1e-3);
            let rayon = d_percage * 1e-3 / 2.0;
            l_via = tl::inductance_boucle_vias(&tl::Via { x: 0.0, y: 0.0, z1, z2, rayon }, &[tl::Via { x: d * 1e-3, y: 0.0, z1, z2, rayon }], 1e-6)?.0;
            chemin = format!("via de masse le plus proche à {d:.2} mm, hors du rayon cherché");
        } else {
            let mut proches = Vec::new();
            for f in els(&r["vias"]) {
                if f["retenu"].vrai() && !nul(&f["distance_mm"]) {
                    proches.push(nombre(&f["distance_mm"])?);
                }
            }
            dist = if proches.is_empty() { None } else { Some(minf(&proches)) };
            chemin = match dist {
                Some(d) => format!("{} via(s) de masse, le plus proche à {d:.2} mm", proches.len()),
                None => "vias de masse retenus".into(),
            };
        }

        // DEUX QUESTIONS, LE PIRE DES DEUX VERDICTS. La réflexion |Γ| dit ce que la ligne
        // voit ; elle reste faible sur une seule transition, même mal refermée. La DISTANCE
        // du retour dit la taille de la boucle, qui excite la cavité entre plans et
        // rayonne : on la compare à λ/20 au genou du front, dans le diélectrique entre les
        // plans (règle de couture classique), λ/10 pour condamner.
        let er = _er_entre(couches, a as usize, b as usize)?;
        // |Γ| à toutes les fréquences de `fs` d'un coup
        let gamma = |fs: &[f64]| -> Vec<f64> {
            let zt = tl::impedance_traversee_vec(fs, param.as_ref());
            fs.iter().zip(&zt).map(|(f, z)| {
                let zz = Complex64::new(0.0, 2.0 * PI * f * l_via) + z;
                zz.norm() / (zz + 2.0 * z0).norm()
            }).collect()
        };
        let premier_max_i = |v: &[f64]| (0..v.len()).fold(0, |m, k| if v[k] > v[m] { k } else { m });
        // LA CAVITÉ MODALE RÉSONNE SOUS LE GENOU, et un front contient toutes les fréquences
        // jusqu'à lui : P01x291 culmine à 142 MHz (335 Ω), qu'un front de 1 ns excite alors
        // que son genou, 350 MHz, passe à 1 %. On prend donc le pire sur les deux décades
        // sous le genou. Le modèle localisé garde son point unique : son pont supposé y
        // inventerait le pic.
        let modal = param.as_ref().is_some_and(|p| p.modal.is_some());
        let juge = |f_eval: f64, _tr: f64| -> R<Jugement> {
            let fs: Vec<f64> = if modal { (0..25).map(|k| f_eval * 10f64.powf(-(k as f64) / 12.0)).collect() } else { vec![f_eval] };
            let gs = gamma(&fs);
            let i = premier_max_i(&gs);
            let (g, f_g) = (gs[i], fs[i]);
            let mut verdicts = vec![_gamma(g)];
            let mut extra = obj! {};
            if modal {
                poser(&mut extra, "f_pire_hz", round0(f_g));
            }
            if let Some(d) = dist.filter(|d| *d != 0.0) {
                let l20 = C0 / (f_eval * er.sqrt()) / 20.0 * 1e3;
                poser(&mut extra, "d_sur_lambda20", round(d / l20, 3));
                verdicts.push(_ratio(d / l20));
            }
            Ok((g, _pire(verdicts), extra))
        };
        let freqs = _par_frequence(reg, &classe, Some(&net), juge)?;
        let sev = _pire(verdicts(&freqs));
        if sev == "ok" {
            continue;
        }
        // LE FRONT LE PLUS RAIDE QUE CE RETOUR SUPPORTE : le plus exigeant des deux
        // critères. Distance : λ/20 = d au genou. Réflexion (réactance pure seulement) :
        // |Γ| = 10 % pour X = 0,201 Z0.
        let mut limites = Vec::new();
        if let Some(d) = dist.filter(|d| *d != 0.0) {
            limites.push(0.35 * 20.0 * d * 1e-3 * er.sqrt() / C0);
        }
        if param.is_none() && l_via > 0.0 {
            limites.push(0.35 * 2.0 * PI * l_via / (0.201 * z0));
        }
        let mut resonance = String::new();
        if modal {
            // la plus basse fréquence où la traversée réfléchit trop : un front dont le
            // genou la dépasse l'excite ; de 100 kHz à 3 GHz, là où le modèle modal tient
            // ses modes
            let fs: Vec<f64> = (0..108).map(|k| 1e5 * 10f64.powf(k as f64 / 24.0)).collect();
            let gs = gamma(&fs);
            if let Some(k) = gs.iter().position(|g| *g > GAMMA_CRITIQUE) {
                limites.push(0.35 / fs[k]);
            }
            // le pic de la TRAVERSÉE seule, sans l'inductance du via qui monte avec la
            // fréquence et masquerait la résonance
            let zt: Vec<f64> = tl::impedance_traversee_vec(&fs, param.as_ref()).iter().map(|z| z.norm()).collect();
            let i = premier_max_i(&zt);
            if 0 < i && i < zt.len() - 1 && gs[i] > GAMMA_VIGILANCE {
                resonance = format!(" ; la traversée résonne à {} ({:.0} Ω, |Γ| {:.0} %)", _hz(fs[i]), zt[i], 100.0 * gs[i]);
            }
            // SUR UN ILOT, la resonance depend du chemin qui le relie a la cavite : on
            // donne la fourchette (du couplage parfait a aucun couplage)
            if cav["grille"]["via_sur_ilot"].vrai() {
                if let Some(fo) = se::traversee_fourchette(&mut cav)? {
                    let (fb, fh) = (nombre(&fo["f_bas"])?, nombre(&fo["f_haut"])?);
                    resonance += &format!(" ; sur un îlot du recouvrement, entre {} et {} selon son lien", _hz(minf(&[fb, fh])), _hz(maxf(&[fb, fh])));
                }
            }
        }
        // CE QUI A JUGÉ, ET QUOI FAIRE : le verdict tient au front supposé de la classe ; un
        // front réel plus lent que la limite l'annule.
        let f0 = &freqs[0];
        let hypothese = if f0["porteuse"].vrai() {
            format!("jugé à la porteuse {}", _hz(num(f0, "porteuse")))
        } else {
            format!("jugé au front de {} ns de la classe {classe}", fmt_g(num(f0, "tr") * 1e9, 2))
        };
        let tient = if limites.is_empty() {
            String::new()
        } else {
            format!(" ; sans risque si le front réel est plus lent que {} ns", fmt_g(maxf(&limites) * 1e9, 2))
        };
        let ref_a = noms_de(&r["nets_depart"], "la masse")[0].clone();
        let ref_b = noms_de(&r["nets_arrivee"], &ref_a)[0].clone();
        let remede = if r["nets_differents"].vrai() {
            format!(" Remède : un condensateur {ref_a}–{ref_b} près du via, ou une couche qui garde {ref_a}.")
        } else {
            format!(" Remède : un via de {ref_a} plus près de celui-ci.")
        };
        let msg = format!("Référence {plans}, {chemin}, L = {:.2} nH{resonance} ; {hypothese}{tient}.{remede}{}",
                          l_via * 1e9, _note_paire(doc, &net, x, y, unite)?);
        out.push(constat(sev, freqs, msg));
    }
    Ok((out, obj! {"vias" => n_vias, "plan_change" => n_change}))
}

/// Un via d'une paire différentielle dont le via jumeau est à côté : le retour différentiel
/// passe par le jumeau, seul le mode commun traverse les plans. Le verdict n'en tient pas
/// compte ; on le dit.
fn _note_paire(doc: &Doc, net: &str, x: f64, y: f64, unite: f64) -> R<String> {
    let mut jumeau = None;
    for pr in doc.liste("paires") {
        if dc_solver::pyth::len_py(pr)? != 2 {
            continue;
        }
        let (a, b) = (str_py(&pr[0]), str_py(&pr[1]));
        if net == a || net == b {
            jumeau = Some(if a == net { b } else { a });
            break;
        }
    }
    let Some(jumeau) = jumeau else { return Ok(String::new()) };
    let mut ds = Vec::new();
    for w in doc.liste("vias") {
        if str_ou_vide(&w["net"]) == jumeau {
            ds.push(hyp(flr(w, "x")? / unite - x, flr(w, "y")? / unite - y));
        }
    }
    // shortcut: 3 mm fixe pour « à côté » ; à régler sur l'écart des paires si besoin
    if ds.is_empty() || minf(&ds) > 3.0 {
        return Ok(String::new());
    }
    Ok(format!(" Paire différentielle : le retour différentiel passe par le via de {jumeau} à {:.2} mm, seul le mode commun \
                traverse les plans — verdict pessimiste.", minf(&ds)))
}
