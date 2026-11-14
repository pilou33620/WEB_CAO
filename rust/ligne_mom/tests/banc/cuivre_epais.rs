//! Sans plan, l'audit de justesse numerique (2.10.0, 2.11.0) et le cuivre epais (2.12.0).

use crate::*;

// ==========================================================================
//
// LA LIGNE COPLANAIRE SANS PLAN A UNE SOLUTION EXACTE, et pas seulement pour
// un ruban : en ruban mince, masses semi-infinies, la transformation conforme
// donne la capacite d'une ligne seule ET des deux modes d'une paire. Dans l'air
// c'est exact ; sur un stratifie infiniment epais aussi, au facteur (er+1)/2
// pres -- la moitie du champ dans chaque milieu. C'est ce qui juge le noyau en
// images ET la condition de charge totale nulle, qui sont les deux nouveautes.
//
// LA PAIRE SE RAMENE A UNE LIGNE PAR z -> z^2. Le plan de symetrie x = 0 se
// replie sur le demi-axe negatif : mur electrique (mode impair) -> une masse
// de -inf a 0 ; mur magnetique (mode pair) -> rien, la symetrie haut/bas
// l'assure d'elle-meme. Il reste un ruban et une ou deux masses alignes, dont
// la capacite par demi-plan est eps0.K(k)/K(k'), k^2 le birapport des bords.

fn _k_sur_kp(k: f64) -> f64 {
    ellipk(k * k) / ellipk(1.0 - k * k)
}

/// Capacite d'une coplanaire mince dans l'air, masses semi-infinies.
fn _cpw_exacte(w: f64, g: f64) -> f64 {
    4.0 * EPSILON_0 * _k_sur_kp((w / 2.0) / (w / 2.0 + g))
}

/// (C pair, C impair) par ruban, paire coplanaire mince dans l'air.
fn _paire_cpw_exacte(w: f64, s: f64, g: f64) -> (f64, f64) {
    let (x2, x3, x4) = ((s / 2.0).powi(2), (s / 2.0 + w).powi(2), (s / 2.0 + w + g).powi(2));
    let k_i = ((x3 - x2) * x4 / ((x4 - x2) * x3)).sqrt();
    let k_p = ((x3 - x2) / (x4 - x2)).sqrt();
    (2.0 * EPSILON_0 * _k_sur_kp(k_p), 2.0 * EPSILON_0 * _k_sur_kp(k_i))
}

fn sans_plan(w: f64, h: f64, er: f64, g: Option<f64>) -> Geometrie {
    Geometrie { kind: Kind::SansPlan, w, h, epsilon_r: er, ecart_g: g, ecart_d: g, ..Default::default() }
}

fn sans_plan_une_ligne_contre_l_exacte() {
    for (w, g) in [(0.35e-3, 0.3e-3), (1e-3, 0.2e-3), (0.2e-3, 1e-3)] {
        let reference = _cpw_exacte(w, g);
        for (er, h) in [(1.0, 1.6e-3), (4.3, 1.0)] {
            let r = solve_line(&sans_plan(w, h, er, Some(g))).unwrap();
            let attendu = reference * (er + 1.0) / 2.0;
            assert!((r.c / attendu - 1.0).abs() < 5e-3, "w={w} g={g} er={er} : C {:.4e} contre {attendu:.4e} exact", r.c);
        }
    }
}

fn sans_plan_une_paire_contre_l_exacte() {
    for (w, s_, g) in [(0.35e-3, 0.2e-3, 0.3e-3), (0.35e-3, 0.7e-3, 0.3e-3), (0.2e-3, 0.15e-3, 0.5e-3)] {
        let (cp, ci) = _paire_cpw_exacte(w, s_, g);
        for (er, h) in [(1.0, 1.6e-3), (4.3, 1.0)] {
            let r = solve_multiline(&Geometrie { conducteurs: deux(w, s_), ..sans_plan(0.0, h, er, Some(g)) }).unwrap();
            let c = &r.c;
            let f = (er + 1.0) / 2.0;
            assert!(((c[0][0] + c[0][1]) / (cp * f) - 1.0).abs() < 5e-3, "mode pair {w} {s_} {g} {er}");
            assert!(((c[0][0] - c[0][1]) / (ci * f) - 1.0).abs() < 5e-3, "mode impair {w} {s_} {g} {er}");
        }
    }
}

