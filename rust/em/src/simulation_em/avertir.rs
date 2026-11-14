//! Ce que le chemin de retour oblige a dire.

use super::base::*;

fn joint(v: &Json) -> String {
    if v.vrai() { els(v).iter().map(str_py).collect::<Vec<_>>().join(" / ") } else { "?".to_string() }
}

fn entier(v: &Json) -> i64 {
    v.as_f64().unwrap_or(0.0) as i64
}

/// Ce que le chemin de retour oblige a dire, une phrase par defaut reel.
///
/// TROIS AVERTISSEMENTS, ET PAS UN DE PLUS. Un avertissement qui sort sur le
/// cas ordinaire cesse d'etre lu, et emporte avec lui celui qui comptait. On
/// distingue donc :
///
///   · la REFERENCE QUI CHANGE SANS QUE RIEN NE LA REJOIGNE -- le defaut
///     grave, celui qui flatte le resultat, et le seul dont la reponse
///     d'ingenierie soit « ne faites pas cela » plutot qu'un chiffre ;
///   · l'ABSENCE DE VIA DE RETOUR -- l'inductance rendue ne depend alors pas du
///     routage, et c'est cela qu'il faut dire, pas qu'elle est fausse ;
///   · la PAGE QUI N'ENVOIE RIEN -- ce n'est pas un defaut de la carte, c'est
///     une limite de l'outil, et les deux ne se confondent pas.
pub fn _avertir_retour(transitions: &[Json], f_fin: f64) -> Vec<String> {
    if transitions.is_empty() {
        return Vec::new();
    }

    // LE CHANGEMENT DE REFERENCE SE SCINDE EN DEUX, depuis que la cavite est
    // chiffree. Un pont trouve, et le prix est connu : c'est une information de
    // conception, pas une alarme. Aucun pont, et rien ne peut etre chiffre :
    // c'est l'alarme, et elle doit rester seule de son espece pour qu'on la
    // lise.
    // ON N'AFFIRME PAS UNE ABSENCE QU'ON N'A PAS CONSTATEE. Quand la page
    // n'envoie pas les vias voisins, « aucun via de masse ne joint les deux »
    // est une affirmation SUR LA CARTE sans la moindre preuve -- et elle est
    // fausse des qu'il y en a un, ce qui est le cas courant. On exige donc que
    // la recherche ait EU LIEU avant de conclure.
    // UNE DEDUCTION ET UNE OBSERVATION NE SE DISENT PAS PAREIL.
    //
    //   · « aucun VIA DE MASSE ne joint GND a PWR » est une DEDUCTION : elle
    //     decoule des nets, et elle est vraie qu'on ait cherche ou non. C'est
    //     pour cela qu'elle n'exige pas que la page envoie les vias voisins.
    //   · « aucun DECOUPLAGE n'est a cote » est une OBSERVATION : il faut avoir
    //     regarde. Sans `ponts`, l'affirmer serait un enonce sur la carte sans
    //     la moindre preuve -- exactement le defaut qui a fait crier l'outil sur
    //     une carte qui portait un via de masse au bon endroit.
    let change: Vec<&Json> = transitions.iter().filter(|t| {
        t["retour"]["reference_change"].vrai()
            && !t["retour"]["raccorde"].vrai()
            && nul(&t["cavite"]["impedance_fc_ohm"])
    }).collect();
    // Le plan change, et on ne peut pas dire si c'est grave : ni les nets des
    // plans, ni les vias voisins ne sont connus.
    let doute: Vec<&Json> = transitions.iter().filter(|t| {
        t["retour"]["plan_change"].vrai()
            && !t["retour"]["reference_change"].vrai()
            && (nul(&t["retour"]["nets_differents"])
                || t["retour"]["source"].as_str() == Some("absent"))
    }).collect();
    // LA TRAVERSEE EST CHIFFREE DES QU'ON A UNE IMPEDANCE, et c'est le bon
    // critere : ce n'est plus une inductance depuis que la capacite des plans y
    // entre, et le cas « etalement seul » en a une aussi.
    let chiffre: Vec<&Json> = transitions.iter().filter(|t| !nul(&t["cavite"]["impedance_fc_ohm"])).collect();
    let sans: Vec<&Json> = transitions.iter().filter(|t| {
        t["retour"]["source"].as_str() == Some("self")
            && !t["retour"]["reference_change"].vrai()
    }).collect();
    let muet = transitions.iter().filter(|t| t["retour"]["source"].as_str() == Some("absent")).count();

    let mut out: Vec<String> = Vec::new();
    if !change.is_empty() {
        let t = change[0];
        let r = &t["retour"];
        let cherche = t["cavite"]["cherche"].vrai();
        // UNE DEDUCTION NE S'ANNONCE PAS COMME UNE LECTURE. Quand le net d'un
        // des deux plans vient du ROLE force et non du cuivre, tout ce verdict
        // en decoule -- et il reste un verdict CRITIQUE. On le dit ici, une
        // fois, plutot que de laisser croire que la carte l'affirme.
        let supposes = &r["nets_supposes"];
        let reserve = if supposes.vrai() {
            format!(" Le net de {} n'a pas été lu dans le cuivre : il est DÉDUIT\
                     \x20du rôle donné à la couche dans l'empilage. Tout ce verdict\
                     \x20en dépend — vérifiez ce rôle avant d'y croire.", joint(supposes))
        } else {
            String::new()
        };
        let commun = format!("Le plan de référence change à {} via(s) — {} d'un côté, {}\
                              \x20de l'autre. Aucun via de masse ne peut joindre les deux :\
                              \x20il joindrait de la masse à de la masse. Le retour doit\
                              \x20passer par un condensateur de découplage.{}",
                             change.len(), joint(&r["plans_depart"]), joint(&r["plans_arrivee"]), reserve);
        if cherche {
            out.push(commun + " Il n'y en a AUCUN près de ce via : le courant de\
                \x20retour n'a pas de chemin court, et celui qu'il prend ne peut\
                \x20pas être chiffré. L'inductance affichée est un plancher très\
                \x20optimiste. La réponse est de garder la même référence des\
                \x20deux côtés du via, ou d'en poser un à son pied.");
        } else {
            out.push(commun + " Cette page ne cherche pas les découplages : on ne\
                \x20sait donc pas si le retour en trouve un près du via, ni ce\
                \x20qu'il coûte. L'inductance affichée ne le compte pas et elle\
                \x20est optimiste d'autant.");
        }
    }
    if !chiffre.is_empty() {
        let cav = &chiffre[0]["cavite"];
        // LA DEDUCTION RESTE DITE, ET ELLE DOIT L'ETRE. Le fait qu'aucun via
        // de masse ne puisse joindre deux plans de nets differents ne depend
        // pas de ce qu'on a cherche : il decoule des nets. C'est ce que la
        // personne qui route doit comprendre, et le prix de la traversee ne le
        // remplace pas -- il le complete.
        let mut tete = format!("Le plan de référence change à {} via(s) — {} → {}. Aucun via\
                                \x20de masse ne peut joindre les deux : il joindrait de la masse\
                                \x20à de la masse. Le retour passe par la capacité répartie des\
                                \x20deux plans ({:.0} pF{}) et par les découplages qui les joignent",
                               chiffre.len(), str_py(&cav["plan_haut"]), str_py(&cav["plan_bas"]),
                               num(cav, "capacite_plans_pF"),
                               if cav["aire_majoree"].vrai() {
                                   ", calculée sur l'aire de la CARTE ENTIÈRE — donc majorée,\
                                    \x20et la traversée en paraît moins chère qu'elle ne l'est"
                               } else { "" });
        let cout = format!(" : la traversée pèse {:.2} Ω à la fréquence centrale, cascadés\
                            \x20dans le résultat.", num(cav, "impedance_fc_ohm"));
        let sup = &chiffre[0]["retour"]["nets_supposes"];
        if sup.vrai() {
            tete += &format!(" — étant entendu que le net de {} est DÉDUIT du rôle donné\
                              \x20à la couche, et non lu dans le cuivre", joint(sup));
        }
        if cav["modele"].as_str() == Some("modal") {
            let r = &cav["cavite_rect"];
            let p = &cav["pont"];
            let g = &cav["grille"];
            let mut forme = if g.vrai() {
                format!("Cavité maillée sur sa forme réelle ({} cellules de {:.1} mm{})",
                        entier(ou(&g["noeuds"], &g["cellules"])), num(g, "pas_mm"),
                        if g["ponts_hors_ilot"].vrai() {
                            format!(", {} pont(s) sur un autre îlot, sans effet", entier(&g["ponts_hors_ilot"]))
                        } else { String::new() })
            } else {
                format!("Cavité modale {:.0} × {:.0} mm", num(r, "a"), num(r, "b"))
            };
            if cav["f_premier_mode_hz"].vrai() {
                forme += &format!(", premier mode à {:.0} MHz", num(cav, "f_premier_mode_hz") / 1e6);
            }
            if !nul(&g["convergence_pct"]) {
                forme += &format!(" (maille juste à {:.1} % près)", num(g, "convergence_pct"));
            }
            let fo = &cav["fourchette_ilots"];
            if fo.vrai() {
                let (fb, fh) = (num(fo, "f_bas"), num(fo, "f_haut"));
                forme += &format!("; le via est sur un îlot du recouvrement, relié {} : la\
                                   \x20traversée y résonne entre {:.0} et {:.0} MHz selon ce chemin",
                                  if g["ilots_par_la_page"].vrai() { "par le chemin réel du net" }
                                  else { "par estimation (1 nH/mm)" },
                                  minf(&[fb, fh]) / 1e6,
                                  maxf(&[fb, fh]) / 1e6);
            }
            let ry = &cav["rayonnement"]["pire"];
            if ry.vrai() {
                forme += &format!("; la cavité rayonne au pire {:.0} dBµV/m à {:.0} MHz (limite\
                                   \x20{:.0}, marge {:+.0} dB, classe {} à {:.0} m, cavité seule)",
                                  num(ry, "champ_dbuv_m"), num(ry, "freq_hz") / 1e6, num(ry, "limite_dbuv_m"),
                                  num(ry, "marge_db"), str_py(&cav["rayonnement"]["classe"]),
                                  num(&cav["rayonnement"], "distance_m"));
            }
            out.push(format!("{}{} {}, {} pont(s) sur la carte{}.", tete, cout,
                             forme, entier(&cav["ponts"]),
                             if p.vrai() {
                                 format!(" ; le plus proche : {} à {:.2} mm",
                                         if p["repere"].vrai() { str_py(&p["repere"]) } else { "?".into() }, num(p, "distance_mm"))
                             } else {
                                 " — AUCUN : le retour ne traverse que par la cavité.\
                                  \x20Poser un condensateur au pied du via, ou garder la même référence".to_string()
                             }));
        } else if cav["etalement_seul"].vrai() {
            let pourquoi = str_ou_vide(&cav["ponts_raison"]);
            let pourquoi = py::strip(&pourquoi);
            let etal = num(cav, "etalement_cavite_nH");
            let queue = if !pourquoi.is_empty() {
                format!(". Les découplages n'ont pas été cherchés — {}. On ne\
                         \x20compte donc que l'étalement dans les plans ({:.2} nH),\
                         \x20et la traversée est SOUS-ESTIMÉE.", pourquoi, etal)
            } else {
                format!(". Cette page ne cherche pas les découplages : on ne\
                         \x20compte que l'étalement dans les plans ({:.2} nH), et\
                         \x20la traversée est donc SOUS-ESTIMÉE.", etal)
            };
            out.push(tete + &queue);
        } else if cav["borne"].vrai() && cav["aucun_pont_carte"].vrai() {
            out.push(format!(
                "{}{} AUCUN découplage ne joint ces deux plans sur toute la carte :\
                 \x20on a supposé un pont au rayon de {:.1} mm (MINORANT, le réseau\
                 \x20d'alimentation finit par refermer), mais au front rapide le\
                 \x20retour s'étale dans toute la paire de plans. Poser un\
                 \x20condensateur au pied du via, ou garder la même référence.",
                tete, cout, num(cav, "rayon_mm")));
        } else if cav["borne"].vrai() {
            let mut plus_proche_info = String::new();
            if !nul(&cav["plus_proche_hors_rayon_mm"]) {
                let ref_txt = if cav["plus_proche_hors_rayon_ref"].vrai() {
                    format!(" [{}]", str_py(&cav["plus_proche_hors_rayon_ref"]))
                } else { String::new() };
                plus_proche_info = format!(" (le plus proche trouvé{} est à {:.2} mm, trop éloigné)", ref_txt, num(cav, "plus_proche_hors_rayon_mm"));
            }
            out.push(format!(
                "{}{} Aucun découplage n'a été trouvé dans un rayon de {:.1} mm{} : on\
                 \x20a supposé le plus proche À CE RAYON, ce qui est un MINORANT —\
                 \x20le vrai peut être bien plus loin. Poser un condensateur au\
                 \x20pied du via, ou garder la même référence, sont les deux\
                 \x20façons de l'éviter.", tete, cout, num(cav, "rayon_mm"), plus_proche_info));
        } else {
            out.push(format!(
                "{}{} Le découplage retenu est {}, à {:.2} mm. L'étalement dans les\
                 \x20plans croît avec leur ÉCARTEMENT et seulement en logarithme\
                 \x20avec cette distance : amincir le diélectrique entre plans\
                 \x20gagne davantage que rapprocher le condensateur.",
                tete, cout,
                if cav["pont"]["repere"].vrai() { str_py(&cav["pont"]["repere"]) } else { "le plus proche".into() },
                num(&cav["pont"], "distance_mm")));
        }
    }

    // LA RESONANCE D'UN MOIGNON EST LE SEUL DEFAUT DE CETTE FICHE QUI EFFACE LA
    // LIAISON au lieu de la degrader. On ne la signale que si elle tombe dans
    // la bande demandee ou pas loin au-dessus : plus haut, c'est du bruit.
    for t in transitions {
        let mo = &t["moignons"];
        for cle in ["depart", "arrivee"] {
            let f = &mo[cle];
            if !f.vrai() || !f["resonance_hz"].vrai() {
                continue;
            }
            if f_fin > 0.0 && num(f, "resonance_hz") > 2.0 * f_fin {
                continue;
            }
            out.push(format!(
                "Le via du tronçon {} laisse un moignon de {:.3} mm, qui\
                 \x20résonne à {:.2} GHz : à cette fréquence il court-circuite la\
                 \x20liaison. Un via enterré ou un contre-perçage l'enlèvent.",
                entier(&t["troncon"]), num(f, "longueur_mm"), num(f, "resonance_hz") / 1e9));
        }
        if mo["contre_percage"].as_str() == Some("ignore") {
            out.push(format!(
                "Le contre-perçage du via du tronçon {} couperait une couche\
                 \x20où passe le signal : il n'est pas compté, le moignon reste\
                 \x20entier.", entier(&t["troncon"])));
        }
        if mo["incoherent"].vrai() {
            out.push(format!(
                "Le via du tronçon {} est percé sur une portée plus courte que\
                 \x20le saut de couche qu'il réalise : le document est\
                 \x20incohérent, et le moignon n'a pas pu être évalué.",
                entier(&t["troncon"])));
        }
    }
    if transitions.iter().any(|t| matches!(t["moignons"]["connu"], Json::Bool(false)) && !t["moignons"]["incoherent"].vrai()) {
        out.push("La portée percée des vias n'est pas envoyée par cette page : on\
                  \x20ne peut pas savoir s'ils laissent un moignon. Un moignon de 1 mm\
                  \x20vaut 206 fF — deux fois et demie la capacité du via — et\
                  \x20court-circuite la liaison à sa résonance.".to_string());
    }
    if !doute.is_empty() {
        let r = &doute[0]["retour"];
        let mut manque = Vec::new();
        if nul(&r["nets_differents"]) {
            manque.push("l'empilage ne déclare pas le net de ses plans");
        }
        if r["source"].as_str() == Some("absent") {
            manque.push("la page n'envoie pas les vias de masse voisins");
        }
        out.push(format!(
            "Le plan de référence change à {} via(s) — {} d'un côté, {} de\
             \x20l'autre — et on ne peut pas dire si cela pose problème : {}.\
             \x20Deux plans de MASSE différents sont le cas ordinaire, qu'un via\
             \x20de masse referme ; un plan de masse et un plan d'alimentation\
             \x20sont le défaut grave, que rien ne referme. Les deux se\
             \x20ressemblent ici.",
            doute.len(), joint(&r["plans_depart"]), joint(&r["plans_arrivee"]),
            manque.join(" et ")));
    }
    // PAS DE REFERENCE DU TOUT, ET CELA PASSE AVANT LE RESTE. « La reference
    // change vers X » n'a aucun sens quand X n'a pas de cuivre au droit du via.
    // Le courant de retour n'a alors rien a suivre, et aucun condensateur de
    // pontage ne le rattrape : c'est un defaut d'un AUTRE ORDRE.
    let nus: Vec<&Json> = transitions.iter().filter(|t| t["retour"]["plans_sans_cuivre"].vrai()).collect();
    if !nus.is_empty() {
        let r = &nus[0]["retour"];
        out.push(format!(
            "À {} via(s), le plan de référence {} n'a AUCUN CUIVRE au droit du\
             \x20via. Ce n'est pas un changement de référence, c'est une référence\
             \x20ABSENTE : le courant de retour n'a rien à suivre à cet endroit, et\
             \x20aucun condensateur de pontage ne rattrape cela. Le net affiché\
             \x20pour cette couche n'est qu'un repli — c'est celui que l'empilage\
             \x20lui donne, pas celui du cuivre, puisqu'il n'y en a pas. Déplacer\
             \x20le via sur du cuivre de référence, ou refermer le plan.",
            nus.len(), joint(&r["plans_sans_cuivre"])));
    }

    // LE MEME PLAN, UN AUTRE CUIVRE : le dit UNE FOIS, et longuement. La raison
    // portee par chaque via de masse est courte parce qu'elle se peint sur la
    // carte ; le geste qui repare, lui, demande une phrase, et il n'a pas a se
    // repeter dix fois. Il ne s'agit pas de chercher un percage trop court : il
    // s'agit de regarder la DECOUPE du plan.
    let croises: Vec<&Json> = transitions.iter().flat_map(|t| els(&t["retour"]["vias"]).iter())
        .filter(|f| f["plans_autre_versement"].vrai()).collect();
    if !croises.is_empty() {
        let f0 = croises[0];
        let nom = str_py(&f0["plans_autre_versement"][0]);
        out.push(format!(
            "{} via(s) de masse touchent bien {}, mais pas LE MÊME CUIVRE que\
             \x20le via de signal : le plan y est partitionné, et la frontière du\
             \x20versement passe entre les deux. Le nom de la couche est le même,\
             \x20le cuivre ne l'est pas — un via de masse posé hors de l'îlot ne\
             \x20porte pas le retour de ce qui se passe dedans, aussi près soit-il\
             \x20({:.2} mm ici). Ils ne sont donc pas comptés, et l'inductance\
             \x20affichée est un PLANCHER. Le geste n'est pas d'ajouter un via :\
             \x20c'est de garder la même référence des deux côtés de la\
             \x20traversée, ou de la déplacer hors du versement.",
            croises.len(), nom, num(f0, "distance_mm")));
    }

    if !sans.is_empty() {
        // LE CHIFFRE AFFICHE EST UN PLANCHER, ET LE CONSEIL DOIT LE DIRE, SINON
        // IL LE CONTREDIT. L'ancienne phrase promettait que poser un via de
        // retour ferait « tomber de moitié » l'inductance affichée. C'est le
        // contraire de ce que l'outil montre ensuite : sans retour il rend la
        // SELF PARTIELLE -- 0,628 nH sur 1,5 mm de stratifie --, et un retour
        // unique a 1 mm donne une boucle de 0,860 nH, soit +37 %. Il faut
        // descendre sous 0,55 mm pour qu'un seul via passe sous le plancher.
        // La personne qui suit le conseil voyait donc le nombre MONTER.
        //
        // Le conseil reste juste sur la CARTE -- la vraie boucle sans via de
        // retour, qui se referme par le cuivre lointain, vaut bien plus que ce
        // plancher --, mais il ne parle pas de la meme grandeur. On le dit.
        let rayon = sans.iter().map(|t| &t["retour"]["rayon_mm"]).find(|r| r.vrai()).map(|r| r.as_f64().unwrap_or(0.0));
        out.push(format!(
            "Aucun via de masse ne referme la boucle à {} via(s) de signal{} :\
             \x20l'inductance affichée est un PLANCHER — la self partielle du\
             \x20barreau, qui ne dépend pas du routage. La boucle réelle, qui se\
             \x20referme par le cuivre lointain des plans, vaut plusieurs fois\
             \x20cela. Poser un via de retour rend la boucle CALCULABLE et la fait\
             \x20chuter, mais le nombre affiché peut alors MONTER : il cesse\
             \x20d'être un plancher pour devenir une mesure. Il faut un retour à\
             \x20moins de 0,5 mm environ pour passer sous le plancher avec un\
             \x20seul via, ou deux vias en vis-à-vis à 1 mm.",
            sans.len(),
            rayon.map_or(String::new(), |r| format!(" (rayon cherché : {:.1} mm)", r))));
    }
    if muet > 0 {
        out.push(format!(
            "Les vias de masse voisins ne sont pas envoyés par cette page :\
             \x20l'inductance des {} via(s) est celle d'un conducteur seul, sans\
             \x20boucle de retour. Elle ne dépend donc pas de leur placement.",
            muet));
    }

    // LE COURANT QUI REVIENT PAR LA CAPACITE DES PLANS N'EST PAS UN CHEMIN
    // NEUTRE, ET LE MODELE LE PRESENTAIT COMME TEL. Bogatin 7.14 a raison : ce
    // chemin EXISTE, le courant de deplacement traverse la cavite, et refuser de
    // le chiffrer -- ce que faisait la toute premiere version -- declarait
    // impossible ce qui se produit sur toute carte multicouche.
    //
    // MAIS EXISTER N'EST PAS ETRE BENIN. Ce courant-la ne rentre pas dans un
    // conducteur, il ENTRE DANS LA CAVITE : il excite la paire de plans, se
    // promene jusqu'aux bords, y rayonne, et revient en bruit sur le reseau
    // d'alimentation. Rien de tout cela ne se voit dans S21 -- le signal, lui,
    // passe. La fiche pouvait donc annoncer « traversée : 0,08 Ω, front intact »
    // sur une transition qui injecte la moitie de son courant de retour dans le
    // plan d'alimentation, et c'est precisement ce que la personne qui route
    // doit savoir.
    //
    // On ne le dit qu'au-dessus d'un cinquieme du courant : en dessous, un
    // decouplage proche fait son travail et la cavite ne prend que des miettes.
    let cav_part: Vec<&Json> = transitions.iter().map(|t| &t["cavite"])
        .filter(|c| !nul(&c["part_cavite"]) && num(c, "part_cavite") > 0.20).collect();
    if !cav_part.is_empty() {
        let mut c = cav_part[0];
        for k in &cav_part[1..] {
            if num(k, "part_cavite") > num(c, "part_cavite") {
                c = k;
            }
        }
        let part = num(c, "part_cavite");
        // AU-DELA DE CENT POUR CENT, CE N'EST PLUS UN PARTAGE. Les deux branches
        // sont en opposition de phase et le courant CIRCULE entre elles :
        // l'inductance du pont contre la capacite des plans, l'antiresonance
        // parallele. Ecrire « 111 % passe par la cavite » serait absurde ; c'est
        // le phenomene qu'il faut nommer, parce que c'est lui le defaut.
        if part > 1.0 {
            out.push(format!(
                "La traversée est en ANTIRÉSONANCE près de {:.0} MHz : l'inductance\
                 \x20des découplages et la capacité répartie des plans {} / {}\
                 \x20s'annulent, et le courant CIRCULE entre les deux au lieu de\
                 \x20revenir — {:.0} % du courant du signal dans la seule cavité.\
                 \x20C'est le pire cas de la traversée : l'impédance y culmine\
                 \x20({:.1} Ω). Rapprocher un découplage du via déplace cette\
                 \x20fréquence vers le haut ; l'amincissement du diélectrique entre\
                 \x20plans la déplace aussi, et baisse le pic.",
                num(c, "freq_parts_hz") / 1e6,
                str_py(&c["plan_haut"]), str_py(&c["plan_bas"]), 100.0 * part,
                num(c, "impedance_fc_ohm")));
        } else {
            out.push(format!(
                "{:.0} % du courant de retour traverse par la CAPACITÉ RÉPARTIE\
                 \x20des plans {} / {}, et non par un découplage (à {:.1} MHz). Ce\
                 \x20chemin existe — c'est du courant de déplacement, il se referme\
                 \x20— mais il n'est pas neutre : ce courant entre dans la cavité\
                 \x20entre les deux plans, s'y propage jusqu'aux bords de la carte\
                 \x20et revient en bruit sur l'alimentation. Rien de cela ne se voit\
                 \x20sur S21, où le signal passe. Un condensateur de liaison au pied\
                 \x20du via ramène ce courant dans du cuivre.",
                100.0 * part, str_py(&c["plan_haut"]), str_py(&c["plan_bas"]),
                num(c, "freq_parts_hz") / 1e6));
        }
    }

    // LE RAYONNEMENT NE SE DIT QUE QUAND IL A QUELQUE CHOSE A DIRE. Une marge
    // de cinquante décibels n'apprend rien à personne et userait l'attention ;
    // une marge de dix la commande. On ne sort donc la phrase qu'au-dessous du
    // seuil, ou pour dire que le spectre ne touche pas la bande réglementée
    // quand la boucle est par ailleurs signalée comme ouverte.
    let pires: Vec<&Json> = transitions.iter().map(|t| &t["rayonnement"])
        .filter(|r| r["pire"].vrai() && !nul(&r["pire"]["marge_db"])).collect();
    if !pires.is_empty() {
        let mut ray = pires[0];
        for r in &pires[1..] {
            if num(&r["pire"], "marge_db") < num(&ray["pire"], "marge_db") {
                ray = r;
            }
        }
        let pire = &ray["pire"];
        if num(pire, "marge_db") < 20.0 {
            out.push(format!(
                "La boucle de retour enferme {:.2} mm² : à {:.0} MHz elle rayonne\
                 \x20{:.0} dB(µV/m) à {:.0} m, pour une limite CISPR 32 classe {} de\
                 \x20{:.0} — il ne reste que {:.0} dB{}. Et c'est un PLANCHER : le\
                 \x20mode commun sur les câbles domine l'émission réelle de 20 à\
                 \x2040 dB. Réduire l'aire de la boucle est le seul geste qui agit\
                 \x20sur les deux à la fois.",
                num(ray, "aire_boucle_mm2"), num(pire, "freq_hz") / 1e6,
                num(pire, "champ_dbuv_m"), num(ray, "distance_m"), str_py(&ray["classe"]),
                num(pire, "limite_dbuv_m"), num(pire, "marge_db"),
                if ray["minorant"].vrai() { ", et l'aire est un minorant" } else { "" }));
        }
    } else if transitions.iter().any(|t| t["rayonnement"]["hors_bande"].vrai()) {
        out.push("Aucune harmonique de ce signal ne tombe dans la bande d'émission\
                  \x20rayonnée de CISPR 32, qui commence à 30 MHz : le rayonnement de\
                  \x20la boucle de retour n'est pas jugé ici. Cela ne vaut que pour la\
                  \x20boucle — le mode commun sur les câbles, lui, se juge à partir de\
                  \x2030 MHz quel que soit le rythme du signal.".to_string());
    }
    out
}
