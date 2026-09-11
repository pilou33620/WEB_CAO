#!/usr/bin/python3
# -*- coding: utf-8 -*-
"""
banc-simulation-25d.py - Banc de tests du connecteur MoM 2.5D (simulation_25d.py)

Vérifie l'intégration de bout en bout du format standard cao-sim-em-3 vers
mom_solver et le retour cao-sim-em-resultat-5 :
- Disponibilité et métadonnées (etat)
- Ligne microruban simple (passivité, réciprocité, transmission)
- Ligne multi-tronçons avec fusion topologique
- Ligne avec coude à 90°
- Conformité du Touchstone et du format résultat
- Cas d'erreur et garde-fous
"""

import os
import sys
import math
import numpy as np

_ICI = os.path.dirname(os.path.abspath(__file__))
_RACINE = os.path.dirname(_ICI)
_BASE = os.path.dirname(_RACINE)
for p in (_BASE, _RACINE):
    if p not in sys.path:
        sys.path.insert(0, p)

import simulation_25d

OK = 0
KO = 0


def essai(nom):
    """Décorateur d'essai unitaire avec affichage du verdict."""
    def deco(fn):
        global OK, KO
        try:
            fn()
            print(f"  ok  {nom}")
            OK += 1
        except Exception as exc:  # noqa: BLE001
            print(f"  KO  {nom} -> {exc}")
            KO += 1
        return fn
    return deco


def _doc_base(objets, f1=1e9, f2=3e9, fc=2e9, points=3):
    """Document de test cao-sim-em-3 standard."""
    return {
        "format": "cao-sim-em-3",
        "carte": "banc_25d",
        "net": "SIG",
        "stackup": {
            "layers": [
                {"type": "copper", "role": "plane", "thickness": 0.035, "name": "GND"},
                {"type": "dielectric", "thickness": 0.370, "epsilon_r": 4.37, "tan_delta": 0.022, "name": "FR4"},
                {"type": "copper", "role": "signal", "thickness": 0.035, "name": "TOP"}
            ]
        },
        "geometry": {
            "objects": objets
        },
        "ports": [{"id": 1, "impedance": 50.0}, {"id": 2, "impedance": 50.0}],
        "analyse": {
            "f_debut": f1,
            "f_fin": f2,
            "points": points,
            "f_centre": fc
        }
    }


print("\nBanc d'essai du connecteur 2.5D (simulation_25d.py)")
print("=" * 60)


@essai("etat() retourne dispo=True et moteur='2.5d'")
def _():
    e = simulation_25d.etat()
    assert e["dispo"] is True, f"Solveur 2.5D non disponible : {e.get('erreur')}"
    assert e["moteur"] == "2.5d", f"Moteur inattendu : {e.get('moteur')}"
    assert e["shapely"] is True, "Shapely doit être présent pour la fusion de segments"


@essai("microruban simple : passivité, réciprocité et transmission forte")
def _():
    objets = [
        {
            "type": "track",
            "start": [0.0, 0.0],
            "end": [6.0, 0.0],
            "width": 1.05,
            "layer": 2,
            "net": "SIG",
            "copper_thickness": 0.035
        }
    ]
    doc = _doc_base(objets, f1=1e9, f2=3e9, fc=2e9, points=3)
    res = simulation_25d.simuler_25d(doc, mesh_size_mm=0.36)

    # Format de sortie
    assert res["format"] == "cao-sim-em-resultat-5"
    assert res["moteur"] == "2.5d"
    assert len(res["freqs"]) >= 3
    assert len(res["s"]) == len(res["freqs"])

    # Vérification à f = 2 GHz
    idx_fc = int(np.argmin(np.abs(np.array(res["freqs"]) - 2e9)))
    s_raw = res["s"][idx_fc]
    s_mat = np.array([[complex(v[0], v[1]) for v in s_raw[0:2]],
                      [complex(v[0], v[1]) for v in s_raw[2:4]]])

    s11, s21 = s_mat[0, 0], s_mat[1, 0]
    s12, s22 = s_mat[0, 1], s_mat[1, 1]

    # Réciprocité
    assert abs(s12 - s21) < 1e-6, f"Non réciproque : |S12 - S21| = {abs(s12 - s21)}"

    # Passivité : somme des puissances <= 1.01
    p_out = abs(s11)**2 + abs(s21)**2
    assert p_out <= 1.01, f"Actif : |S11|^2 + |S21|^2 = {p_out:.4f}"

    # Transmission sur ligne adaptée
    assert abs(s21) > 0.90, f"Transmission trop faible : |S21| = {abs(s21):.4f}"
    assert abs(s11) < 0.35, f"Réflexion trop forte : |S11| = {abs(s11):.4f}"

    # Touchstone
    assert "# HZ S MA R 50" in res["touchstone"], res["touchstone"].splitlines()[:9]
    assert len(res["touchstone"].strip().splitlines()) >= 4


@essai("ligne multi-tronçons : fusion géométrique et continuité du courant")
def _():
    """Vérifie que deux segments consécutifs ne forment pas de fente ouverte."""
    objets = [
        {
            "type": "track",
            "start": [0.0, 0.0],
            "end": [3.0, 0.0],
            "width": 1.05,
            "layer": 2,
            "net": "SIG",
            "copper_thickness": 0.035
        },
        {
            "type": "track",
            "start": [3.0, 0.0],
            "end": [6.0, 0.0],
            "width": 1.05,
            "layer": 2,
            "net": "SIG",
            "copper_thickness": 0.035
        }
    ]
    doc = _doc_base(objets, f1=2e9, f2=2e9, fc=2e9, points=1)
    res = simulation_25d.simuler_25d(doc, mesh_size_mm=0.36)

    s_raw = res["s"][0]
    s21 = complex(s_raw[2][0], s_raw[2][1])
    s11 = complex(s_raw[0][0], s_raw[0][1])

    # Si les segments n'étaient pas fusionnés, |S21| tomberait à ~0.04 (circuit ouvert)
    assert abs(s21) > 0.90, f"Échec de continuité : |S21| = {abs(s21):.4f} (attendu > 0.90)"
    assert abs(s11) < 0.35, f"Réflexion anormale à la jonction : |S11| = {abs(s11):.4f}"


