//! python/test/banc-crosstalk.py, premiere partie : le reseau multi-ports, l'axe de position,
//! les deux etapes zero, la source, le profil d'espacement, ce qu'on refuse de deviner.

use crate::xt::*;
use crate::*;

/// S11 = 0 et S21 = exp(-j.beta.L), a la precision machine.
///
/// C'EST L'ETALON LE PLUS SEVERE DE TOUT LE FICHIER, et il ne coute rien : sur
/// une ligne dont l'impedance caracteristique vaut l'impedance de reference,
/// la matrice S est connue EXACTEMENT. Toute erreur de signe, de convention de
/// courant ou d'ordre de bloc dans la conversion chaine -> S s'y voit
/// immediatement -- alors qu'elle passerait inapercue sur une ligne desadaptee,
/// ou tout chiffre est plausible.
fn une_ligne_adaptee_ne_reflechit_rien() {
    let (z0, eps) = (50.0, 4.0f64);
    let v = ct::C_0 / eps.sqrt();
    let l_mat = vec![vec![z0 / v]];
    let c_mat = vec![vec![1.0 / (z0 * v)]];
    let longueur = 0.05;
    let w: Vec<f64> = linspace(0.0, 10e9, 11).iter().map(|f| 2.0 * PI * f).collect();
    let s = ct::s_depuis_chaine(&ct::chaine_mtl(&l_mat, &c_mat, longueur, &w, 0.0).unwrap(), z0).unwrap();
    let s11 = s.iter().map(|m| m[0][0].norm()).fold(0.0, f64::max);
    assert!(s11 < 1e-12, "S11 = {s11:.3e} au lieu de zero");
    let ecart = s.iter().zip(&w).map(|(m, w)| (m[1][0] - Complex64::new(0.0, -w * longueur / v).exp()).norm()).fold(0.0, f64::max);
    assert!(ecart < 1e-12, "S21 s'ecarte de {ecart:.3e}");
}

fn deux_rubans() -> (Vec<Vec<f64>>, Vec<Vec<f64>>) {
    let geo = j(r#"{"kind": "micro", "h": 0.2e-3, "epsilon_r": 4.3, "t": 0.035e-3,
                    "conducteurs": [{"w": 0.25e-3, "x": 0.0},
                                    {"w": 0.25e-3, "x": 0.45e-3}]}"#);
    let r = tl::solve_multiline(&geometrie(&geo)).unwrap();
    (r.l, r.c)
}

/// A w = 0 le reseau est un jeu de fils, et la matrice le dit.
///
/// LE POINT k = 0 EST CELUI QUE LA GRILLE HARMONIQUE EXIGE, et c'est aussi
/// celui ou une ecriture naive divise par zero : Z^-1 = (jwL)^-1 diverge. La
/// forme employee (W = L^-1 T sqrt(lambda), sans w) le rend calculable, et
/// c'est ce que ce cas verifie -- sur DEUX conducteurs couples, pour que le
/// couplage soit bien nul au continu et non simplement petit.
fn le_continu_est_un_fil() {
    let (l_mat, c_mat) = deux_rubans();
    let s = &ct::s_depuis_chaine(&ct::chaine_mtl(&l_mat, &c_mat, 0.05, &[0.0], 0.0).unwrap(),
                                 50.0).unwrap()[0];
    let attendu = [[0.0, 0.0, 1.0, 0.0], [0.0, 0.0, 0.0, 1.0],
                   [1.0, 0.0, 0.0, 0.0], [0.0, 1.0, 0.0, 0.0]];
    for i in 0..4 {
        for k in 0..4 {
            assert!((s[i][k].norm() - attendu[i][k]).abs() < 1e-9,
                    "le continu ne rend pas un jeu de fils : |S[{i}][{k}]| = {:.6}", s[i][k].norm());
        }
    }
}

/// Une ligne coupee en deux redonne la ligne entiere.
///
/// TOUTE LA CARTE REPOSE SUR CE DECOUPAGE. Le parcours est coupe a chaque
/// bout de longement, et les matrices de chaine sont multipliees ; si ce
/// produit n'etait pas exact, la carte porterait des marches aux frontieres de
/// blocs -- qui se liraient comme des zones de couplage.
fn la_cascade_ne_change_rien() {
    let (l_mat, c_mat) = deux_rubans();
    let w: Vec<f64> = linspace(0.0, 20e9, 21).iter().map(|f| 2.0 * PI * f).collect();
    let entier = ct::s_depuis_chaine(&ct::chaine_mtl(&l_mat, &c_mat, 0.05, &w, 0.0).unwrap(), 50.0).unwrap();
    let a = ct::chaine_mtl(&l_mat, &c_mat, 0.02, &w, 0.0).unwrap();
    let b = ct::chaine_mtl(&l_mat, &c_mat, 0.03, &w, 0.0).unwrap();
    let produit: Vec<ct::MatC> = b.iter().zip(&a).map(|(b, a)| matmul(b, a)).collect();
    let coupe = ct::s_depuis_chaine(&produit, 50.0).unwrap();
    let mut ecart = 0.0f64;
    for (e, c) in entier.iter().zip(&coupe) {
        for i in 0..4 {
            for k in 0..4 {
                ecart = ecart.max((e[i][k] - c[i][k]).norm());
            }
        }
    }
    assert!(ecart < 1e-12, "la cascade s'ecarte de {ecart:.3e}");
}

