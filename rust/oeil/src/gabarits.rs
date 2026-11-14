//! Les gabarits des protocoles, et leur polygone.

use std::sync::OnceLock;

use em::obj;
use em::simulation_em::base::*;

// ==========================================================================
// LES GABARITS
// --------------------------------------------------------------------------
// UNE SEULE SOURCE, ICI. La page les recoit par GET /api/oeil et ne les
// recopie pas : un gabarit corrige ici l'est partout.
//
// CONVENTIONS. Le temps est en UI, COMPTE DEPUIS L'INSTANT D'ECHANTILLONNAGE
// (0 = centre de l'oeil) ; les tensions sont en volts, a la broche du
// recepteur, differentielles en mode « diff » (donc centrees sur 0). Un
// polygone est CONVEXE et entoure son centre : c'est ce qui permet de calculer
// la marge exactement (voir `_jauge`).
//
// TROIS FORMES DE MASQUE :
//   polygone   points [[t_ui, v], ...] donnes tels quels ;
//   hexagone   largeur_ui (au seuil), plat_ui (largeur du plateau),
//              hauteur_v (crete a crete) -- plat_ui = 0 donne un losange ;
//   seuils     vil, vih : la zone interdite entre les deux seuils logiques,
//              de -setup a +hold autour de l'echantillonnage. C'est le
//              gabarit DERIVE des bus lents, qui n'en ont pas d'officiel.
//
// LA FIABILITE, sur chaque gabarit :
//   norme       valeurs relues dans le texte de la norme elle-meme ;
//   corrobore   valeurs recoupees avec une source publique (fiche de
//               fabricant, note d'application) -- la norme elle-meme, payante,
//               n'a pas ete lue ;
//   a_verifier  valeurs connues de la norme mais NON recoupees ici ;
//   derive      pas de gabarit officiel : construit a partir des seuils du
//               recepteur et de sa fenetre setup/hold.
// ==========================================================================

pub const FIABILITES: [(&str, &str); 4] = [
    ("norme", "Valeurs relues dans le texte de la norme elle-même. Le \
              contrôle reste un gabarit : pas un verdict de conformité."),
    ("corrobore", "Valeurs recoupées avec une source publique (fiche de \
                  fabricant, note d'application). La norme elle-même n'a \
                  pas été consultée."),
    ("a_verifier", "Valeurs de la norme NON recoupées par une source \
                   publique : à vérifier dans la version de la norme qui \
                   s'applique avant de conclure."),
    ("derive", "Gabarit non officiel : construit à partir des seuils du \
               récepteur (VIL/VIH, sensibilité) et de sa fenêtre \
               setup/hold. Pas un verdict de conformité."),
];

/// FIABILITES.get(cle, "")
pub fn fiabilite_texte(cle: &str) -> &'static str {
    FIABILITES.iter().find(|(k, _)| *k == cle).map_or("", |(_, t)| t)
}

fn fiabilites_json() -> Json {
    Json::Objet(FIABILITES.iter().map(|(k, t)| (k.to_string(), t.j())).collect())
}

/// Coefficients [c0, c1] d'une desaccentuation de `db` (negatif).
///
/// Desaccentuation = 20 log10((c0 - |c1|) / (c0 + |c1|)), avec
/// c0 + |c1| = 1 : l'excursion d'un bit de transition reste pleine.
pub fn _de_emphase(db: f64) -> Vec<f64> {
    let r = 10f64.powf(db / 20.0);
    let c1 = (1.0 - r) / 2.0;
    vec![round(1.0 - c1, 4), round(-c1, 4)]
}

