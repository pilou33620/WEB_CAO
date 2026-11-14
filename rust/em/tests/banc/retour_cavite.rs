//! Le retour par la cavite, la boucle et son rayonnement (cas de banc-ligne-mom.py).

use crate::*;
use crate::empilage_vias::*;
use crate::moignons_cavite::*;

/// TOP / L1 (GND) / L2 / BOT : l'empilage des cas de cavite, le coeur et le net de L2 au choix.
fn pile(coeur: f64, net_l2: &str) -> Vec<Json> {
    vec![_cu("TOP", "signal"), _di("PP", 0.200, 4.30),
         avec(&_cu("L1", "plane"), &[("net", "GND".j())]), _di("CORE", coeur, 4.50),
         avec(&_cu("L2", "plane"), &[("net", net_l2.j())]), _di("PP2", 0.200, 4.30),
         _cu("BOT", "signal")]
}

/// `d["analyse"]["f_debut"] = f_debut ; d["f_fondamentale"], d["temps_montee"] = f0, tr`
fn signal(d: &mut Json, f_debut: Option<f64>, f0: f64, tr: f64) {
    if let Some(f) = f_debut {
        poser(dans(d, "analyse"), "f_debut", f);
    }
    poser(d, "f_fondamentale", f0);
    poser(d, "temps_montee", tr);
}

fn pont(x: f64, y: f64, repere: &str, capacite: f64) -> Json {
    obj! {"x" => x, "y" => y, "repere" => repere, "capacite_F" => capacite}
}

/// UN CHEMIN QUI EXISTE N'EST PAS UN CHEMIN BENIN.
///
/// Bogatin 7.14 a raison : le retour change de plan par la capacite repartie
/// de la paire de plans, en courant de deplacement, et refuser de le chiffrer
/// declarait impossible ce qui se produit sur toute carte multicouche.
///
/// MAIS CE COURANT-LA N'ENTRE PAS DANS UN CONDUCTEUR, IL ENTRE DANS LA CAVITE :
/// il s'y propage jusqu'aux bords de la carte, y rayonne, et revient en bruit
/// sur le reseau d'alimentation. RIEN DE CELA NE SE VOIT SUR S21 -- le signal,
/// lui, passe. La fiche pouvait donc annoncer « traversee 0,09 ohm, front
/// intact » sur une transition qui injecte l'essentiel de son retour dans le
/// plan d'alimentation.
fn le_retour_par_la_cavite_est_nomme_comme_un_defaut() {
    let _stack = pile(1.065, "PWR");

    let _r = |f0: f64, tr: f64| {
        let dist_pont = 8.0;
        let mut via = _via_moignon_p(Some((0, 6)), Some(vec![pont(10.0 + dist_pont, 0.0, "C9", 100e-9)]),
                                     &[], Some(10.0));
        poser(&mut via, "aire_plans_mm2", 2000.0);
        poser(&mut via, "er_plans", 4.50);
        poser(&mut via, "aire_plans_majoree", true);
        let mut d = _doc_moignon_f(&_stack, 0, 6, &via, f0, 3e9);
        signal(&mut d, Some(10e6), f0, tr);
        sim(&d)
    };

    // 1. SIGNAL LENT : le decouplage travaille, la cavite ne prend rien, et on
    //    ne dit rien -- un avertissement qui sort sur le cas ordinaire cesse
    //    d'etre lu.
    let lent = _r(10e6, 35e-9);
    let cav = &tr0(&lent)["cavite"];
    assert!(n(&cav["part_cavite"]) < 0.05,
            "a 10 MHz un 100 nF doit tout porter ({:.3} par la cavite)", n(&cav["part_cavite"]));
    assert!(!avertis(&lent).iter().any(|a| a.contains("CAPACITÉ RÉPARTIE")),
            "rien a dire quand le decouplage fait son travail");

    // 2. SIGNAL RAPIDE : l'ESL du condensateur bloque, la cavite prend le
    //    dessus, et cela DOIT se dire -- avec ce que ce courant fait vraiment.
    let vite = _r(600e6, 0.2e-9);
    let cav2 = &tr0(&vite)["cavite"];
    assert!(n(&cav2["part_cavite"]) > 0.50,
            "a 600 MHz la cavite doit prendre le dessus ({:.3})", n(&cav2["part_cavite"]));
    let msg: Vec<String> = avertis(&vite).into_iter().filter(|a| a.contains("CAPACITÉ RÉPARTIE")).collect();
    assert!(!msg.is_empty(), "le retour par la cavite doit etre nomme");
    for mot in ["bruit", "alimentation", "S21"] {
        assert!(msg[0].contains(mot),
                "le message doit dire ce que ce courant fait vraiment (« {} ») : {}", mot, msg[0]);
    }

    // 3. ANTIRESONANCE : au-dela de cent pour cent ce n'est plus un partage,
    //    c'est du courant qui CIRCULE. « 111 % passe par la cavite » serait
    //    absurde ; c'est le phenomene qu'il faut nommer.
    let anti = _r(200e6, 0.5e-9);
    let cav3 = &tr0(&anti)["cavite"];
    assert!(n(&cav3["part_cavite"]) > 1.0,
            "le cas de test doit tomber sur l'antiresonance ({:.3})", n(&cav3["part_cavite"]));
    let m3: Vec<String> = avertis(&anti).into_iter().filter(|a| a.contains("ANTIRÉSONANCE")).collect();
    assert!(!m3.is_empty(), "l'antiresonance doit etre nommee plutot que rendue en pourcents");
    assert!(m3[0].contains("CIRCULE"), "le courant circulant doit etre dit");
    // ET LES AVERTISSEMENTS SUIVANTS SURVIVENT : le message de l'antiresonance
    // ne doit pas court-circuiter la suite de la liste.
    assert!(avertis(&anti).iter().any(|a| a.contains("rayonne") || a.contains("CISPR")),
            "le rayonnement doit encore etre evalue apres le message d'antiresonance");
}

