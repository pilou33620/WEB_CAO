//! Ce qui longe la selection, rassemble en sections a resoudre, puis pose conducteur par
//! conducteur.

use super::base::*;
use super::longement::*;
use super::topologie::{_couture, _ecarts};

struct Trouve {
    j_obj: usize,
    net_a: String,
    w_a: f64,
    recouvrement: f64,
    ecart: f64,
    entre_axes: f64,
    cote: i64,
    garde: bool,
    gap_face: f64,
    couture_a: f64,
}

struct Voisin {
    cle: (String, i64),
    net: String,
    longueur: f64,
    ecart_min: f64,
    troncons: i64,
    w: f64,
    axe: f64,
    cotes: std::collections::BTreeSet<i64>,
    face: f64,
    garde: bool,
    couture: f64,
}

struct Scene {
    couche: i64,
    net: String,
    voisins: Vec<Voisin>,
    longueur_victime: f64,
    w: f64,
    g: f64,
    d: f64,
    parts: Vec<Json>,
    parts_v: Vec<Json>,
    couture_g: f64,
    couture_d: f64,
    cote_paire: i64,
    croisements: i64,
    epaisseur: f64,
}

/// Ce qui longe la selection, rassemble en SECTIONS a resoudre.
///
/// UNE SECTION, PAS UNE SUITE DE PAIRES. Une piste avec deux voisines n'est
/// pas deux problemes a deux conducteurs : c'est UN probleme a trois, et les
/// deux voisines se prennent du champ l'une a l'autre autant qu'elles en
/// prennent a la piste du milieu. Les resoudre deux fois separement compterait
/// deux fois le meme champ et surestimerait les deux couplages.
///
/// On rassemble donc, par (couche, net de la selection), tout ce qui longe :
/// chaque net voisin devient un CONDUCTEUR de la section, pose a sa distance
/// reelle et DU BON COTE. La selection est au centre, a x = 0 ; le cote droit
/// est celui que la page appelle « droite ».
///
/// LES ECARTS A LA MASSE SUIVENT. Chaque troncon de la selection porte deja
/// ses deux ecarts au cuivre de masse, mesures par la page -- et les deux
/// outils les mesurent sur les PLANS, sans voir les pistes : `gap_left` est
/// donc la distance de la selection au plan de gauche, MEME quand une piste
/// voisine se trouve entre les deux. C'est exactement ce qu'il faut : le plan
/// borde le GROUPE, et l'ecart du groupe est celui de la selection moins le
/// cuivre qu'on a ajoute de ce cote-la.
///
/// UNE VOISINE DE MASSE N'EST PAS UNE VOISINE, C'EST UNE GARDE. Une piste du
/// net de reference qui longe la selection est le bouclier qu'on pose
/// justement contre le couplage : elle entre dans la section comme un
/// conducteur TENU A ZERO VOLT -- elle occupe la place, elle prend du champ,
/// et elle n'a pas d'impedance differentielle a elle. La prendre pour une
/// voisine ferait afficher une Z differentielle entre un signal et la masse.
///
/// UNE PAIRE QUI SE CROISE EST PRISE EN MIROIR. Deux moities d'une paire
/// echangent souvent leurs cotes en passant par une autre couche, pour suivre
/// le brochage d'un connecteur : P longe N a gauche avant le croisement, a
/// droite apres. Moyennee avec son signe, la position de la partenaire tombait
/// alors sur la selection elle-meme, `_poser_section` l'ecartait comme
/// « chevauchant » -- et la paire la mieux dessinee de la carte ressortait
/// sans aucun couplage. Une section et son miroir ont EXACTEMENT les memes
/// impedances : on retourne donc gauche et droite de chaque troncon ou la
/// partenaire declaree -- ou nommee par ses suffixes, voir `_paire_nommee` --
/// est du cote oppose a celui ou la scene l'a vue d'abord. Ecarts a la masse
/// et couture sont echanges avec elle, sinon le miroir mentirait sur ce qui
/// borde. `croisements` compte les troncons ainsi retournes.
///
/// Rend une liste de scenes, la plus longue d'abord.
pub fn _scenes_paralleles(objets: &[Json], voisinage: &[Json], refs: &Noms, declarees: &[Json]) -> Vec<Json> {
    let mut scenes: Vec<Scene> = Vec::new();
    for (i_obj, victime) in objets.iter().enumerate() {
        let couche = ent(&victime["layer"], 0);
        let net_v = str_ou_vide(&victime["net"]);
        let w_v = nb(&victime["width"]);
        if !(w_v > 0.0) || net_v.is_empty() {
            continue;
        }
        let Some(axe_v) = _axe(victime) else { continue };
        let boite_v = _boite(&axe_v, ECART_COUPLAGE_MAX + w_v / 2.0);
        let (mut gap_g, mut gap_d) = _ecarts(victime);
        let (mut cout_g, mut cout_d) = _couture(victime);
        let mut trouves: Vec<Trouve> = Vec::new();
        for (j_obj, agresseur) in voisinage.iter().enumerate() {
            if ent(&agresseur["layer"], -1) != couche {
                continue;
            }
            let net_a = str_ou_vide(&agresseur["net"]);
            // SANS NET, ON NE GROUPE RIEN : deux troncons anonymes ne se
            // rassemblent pas, et un net face a lui-meme n'est pas un couplage,
            // c'est la meme liaison.
            if net_a.is_empty() || net_a == net_v {
                continue;
            }
            let w_a = nb(&agresseur["width"]);
            if !(w_a > 0.0) {
                continue;
            }
            let Some((recouvrement, entre_axes, cote, sens)) = _longement(victime, agresseur, Some(&axe_v), Some(&boite_v)) else { continue };
            let ecart = entre_axes - (w_v + w_a) / 2.0;
            // Du cuivre qui se touche n'est pas deux lignes ; du cuivre trop
            // loin n'est plus un couplage lisible.
            if !(0.0 < ecart && ecart <= ECART_COUPLAGE_MAX) {
                continue;
            }
            // LA COUTURE D'UNE GARDE EST LA SIENNE, et cousue d'UN SEUL cote
            // suffit a la tenir a zero volt : on garde donc le MEILLEUR des
            // deux, la ou pour la selection on garde le pire de chaque cote.
            let (cg, cd) = _couture(agresseur);
            trouves.push(Trouve { j_obj, garde: refs.contains(&net_a), net_a, w_a, recouvrement, ecart,
                                  entre_axes, cote,
                                  gap_face: _ecart_face(agresseur, cote, sens),
                                  couture_a: if cg > 0.0 && cd > 0.0 { minf(&[cg, cd]) } else { maxf(&[cg, cd]) } });
        }

        if trouves.is_empty() {
            continue;
        }

        let k = match scenes.iter().position(|s| s.couche == couche && s.net == net_v) {
            Some(k) => k,
            None => {
                scenes.push(Scene { couche, net: net_v.clone(), voisins: Vec::new(),
                                    longueur_victime: 0.0, w: 0.0, g: 0.0, d: 0.0,
                                    // CE QUI LONGE, TRONCON PAR TRONCON. La scene MOYENNE les
                                    // ecarts sur toute la longueur -- c'est ce qu'il faut pour
                                    // resoudre UNE section --, et cette moyenne est exactement ce
                                    // qui empeche de dire OU ca couple. `parts` garde le detail
                                    // avant la moyenne : un enregistrement par (troncon de la
                                    // selection, voisine), avec l'ecart LOCAL. C'est de la que
                                    // sort la carte de chaleur.
                                    parts: Vec::new(), parts_v: Vec::new(),
                                    couture_g: 0.0, couture_d: 0.0,
                                    // Le cote ou la partenaire a ete vue en premier, et combien
                                    // de troncons ont du etre retournes pour l'y ramener.
                                    cote_paire: 0, croisements: 0,
                                    epaisseur: _nombre(&victime["copper_thickness"], 0.035) });
                scenes.len() - 1
            }
        };
        let sc = &mut scenes[k];
        // LE MIROIR D'UNE PAIRE QUI SE CROISE -- voir la docstring. La
        // partenaire qui longe le plus ce troncon decide ; la scene retient le
        // premier cote ou elle l'a vue, et tout troncon qui la voit de l'autre
        // cote est retourne, voisines, ecarts et couture compris. `gap_face` ne
        // bouge pas : c'est un ecart propre a la voisine, mesure sur SA face.
        let mut partenaire: Option<&Trouve> = None;
        for t in trouves.iter().filter(|t| !t.garde && _paire_nommee(&net_v, &t.net_a, declarees)) {
            if partenaire.is_none_or(|p| t.recouvrement > p.recouvrement) {
                partenaire = Some(t);
            }
        }
        if let Some(cote_p) = partenaire.map(|t| t.cote) {
            if sc.cote_paire == 0 {
                sc.cote_paire = cote_p;
            } else if cote_p != sc.cote_paire {
                sc.croisements += 1;
                for t in trouves.iter_mut() {
                    t.cote = -t.cote;
                }
                std::mem::swap(&mut gap_g, &mut gap_d);
                std::mem::swap(&mut cout_g, &mut cout_d);
            }
        }
        // LES COTES DE LA SELECTION SONT PONDEREES PAR LA LONGUEUR DES TRONCONS
        // QUI LONGENT, et non par toute la selection : une liaison de cent
        // millimetres dont dix longent une voisine a une section de couplage,
        // et c'est celle de ces dix millimetres-la.
        let long_seg = axe_v.2;
        sc.longueur_victime += long_seg;
        sc.w += w_v * long_seg;
        sc.g += gap_g * long_seg;
        sc.d += gap_d * long_seg;
        // LA COUTURE NE SE MOYENNE PAS : ce qui compte est le PIRE trou. Un
        // cuivre cousu serre sur quatre-vingt-dix pour cent d'un longement et
        // nu sur le reste flotte sur ce reste-la, et c'est lui qui transfere.
        // Une moyenne le dirait tenu.
        sc.couture_g = maxf(&[sc.couture_g, cout_g]);
        sc.couture_d = maxf(&[sc.couture_d, cout_d]);

        for t in trouves {
            // UNE GARDE SE RANGE PAR COTE, PAS PAR NET. Le net de masse est le
            // meme des deux cotes -- c'est un seul net sur toute la carte --, et
            // les moyenner poserait une garde imaginaire au milieu de la piste.
            let cle_v = (t.net_a.clone(), if t.garde { t.cote } else { 0 });
            let kv = match sc.voisins.iter().position(|v| v.cle == cle_v) {
                Some(kv) => kv,
                None => {
                    sc.voisins.push(Voisin { cle: cle_v, net: t.net_a.clone(), longueur: 0.0, ecart_min: t.ecart,
                                             troncons: 0, w: 0.0, axe: 0.0, cotes: Default::default(),
                                             face: 0.0, garde: t.garde, couture: 0.0 });
                    sc.voisins.len() - 1
                }
            };
            let v = &mut sc.voisins[kv];
            v.longueur += t.recouvrement;
            v.troncons += 1;
            v.ecart_min = minf(&[v.ecart_min, t.ecart]);
            v.w += t.w_a * t.recouvrement;
            // L'ECART DE LA VOISINE A LA MASSE, DU BORD QUI NOUS REGARDE, moyen
            // sur ce qui longe : c'est lui qui dit ou finit le cuivre de masse
            // interpose, donc quelle largeur de garde poser.
            v.face += t.gap_face * t.recouvrement;
            v.couture = maxf(&[v.couture, t.couture_a]);
            // LE COTE EST DANS LA POSITION, ET C'EST TOUT L'INTERET. `cote`
            // vaut +1 a gauche du sens de parcours ; on pose donc la voisine en
            // x negatif a gauche et positif a droite, comme la page nomme ses
            // deux ecarts. Une voisine des DEUX cotes -- un net qui encadre la
            // selection -- se moyenne alors vers zero, ce qui n'a pas de sens :
            // `cotes` le retient pour qu'on le dise.
            v.axe += (-t.cote) as f64 * t.entre_axes * t.recouvrement;
            v.cotes.insert(t.cote);
            // UNE GARDE N'A PAS DE BRUIT A ELLE : elle n'entre pas dans la
            // carte de chaleur, pas plus qu'elle n'entre dans la fiche.
            if !t.garde {
                sc.parts.push(obj! {"i" => i_obj, "net" => &t.net_a,
                                    "l" => t.recouvrement, "ecart" => t.ecart,
                                    "w_v" => w_v, "w_a" => t.w_a, "cote" => t.cote});
                // LE MEME LONGEMENT, RANGE PAR LA VOISINE. La question posee a
                // la carte n'est pas « que prend ma piste » mais « QUI est-ce
                // que je derange, et OU » : c'est le cuivre voisin qu'il faut
                // peindre, donc c'est par son rang qu'il faut le retrouver.
                sc.parts_v.push(obj! {"j" => t.j_obj, "net" => &t.net_a,
                                      "l" => t.recouvrement, "ecart" => t.ecart,
                                      "w_v" => w_v, "w_a" => t.w_a, "cote" => t.cote});
            }
        }
    }

    // Le nom a donner a une garde que le modele interpose : le
    // net de masse retenu, quand il y en a un seul.
    let net_masse = if refs.len() == 1 { refs.first().cloned().unwrap_or_default() } else { "masse".to_string() };
    let mut sortie: Vec<(f64, Json)> = Vec::new();
    for sc in scenes {
        let total = sc.longueur_victime;
        if !(total > 0.0) || sc.voisins.is_empty() {
            continue;
        }
        let largeur = sc.w / total;
        let mut voisins: Vec<(f64, Json)> = Vec::new();
        for v in sc.voisins {
            let lv = v.longueur;
            if !(lv > 0.0) {
                continue;
            }
            let (larg_v, x) = (v.w / lv, v.axe / lv);
            voisins.push((x.abs(), obj! {
                "net" => v.net, "longueur" => v.longueur, "ecart_min" => v.ecart_min,
                "troncons" => v.troncons, "garde" => v.garde, "couture" => v.couture,
                "largeur" => larg_v,
                "x" => x,
                "gap_face" => v.face / lv,
                "ecart" => x.abs() - (largeur + larg_v) / 2.0,
                "deux_cotes" => v.cotes.len() > 1,
                "cote" => if x < 0.0 { "gauche" } else { "droite" },
            }));
        }
        // LE PLUS PROCHE D'ABORD : c'est lui qui compte, et c'est lui qu'on
        // garde quand la section est pleine.
        voisins.sort_by(|a, b| a.0.total_cmp(&b.0));
        sortie.push((total, obj! {
            "couche" => sc.couche, "net" => sc.net,
            "voisins" => voisins.into_iter().map(|v| v.1).collect::<Vec<Json>>(),
            "longueur_victime" => total,
            "parts" => sc.parts, "parts_v" => sc.parts_v,
            "net_masse" => &net_masse,
            "couture_g" => sc.couture_g, "couture_d" => sc.couture_d,
            "croisements" => sc.croisements,
            "epaisseur" => sc.epaisseur,
            "largeur" => largeur,
            "gap_g" => sc.g / total,
            "gap_d" => sc.d / total,
        }));
    }
    sortie.sort_by(|a, b| b.0.total_cmp(&a.0));
    sortie.into_iter().map(|s| s.1).collect()
}

