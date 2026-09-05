#!/usr/bin/python3
# -*- coding: utf-8 -*-
"""
Banc d'essai automatisé pour le module python/pcb_scoring.py
"""

import os
import sys

# Ajout du dossier parent au sys.path
DOSSIER_PYTHON = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if DOSSIER_PYTHON not in sys.path:
    sys.path.insert(0, DOSSIER_PYTHON)

from pcb_scoring import (
    calculer_hpwl,
    top_contributeurs_hpwl,
    analyser_congestion,
    analyser_decouplage,
    ordonnancer_placement,
    evaluer_placement_pcb,
)


def test_hpwl_simple():
    fps = [
        {"ref": "R1", "x": 10.0, "y": 10.0, "pads": [
            {"n": 1, "net": "NET1", "x": 10.0, "y": 10.0},
            {"n": 2, "net": "NET2", "x": 12.0, "y": 10.0},
        ]},
        {"ref": "R2", "x": 20.0, "y": 25.0, "pads": [
            {"n": 1, "net": "NET1", "x": 20.0, "y": 25.0},
            {"n": 2, "net": "GND", "x": 22.0, "y": 25.0},
        ]}
    ]
    # NET1 va de (10, 10) à (20, 25) -> dx = 10, dy = 15 -> HPWL = 25
    hpwl, par_net = calculer_hpwl(fps)
    assert hpwl == 25.0, f"Attendu 25.0, obtenu {hpwl}"
    assert par_net["NET1"] == 25.0
    print("[PASS] test_hpwl_simple")


def test_top_contributeurs():
    fps = [
        {"ref": "U1", "x": 0.0, "y": 0.0, "pads": [
            {"n": 1, "net": "NET_LONG", "x": 0.0, "y": 0.0}
        ]},
        {"ref": "R1", "x": 100.0, "y": 100.0, "pads": [
            {"n": 1, "net": "NET_LONG", "x": 100.0, "y": 100.0}
        ]},
        {"ref": "C1", "x": 1.0, "y": 1.0, "pads": [
            {"n": 1, "net": "NET_COURT", "x": 1.0, "y": 1.0}
        ]},
        {"ref": "C2", "x": 2.0, "y": 2.0, "pads": [
            {"n": 1, "net": "NET_COURT", "x": 2.0, "y": 2.0}
        ]}
    ]
    worst = top_contributeurs_hpwl(fps, n=2)
    assert len(worst) == 2
    # U1 et R1 sont sur le net long (dist ~70.7mm au barycentre), C1 et C2 sur net court
    refs_worst = [w["ref"] for w in worst]
    assert "U1" in refs_worst and "R1" in refs_worst
    print("[PASS] test_top_contributeurs")


def test_congestion():
    # 5 pastilles concentrées autour de (10, 10)
    fps = [
        {"ref": f"R{i}", "x": 10.0 + i*0.2, "y": 10.0 + i*0.2, "pads": [
            {"n": 1, "net": "N", "x": 10.0 + i*0.2, "y": 10.0 + i*0.2}
        ]}
        for i in range(5)
    ]
    cong = analyser_congestion(fps, grille_mm=5.0)
    assert cong["peak_density"] == 5
    assert abs(cong["hotspot_x"] - 12.5) < 3.0
    print("[PASS] test_congestion")


def test_decouplage():
    # U1 avec pin VCC à (10, 10)
    # C1 (decouplage proche) avec pin VCC à (11, 10) -> distance 1 mm (conforme <= 3.5 mm)
    # C2 (decouplage loin) avec pin VCC à (30, 10) -> distance 20 mm (non conforme)
    fps = [
        {"ref": "U1", "x": 10.0, "y": 10.0, "pads": [
            {"n": 1, "net": "3V3", "x": 10.0, "y": 10.0},
            {"n": 2, "net": "GND", "x": 10.0, "y": 12.0}
        ]},
        {"ref": "C1", "x": 11.0, "y": 10.0, "pads": [
            {"n": 1, "net": "3V3", "x": 11.0, "y": 10.0},
            {"n": 2, "net": "GND", "x": 12.0, "y": 10.0}
        ]},
        {"ref": "C2", "x": 30.0, "y": 10.0, "pads": [
            {"n": 1, "net": "3V3", "x": 30.0, "y": 10.0},
            {"n": 2, "net": "GND", "x": 31.0, "y": 10.0}
        ]}
    ]
    dec = analyser_decouplage(fps, distance_cible_mm=3.5)
    assert dec["total_caps_decouplage"] == 2
    assert dec["conform_pct"] == 50.0
    assert dec["details"][0]["conforme"] is True
    assert dec["details"][1]["conforme"] is False
    print("[PASS] test_decouplage")


