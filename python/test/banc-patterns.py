#!/usr/bin/python3
# -*- coding: utf-8 -*-
"""
Banc d'essai automatisé pour le module python/pattern_recognition.py
"""

import os
import sys

DOSSIER_PYTHON = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if DOSSIER_PYTHON not in sys.path:
    sys.path.insert(0, DOSSIER_PYTHON)

from pattern_recognition import (
    identifier_alimentations,
    identifier_bus_numeriques,
    identifier_oscillateurs,
    identifier_filtres,
    estimer_courants_dc,
    analyser_motifs_schema,
)


def test_alimentation_ldo():
    comps = {
        "U1": {"val": "AMS1117-3.3", "type": "ic"},
        "C1": {"val": "10uF", "type": "cap"},
        "C2": {"val": "22uF", "type": "cap"}
    }
    nets = {
        "VIN": [{"ref": "U1", "pin": 3}, {"ref": "C1", "pin": 1}],
        "VCC_3V3": [{"ref": "U1", "pin": 2}, {"ref": "C2", "pin": 1}],
        "GND": [{"ref": "U1", "pin": 1}, {"ref": "C1", "pin": 2}, {"ref": "C2", "pin": 2}]
    }
    alims = identifier_alimentations(comps, nets)
    assert len(alims) == 1
    a = alims[0]
    assert a["subtype"] == "ldo"
    assert a["output_voltage"] == 3.3
    assert "U1" in a["components"]
    assert "C1" in a["components"] and "C2" in a["components"]
    print("[PASS] test_alimentation_ldo")


def test_bus_i2c():
    comps = {
        "U1": {"val": "ATmega328P", "type": "ic"},
        "R1": {"val": "4.7k", "type": "res"},
        "R2": {"val": "4.7k", "type": "res"}
    }
    nets = {
        "SDA": [{"ref": "U1", "pin": 27}, {"ref": "R1", "pin": 1}],
        "SCL": [{"ref": "U1", "pin": 28}, {"ref": "R2", "pin": 1}],
        "VCC": [{"ref": "R1", "pin": 2}, {"ref": "R2", "pin": 2}, {"ref": "U1", "pin": 7}]
    }
    bus = identifier_bus_numeriques(comps, nets)
    assert len(bus) == 1
    b = bus[0]
    assert b["subtype"] == "i2c"
    assert "SDA" in b["nets"] and "SCL" in b["nets"]
    assert "R1" in b["components"] and "R2" in b["components"]
    print("[PASS] test_bus_i2c")


def test_oscillateur():
    comps = {
        "Y1": {"val": "16MHz", "type": "crystal"},
        "C1": {"val": "22pF", "type": "cap"},
        "C2": {"val": "22pF", "type": "cap"}
    }
    nets = {
        "XTAL1": [{"ref": "Y1", "pin": 1}, {"ref": "C1", "pin": 1}],
        "XTAL2": [{"ref": "Y1", "pin": 2}, {"ref": "C2", "pin": 1}],
        "GND": [{"ref": "C1", "pin": 2}, {"ref": "C2", "pin": 2}]
    }
    oscs = identifier_oscillateurs(comps, nets)
    assert len(oscs) == 1
    o = oscs[0]
    assert o["main_component"] == "Y1"
    assert "C1" in o["components"] and "C2" in o["components"]
    print("[PASS] test_oscillateur")


def test_filtre_rc():
    comps = {
        "R1": {"val": "1k", "type": "res"},
        "C1": {"val": "100nF", "type": "cap"}
    }
    nets = {
        "AUDIO_IN": [{"ref": "R1", "pin": 1}],
        "AUDIO_FILT": [{"ref": "R1", "pin": 2}, {"ref": "C1", "pin": 1}],
        "GND": [{"ref": "C1", "pin": 2}]
    }
    flts = identifier_filtres(comps, nets)
    assert len(flts) == 1
    f = flts[0]
    assert f["subtype"] == "rc_lowpass"
    assert "R1" in f["components"] and "C1" in f["components"]
    print("[PASS] test_filtre_rc")


