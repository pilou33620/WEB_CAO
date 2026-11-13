//! Le chemin de retour d'une transition : son analyse, l'inductance et la capacite du via,
//! la boucle qu'il rayonne, et la cavite entre plans quand la reference change.

use super::base::*;
use super::discontinuites::*;
use super::ErreurSimulation;
use ligne_mom as tl;
use std::sync::Mutex;

type Res<T> = Result<T, ErreurSimulation>;

/// Le chemin de retour d'une transition : ce qu'on en sait, et ce qu'on ne
/// peut pas en savoir. Remplit `trans["retour"]`.
///
/// LES DEUX QUESTIONS SONT SEPAREES, ET ELLES DOIVENT L'ETRE. « La reference
/// change-t-elle ? » est une propriete de l'EMPILAGE ; « un via la rejoint-il ?
/// » est une propriete du ROUTAGE. Une reference qui change et qu'un via
/// rejoint est un cas ordinaire, bien modelise. Une reference qui change sans
/// que rien ne la rejoigne est le defaut grave. Les confondre sous un seul
/// drapeau rendrait l'avertissement inutilisable : il crierait sur le cas
/// ordinaire, et on cesserait de le lire.
#[allow(clippy::too_many_arguments)]
pub fn _analyse_retour(
    trans: &mut Json, via: &Json, couches: &[Json], segments: &[Json], z_bornes: &[f64], refs_nets: &Noms,
    refs_av: Option<Noms>, refs_ap: Option<Noms>,
) {
    // LES PLANS DE REFERENCE PEUVENT VENIR D'AILLEURS QUE DE LA CHAINE, et
    // c'est ce qui libere l'analyse du retour. Par defaut ils se lisent dans
    // les deux troncons qui encadrent la transition -- le cas d'un parcours.
    // Un via qui n'appartient a aucun parcours -- celui d'un bus qui dessert
    // trois boitiers -- n'a pas de troncons a encadrer : l'appelant lit alors
    // les plans dans l'EMPILAGE, par `_plans_de_couche`, et les passe ici. Le
    // reste du raisonnement est identique, parce qu'il ne depend que des plans.
    let i = trans["troncon"].as_f64().unwrap_or(0.0) as i64;
    let n_seg = segments.len() as i64;
    let vide = Json::Nul;
    let seg_av = if 0 < i && i <= n_seg { &segments[(i - 1) as usize] } else { &vide };
    let seg_ap = if 0 <= i && i < n_seg { &segments[i as usize] } else { &vide };
    let refs_av = refs_av.unwrap_or_else(|| _plans_de_reference(seg_av));
    let refs_ap = refs_ap.unwrap_or_else(|| _plans_de_reference(seg_ap));

    let a = ent(&trans["couche_depart"], 0);
    let b = ent(&trans["couche_arrivee"], 0);
    let (lo, hi) = (a.min(b), a.max(b));
    let z1 = zb(z_bornes, lo, 0.0);
    let z2 = zb(z_bornes, hi + 1, z1);

    // DEUX PLANS DE NOMS DIFFERENTS NE SONT PAS DEUX PLANS DE NETS DIFFERENTS,
    // et tout le verdict tient a cette distinction. Sur une carte quatre
    // couches, une piste sur TOP se refere au plan interne du haut et la meme
    // piste sur BOT au plan interne du bas : les NOMS different toujours. Si
    // les deux sont de la masse, un via de masse referme la boucle et c'est le
    // cas ordinaire. S'ils sont GND et PWR, RIEN ne peut la refermer et c'est
    // le defaut grave. Les confondre -- ce que faisait la premiere version --
    // revient a crier au defaut grave sur toute carte quatre couches dont
    // l'empilage ne nomme pas ses nets. C'est ce qui est arrive.
    //
    // TROIS ETATS, DONC, ET PAS DEUX :
    //   · `plan_change` faux            -> meme plan des deux cotes, rien a dire ;
    //   · nets connus et DIFFERENTS     -> defaut grave, aucun via n'y peut rien ;
    //   · nets connus et IDENTIQUES     -> cas ordinaire, un via de masse suffit ;
    //   · nets INCONNUS                 -> on ne sait pas, et on le dit.
    let plan_change = !refs_av.is_empty() && !refs_ap.is_empty() && refs_av.is_disjoint(&refs_ap);

    // UN PLAN N'EST PAS D'UN SEUL NET, ET LE SUPPOSER ETAIT LE DEFAUT DE FOND.
    // `_net_du_plan` lit le net que l'empilage attribue a la COUCHE. Or une
    // couche de plan est PARTITIONNEE : sur une carte reelle, Conductor-3 porte
    // un ilot d'alimentation de quelques millimetres carres et tout le reste est
    // de la masse. Le net de la couche est alors « PWR » -- celui de la plus
    // grande zone, ou celui que le role force -- et il s'appliquait a la couche
    // ENTIERE.
    //
    // CE QUE CELA FAISAIT DIRE. Un via de signal qui plonge la ou Conductor-3
    // est de la MASSE sortait « la reference change de net, aucun via de masse
    // ne peut refermer » -- alors que les vias de masse autour de lui referment
    // parfaitement, puisqu'ils touchent la meme masse des deux cotes. On criait
    // au defaut grave sur un routage correct, et on ecartait dix vias de retour
    // qui travaillent.
    //
    // LE NET D'UN PLAN EST DONC UNE PROPRIETE DU POINT. Seule la page a la
    // geometrie du cuivre : elle mesure le net AU DROIT DU VIA et l'envoie dans
    // `plans_nets`. On la prefere partout ou elle parle, et on retombe sur le
    // net de la couche -- avec sa reserve -- la ou elle se taît.
    let locaux = &via["plans_nets"];
    let sous_le_via = |nom: &str| py::strip(&str_ou_vide(&locaux[nom])).to_string();

    let _net_plan = |nom: &str| {
        let mesure = sous_le_via(nom);
        if !mesure.is_empty() { mesure } else { _net_du_plan(couches, nom) }
    };

    let nets_av: Noms = refs_av.iter().map(|x| _net_plan(x)).filter(|n| !n.is_empty()).collect();
    let nets_ap: Noms = refs_ap.iter().map(|x| _net_plan(x)).filter(|n| !n.is_empty()).collect();
    let nets_differents: Option<bool> = if !plan_change {
        Some(false)
    } else if !nets_av.is_empty() && !nets_ap.is_empty() {
        Some(nets_av.is_disjoint(&nets_ap))
    } else {
        None // l'empilage ne declare pas les nets
    };

    let tous: Noms = refs_av.union(&refs_ap).cloned().collect();
    let trie = |n: &Noms| n.iter().cloned().collect::<Vec<String>>();
    let plans_incertains = !_plans_ont_un_net(couches);
    let mut retour = obj! {
        "plans_depart" => trie(&refs_av),
        "plans_arrivee" => trie(&refs_ap),
        "nets_depart" => trie(&nets_av),
        "nets_arrivee" => trie(&nets_ap),
        // LE NET D'UN PLAN PEUT ETRE DEDUIT DU ROLE plutot que lu dans le
        // cuivre -- voir `_net_du_plan_suppose`. Quand c'est le cas, tout le
        // verdict qui en decoule est une deduction, et la fiche doit le porter.
        // PAS DE CUIVRE DU TOUT sous le via, sur ce plan de reference. Ce n'est
        // pas « la reference change », c'est « il n'y a pas de reference » : le
        // net rendu pour cette couche n'est qu'un repli, et aucun condensateur
        // de pontage ne rattrape une reference ABSENTE. Seule la page peut le
        // mesurer -- le serveur n'a pas la geometrie du cuivre.
        "plans_sans_cuivre" => {
            let mut l: Vec<String> = els(&via["plans_sans_cuivre"]).iter().filter(|n| n.vrai()).map(str_py)
                .filter(|n| tous.contains(n)).collect();
            l.sort();
            l
        },
        "nets_supposes" => tous.iter().filter(|n| _net_du_plan_suppose(couches, n)).cloned().collect::<Vec<String>>(),
        // Le PLAN change : c'est une propriete des noms, toujours calculable.
        "plan_change" => plan_change,
        // Les NETS different : vrai, faux, ou None quand on ne peut pas le dire.
        "nets_differents" => nets_differents,
        // `reference_change` reste le nom du DEFAUT GRAVE -- un changement que
        // rien ne peut rejoindre --, et il exige desormais la certitude.
        "reference_change" => plan_change && nets_differents == Some(true),
        "vias" => Vec::<Json>::new(),
        "trouves" => 0i64,
        "retenus" => 0i64,
        "raccorde" => false,
        "source" => "self",
        // Les nets des plans ne sont pas declares : le test « ce via rejoint-il
        // le plan d'arrivee ? » ne peut pas se faire, et la fiche doit le dire.
        "plans_incertains" => plans_incertains,
    };

    // OU EST CE VIA. La fiche disait deja quels vias de masse l'entourent et a
    // quelle distance, mais jamais son propre point : de quoi tracer un
    // CHEVELU, il ne manquait que l'origine des traits. Sans elle, une page qui
    // veut dessiner ce que le modele a retenu doit retrouver la position par un
    // autre chemin -- et deux chemins pour une meme grandeur finissent toujours
    // par en donner deux valeurs. On la rend donc ici, avec le reste.
    let (x_via, y_via) = (nb_opt(&via["x"]), nb_opt(&via["y"]));
    if let (Some(x), Some(y)) = (x_via, y_via) {
        poser(&mut retour, "x", round(x, 4));
        poser(&mut retour, "y", round(y, 4));
    }

    let bruts = &via["retours"];
    if nul(bruts) {
        poser(&mut retour, "source", "absent");
        poser(&mut retour, "raison", "la page n'envoie pas les vias de masse voisins :\
                                      \x20l'inductance est celle d'un conducteur seul");
        poser(trans, "retour", retour);
        return;
    }

    let (Some(x0), Some(y0)) = (x_via, y_via) else {
        poser(&mut retour, "source", "absent");
        poser(&mut retour, "raison", "la page envoie des vias de retour sans donner la\
                                      \x20position du via de signal");
        poser(trans, "retour", retour);
        return;
    };

    let bruts = els(bruts);
    poser(&mut retour, "trouves", bruts.len());
    let mut vias: Vec<Json> = Vec::new();
    let mut retenus: Vec<usize> = Vec::new();
    for v in bruts {
        let vx = _nombre(&v["x"], 0.0);
        let vy = _nombre(&v["y"], 0.0);
        let dist = py::hypot(vx - x0, vy - y0);
        let va = ent(&v["layer_from"], 0);
        let vb = ent(&v["layer_to"], 0);
        let (vlo, vhi) = (va.min(vb), va.max(vb));
        let vz1 = zb(z_bornes, vlo, 0.0);
        let vz2 = zb(z_bornes, vhi + 1, vz1);
        let net = str_ou_vide(&v["net"]);
        // LES PLANS QU'IL RACCORDE : MESURE D'ABORD, DEDUCTION ENSUITE.
        // `_plans_touches` ne peut repondre qu'a la couche -- il n'a pas la
        // geometrie du cuivre. La page l'a : elle regarde, au droit de CE via,
        // quels plans portent SON net, et l'envoie dans `plans_joints`. Sur un
        // plan partitionne c'est la seule reponse juste. On restreint quand meme
        // a la PORTEE du percage : la page suppose les vias traversants, elle ne
        // peut pas trancher cela.
        let joints = &v["plans_joints"];
        let touche: Noms = if nul(joints) {
            _plans_touches(couches, va, vb, &net, !plans_incertains, true)
        } else {
            let portee = _plans_touches(couches, va, vb, &net, false, false);
            els(joints).iter().filter(|n| n.vrai()).map(str_py).filter(|n| portee.contains(n)).collect()
        };

        // LE MEME PLAN N'EST PAS LE MEME CUIVRE, et c'est le dernier endroit
        // ou l'hypothese « un net par couche » survivait. `plans_joints` dit
        // quels plans ce via de masse touche -- AU DROIT DE LUI. Le courant de
        // retour, lui, circule dans le cuivre AU DROIT DU VIA DE SIGNAL. Sur un
        // plan partitionne, les deux ne sont pas le meme VERSEMENT, et le nom de
        // la couche ne les distingue pas : « touche Conductor-2 » est vrai des
        // deux cotes d'une frontiere qui les separe electriquement.
        //
        // CE QUE CELA FAISAIT DIRE, ET C'EST LE SENS QUI FLATTE. Un via de
        // signal qui plonge DANS un ilot d'alimentation de Conductor-2, avec des
        // vias de masse a un millimetre qui touchent Conductor-2 HORS de l'ilot :
        // les noms concordaient, les vias etaient retenus, `raccorde` passait a
        // vrai -- et l'inductance sortait comme une MESURE de boucle. Elle
        // cumulait meme la cavite (« boucle+cavite »), donc le meme retour
        // compte deux fois par deux chemins dont un n'existe pas. Le verdict
        // CRITIQUE, lui, etait masque : il exige `not raccorde`.
        //
        // LA PREUVE EST DISPONIBLE, ET ELLE EST LOCALE. La page a mesure le net
        // sous le via de SIGNAL (`plans_nets`) ; on connait celui du via de
        // masse. Quand les deux sont lus et qu'ils DIFFERENT, il est demontre
        // que ce via touche un AUTRE versement : il ne porte pas ce retour. Quand
        // la page se tait, on ne peut rien demontrer et on garde le via -- avec
        // les reserves que la fiche porte deja.
        let mut autre = Noms::new();
        if !net.is_empty() {
            for nom in &touche {
                let sous_signal = sous_le_via(nom);
                if !sous_signal.is_empty() && sous_signal != net {
                    autre.insert(nom.clone());
                }
            }
        }
        let porte: Noms = touche.difference(&autre).cloned().collect();

        let mut fiche = obj! {"x" => round(vx, 4), "y" => round(vy, 4),
                              "distance_mm" => round(dist, 4),
                              "net" => &net,
                              "percage_mm" => round(_nombre(&v["drill_diameter"], 0.3), 4),
                              "plans" => trie(&touche),
                              "part" => 0.0, "retenu" => false, "raison" => ""};
        if !autre.is_empty() {
            poser(&mut fiche, "plans_autre_versement", trie(&autre));
        }

        // 1. Est-ce bien de la masse ? Un via d'un autre signal ne porte pas le
        //    retour, meme s'il est a cote.
        if !refs_nets.is_empty() && !net.is_empty() && !refs_nets.contains(&net) {
            poser(&mut fiche, "raison", format!("net « {} » : ce n'est pas une référence", net));
        // 2. Referme-t-il la hauteur ? Un via borgne qui ne couvre qu'une partie
        //    ne referme pas le courant -- voir `tl.inductance_boucle_vias`.
        } else if vz1 > z1 + 1e-9 || vz2 < z2 - 1e-9 {
            poser(&mut fiche, "raison", format!("ne couvre pas la hauteur du via de signal\
                                                 \x20({:.3}-{:.3} mm contre {:.3}-{:.3})", vz1, vz2, z1, z2));
        // 3. Rejoint-il les DEUX plans de reference ? C'est ici que le cas
        //    GND -> PWR tombe, et il doit tomber en le disant.
        } else if !refs_av.is_empty() && porte.is_disjoint(&refs_av) {
            poser(&mut fiche, "raison", _pourquoi_pas_le_plan(&refs_av, &autre, locaux, "de départ"));
        } else if !refs_ap.is_empty() && porte.is_disjoint(&refs_ap) {
            poser(&mut fiche, "raison", _pourquoi_pas_le_plan(&refs_ap, &autre, locaux, "d'arrivée"));
        } else {
            poser(&mut fiche, "retenu", true);
            // LA PORTEE PEUT ETRE SUPPOSEE, ET ALORS TOUT LE RESTE L'EST.
            // L'IPC-2581 declare la position, le diametre et le net d'un
            // percage, mais PAS ses couches : rien n'y distingue un via
            // traversant d'un via enterre. Un via enterre pris pour traversant
            // rend une inductance trop PETITE de pres de vingt pour cent, donc
            // flatteuse. On accepte -- refuser rendrait la visionneuse aveugle
            // -- et on le porte jusqu'a la fiche.
            if v["portee_supposee"].vrai() {
                poser(&mut fiche, "portee_supposee", true);
                poser(&mut retour, "portee_supposee", true);
            }
            retenus.push(vias.len());
        }
        vias.push(fiche);
    }

    poser(&mut retour, "retenus", retenus.len());
    poser(&mut retour, "raccorde", !retenus.is_empty());
    // JUSQU'OU A-T-ON REGARDE. « Aucun via de masse ne referme la boucle » est
    // un enonce sur la CARTE ; sans le rayon, c'est en fait un enonce sur le
    // RAYON CHERCHE, et les deux ne se disent pas pareil -- c'est le meme soin
    // que `cavite.cherche` prend deja pour les decouplages. La page l'envoie
    // quand elle le connait ; sinon le champ reste absent et la phrase ne le
    // promet pas.
    let rayon = _nombre(&via["retours_rayon_mm"], 0.0);
    let rayon_opt = _nombre(&via["retours_rayon_optimal_mm"], 1.8);
    if rayon > 0.0 {
        poser(&mut retour, "rayon_mm", round(rayon, 3));
    }
    poser(&mut retour, "rayon_optimal_mm", round(rayon_opt, 3));
    let d_hors = nb_opt(&via["retour_hors_rayon_mm"]);
    if let Some(d) = d_hors {
        poser(&mut retour, "plus_proche_hors_rayon_mm", round(d, 3));
    }
    // les statuts d'abord (ils ne dependent pas de l'ordre), le tri ensuite
    let mut d_min = f64::NAN;
    if !retenus.is_empty() {
        d_min = minf(&retenus.iter().map(|&k| num(&vias[k], "distance_mm")).collect::<Vec<_>>());
        for &k in &retenus {
            let f = &mut vias[k];
            let d = num(f, "distance_mm");
            if d <= rayon_opt {
                poser(f, "statut", "optimal");
            } else {
                poser(f, "statut", "vigilance");
                poser(f, "reserve", format!("boucle large (distance {:.2} mm > rayon optimal {:.1} mm)", d, rayon_opt));
            }
        }
    }
    vias.sort_by(|f, g| num(f, "distance_mm").total_cmp(&num(g, "distance_mm")));
    if retenus.is_empty() {
        poser(&mut retour, "statut", "ouvert");
        let ou = if rayon > 0.0 { format!(" dans un rayon de {:.1} mm", rayon) } else { String::new() };
        if !vias.is_empty() {
            let r = txt(&vias[0], "raison");
            poser(&mut retour, "raison", format!(
                "des vias de masse sont présents{} mais aucun ne referme la\
                 \x20boucle ({}) : l'inductance rendue est un PLANCHER — la self\
                 \x20partielle du barreau —, et la boucle réelle vaut davantage",
                ou, if r.is_empty() { "voir la fiche" } else { r }));
        } else if let Some(d) = d_hors {
            poser(&mut retour, "raison", format!(
                "aucun via de masse{} — le plus proche trouvé est à {:.2} mm\
                 \x20(trop éloigné, boucle ouverte) : l'inductance rendue est un\
                 \x20PLANCHER — la self partielle du barreau —, elle ne dépend\
                 \x20pas du routage, et la boucle réelle vaut davantage",
                ou, d));
        } else {
            poser(&mut retour, "raison", format!(
                "aucun via de masse{} : l'inductance rendue est un PLANCHER —\
                 \x20la self partielle du barreau —, elle ne dépend pas du\
                 \x20routage, et la boucle réelle vaut davantage", ou));
        }
    } else {
        poser(&mut retour, "plus_proche_retenu_mm", round(d_min, 4));
        if d_min <= rayon_opt {
            poser(&mut retour, "statut", "optimal");
        } else {
            poser(&mut retour, "statut", "vigilance");
            poser(&mut retour, "vigilance_raison", format!(
                "boucle large : le via de retour le plus proche est à {:.2} mm\
                 \x20(zone de vigilance : > {:.1} mm). Le via est retenu et\
                 \x20l'inductance de boucle réelle est calculée, mais l'impédance\
                 \x20HF, le rebond de masse et le rayonnement augmentent fortement.",
                d_min, rayon_opt));
        }
    }
    poser(&mut retour, "vias", vias);
    poser(trans, "retour", retour);
}

