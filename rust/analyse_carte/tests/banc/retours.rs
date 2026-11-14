//! Le chemin de retour des vias (test_retour_*), les cibles par classe et par net, les
//! antennes et les porteuses.

use crate::*;

fn hors_rayon(d: f64) -> Json {
    via("CLK", obj! {"retour_hors_rayon_mm" => d})
}

fn retour_meme_masse() {
    // un via de masse à 0,8 mm : la boucle est courte, rien à dire
    let res = analyser(obj! {"vias" => vec![via("CLK", obj! {"retours" => vec![masse(10.8)]})], "natures" => j(r#"{"CLK": "Rapide"}"#)});
    assert!(de(&res, "retour").is_empty(), "{:?}", res["constats"]);
    assert!(res["bilan"]["retour"] == j(r#"{"vias": 1, "plan_change": 1}"#), "{:?}", res["bilan"]);
    // aucun via dans le rayon, le plus proche à 30 mm. Un Lent (10 ns) tient (λ/20 = 207 mm
    // au genou de 35 MHz) : sa cadence de 10 MHz (CADENCES) laisse son front à 10 ns
    let res = analyser(obj! {"vias" => vec![hors_rayon(30.0)], "natures" => j(r#"{"CLK": "Lent"}"#)});
    assert!(de(&res, "retour").is_empty(), "{:?}", de(&res, "retour"));
    assert!(n(&res["reglages"]["cadences"]["Lent"]) == 1e7, "{:?}", res["reglages"]);
    // cadencé à 100 MHz, son front tombe à 1 ns, genou 350 MHz, λ/20 = 21 mm : la boucle est
    // trop grande. Une seule colonne, à la cadence de la classe
    let res = analyser(obj! {"vias" => vec![hors_rayon(30.0)], "natures" => j(r#"{"CLK": "Lent"}"#), "reglages" => j(r#"{"cadences": {"Lent": 1e8}}"#)});
    let k = de(&res, "retour");
    assert!(k.len() == 1 && verdicts(&k[0]) == ["vigilance"], "{k:?}");
    let f = els(&k[0]["frequences"]);
    assert!(f.len() == 1 && n(&f[0]["f"]) == 1e8 && round(n(&f[0]["tr"]) * 1e9, 3) == 1.0);
    let d = n(&f[0]["d_sur_lambda20"]);
    assert!(1.0 < d && d < 2.0, "{f:?}");
    assert!(msg(&k[0]).contains("30.00 mm") && msg(&k[0]).contains("plus lent que"), "{}", msg(&k[0]));
    assert!(msg(&k[0]).contains("un via de GND plus près"), "{}", msg(&k[0]));
    // un front RF de 0,1 ns (genou 3,5 GHz, λ/20 ≈ 2 mm) condamne
    let k = de(&analyser(obj! {"vias" => vec![hors_rayon(30.0)], "natures" => j(r#"{"CLK": "RF"}"#)}), "retour");
    assert!(verdicts(&k[0]) == ["critique"], "{k:?}");
    // le front de la classe se règle dans le document
    let k = de(&analyser(obj! {"vias" => vec![hors_rayon(30.0)], "natures" => j(r#"{"CLK": "Lent"}"#), "reglages" => j(r#"{"tr": {"Lent": 0.1e-9}}"#)}), "retour");
    assert!(!k.is_empty() && txt(&k[0], "severite") == "critique", "{k:?}");
    // aucun via de masse du tout : rien ne referme, critique sans chiffre
    let k = de(&analyser(obj! {"vias" => vec![via("CLK", obj! {})]}), "retour");
    assert!(k.len() == 1 && txt(&k[0], "severite") == "critique" && msg(&k[0]).contains("aucun via"), "{k:?}");
    // un via de masse ne rattrape pas un plan qui n'existe pas au droit du via
    let k = de(&analyser(obj! {"vias" => vec![via("CLK", obj! {"retours" => vec![masse(10.8)], "plans_sans_cuivre" => vec!["L3"]})]}), "retour");
    assert!(k.len() == 1 && txt(&k[0], "severite") == "critique" && msg(&k[0]).contains("pas de cuivre"), "{k:?}");
}

fn retour_gnd_vers_alim() {
    // GND -> 3V3 : le via de masse ne sert à rien, c'est le découplage qui porte le retour ;
    // un pont proche fait mieux que pas de pont du tout
    let plans = || obj! {"retours" => vec![masse(10.8)], "ponts" => Vec::<Json>::new(), "ponts_rayon_mm" => 10.0, "aire_plans_mm2" => 1000.0, "er_plans" => 4.3};
    let loin = analyser(obj! {"net_l3" => "3V3", "natures" => j(r#"{"CLK": "Rapide"}"#), "vias" => vec![via("CLK", plans())]});
    let pres = analyser(obj! {"net_l3" => "3V3", "natures" => j(r#"{"CLK": "Rapide"}"#),
                              "vias" => vec![via("CLK", avec(&plans(), obj! {"ponts" => j(r#"[{"x": 11.5, "y": 10.0, "repere": "C5", "capacite_F": 100e-9, "esl_nH": 0.5}]"#)}))]});
    let (kl, kp) = (de(&loin, "retour"), de(&pres, "retour"));
    assert!(!kl.is_empty() && msg(&kl[0]).contains("GND → 3V3"), "{kl:?} {:?}", loin["notes"]);
    // aucun pont ni dans le rayon ni au-delà : pas de 100 nF inventé au rayon
    assert!(msg(&kl[0]).contains("sur toute la carte"), "{kl:?}");
    let g = |k: &[Json]| if k.is_empty() { vec![0.0] } else { els(&k[0]["frequences"]).iter().map(|f| n(&f["valeur"])).collect() };
    assert!(g(&kp).iter().zip(g(&kl)).all(|(a, b)| *a < b), "{:?} {:?}", g(&kp), g(&kl));
    assert!(kp.is_empty() || msg(&kp[0]).contains("C5"), "{kp:?}");
    // le message dit l'hypothèse qui juge et le remède
    let m = msg(&kl[0]);
    assert!(m.contains("front de 1 ns de la classe Rapide") && m.contains("condensateur GND–3V3"), "{m}");
    assert!(!m.contains("Paire différentielle"), "{m}");
    // une paire dont le via jumeau est à 0,8 mm : le message le signale
    let paire = analyser(obj! {"net_l3" => "3V3", "natures" => j(r#"{"CLK": "Rapide"}"#), "paires" => j(r#"[["CLK", "CLK_N"]]"#),
                               "vias" => vec![via("CLK", plans()), via("CLK_N", obj! {"y" => 10.8})]});
    let k = de(&paire, "retour");
    let m = msg(k.iter().find(|k| txt(k, "n") == "CLK").unwrap());
    assert!(m.contains("via de CLK_N à 0.80 mm"), "{m}");
}

fn retour_cavite_modale() {
    // La page donne la cavité (rectangle) et TOUS les ponts : plus de pont supposé au rayon.
    // GND -> 3V3 sans rien, par un 0 ohm vers VDD et ses condensateurs, par un vrai
    // découplage au pied du via.
    let cav = j(r#"{"ponts": [], "ponts_rayon_mm": 10.0, "aire_plans_mm2": 2500.0, "er_plans": 4.3,
                    "cavite_rect": {"x0": 0.0, "y0": 0.0, "a": 50.0, "b": 50.0}, "ponts_indirects": [], "ponts_carte": []}"#);
    let run = |cl: &str, k: Json| {
        let fiche = avec(&avec(&obj! {"retours" => vec![masse(10.8)]}, cav.clone()), k);
        de(&analyser(obj! {"net_l3" => "3V3", "natures" => obj! {"CLK" => cl}, "vias" => vec![via("CLK", fiche)]}), "retour")
    };
    let relais = |x: f64| vec![obj! {"x" => x, "y" => 10.0, "repere" => "R5", "r_ohm" => 0.0, "relais" => "VDD",
                                     "caps" => vec![obj! {"x" => x + 2.0, "y" => 10.0, "repere" => "C9", "capacite_F" => 100e-9}]}];
    // sans rien, la cavité seule : à 35 MHz (Lent) elle pèse des dizaines d'ohms
    let rien = run("Lent", obj! {});
    assert!(!rien.is_empty() && txt(&rien[0], "severite") == "critique" && msg(&rien[0]).contains("sur toute la carte"), "{rien:?}");
    // un 0 ohm vers un rail découplé referme le retour ; un découplage aussi
    assert!(run("Lent", obj! {"ponts_indirects" => relais(14.0)}).is_empty());
    assert!(run("Lent", obj! {"ponts_carte" => j(r#"[{"x": 11.0, "y": 10.0, "repere": "C5", "capacite_F": 100e-9}]"#)}).is_empty());
    // le relais est nommé, et sa boucle compte jusqu'au condensateur (35 + 2 mm)
    let loin = run("Rapide", obj! {"ponts_indirects" => relais(45.0)});
    assert!(!loin.is_empty() && msg(&loin[0]).contains("R5 → VDD à 37.00 mm"), "{loin:?}");
    // deux étages : R5 vers VDD sans condensateur, puis R6 vers Vout découplé
    let chaine = j(r#"[{"x": 45.0, "y": 10.0, "repere": "R5", "r_ohm": 0.0, "relais": "VDD", "caps": [],
                        "suivants": [{"x": 47.0, "y": 10.0, "repere": "R6", "r_ohm": 0.0, "relais": "Vout",
                                      "caps": [{"x": 48.0, "y": 10.0, "repere": "C30", "capacite_F": 10e-6}]}]}]"#);
    let k = run("Rapide", obj! {"ponts_indirects" => chaine});
    assert!(!k.is_empty() && msg(&k[0]).contains("R5 → VDD → R6 → Vout à 38.00 mm"), "{k:?}");
    // la boucle longue du relais résonne avec la capacité des plans : la fiche nomme le pic,
    // et le juge le voit sous le genou (f_pire_hz)
    assert!(msg(&k[0]).contains("la traversée résonne à"), "{}", msg(&k[0]));
    assert!(els(&k[0]["frequences"]).iter().all(|f| n(&f["f_pire_hz"]) < n(&f["f_eval"])), "{:?}", k[0]["frequences"]);
}

fn antenne_porteuse_rails() {
    let pad = |x: f64, y: f64| obj! {"x" => x, "y" => y, "r" => 0.3, "c" => "Top"};
    // une antenne : ouverte au bout, sur une réserve de plan -- rien d'électrique
    let ant = |nature: &str| analyser(obj! {"natures" => obj! {"ANT" => nature}, "pistes" => vec![droite_("ANT", 0.0, 0.0, 30.0, "Top", 0.1)],
                                            "pastilles" => vec![pad(0.0, 0.0)], "vias" => vec![via("ANT", obj! {"retour_hors_rayon_mm" => 30.0})]});
    assert!(!de(&ant("RF"), "orphelin").is_empty());
    let res = ant("Antenne");
    assert!(!els(&res["constats"]).iter().any(|k| txt(k, "n") == "ANT"), "{:?}", res["constats"]);
    assert!(notes(&res).iter().any(|x| x.contains("Antenne") && x.contains("ANT")), "{:?}", res["notes"]);
    // isolée, une antenne reste un oubli
    let k = de(&analyser(obj! {"pistes" => vec![droite_("ANT", 0.0, 20.0, 30.0, "Top", 0.2)], "natures" => j(r#"{"ANT": "Antenne"}"#)}), "orphelin");
    assert!(!k.is_empty() && txt(&k[0], "severite") == "critique", "{k:?}");
    // porteuse RF à 868 MHz : front 0,40 ns, sans borne de période ni cadence (même cadencé
    // à 10 GHz) ; le via qui condamne à 0,1 ns tient ici mieux
    let rf = |reglages: Json| de(&analyser(obj! {"vias" => vec![hors_rayon(5.0)], "natures" => j(r#"{"CLK": "RF"}"#), "reglages" => reglages}), "retour");
    let dur = rf(obj! {});
    let k = rf(j(r#"{"porteuse_rf": 868e6, "cadences": {"RF": 1e10}}"#));
    assert!(!k.is_empty() && els(&k[0]["frequences"]).iter().all(|f| (n(&f["tr"]) - 0.35 / 868e6).abs() < 1e-15 && n(&f["porteuse"]) == 868e6), "{k:?}");
    assert!(valeur_max(&k[0]) < valeur_max(&dur[0]), "{k:?} {dur:?}");
    // un rail au nom automatique classé Analogique : montré, pas reclassé
    let res = analyser(obj! {"composants" => rail_automatique(), "natures" => j(r#"{"SIGN8": "Analogique", "GND": "Masse"}"#)});
    assert!(notes(&res).iter().any(|x| x.contains("U3.8 (SIGN8)")), "{:?}", res["notes"]);
}

/// U3 dont une broche va à la masse par le condensateur C9, sur un net au nom automatique.
pub fn rail_automatique() -> Json {
    j(r#"[{"ref": "U3", "c": "Top", "broches": [{"x": 0, "y": 0, "n": "SIGN8", "pin": "8"}, {"x": 1, "y": 0, "n": "GND", "pin": "4"}]},
          {"ref": "C9", "c": "Top", "broches": [{"x": 2, "y": 0, "n": "SIGN8"}, {"x": 3, "y": 0, "n": "GND"}]}]"#)
}

fn cibles_par_classe_et_par_net() {
    // Z₀ PAR CLASSE : la ligne Rapide de 0,1 mm condamnée face à 50 Ω ne l'est plus face à sa
    // propre impédance donnée en cible de sa classe ; une classe Lent à qui l'on donne une
    // cible devient tenue
    let usb = |reglages: Json| de(&analyser(obj! {"pistes" => vec![droite_("USB", 0.0, 0.0, 100.0, "Top", 0.1)], "natures" => j(r#"{"USB": "Rapide"}"#),
                                                  "reglages" => reglages}), "impedance");
    let k = usb(obj! {});
    let z = nombre_apres(msg(&k[0]), "Z₀ ", " ");
    assert!(70.0 < z && z < 110.0, "{z}");
    assert!(usb(obj! {"z0_classes" => obj! {"Rapide" => z}}).is_empty());
    let k = usb(obj! {"z0_classes" => obj! {"Rapide" => 2.0 * z}});
    assert!(!k.is_empty() && msg(&k[0]).contains(&format!("cible {:.0} Ω", 2.0 * z)), "{k:?}");
    let data = |reglages: Json| de(&analyser(obj! {"pistes" => vec![droite_("DATA", 0.0, 0.0, 100.0, "Top", 0.1)], "reglages" => reglages}), "impedance");
    assert!(data(obj! {}).is_empty());
    let k = data(j(r#"{"z0_classes": {"Lent": 25.0}, "cadences": {"Lent": 1e8}}"#));
    assert!(!k.is_empty() && msg(&k[0]).contains("cible 25 Ω"), "{k:?}");
    // le via d'une classe à 75 Ω réfléchit moins que face à 50 Ω
    let rf = |reglages: Json| de(&analyser(obj! {"vias" => vec![hors_rayon(5.0)], "natures" => j(r#"{"CLK": "RF"}"#), "reglages" => reglages}), "retour");
    let (g50, g75) = (valeur_max(&rf(obj! {})[0]), valeur_max(&rf(j(r#"{"z0_classes": {"RF": 75}}"#))[0]));
    assert!(g75 < g50, "{g75} {g50}");
    // PORTEUSE PAR NET : une carte LoRa + NFC, deux nets RF. Le LoRa suit la porteuse de la
    // carte (868 MHz), le NFC la sienne (13,56 MHz)
    let deux = |reglages: Json| analyser(obj! {"vias" => vec![via("LORA", obj! {"retour_hors_rayon_mm" => 5.0}), via("NFC", obj! {"x" => 30.0, "retour_hors_rayon_mm" => 5.0})],
                                               "natures" => j(r#"{"LORA": "RF", "NFC": "RF"}"#), "reglages" => reglages});
    let mut seule: Vec<String> = de(&deux(j(r#"{"porteuse_rf": 868e6}"#)), "retour").iter().map(|k| txt(k, "n").to_string()).collect();
    seule.sort();
    assert!(seule == ["LORA", "NFC"], "{seule:?}"); // le NFC condamné à 868 MHz
    let res = deux(j(r#"{"porteuse_rf": 868e6, "porteuses": {"NFC": 13.56e6}}"#));
    let par = de(&res, "retour");
    assert!(par.len() == 1 && txt(&par[0], "n") == "LORA", "{par:?}"); // à 13,56 MHz, son via tient
    assert!(els(&par[0]["frequences"]).iter().all(|f| n(&f["porteuse"]) == 868e6), "{par:?}");
    assert!(res["reglages"]["porteuses"] == j(r#"{"NFC": 13.56e6}"#), "{:?}", res["reglages"]);
    // une porteuse de net vaut aussi hors classe RF, devant le front de sa classe
    let k = de(&analyser(obj! {"reglages" => j(r#"{"porteuses": {"CLK": 2.4e9}}"#), "vias" => vec![hors_rayon(5.0)], "natures" => j(r#"{"CLK": "Lent"}"#)}), "retour");
    assert!(!k.is_empty() && els(&k[0]["frequences"]).iter().all(|f| n(&f["porteuse"]) == 2.4e9), "{k:?}");
}

pub fn banc() {
    println!("\nLes chemins de retour");
    T("test_retour_meme_masse", retour_meme_masse);
    T("test_retour_gnd_vers_alim", retour_gnd_vers_alim);
    T("test_retour_cavite_modale", retour_cavite_modale);
    T("test_antenne_porteuse_rails", antenne_porteuse_rails);
    T("test_cibles_par_classe_et_par_net", cibles_par_classe_et_par_net);
}
