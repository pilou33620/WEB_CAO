// ==========================================================================
// Les discontinuités
// --------------------------------------------------------------------------
// LE MODELE NE LES PREND PAS, mais la fiche peut les NOMMER et les ESTIMER.
// C'est le lot 3a : signaler ce qui n'est pas modélisé est déjà de la valeur.
// ==========================================================================

use super::base::*;
use super::brins::_raccord;

// En dessous de cet angle, deux troncons sont colineaires et il n'y a pas de
// coude. C'est la RESOLUTION des coordonnees qui le fixe -- la page arrondit au
// millieme de millimetre --, et non un jugement sur ce qui merite d'etre
// modelise : un coude de 5 degres est bien un coude, et il est emis.
pub const ANGLE_COUDE_MINIMAL: f64 = 0.1; // degres

fn plan(c: &Json) -> bool {
    c["type"].as_str() == Some("copper") && c["role"].as_str() == Some("plane")
}

/// Les coudes de la sélection : leur rang de tronçon et leur ANGLE SEUL.
///
/// L'angle à chaque raccord est calculé sur les directions de deux tronçons
/// consécutifs, orientées dans le sens du parcours (`_raccord`). Rien d'autre n'est calculé ici : la capacité
/// d'excès et l'inductance série demandent la hauteur au plan et l'epsilon
/// du tronçon, que seule la section résolue connaît. Elles sont ajoutées
/// plus bas par `tl.elements_coude`, qui est AUSSI ce que la cascade
/// applique — une seule formule pour une seule grandeur.
///
/// DEUX RACCORDS NE SONT PAS DES COUDES, et la version precedente en faisait
/// quand meme (mesure sur une liaison TOP -> BOT : un coude de 0,0 degre,
/// 0 pH, 0 fF, affiche dans la fiche a cote du via) :
///
///   · UN CHANGEMENT DE COUCHE. Deux troncons sur des couches differentes ne
///     se raccordent pas dans un plan : ce qui les joint est un VIA, et c'est
///     le modele de via qui s'applique. Un modele de coude planaire n'a rien
///     a y faire, meme si les deux troncons font un angle vu de dessus ;
///   · UN ANGLE NUL. Deux troncons colineaires n'ont pas de coude. Le seuil
///     est celui de la RESOLUTION des coordonnees, pas un choix de
///     modelisation : la page arrondit au millieme de millimetre, ce qui sur
///     un troncon de 15 mm fait une incertitude angulaire de 0,004 degre. A
///     0,1 degre on est dix fois au-dessus du bruit et tres en dessous de
///     tout coude reel -- un coude de 5 degres reste emis, avec son
///     cinquante-quatrieme de la valeur a angle droit.
///
/// Rend une liste de dicts : {troncon, angle_deg}.
pub fn _coudes(objets: &[Json]) -> Vec<Json> {
    let mut resultats = Vec::new();
    for i in 1..objets.len() {
        let obj_prev = &objets[i - 1];
        let obj_curr = &objets[i];

        // UN CHANGEMENT DE COUCHE N'EST PAS UN COUDE : c'est un via, et il a
        // son propre modele. `_transitions` s'en charge.
        let couche_prev = ent(&obj_prev["layer"], -1);
        let couche_curr = ent(&obj_curr["layer"], -1);
        if couche_prev >= 0 && couche_curr >= 0 && couche_prev != couche_curr {
            continue;
        }

        // Extraire les vecteurs directionnels
        let vecteur = |obj: &Json| -> Option<(f64, f64)> {
            let (a, b) = (_bout(obj, "start")?, _bout(obj, "end")?);
            // Le vecteur de la direction effective du tronçon
            let dx = b.0 - a.0;
            let dy = b.1 - a.1;
            if !(dx.abs() > 1e-9 || dy.abs() > 1e-9) {
                return None;
            }
            Some((dx, dy))
        };

        // LE SENS DU PARCOURS, PAS CELUI DU DESSIN : `_ruptures` accepte un
        // troncon trace a l'envers, et start->end brut faisait de
        // (0,0)->(10,0) puis (20,0)->(10,0) un coude de 180 degres. A defaut
        // de raccord (bouts a plus de TOLERANCE_RACCORD_MM), le dessin.
        let (v1, v2) = match _raccord(obj_prev, obj_curr) {
            Some(r) => (Some(r.2), Some(r.3)),
            None => (vecteur(obj_prev), vecteur(obj_curr)),
        };
        let (Some((dx1, dy1)), Some((dx2, dy2))) = (v1, v2) else { continue };

        // Normes
        let n1 = py::hypot(dx1, dy1);
        let n2 = py::hypot(dx2, dy2);
        if !(n1 > 1e-9 && n2 > 1e-9) {
            continue;
        }

        // Cosinus de l'angle externe (celui qu'on voit sur la carte)
        let cos_theta = (dx1 * dx2 + dy1 * dy2) / (n1 * n2);
        let cos_theta = cos_theta.min(1.0).max(-1.0);
        let angle_rad = cos_theta.acos();
        let angle_deg = angle_rad.to_degrees();

        // L'ANGLE SEUL EST CALCULE ICI. La capacite d'exces et l'inductance
        // demandent la HAUTEUR AU PLAN et l'epsilon du troncon, que seule la
        // section resolue connait : elles sont ajoutees plus bas, par
        // `tl.elements_coude`, et ce sont EXACTEMENT celles que la cascade
        // applique. La version precedente en posait une troisieme ici -- une
        // formule lineaire en l'angle, sans hauteur au plan, donnee pour du
        // Gupta -- et la fiche affichait 21 fF la ou le modele en appliquait
        // 0,4 : deux chiffres pour la meme grandeur, cinquante fois l'un de
        // l'autre.
        if angle_deg < ANGLE_COUDE_MINIMAL {
            continue; // colineaires : pas de coude
        }

        resultats.push(obj! {
            "troncon" => i,
            "angle_deg" => round(angle_deg, 1),
        });
    }
    resultats
}