/// Plaque finie : la formule des capacites partielles, a 1 %.
///
/// Ce n'est plus une solution exacte -- c'est la formule de reference des
/// calculateurs de lignes (Wen, Ghione) --, mais elle encadre la plaque
/// finie, entre l'air (h -> 0) et le demi-espace (h -> inf).
///
/// ELLE NE VAUT QUE SUR UNE PLAQUE PLUS EPAISSE QUE LA LIGNE. A h = b (bord
/// de la masse), elle sous-estime eps_eff de 2 % -- le noyau en images, lui,
/// ne bouge pas de 1e-5 quand on double les panneaux, et il est exact aux
/// deux limites. Les cas sont donc pris a h > b.
fn sans_plan_plaque_finie_contre_les_capacites_partielles() {
    for (w, g, h, er) in [(0.35e-3, 0.3e-3, 1.6e-3, 4.3), (1e-3, 0.5e-3, 1e-3, 9.8), (0.2e-3, 0.2e-3, 0.8e-3, 4.3)] {
        let (a, b): (f64, f64) = (w / 2.0, w / 2.0 + g);
        let k1 = (PI * a / (2.0 * h)).sinh() / (PI * b / (2.0 * h)).sinh();
        let e_ref = 1.0 + (er - 1.0) / 2.0 * _k_sur_kp(k1) / _k_sur_kp(a / b);
        let r = solve_line(&sans_plan(w, h, er, Some(g))).unwrap();
        assert!((r.eps_eff / e_ref - 1.0).abs() < 0.01, "{w} {g} {h} {er} {} {e_ref}", r.eps_eff);
        assert!(1.0 < r.eps_eff && r.eps_eff < (er + 1.0) / 2.0, "{}", r.eps_eff);
    }
}

/// Ni plan, ni masse coplanaire, ni garde : refus, jamais un chiffre.
fn sans_plan_et_sans_masse_rien_ne_porte_le_retour() {
    let c = |w: f64, x: f64| Conducteur { w, x: Some(x), ..Default::default() };
    let paire = Geometrie { conducteurs: vec![c(0.35e-3, -0.3e-3), c(0.35e-3, 0.3e-3)], ..sans_plan(0.0, 1.6e-3, 4.3, None) };
    for refus in [solve_line(&sans_plan(0.35e-3, 1.6e-3, 4.3, None)).err(), solve_multiline(&paire).err()] {
        match refus {
            Some(exc) => assert!(exc.0.contains("retour"), "{exc}"),
            None => panic!("une section sans reference a ete resolue"),
        }
    }
    // UNE PISTE DE GARDE SUFFIT : c'est un conducteur a zero volt.
    let mut garde = paire.clone();
    garde.conducteurs.push(Conducteur { masse: true, ..c(0.5e-3, 1.2e-3) });
    let r = solve_multiline(&garde).unwrap();
    assert!(r.n == 2 && r.lignes[0].z0 > 0.0, "{:?}", r.lignes);
}

// ==========================================================================
// ligne_mom 2.10.0 / simulation_em 5.6.0 : ce que l'audit de justesse
// numerique du 2026-11-10 a corrige. Chaque cas echoue sur la version d'avant.
// ==========================================================================

/// Une seule couche de chaque cote : la multicouche EST le microruban nu,
/// le couvert, le verni et la triplaque -- meme physique, autre ecriture.
/// 1e-12 : ce sont des identites algebriques, il ne reste que l'arrondi.
fn la_green_multicouche_se_reduit_aux_quatre_autres() {
    // np.geomspace(1.0, 1e6, 40)
    let be = logspace(0.0, 6.0, 40);
    let g = green_spectral_multicouche;
    let cas: [(&dyn Fn(f64) -> f64, &dyn Fn(f64) -> f64, &str); 5] = [
        (&|b| g(b, &[(4.3, 0.2e-3)], &[], false), &|b| green_spectral_micro(b, 0.2e-3, 4.3), "nu"),
        (&|b| g(b, &[(4.3, 0.2e-3)], &[(4.3, 0.7e-3)], false), &|b| green_spectral_micro_couvert(b, 0.2e-3, 0.7e-3, 4.3), "couvert"),
        (&|b| g(b, &[(4.3, 0.2e-3)], &[(3.8, 25e-6)], false), &|b| green_spectral_micro_masque(b, 0.2e-3, 25e-6, 4.3, 3.8), "verni"),
        (&|b| g(b, &[(4.3, 0.1e-3)], &[(4.3, 0.4e-3)], true), &|b| green_spectral_strip(b, 0.1e-3, 0.5e-3, 4.3), "triplaque"),
        // deux couches de MEME er valent une couche de leur somme
        (&|b| g(b, &[(4.3, 0.05e-3), (4.3, 0.15e-3)], &[], false), &|b| green_spectral_micro(b, 0.2e-3, 4.3), "deux couches egales"),
    ];
    for (vu, attendu, quoi) in cas {
        let pire = be.iter().map(|&b| (vu(b) / attendu(b) - 1.0).abs()).fold(0.0, f64::max);
        assert!(be.iter().all(|&b| (vu(b) - attendu(b)).abs() <= 1e-12 * attendu(b).abs()), "{quoi} : {pire:.2e}");
    }
}