/// « CENT POUR CENT PAR LA CAVITE » NE VEUT RIEN DIRE SANS CAVITE MODELISEE.
///
/// Quand la page ne cherche pas les decouplages, la branche capacitive de la
/// cavite n'existe pas dans le modele -- `c_plans` vaut zero et il ne reste
/// qu'un etalement en serie. Le partage rendait alors 100 %, et la fiche
/// allait ecrire « tout le retour passe par la capacite repartie des plans » :
/// c'est faux, on n'a simplement pas regarde. Deux enonces differents, et
/// celui-la est un enonce sur la CARTE la ou on n'a qu'une limite de l'OUTIL.
fn une_cavite_non_sondee_n_invente_pas_de_part() {
    let stack = pile(1.065, "PWR");
    // Pas de `ponts` du tout : la page ne cherche pas.
    let mut d = _doc_moignon_f(&stack, 0, 6, &_via_moignon(0, 6), 10e6, 1e9);
    signal(&mut d, Some(1e6), 10e6, 35e-9);
    let r = sim(&d);
    let cav = &tr0(&r)["cavite"];

    assert!(cav["etalement_seul"] == Json::Bool(true), "le cas non sonde doit etre nomme");
    assert!(nul(&cav["part_cavite"]),
            "sans branche capacitive, la part de cavite ne doit pas s'inventer ({})", dumps(&cav["part_cavite"]));
    assert!(!avertis(&r).iter().any(|a| a.contains("CAPACITÉ RÉPARTIE")),
            "on ne doit pas affirmer un chemin qu'on n'a pas cherche");
    // Mais la SOUS-ESTIMATION, elle, se dit.
    assert!(avertis(&r).iter().any(|a| a.contains("SOUS-ESTIMÉE")),
            "la traversee sous-estimee doit etre annoncee");
}

/// UNE APPROXIMATION QUI FLATTE DOIT SE LIRE.
///
/// La page envoie l'aire de la CARTE ENTIERE, jamais celle des deux versements
/// en regard : mesurer l'intersection de deux jeux de polygones a trous n'en
/// vaut pas encore la peine. Une aire majoree donne une capacite majoree, donc
/// une cavite qui parait MOINS chere a traverser qu'elle ne l'est.
///
/// LE CHAMP ARRIVAIT ET N'ETAIT PAS LU. La fiche disait « aire supposee »
/// quand elle venait du repli -- et ne disait RIEN quand elle venait de la
/// page, c'est-a-dire justement quand elle majore.
fn l_aire_des_plans_majoree_se_dit() {
    let _stack = pile(1.065, "PWR");

    let _cav = |majoree: bool| {
        let mut via = _via_moignon_p(Some((0, 6)), Some(vec![pont(12.0, 0.0, "C12", 100e-9)]), &[], Some(10.0));
        poser(&mut via, "aire_plans_mm2", 2000.0);
        poser(&mut via, "er_plans", 4.50);
        if majoree {
            poser(&mut via, "aire_plans_majoree", true);
        }
        let mut d = _doc_moignon_f(&_stack, 0, 6, &via, 12e6, 100e6);
        signal(&mut d, Some(1e6), 12e6, 13e-9);
        let r = sim(&d);
        (tr0(&r)["cavite"].clone(), avertis(&r))
    };

    let (cav_maj, av_maj) = _cav(true);
    let (cav_non, av_non) = _cav(false);

    assert!(cav_maj["aire_majoree"] == Json::Bool(true), "le champ de la page doit etre lu");
    assert!(cav_non["aire_majoree"] == Json::Bool(false), "et ne pas s'inventer");
    assert!(av_maj.iter().any(|a| a.contains("majorée")),
            "une aire majoree doit se dire dans l'avertissement");
    assert!(!av_non.iter().any(|a| a.contains("majorée")),
            "une aire non declaree majoree ne doit pas porter la reserve");
}

