#!/usr/bin/python3
# -*- coding: utf-8 -*-
"""Banc de comparaison du crosstalk : WEB_CAO, ANSYS SIwave, et la carte mesuree.

    python bancs-mesure/crosstalk/banc-crosstalk-mesure.py
    python bancs-mesure/crosstalk/banc-crosstalk-mesure.py --tr 2.5   # un front en ns

A QUOI IL SERT. La carte d'essai (generer-carte.js) porte cinq couples
agresseur / victime. Pour chacun, ce script :
  1. calcule ce que WEB_CAO predit -- par le MEME chemin que le bouton
     « Analyser la piste » de l'onglet Crosstalk : le document que la page
     envoie (docs-sim/casN.json, produit par exporter-docs-sim.js) passe dans
     python/crosstalk.py ;
  2. lit les releves (releves.csv) : la mesure a l'oscilloscope, et le
     « Crosstalk Scan » de SIwave ;
  3. imprime les trois cote a cote, au front REELLEMENT mesure sur la carte.

LE FRONT, C'EST LE POINT DELICAT. Les formules du niveau 2 supposent une
rampe lineaire de duree t_r (0 -> 100 %). Un oscilloscope rend un temps de
montee 10 -> 90 % ; pour une rampe lineaire, t_r = t_10-90 / 0,8. Un front
reel n'est pas une rampe : la prevision est donc rendue pour LES DEUX lectures,
et l'ecart entre elles est une incertitude, pas une erreur. Le NEXT sature
(longement > t_r / 2 de retard) n'en depend pas ; le FEXT lui est inversement
proportionnel.

CE QUE LES POURCENTAGES VEULENT DIRE. NEXT % = crete de la victime cote
source (J{n}2) / amplitude de l'agresseur mesuree sur sa charge (J{n}3).
FEXT % = crete de la victime cote charge (J{n}4) / la meme amplitude. Ce sont
les grandeurs que rend WEB_CAO, et celles qu'on lit dans SIwave en divisant
ses millivolts par l'amplitude de l'echelon saisi.
"""

import argparse
import csv
import json
import math
import os
import sys

ICI = os.path.dirname(os.path.abspath(__file__))
RACINE = os.path.dirname(os.path.dirname(ICI))
sys.path.insert(0, os.path.join(RACINE, "python"))

import crosstalk as ct                                            # noqa: E402

DOCS = os.path.join(ICI, "docs-sim")
RELEVES = os.path.join(ICI, "releves.csv")
CAS = {
    0: "plancher - pistes a 12 mm",
    1: "S = W (0,35 mm)",
    2: "S = 3W (1,05 mm)",
    3: "S = 3W + piste de garde cousue",
    4: "S = 3W + fente de 2 mm dans les plans",
}
FRONTS_NS = (0.5, 1.0, 2.5, 5.0, 10.0)
# La presélection geometrique de l'outil s'arrete a 3 x max(W, H) = 1,05 mm :
# le cas S = 3W tombe pile dessus et serait ecarte. Le banc veut un chiffre
# pour chaque cas, on ouvre donc la fenetre.
DISTANCE_MAX = 3.0


def prevoir(n, t_r):
    """NEXT, FEXT (fractions) et les avertissements de WEB_CAO, pour le cas n
    sous un front t_r (s). None si l'outil n'a pas de couple a chiffrer."""
    with open(os.path.join(DOCS, "cas%d.json" % n), encoding="utf-8") as f:
        doc = json.load(f)
    doc["reglages"] = dict(doc.get("reglages") or {})
    doc["reglages"]["t_r"] = t_r
    doc["reglages"]["distance_max"] = DISTANCE_MAX
    res = ct.analyser(doc)
    couples = [c for c in res.get("couples", [])
               if c.get("victime") == "XT%d_V" % n]
    notes = [a for a in res.get("avertissements", [])
             if "NON CALCUL" in a or "garde" in a]
    if not couples:
        return None, notes
    c = couples[0]
    return {"next": c["next"], "fext": c["fext"], "kb": c["kb"],
            "kf": c["kf"], "td_ps": c["td_ps"],
            "statut": c["statut"]}, notes


