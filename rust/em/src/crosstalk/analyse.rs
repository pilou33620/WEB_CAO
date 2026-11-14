//! L'orchestration : `analyser`, la lecture par paire et les hypotheses.

use super::*;
use crate::simulation_em::base::*;
use std::collections::HashMap;

// ==========================================================================
// L'ORCHESTRATION
// ==========================================================================

/// Les reglages du document, completes par les defauts, et VERIFIES.
///
/// Un reglage hors domaine n'est pas ramene en silence : il leve. Un seuil
/// positif en decibels ou des seuils DRC inverses sont des saisies, pas des
/// approximations, et les corriger sans le dire ferait afficher un resultat
/// obtenu sous d'autres regles que celles qu'on croit avoir demandees.
pub fn _reglages(doc: &Json) -> Result<Json, ErreurCrosstalk> {
    let mut r = defauts();
    let vide = obj! {};
    let donnes = if doc["reglages"].vrai() { &doc["reglages"] } else { &vide };
    if donnes.as_objet().is_none() {
        return Err(ErreurCrosstalk::new("Le champ « reglages » n'est pas un objet.", ""));
    }
    maj(&mut r, donnes.clone());
    if _nb(&r["seuil_db"], 0.0) > 0.0 {
        return Err(ErreurCrosstalk::new(
            format!("Le seuil de confirmation vaut {} dB, donc un gain.",
                    fmt_g(nb(&r["seuil_db"]), 6)),
            "Un couplage est une atténuation : le seuil est négatif \
             (-40 dB par défaut)."));
    }
    // LE FRONT : saisi s'il est positif, deduit de la classe sinon (voir
    // `front_de_classe`). Un front negatif n'est pas un front.
    let t_r = _nb(&r["t_r"], 0.0);
    poser(&mut r, "t_r", t_r);
    if t_r < 0.0 {
        return Err(ErreurCrosstalk::new(
            format!("Le temps de montée vaut {} s.", fmt_g(t_r, 6)),
            "Laissez le champ vide pour le déduire de la classe du net."));
    }
    let mut classes = obj! {};
    if let Some(o) = r["tr_classes"].as_objet() {
        for (k, v) in o {
            if _nb(v, 0.0) > 0.0 {
                poser(&mut classes, k, _nb(v, 0.0));
            }
        }
    }
    poser(&mut r, "tr_classes", classes);
    // LA PORTEUSE RF, celle du panneau de verification : un agresseur de
    // classe RF se juge alors a 0,35 / f plutot qu'au front de sa classe.
    // Negative ou absente, il n'y en a pas.
    let porteuse = maxf(&[0.0, _nb(&r["porteuse_rf"], 0.0)]);
    poser(&mut r, "porteuse_rf", porteuse);
    // LES SEUILS DRC, EN FRACTIONS : orange <= rouge, tous deux dans ]0 ; 1[.
    let orange = _nb(&r["seuil_orange"], SEUIL_ORANGE);
    let rouge = _nb(&r["seuil_rouge"], SEUIL_ROUGE);
    if !(0.0 < orange && orange <= rouge && rouge < 1.0) {
        return Err(ErreurCrosstalk::new(
            format!("Seuils DRC incohérents : orange {} %, rouge {} %.",
                    fmt_g(100.0 * orange, 6), fmt_g(100.0 * rouge, 6)),
            "Il faut 0 < orange ≤ rouge < 100 % (3 % et 7 % par défaut)."));
    }
    poser(&mut r, "seuil_orange", orange);
    poser(&mut r, "seuil_rouge", rouge);
    let pertes = r["pertes"].vrai();
    poser(&mut r, "pertes", pertes);
    let somme = py::strip(&if r["somme"].vrai() { str_py(&r["somme"]) } else { "pire".to_string() }).to_lowercase();
    poser(&mut r, "somme", &somme);
    if !SOMMES.contains(&somme.as_str()) {
        return Err(ErreurCrosstalk::new(
            format!("Somme des agresseurs « {somme} » inconnue."),
            "« pire » (arithmétique, en phase) ou « rss » (quadratique)."));
    }
    // LE SEUIL DE RISQUE EST UNE FRACTION D'UN MAXIMUM : hors de ]0 ; 1[, il ne
    // decoupe rien. A zero, toute la piste serait « a risque » -- donc aucune
    // portion ne le serait, puisque tout se vaut ; a un, seul le point du
    // maximum exact, qui ne se peint pas.
    let risque = _nb(&r["risque"], 0.5);
    if !(0.0 < risque && risque < 1.0) {
        return Err(ErreurCrosstalk::new(
            format!("Le seuil de risque vaut {} : il doit être entre 0 et 1 (exclus).",
                    fmt_g(risque, 6)),
            "C'est la fraction du pire point d'une victime au-delà de laquelle \
             la plage se peint sur le cuivre. À 0, toute la piste serait \
             peinte — donc plus rien ne ressortirait ; à 1, rien ne le serait \
             (0,5 par défaut, soit −6 dB sous le pire point)."));
    }
    poser(&mut r, "risque", risque);
    Ok(r)
}

/// Verifie le document et rend (couches, objets, analyse, agresseurs).
pub fn _doc_valide(doc: &Json) -> Result<(Vec<Json>, Vec<Json>, Vec<String>), ErreurCrosstalk> {
    if doc.as_objet().is_none() {
        return Err(ErreurCrosstalk::new("Le document envoyé n'est pas un objet JSON.", ""));
    }
    if doc["format"].as_str() != Some(FORMAT) {
        return Err(ErreurCrosstalk::new(
            format!("Format inattendu : « {} » au lieu de « {} ».",
                    if doc["format"].vrai() { str_py(&doc["format"]) } else { "absent".to_string() }, FORMAT), ""));
    }
    // UN DOCUMENT QUI PORTE ENCORE UNE MATRICE EXTERIEURE EST REFUSE, ET NON
    // IGNORE : la page croirait avoir fait calculer son fichier.
    let externes: Vec<&str> = ["touchstone", "touchstone_ports",
                               "mapping_confirme"].into_iter().filter(|nom| doc[*nom].vrai()).collect();
    if !externes.is_empty() {
        return Err(ErreurCrosstalk::new(
            format!("Le document porte {} : cette analyse n'accepte pas de matrice \
                     S venue de l'extérieur.",
                    guillemets(&externes, ", ")),
            "Le couplage se calcule ici, à partir du design. Retirez ces \
             champs."));
    }
    if doc["stackup"].vrai() && doc["stackup"].as_objet().is_none() {
        return Err(ErreurCrosstalk::new("« stackup » doit être un objet.", ""));
    }
    let couches = els(&doc["stackup"]["layers"]).to_vec();
    if couches.is_empty() {
        return Err(ErreurCrosstalk::new(
            "Empilage vide.",
            "Complétez l'empilage dans la page avant de lancer le calcul."));
    }
    let objets = els(&doc["geometry"]["objects"]).to_vec();
    if objets.is_empty() {
        return Err(ErreurCrosstalk::new(
            "Aucun cuivre à analyser.",
            "Sélectionnez la piste AGRESSEUR sur la carte."));
    }
    if objets.len() > se::MAX_OBJETS {
        return Err(ErreurCrosstalk::new(
            format!("Trop de tronçons : {}, maximum {}.",
                    objets.len(), se::MAX_OBJETS), "Restreignez la sélection."));
    }
    let mut agresseurs: Vec<String> = els(&doc["agresseurs"]).iter().map(str_py).filter(|x| !x.is_empty()).collect();
    if agresseurs.is_empty() {
        agresseurs = objets.iter().map(|o| str_ou_vide(&o["net"])).filter(|n| !n.is_empty()).collect::<Noms>().into_iter().collect();
    }
    if agresseurs.is_empty() {
        return Err(ErreurCrosstalk::new(
            "La sélection ne porte aucun net.",
            "Le crosstalk se lit d'un net vers un autre : la piste \
             sélectionnée doit porter un nom de net."));
    }
    if agresseurs.len() > MAX_AGRESSEURS {
        return Err(ErreurCrosstalk::new(
            format!("{} nets sélectionnés comme agresseurs, maximum {}.",
                    agresseurs.len(), MAX_AGRESSEURS),
            "Restreignez la sélection à l'agresseur qui vous intéresse."));
    }
    Ok((couches, objets, agresseurs))
}

/// Les fentes du plan de reference qui tombent SUR un longement retenu.
///
/// UNE FENTE AILLEURS N'INVALIDE PAS LE COUPLAGE, et c'est pour cela qu'on ne
/// prend pas la liste entiere : le modele quasi-TEM ne suppose un plan continu
/// que la ou il resout une section, c'est-a-dire sur les intervalles ou une
/// voisine longe. Une fente sur une portion ou rien ne longe est un probleme
/// de retour de courant -- l'onglet Impedance et le controle de masse le
/// disent deja --, pas un mensonge de la carte de couplage.
pub fn _fentes_sur_longement(masse: &Json, retenus: &[Json]) -> Vec<Json> {
    let fentes: Vec<&Json> = els(&masse["zones"]).iter().filter(|z| z["type"].as_str() == Some("fente")).collect();
    if fentes.is_empty() {
        return Vec::new();
    }
    let mut sorties = Vec::new();
    for c in retenus {
        for it in els(&c["intervalles"]) {
            for z in &fentes {
                let s0 = maxf(&[num(it, "s0"), num(z, "s0")]);
                let s1 = minf(&[num(it, "s1"), num(z, "s1")]);
                if s1 - s0 > TOL_BORNE {
                    sorties.push(obj! {"victime" => &c["net"], "s0" => round(s0, 3),
                                       "s1" => round(s1, 3),
                                       "longueur" => round(s1 - s0, 3)});
                }
            }
        }
    }
    sorties
}

