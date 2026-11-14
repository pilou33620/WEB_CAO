//! Le calcul : la validation du document, l'assemblage nodal et les S generalises.

use crate::alg::*;
use crate::bobines::*;
use crate::couplage::*;
use crate::modeles::*;
use crate::surfaces::*;
use crate::touchstone::_interpoler;
use crate::{se, tl, ErreurRF, Res, FORMAT, FORMAT_RESULTAT, MASSE, MAX_BRANCHES, MAX_COMPOSANTS, VERSION};
use dc_solver::pyth::str_py;
use em::simulation_em::base::*;
use std::collections::{BTreeMap, HashMap};
use std::f64::consts::PI;
use std::sync::atomic::{AtomicBool, Ordering};

/// Des elements en SERIE COUPLES, en impedance : un courant inconnu par
/// element (des le rang `rang`), V_p - V_q = sum Z_ij I_j. Une impedance
/// propre nulle -- la force electromotrice qu'une self induit dans une
/// piste -- s'y pose sans perte de precision.
pub fn _poser_couples(y: &mut impl Pose, index: &Index, elements: &[(String, String)], zmat: &MatC, rang: usize) {
    for (e, (p, q)) in elements.iter().enumerate() {
        let ip = if p != MASSE { index.get(p).copied() } else { None };
        let iq = if q != MASSE { index.get(q).copied() } else { None };
        if let Some(ip) = ip {
            y.ajouter(ip, rang + e, c(1.0));
            y.ajouter(rang + e, ip, c(1.0));
        }
        if let Some(iq) = iq {
            y.ajouter(iq, rang + e, c(-1.0));
            y.ajouter(rang + e, iq, c(-1.0));
        }
        for j in 0..elements.len() {
            if zmat[e][j] != c(0.0) {
                y.ajouter(rang + e, rang + j, -zmat[e][j]);
            }
        }
    }
}

// ==========================================================================
// Le calcul
// ==========================================================================

/// str() d'un complexe de Python : « (-5+0j) », « 8j ».
fn _complexe_py(z: Complex64) -> String {
    let nombre = |x: f64| {
        let t = py::repr_flottant(x);
        t.strip_suffix(".0").map(String::from).unwrap_or(t)
    };
    let im = format!("{}j", nombre(z.im));
    if z.re == 0.0 && z.re.is_sign_positive() {
        return im;
    }
    format!("({}{}{})", nombre(z.re), if z.im.is_sign_negative() || z.im.is_nan() { "" } else { "+" }, im)
}

pub fn _valider(doc: &Json) -> Res<(Vec<Complex64>, Vec<(String, String)>)> {
    if doc.as_objet().is_none() || doc["format"].as_str() != Some(FORMAT) {
        return Err(ErreurRF::new(
            format!("Format inattendu : « {} » au lieu de « {} ».", if doc.as_objet().is_some() { str_py(&doc["format"]) } else { "absent".to_string() }, FORMAT), ""));
    }
    let ports = els(&doc["ports"]);
    if ports.len() != 2 {
        return Err(ErreurRF::new("Il faut exactement deux ports.", "Posez le port 1 (sortie de la puce) et le port 2 (connecteur ou antenne)."));
    }
    let (mut z, mut noeuds) = (Vec::new(), Vec::new());
    for (k, p) in ports.iter().enumerate() {
        let zz = &p["z"];
        let zc = if zz.vrai() { Complex64::new(nb(&zz[0]), if els(zz).len() > 1 { nb(&zz[1]) } else { 0.0 }) } else { Complex64::new(50.0, 0.0) };
        if !(zc.re > 0.0) {
            return Err(ErreurRF::new(format!("Port {} : la partie réelle de l'impédance doit être positive ({}).", k + 1, _complexe_py(zc)), ""));
        }
        let n = str_ou_vide(&p["noeud"]);
        if n.is_empty() || n == MASSE {
            return Err(ErreurRF::new(format!("Port {} posé sur la masse ou nulle part.", k + 1), ""));
        }
        let moins = if p["noeud_n"].vrai() { str_py(&p["noeud_n"]) } else { MASSE.to_string() };
        if moins == n {
            return Err(ErreurRF::new(format!("Port {} : ses deux bornes sont sur le même nœud.", k + 1), ""));
        }
        z.push(zc);
        noeuds.push((n, moins));
    }
    if noeuds[0].0 == noeuds[1].0 || (noeuds[0].0 == noeuds[1].1 && noeuds[0].1 == noeuds[1].0) {
        return Err(ErreurRF::new("Les deux ports sont sur le même nœud.", ""));
    }
    if els(&doc["branches"]).len() > MAX_BRANCHES {
        return Err(ErreurRF::new(format!("Trop de branches de piste (maximum {}).", MAX_BRANCHES), ""));
    }
    if els(&doc["composants"]).len() > MAX_COMPOSANTS {
        return Err(ErreurRF::new(format!("Trop de composants (maximum {}).", MAX_COMPOSANTS), ""));
    }
    Ok((z, noeuds))
}

// `x or defaut`
fn ou_json(x: &Json, defaut: Json) -> Json {
    if x.vrai() { x.clone() } else { defaut }
}

pub fn _doc_branche(doc: &Json, br: &Json) -> Json {
    obj! {"format" => "cao-sim-em-3", "source" => ou_json(&doc["source"], "rf".j()),
          "carte" => ou_json(&doc["carte"], "".j()), "net" => ou_json(&br["net"], "".j()),
          "stackup" => ou_json(&doc["stackup"], obj! {}),
          "geometry" => obj! {"objects" => ou_json(&br["objets"], Json::Liste(vec![]))},
          "vias" => ou_json(&br["vias"], Json::Liste(vec![])),
          "reference_nets" => ou_json(&doc["reference_nets"], Json::Liste(vec![])),
          "ports" => vec![obj! {"id" => 1i64, "impedance" => 50.0},
                          obj! {"id" => 2i64, "impedance" => 50.0}],
          "analyse" => ou_json(&doc["analyse"], obj! {})}
}

// une ErreurSimulation prise par un `except` : le refus reste un refus, l'exception interne
// une exception interne
fn _de_simulation(prefixe: &str, e: se::ErreurSimulation) -> ErreurRF {
    ErreurRF { message: format!("{}{}", prefixe, e.message), conseil: e.conseil, interne: e.interne }
}

enum Propre {
    Fentes(Vec<Json>),
    /// le rang du composant
    Self_(usize),
}

enum Geo {
    Piste(usize),
    /// le rang dans `bobines`
    Self_(usize),
}