/// Sous le seuil (ecart - elargissement < epaisseur) la masse coplanaire
/// etait ABANDONNEE et Z0 sautait au microruban nu. ETALON : volumes finis
/// 2D a cuivre epais (audit du 2026-11-10, a 0,5-1 % sur Hammerstad-Jensen
/// et Cohn), trois geometries sous le seuil :
///     w 0,3 / t 35 um / h 1,6 / ecart 60 um  : 46,89 ohms  (avant 125,55)
///     w 0,3 / t 70 um / h 1,6 / ecart 120 um : 54,64 ohms  (avant 121,16)
///     w 0,2 / t 35 um / h 0,2 / ecart 50 um  : 43,54 ohms  (avant  65,90)
/// 10 % : sous le seuil l'ecart est FIGE a l'epaisseur (shortcut de
/// `_ecart_retenu`), Z0 ne suit plus l'ecart reel -- mesure +3,1 %, +1,2 %
/// et +8,4 %. Avant : +168 %, +122 % et +51 %.
fn une_masse_coplanaire_serree_reste_une_masse() {
    for (w, t, h, e, z_ref) in [(0.3e-3, 35e-6, 1.6e-3, 60e-6, 46.89), (0.3e-3, 70e-6, 1.6e-3, 120e-6, 54.64), (0.2e-3, 35e-6, 0.2e-3, 50e-6, 43.54)] {
        let r = solve_line(&Geometrie { ecart: e, ..micro(w, t, h, 4.3) }).unwrap();
        assert!(r.cotes == 2, "{r:?}");
        proche(r.z0, z_ref, 0.10, &format!("Z0 a {:.0} um d'ecart", e * 1e6));
    }
    // ET LA PAIRE BORDEE DE MASSE SUIT LA MEME REGLE.
    let rm = solve_multiline(&Geometrie {
        ecart: 60e-6,
        conducteurs: vec![Conducteur { w: 0.3e-3, x: Some(0.0), ..Default::default() }, Conducteur { w: 0.3e-3, s: 0.3e-3, ..Default::default() }],
        ..micro(0.0, 35e-6, 1.6e-3, 4.3)
    })
    .unwrap();
    assert!(rm.ecart_g == 35e-6 && rm.ecart_d == 35e-6, "{}", rm.ecart_g);
}

/// CONTINUITE. w 0,3 / t 35 um / h 1,6 : le seuil est a 67,2 um (32,2 um
/// d'elargissement + 35 um). De part et d'autre, a +-0,5 um, Z0 ne bouge pas
/// de 1 % (avant : 48,65 -> 125,55, un facteur 2,6) ; et de 150 a 20 um
/// Z0 ne REMONTE jamais quand l'ecart se resserre. Ecart nul : toujours
/// « pas de masse », le microruban.
fn z0_ne_saute_plus_quand_l_ecart_traverse_le_seuil() {
    let geo = |ecart: f64| Geometrie { ecart, ..micro(0.3e-3, 35e-6, 1.6e-3, 4.3) };
    let seuil = (largeur_effective(0.3e-3, 35e-6, 1.6e-3, 0.0) - 0.3e-3) / 2.0 + 35e-6;
    // A +-0,5 um et non plus +-1 : depuis le constat 30 le calcul avec
    // dielectrique se fait sur un ruban moins elargi, que le seuil ne fige
    // qu'a 56 um ; Z0 garde donc sa pente de 0,5 %/um des DEUX cotes du seuil
    // (avant : nulle dessous), et 2 um en font 1,04 %. Un saut, lui, ne
    // dependrait pas du pas.
    let dessus = z0(&geo(seuil + 0.5e-6));
    let dessous = z0(&geo(seuil - 0.5e-6));
    proche(dessous, dessus, 0.01, "Z0 de part et d'autre du seuil");
    let zs: Vec<f64> = [150.0, 100.0, 80.0, 70.0, 66.0, 65.0, 60.0, 40.0, 20.0].iter().map(|e| z0(&geo(e * 1e-6))).collect();
    assert!(zs.windows(2).all(|p| p[1] <= p[0] + 1e-9), "{zs:?}");
    let nu = solve_line(&geo(0.0)).unwrap();
    assert!(nu.cotes == 0 && nu.z0 > 2.0 * zs[8], "{nu:?}");
}

/// w/h = 1000 : trois cents points ne suivaient plus cos(beta x) et
/// eps_eff sortait a 5,06 -- AU-DESSUS de er = 4,3, sans erreur -- et Z0 a
/// -7,8 %. Etalon : Hammerstad-Jensen du banc, 0,5 % sur eps_eff et 1 % sur
/// Z0 (sa precision a ce rapport ; mesure 0,1 % et 0,2 %).
fn la_quadrature_suit_l_etendue() {
    let (h, er) = (0.1e-3, 4.3);
    let r = solve_line(&micro(1000.0 * h, 0.0, h, er)).unwrap();
    let (z_ref, e_ref) = hammerstad_jensen(1000.0, er);
    assert!(r.eps_eff < er, "{}", r.eps_eff);
    proche(r.eps_eff, e_ref, 5e-3, "eps_eff a w/h = 1000");
    proche(r.z0, z_ref, 1e-2, "Z0 a w/h = 1000");
    // sous etendue/h = 100, la quadrature est celle d'avant
    assert!(_n_quadrature(300, 3e-3, 0.1e-3) == 300);
    assert!((3000..=3001).contains(&_n_quadrature(300, 0.1, 0.1e-3)));
}

