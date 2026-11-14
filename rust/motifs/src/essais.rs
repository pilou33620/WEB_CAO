//! Les essais de la caisse.
//!
//! 1. LA NON-RÉGRESSION CONTRE LES MODULES PYTHON. `essais/reference.tsv` garde, par ligne,
//!    « fonction <tab> [arguments JSON] <tab> sortie » : chaque appel que les bancs Python
//!    (python/test/banc-patterns.py, banc-pcb-scoring.py) faisaient aux deux modules,
//!    interceptés à l'appel, puis des documents tirés au hasard (repères, valeurs et noms de
//!    nets retors, champs du mauvais type) et les fonctions de lier_modeles_murata. La sortie
//!    est `json.dumps(résultat, ensure_ascii=False)` du module Python (3.13), ou « ERREUR:
//!    message » de l'exception levée. Le Rust doit rendre la même chose, à l'octet. Seule
//!    retouche : « nets » et « components » du motif bus_i2c, que Python rendait dans l'ordre
//!    de hachage d'un set, y sont remis dans l'ordre du schéma.
//! 2. LES BANCS PYTHON eux-mêmes, portés cas par cas avec leurs assertions (modules
//!    `banc_patterns` et `banc_pcb_scoring`).
//! 3. Le crochet du lecteur IPC-2581 et l'outil Murata de bout en bout.

use crate::py::{dumps, loads, Json, Objet};
use std::path::PathBuf;

fn dossier() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("essais")
}

fn j(texte: &str) -> Json {
    loads(texte).unwrap_or_else(|e| panic!("{e} : {texte}"))
}

fn o(texte: &str) -> Objet {
    j(texte).as_objet().expect("un objet").clone()
}

fn l(texte: &str) -> Vec<Json> {
    j(texte).as_liste().expect("une liste").clone()
}

/// `x in liste`
fn dans(liste: &Json, x: &str) -> bool {
    liste.as_liste().expect("une liste").iter().any(|e| e.as_str() == Some(x))
}

/// sorted(liste) d'une liste de textes
fn tries(liste: &Json) -> Vec<String> {
    let mut v: Vec<String> = liste.as_liste().expect("une liste").iter().map(|e| e.as_str().expect("un texte").to_string()).collect();
    v.sort();
    v
}

#[test]
fn reference_python() {
    let table = std::fs::read_to_string(dossier().join("reference.tsv")).unwrap();
    let mut n = 0;
    for ligne in table.lines() {
        let champs: Vec<&str> = ligne.splitn(3, '\t').collect();
        let rendu = match loads(champs[1]).and_then(|a| crate::appel::appeler(champs[0], &a)) {
            Ok(v) => dumps(&v),
            Err(e) => format!("ERREUR: {e}"),
        };
        assert_eq!(rendu, champs[2], "{} {}", champs[0], champs[1]);
        n += 1;
    }
    assert_eq!(n, 1484);
}

