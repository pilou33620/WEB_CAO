#!/usr/bin/python3
# -*- coding: utf-8 -*-
"""
Banc d'essai de python/analyse_carte.py : les angles des pistes, puis les
règles électriques sur des cartes de laboratoire.
"""

import math
import os
import sys

DOSSIER_PYTHON = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if DOSSIER_PYTHON not in sys.path:
    sys.path.insert(0, DOSSIER_PYTHON)

from analyse_carte import angles, analyser_document


def piste(*pts, n="S", c=0, w=0.2):
    return {"c": c, "n": n, "w": w, "p": [v for pt in pts for v in pt]}


def regles(res):
    return sorted(k["regle"] for k in res)


def test_coudes():
    res = angles([piste((0, 0), (10, 0), (10, 10))])
    assert regles(res) == ["angle_droit"] and res[0]["severite"] == "vigilance", res
    # le même coude en deux pistes qui se touchent bout à bout
    assert regles(angles([piste((0, 0), (10, 0)), piste((10, 0), (10, 10))])) == ["angle_droit"]
    # chanfrein à 45° : deux coudes à 135°, rien à dire
    assert angles([piste((0, 0), (10, 0), (15, 5), (15, 15))]) == []
    # tout droit, coupé en deux
    assert angles([piste((0, 0), (5, 0), (10, 0))]) == []
    # V à 45°
    res = angles([piste((0, 0), (10, 0), (0, 10))])
    assert regles(res) == ["aigu"] and res[0]["deg"] == 45.0 and res[0]["severite"] == "critique"
    # 89,5° est un angle droit à 1° près, 88° est aigu, 92° n'est rien
    assert regles(angles([piste((0, 0), (10, 0), (9.9127, 10))])) == ["angle_droit"]
    assert regles(angles([piste((0, 0), (10, 0), (9.651, 10))])) == ["aigu", "hors_45"]
    assert regles(angles([piste((0, 0), (10, 0), (10.349, 10))])) == ["hors_45"]
    # micro-zigzag d'export (P01x274, CS_Flash) : des V de 45° sur 3,6 et 14 µm
    # dans une piste de 0,21 mm, noyés dans le cuivre
    assert angles([piste((24.08062, 33.515), (24.78414, 34.21852), (24.78414, 34.2149),
                         (24.79428, 34.22504), (24.79428, 34.22866), w=0.21)]) == []
    # coude à 90° dont une jambe (0,05 mm) est plus courte que la demi-largeur
    assert angles([piste((0, 0), (10, 0), (10, 0.05), w=0.2)]) == []
    print("[PASS] test_coudes")


def test_jonctions():
    # T : un bout posé au milieu d'une autre piste ; ses deux 90° ne sont pas
    # redits en angles droits
    res = angles([piste((0, 0), (20, 0)), piste((10, 0), (10, 10))])
    assert regles(res) == ["jonction"] and res[0]["msg"] == "Jonction en T", res
    # bout à 0,05 mm de l'axe d'une piste de 0,2 mm : dans son cuivre
    assert regles(angles([piste((0, 0), (20, 0)), piste((10, 0.05), (10, 10))])) == ["jonction"]
    # Y sur un même sommet, dont deux branches à 30° : jonction ET angle aigu
    res = angles([piste((0, 0), (10, 0)), piste((10, 0), (20, 0)),
                  piste((10, 0), (18.66, 5))])
    assert regles(res) == ["aigu", "hors_45", "jonction"], res
    # croix à quatre branches
    res = angles([piste((0, 0), (20, 0)), piste((10, -10), (10, 0)), piste((10, 0), (10, 10))])
    assert [k["msg"] for k in res] == ["Jonction à 4 branches"], res
    # piste doublée sur elle-même : du cuivre en double, pas un angle
    assert angles([piste((0, 0), (20, 0)), piste((5, 0), (15, 0))]) == []
    print("[PASS] test_jonctions")


def test_perimetre():
    # deux nets différents qui se croisent ne se jugent pas entre eux
    assert angles([piste((0, 0), (20, 0), n="A"), piste((10, 0), (10, 10), n="B")]) == []
    # deux couches non plus
    assert angles([piste((0, 0), (10, 0), c=0), piste((10, 0), (10, 10), c=1)]) == []
    # coude à 90° au centre d'un via : l'anneau le couvre
    pistes = [piste((0, 0), (10, 0), (10, 10))]
    assert angles(pistes, pastilles=[{"x": 10, "y": 0, "r": 0.15}]) == []
    assert regles(angles(pistes, pastilles=[{"x": 30, "y": 0, "r": 0.15}])) == ["angle_droit"]
    print("[PASS] test_perimetre")


def test_hors_45():
    res = angles([piste((0, 0), (10, 3), (20, 0), (30, 3))])
    hors = [k for k in res if k["regle"] == "hors_45"]
    assert len(hors) == 1 and hors[0]["msg"].startswith("3 segments"), res
    assert hors[0]["severite"] == "info"
    print("[PASS] test_hors_45")


def test_arcs():
    # congé tangent : piste -> quart de cercle (anti-horaire) -> piste
    pistes = [piste((0, 0), (10, 0)), piste((15, 5), (15, 15))]
    conge = {"c": 0, "n": "S", "s": [10, 0], "e": [15, 5], "m": [10, 5], "h": 0}
    assert angles(pistes, arcs=[conge]) == []
    # le même arc parcouru dans l'autre sens, déclaré horaire
    inverse = {"c": 0, "n": "S", "s": [15, 5], "e": [10, 0], "m": [10, 5], "h": 1}
    assert angles(pistes, arcs=[inverse]) == []
    # une piste qui repart de l'arc à angle droit de sa tangente
    res = angles([piste((0, 0), (10, 0)), piste((15, 5), (5, 5))], arcs=[conge])
    assert regles(res) == ["angle_droit"], res
    print("[PASS] test_arcs")


def test_unites():
    # fichier en pouces : un décalage de 0,5 µm (2e-5 in) reste le même point
    res = angles([piste((0, 0), (1, 0), w=0.008), piste((1.00002, 0), (1.00002, 1), w=0.008)],
                 unite_mm=25.4)
    assert regles(res) == ["angle_droit"], res
    print("[PASS] test_unites")


# ==========================================================================
# Les règles électriques, sur un empilage quatre couches de laboratoire :
# Top / L2 (plan GND) / L3 (plan GND ou 3V3) / Bot. Rangs 0, 2, 4, 6.
# ==========================================================================
def empilage(net_l3="GND"):
    cu = lambda nom, role, net=None: dict(
        {"type": "copper", "name": nom, "thickness": 0.035, "role": role},
        **({"net": net} if net else {}))
    di = lambda nom, ep: {"type": "dielectric", "name": nom, "thickness": ep,
                          "epsilon_r": 4.3, "tan_delta": 0.02}
    return {"layers": [cu("Top", "signal"), di("d1", 0.2), cu("L2", "plane", "GND"),
                       di("d2", 1.0), cu("L3", "plane", net_l3), di("d3", 0.2),
                       cu("Bot", "signal")]}