/// L'inductance de la transition, en henrys, et d'ou elle vient.
///
/// Rend (L, source) : « boucle » quand des vias de retour la referment,
/// « self » quand rien ne la referme.
///
/// LE REPLI EST UN PLANCHER, ET IL EST NOMME COMME TEL. Sans retour identifie,
/// il n'y a pas d'inductance de boucle a rendre : le courant revient quand
/// meme, mais par un chemin qu'on ne connait pas -- le cuivre des plans, plus
/// loin. On rend donc la SELF PARTIELLE, qui est la valeur qu'aurait la boucle
/// si le retour etait colle au via : c'est une BORNE INFERIEURE, la vraie
/// valeur est plus grande, et la fiche doit le dire ainsi plutot que d'annoncer
/// un chiffre.
///
/// ET C'EST LA MEME FORMULE QUE CELLE DU CHEVELU. `tl.inductance_via` --
/// (mu0 h/2pi)(ln(4h/d)+1) -- est une regle de pouce des manuels qui contient
/// un retour implicite, jamais dit, place nulle part ; elle vaut ici pres du
/// double de la self partielle. La garder ici pendant que l'editeur affiche la
/// self de Grover, c'etait deux chiffres pour une meme grandeur, dans deux
/// endroits qu'on lit l'un apres l'autre.
#[allow(clippy::too_many_arguments)]
pub fn _inductance_transition(
    trans: &mut Json, via: &Json, couches: &[Json], segments: &[Json], z_bornes: &[f64], refs_nets: &Noms, h_via: f64,
    d_percage: f64, refs_av: Option<Noms>, refs_ap: Option<Noms>,
) -> Res<(f64, &'static str)> {
    _analyse_retour(trans, via, couches, segments, z_bornes, refs_nets, refs_av, refs_ap);
    let propre = || tl::inductance_partielle_propre(0.0, h_via * 1e-3, d_percage * 1e-3 / 2.0);
    let retenus: Vec<usize> =
        els(&trans["retour"]["vias"]).iter().enumerate().filter(|(_, f)| f["retenu"].vrai()).map(|(k, _)| k).collect();
    if retenus.is_empty() {
        return Ok((propre()?, "self"));
    }

    let a = ent(&trans["couche_depart"], 0);
    let b = ent(&trans["couche_arrivee"], 0);
    let (lo, hi) = (a.min(b), a.max(b));
    let z1 = zb(z_bornes, lo, 0.0) * 1e-3;
    let z2 = zb(z_bornes, hi + 1, 0.0) * 1e-3;
    let x0 = _nombre(&via["x"], 0.0);
    let y0 = _nombre(&via["y"], 0.0);

    let signal = tl::Via { x: x0 * 1e-3, y: y0 * 1e-3, z1, z2, rayon: d_percage * 1e-3 / 2.0 };
    let retour = dans(trans, "retour");
    let liste: Vec<tl::Via> = retenus
        .iter()
        .map(|&k| {
            let f = &retour["vias"][k];
            tl::Via { x: num(f, "x") * 1e-3, y: num(f, "y") * 1e-3, z1, z2, rayon: num(f, "percage_mm").max(1e-3) * 1e-3 / 2.0 }
        })
        .collect();
    fn via_k(retour: &mut Json, k: usize) -> &mut Json {
        match dans(retour, "vias") {
            Json::Liste(l) => &mut l[k],
            _ => unreachable!(),
        }
    }
    match tl::inductance_boucle_vias(&signal, &liste, 1e-6) {
        Err(exc) => {
            // Le refus de `inductance_boucle_vias` ne doit pas passer en silence :
            // il veut dire que le filtre ci-dessus a laisse passer quelque chose.
            poser(retour, "raison", exc.0);
            poser(retour, "raccorde", false);
            for &k in &retenus {
                poser(via_k(retour, k), "retenu", false);
            }
            poser(retour, "retenus", 0i64);
            Ok((propre()?, "self"))
        }
        Ok((l_boucle, parts)) => {
            for (&k, part) in retenus.iter().zip(parts) {
                poser(via_k(retour, k), "part", round(part, 4));
            }
            poser(retour, "source", "boucle");
            Ok((l_boucle, "boucle"))
        }
    }
}

