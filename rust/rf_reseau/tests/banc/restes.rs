//! Ce que les bancs des autres modules attendaient de rf_reseau.

use crate::*;

fn _cu(nom: &str, role: &str) -> Json {
    obj! {"name" => nom, "type" => "copper", "thickness" => 0.035, "role" => role}
}

/// banc-ligne-mom.py, « la section passe la rugosite de son plan de reference » : ses deux
/// dernieres verifications (le reste du cas est dans le banc de `em`).
fn la_section_passe_la_rugosite_de_son_plan() {
    // _FACE_SEULE, sans pertes, la piste a Rq 1 um
    let mut rug = vec![_cu("GND", "plane"), obj! {"name" => "C", "type" => "dielectric", "thickness" => 0.2, "epsilon_r" => 4.3, "tan_delta" => 0.0},
                       _cu("TOP", "signal")];
    poser(&mut rug[2], "rugosite_rms_um", 1.0);
    let mut egal = rug.clone();
    poser(&mut egal[0], "rugosite_rms_um", 1.0);
    let mut pl = rug.clone();
    poser(&mut pl[0], "rugosite_rms_um", 0.0);
    // la RF : la piste de masse de `rf_reseau` recoit la rugosite du plan
    let li = _ligne(&pl, 2, 0.3, 0.035, &mut Cache::default()).expect("la ligne a un plan");
    assert!(li.kw_pertes.get("rugosite_plan") == Some(&obj! {}), "{}", dumps(&li.kw_pertes));
    let li = _ligne(&egal, 2, 0.3, 0.035, &mut Cache::default()).expect("la ligne a un plan");
    assert!(li.kw_pertes.get("rugosite_plan").is_none(), "{}", dumps(&li.kw_pertes));
}

/// rf_reseau : deux X d'un meme sous-circuit en serie doublent son
/// impedance. Ici et non dans banc-rf.py, que la CI saute sans la LIB.
fn deux_instances_spice_ne_partagent_pas_leurs_noeuds() {
    let texte = "\n.SUBCKT CELL a b\nR1 a mid 10\nC1 mid b 1n\n.ENDS\n.SUBCKT TOP 1 2\nX1 1 m CELL\nX2 m 2 CELL\n.ENDS\n";
    let f = 1e6;
    let z = -cx(1.0, 0.0) / ModeleSpice::new(texte, "essai", &Json::Nul, &Json::Nul).unwrap().y(f).unwrap()[0][1];
    let attendu = 2.0 * (cx(10.0, 0.0) + 1.0 / (cx(0.0, 2.0) * PI * f * 1e-9));
    assert!((z - attendu).norm() < 1e-6 * attendu.norm(), "{z} {attendu}");
}

fn touchstone_triangulaire_refuse() {
    let texte = "[Version] 2.0\n# GHz S RI R 50\n[Number of Ports] 3\n[Matrix Format] Upper\n[Network Data]\n\
                 1 0 0 0 0 0 0 0 0 0 0 0 0\n2 0 0 0 0 0 0 0 0 0 0 0 0\n[End]\n";
    match lire_touchstone(texte, "x.s3p", None) {
        Err(exc) => assert!(!exc.interne && exc.message.contains("Upper"), "{}", exc.message),
        Ok(_) => panic!("une matrice Upper ne doit pas se lire comme Full"),
    }
}

/// Chaque document doit lever `ErreurRF`, et rien d'autre.
fn refus(doc: &str) {
    T(&format!("rf_reseau.analyser({doc}) est refuse proprement"), || match analyser(&j(doc), None) {
        Err(e) => assert!(!e.interne, "rf_reseau.analyser({doc}) : une exception interne au lieu de ErreurRF ({})", e.message),
        Ok(_) => panic!("rf_reseau.analyser({doc}) : accepte"),
    });
}

pub fn banc() {
    titre("Ce que les autres bancs attendaient de rf_reseau");
    T("la section passe la rugosite de son plan de reference", la_section_passe_la_rugosite_de_son_plan);
    T("rf_reseau : deux instances SPICE ont chacune leurs noeuds internes", deux_instances_spice_ne_partagent_pas_leurs_noeuds);
    T("un .sNp en matrice Upper est refuse au lieu d'etre mal lu", touchstone_triangulaire_refuse);

    // La part rf_reseau de python/test/banc-entrees-malformees.py : un champ d'un autre type
    // que prevu doit sortir par l'erreur du module (422 lisible), jamais par une exception.
    titre("Les documents malformes sont refuses proprement");
    for doc in [r#""x""#, "[]", r#"{"format": 1}"#, r#"{"pistes": "x"}"#, r#"{"empilage": "x"}"#] {
        refus(doc);
    }
    // la cle lue est « stackup » : avec un format valide, un empilage qui n'est pas un objet est un refus
    refus(&format!(r#"{{"format": "{FORMAT}", "stackup": "x"}}"#));
}