/// Ce que le controle du plan de masse a trouve, dit AVANT la carte :
/// ce sont des CAUSES possibles des pics qu'elle montre.
pub fn _avertir_masse(masse: &Json, avert: &mut Vec<String>, graves: &mut Vec<Json>) {
    let zones = els(&masse["zones"]);
    let de_type = |t: &str| zones.iter().filter(|z| z["type"].as_str() == Some(t)).collect::<Vec<&Json>>();
    let (couture, fentes, transitions) = (de_type("couture"), de_type("fente"), de_type("transition"));
    if !couture.is_empty() {
        avert.push(format!("PAS DE COUTURE INSUFFISANT sur {} zone(s) : le plus \
                            grand trou vaut {:.2} mm pour un seuil de {} mm ({}). \
                            Le cuivre de masse y flotte au genou du front : il ne \
                            blinde plus, il TRANSFÈRE. À lire AVANT la carte — \
                            c'est une cause possible des pics qu'elle montre.",
                           couture.len(), maxf(&couture.iter().map(|z| num(z, "pas")).collect::<Vec<_>>()),
                           f(&masse["seuil"], 2), str_py(&masse["source"])));
    }
    if masse["vain"].vrai() {
        let pc = 100.0 * _nb(&masse["couvert"], 0.0);
        _grave(avert, graves,
               format!("zones de vigilance sur {pc:.0} % du parcours : y tomber \
                        n'explique rien"),
               format!("LES ZONES DE VIGILANCE COUVRENT {pc:.0} % DU PARCOURS : « une \
                        zone tombe au même endroit que ce pic » n'apprend donc plus \
                        rien — une abscisse tirée au hasard en rencontrerait une \
                        aussi souvent. Cousez le plan pour rouvrir la question."));
    }
    if !fentes.is_empty() {
        avert.push(format!("{} discontinuité(s) du plan de référence sous le \
                            parcours. Une fente force le retour à faire le tour, et \
                            la boucle qu'il décrit produit un pic de couplage \
                            LOCALISÉ même là où le plan paraît continu ailleurs.",
                           fentes.len()));
    }
    if !transitions.is_empty() {
        avert.push(format!("{} changement(s) de couche sans via de masse à moins de \
                            {:.1} mm : le courant de retour n'y a pas de chemin \
                            court.", transitions.len(), RAYON_MASSE));
    }
    if !masse["mesure"].vrai() {
        _grave(avert, graves,
               "plan de référence NON examiné : l'absence de zone ne dit rien",
               "Le plan de référence n'a PAS été examiné : la page \
                n'envoie ni positions de couture, ni discontinuités, ni \
                vias de masse. L'absence de zone de vigilance sur la \
                carte ne veut donc pas dire qu'il n'y en a pas.");
    }
}

/// `np.linspace(0.0, fin, n)`
fn linspace(fin: f64, n: usize) -> Vec<f64> {
    if n == 1 {
        return vec![0.0];
    }
    let pas = fin / (n - 1) as f64;
    let mut axe: Vec<f64> = (0..n).map(|i| if pas != 0.0 { i as f64 * pas } else { i as f64 / (n - 1) as f64 * fin }).collect();
    axe[n - 1] = fin;
    axe
}