/// La capacite de la transition, en farads, et son detail.
///
/// LES DEUX PASTILLES D'EXTREMITE SE COMPTENT A LA DISTANCE DE LEUR PLAN, et
/// non a la hauteur du via : c'est `seg["h"]`, que le troncon porte deja. Sur
/// un empilage quatre couches, la difference vaut un facteur sept.
#[allow(clippy::too_many_arguments)]
pub fn _capacite_transition(
    trans: &mut Json, via: &Json, couches: &[Json], seg_av: &Json, seg_ap: &Json, d_percage: f64, d_pastille: f64,
) -> f64 {
    let a = ent(&trans["couche_depart"], 0);
    let b = ent(&trans["couche_arrivee"], 0);
    let net = str_ou_vide(&via["net"]);
    let traverses = _plans_traverses(couches, a, b, &net);

    let a_antipad = !nul(&via["antipad_diameter"]);
    let d_antipad = _nombre(&via["antipad_diameter"], d_pastille + 2.0 * ANTIPAD_ECART_REPLI);
    let a_internes = !nul(&via["pastilles_internes"]);
    let internes = via.get("pastilles_internes").map_or(PASTILLES_INTERNES_REPLI, Json::vrai);

    let er = _nombre(&seg_ap["er"], _nombre(&seg_av["er"], 4.3));
    let (c_tot, detail) = tl::capacite_via_complete(
        d_percage * 1e-3, d_pastille * 1e-3, d_antipad * 1e-3, er,
        &traverses.iter().map(|t| num(t, "epaisseur") * 1e-3).collect::<Vec<_>>(),
        _nombre(&seg_av["h"], 0.0) * 1e-3,
        _nombre(&seg_ap["h"], 0.0) * 1e-3,
        internes);

    if !contient(trans, "cotes") {
        poser(trans, "cotes", obj! {});
    }
    let cotes = dans(trans, "cotes");
    poser(cotes, "antipad_mm", round(d_antipad, 4));
    poser(cotes, "antipad_source", if a_antipad { "page" } else { "repli" });
    poser(cotes, "pastilles_internes", internes);
    poser(cotes, "pastilles_internes_source", if a_internes { "page" } else { "repli" });
    poser(trans, "capacite", obj! {
        "totale_fF" => round(c_tot * 1e15, 3),
        "antipad_fF" => round(detail.antipad * 1e15, 3),
        "pastille_depart_fF" => round(detail.pastille_depart * 1e15, 3),
        "pastille_arrivee_fF" => round(detail.pastille_arrivee * 1e15, 3),
        "plans_traverses" => traverses.iter().map(|t| t["nom"].clone()).collect::<Vec<Json>>(),
    });
    c_tot
}

