//! Les changements de couche de la selection, et la question « est-ce une chaine ? ».

use super::base::*;
use super::discontinuites::_hauteur_via;

/// Les changements de couche le long de la sélection.
///
/// Deux tronçons consécutifs sur des couches différentes forment une transition.
/// Elle est nommée (« Conductor-4 → Conductor-1 au tronçon 7 ») et listée.
///
/// Rend une liste de dicts : {troncon, couche_depart, couche_arrivee,
/// nom_depart, nom_arrivee, est_via}.
pub fn _transitions(objets: &[Json], couches: &[Json]) -> Vec<Json> {
    let mut resultats = Vec::new();
    for i in 1..objets.len() {
        let obj_prev = &objets[i - 1];
        let obj_curr = &objets[i];

        let couche_prev = ent(&obj_prev["layer"], -1);
        let couche_curr = ent(&obj_curr["layer"], -1);

        if couche_prev < 0 || couche_curr < 0 {
            continue;
        }
        if couche_prev == couche_curr {
            continue;
        }

        // Noms des couches
        let nom = |k: i64| -> Json {
            if 0 <= k && k < couches.len() as i64 {
                couches[k as usize].get("name").cloned().unwrap_or_else(|| format!("Conductor-{}", k + 1).j())
            } else {
                "".j()
            }
        };

        resultats.push(obj! {
            "troncon" => i,
            "couche_depart" => couche_prev,
            "couche_arrivee" => couche_curr,
            "nom_depart" => nom(couche_prev),
            "nom_arrivee" => nom(couche_curr),
            "est_via" => false,  // déterminé plus tard avec les vias réels
            // LA HAUTEUR SE LIT ICI, parce que c'est ici qu'on a l'empilage.
            // `_cotes_via` ne l'a pas, et c'est pour cela qu'elle la supposait.
            "hauteur_empilage" => _hauteur_via(couches, &couche_prev.j(), &couche_curr.j()),
        });
    }
    resultats
}

type Point = (f64, f64);

fn proche(p: Point, q: Point) -> bool {
    py::hypot(q.0 - p.0, q.1 - p.1) <= TOLERANCE_RACCORD
}

/// Combien de fois la suite cesse d'être un parcours continu.
///
/// BUG CORRIGÉ (2026-08-28) : la version précédente ne comparait que les
/// coordonnées XY. Or les deux bouts d'un VIA sont au MÊME XY sur deux couches
/// différentes : la chaîne était déclarée continue et le via passait inaperçu.
///
/// On compare maintenant les coordonnées ET la couche : deux tronçons au même
/// XY sur des couches différentes ne sont pas un raccord — c'est un via.
/// De même, deux tronçons sur la même couche mais sans contact XY sont une
/// rupture, comme avant.
///
/// BUG CORRIGÉ (2026-08-30) : le cas du via exigeait DEUX points de contact.
/// Un via en fournit UN — la fin d'un tronçon et le début du suivant. Toute
/// liaison changeant de couche était donc comptée comme rompue, et le panneau
/// prévenait à tort d'une rupture devant un parcours continu. Un avertissement
/// qui crie à tort finit par ne plus être lu : c'est ce qui rend ce défaut
/// plus grave que son ampleur.
pub fn _ruptures(objets: &[Json]) -> (i64, Vec<Json>) {
    let mut n = 0;
    let mut ruptures_detail = Vec::new();
    let mut precedent: Option<((Point, Point), i64)> = None;
    for (i, obj) in objets.iter().enumerate() {
        let couche = ent(&obj["layer"], -1);
        let Some(e) = _extremites(obj) else {
            continue; // sans coordonnées, on ne juge pas
        };

        if let Some((e_prev, couche_prev)) = precedent {
            // Vérifier si les extrémités se touchent
            let contact = [e_prev.0, e_prev.1].iter().any(|&p| [e.0, e.1].iter().any(|&q| proche(q, p)));
            if couche_prev == couche {
                // Même couche : il faut un contact XY
                if !contact {
                    n += 1;
                    ruptures_detail.push(obj! {"type" => "rupture_xy", "troncon" => i});
                }
            } else {
                // COUCHE DIFFERENTE : UN SEUL POINT DE CONTACT SUFFIT, et c'est
                // la correction. La version precedente en exigeait DEUX, en
                // commentant « les deux bouts du via sont au meme XY ». Non :
                // un via joint la FIN d'un troncon au DEBUT du suivant, ce qui
                // fait UN point commun -- deux troncons qui en partageraient
                // deux seraient superposes, ce qui n'arrive pas. Toute liaison
                // passant par un via etait donc declaree ROMPUE, et le panneau
                // affichait « la selection n'est pas un parcours continu »
                // devant un parcours parfaitement continu. Mesure : liaison
                // TOP -> BOT de deux troncons colineaires, 1 raccord annonce
                // manquant, alors que le raccord EST le via.
                if !contact {
                    n += 1;
                    ruptures_detail.push(obj! {
                        "type" => "rupture_via",
                        "troncon" => i,
                        "couche_prev" => couche_prev,
                        "couche_curr" => couche,
                    });
                }
            }
        }

        precedent = Some((e, couche));
    }
    (n, ruptures_detail)
}