def analyser(**k):
    doc = {"format": "cao-analyse-carte-1", "unite_mm": 1, "pistes": [],
           "stackup": empilage(k.pop("net_l3", "GND"))}
    doc.update(k)
    return analyser_document(doc)


def via(net="CLK", **k):
    v = {"x": 10.0, "y": 10.0, "layer_from": 0, "layer_to": 6, "net": net,
         "drill_diameter": 0.3, "retours": [], "retours_rayon_mm": 5.0}
    v.update(k)
    return v


def masse(x, y=10.0):
    return {"x": x, "y": y, "layer_from": 0, "layer_to": 6, "net": "GND",
            "drill_diameter": 0.3}


def de(res, regle):
    return [k for k in res["constats"] if k["regle"] == regle]


def test_retour_meme_masse():
    # un via de masse à 0,8 mm : la boucle est courte, rien à dire
    res = analyser(vias=[via(retours=[masse(10.8)])], natures={"CLK": "Rapide"})
    assert de(res, "retour") == [], res["constats"]
    assert res["bilan"]["retour"] == {"vias": 1, "plan_change": 1}, res["bilan"]
    # aucun via dans le rayon, le plus proche à 30 mm. Un Lent (10 ns) tient
    # (λ/20 = 207 mm au genou de 35 MHz) : sa cadence de 10 MHz (CADENCES)
    # laisse son front à 10 ns
    res = analyser(vias=[via(retour_hors_rayon_mm=30.0)], natures={"CLK": "Lent"})
    assert de(res, "retour") == [], de(res, "retour")
    assert res["reglages"]["cadences"]["Lent"] == 1e7, res["reglages"]
    # cadencé à 100 MHz, son front tombe à 1 ns, genou 350 MHz, λ/20 = 21 mm :
    # la boucle est trop grande. Une seule colonne, à la cadence de la classe
    res = analyser(vias=[via(retour_hors_rayon_mm=30.0)], natures={"CLK": "Lent"},
                   reglages={"cadences": {"Lent": 1e8}})
    k = de(res, "retour")
    assert len(k) == 1 and [f["verdict"] for f in k[0]["frequences"]] == ["vigilance"], k
    assert [(f["f"], round(f["tr"] * 1e9, 3)) for f in k[0]["frequences"]] == [(1e8, 1)]
    assert 1 < k[0]["frequences"][0]["d_sur_lambda20"] < 2, k[0]["frequences"]
    assert "30.00 mm" in k[0]["msg"] and "tient des fronts" in k[0]["msg"], k[0]["msg"]
    # un front RF de 0,1 ns (genou 3,5 GHz, λ/20 ≈ 2 mm) condamne
    k = de(analyser(vias=[via(retour_hors_rayon_mm=30.0)], natures={"CLK": "RF"}), "retour")
    assert [f["verdict"] for f in k[0]["frequences"]] == ["critique"], k
    # le front de la classe se règle dans le document
    k = de(analyser(vias=[via(retour_hors_rayon_mm=30.0)], natures={"CLK": "Lent"},
                    reglages={"tr": {"Lent": 0.1e-9}}), "retour")
    assert k and k[0]["severite"] == "critique", k
    # aucun via de masse du tout : rien ne referme, critique sans chiffre
    k = de(analyser(vias=[via()]), "retour")
    assert len(k) == 1 and k[0]["severite"] == "critique" and "aucun via" in k[0]["msg"], k
    # un via de masse ne rattrape pas un plan qui n'existe pas au droit du via
    k = de(analyser(vias=[via(retours=[masse(10.8)], plans_sans_cuivre=["L3"])]), "retour")
    assert len(k) == 1 and k[0]["severite"] == "critique" and "pas de cuivre" in k[0]["msg"], k
    print("[PASS] test_retour_meme_masse")


def test_retour_gnd_vers_alim():
    # GND -> 3V3 : le via de masse ne sert à rien, c'est le découplage qui
    # porte le retour ; un pont proche fait mieux que pas de pont du tout
    loin = analyser(net_l3="3V3", natures={"CLK": "Rapide"},
                    vias=[via(retours=[masse(10.8)], ponts=[], ponts_rayon_mm=10.0,
                              aire_plans_mm2=1000.0, er_plans=4.3)])
    pres = analyser(net_l3="3V3", natures={"CLK": "Rapide"},
                    vias=[via(retours=[masse(10.8)], ponts_rayon_mm=10.0,
                              aire_plans_mm2=1000.0, er_plans=4.3,
                              ponts=[{"x": 11.5, "y": 10.0, "repere": "C5",
                                      "capacite_F": 100e-9, "esl_nH": 0.5}])])
    kl, kp = de(loin, "retour"), de(pres, "retour")
    assert kl and "GND → 3V3" in kl[0]["msg"], (kl, loin["notes"])
    # aucun pont ni dans le rayon ni au-delà : pas de 100 nF inventé au rayon
    assert "sur toute la carte" in kl[0]["msg"], kl
    g = lambda k: [f["valeur"] for f in k[0]["frequences"]] if k else [0]
    assert all(a < b for a, b in zip(g(kp), g(kl))), (g(kp), g(kl))
    assert not kp or "C5" in kp[0]["msg"], kp
    print("[PASS] test_retour_gnd_vers_alim")


def test_retour_cavite_modale():
    # La page donne la cavité (rectangle) et TOUS les ponts : plus de pont
    # supposé au rayon. GND -> 3V3 sans rien, par un 0 ohm vers VDD et ses
    # condensateurs, par un vrai découplage au pied du via.
    cav = dict(ponts=[], ponts_rayon_mm=10.0, aire_plans_mm2=2500.0, er_plans=4.3,
               cavite_rect={"x0": 0.0, "y0": 0.0, "a": 50.0, "b": 50.0},
               ponts_indirects=[], ponts_carte=[])
    run = lambda cl, **k: de(analyser(net_l3="3V3", natures={"CLK": cl},
                                      vias=[via(retours=[masse(10.8)], **dict(cav, **k))]), "retour")
    relais = lambda x: [{"x": x, "y": 10.0, "repere": "R5", "r_ohm": 0.0, "relais": "VDD",
                         "caps": [{"x": x + 2, "y": 10.0, "repere": "C9", "capacite_F": 100e-9}]}]
    # sans rien, la cavité seule : à 35 MHz (Lent) elle pèse des dizaines d'ohms
    rien = run("Lent")
    assert rien and rien[0]["severite"] == "critique" and "sur toute la carte" in rien[0]["msg"], rien
    # un 0 ohm vers un rail découplé referme le retour ; un découplage aussi
    assert run("Lent", ponts_indirects=relais(14.0)) == []
    assert run("Lent", ponts_carte=[{"x": 11.0, "y": 10.0, "repere": "C5",
                                     "capacite_F": 100e-9}]) == []
    # le relais est nommé, et sa boucle compte jusqu'au condensateur (35 + 2 mm)
    loin = run("Rapide", ponts_indirects=relais(45.0))
    assert loin and "R5 → VDD à 37.00 mm" in loin[0]["msg"], loin
    # deux étages : R5 vers VDD sans condensateur, puis R6 vers Vout découplé
    chaine = [{"x": 45.0, "y": 10.0, "repere": "R5", "r_ohm": 0.0, "relais": "VDD", "caps": [],
               "suivants": [{"x": 47.0, "y": 10.0, "repere": "R6", "r_ohm": 0.0, "relais": "Vout",
                             "caps": [{"x": 48.0, "y": 10.0, "repere": "C30", "capacite_F": 10e-6}]}]}]
    k = run("Rapide", ponts_indirects=chaine)
    assert k and "R5 → VDD → R6 → Vout à 38.00 mm" in k[0]["msg"], k
    # la boucle longue du relais résonne avec la capacité des plans : la fiche
    # nomme le pic, et le juge le voit sous le genou (f_pire_hz)
    assert "la traversée résonne à" in k[0]["msg"], k[0]["msg"]
    assert all(f["f_pire_hz"] < f["f_eval"] for f in k[0]["frequences"]), k[0]["frequences"]
    print("[PASS] test_retour_cavite_modale")


