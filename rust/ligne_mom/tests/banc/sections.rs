//! La ligne seule : microruban, triplaque, couvert, verni, coplanaire, et la cascade.

use crate::*;

fn ecart_max(vu: &[f64], reference: &[f64]) -> f64 {
    vu.iter().zip(reference).map(|(v, r)| (v - r).abs() / r.abs()).fold(0.0, f64::max)
}

/// Le noyau spectral triplaque reste fini, et SANS avertissement.
///
/// L'ancienne ecriture calculait sinh(b1).sinh(b2) sur toute la grille puis
/// le jetait au-dela de beta.b = 350 -- mais `np.where` evalue ses deux
/// branches, et le produit passait par inf : un RuntimeWarning a chaque
/// section triplaque. Un avertissement qui sort a chaque calcul finit par ne
/// plus etre lu, et c'est le suivant, le vrai, qu'on rate.
fn la_triplaque_ne_deborde_plus() {
    let beta = logspace(-2.0, 7.0, 400);
    let (y0, b, er) = (0.3e-3, 1e-3, 4.3);
    let g: Vec<f64> = beta.iter().map(|&be| green_spectral_strip(be, y0, b, er)).collect();
    solve_multiline(&Geometrie {
        conducteurs: vec![Conducteur { w: 0.2e-3, x: Some(-0.2e-3), ..Default::default() }, Conducteur { w: 0.2e-3, x: Some(0.2e-3), ..Default::default() }],
        ..strip(0.0, 35e-6, b, b / 2.0, er)
    })
    .unwrap();
    assert!(g.iter().all(|x| x.is_finite()), "noyau non fini");
    // LA MEME FONCTION QU'AVANT la ou l'ancienne ne debordait pas...
    for (&bm, &g) in beta.iter().zip(&g).filter(|(&be, _)| be * b < 300.0) {
        let ancien = (bm * y0).sinh() * (bm * (b - y0)).sinh() / (bm * b).sinh() / (EPSILON_0 * er * bm);
        assert!((g / ancien - 1.0).abs() < 1e-12);
    }
    // ...ET SA LIMITE EXACTE au-dela : 1/(2 eps beta).
    proche(g[399] * 2.0 * EPSILON_0 * er * beta[399], 1.0, 1e-12, "asymptote");
}

fn z0_decroit() {
    let zs: Vec<f64> = [0.4, 0.8, 1.6, 3.2].iter().map(|w| z0(&micro(w * H, 0.0, H, 4.3))).collect();
    assert!(zs.windows(2).all(|p| p[0] > p[1]), "{zs:?}");
}

fn convergence() {
    let a = solve_line_avec(&micro(1.9 * H, 0.0, H, 4.3), 60, N_QUADRATURE).unwrap().z0;
    let b = solve_line_avec(&micro(1.9 * H, 0.0, H, 4.3), 240, N_QUADRATURE).unwrap().z0;
    proche(a, b, 0.005, "Z0 a 60 puis 240 panneaux");
}

fn decentree() {
    let b = 1.0e-3;
    let zs: Vec<f64> = [0.5, 0.35, 0.25, 0.15].iter().map(|y| z0(&strip(0.2e-3, 0.0, b, y * b, 4.3))).collect();
    assert!(zs.windows(2).all(|p| p[0] > p[1]), "{zs:?}");
}

fn epaisseur() {
    let mince = z0(&micro(0.38e-3, 0.0, H, 4.3));
    let epais = z0(&micro(0.38e-3, 35e-6, H, 4.3));
    assert!(epais < mince, "{epais} {mince}");
    assert!(0.85 < epais / mince && epais / mince < 1.0, "{}", epais / mince);
}

// ==========================================================================
// Le microruban couvert
// --------------------------------------------------------------------------
// Une piste interne qui n'a de plan que d'un cote a du stratifie AU-DESSUS
// d'elle, pas de l'air. La fonction de Green couverte doit tenir les deux bouts
// connus : le microruban nu d'un cote, le ruban noye de l'autre. Ces deux
// reductions sont des etalons EXACTS -- pas des approximations a tolerer.
// ==========================================================================

