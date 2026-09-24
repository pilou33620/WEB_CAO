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


def _fp(ref, x, y, *pads, rot=0.0):
    """Empreinte minimale : pads = (n, net, x, y)."""
    return {"ref": ref, "x": x, "y": y, "rot": rot,
            "pads": [{"n": n, "net": net, "x": px, "y": py} for n, net, px, py in pads]}


def test_hpwl_masse_et_rails():
    fps = [
        _fp("U1", 0, 0, (1, "GND", 0, 0), (2, "10V", 0, 0), (3, "SEUL", 0, 0)),
        _fp("U2", 30, 40, (1, "GND", 30, 40), (2, "10V", 30, 40)),
    ]
    hpwl, par_net = calculer_hpwl(fps)
    # La masse est exclue, un net à une seule pastille aussi ; 10V n'est PAS une masse
    assert "GND" not in par_net
    assert "SEUL" not in par_net
    assert par_net["10V"] == 70.0, par_net
    assert hpwl == 70.0
    assert calculer_hpwl([]) == (0.0, {})
    print("[PASS] test_hpwl_masse_et_rails")


def test_hpwl_masses_variantes():
    masses = ["AGND", "DGND", "VSS", "0V", "GNDA"]
    fps = [
        _fp("A", 0, 0, *[(i, n, 0, 0) for i, n in enumerate(masses)]),
        _fp("B", 9, 9, *[(i, n, 9, 9) for i, n in enumerate(masses)]),
    ]
    hpwl, par_net = calculer_hpwl(fps)
    assert hpwl == 0.0 and par_net == {}, par_net
    # 20V et 3V0 restent des rails
    fps = [_fp("A", 0, 0, (1, "20V", 0, 0), (2, "3V0", 0, 0)),
           _fp("B", 1, 0, (1, "20V", 1, 0), (2, "3V0", 1, 0))]
    _, par_net = calculer_hpwl(fps)
    assert set(par_net) == {"20V", "3V0"}, par_net
    print("[PASS] test_hpwl_masses_variantes")


def test_top_contributeurs_limites():
    # Aucun net partagé : personne ne tire
    fps = [_fp("R1", 0, 0, (1, "A", 0, 0)), _fp("R2", 5, 5, (1, "B", 5, 5))]
    assert top_contributeurs_hpwl(fps) == []
    # n borne la liste, tri décroissant, les extrémités d'abord
    fps = [_fp(f"R{i}", i * 10.0, 0, (1, "N", i * 10.0, 0)) for i in range(8)]
    top = top_contributeurs_hpwl(fps, n=3)
    assert len(top) == 3
    d = [t["deplacement_moyen_mm"] for t in top]
    assert d == sorted(d, reverse=True)
    assert {t["ref"] for t in top} <= {"R0", "R1", "R6", "R7"}
    print("[PASS] test_top_contributeurs_limites")


def test_congestion_limites():
    assert analyser_congestion([])["peak_density"] == 0
    # Sans pastilles, le composant compte pour un
    fps = [{"ref": "R1", "x": 1.0, "y": 1.0}, {"ref": "R2", "x": 2.0, "y": 2.0},
           {"ref": "R3", "x": 40.0, "y": 40.0}]
    assert analyser_congestion(fps, grille_mm=5.0)["peak_density"] == 2
    # L'origine de la carte sert de référence à la grille
    board = {"x": 0.0, "y": 0.0, "w": 50, "h": 50}
    cong = analyser_congestion(fps, board=board, grille_mm=5.0)
    assert cong["hotspot_x"] == 2.5 and cong["hotspot_y"] == 2.5, cong
    assert cong["cell_size_mm"] == 5.0
    print("[PASS] test_congestion_limites")


def test_decouplage_connecteur_pas_une_capa():
    fps = [
        _fp("U1", 0, 0, (1, "VCC", 0, 0)),
        _fp("CONN1", 1, 0, (1, "VCC", 1, 0), (2, "GND", 2, 0)),
    ]
    dec = analyser_decouplage(fps)
    assert dec["total_caps_decouplage"] == 0, dec
    print("[PASS] test_decouplage_connecteur_pas_une_capa")


def test_decouplage_cas_limites():
    # Pas de condensateur : 100 % conforme par vacuité
    dec = analyser_decouplage([_fp("U1", 0, 0, (1, "VCC", 0, 0))])
    assert dec["conform_pct"] == 100.0 and dec["mean_dist_mm"] is None
    # Des condensateurs mais aucun CI : rien de conforme
    dec = analyser_decouplage([_fp("C1", 0, 0, (1, "VCC", 0, 0), (2, "GND", 1, 0))])
    assert dec["conform_pct"] == 0.0
    # Capa sur un autre rail que le CI : ignorée
    fps = [_fp("U1", 0, 0, (1, "3V3", 0, 0)), _fp("C1", 1, 0, (1, "5V", 1, 0), (2, "GND", 2, 0))]
    dec = analyser_decouplage(fps)
    assert dec["total_caps_decouplage"] == 0 and dec["details"] == []
    # Un point de test TP1 n'est pas un CI
    fps = [_fp("TP1", 0, 0, (1, "VCC", 0, 0)), _fp("C1", 1, 0, (1, "VCC", 1, 0), (2, "GND", 2, 0))]
    dec = analyser_decouplage(fps)
    assert dec["details"] == [] and dec["conform_pct"] == 0.0, dec
    # Le plus proche des deux CI est retenu, à la frontière exacte de la cible
    fps = [_fp("U1", 0, 0, (1, "VDD", 0, 0)), _fp("U2", 10, 0, (1, "VDD", 10, 0)),
           _fp("C1", 6.5, 0, (1, "VDD", 6.5, 0), (2, "GND", 7, 0))]
    dec = analyser_decouplage(fps, distance_cible_mm=3.5)
    assert dec["details"][0]["ic_ref"] == "U2"
    assert dec["details"][0]["conforme"] is True
    print("[PASS] test_decouplage_cas_limites")