/// La longueur PERCEE d'un via, en millimetres, lue dans l'empilage.
///
/// ELLE N'A JAMAIS EU BESOIN D'ETRE SUPPOSEE, et c'est ce qui rendait
/// l'ancien repli genant : l'empilage porte toutes les epaisseurs, et un via
/// va d'une couche de cuivre a l'autre. On somme donc ce qu'il traverse,
/// bornes COMPRISES -- le percage entre par le dessus du cuivre de depart et
/// sort par le dessous du cuivre d'arrivee, c'est ce qu'un foret fait.
///
/// CE QUE LE REPLI DONNAIT, ET DE COMBIEN IL SE TROMPAIT. « 0,2 mm par couche
/// traversee » comptait en indices d'EMPILAGE, qui alternent cuivre et
/// dielectrique : cela faisait 0,4 mm par couche de cuivre franchie, ce qui
/// n'a de rapport avec rien. Sur l'empilage quatre couches ordinaire du banc,
/// une liaison TOP -> BOT donnait 1,200 mm quand l'empilage en dit 1,340 :
/// 12 % d'erreur, que l'inductance de via emporte au premier ordre.
pub fn _hauteur_via(couches: &[Json], couche_depart: &Json, couche_arrivee: &Json) -> f64 {
    let mut a = ent(couche_depart, -1);
    let mut b = ent(couche_arrivee, -1);
    if a < 0 || b < 0 {
        return 0.0;
    }
    if a > b {
        std::mem::swap(&mut a, &mut b);
    }
    let mut total = 0.0;
    for i in a..=b {
        if 0 <= i && i < couches.len() as i64 {
            total += _nombre(&couches[i as usize]["thickness"], 0.0);
        }
    }
    round(total, 6)
}