// La bande de masse la plus mince qu'on pose encore. En deca, ce n'est plus un
// bouclier : c'est un filet de cuivre entre deux pistes, et l'elargissement de
// Wheeler le ferait de toute facon toucher ses deux voisins.
pub const LARGEUR_GARDE_MIN: f64 = 0.05; // mm

/// La bande de cuivre de MASSE qui separe la selection de cette voisine.
///
/// LE DEFAUT QU'ELLE CORRIGE, ET IL ETAIT GROS. Les deux pages mesurent
/// l'ecart de la selection au cuivre de masse, cote par cote. Quand une
/// voisine se trouve PLUS LOIN que la ou ce cuivre commence, il y a du plan
/// entre les deux -- exactement le cas qu'on cree en routant : une piste de
/// garde, ou un plan arrose cousu de vias, glisse entre un signal rapide et
/// son voisin. Or `_ecarts_masse_du_groupe` place la masse au BORD du groupe :
/// elle passait donc de l'autre cote de la voisine, l'ecart calcule devenait
/// negatif, on le ramenait a zero -- et la section se resolvait comme deux
/// pistes face a face au-dessus du dielectrique nu, SANS la masse qui, sur la
/// carte, faisait tout le travail. Le couplage annonce etait celui d'un
/// routage qu'on n'avait pas fait.
///
/// ON POSE DONC LA BANDE, entre les deux, comme un conducteur a zero volt --
/// le meme mecanisme que la piste de garde, qui existait deja. Elle va du bord
/// ou la masse commence, du cote de la selection, jusqu'au bord ou elle
/// s'arrete, du cote de la voisine :
///
///     de   largeur_selection/2 + ecart_selection
///     a    |x_voisine| - largeur_voisine/2 - ecart_voisine
///
/// LES DEUX ECARTS SONT MESURES quand la page les donne. `gap_face` est celui
/// de la voisine, du bord qui regarde la selection ; a defaut -- une page plus
/// ancienne, ou un cuivre que la sonde n'a pas atteint -- on suppose qu'elle a
/// le meme degagement que la selection, ce qui est la regle d'isolation de la
/// carte et se dit dans les hypotheses.
///
/// Rend (x, w) en millimetres, ou None quand rien ne s'interpose.
pub fn _masse_interposee(scene: &Json, v: &Json) -> Option<(f64, f64)> {
    let a_gauche = num(v, "x") < 0.0;
    let ecart_sel = if a_gauche { num(scene, "gap_g") } else { num(scene, "gap_d") };
    if !(ecart_sel > 0.0) {
        return None; // pas de masse de ce cote-la du tout
    }
    let mut ecart_voisine = _nombre(&v["gap_face"], 0.0);
    if ecart_voisine == 0.0 {
        ecart_voisine = ecart_sel;
    }
    let bord_sel = num(scene, "largeur") / 2.0 + ecart_sel;
    let bord_voisine = num(v, "x").abs() - num(v, "largeur") / 2.0 - ecart_voisine;
    let largeur = bord_voisine - bord_sel;
    if largeur < LARGEUR_GARDE_MIN {
        return None;
    }
    let milieu = (bord_sel + bord_voisine) / 2.0;
    Some((if a_gauche { -milieu } else { milieu }, largeur))
}

