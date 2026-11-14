//! Ce que les autres bancs attendaient d'analyse_carte, et le type des composants lu par le
//! lecteur IPC-2581 (test_type_composant_ipc).

use crate::*;

/// Le type que l'analyse lit vient du parseur IPC-2581 : des mots entiers, pas des
/// sous-chaînes (Resonators n'est pas RES, CERAMIC pas IC).
fn type_composant_ipc() {
    let q = |repere: &str, cle: &str, valeur: &str| {
        let props: IndexMap<String, String> = [(cle.to_string(), valeur.to_string())].into_iter().collect();
        ipc2581::IPC2581Parser::qualifier_type_composant(repere, "", Some(&props))
    };
    assert!(q("Y1", "CATEGORY", "Crystals, Oscillators, Resonators") == "CRYSTAL");
    assert!(q("C5", "DEVICE", "C_0603_CERAMIC") == "CAPACITOR");
    assert!(q("T1", "TYPE", "Transformer") != "TRANSISTOR");
    assert!(q("R1", "TYPE", "Resistor") == "RESISTOR");
    assert!(q("U1", "CATEGORY", "Integrated Circuits (ICs)") == "IC");
    assert!(q("Q1", "CATEGORY", "Transistors") == "TRANSISTOR");
}

/// banc-crosstalk, « deux niveaux » : le fil fin (20 µm de large, 2 mm d'écart latéral, un
/// plan) rejoint la méthode des images d'analyse_carte à 5 %.
fn fil_fin() {
    let r = tl::section_deux_niveaux(&[tl::Ruban { x: 0.0, y: 0.2e-3, w: 20e-6 }, tl::Ruban { x: 2e-3, y: 0.4e-3, w: 20e-6 }], None, 1.0, 30, 8).unwrap();
    let kb = xt::coefficients_couple(&r.c, &r.l, 0, 1).0;
    let ki = analyse_carte::_kb_larges_faces(0.2, 0.4, 2.0, 0.02, 0.02);
    assert!((kb / ki - 1.0).abs() < 0.05, "{kb} {ki}");
}

/// La part analyse_carte de banc-entrees-malformees.py : un champ d'un autre type que prévu
/// sort par `ErreurAnalyse` (422 lisible), jamais par une erreur interne.
fn refus(doc: &str) {
    T(&format!("analyse_carte.analyser_document({doc}) est refusé proprement"), || match analyser_document(&j(doc)) {
        Err(e) => assert!(!e.interne, "une exception interne au lieu de ErreurAnalyse ({})", e.message),
        Ok(_) => panic!("accepté"),
    });
}

pub fn banc() {
    println!("\nCe que les autres bancs attendaient d'analyse_carte");
    T("test_type_composant_ipc", type_composant_ipc);
    T("deux niveaux : le fil fin rejoint la méthode des images", fil_fin);
    for doc in [r#""x""#, "[]", r#"{"format": 1}"#, r#"{"pistes": "x"}"#, r#"{"empilage": "x"}"#] {
        refus(doc);
    }
}
