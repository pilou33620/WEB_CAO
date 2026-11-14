//! Le plan de masse (couture, fentes, transitions), les gestes a faire et les plages a risque.

use super::*;
use crate::simulation_em::base::*;

// ==========================================================================
// LE PLAN DE MASSE : DEUX CONTROLES, A COTE DU COUPLAGE ET JAMAIS A SA PLACE
// --------------------------------------------------------------------------
// LE BLINDAGE EST DEJA DANS LA MATRICE S -- c'est ce que « inclure le plan et
// ses vias dans la geometrie envoyee au solveur » veut dire, et le modeliser
// ici une seconde fois le compterait deux fois. Ce qu'on ajoute est d'une autre
// nature : ce sont des controles de DESSIN, qui repondent a « pourquoi ca
// couple ici » quand la carte a montre « ca couple ici ».
//
// ILS SORTENT AVANT LE COUPLAGE dans la fiche, et c'est voulu. Un pas de
// couture insuffisant est une CAUSE ; le pic de couplage est un SYMPTOME. Les
// lire dans cet ordre est ce qui transforme une carte en decision de routage.
// ==========================================================================

// Le rayon dans lequel on cherche un via de masse au droit d'un changement de
// couche. Trois millimetres est ce qu'emploie deja le chemin de retour de
// l'editeur (`SIM_RAYON_RETOUR`) : au-dela, la boucle est si grande que le via
// ne referme plus rien.
pub const RAYON_MASSE: f64 = 3.0;

/// Le temps de montee de l'analyse, en secondes, et d'ou il sort.
///
/// IL EST TOUJOURS CONNU EN NIVEAU 2 : saisi, deduit de la classe du net
/// agresseur, ou -- faute de tout -- le front de reference de 1 ns. C'est le
/// MEME front pour le NEXT, le FEXT et le seuil de couture : une fiche qui
/// compare deux chiffres sortis de deux hypotheses ne compare rien.
pub fn _tr_signal(analyse: &Json) -> (f64, String) {
    let t_r = _nb(&analyse["temps_montee"], 0.0);
    if t_r > 0.0 {
        return (t_r, if analyse["source_tr"].vrai() { str_py(&analyse["source_tr"]) } else { "saisi".into() });
    }
    (TR_DEFAUT, "front de référence (1 ns)".into())
}

/// Le plus grand trou de couture acceptable, en mm, et d'ou il sort.
///
/// LAMBDA/10 AU GENOU DU FRONT (`se._couture_max`) : un cuivre qui resonne
/// a 44 GHz ne gene pas un front d'une nanoseconde, qui n'y porte rien. Rend
/// (seuil, source, regle ecartee) ; la troisieme reste vide -- il n'y a plus
/// de bande d'analyse a confronter au front.
pub fn _seuil_couture(analyse: &Json) -> (f64, String, String) {
    let (t_r, source) = _tr_signal(analyse);
    let par_front = se::_couture_max(t_r);
    if !(par_front > 0.0) {
        return (0.0, "aucune règle applicable".into(), String::new());
    }
    (par_front, format!("front ({source})"), String::new())
}

/// Les intervalles ou aucune couture ne tient le plan, du plus grand pas.
///
/// LES DEUX BOUTS COMPTENT, comme dans `simEspacement` cote editeur : une
/// piste cousue en son milieu et nulle part ailleurs a bien deux grands
/// trous, et ne mesurer qu'entre vias les cacherait tous les deux.
pub fn _trous_couture(positions: &[Json], total: f64, seuil: f64) -> Vec<Json> {
    let mut zones = Vec::new();
    for cote in [1, -1] {
        let mut pos: Vec<f64> = positions.iter().filter(|p| ent(&p["cote"], 1) == cote).map(|p| nb(&p["s"])).collect();
        pos.sort_by(f64::total_cmp);
        let mut bords = vec![0.0];
        bords.extend(pos);
        bords.push(total);
        for (&a, &b) in bords.iter().zip(&bords[1..]) {
            if b - a > seuil {
                zones.push(obj! {"type" => "couture", "s0" => round(a, 3),
                                 "s1" => round(b, 3), "pas" => round(b - a, 3),
                                 "cote" => if cote > 0 { "gauche" } else { "droite" },
                                 "detail" => format!("pas de couture de {:.2} mm, au-delà \
                                                      du seuil de {:.2} mm",
                                                     b - a, seuil)});
            }
        }
    }
    zones
}