/// La scene, ramenee a une liste de conducteurs qui ne se chevauchent pas.
///
/// Rend (conducteurs, ecartes) en MILLIMETRES : le premier element est la
/// SELECTION, a x = 0, suivie des voisines retenues. `ecartes` porte celles
/// qu'on n'a pas pu poser, avec la raison -- et il faut qu'il y en ait une,
/// parce qu'une voisine qui disparait sans un mot se lit comme un couplage
/// nul.
///
/// TROIS RAISONS DE NE PAS POSER UNE VOISINE. La section est pleine -- le
/// solveur s'arrete a `ligne_mom.MAX_CONDUCTEURS`, et au-dela ce n'est plus
/// une section
/// qu'on lit --, ou bien deux voisines se CHEVAUCHENT une fois moyennees :
/// deux nets qui passent tour a tour au meme endroit, chacun sur la moitie de
/// la longueur, se retrouvent a la meme abscisse moyenne, ou il n'y a de place
/// que pour un.
///
/// ET LA TROISIEME EST L'EPAISSEUR DU CUIVRE, qui a longtemps emporte la
/// SECTION ENTIERE. `ligne_mom` elargit chaque ruban de la correction de
/// Wheeler avant de resoudre ; deux voisines separees de trente microns de
/// cuivre nu se rejoignent alors, et `_conducteurs_places` leve -- ce qui
/// faisait perdre les SIX longements de la section pour deux conducteurs qui
/// n'etaient meme pas la selection. On mesure donc ici, AVANT de poser, avec
/// la meme correction que le solveur : la voisine de trop est ecartee, elle
/// le dit, et les autres se calculent.
///
/// `distance_plan` est la hauteur au plan de reference, en MILLIMETRES ; a
/// zero, l'elargissement n'est pas calculable et l'on retombe sur le cuivre
/// nu, comme avant. `ecart_plans` est l'ecart b d'une triplaque en mm (0
/// sinon) : c'est sur lui que `ligne_mom` elargit le cuivre d'une triplaque.
pub fn _poser_section(scene: &Json, distance_plan: f64, couture_max: f64, ecart_plans: f64) -> (Vec<Json>, Vec<Json>) {
    let mut poses = vec![obj! {"net" => &scene["net"], "x" => 0.0, "w" => &scene["largeur"],
                               "selection" => true, "garde" => false}];
    let mut ecartes = Vec::new();
    let ep = _nombre(&scene["epaisseur"], 0.0);
    let h = if distance_plan.is_finite() { distance_plan } else { 0.0 };

    // De combien ce ruban depasse son cuivre, de chaque cote.
    let marge = |w: f64| {
        if !(ep > 0.0) || !(h > 0.0) {
            return 0.0;
        }
        (ligne_mom::largeur_effective(w, ep, h, ecart_plans) - w) / 2.0
    };
    // LE PLAFOND EST CELUI DU SOLVEUR, et il est lu chez lui : deux constantes
    // pour une meme limite finiraient par diverger, et c'est `solve_multiline`
    // qui refuse.
    let plafond = ligne_mom::MAX_CONDUCTEURS;
    // Ce conducteur-la a-t-il la place, cuivre epaissi compris ?
    //
    // Rend (conducteur qui gene, cuivre nu qui les separe), ou None
    // quand la place est libre. UNE SEULE REGLE, ecrite ici : la garde
    // interposee et la voisine se mesurent a la meme aune.
    let gene_par = |poses: &[Json], x: f64, w: f64| -> Option<(String, f64)> {
        for p in poses {
            let nu = (x - num(p, "x")).abs() - (w + num(p, "w")) / 2.0;
            if nu - marge(w) - marge(num(p, "w")) <= 0.0 {
                return Some((str_py(&p["net"]), nu));
            }
        }
        None
    };

    for v in els(&scene["voisins"]) {
        if poses.len() >= plafond {
            ecartes.push(obj! {"net" => &v["net"],
                               "raison" => format!("section pleine ({} conducteurs)", plafond)});
            continue;
        }
        let (vx, vw) = (num(v, "x"), num(v, "largeur"));
        // LA MASSE QUI S'INTERPOSE SE POSE AVANT LA VOISINE QU'ELLE PROTEGE --
        // voir `_masse_interposee`. Elle n'est posee qu'une fois : les voisines
        // sont rangees de la plus proche a la plus lointaine, si bien que la
        // seconde d'un meme cote trouve la place deja prise, et c'est juste --
        // c'est la MEME bande de cuivre qui les protege toutes les deux.
        if !v["garde"].vrai() && poses.len() + 1 < plafond {
            if let Some((gx, gw)) = _masse_interposee(scene, v) {
                // LE CUIVRE EPAIS ELARGIT LA GARDE COMME LE RESTE. On la
                // retrecit donc de ce qu'il ajoutera de chaque cote, plutot que
                // de la poser a sa largeur nue et de decouvrir ensuite qu'elle
                // touche la voisine.
                let gw = maxf(&[LARGEUR_GARDE_MIN, gw - 2.0 * (marge(gw) + marge(vw))]);
                if gene_par(&poses, gx, gw).is_none() {
                    // TENUE OU FLOTTANTE : c'est la couture mesuree de CE
                    // cote-la de la selection qui decide. Un cuivre trop peu
                    // cousu ne blinde pas, il transfere -- voir « LA COUTURE »
                    // plus haut. On garde le trou pour que la fiche le dise.
                    let cle = if gx < 0.0 { "couture_g" } else { "couture_d" };
                    let trou = scene.get(cle).cloned().unwrap_or(Json::Flottant(0.0));
                    let flotte = couture_max > 0.0 && trou.as_f64().unwrap_or(0.0) > couture_max;
                    poses.push(obj! {"net" => if scene["net_masse"].vrai() { scene["net_masse"].clone() } else { "masse".j() },
                                     "x" => gx, "w" => gw,
                                     "selection" => false, "garde" => true,
                                     "interposee" => true,
                                     "flottant" => flotte, "couture" => trou});
                    // ET LA VOISINE DOIT TENIR APRES : perdre le longement pour
                    // avoir pose son bouclier remplacerait une reponse fausse
                    // par une absence de reponse, ce qui n'est pas un progres.
                    if gene_par(&poses, vx, vw).is_some() {
                        poses.pop();
                    }
                }
            }
        }
        if let Some((gene, nu)) = gene_par(&poses, vx, vw) {
            ecartes.push(obj! {"net" => &v["net"],
                               "raison" => if nu <= 0.0 {
                                   format!("chevauche « {} » une fois les\
                                            \x20positions moyennees", gene)
                               } else {
                                   format!("touche « {} » une fois le cuivre epaissi :\
                                            \x20{:.3} mm de cuivre nu, moins que ce que\
                                            \x20l'epaisseur ajoute", gene, nu)
                               }});
            continue;
        }
        poses.push(obj! {"net" => &v["net"], "x" => &v["x"], "w" => &v["largeur"],
                         "selection" => false, "longueur" => &v["longueur"],
                         "ecart" => &v["ecart"], "ecart_min" => &v["ecart_min"],
                         "troncons" => &v["troncons"], "cote" => &v["cote"],
                         "deux_cotes" => &v["deux_cotes"],
                         "garde" => v["garde"].vrai(),
                         // UNE GARDE ROUTEE PORTE SA PROPRE COUTURE, celle qu'on a
                         // mesuree le long d'elle. Une voisine de signal n'est pas
                         // une garde et ne flotte donc jamais : elle a un port.
                         "flottant" => v["garde"].vrai() && couture_max > 0.0
                                       && num(v, "couture") > couture_max,
                         "couture" => _nombre(&v["couture"], 0.0)});
    }
    (poses, ecartes)
}

