//! Z differentielle de tout ce qui longe la selection.

use super::base::*;
use super::chaleur::*;
use super::longement::*;
use super::scenes::*;
use super::section::{geometrie, section_de_couche};
use super::topologie::_couture_max;
use ligne_mom as tl;
use std::collections::HashMap;

/// Z differentielle de tout ce qui longe la selection.
///
/// UNE SECTION PAR SCENE, ET UNE SCENE PAR (COUCHE, NET SELECTIONNE). Toutes
/// les voisines d'une meme piste entrent dans la MEME matrice : une piste avec
/// deux voisines est un probleme a trois conducteurs, pas deux problemes a
/// deux. De cette matrice sort, pour chaque voisine, la Z differentielle de la
/// paire -- sans rien resoudre de plus.
///
/// LE COUPLAGE, LUI, EST AILLEURS : c'est `crosstalk.py` qui le chiffre, sur
/// une matrice S multi-ports mise en cascade le long du parcours, et qui dit
/// OU il se fabrique. Cette page-ci ne repond qu'en ohms.
///
/// LA MASSE COPLANAIRE Y EST. Voir `_ecarts_masse_du_groupe` : les ecarts
/// mesures par la page bordent le groupe, parce que les deux outils sondent
/// les PLANS sans voir les pistes. Un plan a portee reduit le couplage, et le
/// calcul le rend maintenant au lieu de le majorer.
pub fn _couplage(couches: &[Json], objets: &[Json], doc: &Json, analyse: &Json, avertissements: &mut Vec<String>) -> Json {
    // LA SELECTION EST DEJA PARTAGEE QUAND ELLE ARRIVE ICI. `simuler` separe la
    // piste principale de sa partenaire AVANT d'appeler cette fonction -- voir
    // `_partager_paire` --, si bien que `objets` ne porte plus qu'un seul net et
    // que `voisinage` a recu l'autre moitie. Refaire le partage ici ne trouverait
    // donc jamais rien, et le faire DEUX FOIS a deux endroits est le genre de
    // doublon qui finit par diverger en silence.
    let mut voisinage = els(&doc["voisinage"]);
    let declarees = els(&doc["paires"]);
    if voisinage.len() > MAX_VOISINAGE {
        voisinage = &voisinage[..MAX_VOISINAGE];
        avertissements.push(format!(
            "Voisinage tronqué à {} tronçons : le couplage n'est chiffré que\
             \x20sur les plus proches.", MAX_VOISINAGE));
    }
    let refs: Noms = els(&doc["reference_nets"]).iter().map(str_py).filter(|x| !py::strip(x).is_empty()).collect();
    let scenes = _scenes_paralleles(objets, voisinage, &refs, declarees);
    // CE QUI PASSE AU-DESSUS, VU MAIS NON CHIFFRE. `_scenes_paralleles` ecarte
    // les autres couches des sa premiere ligne, parce que la section droite ne
    // sait pas les decrire ; ici on les REGARDE quand meme, pour que le silence
    // ne se lise pas comme un couplage nul.
    let (superposes, superposes_blindes) = _superposes(objets, voisinage, couches);
    let (t_r, source_tr) = _temps_montee(analyse);

    let (mut paires, mut sections): (Vec<Json>, Vec<Json>) = (Vec::new(), Vec::new());
    let mut cache: HashMap<String, Result<(tl::Multiligne, Json), Json>> = HashMap::new();
    // LA CARTE DE CHALEUR EST ALIGNEE SUR `geometry.objects`, comme les
    // segments : c'est par ce rang que la page retrouve le cuivre a peindre.
    // `None` veut dire « ce troncon ne longe rien », et se peint en gris.
    let mut chaleur = vec![Json::Nul; objets.len()];
    let mut cache_local = CacheLocal::new();
    for scene in scenes.iter().take(MAX_SECTIONS) {
        let couche = scene["couche"].as_i64().unwrap_or(0);
        let (largeur, epaisseur) = (num(scene, "largeur"), num(scene, "epaisseur"));
        // LA HAUTEUR AU PLAN, AVANT DE POSER : `_poser_section` en a besoin
        // pour savoir de combien le cuivre epais elargit chaque ruban, et donc
        // pour ecarter la voisine de trop AU LIEU de perdre la section entiere.
        let h_couche = _hauteur_de_couche(couches, couche, largeur, epaisseur, &[], false, false);
        let b_couche = _hauteur_de_couche(couches, couche, largeur, epaisseur, &[], false, true);
        let (poses, ecartes) = _poser_section(scene, h_couche, _couture_max(t_r), b_couche);
        let (e_g, e_d) = _ecarts_masse_du_groupe(&poses, scene, _couture_max(t_r));
        // LES COTES OU LE PLAN BORDE SANS ETRE COUSU : l'ecart y a ete annule,
        // et un zero ne se distingue pas tout seul d'un « pas de plan a
        // portee ». Voir `_ecarts_masse_du_groupe`.
        let nus = _cotes_non_cousus(&poses, scene, _couture_max(t_r));
        // LA CONDITION AUX LIMITES DE CHAQUE RUBAN EST DANS LA CLEF. Deux
        // scenes de meme dessin dont l'une porte une garde tenue et l'autre la
        // meme garde FLOTTANTE se seraient partage le meme resultat -- et c'est
        // justement ce que cette page cherche a distinguer.
        let cle = format!("{:?}", (couche, round(epaisseur, 6) + 0.0,
                                   round(e_g, 6) + 0.0, round(e_d, 6) + 0.0,
                                   poses.iter().map(|p| (round(num(p, "x"), 6) + 0.0, round(num(p, "w"), 6) + 0.0, p["garde"].vrai(),
                                                         p["flottant"].vrai())).collect::<Vec<_>>()));
        if !cache.contains_key(&cle) {
            let (geo, info) = section_de_couche(couches, couche, largeur, epaisseur, e_g, Some(e_d), &[], false);
            let v = match geo {
                None => Err(info),
                Some(mut geo) => {
                    // UNE GARDE NON COUSUE N'EST PAS A ZERO VOLT : elle est
                    // FLOTTANTE, et c'est l'inverse comme condition aux
                    // limites. `ligne_mom` sait poser les deux.
                    poser(&mut geo, "conducteurs", poses.iter().map(|p| obj! {
                        "w" => num(p, "w") * 1e-3, "x" => num(p, "x") * 1e-3,
                        "masse" => p["garde"].vrai() && !p["flottant"].vrai(),
                        "flottant" => p["flottant"].vrai()}).collect::<Vec<Json>>());
                    match tl::solve_multiline(&geometrie(&geo)) {
                        Err(exc) => Err(exc.0.j()),
                        Ok(r) => Ok((r, info)),
                    }
                }
            };
            cache.insert(cle.clone(), v);
        }
        let c = &cache[&cle];

        let mut fiche_section = obj! {
            "couche" => couche, "net" => &scene["net"],
            "conducteurs" => poses.iter().map(|p| obj! {
                "net" => &p["net"], "x" => round(num(p, "x"), 4),
                "largeur" => round(num(p, "w"), 4),
                "selection" => &p["selection"],
                "garde" => &p["garde"],
                // UNE GARDE POSEE PAR LE MODELE N'EST PAS UNE
                // PISTE QUE QUELQU'UN A ROUTEE : la premiere est
                // deduite de deux ecarts mesures, la seconde est
                // dans le fichier. La fiche doit pouvoir le dire.
                "interposee" => p["interposee"].vrai(),
                // TENUE OU FLOTTANTE : c'est ce qui distingue un
                // bouclier d'un pont, et cela doit se lire dans la
                // coupe -- les deux se dessinent pareil.
                "flottant" => p["flottant"].vrai(),
                "couture" => round(_nombre(&p["couture"], 0.0), 2)}).collect::<Vec<Json>>(),
            "gardes" => poses.iter().filter(|p| p["garde"].vrai()).count(),
            "ecart_g" => round(e_g, 4), "ecart_d" => round(e_d, 4),
            "gap_g" => round(num(scene, "gap_g"), 4),
            "gap_d" => round(num(scene, "gap_d"), 4),
            // LE PLAN EST LA, MAIS IL N'EST PAS COUSU. L'ecart de ce cote-la a
            // ete mis a zero : sans cette clef, la coupe montrerait « pas de
            // masse coplanaire » la ou il y en a une qui ne tient pas.
            "masse_non_cousue" => nus,
            "couture_g" => round(_nombre(&scene["couture_g"], 0.0), 2),
            "couture_d" => round(_nombre(&scene["couture_d"], 0.0), 2),
            // LES TRONCONS PRIS EN MIROIR, parce que la paire s'y croise : voir
            // `_scenes_paralleles`. Zero pour une paire qui garde ses cotes.
            "croisements" => scene.get("croisements").cloned().unwrap_or(Json::Entier(0)),
            "ecartes" => ecartes,
            "raison" => match c { Ok(_) => "".j(), Err(r) => r.clone() },
        };
        let mut refus: Option<Json> = None;
        match c {
            Ok((r, info)) => {
                // LE RANG DE CHAQUE CONDUCTEUR DANS [C]. `solve_multiline` range
                // les rubans de gauche a droite ; `ordre` rend le numero d'entree
                // de chaque port, et l'on inverse. Lire [C] dans l'ordre d'entree
                // donnerait la Z differentielle de la mauvaise paire, en
                // silence.
                // LES GARDES N'ONT PAS DE LIGNE DANS [C] : `ordre` ne porte que
                // les PORTS. Le dictionnaire ne contient donc que les conducteurs
                // qu'on peut interroger, et une garde interrogee par megarde leve
                // au lieu de rendre le voisin d'a cote.
                let rang = |entree: usize| r.ordre.iter().position(|&e| e == entree).unwrap_or(0);
                maj(&mut fiche_section, obj! {
                    "topo" => &info["topo"],
                    "h" => round(1e3 * num(info, "h"), 4),
                    "er" => round(num(info, "er"), 3),
                    "z0_selection" => round(r.lignes[rang(0)].z0, 3),
                });
                let mut fiches: Vec<Json> = Vec::new();
                for (k, pose) in poses.iter().enumerate().skip(1) {
                    if pose["garde"].vrai() {
                        continue;
                    }
                    match _fiche_longement(scene, pose, rang(0), rang(k), r, info, declarees) {
                        Ok(mut f) => {
                            // LE NOM DE LA COUCHE, et pas seulement son rang : un numero
                            // ne se retrouve pas sur un plan de fabrication.
                            poser(&mut f, "nom_couche", _nom_de_couche(couches, couche));
                            paires.push(f.clone());
                            match fiches.iter_mut().find(|g| g["net_voisin"] == f["net_voisin"]) {
                                Some(g) => *g = f,
                                None => fiches.push(f),
                            }
                        }
                        // shortcut: Python laissait remonter ce ValueError (500) ; ici la
                        // section le porte comme son refus, les paires deja lues restent.
                        Err(e) => {
                            refus = Some(e.0.j());
                            break;
                        }
                    }
                }
                // LA Z DIFFERENTIELLE TRONCON PAR TRONCON. Voir « LA CARTE DE
                // CHALEUR » : le chiffre du tableau est obtenu sur l'ecart MOYEN,
                // la carte reprend chaque troncon a SON ecart.
                if !fiches.is_empty() {
                    _chaleur_scene(couches, scene, &fiches, t_r, &mut chaleur, &mut cache_local);
                }
            }
            Err(raison) => {
                for pose in poses.iter().skip(1) {
                    if pose["garde"].vrai() {
                        continue;
                    }
                    paires.push(obj! {
                        "couche" => couche, "net" => &scene["net"],
                        "net_voisin" => &pose["net"],
                        "longueur" => round(num(pose, "longueur"), 3),
                        "ecart" => round(num(pose, "ecart"), 4),
                        "ecart_min" => round(num(pose, "ecart_min"), 4),
                        "largeur" => round(largeur, 4),
                        "largeur_voisine" => round(num(pose, "w"), 4),
                        "cote" => &pose["cote"], "troncons" => &pose["troncons"],
                        "deux_cotes" => &pose["deux_cotes"],
                        "differentielle" => _paire_nommee(&str_ou_vide(&scene["net"]), &str_ou_vide(&pose["net"]), declarees),
                        "raison" => raison,
                    });
                }
            }
        }
        if let Some(r) = refus {
            poser(&mut fiche_section, "raison", r);
        }
        sections.push(fiche_section);
    }

    // LE PLUS SERRE D'ABORD. Trie par longueur, la fiche mettrait en tete un
    // longement long et lache devant un court et serre ; c'est l'ECART qui
    // ordonne, parce que c'est lui qui fait la Z differentielle.
    paires.sort_by(|f, g| _nombre(&f["ecart"], 1e9).total_cmp(&_nombre(&g["ecart"], 1e9)));

    // LE CUIVRE EPAIS FACE A FACE, que la section ne sait pas chiffrer : voir
    // `ligne_mom.FLANCS_EN_REGARD`. Une fois pour toute la selection.
    if cache.values().any(|c| c.as_ref().is_ok_and(|(r, _)| r.flancs_en_regard)) {
        avertissements.push(format!(
            "Cuivre épais face à du cuivre proche (moins de {} épaisseurs\
             \x20d'écart) sur au moins une section couplée : le condensateur que\
             \x20font les flancs face à face n'est pas calculé. Z différentielle\
             \x20sort 1 à 4 % trop haute et Z commune 1 à 2,5 % trop basse ;\
             \x20ε_eff et le retard tiennent à 2 %.", fmt_g(tl::FLANCS_EN_REGARD, 6)));
    }

    // LE CUIVRE QUI NE BLINDE PAS, DIT AVEC LE RESULTAT. C'est le seul endroit
    // de cette chaine ou le dessin peut RASSURER a tort : on voit du cuivre de
    // masse entre deux pistes, on le croit protecteur, et il transfere.
    let flottantes: Vec<&Json> = sections.iter().flat_map(|sec| els(&sec["conducteurs"]).iter()).filter(|p| p["flottant"].vrai()).collect();
    if !flottantes.is_empty() {
        avertissements.push(format!(
            "{} cuivre(s) de masse ne sont pas assez COUSUS : le plus grand\
             \x20trou entre deux vias y atteint {:.1} mm, au-delà des {:.1} mm que\
             \x20le front autorise (λ/10 au genou). Ce cuivre-là n'est pas tenu à\
             \x20zéro volt : il est posé FLOTTANT dans la section, et il ne blinde\
             \x20pas — il transfère. Cousez-le, ou ne comptez pas dessus.",
            flottantes.len(), maxf(&flottantes.iter().map(|p| _nombre(&p["couture"], 0.0)).collect::<Vec<_>>()),
            _couture_max(t_r)));
    }

    // ET LE MEME DEFAUT SUR LE PLAN QUI BORDE, qui ne se voyait pas du tout :
    // le solveur posait ce cuivre-la a zero volt parfait quel que soit son
    // nombre de vias. L'ecart au plan est maintenant ANNULE de ce cote quand la
    // couture ne tient pas, et les ohms comme les decibels le rendent.
    let nues: Vec<f64> = sections.iter().flat_map(|sec| {
        els(&sec["masse_non_cousue"]).iter().map(move |cote| {
            _nombre(&sec[if cote.as_str() == Some("gauche") { "couture_g" } else { "couture_d" }], 0.0)
        })
    }).collect();
    if !nues.is_empty() {
        avertissements.push(format!(
            "PLAN ARROSÉ NON COUSU sur {} bord(s) de section : le cuivre de\
             \x20masse qui borde le groupe y porte un trou de couture de {:.1} mm,\
             \x20au-delà des {:.1} mm que le front autorise (λ/10 au genou).\
             \x20L'effet coplanaire de ce côté a donc été ANNULÉ dans le calcul —\
             \x20l'écart au plan y est posé nul — plutôt que de faire cadeau d'une\
             \x20masse idéale à 0 V : les impédances et le couplage rendus sont\
             \x20ceux d'un bord SANS masse à portée. Cousez ce plan, ou ne comptez\
             \x20pas dessus.",
            nues.len(), maxf(&nues), _couture_max(t_r)));
    }

    // CE QUI LONGE PAR-DESSUS, ET QU'AUCUN PLAN NE SEPARE. Le seul manque de
    // cette page qui rendait ZERO plutot qu'un majorant : il ne suffit pas de
    // l'ecrire dans les hypotheses, parce qu'une hypothese ne dit pas si le cas
    // se produit ICI. Le chiffre affiche est un PLANCHER quand il se produit.
    if let Some(pire_sup) = superposes.first() {
        avertissements.push(format!(
            "{} longement(s) ENTRE COUCHES ne sont pas chiffrés. Le plus long :\
             \x20« {} » court sur {:.1} mm en regard de la sélection, sur {} contre\
             \x20{}, décalé de {:.2} mm et séparé par {:.3} mm de diélectrique —\
             \x20SANS PLAN entre les deux couches. Deux pistes superposées\
             \x20couplent souvent PLUS que les mêmes côte à côte, et la section\
             \x20droite de ce solveur ne peut pas le voir : elle pose tous ses\
             \x20conducteurs à la même hauteur. Ce qui est affiché est donc un\
             \x20PLANCHER. Routez ces deux couches en orthogonal, décalez les\
             \x20pistes, ou glissez un plan entre elles.",
            superposes.len(), str_py(&pire_sup["net"]), num(pire_sup, "longueur"),
            str_py(&pire_sup["nom_couche"]), str_py(&pire_sup["nom_depuis"]),
            num(pire_sup, "decalage"), num(pire_sup, "hauteur")));
    }

    // LES ARRONDIS A LA FIN, ET UNE SEULE FOIS. Chaque troncon appartient a UNE
    // scene -- la cle est (couche, net selectionne), et un troncon n'a qu'une
    // couche et qu'un net --, mais arrondir dans `_chaleur_scene` faisait
    // repasser chaque scene sur les entrees de toutes les autres.
    for c in chaleur.iter_mut() {
        if nul(c) {
            continue;
        }
        let (e, l) = (round(num(c, "ecart"), 4), round(num(c, "longueur"), 3));
        poser(c, "ecart", e);
        poser(c, "longueur", l);
    }

    let ecartees = scenes.len().saturating_sub(MAX_SECTIONS);
    if ecartees > 0 {
        avertissements.push(format!(
            "{} section(s) couplée(s) de plus n'ont pas été chiffrées : seules\
             \x20les {} plus longues le sont.", ecartees, MAX_SECTIONS));
    }
    obj! {
        "paires" => paires,
        "sections" => sections,
        "chaleur" => chaleur,
        "sections_locales" => cache_local.len(),
        "temps_montee" => t_r,
        "temps_montee_source" => source_tr,
        "voisinage" => voisinage.len(),
        "longements" => scenes.iter().map(|sc| els(&sc["voisins"]).len()).sum::<usize>(),
        // VU, NOMME, NON CHIFFRE. Les deux nombres se lisent ensemble : les
        // `blindes` disent que l'empilage fait son travail, les `superposes`
        // disent ou il ne le fait pas.
        "superposes" => superposes.clone(),
        "superposes_blindes" => superposes_blindes,
        // CE QUE LA SECTION COUPLEE SUPPOSE, avec le resultat et non a cote.
        "hypotheses" => vec![
            format!(
            "Le couplage n'est CHIFFRÉ qu'entre pistes de la MÊME couche et\
             \x20parallèles à {}° près : c'est ce qu'une section droite sait\
             \x20décrire — elle pose tous ses conducteurs à la même hauteur. Les\
             \x20pistes SUPERPOSÉES sur deux couches sont désormais CHERCHÉES\
             \x20quand même, et signalées avec leur longueur en regard, leur\
             \x20décalage et le diélectrique qui les sépare : {}. Celles qu'un\
             \x20plan de référence sépare ne sont pas signalées — le plan est un\
             \x20écran, et c'est la raison d'être de l'empilage{}. Les pistes qui\
             \x20se CROISENT, elles, ne sont ni chiffrées ni cherchées : le\
             \x20recouvrement d'un croisement orthogonal est une aire minuscule,\
             \x20et c'est précisément pourquoi la règle du métier est de router\
             \x20deux couches adossées à angle droit.",
            fmt_g(ANGLE_PARALLELE, 6),
            if !superposes.is_empty() { format!("{} trouvé(s)", superposes.len()) } else { "aucune trouvée".to_string() },
            if superposes_blindes != 0 { format!(" ({} longement(s) ainsi blindé(s) ici)", superposes_blindes) } else { String::new() }),
            "Toutes les voisines d'une même piste entrent dans la MÊME\
             \x20section : une piste et ses deux voisines font un problème à\
             \x20trois conducteurs, pas deux problèmes à deux. La masse\
             \x20coplanaire borde le groupe, à l'écart que la page a mesuré, et\
             \x20une piste du net de masse qui longe est posée comme une PISTE DE\
             \x20GARDE — dans la section, à zéro volt, sans port.".to_string(),
            "Quand une voisine se trouve PLUS LOIN que là où commence le\
             \x20cuivre de masse, ce cuivre s'interpose : il est posé dans la\
             \x20section comme une garde, à zéro volt, large de ce que laissent\
             \x20les deux dégagements mesurés. Sans cela la masse était repoussée\
             \x20au bord du groupe, son écart devenait négatif, on le ramenait à\
             \x20zéro — et deux pistes séparées par un plan arrosé se résolvaient\
             \x20comme deux pistes face à face au-dessus du diélectrique nu.\
             \x20Cette garde-là est déduite de deux mesures, pas lue dans le\
             \x20fichier : la section la marque « déduite ». Elle suppose le\
             \x20cuivre TENU à zéro volt sur toute la longueur, ce qu'un plan\
             \x20cousu de vias fait et qu'une garde sans vias ne fait pas.".to_string(),
            format!(
            "Un cuivre de masse n'est tenu à zéro volt que s'il est COUSU au\
             \x20plan par des vias. Le critère est une longueur d'onde et non un\
             \x20nombre de vias : le plus grand trou entre deux coutures doit\
             \x20rester sous λ/10 à la fréquence du genou, soit {:.1} mm pour ce\
             \x20front — moins d'un tiers de la longueur physique du front.\
             \x20Au-delà, le cuivre est posé FLOTTANT : charge totale nulle,\
             \x20potentiel libre. Il ne blinde plus, il TRANSFÈRE, et le couplage\
             \x20peut devenir PIRE qu'en l'absence de tout cuivre. La résonance\
             \x20d'un tel cuivre, elle, n'est pas chiffrée : le quasi-statique\
             \x20rend le transfert, pas le pic.", _couture_max(t_r)),
            "LA MÊME RÈGLE VAUT POUR LE PLAN ARROSÉ QUI BORDE le groupe, et\
             \x20plus seulement pour les gardes posées entre les pistes. Le\
             \x20solveur le pose à 0 V parfait ; quand sa couture dépasse le même\
             \x20seuil, l'effet coplanaire de ce côté est ANNULÉ — l'écart au plan\
             \x20y est mis à zéro, ce qui se lit « pas de masse coplanaire ici ».\
             \x20Les impédances remontent et le couplage aussi, ce qui est\
             \x20fidèle : un plan sans vias sur la longueur du longement ne tient\
             \x20rien. Une couture NON MESURÉE — la page ne l'envoie pas — vaut\
             \x20zéro et se lit « tenu » : on suppose bon ce qu'on ne sait pas, et\
             \x20le calcul reste alors optimiste de ce côté-là.".to_string(),
            format!(
            "Le temps de montée retenu est {}. Il ne change ni [C] ni [L],\
             \x20et il n'entre pas dans la Z différentielle : il ne sert ici\
             \x20qu'au seuil de couture, qui est une longueur d'onde au genou du\
             \x20front.", source_tr),
            "Un partenaire différentiel DÉCLARÉ — ou nommé par ses suffixes —\
             \x20est ce que cette page juge ; une voisine simplement proche ne\
             \x20fait PAS une paire, et le repli « la plus proche » est un repli\
             \x20d'affichage, dit comme tel sur la carte. Ce qu'une voisine\
             \x20PREND, en pour-cent comme en volts, se lit sous l'onglet\
             \x20Crosstalk : cette page-ci ne répond qu'en ohms.".to_string(),
            "La Z différentielle peinte sur la carte est celle d'une section à\
             \x20DEUX conducteurs — la sélection et sa paire — reprise à l'écart\
             \x20de chaque tronçon. Elle n'est donc pas celle du tableau, qui\
             \x20tient les autres voisines à la masse : les deux se rejoignent\
             \x20quand la paire est seule, et diffèrent quand elle est prise dans\
             \x20un bus.".to_string(),
            // LE BLOC DE CLOTURE, ET IL NE REPETE PAS LES AUTRES : il les
            // RASSEMBLE. Les manques sont dits plus haut, chacun a l'endroit ou
            // il se produit -- entre couches sous la regle d'appariement, la
            // resonance sous la couture. Il faut les lire tous pour se faire
            // une idee de ce qui reste dehors, et personne ne le fait.
            //
            // ON DIT SURTOUT LE SENS DE CHAQUE ECART, ce qu'aucune des autres
            // lignes ne fait : les deux rendent le chiffre OPTIMISTE. Un
            // utilisateur a le droit de savoir de quel cote penche ce qui
            // reste.
            "CE QUE CE CALCUL NE COUVRE PAS, rassemblé — et dans quel sens :\
             \x20(1) la RÉSONANCE d'un cuivre de masse flottant, qui sonne aux\
             \x20multiples de λ/2 : le quasi-statique rend le transfert, pas le\
             \x20pic → OPTIMISTE à ces fréquences ; (2) le COUPLAGE ENTRE\
             \x20COUCHES — deux pistes superposées couplent, et la section pose\
             \x20tous ses conducteurs à la même hauteur → VU mais NON CHIFFRÉ :\
             \x20la géométrie est cherchée et signalée, le couplage ne l'est\
             \x20pas → OPTIMISTE quand il y en a. Les deux vont donc dans le sens\
             \x20rassurant : ce qui est affiché est un PLANCHER sur une carte mal\
             \x20cousue, ou routée en parallèle sur deux couches adossées. Aller\
             \x20plus loin demande un solveur de section à conducteurs empilés —\
             \x20ou le moteur 2,5D, qui discrétise une surface et non une section\
             \x20droite.".to_string(),
        ],
    }
}
