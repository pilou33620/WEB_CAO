// ==========================================================================
// LA CARTE DE CHALEUR DU COUPLAGE
// --------------------------------------------------------------------------
// CE QU'ELLE REPOND, ET POURQUOI LA FICHE NE SUFFISAIT PAS. La fiche chiffre
// UN longement : « SW_2 prend 4,1 % sur 3,0 mm a 0,21 mm ». C'est un nombre
// pour toute la longueur, obtenu sur UNE section dont l'ecart est la MOYENNE de
// ce qui longe. Or ce n'est jamais uniforme : trois millimetres a 0,8 mm et un
// demi-millimetre a 0,12 mm donnent la meme moyenne qu'un longement regulier,
// et ce n'est pas du tout la meme carte. La question qu'on se pose devant le
// routage n'est pas « combien », c'est « OU faut-il ecarter ».
//
// COMMENT ON LA CONSTRUIT, ET CE QU'ELLE VAUT :
//
//   · LE TOTAL VIENT DE LA SECTION COMPLETE, celle a N conducteurs deja
//     resolue pour la fiche. C'est le chiffre juste, et la carte ne le change
//     pas : la somme de ce qu'elle etale sur les troncons vaut EXACTEMENT le
//     bruit de la fiche. Une carte qui ne totalise pas ce que la fiche annonce
//     ferait douter des deux ;
//   · LA REPARTITION vient d'une section a DEUX conducteurs resolue a l'ecart
//     LOCAL de chaque troncon -- meme empilage, meme masse coplanaire, meme
//     solveur. Le poids d'un troncon est |k_arriere| local fois sa longueur de
//     longement : c'est le couplage par unite de longueur, et c'est ce qui
//     distingue le demi-millimetre serre des trois millimetres laches.
//
// CE QU'ELLE NE DIT PAS. Le NEXT SATURE : passe la longueur de saturation, en
// rajouter ne l'augmente plus. La carte etale donc un total sature sur les
// troncons qui l'ont construit -- elle montre OU LE COUPLAGE SE FAIT, et non
// une tension mesurable troncon par troncon. C'est ce qu'on veut savoir pour
// ecarter une piste, et c'est dit dans les hypotheses.
//
// ET LA Z DIFFERENTIELLE, sur la meme mecanique et sans rien de plus : la
// section locale a deux conducteurs rend ses modes pair et impair, donc une
// Z_diff PAR TRONCON. C'est la reponse a « ma paire est-elle a 100 ohms sur
// TOUTE sa longueur ? », a laquelle un chiffre unique ne repondait pas.
// ==========================================================================

use super::base::*;
use super::scenes::_ecarts_masse_du_groupe;
use super::section::{geometrie, section_de_couche};
use super::topologie::_couture_max;
use std::collections::HashMap;

pub const MAX_SECTIONS_LOCALES: usize = 24; // resolutions de section locales par calcul
pub const PAS_ECART_LOCAL: f64 = 0.005; // mm ; le pas auquel les ecarts se regroupent

/// Le cache des sections locales, commun a toutes les scenes d'un calcul.
pub type CacheLocal = HashMap<String, Json>;