/// Une victime qui ne longe que de 25 a 40 mm : la carte monte a 25 mm.
///
/// C'EST LE CAS QUI JUSTIFIE TOUTE LA SECTION. Le NEXT remonte vers le bout
/// proche de la victime : ce qui se couple a l'abscisse x y arrive au bout
/// d'un aller-retour, et c'est cette conversion-la que la carte fait. Un
/// facteur deux oublie sur l'axe -- l'erreur la plus facile a commettre et la
/// plus difficile a voir -- ferait monter la carte a 12,5 mm, ce qui reste une
/// carte parfaitement lisible.
///
/// LA CARTE EST Kb(x), LA REPONSE A UN ECHELON : elle est haute sur TOUT le
/// longement et basse avant. On verifie donc ou elle MONTE -- le premier point
/// a mi-hauteur -- et qu'elle reste basse en amont. (La version precedente
/// tracait la reponse impulsionnelle, qui ne marque que les bords ; ce test
/// en cherchait alors le pic.)
///
/// LA TOLERANCE EST LA RESOLUTION ANNONCEE, et non un nombre choisi : la carte
/// ne peut pas placer un bord plus finement que la bande ne le permet.
fn le_pic_de_next_tombe_ou_le_longement_commence() {
    for debut in [0.0, 12.0, 25.0] {
        let res = an(&doc_essai(vec![pis(debut, 0.45, 40.0, 0.45, "VIC")], &[]));
        let ligne = ligne_de(&res, "VIC", "next").unwrap();
        let axe = nums(&res["carte_chaleur"]["axe"]);
        let vals = nums(&ligne["valeurs"]);
        let tol = n(&ligne["resolution"]);
        let haut = maxf(&vals);
        assert!(haut > 0.0, "aucun couplage a {debut} mm");
        let monte = axe.iter().zip(&vals).find(|(_, v)| **v >= 0.5 * haut).map(|(x, _)| *x).unwrap();
        assert!((monte - debut).abs() <= tol, "longement de {debut} a 40 mm : la carte monte a {monte:.2} mm, tolerance \
                                               {tol:.2} mm");
        let amont: Vec<f64> = axe.iter().zip(&vals).filter(|(x, _)| **x < debut - 1.5 * tol).map(|(_, v)| *v).collect();
        assert!(amont.is_empty() || maxf(&amont) < 0.2 * haut, "longement de {debut} a 40 mm : {:.3} en amont pour {haut:.3} au plus haut",
                maxf(&amont));
    }
}

/// Avant le debut du longement, la carte doit etre PLATE.
///
/// Une carte qui etale du couplage la ou il n'y a pas de voisine designerait
/// un millimetre a corriger qui n'a rien a se reprocher -- et c'est exactement
/// ce que produirait un axe de position faux, ou une fenetre oubliee.
fn la_carte_est_muette_la_ou_rien_ne_longe() {
    let res = an(&doc_essai(vec![pis(25.0, 0.45, 40.0, 0.45, "VIC")], &[]));
    let ligne = ligne_de(&res, "VIC", "next").unwrap();
    let axe = nums(&res["carte_chaleur"]["axe"]);
    let vals = nums(&ligne["valeurs"]);
    let tol = n(&ligne["resolution"]);
    let avant: Vec<f64> = axe.iter().zip(&vals).filter(|(x, _)| **x < 25.0 - 2.0 * tol).map(|(_, v)| *v).collect();
    let apres: Vec<f64> = axe.iter().zip(&vals).filter(|(x, _)| **x >= 25.0).map(|(_, v)| *v).collect();
    assert!(!avant.is_empty() && !apres.is_empty(), "l'axe ne couvre pas les deux zones");
    assert!(maxf(&avant) < 0.25 * maxf(&apres),
            "la carte porte {:.4} avant le longement pour {:.4} dedans", maxf(&avant), maxf(&apres));
}

/// Une piste trop loin ou trop courte est ECARTEE AVEC SON CHIFFRE.
///
/// UNE LISTE OU NE FIGURE QUE CE QUI EST RETENU NE SE DISTINGUE PAS D'UNE
/// CARTE OU IL N'Y A RIEN. C'est le defaut que cette etape existe pour eviter :
/// l'utilisateur doit pouvoir voir que le seuil qu'il a choisi ecarte une
/// piste a 0,80 mm, et le corriger s'il le juge utile.
fn la_preselection_mesure_ce_qu_elle_ecarte() {
    let res = an(&doc_essai(vec![
        pis(0.0, 0.45, 40.0, 0.45, "PROCHE"),          // retenue
        pis(0.0, 1.10, 40.0, 1.10, "AU_DELA"),         // vue, au-dela du seuil
        pis(10.0, 0.45, 10.3, 0.45, "CROISEMENT"),     // trop courte
    ], &[]));
    let par_net = |net: &str| candidat(&res, net).unwrap_or_else(|| panic!("des candidats manquent : {net}"));
    assert!(par_net("PROCHE")["retenu"].vrai(), "la voisine a 0,2 mm doit etre retenue");
    for net in ["AU_DELA", "CROISEMENT"] {
        let c = par_net(net);
        assert!(!c["retenu"].vrai(), "« {net} » ne devrait pas etre retenue");
        assert!(c["raison"].vrai(), "« {net} » est ecartee sans raison");
        assert!(n(&c["distance"]) > 0.0 && n(&c["longueur"]) > 0.0,
                "« {net} » est ecartee sans chiffre : {}", dumps(&c));
    }
    assert!(t(&par_net("AU_DELA")["raison"]).contains("seuil"),
            "la raison doit nommer le seuil : {}", t(&par_net("AU_DELA")["raison"]));
}