def droite(n, y, x1=0.0, x2=100.0, c="Top", w=0.2):
    return {"c": c, "n": n, "w": w, "p": [x1, y, x2, y]}


def test_diaphonie():
    # 100 mm côte à côte à 0,2 mm (écart = hauteur au plan) : Kb ≈ 9 %
    res = analyser(pistes=[droite("CLK", 0.0), droite("DATA", 0.4)],
                   natures={"CLK": "Horloge", "DATA": "Lent"})
    k = {(x["n"], x["msg"].split(" :")[0]): x for x in de(res, "diaphonie")}
    assert list(k) == [("DATA", "Depuis CLK")], list(k)     # un couple, une ligne
    v = k[("DATA", "Depuis CLK")]
    # deux horloges s'agressent l'une l'autre : toujours une ligne, qui le dit
    mu = de(analyser(pistes=[droite("CLK", 0.0), droite("CLK2", 0.4)],
                     natures={"CLK": "Horloge", "CLK2": "Horloge"}), "diaphonie")
    assert len(mu) == 1 and "réciproquement" in mu[0]["msg"], mu
    assert v["severite"] == "critique" and 8 < float(v["msg"].split("Kb ")[1].split(" ")[0]) < 10, v
    assert "100.0 mm en regard" in v["msg"] and "écart mini 0.200 mm" in v["msg"], v["msg"]
    # le NEXT sature : au front le plus raide il vaut Kb, pas davantage
    assert max(f["valeur"] for f in v["frequences"]) < 0.10, v["frequences"]
    # 10 mm seulement : sous la longueur de saturation, le niveau baisse
    court = de(analyser(pistes=[droite("CLK", 0.0, x2=10.0), droite("DATA", 0.4, x2=10.0)],
                        natures={"CLK": "Horloge", "DATA": "Lent"}), "diaphonie")
    assert all(max(f["valeur"] for f in c["frequences"]) <
               max(f["valeur"] for f in v["frequences"]) for c in court), court
    # hors jeu : la masse, une paire différentielle, une voisine lointaine
    assert de(analyser(pistes=[droite("CLK", 0.0), droite("GND", 0.4)],
                       natures={"GND": "Masse"}), "diaphonie") == []
    assert de(analyser(pistes=[droite("CLK", 0.0), droite("AGND", 0.4)],
                       reference_nets=["AGND"]), "diaphonie") == []
    assert de(analyser(pistes=[droite("USB_P", 0.0), droite("USB_N", 0.4)],
                       paires=[["USB_P", "USB_N"]]), "diaphonie") == []
    assert de(analyser(pistes=[droite("CLK", 0.0), droite("DATA", 2.0)]), "diaphonie") == []
    # un nœud de découpage agresse, une alimentation calme non
    sw = analyser(pistes=[droite("SW", 0.0), droite("DATA", 0.4)],
                  natures={"SW": "Alimentation"}, bruyants=["SW"])
    assert sw["bilan"]["diaphonie"]["couples"] >= 1, sw["bilan"]
    assert de(analyser(pistes=[droite("SW", 0.0), droite("DATA", 0.4)],
                       natures={"SW": "Alimentation"}, bruyants=["SW"],
                       reglages={"tr": {"Découpage": 1e-9}}), "diaphonie")
    vcc = analyser(pistes=[droite("VCC", 0.0), droite("DATA", 0.4)],
                   natures={"VCC": "Alimentation"})
    assert vcc["bilan"]["diaphonie"]["couples"] == 0 and de(vcc, "diaphonie") == []
    # UN ARC compte comme les pistes droites : un quart de cercle de 20 mm de
    # rayon, décalé de 0,4 mm, suit la victime et la couple (agresseur à 1 ns :
    # sur 31 mm, une horloge à 2 ns resterait sous le budget)
    arc = {"c": "Top", "n": "CLK", "w": 0.2, "s": [0.0, 20.0], "e": [20.0, 0.0],
           "m": [0.0, 0.0], "h": True}
    arc2 = {"c": "Top", "n": "DATA", "w": 0.2, "s": [0.0, 20.4], "e": [20.4, 0.0],
            "m": [0.0, 0.0], "h": True}
    k = de(analyser(arcs=[arc, arc2], natures={"CLK": "Rapide", "DATA": "Lent"}),
           "diaphonie")
    assert k and "Depuis CLK" in k[0]["msg"], k
    # LARGES FACES : deux couches de signal voisines (Top, In1) sans plan entre
    # elles, pistes superposées : couplées ; décalées de 3 mm : non
    st = {"layers": [{"type": "copper", "name": "Top", "role": "signal", "thickness": 0.035},
                     {"type": "dielectric", "name": "d1", "thickness": 0.2, "epsilon_r": 4.3},
                     {"type": "copper", "name": "In1", "role": "signal", "thickness": 0.035},
                     {"type": "dielectric", "name": "d2", "thickness": 0.2, "epsilon_r": 4.3},
                     {"type": "copper", "name": "L3", "role": "plane", "net": "GND",
                      "thickness": 0.035}]}
    sup = analyser_document({"format": "cao-analyse-carte-1", "unite_mm": 1, "stackup": st,
                             "pistes": [droite("CLK", 0.0), droite("DATA", 0.0, c="In1")],
                             "natures": {"CLK": "Horloge", "DATA": "Lent"}})
    k = [x for x in de(sup, "diaphonie") if "couche voisine" in x["msg"]]
    assert k and k[0]["n"] == "DATA" and k[0]["c"] == "Top ↔ In1", de(sup, "diaphonie")
    assert sup["bilan"]["diaphonie"]["couples_larges_faces"] >= 1, sup["bilan"]
    # RÉSOLU, pas estimé : les rubans à leurs deux hauteurs. Un plan de plus
    # au-dessus de la paire ferme le domaine et réduit le couplage.
    assert "MoM, un plan" in k[0]["msg"], k[0]["msg"]
    kb = lambda m: float(m.split("Kb ")[1].split(" %")[0])
    st2 = {"layers": [{"type": "copper", "name": "L0", "role": "plane", "net": "GND",
                       "thickness": 0.035},
                      {"type": "dielectric", "name": "d0", "thickness": 0.2, "epsilon_r": 4.3}]
           + st["layers"]}
    k2 = [x for x in de(analyser_document({"format": "cao-analyse-carte-1", "unite_mm": 1,
                                           "stackup": st2,
                                           "pistes": [droite("CLK", 0.0), droite("DATA", 0.0, c="In1")],
                                           "natures": {"CLK": "Horloge", "DATA": "Lent"}}),
                        "diaphonie") if "couche voisine" in x["msg"]]
    assert k2 and "MoM, deux plans" in k2[0]["msg"], k2
    assert kb(k2[0]["msg"]) < kb(k[0]["msg"]), (k2[0]["msg"], k[0]["msg"])
    loin = analyser_document({"format": "cao-analyse-carte-1", "unite_mm": 1, "stackup": st,
                              "pistes": [droite("CLK", 0.0), droite("DATA", 3.0, c="In1")],
                              "natures": {"CLK": "Horloge", "DATA": "Lent"}})
    assert not [x for x in de(loin, "diaphonie") if "couche voisine" in x["msg"]], loin
    # LA SOMME : deux agresseurs de part et d'autre, chacun sous le budget
    # (vigilance), ensemble au-dessus (critique)
    tri = [droite("A1", -0.4, x2=30.0), droite("V", 0.0, x2=30.0), droite("A2", 0.4, x2=30.0)]
    nat = {"A1": "Rapide", "A2": "Rapide", "V": "Lent"}
    res = de(analyser(pistes=tri, natures=nat), "diaphonie")
    seuls = [x for x in res if x["n"] == "V" and "Somme" not in x["msg"]]
    somme = [x for x in res if "Somme de 2 agresseurs" in x["msg"]]
    assert somme and all(x["severite"] != "critique" for x in seuls), res
    assert somme[0]["severite"] == "critique", somme
    print("[PASS] test_diaphonie")


