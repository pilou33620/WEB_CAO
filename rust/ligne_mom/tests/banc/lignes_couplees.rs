// ==========================================================================
// Les lignes COUPLEES, contre deux etalons exterieurs
// --------------------------------------------------------------------------
// JUSQU'ICI, [C] ET [L] MULTI-CONDUCTEURS N'AVAIENT AUCUNE REFERENCE
// EXTERIEURE. Tout le crosstalk en depend -- Kb, Kf, la matrice S cascadee --
// et le banc ne verifiait que leur coherence interne : une erreur commune aux
// deux lignes de calcul ne s'y serait pas vue.
//
// LA TRIPLAQUE A UNE SOLUTION EXACTE (Cohn, 1955, ruban mince) : Z pair et
// Z impair en integrales elliptiques. Le milieu y est homogene, donc
// k = (Ze - Zo)/(Ze + Zo) vaut EXACTEMENT Cm/C0 = Lm/L0, et Kb = k/2 -- c'est
// l'etalon de Kb, a tout ecart.
//
// LE MICRORUBAN N'EN A PAS. Garg-Bahl (1979) annonce 3 % sur Ze et Zo, et
// c'est a ce titre seulement qu'il sert ici. PAS POUR Kb NI Kf : ce sont des
// DIFFERENCES de deux grandeurs presque egales, et les 3 % de la formule sur
// chaque capacite y deviennent 10 a 20 % en couplage faible. Le banc l'a
// mesure avant de s'en abstenir ; la triplaque, exacte, montre que ces 20 %
// sont ceux de la formule et non du solveur.
// ==========================================================================

use crate::*;

/// (Ze, Zo) d'une paire triplaque centree, ruban mince -- Cohn, exacte.
fn cohn_couplee(w: f64, s: f64, b: f64, er: f64) -> (f64, f64) {
    let z = |k: f64| (30.0 * PI / er.sqrt()) * ellipk(1.0 - k * k) / ellipk(k * k);
    let t1 = (PI * w / (2.0 * b)).tanh();
    let t2 = (PI * (w + s) / (2.0 * b)).tanh();
    (z(t1 * t2), z(t1 / t2))
}

/// (Ze, Zo) d'une paire microruban, ruban mince -- Garg et Bahl, 1979.
///
/// Capacites paire et impaire decomposees en plaque, franges, et couplage
/// par l'air et par le dielectrique ; Z = 1/(c.sqrt(C.Ca)), Ca etant la meme
/// capacite a er = 1. La ligne seule dont partent les franges est celle de
/// Hammerstad-Jensen 1980 (celle que Garg-Bahl ont calee), pas la version
/// simplifiee de `hammerstad_jensen` plus haut.
fn garg_bahl_couplee(w: f64, s: f64, h: f64, er: f64) -> (f64, f64) {
    let (u, g) = (w / h, s / h);

    let ligne_seule = |er_: f64| -> (f64, f64) {
        let a = 1.0 + ((u.powi(4) + (u / 52.0).powi(2)) / (u.powi(4) + 0.432)).ln() / 49.0 + (1.0 + (u / 18.1).powi(3)).ln() / 18.7;
        let bb = 0.564 * ((er_ - 0.9) / (er_ + 3.0)).powf(0.053);
        let ee = (er_ + 1.0) / 2.0 + (er_ - 1.0) / 2.0 * (1.0 + 10.0 / u).powf(-a * bb);
        let f = 6.0 + (2.0 * PI - 6.0) * (-(30.666 / u).powf(0.7528)).exp();
        let z1 = 60.0 * (f / u + (1.0 + (2.0 / u).powi(2)).sqrt()).ln();
        (z1 / ee.sqrt(), ee)
    };

    let capacites = |er_: f64| -> (f64, f64) {
        let (z, ee) = ligne_seule(er_);
        let cp = EPSILON_0 * er_ * u;
        let cf = 0.5 * (ee.sqrt() / (C_0 * z) - cp);
        let a = (-0.1 * (2.33 - 2.53 * u).exp()).exp();
        let cf2 = cf / (1.0 + a / g * (8.0 * g).tanh()) * (er_ / ee).sqrt();
        let k = g / (g + 2.0 * u);
        let cga = EPSILON_0 * ellipk(1.0 - k * k) / ellipk(k * k);
        let cgd = EPSILON_0 * er_ / PI * (1.0 / (PI * g / 4.0).tanh()).ln() + 0.65 * cf * (0.02 / g * er_.sqrt() + 1.0 - er_.powi(-2));
        (cp + cf + cf2, cp + cf + cga + cgd)
    };

    let (ce, co) = capacites(er);
    let (cea, coa) = capacites(1.0);
    (1.0 / (C_0 * (ce * cea).sqrt()), 1.0 / (C_0 * (co * coa).sqrt()))
}