/// PAS DE CUIVRE = PAS DE REFERENCE, ET CE N'EST PAS LE MEME DEFAUT.
///
/// Entre deux versements d'alimentation, dans une decoupe, au bord d'un
/// degagement : le plan de reference n'a AUCUN cuivre au droit du via. Le net
/// de la couche sert alors de repli, et l'outil annoncait « la reference change
/// vers +3V3 » -- une phrase plausible et FAUSSE, puisque ce +3V3 n'est pas la.
///
/// C'EST UN DEFAUT D'UN AUTRE ORDRE, ET PLUS GRAVE : le courant de retour n'a
/// rien a suivre, et aucun condensateur de pontage ne rattrape une reference
/// ABSENTE. Il passe donc AVANT le message de changement de reference, et il le
/// remplace.
fn une_reference_absente_ne_se_dit_pas_comme_une_reference_qui_change() {
    let stack = pile(0.710, "+3V3");
    let mut via = _via_moignon_p(Some((0, 6)), None, &[_retour_via(10.7, 0.0)], None);
    poser(&mut via, "plans_sans_cuivre", vec!["L2"]);
    let mut d = _doc_moignon_f(&stack, 0, 6, &via, 10e6, 1e9);
    signal(&mut d, Some(1e6), 10e6, 35e-9);
    let r = sim(&d);
    let tr = tr0(&r);

    assert!(tr["retour"]["plans_sans_cuivre"] == vec!["L2"].j(),
            "la mesure de la page doit remonter : {}", dumps(&tr["retour"]["plans_sans_cuivre"]));
    let msg: Vec<String> = avertis(&r).into_iter().filter(|a| a.contains("AUCUN CUIVRE")).collect();
    assert!(!msg.is_empty(), "une reference absente doit etre nommee");
    for mot in ["ABSENTE", "repli", "aucun condensateur"] {
        assert!(msg[0].contains(mot), "le message doit dire « {} » : {}", mot, msg[0]);
    }

    // ON NE RETIENT QUE DES PLANS QUI SONT BIEN DES REFERENCES ICI. Une page qui
    // annoncerait une couche hors sujet ne doit pas faire sortir le message.
    let mut via2 = _via_moignon_p(Some((0, 6)), None, &[_retour_via(10.7, 0.0)], None);
    poser(&mut via2, "plans_sans_cuivre", vec!["UNE_COUCHE_QUI_NE_REFERENCE_RIEN"]);
    let mut d2 = _doc_moignon_f(&stack, 0, 6, &via2, 10e6, 1e9);
    signal(&mut d2, Some(1e6), 10e6, 35e-9);
    let r2 = sim(&d2);
    assert!(!tr0(&r2)["retour"]["plans_sans_cuivre"].vrai(),
            "un plan qui n'est pas une reference de CE via ne compte pas");
    assert!(!avertis(&r2).iter().any(|a| a.contains("AUCUN CUIVRE")),
            "et rien ne doit sortir");
}

