#!/usr/bin/python3
# -*- coding: utf-8 -*-
# =============================================================================
# python/test/banc-dc.py
# Banc d'essai du solveur resistif DC.
#
#     python python/test/banc-dc.py
#
# POURQUOI CE BANC EXISTE. La premiere version de dc_solver.py rendait un
# potentiel identiquement NUL sur toute la carte, en silence : elle passait un
# argument retire de SciPy, rattrapait le TypeError, et remplacait le resultat
# par des zeros. Rien ne l'a vu, parce que rien ne mesurait. Zero volt de chute
# est le pire des faux resultats : il a l'air d'une bonne nouvelle.
#
# Ce que ce banc verifie est donc, d'abord, que le chiffre EST le bon -- contre
# rho*L/(W*t), qui se pose a la main -- et ensuite que les refus sont des
# refus : un probleme flottant doit lever, pas rendre zero.
# =============================================================================
import math
import os
import sys

RACINE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(RACINE, "python"))

from dc_solver import (ErreurDC, RESISTIVITE_CUIVRE,          # noqa: E402
                       resoudre_dc, resoudre_document, carte_chaleur, etat)

REUSSIS = []
ECHECS = []


def essai(titre, fonction):
    try:
        detail = fonction()
        REUSSIS.append(titre)
        print("  ok  %s" % titre)
        if detail:
            print("        (%s)" % detail)
    except AssertionError as exc:
        ECHECS.append(titre)
        print("  KO  %s -> %s" % (titre, exc))
    except Exception as exc:                              # noqa: BLE001
        ECHECS.append(titre)
        print("  KO  %s -> %s: %s" % (titre, type(exc).__name__, exc))


def rectangle(x0, y0, x1, y1, couche=0, net="VCC", epaisseur=35e-6):
    return {"vertices": [[x0, y0], [x1, y0], [x1, y1], [x0, y1]],
            "couche": couche, "net": net, "epaisseur": epaisseur}


def barreau(longueur, largeur, epaisseur, courant, pas, couche=0, net="VCC"):
    """Un barreau, courant injecte a un bout, reference a l'autre.

    LES DEUX BOUTS SONT PRIS SUR TOUTE LA LARGEUR ET SUR UNE SEULE COLONNE
    de carreaux -- d'ou la `boite` plutot qu'un rayon. Un disque assez large
    pour couvrir la largeur deborde aussi EN LONGUEUR : il court-circuite les
    premieres colonnes et raccourcit le barreau, ce qui se lit comme une
    resistance trop faible. Une pastille est un rectangle ; le solveur sait
    donc prendre un rectangle.
    """
    poly = [rectangle(0.0, 0.0, longueur, largeur, couche, net, epaisseur)]
    demi = pas / 2.0
    return resoudre_dc(
        poly,
        sources=[{"couche": couche, "net": net, "courant": courant,
                  "boite": [-demi, -demi, demi, largeur + demi]}],
        references=[{"couche": couche, "net": net, "tension": 0.0,
                     "boite": [longueur - 3 * demi, -demi,
                               longueur + demi, largeur + demi]}],
        pas=pas)


# =============================================================================
print("- banc d'essai : solveur resistif DC -\n")


# -----------------------------------------------------------------------------
# 1. LE CHIFFRE, contre la formule qu'on pose a la main
# -----------------------------------------------------------------------------
def cas_barreau():
    """Un barreau de cuivre : dV = I * rho * L / (W * t), et rien d'autre.

    C'est LA verification du banc. La trame carree rend exactement la
    resistance de couche -- la conductance d'une arete vaut sigma*t quel que
    soit le pas --, donc le seul ecart possible vient de la distance entre les
    CENTRES des colonnes d'extremite, pas de la longueur du polygone.
    """
    L, W, t, I = 20e-3, 2e-3, 35e-6, 1.0
    pas = 0.2e-3
    r = barreau(L, W, t, I, pas)
    obtenu = r["chute_par_net"]["VCC"]

    # La distance effective : du centre de la premiere colonne de noeuds au
    # centre de la derniere. Les noeuds sont poses tous les `pas` a partir de 0.
    n_colonnes = int(round(L / pas))          # x = 0 .. L-pas : le bord x = L
    longueur_effective = (n_colonnes - 1) * pas   # tombe hors du polygone
    largeur_effective = int(round(W / pas)) * pas
    attendu = I * RESISTIVITE_CUIVRE * longueur_effective / (largeur_effective * t)

    ecart = abs(obtenu - attendu) / attendu
    assert ecart < 0.02, ("%.6f V contre %.6f V attendus, soit %.2f %%"
                          % (obtenu, attendu, 100 * ecart))
    return ("%d noeuds, %.4f V contre %.4f V attendus, %.3f %%"
            % (r["n_noeuds"], obtenu, attendu, 100 * ecart))


def cas_convergence():
    """Raffiner la trame ne DEPLACE pas le resultat : il est deja juste.

    C'est la propriete qui distingue ce maillage d'une approximation : sur une
    trame carree, la conductance d'arete ne depend pas du pas. Trois pas dans
    un rapport de quatre doivent donner la meme chute a un pour cent pres, une
    fois ramenee a la meme longueur effective.
    """
    L, W, t, I = 10e-3, 1e-3, 35e-6, 1.0
    valeurs = []
    for pas in (0.2e-3, 0.1e-3, 0.05e-3):
        r = barreau(L, W, t, I, pas)
        n_colonnes = int(round(L / pas))
        longueur = (n_colonnes - 1) * pas
        largeur = int(round(W / pas)) * pas
        attendu = I * RESISTIVITE_CUIVRE * longueur / (largeur * t)
        valeurs.append((pas, r["chute_par_net"]["VCC"], attendu))
    for pas, obtenu, attendu in valeurs:
        ecart = abs(obtenu - attendu) / attendu
        assert ecart < 0.02, ("pas %.3f mm : %.2f %% d'ecart"
                              % (pas * 1e3, 100 * ecart))
    return " ; ".join("%.2f mm : %.4f V" % (p * 1e3, v)
                      for p, v, _ in valeurs)


def cas_deux_fois_plus_large():
    """Deux fois plus large, deux fois moins de chute. La loi d'Ohm, pas plus."""
    L, t, I, pas = 10e-3, 35e-6, 1.0, 0.1e-3
    etroit = barreau(L, 1e-3, t, I, pas)["chute_par_net"]["VCC"]
    large = barreau(L, 2e-3, t, I, pas)["chute_par_net"]["VCC"]
    rapport = etroit / large
    assert abs(rapport - 2.0) < 0.05, "rapport %.4f au lieu de 2" % rapport
    return "%.4f V contre %.4f V, rapport %.4f" % (etroit, large, rapport)


