// ==========================================================================
// LE MOIGNON, ET LA CAVITE PAR OU LE RETOUR CHANGE DE PLAN
// --------------------------------------------------------------------------
// CE QUE LE PALIER PRECEDENT LAISSAIT DE COTE, ET QU'IL NOMMAIT. La fiche
// disait « le moignon qui depasse et la cavite entre plans n'y sont pas ». Les
// voici, et ce ne sont pas de petites corrections :
//
//   · UN MOIGNON DE 1 mm VAUT 206 fF, deux fois et demie la capacite du via
//     entier. Sous sa resonance il charge ; A sa resonance quart d'onde il
//     COURT-CIRCUITE la liaison. C'est le defaut qui tue un lien multi-gigabit,
//     et rien sur le dessin ne le montre : le via a l'air normal, c'est ce
//     qu'on n'utilise PAS de son percage qui nuit.
//
//   · LA CAVITE TRANSFORME UN CONSEIL EN CHIFFRE. Jusqu'ici, une reference qui
//     change sans etre rejointe rendait un plancher et un avertissement disant
//     « ne faites pas cela ». On peut desormais dire COMBIEN cela coute -- donc
//     si l'on peut se le permettre, ce qui est une tout autre conversation.
// ==========================================================================

use super::base::*;
use super::discontinuites::*;
use super::retour::*;
use super::ErreurSimulation;
use ligne_mom as tl;
use std::f64::consts::PI;

type Res<T> = Result<T, ErreurSimulation>;

/// Ce que le via en ligne lit du modele d'une transition (`mv["ligne"]`).
#[derive(Debug, Clone, PartialEq, Default)]
pub struct LigneVia {
    pub longueur: f64,
    pub c_depart: f64,
    pub c_arrivee: f64,
    pub er: f64,
    pub tan_delta: f64,
}

/// La position du via et ses retours (`mv["geo"]`), en metres sauf `x_mm` et `y_mm`.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct GeoVia {
    pub x_mm: f64,
    pub y_mm: f64,
    pub a_position: bool,
    pub z1: f64,
    pub z2: f64,
    pub lo: i64,
    pub hi: i64,
    pub retours: Vec<tl::Via>,
}

/// Le modele electrique d'une transition, tel que `_modele_transition` le rend : le dict
/// `mv` du Python. `modele` et `phase_rad` sont poses par la cascade (`_modele_via_resolu`).
#[derive(Debug, Clone)]
pub struct ModeleVia {
    pub l: f64,
    pub c: f64,
    pub moignon_depart: Json,
    pub moignon_arrivee: Json,
    pub percage: f64,
    pub antipad: f64,
    pub cavite: Option<tl::Traversee>,
    pub ligne: Option<LigneVia>,
    pub geo: Option<GeoVia>,
    /// « pi » ou « ligne » ; absent : pi
    pub modele: Option<&'static str>,
    pub phase_rad: f64,
}

impl Default for ModeleVia {
    fn default() -> Self {
        ModeleVia { l: 0.0, c: 0.0, moignon_depart: Json::Nul, moignon_arrivee: Json::Nul, percage: 0.0, antipad: 0.0,
                    cavite: None, ligne: None, geo: None, modele: None, phase_rad: 0.0 }
    }
}

/// La permittivite et les pertes moyennes entre deux couches d'empilage.
///
/// Moyenne PONDEREE PAR L'EPAISSEUR, et non simple : un moignon qui traverse
/// 0,1 mm de prepreg et 1 mm de coeur est dans le coeur, pas a mi-chemin entre
/// les deux. Sans dielectrique dans l'intervalle, on rend le FR-4 ordinaire --
/// et cela n'arrive que sur un intervalle vide, ou rien ne sera calcule.
pub fn _milieu_traverse(couches: &[Json], i_haut: i64, i_bas: i64) -> (f64, f64) {
    let (lo, hi) = (i_haut.min(i_bas), i_haut.max(i_bas));
    let (mut somme, mut er, mut td) = (0.0, 0.0, 0.0);
    for i in lo..=hi {
        if !(0 <= i && i < couches.len() as i64) {
            continue;
        }
        let c = &couches[i as usize];
        if c["type"].as_str() != Some("dielectric") {
            continue;
        }
        let e = _nombre(&c["thickness"], 0.0);
        if e <= 0.0 {
            continue;
        }
        somme += e;
        er += e * _nombre(&c["epsilon_r"], 4.3);
        td += e * _nombre(&c["tan_delta"], 0.02);
    }
    if somme <= 0.0 {
        return (4.3, 0.02);
    }
    (er / somme, td / somme)
}