@essai("ligne avec coude à 90° : résolution géométrique de l'angle")
def _():
    objets = [
        {
            "type": "track",
            "start": [0.0, 0.0],
            "end": [4.0, 0.0],
            "width": 1.05,
            "layer": 2,
            "net": "SIG",
            "copper_thickness": 0.035
        },
        {
            "type": "track",
            "start": [4.0, 0.0],
            "end": [4.0, 4.0],
            "width": 1.05,
            "layer": 2,
            "net": "SIG",
            "copper_thickness": 0.035
        }
    ]
    doc = _doc_base(objets, f1=2e9, f2=2e9, fc=2e9, points=1)
    res = simulation_25d.simuler_25d(doc, mesh_size_mm=0.36)

    s_raw = res["s"][0]
    s21 = complex(s_raw[2][0], s_raw[2][1])
    s11 = complex(s_raw[0][0], s_raw[0][1])

    # Le coude transmet mais réfléchit un peu plus qu'une ligne droite pure
    assert abs(s21) > 0.85, f"Coude ne transmet pas : |S21| = {abs(s21):.4f}"
    p_out = abs(s11)**2 + abs(s21)**2
    assert p_out <= 1.01, f"Passivité violée sur coude : {p_out:.4f}"


@essai("garde-fous : refus d'un empilage sans plan de masse")
def _():
    doc = {
        "format": "cao-sim-em-3",
        "stackup": {
            "layers": [
                {"type": "copper", "role": "signal", "thickness": 0.035, "name": "TOP"},
                {"type": "dielectric", "thickness": 0.370, "epsilon_r": 4.37, "name": "FR4"}
            ]
        },
        "geometry": {
            "objects": [{"type": "track", "start": [0, 0], "end": [5, 0], "width": 1, "layer": 0}]
        },
        "analyse": {"f_debut": 1e9, "f_fin": 2e9, "points": 2}
    }
    try:
        simulation_25d.simuler_25d(doc)
        raise AssertionError("Devait refuser un empilage sans plan de masse")
    except simulation_25d.ErreurSimulation25D as exc:
        assert "plan de masse" in exc.message.lower()


@essai("dispatch bi-moteur : comparaison 2D vs 2.5D sur la même ligne")
def _():
    import simulation_em
    objets = [
        {
            "type": "track",
            "start": [0.0, 0.0],
            "end": [6.0, 0.0],
            "width": 1.05,
            "layer": 2,
            "net": "SIG",
            "copper_thickness": 0.035
        }
    ]
    doc_2d = _doc_base(objets, f1=1e9, f2=3e9, fc=2e9, points=3)
    doc_2d["moteur"] = "2d"
    res_2d = simulation_em.simuler(doc_2d)
    assert res_2d["format"] == "cao-sim-em-resultat-5"
    assert "ligne" in res_2d
    assert "s" in res_2d

    doc_25d = _doc_base(objets, f1=1e9, f2=3e9, fc=2e9, points=3)
    doc_25d["moteur"] = "2.5d"
    res_25d = simulation_25d.simuler_25d(doc_25d, mesh_size_mm=0.36)
    assert res_25d["format"] == "cao-sim-em-resultat-5"
    assert res_25d["moteur"] == "2.5d"

    # Comparaison de Z0 à f0 : les deux physiques tombent à quelques pour cent.
    #
    # LA TOLERANCE EST PASSEE DE 20 A 8 %, et c'est le resserrage qui compte :
    # a 20 % l'essai passait alors que le 2,5D rendait Z_in au lieu de Z0 --
    # une erreur de 24 % sur une piste fine, mais de 11 % sur celle-ci, donc
    # invisible ici. Un garde-fou plus large que le defaut qu'il surveille ne
    # surveille rien.
    z0_2d = res_2d["ligne"]["z0_moyen"]
    z0_25d = res_25d["ligne"]["z0_moyen"]
    ecart_rel = abs(z0_2d - z0_25d) / z0_2d
    assert ecart_rel < 0.08, f"Ecart 2D ({z0_2d} ohms) vs 2.5D ({z0_25d} ohms) trop fort : {ecart_rel*100:.1f}%"


@essai("maillage exporté : structure géométrique complète pour le rendu filaire")
def _():
    objets = [
        {
            "type": "track",
            "start": [0.0, 0.0],
            "end": [5.0, 0.0],
            "width": 1.05,
            "layer": 2,
            "net": "SIG",
            "copper_thickness": 0.035
        }
    ]
    doc = _doc_base(objets, f1=1e9, f2=1e9, fc=1e9, points=1)
    res = simulation_25d.simuler_25d(doc, mesh_size_mm=0.36)

    assert "maillage" in res, "Le champ 'maillage' doit être retourné pour la visualisation graphique"
    m = res["maillage"]
    assert m["num_elements"] > 0, "Le maillage doit comporter des triangles"
    assert m["num_rwg"] > 0, "Le maillage doit comporter des fonctions RWG"
    assert len(m["sommets"]) > 0, "Sommets 3D présents"
    assert len(m["elements"]) == m["num_elements"]
    assert len(m["ports"]) == 2, "Les 2 ports doivent être référencés dans le maillage"
    for p in m["ports"]:
        assert "x" in p and "y" in p and "z" in p and "type" in p
    assert isinstance(m["vias_internes"], list)
    assert "courants" in m, "Le tableau des courants Jsurf doit être exporté"
    assert len(m["courants"]) == m["num_elements"], "Un courant calculé par triangle"
    assert m["courant_max"] >= m["courant_min"] >= 0.0, "Plage de courant valide"
    assert m["courant_unite"] == "A/m"
    assert all(math.isfinite(val) and val >= 0.0 for val in m["courants"])


@essai("densité de courant Jsurf : distribution physique sur coude à 90° (effet de coin)")
def _():
    """Vérifie que le calcul de Jsurf fonctionne sur géométrie complexe avec coude."""
    objets = [
        {"type": "track", "start": [0.0, 0.0], "end": [3.0, 0.0], "width": 1.05, "layer": 2},
        {"type": "track", "start": [3.0, 0.0], "end": [3.0, 3.0], "width": 1.05, "layer": 2}
    ]
    doc = _doc_base(objets, f1=1.5e9, f2=2.5e9, fc=2e9, points=2)
    res = simulation_25d.simuler_25d(doc, mesh_size_mm=0.36)

    m = res["maillage"]
    assert "courants" in m
    assert len(m["courants"]) == m["num_elements"]
    assert m["courant_max"] > m["courant_min"] >= 0.0
    assert m["courant_max"] > 10.0, f"Le courant max au coude doit être significatif (>10 A/m) : {m['courant_max']}"