/// w/h < 1 : le crochet entier se divise par racine(w/h), plus 0,02 er
/// /(w/h). ETALON INDEPENDANT : Kirschning, Jansen et Koster (1983), tel que
/// le donne la documentation technique de Qucs (« Microstrip corner ») :
///
///     C [pF] = W [(10,35 er + 2,5) W/h + 2,6 er + 5,64]      W en metres
///
/// donnee pour 0,2 <= W/h <= 6. 20 % : les deux formules publiees different
/// de 13 % au pire sur la branche w/h >= 1 que le banc valide deja, de 16 %
/// sur celle-ci (mesure). L'ancienne ecriture s'en ecartait de 52 a 74 % a
/// w/h = 0,3.
fn le_coude_etroit_suit_la_formule_publiee() {
    let h = 0.2e-3;
    for er in [2.5, 4.3, 10.0] {
        for u in [0.3, 0.5, 0.75, 1.5] {
            let w = u * h;
            let (_l, c) = elements_coude(w, h, er, 90.0);
            let kjk = w * ((10.35 * er + 2.5) * u + 2.6 * er + 5.64) * 1e-12;
            proche(c, kjk, 0.20, &format!("C du coude, er {er:.1}, w/h {u:.2}"));
        }
    }
}

// ==========================================================================
// Le cuivre epais (constat 30 de l'audit)
// --------------------------------------------------------------------------
// DEUX ETALONS INDEPENDANTS DU MODULE, QUI S'ACCORDENT ENTRE EUX.
//   · Hammerstad et Jensen, « Accurate Models for Microstrip Computer-Aided
//     Design », IEEE MTT-S Digest 1980, eq. 6-7 : la correction d'epaisseur
//     du microruban, ecrite plus bas en formule fermee ;
//   · des differences finies 2D a CUIVRE EPAIS (rectangle de cuivre maille,
//     forme variationnelle de l'energie, grille graduee raffinee trois fois
//     par bissection et extrapolee a l'ordre 4/3 du coin a 270 degres ; le
//     vernis y est CONFORME : substrat, flancs et dessus du cuivre). Rien de
//     commun avec le module, ni Green ni panneaux. A cuivre nul elles rendent
//     Hammerstad-Jensen a 0,1 % sur Z0 et 0,2 % sur eps_eff, la triplaque
//     exacte a 0,06 % ; a cuivre epais elles suivent la formule de 1980 a
//     0,4 % (Z0) et 0,6 % (eps_eff) jusqu'a t/h = 1.
// Les chiffres « DF » ci-dessous en sortent, t de 17,5 a 210 um. Les
// tolerances sont l'ecart mesure, arrondi au-dessus, et jamais moins que ce
// que l'etalon vaut lui-meme (0,5 %).
//
// AVANT LE CONSTAT 30 : eps_eff +3 % (17,5 um) a +17 % (210 um) sur 0,3 / 0,2,
// jusqu'a +18 % sur le mode impair d'une paire et +19 % en coplanaire -- les
// flancs etaient comptes dans le stratifie.
// ==========================================================================

const _UM: f64 = 1e-6;
const _VERNIS: Masque = Masque { epaisseur: 25e-6, epsilon_r: 3.8 };

/// Z0 et eps_eff d'un microruban a cuivre epais, Hammerstad-Jensen 1980.
///
/// Le modele de 1980 en entier, et pas `hammerstad_jensen` plus haut, qui
/// est la forme courte de 1975 (1 % a elle seule) :
///
///     Z01(u) = (eta0/2pi) ln(f/u + racine(1 + 4/u^2))                 eq. 1-2
///     f = 6 + (2pi - 6) exp(-(30,666/u)^0,7528)
///     eps(u, er) = (er+1)/2 + (er-1)/2 (1 + 10/u)^(-a b)              eq. 3-5
///     a = 1 + ln((u^4 + (u/52)^2)/(u^4 + 0,432))/49 + ln(1 + (u/18,1)^3)/18,7
///     b = 0,564 ((er - 0,9)/(er + 3))^0,053
///     du1 = (t/pi) ln(1 + 4e / (t coth^2 racine(6,517 u)))            eq. 6
///     dur = du1 (1 + 1/cosh racine(er - 1)) / 2                       eq. 7
///     Z0 = Z01(u + dur) / racine(eps(u + dur, er))
///     eps_eff = eps(u + dur, er) [Z01(u + du1) / Z01(u + dur)]^2
///
/// t et u rapportes a h. Donnee a 0,01 % (Z01) et 0,2 % (eps) a t = 0.
fn hammerstad_jensen_epais(w: f64, t: f64, h: f64, er: f64) -> (f64, f64) {
    use std::f64::consts::E;
    let z01 = |u: f64| {
        let f = 6.0 + (2.0 * PI - 6.0) * (-(30.666 / u).powf(0.7528)).exp();
        376.730313668 / (2.0 * PI) * (f / u + (1.0 + 4.0 / (u * u)).sqrt()).ln()
    };

    let eps = |u: f64| {
        let a = 1.0 + ((u.powi(4) + (u / 52.0).powi(2)) / (u.powi(4) + 0.432)).ln() / 49.0 + (1.0 + (u / 18.1).powi(3)).ln() / 18.7;
        let b = 0.564 * ((er - 0.9) / (er + 3.0)).powf(0.053);
        (er + 1.0) / 2.0 + (er - 1.0) / 2.0 * (1.0 + 10.0 / u).powf(-a * b)
    };

    let (u, tn) = (w / h, t / h);
    let du1 = (tn / PI) * (1.0 + 4.0 * E / (tn / (6.517 * u).sqrt().tanh().powi(2))).ln();
    let dur = 0.5 * (1.0 + 1.0 / (er - 1.0).sqrt().cosh()) * du1;
    (z01(u + dur) / eps(u + dur).sqrt(), eps(u + dur) * (z01(u + du1) / z01(u + dur)).powi(2))
}