/// La FRACTION du parcours couverte par l'union des zones de vigilance.
///
/// ELLE DECIDE DE CE QUE VAUT UNE COINCIDENCE. Dire d'un pic qu'une zone de
/// vigilance tombe au meme endroit ne veut quelque chose que si les zones ne
/// sont pas partout : quand elles couvrent tout le parcours -- ce qui arrive
/// des que le seuil de couture se durcit --, la coincidence est certaine
/// d'avance et n'explique donc rien. On la mesure ici pour pouvoir le DIRE
/// plutot que de rendre un verdict qui se serait rendu tout seul.
///
/// L'UNION, ET NON LA SOMME : les zones se recouvrent (les deux cotes du
/// parcours sont regardes separement), et sommer leurs longueurs annoncerait
/// couramment plus de cent pour cent.
pub fn _couvert(zones: &[Json], total: f64) -> f64 {
    if !(total > 0.0) || zones.is_empty() {
        return 0.0;
    }
    let mut plages: Vec<(f64, f64)> = zones.iter().map(|z| (maxf(&[0.0, nb(&z["s0"])]), minf(&[total, nb(&z["s1"])]))).collect();
    plages.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let (mut fusion, mut total_vu): (Vec<(f64, f64)>, f64) = (Vec::new(), 0.0);
    for (a, b) in plages {
        if b <= a {
            continue;
        }
        match fusion.last_mut() {
            Some(dernier) if a <= dernier.1 => dernier.1 = maxf(&[dernier.1, b]),
            _ => fusion.push((a, b)),
        }
    }
    for (a, b) in fusion {
        total_vu += b - a;
    }
    minf(&[1.0, total_vu / total])
}

// Au-dela de cette part du parcours couverte, « une zone de vigilance tombe au
// meme endroit » cesse d'etre un renseignement : une abscisse tiree au hasard
// en rencontre une une fois sur deux.
pub const COUVERT_VAIN: f64 = 0.5;

/// Les zones de vigilance du plan de reference, le long du parcours.
///
/// Rend {seuil, source, zones, mesure} : `zones` porte des intervalles en
/// millimetres, chacun avec son type -- « couture », « fente », « transition »
/// -- et de quoi l'expliquer. `mesure` dit CE QU'ON A PU REGARDER : une page
/// qui n'envoie ni positions de couture ni fentes doit voir ecrit qu'on n'a
/// rien regarde, et non une liste vide qui se lit « rien a signaler ».
pub fn controle_masse(doc: &Json, parcours: &[Troncon], analyse: &Json) -> Json {
    let total = parcours.last().map_or(0.0, |p| p.s1);
    let (seuil, source, ecarte) = _seuil_couture(analyse);
    let (mut zones, mut mesure): (Vec<Json>, Vec<String>) = (Vec::new(), Vec::new());

    let positions = if doc["couture"].as_objet().is_some() { els(&doc["couture"]["positions"]) } else { &[] };
    if !positions.is_empty() && seuil > 0.0 {
        mesure.push(format!("{} via(s) de couture repérés le long du parcours",
                            positions.len()));
        zones.extend(_trous_couture(positions, total, seuil));
    } else if seuil > 0.0 {
        // LE REPLI SUR CE QUE LA PAGE ENVOIE DEJA. Chaque troncon porte ses
        // deux plus grands trous de couture (`couture_left`/`couture_right`) --
        // c'est ce que lit deja l'onglet Diaphonie. On n'a alors pas la
        // POSITION du trou, seulement le troncon qui le porte : la zone est
        // donc le troncon entier, et la fiche le dit plutot que de faire croire
        // a une localisation qu'on n'a pas.
        let mut vus = 0;
        for seg in parcours {
            let trou = maxf(&[_nb(&seg.obj["couture_left"], 0.0),
                              _nb(&seg.obj["couture_right"], 0.0)]);
            if trou <= 0.0 {
                continue;
            }
            vus += 1;
            if trou > seuil {
                zones.push(obj! {"type" => "couture", "s0" => round(seg.s0, 3),
                                 "s1" => round(seg.s1, 3), "pas" => round(trou, 3),
                                 "cote" => "", "approche" => true,
                                 "detail" => format!("tronçon dont le plus grand trou de \
                                                      couture vaut {trou:.2} mm, au-delà du \
                                                      seuil de {seuil:.2} mm — la page n'envoie \
                                                      pas la position du trou, la zone est \
                                                      donc le tronçon entier")});
            }
        }
        if vus != 0 {
            mesure.push("couture lue tronçon par tronçon (pas de positions \
                         de vias envoyées)".into());
        }
    }

    let fentes = els(&doc["fentes"]);
    for f in fentes {
        let s0 = nb(&f["s"]);
        zones.push(obj! {"type" => "fente", "s0" => round(s0, 3),
                         "s1" => round(s0 + maxf(&[_nb(&f["longueur"], 0.0),
                                                   0.1]), 3),
                         "detail" => if f["quoi"].vrai() { str_py(&f["quoi"]) } else {
                             "discontinuité du plan de \
                              référence détectée sous le parcours".to_string() }});
    }
    if !nul(&doc["fentes"]) {
        mesure.push(format!("plan de référence sondé sous le parcours ({} \
                             discontinuité(s))", fentes.len()));
    }

    // LES CHANGEMENTS DE COUCHE SANS VIA DE MASSE A PORTEE. Le courant de
    // retour doit changer de plan la ou le signal change de couche ; s'il n'a
    // pas de via pour le faire, il fait le tour -- et la boucle qu'il decrit
    // rayonne exactement la ou l'on cherche l'origine d'un pic de couplage.
    if !nul(&doc["vias_masse"]) {
        let vias = els(&doc["vias_masse"]);
        for (a, b) in parcours.iter().zip(parcours.iter().skip(1)) {
            if a.couche == b.couche {
                continue;
            }
            let Some(bouts) = se::_extremites(&b.obj) else { continue };
            let (x, y) = bouts.0;
            let mut proche = false;
            for v in vias {
                if py::hypot(nb(&v["x"]) - x,
                             nb(&v["y"]) - y) > RAYON_MASSE {
                    continue;
                }
                let lo = ent(&v["a"], 0).min(ent(&v["b"], 0));
                let hi = ent(&v["a"], 0).max(ent(&v["b"], 0));
                if lo <= a.couche.min(b.couche) &&
                        hi >= a.couche.max(b.couche) {
                    proche = true;
                    break;
                }
            }
            if !proche {
                zones.push(obj! {"type" => "transition", "s0" => round(b.s0, 3),
                                 "s1" => round(b.s0, 3),
                                 "detail" => format!("changement de couche sans via de \
                                                      masse à moins de {RAYON_MASSE:.1} mm : le retour \
                                                      n'a pas de chemin court")});
            }
        }
        mesure.push(format!("{} via(s) de masse examinés aux changements de couche",
                            vias.len()));
    }

    zones.sort_by(|a, b| (num(a, "s0"), num(a, "s1")).partial_cmp(&(num(b, "s0"), num(b, "s1"))).unwrap_or(std::cmp::Ordering::Equal));
    let couvert = _couvert(&zones, total);
    obj! {"seuil" => round(seuil, 3), "source" => source, "ecarte" => ecarte,
          "zones" => zones, "mesure" => mesure, "longueur" => round(total, 3),
          "couvert" => round(couvert, 4), "vain" => couvert >= COUVERT_VAIN}
}