/// La hauteur au plan de reference d'une couche, en mm ; 0 si elle n'en a
/// pas.
///
/// Les deux ecarts coplanaires ne la changent pas -- elle ne depend que de
/// l'empilage --, on les passe donc a zero. C'est `_poser_section` qui en a
/// besoin, AVANT de savoir quels conducteurs il posera : sans elle, il ne peut
/// pas prevoir de combien le cuivre epais va les elargir.
///
/// `plans_ignores` SUIT `section_de_couche`, et il doit le suivre : la hauteur
/// et la section doivent designer LE MEME plan. Les donner a lire a deux plans
/// differents ferait poser les conducteurs a une hauteur, et les resoudre a
/// une autre.
///
/// `sans_plan` SUIT AUSSI `section_de_couche` : la hauteur rendue est alors
/// l'epaisseur de la plaque, ce qui sert a l'elargissement du cuivre epais.
///
/// `ecart` rend a la place l'ecart b entre plans d'une triplaque (0 sinon) :
/// son cuivre epais s'elargit selon b, pas selon la hauteur.
pub fn _hauteur_de_couche(couches: &[Json], indice: i64, largeur: f64, epaisseur: f64, plans_ignores: &[String], sans_plan: bool, ecart: bool) -> f64 {
    let (geo, info) = section_de_couche(couches, indice, largeur, epaisseur, 0.0, Some(0.0),
                                        plans_ignores, sans_plan);
    // `section_de_couche` decrit une section en METRES, et son `h` aussi :
    // c'est le seul chiffre de cette page qui ne soit pas en millimetres, et le
    // melanger a des largeurs en millimetres donne un logarithme negatif, donc
    // un elargissement de Wheeler NEGATIF -- une correction qui retrecit.
    let cle = if ecart { "b" } else { "h" };
    if geo.is_some() { 1e3 * _nombre(&info[cle], 0.0) } else { 0.0 }
}

/// La section a DEUX conducteurs d'un longement, a son ecart LOCAL.
///
/// Meme empilage et meme masse coplanaire que la section complete ; seuls la
/// voisine et son ecart changent. Rend un dictionnaire de coefficients, ou
/// None quand le plafond de resolutions est atteint -- l'appelant retombe
/// alors sur la section moyenne, ce qui rend la carte plate mais jamais
/// fausse.
///
/// LE CACHE EST LA POUR CA : une piste de cinquante troncons qui longe sa
/// voisine a ecart constant ne coute qu'une resolution, et le pas de cinq
/// microns fait que deux ecarts que le cuivre ne distingue pas n'en coutent
/// pas deux.
#[allow(clippy::too_many_arguments)]
pub fn _section_locale(couches: &[Json], scene: &Json, w_v: f64, w_a: f64, ecart: f64, cote: i64, t_r: f64, cache: &mut CacheLocal) -> Option<Json> {
    let q = (ecart / PAS_ECART_LOCAL).round_ties_even() * PAS_ECART_LOCAL;
    // `cote` vaut +1 a gauche du sens de parcours, et `_scenes_paralleles` pose
    // alors la voisine en x NEGATIF : on garde la meme convention, sans quoi la
    // carte lirait l'ecart au plan du mauvais cote.
    let x_a = (if cote >= 0 { -1.0 } else { 1.0 }) * ((w_v + w_a) / 2.0 + q);
    let poses = [obj! {"x" => 0.0, "w" => w_v}, obj! {"x" => x_a, "w" => w_a}];
    // LES DEUX ECARTS AU PLAN SE CALCULENT AVANT LA CLEF, et ils y entrent :
    // ils dependent des ecarts mesures de la scene ET de sa couture, dont ni
    // l'un ni l'autre n'est dans la geometrie locale. Deux scenes de meme
    // largeur et de meme ecart mais bordees differemment se seraient partage
    // la meme entree de cache -- le cache est commun a toutes les scenes.
    let (e_g, e_d) = _ecarts_masse_du_groupe(
        &poses, &obj! {"largeur" => w_v, "gap_g" => &scene["gap_g"],
                       "gap_d" => &scene["gap_d"],
                       "couture_g" => num(scene, "couture_g"),
                       "couture_d" => num(scene, "couture_d")},
        _couture_max(t_r));
    let couche = scene["couche"].as_f64().unwrap_or(0.0) as i64;
    let ep = num(scene, "epaisseur");
    let cle = format!("{:?}", (couche, round(ep, 6) + 0.0, round(w_v, 4) + 0.0,
                               round(w_a, 4) + 0.0, round(q, 4) + 0.0, if cote >= 0 { 1 } else { -1 },
                               round(e_g, 4) + 0.0, round(e_d, 4) + 0.0));
    if let Some(v) = cache.get(&cle) {
        return Some(v.clone());
    }
    if cache.len() >= MAX_SECTIONS_LOCALES {
        return None;
    }

    let (geo, info) = section_de_couche(couches, couche, w_v, ep, e_g, Some(e_d), &[], false);
    let Some(mut geo) = geo else {
        let v = obj! {"raison" => info};
        cache.insert(cle, v.clone());
        return Some(v);
    };
    poser(&mut geo, "conducteurs", poses.iter().map(|p| obj! {"w" => num(p, "w") * 1e-3, "x" => num(p, "x") * 1e-3,
                                                              "masse" => false}).collect::<Vec<Json>>());
    let r = match ligne_mom::solve_multiline(&geometrie(&geo)) {
        Ok(r) => r,
        Err(exc) => {
            let v = obj! {"raison" => exc.0};
            cache.insert(cle, v.clone());
            return Some(v);
        }
    };
    let rang = |entree: usize| r.ordre.iter().position(|&e| e == entree);
    let non_nul = |x: Option<f64>| x.filter(|v| *v != 0.0);
    let p = r.paire.as_ref();
    let v = obj! {
        "raison" => "",
        "z_diff" => non_nul(p.map(|p| p.z_diff)),
        "z_commune" => non_nul(p.map(|p| p.z_commune)),
        "eps_eff_impair" => non_nul(p.map(|p| p.eps_eff_impair)),
        "eps_eff_pair" => non_nul(p.map(|p| p.eps_eff_pair)),
        "z0" => r.lignes[rang(0).unwrap_or(0)].z0,
        "ecart" => q,
        // LES MATRICES [L] ET [C] DE LA PAIRE, rangees (selection, voisine)
        // -- et non de gauche a droite comme le solveur les rend. C'est ce
        // que la cascade a quatre acces lit pour une paire DISSYMETRIQUE
        // (5.1.0) : les modes pair et impair n'en sont plus les modes propres.
        "matrices" => _matrices_rangees(&r, rang(0), rang(1)),
    };
    cache.insert(cle, v.clone());
    Some(v)
}