/// t de 17,5 a 210 um, trois sections, deux stratifies : 1 % sur Z0 et
/// sur eps_eff (mesure : 0,3 %), la formule etant donnee pour t/h < 1.
fn cuivre_epais_contre_hammerstad_jensen() {
    for (w, h, er) in [(0.3e-3, 0.2e-3, 4.3), (1.0e-3, 0.5e-3, 4.3), (0.2e-3, 0.3e-3, 3.0), (0.25e-3, 0.25e-3, 10.0)] {
        for t in [17.5, 35.0, 70.0, 105.0, 210.0] {
            if t * _UM > 0.75 * h {
                continue;
            }
            let r = solve_line(&micro(w, t * _UM, h, er)).unwrap();
            let (z_ref, e_ref) = hammerstad_jensen_epais(w, t * _UM, h, er);
            let quoi = format!("w/h {:.2}, er {er}, t {t} um", w / h);
            proche(r.z0, z_ref, 0.01, &format!("Z0, {quoi}"));
            proche(r.eps_eff, e_ref, 0.01, &format!("eps_eff, {quoi}"));
        }
    }
}

/// LE SYMPTOME DU CONSTAT : les flancs sont dans l'air, eps_eff BAISSE avec
/// l'epaisseur. Elle montait (3,13 a nu, 3,23 a 35 um, 3,28 a 210 um).
fn eps_eff_baisse_quand_le_cuivre_epaissit() {
    let vus: Vec<f64> = [0.0, 17.5, 35.0, 70.0, 105.0, 210.0].iter().map(|t| solve_line(&micro(0.3e-3, t * _UM, 0.2e-3, 4.3)).unwrap().eps_eff).collect();
    assert!(vus.windows(2).all(|p| p[1] < p[0]), "{vus:?}");
    // ... et sous une couverture epaisse du meme stratifie elle ne bouge
    // presque plus : les flancs sont noyes.
    let noyes: Vec<f64> =
        [0.0, 105.0].iter().map(|t| solve_line(&Geometrie { couverture: 5e-3, ..micro(0.3e-3, t * _UM, 0.2e-3, 4.3) }).unwrap().eps_eff).collect();
    proche(noyes[1], noyes[0], 0.01, "eps_eff sous couverture");
}

// (w, t, h en um, er, Z0, eps_eff) -- differences finies, piste NUE
const _DF_NU: [(f64, f64, f64, f64, f64, f64); 16] = [
    (150.0, 17.5, 100.0, 4.3, 55.10, 3.071),
    (150.0, 35.0, 100.0, 4.3, 53.28, 2.994),
    (150.0, 70.0, 100.0, 4.3, 50.79, 2.888),
    (150.0, 105.0, 100.0, 4.3, 49.04, 2.812),
    (200.0, 70.0, 200.0, 10.0, 44.42, 5.964),
    (300.0, 17.5, 200.0, 4.3, 56.31, 3.122),
    (300.0, 105.0, 200.0, 4.3, 51.91, 2.936),
    (1000.0, 35.0, 200.0, 4.3, 25.58, 3.503),
    (1000.0, 105.0, 200.0, 4.3, 24.95, 3.430),
    (1000.0, 210.0, 200.0, 4.3, 24.34, 3.356),
    (500.0, 105.0, 300.0, 3.0, 58.67, 2.246),
    (100.0, 70.0, 1600.0, 4.3, 154.52, 2.632),
    (100.0, 70.0, 1600.0, 10.0, 108.27, 5.360),
    (3000.0, 35.0, 1600.0, 4.3, 50.68, 3.235),
    (3000.0, 105.0, 1600.0, 4.3, 50.02, 3.203),
    (3000.0, 210.0, 1600.0, 4.3, 49.25, 3.166),
];

/// Seize sections, t/h jusqu'a 1,05, w/h de 0,06 a 5, er 3 a 10 : 1 % sur
/// Z0 (mesure 0,4 %) et sur eps_eff (mesure 0,6 %). Le module y etait a
/// -7 % / +17 %. A t/h = 2,1 (210 um sur 0,1 mm) la formule de 1980 sort de
/// son domaine : 2 % et 3 % (mesure -1,0 % / +1,9 %).
fn microruban_epais_contre_differences_finies() {
    for (w, t, h, er, z_ref, e_ref) in _DF_NU {
        let r = solve_line(&micro(w * _UM, t * _UM, h * _UM, er)).unwrap();
        let quoi = format!("w {w} / t {t} / h {h} um, er {er}");
        proche(r.z0, z_ref, 0.01, &format!("Z0, {quoi}"));
        proche(r.eps_eff, e_ref, 0.01, &format!("eps_eff, {quoi}"));
        assert!(!r.flancs_en_regard, "{quoi}");
    }
    let r = solve_line(&micro(150e-6, 210e-6, 100e-6, 4.3)).unwrap();
    proche(r.z0, 45.69, 0.02, "Z0 a t/h = 2,1");
    proche(r.eps_eff, 2.664, 0.03, "eps_eff a t/h = 2,1");
}