// ==========================================================================
// DU TEMPS A LA POSITION -- ET CE QUE CET AXE VAUT VRAIMENT
// --------------------------------------------------------------------------
// LE PROFIL DE RETARD REMPLACE LA VITESSE. Un modele uniforme convertirait par
// une seule vitesse ; on garde ici tau(s), le retard cumule en fonction de
// l'abscisse, bloc par bloc. Sur une piste qui change de largeur, d'ecart ou de
// couche, la permittivite effective change avec elle, et une vitesse unique
// decalerait tout ce qui suit le changement.
//
//     NEXT   t(x) = tau_a(x) + tau_v(x)               CONTRE-PROPAGE
//     FEXT   t(x) = tau_a(x) + tau_v(L) - tau_v(x)    CO-PROPAGE
//
// A vitesses egales, la premiere redonne x = v.t/2 -- la convention attendue.
// LA SECONDE N'EST PAS UNE MOYENNE, et l'ecrire comme telle -- t = (tau_a +
// tau_v)/2, ce que faisait la version precedente -- posait un axe qui n'a
// aucun rapport avec la physique du bout lointain. Deux consequences, et la
// seconde est un contresens : t = 0 s'y trouvait envoye sur x = 0 alors
// qu'aucune energie de FEXT ne peut arriver avant min(tau_a(L), tau_v(L)) --
// toute la premiere moitie de l'axe etait physiquement inatteignable --, et le
// pic tombait TOUJOURS a la meme abscisse quel que soit l'endroit du
// longement. L'avertissement « la ligne FEXT ne localise pas » etait donc
// exact, mais la phrase qui le suivait -- « elle se met a localiser lorsque
// les deux vitesses different » -- etait fausse : avec cet axe-la, elle ne
// localisait jamais.
//
// CE QUE L'AXE DU FEXT NE PEUT PAS FAIRE, ET IL FAUT LE DIRE. Le bruit avant
// CO-PROPAGE avec l'agresseur : ce qui se couple en x descend l'agresseur
// jusqu'a x, puis suit la victime jusqu'au bout LOINTAIN. Quand les deux
// pistes ont la MEME vitesse, tau_a(x) - tau_v(x) est constant : la somme ne
// depend plus de x, tout arrive au meme instant, et aucune transformee ne peut
// separer ce qui s'est superpose. La ligne FEXT n'a alors PAS D'AXE DE
// POSITION -- et depuis cette version elle n'en fabrique plus un : la carte ne
// porte pas de ligne FEXT dans ce cas, et la fiche dit laquelle des deux
// raisons l'en empeche. Elle ne se met a localiser que lorsque les deux
// vitesses different ASSEZ pour que l'ecart de retard de bout en bout depasse
// la resolution temporelle de la fenetre -- c'est-a-dire en milieu
// franchement inhomogene, et jamais sur une triplaque.
// ==========================================================================

