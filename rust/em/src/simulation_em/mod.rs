//! Simulation EM d'une liaison : de l'empilage et du cuivre selectionne aux impedances par
//! troncon et aux parametres S. Le portage de python/simulation_em.py (5.8.0), fonction pour
//! fonction et sous les memes noms.
//!
//! Les documents echanges avec les pages restent des `Json` (les dict de Python, ordre des
//! cles compris) : memes cles, meme ordre, memes arrondis, memes textes. Ce qui levait
//! `ErreurSimulation` rend `Err(ErreurSimulation)`.
//!
//! Le document d'entree, format « cao-sim-em-3 » :
//!
//!     stackup    {layers: [...]}                       l'empilage
//!     geometry   {objects: [...]}                      la selection, en mm
//!     analyse    {f_debut, f_fin, points, f_centre}   (Hz)
//!
//! Le resultat, format « cao-sim-em-resultat-5 » (c'est `FORMAT_RESULTAT`, plus
//! bas, qui fait foi : cette page a annonce le « -4 » pendant deux versions apres
//! que le code eut passe au « -5 ») :
//!
//!     f_centre        la frequence a laquelle les impedances sont donnees
//!     segments        un par objet envoye, DANS LE MEME ORDRE : {z0, eps_eff,
//!                     topo, longueur, retard, pertes_db, plans, avert}
//!     ligne           le bilan de la liaison entiere : {z0_min, z0_max,
//!                     z0_moyen, longueur, retard, pertes_db}
//!     discontinuites   {coudes, transitions} -- ce que le modele ne calcule pas
//!                     mais que la fiche peut NOMMER et ESTIMER
//!     freqs / s       les parametres S sur la bande, matrice par frequence
//!     touchstone      le fichier .s2p, en texte
//!     avertissements  ce que le resultat ne couvre pas

// `!(x > 0.0)` n'est pas `x <= 0.0` : il refuse aussi NaN, comme le `not (x > 0)` du Python.
#![allow(clippy::neg_cmp_op_on_partial_ord, clippy::needless_range_loop)]

pub mod avertir;
pub mod base;
pub mod brins;
pub mod cascade;
pub mod chaleur;
pub mod couplage;
pub mod discontinuites;
pub mod document;
pub mod longement;
pub mod modele;
pub mod modes;
pub mod mutuelle;
pub mod retour;
pub mod scenes;
pub mod section;
pub mod topologie;
pub mod transition;

pub use avertir::*;
pub use base::{_bout, _nombre, dumps, loads, Json, Objet};
pub use brins::*;
pub use cascade::*;
pub use chaleur::*;
pub use couplage::*;
pub use discontinuites::*;
pub use document::*;
pub use ligne_mom as tl;
pub use longement::*;
pub use modele::*;
pub use modes::*;
pub use mutuelle::*;
pub use retour::*;
pub use scenes::*;
pub use section::*;
pub use topologie::*;
pub use transition::*;

use base::*;
use std::collections::{BTreeMap, HashMap, HashSet};
use std::f64::consts::PI;

pub const FORMAT: &str = "cao-sim-em-3";
pub const FORMAT_RESULTAT: &str = "cao-sim-em-resultat-5";
pub const VERSION: &str = "5.8.0";

/// {"simulation_em": VERSION, "ligne_mom": sa version}
pub fn version_moteurs() -> Json {
    obj! {
        "simulation_em" => VERSION,
        "ligne_mom" => tl::VERSION,
    }
}

// -- les garde-fous ---------------------------------------------------------
// Le calcul de section coute une matrice pleine N x N par troncon, N etant le
// nombre de panneaux du ruban (120). C'est de l'ordre de la dizaine de
// millisecondes ; ce qui compte, ce sont les troncons et les points de
// frequence. Deux resolutions par troncon (avec et sans dielectrique) sont
// mises en cache par section : une piste de cent segments de meme largeur sur
// la meme couche ne coute donc qu'un seul calcul.
pub const MAX_OBJETS: usize = 2000;
pub const MAX_POINTS: usize = 401;

// Un document de simulation ne porte qu'une selection : il est petit.
pub const MAX_CORPS: usize = 4 * 1024 * 1024;

/// Refus explicite, avec de quoi corriger le tir.
///
/// L'erreur porte un message d'une ligne pour la barre d'etat, et un conseil
/// actionnable -- ce qu'il faut changer dans le dessin ou dans l'empilage pour
/// que le calcul passe. Pas de stack trace cote client.
///
/// `interne` : ce n'est pas un refus du module mais une exception que Python laissait
/// remonter telle quelle (un `ValueError` de `ligne_mom`, donc une « Erreur interne » de la
/// route) ; le message est le sien.
#[derive(Debug, Clone, PartialEq)]
pub struct ErreurSimulation {
    pub message: String,
    pub conseil: String,
    pub interne: bool,
}

impl ErreurSimulation {
    pub fn new(message: impl Into<String>, conseil: impl Into<String>) -> Self {
        ErreurSimulation { message: message.into(), conseil: conseil.into(), interne: false }
    }
}

impl std::fmt::Display for ErreurSimulation {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.message)
    }
}

impl std::error::Error for ErreurSimulation {}

impl From<tl::Erreur> for ErreurSimulation {
    fn from(e: tl::Erreur) -> Self {
        ErreurSimulation { message: e.0, conseil: String::new(), interne: true }
    }
}

/// Ce que le serveur sait faire : les pages le demandent avant de lancer.
pub fn etat() -> Json {
    obj! {"dispo" => true, "format" => FORMAT, "resultat" => FORMAT_RESULTAT,
          "version" => VERSION,
          "moteurs" => version_moteurs(),
          "max" => MAX_CORPS,
          "methode" => "MoM quasi-statique sur la section droite\
                        \x20+ mise en cascade ABCD",
          "limites" => obj! {"objets" => MAX_OBJETS, "points" => MAX_POINTS}}
}

