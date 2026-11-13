// ==========================================================================
// LE COUPLAGE ENTRE PISTES PARALLELES
// --------------------------------------------------------------------------
// UNE SEULE GEOMETRIE POUR DEUX QUESTIONS. « Quelle est l'impedance
// differentielle de cette paire ? » et « combien cette piste prend-elle a sa
// voisine ? » sont la meme section a deux conducteurs, resolue une fois par
// `ligne_mom.solve_multiline`. Ce qui change est ce qu'on en lit : les modes
// pair/impair pour la premiere, NEXT et FEXT pour la seconde. Les deux fiches
// du panneau lisent donc la MEME liste.
//
// CE QUI MANQUAIT, ET QUI EST ICI : L'APPARIEMENT. Le solveur sait resoudre
// deux rubans depuis qu'il sait en resoudre N ; encore faut-il savoir QUELLES
// pistes sont parallelles, SUR QUELLE LONGUEUR, et A QUELLE DISTANCE. C'est de
// la geometrie plane, et elle est ici plutot que dans les deux pages : deux
// implementations de la meme regle auraient derive, et l'editeur et la
// visionneuse doivent donner le meme chiffre sur la meme carte.
//
// CE QUE LA PAGE APPORTE, elle seule : le cuivre voisin. La selection ne
// contient que ce qu'on a designe ; l'agresseur, par definition, n'en fait pas
// partie. Les deux outils envoient donc `voisinage` -- les troncons de piste
// qui passent a portee, au meme format que la geometrie.
//
// LES REGLES, ET ELLES SONT VOLONTAIREMENT SEVERES :
//   · MEME COUCHE. Deux pistes superposees sur deux couches couplent aussi,
//     mais ce n'est plus la section que ce solveur resout -- il n'a qu'un plan
//     de conducteurs. C'est dit dans les avertissements plutot que calcule
//     faux ;
//   · PARALLELES A 15 degres pres. Au-dela, la « longueur de recouvrement »
//     n'a plus de sens : l'ecart varie d'un bout a l'autre ;
//   · UN RECOUVREMENT REEL, mesure par projection sur l'axe de la victime ;
//   · UN ECART QUI RESTE UN ECART : du cuivre a du cuivre, positif, et pas
//     au-dela de ECART_COUPLAGE_MAX -- plus loin, il n'y a plus rien a dire.
// ==========================================================================

use super::base::*;
use super::discontinuites::_z_empilage;
use super::topologie::{_ecarts, _extremites};

pub const ANGLE_PARALLELE: f64 = 15.0; // degres ; au-dela, ce n'est plus un longement
pub const ECART_COUPLAGE_MAX: f64 = 3.0; // mm ; au-dela, le couplage ne se lit plus
pub const RECOUVREMENT_MIN: f64 = 0.2; // mm ; en deca, c'est un croisement
pub const MAX_VOISINAGE: usize = 2000; // troncons voisins acceptes dans un document
pub const MAX_SECTIONS: usize = 6; // sections couplees chiffrees par calcul

// Les suffixes qui NOMMENT une paire differentielle. Ils ne decident de rien
// dans le calcul -- deux pistes qui se longent sont couplees, qu'elles portent
// ces noms ou non -- mais ils disent au panneau si « Z differentielle » est la
// question qu'on se pose ou une curiosite.
pub const SUFFIXES_PAIRE: [(&str, &str); 6] = [("_p", "_n"), ("+", "-"), ("_dp", "_dm"), ("p", "n"),
                                                ("_plus", "_moins"), ("_h", "_l")];

