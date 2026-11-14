//! La traversee entre deux plans (localisee, modale, maillee), le bilan de sante et le
//! rayonnement de la boucle.

use crate::*;

fn pont(l: f64, c: f64, esr: f64) -> Pont {
    Pont { l, c: Some(c), esr, aval: None }
}

fn zc(z: Complex64) -> f64 {
    z.norm()
}

/// Le modele modal de la traversee (celui de la PI) : condensateur en basse
/// frequence, aucun pic sous le premier mode quand il n'y a pas de pont --
/// c'est le pic du pont SUPPOSE que le modele localise inventait --, et le
/// premier mode a c / (2 a sqrt(er)).
fn la_cavite_modale_ne_resonne_que_la_ou_la_carte_resonne() {
    let (a, h, er) = (0.05, 0.71e-3, 4.37f64);
    let c = capacite_paire_plans(a * a, h, er);
    let cav = cavite_modale(a, a, h, er, 0.02, c, &[(0.0, 0.0, 0.25e-3)], FREQ_MAX_MODES);
    let z = |f: f64| zc(impedance_cavite_modale(f, &cav, &[]).0);
    let z1 = z(1e6);
    assert!((z1 * 2.0 * PI * 1e6 * c - 1.0).abs() < 1e-3, "{z1}");
    let f1 = 2.99792458e8 / (2.0 * a * er.sqrt());
    assert!((cav.f_premier.unwrap() / f1 - 1.0).abs() < 1e-9, "{:?}", cav.f_premier);
    let lin = |a: f64, b: f64, n: usize| -> Vec<f64> { (0..n).map(|i| a + (b - a) * i as f64 / (n - 1) as f64).collect() };
    let fs = lin(20e6, 0.8 * f1, 200);
    let zs: Vec<f64> = fs.iter().map(|&f| z(f)).collect();
    let pics: Vec<usize> = (1..zs.len() - 1).filter(|&i| zs[i] > zs[i - 1] && zs[i] > zs[i + 1]).collect();
    assert!(pics.is_empty(), "pic sous le premier mode a {:.0} MHz", fs[pics[0]] / 1e6);
    let zr = lin(0.97 * f1, 1.03 * f1, 61).iter().map(|&f| z(f)).fold(0.0, f64::max);
    assert!(zr > 5.0 * zs[199], "le premier mode doit ressortir au coin");
    // un pont reel au pied du via fait chuter la traversee, et prend le courant
    let p = Traversee {
        modal: Some(cavite_modale(a, a, h, er, 0.02, c, &[(0.0, 0.0, 0.25e-3), (0.002, 0.0, 1e-3)], FREQ_MAX_MODES)),
        ponts: vec![pont(1e-9, 100e-9, 0.03)],
        ..Default::default()
    };
    assert!(zc(impedance_traversee_param(50e6, Some(&p))) < 0.1 * zs[0]);
    let (parts, _) = repartition_traversee_param(1e6, Some(&p));
    assert!((parts[0] - 1.0).abs() < 0.05, "{parts:?}");
}