// ==========================================================================
// La selection est-elle une chaine ?
// ==========================================================================
// LA MISE EN CASCADE SUPPOSE UNE CHAINE, et rien d'autre : un troncon, puis le
// suivant, bout a bout, dans l'ordre ou ils arrivent. C'est vrai d'une piste
// suivie d'un bout a l'autre. Ce ne l'est pas d'un net entier, qui se ramifie
// en T vers trois recepteurs, ni d'une selection ramassee dans un ordre
// quelconque -- et le produit de matrices ABCD n'est PAS commutatif : les memes
// troncons dans un autre ordre donnent un autre S11.
//
// Les impedances par troncon, elles, ne sont pas concernees : chacune ne depend
// que de sa propre section. C'est pourquoi la carte de chaleur reste juste la
// ou la courbe S ne l'est plus, et c'est exactement ce que dit l'avertissement.
//
// On ne devine pas la topologie : on verifie seulement que chaque troncon
// touche le precedent. Un decrochage suffit a dire que la suite envoyee n'est
// pas un parcours, et c'est tout ce qu'il faut savoir pour prevenir.
// ==========================================================================

pub const TOLERANCE_RACCORD: f64 = 0.02; // mm ; large, pour ne pas crier a tort

/// Les deux ecarts au cuivre de masse d'un troncon, en millimetres.
///
/// « gap_left » et « gap_right » quand la page les donne -- elle mesure chaque
/// cote separement --, « gap » sinon, qui vaut LES DEUX COTES. Un document
/// ecrit avant la 2.3.0 ne porte que « gap » et doit donner exactement ce
/// qu'il donnait, sans quoi une comparaison entre deux versions ne voudrait
/// rien dire.
pub fn _ecarts(obj: &Json) -> (f64, f64) {
    let (mut g, mut d) = (&obj["gap_left"], &obj["gap_right"]);
    if nul(g) && nul(d) {
        g = &obj["gap"];
        d = g;
    }
    (maxf(&[0.0, _nombre(g, 0.0)]), maxf(&[0.0, _nombre(d, 0.0)]))
}

/// La cle du cache de section : (couche, largeur, epaisseur, ecart gauche, ecart droit),
/// les flottants par leurs bits.
pub type CleSection = (i64, [u64; 4]);

/// La cle du cache de section : tout ce dont la section droite depend.
///
/// ELLE EST ICI ET NULLE PART AILLEURS. Elle etait ecrite deux fois -- dans la
/// boucle des impedances et dans celle des parametres S -- et les deux devaient
/// s'accorder au chiffre pres pour que la seconde retrouve ce que la premiere
/// avait calcule. Rien ne le garantissait : ajouter un terme d'un cote et pas
/// de l'autre y levait un KeyError, ou pire, y prenait la section d'un autre
/// troncon.
pub fn _cle_section(obj: &Json) -> CleSection {
    let (g, d) = _ecarts(obj);
    let b = |x: f64| (round(x, 6) + 0.0).to_bits();
    (ent(&obj["layer"], 0),
     [b(nb(&obj["width"])),
      b(_nombre(&obj["copper_thickness"], 0.035)),
      b(g), b(d)])
}

/// (depart, arrivee) d'un objet, ou None s'il ne porte pas ses points.
pub fn _extremites(obj: &Json) -> Option<(Point, Point)> {
    Some((_bout(obj, "start")?, _bout(obj, "end")?))
}