def test_ordonnancement():
    fps = [
        {"ref": "J1"}, {"ref": "U1"}, {"ref": "Y1"}, {"ref": "R1"}, {"ref": "C1"}
    ]
    ord_res = ordonnancer_placement(fps)
    tiers = ord_res["tiers"]
    assert "J1" in tiers["anchor"]
    assert "U1" in tiers["semi_fixed"]
    assert "Y1" in tiers["flexible"]
    assert "R1" in tiers["free"] and "C1" in tiers["free"]
    print("[PASS] test_ordonnancement")


def test_evaluer_placement_pcb():
    data = {
        "board": {"w": 50, "h": 50},
        "footprints": [
            {"ref": "U1", "x": 20.0, "y": 20.0, "pads": [{"n": 1, "net": "VCC", "x": 20.0, "y": 20.0}]},
            {"ref": "C1", "x": 21.0, "y": 20.0, "pads": [{"n": 1, "net": "VCC", "x": 21.0, "y": 20.0}]}
        ]
    }
    res = evaluer_placement_pcb(data)
    assert res["succes"] is True
    assert "hpwl_mm" in res
    assert "congestion" in res
    assert "decouplage" in res
    assert "rotations_suggerees" in res
    print("[PASS] test_evaluer_placement_pcb")


def test_rotation_optimale():
    # U1 au centre (x=20, y=20) avec rot=0°
    # Pin 1 en haut (ly=-2) reliée à NET_A
    # Pin 2 en bas (ly=+2) reliée à NET_B
    # Mais la cible NET_A est en bas à droite (x=30, y=25), et la cible NET_B est en haut à droite (x=30, y=15)
    # À 0°, les deux liaisons se croisent en X ! À 180°, elles sont directes sans croisement.
    fps = [
        {
            "ref": "U1", "x": 20.0, "y": 20.0, "rot": 0.0,
            "pads": [
                {"n": 1, "net": "NET_A", "x": 20.0, "y": 18.0, "lx": 0.0, "ly": -2.0},
                {"n": 2, "net": "NET_B", "x": 20.0, "y": 22.0, "lx": 0.0, "ly": 2.0}
            ]
        },
        {
            "ref": "TARGET_A", "x": 30.0, "y": 25.0, "rot": 0.0,
            "pads": [{"n": 1, "net": "NET_A", "x": 30.0, "y": 25.0}]
        },
        {
            "ref": "TARGET_B", "x": 30.0, "y": 15.0, "rot": 0.0,
            "pads": [{"n": 1, "net": "NET_B", "x": 30.0, "y": 15.0}]
        }
    ]

    from pcb_scoring import evaluer_rotation_composant, optimiser_rotations_placement
    diag = evaluer_rotation_composant("U1", fps)
    assert diag is not None
    assert diag["rotation_actuelle"] == 0
    assert diag["rotation_optimale"] == 180
    assert diag["croisements_actuels"] == 1
    assert diag["croisements_optimaux"] == 0
    assert diag["gain_croisements"] == 1
    assert diag["gain_longueur_mm"] > 0

    sugs = optimiser_rotations_placement(fps)
    assert len(sugs) == 1
    assert sugs[0]["ref"] == "U1"
    assert sugs[0]["rotation_optimale"] == 180
    print("[PASS] test_rotation_optimale")


if __name__ == "__main__":
    test_hpwl_simple()
    test_top_contributeurs()
    test_congestion()
    test_decouplage()
    test_ordonnancement()
    test_evaluer_placement_pcb()
    test_rotation_optimale()
    print("\n TOUS LES TESTS DE PCB_SCORING SONT VALIDÉS AVEC SUCCÈS.")
