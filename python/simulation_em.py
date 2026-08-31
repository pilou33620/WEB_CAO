#!/usr/bin/python3
# -*- coding: utf-8 -*-
# ==========================================
# VERSIONING
# Version: 3.3.0
# Date: 2026-08-31
# Explication: LA SCENE. Trois corrections d'un coup, et la premiere est celle
#   qui rendait les deux autres possibles.
#
#   1. UNE SECTION, PAS UNE SUITE DE PAIRES. La 3.2.0 resolvait un probleme a
#      deux conducteurs par voisine. Une piste avec deux voisines en donnait
#      donc DEUX, et chacun comptait le champ que la troisieme piste prend
#      deja : les deux couplages sortaient trop grands, et l'impedance de la
#      piste du milieu ne baissait pas alors qu'elle est encadree. Toutes les
#      voisines d'une meme piste entrent desormais dans la MEME matrice --
#      c'est ce que « N conducteurs » veut dire.
#
#   2. LA MASSE COPLANAIRE Y EST. La 3.2.0 jetait les deux ecarts au plan et
#      annoncait un chiffre majorant. C'etait une precaution inutile : les deux
#      pages sondent les PLANS sans voir les pistes, si bien que « gap_left »
#      est deja la distance de la selection au plan de gauche MEME quand une
#      voisine se trouve entre les deux. Le plan borde donc le GROUPE, et
#      l'ecart du groupe est celui de la selection moins le cuivre ajoute de ce
#      cote-la -- rien de plus a mesurer. Voir `_ecarts_masse_du_groupe`.
#
#      Et une piste du NET DE REFERENCE qui longe n'est pas une voisine : c'est
#      une PISTE DE GARDE, posee a zero volt dans la section, sans port. Mesure
#      sur une garde entre deux signaux a 0,45 mm : le NEXT tombe de 3,15 % a
#      0,96 %, et Z0 des signaux passe de 57,6 a 50,7 ohms -- ce qui se dit,
#      parce qu'on ne pose pas une garde sans revoir la largeur.
#
#   3. LES DEUX SENS DU BRUIT. « Ce que ma piste prend » et « ce qu'elle
#      envoie » ne sont pas la meme chose des que les deux pistes n'ont pas la
#      meme largeur : le bruit se compte en fraction de l'amplitude de
#      L'AGRESSEUR et se rapporte a ses termes propres. Les deux sortent de la
#      MEME matrice, sans rien resoudre de plus. Mesure sur une voisine quatre
#      fois plus large : 5,50 % recu contre 4,51 % emis, et le bruit avant
#      CHANGE DE SIGNE d'un sens a l'autre.
#
#   Z differentielle d'une paire prise dans un bus se lit par reduction exacte
#   -- les autres conducteurs tenus a la masse, `ligne_mom.sous_systeme`.
#
# Version: 3.2.0
# Date: 2026-08-31
# Explication: LE COUPLAGE ENTRE PISTES PARALLELES -- Z DIFFERENTIELLE ET
#   DIAPHONIE. `ligne_mom` 2.3.0 sait resoudre N conducteurs ; ce qui manquait
#   ici est l'APPARIEMENT : quelles pistes se longent, sur quelle longueur, a
#   quel ecart. C'est de la geometrie plane, et elle est ecrite UNE FOIS ici
#   plutot que deux fois dans les deux pages -- l'editeur et la visionneuse
#   doivent rendre le meme chiffre sur la meme carte.
#
#   La page apporte ce qu'elle seule connait : `voisinage`, les troncons de
#   piste qui passent a portee de la selection, au meme format que la
#   geometrie. L'agresseur n'est jamais dans la selection -- c'est ce qui fait
#   qu'aucune version precedente ne pouvait le voir.
#
#   `_couplage` groupe les longements par (couche, net, net voisin), cumule les
#   longueurs, pondere les ecarts, resout une section couplee par geometrie
#   distincte et rend pour chaque couple : Z_diff, Z_commune, les modes
#   pair/impair, les coefficients de couplage, NEXT et FEXT. Les deux onglets
#   SI du panneau lisent la meme liste.
#
#   Le temps de montee vient de la page ou, a defaut, de la regle du genou
#   (t_r = 0,35 / f_max) : il ne change ni [C] ni [L], il decide de la
#   saturation du NEXT et de l'amplitude du FEXT.
# Fonctions ajoutees : _paire_nommee, _axe, _boite, _longement,
#   _scenes_paralleles, _poser_section, _ecarts_masse_du_groupe,
#   _fiche_longement, _temps_montee, _couplage
# Fonctions modifiees : simuler (rend « couplage »), doc_valide (temps_montee)
#
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

Le document d'entree, format « cao-sim-em-3 », est ce que produisent
`commun/simulation-em.js` et les deux adaptateurs qui s'en servent. Il est ecrit
EN MILLIMETRES, comme tout ce qui circule entre les outils du depot.

    format     "cao-sim-em-3"
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
    vias        LES VIAS DE LA SELECTION, sans ordre -- nouveaute du format
                « -3 ». Chacun porte x, y, layer_from, layer_to, son percage,
                sa pastille, et « retours », les vias de masse autour de lui.
                Ils sont analyses INDEPENDAMMENT de la chaine : sur un net qui
                se ramifie il n'y a pas de parcours, donc pas de transition,
                mais les vias sont la et leur chemin de retour a un sens. Ceux
                que la chaine a deja pris sont ecartes, pour qu'un meme via ne
                soit pas chiffre deux fois. Voir `_vias_hors_chaine`.
    reference_nets  les nets que la page tient pour de la masse. Le calcul ne
               s'en sert pas -- l'ecart est deja mesure --, mais le resultat
               doit dire sous quelle hypothese il a ete obtenu
    ports      [{id, position, layer, impedance}] -- l'impedance de reference
    analyse    {f_debut, f_fin, points, f_centre}   (Hz)

Le resultat, format « cao-sim-em-resultat-4 » :

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

FORMAT = "cao-sim-em-3"
FORMAT_RESULTAT = "cao-sim-em-resultat-5"

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
    formats_acceptes = ["cao-sim-em-1", "cao-sim-em-2", "cao-sim-em-3"]
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

    # LE TEMPS DE MONTEE, s'il est saisi. Il ne touche a rien de la ligne --
    # ni impedance, ni cascade -- et ne sert qu'au couplage : c'est lui qui
    # decide si le NEXT sature et ce que vaut le FEXT. Absent, `_temps_montee`
    # le deduit du haut de la bande.
    t_r = _nombre(a.get("temps_montee"), 0.0)
    if t_r < 0:
        t_r = 0.0
        ajuste.append("Temps de montée négatif : ignoré, il est déduit de la"
                      " bande.")

    return couches, objets, {"f_debut": f1, "f_fin": f2, "points": points,
                             "f_centre": fc, "temps_montee": t_r,
                             "ajuste": ajuste}


