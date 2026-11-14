//! Le journal de resoudre_dc : une ligne par etape, au format du solveur Python.
use dc_solver::*;

#[test]
fn le_journal_dit_ou_on_en_est() {
    let doc = loads(
        r#"{"polygones": [{"vertices": [[0, 0], [20, 0], [20, 2], [0, 2]], "couche": 0, "net": "VCC", "epaisseur": 0.035}],
            "sources": [{"couche": 0, "net": "VCC", "courant": 1.0, "boite": [-0.1, -0.1, 0.1, 2.1]}],
            "references": [{"couche": 0, "net": "VCC", "tension": 0.0, "boite": [19.7, -0.1, 20.1, 2.1]}], "pas": 0.2}"#,
    )
    .unwrap();
    let mut lignes = Vec::new();
    let mut journal = |t: &str| lignes.push(t.to_string());
    resoudre_document(&doc, Some(&mut journal)).unwrap();
    // les durees mises a part, ce qu'ecrit dc_solver.py 2.3.0 pour ce document
    let sans_duree: Vec<&str> = lignes
        .iter()
        .map(|l| match (l.rfind(" ("), l.rfind(", ")) {
            (Some(k), _) if l.ends_with(" s)\n") => &l[..k],
            (_, Some(k)) if l.ends_with(" s au total\n") => &l[..k],
            _ => l.trim_end(),
        })
        .collect();
    assert_eq!(sans_duree, [
        "  dc : 1 forme(s), 0 via(s), 2 borne(s), pas 0.2000 mm",
        "  dc : maillage : 1000 noeuds sur 1 couche(s), 1890 liaisons de trame",
        "  dc : systeme monte : 990 inconnues, 10 imposees",
        "  dc : gradient conjugue : converge",
        "  dc : culs-de-sac : 0 morceau(x) sans issue, le pire via y porte 0 A",
        "  dc : densite et echauffement : modele 'etalement', 1 couche(s) exterieure(s)",
        "  dc : termine : 1000 noeuds, 0 via(s) relies, chute max 4.88 mV, 0.66 degres",
    ]);
    assert!(lignes.iter().all(|l| l.ends_with('\n')));
}
