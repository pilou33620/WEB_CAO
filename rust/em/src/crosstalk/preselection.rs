//! Etape 0a : la preselection geometrique, la fusion par net et le profil d'espacement.

use super::*;
use crate::simulation_em::base::*;
use std::collections::BTreeSet;

// ==========================================================================
// ETAPE 0a -- LA PRESELECTION GEOMETRIQUE
// --------------------------------------------------------------------------
// ON NE DEMANDE QUE L'AGRESSEUR, et c'est le seul geste que l'utilisateur ait
// a faire. Les victimes se cherchent ici, sur la geometrie, et cette etape est
// OBLIGATOIRE : sans elle, il faudrait mettre toute la carte dans le reseau
// multi-ports, et un reseau a deux cents ports ne se resout pas plus qu'il ne
// se lit.
//
// TROIS REGLES, ET ELLES SE REGLENT :
//   · une DISTANCE LATERALE maximale. Le defaut est trois fois le plus grand
//     de la largeur de piste et de la hauteur au plan -- la regle 3W vue des
//     deux cotes. Il MAJORE volontairement : c'est l'etape 0b qui tranche ;
//   · une LONGUEUR DE PARALLELISME minimale, pour ecarter les croisements et
//     les frolements. Le defaut est celui que l'onglet Diaphonie emploie deja
//     (`LONGEMENT_TRANSVERSE_MIN`) : trois fois la somme de l'ecart et de la
//     hauteur au plan, en deca de quoi une section droite ne decrit plus rien ;
//   · les COUCHES ADJACENTES comptent. Deux pistes superposees couplent
//     souvent PLUS que les memes cote a cote, et les ecarter d'office --
//     ce que fait l'appariement de l'onglet Diaphonie, faute de solveur a
//     conducteurs empiles -- ferait lire un couplage nul la ou il est maximal.
//     Elles sont donc CANDIDATES ; ce que le reseau synthetise sait ou ne sait
//     pas en faire est dit a l'etape 0b, pas ici.
// ==========================================================================

// Au-dela de ce saut entre le bout d'un troncon et le plus proche bout du
// suivant, les deux ne se touchent pas : la liste n'est pas dans l'ordre du
// parcours. Un vingtieme de millimetre est en deca de toute tolerance de
// fabrication, et bien au-dela de l'arrondi d'un export.
pub const SAUT_PARCOURS: f64 = 0.05; // mm

/// Un troncon de l'agresseur, avec son abscisse curviligne (un dict de `_parcours`).
#[derive(Debug, Clone)]
pub struct Troncon {
    pub i: usize,
    pub obj: Json,
    pub axe: se::Axe,
    pub corde: f64,
    pub longueur: f64,
    pub s0: f64,
    pub s1: f64,
    pub echelle: f64,
    pub couche: i64,
    pub largeur: f64,
    pub epaisseur: f64,
}

/// L'abscisse curviligne SUPPOSE que les troncons se suivent. On verifie.
///
/// C'EST LE SEUL CONTROLE QUI MANQUAIT, et il porte sur ce dont tout le reste
/// depend : `s` se cumule bout a bout dans l'ordre ou la page envoie les
/// objets, et rien ne verifiait que le bout d'un troncon TOUCHE le debut du
/// suivant. Une liste mal ordonnee -- un tri par couche, un filtre applique
/// apres coup, deux nets concatenes -- donne alors un axe de position FAUX
/// sans que rien ne leve : la carte reste lisse, les pics tombent a des
/// millimetres qui existent, et aucun chiffre ne parait anormal. C'est
/// exactement la classe d'erreur que ce module existe pour empecher, et
/// c'etait la derniere a passer.
///
/// UN TRONCON RETOURNE EST DIT A PART, parce que ce n'est pas le meme defaut
/// ni le meme geste. Les deux bouts se touchent bien -- l'abscisse reste
/// juste --, mais la projection laterale se fait sur une corde parcourue a
/// l'envers : le SIGNE du cote s'inverse, et la voisine de gauche se pose a
/// droite dans la section. Le couplage garde son niveau, la coupe non.
pub fn _verifier_ordre(sortie: &[Troncon], notes: &mut Vec<String>) {
    let (mut sauts, mut retournes) = (Vec::new(), Vec::new());
    for (a, b) in sortie.iter().zip(&sortie[1..]) {
        let ((xa, ya), (ua, va), la) = a.axe;
        let ((xb, yb), (ub, vb), lb) = b.axe;
        let fin = (xa + ua * la, ya + va * la);
        let d_debut = py::hypot(fin.0 - xb, fin.1 - yb);
        let d_fin = py::hypot(fin.0 - (xb + ub * lb), fin.1 - (yb + vb * lb));
        if minf(&[d_debut, d_fin]) > SAUT_PARCOURS {
            sauts.push((a.s1, minf(&[d_debut, d_fin])));
        } else if d_fin < d_debut {
            retournes.push(a.s1);
        }
    }
    if !sauts.is_empty() {
        notes.push(format!(
            "LE CUIVRE ENVOYÉ N'EST PAS CONTIGU : {} rupture(s) entre deux \
             tronçons consécutifs ({}). L'abscisse curviligne se cumule dans \
             l'ORDRE de la liste reçue, et c'est elle qui porte l'axe de la \
             carte : si les tronçons ne se suivent pas, chaque millimètre \
             annoncé après la première rupture désigne un autre endroit du \
             tracé. Rien d'autre ne le signale — la carte reste lisse et les \
             pics tombent à des abscisses qui existent. Vérifiez que la \
             sélection est une liaison d'un seul tenant, et qu'elle est \
             envoyée dans l'ordre du parcours.",
            sauts.len(),
            sauts.iter().take(4).map(|(s, d)| format!("{d:.2} mm de saut à {s:.2} mm")).collect::<Vec<_>>().join(" ; ")));
    }
    if !retournes.is_empty() {
        notes.push(format!(
            "{} tronçon(s) sont parcourus À L'ENVERS (à {}). Les deux bouts se \
             touchent, donc l'abscisse reste juste ; c'est le SIGNE du côté \
             qui s'inverse sur ces tronçons-là, et une voisine de gauche s'y \
             pose à droite dans la section droite. Le niveau de couplage n'en \
             dépend pas, la dissymétrie gauche/droite de la coupe, si.",
            retournes.len(),
            retournes.iter().take(4).map(|s| format!("{s:.2} mm")).collect::<Vec<_>>().join(", ")));
    }
}