// L'amplitude supposee du signal, en volts, quand la page ne l'envoie pas. Elle
// ne sert qu'au rayonnement, ou elle entre LINEAIREMENT : se tromper d'un
// facteur deux sur l'amplitude, c'est six decibels sur le champ. Trois volts
// trois est l'amplitude logique la plus courante, et c'est aussi la valeur que
// le panneau « Signal » propose par defaut.
pub const AMPLITUDE_REPLI: f64 = 3.3;

// La distance de mesure supposee, en metres, et la classe visee. Trois metres
// et la classe B sont ce qu'un bureau d'etudes mesure en pre-conformite.
pub const DISTANCE_MESURE_REPLI: f64 = 3.0;
pub const CLASSE_CEM_REPLI: &str = "B";

/// L'aire de la boucle que le courant de retour enferme, en m2, et de quoi
/// elle est faite. Rend (aire_m2, detail) ou (0.0, detail) quand on ne sait pas.
///
/// DEUX BOUCLES, ET ELLES NE SE CONFONDENT PAS :
///
///   · LA BOUCLE DU VIA. Le courant descend le barreau sur toute sa hauteur et
///     remonte par le via de masse le plus proche, a `d` de la. Dans le plan
///     vertical qui les contient, cela enferme h_via * d.
///   · LA BOUCLE DE LA CAVITE, quand la reference change. Le retour arrive par
///     un plan, doit repartir par l'autre, et fait pour cela le detour du
///     condensateur de pontage. Le rectangle enferme est large de la distance
///     au pont et haut de l'ECARTEMENT DES DEUX PLANS -- pas de la hauteur du
///     via : le detour ne se fait qu'entre ces deux plans-la.
///
/// ON N'ADDITIONNE PAS UNE AIRE QU'ON N'A PAS. Sans via de retour retenu, la
/// boucle du via n'est pas definie -- le courant revient par du cuivre lointain
/// qu'on ne sait pas situer. On rend alors la seule aire connue, et `minorant`
/// dit que la vraie est plus grande.
pub fn _aire_boucle_retour(trans: &Json, h_via_mm: f64) -> (f64, Json) {
    let ret = &trans["retour"];
    let cav = &trans["cavite"];
    let mut detail = obj! {"minorant" => false, "via_mm2" => Json::Nul, "cavite_mm2" => Json::Nul};
    let mut aire_mm2 = 0.0;

    let retenus: Vec<f64> = els(&ret["vias"]).iter().filter(|f| f["retenu"].vrai()).map(|f| num(f, "distance_mm")).collect();
    if !retenus.is_empty() {
        let d = minf(&retenus);
        let a = h_via_mm * d;
        poser(&mut detail, "via_mm2", round(a, 4));
        poser(&mut detail, "distance_retour_mm", round(d, 4));
        aire_mm2 += a;
    } else if ret["source"].as_str() != Some("absent") && !cav["plan_haut"].vrai() {
        // Rien ne referme, et il n'y a pas de cavite pour l'expliquer : la
        // boucle passe par du cuivre lointain. Le rayon cherche est le seul
        // minorant honnete dont on dispose.
        let r = _nombre(&ret["rayon_mm"], 0.0);
        if r > 0.0 {
            let a = h_via_mm * r;
            poser(&mut detail, "via_mm2", round(a, 4));
            poser(&mut detail, "distance_retour_mm", round(r, 4));
            poser(&mut detail, "minorant", true);
            aire_mm2 += a;
        }
    }

    if cav["plan_haut"].vrai() {
        let h_cav = _nombre(&cav["hauteur_mm"], 0.0);
        let d_pont = _nombre(&cav["pont"]["distance_mm"], 0.0);
        if h_cav > 0.0 && d_pont > 0.0 {
            let a = h_cav * d_pont;
            poser(&mut detail, "cavite_mm2", round(a, 4));
            poser(&mut detail, "distance_pont_mm", round(d_pont, 4));
            poser(&mut detail, "hauteur_cavite_mm", round(h_cav, 4));
            // Un pont SUPPOSE au rayon de recherche est un minorant, et l'aire
            // qu'il donne l'est donc aussi.
            if cav["borne"].vrai() {
                poser(&mut detail, "minorant", true);
            }
            aire_mm2 += a;
        } else if h_cav > 0.0 {
            poser(&mut detail, "minorant", true);
        }
    }

    (aire_mm2 * 1e-6, detail)
}