/// Ze, Zo, Kb, Kf et eps_eff d'une paire symetrique, par `solve_multiline`.
fn _paire_modes(milieu: Geometrie, w: f64, s: f64) -> (f64, f64, f64, f64, f64) {
    let r = solve_multiline(&Geometrie { conducteurs: deux(w, s), ..milieu }).unwrap();
    let (c, l) = (&r.c, &r.l);
    let ze = ((l[0][0] + l[0][1]) / (c[0][0] + c[0][1])).sqrt();
    let zo = ((l[0][0] - l[0][1]) / (c[0][0] - c[0][1])).sqrt();
    // Maxwell : la mutuelle capacitive est -c[0][1] -- meme convention que
    // crosstalk.coefficients_couple, recalculee ici pour ne pas en dependre.
    let kb = 0.25 * (-c[0][1] / c[0][0] + l[0][1] / l[0][0]);
    let kf = 0.5 * (l[0][1] / l[0][0] + c[0][1] / c[0][0]);
    (ze, zo, kb, kf, r.lignes[0].eps_eff)
}

/// Les deux modes d'une paire microruban sur H, er = 4,3.
fn _modes_de(w: f64, s: f64) -> Vec<Mode> {
    solve_multiline(&Geometrie { conducteurs: deux(w, s), ..micro(0.0, 0.0, H, 4.3) }).unwrap().modes
}

// ==========================================================================
// LES LIGNES COUPLEES : LA MATRICE DE MAXWELL ET LES DEUX MODES
// --------------------------------------------------------------------------
// UN SEUL CHANTIER, DEUX REPONSES. `solve_multiline` resout la meme section que
// `solve_line` avec N seconds membres au lieu d'un, et rend la matrice de
// capacite de Maxwell [C] puis [L] = mu0 eps0 [C0]^-1. Tout ce qui suit en
// sort : modes pair et impair, Z differentielle, Z commune, NEXT et FEXT.
//
// QUATRE INVARIANTS GRATUITS, et ils attrapent une erreur de signe ou d'indice
// avant tout etalon : la matrice est SYMETRIQUE, sa diagonale POSITIVE, ses
// termes croises NEGATIFS, et la somme d'une ligne vaut la capacite du
// conducteur VERS LA REFERENCE -- donc positive et plus petite que sa
// diagonale.
//
// DEUX REDUCTIONS EXACTES : un conducteur seul par la matrice doit redonner
// `solve_line` AU BIT PRES -- c'est la meme quadrature, les memes panneaux, le
// meme milieu --, et deux rubans qu'on eloigne doivent se decoupler, chacun
// retrouvant la capacite du ruban seul.
//
// UN ETALON EXTERIEUR : la forme fermee de Garg-Bahl pour le microruban couple
// par les aretes, qui vaut a quelques pour cent. Il en fallait un : les
// invariants et les reductions verifient la COHERENCE du calcul, pas sa
// justesse. C'est la meme exigence que Hammerstad-Jensen pour la ligne seule.
//
// ET UNE PROPRIETE PHYSIQUE QUI NE SE DISCUTE PAS : en milieu HOMOGENE, la
// couplage AVANT est nul. Une triplaque n'a pas de FEXT -- k_C et k_L y sont
// egaux terme a terme --, un microruban si, et de signe negatif. Rien de plus
// severe pour verifier que [C] et [L] decrivent bien la MEME geometrie.
// ==========================================================================