/// Document « cao-crosstalk-1 » -> carte de couplage. Leve ErreurCrosstalk.
///
/// LE RESULTAT PORTE TOUJOURS L'ETAPE 0a, meme quand rien n'est calcule
/// ensuite : c'est elle qui dit ce qui a ete regarde, et une reponse qui ne la
/// porterait pas laisserait croire qu'aucune piste ne longe alors qu'on n'a
/// peut-etre rien pu simuler.
pub fn analyser(doc: &Json, journal: Option<&mut dyn FnMut(&str)>) -> Result<Json, ErreurCrosstalk> {
    let (couches, objets, nets_agresseurs) = _doc_valide(doc)?;
    let reglages = _reglages(doc)?;
    let refs: Noms = els(&doc["reference_nets"]).iter().map(str_py).filter(|x| !x.is_empty()).collect();
    let paires = els(&doc["paires"]);
    let (mut avert, mut notes, mut graves): (Vec<String>, Vec<String>, Vec<Json>) = (Vec::new(), Vec::new(), Vec::new());

    // L'AGRESSEUR DE REFERENCE EST CELUI QUI PORTE LE PLUS DE CUIVRE : c'est
    // son parcours qui donne l'axe de la carte, et le plus long est celui sur
    // lequel il y a le plus a lire. Les AUTRES nets selectionnes ne sont pas
    // perdus : ils rejoignent le voisinage, deviennent des conducteurs du
    // reseau avec leurs deux ports, et sont marques « agresseur » -- rien
    // n'est code en dur sur leur nombre.
    let mut longueurs: HashMap<String, f64> = HashMap::new();
    for o in &objets {
        *longueurs.entry(str_ou_vide(&o["net"])).or_insert(0.0) += _nb(&o["length"], 0.0);
    }
    let de = |n: &String| longueurs.get(n).copied().unwrap_or(0.0);
    let mut principal = &nets_agresseurs[0];
    for n in &nets_agresseurs[1..] {
        if de(n) > de(principal) {
            principal = n;
        }
    }
    let principal = principal.clone();
    let objets_ref: Vec<Json> = objets.iter().filter(|o| str_ou_vide(&o["net"]) == principal).cloned().collect();
    let mut voisinage: Vec<Json> = els(&doc["voisinage"]).to_vec();
    voisinage.extend(objets.iter().filter(|o| str_ou_vide(&o["net"]) != principal).cloned());
    if voisinage.len() > se::MAX_VOISINAGE {
        voisinage.truncate(se::MAX_VOISINAGE);
        _grave(&mut avert, &mut graves,
               "voisinage tronqué : toutes les voisines n'ont pas été vues",
               format!("Voisinage tronqué à {} tronçons : la présélection n'a regardé \
                        que les plus proches.", se::MAX_VOISINAGE));
    }

    let parcours = _parcours(&objets_ref, Some(&mut notes));
    if parcours.is_empty() {
        return Err(ErreurCrosstalk::new(
            "Le cuivre sélectionné ne porte pas de coordonnées exploitables.",
            "Chaque tronçon doit porter ses deux bouts."));
    }
    let longueur = parcours[parcours.len() - 1].s1;

    // -- ETAPE 0a ----------------------------------------------------------
    let (mut candidats, seuils) = candidats_geometriques(
        &parcours, &voisinage, &couches, &reglages, &refs, &nets_agresseurs.iter().cloned().collect(),
        paires);
    // AUCUN PLAN DE REFERENCE SOUS L'AGRESSEUR : c'est un fait de l'EMPILAGE,
    // et il se dit avant tout le reste. Tout ce qui suit -- le seuil de
    // distance, la section droite, [C] et [L] -- suppose un plan sous la
    // piste ; sans lui, la deduction du seuil n'a pas de hauteur et le
    // solveur de section n'a pas de reference. Ce cas se lisait jusqu'ici
    // comme une carte ordinaire, avec un seuil trois fois plus severe que
    // nécessaire et un couplage qui ressortait au plancher.
    if !(_nb(&seuils["hauteur"], 0.0) > 0.0) {
        let _sans: Vec<String> = els(&seuils["couches_sans_plan"]).iter().map(str_py).collect();
        // LA MASSE ARROSEE DE LA COUCHE CHANGE LA SUITE, pas le constat. Avec
        // elle, la section se resout en coplanaire SANS PLAN et le couplage
        // sort ; sans elle, rien ne porte le retour et il tombe au plancher.
        // Le titre est le meme -- l'absence de plan reste un defaut de dessin
        // pour un net rapide --, la consequence annoncee ne l'est pas.
        let arrose = parcours.iter().any(|t| _nb(&t.obj["gap_left"],
                                                 _nb(&t.obj["gap"], 0.0)) > 0.0
                                         || _nb(&t.obj["gap_right"],
                                                _nb(&t.obj["gap"], 0.0)) > 0.0);
        let suite = if arrose {
            " Le seuil de présélection a donc été porté au maximum du \
             voisinage plutôt que réduit à trois largeurs de piste. La masse \
             arrosée de la même couche porte seule le retour : la section est \
             résolue en ligne coplanaire SANS PLAN, et le couplage qui en \
             sort est sensiblement plus fort que sous un plan. Le chemin de \
             retour réel dépend de la continuité de cette masse sur tout le \
             parcours."
        } else {
            " Le seuil de présélection a donc été porté au maximum du \
             voisinage plutôt que réduit à trois largeurs de piste, et le \
             couplage, lui, ne pourra pas être calculé sur les blocs \
             concernés : il ressortira au plancher, ce qui n'est PAS une \
             mesure de découplage. Vérifiez l'empilage, ou le rôle des \
             couches de plan, ou arrosez la masse sur la couche."
        };
        let lesquelles = if _sans.len() == 1 {
            format!("la couche « {} »", _sans[0])
        } else if !_sans.is_empty() {
            format!("les couches {}", guillemets(&_sans, ", "))
        } else {
            format!("la couche « {} »", nom_ou_rang(&couches, parcours[0].couche))
        };
        _grave(
            &mut avert, &mut graves,
            format!("aucun plan de référence sous « {principal} » dans l'empilage"),
            format!("AUCUN PLAN DE RÉFÉRENCE SOUS « {principal} » : {lesquelles} n'a pas de \
                     plan dans l'empilage déclaré. Le seuil de distance se déduit de \
                     la hauteur au plan, et [C] et [L] d'une section droite qui \
                     demande une référence.{suite}"));
    }
    // LES GARDES ROUTEES, A COTE DES VICTIMES ET JAMAIS A LEUR PLACE. Elles ne
    // sont pas « retenues » -- elles n'ont pas de port, pas de courbe, pas de
    // ligne dans le tableau --, et elles entrent pourtant dans chaque section
    // qu'elles longent. Sans elles, une piste de masse tracee a la main entre
    // l'agresseur et sa victime ne servait a rien dans le calcul.
    // UN NET EST UN CONDUCTEUR : on fusionne AVANT le plafond, sans quoi un
    // doublon de couches mangerait une des cinq places chiffrées.
    let actives: Vec<usize> = (0..candidats.len()).filter(|&k| candidats[k]["garde_active"].vrai()).collect();
    let gardes: Vec<Json> = _fusionner_nets(&candidats, &actives, &mut notes, true).into_iter().map(|g| g.0).collect();
    let choisis: Vec<usize> = (0..candidats.len()).filter(|&k| candidats[k]["retenu"].vrai()).collect();
    let mut fusion = _fusionner_nets(&candidats, &choisis, &mut notes, false);
    if fusion.len() > MAX_VICTIMES {
        for (_, sources) in &fusion[MAX_VICTIMES..] {
            // LE MOTIF SE POSE SUR LES FICHES D'ORIGINE : c'est le tableau que
            // l'utilisateur lit, et la fiche fusionnée n'y figure pas.
            for &src in sources {
                poser(&mut candidats[src], "retenu", false);
                poser(&mut candidats[src], "raison", format!("au-delà des {MAX_VICTIMES} pistes chiffrées : la \
                                                             présélection garde les plus proches"));
            }
        }
        fusion.truncate(MAX_VICTIMES);
    }
    let retenus: Vec<Json> = fusion.into_iter().map(|c| c.0).collect();
    // L'AXE DE LA CARTE SE POSE ICI, ET NON PLUS TROIS FONCTIONS PLUS LOIN :
    // le profil d'espacement doit etre echantillonne SUR LE MEME AXE que la
    // courbe de couplage, sans quoi les deux ne se superposeraient pas -- et
    // c'est leur superposition, pas chacune prise a part, qui apprend quelque
    // chose.
    let axe = linspace(longueur,
                       COLONNES.min(((longueur * 20.0) as i64).max(8) as usize));
    let espacements = profils_espacement(&retenus, &axe, &mut notes);
    let mut etape0 = obj! {"candidats" => candidats.clone(), "seuils" => &seuils,
                           "retenus" => retenus.iter().map(|c| c["net"].clone()).collect::<Vec<Json>>(),
                           // POSEES, PAS RETENUES : le tableau des victimes n'en parle pas,
                           // et la coupe, elle, les porte.
                           "gardes" => gardes.iter().map(|c| c["net"].clone()).collect::<Vec<Json>>(),
                           "regardes" => voisinage.len(),
                           "espacements" => &espacements};

    // LE FRONT DE L'ANALYSE, ET D'OU IL SORT. Saisi, il fait foi ; vide, il se
    // deduit de la CLASSE de l'agresseur -- celle que la page connait, avec
    // les fronts du panneau de verification. C'est le meme pour le NEXT, le
    // FEXT et le seuil de couture.
    let classe = str_ou_vide(&doc["natures"][principal.as_str()]);
    let mut front_impose = Json::Nul;
    let (t_r, source_tr);
    if num(&reglages, "t_r") > 0.0 {
        (t_r, source_tr) = (num(&reglages, "t_r"), "saisi".to_string());
    } else if !classe.is_empty() {
        let porteuse = num(&reglages, "porteuse_rf");
        (t_r, source_tr) = front_de_classe(&classe, &reglages["tr_classes"],
                                           porteuse);
        // LA CLASSE RF IMPOSE 100 ps, ET ELLE LE DIT FORT. Un net nomme « RF »
        // -- a tort ou a raison : « RST_RF », « LNA_EN » -- sans front saisi
        // ni porteuse reglee se juge sous le front le plus raide de la table,
        // et le FEXT, qui varie comme 1/t_r, sort DIX FOIS celui d'un front
        // de 1 ns. Sur la carte d'essai du banc crosstalk, le cas 1 rendait
        // 18 % de FEXT sans qu'on sache d'ou venait le front. C'est donc une
        // RESERVE -- le resultat est « sous reserve » tant que le front n'est
        // pas celui du signal reel --, en tete des hypotheses, et la page a de
        // quoi l'afficher (`front_impose`).
        if classe == "RF" && !(porteuse > 0.0) {
            let duree = _texte_duree(t_r);
            front_impose = obj! {
                "classe" => &classe, "t_r" => t_r, "porteuse_rf" => Json::Nul,
                "titre" => format!("t_r = {duree} imposé par la classe RF — saisissez un \
                                    front ou une porteuse pour affiner"),
                "texte" => format!("FRONT IMPOSÉ PAR LA CLASSE : aucun front n'est \
                                    saisi, et « {principal} » est de classe RF, dont le front \
                                    de référence vaut {duree} (le plus raide de la table \
                                    des classes). Tout le NEXT non saturé et tout le \
                                    FEXT en dépendent — le FEXT varie comme 1/t_r, et \
                                    vaut ici dix fois celui d'un front de 1 ns. \
                                    Saisissez le front réel du signal (celui du \
                                    générateur ou de l'émetteur), ou réglez la \
                                    porteuse RF dans le panneau de vérification : \
                                    l'agresseur sera alors jugé à t_r = 0,35 / f.")};
            _grave(&mut avert, &mut graves, txt(&front_impose, "titre"), txt(&front_impose, "texte"));
        } else if classe == "RF" {
            front_impose = obj! {
                "classe" => &classe, "t_r" => t_r,
                "porteuse_rf" => porteuse,
                "titre" => format!("t_r = {} déduit de la porteuse RF ({})",
                                   _texte_duree(t_r),
                                   _texte_frequence(porteuse)),
                "texte" => ""};
            notes.push(format!(
                "Aucun front saisi : « {} » est de classe RF et la porteuse \
                 RF du panneau vaut {}, donc t_r = 0,35 / f = {}. Saisissez \
                 un front si le signal réel est une impulsion plutôt qu'une \
                 porteuse.",
                principal, _texte_frequence(porteuse),
                _texte_duree(t_r)));
        }
    } else {
        (t_r, source_tr) = (TR_DEFAUT, "front de référence (1 ns) — la classe \
                                        du net n'est pas connue".to_string());
    }
    let analyse = obj! {"temps_montee" => t_r, "source_tr" => &source_tr};
    // LES COUPLES ECARTES A MOINS DE 1,5 x LE SEUIL, DITS DANS LA FICHE et non
    // seulement dans la ligne du tableau : un couple dessine a S = 3,5 W qui
    // disparait du resultat se lit « rien ne couple », et c'est faux -- il n'a
    // pas ete chiffre. Le motif de chaque fiche est repris ici en une phrase,
    // avec le geste.
    let proches: Vec<&Json> = candidats.iter().filter(|c| c["proche_du_seuil"].vrai()).collect();
    poser(&mut etape0, "ecartes_proches", proches.iter().map(|c| obj! {
        "net" => &c["net"], "distance" => &c["distance"],
        "seuil" => &seuils["distance_max"]}).collect::<Vec<Json>>());
    if !proches.is_empty() {
        avert.push(format!(
            "{} voisine(s) ÉCARTÉE(S) PAR LA PRÉSÉLECTION à moins de {} × le \
             seuil de {} mm, donc NON CHIFFRÉE(S) : {}. Ce n'est pas un \
             couplage nul — ouvrez la « distance max » (≥ {:.2} mm) pour les \
             avoir au tableau.",
            proches.len(), fmt_g(PRESELECTION_PROCHE, 6), f(&seuils["distance_max"], 3),
            proches.iter().map(|c| format!("« {} » à S = {} mm", str_py(&c["net"]), f(&c["distance"], 3))).collect::<Vec<_>>().join(", "),
            maxf(&proches.iter().map(|c| num(c, "distance")).collect::<Vec<_>>())));
    }

    let masse = controle_masse(doc, &parcours, &analyse);
    let mut base = obj! {"format" => FORMAT_RESULTAT, "carte" => str_ou_vide(&doc["carte"]),
                         "version" => VERSION, "moteurs" => version_moteurs(),
                         "methode" => "niveau 2",
                         "agresseurs" => nets_agresseurs.clone(), "principal" => &principal,
                         "classe" => &classe,
                         "t_r" => t_r, "source_tr" => &source_tr,
                         // LE FRONT VENU DE LA CLASSE RF, OU DE LA PORTEUSE : None quand le
                         // front est saisi ou vient d'une autre classe. La page l'affiche
                         // a cote du t_r, en alerte quand c'est la classe qui l'impose.
                         "front_impose" => front_impose,
                         "seuils" => obj! {"orange" => &reglages["seuil_orange"],
                                           "rouge" => &reglages["seuil_rouge"],
                                           "confirmation_db" => &reglages["seuil_db"]},
                         "longueur" => round(longueur, 3), "etape0" => etape0, "masse" => &masse,
                         // RIEN N'A ETE CALCULE N'EST PAS « RIEN NE COUPLE ». Le premier
                         // cas est une absence de mesure, le second en est une.
                         "preselection_vide" => retenus.is_empty(),
                         "reglages" => &reglages,
                         "avertissements" => Json::Nul, "graves" => Json::Nul};

    if retenus.is_empty() {
        poser(&mut base, "couples", Vec::<Json>::new());
        poser(&mut base, "victimes", Vec::<Json>::new());
        poser(&mut base, "statut", "vert");
        poser(&mut base, "actions", Vec::<Json>::new());
        poser(&mut base, "actions_omises", Json::Nul);
        poser(&mut base, "risques_refus", Vec::<Json>::new());
        poser(&mut base, "risques", Vec::<Json>::new());
        poser(&mut base, "carte_chaleur", Json::Nul);
        poser(&mut base, "blindage", obj! {"gardes" => Vec::<Json>::new(), "bords_non_cousus" => Vec::<Json>::new(),
                                           "couture_max" => se::_couture_max(t_r)});
        // LE MESSAGE NOMME L'AGRESSEUR : « aucune piste ne passe » se lit « tu
        // n'as rien selectionne » alors qu'il parle des VICTIMES.
        avert.push(format!("« {} » a bien été analysée ({:.2} mm, {} voisine(s) \
                            regardée(s)), mais AUCUNE de ses {} candidate(s) ne \
                            passe la présélection géométrique : il n'y a pas de \
                            paire à chiffrer. Le tableau « ce qui longe » dit \
                            pourquoi chacune a été écartée — c'est là qu'il faut \
                            desserrer un seuil, pas dans la sélection.",
                           principal, longueur, voisinage.len(),
                           candidats.len()));
        // les notes ne sortent pas ici : la liste rendue est celle des avertissements seuls
        poser(&mut base, "avertissements", avert);
        poser(&mut base, "graves", graves);
        let h = _hypotheses(&reglages, &masse, &seuils, &base);
        poser(&mut base, "hypotheses", h);
        _journaliser(journal, &base);
        return Ok(base);
    }

    // -- [C] ET [L], BLOC PAR BLOC -----------------------------------------
    let infos = sections_couplees(&couches, &parcours, &retenus, &refs, t_r, &mut notes,
                                  &gardes, els(&doc["fentes"]),
                                  reglages["pertes"].vrai())?;
    // LE COUPLAGE NON CALCULE NE SE LIT PAS COMME UN COUPLAGE NUL. La section
    // droite n'est pas resoluble sur un bloc -- pas de plan de reference sous
    // la piste, solveur en echec --, [C] et [L] y restent DIAGONALES, le terme
    // croise vaut exactement zero, et ce zero-la n'est pas une mesure. C'est
    // precisement le cas d'un parcours qui passe au-dessus d'un trou du plan,
    // ou le couplage reel EXPLOSE faute de chemin de retour.
    let muet = infos.longueur_non_couplee;
    if muet > 0.0 {
        let nets_muets: Noms = infos.non_couples.iter().flat_map(|z| els(&z["nets"]).iter().map(str_py)).collect();
        let lesquels = guillemets(&nets_muets, ", ");
        _grave(
            &mut avert, &mut graves,
            format!("couplage NON CALCULÉ sur {:.2} mm ({:.0} % du longement) : ce \
                     n'est pas un couplage nul", muet, 100.0 * muet / longueur),
            format!("COUPLAGE NON CALCULÉ sur {:.2} mm de parcours, soit {:.0} % de la \
                     liaison, pour {}. La section droite n'y est pas résoluble ({}) : \
                     les coefficients y valent exactement zéro, et ce zéro-là n'est \
                     pas une mesure — c'est une absence de mesure. Les niveaux rendus \
                     sont donc un PLANCHER, et un statut vert ne vaut rien sur cette \
                     portion. La cause la plus fréquente est un plan de référence \
                     absent ou percé sous le parcours : c'est justement là que le \
                     couplage réel est le plus fort, faute de chemin de retour court.",
                    muet, 100.0 * muet / longueur,
                    if lesquels.is_empty() { "les voisines de ces blocs" } else { &lesquels },
                    if infos.raison_section.is_empty() { "cause non rapportée" } else { &infos.raison_section }));
    }
    // LES GARDES ROUTEES, DITES AVEC LE RESULTAT : sans cette phrase, la chute
    // -- ou la MONTEE -- de couplage qu'elles provoquent serait un chiffre sans
    // cause.
    let posees = &infos.gardes;
    poser(&mut base, "blindage", obj! {
        "gardes" => posees.clone(),
        "bords_non_cousus" => infos.bords_non_cousus.clone(),
        "couture_max" => infos.couture_max});
    if !posees.is_empty() {
        let flottantes: Vec<&Json> = posees.iter().filter(|g| num(g, "longueur_flottante") > 0.0).collect();
        avert.push(format!(
            "{} piste(s) de garde routée(s) sont POSÉES dans les sections \
             résolues : {}. Elles n'ont pas de ligne au tableau, mais elles \
             prennent du champ aux deux — c'est ce qu'on leur demande. Une \
             garde cousue est tenue à 0 V et fait tomber le NEXT comme le \
             FEXT ; une garde dont le plus grand trou de couture dépasse \
             {:.1} mm est posée FLOTTANTE, et celle-là ne blinde pas : elle \
             TRANSFÈRE, et le couplage peut en devenir PIRE qu'en l'absence \
             de tout cuivre.{}",
            posees.len(),
            posees.iter().map(|g| format!("« {} » sur {} mm", str_py(&g["net"]), f(&g["longueur"], 1))).collect::<Vec<_>>().join(", "),
            infos.couture_max,
            if flottantes.is_empty() { String::new() } else {
                format!(" ICI, {} : cousez-la, ou ne comptez pas dessus.",
                        flottantes.iter().map(|g| format!("« {} » flotte sur {} mm (trou de {} mm)",
                                                          str_py(&g["net"]), f(&g["longueur_flottante"], 1), f(&g["couture"], 1)))
                            .collect::<Vec<_>>().join(", "))
            }));
    }
    let bords_nus = &infos.bords_non_cousus;
    if !bords_nus.is_empty() {
        avert.push(format!(
            "PLAN ARROSÉ NON COUSU sur le bord {} du parcours : le plus grand \
             trou entre deux vias y atteint {:.1} mm, au-delà des {:.1} mm que \
             le front autorise. L'effet coplanaire de ce côté-là a donc été \
             ANNULÉ dans les sections concernées ({}) plutôt que de faire \
             cadeau d'une masse idéale à 0 V : le couplage rendu est celui \
             d'un bord SANS masse à portée, et il est plus fort d'autant. \
             Cousez ce plan, ou ne comptez pas dessus.",
            bords_nus.iter().map(|b0| str_py(&b0["cote"])).collect::<Vec<_>>().join(" et "),
            maxf(&bords_nus.iter().map(|b0| num(b0, "couture")).collect::<Vec<_>>()),
            infos.couture_max,
            bords_nus.iter().map(|b0| format!("{} mm à {}", f(&b0["longueur"], 1), str_py(&b0["cote"]))).collect::<Vec<_>>().join(", ")));
    }
    // LE PLAN QUI MANQUE SOUS LE LONGEMENT : la section droite quasi-TEM
    // SUPPOSE un plan de retour continu sous les deux pistes. Depuis la
    // 4.5.0, une fente dont la page a MESURE les detours ajoute le terme
    // d'impedance commune d'Ott ; celle qu'elle n'a pas mesuree, ou qu'un plan
    // referme encore dessous, garde la reserve d'avant.
    let (fentes_termes, fentes_signalees) = termes_fentes(
        doc, &couches, &parcours, &retenus, &infos.blocs, t_r, &mut notes,
        &voisinage);
    poser(&mut base, "fentes", obj! {
        "chiffrees" => fentes_termes.iter().map(|(_, v)| v.len()).sum::<usize>(),
        "signalees" => fentes_signalees.clone()});

    // Cette fente sur ce longement a-t-elle son terme ?
    let chiffree = |fe: &Json| fentes_termes.iter().filter(|(net, _)| fe["victime"].as_str() == Some(net.as_str())).flat_map(|(_, ts)| ts)
        .any(|t| minf(&[num(t, "s1"), num(fe, "s1")]) - maxf(&[num(t, "s0"), num(fe, "s0")]) > TOL_BORNE);

    let fentes_sur = _fentes_sur_longement(&masse, &retenus);
    let fentes_muettes: Vec<&Json> = fentes_sur.iter().filter(|fe| !chiffree(fe)).collect();
    if !fentes_termes.is_empty() {
        for (net, ts) in &fentes_termes {
            let mut t = &ts[0];
            for x in &ts[1..] {
                if num(x, "next") > num(t, "next") {
                    t = x;
                }
            }
            let lissage = |t: &Json| if num(t, "lissage") < 0.95 {
                format!(" La self du détour (τ = {:.0} ps) lisse la pente du \
                         courant et borne le terme à M/L_d = {:.0} %.",
                        num(t, "tau_ps"), 100.0 * num(t, "k"))
            } else { String::new() };
            if t["modele"].as_str() == Some("B") {
                let o = &t["ott"];
                avert.push(format!(
                    "FENTE DU PLAN SOUS « {} » ET « {} » : le courant de retour \
                     des deux y a été RÉSOLU (maillage de {} × {} mailles, {} \
                     branches{}{}). Ce que les vides ajoutent aux plans \
                     pleins : self du détour {} nH, mutuelle {} nH, soit \
                     {:+.2} % en NEXT et autant en FEXT à t_r = {}, AJOUTÉS au \
                     couplage des lignes.{}{}{} Limites : quasi statique au \
                     genou, cavité sans fin hors de l'image, finesse bornée \
                     par le maillage — un ordre de grandeur, pas une forme \
                     d'onde.",
                    principal, net, str_py(&t["maillage"]["mailles"][0]),
                    str_py(&t["maillage"]["mailles"][1]), str_py(&t["maillage"]["branches"]),
                    if t["retour"].vrai() {
                        format!(" ; le retour passe aussi par {}",
                                guillemets(els(&t["retour"]).iter().map(str_py), ", "))
                    } else { String::new() },
                    if t["borne"].vrai() { " ; plan coupé de bord à bord dans l'image" } else { "" },
                    f(&t["ld_nh"], 2), f(&t["m_nh"], 2), num(t, "next_pc"), _texte_duree(t_r),
                    if o.vrai() {
                        format!(" Le modèle d'Ott, qui suppose tous les plans coupés et \
                                 une fente droite, donnerait {} nH de mutuelle et \
                                 {:+.2} % (fourchette {} à {} %) : la fourchette \
                                 rendue encadre les deux modèles.",
                                f(&o["m_nh"], 2), num(o, "next_pc"), f(&o["fourchette_pc"][0], 2),
                                f(&o["fourchette_pc"][1], 2))
                    } else { String::new() },
                    lissage(t),
                    if t["resonance"]["sensible"].vrai() {
                        format!(" La RÉSONANCE de la fente a pesé (× {} au genou).",
                                f(&t["resonance"]["facteur"], 2))
                    } else { String::new() }));
                continue;
            }
            avert.push(format!(
                "FENTE DU PLAN FRANCHIE PAR « {} » ET « {} » : le courant de \
                 retour des deux la contourne par le même cuivre (détours de \
                 {} et {} mm{}, entraxe {} mm). Ce couplage par \
                 IMPÉDANCE COMMUNE est chiffré par le modèle d'Ott : self du \
                 détour {} nH, mutuelle {} nH (fourchette {} à {} nH), \
                 soit {:+.2} % en NEXT et autant en FEXT à t_r = {} \
                 (fourchette {} à {} %), AJOUTÉS au couplage des lignes.\
                 {}{} Limites : fente droite franchie à peu près \
                 perpendiculairement, tous les plans de retour coupés — \
                 c'est un ordre de grandeur, pas une forme d'onde.",
                principal, net, f(&t["d1"], 1), f(&t["d2"], 1),
                if t["borne"].vrai() {
                    format!(" — plan coupé de bord à bord, détour plafonné à {FENTE_MAX:.0} mm")
                } else { String::new() },
                f(&t["entraxe"], 2), f(&t["ld_nh"], 1), f(&t["m_nh"], 1), f(&t["m_bas_nh"], 1),
                f(&t["m_haut_nh"], 1), num(t, "next_pc"), _texte_duree(t_r),
                f(&t["fourchette_pc"][0], 2), f(&t["fourchette_pc"][1], 2),
                lissage(t),
                if t["resonance"]["sensible"].vrai() {
                    format!(" La RÉSONANCE de la fente a pesé (× {} au genou de \
                             {:.2} GHz, quart d'onde vers {:.2} GHz, Q ≈ {:.0}) : sous \
                             300 ps, la fente est une antenne autant qu'un détour.",
                            f(&t["resonance"]["facteur"], 2), 1e-9 * num(&t["resonance"], "f_genou"),
                            1e-9 * num(&t["resonance"], "f_quart_onde"), FENTE_Q)
                } else { String::new() }));
        }
        if muet > 0.0 {
            avert.push(
                "Le bloc sous la fente n'a pas de section résolue (aucun plan \
                 dessous) : le couplage des LIGNES y vaut zéro, et c'est le \
                 terme d'impédance commune ci-dessus qui en tient lieu sur \
                 cette plage.".into());
        }
    }
    for sg in &fentes_signalees {
        if sg["cause"].as_str() == Some("retour") {
            avert.push(format!(
                "FENTE SOUS LE LONGEMENT de {:.2} mm à partir de {:.2} mm, SANS \
                 terme d'impédance commune : {}. C'est ce que le cas 4b du \
                 banc de mesure doit départager.", num(sg, "s1") - num(sg, "s0"),
                num(sg, "s0"), str_py(&sg["texte"])));
        } else {
            notes.push(format!("Fente de {:.2} mm à partir de {:.2} mm : {}.",
                               num(sg, "s1") - num(sg, "s0"), num(sg, "s0"), str_py(&sg["texte"])));
        }
    }
    if !fentes_muettes.is_empty() {
        _grave(
            &mut avert, &mut graves,
            format!("plan de référence absent sous {:.2} mm de longement : le couplage \
                     rendu est un plancher",
                    py::sum(fentes_muettes.iter().map(|fe| num(fe, "longueur")))),
            format!("PLAN DE RÉFÉRENCE ABSENT SOUS LE LONGEMENT, sur {}. La section \
                     droite SUPPOSE un plan de retour continu sous les deux pistes : \
                     c'est de lui que sortent [C] et [L]. Là où le plan est percé ou \
                     absent, le courant de retour fait un détour, et les deux pistes \
                     se partagent ce retour : le couplage par IMPÉDANCE COMMUNE qui \
                     en résulte est un terme que ce modèle ne contient PAS{}. CE QUE \
                     LE TABLEAU REND EST UN PLANCHER SUR CES PLAGES, et un statut \
                     vert n'y est pas un verdict. Un plan continu sous un longement \
                     coûte moins qu'un écartement de pistes.",
                    fentes_muettes.iter().map(|fe| format!("{} mm à partir de {} mm (« {} »)",
                                                           f(&fe["longueur"], 2), f(&fe["s0"], 2), str_py(&fe["victime"])))
                        .collect::<Vec<_>>().join("; "),
                    " ici — la page n'a pas envoyé les détours d1 / d2 de cette \
                     fente, ou un plan la referme encore dessous"));
    }

    // UNE VOISINE QUI LONGE DES DEUX FACONS -- a plat sur une portion,
    // superposee sur une autre, parce que l'AGRESSEUR change de couche. La
    // portion superposee est resolue a part si rien ne la blinde ; si un plan
    // la separe, n'y compter aucun couplage est juste, et cela se dit.
    for c in &retenus {
        if c["intervalles"].vrai() && c["longueur_verticale"].vrai()
                && c["blinde_verticalement"].vrai() {
            notes.push(format!(
                "« {} » longe « {} » de deux façons : {:.2} mm À PLAT (c'est \
                 cette portion qui est couplée) et {:.2} mm SUPERPOSÉE, \
                 l'agresseur ayant changé de couche. La portion superposée \
                 est séparée par un plan de référence : n'y compter aucun \
                 couplage est juste.",
                str_py(&c["net"]), principal, numd(c, "longueur_laterale", 0.0),
                numd(c, "longueur_verticale", 0.0)));
        }
    }
    _avertir_masse(&masse, &mut avert, &mut graves);
    _lire_couples(&mut base, &infos, &retenus, &couches, &axe, &espacements, &masse,
                  &reglages, t_r, &mut notes, &mut avert, &mut graves, &fentes_termes);
    avert.extend(notes);
    poser(&mut base, "avertissements", avert);
    poser(&mut base, "graves", graves);
    let h = _hypotheses(&reglages, &masse, &seuils, &base);
    poser(&mut base, "hypotheses", h);
    _journaliser(journal, &base);
    Ok(base)
}