/// Le lecteur IPC-2581 reçoit `motifs_ipc2581` et range dans « natures_nets » ce que le lecteur
/// Python y rangeait avec pattern_recognition présent (essais/exemple-1.natures.json), le
/// modèle entier restant celui de Python à l'octet (tenu par son empreinte).
#[test]
fn natures_des_nets_du_lecteur_ipc2581() {
    let octets = std::fs::read(dossier().join("exemple-1.xml")).unwrap();
    let modele = ipc2581::ipc2581_en_dict_avec(&octets, "exemple-1.xml", true, Some(&crate::motifs_ipc2581)).unwrap();
    let attendu = std::fs::read_to_string(dossier().join("exemple-1.natures.json")).unwrap();
    assert_eq!(dumps(&modele["natures_nets"]), attendu.trim_end());
    assert_eq!(modele["natures_nets"]["classes"]["USB_DP"].as_str(), Some("Rapide"));
    assert_eq!(dumps(&modele).chars().count(), 133943);

    // « nets_bruyants » part en liste de noms, que le lecteur trie
    let schema = j(r#"{"components": {"U1": {"val": "MP1584"}, "L1": {"val": "10uH"}, "D1": {"val": "B5819W"}},
        "nets": {"SW": [{"ref": "U1"}, {"ref": "L1"}, {"ref": "D1"}], "GND": [{"ref": "U1"}, {"ref": "D1"}]}}"#);
    assert_eq!(dumps(&crate::motifs_ipc2581(&schema).unwrap()["nets_bruyants"]), r#"["SW"]"#);
    // un échec n'empêche pas l'import
    assert!(crate::motifs_ipc2581(&j(r#"{"components": "x"}"#)).is_none());
}

/// L'outil de bout en bout sur une petite LIB : le rapport et les fichiers écrits sont ceux du
/// script Python lancé sur la même LIB.
#[test]
fn lier_modeles_murata_de_bout_en_bout() {
    use crate::lier_modeles_murata::{principal, Lieux};
    let racine = std::env::temp_dir().join(format!("motifs-murata-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&racine);
    let lieux = Lieux::de(racine.clone(), racine.join("LIB"));
    let mut sortie = Vec::new();
    assert_eq!(principal(&[], &lieux, &mut sortie), Ok(1));
    assert_eq!(String::from_utf8(sortie).unwrap(), format!("Catalogue introuvable : {}\n", lieux.csv_catalogue.display()));

    std::fs::create_dir_all(lieux.sim.join("pack")).unwrap();
    for nom in ["GCM1555C1H150JA16", "GCM1555C1H121JA16"] {
        std::fs::write(lieux.sim.join("pack").join(format!("{nom}.mod")), format!("* {nom}\n")).unwrap();
    }
    let catalogue = "Part Name;Part Number;Value;2nd source P/N;Modèle Simulation\r\nC 15pF;GCM1555C1H150JA16D;15pF;;lib/simulation/capacitor.sub\r\n\"C; 120pF\";XX;120pF;GCM1555C1H121FA16D;\nC doute;GCM1555C1H150JA16D;22pF;;capacitor.sub\nFerrite;BLM18AG601SN1D;600R;;\nR;RC0402;10k;;";
    std::fs::write(&lieux.csv_catalogue, catalogue).unwrap();

    let rapport = "Packs fabricant :
  2 modeles .mod indexes dans LIB/lib_simulation

Modeles fabricant relies -- reference exacte (0)

Modeles fabricant relies -- suffixe d'emballage ignore (1)
  GCM1555C1H150JA16D     -> GCM1555C1H150JA16.sub     C 15pF

Modeles fabricant relies -- equivalent de tolerance (a verifier) (1)
  GCM1555C1H121FA16D     -> GCM1555C1H121JA16.sub     C; 120pF

Modeles fabricant relies -- variante de code usine/emballage (0)

Modeles fabricant relies -- meme boitier, valeur et dielectrique (a verifier) (0)

Modeles fabricant relies -- autre boitier, meme valeur (a verifier) (0)

Modeles fabricant relies -- arbitrage de valeur / serie (0)

Sans modele dans les packs presents (1)
  BLM18AG601SN1D         Ferrite

Valeur du catalogue en desaccord avec la reference (a corriger a la main) (1)
  GCM1555C1H150JA16D     catalogue 22pF       reference 15 pF

3 references Murata : 2 reliees, 0 deja a jour, 0 conservees, 1 sans modele.
";
    // rapport seul : rien n'est écrit
    let mut sortie = Vec::new();
    assert_eq!(principal(&[], &lieux, &mut sortie), Ok(0));
    assert_eq!(String::from_utf8(sortie).unwrap(), format!("{rapport}\nRapport seul. Relancer avec --appliquer pour ecrire.\n"));
    assert_eq!(std::fs::read_to_string(&lieux.csv_catalogue).unwrap(), catalogue);

    let mut sortie = Vec::new();
    assert_eq!(principal(&["--appliquer".to_string()], &lieux, &mut sortie), Ok(0));
    assert_eq!(String::from_utf8(sortie).unwrap(), format!("{rapport}\n2 modeles copies dans LIB/lib_simulation, catalogue mis a jour.\n"));
    assert_eq!(
        std::fs::read_to_string(&lieux.csv_catalogue).unwrap(),
        "Part Name;Part Number;Value;2nd source P/N;Modèle Simulation\r\nC 15pF;GCM1555C1H150JA16D;15pF;;lib/simulation/GCM1555C1H150JA16.sub\r\n\"C; 120pF\";XX;120pF;GCM1555C1H121FA16D;lib/simulation/GCM1555C1H121JA16.sub\nC doute;GCM1555C1H150JA16D;22pF;;capacitor.sub\nFerrite;BLM18AG601SN1D;600R;;\nR;RC0402;10k;;"
    );
    assert_eq!(std::fs::read_to_string(lieux.sim.join("GCM1555C1H121JA16.sub")).unwrap(), "* GCM1555C1H121JA16\n");
    assert!(lieux.sim.join("GCM1555C1H150JA16.sub").is_file());
    let _ = std::fs::remove_dir_all(&racine);
}

/// Banc d'essai automatisé pour le module pattern_recognition (python/test/banc-patterns.py)
mod banc_patterns {
    use super::*;
    use crate::pattern_recognition::*;

    #[test]
    fn test_alimentation_ldo() {
        let comps = o(r#"{"U1": {"val": "AMS1117-3.3", "type": "ic"}, "C1": {"val": "10uF", "type": "cap"}, "C2": {"val": "22uF", "type": "cap"}}"#);
        let nets = o(r#"{
            "VIN": [{"ref": "U1", "pin": 3}, {"ref": "C1", "pin": 1}],
            "VCC_3V3": [{"ref": "U1", "pin": 2}, {"ref": "C2", "pin": 1}],
            "GND": [{"ref": "U1", "pin": 1}, {"ref": "C1", "pin": 2}, {"ref": "C2", "pin": 2}]}"#);
        let alims = identifier_alimentations(&comps, &nets).unwrap();
        assert_eq!(alims.len(), 1);
        let a = &alims[0];
        assert_eq!(a["subtype"].as_str(), Some("ldo"));
        assert_eq!(a["output_voltage"].as_f64(), Some(3.3));
        assert!(dans(&a["components"], "U1"));
        assert!(dans(&a["components"], "C1") && dans(&a["components"], "C2"));
    }

    #[test]
    fn test_bus_i2c() {
        let comps = o(r#"{"U1": {"val": "ATmega328P", "type": "ic"}, "R1": {"val": "4.7k", "type": "res"}, "R2": {"val": "4.7k", "type": "res"}}"#);
        let nets = o(r#"{
            "SDA": [{"ref": "U1", "pin": 27}, {"ref": "R1", "pin": 1}],
            "SCL": [{"ref": "U1", "pin": 28}, {"ref": "R2", "pin": 1}],
            "VCC": [{"ref": "R1", "pin": 2}, {"ref": "R2", "pin": 2}, {"ref": "U1", "pin": 7}]}"#);
        let bus = identifier_bus_numeriques(&comps, &nets).unwrap();
        assert_eq!(bus.len(), 1);
        let b = &bus[0];
        assert_eq!(b["subtype"].as_str(), Some("i2c"));
        assert!(dans(&b["nets"], "SDA") && dans(&b["nets"], "SCL"));
        assert!(dans(&b["components"], "R1") && dans(&b["components"], "R2"));
    }

    #[test]
    fn test_oscillateur() {
        let comps = o(r#"{"Y1": {"val": "16MHz", "type": "crystal"}, "C1": {"val": "22pF", "type": "cap"}, "C2": {"val": "22pF", "type": "cap"}}"#);
        let nets = o(r#"{
            "XTAL1": [{"ref": "Y1", "pin": 1}, {"ref": "C1", "pin": 1}],
            "XTAL2": [{"ref": "Y1", "pin": 2}, {"ref": "C2", "pin": 1}],
            "GND": [{"ref": "C1", "pin": 2}, {"ref": "C2", "pin": 2}]}"#);
        let oscs = identifier_oscillateurs(&comps, &nets).unwrap();
        assert_eq!(oscs.len(), 1);
        let osc = &oscs[0];
        assert_eq!(osc["main_component"].as_str(), Some("Y1"));
        assert!(dans(&osc["components"], "C1") && dans(&osc["components"], "C2"));
    }

    #[test]
    fn test_filtre_rc() {
        let comps = o(r#"{"R1": {"val": "1k", "type": "res"}, "C1": {"val": "100nF", "type": "cap"}}"#);
        let nets = o(r#"{
            "AUDIO_IN": [{"ref": "R1", "pin": 1}],
            "AUDIO_FILT": [{"ref": "R1", "pin": 2}, {"ref": "C1", "pin": 1}],
            "GND": [{"ref": "C1", "pin": 2}]}"#);
        let flts = identifier_filtres(&comps, &nets).unwrap();
        assert_eq!(flts.len(), 1);
        let f = &flts[0];
        assert_eq!(f["subtype"].as_str(), Some("rc_lowpass"));
        assert!(dans(&f["components"], "R1") && dans(&f["components"], "C1"));
    }

    #[test]
    fn test_analyser_motifs_complet() {
        let res = analyser_motifs_schema(&j(r#"{
            "components": {"U1": {"val": "AMS1117-3.3", "type": "ic"}, "C1": {"val": "10uF", "type": "cap"}, "R_LED": {"val": "330", "type": "res"}},
            "nets": {
                "VCC_3V3": [{"ref": "U1", "pin": 2}, {"ref": "C1", "pin": 1}, {"ref": "R_LED", "pin": 1}],
                "GND": [{"ref": "U1", "pin": 1}, {"ref": "C1", "pin": 2}]}}"#))
        .unwrap();
        assert_eq!(res["succes"], Json::Bool(true));
        assert!(res["total_motifs"].as_i64().unwrap() >= 1);
        assert!(res["classes_suggerees"].get("VCC_3V3").is_some());
        // Vérification des courants DC
        assert!(!res["courants_dc_estimes"].as_liste().unwrap().is_empty());
    }

    #[test]
    fn test_alimentation_buck() {
        let comps = o(r#"{
            "U1": {"val": "MP1584", "type": "ic"}, "L1": {"val": "10uH", "type": "inductor"}, "D1": {"val": "B5819W", "type": "diode"},
            "C1": {"val": "10uF", "type": "cap"}, "C2": {"val": "22uF", "type": "cap"},
            "R1": {"val": "10k", "type": "res"}, "R2": {"val": "3.3k", "type": "res"}}"#);
        let nets = o(r#"{
            "VIN": [{"ref": "U1", "pin": 1}, {"ref": "C1", "pin": 1}],
            "SW": [{"ref": "U1", "pin": 2}, {"ref": "L1", "pin": 1}, {"ref": "D1", "pin": 1}],
            "VOUT": [{"ref": "L1", "pin": 2}, {"ref": "C2", "pin": 1}, {"ref": "R1", "pin": 1}],
            "FB": [{"ref": "U1", "pin": 3}, {"ref": "R1", "pin": 2}, {"ref": "R2", "pin": 1}],
            "GND": [{"ref": "U1", "pin": 4}, {"ref": "D1", "pin": 2}, {"ref": "C1", "pin": 2}, {"ref": "C2", "pin": 2}, {"ref": "R2", "pin": 2}]}"#);
        let alims = identifier_alimentations(&comps, &nets).unwrap();
        assert!(!alims.is_empty());
        let buck = alims.iter().find(|a| a["subtype"].as_str() == Some("switching_regulator")).unwrap();
        assert_eq!(buck["layout_template"].as_str(), Some("buck_compact"));
        assert_eq!(buck["role_map"]["ic"].as_str(), Some("U1"));
        assert_eq!(buck["role_map"]["sw_inductor"].as_str(), Some("L1"));
        assert!(dans(&buck["role_map"]["diodes"], "D1"));
        assert!(dans(&buck["role_map"]["cin"], "C1"));
        assert!(dans(&buck["role_map"]["cout"], "C2"));
    }

    #[test]
    fn test_zones_schematiques() {
        let res = analyser_motifs_schema(&j(r##"{
            "components": {"U1": {"val": "AMS1117-3.3", "type": "ic"}, "C1": {"val": "10uF", "type": "cap"}, "C2": {"val": "10uF", "type": "cap"},
                "U2": {"val": "STM32F103", "type": "ic"}, "C3": {"val": "100nF", "type": "cap"}},
            "nets": {
                "VCC": [{"ref": "U1", "pin": 2}, {"ref": "C2", "pin": 1}, {"ref": "U2", "pin": 1}, {"ref": "C3", "pin": 1}],
                "GND": [{"ref": "U1", "pin": 1}, {"ref": "C1", "pin": 2}, {"ref": "C2", "pin": 2}, {"ref": "U2", "pin": 2}, {"ref": "C3", "pin": 2}]},
            "zones": [
                {"id": "zone_alim", "nom": "Alimentation 3.3V", "categorie": "Alimentation", "couleur": "#f59e0b", "composants": ["U1", "C1", "C2"]},
                {"id": "zone_mcu", "nom": "Cœur MCU", "categorie": "MCU", "couleur": "#3fa0ea", "composants": ["U2", "C3"]}]}"##))
        .unwrap();
        assert_eq!(res["succes"], Json::Bool(true));
        assert!(res.get("zones").is_some());
        assert_eq!(res["zones"].as_liste().unwrap().len(), 2);
        assert_eq!(res["zones"][0]["nom"].as_str(), Some("Alimentation 3.3V"));
        assert_eq!(res["zones"][0]["ancre"].as_str(), Some("U1"));
        assert_eq!(res["zones"][1]["ancre"].as_str(), Some("U2"));
        // Les zones doivent être incluses dans les motifs
        let zm: Vec<&Json> = res["motifs"].as_liste().unwrap().iter().filter(|m| m["is_user_zone"].vrai()).collect();
        assert_eq!(zm.len(), 2);
        assert!(["buck_compact", "ldo_inline"].contains(&zm[0]["layout_template"].as_str().unwrap()));
        assert_eq!(zm[1]["layout_template"].as_str(), Some("mcu_decoupling"));
    }

    #[test]
    fn test_valeur_en_ohms() {
        let attendus = [
            ("4.7k", 4700.0), ("4k7", 4700.0), ("100R", 100.0), ("2R2", 2.2), ("1M", 1e6),
            ("330", 330.0), ("10k", 1e4), ("1k5", 1500.0), ("47 Ohm", 47.0), ("220Ω", 220.0),
        ];
        for (texte, ohms) in attendus {
            let v = valeur_en_ohms(texte);
            assert!(v.is_some_and(|v| (v - ohms).abs() < 1e-9), "{texte} {v:?}");
        }
        assert_eq!(valeur_en_ohms(""), None);
        assert_eq!(valeur_en_ohms("DNP"), None);
    }

    fn alims_de(comps: &str) -> Vec<Json> {
        identifier_alimentations(&o(comps), &Objet::new()).unwrap()
    }

    #[test]
    fn test_tension_ldo_ignore_le_repere() {
        // U5 et U12 sont des repères, pas des tensions
        for ref_ in ["U5", "U12", "U15"] {
            let alims = alims_de(&format!(r#"{{"{ref_}": {{"val": "AMS1117-3.3"}}}}"#));
            assert_eq!(alims[0]["output_voltage"].as_f64(), Some(3.3), "{ref_}");
        }
        // Sans tension lisible dans la valeur : 3,3 V par défaut
        assert_eq!(alims_de(r#"{"U1": {"val": "MCP1700"}}"#)[0]["output_voltage"].as_f64(), Some(3.3));
        assert_eq!(alims_de(r#"{"U1": {"val": "LP5907-1.8"}}"#)[0]["output_voltage"].as_f64(), Some(1.8));
    }

    #[test]
    fn test_regulateurs_78xx_79xx() {
        let attendus = [
            ("L7805", 5.0), ("LM7808", 8.0), ("L7809", 9.0), ("LM7812", 12.0), ("MC7815", 15.0),
            ("LM7824", 24.0), ("L78L05", 5.0), ("L7833", 3.3),
            ("LM7905", -5.0), ("LM7912", -12.0), ("MC7915", -15.0),
        ];
        for (val, v) in attendus {
            let alims = alims_de(&format!(r#"{{"U3": {{"val": "{val}"}}}}"#));
            assert_eq!(alims.len(), 1, "{val}");
            assert_eq!(alims[0]["output_voltage"].as_f64(), Some(v), "{val}");
            let attendu_type = if v < 0.0 { "linear_fixed_negative" } else { "linear_fixed_positive" };
            assert_eq!(alims[0]["subtype"].as_str(), Some(attendu_type), "{val}");
        }
    }

    #[test]
    fn test_regulateur_ajustable() {
        let alims = alims_de(r#"{"U1": {"val": "LM317"}}"#);
        assert_eq!(alims[0]["subtype"].as_str(), Some("linear_adjustable"));
        assert_eq!(alims[0]["output_voltage"], Json::Nul);
        // Un composant quelconque n'est pas une alimentation
        assert!(alims_de(r#"{"U1": {"val": "STM32F103"}, "R1": {"val": "10k"}}"#).is_empty());
    }

    #[test]
    fn test_ldo_cin_cout() {
        let comps = o(r#"{"U1": {"val": "AMS1117-3.3"}, "C1": {"val": "10uF"}, "C2": {"val": "22uF"}, "R1": {"val": "1k"}}"#);
        let nets = o(r#"{
            "VIN": [{"ref": "U1", "pin": 3}, {"ref": "C1", "pin": 1}],
            "VOUT": [{"ref": "U1", "pin": 2}, {"ref": "C2", "pin": 1}, {"ref": "R1", "pin": 1}],
            "GND": [{"ref": "U1", "pin": 1}, {"ref": "C1", "pin": 2}, {"ref": "C2", "pin": 2}]}"#);
        let a = &identifier_alimentations(&comps, &nets).unwrap()[0];
        assert_eq!(dumps(&a["role_map"]["cin"]), r#"["C1"]"#);
        assert_eq!(dumps(&a["role_map"]["cout"]), r#"["C2"]"#);
        assert!(dans(&a["components"], "R1") && dans(&a["role_map"]["passives"], "R1"));
        assert_eq!(tries(&a["nets"]), ["GND", "VIN", "VOUT"]);
    }

    #[test]
    fn test_i2c_pullups_et_sclk() {
        let comps = o(r#"{"U1": {"val": "MCU"}, "R1": {"val": "4.7k"}, "R2": {"val": "4.7k"}, "R3": {"val": "10k"}}"#);
        let nets = o(r#"{
            "I2C_SDA": [{"ref": "U1", "pin": 1}, {"ref": "R1", "pin": 1}],
            "I2C_SCL": [{"ref": "U1", "pin": 2}, {"ref": "R2", "pin": 2}],
            "3V3": [{"ref": "R1", "pin": 2}, {"ref": "R2", "pin": 1}, {"ref": "R3", "pin": 1}],
            "RESET": [{"ref": "U1", "pin": 3}, {"ref": "R3", "pin": 2}]}"#);
        let bus = identifier_bus_numeriques(&comps, &nets).unwrap();
        let i2c = bus.iter().find(|b| b["subtype"].as_str() == Some("i2c")).unwrap();
        // Pull-up dans les deux sens de câblage ; R3 (reset) n'en est pas un
        assert_eq!(tries(&i2c["components"]), ["R1", "R2"]);
        assert_eq!(tries(&i2c["nets"]), ["I2C_SCL", "I2C_SDA"]);

        // L'horloge SPI SCLK n'est pas un bus I2C
        let bus = identifier_bus_numeriques(&Objet::new(), &o(r#"{"SCLK": [], "MOSI": [], "MISO": [], "CS": []}"#)).unwrap();
        assert_eq!(bus.iter().map(|b| b["subtype"].as_str().unwrap()).collect::<Vec<_>>(), ["spi"]);
        assert_eq!(tries(&bus[0]["nets"]), ["MISO", "MOSI", "SCLK"]);
    }

    #[test]
    fn test_spi_uart_seuils() {
        let bus = |nets: &str| identifier_bus_numeriques(&Objet::new(), &o(nets)).unwrap();
        // Un seul net SPI ne fait pas un bus, un seul net UART non plus
        assert!(bus(r#"{"MOSI": [], "TXD": []}"#).is_empty());
        let b = bus(r#"{"UART_TX": [], "UART_RX": [], "GND": []}"#);
        assert_eq!(b.iter().map(|b| b["subtype"].as_str().unwrap()).collect::<Vec<_>>(), ["uart"]);
        assert_eq!(tries(&b[0]["nets"]), ["UART_RX", "UART_TX"]);
        assert!(bus("{}").is_empty());
    }

    #[test]
    fn test_ferrite_pas_un_oscillateur() {
        let oscs = |comps: &str| identifier_oscillateurs(&o(comps), &Objet::new()).unwrap();
        assert!(oscs(r#"{"FB1": {"val": "600R@100MHz"}, "L1": {"val": "10uH@1MHz"}, "C1": {"val": "100nF 1MHz"}}"#).is_empty());
        // Un oscillateur actif sans repère Y/X reste reconnu par sa fréquence
        let r = oscs(r#"{"U4": {"val": "SG-8002 25MHz"}}"#);
        assert!(r.len() == 1 && r[0]["main_component"].as_str() == Some("U4"));
        // X1 connecteur n'est pas un quartz ; un X qui porte sa fréquence, oui
        assert!(oscs(r#"{"X1": {"val": "USB-C"}, "J2": {"val": "HDR"}}"#).is_empty());
        let r = oscs(r#"{"X2": {"val": "16MHz"}, "XTAL1": {"val": "?"}}"#);
        let mut refs: Vec<&str> = r.iter().map(|x| x["main_component"].as_str().unwrap()).collect();
        refs.sort();
        assert_eq!(refs, ["X2", "XTAL1"]);
    }

    #[test]
    fn test_oscillateur_masse_nommee_autrement() {
        let comps = o(r#"{"Y1": {"val": "32.768kHz"}, "C1": {"val": "12pF"}, "C2": {"val": "12pF"}}"#);
        let mut nets = o(r#"{
            "OSC32_IN": [{"ref": "Y1", "pin": 1}, {"ref": "C1", "pin": 1}],
            "OSC32_OUT": [{"ref": "Y1", "pin": 2}, {"ref": "C2", "pin": 1}],
            "DGND": [{"ref": "C1", "pin": 2}, {"ref": "C2", "pin": 2}]}"#);
        let osc = &identifier_oscillateurs(&comps, &nets).unwrap()[0];
        assert_eq!(dumps(&osc["role_map"]["c_loads"]), r#"["C1", "C2"]"#);
        // Condensateur qui ne va pas à la masse : pas une capa de charge
        nets.insert("DGND".into(), j(r#"[{"ref": "C1", "pin": 2}]"#));
        nets.insert("3V3".into(), j(r#"[{"ref": "C2", "pin": 2}]"#));
        let osc = &identifier_oscillateurs(&comps, &nets).unwrap()[0];
        assert_eq!(dumps(&osc["role_map"]["c_loads"]), r#"["C1"]"#);
        assert_eq!(osc["role_map"]["c_load_2"], Json::Nul);
    }

    #[test]
    fn test_filtre_rc_limites() {
        let comps = o(r#"{"R1": {"val": "1k"}, "C1": {"val": "100nF"}}"#);
        let filtres = |nets: &str| identifier_filtres(&comps, &o(nets)).unwrap();
        // Capa vers GNDA : filtre reconnu
        assert_eq!(filtres(r#"{"IN": [{"ref": "R1", "pin": 1}], "OUT": [{"ref": "R1", "pin": 2}, {"ref": "C1", "pin": 1}], "GNDA": [{"ref": "C1", "pin": 2}]}"#).len(), 1);
        // Capa côté rail d'alimentation : c'est un découplage, pas un filtre
        assert!(filtres(r#"{"VCC": [{"ref": "R1", "pin": 1}, {"ref": "C1", "pin": 1}], "SIG": [{"ref": "R1", "pin": 2}], "GND": [{"ref": "C1", "pin": 2}]}"#).is_empty());
        // Capa de liaison (pas à la masse) : pas un passe-bas
        assert!(filtres(r#"{"IN": [{"ref": "R1", "pin": 1}], "OUT": [{"ref": "R1", "pin": 2}, {"ref": "C1", "pin": 1}], "SUITE": [{"ref": "C1", "pin": 2}]}"#).is_empty());
        // Résistance à une seule patte câblée : ignorée
        assert!(filtres(r#"{"OUT": [{"ref": "R1", "pin": 2}, {"ref": "C1", "pin": 1}], "GND": [{"ref": "C1", "pin": 2}]}"#).is_empty());
    }

    #[test]
    fn test_courant_led_seulement_avec_une_led() {
        let comps = o(r#"{"R1": {"val": "1k"}, "C1": {"val": "100nF"}, "R2": {"val": "330"}, "D2": {"val": "LED rouge"}}"#);
        let nets = o(r#"{
            "IN": [{"ref": "R1", "pin": 1}],
            "FILT": [{"ref": "R1", "pin": 2}, {"ref": "C1", "pin": 1}],
            "3V3": [{"ref": "R2", "pin": 1}],
            "LED_A": [{"ref": "R2", "pin": 2}, {"ref": "D2", "pin": 1}],
            "GND": [{"ref": "C1", "pin": 2}, {"ref": "D2", "pin": 2}]}"#);
        let leds = |courants: Vec<Json>| -> Vec<Json> { courants.into_iter().filter(|c| c["type"].as_str() == Some("consommation_led")).collect() };
        let avec = leds(estimer_courants_dc(&[], &comps, Some(&nets)).unwrap());
        // Seule R2 limite une LED ; R1 (filtre RC) n'est pas comptée
        assert_eq!(avec.iter().map(|c| c["composant"].as_str().unwrap()).collect::<Vec<_>>(), ["R2"]);
        assert!((avec[0]["courant_ma"].as_f64().unwrap() - crate::py::round(1.3 / 330.0 * 1000.0, 1)).abs() < 1e-9);
        // Sans nets : heuristique d'origine, compatibilité conservée
        let sans = leds(estimer_courants_dc(&[], &comps, None).unwrap());
        let mut refs: Vec<&str> = sans.iter().map(|c| c["composant"].as_str().unwrap()).collect();
        refs.sort();
        assert_eq!(refs, ["R1", "R2"]);
        // Hors plage 100 Ω - 4,7 kΩ : pas une LED
        let comps = o(r#"{"R1": {"val": "10k"}, "LED1": {"val": "verte"}}"#);
        let nets = o(r#"{"A": [{"ref": "R1", "pin": 1}, {"ref": "LED1", "pin": 1}]}"#);
        assert!(estimer_courants_dc(&[], &comps, Some(&nets)).unwrap().is_empty());
    }

    #[test]
    fn test_courants_regulateurs_et_ci() {
        let alims = l(r#"[
            {"type": "power_supply", "subtype": "ldo", "main_component": "U1", "nets": ["VOUT"], "output_voltage": 3.3},
            {"type": "power_supply", "subtype": "switching_regulator", "main_component": "U2", "nets": [], "output_voltage": null}]"#);
        let comps = o(r#"{"U1": {"val": "AMS1117-3.3", "type": "ic"}, "U2": {"val": "MP1584"}, "U3": {"val": "STM32F103"}, "U4": {"val": "74HC595"}}"#);
        let liste = estimer_courants_dc(&alims, &comps, Some(&Objet::new())).unwrap();
        let courant = |ref_: &str| liste.iter().find(|c| c["composant"].as_str() == Some(ref_)).unwrap();
        assert!(courant("U1")["courant_ma"].as_f64() == Some(10.0) && courant("U1")["role"].as_str() == Some("source"));
        assert_eq!(courant("U1")["net"].as_str(), Some("VOUT"));
        assert!(courant("U2")["courant_ma"].as_f64() == Some(25.0) && courant("U2")["net"].as_str() == Some("VCC"));
        // Un régulateur déjà compté comme source n'est pas recompté comme charge
        assert_eq!(liste.iter().filter(|c| c["composant"].as_str() == Some("U1")).count(), 1);
        assert_eq!(courant("U3")["courant_ma"].as_f64(), Some(50.0)); // microcontrôleur
        assert_eq!(courant("U4")["courant_ma"].as_f64(), Some(30.0)); // logique ordinaire
    }

    #[test]
    fn test_zones_gabarits_et_alias() {
        let res = analyser_motifs_schema(&j(r#"{"components": {}, "nets": {}, "rooms": [
            {"name": "Horloge", "category": "Oscillateur", "components": ["C9", "Y1"]},
            {"nom": "Filtrage", "categorie": "Filtre", "composants": ["R1", "C1"]},
            {"nom": "Buck", "categorie": "Alimentation", "composants": ["U2", "L1", "C3"]},
            {"nom": "Divers", "composants": "pas une liste"},
            "pas un dict"]}"#))
        .unwrap();
        let z = &res["zones"];
        assert_eq!(z.as_liste().unwrap().len(), 4); // l'entrée non-dict est ignorée
        assert_eq!(z[0]["ancre"].as_str(), Some("Y1")); // le quartz prime sur la capa
        assert_eq!(z[1]["ancre"].as_str(), Some("R1")); // sans actif : premier composant
        assert!(dumps(&z[3]["composants"]) == "[]" && z[3]["ancre"] == Json::Nul);
        assert!(z[0]["id"].as_str() == Some("zone_1") && z[3]["nom"].as_str() == Some("Divers"));
        let gabarits: Vec<&str> =
            res["motifs"].as_liste().unwrap().iter().filter(|m| m["is_user_zone"].vrai()).map(|m| m["layout_template"].as_str().unwrap()).collect();
        assert_eq!(gabarits, ["crystal_symmetric", "filter_inline", "buck_compact", "cluster_free"]);
    }

    #[test]
    fn test_analyse_vide_et_classes() {
        let res = analyser_motifs_schema(&j("{}")).unwrap();
        assert!(res["succes"] == Json::Bool(true) && res["total_motifs"].as_i64() == Some(0));
        assert!(dumps(&res["motifs"]) == "[]" && dumps(&res["classes_suggerees"]) == "{}" && dumps(&res["courants_dc_estimes"]) == "[]");
        let res = analyser_motifs_schema(&j(r#"{"components": {"Y1": {"val": "8MHz"}},
            "nets": {"XIN": [{"ref": "Y1", "pin": 1}], "XOUT": [{"ref": "Y1", "pin": 2}], "SDA": [], "SCL": []}}"#))
        .unwrap();
        let classes = &res["classes_suggerees"];
        assert!(classes["XIN"].as_str() == Some("Horloge") && classes["XOUT"].as_str() == Some("Horloge"));
        assert!(classes["SDA"].as_str() == Some("Lent") && classes["SCL"].as_str() == Some("Lent"));
    }

    #[test]
    fn test_nets_de_masse() {
        let nets = o(r#"{"GND": [], "AGND": [], "DGND": [], "GNDA": [], "VSS": [], "0V": [], "10V": [], "20V": [], "3V0": [], "VCC": []}"#);
        let mut masses = nets_masse(&nets);
        masses.sort();
        assert_eq!(masses, ["0V", "AGND", "DGND", "GND", "GNDA", "VSS"]);
    }

    #[test]
    fn test_classement_nets() {
        let res = analyser_motifs_schema(&j(r#"{
            "components": {
                "U1": {"val": "STM32F407", "type": "ic"},
                "Y1": {"val": "8MHz"}, "C1": {"val": "22pF"},
                "U2": {"val": "LM358"},
                "J1": {"val": "SMA"},
                "J2": {"val": "USB-C"},
                "C9": {"val": "100uF"},
                "U3": {"val": "AMS1117-3.3"}, "C4": {"val": "10uF"}},
            "nets": {
                "GND": [{"ref": "C1", "pin": 2, "name": ""}, {"ref": "C9", "pin": 2, "name": ""}, {"ref": "U3", "pin": 1, "name": ""}],
                "+3V3": [{"ref": "U1", "pin": 1, "name": "VDD"}],
                "$BN1": [{"ref": "U1", "pin": 5, "name": "PH0-OSC_IN"}, {"ref": "Y1", "pin": 1, "name": ""}, {"ref": "C1", "pin": 1, "name": ""}],
                "$BN2": [{"ref": "U1", "pin": 20, "name": "USB_DP"}, {"ref": "J2", "pin": 2, "name": "D+"}],
                "$BN3": [{"ref": "U1", "pin": 21, "name": "USB_DM"}, {"ref": "J2", "pin": 3, "name": "D-"}],
                "$BN4": [{"ref": "U2", "pin": 3, "name": "IN+"}],
                "$BN5": [{"ref": "U2", "pin": 2, "name": "IN-"}],
                "$BN6": [{"ref": "U1", "pin": 30, "name": "PA5/SPI1_SCK/ADC5"}],
                "$BN7": [{"ref": "J1", "pin": 1, "name": ""}, {"ref": "U1", "pin": 40, "name": "PB1"}],
                "$BN8": [{"ref": "C9", "pin": 1, "name": "+"}],
                "$BN9": [{"ref": "C9", "pin": 3, "name": "-"}],
                "VOUT": [{"ref": "U3", "pin": 2, "name": "VOUT"}, {"ref": "C4", "pin": 1, "name": ""}],
                "LVDS_CLK_P": [], "LVDS_CLK_N": [], "RESET_N": [], "DATA_P": [], "DATA_N": [],
                "ADC_IN0": []}}"#))
        .unwrap();
        // nets à nom automatique : seuls les noms de broches parlent ; $BN6 multifonction : ignorée ;
        // $BN8 / $BN9 capa polarisée : pas une paire ; paire par nom de net ; RESET_N seul reste un signal actif bas
        let (cl, why) = (&res["classes_suggerees"], &res["raisons_classes"]);
        let c = |n: &str| cl[n].as_str();
        assert!(c("GND") == Some("Masse") && c("+3V3") == Some("Alimentation"));
        assert_eq!(c("$BN1"), Some("Horloge"), "{:?}", why["$BN1"]);
        assert!(c("$BN2") == Some("Rapide") && c("$BN3") == Some("Rapide"));
        assert!(c("$BN4") == Some("Analogique") && c("$BN5") == Some("Analogique")); // entrée d'AOP, pas LVDS
        assert!(cl.get("$BN6").is_none());
        assert!(c("$BN7") == Some("RF") && why["$BN7"].as_str().unwrap().contains("J1"));
        assert!(cl.get("$BN8").is_none() && cl.get("$BN9").is_none());
        assert_eq!(c("VOUT"), Some("Alimentation"), "{:?}", why["VOUT"]);
        assert_eq!(c("LVDS_CLK_P"), Some("Horloge")); // l'horloge prime sur la paire
        assert!(c("DATA_P") == Some("Rapide") && why["DATA_P"].as_str() == Some("Paire différentielle"));
        assert_eq!(c("RESET_N"), Some("Lent")); // actif bas, pas une paire
        assert_eq!(c("ADC_IN0"), Some("Analogique"));
        // RGMII : « TXD » ressemble à une UART, mais ENET dit Ethernet
        let res2 = analyser_motifs_schema(&j(r#"{"components": {}, "nets": {"ENET_HPS_TXD0": [], "ENET_HPS_RXD0": [], "SGMII_TX": []}}"#)).unwrap();
        assert!(res2["classes_suggerees"].as_objet().unwrap().values().all(|v| v.as_str() == Some("Rapide")), "{}", dumps(&res2["classes_suggerees"]));
        // un indice sûr de lenteur l'emporte sur CLK ou ENET qui l'entourent
        let res3 = analyser_motifs_schema(&j(r#"{"components": {}, "nets": {
            "MINI_PCIE_SMB_CLK": [], "ENETA_LED_TX": [], "ENET_MDIO": [], "ENET_RESET_N": [],
            "CLK_IN": [], "LED_P": [], "LED_N": []}}"#))
        .unwrap();
        assert_eq!(
            dumps(&res3["classes_suggerees"]),
            r#"{"MINI_PCIE_SMB_CLK": "Lent", "ENETA_LED_TX": "Lent", "ENET_MDIO": "Lent", "ENET_RESET_N": "Lent", "CLK_IN": "Horloge", "LED_P": "Lent", "LED_N": "Lent"}"#
        );
        let mut paires: Vec<Vec<String>> = res["paires_diff"].as_liste().unwrap().iter().map(tries).collect();
        paires.sort();
        assert_eq!(paires, [["$BN2", "$BN3"], ["$BN4", "$BN5"], ["DATA_N", "DATA_P"], ["LVDS_CLK_N", "LVDS_CLK_P"]]);
    }

    #[test]
    fn test_noeud_de_commutation() {
        let bruyants = |res: &Json| res["nets_bruyants"].as_objet().unwrap().keys().cloned().collect::<Vec<_>>();
        // Buck asynchrone : SW relie contrôleur, inductance et diode
        let res = analyser_motifs_schema(&j(r#"{
            "components": {"U1": {"val": "MP1584"}, "L1": {"val": "10uH"}, "D1": {"val": "B5819W"}, "C1": {"val": "10uF"}, "C2": {"val": "22uF"}},
            "nets": {"VIN": [{"ref": "U1"}, {"ref": "C1"}], "$BN1": [{"ref": "U1"}, {"ref": "L1"}, {"ref": "D1"}],
                "VOUT": [{"ref": "L1"}, {"ref": "C2"}],
                "GND": [{"ref": "U1"}, {"ref": "D1"}, {"ref": "C1"}, {"ref": "C2"}]}}"#))
        .unwrap();
        assert_eq!(bruyants(&res), ["$BN1"]);
        assert_eq!(res["classes_suggerees"]["$BN1"].as_str(), Some("Alimentation"));

        // Buck synchrone : bootstrap BOOT-SW (pas à la masse), VOUT mesuré par le
        // contrôleur (touche U1 et L1, mais porte C2 vers la masse)
        let res = analyser_motifs_schema(&j(r#"{
            "components": {"U1": {"val": "TPS54331"}, "L1": {"val": "6.8uH"}, "C3": {"val": "100nF"}, "C1": {"val": "10uF"}, "C2": {"val": "22uF"}},
            "nets": {"VIN": [{"ref": "U1"}, {"ref": "C1"}], "PH": [{"ref": "U1"}, {"ref": "L1"}, {"ref": "C3"}],
                "BOOT": [{"ref": "U1"}, {"ref": "C3"}], "VOUT": [{"ref": "U1"}, {"ref": "L1"}, {"ref": "C2"}],
                "GND": [{"ref": "U1"}, {"ref": "C1"}, {"ref": "C2"}]}}"#))
        .unwrap();
        assert_eq!(bruyants(&res), ["PH"]);

        // Boost : VIN touche le contrôleur et l'inductance mais porte Cin ;
        // une LED sur la broche EN n'est pas une inductance
        let res = analyser_motifs_schema(&j(r#"{
            "components": {"U1": {"val": "MT3608"}, "L1": {"val": "22uH"}, "D1": {"val": "SS34"}, "LED1": {"val": "LED"}, "C1": {"val": "22uF"}, "C2": {"val": "22uF"}},
            "nets": {"VIN": [{"ref": "U1"}, {"ref": "L1"}, {"ref": "C1"}], "SW": [{"ref": "U1"}, {"ref": "L1"}, {"ref": "D1"}],
                "EN": [{"ref": "U1"}, {"ref": "LED1"}], "VOUT": [{"ref": "D1"}, {"ref": "C2"}],
                "GND": [{"ref": "U1"}, {"ref": "C1"}, {"ref": "C2"}, {"ref": "LED1"}]}}"#))
        .unwrap();
        assert_eq!(bruyants(&res), ["SW"]);
        assert!(!dans(&res["motifs"][0]["role_map"]["inductors"], "LED1"));
    }
}

/// Banc d'essai automatisé pour le module pcb_scoring (python/test/banc-pcb-scoring.py)
mod banc_pcb_scoring {
    use super::*;
    use crate::pcb_scoring::*;

    /// Empreinte minimale : pads = (n, net, x, y).
    fn fp(ref_: &str, x: f64, y: f64, pads: &[(i64, &str, f64, f64)]) -> Json {
        let pads: Vec<String> = pads.iter().map(|(n, net, px, py)| format!(r#"{{"n": {n}, "net": "{net}", "x": {px:?}, "y": {py:?}}}"#)).collect();
        j(&format!(r#"{{"ref": "{ref_}", "x": {x:?}, "y": {y:?}, "rot": 0.0, "pads": [{}]}}"#, pads.join(", ")))
    }

    #[test]
    fn test_hpwl_simple() {
        let fps = l(r#"[
            {"ref": "R1", "x": 10.0, "y": 10.0, "pads": [{"n": 1, "net": "NET1", "x": 10.0, "y": 10.0}, {"n": 2, "net": "NET2", "x": 12.0, "y": 10.0}]},
            {"ref": "R2", "x": 20.0, "y": 25.0, "pads": [{"n": 1, "net": "NET1", "x": 20.0, "y": 25.0}, {"n": 2, "net": "GND", "x": 22.0, "y": 25.0}]}]"#);
        // NET1 va de (10, 10) à (20, 25) -> dx = 10, dy = 15 -> HPWL = 25
        let (hpwl, par_net) = calculer_hpwl(&fps).unwrap();
        assert_eq!(hpwl, 25.0);
        assert_eq!(par_net["NET1"].as_f64(), Some(25.0));
    }

    #[test]
    fn test_top_contributeurs() {
        let fps = l(r#"[
            {"ref": "U1", "x": 0.0, "y": 0.0, "pads": [{"n": 1, "net": "NET_LONG", "x": 0.0, "y": 0.0}]},
            {"ref": "R1", "x": 100.0, "y": 100.0, "pads": [{"n": 1, "net": "NET_LONG", "x": 100.0, "y": 100.0}]},
            {"ref": "C1", "x": 1.0, "y": 1.0, "pads": [{"n": 1, "net": "NET_COURT", "x": 1.0, "y": 1.0}]},
            {"ref": "C2", "x": 2.0, "y": 2.0, "pads": [{"n": 1, "net": "NET_COURT", "x": 2.0, "y": 2.0}]}]"#);
        let worst = top_contributeurs_hpwl(&fps, 2).unwrap();
        assert_eq!(worst.len(), 2);
        // U1 et R1 sont sur le net long (dist ~70.7mm au barycentre), C1 et C2 sur net court
        let refs_worst: Vec<&str> = worst.iter().map(|w| w["ref"].as_str().unwrap()).collect();
        assert!(refs_worst.contains(&"U1") && refs_worst.contains(&"R1"));
    }

    #[test]
    fn test_congestion() {
        // 5 pastilles concentrées autour de (10, 10)
        let fps: Vec<Json> = (0..5).map(|i| 10.0 + i as f64 * 0.2).map(|p| fp("R", p, p, &[(1, "N", p, p)])).collect();
        let cong = analyser_congestion(&fps, None, 5.0).unwrap();
        assert_eq!(cong["peak_density"].as_i64(), Some(5));
        assert!((cong["hotspot_x"].as_f64().unwrap() - 12.5).abs() < 3.0);
    }

    #[test]
    fn test_decouplage() {
        // U1 avec pin VCC à (10, 10)
        // C1 (decouplage proche) avec pin VCC à (11, 10) -> distance 1 mm (conforme <= 3.5 mm)
        // C2 (decouplage loin) avec pin VCC à (30, 10) -> distance 20 mm (non conforme)
        let fps = l(r#"[
            {"ref": "U1", "x": 10.0, "y": 10.0, "pads": [{"n": 1, "net": "3V3", "x": 10.0, "y": 10.0}, {"n": 2, "net": "GND", "x": 10.0, "y": 12.0}]},
            {"ref": "C1", "x": 11.0, "y": 10.0, "pads": [{"n": 1, "net": "3V3", "x": 11.0, "y": 10.0}, {"n": 2, "net": "GND", "x": 12.0, "y": 10.0}]},
            {"ref": "C2", "x": 30.0, "y": 10.0, "pads": [{"n": 1, "net": "3V3", "x": 30.0, "y": 10.0}, {"n": 2, "net": "GND", "x": 31.0, "y": 10.0}]}]"#);
        let dec = analyser_decouplage(&fps, 3.5).unwrap();
        assert_eq!(dec["total_caps_decouplage"].as_i64(), Some(2));
        assert_eq!(dec["conform_pct"].as_f64(), Some(50.0));
        assert_eq!(dec["details"][0]["conforme"], Json::Bool(true));
        assert_eq!(dec["details"][1]["conforme"], Json::Bool(false));
    }

    #[test]
    fn test_ordonnancement() {
        let ord_res = ordonnancer_placement(&l(r#"[{"ref": "J1"}, {"ref": "U1"}, {"ref": "Y1"}, {"ref": "R1"}, {"ref": "C1"}]"#)).unwrap();
        let tiers = &ord_res["tiers"];
        assert!(dans(&tiers["anchor"], "J1"));
        assert!(dans(&tiers["semi_fixed"], "U1"));
        assert!(dans(&tiers["flexible"], "Y1"));
        assert!(dans(&tiers["free"], "R1") && dans(&tiers["free"], "C1"));
    }

    #[test]
    fn test_evaluer_placement_pcb() {
        let res = evaluer_placement_pcb(&j(r#"{
            "board": {"w": 50, "h": 50},
            "footprints": [
                {"ref": "U1", "x": 20.0, "y": 20.0, "pads": [{"n": 1, "net": "VCC", "x": 20.0, "y": 20.0}]},
                {"ref": "C1", "x": 21.0, "y": 20.0, "pads": [{"n": 1, "net": "VCC", "x": 21.0, "y": 20.0}]}]}"#))
        .unwrap();
        assert_eq!(res["succes"], Json::Bool(true));
        assert!(res.get("hpwl_mm").is_some());
        assert!(res.get("congestion").is_some());
        assert!(res.get("decouplage").is_some());
        assert!(res.get("rotations_suggerees").is_none()); // O(n²), lue par personne : retiree
    }

    #[test]
    fn test_hpwl_masse_et_rails() {
        let fps = [
            fp("U1", 0.0, 0.0, &[(1, "GND", 0.0, 0.0), (2, "10V", 0.0, 0.0), (3, "SEUL", 0.0, 0.0)]),
            fp("U2", 30.0, 40.0, &[(1, "GND", 30.0, 40.0), (2, "10V", 30.0, 40.0)]),
        ];
        let (hpwl, par_net) = calculer_hpwl(&fps).unwrap();
        // La masse est exclue, un net à une seule pastille aussi ; 10V n'est PAS une masse
        assert!(!par_net.contains_key("GND"));
        assert!(!par_net.contains_key("SEUL"));
        assert_eq!(par_net["10V"].as_f64(), Some(70.0));
        assert_eq!(hpwl, 70.0);
        let (hpwl, par_net) = calculer_hpwl(&[]).unwrap();
        assert!(hpwl == 0.0 && par_net.is_empty());
    }

    #[test]
    fn test_hpwl_masses_variantes() {
        let masses = ["AGND", "DGND", "VSS", "0V", "GNDA"];
        let pads = |p: f64| masses.iter().enumerate().map(|(i, n)| (i as i64, *n, p, p)).collect::<Vec<_>>();
        let fps = [fp("A", 0.0, 0.0, &pads(0.0)), fp("B", 9.0, 9.0, &pads(9.0))];
        let (hpwl, par_net) = calculer_hpwl(&fps).unwrap();
        assert!(hpwl == 0.0 && par_net.is_empty(), "{par_net:?}");
        // 20V et 3V0 restent des rails
        let fps = [
            fp("A", 0.0, 0.0, &[(1, "20V", 0.0, 0.0), (2, "3V0", 0.0, 0.0)]),
            fp("B", 1.0, 0.0, &[(1, "20V", 1.0, 0.0), (2, "3V0", 1.0, 0.0)]),
        ];
        let (_, par_net) = calculer_hpwl(&fps).unwrap();
        let mut noms: Vec<&String> = par_net.keys().collect();
        noms.sort();
        assert_eq!(noms, ["20V", "3V0"]);
    }

    #[test]
    fn test_top_contributeurs_limites() {
        // Aucun net partagé : personne ne tire
        let fps = [fp("R1", 0.0, 0.0, &[(1, "A", 0.0, 0.0)]), fp("R2", 5.0, 5.0, &[(1, "B", 5.0, 5.0)])];
        assert!(top_contributeurs_hpwl(&fps, 5).unwrap().is_empty());
        // n borne la liste, tri décroissant, les extrémités d'abord
        let fps: Vec<Json> = (0..8).map(|i| fp(&format!("R{i}"), i as f64 * 10.0, 0.0, &[(1, "N", i as f64 * 10.0, 0.0)])).collect();
        let top = top_contributeurs_hpwl(&fps, 3).unwrap();
        assert_eq!(top.len(), 3);
        let d: Vec<f64> = top.iter().map(|t| t["deplacement_moyen_mm"].as_f64().unwrap()).collect();
        assert!(d.windows(2).all(|w| w[0] >= w[1]));
        assert!(top.iter().all(|t| ["R0", "R1", "R6", "R7"].contains(&t["ref"].as_str().unwrap())));
    }

    #[test]
    fn test_congestion_limites() {
        assert_eq!(analyser_congestion(&[], None, 5.0).unwrap()["peak_density"].as_i64(), Some(0));
        // Sans pastilles, le composant compte pour un
        let fps = l(r#"[{"ref": "R1", "x": 1.0, "y": 1.0}, {"ref": "R2", "x": 2.0, "y": 2.0}, {"ref": "R3", "x": 40.0, "y": 40.0}]"#);
        assert_eq!(analyser_congestion(&fps, None, 5.0).unwrap()["peak_density"].as_i64(), Some(2));
        // L'origine de la carte sert de référence à la grille
        let board = j(r#"{"x": 0.0, "y": 0.0, "w": 50, "h": 50}"#);
        let cong = analyser_congestion(&fps, Some(&board), 5.0).unwrap();
        assert!(cong["hotspot_x"].as_f64() == Some(2.5) && cong["hotspot_y"].as_f64() == Some(2.5), "{}", dumps(&cong));
        assert_eq!(cong["cell_size_mm"].as_f64(), Some(5.0));
    }

    #[test]
    fn test_decouplage_connecteur_pas_une_capa() {
        let fps = [fp("U1", 0.0, 0.0, &[(1, "VCC", 0.0, 0.0)]), fp("CONN1", 1.0, 0.0, &[(1, "VCC", 1.0, 0.0), (2, "GND", 2.0, 0.0)])];
        let dec = analyser_decouplage(&fps, 3.5).unwrap();
        assert_eq!(dec["total_caps_decouplage"].as_i64(), Some(0), "{}", dumps(&dec));
    }

    #[test]
    fn test_decouplage_cas_limites() {
        // Pas de condensateur : 100 % conforme par vacuité
        let dec = analyser_decouplage(&[fp("U1", 0.0, 0.0, &[(1, "VCC", 0.0, 0.0)])], 3.5).unwrap();
        assert!(dec["conform_pct"].as_f64() == Some(100.0) && dec["mean_dist_mm"] == Json::Nul);
        // Des condensateurs mais aucun CI : rien de conforme
        let dec = analyser_decouplage(&[fp("C1", 0.0, 0.0, &[(1, "VCC", 0.0, 0.0), (2, "GND", 1.0, 0.0)])], 3.5).unwrap();
        assert_eq!(dec["conform_pct"].as_f64(), Some(0.0));
        // Capa sur un autre rail que le CI : ignorée
        let fps = [fp("U1", 0.0, 0.0, &[(1, "3V3", 0.0, 0.0)]), fp("C1", 1.0, 0.0, &[(1, "5V", 1.0, 0.0), (2, "GND", 2.0, 0.0)])];
        let dec = analyser_decouplage(&fps, 3.5).unwrap();
        assert!(dec["total_caps_decouplage"].as_i64() == Some(0) && dumps(&dec["details"]) == "[]");
        // Un point de test TP1 n'est pas un CI
        let fps = [fp("TP1", 0.0, 0.0, &[(1, "VCC", 0.0, 0.0)]), fp("C1", 1.0, 0.0, &[(1, "VCC", 1.0, 0.0), (2, "GND", 2.0, 0.0)])];
        let dec = analyser_decouplage(&fps, 3.5).unwrap();
        assert!(dumps(&dec["details"]) == "[]" && dec["conform_pct"].as_f64() == Some(0.0), "{}", dumps(&dec));
        // Le plus proche des deux CI est retenu, à la frontière exacte de la cible
        let fps = [
            fp("U1", 0.0, 0.0, &[(1, "VDD", 0.0, 0.0)]),
            fp("U2", 10.0, 0.0, &[(1, "VDD", 10.0, 0.0)]),
            fp("C1", 6.5, 0.0, &[(1, "VDD", 6.5, 0.0), (2, "GND", 7.0, 0.0)]),
        ];
        let dec = analyser_decouplage(&fps, 3.5).unwrap();
        assert_eq!(dec["details"][0]["ic_ref"].as_str(), Some("U2"));
        assert_eq!(dec["details"][0]["conforme"], Json::Bool(true));
    }

    #[test]
    fn test_ordonnancement_prefixes() {
        let refs = ["LED1", "TRANS1", "TP1", "U1A", "j2", "MH1", "OSC1", "K1", "PWR1", "IC3", "Q2", "D1", "FB1", ""];
        let fps: Vec<Json> = refs.iter().map(|r| j(&format!(r#"{{"ref": "{r}"}}"#))).collect();
        let res = ordonnancer_placement(&fps).unwrap();
        let tiers = &res["tiers"];
        assert!(dans(&tiers["free"], "LED1"), "{}", dumps(tiers)); // pas une inductance L
        assert!(dans(&tiers["flexible"], "TRANS1"), "{}", dumps(tiers)); // pas un transistor T
        assert!(dans(&tiers["anchor"], "TP1"));
        assert!(dans(&tiers["semi_fixed"], "U1A"));
        assert!(dans(&tiers["anchor"], "j2")); // insensible à la casse
        assert!(dans(&tiers["anchor"], "MH1"));
        assert!(dans(&tiers["flexible"], "OSC1") && dans(&tiers["flexible"], "K1"));
        assert!(dans(&tiers["free"], "PWR1"));
        assert!(dans(&tiers["semi_fixed"], "IC3") && dans(&tiers["semi_fixed"], "Q2"));
        assert!(dans(&tiers["free"], "D1") && dans(&tiers["free"], "FB1"));
        let total: i64 = res["counts"].as_objet().unwrap().values().map(|v| v.as_i64().unwrap()).sum();
        assert_eq!(total as usize, refs.len() - 1); // le repère vide est ignoré
        assert_eq!(tries(&tiers["anchor"]), tiers["anchor"].as_liste().unwrap().iter().map(|e| e.as_str().unwrap()).collect::<Vec<_>>());
    }

    #[test]
    fn test_evaluer_placement_vide() {
        let res = evaluer_placement_pcb(&j("{}")).unwrap();
        assert_eq!(res["succes"], Json::Bool(true));
        assert_eq!(res["hpwl_mm"].as_f64(), Some(0.0));
        assert_eq!(dumps(&res["top_contributeurs"]), "[]");
        assert_eq!(dumps(&res["ordonnancement"]["counts"]), r#"{"anchor": 0, "semi_fixed": 0, "flexible": 0, "free": 0}"#);
    }

    /// python/test/banc-entrees-malformees.py : les refus des deux modules (ValueError, 422 au pont)
    #[test]
    fn refus_des_entrees_malformees() {
        for doc in [r#"{"footprints": "x"}"#, r#"{"footprints": [null]}"#] {
            assert_eq!(evaluer_placement_pcb(&j(doc)), Err("« footprints » : liste d'objets attendue".to_string()));
        }
        let refus = |doc: &str| crate::analyser_motifs_schema(&j(doc)).unwrap_err();
        assert_eq!(refus(r#"{"components": "x"}"#), "« components » : objet repère -> composant attendu");
        assert_eq!(refus(r#"{"components": [null]}"#), "« components » : objet repère -> composant attendu");
        assert_eq!(refus(r#"{"components": {"U1": "x"}}"#), "« components » : objet repère -> composant attendu");
        assert_eq!(refus(r#"{"nets": [null]}"#), "« nets » : objet nom -> liste de broches attendu");
        assert_eq!(refus(r#"{"nets": [{"name": 1}]}"#), "« nets » : objet nom -> liste de broches attendu");
    }
}
