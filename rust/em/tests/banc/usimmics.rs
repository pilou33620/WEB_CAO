//! Banc de recoupement du crosstalk contre le calculateur de lignes de uSimmics.
//!
//!     python python/test/banc-usimmics.py
//!
//! A QUOI IL SERT. Valider le moteur de crosstalk (python/crosstalk.py, qui
//! s'appuie sur python/ligne_mom.py) contre un outil EXTERIEUR, avec trois
//! configurations qu'on rencontre sur une carte FR-4 :
//!
//!   · CAS 1 -- agresseur + victime, PAS DE PLAN dessous, la masse arrosee sur
//!     la meme couche pour seul retour (carte deux couches) ;
//!   · CAS 2 -- agresseur + victime, plan de masse DESSOUS (microruban couple) ;
//!   · CAS 3 -- agresseur + victime, plan DESSOUS et masse SUR LES COTES
//!     (ligne coplanaire couplee avec plan dessous).
//!
//! LE PARTAGE DU TRAVAIL. Le script imprime, pour chaque cas, les valeurs a
//! saisir dans le calculateur de uSimmics (Tools > Transmission Line
//! Calculator). On recopie les quatre resultats de uSimmics (Z_even, Z_odd,
//! eps_eff_even, eps_eff_odd) dans python/test/usimmics-releves.csv, et on
//! relance : le script calcule les memes grandeurs avec le moteur de l'outil et
//! imprime les ecarts.
//!
//! CE QUI EST COMPARE. Les quatre grandeurs de uSimmics sont des grandeurs de
//! SECTION DROITE. On en tire [L] et [C], puis Kb (NEXT) et Kf (FEXT) avec la
//! fonction de l'outil (`crosstalk.coefficients_couple`). Seules les ENTREES
//! different : un ecart ne peut venir que du calcul de la section, pas de la
//! formule de Kb ou de Kf.
//!
//! LE CAS 1 SANS AUCUNE MASSE N'A PAS DE CHIFFRE, ET C'EST CE QU'ON VERIFIE EN
//! PLUS. Sans aucun conducteur de reference, il n'y a pas de ligne quasi-TEM
//! « agresseur / victime » : la tension de la victime n'est definie que par
//! rapport a un retour, et c'est ce retour qui fixe le couplage. uSimmics n'a pas
//! de structure pour ce cas ; l'outil doit REFUSER en le disant, jamais rendre un
//! couplage nul (un zero qu'on n'a pas mesure ressemble a un zero).

use crate::*;
use em::crosstalk as ct;
use std::collections::HashMap;

const C0: f64 = 299792458.0;
const RELEVES: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../../python/test/usimmics-releves.csv");

// ==========================================================================
// La carte : FR-4 4 couches classique, 1,6 mm, cuivre 1 oz
// ==========================================================================
//
// Seule la premiere paire de couches compte ici : la piste est en Top, le plan
// en L2 (GND), sous un prepreg 7628 de 0,2 mm. W = 0,35 mm donne ~50 ohms.

const ER: f64 = 4.3; // FR-4 vers 1 GHz (4,2 a 4,5 selon le fournisseur)
const TAN_D: f64 = 0.02;
const H: f64 = 0.2; // mm, prepreg Top -> GND
const T_CU: f64 = 0.035; // mm, cuivre 1 oz
const W: f64 = 0.35; // mm, largeur des deux pistes
const G: f64 = 0.3; // mm, ecart piste -> masse coplanaire (cas 3)
const ECARTS: [f64; 4] = [0.2, 0.35, 0.7, 1.05]; // mm, S = ~0,6 W, 1 W, 2 W, 3 W
const LONGUEUR: f64 = 50.0; // mm de longement, pour les NEXT/FEXT indicatifs
const T_MONTEE: f64 = 1e-9; // s, front de l'agresseur, pour les NEXT/FEXT indicatifs

// Un « masque » d'epsilon 1 : de l'air. Sans lui, une piste nue a la face
// recoit le vernis par defaut (25 um, er 3,8), que uSimmics ne modelise pas.
fn sans_vernis() -> Json {
    obj! {"type" => "dielectric", "name" => "mask (air)",
          "thickness" => 0.025, "epsilon_r" => 1.0}
}