/// Document « cao-sim-rf-1 » -> S generalises entre les deux ports.
pub fn analyser(doc: &Json, mut journal: Option<&mut dyn FnMut(&str)>) -> Res<Json> {
    let debut = std::time::Instant::now();
    let (z_ports, mut noeuds_ports) = _valider(doc)?;
    let mut doc_em = doc.clone();
    poser(&mut doc_em, "format", "cao-sim-em-3");
    poser(&mut doc_em, "geometry", obj! {"objects" => vec![obj! {"type" => "track"}]});
    let (couches, _, analyse) = se::doc_valide(&doc_em).map_err(|e| _de_simulation("", e))?;
    drop(doc_em);
    let freqs = se::frequences(&analyse);
    let fc = num(&analyse, "f_centre");
    let mut avert: Vec<Json> = els(&analyse["ajuste"]).to_vec();

    // -- les pistes, par le simulateur du depot --------------------------
    let mut cache = Cache::default();
    let reseau: Vec<Json> = els(&doc["branches"]).to_vec();
    // LES PISTES DES AUTRES NETS qui longent le reseau entrent dans ses lignes
    // couplees comme des conducteurs a part entiere, chacune fermee a ses deux
    // bouts sur sa propre impedance caracteristique : ce qui y passe s'en va,
    // et c'est compte comme perdu. Celles que rien ne couple sont laissees.
    let voisines: Vec<Json> = els(&doc["voisines"]).iter().take(MAX_BRANCHES).enumerate()
        .map(|(i, v)| obj! {"a" => format!("V:{i}:a"), "b" => format!("V:{i}:b"),
                            "net" => str_ou_vide(&v["net"]), "objets" => ou_json(&v["objets"], Json::Liste(vec![])),
                            "voisine" => true})
        .collect();
    let brutes: Vec<Json> = reseau.iter().chain(&voisines).cloned().collect();
    let couplage = doc.get("couplage").is_none_or(|v| v.vrai());
    let (sections, coupes) = if couplage { groupes_couples(&couches, &brutes, &mut cache) } else { (Vec::new(), HashMap::new()) };
    let suites = _decouper(&brutes, &coupes);
    let mut branches: Vec<(String, String, Vec<tl::Abcd>)> = Vec::new();
    let mut fiches: Vec<Json> = Vec::new();
    let mut blocs: Vec<(Vec<String>, Vec<MatC>)> = Vec::new();
    let mut terminaisons: Vec<(String, f64, String)> = Vec::new(); // (noeud, conductance, net) des voisines
    let mut bornes: HashMap<(usize, usize), (String, String, Json)> = HashMap::new(); // (section, rang) -> (debut, fin, morceau)
    // LES BRANCHES QUI RECOIVENT UN ELEMENT SERIE a leur depart : une fente du
    // plan sous elles, ou une self a moins de 3 mm qui y induit une tension.
    let est_self = |cp: &Json| str_ou_vide(&cp["genre"]).to_uppercase() == "L" && cp["geo"].vrai();
    let geos_l: Vec<&Json> = els(&doc["composants"]).iter().filter(|cp| est_self(cp)).map(|cp| &cp["geo"]).collect();

    let pres_d_une_self = |br: &Json| -> bool {
        for g in &geos_l {
            let cx = 0.5 * (nb(&g["x0"]) + nb(&g["x1"]));
            let cy = 0.5 * (nb(&g["y0"]) + nb(&g["y1"]));
            for o in els(&br["objets"]) {
                if ent(&o["layer"], -1) != ent(&g["couche"], -2) {
                    continue;
                }
                let ((ax, ay), (bx, by)) = _bouts(o);
                let l2 = (bx - ax) * (bx - ax) + (by - ay) * (by - ay);
                let u = if l2 > 0.0 { maxf(&[0.0, minf(&[1.0, ((cx - ax) * (bx - ax) + (cy - ay) * (by - ay)) / l2])]) } else { 0.0 };
                if py::hypot(ax + u * (bx - ax) - cx, ay + u * (by - ay) - cy) <= COUPLAGE_PISTE_MM {
                    return true;
                }
            }
        }
        false
    };
    let inserts: BTreeMap<usize, String> =
        reseau.iter().enumerate().filter(|(_, br)| br["fentes"].vrai() || pres_d_une_self(br)).map(|(k, _)| (k, format!("E:{k}"))).collect();
    for (k, (br, suite)) in brutes.iter().zip(&suites).enumerate() {
        let voisine = br["voisine"].vrai();
        if voisine {
            let objets = els(&br["objets"]);
            if !(0..objets.len()).any(|q| coupes.contains_key(&(k, q))) {
                continue;
            }
            let o0 = &objets[0];
            let Some(li) = _ligne(&couches, ent(&o0["layer"], 0), nb(&o0["width"]), _nombre(&o0["copper_thickness"], 0.035), &mut cache) else {
                continue;
            };
            terminaisons.push((str_py(&br["a"]), 1.0 / li.z0, str_py(&br["net"])));
            terminaisons.push((str_py(&br["b"]), 1.0 / li.z0, str_py(&br["net"])));
        }
        let (a, b) = (str_ou_vide(&br["a"]), str_ou_vide(&br["b"]));
        let nom = format!("{} ({} → {})", if br["net"].vrai() { str_py(&br["net"]) } else { format!("branche {}", k + 1) }, a, b);
        let (mut longueur, mut pertes_db, mut retard, mut vias, mut couplee) = (0.0, 0.0, 0.0, 0usize, 0.0);
        let depart = inserts.get(&k).cloned().unwrap_or_else(|| a.clone());
        let mut z0s: Vec<f64> = Vec::new();
        let mut secs: Vec<(Json, Json, Json)> = Vec::new();
        for (e, el) in suite.iter().enumerate() {
            let na = if e == 0 { depart.clone() } else { format!("K:{k}:{e}") };
            let nb_ = if e == suite.len() - 1 { b.clone() } else { format!("K:{k}:{}", e + 1) };
            let objets = match el {
                Element::Couple(sid, rang, p) => {
                    bornes.insert((*sid, *rang), (na, nb_, p.clone()));
                    longueur += num(p, "length");
                    couplee += num(p, "length");
                    continue;
                }
                Element::Chaine(objets) => objets,
            };
            let mut sous = br.clone();
            poser(&mut sous, "objets", objets.clone());
            poser(&mut sous, "vias", if e == 0 { br["vias"].clone() } else { Json::Liste(vec![]) });
            let r = se::simuler(&mut _doc_branche(doc, &sous), None, true, None).map_err(|e| _de_simulation(&format!("Piste {} : ", nom), e))?;
            if r.json["cascade_refusee"].vrai() || r.abcd.len() != freqs.len() {
                let quoi = if r.json["cascade_refusee"].vrai() { str_py(&r.json["cascade_refusee"]) } else { "cascade impossible.".to_string() };
                return Err(ErreurRF::new(format!("Piste {} : {}", nom, quoi), "La page doit découper le net en branches continues de pastille à pastille."));
            }
            branches.push((na, nb_, r.abcd));
            let lg = &r.json["ligne"];
            longueur += num(lg, "longueur") - py::sum(objets.iter().filter(|o| o["raccord"].vrai()).map(|o| num(o, "length")));
            pertes_db += num(lg, "pertes_db");
            retard += num(lg, "retard");
            vias += els(&r.json["discontinuites"]["transitions"]).len();
            z0s.push(num(lg, "z0_min"));
            z0s.push(num(lg, "z0_max"));
            for s in els(&r.json["segments"]) {
                if num(s, "z0") > 0.0 && num(s, "longueur") > 10.0 * RACCORD {
                    let t = (s["couche"].clone(), s["h"].clone(), s["er"].clone());
                    if !secs.contains(&t) {
                        secs.push(t);
                    }
                }
            }
            for w in els(&r.json["avertissements"]) {
                if !avert.contains(w) && !w.as_str().is_some_and(|t| se::AVERTISSEMENTS_MODELE.contains(&t)) && !voisine {
                    avert.push(w.clone());
                }
            }
        }
        if voisine {
            continue;
        }
        let mut fiche = obj! {"net" => ou_json(&br["net"], "".j()), "a" => &a, "b" => &b, "longueur" => round(longueur, 3),
                              "pertes_db" => round(pertes_db, 4), "retard" => retard, "vias" => vias, "couplee" => couplee};
        if br["fentes"].vrai() {
            poser(&mut fiche, "fentes", els(&br["fentes"]).iter()
                .map(|fe| obj! {"d1" => nb(&fe["d1"]), "d2" => nb(&fe["d2"]), "largeur_fente" => nb(&fe["g"]), "borne" => fe["borne"].vrai()})
                .collect::<Vec<Json>>());
        }
        // L'EMPILAGE RESOLU SE MONTRE : couche, hauteur au plan, permittivite.
        // C'est ce qui dit, sans aller relire l'empilage, si 114 ohms viennent
        // d'une piste trop fine ou d'un plan trop loin.
        let v = |x: &Json| x.as_f64().unwrap_or(0.0);
        secs.sort_by(|p, q| (v(&p.0), v(&p.1), v(&p.2)).partial_cmp(&(v(&q.0), v(&q.1), v(&q.2))).unwrap_or(std::cmp::Ordering::Equal));
        poser(&mut fiche, "sections", secs.iter().map(|(cc, h, er)| obj! {"couche" => se::_nom_de_couche(&couches, ent(cc, 0)), "h" => h, "er" => er}).collect::<Vec<Json>>());
        poser(&mut fiche, "z0_min", if z0s.is_empty() { Json::Nul } else { round(minf(&z0s), 3).j() });
        poser(&mut fiche, "z0_max", if z0s.is_empty() { Json::Nul } else { round(maxf(&z0s), 3).j() });
        fiches.push(fiche);
    }

    let mut fiches_couplage: Vec<Json> = Vec::new();
    let opts = se::options_modele(doc);
    for (sid, sec) in sections.iter().enumerate() {
        let n = sec.membres.len();
        let prises: Vec<&(String, String, Json)> = (0..n).map(|r| bornes.get(&(sid, r)).ok_or_else(|| ErreurRF::interne(format!("KeyError : ({sid}, {r})"))))
            .collect::<Res<_>>()?;
        // Les bornes de chaque membre rangees dans le sens de l'axe du groupe.
        let proches = prises.iter().zip(&sec.membres).map(|(p, m)| if m.sens { p.0.clone() } else { p.1.clone() });
        let loin = prises.iter().zip(&sec.membres).map(|(p, m)| if m.sens { p.1.clone() } else { p.0.clone() });
        let noeuds: Vec<String> = proches.chain(loin).collect();
        let objs: Vec<Json> = prises.iter().map(|p| p.2.clone()).collect();
        let yc = y_section(&couches, sec, &objs, &freqs, &mut cache, Some(&opts))?;
        let nets: Vec<Json> = sec.membres.iter().map(|m| ou_json(&brutes[m.obj.0]["net"], "".j())).collect();
        let Some((ys, fiche)) = yc else {
            return Err(ErreurRF::new(format!("Longement non calculable entre {}.", nets.iter().map(str_py).collect::<Vec<_>>().join(" et ")), ""));
        };
        blocs.push((noeuds, ys));
        let ecarts: Vec<f64> = (0..n.saturating_sub(1))
            .map(|i| (sec.membres[i + 1].lat - sec.membres[i].lat) - 0.5 * (nb(&prises[i].2["width"]) + nb(&prises[i + 1].2["width"])))
            .collect();
        fiches_couplage.push(obj! {
            "nets" => nets, "longueur" => round(sec.t2 - sec.t1, 3),
            "ecart" => round(minf(&ecarts), 4),
            "next_pct" => rnp(100.0 * fiche.kb, 3),
            "z0" => fiche.z0.iter().map(|z| round(*z, 2)).collect::<Vec<f64>>()});
    }

    // -- les pastilles -------------------------------------------------------
    let mut shunts: Vec<(String, f64)> = Vec::new();
    let mut fiches_surf: Vec<Json> = Vec::new();
    let mut fils: Vec<(String, String)> = Vec::new();
    for s in els(&doc["pastilles"]) {
        let (cap, _eps) = capacite_surface(&couches, s, &mut cache)?;
        if cap > 0.0 {
            shunts.push((str_py(&s["noeud"]), cap));
            // un flottant numpy en Python (le Z0 de `solve_line` en est un) : son arrondi
            fiches_surf.push(obj! {"noeud" => str_py(&s["noeud"]), "genre" => "pastilles", "c_pF" => rnp(cap * 1e12, 4)});
        }
    }

    // -- les zones, maillees --------------------------------------------------
    let f_fin = freqs[freqs.len() - 1];
    let mut maillages: Vec<(Vec<String>, Maillage)> = Vec::new(); // (noms des cellules, maillage)

    let mut mailler = |z: &Json, base: &str, quoi: &str, cache: &mut Cache, fils: &mut Vec<(String, String)>, fiches_surf: &mut Vec<Json>,
                       avert: &mut Vec<Json>|
     -> Res<()> {
        let nom = if z["net"].vrai() { str_py(&z["net"]) } else { base.to_string() };
        let Some(m) = maillage_zone(&couches, z, f_fin, cache)? else {
            return Err(ErreurRF::new(format!("La zone de cuivre « {} » n'a pas de plan en face : elle n'est pas calculable.", nom), ""));
        };
        for (noeud, q) in &m.acces {
            fils.push((noeud.clone(), format!("{base}#{q}")));
        }
        fiches_surf.push(obj! {"noeud" => base, "genre" => quoi,
                               "c_pF" => round(1e12 * somme_np(&m.c), 4),
                               "cellules" => m.c.len(),
                               "pas_min_mm" => round(m.pas_min, 4),
                               "pas_max_mm" => round(m.pas_max, 4)});
        if m.grossier {
            avert.push(format!("La zone « {} » dépasse {} cellules : son maillage a été desserré (pas de {:.2} à {:.2} mm).",
                               nom, MAX_CELLULES, m.pas_min, m.pas_max).j());
        }
        maillages.push(((0..m.c.len()).map(|q| format!("{base}#{q}")).collect(), m));
        Ok(())
    };

    for (zi, z) in els(&doc["zones"]).iter().enumerate() {
        let base = if z["noeud"].vrai() { str_py(&z["noeud"]) } else { format!("Z{zi}") };
        mailler(z, &base, "zones", &mut cache, &mut fils, &mut fiches_surf, &mut avert)?;
    }

    // -- les composants ---------------------------------------------------
    let mut modeles: Vec<Modele> = Vec::new(); // un par composant, dans l'ordre du document
    let mut composants: Vec<(Vec<String>, usize)> = Vec::new();
    let mut fiches_comp: Vec<Json> = Vec::new();
    let mut bobines: Vec<(usize, Bobine)> = Vec::new();
    for (ic, cp) in els(&doc["composants"]).iter().enumerate() {
        let ref_ = if cp["ref"].vrai() { str_py(&cp["ref"]) } else { "?".to_string() };
        let noeuds: Vec<String> = els(&cp["noeuds"]).iter().map(str_py).collect();
        let mut m = modele(&cp["modele"], &ref_)?;
        if m.n() != noeuds.len() {
            return Err(ErreurRF::new(format!("{} : le modèle « {} » a {} port(s), le composant {} broche(s) branchée(s).", ref_, m.nom(), m.n(), noeuds.len()), ""));
        }
        if let Modele::Snp(s) = &mut m {
            // les ports rapportes a une broche de la puce (ses vias), sinon a la masse
            s.reference = if cp["reference"].vrai() { str_py(&cp["reference"]) } else { MASSE.to_string() };
        }
        composants.push((noeuds.clone(), ic));
        let spec = &cp["modele"];
        let mut fiche = obj! {"ref" => &ref_, "type" => &spec["type"], "nom" => if spec["nom"].vrai() && !matches!(m, Modele::Ideal(_) | Modele::Z(_)) { spec["nom"].clone() } else { m.nom().j() },
                              "noeuds" => noeuds};
        if let Modele::Ideal(i) = &m {
            poser(&mut fiche, "genre", &spec["genre"]);
            poser(&mut fiche, "valeur", i.valeur);
        }
        if let Modele::Snp(s) = &m {
            poser(&mut fiche, "bande", vec![s.freqs[0], s.freqs[s.freqs.len() - 1]]);
        }
        // UNE SELF A DEUX BROCHES, modele en admittance, devient un solenoide.
        if est_self(cp) && m.n() == 2 && !matches!(m, Modele::Snp(_)) {
            let f_ref = minf(&[freqs[0], 1e8]);
            let y11 = m.y(f_ref)?[0][0];
            let l_h = if y11.norm() > 0.0 { inv(y11).im / (2.0 * PI * f_ref) } else { 0.0 };
            if l_h > 0.0 {
                if let Some(bob) = bobine(&couches, &cp["geo"], l_h, &mut cache) {
                    bobines.push((ic, bob));
                }
            }
        }
        fiches_comp.push(fiche);
        modeles.push(m);
    }

    // -- les vias de masse --------------------------------------------------
    let mut masses: Vec<(String, Vec<Complex64>)> = Vec::new();
    // (cle, coulee, pastilles, couche)
    let mut coulees: Vec<(String, Json, Vec<Json>, i64)> = Vec::new();
    for g in els(&doc["masses"]) {
        let noeud = str_py(&g["noeud"]);
        let ys = admittance_masse(&couches, g, &freqs, &mut cache)?;
        if ys.iter().any(|v| v.norm() > 0.0) {
            masses.push((noeud.clone(), ys));
        }
        let cl = &g["coulee"];
        if cl.vrai() {
            let cle = if cl["id"].vrai() { str_py(&cl["id"]) } else { noeud.clone() };
            let rang = coulees.iter().position(|co| co.0 == cle).unwrap_or_else(|| {
                coulees.push((cle.clone(), cl.clone(), Vec::new(), ent(&g["couche"], 0)));
                coulees.len() - 1
            });
            let centre: Vec<f64> = if cl["centre"].vrai() { els(&cl["centre"]).iter().map(nb).collect() } else { vec![0.0, 0.0] };
            if centre.len() != 2 {
                return Err(ErreurRF::interne("ValueError : le centre d'une coulée demande deux coordonnées"));
            }
            coulees[rang].2.push(obj! {"noeud" => &noeud, "x" => centre[0], "y" => centre[1]});
        }
    }
    // LA COULEE DE MASSE, ENTIERE, maillee une fois pour toutes les pastilles
    // qui s'y posent : elles s'y accrochent, et chacun de ses vias la descend
    // au plan.
    for (cle, cl, pads, couche) in &coulees {
        let vias_c = els(&cl["vias"]);
        let mut acces = pads.clone();
        acces.extend(vias_c.iter().enumerate().map(|(i, v)| obj! {"noeud" => format!("{cle}~v{i}"), "x" => nb(&v["x"]), "y" => nb(&v["y"])}));
        let mut z = cl.clone();
        poser(&mut z, "acces", acces);
        mailler(&z, &format!("C:{cle}"), "coulées", &mut cache, &mut fils, &mut fiches_surf, &mut avert)?;
        for (i, v) in vias_c.iter().enumerate() {
            let lv = inductance_masse(&couches, *couche, std::slice::from_ref(v))?;
            if lv > 0.0 {
                masses.push((format!("{cle}~v{i}"), freqs.iter().map(|f| inv(Complex64::new(0.0, 2.0 * PI * f * lv))).collect()));
            }
        }
    }
    drop(mailler);

    // -- les noeuds ---------------------------------------------------------
    // UN 0 OHM EST UN FIL, pas une grosse admittance : poser 1e9 S a cote de
    // 1/50 S coute six chiffres de precision a la resolution, et les jumpers
    // de 0 ohm sont justement l'ordinaire d'un reseau d'adaptation qu'on
    // garde ouvert au reglage. On fusionne leurs deux noeuds.
    let mut parent: HashMap<String, String> = HashMap::new();

    fn racine(parent: &HashMap<String, String>, n: &str) -> String {
        let mut n = n;
        while let Some(p) = parent.get(n).filter(|p| p.as_str() != n) {
            n = p;
        }
        n.to_string()
    }

    let unir = |parent: &mut HashMap<String, String>, a_: &str, b_: &str| {
        let (mut ra, mut rb) = (racine(parent, a_), racine(parent, b_));
        if ra != rb {
            // La masse reste la racine : c'est elle qu'on ne numerote pas.
            if ra == MASSE {
                std::mem::swap(&mut ra, &mut rb);
            }
            parent.insert(ra, rb);
        }
    };
    for (a_, b_) in &fils {
        // les acces aux zones
        unir(&mut parent, a_, b_);
    }
    let mut gardes = Vec::new();
    for (ns, ic) in composants {
        match &modeles[ic] {
            Modele::Ideal(m) if (m.genre == 'r' || m.genre == 'l') && m.valeur == 0.0 => unir(&mut parent, &ns[0], &ns[1]),
            _ => gardes.push((ns, ic)),
        }
    }
    let rac = |n: &String| racine(&parent, n);
    let composants: Vec<(Vec<String>, usize)> = gardes.into_iter().map(|(ns, ic)| (ns.iter().map(rac).collect(), ic)).collect();
    let branches: Vec<(String, String, Vec<tl::Abcd>)> = branches.into_iter().map(|(a, b, abcd)| (rac(&a), rac(&b), abcd)).collect();
    let blocs: Vec<(Vec<String>, Vec<MatC>)> = blocs.into_iter().map(|(ns, ys)| (ns.iter().map(rac).collect(), ys)).collect();
    let maillages: Vec<(Vec<String>, Maillage)> = maillages.into_iter().map(|(ns, m)| (ns.iter().map(rac).collect(), m)).collect();
    let shunts: Vec<(String, f64)> = shunts.into_iter().map(|(n, cap)| (rac(&n), cap)).collect();
    let noms_masses: Vec<String> = masses.iter().map(|(n, _)| n.clone()).collect(); // les noms, pour la fiche
    let masses: Vec<(String, Vec<Complex64>)> = masses.into_iter().map(|(n, ys)| (rac(&n), ys)).collect();
    for p in noeuds_ports.iter_mut() {
        *p = (rac(&p.0), rac(&p.1));
    }
    for (a, b) in &noeuds_ports {
        if a == b {
            return Err(ErreurRF::new(if b == MASSE { "Un port est court-circuité à la masse par un 0 Ω." } else { "Un port différentiel est court-circuité par un 0 Ω entre ses deux bornes." }, ""));
        }
    }

    let snp_de = |ic: usize| if let Modele::Snp(s) = &modeles[ic] { Some(s) } else { None };
    let mut noms: Vec<&String> = noeuds_ports.iter().flat_map(|(a, b)| [a, b]).collect();
    for (a, b, _) in &branches {
        noms.extend([a, b]);
    }
    noms.extend(composants.iter().flat_map(|(ns, _)| ns));
    noms.extend(blocs.iter().flat_map(|(ns, _)| ns));
    noms.extend(composants.iter().filter_map(|(_, ic)| snp_de(*ic)).map(|s| &s.reference));
    noms.extend(masses.iter().map(|(n, _)| n));
    noms.extend(shunts.iter().map(|(n, _)| n));
    noms.extend(maillages.iter().flat_map(|(ns, _)| ns));
    let mut index: Index = HashMap::new();
    for n in noms {
        if n != MASSE && !index.contains_key(n) {
            index.insert(n.clone(), index.len());
        }
    }
    // Les blocs Touchstone ajoutent leurs courants de broche aux inconnues :
    // ils se posent en S, sans passer par Y -- un « thru » parfait n'a pas de
    // matrice Y, et un composant mesure s'en approche souvent.
    let snp: Vec<(&Vec<String>, &ModeleSnp)> = composants.iter().filter_map(|(ns, ic)| snp_de(*ic).map(|s| (ns, s))).collect();
    let mut autres: Vec<(&Vec<String>, usize)> = composants.iter().filter(|(_, ic)| snp_de(*ic).is_none()).map(|(ns, ic)| (ns, *ic)).collect();

    // -- les elements series couples ------------------------------------------
    // Les departs de branche (fente, tension induite) et les selfs qui se
    // couplent : UNE matrice d'impedance, propres et mutuelles ensemble.
    let noeuds_de = |ic: usize| composants.iter().find(|(_, i)| *i == ic).map(|(ns, _)| ns);
    let (mut elements, mut propres, mut geos): (Vec<(String, String)>, Vec<Propre>, Vec<Geo>) = (Vec::new(), Vec::new(), Vec::new());
    for (k, e) in &inserts {
        elements.push((racine(&parent, &str_ou_vide(&reseau[*k]["a"])), e.clone()));
        propres.push(Propre::Fentes(els(&reseau[*k]["fentes"]).to_vec()));
        geos.push(Geo::Piste(*k));
    }
    for (ib, (ic, _)) in bobines.iter().enumerate() {
        if let Some(ns) = noeuds_de(*ic) {
            elements.push((ns[0].clone(), ns[1].clone()));
            propres.push(Propre::Self_(*ic));
            geos.push(Geo::Self_(ib));
        }
    }
    let ne = elements.len();
    let mut mutu: MatR = vec![vec![0.0; ne]; ne];
    let mut fiches_mut: Vec<Json> = Vec::new();
    for i in 0..ne {
        for j in i + 1..ne {
            let mm = match (&geos[i], &geos[j]) {
                (Geo::Piste(_), Geo::Piste(_)) => continue,
                (Geo::Self_(bi), Geo::Self_(bj)) => {
                    let (bi, bj) = (&bobines[*bi].1, &bobines[*bj].1);
                    let d: f64 = (0..3).map(|k| (bi.c[k] - bj.c[k]) * (bi.c[k] - bj.c[k])).sum();
                    if bi.couche != bj.couche || d.sqrt() * 1e3 > COUPLAGE_BOBINES_MM {
                        continue;
                    }
                    mutuelle_bobines(bi, bj)
                }
                (Geo::Self_(bi), Geo::Piste(k)) | (Geo::Piste(k), Geo::Self_(bi)) => {
                    let bi = &bobines[*bi].1;
                    segments_piste(&couches, els(&reseau[*k]["objets"]), bi, &mut cache).map_or(0.0, |seg| mutuelle_piste(bi, &seg))
                }
            };
            mutu[i][j] = mm;
            mutu[j][i] = mm;
        }
    }
    // Une self que rien ne couple reste posee en admittance.
    let garde: Vec<usize> = (0..ne).filter(|&e| !matches!(propres[e], Propre::Self_(_)) || mutu[e].iter().any(|m| m.abs() > 1e-15)).collect();
    let elements: Vec<(String, String)> = garde.iter().map(|&e| elements[e].clone()).collect();
    let mutu: MatR = garde.iter().map(|&i| garde.iter().map(|&j| mutu[i][j]).collect()).collect();
    let mut propres_gardes = Vec::new();
    for (e, p) in propres.into_iter().enumerate() {
        if garde.contains(&e) {
            propres_gardes.push(p);
        }
    }
    let propres = propres_gardes;
    let couplees: Vec<usize> = propres.iter().filter_map(|p| if let Propre::Self_(ic) = p { Some(*ic) } else { None }).collect();
    autres.retain(|(_, ic)| !couplees.contains(ic));
    let mut noms_el = Vec::new();
    for (e, (_, q_)) in elements.iter().enumerate() {
        noms_el.push(match &propres[e] {
            Propre::Self_(ic) => str_py(&fiches_comp[*ic]["ref"]),
            Propre::Fentes(_) => {
                let k: usize = q_.split(':').nth(1).and_then(|t| t.parse().ok()).unwrap_or(0);
                format!("piste {}", if reseau[k]["net"].vrai() { str_py(&reseau[k]["net"]) } else { q_.clone() })
            }
        });
    }
    let ne = elements.len();
    for i in 0..ne {
        for j in i + 1..ne {
            if mutu[i][j].abs() > 1e-15 {
                let mut li = Vec::new();
                for q in [i, j] {
                    if let Propre::Self_(ic) = &propres[q] {
                        li.push(inv(modeles[*ic].y(freqs[0])?[0][0]));
                    }
                }
                let mut fiche = obj! {"entre" => vec![noms_el[i].clone(), noms_el[j].clone()],
                                      "m_nH" => rnp(1e9 * mutu[i][j], 5)};
                if li.len() == 2 {
                    let (l1, l2) = (li[0].im / (2.0 * PI * freqs[0]), li[1].im / (2.0 * PI * freqs[0]));
                    if l1 > 0.0 && l2 > 0.0 {
                        poser(&mut fiche, "k", rnp(mutu[i][j] / (l1 * l2).sqrt(), 5));
                    }
                }
                fiches_mut.push(fiche);
            }
        }
    }

    let n_v = index.len();
    let n_snp: usize = snp.iter().map(|(_, m)| m.n).sum();
    let n_tot = n_v + n_snp + ne;
    let sondes: Vec<(String, usize, f64)> =
        terminaisons.iter().filter_map(|(n, g, net)| index.get(&racine(&parent, n)).map(|i| (net.clone(), *i, *g))).collect();
    let mut energie_voisines: Vec<Vec<(String, f64)>> = Vec::new();
    let idx_mailles: Vec<Vec<usize>> = maillages.iter()
        .map(|(ns, _)| ns.iter().map(|n| index.get(n).copied().ok_or_else(|| ErreurRF::interne(format!("KeyError : '{n}'")))).collect::<Res<_>>())
        .collect::<Res<_>>()?;

    // -- l'assemblage, frequence par frequence ------------------------------
    let (mut s_mats, mut s50, mut zin, mut zout) = (Vec::new(), Vec::new(), Vec::new(), Vec::new());
    let cinquante = [c(50.0), c(50.0)];
    let z_ports = [z_ports[0], z_ports[1]];
    for (k, &f) in freqs.iter().enumerate() {
        let omega = 2.0 * PI * f;
        let mut y = _Assemblage::new(n_tot);
        for (a, b, abcd) in &branches {
            let [[aa, bb], [cc, dd]] = abcd[k];
            let yq = vec![vec![div(dd, bb), div(bb * cc - aa * dd, bb)], vec![div(c(-1.0), bb), div(aa, bb)]];
            _poser_nports(&mut y, &index, &[a.clone(), b.clone()], &yq);
        }
        for (ns, ic) in &autres {
            _poser_nports(&mut y, &index, ns, &modeles[*ic].y(f)?);
        }
        for (ns, ys) in &blocs {
            _poser_nports(&mut y, &index, ns, &ys[k]);
        }
        for (n, cap) in &shunts {
            _poser(&mut y, &index, n, MASSE, Complex64::new(0.0, omega * cap));
        }
        for (q, (_, m)) in maillages.iter().enumerate() {
            y.maillage(&idx_mailles[q], m, omega, r_peau(f, m.ep));
        }
        for (n, ys) in &masses {
            if ys[k].norm() > 0.0 {
                _poser(&mut y, &index, n, MASSE, ys[k]);
            } else if index.contains_key(n) {
                return Err(ErreurRF::new("Une masse sans via doit arriver sur le nœud « 0 ».", ""));
            }
        }
        let mut rang = n_v;
        for (ns, m) in &snp {
            _poser_snp(&mut y, &index, ns, m, f, rang)?;
            rang += m.n;
        }
        for (n, g, _net) in &terminaisons {
            _poser(&mut y, &index, &racine(&parent, n), MASSE, c(*g));
        }
        if !elements.is_empty() {
            let mut zm: MatC = mutu.iter().map(|l| l.iter().map(|m| Complex64::new(0.0, omega * m)).collect()).collect();
            for (e, p) in propres.iter().enumerate() {
                zm[e][e] = match p {
                    Propre::Self_(ic) => inv(modeles[*ic].y(f)?[0][0]),
                    Propre::Fentes(v) => v.iter().fold(c(0.0), |s, fe| s + z_fente(&couches, fe, f)),
                };
            }
            _poser_couples(&mut y, &index, &elements, &zm, n_v + n_snp);
        }
        s_mats.push(_s_ports(&y, &index, &noeuds_ports, &z_ports, Some((&mut zin, &mut zout)), &sondes, Some(&mut energie_voisines))?);
        s50.push(_s_ports(&y, &index, &noeuds_ports, &cinquante, None, &[], None)?);
    }

    // -- le bilan a la frequence de travail ---------------------------------
    let k0 = (0..freqs.len()).fold(0, |m, k| if (freqs[k] - fc).abs() < (freqs[m] - fc).abs() { k } else { m });
    let s0 = s_mats[k0];
    let (t11, t21) = (s0[0][0].norm() * s0[0][0].norm(), s0[1][0].norm() * s0[1][0].norm());
    let desadapt = 1.0 - t11;
    let voisines_k0: &[(String, f64)] = energie_voisines.get(k0).map_or(&[], |v| v.as_slice());
    let bilan = obj! {
        "f" => freqs[k0],
        "s21_db" => round(_db(s0[1][0]), 3), "s11_db" => round(_db(s0[0][0]), 3),
        "s22_db" => round(_db(s0[1][1]), 3),
        "zin" => vec![zin[k0].re, zin[k0].im],
        "zout" => vec![zout[k0].re, zout[k0].im],
        // La perte d'insertion se partage en deux : ce qui repart vers la
        // puce (desadaptation) et ce que le reseau brule. Les confondre, c'est
        // chercher a retoucher une self quand c'est la piste qui chauffe.
        "perte_desadaptation_db" => round(-10.0 * maxf(&[desadapt, 1e-15]).log10(), 3),
        "perte_dissipee_db" => if desadapt > 1e-12 { round(-10.0 * maxf(&[t21 / desadapt, 1e-15]).log10(), 3).j() } else { Json::Nul },
        // L'impedance que la puce devrait voir : le conjugue de sa sortie.
        "zin_cible" => vec![z_ports[0].re, -z_ports[0].im],
        // Ce que les pistes des autres nets emportent, sur la puissance
        // disponible du port 1.
        "voisines_pct" => if energie_voisines.is_empty() { 0.0 } else { rnp(100.0 * voisines_k0.iter().fold(0.0, |s, (_, v)| s + v), 4) },
    };
    let mut fiches_voisines: Vec<Json> = voisines_k0.iter().map(|(net, v)| obj! {"net" => net, "pct" => rnp(100.0 * v, 4)}).collect();
    fiches_voisines.sort_by(|a, b| (-num(a, "pct")).partial_cmp(&-num(b, "pct")).unwrap_or(std::cmp::Ordering::Equal));
    if fiches_mut.iter().any(|fm| els(&fm["entre"]).iter().map(str_py).collect::<Vec<_>>().join(" ").contains("piste")) {
        avert.push("Couplage self → piste : le sens d'enroulement des selfs \
                    n'est pas sur le dessin, il est pris droit. Il fixe le \
                    signe de la mutuelle avec une piste (pas entre deux \
                    selfs de la même série).".j());
    }
    for br in &reseau {
        for fe in els(&br["fentes"]) {
            if fe["borne"].vrai() {
                avert.push(format!("Net {} : le plan de référence est coupé de bord à bord sous la piste ; le retour y passe par les \
                                    condensateurs ou les coutures, que ce calcul ne voit pas. Le détour est plafonné à {} mm.",
                                   if br["net"].vrai() { str_py(&br["net"]) } else { "?".to_string() },
                                   fmt_g(dc_solver::pyth::max_py(nb(&fe["d1"]), nb(&fe["d2"])), 6)).j());
            }
        }
    }

    let validite = domaine_validite(&couches, doc, &mut cache, f_fin);
    if num(&validite, "f_max") < f_fin {
        let lim = &validite["limites"][0];
        avert.push(format!(
            "HORS DU DOMAINE QUASI-STATIQUE au-delà de {} GHz : {} ({}{}). \
             Ce simulateur ne voit ni les modes supérieurs, ni les ondes de \
             surface, ni le rayonnement ; au-dessus de cette fréquence, les \
             résultats ne valent plus qu'une tendance.",
            fmt_g(num(lim, "f") / 1e9, 3), str_py(&lim["cause"]), str_py(&lim["detail"]),
            if lim["net"].vrai() { format!(", {}", str_py(&lim["net"])) } else { String::new() }).j());
    }

    let duree = debut.elapsed().as_secs_f64();
    if let Some(journal) = journal.as_mut() {
        journal(&format!("  simulation RF : {} branche(s), {} composant(s), S21 {:.2} dB à {} GHz, {:.1} s\n",
                         branches.len(), composants.len(), num(&bilan, "s21_db"), fmt_g(fc / 1e9, 4), duree));
    }

    let carte = ou_json(&doc["carte"], "".j());
    let entete = vec!["Genere par WEB_CAO -- simulation RF (python/rf_reseau.py)".to_string(),
                      format!("Carte : {}", if doc["carte"].vrai() { str_py(&doc["carte"]) } else { "-".to_string() }),
                      format!("RENORMALISE A 50 OHM. Le calcul a ete fait entre Z1 = {} et Z2 = {} ohm.", _cplx_txt(z_ports[0]), _cplx_txt(z_ports[1]))];
    let paires = |l: &[Complex64]| l.iter().map(|z| vec![z.re, z.im]).collect::<Vec<_>>();
    Ok(obj! {
        "format" => FORMAT_RESULTAT, "version" => VERSION,
        "carte" => carte,
        "ports" => noeuds_ports.iter().zip(&z_ports).map(|((a, b), z)| {
            let mut p = obj! {"noeud" => a, "z" => vec![z.re, z.im]};
            if b != MASSE {
                poser(&mut p, "noeud_n", b);
            }
            p
        }).collect::<Vec<Json>>(),
        "f_centre" => &analyse["f_centre"],
        "freqs" => freqs.clone(),
        "s" => s_mats.iter().map(|m| paires(&[m[0][0], m[0][1], m[1][0], m[1][1]])).collect::<Vec<_>>(),
        "zin" => paires(&zin),
        "zout" => paires(&zout),
        "bilan" => bilan,
        "branches" => fiches,
        "composants" => fiches_comp,
        "masses" => noms_masses.iter().zip(&masses).map(|(nom, (_, ys))| obj! {"noeud" => nom, "l_nH" => rnp(1e9 * inv(ys[k0]).im / (2.0 * PI * freqs[k0]), 4)}).collect::<Vec<Json>>(),
        "couplages" => fiches_couplage,
        "voisines" => fiches_voisines,
        "mutuelles" => fiches_mut,
        "validite" => validite,
        "surfaces" => fiches_surf,
        "touchstone" => se::touchstone(&freqs, &s50, 50.0, &entete),
        "duree" => round(duree, 3),
        "avertissements" => avert,
    })
}