/// Les troncons de l'agresseur, avec leur abscisse curviligne cumulee.
///
/// L'ABSCISSE EST CELLE DU CUIVRE, et non celle de la corde. Les projections
/// (`_longement_intervalle`) se font sur la CORDE de chaque troncon -- c'est
/// exact pour une droite, et c'est l'approximation que fait deja tout le
/// reste du module pour un arc. On rapporte donc chaque abscisse projetee au
/// rapport longueur du cuivre / longueur de la corde : la carte se lit alors
/// en millimetres de piste, qui est ce qu'on mesure sur le dessin.
pub fn _parcours(objets: &[Json], notes: Option<&mut Vec<String>>) -> Vec<Troncon> {
    let mut sortie = Vec::new();
    let mut s = 0.0;
    for (i, obj) in objets.iter().enumerate() {
        let Some(axe) = se::_axe(obj) else { continue };
        let corde = axe.2;
        let l = _nb(&obj["length"], 0.0);
        let cuivre = if l != 0.0 { l } else { corde };
        if !(corde > 0.0) {
            continue;
        }
        sortie.push(Troncon { i, obj: obj.clone(), axe, corde,
                              longueur: cuivre, s0: s, s1: s + cuivre,
                              echelle: cuivre / corde,
                              couche: ent(&obj["layer"], 0),
                              largeur: nb(&obj["width"]),
                              epaisseur: _nb(&obj["copper_thickness"], 0.035) });
        s += cuivre;
    }
    if let Some(notes) = notes {
        if sortie.len() > 1 {
            _verifier_ordre(&sortie, notes);
        }
    }
    sortie
}

/// Le seuil de distance laterale, saisi ou deduit. En millimetres.
///
/// SANS HAUTEUR AU PLAN, LE SEUIL NE SE RETRECIT PAS -- IL S'OUVRE. C'est le
/// piege exact de cette deduction : `_hauteur_de_couche` rend ZERO quand la
/// couche n'a pas de plan de reference, et `3 x max(largeur, 0)` tombait
/// alors a trois largeurs de piste -- 0,75 mm pour une piste de 0,25 --,
/// c'est-a-dire au plus SEVERE des seuils possibles, la ou le couplage porte
/// le plus LOIN. Un cuivre sans plan sous lui n'a pas de hauteur de reference
/// qui borne l'etendue de son champ : les voisines a un millimetre, qui sont
/// justement celles qui posent probleme, se faisaient ecarter « au-dela du
/// seuil » sur une carte ou elles couplent des dizaines de decibels de plus
/// qu'ailleurs. On prend donc toute la portee que la page a fournie, et on le
/// DIT -- c'est un seuil qu'on ouvre faute de savoir le poser, pas un seuil
/// qu'on a mesure.
pub fn _seuil_distance(reglages: &Json, largeur: f64, hauteur: f64) -> (f64, String) {
    let saisi = _nb(&reglages["distance_max"], 0.0);
    if saisi > 0.0 {
        return (saisi, "saisi".into());
    }
    if !(hauteur > 0.0) {
        return (se::ECART_COUPLAGE_MAX, format!(
            "porté au maximum du voisinage ({} mm) : cette couche n'a PAS de \
             plan de référence, la hauteur au plan vaut donc zéro et le \
             {} × max(largeur, hauteur) habituel serait tombé à {:.3} mm — le \
             seuil le plus sévère là où le couplage porte le plus loin",
            fmt_g(se::ECART_COUPLAGE_MAX, 6), fmt_g(DISTANCE_AUTO, 6),
            DISTANCE_AUTO * largeur));
    }
    let auto = DISTANCE_AUTO * maxf(&[largeur, hauteur]);
    // LE VOISINAGE ENVOYE PAR LA PAGE EST DEJA BORNE (ECART_COUPLAGE_MAX) :
    // annoncer un seuil plus large que ce qu'on a recu ferait croire qu'on a
    // regarde plus loin qu'on ne l'a fait.
    let auto = minf(&[auto, se::ECART_COUPLAGE_MAX]);
    (auto, format!("déduit ({} × max(largeur {:.3} mm, hauteur {:.3} mm))",
                   fmt_g(DISTANCE_AUTO, 6), largeur, hauteur))
}

/// (d0, d1) : la portion de l'axe `axe` -- (origine, direction, longueur)
/// -- que le troncon `autre` recouvre vu de dessus, en mm depuis l'origine.
/// Rend (0, longueur) si `autre` n'a pas d'axe exploitable.
pub fn _projection_sur(axe: &se::Axe, autre: &Json) -> (f64, f64) {
    let ((ax, ay), (ux, uy), la) = *axe;
    let Some(((bx, by), (vx, vy), lb)) = se::_axe(autre) else { return (0.0, la) };
    let t1 = (bx - ax) * ux + (by - ay) * uy;
    let t2 = (bx + vx * lb - ax) * ux + (by + vy * lb - ay) * uy;
    let (d0, d1) = (maxf(&[0.0, minf(&[t1, t2])]), minf(&[la, maxf(&[t1, t2])]));
    if d1 > d0 { (d0, d1) } else { (0.0, la) }
}

/// Une des deux natures de rencontre d'un candidat (`lat` ou `vert`).
struct Genre {
    longueur: f64,
    distance: Option<f64>,
    troncons: i64,
    blinde: bool,
}