@essai("support des vias internes de signal : changement de couche TOP -> IN1")
def _():
    """Vérifie le maillage d'un via de signal vertical reliant 2 couches avec continuité MoM."""
    stackup = {
        "layers": [
            {"type": "copper", "role": "plane", "thickness": 0.035, "name": "GND"},
            {"type": "dielectric", "thickness": 0.370, "epsilon_r": 4.37, "tan_delta": 0.022, "name": "FR4_1"},
            {"type": "copper", "role": "signal", "thickness": 0.035, "name": "IN1"},
            {"type": "dielectric", "thickness": 0.370, "epsilon_r": 4.37, "tan_delta": 0.022, "name": "FR4_2"},
            {"type": "copper", "role": "signal", "thickness": 0.035, "name": "TOP"}
        ]
    }
    objets = [
        {
            "type": "track",
            "start": [0.0, 0.0],
            "end": [3.0, 0.0],
            "width": 1.05,
            "layer": 4,  # TOP
            "net": "SIG",
            "copper_thickness": 0.035
        },
        {
            "type": "track",
            "start": [3.0, 0.0],
            "end": [6.0, 0.0],
            "width": 1.05,
            "layer": 2,  # IN1
            "net": "SIG",
            "copper_thickness": 0.035
        },
        {
            "type": "via",
            "x": 3.0,
            "y": 0.0,
            "drill": 0.3,
            "pad": 0.6,
            "net": "SIG",
            "layer_start": 2,
            "layer_end": 4
        }
    ]
    doc = {
        "format": "cao-sim-em-3",
        "carte": "banc_via_interne",
        "net": "SIG",
        "stackup": stackup,
        "geometry": {"objects": objets},
        "ports": [{"id": 1, "impedance": 50.0}, {"id": 2, "impedance": 50.0}],
        "analyse": {"f_debut": 1e9, "f_fin": 2e9, "points": 2, "f_centre": 1e9}
    }

    res = simulation_25d.simuler_25d(doc, mesh_size_mm=0.36)
    assert res["format"] == "cao-sim-em-resultat-5"
    assert "maillage" in res

    m = res["maillage"]
    assert len(m["vias_internes"]) >= 1, "Le via interne reliant TOP et IN1 doit être détecté et maillé"
    via_info = m["vias_internes"][0]
    assert abs(via_info["x"] - 3.0) < 1e-4 and abs(via_info["y"] - 0.0) < 1e-4

    # Transmission à travers le via de signal
    s_raw = res["s"][0]
    s21 = complex(s_raw[2][0], s_raw[2][1])
    s11 = complex(s_raw[0][0], s_raw[0][1])
    s12 = complex(s_raw[1][0], s_raw[1][1])

    # Réciprocité
    assert abs(s12 - s21) < 1e-5, f"Non réciproque à travers le via : |S12 - S21| = {abs(s12 - s21)}"

    # Transmission élevée : le via relie effectivement les deux segments
    assert abs(s21) > 0.85, f"Perte anormale à travers le via : |S21| = {abs(s21):.4f}"

    # Passivité : conservation de puissance
    p_out = abs(s11)**2 + abs(s21)**2
    assert p_out <= 1.01, f"Passivité violée : |S11|^2 + |S21|^2 = {p_out:.4f}"

    # Notes d'information
    notes_str = " ".join(res.get("notes", []))
    assert "via" in notes_str.lower(), f"La note de synthèse doit mentionner le via interne : {notes_str}"


# ==========================================================================
# LES NON-REGRESSIONS DE LA 1.1.0
# --------------------------------------------------------------------------
# Chacun de ces essais tient un defaut MESURE, et non une intention : la
# valeur fausse est ecrite dans le message, pour qu'un echec dise tout de
# suite lequel des six est revenu.
# ==========================================================================


@essai("Z0 est une impedance CARACTERISTIQUE, et non l'impedance d'entree")
def _():
    """Le defaut n. 1 : `z0` portait Z_in = Z_ref(1+S11)/(1-S11).

    L'etalon est Hammerstad-Jensen sur le meme microruban. Le biais de Z_in
    est TOUJOURS vers Z_ref : c'est pourquoi on eprouve DEUX largeurs de part
    et d'autre de 50 ohms, et non une seule -- a 0,70 mm la ligne est adaptee
    et les deux grandeurs se confondent, si bien qu'un essai unique a cette
    largeur n'aurait rien vu du tout.
    """
    def hammerstad(w, h, er):
        u = w / h
        if u < 1:
            ee = (er + 1) / 2 + (er - 1) / 2 * (1 / math.sqrt(1 + 12 / u)
                                                + 0.04 * (1 - u) ** 2)
            return 60 / math.sqrt(ee) * math.log(8 / u + u / 4)
        ee = (er + 1) / 2 + (er - 1) / 2 * (1 / math.sqrt(1 + 12 / u))
        return (120 * math.pi / math.sqrt(ee)
                / (u + 1.393 + 0.667 * math.log(u + 1.444)))

    # LA MAILLE TIENT TROIS RUBANS SUR CHAQUE LARGEUR, et c'est mesure : a
    # 2,9 rubans l'ecart a Hammerstad tombe a 0,1 %, alors qu'a moins de deux
    # l'extraction s'effondre -- `_resolution_maille` la refuse alors, et c'est
    # bien ce qu'il faut faire. Un banc qui eprouverait Z0 sur un maillage
    # sous-resolu ne mesurerait que le bruit de discretisation.
    for largeur, maille in ((0.35, 0.12), (2.00, 0.36)):
        objets = [{"type": "track", "start": [0.0, 0.0], "end": [6.0, 0.0],
                   "width": largeur, "layer": 2, "net": "SIG",
                   "copper_thickness": 0.035}]
        doc = _doc_base(objets, f1=2e9, f2=2e9, fc=2e9, points=1)
        res = simulation_25d.simuler_25d(doc, mesh_size_mm=maille)

        z0 = res["ligne"]["z0_moyen"]
        z_in = res["ligne"]["z_in_reel"]
        attendu = hammerstad(largeur, 0.370, 4.37)
        ecart = abs(z0 - attendu) / attendu

        assert ecart < 0.12, (
            "w=%.2f mm : Z0 rendu %.2f ohm, attendu %.2f ohm (%.1f pour cent)"
            % (largeur, z0, attendu, 100 * ecart))
        # ET CE N'EST PAS Z_in QUI EST RENDU : sur ces deux largeurs les deux
        # grandeurs diffèrent de plus de 10 pour cent, donc l'essai les
        # distingue vraiment.
        assert abs(z_in - attendu) / attendu > 0.10, (
            "w=%.2f mm : Z_in (%.2f) est trop proche de Z0 (%.2f) pour que"
            " cet essai prouve quoi que ce soit" % (largeur, z_in, attendu))
        assert abs(z0 - z_in) > 1.0, (
            "w=%.2f mm : z0_moyen (%.2f) et z_in_reel (%.2f) sont confondus --"
            " le champ z0 porte probablement encore Z_in"
            % (largeur, z0, z_in))