def test_document_sans_empilage():
    res = analyser_document({"format": "cao-analyse-carte-1", "pistes": []})
    assert res["constats"] == [] and any("empilage" in n for n in res["notes"]), res
    print("[PASS] test_document_sans_empilage")


def carre(x1, y1, x2, y2):
    return [x1, y1, x2, y1, x2, y2, x1, y2]


def rond(x, y, r, n=16):
    return [v for k in range(n) for v in (x + r * math.cos(2 * math.pi * k / n),
                                           y + r * math.sin(2 * math.pi * k / n))]


def empilage_de(*roles, di=0.2):
    """Un empilage de laboratoire : ("Top", "signal"), ("L2", "plane", "GND")…"""
    out = []
    for k, r in enumerate(roles):
        if k:
            out.append({"type": "dielectric", "name": "d%d" % k, "epsilon_r": 4.3,
                        "tan_delta": 0.02, "thickness": di[k - 1] if isinstance(di, list) else di})
        out.append(dict({"type": "copper", "name": r[0], "thickness": 0.035, "role": r[1]},
                        **({"net": r[2]} if len(r) > 2 else {})))
    return {"layers": out}


def verdicts(k):
    return [f["verdict"] for f in k["frequences"]]


def test_empilage():
    # quatre couches classiques : rien sur les références ; la cavité 3V3 / GND
    # de 1 mm n'est qu'une info
    res = analyser(net_l3="3V3", pistes=[droite("CLK", 0.0)],
                   natures={"CLK": "Horloge", "GND": "Masse", "3V3": "Alimentation"})
    k = de(res, "empilage")
    assert [x["severite"] for x in k] == ["info"] and "1.00 mm" in k[0]["msg"], k
    assert k[0]["x"] is None and k[0]["n"] is None, k
    # deux couches sans plan : l'horloge du dessus n'a pas de référence, et les
    # deux faces de signal se regardent
    deux = empilage_de(("Top", "signal"), ("Bot", "signal"), di=1.5)
    k = de(analyser(stackup=deux, pistes=[droite("CLK", 0.0), droite("DATA", 5.0, c="Bot")],
                    natures={"CLK": "Horloge"}), "empilage")
    sev = {(x["c"], x["severite"]) for x in k}
    assert ("Top", "critique") in sev and ("Bot", "vigilance") in sev and \
        ("Top ↔ Bot", "vigilance") in sev, k
    # un plan derrière une autre couche de signal, et un empilage dissymétrique
    loin = empilage_de(("Top", "signal"), ("In1", "signal"), ("In2", "plane", "GND"),
                       ("Bot", "signal"), di=[0.2, 0.2, 0.5])
    k = de(analyser(stackup=loin, pistes=[droite("CLK", 0.0)]), "empilage")
    msgs = " | ".join(x["msg"] for x in k)
    assert "derrière une autre couche" in msgs and "dissymétrique" in msgs, msgs
    print("[PASS] test_empilage")


def test_impedance():
    # une piste uniforme ne se compare qu'à elle-même : rien
    assert de(analyser(pistes=[droite("DATA", 0.0)]), "impedance") == []
    # une ligne Rapide de 0,1 mm, loin des 50 Ω visés, sur 100 mm : critique
    res = analyser(pistes=[droite("USB", 0.0, w=0.1)], natures={"USB": "Rapide"})
    k = de(res, "impedance")
    assert len(k) == 1 and verdicts(k[0]) == ["critique"] and "cible 50 Ω" in k[0]["msg"], k
    assert res["bilan"]["impedance"]["nets"] == 1, res["bilan"]
    # un rétrécissement de 20 mm dans une piste lente de 0,3 mm : invisible tant
    # que le front est lent -- et il le reste, un Lent cadencé à 10 MHz --,
    # vu quand, cadencé à 100 MHz, il tombe à 1 ns
    retreci = [droite("DATA", 0.0, x2=40.0, w=0.3),
               droite("DATA", 0.0, x1=40.0, x2=60.0, w=0.1),
               droite("DATA", 0.0, x1=60.0, w=0.3)]
    assert de(analyser(pistes=retreci), "impedance") == []
    k = de(analyser(pistes=retreci, reglages={"cadences": {"Lent": 1e8}}), "impedance")
    assert len(k) == 1 and verdicts(k[0]) != ["ok"], k
    assert "–" in k[0]["msg"], k[0]["msg"]
    print("[PASS] test_impedance")


