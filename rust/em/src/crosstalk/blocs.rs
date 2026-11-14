//! Le decoupage en blocs, [C] et [L] de chaque bloc, les deux coefficients d'un couple, les
//! pistes superposees.

use super::*;
use crate::simulation_em::base::*;
use std::collections::{BTreeSet, HashMap};
use std::rc::Rc;

// ==========================================================================
// LE DECOUPAGE EN BLOCS, ET CE QU'UN BLOC CONTIENT
// --------------------------------------------------------------------------
// UN BLOC EST UNE PORTION DU PARCOURS OU RIEN NE CHANGE : le meme troncon
// d'agresseur, le meme ensemble de voisines, les memes ecarts. Les bornes sont
// donc la reunion des bouts de troncons et des bouts de longements -- une
// voisine qui commence au tiers du parcours y ouvre un bloc, et c'est
// exactement ce qui donne a la carte sa structure : le couplage se fabrique la
// ou la voisine est la, et nulle part ailleurs.
//
// TOUTES LES VOISINES SONT DES CONDUCTEURS DU RESEAU, MEME ABSENTES DU BLOC.
// Une victime a DEUX ports -- proche et lointain -- et ils existent sur toute
// la longueur : sur les blocs ou elle ne longe pas, elle est une ligne
// ISOLEE, avec sa propre capacite et sa propre inductance et aucun terme
// mutuel. C'est ce qui fait que sa reponse impulsionnelle porte le bon retard
// de bout en bout, et non seulement celui de la portion couplee.
// ==========================================================================

pub const TOL_BORNE: f64 = 1e-4; // mm ; deux bornes plus proches que cela sont la meme

/// Les bornes des blocs, en millimetres le long du parcours.
///
/// LES FENTES SONT DES FRONTIERES, au meme titre qu'un debut de longement ou
/// de garde : un bloc doit etre ENTIEREMENT sous plan ou ENTIEREMENT sur la
/// decoupe, sans quoi il faudrait choisir laquelle des deux sections lui
/// donner -- et l'un des deux choix est faux sur toute la longueur du bloc.
pub fn decouper(parcours: &[Troncon], retenus: &[Json], notes: &mut Vec<String>, fentes: &[Json]) -> Vec<f64> {
    let Some(dernier) = parcours.last() else { return Vec::new() };
    let fin = dernier.s1;
    let mut bornes = vec![0.0, fin];
    for seg in parcours {
        bornes.push(seg.s0);
        bornes.push(seg.s1);
    }
    for c in retenus {
        for i in els(&c["intervalles"]) {
            bornes.push(num(i, "s0"));
            bornes.push(num(i, "s1"));
        }
    }
    for f in fentes {
        let s0 = nb(&f["s"]);
        let s1 = s0 + _nb(&f["longueur"], 0.0);
        if 0.0 < s0 && s0 < fin {
            bornes.push(s0);
        }
        if 0.0 < s1 && s1 < fin {
            bornes.push(s1);
        }
    }
    bornes.sort_by(f64::total_cmp);
    bornes.dedup();
    let mut propres = vec![bornes[0]];
    for &b in &bornes[1..] {
        if b - propres[propres.len() - 1] > TOL_BORNE {
            propres.push(b);
        }
    }
    if propres.len() - 1 > MAX_BLOCS {
        let pas = ((propres.len() - 1) as f64 / MAX_BLOCS as f64).ceil() as usize;
        let mut gardees: Vec<f64> = propres.iter().copied().step_by(pas).collect();
        if gardees[gardees.len() - 1] != propres[propres.len() - 1] {
            gardees.push(propres[propres.len() - 1]);
        }
        notes.push(format!("Parcours découpé en {} blocs au lieu de {} : le maximum \
                            est {}. Les frontières les plus fines ont été fondues, \
                            ce qui ÉTALE le couplage sur les blocs voisins.",
                           gardees.len() - 1, propres.len() - 1, MAX_BLOCS));
        propres = gardees;
    }
    propres
}

/// Le cache d'une analyse : les lignes seules et les sections de bloc deja resolues (le
/// `cache` de Python, un dict a clefs de tuples).
#[derive(Default)]
pub struct Cache {
    seules: HashMap<String, (Option<(f64, f64)>, f64, String)>,
    blocs: HashMap<String, Option<Rc<tl::Multiligne>>>,
}

/// round(x, n) dans une clef de cache : -0.0 et 0.0 y sont la meme clef, comme en Python.
fn rc(x: f64, n: usize) -> f64 {
    round(x, n) + 0.0
}

/// (C, L, eps_eff) d'un conducteur qui ne longe rien dans ce bloc.
///
/// SANS MASSE COPLANAIRE : le conducteur est ici hors de tout groupe, et
/// l'ecart au plan lateral que la page a mesure valait pour la SELECTION, pas
/// pour lui. On le pose donc en ligne nue, ce qui majore legerement son Z0 --
/// et cela ne touche que son RETARD PROPRE, pas le couplage, qui est nul dans
/// ce bloc par construction.
///
/// SAUF SANS PLAN, ou la masse coplanaire est le SEUL retour : sans elle il
/// n'y a pas de ligne du tout. L'appelant passe alors les ecarts qu'il
/// connait -- ceux de la selection, pour l'agresseur --, et la piste se
/// resout en coplanaire sans plan. Sous un plan, les ecarts sont ignores et
/// rien ne change.
///
/// Rend ((C, L) ou None, eps_eff, raison).
pub fn _ligne_seule(couches: &[Json], couche: i64, largeur: f64, epaisseur: f64, cache: &mut Cache, plans_nus: &[String],
                    ecart_g: f64, ecart_d: f64) -> (Option<(f64, f64)>, f64, String) {
    let mut nus = plans_nus.to_vec();
    nus.sort();
    let fin = |x: f64| if x.is_finite() { x } else { 0.0 };
    let (eg, ed) = (rc(fin(ecart_g), 5), rc(fin(ecart_d), 5));
    let cle = format!("{:?}", (couche, rc(largeur, 6), rc(epaisseur, 6), &nus, eg, ed));
    if let Some(r) = cache.seules.get(&cle) {
        return r.clone();
    }
    let (mut geo, mut info) = se::section_de_couche(couches, couche, largeur, epaisseur,
                                                    0.0, None, &nus, false);
    if geo.is_none() && (eg > 0.0 || ed > 0.0) {
        (geo, info) = se::section_de_couche(couches, couche, largeur, epaisseur,
                                            eg, Some(ed), &nus, true);
    }
    let r = match geo {
        None => (None, 0.0, str_py(&info)),
        Some(geo) => match tl::solve_line(&se::geometrie(&geo)) {
            Err(exc) => (None, 0.0, exc.0),
            Ok(r) => {
                let (z0, eps) = (r.z0, r.eps_eff);
                let racine = eps.sqrt();
                (Some((racine / (C_0 * z0), z0 * racine / C_0)), eps, String::new())
            }
        },
    };
    cache.seules.insert(cle, r.clone());
    r
}