/// Les deux bouts de percage que le signal n'emprunte pas :
/// {connu, depart, arrivee[, incoherent][, contre_percage]}.
///
/// LA LONGUEUR NE SE DEVINE PAS, ELLE SE SOUSTRAIT. Le via est perce de
/// `layer_from` a `layer_to` ; le signal ne parcourt que `couche_depart` a
/// `couche_arrivee`. Ce qui depasse de part et d'autre pend en circuit ouvert.
/// Sans la portee percee -- une page qui ne l'envoie pas --, on ne peut PAS
/// conclure : un via traversant et un via borgne bien ajuste ont exactement la
/// meme apparence dans le reste du document. On rend alors « inconnu », et la
/// fiche le dit plutot que d'annoncer un moignon nul.
///
/// Chaque moignon est rattache au NOEUD dont il pend : celui du depart quand
/// il est du cote de la couche de depart, celui de l'arrivee sinon. Les
/// intervertir change |S11| sans changer |S21|, donc se voit mal.
///
/// LE CONTRE-PERCAGE ARRETE LE MOIGNON DE SON COTE. La portee percee reste
/// celle du via -- c'est un foret plus gros, repasse apres metallisation
/// depuis une face, qui retire le bout du fut. La page l'envoie dans
/// `via["contre_percage"]` : la face (`cote`, "dessous" ou "dessus"), la
/// couche de cuivre a ne pas couper (`couche_garde`, indice d'empilage comme
/// `layer_from`) et le moignon residuel (`moignon_residuel_mm`) laisse entre
/// elle et la pointe du foret. Le moignon de ce cote va alors de la couche
/// empruntee a la pointe, et jamais plus loin qu'avant. Un contre-percage qui
/// couperait une couche empruntee n'est pas applique, et la fiche le dit
/// (`contre_percage` : "ignore"). Sans le champ, rien ne change.
pub fn _moignons(trans: &Json, via: &Json, couches: &[Json], z_bornes: &[f64]) -> Json {
    let a_portee = !nul(&via["layer_from"]) && !nul(&via["layer_to"]);
    let dep = ent(&trans["couche_depart"], 0);
    let arr = ent(&trans["couche_arrivee"], 0);
    if !a_portee {
        return obj! {"connu" => false, "depart" => Json::Nul, "arrivee" => Json::Nul};
    }

    let (va, vb) = (ent(&via["layer_from"], 0), ent(&via["layer_to"], 0));
    let (vlo, vhi) = (va.min(vb), va.max(vb));
    let (ulo, uhi) = (dep.min(arr), dep.max(arr));
    // On ne peut pas emprunter plus que ce qui est perce : une portee percee
    // plus courte que le saut est une incoherence du document, pas un moignon
    // negatif. On la signale en rendant « inconnu ».
    if vlo > ulo || vhi < uhi {
        return obj! {"connu" => false, "depart" => Json::Nul, "arrivee" => Json::Nul,
                     "incoherent" => true};
    }

    let _z = |i: i64| if 0 <= i && i < z_bornes.len() as i64 { z_bornes[i as usize] } else { 0.0 };

    // Un bout de percage entre deux cotes, avec le milieu qu'il traverse.
    //
    // LES COTES SONT CELLES DU PERCAGE, ET NON LES DESSUS DE COUCHE. Un via
    // va du DESSUS de sa couche de depart au DESSOUS de sa couche d'arrivee
    // -- c'est ce qu'un foret fait, et c'est deja la convention de
    // `_hauteur_via`. Prendre les deux dessus fait manquer une epaisseur de
    // cuivre a chaque bout ; c'est peu sur du 35 um, mais les deux bouts
    // n'ont aucune raison de se compenser, et la somme des morceaux doit
    // rendre exactement la longueur percee.
    let bout_perce = |i1: i64, i2: i64, z1: f64, z2: f64| -> Json {
        let lg = (z2 - z1).abs();
        if lg <= 0.0 {
            return Json::Nul;
        }
        let (er, td) = _milieu_traverse(couches, i1, i2);
        obj! {"longueur_mm" => round(lg, 4), "er" => round(er, 3),
              "tan_delta" => round(td, 5),
              "couches" => vec![i1, i2]}
    };

    // Le percage occupe [z(vlo), z(vhi+1)] ; le signal [z(ulo), z(uhi+1)].
    let mut haut = if ulo > vlo { bout_perce(vlo, ulo, _z(vlo), _z(ulo)) } else { Json::Nul };
    let mut bas = if vhi > uhi { bout_perce(uhi, vhi, _z(uhi + 1), _z(vhi + 1)) } else { Json::Nul };

    let mut etat_cp: Option<&str> = None;
    let cp = &via["contre_percage"];
    if cp.as_objet().is_some() {
        let g = ent(&cp["couche_garde"], -1);
        let res = _nombre(&cp["moignon_residuel_mm"], 0.0).max(0.0);
        let cote = cp["cote"].as_str();
        if cote == Some("dessous") && bas.vrai() && uhi <= g && g < vhi {
            // la pointe sous la couche gardee : son dessous, plus le residuel
            let pointe = (_z(g + 1) + res).min(_z(vhi + 1));
            bas = bout_perce(uhi, g + 1, _z(uhi + 1), pointe);
            etat_cp = Some("applique");
        } else if cote == Some("dessus") && haut.vrai() && vlo < g && g <= ulo {
            let pointe = (_z(g) - res).max(_z(vlo));
            haut = bout_perce(g - 1, ulo, pointe, _z(ulo));
            etat_cp = Some("applique");
        } else {
            etat_cp = Some("ignore");
        }
        let m = if cote == Some("dessous") { &mut bas } else { &mut haut };
        if m.vrai() && etat_cp == Some("applique") {
            poser(m, "contre_perce", true);
        }
    }

    // Lequel pend au noeud d'entree ? Celui du cote de la couche de DEPART.
    let (depart, arrivee) = if dep <= arr { (haut, bas) } else { (bas, haut) };
    let mut out = obj! {"connu" => true, "depart" => depart, "arrivee" => arrivee};
    if let Some(e) = etat_cp {
        poser(&mut out, "contre_percage", e);
    }
    out
}

/// L'admittance d'un moignon a une frequence, ou zero s'il n'y en a pas.
pub fn _admittance_moignon(m: &Json, d_percage: f64, d_antipad: f64, freq: f64) -> Complex64 {
    if !m.vrai() {
        return Complex64::new(0.0, 0.0);
    }
    tl::admittance_moignon(num(m, "longueur_mm") * 1e-3,
                           d_percage * 1e-3, d_antipad * 1e-3,
                           num(m, "er"), num(m, "tan_delta"), freq)
}

/// Ce qu'on affiche d'un moignon : sa longueur, sa resonance, ce qu'il
/// pese a la frequence de travail.
///
/// LA RESONANCE EST LE CHIFFRE QUI DECIDE. Une capacite en femtofarads ne dit
/// pas si le moignon est un probleme ; la frequence a laquelle il court-circuite
/// la liaison, si. On rend aussi la capacite equivalente A LA FREQUENCE
/// CENTRALE, parce que c'est sous cette forme qu'elle se compare a celle du
/// via.
pub fn _fiche_moignon(m: &Json, d_percage: f64, d_antipad: f64, fc: f64) -> Json {
    if !m.vrai() {
        return Json::Nul;
    }
    let y = _admittance_moignon(m, d_percage, d_antipad, fc);
    let omega = 2.0 * PI * fc;
    let f_res = tl::frequence_resonance_moignon(num(m, "longueur_mm") * 1e-3, num(m, "er"));
    let mut f = obj! {
        "longueur_mm" => &m["longueur_mm"],
        // LE MILIEU PART AVEC LA RESONANCE, parce que c'est lui qui l'explique :
        // la meme longueur resonne 8 % plus bas dans un stratifie a er 5 que
        // dans un a er 4,3, et sans le chiffre on ne peut pas refaire le calcul.
        "er" => &m["er"],
        "tan_delta" => &m["tan_delta"],
        "resonance_hz" => if !f_res.is_finite() { None } else { Some(rnp(f_res, 1)) },
        "capacite_fF" => if omega > 0.0 { rnp(y.im / omega * 1e15, 2) } else { 0.0 },
        "impedance_ohm" => if y.norm() > 1e-12 { Some(rnp(1.0 / y.norm(), 1)) } else { None },
        "couches" => &m["couches"],
    };
    if m["contre_perce"].vrai() {
        poser(&mut f, "contre_perce", true);
    }
    f
}

/// Les deux plans de reference qu'un via fait changer, et leur ecartement.
///
/// Rend (nom_haut, nom_bas, hauteur_mm) ou None quand il n'y a pas
/// de changement -- ou quand les deux troncons partagent un plan, auquel cas
/// le retour n'a rien a traverser.
pub fn _plans_de_la_paire(trans: &Json, couches: &[Json], segments: &[Json]) -> Option<(String, String, f64)> {
    let (seg_av, seg_ap) = encadrants(trans, segments);
    let av = _plans_de_reference(seg_av);
    let ap = _plans_de_reference(seg_ap);
    if av.is_empty() || ap.is_empty() || !av.is_disjoint(&ap) {
        return None;
    }
    let rang = |nom: &str| couches.iter().position(|c| txt(c, "name") == nom && c["type"].as_str() == Some("copper")).map(|k| k as i64);
    let i_av = av.iter().filter_map(|n| rang(n)).min()?;
    let i_ap = ap.iter().filter_map(|n| rang(n)).min()?;
    let (lo, hi) = (i_av.min(i_ap), i_av.max(i_ap));
    // L'ecart ELECTRIQUE entre les deux plans : le dielectrique qui les separe,
    // sans compter le cuivre des plans eux-memes -- c'est la hauteur de la
    // cavite, pas l'epaisseur de l'empilage.
    let mut h = 0.0;
    for k in lo + 1..hi {
        if couches[k as usize]["type"].as_str() == Some("dielectric") {
            h += _nombre(&couches[k as usize]["thickness"], 0.0);
        }
    }
    Some((av.first()?.clone(), ap.first()?.clone(), round(h, 4)))
}

static VIDE: Json = Json::Nul;

/// Les deux troncons qui encadrent une transition ({} hors de la liste).
fn encadrants<'a>(trans: &Json, segments: &'a [Json]) -> (&'a Json, &'a Json) {
    let i = trans["troncon"].as_f64().unwrap_or(0.0) as i64;
    let n = segments.len() as i64;
    (if 0 < i && i <= n { &segments[(i - 1) as usize] } else { &VIDE },
     if 0 <= i && i < n { &segments[i as usize] } else { &VIDE })
}