/// Couverture nulle -> la fonction couverte EST la fonction nue.
fn couvert_reduit_au_nu() {
    let betas = [1e-9, 1e-3, 1.0, 1e2, 5e3, 1e5, 1e7];
    for er in [1.0, 4.3, 10.2] {
        let nu = betas.map(|b| green_spectral_micro(b, H, er));
        let cv = betas.map(|b| green_spectral_micro_couvert(b, H, 0.0, er));
        let ecart = ecart_max(&cv, &nu);
        assert!(ecart < 1e-12, "er={er:.1} : ecart {ecart:.2e}");
    }
}

/// Couverture epaisse -> ruban et son image dans un milieu er homogene.
fn couvert_tend_vers_noye() {
    let betas = [1e-3, 1.0, 1e2, 5e3, 1e5];
    let er = 4.3;
    let cv = betas.map(|b| green_spectral_micro_couvert(b, H, 1.0, er));
    let reference = betas.map(|b| (1.0 - (-2.0 * b * H).exp()) / (2.0 * EPSILON_0 * er * b));
    let ecart = ecart_max(&cv, &reference);
    assert!(ecart < 1e-4, "ecart {ecart:.2e}");
}

// -----------------------------------------------------------------------------
// LE MASQUE DE SOUDURE -- trois reductions EXACTES, et le sens de l'effet
// -----------------------------------------------------------------------------
// La Green a trois regions doit SUBSUMER les deux autres. Ces trois cas sont ce
// qui separe une derivation juste d'une formule qui "donne des chiffres
// plausibles" : chacun ramene la fonction a un cas dont on connait la reponse
// fermee, et un seul terme mal place les fait tomber.

/// Masque d'epaisseur nulle -> le microruban nu, a la precision machine.
fn masque_nul_redonne_le_nu() {
    let betas = [1e-3, 1.0, 1e2, 5e3, 1e5];
    for er in [1.0, 4.3, 10.2] {
        let nu = betas.map(|b| green_spectral_micro(b, H, er));
        let mq = betas.map(|b| green_spectral_micro_masque(b, H, 1e-15, er, 3.8));
        let ecart = ecart_max(&mq, &nu);
        assert!(ecart < 1e-7, "er={er:.1} : ecart {ecart:.2e}");
    }
}

/// Masque de meme permittivite que le substrat -> le ruban couvert.
fn masque_de_meme_er_redonne_le_couvert() {
    let betas = [1e-3, 1.0, 1e2, 5e3, 1e5];
    let er = 4.3;
    for c in [25e-6, 200e-6, 2e-3] {
        let cv = betas.map(|b| green_spectral_micro_couvert(b, H, c, er));
        let mq = betas.map(|b| green_spectral_micro_masque(b, H, c, er, er));
        let ecart = ecart_max(&mq, &cv);
        assert!(ecart < 1e-10, "c={:.0} um : ecart {ecart:.2e}", c * 1e6);
    }
}

/// Masque epais -> l'asymptote est 1/(eps0 beta (er2 + er1 coth(beta h))).
///
/// C'est CETTE limite qui fixe le milieu moyen a extraire dans `solve_line` :
/// eps0 (er1 + er2)/2, et non le substrat seul. Poser le substrat seul
/// decalait l'extraction de la partie singuliere.
fn masque_epais_tend_vers_deux_dielectriques() {
    let betas = [2e4, 5e4, 1e5];
    let (er1, er2) = (4.3, 3.8);
    let mq = betas.map(|b| green_spectral_micro_masque(b, H, 10e-3, er1, er2));
    let reference = betas.map(|b| 1.0 / (EPSILON_0 * b * (er2 + er1 / (b * H).tanh())));
    let ecart = ecart_max(&mq, &reference);
    assert!(ecart < 1e-9, "ecart {ecart:.2e}");
}