/// LE CAS COURANT : une couche exterieure est vernie. Vernis conforme de
/// 25 um a er 3,8, t de 17,5 a 105 um : Z0 a 1 % (mesure 0,6 %), eps_eff a
/// 2 % (mesure 1,0 % ; avant : +1 a +8 %). Piste couverte de 0,2 et 0,3 mm
/// du meme stratifie : 1 % (mesure 0,2 % / 0,6 % ; avant +2,1 % / +2,8 %).
/// C'est l'interpolation de `_part_des_flancs` qui est eprouvee ici.
fn vernis_et_couverture_contre_differences_finies() {
    for (w, t, h, z_ref, e_ref) in [(150.0, 35.0, 100.0, 49.93, 3.410), (300.0, 17.5, 200.0, 54.16, 3.375), (300.0, 35.0, 200.0, 52.88, 3.333), (300.0, 105.0, 200.0, 49.85, 3.183)] {
        let r = solve_line(&Geometrie { masque: Some(_VERNIS), ..micro(w * _UM, t * _UM, h * _UM, 4.3) }).unwrap();
        let quoi = format!("verni, w {w} / t {t} / h {h} um");
        proche(r.z0, z_ref, 0.01, &format!("Z0, {quoi}"));
        proche(r.eps_eff, e_ref, 0.02, &format!("eps_eff, {quoi}"));
    }
    for (w, t, h, c, z_ref, e_ref) in [(300.0, 35.0, 200.0, 200.0, 48.76, 3.920), (300.0, 105.0, 200.0, 300.0, 44.68, 3.963)] {
        let r = solve_line(&Geometrie { couverture: c * _UM, ..micro(w * _UM, t * _UM, h * _UM, 4.3) }).unwrap();
        let quoi = format!("couvert, t {t} um");
        proche(r.z0, z_ref, 0.01, &format!("Z0, {quoi}"));
        proche(r.eps_eff, e_ref, 0.01, &format!("eps_eff, {quoi}"));
    }
}

/// JEU DE CONTROLE : la triplaque n'a pas de flanc dans l'air, et le
/// constat 30 ne doit pas l'avoir touchee. (w, t, b, bas du cuivre en um,
/// Z0), t de 17,5 a 210 um, centree et decentree : 1,5 % (mesure 1,0 % au
/// pire, decentree) ; eps_eff = er au millieme.
fn triplaque_epaisse_contre_differences_finies() {
    for (w, t, b, bas, z_ref) in [
        (200.0, 17.5, 500.0, 241.25, 49.97),
        (200.0, 35.0, 500.0, 232.5, 46.80),
        (200.0, 70.0, 500.0, 215.0, 41.76),
        (200.0, 105.0, 500.0, 197.5, 37.64),
        (200.0, 210.0, 500.0, 145.0, 27.82),
        (150.0, 35.0, 1135.0, 100.0, 44.00),
        (200.0, 70.0, 600.0, 100.0, 34.70),
        (300.0, 105.0, 800.0, 200.0, 38.54),
    ] {
        let r = solve_line(&strip(w * _UM, t * _UM, b * _UM, (bas + t / 2.0) * _UM, 4.3)).unwrap();
        proche(r.z0, z_ref, 0.015, &format!("Z0, triplaque t {t} um / b {b}"));
        proche(r.eps_eff, 4.3, 1e-3, &format!("eps_eff, triplaque t {t} um"));
    }
}

// (w, s, t, h en um, Zdiff, Zcommune, eps impair, eps pair) -- er 4,3
type Paires = [(f64, f64, f64, f64, f64, f64, f64, f64)];
const _DF_PAIRES_NUES: &Paires = &[
    (150.0, 150.0, 35.0, 100.0, 93.15, 29.61, 2.659, 3.255),
    (200.0, 200.0, 17.5, 200.0, 115.02, 39.56, 2.686, 3.252),
    (300.0, 200.0, 70.0, 200.0, 86.35, 30.83, 2.558, 3.284),
    (300.0, 300.0, 105.0, 200.0, 89.00, 29.13, 2.562, 3.216),
    (500.0, 500.0, 210.0, 300.0, 83.19, 26.94, 2.550, 3.212),
];
const _DF_PAIRES_VERNIES: &Paires = &[(150.0, 150.0, 35.0, 100.0, 85.40, 28.13, 3.163, 3.604), (300.0, 200.0, 70.0, 200.0, 81.11, 29.91, 2.899, 3.488)];