/// Ce que l'etape 0a a mesure pour ce net, ou des zeros assumes.
///
/// LES FICHES FUSIONNEES PASSENT EN PREMIER, et c'est l'appelant qui les met
/// la. Chercher dans la seule liste brute rendait la PREMIERE fiche du nom :
/// sur un net qui longe sur deux couches, les deux lignes du resultat
/// sortaient avec la distance, la couche et le cote d'une seule d'entre
/// elles -- une geometrie fausse a cote d'un chiffre juste.
pub fn _fiche_candidat(candidats: &[Json], net: &str) -> Json {
    for c in candidats {
        if c["net"].as_str() == Some(net) {
            return c.clone();
        }
    }
    obj! {"distance" => 0.0, "longueur" => 0.0, "type" => "", "cote" => "",
          "paire" => false, "role" => "victime", "nom_couche" => ""}
}

// ==========================================================================
// LA LECTURE PAR PAIRE : LE PROFIL DE COUPLAGE LE LONG DU PARCOURS
// --------------------------------------------------------------------------
// `valeurs` est une FRACTION DE L'AMPLITUDE DE L'AGRESSEUR -- le NEXT local --,
// si bien que les plages a risque, la peinture sur le cuivre et l'axe de la
// carte se calculent par le meme code. Kb est le coefficient ARRIERE : la
// ligne s'ecrit `sens: "next"`, et `zones_risque` -- qui ne peint que le
// NEXT -- a raison de la prendre.
// ==========================================================================