def test_fentes():
    plan = {"c": "L2", "n": "GND", "o": carre(-10, -20, 110, 20),
            "t": [carre(40, -15, 42, 15), rond(60, 0, 0.5), rond(70, 0.3, 0.4)]}
    base = dict(pistes=[droite("CLK", 0.0)], natures={"CLK": "Rapide", "GND": "Masse"},
                pastilles=[{"x": 60, "y": 0, "r": 0.3, "n": "CLK"}])
    k = de(analyser(plans=[plan], **base), "fente")
    # la fente de 30 mm ; ni le dégagement du via du net, ni celui d'un autre
    # via frôlé ne comptent
    assert len(k) == 1 and k[0]["severite"] == "critique" and 40 < k[0]["x"] < 42, k
    d1, d2 = (float(v) for v in k[0]["msg"].split("contourne à ")[1].split(" mm")[0].split(" / "))
    assert "Plan L2" in k[0]["msg"] and 14.5 < d1 < 15.5 and 14.5 < d2 < 15.5, k[0]["msg"]
    sans = dict(plan, t=[])
    res = analyser(plans=[sans], **base)
    assert de(res, "fente") == [] and res["bilan"]["fente"]["franchissements"] == 0, res["bilan"]
    # un plan coupé de bord à bord se plafonne à 30 mm et le dit
    coupe = [{"c": "L2", "n": "GND", "o": carre(-10, -20, 40, 20)},
             {"c": "L2", "n": "GND", "o": carre(42, -20, 110, 20)}]
    k = de(analyser(plans=coupe, **base), "fente")
    assert k and "bord à l'autre" in k[0]["msg"], k
    print("[PASS] test_fentes")


def test_coutures():
    plans = [{"c": "L2", "n": "GND", "o": carre(0, 0, 50, 50)},
             {"c": "L3", "n": "GND", "o": carre(0, 0, 50, 50)}]
    base = dict(plans=plans, pistes=[droite("CLK", 60.0)],
                natures={"CLK": "Rapide", "GND": "Masse"})
    coins = [{"x": x, "y": y, "d": 0.3, "n": "GND"} for x in (0.5, 49.5) for y in (0.5, 49.5)]
    k = de(analyser(percages=coins, **base), "couture")
    assert len(k) == 1 and k[0]["severite"] == "critique" and k[0]["c"] == "L2 ↔ L3", k
    assert abs(k[0]["x"] - 25) < 1 and abs(k[0]["y"] - 25) < 1, k
    # une maille de 5 mm tient 1 ns
    maille = [{"x": x + 2.5, "y": y + 2.5, "d": 0.3, "n": "GND"}
              for x in range(0, 50, 5) for y in range(0, 50, 5)]
    res = analyser(percages=maille, **base)
    assert de(res, "couture") == [] and res["bilan"]["couture"]["cavites"] == 1, res["bilan"]
    # sans aucun via : critique ; un via d'un autre net ne coud rien
    k = de(analyser(percages=[{"x": 25, "y": 25, "d": 0.3, "n": "CLK"}], **base), "couture")
    assert k and "Aucun via" in k[0]["msg"], k
    print("[PASS] test_coutures")


def test_decouplage():
    natures = {"VCC": "Alimentation", "GND": "Masse", "CLK": "Rapide"}
    u1 = {"ref": "U1", "c": "Top", "broches": [{"x": 0, "y": 0, "n": "VCC", "pin": "1"},
                                                {"x": 1, "y": 0, "n": "GND", "pin": "2"},
                                                {"x": 2, "y": 0, "n": "CLK", "pin": "3"}]}

    def capa(x, ref="C1", autre="GND"):
        return {"ref": ref, "c": "Top", "broches": [{"x": x, "y": 0, "n": "VCC"},
                                                    {"x": x + 1, "y": 0, "n": autre}]}
    assert de(analyser(composants=[u1, capa(2.0)], natures=natures), "decouplage") == []
    # à 15 mm : hors du rayon de λ/40 au genou de 350 MHz (≈ 10 mm)
    k = de(analyser(composants=[u1, capa(15.0)], natures=natures), "decouplage")
    assert len(k) == 1 and verdicts(k[0]) == ["vigilance"] and "C1" in k[0]["msg"], k
    assert k[0]["n"] == "VCC" and "tient des fronts" in k[0]["msg"], k
    # un condensateur qui ne va pas à la masse ne découple pas
    k = de(analyser(composants=[u1, capa(2.0, autre="CLK")], natures=natures), "decouplage")
    assert k and k[0]["severite"] == "critique" and "aucun" in k[0]["msg"], k
    # LE CHEMIN RÉEL : à 2 mm à vol d'oiseau, mais la piste du rail fait un
    # détour de 30 mm -- c'est elle qui compte
    detour = [{"c": "Top", "n": "VCC", "w": 0.2, "p": [0, 0, 0, 15, 2, 15, 2, 0]}]
    k = de(analyser(composants=[u1, capa(2.0)], pistes=detour, natures=natures), "decouplage")
    assert k and "32.0 mm par la piste (2.0 à vol d'oiseau)" in k[0]["msg"], k
    # LA VALEUR : un 10 µF tout près résonne vers 1 MHz, trop bas pour un
    # circuit Rapide (genou 350 MHz) ; un 10 nF au même endroit tient
    gros = dict(capa(2.0), val="10uF", pkg="0805")
    k = de(analyser(composants=[u1, gros], natures=natures), "decouplage")
    assert k and k[0]["severite"] == "vigilance" and "résonance à" in k[0]["msg"], k
    assert all(f["f_res"] < 3e6 for f in k[0]["frequences"]), k[0]["frequences"]
    petit = dict(capa(2.0), val="10nF", pkg="0402")
    assert de(analyser(composants=[u1, petit], natures=natures), "decouplage") == []
    # le 10 µF tout près ET un 10 nF à 3 mm : le 10 nF découple, plus rien
    petit3 = dict(capa(3.0, ref="C2"), val="10nF", pkg="0402")
    assert de(analyser(composants=[u1, gros, petit3], natures=natures), "decouplage") == []
    print("[PASS] test_decouplage")


def test_bord():
    contour = {"o": carre(0, 0, 50, 50)}
    res = analyser(contour=contour, pistes=[droite("DATA", 0.2, x1=10.0, x2=40.0)])
    k = de(res, "bord")
    fab = [x for x in k if not x["frequences"]]
    cem = [x for x in k if x["frequences"]]
    assert len(fab) == 1 and fab[0]["severite"] == "critique" and "0.10 mm" in fab[0]["msg"], k
    assert cem == [], cem           # un Lent cadencé à 10 MHz ne rayonne pas ici
    vite = de(analyser(contour=contour, pistes=[droite("DATA", 0.2, x1=10.0, x2=40.0)],
                       reglages={"cadences": {"Lent": 1e8}}), "bord")
    cem = [x for x in vite if x["frequences"]]
    assert len(cem) == 1 and verdicts(cem[0]) == ["vigilance"], cem
    assert cem[0]["frequences"][0]["f"] == 1e8, cem
    assert de(analyser(contour=contour, pistes=[droite("DATA", 25.0, x1=10.0, x2=40.0)]),
              "bord") == []
    # la règle des 20 H : 3V3 aussi grand que la masse
    plans = [{"c": "L2", "n": "GND", "o": carre(0, 0, 50, 50)},
             {"c": "L3", "n": "3V3", "o": carre(0, 0, 50, 50)}]
    k = de(analyser(contour=contour, plans=plans, net_l3="3V3",
                    natures={"GND": "Masse", "3V3": "Alimentation"}), "bord")
    assert [x["severite"] for x in k] == ["info"] and "20 H" in k[0]["msg"], k
    assert any("contour" in n for n in analyser()["notes"])
    print("[PASS] test_bord")