/// LE RETARD D'UNE PAIRE : eps_eff des deux modes a 2 % (mesure 1,3 % ;
/// avant : +5 a +18 % sur le mode impair, +3 a +9 % sur le pair), nue et
/// vernie.
///
/// LES IMPEDANCES PORTENT LA LIMITE CONNUE (`ligne_mom.FLANCS_EN_REGARD`) :
/// le condensateur des flancs face a face manque. Z commune a 3 % (mesure
/// -0,2 a -2,4 %), Z differentielle a 5 % et TOUJOURS AU-DESSUS (mesure
/// +1,1 a +4,3 %, croissant avec t/s). Ces deux tolerances sont celles du
/// raccourci, pas de l'etalon ; elles se resserreront avec lui.
fn paire_epaisse_contre_differences_finies() {
    for (table, masque) in [(_DF_PAIRES_NUES, None), (_DF_PAIRES_VERNIES, Some(_VERNIS))] {
        for &(w, s, t, h, zd, zc, e_i, e_p) in table {
            let geo = Geometrie {
                masque,
                conducteurs: vec![Conducteur { w: w * _UM, ..Default::default() }, Conducteur { w: w * _UM, s: s * _UM, ..Default::default() }],
                ..micro(0.0, t * _UM, h * _UM, 4.3)
            };
            let r = solve_multiline(&geo).unwrap();
            let p = r.paire.unwrap();
            let quoi = format!("{} w {w} / s {s} / t {t} um", if masque.is_some() { "vernie" } else { "nue" });
            proche(p.eps_eff_impair, e_i, 0.02, &format!("eps impair, {quoi}"));
            proche(p.eps_eff_pair, e_p, 0.02, &format!("eps pair, {quoi}"));
            proche(p.z_commune, zc, 0.03, &format!("Z commune, {quoi}"));
            proche(p.z_diff, zd, 0.05, &format!("Z diff, {quoi}"));
            assert!(p.z_diff > zd, "{quoi} {} {zd}", p.z_diff);
            assert!(r.flancs_en_regard == (s < 6.0 * t), "{quoi} {s} {t}");
        }
    }
}

/// L'inverse d'une matrice 3 x 3 (`np.linalg.inv`), par les cofacteurs.
fn inverse3(m: &[[f64; 3]; 3]) -> [[f64; 3]; 3] {
    let cof = |i: usize, j: usize| m[(i + 1) % 3][(j + 1) % 3] * m[(i + 2) % 3][(j + 2) % 3] - m[(i + 1) % 3][(j + 2) % 3] * m[(i + 2) % 3][(j + 1) % 3];
    let d = m[0][0] * cof(0, 0) + m[0][1] * cof(0, 1) + m[0][2] * cof(0, 2);
    let mut inv = [[0.0; 3]; 3];
    for i in 0..3 {
        for j in 0..3 {
            inv[j][i] = cof(i, j) / d;
        }
    }
    inv
}

/// La formule a deux largeurs est ecrite en MATRICES, et elles ne
/// commutent que sur une section symetrique (`solve_multiline`, shortcut).
/// Le cas du banc de diaphonie -- trois pistes de 0,25 mm / 35 um vernies sur
/// 0,2 mm, ecarts 0,20 et 0,35 mm -- contre [C] et [C0] par differences
/// finies (pF/m, energie de six jeux de tensions). eps_eff de chaque piste a
/// 1 % (mesure 0,4 % ; avant +4 %), et le moteur du FEXT, kC - kL, a 6 %
/// (mesure -1 et -5 % ; avant -18 et -14 %).
fn trois_conducteurs_dissymetriques_contre_differences_finies() {
    let c_ref = [[108.399, -15.349, -0.716], [-15.349, 109.04, -6.793], [-0.716, -6.793, 105.722]];
    let c0_ref = [[33.782, -7.135, -0.78], [-7.135, 34.37, -4.04], [-0.78, -4.04, 32.495]];
    let cd = |x: f64| Conducteur { w: 0.25e-3, x: Some(x), ..Default::default() };
    let r = solve_multiline(&Geometrie { masque: Some(_VERNIS), conducteurs: vec![cd(-0.45e-3), cd(0.0), cd(0.60e-3)], ..micro(0.0, 35e-6, 0.2e-3, 4.3) }).unwrap();
    let pf = |m: &[Vec<f64>]| -> [[f64; 3]; 3] { std::array::from_fn(|i| std::array::from_fn(|j| m[i][j] * 1e12)) };
    let (c, c0) = (pf(&r.c), pf(&r.c0));

    let moteur = |c: &[[f64; 3]; 3], c0: &[[f64; 3]; 3], i: usize, j: usize| {
        let l = inverse3(c0);
        -c[i][j] / (c[i][i] * c[j][j]).sqrt() - l[i][j] / (l[i][i] * l[j][j]).sqrt()
    };
    for i in 0..3 {
        proche(c[i][i] / c0[i][i], c_ref[i][i] / c0_ref[i][i], 0.01, &format!("eps_eff du conducteur {}", i + 1));
    }
    for (j, quoi) in [(0, "0,20 mm"), (2, "0,35 mm")] {
        proche(moteur(&c, &c0, 1, j), moteur(&c_ref, &c0_ref, 1, j), 0.06, &format!("kC - kL a {quoi}"));
    }
}