@essai("eps_eff sort des parametres S, pas d'une formule fermee")
def _():
    """Le defaut n. 2. On le controle par le RETARD, qui est mesurable : le
    temps de vol d'une ligne de 6 mm a eps_eff proche de 3,4 vaut environ
    37 ps, et il doit tomber d'accord avec l'eps_eff rendu.
    """
    objets = [{"type": "track", "start": [0.0, 0.0], "end": [6.0, 0.0],
               "width": 1.05, "layer": 2, "net": "SIG",
               "copper_thickness": 0.035}]
    doc = _doc_base(objets, f1=2e9, f2=2e9, fc=2e9, points=1)
    res = simulation_25d.simuler_25d(doc, mesh_size_mm=0.36)

    eps = res["ligne"]["eps_eff"]
    assert 2.5 < eps < 4.37, "eps_eff hors du plausible : %.3f" % eps

    retard = res["ligne"]["retard"]
    attendu = 6e-3 * math.sqrt(eps) / 2.99792458e8
    assert abs(retard - attendu) / attendu < 0.02, (
        "retard %.3f ps incoherent avec eps_eff = %.3f (attendu %.3f ps)"
        % (retard * 1e12, eps, attendu * 1e12))
    assert res["segments"][0]["eps_eff"] == round(eps, 3)


@essai("le retard et les pertes de la liaison sont rendus, et sont des sommes")
def _():
    """Le defaut n. 3 : `ligne` n'avait ni `retard` ni `pertes_db` -- le
    panneau affichait un tiret pour les deux --, et chaque troncon portait le
    TOTAL au lieu de sa part.
    """
    objets = [
        {"type": "track", "start": [0.0, 0.0], "end": [2.0, 0.0],
         "width": 1.05, "layer": 2, "net": "SIG"},
        {"type": "track", "start": [2.0, 0.0], "end": [8.0, 0.0],
         "width": 1.05, "layer": 2, "net": "SIG"},
    ]
    doc = _doc_base(objets, f1=2e9, f2=2e9, fc=2e9, points=1)
    res = simulation_25d.simuler_25d(doc, mesh_size_mm=0.40)

    L = res["ligne"]
    assert "retard" in L and L["retard"] > 0, "ligne.retard absent ou nul"
    assert "pertes_db" in L, "ligne.pertes_db absent"

    s = res["segments"]
    assert len(s) == 2
    # CHACUN SA LONGUEUR : 2 mm et 6 mm, donc un rapport de trois exactement.
    assert abs(s[0]["longueur"] - 2.0) < 1e-6, s[0]["longueur"]
    assert abs(s[1]["longueur"] - 6.0) < 1e-6, s[1]["longueur"]
    assert s[1]["retard"] > 2.5 * s[0]["retard"], (
        "les deux troncons portent le meme retard (%.4g / %.4g) : c'est le"
        " total repete" % (s[0]["retard"], s[1]["retard"]))
    # ET LA SOMME REDONNE LE TOTAL.
    somme = sum(x["retard"] for x in s)
    assert abs(somme - L["retard"]) / L["retard"] < 1e-6, (
        "somme des retards %.6g differe du total %.6g" % (somme, L["retard"]))
    somme_db = sum(x["pertes_db"] for x in s)
    assert abs(somme_db - L["pertes_db"]) < 1e-3, (
        "somme des pertes %.6g differe du total %.6g"
        % (somme_db, L["pertes_db"]))


def _doc_4c_via(haut_en_bas, explicite):
    """Un 4 couches avec un via TOP vers IN1, dans l'orientation demandee.

    HAUT EN BAS EST L'ORDRE QUE L'EDITEUR PCB ENVOIE (TOP en 0), et c'est
    celui qui declenche le renversement d'empilage -- donc le defaut n. 4.
    """
    sig = {"type": "copper", "role": "signal", "thickness": 0.035}
    die = {"type": "dielectric", "thickness": 0.20, "epsilon_r": 4.37,
           "tan_delta": 0.022}
    plan = {"type": "copper", "role": "plane", "thickness": 0.035, "name": "GND"}
    if haut_en_bas:
        layers = [dict(sig, name="TOP"), dict(die, name="D1"),
                  dict(sig, name="IN1"), dict(die, name="D2"), dict(plan)]
        l_a, l_b = 0, 2
    else:
        layers = [dict(plan), dict(die, name="D2"), dict(sig, name="IN1"),
                  dict(die, name="D1"), dict(sig, name="TOP")]
        l_a, l_b = 4, 2

    objets = [{"type": "track", "start": [0.0, 0.0], "end": [3.0, 0.0],
               "width": 0.5, "layer": l_a, "net": "SIG"}]
    if explicite:
        objets.append({"type": "via", "x": 3.0, "y": 0.0,
                       "layer_start": l_a, "layer_end": l_b,
                       "drill": 0.3, "pad": 0.55, "net": "SIG"})
        objets.append({"type": "track", "start": [3.0, 0.0], "end": [6.0, 0.0],
                       "width": 0.5, "layer": l_b, "net": "SIG"})
    else:
        objets.append({"type": "track", "start": [3.0, 0.0], "end": [6.0, 0.0],
                       "width": 0.5, "layer": l_b, "net": "SIG",
                       "via": {"x": 3.0, "y": 0.0, "drill_diameter": 0.3,
                               "pad_diameter": 0.55}})
    return {"format": "cao-sim-em-3", "carte": "banc_via", "net": "SIG",
            "stackup": {"layers": layers},
            "geometry": {"objects": objets},
            "ports": [{"id": 1, "impedance": 50.0},
                      {"id": 2, "impedance": 50.0}],
            "analyse": {"f_debut": 2e9, "f_fin": 2e9, "points": 1,
                        "f_centre": 2e9}}


@essai("le renversement d'empilage remappe AUSSI les couches des vias")
def _():
    """Le defaut n. 4, et c'est le plus grave.

    Avant : sur un empilage donne de haut en bas, `layer_start` et
    `layer_end` restaient dans l'ancien repere, le via visait le PLAN DE
    MASSE, son maillage echouait dans un `logger.warning`, et le resultat
    annoncait quand meme un via maille en fut vertical RWG continu -- avec
    S21 = -34,75 dB au lieu de -0,05 dB. Une coupure franche, presentee comme
    une liaison saine.

    LES QUATRE COMBINAISONS SONT EPROUVEES, et c'est le point : le banc
    d'avant ne tenait que la convention explicite avec un empilage bas en
    haut, c'est-a-dire la seule des quatre ou le defaut ne se voit pas.
    """
    for haut_en_bas in (True, False):
        for explicite in (True, False):
            doc = _doc_4c_via(haut_en_bas, explicite)
            res = simulation_25d.simuler_25d(doc, mesh_size_mm=0.40)
            cas = ("empilage %s, via %s"
                   % ("haut en bas" if haut_en_bas else "bas en haut",
                      "explicite" if explicite else "attache au troncon"))

            vias = res["maillage"]["vias_internes"]
            assert len(vias) == 1, "%s : %d via(s) detecte(s)" % (cas, len(vias))

            # LE FUT RELIE DEUX COUCHES DE SIGNAL, jamais un plan de masse :
            # les z rendus doivent etre ceux des deux couches de signal, a
            # 0,235 mm et 0,505 mm de la base dans les deux orientations.
            assert vias[0]["z_bas"] > 0.15, (
                "%s : le fut part de z = %.3f mm, c'est-a-dire du plan de"
                " masse et non du cuivre de signal" % (cas, vias[0]["z_bas"]))

            s21 = res["ligne"]["s21_db"]
            assert s21 > -3.0, (
                "%s : S21 = %.2f dB -- le via n'est pas maille, la liaison"
                " est coupee" % (cas, s21))


