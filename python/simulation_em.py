#!/usr/bin/python3
# -*- coding: utf-8 -*-
# ==========================================
# VERSIONING
# Version: 3.1.0
# Date: 2026-08-29
# Explication: simuler() LEVAIT A CHAQUE APPEL, et les discontinuites
#   affichaient d'autres chiffres que ceux qu'elles appliquaient.
#
#   1. _ruptures ETAIT DEFINIE DEUX FOIS. La seconde definition -- l'ancienne,
#      qui ne rend qu'un entier -- ecrasait la nouvelle, qui rend un couple.
#      L'appelant faisait « ruptures, detail = _ruptures(objets) » sur un
#      entier : TypeError a chaque simulation. L'ancienne est supprimee.
#
#   2. TROIS COPIES DES MODELES DE DISCONTINUITE, et trois resultats. Une dans
#      _coudes pour l'affichage, une dans solve_line pour la cascade, une
#      troisieme dans ligne_mom : la fiche annoncait 21,28 fF de capacite de
#      coude la ou le modele en appliquait 0,394 -- cinquante fois moins. Il
#      n'en reste aucune ici : ligne_mom.elements_coude, .inductance_via et
#      .capacite_pastille servent l'affichage ET la cascade.
#
#   3. LES APPELS SE FAISAIENT EN MILLIMETRES vers des fonctions qui attendent
#      des metres : l'inductance du via sortait mille fois trop grande, la
#      capacite de pastille mille fois aussi.
#
#   4. La frequence du modele de coude etait POSEE A 5 GHz en dur, quelle que
#      soit la bande demandee. C'est la frequence centrale de l'analyse.
#
#   5. Les cotes du via sont reunies dans _cotes_via, qui marque
#      `cotes_supposees` : aucune page n'envoie encore les vias, et le modele
#      tourne sur des replis qu'il faut afficher comme tels.
# Fonctions ajoutees : _cotes_via
# Fonctions retirees : _ruptures (doublon), inductance_via_modelisee,
#   capacite_pastille_modelisee, capacite_coude_modelisee
# Fonctions modifiees : _coudes (ne calcule plus que l'angle), simuler
#
# Version: 3.0.0
# Date: 2026-08-28
# Explication: LOT 2 (MASQUE DE SOUDURE), LOT 3a (VOIR/DIRE DISCONTINUITES),
#   LOT 3b (MODELISER DISCONTINUITES).
#
#   LOT 2 : le masque de soudure est maintenant calcule. green_spectral_micro_masque
#   dans ligne_mom.py prend trois regions (substrat/masque/air) et section_de_couche
#   detecte les couches exterieures pour leur envoyer le masque (defaut 25um/er3.8).
#   Chaque segment de sortie porte maintenant "masque".
#
#   LOT 3a : _coudes() calcule l'angle de chaque raccord et la capacite d'exces
#   estimee ; _transitions() detecte les changements de couche ; _ruptures() est
#   corrigee pour comparer XY ET couche (le bug etait que deux troncons au meme XY
#   sur couches differentes etaient pris pour un raccord).
#
#   LOT 3b : les discontinuites sont modelisees en elements localises et inseres
#   dans la cascade ABCD : shunt C pour les coudes, pi L-C pour les vias.
#   Le resultat porte "discontinuites" avec coudes et transitions.
#
#   Formats mis a jour : cao-sim-em-2 en entree, cao-sim-em-resultat-3 en sortie.
# Fonctions ajoutees : _coudes, _transitions, inductance_via_modelisee,
#   capacite_pastille_modelisee, capacite_coude_modelisee
# Fonctions modifiees : solve_line (cascade des discontinuites), doc_valide
#
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
#   fonctions RWG, matrice d'impedance, parametres S en 2,5D. Son noyau
#   n'etait pas valide : les images complexes de apply_dcim etaient posees sur
#   des constantes arbitraires plutot qu'ajustees sur l'integrale de
#   Sommerfeld, et compute_interactions n'avait qu'UNE fonction de Green pour
#   les DEUX potentiels -- le terme inductif recevait celle du terme de charge.
#   Sans les deux, Z0 = racine(L/C) ne peut pas sortir juste, quels que soient
#   les ports.
#
#   CE QUI A CHANGE DEPUIS, et qui ne change rien a ce choix pour l'instant :
#   les deux defauts sont repares et mesures (mom_solver/tests/banc_dcim.py,
#   banc_moteur.py -- la permittivite effective d'une ligne tombe a 0,5 % de
#   ligne_mom, contre 26 % avec l'ancien noyau unique). Ce qui tient encore
#   mom_engine hors du chemin est ailleurs : son modele de PORT est une fente
#   en serie dans la piste, faute de courant vertical vers le plan de masse, et
#   il ne couple au mode guide que si la ligne est longue devant la longueur
#   d'onde. A 868 MHz sur quelques centimetres, elle ne l'est pas. Voir
#   A-FAIRE.md.
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
#   ligne ne voit qu'une suite de sections uniformes. En pratique on ne perdait
#   rien, puisque l'onde complete ne rendait aucun chiffre exploitable ; le
#   jour ou son modele de port sera repare, les deux se completeront.
#
#   mom_solver/ N'EST PAS DANS LE CHEMIN : rien ici n'en depend. Le moteur
#   2,5D evolue dans son dossier, avec ses propres bancs.
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