/// Le solveur sur grille : sur un carre, il redonne le modele analytique
/// (premier mode, capacite, basse frequence) ; sur un L, ses modes ne sont
/// plus ceux de la boite ; un ilot detache ne touche pas le via.
fn la_cavite_maillee_retrouve_le_rectangle_et_voit_la_forme() {
    let (a, s, h, er) = (50.0, 0.5, 0.71e-3, 4.37);
    let n = (a / s) as i64;
    let grille = |lignes: Vec<LigneCellules>| Grille { pas: s, lignes, ..Default::default() };
    let cg = |g: &Grille, ports: &[(f64, f64, f64)]| cavite_grille(g, h, er, 0.02, ports, FREQ_MAX_MODES, 1.0).unwrap();
    let carre = grille((0..n).map(|j| (j, vec![0, n])).collect());
    let ports = [(0.012, 0.017, 0.25e-3), (0.030, 0.020, 1e-3)];
    let c = capacite_paire_plans(a * a * 1e-6, h, er);
    let g = cg(&carre, &ports);
    let cr = cavite_modale(a * 1e-3, a * 1e-3, h, er, 0.02, c, &ports, FREQ_MAX_MODES);
    let (gf, rf) = (g.f_premier.unwrap(), cr.f_premier.unwrap());
    // le debordement des bords allonge la plaque (Hammerstad) : le premier
    // mode descend de 1 a 3 %, et la capacite monte d'autant
    assert!(0.97 < gf / rf && gf / rf < 0.99, "{gf} {rf}");
    assert!(1.0 < g.c / c && g.c / c < 1.06, "{}", g.c / c);
    // les bords rayonnent : Q de rayonnement de quelques centaines, et le Q
    // total reste borne par le dielectrique (1/tan d = 50)
    let q = g.q_rad_min.unwrap();
    assert!(100.0 < q && q < 5000.0 && g.inv_q.iter().all(|q| 1.0 / q < 50.0), "{q}");
    // la maille est juste : l'ecart au pas double reste sous le pour cent
    assert!(g.convergence.is_some_and(|c| c < 0.01), "{:?}", g.convergence);
    let zt: Vec<Vec<Complex64>> =
        [1e6, 1e8].iter().map(|&f: &f64| vec![0.03 + Complex64::new(0.0, 2.0 * PI * f * 1e-9) + 1.0 / Complex64::new(0.0, 2.0 * PI * f * 100e-9)]).collect();
    let (zg, _) = impedance_cavite_modale_vec(&[1e6, 1e8], &g, &zt);
    let (zr, _) = impedance_cavite_modale_vec(&[1e6, 1e8], &cr, &zt);
    assert!(zg.iter().zip(&zr).all(|(g, r)| (zc(*g) / zc(*r) - 1.0).abs() < 0.15), "{zg:?} {zr:?}");
    // UN L : le carre prive de son quart haut-droit. La boite est la meme, le
    // premier mode ne l'est plus.
    let ell = grille((0..n).map(|j| (j, if j < n / 2 { vec![0, n] } else { vec![0, n / 2] })).collect());
    let cl = cg(&ell, &ports);
    assert!((cl.c / c - 0.75).abs() < 0.05, "{}", cl.c);
    assert!((cl.f_premier.unwrap() / rf - 1.0).abs() > 0.05, "{:?} {rf}", cl.f_premier);
    // UN ILOT : deux bandes separees par une fente de 5 mm. Elles portent les
    // memes nets, donc se rejoignent ailleurs : une self de 1 nH/mm les relie.
    // Le pont de l'autre bande referme le retour en basse frequence, et coute
    // plus que s'il etait sur la meme bande.
    let ilots = grille((0..n).map(|j| (j, vec![0, 40, 50, n])).collect());
    let pt = [(0.005, 0.025, 0.25e-3), (0.040, 0.025, 1e-3)];
    let ci = cg(&ilots, &pt);
    assert!(ci.ilots == 1 && ci.hors == 0 && ci.noeuds == (90 * n) as usize, "{}", ci.noeuds);
    let modules = |cav: &Cavite| -> Vec<f64> { impedance_cavite_modale_vec(&[1e6, 1e8], cav, &zt).0.into_iter().map(zc).collect() };
    let za = modules(&ci);
    let zm = modules(&cg(&carre, &pt));
    assert!(za[0] < 10.0 && za[1] > zm[1], "{za:?} {zm:?}");
    // UNE MIETTE : deux cellules detachees a 1 mm de la cavite (un cou plus
    // etroit que la maille). Elle est reliee a la cavite, et le via s'y
    // accroche par le plus gros cuivre a 1,5 mm.
    let miette = grille((0..n).map(|j| (j, if j == 50 { vec![0, 40, 41, 43] } else { vec![0, 40] })).collect());
    let cm = cg(&miette, &[(0.0210, 0.02525, 0.25e-3)]);
    assert!(cm.noeuds == (40 * n + 2) as usize && cm.ilots == 1, "{}", cm.noeuds);
    // RIEN EN REGARD A 5 MM : le via rejoint la cavite par un etalement en
    // serie, il ne tombe pas sur une miette
    let cf = cg(&miette, &[(0.025, 0.02525, 0.25e-3)]);
    assert!((cf.ecart_via_mm - 5.25).abs() < 0.01, "{}", cf.ecart_via_mm);
    assert!(cf.l_queue[0][0] > cm.l_queue[0][0], "{} {}", cf.l_queue[0][0], cm.l_queue[0][0]);
}