/// (Kb, Kf, mesure) de cette victime, echantillonnes sur l'axe de la carte.
///
/// UN BLOC EST UNE VALEUR CONSTANTE SUR SON INTERVALLE : [C] et [L] y sont
/// resolues une fois, pour toute sa longueur. L'echantillonnage est donc un
/// simple « quel bloc contient cette abscisse », et surtout PAS une
/// interpolation -- inventer une pente entre deux blocs ferait voir une
/// variation continue la ou le modele est constant par morceaux, et cette
/// pente-la se lirait comme un renseignement sur le dessin.
pub fn profil_geometrique(blocs: &[Json], net: &str, axe: &[f64]) -> (Vec<f64>, Vec<f64>, Vec<bool>) {
    let mut kb = vec![0.0; axe.len()];
    let mut kf = vec![0.0; axe.len()];
    let mut mesure = vec![false; axe.len()];
    for (k, &x) in axe.iter().enumerate() {
        for b in blocs {
            if !(num(b, "s0") - TOL_BORNE <= x && x <= num(b, "s1") + TOL_BORNE) {
                continue;
            }
            let c = &b["couplage"][net];
            if c.vrai() {
                kb[k] = _nb(&c["kb"], 0.0);
                kf[k] = _nb(&c["kf"], 0.0);
                mesure[k] = c["mesure"].vrai();
            }
            break;
        }
    }
    (kb, kf, mesure)
}

/// Une entree de `couverture_calcul` : {presente, muette, empile}.
#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct Couverture {
    pub presente: f64,
    pub muette: f64,
    pub empile: bool,
}

/// {net: {presente, muette, empile}} : ou chaque voisine a ete CALCULEE.
///
/// DEUX ZEROS NE SE VALENT PAS, et les deux modes doivent les distinguer de
/// la meme facon. Sur un bloc que la voisine ne longe pas, son couplage est
/// nul parce qu'elle est loin -- c'est une mesure. Sur un bloc qu'elle longe
/// et dont la section n'a pas ete resolue (plan de reference absent, solveur
/// en echec), il est nul parce qu'on n'a rien calcule -- et c'est justement
/// la ou le couplage reel est le plus fort, faute de chemin de retour court.
///
/// `presente` et `muette` sont des longueurs en millimetres : celle que la
/// voisine longe, et celle-ci privee de section. `empile` marque une voisine
/// de couche adjacente : le solveur range ses conducteurs cote a cote et ne
/// sait pas les empiler, elle n'a donc aucun bloc -- et aucun chiffre.
pub fn couverture_calcul(blocs: &[Json], retenus: &[Json]) -> HashMap<String, Couverture> {
    let mut out: HashMap<String, Couverture> = HashMap::new();
    for b in blocs {
        let longueur = nb(&b["s1"]) - nb(&b["s0"]);
        if let Some(couplage) = b["couplage"].as_objet() {
            for (net, c) in couplage {
                let e = out.entry(net.clone()).or_default();
                if c["presente"].vrai() {
                    e.presente += longueur;
                    if !c["mesure"].vrai() {
                        e.muette += longueur;
                    }
                }
            }
        }
    }
    for c in retenus {
        if !c["intervalles"].vrai() {
            out.entry(str_py(&c["net"])).or_default().empile = true;
        }
    }
    out
}

/// Ce que `etat_calcul` rend.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct EtatCalcul {
    pub non_calcule: bool,
    pub mesure_partielle: bool,
    pub longueur_non_calculee: f64,
}

/// Ce qu'un couple dit de son propre calcul, dans les deux modes.
///
/// `non_calcule` : aucun millimetre du longement n'a de section resolue --
/// le niveau rendu est un plancher sans valeur, pas un decouplage.
/// `mesure_partielle` : une partie seulement ; le niveau est un plancher.
pub fn etat_calcul(couverture: &HashMap<String, Couverture>, net: &str, longement: f64) -> EtatCalcul {
    let e = couverture.get(net).copied().unwrap_or_default();
    if e.empile {
        return EtatCalcul { non_calcule: true, mesure_partielle: false,
                            longueur_non_calculee: round(longement, 3) };
    }
    let (presente, muette) = (e.presente, e.muette);
    let non = presente > 0.0 && muette >= presente - TOL_BORNE;
    EtatCalcul { non_calcule: non,
                 mesure_partielle: muette > TOL_BORNE && !non,
                 longueur_non_calculee: round(muette, 3) }
}

/// La phrase qu'un couple non calcule porte a la place de son niveau.
pub fn _raison_non_calcule(etat: &EtatCalcul) -> &'static str {
    if etat.non_calcule {
        "couplage NON CALCULÉ — aucune section droite résolue sur son \
         longement (plan de référence absent, ou voisine empilée que le \
         solveur ne sait pas modéliser) : ce n'est pas un couplage nul, \
         et c'est souvent là qu'il est le plus fort."
    } else {
        ""
    }
}