/// Le chemin du retour quand la reference change : par ou, et a quel prix.
///
/// LE RETOUR N'ATTEND PAS UN CONDENSATEUR, ET C'ETAIT L'ERREUR DE FOND.
/// Bogatin, section 7.14 : le courant de retour change de plan par la PAIRE DE
/// PLANS elle-meme, en courant de deplacement a travers sa capacite. Le plan
/// du milieu, meme FLOTTANT, porte des courants de Foucault induits qui
/// referment la boucle -- le pilote voit simplement deux lignes en serie. Il
/// n'y a donc jamais « pas de chemin » : il y a un chemin dont on connait plus
/// ou moins bien le prix.
///
/// TROIS CAS, ET ILS NE SE CONFONDENT PAS :
///
///   1. UN PONT MESURE. Un condensateur de decouplage joint les deux plans a
///      une distance connue. On chiffre : etalement jusqu'a lui, son montage,
///      sa capacite -- le tout EN PARALLELE avec la capacite repartie des
///      plans, qui ne disparait pas pour autant.
///   2. LA PAGE A CHERCHE ET N'A RIEN VU dans son rayon. Le retour est alors
///      AU MOINS aussi loin, et il traverse AU MOINS un pont. On prend le
///      rayon comme distance : c'est un MINORANT, marque comme tel.
///   3. LA PAGE NE CHERCHE PAS. On ne chiffre alors que l'ETALEMENT, qui ne
///      depend que de la geometrie des plans, et on dit que l'element de
///      traversee manque. C'est le seul cas ou l'on rend moins que la verite,
///      et il est nomme.
///
/// POURQUOI PAS LA CAVITE SEULE DANS LE CAS 2. Parce qu'elle donne 1,7 kOhm a
/// 1 MHz sur une paire de plans de 95 pF -- exact pour une carte qui n'aurait
/// AUCUN decouplage nulle part, absurde pour une carte reelle dont le
/// decouplage est simplement plus loin que le rayon cherche. Le minorant du
/// cas 2 est plus proche du vrai, et il ne peut pas se tromper dans le sens
/// qui flatte.
pub fn _cavite_de_retour(trans: &Json, via: &Json, couches: &[Json], segments: &[Json], d_percage: f64) -> Option<Json> {
    let (haut, bas, h_cav) = _plans_de_la_paire(trans, couches, segments)?;
    if haut.is_empty() || h_cav <= 0.0 {
        return None;
    }

    let ponts = &via["ponts"];
    let mut fiche = obj! {"plan_haut" => &haut, "plan_bas" => &bas,
                          "hauteur_mm" => h_cav, "ponts" => 0i64, "pont" => Json::Nul,
                          // A-T-ON CHERCHE ? C'est ce qui separe une OBSERVATION d'une
                          // ignorance, et les deux ne se disent pas de la meme facon dans la
                          // fiche : « il n'y a pas de decouplage » est un constat sur la
                          // carte, « on n'a pas regarde » est un aveu sur l'outil.
                          "cherche" => !nul(ponts),
                          "inductance_nH" => Json::Nul, "esl_nH" => Json::Nul, "esl_source" => Json::Nul};

    let (Some(x0), Some(y0)) = (nb_opt(&via["x"]), nb_opt(&via["y"])) else {
        poser(&mut fiche, "raison", "la position du via n'est pas envoyée");
        return Some(fiche);
    };

    // La capacite repartie des deux plans : elle existe toujours, et c'est par
    // elle que le retour passe quand rien d'autre ne le porte.
    let a_aire = !nul(&via["aire_plans_mm2"]);
    let aire = _nombre(&via["aire_plans_mm2"], AIRE_PLANS_REPLI);
    let er_cav = _nombre(&via["er_plans"], 4.3);
    let c_plans = tl::capacite_paire_plans(aire * 1e-6, h_cav * 1e-3, er_cav);
    let rayon_cav = (aire.max(1.0) / PI).sqrt();
    let l_cavite = tl::inductance_etalement_via_anneau(
        h_cav * 1e-3, d_percage.max(1e-3) * 1e-3 / 2.0, rayon_cav * 1e-3);
    maj(&mut fiche, obj! {
        "aire_plans_mm2" => round(aire, 1),
        "aire_source" => if a_aire { "page" } else { "repli" },
        // L'AIRE ENVOYEE EST CELLE DE LA CARTE, PAS CELLE DES DEUX VERSEMENTS
        // EN REGARD, et la page le declare. Ce champ arrivait et n'etait pas lu :
        // la fiche disait « aire supposee » quand elle venait du repli, et NE
        // DISAIT RIEN quand elle venait de la page -- alors que c'est justement
        // la qu'elle majore. Une aire majoree donne une capacite majoree, donc
        // une cavite qui parait MOINS chere a traverser qu'elle ne l'est. C'est
        // le sens qui flatte, et il doit se lire.
        "aire_majoree" => via["aire_plans_majoree"].vrai(),
        "capacite_plans_pF" => round(c_plans * 1e12, 2),
        "etalement_cavite_nH" => rnp(l_cavite * 1e9, 4),
        "impedance_plans_ohm" => rnp(
            tl::impedance_paire_plans(h_cav * 1e-3, 2.0 * rayon_cav * 1e-3,
                                      er_cav), 3),
    });

    let pourquoi = py::strip(&str_ou_vide(&via["ponts_raison"])).to_string();
    if nul(ponts) {
        // LA PAGE PEUT DIRE POURQUOI, ET IL FAUT L'ECOUTER. « Cette page ne
        // cherche pas les decouplages » etait la seule phrase possible ici, et
        // elle est FAUSSE des que la page cherche mais s'arrete : nets des plans
        // illisibles, deux plans du meme net, empilage pas pret. Trois causes,
        // trois gestes differents, un seul message -- de quoi chercher une heure
        // une fonction qui marche.
        poser(&mut fiche, "ponts_raison", &pourquoi);
        poser(&mut fiche, "raison", if !pourquoi.is_empty() {
            format!("les découplages qui joignent {} à {} n'ont pas été cherchés : {}.\
                     \x20Seul l'étalement dans les plans est compté, et la traversée est\
                     \x20donc sous-estimée", haut, bas, pourquoi)
        } else {
            format!("cette page ne cherche pas les découplages qui\
                     \x20joignent {} à {} : seul l'étalement dans les plans\
                     \x20est compté, et la traversée est donc\
                     \x20sous-estimée", haut, bas)
        });
        poser(&mut fiche, "etalement_seul", true);
        poser(&mut fiche, "inductance_nH", rnp(l_cavite * 1e9, 4));
        return Some(fiche);
    }

    let ponts = els(ponts);
    poser(&mut fiche, "ponts", ponts.len());
    let rayon = _nombre(&via["ponts_rayon_mm"], 0.0);

    // LA CAVITE MODALE, quand la page en donne la forme et TOUS les ponts de la
    // carte : plus de pont suppose au rayon, plus de resonance inventee.
    let rect = &via["cavite_rect"];
    if rect.vrai() && !nul(&via["ponts_carte"]) {
        _cavite_modale(&mut fiche, via, rect, x0, y0, h_cav, er_cav, d_percage, rayon);
        return Some(fiche);
    }

    // TOUS LES PONTS, ET NON LE PLUS PROCHE. La version precedente ne gardait
    // que le condensateur le plus proche, en disant que c'etait « le sens
    // prudent ». C'etait vrai, et ce n'etait pas le sens JUSTE : plusieurs
    // condensateurs qui joignent les deux plans sont autant de branches EN
    // PARALLELE, et le courant s'y repartit en raison de leurs admittances.
    // Sur un plan correctement decouple, ne compter que le plus proche
    // surestime l'impedance de la traversee d'un facteur trois.
    //
    // ET CE N'EST PAS LE MEME PHENOMENE QUE POUR LES VIAS DE RETOUR. La mutuelle
    // empeche des vias serres de travailler independamment -- c'est pourquoi
    // `inductance_boucle_vias` resout un systeme au lieu de sommer. Ici les
    // condensateurs sont a des millimetres les uns des autres, avec leur propre
    // capacite et leur propre ESL en serie : c'est la CAPACITE qui fixe leur
    // impedance en dessous de leur resonance, pas leur inductance, et la
    // mutuelle entre leurs vias de montage est negligeable devant. On les met
    // donc en parallele, et on le dit.
    // (fiche affichee, _l, _esr, _c)
    let mut detail: Vec<(Json, f64, f64, f64)> = Vec::new();
    for p in ponts {
        let d = py::hypot(_nombre(&p["x"], 0.0) - x0,
                          _nombre(&p["y"], 0.0) - y0);
        // EQUATION 13-35, ET NON 13-31 : deux contacts ponctuels, pas un via
        // vers un anneau. Le courant s'etale au depart ET se resserre a
        // l'arrivee, dans les deux plans.
        let l_etal = tl::inductance_etalement_via_via(h_cav * 1e-3, d * 1e-3,
                                                      d_percage.max(1e-3) * 1e-3);
        let esr = _nombre(if !nul(&p["esr_ohm"]) { &p["esr_ohm"] } else { &p["esr"] }, ESR_PONT_REPLI);
        detail.push((obj! {
            "x" => round(_nombre(&p["x"], x0), 4),
            "y" => round(_nombre(&p["y"], y0), 4),
            "distance_mm" => round(d, 4),
            "repere" => str_ou_vide(&p["repere"]),
            "etalement_nH" => rnp(l_etal * 1e9, 4),
            "esl_nH" => round(_nombre(&p["esl_nH"], ESL_PONT_REPLI), 3),
            "esl_source" => if !nul(&p["esl_nH"]) { "page" } else { "repli" },
            "esr_ohm" => round(esr, 4),
            "esr_source" => if !nul(&p["esr_ohm"]) || !nul(&p["esr"]) { "page" } else { "repli" },
            "capacite_F" => _nombre(&p["capacite_F"], C_PONT_REPLI),
            "capacite_source" => if !nul(&p["capacite_F"]) { "page" } else { "repli" },
        },
        l_etal + _nombre(&p["esl_nH"], ESL_PONT_REPLI) * 1e-9,
        esr,
        _nombre(&p["capacite_F"], C_PONT_REPLI)));
    }
    detail.sort_by(|f, g| num(&f.0, "distance_mm").total_cmp(&num(&g.0, "distance_mm")));

    let borne;
    if detail.is_empty() {
        // Cherche, rien vu : le pont est AU MOINS au rayon. Minorant.
        if !pourquoi.is_empty() {
            poser(&mut fiche, "ponts_raison", &pourquoi);
        }
        if !(rayon > 0.0) {
            poser(&mut fiche, "raison", format!("aucun découplage ne joint {} à {} près du via,\
                                                 \x20et la page ne dit pas jusqu'où elle a cherché{}",
                                                haut, bas,
                                                if !pourquoi.is_empty() { format!(" — {pourquoi}") } else { String::new() }));
            poser(&mut fiche, "etalement_seul", true);
            poser(&mut fiche, "inductance_nH", rnp(l_cavite * 1e9, 4));
            return Some(fiche);
        }
        // RIEN NON PLUS AU-DELA DU RAYON : aucun decouplage ne joint ces deux
        // plans sur toute la carte (les deux pages balaient TOUS les composants
        // et envoient le plus proche hors rayon des qu'il y en a un). Le pont
        // suppose au rayon reste le bon proxy de l'impedance -- en basse
        // frequence le retour passe par le reseau d'alimentation (0 ohm,
        // regulateur, decouplage d'un autre rail), que la cavite seule ignore.
        // Mais sa DISTANCE flatte : il n'y a rien a 10 mm, et la verification
        // de carte doit le savoir (P01x291 : VDDIO sans un seul condensateur
        // vers GND, des dizaines de vias jugés « ok » à 1 ns).
        poser(&mut fiche, "aucun_pont_carte", nul(&via["pont_hors_rayon_mm"]));
        let l_etal = tl::inductance_etalement_via_via(h_cav * 1e-3, rayon * 1e-3,
                                                      d_percage.max(1e-3) * 1e-3);
        detail = vec![(obj! {
            "x" => round(x0, 4), "y" => round(y0, 4),
            "distance_mm" => round(rayon, 4), "repere" => "",
            "etalement_nH" => rnp(l_etal * 1e9, 4),
            "esl_nH" => round(ESL_PONT_REPLI, 3), "esl_source" => "repli",
            "esr_ohm" => round(ESR_PONT_REPLI, 4), "esr_source" => "repli",
            "capacite_F" => C_PONT_REPLI, "capacite_source" => "repli",
        },
        l_etal + ESL_PONT_REPLI * 1e-9,
        ESR_PONT_REPLI,
        C_PONT_REPLI)];
        borne = true;
    } else {
        borne = false;
    }

    // `pont` reste LE DOMINANT -- le plus proche -- parce que c'est lui que la
    // fiche nomme et que le chevelu met en avant. `ponts_detail` porte les
    // autres, avec leur part du courant : « lequel travaille » est exactement la
    // question qu'on se pose devant trois decouplages autour d'une transition.
    let dom = detail[0].0.clone();
    let dom_l = detail[0].1;
    let d_hors_pont = nb_opt(&via["pont_hors_rayon_mm"]);
    let ref_hors_pont = &via["pont_hors_rayon_ref"];
    maj(&mut fiche, obj! {
        "borne" => borne,
        "rayon_mm" => if rayon > 0.0 { Some(round(rayon, 4)) } else { None },
        "plus_proche_hors_rayon_mm" => d_hors_pont.map(|d| round(d, 3)),
        "plus_proche_hors_rayon_ref" => if ref_hors_pont.vrai() { Some(str_py(ref_hors_pont)) } else { None },
        "pont" => obj! {"x" => &dom["x"], "y" => &dom["y"],
                        "distance_mm" => &dom["distance_mm"],
                        "repere" => &dom["repere"]},
        "ponts_detail" => detail.iter().map(|f| f.0.clone()).collect::<Vec<Json>>(),
        "ponts_branches" => detail.iter().map(|f| obj! {"l" => f.1, "esr" => f.2, "c" => f.3}).collect::<Vec<Json>>(),
        "inductance_nH" => rnp(dom_l * 1e9, 4),
        "etalement_nH" => &dom["etalement_nH"],
        "esl_nH" => &dom["esl_nH"],
        "esl_source" => &dom["esl_source"],
        "esr_ohm" => &dom["esr_ohm"],
        "esr_source" => &dom["esr_source"],
        "capacite_pont_F" => &dom["capacite_F"],
        "capacite_pont_source" => &dom["capacite_source"],
    });
    Some(fiche)
}