/// Ce que la boucle de retour de cette transition rayonne, et sa marge.
///
/// C'EST UN PLANCHER, ET LA FICHE DOIT LE PORTER JUSQU'AU BOUT. Le modele est
/// celui du dipole magnetique : une boucle de courant petite devant la
/// longueur d'onde, en champ lointain, sur un site d'essai. Sur une carte
/// reelle, l'emission qui fait echouer l'essai vient presque toujours du
/// courant de MODE COMMUN sur les cables, vingt a quarante decibels au-dessus
/// de ce que la boucle differentielle rend ici. Un chiffre confortable ne
/// promet donc RIEN sur le resultat d'essai ; un chiffre serre, en revanche,
/// est une certitude d'echec, et c'est ce qui le rend utile.
#[allow(clippy::too_many_arguments)]
pub fn _rayonnement_transition(trans: &Json, h_via_mm: f64, z0: f64, f0: f64, tr: f64, v0: f64, distance: f64, classe: &str) -> Option<Json> {
    let (aire, detail) = _aire_boucle_retour(trans, h_via_mm);
    if aire <= 0.0 {
        return None;
    }
    let mut fiche = en_json(&tl::rayonnement_boucle(f0, tr, aire, z0, v0, distance, classe)?);
    if !fiche.vrai() {
        return None;
    }
    maj(&mut fiche, detail);
    poser(&mut fiche, "amplitude_v", round(v0, 3));
    poser(&mut fiche, "modele", "dipole magnetique, champ lointain, reflexion de sol");
    poser(&mut fiche, "reserve",
          "plancher : le mode commun sur les câbles domine presque toujours\
           \x20l'émission réelle, de 20 à 40 dB. Une marge confortable ici ne promet\
           \x20rien sur l'essai ; une marge serrée est en revanche une certitude\
           \x20d'échec.");
    Some(fiche)
}

/// L'impedance serie de la traversee entre plans a une frequence. EN SI.
///
/// `param` a None quand la reference ne change pas : il n'y a alors rien a
/// traverser, et zero est le bon chiffre.
pub fn _impedance_traversee(param: Option<&tl::Traversee>, freq: f64) -> Complex64 {
    // UN SEUL LECTEUR DU DICT DE PARAMETRES, cote bibliotheque : la liste des
    // ponts et le raccourci a un pont s'y lisent au meme endroit, donc
    // l'impedance cascadee ici et la repartition affichee dans la fiche ne
    // peuvent pas divorcer.
    tl::impedance_traversee_param(freq, param)
}

pub const PORT_PONT_MM: f64 = 1.0; // cote d'un port de condensateur (pastilles 0402/0603)
// cle -> la grille du recouvrement envoyee par la page
static _GRILLES_PAGE: Mutex<Vec<(String, Json)>> = Mutex::new(Vec::new());

/// CE QUE LA CAVITE RAYONNE PAR SES BORDS, et sa marge CISPR 32.
///
/// Le courant de retour qui traverse la paire de plans y met des tensions de
/// bord, et ces bords rayonnent (`tl.rayonnement_cavite`, sommation coherente
/// sur la sphere). Le courant est celui du signal : le spectre trapezoidal de
/// `rayonnement_boucle`, amplitude / Z0, en efficace. Aux harmoniques
/// impaires quand elles sont moins de 400 dans la bande ; au-dela, sur
/// l'enveloppe, comme si une harmonique tombait partout -- le pire, et dit.
/// +6 dB de reflexion de sol, comme la boucle.
///
/// C'EST UNE ESTIMATION DE LA CAVITE SEULE : ni cables, ni mode commun, qui
/// dominent souvent l'essai. Une marge serree est un signal fort ; une marge
/// large ne promet rien.
pub fn _rayonnement_cavite(param: &tl::Traversee, f0: f64, tr: f64, v0: f64, z0: f64, distance: f64, classe: &str) -> Json {
    let (f_lo, f_hi) = (30e6, 1e9);
    let f0 = (if f0.is_nan() { 0.0 } else { f0 }).max(1.0);
    let tr = (if tr.is_nan() { 0.0 } else { tr }).max(1e-12);
    let n_bande = (f_hi - f_lo) / (2.0 * f0);
    let (fs, mode): (Vec<f64>, &str) = if n_bande <= 400.0 {
        let fin = (f_hi / f0) as i64 + 2;
        ((1..fin).step_by(2).map(|k| k as f64 * f0).filter(|&f| f >= f_lo && f <= f_hi).collect(), "harmoniques")
    } else {
        (geomspace(f_lo, f_hi, 160), "enveloppe")
    };
    if fs.is_empty() {
        return obj! {"hors_bande" => true};
    }
    let pi = std::f64::consts::PI;
    let sinc = |x: f64| if x == 0.0 { 1.0 } else { (pi * x).sin() / (pi * x) };
    let (e1, _) = tl::rayonnement_cavite(&fs, param);
    let mut meilleur: Option<(usize, f64, f64, f64)> = None;
    for (i, &f) in fs.iter().enumerate() {
        let amp = 2.0 * v0 * f0 / (pi * f) * sinc(f * tr).abs();
        let i_eff = amp / z0.max(1e-6) / 2.0f64.sqrt();
        let e = e1[i] / distance * 2.0 * i_eff; // 1/r, sol, courant
        let e_db = 20.0 * (e.max(1e-30) * 1e6).log10();
        // `limite or nan` : une limite nulle compte pour absente, comme en Python
        let lim = tl::limite_cispr32(f, distance, classe).filter(|l| *l != 0.0).unwrap_or(f64::NAN);
        let marge = lim - e_db;
        if marge.is_finite() && meilleur.is_none_or(|m| marge < m.3) {
            meilleur = Some((i, e_db, lim, marge));
        }
    }
    let Some((i, e_db, lim, marge)) = meilleur else {
        return obj! {"hors_bande" => true};
    };
    obj! {"distance_m" => distance, "classe" => classe.to_uppercase(), "calcul" => mode,
          "pire" => obj! {"freq_hz" => fs[i], "champ_dbuv_m" => round(e_db, 1),
                          "limite_dbuv_m" => lim, "marge_db" => round(marge, 1)},
          "reserve" => "cavité seule : ni câbles ni mode commun, qui dominent souvent l'essai"}
}