def test_analyser_motifs_complet():
    comps = {
        "U1": {"val": "AMS1117-3.3", "type": "ic"},
        "C1": {"val": "10uF", "type": "cap"},
        "R_LED": {"val": "330", "type": "res"}
    }
    nets = {
        "VCC_3V3": [{"ref": "U1", "pin": 2}, {"ref": "C1", "pin": 1}, {"ref": "R_LED", "pin": 1}],
        "GND": [{"ref": "U1", "pin": 1}, {"ref": "C1", "pin": 2}]
    }
    res = analyser_motifs_schema({"components": comps, "nets": nets})
    assert res["succes"] is True
    assert res["total_motifs"] >= 1
    assert "VCC_3V3" in res["classes_suggerees"]
    # Vérification des courants DC
    assert len(res["courants_dc_estimes"]) >= 1
    print("[PASS] test_analyser_motifs_complet")


def test_alimentation_buck():
    comps = {
        "U1": {"val": "MP1584", "type": "ic"},
        "L1": {"val": "10uH", "type": "inductor"},
        "D1": {"val": "B5819W", "type": "diode"},
        "C1": {"val": "10uF", "type": "cap"},
        "C2": {"val": "22uF", "type": "cap"},
        "R1": {"val": "10k", "type": "res"},
        "R2": {"val": "3.3k", "type": "res"}
    }
    nets = {
        "VIN": [{"ref": "U1", "pin": 1}, {"ref": "C1", "pin": 1}],
        "SW": [{"ref": "U1", "pin": 2}, {"ref": "L1", "pin": 1}, {"ref": "D1", "pin": 1}],
        "VOUT": [{"ref": "L1", "pin": 2}, {"ref": "C2", "pin": 1}, {"ref": "R1", "pin": 1}],
        "FB": [{"ref": "U1", "pin": 3}, {"ref": "R1", "pin": 2}, {"ref": "R2", "pin": 1}],
        "GND": [{"ref": "U1", "pin": 4}, {"ref": "D1", "pin": 2}, {"ref": "C1", "pin": 2}, {"ref": "C2", "pin": 2}, {"ref": "R2", "pin": 2}]
    }
    alims = identifier_alimentations(comps, nets)
    assert len(alims) >= 1
    buck = [a for a in alims if a.get("subtype") == "switching_regulator"][0]
    assert buck["layout_template"] == "buck_compact"
    assert buck["role_map"]["ic"] == "U1"
    assert buck["role_map"]["sw_inductor"] == "L1"
    assert "D1" in buck["role_map"]["diodes"]
    assert "C1" in buck["role_map"]["cin"]
    assert "C2" in buck["role_map"]["cout"]
    print("[PASS] test_alimentation_buck")


def test_zones_schematiques():
    comps = {
        "U1": {"val": "AMS1117-3.3", "type": "ic"},
        "C1": {"val": "10uF", "type": "cap"},
        "C2": {"val": "10uF", "type": "cap"},
        "U2": {"val": "STM32F103", "type": "ic"},
        "C3": {"val": "100nF", "type": "cap"}
    }
    nets = {
        "VCC": [{"ref": "U1", "pin": 2}, {"ref": "C2", "pin": 1}, {"ref": "U2", "pin": 1}, {"ref": "C3", "pin": 1}],
        "GND": [{"ref": "U1", "pin": 1}, {"ref": "C1", "pin": 2}, {"ref": "C2", "pin": 2}, {"ref": "U2", "pin": 2}, {"ref": "C3", "pin": 2}]
    }
    zones = [
        {
            "id": "zone_alim",
            "nom": "Alimentation 3.3V",
            "categorie": "Alimentation",
            "couleur": "#f59e0b",
            "composants": ["U1", "C1", "C2"]
        },
        {
            "id": "zone_mcu",
            "nom": "Cœur MCU",
            "categorie": "MCU",
            "couleur": "#3fa0ea",
            "composants": ["U2", "C3"]
        }
    ]
    res = analyser_motifs_schema({"components": comps, "nets": nets, "zones": zones})
    assert res["succes"] is True
    assert "zones" in res
    assert len(res["zones"]) == 2
    assert res["zones"][0]["nom"] == "Alimentation 3.3V"
    assert res["zones"][0]["ancre"] == "U1"
    assert res["zones"][1]["ancre"] == "U2"
    # Les zones doivent être incluses dans les motifs
    zm = [m for m in res["motifs"] if m.get("is_user_zone")]
    assert len(zm) == 2
    assert zm[0]["layout_template"] in ("buck_compact", "ldo_inline")
    assert zm[1]["layout_template"] == "mcu_decoupling"
    print("[PASS] test_zones_schematiques")


