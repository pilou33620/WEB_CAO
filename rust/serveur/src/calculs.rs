//! Les routes de calcul : la page envoie un document, le serveur rend le résultat. Rien
//! n'est écrit sur le disque, rien n'est gardé en mémoire au-delà de la réponse.

use std::io::Read;

use web_tools_commun::serveur::{Reponse, Requete};

use crate::json::{self, float_py, fmt_g, str_py, Json};
use crate::obj;
use crate::poste::{interne, param, proteger, refus, rendre_json, route, Poste, Refus, Rendu};

// Un IPC-2581 est un XML bavard : une carte de taille moyenne pese quelques
// dizaines de mega-octets, et l'archive ZIP d'un fabricant guere moins une fois
// ouverte. Le plafond protege la memoire du serveur, rien d'autre.
pub const MAX_IPC: usize = 192 * 1024 * 1024;
// Un document de simulation ne porte qu'un net et son empilage : il est petit.
pub const MAX_SIM: usize = em::simulation_em::MAX_CORPS;
// Celui du crosstalk porte un parcours et son voisinage : meme ordre de
// grandeur, et le plafond reste le sien pour pouvoir bouger seul.
pub const MAX_CROSSTALK: usize = em::crosstalk::MAX_CORPS;
// Celui de l'oeil est celui de la simulation, plus le TEXTE d'un ou deux
// fichiers IBIS : son plafond est le sien.
pub const MAX_OEIL: usize = if MAX_SIM > oeil::MAX_CORPS { MAX_SIM } else { oeil::MAX_CORPS };
// Celui du RF porte le TEXTE des modeles .sNp, qui pesent vite des megaoctets.
pub const MAX_RF: usize = rf_reseau::MAX_CORPS;
// ET CELUI DU DC, QUI N'EN AVAIT AUCUN. Les trois autres routes refusaient un
// corps trop gros ; celle-la lisait ce qui venait, et son document porte les
// POLYGONES de cuivre d'une ou plusieurs couches entieres -- de loin le plus
// gros des quatre. Un plafond plus haut que les autres, donc, mais un plafond.
pub const MAX_DC: usize = 16 * 1024 * 1024;
pub const MAX_SCORING: usize = 16 * 1024 * 1024;
pub const MAX_PATTERNS: usize = 16 * 1024 * 1024;
// Toutes les pistes et toutes les pastilles placees d'une carte : 12 000
// pastilles sur quatre couches font quelques mega-octets de JSON.
pub const MAX_ANALYSE: usize = 32 * 1024 * 1024;
const MAX_DEPLIE: usize = 64 * 1024 * 1024; // un corps gzip, une fois deplie (lire_document)

/// Refuse une epaisseur d'empilage hors bornes physiques (mm).
///
/// Une epaisseur de cuivre de 1e9 mm, acceptee par la page, faisait mailler
/// la diaphonie sans fin : 11 Go, puis le serveur tue par le systeme.
fn borner_empilage(doc: &Json) -> Result<(), Refus> {
    for c in doc["stackup"]["layers"].as_liste().into_iter().flatten().filter(|c| c.as_objet().is_some()) {
        let epaisseur = &c["thickness"];
        if matches!(epaisseur, Json::Nul) || epaisseur.as_str() == Some("") {
            continue;
        }
        let nom = str_py(&c["name"]);
        let t = float_py(epaisseur).map_err(|_| refus(422, format!("Epaisseur illisible pour la couche {}", nom)))?;
        let plafond = if c["type"].as_str() == Some("copper") { 1.0 } else { 20.0 };
        if !(0.0 <= t && t <= plafond) {
            return Err(refus(422, format!("Epaisseur de la couche {} hors bornes : {} mm (0 a {} mm)", nom, fmt_g(t, 6), fmt_g(plafond, 6))));
        }
    }
    Ok(())
}

/// La grille de chaque cavite part UNE fois, dans `cavites_grilles` ; les
/// vias n'en portent que la cle (`simCorpsJson`). On la remet en place.
// shortcut: la grille est recopiée dans chaque via (Json n'a pas de partage, Python posait le
// même objet) ; si la mémoire en souffre sur une grosse carte, faire lire la table par `em`.
pub fn deplier_grilles(mut doc: Json) -> Json {
    let Json::Objet(o) = &mut doc else { return doc };
    let Some(table) = o.shift_remove("cavites_grilles").filter(Json::vrai) else { return doc };
    fn poser(v: &mut Json, table: &Json) {
        match v {
            Json::Objet(o) => {
                for (k, v) in o.iter_mut() {
                    if k != "cavite_grille" {
                        poser(v, table);
                    } else if let Some(cle) = v.as_str() {
                        // pas de descente dans la grille : une grille qui se cite elle-meme
                        // bouclait sans fin
                        *v = table[cle].clone();
                    }
                }
            }
            Json::Liste(l) => l.iter_mut().for_each(|v| poser(v, table)),
            _ => {}
        }
    }
    poser(&mut doc, &table);
    doc
}