/// Les deux ecarts au plan coplanaire, pour le GROUPE et non pour la piste.
///
/// C'EST CE QUI MANQUAIT, ET C'EST RECUPERABLE SANS RIEN MESURER DE PLUS.
/// Les deux pages mesurent l'ecart de la selection au cuivre de MASSE, cote
/// par cote, en sondant depuis son bord -- et toutes deux ne voient que les
/// PLANS : une piste voisine ne les arrete pas. `gap_left` est donc la
/// distance de la selection au plan de gauche, y compris quand une voisine se
/// trouve entre les deux.
///
/// Le plan borde donc le GROUPE, et l'ecart du groupe est celui de la
/// selection MOINS le cuivre qu'on a ajoute de ce cote-la :
///
///     ecart_gauche = gap_left - (bord gauche du groupe rapporte a celui de la
///                                selection)
///
/// Negatif ou nul, cela veut dire que le cuivre trouve par la sonde est AU
/// NIVEAU d'une voisine ou en deca : il n'y a pas de plan a portee de ce
/// cote-la, et l'on n'en pose pas. C'est le seul cas ou le calcul reste
/// majorant, et il se dit.
///
/// ET LA COUTURE DECIDE AUSSI DU PLAN EXTERIEUR, pas seulement des gardes
/// posees dans la section. Le solveur pose le cuivre bordant le groupe a ZERO
/// VOLT PARFAIT : c'est vrai d'un plan arrose cousu de vias, c'est faux d'un
/// plan arrose qui n'en porte aucun sur trente millimetres. Le defaut ne
/// sortait alors que sous forme d'avertissement -- les decibels, eux, ne
/// bougeaient pas, et le calcul faisait cadeau d'un blindage que la carte n'a
/// pas. Quand le plus grand trou de couture de ce cote-la depasse
/// `couture_max` (lambda/10 au genou du front, voir `_couture_max`), on
/// ANNULE donc l'effet coplanaire de ce cote : ecart nul veut dire « pas de
/// masse coplanaire ici » pour `ligne_mom`, et la diaphonie calculee remonte
/// d'autant. `couture_max` a zero -- appelant qui ne connait pas le front --
/// laisse le comportement d'avant, et un trou a zero veut dire « non mesure »,
/// donc tenu : voir `_couture`.
pub fn _ecarts_masse_du_groupe(poses: &[Json], scene: &Json, couture_max: f64) -> (f64, f64) {
    let w_v = num(scene, "largeur");
    let x_min = minf(&poses.iter().map(|p| num(p, "x") - num(p, "w") / 2.0).collect::<Vec<_>>());
    let x_max = maxf(&poses.iter().map(|p| num(p, "x") + num(p, "w") / 2.0).collect::<Vec<_>>());
    let ajout_g = (-w_v / 2.0) - x_min;
    let ajout_d = x_max - (w_v / 2.0);
    let mut e_g = num(scene, "gap_g") - ajout_g;
    let mut e_d = num(scene, "gap_d") - ajout_d;
    if couture_max > 0.0 {
        if _nombre(&scene["couture_g"], 0.0) > couture_max {
            e_g = 0.0;
        }
        if _nombre(&scene["couture_d"], 0.0) > couture_max {
            e_d = 0.0;
        }
    }
    (if e_g > 0.0 { e_g } else { 0.0 }, if e_d > 0.0 { e_d } else { 0.0 })
}

