//! Analyse de la carte entière pour WEB_CAO : toutes les pistes, tous les nets, sans
//! sélection. Le portage de python/analyse_carte.py, règle pour règle et sous les mêmes noms.
//!
//! Les angles des pistes (voir `angles`) :
//!   aigu         deux branches à moins de 90° : le fond du V retient le bain de gravure
//!                (acid trap) ;
//!   angle_droit  un coude à 90° (vigilance : les fabricants le tiennent) ;
//!   jonction     trois branches ou plus sur un même point, ou un bout de piste posé au
//!                milieu d'une autre (T) ;
//!   hors_45      des segments hors des huit directions, une ligne par piste.
//! Un point posé dans une pastille ou un via n'est pas jugé : la piste y entre et en repart,
//! et le cuivre de la pastille recouvre l'angle.
//!
//! Puis, sur l'empilage et à la cadence de chaque classe (voir `commun`) : l'empilage,
//! l'impédance de chaque net, le chemin de retour de chaque via, les fentes des plans de
//! référence, les vias de couture, la diaphonie, le découplage, le bord de carte, les paires
//! différentielles et les bouts de piste orphelins.
//!
//! Entrée : le format de la visionneuse, dans les unités du fichier -- pistes {c, n, w, p:
//! [x, y, x, y, ...]}, arcs {c, n, s, e, m, h (horaire)}, pastilles {x, y, r (rayon inscrit),
//! c (absent : toutes les couches)}. L'éditeur PCB envoie un segment comme une piste de deux
//! points. c (couche) et n (net) sont des clés opaques : un rang ou un nom. Les règles
//! électriques lisent en plus : stackup, vias (fiches de Current Return Path), plans {c, n,
//! o, t} (le cuivre des surfaces, trous compris), contour {o, t}, percages {x, y, d, n, de,
//! a}, composants {ref, c, broches [{x, y, n, pin}]}, natures, bruyants, paires,
//! reference_nets, reglages.
//!
//! Deux portes d'entrée :
//!   analyser_document(doc)  le document « cao-analyse-carte-1 » que les deux outils envoient
//!                           à /api/analyse-carte ; chacun y met SES pastilles déjà placées
//!                           et SES couches de cuivre ;
//!   analyser_modele(m)      le modèle brut de la visionneuse (`ipc2581::ipc2581_en_dict`),
//!                           pour la ligne de commande :
//!     cargo run --release -p analyse_carte --bin comparer_analyse -- --ipc carte.xml
//!
//! Les documents restent des `Json` (les dict de Python, ordre des clés compris). Ce qui
//! levait `ErreurAnalyse` rend `Err(ErreurAnalyse)` ; ce que Python laissait remonter tel
//! quel (une « Erreur interne » de la route) porte `interne`.

// `!(x > 0.0)` n'est pas `x <= 0.0` : il refuse aussi NaN, comme le `not (x > 0)` du Python.
#![allow(clippy::neg_cmp_op_on_partial_ord, clippy::needless_range_loop, clippy::too_many_arguments, clippy::type_complexity)]

pub mod angles;
pub mod base;
pub mod commun;
pub mod diaphonie;
pub mod regles;
pub mod retours;
pub mod surfaces;
pub mod topologie;

pub use angles::{angles, TOL_DEG, _ORDRE};
pub use base::Json;
pub use commun::{tr_effectif, CADENCES};
pub use diaphonie::_kb_larges_faces;

use base::*;
use commun::*;
use regles::Carte;

pub const FORMAT: &str = "cao-analyse-carte-1";

/// Document refusé : le message part tel quel vers la page.
///
/// `interne` : ce n'est pas un refus du module mais une exception que Python laissait
/// remonter telle quelle (donc une « Erreur interne » de la route).
#[derive(Debug, Clone, PartialEq)]
pub struct ErreurAnalyse {
    pub message: String,
    pub interne: bool,
}

impl std::fmt::Display for ErreurAnalyse {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.message)
    }
}

impl std::error::Error for ErreurAnalyse {}

// Le `except (KeyError, TypeError, ValueError, IndexError)` d'`analyser_document`.
impl From<Exc> for ErreurAnalyse {
    fn from(e: Exc) -> Self {
        match e {
            Exc::Analyse(message) => ErreurAnalyse { message, interne: false },
            Exc::MalForme(m) => ErreurAnalyse { message: format!("Document mal formé : {m}"), interne: false },
            Exc::Interne(message) => ErreurAnalyse { message, interne: true },
        }
    }
}