/// `ecartes.setdefault(net, raison)` : le dict de Python, dans l'ordre d'insertion.
fn setdefault(ecartes: &mut Vec<(String, String)>, net: &str, raison: impl FnOnce() -> String) {
    if !ecartes.iter().any(|(n, _)| n == net) {
        ecartes.push((net.to_string(), raison()));
    }
}

/// [C] et [L] globales d'un bloc (F/m, H/m), plus eps_eff par conducteur.
///
/// `conducteurs` est la liste GLOBALE, dans l'ordre des ports du reseau :
/// l'agresseur de reference d'abord, puis les candidats retenus. `presents`
/// dit lesquels longent l'agresseur sur ce bloc, avec leur position laterale
/// LOCALE -- c'est elle, et non la moyenne du longement, qui est resolue ici.
///
/// `plans_nus` NOMME LES PLANS QUI N'ONT PAS DE CUIVRE SOUS CE BLOC-LA. Ils
/// sont dans l'empilage, mais pas ici -- une decoupe, une fente, un plan qui
/// s'arrete avant. Sans eux, la section de ce bloc etait celle de l'empilage
/// DECLARE, et un longement survolant une decoupe rendait exactement le meme
/// couplage qu'un longement sur plan plein : deux configurations d'essai qui
/// ne different que par le cuivre du plan sortaient au bit pres identiques.
/// C'est le seul endroit ou la geometrie LOCALE du plan entre dans [C] et [L],
/// et elle doit y entrer avant la clef de cache -- sinon le premier bloc
/// resolu repondrait pour tous les autres.
///
/// `gardes` PORTE LES PISTES DE MASSE ROUTEES qui longent sur ce bloc-la.
/// Elles entrent dans la MEME section, au meme titre que les victimes, mais
/// sans port : elles n'ont pas de bruit a elles, et le tableau des victimes
/// n'en parle pas. Ce qu'elles changent est le champ, et c'est tout ce qu'on
/// leur demande -- tenue a zero volt, une garde cousue fait tomber le NEXT et
/// le FEXT ; mal cousue, elle est posee FLOTTANTE et le NEXT REMONTE, parce
/// qu'un tel cuivre ne blinde pas, il transfere. Voir `_poser_section`, qui
/// tranche entre les deux avec le meme seuil que partout ailleurs.
///
/// REND AUSSI QUELS CONDUCTEURS ONT VRAIMENT ETE COUPLES. C'est le
/// renseignement qui manquait le plus : quand la section n'est pas resoluble
/// -- pas de plan de reference sur cette couche, solveur en echec --, chaque
/// conducteur retombe sur sa ligne isolee, [C] et [L] restent DIAGONALES, et
/// le couplage du bloc vaut exactement ZERO. Le calcul aboutit, la carte se
/// dessine, et elle annonce « aucun couplage » la ou l'on ne sait pas
/// calculer. C'est le faux negatif le plus grave que ce module puisse
/// produire, et il etait muet.
///
/// SANS PLAN EN FACE DE CE BLOC -- carte deux couches, ou plan absent sous ce
/// troncon --, la section se resout en COPLANAIRE SANS PLAN : la masse arrosee
/// de la meme couche, et les gardes, portent seules le retour. La couture n'y
/// est pas exigee : il n'y a pas de plan a coudre, et ce cuivre est la
/// reference elle-meme. `sans_plan`, une liste, recoit alors un drapeau ; le
/// solveur refuse -- et la raison remonte -- s'il n'y a aucune masse.
///
/// Rend ([C], [L], eps, couples, bords). `sans_plan`, quand on le donne, est mis a vrai.
pub fn _matrices_bloc(couches: &[Json], seg: &Troncon, presents: &[Json], conducteurs: &[Json], refs: &Noms, couture_max: f64,
                      cache: &mut Cache, ecartes: &mut Vec<(String, String)>, gardes: &[Json], plans_nus: &[String],
                      sans_plan: Option<&mut bool>) -> (Vec<Vec<f64>>, Vec<Vec<f64>>, Vec<f64>, BTreeSet<usize>, Vec<Json>) {
    let n = conducteurs.len();
    let mut c_g = vec![vec![0.0; n]; n];
    let mut l_g = vec![vec![0.0; n]; n];
    let mut eps = vec![0.0; n];
    let mut couples = BTreeSet::new();
    // LES BORDS QUI ONT PERDU LEUR MASSE COPLANAIRE faute de vias : c'est le
    // cinquieme rendu, et il existe pour la meme raison que `couples` -- un
    // calcul qui durcit ses hypotheses en silence n'est pas verifiable.
    let mut bords = Vec::new();

    let mut nus = plans_nus.to_vec();
    nus.sort();
    let gap_g = _nb(&seg.obj["gap_left"], _nb(&seg.obj["gap"], 0.0));
    let gap_d = _nb(&seg.obj["gap_right"], _nb(&seg.obj["gap"], 0.0));
    // Y A-T-IL UN PLAN EN FACE DE CE BLOC ? C'est de la geometrie pure -- le
    // solveur n'est pas appele quand on ne donne pas `sans_plan`.
    let plan_ici = se::section_de_couche(couches, seg.couche, seg.largeur,
                                         seg.epaisseur, 0.0, Some(0.0),
                                         &nus, false).0.is_some();
    let couture_max = if plan_ici { couture_max } else { 0.0 };

    if !presents.is_empty() {
        // LE PLUS PROCHE D'ABORD, GARDES COMPRISES. `_poser_section`
        // pose dans l'ordre qu'on lui donne et compte sur cet ordre :
        // c'est lui qui decide quelle voisine perd sa place quand la
        // section est pleine, et c'est lui qui fait qu'une garde deja
        // posee entre deux pistes n'y est pas doublee d'une masse
        // interposee imaginaire.
        let mut voisins: Vec<Json> = presents.iter().chain(gardes).map(|p| obj! {
            "net" => &p["net"], "x" => &p["x"],
            "largeur" => &p["largeur"], "ecart" => &p["ecart"],
            "ecart_min" => &p["ecart"], "longueur" => 1.0,
            "troncons" => 1i64, "cote" => if num(p, "x") < 0.0 { "gauche" } else { "droite" },
            "deux_cotes" => false,
            "garde" => p["garde"].vrai(),
            "gap_face" => p.get("gap_face").cloned().unwrap_or(Json::Flottant(0.0)),
            "couture" => p.get("couture").cloned().unwrap_or(Json::Flottant(0.0))}).collect();
        voisins.sort_by(|a, b| num(a, "x").abs().partial_cmp(&num(b, "x").abs()).unwrap_or(std::cmp::Ordering::Equal));
        let scene = obj! {"net" => &conducteurs[0]["net"], "largeur" => seg.largeur,
                          "epaisseur" => seg.epaisseur,
                          "gap_g" => gap_g,
                          "gap_d" => gap_d,
                          "net_masse" => if refs.len() == 1 { refs.iter().next().cloned().unwrap_or_default() } else { "masse".to_string() },
                          "couture_g" => _nb(&seg.obj["couture_left"], 0.0),
                          "couture_d" => _nb(&seg.obj["couture_right"], 0.0),
                          "voisins" => voisins};
        let hauteur = se::_hauteur_de_couche(couches, seg.couche, seg.largeur,
                                             seg.epaisseur, &nus, true, false);
        // l'ecart entre plans d'une triplaque : la pose elargit comme le solveur
        let ecart = se::_hauteur_de_couche(couches, seg.couche, seg.largeur,
                                           seg.epaisseur, &nus, true, true);
        let (poses, hors) = se::_poser_section(&scene, hauteur, couture_max, ecart);
        for e in &hors {
            setdefault(ecartes, &str_py(&e["net"]), || str_py(&e["raison"]));
        }
        // LA COUTURE DU BORD EST DANS LA CLEF depuis qu'elle decide de l'effet
        // coplanaire exterieur : deux blocs de meme dessin, l'un bordé d'un plan
        // cousu et l'autre non, ne se resolvent plus pareil.
        let cle = format!("{:?}", (seg.couche, rc(seg.epaisseur, 6),
                                   poses.iter().map(|p| (rc(num(p, "x"), 5), rc(num(p, "w"), 5), p["garde"].vrai(),
                                                         p["flottant"].vrai())).collect::<Vec<_>>(),
                                   rc(num(&scene, "gap_g"), 5), rc(num(&scene, "gap_d"), 5),
                                   rc(num(&scene, "couture_g"), 3), rc(num(&scene, "couture_d"), 3),
                                   &nus));
        // LES BORDS PERDUS SE RELEVENT MEME QUAND LE CACHE REPOND. Le calcul
        // est un min et un max sur les rubans poses : il ne coute rien, et le
        // taire sur les blocs deja en cache ferait dependre l'avertissement de
        // l'ordre des blocs.
        let (e_g, e_d) = se::_ecarts_masse_du_groupe(&poses, &scene, couture_max);
        for nom in se::_cotes_non_cousus(&poses, &scene, couture_max) {
            bords.push(obj! {"cote" => nom,
                             "couture" => if nom == "gauche" { &scene["couture_g"] } else { &scene["couture_d"] }});
        }
        let r = match cache.blocs.get(&cle) {
            Some(r) => r.clone(),
            None => {
                let (geo, info) = se::section_de_couche(couches, seg.couche,
                                                        seg.largeur, seg.epaisseur,
                                                        e_g, Some(e_d), &nus, true);
                let r = match geo {
                    None => {
                        // ET ON LE DIT. Cette branche etait la seule du module a
                        // renoncer SANS UN MOT : le bloc repartait en lignes isolees,
                        // son couplage valait zero, et rien dans le resultat ne
                        // distinguait « elles ne couplent pas » de « on n'a pas su
                        // calculer ».
                        setdefault(ecartes, "_section", || format!(
                            "aucune section droite calculable sur « {} » ({})",
                            nom_ou_rang(couches, seg.couche),
                            match info.as_str() {
                                Some(t) if !t.is_empty() => t,
                                _ => "pas de plan de référence exploitable",
                            }));
                        None
                    }
                    Some(mut geo) => {
                        poser(&mut geo, "conducteurs", poses.iter().map(|p| obj! {
                            "w" => num(p, "w") * 1e-3, "x" => num(p, "x") * 1e-3,
                            "masse" => p["garde"].vrai() && !p["flottant"].vrai(),
                            "flottant" => p["flottant"].vrai()}).collect::<Vec<Json>>());
                        match tl::solve_multiline(&se::geometrie(&geo)) {
                            Ok(r) => Some(Rc::new(r)),
                            Err(exc) => {
                                setdefault(ecartes, "_section", || exc.0);
                                None
                            }
                        }
                    }
                };
                cache.blocs.insert(cle, r.clone());
                r
            }
        };
        if r.is_some() && !plan_ici {
            if let Some(drapeau) = sans_plan {
                *drapeau = true;
            }
        }
        if let Some(r) = r {
            // DE L'ORDRE D'ENTREE A L'ORDRE DES PORTS. `solve_multiline` range
            // ses rubans de gauche a droite et rend `ordre` pour retrouver
            // l'entree ; sans cette table, une voisine de gauche lirait la
            // ligne de [C] d'une voisine de droite -- en silence, et avec un
            // chiffre parfaitement credible.
            let rang_port: HashMap<usize, usize> = r.ordre.iter().enumerate().map(|(i, &rang)| (rang, i)).collect();
            let mut lien: Vec<(usize, usize)> = Vec::new();
            for (rang, pose) in poses.iter().enumerate() {
                let Some(&port) = rang_port.get(&rang) else { continue }; // une garde n'a pas de port
                let g = if pose["selection"].vrai() {
                    Some(0)
                } else {
                    // le dict `par_net` de Python : le dernier conducteur du nom l'emporte
                    conducteurs.iter().rposition(|c| c["net"] == pose["net"])
                };
                if let Some(g) = g {
                    match lien.iter_mut().find(|(k, _)| *k == g) {
                        Some(l) => l.1 = port,
                        None => lien.push((g, port)),
                    }
                }
            }
            for &(g1, p1) in &lien {
                eps[g1] = r.lignes[p1].eps_eff;
                couples.insert(g1);
                for &(g2, p2) in &lien {
                    c_g[g1][g2] = r.c[p1][p2];
                    l_g[g1][g2] = r.l[p1][p2];
                }
            }
        }
    }

    for (g, cond) in conducteurs.iter().enumerate() {
        if couples.contains(&g) {
            continue;
        }
        // L'AGRESSEUR SEUL GARDE SES ECARTS : ce sont les siens, mesures le
        // long de ce troncon. Ils ne servent que sans plan, ou ils sont le
        // seul retour -- voir `_ligne_seule`.
        let (eg, ed) = if g == 0 { (gap_g, gap_d) } else { (0.0, 0.0) };
        let (cl, mut eps_ii, raison) = _ligne_seule(
            couches, ent(&cond["couche"], 0), num(cond, "largeur"), num(cond, "epaisseur"), cache,
            plans_nus, eg, ed);
        let (c_ii, l_ii) = match cl {
            Some(cl) => cl,
            None => {
                // UN CONDUCTEUR QU'ON NE SAIT PAS POSER SEUL -- une couche sans
                // plan de reference -- ne peut pas etre un fil : on lui donne la
                // ligne de 50 ohms a la vitesse typique, et on le DIT.
                setdefault(ecartes, &str_py(&cond["net"]), || format!("section isolée non calculable : {raison}"));
                eps_ii = (C_0 / se::VITESSE_TYPIQUE).powi(2);
                let racine = eps_ii.sqrt();
                (racine / (C_0 * 50.0), 50.0 * racine / C_0)
            }
        };
        c_g[g][g] = c_ii;
        l_g[g][g] = l_ii;
        eps[g] = eps_ii;
    }
    (c_g, l_g, eps, couples, bords)
}