/// UN PLAN N'EST PAS D'UN SEUL NET, ET LE SUPPOSER ETAIT LE DEFAUT DE FOND.
///
/// L'empilage attribue un net a la COUCHE. Or une couche de plan est
/// PARTITIONNEE : un ilot d'alimentation de quelques millimetres carres, et
/// tout le reste en masse. Le net de la couche vaut alors « PWR », et il
/// s'appliquait a la couche ENTIERE.
///
/// CE QUE CELA FAISAIT DIRE. Un via de signal qui plonge la ou le plan est de
/// la MASSE sortait « la reference change de net, aucun via de masse ne peut
/// refermer » -- alors que les vias de masse autour referment parfaitement. On
/// criait au defaut grave sur un routage correct, et on ecartait dix vias de
/// retour qui travaillent.
///
/// SEULE LA PAGE A LA GEOMETRIE DU CUIVRE. Elle mesure le net AU DROIT DU VIA
/// et l'envoie ; le serveur le prefere partout ou elle parle, et retombe sur le
/// net de la couche la ou elle se tait.
fn le_net_mesure_par_la_page_prime_sur_celui_de_la_couche() {
    let stack = pile(0.710, "PWR");

    let lance = |via: &Json| {
        let mut d = _doc_moignon_f(&stack, 0, 6, via, 10e6, 1e9);
        signal(&mut d, Some(1e6), 10e6, 35e-9);
        tr0(&sim(&d)).clone()
    };
    let _r = |plans_nets: Option<Json>, joints: Option<Json>| {
        let mut ret = _retour_via(10.7, 0.0);
        if let Some(joints) = joints {
            poser(&mut ret, "plans_joints", joints);
        }
        let mut via = _via_moignon_p(Some((0, 6)), None, &[ret], None);
        if let Some(pn) = plans_nets {
            poser(&mut via, "plans_nets", pn);
        }
        lance(&via)
    };

    // 1. SANS MESURE : le net de la couche, et le verdict grave.
    let tr = _r(None, None);
    assert!(tr["retour"]["nets_differents"] == Json::Bool(true), "l'empilage dit GND puis PWR");
    assert!(n(&tr["retour"]["retenus"]) == 0.0, "aucun via ne peut joindre GND a PWR");

    // 2. AVEC LA MESURE : ici L2 est de la MASSE, la reference ne change pas de
    //    net, et le via de masse referme.
    let t2 = _r(Some(j(r#"{"L1": "GND", "L2": "GND"}"#)),
                Some(vec!["L1", "L2"].j()));
    assert!(t2["retour"]["nets_differents"] == Json::Bool(false),
            "mesure sur place : les deux plans sont de la masse");
    assert!(t2["retour"]["reference_change"] == Json::Bool(false), "il n'y a plus de defaut");
    assert!(n(&t2["retour"]["retenus"]) == 1.0,
            "le via de masse referme la boucle ({} retenus)", n(&t2["retour"]["retenus"]));
    assert!(t(&t2["modelise"]["inductance_source"]) == "boucle",
            "l'inductance devient une MESURE : {}", t(&t2["modelise"]["inductance_source"]));
    assert!(nul(&t2["cavite"]), "sans changement de net, pas de cavite");

    // 3. UNE MESURE PARTIELLE NE VAUT QUE POUR CE QU'ELLE DIT. Le plan que la
    //    page n'a pas su mesurer garde le net de la couche.
    let t3 = _r(Some(j(r#"{"L1": "GND"}"#)), None);
    assert!(t3["retour"]["nets_arrivee"] == vec!["PWR"].j(),
            "sans mesure sur L2, on retombe sur le net de la couche : {}", dumps(&t3["retour"]["nets_arrivee"]));

    // 4. LA PORTEE RESTE LE MOT DU SERVEUR. La page suppose les vias
    //    traversants ; elle ne peut pas declarer qu'un via touche un plan HORS
    //    de son percage, et `plans_joints` ne doit pas le lui permettre.
    let mut ret = _retour_via_p(10.7, 0.0, "GND", 0, 2, 0.25); // borgne : TOP -> L1
    poser(&mut ret, "plans_joints", vec!["L1", "L2"]); // la page en annonce deux
    let mut via = _via_moignon_p(Some((0, 6)), None, &[ret], None);
    poser(&mut via, "plans_nets", j(r#"{"L1": "GND", "L2": "GND"}"#));
    let t4 = lance(&via);
    let f = &t4["retour"]["vias"][0];
    assert!(!f["retenu"].vrai(), "un via borgne ne referme pas la hauteur");
    assert!(!els(&f["plans"]).contains(&"L2".j()),
            "un via perce de TOP a L1 ne touche pas L2, quoi qu'en dise la page : {}", dumps(&f["plans"]));
}

/// LE MEME PLAN N'EST PAS LE MEME CUIVRE, et c'etait le dernier endroit ou
/// l'hypothese « un net par couche » survivait.
///
/// LE CAS, ET IL VIENT D'UNE CARTE REELLE. Un via de signal plonge DANS un
/// ilot d'alimentation de L2 ; des vias de masse a un millimetre touchent L2
/// aussi -- mais HORS de l'ilot, sur la masse qui l'entoure. `plans_joints`
/// rend des NOMS DE COUCHE : « touche L2 » est vrai des deux cotes d'une
/// frontiere qui les separe electriquement.
///
/// CE QUE CELA DONNAIT, ET C'EST LE SENS QUI FLATTE. Les noms concordaient,
/// les vias etaient retenus, `raccorde` passait a vrai -- et l'inductance
/// sortait comme une MESURE de boucle. Elle cumulait meme la cavite
/// (« boucle+cavite »), donc le meme retour compte deux fois par deux chemins
/// dont un n'existe pas. Et le verdict CRITIQUE etait masque, puisqu'il exige
/// `not raccorde` : la fiche annoncait « les 2 vias ont un retour identifie »
/// sur le defaut meme qu'on cherchait a voir.
///
/// LA PREUVE EST LOCALE ET DISPONIBLE : la page a mesure le net sous le via de
/// SIGNAL, on connait celui du via de masse. Quand les deux sont lus et qu'ils
/// DIFFERENT, il est demontre que ce via touche un autre versement.
fn un_via_de_masse_sur_un_autre_versement_ne_referme_rien() {
    let stack = pile(0.710, "GND");

    // (le resultat entier, dont la premiere transition se lit par `tr0`)
    let _t = |plans_nets: &str| {
        let mut ret = _retour_via(10.7, 0.0);
        poser(&mut ret, "plans_joints", vec!["L1", "L2"]); // le via de masse touche les deux
        let mut via = _via_moignon_p(Some((0, 6)), None, &[ret], None);
        poser(&mut via, "plans_nets", j(plans_nets));
        let mut d = _doc_moignon_f(&stack, 0, 6, &via, 10e6, 1e9);
        signal(&mut d, Some(1e6), 10e6, 35e-9);
        sim(&d)
    };

    // 1. HORS DE L'ILOT : les deux plans sont de la masse SOUS LE VIA DE SIGNAL,
    //    le via de masse touche la meme masse, il referme. Cas ordinaire.
    let bon_r = _t(r#"{"L1": "GND", "L2": "GND"}"#);
    let bon = tr0(&bon_r);
    assert!(n(&bon["retour"]["retenus"]) == 1.0,
            "sur la masse, le via referme : {}", n(&bon["retour"]["retenus"]));
    assert!(t(&bon["modelise"]["inductance_source"]) == "boucle");

    // 2. DANS L'ILOT : sous le via de signal, L2 porte +3V3. Le via de masse
    //    touche L2, mais pas CE cuivre-la. Il ne porte pas ce retour.
    let mal_r = _t(r#"{"L1": "GND", "L2": "+3V3"}"#);
    let mal = tr0(&mal_r);
    let f = &mal["retour"]["vias"][0];
    assert!(!f["retenu"].vrai(), "un via de masse ne porte pas le retour d'un ilot");
    assert!(f["plans_autre_versement"] == vec!["L2"].j(),
            "le plan croise doit etre nomme : {}", dumps(&f["plans_autre_versement"]));
    // LA RAISON PORTEE PAR LE VIA EST COURTE, parce qu'elle se peint sur le
    // cuivre : la visionneuse la met telle quelle dans le cartouche du chevelu,
    // et une phrase de cent caracteres y est illisible. Meme libelle que
    // l'editeur, mot pour mot.
    assert!(t(&f["raison"]) == "L2 : autre versement (+3V3 ici)",
            "libelle de canvas, court et identique a celui de l'editeur : {}", t(&f["raison"]));
    assert!(n(&mal["retour"]["retenus"]) == 0.0);
    assert!(mal["retour"]["raccorde"] == Json::Bool(false),
            "raccorde faux, sinon le verdict critique reste masque");
    assert!(!t(&mal["modelise"]["inductance_source"]).contains("boucle"),
            "sans retour retenu, l'inductance est un PLANCHER, pas une mesure : {}",
            t(&mal["modelise"]["inductance_source"]));

    // 3. ET LE CHIFFRE AFFICHE BAISSE -- c'est tout le probleme, et c'est
    //    pourquoi l'ETIQUETTE est la seule protection. La self partielle du
    //    barreau seul (0,52 nH ici) est PLUS PETITE que la boucle refermee par
    //    un via lointain (0,67 nH) : L_boucle = L_self + L_retour - 2M, et un
    //    retour a dix millimetres ne se mutualise presque pas. Un lecteur qui
    //    ne verrait que le nombre conclurait que l'ilot est meilleur que la
    //    masse. La fiche doit donc porter le mot, a la lettre.
    assert!(n(&mal["modelise"]["inductance_nH"]) < n(&bon["modelise"]["inductance_nH"]),
            "cas connu : le plancher est plus BAS que la boucle -- si cela change,\
             \x20le raisonnement de ce test doit etre revu");
    assert!(t(&mal["retour"]["raison"]).contains("PLANCHER"),
            "le nombre baisse : sans le mot, il se lit comme une amelioration\
             \x20({})", t(&mal["retour"]["raison"]));
    assert!(mal["retour"]["reference_change"] == Json::Bool(true),
            "les nets differents sous le via de signal, c'est le defaut grave");

    // 4. ET LE GESTE QUI REPARE EST DIT UNE FOIS, LONGUEMENT, dans les
    //    avertissements -- pas dix fois sur la carte. Il n'envoie pas chercher
    //    un percage trop court : il envoie regarder la DECOUPE du plan.
    let msg: Vec<String> = avertis(&mal_r).into_iter().filter(|a| a.contains("MÊME CUIVRE")).collect();
    assert!(!msg.is_empty(), "le croisement de versement doit etre explique une fois");
    for mot in ["partitionné", "le cuivre ne l'est pas", "PLANCHER",
                "pas d'ajouter un via"] {
        assert!(msg[0].contains(mot), "il manque « {} » : {}", mot, msg[0]);
    }

    // 5. QUAND LA PAGE SE TAIT, ON NE DEMONTRE RIEN et on garde le via : mieux
    //    vaut une reserve dite qu'un refus invente.
    let muet_r = _t(r#"{"L1": "GND"}"#);
    assert!(tr0(&muet_r)["retour"]["vias"][0]["retenu"].vrai(),
            "sans mesure sur L2, rien ne prouve que le versement differe");
}

/// CE QUE LE CHEVELU DOIT POUVOIR PEINDRE : un trait par pont, et sa part.
///
/// Un via de retour porte sa part du courant depuis toujours et le dessin
/// l'ecrit ; un condensateur de pontage n'en portait aucune -- on n'en montrait
/// qu'un, sans dire ce qu'il vaut. « Lequel travaille » est exactement la
/// question qu'on se pose devant trois decouplages autour d'une transition.
fn la_fiche_de_cavite_porte_chaque_pont_et_sa_part() {
    let stack = pile(1.065, "PWR");
    let mut via = _via_moignon_p(Some((0, 6)),
                                 Some(vec![pont(12.0, 0.0, "C12", 100e-9),
                                           pont(10.0, 4.0, "C13", 100e-9),
                                           pont(3.0, 0.0, "C14", 1e-9)]),
                                 &[_retour_via(10.7, 0.0)],
                                 Some(10.0));
    poser(&mut via, "aire_plans_mm2", 2000.0);
    poser(&mut via, "er_plans", 4.50);
    let mut d = _doc_moignon_f(&stack, 0, 6, &via, 12e6, 100e6);
    signal(&mut d, Some(1e6), 12e6, 13e-9);

    let r = sim(&d);
    let cav = &tr0(&r)["cavite"];

    let detail = els(&cav["ponts_detail"]);
    assert!(detail.len() == 3, "les trois ponts doivent etre rendus, pas le seul plus proche");
    for f in detail {
        assert!(contient(f, "part"), "chaque pont doit porter sa part du courant");
        assert!(f["repere"].vrai(), "chaque pont doit etre nomme");
        assert!(n(&f["distance_mm"]) > 0.0, "chaque pont doit etre cote");
    }
    // Tries par distance, et le dominant est nomme dans `pont`.
    let reperes: Vec<&str> = detail.iter().map(|f| t(&f["repere"])).collect();
    assert!(reperes == ["C12", "C13", "C14"],
            "les ponts doivent etre tries par distance : {:?}", reperes);
    assert!(t(&cav["pont"]["repere"]) == "C12", "le pont nomme est le plus proche");

    // LES PARTS SOMMENT A UN (ou davantage : courant circulant), et la cavite
    // en fait partie -- sinon les pourcentages affiches ne somment a rien.
    let total = detail.iter().map(|f| n(&f["part"])).sum::<f64>() + n(&cav["part_cavite"]);
    assert!((0.98..=3.0).contains(&total),
            "les parts doivent se lire comme un partage (somme {:.3})", total);
    assert!(n(&detail[2]["part"]) < 0.01,
            "le 1 nF a 7 mm ne doit presque rien porter a 12 MHz ({:.4})", n(&detail[2]["part"]));
    assert!(n(&cav["freq_parts_hz"]) > 0.0, "la frequence des parts doit etre dite");

    // ET LES BRANCHES PARTENT DANS LA CASCADE : l'impedance rendue est celle des
    // TROIS ponts en parallele, pas celle du plus proche.
    assert!(els(&cav["ponts_branches"]).len() == 3,
            "la cascade doit recevoir les trois branches");
    let z_seul = tl::impedance_traversee_plans(
        n(&cav["freq_parts_hz"]), n(&cav["etalement_cavite_nH"]) * 1e-9,
        n(&cav["capacite_plans_pF"]) * 1e-12,
        Some((n(&cav["etalement_nH"]) + n(&cav["esl_nH"])) * 1e-9),
        0.03, Some(n(&cav["capacite_pont_F"])));
    assert!(n(&cav["impedance_fc_ohm"]) < z_seul.norm(),
            "trois ponts en parallele doivent peser MOINS qu'un seul : {:.4} contre {:.4}",
            n(&cav["impedance_fc_ohm"]), z_seul.norm());
}

/// L'AIRE N'EST PAS UN REGLAGE, ELLE SE DEDUIT DU ROUTAGE.
///
/// Deux boucles, et elles ne se confondent pas : celle du VIA -- hauteur du
/// barreau par distance au via de masse -- et celle de la CAVITE quand la
/// reference change -- ecartement des DEUX PLANS par distance au pont. Prendre
/// la hauteur du via pour la seconde compterait du cuivre que le detour
/// n'enferme pas.
fn l_aire_de_la_boucle_se_lit_dans_la_geometrie() {
    // Cas sain : deux plans de masse, un via de retour a 0,7 mm.
    let stack_gnd = pile(1.065, "GND");
    let mut d = _doc_moignon_f(&stack_gnd, 0, 6,
                               &_via_moignon_p(Some((0, 6)), None, &[_retour_via(10.7, 0.0)], None),
                               100e6, 1e9);
    signal(&mut d, None, 100e6, 1e-9);
    let r = sim(&d);
    let ray = &tr0(&r)["rayonnement"];
    let h = _hauteur_via(&stack_gnd, &0i64.j(), &6i64.j());
    proche(n(&ray["via_mm2"]), h * 0.7, 1e-3, "l'aire de la boucle du via");
    assert!(nul(&ray["cavite_mm2"]), "sans changement de reference, pas de cavite");

    // Cas GND -> PWR avec un pont a 2 mm : c'est l'ECARTEMENT DES PLANS qui
    // multiplie, pas la hauteur du via.
    let stack_pwr = pile(1.065, "PWR");
    let via = _via_moignon_p(Some((0, 6)), Some(vec![pont(12.0, 0.0, "C12", 1e-7)]),
                             &[_retour_via(10.7, 0.0)], Some(10.0));
    let mut d2 = _doc_moignon_f(&stack_pwr, 0, 6, &via, 100e6, 1e9);
    signal(&mut d2, None, 100e6, 1e-9);
    let r2 = sim(&d2);
    let t2 = tr0(&r2);
    let ray2 = &t2["rayonnement"];
    let h_cav = n(&t2["cavite"]["hauteur_mm"]);
    proche(n(&ray2["cavite_mm2"]), h_cav * 2.0, 1e-3, "l'aire de la boucle de cavite");
    assert!(nul(&ray2["via_mm2"]),
            "aucun via de masse ne referme GND -> PWR : il n'y a pas de boucle de\
             \x20via a compter");
    assert!(n(&ray2["aire_boucle_mm2"]) > n(&ray["aire_boucle_mm2"]),
            "le detour par le pont doit enfermer plus que le via de retour direct");
}

/// LE CAS ORDINAIRE DES QUATRE COUCHES, ET CE QU'IL FAUT EN LIRE.
///
/// TOP (signal) / L1 (GND) / L2 (PWR) / BOT (signal), un via de signal qui
/// plonge de TOP a BOT, un via de masse a 0,7 mm. La piste du haut se refere a
/// L1, celle du bas a L2 : la reference change ET les nets different. Le via
/// de masse touche L1 et ne peut PAS toucher L2 -- il joindrait de la masse a
/// de l'alimentation. Il est donc ECARTE, en le disant, et l'inductance rendue
/// est un plancher.
///
/// C'EST LE PIEGE QUE CETTE ANALYSE EXISTE POUR MONTRER : le via de masse est
/// la, il a l'air de travailler, et il ne travaille pas.
fn le_cas_top_gnd_pwr_bot_ecarte_le_via_de_masse_et_le_dit() {
    let stack = pile(1.065, "PWR");
    let via = _via_moignon_p(Some((0, 6)), None, &[_retour_via(10.7, 0.0)], None);
    let mut d = _doc_moignon_f(&stack, 0, 6, &via, 12e6, 100e6);
    signal(&mut d, Some(1e6), 12e6, 13e-9);

    let r = sim(&d);
    let tr = tr0(&r);
    let ret = &tr["retour"];

    assert!(ret["plans_depart"] == vec!["L1"].j() && ret["plans_arrivee"] == vec!["L2"].j(),
            "les plans de reference ne sont pas ceux attendus : {} -> {}",
            dumps(&ret["plans_depart"]), dumps(&ret["plans_arrivee"]));
    assert!(ret["nets_differents"] == Json::Bool(true), "GND et PWR doivent etre vus differents");
    assert!(ret["reference_change"] == Json::Bool(true), "le defaut grave doit etre nomme");
    assert!(n(&ret["trouves"]) == 1.0, "le via de masse doit etre vu");
    assert!(n(&ret["retenus"]) == 0.0, "le via de masse ne peut PAS refermer GND -> PWR");
    assert!(t(&ret["vias"][0]["raison"]).contains("ne rejoint pas L2"),
            "la raison de l'ecart doit nommer le plan d'arrivee : {}", t(&ret["vias"][0]["raison"]));
    assert!(t(&tr["modelise"]["inductance_source"]).starts_with("self"),
            "sans retour retenu, l'inductance doit venir de la self partielle : {}",
            t(&tr["modelise"]["inductance_source"]));
    assert!(!t(&tr["bilan_sante"]["verdict"]).contains("refermee de facon optimale"),
            "le verdict ne doit pas annoncer une boucle refermee : {}", t(&tr["bilan_sante"]["verdict"]));
    assert!(avertis(&r).iter().any(|a| a.contains("Aucun via de masse ne peut joindre les deux")),
            "l'avertissement de changement de reference manque");

    // LA CORRECTION DE ROUTAGE : les deux plans internes sur de la masse. Le
    // meme dessin de cuivre, le meme via de masse -- et cette fois il travaille.
    let stack_ok = pile(1.065, "GND");
    let mut d2 = _doc_moignon_f(&stack_ok, 0, 6, &_via_moignon_p(Some((0, 6)), None, &[_retour_via(10.7, 0.0)], None),
                                12e6, 100e6);
    signal(&mut d2, Some(1e6), 12e6, 13e-9);
    let r2 = sim(&d2);
    let t2 = tr0(&r2);
    assert!(n(&t2["retour"]["retenus"]) == 1.0, "sur deux plans de masse, le via referme");
    assert!(t(&t2["modelise"]["inductance_source"]) == "boucle",
            "l'inductance doit devenir une mesure : {}", t(&t2["modelise"]["inductance_source"]));

    // ET LE NOMBRE MONTE, ce qui est le piege de lecture : le plancher n'est pas
    // une boucle. 0,69 nH de self partielle contre 0,80 nH de boucle reelle.
    assert!(n(&t2["modelise"]["inductance_nH"]) > n(&tr["modelise"]["inductance_nH"]),
            "le plancher ({:.3} nH) devrait etre SOUS la boucle mesuree ({:.3} nH)",
            n(&tr["modelise"]["inductance_nH"]), n(&t2["modelise"]["inductance_nH"]));
}

/// LE BILAN DE SANTE CHIFFRE LA QUALITE DU SIGNAL ET LE RETOUR DU FRONT.
///
/// Il montre que rapprocher le decouplage ameliore le score de reconstruction
/// du signal.
fn le_bilan_de_sante_evalue_la_reconstruction_et_chiffre_le_decouplage() {
    let proche_pont = _via_moignon_p(Some((0, 6)), Some(vec![obj! {"x" => 12.0, "y" => 0.0,
                                                                   "repere" => "C1"}]), &[], Some(10.0));
    let loin_pont = _via_moignon_p(Some((0, 6)), Some(vec![obj! {"x" => 25.0, "y" => 0.0,
                                                                 "repere" => "C2"}]), &[], Some(10.0));

    let mut doc_a = _doc_moignon(&_GND_PWR(), 0, 6, &proche_pont);
    poser(&mut doc_a, "temps_montee", 1e-9);
    poser(&mut doc_a, "f_fondamentale", 10e3);

    let mut doc_b = _doc_moignon(&_GND_PWR(), 0, 6, &loin_pont);
    poser(&mut doc_b, "temps_montee", 1e-9);
    poser(&mut doc_b, "f_fondamentale", 10e3);

    let ra = sim(&doc_a);
    let rb = sim(&doc_b);

    let ta = tr0(&ra);
    let tb = tr0(&rb);

    assert!(contient(ta, "bilan_sante"), "bilan_sante absent de la transition a");
    let bilan = &ta["bilan_sante"];

    assert!(n(&bilan["score_reconstruction_pct"]) > 0.0, "le score doit etre positif");

    // Rapprocher le decouplage preserve mieux le signal
    let score_a = n(&ta["modelise"]["score_reconstruction_pct"]);
    let score_b = n(&tb["modelise"]["score_reconstruction_pct"]);
    assert!(score_a > score_b,
            "decouplage proche devrait avoir un meilleur score : {:.2} contre {:.2}", score_a, score_b);
}

/// v0 EST L'EXCURSION 0 -> V d'un signal logique (i = v0 / Z0), pas un
/// signal +-v0 : la fondamentale d'un carre 0 -> 1 V vaut 2/pi, et 4/pi
/// surestimait tout le rayonnement de 6,02 dB -- boucle comme cavite.
fn le_spectre_est_celui_d_un_signal_0_v0() {
    let h1 = &tl::spectre_signal_trapeze(1e6, 1e-15, 1.0, 10, None)[0];
    proche(h1.amplitude, 2.0 / PI, 1e-9, "fondamentale 0 -> 1 V");
    // La cavite, sur un rayonnement unitaire : seul le spectre reste.
    let vide = tl::Traversee { modal: None, ponts: Vec::new(), l_pont: None, esr_pont: 0.0, c_pont: None, l_cavite: None, c_plans: None };
    let fiche = _rayonnement_cavite_avec(&vide, 50e6, 1e-15, 3.3, 50.0, 3.0, CLASSE_CEM_REPLI,
                                         &|fs, _| (vec![1.0; fs.len()], Vec::new()));
    let p = &fiche["pire"];
    let i_eff = 2.0 * 3.3 * 50e6 / (PI * n(&p["freq_hz"])) / 50.0 / 2f64.sqrt();
    proche(n(&p["champ_dbuv_m"]), 20.0 * (2.0 * i_eff / 3.0 * 1e6).log10(), 0.002,
           "champ de la cavite");
}

pub fn banc() {
    titre("La mise en cascade et les parametres S");
    T("TOP/GND/PWR/BOT : le via de masse est écarté, et c'est dit", le_cas_top_gnd_pwr_bot_ecarte_le_via_de_masse_et_le_dit);
    T("le spectre est celui d'un signal 0 -> v0", le_spectre_est_celui_d_un_signal_0_v0);
    T("l'aire de la boucle se lit dans la géométrie", l_aire_de_la_boucle_se_lit_dans_la_geometrie);
    T("une référence absente ne se dit pas comme une référence qui change", une_reference_absente_ne_se_dit_pas_comme_une_reference_qui_change);
    T("le net mesuré par la page prime sur celui de la couche", le_net_mesure_par_la_page_prime_sur_celui_de_la_couche);
    T("un via de masse sur un autre versement ne referme rien", un_via_de_masse_sur_un_autre_versement_ne_referme_rien);
    T("la fiche de cavité porte chaque pont et sa part", la_fiche_de_cavite_porte_chaque_pont_et_sa_part);
    T("le retour par la cavité est nommé comme un défaut", le_retour_par_la_cavite_est_nomme_comme_un_defaut);
    T("une cavité non sondée n'invente pas de part", une_cavite_non_sondee_n_invente_pas_de_part);
    T("l'aire des plans majorée se dit", l_aire_des_plans_majoree_se_dit);
    T("le bilan de santé évalue la reconstruction et chiffre le découplage", le_bilan_de_sante_evalue_la_reconstruction_et_chiffre_le_decouplage);
}