def cas_deux_fois_plus_epais():
    """Deux fois plus epais, deux fois moins de chute."""
    L, W, I, pas = 10e-3, 1e-3, 1.0, 0.1e-3
    mince = barreau(L, W, 35e-6, I, pas)["chute_par_net"]["VCC"]
    epais = barreau(L, W, 70e-6, I, pas)["chute_par_net"]["VCC"]
    rapport = mince / epais
    assert abs(rapport - 2.0) < 0.02, "rapport %.4f au lieu de 2" % rapport
    return "%.4f V contre %.4f V, rapport %.4f" % (mince, epais, rapport)


def cas_courant_proportionnel():
    """Un probleme LINEAIRE : doubler le courant double la chute, exactement."""
    L, W, t, pas = 10e-3, 1e-3, 35e-6, 0.1e-3
    un = barreau(L, W, t, 1.0, pas)["chute_par_net"]["VCC"]
    deux = barreau(L, W, t, 2.0, pas)["chute_par_net"]["VCC"]
    assert abs(deux - 2 * un) < 1e-9, "%.9f contre %.9f" % (deux, 2 * un)
    return "%.6f V et %.6f V" % (un, deux)


# -----------------------------------------------------------------------------
# 2. LA TOPOLOGIE : ce que le maillage surfacique voit et que le perimetre ne
#    voyait pas
# -----------------------------------------------------------------------------
def cas_chemin_parallele():
    """DEUX chemins de cuivre en parallele : la moitie de la resistance.

    C'est le cas que la version « reseau sur le perimetre » ne pouvait pas
    traiter : elle faisait le tour de chaque forme au lieu de la traverser, et
    deux formes accolees ne se voyaient pas.
    """
    L, W, t, I, pas = 10e-3, 1e-3, 35e-6, 1.0, 0.1e-3
    simple = barreau(L, W, t, I, pas)["chute_par_net"]["VCC"]

    # Deux barreaux accoles, donc un barreau de largeur double decrit en deux
    # polygones : le maillage doit les recoller.
    polys = [rectangle(0.0, 0.0, L, W, 0, "VCC", t),
             rectangle(0.0, W, L, 2 * W, 0, "VCC", t)]
    demi = pas / 2
    double = resoudre_dc(
        polys,
        sources=[{"couche": 0, "net": "VCC", "courant": I,
                  "boite": [-demi, -demi, demi, 2 * W + demi]}],
        references=[{"couche": 0, "net": "VCC", "tension": 0.0,
                     "boite": [L - 3 * demi, -demi, L + demi, 2 * W + demi]}],
        pas=pas)["chute_par_net"]["VCC"]
    rapport = simple / double
    assert abs(rapport - 2.0) < 0.06, "rapport %.4f au lieu de 2" % rapport
    return "%.4f V seul, %.4f V accoles, rapport %.4f" % (simple, double,
                                                          rapport)


def cas_nets_isoles():
    """Deux nets sur la meme couche NE CONDUISENT PAS l'un dans l'autre.

    Le lancer de rayon seul ne le saurait pas : deux polygones qui se touchent
    au carreau pres seraient recolles. C'est le net qui tranche.
    """
    t, I, pas = 35e-6, 1.0, 0.1e-3
    polys = [rectangle(0.0, 0.0, 10e-3, 1e-3, 0, "VCC", t),
             rectangle(0.0, 1e-3, 10e-3, 2e-3, 0, "GND", t)]
    demi = pas / 2
    r = resoudre_dc(
        polys,
        sources=[{"couche": 0, "net": "VCC", "courant": I,
                  "boite": [-demi, -demi, demi, 1e-3]}],
        references=[{"couche": 0, "net": "VCC", "tension": 0.0,
                     "boite": [10e-3 - demi, -demi, 10e-3, 1e-3]},
                    {"couche": 0, "net": "GND", "tension": 0.0,
                     "boite": [-demi, 1e-3, 10e-3, 2e-3]}],
        pas=pas)
    chute_gnd = r["chute_par_net"]["GND"]
    assert chute_gnd < 1e-12, "le net GND a bougé de %.3e V" % chute_gnd
    assert r["chute_par_net"]["VCC"] > 1e-4, "VCC ne chute pas"
    return ("VCC : %.4f V ; GND : %.3e V"
            % (r["chute_par_net"]["VCC"], chute_gnd))


def cas_via():
    """UN VIA EN SERIE ajoute sa resistance, et on la retrouve par difference.

    Deux barreaux sur deux couches, relies par un seul via : la chute totale
    doit valoir celle des deux barreaux plus R_via * I, a la resistance
    d'etalement pres.
    """
    L, W, t, I, pas = 5e-3, 1e-3, 35e-6, 1.0, 0.1e-3
    percage, placage, hauteur = 0.3e-3, 25e-6, 1.6e-3
    aire = math.pi * ((percage / 2 + placage) ** 2 - (percage / 2) ** 2)
    r_via = RESISTIVITE_CUIVRE * hauteur / aire

    polys = [rectangle(0.0, 0.0, L, W, 0, "VCC", t),
             rectangle(0.0, 0.0, L, W, 1, "VCC", t)]
    demi = pas / 2
    r = resoudre_dc(
        polys,
        sources=[{"couche": 0, "net": "VCC", "courant": I,
                  "boite": [-demi, -demi, demi, W + demi]}],
        references=[{"couche": 1, "net": "VCC", "tension": 0.0,
                     "boite": [-demi, -demi, demi, W + demi]}],
        vias=[{"x": L - pas, "y": W / 2, "couche_a": 0, "couche_b": 1,
               "net": "VCC", "percage": percage, "placage": placage,
               "hauteur": hauteur}],
        pas=pas)
    assert r["n_vias"] == 1, "le via n'a pas été relié"
    total = r["chute_par_net"]["VCC"]
    # Les deux barreaux, du point d'injection au via, puis du via au retour.
    deux_barreaux = 2 * I * RESISTIVITE_CUIVRE * (L - 1.5 * pas) / (W * t)
    part_via = total - deux_barreaux
    assert part_via > 0, "le via ne coûte rien : %.6f V" % part_via
    ecart = abs(part_via - r_via * I) / (r_via * I)
    assert ecart < 0.35, ("le via pèse %.4f mV pour %.4f mV attendus (%.1f %%)"
                          % (part_via * 1e3, r_via * I * 1e3, 100 * ecart))
    return ("total %.4f mV, dont %.4f mV pour le via (formule : %.4f mV)"
            % (total * 1e3, part_via * 1e3, r_via * I * 1e3))