// Le nombre de colonnes de la carte. Assez pour lire un pic au dixieme de
// millimetre sur une liaison courante, pas assez pour transporter un tableau
// que personne ne regarde.
pub const COLONNES: usize = 400;

// Au-dela de ce nombre, une liste de gestes cesse d'etre une liste de gestes :
// on la lit comme un rapport d'audit et l'on n'en fait aucun.
pub const ACTIONS_MAX: usize = 6;

/// Les gestes a faire, dans l'ordre, ou une liste vide.
///
/// C'EST LA SEULE PARTIE DE LA FICHE QUI SE LIT COMME UNE CONSIGNE, et elle
/// n'ajoute aucun calcul : chaque ligne est une relecture de ce qui a deja ete
/// mesure, tournee du cote de la main plutot que de l'oeil. Un rapport qui
/// dit « -13,8 dB a 12,4 mm » est exact ; il ne dit pas s'il faut ecarter la
/// piste, coudre le plan, ou ne rien faire -- et c'est pourtant la seule
/// question qu'on se pose devant le layout.
///
/// L'ORDRE EST CELUI DE L'EFFET, PAS CELUI DE LA GRAVITE. Ecarter une piste
/// sous un pic que le dessin n'explique pas ne changera rien : ces plages-la
/// passent donc APRES le plan de reference, qui en est la cause probable. A
/// l'inverse une plage que le dessin explique se corrige tout de suite, et
/// c'est le geste le plus rentable de la liste.
///
/// RIEN A FAIRE EST UNE REPONSE. Une liste vide sur un resultat confirme veut
/// dire que le couplage est reparti sur tout le longement sans point chaud :
/// il se corrige en ecartant PARTOUT ou en reculant la victime, pas en
/// reprenant un millimetre.
///
/// LE CUIVRE DE MASSE QU'ON A ROUTE ET QU'ON N'A PAS COUSU DONNE UN GESTE, et
/// c'est le plus rentable de la liste. `blindage` porte ce que la coupe a
/// reellement pose : les pistes de garde, la longueur sur laquelle chacune
/// FLOTTE faute de vias, et les bords de plan arrose qui ont perdu leur masse.
/// Ces deux mesures levaient un avertissement -- donc une phrase a lire -- et
/// ne produisaient AUCUN geste, alors qu'elles sont les seules du fichier a
/// designer un cuivre qui existe deja et qu'il suffit de percer. Une garde
/// flottante ne blinde pas : elle TRANSFERE, et le couplage peut en devenir
/// pire qu'en l'absence de tout cuivre -- l'ecarter de la liste des gestes
/// revenait a taire la correction la moins chere du lot.
///
/// ET LA TRONCATURE SE DIT. `ACTIONS_MAX` coupe la liste pour qu'elle reste
/// une consigne et non un inventaire ; elle la coupait EN SILENCE, si bien
/// qu'un dessin a huit gestes en montrait six et que les deux autres
/// n'existaient nulle part. `omises`, quand on le passe, recoit le compte et
/// la nature de ce qui a ete retire -- meme parti pris que le `refus` de
/// `zones_risque` : une commande qui disparait sans un mot est un bug aux yeux
/// de celui qui s'en servait la veille.
///
/// `desac`, `couples` et `seuil_risque` ne servent pas, comme en Python.
pub fn actions(risques: &[Json], masse: &Json, _desac: &[Json], _couples: &[Json], _seuil_risque: f64, blindage: Option<&Json>,
               omises: Option<&mut Vec<Json>>, borne: bool) -> Vec<Json> {
    let mut gestes: Vec<Json> = Vec::new();
    let zones = els(&masse["zones"]);
    let vain = masse["vain"].vrai();

    // (1) CE QUE LE DESSIN EXPLIQUE : le geste le plus direct qui soit.
    // L'EFFET D'UNE PLAGE EST SON NIVEAU FOIS SA LONGUEUR : sous la
    // saturation, le NEXT qu'elle fabrique vaut Kb*2*T_d/t_r, et T_d est
    // proportionnel a la longueur. Trier par la seule crete placait une
    // tranche de 0,35 mm devant la section de 3,4 mm de la meme voisine -- et
    // la coupe a six gestes emportait alors la section, qui etait le geste.
    let crete = |z: &Json| 10f64.powf(_nb(&z["niveau_db"], -300.0) / 20.0);
    let effet = |z: &Json| -crete(z) * maxf(&[nb(&z["s1"]) - nb(&z["s0"]), 0.0]);
    let moins_niveau = |z: &Json| -_nb(&z["niveau_db"], -300.0);
    let trier = |v: &mut Vec<&Json>, cle: &dyn Fn(&Json) -> f64| v.sort_by(|a, b| cle(a).partial_cmp(&cle(b)).unwrap_or(std::cmp::Ordering::Equal));
    let mut amber: Vec<&Json> = risques.iter().filter(|z| z["justifie"].vrai()).collect();
    trier(&mut amber, if borne { &effet } else { &moins_niveau });
    for z in amber {
        // LE CHIFFRE EST LE NEXT LOCAL, en % de l'agresseur.
        gestes.push(obj! {
            "quoi" => "écarter", "cible" => &z["victime"],
            "ou" => format!("de {} à {} mm", f(&z["s0"], 2), f(&z["s1"], 2)),
            "pourquoi" => if borne {
                format!("le NEXT local y atteint {:.2} % de l'agresseur \
                         et le profil d'espacement l'explique : c'est un \
                         resserrement réel.", 100.0 * crete(z))
            } else {
                format!("le couplage y atteint {:.1} dB et le profil \
                         d'espacement l'explique : c'est un resserrement \
                         réel.", _nb(&z["niveau_db"], 0.0))
            }});
    }

    // (2) LE CUIVRE DE MASSE DEJA ROUTE, ET QU'IL SUFFIT DE PERCER. Il passe
    // AVANT les zones de vigilance du plan : celles-ci designent un endroit ou
    // le plan est douteux, celui-ci designe un conducteur qu'on a dessine expres
    // pour blinder et qui, faute de vias, fait l'inverse. C'est le seul geste de
    // la liste dont on connaisse le sens de l'effet a coup sur.
    let vide = obj! {};
    let blindage = blindage.unwrap_or(&vide);
    for g in els(&blindage["gardes"]) {
        if !(nb(&g["longueur_flottante"]) > 0.0) {
            continue;
        }
        gestes.push(obj! {
            "quoi" => "coudre la garde", "cible" => g.get("net").cloned().unwrap_or(Json::Texte("?".into())),
            "ou" => format!("sur {:.2} mm des {:.2} mm qu'elle longe",
                            nb(&g["longueur_flottante"]), nb(&g["longueur"])),
            "pourquoi" => format!("son plus grand trou de couture vaut {:.2} mm, au-delà \
                                   de ce que le front autorise : cette garde est posée \
                                   FLOTTANTE dans la coupe. Un tel cuivre ne blinde pas, \
                                   il TRANSFÈRE — le couplage peut y être PIRE qu'en \
                                   l'absence de toute garde. La percer est la correction \
                                   la moins chère de cette liste.",
                                  nb(&g["couture"]))});
    }
    for b0 in els(&blindage["bords_non_cousus"]) {
        gestes.push(obj! {
            "quoi" => "coudre le plan arrosé", "cible" => format!("bord {}",
                    b0.get("cote").map_or("?".to_string(), str_py)),
            "ou" => format!("sur {:.2} mm", nb(&b0["longueur"])),
            "pourquoi" => format!("le plus grand trou entre deux vias y vaut {:.2} mm : \
                                   l'effet coplanaire de ce côté a été ANNULÉ dans les \
                                   sections concernées plutôt que de faire cadeau d'une \
                                   masse idéale. Le couplage rendu est celui d'un bord \
                                   SANS masse à portée.",
                                  nb(&b0["couture"]))});
    }

    // (3) LE PLAN DE REFERENCE, quand il est mis en cause.
    let couture: Vec<&Json> = zones.iter().filter(|z| z["type"].as_str() == Some("couture")).collect();
    if !couture.is_empty() {
        let mut pire = couture[0];
        for z in &couture[1..] {
            if _nb(&z["pas"], 0.0) > _nb(&pire["pas"], 0.0) {
                pire = z;
            }
        }
        gestes.push(obj! {
            "quoi" => "coudre le plan", "cible" => "masse",
            "ou" => format!("de {} à {} mm (le plus grand trou)",
                            f(&pire["s0"], 2), f(&pire["s1"], 2)),
            "pourquoi" => format!("{} zone(s) au-delà du seuil de {:.2} mm ; le plus \
                                   grand pas vaut {:.2} mm. Un cuivre de masse qui \
                                   flotte ne blinde plus, il TRANSFÈRE.",
                                  couture.len(), _nb(&masse["seuil"], 0.0),
                                  _nb(&pire["pas"], 0.0))});
    }
    for z in zones.iter().filter(|x| x["type"].as_str() == Some("fente")) {
        gestes.push(obj! {
            "quoi" => "reprendre le plan", "cible" => "masse",
            "ou" => format!("de {} à {} mm", f(&z["s0"], 2), f(&z["s1"], 2)),
            "pourquoi" => "discontinuité du plan sous le parcours : le retour \
                           fait le tour, et la boucle rayonne."});
    }
    for z in zones.iter().filter(|x| x["type"].as_str() == Some("transition")) {
        gestes.push(obj! {
            "quoi" => "poser un via de masse", "cible" => "masse",
            "ou" => format!("à {} mm (changement de couche)", f(&z["s0"], 2)),
            "pourquoi" => "le retour n'a pas de chemin court là où le signal \
                           change de plan."});
    }

    // (4) CE QUE RIEN N'EXPLIQUE : un endroit a REGARDER, pas un geste. On le
    // dit tel quel plutot que d'inventer une correction.
    let mut reste: Vec<&Json> = risques.iter().filter(|z| !z["justifie"].vrai()).collect();
    trier(&mut reste, &moins_niveau);
    for z in reste {
        gestes.push(obj! {
            "quoi" => "aller voir", "cible" => &z["victime"],
            "ou" => format!("de {} à {} mm", f(&z["s0"], 2), f(&z["s1"], 2)),
            "pourquoi" => format!("le couplage y monte sans que les deux pistes s'y \
                                   rapprochent : écarter ne servira à rien. {}",
                                  if vain {
                                      "Une zone de vigilance y tombe, mais elles \
                                       couvrent trop du parcours pour que ce soit un \
                                       renseignement.".to_string()
                                  } else if z["zone"].vrai() {
                                      format!("Une zone « {} » y tombe.", str_py(&z["zone"]))
                                  } else {
                                      "Aucune zone de vigilance n'y tombe non plus.".to_string()
                                  })});
    }

    // LA COUPE SE DIT. Six gestes tiennent comme une consigne ; au-dela on
    // relit un inventaire et l'on n'en fait aucun. Mais couper sans le dire
    // laissait deux gestes mesures n'exister nulle part -- ni a l'ecran, ni
    // dans le rapport exporte, qui est pourtant le fichier qu'on emporte.
    // UNE NATURE DE GESTE NE DISPARAIT PAS DERRIERE UNE AUTRE. Couper aux six
    // premiers laissait six « ecarter » et emportait « coudre le plan » : or
    // un geste d'une autre nature apprend plus que le septieme du meme genre.
    // On garde donc le premier de chaque nature, puis on complete dans
    // l'ordre -- l'ordre d'affichage restant celui de l'effet.
    if gestes.len() > ACTIONS_MAX {
        let (mut garder, mut natures): (Vec<usize>, Vec<Json>) = (Vec::new(), Vec::new());
        for (k, g) in gestes.iter().enumerate() {
            if !natures.contains(&g["quoi"]) && garder.len() < ACTIONS_MAX {
                natures.push(g["quoi"].clone());
                garder.push(k);
            }
        }
        for k in 0..gestes.len() {
            if garder.len() >= ACTIONS_MAX {
                break;
            }
            if !garder.contains(&k) {
                garder.push(k);
            }
        }
        garder.sort();
        let restant: Vec<Json> = gestes.iter().enumerate().filter(|(k, _)| !garder.contains(k)).map(|(_, g)| g.clone()).collect();
        gestes = garder.iter().map(|&k| gestes[k].clone()).chain(restant).collect();
    }
    if let Some(omises) = omises {
        if gestes.len() > ACTIONS_MAX {
            let restant = &gestes[ACTIONS_MAX..];
            let mut quoi: Vec<String> = Vec::new();
            for g in restant {
                let q = str_py(&g["quoi"]);
                if !quoi.contains(&q) {
                    quoi.push(q);
                }
            }
            omises.push(obj! {"nombre" => restant.len(), "natures" => quoi.clone(),
                              "detail" => format!("{} geste(s) de plus ne sont pas listés \
                                                   ici — {}. Le fichier .csv et le rapport \
                                                   portent les mesures dont ils sortent.",
                                                  restant.len(), quoi.join(", "))});
        }
    }
    gestes.truncate(ACTIONS_MAX);
    gestes
}