/// Un candidat en cours de mesure : sa fiche, et ce qui en sort avant d'etre rendu.
struct Trouve {
    net: String,
    couche: i64,
    c: Json,
    cotes: BTreeSet<i64>,
    lat: Genre,
    vert: Genre,
}

/// `cote` d'une fiche : « les deux », « gauche », « droite » ou rien.
fn nom_cote(cotes: &[i64]) -> &'static str {
    if cotes.len() > 1 {
        "les deux"
    } else if cotes.is_empty() {
        ""
    } else if cotes[0] > 0 {
        "gauche"
    } else {
        "droite"
    }
}

/// `gap_face` et `couture` d'une fiche, d'apres ses intervalles.
fn face_et_couture(c: &mut Json) {
    let its = els(&c["intervalles"]).to_vec();
    if its.is_empty() {
        return;
    }
    let somme = py::sum(its.iter().map(|i| num(i, "s1") - num(i, "s0")));
    let poids = if somme != 0.0 { somme } else { 1.0 };
    poser(c, "gap_face", py::sum(its.iter().map(|i| num(i, "gap_face") * (num(i, "s1") - num(i, "s0")))) / poids);
    poser(c, "couture", maxf(&its.iter().map(|i| num(i, "couture")).collect::<Vec<_>>()));
}

