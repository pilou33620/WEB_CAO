//! La part simulation_em de python/test/banc-entrees-malformees.py.
//!
//! Les points d'entree des solveurs recoivent un document du navigateur : un champ d'un
//! autre type que prevu doit sortir par l'erreur du module (422 lisible), jamais par un
//! KeyError, ZeroDivisionError ou AttributeError (500 « Erreur interne »).

use crate::*;

/// Chaque document doit lever `ErreurSimulation`, et rien d'autre.
fn refus(doc: &str) {
    T(&format!("simulation_em.simuler({doc}) est refuse proprement"), || {
        match simuler(&mut j(doc), None, false, None) {
            Err(e) => assert!(!e.interne, "simulation_em.simuler({doc}) : une exception interne au lieu de ErreurSimulation ({})", e.message),
            Ok(_) => panic!("simulation_em.simuler({doc}) : accepte"),
        }
    });
}

pub fn banc() {
    titre("Les documents malformes sont refuses proprement");
    for doc in [r#""x""#, "[]", r#"{"format": 1}"#, r#"{"pistes": "x"}"#, r#"{"empilage": "x"}"#] {
        refus(doc);
    }
    // la cle lue est « stackup » : avec un format valide, un empilage qui n'est pas un objet est un refus
    refus(r#"{"format": "cao-sim-em-3", "stackup": "x"}"#);
}