// ==========================================================================
// LE COUPLAGE QUI NE DEMANDE AUCUN SIGNAL
// --------------------------------------------------------------------------
// DEUX COEFFICIENTS SORTENT DE [C] ET [L] SEULES, et ils ne dependent ni du
// front, ni de l'amplitude, ni de la bande analysee :
//
//     Kb = 1/4 (Cm/C0 + Lm/L0)      sans dimension
//     Kf = 1/2 (Lm/L0 - Cm/C0)      sans dimension, a multiplier par T_d/t_r
//
// CE QUE Kb EST EXACTEMENT : le NEXT SATURE -- la fraction de l'amplitude que
// le couplage arriere atteint des que le longement depasse v*t_r/2. Sous la
// saturation, le NEXT vaut Kb * 2*T_d/t_r : c'est `niveau2` qui tranche.
//
// LE FEXT VARIE COMME 1/t_r : Kf * T_d est une DUREE que la geometrie fixe
// entierement, et le front la convertit en niveau.
//
// EN MILIEU HOMOGENE, Kf S'ANNULE. Une triplaque a Lm/L0 = Cm/C0 exactement :
// pas de FEXT en interne. Le solveur le retrouve seul -- -7e-6 sur une
// triplaque a 0,6 mm d'ecart, contre +0,021 pour le meme dessin en microruban
// --, et c'est le meilleur controle qu'on ait de ces deux lignes de calcul.
//
// LA CONVENTION DE [C] EST CELLE DE MAXWELL, et elle se verifie a l'oeil : les
// termes hors diagonale sont NEGATIFS. La mutuelle vaut donc -c[i][j].
//
// ET C0 EST LA DIAGONALE DE MAXWELL, c[i][i] -- la capacite « chargee », celle
// de la ligne quand toutes les autres sont a la masse. Ce n'est PAS la
// capacite ligne-a-masse (diagonale moins les mutuelles), qu'une premiere
// version employait en croyant corriger une sous-estimation. Le controle est
// sans appel et ne demande aucune reference exterieure : en milieu HOMOGENE,
// [L] = mu*eps*[C]^-1, d'ou Lm/L0 = Cm/c[i][i] EXACTEMENT, et Kf = 0 a tout
// ecart. Avec la capacite ligne-a-masse, Kf derivait jusqu'a -0,10 en
// triplaque a 0,05 mm d'ecart -- un FEXT fabrique par la formule --, et Kb
// etait surestime d'autant plus que le couplage etait serre. Le controle a
// 0,6 mm d'ecart ne le voyait pas : a si faible couplage, les deux
// definitions se confondent.
// ==========================================================================