/// Etape 0a. Rend (candidats, seuils).
///
/// Chaque candidat porte ce qui a ete MESURE -- distance minimale, longueur de
/// parallelisme, cote, couche -- et les INTERVALLES du parcours sur lesquels
/// il longe. Ce sont eux qui decoupent la cascade plus loin : sans les bornes,
/// la carte n'aurait pas d'axe.
pub fn candidats_geometriques(parcours: &[Troncon], voisinage: &[Json], couches: &[Json], reglages: &Json, refs: &Noms,
                              nets_agresseurs: &Noms, paires: &[Json]) -> (Vec<Json>, Json) {
    if parcours.is_empty() {
        return (Vec::new(), obj! {});
    }
    let largeur_ref = maxf(&parcours.iter().map(|p| p.largeur).collect::<Vec<_>>());
    // LA HAUTEUR AU PLAN SE PREND SUR TOUTES LES COUCHES DU PARCOURS, et non
    // sur la seule premiere. Un agresseur qui change de couche change de
    // stratifie -- `_tan_delta` le fait deja pour les pertes --, et lire la
    // hauteur du premier troncon posait le seuil de distance, et surtout
    // l'alerte « aucun plan de reference », sur une couche que la moitie du
    // parcours ne voit jamais.
    //
    // LES DEUX USAGES NE VEULENT PAS LA MEME BORNE, et c'est ce qui rend un
    // `max` global faux. Le seuil de DISTANCE doit MAJORER -- plus la hauteur
    // est grande, plus le champ porte loin, et c'est l'etape 0b qui tranche --,
    // donc il prend la plus grande. La LONGUEUR MINIMALE de longement, elle,
    // ECARTE : la prendre grande rejetterait des longements reels en
    // « frolement », et elle prend donc la plus petite. Une couche SANS plan
    // l'emporte sur tout : elle met les deux a zero -- le seuil s'ouvre au
    // maximum du voisinage, le minimum de longement tombe a trois ecarts -- et
    // elle se fait NOMMER, parce que c'est elle qu'il faut corriger.
    let mut hauteurs: Vec<(i64, f64)> = Vec::new();
    for p in parcours {
        if !hauteurs.iter().any(|(c, _)| *c == p.couche) {
            hauteurs.push((p.couche, se::_hauteur_de_couche(
                couches, p.couche, largeur_ref, p.epaisseur, &[], false, false)));
        }
    }
    let mut sans_plan: Vec<i64> = hauteurs.iter().filter(|(_, h)| !(*h > 0.0)).map(|(c, _)| *c).collect();
    sans_plan.sort();
    let valeurs: Vec<f64> = hauteurs.iter().map(|(_, h)| *h).collect();
    let hauteur = if sans_plan.is_empty() { maxf(&valeurs) } else { 0.0 };
    let hauteur_mini = if sans_plan.is_empty() { minf(&valeurs) } else { 0.0 };
    let (distance_max, source_d) = _seuil_distance(reglages, largeur_ref, hauteur);
    let saisi_l = _nb(&reglages["longueur_min"], 0.0);
    let adjacentes = reglages.get("couches_adjacentes").is_none_or(Json::vrai);
    // ON REGARDE DEUX FOIS PLUS LOIN QUE LE SEUIL, ET ON LE DIT. Le seuil borne
    // ce qu'on SIMULE ; une piste juste au-dela doit quand meme APPARAITRE,
    // avec sa distance, sinon l'utilisateur ne peut pas savoir si le seuil
    // qu'il a choisi est le bon. Une liste ou rien ne figure au-dela du seuil
    // ne se distingue pas d'une carte ou il n'y a rien.
    let portee = 2.0 * distance_max;

    let mut trouves: Vec<Trouve> = Vec::new();
    for seg in parcours {
        let axe = &seg.axe;
        let boite = se::_boite(axe, portee + seg.largeur / 2.0);
        for autre in voisinage {
            let net_a = str_ou_vide(&autre["net"]);
            if net_a.is_empty() || net_a == str_ou_vide(&seg.obj["net"]) {
                continue;
            }
            let w_a = nb(&autre["width"]);
            if !(w_a > 0.0) {
                continue;
            }
            let couche_a = ent(&autre["layer"], -1);
            let vertical = couche_a != seg.couche;
            if vertical && !adjacentes {
                continue;
            }
            let (blinde, recouvrement, ecart);
            let (mut decalage, mut lateral) = (0.0, None);
            if vertical {
                let Some(sup) = se::_superposition(autre, &seg.obj, se::_axe(autre).as_ref(), None) else { continue };
                // LE PLAN QUI SEPARE EST UN ECRAN, et c'est la raison d'etre de
                // l'empilage : deux pistes que separe un plan de reference ne
                // se voient pas. On les compte pour pouvoir dire « on a
                // regarde », et on ne les propose pas comme victimes.
                blinde = !se::_plan_entre(couches, seg.couche, couche_a).is_empty();
                recouvrement = sup.0;
                decalage = sup.1;
                ecart = maxf(&[0.0, decalage - (seg.largeur + w_a) / 2.0]);
                if ecart > portee {
                    continue;
                }
            } else {
                let Some(inter) = se::_longement_intervalle(&seg.obj, autre, Some(axe), Some(&boite)) else { continue };
                blinde = false;
                let (d0, d1, entre_axes, _cote, _sens) = inter;
                ecart = entre_axes - (seg.largeur + w_a) / 2.0;
                if !(0.0 < ecart && ecart <= portee) {
                    continue;
                }
                recouvrement = d1 - d0;
                lateral = Some(inter);
            }

            let k = match trouves.iter().position(|t| t.net == net_a && t.couche == couche_a) {
                Some(k) => k,
                None => {
                    trouves.push(Trouve {
                        net: net_a.clone(), couche: couche_a,
                        c: obj! {
                            "net" => &net_a, "couche" => couche_a,
                            "nom_couche" => se::_nom_de_couche(couches, couche_a),
                            "largeur" => w_a, "intervalles" => Vec::<Json>::new(),
                            "epaisseur" => _nb(&autre["copper_thickness"], 0.035),
                            "gap_face" => 0.0, "couture" => 0.0,
                            // LES SUPERPOSITIONS SANS PLAN ENTRE LES DEUX COUCHES,
                            // avec ce qu'il faut pour les RESOUDRE : la longueur en
                            // regard, le decalage d'axe a axe, les deux couches et
                            // les deux largeurs. Voir `_superposees`.
                            "superpositions" => Vec::<Json>::new(),
                            "role" => if nets_agresseurs.contains(&net_a) { "agresseur" } else { "victime" },
                            // UN NET DE REFERENCE N'EST PAS UNE VICTIME, MAIS IL EST
                            // DANS LA SECTION. C'est une piste de GARDE : elle n'a pas
                            // de port et n'entre pas dans le tableau des victimes, et
                            // elle prend pourtant du champ aux deux -- c'est meme
                            // exactement ce qu'on lui demande en la routant.
                            "garde" => refs.contains(&net_a),
                            "paire" => parcours.iter().any(|p| se::_paire_nommee(&net_a, &str_ou_vide(&p.obj["net"]), paires))},
                        cotes: BTreeSet::new(),
                        // DEUX NATURES DE RENCONTRE, COMPTEES A PART -- et c'est
                        // tout l'objet de cette structure. Un seul jeu de champs,
                        // fige a la PREMIERE rencontre, faisait lire une voisine
                        // qui longe FRANCHEMENT a cote comme une voisine
                        // superposee : il suffisait que l'agresseur ait commence
                        // sur une autre couche. Elle sortait alors « vertical,
                        // 0,000 mm », et surtout « blindée : un plan de référence
                        // sépare les deux couches » -- un longement lateral reel
                        // ECARTE AVEC UN MOTIF FAUX, ce qui est exactement la
                        // classe d'erreur que cette etape existe pour empecher.
                        lat: Genre { longueur: 0.0, distance: None, troncons: 0, blinde: false },
                        vert: Genre { longueur: 0.0, distance: None, troncons: 0, blinde: true },
                    });
                    trouves.len() - 1
                }
            };
            let c = &mut trouves[k];
            let genre = if vertical { &mut c.vert } else { &mut c.lat };
            genre.longueur += recouvrement;
            genre.troncons += 1;
            genre.distance = Some(genre.distance.map_or(ecart, |d| minf(&[d, ecart])));
            if vertical {
                // UN SEUL PASSAGE NON BLINDE SUFFIT A NE PLUS L'ETRE : le
                // blindage est une propriete de CHAQUE superposition, pas une
                // etiquette du couple.
                if !blinde {
                    c.vert.blinde = false;
                    // OU, LE LONG DU PARCOURS : la victime projetee sur
                    // l'axe de ce troncon de l'agresseur, ramenee a
                    // l'abscisse du cuivre comme les intervalles lateraux.
                    let (d0, d1) = _projection_sur(axe, autre);
                    ajouter(dans(&mut c.c, "superpositions"), obj! {
                        "longueur" => round(recouvrement, 4),
                        "decalage" => round(decalage, 4),
                        "couche_agresseur" => seg.couche,
                        "largeur_agresseur" => seg.largeur,
                        "couche_victime" => couche_a, "largeur_victime" => w_a,
                        "s0" => round(seg.s0 + d0 * seg.echelle, 4),
                        "s1" => round(seg.s0 + d1 * seg.echelle, 4)});
                }
            }
            if let Some((d0, d1, entre_axes, cote, sens)) = lateral {
                c.cotes.insert(cote);
                // LA COUTURE D'UNE GARDE EST LA SIENNE, et cousue d'UN SEUL
                // cote suffit a la tenir a zero volt : on garde donc le MEILLEUR
                // des deux, comme `_scenes_paralleles` le fait deja de son cote.
                // Pour une voisine de signal, la couture ne decrit que le cuivre
                // qui la borde, et c'est le PIRE trou qui compte.
                let (cg_a, cd_a) = se::_couture(autre);
                let couture_a = if refs.contains(&net_a) && cg_a > 0.0 && cd_a > 0.0 {
                    minf(&[cg_a, cd_a])
                } else {
                    maxf(&[cg_a, cd_a])
                };
                // L'ENTRE-AXES EST SIGNE : negatif a gauche du sens de marche,
                // positif a droite, comme dans `_scenes_paralleles`. C'est lui
                // qui pose la voisine du BON COTE dans la section.
                ajouter(dans(&mut c.c, "intervalles"), obj! {
                    "s0" => seg.s0 + d0 * seg.echelle,
                    "s1" => seg.s0 + d1 * seg.echelle,
                    "x" => (-cote) as f64 * entre_axes, "ecart" => ecart,
                    "i" => seg.i, "couche" => couche_a, "largeur" => w_a,
                    "gap_face" => se::_ecart_face(autre, cote, sens),
                    "couture" => couture_a});
            }
        }
    }

    let mut candidats = Vec::new();
    for Trouve { mut c, cotes, lat, vert, .. } in trouves {
        // LE LATERAL L'EMPORTE DES QU'IL EXISTE, et la raison est physique :
        // deux pistes sur la MEME couche ne peuvent pas etre separees par un
        // plan de reference, et c'est la seule rencontre que la section droite
        // sache resoudre. Une voisine vue d'abord par-dessous, puis a cote,
        // est une voisine A COTE.
        let (distance, longueur);
        if lat.troncons != 0 {
            poser(&mut c, "type", "latéral");
            distance = lat.distance.unwrap_or(0.0);
            longueur = lat.longueur;
            poser(&mut c, "distance", distance);
            poser(&mut c, "longueur", longueur);
            poser(&mut c, "blinde", false);
        } else {
            poser(&mut c, "type", "vertical");
            distance = vert.distance.unwrap_or(0.0);
            longueur = vert.longueur;
            poser(&mut c, "distance", distance);
            poser(&mut c, "longueur", longueur);
            poser(&mut c, "blinde", vert.blinde);
        }
        let lateral = lat.troncons != 0;
        let blinde = !lateral && vert.blinde;
        poser(&mut c, "troncons", lat.troncons + vert.troncons);
        // CE QUE L'AUTRE NATURE A MESURE N'EST PAS PERDU -- il est rendu a
        // cote. Une voisine qui longe 20 mm a plat PUIS 20 mm superposee est
        // deux situations de dessin, et la fiche doit porter les deux : le
        // reseau, lui, ne couplera que la premiere.
        poser(&mut c, "longueur_laterale", round(lat.longueur, 3));
        poser(&mut c, "longueur_verticale", round(vert.longueur, 3));
        poser(&mut c, "distance_laterale", lat.distance.map(|d| round(d, 4)));
        poser(&mut c, "distance_verticale", vert.distance.map(|d| round(d, 4)));
        poser(&mut c, "blinde_verticalement", vert.troncons != 0 && vert.blinde);
        let cotes: Vec<i64> = cotes.into_iter().collect();
        poser(&mut c, "cotes", cotes.clone());
        poser(&mut c, "deux_cotes", cotes.len() > 1);
        poser(&mut c, "cote", nom_cote(&cotes));
        face_et_couture(&mut c);
        let mini = if saisi_l > 0.0 { saisi_l } else { se::LONGEMENT_TRANSVERSE_MIN * (distance + hauteur_mini) };
        poser(&mut c, "longueur_min", round(mini, 3));
        poser(&mut c, "retenu", true);
        poser(&mut c, "raison", "");
        // UNE GARDE ROUTEE ENTRE DANS LA SECTION, ET ELLE N'Y ENTRAIT PAS.
        // Jusqu'ici un net de reference etait ECARTE ici meme, et il l'etait
        // deux fois : pas de port -- ce qui est juste, une garde n'a pas de
        // bruit a elle --, mais pas de CUIVRE non plus, ce qui est faux. La
        // coupe resolue par le solveur ne voyait donc pas la piste de garde que
        // quelqu'un avait tracee entre l'agresseur et sa victime : le NEXT
        // annonce etait celui d'un routage qu'on n'avait pas fait. Elle est
        // maintenant POSEE -- tenue a zero volt si ses vias sont assez serres,
        // FLOTTANTE sinon, et c'est `simulation_em._poser_section` qui tranche
        // avec le meme critere que partout ailleurs (lambda/10 au genou).
        poser(&mut c, "garde_active", false);
        // L'EGALITE AVEC LE SEUIL EST DEDANS, et deux pour cent au-dessus
        // aussi : voir TOLERANCE_SEUIL. Un couple a S = 3W, c'est-a-dire PILE
        // sur le seuil des 3W, etait ecarte sans chiffre.
        let dedans = distance <= distance_max * (1.0 + TOLERANCE_SEUIL) + 1e-9;
        poser(&mut c, "proche_du_seuil", false);
        if refs.contains(txt(&c, "net")) {
            poser(&mut c, "retenu", false);
            let active = lateral && c["intervalles"].vrai() && dedans;
            poser(&mut c, "garde_active", active);
            let raison = if active {
                "net de référence : garde POSÉE dans la section (elle prend \
                 du champ), sans port — ce n'est pas une victime".to_string()
            } else {
                format!("net de référence : c'est une garde, pas une victime{}{}",
                        if lateral { "" } else {
                            " — et sur une autre couche, la section droite ne sait pas \
                             la poser" },
                        if dedans { String::new() } else {
                            format!(" — et à {distance:.3} mm, au-delà du seuil de {distance_max:.3} mm") })
            };
            poser(&mut c, "raison", raison);
        } else if !dedans {
            poser(&mut c, "retenu", false);
            // A MOINS DE 1,5 x LE SEUIL, ON LE DIT EN TOUTES LETTRES, avec le
            // geste qui chiffre : c'est un couple que l'utilisateur a
            // probablement dessine EXPRES a cette distance-la.
            let proche = distance < PRESELECTION_PROCHE * distance_max;
            poser(&mut c, "proche_du_seuil", proche);
            poser(&mut c, "raison", format!(
                "écartée par la présélection (S = {distance:.3} mm ≥ seuil {distance_max:.3} mm) : \
                 vue mais NON CHIFFRÉE{}",
                if proche {
                    format!(" — à moins de {} × le seuil : ouvrez la « distance max » \
                             (≥ {distance:.2} mm) pour l'avoir au tableau", fmt_g(PRESELECTION_PROCHE, 6))
                } else { String::new() }));
        } else if blinde {
            poser(&mut c, "retenu", false);
            poser(&mut c, "raison", "un plan de référence sépare les deux couches");
        } else if longueur < mini {
            poser(&mut c, "retenu", false);
            poser(&mut c, "raison", format!("longement de {longueur:.2} mm, sous le minimum de {mini:.2} mm \
                                             (croisement ou frôlement)"));
        }
        poser(&mut c, "longueur", round(longueur, 3));
        poser(&mut c, "distance", round(distance, 4));
        candidats.push(c);
    }

    // LE PLUS PROCHE D'ABORD : c'est lui qui compte, et c'est lui qu'on garde
    // quand le reseau est plein.
    candidats.sort_by(|a, b| (!a["retenu"].vrai(), num(a, "distance")).partial_cmp(&(!b["retenu"].vrai(), num(b, "distance"))).unwrap_or(std::cmp::Ordering::Equal));
    let seuils = obj! {
        "distance_max" => round(distance_max, 4), "source" => source_d,
        // L'EGALITE ET DEUX POUR CENT AU-DESSUS SONT RETENUS : la page
        // peut le dire a cote du seuil.
        "tolerance" => TOLERANCE_SEUIL,
        "hauteur" => round(hauteur, 4),
        "hauteur_min" => round(hauteur_mini, 4),
        // LES COUCHES DU PARCOURS QUI N'ONT PAS DE PLAN, NOMMEES. C'est
        // le renseignement qui manquait : « hauteur = 0 » ne dit pas
        // laquelle des trois couches parcourues est en cause.
        "couches_sans_plan" => sans_plan.iter().map(|&c| nom_ou_rang(couches, c)).collect::<Vec<_>>(),
        "couches_parcourues" => hauteurs.len(),
        "longueur_min_source" => if saisi_l > 0.0 { "saisi".to_string() } else {
            format!("déduit ({} × (écart + {:.3} mm de hauteur au plan))",
                    fmt_g(se::LONGEMENT_TRANSVERSE_MIN, 6), hauteur_mini) },
        "couches_adjacentes" => adjacentes};
    (candidats, seuils)
}