Le document d'entree, format « cao-sim-em-2 », est ce que produisent
`commun/simulation-em.js` et les deux adaptateurs qui s'en servent. Il est ecrit
EN MILLIMETRES, comme tout ce qui circule entre les outils du depot.

    format     "cao-sim-em-2"
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

Le resultat, format « cao-sim-em-resultat-3 » :

    f_centre        la frequence a laquelle les impedances sont donnees
    segments        un par objet envoye, DANS LE MEME ORDRE : {z0, eps_eff,
                    topo, longueur, retard, pertes_db, plans, avert}
    ligne           le bilan de la liaison entiere : {z0_min, z0_max,
                    z0_moyen, longueur, retard, pertes_db}
    discontinuites   {coudes, transitions} -- ce que le modele ne calcule pas
                    mais que la fiche peut NOMMER et ESTIMER
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

FORMAT = "cao-sim-em-2"
FORMAT_RESULTAT = "cao-sim-em-resultat-3"

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
    # Le melange d'epsilon est plus bas : il depend de la presence d'un masque,
    # qui n'est detecte qu'apres.

    # LOT 2 : le masque de soudure.
    # Une couche exterieure est couverte de vernis. Le masque est modélisé
    # par une Green à 3 régions (substrat + masque + air).
    # On le détecte : couche exterieure = la premiere ou la derniere couche
    # de cuivre de signal, sans cuivre au-dessus (ni dielectrique ni cuivre).
    masque_info = None
    est_exterieur = False
    if haut >= 0 and bas < 0:
        est_exterieur = True
        masque_info = _masque_exterieur(couches, indice, vers_le_bas=True)
    elif haut < 0 and bas >= 0:
        est_exterieur = True
        masque_info = _masque_exterieur(couches, indice, vers_le_bas=False)

    # La permittivite du modele couvert : le stratifie de la piste au plan ET
    # au-dessus, pondere par les deux epaisseurs. C'est le cas de la piste
    # ENTERREE, celle qui porte du stratifie par-dessus.
    #
    # UNE PISTE EXTERIEURE VERNIE N'EST PAS CE CAS. Le vernis qui la couvre est
    # deja porte par `masque_info`, que `solve_line` rend par la Green a trois
    # regions -- substrat, masque, air. Le melanger AUSSI dans l'epsilon du
    # substrat, c'est compter la meme resine DEUX FOIS, et du mauvais cote : la
    # moyenne fait BAISSER l'epsilon du stratifie, comme si le vernis etait
    # ENTRE la piste et le plan alors qu'il est au-dessus.
    #
    # MESURE. Un empilage qui DECLARE son masque de 25 um voyait er tomber de
    # 4,3 a 4,2444, Z0 monter de 0,56 % et eps_eff baisser de 1,12 % par rapport
    # au MEME empilage qui ne le declare pas et recoit le masque par defaut.
    # Declarer le masque rendait donc le resultat faux, et le taire le rendait
    # juste : exactement l'inverse de ce qu'on attend d'un empilage renseigne.
    er_couv = er
    if couv_mm > 0 and masque_info is None:
        er_haut = _entre_exterieur(couches, indice, haut >= 0)
        er_couv = (er * h_mm + er_haut * couv_mm) / (h_mm + couv_mm)

    # Couverture et masque nomment la MEME resine quand les deux sont la.
    # `solve_line` ignore deja `couverture` des qu'un masque est pose ; on la
    # met a zero pour que ni la geometrie ni la fiche ne la comptent en double.
    couv_mm = 0.0 if masque_info else couv_mm

    geo_micro = {"kind": "micro", "w": w, "t": t, "h": h_mm * 1e-3,
                 "couverture": couv_mm * 1e-3, "epsilon_r": er_couv,
                 "tan_delta": df,
                 "ecart_g": e_g * 1e-3, "ecart_d": e_d * 1e-3}
    if masque_info:
        geo_micro["masque"] = masque_info

    info_micro = {"topo": "micro", "ref": 1, "h": h_mm * 1e-3, "b": 0.0,
                  "er": er_couv, "tan_delta": df, "couverture": couv_mm * 1e-3,
                  "ecart_g": e_g, "ecart_d": e_d,
                  "plan_haut": couches[proche].get("name", "") if haut >= 0 else "",
                  "plan_bas": couches[proche].get("name", "") if bas >= 0 else "",
                  "dissym": 0.0, "exterieur": est_exterieur}
    if masque_info:
        info_micro["masque"] = {
            "epaisseur": masque_info["epaisseur"] * 1e3,
            "epsilon_r": masque_info["epsilon_r"],
        }

    return geo_micro, info_micro