/// Un calcul sur son propre fil : une pile large (les solveurs descendent profond), et une
/// panique -- l'exception inattendue de Python -- qui ne coûte que cette requête.
fn sur_un_fil<T: Send>(calcul: impl FnOnce() -> Result<T, Refus> + Send) -> Result<T, Refus> {
    std::thread::scope(|s| {
        let fil = std::thread::Builder::new().stack_size(64 << 20).spawn_scoped(s, calcul).map_err(interne)?;
        fil.join().unwrap_or_else(|_| Err(refus(500, crate::poste::DETAIL_INTERNE)))
    })
}

/// Le journal d'un calcul part dans le terminal : c'est le seul endroit ou l'on puisse voir
/// la difference entre « ca travaille » et « c'est bloque », et LAQUELLE des etapes coince.
fn terminal(texte: &str) {
    eprint!("{}", texte);
}

/// Le refus d'un solveur : le motif et ce qu'il faut changer partent ensemble, separes
/// d'une ligne (les pages affichent « detail » tel quel) ; ce que Python laissait remonter
/// tel quel est une erreur interne.
fn refus_solveur(message: String, conseil: String, est_interne: bool) -> Refus {
    if est_interne {
        return interne(message);
    }
    refus(422, if conseil.is_empty() { message } else { format!("{}\n{}", message, conseil) })
}

/// Ce que le serveur sait faire : la page le demande avant d'ouvrir.
pub fn ipc2581_etat() -> Json {
    let extensions: Vec<Json> = ipc2581::EXTENSIONS.iter().chain([".zip"].iter()).map(|e| Json::from(*e)).collect();
    obj! {"dispo" => true, "format" => ipc2581::FORMAT, "extensions" => Json::Liste(extensions), "max" => MAX_IPC}
}

/// GET /api/analyse-carte : verifie la disponibilite de l'analyse.
pub fn analyse_etat() -> Json {
    obj! {"dispo" => true, "format" => analyse_carte::FORMAT}
}

type Calcul = fn(&Poste, &mut Requete) -> Rendu;

/// La route de calcul de ce nom (POST), s'il y en a une.
pub fn calcul(route: &str) -> Option<Calcul> {
    Some(match route {
        "/api/ipc2581" => Poste::ipc2581_importer,
        "/api/simulation" => Poste::simulation_lancer,
        "/api/simulation-dc" => Poste::dc_lancer,
        "/api/crosstalk" => Poste::crosstalk_lancer,
        "/api/simulation-rf" => Poste::rf_lancer,
        "/api/oeil" => Poste::oeil_lancer,
        "/api/pcb/score-placement" => Poste::scoring_lancer,
        "/api/schema/patterns" => Poste::patterns_lancer,
        "/api/analyse-carte" => Poste::analyse_lancer,
        "/api/thermique-composants" => Poste::thermique_lancer,
        _ => return None,
    })
}

/// Vrai si le navigateur a ferme la connexion : elle est lisible mais vide (ou rompue).
/// Un navigateur n'envoie rien d'autre en attendant la reponse.
// shortcut: le serveur commun ne donne pas son socket ; on le retrouve parmi les descripteurs
// du processus par ses deux adresses. À remplacer par une méthode de Requete quand
// web_tools_commun en aura une. Sous Windows : jamais « partie » (pas de ligne 499).
#[cfg(unix)]
fn client_parti(r: &Requete) -> bool {
    use std::os::fd::FromRawFd;
    let max = unsafe { libc::sysconf(libc::_SC_OPEN_MAX) }.clamp(64, 65536) as i32;
    for fd in 3..max {
        // jamais fermé par nous : ManuallyDrop
        let s = std::mem::ManuallyDrop::new(unsafe { std::net::TcpStream::from_raw_fd(fd) });
        if s.peer_addr().ok() != Some(r.client) || s.local_addr().ok() != Some(r.local) {
            continue;
        }
        let mut octet = [0u8; 1];
        let n = unsafe { libc::recv(fd, octet.as_mut_ptr().cast(), 1, libc::MSG_PEEK | libc::MSG_DONTWAIT) };
        return n == 0 || (n < 0 && !matches!(std::io::Error::last_os_error().kind(), std::io::ErrorKind::WouldBlock | std::io::ErrorKind::Interrupted));
    }
    false
}