/// GABARITS : la liste, construite une fois.
#[allow(non_snake_case)]
pub fn GABARITS() -> &'static [Json] {
    static G: OnceLock<Vec<Json>> = OnceLock::new();
    G.get_or_init(|| vec![
        // -- USB ----------------------------------------------------------------
        obj! {"id" => "usb2-hs-connecteur", "famille" => "USB",
         "nom" => "USB 2.0 HS — au connecteur (Template 1)",
         "debit" => 480e6, "mode" => "diff",
         "lieu" => "Au connecteur USB de la carte (TP2 d'un hub, TP3 d'un \
                 périphérique sans câble captif) : la piste va du PHY au \
                 connecteur, la charge est celle de l'appareil d'essai.",
         "fiabilite" => "corrobore",
         "source" => "USB 2.0 §7.1.2.2, Template 1 ; points recoupés dans la fiche \
                   Microchip DS00002142A (tableau 6-6 « Hi-Speed eye pattern » : \
                   0 V à 7,5 et 92,5 % UI, ±300 mV de 37,5 à 62,5 % UI) et chez \
                   Analog Devices (« Improving USB 2.0 Switched-System \
                   Response » : 0,375 UI, 300 mV).",
         "note" => "Les limites ±525 mV ne valent que dans l'UI qui suit une \
                 transition ; ±475 mV ailleurs. Le contrôle ci-dessous applique \
                 525 mV partout, donc il est un peu indulgent.",
         "masque" => obj! {"type" => "polygone",
                    "points" => vec![vec![-0.425, 0.0], vec![-0.125, 0.300], vec![0.125, 0.300],
                               vec![0.425, 0.0], vec![0.125, -0.300], vec![-0.125, -0.300]]},
         "v_max" => 0.525, "v_min" => -0.525,
         // Source de courant 17,78 mA dans 45 ohms par fil : 0,8 V a vide.
         "emetteur" => obj! {"v_haut" => 0.8, "v_bas" => -0.8, "r_source" => 90.0,
                      "tr" => 500e-12},
         "recepteur" => obj! {"r_charge" => 90.0, "c_charge" => 1e-12}},
        obj! {"id" => "usb2-hs-recepteur", "famille" => "USB",
         "nom" => "USB 2.0 HS — extrémité de câble (Template 2/4)",
         "debit" => 480e6, "mode" => "diff",
         "lieu" => "À l'entrée du récepteur, au bout de la liaison.",
         "fiabilite" => "norme",
         // RELU LE 22/10/2026 DANS LA COPIE OFFICIELLE DE LA SPECIFICATION USB 2.0
         // (usb.org) : §7.1.2.2, figure 7-14 (Template 2), et non 7-15 comme on
         // l'avait ecrit de memoire. Points 1 et 4 a 12,5 et 87,5 % UI (0 mV),
         // points 2, 3, 5 et 6 a 35 et 65 % UI (±175 mV), limites ±525 mV : ce
         // sont les six points ci-dessous. La norme ne parle pas de « TP3 pour un
         // hub » : la mention est retiree. Le Template 4 (figure 7-16, et non
         // 7-17 ; sensibilite du recepteur) n'a pas la meme forme : 0 V a 15 et
         // 85 % UI, ±150 mV a 35 et 65 % UI, niveaux ±575 mV ; il n'est pas
         // repris.
         "source" => "USB 2.0 §7.1.2.2, figure 7-14 (Template 2) : 0 mV à 12,5 \
                   et 87,5 % UI, ±175 mV de 35 à 65 % UI, limites ±525 mV \
                   (±475 mV hors transition). Relu dans la spécification \
                   USB 2.0 (usb.org, publique) le 22/10/2026 ; les mêmes points \
                   font le gabarit « far end » des logiciels de conformité \
                   (Tektronix TDSUSB2, Keysight U7242A).",
         "note" => "Six points et limites ±525 mV relus dans la figure 7-14 de la \
                 spécification. Le Template 4 (figure 7-16, sensibilité du \
                 récepteur : 0 V à 15 et 85 % UI, ±150 mV à 35 et 65 % UI, \
                 niveaux ±575 mV) n'est pas repris. Les \
                 limites ±525 mV s'appliquent partout ici, donc un peu \
                 indulgentes.",
         "masque" => obj! {"type" => "polygone",
                    "points" => vec![vec![-0.375, 0.0], vec![-0.15, 0.175], vec![0.15, 0.175],
                               vec![0.375, 0.0], vec![0.15, -0.175], vec![-0.15, -0.175]]},
         "v_max" => 0.525, "v_min" => -0.525,
         "emetteur" => obj! {"v_haut" => 0.8, "v_bas" => -0.8, "r_source" => 90.0,
                      "tr" => 500e-12},
         "recepteur" => obj! {"r_charge" => 90.0, "c_charge" => 1e-12}},
        obj! {"id" => "usb3-gen1", "famille" => "USB",
         "nom" => "USB 3.x Gen 1 (5 Gb/s) — après CTLE de référence",
         "debit" => 5e9, "mode" => "diff",
         "lieu" => "À l'entrée du récepteur (TP1), après l'égaliseur de référence.",
         "fiabilite" => "corrobore",
         "source" => "Hauteur 100 mV à ±0,05 UI du centre après égalisation : USB \
                   3.1 ECN « SSP System Jitter Budget » ; CTLE (Adc 0,667, \
                   zéro 650 MHz, pôles 1,95 et 5 GHz) cité depuis la figure du \
                   CTLE de référence de la spécification (forum Infineon). \
                   Largeur 0,34 UI = 1 − TJ 0,66 UI.",
         "note" => "Désaccentuation de l'émetteur −3,5 dB.",
         "masque" => obj! {"type" => "hexagone", "largeur_ui" => 0.34, "plat_ui" => 0.10,
                    "hauteur_v" => 0.100},
         "emetteur" => obj! {"v_haut" => 1.0, "v_bas" => -1.0, "r_source" => 100.0,
                      "tr" => 60e-12, "ffe" => _de_emphase(-3.5), "ffe_principal" => 0i64},
         "recepteur" => obj! {"r_charge" => 100.0, "c_charge" => 0.5e-12},
         "egaliseur" => obj! {"ctle" => obj! {"forme" => "usb3", "adc" => 0.667, "fz" => 650e6,
                                "fp1" => 1.95e9, "fp2" => 5e9}}},
        // -- PCI Express -----------------------------------------------------------
        obj! {"id" => "pcie-gen1", "famille" => "PCI Express",
         "nom" => "PCIe Gen 1 (2,5 GT/s) — récepteur",
         "debit" => 2.5e9, "mode" => "diff",
         "lieu" => "Aux broches du récepteur.",
         "fiabilite" => "corrobore",
         "source" => "VRX-DIFFp-p ≥ 175 mV et TRX-EYE ≥ 0,4 UI : fiche TI XIO2000 \
                   (tableau du récepteur 2,5 GT/s).",
         "note" => "Forme en losange supposée : la hauteur est exigée au centre, \
                 la largeur au seuil.",
         "masque" => obj! {"type" => "hexagone", "largeur_ui" => 0.40, "plat_ui" => 0.0,
                    "hauteur_v" => 0.175},
         "emetteur" => obj! {"v_haut" => 1.0, "v_bas" => -1.0, "r_source" => 100.0,
                      "tr" => 100e-12, "ffe" => _de_emphase(-3.5), "ffe_principal" => 0i64},
         "recepteur" => obj! {"r_charge" => 100.0, "c_charge" => 0.5e-12}},
        obj! {"id" => "pcie-gen2", "famille" => "PCI Express",
         "nom" => "PCIe Gen 2 (5 GT/s) — récepteur",
         "debit" => 5e9, "mode" => "diff",
         "lieu" => "Aux broches du récepteur (horloge commune).",
         "fiabilite" => "corrobore",
         "ber" => 1e-12,
         // PCIe 2.0 Base, §4.3.4 (5 GT/s, horloge commune) : VRX-DIFF-PP-CC >=
         // 120 mV et TRX-TJ-CC <= 0,40 UI, soit 0,60 UI d'ouverture a 1e-12.
         // Recoupe : guide de simulation PCIe de Microchip, tableau
         // « Specifications of the Received Signal for PCIe » (5 Gb/s : hauteur
         // 120 mV, largeur 0,6 UI). Le 0,4 UI qu'on lit parfois est la largeur
         // de 2,5 GT/s.
         "source" => "PCIe 2.0 Base §4.3.4 : VRX-DIFF-PP-CC ≥ 120 mV, \
                   TRX-TJ-CC ≤ 0,40 UI (largeur 0,60 UI à 10⁻¹²) ; recoupé \
                   dans le guide de simulation PCIe de Microchip (tableau \
                   « Specifications of the Received Signal », 5 Gb/s : 120 mV, \
                   0,6 UI).",
         "note" => "Désaccentuation de l'émetteur −3,5 dB (−6 dB possible). La \
                 largeur s'entend à 10⁻¹² : jugez-la sur le contour de taux \
                 d'erreur quand la gigue est saisie.",
         "masque" => obj! {"type" => "hexagone", "largeur_ui" => 0.60, "plat_ui" => 0.0,
                    "hauteur_v" => 0.120},
         "emetteur" => obj! {"v_haut" => 1.0, "v_bas" => -1.0, "r_source" => 100.0,
                      "tr" => 50e-12, "ffe" => _de_emphase(-3.5), "ffe_principal" => 0i64},
         "recepteur" => obj! {"r_charge" => 100.0, "c_charge" => 0.5e-12}},
        obj! {"id" => "pcie-gen3", "famille" => "PCI Express",
         "nom" => "PCIe Gen 3 (8 GT/s) — après égaliseur de référence",
         "debit" => 8e9, "mode" => "diff",
         "lieu" => "Derrière les broches du récepteur, après CTLE et DFE de \
                 référence.",
         "fiabilite" => "corrobore",
         "ber" => 1e-12,
         // PCIe 3.0 Base §4.3.4.5 (oeil stresse du recepteur, 8 GT/s) : EH >=
         // 25 mV et EW >= 0,3 UI a 1e-12, DERRIERE le CTLE et le DFE de
         // reference. Recoupements 2026-10 : CTLE a deux poles fixes 2 et 8 GHz
         // (fiche Tektronix des CTLE PCIe3/PCIe4), gain continu -6 a -12 dB par
         // pas de 1 dB (Pericom AN359, TI DS80PCI800), DFE a une prise bornee a
         // ±30 mV (brevet US 9 191 245, qui cite la norme), EH 25 mV / EW 0,3 UI
         // (forum allaboutcircuits -- source secondaire, la plus faible des
         // quatre ; la meme paire 15 mV / 0,3 UI se lit pour Gen 5 chez
         // Tektronix).
         "source" => "PCIe 3.0 Base §4.3.4.5 : EH ≥ 25 mV, EW ≥ 0,3 UI à 10⁻¹² \
                   après CTLE et DFE de référence. Pôles 2 et 8 GHz : fiche \
                   Tektronix des CTLE PCIe3 ; gain continu −6 à −12 dB : \
                   Pericom AN359, TI DS80PCI800 ; DFE ±30 mV : brevet \
                   US 9 191 245 ; EH/EW : source secondaire (forum), cohérente \
                   avec 15 mV / 0,3 UI cités pour Gen 5 par Tektronix.",
         "note" => "Le gain continu du CTLE est choisi parmi les sept réglages pour \
                 ouvrir l'œil au mieux. Émetteur : préréglage P7 (pré-accentuation \
                 −0,1, désaccentuation −0,2).",
         "masque" => obj! {"type" => "hexagone", "largeur_ui" => 0.30, "plat_ui" => 0.0,
                    "hauteur_v" => 0.025},
         "emetteur" => obj! {"v_haut" => 1.0, "v_bas" => -1.0, "r_source" => 100.0,
                      "tr" => 35e-12, "ffe" => vec![-0.1, 0.7, -0.2], "ffe_principal" => 1i64},
         "recepteur" => obj! {"r_charge" => 100.0, "c_charge" => 0.5e-12},
         "egaliseur" => obj! {"ctle" => obj! {"forme" => "pcie3", "fp1" => 2e9, "fp2" => 8e9,
                                "adc_db" => vec![-6i64, -7, -8, -9, -10, -11, -12]},
                       "dfe" => obj! {"prises" => 1i64, "max_v" => 0.030}}},
        // -- Vidéo et écrans -------------------------------------------------------
        obj! {"id" => "hdmi14-tmds", "famille" => "Vidéo et écrans",
         "nom" => "HDMI 1.4 TMDS — récepteur (TP2)",
         "debit" => 3.4e9, "mode" => "diff",
         "lieu" => "Au connecteur du récepteur (TP2).",
         "fiabilite" => "corrobore",
         // RECOUPE EN 2026-10 PAR UNE SOURCE SECONDAIRE. La specification HDMI 1.4
         // et sa procedure de conformite (CTS) ne sont diffusees qu'aux
         // adoptants, sous accord : le masque du puits a TP2 (§4.2.6, figure
         // 4-32) n'a pas ete lu. Le logiciel ouvert ngscopeclient (scopehal-apps,
         // src/ngscopeclient/masks/hdmi-1.4-sink-tp2.yml, « HDMI v1.4b figure
         // 4-32 ») le publie : hexagone 0 V a ±0,35 UI, ±75 mV de -0,25 a
         // +0,25 UI, zones interdites au-dela de ±780 mV. Ce sont les points
         // ci-dessous. Avant, un gabarit derive (0,6 UI, plateau 0,2 UI, 150 mV,
         // sensibilite d'un recepteur TMDS) : la hauteur etait la meme. Ce
         // qu'on trouve chez ST (AN5121) et TI (TMDS181) -- 0,6 UI / 335 mV a
         // 3,4 Gb/s -- est le masque de la SOURCE au bout du cable de reference
         // de HDMI 2.0, une autre exigence.
         "source" => "HDMI 1.4b §4.2.6, figure 4-32 (masque du puits à TP2), \
                   d'après le masque publié par le logiciel ouvert ngscopeclient \
                   (hdmi-1.4-sink-tp2.yml) : 0 mV à ±0,35 UI, ±75 mV de −0,25 à \
                   +0,25 UI, limites ±780 mV. La norme, diffusée sous accord, \
                   n'a pas été lue.",
         "note" => "Source secondaire : relisez la figure 4-32 pour un verdict de \
                 conformité HDMI. L'émetteur TMDS est une source de courant \
                 (10 mA) sans terminaison de départ : les réflexions qui \
                 reviennent ne sont pas absorbées côté émetteur.",
         "masque" => obj! {"type" => "polygone",
                    "points" => vec![vec![-0.35, 0.0], vec![-0.25, 0.075], vec![0.25, 0.075],
                               vec![0.35, 0.0], vec![0.25, -0.075], vec![-0.25, -0.075]]},
         "v_max" => 0.780, "v_min" => -0.780,
         "emetteur" => obj! {"v_haut" => 5.5, "v_bas" => -5.5, "r_source" => 1000.0,
                      "tr" => 100e-12},
         "recepteur" => obj! {"r_charge" => 100.0, "c_charge" => 1e-12}},
        obj! {"id" => "lvds", "famille" => "Vidéo et écrans",
         "nom" => "LVDS (TIA/EIA-644) — récepteur",
         "debit" => 400e6, "mode" => "diff",
         "lieu" => "Aux broches du récepteur.",
         "fiabilite" => "derive",
         // LES VALEURS DU COMPOSANT, PAS SEULEMENT DE LA NORME : les recepteurs
         // du commerce (SN65LVDS32, DS90LV028A) garantissent leur basculement a
         // ±100 mV -- c'est le pire cas qu'on retient --, et leur fiche ne donne
         // pas de fenetre setup/hold propre : elle appartient au deserialiseur
         // qui suit. D'ou 0,5 UI, a remplacer par la sienne.
         "source" => "Seuil du récepteur ±100 mV (TIA/EIA-644), garanti tel quel \
                   par les récepteurs courants (SN65LVDS32, DS90LV028A : \
                   VIT ±100 mV au plus). Largeur 0,5 UI supposée : la fenêtre \
                   est celle du désérialiseur qui suit, à reprendre de sa \
                   fiche.",
         "note" => "Driver à courant de 3,5 mA, terminaison 100 Ω au récepteur.",
         "masque" => obj! {"type" => "hexagone", "largeur_ui" => 0.50, "plat_ui" => 0.20,
                    "hauteur_v" => 0.200},
         "emetteur" => obj! {"v_haut" => 3.85, "v_bas" => -3.85, "r_source" => 1000.0,
                      "tr" => 300e-12},
         "recepteur" => obj! {"r_charge" => 100.0, "c_charge" => 2e-12}},
        obj! {"id" => "mipi-dphy-hs", "famille" => "Vidéo et écrans",
         "nom" => "MIPI D-PHY HS — récepteur",
         "debit" => 1e9, "mode" => "diff",
         "lieu" => "Aux broches du récepteur.",
         "fiabilite" => "derive",
         "source" => "Seuils ±70 mV (VIDTH / VIDTL, D-PHY v1.2) : fiches \
                   Microchip SAM9X7, Intel AN 754, TI TDA2 — c'est le pire cas \
                   retenu ; un récepteur réel peut faire mieux (Efinix T55, \
                   D-PHY v1.1 : VIDTH 40 mV au plus). Fenêtre setup + hold de \
                   0,3 UI (TSETUP[RX] 0,15 + THOLD[RX] 0,15 UI, tableau des \
                   temps données-horloge de D-PHY) non recoupée.",
         "note" => "Émetteur HS terminé 50 Ω par fil, ±200 mV différentiel sur \
                 100 Ω.",
         "masque" => obj! {"type" => "hexagone", "largeur_ui" => 0.30, "plat_ui" => 0.30,
                    "hauteur_v" => 0.140},
         "emetteur" => obj! {"v_haut" => 0.4, "v_bas" => -0.4, "r_source" => 100.0,
                      "tr" => 150e-12},
         "recepteur" => obj! {"r_charge" => 100.0, "c_charge" => 1e-12}},
        // -- Stockage et réseau ----------------------------------------------------
        obj! {"id" => "sata-gen1", "famille" => "Stockage et réseau",
         "nom" => "SATA Gen 1 (1,5 Gb/s) — récepteur",
         "debit" => 1.5e9, "mode" => "diff",
         "lieu" => "Aux broches du récepteur.",
         "fiabilite" => "corrobore",
         "ber" => 1e-12,
         // SATA rev. 3.x §7.2 (recepteur, iSATA) : amplitude minimale 325 mVppd
         // en Gen 1i. LARGEUR = 1 - TJ du signal de tolerance a la gigue du
         // recepteur (§7.4.12/7.4.13). Recoupe : procedure de test SATA-IO
         // (SyntheSys/BERTScope, « SATA_PHY_MOI ») -- « smallest bit of the lone
         // bit pattern » 325 mV, gigue totale 0,51 UI. Avant 2026-10 : largeur
         // 0,4 UI pour les trois et un plateau de 0,1 UI, ni l'une ni l'autre
         // recoupes ; le losange (plateau nul) ne suppose rien de plus que les
         // deux exigences.
         "source" => "SATA rev. 3.x : 325 mVppd minimum (Gen 1i) ; largeur \
                   1 − TJ = 0,49 UI d'après la tolérance à la gigue du \
                   récepteur. Recoupé dans la procédure de test SATA-IO \
                   (SyntheSys/BERTScope) : bit isolé ≥ 325 mV, gigue totale \
                   0,51 UI.",
         "note" => "",
         "masque" => obj! {"type" => "hexagone", "largeur_ui" => 0.49, "plat_ui" => 0.0,
                    "hauteur_v" => 0.325},
         "emetteur" => obj! {"v_haut" => 0.5, "v_bas" => -0.5, "r_source" => 100.0,
                      "tr" => 100e-12},
         "recepteur" => obj! {"r_charge" => 100.0, "c_charge" => 0.5e-12}},
        obj! {"id" => "sata-gen2", "famille" => "Stockage et réseau",
         "nom" => "SATA Gen 2 (3 Gb/s) — récepteur",
         "debit" => 3e9, "mode" => "diff",
         "lieu" => "Aux broches du récepteur.",
         "fiabilite" => "corrobore",
         "ber" => 1e-12,
         // SATA rev. 3.x §7.2 (recepteur, iSATA) : amplitude minimale 275 mVppd
         // en Gen 2i. LARGEUR = 1 - TJ du signal de tolerance a la gigue du
         // recepteur (§7.4.12/7.4.13). Recoupe : procedure de test SATA-IO
         // (SyntheSys/BERTScope, « SATA_PHY_MOI ») -- « smallest bit of the lone
         // bit pattern » 275 mV, gigue totale 0,57 UI. Avant 2026-10 : largeur
         // 0,4 UI pour les trois et un plateau de 0,1 UI, ni l'une ni l'autre
         // recoupes ; le losange (plateau nul) ne suppose rien de plus que les
         // deux exigences.
         "source" => "SATA rev. 3.x : 275 mVppd minimum (Gen 2i) ; largeur \
                   1 − TJ = 0,43 UI d'après la tolérance à la gigue du \
                   récepteur. Recoupé dans la procédure de test SATA-IO \
                   (SyntheSys/BERTScope) : bit isolé ≥ 275 mV, gigue totale \
                   0,57 UI.",
         "note" => "",
         "masque" => obj! {"type" => "hexagone", "largeur_ui" => 0.43, "plat_ui" => 0.0,
                    "hauteur_v" => 0.275},
         "emetteur" => obj! {"v_haut" => 0.5, "v_bas" => -0.5, "r_source" => 100.0,
                      "tr" => 67e-12},
         "recepteur" => obj! {"r_charge" => 100.0, "c_charge" => 0.5e-12}},
        obj! {"id" => "sata-gen3", "famille" => "Stockage et réseau",
         "nom" => "SATA Gen 3 (6 Gb/s) — récepteur",
         "debit" => 6e9, "mode" => "diff",
         "lieu" => "Aux broches du récepteur.",
         "fiabilite" => "corrobore",
         "ber" => 1e-12,
         // SATA rev. 3.x §7.2 (recepteur, iSATA) : amplitude minimale 240 mVppd
         // en Gen 3i. LARGEUR = 1 - TJ du signal de tolerance a la gigue du
         // recepteur (§7.4.12/7.4.13). Recoupe : procedure de test SATA-IO
         // (SyntheSys/BERTScope, « SATA_PHY_MOI ») -- « smallest bit of the lone
         // bit pattern » 240 mV, gigue totale 0,57 UI. Avant 2026-10 : largeur
         // 0,4 UI pour les trois et un plateau de 0,1 UI, ni l'une ni l'autre
         // recoupes ; le losange (plateau nul) ne suppose rien de plus que les
         // deux exigences.
         // Un ECN propose (SATA-IO, ECN 050) d'abaisser ce minimum a 200 mV du
         // cote du peripherique : son adoption n'a pas pu etre confirmee.
         "source" => "SATA rev. 3.x : 240 mVppd minimum (Gen 3i) ; largeur \
                   1 − TJ = 0,43 UI d'après la tolérance à la gigue du \
                   récepteur. Recoupé dans la procédure de test SATA-IO \
                   (SyntheSys/BERTScope) : bit isolé ≥ 240 mV, gigue totale \
                   0,57 UI.",
         "note" => "",
         "masque" => obj! {"type" => "hexagone", "largeur_ui" => 0.43, "plat_ui" => 0.0,
                    "hauteur_v" => 0.240},
         "emetteur" => obj! {"v_haut" => 0.5, "v_bas" => -0.5, "r_source" => 100.0,
                      "tr" => 40e-12},
         "recepteur" => obj! {"r_charge" => 100.0, "c_charge" => 0.5e-12}},
        obj! {"id" => "sgmii", "famille" => "Stockage et réseau",
         "nom" => "SGMII / 1000BASE-X (1,25 Gb/s) — récepteur",
         "debit" => 1.25e9, "mode" => "diff",
         "lieu" => "Aux broches du récepteur (liaison PHY ↔ MAC).",
         "fiabilite" => "corrobore",
         "source" => "Sensibilité 100 mV crête à crête : fiche Freescale MSC8152. \
                   Largeur 0,4 UI supposée.",
         "note" => "L'Ethernet cuivre (100BASE-TX en MLT-3, 1000BASE-T en PAM-5) \
                 n'est pas binaire : il n'a pas de gabarit ici.",
         "masque" => obj! {"type" => "hexagone", "largeur_ui" => 0.40, "plat_ui" => 0.10,
                    "hauteur_v" => 0.100},
         "emetteur" => obj! {"v_haut" => 0.7, "v_bas" => -0.7, "r_source" => 100.0,
                      "tr" => 120e-12},
         "recepteur" => obj! {"r_charge" => 100.0, "c_charge" => 1e-12}},
        // -- Bus lents, CMOS simple ------------------------------------------------
        obj! {"id" => "spi-lvcmos33", "famille" => "Bus lents (CMOS)",
         "nom" => "SPI — LVCMOS 3,3 V",
         "debit" => 25e6, "mode" => "simple",
         "lieu" => "À la broche d'entrée du récepteur (MOSI côté esclave, MISO côté \
                 maître).",
         "fiabilite" => "derive",
         "source" => "Seuils LVCMOS/LVTTL 3,3 V (JESD8) : VIH 2,0 V, VIL 0,8 V. \
                   Setup/hold : ceux du récepteur, à reprendre de sa fiche.",
         "note" => "L'œil est centré au mieux : le décalage entre la donnée et \
                 l'horloge est l'affaire de l'onglet « Bus synchrone ».",
         "masque" => obj! {"type" => "seuils", "vil" => 0.8, "vih" => 2.0},
         "v_max" => 3.6, "v_min" => -0.3,
         "setup" => 3e-9, "hold" => 3e-9,
         "emetteur" => obj! {"v_haut" => 3.3, "v_bas" => 0.0, "r_source" => 40.0,
                      "tr" => 1.5e-9},
         "recepteur" => obj! {"r_charge" => 0.0, "c_charge" => 5e-12}},
        obj! {"id" => "spi-lvcmos18", "famille" => "Bus lents (CMOS)",
         "nom" => "SPI — LVCMOS 1,8 V",
         "debit" => 50e6, "mode" => "simple",
         "lieu" => "À la broche d'entrée du récepteur.",
         "fiabilite" => "derive",
         "source" => "Seuils LVCMOS 1,8 V (JESD8-7) : VIH 0,65 VDD, VIL 0,35 VDD.",
         "note" => "",
         "masque" => obj! {"type" => "seuils", "vil" => 0.63, "vih" => 1.17},
         "v_max" => 2.1, "v_min" => -0.3,
         "setup" => 2e-9, "hold" => 2e-9,
         "emetteur" => obj! {"v_haut" => 1.8, "v_bas" => 0.0, "r_source" => 40.0,
                      "tr" => 1e-9},
         "recepteur" => obj! {"r_charge" => 0.0, "c_charge" => 4e-12}},
        obj! {"id" => "qspi-33", "famille" => "Bus lents (CMOS)",
         "nom" => "QSPI (mémoire flash) — 3,3 V",
         "debit" => 80e6, "mode" => "simple",
         "lieu" => "À la broche de la mémoire (écriture) ou du contrôleur \
                 (lecture).",
         "fiabilite" => "derive",
         "source" => "Seuils LVCMOS 3,3 V ; setup 2 ns / hold 3 ns, ordre de \
                   grandeur des mémoires flash QSPI courantes.",
         "note" => "",
         "masque" => obj! {"type" => "seuils", "vil" => 0.8, "vih" => 2.0},
         "v_max" => 3.6, "v_min" => -0.3,
         "setup" => 2e-9, "hold" => 3e-9,
         "emetteur" => obj! {"v_haut" => 3.3, "v_bas" => 0.0, "r_source" => 33.0,
                      "tr" => 1e-9},
         "recepteur" => obj! {"r_charge" => 0.0, "c_charge" => 6e-12}},
        obj! {"id" => "sd-hs", "famille" => "Bus lents (CMOS)",
         "nom" => "Carte SD High Speed (50 MHz) — 3,3 V",
         "debit" => 50e6, "mode" => "simple",
         "lieu" => "Au connecteur de la carte SD.",
         "fiabilite" => "derive",
         "source" => "SD : VIH 0,625 VDD, VIL 0,25 VDD ; tISU 6 ns, tIH 2 ns en \
                   High Speed.",
         "note" => "",
         "masque" => obj! {"type" => "seuils", "vil" => 0.825, "vih" => 2.0625},
         "v_max" => 3.6, "v_min" => -0.3,
         "setup" => 6e-9, "hold" => 2e-9,
         "emetteur" => obj! {"v_haut" => 3.3, "v_bas" => 0.0, "r_source" => 40.0,
                      "tr" => 2e-9},
         "recepteur" => obj! {"r_charge" => 0.0, "c_charge" => 10e-12}},
        obj! {"id" => "emmc-hs52", "famille" => "Bus lents (CMOS)",
         "nom" => "eMMC High Speed (52 MHz) — 3,3 V",
         "debit" => 52e6, "mode" => "simple",
         "lieu" => "À la broche de l'eMMC.",
         "fiabilite" => "derive",
         "source" => "eMMC : VIH 0,625 VCCQ, VIL 0,25 VCCQ ; tISU 3 ns, tIH 3 ns.",
         "note" => "",
         "masque" => obj! {"type" => "seuils", "vil" => 0.825, "vih" => 2.0625},
         "v_max" => 3.6, "v_min" => -0.3,
         "setup" => 3e-9, "hold" => 3e-9,
         "emetteur" => obj! {"v_haut" => 3.3, "v_bas" => 0.0, "r_source" => 40.0,
                      "tr" => 1.5e-9},
         "recepteur" => obj! {"r_charge" => 0.0, "c_charge" => 6e-12}},
    ])
}

