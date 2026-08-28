#!/usr/bin/python3
# -*- coding: utf-8 -*-
# ==========================================
# VERSIONING
# Version: 2.4.0
# Date: 2026-08-28
# Explication: LA SECTION RESOLUE PART AVEC LE RESULTAT. Chaque troncon porte
#   desormais « h », « er », « tan_delta », « couverture », « entre_plans » et
#   « cuivre » -- toutes les cotes sur lesquelles Z0 a ete obtenu.
#
#   POURQUOI. Elles etaient calculees par section_de_couche() et jetees. La
#   fiche montrait donc un chiffre sans montrer sur quoi il avait ete obtenu, et
#   comprendre trois ohms d'ecart avec une carte reelle demandait d'INVERSER le
#   resultat pour retrouver la hauteur au plan et la permittivite. Or c'est
#   exactement la ou se trouve la reponse neuf fois sur dix : un fichier
#   IPC-2581 porte l'empilage NOMINAL, pas la carte pressee, et un prepreg
#   annonce a 0,36 mm sort couramment a 0,32.
#
#   Le solveur n'est pas en cause dans ces cas-la -- il est verifie a 0,25 %
#   contre la transformation conforme --, ce sont ses ENTREES. Encore faut-il
#   pouvoir les lire.
# Fonctions modifiees : simuler (six cles de plus par troncon)
#
# Version: 2.3.0
# Date: 2026-08-28
# Explication: LA MASSE COPLANAIRE N'EST PLUS SYMETRIQUE, et le net de
#   REFERENCE est nomme. Trois hypotheses tacites tombent d'un coup ; les deux
#   premieres traversent ce fichier, la troisieme est mesuree par la page et
#   seulement portee ici.
#
#   1. UN SEUL ECART pour les deux cotes. Un troncon porte maintenant
#      « gap_left » et « gap_right », mesures separement par la page. Une piste
#      qui longe une decoupe d'un cote et du plan serre de l'autre etait
#      calculee comme si elle avait du plan serre DES DEUX COTES : Z0 sortait
#      plusieurs ohms trop bas. « gap » reste accepte et vaut les deux cotes,
#      pour qu'un document ecrit avant cette version donne le meme resultat
#      qu'avant.
#   2. La cle du cache de section comprend les deux ecarts -- et elle n'est
#      plus ecrite a deux endroits : _cle_section() la donne, pour la boucle
#      des impedances comme pour celle des parametres S. Les deux devaient
#      s'accorder au chiffre pres, et rien ne le garantissait.
#   3. « reference_nets » : les nets que la page a retenus comme masse. Le
#      calcul n'en a pas besoin -- l'ecart est deja mesure -- mais le resultat,
#      le .csv et l'entete Touchstone doivent dire SOUS QUELLE HYPOTHESE le
#      chiffre a ete obtenu. Un ilot d'un autre signal n'est pas de la masse.
#
#   S'y ajoute un avertissement quand un troncon n'a de masse coplanaire que
#   d'un cote : ce n'est plus une coplanaire ordinaire, et la fiche doit le
#   dire plutot que d'afficher un ecart qui a l'air complet.
# Fonctions ajoutees/modifiees :
# - _ecarts, _cle_section (nouvelles)
# - section_de_couche : ecart_g_mm / ecart_d_mm
# - simuler : les deux ecarts, la cle factorisee, reference_nets
#
# Version: 2.2.0
# Date: 2026-08-28
# Explication: le PLAN DE MASSE COPLANAIRE traverse maintenant le pont. Chaque
#   troncon porte son « gap » -- l'ecart de cuivre a cuivre au plan qui le
#   borde sur sa propre couche --, mesure par la page et non devine ici :
#   l'editeur PCB le tient de la regle d'isolation qui creuse le plan, la
#   visionneuse le mesure sur le cuivre du fichier. Zero, et c'est le
#   microruban d'avant, au bit pres.
#
#   La cle du cache de section le comprend, sans quoi deux troncons de meme
#   largeur mais d'ecarts differents partageraient une impedance.
#
#   S'y ajoute : la frequence centrale est INSEREE dans la bande des
#   parametres S. Vingt et un points de 0,1 a 3 GHz ne tombent pas sur
#   868 MHz, et le .s2p exporte ne contenait donc pas la frequence de travail.
# Fonctions modifiees : section_de_couche (parametre ecart_mm), simuler
#
# Version: 2.1.0
# Date: 2026-08-28
# Explication: quatre incoherences corrigees, toutes entre ce qui etait
#   CALCULE et ce qui etait AFFICHE.
#
#   1. LA PISTE INTERNE etait calculee comme si elle affleurait, avec de l'air
#      au-dessus. _couverture() lit maintenant ce qu'il y a de l'autre cote de
#      la piste et le passe a solve_line, qui a pour cela sa fonction de Green
#      couverte. Sur une couche interne courante, Z0 baisse d'une dizaine de
#      pour cent : ce n'etait pas une imprecision, c'etait une erreur.
#   2. L'EPAISSEUR DE CUIVRE etait perdue dans la boucle des parametres S :
#      line_losses y reprenait son 35 um par defaut, et le tableau des
#      troncons annoncait donc d'autres pertes que la courbe A LA MEME
#      FREQUENCE.
#   3. L'ECART ENTRE PLANS d'une triplaque ne comptait que le dielectrique et
#      le cuivre de la piste ; les conducteurs traverses au passage y
#      manquaient.
#   4. LES VALEURS RAMENEES DE FORCE -- bande a l'envers, plus de 401 points,
#      frequence centrale hors bande -- partaient en silence. Elles partent
#      maintenant dans « avertissements ».
#
#   S'y ajoute un controle qui ne corrige rien mais dit ce qu'il voit :
#   _ruptures() verifie que la suite envoyee est un PARCOURS. La mise en
#   cascade suppose une chaine ; un net qui se ramifie n'en est pas une, et le
#   produit des matrices ABCD n'etant pas commutatif, S11 depend alors de
#   l'ordre d'envoi. Les impedances par troncon, elles, restent justes.
# Fonctions ajoutees/modifiees :
# - _cuivre_entre, _couverture, _entre_exterieur, _extremites, _ruptures
# - section_de_couche, doc_valide, simuler
#
# Version: 2.0.0
# Date: 2026-08-27
# Explication: la simulation ne passe plus par l'onde complete. Elle passe par
#   python/ligne_mom.py -- methode des moments sur la SECTION
#   DROITE de la piste -- et c'est un changement de fond, pas de detail.
#
#   POURQUOI. La cible d'origine etait mom_engine.py : maillage triangulaire,
#   fonctions RWG, matrice d'impedance, parametres S en 2,5D. Son noyau n'est
#   pas valide et ne peut pas l'etre a peu de frais : la formulation EFIE de
#   compute_interactions a perdu tout son terme de potentiel scalaire, celui
#   qui porte les charges. Sans charges il n'y a pas de capacite, et sans
#   capacite il n'y a pas d'impedance caracteristique -- Z0 = racine(L/C) ne
#   peut pas en sortir, quels que soient les ports. Les images complexes de
#   apply_dcim sont, elles, posees sur des constantes arbitraires plutot
#   qu'ajustees sur l'integrale de Sommerfeld.
#
#   CE QUI LE REMPLACE est une methode des moments, elle aussi -- celle de
#   Harrington sur la section droite -- et elle a l'avantage decisif d'etre
#   VERIFIABLE. Elle est verifiee : 0,42 % d'ecart au pire contre
#   Hammerstad-Jensen sur le microruban (er de 2,2 a 10,2, w/h de 0,5 a 5), et
#   0,30 % contre la solution exacte en integrales elliptiques sur la
#   triplaque. Elle donne l'impedance de chaque troncon, et les parametres S de
#   la liaison entiere par mise en cascade des matrices ABCD.
#
#   CE QU'ON PERD, et il faut le dire : l'onde complete voyait -- en principe --
#   les coudes, les moignons, le rayonnement, les resonances. Le modele de
#   ligne ne voit qu'une suite de sections uniformes. En pratique on ne perd
#   rien, puisque l'onde complete ne rendait aucun chiffre exploitable ; mais
#   le jour ou mom_engine.py sera repare, les deux se completeront.
#
#   mom_solver/ N'EST PAS MODIFIE et n'est plus dans le chemin : le moteur
#   2,5D pleine onde reste exactement tel qu'il a ete livre, dans son
#   dossier, pret a etre repris. Rien ici n'en depend.
#
#   CE QUI NE BOUGE PAS : le format d'echange, la route /api/simulation, le
#   panneau des deux pages. C'etait l'interet de mettre un pont ici.
# Fonctions ajoutees/modifiees :
# - section_de_couche (nouvelle) : empilage a plat -> section droite
# - simuler (refondue) : Z0 par troncon, S par cascade
# - FORMAT_RESULTAT passe a « cao-sim-em-resultat-2 »
#
# Version: 1.0.0
# Date: 2026-08-27
# Explication: pont entre le solveur electromagnetique et les deux pages qui
#   ont du cuivre a lui donner -- l'editeur PCB et la visionneuse IPC-2581.
#   Meme role que ipc2581_json.py pour le parseur : ce module ne calcule rien
#   et ne dessine rien, il traduit dans un sens et dans l'autre.
# ==========================================
"""Traduit le cuivre d'une page en probleme de ligne, et le resultat en JSON.

    >>> import simulation_em
    >>> simulation_em.etat()["dispo"]
    True

Le document d'entree, format « cao-sim-em-1 », est ce que produisent
`commun/simulation-em.js` et les deux adaptateurs qui s'en servent. Il est ecrit
EN MILLIMETRES, comme tout ce qui circule entre les outils du depot.

    format     "cao-sim-em-1"
    source     "editeur-pcb" ou "visionneuse-ipc2581", pour le journal
    carte      nom du document d'ou vient le cuivre
    net        le net analyse, quand il y en a un
    stackup    {"layers": [{type, thickness, epsilon_r, tan_delta, role}]}
               conducteurs ET dielectriques, dans l'ordre physique
    geometry   {"objects": [...]} -- les troncons SELECTIONNES, dans l'ordre ;
               l'indice "layer" designe une entree de stackup.layers, et
               "gap_left" / "gap_right" les ecarts de cuivre a cuivre au plan
               de masse qui borde le troncon SUR SA PROPRE COUCHE, un par cote,
               gauche et droite pris dans le sens de parcours du troncon
               (0 = pas de masse coplanaire de ce cote-la). "gap" seul reste
               accepte et vaut les deux cotes.
    reference_nets  les nets que la page tient pour de la masse. Le calcul ne
               s'en sert pas -- l'ecart est deja mesure --, mais le resultat
               doit dire sous quelle hypothese il a ete obtenu
    ports      [{id, position, layer, impedance}] -- l'impedance de reference
    analyse    {f_debut, f_fin, points, f_centre}   (Hz)

Le resultat, format « cao-sim-em-resultat-2 » :

    f_centre        la frequence a laquelle les impedances sont donnees
    segments        un par objet envoye, DANS LE MEME ORDRE : {z0, eps_eff,
                    topo, longueur, retard, pertes_db, plans, avert}
    ligne           le bilan de la liaison entiere : {z0_min, z0_max,
                    z0_moyen, longueur, retard, pertes_db}
    freqs / s       les parametres S sur la bande, matrice par frequence
    touchstone      le fichier .s2p, en texte
    avertissements  ce que le resultat ne couvre pas
"""