def _masque_exterieur(couches, indice, vers_le_bas):
    """Le vernis qui couvre une piste exterieure, ou None s'il n'y en a pas.

    On marche vers la FACE de la carte en partant de la piste, et ce qu'on
    rencontre decide :

      - un conducteur          -> la piste n'est pas a la face : pas de vernis,
                                  et c'est la couverture qui parlera ;
      - un dielectrique nomme  -> c'est le masque declare : on prend SON
        « mask »                  epaisseur et SON epsilon ;
      - un dielectrique autre  -> du stratifie. La piste est ENTERREE sous du
                                  prepreg, pas vernie : pas de vernis, et la
                                  aussi c'est la couverture qui parlera ;
      - plus rien              -> la piste est nue a la face, et une piste nue
                                  a la face porte du vernis : 25 um a er 3,8,
                                  le repli d'usage.

    CE QUI ETAIT ECRIT ICI AVANT posait la question du MAUVAIS COTE : le test
    regardait `couches[indice - 1]` -- la couche du cote du PLAN -- pour decider
    ce qu'il y avait du cote de la FACE, et il y cherchait du cuivre la ou c'est
    du dielectrique qui compte. Consequence mesuree : une piste couverte de
    0,1 mm de prepreg recevait quand meme un vernis de 25 um par defaut, et son
    prepreg partait a la poubelle.
    """
    pas = 1 if vers_le_bas else -1
    i = indice + pas
    while 0 <= i < len(couches):
        c = couches[i]
        if c.get("type") == "copper":
            return None
        if c.get("type") == "dielectric":
            e = _nombre(c.get("thickness"))
            if e <= 0:
                i += pas
                continue
            if "mask" in (c.get("name") or "").lower():
                return {"epaisseur": e * 1e-3,
                        "epsilon_r": _nombre(c.get("epsilon_r"), 3.8)}
            return None            # du stratifie : piste enterree, pas vernie
        i += pas
    return {"epaisseur": 0.025 * 1e-3, "epsilon_r": 3.8}


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
    formats_acceptes = ["cao-sim-em-1", "cao-sim-em-2"]
    if doc.get("format") not in formats_acceptes:
        raise ErreurSimulation(
            "Format inattendu : « %s » au lieu de « %s »."
            % (doc.get("format") or "absent", " ou ".join(formats_acceptes)))

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
# Les discontinuités
# --------------------------------------------------------------------------
# LE MODELE NE LES PREND PAS, mais la fiche peut les NOMMER et les ESTIMER.
# C'est le lot 3a : signaler ce qui n'est pas modélisé est déjà de la valeur.
# ==========================================================================

