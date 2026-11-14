//! python/test/banc-rf.py, cas pour cas et dans le meme ordre.

use crate::*;
use std::sync::atomic::{AtomicBool, Ordering};

// LE BANC PYTHON ECRIT DANS SES PROPRES EMPILAGES : « le couplage ne cree pas de puissance »
// met tan delta a zero dans les dictionnaires de QUATRE, et tous les cas suivants tournent
// sans pertes dielectriques (le dernier le dit, et remet 0,02). Meme etat ici.
static SANS_PERTES: AtomicBool = AtomicBool::new(false);

fn _cu(nom: &str, role: &str) -> Json {
    obj! {"name" => nom, "type" => "copper", "thickness" => 0.035, "role" => role}
}

fn _di(nom: &str, ep: f64, er: f64) -> Json {
    obj! {"name" => nom, "type" => "dielectric", "thickness" => ep,
          "epsilon_r" => er, "tan_delta" => if SANS_PERTES.load(Ordering::Relaxed) { 0.0 } else { 0.02 }}
}

fn QUATRE() -> Vec<Json> {
    vec![_cu("TOP", "signal"), _di("PP", 0.200, 4.20), _cu("GND", "plane"),
         _di("CORE", 0.800, 4.50), _cu("PWR", "plane"),
         _di("PP2", 0.200, 4.20), _cu("BOT", "signal")]
}

const F0: f64 = 2.44e9;

fn _piste(x1: f64, y1: f64, x2: f64, y2: f64, largeur: f64) -> Json {
    obj! {"type" => "track", "start" => vec![x1, y1], "end" => vec![x2, y2],
          "width" => largeur, "layer" => 0i64, "net" => "RF",
          "copper_thickness" => 0.035}
}

/// Un port : (noeud, z, noeud_n).
type Port<'a> = (&'a str, Complex64, Option<&'a str>);

fn p(noeud: &str, re: f64, im: f64) -> Port<'_> {
    (noeud, cx(re, im), None)
}

fn pd<'a>(noeud: &'a str, re: f64, moins: &'a str) -> Port<'a> {
    (noeud, cx(re, 0.0), Some(moins))
}

fn _doc_f(ports: &[Port], composants: Vec<Json>, branches: Vec<Json>, masses: Vec<Json>, f1: f64, f2: f64, points: usize) -> Json {
    obj! {"format" => FORMAT, "stackup" => obj! {"layers" => QUATRE()},
          "reference_nets" => vec!["GND"],
          "ports" => ports.iter().map(|p| {
              let mut d = obj! {"noeud" => p.0, "z" => vec![p.1.re, p.1.im]};
              if let Some(moins) = p.2 {
                  poser(&mut d, "noeud_n", moins);
              }
              d
          }).collect::<Vec<Json>>(),
          "branches" => branches, "composants" => composants,
          "masses" => masses,
          "analyse" => obj! {"f_debut" => f1, "f_fin" => f2, "points" => points,
                             "f_centre" => F0}}
}

fn _doc(ports: &[Port], composants: Vec<Json>, branches: Vec<Json>, masses: Vec<Json>) -> Json {
    _doc_f(ports, composants, branches, masses, 2.0e9, 3.0e9, 11)
}

fn _ideal(ref_: &str, genre: &str, valeur: f64, a: &str, b: &str) -> Json {
    obj! {"ref" => ref_, "noeuds" => vec![a, b],
          "modele" => obj! {"type" => "ideal", "genre" => genre, "valeur" => valeur}}
}

fn _s(r: &Json, k: usize, i: usize, j: usize) -> Complex64 {
    let v = &r["s"][k][2 * i + j];
    cx(n(&v[0]), n(&v[1]))
}

fn freqs_de(r: &Json) -> Vec<f64> {
    els(&r["freqs"]).iter().map(n).collect()
}

fn _k0(r: &Json) -> usize {
    let f = freqs_de(r);
    (0..f.len()).fold(0, |m, k| if (f[k] - F0).abs() < (f[m] - F0).abs() { k } else { m })
}

/// `rf.analyser(doc)` : le resultat (panique sur un refus, comme l'exception du Python).
fn an(doc: &Json) -> Json {
    analyser(doc, None).unwrap_or_else(|e| panic!("ErreurRF : {}", e.message))
}

fn branche(a: &str, b: &str, net: Option<&str>, objets: Vec<Json>) -> Json {
    let mut br = obj! {"a" => a, "b" => b};
    if let Some(net) = net {
        poser(&mut br, "net", net);
    }
    poser(&mut br, "objets", objets);
    br
}

/// np.allclose(a, b, rtol, atol) sur deux complexes
fn voisin(a: Complex64, b: Complex64, rtol: f64, atol: f64) -> bool {
    (a - b).norm() <= atol + rtol * b.norm()
}

// ==========================================================================
// Touchstone
// ==========================================================================

fn touchstone_relu_redonne_ce_qui_a_ete_ecrit() {
    let freqs = [1e9, 2e9, 3e9];
    let base = [[cx(0.1, 0.2), cx(0.9, -0.1)], [cx(0.8, 0.3), cx(0.0, -0.2)]];
    let mats: Vec<tl::Abcd> = (0..3).map(|k| base.map(|l| l.map(|v| v * (k as f64 + 1.0) / 3.0))).collect();
    let (f, s, z0) = lire_touchstone(&se::touchstone(&freqs, &mats, 50.0, &[]), "a.s2p", None).unwrap();
    assert!(f.len() == 3 && z0[0] == 50.0);
    for k in 0..3 {
        // S21 et S12 doivent revenir A LEUR PLACE : l'ordre S11 S21 S12 S22
        // d'un 2 ports est le piege classique.
        for i in 0..2 {
            for q in 0..2 {
                assert!(voisin(s[k][i][q], mats[k][i][q], 1e-5, 1e-4), "{:?} {:?}", s[k], mats[k]);
            }
        }
    }
}

fn touchstone_formats_db_ri_mhz_et_bruit() {
    let txt = "! commentaire\n# MHz S DB R 75\n\
               100 -20 0  -1 90  -1 90  -20 180\n\
               200 -10 0  -2 45  -2 45  -10 180\n\
               ! bruit\n100 1.5 0.3 20 0.4\n";
    let (f, s, z0) = lire_touchstone(txt, "b.s2p", None).unwrap();
    assert!(f == [100e6, 200e6], "les donnees de bruit ont ete lues : {f:?}");
    assert!(z0[0] == 75.0);
    proche(s[0][0][0].norm(), 0.1, 1e-9, "|S11| depuis -20 dB");
    proche(s[1][1][0].arg(), PI / 4.0, 1e-9, "phase de S21");
    let (_f, s, _) = lire_touchstone("# GHZ S RI R 50\n1 0.5 0.5\n2 0.1 -0.1\n", "c.s1p", None).unwrap();
    assert!(s.len() == 2 && s[0].len() == 1 && s[0][0].len() == 1 && s[1][0][0] == cx(0.1, -0.1));
}

fn touchstone_trois_ports_en_rangees_et_version_2() {
    // A partir de trois ports, la matrice s'ecrit rangee par rangee.
    let valeurs = (0..3).flat_map(|i| (0..3).map(move |q| format!("{} 0", 10 * (i + 1) + q + 1))).collect::<Vec<_>>().join(" ");
    let (_, s, _) = lire_touchstone(&format!("# HZ S MA R 50\n1e9 {valeurs}"), "d.s3p", None).unwrap();
    assert!(s[0][0][1] == cx(12.0, 0.0) && s[0][2][0] == cx(31.0, 0.0), "{:?}", s[0]);
    let v2 = "[Version] 2.0\n# GHz S RI R 50\n[Number of Ports] 2\n\
              [Two-Port Data Order] 12_21\n[Number of Frequencies] 1\n\
              [Network Data]\n1 0 0 0.5 0 0.9 0 0 0\n[End]\n";
    let (_, s, _) = lire_touchstone(v2, "sans_extension", None).unwrap();
    assert!(s[0][0][1] == cx(0.5, 0.0) && s[0][1][0] == cx(0.9, 0.0), "{:?}", s[0]);
}

fn touchstone_en_y_revient_en_s() {
    // Une admittance serie de 0,02 S (50 ohms) en Y normalise a 50 ohms.
    let y = 0.02 * 50.0;
    let txt = format!("# GHZ Y RI R 50\n1 {} 0 {} 0 {} 0 {} 0\n", fmt_g(y, 6), fmt_g(-y, 6), fmt_g(-y, 6), fmt_g(y, 6));
    let (_, s, _) = lire_touchstone(&txt, "e.s2p", None).unwrap();
    // 50 ohms en serie entre deux ports de 50 : S21 = 2/3, S11 = 1/3.
    let attendu = [[1.0 / 3.0, 2.0 / 3.0], [2.0 / 3.0, 1.0 / 3.0]];
    for i in 0..2 {
        for q in 0..2 {
            assert!(voisin(s[0][i][q], cx(attendu[i][q], 0.0), 1e-5, 1e-9), "{:?}", s[0]);
        }
    }
}

// ==========================================================================
// Les parametres S generalises
// ==========================================================================

fn deux_ports_relies_donnent_le_gain_de_desadaptation() {
    let (z1, z2) = (cx(14.0, 8.0), cx(50.0, 0.0));
    let r = an(&_doc(&[("a", z1, None), ("b", z2, None)], vec![_ideal("R0", "R", 0.0, "a", "b")], vec![], vec![]));
    let attendu = 4.0 * z1.re * z2.re / (z1 + z2).norm().powi(2);
    proche(_s(&r, 0, 1, 0).norm().powi(2), attendu, 1e-6, "|S21|^2 d'un fil");
    proche(_s(&r, 0, 0, 0).norm().powi(2), 1.0 - attendu, 1e-6, "|S11|^2 d'un fil sans pertes");
}