/// Un avertissement qui CHANGE LA LECTURE de la carte, pas un avis de plus.
///
/// DEUX LONGUEURS POUR LA MEME CHOSE, ET LES DEUX SERVENT. Le TITRE tient sur
/// une ligne : c'est ce qui s'affiche, et ce qu'on lit en trois secondes avant
/// de decider si l'on creuse. Le TEXTE explique pourquoi cela compte et quoi
/// faire ; il attend, replie, et se retrouve entier dans le rapport exporte.
/// Une reserve qui ne s'affiche qu'en soixante mots n'est pas lue -- et une
/// reserve non lue vaut une reserve absente, ce qui est le defaut qu'on
/// cherche justement a ne jamais produire.
///
/// LE TITRE N'EST PAS UN RESUME DU TEXTE : c'est le FAIT, sans le pourquoi.
/// « la carte ne localise rien » se verifie d'un coup d'oeil ; « la resolution
/// spatiale depasse le quart du parcours, donc... » demande deja de lire.
pub fn _grave(avert: &mut Vec<String>, graves: &mut Vec<Json>, titre: impl Into<String>, msg: impl Into<String>) {
    let msg = msg.into();
    avert.push(msg.clone());
    graves.push(obj! {"titre" => titre.into(), "texte" => msg});
}