/// np.geomspace(a, b, n) pour a, b > 0 : les puissances de dix d'un pas regulier en log10,
/// les deux bouts poses exactement.
pub fn geomspace(a: f64, b: f64, n: usize) -> Vec<f64> {
    let (la, lb) = (a.log10(), b.log10());
    let pas = (lb - la) / (n - 1) as f64;
    let mut v: Vec<f64> = (0..n).map(|k| 10f64.powf(la + k as f64 * pas)).collect();
    v[0] = a;
    v[n - 1] = b;
    v
}

/// LA FOURCHETTE DES ILOTS : la meme cavite, la self de chaque lien entre
/// ilots portee a ses bornes physiques -- couplage parfait de l'aller et du
/// retour, (sqrt L_A - sqrt L_B)^2, et aucun couplage, L_A + L_B -- quand le
/// lien vient du reseau reel ; divisee puis multipliee par deux sinon. Rend {f_bas, f_haut, z_bas, z_haut}
/// du pic de traversee, ou None sans ilot. Le chemin reel d'un net entre deux
/// ilots n'est qu'estime (pistes, vias) : si le verdict change dans la
/// fourchette, il depend de cette estimation, et il faut le savoir.
pub fn traversee_fourchette(cav: &mut Json) -> Res<Option<Json>> {
    let g = &cav["grille"];
    if !g["ilots"].vrai() {
        return Ok(None);
    }
    let fs: Vec<f64> = (0..108).map(|k| 1e5 * 10f64.powf(k as f64 / 24.0)).collect();
    let mut out = obj! {};
    // ENTRE LE COUPLAGE PARFAIT ET AUCUN COUPLAGE quand le lien vient du reseau
    // reel (`_liens_par_reseau`) ; la self divisee et doublee sinon
    let (kb, kh) = if g["lien_ilot_bornes"].vrai() {
        (g["lien_ilot_bornes"][0].as_f64().unwrap_or(0.5), g["lien_ilot_bornes"][1].as_f64().unwrap_or(2.0))
    } else {
        (0.5, 2.0)
    };
    for (nom, k) in [("bas", kb.max(0.05)), ("haut", kh.max(1.0))] {
        let Some(p) = _param_cavite(cav, k)? else { return Ok(None) };
        let z: Vec<f64> = tl::impedance_traversee_vec(&fs, Some(&p)).iter().map(|z| z.norm()).collect();
        let mut i = 0;
        for (k, &v) in z.iter().enumerate() {
            if v > z[i] {
                i = k;
            }
        }
        poser(&mut out, &format!("f_{nom}"), fs[i]);
        poser(&mut out, &format!("z_{nom}"), z[i]);
    }
    _param_cavite(cav, 1.0)?; // la fiche reprend ses valeurs nominales
    Ok(Some(out))
}

// L'inductance de MONTAGE supposee d'un pont entre deux plans -- le
// condensateur lui-meme et ses deux vias --, en nanohenrys, quand la page ne la
// donne pas. C'est l'ordre de grandeur d'un 0402 pose sur deux vias courts.
// Elle ne recouvre PAS l'etalement dans les plans, qui est compte a part :
// Bogatin insiste sur la separation des deux (« It's always a good practice to
// separate the mounting inductance and the cavity spreading inductance »,
// p. 652).
pub const ESL_PONT_REPLI: f64 = 1.0;

// La valeur supposee d'un condensateur de decouplage, en farads, quand la page
// n'envoie pas celle du composant. Cent nanofarads est la valeur universelle du
// decouplage, et le chiffre compte : en dessous de sa resonance propre, c'est SA
// capacite qui fixe l'impedance de la branche, pas son inductance. L'omettre
// ferait passer le pont pour un court-circuit parfait en basse frequence.
pub const C_PONT_REPLI: f64 = 100e-9;

// La resistance serie supposee d'un condensateur de decouplage, en ohms. Elle
// ne compte qu'a la resonance, ou elle borne le creux -- ailleurs elle est
// noyee. Trente milliohms est l'ordre de grandeur d'un MLCC 0402 X7R.
pub const ESR_PONT_REPLI: f64 = 0.03;

// L'aire supposee des deux plans en regard, en millimetres carres, quand la page
// ne l'envoie pas. Elle ne sert qu'a la capacite repartie de la cavite, et elle
// est prise PETITE a dessein : une aire surestimee donne une capacite
// surestimee, donc une traversee qui parait meilleure qu'elle n'est.
pub const AIRE_PLANS_REPLI: f64 = 400.0;