@essai("un via qu'on ne sait pas mailler est un REFUS, pas un journal")
def _():
    """Le defaut n. 4 par son autre bout : l'echec devait remonter.

    On demande un via vers une couche ou aucun cuivre de la selection
    n'existe. Avant, `mailler_via_interne` levait, l'exception partait dans
    `logger.warning`, et le resultat repartait comme si de rien n'etait.
    """
    doc = _doc_4c_via(haut_en_bas=False, explicite=True)
    for obj in doc["geometry"]["objects"]:
        if obj.get("type") == "via":
            obj["layer_end"] = 0          # le plan de masse, non maille
    try:
        res = simulation_25d.simuler_25d(doc, mesh_size_mm=0.40)
    except simulation_25d.ErreurSimulation25D as exc:
        assert "via interne" in exc.message.lower(), exc.message
        assert exc.conseil, "un refus doit dire quoi changer"
        return
    raise AssertionError(
        "Devait refuser : le via n'est pas maillable et le resultat est"
        " reparti avec S21 = %.2f dB" % res["ligne"]["s21_db"])


@essai("les garde-fous refusent avant de faire attendre")
def _():
    """Le defaut n. 5 : aucun plafond, seul des quatre moteurs du depot.

    Le remplissage est en N au carre et le panneau demande 21 points par
    defaut : une piste de 24 mm valait vingt minutes sans annulation.
    """
    e = simulation_25d.etat()
    for cle in ("objets", "points", "rwg", "budget_s"):
        assert cle in e["limites"], "etat() doit publier la limite %s" % cle

    # Trop de points : ecrete, et DIT.
    objets = [{"type": "track", "start": [0.0, 0.0], "end": [4.0, 0.0],
               "width": 1.05, "layer": 2, "net": "SIG"}]
    doc = _doc_base(objets, f1=1e9, f2=3e9, fc=2e9,
                    points=simulation_25d.MAX_POINTS + 500)
    res = simulation_25d.simuler_25d(doc, mesh_size_mm=0.55)
    assert len(res["freqs"]) <= simulation_25d.MAX_POINTS + 1, (
        "%d points calcules" % len(res["freqs"]))
    assert any("point" in a.lower() and "maximum" in a.lower()
               for a in res["avertissements"]), res["avertissements"][:3]

    # Trop de troncons : refus net.
    trop = [{"type": "track", "start": [float(i), 0.0],
             "end": [float(i) + 1, 0.0], "width": 0.2, "layer": 2,
             "net": "SIG"}
            for i in range(simulation_25d.MAX_OBJETS + 5)]
    try:
        simulation_25d.simuler_25d(_doc_base(trop, points=1))
        raise AssertionError("Devait refuser %d troncons" % len(trop))
    except simulation_25d.ErreurSimulation25D as exc:
        assert "maximum" in exc.message.lower(), exc.message

    # Cout estime hors budget : refus, avec les leviers nommes.
    long_doc = _doc_base(
        [{"type": "track", "start": [0.0, 0.0], "end": [60.0, 0.0],
          "width": 1.05, "layer": 2, "net": "SIG"}],
        f1=1e9, f2=5e9, fc=2e9, points=21)
    try:
        simulation_25d.simuler_25d(long_doc, mesh_size_mm=0.12)
        raise AssertionError("Devait refuser un calcul hors budget")
    except simulation_25d.ErreurSimulation25D as exc:
        assert ("trop long" in exc.message.lower()
                or "trop lourd" in exc.message.lower()), exc.message
        assert "maille" in exc.conseil.lower(), exc.conseil


@essai("une bande absente est refusee, une bande corrigee est dite")
def _():
    """Le defaut n. 6 : les corrections d'office etaient muettes.

    Une valeur corrigee en silence se lit comme une valeur acceptee -- c'est
    la regle de `simulation_em._valider`, et elle valait ici aussi.
    """
    objets = [{"type": "track", "start": [0.0, 0.0], "end": [4.0, 0.0],
               "width": 1.05, "layer": 2, "net": "SIG"}]

    # Absente : REFUS, et non un defaut invente.
    doc = _doc_base(objets, points=1)
    doc["analyse"] = {"points": 1}
    try:
        simulation_25d.simuler_25d(doc, mesh_size_mm=0.55)
        raise AssertionError("Devait refuser une bande absente")
    except simulation_25d.ErreurSimulation25D as exc:
        assert "fr" in exc.message.lower() and "quence" in exc.message.lower(), \
            exc.message

    # A l'envers : remise dans l'ordre, ET DITE.
    doc = _doc_base(objets, f1=3e9, f2=1e9, fc=2e9, points=3)
    res = simulation_25d.simuler_25d(doc, mesh_size_mm=0.55)
    assert any("envers" in a.lower() for a in res["avertissements"]), \
        res["avertissements"][:3]

    # f0 hors bande : bande etendue, ET DITE.
    doc = _doc_base(objets, f1=1e9, f2=2e9, fc=4e9, points=3)
    res = simulation_25d.simuler_25d(doc, mesh_size_mm=0.55)
    assert any("ajust" in a.lower() for a in res["avertissements"]), \
        res["avertissements"][:3]