# En dessous de cet angle, deux troncons sont colineaires et il n'y a pas de
# coude. C'est la RESOLUTION des coordonnees qui le fixe -- la page arrondit au
# millieme de millimetre --, et non un jugement sur ce qui merite d'etre
# modelise : un coude de 5 degres est bien un coude, et il est emis.
ANGLE_COUDE_MINIMAL = 0.1               # degres


def _coudes(objets):
    """Les coudes de la sélection : leur rang de tronçon et leur ANGLE SEUL.

    L'angle à chaque raccord est calculé à partir des vecteurs start→end de
    deux tronçons consécutifs. Rien d'autre n'est calculé ici : la capacité
    d'excès et l'inductance série demandent la hauteur au plan et l'epsilon
    du tronçon, que seule la section résolue connaît. Elles sont ajoutées
    plus bas par `tl.elements_coude`, qui est AUSSI ce que la cascade
    applique — une seule formule pour une seule grandeur.

    DEUX RACCORDS NE SONT PAS DES COUDES, et la version precedente en faisait
    quand meme (mesure sur une liaison TOP -> BOT : un coude de 0,0 degre,
    0 pH, 0 fF, affiche dans la fiche a cote du via) :

      · UN CHANGEMENT DE COUCHE. Deux troncons sur des couches differentes ne
        se raccordent pas dans un plan : ce qui les joint est un VIA, et c'est
        le modele de via qui s'applique. Un modele de coude planaire n'a rien
        a y faire, meme si les deux troncons font un angle vu de dessus ;
      · UN ANGLE NUL. Deux troncons colineaires n'ont pas de coude. Le seuil
        est celui de la RESOLUTION des coordonnees, pas un choix de
        modelisation : la page arrondit au millieme de millimetre, ce qui sur
        un troncon de 15 mm fait une incertitude angulaire de 0,004 degre. A
        0,1 degre on est dix fois au-dessus du bruit et tres en dessous de
        tout coude reel -- un coude de 5 degres reste emis, avec son
        cinquante-quatrieme de la valeur a angle droit.

    Rend une liste de dicts : {troncon, angle_deg}.
    """
    resultats = []
    for i in range(1, len(objets)):
        obj_prev = objets[i - 1]
        obj_curr = objets[i]

        # UN CHANGEMENT DE COUCHE N'EST PAS UN COUDE : c'est un via, et il a
        # son propre modele. `_transitions` s'en charge.
        couche_prev = int(_nombre(obj_prev.get("layer"), -1))
        couche_curr = int(_nombre(obj_curr.get("layer"), -1))
        if couche_prev >= 0 and couche_curr >= 0 and couche_prev != couche_curr:
            continue

        # Extraire les vecteurs directionnels
        def vecteur(obj):
            a = obj.get("start")
            b = obj.get("end")
            if not (isinstance(a, (list, tuple)) and isinstance(b, (list, tuple))
                    and len(a) >= 2 and len(b) >= 2):
                return None, None
            ax, ay = _nombre(a[0]), _nombre(a[1])
            bx, by = _nombre(b[0]), _nombre(b[1])
            # Le vecteur de la direction effective du tronçon
            dx = bx - ax
            dy = by - ay
            if not (abs(dx) > 1e-9 or abs(dy) > 1e-9):
                return None, None
            return dx, dy

        v1 = vecteur(obj_prev)
        v2 = vecteur(obj_curr)
        if v1[0] is None or v2[0] is None:
            continue

        dx1, dy1 = v1
        dx2, dy2 = v2

        # Normes
        n1 = math.hypot(dx1, dy1)
        n2 = math.hypot(dx2, dy2)
        if not (n1 > 1e-9 and n2 > 1e-9):
            continue

        # Cosinus de l'angle externe (celui qu'on voit sur la carte)
        cos_theta = (dx1 * dx2 + dy1 * dy2) / (n1 * n2)
        cos_theta = max(-1.0, min(1.0, cos_theta))
        angle_rad = math.acos(cos_theta)
        angle_deg = math.degrees(angle_rad)

        # L'ANGLE SEUL EST CALCULE ICI. La capacite d'exces et l'inductance
        # demandent la HAUTEUR AU PLAN et l'epsilon du troncon, que seule la
        # section resolue connait : elles sont ajoutees plus bas, par
        # `tl.elements_coude`, et ce sont EXACTEMENT celles que la cascade
        # applique. La version precedente en posait une troisieme ici -- une
        # formule lineaire en l'angle, sans hauteur au plan, donnee pour du
        # Gupta -- et la fiche affichait 21 fF la ou le modele en appliquait
        # 0,4 : deux chiffres pour la meme grandeur, cinquante fois l'un de
        # l'autre.
        if angle_deg < ANGLE_COUDE_MINIMAL:
            continue                      # colineaires : pas de coude

        resultats.append({
            "troncon": i,
            "angle_deg": round(angle_deg, 1),
        })

    return resultats