/// LE CHIFFRE ATTENDU, et surtout LE SENS de l'effet.
///
/// Un vernis de 25 um sur une piste exterieure fait baisser Z0 de 2 a 3 % et
/// MONTER eps_eff -- il y a plus de dielectrique autour du ruban. La premiere
/// version prenait la reference "a vide" en LAISSANT le masque a son er : C0
/// gonflait, eps_eff BAISSAIT en vernissant la piste, et Z0 tombait de huit
/// pour cent. C'est le sens de l'effet qui l'a trahie, pas son amplitude.
fn le_vernis_baisse_z0_de_deux_a_trois_pour_cent() {
    let base = micro(0.38e-3, 35e-6, H, 4.3);
    let nu = solve_line(&base).unwrap();
    let vernie = solve_line(&Geometrie { masque: Some(Masque { epaisseur: 25e-6, epsilon_r: 3.8 }), ..base }).unwrap();
    let baisse = 100.0 * (nu.z0 - vernie.z0) / nu.z0;
    assert!(1.5 < baisse && baisse < 3.5, "Z0 baisse de {baisse:.2} %, attendu 2 a 3 %");
    assert!(vernie.eps_eff > nu.eps_eff, "eps_eff BAISSE en vernissant : {:.4} contre {:.4}", vernie.eps_eff, nu.eps_eff);
}

/// Un masque de permittivite 1 est de l'air : Z0 ne doit pas bouger.
fn un_masque_dair_ne_fait_rien() {
    let base = micro(0.38e-3, 35e-6, H, 4.3);
    let nu = solve_line(&base).unwrap();
    let air = solve_line(&Geometrie { masque: Some(Masque { epaisseur: 25e-6, epsilon_r: 1.0 }), ..base }).unwrap();
    proche(air.z0, nu.z0, 1e-4, "Z0 sous un masque d'air");
}

// -----------------------------------------------------------------------------
// LES DISCONTINUITES LOCALISEES
// -----------------------------------------------------------------------------
/// Le coude a angle droit : les formules publiees, reposees a la main.
fn le_coude_suit_gupta() {
    let (w, h, er) = (0.38e-3, 0.2e-3, 4.3);
    let u: f64 = w / h;
    let c_ref = ((9.5 * er + 1.25) * u + 5.2 * er + 7.0) * 1e-12 * w;
    let l_ref = 100.0 * (4.0 * u.sqrt() - 4.21) * 1e-9 * h;
    let (l, c) = elements_coude(w, h, er, 90.0);
    proche(c, c_ref, 1e-9, "capacite du coude");
    proche(l, l_ref, 1e-9, "inductance du coude");
}

/// Un troncon qui continue tout droit n'est PAS une discontinuite.
///
/// L'ancienne formule n'avait pas d'angle du tout : un raccord aligne pesait
/// autant qu'un coude a angle droit.
fn le_coude_sannule_a_angle_nul() {
    let (l, c) = elements_coude(0.38e-3, 0.2e-3, 4.3, 0.0);
    assert!(l == 0.0 && c == 0.0, "L={l:.3e} C={c:.3e} a angle nul");
    let c45 = elements_coude(0.38e-3, 0.2e-3, 4.3, 45.0).1;
    let c90 = elements_coude(0.38e-3, 0.2e-3, 4.3, 90.0).1;
    proche(c45, c90 / 2.0, 1e-9, "capacite du coude a 45 degres");
}

pub fn det(m: &Abcd) -> Complex64 {
    m[0][0] * m[1][1] - m[0][1] * m[1][0]
}

/// det(ABCD) = 1 : c'est ce que vaut tout reseau passif RECIPROQUE.
///
/// Un signe inverse ou un facteur oublie dans le montage du T ou du pi le
/// casse, et rien d'autre ne l'attraperait.
fn les_discontinuites_sont_reciproques() {
    for f in [1e8, 1e9, 1e10] {
        let d = abcd_coude(0.38e-3, 0.2e-3, 4.3, f, 90.0);
        proche(det(&d).norm(), 1.0, 1e-9, "det du coude");
        let d = abcd_via(1.6e-3, 0.3e-3, 0.75e-3, 4.3, f);
        proche(det(&d).norm(), 1.0, 1e-9, "det du via");
    }
}