/// Un bloc S a N ports, courants de broche en inconnues des le rang `rang`.
///
/// Ondes de puissance sur les references reelles z0 du fichier :
/// (V - z0 I)/rac(z0) = S (V + z0 I)/rac(z0), I entrant dans le composant.
/// V est pris par rapport a `m.reference` (la broche de masse de la puce),
/// ou le courant de chaque port revient.
pub fn _poser_snp(y: &mut impl Pose, index: &Index, noeuds: &[String], m: &ModeleSnp, f: f64, rang: usize) -> Res<()> {
    let s = _interpoler(&m.freqs, &m.s, f, &m.nom)?;
    let rz: Vec<f64> = m.z0.iter().map(|z| z.sqrt()).collect();
    let de = |n: &str| if n != MASSE { index.get(n).copied() } else { None };
    let ir = de(&m.reference);
    for (k, n) in noeuds.iter().enumerate() {
        if let Some(i) = de(n) {
            y.ajouter(i, rang + k, c(1.0)); // le courant quitte le noeud
        }
        if let Some(ir) = ir {
            y.ajouter(ir, rang + k, c(-1.0)); // et revient par la reference
        }
        for (j, nj) in noeuds.iter().enumerate() {
            let d = if j == k { 1.0 } else { 0.0 };
            let a = c(d / rz[k]) - s[k][j] / rz[j];
            if let Some(ij) = de(nj) {
                y.ajouter(rang + k, ij, a);
            }
            if let Some(ir) = ir {
                y.ajouter(rang + k, ir, -a);
            }
            y.ajouter(rang + k, rang + j, c(-d * rz[k]) - s[k][j] * rz[j]);
        }
    }
    Ok(())
}