/// LES FORMULES SONT CITEES, DONC ELLES SE VERIFIENT SUR LA SOURCE.
///
/// Eric Bogatin, « Signal and Power Integrity -- Simplified », 2e ed. :
///
///   · eq. 13-31, exemple p. 658 -- rayon interieur 5 mil, exterieur 1 pouce,
///     10 mil entre plans : le livre annonce 270 pH ;
///   · eq. 7-18 p. 247 -- l'impedance d'une paire de plans large ;
///   · eq. 13-35 p. 659 -- deux contacts de via, le cas qui nous occupe.
///
/// UN CHIFFRE RECOPIE D'UN LIVRE SANS ETRE REFAIT EST UN CHIFFRE QU'ON CROIT.
/// Celui-ci est refait.
fn les_formules_de_cavite_rendent_les_exemples_du_livre() {
    let l = inductance_etalement_via_anneau(10.0 * 25.4e-6, 0.005 * 0.0254, 1.0 * 0.0254);
    proche(l * 1e12, 270.0, 5e-3, "l'exemple de l'equation 13-31");

    // L'equation 13-31 EST mu0/(2 pi) : le 5,1 pH/mil du livre n'est qu'un
    // changement d'unites, et le verifier interdit de le prendre pour un
    // coefficient ajuste.
    let (h, a, b) = (1e-3, 1.25e-4, 5e-3f64);
    let exact = (MU_0 * h / (2.0 * PI)) * (b / a).ln();
    proche(inductance_etalement_via_anneau(h, a, b), exact, 1e-12, "13-31 contre mu0/(2 pi)");

    // L'equation 13-35, elle, est EMPIRIQUE et son COEFFICIENT vaut environ
    // quatre fois celui de 13-31 : deux constrictions au lieu d'une, dans les
    // deux plans.
    //
    // ON COMPARE LES COEFFICIENTS, ET NON LES VALEURS. Les deux formules ne
    // prennent pas le meme argument : 13-31 le RAYON du via, 13-35 son
    // DIAMETRE. Sur une geometrie donnee le rapport des valeurs vaut donc 3,4
    // et non 4,1 -- l'ecart est dans les logarithmes, pas dans la physique, et
    // comparer les valeurs testerait ce choix d'argument plutot que le fond.
    let rapport = COEFF_ETALEMENT_VIA_VIA / (MU_0 / (2.0 * PI));
    assert!(3.9 < rapport && rapport < 4.4, "le coefficient de 13-35 vaut {rapport:.2} fois celui de 13-31, attendu 4,1");
    // Et sur une geometrie reelle, elle rend bien plus du triple.
    let v = inductance_etalement_via_via(h, b, 2.0 * a);
    assert!(v > 3.0 * exact, "13-35 devrait valoir plus du triple de 13-31 ici : {:.4} contre {:.4} nH", v * 1e9, exact * 1e9);

    // L'impedance d'une paire de plans : quelques ohms, et elle suit h/w.
    let z = impedance_paire_plans(1e-3, 50e-3, 4.3);
    proche(z, (377.0 / 4.3f64.sqrt()) * 1e-3 / 50e-3, 1e-12, "l'equation 7-18");
    proche(impedance_paire_plans(0.5e-3, 50e-3, 4.3), z / 2.0, 1e-12, "Z0 de la paire de plans est lineaire en l'ecartement");
}

/// LA CAVITE SEULE DONNE 1,7 kOHM A 1 MHz, ET C'EST LE PIEGE.
///
/// C'est exact pour une carte qui n'aurait AUCUN decouplage nulle part, et
/// absurde pour une carte reelle dont le decouplage est simplement plus loin
/// que le rayon cherche. Avec un pont -- mesure ou suppose au rayon -- la
/// branche capacitive du condensateur prend le relais en basse frequence et
/// l'impedance reste raisonnable.
fn la_traversee_ne_diverge_ni_en_bas_ni_en_haut() {
    let (l_cav, c_pp) = (1.06e-9, 95e-12);
    let (l_pont, c_pont) = (2.72e-9, 100e-9);
    for f in [1e5, 1e6, 1e7, 1e8, 1e9, 1e10] {
        let z_seul = zc(impedance_traversee_plans(f, l_cav, c_pp, None, 0.0, None));
        let z_pont = zc(impedance_traversee_plans(f, l_cav, c_pp, Some(l_pont), 0.03, Some(c_pont)));
        assert!(z_seul.is_finite() && z_pont.is_finite(), "l'impedance de traversee diverge a {f:.0e} Hz");
        assert!(z_pont < z_seul, "a {f:.0e} Hz, ajouter un decouplage n'ameliore pas la traversee : {z_pont:.3} contre {z_seul:.3} ohm");
    }
    // ET EN BASSE FREQUENCE, LE PONT DOIT DOMINER LARGEMENT : c'est tout
    // l'interet du decouplage.
    let z1 = zc(impedance_traversee_plans(1e6, l_cav, c_pp, Some(l_pont), 0.03, Some(c_pont)));
    assert!(z1 < 5.0, "un decouplage devrait tenir la traversee sous quelques ohms a 1 MHz, et elle vaut {z1:.1}");
}