@essai("le milieu est celui que la piste voit, pas le premier de l'empilage")
def _():
    """Le defaut n. 2 par son autre bout : `er` et `tan_delta` venaient du
    PREMIER dielectrique de la liste, quelle que soit la couche de la piste.

    L'EMPILAGE EST CHOISI POUR QUE LES DEUX REPONSES DIFFERENT. Il est donne
    de haut en bas -- l'ordre de l'editeur PCB --, donc renverse : la liste
    devient BOT / D2(4,60) / GND / D1(3,00) / TOP, et le PREMIER dielectrique
    y est D2. La piste, elle, est sur TOP et ne voit que D1 avant de buter
    sur GND. L'ancien code rendait 4,60, le bon rend 3,00.

    ET IL RESTE DANS LE DOMAINE DU SOLVEUR : `noyaux_verticaux` refuse -- a
    juste titre, son banc `banc_dcim` le verifie -- deux dielectriques
    DIFFERENTS entre une couche de signal et son plan. Chaque signal ne voit
    donc ici qu'une seule lame homogene.
    """
    layers = [
        {"type": "copper", "role": "signal", "thickness": 0.035, "name": "TOP"},
        {"type": "dielectric", "thickness": 0.10, "epsilon_r": 3.00,
         "tan_delta": 0.004, "name": "D1"},
        {"type": "copper", "role": "plane", "thickness": 0.035, "name": "GND"},
        {"type": "dielectric", "thickness": 0.30, "epsilon_r": 4.60,
         "tan_delta": 0.020, "name": "D2"},
        {"type": "copper", "role": "plane", "thickness": 0.035, "name": "BOT"},
    ]
    objets = [{"type": "track", "start": [0.0, 0.0], "end": [6.0, 0.0],
               "width": 0.2, "layer": 0, "net": "SIG"}]
    doc = {"format": "cao-sim-em-3", "carte": "b", "net": "SIG",
           "stackup": {"layers": layers}, "geometry": {"objects": objets},
           "ports": [{"id": 1, "impedance": 50.0},
                     {"id": 2, "impedance": 50.0}],
           "analyse": {"f_debut": 2e9, "f_fin": 2e9, "points": 1,
                       "f_centre": 2e9}}
    res = simulation_25d.simuler_25d(doc, mesh_size_mm=0.4)
    s = res["segments"][0]
    assert abs(s["er"] - 3.00) < 0.01, (
        "er = %.2f : c'est le premier dielectrique de la liste (4,60) et non"
        " celui que la piste voit (3,00)" % s["er"])
    assert abs(s["tan_delta"] - 0.004) < 1e-4, s["tan_delta"]
    assert abs(s["h"] - 0.100) < 0.02, "h = %.3f mm, attendu 0,100" % s["h"]


@essai("une selection non uniforme ne se peint pas comme une valeur locale")
def _():
    """Z0 extrait d'un deux-ports est celui de la ligne EQUIVALENTE. Sur une
    piste dont la largeur change, il est une moyenne : la peindre troncon par
    troncon serait montrer un chiffre local qu'on n'a pas.

    Une carte qu'on ne sait pas peindre ne se peint pas : z0 = 0, que
    `simCouleurBande` rend en gris et que le tableau ecrit en tiret.
    """
    # Les deux largeurs restent RESOLUES par la maille (3 rubans sur la plus
    # fine) : ce qu'on eprouve ici est le refus de peindre une moyenne, pas le
    # refus de resoudre un maillage trop grossier, qui a son propre essai.
    objets = [
        {"type": "track", "start": [0.0, 0.0], "end": [3.0, 0.0],
         "width": 1.05, "layer": 2, "net": "SIG"},
        {"type": "track", "start": [3.0, 0.0], "end": [6.0, 0.0],
         "width": 2.10, "layer": 2, "net": "SIG"},
    ]
    doc = _doc_base(objets, f1=2e9, f2=2e9, fc=2e9, points=1)
    res = simulation_25d.simuler_25d(doc, mesh_size_mm=0.35)

    assert res["topologie"]["uniforme"] is False
    assert res["ligne"]["z0_moyen"] > 0, "la liaison garde son Z0 equivalent"
    for s in res["segments"]:
        assert s["z0"] == 0.0, (
            "le troncon porte z0 = %.2f : une moyenne peinte comme une valeur"
            " locale" % s["z0"])
        assert s["raison"], "un troncon sans Z0 doit dire pourquoi"
        assert "largeur" in s["raison"].lower(), s["raison"]

    # Le cas uniforme, lui, garde sa carte.
    uni = [{"type": "track", "start": [0.0, 0.0], "end": [3.0, 0.0],
            "width": 1.05, "layer": 2, "net": "SIG"},
           {"type": "track", "start": [3.0, 0.0], "end": [6.0, 0.0],
            "width": 1.05, "layer": 2, "net": "SIG"}]
    res = simulation_25d.simuler_25d(
        _doc_base(uni, f1=2e9, f2=2e9, fc=2e9, points=1), mesh_size_mm=0.36)
    assert res["topologie"]["uniforme"] is True
    assert all(s["z0"] > 0 for s in res["segments"])
    assert all(not s["raison"] for s in res["segments"])


@essai("ce que le calcul ne couvre pas est ecrit, et non annonce a l'envers")
def _():
    """Les avertissements annoncaient un calcul exact des coudes, des
    transitions et du rayonnement pendant que `discontinuites` repartait
    vide, et ne disaient rien du plan de masse analytique -- c'est-a-dire de
    tout ce que le moteur 2D existe pour juger.
    """
    objets = [{"type": "track", "start": [0.0, 0.0], "end": [6.0, 0.0],
               "width": 1.05, "layer": 2, "net": "SIG"}]
    doc = _doc_base(objets, f1=2e9, f2=2e9, fc=2e9, points=1)
    res = simulation_25d.simuler_25d(doc, mesh_size_mm=0.36)

    texte = " ".join(res["avertissements"]).lower()
    assert "analytique" in texte and "infini" in texte, (
        "le plan de masse analytique doit etre dit : %s" % texte[:200])
    for mot in ("coplanaire", "couture"):
        assert mot in texte, "%s doit etre nomme comme non couvert" % mot
    assert "exact des coudes" not in texte, (
        "l'ancienne phrase promettait un calcul exact des coudes en rendant"
        " une liste de discontinuites vide")
    assert res["discontinuites"]["coudes"] == []


@essai("le Touchstone tient N ports, et non deux en dur")
def _():
    """`_touchstone_s2p` indexait s[0,0], s[1,0], s[0,1] et s[1,1] en dur :
    un trois-ports rendait un fichier d'apparence valide ayant perdu la
    moitie de sa matrice, en-tete a deux ports comprise.
    """
    freqs = np.array([1e9, 2e9])
    m3 = [np.arange(9).reshape(3, 3).astype(complex) * (1 + 0.5j)
          for _ in freqs]
    txt = simulation_25d._touchstone(freqs, m3, 50.0, ["essai"])
    assert "# HZ S MA R 50" in txt
    # Neuf paires par frequence, quatre au plus par ligne physique : 3 lignes.
    corps = [l for l in txt.strip().splitlines()
             if not l.startswith(("!", "#"))]
    assert len(corps) == 2 * 3, "%d lignes de donnees pour un 3-ports" % len(corps)
    jetons = " ".join(corps).split()
    # 2 frequences x (1 frequence + 9 x 2 valeurs) = 2 x 19 = 38 jetons
    assert len(jetons) == 38, "%d jetons, attendu 38" % len(jetons)