/// (Kb, Kf) du couple (i, j), tires de [C] et [L] et de rien d'autre.
///
/// REND (0, 0) QUAND LA SECTION N'A PAS ETE RESOLUE -- les matrices sont
/// alors diagonales --, et ce zero-la n'est pas une mesure de decouplage. Le
/// distinguer est le travail de l'appelant : `mesure`, sur chaque bloc, et
/// `non_couples` sur l'ensemble, portent precisement cette difference.
pub fn coefficients_couple(c_mat: &[Vec<f64>], l_mat: &[Vec<f64>], i: usize, j: usize) -> (f64, f64) {
    let (l0, lm) = (l_mat[i][i], l_mat[i][j]);
    // C0 EST LA DIAGONALE DE MAXWELL -- voir plus haut, et le banc qui le
    // verifie en triplaque a ecart serre.
    let cm = -c_mat[i][j];
    let c0 = c_mat[i][i];
    if !(l0 > 0.0) || !(c0 > 0.0) {
        return (0.0, 0.0);
    }
    let (rl, rc) = (lm / l0, cm / c0);
    (0.25 * (rc + rl), 0.5 * (rl - rc))
}

/// Ce qu'il faut pour resoudre deux couches de cuivre SUPERPOSEES.
///
/// Rend (h_i, h_j, b_mm, eps_r) -- les hauteurs de l'axe de chaque couche
/// au-dessus du plan de reference du dessous, l'ecart entre les deux plans
/// qui encadrent la paire (None s'il n'y en a qu'un), et la permittivite
/// moyenne entre eux --, ou None quand aucun plan ne les reference. MEME
/// LECTURE QUE `analyse_carte.diaphonie` (larges faces).
///
/// Les couches sont celles de `stackup.layers` ; `i` et `j` leurs indices.
pub fn geometrie_superposee(couches: &[Json], i: i64, j: i64) -> Option<(f64, f64, Option<f64>, f64)> {
    let (i, j) = (i.min(j), i.max(j));
    let cu: Vec<i64> = couches.iter().enumerate().filter(|(_, c)| c["type"].as_str() == Some("copper")).map(|(k, _)| k as i64).collect();
    if !cu.contains(&i) || !cu.contains(&j) {
        return None;
    }
    let plan = |q: &&i64| couches[**q as usize]["role"].as_str() == Some("plane");

    let voisins = |k: i64| -> Vec<i64> {
        let r = cu.iter().position(|q| *q == k).unwrap_or(0);
        let haut = cu[..r].iter().rev().find(plan).copied();
        let bas = cu[r + 1..].iter().find(plan).copied();
        [haut, bas].into_iter().flatten().collect()
    };

    let ep = |a: i64, b: i64| -> f64 {
        let (lo, hi) = (a.min(b) as usize, a.max(b) as usize);
        py::sum(couches[(lo + 1).min(hi)..hi].iter().map(|c| _nb(&c["thickness"], 0.0)))
    };

    let refs: BTreeSet<i64> = voisins(i).into_iter().chain(voisins(j)).collect();
    if refs.is_empty() {
        return None;
    }
    let dessous: Vec<i64> = refs.iter().copied().filter(|q| *q > j).collect();
    let p = if dessous.is_empty() { *refs.iter().max()? } else { *dessous.iter().min()? };
    let dessus: Vec<i64> = if dessous.is_empty() { Vec::new() } else { refs.iter().copied().filter(|q| *q < i).collect() };
    let b_mm = dessus.iter().max().map(|d| ep(*d, p));
    let h_i = ep(i, p) + _nb(&couches[i as usize]["thickness"], 0.035) / 2.0;
    let h_j = ep(j, p) + _nb(&couches[j as usize]["thickness"], 0.035) / 2.0;
    let (lo, hi) = (i.min(j).min(p) as usize, i.max(j).max(p) as usize);
    let ers: Vec<f64> = couches[lo..=hi].iter()
        .filter(|c| c["type"].as_str() == Some("dielectric") && _nb(&c["epsilon_r"], 0.0) > 0.0)
        .map(|c| _nb(&c["epsilon_r"], 0.0)).collect();
    Some((h_i, h_j, b_mm, if ers.is_empty() { 4.3 } else { py::sum(ers.iter().copied()) / ers.len() as f64 }))
}