/// Les cotes du via d'une transition, EN MILLIMETRES, et d'ou elles viennent.
///
/// LA HAUTEUR VIENT DE L'EMPILAGE, ET ELLE EST EXACTE -- voir `_hauteur_via`.
/// `_transitions` l'y a deja mise ; on ne la suppose plus. La page peut la
/// surcharger si elle en sait davantage, mais elle n'a pas a le faire.
///
/// LE PERCAGE ET LA PASTILLE, EUX, DOIVENT VENIR DE LA PAGE, et les deux
/// pages ne les envoient pas encore. Le modele tourne alors sur des replis --
/// 0,3 mm de percage, 2,5 fois cela en pastille --, reunis ICI, en un seul
/// endroit, et la transition emporte `cotes_supposees` pour que la fiche
/// puisse le dire : un chiffre suppose affiche comme un chiffre mesure est
/// pire que pas de chiffre.
pub fn _cotes_via(obj: &Json, trans: &mut Json) -> (f64, f64, f64) {
    let via = &obj["via"];

    let a_percage = !nul(&via["drill_diameter"]);
    let a_pastille = !nul(&via["pad_diameter"]);
    // TROIS PROVENANCES, ET NON DEUX. « presente » ne voulait pas dire « lue ».
    // La visionneuse envoyait `percage x 2,5` faute de pastille connue --
    // exactement le repli applique ici --, si bien que le chiffre etait le meme
    // mais arrivait DECLARE PAR LA PAGE : `pastille_source` passait de
    // « repli » a « page » et `cotes_supposees` a faux. Le resultat ne changeait
    // pas d'un micron ; ce qui changeait, c'est que la fiche cessait de
    // prevenir. Une supposition qui se presente comme une mesure est pire
    // qu'une supposition.
    //
    //   page      la cote est lue dans le fichier de conception
    //   supposee  la page l'envoie EN DISANT qu'elle l'a devinee -- un padstack
    //             absent dont `ipc2581_parser.py` fabrique la pastille a
    //             « percage + 0,3 mm », un percage deduit de deux pastilles
    //             superposees
    //   repli     la page n'a rien envoye, et c'est ce fichier qui choisit
    let sup_percage = via["drill_diameter_supposee"].vrai();
    let sup_pastille = via["pad_diameter_supposee"].vrai();
    let d_percage = _nombre(&via["drill_diameter"], 0.3);
    let d_pastille = _nombre(&via["pad_diameter"], if !a_pastille { d_percage * 2.5 } else { 0.0 });

    // La hauteur : l'empilage d'abord, la page si elle la donne.
    let mut h_empilage = _nombre(&trans["hauteur_empilage"], 0.0);
    let mut a_hauteur = !nul(&via["height"]);
    let mut h_via = _nombre(&via["height"], h_empilage);
    if !(h_via > 0.0) {
        // Ni empilage exploitable ni page : dernier recours, et il se voit.
        let sauts = match (ent(&trans["couche_arrivee"], 0) - ent(&trans["couche_depart"], 0)).abs() {
            0 => 1,
            s => s,
        };
        h_via = 0.2 * sauts as f64;
        a_hauteur = false;
        h_empilage = 0.0;
    }

    // UNE COTE DEVINEE COMPTE COMME SUPPOSEE, qu'elle vienne de la page ou
    // d'ici : c'est le meme doute, et la fiche doit le porter dans les deux cas.
    poser(trans, "cotes_supposees", !(a_percage && !sup_percage && a_pastille && !sup_pastille));
    poser(trans, "cotes", obj! {
        "hauteur_mm" => round(h_via, 4),
        "hauteur_source" => if a_hauteur { "page" } else if h_empilage > 0.0 { "empilage" } else { "repli" },
        "percage_mm" => round(d_percage, 4),
        "percage_source" => if a_percage { if sup_percage { "supposee" } else { "page" } } else { "repli" },
        "pastille_mm" => round(d_pastille, 4),
        "pastille_source" => if a_pastille { if sup_pastille { "supposee" } else { "page" } } else { "repli" },
    });
    (h_via, d_percage, d_pastille)
}