/// LA REPARTITION CAVITE / DECOUPLAGE EST LA DIVISION DE COURANT EXACTE.
///
/// Deux branches en parallele se partagent le courant en raison de leurs
/// ADMITTANCES COMPLEXES : I_k / I_total = Y_k / (Y_cav + Y_pont). L'ancienne
/// version prenait 1/|Z| de chaque branche et NORMALISAIT la somme a 1, ce qui
/// n'est le bon calcul que si les deux impedances ont la meme phase.
///
/// LA DIFFERENCE EST MAXIMALE LA OU CE MODELE EXISTE POUR REGARDER. Au
/// voisinage de l'antiresonance parallele -- l'ESL du pont contre la capacite
/// des plans --, les deux courants sont en OPPOSITION DE PHASE et chacun
/// DEPASSE le courant total : c'est le courant circulant, et c'est le
/// phenomene lui-meme. Une somme forcee a 100 % ne peut pas l'ecrire, donc
/// l'effacait.
///
/// On verifie donc contre la division de courant calculee ici, a la main.
fn la_repartition_spectrale_est_une_division_de_courant_complexe() {
    let l_cav = 0.05e-9;
    let c_plans = 1e-9;
    let l_pont = 1.5e-9;
    let c_pont = 100e-9;
    let esr_pont = 0.03;
    let j = Complex64::new(0.0, 1.0);

    let exact = |freq: f64| {
        let w = 2.0 * PI * freq;
        let z_cav = j * w * l_cav + 1.0 / (j * w * c_plans);
        let z_pont = esr_pont + j * w * l_pont + 1.0 / (j * w * c_pont);
        let (y_cav, y_pont) = (1.0 / z_cav, 1.0 / z_pont);
        ((y_pont / (y_cav + y_pont)).norm(), (y_cav / (y_cav + y_pont)).norm())
    };
    let repartition = |f: f64| repartition_retour_plans(f, l_cav, c_plans, Some(l_pont), esr_pont, Some(c_pont));

    // A 10 kHz : les deux branches sont capacitives, donc en phase. La somme
    // vaut un, et le decouplage porte tout.
    let (pp_bf, pc_bf) = repartition(10e3);
    let (ep_bf, ec_bf) = exact(10e3);
    proche(pp_bf, ep_bf, 1e-9, "part du pont a 10 kHz");
    proche(pc_bf, ec_bf, 1e-9, "part de la cavite a 10 kHz");
    proche(pp_bf + pc_bf, 1.0, 1e-3, "somme a 10 kHz");
    assert!(pp_bf > 0.95, "le decouplage ne porte pas le retour a 10 kHz ({pp_bf:.2})");
    assert!(pc_bf < 0.05, "la cavite porte trop de retour a 10 kHz ({pc_bf:.2})");

    // A 500 MHz : la cavite prend le dessus face a l'ESL du condensateur, et le
    // courant CIRCULE entre les deux branches -- la somme depasse un.
    let (pp_hf, pc_hf) = repartition(500e6);
    let (ep_hf, ec_hf) = exact(500e6);
    proche(pp_hf, ep_hf, 1e-9, "part du pont a 500 MHz");
    proche(pc_hf, ec_hf, 1e-9, "part de la cavite a 500 MHz");
    assert!(pc_hf > pp_hf, "la cavite ne prend pas le dessus en HF : cavite={pc_hf:.2}, pont={pp_hf:.2}");

    // ET LE COURANT CIRCULANT EXISTE, ce qui est le point : a l'antiresonance
    // les deux parts depassent chacune 100 % et la somme vaut plusieurs fois un.
    let f_anti = 1.0 / (2.0 * PI * (l_pont * c_plans).sqrt());
    let (pp_ar, pc_ar) = repartition(f_anti);
    assert!(
        pp_ar > 1.0 && pc_ar > 1.0,
        "le courant circulant de l'antiresonance ({:.0} MHz) n'apparait pas : pont={pp_ar:.2}, cavite={pc_ar:.2}",
        f_anti / 1e6
    );
}