/// rf_reseau 1.9.0 : un port entre deux noeuds (RFI_P / RFI_N), sans masse.
/// 50 ohms dans chaque fil d'une paire, deux ports differentiels de 100 :
/// 100 ohms en serie entre deux 100, S21 = 2/3 et S11 = 1/3. Le mode commun
/// n'est tenu que par deux fuites de 1 Mohm, qui ne doivent rien changer.
fn les_ports_differentiels() {
    let comp = || vec![_ideal("R1", "R", 50.0, "p", "q"), _ideal("R2", "R", 50.0, "n", "m"),
                       _ideal("RF1", "R", 1e6, "n", "0"), _ideal("RF2", "R", 1e6, "m", "0")];
    let r = an(&_doc(&[pd("p", 100.0, "n"), pd("q", 100.0, "m")], comp(), vec![], vec![]));
    proche_c(_s(&r, 0, 1, 0), cx(2.0 / 3.0, 0.0), 1e-4, "S21 differentiel");
    proche_c(_s(&r, 0, 0, 0), cx(1.0 / 3.0, 0.0), 1e-4, "S11 differentiel");
    assert!(r["ports"][0]["noeud_n"].as_str() == Some("n"), "{}", dumps(&r["ports"]));
    // La borne - reliee a la masse par un 0 ohm : c'est le port asymetrique.
    let a = an(&_doc(&[("a", cx(14.0, 8.0), Some("g")), p("b", 50.0, 0.0)],
                     vec![_ideal("R0", "R", 0.0, "a", "b"), _ideal("RG", "R", 0.0, "g", "0")], vec![], vec![]));
    let s = an(&_doc(&[p("a", 14.0, 8.0), p("b", 50.0, 0.0)], vec![_ideal("R0", "R", 0.0, "a", "b")], vec![], vec![]));
    proche_c(_s(&a, 0, 1, 0), _s(&s, 0, 1, 0), 1e-9, "borne - a la masse");
    assert!(a["ports"][0].get("noeud_n").is_none(), "{}", dumps(&a["ports"]));
    // Une paire croisee (+ d'un cote, - de l'autre) inverse S21.
    let x = an(&_doc(&[pd("p", 100.0, "n"), pd("m", 100.0, "q")], comp(), vec![], vec![]));
    proche_c(_s(&x, 0, 1, 0), cx(-2.0 / 3.0, 0.0), 1e-4, "S21 d'une paire croisee");
    for (ports, quoi) in [([pd("a", 50.0, "a"), p("b", 50.0, 0.0)], "bornes egales"),
                          ([pd("a", 50.0, "b"), pd("b", 50.0, "a")], "meme paire"),
                          ([pd("a", 50.0, "g"), p("b", 50.0, 0.0)], "0 ohm entre bornes")] {
        match analyser(&_doc(&ports, vec![_ideal("R", "R", 1.0, "a", "b"), _ideal("RG", "R", 0.0, "g", "a")], vec![], vec![]), None) {
            Err(e) if !e.interne => {}
            _ => panic!("port refuse attendu : {quoi}"),
        }
    }
}

/// Calcule a la main : self serie cote puce, capacite a la masse cote 50.
fn un_reseau_en_l_adapte_14_8j_sur_50() {
    let w = 2.0 * PI * F0;
    let g = 1.0f64 / 50.0;
    let b = (g / 14.0 - g * g).sqrt(); // Re(1/(g+jb)) = 14
    let x_serie = -8.0 + 14.0 * b / g; // Im total = -8 : le conjugue de +8
    let (l_, c_) = (x_serie / w, b / w);
    let r = an(&_doc(&[p("p1", 14.0, 8.0), p("p2", 50.0, 0.0)],
                     vec![_ideal("L1", "L", l_, "p1", "n"),
                          _ideal("C1", "C", c_, "n", "0"),
                          _ideal("R0", "R", 0.0, "n", "p2")], vec![], vec![]));
    let k = _k0(&r);
    assert!(_s(&r, k, 0, 0).norm() < 1e-6, "S11 = {} a f0", _s(&r, k, 0, 0));
    proche(_s(&r, k, 1, 0).norm(), 1.0, 1e-6, "|S21| a f0");
    let zin = cx(n(&r["zin"][k][0]), n(&r["zin"][k][1]));
    assert!((zin - cx(14.0, -8.0)).norm() < 1e-4, "Zin = {zin} au lieu de 14-8j");
    assert!(n(&r["bilan"]["s21_db"]) > -1e-4, "{}", dumps(&r["bilan"]));
    // Sans pertes, la puissance se conserve a TOUTES les frequences.
    let f = freqs_de(&r);
    for k in 0..f.len() {
        let t = _s(&r, k, 0, 0).norm().powi(2) + _s(&r, k, 1, 0).norm().powi(2);
        proche(t, 1.0, 1e-9, &format!("conservation a {} GHz", fmt_g(f[k] / 1e9, 3)));
    }
    // Et hors de f0, l'adaptation se degrade : le reseau est bien selectif.
    assert!(_s(&r, 0, 0, 0).norm() > 0.05);
}

/// MEME PISTE, MEME MOTEUR : a 50/50 ohms, S generalises = cascade.
fn la_piste_est_celle_de_simulation_em() {
    let objets = vec![_piste(0.0, 0.0, 10.0, 0.0, 0.35), _piste(10.0, 0.0, 10.0, 8.0, 0.35), _piste(10.0, 8.0, 25.0, 8.0, 0.35)];
    let doc = _doc(&[p("a", 50.0, 0.0), p("b", 50.0, 0.0)], vec![], vec![branche("a", "b", Some("RF"), objets)], vec![]);
    let r = an(&doc);
    let ref_ = se::simuler(&mut _doc_branche(&doc, &doc["branches"][0]), None, false, None).unwrap().json;
    assert!(els(&ref_["s"]).len() == els(&r["s"]).len());
    let f = freqs_de(&r);
    for k in 0..els(&r["s"]).len() {
        for i in 0..4 {
            let vu = cx(n(&r["s"][k][i][0]), n(&r["s"][k][i][1]));
            let att = cx(n(&ref_["s"][k][i][0]), n(&ref_["s"][k][i][1]));
            assert!((vu - att).norm() < 1e-9, "S[{i}] a {} GHz : {vu} contre {att}", fmt_g(f[k] / 1e9, 3));
        }
    }
    let fiche = &r["branches"][0];
    assert!(n(&fiche["z0_min"]) == n(&ref_["ligne"]["z0_min"]));
    assert!(fiche["sections"].vrai() && fiche["sections"][0]["couche"].as_str() == Some("TOP"));
}

fn une_piste_retournee_donne_le_meme_s21() {
    let objets = vec![_piste(0.0, 0.0, 12.0, 0.0, 0.35), _piste(12.0, 0.0, 20.0, 0.0, 1.0)];
    let envers: Vec<Json> = objets.iter().rev().map(|o| avec(o, &[("start", o["end"].clone()), ("end", o["start"].clone())])).collect();
    let d1 = _doc(&[p("a", 14.0, 8.0), p("b", 50.0, 0.0)], vec![], vec![branche("a", "b", None, objets)], vec![]);
    let d2 = _doc(&[p("a", 14.0, 8.0), p("b", 50.0, 0.0)], vec![], vec![branche("b", "a", None, envers)], vec![]);
    let (r1, r2) = (an(&d1), an(&d2));
    let k = _k0(&r1);
    assert!((_s(&r1, k, 1, 0) - _s(&r2, k, 1, 0)).norm() < 1e-9);
    assert!((_s(&r1, k, 0, 0) - _s(&r2, k, 0, 0)).norm() < 1e-9);
}