/// Ces deux nets forment-ils une paire differentielle ?
///
/// La page peut le DECLARER -- l'editeur PCB tient ses paires, et c'est la
/// verite la plus sure. Faute de declaration, les suffixes decident : c'est ce
/// que fait deja le bouton « Detecter » du panneau des paires, et la regle
/// doit etre la meme des deux cotes.
pub fn _paire_nommee(a: &str, b: &str, declarees: &[Json]) -> bool {
    if a.is_empty() || b.is_empty() || a == b {
        return false;
    }
    for couple in declarees {
        let c = els(couple);
        if c.len() >= 2 {
            let (c0, c1) = (str_py(&c[0]), str_py(&c[1]));
            if (c0 == a && c1 == b) || (c0 == b && c1 == a) {
                return true;
            }
        }
    }
    let (ba, bb) = (a.to_lowercase(), b.to_lowercase());
    for (sp, sn) in SUFFIXES_PAIRE {
        if let (Some(x), Some(y)) = (ba.strip_suffix(sp), bb.strip_suffix(sn)) {
            if x == y {
                return true;
            }
        }
        if let (Some(x), Some(y)) = (bb.strip_suffix(sp), ba.strip_suffix(sn)) {
            if x == y {
                return true;
            }
        }
    }
    false
}

/// (origine, direction unitaire, longueur) d'un troncon.
pub type Axe = ((f64, f64), (f64, f64), f64);
/// (x min, y min, x max, y max)
pub type Boite = (f64, f64, f64, f64);

/// (origine, direction unitaire, longueur) d'un troncon, ou None.
pub fn _axe(obj: &Json) -> Option<Axe> {
    let ((x1, y1), (x2, y2)) = _extremites(obj)?;
    let (dx, dy) = (x2 - x1, y2 - y1);
    let longueur = py::hypot(dx, dy);
    if longueur < 1e-9 {
        return None;
    }
    Some(((x1, y1), (dx / longueur, dy / longueur), longueur))
}

/// La boite englobante d'un troncon, elargie de `marge`.
pub fn _boite(axe: &Axe, marge: f64) -> Boite {
    let ((x, y), (ux, uy), longueur) = *axe;
    let (x2, y2) = (x + ux * longueur, y + uy * longueur);
    (x.min(x2) - marge, y.min(y2) - marge,
     x.max(x2) + marge, y.max(y2) + marge)
}

/// La projection commune a `_longement_intervalle` et `_superposition` :
/// (debut, fin, la, t1, n1, t2, n2, produit scalaire des directions), ou None quand les
/// boites s'ecartent, que les troncons ne sont pas paralleles ou qu'ils ne se recouvrent pas.
#[allow(clippy::type_complexity)]
fn projection(a: &Json, b: &Json, axe_a: Option<&Axe>, boite_a: Option<&Boite>) -> Option<(f64, f64, f64, f64, f64, f64, f64, f64)> {
    let axe_a = match axe_a {
        Some(x) => *x,
        None => _axe(a)?,
    };
    let axe_b = _axe(b)?;
    let boite_a = boite_a.copied().unwrap_or_else(|| _boite(&axe_a, ECART_COUPLAGE_MAX));
    let (bx1, by1, bx2, by2) = _boite(&axe_b, 0.0);
    if bx2 < boite_a.0 || bx1 > boite_a.2 || by2 < boite_a.1 || by1 > boite_a.3 {
        return None;
    }
    let ((ax, ay), (ux, uy), la) = axe_a;
    let ((bx, by), (vx, vy), lb) = axe_b;

    // Paralleles ? Le signe du produit scalaire ne compte pas POUR APPARIER --
    // une piste dessinee en sens inverse longe tout autant -- mais il compte
    // pour LIRE ses deux ecarts, et c'est pour cela qu'on le garde.
    let produit = ux * vx + uy * vy;
    if produit.abs() < ANGLE_PARALLELE.to_radians().cos() {
        return None;
    }

    // Les deux bouts de b, en coordonnees (le long de a, perpendiculaire a a).
    let projete = |x: f64, y: f64| {
        let (dx, dy) = (x - ax, y - ay);
        (dx * ux + dy * uy, -dx * uy + dy * ux)
    };

    let (t1, n1) = projete(bx, by);
    let (t2, n2) = projete(bx + vx * lb, by + vy * lb);
    let (debut, fin) = (t1.min(t2), t1.max(t2));
    let recouvrement = fin.min(la) - debut.max(0.0);
    if recouvrement < RECOUVREMENT_MIN {
        return None;
    }
    Some((debut, fin, la, t1, n1, t2, n2, produit))
}