/// PLUSIEURS CONDENSATEURS SONT PLUSIEURS BRANCHES EN PARALLELE.
///
/// La version precedente ne gardait que le condensateur le PLUS PROCHE, en
/// disant que c'etait « le sens prudent ». C'etait vrai et ce n'etait pas le
/// sens juste : le courant se repartit entre TOUS les ponts, en raison de
/// leurs admittances. Sur le cas du banc, ne compter que le plus proche
/// surestime l'impedance de la traversee d'un facteur 1,6.
///
/// ET LA VALEUR DU CONDENSATEUR COMPTE PLUS QUE SA DISTANCE en basse
/// frequence : un 1 nF a 7 mm ne porte que quatre millemes du retour la ou
/// deux 100 nF se partagent le reste. C'est SA capacite qui fixe l'impedance
/// de la branche, pas son etalement.
fn tous_les_ponts_comptent_pas_seulement_le_plus_proche() {
    let (l_cav, c_plans) = (1.0917e-9, 74.82e-12);
    let ponts = [
        pont(2.6704e-9, 100e-9, 0.03), // C12 a 2 mm
        pont(3.2808e-9, 100e-9, 0.03), // C13 a 4 mm
        pont(3.7735e-9, 1e-9, 0.03),   // C14 a 7 mm, 1 nF
    ];
    let f = 12e6;

    let (parts, part_cav) = repartition_traversee(f, l_cav, c_plans, &ponts);
    assert!(parts.len() == 3, "une part par pont");
    assert!(parts[0] > parts[1] && parts[1] > parts[2], "l'ordre des parts ne suit pas les branches : {parts:?}");
    proche(parts[0], 0.6166, 0.01, "part du 100 nF a 2 mm");
    proche(parts[1], 0.3899, 0.01, "part du 100 nF a 4 mm");
    assert!(parts[2] < 0.01, "un 1 nF a 7 mm ne doit presque rien porter a 12 MHz ({:.4})", parts[2]);
    assert!(part_cav < 0.01, "la cavite ne porte presque rien face a des 100 nF ({part_cav:.4})");

    // L'IMPEDANCE SUIT LA MEME LISTE. Un seul pont surestime.
    let z_tous = zc(impedance_traversee_ponts(f, l_cav, c_plans, &ponts));
    let z_seul = zc(impedance_traversee_plans(f, l_cav, c_plans, Some(ponts[0].l), 0.03, ponts[0].c));
    assert!(z_seul > z_tous, "compter tous les ponts doit BAISSER l'impedance : {z_seul:.4} contre {z_tous:.4}");
    proche(z_seul / z_tous, 1.62, 0.05, "le facteur entre un pont et trois");

    // UNE SEULE IMPLEMENTATION derriere les deux formes. Le raccourci a un pont
    // doit rendre EXACTEMENT ce que rend la forme generale avec une liste d'un.
    let z_g = zc(impedance_traversee_ponts(f, l_cav, c_plans, &ponts[..1]));
    proche(z_seul, z_g, 1e-12, "le raccourci a un pont");
    let (pp, pc) = repartition_retour_plans(f, l_cav, c_plans, Some(ponts[0].l), 0.03, ponts[0].c);
    let (pg, pcg) = repartition_traversee(f, l_cav, c_plans, &ponts[..1]);
    proche(pp, pg[0], 1e-12, "la repartition a un pont");
    proche(pc, pcg, 1e-12, "la part de cavite a un pont");

    // SANS AUCUN PONT, c'est la cavite seule -- le chemin qui existe toujours.
    let z_cav = zc(impedance_traversee_ponts(f, l_cav, c_plans, &[]));
    proche(z_cav, zc(impedance_traversee_plans(f, l_cav, c_plans, None, 0.0, None)), 1e-12, "la cavite seule");
}