/// UN VIA DE 1,6 mm PESE ENVIRON UN NANOHENRY, pas un microhenry.
///
/// Le rapport h/d est sans dimension : le logarithme survit a une erreur
/// d'unite, et seul le prefacteur mu0*h la trahit. La cascade appelait ces
/// fonctions EN MILLIMETRES et rendait donc mille fois trop -- un ordre de
/// grandeur faux dans une fiche a l'air d'un ordre de grandeur.
fn linductance_du_via_est_en_metres() {
    let l = inductance_via(1.6e-3, 0.3e-3);
    assert!(0.5e-9 < l && l < 3e-9, "L = {l:.3e} H pour un via de 1,6 mm");
}

/// Ruban profondement enterre : eps_eff -> er, et Z0 = Z0(air)/racine(er).
///
/// C'est la contrainte la plus forte du lot, parce qu'elle ne depend d'aucune
/// formule exterieure : un ruban noye dans un milieu HOMOGENE voit sa vitesse
/// divisee par racine(er) et son impedance avec, quelle que soit la section.
fn enterre_vaut_le_milieu_homogene() {
    let er = 4.3;
    let g = |er| Geometrie { couverture: 5e-3, ..micro(0.38e-3, 35e-6, H, er) };
    let plein = solve_line(&g(er)).unwrap();
    let vide = solve_line(&g(1.0)).unwrap();
    proche(plein.eps_eff, er, 0.005, "eps_eff d'un ruban enterre");
    proche(plein.z0, vide.z0 / er.sqrt(), 0.005, "Z0 enterre contre Z0(air)/racine(er)");
}

/// Couvrir une piste ne peut que monter eps_eff et baisser Z0.
fn couverture_baisse_z0() {
    let rs: Vec<Ligne> = [0.0, 0.05e-3, 0.1e-3, 0.2e-3, 0.5e-3, 2e-3]
        .iter()
        .map(|&c| solve_line(&Geometrie { couverture: c, ..micro(0.38e-3, 35e-6, H, 4.3) }).unwrap())
        .collect();
    let zs: Vec<f64> = rs.iter().map(|r| r.z0).collect();
    let es: Vec<f64> = rs.iter().map(|r| r.eps_eff).collect();
    assert!(zs.windows(2).all(|p| p[0] > p[1]), "{zs:?}");
    assert!(es.windows(2).all(|p| p[0] < p[1]), "{es:?}");
    assert!(es[5] < 4.3, "{}", es[5]);
    // L'ecart au modele nu est ce qui justifie tout ce code : sur une couche
    // interne courante il depasse largement le pour cent.
    assert!((zs[0] - zs[3]) / zs[0] > 0.05, "{} {}", zs[0], zs[3]);
}

// ==========================================================================
// Le plan de masse COPLANAIRE
// --------------------------------------------------------------------------
// Une piste noyee dans un plan arrose -- le cas ordinaire d'une carte RF -- a
// du cuivre de masse sur SA PROPRE COUCHE, a quelques dixiemes de millimetre.
// Le prendre pour un microruban surestime Z0 de vingt pour cent et davantage.
//
// Trois etalons, et les deux premiers sont EXACTS :
//   · ecart nul  -> le microruban, au bit pres ;
//   · ecart grand -> le microruban de nouveau, la masse coplanaire etant partie
//     a l'infini. C'est la contrainte la plus severe : le modele doit etre
//     CONTINU aux deux bouts, sans quoi il y a une bosse quelque part au milieu ;
//   · aux ecarts serres, la transformation conforme (Wen), qui est la reference
//     du domaine. Elle derive quand la masse s'eloigne -- sa geometrie de
//     depart ne se reduit pas au microruban --, on ne la teste donc que la ou
//     elle vaut quelque chose.
// ==========================================================================