#[cfg(not(unix))]
fn client_parti(_: &Requete) -> bool {
    false
}

impl Poste {
    /// Execute action() et traduit les refus en JSON {"detail": ...}.
    ///
    /// Tout echec s'ecrit aussi dans le terminal, avec son code : la page
    /// l'affiche, mais celui qui surveille le serveur ne la voit pas. Une page
    /// fermee en plein calcul sort en 499 (le code de nginx pour « client
    /// parti ») : on ne le sait qu'en voulant repondre, donc a la fin.
    pub(crate) fn ipc_api(&self, r: &mut Requete, action: impl FnOnce(&mut Requete) -> Rendu) -> Reponse {
        let debut = std::time::Instant::now();
        let route = route(r);
        let (code, charge) = match proteger(|| action(r)) {
            Ok(charge) => (200, charge),
            Err(exc) => {
                eprintln!("  ERREUR {} {} : {}", exc.code, route, exc.message);
                (exc.code, obj! {"detail" => exc.message})
            }
        };
        if client_parti(r) {
            eprintln!("  ERREUR 499 {} : la page s'est fermee avant la reponse ({:.1} s de calcul perdues)", route, debut.elapsed().as_secs_f64());
        }
        rendre_json(code, charge)
    }

    /// Le corps de la requete, en JSON. Refuse vide, trop gros, illisible.
    pub fn lire_document(r: &mut Requete, plafond: usize) -> Rendu {
        let taille = Self::taille_corps(r)?;
        if taille == 0 {
            return Err(refus(400, "Document vide"));
        }
        let mut corps = Self::octets(r, taille, plafond, || format!("Document trop grand : {:.1} Mo, maximum {} Mo", taille as f64 / 1048576.0, plafond / 1048576))?;
        // LE CORPS ARRIVE COMPRESSE quand la page l'annonce (`simCorpsJson`).
        // Le plafond garde son sens : on ne decompresse pas au-dela de huit
        // fois ce qu'il autorise, ni au-dela de MAX_DEPLIE -- 256 Mo de JSON
        // deplies coutaient 1,6 Go d'objets Python, de quoi faire tuer le Pi.
        if r.entete("Content-Encoding").is_some_and(|e| json::strip(e).eq_ignore_ascii_case("gzip")) {
            let max = (8 * plafond).min(MAX_DEPLIE);
            let mut brut = Vec::new();
            flate2::read::GzDecoder::new(&corps[..]).take(max as u64 + 1).read_to_end(&mut brut).map_err(|exc| {
                // le texte de zlib, que Python rendait pour un corps qui n'est pas du gzip
                let exc = exc.to_string();
                refus(400, format!("Document gzip illisible : {}", if exc == "invalid gzip header" { "Error -3 while decompressing data: incorrect header check" } else { &exc }))
            })?;
            if brut.len() > max {
                return Err(refus(413, format!("Document décompressé trop grand : plus de {} Mo", max / 1048576)));
            }
            corps = brut;
        }
        let texte = json::decoder_utf8(corps).map_err(|exc| refus(400, format!("Document JSON illisible : {}", exc)))?;
        let doc = deplier_grilles(json::loads(&texte).map_err(|exc| refus(400, format!("Document JSON illisible : {}", exc)))?);
        borner_empilage(&doc)?;
        Ok(doc)
    }

    /// Corps de la requete (XML ou ZIP) -> modele JSON de la carte.
    fn ipc2581_importer(&self, r: &mut Requete) -> Rendu {
        let taille = Self::taille_corps(r)?;
        if taille == 0 {
            return Err(refus(400, "Fichier vide"));
        }
        let data = Self::octets(r, taille, MAX_IPC, || format!("Fichier trop grand : {:.1} Mo, maximum {} Mo", taille as f64 / 1048576.0, MAX_IPC / 1048576))?;
        let nom = param(r, "nom");
        let nom: String = crate::chemins::basename(&nom).chars().take(200).collect();
        let modele = sur_un_fil(|| {
            ipc2581::ipc2581_en_dict_avec(&data, &nom, true, Some(&motifs::motifs_ipc2581)).map_err(|exc| match exc {
                ipc2581::Erreur::Parse(e) => refus(422, e.to_string()),
                ipc2581::Erreur::Interne(m) => interne(m),
            })
        })?;
        let compte = |cle: &str| modele["stats"][cle].as_i64().unwrap_or(0);
        eprintln!(
            "  IPC-2581 « {} » : {} composant(s), {} piste(s), {} percage(s)",
            if nom.is_empty() { "(sans nom)" } else { &nom },
            compte("composants"),
            compte("pistes"),
            compte("percages")
        );
        Ok(modele)
    }