import math
import os
import sys
import time

# ligne_mom.py est dans le meme dossier que ce fichier. serveur.py met deja
# python/ dans sys.path ; ce module se debrouille seul quand on l'importe
# depuis ailleurs (un banc d'essai, un shell).
_ICI = os.path.dirname(os.path.abspath(__file__))
if _ICI not in sys.path:
    sys.path.insert(0, _ICI)

# Import a l'essai : numpy, scipy et le module de ligne peuvent manquer.
# ERREUR_SOLVEUR garde de quoi le dire a l'utilisateur, mot pour mot -- « le
# solveur ne marche pas » n'a jamais aide personne a installer numpy.
#
# On importe ligne_mom, VOISIN de ce fichier dans python/, et surtout PAS
# mom_solver : le paquet 2,5D pleine onde est laisse tel qu'il a ete livre, et
# rien ici ne doit en dependre. Son __init__.py tire d'ailleurs tout le paquet
# d'un coup -- numba compris -- ce qui ferait de l'onde complete une condition
# de demarrage pour un calcul qui ne s'en sert pas.
try:
    import numpy as np
    import ligne_mom as tl
    ERREUR_SOLVEUR = None
except Exception as _exc:                              # noqa: BLE001
    np = None
    tl = None
    ERREUR_SOLVEUR = _exc