/// Deux troncons se longent-ils, et SUR QUEL INTERVALLE ? En millimetres.
///
/// Rend (debut, fin, ecart_axe, cote, sens) ou None. `debut` et `fin` sont
/// mesures LE LONG DE L'AXE DE A, depuis son origine : c'est la portion de a
/// que b longe, et non sa seule longueur.
///
/// POURQUOI CETTE FORME PLUTOT QUE LA LONGUEUR SEULE. `_longement` n'a besoin
/// que de la longueur -- il apparie et il moyenne. La section « Crosstalk »,
/// elle, DECOUPE le parcours de l'agresseur en blocs ou l'ensemble des
/// voisines et leurs ecarts ne changent pas : il lui faut les BORNES, sans
/// quoi il n'y a pas de bloc a former et pas d'axe de position a construire.
/// Les deux lisent donc la meme projection, ecrite une fois ici -- deux copies
/// d'une meme trigonometrie auraient derive, et c'est l'onglet Z
/// differentielle et l'onglet Crosstalk qui auraient cesse de designer le
/// meme cuivre.
///
/// `ecart_axe` est la
/// distance ENTRE LES AXES -- la largeur des deux pistes s'en retranche plus
/// loin, la ou on la connait --, `cote` vaut +1 ou -1 selon que b passe a
/// gauche ou a droite de a dans le sens de parcours de a, et `sens` vaut +1
/// quand les deux troncons sont parcourus dans le meme sens, -1 sinon.
///
/// POURQUOI LE SENS COMPTE. Chaque troncon porte SES deux ecarts au cuivre de
/// masse, nommes « gauche » et « droite » dans SON sens de parcours. Pour
/// savoir si de la masse s'interpose entre les deux pistes, il faut celui de
/// la voisine qui REGARDE la selection -- et une voisine dessinee a rebours a
/// ses deux etiquettes echangees. Sans ce signe, une piste sur deux verrait
/// l'ecart de son mauvais bord.
///
/// ON PROJETTE B SUR L'AXE DE A, et le recouvrement est l'intersection des
/// deux intervalles. C'est exact pour deux segments paralleles, et c'est la
/// seule chose qui ait un sens quand ils ne le sont qu'a quelques degres pres.
///
/// `axe_a` et `boite_a` sont les memes valeurs pour tous les voisins d'une
/// meme victime : l'appelant les calcule une fois. LA BOITE N'EST PAS UN
/// RAFFINEMENT -- une selection de cent troncons face a six cents voisins fait
/// soixante mille couples, dont la quasi-totalite est a l'autre bout de la
/// carte, et quatre comparaisons les ecartent avant toute trigonometrie.
pub fn _longement_intervalle(a: &Json, b: &Json, axe_a: Option<&Axe>, boite_a: Option<&Boite>) -> Option<(f64, f64, f64, i64, i64)> {
    let (debut, fin, la, t1, n1, t2, n2, produit) = projection(a, b, axe_a, boite_a)?;
    let sens = if produit >= 0.0 { 1 } else { -1 };

    // L'ECART EST PRIS AU MILIEU DU RECOUVREMENT, et non a un bout : sur deux
    // pistes qui divergent de quelques degres, prendre un bout donnerait le
    // meilleur ou le pire des cas selon le sens de dessin.
    let milieu = (debut.max(0.0) + fin.min(la)) / 2.0;
    let n = if (t2 - t1).abs() > 1e-9 {
        let u = (milieu - t1) / (t2 - t1);
        n1 + u * (n2 - n1)
    } else {
        0.5 * (n1 + n2)
    };
    if n.abs() < 1e-9 {
        return None;
    }
    Some((debut.max(0.0), fin.min(la), n.abs(),
          if n > 0.0 { 1 } else { -1 }, sens))
}

/// Le meme longement, ramene a sa LONGUEUR.
///
/// Rend (recouvrement, ecart_axe, cote, sens) ou None -- la forme qu'attendent
/// l'appariement et la carte de chaleur, qui n'ont que faire des bornes.
pub fn _longement(a: &Json, b: &Json, axe_a: Option<&Axe>, boite_a: Option<&Boite>) -> Option<(f64, f64, i64, i64)> {
    let (debut, fin, ecart_axe, cote, sens) = _longement_intervalle(a, b, axe_a, boite_a)?;
    Some((fin - debut, ecart_axe, cote, sens))
}