/// Au-dela de 400 inconnues la resolution passe en creux. Le banc le coupe pour comparer au
/// calcul plein (`rf._SPARSE = None` en Python).
pub static _SPARSE: AtomicBool = AtomicBool::new(true);

/// La matrice nodale, creuse. On n'y fait que des `y[i, j] += v` (c'est
/// tout ce que les poses emploient) : l'element lu vaut 0, l'ecrit s'empile
/// en triplets. Les maillages de zone s'y posent en bloc.
pub struct _Assemblage {
    pub n: usize,
    triplets: Vec<(usize, usize, Complex64)>,
    blocs: Vec<(usize, usize, Complex64)>,
}

impl Pose for _Assemblage {
    fn ajouter(&mut self, i: usize, j: usize, v: Complex64) {
        self.triplets.push((i, j, v));
    }
}

impl _Assemblage {
    pub fn new(n: usize) -> Self {
        _Assemblage { n, triplets: Vec::new(), blocs: Vec::new() }
    }

    pub fn maillage(&mut self, idx: &[usize], m: &Maillage, omega: f64, r_carre: f64) {
        let v: Vec<Complex64> = (0..m.ia.len()).map(|q| inv(Complex64::new(r_carre * m.r_lien[q], omega * m.l_lien[q]))).collect();
        let (a, b): (Vec<usize>, Vec<usize>) = (m.ia.iter().map(|i| idx[*i]).collect(), m.ib.iter().map(|i| idx[*i]).collect());
        for (li, co, signe) in [(&a, &a, 1.0), (&b, &b, 1.0), (&a, &b, -1.0), (&b, &a, -1.0)] {
            self.blocs.extend((0..v.len()).map(|q| (li[q], co[q], v[q] * signe)));
        }
        self.blocs.extend(idx.iter().zip(&m.c).map(|(i, cap)| (*i, *i, Complex64::new(0.0, omega * cap))));
    }

