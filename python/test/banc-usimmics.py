#!/usr/bin/python3
# -*- coding: utf-8 -*-
"""Banc de recoupement du crosstalk contre le calculateur de lignes de uSimmics.

    python python/test/banc-usimmics.py

A QUOI IL SERT. Valider le moteur de crosstalk (python/crosstalk.py, qui
s'appuie sur python/ligne_mom.py) contre un outil EXTERIEUR, avec trois
configurations qu'on rencontre sur une carte FR-4 :

  · CAS 1 -- agresseur + victime, AUCUN plan, ni dessous ni sur les cotes ;
  · CAS 2 -- agresseur + victime, plan de masse DESSOUS (microruban couple) ;
  · CAS 3 -- agresseur + victime, plan DESSOUS et masse SUR LES COTES
    (ligne coplanaire couplee avec plan dessous).

LE PARTAGE DU TRAVAIL. Le script imprime, pour chaque cas, les valeurs a
saisir dans le calculateur de uSimmics (Tools > Transmission Line
Calculator). On recopie les quatre resultats de uSimmics (Z_even, Z_odd,
eps_eff_even, eps_eff_odd) dans python/test/usimmics-releves.csv, et on
relance : le script calcule les memes grandeurs avec le moteur de l'outil et
imprime les ecarts.

CE QUI EST COMPARE. Les quatre grandeurs de uSimmics sont des grandeurs de
SECTION DROITE. On en tire [L] et [C], puis Kb (NEXT) et Kf (FEXT) avec la
fonction de l'outil (`crosstalk.coefficients_couple`). Seules les ENTREES
different : un ecart ne peut venir que du calcul de la section, pas de la
formule de Kb ou de Kf.

LE CAS 1 N'A PAS DE CHIFFRE, ET C'EST CE QU'ON VERIFIE. Sans aucun conducteur
de reference, il n'y a pas de ligne quasi-TEM a deux conducteurs « agresseur /
victime » : la tension de la victime n'est definie que par rapport a un
retour, et c'est ce retour qui fixe le couplage. uSimmics n'a pas de
structure pour ce cas ; l'outil doit REFUSER en le disant, jamais rendre un
couplage nul (un zero qu'on n'a pas mesure ressemble a un zero).
"""

import csv
import math
import os
import sys

import numpy as np

RACINE = os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(RACINE, "python"))

import crosstalk as ct                                            # noqa: E402
import ligne_mom as tl                                            # noqa: E402
import simulation_em as se                                        # noqa: E402

C0 = 299792458.0
RELEVES = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                       "usimmics-releves.csv")

# ==========================================================================
# La carte : FR-4 4 couches classique, 1,6 mm, cuivre 1 oz
# ==========================================================================
#
# Seule la premiere paire de couches compte ici : la piste est en Top, le plan
# en L2 (GND), sous un prepreg 7628 de 0,2 mm. W = 0,35 mm donne ~50 ohms.

ER = 4.3            # FR-4 vers 1 GHz (4,2 a 4,5 selon le fournisseur)
TAN_D = 0.02
H = 0.2             # mm, prepreg Top -> GND
T = 0.035           # mm, cuivre 1 oz
W = 0.35            # mm, largeur des deux pistes
G = 0.3             # mm, ecart piste -> masse coplanaire (cas 3)
ECARTS = (0.2, 0.35, 0.7, 1.05)     # mm, S = ~0,6 W, 1 W, 2 W, 3 W
LONGUEUR = 50.0     # mm de longement, pour les NEXT/FEXT indicatifs
T_MONTEE = 1e-9     # s, front de l'agresseur, pour les NEXT/FEXT indicatifs

# Un « masque » d'epsilon 1 : de l'air. Sans lui, une piste nue a la face
# recoit le vernis par defaut (25 um, er 3,8), que uSimmics ne modelise pas.
SANS_VERNIS = {"type": "dielectric", "name": "mask (air)",
               "thickness": 0.025, "epsilon_r": 1.0}

EMPILAGE_PLAN = [
    {"type": "copper", "name": "Top", "thickness": T, "role": "signal"},
    {"type": "dielectric", "name": "prepreg 7628", "thickness": H,
     "epsilon_r": ER, "tan_delta": TAN_D},
    {"type": "copper", "name": "GND", "thickness": T, "role": "plane",
     "net": "GND"},
    {"type": "dielectric", "name": "coeur", "thickness": 1.2,
     "epsilon_r": ER, "tan_delta": TAN_D},
    {"type": "copper", "name": "Bottom", "thickness": T, "role": "signal"},
]
# Le cas 1 : la meme carte en 2 couches, sans plan nulle part.
EMPILAGE_SANS_PLAN = [
    {"type": "copper", "name": "Top", "thickness": T, "role": "signal"},
    {"type": "dielectric", "name": "FR-4", "thickness": 1.6,
     "epsilon_r": ER, "tan_delta": TAN_D},
    {"type": "copper", "name": "Bottom", "thickness": T, "role": "signal"},
]