    /// Corps de la requete (document JSON) -> parametres S de la ligne.
    fn simulation_lancer(&self, r: &mut Requete) -> Rendu {
        let mut doc = Self::lire_document(r, MAX_SIM)?;
        sur_un_fil(|| match em::simulation_em::simuler(&mut doc, Some(&mut terminal), false, None) {
            Ok(resultat) => Ok(resultat.json),
            Err(exc) => Err(refus_solveur(exc.message, exc.conseil, exc.interne)),
        })
    }

    /// POST /api/thermique-composants : echauffement estime des composants qui dissipent
    /// (dc_solver::echauffement_composants, le modele d'etalement de la chute DC).
    fn thermique_lancer(&self, r: &mut Requete) -> Rendu {
        let doc = Self::lire_document(r, 1024 * 1024)?;
        sur_un_fil(|| dc_solver::echauffement_composants(&doc).map_err(|exc| refus_solveur(exc.message, exc.conseil, false)))
    }

    /// POST /api/simulation-dc : calcul DC (IR drop).
    fn dc_lancer(&self, r: &mut Requete) -> Rendu {
        let doc = Self::lire_document(r, MAX_DC)?;
        sur_un_fil(|| {
            // Le document est en MILLIMETRES : c'est resoudre_document qui
            // convertit, une fois, et lui seul.
            let mut resultat = dc_solver::resoudre_document(&doc, Some(&mut terminal)).map_err(|exc| refus_solveur(exc.message, exc.conseil, false))?;
            // La carte de chaleur, une par couche analysee : peindre deux couches
            // l'une sur l'autre melangerait deux potentiels sans le dire.
            let mut cartes = json::Objet::new();
            for c in resultat["couches"].as_liste().into_iter().flatten() {
                let carte = dc_solver::carte_chaleur(&resultat, 120, c.as_i64()).map_err(|exc| interne(exc.message))?;
                cartes.insert(str_py(c), carte);
            }
            if let Json::Objet(o) = &mut resultat {
                o.insert("cartes".into(), Json::Objet(cartes));
            }
            Ok(resultat)
        })
    }

    /// POST /api/crosstalk : carte de couplage le long du parcours.
    ///
    /// LE PLAFOND DE TAILLE EST LE SIEN, et c'est toute la raison d'etre
    /// d'une route separee : le document porte le parcours entier de
    /// l'agresseur et tout le cuivre qui passe a portee.
    ///
    /// LA SOURCE EST LE DESIGN ET RIEN D'AUTRE. Aucun fichier de parametres S
    /// n'est accepte ici : la matrice se genere dans `crosstalk::analyser`, a
    /// partir de la geometrie. Un document qui en porterait encore un est
    /// REFUSE par le module, jamais ignore -- l'ignorer ferait lire une carte
    /// obtenue sur autre chose que ce que la page croit avoir envoye.
    fn crosstalk_lancer(&self, r: &mut Requete) -> Rendu {
        let doc = Self::lire_document(r, MAX_CROSSTALK)?;
        sur_un_fil(|| em::crosstalk::analyser(&doc, Some(&mut terminal)).map_err(|exc| refus_solveur(exc.message, exc.conseil, exc.interne)))
    }

    /// POST /api/simulation-rf : S21 entre deux ports.
    ///
    /// LES MODELES ARRIVENT DANS LE DOCUMENT, en texte. Le serveur ne lit
    /// aucun chemin fourni par la page : un .sNp importe dans un projet et un
    /// .sub de la bibliotheque passent par le meme champ.
    fn rf_lancer(&self, r: &mut Requete) -> Rendu {
        let doc = Self::lire_document(r, MAX_RF)?;
        sur_un_fil(|| rf_reseau::analyser(&doc, Some(&mut terminal)).map_err(|exc| refus_solveur(exc.message, exc.conseil, exc.interne)))
    }