// ==========================================================================
// LA COUTURE, ET CE QU'ELLE CHANGE — UN CUIVRE NON COUSU NE BLINDE PAS
// --------------------------------------------------------------------------
// LA SECTION POSE LE CUIVRE DE MASSE COPLANAIRE comme un conducteur TENU A ZERO
// VOLT. C'est vrai d'un plan cousu de vias ; c'est faux d'une garde qui ne l'est
// pas, et l'ecart n'est pas une question de precision, c'est un changement de
// NATURE :
//
//   · COUSU, le cuivre termine les lignes de champ entre agresseur et victime :
//     il BLINDE. Mesure sur une garde entre deux signaux : le NEXT tombe de
//     0,88 % (sans garde) a 0,53 % ;
//   · NON COUSU, c'est un conducteur FLOTTANT. L'agresseur le charge, il porte
//     cette charge sur toute sa longueur et la rend a la victime : il TRANSFERE.
//     Meme geometrie, le NEXT monte a 1,04 % -- soit PIRE que pas de garde du
//     tout. C'est le piege exact du dessin, et le modele le voit desormais.
//
// LE CRITERE EST UNE LONGUEUR D'ONDE, pas un nombre de vias. Un cuivre est
// « tenu » tant que le plus grand trou entre deux coutures reste petit devant la
// longueur d'onde a la frequence du GENOU du front -- la regle du metier est
// lambda/10. Comme f_genou = 0,35 / t_r et lambda = v / f, cela s'ecrit :
//
//     trou_max  <  v . t_r / 3,5
//
// soit, joliment, moins d'un TIERS de la longueur physique du front. La vitesse
// exacte demanderait d'avoir deja resolu la section ; on prend celle d'un
// stratifie courant, et l'erreur qu'elle laisse est sans commune mesure avec
// celle qu'on corrige.
//
// CE QUE LE MODELE NE CAPTURE TOUJOURS PAS : la RESONANCE. Un cuivre flottant
// est aussi une ligne non terminee, qui sonne aux multiples de lambda/2. Le
// quasi-statique n'en sait rien -- il rend le transfert, pas le pic. Le chiffre
// est donc juste dans son principe et optimiste a ces frequences-la.
// ==========================================================================

pub const VITESSE_TYPIQUE: f64 = 1.5e8; // m/s ; stratifie courant, eps_eff ~ 4
pub const COUTURE_FRACTION: f64 = 1.0 / 3.5; // lambda/10 a la frequence du genou

/// Le plus grand trou de couture encore acceptable, en MILLIMETRES.
pub fn _couture_max(t_r: f64) -> f64 {
    if t_r > 0.0 { 1e3 * VITESSE_TYPIQUE * t_r * COUTURE_FRACTION } else { 0.0 }
}

/// Les deux plus grands trous de couture d'un troncon, en millimetres.
///
/// Zero veut dire « la page ne l'a pas mesure » -- un outil qui n'envoie pas
/// la couture ne doit pas voir tout son cuivre declare flottant. C'est le
/// repli sur l'ancien comportement, et il est du bon cote : on suppose tenu ce
/// qu'on ne sait pas.
pub fn _couture(obj: &Json) -> (f64, f64) {
    (_nombre(&obj["couture_left"], 0.0),
     _nombre(&obj["couture_right"], 0.0))
}