/// `se._nom_de_couche(couches, c) or ("couche %d" % c)`
pub(crate) fn nom_ou_rang(couches: &[Json], c: i64) -> String {
    let nom = se::_nom_de_couche(couches, c);
    if nom.is_empty() { format!("couche {c}") } else { nom }
}

// ==========================================================================
// ETAPE 0a, SUITE -- UN NET EST UN CONDUCTEUR, MEME QUAND IL LONGE SUR DEUX
// COUCHES
// --------------------------------------------------------------------------
// LA PRESELECTION RANGE PAR (NET, COUCHE), LE RESEAU PAR NET. Chacun a raison
// de son cote, et c'est leur rencontre qui produisait le pire resultat que ce
// module puisse rendre.
//
// LE TABLEAU doit distinguer les couches : une voisine qui longe a plat sur
// Top puis repasse SOUS l'agresseur sur In1 est DEUX situations de dessin,
// mesurees a deux distances, et les fondre effacerait justement ce qu'on veut
// lire. LE RESEAU, lui, n'a pas ce choix : un net est un NOEUD ELECTRIQUE. Lui
// donner deux paires de ports revient a poser deux conducteurs distincts la ou
// il n'y a qu'un fil -- ce qui est faux en soi --, et toute la chaine en aval
// indexe par le NOM du net : `par_net` dans `_matrices_bloc`, `_profils`,
// `profils_espacement`, `_fiche_candidat`, les lignes de la carte, les noms de
// ports, les cases a cocher de la page.
//
// CE QUE CELA DONNAIT, MESURE SUR UN CAS A DEUX CANDIDATS HOMONYMES. Le
// dictionnaire `par_net` ecrasait le doublon ; les rangees de [C] et [L] du
// longement LATERAL etaient attribuees au conducteur VERTICAL ; la victime qui
// couple reellement a 0,15 mm ressortait a -300 dB et « non confirmee », tandis
// que l'autre ligne -- celle que l'avertissement annonce comme « non modelisee,
// elle ressortira au plancher » -- portait les -10,6 dB. Deux chiffres
// parfaitement credibles, sur le mauvais cuivre, dans les deux sens, et
// `_fiche_candidat` rendant la PREMIERE fiche du nom, les deux lignes
// s'affichaient avec la meme distance et la meme couche -- dont une au moins
// etait fausse. Le doublon mangeait en plus une des cinq places de `MAX_VICTIMES`.
//
// ON FUSIONNE DONC PAR NET AVANT DE CONSTRUIRE LE RESEAU, et le tableau garde
// ses lignes par couche. La fiche fusionnee porte l'UNION des intervalles --
// c'est elle qui decoupe la cascade, donc le couplage se fabrique bien aux deux
// endroits --, et les deux natures restent comptees a part : l'avertissement
// « longe aussi tant de millimetres en superposition, non modelisee » tombe
// desormais sur la ligne qui porte le chiffre, au lieu d'un doublon muet.
// ==========================================================================