// ==========================================================================
// LE CHEMIN DE RETOUR DU COURANT
// --------------------------------------------------------------------------
// CE QUE LE MODELE DE VIA NE DISAIT PAS. Un via etait chiffre par une
// inductance PARTIELLE PROPRE -- celle d'un conducteur seul, sans dire par ou le
// courant revient. Deux cartes identiques a ceci pres que l'une a son via de
// masse a 0,4 mm et l'autre a 3 mm sortaient donc le meme |S11|, alors qu'elles
// different d'un facteur deux sur l'inductance qui compte. Le placement du via
// de retour est justement la decision que l'outil devrait eclairer.
//
// LES TROIS CHOSES QU'ON REGARDE ICI, dans l'ordre de ce qu'elles coutent :
//
//   1. LA REFERENCE CHANGE-T-ELLE ? Sur un empilage TOP/GND/PWR/BOT, une piste
//      sur TOP se refere a GND et la meme piste sur BOT se refere a PWR. Le
//      courant de retour doit changer de plan, et AUCUN VIA DE MASSE NE PEUT LE
//      FAIRE : un via de masse joint du GND a du GND. Le retour passe alors par
//      la cavite entre plans et ses condensateurs de decouplage, que ce modele
//      ne represente pas. C'est le defaut le plus grave, il est invisible sur le
//      dessin, et il coute jusqu'a 7 dB de |S11| a 3 GHz -- toujours en
//      flattant. On le NOMME.
//
//   2. Y A-T-IL UN RETOUR, ET OU ? Les vias de masse voisins forment la boucle.
//      Leur nombre et leur position donnent l'inductance reelle.
//
//   3. LES TROIS SONT-ILS PRIS, OU SEULEMENT LE PLUS PROCHE ? Les trois. Voir
//      `tl.inductance_boucle_vias` : la repartition du courant entre eux se
//      RESOUT, elle ne se postule pas, et trois vias a 0,6 mm ne divisent pas
//      l'inductance par trois -- leur mutuelle les en empeche. Ne garder que le
//      plus proche surestime de 31 % sur le cas a trois vias du banc.
// ==========================================================================

// L'ecart radial suppose entre une pastille et le bord de l'antipad, en
// millimetres, quand la page n'envoie pas le diametre. C'est la valeur courante
// d'une regle d'isolation cuivre/via ; elle est SUPPOSEE, et la fiche le dit.
pub const ANTIPAD_ECART_REPLI: f64 = 0.25;

// Les pastilles non fonctionnelles sont supposees RETIREES a defaut
// d'information. C'est le reglage courant des fondeurs, et c'est aussi celui qui
// SOUS-ESTIME la capacite : le supposer, c'est se tromper du cote qu'il faut
// annoncer plutot que subir.
pub const PASTILLES_INTERNES_REPLI: bool = false;

/// Les cotes du dessus de chaque couche, en millimetres, depuis le dessus.
///
/// `out[i]` est le dessus de la couche `i`, `out[i+1]` son dessous. Un via qui
/// va de la couche `a` a la couche `b` occupe donc [out[a], out[b+1]] -- et sa
/// longueur est exactement ce que `_hauteur_via` somme, par construction.
pub fn _z_empilage(couches: &[Json]) -> Vec<f64> {
    let mut z = 0.0;
    let mut out = Vec::with_capacity(couches.len() + 1);
    for c in couches {
        out.push(round(z, 6));
        z += _nombre(&c["thickness"], 0.0);
    }
    out.push(round(z, 6));
    out
}