/// Le document d'un des deux outils -> {constats, compte, ...}.
pub fn analyser_document(doc: &Json) -> Result<Json, ErreurAnalyse> {
    analyser_document_avec(doc, None)
}

/// `analyser_document`, avec le fil de l'eau que Python écrivait sur stderr : l'étape qui
/// traîne se voit pendant le calcul, pas seulement dans le rapport final. `journal` reçoit
/// les mêmes morceaux, à écrire tels quels (« \x20   diaphonie... », puis « \x2012.3 s\n »).
pub fn analyser_document_avec(doc: &Json, mut journal: Option<&mut dyn FnMut(&str)>) -> Result<Json, ErreurAnalyse> {
    if doc.as_objet().is_none() || doc["format"].as_str() != Some(FORMAT) {
        return Err(ErreurAnalyse {
            message: format!("Format inattendu : « {} » au lieu de « {FORMAT} ».", if doc.as_objet().is_some() { str_py(&doc["format"]) } else { "?".into() }),
            interne: false,
        });
    }
    let listes = ["pistes", "arcs", "pastilles"].map(|k| &doc[k]);
    let unite = match &doc["unite_mm"] {
        v if v.vrai() => float_py(v).unwrap_or(f64::NAN),
        _ => 1.0,
    };
    if !listes.iter().all(|l| !l.vrai() || l.as_liste().is_some()) || !(0.0 < unite && unite < 1e3) {
        return Err(ErreurAnalyse { message: "Document mal formé : pistes, arcs et pastilles sont des listes, unite_mm un nombre positif.".into(), interne: false });
    }
    let mut notes: Vec<String> = Vec::new();
    let mut bilan = obj! {};
    let mut durees = obj! {};
    let mut dire = |morceau: String| {
        if let Some(j) = journal.as_mut() {
            j(&morceau);
        }
    };
    let mut antennes: Vec<&String> = doc["natures"].as_objet().into_iter().flatten().filter(|(_, c)| c.as_str() == Some(ANTENNE)).map(|(n, _)| n).collect();
    antennes.sort();
    if !antennes.is_empty() {
        notes.push(format!("Classés Antenne, jugés en fabrication seulement (angles, détourage, piste isolée) : {}.",
                           antennes.iter().map(|s| s.as_str()).collect::<Vec<_>>().join(", ")));
    }
    // `regles` : la liste des règles à faire tourner, toutes à défaut. Le panneau Crosstalk
    // n'y met que « diaphonie » : la carte entière, sous son front global, sans attendre les
    // angles, les impédances ni les retours.
    let regles: HashSet<String> = els(&doc["regles"]).iter().filter(|x| x.vrai()).map(str_py).collect();
    let voulue = |r: &str| regles.is_empty() || regles.contains(r);

    let t0 = std::time::Instant::now();
    let angulaires = ["aigu", "angle_droit", "jonction", "hors_45"];
    let mut constats: Vec<Json> = if regles.is_empty() || angulaires.iter().any(|r| regles.contains(*r)) {
        angles(els(listes[0]), els(listes[1]), els(listes[2]), unite, TOL_DEG)?.into_iter().filter(|k| voulue(txt(k, "regle"))).collect()
    } else {
        Vec::new()
    };
    let d = Doc::new(doc)?;
    let reg = _reglages(&d)?;
    // LE FRONT IMPOSÉ PAR LA CLASSE RF, DIT EN TÊTE. Un net classé RF sans porteuse -- ni
    // celle de la carte, ni la sienne -- se juge au front de sa classe, 100 ps d'office : le
    // plus raide de la table, et un classement par le nom (« RST_RF », « LNA_EN ») l'impose
    // à des nets qui n'ont rien de RF. Le rapport le dit, et nomme le geste.
    let mut rf_sans_porteuse: Vec<&String> =
        doc["natures"].as_objet().into_iter().flatten().filter(|(n, c)| c.as_str() == Some("RF") && _porteuse(&reg, "RF", Some(n)).is_none()).map(|(n, _)| n).collect();
    rf_sans_porteuse.sort();
    if !rf_sans_porteuse.is_empty() {
        let tr_rf = num(&reg["tr"], "RF");
        notes.push(format!(
            "Front IMPOSÉ par la classe RF (t_r = {}, genou {}) pour {}{} : aucune porteuse n'est saisie. Saisissez la porteuse RF du panneau \
             (t_r = 0,35 / f), ou celle du net, pour affiner — et vérifiez que ces nets sont bien de la RF.",
            _s(tr_rf), _hz(0.35 / tr_rf), rf_sans_porteuse.iter().take(6).map(|s| s.as_str()).collect::<Vec<_>>().join(", "),
            if rf_sans_porteuse.len() > 6 { "…" } else { "" }));
        poser(&mut bilan, "front_rf", obj! {"nets" => rf_sans_porteuse.iter().map(|s| s.as_str()).collect::<Vec<_>>(), "t_r" => tr_rf,
                                            "porteuse_rf" => Json::Nul});
    }
    // UNE CLASSE QUI PORTE LE NOM D'UNE INTERFACE EST JUGÉE COMME ELLE : une carte d'avant
    // les interfaces où une classe s'appelait déjà « CAN » ou « LVDS » change de verdict. Le
    // rapport dit sous quoi chacune est jugée.
    for i in &xt::INTERFACES {
        if !contient(&reg["tr"], i.classe) {
            continue;
        }
        notes.push(format!(
            "Classe « {} » jugée comme l'interface {} : famille {}, front {}, Z_diff {} Ω. Si ce nom ne désigne pas cette interface sur votre \
             carte, renommez la classe.",
            i.classe, i.nom, xt::famille(i.classe), _s(num(&reg["tr"], i.classe)),
            fmt_g(reg["zdiff_classes"].get(i.classe).and_then(Json::as_f64).unwrap_or(i.zdiff), 6)));
    }
    let couches_j = &doc["stackup"]["layers"];
    if doc["stackup"].vrai() {
        dict(&doc["stackup"])?;
    }
    let couches = els(couches_j);
    for c in couches {
        dict(c)?;
    }
    let troncons = _troncons(&d, unite)?;
    let surf = surfaces::_surfaces(&d, unite)?;
    let duree = t0.elapsed().as_secs_f64();
    poser(&mut durees, "angles et surfaces", round(duree, 2));
    dire(format!("    angles et surfaces... {duree:.1} s\n"));

    let k = Carte { doc: &d, couches, reg: &reg, unite, troncons: &troncons, surf: surf.as_ref() };
    let mut etapes = vec!["orphelin", "quartz", "esd", "courant", "decouplage"];
    if couches.is_empty() {
        notes.push("Pas d'empilage dans le document : empilage, impédances, chemins de retour, fentes, coutures, diaphonie, bord de carte, \
                    paires différentielles, moignons de vias et branches en T non vérifiés.".into());
    } else {
        if voulue("empilage") {
            constats.extend(regles::empilage(&d, couches)?);
        }
        etapes.extend(["retour", "diaphonie", "impedance", "bord", "paire", "moignon_via", "branche"]);
        if surf.is_some() {
            etapes.extend(["fente", "couture"]);
        } else {
            notes.push("Pas de plans ni de versements dans le document : fentes et vias de couture non vérifiés.".into());
        }
    }
    for regle in etapes {
        if !voulue(regle) {
            continue;
        }
        dire(format!("    {regle}..."));
        let t0 = std::time::Instant::now();
        let (c, b) = match regle {
            "orphelin" => topologie::orphelins(&k),
            "quartz" => topologie::quartz(&k),
            "esd" => topologie::esd(&k),
            "courant" => topologie::courants(&k),
            "decouplage" => regles::decouplages(&k, &mut notes, !couches.is_empty()),
            "retour" => retours::retours(&d, couches, &reg, unite),
            "diaphonie" => diaphonie::diaphonie(&d, couches, &reg, unite, &mut notes, &troncons, surf.as_ref()),
            "impedance" => regles::impedances(&k, &mut notes),
            "bord" => regles::bords(&k, &mut notes),
            "paire" => regles::paires_diff(&k),
            "moignon_via" => topologie::moignons_vias(&k),
            "branche" => topologie::branches_t(&k),
            "fente" => regles::fentes(&k, surf.as_ref().unwrap(), &mut notes),
            _ => regles::coutures(&k, surf.as_ref().unwrap()),
        }?;
        let duree = t0.elapsed().as_secs_f64();
        poser(&mut durees, regle, round(duree, 2));
        dire(format!(" {duree:.1} s\n"));
        constats.extend(c);
        if b.vrai() {
            poser(&mut bilan, regle, b);
        }
    }
    constats.sort_by_key(angles::rang_severite);
    let compte = |s: &str| constats.iter().filter(|k| txt(k, "severite") == s).count();
    let compte = obj! {"critique" => compte("critique"), "vigilance" => compte("vigilance"), "info" => compte("info")};
    Ok(obj! {"format" => FORMAT, "constats" => constats, "compte" => compte,
             "pistes" => els(listes[0]).len(), "tolerance_deg" => TOL_DEG, "reglages" => reg, "bilan" => bilan, "notes" => notes,
             "durees_s" => durees})
}