/// Z pair, Z impair et leurs eps_eff d'un microruban couple. u=w/h, g=s/h.
///
/// Garg et Bahl (1979), tel que repris par Gupta, « Microstrip Lines and
/// Slotlines » : les capacites de chaque mode se composent d'un terme plan,
/// d'une frange exterieure, et -- pour le mode impair seul -- des deux termes
/// de couplage, celui de l'air (integrale elliptique) et celui du dielectrique
/// (coth). La forme est donnee a quelques pour cent, ce qui est exactement ce
/// qu'on attend d'un etalon exterieur ici : il ne sert pas a affiner le
/// solveur, il sert a exclure qu'il se trompe de physique.
fn garg_bahl(u: f64, g: f64, er: f64) -> (f64, f64, f64, f64) {
    let capacites = |epsr: f64| -> (f64, f64) {
        let (z0, ere) = hammerstad_jensen(u, epsr);
        let c_p = EPSILON_0 * epsr * u;
        let c_f = 0.5 * (ere.sqrt() / (C_0 * z0) - c_p);
        let a = (-0.1 * (2.33 - 1.5 * u).exp()).exp();
        let c_fp = c_f / (1.0 + a / g * (8.0 * g).tanh()) * (epsr / ere).sqrt();
        let k = g / (g + 2.0 * u);
        let c_ga = EPSILON_0 * ellipk(1.0 - k * k) / ellipk(k * k);
        let c_gd = (EPSILON_0 * epsr / PI) * (1.0 / (PI * g / 4.0).tanh()).ln() + 0.65 * c_f * (0.02 / g * epsr.sqrt() + 1.0 - epsr.powi(-2));
        (c_p + c_f + c_fp, c_p + c_f + c_ga + c_gd)
    };

    let (c_pair, c_impair) = capacites(er);
    let (c_pair_air, c_impair_air) = capacites(1.0);
    (1.0 / (C_0 * (c_pair * c_pair_air).sqrt()), 1.0 / (C_0 * (c_impair * c_impair_air).sqrt()), c_pair / c_pair_air, c_impair / c_impair_air)
}

/// Une paire symetrique de microruban, resolue.
fn _paire(w: f64, s: f64, t: f64) -> Multiligne {
    solve_multiline(&Geometrie { conducteurs: vec![Conducteur { w, ..Default::default() }, Conducteur { w, s, ..Default::default() }], ..micro(0.0, t, H, 4.3) }).unwrap()
}

fn matrice(places: &[Place], green: &Green, m: &Milieu, eps: f64, symetriser: bool) -> Vec<Vec<f64>> {
    capacitance_matrice(places, 0.0, 0.0, green, m.distance, eps, N_PANNEAUX, N_QUADRATURE, &[], None, None, symetriser).unwrap()
}

/// N = 1 DOIT REDONNER LE CHIFFRE ACTUEL AU BIT PRES.
///
/// C'est la reduction la plus severe de tout ce lot : meme milieu, memes
/// panneaux, meme quadrature -- le seul changement est la forme du second
/// membre, qui devient une matrice a une colonne. Un ecart ici ne serait pas
/// une imprecision, ce serait un chemin de calcul different.
fn un_conducteur_par_la_matrice_redonne_la_ligne_seule() {
    let geo = micro(0.35e-3, 35e-6, H, 4.3);
    let seul = solve_line(&geo).unwrap();
    let m = _milieu(&geo).unwrap();
    let places = _conducteurs_places(&[Conducteur { w: 0.35e-3, ..Default::default() }], 35e-6, |w, t| _elargir(&m, w, t)).unwrap();
    let c0 = matrice(&places, &m.g_vide, &m, m.eps_vide, true);
    // Depuis le constat 30, C se calcule sur le ruban MOINS elargi du
    // dielectrique (`_part_des_flancs`) : C = C(w_d) C0(w_d) / C0(w). Meme
    // reduction, meme tolerance -- les trois matrices a une case.
    let flancs = m.flancs.unwrap();
    let places_d: Vec<Place> = places.iter().map(|p| Place { w: p.w_nue + flancs * (p.w - p.w_nue), ..p.clone() }).collect();
    let c = matrice(&places_d, &m.g_diel, &m, m.eps_moyen, true);
    let c0_d = matrice(&places_d, &m.g_vide, &m, m.eps_vide, true);
    proche(c[0][0] * c0_d[0][0] / c0[0][0], seul.c, 1e-12, "C par la matrice");
    proche(c0[0][0], seul.c0, 1e-12, "C0 par la matrice");
}