    /// POST /api/oeil : l'oeil d'une liaison et son gabarit.
    fn oeil_lancer(&self, r: &mut Requete) -> Rendu {
        let doc = Self::lire_document(r, MAX_OEIL)?;
        // UNE BIBLIOTHEQUE AMI ne s'execute que depuis la LIB ou une racine
        // de projets declaree (`ibis::chemin_bibliotheque_ami`) :
        // c'est ici que le serveur dit lesquelles.
        let mut racines = vec![self.dossier_lib()];
        racines.extend(self.racines());
        let racines: Vec<&str> = racines.iter().map(String::as_str).collect();
        sur_un_fil(|| oeil::analyser(&doc, Some(&mut terminal), Some(&racines)).map_err(|exc| refus_solveur(exc.message, exc.conseil, exc.interne)))
    }

    /// POST /api/pcb/score-placement : calcule les metriques de placement.
    fn scoring_lancer(&self, r: &mut Requete) -> Rendu {
        let doc = Self::lire_document(r, MAX_SCORING)?;
        if doc.as_objet().is_none() {
            return Err(refus(400, "Document JSON (objet) attendu"));
        }
        // un champ d'un autre type que prevu (liste au lieu d'objet...) : un refus, pas un 500
        sur_un_fil(|| motifs::evaluer_placement_pcb(&doc).map_err(|exc| refus(422, format!("Document de placement illisible : {}", exc))))
    }

    /// POST /api/schema/patterns : analyse les motifs et blocs fonctionnels.
    fn patterns_lancer(&self, r: &mut Requete) -> Rendu {
        let doc = Self::lire_document(r, MAX_PATTERNS)?;
        if doc.as_objet().is_none() {
            return Err(refus(400, "Document JSON (objet) attendu"));
        }
        sur_un_fil(|| motifs::analyser_motifs_schema(&doc).map_err(|exc| refus(422, format!("Document de schema illisible : {}", exc))))
    }

    /// POST /api/analyse-carte : les constats de la carte entiere.
    fn analyse_lancer(&self, r: &mut Requete) -> Rendu {
        let doc = Self::lire_document(r, MAX_ANALYSE)?;
        // la ligne de la requete ne sort qu'a la reponse : dire qu'on calcule
        eprintln!("  Verification de la carte : {} piste(s), analyse en cours...", doc["pistes"].as_liste().map_or(0, Vec::len));
        let debut = std::time::Instant::now();
        // le fil de l'eau de l'analyse (l'etape qui traine) part dans le terminal, comme en Python
        let res = sur_un_fil(|| analyse_carte::analyser_document_avec(&doc, Some(&mut terminal)).map_err(|exc| refus_solveur(exc.message, String::new(), exc.interne)))?;
        eprintln!("  Verification de la carte : {} constat(s) en {:.1} s", res["constats"].as_liste().map_or(0, Vec::len), debut.elapsed().as_secs_f64());
        Ok(res)
    }
}

#[cfg(test)]
mod essais {
    use super::*;
    use crate::json::{dumps, loads};

    /// Cas 4b et 37 de banc-serveur-routes.py.
    #[test]
    fn grilles_et_empilage() {
        let doc = loads(r#"{"cavites_grilles": {"g0": {"pas": 0.5, "lignes": []}}, "vias": [{"x": 0, "y": 0, "cavite_grille": "g0"}]}"#).unwrap();
        assert_eq!(dumps(&deplier_grilles(doc)), r#"{"vias": [{"x": 0, "y": 0, "cavite_grille": {"pas": 0.5, "lignes": []}}]}"#);
        // une grille de cavite qui se cite elle-meme ne bloque plus le serveur
        let doc = loads(r#"{"cavites_grilles": {"a": {"cavite_grille": "a"}}, "v": {"cavite_grille": "a"}}"#).unwrap();
        assert_eq!(dumps(&deplier_grilles(doc)["v"]["cavite_grille"]), r#"{"cavite_grille": "a"}"#);
        let empilage = |couche: &str| borner_empilage(&loads(&format!(r#"{{"stackup": {{"layers": [{}]}}}}"#, couche)).unwrap());
        assert!(empilage(r#"{"type": "copper", "name": "TOP", "thickness": 0.035}, {"thickness": ""}, {"thickness": null}, 5"#).is_ok());
        let exc = empilage(r#"{"type": "copper", "name": "TOP", "thickness": 1e9}"#).unwrap_err();
        assert_eq!((exc.code, exc.message.as_str()), (422, "Epaisseur de la couche TOP hors bornes : 1e+09 mm (0 a 1 mm)"));
        assert_eq!(empilage(r#"{"thickness": "x"}"#).unwrap_err().message, "Epaisseur illisible pour la couche None");
        assert!(empilage(r#"{"type": "dielectric", "thickness": 20}"#).is_ok() && empilage(r#"{"thickness": NaN}"#).is_err());
    }
}
