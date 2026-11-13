//! Le banc crosstalk-mesure, pour ce qui ne dépend pas du moteur : la lecture des relevés.

use outils::banc_crosstalk::{lire_releves, Releve};

#[test]
fn releves() {
    let f = std::env::temp_dir().join(format!("outils-releves-{}.csv", std::process::id()));
    std::fs::write(
        &f,
        "# commentaire\n\ncas;source;t_10_90_ns;V_agresseur_mV;V_NEXT_mV;V_FEXT_mV;note\r\n\
         1;mesure;0,8;500;21,5;;\"a; \"\"b\"\"\"\nx;MESURE;1;2;3;4;\n1;MESURE ;1;500\n2;siwave;1.0;1000;44;7;\n",
    )
    .unwrap();
    let r = lire_releves(&f).unwrap();
    std::fs::remove_file(&f).unwrap();
    assert_eq!(r.keys().cloned().collect::<Vec<_>>(), [(1, "MESURE".to_string()), (2, "SIWAVE".to_string())]);
    let m = &r[&(1, "MESURE".to_string())];
    assert_eq!(m[0], Releve { tr: 0.8 * 1e-9, v_ag: 500.0, next: Some(21.5), fext: None, note: "a; \"b\"".into() });
    assert_eq!((m[1].next, m[1].fext, m[1].note.as_str()), (None, None, ""));
    assert!(lire_releves(std::path::Path::new("/nulle/part.csv")).unwrap().is_empty());
}