/// SYMETRIQUE, DIAGONALE POSITIVE, CROISES NEGATIFS, SOMME DE LIGNE JUSTE.
///
/// Les trois premiers attrapent une erreur de signe ou d'indice ; le quatrieme
/// dit ce que la matrice de Maxwell EST : la somme d'une ligne est la charge
/// portee par le conducteur quand TOUS sont au meme potentiel, c'est-a-dire sa
/// capacite vers la reference seule -- necessairement positive, et plus petite
/// que sa diagonale puisque le voisin lui en a pris une part.
///
/// LA SYMETRIE SE MESURE SUR LA MATRICE BRUTE. `capacitance_matrice` symetrise
/// en sortie, comme tout extracteur ; la verifier apres coup ne verifierait
/// rien du tout, et cacherait justement le jour ou la discretisation ne
/// suffirait plus. Sur trois pistes de largeurs differentes -- le cas le plus
/// defavorable, puisque A[m,k] ne depend que de la largeur de k --, l'ecart
/// mesure vaut 3,1e-06 ; le seuil est pose a 1e-05, et le franchir voudrait
/// dire qu'il faut plus de panneaux.
fn la_matrice_porte_ses_quatre_invariants() {
    let c = |w: f64, s: f64| Conducteur { w, s, ..Default::default() };
    let geo = Geometrie { conducteurs: vec![c(0.25e-3, 0.0), c(0.4e-3, 0.18e-3), c(0.25e-3, 0.3e-3)], ..micro(0.0, 35e-6, H, 4.3) };
    let m = _milieu(&geo).unwrap();
    let places = _conducteurs_places(&geo.conducteurs, 35e-6, |w, t| _elargir(&m, w, t)).unwrap();
    let brute = matrice(&places, &m.g_diel, &m, m.eps_moyen, false);
    let mut asymetrie = 0.0f64;
    let mut plus_grand = 0.0f64;
    for i in 0..3 {
        for j in 0..3 {
            asymetrie = asymetrie.max((brute[i][j] - brute[j][i]).abs());
            plus_grand = plus_grand.max(brute[i][j].abs());
        }
    }
    let ecart = asymetrie / plus_grand;
    assert!(ecart < 1e-5, "matrice brute asymetrique de {ecart:.2e}");

    let c = solve_multiline(&geo).unwrap().c;
    assert!((0..3).all(|i| c[i][i] > 0.0), "diagonale non positive : {c:?}");
    for i in 0..3 {
        for j in 0..3 {
            if i != j {
                assert!(c[i][j] < 0.0, "C[{i},{j}] = {:.3e}, une mutuelle de Maxwell est negative", c[i][j]);
            }
        }
        let vers_masse: f64 = c[i].iter().sum();
        assert!(0.0 < vers_masse && vers_masse < c[i][i], "somme de la ligne {i} : {vers_masse:.3e} hors de ]0 ; {:.3e}[", c[i][i]);
    }
}

/// LOIN L'UN DE L'AUTRE, CHACUN REDEVIENT UN RUBAN SEUL.
///
/// Le terme croise doit tomber a rien, et surtout chaque DIAGONALE doit
/// retrouver la capacite du ruban seul : un couplage residuel se verrait
/// d'abord la, parce que la diagonale de Maxwell compte la mutuelle.
fn deux_rubans_eloignes_se_decouplent() {
    let w = 0.35e-3;
    let seul = solve_line(&micro(w, 35e-6, H, 4.3)).unwrap();
    let r = _paire(w, 20.0 * H, 35e-6);
    let c = &r.c;
    let couplage = (c[0][1] / c[0][0]).abs();
    assert!(couplage < 2e-3, "a vingt hauteurs, il reste {couplage:.3e} de couplage");
    proche(c[0][0], seul.c, 2e-3, "C11 du ruban eloigne");
    proche(r.lignes[0].z0, seul.z0, 2e-3, "Z0 du ruban eloigne");
}