/// Les noms des plans qui referencent un troncon. Un pour un microruban,
/// deux pour une triplaque, aucun quand le troncon n'a pas ete calcule.
pub fn _plans_de_reference(seg: &Json) -> Noms {
    ["plan_haut", "plan_bas"].iter().map(|cle| txt(seg, cle)).filter(|n| !n.is_empty()).map(String::from).collect()
}

/// Les plans qui referencent une couche de cuivre, par leur nom.
///
/// MEME BALAYAGE QUE `section_de_couche`, et il doit le rester : le plan le
/// plus proche au-dessus, le plus proche au-dessous. La difference est qu'ici
/// on n'a PAS de troncon resolu -- on part de la seule couche. C'est ce qui
/// permet d'analyser le retour d'un via qui n'appartient a aucune chaine.
pub fn _plans_de_couche(couches: &[Json], indice: i64) -> Noms {
    let mut noms = Noms::new();
    if !(0 <= indice && indice < couches.len() as i64) {
        return noms;
    }
    if let Some(c) = couches[..indice as usize].iter().rev().find(|c| plan(c)) {
        noms.insert(txt(c, "name").to_string());
    }
    if let Some(c) = couches[indice as usize + 1..].iter().find(|c| plan(c)) {
        noms.insert(txt(c, "name").to_string());
    }
    noms.remove("");
    noms
}

fn bornes(couche_a: i64, couche_b: i64) -> (i64, i64) {
    (couche_a.min(couche_b), couche_a.max(couche_b))
}

/// Les plans qu'un via traverse SANS LES TOUCHER -- un antipad chacun :
/// [{indice, nom, epaisseur}].
///
/// Un plan dont le net est celui du via n'est pas traverse : il y est
/// RACCORDE, et il n'y a pas d'antipad. C'est la difference entre un via de
/// signal et un via de masse, et c'est le net qui la porte.
pub fn _plans_traverses(couches: &[Json], couche_a: i64, couche_b: i64, net_via: &str) -> Vec<Json> {
    let (lo, hi) = bornes(couche_a, couche_b);
    let mut out = Vec::new();
    for i in lo + 1..hi {
        if !(0 <= i && i < couches.len() as i64) {
            continue;
        }
        let c = &couches[i as usize];
        if !plan(c) {
            continue;
        }
        if !net_via.is_empty() && txt(c, "net") == net_via {
            continue;
        }
        out.push(obj! {"indice" => i,
                       "nom" => c.get("name").cloned().unwrap_or_else(|| "".j()),
                       "epaisseur" => _nombre(&c["thickness"], 0.035)});
    }
    out
}

/// Le net du plan qui porte ce nom, ou "" quand l'empilage ne le dit pas.
pub fn _net_du_plan(couches: &[Json], nom: &str) -> String {
    for c in couches {
        if c["type"].as_str() == Some("copper") && txt(c, "name") == nom {
            return str_ou_vide(&c["net"]);
        }
    }
    String::new()
}

/// Ce plan porte-t-il un net DEDUIT plutot que lu ?
///
/// La page peut forcer le role d'une couche -- signal, gnd, pwr -- et en tirer
/// un net quand aucun cuivre ne le donne : « PWR » sur une couche declaree
/// d'alimentation dont aucun net d'alimentation ne porte de zone. Le nom rendu
/// n'existe alors PAS sur la carte.
///
/// C'EST DEFENDABLE, ET CELA DOIT SE DIRE. Honorer « cette couche est une
/// alim » vaut mieux que de rendre vide. Mais le verdict qui en decoule --
/// « les nets different », donc « aucun via de masse ne peut refermer », donc
/// CRITIQUE -- repose alors sur un nom invente, et une fiche qui l'affirme sans
/// reserve fait passer une deduction pour une lecture.
pub fn _net_du_plan_suppose(couches: &[Json], nom: &str) -> bool {
    for c in couches {
        if c["type"].as_str() == Some("copper") && txt(c, "name") == nom {
            return c["net_suppose"].vrai();
        }
    }
    false
}