/// CPW sur plan, par transformation conforme. Ruban d'epaisseur nulle.
pub fn cpwg_conforme(w: f64, s: f64, h: f64, er: f64) -> f64 {
    let (a, b) = (w / 2.0, w / 2.0 + s);
    let k1 = a / b;
    let k3 = (PI * a / (2.0 * h)).tanh() / (PI * b / (2.0 * h)).tanh();
    let k = |k: f64| ellipk(k * k);
    let kp = |k: f64| ellipk(1.0 - k * k);
    let q = (kp(k1) / k(k1)) * (k(k3) / kp(k3));
    let eeff = (1.0 + er * q) / (1.0 + q);
    60.0 * PI / eeff.sqrt() / (k(k1) / kp(k1) + k(k3) / kp(k3))
}

/// Ecart nul -> exactement le microruban, sans la moindre derive.
fn coplanaire_nul_est_microruban() {
    let g = micro(0.52e-3, 35e-6, 0.37e-3, 4.37);
    let sans = z0(&g);
    let avec = z0(&Geometrie { ecart: 0.0, ..g });
    assert!((sans - avec).abs() < 1e-12, "{sans} {avec}");
}

/// Masse coplanaire repoussee -> le microruban de nouveau.
fn coplanaire_loin_est_microruban() {
    let g = micro(0.52e-3, 0.0, 0.37e-3, 4.37);
    let nu = z0(&g);
    for s in [3e-3, 10e-3] {
        proche(z0(&Geometrie { ecart: s, ..g.clone() }), nu, 0.005, &format!("Z0 a ecart {:.0} mm contre le microruban nu", s * 1e3));
    }
}

/// Aux ecarts serres, contre la transformation conforme.
fn coplanaire_contre_conforme() {
    let h = 0.37e-3;
    for wr in [0.6, 1.4, 3.0] {
        for sr in [0.3, 0.6] {
            let (w, s) = (wr * h, sr * h);
            let vu = z0(&Geometrie { ecart: s, ..micro(w, 0.0, h, 4.37) });
            proche(vu, cpwg_conforme(w, s, h, 4.37), 0.015, &format!("w/h={wr:.1} s/h={sr:.1}"));
        }
    }
}

/// Rapprocher la masse ne peut que baisser Z0, sans marche ni bosse.
fn coplanaire_serre_baisse_z0() {
    let g = micro(0.52e-3, 35e-6, 0.37e-3, 4.37);
    let zs: Vec<f64> = [2e-3, 1e-3, 0.5e-3, 0.3e-3, 0.2e-3, 0.12e-3].iter().map(|&s| z0(&Geometrie { ecart: s, ..g.clone() })).collect();
    assert!(zs.windows(2).all(|p| p[0] > p[1]), "{zs:?}");
    // Et l'ecart au microruban nu doit etre GROS : c'est tout l'objet du calcul.
    let nu = z0(&g);
    assert!((nu - zs[5]) / nu > 0.15, "{nu} {}", zs[5]);
}

// --------------------------------------------------------------------------
// LA MASSE N'EST PAS SYMETRIQUE (1.3.0)
// Le cuivre d'une carte ne l'est pas : une piste longe une decoupe d'un cote et
// du plan serre de l'autre. Ces quatre cas verrouillent les reductions exactes
// -- ce sont elles qui garantissent qu'ajouter un deuxieme ecart n'a rien casse
// de ce qui marchait -- puis la physique du cas asymetrique lui-meme.
// --------------------------------------------------------------------------
fn asym() -> Geometrie {
    micro(0.52e-3, 35e-6, 0.37e-3, 4.37)
}

fn asym_gd(g: f64, d: f64) -> Geometrie {
    Geometrie { ecart_g: Some(g), ecart_d: Some(d), ..asym() }
}