/// Le modele electrique complet d'une transition, calcule UNE FOIS.
///
/// POURQUOI UNE SEULE FOIS. Les valeurs affichees et les valeurs cascadees
/// etaient calculees separement, chacune par son propre appel aux memes
/// fonctions. Tant que les deux appels sont identiques cela marche ; le jour ou
/// l'un des deux prend un argument de plus -- et c'est ce que les paliers de
/// retour et d'antipad viennent de faire --, la fiche annonce un chiffre et la
/// courbe en porte un autre. On calcule donc ici, et les deux lisent.
///
/// Remplit `trans["cotes"]`, `trans["retour"]`, `trans["capacite"]` et
/// `trans["modelise"]`, et rend le modele (L, C en henrys et farads).
#[allow(clippy::too_many_arguments)]
pub fn _modele_transition(
    trans: &mut Json, objets: &[Json], segments: &[Json], couches: &[Json], z_bornes: &[f64], refs_nets: &Noms, omega_c: f64,
    fc: f64, t_r: Option<f64>, doc: &Json,
) -> Res<ModeleVia> {
    let i = trans["troncon"].as_f64().unwrap_or(0.0) as i64;
    let obj = if 0 <= i && i < objets.len() as i64 { &objets[i as usize] } else { &VIDE };
    let (seg_av, seg_ap) = encadrants(trans, segments);
    let via = &obj["via"];

    let (h_via, d_percage, d_pastille) = _cotes_via(obj, trans);
    let (l_via, source) = _inductance_transition(trans, via, couches, segments,
                                                     z_bornes, refs_nets,
                                                     h_via, d_percage, None, None)?;
    let mut source = source.to_string();
    let c_via = _capacite_transition(trans, via, couches, seg_av, seg_ap,
                                     d_percage, d_pastille);
    let d_antipad = _nombre(&trans["cotes"]["antipad_mm"],
                            d_pastille + 2.0 * ANTIPAD_ECART_REPLI);

    let f0_sig = _nombre(&via["f_fondamentale"],
                         _nombre(&doc["f_fondamentale"],
                                 if fc > 0.0 { fc } else { 10e3 }));
    let tr_sig = _nombre(&via["temps_montee"],
                         _nombre(&doc["temps_montee"],
                                 match t_r {
                                     Some(t) if t > 0.0 => t,
                                     _ => if fc > 0.0 { 0.35 / fc } else { 1e-9 },
                                 }));

    // En régime impulsionnel numérique (BF < 1 MHz), le front de montée tr
    // excite les hautes fréquences (f_knee = 0,35 / tr) : c'est cette onde de
    // front qui traverse la cavité et voit l'inductance de boucle.
    let f_eval_cav = if fc < 1e6 && tr_sig > 0.0 { maxf(&[fc, 0.35 / tr_sig]) } else { fc };
    let omega_eval = if f_eval_cav > 0.0 { 2.0 * PI * f_eval_cav } else { omega_c };

    // PALIER 4 : LE RETOUR QUI CHANGE DE PLAN A UN PRIX, ET ON LE CHIFFRE.
    // L'inductance de la cavite est EN SERIE avec celle du via : ce sont deux
    // boucles distinctes -- celle du barreau avec ses retours, celle du plan du
    // haut avec le plan du bas par le pont. Leur mutuelle est negligee ; elles
    // sont dans des plans differents et se recoupent peu, mais c'est une
    // approximation et elle est dite.
    // LA CAVITE NE SE TRAVERSE QUE SI LES DEUX PLANS SONT DE NETS DIFFERENTS.
    // Entre deux plans de MASSE, le retour passe par le premier via de masse
    // venu -- c'est le palier de la boucle qui s'en charge, et il l'a deja fait.
    // Y ajouter une cavite compterait deux fois le meme chemin, et sur une
    // carte bien cousue cela vaut le double du via lui-meme.
    let mut cav: Option<Json> = if matches!(trans["retour"]["nets_differents"], Json::Bool(true)) {
        _cavite_de_retour(trans, via, couches, segments, d_percage).filter(Json::vrai)
    } else {
        None
    };
    // LA TRAVERSEE N'EST PAS UNE INDUCTANCE, ET LA TRAITER COMME TELLE ETAIT
    // FAUX. La cavite entre plans est un L-C : sa capacite repartie et
    // l'inductance du decouplage forment une resonance PARALLELE -- la « PRF »
    // du chapitre 13 de Bogatin -- ou l'impedance de la traversee CULMINE. Une
    // inductance equivalente figee au point central manquerait exactement le
    // phenomene qu'on veut voir. On garde donc les parametres et on evalue
    // l'impedance a chaque frequence de la cascade.
    let mut param_cav: Option<tl::Traversee> = None;
    if let Some(cav) = cav.as_mut() {
        // la fiche vit dans `trans` des maintenant (sa place parmi les cles) ; elle y est
        // reposee, completee, avant chaque lecture et a la fin
        poser(trans, "cavite", &*cav);
        param_cav = _param_cavite(cav, 1.0)?;
        if let Some(p) = &param_cav {
            let z_c = _impedance_traversee(Some(p), f_eval_cav);
            poser(cav, "impedance_fc_ohm", round(z_c.norm(), 4));
            // LA PART DU COURANT DE CHAQUE PONT, a la frequence d'evaluation.
            // C'est la meme grandeur que la `part` d'un via de retour, et elle
            // se lit au meme endroit : le chevelu peint l'une comme l'autre.
            // « Lequel travaille » est la question qu'on se pose devant trois
            // decouplages autour d'une transition.
            let (parts, part_cav) = tl::repartition_traversee_param(f_eval_cav, Some(p));
            if let Some(Json::Liste(l)) = dans_opt(cav, "ponts_detail") {
                for (f_pont, part) in l.iter_mut().zip(parts) {
                    // (des flottants numpy quand la cavite est modale)
                    poser(f_pont, "part", rnd(part, 4, p.modal.is_some()));
                }
            }
            // « CENT POUR CENT PAR LA CAVITE » NE VEUT RIEN DIRE QUAND IL N'Y A
            // PAS DE CAVITE MODELISEE. Dans le cas `etalement_seul` -- la page
            // ne cherche pas les decouplages -- `c_plans` vaut zero : la branche
            // n'a plus de capacite, ce n'est plus la cavite, c'est un simple
            // etalement en serie. Le partage rendait 100 % et la fiche allait
            // ecrire « tout le retour passe par la capacite repartie des
            // plans », ce qui est faux : on n'a pas regarde, voila tout. On ne
            // rend donc la part que quand la branche capacitive existe.
            if p.c_plans.is_some_and(|c| c != 0.0) {
                poser(cav, "part_cavite", rnd(part_cav, 4, p.modal.is_some()));
            }
            poser(cav, "freq_parts_hz", f_eval_cav);
            poser(cav, "inductance_equivalente_nH",
                  if omega_eval != 0.0 { round(z_c.im.max(0.0) / omega_eval * 1e9, 4) } else { 0.0 });
            source = if source == "boucle" { "boucle+cavite" } else { "self+cavite" }.to_string();
        }
    }

    // PALIER 3 : LE MOIGNON, s'il y en a un et qu'on peut le connaitre.
    let moignons = _moignons(trans, via, couches, z_bornes);
    poser(trans, "moignons", obj! {
        "connu" => &moignons["connu"],
        "incoherent" => moignons["incoherent"].vrai(),
        "depart" => _fiche_moignon(&moignons["depart"], d_percage, d_antipad, fc),
        "arrivee" => _fiche_moignon(&moignons["arrivee"], d_percage, d_antipad, fc),
    });
    if moignons["contre_percage"].vrai() {
        poser(dans(trans, "moignons"), "contre_percage", &moignons["contre_percage"]);
    }
    let y_dep = _admittance_moignon(&moignons["depart"], d_percage, d_antipad, fc);
    let y_arr = _admittance_moignon(&moignons["arrivee"], d_percage, d_antipad, fc);

    let z0 = [&seg_ap["z0"], &seg_av["z0"]].iter().find(|v| v.vrai()).and_then(|v| v.as_f64()).unwrap_or(50.0);
    // LA PHASE COMPTE TOUT CE QUI EST CASCADE, ET RIEN D'AUTRE. Les moignons
    // d'abord : leur susceptance s'ajoute a celle du via comme une capacite de
    // plus, et elle la depasse souvent -- un moignon de 1 mm vaut 206 fF contre
    // 87 pour le via entier. La traversee entre plans ensuite : elle est en
    // SERIE, donc elle compte comme une inductance de plus. L'omettre laissait
    // la colonne « Phase » identique avec et sans changement de reference,
    // c'est-a-dire mensongere sur le seul point qui distinguait les deux cartes.
    //
    // ET ELLE COMPTE LA REACTANCE SIGNEE. `max(0, Im Z)` ecrasait a zero toute
    // traversee CAPACITIVE -- c'est-a-dire tout ce qui est au-dessus de
    // l'antiresonance parallele, la ou |Z| culmine. Sur le cas du banc, a
    // 500 MHz, la traversee vaut +1,7 - 30,7j ohm et la phase affichee n'en
    // portait RIEN : zero contribution a la frequence la plus defavorable,
    // exactement le contraire de ce que ce commentaire annonce. La cascade,
    // elle, a toujours vu le Z complexe entier -- les parametres S etaient
    // justes, seule la colonne « Phase » mentait.
    //
    // Une reactance negative n'est pas une inductance negative : c'est une
    // capacite serie. On la rend telle quelle, en OHMS (`traversee_reactance_ohm`),
    // et l'inductance equivalente reste None quand elle n'a pas de sens.
    let c_effective = if omega_c != 0.0 { c_via + (y_dep.im + y_arr.im) / omega_c } else { c_via };
    let z_trav = _impedance_traversee(param_cav.as_ref(), if param_cav.is_some() { f_eval_cav } else { fc });
    let omega_trav = if param_cav.is_some() && omega_eval != 0.0 { omega_eval } else { omega_c };
    let x_trav = if omega_trav != 0.0 { z_trav.im } else { 0.0 };
    let l_trav = if omega_trav != 0.0 { x_trav / omega_trav } else { 0.0 };
    let zero = Complex64::new(0.0, 0.0);
    let a_cav = param_cav.is_some();
    poser(trans, "modelise", obj! {
        "type" => if y_dep == zero && y_arr == zero { "pi_L_C" } else { "pi_L_C_moignons" },
        // (la self partielle est un flottant numpy, la boucle un float)
        "inductance_nH" => rnd(l_via * 1e9, 4, source.starts_with("self")),
        "inductance_source" => &source,
        "capacite_fF" => rnp(c_via * 1e15, 3),
        "capacite_totale_fF" => rnp(c_effective * 1e15, 3),
        // LA TRAVERSEE N'EST PAS FONDUE DANS L'INDUCTANCE DU VIA : ce sont deux
        // grandeurs de natures differentes -- l'une decrit le barreau et sa
        // boucle de retour, l'autre le passage d'un plan a l'autre --, et le
        // chevelu ne montre que la premiere. Les additionner rendrait la fiche
        // incomparable avec ce qu'on voit sur le cuivre.
        "traversee_ohm" => if a_cav { Some(round(z_trav.norm(), 4)) } else { None },
        "traversee_reactance_ohm" => if a_cav { Some(round(x_trav, 4)) } else { None },
        // L'inductance equivalente n'existe que si la traversee est inductive.
        // Au-dessus de l'antiresonance elle ne l'est pas, et un chiffre negatif
        // en nanohenrys ne veut rien dire : on rend None, la reactance ci-dessus
        // porte alors l'information.
        "traversee_equivalent_nH" => if a_cav && x_trav > 0.0 { Some(round(l_trav * 1e9, 4)) } else { None },
        // La traversee entre plans entre par sa REACTANCE, a la frequence ou
        // elle a ete evaluee : X/Z0 radians de retard. Passer par une
        // inductance equivalente puis la remultiplier par omega_c melangeait
        // deux frequences des que `f_eval_cav` differait de `fc`.
        "phase_deg" => round((omega_c * (l_via / z0 + c_effective * z0) + x_trav / z0).to_degrees(), 4),
        "cotes_supposees" => trans.get("cotes_supposees").cloned().unwrap_or(Json::Bool(true)),
    });

    // PALIER 5 : LE BILAN DE SANTE DU SIGNAL
    // Evalue comment le signal est transmis et le score de reconstruction du front
    // (pont de decouplage vs cavite inter-plans, ou boucle par vias de masse).
    // L'ETAT DE LA BOUCLE SE TRANSMET AU BILAN. Sans lui, le verdict annonçait
    // « boucle de retour refermée de façon optimale » sur une transition
    // GND → PWR où aucun via ne peut la refermer — la seule phrase de la fiche
    // qui affirmait le contraire de ce que la ligne du dessus venait de dire.
    // `source` vaut « absent » quand la page n'a pas envoyé les voisins : on ne
    // sait pas, et None le dit.
    let ret_fiche = trans["retour"].clone();
    let retour_ferme = if ret_fiche["source"].as_str() == Some("absent") { None } else { Some(ret_fiche["raccorde"].vrai()) };
    let bilan = tl::bilan_sante_transition(
        l_via, c_effective, param_cav.as_ref(),
        &tl::OptionsBilan { z0, y_depart: y_dep, y_arrivee: y_arr, f0: f0_sig, tr: tr_sig, retour_ferme, ..Default::default() });
    let bilan_j = en_json(&bilan);
    poser(trans, "bilan_sante", &bilan_j);
    if let Some(cav) = cav.as_mut() {
        poser(cav, "bilan_sante", &bilan_j);
        poser(trans, "cavite", &*cav);
    }
    poser(dans(trans, "modelise"), "score_reconstruction_pct", &bilan_j["score_reconstruction_pct"]);
    poser(dans(trans, "modelise"), "verdict_reconstruction", &bilan_j["verdict"]);

    // PALIER 6 : CE QUE LA BOUCLE RAYONNE
    // L'amplitude vient de la rangée « Signal » du panneau, qui la porte déjà
    // pour la diaphonie — un seul chiffre pour un seul signal. Elle voyage dans
    // `analyse` comme le temps de montée ; zéro veut dire « prends le repli ».
    let mut v0_sig = _nombre(&via["amplitude_v"],
                             _nombre(&doc["amplitude_v"],
                                     _nombre(&doc["analyse"]["amplitude_v"], AMPLITUDE_REPLI)));
    if v0_sig <= 0.0 {
        v0_sig = AMPLITUDE_REPLI;
    }
    let ray = _rayonnement_transition(trans, h_via, z0, f0_sig, tr_sig, v0_sig, DISTANCE_MESURE_REPLI, CLASSE_CEM_REPLI);
    if let Some(r) = &ray {
        poser(trans, "rayonnement", r);
    }
    if let (Some(cav), Some(p)) = (cav.as_mut(), &param_cav) {
        if p.modal.as_ref().is_some_and(|m| m.bord.is_some()) {
            poser(cav, "rayonnement", _rayonnement_cavite(p, f0_sig, tr_sig, v0_sig, z0, DISTANCE_MESURE_REPLI, CLASSE_CEM_REPLI));
            if cav["grille"]["via_sur_ilot"].vrai() {
                let f = traversee_fourchette(cav)?;
                poser(cav, "fourchette_ilots", f);
            }
        }
    }
    if let Some(cav) = cav {
        poser(trans, "cavite", cav);
    }

    // PALIER 7 : BILAN D'IMPACT PHYSIQUE DU RETOUR HF & REBOND DE MASSE & CEM
    let fknee = if tr_sig > 0.0 { 0.35 / tr_sig } else { f0_sig };
    let omega_knee = 2.0 * PI * fknee;
    let z_knee = omega_knee * l_via;
    let i_signal = if z0 > 0.0 { v0_sig / z0 } else { 0.0 };
    let di_dt = if tr_sig > 0.0 { i_signal / tr_sig } else { 0.0 };
    let delta_v_gb = l_via * di_dt;

    // Référence optimale (via de retour à 1.0 mm dans la zone optimale <= 1.8 mm)
    let h_m = h_via * 1e-3;
    let r_drill = d_percage * 1e-3 / 2.0;
    let mut l_opt = tl::inductance_boucle_vias(
        &tl::Via { x: 0.0, y: 0.0, z1: 0.0, z2: h_m, rayon: r_drill },
        &[tl::Via { x: 1.0e-3, y: 0.0, z1: 0.0, z2: h_m, rayon: r_drill }], 1e-6).map_or(0.30e-9, |r| r.0);
    if !(l_opt > 0.0) {
        l_opt = 0.30e-9;
    }

    let z_knee_opt = omega_knee * l_opt;
    let delta_v_gb_opt = l_opt * di_dt;

    let mut d_proche = ret_fiche["plus_proche_retenu_mm"].as_f64();
    if d_proche.is_none() && ret_fiche["vias"].vrai() {
        let d_retenus: Vec<f64> = els(&ret_fiche["vias"]).iter().filter(|v| v["retenu"].vrai()).map(|v| num(v, "distance_mm")).collect();
        if !d_retenus.is_empty() {
            d_proche = Some(minf(&d_retenus));
        }
    }

    let gain_l = round(((l_via - l_opt) * 1e9).max(0.0), 4);
    let gain_zl = round((z_knee - z_knee_opt).max(0.0), 2);
    let gain_gb = round((delta_v_gb - delta_v_gb_opt).max(0.0), 3);
    let gain_cem = match d_proche {
        Some(d) if d > 1.0 => round(20.0 * (d / 1.0).log10(), 1),
        _ => 0.0,
    };

    let pire = ray.as_ref().map(|r| &r["pire"]).filter(|p| p.vrai());
    let champ_pire = pire.and_then(|p| p["champ_dbuv_m"].as_f64()).map(|c| round(c, 2));
    let marge_pire = pire.and_then(|p| p["marge_db"].as_f64()).map(|m| round(m, 2));

    let mut impact = obj! {
        "f0_hz" => f0_sig,
        "tr_s" => tr_sig,
        "fknee_hz" => fknee,
        "z0_ohm" => round(z0, 2),
        "v0_v" => round(v0_sig, 3),
        "i_signal_a" => round(i_signal, 4),
        "di_A" => round(i_signal, 4),
        "l_boucle_nh" => round(l_via * 1e9, 4),
        "inductance_boucle_nH" => round(l_via * 1e9, 4),
        "source" => &source,
        "z_knee_ohm" => round(z_knee, 2),
        "zl_fknee_ohm" => round(z_knee, 2),
        "ground_bounce_v" => round(delta_v_gb, 3),
        "delta_v_ground_bounce_v" => round(delta_v_gb, 3),
        "distance_retour_mm" => d_proche.map(|d| round(d, 3)),
        "d_retour_mm" => d_proche.map(|d| round(d, 3)),
        "statut" => ret_fiche.get("statut").cloned().unwrap_or_else(|| if !ret_fiche["raccorde"].vrai() { "ouvert" } else { "optimal" }.j()),
        "opt_l_boucle_nh" => round(l_opt * 1e9, 4),
        "opt_z_knee_ohm" => round(z_knee_opt, 2),
        "opt_ground_bounce_v" => round(delta_v_gb_opt, 3),
        "gain_z_ohm" => gain_zl,
        "gain_impedance_ohm" => gain_zl,
        "gain_gb_v" => gain_gb,
        "gain_ground_bounce_v" => gain_gb,
        "gain_l_nh" => gain_l,
        "gain_inductance_nH" => gain_l,
        "gain_cem_db" => gain_cem,
        "gain_emc_db" => gain_cem,
        "d_cible_mm" => 1.0,
        "cem_pire_champ_dbuv_m" => champ_pire,
        "e_max_cispr32_dbuv_m" => champ_pire,
        "cem_pire_marge_db" => marge_pire,
        "marge_cispr32_db" => marge_pire,
    };
    if let Some(r) = ray.as_ref().filter(|r| r["aire_boucle_mm2"].vrai()) {
        poser(&mut impact, "aire_boucle_mm2", round(num(r, "aire_boucle_mm2"), 4));
        if r["pire"].vrai() {
            poser(&mut impact, "cem_pire_freq_hz", r["pire"]["freq_hz"].as_f64().unwrap_or(0.0));
        }
    }

    poser(trans, "impact_retour", impact);

    // CE QUE LE VIA EN LIGNE ET LA MUTUELLE DE LA PAIRE LISENT, EN METRES ET
    // EN FARADS : le barreau emprunte, ses pastilles, le milieu qu'il
    // traverse, sa position et ses retours. Voir `_abcd_via` et
    // `_mutuelle_paire`.
    let a_ = ent(&trans["couche_depart"], 0);
    let b_ = ent(&trans["couche_arrivee"], 0);
    let (lo, hi) = (a_.min(b_), a_.max(b_));
    let z1 = zb(z_bornes, lo, 0.0) * 1e-3;
    let z2 = zb(z_bornes, hi + 1, 0.0) * 1e-3;
    let (er_v, td_v) = _milieu_traverse(couches, lo, hi);
    let cap = &trans["capacite"];
    let a_position = !nul(&via["x"]) && !nul(&via["y"]);
    let retours: Vec<tl::Via> = els(&trans["retour"]["vias"])
        .iter()
        .filter(|f| f["retenu"].vrai() && !nul(&f["x"]) && !nul(&f["y"]))
        .map(|f| tl::Via { x: nb(&f["x"]) * 1e-3, y: nb(&f["y"]) * 1e-3,
                           z1, z2,
                           rayon: _nombre(&f["percage_mm"], 0.0).max(1e-3) * 1e-3 / 2.0 })
        .collect();
    Ok(ModeleVia {
        l: l_via, c: c_via,
        moignon_depart: moignons["depart"].clone(),
        moignon_arrivee: moignons["arrivee"].clone(),
        percage: d_percage, antipad: d_antipad,
        cavite: param_cav,
        ligne: Some(LigneVia { longueur: (z2 - z1).max(0.0),
                          c_depart: nb(&cap["pastille_depart_fF"]) * 1e-15,
                          c_arrivee: nb(&cap["pastille_arrivee_fF"]) * 1e-15,
                          er: er_v, tan_delta: td_v }),
        geo: Some(GeoVia { x_mm: nb(&via["x"]),
                      y_mm: nb(&via["y"]),
                      a_position,
                      z1, z2, lo, hi,
                      retours }),
        modele: None,
        phase_rad: 0.0,
    })
}