@essai("une maille qui ne resout pas la piste ne rend pas de Z0")
def _():
    """Le defaut n. 7, trouve en verifiant les six autres dans le navigateur.

    LA MAILLE AUTOMATIQUE AVAIT UN PLANCHER DE 0,30 mm. Sur une piste de
    0,25 mm -- courant sur une carte a deux couches -- elle sortait donc PLUS
    LARGE QUE LA PISTE, et le solveur resolvait un ruban d'un triangle de
    large. Mesure sur l'exemple 1 du depot : Z0 = 164,7 ohms la ou la section
    rendait 123,6, soit un tiers d'ecart, sans un mot.

    ET LE SEUIL EST MESURE, non choisi. Sur un microruban de 0,35 mm :

        rubans en largeur    Z0 rendu    ecart a Hammerstad
        0,97                 effondre    --
        1,94                 effondre    --
        2,92                 73,31       0,1 %

    En dessous de deux rubans l'extraction ne decrit plus une ligne ; a trois,
    elle vaut le dixieme de pour cent. On refuse donc sous deux, on previent
    sous trois.
    """
    objets = [{"type": "track", "start": [0.0, 0.0], "end": [6.0, 0.0],
               "width": 0.25, "layer": 2, "net": "SIG"}]

    # Maille plus large que la piste : les S restent, Z0 ne se rend pas.
    doc = _doc_base(objets, f1=2e9, f2=2e9, fc=2e9, points=1)
    res = simulation_25d.simuler_25d(doc, mesh_size_mm=0.60)
    assert res["ligne"]["z0_moyen"] == 0.0, (
        "Z0 = %.2f rendu sur 0,4 ruban de large : c'est le chiffre faux d'un"
        " tiers qu'on vient de retirer" % res["ligne"]["z0_moyen"])
    assert res["ligne"]["cumuls_valides"] is False
    for s in res["segments"]:
        assert s["z0"] == 0.0
        assert "maille" in s["raison"].lower(), s["raison"]
    # LES PARAMETRES S, EUX, RESTENT : ils ne dependent d'aucune extraction.
    assert len(res["s"]) == len(res["freqs"]) >= 1
    assert any("ruban" in a.lower() for a in res["avertissements"]), \
        res["avertissements"][:4]

    # Et la maille AUTOMATIQUE, elle, resout la piste sans qu'on le demande.
    res = simulation_25d.simuler_25d(doc)
    assert res["maille_mm"] <= 0.25 / 2.0, (
        "maille automatique a %.3f mm sur une piste de 0,250 mm : le plancher"
        " est revenu" % res["maille_mm"])
    assert res["ligne"]["z0_moyen"] > 0, "la maille automatique doit resoudre"


@essai("un eps_eff physiquement impossible est un refus, pas un chiffre")
def _():
    """Le defaut n. 8, trouve du meme coup.

    Sur une selection COURTE, les deux vias d'acces -- hauts de toute
    l'epaisseur du stratifie -- pesent plus lourd que la ligne, et la ligne
    uniforme equivalente n'en est plus une. Mesure sur deux troncons de 3,2 mm
    d'une carte de 1,55 mm : eps_eff sortait a 8,1 puis 12,0 selon la maille,
    pour un FR4 a 4,4, et Z0 errait de 95 a 134 ohms sans converger.

    UN CHIFFRE IMPOSSIBLE SE REMARQUE ; UN Z0 FAUX DE 30 % NE SE REMARQUE PAS.
    On les refuse donc ensemble : eps_eff d'un microruban est borne par 1 et
    par le plus grand epsilon_r de l'empilage, sans exception.
    """
    # Une carte epaisse et une ligne courte : les acces dominent.
    layers = [
        {"type": "copper", "role": "plane", "thickness": 0.035, "name": "GND"},
        {"type": "dielectric", "thickness": 1.500, "epsilon_r": 4.40,
         "tan_delta": 0.020, "name": "FR4"},
        {"type": "copper", "role": "signal", "thickness": 0.035, "name": "TOP"},
    ]
    objets = [{"type": "track", "start": [0.0, 0.0], "end": [1.2, 0.0],
               "width": 0.30, "layer": 2, "net": "SIG"}]
    doc = {"format": "cao-sim-em-3", "carte": "court", "net": "SIG",
           "stackup": {"layers": layers}, "geometry": {"objects": objets},
           "ports": [{"id": 1, "impedance": 50.0},
                     {"id": 2, "impedance": 50.0}],
           "analyse": {"f_debut": 2e9, "f_fin": 2e9, "points": 1,
                       "f_centre": 2e9}}
    res = simulation_25d.simuler_25d(doc, mesh_size_mm=0.10)

    eps = res["ligne"]["eps_eff"]
    assert eps == 0.0 or 0.9 <= eps <= 4.40 * 1.05, (
        "eps_eff = %.3f rendu alors que l'empilage plafonne a 4,40 : c'est"
        " impossible pour un microruban" % eps)
    if eps == 0.0:
        assert res["ligne"]["z0_moyen"] == 0.0, (
            "eps_eff refuse mais Z0 rendu (%.2f) : les deux sortent de la meme"
            " extraction, ils tombent ensemble" % res["ligne"]["z0_moyen"])
        assert any("eps_eff" in a for a in res["avertissements"]), \
            res["avertissements"][:4]
    # Les parametres S restent exploitables dans les deux cas.
    assert len(res["s"]) == len(res["freqs"])