def _hauteur_via(couches, couche_depart, couche_arrivee):
    """La longueur PERCEE d'un via, en millimetres, lue dans l'empilage.

    ELLE N'A JAMAIS EU BESOIN D'ETRE SUPPOSEE, et c'est ce qui rendait
    l'ancien repli genant : l'empilage porte toutes les epaisseurs, et un via
    va d'une couche de cuivre a l'autre. On somme donc ce qu'il traverse,
    bornes COMPRISES -- le percage entre par le dessus du cuivre de depart et
    sort par le dessous du cuivre d'arrivee, c'est ce qu'un foret fait.

    CE QUE LE REPLI DONNAIT, ET DE COMBIEN IL SE TROMPAIT. « 0,2 mm par couche
    traversee » comptait en indices d'EMPILAGE, qui alternent cuivre et
    dielectrique : cela faisait 0,4 mm par couche de cuivre franchie, ce qui
    n'a de rapport avec rien. Sur l'empilage quatre couches ordinaire du banc,
    une liaison TOP -> BOT donnait 1,200 mm quand l'empilage en dit 1,340 :
    12 % d'erreur, que l'inductance de via emporte au premier ordre.
    """
    a = int(_nombre(couche_depart, -1))
    b = int(_nombre(couche_arrivee, -1))
    if a < 0 or b < 0:
        return 0.0
    if a > b:
        a, b = b, a
    total = 0.0
    for i in range(a, b + 1):
        if 0 <= i < len(couches):
            total += _nombre(couches[i].get("thickness"), 0.0)
    return round(total, 6)