/// `c.get("nom_couche") or ("couche %d" % c["couche"])`
fn couche_de_fiche(c: &Json) -> String {
    if c["nom_couche"].vrai() { str_py(&c["nom_couche"]) } else { format!("couche {}", c["couche"].as_i64().unwrap_or(0)) }
}

/// Un candidat par NET, l'union de ce que chaque couche a mesure.
///
/// Rend la liste fusionnee, triee par distance. Chaque fiche porte
/// `_sources`, les candidats d'origine : le plafond `MAX_VICTIMES` doit
/// pouvoir les ecarter DANS LE TABLEAU, qui est la seule chose qu'on lit.
/// Cette clef ne sort jamais du module -- rien de ce qui est serialise ne la
/// traverse.
///
/// Ici, `_sources` n'est pas une clef de la fiche : chaque fiche est rendue avec les indices
/// de ses candidats d'origine dans `candidats`. `choisis` dit lesquels fusionner.
pub fn _fusionner_nets(candidats: &[Json], choisis: &[usize], notes: &mut Vec<String>, garde: bool) -> Vec<(Json, Vec<usize>)> {
    let mut par_net: Vec<(String, Vec<usize>)> = Vec::new();
    for &k in choisis {
        let net = str_py(&candidats[k]["net"]);
        match par_net.iter_mut().find(|(n, _)| *n == net) {
            Some((_, g)) => g.push(k),
            None => par_net.push((net, vec![k])),
        }
    }
    let (mut sortie, mut fusionnes) = (Vec::new(), Vec::new());
    for (net, indices) in par_net {
        let groupe: Vec<&Json> = indices.iter().map(|&k| &candidats[k]).collect();
        if groupe.len() == 1 {
            let mut c = groupe[0].clone();
            poser(&mut c, "couches", vec![couche_de_fiche(groupe[0])]);
            sortie.push((c, indices));
            continue;
        }
        // LA COUCHE QUI COMPTE EST CELLE QUE LA SECTION RESOUT : celle du plus
        // long longement LATERAL. Sans elle, le conducteur serait pose en ligne
        // seule avec la largeur et l'epaisseur d'une portion que le solveur ne
        // voit jamais. A defaut de lateral, la plus proche.
        let cle = |c: &Json| (nb(&c["longueur_laterale"]), -nb(&c["distance"]));
        let mut principal = groupe[0];
        for c in &groupe[1..] {
            if cle(c) > cle(principal) {
                principal = c;
            }
        }
        let mut c = principal.clone();
        let lat = py::sum(groupe.iter().map(|s| nb(&s["longueur_laterale"])));
        let vert = py::sum(groupe.iter().map(|s| nb(&s["longueur_verticale"])));
        let d_lat: Vec<f64> = groupe.iter().filter(|s| !nul(&s["distance_laterale"])).map(|s| num(s, "distance_laterale")).collect();
        let d_vert: Vec<f64> = groupe.iter().filter(|s| !nul(&s["distance_verticale"])).map(|s| num(s, "distance_verticale")).collect();
        poser(&mut c, "intervalles", groupe.iter().flat_map(|s| els(&s["intervalles"]).iter().cloned()).collect::<Vec<Json>>());
        poser(&mut c, "superpositions", groupe.iter().flat_map(|s| els(&s["superpositions"]).iter().cloned()).collect::<Vec<Json>>());
        poser(&mut c, "longueur_laterale", round(lat, 3));
        poser(&mut c, "longueur_verticale", round(vert, 3));
        let d_lat = if d_lat.is_empty() { None } else { Some(minf(&d_lat)) };
        let d_vert = if d_vert.is_empty() { None } else { Some(minf(&d_vert)) };
        poser(&mut c, "distance_laterale", d_lat);
        poser(&mut c, "distance_verticale", d_vert);
        poser(&mut c, "type", if lat > 0.0 { "latéral" } else { "vertical" });
        // LA LONGUEUR RENDUE EST CELLE DU LONGEMENT QUI COMPTE, comme pour un
        // candidat simple : le lateral des qu'il existe, sans quoi
        // `bande_deduite` prendrait pour « plus court longement » une portion
        // que le reseau ne couple pas.
        poser(&mut c, "longueur", round(if lat > 0.0 { lat } else { vert }, 3));
        if lat > 0.0 {
            poser(&mut c, "distance", d_lat);
        } else {
            poser(&mut c, "distance", d_vert.filter(|d| *d != 0.0).unwrap_or(0.0));
        }
        poser(&mut c, "troncons", groupe.iter().map(|s| if s["troncons"].vrai() { ent(&s["troncons"], 0) } else { 0 }).sum::<i64>());
        poser(&mut c, "blinde", lat <= 0.0 && groupe.iter().all(|s| s["blinde"].vrai()));
        poser(&mut c, "blinde_verticalement",
              vert > 0.0 && groupe.iter().filter(|s| nb(&s["longueur_verticale"]) > 0.0).all(|s| s["blinde_verticalement"].vrai()));
        let cotes: Vec<i64> = groupe.iter().flat_map(|s| els(&s["cotes"]).iter().filter_map(Json::as_i64)).collect::<BTreeSet<i64>>().into_iter().collect();
        poser(&mut c, "cotes", cotes.clone());
        poser(&mut c, "deux_cotes", cotes.len() > 1);
        poser(&mut c, "cote", nom_cote(&cotes));
        face_et_couture(&mut c);
        poser(&mut c, "longueur_min", minf(&groupe.iter().map(|s| nb(&s["longueur_min"])).collect::<Vec<_>>()));
        let couches: Vec<String> = groupe.iter().map(|s| couche_de_fiche(s)).collect();
        poser(&mut c, "couches", couches.clone());
        poser(&mut c, "retenu", true);
        poser(&mut c, "raison", "");
        sortie.push((c, indices));
        fusionnes.push(format!("« {} » ({})", net, couches.join(", ")));
    }
    sortie.sort_by(|a, b| nb(&a.0["distance"]).partial_cmp(&nb(&b.0["distance"])).unwrap_or(std::cmp::Ordering::Equal));
    if !fusionnes.is_empty() {
        // UNE GARDE N'EST PAS UN CONDUCTEUR DU RESEAU -- elle n'a pas de port --,
        // et lui appliquer la phrase des victimes ferait chercher une paire de
        // ports qui n'existe pas. Le geste est le meme, la raison non.
        let lesquels = fusionnes.join(" ; ");
        notes.push(if garde {
            format!("Une garde longe sur plusieurs couches, et reste UN seul cuivre : \
                     {lesquels}. Les lignes du tableau restent séparées par couche ; la \
                     section droite, elle, ne la pose qu'une fois par côté — une \
                     garde comptée deux fois blinderait sur le papier ce qu'un seul \
                     cuivre tient.")
        } else {
            format!("Une victime longe sur plusieurs couches, et n'est qu'UN \
                     conducteur : {lesquels}. Les lignes du tableau « ce qui longe » restent \
                     SÉPARÉES par couche — ce sont deux situations de dessin, \
                     mesurées à deux distances —, mais le calcul ne pose qu'un seul \
                     conducteur par net : deux conducteurs sur le même nœud \
                     électrique, et le couplage de l'un des deux longements se \
                     lirait sur l'autre. La fiche chiffrée porte l'UNION des \
                     longements, à plat et superposés.")
        });
    }
    sortie
}