def test_ordonnancement_prefixes():
    refs = ["LED1", "TRANS1", "TP1", "U1A", "j2", "MH1", "OSC1", "K1",
            "PWR1", "IC3", "Q2", "D1", "FB1", ""]
    res = ordonnancer_placement([{"ref": r} for r in refs])
    tiers = res["tiers"]
    assert "LED1" in tiers["free"], tiers          # pas une inductance L
    assert "TRANS1" in tiers["flexible"], tiers    # pas un transistor T
    assert "TP1" in tiers["anchor"]
    assert "U1A" in tiers["semi_fixed"]
    assert "j2" in tiers["anchor"]                 # insensible à la casse
    assert "MH1" in tiers["anchor"]
    assert "OSC1" in tiers["flexible"] and "K1" in tiers["flexible"]
    assert "PWR1" in tiers["free"]
    assert "IC3" in tiers["semi_fixed"] and "Q2" in tiers["semi_fixed"]
    assert "D1" in tiers["free"] and "FB1" in tiers["free"]
    assert sum(res["counts"].values()) == len(refs) - 1   # le repère vide est ignoré
    assert tiers["anchor"] == sorted(tiers["anchor"])
    print("[PASS] test_ordonnancement_prefixes")


def test_segments_croisent():
    from pcb_scoring import _segments_croisent
    assert _segments_croisent((0, 0), (10, 10), (0, 10), (10, 0)) is True
    assert _segments_croisent((0, 0), (10, 0), (0, 5), (10, 5)) is False      # parallèles
    assert _segments_croisent((0, 0), (10, 10), (10, 10), (20, 0)) is False   # extrémité commune
    assert _segments_croisent((0, 0), (1, 1), (5, 0), (6, -1)) is False       # disjoints
    print("[PASS] test_segments_croisent")


def test_rotation_cas_limites():
    from pcb_scoring import evaluer_rotation_composant, optimiser_rotations_placement
    fps = [_fp("R1", 0, 0, (1, "A", 0, 0)), _fp("R2", 5, 0, (1, "A", 5, 0))]
    assert evaluer_rotation_composant("INCONNU", fps) is None
    assert evaluer_rotation_composant("R1", fps) is None     # une seule pastille reliée

    # Déjà bien orienté : aucune suggestion
    fps = [
        {"ref": "U1", "x": 20.0, "y": 20.0, "rot": 0.0, "pads": [
            {"n": 1, "net": "A", "x": 20.0, "y": 18.0, "lx": 0.0, "ly": -2.0},
            {"n": 2, "net": "B", "x": 20.0, "y": 22.0, "lx": 0.0, "ly": 2.0}]},
        _fp("TA", 20, 10, (1, "A", 20, 10)),
        _fp("TB", 20, 30, (1, "B", 20, 30)),
    ]
    diag = evaluer_rotation_composant("U1", fps)
    assert diag["rotation_optimale"] == 0 and diag["gain_croisements"] == 0
    assert optimiser_rotations_placement(fps) == []

    # Rotation négative ramenée dans [0, 360)
    fps[0]["rot"] = -90.0
    assert evaluer_rotation_composant("U1", fps)["rotation_actuelle"] == 270

    # Rotation hors quart de tour : évaluée telle quelle, pas confondue avec 0°
    fps[0]["rot"] = 45.0
    diag = evaluer_rotation_composant("U1", fps)
    assert diag["rotation_actuelle"] == 45
    a45 = [r for r in diag["rotations"] if r["angle"] == 45]
    assert len(a45) == 1
    assert diag["longueur_actuelle_mm"] == a45[0]["longueur_mm"]
    print("[PASS] test_rotation_cas_limites")


def test_rotation_sans_lx_ly():
    # Pastilles sans coordonnées locales : dé-rotation depuis la position absolue
    from pcb_scoring import evaluer_rotation_composant
    fps = [
        _fp("U1", 20, 20, (1, "NET_A", 20, 18), (2, "NET_B", 20, 22)),
        _fp("TARGET_A", 30, 25, (1, "NET_A", 30, 25)),
        _fp("TARGET_B", 30, 15, (1, "NET_B", 30, 15)),
    ]
    diag = evaluer_rotation_composant("U1", fps)
    assert diag["croisements_actuels"] == 1
    assert diag["rotation_optimale"] == 180
    print("[PASS] test_rotation_sans_lx_ly")


def test_evaluer_placement_vide():
    res = evaluer_placement_pcb({})
    assert res["succes"] is True
    assert res["hpwl_mm"] == 0.0
    assert res["top_contributeurs"] == [] and res["rotations_suggerees"] == []
    assert res["ordonnancement"]["counts"] == {"anchor": 0, "semi_fixed": 0, "flexible": 0, "free": 0}
    print("[PASS] test_evaluer_placement_vide")


if __name__ == "__main__":
    test_hpwl_simple()
    test_top_contributeurs()
    test_congestion()
    test_decouplage()
    test_ordonnancement()
    test_evaluer_placement_pcb()
    test_rotation_optimale()
    test_hpwl_masse_et_rails()
    test_hpwl_masses_variantes()
    test_top_contributeurs_limites()
    test_congestion_limites()
    test_decouplage_connecteur_pas_une_capa()
    test_decouplage_cas_limites()
    test_ordonnancement_prefixes()
    test_segments_croisent()
    test_rotation_cas_limites()
    test_rotation_sans_lx_ly()
    test_evaluer_placement_vide()
    print("\n TOUS LES TESTS DE PCB_SCORING SONT VALIDÉS AVEC SUCCÈS.")