def _cotes_via(obj, trans):
    """Les cotes du via d'une transition, EN MILLIMETRES, et d'ou elles viennent.

    LA HAUTEUR VIENT DE L'EMPILAGE, ET ELLE EST EXACTE -- voir `_hauteur_via`.
    `_transitions` l'y a deja mise ; on ne la suppose plus. La page peut la
    surcharger si elle en sait davantage, mais elle n'a pas a le faire.

    LE PERCAGE ET LA PASTILLE, EUX, DOIVENT VENIR DE LA PAGE, et les deux
    pages ne les envoient pas encore. Le modele tourne alors sur des replis --
    0,3 mm de percage, 2,5 fois cela en pastille --, reunis ICI, en un seul
    endroit, et la transition emporte `cotes_supposees` pour que la fiche
    puisse le dire : un chiffre suppose affiche comme un chiffre mesure est
    pire que pas de chiffre.
    """
    via = (obj or {}).get("via") or {}

    a_percage = via.get("drill_diameter") is not None
    a_pastille = via.get("pad_diameter") is not None
    d_percage = _nombre(via.get("drill_diameter"), 0.3)
    d_pastille = _nombre(via.get("pad_diameter"),
                         d_percage * 2.5 if not a_pastille else 0.0)

    # La hauteur : l'empilage d'abord, la page si elle la donne.
    h_empilage = _nombre(trans.get("hauteur_empilage"), 0.0)
    a_hauteur = via.get("height") is not None
    h_via = _nombre(via.get("height"), h_empilage)
    if not (h_via > 0):
        # Ni empilage exploitable ni page : dernier recours, et il se voit.
        sauts = abs(int(_nombre(trans.get("couche_arrivee"), 0))
                    - int(_nombre(trans.get("couche_depart"), 0))) or 1
        h_via = 0.2 * sauts
        a_hauteur = False
        h_empilage = 0.0

    trans["cotes_supposees"] = not (a_percage and a_pastille)
    trans["cotes"] = {
        "hauteur_mm": round(h_via, 4),
        "hauteur_source": ("page" if a_hauteur
                           else ("empilage" if h_empilage > 0 else "repli")),
        "percage_mm": round(d_percage, 4),
        "percage_source": "page" if a_percage else "repli",
        "pastille_mm": round(d_pastille, 4),
        "pastille_source": "page" if a_pastille else "repli",
    }
    return h_via, d_percage, d_pastille


def _transitions(objets, couches):
    """Les changements de couche le long de la sélection.

    Deux tronçons consécutifs sur des couches différentes forment une transition.
    Elle est nommée (« Conductor-4 → Conductor-1 au tronçon 7 ») et listée.

    Rend une liste de dicts : {troncon, couche_depart, couche_arrivee,
    nom_depart, nom_arrivee, est_via}.
    """
    resultats = []
    for i in range(1, len(objets)):
        obj_prev = objets[i - 1]
        obj_curr = objets[i]

        couche_prev = int(_nombre(obj_prev.get("layer"), -1))
        couche_curr = int(_nombre(obj_curr.get("layer"), -1))

        if couche_prev < 0 or couche_curr < 0:
            continue
        if couche_prev == couche_curr:
            continue

        # Noms des couches
        nom_prev = ""
        nom_curr = ""
        if 0 <= couche_prev < len(couches):
            nom_prev = couches[couche_prev].get("name", "Conductor-%d" % (couche_prev + 1))
        if 0 <= couche_curr < len(couches):
            nom_curr = couches[couche_curr].get("name", "Conductor-%d" % (couche_curr + 1))

        resultats.append({
            "troncon": i,
            "couche_depart": couche_prev,
            "couche_arrivee": couche_curr,
            "nom_depart": nom_prev,
            "nom_arrivee": nom_curr,
            "est_via": False,  # déterminé plus tard avec les vias réels
            # LA HAUTEUR SE LIT ICI, parce que c'est ici qu'on a l'empilage.
            # `_cotes_via` ne l'a pas, et c'est pour cela qu'elle la supposait.
            "hauteur_empilage": _hauteur_via(couches, couche_prev,
                                             couche_curr),
        })

    return resultats