/// L'ecart au cuivre de masse du bord de la voisine QUI REGARDE la
/// selection, en millimetres ; 0 quand la page ne l'a pas mesure.
///
/// `gap_left` est pris sur la normale gauche du sens de parcours DU TRONCON
/// qui le porte. La voisine est a gauche de la selection quand `cote` vaut +1
/// -- donc la selection est a DROITE de la voisine, si les deux sont
/// parcourues dans le meme sens ; a gauche si elles le sont a rebours.
pub fn _ecart_face(agresseur: &Json, cote: i64, sens: i64) -> f64 {
    let (gauche, droite) = _ecarts(agresseur);
    if sens >= 0 {
        return if cote > 0 { droite } else { gauche };
    }
    if cote > 0 { gauche } else { droite }
}

// ==========================================================================
// CE QUI PASSE AU-DESSUS -- LE COUPLAGE ENTRE COUCHES
// --------------------------------------------------------------------------
// LE SEUL COUPLAGE DE CETTE PAGE QUI RENDAIT ZERO SANS UN MOT. Le solveur de
// section n'a qu'UN plan de conducteurs : il pose tous ses rubans a la meme
// hauteur, et il n'a donc aucune facon de decrire deux pistes SUPERPOSEES.
// Ces voisines-la etaient ecartees a la premiere ligne de la boucle de
// `_scenes_paralleles` -- `layer` different, `continue` -- et disparaissaient
// sans laisser de trace : ni dans le tableau, ni dans `ecartes`, ni dans un
// avertissement. Un bus route en parallele sur deux couches de signal
// adossees affichait donc « aucune voisine ne longe la selection ». C'est le
// pire cas du metier rendu comme le meilleur, et c'est la faute qu'on repare.
//
// CE QU'ON PEUT FAIRE SANS SOLVEUR EMPILE : le VOIR et le NOMMER. La
// geometrie suffit -- `voisinage` porte deja tous les troncons de toutes les
// couches, c'est le serveur qui les filtrait -- et elle rend les trois
// nombres qui decident : la longueur qui se recouvre, le decalage lateral
// entre les deux cuivres, et l'epaisseur de dielectrique qui les separe. Le
// couplage n'est pas chiffre ; il cesse d'etre invisible. C'est la meme regle
// que pour une voisine coplanaire qu'on n'a pas pu poser (`ecartes`) : une
// voisine qui disparait sans un mot se lit comme un couplage nul.
//
// ET LE DISCRIMINANT EST LE PLAN, PAS LA DISTANCE. Deux couches de signal
// separees par un plan de reference ne se voient pas : le plan est un ecran,
// et c'est toute la raison d'etre d'un empilage. Deux couches de signal
// ADOSSEES -- rien entre elles que du prepreg -- couplent, et d'autant plus
// que le prepreg est mince : sur 0,1 mm de prepreg, deux pistes exactement
// superposees sont bien plus couplees que les memes cote a cote a 0,2 mm.
// Signaler les premieres serait du bruit ; taire les secondes est la faute.
// On les compte donc separement, et seules les secondes sont rendues.
//
// POURQUOI `_longement` NE PEUT PAS SERVIR ICI. Il REFUSE le decalage nul
// (`abs(n) < 1e-9`), et il a raison : sur une meme couche, deux axes confondus
// sont deux troncons du meme cuivre. Entre deux couches, c'est le pire cas.
// Il rend aussi un cote et un sens, qui servent a lire l'ecart au cuivre de
// masse du bon bord -- notion qui n'a pas d'objet entre deux couches.
// ==========================================================================