/// {"l", "c"} 2 x 2 (H/m, F/m) d'une section a deux conducteurs, dans
/// l'ordre des ENTREES : la selection d'abord, la voisine ensuite.
pub fn _matrices_rangees(r: &ligne_mom::Multiligne, ip: Option<usize>, i_n: Option<usize>) -> Json {
    let (Some(ip), Some(i_n)) = (ip, i_n) else { return Json::Nul };
    let idx = [ip, i_n];
    let range = |m: &[Vec<f64>]| idx.iter().map(|&a| idx.iter().map(|&b| m[a][b]).collect::<Vec<f64>>()).collect::<Vec<_>>();
    obj! {"l" => range(&r.l), "c" => range(&r.c)}
}

/// Une entree de `_grouper_parts` : ((rang, net), {l, ecart, w_v, w_a, cote, net, rang}).
pub type Parts = Vec<((i64, String), Json)>;

/// La section a deux conducteurs de chaque (troncon, voisine), a son ecart
/// LOCAL.
///
/// POURQUOI TRONCON PAR TRONCON, ET NON UNE FOIS POUR TOUT LE LONGEMENT. Un
/// chiffre unique est obtenu sur l'ecart MOYEN, et trois millimetres a 0,8 mm
/// suivis d'un demi-millimetre a 0,12 mm ont la meme moyenne qu'un longement
/// regulier -- alors que ce n'est pas du tout la meme paire. La Z
/// differentielle par troncon repond a « ma paire est-elle a 100 ohms sur
/// TOUTE sa longueur ? », a laquelle le chiffre du tableau ne repond pas.
///
/// Rend {(rang, net) : {"net", "ecart", "longueur", "loc"}} ; `loc` vaut {}
/// quand le plafond de resolutions locales est atteint -- la carte devient
/// alors muette sur la fin, elle ne devient jamais fausse.
pub fn _sections_locales(parts: &Parts, couches: &[Json], scene: &Json, t_r: f64, cache: &mut CacheLocal) -> Parts {
    parts.iter().map(|(rang, e)| {
        let loc = _section_locale(couches, scene, num(e, "w_v"), num(e, "w_a"), num(e, "ecart"),
                                  e["cote"].as_i64().unwrap_or(0), t_r, cache);
        (rang.clone(), obj! {"net" => &e["net"], "ecart" => &e["ecart"],
                             "longueur" => &e["l"], "loc" => loc.filter(Json::vrai).unwrap_or_else(|| obj! {}),
                             "w_v" => &e["w_v"], "w_a" => &e["w_a"]})
    }).collect()
}