CAS = {
    "cas2": {"titre": "plan dessous, pas de masse sur les cotes",
             "usimmics": "Coupled Microstrip", "g": 0.0},
    "cas3": {"titre": "plan dessous ET masse sur les cotes",
             "usimmics": "Coupled Coplanar Waveguide with Backside", "g": G},
}


# ==========================================================================
# Le moteur de l'outil
# ==========================================================================

def section(empilage, s, g, vernis=False):
    """[C], [C0], [L] de la paire, par le meme chemin que crosstalk.py :
    section_de_couche (empilage -> geometrie), puis solve_multiline."""
    couches = list(empilage) if vernis else [SANS_VERNIS] + list(empilage)
    haut = 0 if vernis else 1
    geo, raison = se.section_de_couche(couches, haut, W, T, g, g)
    if geo is None:
        return None, raison
    geo = dict(geo)
    x = (W + s) / 2 * 1e-3
    geo["conducteurs"] = [{"w": W * 1e-3, "x": -x}, {"w": W * 1e-3, "x": x}]
    r = tl.solve_multiline(geo)
    return (np.array(r["c"]), np.array(r["c0"]), np.array(r["l"])), None


def grandeurs_outil(mats):
    c, c0, l = mats
    ze = math.sqrt((l[0, 0] + l[0, 1]) / (c[0, 0] + c[0, 1]))
    zo = math.sqrt((l[0, 0] - l[0, 1]) / (c[0, 0] - c[0, 1]))
    ee = (c[0, 0] + c[0, 1]) / (c0[0, 0] + c0[0, 1])
    eo = (c[0, 0] - c[0, 1]) / (c0[0, 0] - c0[0, 1])
    kb, kf = ct.coefficients_couple(c, l, 0, 1)
    return {"ze": ze, "zo": zo, "ee": ee, "eo": eo, "kb": kb, "kf": kf}


def grandeurs_usimmics(ze, zo, ee, eo):
    """Les quatre chiffres de uSimmics -> [L], [C] -> Kb, Kf, par la MEME
    fonction que l'outil."""
    ve, vo = C0 / math.sqrt(ee), C0 / math.sqrt(eo)
    le, lo = ze / ve, zo / vo
    ce, co = 1 / (ze * ve), 1 / (zo * vo)
    l_mat = np.array([[(le + lo) / 2, (le - lo) / 2],
                      [(le - lo) / 2, (le + lo) / 2]])
    # Maxwell : diagonale = (Ce+Co)/2, hors diagonale = -(Co-Ce)/2.
    c_mat = np.array([[(ce + co) / 2, -(co - ce) / 2],
                      [-(co - ce) / 2, (ce + co) / 2]])
    kb, kf = ct.coefficients_couple(c_mat, l_mat, 0, 1)
    return {"ze": ze, "zo": zo, "ee": ee, "eo": eo, "kb": kb, "kf": kf}


def bruit(gr):
    """NEXT et FEXT (fraction de l'amplitude) sur LONGUEUR, front T_MONTEE :
    NEXT = min(Kb, Kb.2Td/tr), FEXT = |Kf|.Td/tr -- les formules de l'outil."""
    td = LONGUEUR * 1e-3 * math.sqrt((gr["ee"] + gr["eo"]) / 2) / C0
    return (min(gr["kb"], gr["kb"] * 2 * td / T_MONTEE),
            abs(gr["kf"]) * td / T_MONTEE)


# ==========================================================================
# Les releves de uSimmics
# ==========================================================================

def lire_releves():
    rel = {}
    if not os.path.exists(RELEVES):
        return rel
    with open(RELEVES, newline="", encoding="utf-8") as f:
        for ligne in csv.DictReader(
                (l for l in f if not l.lstrip().startswith("#")),
                delimiter=";"):
            try:
                vals = [float(ligne[k].replace(",", "."))
                        for k in ("Z_even", "Z_odd", "eps_even", "eps_odd")]
            except (KeyError, ValueError, AttributeError):
                continue                    # ligne pas encore remplie
            rel[(ligne["cas"].strip(), round(float(
                ligne["S_mm"].replace(",", ".")), 3))] = vals
    return rel


# Tolerances : la precision annoncee des formules fermees de uSimmics
# (Kirschning-Jansen pour le microruban couple, transformation conforme pour
# la coplanaire), pas celle de l'outil.
TOL_Z = 0.03        # Ze, Zo
TOL_EPS = 0.03      # eps_eff
TOL_KB = 0.06       # Kb, relatif
TOL_KF = 0.005      # Kf, ABSOLU : c'est une difference de deux nombres voisins


def ecart(cle, ref, out):
    if cle == "kf":
        d = out - ref
        return "%+.4f" % d, abs(d) <= TOL_KF
    d = out / ref - 1
    tol = {"ze": TOL_Z, "zo": TOL_Z, "ee": TOL_EPS, "eo": TOL_EPS,
           "kb": TOL_KB}[cle]
    return "%+.2f %%" % (100 * d), abs(d) <= tol


# ==========================================================================