/// Deux troncons de COUCHES DIFFERENTES se recouvrent-ils, et de combien ?
///
/// Rend (recouvrement, decalage) en millimetres, ou None. `decalage` est la
/// distance entre les deux AXES vue de dessus -- zero quand une piste passe
/// exactement sous l'autre --, et la largeur des deux pistes s'en retranche
/// plus loin, la ou on la connait.
///
/// MEME PROJECTION QUE `_longement`, aux deux differences dites juste
/// au-dessus : le decalage nul est accepte, et il n'y a ni cote ni sens a
/// rendre. `axe_a` et `boite_a` sont les memes valeurs pour tous les voisins
/// d'une meme victime : l'appelant les calcule une fois.
pub fn _superposition(a: &Json, b: &Json, axe_a: Option<&Axe>, boite_a: Option<&Boite>) -> Option<(f64, f64)> {
    let (debut, fin, la, t1, n1, t2, n2, _) = projection(a, b, axe_a, boite_a)?;
    let recouvrement = fin.min(la) - debut.max(0.0);

    // LE DECALAGE EST PRIS AU MILIEU DU RECOUVREMENT, meme raison que dans
    // `_longement` : sur deux pistes qui divergent de quelques degres, prendre
    // un bout donnerait le meilleur ou le pire des cas selon le sens de dessin.
    let milieu = (debut.max(0.0) + fin.min(la)) / 2.0;
    let n = if (t2 - t1).abs() > 1e-9 {
        n1 + (milieu - t1) / (t2 - t1) * (n2 - n1)
    } else {
        0.5 * (n1 + n2)
    };
    Some((recouvrement, n.abs()))
}

/// Le nom d'une couche de l'empilage, ou « couche N » faute de mieux.
pub fn _nom_de_couche(couches: &[Json], indice: i64) -> String {
    if 0 <= indice && indice < couches.len() as i64 {
        let nom = str_ou_vide(&couches[indice as usize]["name"]);
        let nom = py::strip(&nom);
        if !nom.is_empty() {
            return nom.to_string();
        }
    }
    format!("couche {}", indice)
}

/// Le nom du plan de reference qui SEPARE deux couches de cuivre, ou "".
///
/// Un plan entre deux couches de signal est un ECRAN. Le net du plan ne
/// change rien : un plan d'alimentation blinde autant qu'un plan de masse,
/// parce qu'il est un court-circuit pour le front -- c'est le decouplage qui
/// le tient, et son defaut se juge ailleurs, pas ici.
pub fn _plan_entre(couches: &[Json], ia: i64, ib: i64) -> String {
    let (lo, hi) = (ia.min(ib), ia.max(ib));
    for i in lo + 1..hi {
        if !(0 <= i && i < couches.len() as i64) {
            continue;
        }
        let c = &couches[i as usize];
        if c["type"].as_str() == Some("copper") && c["role"].as_str() == Some("plane") {
            return _nom_de_couche(couches, i);
        }
    }
    String::new()
}

/// L'epaisseur de dielectrique entre deux couches de cuivre, en mm.
///
/// Des FACES EN REGARD et non des cotes de reference : `_z_empilage` rend le
/// dessus de chaque couche, le dessous de la couche haute est donc `z[lo+1]`
/// et le dessus de la basse `z[hi]`. C'est cette epaisseur-la qui decide du
/// couplage, pas la distance entre les milieux des deux cuivres.
pub fn _dielectrique_entre(couches: &[Json], ia: i64, ib: i64) -> f64 {
    let (lo, hi) = (ia.min(ib), ia.max(ib));
    if !(0 <= lo && lo < hi && hi < couches.len() as i64) {
        return 0.0;
    }
    let z = _z_empilage(couches);
    maxf(&[0.0, z[hi as usize] - z[lo as usize + 1]])
}