/// LA FORME FERMEE, ET LA BANDE OU ELLE SE JUGE.
///
/// Une boucle petite devant la longueur d'onde est un dipole magnetique :
/// E = eta0 k^2 I A / (4 pi r), soit 1,3169e-14 f^2 A I / r en SI. Le
/// coefficient s'ECRIT a partir de mu0 et c -- une constante recopiee est une
/// constante qu'on ne peut plus verifier.
fn le_rayonnement_de_la_boucle_est_le_dipole_magnetique() {
    let coeff = MU_0 * PI / C_0;
    proche(COEFF_DIPOLE_MAGNETIQUE, coeff, 1e-12, "le coefficient du dipole");
    proche(COEFF_DIPOLE_MAGNETIQUE, 1.31686e-14, 1e-5, "sa valeur numerique");

    // Les trois dependances, une par une : f au CARRE, A et I lineaires, r en 1/r.
    let base = champ_boucle_rayonnant(100e6, 1e-6, 10e-3, 3.0, false);
    proche(champ_boucle_rayonnant(200e6, 1e-6, 10e-3, 3.0, false) / base, 4.0, 1e-9, "le champ croit comme f au carre");
    proche(champ_boucle_rayonnant(100e6, 2e-6, 10e-3, 3.0, false) / base, 2.0, 1e-9, "le champ est lineaire en aire");
    proche(champ_boucle_rayonnant(100e6, 1e-6, 20e-3, 3.0, false) / base, 2.0, 1e-9, "le champ est lineaire en courant");
    proche(champ_boucle_rayonnant(100e6, 1e-6, 10e-3, 6.0, false) / base, 0.5, 1e-9, "le champ decroit en 1/r");
    // La reflexion du sol d'un site d'essai vaut SIX decibels, au pire.
    proche(champ_boucle_rayonnant(100e6, 1e-6, 10e-3, 3.0, true) / base, 2.0, 1e-9, "la reflexion de sol");

    // La bande reglementee de CISPR 32 COMMENCE A 30 MHz, et en dessous il n'y a
    // pas de limite -- pas une limite large, PAS DE LIMITE. Rendre zero ferait
    // croire au contraire, et c'est ce que la fiche doit savoir dire.
    assert!(limite_cispr32(12e6, 3.0, "B").is_none(), "CISPR 32 ne fixe pas de limite rayonnee sous 30 MHz");
    proche(limite_cispr32(36e6, 3.0, "B").unwrap(), 40.0, 1e-9, "classe B a 3 m, VHF bas");
    proche(limite_cispr32(500e6, 3.0, "B").unwrap(), 47.0, 1e-9, "classe B a 3 m, UHF");
    proche(limite_cispr32(36e6, 10.0, "B").unwrap(), 30.0, 1e-9, "classe B a 10 m");

    // Le champ lointain commence a lambda / 2 pi : a 3 m, au-dessus de 16 MHz.
    assert!(distance_champ_lointain(12e6) > 3.0, "12 MHz : champ proche a 3 m");
    assert!(distance_champ_lointain(36e6) < 3.0, "36 MHz : champ lointain a 3 m");
}

/// CE QUE LA FICHE DOIT RENDRE LISIBLE : ce qui fait bouger le chiffre.
///
/// A 12 MHz avec un front de 13 ns, une boucle de quelques millimetres carres
/// est a plus de trente decibels sous la limite -- il n'y a rien a faire. Le
/// MEME routage a 100 MHz avec un front de 300 ps frole la limite. C'est le
/// rythme du signal qui decide, pas le dessin, et c'est ce que la fiche doit
/// faire comprendre.
fn le_rayonnement_suit_l_aire_de_la_boucle_et_le_rythme() {
    let aire = 8.5e-6; // 8,5 mm2 : un pont a 8 mm sur 1,065 mm
    let marge = |r: &Rayonnement| r.pire.as_ref().unwrap().marge_db.unwrap();

    let lent = rayonnement_boucle(12e6, 13e-9, aire, 50.0, 3.3, 3.0, "B").unwrap();
    let rapide = rayonnement_boucle(100e6, 0.3e-9, aire, 50.0, 3.3, 3.0, "B").unwrap();
    assert!(marge(&lent) > 30.0, "a 12 MHz / 13 ns la boucle ne doit rien couter ({:.1} dB)", marge(&lent));
    assert!(marge(&rapide) < marge(&lent) - 30.0, "le rythme du signal doit dominer le verdict : {:.1} contre {:.1} dB", marge(&rapide), marge(&lent));

    // Et le geste qui compte est l'AIRE : diviser la distance au pont par huit
    // rend dix-huit decibels, parce que le champ est lineaire en aire.
    let serre = rayonnement_boucle(100e6, 0.3e-9, aire / 8.0, 50.0, 3.3, 3.0, "B").unwrap();
    let gagne = marge(&serre) - marge(&rapide);
    proche(gagne, 20.0 * 8f64.log10(), 0.5, "le gain d'une aire divisee par huit");

    // LA FONDAMENTALE DE 12 MHz EST HORS BANDE, et la fiche le porte plutot que
    // d'inventer une limite.
    let h1 = &lent.harmoniques[0];
    assert!(h1.limite_dbuv_m.is_none() && h1.marge_db.is_none(), "la fondamentale a 12 MHz ne doit pas avoir de limite");
    assert!(!h1.champ_lointain, "a 12 MHz, 3 m est en champ proche");
}