    /// Les triplets de la matrice, ceux de `diag` a la suite, et s'il faut la resoudre en creux.
    pub fn matrice(&self, diag: &[((usize, usize), Complex64)]) -> (Vec<(usize, usize, Complex64)>, bool) {
        let t = self.triplets.iter().chain(&self.blocs).copied().chain(diag.iter().map(|((i, j), v)| (*i, *j, *v))).collect();
        (t, self.n > 400 && _SPARSE.load(Ordering::Relaxed))
    }
}

pub fn _resoudre(n: usize, triplets: &[(usize, usize, Complex64)], creuse: bool, rhs: &MatC) -> Res<MatC> {
    let x = if creuse {
        resoudre_creux(n, triplets, rhs)
    } else {
        let mut m = zeros(n, n);
        for &(i, j, v) in triplets {
            m[i][j] += v;
        }
        resoudre(&m, rhs)
    };
    x.ok_or_else(|| ErreurRF::new("Réseau singulier : un nœud du chemin RF est en l'air ou isolé.", "Vérifiez que chaque pastille est reliée."))
}

/// S generalises par deux resolutions, chaque port ferme sur sa reference.
///
/// On attaque un port par une force electromotrice de 1 V derriere Zk (son
/// equivalent de Norton), l'autre etant ferme sur la sienne :
///     a_j = 1 / (2 rac(Rj)),  b_i = (V_i - Zi* I_i) / (2 rac(Ri))
/// ce qui ne demande jamais d'inverser la matrice Y du reseau -- donc marche
/// aussi sur un fil ou un bloc S sans matrice Y. Les deux attaques partagent
/// UNE factorisation. Un port est une paire (noeud +, noeud -), la masse
/// valant 0 V : un port differentiel pose sa reference entre ses deux bornes
/// et y injecte +I / -I, sa tension est V+ - V-.
pub fn _s_ports(y: &_Assemblage, index: &Index, ports: &[(String, String)], z: &[Complex64; 2],
                mut impedances: Option<(&mut Vec<Complex64>, &mut Vec<Complex64>)>, sondes: &[(String, usize, f64)],
                energie: Option<&mut Vec<Vec<(String, f64)>>>) -> Res<[[Complex64; 2]; 2]> {
    let ip: Vec<(Option<usize>, Option<usize>)> = ports.iter().map(|(a, b)| (index.get(a).copied(), index.get(b).copied())).collect();
    let mut diag: Vec<((usize, usize), Complex64)> = Vec::new();
    for (&(a, b), zk) in ip.iter().zip(z) {
        for (r, co, sg) in [(a, a, 1.0), (b, b, 1.0), (a, b, -1.0), (b, a, -1.0)] {
            if let (Some(r), Some(co)) = (r, co) {
                let v = div(c(sg), *zk);
                match diag.iter_mut().find(|(cle, _)| *cle == (r, co)) {
                    Some((_, d)) => *d += v,
                    None => diag.push(((r, co), v)),
                }
            }
        }
    }
    let (m, creuse) = y.matrice(&diag);
    let mut rhs = zeros(y.n, 2);
    for j in 0..2 {
        let (a, b) = ip[j];
        if let Some(a) = a {
            rhs[a][j] += inv(z[j]);
        }
        if let Some(b) = b {
            rhs[b][j] -= inv(z[j]);
        }
    }

    let vv = _resoudre(y.n, &m, creuse, &rhs)?;
    let tension = |j: usize, k: usize| {
        let (a, b) = ip[k];
        a.map_or(c(0.0), |a| vv[a][j]) - b.map_or(c(0.0), |b| vv[b][j])
    };
    let mut s = [[c(0.0); 2]; 2];
    let mut energie = energie;
    for j in 0..2 {
        for i in 0..2 {
            let vi = tension(j, i);
            let courant = div(if i == j { c(1.0) - vi } else { -vi }, z[i]);
            let b = (vi - z[i].conj() * courant) / (2.0 * z[i].re.sqrt());
            s[i][j] = b * 2.0 * z[j].re.sqrt();
        }
        // LA PUISSANCE PARTIE DANS LES VOISINES, rapportee a la puissance
        // disponible du port 1 : 4 R1 sum G |V|^2 (1 V de force
        // electromotrice derriere Z1).
        if j == 0 {
            if let Some(energie) = energie.as_mut() {
                let mut par: Vec<(String, f64)> = Vec::new();
                for (net, i_n, g) in sondes {
                    let module = vv[*i_n][j].norm();
                    let v = 4.0 * z[0].re * g * (module * module);
                    match par.iter_mut().find(|(n, _)| n == net) {
                        Some((_, p)) => *p += v,
                        None => par.push((net.clone(), 0.0 + v)),
                    }
                }
                energie.push(par);
            }
        }
        if let Some((zin, zout)) = impedances.as_mut() {
            let vj = tension(j, j);
            let courant = div(c(1.0) - vj, z[j]);
            let zz = if courant.norm() > 1e-300 { div(vj, courant) } else { c(f64::INFINITY) };
            if j == 0 { zin.push(zz) } else { zout.push(zz) }
        }
    }
    Ok(s)
}

pub fn _cplx_txt(z: Complex64) -> String {
    format!("{}{}{}j", fmt_g(z.re, 6), if z.im.is_sign_negative() { "" } else { "+" }, fmt_g(z.im, 6))
}

/// Un N-ports reference a la masse, broche k sur noeuds[k].
pub fn _poser_nports(y: &mut impl Pose, index: &Index, noeuds: &[String], yq: &MatC) {
    let ids: Vec<Option<usize>> = noeuds.iter().map(|n| if n != MASSE { index.get(n).copied() } else { None }).collect();
    for (i, a) in ids.iter().enumerate() {
        let Some(a) = a else { continue };
        for (j, b) in ids.iter().enumerate() {
            if let Some(b) = b {
                y.ajouter(*a, *b, yq[i][j]);
            }
        }
    }
}