FORMAT = "cao-sim-em-1"
FORMAT_RESULTAT = "cao-sim-em-resultat-2"

# -- les garde-fous ---------------------------------------------------------
# Le calcul de section coute une matrice pleine N x N par troncon, N etant le
# nombre de panneaux du ruban (120). C'est de l'ordre de la dizaine de
# millisecondes ; ce qui compte, ce sont les troncons et les points de
# frequence. Deux resolutions par troncon (avec et sans dielectrique) sont
# mises en cache par section : une piste de cent segments de meme largeur sur
# la meme couche ne coute donc qu'un seul calcul.
MAX_OBJETS = 2000
MAX_POINTS = 401

# Un document de simulation ne porte qu'une selection : il est petit.
MAX_CORPS = 4 * 1024 * 1024


class ErreurSimulation(Exception):
    """Refus explicite, avec de quoi corriger le tir.

    `conseil` est ce qu'il faut changer. Les deux pages l'affichent sous le
    message : un refus qui ne dit pas quoi faire oblige a deviner.
    """

    def __init__(self, message, conseil=""):
        Exception.__init__(self, message)
        self.message = message
        self.conseil = conseil


def etat():
    """Ce que le serveur sait faire : les pages le demandent avant de lancer."""
    if ERREUR_SOLVEUR is not None:
        return {"dispo": False,
                "detail": "Solveur EM indisponible : %s" % ERREUR_SOLVEUR,
                "conseil": "Le solveur a besoin de numpy :"
                           " « pip install numpy »."}
    return {"dispo": True, "format": FORMAT, "resultat": FORMAT_RESULTAT,
            "max": MAX_CORPS,
            "methode": "MoM quasi-statique sur la section droite"
                       " + mise en cascade ABCD",
            "limites": {"objets": MAX_OBJETS, "points": MAX_POINTS}}


def _nombre(valeur, defaut=0.0):
    try:
        v = float(valeur)
    except (TypeError, ValueError):
        return defaut
    return v if math.isfinite(v) else defaut


# ==========================================================================
# De l'empilage a plat a la section droite
# --------------------------------------------------------------------------
# L'empilage arrive comme une liste de couches alternant conducteur et
# dielectrique. Pour une piste posee sur le conducteur d'indice L, la section
# droite se lit en remontant et en descendant jusqu'au premier conducteur qui
# porte le role « plane » : c'est le plan de reference, et le dielectrique
# traverse en chemin donne la hauteur et la permittivite.
#
# C'est la meme lecture que `dpStripGeom()` cote editeur PCB et `ltGeom()` cote
# visionneuse. Elle est refaite ici parce que le serveur ne peut pas appeler du
# JavaScript -- mais elle doit rendre la MEME chose, sans quoi la fiche de la
# page et la simulation ne parleraient pas de la meme piste.
# ==========================================================================

def _entre(couches, a, b):
    """Le dielectrique entre les conducteurs d'indices a et b (a < b).

    Rend (epaisseur totale, permittivite moyenne ponderee, tan delta moyen).
    Les conducteurs traverses au passage ne comptent pas : c'est le
    dielectrique qui fait la distance electrique.
    """
    t = s_er = s_df = 0.0
    for i in range(min(a, b) + 1, max(a, b)):
        c = couches[i]
        if c.get("type") == "copper":
            continue
        e = _nombre(c.get("thickness"))
        if e <= 0:
            continue
        t += e
        s_er += e * _nombre(c.get("epsilon_r"), 4.3)
        s_df += e * _nombre(c.get("tan_delta"), 0.02)
    if t <= 0:
        return 0.0, 4.3, 0.02
    return t, s_er / t, s_df / t


def _cuivre_entre(couches, a, b):
    """L'epaisseur de CUIVRE strictement entre les conducteurs a et b.

    `_entre` ne compte que le dielectrique -- c'est lui qui fait la distance
    electrique. Mais l'ecart PHYSIQUE entre deux plans, lui, comprend aussi les
    conducteurs traverses : sur un six couches, deux couches de signal de 35 um
    entre les deux plans, ce sont 70 um qui manquaient a « b ».
    """
    return sum(_nombre(couches[i].get("thickness"))
               for i in range(min(a, b) + 1, max(a, b))
               if couches[i].get("type") == "copper")


def _couverture(couches, indice, vers_le_bas):
    """Le dielectrique qui COUVRE la piste, du cote oppose au plan.

    C'est ce qui separe un microruban NU -- couche exterieure, de l'air
    au-dessus -- d'une piste INTERNE, qui a du stratifie des deux cotes. Le
    solveur en a besoin : sans lui il calcule une couche interne comme si elle
    affleurait, et il sort une dizaine de pour cent trop haut.

    On accumule tout le dielectrique jusqu'a la face exterieure de l'empilage,
    en enjambant les conducteurs rencontres -- meme convention que `_entre`.
    Une piste de couche exterieure ne trouve rien : la couverture est nulle,
    et c'est exactement le cas nu.
    """
    pas = 1 if vers_le_bas else -1
    total = 0.0
    i = indice + pas
    while 0 <= i < len(couches):
        c = couches[i]
        if c.get("type") != "copper":
            e = _nombre(c.get("thickness"))
            if e > 0:
                total += e
        i += pas
    return total