/// Le niveau 2, paire par paire, et la carte locale du NEXT.
///
/// LA RESOLUTION EST CELLE DU DECOUPAGE, et elle est honnete sans reserve :
/// aucune transformee n'est en jeu. Le profil est constant par bloc et EXACT
/// entre deux bornes ; la seule chose qui limite la lecture est la grille
/// d'affichage.
///
/// `fentes_termes` (4.5.0) : {net: [termes]} de `termes_fentes`, les
/// impedances communes des fentes que la victime franchit avec l'agresseur.
/// Ils s'ajoutent au niveau 2 de la paire (`ajouter_fentes_niveau2`) et se
/// posent sur la carte locale a l'abscisse de la fente -- le pic LOCALISE
/// que la reserve annoncait depuis la 3.0.0 sans jamais le chiffrer.
pub fn _lire_couples(base: &mut Json, infos: &Infos, retenus: &[Json], couches: &[Json], axe: &[f64], espacements: &Json, masse: &Json,
                     reglages: &Json, t_r: f64, notes: &mut Vec<String>, avert: &mut Vec<String>, graves: &mut Vec<Json>,
                     fentes_termes: &[(String, Vec<Json>)]) {
    let blocs = &infos.blocs;
    let principal = str_py(&base["principal"]);
    let fiches: Vec<Json> = retenus.iter().chain(els(&base["etape0"]["candidats"])).cloned().collect();
    let etendue = if axe.len() > 1 { axe[axe.len() - 1] - axe[0] } else { 0.0 };
    let res = etendue / (axe.len() as i64 - 1).max(1) as f64;
    let bloc_max = blocs.iter().map(|b| nb(&b["s1"]) - nb(&b["s0"])).reduce(|m, x| if x > m { x } else { m }).unwrap_or(0.0);
    let retards = &infos.retards;
    let seuil_conf = 10f64.powf(_nb(&reglages["seuil_db"], -40.0) / 20.0);
    let (orange, rouge) = (num(reglages, "seuil_orange"), num(reglages, "seuil_rouge"));
    let couverture = couverture_calcul(blocs, retenus);
    let mut cache_sup = HashMap::new();
    let (mut couples, mut lignes, mut sans_superposition): (Vec<Json>, Vec<Json>, Vec<String>) = (Vec::new(), Vec::new(), Vec::new());
    // LES PERTES, LE LONG DU PARCOURS : l'integrale de alpha depuis le depart
    // de l'agresseur (Np). Un morceau couple a l'abscisse x renvoie son NEXT
    // au bout proche apres un aller-retour, exp(-2.A(x)) ; le FEXT parcourt
    // toute la liaison, exp(-A(L)). Sans pertes demandees, alpha est nul.
    let pertes = reglages["pertes"].vrai();
    let mut cumul = vec![0.0];
    for bl in blocs {
        cumul.push(cumul[cumul.len() - 1] + _nb(&bl["alpha"], 0.0)
                   * (nb(&bl["s1"]) - nb(&bl["s0"])) * 1e-3);
    }

    // A(x), l'attenuation cumulee jusqu'a l'abscisse x (mm), en Np.
    let integrale = |x: f64| -> f64 {
        for (k, bl) in blocs.iter().enumerate() {
            if x <= nb(&bl["s1"]) + TOL_BORNE {
                return cumul[k] + _nb(&bl["alpha"], 0.0) * maxf(&[
                    0.0, x - nb(&bl["s0"])]) * 1e-3;
            }
        }
        cumul[cumul.len() - 1]
    };
    let att = |x: f64| if pertes { (-2.0 * integrale(x)).exp() } else { 1.0 };
    let att_fext = if pertes { (-cumul[cumul.len() - 1]).exp() } else { 1.0 };
    let agresseurs_sel: Noms = blocs.iter().filter_map(|bl| bl["couplage_agresseurs"].as_objet()).flat_map(|o| o.keys().cloned()).collect();
    let somme_mode = if reglages["somme"].vrai() { str_py(&reglages["somme"]) } else { "pire".to_string() };
    for (g, v) in infos.conducteurs.iter().enumerate() {
        if g == 0 {
            continue;
        }
        let net = str_py(&v["net"]);
        let fiche = _fiche_candidat(&fiches, &net);
        let (kb, _kf, _mesure) = profil_geometrique(blocs, &net, axe);
        let mut etat = etat_calcul(&couverture, &net, num(&fiche, "longueur"));
        // LES MORCEAUX COUPLES A PLAT : un par bloc que la voisine longe, avec
        // le retard de la VICTIME sur ce bloc. `retards[g]` cumule ce retard
        // bloc par bloc, dans l'ordre de `blocs`.
        let vide = Vec::new();
        let ret = retards.get(g).unwrap_or(&vide);
        let (mut morceaux, mut td_plat): (Vec<Morceau>, f64) = (Vec::new(), 0.0);
        for (k, bl) in blocs.iter().enumerate() {
            if k + 1 >= ret.len() {
                break;
            }
            let c_b = &bl["couplage"][net.as_str()];
            if !c_b["presente"].vrai() {
                continue;
            }
            let d_t = ret[k + 1] - ret[k];
            td_plat += d_t;
            let a_n = att(0.5 * (nb(&bl["s0"])
                                 + nb(&bl["s1"])));
            morceaux.push((_nb(&c_b["kb"], 0.0), _nb(&c_b["kf"], 0.0),
                           d_t, a_n));
        }
        // LES MORCEAUX SUPERPOSES, resolus a part : le solveur de section
        // range ses conducteurs cote a cote, celui-ci les empile.
        let sup = _superposees(couches, &fiche, &mut cache_sup, notes);
        morceaux.extend(sup.iter().map(|m| (m.0, m.1, m.2,
                                            att(0.5 * (m.4 + m.5)))));
        let long_sup = py::sum(sup.iter().map(|m| m.3));
        if fiche["superpositions"].vrai() && sup.is_empty() {
            sans_superposition.push(net.clone());
        }
        if !sup.is_empty() {
            // UNE VOISINE QUI NE FAIT QUE SE SUPERPOSER A MAINTENANT UN CHIFFRE.
            etat.non_calcule = false;
        }
        let n2 = niveau2(&morceaux, t_r, orange, rouge, att_fext);
        // LES FENTES FRANCHIES PAR LES DEUX : le terme d'impedance commune
        // s'ajoute ici, et `lignes` garde le chiffre des lignes seules.
        let aucun = Vec::new();
        let termes_f = fentes_termes.iter().find(|(n, _)| *n == net).map_or(&aucun, |(_, t)| t);
        let n2 = ajouter_fentes_niveau2(&n2, termes_f, orange, rouge);
        if !termes_f.is_empty() {
            // UNE VICTIME QUE SEULE LA FENTE COUPLE A UN CHIFFRE, ELLE AUSSI.
            etat.non_calcule = false;
        }
        let niveau = maxf(&[num(&n2, "next"), num(&n2, "fext")]);
        // LES AUTRES AGRESSEURS SELECTIONNES, et leur SOMME vers cette
        // victime : arithmetique (pire cas, en phase) ou quadratique.
        let mut par_agr = Vec::new();
        if v["role"].as_str() != Some("agresseur") {
            for net_ag in &agresseurs_sel {
                let mut m_ag: Vec<Morceau> = Vec::new();
                for (k, bl) in blocs.iter().enumerate() {
                    if k + 1 >= ret.len() {
                        break;
                    }
                    let c_a = &bl["couplage_agresseurs"][net_ag.as_str()][net.as_str()];
                    if !c_a["presente"].vrai() {
                        continue;
                    }
                    m_ag.push((_nb(&c_a["kb"], 0.0),
                               _nb(&c_a["kf"], 0.0),
                               ret[k + 1] - ret[k],
                               att(0.5 * (nb(&bl["s0"]) + nb(&bl["s1"])))));
                }
                if !m_ag.is_empty() {
                    let n_ag = niveau2(&m_ag, t_r, orange, rouge, att_fext);
                    if num(&n_ag, "next") > 0.0 || num(&n_ag, "fext") > 0.0 {
                        par_agr.push(obj! {"agresseur" => net_ag,
                                           "next" => &n_ag["next"],
                                           "fext" => &n_ag["fext"]});
                    }
                }
            }
        }
        // LA CARTE LOCALE, EN NEXT : Kb(x) . min(1, 2 T_d / t_r) -- le NEXT
        // qu'aurait la paire si tout son longement couplait comme a cet
        // endroit. Son maximum est le NEXT de la paire quand le couplage est
        // uniforme. LES SUPERPOSITIONS Y SONT, a leur abscisse : la victime
        // projetee sur l'agresseur, la ou elle passe dessous ou dessus.
        let mut kb_loc = kb.clone();
        for m in &sup {
            for (i, &x) in axe.iter().enumerate() {
                if x >= m.4 - TOL_BORNE && x <= m.5 + TOL_BORNE && !(kb_loc[i] >= m.0) {
                    kb_loc[i] = m.0;
                }
            }
        }
        let td_tout = td_plat + py::sum(sup.iter().map(|m| m.2));
        let facteur = if t_r > 0.0 { minf(&[1.0, 2.0 * td_tout / t_r]) } else { 1.0 };
        let mut local: Vec<f64> = kb_loc.iter().map(|k| k * facteur).collect();
        // LE PIC DE LA FENTE, A SON ABSCISSE : le terme d'impedance commune
        // est LOCALISE la ou le retour fait le tour, et c'est exactement ce
        // que la carte locale est faite pour montrer. Il s'ajoute au NEXT
        // local sur la plage de la fente -- au moins un echantillon.
        for t in termes_f {
            let mut dans: Vec<bool> = axe.iter().map(|&x| x >= num(t, "s0") - TOL_BORNE && x <= num(t, "s1") + TOL_BORNE).collect();
            if !dans.iter().any(|d| *d) && !axe.is_empty() {
                let milieu = 0.5 * (num(t, "s0") + num(t, "s1"));
                let mut proche = 0;
                for i in 1..axe.len() {
                    if (axe[i] - milieu).abs() < (axe[proche] - milieu).abs() {
                        proche = i;
                    }
                }
                dans[proche] = true;
            }
            for i in 0..axe.len() {
                if dans[i] {
                    local[i] += num(t, "next");
                }
            }
        }
        let local_max = if local.is_empty() { 0.0 } else { local.iter().copied().fold(f64::NEG_INFINITY, f64::max) };
        let mut couple = obj! {
            "agresseur" => &principal, "victime" => &net, "role" => &v["role"],
            "paire" => fiche["paire"].vrai(),
            "distance" => &fiche["distance"], "longement" => &fiche["longueur"],
            "type" => &fiche["type"], "cote" => &fiche["cote"],
            "nom_couche" => fiche.get("nom_couche").cloned().unwrap_or(Json::Texte(String::new())),
            "superposee" => !sup.is_empty(),
            // sum() d'une liste vide est l'ENTIER 0 de Python, et round le laisse entier
            "longueur_superposee" => if sup.is_empty() { Json::Entier(0) } else { Json::Flottant(round(long_sup, 3)) },
            "mesure_partielle" => etat.mesure_partielle,
            "longueur_non_calculee" => etat.longueur_non_calculee,
            "bloc_max" => round(bloc_max, 3),
            "non_calcule" => etat.non_calcule,
            // LA CONFIRMATION LIT LE PIRE DES DEUX NIVEAUX. Une section non
            // resolue reste confirmee, donc visible : ses zeros ne sont pas
            // des mesures.
            "confirmee" => niveau > 0.0 && (niveau >= seuil_conf
                                            || etat.mesure_partielle),
            "raison" => if etat.non_calcule { _raison_non_calcule(&etat).to_string() } else if niveau >= seuil_conf || niveau == 0.0 { String::new() } else {
                format!("NEXT et FEXT sous le seuil de confirmation de {:.1} dB.",
                        _nb(&reglages["seuil_db"], -40.0)) }};
        maj(&mut couple, n2.clone());
        poser(&mut couple, "pertes", pertes);
        if !par_agr.is_empty() {
            let mut tous = vec![obj! {"agresseur" => &principal, "next" => &n2["next"],
                                      "fext" => &n2["fext"]}];
            tous.extend(par_agr);
            let sn = somme_agresseurs(&tous.iter().map(|x| num(x, "next")).collect::<Vec<_>>(), &somme_mode);
            let sf = somme_agresseurs(&tous.iter().map(|x| num(x, "fext")).collect::<Vec<_>>(), &somme_mode);
            let (st_n, st_f) = (statut(sn, orange, rouge), statut(sf, orange, rouge));
            let st = pire_statut(&[st_n, st_f]);
            poser(&mut couple, "somme", obj! {
                "mode" => &somme_mode, "agresseurs" => tous,
                "next" => round(sn, 6), "fext" => round(sf, 6),
                "next_pc" => round(100.0 * sn, 3),
                "fext_pc" => round(100.0 * sf, 3),
                "statut_next" => st_n, "statut_fext" => st_f,
                "statut" => st});
            let pire = pire_statut(&[txt(&couple, "statut"), st]).to_string();
            poser(&mut couple, "statut", pire);
        }
        poser(&mut couple, "kb_max", &n2["kb"]);
        poser(&mut couple, "kb_max_pc", round(100.0 * num(&n2, "kb"), 3));
        poser(&mut couple, "k_total_pc", round(100.0 * num(&n2, "k_total"), 3));
        poser(&mut couple, "pire_db", round(_db(niveau), 2));
        lignes.push(obj! {
            "agresseur" => &principal, "victime" => &net, "sens" => "next",
            "confirmee" => &couple["confirmee"],
            "valeurs" => local.iter().map(|x| round(*x, 6)).collect::<Vec<f64>>(),
            "max" => round(local_max, 6),
            "max_db" => round(_db(local_max), 2),
            "max_brut" => round(local_max, 6),
            "echantillons" => local.len(),
            "localise" => true,
            "resolution" => round(res, 4)});
        poser(&mut couple, "resolution_next", round(res, 4));
        couples.push(couple);
    }

    // LE CLASSEMENT : le statut d'abord, puis le pire des deux niveaux.
    let cle = |c: &Json| (-ordre_statut(txt(c, "statut")) as f64,
                          -maxf(&[num(c, "next"), num(c, "fext")]));
    couples.sort_by(|a, b| cle(a).partial_cmp(&cle(b)).unwrap_or(std::cmp::Ordering::Equal));
    for (r, c) in couples.iter_mut().enumerate() {
        poser(c, "rang", r + 1);
    }
    let confirmees: Vec<&Json> = couples.iter().filter(|c| c["confirmee"].vrai()).collect();
    poser(base, "couples", couples.clone());
    poser(base, "victimes", confirmees.iter().map(|c| c["victime"].clone()).collect::<Vec<Json>>());
    poser(base, "statut", pire_statut(&confirmees.iter().map(|c| txt(c, "statut")).collect::<Vec<_>>()));
    poser(base, "axes", obj! {
        "next" => obj! {"lignes" => lignes.len(), "raison" => ""},
        "fext" => obj! {"lignes" => 0i64,
                        "raison" => "le bruit avant CO-PROPAGE avec l'agresseur : tout \
                                     ce qui se couple le long du longement arrive au \
                                     même instant au bout lointain, et aucune abscisse \
                                     ne le localise. Son niveau, lui, est au tableau."}});

    let lignes_conf: Vec<Json> = lignes.iter().filter(|x| x["confirmee"].vrai()).cloned().collect();
    let mut refus = Vec::new();
    let risques = zones_risque(&lignes_conf, axe, &[],
                               els(&masse["zones"]),
                               _nb(&reglages["risque"], 0.5), Some(&mut refus));
    poser(base, "risques", risques.clone());
    poser(base, "risques_refus", refus);
    let mut omises = Vec::new();
    let gestes = actions(&risques, masse, &[], &couples,
                         _nb(&reglages["risque"], 0.5),
                         base.get("blindage"), Some(&mut omises), true);
    poser(base, "actions", gestes);
    poser(base, "actions_omises", omises.first().cloned());
    let pire = lignes.iter().map(|x| num(x, "max")).reduce(|m, x| if x > m { x } else { m }).unwrap_or(0.0);
    // les espacements des victimes tracees, dans l'ordre des lignes (Python parcourait un
    // `set` : son ordre changeait d'une execution a l'autre)
    let mut esp = obj! {};
    for x in &lignes {
        if let Some(e) = espacements.get(txt(x, "victime")) {
            poser(&mut esp, txt(x, "victime"), e);
        }
    }
    poser(base, "carte_chaleur", if lignes.is_empty() { Json::Nul } else {
        obj! {"axe" => axe.iter().map(|x| round(*x, 4)).collect::<Vec<f64>>(), "lignes" => lignes,
              "max" => round(pire, 6), "zones" => &masse["zones"],
              "espacements" => esp} });

    let superposees: Vec<&Json> = couples.iter().filter(|c| c["superposee"].vrai()).collect();
    if !superposees.is_empty() {
        notes.push(format!(
            "PISTES SUPERPOSÉES résolues à part (deux rubans à leurs hauteurs, \
             entre les plans qui encadrent la paire, milieu homogène : Kf \
             nul) : {}. Leur couplage entre dans le NEXT et le k_total de la \
             paire, et sur la carte locale à l'abscisse où elles passent sous \
             ou sur l'agresseur.",
            superposees.iter().map(|c| format!("« {} » sur {} mm", str_py(&c["victime"]),
                                               f(&c["longueur_superposee"], 2))).collect::<Vec<_>>().join(", ")));
    }
    if !sans_superposition.is_empty() {
        let lesquelles = guillemets(&sans_superposition, ", ");
        _grave(
            avert, graves,
            format!("superposition non résolue ({lesquelles})"),
            format!("SUPERPOSITION NON RÉSOLUE pour {lesquelles} : aucun plan de référence ne \
                     l'encadre, ou le solveur l'a refusée. Ce que la superposition \
                     ajoute manque au niveau rendu, qui est donc un PLANCHER — et \
                     deux pistes superposées couplent souvent plus que les mêmes \
                     côte à côte."));
    }
    if couples.iter().any(|c| c["mesure_partielle"].vrai()) {
        _grave(
            avert, graves,
            "section non résolue sur une partie du longement : les zéros n'y \
             sont pas des mesures",
            format!("SECTION DROITE NON RÉSOLUE sur une partie du parcours pour {} : \
                     [C] et [L] y restent diagonales, Kb y vaut exactement zéro, et \
                     ce zéro-là n'est pas une mesure de découplage — c'est une \
                     absence de mesure. Le niveau est donc tiré vers le bas \
                     précisément là où il manque du plan de référence, c'est-à-dire \
                     là où le couplage réel est le plus fort.",
                    guillemets(couples.iter().filter(|c| c["mesure_partielle"].vrai()).map(|c| str_py(&c["victime"])), ", ")));
    }
}