fn empilage_plan() -> Vec<Json> {
    vec![
        obj! {"type" => "copper", "name" => "Top", "thickness" => T_CU, "role" => "signal"},
        obj! {"type" => "dielectric", "name" => "prepreg 7628", "thickness" => H,
              "epsilon_r" => ER, "tan_delta" => TAN_D},
        obj! {"type" => "copper", "name" => "GND", "thickness" => T_CU, "role" => "plane",
              "net" => "GND"},
        obj! {"type" => "dielectric", "name" => "coeur", "thickness" => 1.2,
              "epsilon_r" => ER, "tan_delta" => TAN_D},
        obj! {"type" => "copper", "name" => "Bottom", "thickness" => T_CU, "role" => "signal"},
    ]
}
// Le cas 1 : une carte 2 couches de 1,6 mm, sans plan nulle part.
const H_SANS_PLAN: f64 = 1.6; // mm
fn empilage_sans_plan() -> Vec<Json> {
    vec![
        obj! {"type" => "copper", "name" => "Top", "thickness" => T_CU, "role" => "signal"},
        obj! {"type" => "dielectric", "name" => "FR-4", "thickness" => H_SANS_PLAN,
              "epsilon_r" => ER, "tan_delta" => TAN_D},
        obj! {"type" => "copper", "name" => "Bottom", "thickness" => T_CU, "role" => "signal"},
    ]
}

struct Cas {
    nom: &'static str,
    titre: &'static str,
    usimmics: &'static str,
    g: f64,
    empilage: Vec<Json>,
    h: f64,
}

fn cas() -> Vec<Cas> {
    vec![
        Cas { nom: "cas1", titre: "PAS de plan dessous, masse sur les cotes (2 couches)",
              usimmics: "Coupled Coplanar Waveguide (SANS « Backside »)",
              g: G, empilage: empilage_sans_plan(), h: H_SANS_PLAN },
        Cas { nom: "cas2", titre: "plan dessous, pas de masse sur les cotes",
              usimmics: "Coupled Microstrip", g: 0.0,
              empilage: empilage_plan(), h: H },
        Cas { nom: "cas3", titre: "plan dessous ET masse sur les cotes",
              usimmics: "Coupled Coplanar Waveguide with Backside", g: G,
              empilage: empilage_plan(), h: H },
    ]
}

// ==========================================================================
// Le moteur de l'outil
// ==========================================================================

struct Grandeurs {
    ze: f64,
    zo: f64,
    ee: f64,
    eo: f64,
    kb: f64,
    kf: f64,
}

/// [C], [C0], [L] de la paire, par le meme chemin que crosstalk.py :
/// section_de_couche (empilage -> geometrie), puis solve_multiline.
fn section_paire(empilage: &[Json], s: f64, g: f64, vernis: bool) -> Result<tl::Multiligne, String> {
    let mut couches = if vernis { Vec::new() } else { vec![sans_vernis()] };
    couches.extend(empilage.iter().cloned());
    let haut = if vernis { 0 } else { 1 };
    // `sans_plan` : le meme drapeau que crosstalk.py. Sous un plan il ne
    // change rien ; sans plan, il ouvre la coplanaire sans plan dessous.
    let (geo, raison) = section_de_couche(&couches, haut, W, T_CU, g, Some(g), &[], true);
    let Some(mut geo) = geo else { return Err(t(&raison).to_string()) };
    let x = (W + s) / 2.0 * 1e-3;
    poser(&mut geo, "conducteurs", vec![obj! {"w" => W * 1e-3, "x" => -x}, obj! {"w" => W * 1e-3, "x" => x}]);
    // (le ValueError du solveur, que le garde-fou du Python rattrapait)
    tl::solve_multiline(&geometrie(&geo)).map_err(|e| e.0)
}

fn grandeurs_outil(r: &tl::Multiligne) -> Grandeurs {
    let (c, c0, l) = (&r.c, &r.c0, &r.l);
    let ze = ((l[0][0] + l[0][1]) / (c[0][0] + c[0][1])).sqrt();
    let zo = ((l[0][0] - l[0][1]) / (c[0][0] - c[0][1])).sqrt();
    let ee = (c[0][0] + c[0][1]) / (c0[0][0] + c0[0][1]);
    let eo = (c[0][0] - c[0][1]) / (c0[0][0] - c0[0][1]);
    let (kb, kf) = ct::coefficients_couple(c, l, 0, 1);
    Grandeurs { ze, zo, ee, eo, kb, kf }
}

/// Les quatre chiffres de uSimmics -> [L], [C] -> Kb, Kf, par la MEME
/// fonction que l'outil.
fn grandeurs_usimmics(ze: f64, zo: f64, ee: f64, eo: f64) -> Grandeurs {
    let (ve, vo) = (C0 / ee.sqrt(), C0 / eo.sqrt());
    let (le, lo) = (ze / ve, zo / vo);
    let (ce, co) = (1.0 / (ze * ve), 1.0 / (zo * vo));
    let l_mat = vec![vec![(le + lo) / 2.0, (le - lo) / 2.0],
                     vec![(le - lo) / 2.0, (le + lo) / 2.0]];
    // Maxwell : diagonale = (Ce+Co)/2, hors diagonale = -(Co-Ce)/2.
    let c_mat = vec![vec![(ce + co) / 2.0, -(co - ce) / 2.0],
                     vec![-(co - ce) / 2.0, (ce + co) / 2.0]];
    let (kb, kf) = ct::coefficients_couple(&c_mat, &l_mat, 0, 1);
    Grandeurs { ze, zo, ee, eo, kb, kf }
}