def test_valeur_en_ohms():
    from pattern_recognition import _valeur_en_ohms
    attendus = {
        "4.7k": 4700.0, "4k7": 4700.0, "100R": 100.0, "2R2": 2.2, "1M": 1e6,
        "330": 330.0, "10k": 1e4, "1k5": 1500.0, "47 Ohm": 47.0, "220Ω": 220.0,
    }
    for texte, ohms in attendus.items():
        v = _valeur_en_ohms(texte)
        assert v is not None and abs(v - ohms) < 1e-9, (texte, v)
    assert _valeur_en_ohms("") is None
    assert _valeur_en_ohms("DNP") is None
    print("[PASS] test_valeur_en_ohms")


def test_tension_ldo_ignore_le_repere():
    # U5 et U12 sont des repères, pas des tensions
    for ref in ("U5", "U12", "U15"):
        alims = identifier_alimentations({ref: {"val": "AMS1117-3.3"}}, {})
        assert alims[0]["output_voltage"] == 3.3, (ref, alims[0]["output_voltage"])
    # Sans tension lisible dans la valeur : 3,3 V par défaut
    alims = identifier_alimentations({"U1": {"val": "MCP1700"}}, {})
    assert alims[0]["output_voltage"] == 3.3
    alims = identifier_alimentations({"U1": {"val": "LP5907-1.8"}}, {})
    assert alims[0]["output_voltage"] == 1.8
    print("[PASS] test_tension_ldo_ignore_le_repere")


def test_regulateurs_78xx_79xx():
    attendus = {
        "L7805": 5.0, "LM7808": 8.0, "L7809": 9.0, "LM7812": 12.0, "MC7815": 15.0,
        "LM7824": 24.0, "L78L05": 5.0, "L7833": 3.3,
        "LM7905": -5.0, "LM7912": -12.0, "MC7915": -15.0,
    }
    for val, v in attendus.items():
        alims = identifier_alimentations({"U3": {"val": val}}, {})
        assert len(alims) == 1, val
        assert alims[0]["output_voltage"] == v, (val, alims[0]["output_voltage"])
        attendu_type = "linear_fixed_negative" if v < 0 else "linear_fixed_positive"
        assert alims[0]["subtype"] == attendu_type, (val, alims[0]["subtype"])
    print("[PASS] test_regulateurs_78xx_79xx")


def test_regulateur_ajustable():
    alims = identifier_alimentations({"U1": {"val": "LM317"}}, {})
    assert alims[0]["subtype"] == "linear_adjustable"
    assert alims[0]["output_voltage"] is None
    # Un composant quelconque n'est pas une alimentation
    assert identifier_alimentations({"U1": {"val": "STM32F103"}, "R1": {"val": "10k"}}, {}) == []
    print("[PASS] test_regulateur_ajustable")


def test_ldo_cin_cout():
    comps = {"U1": {"val": "AMS1117-3.3"}, "C1": {"val": "10uF"}, "C2": {"val": "22uF"},
             "R1": {"val": "1k"}}
    nets = {
        "VIN": [{"ref": "U1", "pin": 3}, {"ref": "C1", "pin": 1}],
        "VOUT": [{"ref": "U1", "pin": 2}, {"ref": "C2", "pin": 1}, {"ref": "R1", "pin": 1}],
        "GND": [{"ref": "U1", "pin": 1}, {"ref": "C1", "pin": 2}, {"ref": "C2", "pin": 2}],
    }
    a = identifier_alimentations(comps, nets)[0]
    assert a["role_map"]["cin"] == ["C1"], a["role_map"]
    assert a["role_map"]["cout"] == ["C2"], a["role_map"]
    assert "R1" in a["components"] and "R1" in a["role_map"]["passives"]
    assert set(a["nets"]) == {"VIN", "VOUT", "GND"}
    print("[PASS] test_ldo_cin_cout")