def section_de_couche(couches, indice, largeur_mm, epaisseur_mm,
                      ecart_g_mm=0.0, ecart_d_mm=None):
    """La section droite d'une piste, en METRES, pour `solve_line`.

    `ecart_g_mm` et `ecart_d_mm` sont les distances de cuivre a cuivre entre la
    piste et le plan de masse qui la borde SUR SA PROPRE COUCHE, un par cote --
    zero quand il n'y en a pas de ce cote-la. Sur une carte arrosee, et une
    carte RF l'est toujours, c'est ce qui separe un microruban d'une ligne
    coplanaire, et vingt pour cent d'impedance.

    LES DEUX COTES SONT INDEPENDANTS. `ecart_d_mm` a None veut dire « le meme
    des deux cotes » : c'est le cas symetrique, et c'est ce que voulait dire
    l'unique `ecart_mm` d'avant la 2.3.0. Un cote a zero et l'autre non, c'est
    la piste qui longe une decoupe -- et la prendre pour symetrique fait tomber
    Z0 deux fois trop.

    Rend (geometrie, description) ou (None, raison) quand il n'y a pas de ligne
    a calculer -- pas de plan de reference, couche inconnue.
    """
    if ecart_d_mm is None:
        ecart_d_mm = ecart_g_mm
    e_g = max(0.0, _nombre(ecart_g_mm, 0.0))
    e_d = max(0.0, _nombre(ecart_d_mm, 0.0))
    if indice < 0 or indice >= len(couches):
        return None, "couche hors de l'empilage"
    if couches[indice].get("type") != "copper":
        return None, "cette couche n'est pas du cuivre"

    haut = bas = -1
    for k in range(indice - 1, -1, -1):
        c = couches[k]
        if c.get("type") == "copper" and c.get("role") == "plane":
            haut = k
            break
    for k in range(indice + 1, len(couches)):
        c = couches[k]
        if c.get("type") == "copper" and c.get("role") == "plane":
            bas = k
            break

    w = largeur_mm * 1e-3
    t = epaisseur_mm * 1e-3
    if not (w > 0):
        return None, "largeur de piste nulle"

    if haut >= 0 and bas >= 0:
        # Triplaque. La position exacte du ruban entre les deux plans compte :
        # un empilage 4 couches courant est franchement dissymetrique -- ame
        # epaisse d'un cote, prepreg mince de l'autre -- et c'est justement ce
        # que la formule IPC ne sait pas prendre, elle qui suppose le ruban
        # centre. Ici il est ou il est.
        t_haut, er_h, df_h = _entre(couches, haut, indice)
        t_bas, er_b, df_b = _entre(couches, indice, bas)
        # L'ecart entre plans, c'est du dielectrique ET du cuivre : celui de la
        # piste, et celui de toutes les couches traversees au passage.
        cu_haut = _cuivre_entre(couches, haut, indice)
        cu_bas = _cuivre_entre(couches, indice, bas)
        b = (t_haut + t_bas + cu_haut + cu_bas + epaisseur_mm) * 1e-3
        y0 = (t_bas + cu_bas) * 1e-3 + t / 2.0
        total = t_haut + t_bas
        er = (er_h * t_haut + er_b * t_bas) / total if total > 0 else 4.3
        df = (df_h * t_haut + df_b * t_bas) / total if total > 0 else 0.02
        if not (b > 0) or not (0 < y0 < b):
            return None, "empilage incoherent entre les deux plans"
        return ({"kind": "strip", "w": w, "t": t, "b": b, "y0": y0,
                 "epsilon_r": er, "tan_delta": df,
                 "ecart_g": e_g * 1e-3, "ecart_d": e_d * 1e-3},
                {"topo": "strip", "ref": 2, "h": min(y0, b - y0), "b": b,
                 "er": er, "tan_delta": df,
                 "ecart_g": e_g, "ecart_d": e_d,
                 "plan_haut": couches[haut].get("name", ""),
                 "plan_bas": couches[bas].get("name", ""),
                 "dissym": abs(t_haut - t_bas) / max(t_haut, t_bas, 1e-9)})

    proche = haut if haut >= 0 else bas
    if proche < 0:
        return None, ("aucun plan de reference dans l'empilage : sans plan en"
                      " face de la piste, il n'y a pas de ligne")
    h_mm, er, df = _entre(couches, proche, indice)
    if not (h_mm > 0):
        return None, "hauteur au plan de reference nulle"
    # Ce qu'il y a DE L'AUTRE COTE de la piste, a l'oppose du plan. Rien pour
    # une couche exterieure -- de l'air, et c'est le microruban nu. Du
    # stratifie pour une couche interne, et alors ce n'est plus le meme calcul.
    couv_mm = _couverture(couches, indice, vers_le_bas=(haut >= 0))
    # La permittivite du modele couvert est celle du stratifie tout entier, de
    # la piste au plan ET au-dessus : on la pondere par les deux epaisseurs.
    er_couv = er
    if couv_mm > 0:
        er_haut = _entre_exterieur(couches, indice, haut >= 0)
        er_couv = (er * h_mm + er_haut * couv_mm) / (h_mm + couv_mm)
    return ({"kind": "micro", "w": w, "t": t, "h": h_mm * 1e-3,
             "couverture": couv_mm * 1e-3, "epsilon_r": er_couv,
             "tan_delta": df,
             "ecart_g": e_g * 1e-3, "ecart_d": e_d * 1e-3},
            {"topo": "micro", "ref": 1, "h": h_mm * 1e-3, "b": 0.0,
             "er": er_couv, "tan_delta": df, "couverture": couv_mm * 1e-3,
             "ecart_g": e_g, "ecart_d": e_d,
             "plan_haut": couches[proche].get("name", "") if haut >= 0 else "",
             "plan_bas": couches[proche].get("name", "") if bas >= 0 else "",
             "dissym": 0.0})