def lire_releves():
    """{(cas, source): [ligne, ...]} ; source = MESURE ou SIWAVE."""
    out = {}
    if not os.path.exists(RELEVES):
        return out
    with open(RELEVES, newline="", encoding="utf-8") as f:
        for ligne in csv.DictReader(
                (l for l in f if l.strip() and not l.lstrip().startswith("#")),
                delimiter=";"):
            try:
                n = int(ligne["cas"])
                tr = float(ligne["t_10_90_ns"].replace(",", ".")) * 1e-9
                v_ag = float(ligne["V_agresseur_mV"].replace(",", "."))
            except (KeyError, ValueError, AttributeError):
                continue
            def mv(k):
                s = (ligne.get(k) or "").strip().replace(",", ".")
                return float(s) if s else None
            out.setdefault((n, ligne["source"].strip().upper()), []).append({
                "tr": tr, "v_ag": v_ag,
                "next": mv("V_NEXT_mV"), "fext": mv("V_FEXT_mV"),
                "note": (ligne.get("note") or "").strip()})
    return out


def pc(x):
    return "   --  " if x is None else "%6.2f%%" % (100 * x)


def db(rapport):
    return "  --  " if not rapport or rapport <= 0 else "%+5.1f dB" % (
        20 * math.log10(rapport))


def tableau_previsions(fronts):
    print("\nPREVISIONS WEB_CAO (onglet Crosstalk, niveau 2, sans pertes)")
    print("  rampe lineaire de duree t_r ; NEXT / FEXT en % de l'agresseur\n")
    entete = "  cas  %-38s" % "configuration"
    for t in fronts:
        entete += " | t_r %4.1f ns   " % t
    print(entete)
    print("  " + "-" * (len(entete) - 2))
    for n, titre in CAS.items():
        ligne = "  %d    %-38s" % (n, titre)
        notes = []
        for t in fronts:
            p, nt = prevoir(n, t * 1e-9)
            notes = nt or notes
            if p is None:
                ligne += " |  pas de couple "
            else:
                ligne += " | %s %s" % (pc(p["next"]).strip().rjust(5),
                                       pc(p["fext"]).strip().rjust(6))
        print(ligne)
        for a in notes[:2]:
            print("         ! " + a[:150] + ("..." if len(a) > 150 else ""))
    print("\n  (chaque case : NEXT puis FEXT)")


def comparaison(releves):
    if not releves:
        print("\nAUCUN RELEVE dans releves.csv : remplissez-le apres la mesure"
              " et le Crosstalk Scan de SIwave, puis relancez.")
        return 0
    print("\nCOMPARAISON AUX RELEVES")
    print("  WEB_CAO est recalcule au front de CHAQUE releve, sous les deux"
          " lectures du front :\n  t_r = t_10-90 / 0,8 (rampe) et"
          " t_r = t_10-90 (borne haute du FEXT).")
    nb = 0
    for (n, source), lignes in sorted(releves.items()):
        for r in lignes:
            nb += 1
            p_rampe, _ = prevoir(n, r["tr"] / 0.8)
            p_brut, _ = prevoir(n, r["tr"])
            print("\n  cas %d (%s) -- %s, t_10-90 = %.2f ns, agresseur %.0f mV%s"
                  % (n, CAS.get(n, "?"), source, r["tr"] * 1e9, r["v_ag"],
                     (" -- " + r["note"]) if r["note"] else ""))
            for cle, nom in (("next", "NEXT"), ("fext", "FEXT")):
                v = r[cle]
                rel = v / r["v_ag"] if v is not None and r["v_ag"] else None
                if p_rampe is None:
                    print("    %s  releve %s   WEB_CAO : pas de couple chiffre"
                          % (nom, pc(rel)))
                    continue
                a, b = p_rampe[cle], p_brut[cle]
                lo, hi = min(a, b), max(a, b)
                if rel is None:
                    print("    %s  releve   --     WEB_CAO %s a %s"
                          % (nom, pc(lo), pc(hi)))
                    continue
                dans = lo * 0.8 <= rel <= hi * 1.25
                print("    %s  releve %s   WEB_CAO %s a %s   ecart %s  %s"
                      % (nom, pc(rel), pc(lo), pc(hi),
                         db(rel / ((lo + hi) / 2)),
                         "dans la fourchette (+-2 dB)" if dans else "HORS"))
    return nb


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--tr", type=float, action="append",
                    help="front(s) en ns pour le tableau des previsions")
    args = ap.parse_args()
    manquants = [n for n in CAS
                 if not os.path.exists(os.path.join(DOCS, "cas%d.json" % n))]
    if manquants:
        print("docs-sim/ incomplet (cas %s) : lancez exporter-docs-sim.js"
              % ", ".join(map(str, manquants)))
        return 2
    print("=" * 78)
    print("  BANC CROSSTALK  --  WEB_CAO / SIwave / mesure")
    print("=" * 78)
    tableau_previsions(tuple(args.tr) if args.tr else FRONTS_NS)
    comparaison(lire_releves())
    return 0


if __name__ == "__main__":
    sys.exit(main())