/// Z_DIFF -> 2 Z0 QUAND L'ECART DEVIENT GRAND DEVANT LA HAUTEUR.
///
/// Deux lignes qui ne se voient plus, prises en differentiel, ne sont que deux
/// lignes en serie : la tension entre elles est deux fois celle de chacune au
/// plan de symetrie, et le courant est le meme. C'est la seule facon de
/// verifier le facteur deux de Z_diff sans le poser par convention.
fn z_diff_tend_vers_deux_fois_z0() {
    let w = 0.35e-3;
    let z0 = z0(&micro(w, 0.0, H, 4.3));
    proche(_paire(w, 30.0 * H, 0.0).paire.unwrap().z_diff, 2.0 * z0, 5e-3, "Z_diff loin");
    // Et Z commune tend vers Z0/2, par le meme raisonnement en parallele.
    proche(_paire(w, 30.0 * H, 0.0).paire.unwrap().z_commune, z0 / 2.0, 5e-3, "Z_commune loin");
}

/// SERRER FAIT BAISSER Z_DIFF ET MONTER Z_COMMUNE, toujours.
///
/// Les deux vont en sens INVERSE, et c'est ce qui distingue un vrai couplage
/// d'une erreur d'echelle qui deplacerait les deux ensemble.
fn serrer_la_paire_baisse_z_diff() {
    let (mut diff, mut comm, mut k) = (Vec::new(), Vec::new(), Vec::new());
    for s in [0.15e-3, 0.25e-3, 0.5e-3, 1.0e-3] {
        let p = _paire(0.25e-3, s, 0.0).paire.unwrap();
        diff.push(p.z_diff);
        comm.push(p.z_commune);
        k.push(p.k_c);
    }
    assert!(diff.windows(2).all(|p| p[0] < p[1]), "{diff:?}");
    assert!(comm.windows(2).all(|p| p[0] > p[1]), "{comm:?}");
    assert!(k.windows(2).all(|p| p[0] > p[1]), "{k:?}");
}

/// LA CONDITION AUX LIMITES, ET ELLE EST EXACTE.
///
/// Un flottant n'a pas de ligne dans [C] -- on ne lui demande pas son
/// impedance --, exactement comme une garde. Ce qui les separe est ce qu'on
/// leur impose : la garde a un POTENTIEL nul et une charge libre, le flottant
/// une CHARGE nulle et un potentiel libre.
///
/// On verifie d'abord que la matrice a bien la taille des seuls PORTS, dans
/// les deux cas : si le flottant y gardait une ligne, tout ce qui lit [C] par
/// rang designerait la mauvaise piste.
fn un_conducteur_flottant_a_charge_nulle_et_potentiel_libre() {
    let section = |masse: bool, flottant: bool| {
        let c = |w: f64, x: f64| Conducteur { w, x: Some(x), ..Default::default() };
        let conducteurs = vec![c(0.25e-3, -0.6e-3), Conducteur { masse, flottant, ..c(0.35e-3, 0.0) }, c(0.25e-3, 0.6e-3)];
        solve_multiline(&Geometrie { kind: Kind::lire("microstrip"), conducteurs, ecart_g: Some(0.5e-3), ecart_d: Some(0.5e-3), ..micro(0.0, 35e-6, 0.2e-3, 4.3) })
            .unwrap()
    };

    for (masse, flottant) in [(true, false), (false, true)] {
        let r = section(masse, flottant);
        let quoi = if masse { "masse" } else { "flottant" };
        assert!(r.c.len() == 2 && r.c[0].len() == 2, "{quoi} : la matrice doit n'avoir que les PORTS, pas {}", r.c.len());
        assert!(r.lignes.len() == 2, "{quoi} : {} lignes", r.lignes.len());
    }
}