/// S = 3W tombe PILE sur le seuil 3 x max(W, H) : RETENU, et chiffre.
///
/// C'EST LE CAS 2 DE LA CARTE D'ESSAI DU BANC CROSSTALK (S = 3W = 1,05 mm,
/// seuil 1,05 mm) : « Analyser la piste » l'ecartait sans chiffre, sauf a
/// ouvrir la distance max. L'egalite est dedans, et deux pour cent au-dessus
/// aussi -- les arrondis d'export. Un couple ecarte a moins de 1,5 x le seuil
/// le DIT, avec son ecart et le geste ; un couple loin est ecarte avec le
/// seuil nomme, comme avant.
fn le_seuil_des_3w_retient_l_egalite_et_nomme_ce_qu_il_ecarte() {
    // Le seuil deduit, lu plutot que suppose : 3 x max(W = 0,25, H = 0,2).
    let seuil = n(&an(&doc_essai(vec![], &[]))["etape0"]["seuils"]["distance_max"]);
    assert!((seuil - 3.0 * 0.25).abs() < 1e-6, "seuil attendu 3W = 0,75 mm : {seuil}");
    let w = 0.25;

    let cas = |s: f64| {
        let res = an(&doc_essai(vec![pis(0.0, w + s, 40.0, w + s, "VIC")], &[]));
        let fiche = candidat(&res, "VIC").unwrap();
        (res, fiche)
    };
    // S = 3W EXACTEMENT : retenu, chiffre.
    let (res, f) = cas(seuil);
    assert!(f["retenu"].vrai() && (n(&f["distance"]) - seuil).abs() < 1e-6, "{}", dumps(&f));
    assert!(res["couples"].vrai() && n(&res["couples"][0]["next"]) > 0.0, "{}", dumps(&res["couples"]));
    assert!(!res["preselection_vide"].vrai());
    // S = 3,02 W : encore dedans (tolerance de 2 %).
    let (res, f) = cas(seuil * 1.02);
    assert!(f["retenu"].vrai() && res["couples"].vrai(), "{}", dumps(&f));
    // S = 3,3 W : ecarte, A MOINS DE 1,5 x LE SEUIL -- la fiche et la carte le
    // disent explicitement, avec le geste.
    let (res, f) = cas(seuil * 1.3);
    assert!(!f["retenu"].vrai() && f["proche_du_seuil"].vrai(), "{}", dumps(&f));
    assert!(t(&f["raison"]).contains("écartée par la présélection") && t(&f["raison"]).contains("seuil"), "{}", t(&f["raison"]));
    assert!(t(&f["raison"]).contains("distance max"), "{}", t(&f["raison"]));
    assert!(res["etape0"]["ecartes_proches"] == vec![obj! {"net" => "VIC", "distance" => &f["distance"], "seuil" => seuil}].j(),
            "{}", dumps(&res["etape0"]["ecartes_proches"]));
    assert!(avertis(&res).iter().any(|a| a.contains("ÉCARTÉE") && a.contains("VIC")),
            "{:?}", avertis(&res));
    assert!(res["preselection_vide"].vrai());
    // S = 5W : ecarte avec le motif, mais loin -- pas « proche du seuil ».
    let (res, f) = cas(5.0 * w);
    assert!(!f["retenu"].vrai() && !f["proche_du_seuil"].vrai(), "{}", dumps(&f));
    assert!(t(&f["raison"]).starts_with("écartée par la présélection (S = 1.250 mm ≥ seuil 0.750 mm)"),
            "{}", t(&f["raison"]));
    assert!(els(&res["etape0"]["ecartes_proches"]).is_empty(), "{}", dumps(&res["etape0"]["ecartes_proches"]));
    assert!(!avertis(&res).iter().any(|a| a.contains("ÉCARTÉE")));
    // Une garde PILE sur le seuil est posee elle aussi.
    let res = an(&doc_essai(vec![pis(0.0, w + seuil, 40.0, w + seuil, "GND"),
                                 pis(0.0, w + seuil + 1.0, 40.0, w + seuil + 1.0, "VIC")], &[]));
    assert!(res["etape0"]["gardes"] == j(r#"["GND"]"#), "{}", dumps(&res["etape0"]["gardes"]));
    // Et la fiche dit la regle.
    assert!(els(&res["hypotheses"]).iter().any(|h| t(h).contains("ÉGALITÉ") && t(h).contains("2 %")), "{}", dumps(&res["hypotheses"]));
}

/// Une piste presente en 0a et sous le seuil en 0b garde son niveau.
///
/// « GEOMETRIQUEMENT PROCHE MAIS ELECTRIQUEMENT DECOUPLEE » est une reponse,
/// et pas un silence : c'est ce qui distingue une piste blindee d'une piste
/// absente, et les deux appellent des gestes de routage opposes.
fn la_confirmation_ecarte_avec_le_niveau() {
    let res = an(&doc_essai(vec![pis(0.0, 0.45, 40.0, 0.45, "SERREE"),
                                 pis(0.0, 1.00, 40.0, 1.00, "LACHE")],
                            &[("distance_max", 2.0.j()), ("seuil_db", (-24.0).j())]));
    let mut retenus: Vec<&str> = els(&res["etape0"]["retenus"]).iter().map(t).collect();
    retenus.sort();
    assert!(retenus == ["LACHE", "SERREE"],
            "l'etape 0a doit retenir les deux : {retenus:?}");
    let serree = couple(&res, "SERREE").unwrap();
    assert!(serree["confirmee"].vrai(),
            "SERREE est a {:.1} dB", n(&serree["pire_db"]));
    let lache = couple(&res, "LACHE").unwrap();
    assert!(!lache["confirmee"].vrai(),
            "LACHE est a {:.1} dB, elle doit tomber sous -24 dB", n(&lache["pire_db"]));
    assert!(n(&lache["next_db"]) > -60.0 && lache["raison"].vrai(),
            "le niveau et la raison doivent rester lisibles : {}", dumps(&lache));
    assert!(n(&lache["distance"]) > 0.0 && n(&lache["longement"]) > 0.0,
            "la geometrie de 0a doit survivre a l'ecart de 0b : {}", dumps(&lache));
    // ELLE A SA COURBE, ET ELLE EST ETIQUETEE. Une carte vide ne dit pas
    // pourquoi elle est vide : « rien a peindre » se lit comme « aucun
    // couplage », alors que le fait est « du couplage, sous le seuil que vous
    // avez pose ». La courbe est donc rendue, marquee non confirmee.
    let lignes = els(&res["carte_chaleur"]["lignes"]);
    let mut tracees: Vec<(&str, bool)> = lignes.iter().map(|l| (t(&l["victime"]), l["confirmee"].vrai())).collect();
    tracees.sort();
    assert!(tracees.iter().map(|x| x.0).collect::<Vec<_>>() == ["LACHE", "SERREE"],
            "les deux courbes doivent etre tracees : {tracees:?}");
    assert!(tracees == [("LACHE", false), ("SERREE", true)],
            "chaque courbe dit si elle est confirmee : {tracees:?}");
    // MAIS ELLE NE PORTE AUCUN VERDICT : ni victime comptee, ni plage peinte
    // sur le cuivre, ni pic « non justifie ». Un verdict rendu sur du bruit se
    // peindrait a cote des vrais, et rien a l'ecran ne les distinguerait.
    assert!(res["victimes"] == j(r#"["SERREE"]"#),
            "seule une confirmee est une victime : {}", dumps(&res["victimes"]));
    let fautifs: Vec<&Json> = els(&res["risques"]).iter().filter(|z| t(&z["victime"]) == "LACHE").collect();
    assert!(fautifs.is_empty(),
            "une non confirmee ne porte pas de risques : {fautifs:?}");
}

/// Un agresseur au centre, une victime de chaque cote : DEUX lignes.
///
/// C'EST LE CAS QUE LE CAHIER DES CHARGES NOMME. Les deux couplages se
/// calculent separement et ne s'agregent PAS -- une victime additionne ses
/// agresseurs, un agresseur n'additionne pas ses victimes --, et l'ecart entre
/// les deux est justement ce qui apprend quelque chose.
fn deux_victimes_de_part_et_d_autre_ne_se_melangent_pas() {
    let res = an(&doc_essai(vec![pis(0.0, 0.45, 40.0, 0.45, "GAUCHE"),
                                 pis(0.0, -0.60, 40.0, -0.60, "DROITE")], &[]));
    let mut nets: Vec<&str> = els(&res["couples"]).iter().map(|c| t(&c["victime"])).collect();
    nets.sort();
    assert!(nets == ["DROITE", "GAUCHE"],
            "il faut une ligne par victime : {nets:?}");
    let (g, d) = (couple(&res, "GAUCHE").unwrap(), couple(&res, "DROITE").unwrap());
    assert!(g["cote"] != d["cote"],
            "les deux victimes sont du meme cote : {} {}", t(&g["cote"]), t(&d["cote"]));
    // LA PLUS PROCHE PREND LE PLUS : c'est la seule chose que la physique
    // impose ici, et elle suffit a verifier que les deux ne sont pas melangees.
    // C'EST VRAI DU NEXT (Kb, la somme des deux couplages), PAS DU PIRE DES
    // DEUX SENS : sous vernis kC rattrape kL quand l'ecart se resserre, et le
    // FEXT (leur difference) de la victime a 0,35 mm depasse le NEXT de celle
    // a 0,20 mm. L'essai comparait `pire_db` et ne tenait qu'a 0,5 dB, sur un
    // FEXT sous-estime d'un quart (cuivre epais, constat 30 de l'audit :
    // kC - kL a -24 % contre differences finies, -4 % depuis).
    assert!(n(&g["next_db"]) > n(&d["next_db"]),
            "la victime a 0,20 mm doit prendre plus que celle a 0,35 mm : \
             {:.2} contre {:.2} dB", n(&g["next_db"]), n(&d["next_db"]));
}

/// Un document qui porte encore un .sNp est REFUSE, jamais ignore.
///
/// L'IGNORER SERAIT LE PIRE DES DEUX. La page croirait avoir fait calculer
/// son fichier ; elle lirait une carte obtenue sur autre chose, sans qu'aucun
/// chiffre ne paraisse anormal. Le refus doit donc nommer les champs en
/// cause -- c'est la seule facon pour l'appelant de savoir quoi retirer.
fn une_matrice_venue_de_l_exterieur_est_refusee() {
    for (champ, valeur) in [("touchstone", "# HZ S RI R 50".j()),
                            ("mapping_confirme", true.j())] {
        let mut doc = doc_essai(vec![pis(0.0, 0.45, 40.0, 0.45, "VIC")], &[]);
        poser(&mut doc, champ, valeur);
        match ct::analyser(&doc, None) {
            Err(exc) => {
                assert!(exc.message.contains(champ),
                        "le refus ne nomme pas « {champ} » : {:?}", exc.message);
                assert!(!exc.conseil.is_empty(), "le refus ne dit pas quoi faire");
            }
            Ok(_) => panic!("« {champ} » n'a pas ete refuse"),
        }
    }

    // ET « PORTS » NE SE REFUSE PAS SUR SON NOM, mais sur ce qu'il NOMME. Le
    // document de simulation partage sa base avec celui-ci et porte deja un
    // « ports » a lui -- les impedances de reference des deux bouts. Refuser
    // sur le seul nom du champ refuserait tout document venu de l'editeur, ce
    // qui est exactement l'inverse du but : le panneau n'afficherait plus
    // jamais de carte, et le message parlerait d'un fichier que personne n'a
    // importe.
    let mut doc = doc_essai(vec![pis(0.0, 0.45, 40.0, 0.45, "VIC")], &[]);
    poser(&mut doc, "ports", j(r#"[{"id": 1, "impedance": 50.0}, {"id": 2, "impedance": 50.0}]"#));
    let res = an(&doc);
    assert!(res["couples"].vrai(),
            "les impédances de référence du document de simulation ne sont PAS \
             une table de correspondance : elles ne doivent rien refuser");
}

/// L'ecart en fonction de l'abscisse, sur le MEME axe que la carte.
///
/// UNE DISTANCE UNIQUE NE DECRIT PAS UN LONGEMENT : une voisine qui contourne
/// un composant s'ecarte puis revient. Ce cas la fait s'approcher a mi-course
/// -- le profil doit rendre les DEUX valeurs, chacune a son abscisse, et
/// l'axe doit etre celui de la carte, sans quoi les deux courbes ne se
/// superposeraient pas.
fn le_profil_d_espacement_suit_le_trace() {
    let res = an(&doc_essai(vec![pis(0.0, 0.90, 20.0, 0.90, "VIC"),
                                 pis(20.0, 0.45, 40.0, 0.45, "VIC")], &[]));
    let fiche = &res["etape0"]["espacements"]["VIC"];
    let axe = nums(&res["carte_chaleur"]["axe"]);
    assert!(els(&fiche["valeurs"]).len() == axe.len(),
            "{} valeurs pour {} colonnes", els(&fiche["valeurs"]).len(), axe.len());
    assert!(res["carte_chaleur"]["espacements"]["VIC"] == *fiche,
            "la carte ne porte pas le meme profil que l'etape 0a");

    let a = |s: f64| {
        let mut i = 0;
        for k in 1..axe.len() {
            if (axe[k] - s).abs() < (axe[i] - s).abs() {
                i = k;
            }
        }
        n(&fiche["valeurs"][i])
    };

    // Ecart bord a bord : 0,90 - 0,25 = 0,65 mm, puis 0,45 - 0,25 = 0,20 mm.
    assert!((a(5.0) - 0.65).abs() < 0.01, "a 5 mm : {}", a(5.0));
    assert!((a(30.0) - 0.20).abs() < 0.01, "a 30 mm : {}", a(30.0));
    assert!((n(&fiche["min"]) - 0.20).abs() < 0.01, "{}", dumps(fiche));
    assert!((n(&fiche["max"]) - 0.65).abs() < 0.01, "{}", dumps(fiche));
    assert!(n(&fiche["couverture"]) > 0.99,
            "la voisine longe partout : {}", n(&fiche["couverture"]));
    // ET LA OU RIEN NE LONGE, IL N'Y A PAS D'ESPACEMENT -- surtout pas zero,
    // qui se lirait comme un contact.
    let court = an(&doc_essai(vec![pis(20.0, 0.45, 40.0, 0.45, "VIC")], &[]));
    let valeurs = els(&court["etape0"]["espacements"]["VIC"]["valeurs"]);
    let axe = nums(&court["carte_chaleur"]["axe"]);
    let debut: Vec<&Json> = axe.iter().zip(valeurs).filter(|(x, _)| **x < 15.0).map(|(_, v)| v).collect();
    assert!(!debut.is_empty() && debut.iter().all(|v| nul(v)),
            "le profil doit etre vide la ou rien ne longe : {:?}", &debut[..5.min(debut.len())]);
}

/// Les portions a peindre sur le cuivre, et elles doivent tomber JUSTE.
///
/// C'EST LA SORTIE QUI SE POSE SUR LE DESSIN, donc celle dont une erreur coute
/// le plus : une plage peinte au mauvais millimetre est visiblement precise et
/// entierement fausse, et rien a l'ecran ne la contredit. Le cas est construit
/// pour qu'on sache ou elle doit tomber : la victime ne longe QUE de 12 a
/// 28 mm, avec un ecart constant -- le couplage s'y fabrique PARTOUT, et la
/// plage a ecarter est le longement entier.
///
/// CE N'ETAIT PAS LE CAS. La carte tracait la reponse IMPULSIONNELLE, qui ne
/// marque que les deux transitions -- la derivee du couplage le long du
/// parcours --, et ce test attendait alors deux plages, centrees sur 12 et
/// 28 mm : « ecarter de 9,5 a 14,2 mm », puis de 25,5 a 30,2 mm, pour un
/// couplage qui se fabrique de 12 a 28.
fn les_plages_a_risque_tombent_sur_le_longement() {
    let res = an(&doc_essai(vec![pis(12.0, 0.45, 28.0, 0.45, "VIC")], &[]));
    let plages = els(&res["risques"]);
    assert!(!plages.is_empty(), "aucune plage rendue sur un longement franc");
    assert!(plages.iter().all(|p| t(&p["victime"]) == "VIC"), "{plages:?}");
    // UNE PLAGE, QUI COUVRE LE LONGEMENT. On tolere la resolution spatiale sur
    // chaque bord : la bande ne distingue pas mieux.
    let res_next = n(&ligne_de(&res, "VIC", "next").unwrap()["resolution"]);
    assert!(plages.len() == 1, "une seule plage attendue, {} : {plages:?}", plages.len());
    assert!((n(&plages[0]["s0"]) - 12.0).abs() <= res_next, "{} {res_next}", dumps(&plages[0]));
    assert!((n(&plages[0]["s1"]) - 28.0).abs() <= res_next, "{} {res_next}", dumps(&plages[0]));
    for p in plages {
        assert!(0.0 <= n(&p["s0"]) && n(&p["s0"]) < n(&p["s1"]) && n(&p["s1"]) <= n(&res["longueur"]) + 1e-6, "{}", dumps(p));
        assert!(0.0 < n(&p["niveau"]) && n(&p["niveau"]) <= 1.0, "{}", dumps(p));
        assert!(p["justifie"] == true.j(),
                "un longement franc n'a pas de plage inexpliquee : {}", dumps(p));
    }

    // LE SEUIL SE REGLE, ET IL AGIT DANS LE BON SENS : plus bas, des plages
    // plus longues. Une victime qui s'ecarte a mi-chemin couple moins sur sa
    // seconde moitie : a 50 % du pire point, seule la premiere est peinte ;
    // a 20 %, les deux. Un reglage qui n'agirait pas serait pire qu'absent.
    let marche = || vec![pis(12.0, 0.45, 20.0, 0.45, "VIC"), pis(20.0, 0.75, 28.0, 0.75, "VIC")];
    let etendue = |res: &Json| els(&res["risques"]).iter().map(|p| n(&p["s1"]) - n(&p["s0"])).sum::<f64>();
    let serre = etendue(&an(&doc_essai(marche(), &[])));
    let large = etendue(&an(&doc_essai(marche(), &[("risque", 0.2.j())])));
    assert!(large > serre,
            "un seuil plus bas doit peindre plus : {large:.2} contre {serre:.2} mm");
    // ET IL EST BORNE : hors de ]0 ; 1[, il ne decoupe rien et on le refuse.
    for mauvais in [0.0, 1.0, -0.2, 1.5] {
        match ct::analyser(&doc_essai(vec![pis(12.0, 0.45, 28.0, 0.45, "VIC")],
                                      &[("risque", mauvais.j())]), None) {
            Err(exc) => assert!(exc.message.to_lowercase().contains("risque"), "{}", exc.message),
            Ok(_) => panic!("un seuil de {mauvais} a ete accepte"),
        }
    }
}

/// Trous de couture, fentes et transitions ressortent AVEC leur abscisse.
///
/// ILS NE SE MELANGENT PAS AU COUPLAGE, et c'est le point : le blindage est
/// deja dans la matrice S. Ce que ces controles ajoutent est une CAUSE
/// possible, superposable a la carte -- un pic a la meme abscisse qu'un trou
/// de couture n'est plus un mystere.
fn le_plan_de_masse_est_controle_a_part_et_localise() {
    let mut doc = doc_essai(vec![pis(0.0, 0.45, 40.0, 0.45, "VIC")], &[]);
    poser(&mut doc, "couture", j(r#"{"positions": [{"s": 2.0, "cote": 1},
                                                    {"s": 4.0, "cote": 1},
                                                    {"s": 2.0, "cote": -1},
                                                    {"s": 4.0, "cote": -1}]}"#));
    poser(&mut doc, "fentes", j(r#"[{"s": 18.0, "longueur": 1.5, "quoi": "fente du plan"}]"#));
    let res = an(&doc);
    let masse = &res["masse"];
    assert!(n(&masse["seuil"]) > 0.0 && masse["source"].vrai(), "{}", dumps(masse));
    let zones = els(&masse["zones"]);
    let fente = zones.iter().rfind(|z| t(&z["type"]) == "fente").unwrap_or_else(|| panic!("la fente n'est pas remontee : {zones:?}"));
    assert!(fente["s0"] == 18.0.j(), "{}", dumps(fente));
    let couture: Vec<&Json> = zones.iter().filter(|z| t(&z["type"]) == "couture").collect();
    assert!(!couture.is_empty(), "aucun trou de couture entre 4 mm et 40 mm ?");
    assert!(maxf(&couture.iter().map(|z| n(&z["pas"])).collect::<Vec<_>>()) > 30.0, "{couture:?}");
    // LA CARTE PORTE LES MEMES ZONES : c'est ce qui permet de superposer.
    assert!(res["carte_chaleur"]["zones"] == masse["zones"]);
    assert!(avertis(&res).iter().any(|a| a.contains("COUTURE")), "le trou de couture n'est pas annonce");
    // ET SANS DONNEES, ON DIT QU'ON N'A RIEN REGARDE -- une liste vide se lit
    // « rien a signaler », ce qui est exactement le contraire.
    let mut aveugle = doc_essai(vec![pis(0.0, 0.45, 40.0, 0.45, "V2")], &[]);
    poser(dans(&mut aveugle, "geometry"), "objects", vec![pis_o(0.0, 0.0, 40.0, 0.0, "CLK", 0, 0.25, 0.0)]);
    let nu = an(&aveugle);
    assert!(!nu["masse"]["mesure"].vrai(), "{}", dumps(&nu["masse"]));
    assert!(avertis(&nu).iter().any(|a| a.contains("PAS été examiné")), "l'absence d'examen n'est pas dite : {:?}", avertis(&nu));
}

/// Le seuil de couture suit le FRONT de l'analyse, et le dit.
///
/// LAMBDA/10 AU GENOU : un front de 9 ns tolere des centimetres, un front de
/// 50 ps quelques millimetres. Sans front, c'est celui de reference (1 ns)
/// qui juge, et la source le nomme.
fn le_seuil_de_couture_dit_de_quelle_regle_il_sort() {
    let (seuil, source, ecarte) = ct::_seuil_couture(&j(r#"{"temps_montee": 9e-9}"#));
    assert!(source.contains("front"), "{source}");
    assert!(seuil > 100.0, "un front de 9 ns tolere des centimetres : {seuil}");
    assert!(ecarte.is_empty(), "il n'y a plus de seconde regle : {ecarte:?}");
    let (seuil2, source2, _e2) = ct::_seuil_couture(&j(r#"{"temps_montee": 50e-12}"#));
    assert!(source2.contains("front") && seuil2 < 5.0, "{seuil2} {source2}");
    let (seuil3, source3, _e3) = ct::_seuil_couture(&j("{}"));
    assert!(source3.contains("1 ns"), "{source3}");
    assert!((seuil3 - ct::_seuil_couture(&j(r#"{"temps_montee": 1e-9}"#)).0).abs() < 1e-9);
}

/// « Aucune piste ne passe » se lisait « tu n'as rien selectionne ».
///
/// Le message parlait des VICTIMES et l'utilisateur le lisait de son
/// AGRESSEUR -- qu'il venait de designer, et qui figure bien dans la fiche
/// avec sa longueur et ses candidats. Il nomme donc maintenant la selection
/// et compte ce qu'elle a fait examiner.
fn une_preselection_vide_ne_se_lit_pas_comme_une_selection_vide() {
    let res = an(&doc_essai(vec![pis(0.0, 8.0, 40.0, 8.0, "LOIN")],
                            &[("distance_max", 0.2.j())]));
    assert!(els(&res["couples"]).is_empty() && els(&res["victimes"]).is_empty());
    let msg: Vec<String> = avertis(&res).into_iter().filter(|x| x.contains("présélection")).collect();
    assert!(!msg.is_empty(), "{:?}", avertis(&res));
    let texte = &msg[0];
    assert!(texte.contains("CLK"), "l'agresseur analyse doit etre nomme : {texte}");
    assert!(texte.contains("candidate"), "{texte}");
    assert!(texte.contains("ce qui longe"),
            "le message doit renvoyer au tableau qui dit pourquoi : {texte}");
}

/// Un trait ambre sur toute la piste est pire que pas de trait.
///
/// LA PLAGE PEINTE SUR LE CUIVRE DIT « CE MILLIMETRE-LA ». Quand la
/// resolution depasse le quart du parcours, la carte ne distingue plus
/// qu'une poignee de zones et la plage couvre le trace entier -- en ayant
/// l'air de designer un endroit. On va alors chercher sur le cuivre un
/// millimetre que le calcul n'a jamais su nommer.
fn une_plage_qui_ne_localise_rien_ne_se_peint_pas() {
    let axe = linspace(0.0, 40.0, 81);
    let valeurs: Vec<f64> = axe.iter().map(|x| (-((x - 20.0).powi(2)) / 4.0).exp()).collect();
    let ligne = |resolution: f64| vec![obj! {"victime" => "V", "agresseur" => "A", "sens" => "next",
                                             "valeurs" => valeurs.clone(), "max" => maxf(&valeurs), "resolution" => resolution}];
    let (fine, grosse) = (ligne(2.0), ligne(15.0));
    assert!(!ct::zones_risque(&fine, &axe, &[], &[], 0.5, None).is_empty(),
            "a 2 mm de resolution sur 40 mm, la plage designe quelque chose");
    assert!(ct::zones_risque(&grosse, &axe, &[], &[], 0.5, None).is_empty(),
            "a 15 mm de resolution sur 40 mm, elle ne designe plus rien");
    // ET LE REFUS SE DIT. Sans lui, le bouton « sur le cuivre »
    // disparait de la fiche et l'on cherche ce qu'on a casse : une
    // commande absente est un bug aux yeux de celui qui s'en servait la
    // veille.
    let mut refus = Vec::new();
    ct::zones_risque(&grosse, &axe, &[], &[], 0.5, Some(&mut refus));
    assert!(refus.len() == 1 && t(&refus[0]["victime"]) == "V", "{refus:?}");
    assert!(t(&refus[0]["raison"]).contains("15") && t(&refus[0]["raison"]).contains("40"),
            "{refus:?}");
    let mut muet = Vec::new();
    ct::zones_risque(&fine, &axe, &[], &[], 0.5, Some(&mut muet));
    assert!(muet.is_empty(), "on ne refuse rien quand on rend quelque chose");
    // LE SEUIL EST CELUI QUE LA FICHE EMPLOIE DEJA POUR ALERTER -- le quart du
    // parcours --, et non un second seuil qui aurait derive du premier.
    let juste = ligne(9.9);
    assert!(!ct::zones_risque(&juste, &axe, &[], &[], 0.5, None).is_empty(), "{juste:?}");
}

/// Une liste de gestes, dans l'ordre de l'effet -- et jamais inventee.
///
/// « -13,8 dB a 12,4 mm » est exact et ne dit pas s'il faut ecarter la piste,
/// coudre le plan, ou ne rien faire. Chaque geste est une relecture de ce qui
/// a deja ete mesure : aucun calcul de plus, aucune regle de l'art posee en
/// douce.
fn la_fiche_dit_ce_qu_il_y_a_a_faire() {
    let risques = j(r#"[{"victime": "V", "agresseur": "A", "s0": 10.0, "s1": 14.0,
                         "niveau": 1.0, "niveau_db": -14.0, "justifie": true,
                         "zone": ""},
                        {"victime": "W", "agresseur": "A", "s0": 30.0, "s1": 33.0,
                         "niveau": 0.8, "niveau_db": -22.0, "justifie": false,
                         "zone": "couture"}]"#);
    let risques = els(&risques);
    let masse = j(r#"{"seuil": 0.5, "couvert": 0.2, "vain": false,
                      "zones": [{"type": "couture", "s0": 5.0, "s1": 9.0, "pas": 4.0},
                                {"type": "fente", "s0": 20.0, "s1": 20.5},
                                {"type": "transition", "s0": 25.0, "s1": 25.0}]}"#);
    let quois = |l: &[Json]| l.iter().map(|a| t(&a["quoi"]).to_string()).collect::<Vec<_>>();
    let rang = |l: &[String], q: &str| l.iter().position(|x| x == q).unwrap_or_else(|| panic!("{q} manque : {l:?}"));
    let faire = ct::actions(risques, &masse, &[], &[], 0.5, None, None, false);
    let quoi = quois(&faire);

    // L'ORDRE EST CELUI DE L'EFFET. Ecarter une piste sous un pic que le
    // dessin n'explique pas ne changerait rien : « aller voir » passe donc
    // APRES le plan, qui en est la cause probable.
    assert!(quoi[0] == "écarter", "{quoi:?}");
    assert!(rang(&quoi, "coudre le plan") < rang(&quoi, "aller voir"), "{quoi:?}");
    rang(&quoi, "reprendre le plan");
    rang(&quoi, "poser un via de masse");
    let ecarter = &faire[0];
    assert!(t(&ecarter["cible"]) == "V" && t(&ecarter["ou"]).contains("10"), "{}", dumps(ecarter));
    assert!(t(&ecarter["pourquoi"]).contains("resserrement"), "{}", dumps(ecarter));
    // LES TEXTES RENDUS PORTENT LEURS ACCENTS : ils s'affichent tels quels.
    assert!(t(&ecarter["pourquoi"]).contains("réel"), "{}", dumps(ecarter));
    let voir = &faire[rang(&quoi, "aller voir")];
    assert!(t(&voir["pourquoi"]).contains("écarter ne servira à rien"), "{}", dumps(voir));

    // LE CUIVRE DE MASSE DEJA ROUTE ET NON COUSU DONNE UN GESTE, ET IL PASSE
    // AVANT LES ZONES DU PLAN. C'est le seul geste de la liste dont on
    // connaisse le sens de l'effet a coup sur : une garde flottante ne blinde
    // pas, elle TRANSFERE. Ces deux mesures levaient un avertissement -- donc
    // une phrase a lire -- et ne produisaient aucun geste.
    let blindage = j(r#"{"gardes": [{"net": "GND_GUARD", "longueur": 30.0,
                                     "longueur_flottante": 12.0, "couture": 4.8},
                                    {"net": "GND_OK", "longueur": 8.0,
                                     "longueur_flottante": 0.0, "couture": 0.9}],
                         "bords_non_cousus": [{"cote": "gauche", "longueur": 15.0,
                                               "couture": 6.2}]}"#);
    let avec = ct::actions(risques, &masse, &[], &[], 0.5, Some(&blindage), None, false);
    let quoi2 = quois(&avec);
    rang(&quoi2, "coudre le plan arrosé");
    assert!(rang(&quoi2, "coudre la garde") < rang(&quoi2, "coudre le plan"), "{quoi2:?}");
    let garde = &avec[rang(&quoi2, "coudre la garde")];
    // LA GARDE COUSUE N'EN PRODUIT PAS : un geste sur un cuivre deja correct
    // ferait percer pour rien, et decredibiliserait les autres lignes.
    assert!(t(&garde["cible"]) == "GND_GUARD", "{}", dumps(garde));
    assert!(quoi2.iter().filter(|q| *q == "coudre la garde").count() == 1, "{quoi2:?}");
    assert!(t(&garde["ou"]).contains("12.00 mm") && t(&garde["ou"]).contains("30.00 mm"), "{}", dumps(garde));
    assert!(t(&garde["pourquoi"]).contains("TRANSFÈRE"), "{}", dumps(garde));
    assert!(t(&garde["pourquoi"]).contains("4.80 mm"), "{}", dumps(garde));
    let bord = &avec[rang(&quoi2, "coudre le plan arrosé")];
    assert!(t(&bord["cible"]).contains("gauche") && t(&bord["pourquoi"]).contains("6.20 mm"), "{}", dumps(bord));
    // SANS RENSEIGNEMENT DE BLINDAGE, RIEN NE CHANGE : une page qui n'envoie
    // pas la mesure garde exactement le comportement d'avant.
    assert!(quois(&ct::actions(risques, &masse, &[], &[], 0.5, None, None, false)) == quoi);

    // LA LISTE EST BORNEE : au-dela, on la lit comme un audit et l'on n'en
    // fait aucun.
    let beaucoup: Vec<Json> = (0..20).map(|i| avec_cles(&risques[0], &[("s0", (i as f64).j()), ("s1", (i as f64 + 1.0).j())])).collect();
    assert!(ct::actions(&beaucoup, &masse, &[], &[], 0.5, None, None, false).len() <= ct::ACTIONS_MAX);
    // ET LA COUPE SE DIT. Elle coupait EN SILENCE : un dessin a huit gestes en
    // montrait six, et les deux autres n'existaient nulle part -- ni a l'ecran,
    // ni dans le rapport exporte, qui est le fichier qu'on emporte.
    let mut omises = Vec::new();
    let coupe = ct::actions(&beaucoup, &masse, &[], &[], 0.5, None, Some(&mut omises), false);
    assert!(coupe.len() == ct::ACTIONS_MAX, "{}", coupe.len());
    assert!(omises.len() == 1, "{omises:?}");
    assert!(omises[0]["nombre"] == (20 + 3 - ct::ACTIONS_MAX).j(), "{omises:?}");
    assert!(omises[0]["natures"].vrai(), "{omises:?}");
    assert!(t(&omises[0]["detail"]).contains(&dumps(&omises[0]["nombre"])), "{omises:?}");
    // UNE LISTE QUI TIENT N'INVENTE PAS D'OMISSION.
    let mut courte = Vec::new();
    ct::actions(risques, &masse, &[], &[], 0.5, None, Some(&mut courte), false);
    assert!(courte.is_empty(), "{courte:?}");

    // RIEN A FAIRE EST UNE REPONSE, et elle se distingue d'un calcul absent.
    assert!(ct::actions(&[], &j(r#"{"zones": []}"#), &[], &[], 0.5, None, None, false).is_empty());

    // ET LA FICHE LA PORTE, tiree du meme calcul que la carte.
    let res = an(&doc_essai(vec![pis(0.0, 0.3, 40.0, 0.3, "VIC")],
                            &[("distance_max", 1.0.j())]));
    assert!(res["actions"].as_liste().is_some());
    let vide = an(&doc_essai(vec![pis(0.0, 8.0, 40.0, 8.0, "LOIN")],
                             &[("distance_max", 0.2.j())]));
    assert!(els(&vide["actions"]).is_empty() && vide["actions"].as_liste().is_some());
}

/// La liste des hypotheses existe meme quand rien n'a ete calcule.
///
/// Un resultat sans ses hypotheses n'est pas verifiable, et le bloc de
/// cloture -- ce que le calcul NE COUVRE PAS, avec le SENS de chaque manque --
/// doit fermer la liste : une cloture au milieu ne cloture rien.
fn les_hypotheses_sont_toujours_rendues_et_se_referment() {
    for res in [an(&doc_essai(vec![], &[])),
                an(&doc_essai(vec![pis(0.0, 0.45, 40.0, 0.45, "VIC")], &[]))] {
        let h = els(&res["hypotheses"]);
        assert!(!h.is_empty(), "aucune hypothese rendue");
        let cloture: Vec<usize> = (0..h.len()).filter(|&k| t(&h[k]).contains("NE COUVRE PAS")).collect();
        assert!(cloture.len() == 1, "il faut UNE cloture, pas {}", cloture.len());
        assert!(cloture[0] == h.len() - 1, "la cloture doit fermer la liste");
        assert!(t(&h[cloture[0]]).to_lowercase().contains("plancher"), "{}", t(&h[cloture[0]]));
    }
    let vide = an(&doc_essai(vec![], &[]));
    assert!(els(&vide["couples"]).is_empty() && nul(&vide["carte_chaleur"]));
    // LA REPONSE GARDE SA FORME MEME VIDE : une clef absente fait chercher une
    // version, une liste vide dit « rien a signaler ».
    for clef in ["victimes", "risques", "couples"] {
        assert!(vide.get(clef).is_some_and(|v| v.as_liste().is_some_and(|l| l.is_empty())),
                "« {clef} » doit être une liste vide, pas absente : {:?}", vide.get(clef));
    }
    assert!(avertis(&vide).iter().any(|a| a.contains("présélection")), "un voisinage vide doit le dire : {:?}", avertis(&vide));
}

pub fn banc() {
    titre("Le reseau multi-ports, contre ce que la theorie impose");
    T("une ligne adaptee ne reflechit rien, et retarde exactement",
      une_ligne_adaptee_ne_reflechit_rien);
    T("au continu, le reseau est un jeu de fils", le_continu_est_un_fil);
    T("deux moities cascadees redonnent la ligne entiere",
      la_cascade_ne_change_rien);

    titre("L'axe de position : le seul cas qui verifie la carte elle-meme");
    T("la carte de NEXT monte la ou le longement commence",
      le_pic_de_next_tombe_ou_le_longement_commence);
    T("la carte reste plate la ou rien ne longe",
      la_carte_est_muette_la_ou_rien_ne_longe);

    titre("Les deux etapes zero, et elles restent deux");
    T("l'etape 0a ecarte avec la distance et la longueur mesurees",
      la_preselection_mesure_ce_qu_elle_ecarte);
    T("S = 3W, pile sur le seuil, est retenu et chiffre ; l'ecarte de peu est nomme",
      le_seuil_des_3w_retient_l_egalite_et_nomme_ce_qu_il_ecarte);
    T("l'etape 0b ecarte avec le niveau de couplage, pas en silence",
      la_confirmation_ecarte_avec_le_niveau);
    T("deux victimes encadrant l'agresseur donnent deux lignes distinctes",
      deux_victimes_de_part_et_d_autre_ne_se_melangent_pas);

    titre("La source est le design, et elle est la seule");
    T("une matrice S venue de l'exterieur est refusee, jamais avalee",
      une_matrice_venue_de_l_exterieur_est_refusee);

    titre("Le profil d'espacement, et son recoupement avec la carte");
    T("le profil d'espacement suit le trace, sur l'axe de la carte",
      le_profil_d_espacement_suit_le_trace);
    T("les plages a risque couvrent le longement, pas ses seules transitions",
      les_plages_a_risque_tombent_sur_le_longement);

    titre("Ce qu'on refuse de deviner en silence");
    T("le plan de masse est controle a part, et les zones sont localisees",
      le_plan_de_masse_est_controle_a_part_et_localise);
    T("le seuil de couture dit de quelle regle il sort, et ce que l'autre disait",
      le_seuil_de_couture_dit_de_quelle_regle_il_sort);
    T("une preselection vide ne se lit pas comme une selection vide",
      une_preselection_vide_ne_se_lit_pas_comme_une_selection_vide);
    T("une plage qui ne localise rien ne se peint pas sur le cuivre",
      une_plage_qui_ne_localise_rien_ne_se_peint_pas);
    T("la fiche dit ce qu'il y a a faire, dans l'ordre de l'effet",
      la_fiche_dit_ce_qu_il_y_a_a_faire);
    T("les hypotheses sont rendues, et le bloc de cloture ferme la liste",
      les_hypotheses_sont_toujours_rendues_et_se_referment);
}