/// LE SCORE MESURE LE FRONT, PAS LA BOUCLE, ET LE VERDICT LE DISAIT QUAND MEME.
///
/// Sur une transition GND -> PWR ou AUCUN via de masse ne peut refermer le
/// retour, le bilan sortait « Excellent : signal quasiment intact, boucle de
/// retour refermee de facon optimale ». La premiere moitie etait vraie -- a
/// 12 MHz avec un front de 13 ns, la traversee ne coute rien au signal --, la
/// seconde etait inventee : la fiche venait d'ecrire, une ligne plus haut, que
/// l'inductance rendue etait un PLANCHER faute de retour.
fn le_verdict_n_affirme_pas_une_boucle_qu_il_ne_voit_pas() {
    let (l_boucle, c_via) = (0.69e-9, 88e-15);
    let bilan = |retour_ferme| bilan_sante_transition(l_boucle, c_via, None, &OptionsBilan { z0: 50.0, f0: 12e6, tr: 13e-9, retour_ferme, ..Default::default() });

    let ouvert = bilan(Some(false));
    let ferme = bilan(Some(true));
    let muet = bilan(None);

    // Le score ne bouge pas : c'est bien le meme signal, et il passe.
    proche(ouvert.score_reconstruction_pct, ferme.score_reconstruction_pct, 1e-9, "le score ne depend pas de ce qu'on sait de la boucle");
    assert!(ouvert.score_reconstruction_pct > 95.0, "a 12 MHz avec tr = 13 ns le front doit passer ({:.2})", ouvert.score_reconstruction_pct);

    // Mais le verdict, lui, cesse d'affirmer ce qu'il ne voit pas.
    assert!(!ouvert.verdict.contains("refermee de facon optimale"), "le verdict affirme encore une boucle refermee : {}", ouvert.verdict);
    assert!(ouvert.verdict.contains("plancher"), "le verdict ne dit pas que le chiffre est un plancher : {}", ouvert.verdict);
    assert!(!ferme.verdict.contains("plancher"), "une boucle refermee n'a pas a porter la reserve : {}", ferme.verdict);
    assert!(muet.verdict.contains("n'a pas ete verifie"), "une boucle non verifiee doit se dire comme telle : {}", muet.verdict);
}

/// AJOUTER UN DEFAUT NE PEUT PAS FAIRE MONTER LA NOTE.
///
/// Le terme de temps de montee du bilan de sante prenait, des qu'une cavite
/// etait presente, l'inductance du PONT SEULE -- ou `l_cavite + 5 nH`, une
/// constante que rien ne justifiait. L'inductance de BOUCLE du via, celle que
/// tout le reste de l'outil sert a mesurer, disparaissait alors du calcul.
///
/// MESURE AVANT CORRECTIF : un via a 50 nH de boucle notait 4,98 % sans
/// traversee de plan et 46,11 % avec. Ajouter un changement de reference
/// AMELIORAIT le score d'un facteur neuf. Les deux inductances sont en SERIE
/// sur le meme courant ; elles s'additionnent.
fn une_traversee_de_plan_n_ameliore_jamais_le_score() {
    let c_via = 120e-15;
    let cav = Traversee { l_cavite: Some(0.17e-9), c_plans: Some(76e-12), l_pont: Some(1.3e-9), esr_pont: 0.03, c_pont: Some(100e-9), ..Default::default() };
    let score = |l_boucle: f64, cavite: Option<&Traversee>| {
        bilan_sante_transition(l_boucle, c_via, cavite, &OptionsBilan { z0: 50.0, f0: 100e6, tr: 0.1e-9, ..Default::default() }).score_reconstruction_pct
    };

    for l_boucle in [0.63e-9, 2e-9, 10e-9, 50e-9] {
        let sans = score(l_boucle, None);
        let avec = score(l_boucle, Some(&cav));
        assert!(avec <= sans, "L={:.1} nH : la traversee de plan FAIT MONTER le score ({sans:.2} sans, {avec:.2} avec)", l_boucle * 1e9);
    }

    // ET L'INDUCTANCE DE BOUCLE PESE ENCORE, cavite ou non : c'est la seule
    // grandeur que le routage commande, elle doit rester lisible dans la note.
    let bon = score(0.63e-9, Some(&cav));
    let mauvais = score(50e-9, Some(&cav));
    assert!(bon - mauvais > 20.0, "avec une cavite, l'inductance de boucle ne change presque plus la note ({bon:.2} contre {mauvais:.2})");
}