/// La fiche d'une cavite MODALE : le rectangle, le via et chaque pont de la
/// carte -- direct (un condensateur entre les deux plans) ou INDIRECT (une
/// resistance de 1 ohm au plus vers un autre rail, puis les condensateurs de
/// ce rail vers le plan d'en face). `_param_cavite` en fait le reseau.
///
/// ponytail: l'aval d'un pont indirect suit le rail relais comme un plan
/// au-dessus de la meme masse (etalement via-via a la hauteur de la cavite) ;
/// un rail route en pistes coute plus. Un seul niveau de relais.
#[allow(clippy::too_many_arguments)]
pub fn _cavite_modale(
    fiche: &mut Json, via: &Json, rect: &Json, x0: f64, y0: f64, h_cav: f64, er_cav: f64, d_percage: f64, rayon: f64,
) {
    let trajet = |d: f64| {
        if d > 0.0 { tl::inductance_etalement_via_via(h_cav * 1e-3, d * 1e-3, d_percage.max(1e-3) * 1e-3) } else { 0.0 }
    };
    let br = |p: &Json, d_extra: f64| {
        let esl = _nombre(&p["esl_nH"], ESL_PONT_REPLI) * 1e-9;
        let esr = _nombre(if !nul(&p["esr_ohm"]) { &p["esr_ohm"] } else { &p["esr"] }, ESR_PONT_REPLI);
        obj! {"l" => esl + trajet(d_extra), "esr" => esr,
              "c" => _nombre(&p["capacite_F"], C_PONT_REPLI)}
    };

    let (mut detail, mut branches): (Vec<Json>, Vec<Json>) = (Vec::new(), Vec::new());
    for p in els(&via["ponts_carte"]) {
        let (px, py_) = (_nombre(&p["x"], x0), _nombre(&p["y"], y0));
        detail.push(obj! {"x" => round(px, 4), "y" => round(py_, 4),
                          "distance_mm" => round(py::hypot(px - x0, py_ - y0), 4),
                          "repere" => str_ou_vide(&p["repere"]),
                          "capacite_F" => _nombre(&p["capacite_F"], C_PONT_REPLI),
                          "capacite_source" => if !nul(&p["capacite_F"]) { "page" } else { "repli" }});
        branches.push(br(p, 0.0));
    }
    /// La branche d'un relais et ses suivants, son chemin le plus court
    /// jusqu'a un condensateur, et le nombre de condensateurs en aval ; None
    /// sans aval. `depuis` : la position du relais precedent, d'ou part le
    /// trajet dans le rail qui les relie.
    fn relais(p: &Json, depuis: Option<(f64, f64)>, br: &dyn Fn(&Json, f64) -> Json, trajet: &dyn Fn(f64) -> f64) -> Option<(Json, f64, i64)> {
        let (px, py_) = (_nombre(&p["x"], 0.0), _nombre(&p["y"], 0.0));
        let (mut aval, mut chemins, mut n) = (Vec::new(), Vec::new(), 0i64);
        for q in els(&p["caps"]) {
            let d = py::hypot(_nombre(&q["x"], px) - px, _nombre(&q["y"], py_) - py_);
            aval.push(br(q, d));
            chemins.push(d);
            n += 1;
        }
        for s_ in els(&p["suivants"]) {
            if let Some(sous) = relais(s_, Some((px, py_)), br, trajet) {
                aval.push(sous.0);
                chemins.push(py::hypot(_nombre(&s_["x"], px) - px, _nombre(&s_["y"], py_) - py_) + sous.1);
                n += sous.2;
            }
        }
        if aval.is_empty() {
            return None;
        }
        let d_amont = depuis.map_or(0.0, |d| py::hypot(px - d.0, py_ - d.1));
        Some((obj! {"l" => _nombre(&p["esl_nH"], ESL_PONT_REPLI) * 1e-9 + trajet(d_amont),
                    "esr" => _nombre(&p["r_ohm"], 0.0) + ESR_PONT_REPLI,
                    "c" => Json::Nul, "aval" => aval}, minf(&chemins), n))
    }

    fn noms(p: &Json) -> String {
        let suite: Vec<String> = els(&p["suivants"]).iter().map(noms).collect();
        let ou_q = |v: &Json| if v.vrai() { str_py(v) } else { "?".to_string() };
        format!("{} → {}{}", ou_q(&p["repere"]), ou_q(&p["relais"]),
                if suite.is_empty() { String::new() } else { format!(" → {}", suite.join(" | ")) })
    }

    for p in els(&via["ponts_indirects"]) {
        let Some(r) = relais(p, None, &br, &trajet) else { continue };
        let (px, py_) = (_nombre(&p["x"], x0), _nombre(&p["y"], y0));
        // La boucle va du via au premier relais, puis de relais en relais
        // jusqu'au condensateur le plus proche.
        detail.push(obj! {"x" => round(px, 4), "y" => round(py_, 4),
                          "distance_mm" => round(py::hypot(px - x0, py_ - y0) + r.1, 4),
                          "repere" => noms(p), "indirect" => true, "condensateurs" => r.2,
                          "r_ohm" => _nombre(&p["r_ohm"], 0.0)});
        branches.push(r.0);
    }

    let mut ordre: Vec<usize> = (0..detail.len()).collect();
    ordre.sort_by(|&i, &j| num(&detail[i], "distance_mm").total_cmp(&num(&detail[j], "distance_mm")));
    let detail: Vec<Json> = ordre.iter().map(|&i| detail[i].clone()).collect();
    let branches: Vec<Json> = ordre.iter().map(|&i| branches[i].clone()).collect();
    // LA FORME REELLE, quand la page la maille : elle passe devant le
    // rectangle. La grille reste cote serveur (`_GRILLES_PAGE`) ; la fiche, qui
    // repart vers la page, n'en porte que la cle et la taille.
    let grille = &via["cavite_grille"];
    let mut cle_grille: Option<String> = None;
    if grille.vrai() && grille["lignes"].vrai() {
        // Python hachait par `hash()`, qui change a chaque processus : la cle n'a de sens
        // que pour celui qui l'a rendue. Ici, FNV-1a sur l'ecriture de la grille.
        let mut h: u64 = 0xcbf29ce484222325;
        for o in dumps(&obj! {"l" => &grille["lignes"], "p" => &grille["pas"], "x" => &grille["x0"], "y" => &grille["y0"]}).bytes() {
            h = (h ^ o as u64).wrapping_mul(0x100000001b3);
        }
        let cle = format!("{:x}", h & 0xFFFFFFFFFFFF);
        let mut g = _GRILLES_PAGE.lock().unwrap_or_else(|e| e.into_inner());
        if g.len() >= 16 && !g.iter().any(|(k, _)| *k == cle) {
            g.remove(0);
        }
        match g.iter_mut().find(|(k, _)| *k == cle) {
            Some(e) => e.1 = grille.clone(),
            None => g.push((cle.clone(), grille.clone())),
        }
        cle_grille = Some(cle);
    }
    let cellules = || {
        let mut tout_entier = true;
        let mut s = 0.0;
        for l in els(&grille["lignes"]) {
            for c in els(&l[1]).chunks_exact(2) {
                tout_entier &= c[0].as_i64().is_some() && c[1].as_i64().is_some();
                s += c[1].as_f64().unwrap_or(0.0) - c[0].as_f64().unwrap_or(0.0);
            }
        }
        if tout_entier { Json::Entier(s as i64) } else { Json::Flottant(s) }
    };
    let rect_j = {
        let mut o = obj! {};
        for k in ["x0", "y0", "a", "b"] {
            poser(&mut o, k, _nombre(&rect[k], 0.0));
        }
        o
    };
    let pont = detail.first().map(|d| {
        let mut o = obj! {};
        for k in ["x", "y", "distance_mm", "repere"] {
            poser(&mut o, k, &d[k]);
        }
        o
    });
    let sans_pont = detail.is_empty();
    maj(fiche, obj! {
        "modele" => "modal",
        "grille" => cle_grille.map(|cle| obj! {"cle" => cle, "pas_mm" => _nombre(&grille["pas"], 0.0),
                                               "cellules" => cellules()}),
        "cavite_rect" => rect_j,
        "via_xy" => vec![x0, y0], "percage_mm" => d_percage,
        "er_plans" => er_cav, "tan_delta" => _nombre(&via["tan_plans"], 0.02),
        "ponts" => detail.len(), "borne" => false,
        "aucun_pont_carte" => sans_pont,
        "rayon_mm" => if rayon > 0.0 { Some(round(rayon, 4)) } else { None },
        "ponts_detail" => detail, "ponts_branches" => branches,
        "pont" => pont,
    });
    if sans_pont {
        poser(fiche, "raison", "aucun découplage, direct ni par un 0 Ω, ne joint ces\
                               \x20deux plans sur toute la carte : le retour ne\
                               \x20traverse que par la cavité");
    }
}

/// Les branches de pont d'une fiche (`ponts_branches`), telles que `ligne_mom` les lit.
fn ponts(branches: &Json) -> Vec<tl::Pont> {
    els(branches)
        .iter()
        .map(|b| tl::Pont {
            l: num(b, "l"),
            c: b["c"].as_f64(),
            esr: num(b, "esr"),
            aval: b.get("aval").filter(|a| !nul(a)).map(ponts),
        })
        .collect()
}