/// NEXT et FEXT (fraction de l'amplitude) sur LONGUEUR, front T_MONTEE :
/// NEXT = min(Kb, Kb.2Td/tr), FEXT = |Kf|.Td/tr -- les formules de l'outil.
fn bruit(gr: &Grandeurs) -> (f64, f64) {
    let td = LONGUEUR * 1e-3 * ((gr.ee + gr.eo) / 2.0).sqrt() / C0;
    (minf(&[gr.kb, gr.kb * 2.0 * td / T_MONTEE]),
     gr.kf.abs() * td / T_MONTEE)
}

// ==========================================================================
// Les releves de uSimmics
// ==========================================================================

fn lire_releves() -> HashMap<(String, i64), [f64; 4]> {
    let mut rel = HashMap::new();
    let Ok(texte) = std::fs::read_to_string(RELEVES) else { return rel };
    let mut lignes = texte.lines().filter(|l| !l.trim_start().starts_with('#'));
    let Some(entete) = lignes.next() else { return rel };
    let cles: Vec<&str> = entete.split(';').collect();
    let colonne = |nom: &str| cles.iter().position(|k| *k == nom);
    for ligne in lignes {
        let champs: Vec<&str> = ligne.split(';').collect();
        let lu = |nom: &str| -> Option<f64> { py::float(&champs.get(colonne(nom)?)?.replace(',', ".")) };
        let (Some(ze), Some(zo), Some(ee), Some(eo)) = (lu("Z_even"), lu("Z_odd"), lu("eps_even"), lu("eps_odd")) else {
            continue; // ligne pas encore remplie
        };
        let (Some(nom), Some(s)) = (colonne("cas").and_then(|k| champs.get(k)), lu("S_mm")) else { continue };
        rel.insert((nom.trim().to_string(), (round(s, 3) * 1000.0).round() as i64), [ze, zo, ee, eo]);
    }
    rel
}

// Tolerances : la precision annoncee des formules fermees de uSimmics
// (Kirschning-Jansen pour le microruban couple, transformation conforme pour
// la coplanaire), pas celle de l'outil.
const TOL_Z: f64 = 0.03; // Ze, Zo
const TOL_EPS: f64 = 0.03; // eps_eff
const TOL_KB: f64 = 0.06; // Kb, relatif
const TOL_KF: f64 = 0.005; // Kf, ABSOLU : c'est une difference de deux nombres voisins

fn ecart(cle: &str, reference: f64, out: f64) -> (String, bool) {
    if cle == "kf" {
        let d = out - reference;
        return (format!("{:+.4}", d), d.abs() <= TOL_KF);
    }
    let d = out / reference - 1.0;
    let tol = match cle {
        "ze" | "zo" => TOL_Z,
        "ee" | "eo" => TOL_EPS,
        _ => TOL_KB,
    };
    (format!("{:+.2} %", 100.0 * d), d.abs() <= tol)
}

// ==========================================================================