// Genre d'une couche : même lecture que mdlGenre (visionneuse, 02-modele.js). Le type
// déclaré tranche ; sans lui, le nom. Hors empilage : pas du cuivre.
const TYPE_CUIVRE: [&str; 6] = ["CONDUCTOR", "SIGNAL", "PLANE", "POWER", "GROUND", "MIXED"];
const NOM_PAS_CUIVRE: [&str; 27] = [
    "SILK", "LEGEND", "SERIGRAPH", "NOMENCLATURE", "MASK", "RESIST", "VERNIS", "PASTE", "CREAM", "STENCIL", "ETAIN", "DRILL", "HOLE", "PERCAGE",
    "DIELECTRIC", "PREPREG", "DIELECTRIQUE", "OUTLINE", "PROFILE", "CONTOUR", "BOARD", "EDGE", "MECA", "DIMENSION", "ASSEMB", "DOC", "FAB"];

/// Les rangs des couches de cuivre du modèle.
fn _couches_cuivre(m: &Json) -> HashSet<usize> {
    let mut cuivre: HashSet<String> = HashSet::new();
    for e in els(&m["empilage"]) {
        let t = str_ou_vide(&e["type"]).to_uppercase();
        let nom = str_ou_vide(&e["nom"]);
        let du_cuivre = if !t.is_empty() && t != "UNKNOWN" {
            TYPE_CUIVRE.iter().any(|x| t.contains(x))
        } else {
            let n = nom.to_uppercase();
            !NOM_PAS_CUIVRE.iter().any(|x| n.contains(x))
        };
        if du_cuivre {
            cuivre.insert(nom);
        }
    }
    els(&m["couches"]).iter().enumerate().filter(|(_, nom)| nom.as_str().is_some_and(|n| cuivre.contains(n))).map(|(i, _)| i).collect()
}