/// LE COEFFICIENT EMPIRIQUE MAJORE LA FORME FERMEE, ET C'EST LE BON SENS.
///
/// Dans la limite plans minces, deux contacts ponctuels dans une paire de
/// plans se resolvent exactement : L = (mu0 h / pi) ln(s/r), soit DEUX fois
/// l'equation 13-31 -- et non quatre, comme le commentaire l'affirmait. Le
/// coefficient de 21 pH/mil retenu par le modele rend 1,3 a 1,7 fois cette
/// valeur : il MAJORE, et une inductance de traversee surestimee n'a jamais
/// flatte une carte.
fn l_etalement_via_via_reste_au_dessus_de_la_forme_fermee() {
    for (h, s, d) in [(1e-3, 2e-3, 0.25e-3), (0.2e-3, 1e-3, 0.3e-3), (0.5e-3, 5e-3, 0.3e-3)] {
        let emp = inductance_etalement_via_via(h, s, d);
        let exact = inductance_etalement_via_via_2d(h, s, d);
        assert!(exact > 0.0, "la forme fermee ne rend rien");
        assert!(emp > exact, "le coefficient empirique passe SOUS la forme fermee : {:.4} nH contre {:.4}", emp * 1e9, exact * 1e9);
        assert!(emp / exact < 2.0, "le coefficient empirique s'ecarte de plus du double de la forme fermee ({:.2} fois)", emp / exact);
    }

    // Et elle vaut bien DEUX fois le cas via-vers-anneau, a argument egal.
    let (h, s, r) = (0.5e-3, 5e-3, 0.15e-3);
    let anneau = inductance_etalement_via_anneau(h, r, s);
    let deux = inductance_etalement_via_via_2d(h, s, 2.0 * r);
    proche(deux / anneau, 2.0, 0.02, "rapport deux-contacts / un-contact");
}

/// DIX HARMONIQUES NE DEPASSAIENT PAS 30 MHZ sous 1,58 MHz : la boucle
/// sortait hors bande, sans verdict. Les harmoniques vont jusqu'a 1 GHz,
/// l'enveloppe au-dela de 400 dans la bande.
fn une_horloge_lente_a_un_verdict() {
    for (f0, calcul) in [(1.5e6, "harmoniques"), (10e3, "enveloppe")] {
        let r = rayonnement_boucle(f0, 5e-9, 8.5e-6, 50.0, 3.3, 3.0, "B").unwrap();
        assert!(!r.hors_bande && r.pire.is_some(), "{f0} {:?}", r.pire);
        assert!(r.calcul == calcul, "{f0} {}", r.calcul);
    }
    assert!(rayonnement_boucle(1.5e6, 5e-9, 8.5e-6, 50.0, 3.3, 3.0, "B").unwrap().pire.unwrap().freq_hz >= 30e6);
}

/// La part de `le_spectre_est_celui_d_un_signal_0_v0` qui ne demande que ligne_mom : la
/// fondamentale d'un carre 0 -> 1 V vaut 2/pi (la cavite, elle, attend simulation_em).
fn la_fondamentale_d_un_signal_0_v0() {
    let h1 = &spectre_signal_trapeze(1e6, 1e-15, 1.0, 10, None)[0];
    proche(h1.amplitude, 2.0 / PI, 1e-9, "fondamentale 0 -> 1 V");
}

pub fn banc() {
    titre("La traversee entre deux plans, le bilan de sante, le rayonnement");
    T("la cavite modale ne resonne que la ou la carte resonne", la_cavite_modale_ne_resonne_que_la_ou_la_carte_resonne);
    T("la cavite maillee retrouve le rectangle et voit la forme", la_cavite_maillee_retrouve_le_rectangle_et_voit_la_forme);
    T("les formules de cavité rendent les exemples du livre", les_formules_de_cavite_rendent_les_exemples_du_livre);
    T("la traversée ne diverge ni en bas ni en haut", la_traversee_ne_diverge_ni_en_bas_ni_en_haut);
    T("la répartition du retour est une division de courant complexe", la_repartition_spectrale_est_une_division_de_courant_complexe);
    T("une traversée de plan n'améliore jamais le score", une_traversee_de_plan_n_ameliore_jamais_le_score);
    T("l'étalement via-via majore la forme fermée", l_etalement_via_via_reste_au_dessus_de_la_forme_fermee);
    T("le verdict n'affirme pas une boucle qu'il ne voit pas", le_verdict_n_affirme_pas_une_boucle_qu_il_ne_voit_pas);
    T("le rayonnement de la boucle est le dipôle magnétique", le_rayonnement_de_la_boucle_est_le_dipole_magnetique);
    T("le rayonnement suit l'aire de la boucle et le rythme", le_rayonnement_suit_l_aire_de_la_boucle_et_le_rythme);
    T("le spectre est celui d'un signal 0 -> v0 (la part ligne_mom de son cas)", la_fondamentale_d_un_signal_0_v0);
    T("une horloge lente a un verdict", une_horloge_lente_a_un_verdict);
    T("tous les ponts comptent, pas seulement le plus proche", tous_les_ponts_comptent_pas_seulement_le_plus_proche);
}