// ==========================================================================
// ETAPE 0a, SUITE -- LE PROFIL D'ESPACEMENT, ET POURQUOI IL VAUT MIEUX
// QU'UNE DISTANCE
// --------------------------------------------------------------------------
// UNE DISTANCE UNIQUE NE DECRIT PAS UN LONGEMENT. Deux pistes qui longent sur
// quarante millimetres ne restent pas a la meme distance : l'une contourne un
// composant, l'autre suit un coude, et l'ecart passe de 0,15 a 0,6 mm et
// revient. La distance MINIMALE dit ce qui est le pire ; elle ne dit pas OU.
//
// LE PROFIL EST DONC UNE FONCTION DE L'ABSCISSE, echantillonnee sur le MEME
// axe que la carte de couplage -- et c'est tout l'interet : les deux courbes
// se superposent, et chaque pic de couplage se recoupe avec le resserrement
// qui devrait l'expliquer. Sans cette superposition, une courbe de couplage
// est invérifiable : elle est plausible quoi qu'il arrive.
//
// CE QU'IL VAUT, ET IL FAUT LE DIRE. Le profil est CONSTANT PAR MORCEAUX --
// un morceau par troncon d'agresseur et par voisine --, parce que l'ecart est
// mesure une fois par couple de troncons, au milieu de leur projection commune
// (`_longement_intervalle`). Sur un arc decoupe en un seul troncon, le profil
// rend donc l'ecart MOYEN de l'arc et non son minimum local. C'est la finesse
// du dessin qui fixe celle du profil, et l'abscisse, elle, suit le CUIVRE :
// les arcs sont rapportes a leur longueur developpee, pas a leur corde.
//
// LA OU LA VOISINE NE LONGE PAS, IL N'Y A PAS D'ESPACEMENT -- et surtout pas
// zero, qui se lirait comme un contact. On rend None, la carte laisse un trou,
// et c'est exactement ce qu'il faut voir : un pic de couplage dans un trou du
// profil ne vient pas du dessin des pistes.
// ==========================================================================