def cas_sans_via_pas_de_chemin():
    """Sans via, les deux couches sont deux ilots : le solveur doit REFUSER.

    Un ilot flottant rend la sous-matrice singuliere. Ce qu'il ne faut pas,
    c'est laisser le gradient conjugue divaguer et rendre un chiffre.
    """
    L, W, t, pas = 5e-3, 1e-3, 35e-6, 0.1e-3
    polys = [rectangle(0.0, 0.0, L, W, 0, "VCC", t),
             rectangle(0.0, 0.0, L, W, 1, "VCC", t)]
    try:
        demi = pas / 2
        r = resoudre_dc(
            polys,
            sources=[{"couche": 0, "net": "VCC", "courant": 1.0,
                      "boite": [-demi, -demi, demi, W + demi]}],
            references=[{"couche": 1, "net": "VCC", "tension": 0.0,
                         "boite": [-demi, -demi, demi, W + demi]}],
            pas=pas)
    except ErreurDC as exc:
        return "refus : %s" % exc.message
    raise AssertionError(
        "aucun refus : chute rendue = %.6f V" % r["chute_par_net"]["VCC"])


# -----------------------------------------------------------------------------
# 3. LES REFUS -- c'est la moitie qui manquait
# -----------------------------------------------------------------------------
def cas_sans_reference():
    """PAS DE REFERENCE, PAS DE CHUTE : le probleme est flottant, on refuse.

    La 1.0.0 ancrait le noeud numero zero -- le premier de la liste, c'est-a-
    dire un coin de la boite englobante, sur n'importe quel net. La chute
    rendue etait alors mesuree depuis un point que personne n'avait choisi.
    """
    polys = [rectangle(0.0, 0.0, 10e-3, 1e-3)]
    try:
        resoudre_dc(polys,
                    sources=[{"x": 0.0, "y": 0.5e-3, "couche": 0,
                              "net": "VCC", "courant": 1.0}],
                    references=[], pas=0.2e-3)
    except ErreurDC as exc:
        assert exc.conseil, "le refus ne dit pas quoi faire"
        return exc.message
    raise AssertionError("aucun refus alors que le problème est flottant")


def cas_sans_cuivre():
    """Aucun polygone : un refus, pas une pile d'appels."""
    try:
        resoudre_dc([], references=[{"x": 0, "y": 0, "couche": 0}])
    except ErreurDC as exc:
        return exc.message
    raise AssertionError("aucun refus")


def cas_courant_nul():
    """Zero ampere donne zero volt -- et LE DIT, plutot que de le laisser lire
    comme un bon resultat."""
    r = barreau(10e-3, 1e-3, 35e-6, 0.0, 0.2e-3)
    assert r["chute_par_net"]["VCC"] < 1e-15
    assert any("Aucun courant" in a for a in r["avertissements"]), \
        "le silence n'est pas signalé : %r" % r["avertissements"]
    return r["avertissements"][0][:60] + "..."


def cas_trame_trop_grossiere():
    """Un pas plus grand que la forme : un refus qui dit de le diminuer."""
    polys = [rectangle(0.0, 0.0, 0.1e-3, 0.1e-3)]
    try:
        resoudre_dc(polys, references=[{"x": 0, "y": 0, "couche": 0}],
                    pas=10e-3)
    except ErreurDC as exc:
        return exc.message
    raise AssertionError("aucun refus")


# -----------------------------------------------------------------------------
# 4. LA CHAINE COMPLETE : le document en millimetres, et la carte
# -----------------------------------------------------------------------------
def cas_document():
    """Le document d'echange est en MILLIMETRES, et le resultat aussi.

    C'est le contrat de `resoudre_document`, et c'est la seule chose qui
    separe la page du solveur. Un facteur mille se voit ici ou nulle part.
    """
    doc = {
        "format": "cao-sim-dc-1",
        "polygones": [{"vertices": [[0, 0], [20, 0], [20, 2], [0, 2]],
                       "couche": 0, "net": "VCC", "epaisseur": 0.035}],
        "sources": [{"couche": 0, "net": "VCC", "courant": 1.0,
                     "boite": [-0.1, -0.1, 0.1, 2.1]}],
        "references": [{"couche": 0, "net": "VCC", "tension": 0.0,
                        "boite": [19.7, -0.1, 20.1, 2.1]}],
        "pas": 0.2,
    }
    r = resoudre_document(doc)
    # Le meme calcul, pose en metres a la main.
    attendu = barreau(20e-3, 2e-3, 35e-6, 1.0, 0.2e-3)["chute_par_net"]["VCC"]
    obtenu = r["chute_par_net"]["VCC"]
    assert abs(obtenu - attendu) / attendu < 0.02, \
        "%.6f V contre %.6f V" % (obtenu, attendu)
    assert abs(r["pas"] - 0.2) < 1e-9, "le pas rendu n'est pas en mm"
    xs = [nd[0] for nd in r["noeuds"]]
    assert max(xs) > 15.0, "les noeuds rendus ne sont pas en mm"
    return "%.4f V, %d noeuds, pas %.2f mm" % (obtenu, r["n_noeuds"], r["pas"])


def cas_carte():
    """La carte de chaleur est une grille finie, bornee par les potentiels."""
    r = barreau(10e-3, 1e-3, 35e-6, 1.0, 0.1e-3)
    c = carte_chaleur(r, resolution=40)
    assert len(c["x"]) == 40 and len(c["V"]) == 40
    plat = [v for ligne in c["V"] for v in ligne]
    assert all(v == v for v in plat), "des NaN dans la carte"
    vmin, vmax = min(plat), max(plat)
    assert vmin >= min(r["potentiel"]) - 1e-12
    assert vmax <= max(r["potentiel"]) + 1e-12
    return "40 x 40, de %.4f a %.4f V" % (vmin, vmax)


def cas_etat():
    """L'etat dit `dispo` vrai quand scipy est la, et le format qu'il attend."""
    e = etat()
    assert e["dispo"] is True, e
    assert e["format"] == "cao-sim-dc-1"
    return e["methode"]