def test_i2c_pullups_et_sclk():
    comps = {"U1": {"val": "MCU"}, "R1": {"val": "4.7k"}, "R2": {"val": "4.7k"}, "R3": {"val": "10k"}}
    nets = {
        "I2C_SDA": [{"ref": "U1", "pin": 1}, {"ref": "R1", "pin": 1}],
        "I2C_SCL": [{"ref": "U1", "pin": 2}, {"ref": "R2", "pin": 2}],
        "3V3": [{"ref": "R1", "pin": 2}, {"ref": "R2", "pin": 1}, {"ref": "R3", "pin": 1}],
        "RESET": [{"ref": "U1", "pin": 3}, {"ref": "R3", "pin": 2}],
    }
    bus = identifier_bus_numeriques(comps, nets)
    i2c = [b for b in bus if b["subtype"] == "i2c"][0]
    # Pull-up dans les deux sens de câblage ; R3 (reset) n'en est pas un
    assert sorted(i2c["components"]) == ["R1", "R2"], i2c["components"]
    assert sorted(i2c["nets"]) == ["I2C_SCL", "I2C_SDA"]

    # L'horloge SPI SCLK n'est pas un bus I2C
    bus = identifier_bus_numeriques({}, {"SCLK": [], "MOSI": [], "MISO": [], "CS": []})
    assert [b["subtype"] for b in bus] == ["spi"], bus
    assert sorted(bus[0]["nets"]) == ["MISO", "MOSI", "SCLK"]
    print("[PASS] test_i2c_pullups_et_sclk")


def test_spi_uart_seuils():
    # Un seul net SPI ne fait pas un bus, un seul net UART non plus
    assert identifier_bus_numeriques({}, {"MOSI": [], "TXD": []}) == []
    bus = identifier_bus_numeriques({}, {"UART_TX": [], "UART_RX": [], "GND": []})
    assert [b["subtype"] for b in bus] == ["uart"]
    assert sorted(bus[0]["nets"]) == ["UART_RX", "UART_TX"]
    assert identifier_bus_numeriques({}, {}) == []
    print("[PASS] test_spi_uart_seuils")


def test_ferrite_pas_un_oscillateur():
    comps = {"FB1": {"val": "600R@100MHz"}, "L1": {"val": "10uH@1MHz"}, "C1": {"val": "100nF 1MHz"}}
    assert identifier_oscillateurs(comps, {}) == []
    # Un oscillateur actif sans repère Y/X reste reconnu par sa fréquence
    oscs = identifier_oscillateurs({"U4": {"val": "SG-8002 25MHz"}}, {})
    assert len(oscs) == 1 and oscs[0]["main_component"] == "U4"
    print("[PASS] test_ferrite_pas_un_oscillateur")


def test_oscillateur_masse_nommee_autrement():
    comps = {"Y1": {"val": "32.768kHz"}, "C1": {"val": "12pF"}, "C2": {"val": "12pF"}}
    nets = {
        "OSC32_IN": [{"ref": "Y1", "pin": 1}, {"ref": "C1", "pin": 1}],
        "OSC32_OUT": [{"ref": "Y1", "pin": 2}, {"ref": "C2", "pin": 1}],
        "DGND": [{"ref": "C1", "pin": 2}, {"ref": "C2", "pin": 2}],
    }
    o = identifier_oscillateurs(comps, nets)[0]
    assert o["role_map"]["c_loads"] == ["C1", "C2"], o["role_map"]
    # Condensateur qui ne va pas à la masse : pas une capa de charge
    nets["DGND"] = [{"ref": "C1", "pin": 2}]
    nets["3V3"] = [{"ref": "C2", "pin": 2}]
    o = identifier_oscillateurs(comps, nets)[0]
    assert o["role_map"]["c_loads"] == ["C1"]
    assert o["role_map"]["c_load_2"] is None
    print("[PASS] test_oscillateur_masse_nommee_autrement")