pub fn banc() {
    titre("Paire triplaque contre Cohn (exacte) : Ze, Zo, Kb, eps_eff");
    for u in [0.2, 0.5, 1.0] {
        for g in [0.05, 0.1, 0.3, 1.0] {
            T(&format!("w/b={u:3.1}  s/b={g:4.2}"), || {
                let (b, er) = (1e-3, 4.3);
                let (ze, zo, kb, kf, ee) = _paire_modes(strip(0.0, 0.0, b, b / 2.0, er), u * b, g * b);
                let (ze_r, zo_r) = cohn_couplee(u * b, g * b, b, er);
                proche(ze, ze_r, 0.005, "Ze");
                // LE MODE IMPAIR EST LE PLUS DUR : le champ se concentre dans
                // l'intervalle, aux aretes -- 1,3 % au plus serre mesure.
                proche(zo, zo_r, if g < 0.1 { 0.015 } else { 0.01 }, "Zo");
                proche(kb, (ze_r - zo_r) / (ze_r + zo_r) / 2.0, 0.03, "Kb");
                // MILIEU HOMOGENE : pas de FEXT, et une seule vitesse, celle du
                // stratifie. Le eps_eff par conducteur a vaut 4,53 ici a 0,1 mm
                // d'ecart -- c^2.L_ii.C_ii au lieu de C_ii/C0_ii.
                assert!(kf.abs() < 1e-6, "Kf doit etre nul en triplaque : {kf}");
                assert!((ee - er).abs() < 1e-6, "eps_eff d'une piste couplee en triplaque : {ee:.4} au lieu de {er:.2}");
            });
        }
    }

    titre("Paire microruban contre Garg-Bahl (+-3 %, la precision de la formule)");
    for u in [0.5, 1.0, 2.0] {
        for g in [0.25, 0.5, 1.0, 2.0] {
            T(&format!("w/h={u:3.1}  s/h={g:4.2}"), || {
                let (ze, zo, _kb, kf, ee) = _paire_modes(micro(0.0, 0.0, H, 4.3), u * H, g * H);
                let (ze_r, zo_r) = garg_bahl_couplee(u * H, g * H, H, 4.3);
                proche(ze, ze_r, 0.03, "Ze");
                proche(zo, zo_r, 0.03, "Zo");
                // En milieu NON homogene, le champ du mode impair passe davantage
                // dans l'air : Kf > 0, et eps_eff tombe ENTRE les deux modes.
                assert!(kf > 0.0, "{kf}");
                let mut modes: Vec<f64> = _modes_de(u * H, g * H).iter().map(|m| m.eps_eff).collect();
                modes.sort_by(f64::total_cmp);
                assert!(modes[0] < ee && ee < modes[1], "{modes:?} {ee}");
            });
        }
    }

    titre("Les lignes couplees : les invariants de la matrice de Maxwell");
    T("N = 1 par la matrice redonne solve_line au bit pres", un_conducteur_par_la_matrice_redonne_la_ligne_seule);
    T("la matrice porte ses quatre invariants", la_matrice_porte_ses_quatre_invariants);
    T("deux rubans eloignes se decouplent", deux_rubans_eloignes_se_decouplent);
    T("Z_diff tend vers 2 Z0 quand l'ecart s'ouvre", z_diff_tend_vers_deux_fois_z0);
    T("serrer la paire baisse Z_diff et monte Z_commune", serrer_la_paire_baisse_z_diff);

    titre("La paire de microruban contre Garg-Bahl (+-3 %)");
    for u in [0.5, 1.0, 2.0] {
        for g in [0.5, 1.0, 2.0] {
            T(&format!("w/h={u:3.1}  s/h={g:3.1}"), || {
                let (z_pair, z_impair, e_pair, e_impair) = garg_bahl(u, g, 4.3);
                let p = _paire(u * H, g * H, 0.0).paire.unwrap();
                proche(p.z_diff, 2.0 * z_impair, 0.03, "Z_diff");
                proche(p.z_commune, z_pair / 2.0, 0.03, "Z_commune");
                proche(p.eps_eff_impair, e_impair, 0.02, "eps_eff impair");
                proche(p.eps_eff_pair, e_pair, 0.02, "eps_eff pair");
                // L'IMPAIR VOIT PLUS D'AIR QUE LE PAIR : son champ passe entre les
                // deux rubans, au-dessus du stratifie. eps_eff impair < pair, et
                // c'est CE fait qui fait exister le couplage avant (FEXT).
                assert!(p.eps_eff_impair < p.eps_eff_pair, "eps_eff impair {:.3} >= pair {:.3}", p.eps_eff_impair, p.eps_eff_pair);
            });
        }
    }

    titre("La couture du cuivre de masse");
    T("un conducteur flottant a charge nulle et potentiel libre", un_conducteur_flottant_a_charge_nulle_et_potentiel_libre);
}