# =============================================================================
print("Le chiffre, contre rho L / (W t)")
essai("un barreau de cuivre rend exactement sa resistance de couche",
      cas_barreau)
essai("raffiner la trame ne deplace pas le resultat", cas_convergence)
essai("deux fois plus large, deux fois moins de chute",
      cas_deux_fois_plus_large)
essai("deux fois plus epais, deux fois moins de chute",
      cas_deux_fois_plus_epais)
essai("doubler le courant double la chute, exactement",
      cas_courant_proportionnel)

print("\nLa topologie que le maillage surfacique voit")
essai("deux polygones accoles ne font qu'un seul conducteur",
      cas_chemin_parallele)
essai("deux nets sur la meme couche ne conduisent pas l'un dans l'autre",
      cas_nets_isoles)
essai("un via en serie coute sa resistance d'anneau", cas_via)
essai("sans via, deux couches sont deux ilots : le solveur refuse",
      cas_sans_via_pas_de_chemin)

print("\nLes refus, qui sont la moitie du travail")
essai("sans reference, le probleme est flottant et le solveur refuse",
      cas_sans_reference)
essai("sans cuivre, un refus et pas une pile d'appels", cas_sans_cuivre)
essai("zero ampere donne zero volt, et le dit", cas_courant_nul)
essai("une trame plus grossiere que la forme est refusee",
      cas_trame_trop_grossiere)

print("\nLa chaine complete")
essai("le document d'echange est en millimetres des deux cotes", cas_document)
essai("la carte de chaleur est finie et bornee", cas_carte)
essai("l'etat annonce ce que le solveur sait faire", cas_etat)


# =============================================================================
# LE CHEMIN VERTICAL : ce que chaque via porte
# -----------------------------------------------------------------------------
# Le panneau annonce, via par via, le courant et la chute. Ce sont des chiffres
# qu'on lit et sur lesquels on decide de doubler un via ou non -- ils doivent
# donc etre justes, et pas seulement plausibles. La verification ne demande
# aucune formule : quand DEUX plans ne sont relies que par UN via, la loi des
# noeuds impose que tout le courant le traverse. C'est un etalon exact.
# =============================================================================

def _deux_plans(vias, pas=0.25):
    """Deux plans superposes, relies par les `vias` donnes.

    Source a gauche sur la couche 0, reference a droite sur la couche 1 : le
    courant DOIT changer de couche pour aller de l'une a l'autre.
    """
    return {
        "format": "cao-sim-dc-1",
        "polygones": [
            {"vertices": [[0, 0], [20, 0], [20, 5], [0, 5]],
             "couche": 0, "net": "VDD", "epaisseur": 0.035},
            {"vertices": [[0, 0], [20, 0], [20, 5], [0, 5]],
             "couche": 1, "net": "VDD", "epaisseur": 0.035}],
        "vias": vias,
        "sources": [{"couche": 0, "net": "VDD", "courant": 1.5,
                     "boite": [0, 0, 0.5, 5]}],
        "references": [{"couche": 1, "net": "VDD", "tension": 0.0,
                        "boite": [19.5, 0, 20, 5]}],
        "pas": pas,
    }


VIA_TYPE = {"percage": 0.3, "placage": 0.025, "hauteur": 1.6, "net": "VDD"}


def cas_via_unique_porte_tout():
    """UN seul via entre deux plans : il porte 1,5 A, ni plus ni moins.

    C'est la loi des noeuds, pas une approximation : il n'existe aucun autre
    chemin d'une couche a l'autre. Si le chiffre du panneau s'ecarte de la, il
    est faux, et aucune finesse de trame n'y changera rien.
    """
    v = dict(VIA_TYPE, x=10, y=2.5, couche_a=0, couche_b=1, repere="V1")
    r = resoudre_document(_deux_plans([v]))
    assert r["n_vias"] == 1, r["n_vias"]
    d = r["vias"][0]
    assert d["relie"] is True, d
    assert abs(abs(d["courant"]) - 1.5) < 1e-9, (
        "le via porte %.6f A au lieu de 1,5" % d["courant"])
    aire = math.pi * ((0.15e-3 + 25e-6) ** 2 - (0.15e-3) ** 2)
    attendu = RESISTIVITE_CUIVRE * 1.6e-3 / aire
    assert abs(d["resistance"] - attendu) < 1e-9, (d["resistance"], attendu)
    # chute = I R et puissance = R I^2 : les trois chiffres doivent se recouper
    assert abs(d["chute"] - abs(d["courant"]) * d["resistance"]) < 1e-12
    assert abs(d["puissance"] - d["resistance"] * d["courant"] ** 2) < 1e-12
    return ("1 via : %.4f A, R = %.4f mohm, chute = %.4f mV"
            % (d["courant"], d["resistance"] * 1e3, d["chute"] * 1e3))


def cas_les_vias_se_partagent_le_courant():
    """Quatre vias cote a cote : la somme fait le courant, et chacun en prend
    moins qu'un via seul. C'est le seul chiffre qui justifie d'en doubler un."""
    vias = [dict(VIA_TYPE, x=10, y=1.0 + k, couche_a=0, couche_b=1,
                 repere="V%d" % (k + 1)) for k in range(4)]
    r = resoudre_document(_deux_plans(vias))
    assert r["n_vias"] == 4, r["n_vias"]
    total = sum(d["courant"] for d in r["vias"])
    assert abs(abs(total) - 1.5) < 1e-9, "la somme fait %.6f A" % total
    for d in r["vias"]:
        assert abs(d["courant"]) < 1.5, d["courant"]
    seul = resoudre_document(_deux_plans(
        [dict(VIA_TYPE, x=10, y=2.5, couche_a=0, couche_b=1)]))
    assert (max(abs(d["chute"]) for d in r["vias"])
            < seul["vias"][0]["chute"]), (
        "quatre vias ne chutent pas moins qu'un seul")
    return ("4 vias : somme %.4f A, le plus charge %.4f A contre %.4f A seul"
            % (total, max(abs(d["courant"]) for d in r["vias"]),
               seul["vias"][0]["courant"]))