def test_filtre_rc_limites():
    # Capa vers GNDA : filtre reconnu
    comps = {"R1": {"val": "1k"}, "C1": {"val": "100nF"}}
    nets = {"IN": [{"ref": "R1", "pin": 1}],
            "OUT": [{"ref": "R1", "pin": 2}, {"ref": "C1", "pin": 1}],
            "GNDA": [{"ref": "C1", "pin": 2}]}
    assert len(identifier_filtres(comps, nets)) == 1
    # Capa côté rail d'alimentation : c'est un découplage, pas un filtre
    nets = {"VCC": [{"ref": "R1", "pin": 1}, {"ref": "C1", "pin": 1}],
            "SIG": [{"ref": "R1", "pin": 2}],
            "GND": [{"ref": "C1", "pin": 2}]}
    assert identifier_filtres(comps, nets) == []
    # Capa de liaison (pas à la masse) : pas un passe-bas
    nets = {"IN": [{"ref": "R1", "pin": 1}],
            "OUT": [{"ref": "R1", "pin": 2}, {"ref": "C1", "pin": 1}],
            "SUITE": [{"ref": "C1", "pin": 2}]}
    assert identifier_filtres(comps, nets) == []
    # Résistance à une seule patte câblée : ignorée
    nets = {"OUT": [{"ref": "R1", "pin": 2}, {"ref": "C1", "pin": 1}], "GND": [{"ref": "C1", "pin": 2}]}
    assert identifier_filtres(comps, nets) == []
    print("[PASS] test_filtre_rc_limites")


def test_courant_led_seulement_avec_une_led():
    comps = {"R1": {"val": "1k"}, "C1": {"val": "100nF"}, "R2": {"val": "330"}, "D2": {"val": "LED rouge"}}
    nets = {
        "IN": [{"ref": "R1", "pin": 1}],
        "FILT": [{"ref": "R1", "pin": 2}, {"ref": "C1", "pin": 1}],
        "3V3": [{"ref": "R2", "pin": 1}],
        "LED_A": [{"ref": "R2", "pin": 2}, {"ref": "D2", "pin": 1}],
        "GND": [{"ref": "C1", "pin": 2}, {"ref": "D2", "pin": 2}],
    }
    courants = estimer_courants_dc([], comps, nets)
    leds = [c for c in courants if c["type"] == "consommation_led"]
    # Seule R2 limite une LED ; R1 (filtre RC) n'est pas comptée
    assert [c["composant"] for c in leds] == ["R2"], leds
    assert abs(leds[0]["courant_ma"] - round(1.3 / 330 * 1000, 1)) < 1e-9
    # Sans nets : heuristique d'origine, compatibilité conservée
    sans = [c["composant"] for c in estimer_courants_dc([], comps) if c["type"] == "consommation_led"]
    assert sorted(sans) == ["R1", "R2"]
    # Hors plage 100 Ω - 4,7 kΩ : pas une LED
    comps = {"R1": {"val": "10k"}, "LED1": {"val": "verte"}}
    nets = {"A": [{"ref": "R1", "pin": 1}, {"ref": "LED1", "pin": 1}]}
    assert estimer_courants_dc([], comps, nets) == []
    print("[PASS] test_courant_led_seulement_avec_une_led")


def test_courants_regulateurs_et_ci():
    alims = [{"type": "power_supply", "subtype": "ldo", "main_component": "U1",
              "nets": ["VOUT"], "output_voltage": 3.3},
             {"type": "power_supply", "subtype": "switching_regulator", "main_component": "U2",
              "nets": [], "output_voltage": None}]
    comps = {"U1": {"val": "AMS1117-3.3", "type": "ic"}, "U2": {"val": "MP1584"},
             "U3": {"val": "STM32F103"}, "U4": {"val": "74HC595"}}
    courants = {c["composant"]: c for c in estimer_courants_dc(alims, comps, {})}
    assert courants["U1"]["courant_ma"] == 10.0 and courants["U1"]["role"] == "source"
    assert courants["U1"]["net"] == "VOUT"
    assert courants["U2"]["courant_ma"] == 25.0 and courants["U2"]["net"] == "VCC"
    # Un régulateur déjà compté comme source n'est pas recompté comme charge
    assert sum(1 for c in estimer_courants_dc(alims, comps, {}) if c["composant"] == "U1") == 1
    assert courants["U3"]["courant_ma"] == 50.0   # microcontrôleur
    assert courants["U4"]["courant_ma"] == 30.0   # logique ordinaire
    print("[PASS] test_courants_regulateurs_et_ci")