/// Kb de deux rubans a leurs hauteurs (mm), decales de x_lat d'axe a axe.
///
/// `ligne_mom.section_deux_niveaux`, milieu homogene : Kf y est nul, seul Kb
/// compte. Leve si la geometrie sort du domaine du solveur.
pub fn kb_superposees(h_v: f64, h_a: f64, x_lat: f64, w_v: f64, w_a: f64, b_mm: Option<f64>) -> tl::Res<f64> {
    let r = tl::section_deux_niveaux(
        &[tl::Ruban { x: 0.0, y: h_v * 1e-3, w: w_v * 1e-3 },
          tl::Ruban { x: x_lat * 1e-3, y: h_a * 1e-3, w: w_a * 1e-3 }],
        b_mm.filter(|b| *b != 0.0).map(|b| b * 1e-3), 1.0, 30, 8)?;
    Ok(coefficients_couple(&r.c, &r.l, 0, 1).0)
}

/// Un morceau couple d'une victime superposee : (Kb, 0, dT, longueur_mm, s0, s1).
pub type Superposee = (f64, f64, f64, f64, f64, f64);

/// Les morceaux couples d'une victime SUPERPOSEE a l'agresseur.
///
/// Rend [(Kb, 0, dT, longueur_mm, s0, s1)] -- un par superposition sans plan
/// entre les deux couches, avec sa plage le long du parcours --, ou une liste
/// vide. Une superposition que le solveur
/// refuse est dite dans les notes plutot que comptee nulle.
pub fn _superposees(couches: &[Json], fiche: &Json, cache: &mut HashMap<String, Option<f64>>, notes: &mut Vec<String>) -> Vec<Superposee> {
    let mut out = Vec::new();
    for sp in els(&fiche["superpositions"]) {
        // LA COUCHE ET LA LARGEUR DE LA SUPERPOSITION, pas celles de la fiche :
        // une fiche fusionnee porte la couche de son longement A PLAT.
        let couche_v = sp.get("couche_victime").map_or_else(|| ent(&fiche["couche"], 0), |c| ent(c, 0));
        let w_v = _nb(&sp["largeur_victime"], num(fiche, "largeur"));
        let couche_a = ent(&sp["couche_agresseur"], 0);
        let Some((h_lo, h_hi, b_mm, er)) = geometrie_superposee(couches, couche_a, couche_v) else { continue };
        let haut_agr = couche_a < couche_v;
        let (h_a, h_v) = if haut_agr { (h_lo, h_hi) } else { (h_hi, h_lo) };
        let (decalage, w_a) = (num(sp, "decalage"), num(sp, "largeur_agresseur"));
        let cle = format!("{:?}", (rc(h_v, 4), rc(h_a, 4), rc(decalage, 3),
                                   rc(w_v, 3), rc(w_a, 3),
                                   b_mm.map(|b| if b != 0.0 { rc(b, 4) } else { b })));
        if !cache.contains_key(&cle) {
            let kb = match kb_superposees(h_v, h_a, decalage, w_v, w_a, b_mm) {
                Ok(kb) => Some(kb),
                Err(exc) => {
                    notes.push(format!("« {} » : superposition non résolue ({}).", str_py(&fiche["net"]), exc.0));
                    None
                }
            };
            cache.insert(cle.clone(), kb);
        }
        let Some(kb) = cache[&cle] else { continue };
        let longueur = _nb(&sp["longueur"], 0.0);
        out.push((kb, 0.0, longueur * 1e-3 * er.sqrt() / C_0, longueur,
                  _nb(&sp["s0"], 0.0), _nb(&sp["s1"], 0.0)));
    }
    out
}

/// Ce que `sections_couplees` rend (le dict `infos`).
#[derive(Debug, Clone)]
pub struct Infos {
    pub conducteurs: Vec<Json>,
    pub blocs: Vec<Json>,
    pub abscisses: Vec<f64>,
    pub retards: Vec<Vec<f64>>,
    // LES PISTES DE GARDE POSEES DANS LES SECTIONS, avec la longueur
    // sur laquelle chacune longe et celle ou elle FLOTTE faute de
    // vias. Ce ne sont pas des victimes : elles n'ont pas de port.
    pub gardes: Vec<Json>,
    // LES BORDS OU LE PLAN ARROSE NE COMPTE PLUS, faute de vias.
    pub bords_non_cousus: Vec<Json>,
    pub couture_max: f64,
    // CE QUI N'A PAS ETE COUPLE, ET SUR QUELLE LONGUEUR.
    pub non_couples: Vec<Json>,
    pub longueur_non_couplee: f64,
    pub raison_section: String,
    pub longueur_sans_plan: f64,
    pub longueur: f64,
}