def cas_un_via_dans_le_vide_est_dit():
    """Un via pose la ou son net n'a pas de cuivre ne peut pas etre monte.

    Le taire serait rendre le resultat d'une carte OU CE VIA N'EXISTE PAS,
    sans le dire. On verifie donc qu'il ressort marque, avec son motif, et que
    le calcul le signale.
    """
    bon = dict(VIA_TYPE, x=10, y=2.5, couche_a=0, couche_b=1, repere="V1")
    perdu = dict(VIA_TYPE, x=80, y=80, couche_a=0, couche_b=1, repere="V2")
    r = resoudre_document(_deux_plans([bon, perdu]))
    assert r["n_vias"] == 1, r["n_vias"]
    absents = [d for d in r["vias"] if not d["relie"]]
    assert len(absents) == 1, r["vias"]
    assert absents[0]["repere"] == "V2", absents[0]
    assert absents[0].get("motif"), "un via ecarte sans motif"
    assert any("vertical" in a for a in r["avertissements"]), r["avertissements"]
    return absents[0]["motif"]


def cas_le_via_garde_son_net():
    """Le net du via traverse le document.

    Il ne sert pas qu'a l'affichage : le maillage ne raccorde le via qu'au
    cuivre de SON net. Perdu en chemin, le via s'accrochait au premier carreau
    venu -- celui d'un autre net compris.
    """
    v = dict(VIA_TYPE, x=10, y=2.5, couche_a=0, couche_b=1, repere="V1")
    r = resoudre_document(_deux_plans([v]))
    assert r["vias"][0]["net"] == "VDD", r["vias"][0]
    etranger = dict(VIA_TYPE, x=10, y=2.5, couche_a=0, couche_b=1,
                    net="AUTRE", repere="VX")
    try:
        r2 = resoudre_document(_deux_plans([etranger]))
    except ErreurDC:
        return "un via d'un autre net ne raccorde rien : le calcul refuse"
    assert r2["n_vias"] == 0, (
        "un via du net AUTRE a quand meme raccorde le cuivre VDD")
    return "un via du net AUTRE ne raccorde pas le cuivre VDD"


def cas_une_decoupe_retire_du_cuivre():
    """Une decoupe evide le plan, et la chute MONTE.

    Un plan evide qu'on calculerait plein rendrait une chute trop faible : une
    erreur du cote qui rassure, la pire. On verifie le SENS, et qu'une decoupe
    posee AVANT le plan dans la liste l'evide quand meme.
    """
    base = {
        "format": "cao-sim-dc-1",
        "polygones": [{"vertices": [[0, 0], [40, 0], [40, 10], [0, 10]],
                       "couche": 0, "net": "VDD", "epaisseur": 0.035}],
        "sources": [{"couche": 0, "net": "VDD", "courant": 2.0,
                     "boite": [39.5, 0, 40, 10]}],
        "references": [{"couche": 0, "net": "VDD", "tension": 0.0,
                        "boite": [0, 0, 0.5, 10]}],
        "pas": 0.25,
    }
    plein = resoudre_document(base)["chute_par_net"]["VDD"]
    trou = {"vertices": [[18, 2], [22, 2], [22, 8], [18, 8]],
            "couche": 0, "net": "VDD", "epaisseur": 0.035, "trou": True}
    evide = dict(base, polygones=[trou] + base["polygones"])
    apres = resoudre_document(evide)["chute_par_net"]["VDD"]
    assert apres > plein, ("evider n'a pas fait monter la chute : %.6f contre"
                           " %.6f" % (apres, plein))
    return ("plein %.4f mV, evide %.4f mV (+%.1f %%)"
            % (plein * 1e3, apres * 1e3, 100 * (apres - plein) / plein))


print("\nLe chemin vertical, via par via")
essai("un via unique entre deux plans porte tout le courant",
      cas_via_unique_porte_tout)
essai("quatre vias se partagent le courant, et chacun chute moins",
      cas_les_vias_se_partagent_le_courant)
essai("un via qui ne trouve pas son cuivre est dit, pas oublie",
      cas_un_via_dans_le_vide_est_dit)
essai("le net du via traverse le document", cas_le_via_garde_son_net)
essai("une decoupe retire du cuivre, quel que soit son rang",
      cas_une_decoupe_retire_du_cuivre)


# =============================================================================
# PLUSIEURS INJECTIONS SUR LE MEME NET
# -----------------------------------------------------------------------------
# Un net d'alimentation nourrit plusieurs composants, et la chute que chacun
# voit depend de ce que TIRENT LES AUTRES. Ce n'est pas une commodite : c'est
# la raison d'etre du calcul. Un barreau a une dimension le rend exactement
# calculable a la main, ce qui en fait un etalon et pas une non-regression.
# =============================================================================

def _barreau(sources, references, L=40.0, W=10.0, ep=0.035, pas=0.25):
    return {
        "format": "cao-sim-dc-1",
        "polygones": [{"vertices": [[0, 0], [L, 0], [L, W], [0, W]],
                       "couche": 0, "net": "VDD", "epaisseur": ep}],
        "sources": sources,
        "references": references,
        "pas": pas,
    }


def _bande(x, demi=0.25, W=10.0):
    """Une borne sur TOUTE la largeur : le probleme reste a une dimension, et
    aucune resistance d'etranglement ne vient brouiller l'etalon."""
    return [x - demi, 0.0, x + demi, W]


def cas_deux_sources_se_superposent():
    """Deux consommateurs sur le meme rail, et le calcul exact.

    Reference a gauche (x = 0), une source en x1 qui tire I1, une autre en x2
    qui tire I2, avec x1 < x2. Tout le courant passe par le troncon [0, x1],
    puis seul I2 continue jusqu'a x2 :

        V(x1) = r (I1 + I2) x1
        V(x2) = V(x1) + r I2 (x2 - x1)          avec r = rho / (W t)

    C'est de l'arithmetique, pas un modele -- et c'est precisement ce qu'un
    calcul par source SEPARE ne saurait pas rendre.
    """
    W, ep = 10e-3, 35e-6
    r = RESISTIVITE_CUIVRE / (W * ep)          # ohms par metre de barreau
    i1, i2 = 1.0, 0.6
    x1, x2 = 15.0, 35.0
    doc = _barreau(
        [{"couche": 0, "net": "VDD", "courant": i1, "boite": _bande(x1)},
         {"couche": 0, "net": "VDD", "courant": i2, "boite": _bande(x2)}],
        [{"couche": 0, "net": "VDD", "tension": 0.0, "boite": _bande(0.25)}])
    res = resoudre_document(doc)
    v = res["potentiel"]
    noeuds = res["noeuds"]

    def au(x):
        proches = [v[k] for k, n in enumerate(noeuds)
                   if abs(n[0] - x) <= 0.13]
        assert proches, "aucun noeud vers x = %.2f" % x
        return sum(proches) / len(proches)

    # L'ETALON EXACT : l'ECART entre les deux sources. La reference occupe une
    # bande de 0,5 mm, et l'endroit ou se trouve son bord EFFECTIF est connu a
    # un quart de millimetre pres -- soit pres de deux pour cent sur les 15 mm
    # qui la separent de la premiere source. Cette ambiguite disparait dans la
    # DIFFERENCE : entre x1 et x2, seul I2 circule, et la longueur est connue
    # exactement. C'est donc la que se joue la verification, au dixieme de
    # pour cent.
    ecart = r * i2 * (x2 - x1) * 1e-3
    mesure = au(x2) - au(x1)
    e = 100 * (mesure - ecart) / ecart
    assert abs(e) < 0.6, ("entre les deux sources : %.6f V contre %.6f"
                          " (%.3f %%)" % (mesure, ecart, e))
    # Et l'absolu, a la tolerance que le bord de la borne impose.
    attendu1 = r * (i1 + i2) * (x1 - 0.25) * 1e-3
    e1 = 100 * (au(x1) - attendu1) / attendu1
    assert abs(e1) < 3.0, "en x1 : %.4f V contre %.4f (%.2f %%)" % (
        au(x1), attendu1, e1)
    assert abs(res["courant_par_net"]["VDD"] - (i1 + i2)) < 1e-9
    return ("ecart entre sources %.4f mV contre %.4f attendu (%.3f %%)"
            % (mesure * 1e3, ecart * 1e3, e))