/// Les noeuds de la selection : un point du plan, et les bouts qui s'y rejoignent.
///
/// GROUPES PAR TOLERANCE ET NON PAR EGALITE, pour la meme raison que du cote
/// des pages : deux bouts distants de trois microns sont le meme point du
/// cuivre, et un casier de coordonnees arrondies les separerait.
///
/// LA COUCHE COMPTE, SAUF AU DROIT D'UN VIA. Deux troncons au meme XY sur
/// deux couches differentes sont joints par un via -- c'est ce que dit deja
/// `_ruptures` --, mais seulement LA OU IL Y A UN VIA. Ne pas regarder la
/// couche du tout faisait d'un simple chevauchement vu de dessus un noeud :
/// une paire qui se croise par la couche d'en face repasse, sur l'autre
/// couche, exactement sous le moignon qui mene a son via, et ce point-la
/// paraissait rejoindre QUATRE bouts -- une derivation inventee, et la
/// cascade refusee. Un via se reconnait a ce que la page accroche au troncon
/// qui en part (`via`), ou a deux troncons CONSECUTIFS de couches differentes
/// qui se touchent -- la regle meme de `_ruptures`.
///
/// UN TRONCON PLUS COURT QUE LA TOLERANCE EST UN POINT, pas une branche : ses
/// deux bouts tombent dans le meme noeud et y compteraient deux fois. Il
/// n'est pas juge -- les pages en produisent en coupant une piste au droit
/// d'un changement d'ecart a la masse.
///
/// Rend (centres, membres, rangs) : les points, les indices de troncons a
/// chaque point, et pour chaque troncon le couple de ses deux noeuds -- None
/// quand il ne porte pas ses coordonnees, auquel cas on ne le juge pas.
#[allow(clippy::type_complexity)]
pub fn _noeuds(objets: &[Json]) -> (Vec<Point>, Vec<Vec<usize>>, Vec<Option<[usize; 2]>>) {
    let bouts: Vec<Option<(Point, Point)>> = objets.iter().map(_extremites).collect();
    let couches: Vec<i64> = objets.iter().map(|o| ent(&o["layer"], -1)).collect();
    let mut vias: Vec<Point> = Vec::new();
    for (i, e) in bouts.iter().enumerate() {
        let Some(e) = e else { continue };
        if objets[i]["via"].vrai() {
            vias.push(e.0);
        }
        // UN SEUL POINT DE RACCORD PAR CHANGEMENT DE COUCHE, et d'abord la fin
        // du precedent contre le debut du suivant -- l'ordre du parcours. Un
        // moignon dessine a l'identique sur les deux couches se touche aussi
        // par ses deux AUTRES bouts, qui ne sont pas un via.
        if i > 0 && couches[i - 1] != couches[i] {
            if let Some(a) = bouts[i - 1] {
                for (p, q) in [(a.1, e.0), (a.1, e.1), (a.0, e.0), (a.0, e.1)] {
                    if proche(p, q) {
                        vias.push(q);
                        break;
                    }
                }
            }
        }
    }
    let au_via = |p: Point| vias.iter().any(|&v| proche(p, v));

    let (mut centres, mut membres, mut rangs, mut couche_de) = (Vec::new(), Vec::<Vec<usize>>::new(), Vec::new(), Vec::new());
    for (i, e) in bouts.iter().enumerate() {
        let Some(e) = e.filter(|e| !proche(e.0, e.1)) else {
            rangs.push(None);
            continue;
        };
        let mut r = [0usize; 2];
        for (j, p) in [e.0, e.1].into_iter().enumerate() {
            let c = match (0..centres.len()).find(|&k| proche(p, centres[k]) && (couche_de[k] == couches[i] || au_via(p))) {
                Some(k) => k,
                None => {
                    centres.push(p);
                    membres.push(Vec::new());
                    couche_de.push(couches[i]);
                    centres.len() - 1
                }
            };
            membres[c].push(i);
            r[j] = c;
        }
        rangs.push(Some(r));
    }
    (centres, membres, rangs)
}