def test_paires():
    p, n = droite("USB_P", 0.0, x2=50.0), droite("USB_N", 0.4, x2=50.0)
    rf = {"USB_P": "RF", "USB_N": "RF"}
    k = de(analyser(pistes=[p, n], paires=[["USB_P", "USB_N"]], natures=rf,
                    reglages={"zdiff": 50}), "paire")
    zd = float(k[0]["msg"].split("Z_diff ")[1].split(" ")[0])
    assert 80 < zd < 120, zd
    # la cible réglée sur la Z_diff de la paire : plus rien à dire
    assert de(analyser(pistes=[p, n], paires=[["USB_P", "USB_N"]],
                       reglages={"zdiff": zd}), "paire") == [], zd
    # 5 mm de plus sur N : 30 ps d'écart, rien pour 1 ns, critique pour 0,1 ns
    long_ = [p, n, droite("USB_N", 0.4, x1=50.0, x2=55.0)]
    ok = de(analyser(pistes=long_, paires=[["USB_P", "USB_N"]], reglages={"zdiff": zd},
                     natures={"USB_P": "Rapide", "USB_N": "Rapide"}), "paire")
    rf = de(analyser(pistes=long_, paires=[["USB_P", "USB_N"]], reglages={"zdiff": zd},
                     natures={"USB_P": "RF", "USB_N": "RF"}), "paire")
    assert ok == [] and rf and rf[0]["severite"] == "critique", (ok, rf)
    assert rf[0]["frequences"][0]["skew"] > 0.2 and "5.00 mm" in rf[0]["msg"], rf
    # deux vias sur P, aucun sur N
    k = de(analyser(pistes=[p, n], paires=[["USB_P", "USB_N"]], reglages={"zdiff": zd},
                    percages=[{"x": 0, "y": 0, "d": 0.3, "n": "USB_P"},
                              {"x": 50, "y": 0, "d": 0.3, "n": "USB_P"}]), "paire")
    assert k and k[0]["severite"] == "vigilance" and "2 via(s)" in k[0]["msg"], k
    # LA MASSE COPLANAIRE qui borde la paire fait
    # baisser Z_diff (0,1 mm de chaque côté : 104 → 96 Ω)
    l2 = {"c": "L2", "n": "GND", "o": carre(-5, -5, 60, 5)}
    cop = {"c": "Top", "n": "GND", "o": carre(-5, -5, 60, 5), "t": [carre(-1, -0.2, 51, 0.6)]}
    nat = {"USB_P": "Rapide", "USB_N": "Rapide", "GND": "Masse"}
    k = de(analyser(pistes=[p, n], paires=[["USB_P", "USB_N"]], natures=nat,
                    plans=[l2, cop], reglages={"zdiff": 200}), "paire")
    zc = float(k[0]["msg"].split("Z_diff ")[1].split(" ")[0])
    assert zc < zd - 5, (zc, zd)
    # LE PLAN SOUS UNE SEULE MOITIÉ : L2 évidé sous N seulement, sur 20 mm
    trou = {"c": "L2", "n": "GND", "o": carre(-5, -5, 60, 5), "t": [carre(10, 0.25, 30, 2)]}
    k = de(analyser(pistes=[p, n], paires=[["USB_P", "USB_N"]], natures=nat,
                    plans=[trou], reglages={"zdiff": zd}), "paire")
    assert k and "sous une seule moitié sur 20" in k[0]["msg"], k
    assert k[0]["frequences"][0]["plan_bancal"] > 0.1, k[0]["frequences"]
    print("[PASS] test_paires")


def test_orphelins():
    pad = lambda x, y: {"x": x, "y": y, "r": 0.3, "c": "Top"}
    # une antenne : 10 mm depuis une pastille, vers rien
    res = analyser(pistes=[droite("S", 0.0, x2=10.0)], pastilles=[pad(0, 0)])
    k = de(res, "orphelin")
    assert len(k) == 1 and "antenne" in k[0]["msg"] and k[0]["x"] == 10.0, k
    # sévérité de base « bout libre » ; un Lent cadencé à 10 MHz garde ses 10 ns
    assert verdicts(k[0]) == ["ok"] and k[0]["severite"] == "vigilance", k
    assert k[0]["frequences"][0]["f"] == 1e7 and k[0]["frequences"][0]["tr"] == 1e-8, k
    # une piste reliée à rien : critique, une seule fois
    k = de(analyser(pistes=[droite("S", 0.0, x1=20.0, x2=30.0)]), "orphelin")
    assert len(k) == 1 and k[0]["severite"] == "critique" and "isolée" in k[0]["msg"], k
    # le dépassement de 0,2 mm après un coin (P01x290) : le T tombe sur le corps
    pistes = [droite("S", 5.0, x2=10.2), {"c": "Top", "n": "S", "w": 0.2, "p": [10, 5, 10, 15]}]
    k = de(analyser(pistes=pistes, pastilles=[pad(0, 5), pad(10, 15)]), "orphelin")
    assert len(k) == 1 and "Dépassement de 0.20 mm" in k[0]["msg"], k
    # une piste qui entre dans le versement de son net est reliée
    plan = {"c": "Top", "n": "GND", "o": carre(8, -5, 20, 5)}
    assert de(analyser(pistes=[droite("GND", 0.0, x2=10.0)], pastilles=[pad(0, 0)],
                       plans=[plan]), "orphelin") == []
    # bien reliée aux deux bouts : rien
    assert de(analyser(pistes=[droite("S", 0.0, x2=10.0)], pastilles=[pad(0, 0), pad(10, 0)]),
              "orphelin") == []
    print("[PASS] test_orphelins")