# CET AVERTISSEMENT A ETE FAUX DEUX FOIS, ET DANS LE MAUVAIS SENS. Il
# annoncait comme absents les coudes, les vias et les moignons alors que les
# trois sont desormais cascades. Un avertissement qui se trompe en se
# NOIRCISSANT est presque aussi nuisible qu'un qui flatte : on cesse de le
# lire, et il emporte avec lui ceux qui comptent. Ce qui reste vraiment hors
# modele est enumere ici, et rien d'autre.
AVERTISSEMENTS_MODELE = [
    "Modèle de ligne : la piste est vue comme une suite de sections droites"
    " uniformes, avec ses coudes, ses vias et leurs moignons cascadés en"
    " éléments localisés. N'y sont pas : le rayonnement, et la cavité entre"
    " plans hors du chemin de retour chiffré au raccord.",
    "Le couplage aux pistes voisines est calculé À PART — Z différentielle et"
    " diaphonie, section à deux conducteurs — et n'entre PAS dans la cascade :"
    " le Z₀ et les paramètres S ci-dessus sont ceux de la piste prise seule."
    " Une piste couplée n'a pas une impédance mais deux, une par mode.",
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
    # TROIS PROVENANCES, ET NON DEUX. « presente » ne voulait pas dire « lue ».
    # La visionneuse envoyait `percage x 2,5` faute de pastille connue --
    # exactement le repli applique ici --, si bien que le chiffre etait le meme
    # mais arrivait DECLARE PAR LA PAGE : `pastille_source` passait de
    # « repli » a « page » et `cotes_supposees` a faux. Le resultat ne changeait
    # pas d'un micron ; ce qui changeait, c'est que la fiche cessait de
    # prevenir. Une supposition qui se presente comme une mesure est pire
    # qu'une supposition.
    #
    #   page      la cote est lue dans le fichier de conception
    #   supposee  la page l'envoie EN DISANT qu'elle l'a devinee -- un padstack
    #             absent dont `ipc2581_parser.py` fabrique la pastille a
    #             « percage + 0,3 mm », un percage deduit de deux pastilles
    #             superposees
    #   repli     la page n'a rien envoye, et c'est ce fichier qui choisit
    sup_percage = bool(via.get("drill_diameter_supposee"))
    sup_pastille = bool(via.get("pad_diameter_supposee"))
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

    # UNE COTE DEVINEE COMPTE COMME SUPPOSEE, qu'elle vienne de la page ou
    # d'ici : c'est le meme doute, et la fiche doit le porter dans les deux cas.
    trans["cotes_supposees"] = not (a_percage and not sup_percage
                                    and a_pastille and not sup_pastille)
    trans["cotes"] = {
        "hauteur_mm": round(h_via, 4),
        "hauteur_source": ("page" if a_hauteur
                           else ("empilage" if h_empilage > 0 else "repli")),
        "percage_mm": round(d_percage, 4),
        "percage_source": (("supposee" if sup_percage else "page")
                           if a_percage else "repli"),
        "pastille_mm": round(d_pastille, 4),
        "pastille_source": (("supposee" if sup_pastille else "page")
                            if a_pastille else "repli"),
    }
    return h_via, d_percage, d_pastille


# ==========================================================================
# LE CHEMIN DE RETOUR DU COURANT
# --------------------------------------------------------------------------
# CE QUE LE MODELE DE VIA NE DISAIT PAS. Un via etait chiffre par une
# inductance PARTIELLE PROPRE -- celle d'un conducteur seul, sans dire par ou le
# courant revient. Deux cartes identiques a ceci pres que l'une a son via de
# masse a 0,4 mm et l'autre a 3 mm sortaient donc le meme |S11|, alors qu'elles
# different d'un facteur deux sur l'inductance qui compte. Le placement du via
# de retour est justement la decision que l'outil devrait eclairer.
#
# LES TROIS CHOSES QU'ON REGARDE ICI, dans l'ordre de ce qu'elles coutent :
#
#   1. LA REFERENCE CHANGE-T-ELLE ? Sur un empilage TOP/GND/PWR/BOT, une piste
#      sur TOP se refere a GND et la meme piste sur BOT se refere a PWR. Le
#      courant de retour doit changer de plan, et AUCUN VIA DE MASSE NE PEUT LE
#      FAIRE : un via de masse joint du GND a du GND. Le retour passe alors par
#      la cavite entre plans et ses condensateurs de decouplage, que ce modele
#      ne represente pas. C'est le defaut le plus grave, il est invisible sur le
#      dessin, et il coute jusqu'a 7 dB de |S11| a 3 GHz -- toujours en
#      flattant. On le NOMME.
#
#   2. Y A-T-IL UN RETOUR, ET OU ? Les vias de masse voisins forment la boucle.
#      Leur nombre et leur position donnent l'inductance reelle.
#
#   3. LES TROIS SONT-ILS PRIS, OU SEULEMENT LE PLUS PROCHE ? Les trois. Voir
#      `tl.inductance_boucle_vias` : la repartition du courant entre eux se
#      RESOUT, elle ne se postule pas, et trois vias a 0,6 mm ne divisent pas
#      l'inductance par trois -- leur mutuelle les en empeche. Ne garder que le
#      plus proche surestime de 31 % sur le cas a trois vias du banc.
# ==========================================================================

# L'ecart radial suppose entre une pastille et le bord de l'antipad, en
# millimetres, quand la page n'envoie pas le diametre. C'est la valeur courante
# d'une regle d'isolation cuivre/via ; elle est SUPPOSEE, et la fiche le dit.
ANTIPAD_ECART_REPLI = 0.25

# Les pastilles non fonctionnelles sont supposees RETIREES a defaut
# d'information. C'est le reglage courant des fondeurs, et c'est aussi celui qui
# SOUS-ESTIME la capacite : le supposer, c'est se tromper du cote qu'il faut
# annoncer plutot que subir.
PASTILLES_INTERNES_REPLI = False


def _z_empilage(couches):
    """Les cotes du dessus de chaque couche, en millimetres, depuis le dessus.

    `out[i]` est le dessus de la couche `i`, `out[i+1]` son dessous. Un via qui
    va de la couche `a` a la couche `b` occupe donc [out[a], out[b+1]] -- et sa
    longueur est exactement ce que `_hauteur_via` somme, par construction.
    """
    z = 0.0
    out = []
    for c in couches:
        out.append(round(z, 6))
        z += _nombre(c.get("thickness"), 0.0)
    out.append(round(z, 6))
    return out


def _plans_de_reference(seg):
    """Les noms des plans qui referencent un troncon. Un pour un microruban,
    deux pour une triplaque, aucun quand le troncon n'a pas ete calcule."""
    noms = set()
    for cle in ("plan_haut", "plan_bas"):
        nom = (seg or {}).get(cle) or ""
        if nom:
            noms.add(nom)
    return noms


def _plans_de_couche(couches, indice):
    """Les plans qui referencent une couche de cuivre, par leur nom.

    MEME BALAYAGE QUE `section_de_couche`, et il doit le rester : le plan le
    plus proche au-dessus, le plus proche au-dessous. La difference est qu'ici
    on n'a PAS de troncon resolu -- on part de la seule couche. C'est ce qui
    permet d'analyser le retour d'un via qui n'appartient a aucune chaine.
    """
    noms = set()
    if not (0 <= int(indice) < len(couches)):
        return noms
    indice = int(indice)
    for k in range(indice - 1, -1, -1):
        c = couches[k]
        if c.get("type") == "copper" and c.get("role") == "plane":
            noms.add(c.get("name", ""))
            break
    for k in range(indice + 1, len(couches)):
        c = couches[k]
        if c.get("type") == "copper" and c.get("role") == "plane":
            noms.add(c.get("name", ""))
            break
    return set(n for n in noms if n)


def _plans_traverses(couches, couche_a, couche_b, net_via):
    """Les plans qu'un via traverse SANS LES TOUCHER -- un antipad chacun.

    Un plan dont le net est celui du via n'est pas traverse : il y est
    RACCORDE, et il n'y a pas d'antipad. C'est la difference entre un via de
    signal et un via de masse, et c'est le net qui la porte.
    """
    lo, hi = sorted((int(couche_a), int(couche_b)))
    out = []
    for i in range(lo + 1, hi):
        if not (0 <= i < len(couches)):
            continue
        c = couches[i]
        if c.get("type") != "copper" or c.get("role") != "plane":
            continue
        if net_via and (c.get("net") or "") == net_via:
            continue
        out.append({"indice": i,
                    "nom": c.get("name", ""),
                    "epaisseur": _nombre(c.get("thickness"), 0.035)})
    return out


def _net_du_plan(couches, nom):
    """Le net du plan qui porte ce nom, ou "" quand l'empilage ne le dit pas."""
    for c in couches:
        if c.get("type") == "copper" and (c.get("name") or "") == nom:
            return str(c.get("net") or "")
    return ""


def _plans_ont_un_net(couches):
    """L'empilage declare-t-il le net de ses plans ?

    C'EST LA CONDITION DU TEST QUI COMPTE. Savoir si un via de masse rejoint le
    plan d'arrivee demande de connaitre le net de ce plan. L'editeur l'envoie ;
    un empilage plus ancien, ou une source qui ne le porte pas, ne l'envoie pas.
    Sans lui on ne peut pas distinguer un plan de masse d'un plan
    d'alimentation -- et c'est justement cette distinction qui fait la
    difference entre une carte correcte et le defaut grave.

    ON NE CHOISIT NI LE SILENCE NI LE REFUS. Refuser tous les vias de retour
    rendrait la mesure impossible sur ces empilages ; les accepter sans le dire
    ferait passer le cas GND/PWR pour un cas sain. On accepte donc, et
    `plans_incertains` le dit jusque dans la fiche.
    """
    for c in couches:
        if (c.get("type") == "copper" and c.get("role") == "plane"
                and str(c.get("net") or "").strip()):
            return True
    return False


def _plans_touches(couches, couche_a, couche_b, net, verifier_net=True):
    """Les noms des plans de role « plan » qu'un via de `net` RACCORDE.

    C'est ce qui decide si un via de masse referme la boucle : il faut qu'il
    touche un plan du cote depart ET un plan du cote arrivee.

    `verifier_net` a faux -- empilage sans nets de plan declares --, tout plan
    dans la portee compte. Voir `_plans_ont_un_net`.
    """
    lo, hi = sorted((int(couche_a), int(couche_b)))
    noms = set()
    for i in range(lo, hi + 1):
        if not (0 <= i < len(couches)):
            continue
        c = couches[i]
        if c.get("type") != "copper" or c.get("role") != "plane":
            continue
        if verifier_net and net and (c.get("net") or "") != net:
            continue
        nom = c.get("name") or ""
        if nom:
            noms.add(nom)
    return noms


def _analyse_retour(trans, via, couches, segments, z_bornes, refs_nets,
                    refs_av=None, refs_ap=None):
    """Le chemin de retour d'une transition : ce qu'on en sait, et ce qu'on ne
    peut pas en savoir. Remplit et rend `trans["retour"]`.

    LES DEUX QUESTIONS SONT SEPAREES, ET ELLES DOIVENT L'ETRE. « La reference
    change-t-elle ? » est une propriete de l'EMPILAGE ; « un via la rejoint-il ?
    » est une propriete du ROUTAGE. Une reference qui change et qu'un via
    rejoint est un cas ordinaire, bien modelise. Une reference qui change sans
    que rien ne la rejoigne est le defaut grave. Les confondre sous un seul
    drapeau rendrait l'avertissement inutilisable : il crierait sur le cas
    ordinaire, et on cesserait de le lire.
    """
    # LES PLANS DE REFERENCE PEUVENT VENIR D'AILLEURS QUE DE LA CHAINE, et
    # c'est ce qui libere l'analyse du retour. Par defaut ils se lisent dans
    # les deux troncons qui encadrent la transition -- le cas d'un parcours.
    # Un via qui n'appartient a aucun parcours -- celui d'un bus qui dessert
    # trois boitiers -- n'a pas de troncons a encadrer : l'appelant lit alors
    # les plans dans l'EMPILAGE, par `_plans_de_couche`, et les passe ici. Le
    # reste du raisonnement est identique, parce qu'il ne depend que des plans.
    i = int(trans["troncon"])
    seg_av = segments[i - 1] if 0 < i <= len(segments) else {}
    seg_ap = segments[i] if 0 <= i < len(segments) else {}
    if refs_av is None:
        refs_av = _plans_de_reference(seg_av)
    if refs_ap is None:
        refs_ap = _plans_de_reference(seg_ap)

    a = int(_nombre(trans.get("couche_depart"), 0))
    b = int(_nombre(trans.get("couche_arrivee"), 0))
    lo, hi = sorted((a, b))
    z1 = z_bornes[lo] if lo < len(z_bornes) else 0.0
    z2 = z_bornes[hi + 1] if hi + 1 < len(z_bornes) else z1

    # DEUX PLANS DE NOMS DIFFERENTS NE SONT PAS DEUX PLANS DE NETS DIFFERENTS,
    # et tout le verdict tient a cette distinction. Sur une carte quatre
    # couches, une piste sur TOP se refere au plan interne du haut et la meme
    # piste sur BOT au plan interne du bas : les NOMS different toujours. Si
    # les deux sont de la masse, un via de masse referme la boucle et c'est le
    # cas ordinaire. S'ils sont GND et PWR, RIEN ne peut la refermer et c'est
    # le defaut grave. Les confondre -- ce que faisait la premiere version --
    # revient a crier au defaut grave sur toute carte quatre couches dont
    # l'empilage ne nomme pas ses nets. C'est ce qui est arrive.
    #
    # TROIS ETATS, DONC, ET PAS DEUX :
    #   · `plan_change` faux            -> meme plan des deux cotes, rien a dire ;
    #   · nets connus et DIFFERENTS     -> defaut grave, aucun via n'y peut rien ;
    #   · nets connus et IDENTIQUES     -> cas ordinaire, un via de masse suffit ;
    #   · nets INCONNUS                 -> on ne sait pas, et on le dit.
    plan_change = bool(refs_av and refs_ap and not (refs_av & refs_ap))
    nets_av = set(n for n in (_net_du_plan(couches, x) for x in refs_av) if n)
    nets_ap = set(n for n in (_net_du_plan(couches, x) for x in refs_ap) if n)
    if not plan_change:
        nets_differents = False
    elif nets_av and nets_ap:
        nets_differents = not (nets_av & nets_ap)
    else:
        nets_differents = None            # l'empilage ne declare pas les nets

    retour = {
        "plans_depart": sorted(refs_av),
        "plans_arrivee": sorted(refs_ap),
        "nets_depart": sorted(nets_av),
        "nets_arrivee": sorted(nets_ap),
        # Le PLAN change : c'est une propriete des noms, toujours calculable.
        "plan_change": plan_change,
        # Les NETS different : vrai, faux, ou None quand on ne peut pas le dire.
        "nets_differents": nets_differents,
        # `reference_change` reste le nom du DEFAUT GRAVE -- un changement que
        # rien ne peut rejoindre --, et il exige desormais la certitude.
        "reference_change": bool(plan_change and nets_differents is True),
        "vias": [],
        "trouves": 0,
        "retenus": 0,
        "raccorde": False,
        "source": "self",
        # Les nets des plans ne sont pas declares : le test « ce via rejoint-il
        # le plan d'arrivee ? » ne peut pas se faire, et la fiche doit le dire.
        "plans_incertains": not _plans_ont_un_net(couches),
    }

    # OU EST CE VIA. La fiche disait deja quels vias de masse l'entourent et a
    # quelle distance, mais jamais son propre point : de quoi tracer un
    # CHEVELU, il ne manquait que l'origine des traits. Sans elle, une page qui
    # veut dessiner ce que le modele a retenu doit retrouver la position par un
    # autre chemin -- et deux chemins pour une meme grandeur finissent toujours
    # par en donner deux valeurs. On la rend donc ici, avec le reste.
    x_via = _nombre((via or {}).get("x"), None)
    y_via = _nombre((via or {}).get("y"), None)
    if x_via is not None and y_via is not None:
        retour["x"] = round(x_via, 4)
        retour["y"] = round(y_via, 4)

    bruts = (via or {}).get("retours")
    if bruts is None:
        retour["source"] = "absent"
        retour["raison"] = ("la page n'envoie pas les vias de masse voisins :"
                            " l'inductance est celle d'un conducteur seul")
        trans["retour"] = retour
        return retour

    x0 = _nombre((via or {}).get("x"), None)
    y0 = _nombre((via or {}).get("y"), None)
    if x0 is None or y0 is None:
        retour["source"] = "absent"
        retour["raison"] = ("la page envoie des vias de retour sans donner la"
                            " position du via de signal")
        trans["retour"] = retour
        return retour

    retour["trouves"] = len(bruts)
    retenus = []
    for v in bruts:
        vx = _nombre(v.get("x"), 0.0)
        vy = _nombre(v.get("y"), 0.0)
        dist = math.hypot(vx - x0, vy - y0)
        va = int(_nombre(v.get("layer_from"), 0))
        vb = int(_nombre(v.get("layer_to"), 0))
        vlo, vhi = sorted((va, vb))
        vz1 = z_bornes[vlo] if vlo < len(z_bornes) else 0.0
        vz2 = z_bornes[vhi + 1] if vhi + 1 < len(z_bornes) else vz1
        net = str(v.get("net") or "")
        touche = _plans_touches(couches, va, vb, net,
                                not retour["plans_incertains"])

        fiche = {"x": round(vx, 4), "y": round(vy, 4),
                 "distance_mm": round(dist, 4),
                 "net": net,
                 "percage_mm": round(_nombre(v.get("drill_diameter"), 0.3), 4),
                 "plans": sorted(touche),
                 "part": 0.0, "retenu": False, "raison": ""}

        # 1. Est-ce bien de la masse ? Un via d'un autre signal ne porte pas le
        #    retour, meme s'il est a cote.
        if refs_nets and net and net not in refs_nets:
            fiche["raison"] = "net « %s » : ce n'est pas une référence" % net
        # 2. Referme-t-il la hauteur ? Un via borgne qui ne couvre qu'une partie
        #    ne referme pas le courant -- voir `tl.inductance_boucle_vias`.
        elif vz1 > z1 + 1e-9 or vz2 < z2 - 1e-9:
            fiche["raison"] = ("ne couvre pas la hauteur du via de signal"
                               " (%.3f-%.3f mm contre %.3f-%.3f)"
                               % (vz1, vz2, z1, z2))
        # 3. Rejoint-il les DEUX plans de reference ? C'est ici que le cas
        #    GND -> PWR tombe, et il doit tomber en le disant.
        elif refs_av and not (touche & refs_av):
            fiche["raison"] = ("ne rejoint pas %s, le plan de départ"
                               % " / ".join(sorted(refs_av)))
        elif refs_ap and not (touche & refs_ap):
            fiche["raison"] = ("ne rejoint pas %s, le plan d'arrivée"
                               % " / ".join(sorted(refs_ap)))
        else:
            fiche["retenu"] = True
            # LA PORTEE PEUT ETRE SUPPOSEE, ET ALORS TOUT LE RESTE L'EST.
            # L'IPC-2581 declare la position, le diametre et le net d'un
            # percage, mais PAS ses couches : rien n'y distingue un via
            # traversant d'un via enterre. Un via enterre pris pour traversant
            # rend une inductance trop PETITE de pres de vingt pour cent, donc
            # flatteuse. On accepte -- refuser rendrait la visionneuse aveugle
            # -- et on le porte jusqu'a la fiche.
            if v.get("portee_supposee"):
                fiche["portee_supposee"] = True
                retour["portee_supposee"] = True
            retenus.append((fiche, v, vz1, vz2))
        retour["vias"].append(fiche)

    retour["retenus"] = len(retenus)
    retour["raccorde"] = bool(retenus)
    retour["vias"].sort(key=lambda f: f["distance_mm"])
    if not retenus:
        retour["raison"] = (
            "aucun via de masse ne referme la boucle : l'inductance rendue est"
            " celle d'un conducteur seul, et elle ne dépend pas du routage")
    trans["retour"] = retour
    return retour


def _inductance_transition(trans, via, couches, segments, z_bornes, refs_nets,
                           h_via, d_percage, refs_av=None, refs_ap=None):
    """L'inductance de la transition, en henrys, et d'ou elle vient.

    Rend (L, source) : « boucle » quand des vias de retour la referment,
    « self » quand rien ne la referme.

    LE REPLI EST UN PLANCHER, ET IL EST NOMME COMME TEL. Sans retour identifie,
    il n'y a pas d'inductance de boucle a rendre : le courant revient quand
    meme, mais par un chemin qu'on ne connait pas -- le cuivre des plans, plus
    loin. On rend donc la SELF PARTIELLE, qui est la valeur qu'aurait la boucle
    si le retour etait colle au via : c'est une BORNE INFERIEURE, la vraie
    valeur est plus grande, et la fiche doit le dire ainsi plutot que d'annoncer
    un chiffre.

    ET C'EST LA MEME FORMULE QUE CELLE DU CHEVELU. `tl.inductance_via` --
    (mu0 h/2pi)(ln(4h/d)+1) -- est une regle de pouce des manuels qui contient
    un retour implicite, jamais dit, place nulle part ; elle vaut ici pres du
    double de la self partielle. La garder ici pendant que l'editeur affiche la
    self de Grover, c'etait deux chiffres pour une meme grandeur, dans deux
    endroits qu'on lit l'un apres l'autre.
    """
    retour = _analyse_retour(trans, via, couches, segments, z_bornes, refs_nets,
                             refs_av=refs_av, refs_ap=refs_ap)
    retenus = [f for f in retour["vias"] if f["retenu"]]
    if not retenus:
        return (tl.inductance_partielle_propre(0.0, h_via * 1e-3,
                                               d_percage * 1e-3 / 2.0),
                "self")

    a = int(_nombre(trans.get("couche_depart"), 0))
    b = int(_nombre(trans.get("couche_arrivee"), 0))
    lo, hi = sorted((a, b))
    z1 = (z_bornes[lo] if lo < len(z_bornes) else 0.0) * 1e-3
    z2 = (z_bornes[hi + 1] if hi + 1 < len(z_bornes) else 0.0) * 1e-3
    x0 = _nombre((via or {}).get("x"), 0.0)
    y0 = _nombre((via or {}).get("y"), 0.0)

    signal = {"x": x0 * 1e-3, "y": y0 * 1e-3,
              "z1": z1, "z2": z2, "rayon": d_percage * 1e-3 / 2.0}
    liste = [{"x": f["x"] * 1e-3, "y": f["y"] * 1e-3,
              "z1": z1, "z2": z2,
              "rayon": max(f["percage_mm"], 1e-3) * 1e-3 / 2.0}
             for f in retenus]
    try:
        l_boucle, parts = tl.inductance_boucle_vias(signal, liste)
    except ValueError as exc:                              # noqa: BLE001
        # Le refus de `inductance_boucle_vias` ne doit pas passer en silence :
        # il veut dire que le filtre ci-dessus a laisse passer quelque chose.
        retour["raison"] = str(exc)
        retour["raccorde"] = False
        for f in retenus:
            f["retenu"] = False
        retour["retenus"] = 0
        return (tl.inductance_partielle_propre(0.0, h_via * 1e-3,
                                               d_percage * 1e-3 / 2.0),
                "self")

    for f, part in zip(retenus, parts):
        f["part"] = round(part, 4)
    return l_boucle, "boucle"


def _capacite_transition(trans, via, couches, segments, seg_av, seg_ap,
                         d_percage, d_pastille, h_via):
    """La capacite de la transition, en farads, et son detail.

    LES DEUX PASTILLES D'EXTREMITE SE COMPTENT A LA DISTANCE DE LEUR PLAN, et
    non a la hauteur du via : c'est `seg["h"]`, que le troncon porte deja. Sur
    un empilage quatre couches, la difference vaut un facteur sept.
    """
    a = int(_nombre(trans.get("couche_depart"), 0))
    b = int(_nombre(trans.get("couche_arrivee"), 0))
    net = str((via or {}).get("net") or "")
    traverses = _plans_traverses(couches, a, b, net)

    a_antipad = (via or {}).get("antipad_diameter") is not None
    d_antipad = _nombre((via or {}).get("antipad_diameter"),
                        d_pastille + 2.0 * ANTIPAD_ECART_REPLI)
    a_internes = (via or {}).get("pastilles_internes") is not None
    internes = bool((via or {}).get("pastilles_internes",
                                    PASTILLES_INTERNES_REPLI))

    er = _nombre(seg_ap.get("er"), _nombre(seg_av.get("er"), 4.3))
    c_tot, detail = tl.capacite_via_complete(
        d_percage * 1e-3, d_pastille * 1e-3, d_antipad * 1e-3, er,
        plans_traverses=[t["epaisseur"] * 1e-3 for t in traverses],
        h_pastille_depart=_nombre(seg_av.get("h"), 0.0) * 1e-3,
        h_pastille_arrivee=_nombre(seg_ap.get("h"), 0.0) * 1e-3,
        pastilles_internes=internes)

    cotes = trans.setdefault("cotes", {})
    cotes["antipad_mm"] = round(d_antipad, 4)
    cotes["antipad_source"] = "page" if a_antipad else "repli"
    cotes["pastilles_internes"] = internes
    cotes["pastilles_internes_source"] = "page" if a_internes else "repli"
    trans["capacite"] = {
        "totale_fF": round(c_tot * 1e15, 3),
        "antipad_fF": round(detail["antipad"] * 1e15, 3),
        "pastille_depart_fF": round(detail["pastille_depart"] * 1e15, 3),
        "pastille_arrivee_fF": round(detail["pastille_arrivee"] * 1e15, 3),
        "plans_traverses": [t["nom"] for t in traverses],
    }
    return c_tot


def _impedance_traversee(param, freq):
    """L'impedance serie de la traversee entre plans a une frequence. EN SI.

    `param` a None quand la reference ne change pas : il n'y a alors rien a
    traverser, et zero est le bon chiffre.
    """
    if not param:
        return 0.0 + 0.0j
    return tl.impedance_traversee_plans(
        freq, param["l_cavite"], param["c_plans"],
        l_pont=param["l_pont"], esr_pont=param["esr_pont"],
        c_pont=param["c_pont"])


def _modele_transition(trans, objets, segments, couches, z_bornes, refs_nets,
                       omega_c, fc):
    """Le modele electrique complet d'une transition, calcule UNE FOIS.

    POURQUOI UNE SEULE FOIS. Les valeurs affichees et les valeurs cascadees
    etaient calculees separement, chacune par son propre appel aux memes
    fonctions. Tant que les deux appels sont identiques cela marche ; le jour ou
    l'un des deux prend un argument de plus -- et c'est ce que les paliers de
    retour et d'antipad viennent de faire --, la fiche annonce un chiffre et la
    courbe en porte un autre. On calcule donc ici, et les deux lisent.

    Remplit `trans["cotes"]`, `trans["retour"]`, `trans["capacite"]` et
    `trans["modelise"]`, et rend (L, C) en henrys et farads.
    """
    i = int(trans["troncon"])
    obj = objets[i] if i < len(objets) else {}
    seg_av = segments[i - 1] if 0 < i <= len(segments) else {}
    seg_ap = segments[i] if 0 <= i < len(segments) else {}
    via = (obj or {}).get("via") or {}

    h_via, d_percage, d_pastille = _cotes_via(obj, trans)
    l_via, source = _inductance_transition(trans, via, couches, segments,
                                           z_bornes, refs_nets,
                                           h_via, d_percage)
    c_via = _capacite_transition(trans, via, couches, segments, seg_av, seg_ap,
                                 d_percage, d_pastille, h_via)
    d_antipad = _nombre((trans.get("cotes") or {}).get("antipad_mm"),
                        d_pastille + 2.0 * ANTIPAD_ECART_REPLI)

    # PALIER 4 : LE RETOUR QUI CHANGE DE PLAN A UN PRIX, ET ON LE CHIFFRE.
    # L'inductance de la cavite est EN SERIE avec celle du via : ce sont deux
    # boucles distinctes -- celle du barreau avec ses retours, celle du plan du
    # haut avec le plan du bas par le pont. Leur mutuelle est negligee ; elles
    # sont dans des plans differents et se recoupent peu, mais c'est une
    # approximation et elle est dite.
    # LA CAVITE NE SE TRAVERSE QUE SI LES DEUX PLANS SONT DE NETS DIFFERENTS.
    # Entre deux plans de MASSE, le retour passe par le premier via de masse
    # venu -- c'est le palier de la boucle qui s'en charge, et il l'a deja fait.
    # Y ajouter une cavite compterait deux fois le meme chemin, et sur une
    # carte bien cousue cela vaut le double du via lui-meme.
    cav = (_cavite_de_retour(trans, via, couches, segments, d_percage)
           if (trans.get("retour") or {}).get("nets_differents") is True
           else None)
    # LA TRAVERSEE N'EST PAS UNE INDUCTANCE, ET LA TRAITER COMME TELLE ETAIT
    # FAUX. La cavite entre plans est un L-C : sa capacite repartie et
    # l'inductance du decouplage forment une resonance PARALLELE -- la « PRF »
    # du chapitre 13 de Bogatin -- ou l'impedance de la traversee CULMINE. Une
    # inductance equivalente figee au point central manquerait exactement le
    # phenomene qu'on veut voir. On garde donc les parametres et on evalue
    # l'impedance a chaque frequence de la cascade.
    param_cav = None
    if cav:
        trans["cavite"] = cav
        if cav.get("capacite_plans_pF"):
            param_cav = {
                "l_cavite": _nombre(cav.get("etalement_cavite_nH"), 0.0) * 1e-9,
                "c_plans": _nombre(cav.get("capacite_plans_pF"), 0.0) * 1e-12,
                "l_pont": None, "esr_pont": 0.0, "c_pont": None,
            }
            if cav.get("pont") is not None:
                param_cav["l_pont"] = (
                    _nombre(cav.get("etalement_nH"), 0.0) * 1e-9
                    + _nombre(cav.get("esl_nH"), ESL_PONT_REPLI) * 1e-9)
                param_cav["c_pont"] = _nombre(cav.get("capacite_pont_F"),
                                              C_PONT_REPLI)
                param_cav["esr_pont"] = ESR_PONT_REPLI
            elif cav.get("etalement_seul"):
                # Rien d'autre que l'etalement : pas de branche capacitive, on
                # ne compte qu'une inductance serie. C'est un minorant, et la
                # fiche le dit.
                param_cav = {"l_cavite": param_cav["l_cavite"], "c_plans": 0.0,
                             "l_pont": None, "esr_pont": 0.0, "c_pont": None}
            z_c = _impedance_traversee(param_cav, fc)
            cav["impedance_fc_ohm"] = round(abs(z_c), 4)
            cav["inductance_equivalente_nH"] = (
                round(z_c.imag / omega_c * 1e9, 4) if omega_c else 0.0)
            source = ("boucle+cavite" if source == "boucle"
                      else "self+cavite")

    # PALIER 3 : LE MOIGNON, s'il y en a un et qu'on peut le connaitre.
    moignons = _moignons(trans, via, couches, z_bornes)
    trans["moignons"] = {
        "connu": moignons["connu"],
        "incoherent": bool(moignons.get("incoherent")),
        "depart": _fiche_moignon(moignons["depart"], d_percage, d_antipad, fc),
        "arrivee": _fiche_moignon(moignons["arrivee"], d_percage, d_antipad, fc),
    }
    y_dep = _admittance_moignon(moignons["depart"], d_percage, d_antipad, fc)
    y_arr = _admittance_moignon(moignons["arrivee"], d_percage, d_antipad, fc)

    z0 = seg_ap.get("z0") or seg_av.get("z0") or 50.0
    # LA PHASE COMPTE TOUT CE QUI EST CASCADE, ET RIEN D'AUTRE. Les moignons
    # d'abord : leur susceptance s'ajoute a celle du via comme une capacite de
    # plus, et elle la depasse souvent -- un moignon de 1 mm vaut 206 fF contre
    # 87 pour le via entier. La traversee entre plans ensuite : elle est en
    # SERIE, donc elle compte comme une inductance de plus. L'omettre laissait
    # la colonne « Phase » identique avec et sans changement de reference,
    # c'est-a-dire mensongere sur le seul point qui distinguait les deux cartes.
    c_effective = c_via + (y_dep.imag + y_arr.imag) / omega_c if omega_c else c_via
    z_trav = _impedance_traversee(param_cav, fc)
    l_trav = (z_trav.imag / omega_c) if omega_c else 0.0
    trans["modelise"] = {
        "type": "pi_L_C" if not (y_dep or y_arr) else "pi_L_C_moignons",
        "inductance_nH": round(l_via * 1e9, 4),
        "inductance_source": source,
        "capacite_fF": round(c_via * 1e15, 3),
        "capacite_totale_fF": round(c_effective * 1e15, 3),
        # LA TRAVERSEE N'EST PAS FONDUE DANS L'INDUCTANCE DU VIA : ce sont deux
        # grandeurs de natures differentes -- l'une decrit le barreau et sa
        # boucle de retour, l'autre le passage d'un plan a l'autre --, et le
        # chevelu ne montre que la premiere. Les additionner rendrait la fiche
        # incomparable avec ce qu'on voit sur le cuivre.
        "traversee_ohm": round(abs(z_trav), 4) if param_cav else None,
        "traversee_equivalent_nH": round(l_trav * 1e9, 4) if param_cav else None,
        "phase_deg": round(math.degrees(
            omega_c * ((l_via + l_trav) / z0 + c_effective * z0)), 4),
        "cotes_supposees": trans.get("cotes_supposees", True),
    }
    return {"l": l_via, "c": c_via,
            "moignon_depart": moignons["depart"],
            "moignon_arrivee": moignons["arrivee"],
            "percage": d_percage, "antipad": d_antipad,
            "cavite": param_cav}


# ==========================================================================
# LE MOIGNON, ET LA CAVITE PAR OU LE RETOUR CHANGE DE PLAN
# --------------------------------------------------------------------------
# CE QUE LE PALIER PRECEDENT LAISSAIT DE COTE, ET QU'IL NOMMAIT. La fiche
# disait « le moignon qui depasse et la cavite entre plans n'y sont pas ». Les
# voici, et ce ne sont pas de petites corrections :
#
#   · UN MOIGNON DE 1 mm VAUT 206 fF, deux fois et demie la capacite du via
#     entier. Sous sa resonance il charge ; A sa resonance quart d'onde il
#     COURT-CIRCUITE la liaison. C'est le defaut qui tue un lien multi-gigabit,
#     et rien sur le dessin ne le montre : le via a l'air normal, c'est ce
#     qu'on n'utilise PAS de son percage qui nuit.
#
#   · LA CAVITE TRANSFORME UN CONSEIL EN CHIFFRE. Jusqu'ici, une reference qui
#     change sans etre rejointe rendait un plancher et un avertissement disant
#     « ne faites pas cela ». On peut desormais dire COMBIEN cela coute -- donc
#     si l'on peut se le permettre, ce qui est une tout autre conversation.
# ==========================================================================

# L'inductance de MONTAGE supposee d'un pont entre deux plans -- le
# condensateur lui-meme et ses deux vias --, en nanohenrys, quand la page ne la
# donne pas. C'est l'ordre de grandeur d'un 0402 pose sur deux vias courts.
# Elle ne recouvre PAS l'etalement dans les plans, qui est compte a part :
# Bogatin insiste sur la separation des deux (« It's always a good practice to
# separate the mounting inductance and the cavity spreading inductance »,
# p. 652).
ESL_PONT_REPLI = 1.0

# La valeur supposee d'un condensateur de decouplage, en farads, quand la page
# n'envoie pas celle du composant. Cent nanofarads est la valeur universelle du
# decouplage, et le chiffre compte : en dessous de sa resonance propre, c'est SA
# capacite qui fixe l'impedance de la branche, pas son inductance. L'omettre
# ferait passer le pont pour un court-circuit parfait en basse frequence.
C_PONT_REPLI = 100e-9

# La resistance serie supposee d'un condensateur de decouplage, en ohms. Elle
# ne compte qu'a la resonance, ou elle borne le creux -- ailleurs elle est
# noyee. Trente milliohms est l'ordre de grandeur d'un MLCC 0402 X7R.
ESR_PONT_REPLI = 0.03

# L'aire supposee des deux plans en regard, en millimetres carres, quand la page
# ne l'envoie pas. Elle ne sert qu'a la capacite repartie de la cavite, et elle
# est prise PETITE a dessein : une aire surestimee donne une capacite
# surestimee, donc une traversee qui parait meilleure qu'elle n'est.
AIRE_PLANS_REPLI = 400.0


def _milieu_traverse(couches, i_haut, i_bas):
    """La permittivite et les pertes moyennes entre deux couches d'empilage.

    Moyenne PONDEREE PAR L'EPAISSEUR, et non simple : un moignon qui traverse
    0,1 mm de prepreg et 1 mm de coeur est dans le coeur, pas a mi-chemin entre
    les deux. Sans dielectrique dans l'intervalle, on rend le FR-4 ordinaire --
    et cela n'arrive que sur un intervalle vide, ou rien ne sera calcule.
    """
    lo, hi = sorted((int(i_haut), int(i_bas)))
    somme = 0.0
    er = 0.0
    td = 0.0
    for i in range(lo, hi + 1):
        if not (0 <= i < len(couches)):
            continue
        c = couches[i]
        if c.get("type") != "dielectric":
            continue
        e = _nombre(c.get("thickness"), 0.0)
        if e <= 0:
            continue
        somme += e
        er += e * _nombre(c.get("epsilon_r"), 4.3)
        td += e * _nombre(c.get("tan_delta"), 0.02)
    if somme <= 0:
        return 4.3, 0.02
    return er / somme, td / somme


def _moignons(trans, via, couches, z_bornes):
    """Les deux bouts de percage que le signal n'emprunte pas.

    LA LONGUEUR NE SE DEVINE PAS, ELLE SE SOUSTRAIT. Le via est perce de
    `layer_from` a `layer_to` ; le signal ne parcourt que `couche_depart` a
    `couche_arrivee`. Ce qui depasse de part et d'autre pend en circuit ouvert.
    Sans la portee percee -- une page qui ne l'envoie pas --, on ne peut PAS
    conclure : un via traversant et un via borgne bien ajuste ont exactement la
    meme apparence dans le reste du document. On rend alors « inconnu », et la
    fiche le dit plutot que d'annoncer un moignon nul.

    Chaque moignon est rattache au NOEUD dont il pend : celui du depart quand
    il est du cote de la couche de depart, celui de l'arrivee sinon. Les
    intervertir change |S11| sans changer |S21|, donc se voit mal.
    """
    a_portee = (via.get("layer_from") is not None
                and via.get("layer_to") is not None)
    dep = int(_nombre(trans.get("couche_depart"), 0))
    arr = int(_nombre(trans.get("couche_arrivee"), 0))
    if not a_portee:
        return {"connu": False, "depart": None, "arrivee": None}

    vlo, vhi = sorted((int(_nombre(via.get("layer_from"), 0)),
                       int(_nombre(via.get("layer_to"), 0))))
    ulo, uhi = sorted((dep, arr))
    # On ne peut pas emprunter plus que ce qui est perce : une portee percee
    # plus courte que le saut est une incoherence du document, pas un moignon
    # negatif. On la signale en rendant « inconnu ».
    if vlo > ulo or vhi < uhi:
        return {"connu": False, "depart": None, "arrivee": None,
                "incoherent": True}

    def _z(i):
        return z_bornes[i] if 0 <= i < len(z_bornes) else 0.0

    def _bout(i1, i2, z1, z2):
        """Un bout de percage entre deux cotes, avec le milieu qu'il traverse.

        LES COTES SONT CELLES DU PERCAGE, ET NON LES DESSUS DE COUCHE. Un via
        va du DESSUS de sa couche de depart au DESSOUS de sa couche d'arrivee
        -- c'est ce qu'un foret fait, et c'est deja la convention de
        `_hauteur_via`. Prendre les deux dessus fait manquer une epaisseur de
        cuivre a chaque bout ; c'est peu sur du 35 um, mais les deux bouts
        n'ont aucune raison de se compenser, et la somme des morceaux doit
        rendre exactement la longueur percee.
        """
        lg = abs(z2 - z1)
        if lg <= 0:
            return None
        er, td = _milieu_traverse(couches, i1, i2)
        return {"longueur_mm": round(lg, 4), "er": round(er, 3),
                "tan_delta": round(td, 5),
                "couches": [i1, i2]}

    # Le percage occupe [z(vlo), z(vhi+1)] ; le signal [z(ulo), z(uhi+1)].
    haut = (_bout(vlo, ulo, _z(vlo), _z(ulo)) if ulo > vlo else None)
    bas = (_bout(uhi, vhi, _z(uhi + 1), _z(vhi + 1)) if vhi > uhi else None)

    # Lequel pend au noeud d'entree ? Celui du cote de la couche de DEPART.
    if dep <= arr:
        depart, arrivee = haut, bas
    else:
        depart, arrivee = bas, haut
    return {"connu": True, "depart": depart, "arrivee": arrivee}


def _admittance_moignon(m, d_percage, d_antipad, freq):
    """L'admittance d'un moignon a une frequence, ou zero s'il n'y en a pas."""
    if not m:
        return 0.0 + 0.0j
    return tl.admittance_moignon(m["longueur_mm"] * 1e-3,
                                 d_percage * 1e-3, d_antipad * 1e-3,
                                 m["er"], m["tan_delta"], float(freq))


def _fiche_moignon(m, d_percage, d_antipad, fc):
    """Ce qu'on affiche d'un moignon : sa longueur, sa resonance, ce qu'il
    pese a la frequence de travail.

    LA RESONANCE EST LE CHIFFRE QUI DECIDE. Une capacite en femtofarads ne dit
    pas si le moignon est un probleme ; la frequence a laquelle il court-circuite
    la liaison, si. On rend aussi la capacite equivalente A LA FREQUENCE
    CENTRALE, parce que c'est sous cette forme qu'elle se compare a celle du
    via.
    """
    if not m:
        return None
    y = _admittance_moignon(m, d_percage, d_antipad, fc)
    omega = 2.0 * math.pi * fc
    f_res = tl.frequence_resonance_moignon(m["longueur_mm"] * 1e-3, m["er"])
    return {
        "longueur_mm": m["longueur_mm"],
        # LE MILIEU PART AVEC LA RESONANCE, parce que c'est lui qui l'explique :
        # la meme longueur resonne 8 % plus bas dans un stratifie a er 5 que
        # dans un a er 4,3, et sans le chiffre on ne peut pas refaire le calcul.
        "er": m["er"],
        "tan_delta": m["tan_delta"],
        "resonance_hz": None if not np.isfinite(f_res) else round(f_res, 1),
        "capacite_fF": round(y.imag / omega * 1e15, 2) if omega > 0 else 0.0,
        "impedance_ohm": round(1.0 / abs(y), 1) if abs(y) > 1e-12 else None,
        "couches": m["couches"],
    }


def _plans_de_la_paire(trans, couches, segments):
    """Les deux plans de reference qu'un via fait changer, et leur ecartement.

    Rend (nom_haut, nom_bas, hauteur_mm) ou (None, None, 0) quand il n'y a pas
    de changement -- ou quand les deux troncons partagent un plan, auquel cas
    le retour n'a rien a traverser.
    """
    i = int(trans["troncon"])
    seg_av = segments[i - 1] if 0 < i <= len(segments) else {}
    seg_ap = segments[i] if 0 <= i < len(segments) else {}
    av = _plans_de_reference(seg_av)
    ap = _plans_de_reference(seg_ap)
    if not av or not ap or (av & ap):
        return None, None, 0.0
    rang = {}
    for k, c in enumerate(couches):
        nom = c.get("name") or ""
        if nom and c.get("type") == "copper":
            rang.setdefault(nom, k)
    i_av = min((rang[n] for n in av if n in rang), default=None)
    i_ap = min((rang[n] for n in ap if n in rang), default=None)
    if i_av is None or i_ap is None:
        return None, None, 0.0
    lo, hi = sorted((i_av, i_ap))
    # L'ecart ELECTRIQUE entre les deux plans : le dielectrique qui les separe,
    # sans compter le cuivre des plans eux-memes -- c'est la hauteur de la
    # cavite, pas l'epaisseur de l'empilage.
    h = 0.0
    for k in range(lo + 1, hi):
        if 0 <= k < len(couches) and couches[k].get("type") == "dielectric":
            h += _nombre(couches[k].get("thickness"), 0.0)
    noms = sorted(av)[0], sorted(ap)[0]
    return noms[0], noms[1], round(h, 4)


def _cavite_de_retour(trans, via, couches, segments, d_percage):
    """Le chemin du retour quand la reference change : par ou, et a quel prix.

    LE RETOUR N'ATTEND PAS UN CONDENSATEUR, ET C'ETAIT L'ERREUR DE FOND.
    Bogatin, section 7.14 : le courant de retour change de plan par la PAIRE DE
    PLANS elle-meme, en courant de deplacement a travers sa capacite. Le plan
    du milieu, meme FLOTTANT, porte des courants de Foucault induits qui
    referment la boucle -- le pilote voit simplement deux lignes en serie. Il
    n'y a donc jamais « pas de chemin » : il y a un chemin dont on connait plus
    ou moins bien le prix.

    TROIS CAS, ET ILS NE SE CONFONDENT PAS :

      1. UN PONT MESURE. Un condensateur de decouplage joint les deux plans a
         une distance connue. On chiffre : etalement jusqu'a lui, son montage,
         sa capacite -- le tout EN PARALLELE avec la capacite repartie des
         plans, qui ne disparait pas pour autant.
      2. LA PAGE A CHERCHE ET N'A RIEN VU dans son rayon. Le retour est alors
         AU MOINS aussi loin, et il traverse AU MOINS un pont. On prend le
         rayon comme distance : c'est un MINORANT, marque comme tel.
      3. LA PAGE NE CHERCHE PAS. On ne chiffre alors que l'ETALEMENT, qui ne
         depend que de la geometrie des plans, et on dit que l'element de
         traversee manque. C'est le seul cas ou l'on rend moins que la verite,
         et il est nomme.

    POURQUOI PAS LA CAVITE SEULE DANS LE CAS 2. Parce qu'elle donne 1,7 kOhm a
    1 MHz sur une paire de plans de 95 pF -- exact pour une carte qui n'aurait
    AUCUN decouplage nulle part, absurde pour une carte reelle dont le
    decouplage est simplement plus loin que le rayon cherche. Le minorant du
    cas 2 est plus proche du vrai, et il ne peut pas se tromper dans le sens
    qui flatte.
    """
    haut, bas, h_cav = _plans_de_la_paire(trans, couches, segments)
    if not haut or h_cav <= 0:
        return None

    ponts = (via or {}).get("ponts")
    fiche = {"plan_haut": haut, "plan_bas": bas,
             "hauteur_mm": h_cav, "ponts": 0, "pont": None,
             # A-T-ON CHERCHE ? C'est ce qui separe une OBSERVATION d'une
             # ignorance, et les deux ne se disent pas de la meme facon dans la
             # fiche : « il n'y a pas de decouplage » est un constat sur la
             # carte, « on n'a pas regarde » est un aveu sur l'outil.
             "cherche": ponts is not None,
             "inductance_nH": None, "esl_nH": None, "esl_source": None}

    x0 = _nombre((via or {}).get("x"), None)
    y0 = _nombre((via or {}).get("y"), None)
    if x0 is None or y0 is None:
        fiche["raison"] = "la position du via n'est pas envoyée"
        return fiche

    # La capacite repartie des deux plans : elle existe toujours, et c'est par
    # elle que le retour passe quand rien d'autre ne le porte.
    a_aire = (via or {}).get("aire_plans_mm2") is not None
    aire = _nombre((via or {}).get("aire_plans_mm2"), AIRE_PLANS_REPLI)
    er_cav = _nombre((via or {}).get("er_plans"), 4.3)
    c_plans = tl.capacite_paire_plans(aire * 1e-6, h_cav * 1e-3, er_cav)
    rayon_cav = math.sqrt(max(aire, 1.0) / math.pi)
    l_cavite = tl.inductance_etalement_via_anneau(
        h_cav * 1e-3, max(d_percage, 1e-3) * 1e-3 / 2.0, rayon_cav * 1e-3)
    fiche.update({
        "aire_plans_mm2": round(aire, 1),
        "aire_source": "page" if a_aire else "repli",
        "capacite_plans_pF": round(c_plans * 1e12, 2),
        "etalement_cavite_nH": round(l_cavite * 1e9, 4),
        "impedance_plans_ohm": round(
            tl.impedance_paire_plans(h_cav * 1e-3, 2.0 * rayon_cav * 1e-3,
                                     er_cav), 3),
    })

    if ponts is None:
        fiche["raison"] = ("cette page ne cherche pas les découplages qui"
                           " joignent %s à %s : seul l'étalement dans les plans"
                           " est compté, et la traversée est donc"
                           " sous-estimée" % (haut, bas))
        fiche["etalement_seul"] = True
        fiche["inductance_nH"] = round(l_cavite * 1e9, 4)
        return fiche

    fiche["ponts"] = len(ponts)
    rayon = _nombre((via or {}).get("ponts_rayon_mm"), 0.0)
    meilleur = None
    for p in ponts:
        d = math.hypot(_nombre(p.get("x"), 0.0) - x0,
                       _nombre(p.get("y"), 0.0) - y0)
        if meilleur is None or d < meilleur[0]:
            meilleur = (d, p)

    if meilleur is None:
        # Cherche, rien vu : le pont est AU MOINS au rayon. Minorant.
        if not (rayon > 0):
            fiche["raison"] = ("aucun découplage ne joint %s à %s près du via,"
                               " et la page ne dit pas jusqu'où elle a cherché"
                               % (haut, bas))
            fiche["etalement_seul"] = True
            fiche["inductance_nH"] = round(l_cavite * 1e9, 4)
            return fiche
        dist, p, borne = rayon, {}, True
    else:
        dist, p = meilleur
        borne = False

    # LE PLUS PROCHE, ET LUI SEUL. Deux condensateurs en parallele divisent
    # l'inductance, mais leur mutuelle les en empeche largement -- c'est le
    # meme phenomene que pour les vias de retour. Ne compter que le plus proche
    # SURESTIME l'inductance : c'est le sens prudent, et il est dit.
    a_esl = p.get("esl_nH") is not None
    esl = _nombre(p.get("esl_nH"), ESL_PONT_REPLI)
    a_cap = p.get("capacite_F") is not None
    c_pont = _nombre(p.get("capacite_F"), C_PONT_REPLI)
    # EQUATION 13-35, ET NON 13-31 : deux contacts ponctuels, pas un via vers un
    # anneau. Le courant s'etale au depart ET se resserre a l'arrivee, dans les
    # deux plans. L'ancienne version employait 13-31 et sous-estimait d'un
    # facteur trois.
    l_etal = tl.inductance_etalement_via_via(h_cav * 1e-3, dist * 1e-3,
                                             max(d_percage, 1e-3) * 1e-3)
    fiche.update({
        "borne": borne,
        "rayon_mm": round(rayon, 4) if rayon > 0 else None,
        "pont": {"x": round(_nombre(p.get("x"), x0), 4),
                 "y": round(_nombre(p.get("y"), y0), 4),
                 "distance_mm": round(dist, 4),
                 "repere": str(p.get("repere") or "")},
        "inductance_nH": round((l_etal + esl * 1e-9) * 1e9, 4),
        "etalement_nH": round(l_etal * 1e9, 4),
        "esl_nH": round(esl, 3),
        "esl_source": "page" if a_esl else "repli",
        "capacite_pont_F": c_pont,
        "capacite_pont_source": "page" if a_cap else "repli",
    })
    return fiche


def _vias_hors_chaine(vias, couches, z_bornes, refs_nets):
    """Le chemin de retour des vias de la selection, SANS passer par la chaine.

    POURQUOI CETTE FONCTION EXISTE. Jusqu'ici un via n'existait pour le calcul
    que s'il tombait entre deux troncons CONSECUTIFS d'un parcours unique :
    c'est `_transitions` qui les detecte, en lisant les changements de couche
    le long de la chaine. Tout ce qui concerne le via pendait a cette detection
    -- ses cotes, son inductance de boucle, les vias de masse qui la referment,
    le chevelu. Sur un net qui se RAMIFIE -- un bus qui dessert trois boitiers,
    le cas ordinaire -- il n'y a pas de chaine, donc pas de via detecte, donc
    aucun chemin de retour, alors meme que le via est la, identifie, avec ses
    coordonnees et son percage.

    OR LE RETOUR D'UN VIA NE DOIT RIEN A L'ORDRE DES TRONCONS. Le via est a un
    endroit fixe, il joint deux couches connues, il a des vias de masse autour
    de lui, et sa boucle se calcule. Que la ligne se ramifie trois millimetres
    plus loin n'y change rien. La page envoie donc les vias de la selection
    dans une liste A PART, sans ordre, et on les analyse ici.

    CE QU'ON NE FAIT PAS ICI, ET C'EST VOULU : aucune capacite, aucune matrice
    ABCD, rien qui entre dans la cascade. Ces vias ne sont pas dans un
    parcours ; les cascader supposerait un ordre qu'on n'a pas. On rend
    l'inductance de boucle et le chemin de retour, qui sont vrais sans ordre,
    et rien d'autre.

    Rend une liste au MEME FORMAT que les transitions -- `cotes`, `retour`,
    `modelise` -- pour que la page n'ait qu'une facon de lire un via.
    """
    out = []
    for rang, v in enumerate(vias or []):
        a_cu = int(_nombre((v or {}).get("layer_from"), -1))
        b_cu = int(_nombre((v or {}).get("layer_to"), -1))
        # UN VIA QUI NE CHANGE PAS DE COUCHE N'EN EST PAS UN. On ne le compte
        # pas plutot que de rendre une boucle de hauteur nulle.
        if a_cu < 0 or b_cu < 0 or a_cu == b_cu:
            continue
        trans = {"troncon": -1,
                 "couche_depart": a_cu, "couche_arrivee": b_cu,
                 "hauteur_empilage": _hauteur_via(couches, a_cu, b_cu)}
        h_via, d_percage, d_pastille = _cotes_via({"via": v}, trans)
        refs_av = _plans_de_couche(couches, a_cu)
        refs_ap = _plans_de_couche(couches, b_cu)
        l_via, source = _inductance_transition(
            trans, v, couches, [], z_bornes, refs_nets, h_via, d_percage,
            refs_av=refs_av, refs_ap=refs_ap)
        fiche = {
            "rang": rang,
            "couche_depart": a_cu,
            "couche_arrivee": b_cu,
            "cotes": trans.get("cotes") or {},
            # LE DRAPEAU SUIT LES COTES, sans quoi il ne suit rien. La fiche
            # recopiait `cotes` mais pas ce booleen : un via hors parcours
            # chiffre sur une pastille devinee ne declenchait donc jamais la
            # mention « supposees » du panneau, qui filtre precisement
            # la-dessus. Les cotes partaient avec leur provenance ecrite dans
            # chaque champ, et personne pour la lire.
            "cotes_supposees": bool(trans.get("cotes_supposees")),
            "retour": trans.get("retour") or {},
            "modelise": {"inductance_nH": round(l_via * 1e9, 4),
                         "inductance_source": source},
            # LE VIA N'EST PAS CASCADE, ET LA FICHE DOIT LE DIRE. Un chiffre
            # d'inductance affiche a cote d'une courbe S laisse croire qu'il y
            # entre pour quelque chose. Ici il n'y entre pas.
            "cascade": False,
        }
        out.append(fiche)
    return out


def _avertir_retour(transitions, f_fin=0.0):
    """Ce que le chemin de retour oblige a dire, une phrase par defaut reel.

    TROIS AVERTISSEMENTS, ET PAS UN DE PLUS. Un avertissement qui sort sur le
    cas ordinaire cesse d'etre lu, et emporte avec lui celui qui comptait. On
    distingue donc :

      · la REFERENCE QUI CHANGE SANS QUE RIEN NE LA REJOIGNE -- le defaut
        grave, celui qui flatte le resultat, et le seul dont la reponse
        d'ingenierie soit « ne faites pas cela » plutot qu'un chiffre ;
      · l'ABSENCE DE VIA DE RETOUR -- l'inductance rendue ne depend alors pas du
        routage, et c'est cela qu'il faut dire, pas qu'elle est fausse ;
      · la PAGE QUI N'ENVOIE RIEN -- ce n'est pas un defaut de la carte, c'est
        une limite de l'outil, et les deux ne se confondent pas.
    """
    if not transitions:
        return []

    # LE CHANGEMENT DE REFERENCE SE SCINDE EN DEUX, depuis que la cavite est
    # chiffree. Un pont trouve, et le prix est connu : c'est une information de
    # conception, pas une alarme. Aucun pont, et rien ne peut etre chiffre :
    # c'est l'alarme, et elle doit rester seule de son espece pour qu'on la
    # lise.
    # ON N'AFFIRME PAS UNE ABSENCE QU'ON N'A PAS CONSTATEE. Quand la page
    # n'envoie pas les vias voisins, « aucun via de masse ne joint les deux »
    # est une affirmation SUR LA CARTE sans la moindre preuve -- et elle est
    # fausse des qu'il y en a un, ce qui est le cas courant. On exige donc que
    # la recherche ait EU LIEU avant de conclure.
    # UNE DEDUCTION ET UNE OBSERVATION NE SE DISENT PAS PAREIL.
    #
    #   · « aucun VIA DE MASSE ne joint GND a PWR » est une DEDUCTION : elle
    #     decoule des nets, et elle est vraie qu'on ait cherche ou non. C'est
    #     pour cela qu'elle n'exige pas que la page envoie les vias voisins.
    #   · « aucun DECOUPLAGE n'est a cote » est une OBSERVATION : il faut avoir
    #     regarde. Sans `ponts`, l'affirmer serait un enonce sur la carte sans
    #     la moindre preuve -- exactement le defaut qui a fait crier l'outil sur
    #     une carte qui portait un via de masse au bon endroit.
    change = [t for t in transitions
              if (t.get("retour") or {}).get("reference_change")
              and not (t.get("retour") or {}).get("raccorde")
              and (t.get("cavite") or {}).get("impedance_fc_ohm") is None]
    # Le plan change, et on ne peut pas dire si c'est grave : ni les nets des
    # plans, ni les vias voisins ne sont connus.
    doute = [t for t in transitions
             if (t.get("retour") or {}).get("plan_change")
             and not (t.get("retour") or {}).get("reference_change")
             and ((t.get("retour") or {}).get("nets_differents") is None
                  or (t.get("retour") or {}).get("source") == "absent")]
    # LA TRAVERSEE EST CHIFFREE DES QU'ON A UNE IMPEDANCE, et c'est le bon
    # critere : ce n'est plus une inductance depuis que la capacite des plans y
    # entre, et le cas « etalement seul » en a une aussi.
    chiffre = [t for t in transitions
               if (t.get("cavite") or {}).get("impedance_fc_ohm") is not None]
    sans = [t for t in transitions
            if (t.get("retour") or {}).get("source") == "self"
            and not (t.get("retour") or {}).get("reference_change")
            and (t.get("retour") or {}).get("source") != "absent"]
    muet = [t for t in transitions
            if (t.get("retour") or {}).get("source") == "absent"]

    out = []
    if change:
        t = change[0]
        r = t["retour"]
        cherche = bool((t.get("cavite") or {}).get("cherche"))
        commun = ("Le plan de référence change à %d via(s) — %s d'un côté, %s"
                  " de l'autre. Aucun via de masse ne peut joindre les deux :"
                  " il joindrait de la masse à de la masse. Le retour doit"
                  " passer par un condensateur de découplage."
                  % (len(change), " / ".join(r.get("plans_depart") or ["?"]),
                     " / ".join(r.get("plans_arrivee") or ["?"])))
        if cherche:
            out.append(
                commun + " Il n'y en a AUCUN près de ce via : le courant de"
                " retour n'a pas de chemin court, et celui qu'il prend ne peut"
                " pas être chiffré. L'inductance affichée est un plancher très"
                " optimiste. La réponse est de garder la même référence des"
                " deux côtés du via, ou d'en poser un à son pied.")
        else:
            out.append(
                commun + " Cette page ne cherche pas les découplages : on ne"
                " sait donc pas si le retour en trouve un près du via, ni ce"
                " qu'il coûte. L'inductance affichée ne le compte pas et elle"
                " est optimiste d'autant.")
    if chiffre:
        cav = chiffre[0]["cavite"]
        # LA DEDUCTION RESTE DITE, ET ELLE DOIT L'ETRE. Le fait qu'aucun via
        # de masse ne puisse joindre deux plans de nets differents ne depend
        # pas de ce qu'on a cherche : il decoule des nets. C'est ce que la
        # personne qui route doit comprendre, et le prix de la traversee ne le
        # remplace pas -- il le complete.
        tete = ("Le plan de référence change à %d via(s) — %s → %s. Aucun via"
                " de masse ne peut joindre les deux : il joindrait de la masse"
                " à de la masse. Le retour passe par la capacité répartie des"
                " deux plans (%.0f pF) et par les découplages qui les joignent"
                % (len(chiffre), cav["plan_haut"], cav["plan_bas"],
                   cav.get("capacite_plans_pF") or 0.0))
        cout = (" : la traversée pèse %.2f Ω à la fréquence centrale, cascadés"
                " dans le résultat." % cav["impedance_fc_ohm"])
        if cav.get("etalement_seul"):
            out.append(
                tete + ". Cette page ne cherche pas les découplages : on ne"
                " compte que l'étalement dans les plans (%.2f nH), et la"
                " traversée est donc SOUS-ESTIMÉE."
                % (cav.get("etalement_cavite_nH") or 0.0))
        elif cav.get("borne"):
            out.append(
                tete + cout +
                " Aucun découplage n'a été trouvé dans un rayon de %.1f mm : on"
                " a supposé le plus proche À CE RAYON, ce qui est un MINORANT —"
                " le vrai peut être bien plus loin. Poser un condensateur au"
                " pied du via, ou garder la même référence, sont les deux"
                " façons de l'éviter." % cav["rayon_mm"])
        else:
            out.append(
                tete + cout +
                " Le découplage retenu est %s, à %.2f mm. L'étalement dans les"
                " plans croît avec leur ÉCARTEMENT et seulement en logarithme"
                " avec cette distance : amincir le diélectrique entre plans"
                " gagne davantage que rapprocher le condensateur."
                % (cav["pont"].get("repere") or "le plus proche",
                   cav["pont"]["distance_mm"]))

    # LA RESONANCE D'UN MOIGNON EST LE SEUL DEFAUT DE CETTE FICHE QUI EFFACE LA
    # LIAISON au lieu de la degrader. On ne la signale que si elle tombe dans
    # la bande demandee ou pas loin au-dessus : plus haut, c'est du bruit.
    for t in transitions:
        mo = t.get("moignons") or {}
        for cle in ("depart", "arrivee"):
            f = mo.get(cle)
            if not f or not f.get("resonance_hz"):
                continue
            if f_fin > 0 and f["resonance_hz"] > 2.0 * f_fin:
                continue
            out.append(
                "Le via du tronçon %d laisse un moignon de %.3f mm, qui"
                " résonne à %.2f GHz : à cette fréquence il court-circuite la"
                " liaison. Un via enterré ou un contre-perçage l'enlèvent."
                % (t["troncon"], f["longueur_mm"], f["resonance_hz"] / 1e9))
        if mo.get("incoherent"):
            out.append(
                "Le via du tronçon %d est percé sur une portée plus courte que"
                " le saut de couche qu'il réalise : le document est"
                " incohérent, et le moignon n'a pas pu être évalué."
                % t["troncon"])
    if any((t.get("moignons") or {}).get("connu") is False
           and not (t.get("moignons") or {}).get("incoherent")
           for t in transitions):
        out.append(
            "La portée percée des vias n'est pas envoyée par cette page : on"
            " ne peut pas savoir s'ils laissent un moignon. Un moignon de 1 mm"
            " vaut 206 fF — deux fois et demie la capacité du via — et"
            " court-circuite la liaison à sa résonance.")
    if doute:
        r = doute[0]["retour"]
        manque = []
        if r.get("nets_differents") is None:
            manque.append("l'empilage ne déclare pas le net de ses plans")
        if r.get("source") == "absent":
            manque.append("la page n'envoie pas les vias de masse voisins")
        out.append(
            "Le plan de référence change à %d via(s) — %s d'un côté, %s de"
            " l'autre — et on ne peut pas dire si cela pose problème : %s."
            " Deux plans de MASSE différents sont le cas ordinaire, qu'un via"
            " de masse referme ; un plan de masse et un plan d'alimentation"
            " sont le défaut grave, que rien ne referme. Les deux se"
            " ressemblent ici."
            % (len(doute), " / ".join(r.get("plans_depart") or ["?"]),
               " / ".join(r.get("plans_arrivee") or ["?"]),
               " et ".join(manque)))
    if sans:
        out.append(
            "Aucun via de masse ne referme la boucle à %d via(s) de signal :"
            " l'inductance affichée est celle d'un conducteur seul et ne dépend"
            " pas du routage. Un via de retour à moins d'un millimètre la"
            " ferait tomber de moitié." % len(sans))
    if muet:
        out.append(
            "Les vias de masse voisins ne sont pas envoyés par cette page :"
            " l'inductance des %d via(s) est celle d'un conducteur seul, sans"
            " boucle de retour. Elle ne dépend donc pas de leur placement."
            % len(muet))
    return out


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


def _noeuds(objets):
    """Les noeuds de la selection : un point du plan, et les bouts qui s'y rejoignent.

    GROUPES PAR TOLERANCE ET NON PAR EGALITE, pour la meme raison que du cote
    des pages : deux bouts distants de trois microns sont le meme point du
    cuivre, et un casier de coordonnees arrondies les separerait.

    ON NE REGARDE PAS LA COUCHE. Deux troncons au meme XY sur deux couches
    differentes sont joints par un via -- c'est ce que dit deja `_ruptures`, et
    la topologie doit dire la meme chose, sans quoi toute liaison changeant de
    couche paraitrait coupee en deux morceaux.

    Rend (centres, membres, rangs) : les points, les indices de troncons a
    chaque point, et pour chaque troncon le couple de ses deux noeuds -- None
    quand il ne porte pas ses coordonnees, auquel cas on ne le juge pas.
    """
    centres, membres, rangs = [], [], []
    for obj in objets:
        e = _extremites(obj)
        if e is None:
            rangs.append(None)
            continue
        r = []
        for p in e:
            c = -1
            for k, q in enumerate(centres):
                if math.hypot(q[0] - p[0], q[1] - p[1]) <= TOLERANCE_RACCORD:
                    c = k
                    break
            if c < 0:
                c = len(centres)
                centres.append(p)
                membres.append([])
            membres[c].append(len(rangs))
            r.append(c)
        rangs.append(r)
    return centres, membres, rangs


def _topologie(objets):
    """La selection est-elle une CHAINE, et sinon POURQUOI.

    TROIS CHOSES DISTINCTES QU'UN SEUL COMPTEUR DE RUPTURES CONFONDAIT :

      - L'ORDRE. Les troncons se touchent bout a bout dans l'ordre envoye.
        C'est cela, et rien d'autre, que la mise en cascade ABCD exige.
      - LA CONNEXITE. Ils forment une seule piece, meme mal rangee.
      - LE DEGRE. Un noeud ou se rejoignent trois bouts est une DERIVATION.

    Et la distinction porte, parce qu'elle change ce qu'il y a a dire. Une
    selection connexe, sans derivation, mais envoyee dans le desordre est
    REORDONNABLE : la page peut la ranger et les parametres S redeviennent
    justes. Un bus qui se ramifie en T ne l'est pas, et aucun ordre ne le
    sauvera -- il n'a pas deux acces, il en a trois. Repondre « la selection
    n'est pas un parcours continu » aux deux, c'est demander a l'un de faire ce
    qui est impossible, et taire a l'autre ce qu'il suffirait de faire.

    Genres rendus : "chaine", "desordre", "ramifiee", "eparse", "boucle",
    "sans_coordonnees".
    """
    ruptures, detail = _ruptures(objets)
    centres, membres, rangs = _noeuds(objets)
    juges = [i for i, r in enumerate(rangs) if r]
    if not juges:
        # Sans coordonnees on ne juge pas, et surtout on ne REFUSE pas : un
        # document ecrit a la main qui ne porte que des longueurs reste une
        # chaine parfaitement legitime, envoyee dans l'ordre.
        return {"genre": "sans_coordonnees", "chaine": False, "cascadable": True,
                "ruptures": ruptures, "ruptures_detail": detail,
                "derivations": [], "morceaux": 0, "bouts_libres": 0}

    # Les derivations : un point ou aboutissent TROIS bouts ou plus. C'est le
    # seul defaut de topologie qu'aucun rangement ne corrige.
    derivations = [{"x": round(centres[k][0], 4), "y": round(centres[k][1], 4),
                    "branches": len(m)}
                   for k, m in enumerate(membres) if len(m) >= 3]

    # Les morceaux : deux troncons sont du meme morceau s'ils partagent un
    # noeud. Un parcours n'en fait qu'un.
    reste, morceaux = set(juges), 0
    while reste:
        morceaux += 1
        pile = [reste.pop()]
        while pile:
            i = pile.pop()
            for c in rangs[i]:
                for v in membres[c]:
                    if v in reste:
                        reste.discard(v)
                        pile.append(v)

    bouts_libres = sum(1 for m in membres if len(m) == 1)

    if derivations:
        genre = "ramifiee"
    elif morceaux > 1:
        genre = "eparse"
    elif bouts_libres != 2:
        # NI DEUX EXTREMITES : la selection se referme sur elle-meme. Une
        # boucle n'a pas d'entree ni de sortie, donc pas de matrice S a deux
        # ports -- et la cascader reviendrait a la couper en un point
        # arbitraire, en rendant un chiffre qui depend de ce choix-la.
        genre = "boucle"
    elif ruptures:
        genre = "desordre"
    else:
        genre = "chaine"

    return {"genre": genre, "chaine": genre == "chaine",
            "cascadable": genre == "chaine",
            "ruptures": ruptures, "ruptures_detail": detail,
            "derivations": derivations, "morceaux": morceaux,
            "bouts_libres": bouts_libres}


# Ce qu'on dit a l'ecran pour chaque genre, et ce qu'on demande. Le texte vit
# ICI et pas dans `simuler` : c'est la seule liste ou l'on voit d'un coup que
# chaque genre a bien sa phrase, et qu'aucune ne promet ce que le calcul ne
# fait pas.
RAISONS_TOPOLOGIE = {
    "desordre": (
        "La sélection est bien un parcours, mais elle n'a pas été envoyée dans"
        " l'ordre du parcours : %(ruptures)d raccord(s) manquent entre deux"
        " tronçons consécutifs. Rangez-la d'un bout à l'autre et les"
        " paramètres S redeviennent calculables."),
    "ramifiee": (
        "La liaison se ramifie : %(derivations)d point(s) où trois branches ou"
        " plus se rejoignent. Ce n'est pas une chaîne — il n'y a pas deux accès"
        " mais plusieurs, et aucun ordre n'y changera rien. Sélectionnez une"
        " branche d'un bout à l'autre pour obtenir des paramètres S."),
    "eparse": (
        "La sélection est en %(morceaux)d morceaux qui ne se touchent pas."
        " Une mise en cascade suppose un cuivre continu."),
    "boucle": (
        "La sélection se referme sur elle-même : elle n'a pas deux extrémités"
        " libres. Une matrice S à deux ports suppose une entrée et une sortie."),
}


def raison_topologie(topo):
    """La phrase qui va avec le genre, ou "" quand la cascade est legitime."""
    modele = RAISONS_TOPOLOGIE.get(topo.get("genre"))
    if not modele:
        return ""
    return modele % {"ruptures": topo.get("ruptures", 0),
                     "derivations": len(topo.get("derivations") or []),
                     "morceaux": topo.get("morceaux", 0)}


# ==========================================================================
# Le calcul
# ==========================================================================

# ==========================================================================
# LE COUPLAGE ENTRE PISTES PARALLELES
# --------------------------------------------------------------------------
# UNE SEULE GEOMETRIE POUR DEUX QUESTIONS. « Quelle est l'impedance
# differentielle de cette paire ? » et « combien cette piste prend-elle a sa
# voisine ? » sont la meme section a deux conducteurs, resolue une fois par
# `ligne_mom.solve_multiline`. Ce qui change est ce qu'on en lit : les modes
# pair/impair pour la premiere, NEXT et FEXT pour la seconde. Les deux fiches
# du panneau lisent donc la MEME liste.
#
# CE QUI MANQUAIT, ET QUI EST ICI : L'APPARIEMENT. Le solveur sait resoudre
# deux rubans depuis qu'il sait en resoudre N ; encore faut-il savoir QUELLES
# pistes sont parallelles, SUR QUELLE LONGUEUR, et A QUELLE DISTANCE. C'est de
# la geometrie plane, et elle est ici plutot que dans les deux pages : deux
# implementations de la meme regle auraient derive, et l'editeur et la
# visionneuse doivent donner le meme chiffre sur la meme carte.
#
# CE QUE LA PAGE APPORTE, elle seule : le cuivre voisin. La selection ne
# contient que ce qu'on a designe ; l'agresseur, par definition, n'en fait pas
# partie. Les deux outils envoient donc `voisinage` -- les troncons de piste
# qui passent a portee, au meme format que la geometrie.
#
# LES REGLES, ET ELLES SONT VOLONTAIREMENT SEVERES :
#   · MEME COUCHE. Deux pistes superposees sur deux couches couplent aussi,
#     mais ce n'est plus la section que ce solveur resout -- il n'a qu'un plan
#     de conducteurs. C'est dit dans les avertissements plutot que calcule
#     faux ;
#   · PARALLELES A 15 degres pres. Au-dela, la « longueur de recouvrement »
#     n'a plus de sens : l'ecart varie d'un bout a l'autre ;
#   · UN RECOUVREMENT REEL, mesure par projection sur l'axe de la victime ;
#   · UN ECART QUI RESTE UN ECART : du cuivre a du cuivre, positif, et pas
#     au-dela de ECART_COUPLAGE_MAX -- plus loin, il n'y a plus rien a dire.
# ==========================================================================

ANGLE_PARALLELE = 15.0          # degres ; au-dela, ce n'est plus un longement
ECART_COUPLAGE_MAX = 3.0        # mm ; au-dela, le couplage ne se lit plus
RECOUVREMENT_MIN = 0.2          # mm ; en deca, c'est un croisement
MAX_VOISINAGE = 2000            # troncons voisins acceptes dans un document
MAX_SECTIONS = 6                # sections couplees chiffrees par calcul

# Les suffixes qui NOMMENT une paire differentielle. Ils ne decident de rien
# dans le calcul -- deux pistes qui se longent sont couplees, qu'elles portent
# ces noms ou non -- mais ils disent au panneau si « Z differentielle » est la
# question qu'on se pose ou une curiosite.
SUFFIXES_PAIRE = [("_p", "_n"), ("+", "-"), ("_dp", "_dm"), ("p", "n"),
                  ("_plus", "_moins"), ("_h", "_l")]


def _paire_nommee(a, b, declarees=()):
    """Ces deux nets forment-ils une paire differentielle ?

    La page peut le DECLARER -- l'editeur PCB tient ses paires, et c'est la
    verite la plus sure. Faute de declaration, les suffixes decident : c'est ce
    que fait deja le bouton « Detecter » du panneau des paires, et la regle
    doit etre la meme des deux cotes.
    """
    a, b = str(a or ""), str(b or "")
    if not a or not b or a == b:
        return False
    for couple in (declarees or ()):
        if len(couple) >= 2 and {str(couple[0]), str(couple[1])} == {a, b}:
            return True
    ba, bb = a.lower(), b.lower()
    for sp, sn in SUFFIXES_PAIRE:
        if ba.endswith(sp) and bb.endswith(sn) and ba[:-len(sp)] == bb[:-len(sn)]:
            return True
        if bb.endswith(sp) and ba.endswith(sn) and bb[:-len(sp)] == ba[:-len(sn)]:
            return True
    return False


def _axe(obj):
    """(origine, direction unitaire, longueur) d'un troncon, ou None."""
    bouts = _extremites(obj)
    if bouts is None:
        return None
    (x1, y1), (x2, y2) = bouts
    dx, dy = x2 - x1, y2 - y1
    longueur = math.hypot(dx, dy)
    if longueur < 1e-9:
        return None
    return (x1, y1), (dx / longueur, dy / longueur), longueur


def _boite(axe, marge):
    """La boite englobante d'un troncon, elargie de `marge`."""
    (x, y), (ux, uy), longueur = axe
    x2, y2 = x + ux * longueur, y + uy * longueur
    return (min(x, x2) - marge, min(y, y2) - marge,
            max(x, x2) + marge, max(y, y2) + marge)


def _longement(a, b, axe_a=None, boite_a=None):
    """Deux troncons se longent-ils, et de combien ? En millimetres.

    Rend (recouvrement, ecart_axe, cote) ou None. `ecart_axe` est la distance
    ENTRE LES AXES -- la largeur des deux pistes s'en retranche plus loin, la
    ou on la connait --, et `cote` vaut +1 ou -1 selon que b passe a gauche ou
    a droite de a, dans le sens de parcours de a.

    ON PROJETTE B SUR L'AXE DE A, et le recouvrement est l'intersection des
    deux intervalles. C'est exact pour deux segments paralleles, et c'est la
    seule chose qui ait un sens quand ils ne le sont qu'a quelques degres pres.

    `axe_a` et `boite_a` sont les memes valeurs pour tous les voisins d'une
    meme victime : l'appelant les calcule une fois. LA BOITE N'EST PAS UN
    RAFFINEMENT -- une selection de cent troncons face a six cents voisins fait
    soixante mille couples, dont la quasi-totalite est a l'autre bout de la
    carte, et quatre comparaisons les ecartent avant toute trigonometrie.
    """
    axe_a = axe_a or _axe(a)
    axe_b = _axe(b)
    if axe_a is None or axe_b is None:
        return None
    if boite_a is None:
        boite_a = _boite(axe_a, ECART_COUPLAGE_MAX)
    bx1, by1, bx2, by2 = _boite(axe_b, 0.0)
    if bx2 < boite_a[0] or bx1 > boite_a[2]             or by2 < boite_a[1] or by1 > boite_a[3]:
        return None
    (ax, ay), (ux, uy), la = axe_a
    (bx, by), (vx, vy), lb = axe_b

    # Paralleles ? Le signe du produit scalaire ne compte pas : une piste
    # dessinee en sens inverse longe tout autant.
    cos = abs(ux * vx + uy * vy)
    if cos < math.cos(math.radians(ANGLE_PARALLELE)):
        return None

    # Les deux bouts de b, en coordonnees (le long de a, perpendiculaire a a).
    def projete(x, y):
        dx, dy = x - ax, y - ay
        return dx * ux + dy * uy, -dx * uy + dy * ux

    t1, n1 = projete(bx, by)
    t2, n2 = projete(bx + vx * lb, by + vy * lb)
    debut, fin = min(t1, t2), max(t1, t2)
    recouvrement = min(fin, la) - max(debut, 0.0)
    if recouvrement < RECOUVREMENT_MIN:
        return None

    # L'ECART EST PRIS AU MILIEU DU RECOUVREMENT, et non a un bout : sur deux
    # pistes qui divergent de quelques degres, prendre un bout donnerait le
    # meilleur ou le pire des cas selon le sens de dessin.
    milieu = (max(debut, 0.0) + min(fin, la)) / 2.0
    if abs(t2 - t1) > 1e-9:
        u = (milieu - t1) / (t2 - t1)
        n = n1 + u * (n2 - n1)
    else:
        n = 0.5 * (n1 + n2)
    if abs(n) < 1e-9:
        return None
    return recouvrement, abs(n), (1 if n > 0 else -1)


def _scenes_paralleles(objets, voisinage, refs=()):
    """Ce qui longe la selection, rassemble en SECTIONS a resoudre.

    UNE SECTION, PAS UNE SUITE DE PAIRES. Une piste avec deux voisines n'est
    pas deux problemes a deux conducteurs : c'est UN probleme a trois, et les
    deux voisines se prennent du champ l'une a l'autre autant qu'elles en
    prennent a la piste du milieu. Les resoudre deux fois separement compterait
    deux fois le meme champ et surestimerait les deux couplages.

    On rassemble donc, par (couche, net de la selection), tout ce qui longe :
    chaque net voisin devient un CONDUCTEUR de la section, pose a sa distance
    reelle et DU BON COTE. La selection est au centre, a x = 0 ; le cote droit
    est celui que la page appelle « droite ».

    LES ECARTS A LA MASSE SUIVENT. Chaque troncon de la selection porte deja
    ses deux ecarts au cuivre de masse, mesures par la page -- et les deux
    outils les mesurent sur les PLANS, sans voir les pistes : `gap_left` est
    donc la distance de la selection au plan de gauche, MEME quand une piste
    voisine se trouve entre les deux. C'est exactement ce qu'il faut : le plan
    borde le GROUPE, et l'ecart du groupe est celui de la selection moins le
    cuivre qu'on a ajoute de ce cote-la.

    UNE VOISINE DE MASSE N'EST PAS UNE VOISINE, C'EST UNE GARDE. Une piste du
    net de reference qui longe la selection est le bouclier qu'on pose
    justement contre la diaphonie : elle entre dans la section comme un
    conducteur TENU A ZERO VOLT -- elle occupe la place, elle prend du champ,
    et elle n'a ni impedance differentielle ni bruit a elle. La prendre pour un
    agresseur ferait afficher une Z differentielle entre un signal et la masse,
    et un NEXT que personne ne subit.

    Rend une liste de scenes, la plus longue d'abord.
    """
    refs = set(str(x) for x in (refs or ()))
    scenes = {}
    for victime in objets:
        couche = int(_nombre(victime.get("layer"), 0))
        net_v = str(victime.get("net") or "")
        w_v = _nombre(victime.get("width"))
        if not (w_v > 0) or not net_v:
            continue
        axe_v = _axe(victime)
        if axe_v is None:
            continue
        boite_v = _boite(axe_v, ECART_COUPLAGE_MAX + w_v / 2.0)
        gap_g, gap_d = _ecarts(victime)
        trouves = []
        for agresseur in voisinage:
            if int(_nombre(agresseur.get("layer"), -1)) != couche:
                continue
            net_a = str(agresseur.get("net") or "")
            # SANS NET, ON NE GROUPE RIEN : deux troncons anonymes ne se
            # rassemblent pas, et un net face a lui-meme n'est pas un couplage,
            # c'est la meme liaison.
            if not net_a or net_a == net_v:
                continue
            w_a = _nombre(agresseur.get("width"))
            if not (w_a > 0):
                continue
            longe = _longement(victime, agresseur, axe_v, boite_v)
            if longe is None:
                continue
            recouvrement, entre_axes, cote = longe
            ecart = entre_axes - (w_v + w_a) / 2.0
            # Du cuivre qui se touche n'est pas deux lignes ; du cuivre trop
            # loin n'est plus un couplage lisible.
            if not (0 < ecart <= ECART_COUPLAGE_MAX):
                continue
            trouves.append((net_a, w_a, recouvrement, ecart, entre_axes,
                            cote, net_a in refs))

        if not trouves:
            continue

        cle = (couche, net_v)
        sc = scenes.get(cle)
        if sc is None:
            sc = {"couche": couche, "net": net_v, "voisins": {},
                  "longueur_victime": 0.0, "_w": 0.0, "_g": 0.0, "_d": 0.0,
                  "epaisseur": _nombre(victime.get("copper_thickness"), 0.035)}
            scenes[cle] = sc
        # LES COTES DE LA SELECTION SONT PONDEREES PAR LA LONGUEUR DES TRONCONS
        # QUI LONGENT, et non par toute la selection : une liaison de cent
        # millimetres dont dix longent une voisine a une section de couplage,
        # et c'est celle de ces dix millimetres-la.
        long_seg = axe_v[2]
        sc["longueur_victime"] += long_seg
        sc["_w"] += w_v * long_seg
        sc["_g"] += gap_g * long_seg
        sc["_d"] += gap_d * long_seg

        for net_a, w_a, recouvrement, ecart, entre_axes, cote, garde \
                in trouves:
            # UNE GARDE SE RANGE PAR COTE, PAS PAR NET. Le net de masse est le
            # meme des deux cotes -- c'est un seul net sur toute la carte --, et
            # les moyenner poserait une garde imaginaire au milieu de la piste.
            cle_v = (net_a, cote) if garde else (net_a, 0)
            v = sc["voisins"].get(cle_v)
            if v is None:
                v = {"net": net_a, "longueur": 0.0, "ecart_min": ecart,
                     "troncons": 0, "_w": 0.0, "_axe": 0.0, "cotes": set(),
                     "garde": garde}
                sc["voisins"][cle_v] = v
            v["longueur"] += recouvrement
            v["troncons"] += 1
            v["ecart_min"] = min(v["ecart_min"], ecart)
            v["_w"] += w_a * recouvrement
            # LE COTE EST DANS LA POSITION, ET C'EST TOUT L'INTERET. `cote`
            # vaut +1 a gauche du sens de parcours ; on pose donc la voisine en
            # x negatif a gauche et positif a droite, comme la page nomme ses
            # deux ecarts. Une voisine des DEUX cotes -- un net qui encadre la
            # selection -- se moyenne alors vers zero, ce qui n'a pas de sens :
            # `cotes` le retient pour qu'on le dise.
            v["_axe"] += (-cote) * entre_axes * recouvrement
            v["cotes"].add(cote)

    sortie = []
    for sc in scenes.values():
        total = sc["longueur_victime"]
        if not (total > 0) or not sc["voisins"]:
            continue
        sc["largeur"] = sc["_w"] / total
        sc["gap_g"] = sc["_g"] / total
        sc["gap_d"] = sc["_d"] / total
        voisins = []
        for v in sc["voisins"].values():
            lv = v["longueur"]
            if not (lv > 0):
                continue
            v["largeur"] = v["_w"] / lv
            v["x"] = v["_axe"] / lv
            v["ecart"] = abs(v["x"]) - (sc["largeur"] + v["largeur"]) / 2.0
            v["deux_cotes"] = len(v["cotes"]) > 1
            v["cote"] = "gauche" if v["x"] < 0 else "droite"
            for k in ("_w", "_axe", "cotes"):
                v.pop(k)
            voisins.append(v)
        # LE PLUS PROCHE D'ABORD : c'est lui qui compte, et c'est lui qu'on
        # garde quand la section est pleine.
        voisins.sort(key=lambda v: abs(v["x"]))
        sc["voisins"] = voisins
        for k in ("_w", "_g", "_d"):
            sc.pop(k)
        sortie.append(sc)
    sortie.sort(key=lambda sc: -sc["longueur_victime"])
    return sortie


def _poser_section(scene):
    """La scene, ramenee a une liste de conducteurs qui ne se chevauchent pas.

    Rend (conducteurs, ecartes) en MILLIMETRES : le premier element est la
    SELECTION, a x = 0, suivie des voisines retenues. `ecartes` porte celles
    qu'on n'a pas pu poser, avec la raison -- et il faut qu'il y en ait une,
    parce qu'une voisine qui disparait sans un mot se lit comme un couplage
    nul.

    DEUX RAISONS DE NE PAS POSER UNE VOISINE. La section est pleine -- le
    solveur s'arrete a `ligne_mom.MAX_CONDUCTEURS`, et au-dela ce n'est plus
    une section
    qu'on lit --, ou bien deux voisines se CHEVAUCHENT une fois moyennees :
    deux nets qui passent tour a tour au meme endroit, chacun sur la moitie de
    la longueur, se retrouvent a la meme abscisse moyenne, ou il n'y a de place
    que pour un.
    """
    poses = [{"net": scene["net"], "x": 0.0, "w": scene["largeur"],
              "selection": True, "garde": False}]
    ecartes = []
    # LE PLAFOND EST CELUI DU SOLVEUR, et il est lu chez lui : deux constantes
    # pour une meme limite finiraient par diverger, et c'est `solve_multiline`
    # qui refuse.
    plafond = tl.MAX_CONDUCTEURS
    for v in scene["voisins"]:
        if len(poses) >= plafond:
            ecartes.append({"net": v["net"],
                            "raison": "section pleine (%d conducteurs)"
                                      % plafond})
            continue
        gene = None
        for p in poses:
            if abs(v["x"] - p["x"]) < (v["largeur"] + p["w"]) / 2.0:
                gene = p["net"]
                break
        if gene is not None:
            ecartes.append({"net": v["net"],
                            "raison": "chevauche « %s » une fois les positions"
                                      " moyennees" % gene})
            continue
        poses.append({"net": v["net"], "x": v["x"], "w": v["largeur"],
                      "selection": False, "longueur": v["longueur"],
                      "ecart": v["ecart"], "ecart_min": v["ecart_min"],
                      "troncons": v["troncons"], "cote": v["cote"],
                      "deux_cotes": v["deux_cotes"],
                      "garde": bool(v.get("garde"))})
    return poses, ecartes


def _ecarts_masse_du_groupe(poses, scene):
    """Les deux ecarts au plan coplanaire, pour le GROUPE et non pour la piste.

    C'EST CE QUI MANQUAIT, ET C'EST RECUPERABLE SANS RIEN MESURER DE PLUS.
    Les deux pages mesurent l'ecart de la selection au cuivre de MASSE, cote
    par cote, en sondant depuis son bord -- et toutes deux ne voient que les
    PLANS : une piste voisine ne les arrete pas. `gap_left` est donc la
    distance de la selection au plan de gauche, y compris quand une voisine se
    trouve entre les deux.

    Le plan borde donc le GROUPE, et l'ecart du groupe est celui de la
    selection MOINS le cuivre qu'on a ajoute de ce cote-la :

        ecart_gauche = gap_left - (bord gauche du groupe rapporte a celui de la
                                   selection)

    Negatif ou nul, cela veut dire que le cuivre trouve par la sonde est AU
    NIVEAU d'une voisine ou en deca : il n'y a pas de plan a portee de ce
    cote-la, et l'on n'en pose pas. C'est le seul cas ou le calcul reste
    majorant, et il se dit.
    """
    w_v = scene["largeur"]
    x_min = min(p["x"] - p["w"] / 2.0 for p in poses)
    x_max = max(p["x"] + p["w"] / 2.0 for p in poses)
    ajout_g = (-w_v / 2.0) - x_min
    ajout_d = x_max - (w_v / 2.0)
    e_g = scene["gap_g"] - ajout_g
    e_d = scene["gap_d"] - ajout_d
    return (e_g if e_g > 0 else 0.0), (e_d if e_d > 0 else 0.0)


def _temps_montee(analyse):
    """Le temps de montee retenu, en secondes.

    IL VIENT DE LA PAGE quand elle le donne. Sinon on le DEDUIT du haut de la
    bande analysee par la regle du genou -- BW = 0,35 / t_r --, qui est
    l'equivalence courante entre un front et une bande. Le deduire vaut mieux
    que de poser une nanoseconde en dur : quelqu'un qui analyse jusqu'a 10 GHz
    ne travaille pas avec les memes fronts que quelqu'un qui s'arrete a 200 MHz.
    """
    t_r = _nombre(analyse.get("temps_montee"), 0.0)
    if t_r > 0:
        return t_r, "saisi"
    f_fin = _nombre(analyse.get("f_fin"), 0.0)
    if f_fin > 0:
        return 0.35 / f_fin, "deduit de la bande (0,35 / f_max)"
    return 100e-12, "repli"


def _fiche_longement(scene, poses, pose, rangs, r, t_r, declarees):
    """Une ligne de fiche : ce qui passe entre la selection et UNE voisine.

    LES DEUX SENS, ET ILS NE SONT PAS EGAUX. « Ce que ma piste prend » et « ce
    que ma piste envoie » sont deux questions differentes des que les deux
    pistes n'ont pas la meme largeur : le bruit se compte en fraction de
    l'amplitude de L'AGRESSEUR, et se rapporte aux termes propres de
    l'agresseur. Une piste large qui agresse une piste fine ne recoit pas
    d'elle ce qu'elle lui envoie.

    On rend donc les deux, calcules sur la MEME matrice, sans rien resoudre de
    plus : `emis` prend la selection pour agresseur, `recu` prend la voisine.
    """
    i_v = rangs[0]
    i_a = rangs[poses.index(pose)]
    longueur = pose["longueur"]
    emis = tl.diaphonie(r["c"], r["l"], longueur * 1e-3, t_r, i_v, i_a)
    recu = tl.diaphonie(r["c"], r["l"], longueur * 1e-3, t_r, i_a, i_v)

    # Z DIFFERENTIELLE DE LA PAIRE, LES AUTRES A LA MASSE. Voir
    # `ligne_mom.sous_systeme` : c'est une reduction exacte, et la seule facon
    # de parler d'une paire prise dans un bus.
    c_p, l_p = tl.sous_systeme(r["c"], r["c0"], [i_v, i_a])
    paire = tl.modes_paire(c_p, l_p)

    def bruit(d):
        return {
            "next": round(d["next"], 5), "fext": round(d["fext"], 5),
            "k_c": round(d["k_c"], 5), "k_l": round(d["k_l"], 5),
            "k_arriere": round(d["k_arriere"], 5),
            "k_avant": round(d["k_avant"], 5),
            "sature": d["sature"],
            "longueur_saturation": round(1e3 * d["longueur_saturation"], 3),
            "retard": d["retard"],
        }

    return {
        "couche": scene["couche"], "net": scene["net"],
        "net_voisin": pose["net"],
        "longueur": round(longueur, 3),
        "ecart": round(pose["ecart"], 4),
        "ecart_min": round(pose["ecart_min"], 4),
        "largeur": round(scene["largeur"], 4),
        "largeur_voisine": round(pose["w"], 4),
        "cote": pose["cote"],
        "troncons": pose["troncons"],
        "deux_cotes": pose["deux_cotes"],
        "differentielle": _paire_nommee(scene["net"], pose["net"], declarees),
        "raison": "",
        "topo": r["_info"]["topo"],
        "h": round(1e3 * r["_info"]["h"], 4),
        "er": round(r["_info"]["er"], 3),
        "z_diff": round(paire["z_diff"], 3),
        "z_commune": round(paire["z_commune"], 3),
        "z_impair": round(paire["z_impair"], 3),
        "z_pair": round(paire["z_pair"], 3),
        "eps_eff_impair": round(paire["eps_eff_impair"], 4),
        "eps_eff_pair": round(paire["eps_eff_pair"], 4),
        "c_mutuelle": paire["c_mutuelle"],
        "l_mutuelle": paire["l_mutuelle"],
        # Z0 DE CHAQUE PISTE DANS LA SECTION, les autres a la masse : ce n'est
        # PAS son impedance isolee -- une voisine tenue a zero volt lui prend
        # du champ -- et le panneau doit pouvoir le nommer ainsi.
        "z0": round(r["lignes"][i_v]["z0"], 3),
        "z0_voisine": round(r["lignes"][i_a]["z0"], 3),
        "emis": bruit(emis),
        "recu": bruit(recu),
        # CE QUI JUGE EST CE QUE LA SELECTION SUBIT : c'est la question qu'on
        # pose en selectionnant une piste. L'autre sens est a cote, en clair.
        "next": round(recu["next"], 5),
        "fext": round(recu["fext"], 5),
        "sature": recu["sature"],
        "longueur_saturation": round(1e3 * recu["longueur_saturation"], 3),
        "k_c": round(recu["k_c"], 5), "k_l": round(recu["k_l"], 5),
        "k_arriere": round(recu["k_arriere"], 5),
        "k_avant": round(recu["k_avant"], 5),
        "retard": recu["retard"],
    }


def _couplage(couches, objets, doc, analyse, avertissements):
    """Z differentielle et diaphonie de tout ce qui longe la selection.

    UNE SECTION PAR SCENE, ET UNE SCENE PAR (COUCHE, NET SELECTIONNE). Toutes
    les voisines d'une meme piste entrent dans la MEME matrice : une piste avec
    deux voisines est un probleme a trois conducteurs, pas deux problemes a
    deux. De cette matrice sortent, pour chaque voisine, les deux sens du bruit
    et la Z differentielle de la paire -- sans rien resoudre de plus.

    LA MASSE COPLANAIRE Y EST. Voir `_ecarts_masse_du_groupe` : les ecarts
    mesures par la page bordent le groupe, parce que les deux outils sondent
    les PLANS sans voir les pistes. Un plan a portee reduit le couplage, et le
    calcul le rend maintenant au lieu de le majorer.
    """
    voisinage = doc.get("voisinage") or []
    if len(voisinage) > MAX_VOISINAGE:
        voisinage = voisinage[:MAX_VOISINAGE]
        avertissements.append(
            "Voisinage tronqué à %d tronçons : le couplage n'est chiffré que"
            " sur les plus proches." % MAX_VOISINAGE)
    refs = [str(x) for x in (doc.get("reference_nets") or []) if str(x).strip()]
    scenes = _scenes_paralleles(objets, voisinage, refs)
    t_r, source_tr = _temps_montee(analyse)
    declarees = doc.get("paires") or []

    paires, sections, cache = [], [], {}
    for scene in scenes[:MAX_SECTIONS]:
        poses, ecartes = _poser_section(scene)
        e_g, e_d = _ecarts_masse_du_groupe(poses, scene)
        cle = (scene["couche"], round(scene["epaisseur"], 6),
               round(e_g, 6), round(e_d, 6),
               tuple((round(p["x"], 6), round(p["w"], 6)) for p in poses))
        if cle not in cache:
            geo, info = section_de_couche(couches, scene["couche"],
                                          scene["largeur"], scene["epaisseur"],
                                          e_g, e_d)
            if geo is None:
                cache[cle] = {"raison": info}
            else:
                try:
                    geo = dict(geo)
                    geo["conducteurs"] = [{"w": p["w"] * 1e-3,
                                           "x": p["x"] * 1e-3,
                                           "masse": p["garde"]}
                                          for p in poses]
                    r = dict(tl.solve_multiline(geo))
                except Exception as exc:               # noqa: BLE001
                    cache[cle] = {"raison": str(exc)}
                else:
                    r["_info"] = info
                    cache[cle] = {"r": r, "raison": ""}
        c = cache[cle]

        fiche_section = {
            "couche": scene["couche"], "net": scene["net"],
            "conducteurs": [{"net": p["net"], "x": round(p["x"], 4),
                             "largeur": round(p["w"], 4),
                             "selection": p["selection"],
                             "garde": p["garde"]} for p in poses],
            "gardes": sum(1 for p in poses if p["garde"]),
            "ecart_g": round(e_g, 4), "ecart_d": round(e_d, 4),
            "gap_g": round(scene["gap_g"], 4),
            "gap_d": round(scene["gap_d"], 4),
            "ecartes": ecartes,
            "raison": c.get("raison", ""),
        }
        if not c.get("raison"):
            r = c["r"]
            # LE RANG DE CHAQUE CONDUCTEUR DANS [C]. `solve_multiline` range
            # les rubans de gauche a droite ; `ordre` rend le numero d'entree
            # de chaque port, et l'on inverse. Lire [C] dans l'ordre d'entree
            # donnerait la diaphonie de la mauvaise paire, en silence.
            # LES GARDES N'ONT PAS DE LIGNE DANS [C] : `ordre` ne porte que
            # les PORTS. Le dictionnaire ne contient donc que les conducteurs
            # qu'on peut interroger, et une garde interrogee par megarde leve
            # au lieu de rendre le voisin d'a cote.
            rangs = {}
            for rang_matrice, rang_entree in enumerate(r["ordre"]):
                rangs[rang_entree] = rang_matrice
            fiche_section.update({
                "topo": r["_info"]["topo"],
                "h": round(1e3 * r["_info"]["h"], 4),
                "er": round(r["_info"]["er"], 3),
                "z0_selection": round(r["lignes"][rangs[0]]["z0"], 3),
            })
            for pose in poses[1:]:
                if pose["garde"]:
                    continue
                paires.append(_fiche_longement(scene, poses, pose, rangs, r,
                                               t_r, declarees))
        else:
            for pose in poses[1:]:
                if pose["garde"]:
                    continue
                paires.append({
                    "couche": scene["couche"], "net": scene["net"],
                    "net_voisin": pose["net"],
                    "longueur": round(pose["longueur"], 3),
                    "ecart": round(pose["ecart"], 4),
                    "ecart_min": round(pose["ecart_min"], 4),
                    "largeur": round(scene["largeur"], 4),
                    "largeur_voisine": round(pose["w"], 4),
                    "cote": pose["cote"], "troncons": pose["troncons"],
                    "deux_cotes": pose["deux_cotes"],
                    "differentielle": _paire_nommee(scene["net"], pose["net"],
                                                    declarees),
                    "raison": c["raison"],
                })
        sections.append(fiche_section)

    # LE PIRE D'ABORD, ET DANS LES DEUX SENS. Trie par longueur, la fiche
    # mettrait en tete un longement long et lache devant un court et serre ;
    # c'est le BRUIT qui ordonne, et c'est la question qu'on se pose.
    def pire(f):
        return max(abs(f.get(sens, {}).get(quoi, 0.0))
                   for sens in ("recu", "emis") for quoi in ("next", "fext")) \
            if f.get("recu") else 0.0
    paires.sort(key=lambda f: -pire(f))

    ecartees = max(0, len(scenes) - MAX_SECTIONS)
    if ecartees:
        avertissements.append(
            "%d section(s) couplée(s) de plus n'ont pas été chiffrées : seules"
            " les %d plus longues le sont." % (ecartees, MAX_SECTIONS))
    return {
        "paires": paires,
        "sections": sections,
        "temps_montee": t_r,
        "temps_montee_source": source_tr,
        "voisinage": len(voisinage),
        "longements": sum(len(sc["voisins"]) for sc in scenes),
        # CE QUE LA SECTION COUPLEE SUPPOSE, avec le resultat et non a cote.
        "hypotheses": [
            "Le couplage n'est calculé qu'entre pistes de la MÊME couche et"
            " parallèles à %g° près : c'est ce qu'une section droite sait"
            " décrire. Deux pistes superposées sur deux couches, ou qui se"
            " croisent, couplent aussi et ne sont pas ici."
            % ANGLE_PARALLELE,
            "Toutes les voisines d'une même piste entrent dans la MÊME"
            " section : une piste et ses deux voisines font un problème à"
            " trois conducteurs, pas deux problèmes à deux. La masse"
            " coplanaire borde le groupe, à l'écart que la page a mesuré, et"
            " une piste du net de masse qui longe est posée comme une PISTE DE"
            " GARDE — dans la section, à zéro volt, sans port.",
            "Le temps de montée retenu est %s. Il ne change ni [C] ni [L] :"
            " il décide de la SATURATION du NEXT et de l'amplitude du FEXT."
            % source_tr,
        ],
    }


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

    # LA TOPOLOGIE DE LA SELECTION, ET CE QU'ELLE AUTORISE. Voir `_topologie`.
    # ON REFUSE DESORMAIS LA CASCADE PLUTOT QUE DE L'ASSORTIR D'UNE RESERVE.
    # La version precedente rendait les parametres S dans TOUS les cas, avec
    # une phrase disant qu'ils ne voulaient rien dire. C'est le pire des deux :
    # la courbe s'affiche, elle a l'air d'un resultat, on l'exporte en .s2p et
    # le .s2p ne porte pas l'avertissement. Un chiffre faux qui voyage est pire
    # qu'un chiffre absent. Les impedances par troncon et la carte de chaleur,
    # elles, ne dependent que de la section de chacun : elles restent rendues.
    topo = _topologie(objets)
    ruptures, ruptures_detail = topo["ruptures"], topo["ruptures_detail"]
    refus = raison_topologie(topo)
    if refus:
        avertissements.append(
            "%s Les impédances par tronçon et la carte de chaleur restent"
            " justes — chacune ne dépend que de sa propre section." % refus)

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
    # LE RETARD ET LES PERTES SONT DES CUMULS LE LONG D'UN PARCOURS. Sur un net
    # ramifie ils additionnent des branches paralleles, ce qui ne correspond a
    # aucun trajet reel : la somme des longueurs d'un T n'est le chemin de
    # personne. On les rend quand meme -- ils disent la quantite de cuivre --
    # mais le panneau doit savoir qu'ils ne sont pas le retard de la liaison.
    ligne["cumuls_valides"] = bool(topo["cascadable"])

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

    # LE MODELE DE CHAQUE VIA, CALCULE UNE FOIS POUR TOUTES. Il lui faut les
    # troncons resolus -- la hauteur au plan de chaque pastille, la
    # permittivite, les plans de reference -- donc il ne peut pas se faire plus
    # tot ; et il doit se faire avant la cascade, qui le lit a chaque
    # frequence. Voir `_modele_transition` : c'est le meme chiffre qui est
    # affiche et qui est applique.
    omega_c = 2 * math.pi * fc
    refs_nets = set(str(x) for x in (doc.get("reference_nets") or [])
                    if str(x).strip())
    z_bornes = _z_empilage(couches)
    modeles_via = {}
    for trans in transitions:
        modeles_via[trans["troncon"]] = _modele_transition(
            trans, objets, segments, couches, z_bornes, refs_nets, omega_c, fc)

    avertissements.extend(_avertir_retour(transitions,
                                          analyse.get("f_fin", 0.0)))

    # LES VIAS QUE LA CHAINE N'A PAS VUS. Voir `_vias_hors_chaine` : sur un net
    # ramifie il n'y a pas de parcours, donc pas de transition, donc aucun
    # chemin de retour -- alors que le via est la. On analyse ici ceux que la
    # page envoie a part, et on ECARTE ceux que la chaine a deja pris, pour
    # qu'un meme via ne soit pas chiffre deux fois avec deux valeurs.
    deja = set()
    for t in transitions:
        r = t.get("retour") or {}
        if r.get("x") is not None and r.get("y") is not None:
            deja.add((round(float(r["x"]), 3), round(float(r["y"]), 3)))
    bruts = [v for v in (doc.get("vias") or [])
             if (round(_nombre((v or {}).get("x"), 0.0), 3),
                 round(_nombre((v or {}).get("y"), 0.0), 3)) not in deja]
    vias_seuls = _vias_hors_chaine(bruts, couches, z_bornes, refs_nets)

    # LOT 3b : construire les index de discontinuités par tronçon
    # Chaque coude ou transition insère sa matrice ABCD après le tronçon i
    coudes_par_troncon = {c["troncon"]: c for c in coudes}
    transitions_par_troncon = {t["troncon"]: t for t in transitions}

    freqs = np.linspace(analyse["f_debut"], analyse["f_fin"], analyse["points"])
    if freqs.size and np.min(np.abs(freqs - fc)) > 1e-6 * max(fc, 1.0):
        freqs = np.sort(np.append(freqs, fc))
    matrices = []
    # PAS DE CASCADE SUR CE QUI N'EST PAS UNE CHAINE. `freqs` reste rendu :
    # l'axe de l'analyse est ce qui a ete demande, il ne depend pas de la
    # topologie et le panneau s'en sert pour dire sur quelle bande il
    # aurait calcule.
    for f in (freqs if topo["cascadable"] else []):
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

            # LA DISCONTINUITE SE POSE AVANT LE TRONCON QU'ELLE PRECEDE.
            #
            # `_coudes` et `_transitions` rangent l'une et l'autre au rang du
            # troncon d'ARRIVEE : un coude entre les troncons 0 et 1 porte
            # « troncon 1 ». La cascade, elle, les inserait APRES avoir pose la
            # ligne du troncon 1 -- donc entre 1 et 2, et non entre 0 et 1.
            # Chaque discontinuite etait decalee d'un troncon vers la sortie, et
            # la DERNIERE sortait carrement du parcours : sur la liaison a trois
            # troncons et deux vias qui motive tout ce lot, le second via se
            # retrouvait AU-DELA DU PORT 2.
            #
            # POURQUOI PERSONNE NE L'AVAIT VU. Sur deux troncons de meme
            # impedance, les deux ordres donnent EXACTEMENT le meme |S11| : une
            # ligne uniforme et un reseau en pi sont tous deux symetriques, et
            # le produit de deux matrices symetriques rend le meme S11 dans les
            # deux sens. Il faut trois troncons pour que l'erreur se voie -- on
            # mesure alors 0,34 dB de |S11| et 2,7 degres de phase a 3 GHz.
            if i in coudes_par_troncon:
                coude = coudes_par_troncon[i]
                # TOUT EN METRES, et la HAUTEUR AU PLAN avec : c'est le
                # parametre dominant du modele de Gupta, et il manquait.
                abcd = abcd @ tl.abcd_coude(seg["largeur"] * 1e-3,
                                            max(seg.get("h", 0.0), 1e-9) * 1e-3,
                                            seg.get("er", 4.3), float(f),
                                            coude["angle_deg"])

            # LE L ET LE C VIENNENT DE `_modele_transition`, calcules plus
            # haut : L est l'inductance de BOUCLE avec les vias de masse qui la
            # referment, C compte les antipads et les pastilles a la distance de
            # leur plan. Les recalculer ici, c'etait la porte ouverte a une
            # fiche et une courbe qui ne disent pas la meme chose.
            # LES MOIGNONS SE RECALCULENT A CHAQUE FREQUENCE, et il le faut :
            # un moignon n'est une capacite que loin de sa resonance. Le figer
            # a la valeur du point central ferait manquer exactement ce qu'on
            # veut voir -- le creux ou il court-circuite la liaison.
            if i in transitions_par_troncon:
                mv = modeles_via[i]
                abcd = abcd @ tl.abcd_via_complet(
                    mv["l"], mv["c"], float(f),
                    _admittance_moignon(mv["moignon_depart"], mv["percage"],
                                        mv["antipad"], float(f)),
                    _admittance_moignon(mv["moignon_arrivee"], mv["percage"],
                                        mv["antipad"], float(f)),
                    _impedance_traversee(mv["cavite"], float(f)))

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

    # LOT 3b : enrichir les discontinuités avec les valeurs modélisées
    # CE QUI EST AFFICHE EST CE QUI EST APPLIQUE. Les memes fonctions, les
    # memes entrees, et la phase que l'element vaut A LA FREQUENCE CENTRALE de
    # l'analyse -- pas a 5 GHz pose en dur, ce qu'ecrivait la version
    # precedente quelle que soit la bande demandee.
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

    # Les transitions, elles, ont ete modelisees avant la cascade : elles en
    # avaient besoin. Voir `_modele_transition`.

    # LE COUPLAGE, dernier calcul et le seul qui regarde HORS de la selection.
    # Il n'a besoin ni de la cascade ni des discontinuites -- seulement de la
    # geometrie et de l'empilage -- mais il vient apres pour que ses
    # avertissements se rangent a la suite des autres.
    couplage = _couplage(couches, objets, doc, analyse, avertissements)

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
            # LES VIAS HORS PARCOURS, au meme format que les transitions mais
            # dans une liste distincte : ils portent un chemin de retour et une
            # inductance de boucle, et RIEN dans la cascade. Les melanger aux
            # transitions ferait croire qu'ils y entrent.
            "vias_hors_chaine": vias_seuls,
        },
        "freqs": [float(f) for f in freqs],
        "s": [[[float(v.real), float(v.imag)] for v in m.flatten()]
              for m in matrices],
        "ports": 2,
        # LE .s2p SUIT LA CASCADE, et disparait avec elle. Un Touchstone
        # d'une ligne d'en-tete sans donnee serait un fichier valide et vide,
        # que l'outil d'en face lirait comme « aucune reflexion » : on n'en
        # ecrit pas du tout.
        "touchstone": (touchstone(freqs, matrices, z_ref, entete)
                       if matrices else ""),
        # CE QUE LA SELECTION EST, ET CE QUE CELA AUTORISE. Voir `_topologie`.
        # `cascade_refusee` porte la phrase et rien d'autre : le panneau
        # l'affiche a la place de la courbe, et n'a pas a rejouer le
        # diagnostic pour retrouver quoi dire.
        "topologie": topo,
        "cascade_refusee": refus,
        # LE COUPLAGE : Z differentielle ET diaphonie, meme liste. Voir
        # `_couplage` -- les deux onglets de la famille SI la lisent, chacun
        # avec ses colonnes.
        "couplage": couplage,
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