/// Deux ecarts egaux -> exactement l'ecart unique, au bit pres.
fn asym_ecarts_egaux_est_lancien() {
    for s in [0.12e-3, 0.3e-3, 1e-3] {
        let un = z0(&Geometrie { ecart: s, ..asym() });
        let deux = z0(&asym_gd(s, s));
        assert!((un - deux).abs() < 1e-12, "{s} {un} {deux}");
    }
}

/// Aucun cote avec masse -> le microruban nu, au bit pres.
fn asym_deux_zeros_est_microruban() {
    let nu = z0(&asym());
    let vu = z0(&asym_gd(0.0, 0.0));
    assert!((nu - vu).abs() < 1e-12, "{nu} {vu}");
}

/// Masse d'un cote seul : entre le microruban nu et le coplanaire.
///
/// C'EST LE CAS QUI ETAIT FAUX. La piste qui longe une decoupe partait avec
/// l'ecart serre pose des DEUX cotes : deux fois la baisse de Z0 qu'elle
/// subit vraiment. La moitie du cuivre, ce n'est pas la moitie de l'effet --
/// le champ se redistribue -- mais c'est franchement moins, et le calcul doit
/// tomber entre les deux bornes sans jamais les toucher.
fn asym_un_seul_cote() {
    let nu = z0(&asym());
    for s in [0.12e-3, 0.2e-3, 0.4e-3] {
        let sym = z0(&Geometrie { ecart: s, ..asym() });
        let seul = solve_line(&asym_gd(s, 0.0)).unwrap();
        assert!(sym < seul.z0 && seul.z0 < nu, "{s} {sym} {} {nu}", seul.z0);
        assert!(seul.cotes == 1, "{}", seul.cotes);
        // Et la gauche vaut la droite : la section est mise en miroir, rien de
        // plus. Sans cela, le signe du produit vectoriel qui choisit le cote
        // dans la page deviendrait un parametre du resultat.
        let miroir = z0(&asym_gd(0.0, s));
        proche(miroir, seul.z0, 1e-9, &format!("gauche contre droite a {:.2} mm", s * 1e3));
    }
}

/// Eloigner UN cote fait monter Z0, jusqu'au cas du cote seul.
fn asym_repousser_un_cote_monte_z0() {
    let serre = 0.15e-3;
    let zs: Vec<f64> = [0.15e-3, 0.3e-3, 0.6e-3, 1.2e-3, 3e-3].iter().map(|&d| z0(&asym_gd(serre, d))).collect();
    assert!(zs.windows(2).all(|p| p[0] < p[1]), "{zs:?}");
    // A trois millimetres sous 0,37 mm de dielectrique, ce cote ne compte plus :
    // on doit retrouver le cas du cote seul a un demi pour cent.
    let seul = z0(&asym_gd(serre, 0.0));
    proche(zs[4], seul, 0.005, "cote repousse a 3 mm contre le cote seul");
}

fn dispersion() {
    let r = solve_line(&micro(0.38e-3, 35e-6, H, 4.3)).unwrap();
    let (e1, _) = dispersion_getsinger(r.z0, r.eps_eff, 4.3, H, 1e8);
    let (e2, _) = dispersion_getsinger(r.z0, r.eps_eff, 4.3, H, 10e9);
    assert!(e1 <= e2 && e2 < 4.3, "{e1} {e2}");
}

fn pertes() {
    let o = OptionsPertes::default();
    let (ac1, ad1) = line_losses(50.0, 3.3, 0.38e-3, 4.3, 0.02, 1e9, &o).unwrap();
    let (ac2, ad2) = line_losses(50.0, 3.3, 0.38e-3, 4.3, 0.02, 10e9, &o).unwrap();
    assert!(0.0 < ac1 && ac1 < ac2, "{ac1} {ac2}");
    assert!(0.0 < ad1 && ad1 < ad2, "{ad1} {ad2}");
}

fn reel(x: f64) -> Complex64 {
    Complex64::new(x, 0.0)
}