/// Ce qui longe la selection SUR UNE AUTRE COUCHE.
///
/// Rend (trouves, blindes) : la liste des longements entre couches qu'AUCUN
/// plan ne separe -- agregee par (net voisin, couche voisine, couche de
/// depart), la plus longue d'abord --, et le NOMBRE de ceux qu'un plan
/// separe. Les seconds ne sont pas un probleme ; les compter permet de dire
/// « on a regarde » au lieu de se taire, ce qui est exactement la difference
/// entre un empilage qui fait son travail et un solveur qui n'a rien vu.
///
/// Chaque entree porte `longueur` (la somme des recouvrements, en mm),
/// `decalage` (le plus petit ecart de CUIVRE A CUIVRE vu de dessus : zero
/// quand les deux pistes se chevauchent en projection) et `hauteur`
/// (l'epaisseur de dielectrique entre les deux faces en regard).
///
/// RIEN N'EST CHIFFRE ICI, et ce n'est pas un oubli : la section droite pose
/// tous ses conducteurs a la meme hauteur, et il faudrait un solveur a
/// conducteurs empiles -- ou le moteur 2,5D -- pour rendre un couplage. La
/// geometrie, elle, suffit a dire OU regarder.
pub fn _superposes(objets: &[Json], voisinage: &[Json], couches: &[Json]) -> (Vec<Json>, i64) {
    let mut par_cle: Vec<((String, i64, i64), Json, f64, f64)> = Vec::new(); // cle, fiche, longueur, decalage
    let mut blindes = 0;
    for victime in objets {
        let couche = ent(&victime["layer"], -1);
        let net_v = str_ou_vide(&victime["net"]);
        let w_v = nb(&victime["width"]);
        if couche < 0 || net_v.is_empty() || !(w_v > 0.0) {
            continue;
        }
        let Some(axe_v) = _axe(victime) else { continue };
        let boite_v = _boite(&axe_v, ECART_COUPLAGE_MAX + w_v / 2.0);
        for agresseur in voisinage {
            let couche_a = ent(&agresseur["layer"], -1);
            if couche_a < 0 || couche_a == couche {
                continue;
            }
            let net_a = str_ou_vide(&agresseur["net"]);
            // MEME REGLE QUE POUR LE COPLANAIRE : sans net on ne groupe rien,
            // et un net face a lui-meme n'est pas un couplage -- c'est la
            // meme liaison qui change de couche par un via.
            if net_a.is_empty() || net_a == net_v {
                continue;
            }
            let w_a = nb(&agresseur["width"]);
            if !(w_a > 0.0) {
                continue;
            }
            let Some((recouvrement, decalage)) = _superposition(victime, agresseur, Some(&axe_v), Some(&boite_v)) else { continue };
            // LE DECALAGE SE COMPTE DE CUIVRE A CUIVRE, comme l'ecart
            // coplanaire : deux pistes larges dont les axes sont distants de
            // 0,2 mm se CHEVAUCHENT en projection, et leur decalage de bords
            // est nul. C'est le pire cas, et le compter a 0,2 mm le
            // deguiserait en cas moyen.
            let bord = maxf(&[0.0, decalage - (w_v + w_a) / 2.0]);
            if bord > ECART_COUPLAGE_MAX {
                continue;
            }
            if !_plan_entre(couches, couche, couche_a).is_empty() {
                blindes += 1;
                continue;
            }
            let cle = (net_a.clone(), couche_a, couche);
            let k = match par_cle.iter().position(|e| e.0 == cle) {
                Some(k) => k,
                None => {
                    par_cle.push((cle, obj! {
                        "net" => &net_a,
                        "couche" => couche_a,
                        "nom_couche" => _nom_de_couche(couches, couche_a),
                        "depuis" => couche,
                        "nom_depuis" => _nom_de_couche(couches, couche),
                        "longueur" => 0.0,
                        "decalage" => bord,
                        "hauteur" => _dielectrique_entre(couches, couche, couche_a),
                    }, 0.0, bord));
                    par_cle.len() - 1
                }
            };
            par_cle[k].2 += recouvrement;
            par_cle[k].3 = minf(&[par_cle[k].3, bord]);
        }
    }
    par_cle.sort_by(|f, g| g.2.total_cmp(&f.2));
    let trouves = par_cle.into_iter().map(|(_, mut f, longueur, decalage)| {
        poser(&mut f, "longueur", round(longueur, 3));
        poser(&mut f, "decalage", round(decalage, 3));
        let h = num(&f, "hauteur");
        poser(&mut f, "hauteur", round(h, 4));
        f
    }).collect();
    (trouves, blindes)
}