/// Les longements d'une scene, rassembles par (rang de troncon, voisine).
///
/// Un meme troncon peut longer plusieurs bouts de la meme voisine : on cumule
/// les longueurs et l'on garde l'ecart le plus SERRE, qui est celui qui
/// compte.
pub fn _grouper_parts(brutes: &Json, cle: &str) -> Parts {
    let mut parts: Parts = Vec::new();
    for p in els(brutes) {
        let k = (p[cle].as_i64().unwrap_or(0), str_py(&p["net"]));
        let i = match parts.iter().position(|e| e.0 == k) {
            Some(i) => i,
            None => {
                parts.push((k, obj! {"l" => 0.0, "ecart" => &p["ecart"], "w_v" => &p["w_v"],
                                     "w_a" => &p["w_a"], "cote" => &p["cote"],
                                     "net" => &p["net"], "rang" => &p[cle]}));
                parts.len() - 1
            }
        };
        let e = &mut parts[i].1;
        let l = num(e, "l") + num(p, "l");
        poser(e, "l", l);
        if num(p, "ecart") < num(e, "ecart") {
            poser(e, "ecart", &p["ecart"]);
            poser(e, "cote", &p["cote"]);
        }
    }
    parts
}

/// Etale la Z differentielle d'une scene sur SES troncons.
///
/// `chaleur` est aligne sur `geometry.objects` -- la selection. Rien n'est
/// rendu : on ecrit dans la liste.
///
/// LA PAIRE DE LA SCENE : celle que la page a declaree ou que les suffixes
/// nomment, a defaut la voisine LA PLUS PROCHE. La seconde n'est pas une paire
/// et la carte le dit -- mais peindre la Z differentielle de la voisine d'a
/// cote reste la seule facon de voir un ecartement qui derive.
pub fn _chaleur_scene(couches: &[Json], scene: &Json, fiches: &[Json], t_r: f64, chaleur: &mut [Json], cache: &mut CacheLocal) {
    let parts = _grouper_parts(&scene["parts"], "i");

    let mut partenaire: Option<String> = fiches.iter().find(|f| f["differentielle"].vrai()).map(|f| str_py(&f["net_voisin"]));
    let declare = partenaire.is_some();
    if partenaire.is_none() && !fiches.is_empty() {
        let mut m = &fiches[0];
        for f in &fiches[1..] {
            if _nombre(&f["ecart"], 1e9) < _nombre(&m["ecart"], 1e9) {
                m = f;
            }
        }
        partenaire = Some(str_py(&m["net_voisin"]));
    }

    for ((i, net), val) in _sections_locales(&parts, couches, scene, t_r, cache) {
        if i < 0 || i >= chaleur.len() as i64 {
            continue;
        }
        let c = &mut chaleur[i as usize];
        if nul(c) {
            *c = obj! {"net" => &scene["net"], "couche" => &scene["couche"],
                       "ecart" => &val["ecart"], "longueur" => 0.0,
                       "z_diff" => Json::Nul, "z_diff_net" => "",
                       "z_diff_declare" => false};
        }
        let l = num(c, "longueur") + num(&val, "longueur");
        poser(c, "longueur", l);
        let e = minf(&[num(c, "ecart"), num(&val, "ecart")]);
        poser(c, "ecart", e);
        if Some(&net) == partenaire.as_ref() {
            let loc = &val["loc"];
            let arrondi = |cle: &str, n: usize| if loc[cle].vrai() { Some(round(num(loc, cle), n)) } else { None };
            poser(c, "z_diff", arrondi("z_diff", 2));
            poser(c, "z_commune", arrondi("z_commune", 2));
            poser(c, "eps_eff_impair", arrondi("eps_eff_impair", 4));
            poser(c, "eps_eff_pair", arrondi("eps_eff_pair", 4));
            poser(c, "z_diff_net", &net);
            poser(c, "z_diff_declare", declare);
            // LA SECTION ENTIERE DE LA PAIRE, pour la cascade a quatre acces :
            // [L] et [C] (selection, partenaire) et les deux largeurs.
            if loc["matrices"].vrai() {
                let mut m = loc["matrices"].clone();
                poser(&mut m, "largeur_p", round(num(&val, "w_v"), 4));
                poser(&mut m, "largeur_n", round(num(&val, "w_a"), 4));
                poser(c, "matrices_paire", m);
            }
        }
    }
}