/// Le gabarit `ident`, ou None.
pub fn gabarit(ident: &str) -> Option<&'static Json> {
    GABARITS().iter().find(|g| g["id"].as_str() == Some(ident))
}

/// Le masque de `g` en polygone [[t_ui, v], ...], ou [] s'il n'en a pas.
///
/// `ui`, `setup` et `hold` (s) ne servent qu'aux masques « seuils », dont la
/// largeur est une duree et non une fraction d'UI.
pub fn polygone(g: Option<&Json>, ui: Option<f64>, setup: Option<f64>, hold: Option<f64>) -> Vec<[f64; 2]> {
    let Some(g) = g else { return Vec::new() };
    let m = &g["masque"];
    match m["type"].as_str() {
        Some("polygone") => els(&m["points"]).iter().map(|p| [nb(&p[0]), nb(&p[1])]).collect(),
        Some("hexagone") => {
            let w = nb(&m["largeur_ui"]) / 2.0;
            let p = minf(&[numd(m, "plat_ui", 0.0) / 2.0, w]);
            let h = nb(&m["hauteur_v"]) / 2.0;
            if p <= 0.0 {
                return vec![[-w, 0.0], [0.0, h], [w, 0.0], [0.0, -h]];
            }
            vec![[-w, 0.0], [-p, h], [p, h], [w, 0.0], [p, -h], [-p, -h]]
        }
        Some("seuils") => {
            let Some(ui) = ui.filter(|u| *u != 0.0) else { return Vec::new() };
            let su = setup.unwrap_or_else(|| numd(g, "setup", 0.0)) / ui;
            let ho = hold.unwrap_or_else(|| numd(g, "hold", 0.0)) / ui;
            if su + ho <= 0.0 {
                return Vec::new();
            }
            let (vil, vih) = (nb(&m["vil"]), nb(&m["vih"]));
            vec![[-su, vil], [-su, vih], [ho, vih], [ho, vil]]
        }
        _ => Vec::new(),
    }
}

/// Un polygone en liste de listes.
pub fn poly_json(p: &[[f64; 2]]) -> Json {
    Json::Liste(p.iter().map(|q| vec![q[0], q[1]].j()).collect())
}

pub fn etat() -> Json {
    let mut liste = Vec::new();
    for g in GABARITS() {
        let mut d = g.clone();
        poser(&mut d, "fiabilite_texte", fiabilite_texte(txt(g, "fiabilite")));
        if g["masque"]["type"].as_str() != Some("seuils") {
            poser(&mut d, "polygone", poly_json(&polygone(Some(g), None, None, None)));
        }
        liste.push(d);
    }
    obj! {"dispo" => true, "version" => crate::VERSION, "gabarits" => liste,
          "fiabilites" => fiabilites_json(),
          // LA CHAINE DES VERSIONS : ce que l'oeil a sous lui.
          "moteurs" => obj! {"oeil" => crate::VERSION,
                             "ibis" => ibis::VERSION,
                             "simulation_em" => em::simulation_em::VERSION}}
}