/// L'ecart agresseur <-> candidat le long de l'axe, en mm (None = absent).
///
/// Quand deux longements se recouvrent -- une voisine qui passe des deux
/// cotes --, on garde le PLUS PETIT : c'est celui qui couple.
pub fn profil_espacement(candidat: &Json, axe: &[f64]) -> Vec<Json> {
    let intervalles = els(&candidat["intervalles"]);
    axe.iter().map(|&s| {
        let mut meilleur: Option<f64> = None;
        for it in intervalles {
            if num(it, "s0") - TOL_BORNE <= s && s <= num(it, "s1") + TOL_BORNE {
                let e = num(it, "ecart");
                meilleur = Some(meilleur.map_or(e, |m| minf(&[m, e])));
            }
        }
        meilleur.map(|m| round(m, 4)).j()
    }).collect()
}

/// {net: fiche} pour tous les candidats qui en ont un.
///
/// La fiche porte les valeurs, la COUVERTURE (la fraction du parcours ou la
/// voisine longe) et les statistiques dont le recoupement a besoin. Un
/// candidat de couche adjacente n'en a PAS : la superposition se mesure en
/// longueur, jamais en abscisse -- on ne saurait pas OU la poser, et une
/// position inventee serait pire que pas de profil du tout.
pub fn profils_espacement(candidats: &[Json], axe: &[f64], notes: &mut Vec<String>) -> Json {
    let mut sortie = obj! {};
    let mut sans = Vec::new();
    for c in candidats {
        if !c["intervalles"].vrai() {
            if c["retenu"].vrai() {
                sans.push(str_py(&c["net"]));
            }
            continue;
        }
        let valeurs = profil_espacement(c, axe);
        let mut vus: Vec<f64> = valeurs.iter().filter_map(Json::as_f64).collect();
        if vus.is_empty() {
            continue;
        }
        let n_vus = vus.len();
        vus.sort_by(f64::total_cmp);
        poser(&mut sortie, &str_py(&c["net"]), obj! {
            "valeurs" => valeurs,
            "couverture" => round(n_vus as f64 / axe.len().max(1) as f64, 4),
            "min" => round(vus[0], 4),
            "max" => round(vus[n_vus - 1], 4),
            "median" => round(vus[n_vus / 2], 4)});
    }
    if !sans.is_empty() {
        notes.push(format!("Pas de profil d'espacement pour {} : {} sur une couche \
                            adjacente, dont le recouvrement se mesure en longueur \
                            et non en abscisse. La distance mesurée reste au \
                            tableau ; c'est la COURBE qui manque, et avec elle le \
                            recoupement entre le pic de couplage et le \
                            resserrement qui l'expliquerait.",
                           guillemets(&sans, ", "),
                           if sans.len() == 1 { "elle est" } else { "elles sont" }));
    }
    sortie
}