def test_zones_gabarits_et_alias():
    zones = [
        {"name": "Horloge", "category": "Oscillateur", "components": ["C9", "Y1"]},
        {"nom": "Filtrage", "categorie": "Filtre", "composants": ["R1", "C1"]},
        {"nom": "Buck", "categorie": "Alimentation", "composants": ["U2", "L1", "C3"]},
        {"nom": "Divers", "composants": "pas une liste"},
        "pas un dict",
    ]
    res = analyser_motifs_schema({"components": {}, "nets": {}, "rooms": zones})
    z = res["zones"]
    assert len(z) == 4, z                       # l'entrée non-dict est ignorée
    assert z[0]["ancre"] == "Y1"                # le quartz prime sur la capa
    assert z[1]["ancre"] == "R1"                # sans actif : premier composant
    assert z[3]["composants"] == [] and z[3]["ancre"] is None
    assert z[0]["id"] == "zone_1" and z[3]["nom"] == "Divers"
    gabarits = [m["layout_template"] for m in res["motifs"] if m.get("is_user_zone")]
    assert gabarits == ["crystal_symmetric", "filter_inline", "buck_compact", "cluster_free"], gabarits
    print("[PASS] test_zones_gabarits_et_alias")


def test_analyse_vide_et_classes():
    res = analyser_motifs_schema({})
    assert res["succes"] is True and res["total_motifs"] == 0
    assert res["motifs"] == [] and res["classes_suggerees"] == {} and res["courants_dc_estimes"] == []
    comps = {"Y1": {"val": "8MHz"}}
    nets = {"XIN": [{"ref": "Y1", "pin": 1}], "XOUT": [{"ref": "Y1", "pin": 2}],
            "SDA": [], "SCL": []}
    classes = analyser_motifs_schema({"components": comps, "nets": nets})["classes_suggerees"]
    assert classes["XIN"] == "Rapide" and classes["XOUT"] == "Rapide"
    assert classes["SDA"] == "Rapide" and classes["SCL"] == "Rapide"
    print("[PASS] test_analyse_vide_et_classes")


def test_nets_de_masse():
    from pattern_recognition import _nets_masse
    nets = {n: [] for n in ["GND", "AGND", "DGND", "GNDA", "VSS", "0V", "10V", "20V", "3V0", "VCC"]}
    assert sorted(_nets_masse(nets)) == ["0V", "AGND", "DGND", "GND", "GNDA", "VSS"]
    print("[PASS] test_nets_de_masse")


if __name__ == "__main__":
    test_alimentation_ldo()
    test_alimentation_buck()
    test_bus_i2c()
    test_oscillateur()
    test_filtre_rc()
    test_analyser_motifs_complet()
    test_zones_schematiques()
    test_valeur_en_ohms()
    test_tension_ldo_ignore_le_repere()
    test_regulateurs_78xx_79xx()
    test_regulateur_ajustable()
    test_ldo_cin_cout()
    test_i2c_pullups_et_sclk()
    test_spi_uart_seuils()
    test_ferrite_pas_un_oscillateur()
    test_oscillateur_masse_nommee_autrement()
    test_filtre_rc_limites()
    test_courant_led_seulement_avec_une_led()
    test_courants_regulateurs_et_ci()
    test_zones_gabarits_et_alias()
    test_analyse_vide_et_classes()
    test_nets_de_masse()
    print("\n TOUS LES TESTS DE PATTERN_RECOGNITION SONT VALIDÉS AVEC SUCCÈS.")