def _entre_exterieur(couches, indice, vers_le_bas):
    """La permittivite moyenne du dielectrique qui couvre la piste."""
    pas = 1 if vers_le_bas else -1
    t = s = 0.0
    i = indice + pas
    while 0 <= i < len(couches):
        c = couches[i]
        if c.get("type") != "copper":
            e = _nombre(c.get("thickness"))
            if e > 0:
                t += e
                s += e * _nombre(c.get("epsilon_r"), 4.3)
        i += pas
    return s / t if t > 0 else 4.3


# ==========================================================================
# Lecture du document
# ==========================================================================

def doc_valide(doc):
    """Verifie le document et rend (couches, objets, analyse)."""
    if not isinstance(doc, dict):
        raise ErreurSimulation("Le document envoyé n'est pas un objet JSON.")
    if doc.get("format") != FORMAT:
        raise ErreurSimulation(
            "Format inattendu : « %s » au lieu de « %s »."
            % (doc.get("format") or "absent", FORMAT))

    couches = (doc.get("stackup") or {}).get("layers") or []
    if not couches:
        raise ErreurSimulation(
            "Empilage vide : le solveur a besoin d'au moins un conducteur et"
            " un diélectrique.",
            "Complétez l'empilage dans la page avant de lancer le calcul.")

    objets = (doc.get("geometry") or {}).get("objects") or []
    if not objets:
        raise ErreurSimulation(
            "Aucun cuivre à analyser.",
            "Sélectionnez une piste sur la carte.")
    if len(objets) > MAX_OBJETS:
        raise ErreurSimulation(
            "Trop de tronçons : %d, maximum %d." % (len(objets), MAX_OBJETS),
            "Restreignez la sélection.")

    a = doc.get("analyse") or {}
    f1, f2 = _nombre(a.get("f_debut")), _nombre(a.get("f_fin"))
    points = int(_nombre(a.get("points"), 0))
    if not (f1 > 0 and f2 > 0):
        raise ErreurSimulation("Bande de fréquence absente ou nulle.")
    # Ce qui a ete ramene de force part avec le resultat : une valeur corrigee
    # en silence se lit comme une valeur acceptee, et l'utilisateur repart en
    # croyant avoir demande autre chose que ce qu'il a obtenu.
    ajuste = []
    if f2 < f1:
        f1, f2 = f2, f1
        ajuste.append("La bande était donnée à l'envers : elle a été remise"
                      " dans l'ordre.")
    demande = points
    points = max(1, min(points or 1, MAX_POINTS))
    if demande > MAX_POINTS:
        ajuste.append("Bande S ramenée de %d à %d points, qui est le maximum."
                      % (demande, MAX_POINTS))

    # La frequence centrale : celle a laquelle les impedances sont donnees et
    # la carte de chaleur peinte. Absente, on prend le milieu geometrique de la
    # bande -- une bande RF se lit en decades, pas en hertz.
    fc = _nombre(a.get("f_centre"))
    if not (fc > 0):
        fc = math.sqrt(f1 * f2)
    if not (f1 <= fc <= f2):
        ajuste.append("Fréquence centrale hors de la bande S : ramenée de"
                      " %.4g à %.4g GHz." % (fc / 1e9,
                                             min(max(fc, f1), f2) / 1e9))
    fc = min(max(fc, f1), f2)

    return couches, objets, {"f_debut": f1, "f_fin": f2, "points": points,
                             "f_centre": fc, "ajuste": ajuste}


AVERTISSEMENTS_MODELE = [
    "Modèle de ligne : la piste est vue comme une suite de sections droites"
    " uniformes. Les coudes, les moignons, les transitions de via et le"
    " rayonnement n'y sont pas — ce qui se passe AU RACCORD entre deux"
    " tronçons n'est pas modélisé.",
    "Le calcul de section est quasi-statique ; la dispersion est ajoutée par"
    " le modèle de Getsinger, qui est un modèle et non un calcul. Au-delà de"
    " quelques gigahertz sur stratifié courant, l'écart se creuse.",
]


# ==========================================================================
# La selection est-elle une chaine ?
# --------------------------------------------------------------------------
# LA MISE EN CASCADE SUPPOSE UNE CHAINE, et rien d'autre : un troncon, puis le
# suivant, bout a bout, dans l'ordre ou ils arrivent. C'est vrai d'une piste
# suivie d'un bout a l'autre. Ce ne l'est pas d'un net entier, qui se ramifie
# en T vers trois recepteurs, ni d'une selection ramassee dans un ordre
# quelconque -- et le produit de matrices ABCD n'est PAS commutatif : les memes
# troncons dans un autre ordre donnent un autre S11.
#
# Les impedances par troncon, elles, ne sont pas concernees : chacune ne depend
# que de sa propre section. C'est pourquoi la carte de chaleur reste juste la
# ou la courbe S ne l'est plus, et c'est exactement ce que dit l'avertissement.
#
# On ne devine pas la topologie : on verifie seulement que chaque troncon
# touche le precedent. Un decrochage suffit a dire que la suite envoyee n'est
# pas un parcours, et c'est tout ce qu'il faut savoir pour prevenir.
# ==========================================================================

TOLERANCE_RACCORD = 0.02                # mm ; large, pour ne pas crier a tort


def _ecarts(obj):
    """Les deux ecarts au cuivre de masse d'un troncon, en millimetres.

    « gap_left » et « gap_right » quand la page les donne -- elle mesure chaque
    cote separement --, « gap » sinon, qui vaut LES DEUX COTES. Un document
    ecrit avant la 2.3.0 ne porte que « gap » et doit donner exactement ce
    qu'il donnait, sans quoi une comparaison entre deux versions ne voudrait
    rien dire.
    """
    g = obj.get("gap_left")
    d = obj.get("gap_right")
    if g is None and d is None:
        g = d = obj.get("gap")
    return max(0.0, _nombre(g, 0.0)), max(0.0, _nombre(d, 0.0))