/// Une ligne 50 ohms sans pertes chargee sur 50 ohms : rien ne revient.
fn adaptee() {
    let beta = 2.0 * PI * 1e9 * 3.3f64.sqrt() / 2.99792458e8;
    let s = cascade_to_s(&abcd_line(reel(50.0), Complex64::new(0.0, beta), 30e-3), 50.0);
    assert!(s[0][0].norm() < 1e-9, "{}", s[0][0].norm());
    assert!((s[1][0].norm() - 1.0).abs() < 1e-9, "{}", s[1][0].norm());
}

/// Un troncon etroit entre deux larges renvoie de l'energie : c'est tout
/// l'interet de la mise en cascade.
fn discontinuite() {
    let beta = 2.0 * PI * 5e9 * 3.3f64.sqrt() / 2.99792458e8;
    let g = Complex64::new(0.0, beta);
    let droit = abcd_line(reel(50.0), g, 30e-3);
    let coupe = produit_abcd(&produit_abcd(&abcd_line(reel(50.0), g, 10e-3), &abcd_line(reel(90.0), g, 10e-3)), &abcd_line(reel(50.0), g, 10e-3));
    assert!(cascade_to_s(&droit, 50.0)[0][0].norm() < 1e-9);
    assert!(cascade_to_s(&coupe, 50.0)[0][0].norm() > 0.2);
}

/// Sans pertes, |S11|^2 + |S21|^2 = 1. Une matrice S qui ne le respecte pas
/// decrit une ligne qui cree ou detruit de l'energie.
fn puissance() {
    let beta = 2.0 * PI * 3e9 * 3.3f64.sqrt() / 2.99792458e8;
    let s = cascade_to_s(&abcd_line(reel(75.0), Complex64::new(0.0, beta), 12e-3), 50.0);
    let total = s[0][0].norm_sqr() + s[1][0].norm_sqr();
    assert!((total - 1.0).abs() < 1e-9, "{total}");
}