/// La grille que la page envoie, telle que `ligne_mom` la lit.
fn grille_de(g: &Json) -> tl::Grille {
    let f = |v: &Json| nb(v);
    let i = |v: &Json| nb(v) as i64;
    let lignes = |v: &Json| -> Vec<tl::LigneCellules> { els(v).iter().map(|l| (i(&l[0]), els(&l[1]).iter().map(i).collect())).collect() };
    let reseau = g.get("reseau").filter(|r| r.vrai()).map(|r| tl::Reseau {
        i1: i(&r["i1"]),
        i2: i(&r["i2"]),
        j1: i(&r["j1"]),
        j2: i(&r["j2"]),
        ep: els(&r["ep"]).iter().map(f).collect(),
        nets: els(&r["nets"])
            .iter()
            .map(|n| tl::NetReseau {
                plan: i(&n["plan"]) as usize,
                couches: els(&n["couches"])
                    .iter()
                    .map(|c| tl::CoucheReseau {
                        cu: i(&c["cu"]) as usize,
                        h: Some(f(&c["h"])).filter(|h| *h != 0.0),
                        lignes: lignes(&c["lignes"]),
                        fractions: els(&c["fractions"]).iter().map(|t| (i(&t[0]), i(&t[1]), f(&t[2]))).collect(),
                    })
                    .collect(),
                pistes: els(&n["pistes"]).iter().map(|p| std::array::from_fn(|k| f(&p[k]))).collect(),
                vias: els(&n["vias"]).iter().map(|v| (f(&v[0]), f(&v[1]), els(&v[2]).iter().map(|c| i(c) as usize).collect())).collect(),
            })
            .collect(),
    });
    tl::Grille { pas: f(&g["pas"]), x0: f(&g["x0"]), y0: f(&g["y0"]), lignes: lignes(&g["lignes"]), reseau }
}

/// Les parametres de la traversee entre plans, tels que
/// `tl.impedance_traversee_param` les lit, ou None quand la cavite n'a pas de
/// capacite chiffree.
///
/// UNE SEULE FABRIQUE, parce que deux lecteurs la demandent : la cascade d'un
/// via de parcours (`_modele_transition`), et la verification de la carte
/// entiere (python/analyse_carte.py), qui juge chaque via a trois frequences.
/// Deux copies de ces lignes auraient fini par chiffrer deux traversees.
pub fn _param_cavite(cav: &mut Json, echelle_ilots: f64) -> Res<Option<tl::Traversee>> {
    if cav.vrai() && cav["modele"].as_str() == Some("modal") && cav["capacite_plans_pF"].vrai() {
        let r = cav["cavite_rect"].clone();
        let (vx, vy) = (cav["via_xy"][0].as_f64().unwrap_or(0.0), cav["via_xy"][1].as_f64().unwrap_or(0.0));
        let cle = txt(&cav["grille"], "cle").to_string();
        let grille = _GRILLES_PAGE.lock().unwrap_or_else(|e| e.into_inner()).iter().find(|(k, _)| *k == cle).map(|(_, g)| g.clone());
        let l_cavite = Some(_nombre(&cav["etalement_cavite_nH"], 0.0) * 1e-9);
        if let Some(grille) = grille.filter(|g| g.vrai()) {
            // la cavite maillee, ports dans le repere de la carte
            let mut ports = vec![(vx * 1e-3, vy * 1e-3, num(cav, "percage_mm") * 1e-3)];
            ports.extend(els(&cav["ponts_detail"]).iter().map(|p| (num(p, "x") * 1e-3, num(p, "y") * 1e-3, PORT_PONT_MM * 1e-3)));
            let modal = tl::cavite_grille(&grille_de(&grille), num(cav, "hauteur_mm") * 1e-3, num(cav, "er_plans"),
                                          num(cav, "tan_delta"), &ports, tl::FREQ_MAX_MODES, echelle_ilots)?;
            let g = dans(cav, "grille");
            poser(g, "noeuds", modal.noeuds);
            poser(g, "ponts_hors_ilot", modal.hors);
            poser(g, "ilots", modal.ilots);
            poser(g, "ilots_par_la_page", modal.liens_page);
            poser(g, "via_sur_ilot", modal.sur_ilot);
            if let Some(bo) = modal.bornes_ilot.filter(|_| modal.sur_ilot) {
                poser(g, "lien_ilot_nH", round(bo.2 * 1e9, 3));
                poser(g, "lien_ilot_peec", bo.3);
                poser(g, "lien_ilot_bornes", vec![round(bo.0, 3), round(bo.1, 3)]);
            }
            if let Some(cv) = modal.convergence {
                poser(g, "convergence_pct", round(100.0 * cv, 2));
            }
            if let Some(q) = modal.q_rad_min.filter(|q| *q != 0.0) {
                poser(g, "q_rayonnement_min", round0(q));
            }
            if modal.ecart_via_mm != 0.0 {
                poser(g, "via_hors_recouvrement_mm", modal.ecart_via_mm);
            }
            if let Some(f1) = modal.f_premier.filter(|f| *f != 0.0) {
                poser(cav, "f_premier_mode_hz", round0(f1));
            }
            let c = modal.c;
            return Ok(Some(tl::Traversee { modal: Some(modal), ponts: ponts(&cav["ponts_branches"]), c_plans: Some(c), l_cavite,
                                           l_pont: None, esr_pont: 0.0, c_pont: None }));
        }
        let mut ports = vec![((vx - num(&r, "x0")) * 1e-3, (vy - num(&r, "y0")) * 1e-3, num(cav, "percage_mm") * 1e-3)];
        ports.extend(els(&cav["ponts_detail"]).iter().map(|p| ((num(p, "x") - num(&r, "x0")) * 1e-3, (num(p, "y") - num(&r, "y0")) * 1e-3, PORT_PONT_MM * 1e-3)));
        let c = num(cav, "capacite_plans_pF") * 1e-12;
        return Ok(Some(tl::Traversee {
            modal: Some(tl::cavite_modale(num(&r, "a") * 1e-3, num(&r, "b") * 1e-3,
                                          num(cav, "hauteur_mm") * 1e-3, num(cav, "er_plans"),
                                          num(cav, "tan_delta"), c, &ports, tl::FREQ_MAX_MODES)),
            ponts: ponts(&cav["ponts_branches"]), c_plans: Some(c), l_cavite,
            l_pont: None, esr_pont: 0.0, c_pont: None }));
    }
    if !(cav.vrai() && cav["capacite_plans_pF"].vrai()) {
        return Ok(None);
    }
    let mut param_cav = tl::Traversee {
        modal: None,
        ponts: Vec::new(),
        l_cavite: Some(_nombre(&cav["etalement_cavite_nH"], 0.0) * 1e-9),
        c_plans: Some(_nombre(&cav["capacite_plans_pF"], 0.0) * 1e-12),
        l_pont: None, esr_pont: 0.0, c_pont: None,
    };
    if !nul(&cav["pont"]) {
        // TOUS LES PONTS sont en parallele. `l_pont`/`c_pont` restent
        // renseignes -- ce sont ceux du DOMINANT, que la fiche nomme --
        // mais c'est `ponts` que la cascade lit.
        param_cav.ponts = ponts(&cav["ponts_branches"]);
        param_cav.l_pont = Some(
            _nombre(&cav["etalement_nH"], 0.0) * 1e-9
            + _nombre(&cav["esl_nH"], ESL_PONT_REPLI) * 1e-9);
        param_cav.c_pont = Some(_nombre(&cav["capacite_pont_F"], C_PONT_REPLI));
        param_cav.esr_pont = ESR_PONT_REPLI;
    } else if cav["etalement_seul"].vrai() {
        // Rien d'autre que l'etalement : pas de branche capacitive, on
        // ne compte qu'une inductance serie. C'est un minorant, et la
        // fiche le dit.
        param_cav.c_plans = Some(0.0);
    }
    Ok(Some(param_cav))
}