def _ruptures(objets):
    """Combien de fois la suite cesse d'être un parcours continu.

    BUG CORRIGÉ (2026-08-28) : la version précédente ne comparait que les
    coordonnées XY. Or les deux bouts d'un VIA sont au MÊME XY sur deux couches
    différentes : la chaîne était déclarée continue et le via passait inaperçu.

    On compare maintenant les coordonnées ET la couche : deux tronçons au même
    XY sur des couches différentes ne sont pas un raccord — c'est un via.
    De même, deux tronçons sur la même couche mais sans contact XY sont une
    rupture, comme avant.

    BUG CORRIGÉ (2026-08-30) : le cas du via exigeait DEUX points de contact.
    Un via en fournit UN — la fin d'un tronçon et le début du suivant. Toute
    liaison changeant de couche était donc comptée comme rompue, et le panneau
    prévenait à tort d'une rupture devant un parcours continu. Un avertissement
    qui crie à tort finit par ne plus être lu : c'est ce qui rend ce défaut
    plus grave que son ampleur.
    """
    n = 0
    ruptures_detail = []
    precedent = None
    for i, obj in enumerate(objets):
        couche = int(_nombre(obj.get("layer"), -1))
        e = _extremites(obj)
        if e is None:
            continue                      # sans coordonnées, on ne juge pas
        courant = (e, couche)

        if precedent is not None:
            e_prev, couche_prev = precedent
            e_curr, _ = courant

            # Vérifier si les extrémités se touchent
            if couche_prev == couche:
                # Même couche : il faut un contact XY
                if not any(math.hypot(p[0] - q[0], p[1] - q[1])
                           <= TOLERANCE_RACCORD
                           for p in e_prev for q in e_curr):
                    n += 1
                    ruptures_detail.append({"type": "rupture_xy", "troncon": i})
            else:
                # COUCHE DIFFERENTE : UN SEUL POINT DE CONTACT SUFFIT, et c'est
                # la correction. La version precedente en exigeait DEUX, en
                # commentant « les deux bouts du via sont au meme XY ». Non :
                # un via joint la FIN d'un troncon au DEBUT du suivant, ce qui
                # fait UN point commun -- deux troncons qui en partageraient
                # deux seraient superposes, ce qui n'arrive pas. Toute liaison
                # passant par un via etait donc declaree ROMPUE, et le panneau
                # affichait « la selection n'est pas un parcours continu »
                # devant un parcours parfaitement continu. Mesure : liaison
                # TOP -> BOT de deux troncons colineaires, 1 raccord annonce
                # manquant, alors que le raccord EST le via.
                if not any(math.hypot(p[0] - q[0], p[1] - q[1])
                           <= TOLERANCE_RACCORD
                           for p in e_prev for q in e_curr):
                    n += 1
                    ruptures_detail.append({
                        "type": "rupture_via",
                        "troncon": i,
                        "couche_prev": couche_prev,
                        "couche_curr": couche,
                    })

        precedent = courant

    return n, ruptures_detail