def _cle_section(obj):
    """La cle du cache de section : tout ce dont la section droite depend.

    ELLE EST ICI ET NULLE PART AILLEURS. Elle etait ecrite deux fois -- dans la
    boucle des impedances et dans celle des parametres S -- et les deux devaient
    s'accorder au chiffre pres pour que la seconde retrouve ce que la premiere
    avait calcule. Rien ne le garantissait : ajouter un terme d'un cote et pas
    de l'autre y levait un KeyError, ou pire, y prenait la section d'un autre
    troncon.
    """
    g, d = _ecarts(obj)
    return (int(_nombre(obj.get("layer"), 0)),
            round(_nombre(obj.get("width")), 6),
            round(_nombre(obj.get("copper_thickness"), 0.035), 6),
            round(g, 6), round(d, 6))


def _extremites(obj):
    """(depart, arrivee) d'un objet, ou None s'il ne porte pas ses points."""
    a, b = obj.get("start"), obj.get("end")
    if not (isinstance(a, (list, tuple)) and len(a) >= 2
            and isinstance(b, (list, tuple)) and len(b) >= 2):
        return None
    return ((_nombre(a[0]), _nombre(a[1])), (_nombre(b[0]), _nombre(b[1])))


def _ruptures(objets):
    """Combien de fois la suite envoyee cesse d'etre un parcours continu."""
    n = 0
    precedent = None
    for obj in objets:
        e = _extremites(obj)
        if e is None:
            return 0                    # sans coordonnees, on ne juge pas
        if precedent is not None:
            if not any(math.hypot(p[0] - q[0], p[1] - q[1])
                       <= TOLERANCE_RACCORD
                       for p in precedent for q in e):
                n += 1
        precedent = e
    return n


# ==========================================================================
# Le calcul
# ==========================================================================

