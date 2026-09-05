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


if __name__ == "__main__":
    test_alimentation_ldo()
    test_bus_i2c()
    test_oscillateur()
    test_filtre_rc()
    test_analyser_motifs_complet()
    print("\n TOUS LES TESTS DE PATTERN_RECOGNITION SONT VALIDÉS AVEC SUCCÈS.")