def test_antenne_porteuse_rails():
    pad = lambda x, y: {"x": x, "y": y, "r": 0.3, "c": "Top"}
    # une antenne : ouverte au bout, sur une réserve de plan -- rien d'électrique
    ant = dict(pistes=[droite("ANT", 0.0, x2=30.0, w=0.1)], pastilles=[pad(0, 0)],
               vias=[via(net="ANT", retour_hors_rayon_mm=30.0)])
    assert de(analyser(natures={"ANT": "RF"}, **ant), "orphelin")
    res = analyser(natures={"ANT": "Antenne"}, **ant)
    assert [k for k in res["constats"] if k["n"] == "ANT"] == [], res["constats"]
    assert any("Antenne" in n and "ANT" in n for n in res["notes"]), res["notes"]
    # isolée, une antenne reste un oubli
    k = de(analyser(pistes=[droite("ANT", 0.0, x1=20.0, x2=30.0)],
                    natures={"ANT": "Antenne"}), "orphelin")
    assert k and k[0]["severite"] == "critique", k
    # porteuse RF à 868 MHz : front 0,40 ns, sans borne de période ni cadence
    # (même cadencé à 10 GHz) ; le via qui condamne à 0,1 ns tient ici mieux
    rf = dict(vias=[via(retour_hors_rayon_mm=5.0)], natures={"CLK": "RF"})
    dur = de(analyser(**rf), "retour")
    k = de(analyser(reglages={"porteuse_rf": 868e6, "cadences": {"RF": 1e10}}, **rf),
           "retour")
    assert k and all(abs(f["tr"] - 0.35 / 868e6) < 1e-15 and f["porteuse"] == 868e6
                     for f in k[0]["frequences"]), k
    assert max(f["valeur"] for f in k[0]["frequences"]) <         max(f["valeur"] for f in dur[0]["frequences"]), (k, dur)
    # un rail au nom automatique classé Analogique : montré, pas reclassé
    u = {"ref": "U3", "c": "Top", "broches": [{"x": 0, "y": 0, "n": "SIGN8", "pin": "8"},
                                               {"x": 1, "y": 0, "n": "GND", "pin": "4"}]}
    c = {"ref": "C9", "c": "Top", "broches": [{"x": 2, "y": 0, "n": "SIGN8"},
                                               {"x": 3, "y": 0, "n": "GND"}]}
    res = analyser(composants=[u, c], natures={"SIGN8": "Analogique", "GND": "Masse"})
    assert any("U3.8 (SIGN8)" in n for n in res["notes"]), res["notes"]
    print("[PASS] test_antenne_porteuse_rails")


def test_nouvelles_regles():
    pad = lambda x, y, n: {"x": x, "y": y, "r": 0.3, "c": "Top", "n": n}
    # MOIGNON DE VIA : percé de Top à Bot, emprunté de Top à In3 -- In3 → Bot pend
    st = empilage_de(("Top", "signal"), ("L2", "plane", "GND"), ("In3", "signal"),
                     ("Bot", "signal"), di=0.8)
    clk = [droite("CLK", 10.0, x2=10.0), droite("CLK", 10.0, x1=10.0, x2=20.0, c="In3")]
    doc = {"format": "cao-analyse-carte-1", "unite_mm": 1, "stackup": st, "pistes": clk,
           "natures": {"CLK": "RF"}, "reglages": {"tr": {"RF": 3e-11}}}
    k = de(analyser_document(dict(doc, percages=[{"x": 10, "y": 10, "d": 0.3, "n": "CLK"}])),
           "moignon_via")
    assert k and "In3 → Bot" in k[0]["msg"] and "supposé traversant" in k[0]["msg"], k
    # percé seulement de Top à In3 (via borgne) : plus de moignon
    k = de(analyser_document(dict(doc, percages=[{"x": 10, "y": 10, "d": 0.3, "n": "CLK",
                                                  "de": "Top", "a": "In3"}])), "moignon_via")
    assert k == [], k
    # une broche traversante n'est pas un via de routage
    comp = [{"ref": "J1", "c": "Top", "broches": [{"x": 10, "y": 10, "n": "CLK", "pin": "1"}]}]
    k = de(analyser_document(dict(doc, composants=comp,
                                  percages=[{"x": 10, "y": 10, "d": 0.8, "n": "CLK"}])),
           "moignon_via")
    assert k == [], k

    # BRANCHE EN T : un tronc de 40 mm, une dérivation de 15 mm vers une charge
    t = [{"c": "Top", "n": "CLK", "w": 0.2, "p": [0, 0, 20, 0]},
         {"c": "Top", "n": "CLK", "w": 0.2, "p": [20, 0, 40, 0]},
         {"c": "Top", "n": "CLK", "w": 0.2, "p": [20, 0, 20, 15]}]
    pads = [pad(0, 0, "CLK"), pad(40, 0, "CLK"), pad(20, 15, "CLK")]
    k = de(analyser(pistes=t, pastilles=pads, natures={"CLK": "Rapide"}), "branche")
    assert k and k[0]["severite"] == "critique" and "15.0 mm" in k[0]["msg"], k
    assert abs(k[0]["x"] - 20) < 0.1 and abs(k[0]["y"]) < 0.1, k
    # le T posé AU MILIEU d'un segment (le tronc d'un seul tenant) est vu aussi
    t2 = [{"c": "Top", "n": "CLK", "w": 0.2, "p": [0, 0, 40, 0]},
          {"c": "Top", "n": "CLK", "w": 0.2, "p": [20, 0, 20, 15]}]
    assert de(analyser(pistes=t2, pastilles=pads, natures={"CLK": "Rapide"}), "branche")
    # une chaîne sans T : rien
    assert de(analyser(pistes=t[:2], pastilles=pads[:2], natures={"CLK": "Rapide"}),
              "branche") == []

    # QUARTZ : 30 mm de piste vers l'oscillateur, et une piste qui passe dessous
    y1 = {"ref": "Y1", "c": "Top", "val": "16MHz",
          "broches": [{"x": 0, "y": 0, "n": "XI", "pin": "1"},
                      {"x": 3, "y": 0, "n": "XO", "pin": "2"}]}
    q = [{"c": "Top", "n": "XI", "w": 0.2, "p": [0, 0, 0, 30]},
         {"c": "Top", "n": "XO", "w": 0.2, "p": [3, 0, 3, 4]},
         {"c": "Bot", "n": "DATA", "w": 0.2, "p": [1.5, -10, 1.5, 10]}]
    k = de(analyser(composants=[y1], pistes=q), "quartz")
    assert any(x["severite"] == "critique" and "30.0 mm" in x["msg"] for x in k), k
    assert any("DATA" in x["msg"] and "sous le quartz" in x["msg"] for x in k), k
    # un filtre SAW à 868 MHz n'est pas un quartz
    flt = dict(y1, ref="FLT1", val="868MHz")
    assert de(analyser(composants=[flt], pistes=q), "quartz") == []

    # ESD : J1 protégé sur D+ seulement (vigilance), J2 jamais protégé (info)
    gnd = {"GND": "Masse"}
    j1 = {"ref": "J1", "c": "Top", "broches": [{"x": 0, "y": 0, "n": "DP", "pin": "1"},
                                                {"x": 1, "y": 0, "n": "DN", "pin": "2"},
                                                {"x": 2, "y": 0, "n": "GND", "pin": "3"}]}
    u2 = {"ref": "U2", "c": "Top", "val": "USBLC6-2",
          "broches": [{"x": 3, "y": 0, "n": "DP", "pin": "1"},
                      {"x": 4, "y": 0, "n": "GND", "pin": "2"}]}
    j2 = {"ref": "J2", "c": "Top", "broches": [{"x": 50, "y": 0, "n": "SWD", "pin": "1"},
                                                {"x": 51, "y": 0, "n": "GND", "pin": "2"}]}
    k = {x["msg"].split(" :")[0]: x for x in de(analyser(composants=[j1, u2, j2], natures=gnd),
                                                  "esd")}
    assert k["J1"]["severite"] == "vigilance" and "DN" in k["J1"]["msg"], k
    assert "DP" not in k["J1"]["msg"].split("sur ")[1], k
    assert k["J2"]["severite"] == "info" and "interne" in k["J2"]["msg"], k

    # COURANT : un étranglement de 0,2 mm sur un rail tiré à 1 mm ; avec 2 A
    # annoncés, critique (la piste tient ~0,74 A à +10 °C)
    rail = [{"c": "Top", "n": "VCC", "w": 1.0, "p": [0, 0, 30, 0]},
            {"c": "Top", "n": "VCC", "w": 0.2, "p": [30, 0, 32, 0]}]
    nat = {"VCC": "Alimentation"}
    k = de(analyser(pistes=rail, natures=nat), "courant")
    assert k and "Étranglement" in k[0]["msg"] and k[0]["severite"] == "info", k
    k = de(analyser(pistes=rail, natures=nat, courants={"VCC": 2.0}), "courant")
    assert k and k[0]["severite"] == "critique" and "2.00 A" in k[0]["msg"], k
    ok = analyser(pistes=rail, natures=nat, courants={"VCC": 0.3, "AILLEURS": 1.0})
    assert de(ok, "courant") == [], de(ok, "courant")
    # le courant jugé se dit, même sans constat ; sans courant, rien de neuf
    assert ok["bilan"]["courant"] == {"rails": 1, "courants_donnes": 1}, ok["bilan"]
    assert analyser(pistes=rail, natures=nat)["bilan"]["courant"] == {"rails": 1}

    # CLÔTURE DE VIAS LE LONG DU BORD : des vias au centre seulement
    plans = [{"c": "L2", "n": "GND", "o": carre(0, 0, 50, 50)},
             {"c": "L3", "n": "GND", "o": carre(0, 0, 50, 50)}]
    centre = [{"x": x, "y": y, "d": 0.3, "n": "GND"} for x in range(15, 40, 5)
              for y in range(15, 40, 5)]
    base = dict(plans=plans, pistes=[droite("CLK", 25.0, x1=5.0, x2=45.0)],
                natures={"CLK": "Rapide", "GND": "Masse"}, percages=centre,
                contour={"o": carre(0, 0, 50, 50)})
    k = [x for x in de(analyser(**base), "bord") if "Clôture" in x["msg"]]
    assert k and k[0]["severite"] == "critique", de(analyser(**base), "bord")
    # une rangée tous les 2 mm le long du bord : plus rien à dire
    rangee = [{"x": v, "y": w, "d": 0.3, "n": "GND"} for v in range(1, 50, 2)
              for w in (1, 49)] + [{"x": w, "y": v, "d": 0.3, "n": "GND"}
                                   for v in range(1, 50, 2) for w in (1, 49)]
    k = [x for x in de(analyser(**dict(base, percages=centre + rangee)), "bord")
         if "Clôture" in x["msg"]]
    assert k == [], k
    print("[PASS] test_nouvelles_regles")