/// Les cotes ou l'effet coplanaire a VRAIMENT ete annule faute de vias.
///
/// C'est ce que `_ecarts_masse_du_groupe` vient de faire, dit en clair : un
/// ecart au plan qui tombe a zero se lit sinon comme « pas de plan a portee »,
/// alors qu'il y en a un -- il ne compte simplement pas.
///
/// ON COMPARE AVEC ET SANS LE CRITERE, plutot que de relire la couture toute
/// seule : un bord dont l'ecart etait DEJA nul -- le groupe s'etend au-dela du
/// cuivre que la sonde a trouve -- ne perd rien, et l'annoncer comme une perte
/// ferait compter deux fois un defaut qui ne change aucun chiffre.
pub fn _cotes_non_cousus(poses: &[Json], scene: &Json, couture_max: f64) -> Vec<&'static str> {
    if !(couture_max > 0.0) {
        return Vec::new();
    }
    let (g1, d1) = _ecarts_masse_du_groupe(poses, scene, couture_max);
    let (g0, d0) = _ecarts_masse_du_groupe(poses, scene, 0.0);
    [("gauche", g0, g1), ("droite", d0, d1)].into_iter().filter(|&(_, avant, apres)| avant > 0.0 && !(apres > 0.0)).map(|t| t.0).collect()
}