def cas_une_source_de_plus_fait_monter_la_chute():
    """Ajouter un consommateur en amont fait monter ce que voit celui d'aval.

    C'est LE resultat que deux calculs separes rendraient faux, chacun ignorant
    le courant de l'autre.
    """
    seule = resoudre_document(_barreau(
        [{"couche": 0, "net": "VDD", "courant": 0.6, "boite": _bande(35.0)}],
        [{"couche": 0, "net": "VDD", "tension": 0.0, "boite": _bande(0.25)}]))
    deux = resoudre_document(_barreau(
        [{"couche": 0, "net": "VDD", "courant": 1.0, "boite": _bande(15.0)},
         {"couche": 0, "net": "VDD", "courant": 0.6, "boite": _bande(35.0)}],
        [{"couche": 0, "net": "VDD", "tension": 0.0, "boite": _bande(0.25)}]))
    a = seule["chute_par_net"]["VDD"]
    b = deux["chute_par_net"]["VDD"]
    assert b > a * 1.5, ("le voisin ne pese pas : %.4f mV contre %.4f"
                         % (b * 1e3, a * 1e3))
    return "seule %.3f mV, avec un voisin en amont %.3f mV" % (a * 1e3, b * 1e3)


def cas_deux_references_se_partagent_le_retour():
    """Deux references encadrant la source se partagent le courant, et la chute
    tombe : c'est ce qu'on gagne a doubler une arrivee d'alimentation."""
    une = resoudre_document(_barreau(
        [{"couche": 0, "net": "VDD", "courant": 2.0, "boite": _bande(20.0)}],
        [{"couche": 0, "net": "VDD", "tension": 0.0, "boite": _bande(0.25)}]))
    deux = resoudre_document(_barreau(
        [{"couche": 0, "net": "VDD", "courant": 2.0, "boite": _bande(20.0)}],
        [{"couche": 0, "net": "VDD", "tension": 0.0, "boite": _bande(0.25)},
         {"couche": 0, "net": "VDD", "tension": 0.0, "boite": _bande(39.75)}]))
    a = une["chute_par_net"]["VDD"]
    b = deux["chute_par_net"]["VDD"]
    assert b < a * 0.75, ("doubler l'arrivee n'a rien change : %.4f contre"
                          " %.4f mV" % (b * 1e3, a * 1e3))
    return "une arrivee %.3f mV, deux arrivees %.3f mV" % (a * 1e3, b * 1e3)


def cas_les_references_ne_sont_pas_toutes_a_la_meme_tension():
    """Deux references a des tensions differentes : le cuivre entre elles porte
    un courant, meme sans source. C'est un cas limite, et il doit tenir."""
    res = resoudre_document(_barreau(
        [],
        [{"couche": 0, "net": "VDD", "tension": 0.0, "boite": _bande(0.25)},
         {"couche": 0, "net": "VDD", "tension": 0.1, "boite": _bande(39.75)}]))
    ch = res["chute_par_net"]["VDD"]
    assert abs(ch - 0.1) < 1e-3, "l'ecart des deux references vaut %.6f V" % ch
    return "0,1 V impose d'un bout a l'autre, retrouve a %.6f V" % ch


print("\nPlusieurs injections sur le meme net")
essai("deux sources se superposent, et le calcul est exact",
      cas_deux_sources_se_superposent)
essai("un consommateur de plus en amont fait monter la chute d'aval",
      cas_une_source_de_plus_fait_monter_la_chute)
essai("deux references se partagent le retour, et la chute tombe",
      cas_deux_references_se_partagent_le_retour)
essai("deux references a des tensions differentes tiennent",
      cas_les_references_ne_sont_pas_toutes_a_la_meme_tension)


# =============================================================================
# LA DENSITE DE COURANT, ET CE QU'ELLE ECHAUFFE
# -----------------------------------------------------------------------------
# LA CHUTE NE DIT PAS TOUT : une piste peut tenir sa chute et fondre quand meme,
# parce que c'est la SECTION qui chauffe et non la longueur. Ces deux grandeurs
# se posent a la main sur un barreau -- J = I/(W t) et la charte IPC-2221 --,
# donc ce sont des ETALONS et pas des non-regressions.
# =============================================================================

def _piste(L=40.0, W=2.0, ep=0.035, courant=3.0, externe=True, pas=0.1,
           retrecissement=None):
    """Une piste droite, alimentee d'un bout et tenue de l'autre, sur toute sa
    largeur : le probleme reste a une dimension."""
    polys = [{"vertices": [[0, 0], [L, 0], [L, W], [0, W]],
              "couche": 0, "net": "VDD", "epaisseur": ep}]
    if retrecissement:
        x0, x1, w2 = retrecissement
        # On EVIDE les deux bords entre x0 et x1 pour ne laisser que w2.
        marge = (W - w2) / 2.0
        polys.append({"vertices": [[x0, 0], [x1, 0], [x1, marge], [x0, marge]],
                      "couche": 0, "net": "VDD", "epaisseur": ep, "trou": True})
        polys.append({"vertices": [[x0, W - marge], [x1, W - marge],
                                   [x1, W], [x0, W]],
                      "couche": 0, "net": "VDD", "epaisseur": ep, "trou": True})
    return {
        "format": "cao-sim-dc-1",
        "polygones": polys,
        "sources": [{"couche": 0, "net": "VDD", "courant": courant,
                     "boite": [L - 0.25, 0, L, W]}],
        "references": [{"couche": 0, "net": "VDD", "tension": 0.0,
                        "boite": [0, 0, 0.25, W]}],
        "couches_externes": [0] if externe else [],
        "pas": pas,
    }