def simuler(doc, journal=None):
    """Document -> impedance par troncon et parametres S. Leve ErreurSimulation."""
    if ERREUR_SOLVEUR is not None:
        raise ErreurSimulation("Solveur EM indisponible : %s" % ERREUR_SOLVEUR,
                               "Le solveur a besoin de numpy :"
                               " « pip install numpy ».")

    couches, objets, analyse = doc_valide(doc)
    fc = analyse["f_centre"]
    z_ref = _nombre(((doc.get("ports") or [{}])[0]).get("impedance"), 50.0) or 50.0
    debut = time.time()

    # Deux resolutions de section par troncon, c'est cher ; mais une piste
    # porte le plus souvent la meme largeur sur la meme couche d'un bout a
    # l'autre. On met donc la section en cache sur (couche, largeur, epaisseur)
    # arrondis au nanometre : cent segments identiques ne coutent qu'un calcul.
    cache = {}
    segments = []
    avertissements = list(AVERTISSEMENTS_MODELE)
    avertissements.extend(analyse.get("ajuste") or [])
    vus = set()
    # L'avertissement « masse d'un seul cote » ne se dit qu'UNE fois pour toute
    # la selection : une piste qui longe une decoupe sur toute sa longueur
    # donne des dizaines de sections dans ce cas, et repeter la meme phrase
    # noierait tout le reste de la fiche. Son propre jeu, et pas `vus` : une
    # section peut etre a la fois dissymetrique et bordee d'un seul cote, et
    # partager le jeu ferait taire l'un des deux.
    un_cote = set()

    ruptures = _ruptures(objets)
    if ruptures:
        avertissements.append(
            "La sélection n'est pas un parcours continu : %d raccord(s)"
            " manquent entre deux tronçons consécutifs. Les impédances par"
            " tronçon et la carte de chaleur restent justes — chacune ne"
            " dépend que de sa propre section. Les PARAMÈTRES S, le retard"
            " total et les pertes totales, eux, supposent une chaîne unique"
            " parcourue dans l'ordre envoyé : sur un net qui se ramifie, ou"
            " sur une sélection éparse, ils ne veulent rien dire."
            % ruptures)

    for obj in objets:
        largeur = _nombre(obj.get("width"))
        indice = int(_nombre(obj.get("layer"), 0))
        ep = _nombre(obj.get("copper_thickness"), 0.035)
        # Les deux ecarts au cuivre de masse coplanaire, mesures par la page,
        # un par cote. Absents, c'est zero des deux cotes : le microruban nu.
        gap_g, gap_d = _ecarts(obj)
        longueur = _nombre(obj.get("length"))
        if longueur <= 0:
            a = obj.get("start") or [0, 0]
            b = obj.get("end") or [0, 0]
            longueur = math.hypot(_nombre(b[0]) - _nombre(a[0]),
                                  _nombre(b[1]) - _nombre(a[1]))

        cle = _cle_section(obj)
        if cle not in cache:
            geo, info = section_de_couche(couches, indice, largeur, ep,
                                          gap_g, gap_d)
            if geo is None:
                cache[cle] = {"z0": 0.0, "raison": info}
            else:
                try:
                    r = tl.solve_line(geo)
                except Exception as exc:               # noqa: BLE001
                    cache[cle] = {"z0": 0.0, "raison": str(exc)}
                else:
                    # La dispersion ne concerne que le microruban : la
                    # triplaque est noyee dans un milieu homogene, sa
                    # permittivite effective ne bouge pas avec la frequence.
                    if info["topo"] == "micro":
                        eps_f, z_f = tl.dispersion_getsinger(
                            r["z0"], r["eps_eff"], info["er"], info["h"], fc)
                    else:
                        eps_f, z_f = r["eps_eff"], r["z0"]
                    a_c, a_d = tl.line_losses(z_f, eps_f, largeur * 1e-3,
                                              info["er"], info["tan_delta"],
                                              fc, ep * 1e-3)
                    cache[cle] = {"z0": z_f, "z0_statique": r["z0"],
                                  "eps_eff": eps_f, "alpha": a_c + a_d,
                                  "alpha_c": a_c, "alpha_d": a_d,
                                  "coplanaire": bool(r.get("coplanaire")),
                                  # Les ecarts RETENUS par le solveur, cote par
                                  # cote : sous une epaisseur de cuivre il les
                                  # laisse tomber, et ce n'est pas la page qui
                                  # peut le savoir.
                                  "ecart": r.get("ecart", 0.0),
                                  "ecart_g": r.get("ecart_g", 0.0),
                                  "ecart_d": r.get("ecart_d", 0.0),
                                  "cotes": int(r.get("cotes", 0)),
                                  "info": info, "raison": ""}
                    # UN SEUL COTE AVEC DE LA MASSE, ce n'est pas une
                    # coplanaire ordinaire : le champ n'est pas encadre, il
                    # penche. Le calcul le tient -- c'est tout l'objet de la
                    # 2.3.0 -- mais l'ecart affiche a l'air complet alors qu'il
                    # ne decrit qu'un bord, et cela se dit.
                    if int(r.get("cotes", 0)) == 1 and not un_cote:
                        un_cote.add(cle)
                        avertissements.append(
                            "Masse coplanaire D'UN SEUL CÔTÉ sur au moins un"
                            " tronçon : %.3f mm d'un bord, rien de l'autre à"
                            " portée. C'est calculé tel quel — le champ n'est"
                            " pas encadré et Z₀ reste plus haute que sur une"
                            " coplanaire symétrique. Vérifiez que c'est voulu :"
                            " une découpe, un bord de carte ou un plan qui"
                            " s'arrête là."
                            % (1e3 * max(r.get("ecart_g", 0.0),
                                         r.get("ecart_d", 0.0))))
                    if info["topo"] == "strip" and info["dissym"] > 0.4 \
                            and cle not in vus:
                        vus.add(cle)
                        avertissements.append(
                            "Triplaque nettement dissymétrique : le ruban n'est"
                            " pas à mi-hauteur entre ses plans. C'est calculé"
                            " tel quel ici — la formule IPC de la fiche"
                            " « Ligne de transmission », elle, suppose le ruban"
                            " centré et sort au-dessus.")

        c = cache[cle]
        seg = {"z0": round(c["z0"], 3), "longueur": round(longueur, 4),
               "largeur": round(largeur, 4), "couche": indice,
               "raison": c.get("raison", "")}
        if c["z0"] > 0:
            v = tl.C_0 / math.sqrt(c["eps_eff"])
            retard = (longueur * 1e-3) / v
            seg.update({
                "z0_statique": round(c["z0_statique"], 3),
                "eps_eff": round(c["eps_eff"], 4),
                "topo": c["info"]["topo"],
                # Une piste interne qui n'a de plan que d'un cote est un
                # microruban COUVERT : meme topologie, mais du stratifie
                # au-dessus. Le tableau doit pouvoir le nommer.
                "couvert": bool(c["info"].get("couverture", 0.0) > 0),
                # LES ECARTS RETENUS, qui ne sont pas toujours ceux envoyes :
                # sous une epaisseur de cuivre le solveur les laisse tomber.
                # « ecart » est le cote le plus serre de ceux qui portent de la
                # masse -- c'est lui qui commande Z0 -- et « cotes » dit combien
                # en portent : 2 pour une coplanaire ordinaire, 1 pour une
                # piste qui longe une decoupe, 0 pour un microruban nu.
                "coplanaire": bool(c.get("coplanaire")),
                "ecart": round(1e3 * c.get("ecart", 0.0), 4),
                "ecart_g": round(1e3 * c.get("ecart_g", 0.0), 4),
                "ecart_d": round(1e3 * c.get("ecart_d", 0.0), 4),
                "cotes": c.get("cotes", 0),
                "retard": retard,
                "pertes_db": round(8.686 * c["alpha"] * longueur * 1e-3, 4),
                "plan_haut": c["info"]["plan_haut"],
                "plan_bas": c["info"]["plan_bas"],
                # LA SECTION RESOLUE, EN CLAIR. Elle etait calculee ici et
                # jamais rendue : la fiche montrait Z0 sans montrer sur quoi il
                # avait ete obtenu, et diagnostiquer trois ohms d'ecart avec une
                # carte reelle demandait d'INVERSER le resultat pour retrouver
                # la hauteur au plan. Tout est en millimetres, comme le reste du
                # document.
                "h": round(1e3 * c["info"]["h"], 4),
                "er": round(c["info"]["er"], 3),
                "tan_delta": round(c["info"]["tan_delta"], 5),
                "couverture": round(1e3 * c["info"].get("couverture", 0.0), 4),
                "entre_plans": round(1e3 * c["info"].get("b", 0.0), 4),
                "cuivre": round(ep, 4),
            })
        segments.append(seg)

    valides = [s for s in segments if s["z0"] > 0]
    if not valides:
        raison = segments[0].get("raison") or "aucune ligne calculable"
        raise ErreurSimulation(
            "Aucun tronçon n'a d'impédance calculable : %s." % raison,
            "Un plan de référence doit faire face à la piste. Vérifiez le rôle"
            " des couches dans l'empilage.")

    # -- le bilan de la liaison ------------------------------------------
    long_tot = sum(s["longueur"] for s in valides)
    z_moyen = (sum(s["z0"] * s["longueur"] for s in valides) / long_tot
               if long_tot > 0 else valides[0]["z0"])
    ligne = {
        "z0_min": round(min(s["z0"] for s in valides), 3),
        "z0_max": round(max(s["z0"] for s in valides), 3),
        "z0_moyen": round(z_moyen, 3),
        "longueur": round(long_tot, 3),
        "retard": sum(s["retard"] for s in valides),
        "pertes_db": round(sum(s["pertes_db"] for s in valides), 4),
        "troncons": len(valides),
        "ecartes": len(segments) - len(valides),
    }

    # -- les parametres S, par mise en cascade ---------------------------
    # Chaque troncon est une ligne uniforme : sa matrice ABCD est exacte, et
    # les mettre bout a bout, c'est les multiplier. La matrice S s'en deduit
    # sur l'impedance de reference des ports.
    # LA FREQUENCE CENTRALE FAIT PARTIE DE LA BANDE, toujours. Une bande
    # regulierement echantillonnee tombe rarement dessus : 21 points de 0,1 a
    # 3 GHz donnent 100, 245, ... 825, 970 MHz -- et pas 868. Le panneau lisait
    # alors 825 MHz sous le repere f0, et surtout le .s2p exporte ne contenait
    # PAS la frequence de travail, ce qui le rend inutilisable tel quel dans un
    # outil d'adaptation. On l'insere donc, quitte a rompre la regularite du
    # pas : un point de plus coute une matrice 2x2, la frequence qu'on cherche
    # vaut mieux que l'elegance de l'echantillonnage.
    freqs = np.linspace(analyse["f_debut"], analyse["f_fin"], analyse["points"])
    if freqs.size and np.min(np.abs(freqs - fc)) > 1e-6 * max(fc, 1.0):
        freqs = np.sort(np.append(freqs, fc))
    matrices = []
    for f in freqs:
        abcd = np.eye(2, dtype=complex)
        for obj, seg in zip(objets, segments):
            if seg["z0"] <= 0:
                continue
            ep = round(_nombre(obj.get("copper_thickness"), 0.035), 6)
            c = cache[_cle_section(obj)]
            info = c["info"]
            if info["topo"] == "micro":
                eps_f, z_f = tl.dispersion_getsinger(
                    c["z0_statique"], c["eps_eff"], info["er"], info["h"],
                    float(f))
            else:
                eps_f, z_f = c["eps_eff"], c["z0_statique"]
            # L'EPAISSEUR DE CUIVRE PART AVEC, comme au point central. L'oublier
            # ici laissait `line_losses` reprendre son 35 um par defaut : le
            # tableau des troncons et la courbe S annoncaient alors deux pertes
            # differentes A LA MEME FREQUENCE des que le cuivre n'etait pas du
            # 35 um -- d'un facteur 4 sur du 9 um sous la profondeur de peau.
            a_c, a_d = tl.line_losses(z_f, eps_f, seg["largeur"] * 1e-3,
                                      info["er"], info["tan_delta"], float(f),
                                      ep * 1e-3)
            beta = 2 * math.pi * float(f) * math.sqrt(eps_f) / tl.C_0
            abcd = abcd @ tl.abcd_line(z_f, complex(a_c + a_d, beta),
                                       seg["longueur"] * 1e-3)
        matrices.append(tl.cascade_to_s(abcd, z_ref))

    duree = time.time() - debut
    if journal:
        journal("  simulation « %s » : %d tronçon(s), Z0 %.1f-%.1f Ω à %.3f GHz,"
                " %.1f s\n" % (doc.get("net") or doc.get("carte") or "(sans nom)",
                               len(valides), ligne["z0_min"], ligne["z0_max"],
                               fc / 1e9, duree))

    # LES NETS DE REFERENCE PARTENT AVEC LE RESULTAT. Ils ne changent rien au
    # calcul -- la page a deja mesure les ecarts -- mais ils disent ce qui a ete
    # tenu pour de la masse, et c'est une hypothese, pas un fait : un ilot d'un
    # autre signal qui longe la piste n'est pas un plan de retour. Un .s2p ou un
    # .csv se detache de la page ou il a ete produit ; sans cette ligne, il ne
    # reste qu'un chiffre dont on ne sait plus contre quoi il a ete calcule.
    refs = [str(x) for x in (doc.get("reference_nets") or []) if str(x).strip()]

    entete = ["Genere par WEB_CAO -- MoM quasi-statique sur la section droite"
              " (python/ligne_mom.py), mise en cascade ABCD",
              "Source : %s" % (doc.get("source") or "inconnue"),
              "Carte : %s" % (doc.get("carte") or "-"),
              "Net : %s" % (doc.get("net") or "-"),
              "Masse de reference : %s" % (", ".join(refs) if refs
                                           else "non declaree"),
              "Z0 moyen : %.2f ohm a %.4f GHz" % (ligne["z0_moyen"], fc / 1e9)]

    return {
        "format": FORMAT_RESULTAT,
        "carte": doc.get("carte") or "",
        "net": doc.get("net") or "",
        "reference_nets": refs,
        "f_centre": fc,
        "impedance_reference": z_ref,
        "segments": segments,
        "ligne": ligne,
        "freqs": [float(f) for f in freqs],
        "s": [[[float(v.real), float(v.imag)] for v in m.flatten()]
              for m in matrices],
        "ports": 2,
        "touchstone": touchstone(freqs, matrices, z_ref, entete),
        "duree": round(duree, 3),
        "avertissements": avertissements,
    }


# ==========================================================================
# Touchstone
# La route n'ecrit rien sur le disque : le .s2p part dans la reponse, la page
# l'enregistre si elle veut. D'ou cette version en memoire.
# ==========================================================================

def touchstone(freqs, matrices, impedance=50.0, entete=None):
    """Le texte d'un fichier .s2p, format « MA » (module / phase en degres)."""
    lignes = ["! " + str(l) for l in (entete or [])]
    lignes.append("# HZ S MA R %g" % impedance)
    # Un 2 ports s'ecrit sur une ligne, dans l'ordre S11 S21 S12 S22 --
    # l'inversion des deux termes croises est la norme, pas une coquille.
    for f, s in zip(freqs, matrices):
        vals = []
        for i, j in ((0, 0), (1, 0), (0, 1), (1, 1)):
            vals.append("%.6g %.4f" % (abs(s[i, j]),
                                       math.degrees(np.angle(s[i, j]))))
        lignes.append("%.6g %s" % (f, " ".join(vals)))
    return "\n".join(lignes) + "\n"