/// Le plus grand cercle centré dans la pastille : un point dedans est dans son cuivre,
/// quelle que soit la rotation.
fn _rayon_inscrit(forme: &Json, d: &Json) -> f64 {
    if forme["d"].vrai() {
        return nb(&forme["d"]) / 2.0;
    }
    if forme["w"].vrai() && forme["h"].vrai() {
        return minf(&[nb(&forme["w"]), nb(&forme["h"])]) / 2.0;
    }
    nb(d) / 2.0 // polygone, forme utilisateur : la taille du padstack
}

/// Constats d'angles d'un modèle de visionneuse (`ipc2581::ipc2581_en_dict`).
pub fn analyser_modele(m: &Json) -> Result<Vec<Json>, ErreurAnalyse> {
    let cuivre = _couches_cuivre(m);
    let rang: HashMap<&str, usize> = els(&m["couches"]).iter().enumerate().filter_map(|(i, nom)| nom.as_str().map(|n| (n, i))).collect();
    let de_cuivre = |c: &Json| c.as_i64().is_some_and(|i| i >= 0 && cuivre.contains(&(i as usize)));
    let mut pastilles: Vec<Json> = els(&m["percages"]).iter().map(|t| obj! {"x" => &t["x"], "y" => &t["y"], "r" => nb(&t["d"]) / 2.0}).collect();
    for p in els(&m["pads"]) {
        let ps = p["ps"].as_str().map_or(&Json::Nul, |ps| &m["padstacks"][ps]);
        for couche in els(&ps["pads"]) {
            if let Some(&i) = couche["c"].as_str().and_then(|c| rang.get(c)).filter(|i| cuivre.contains(i)) {
                let forme = couche["f"].as_str().map_or(&Json::Nul, |f| &m["formes"][f]);
                pastilles.push(obj! {"x" => &p["x"], "y" => &p["y"], "c" => i, "r" => _rayon_inscrit(forme, &couche["d"])});
            }
        }
    }
    let unite = if str_ou_vide(&m["unites"]).to_uppercase().starts_with("INCH") { 25.4 } else { 1.0 };
    let garder = |l: &Json| -> Vec<Json> { els(l).iter().filter(|p| de_cuivre(&p["c"])).cloned().collect() };
    Ok(angles(&garder(&m["pistes"]), &garder(&m["arcs"]), &pastilles, unite, TOL_DEG)?)
}