/// [C] et [L] bloc par bloc le long du parcours, et ce qu'on en tire.
///
/// Rend `infos` -- avec les BLOCS (bornes, Kb et Kf de chaque voisine contre
/// l'agresseur) et le PROFIL DE RETARD de chaque conducteur, le retard cumule
/// en fonction de l'abscisse : c'est lui qui donne T_d, bloc par bloc, quand
/// la piste change de largeur, d'ecart ou de couche en cours de route.
///
/// `t_r` ne sert qu'a decider si une garde ou un plan arrose est TENU : le
/// plus grand trou de couture tolere est lambda/10 au genou du front.
///
/// `fentes` EST LA GEOMETRIE DU PLAN, celle que l'empilage ne porte pas. Chaque
/// entree dit sur quelle portion du parcours quel plan n'a pas de cuivre de
/// retour ; les blocs concernes se resolvent alors SANS ce plan-la, et
/// retombent sur le suivant de l'empilage -- ou sur rien, et ce bloc est
/// declare non calculable plutot que calcule sur une reference imaginaire.
///
/// `gardes` EST DU CUIVRE, PAS UN PORT. Ce sont les pistes de masse routees
/// que l'etape 0a a repérées le long du parcours : elles n'ajoutent aucun
/// conducteur au reseau -- pas de port, pas de ligne dans la fiche -- et
/// entrent pourtant dans la section de chaque bloc qu'elles longent. Le
/// decoupage en blocs les prend donc en compte, sans quoi une garde qui
/// commence au milieu d'un bloc y serait etalee sur toute sa longueur.
pub fn sections_couplees(couches: &[Json], parcours: &[Troncon], retenus: &[Json], refs: &Noms, t_r: f64, notes: &mut Vec<String>,
                         gardes: &[Json], fentes: &[Json], pertes: bool) -> Result<Infos, ErreurCrosstalk> {
    let mut conducteurs = vec![obj! {"net" => str_ou_vide(&parcours[0].obj["net"]),
                                     "couche" => parcours[0].couche,
                                     "largeur" => parcours[0].largeur,
                                     "epaisseur" => parcours[0].epaisseur,
                                     "role" => "agresseur", "vertical" => false}];
    for c in retenus {
        conducteurs.push(obj! {"net" => &c["net"], "couche" => &c["couche"],
                               "largeur" => &c["largeur"],
                               "epaisseur" => &c["epaisseur"],
                               "role" => &c["role"],
                               "vertical" => c["type"].as_str() == Some("vertical")});
    }
    let n = conducteurs.len();
    if n > MAX_PORTS / 2 {
        return Err(ErreurCrosstalk::new(
            format!("{} conducteurs : le maximum est {}.", n, MAX_PORTS / 2), ""));
    }

    // LES BORNES DE BLOC SUIVENT AUSSI LES GARDES : une piste de masse qui
    // commence a mi-bloc y serait sinon posee sur toute sa longueur, et le
    // blindage qu'elle apporte s'etalerait la ou elle n'est pas.
    let tous: Vec<Json> = retenus.iter().chain(gardes).cloned().collect();
    let bornes = decouper(parcours, &tous, notes, fentes);
    // LES FENTES, RAMENEES A CE QU'IL FAUT POUR UN BLOC : un intervalle et les
    // noms des plans qui y manquent. La prose de `quoi` reste a la fiche ; ici
    // on ne lit que des noms de couche, parce qu'un nom de couche est ce que
    // `section_de_couche` compare.
    let mut zones_nues = Vec::new();
    for f in fentes {
        let noms: Vec<String> = els(&f["plans"]).iter().filter(|x| x.vrai()).map(str_py).collect();
        if noms.is_empty() {
            continue;
        }
        let s0 = nb(&f["s"]);
        zones_nues.push((s0, s0 + _nb(&f["longueur"], 0.0), noms));
    }
    let mut nus_vus = Noms::new();
    let couture_max = se::_couture_max(t_r);
    let (mut cache, mut ecartes) = (Cache::default(), Vec::new());
    // LE PROFIL DE RETARD, un point par borne de bloc : c'est l'axe de position
    // de la carte, et il se construit ici parce que c'est ici qu'on connait la
    // permittivite effective de chaque conducteur bloc par bloc.
    let mut abscisses = vec![0.0];
    let mut retards: Vec<Vec<f64>> = vec![vec![0.0]; n];
    let (mut blocs, mut muets) = (Vec::new(), Vec::new());
    let (mut etats_gardes, mut etats_bords): (Vec<Json>, Vec<Json>) = (Vec::new(), Vec::new());
    let mut longueur_sans_plan = 0.0;
    for (&a, &b) in bornes.iter().zip(bornes.iter().skip(1)) {
        let milieu = 0.5 * (a + b);
        let Some(seg) = parcours.iter().find(|s| s.s0 - TOL_BORNE <= milieu && milieu <= s.s1 + TOL_BORNE) else { continue };
        let dedans = |it: &Json| num(it, "s0") - TOL_BORNE <= milieu && milieu <= num(it, "s1") + TOL_BORNE;
        let mut presents = Vec::new();
        for c in retenus {
            if let Some(it) = els(&c["intervalles"]).iter().find(|it| dedans(it)) {
                presents.push(obj! {"net" => &c["net"], "x" => &it["x"],
                                    "largeur" => &it["largeur"],
                                    "ecart" => &it["ecart"],
                                    "gap_face" => &it["gap_face"],
                                    "couture" => &it["couture"]});
            }
        }
        // LES GARDES NE S'ARRETENT PAS A LA PREMIERE TROUVEE, et c'est la
        // difference avec une victime. Le net de masse est le MEME des deux
        // cotes de la piste -- c'est un seul net sur toute la carte --, si bien
        // qu'une garde a gauche et une garde a droite sont un seul candidat
        // avec deux jeux d'intervalles. S'arreter au premier n'en poserait
        // qu'une, et la coupe serait dissymetrique sans que rien ne le dise.
        // On garde donc, PAR COTE, la plus proche.
        let mut gardes_bloc: Vec<((String, i64), Json)> = Vec::new();
        for c in gardes {
            for it in els(&c["intervalles"]) {
                if !dedans(it) {
                    continue;
                }
                let cle_g = (str_py(&c["net"]), if num(it, "x") > 0.0 { 1 } else { -1 });
                let fiche = || obj! {"net" => &c["net"], "x" => &it["x"],
                                     "largeur" => &it["largeur"],
                                     "ecart" => &it["ecart"],
                                     "gap_face" => &it["gap_face"],
                                     "couture" => &it["couture"],
                                     "garde" => true};
                match gardes_bloc.iter_mut().find(|(k, _)| *k == cle_g) {
                    None => gardes_bloc.push((cle_g, fiche())),
                    Some((_, deja)) => {
                        if num(it, "x").abs() < num(deja, "x").abs() {
                            *deja = fiche();
                        }
                    }
                }
            }
        }
        let mut gardes_bloc: Vec<Json> = gardes_bloc.into_iter().map(|(_, g)| g).collect();
        gardes_bloc.sort_by(|g, h| num(g, "x").abs().partial_cmp(&num(h, "x").abs()).unwrap_or(std::cmp::Ordering::Equal));
        let mut plans_nus = Noms::new();
        for (z0, z1, noms) in &zones_nues {
            if z0 - TOL_BORNE <= milieu && milieu <= z1 + TOL_BORNE {
                plans_nus.extend(noms.iter().cloned());
            }
        }
        nus_vus.extend(plans_nus.iter().cloned());
        let plans_nus: Vec<String> = plans_nus.into_iter().collect();
        let mut drapeau = false;
        let (c_g, l_g, eps, couples_bloc, bords_bloc) = _matrices_bloc(
            couches, seg, &presents, &conducteurs, refs, couture_max, &mut cache,
            &mut ecartes, &gardes_bloc, &plans_nus, Some(&mut drapeau));
        if drapeau {
            longueur_sans_plan += b - a;
        }
        for bd in &bords_bloc {
            let k = etats_bords.iter().position(|e| e["cote"] == bd["cote"]).unwrap_or_else(|| {
                etats_bords.push(obj! {"cote" => &bd["cote"], "longueur" => 0.0,
                                       "couture" => 0.0});
                etats_bords.len() - 1
            });
            let etat = &mut etats_bords[k];
            poser(etat, "longueur", num(etat, "longueur") + (b - a));
            poser(etat, "couture", maxf(&[num(etat, "couture"), _nb(&bd["couture"], 0.0)]));
        }
        let longueur = (b - a) * 1e-3;
        // UN BLOC QUI PORTE DES VOISINES ET N'EN COUPLE AUCUNE : la section n'a
        // pas ete resolue, [C] et [L] y sont diagonales, et le couplage de ce
        // bloc vaut zero par defaut de calcul -- pas par mesure. On garde la
        // longueur et les nets ; c'est `analyser` qui en fait une reserve.
        if !presents.is_empty() && couples_bloc.len() < 2 {
            let nets: Noms = presents.iter().map(|p| str_py(&p["net"])).collect();
            muets.push((a, b, nets.into_iter().collect::<Vec<_>>()));
        }
        // LES GARDES, ET SUR QUELLE LONGUEUR CHACUNE TIENT. Une garde n'a pas
        // de ligne dans la fiche des couples -- elle n'a pas de port --, mais
        // taire son existence rendrait le resultat inexplicable : c'est elle
        // qui fait tomber le couplage la ou elle est cousue, et qui le fait
        // MONTER la ou elle ne l'est pas. Le meme critere que `_poser_section`,
        // lu ici pour pouvoir le dire.
        if !presents.is_empty() {
            for g in &gardes_bloc {
                let k = etats_gardes.iter().position(|e| e["net"] == g["net"]).unwrap_or_else(|| {
                    etats_gardes.push(obj! {"net" => &g["net"], "longueur" => 0.0,
                                            "longueur_flottante" => 0.0, "couture" => 0.0});
                    etats_gardes.len() - 1
                });
                let etat = &mut etats_gardes[k];
                poser(etat, "longueur", num(etat, "longueur") + (b - a));
                poser(etat, "couture", maxf(&[num(etat, "couture"),
                                              _nb(&g["couture"], 0.0)]));
                // SANS PLAN, UNE GARDE NE FLOTTE PAS : il n'y a rien a coudre,
                // et `_matrices_bloc` l'a tenue a la masse.
                if couture_max > 0.0 && !drapeau
                        && _nb(&g["couture"], 0.0) > couture_max {
                    poser(etat, "longueur_flottante", num(etat, "longueur_flottante") + (b - a));
                }
            }
        }
        abscisses.push(b);
        for g in 0..n {
            let dernier = retards[g][retards[g].len() - 1];
            retards[g].push(dernier + longueur * maxf(&[eps[g], 1.0]).sqrt() / C_0);
        }
        // LES DEUX COEFFICIENTS DU BLOC, victime par victime contre
        // l'agresseur. Ils ne coutent RIEN -- [C] et [L] sont deja la -- et ils
        // ne dependent d'aucun reglage de bande : c'est ce qui permet au mode
        // simple de repondre sans qu'on lui donne un signal, et c'est aussi ce
        // qui fait que les deux modes ne peuvent pas se contredire sur le
        // dessin. `mesure` distingue le zero CALCULE du zero faute de section
        // resolue -- la meme distinction que `non_couples`, portee au bloc.
        //
        // `presente` EST L'AUTRE MOITIE DE CETTE DISTINCTION. Une voisine qui
        // ne longe pas ce bloc n'y est pas couplee non plus, et c'est un zero
        // LEGITIME -- elle est loin. Sans ce drapeau, « non mesure » valait
        // sur tout bloc ou elle n'etait pas, et chaque voisine qui ne longe
        // qu'une partie du parcours etait dite « section non resolue ».
        let mut coef = obj! {};
        let nets_presents: Noms = presents.iter().map(|p| str_py(&p["net"])).collect();
        let net_de = |g: usize| str_py(&conducteurs[g]["net"]);
        for g in 1..n {
            let (kb, kf) = coefficients_couple(&c_g, &l_g, 0, g);
            poser(&mut coef, &net_de(g), obj! {
                "kb" => round(kb, 6), "kf" => round(kf, 6),
                "presente" => nets_presents.contains(&net_de(g)),
                "mesure" => couples_bloc.contains(&0) && couples_bloc.contains(&g)});
        }
        // LES AUTRES AGRESSEURS SELECTIONNES, vers chaque victime : la meme
        // coupe les porte deja, et leurs termes croises sont la, gratuits.
        // C'est ce qui permet de SOMMER les agresseurs d'une victime.
        let mut coef_agr = obj! {};
        for ag in 1..n {
            if conducteurs[ag]["role"].as_str() != Some("agresseur") {
                continue;
            }
            let net_ag = net_de(ag);
            if !nets_presents.contains(&net_ag) {
                continue;
            }
            if !contient(&coef_agr, &net_ag) {
                poser(&mut coef_agr, &net_ag, obj! {});
            }
            let d = dans(&mut coef_agr, &net_ag);
            for g in 1..n {
                if g == ag || conducteurs[g]["role"].as_str() == Some("agresseur") {
                    continue;
                }
                let (kb, kf) = coefficients_couple(&c_g, &l_g, ag, g);
                poser(d, &net_de(g), obj! {
                    "kb" => round(kb, 6), "kf" => round(kf, 6),
                    "presente" => nets_presents.contains(&net_de(g))});
            }
        }
        // LES PERTES DU BLOC, R et G au genou du front, sur la ligne de
        // l'agresseur : Z0 et eps_eff de sa diagonale, eps_r et tan delta de
        // sa couche. Seulement si on les a demandees.
        let mut alpha = 0.0;
        // LE Z0 DE L'AGRESSEUR SUR CE BLOC, de sa diagonale : le terme de
        // fente (4.5.0) en a besoin au franchissement, pertes ou non.
        let (c00, l00) = (c_g[0][0], l_g[0][0]);
        let z0_a = if c00 > 0.0 && l00 > 0.0 { (l00 / c00).sqrt() } else { 0.0 };
        if pertes && !drapeau {
            let (_geo, inf) = se::section_de_couche(couches, seg.couche,
                                                    seg.largeur, seg.epaisseur,
                                                    0.0, None,
                                                    &plans_nus, false);
            let inf = if inf.as_objet().is_some() { inf } else { obj! {} };
            // LA TOPOLOGIE ET LA RUGOSITE DE LA COUCHE, pas la hauteur : la
            // ligne de l'agresseur est prise dans son bloc couple, et c'est
            // la hauteur deduite qui rend le courant resserre en regard.
            // Et L'EPAISSEUR DU CUIVRE, que `line_losses` prenait a 35 um.
            let mut opt_p = if inf["topo"].vrai() { se::_geometrie_pertes(&inf, false, true) } else { obj! {} };
            maj(&mut opt_p, se::_rugosite_section(couches, seg.couche, &inf));
            let opt_p = se::options_pertes(&opt_p, seg.epaisseur * 1e-3);
            alpha = alpha_genou(z0_a, eps.first().copied().unwrap_or(0.0),
                                seg.largeur, _nb(&inf["er"], 0.0),
                                _nb(&inf["tan_delta"], 0.0), t_r, Some(&opt_p))?;
        }
        blocs.push(obj! {"s0" => round(a, 4), "s1" => round(b, 4),
                         "voisines" => presents.iter().map(|p| p["net"].clone()).collect::<Vec<Json>>(),
                         "couplage" => coef, "couplage_agresseurs" => coef_agr,
                         "alpha" => alpha, "z0" => round(z0_a, 3),
                         "gardes" => if presents.is_empty() { Vec::new() } else {
                             gardes_bloc.iter().map(|g| g["net"].clone()).collect::<Vec<Json>>() }});
    }

    if !nus_vus.is_empty() {
        notes.push(format!(
            "Plan de référence écarté LOCALEMENT sur au moins un bloc : {} \
             n'a pas de cuivre de retour sous cette portion du parcours, et \
             la section y a donc été résolue sans lui. C'est la géométrie du \
             plan qui entre ici dans [C] et [L], pas seulement l'empilage : \
             deux portions de même dessin mais dont l'une survole une \
             découpe ne rendent plus le même couplage.",
            guillemets(&nus_vus, ", ")));
    }
    if longueur_sans_plan > 0.0 {
        notes.push(format!(
            "Sans plan de référence sur {longueur_sans_plan:.1} mm de longement : la section y a \
             été résolue en ligne coplanaire SANS PLAN — le stratifié entier \
             dans l'air, et la masse arrosée de la même couche (ou les pistes \
             de garde) pour seul retour. La couture n'y est pas exigée : il \
             n'y a pas de plan à coudre. Le vernis n'y est pas modélisé."));
        if pertes {
            notes.push(format!(
                "Pertes au genou non calculées sur ces {longueur_sans_plan:.1} mm : la ligne \
                 coplanaire sans plan n'a pas de modèle de pertes, le \
                 couplage y est donc majoré."));
        }
    }
    for (net, raison) in &ecartes {
        if net == "_section" {
            notes.push(format!("Section droite non résoluble sur au moins un bloc : \
                                {raison}."));
            continue;
        }
        notes.push(format!("« {net} » : {raison}."));
    }
    // sorted(..., key=-longueur) et sorted(..., key=cote) : des tris stables
    etats_gardes.sort_by(|g, h| num(h, "longueur").partial_cmp(&num(g, "longueur")).unwrap_or(std::cmp::Ordering::Equal));
    etats_bords.sort_by(|g, h| txt(g, "cote").cmp(txt(h, "cote")));
    Ok(Infos {
        conducteurs, blocs, abscisses, retards,
        gardes: etats_gardes.iter().map(|g| obj! {
            "net" => &g["net"],
            "longueur" => round(num(g, "longueur"), 3),
            "longueur_flottante" => round(num(g, "longueur_flottante"), 3),
            "couture" => round(num(g, "couture"), 2)}).collect(),
        bords_non_cousus: etats_bords.iter().map(|b0| obj! {
            "cote" => &b0["cote"],
            "longueur" => round(num(b0, "longueur"), 3),
            "couture" => round(num(b0, "couture"), 2)}).collect(),
        couture_max: round(couture_max, 3),
        non_couples: muets.iter().map(|(a0, b0, nets)| obj! {
            "s0" => round(*a0, 3), "s1" => round(*b0, 3),
            "nets" => nets.clone()}).collect(),
        longueur_non_couplee: round(
            py::sum(muets.iter().map(|(a0, b0, _n)| b0 - a0)), 3),
        raison_section: ecartes.iter().find(|(n, _)| n == "_section").map(|(_, r)| r.clone()).unwrap_or_default(),
        longueur_sans_plan: round(longueur_sans_plan, 3),
        longueur: parcours[parcours.len() - 1].s1,
    })
}