// UN LONGEMENT TROP COURT N'EST PAS UNE LIGNE, C'EST UN COIN. C'est le seuil
// de longement par defaut de la preselection du crosstalk (`crosstalk.py`), et
// il vit ici parce que c'est ici qu'on decrit une section droite.
//
// LE CRITERE EST GEOMETRIQUE, ET IL LE FAUT : une section droite decrit une
// ligne UNIFORME ; le champ entre deux pistes d'ecart g a la hauteur h se ferme
// sur une echelle transverse de l'ordre de (g + h), et la transition « pas
// couple -> couple » occupe une longueur du meme ordre A CHAQUE BOUT. En deca
// d'environ trois fois cette echelle, il n'y a plus de milieu uniforme a
// decrire : les deux bouts occupent tout.
//
// C'EST UNE CONVENTION DE DOMAINE, comme les 15 degres du parallelisme et les
// 0,2 mm de recouvrement : elle ne se mesure pas avec un solveur qui, par
// construction, ne voit pas la longueur.
pub const LONGEMENT_TRANSVERSE_MIN: f64 = 3.0; // x (ecart + hauteur au plan)

/// Le temps de montee retenu, en secondes.
///
/// IL VIENT DE LA PAGE quand elle le donne. Sinon on le DEDUIT du haut de la
/// bande analysee par la regle du genou -- BW = 0,35 / t_r --, qui est
/// l'equivalence courante entre un front et une bande. Le deduire vaut mieux
/// que de poser une nanoseconde en dur : quelqu'un qui analyse jusqu'a 10 GHz
/// ne travaille pas avec les memes fronts que quelqu'un qui s'arrete a 200 MHz.
pub fn _temps_montee(analyse: &Json) -> (f64, &'static str) {
    let t_r = _nombre(&analyse["temps_montee"], 0.0);
    if t_r > 0.0 {
        return (t_r, "saisi");
    }
    let f_fin = _nombre(&analyse["f_fin"], 0.0);
    if f_fin > 0.0 {
        return (0.35 / f_fin, "deduit de la bande (0,35 / f_max)");
    }
    let fc = _nombre(&analyse["f_centre"], 0.0);
    if fc > 0.0 {
        return (0.35 / fc, "deduit de la frequence de travail (0,35 / fc)");
    }
    (100e-12, "repli")
}