def cas_densite_est_le_calcul_a_la_main():
    """J = I / (W t), et rien d'autre, sur un barreau.

    C'est de l'arithmetique : trois amperes dans deux millimetres de 35 um font
    42,857 A/mm2. Le solveur doit y tomber, sinon la carte de chaleur ment.
    """
    r = resoudre_document(_piste())
    p = r["pire_par_net"]["VDD"]
    attendu = 3.0 / (2.0 * 0.035)
    e = 100 * (p["densite"] - attendu) / attendu
    assert abs(e) < 0.5, ("%.4f A/mm2 contre %.4f attendu (%.2f %%)"
                          % (p["densite"], attendu, e))
    # Et la LARGEUR LOCALE doit etre celle de la piste, mesuree sur la trame.
    assert abs(p["largeur"] - 2.0) < 0.15, "largeur vue : %.3f mm" % p["largeur"]
    return ("%.4f A/mm2 contre %.4f a la main (%.3f %%), largeur %.2f mm"
            % (p["densite"], attendu, e, p["largeur"]))


def cas_un_retrecissement_concentre_le_courant():
    """Deux fois plus etroit, deux fois plus dense.

    C'EST LE DEFAUT QUE LA CHUTE NE MONTRE PAS. Un col de deux millimetres ne
    pese presque rien sur la tension -- et il double la densite, donc il
    chauffe. Aucun controle geometrique ne le voit : la piste y respecte sa
    largeur minimale.
    """
    large = resoudre_document(_piste())
    etroit = resoudre_document(_piste(retrecissement=(19.0, 21.0, 1.0)))
    a = large["pire_par_net"]["VDD"]["densite"]
    b = etroit["pire_par_net"]["VDD"]["densite"]
    assert b > a * 1.7, "le col ne concentre rien : %.2f contre %.2f" % (b, a)
    # La borne HAUTE est large, et pour une raison : au coin rentrant la
    # densite est SINGULIERE, et le pic depend donc de la trame. C'est le cas
    # suivant qui s'en occupe.
    assert b < a * 4.0, "le col concentre trop : %.2f contre %.2f" % (b, a)
    # LA TEMPERATURE, elle, doit tripler : la section est deux fois moindre, et
    # IPC-2221 va en A^0,725 sous une racine 0,44 -- soit 2^(0,725/0,44) = 3,1.
    ta = large["pire_par_net"]["VDD"]["echauffement"]
    tb = etroit["pire_par_net"]["VDD"]["echauffement"]
    attendu = 2.0 ** (0.725 / 0.44)
    assert abs(tb / ta - attendu) / attendu < 0.02, (
        "la temperature fait x%.3f au lieu de x%.3f" % (tb / ta, attendu))
    # La chute, elle, bouge a peine : c'est tout le propos.
    ca = large["chute_par_net"]["VDD"]
    cb = etroit["chute_par_net"]["VDD"]
    assert cb < ca * 1.35, ("la chute suffirait a le voir : %.4f contre %.4f mV"
                            % (cb * 1e3, ca * 1e3))
    return ("densite x%.2f, temperature x%.2f (%.1f -> %.1f K), chute x%.2f"
            " seulement" % (b / a, tb / ta, ta, tb, cb / ca))


def cas_echauffement_est_la_charte_ipc2221():
    """dT = (I / (k A^0,725))^(1/0,44), releve sur la charte.

    On la repose ici a la main, avec les memes constantes, pour verifier que
    c'est bien CELLE-LA qui est appliquee -- et pas une formule voisine.
    """
    r = resoudre_document(_piste())
    p = r["pire_par_net"]["VDD"]
    section_mils2 = (2.0 * 0.035) / (0.0254 ** 2)
    attendu = (3.0 / (0.048 * section_mils2 ** 0.725)) ** (1.0 / 0.44)
    e = 100 * (p["echauffement"] - attendu) / attendu
    assert abs(e) < 2.0, ("%.3f K contre %.3f attendu (%.2f %%)"
                          % (p["echauffement"], attendu, e))
    return "%.2f K contre %.2f a la main (%.2f %%)" % (
        p["echauffement"], attendu, e)


def cas_une_couche_interne_chauffe_plus():
    """IPC-2221 donne 0,024 a une couche interne contre 0,048 a l'exterieure.

    Le coefficient est au DENOMINATEUR : plus il est petit, plus la temperature
    monte. Une interne doit donc ressortir plus chaude, et dans le rapport que
    la charte impose -- 2^(1/0,44), soit environ 4,9.
    """
    ext = resoudre_document(_piste(externe=True))["pire_par_net"]["VDD"]
    intr = resoudre_document(_piste(externe=False))["pire_par_net"]["VDD"]
    rapport = intr["echauffement"] / ext["echauffement"]
    attendu = 2.0 ** (1.0 / 0.44)
    assert abs(rapport - attendu) / attendu < 0.02, (
        "rapport %.3f au lieu de %.3f" % (rapport, attendu))
    return ("interne %.2f K contre exterieure %.2f K, soit x%.2f"
            % (intr["echauffement"], ext["echauffement"], rapport))


def cas_un_plan_large_ne_chauffe_pas():
    """Le meme courant dans un plan de vingt millimetres : la densite s'effondre
    et la temperature avec. Un chiffre qui ne ferait pas cette difference ne
    servirait a rien."""
    etroite = resoudre_document(_piste(W=1.0))["pire_par_net"]["VDD"]
    plan = resoudre_document(_piste(W=20.0, pas=0.25))["pire_par_net"]["VDD"]
    assert plan["densite"] < etroite["densite"] / 10, (
        "%.2f contre %.2f A/mm2" % (plan["densite"], etroite["densite"]))
    assert plan["echauffement"] < 1.0, (
        "un plan de 20 mm monte de %.2f K" % plan["echauffement"])
    return ("piste 1 mm : %.1f A/mm2 et %.1f K ; plan 20 mm : %.2f A/mm2 et"
            " %.2f K" % (etroite["densite"], etroite["echauffement"],
                         plan["densite"], plan["echauffement"]))