/// La selection est-elle une CHAINE, et sinon POURQUOI.
///
/// TROIS CHOSES DISTINCTES QU'UN SEUL COMPTEUR DE RUPTURES CONFONDAIT :
///
///   - L'ORDRE. Les troncons se touchent bout a bout dans l'ordre envoye.
///     C'est cela, et rien d'autre, que la mise en cascade ABCD exige.
///   - LA CONNEXITE. Ils forment une seule piece, meme mal rangee.
///   - LE DEGRE. Un noeud ou se rejoignent trois bouts est une DERIVATION.
///
/// Et la distinction porte, parce qu'elle change ce qu'il y a a dire. Une
/// selection connexe, sans derivation, mais envoyee dans le desordre est
/// REORDONNABLE : la page peut la ranger et les parametres S redeviennent
/// justes. Un bus qui se ramifie en T ne l'est pas, et aucun ordre ne le
/// sauvera -- il n'a pas deux acces, il en a trois. Repondre « la selection
/// n'est pas un parcours continu » aux deux, c'est demander a l'un de faire ce
/// qui est impossible, et taire a l'autre ce qu'il suffirait de faire.
///
/// Genres rendus : "chaine", "desordre", "ramifiee", "eparse", "boucle",
/// "sans_coordonnees".
pub fn _topologie(objets: &[Json]) -> Json {
    let (ruptures, detail) = _ruptures(objets);
    let (centres, membres, rangs) = _noeuds(objets);
    let juges: Vec<usize> = (0..rangs.len()).filter(|&i| rangs[i].is_some()).collect();
    if juges.is_empty() {
        // Sans coordonnees on ne juge pas, et surtout on ne REFUSE pas : un
        // document ecrit a la main qui ne porte que des longueurs reste une
        // chaine parfaitement legitime, envoyee dans l'ordre.
        return obj! {"genre" => "sans_coordonnees", "chaine" => false, "cascadable" => true,
                     "ruptures" => ruptures, "ruptures_detail" => detail,
                     "derivations" => Vec::<Json>::new(), "morceaux" => 0i64, "bouts_libres" => 0i64};
    }

    // Les derivations : un point ou aboutissent TROIS bouts ou plus. C'est le
    // seul defaut de topologie qu'aucun rangement ne corrige.
    let derivations: Vec<Json> = membres.iter().enumerate().filter(|(_, m)| m.len() >= 3)
        .map(|(k, m)| obj! {"x" => round(centres[k].0, 4), "y" => round(centres[k].1, 4),
                            "branches" => m.len()})
        .collect();

    // Les morceaux : deux troncons sont du meme morceau s'ils partagent un
    // noeud. Un parcours n'en fait qu'un.
    let mut reste: std::collections::BTreeSet<usize> = juges.iter().copied().collect();
    let mut morceaux = 0i64;
    while let Some(premier) = reste.pop_first() {
        morceaux += 1;
        let mut pile = vec![premier];
        while let Some(i) = pile.pop() {
            for c in rangs[i].unwrap_or([0, 0]) {
                for &v in &membres[c] {
                    if reste.remove(&v) {
                        pile.push(v);
                    }
                }
            }
        }
    }

    let bouts_libres = membres.iter().filter(|m| m.len() == 1).count() as i64;

    let genre = if !derivations.is_empty() {
        "ramifiee"
    } else if morceaux > 1 {
        "eparse"
    } else if bouts_libres != 2 {
        // NI DEUX EXTREMITES : la selection se referme sur elle-meme. Une
        // boucle n'a pas d'entree ni de sortie, donc pas de matrice S a deux
        // ports -- et la cascader reviendrait a la couper en un point
        // arbitraire, en rendant un chiffre qui depend de ce choix-la.
        "boucle"
    } else if ruptures != 0 {
        "desordre"
    } else {
        "chaine"
    };

    obj! {"genre" => genre, "chaine" => genre == "chaine",
          "cascadable" => genre == "chaine",
          "ruptures" => ruptures, "ruptures_detail" => detail,
          "derivations" => derivations, "morceaux" => morceaux,
          "bouts_libres" => bouts_libres}
}

/// La phrase qui va avec le genre, ou "" quand la cascade est legitime.
///
/// Ce qu'on dit a l'ecran pour chaque genre, et ce qu'on demande. Le texte vit
/// ICI et pas dans `simuler` : c'est la seule liste ou l'on voit d'un coup que
/// chaque genre a bien sa phrase, et qu'aucune ne promet ce que le calcul ne
/// fait pas.
pub fn raison_topologie(topo: &Json) -> String {
    let entier = |v: &Json| v.as_f64().unwrap_or(0.0) as i64;
    match topo["genre"].as_str() {
        Some("desordre") => format!(
            "La sélection est bien un parcours, mais elle n'a pas été envoyée dans\
             \x20l'ordre du parcours : {} raccord(s) manquent entre deux\
             \x20tronçons consécutifs. Rangez-la d'un bout à l'autre et les\
             \x20paramètres S redeviennent calculables.", entier(&topo["ruptures"])),
        Some("ramifiee") => format!(
            "La liaison se ramifie : {} point(s) où trois branches ou\
             \x20plus se rejoignent. Ce n'est pas une chaîne — il n'y a pas deux accès\
             \x20mais plusieurs, et aucun ordre n'y changera rien. Sélectionnez une\
             \x20branche d'un bout à l'autre pour obtenir des paramètres S.", els(&topo["derivations"]).len()),
        Some("eparse") => format!(
            "La sélection est en {} morceaux qui ne se touchent pas.\
             \x20Une mise en cascade suppose un cuivre continu.", entier(&topo["morceaux"])),
        Some("boucle") =>
            "La sélection se referme sur elle-même : elle n'a pas deux extrémités\
             \x20libres. Une matrice S à deux ports suppose une entrée et une sortie.".to_string(),
        _ => String::new(),
    }
}