/// Une ligne de fiche : la paire que forment la selection et UNE voisine
/// (`i_a` : le rang de la voisine parmi les ports de la section, `i_v` celui de la selection).
///
/// Z DIFFERENTIELLE DE LA PAIRE, LES AUTRES A LA MASSE. Voir
/// `ligne_mom.sous_systeme` : c'est une reduction exacte, et la seule facon de
/// parler d'une paire prise dans un bus.
pub fn _fiche_longement(scene: &Json, pose: &Json, i_v: usize, i_a: usize, r: &ligne_mom::Multiligne, info: &Json, declarees: &[Json]) -> ligne_mom::Res<Json> {
    let (c_p, l_p) = ligne_mom::sous_systeme(&r.c, &r.c0, &[i_v, i_a])?;
    let paire = ligne_mom::modes_paire(&c_p, &l_p)?;

    Ok(obj! {
        "couche" => &scene["couche"], "net" => &scene["net"],
        "net_voisin" => &pose["net"],
        "longueur" => round(num(pose, "longueur"), 3),
        "ecart" => round(num(pose, "ecart"), 4),
        "ecart_min" => round(num(pose, "ecart_min"), 4),
        "largeur" => round(num(scene, "largeur"), 4),
        "largeur_voisine" => round(num(pose, "w"), 4),
        "cote" => &pose["cote"],
        "troncons" => &pose["troncons"],
        "deux_cotes" => &pose["deux_cotes"],
        "differentielle" => _paire_nommee(&str_ou_vide(&scene["net"]), &str_ou_vide(&pose["net"]), declarees),
        "raison" => "",
        "topo" => &info["topo"],
        "h" => round(1e3 * num(info, "h"), 4),
        "er" => round(num(info, "er"), 3),
        "z_diff" => round(paire.z_diff, 3),
        "z_commune" => round(paire.z_commune, 3),
        "z_impair" => round(paire.z_impair, 3),
        "z_pair" => round(paire.z_pair, 3),
        "eps_eff_impair" => round(paire.eps_eff_impair, 4),
        "eps_eff_pair" => round(paire.eps_eff_pair, 4),
        "c_mutuelle" => paire.c_mutuelle,
        "l_mutuelle" => paire.l_mutuelle,
        // Z0 DE CHAQUE PISTE DANS LA SECTION, les autres a la masse : ce n'est
        // PAS son impedance isolee -- une voisine tenue a zero volt lui prend
        // du champ -- et le panneau doit pouvoir le nommer ainsi.
        "z0" => round(r.lignes[i_v].z0, 3),
        "z0_voisine" => round(r.lignes[i_a].z0, 3),
    })
}
