//! Ce que visionneuse-ipc2581/test/banc-essai.py vérifie et que les essais du lecteur
//! (caisse ipc2581 de web_suite, src/essais.rs et essais/) ne tiennent pas déjà.
//!
//! DÉCOMPTE des 91 cas de banc-essai.py :
//!   - 64 ont leurs assertions dans ipc2581/src/essais.rs ;
//!   - 26 n'y sont tenus que par la comparaison de sortie : leurs entrées sont dans
//!     ipc2581/essais/ (manifeste.tsv, origine « banc-essai.py ») et le lecteur Rust doit y
//!     rendre, à l'octet, le JSON du lecteur Python (pastilles seules, contre-perçage,
//!     fichier sans <Ecad>, rugosités, place d'un texte, règles et paires, boîtiers,
//!     <Features>, <UserSpecial>, formes standard, thermique, repli, <FillDescRef>, unités
//!     d'un dictionnaire) ;
//!   - 1 l'était à moitié : « la nature des nets vient du meme moteur que la schematique »
//!     n'y passe qu'avec un moteur factice. Le voici avec le vrai moteur (caisse motifs) ;
//!   - 1 n'est porté nulle part : « un .sNp en matrice Upper est refuse au lieu d'etre mal
//!     lu » éprouve rf_reseau.lire_touchstone, qui n'est pas du lecteur IPC-2581 et n'a pas
//!     encore de caisse Rust. banc-essai.py reste donc dans le dépôt.

use ipc2581::{dumps, ipc2581_en_dict_avec, Json};

const CARTE: &[u8] = include_bytes!("../essais/ipc2581/carte-essai.xml");

#[test]
fn la_nature_des_nets_vient_du_meme_moteur_que_la_schematique() {
    let modele = ipc2581_en_dict_avec(CARTE, "carte-essai.xml", true, Some(&motifs::motifs_ipc2581)).unwrap();
    let classes = &modele["natures_nets"]["classes"];
    assert_eq!(classes["GND"].as_str(), Some("Masse"), "GND est Masse");
    assert!(classes.get("SIG_A").is_none(), "SIG_A sans indice");
    // quartz et USB : ce que _natures_nets donnait au moteur pour
    // [{"ref": "Y1", "val": "16MHz", "type": "", "pads": [{"n": 0}], "pins": []}], ["XIN", "USB_DP", "USB_DM"]
    let entree = motifs::py::loads(
        r#"{"components": {"Y1": {"val": "16MHz", "type": ""}}, "nets": {"XIN": [{"ref": "Y1", "pin": ""}], "USB_DP": [], "USB_DM": []}}"#,
    )
    .unwrap();
    let res: Json = motifs::motifs_ipc2581(&entree).expect("le moteur de motifs a échoué");
    assert_eq!(dumps(&res["classes_suggerees"]), r#"{"XIN": "Horloge", "USB_DP": "Rapide", "USB_DM": "Rapide"}"#);
}