def test_cibles_par_classe_et_par_net():
    # Z₀ PAR CLASSE : la ligne Rapide de 0,1 mm condamnée face à 50 Ω ne
    # l'est plus face à sa propre impédance donnée en cible de sa classe ;
    # une classe Lent à qui l'on donne une cible devient tenue
    usb = dict(pistes=[droite("USB", 0.0, w=0.1)], natures={"USB": "Rapide"})
    k = de(analyser(**usb), "impedance")
    z = float(k[0]["msg"].split("Z₀ ")[1].split(" ")[0])
    assert 70 < z < 110, z
    assert de(analyser(reglages={"z0_classes": {"Rapide": z}}, **usb), "impedance") == []
    k = de(analyser(reglages={"z0_classes": {"Rapide": 2 * z}}, **usb), "impedance")
    assert k and "cible %.0f Ω" % (2 * z) in k[0]["msg"], k
    assert de(analyser(pistes=[droite("DATA", 0.0, w=0.1)]), "impedance") == []
    k = de(analyser(pistes=[droite("DATA", 0.0, w=0.1)], reglages={
        "z0_classes": {"Lent": 25.0}, "cadences": {"Lent": 1e8}}), "impedance")
    assert k and "cible 25 Ω" in k[0]["msg"], k
    # le via d'une classe à 75 Ω réfléchit moins que face à 50 Ω
    rf = dict(vias=[via(retour_hors_rayon_mm=5.0)], natures={"CLK": "RF"})
    g50 = max(f["valeur"] for f in de(analyser(**rf), "retour")[0]["frequences"])
    g75 = max(f["valeur"] for f in de(analyser(reglages={"z0_classes": {"RF": 75}},
                                               **rf), "retour")[0]["frequences"])
    assert g75 < g50, (g75, g50)
    # PORTEUSE PAR NET : une carte LoRa + NFC, deux nets RF. Le LoRa suit la
    # porteuse de la carte (868 MHz), le NFC la sienne (13,56 MHz)
    deux = dict(vias=[via(net="LORA", retour_hors_rayon_mm=5.0),
                      via(net="NFC", x=30.0, retour_hors_rayon_mm=5.0)],
                natures={"LORA": "RF", "NFC": "RF"})
    seule = {k["n"] for k in de(analyser(reglages={"porteuse_rf": 868e6}, **deux), "retour")}
    assert seule == {"LORA", "NFC"}, seule          # le NFC condamné à 868 MHz
    res = analyser(reglages={"porteuse_rf": 868e6, "porteuses": {"NFC": 13.56e6}}, **deux)
    par = {k["n"]: k for k in de(res, "retour")}
    assert list(par) == ["LORA"], par               # à 13,56 MHz, son via tient
    assert all(f["porteuse"] == 868e6 for f in par["LORA"]["frequences"]), par
    assert res["reglages"]["porteuses"] == {"NFC": 13.56e6}, res["reglages"]
    # une porteuse de net vaut aussi hors classe RF, devant le front de sa classe
    k = de(analyser(reglages={"porteuses": {"CLK": 2.4e9}}, vias=[via(retour_hors_rayon_mm=5.0)],
                    natures={"CLK": "Lent"}), "retour")
    assert k and all(f["porteuse"] == 2.4e9 for f in k[0]["frequences"]), k
    print("[PASS] test_cibles_par_classe_et_par_net")


if __name__ == "__main__":
    test_coudes()
    test_jonctions()
    test_perimetre()
    test_hors_45()
    test_arcs()
    test_unites()
    test_retour_meme_masse()
    test_retour_gnd_vers_alim()
    test_retour_cavite_modale()
    test_diaphonie()
    test_document_sans_empilage()
    test_empilage()
    test_impedance()
    test_fentes()
    test_coutures()
    test_decouplage()
    test_bord()
    test_paires()
    test_orphelins()
    test_antenne_porteuse_rails()
    test_nouvelles_regles()
    test_cibles_par_classe_et_par_net()
    print("\n TOUS LES TESTS DE ANALYSE_CARTE SONT VALIDÉS AVEC SUCCÈS.")