# ==========================================================================
# La selection est-elle une chaine ?
# ==========================================================================
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

    ruptures, ruptures_detail = _ruptures(objets)
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

    # LOT 3a : voir et dire les discontinuités
    coudes = _coudes(objets)
    transitions = _transitions(objets, couches)

    # LES MODELES DE DISCONTINUITE VIVENT DANS ligne_mom.py, et nulle part
    # ailleurs. Ce fichier en portait trois copies -- une pour l'affichage, une
    # pour la cascade, une troisieme dans `_coudes` -- et elles ne donnaient
    # pas le meme chiffre. Il n'en reste aucune : `tl.elements_coude`,
    # `tl.inductance_via` et `tl.capacite_pastille` servent les deux usages, et
    # elles prennent des METRES.
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
                # LOT 2 : le masque de soudure s'il y en a un
                "masque": c["info"].get("masque"),
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

    # LOT 3b : construire les index de discontinuités par tronçon
    # Chaque coude ou transition insère sa matrice ABCD après le tronçon i
    coudes_par_troncon = {c["troncon"]: c for c in coudes}
    transitions_par_troncon = {t["troncon"]: t for t in transitions}

    freqs = np.linspace(analyse["f_debut"], analyse["f_fin"], analyse["points"])
    if freqs.size and np.min(np.abs(freqs - fc)) > 1e-6 * max(fc, 1.0):
        freqs = np.sort(np.append(freqs, fc))
    matrices = []
    for f in freqs:
        abcd = np.eye(2, dtype=complex)
        for i, (obj, seg) in enumerate(zip(objets, segments)):
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

            # LOT 3b : insérer les discontinuités après ce tronçon
            # 1. Un coude ? Shunt C
            if i in coudes_par_troncon:
                coude = coudes_par_troncon[i]
                # TOUT EN METRES, et la HAUTEUR AU PLAN avec : c'est le
                # parametre dominant du modele de Gupta, et il manquait.
                abcd = abcd @ tl.abcd_coude(seg["largeur"] * 1e-3,
                                            max(seg.get("h", 0.0), 1e-9) * 1e-3,
                                            seg.get("er", 4.3), float(f),
                                            coude["angle_deg"])

            # 2. Une transition de couche ? Via π L-C
            if i in transitions_par_troncon:
                trans = transitions_par_troncon[i]
                # Via : on prend les infos du via s'il est dans geometry, sinon estimer
                # Les vias envoyés par la page portent drill_diameter, pad_diameter
                h_via, d_percage, d_pastille = _cotes_via(obj, trans)
                abcd = abcd @ tl.abcd_via(h_via * 1e-3, d_percage * 1e-3,
                                          d_pastille * 1e-3,
                                          seg.get("er", 4.3), float(f))

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

    # LOT 3b : enrichir les discontinuités avec les valeurs modélisées
    # CE QUI EST AFFICHE EST CE QUI EST APPLIQUE. Les memes fonctions, les
    # memes entrees, et la phase que l'element vaut A LA FREQUENCE CENTRALE de
    # l'analyse -- pas a 5 GHz pose en dur, ce qu'ecrivait la version
    # precedente quelle que soit la bande demandee.
    omega_c = 2 * math.pi * fc
    for coude in coudes:
        i = coude["troncon"]
        if i >= len(segments):
            continue
        seg = segments[i]
        L, C = tl.elements_coude(seg.get("largeur", 0.0) * 1e-3,
                                 max(seg.get("h", 0.0), 1e-9) * 1e-3,
                                 seg.get("er", 4.3), coude["angle_deg"])
        z0 = seg.get("z0") or 50.0
        coude["modelise"] = {
            "type": "T_L_C_Gupta",
            "inductance_pH": round(L * 1e12, 2),
            "capacite_fF": round(C * 1e15, 2),
            # Ce que l'element pese, en degres de phase, a la frequence
            # centrale : c'est CE chiffre qui dit s'il faut s'en soucier.
            "phase_deg": round(math.degrees(omega_c * (L / z0 + C * z0)), 4),
        }

    for trans in transitions:
        i = trans["troncon"]
        if i >= len(segments):
            continue
        seg = segments[i]
        h_via, d_percage, d_pastille = _cotes_via(
            objets[i] if i < len(objets) else {}, trans)
        L = tl.inductance_via(h_via * 1e-3, d_percage * 1e-3)
        C = tl.capacite_pastille(d_pastille * 1e-3, h_via * 1e-3,
                                 seg.get("er", 4.3))
        z0 = seg.get("z0") or 50.0
        trans["modelise"] = {
            "type": "pi_L_C",
            "inductance_nH": round(L * 1e9, 3),
            "capacite_fF": round(C * 1e15, 3),
            "phase_deg": round(math.degrees(omega_c * (L / z0 + C * z0)), 4),
            "cotes_supposees": trans.get("cotes_supposees", True),
        }

    return {
        "format": FORMAT_RESULTAT,
        "carte": doc.get("carte") or "",
        "net": doc.get("net") or "",
        "reference_nets": refs,
        "f_centre": fc,
        "impedance_reference": z_ref,
        "segments": segments,
        "ligne": ligne,
        "discontinuites": {
            "coudes": coudes,
            "transitions": transitions,
        },
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