@essai("les points chauds localisent les discontinuites, sans les chiffrer")
def _():
    """Ce que le 2,5D peut dire de ses discontinuites : OU, et de quel genre.

    IL NE LES CHIFFRE PAS, et cet essai le verifie aussi : `coudes` et
    `transitions` restent vides. Ce qu'on eprouve ici est la LOCALISATION, sur
    trois geometries dont on connait la reponse.

    LES SEUILS SONT MESURES, et cet essai est la mesure : la ligne droite doit
    ne RIEN rendre (fond de bruit du maillage), le coude doit sortir a son
    abscisse avec une part verticale NULLE, et le via a la sienne avec une part
    verticale FRANCHE. C'est cette derniere qui distingue les deux genres sans
    rien supposer de la geometrie.
    """
    W, MAILLE = 0.4, 0.15

    # 1. UNE LIGNE DROITE NE DOIT RIEN RENDRE. C'est le controle negatif, et
    # c'est le plus important : un detecteur qui trouve quelque chose sur une
    # ligne droite ne sert a rien.
    droite = [{"type": "track", "start": [0.0, 0.0], "end": [8.0, 0.0],
               "width": W, "layer": 2, "net": "SIG"}]
    res = simulation_25d.simuler_25d(
        _doc_base(droite, f1=5e9, f2=5e9, fc=5e9, points=1),
        mesh_size_mm=MAILLE)
    pc = res["discontinuites"]["points_chauds"]
    assert pc["points"] == [], (
        "une ligne droite ne porte aucune discontinuite, et %d point(s) sont"
        " sortis : %s" % (len(pc["points"]), pc["points"][:2]))
    assert pc["fond_de_bruit"] < pc["seuil_perp"] / 2.0, (
        "fond de bruit %.3f trop proche du seuil %.3f : la marge de detection"
        " n'existe plus" % (pc["fond_de_bruit"], pc["seuil_perp"]))
    assert max(pc["profil_vert"][2:-2]) < pc["seuil_vert"], (
        "du courant vertical au milieu d'une ligne a plat : %.3f"
        % max(pc["profil_vert"][2:-2]))

    # 2. UN COUDE A 90 DEGRES, a 4 mm : trouve, nomme, et SANS vertical.
    coude = [{"type": "track", "start": [0.0, 0.0], "end": [4.0, 0.0],
              "width": W, "layer": 2, "net": "SIG"},
             {"type": "track", "start": [4.0, 0.0], "end": [4.0, 4.0],
              "width": W, "layer": 2, "net": "SIG"}]
    res = simulation_25d.simuler_25d(
        _doc_base(coude, f1=5e9, f2=5e9, fc=5e9, points=1),
        mesh_size_mm=MAILLE)
    pc = res["discontinuites"]["points_chauds"]
    assert len(pc["points"]) >= 1, "le coude a 90 degres doit etre trouve"
    p = pc["points"][0]
    assert abs(p["s_mm"] - 4.0) <= 3.0 * pc["pas_mm"], (
        "coude trouve a %.2f mm au lieu de 4,00" % p["s_mm"])
    assert p["part_transverse"] >= 0.30, (
        "part transverse %.3f trop faible pour un coude droit"
        % p["part_transverse"])
    assert p["part_verticale"] < pc["seuil_vert"], (
        "un coude a plat ne fait pas descendre le courant : vertical = %.3f"
        % p["part_verticale"])
    assert p["genre"] == "changement de direction", p["genre"]
    assert "coude" in p["cause"].lower(), (
        "le coude doit etre NOMME, et non seulement localise : « %s »"
        % p["cause"])
    assert "90" in p["cause"], "l'angle doit y etre : « %s »" % p["cause"]

    # 3. UN VIA INTERNE : trouve, et reconnu comme CHEMIN VERTICAL.
    sig = {"type": "copper", "role": "signal", "thickness": 0.035}
    die = {"type": "dielectric", "thickness": 0.20, "epsilon_r": 4.37,
           "tan_delta": 0.022}
    layers = [dict(sig, name="TOP"), dict(die, name="D1"),
              dict(sig, name="IN1"), dict(die, name="D2"),
              {"type": "copper", "role": "plane", "thickness": 0.035,
               "name": "GND"}]
    objets = [{"type": "track", "start": [0.0, 0.0], "end": [4.0, 0.0],
               "width": W, "layer": 0, "net": "SIG"},
              {"type": "track", "start": [4.0, 0.0], "end": [8.0, 0.0],
               "width": W, "layer": 2, "net": "SIG",
               "via": {"x": 4.0, "y": 0.0, "drill_diameter": 0.3,
                       "pad_diameter": 0.6}}]
    doc = {"format": "cao-sim-em-3", "carte": "pc_via", "net": "SIG",
           "stackup": {"layers": layers},
           "geometry": {"objects": objets},
           "ports": [{"id": 1, "impedance": 50.0},
                     {"id": 2, "impedance": 50.0}],
           "analyse": {"f_debut": 5e9, "f_fin": 5e9, "points": 1,
                       "f_centre": 5e9}}
    res = simulation_25d.simuler_25d(doc, mesh_size_mm=MAILLE)
    pc = res["discontinuites"]["points_chauds"]
    assert len(pc["points"]) >= 1, "le via interne doit etre trouve"
    p = pc["points"][0]
    assert abs(p["s_mm"] - 4.0) <= 3.0 * pc["pas_mm"], (
        "via trouve a %.2f mm au lieu de 4,00" % p["s_mm"])
    assert p["part_verticale"] >= pc["seuil_vert"], (
        "un via fait DESCENDRE le courant, et la part verticale n'est que de"
        " %.3f" % p["part_verticale"])
    assert p["genre"] == "chemin vertical", p["genre"]
    assert "via" in p["cause"].lower(), p["cause"]

    # ET LES LISTES DU MOTEUR 2D RESTENT VIDES : ce moteur localise, il ne
    # chiffre pas, et le resultat ne doit pas laisser croire le contraire.
    assert res["discontinuites"]["coudes"] == []
    assert res["discontinuites"]["transitions"] == []
    texte = " ".join(res["avertissements"]).lower()
    assert "farad" in texte or "chiffre" in texte or "localise" in texte, (
        "le resultat doit dire qu'il localise sans chiffrer : %s" % texte[:200])


@essai("les points chauds resistent a l'onde stationnaire")
def _():
    """LA FAUSSE PISTE QUI A COUTE DEUX VERSIONS A CETTE FONCTION.

    La densite de courant est calculee port 1 excite, l'autre COURT-CIRCUITE :
    sur une MEME ligne droite, la densite MOYENNE varie d'un facteur trente-deux
    le long du parcours, et sa forme change avec la frequence (presque plate a
    2 GHz, un noeud en plein milieu a 9 GHz). Une premiere version cherchait le
    pic la-dessus : elle trouvait le meme « point chaud » sur la ligne droite et
    sur celle qui porte un coude.

    L'observable retenue -- la PART du courant hors de l'axe -- est un rapport,
    donc insensible a l'amplitude. Cet essai le verifie sur trois frequences :
    la meme ligne droite doit rester muette aux trois, alors que l'onde
    stationnaire y prend trois formes differentes.
    """
    droite = [{"type": "track", "start": [0.0, 0.0], "end": [8.0, 0.0],
               "width": 0.4, "layer": 2, "net": "SIG"}]
    for f in (2e9, 5e9, 9e9):
        res = simulation_25d.simuler_25d(
            _doc_base(droite, f1=f, f2=f, fc=f, points=1), mesh_size_mm=0.15)
        pc = res["discontinuites"]["points_chauds"]
        assert pc["points"] == [], (
            "%.0f GHz : %d point(s) sur une ligne droite -- l'onde"
            " stationnaire est repassee dans l'observable"
            % (f / 1e9, len(pc["points"])))


if __name__ == "__main__":
    print(f"\n{OK} essais réussis, {KO} en échec.")
    sys.exit(1 if KO else 0)