/// L'empilage declare-t-il le net de ses plans ?
///
/// C'EST LA CONDITION DU TEST QUI COMPTE. Savoir si un via de masse rejoint le
/// plan d'arrivee demande de connaitre le net de ce plan. L'editeur l'envoie ;
/// un empilage plus ancien, ou une source qui ne le porte pas, ne l'envoie pas.
/// Sans lui on ne peut pas distinguer un plan de masse d'un plan
/// d'alimentation -- et c'est justement cette distinction qui fait la
/// difference entre une carte correcte et le defaut grave.
///
/// ON NE CHOISIT NI LE SILENCE NI LE REFUS. Refuser tous les vias de retour
/// rendrait la mesure impossible sur ces empilages ; les accepter sans le dire
/// ferait passer le cas GND/PWR pour un cas sain. On accepte donc, et
/// `plans_incertains` le dit jusque dans la fiche.
pub fn _plans_ont_un_net(couches: &[Json]) -> bool {
    couches.iter().any(|c| plan(c) && !py::strip(&str_ou_vide(&c["net"])).is_empty())
}

/// Les noms des plans de role « plan » qu'un via de `net` RACCORDE.
///
/// C'est ce qui decide si un via de masse referme la boucle : il faut qu'il
/// touche un plan du cote depart ET un plan du cote arrivee.
///
/// `verifier_net` a faux -- empilage sans nets de plan declares --, tout plan
/// dans la portee compte. Voir `_plans_ont_un_net`.
/// `seulement_plans` a faux permet d'admettre toute couche conductrice dans la
/// portee du percage quand la page a certifie la connexion locale.
pub fn _plans_touches(couches: &[Json], couche_a: i64, couche_b: i64, net: &str, verifier_net: bool, seulement_plans: bool) -> Noms {
    let (lo, hi) = bornes(couche_a, couche_b);
    let mut noms = Noms::new();
    for i in lo..=hi {
        if !(0 <= i && i < couches.len() as i64) {
            continue;
        }
        let c = &couches[i as usize];
        if c["type"].as_str() != Some("copper") {
            continue;
        }
        if seulement_plans && c["role"].as_str() != Some("plane") {
            continue;
        }
        if verifier_net && !net.is_empty() && txt(c, "net") != net {
            continue;
        }
        let nom = txt(c, "name");
        if !nom.is_empty() {
            noms.insert(nom.to_string());
        }
    }
    noms
}

/// Pourquoi ce via de masse ne porte pas le retour sur ce plan-la.
///
/// DEUX REFUS QUI NE SE DISENT PAS PAREIL, et les confondre coutait une heure
/// a qui lit la fiche. « Il ne touche pas le plan » envoie chercher un percage
/// trop court ou un via borgne. « Il touche le plan, mais un autre versement »
/// envoie regarder la DECOUPE du plan -- et c'est le seul geste qui repare.
pub fn _pourquoi_pas_le_plan(refs: &Noms, autre: &Noms, locaux: &Json, quel: &str) -> String {
    let croise = refs.intersection(autre).next();
    if let Some(nom) = croise {
        // COURT, PARCE QUE LA VISIONNEUSE LE PEINT SUR LE CUIVRE. Cette chaine
        // part telle quelle dans le cartouche du chevelu, au milieu de la carte :
        // une phrase de cent caracteres y est illisible, et un chevelu illisible
        // ne se lit plus du tout. L'explication longue est dite UNE FOIS dans les
        // avertissements, ou elle ne se repete pas par via. Meme libelle que
        // l'editeur, mot pour mot : les deux pages doivent se lire pareil.
        let sous = str_ou_vide(&locaux[nom.as_str()]);
        return format!("{} : autre versement ({} ici)", nom, py::strip(&sous));
    }
    format!("ne rejoint pas {}, le plan {}", refs.iter().map(String::as_str).collect::<Vec<_>>().join(" / "), quel)
}
