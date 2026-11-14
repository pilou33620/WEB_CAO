//! Les angles des pistes (test_coudes … test_unites).

use crate::*;

fn coudes() {
    let res = ang1(vec![piste(&[(0., 0.), (10., 0.), (10., 10.)])]);
    assert!(regles_de(&res) == ["angle_droit"] && txt(&res[0], "severite") == "vigilance", "{res:?}");
    // le même coude en deux pistes qui se touchent bout à bout
    assert!(regles_de(&ang1(vec![piste(&[(0., 0.), (10., 0.)]), piste(&[(10., 0.), (10., 10.)])])) == ["angle_droit"]);
    // chanfrein à 45° : deux coudes à 135°, rien à dire
    assert!(ang1(vec![piste(&[(0., 0.), (10., 0.), (15., 5.), (15., 15.)])]).is_empty());
    // tout droit, coupé en deux
    assert!(ang1(vec![piste(&[(0., 0.), (5., 0.), (10., 0.)])]).is_empty());
    // V à 45°
    let res = ang1(vec![piste(&[(0., 0.), (10., 0.), (0., 10.)])]);
    assert!(regles_de(&res) == ["aigu"] && n(&res[0]["deg"]) == 45.0 && txt(&res[0], "severite") == "critique");
    // 89,5° est un angle droit à 1° près, 88° est aigu, 92° n'est rien
    assert!(regles_de(&ang1(vec![piste(&[(0., 0.), (10., 0.), (9.9127, 10.)])])) == ["angle_droit"]);
    assert!(regles_de(&ang1(vec![piste(&[(0., 0.), (10., 0.), (9.651, 10.)])])) == ["aigu", "hors_45"]);
    assert!(regles_de(&ang1(vec![piste(&[(0., 0.), (10., 0.), (10.349, 10.)])])) == ["hors_45"]);
    // micro-zigzag d'export (P01x274, CS_Flash) : des V de 45° sur 3,6 et 14 µm dans une
    // piste de 0,21 mm, noyés dans le cuivre
    assert!(ang1(vec![piste_(&[(24.08062, 33.515), (24.78414, 34.21852), (24.78414, 34.2149), (24.79428, 34.22504), (24.79428, 34.22866)],
                             "S", 0, 0.21)]).is_empty());
    // coude à 90° dont une jambe (0,05 mm) est plus courte que la demi-largeur
    assert!(ang1(vec![piste(&[(0., 0.), (10., 0.), (10., 0.05)])]).is_empty());
}

fn jonctions() {
    // T : un bout posé au milieu d'une autre piste ; ses deux 90° ne sont pas redits en
    // angles droits
    let res = ang1(vec![piste(&[(0., 0.), (20., 0.)]), piste(&[(10., 0.), (10., 10.)])]);
    assert!(regles_de(&res) == ["jonction"] && msg(&res[0]) == "Jonction en T", "{res:?}");
    // bout à 0,05 mm de l'axe d'une piste de 0,2 mm : dans son cuivre
    assert!(regles_de(&ang1(vec![piste(&[(0., 0.), (20., 0.)]), piste(&[(10., 0.05), (10., 10.)])])) == ["jonction"]);
    // Y sur un même sommet, dont deux branches à 30° : jonction ET angle aigu
    let res = ang1(vec![piste(&[(0., 0.), (10., 0.)]), piste(&[(10., 0.), (20., 0.)]), piste(&[(10., 0.), (18.66, 5.)])]);
    assert!(regles_de(&res) == ["aigu", "hors_45", "jonction"], "{res:?}");
    // croix à quatre branches
    let res = ang1(vec![piste(&[(0., 0.), (20., 0.)]), piste(&[(10., -10.), (10., 0.)]), piste(&[(10., 0.), (10., 10.)])]);
    assert!(res.iter().map(msg).collect::<Vec<_>>() == ["Jonction à 4 branches"], "{res:?}");
    // piste doublée sur elle-même : du cuivre en double, pas un angle
    assert!(ang1(vec![piste(&[(0., 0.), (20., 0.)]), piste(&[(5., 0.), (15., 0.)])]).is_empty());
}

fn perimetre() {
    // deux nets différents qui se croisent ne se jugent pas entre eux
    assert!(ang1(vec![piste_(&[(0., 0.), (20., 0.)], "A", 0, 0.2), piste_(&[(10., 0.), (10., 10.)], "B", 0, 0.2)]).is_empty());
    // deux couches non plus
    assert!(ang1(vec![piste_(&[(0., 0.), (10., 0.)], "S", 0, 0.2), piste_(&[(10., 0.), (10., 10.)], "S", 1, 0.2)]).is_empty());
    // coude à 90° au centre d'un via : l'anneau le couvre
    let pistes = || vec![piste(&[(0., 0.), (10., 0.), (10., 10.)])];
    assert!(ang(pistes(), vec![], vec![j(r#"{"x": 10, "y": 0, "r": 0.15}"#)], 1.0).is_empty());
    assert!(regles_de(&ang(pistes(), vec![], vec![j(r#"{"x": 30, "y": 0, "r": 0.15}"#)], 1.0)) == ["angle_droit"]);
}

fn hors_45() {
    let res = ang1(vec![piste(&[(0., 0.), (10., 3.), (20., 0.), (30., 3.)])]);
    let hors: Vec<&Json> = res.iter().filter(|k| txt(k, "regle") == "hors_45").collect();
    assert!(hors.len() == 1 && msg(hors[0]).starts_with("3 segments"), "{res:?}");
    assert!(txt(hors[0], "severite") == "info");
}

fn arcs() {
    // congé tangent : piste -> quart de cercle (anti-horaire) -> piste
    let pistes = || vec![piste(&[(0., 0.), (10., 0.)]), piste(&[(15., 5.), (15., 15.)])];
    let conge = j(r#"{"c": 0, "n": "S", "s": [10, 0], "e": [15, 5], "m": [10, 5], "h": 0}"#);
    assert!(ang(pistes(), vec![conge.clone()], vec![], 1.0).is_empty());
    // le même arc parcouru dans l'autre sens, déclaré horaire
    let inverse = j(r#"{"c": 0, "n": "S", "s": [15, 5], "e": [10, 0], "m": [10, 5], "h": 1}"#);
    assert!(ang(pistes(), vec![inverse], vec![], 1.0).is_empty());
    // une piste qui repart de l'arc à angle droit de sa tangente
    let res = ang(vec![piste(&[(0., 0.), (10., 0.)]), piste(&[(15., 5.), (5., 5.)])], vec![conge], vec![], 1.0);
    assert!(regles_de(&res) == ["angle_droit"], "{res:?}");
}

fn unites() {
    // fichier en pouces : un décalage de 0,5 µm (2e-5 in) reste le même point
    let res = ang(vec![piste_(&[(0., 0.), (1., 0.)], "S", 0, 0.008), piste_(&[(1.00002, 0.), (1.00002, 1.)], "S", 0, 0.008)], vec![], vec![], 25.4);
    assert!(regles_de(&res) == ["angle_droit"], "{res:?}");
}

pub fn banc() {
    println!("\nLes angles des pistes");
    T("test_coudes", coudes);
    T("test_jonctions", jonctions);
    T("test_perimetre", perimetre);
    T("test_hors_45", hors_45);
    T("test_arcs", arcs);
    T("test_unites", unites);
}