// CET AVERTISSEMENT A ETE FAUX DEUX FOIS, ET DANS LE MAUVAIS SENS. Il
// annoncait comme absents les coudes, les vias et les moignons alors que les
// trois sont desormais cascades. Un avertissement qui se trompe en se
// NOIRCISSANT est presque aussi nuisible qu'un qui flatte : on cesse de le
// lire, et il emporte avec lui ceux qui comptent. Ce qui reste vraiment hors
// modele est enumere ici, et rien d'autre.
pub const AVERTISSEMENTS_MODELE: [&str; 3] = [
    "Modèle de ligne : la piste est vue comme une suite de sections droites\
     \x20uniformes, avec ses coudes, ses vias et leurs moignons cascadés en\
     \x20éléments localisés. N'y sont pas : la cavité entre plans hors du chemin\
     \x20de retour chiffré au raccord, et le rayonnement — sauf celui de la\
     \x20boucle de retour d'un via, estimé à part et donné comme un plancher.",
    "Le couplage aux pistes voisines est calculé À PART — Z différentielle,\
     \x20section à deux conducteurs — et n'entre PAS dans la cascade :\
     \x20le Z₀ et les paramètres S ci-dessus sont ceux de la piste prise seule.\
     \x20Une piste couplée n'a pas une impédance mais deux, une par mode.",
    "Le calcul de section est quasi-statique ; la dispersion est ajoutée par\
     \x20le modèle de Getsinger, qui est un modèle et non un calcul. Au-delà de\
     \x20quelques gigahertz sur stratifié courant, l'écart se creuse.",
];

/// La grille de la bande S, frequence centrale comprise. Voir `simuler`.
pub fn frequences(analyse: &Json) -> Vec<f64> {
    let (f1, f2) = (num(analyse, "f_debut"), num(analyse, "f_fin"));
    let n = analyse["points"].as_f64().unwrap_or(0.0) as usize;
    // np.linspace : le pas, puis le dernier point pose exactement
    let pas = if n > 1 { (f2 - f1) / (n - 1) as f64 } else { 0.0 };
    let mut freqs: Vec<f64> = (0..n).map(|k| k as f64 * pas + f1).collect();
    if n > 1 {
        freqs[n - 1] = f2;
    }
    let fc = num(analyse, "f_centre");
    if !freqs.is_empty() && minf(&freqs.iter().map(|f| (f - fc).abs()).collect::<Vec<_>>()) > 1e-6 * maxf(&[fc, 1.0]) {
        freqs.push(fc);
        freqs.sort_by(f64::total_cmp);
    }
    freqs
}

/// Ce que `simuler` rend : le dict du resultat, et -- avec `garder_abcd` -- ce que Python y
/// rangeait en tableaux numpy, hors JSON.
#[derive(Debug, Clone)]
pub struct Resultat {
    pub json: Json,
    /// la matrice ABCD de la liaison a chaque frequence (`resultat["abcd"]`)
    pub abcd: Vec<tl::Abcd>,
    /// `resultat["s_diff"]["abcd_dd"]`, `["abcd_cc"]` et `["abcd_brins"]`
    pub abcd_dd: Vec<C2>,
    pub abcd_cc: Vec<C2>,
    pub abcd_brins: Vec<C4>,
}

/// Une section resolue, en cache sur `_cle_section`.
struct SectionCalc {
    z0: f64,
    raison: Json,
    z0_statique: f64,
    eps_eff_statique: f64,
    kw_pertes: Json,
    eps_eff: f64,
    alpha: f64,
    coplanaire: bool,
    ecart: f64,
    ecart_g: f64,
    ecart_d: f64,
    cotes: usize,
    info: Json,
}

impl SectionCalc {
    fn refus(raison: Json) -> Self {
        SectionCalc { z0: 0.0, raison, z0_statique: 0.0, eps_eff_statique: 0.0, kw_pertes: Json::Nul, eps_eff: 0.0, alpha: 0.0,
                      coplanaire: false, ecart: 0.0, ecart_g: 0.0, ecart_d: 0.0, cotes: 0, info: Json::Nul }
    }
}

fn plat(matrices: &[tl::Abcd]) -> Json {
    Json::Liste(matrices.iter().map(|m| Json::Liste(m.iter().flatten().map(|v| vec![v.re, v.im].j()).collect())).collect())
}