/// La premiere zone de vigilance qui couvre l'abscisse `s`, ou None.
///
/// LA TOLERANCE VIENT DE L'APPELANT, ET C'EST LA MEME QUE PARTOUT AILLEURS :
/// la RESOLUTION de la ligne lue, ou la demi-largeur de la plage examinee.
/// Un demi-millimetre en dur -- ce qu'employait la version precedente -- etait
/// tantot dix fois trop fin (une carte qui ne distingue rien en deca de 5 mm y
/// manquait la zone qui explique son pic) tantot trop large, et il ne suivait
/// aucun reglage. Le reste du module tolere a la resolution ; celui-ci ne
/// faisait pas exception, il l'ignorait.
pub fn _zone_a(zones: &[Json], s: f64, tol: f64) -> Option<&Json> {
    zones.iter().find(|z| num(z, "s0") - tol <= s && s <= num(z, "s1") + tol)
}

/// Les plages du parcours ou le couplage de chaque victime SE FABRIQUE.
///
/// C'EST LA CARTE, RENDUE SOUS UNE FORME QU'ON PEUT POSER SUR LE CUIVRE. La
/// figure du panneau range les victimes en lignes sur un axe commun, ce qui
/// est ce qu'il faut pour les COMPARER ; devant le dessin, la question n'est
/// plus « laquelle prend le plus » mais « quel millimètre de CELLE-CI dois-je
/// reprendre ». Une plage repond a la seconde, et c'est le meme chiffre.
///
/// LE SEUIL EST RELATIF A LA VICTIME ELLE-MEME, et c'est deliberé. Un seuil
/// absolu en decibels dirait « cette piste prend trop », ce que le tableau de
/// l'etape 0b dit deja, et mieux. Ce qu'on cherche ici est OU, sur cette
/// piste-la, son propre couplage se fabrique : la moitie de son maximum, soit
/// -6 dB sous son pire point, est la fraction qui separe une crete d'un pied
/// de crete. Elle se regle.
///
/// ON NE LIT QUE LE NEXT, pour la meme raison que le recoupement : la ligne
/// FEXT ne localise rien a vitesses egales, et peindre sur le cuivre une plage
/// tiree d'une ligne qui ne designe aucune abscisse serait le plus credible
/// des mensonges — un trait rouge sur une piste, a un endroit precis, qui ne
/// veut rien dire.
///
/// UN REFUS SE DIT, IL NE SE TAIT PAS. Quand une ligne ne peut pas etre
/// localisee, `refus` recoit la raison : sans elle, le bouton « sur le
/// cuivre » disparait de la fiche et l'on cherche ce qu'on a casse. Une
/// commande absente est un bug aux yeux de celui qui s'en servait la veille.
///
/// CHAQUE PLAGE PORTE SON VERDICT, et c'est ce qui la rend actionnable :
/// `justifie` est faux quand un pic non explique tombe dedans — le dessin des
/// pistes ne rend pas compte de ce couplage-la, et c'est ailleurs qu'il faut
/// chercher ; `zone` nomme la zone de vigilance du plan qui tombe au meme
/// endroit, quand il y en a une. Les deux se peignent differemment parce
/// qu'ils ne demandent pas le meme geste.
pub fn zones_risque(lignes: &[Json], axe: &[f64], desac: &[Json], zones: &[Json], fraction: f64, mut refus: Option<&mut Vec<Json>>) -> Vec<Json> {
    if axe.len() < 2 {
        return Vec::new();
    }
    let etendue = axe[axe.len() - 1] - axe[0];
    let demi = 0.5 * etendue / (axe.len() - 1).max(1) as f64;
    let mut sorties = Vec::new();
    for ligne in lignes {
        if ligne["sens"].as_str() != Some("next") {
            continue;
        }
        // UNE PLAGE QUI NE LOCALISE RIEN NE SE PEINT PAS. Quand la resolution
        // depasse le quart du parcours -- le seuil que la fiche emploie deja
        // pour alerter --, la carte ne distingue plus qu'une poignee de zones
        // et la plage couvrirait le trace entier EN AYANT L'AIR de designer un
        // endroit. Un trait ambre sur toute la piste est plus trompeur que pas
        // de trait du tout : on va y chercher un millimetre qui n'existe pas.
        let res = _nb(&ligne["resolution"], 0.0);
        if res > etendue / 4.0 && etendue / 4.0 > 0.0 {
            if let Some(refus) = refus.as_deref_mut() {
                refus.push(obj! {
                    "victime" => &ligne["victime"],
                    "raison" => format!("résolution de {res:.2} mm pour un parcours de \
                                         {etendue:.2} mm : une plage couvrirait le tracé entier \
                                         en ayant l'air de désigner un endroit.")});
            }
            continue;
        }
        let v: Vec<f64> = els(&ligne["valeurs"]).iter().map(|x| x.as_f64().unwrap_or(f64::NAN)).collect();
        let max_de = |t: &[f64]| t.iter().copied().fold(f64::NEG_INFINITY, f64::max);
        let pire = if v.is_empty() { 0.0 } else { max_de(&v) };
        if !(pire > 0.0) {
            continue;
        }
        let seuil = pire * fraction;
        // LES PLAGES SONT LES SUITES CONTIGUES AU-DESSUS DU SEUIL. On les prend
        // de bord a bord de case -- une case est une portion de piste, pas un
        // point --, sans quoi une plage d'une seule case serait de longueur
        // nulle et ne se peindrait pas.
        let mut debut: Option<usize> = None;
        for i in 0..=v.len() {
            let haut = i < v.len() && v[i] >= seuil;
            if haut && debut.is_none() {
                debut = Some(i);
            } else if let (false, Some(d)) = (haut, debut) {
                let s0 = axe[d] - demi;
                let s1 = axe[i - 1] + demi;
                let crete = max_de(&v[d..i]);
                let dans = desac.iter().any(|x| x["victime"] == ligne["victime"]
                                            && s0 - demi <= num(x, "s") && num(x, "s") <= s1 + demi);
                // LA PLAGE A UNE ETENDUE : une zone qui la CHEVAUCHE l'explique,
                // et la demi-largeur de la plage est donc la tolerance
                // juste -- pas un demi-millimetre pose la.
                let zone = _zone_a(zones, 0.5 * (s0 + s1),
                                   maxf(&[demi, 0.5 * (s1 - s0).abs()]));
                sorties.push(obj! {
                    "victime" => &ligne["victime"],
                    "agresseur" => &ligne["agresseur"],
                    "s0" => round(maxf(&[axe[0], s0]), 3),
                    "s1" => round(minf(&[axe[axe.len() - 1], s1]), 3),
                    "niveau" => round(crete / pire, 4),
                    "niveau_db" => round(_db(crete), 2),
                    // UN PIC EXPLIQUE PAR LE PLAN N'EST PAS UN PIC EXPLIQUE
                    // PAR L'ECART. Tout ce que `desaccords` rend est, par
                    // construction, un pic que le DESSIN DES PISTES ne rend pas
                    // compte : peindre en ambre -- « ca se corrige en ecartant »
                    // -- une plage qui en contient un contredirait la phrase que
                    // la fiche ecrit trois lignes plus haut sur le meme pic.
                    "justifie" => !dans,
                    "zone" => zone.and_then(|z| z.get("type")).cloned().unwrap_or(Json::Texte(String::new()))});
                debut = None;
            }
        }
    }
    sorties
}