pub fn banc() {
    println!("\n{}", "=".repeat(72));
    println!("  BANC DE RECOUPEMENT  --  moteur crosstalk  /  uSimmics");
    println!("{}", "=".repeat(72));
    println!("
CARTE COMMUNE (FR-4, 4 couches, 1,6 mm)
  piste Top, largeur W = {:.2} mm, cuivre T = {:.0} um
  prepreg Top -> GND : H = {:.2} mm, er = {:.1}, tan d = {:.2}
  pas de vernis (uSimmics ne le modelise pas)
  ecarts S testes : {} mm",
             W, T_CU * 1000.0, H, ER, TAN_D, ECARTS.iter().map(|s| format!("{:.2}", s)).collect::<Vec<_>>().join(", "));

    println!("
REGLAGES COMMUNS DANS uSimmics (Transmission Line Calculator)
  Frequency  : 10 MHz   (l'outil est quasi statique : pas de dispersion)
  er = {:.1}   tan d = {:.2}   Resistivity = 1.72e-8   mu_r = 1
  Roughness = 0 um   T = {:.0} um
  H = {:.2} mm (cas 1 : {:.2} mm, toute la carte 2 couches)
  W = {:.2} mm   L = {:.0} mm (sans effet sur Z et eps_eff)",
             ER, TAN_D, T_CU * 1000.0, H, H_SANS_PLAN, W, LONGUEUR);

    let releves = lire_releves();
    let (mut ok, mut ko, mut manquants) = (0usize, 0usize, 0usize);

    // -- GARDE-FOU : ni plan, ni masse ----------------------------------------
    println!("\n{}", "-".repeat(72));
    println!("GARDE-FOU -- ni plan, ni masse sur les cotes : rien ne porte le retour");
    println!("{}", "-".repeat(72));
    match section_paire(&empilage_sans_plan(), ECARTS[0], 0.0, false) {
        Err(raison) if !raison.is_empty() => {
            ok += 1;
            println!("  ok  l'outil REFUSE de calculer, et dit pourquoi :");
            println!("      « {} »", raison);
        }
        _ => {
            ko += 1;
            println!("  KO  l'outil a rendu une section sans aucune reference");
        }
    }
    println!("  uSimmics : pas de structure a saisir (pas de retour = pas de\
              \x20couplage defini).");

    // -- LES TROIS CAS ---------------------------------------------------------
    for cas in cas() {
        println!("\n{}", "-".repeat(72));
        println!("{} -- {}", cas.nom.to_uppercase().replace("CAS", "CAS "), cas.titre);
        println!("  uSimmics : « {} »", cas.usimmics);
        println!("             H = {:.2} mm{}", cas.h,
                 if cas.g != 0.0 { format!("   G = {:.2} mm (piste -> masse laterale, des deux cotes)", cas.g) } else { String::new() });
        println!("{}", "-".repeat(72));
        for s in ECARTS {
            let mats = match section_paire(&cas.empilage, s, cas.g, false) {
                Ok(m) => m,
                Err(raison) => {
                    ko += 1;
                    println!("  KO  S = {:.2} mm : section non calculable ({})", s, raison);
                    continue;
                }
            };
            let out = grandeurs_outil(&mats);
            let (n_out, f_out) = bruit(&out);
            println!("\n  S = {:.2} mm", s);
            println!("    outil    : Ze {:7.3}  Zo {:7.3}  eps_e {:6.4}  eps_o {:6.4}\
                      \x20 Kb {:6.3} %  Kf {:+.4}",
                     out.ze, out.zo, out.ee, out.eo,
                     100.0 * out.kb, out.kf);
            println!("               -> sur {:.0} mm, front {:.1} ns : NEXT {:.2} %,\
                      \x20FEXT {:.2} %", LONGUEUR, T_MONTEE * 1e9, 100.0 * n_out,
                     100.0 * f_out);
            // Sans plan, le vernis n'est pas modelise : rien a montrer.
            if cas.nom != "cas1" {
                if let Ok(mv) = section_paire(&cas.empilage, s, cas.g, true) {
                    let v = grandeurs_outil(&mv);
                    println!("               (avec vernis 25 um : Kb {:.3} %, Kf {:+.4}\
                              \x20-- pour info)", 100.0 * v.kb, v.kf);
                }
            }
            let Some(rel) = releves.get(&(cas.nom.to_string(), (round(s, 3) * 1000.0).round() as i64)) else {
                manquants += 1;
                println!("    uSimmics : -- a relever (usimmics-releves.csv) --");
                continue;
            };
            let reference = grandeurs_usimmics(rel[0], rel[1], rel[2], rel[3]);
            let (n_ref, f_ref) = bruit(&reference);
            println!("    uSimmics : Ze {:7.3}  Zo {:7.3}  eps_e {:6.4}  eps_o {:6.4}\
                      \x20 Kb {:6.3} %  Kf {:+.4}",
                     reference.ze, reference.zo, reference.ee, reference.eo,
                     100.0 * reference.kb, reference.kf);
            println!("               -> NEXT {:.2} %, FEXT {:.2} %",
                     100.0 * n_ref, 100.0 * f_ref);
            let (mut morceaux, mut bon) = (Vec::new(), true);
            for (cle, r, o) in [("ze", reference.ze, out.ze), ("zo", reference.zo, out.zo), ("ee", reference.ee, out.ee),
                                ("eo", reference.eo, out.eo), ("kb", reference.kb, out.kb), ("kf", reference.kf, out.kf)] {
                let (txt, b) = ecart(cle, r, o);
                morceaux.push(format!("{} {}{}", cle, txt, if b { "" } else { " (!)" }));
                bon = bon && b;
            }
            println!("    ecarts   : {}", morceaux.join("  "));
            if bon {
                ok += 1;
                println!("    ok");
            } else {
                ko += 1;
                println!("    KO  hors tolerance");
            }
        }
    }

    println!("\n{}", "=".repeat(72));
    println!("  {} ok, {} KO, {} releve(s) uSimmics manquant(s)", ok, ko, manquants);
    println!("  tolerances : Z {:.0} %, eps_eff {:.0} %, Kb {:.0} %, Kf +-{:.3}",
             100.0 * TOL_Z, 100.0 * TOL_EPS, 100.0 * TOL_KB, TOL_KF);
    println!("{}", "=".repeat(72));
    compter(ok, ko);
}