def cas_le_pire_point_est_localise():
    """Le pire point porte SES COORDONNEES. Un maximum sans son adresse oblige
    a le chercher dans dix mille nombres, ce qui n'est pas une lecture."""
    r = resoudre_document(_piste(retrecissement=(19.0, 21.0, 1.0)))
    p = r["pire_par_net"]["VDD"]
    x, y, c = p["densite_en"]
    assert 18.0 <= x <= 22.0, "le pire point est en x = %.2f, hors du col" % x
    assert c == 0, "couche %s" % c
    assert len(r["densite"]) == len(r["noeuds"]), "un tableau par noeud"
    assert len(r["echauffement"]) == len(r["noeuds"]), "un tableau par noeud"
    return "pire densite en x = %.2f mm, dans le col" % x


def cas_le_modele_thermique_se_nomme():
    """CE CHIFFRE N'EST PAS UNE SIMULATION THERMIQUE, et le resultat doit le
    dire lui-meme : IPC-2221 est une charte relevee sur un conducteur ISOLE, et
    IPC-2152 lui a succede. Un utilisateur qui lit « 40 K » sans savoir d'ou ca
    vient ne peut pas juger si le chiffre le concerne."""
    r = resoudre_document(_piste())
    m = r.get("modele_thermique") or ""
    assert "IPC-2221" in m, "le modele ne se nomme pas : %r" % m
    assert "IPC-2152" in m, "le successeur n'est pas signale : %r" % m
    return m[:64] + "..."




def cas_le_pic_de_densite_ne_converge_pas_et_c_est_normal():
    """UN COIN RENTRANT REND LA DENSITE SINGULIERE, et il faut le savoir.

    Le pic croit sans borne quand on raffine la trame : ce n'est pas un defaut
    du solveur, c'est la solution exacte du probleme -- le champ diverge a
    l'angle vif. Sur une vraie carte le coin est arrondi par la gravure, et le
    pic est fini ; sur le modele il ne l'est pas.

    CE QUE CE CAS FIXE, DONC : le pic ponctuel dit OU regarder, jamais COMBIEN.
    Il est bon pour la carte de chaleur et mauvais comme chiffre. Si un jour il
    se met a converger, c'est que quelqu'un a lisse quelque chose, et il faudra
    savoir quoi.
    """
    pics = []
    for pas in (0.2, 0.1, 0.05):
        r = resoudre_document(_piste(retrecissement=(19.0, 21.0, 1.0), pas=pas))
        pics.append(r["pire_par_net"]["VDD"]["densite"])
    assert pics[1] > pics[0] * 1.05 and pics[2] > pics[1] * 1.05, (
        "le pic ne croit plus au raffinement : %s -- le coin a ete lisse"
        % [round(x, 1) for x in pics])
    return "pic : %s A/mm2 aux pas 0,2 / 0,1 / 0,05" % (
        " -> ".join("%.1f" % x for x in pics))


def cas_l_echauffement_lui_NE_BOUGE_PAS():
    """L'ECHAUFFEMENT, LUI, DOIT ETRE UN CHIFFRE. C'est celui qu'on lit et sur
    lequel on decide d'elargir une piste : il ne peut pas dependre d'un reglage
    de maillage.

    Il n'en depend pas parce qu'il ne vient PAS du pic : il vient d'une COUPE.
    La somme des courants qui franchissent une colonne de carreaux est un flux,
    et un flux ne se soucie pas de la finesse de la trame. On verifie les deux
    ensemble -- meme geometrie, memes pas que le cas precedent, ou le pic
    variait de 38 pour cent.
    """
    temperatures, largeurs = [], []
    for pas in (0.2, 0.1, 0.05):
        r = resoudre_document(_piste(retrecissement=(19.0, 21.0, 1.0), pas=pas))
        temperatures.append(r["pire_par_net"]["VDD"]["echauffement"])
        largeurs.append(r["pire_par_net"]["VDD"]["largeur_chaude"])
    ecart = (max(temperatures) - min(temperatures)) / min(temperatures)
    assert ecart < 0.01, ("la temperature bouge de %.1f %% avec la trame : %s"
                          % (100 * ecart, [round(t, 2) for t in temperatures]))
    # Et c'est bien la section du COL qui est vue, pas celle de la piste.
    for l in largeurs:
        assert abs(l - 1.0) < 0.11, "largeur chaude vue : %.3f mm" % l
    section_mils2 = (1.0 * 0.035) / (0.0254 ** 2)
    attendu = (3.0 / (0.048 * section_mils2 ** 0.725)) ** (1.0 / 0.44)
    e = 100 * (temperatures[0] - attendu) / attendu
    assert abs(e) < 1.0, "%.3f K contre %.3f a la main" % (temperatures[0],
                                                           attendu)
    return ("%.3f K aux trois pas (%.3f %% d'ecart), contre %.3f a la main"
            % (temperatures[0], 100 * ecart, attendu))


print("\nLa densite de courant, et ce qu'elle echauffe")
essai("la densite est le calcul a la main, I/(W t)",
      cas_densite_est_le_calcul_a_la_main)
essai("un retrecissement concentre le courant la ou la chute ne le montre pas",
      cas_un_retrecissement_concentre_le_courant)
essai("l'echauffement est bien la charte IPC-2221",
      cas_echauffement_est_la_charte_ipc2221)
essai("le pic de densite ne converge pas, et c'est la physique",
      cas_le_pic_de_densite_ne_converge_pas_et_c_est_normal)
essai("l'echauffement, lui, ne bouge pas avec la trame",
      cas_l_echauffement_lui_NE_BOUGE_PAS)
essai("une couche interne chauffe plus, et dans le rapport de la charte",
      cas_une_couche_interne_chauffe_plus)
essai("un plan large ne chauffe pas", cas_un_plan_large_ne_chauffe_pas)
essai("le pire point porte ses coordonnees", cas_le_pire_point_est_localise)
essai("le modele thermique se nomme, et nomme son successeur",
      cas_le_modele_thermique_se_nomme)

print("\n" + "-" * 62)
if ECHECS:
    print("  %d cas passes, %d EN ECHEC" % (len(REUSSIS), len(ECHECS)))
    for t in ECHECS:
        print("    - %s" % t)
    sys.exit(1)
print("  %d cas, tous passes" % len(REUSSIS))