/// Le chemin de retour des vias de la selection, SANS passer par la chaine.
///
/// POURQUOI CETTE FONCTION EXISTE. Jusqu'ici un via n'existait pour le calcul
/// que s'il tombait entre deux troncons CONSECUTIFS d'un parcours unique :
/// c'est `_transitions` qui les detecte, en lisant les changements de couche
/// le long de la chaine. Tout ce qui concerne le via pendait a cette detection
/// -- ses cotes, son inductance de boucle, les vias de masse qui la referment,
/// le chevelu. Sur un net qui se RAMIFIE -- un bus qui dessert trois boitiers,
/// le cas ordinaire -- il n'y a pas de chaine, donc pas de via detecte, donc
/// aucun chemin de retour, alors meme que le via est la, identifie, avec ses
/// coordonnees et son percage.
///
/// OR LE RETOUR D'UN VIA NE DOIT RIEN A L'ORDRE DES TRONCONS. Le via est a un
/// endroit fixe, il joint deux couches connues, il a des vias de masse autour
/// de lui, et sa boucle se calcule. Que la ligne se ramifie trois millimetres
/// plus loin n'y change rien. La page envoie donc les vias de la selection
/// dans une liste A PART, sans ordre, et on les analyse ici.
///
/// LA TRAVERSEE ENTRE PLANS, ELLE, EST CHIFFREE : elle ne doit rien a l'ordre
/// non plus. Quand les deux plans sont de nets differents, la cavite se pose
/// depuis l'empilage (les plans de part et d'autre du via, comme la
/// verification de carte) et son impedance se lit au front du signal. Elle
/// manquait : la verification de carte chiffrait ces vias, l'onglet non.
///
/// CE QU'ON NE FAIT PAS ICI, ET C'EST VOULU : aucune capacite, aucune matrice
/// ABCD, rien qui entre dans la cascade. Ces vias ne sont pas dans un
/// parcours ; les cascader supposerait un ordre qu'on n'a pas. On rend
/// l'inductance de boucle et le chemin de retour, qui sont vrais sans ordre,
/// et rien d'autre.
///
/// Rend une liste au MEME FORMAT que les transitions -- `cotes`, `retour`,
/// `modelise` -- pour que la page n'ait qu'une facon de lire un via.
pub fn _vias_hors_chaine(vias: &Json, couches: &[Json], z_bornes: &[f64], refs_nets: &Noms, fc: f64, t_r: Option<f64>) -> Res<Vec<Json>> {
    let mut out = Vec::new();
    for (rang, v) in els(vias).iter().enumerate() {
        let a_cu = ent(&v["layer_from"], -1);
        let b_cu = ent(&v["layer_to"], -1);
        // UN VIA QUI NE CHANGE PAS DE COUCHE N'EN EST PAS UN. On ne le compte
        // pas plutot que de rendre une boucle de hauteur nulle.
        if a_cu < 0 || b_cu < 0 || a_cu == b_cu {
            continue;
        }
        let mut trans = obj! {"troncon" => -1i64,
                              "couche_depart" => a_cu, "couche_arrivee" => b_cu,
                              "hauteur_empilage" => _hauteur_via(couches, &a_cu.j(), &b_cu.j())};
        let (h_via, d_percage, _d_pastille) = _cotes_via(&obj! {"via" => v}, &mut trans);
        let refs_av = _plans_de_couche(couches, a_cu);
        let refs_ap = _plans_de_couche(couches, b_cu);
        let (l_via, source) = _inductance_transition(
            &mut trans, v, couches, &[], z_bornes, refs_nets, h_via, d_percage,
            Some(refs_av.clone()), Some(refs_ap.clone()))?;
        let ou_vide = |v: &Json| if v.vrai() { v.clone() } else { obj! {} };
        let mut fiche = obj! {
            "rang" => rang,
            "couche_depart" => a_cu,
            "couche_arrivee" => b_cu,
            "cotes" => ou_vide(&trans["cotes"]),
            // LE DRAPEAU SUIT LES COTES, sans quoi il ne suit rien. La fiche
            // recopiait `cotes` mais pas ce booleen : un via hors parcours
            // chiffre sur une pastille devinee ne declenchait donc jamais la
            // mention « supposees » du panneau, qui filtre precisement
            // la-dessus. Les cotes partaient avec leur provenance ecrite dans
            // chaque champ, et personne pour la lire.
            "cotes_supposees" => trans["cotes_supposees"].vrai(),
            "retour" => ou_vide(&trans["retour"]),
            "modelise" => obj! {"inductance_nH" => rnd(l_via * 1e9, 4, source == "self"),
                                "inductance_source" => source},
            // LE VIA N'EST PAS CASCADE, ET LA FICHE DOIT LE DIRE. Un chiffre
            // d'inductance affiche a cote d'une courbe S laisse croire qu'il y
            // entre pour quelque chose. Ici il n'y entre pas.
            "cascade" => false,
        };
        if matches!(trans["retour"]["nets_differents"], Json::Bool(true)) {
            // le front du signal, comme `_modele_transition`
            let tr_ok = t_r.filter(|t| *t > 0.0);
            let mut f_eval = match tr_ok {
                Some(t) if fc < 1e6 => maxf(&[fc, 0.35 / t]),
                _ => fc,
            };
            if f_eval == 0.0 || f_eval.is_nan() {
                f_eval = 1e8;
            }
            let plans = |refs: &Noms| {
                let mut o = obj! {};
                for (k, n) in ["plan_haut", "plan_bas"].iter().zip(refs.iter()) {
                    poser(&mut o, k, n);
                }
                o
            };
            let encadre = [plans(&refs_av), plans(&refs_ap)];
            let mut trans1 = trans.clone();
            poser(&mut trans1, "troncon", 1i64);
            let mut cav = _cavite_de_retour(&trans1, v, couches, &encadre, d_percage).filter(Json::vrai);
            if let Some(cav) = cav.as_mut() {
                if let Some(param) = _param_cavite(cav, 1.0)? {
                    let z_c = _impedance_traversee(Some(&param), f_eval);
                    poser(cav, "impedance_fc_ohm", round(z_c.norm(), 4));
                    let (parts, _) = tl::repartition_traversee_param(f_eval, Some(&param));
                    if let Some(Json::Liste(l)) = dans_opt(cav, "ponts_detail") {
                        for (f_pont, part) in l.iter_mut().zip(parts) {
                            poser(f_pont, "part", round(part, 4));
                        }
                    }
                    maj(dans(&mut fiche, "modelise"), obj! {
                        "traversee_ohm" => round(z_c.norm(), 4),
                        "traversee_reactance_ohm" => round(z_c.im, 4),
                        "traversee_f_hz" => f_eval});
                    if param.modal.as_ref().is_some_and(|m| m.bord.is_some()) {
                        poser(cav, "rayonnement", _rayonnement_cavite(
                            &param, if fc != 0.0 { fc } else { f_eval }, tr_ok.unwrap_or(0.35 / f_eval),
                            AMPLITUDE_REPLI, 50.0, DISTANCE_MESURE_REPLI, CLASSE_CEM_REPLI));
                        if cav["grille"]["via_sur_ilot"].vrai() {
                            let f = traversee_fourchette(cav)?;
                            poser(cav, "fourchette_ilots", f);
                        }
                    }
                }
            }
            if let Some(cav) = cav {
                poser(&mut fiche, "cavite", cav);
            }
        }
        out.push(fiche);
    }
    Ok(out)
}