print("=" * 72)
print("  BANC DE RECOUPEMENT  --  moteur crosstalk  /  uSimmics")
print("=" * 72)
print("""
CARTE COMMUNE (FR-4, 4 couches, 1,6 mm)
  piste Top, largeur W = %.2f mm, cuivre T = %.0f um
  prepreg Top -> GND : H = %.2f mm, er = %.1f, tan d = %.2f
  pas de vernis (uSimmics ne le modelise pas)
  ecarts S testes : %s mm"""
      % (W, T * 1000, H, ER, TAN_D, ", ".join("%.2f" % s for s in ECARTS)))

print("""
REGLAGES COMMUNS DANS uSimmics (Transmission Line Calculator)
  Frequency  : 10 MHz   (l'outil est quasi statique : pas de dispersion)
  er = %.1f   tan d = %.2f   Resistivity = 1.72e-8   mu_r = 1
  Roughness = 0 um   T = %.0f um   H = %.2f mm
  W = %.2f mm   L = %.0f mm (sans effet sur Z et eps_eff)"""
      % (ER, TAN_D, T * 1000, H, W, LONGUEUR))

releves = lire_releves()
ok = ko = manquants = 0

# -- CAS 1 -----------------------------------------------------------------
print("\n" + "-" * 72)
print("CAS 1 -- aucun plan, ni dessous ni sur les cotes (carte 2 couches)")
print("-" * 72)
mats, raison = section(EMPILAGE_SANS_PLAN, ECARTS[0], 0.0, vernis=True)
if mats is None and raison:
    ok += 1
    print("  ok  l'outil REFUSE de calculer, et dit pourquoi :")
    print("      « %s »" % raison)
else:
    ko += 1
    print("  KO  l'outil a rendu une section sans plan de reference")
print("  uSimmics : pas de structure a saisir (pas de reference = pas de"
      " couplage defini).")

# -- CAS 2 et 3 ------------------------------------------------------------
for nom, cas in CAS.items():
    print("\n" + "-" * 72)
    print("%s -- %s" % (nom.upper().replace("CAS", "CAS "), cas["titre"]))
    print("  uSimmics : « %s »" % cas["usimmics"])
    if cas["g"]:
        print("             G = %.2f mm (piste -> masse laterale, des deux"
              " cotes)" % cas["g"])
    print("-" * 72)
    for s in ECARTS:
        mats, raison = section(EMPILAGE_PLAN, s, cas["g"])
        if mats is None:
            ko += 1
            print("  KO  S = %.2f mm : section non calculable (%s)"
                  % (s, raison))
            continue
        out = grandeurs_outil(mats)
        n_out, f_out = bruit(out)
        print("\n  S = %.2f mm" % s)
        print("    outil    : Ze %7.3f  Zo %7.3f  eps_e %6.4f  eps_o %6.4f"
              "  Kb %6.3f %%  Kf %+.4f"
              % (out["ze"], out["zo"], out["ee"], out["eo"],
                 100 * out["kb"], out["kf"]))
        print("               -> sur %.0f mm, front %.1f ns : NEXT %.2f %%,"
              " FEXT %.2f %%" % (LONGUEUR, T_MONTEE * 1e9, 100 * n_out,
                                 100 * f_out))
        mv, _ = section(EMPILAGE_PLAN, s, cas["g"], vernis=True)
        if mv is not None:
            v = grandeurs_outil(mv)
            print("               (avec vernis 25 um : Kb %.3f %%, Kf %+.4f"
                  " -- pour info)" % (100 * v["kb"], v["kf"]))
        rel = releves.get((nom, round(s, 3)))
        if rel is None:
            manquants += 1
            print("    uSimmics : -- a relever (usimmics-releves.csv) --")
            continue
        ref = grandeurs_usimmics(*rel)
        n_ref, f_ref = bruit(ref)
        print("    uSimmics : Ze %7.3f  Zo %7.3f  eps_e %6.4f  eps_o %6.4f"
              "  Kb %6.3f %%  Kf %+.4f"
              % (ref["ze"], ref["zo"], ref["ee"], ref["eo"],
                 100 * ref["kb"], ref["kf"]))
        print("               -> NEXT %.2f %%, FEXT %.2f %%"
              % (100 * n_ref, 100 * f_ref))
        morceaux, bon = [], True
        for cle in ("ze", "zo", "ee", "eo", "kb", "kf"):
            txt, b = ecart(cle, ref[cle], out[cle])
            morceaux.append("%s %s%s" % (cle, txt, "" if b else " (!)"))
            bon = bon and b
        print("    ecarts   : " + "  ".join(morceaux))
        if bon:
            ok += 1
            print("    ok")
        else:
            ko += 1
            print("    KO  hors tolerance")

print("\n" + "=" * 72)
print("  %d ok, %d KO, %d releve(s) uSimmics manquant(s)" % (ok, ko,
                                                           manquants))
print("  tolerances : Z %.0f %%, eps_eff %.0f %%, Kb %.0f %%, Kf +-%.3f"
      % (100 * TOL_Z, 100 * TOL_EPS, 100 * TOL_KB, TOL_KF))
print("=" * 72)
sys.exit(1 if ko else 0)