/// Sous quelles hypotheses le chiffre a ete obtenu. Toujours rendues.
///
/// LE BLOC DE CLOTURE FERME LA LISTE : les manques sont dits chacun a
/// l'endroit ou il se produit, et personne ne les lit tous. Le dernier les
/// RASSEMBLE et donne leur SENS -- de quel cote penche ce qui reste dehors.
pub fn _hypotheses(reglages: &Json, masse: &Json, seuils: &Json, base: &Json) -> Vec<String> {
    // LE FRONT IMPOSE PAR LA CLASSE RF OUVRE LA LISTE : c'est l'hypothese qui
    // pese le plus sur le chiffre, et celle que l'utilisateur n'a pas choisie.
    let fi = &base["front_impose"];
    let mut h = Vec::new();
    if fi.vrai() && nul(&fi["porteuse_rf"]) {
        h.push(format!(
            "FRONT IMPOSÉ PAR LA CLASSE RF : t_r = {} n'a PAS été saisi, il \
             vient de la classe « RF » de l'agresseur (le front le plus raide \
             de la table des classes). Le FEXT varie comme 1/t_r et le NEXT \
             non saturé aussi : saisissez le front réel du signal, ou réglez \
             une porteuse RF (t_r = 0,35 / f) dans le panneau de \
             vérification, pour affiner.", _texte_duree(_nb(&fi["t_r"],
                                                            TR_DEFAUT))));
    } else if fi.vrai() {
        h.push(format!(
            "FRONT DÉDUIT DE LA PORTEUSE RF : aucun front saisi, l'agresseur \
             est de classe RF et la porteuse du panneau vaut {}, donc \
             t_r = 0,35 / f = {}.", _texte_frequence(num(fi, "porteuse_rf")),
            _texte_duree(_nb(&fi["t_r"],
                             TR_DEFAUT))));
    }
    h.extend([
        format!("NIVEAU 2, SCAN NORMALISÉ : l'agresseur fait un échelon UNITAIRE (1 V, \
                 100 %), sous un front t_r = {} ({}), et les lignes sont supposées \
                 ADAPTÉES à leurs deux bouts sur leur Z0 — on évalue le couplage \
                 direct, sans allers-retours de réflexions. Tout chiffre de la fiche \
                 est donc une fraction de l'amplitude de l'agresseur, en % ou en dB, \
                 quelle que soit sa tension réelle.",
                _texte_duree(_nb(&base["t_r"], TR_DEFAUT)),
                if base["source_tr"].vrai() { str_py(&base["source_tr"]) } else { "front de référence".to_string() }),
        "LES FORMULES : k_total = ½ (Cm/C11 + Lm/L11), Kb = k_total / 2, \
         Kf = ½ (Lm/L11 − Cm/C11), avec C11 la diagonale de Maxwell (capacité \
         totale) et [C], [L] résolues par la méthode des moments sur la coupe \
         de chaque bloc. NEXT = Kb si 2·T_d ≥ t_r (saturé), Kb·2·T_d / t_r \
         sinon ; FEXT = |Kf|·T_d / t_r, plafonné à 50 %. T_d est le retard de la victime le \
         long du COUPLAGE, sommé bloc par bloc avec v = c0/√ε_eff : un \
         longement dont l'écart varie est compté morceau par morceau, et la \
         saturation se lit sur le plus fort des Kb.".to_string(),
        format!("LE STATUT DRC compare chaque niveau aux seuils : vert sous {:.1} %, \
                 orange jusqu'à {:.1} %, rouge au-delà. Le NEXT et le FEXT ont \
                 chacun le leur ; celui de la paire est le pire des deux.",
                100.0 * num(reglages, "seuil_orange"), 100.0 * num(reglages, "seuil_rouge")),
        "LA PRÉSÉLECTION GÉOMÉTRIQUE (étape 0a) et la CONFIRMATION (étape 0b) \
         sont deux étapes distinctes, et le tableau les montre toutes les \
         deux. Une piste absente du résultat est soit LOIN (écartée en 0a, \
         avec sa distance), soit PROCHE ET DÉCOUPLÉE (écartée en 0b, avec son \
         niveau) : ce sont deux situations de dessin opposées.".to_string(),
        format!("Le seuil de distance de l'étape 0a vaut {:.3} mm, {} ; l'ÉGALITÉ est \
                 retenue, et {} % au-dessus aussi (les arrondis d'export) ; une \
                 voisine écartée à moins de {} × le seuil est nommée, avec son écart. \
                 La longueur de parallélisme minimale est {}. Les deux MAJORENT \
                 volontairement.",
                numd(seuils, "distance_max", 0.0), txt(seuils, "source"),
                fmt_g(100.0 * TOLERANCE_SEUIL, 6), fmt_g(PRESELECTION_PROCHE, 6),
                txt(seuils, "longueur_min_source")),
        format!("Le seuil de confirmation est de {:.1} dB, sur le pire du NEXT et du \
                 FEXT. Une piste sous ce niveau reste au tableau, avec son niveau : \
                 elle est écartée du verdict et de la carte, pas du résultat.",
                _nb(&reglages["seuil_db"], -40.0)),
        format!("Les couches ADJACENTES {} dans la présélection. Deux pistes \
                 superposées sans plan entre elles sont RÉSOLUES à part — deux \
                 rubans à leurs hauteurs entre les plans qui encadrent la paire, \
                 milieu homogène, donc Kf nul — et comptées dans le NEXT ; celles \
                 qu'un plan sépare sont écartées, le plan étant un écran.",
                if seuils["couches_adjacentes"].vrai() { "entrent" } else { "N'ENTRENT PAS" }),
        "LA CARTE LOCALE porte Kb(x)·min(1, 2·T_d/t_r) : le NEXT qu'aurait la \
         paire si tout son longement couplait comme à cet endroit. Son \
         maximum est le NEXT de la paire quand le couplage est uniforme ; elle \
         dit OÙ le NEXT se fabrique. Le FEXT n'a pas de carte : il \
         co-propage avec l'agresseur et tout arrive au même instant.".to_string(),
        format!("Le contrôle du plan de masse est INDÉPENDANT du calcul de couplage : \
                 le blindage d'un plan continu et de ses vias est déjà dans [C] et \
                 [L]. Le seuil de couture retenu est {:.2} mm, tiré de {}{}.",
                numd(masse, "seuil", 0.0), txt(masse, "source"),
                if masse["mesure"].vrai() {
                    format!(" ; ce qui a pu être examiné : {}", els(&masse["mesure"]).iter().map(str_py).collect::<Vec<_>>().join(", "))
                } else { " ; RIEN n'a pu être examiné".to_string() }),
        "LE CUIVRE DE MASSE N'EST DANS LA SECTION QUE S'IL EST COUSU : une \
         piste de garde ou un plan arrosé dont la couture dépasse le seuil \
         est posé FLOTTANT, ou son effet coplanaire annulé, plutôt que de \
         faire cadeau d'une masse idéale à 0 V.".to_string(),
        "CE QUE CE NIVEAU NE COUVRE PAS, rassemblé — et dans quel sens : \
         (0) une superposition est placée sur la carte locale par la \
         projection de la victime sur l'agresseur, à la précision du \
         tronçon ; \
         (1) les lignes sont supposées adaptées : une ligne désadaptée \
         renvoie une part du bruit vers l'autre bout → les deux niveaux \
         peuvent y être dépassés ; (2) le modèle de couplage faible ignore \
         la dispersion, les pertes, les coudes et les vias → un ordre de \
         grandeur fidèle, pas une forme d'onde ; (3) le PLAN DE RETOUR EST \
         SUPPOSÉ CONTINU sous les deux pistes dans [C] et [L] : une fente \
         que la page envoie avec l'image des plans ajoute le terme \
         d'impédance commune du retour RÉSOLU (PEEC), plan intact dessous et \
         vias compris ; sans image, celui d'Ott si tous les plans sont \
         coupés ; une fente sans détour ni image, ou qu'un plan referme \
         encore dessous sans image, n'ajoute rien → OPTIMISTE là ; (4) les contrôles de plan de masse ne voient \
         que ce que la page envoie → OPTIMISTE sur une carte muette sur sa \
         couture ; (5) plusieurs agresseurs d'une même victime ne sont pas \
         additionnés ici, la vérification de carte les somme au pire en \
         phase. Sur une carte mal cousue ou mal référencée, ce qui est \
         affiché est donc un PLANCHER.".to_string(),
    ]);
    let modele = |m: &str| els(&base["couples"]).iter().any(|c| c["fente"]["modele"].as_str() == Some(m));
    if modele("B") {
        h.insert(h.len() - 1,
                 "LE RETOUR RÉSOLU AUTOUR D'UNE FENTE (PEEC) : l'image des \
                  plans que la page envoie est maillée (fin près des pistes et \
                  des bords, large au loin) ; chaque maille porte un courant, \
                  selfs et mutuelles partielles de rubans minces, capacité entre \
                  plans en regard, onde de la cavité qui s'en va au bord de la \
                  fenêtre, vias de masse en branches verticales ; l'agresseur et \
                  la victime sont pris dans leur cuivre. Résolu au genou \
                  0,35/t_r, deux fois — le cuivre réel, les plans pleins — : la \
                  différence donne la self du détour L_d et la mutuelle M, qui \
                  entrent dans la même formule que celle d'Ott (+M/(2·Z0·t_r) \
                  en NEXT, −M/(2·Z0·t_r) en FEXT, lissée par τ = L_d/2Z0). La \
                  FOURCHETTE encadre ce chiffre et celui d'Ott quand Ott \
                  s'applique (tous les plans coupés). Limites : quasi statique, \
                  cavité sans fin hors de la fenêtre, finesse du maillage.".to_string());
    }
    if modele("A") {
        h.insert(h.len() - 1,
                 format!("L'IMPÉDANCE COMMUNE D'UNE FENTE (Ott) : chaque détour d du \
                          courant de retour est une self L_d = μ0/π·2d·ln(2d/W), la \
                          mutuelle M a la même forme avec l'entraxe S des deux pistes \
                          au franchissement, les deux détours sont en parallèle ; la \
                          f.é.m. M·dI/dt se partage entre les deux bouts adaptés de la \
                          victime : +M/(2·Z0·t_r) en NEXT, −M/(2·Z0·t_r) en FEXT, \
                          lissée par τ = L_d/2Z0 (le terme ne dépasse pas M/L_d). \
                          FOURCHETTE : M basse avec l'entraxe compté depuis le bord \
                          d'un retour étalé sur W + 2H, M haute = L_d (les deux \
                          retours confondus). RÉSONANCE : tan(βd)/βd au genou \
                          0,35/t_r, Q ≈ {FENTE_Q:.0}, qui ne pèse que sous ~300 ps. Le terme \
                          s'AJOUTE en module au couplage des lignes (plus fort des \
                          termes en NEXT, somme en FEXT) ; `lignes` garde le chiffre \
                          des lignes seules. Validité : fente droite, franchie à peu \
                          près perpendiculairement, tous les plans de retour coupés."));
    }
    h
}

/// Une ligne par analyse, comme `simulation_em.simuler`.
pub fn _journaliser(journal: Option<&mut dyn FnMut(&str)>, base: &Json) {
    let Some(journal) = journal else { return };
    let confirmees = els(&base["couples"]).iter().filter(|c| c["confirmee"].vrai()).count();
    journal(&format!("  crosstalk « {} » : {} candidat(s), {} victime(s) confirmee(s) \
                      sur {:.1} mm, t_r {}, statut {}, {} avertissement(s)\n",
                     base.get("principal").map_or("?".to_string(), str_py),
                     els(&base["etape0"]["candidats"]).len(), confirmees,
                     numd(base, "longueur", 0.0),
                     _texte_duree(_nb(&base["t_r"], TR_DEFAUT)),
                     base.get("statut").map_or("vert".to_string(), str_py),
                     els(&base["avertissements"]).len()));
}