/// La selection porte deux nets : on met le premier en ligne, l'autre en voisin.
///
/// UNE PAIRE ENVOYEE ENTIERE N'EST PAS UNE LIGNE A DEUX MORCEAUX. La page
/// laisse designer les deux moities d'une paire differentielle d'un seul
/// geste, et tout arrive alors dans `geometry.objects`. Mis en cascade tel
/// quel, cela decrit une ligne unique qui sauterait d'un net a l'autre --
/// une Z de mode commun deguisee en Z de ligne, et AUCUN couplage, puisque la
/// partenaire n'est pas dans le voisinage ou le couplage se lit.
///
/// LE PARTAGE EST DONC FAIT ICI, UNE FOIS, ET AVANT TOUT LE RESTE : la
/// principale reste dans `objets`, l'autre passe en tete de `voisinage`, et la
/// paire est declaree pour que `_couplage` la retrouve. `_couplage` ne le
/// refait pas -- voir son premier commentaire.
///
/// QUI EST LA PRINCIPALE : une paire deja declaree dans `doc["paires"]` decide
/// seule ; sinon le net nomme par `doc["net"]` ; sinon le premier dans l'ordre
/// alphabetique, qui est arbitraire mais stable -- deux analyses du meme
/// dessin ne doivent pas rendre deux fiches differentes.
///
/// Rend la liste des objets retenus, et modifie `doc` sur place.
pub fn _partager_paire(doc: &mut Json, objets: Vec<Json>) -> Vec<Json> {
    let declarees = els(&doc["paires"]).to_vec();
    let net_de = |o: &Json| str_ou_vide(&o["net"]);
    let nets: Noms = objets.iter().map(net_de).filter(|n| !n.is_empty()).collect();
    if nets.len() < 2 {
        return objets;
    }

    let mut paire: Option<(String, String)> = None;
    for p in &declarees {
        let l = els(p);
        if l.len() >= 2 && nets.contains(&str_py(&l[0])) && nets.contains(&str_py(&l[1])) {
            paire = Some((str_py(&l[0]), str_py(&l[1])));
            break;
        }
    }
    let (net_prim, net_part) = paire.unwrap_or_else(|| {
        let principal = str_ou_vide(&doc["net"]);
        if nets.contains(&principal) {
            let autre = nets.iter().find(|n| **n != principal).cloned().unwrap_or_default();
            (principal, autre)
        } else {
            let mut it = nets.iter();
            (it.next().cloned().unwrap_or_default(), it.next().cloned().unwrap_or_default())
        }
    });

    let (retenus, mut verses): (Vec<Json>, Vec<Json>) = objets.iter().cloned().partition(|o| net_de(o) == net_prim);
    if retenus.is_empty() || verses.is_empty() {
        return objets;
    }

    verses.extend(els(&doc["voisinage"]).iter().cloned());
    poser(doc, "voisinage", verses);
    if declarees.is_empty() {
        poser(doc, "paires", vec![vec![net_prim.clone(), net_part]]);
    }
    if !doc["net"].vrai() {
        poser(doc, "net", net_prim);
    }
    retenus
}