/// Coplanaire avec plan, masses de la meme epaisseur. (w, t, h, ecart en
/// um, Z0, eps_eff), nue puis vernie. eps_eff a 5 % (mesure -0,8 a +4,4 % ;
/// avant : +6 a +19 %). Z0 porte la limite des flancs en regard : 8 %, et
/// toujours AU-DESSUS (mesure +3,1 a +7,3 % ; avant : -0,6 a +2,9 % nue par
/// compensation, +4,4 a +6,6 % vernie). Le drapeau le dit.
fn coplanaire_epaisse_contre_differences_finies() {
    let nues: &[(f64, f64, f64, f64, f64, f64)] = &[
        (200.0, 35.0, 200.0, 100.0, 53.90, 2.529),
        (300.0, 105.0, 200.0, 250.0, 47.78, 2.667),
        (500.0, 210.0, 500.0, 500.0, 56.28, 2.514),
        (300.0, 35.0, 1600.0, 70.0, 49.95, 2.301),
        (300.0, 35.0, 1600.0, 100.0, 56.86, 2.363),
        (300.0, 70.0, 1600.0, 200.0, 66.99, 2.315),
        (1000.0, 35.0, 1600.0, 200.0, 51.30, 2.555),
    ];
    let vernies: &[(f64, f64, f64, f64, f64, f64)] =
        &[(200.0, 35.0, 200.0, 100.0, 48.75, 3.091), (300.0, 17.5, 200.0, 150.0, 48.35, 3.213), (300.0, 105.0, 200.0, 250.0, 45.46, 2.947)];
    for (masque, table) in [(None, nues), (Some(_VERNIS), vernies)] {
        for &(w, t, h, e, z_ref, e_ref) in table {
            let r = solve_line(&Geometrie { masque, ecart: e * _UM, ..micro(w * _UM, t * _UM, h * _UM, 4.3) }).unwrap();
            let quoi = format!("{} w {w} / t {t} / ecart {e} um", if masque.is_some() { "vernie" } else { "nue" });
            proche(r.eps_eff, e_ref, 0.05, &format!("eps_eff, {quoi}"));
            proche(r.z0, z_ref, 0.08, &format!("Z0, {quoi}"));
            assert!(r.z0 > z_ref, "{quoi} {} {z_ref}", r.z0);
            assert!(r.flancs_en_regard == (e < 6.0 * t), "{quoi}");
        }
    }
}

/// Le drapeau du solveur : la part de `les_flancs_en_regard_remontent_en_avertissement` qui
/// ne demande que ligne_mom (la fiche, elle, attend simulation_em).
fn le_drapeau_des_flancs_en_regard() {
    assert!(_flancs_en_regard(Some(0.66), 35e-6, &[0.0, 200e-6]));
    assert!(!_flancs_en_regard(Some(0.66), 35e-6, &[0.0, 220e-6]));
    assert!(!_flancs_en_regard(Some(0.66), 0.0, &[100e-6]));
    assert!(!_flancs_en_regard(None, 35e-6, &[100e-6])); // triplaque
}

pub fn banc() {
    titre("Sans plan : ligne coplanaire dans l'air, contre la transformation conforme");
    T("sans plan : ligne seule contre la transformation conforme (0,5 %)", sans_plan_une_ligne_contre_l_exacte);
    T("sans plan : modes pair et impair d'une paire contre l'exacte (0,5 %)", sans_plan_une_paire_contre_l_exacte);
    T("sans plan : plaque finie contre les capacites partielles (1 %)", sans_plan_plaque_finie_contre_les_capacites_partielles);
    T("sans plan et sans masse : refus ; une garde suffit a porter le retour", sans_plan_et_sans_masse_rien_ne_porte_le_retour);

    titre("Audit de justesse numerique : deux dielectriques, quadrature, coude");
    T("la Green multicouche se reduit au nu, au couvert, au verni, a la triplaque", la_green_multicouche_se_reduit_aux_quatre_autres);
    T("une masse coplanaire serree reste une masse : trois cas contre volumes finis", une_masse_coplanaire_serree_reste_une_masse);
    T("Z0 ne saute plus quand l'ecart coplanaire traverse le seuil", z0_ne_saute_plus_quand_l_ecart_traverse_le_seuil);
    T("la quadrature suit l'etendue : un ruban tres large garde eps_eff < er", la_quadrature_suit_l_etendue);
    T("le coude etroit (w/h < 1) suit la formule publiee, contre Kirschning-Jansen", le_coude_etroit_suit_la_formule_publiee);

    titre("Le cuivre epais contre Hammerstad-Jensen 1980 et les differences finies");
    T("microruban nu, t de 17,5 a 210 um : Z0 et eps_eff a 1 % de la formule", cuivre_epais_contre_hammerstad_jensen);
    T("eps_eff baisse quand le cuivre epaissit, sauf noye", eps_eff_baisse_quand_le_cuivre_epaissit);
    T("microruban nu epais contre differences finies : 1 % sur Z0 et eps_eff", microruban_epais_contre_differences_finies);
    T("piste vernie ou couverte, cuivre epais, contre differences finies", vernis_et_couverture_contre_differences_finies);
    T("triplaque epaisse, t de 17,5 a 210 um, contre differences finies", triplaque_epaisse_contre_differences_finies);
    T("paire a cuivre epais : eps_eff a 2 %, Zdiff a 5 % (flancs en regard)", paire_epaisse_contre_differences_finies);
    T("trois conducteurs dissymetriques : eps_eff a 1 %, kC - kL a 6 %", trois_conducteurs_dissymetriques_contre_differences_finies);
    T("coplanaire a cuivre epais : eps_eff a 5 %, Z0 a 8 % (flancs en regard)", coplanaire_epaisse_contre_differences_finies);
    T("le drapeau des flancs en regard (la part ligne_mom de son cas)", le_drapeau_des_flancs_en_regard);
}