pub fn banc() {
    titre("Microruban contre Hammerstad-Jensen (+-1 %)");
    for er in [2.2, 4.3, 4.5, 10.2] {
        for u in [0.5, 1.0, 1.9, 3.0, 5.0] {
            T(&format!("er={er:4.1}  w/h={u:3.1}"), || {
                let r = solve_line(&micro(u * H, 0.0, H, er)).unwrap();
                let (z_ref, e_ref) = hammerstad_jensen(u, er);
                proche(r.z0, z_ref, 0.015, "Z0");
                proche(r.eps_eff, e_ref, 0.02, "eps_eff");
                // eps_eff d'un microruban est TOUJOURS entre 1 (tout l'air) et er
                // (tout le stratifie). Sortir de la, c'est une erreur et non une
                // imprecision : les deux premieres versions de ce solveur y sont
                // tombees, l'une a 0,5 et l'autre au-dessus de er.
                assert!(1.0 < r.eps_eff && r.eps_eff < er, "eps_eff = {:.3} hors de ]1 ; {er:.1}[", r.eps_eff);
            });
        }
    }

    titre("Triplaque contre la solution exacte (integrales elliptiques)");
    for er in [3.5, 4.5] {
        for u in [0.3, 0.6, 1.0, 1.6, 2.5] {
            T(&format!("er={er:4.1}  w/b={u:3.1}"), || {
                let b = 0.6e-3;
                let r = solve_line(&strip(u * b, 0.0, b, b / 2.0, er)).unwrap();
                proche(r.z0, stripline_exacte(u * b, b, er), 0.01, "Z0");
                // Une triplaque est noyee dans un milieu homogene : sa
                // permittivite effective vaut EXACTEMENT celle du stratifie.
                assert!((r.eps_eff - er).abs() < 1e-6, "{}", r.eps_eff);
            });
        }
    }

    // LE CUIVRE EPAIS D'UNE TRIPLAQUE reduit l'ecart entre plans a b - t : traite
    // comme un microruban dans b entier, 35 um sous 0,20 mm donnaient 41,7 ohms
    // au lieu des 35,7 de Wheeler 1978 a w/b = 0,5.
    titre("Triplaque en cuivre epais contre Wheeler 1978");
    for u in [0.3, 0.5, 1.0, 2.0] {
        T(&format!("t=35um  b=0,20  w/b={u:3.1}"), || {
            let (b, t, er) = (0.2e-3, 35e-6, 4.3f64);
            let r = solve_line(&strip(u * b, t, b, b / 2.0, er)).unwrap();
            proche(r.z0, _z_air_triplaque(u * b, t, b).unwrap() / er.sqrt(), 0.02, "Z0");
        });
    }

    T("le noyau triplaque ne deborde plus", la_triplaque_ne_deborde_plus);

    titre("Ce que la physique impose");
    T("elargir le ruban baisse son impedance", z0_decroit);
    T("Z0 converge quand on raffine le maillage", convergence);
    T("triplaque decentree : approcher un plan baisse Z0", decentree);
    T("un ruban epais a une impedance plus basse", epaisseur);
    T("couverture nulle : la Green couverte redonne la Green nue", couvert_reduit_au_nu);
    T("couverture epaisse : la Green couverte redonne le ruban noye", couvert_tend_vers_noye);
    T("masque nul : la Green a trois regions redonne le microruban nu", masque_nul_redonne_le_nu);
    T("masque de meme er que le substrat : c'est le ruban couvert, au bit pres", masque_de_meme_er_redonne_le_couvert);
    T("masque epais : l'asymptote est celle des deux dielectriques", masque_epais_tend_vers_deux_dielectriques);
    T("le vernis baisse Z0 de deux a trois pour cent, et monte eps_eff", le_vernis_baisse_z0_de_deux_a_trois_pour_cent);
    T("un masque de permittivite 1 ne change rien", un_masque_dair_ne_fait_rien);
    T("le coude a angle droit suit les formules de Gupta", le_coude_suit_gupta);
    T("un raccord aligne ne coute rien, un coude a 45 la moitie d'un coude droit", le_coude_sannule_a_angle_nul);
    T("les matrices de discontinuite sont reciproques : det = 1", les_discontinuites_sont_reciproques);
    T("un via de 1,6 mm vaut environ un nanohenry", linductance_du_via_est_en_metres);
    T("ruban enterre : eps_eff vaut er, et Z0 suit racine(er)", enterre_vaut_le_milieu_homogene);
    T("couvrir une piste monte eps_eff et baisse Z0, et ce n'est pas marginal", couverture_baisse_z0);
    T("ecart nul : le coplanaire redonne le microruban au bit pres", coplanaire_nul_est_microruban);
    T("masse coplanaire repoussee : on retrouve le microruban", coplanaire_loin_est_microruban);
    T("coplanaire contre la transformation conforme, aux ecarts serres", coplanaire_contre_conforme);
    T("resserrer la masse coplanaire baisse Z0, et pas qu'un peu", coplanaire_serre_baisse_z0);
    T("ecarts egaux des deux cotes : c'est l'ancien calcul, au bit pres", asym_ecarts_egaux_est_lancien);
    T("aucun cote avec masse : le microruban nu, au bit pres", asym_deux_zeros_est_microruban);
    T("masse d'un cote seul : entre le nu et le symetrique, et sans cote privilegie", asym_un_seul_cote);
    T("repousser un seul cote monte Z0 et rejoint le cas du cote seul", asym_repousser_un_cote_monte_z0);
    T("eps_eff monte avec la frequence, sans depasser er", dispersion);
    T("les pertes croissent avec la frequence", pertes);

    titre("La mise en cascade et les parametres S");
    T("une ligne adaptee ne reflechit rien", adaptee);
    T("un retrecissement au milieu reflechit", discontinuite);
    T("la puissance se conserve sans pertes", puissance);
}