/// Le cas que la cascade refuse : une capacite a la masse au bout d'un T.
fn une_derivation_en_t_passe() {
    let br = vec![branche("p1", "t", None, vec![_piste(0.0, 0.0, 10.0, 0.0, 0.35)]),
                  branche("t", "p2", None, vec![_piste(10.0, 0.0, 20.0, 0.0, 0.35)]),
                  branche("t", "c", None, vec![_piste(10.0, 0.0, 10.0, 3.0, 0.35)])];
    let r = an(&_doc(&[p("p1", 50.0, 0.0), p("p2", 50.0, 0.0)],
                     vec![_ideal("C1", "C", 2e-12, "c", "g")],
                     br, vec![j(r#"{"noeud": "g", "couche": 0, "vias": [{"x": 10, "y": 4, "percage": 0.3, "couche_plan": 2}]}"#)]));
    let k = _k0(&r);
    let (s11, s21) = (_s(&r, k, 0, 0), _s(&r, k, 1, 0));
    assert!(s11.norm().powi(2) + s21.norm().powi(2) < 1.0, "reseau a pertes non passif");
    assert!(_s(&r, k, 1, 0) != cx(0.0, 0.0) && s21.norm() < 0.99, "la derivation ne pese pas");
    assert!(n(&r["masses"][0]["l_nH"]) > 0.0);
}

// ==========================================================================
// Les modeles de composants
// ==========================================================================

/// Lecture seule : les modeles Murata de la vraie LIB (voir python/test/lib_essai.py).
fn _murata(nom: &str) -> String {
    let racine = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let lib = match std::env::var("WEB_CAO_LIB") {
        Ok(chemin) if !chemin.is_empty() => std::path::PathBuf::from(chemin),
        _ => {
            let propre = racine.join("LIB");
            if propre.is_dir() { propre } else { racine.join("../PROJETS/LIB_CAO") }
        }
    };
    if !lib.join("LIB_composants.csv").is_file() {
        panic!("{SANS_LIB} ({})", lib.display());
    }
    let octets = std::fs::read(lib.join("lib_simulation").join(nom)).unwrap_or_else(|e| panic!("{nom} : {e}"));
    String::from_utf8_lossy(&octets).into_owned()
}

fn spice(texte: &str, nom: &str) -> ModeleSpice {
    ModeleSpice::new(texte, nom, &Json::Nul, &Json::Nul).unwrap_or_else(|e| panic!("ErreurRF : {}", e.message))
}

fn y00(m: &ModeleSpice, f: f64) -> Complex64 {
    m.y(f).unwrap()[0][0]
}

fn par(zs: &[Complex64]) -> Complex64 {
    1.0 / zs.iter().map(|z| 1.0 / z).sum::<Complex64>()
}

/// Le GCM0335C1E120FA16 est une echelle serie de cellules paralleles :
/// (C01|R01) + L02 + R03 + (L04|R04) + (C05|L05|R05) + (C06|L06|R06).
/// On la somme a la main, valeurs recopiees du fichier.
fn un_condensateur_murata_vaut_son_reseau_calcule_a_la_main() {
    let m = spice(&_murata("GCM0335C1E120FA16.sub"), "GCM");
    for f in [100e6, 1e9, 2.84e9, 6e9] {
        let jw = cx(0.0, 2.0 * PI * f);
        let z = par(&[1.0 / (jw * 1.20e-11), cx(1.00e+11, 0.0)]) + jw * 1.97e-10 + 1.88e-01
            + par(&[jw * 2.04e-11, cx(5.14e-01, 0.0)])
            + par(&[1.0 / (jw * 3.25e-11), jw * 9.75e-12, cx(1.15, 0.0)])
            + par(&[1.0 / (jw * 5.48e-12), jw * 3.75e-11, cx(1.00e+05, 0.0)]);
        let zm = 1.0 / y00(&m, f);
        assert!((zm - z).norm() < 1e-9 * z.norm(), "{} GHz : {zm} contre {z}", fmt_g(f / 1e9, 3));
    }
    // Et il se comporte en condensateur de 12 pF loin sous sa resonance.
    let zb = 1.0 / y00(&m, 100e6);
    proche(zb.norm(), 1.0 / (2.0 * PI * 100e6 * 1.2e-11), 0.05, "|Z| a 100 MHz");
}

fn une_self_murata_se_charge() {
    let m = spice(&_murata("LQW15AN10NG00.sub"), "LQW");
    let z = 1.0 / y00(&m, 100e6);
    proche(z.im / (2.0 * PI * 100e6), 10e-9, 0.05, "L a 100 MHz");
}

fn le_modele_generique_prend_ses_parametres() {
    let m = ModeleSpice::new(&_murata("capacitor.sub"), "cap", &Json::Nul, &j(r#"{"C": 1e-9, "ESR": 0.1, "ESL": 0.5e-9}"#)).unwrap();
    let f = 1e8;
    let w = 2.0 * PI * f;
    let attendu = cx(0.1, 0.0) + cx(0.0, w * 0.5e-9) + 1.0 / cx(0.0, w * 1e-9);
    assert!((1.0 / y00(&m, f) - attendu).norm() < 1e-9 * attendu.norm());
}

/// Un circuit bouchon L // C en serie entre les ports : a sa resonance il
/// coupe, S21 = 2 Z0 / (2 Z0 + Z) avec Z = 1 / (Y_L + Y_C). En ideal, puis
/// avec les deux modeles SPICE Murata poses sur les memes noeuds.
fn une_self_et_une_capa_en_parallele_comptent_toutes_les_deux() {
    let s21_attendu = |y: Complex64| 100.0 / (100.0 + 1.0 / y);
    let r = an(&_doc_f(&[p("a", 50.0, 0.0), p("b", 50.0, 0.0)],
                       vec![_ideal("L1", "L", 10e-9, "a", "b"),
                            _ideal("C1", "C", 1e-12, "a", "b")], vec![], vec![],
                       1.0e9, 2.2e9, 13));
    let fr = freqs_de(&r);
    for (k, f) in fr.iter().enumerate() {
        let w = 2.0 * PI * f;
        let y = 1.0 / cx(0.0, w * 10e-9) + cx(0.0, w * 1e-12);
        assert!((_s(&r, k, 1, 0) - s21_attendu(y)).norm() < 1e-6, "{f}");
    }
    // A 1,59 GHz, le bouchon coupe : seule la self, ou seule la capa, passent.
    let k = (0..13).fold(0, |m, k| if _s(&r, k, 1, 0).norm() < _s(&r, m, 1, 0).norm() { k } else { m });
    assert!(_s(&r, k, 1, 0).norm() < 0.1 && 1.4e9 < fr[k] && fr[k] < 1.8e9, "{} {}", fr[k], _s(&r, k, 1, 0).norm());
    let ml = spice(&_murata("LQW15AN10NG00.sub"), "LQW");
    let mc = spice(&_murata("GCM0335C1E120FA16.sub"), "GCM");
    let mut doc = _doc_f(&[p("a", 50.0, 0.0), p("b", 50.0, 0.0)], vec![], vec![], vec![], 0.3e9, 1.0e9, 8);
    poser(&mut doc, "composants", vec![
        obj! {"ref" => "L1", "noeuds" => vec!["a", "b"], "modele" => obj! {
            "type" => "spice", "texte" => _murata("LQW15AN10NG00.sub")}},
        obj! {"ref" => "C1", "noeuds" => vec!["a", "b"], "modele" => obj! {
            "type" => "spice", "texte" => _murata("GCM0335C1E120FA16.sub")}}]);
    let r = an(&doc);
    for (k, f) in freqs_de(&r).iter().enumerate() {
        let y = y00(&ml, *f) + y00(&mc, *f);
        assert!((_s(&r, k, 1, 0) - s21_attendu(y)).norm() < 1e-6, "{f}");
    }
}

fn un_actif_spice_est_refuse_avec_la_consigne() {
    match ModeleSpice::new(&_murata("bjt_npn.sub"), "bjt_npn.sub", &Json::Nul, &Json::Nul) {
        Err(exc) if !exc.interne => assert!(exc.conseil.contains(".sNp"), "{}", exc.conseil),
        _ => panic!("un transistor SPICE a ete accepte"),
    }
}

fn snp(ref_: &str, noeuds: &[&str], texte: &str, nom: &str) -> Json {
    obj! {"ref" => ref_, "noeuds" => noeuds.to_vec(),
          "modele" => obj! {"type" => "snp", "texte" => texte, "nom" => nom}}
}

fn un_snp_vaut_le_modele_qu_il_decrit() {
    // np.linspace(1e9, 4e9, 31)
    let freqs: Vec<f64> = (0..31).map(|k| if k == 30 { 4e9 } else { 1e9 + k as f64 * (3e9 / 30.0) }).collect();
    let l_ = 3.3e-9;
    let mut mats: Vec<tl::Abcd> = Vec::new();
    for f in &freqs {
        let z = cx(0.0, 2.0 * PI * f * l_ / 50.0);
        mats.push([[z / (z + 2.0), 2.0 / (z + 2.0)],
                   [2.0 / (z + 2.0), z / (z + 2.0)]]);
    }
    let txt = se::touchstone(&freqs, &mats, 50.0, &[]);
    let ports = [p("a", 14.0, 8.0), p("b", 50.0, 0.0)];
    let r1 = an(&_doc(&ports, vec![_ideal("L1", "L", l_, "a", "b")], vec![], vec![]));
    let r2 = an(&_doc(&ports, vec![snp("L1", &["a", "b"], &txt, "l.s2p")], vec![], vec![]));
    for k in 0..els(&r1["s"]).len() {
        assert!((_s(&r1, k, 1, 0) - _s(&r2, k, 1, 0)).norm() < 1e-3);
    }
}

fn un_snp_actif_garde_sa_non_reciprocite() {
    let txt = "# GHZ S RI R 50\n1 0 0 10 0 0.01 0 0 0\n4 0 0 10 0 0.01 0 0 0\n";
    let r = an(&_doc(&[p("a", 50.0, 0.0), p("b", 50.0, 0.0)], vec![snp("U2", &["a", "b"], txt, "lna.s2p")], vec![], vec![]));
    let k = _k0(&r);
    proche(_s(&r, k, 1, 0).norm(), 10.0, 1e-9, "gain de l'amplificateur");
    proche(_s(&r, k, 0, 1).norm(), 0.01, 1e-9, "isolation inverse");
    proche(n(&r["bilan"]["s21_db"]), 20.0, 1e-9, "S21 en dB");
}

/// Un fil mesure n'a pas de matrice Y : le bloc se pose en S.
fn un_snp_thru_parfait_passe() {
    let txt = "# GHZ S RI R 50\n1 0 0 1 0 1 0 0 0\n4 0 0 1 0 1 0 0 0\n";
    let r = an(&_doc(&[p("a", 14.0, 8.0), p("b", 50.0, 0.0)], vec![snp("R1", &["a", "b"], txt, "thru.s2p")], vec![], vec![]));
    let attendu = 4.0 * 14.0 * 50.0 / cx(64.0, 8.0).norm().powi(2);
    proche(_s(&r, _k0(&r), 1, 0).norm().powi(2), attendu, 1e-9, "|S21|^2 d'un thru");
}

fn un_snp_hors_de_sa_bande_est_refuse() {
    let txt = "# GHZ S RI R 50\n1 0 0 1 0 1 0 0 0\n2 0 0 1 0 1 0 0 0\n";
    match analyser(&_doc(&[p("a", 50.0, 0.0), p("b", 50.0, 0.0)], vec![snp("X", &["a", "b"], txt, "x.s2p")], vec![], vec![]), None) {
        Err(exc) if !exc.interne => assert!(exc.message.contains("x.s2p")),
        _ => panic!("extrapolation silencieuse au-dela de 2 GHz"),
    }
}

/// Le commutateur AS179 de la LIB, etat J1-J2 : J1 et J2 aux ports, J3
/// chargee par 50 ohms. Rapporte a la masse, S21 est celui du fichier ;
/// rapporte a une broche tenue a la masse par 1 milliohm, aussi ; par
/// 1 nH (des vias trop longs), il perd.
fn un_s3p_se_rapporte_a_la_broche_de_masse() {
    let nom = "AS179-92LF_Vdd_0mV_Vctrl_3000mV_J1-J2_25C.s3p";
    let txt = _murata(nom);
    let (freqs, s, _) = lire_touchstone(&txt, nom, None).unwrap();
    let i = (0..freqs.len()).fold(0, |m, k| if (freqs[k] - 868e6).abs() < (freqs[m] - 868e6).abs() { k } else { m });

    let s21 = |reference: &str, vers_masse: Option<(&str, f64)>| -> Complex64 {
        let mut u1 = snp("U1", &["j1", "j2", "j3"], &txt, nom);
        // `reference` se range avant `modele` dans le dict du Python
        let modele = oter(&mut u1, "modele");
        poser(&mut u1, "reference", reference);
        poser(&mut u1, "modele", modele);
        let mut comps = vec![u1, _ideal("R3", "R", 50.0, "j3", "0")];
        if let Some((genre, valeur)) = vers_masse {
            comps.push(_ideal("RG", genre, valeur, "g", "0"));
        }
        let mut d = _doc_f(&[p("j1", 50.0, 0.0), p("j2", 50.0, 0.0)], comps, vec![], vec![], freqs[i], freqs[i + 1], 2);
        poser(dans(&mut d, "analyse"), "f_centre", freqs[i]);
        _s(&an(&d), 0, 1, 0)
    };

    assert!((s21("0", None) - s[i][1][0]).norm() < 1e-9, "S21 rapporte a la masse");
    assert!((s21("g", Some(("R", 1e-3))) - s21("0", None)).norm() < 1e-5, "S21 rapporte a une broche tenue a la masse");
    assert!((s21("g", Some(("L", 5e-9))) - s21("0", None)).norm() > 1e-3, "5 nH sous la broche de masse doivent se voir");
}

/// 20 ohms mesures entre la broche et sa reference, la reference tenue
/// a la masse par 30 ohms : le port voit 50 ohms.
fn un_s1p_rapporte_a_une_broche_s_ajoute_a_ce_qui_la_tient() {
    let g = (20.0 - 50.0) / (20.0 + 50.0);
    let g = py::repr_flottant(g);
    let txt = format!("# GHZ S RI R 50\n1 {g} 0\n4 {g} 0\n");
    let r = an(&_doc(&[p("a", 50.0, 0.0), p("b", 50.0, 0.0)],
                     vec![avec(&obj! {"ref" => "R1", "noeuds" => vec!["a"], "reference" => "g"},
                               &[("modele", obj! {"type" => "snp", "texte" => &txt, "nom" => "r.s1p"})]),
                          _ideal("RG", "R", 30.0, "g", "0"),
                          _ideal("RX", "R", 1e6, "a", "b")], vec![], vec![]));
    assert!(_s(&r, _k0(&r), 0, 0).norm() < 1e-4, "{}", _s(&r, _k0(&r), 0, 0));
}

fn les_vias_de_masse_en_parallele() {
    let via = |x: f64| obj! {"x" => x, "y" => 0i64, "percage" => 0.3, "couche_plan" => 2i64};
    let un = inductance_masse(&QUATRE(), 0, &[via(0.0)]).unwrap();
    let loin = inductance_masse(&QUATRE(), 0, &[via(0.0), via(5.0)]).unwrap();
    let pres = inductance_masse(&QUATRE(), 0, &[via(0.0), via(0.5)]).unwrap();
    assert!(0.02e-9 < un && un < 0.5e-9, "via TOP -> GND : {} nH", fmt_g(un * 1e9, 3));
    assert!(un / 2.0 < loin && loin < pres && pres < un, "{un} {loin} {pres}");
}

// ==========================================================================
// Les surfaces, le couplage, les broches annexes
// ==========================================================================

/// La plaque parallele (sans frange) est une BORNE INFERIEURE, et la
/// frange d'une pastille de 0,5 mm sur 0,2 mm de stratifie ne double pas.
fn une_pastille_vaut_au_moins_sa_plaque() {
    let mut s = j(r#"{"couche": 0, "largeur": 0.5, "longueur": 0.6}"#);
    let mut cache = Cache::default();
    let (c, _) = capacite_surface(&QUATRE(), &s, &mut cache).unwrap();
    let plaque = 8.854e-12 * 4.2 * 0.5e-3 * 0.6e-3 / 0.2e-3;
    assert!(plaque < c && c < 3.0 * plaque, "{c} {plaque}");
    // LA FRANGE DE BOUT EST CALCULEE en 3D : l'allongement equivalent de
    // bout ouvert qu'on en tire tombe entre Hammerstad-Bekkadal et
    // Kirschning-Jansen, formules exterieures qui different deja entre elles.
    let li = _ligne(&QUATRE(), 0, 0.4, 0.035, &mut cache).unwrap();
    let c1 = capacite_pastille(&QUATRE(), 0, 0.4, 2.0, 0.035, &mut cache).unwrap().unwrap().0;
    let c2 = capacite_pastille(&QUATRE(), 0, 0.4, 4.0, 0.035, &mut cache).unwrap().unwrap().0;
    let cp = (c2 - c1) / 2e-3;
    let dl = (c1 - cp * 2e-3) / 2.0 / cp;
    let (h, e, u) = (li.h, li.eps, 0.4e-3 / li.h);
    let dl_h = 0.412 * h * (e + 0.3) * (u + 0.264) / ((e - 0.258) * (u + 0.8));
    assert!(0.85 * dl_h < dl && dl < 1.2 * dl_h, "{dl} {dl_h}");
    // Le recouvrement d'une piste deja comptee par sa branche est ote.
    poser(&mut s, "recouvrements", vec![j(r#"{"largeur": 0.3, "longueur": 0.3}"#)]);
    let (c2, _) = capacite_surface(&QUATRE(), &s, &mut Cache::default()).unwrap();
    assert!(0.0 < c2 && c2 < c);
}

fn une_pastille_charge_le_noeud() {
    let ports = [p("a", 50.0, 0.0), p("b", 50.0, 0.0)];
    let fil = || vec![_ideal("R0", "R", 0.0, "a", "b")];
    let nu = an(&_doc(&ports, fil(), vec![], vec![]));
    let avec_ = an(&avec(&_doc(&ports, fil(), vec![], vec![]), &[("pastilles", j(r#"[{"noeud": "a", "couche": 0, "largeur": 2.0, "longueur": 2.0}]"#))]));
    let k = _k0(&avec_);
    assert!((_s(&nu, k, 1, 0) - 1.0).norm() < 1e-9);
    let c = n(&avec_["surfaces"][0]["c_pF"]) * 1e-12;
    let y = cx(0.0, 2.0 * PI * F0 * c * 50.0);
    // c_pF est arrondi a 1e-4 pF dans la fiche : d'ou la tolerance.
    proche(_s(&avec_, k, 1, 0).norm(), (2.0 / (2.0 + y)).norm(), 1e-4, "S21 d'une capacite en derivation");
}

/// Deux pistes paralleles, chacune entre deux ports ou deux 50 ohms.
fn _paire(ecart: f64) -> Vec<Json> {
    let (w, longueur) = (0.35, 10.0);
    let d = w + ecart;
    vec![branche("p1", "p2", Some("A"), vec![_piste(0.0, 0.0, longueur, 0.0, w)]),
         branche("q1", "q2", Some("B"), vec![_piste(0.0, d, longueur, d, w)])]
}

fn rq() -> Vec<Json> {
    vec![_ideal("RQ1", "R", 50.0, "q1", "0"), _ideal("RQ2", "R", 50.0, "q2", "0")]
}

const P12: [Port<'static>; 2] = [("p1", Complex64::new(50.0, 0.0), None), ("p2", Complex64::new(50.0, 0.0), None)];

fn _doc_paire(ecart: f64, couplage: bool) -> Json {
    let mut d = _doc(&P12, rq(), _paire(ecart), vec![]);
    poser(&mut d, "couplage", couplage);
    d
}

fn deux_pistes_proches_se_couplent() {
    let r = an(&_doc_paire(0.15, true));
    assert!(els(&r["couplages"]).len() == 1, "{}", dumps(&r["couplages"]));
    let c = &r["couplages"][0];
    assert!(n(&c["longueur"]) == 10.0 && 0.5 < n(&c["next_pct"]) && n(&c["next_pct"]) < 30.0, "{}", dumps(c));
    let sans = an(&_doc_paire(0.15, false));
    let k = _k0(&r);
    let perdu = _s(&sans, k, 1, 0).norm() - _s(&r, k, 1, 0).norm();
    assert!(perdu > 1e-4, "le couplage ne prend rien a la ligne : {}", fmt_g(perdu, 6));
}

fn le_couplage_ne_cree_pas_de_puissance() {
    // le Python ecrit tan_delta = 0 dans les dictionnaires de QUATRE : ils le gardent
    SANS_PERTES.store(true, Ordering::Relaxed);
    let doc = _doc_paire(0.15, true);
    let r = an(&doc);
    for k in 0..freqs_de(&r).len() {
        let t = _s(&r, k, 0, 0).norm().powi(2) + _s(&r, k, 1, 0).norm().powi(2);
        assert!(t <= 1.0 + 1e-9, "puissance creee : {}", fmt_g(t, 6));
    }
}

fn au_dela_de_3h_rien_ne_se_couple() {
    let r = an(&_doc_paire(1.0, true)); // h = 0,2 mm : 1 mm > 3 h
    assert!(!r["couplages"].vrai());
    let ref_ = an(&_doc_paire(1.0, false));
    assert!(els(&r["s"]).iter().zip(els(&ref_["s"])).all(|(m1, m2)| {
        els(m1).iter().zip(els(m2)).all(|(a, b)| (cx(n(&a[0]), n(&a[1])) - cx(n(&b[0]), n(&b[1]))).norm() < 1e-12)
    }));
}

/// Une piste plus longue que le longement : decoupee, elle doit garder sa
/// longueur de cuivre entiere dans la fiche.
fn un_couple_decoupe_garde_la_longueur() {
    let mut br = _paire(0.15);
    poser(&mut br[0], "objets", vec![_piste(-5.0, 0.0, 15.0, 0.0, 0.35)]);
    let r = an(&_doc(&P12, rq(), br, vec![]));
    assert!(n(&r["couplages"][0]["longueur"]) == 10.0);
    assert!((n(&r["branches"][0]["longueur"]) - 20.0).abs() < 1e-6, "{}", dumps(&r["branches"][0]));
}

/// La piste d'un autre net, envoyee en « voisine », doit rendre EXACTEMENT
/// ce que rend la meme piste posee en branche et fermee a ses deux bouts sur
/// son impedance caracteristique -- et dire la puissance qu'elle emporte.
fn une_piste_voisine_vaut_une_branche_fermee_sur_son_z0() {
    SANS_PERTES.store(true, Ordering::Relaxed);
    let br = _paire(0.15);
    let mut d0 = _doc(&[p("a", 50.0, 50.0)], vec![], vec![], vec![]);
    poser(&mut d0, "format", "cao-sim-em-3");
    poser(&mut d0, "geometry", j(r#"{"objects": [{"type": "track"}]}"#));
    let z0 = _ligne(&se::doc_valide(&d0).unwrap().0, 0, 0.35, 0.035, &mut Cache::default()).unwrap().z0;
    let ref_ = _doc(&P12, vec![_ideal("RQ1", "R", z0, "q1", "0"), _ideal("RQ2", "R", z0, "q2", "0")], br.clone(), vec![]);
    let mut doc = _doc(&P12, vec![], br[..1].to_vec(), vec![]);
    poser(&mut doc, "voisines", vec![obj! {"net" => "B", "objets" => &br[1]["objets"]}]);
    let (r1, r2) = (an(&ref_), an(&doc));
    for (m1, m2) in els(&r1["s"]).iter().zip(els(&r2["s"])) {
        for (a, b) in els(m1).iter().zip(els(m2)) {
            assert!((cx(n(&a[0]), n(&a[1])) - cx(n(&b[0]), n(&b[1]))).norm() < 1e-9, "{} {}", dumps(a), dumps(b));
        }
    }
    let k = _k0(&r2);
    let manque = 100.0 * (1.0 - _s(&r2, k, 0, 0).norm().powi(2) - _s(&r2, k, 1, 0).norm().powi(2));
    let pct = n(&r2["bilan"]["voisines_pct"]);
    assert!(r2["voisines"][0]["net"].as_str() == Some("B") && pct > 0.1, "{}", dumps(&r2["voisines"]));
    // Ce qui manque au bilan = la voisine + le cuivre (qui ne pese ici que
    // quelques dixiemes de %).
    assert!(pct <= manque + 1e-6 && manque - pct < 1.0, "{pct} {manque}");
    // Une voisine que rien ne couple est laissee : rien ne change.
    let loin = avec(&doc, &[("voisines", vec![obj! {"net" => "C", "objets" => vec![_piste(0.0, 3.0, 10.0, 3.0, 0.35)]}].j())]);
    let r3 = an(&loin);
    assert!(!r3["voisines"].vrai() && n(&r3["bilan"]["s21_db"]) == n(&an(&avec(&doc, &[("voisines", Json::Liste(vec![]))]))["bilan"]["s21_db"]));
}

// ==========================================================================
// Les selfs couplees et les fentes du plan
// ==========================================================================

/// K(m) et E(m), les integrales elliptiques completes de scipy.special, par la moyenne
/// arithmetico-geometrique.
fn ellipke(m: f64) -> (f64, f64) {
    let (mut a, mut b, mut c2, mut somme, mut p2) = (1.0f64, (1.0 - m).sqrt(), m, m / 2.0, 0.5);
    while c2.abs() > 1e-32 {
        let (an_, bn) = ((a + b) / 2.0, (a * b).sqrt());
        c2 = ((a - b) / 2.0).powi(2);
        p2 *= 2.0;
        somme += p2 * c2;
        a = an_;
        b = bn;
    }
    let k = PI / (2.0 * a);
    (k, k * (1.0 - somme))
}

/// Deux spires coaxiales de 1 mm de rayon a 0,5 mm : Maxwell donne
/// M = mu0 rac(ab) [(2/k - k) K - (2/k) E], k^2 = 4ab / ((a+b)^2 + d^2).
fn la_mutuelle_de_neumann_rend_celle_de_maxwell() {
    let (a, d, nb_) = (1e-3, 0.5e-3, 96usize);
    let th: Vec<f64> = (0..=nb_).map(|k| if k == nb_ { 2.0 * PI } else { k as f64 * (2.0 * PI / nb_ as f64) }).collect();

    let spire = |z: f64| -> Segments {
        let pts: Vec<P3> = th.iter().map(|t| [a * t.cos(), a * t.sin(), z]).collect();
        (pts[..nb_].to_vec(), pts[1..].to_vec(), vec![1.0; nb_])
    };
    let m = _neumann(&spire(0.0), &spire(d));
    let k2 = 4.0 * a * a / ((2.0 * a).powi(2) + d * d);
    let k = k2.sqrt();
    let (ellipk, ellipe) = ellipke(k2);
    let attendu = MU_0 * a * ((2.0 / k - k) * ellipk - 2.0 / k * ellipe);
    proche(m, attendu, 2e-3, "mutuelle de deux spires");
}

fn _self(ref_: &str, x0: f64, y0: f64, x1: f64, y1: f64, a: &str, b: &str) -> Json {
    obj! {"ref" => ref_, "noeuds" => vec![a, b], "genre" => "L",
          "geo" => obj! {"x0" => x0, "y0" => y0, "x1" => x1, "y1" => y1, "largeur" => 0.5,
                         "couche" => 0i64},
          "modele" => obj! {"type" => "ideal", "genre" => "L", "valeur" => 10e-9}}
}

const AB: [Port<'static>; 2] = [("a", Complex64::new(50.0, 0.0), None), ("b", Complex64::new(50.0, 0.0), None)];

/// L1 et L2 en serie, sur le meme axe : Z = jw (L1 + L2 + 2M), M > 0 ;
/// cote a cote, axes paralleles, la mutuelle change de signe.
fn deux_selfs_bout_a_bout_s_ajoutent_leur_mutuelle() {
    let doc = _doc_f(&AB, vec![_self("L1", 0.0, 0.0, 1.0, 0.0, "a", "m"),
                               _self("L2", 1.6, 0.0, 2.6, 0.0, "m", "b")], vec![], vec![], 1e8, 1e9, 5);
    let r = an(&doc);
    let m = &r["mutuelles"][0];
    assert!(n(&m["m_nH"]) > 0.0 && 0.001 < n(&m["k"]) && n(&m["k"]) < 0.3, "{}", dumps(m));
    for (k, f) in freqs_de(&r).iter().enumerate() {
        let z = cx(0.0, 2.0 * PI * f * (20e-9 + 2.0 * n(&m["m_nH"]) * 1e-9));
        assert!((_s(&r, k, 1, 0) - 100.0 / (100.0 + z)).norm() < 1e-6, "{f}");
        assert!((_s(&r, k, 1, 0) - _s(&r, k, 0, 1)).norm() < 1e-12, "non reciproque");
    }
    let cote = _doc_f(&AB, vec![_self("L1", 0.0, 0.0, 1.0, 0.0, "a", "m"),
                                _self("L2", 0.0, 1.0, 1.0, 1.0, "m", "b")], vec![], vec![], 1e8, 1e9, 3);
    let mc = an(&cote)["mutuelles"][0].clone();
    assert!(n(&mc["m_nH"]) < 0.0 && n(&mc["k"]).abs() < 0.3, "{}", dumps(&mc));
    let loin = an(&_doc_f(&AB, vec![_self("L1", 0.0, 0.0, 1.0, 0.0, "a", "m"),
                                    _self("L2", 20.0, 0.0, 21.0, 0.0, "m", "b")], vec![], vec![], 1e8, 1e9, 3));
    assert!(!loin["mutuelles"].vrai());
}

fn une_self_induit_dans_la_piste_qui_la_longe() {
    let br = vec![branche("m", "b", Some("RF"), vec![_piste(-3.0, 0.8, 5.0, 0.8, 0.35)])];
    let doc = _doc(&AB, vec![_self("L1", 0.0, 0.0, 1.0, 0.0, "a", "m")], br, vec![]);
    let r = an(&doc);
    let entre = |m: &Json| els(&m["entre"]).iter().map(|e| e.as_str().unwrap_or("")).collect::<Vec<_>>().join(" ");
    let mp: Vec<&Json> = els(&r["mutuelles"]).iter().filter(|m| entre(m).contains("piste")).collect();
    assert!(!mp.is_empty() && 1e-3 < n(&mp[0]["m_nH"]).abs() && n(&mp[0]["m_nH"]).abs() < 1.0, "{}", dumps(&r["mutuelles"]));
    for k in 0..freqs_de(&r).len() {
        assert!((_s(&r, k, 1, 0) - _s(&r, k, 0, 1)).norm() < 1e-12);
    }
    assert!(els(&r["avertissements"]).iter().any(|w| w.as_str().is_some_and(|w| w.contains("enroulement"))));
}

/// A basse frequence, une fente franchie vaut la self de Ott : deux
/// detours (mu0/pi) 2d ln(2d/W) en parallele, poses au depart.
fn une_fente_du_plan_est_la_self_de_ott() {
    let fente = j(r#"{"d1": 3.0, "d2": 5.0, "g": 0.3, "largeur": 0.35, "plan": 2}"#);
    let br = obj! {"a" => "a", "b" => "b", "net" => "RF", "objets" => vec![_piste(0.0, 0.0, 10.0, 0.0, 0.35)],
                   "fentes" => vec![fente]};
    let mut doc = _doc_f(&AB, vec![], vec![br.clone()], vec![], 5e7, 1.5e8, 3);
    poser(dans(&mut doc, "analyse"), "f_centre", 1e8);
    let r = an(&doc);
    let ld: Vec<f64> = [3.0f64, 5.0].iter().map(|d| MU_0 / PI * 2.0 * d * 1e-3 * (2.0 * d / 0.35).ln()).collect();
    let lp = ld[0] * ld[1] / (ld[0] + ld[1]);
    let sans_fente = |a: &str| avec(&br, &[("a", a.j()), ("fentes", Json::Liste(vec![]))]);
    let mut ref_ = _doc_f(&AB, vec![_ideal("LF", "L", lp, "a", "a2")], vec![sans_fente("a2")], vec![], 5e7, 1.5e8, 3);
    poser(dans(&mut ref_, "analyse"), "f_centre", 1e8);
    let r0 = an(&ref_);
    let fr = freqs_de(&r);
    assert!(fr.len() == 3 && maxf(&fr) <= 1.5e8, "{fr:?}");
    for k in 0..3 {
        assert!((_s(&r, k, 1, 0) - _s(&r0, k, 1, 0)).norm() < 2e-4, "{k}");
    }
    assert!(n(&r["branches"][0]["fentes"][0]["d1"]) == 3.0);
    let haut = an(&_doc_f(&AB, vec![], vec![br.clone()], vec![], 3e9, 3e9, 1));
    let sans = an(&_doc_f(&AB, vec![], vec![sans_fente("a")], vec![], 3e9, 3e9, 1));
    assert!(_s(&haut, 0, 1, 0).norm() < _s(&sans, 0, 1, 0).norm() - 0.01);
}

fn une_broche_annexe_porte_son_impedance() {
    let fil = vec![_ideal("R0", "R", 0.0, "a", "b"),
                   j(r#"{"ref": "U1.5", "noeuds": ["a"], "modele": {"type": "z", "re": 50, "im": 0}}"#)];
    let r = an(&_doc(&AB, fil, vec![], vec![]));
    // 50 ohms en derivation sur une ligne 50/50 : S21 = 2/3.
    proche(_s(&r, _k0(&r), 1, 0).norm(), 2.0 / 3.0, 1e-9, "S21 avec 50 ohms au noeud");
}

/// phi_mtl (Pade) contre crosstalk.chaine_mtl (base modale) : meme L, C.
fn la_ligne_couplee_sans_pertes_est_celle_du_crosstalk() {
    let l_m: MatR = vec![vec![3.2e-7, 6e-8], vec![6e-8, 3.0e-7]];
    let c_m: MatR = vec![vec![1.3e-10, -2e-11], vec![-2e-11, 1.25e-10]];
    let freqs = [1e8, 2.4e9, 6e9];
    let omegas: Vec<f64> = freqs.iter().map(|f| 2.0 * PI * f).collect();
    let ref_ = em::crosstalk::chaine_mtl(&l_m, &c_m, 0.012, &omegas, 0.0).unwrap();
    let vu = phi_mtl(ParFrequence::Une(&l_m), ParFrequence::Une(&c_m), &vec![vec![0.0, 0.0]; 3], ParFrequence::Une(&0.0), 0.012, &freqs).unwrap();
    for (a, b) in vu.iter().zip(&ref_) {
        for (la, lb) in a.iter().zip(b) {
            for (x, y) in la.iter().zip(lb) {
                assert!(voisin(*x, *y, 1e-7, 1e-9), "{a:?} {b:?}");
            }
        }
    }
}

/// Un conducteur seul, adapte : |S21| = exp(-R l / 2 Z0).
fn les_pertes_du_cuivre_attenuent_en_exp() {
    let (l_, c_) = (3.2e-7f64, 1.28e-10f64);
    let z0 = (l_ / c_).sqrt();
    let r_ = 20.0; // ohm/m
    let p = phi_mtl(ParFrequence::Une(&vec![vec![l_]]), ParFrequence::Une(&vec![vec![c_]]), &[vec![r_]], ParFrequence::Une(&0.0), 0.05, &[1e9]).unwrap().remove(0);
    // ABCD d'un conducteur seul, puis S sur Z0 : le module de S21.
    let (a_, b_, c2, d_) = (p[0][0], -p[0][1], -p[1][0], p[1][1]);
    let s21 = 2.0 / (a_ + b_ / z0 + c2 * z0 + d_);
    proche(s21.norm(), (-r_ * 0.05 / (2.0 * z0)).exp(), 1e-3, "attenuation");
}

fn trois_pistes_font_une_section_a_trois() {
    let w = 0.35;
    let mut br = _paire(0.15);
    br.push(branche("s1", "s2", Some("C"), vec![_piste(0.0, 2.0 * (w + 0.15), 10.0, 2.0 * (w + 0.15), w)]));
    let mut comp = rq();
    comp.extend([_ideal("RS1", "R", 50.0, "s1", "0"), _ideal("RS2", "R", 50.0, "s2", "0")]);
    let r = an(&_doc(&P12, comp, br, vec![]));
    assert!(els(&r["couplages"]).len() == 1 && els(&r["couplages"][0]["nets"]).len() == 3, "{}", dumps(&r["couplages"]));
}

/// Le troncon couple arrive par un via : le raccord le rend a la chaine.
fn le_via_au_bord_d_un_longement_est_compte() {
    let w = 0.35;
    let mut a = _piste(-5.0, 0.0, 0.0, 0.0, w);
    poser(&mut a, "layer", 6i64);
    let mut b = _piste(0.0, 0.0, 10.0, 0.0, w);
    poser(&mut b, "via", j(r#"{"drill_diameter": 0.3, "pad_diameter": 0.6}"#));
    let mut br = _paire(0.15);
    poser(&mut br[0], "objets", vec![a, b]);
    let r = an(&_doc(&P12, rq(), br, vec![]));
    assert!(r["couplages"].vrai(), "le longement doit etre vu");
    assert!(r["branches"][0]["vias"].as_i64() == Some(1), "{}", dumps(&r["branches"][0]));
    assert!((n(&r["branches"][0]["longueur"]) - 15.0).abs() < 1e-6);
}

fn acces_zone(xs: [(&str, f64); 2], ys: &[f64]) -> Vec<Json> {
    xs.iter().flat_map(|(nom, x)| ys.iter().map(move |y| obj! {"noeud" => *nom, "x" => *x, "y" => *y})).collect()
}

/// Une plage de 3 mm sur 20, maillee, contre la ligne MoM de 3 mm.
fn une_zone_large_se_comporte_en_ligne() {
    let mut doc_z = _doc_f(&AB, vec![], vec![], vec![], 0.5e9, 3e9, 11);
    poser(&mut doc_z, "zones", vec![obj! {"noeud" => "Z", "couche" => 0i64, "cuivre" => 0.035,
        "pts" => vec![0.0, 0.0, 20.0, 0.0, 20.0, 3.0, 0.0, 3.0], "aire" => 60.0,
        // ATTAQUEE SUR TOUTE SA LARGEUR, comme la ligne : un
        // acces ponctuel ajouterait une self d'etalement que
        // la ligne n'a pas.
        "acces" => acces_zone([("a", 0.05), ("b", 19.95)], &[0.1, 0.5, 0.9, 1.3, 1.7, 2.1, 2.5, 2.9])}]);
    let rz = an(&doc_z);
    let doc_l = _doc_f(&AB, vec![], vec![branche("a", "b", None, vec![_piste(0.0, 1.5, 20.0, 1.5, 3.0)])], vec![], 0.5e9, 3e9, 11);
    let rl = an(&doc_l);
    let k = _k0(&rz);
    let (sz, sl) = (_s(&rz, k, 1, 0), _s(&rl, k, 1, 0));
    proche(sz.norm(), sl.norm(), 0.05, "|S21| zone contre ligne");
    assert!((sz / sl).arg().abs() < 12f64.to_radians(), "phase : {} contre {}", sz.arg(), sl.arg());
    assert!(n(&rz["surfaces"][0]["cellules"]) > 20.0);
}

fn la_piste_de_masse_s_ajoute_au_via() {
    let via = j(r#"{"x": 0, "y": 0, "percage": 0.3, "couche_plan": 2}"#);
    let seul = admittance_masse(&QUATRE(), &obj! {"couche" => 0i64, "vias" => vec![via.clone()]}, &[1e9], &mut Cache::default()).unwrap();
    let avec_ = admittance_masse(&QUATRE(), &obj! {"couche" => 0i64, "vias" => vec![avec(&via, &[("piste", j(r#"{"longueur": 2.0, "largeur": 0.3, "couche": 0}"#))])]},
                                 &[1e9], &mut Cache::default()).unwrap();
    let l_seul = (1.0 / seul[0]).im / (2.0 * PI * 1e9);
    let l_avec = (1.0 / avec_[0]).im / (2.0 * PI * 1e9);
    assert!(l_avec > l_seul + 0.3e-9, "{l_seul} {l_avec}");
    assert!((1.0 / avec_[0]).re > 0.0, "la piste de masse a sa resistance");
}

/// Un conducteur seul : la dispersion modale redonne Getsinger ; deux
/// conducteurs : au continu, [L] et [C] ne bougent pas.
fn la_dispersion_modale_est_celle_de_getsinger() {
    let (z0, eps, er, h) = (50.0, 3.2f64, 4.3, 0.2e-3);
    let l1: MatR = vec![vec![z0 * eps.sqrt() / tl::C_0]];
    let c1: MatR = vec![vec![eps.sqrt() / (tl::C_0 * z0)]];
    let (ls, cs) = dispersion_modale(&l1, &c1, er, h, &[5e9]).unwrap();
    let (eps_f, z_f) = tl::dispersion_getsinger(z0, eps, er, h, 5e9);
    proche(tl::C_0.powi(2) * (ls[0][0][0] * cs[0][0][0]), eps_f, 1e-9, "eps(f) d'un conducteur seul");
    proche((ls[0][0][0] / cs[0][0][0]).sqrt(), z_f, 1e-9, "Z(f)");
    let l_m: MatR = vec![vec![3.2e-7, 6e-8], vec![6e-8, 3.0e-7]];
    let c_m: MatR = vec![vec![1.3e-10, -2e-11], vec![-2e-11, 1.25e-10]];
    let (ls, cs) = dispersion_modale(&l_m, &c_m, 4.3, h, &[1.0]).unwrap();
    let pres = |a: &MatR, b: &MatR| a.iter().flatten().zip(b.iter().flatten()).all(|(x, y)| (x - y).abs() <= 1e-8 + 1e-6 * y.abs());
    assert!(pres(&ls[0], &l_m) && pres(&cs[0], &c_m));
}

/// Le meme contour, dont la moitie droite n'est pas remplie.
fn le_masque_ote_le_degagement() {
    let base = j(r#"{"couche": 0, "cuivre": 0.035, "pts": [0, 0, 10, 0, 10, 4, 0, 4],
                     "aire": 40.0, "acces": [{"noeud": "a", "x": 1, "y": 2}]}"#);
    let plein = maillage_zone(&QUATRE(), &base, 3e9, &mut Cache::default()).unwrap().unwrap();
    let (nx, ny) = (20usize, 8usize); // pas de 0,5 mm
    // Rangees : 10 plein, 10 vide ; la premiere plage est « vide » de 0.
    let mut plages = vec![0usize];
    for _ in 0..ny {
        plages.extend([10, 10]);
    }
    let masque = obj! {"x0" => 0i64, "y0" => 0i64, "pas" => 0.5, "nx" => nx, "ny" => ny, "plages" => plages};
    let moitie = maillage_zone(&QUATRE(), &avec(&base, &[("masque", masque)]), 3e9, &mut Cache::default()).unwrap().unwrap();
    proche(rf_reseau::alg::somme_np(&plein.aire), 40.0, 0.02, "surface maillee pleine");
    proche(rf_reseau::alg::somme_np(&moitie.aire), 20.0, 0.05, "surface a moitie");
    assert!(moitie.cx.iter().all(|x| *x < 5.0));
}

/// C1 en derivation, sa pastille de masse dans une coulee : les vias de
/// la coulee la descendent au plan, a travers le maillage.
fn la_coulee_de_masse_est_maillee() {
    let ports = P12;
    let comp = vec![_ideal("R0", "R", 0.0, "p1", "p2"), _ideal("C1", "C", 10e-12, "p2", "g")];
    let ideal = an(&_doc(&ports, vec![_ideal("R0", "R", 0.0, "p1", "p2"), _ideal("C1", "C", 10e-12, "p2", "0")], vec![], vec![]));
    let doc = _doc(&ports, comp, vec![], vec![j(r#"{"noeud": "g", "couche": 0, "vias": [],
        "coulee": {"couche": 0, "cuivre": 0.035,
                   "pts": [-5, -5, 5, -5, 5, 5, -5, 5], "aire": 100.0,
                   "centre": [0, 0], "rayon": 3.0,
                   "vias": [{"x": 2.0, "y": 0, "percage": 0.3,
                             "couche_plan": 2}]}}"#)]);
    let r = an(&doc);
    let k = _k0(&r);
    // 10 pF a 2,44 GHz resonne avec ~0,4 nH : la masse reelle pese.
    assert!((_s(&r, k, 1, 0) - _s(&ideal, k, 1, 0)).norm() > 0.02, "{} {}", _s(&r, k, 1, 0), _s(&ideal, k, 1, 0));
    let t_ = _s(&r, k, 0, 0).norm().powi(2) + _s(&r, k, 1, 0).norm().powi(2);
    assert!(t_ <= 1.0 + 1e-9);
}

/// Le carre isole (Read 1997 : 0,36679 x 4 pi e0 a) ; la capacite par
/// metre d'un microruban, dans le vide et sur FR-4, contre Hammerstad-Jensen
/// -- qui valide la fonction de Green du stratifie.
fn la_plaque_3d_retrouve_ses_etalons() {
    let a = 1e-3;
    proche(capacite_plaque_3d(a, a, 200.0 * a, None, 20, 1.0).unwrap() / (4.0 * PI * EPS_0 * a), 0.36679, 0.005, "carre isole");
    let h = 0.2e-3;
    for (er, u) in [(1.0f64, 1.0f64), (4.2, 1.0), (4.2, 5.0)] {
        let w = u * h;
        let c1 = capacite_plaque_3d(w, 6.0 * h, h, None, 20, er).unwrap();
        let c2 = capacite_plaque_3d(w, 12.0 * h, h, None, 20, er).unwrap();
        let a_ = 1.0 + ((u.powi(4) + (u / 52.0).powi(2)) / (u.powi(4) + 0.432)).ln() / 49.0 + (1.0 + (u / 18.1).powi(3)).ln() / 18.7;
        let b_ = 0.564 * ((er - 0.9) / (er + 3.0)).powf(0.053);
        let e = (er + 1.0) / 2.0 + (er - 1.0) / 2.0 * (1.0 + 10.0 / u).powf(-a_ * b_);
        let f = 6.0 + (2.0 * PI - 6.0) * (-(30.666 / u).powf(0.7528)).exp();
        let z = 60.0 * (f / u + (1.0 + 4.0 / (u * u)).sqrt()).ln() / e.sqrt();
        proche((c2 - c1) / (6.0 * h), e.sqrt() / (299792458.0 * z), 0.01, &format!("C par metre, er {}, W/h {}", fmt_g(er, 6), fmt_g(u, 6)));
    }
}

/// Une piste a 0,15 mm de l'autre a un bout, 0,45 mm a l'autre : chaque
/// morceau couple porte son propre ecart, et ils croissent.
fn deux_pistes_qui_s_ecartent_sont_recoupees() {
    let w = 0.35;
    let br = vec![branche("p1", "p2", Some("A"), vec![_piste(0.0, 0.0, 10.0, 0.0, w)]),
                  branche("q1", "q2", Some("B"), vec![_piste(0.0, w + 0.15, 10.0, w + 0.45, w)])];
    let r = an(&_doc(&P12, rq(), br, vec![]));
    let ec: Vec<f64> = els(&r["couplages"]).iter().map(|c| n(&c["ecart"])).collect();
    assert!(ec.len() >= 5, "{ec:?}");
    assert!(ec.iter().zip(ec.iter().skip(1)).all(|(a, b)| b > a), "{ec:?}");
    assert!((py::sum(els(&r["couplages"]).iter().map(|c| n(&c["longueur"]))) - 10.0).abs() < 0.01);
    assert!((n(&r["branches"][1]["longueur"]) - py::hypot(10.0, 0.3)).abs() < 1e-3);
}

fn _doc_grande_coulee() -> Json {
    let comp = vec![_ideal("R0", "R", 0.0, "p1", "p2"), _ideal("C1", "C", 10e-12, "p2", "g")];
    let pas = [-25i64, -15, -5, 5, 15, 25];
    let vias: Vec<Json> = pas.iter().flat_map(|x| pas.iter().map(move |y| obj! {"x" => *x, "y" => *y, "percage" => 0.3, "couche_plan" => 2i64})).collect();
    _doc(&P12, comp, vec![], vec![obj! {"noeud" => "g", "couche" => 0i64, "vias" => Json::Liste(vec![]),
        "coulee" => obj! {"id" => "GND0", "couche" => 0i64, "cuivre" => 0.035,
                          "pts" => vec![-30i64, -30, 30, -30, 30, 30, -30, 30],
                          "centre" => vec![0i64, 0], "vias" => vias}}])
}

/// 60 x 60 mm, 36 vias : bien au-dela des 400 cellules d'autrefois, et
/// maillee EN ENTIER, fin pres de la pastille, grossier au loin.
fn une_grande_coulee_est_maillee_en_entier() {
    let t0 = std::time::Instant::now();
    let r = an(&_doc_grande_coulee());
    let duree = t0.elapsed().as_secs_f64();
    let s = els(&r["surfaces"]).iter().find(|x| x["genre"].as_str() == Some("coulées")).expect("la coulee a sa fiche");
    assert!(n(&s["cellules"]) > 400.0, "{}", dumps(s));
    assert!(n(&s["pas_max_mm"]) > 4.0 * n(&s["pas_min_mm"]), "{}", dumps(s));
    assert!(duree < 30.0, "{duree:.1} s");
    assert!(els(&r["masses"]).len() == 36);
}

/// Au-dela de 400 inconnues la resolution passe en creux : elle doit
/// redonner la resolution pleine au bit pres, sur un reseau ou la pleine
/// reste abordable.
fn le_creux_et_le_plein_donnent_le_meme_s() {
    let mut doc = _doc_grande_coulee();
    let mut masse = doc["masses"][0].clone();
    let cl = dans(&mut masse, "coulee");
    poser(cl, "pts", vec![-6i64, -6, 6, -6, 6, 6, -6, 6]);
    let vias: Vec<Json> = els(&cl["vias"]).iter().filter(|v| n(&v["x"]).abs() < 6.0 && n(&v["y"]).abs() < 6.0).cloned().collect();
    poser(cl, "vias", vias);
    poser(&mut doc, "masses", vec![masse]);
    let creux = an(&doc);
    _SPARSE.store(false, Ordering::Relaxed);
    let plein = analyser(&doc, None);
    _SPARSE.store(true, Ordering::Relaxed);
    let plein = plein.unwrap_or_else(|e| panic!("ErreurRF : {}", e.message));
    for (a, b) in els(&creux["s"]).iter().zip(els(&plein["s"])) {
        for (u, v) in els(a).iter().zip(els(b)) {
            assert!((cx(n(&u[0]), n(&u[1])) - cx(n(&v[0]), n(&v[1]))).norm() < 1e-9, "{} {}", dumps(u), dumps(v));
        }
    }
}

/// Une piste de 5 mm sur 0,2 mm de FR-4 a son premier mode superieur vers
/// 13,8 GHz (c0 / 2 W_eff rac(er)) : une bande qui monte a 15 GHz le fait
/// dire ; a 2,44 GHz, rien a dire.
fn le_domaine_quasi_statique_est_dit() {
    let doc = |w: f64, f2: f64| _doc_f(&AB, vec![], vec![branche("a", "b", Some("RF"), vec![_piste(0.0, 0.0, 10.0, 0.0, w)])], vec![], 1e9, f2, 11);
    let hors = |r: &Json| els(&r["avertissements"]).iter().any(|a| a.as_str().is_some_and(|a| a.contains("HORS DU DOMAINE")));
    let large = an(&doc(5.0, 15e9));
    let v = &large["validite"];
    assert!(v["limites"][0]["cause"].as_str() == Some("mode supérieur"), "{}", dumps(&v["limites"][0]));
    proche(n(&v["f_max"]), 13.8e9, 0.05, "coupure du premier mode superieur");
    assert!(hors(&large));
    let fin = an(&doc(0.35, 3e9));
    assert!(n(&fin["validite"]["f_max"]) > 20e9);
    assert!(!hors(&fin));
}

/// La zone maillee contre la ligne MoM de meme largeur, de l'etroit (les
/// franges font la self : dualite L' = mu0 eps0 / C'_vide) au large (la
/// plaque) : phase de S21 a 3 degres, Zin a 15 %.
fn une_zone_etroite_ou_large_rejoint_la_ligne_mom() {
    for w in [0.3, 1.0, 3.0] {
        let ys: Vec<f64> = (0..4).map(|i| w * (i as f64 + 0.5) / 4.0).collect();
        let mut dz = _doc_f(&AB, vec![], vec![], vec![], 1e9, 3e9, 11);
        poser(&mut dz, "zones", vec![obj! {"noeud" => "Z", "couche" => 0i64, "cuivre" => 0.035,
            "pts" => vec![0.0, 0.0, 5.0, 0.0, 5.0, w, 0.0, w],
            "acces" => acces_zone([("a", 0.01), ("b", 4.99)], &ys)}]);
        let rz = an(&dz);
        let rl = an(&_doc_f(&AB, vec![], vec![branche("a", "b", None, vec![_piste(0.0, w / 2.0, 5.0, w / 2.0, w)])], vec![], 1e9, 3e9, 11));
        let k = _k0(&rz);
        let dphi = (_s(&rz, k, 1, 0) / _s(&rl, k, 1, 0)).arg().abs();
        assert!(dphi < 3f64.to_radians(), "w {} : {:.2} deg", fmt_g(w, 6), dphi.to_degrees());
        let (zz, zl) = (cx(n(&rz["zin"][k][0]), n(&rz["zin"][k][1])), cx(n(&rl["zin"][k][0]), n(&rl["zin"][k][1])));
        assert!((zz - zl).norm() < 0.15 * zl.norm(), "w {} : {zz} contre {zl}", fmt_g(w, 6));
    }
}

fn les_refus() {
    let refuse = |doc: Json| matches!(analyser(&doc, None), Err(e) if !e.interne);
    for (ports, quoi) in [(["a", "a"], "meme noeud"), (["0", "b"], "masse")] {
        assert!(refuse(_doc(&[p(ports[0], 50.0, 0.0), p(ports[1], 50.0, 0.0)], vec![_ideal("R", "R", 1.0, "a", "b")], vec![], vec![])),
                "port refuse attendu : {quoi}");
    }
    assert!(refuse(_doc(&[p("a", -5.0, 0.0), p("b", 50.0, 0.0)], vec![_ideal("R", "R", 1.0, "a", "b")], vec![], vec![])),
            "une partie reelle negative a ete acceptee");
}

/// rf_reseau 1.6.0 : l'empilage porte le dielectrique causal et la
/// rugosite, et les deux arrivent aux branches (par simulation_em) comme a
/// la section couplee ([C](f), tan delta(f)). Fiche calee sur F0 : a F0, le
/// S est celui du calcul non causal au bit pres ; ailleurs il bouge. Rq de
/// 2 um : la paire perd davantage.
fn le_dielectrique_causal_et_la_rugosite_entrent_dans_la_rf() {
    let doc = |stack: &[(&str, Json)]| {
        // L'EMPILAGE EST RECOPIE ET SON tan delta REMIS : un cas plus haut
        // ecrit dans les dictionnaires de QUATRE, et sans perte le
        // dielectrique causal n'a rien a prolonger.
        let mut d = _doc_paire(0.15, true);
        let couches: Vec<Json> = QUATRE().iter().map(|c| if c["type"].as_str() == Some("dielectric") { avec(c, &[("tan_delta", 0.02.j())]) } else { c.clone() }).collect();
        let mut st = avec(&d["stackup"], &[("layers", couches.j())]);
        for (k, v) in stack {
            poser(&mut st, k, v);
        }
        poser(&mut d, "stackup", st);
        d
    };
    let r0 = an(&doc(&[]));
    let r1 = an(&doc(&[("dielectrique_causal", true.j()), ("f_ref_dielectrique", F0.j())]));
    assert!(r1["couplages"].vrai(), "la section couplee doit exister");
    let k = _k0(&r0);
    let fr = freqs_de(&r0);
    assert!(fr[k] == F0);
    for i in [0, 1] {
        assert!((_s(&r1, k, i, 0) - _s(&r0, k, i, 0)).norm() < 1e-12, "{i} {}", _s(&r1, k, i, 0));
    }
    assert!((_s(&r1, 0, 1, 0) - _s(&r0, 0, 1, 0)).norm() > 1e-6);
    assert!((_s(&r1, fr.len() - 1, 1, 0) - _s(&r0, fr.len() - 1, 1, 0)).norm() > 1e-6);
    let mut rug = doc(&[]);
    let mut couches = els(&rug["stackup"]["layers"]).to_vec();
    poser(&mut couches[0], "rugosite_rms_um", 2.0);
    poser(dans(&mut rug, "stackup"), "layers", couches);
    let r2 = an(&rug);
    assert!(_s(&r2, k, 1, 0).norm() < _s(&r0, k, 1, 0).norm() - 1e-4, "{} {}", _s(&r2, k, 1, 0).norm(), _s(&r0, k, 1, 0).norm());
}

pub fn banc() {
    titre("Banc d'essai de la simulation RF (python/test/banc-rf.py)");
    T("touchstone relu redonne ce qui a ete ecrit", touchstone_relu_redonne_ce_qui_a_ete_ecrit);
    T("touchstone formats db ri mhz et bruit", touchstone_formats_db_ri_mhz_et_bruit);
    T("touchstone trois ports en rangees et version 2", touchstone_trois_ports_en_rangees_et_version_2);
    T("touchstone en y revient en s", touchstone_en_y_revient_en_s);
    T("deux ports relies donnent le gain de desadaptation", deux_ports_relies_donnent_le_gain_de_desadaptation);
    T("les ports differentiels", les_ports_differentiels);
    T("un reseau en l adapte 14 8j sur 50", un_reseau_en_l_adapte_14_8j_sur_50);
    T("la piste est celle de simulation em", la_piste_est_celle_de_simulation_em);
    T("une piste retournee donne le meme s21", une_piste_retournee_donne_le_meme_s21);
    T("une derivation en t passe", une_derivation_en_t_passe);
    T("un condensateur murata vaut son reseau calcule a la main", un_condensateur_murata_vaut_son_reseau_calcule_a_la_main);
    T("une self murata se charge", une_self_murata_se_charge);
    T("le modele generique prend ses parametres", le_modele_generique_prend_ses_parametres);
    T("une self et une capa en parallele comptent toutes les deux", une_self_et_une_capa_en_parallele_comptent_toutes_les_deux);
    T("un actif spice est refuse avec la consigne", un_actif_spice_est_refuse_avec_la_consigne);
    T("un snp vaut le modele qu il decrit", un_snp_vaut_le_modele_qu_il_decrit);
    T("un snp actif garde sa non reciprocite", un_snp_actif_garde_sa_non_reciprocite);
    T("un snp thru parfait passe", un_snp_thru_parfait_passe);
    T("un snp hors de sa bande est refuse", un_snp_hors_de_sa_bande_est_refuse);
    T("un s3p se rapporte a la broche de masse", un_s3p_se_rapporte_a_la_broche_de_masse);
    T("un s1p rapporte a une broche s ajoute a ce qui la tient", un_s1p_rapporte_a_une_broche_s_ajoute_a_ce_qui_la_tient);
    T("les vias de masse en parallele", les_vias_de_masse_en_parallele);
    T("une pastille vaut au moins sa plaque", une_pastille_vaut_au_moins_sa_plaque);
    T("une pastille charge le noeud", une_pastille_charge_le_noeud);
    T("deux pistes proches se couplent", deux_pistes_proches_se_couplent);
    T("le couplage ne cree pas de puissance", le_couplage_ne_cree_pas_de_puissance);
    T("au dela de 3h rien ne se couple", au_dela_de_3h_rien_ne_se_couple);
    T("un couple decoupe garde la longueur", un_couple_decoupe_garde_la_longueur);
    T("une piste voisine vaut une branche fermee sur son z0", une_piste_voisine_vaut_une_branche_fermee_sur_son_z0);
    T("la mutuelle de neumann rend celle de maxwell", la_mutuelle_de_neumann_rend_celle_de_maxwell);
    T("deux selfs bout a bout s ajoutent leur mutuelle", deux_selfs_bout_a_bout_s_ajoutent_leur_mutuelle);
    T("une self induit dans la piste qui la longe", une_self_induit_dans_la_piste_qui_la_longe);
    T("une fente du plan est la self de ott", une_fente_du_plan_est_la_self_de_ott);
    T("une broche annexe porte son impedance", une_broche_annexe_porte_son_impedance);
    T("la ligne couplee sans pertes est celle du crosstalk", la_ligne_couplee_sans_pertes_est_celle_du_crosstalk);
    T("les pertes du cuivre attenuent en exp", les_pertes_du_cuivre_attenuent_en_exp);
    T("trois pistes font une section a trois", trois_pistes_font_une_section_a_trois);
    T("le via au bord d un longement est compte", le_via_au_bord_d_un_longement_est_compte);
    T("une zone large se comporte en ligne", une_zone_large_se_comporte_en_ligne);
    T("la piste de masse s ajoute au via", la_piste_de_masse_s_ajoute_au_via);
    T("la dispersion modale est celle de getsinger", la_dispersion_modale_est_celle_de_getsinger);
    T("le masque ote le degagement", le_masque_ote_le_degagement);
    T("la coulee de masse est maillee", la_coulee_de_masse_est_maillee);
    T("la plaque 3d retrouve ses etalons", la_plaque_3d_retrouve_ses_etalons);
    T("deux pistes qui s ecartent sont recoupees", deux_pistes_qui_s_ecartent_sont_recoupees);
    T("une grande coulee est maillee en entier", une_grande_coulee_est_maillee_en_entier);
    T("le creux et le plein donnent le meme s", le_creux_et_le_plein_donnent_le_meme_s);
    T("le domaine quasi statique est dit", le_domaine_quasi_statique_est_dit);
    T("une zone etroite ou large rejoint la ligne mom", une_zone_etroite_ou_large_rejoint_la_ligne_mom);
    T("les refus", les_refus);
    T("le dielectrique causal et la rugosite entrent dans la rf", le_dielectrique_causal_et_la_rugosite_entrent_dans_la_rf);
}