/// Document -> impedance par troncon et parametres S. Leve ErreurSimulation.
///
/// `garder_abcd` ajoute au resultat la matrice ABCD de la liaison a chaque
/// frequence (tableaux numpy, donc hors JSON) : c'est ce que python/rf_reseau.py
/// assemble avec les composants. La route HTTP ne le demande jamais.
///
/// `freqs_imposees` REMPLACE LA GRILLE DE LA BANDE S. Le diagramme de l'oeil
/// (python/oeil.py) repasse en temporel : il lui faut une grille REGULIERE,
/// partant pres du continu, de plusieurs milliers de points -- ni la frequence
/// centrale inseree au milieu, ni le plafond MAX_POINTS de la page. Le reste
/// du calcul (sections, discontinuites, cascade) est exactement le meme.
///
/// `doc` est modifie sur place quand la selection porte une paire entiere
/// (`_partager_paire`), comme en Python.
pub fn simuler(doc: &mut Json, mut journal: Option<&mut dyn FnMut(&str)>, garder_abcd: bool, freqs_imposees: Option<&[f64]>) -> Result<Resultat, ErreurSimulation> {
    let (couches, objets, analyse) = doc_valide(doc)?;

    let objets = _partager_paire(doc, objets);
    let doc: &Json = doc;
    // LES OPTIONS DE MODELE (dielectrique causal, modele de via), lues une
    // fois. Voir `options_modele`.
    let opts = options_modele(doc);

    let fc = num(&analyse, "f_centre");
    let (t_r, source_tr) = _temps_montee(&analyse);
    let mut z_ref = _nombre(&doc["ports"][0]["impedance"], 50.0);
    if z_ref == 0.0 {
        z_ref = 50.0;
    }
    let debut = std::time::Instant::now();

    // Deux resolutions de section par troncon, c'est cher ; mais une piste
    // porte le plus souvent la meme largeur sur la meme couche d'un bout a
    // l'autre. On met donc la section en cache sur (couche, largeur, epaisseur)
    // arrondis au nanometre : cent segments identiques ne coutent qu'un calcul.
    let mut cache: HashMap<CleSection, SectionCalc> = HashMap::new();
    let mut segments: Vec<Json> = Vec::new();
    let mut avertissements: Vec<String> = AVERTISSEMENTS_MODELE.iter().map(|s| s.to_string()).collect();
    avertissements.extend(els(&analyse["ajuste"]).iter().map(str_py));
    let mut vus: HashSet<CleSection> = HashSet::new();
    // L'avertissement « masse d'un seul cote » ne se dit qu'UNE fois pour toute
    // la selection : une piste qui longe une decoupe sur toute sa longueur
    // donne des dizaines de sections dans ce cas, et repeter la meme phrase
    // noierait tout le reste de la fiche. Son propre jeu, et pas `vus` : une
    // section peut etre a la fois dissymetrique et bordee d'un seul cote, et
    // partager le jeu ferait taire l'un des deux.
    let mut un_cote = false;
    // Meme regle pour le cuivre epais face a la masse coplanaire.
    let mut en_regard = false;

    // LA TOPOLOGIE DE LA SELECTION, ET CE QU'ELLE AUTORISE. Voir `_topologie`.
    // ON REFUSE DESORMAIS LA CASCADE PLUTOT QUE DE L'ASSORTIR D'UNE RESERVE.
    // La version precedente rendait les parametres S dans TOUS les cas, avec
    // une phrase disant qu'ils ne voulaient rien dire. C'est le pire des deux :
    // la courbe s'affiche, elle a l'air d'un resultat, on l'exporte en .s2p et
    // le .s2p ne porte pas l'avertissement. Un chiffre faux qui voyage est pire
    // qu'un chiffre absent. Les impedances par troncon et la carte de chaleur,
    // elles, ne dependent que de la section de chacun : elles restent rendues.
    let topo = _topologie(&objets);
    let cascadable = topo["cascadable"].vrai();
    let refus = raison_topologie(&topo);
    if !refus.is_empty() {
        avertissements.push(format!(
            "{} Les impédances par tronçon et la carte de chaleur restent\
             \x20justes — chacune ne dépend que de sa propre section.", refus));
    }

    // LOT 3a : voir et dire les discontinuités
    let mut coudes = _coudes(&objets);
    let mut transitions = _transitions(&objets, &couches);

    // LES MODELES DE DISCONTINUITE VIVENT DANS ligne_mom.py, et nulle part
    // ailleurs. Ce fichier en portait trois copies -- une pour l'affichage, une
    // pour la cascade, une troisieme dans `_coudes` -- et elles ne donnaient
    // pas le meme chiffre. Il n'en reste aucune : `tl.elements_coude`,
    // `tl.inductance_via` et `tl.capacite_pastille` servent les deux usages, et
    // elles prennent des METRES.
    for obj in &objets {
        let largeur = nb(&obj["width"]);
        let indice = ent(&obj["layer"], 0);
        let ep = _nombre(&obj["copper_thickness"], 0.035);
        // Les deux ecarts au cuivre de masse coplanaire, mesures par la page,
        // un par cote. Absents, c'est zero des deux cotes : le microruban nu.
        let (gap_g, gap_d) = _ecarts(obj);
        let mut longueur = nb(&obj["length"]);
        if longueur <= 0.0 {
            let zero = Json::Liste(vec![Json::Entier(0), Json::Entier(0)]);
            let a = ou(&obj["start"], &zero);
            let b = ou(&obj["end"], &zero);
            longueur = py::hypot(nb(&b[0]) - nb(&a[0]),
                                 nb(&b[1]) - nb(&a[1]));
        }

        let cle = _cle_section(obj);
        if !cache.contains_key(&cle) {
            let (geo, info) = section_de_couche(&couches, indice, largeur, ep, gap_g, Some(gap_d), &[], false);
            let calc = match geo {
                None => SectionCalc::refus(info),
                Some(geo) => match tl::solve_line(&geometrie(&geo)) {
                    Err(exc) => SectionCalc::refus(exc.0.j()),
                    Ok(r) => {
                        // La dispersion ne concerne que le microruban : la
                        // triplaque est noyee dans un milieu homogene, sa
                        // permittivite effective ne bouge pas avec la frequence.
                        // LES OPTIONS DE PERTES DE LA SECTION, une fois : la
                        // topologie et la hauteur qu'elle connait, la rugosite de
                        // sa couche. Voir `_geometrie_pertes`.
                        let kw = kw_reunis(_geometrie_pertes(&info, r.cotes > 0, false),
                                           _rugosite_section(&couches, indice, &info));
                        let (eps_f, z_f, a_c, a_d) = _ligne_a(
                            r.z0, r.eps_eff, &info, fc, largeur * 1e-3,
                            ep * 1e-3, &kw, Some(&opts))?;
                        // UN SEUL COTE AVEC DE LA MASSE, ce n'est pas une
                        // coplanaire ordinaire : le champ n'est pas encadre, il
                        // penche. Le calcul le tient -- c'est tout l'objet de la
                        // 2.3.0 -- mais l'ecart affiche a l'air complet alors qu'il
                        // ne decrit qu'un bord, et cela se dit.
                        if r.cotes == 1 && !un_cote {
                            un_cote = true;
                            avertissements.push(format!(
                                "Masse coplanaire D'UN SEUL CÔTÉ sur au moins un\
                                 \x20tronçon : {:.3} mm d'un bord, rien de l'autre à\
                                 \x20portée. C'est calculé tel quel — le champ n'est\
                                 \x20pas encadré et Z₀ reste plus haute que sur une\
                                 \x20coplanaire symétrique. Vérifiez que c'est voulu :\
                                 \x20une découpe, un bord de carte ou un plan qui\
                                 \x20s'arrête là.",
                                1e3 * maxf(&[r.ecart_g, r.ecart_d])));
                        }
                        if r.flancs_en_regard && !en_regard {
                            en_regard = true;
                            avertissements.push(format!(
                                "Cuivre épais face à la masse coplanaire, de près\
                                 \x20({:.3} mm d'écart, moins de {} épaisseurs de\
                                 \x20cuivre) sur au moins un tronçon : le\
                                 \x20condensateur que font les flancs face à face\
                                 \x20n'est pas calculé, et Z₀ sort 3 à 7 % trop\
                                 \x20haute. ε_eff et le retard tiennent à 5 %.",
                                minf(&[gap_g, gap_d].into_iter().filter(|e| *e > 0.0).collect::<Vec<_>>()),
                                fmt_g(tl::FLANCS_EN_REGARD, 6)));
                        }
                        if info["topo"].as_str() == Some("strip") && num(&info, "dissym") > 0.4 && !vus.contains(&cle) {
                            vus.insert(cle);
                            avertissements.push(
                                "Triplaque nettement dissymétrique : le ruban n'est\
                                 \x20pas à mi-hauteur entre ses plans. C'est calculé\
                                 \x20tel quel ici — la formule IPC de la fiche\
                                 \x20« Ligne de transmission », elle, suppose le ruban\
                                 \x20centré et sort au-dessus.".to_string());
                        }
                        SectionCalc { z0: z_f, z0_statique: r.z0,
                                      eps_eff_statique: r.eps_eff,
                                      kw_pertes: kw,
                                      eps_eff: eps_f, alpha: a_c + a_d,
                                      coplanaire: r.coplanaire,
                                      // Les ecarts RETENUS par le solveur, cote par
                                      // cote : sous une epaisseur de cuivre il les
                                      // laisse tomber, et ce n'est pas la page qui
                                      // peut le savoir.
                                      ecart: r.ecart,
                                      ecart_g: r.ecart_g,
                                      ecart_d: r.ecart_d,
                                      cotes: r.cotes,
                                      info, raison: "".j() }
                    }
                },
            };
            cache.insert(cle, calc);
        }

        let c = &cache[&cle];
        let mut seg = obj! {"z0" => round(c.z0, 3), "longueur" => round(longueur, 4),
                            "largeur" => round(largeur, 4), "couche" => indice,
                            "raison" => &c.raison};
        if c.z0 > 0.0 {
            let v = tl::C_0 / c.eps_eff.sqrt();
            let retard = (longueur * 1e-3) / v;
            maj(&mut seg, obj! {
                "z0_statique" => round(c.z0_statique, 3),
                "eps_eff" => round(c.eps_eff, 4),
                "topo" => &c.info["topo"],
                // Une piste interne qui n'a de plan que d'un cote est un
                // microruban COUVERT : meme topologie, mais du stratifie
                // au-dessus. Le tableau doit pouvoir le nommer.
                "couvert" => numd(&c.info, "couverture", 0.0) > 0.0,
                // LES ECARTS RETENUS, qui ne sont pas toujours ceux envoyes :
                // sous une epaisseur de cuivre le solveur les laisse tomber.
                // « ecart » est le cote le plus serre de ceux qui portent de la
                // masse -- c'est lui qui commande Z0 -- et « cotes » dit combien
                // en portent : 2 pour une coplanaire ordinaire, 1 pour une
                // piste qui longe une decoupe, 0 pour un microruban nu.
                "coplanaire" => c.coplanaire,
                "ecart" => round(1e3 * c.ecart, 4),
                "ecart_g" => round(1e3 * c.ecart_g, 4),
                "ecart_d" => round(1e3 * c.ecart_d, 4),
                "cotes" => c.cotes,
                "retard" => retard,
                "pertes_db" => round(8.686 * c.alpha * longueur * 1e-3, 4),
                "plan_haut" => &c.info["plan_haut"],
                "plan_bas" => &c.info["plan_bas"],
                // LA SECTION RESOLUE, EN CLAIR. Elle etait calculee ici et
                // jamais rendue : la fiche montrait Z0 sans montrer sur quoi il
                // avait ete obtenu, et diagnostiquer trois ohms d'ecart avec une
                // carte reelle demandait d'INVERSER le resultat pour retrouver
                // la hauteur au plan. Tout est en millimetres, comme le reste du
                // document.
                "h" => round(1e3 * num(&c.info, "h"), 4),
                "er" => round(num(&c.info, "er"), 3),
                "tan_delta" => round(num(&c.info, "tan_delta"), 5),
                "couverture" => round(1e3 * numd(&c.info, "couverture", 0.0), 4),
                "entre_plans" => round(1e3 * numd(&c.info, "b", 0.0), 4),
                "cuivre" => round(ep, 4),
                // LOT 2 : le masque de soudure s'il y en a un
                "masque" => &c.info["masque"],
            });
        }
        segments.push(seg);
    }

    let valides: Vec<&Json> = segments.iter().filter(|s| num(s, "z0") > 0.0).collect();
    if valides.is_empty() {
        let raison = if segments[0]["raison"].vrai() { str_py(&segments[0]["raison"]) } else { "aucune ligne calculable".to_string() };
        return Err(ErreurSimulation::new(
            format!("Aucun tronçon n'a d'impédance calculable : {}.", raison),
            "Un plan de référence doit faire face à la piste. Vérifiez le rôle\
             \x20des couches dans l'empilage."));
    }

    // -- le bilan de la liaison ------------------------------------------
    let long_tot = py::sum(valides.iter().map(|s| num(s, "longueur")));
    let z_moyen = if long_tot > 0.0 {
        py::sum(valides.iter().map(|s| num(s, "z0") * num(s, "longueur"))) / long_tot
    } else {
        num(valides[0], "z0")
    };
    let z0s: Vec<f64> = valides.iter().map(|s| num(s, "z0")).collect();
    let mut ligne = obj! {
        "z0_min" => round(minf(&z0s), 3),
        "z0_max" => round(maxf(&z0s), 3),
        "z0_moyen" => round(z_moyen, 3),
        "longueur" => round(long_tot, 3),
        "retard" => py::sum(valides.iter().map(|s| num(s, "retard"))),
        "pertes_db" => round(py::sum(valides.iter().map(|s| num(s, "pertes_db"))), 4),
        "troncons" => valides.len(),
        "ecartes" => segments.len() - valides.len(),
    };
    let n_valides = valides.len();
    // LE RETARD ET LES PERTES SONT DES CUMULS LE LONG D'UN PARCOURS. Sur un net
    // ramifie ils additionnent des branches paralleles, ce qui ne correspond a
    // aucun trajet reel : la somme des longueurs d'un T n'est le chemin de
    // personne. On les rend quand meme -- ils disent la quantite de cuivre --
    // mais le panneau doit savoir qu'ils ne sont pas le retard de la liaison.
    poser(&mut ligne, "cumuls_valides", cascadable);

    // -- les parametres S, par mise en cascade ---------------------------
    // Chaque troncon est une ligne uniforme : sa matrice ABCD est exacte, et
    // les mettre bout a bout, c'est les multiplier. La matrice S s'en deduit
    // sur l'impedance de reference des ports.
    // LA FREQUENCE CENTRALE FAIT PARTIE DE LA BANDE, toujours. Une bande
    // regulierement echantillonnee tombe rarement dessus : 21 points de 0,1 a
    // 3 GHz donnent 100, 245, ... 825, 970 MHz -- et pas 868. Le panneau lisait
    // alors 825 MHz sous le repere f0, et surtout le .s2p exporte ne contenait
    // PAS la frequence de travail, ce qui le rend inutilisable tel quel dans un
    // outil d'adaptation. On l'insere donc, quitte a rompre la regularite du
    // pas : un point de plus coute une matrice 2x2, la frequence qu'on cherche
    // vaut mieux que l'elegance de l'echantillonnage.

    // LE MODELE DE CHAQUE VIA, CALCULE UNE FOIS POUR TOUTES. Il lui faut les
    // troncons resolus -- la hauteur au plan de chaque pastille, la
    // permittivite, les plans de reference -- donc il ne peut pas se faire plus
    // tot ; et il doit se faire avant la cascade, qui le lit a chaque
    // frequence. Voir `_modele_transition` : c'est le meme chiffre qui est
    // affiche et qui est applique.
    let omega_c = 2.0 * PI * fc;
    let refs_nets: Noms = els(&doc["reference_nets"]).iter().map(str_py).filter(|x| !py::strip(x).is_empty()).collect();
    let z_bornes = _z_empilage(&couches);
    let mut modeles_via: BTreeMap<usize, ModeleVia> = BTreeMap::new();
    let rang_de = |t: &Json| t["troncon"].as_i64().unwrap_or(0) as usize;
    for trans in transitions.iter_mut() {
        let i = rang_de(trans);
        modeles_via.insert(i, _modele_transition(
            trans, &objets, &segments, &couches, &z_bornes, &refs_nets, omega_c, fc,
            Some(t_r), doc)?);
    }

    let f_fin = numd(&analyse, "f_fin", 0.0);
    avertissements.extend(_avertir_retour(&transitions, f_fin));

    // LES VIAS QUE LA CHAINE N'A PAS VUS. Voir `_vias_hors_chaine` : sur un net
    // ramifie il n'y a pas de parcours, donc pas de transition, donc aucun
    // chemin de retour -- alors que le via est la. On analyse ici ceux que la
    // page envoie a part, et on ECARTE ceux que la chaine a deja pris, pour
    // qu'un meme via ne soit pas chiffre deux fois avec deux valeurs.
    let bits = |x: f64| (round(x, 3) + 0.0).to_bits();
    let mut deja: HashSet<(u64, u64)> = HashSet::new();
    for t in &transitions {
        let r = &t["retour"];
        if !nul(&r["x"]) && !nul(&r["y"]) {
            deja.insert((bits(num(r, "x")), bits(num(r, "y"))));
        }
    }
    let bruts: Vec<Json> = els(&doc["vias"]).iter()
        .filter(|v| !deja.contains(&(bits(_nombre(&v["x"], 0.0)), bits(_nombre(&v["y"], 0.0))))).cloned().collect();
    let vias_seuls = _vias_hors_chaine(&Json::Liste(bruts), &couches, &z_bornes, &refs_nets, fc, Some(t_r))?;
    if transitions.is_empty() {
        // un net ramifie n'a que ces vias-la : ce qu'ils obligent a dire se dit
        avertissements.extend(_avertir_retour(&vias_seuls, f_fin));
    }

    // LOT 3b : construire les index de discontinuités par tronçon
    // Chaque coude ou transition insère sa matrice ABCD après le tronçon i
    let coudes_par_troncon: BTreeMap<usize, Json> = coudes.iter().map(|c| (rang_de(c), c.clone())).collect();

    let freqs: Vec<f64> = match freqs_imposees {
        Some(f) => f.to_vec(),
        None => frequences(&analyse),
    };
    // LE MODELE DE CHAQUE VIA, pi ou ligne, choisi sur la bande entiere et non
    // frequence par frequence : un via qui changerait de modele en cours de
    // bande ferait une marche dans la courbe. La fiche dit lequel a servi.
    let f_max = if freqs.is_empty() { fc } else { maxf(&freqs) };
    for (i_t, mv) in modeles_via.iter_mut() {
        let modele = _modele_via_resolu(mv, opts.modele_via, f_max);
        mv.modele = Some(modele);
        // la derniere transition de ce rang, comme le dict `transitions_par_troncon`
        if let Some(t) = transitions.iter_mut().rev().find(|t| rang_de(t) == *i_t) {
            if t["modelise"].as_objet().is_some() {
                let m = dans(t, "modelise");
                poser(m, "modele_via", modele);
                poser(m, "modele_via_demande", opts.modele_via);
                poser(m, "phase_via_rad", round(mv.phase_rad, 5));
                if modele == "ligne" {
                    let genre = if m["type"].as_str() == Some("pi_L_C") { "ligne_L_C" } else { "ligne_L_C_moignons" };
                    poser(m, "type", genre);
                }
            }
        }
    }
    let mut matrices: Vec<tl::Abcd> = Vec::new();
    let mut abcds: Vec<tl::Abcd> = Vec::new();
    // PAS DE CASCADE SUR CE QUI N'EST PAS UNE CHAINE. `freqs` reste rendu :
    // l'axe de l'analyse est ce qui a ete demande, il ne depend pas de la
    // topologie et le panneau s'en sert pour dire sur quelle bande il
    // aurait calcule.
    // LA TRAVERSEE MODALE A TOUTES LES FREQUENCES D'UN COUP : le reseau a ports
    // se resout en lot (numpy) plutot qu'une frequence a la fois dans la boucle.
    let mut z_trav: BTreeMap<usize, Vec<Complex64>> = BTreeMap::new();
    if cascadable {
        for (i_t, mv) in &modeles_via {
            if mv.cavite.as_ref().is_some_and(|c| c.modal.is_some()) {
                z_trav.insert(*i_t, tl::impedance_traversee_vec(&freqs, mv.cavite.as_ref()));
            }
        }
    }
    let un = Complex64::new(1.0, 0.0);
    let zero = Complex64::new(0.0, 0.0);
    for (k_f, &f) in freqs.iter().enumerate().take(if cascadable { freqs.len() } else { 0 }) {
        let mut abcd: tl::Abcd = [[un, zero], [zero, un]];
        for (i, (obj, seg)) in objets.iter().zip(&segments).enumerate() {
            if num(seg, "z0") <= 0.0 {
                continue;
            }
            let ep = round(_nombre(&obj["copper_thickness"], 0.035), 6);
            let c = &cache[&_cle_section(obj)];
            // L'EPAISSEUR DE CUIVRE PART AVEC, comme au point central. L'oublier
            // ici laissait `line_losses` reprendre son 35 um par defaut : le
            // tableau des troncons et la courbe S annoncaient alors deux pertes
            // differentes A LA MEME FREQUENCE des que le cuivre n'etait pas du
            // 35 um -- d'un facteur 4 sur du 9 um sous la profondeur de peau.
            // LES OPTIONS DE LA SECTION PARTENT AUSSI, pour la meme raison :
            // `_ligne_a` est le calcul du point central, frequence en plus.
            // LE COUPLE STATIQUE, l'un et l'autre : « eps_eff » du cache est
            // deja disperse au point central, et Getsinger le redispersait
            // (dispersion comptee deux fois, decalage croissant avec f).
            let (eps_f, z_f, a_c, a_d) = _ligne_a(
                c.z0_statique, c.eps_eff_statique, &c.info, f,
                num(seg, "largeur") * 1e-3, ep * 1e-3, &c.kw_pertes, Some(&opts))?;
            let beta = 2.0 * PI * f * eps_f.sqrt() / tl::C_0;

            // LA DISCONTINUITE SE POSE AVANT LE TRONCON QU'ELLE PRECEDE.
            //
            // `_coudes` et `_transitions` rangent l'une et l'autre au rang du
            // troncon d'ARRIVEE : un coude entre les troncons 0 et 1 porte
            // « troncon 1 ». La cascade, elle, les inserait APRES avoir pose la
            // ligne du troncon 1 -- donc entre 1 et 2, et non entre 0 et 1.
            // Chaque discontinuite etait decalee d'un troncon vers la sortie, et
            // la DERNIERE sortait carrement du parcours : sur la liaison a trois
            // troncons et deux vias qui motive tout ce lot, le second via se
            // retrouvait AU-DELA DU PORT 2.
            //
            // POURQUOI PERSONNE NE L'AVAIT VU. Sur deux troncons de meme
            // impedance, les deux ordres donnent EXACTEMENT le meme |S11| : une
            // ligne uniforme et un reseau en pi sont tous deux symetriques, et
            // le produit de deux matrices symetriques rend le meme S11 dans les
            // deux sens. Il faut trois troncons pour que l'erreur se voie -- on
            // mesure alors 0,34 dB de |S11| et 2,7 degres de phase a 3 GHz.
            if let Some(coude) = coudes_par_troncon.get(&i) {
                // TOUT EN METRES, et la HAUTEUR AU PLAN avec : c'est le
                // parametre dominant du modele de Gupta, et il manquait.
                abcd = mul2(&abcd, &tl::abcd_coude(num(seg, "largeur") * 1e-3,
                                                   maxf(&[numd(seg, "h", 0.0), 1e-9]) * 1e-3,
                                                   numd(seg, "er", 4.3), f,
                                                   num(coude, "angle_deg")));
            }

            // LE L ET LE C VIENNENT DE `_modele_transition`, calcules plus
            // haut : L est l'inductance de BOUCLE avec les vias de masse qui la
            // referment, C compte les antipads et les pastilles a la distance de
            // leur plan. Les recalculer ici, c'etait la porte ouverte a une
            // fiche et une courbe qui ne disent pas la meme chose.
            // LES MOIGNONS SE RECALCULENT A CHAQUE FREQUENCE, et il le faut :
            // un moignon n'est une capacite que loin de sa resonance. Le figer
            // a la valeur du point central ferait manquer exactement ce qu'on
            // veut voir -- le creux ou il court-circuite la liaison.
            if let Some(mv) = modeles_via.get(&i) {
                let z_t = match z_trav.get(&i) {
                    Some(z) => z[k_f],
                    None => _impedance_traversee(mv.cavite.as_ref(), f),
                };
                abcd = mul2(&abcd, &_abcd_via(mv, f, z_t, mv.modele.unwrap_or("pi"), None, None));
            }

            // Zc ET gamma COMPLEXES (`tl.ligne_a_pertes`) : la resistance du
            // cuivre est en SERIE, pas a moitie en fuite vers la masse.
            let (zc, gamma) = tl::ligne_a_pertes(z_f, a_c, a_d, beta);
            abcd = mul2(&abcd, &tl::abcd_line(zc, gamma, num(seg, "longueur") * 1e-3));
        }

        matrices.push(tl::cascade_to_s(&abcd, z_ref));
        abcds.push(abcd);
    }

    let duree = debut.elapsed().as_secs_f64();
    let ou_txt = |v: &Json, defaut: &str| if v.vrai() { str_py(v) } else { defaut.to_string() };
    if let Some(j) = journal.as_mut() {
        j(&format!("  simulation « {} » : {} tronçon(s), Z0 {:.1}-{:.1} Ω à {:.3} GHz,\
                    \x20{:.1} s\n", ou_txt(ou(&doc["net"], &doc["carte"]), "(sans nom)"),
                   n_valides, num(&ligne, "z0_min"), num(&ligne, "z0_max"),
                   fc / 1e9, duree));
    }

    // LES NETS DE REFERENCE PARTENT AVEC LE RESULTAT. Ils ne changent rien au
    // calcul -- la page a deja mesure les ecarts -- mais ils disent ce qui a ete
    // tenu pour de la masse, et c'est une hypothese, pas un fait : un ilot d'un
    // autre signal qui longe la piste n'est pas un plan de retour. Un .s2p ou un
    // .csv se detache de la page ou il a ete produit ; sans cette ligne, il ne
    // reste qu'un chiffre dont on ne sait plus contre quoi il a ete calcule.
    let refs: Vec<String> = els(&doc["reference_nets"]).iter().map(str_py).filter(|x| !py::strip(x).is_empty()).collect();

    let mut entete = vec![
        "Genere par WEB_CAO -- MoM quasi-statique sur la section droite\
         \x20(python/ligne_mom.py), mise en cascade ABCD".to_string(),
        format!("Source : {}", ou_txt(&doc["source"], "inconnue")),
        format!("Carte : {}", ou_txt(&doc["carte"], "-")),
        format!("Net : {}", ou_txt(&doc["net"], "-")),
        format!("Masse de reference : {}", if refs.is_empty() { "non declaree".to_string() } else { refs.join(", ") }),
        format!("Z0 moyen : {:.2} ohm a {:.4} GHz", num(&ligne, "z0_moyen"), fc / 1e9),
    ];
    // LES OPTIONS QUI CHANGENT LE CHIFFRE partent avec le fichier, et
    // seulement quand elles sont prises : un .s2p par defaut reste le meme.
    if opts.causal {
        entete.push(format!("Dielectrique causal (Djordjevic-Sarkar), fiche a {} GHz", fmt_g(opts.f_ref / 1e9, 4)));
    }
    if opts.modele_via != MODELE_VIA_DEFAUT {
        entete.push(format!("Modele de via : {}", opts.modele_via));
    }
    let rugueuses: Vec<usize> = (0..couches.len()).filter(|&i| _rugosite_couche(&couches, i as i64).vrai()).collect();
    if !rugueuses.is_empty() {
        entete.push("Rugosite du cuivre comptee (empilage)".to_string());
    }

    // LOT 3b : enrichir les discontinuités avec les valeurs modélisées
    // CE QUI EST AFFICHE EST CE QUI EST APPLIQUE. Les memes fonctions, les
    // memes entrees, et la phase que l'element vaut A LA FREQUENCE CENTRALE de
    // l'analyse -- pas a 5 GHz pose en dur, ce qu'ecrivait la version
    // precedente quelle que soit la bande demandee.
    for coude in coudes.iter_mut() {
        let i = rang_de(coude);
        if i >= segments.len() {
            continue;
        }
        let seg = &segments[i];
        let (l, c) = tl::elements_coude(numd(seg, "largeur", 0.0) * 1e-3,
                                        maxf(&[numd(seg, "h", 0.0), 1e-9]) * 1e-3,
                                        numd(seg, "er", 4.3), num(coude, "angle_deg"));
        let z0 = if seg["z0"].vrai() { num(seg, "z0") } else { 50.0 };
        poser(coude, "modelise", obj! {
            "type" => "T_L_C_Gupta",
            "inductance_pH" => round(l * 1e12, 2),
            "capacite_fF" => round(c * 1e15, 2),
            // Ce que l'element pese, en degres de phase, a la frequence
            // centrale : c'est CE chiffre qui dit s'il faut s'en soucier.
            "phase_deg" => round((omega_c * (l / z0 + c * z0)).to_degrees(), 4),
        });
    }

    // Les transitions, elles, ont ete modelisees avant la cascade : elles en
    // avaient besoin. Voir `_modele_transition`.

    // LE COUPLAGE, dernier calcul et le seul qui regarde HORS de la selection.
    // Il n'a besoin ni de la cascade ni des discontinuites -- seulement de la
    // geometrie et de l'empilage -- mais il vient apres pour que ses
    // avertissements se rangent a la suite des autres.
    let couplage = _couplage(&couches, &objets, doc, &analyse, &mut avertissements);

    // (`analyse` est celle que `doc_valide` a rendue : elle ne porte pas « z_ref_diff »)
    let cible = ou(ou(&analyse["z_ref_diff"], &doc["cible_diff"]), &Json::Flottant(100.0));
    let mut z_ref_diff = dc_solver::pyth::float_py(cible).map_err(|e| ErreurSimulation { message: e.0, conseil: String::new(), interne: true })?;
    if z_ref_diff <= 0.0 {
        z_ref_diff = 100.0;
    }
    let s_diff = _cascade_differentielle(&couches, &objets, &segments, &couplage,
                                         &freqs, z_ref_diff, doc, &analyse,
                                         &mut avertissements, &topo,
                                         garder_abcd,
                                         &modeles_via,
                                         &coudes_par_troncon,
                                         &z_trav, Some(&opts), None)?;
    let (s_diff_json, s_diff_abcd) = match s_diff {
        Some(s) => (s.json, (s.abcd_dd, s.abcd_cc, s.abcd_brins)),
        None => (Json::Nul, Default::default()),
    };

    let mut resultat = obj! {
        "format" => FORMAT_RESULTAT,
        "version" => VERSION,
        "moteurs" => version_moteurs(),
        "carte" => if doc["carte"].vrai() { doc["carte"].clone() } else { "".j() },
        "net" => if doc["net"].vrai() { doc["net"].clone() } else { "".j() },
        "reference_nets" => refs,
        "f_centre" => fc,
        "temps_montee" => t_r,
        "temps_montee_source" => source_tr,
        "impedance_reference" => z_ref,
        "segments" => segments.clone(),
        "ligne" => ligne,
        "discontinuites" => obj! {
            "coudes" => coudes,
            "transitions" => transitions,
            // LES VIAS HORS PARCOURS, au meme format que les transitions mais
            // dans une liste distincte : ils portent un chemin de retour et une
            // inductance de boucle, et RIEN dans la cascade. Les melanger aux
            // transitions ferait croire qu'ils y entrent.
            "vias_hors_chaine" => vias_seuls,
        },
        "freqs" => freqs.clone(),
        "s" => plat(&matrices),
        "ports" => 2i64,
        // LE .s2p SUIT LA CASCADE, et disparait avec elle. Un Touchstone
        // d'une ligne d'en-tete sans donnee serait un fichier valide et vide,
        // que l'outil d'en face lirait comme « aucune reflexion » : on n'en
        // ecrit pas du tout.
        "touchstone" => if !matrices.is_empty() { touchstone(&freqs, &matrices, z_ref, &entete) } else { String::new() },
        // CE QUE LA SELECTION EST, ET CE QUE CELA AUTORISE. Voir `_topologie`.
        // `cascade_refusee` porte la phrase et rien d'autre : le panneau
        // l'affiche a la place de la courbe, et n'a pas a rejouer le
        // diagnostic pour retrouver quoi dire.
        "topologie" => topo,
        "cascade_refusee" => refus,
        // LE COUPLAGE, EN OHMS : la Z differentielle de tout ce qui longe.
        // Voir `_couplage`. Ce qu'une voisine PREND est ailleurs, dans
        // `crosstalk.py` : autre route, autre calcul, autre resultat.
        "couplage" => couplage,
        // CASCADE DIFFERENTIELLE : Sdd (differentiel pur), Scc (mode commun), Scd (conversion)
        "s_diff" => s_diff_json,
        // LES OPTIONS DE MODELE QUI ONT SERVI, telles que lues : un .s2p
        // causal et un .s2p qui ne l'est pas ne se distinguent pas a l'oeil.
        "modeles" => obj! {"dielectrique_causal" => opts.causal,
                           "f_ref_dielectrique" => opts.f_ref,
                           "modele_via" => opts.modele_via,
                           "rugosite" => rugueuses},
        "duree" => round(duree, 3),
        "avertissements" => avertissements,
    };
    if garder_abcd {
        // LA RESISTANCE CONTINUE DE LA LIGNE, en ohms : `R_dc` de
        // `ligne_mom.line_losses` (1 / sigma w t) sur chaque troncon. Au
        // premier point de la grille, l'effet de peau est deja la et Re(B)
        // vaut 1,3 a 2,6 fois ce chiffre : l'oeil en tire son niveau etabli.
        // Les vias et les coudes de la cascade n'ont pas de resistance serie.
        poser(&mut resultat, "r_continu", py::sum(
            segments.iter().filter(|seg| numd(seg, "z0", 0.0) > 0.0 && numd(seg, "largeur", 0.0) > 0.0
                                   && numd(seg, "cuivre", 0.0) > 0.0)
                .map(|seg| num(seg, "longueur") / (tl::SIGMA_CU * num(seg, "largeur") * num(seg, "cuivre")) * 1e3)));
    }
    Ok(Resultat { json: resultat, abcd: if garder_abcd { abcds } else { Vec::new() },
                  abcd_dd: s_diff_abcd.0, abcd_cc: s_diff_abcd.1, abcd_brins: s_diff_abcd.2 })
}

// ==========================================================================
// Touchstone
// La route n'ecrit rien sur le disque : le .s2p part dans la reponse, la page
// l'enregistre si elle veut. D'ou cette version en memoire.
// ==========================================================================

/// Le texte d'un fichier .s2p, format « MA » (module / phase en degres).
pub fn touchstone(freqs: &[f64], matrices: &[tl::Abcd], impedance: f64, entete: &[String]) -> String {
    let mut lignes: Vec<String> = entete.iter().map(|l| format!("! {}", l)).collect();
    lignes.push(format!("# HZ S MA R {}", fmt_g(impedance, 6)));
    // Un 2 ports s'ecrit sur une ligne, dans l'ordre S11 S21 S12 S22 --
    // l'inversion des deux termes croises est la norme, pas une coquille.
    for (f, s) in freqs.iter().zip(matrices) {
        let vals: Vec<String> = [(0, 0), (1, 0), (0, 1), (1, 1)].iter()
            .map(|&(i, j)| format!("{} {:.4}", fmt_g(s[i][j].norm(), 6), s[i][j].arg().to_degrees())).collect();
        lignes.push(format!("{} {}", fmt_g(*f, 6), vals.join(" ")));
    }
    lignes.join("\n") + "\n"
}
