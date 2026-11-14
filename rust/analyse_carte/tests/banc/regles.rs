//! L'empilage, l'impédance, les fentes, les coutures, le découplage, le bord, les paires, les
//! orphelins, les règles de topologie et les classes d'interface.

use crate::*;

const SIG: (&str, &str, Option<&str>) = ("Top", "signal", None);

fn pad(x: f64, y: f64) -> Json {
    obj! {"x" => x, "y" => y, "r" => 0.3, "c" => "Top"}
}

fn pad_n(x: f64, y: f64, net: &str) -> Json {
    avec(&pad(x, y), obj! {"n" => net})
}

fn percage(x: f64, y: f64, net: &str) -> Json {
    obj! {"x" => x, "y" => y, "d" => 0.3, "n" => net}
}

fn document_sans_empilage() {
    let res = doc_ok(&j(r#"{"format": "cao-analyse-carte-1", "pistes": []}"#));
    assert!(els(&res["constats"]).is_empty() && notes(&res).iter().any(|x| x.contains("empilage")), "{res:?}");
}

fn test_empilage() {
    // quatre couches classiques : rien sur les références ; la cavité 3V3 / GND de 1 mm n'est
    // qu'une info
    let res = analyser(obj! {"net_l3" => "3V3", "pistes" => vec![droite("CLK", 0.0)],
                             "natures" => j(r#"{"CLK": "Horloge", "GND": "Masse", "3V3": "Alimentation"}"#)});
    let k = de(&res, "empilage");
    assert!(k.len() == 1 && txt(&k[0], "severite") == "info" && msg(&k[0]).contains("1.00 mm"), "{k:?}");
    assert!(nul(&k[0]["x"]) && nul(&k[0]["n"]), "{k:?}");
    // deux couches sans plan : l'horloge du dessus n'a pas de référence, et les deux faces de
    // signal se regardent
    let deux = empilage_de(&[SIG, ("Bot", "signal", None)], &[1.5]);
    let k = de(&analyser(obj! {"stackup" => deux, "pistes" => vec![droite("CLK", 0.0), droite_("DATA", 5.0, 0.0, 100.0, "Bot", 0.2)],
                               "natures" => j(r#"{"CLK": "Horloge"}"#)}), "empilage");
    let a = |c: &str, s: &str| k.iter().any(|x| txt(x, "c") == c && txt(x, "severite") == s);
    assert!(a("Top", "critique") && a("Bot", "vigilance") && a("Top ↔ Bot", "vigilance"), "{k:?}");
    // un plan derrière une autre couche de signal, et un empilage dissymétrique
    let loin = empilage_de(&[SIG, ("In1", "signal", None), ("In2", "plane", Some("GND")), ("Bot", "signal", None)], &[0.2, 0.2, 0.5]);
    let k = de(&analyser(obj! {"stackup" => loin, "pistes" => vec![droite("CLK", 0.0)]}), "empilage");
    let msgs = k.iter().map(msg).collect::<Vec<_>>().join(" | ");
    assert!(msgs.contains("derrière une autre couche") && msgs.contains("dissymétrique"), "{msgs}");
}

fn impedance() {
    // une piste uniforme ne se compare qu'à elle-même : rien
    assert!(de(&analyser(obj! {"pistes" => vec![droite("DATA", 0.0)]}), "impedance").is_empty());
    // une ligne Rapide de 0,1 mm, loin des 50 Ω visés, sur 100 mm : critique
    let res = analyser(obj! {"pistes" => vec![droite_("USB", 0.0, 0.0, 100.0, "Top", 0.1)], "natures" => j(r#"{"USB": "Rapide"}"#)});
    let k = de(&res, "impedance");
    assert!(k.len() == 1 && verdicts(&k[0]) == ["critique"] && msg(&k[0]).contains("cible 50 Ω"), "{k:?}");
    assert!(n(&res["bilan"]["impedance"]["nets"]) == 1.0, "{:?}", res["bilan"]);
    // un rétrécissement de 20 mm dans une piste lente de 0,3 mm : invisible tant que le front
    // est lent -- et il le reste, un Lent cadencé à 10 MHz --, vu quand, cadencé à 100 MHz,
    // il tombe à 1 ns
    let retreci = || vec![droite_("DATA", 0.0, 0.0, 40.0, "Top", 0.3), droite_("DATA", 0.0, 40.0, 60.0, "Top", 0.1), droite_("DATA", 0.0, 60.0, 100.0, "Top", 0.3)];
    assert!(de(&analyser(obj! {"pistes" => retreci()}), "impedance").is_empty());
    let k = de(&analyser(obj! {"pistes" => retreci(), "reglages" => j(r#"{"cadences": {"Lent": 1e8}}"#)}), "impedance");
    assert!(k.len() == 1 && verdicts(&k[0]) != ["ok"], "{k:?}");
    assert!(msg(&k[0]).contains('–'), "{}", msg(&k[0]));
}

fn fentes() {
    let plan = |trous: Vec<Json>| obj! {"c" => "L2", "n" => "GND", "o" => carre(-10.0, -20.0, 110.0, 20.0), "t" => trous};
    let carte = |plans: Vec<Json>| analyser(obj! {"plans" => plans, "pistes" => vec![droite("CLK", 0.0)], "natures" => j(r#"{"CLK": "Rapide", "GND": "Masse"}"#),
                                                  "pastilles" => j(r#"[{"x": 60, "y": 0, "r": 0.3, "n": "CLK"}]"#)});
    let k = de(&carte(vec![plan(vec![carre(40.0, -15.0, 42.0, 15.0), rond(60.0, 0.0, 0.5), rond(70.0, 0.3, 0.4)])]), "fente");
    // la fente de 30 mm ; ni le dégagement du via du net, ni celui d'un autre via frôlé ne
    // comptent
    assert!(k.len() == 1 && txt(&k[0], "severite") == "critique" && 40.0 < n(&k[0]["x"]) && n(&k[0]["x"]) < 42.0, "{k:?}");
    let d: Vec<f64> = msg(&k[0]).split("contourne à ").nth(1).unwrap().split(" mm").next().unwrap().split(" / ").map(|v| v.parse().unwrap()).collect();
    assert!(msg(&k[0]).contains("Plan L2") && 14.5 < d[0] && d[0] < 15.5 && 14.5 < d[1] && d[1] < 15.5, "{}", msg(&k[0]));
    let res = carte(vec![plan(vec![])]);
    assert!(de(&res, "fente").is_empty() && n(&res["bilan"]["fente"]["franchissements"]) == 0.0, "{:?}", res["bilan"]);
    // un plan coupé de bord à bord se plafonne à 30 mm et le dit
    let coupe = vec![obj! {"c" => "L2", "n" => "GND", "o" => carre(-10.0, -20.0, 40.0, 20.0)}, obj! {"c" => "L2", "n" => "GND", "o" => carre(42.0, -20.0, 110.0, 20.0)}];
    let k = de(&carte(coupe), "fente");
    assert!(!k.is_empty() && msg(&k[0]).contains("bord à l'autre"), "{k:?}");
}

fn deux_plans(net_l3: &str) -> Vec<Json> {
    vec![obj! {"c" => "L2", "n" => "GND", "o" => carre(0.0, 0.0, 50.0, 50.0)}, obj! {"c" => "L3", "n" => net_l3, "o" => carre(0.0, 0.0, 50.0, 50.0)}]
}

fn coutures() {
    let carte = |percages: Vec<Json>| analyser(obj! {"plans" => deux_plans("GND"), "pistes" => vec![droite("CLK", 60.0)],
                                                     "natures" => j(r#"{"CLK": "Rapide", "GND": "Masse"}"#), "percages" => percages});
    let coins: Vec<Json> = [0.5, 49.5].iter().flat_map(|x| [0.5, 49.5].map(|y| percage(*x, y, "GND"))).collect();
    let k = de(&carte(coins), "couture");
    assert!(k.len() == 1 && txt(&k[0], "severite") == "critique" && txt(&k[0], "c") == "L2 ↔ L3", "{k:?}");
    assert!((n(&k[0]["x"]) - 25.0).abs() < 1.0 && (n(&k[0]["y"]) - 25.0).abs() < 1.0, "{k:?}");
    // une maille de 5 mm tient 1 ns
    let maille: Vec<Json> = (0..50).step_by(5).flat_map(|x| (0..50).step_by(5).map(move |y| percage(x as f64 + 2.5, y as f64 + 2.5, "GND"))).collect();
    let res = carte(maille);
    assert!(de(&res, "couture").is_empty() && n(&res["bilan"]["couture"]["cavites"]) == 1.0, "{:?}", res["bilan"]);
    // sans aucun via : critique ; un via d'un autre net ne coud rien
    let k = de(&carte(vec![j(r#"{"x": 25, "y": 25, "d": 0.3, "n": "CLK"}"#)]), "couture");
    assert!(!k.is_empty() && msg(&k[0]).contains("Aucun via"), "{k:?}");
}

fn decouplage() {
    let natures = || j(r#"{"VCC": "Alimentation", "GND": "Masse", "CLK": "Rapide"}"#);
    let u1 = || j(r#"{"ref": "U1", "c": "Top", "broches": [{"x": 0, "y": 0, "n": "VCC", "pin": "1"}, {"x": 1, "y": 0, "n": "GND", "pin": "2"},
                                                        {"x": 2, "y": 0, "n": "CLK", "pin": "3"}]}"#);
    let capa = |x: f64, repere: &str, autre: &str| obj! {"ref" => repere, "c" => "Top", "broches" => vec![obj! {"x" => x, "y" => 0i64, "n" => "VCC"},
                                                                                                    obj! {"x" => x + 1.0, "y" => 0i64, "n" => autre}]};
    let carte = |comps: Vec<Json>, pistes: Vec<Json>| de(&analyser(obj! {"composants" => comps, "pistes" => pistes, "natures" => natures()}), "decouplage");
    assert!(carte(vec![u1(), capa(2.0, "C1", "GND")], vec![]).is_empty());
    // à 15 mm : hors du rayon de λ/40 au genou de 350 MHz (≈ 10 mm)
    let k = carte(vec![u1(), capa(15.0, "C1", "GND")], vec![]);
    assert!(k.len() == 1 && verdicts(&k[0]) == ["vigilance"] && msg(&k[0]).contains("C1"), "{k:?}");
    assert!(txt(&k[0], "n") == "VCC" && msg(&k[0]).contains("tient des fronts"), "{k:?}");
    // un condensateur qui ne va pas à la masse ne découple pas
    let k = carte(vec![u1(), capa(2.0, "C1", "CLK")], vec![]);
    assert!(!k.is_empty() && txt(&k[0], "severite") == "critique" && msg(&k[0]).contains("aucun"), "{k:?}");
    // LE CHEMIN RÉEL : à 2 mm à vol d'oiseau, mais la piste du rail fait un détour de 30 mm
    // -- c'est elle qui compte
    let detour = vec![j(r#"{"c": "Top", "n": "VCC", "w": 0.2, "p": [0, 0, 0, 15, 2, 15, 2, 0]}"#)];
    let k = carte(vec![u1(), capa(2.0, "C1", "GND")], detour);
    assert!(!k.is_empty() && msg(&k[0]).contains("32.0 mm par la piste (2.0 à vol d'oiseau)"), "{k:?}");
    // LA VALEUR : un 10 µF tout près résonne vers 1 MHz, trop bas pour un circuit Rapide
    // (genou 350 MHz) ; un 10 nF au même endroit tient
    let gros = |val: &str| avec(&capa(2.0, "C1", "GND"), obj! {"val" => val, "pkg" => "0805"});
    let k = carte(vec![u1(), gros("10uF")], vec![]);
    assert!(!k.is_empty() && txt(&k[0], "severite") == "vigilance" && msg(&k[0]).contains("résonance à"), "{k:?}");
    assert!(els(&k[0]["frequences"]).iter().all(|f| n(&f["f_res"]) < 3e6), "{:?}", k[0]["frequences"]);
    let petit = avec(&capa(2.0, "C1", "GND"), obj! {"val" => "10nF", "pkg" => "0402"});
    assert!(carte(vec![u1(), petit], vec![]).is_empty());
    // le 10 µF tout près ET un 10 nF à 3 mm : le 10 nF découple, plus rien
    let petit3 = avec(&capa(3.0, "C2", "GND"), obj! {"val" => "10nF", "pkg" => "0402"});
    assert!(carte(vec![u1(), gros("10uF"), petit3], vec![]).is_empty());
    // « μ » grec (U+03BC) et sa majuscule valent « µ » (U+00B5) : plus de KeyError
    for val in ["10µF", "10\u{03bc}F", "10\u{039c}F"] {
        let k = carte(vec![u1(), gros(val)], vec![]);
        assert!(!k.is_empty() && msg(&k[0]).contains("résonance à"), "{val} {k:?}");
    }
}

fn bord() {
    let contour = || obj! {"o" => carre(0.0, 0.0, 50.0, 50.0)};
    let carte = |y: f64, reglages: Json| de(&analyser(obj! {"contour" => contour(), "pistes" => vec![droite_("DATA", y, 10.0, 40.0, "Top", 0.2)], "reglages" => reglages}), "bord");
    let k = carte(0.2, obj! {});
    let (fab, cem): (Vec<&Json>, Vec<&Json>) = k.iter().partition(|x| els(&x["frequences"]).is_empty());
    assert!(fab.len() == 1 && txt(fab[0], "severite") == "critique" && msg(fab[0]).contains("0.10 mm"), "{k:?}");
    assert!(cem.is_empty(), "{cem:?}"); // un Lent cadencé à 10 MHz ne rayonne pas ici
    let vite = carte(0.2, j(r#"{"cadences": {"Lent": 1e8}}"#));
    let cem: Vec<&Json> = vite.iter().filter(|x| !els(&x["frequences"]).is_empty()).collect();
    assert!(cem.len() == 1 && verdicts(cem[0]) == ["vigilance"], "{cem:?}");
    assert!(n(&cem[0]["frequences"][0]["f"]) == 1e8, "{cem:?}");
    assert!(carte(25.0, obj! {}).is_empty());
    // la règle des 20 H : 3V3 aussi grand que la masse
    let k = de(&analyser(obj! {"contour" => contour(), "plans" => deux_plans("3V3"), "net_l3" => "3V3",
                               "natures" => j(r#"{"GND": "Masse", "3V3": "Alimentation"}"#)}), "bord");
    assert!(k.len() == 1 && txt(&k[0], "severite") == "info" && msg(&k[0]).contains("20 H"), "{k:?}");
    assert!(notes(&analyser(obj! {})).iter().any(|x| x.contains("contour")));
}

fn test_paires() {
    let (p, q) = (droite_("USB_P", 0.0, 0.0, 50.0, "Top", 0.2), droite_("USB_N", 0.4, 0.0, 50.0, "Top", 0.2));
    let carte = |pistes: Vec<Json>, champs: Json| de(&analyser(avec(&obj! {"pistes" => pistes, "paires" => j(r#"[["USB_P", "USB_N"]]"#)}, champs)), "paire");
    let rf = || j(r#"{"USB_P": "RF", "USB_N": "RF"}"#);
    let pn = || vec![p.clone(), q.clone()];
    let k = carte(pn(), obj! {"natures" => rf(), "reglages" => j(r#"{"zdiff": 50}"#)});
    let zd = nombre_apres(msg(&k[0]), "Z_diff ", " ");
    assert!(80.0 < zd && zd < 120.0, "{zd}");
    let cible = || obj! {"zdiff" => zd};
    // la cible réglée sur la Z_diff de la paire : plus rien à dire
    assert!(carte(pn(), obj! {"reglages" => cible()}).is_empty(), "{zd}");
    // 5 mm de plus sur N : 30 ps d'écart, rien pour 1 ns, critique pour 0,1 ns
    let long_ = || vec![p.clone(), q.clone(), droite_("USB_N", 0.4, 50.0, 55.0, "Top", 0.2)];
    let ok = carte(long_(), obj! {"reglages" => cible(), "natures" => j(r#"{"USB_P": "Rapide", "USB_N": "Rapide"}"#)});
    let k = carte(long_(), obj! {"reglages" => cible(), "natures" => rf()});
    assert!(ok.is_empty() && !k.is_empty() && txt(&k[0], "severite") == "critique", "{ok:?} {k:?}");
    assert!(n(&k[0]["frequences"][0]["skew"]) > 0.2 && msg(&k[0]).contains("5.00 mm"), "{k:?}");
    // deux vias sur P, aucun sur N
    let k = carte(pn(), obj! {"reglages" => cible(), "percages" => j(r#"[{"x": 0, "y": 0, "d": 0.3, "n": "USB_P"}, {"x": 50, "y": 0, "d": 0.3, "n": "USB_P"}]"#)});
    assert!(!k.is_empty() && txt(&k[0], "severite") == "vigilance" && msg(&k[0]).contains("2 via(s)"), "{k:?}");
    // LA MASSE COPLANAIRE qui borde la paire fait baisser Z_diff (0,1 mm de chaque côté :
    // 104 → 96 Ω)
    let l2 = obj! {"c" => "L2", "n" => "GND", "o" => carre(-5.0, -5.0, 60.0, 5.0)};
    let cop = obj! {"c" => "Top", "n" => "GND", "o" => carre(-5.0, -5.0, 60.0, 5.0), "t" => vec![carre(-1.0, -0.2, 51.0, 0.6)]};
    let nat = || j(r#"{"USB_P": "Rapide", "USB_N": "Rapide", "GND": "Masse"}"#);
    let k = carte(pn(), obj! {"natures" => nat(), "plans" => vec![l2, cop], "reglages" => j(r#"{"zdiff": 200}"#)});
    let zc = nombre_apres(msg(&k[0]), "Z_diff ", " ");
    assert!(zc < zd - 5.0, "{zc} {zd}");
    // LE PLAN SOUS UNE SEULE MOITIÉ : L2 évidé sous N seulement, sur 20 mm
    let trou = obj! {"c" => "L2", "n" => "GND", "o" => carre(-5.0, -5.0, 60.0, 5.0), "t" => vec![carre(10.0, 0.25, 30.0, 2.0)]};
    let k = carte(pn(), obj! {"natures" => nat(), "plans" => vec![trou], "reglages" => cible()});
    assert!(!k.is_empty() && msg(&k[0]).contains("sous une seule moitié sur 20"), "{k:?}");
    assert!(n(&k[0]["frequences"][0]["plan_bancal"]) > 0.1, "{:?}", k[0]["frequences"]);
}

fn orphelins() {
    let s = |y: f64, x1: f64, x2: f64| droite_("S", y, x1, x2, "Top", 0.2);
    // une antenne : 10 mm depuis une pastille, vers rien
    let res = analyser(obj! {"pistes" => vec![s(0.0, 0.0, 10.0)], "pastilles" => vec![pad(0.0, 0.0)]});
    let k = de(&res, "orphelin");
    assert!(k.len() == 1 && msg(&k[0]).contains("antenne") && n(&k[0]["x"]) == 10.0, "{k:?}");
    // sévérité de base « bout libre » ; un Lent cadencé à 10 MHz garde ses 10 ns
    assert!(verdicts(&k[0]) == ["ok"] && txt(&k[0], "severite") == "vigilance", "{k:?}");
    assert!(n(&k[0]["frequences"][0]["f"]) == 1e7 && n(&k[0]["frequences"][0]["tr"]) == 1e-8, "{k:?}");
    // une piste reliée à rien : critique, une seule fois
    let k = de(&analyser(obj! {"pistes" => vec![s(0.0, 20.0, 30.0)]}), "orphelin");
    assert!(k.len() == 1 && txt(&k[0], "severite") == "critique" && msg(&k[0]).contains("isolée"), "{k:?}");
    // le dépassement de 0,2 mm après un coin (P01x290) : le T tombe sur le corps
    let pistes = vec![s(5.0, 0.0, 10.2), j(r#"{"c": "Top", "n": "S", "w": 0.2, "p": [10, 5, 10, 15]}"#)];
    let k = de(&analyser(obj! {"pistes" => pistes, "pastilles" => vec![pad(0.0, 5.0), pad(10.0, 15.0)]}), "orphelin");
    assert!(k.len() == 1 && msg(&k[0]).contains("Dépassement de 0.20 mm"), "{k:?}");
    // une piste qui entre dans le versement de son net est reliée
    let plan = obj! {"c" => "Top", "n" => "GND", "o" => carre(8.0, -5.0, 20.0, 5.0)};
    assert!(de(&analyser(obj! {"pistes" => vec![droite_("GND", 0.0, 0.0, 10.0, "Top", 0.2)], "pastilles" => vec![pad(0.0, 0.0)], "plans" => vec![plan]}),
               "orphelin").is_empty());
    // bien reliée aux deux bouts : rien
    assert!(de(&analyser(obj! {"pistes" => vec![s(0.0, 0.0, 10.0)], "pastilles" => vec![pad(0.0, 0.0), pad(10.0, 0.0)]}), "orphelin").is_empty());
}

fn nouvelles_regles() {
    // MOIGNON DE VIA : percé de Top à Bot, emprunté de Top à In3 -- In3 → Bot pend
    let st = empilage_de(&[SIG, ("L2", "plane", Some("GND")), ("In3", "signal", None), ("Bot", "signal", None)], &[0.8]);
    let doc = obj! {"format" => "cao-analyse-carte-1", "unite_mm" => 1i64, "stackup" => st,
                    "pistes" => vec![droite_("CLK", 10.0, 0.0, 10.0, "Top", 0.2), droite_("CLK", 10.0, 10.0, 20.0, "In3", 0.2)],
                    "natures" => j(r#"{"CLK": "RF"}"#), "reglages" => j(r#"{"tr": {"RF": 3e-11}}"#)};
    let moignon = |champs: Json| de(&doc_ok(&avec(&doc, champs)), "moignon_via");
    let k = moignon(obj! {"percages" => j(r#"[{"x": 10, "y": 10, "d": 0.3, "n": "CLK"}]"#)});
    assert!(!k.is_empty() && msg(&k[0]).contains("In3 → Bot") && msg(&k[0]).contains("supposé traversant"), "{k:?}");
    // percé seulement de Top à In3 (via borgne) : plus de moignon
    let k = moignon(obj! {"percages" => j(r#"[{"x": 10, "y": 10, "d": 0.3, "n": "CLK", "de": "Top", "a": "In3"}]"#)});
    assert!(k.is_empty(), "{k:?}");
    // percé de Top à Bot mais CONTRE-PERCÉ par-dessous jusque sous In3 : il ne reste que le
    // moignon résiduel, sous λ/20
    let perce = j(r#"{"x": 10, "y": 10, "d": 0.3, "n": "CLK", "de": "Top", "a": "Bot"}"#);
    let contre = |garde: &str, res: f64| moignon(obj! {"percages" => vec![avec(&perce, obj! {"cp" => obj! {"cote" => "dessous", "garde" => garde, "res" => res}})]});
    let k = contre("In3", 0.1);
    assert!(k.is_empty(), "{k:?}");
    // un contre-perçage qui couperait In3 (garder L2) ne retire rien ; sans lui, le constat
    // est celui d'avant, au caractère près
    let k0 = moignon(obj! {"percages" => vec![perce.clone()]});
    let k = contre("L2", 0.1);
    assert!(!k0.is_empty() && k == k0, "{k0:?} {k:?}");
    // un résiduel de 2 mm (plus que le moignon) ne l'allonge pas
    let k = contre("In3", 2.0);
    assert!(!k.is_empty() && msg(&k[0]).split(" mm").next() == msg(&k0[0]).split(" mm").next() && msg(&k[0]).contains("contre-percé"), "{k0:?} {k:?}");
    // une broche traversante n'est pas un via de routage
    let k = moignon(obj! {"composants" => j(r#"[{"ref": "J1", "c": "Top", "broches": [{"x": 10, "y": 10, "n": "CLK", "pin": "1"}]}]"#),
                          "percages" => j(r#"[{"x": 10, "y": 10, "d": 0.8, "n": "CLK"}]"#)});
    assert!(k.is_empty(), "{k:?}");

    // BRANCHE EN T : un tronc de 40 mm, une dérivation de 15 mm vers une charge
    let t = j(r#"[{"c": "Top", "n": "CLK", "w": 0.2, "p": [0, 0, 20, 0]}, {"c": "Top", "n": "CLK", "w": 0.2, "p": [20, 0, 40, 0]},
                  {"c": "Top", "n": "CLK", "w": 0.2, "p": [20, 0, 20, 15]}]"#);
    let pads = vec![pad_n(0.0, 0.0, "CLK"), pad_n(40.0, 0.0, "CLK"), pad_n(20.0, 15.0, "CLK")];
    let branche = |pistes: Json, pastilles: &[Json]| de(&analyser(obj! {"pistes" => pistes, "pastilles" => pastilles, "natures" => j(r#"{"CLK": "Rapide"}"#)}), "branche");
    let k = branche(t.clone(), &pads);
    assert!(!k.is_empty() && txt(&k[0], "severite") == "critique" && msg(&k[0]).contains("15.0 mm"), "{k:?}");
    assert!((n(&k[0]["x"]) - 20.0).abs() < 0.1 && n(&k[0]["y"]).abs() < 0.1, "{k:?}");
    // le T posé AU MILIEU d'un segment (le tronc d'un seul tenant) est vu aussi
    let t2 = j(r#"[{"c": "Top", "n": "CLK", "w": 0.2, "p": [0, 0, 40, 0]}, {"c": "Top", "n": "CLK", "w": 0.2, "p": [20, 0, 20, 15]}]"#);
    assert!(!branche(t2, &pads).is_empty());
    // une chaîne sans T : rien
    assert!(branche(els(&t)[..2].j(), &pads[..2]).is_empty());

    // QUARTZ : 30 mm de piste vers l'oscillateur, et une piste qui passe dessous
    let y1 = j(r#"{"ref": "Y1", "c": "Top", "val": "16MHz", "broches": [{"x": 0, "y": 0, "n": "XI", "pin": "1"}, {"x": 3, "y": 0, "n": "XO", "pin": "2"}]}"#);
    let q = || j(r#"[{"c": "Top", "n": "XI", "w": 0.2, "p": [0, 0, 0, 30]}, {"c": "Top", "n": "XO", "w": 0.2, "p": [3, 0, 3, 4]},
                     {"c": "Bot", "n": "DATA", "w": 0.2, "p": [1.5, -10, 1.5, 10]}]"#);
    let k = de(&analyser(obj! {"composants" => vec![y1.clone()], "pistes" => q()}), "quartz");
    assert!(k.iter().any(|x| txt(x, "severite") == "critique" && msg(x).contains("30.0 mm")), "{k:?}");
    assert!(k.iter().any(|x| msg(x).contains("DATA") && msg(x).contains("sous le quartz")), "{k:?}");
    // un filtre SAW à 868 MHz n'est pas un quartz
    let flt = avec(&y1, obj! {"ref" => "FLT1", "val" => "868MHz"});
    assert!(de(&analyser(obj! {"composants" => vec![flt], "pistes" => q()}), "quartz").is_empty());

    // ESD : J1 protégé sur D+ seulement (vigilance), J2 jamais protégé (info)
    let comps = j(r#"[{"ref": "J1", "c": "Top", "broches": [{"x": 0, "y": 0, "n": "DP", "pin": "1"}, {"x": 1, "y": 0, "n": "DN", "pin": "2"},
                                                           {"x": 2, "y": 0, "n": "GND", "pin": "3"}]},
                      {"ref": "U2", "c": "Top", "val": "USBLC6-2", "broches": [{"x": 3, "y": 0, "n": "DP", "pin": "1"}, {"x": 4, "y": 0, "n": "GND", "pin": "2"}]},
                      {"ref": "J2", "c": "Top", "broches": [{"x": 50, "y": 0, "n": "SWD", "pin": "1"}, {"x": 51, "y": 0, "n": "GND", "pin": "2"}]}]"#);
    let k = de(&analyser(obj! {"composants" => comps, "natures" => j(r#"{"GND": "Masse"}"#)}), "esd");
    let de_ref = |r: &str| k.iter().find(|x| msg(x).split(" :").next() == Some(r)).unwrap_or_else(|| panic!("{r} absent de {k:?}"));
    let (j1, j2) = (de_ref("J1"), de_ref("J2"));
    assert!(txt(j1, "severite") == "vigilance" && msg(j1).contains("DN"), "{k:?}");
    assert!(!msg(j1).split("sur ").nth(1).unwrap().contains("DP"), "{k:?}");
    assert!(txt(j2, "severite") == "info" && msg(j2).contains("interne"), "{k:?}");

    // COURANT : un étranglement de 0,2 mm sur un rail tiré à 1 mm ; avec 2 A annoncés,
    // critique (la piste tient ~0,74 A à +10 °C)
    let rail = || j(r#"[{"c": "Top", "n": "VCC", "w": 1.0, "p": [0, 0, 30, 0]}, {"c": "Top", "n": "VCC", "w": 0.2, "p": [30, 0, 32, 0]}]"#);
    let courant = |champs: Json| analyser(avec(&obj! {"pistes" => rail(), "natures" => j(r#"{"VCC": "Alimentation"}"#)}, champs));
    let k = de(&courant(obj! {}), "courant");
    assert!(!k.is_empty() && msg(&k[0]).contains("Étranglement") && txt(&k[0], "severite") == "info", "{k:?}");
    let k = de(&courant(j(r#"{"courants": {"VCC": 2.0}}"#)), "courant");
    assert!(!k.is_empty() && txt(&k[0], "severite") == "critique" && msg(&k[0]).contains("2.00 A"), "{k:?}");
    let ok = courant(j(r#"{"courants": {"VCC": 0.3, "AILLEURS": 1.0}}"#));
    assert!(de(&ok, "courant").is_empty(), "{:?}", de(&ok, "courant"));
    // le courant jugé se dit, même sans constat ; sans courant, rien de neuf
    assert!(ok["bilan"]["courant"] == j(r#"{"rails": 1, "courants_donnes": 1}"#), "{:?}", ok["bilan"]);
    assert!(courant(obj! {})["bilan"]["courant"] == j(r#"{"rails": 1}"#));

    // CLÔTURE DE VIAS LE LONG DU BORD : des vias au centre seulement
    let centre: Vec<Json> = (15..40).step_by(5).flat_map(|x| (15..40).step_by(5).map(move |y| percage(x as f64, y as f64, "GND"))).collect();
    let cloture = |percages: Vec<Json>| -> Vec<Json> {
        de(&analyser(obj! {"plans" => deux_plans("GND"), "pistes" => vec![droite_("CLK", 25.0, 5.0, 45.0, "Top", 0.2)],
                           "natures" => j(r#"{"CLK": "Rapide", "GND": "Masse"}"#), "percages" => percages,
                           "contour" => obj! {"o" => carre(0.0, 0.0, 50.0, 50.0)}}), "bord").into_iter().filter(|x| msg(x).contains("Clôture")).collect()
    };
    let k = cloture(centre.clone());
    assert!(!k.is_empty() && txt(&k[0], "severite") == "critique", "{k:?}");
    // une rangée tous les 2 mm le long du bord : plus rien à dire
    let mut tous = centre;
    for v in (1..50).step_by(2) {
        for w in [1.0, 49.0] {
            tous.push(percage(v as f64, w, "GND"));
            tous.push(percage(w, v as f64, "GND"));
        }
    }
    let k = cloture(tous);
    assert!(k.is_empty(), "{k:?}");
}

fn classes_d_interface() {
    let rapport = |champs: Json| {
        let mut r = analyser(champs);
        oter(&mut r, "durees_s");
        dumps(&r)
    };
    // SANS NET D'INTERFACE, LE RAPPORT D'AVANT À L'OCTET PRÈS, même quand la page envoie les
    // fronts, cadences et cibles des interfaces
    let base = || obj! {"vias" => vec![via("CLK", obj! {"retour_hors_rayon_mm" => 30.0})], "pistes" => vec![droite("CLK", 0.0)], "natures" => j(r#"{"CLK": "Rapide"}"#)};
    assert!(rapport(base()) == rapport(avec(&base(), obj! {"reglages" => j(r#"{"tr": {"USB HS": 5e-10}, "cadences": {"USB HS": 2e8},
                                                                               "z0_classes": {"ETH 100": 50.0}, "zdiff_classes": {"USB HS": 90.0}}"#)})));
    // ETH 100 (3 ns) : son via à 30 mm tient, là où « Rapide » (1 ns) le condamne
    let eth = |classe: &str, reglages: Json| analyser(obj! {"vias" => vec![via("CLK", obj! {"retour_hors_rayon_mm" => 30.0})], "natures" => obj! {"CLK" => classe},
                                                            "reglages" => reglages});
    assert!(!de(&eth("Rapide", obj! {}), "retour").is_empty());
    let res = eth("ETH 100", obj! {});
    assert!(de(&res, "retour").is_empty(), "{:?}", de(&res, "retour"));
    // le rapport dit sous quoi la classe est jugée : une carte ancienne a pu appeler une
    // classe « ETH 100 » sans penser à l'interface
    assert!(notes(&res).join(" ").contains("Classe « ETH 100 » jugée comme l'interface Ethernet 100BASE-TX : famille Rapide, front 3 ns, Z_diff 100 Ω."),
            "{:?}", res["notes"]);
    assert!(!notes(&eth("Rapide", obj! {})).iter().any(|x| x.contains("jugée comme l'interface")));
    assert!(n(&res["reglages"]["tr"]["ETH 100"]) == 3e-9, "{:?}", res["reglages"]["tr"]);
    assert!(!contient(&res["reglages"]["tr"], "USB HS"), "{:?}", res["reglages"]["tr"]);
    // le panneau passe devant la table : ETH 100 réglé à 0,1 ns est condamné
    assert!(!de(&eth("ETH 100", j(r#"{"tr": {"ETH 100": 1e-10}}"#)), "retour").is_empty());
    // USB HS est jugé à son front de norme (500 ps) et compte comme rapide
    let k = de(&eth("USB HS", obj! {}), "retour");
    assert!(!k.is_empty() && (n(&k[0]["frequences"][0]["tr"]) - 5e-10).abs() < 1e-15, "{k:?}");
    let deux = empilage_de(&[SIG, ("Bot", "signal", None)], &[1.5]);
    let k = de(&analyser(obj! {"stackup" => deux, "pistes" => vec![droite("D", 0.0)], "natures" => j(r#"{"D": "USB HS"}"#)}), "empilage");
    assert!(k.iter().any(|x| txt(x, "c") == "Top" && msg(x).contains("dont 1 rapide (D)")), "{k:?}");
    // PAS DE Z₀ DE BRIN : un ETH 100 à 0,1 mm ne se compare qu'à lui-même, sauf si le panneau
    // lui donne une cible
    let fin = |reglages: Json| de(&analyser(obj! {"pistes" => vec![droite_("ETH", 0.0, 0.0, 100.0, "Top", 0.1)], "natures" => j(r#"{"ETH": "ETH 100"}"#),
                                                  "reglages" => reglages}), "impedance");
    assert!(fin(obj! {}).is_empty());
    let k = fin(j(r#"{"z0_classes": {"ETH 100": 50.0}}"#));
    assert!(!k.is_empty() && msg(&k[0]).contains("cible 50 Ω"), "{k:?}");
    // CAN compte comme Lent : un rail automatique classé CAN est montré
    let res = analyser(obj! {"composants" => crate::retours::rail_automatique(), "natures" => j(r#"{"SIGN8": "CAN", "GND": "Masse"}"#)});
    assert!(notes(&res).iter().any(|x| x.contains("U3.8 (SIGN8)")), "{:?}", res["notes"]);
    // Z_DIFF PAR CLASSE : deux paires de 84 Ω sur la même carte (entraxe 0,30 mm, 300 mm :
    // assez long pour que le front de 3 ns les voie). L'USB tient sa cible de 90 Ω
    // (|Γ| ≈ 0,034), l'Ethernet est signalé face à 100 Ω (|Γ| ≈ 0,087) : chacun loin du seuil
    // de 0,05
    let l = |net: &str, y: f64| droite_(net, y, 0.0, 300.0, "Top", 0.2);
    let paires = |reglages: Json| analyser(obj! {"pistes" => vec![l("U_P", 0.0), l("U_N", 0.30), l("E_P", 10.0), l("E_N", 10.30)],
                                                 "paires" => j(r#"[["U_P", "U_N"], ["E_P", "E_N"]]"#),
                                                 "natures" => j(r#"{"U_P": "USB HS", "U_N": "USB HS", "E_P": "ETH 100", "E_N": "ETH 100"}"#), "reglages" => reglages});
    let res = paires(obj! {});
    let k = de(&res, "paire");
    assert!(k.len() == 1 && txt(&k[0], "n") == "E_P" && msg(&k[0]).contains("cible 100 Ω"), "{k:?}");
    assert!(res["reglages"]["zdiff_classes"] == j(r#"{"USB HS": 90.0, "ETH 100": 100.0}"#), "{:?}", res["reglages"]);
    // le panneau passe devant la norme
    assert!(de(&paires(j(r#"{"zdiff_classes": {"ETH 100": 90.0}}"#)), "paire").is_empty());
    // un brin reclassé à la main, l'autre resté Lent : la cible est celle de l'interface,
    // quel que soit l'ordre de la paire
    for nat in [r#"{"U_P": "Lent", "U_N": "USB HS"}"#, r#"{"U_P": "USB HS", "U_N": "Lent"}"#] {
        let k = de(&analyser(obj! {"pistes" => vec![l("U_P", 0.0), l("U_N", 0.30)], "paires" => j(r#"[["U_P", "U_N"]]"#), "natures" => j(nat)}), "paire");
        assert!(k.is_empty(), "{nat} {k:?}");
    }
    // une interface portée par un net forcé ailleurs (nœud de découpage) n'entre pas dans les
    // réglages
    let r = analyser(obj! {"natures" => j(r#"{"SW": "USB HS"}"#), "bruyants" => vec!["SW"]})["reglages"].clone();
    assert!(!contient(&r["tr"], "USB HS") && !contient(&r, "zdiff_classes"), "{r:?}");
    // UN DOCUMENT FORGÉ : une table en liste est refusée (pas une erreur 500), une valeur
    // infinie est ignorée (pas un verdict NaN en silence)
    for cle in ["tr", "cadences", "z0_classes", "porteuses", "zdiff_classes"] {
        match analyser_r(obj! {"reglages" => obj! {cle => vec![90i64]}}) {
            Err(e) => assert!(!e.interne && e.message.contains(cle), "{e:?}"),
            Ok(_) => panic!("{cle}"),
        }
    }
    let r = analyser(obj! {"natures" => j(r#"{"P": "USB HS"}"#), "reglages" => j(r#"{"zdiff_classes": {"USB HS": "inf"}, "tr": {"Lent": "inf"}}"#)})["reglages"].clone();
    assert!(r["zdiff_classes"] == j(r#"{"USB HS": 90.0}"#) && n(&r["tr"]["Lent"]) == 1e-8, "{r:?}");
}

pub fn banc() {
    println!("\nLes règles électriques");
    T("test_document_sans_empilage", document_sans_empilage);
    T("test_empilage", test_empilage);
    T("test_impedance", impedance);
    T("test_fentes", fentes);
    T("test_coutures", coutures);
    T("test_decouplage", decouplage);
    T("test_bord", bord);
    T("test_paires", test_paires);
    T("test_orphelins", orphelins);
    T("test_nouvelles_regles", nouvelles_regles);
    T("test_classes_d_interface", classes_d_interface);
}
