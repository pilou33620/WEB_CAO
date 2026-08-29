#!/usr/bin/python3
# -*- coding: utf-8 -*-
# ==========================================
# VERSIONING
# Version: 2.0.0
# Date: 2026-08-29
# Explication: REECRITURE. La 1.0.0 n'etait pas un solveur : elle montait un
#   reseau de resistances sur le PERIMETRE des polygones -- le courant faisait
#   le tour du cuivre au lieu de le traverser --, elle passait `tol=` a
#   scipy.sparse.linalg.cg (retire de SciPy 1.14, et ce depot tourne sur
#   1.16), et elle RATTRAPAIT l'exception pour rendre un potentiel
#   identiquement nul. Une chute de zero volt sur toute la carte est le pire
#   des resultats : elle a l'air d'une bonne nouvelle.
#
#   Ce qui la remplace :
#     - un maillage SURFACIQUE : chaque couche est tramee au pas demande, une
#       cellule par carreau de cuivre, et les voisines de meme net sont reliees
#       par une conductance. Sur une trame carree, cette conductance vaut
#       exactement sigma*t, si bien qu'un barreau redonne rho*L/(W*t) a la
#       precision de la trame -- c'est ce que le banc verifie ;
#     - les VIAS en resistances localisees entre couches, section d'anneau ;
#     - des references DECLAREES (Dirichlet). Sans reference, le probleme est
#       flottant et le solveur REFUSE au lieu d'ancrer un noeud au hasard ;
#     - une matrice qui reste SYMETRIQUE DEFINIE POSITIVE : les inconnues de
#       Dirichlet sortent du systeme au lieu d'etre ecrasees ligne par ligne,
#       ce qui detruisait la symetrie sous un gradient conjugue qui la suppose.
# Fonctions : mailler, resoudre_dc, resoudre_document, carte_chaleur, etat
#
# Version: 1.0.0
# Date: 2026-08-28
# Explication: premiere ebauche (reseau sur les aretes).
# ==========================================
"""Chute de tension continue dans le cuivre -- IR drop.

CE N'EST PAS DE L'ELECTROMAGNETISME. Pas de frequence, pas de champ : un
probleme resistif reel sur les formes de cuivre, a matrice symetrique definie
positive. Un gradient conjugue et rien de plus.

    >>> from dc_solver import resoudre_dc
    >>> barreau = [{"vertices": [[0, 0], [10e-3, 0], [10e-3, 1e-3], [0, 1e-3]],
    ...             "couche": 0, "net": "VCC", "epaisseur": 35e-6}]
    >>> r = resoudre_dc(barreau,
    ...                 sources=[{"x": 0.2e-3, "y": 0.5e-3, "couche": 0,
    ...                           "net": "VCC", "courant": 1.0,
    ...                           "rayon": 0.2e-3}],
    ...                 references=[{"x": 9.8e-3, "y": 0.5e-3, "couche": 0,
    ...                              "net": "VCC", "rayon": 0.2e-3}],
    ...                 pas=0.1e-3)
    >>> round(r["chute_par_net"]["VCC"], 4)
    0.0047

TOUTES LES LONGUEURS SONT EN METRES ici, comme dans ligne_mom.py. C'est
`resoudre_document` qui convertit depuis les millimetres du document
d'echange, et c'est le seul endroit ou la conversion a lieu.
"""

import logging
import math

logger = logging.getLogger(__name__)

try:
    import numpy as np
    ERREUR_SOLVEUR = None
except Exception as _exc:                              # noqa: BLE001
    np = None
    ERREUR_SOLVEUR = _exc

RESISTIVITE_CUIVRE = 1.724e-8       # ohm.m a 20 degres, cuivre recuit (IPC)
EPAISSEUR_DEFAUT = 35e-6            # une once de cuivre
PLACAGE_DEFAUT = 25e-6              # placage de trou metallise courant

# Le maillage est le seul reglage qui coute : le nombre de noeuds va comme
# 1/pas^2. Ces bornes sont la pour qu'une trame demandee trop fine ne parte pas
# en memoire sans le dire -- c'est un refus explicite, pas un ecretage muet.
MAX_NOEUDS = 400000
FORMAT = "cao-sim-dc-1"
FORMAT_RESULTAT = "cao-sim-dc-resultat-1"


class ErreurDC(Exception):
    """Un refus qui dit ce qu'il faut changer, comme ErreurSimulation."""

    def __init__(self, message, conseil=""):
        Exception.__init__(self, message)
        self.message = message
        self.conseil = conseil


def etat():
    """Ce que le serveur sait calculer : la page le demande avant de lancer."""
    if ERREUR_SOLVEUR is not None:
        return {"dispo": False,
                "detail": "Solveur DC indisponible : %s" % ERREUR_SOLVEUR,
                "conseil": "Le solveur a besoin de numpy et de scipy :"
                           " « pip install numpy scipy »."}
    try:
        import scipy.sparse                            # noqa: F401
    except Exception as exc:                           # noqa: BLE001
        return {"dispo": False,
                "detail": "Solveur DC indisponible : %s" % exc,
                "conseil": "Le solveur a besoin de scipy :"
                           " « pip install scipy »."}
    return {"dispo": True, "format": FORMAT,
            "methode": "réseau résistif surfacique, gradient conjugué",
            "max_noeuds": MAX_NOEUDS}


# ==========================================================================
# La geometrie
# ==========================================================================

def _dans_polygone(x, y, sommets):
    """Le point est-il dans le polygone ? Lancer de rayon, pair/impair."""
    dedans = False
    n = len(sommets)
    j = n - 1
    for i in range(n):
        xi, yi = sommets[i]
        xj, yj = sommets[j]
        if (yi > y) != (yj > y):
            t = (y - yi) / (yj - yi) if yj != yi else 0.0
            if x < xi + t * (xj - xi):
                dedans = not dedans
        j = i
    return dedans


def _boite(polygones):
    xs = [v[0] for p in polygones for v in p["sommets"]]
    ys = [v[1] for p in polygones for v in p["sommets"]]
    return min(xs), min(ys), max(xs), max(ys)


def _normaliser(polygones):
    """Les polygones du document -> la forme interne, en metres."""
    out = []
    for p in polygones or []:
        sommets = p.get("vertices") or p.get("sommets") or []
        sommets = [(float(v[0]), float(v[1])) for v in sommets
                   if isinstance(v, (list, tuple)) and len(v) >= 2]
        if len(sommets) < 3:
            continue                       # un polygone a moins de trois
        out.append({                       # sommets ne porte pas de courant
            "sommets": sommets,
            "couche": int(p.get("couche", p.get("layer", 0)) or 0),
            "net": str(p.get("net") or "?"),
            "epaisseur": float(p.get("epaisseur",
                                     p.get("thickness", EPAISSEUR_DEFAUT))
                               or EPAISSEUR_DEFAUT),
            # UN TROU EST DU CUIVRE EN MOINS. Une decoupe de plan, un
            # anti-pad : la forme est donnee comme les autres, mais elle RETIRE
            # les carreaux au lieu de les poser. Sans cela un plan evide se
            # calculerait plein, et la chute ressortirait trop faible -- du
            # mauvais cote, celui qui rassure.
            "trou": bool(p.get("trou") or p.get("hole")),
        })
    return out


def mailler(polygones, pas):
    """Trame le cuivre, couche par couche, et rend les noeuds et les aretes.

    UNE CELLULE PAR CARREAU DE CUIVRE, prise a son centre. La conductance
    entre deux cellules voisines d'une trame CARREE vaut sigma*t*(a/a) =
    sigma*t : elle ne depend pas du pas, et c'est ce qui fait qu'un barreau
    tombe sur rho*L/(W*t) sans qu'on ait rien a ajuster. Raffiner la trame ne
    change donc que le contour et les constrictions -- c'est-a-dire ce que la
    trame decrit mal, et rien d'autre.

    Deux cellules ne sont reliees que si elles portent LE MEME NET : deux
    cuivres qui se croisent sur une meme couche sans se toucher ne conduisent
    pas l'un dans l'autre, et le lancer de rayon seul ne le saurait pas.
    """
    if not polygones:
        raise ErreurDC("Aucun cuivre à analyser.",
                       "Sélectionnez du cuivre sur la carte.")
    if not (pas > 0):
        raise ErreurDC("Pas de maillage nul ou négatif.")

    x0, y0, x1, y1 = _boite(polygones)
    nx = int(math.ceil((x1 - x0) / pas)) + 1
    ny = int(math.ceil((y1 - y0) / pas)) + 1
    couches = sorted({p["couche"] for p in polygones})
    if nx * ny * len(couches) > MAX_NOEUDS * 4:
        raise ErreurDC(
            "Trame trop fine : %d x %d carreaux sur %d couche(s)."
            % (nx, ny, len(couches)),
            "Augmentez le pas de maillage.")

    # `cases` : (couche, ix, iy) -> (net, epaisseur). Le DERNIER polygone
    # gagne, comme le cuivre pose par-dessus sur la carte.
    cases = {}
    # LE CUIVRE D'ABORD, LES TROUS ENSUITE : une decoupe posee avant le plan
    # qu'elle evide ne retirerait rien. L'ordre est donc impose ici, et non
    # laisse a celui qui remplit le document.
    for p in sorted(polygones, key=lambda q: bool(q.get("trou"))):
        sommets = p["sommets"]
        sx = [v[0] for v in sommets]
        sy = [v[1] for v in sommets]
        i0 = max(0, int((min(sx) - x0) / pas) - 1)
        i1 = min(nx - 1, int((max(sx) - x0) / pas) + 1)
        j0 = max(0, int((min(sy) - y0) / pas) - 1)
        j1 = min(ny - 1, int((max(sy) - y0) / pas) + 1)
        for ix in range(i0, i1 + 1):
            x = x0 + ix * pas
            for iy in range(j0, j1 + 1):
                y = y0 + iy * pas
                if _dans_polygone(x, y, sommets):
                    if p.get("trou"):
                        cases.pop((p["couche"], ix, iy), None)
                    else:
                        cases[(p["couche"], ix, iy)] = (p["net"],
                                                        p["epaisseur"])
                        p["carreaux"] = p.get("carreaux", 0) + 1

    if not cases:
        raise ErreurDC(
            "La trame ne rencontre aucun cuivre.",
            "Le pas de maillage est plus grand que les formes analysées :"
            " diminuez-le.")

    # UNE FORME QUI TIENT EN TROIS CARREAUX N'EST PAS MAILLEE, elle est
    # echantillonnee : sa resistance sort de la position de trois points, pas
    # de sa geometrie. On compte, et si AUCUNE forme n'est resolue, on refuse
    # -- rendre un chiffre serait rendre un chiffre faux. Si seulement
    # certaines le sont, elles ressortent en avertissement plus bas.
    par_polygone = [p.get("carreaux", 0) for p in polygones
                    if not p.get("trou")]
    if par_polygone and max(par_polygone) < 4:
        raise ErreurDC(
            "Trame trop grossière : la plus grande forme ne reçoit que"
            " %d carreau(x)." % max(par_polygone),
            "Diminuez le pas de maillage : il faut au moins quelques"
            " carreaux dans la largeur d'une piste pour que sa résistance"
            " veuille dire quelque chose.")
    if len(cases) > MAX_NOEUDS:
        raise ErreurDC(
            "Maillage trop lourd : %d noeuds, maximum %d."
            % (len(cases), MAX_NOEUDS),
            "Augmentez le pas de maillage ou restreignez la sélection.")

    index = {}
    coords = []
    nets = []
    epaisseurs = []
    cellules = []
    for cle in sorted(cases):
        couche, ix, iy = cle
        index[cle] = len(coords)
        coords.append((x0 + ix * pas, y0 + iy * pas, couche))
        nets.append(cases[cle][0])
        # L'EPAISSEUR PAR NOEUD sert a la DENSITE DE COURANT : un ampere dans
        # 35 um de cuivre n'est pas un ampere dans 70. Et `cellules` garde
        # l'adresse (couche, ix, iy) de chaque noeud, sans quoi retrouver ses
        # voisins demanderait de refaire l'arithmetique de la trame a l'envers.
        epaisseurs.append(cases[cle][1])
        cellules.append(cle)

    # Les aretes de la trame : voisin de droite et voisin du dessus, ce qui
    # donne chaque paire UNE fois.
    aretes = []
    for (couche, ix, iy), (net, ep) in cases.items():
        a = index[(couche, ix, iy)]
        for voisin in ((couche, ix + 1, iy), (couche, ix, iy + 1)):
            autre = cases.get(voisin)
            if autre is None or autre[0] != net:
                continue
            # Une arete entre deux epaisseurs differentes est la mise en serie
            # de deux demi-carreaux : la conductance harmonique le dit.
            e = 2.0 * ep * autre[1] / (ep + autre[1]) if (ep + autre[1]) else 0.0
            aretes.append((a, index[voisin], e / RESISTIVITE_CUIVRE))

    return {"index": index, "coords": coords, "nets": nets, "aretes": aretes,
            "epaisseurs": epaisseurs, "cellules": cellules,
            "pas": pas, "origine": (x0, y0), "taille": (nx, ny),
            "couches": couches}


def _noeuds_du_point(maillage, point, defaut_rayon=None, portee=None):
    """Les noeuds que touche un plot -- pastille, plage, broche.

    TROIS FILTRES, et le troisieme est celui qui manquait :

      · la COUCHE, toujours ;
      · la FORME : une `boite` (x0, y0, x1, y1) quand le plot est rectangulaire
        -- une pastille l'est presque toujours --, sinon un disque de `rayon` ;
      · le NET, quand le point en declare un. Sans lui, une reference de masse
        posee au milieu d'une carte attrape le cuivre du net voisin qui passe
        dans le meme disque, et le fixe a zero volt : le net d'a cote se
        retrouve alors sans chute, ce qui se lit comme un bon resultat.

    Rien dans la forme : le noeud le plus proche, du bon net et de la bonne
    couche. Un point d'injection tombe souvent a cote de la trame d'un carreau
    ou deux, et refuser pour cela serait pedant.

    `portee` BORNE CE REPLI, et il faut la donner pour un VIA. Une borne
    d'injection qu'on rabat de deux carreaux reste la borne qu'on visait ; un
    via rabattu de soixante-dix millimetres est un chemin vertical INVENTE,
    entre deux morceaux de cuivre qui ne se touchent pas. Au-dela de `portee`,
    on ne rend rien -- et l'appelant a alors de quoi le dire.
    """
    coords = maillage["coords"]
    nets = maillage["nets"]
    couche = int(point.get("couche", point.get("layer", 0)) or 0)
    net = point.get("net")
    net = str(net) if net not in (None, "", "?") else None
    boite_brute = point.get("boite") or point.get("box")
    if boite_brute and len(boite_brute) >= 4 and "x" not in point:
        # UNE BOITE PORTE SON PROPRE CENTRE. Sans cela, un plot decrit par un
        # rectangle et rien d'autre se replierait, quand la boite ne coiffe
        # aucun noeud, sur le noeud le plus proche de l'ORIGINE -- c'est-a-dire
        # a l'autre bout de la carte, en silence.
        x = (float(boite_brute[0]) + float(boite_brute[2])) / 2.0
        y = (float(boite_brute[1]) + float(boite_brute[3])) / 2.0
    else:
        x = float(point.get("x", 0.0))
        y = float(point.get("y", 0.0))

    def eligible(i):
        return (coords[i][2] == couche
                and (net is None or nets[i] == net))

    boite = point.get("boite") or point.get("box")
    if boite and len(boite) >= 4:
        x0, y0, x1, y1 = (float(boite[0]), float(boite[1]),
                          float(boite[2]), float(boite[3]))
        x0, x1 = min(x0, x1), max(x0, x1)
        y0, y1 = min(y0, y1), max(y0, y1)
        out = [i for i in range(len(coords)) if eligible(i)
               and x0 <= coords[i][0] <= x1 and y0 <= coords[i][1] <= y1]
        if out:
            return out
    else:
        r = float(point.get("rayon", point.get("radius", 0.0)) or 0.0)
        if r <= 0:
            r = float(defaut_rayon or 0.0)
        if r <= 0:
            r = maillage["pas"] * 0.75  # le carreau le plus proche, et lui seul
        r2 = r * r
        out = [i for i in range(len(coords)) if eligible(i)
               and (coords[i][0] - x) ** 2 + (coords[i][1] - y) ** 2 <= r2]
        if out:
            return out

    candidats = [(i, (coords[i][0] - x) ** 2 + (coords[i][1] - y) ** 2)
                 for i in range(len(coords)) if eligible(i)]
    if not candidats:
        return []
    plus_proche, d2 = min(candidats, key=lambda t: t[1])
    if portee is not None and d2 > float(portee) ** 2:
        return []
    return [plus_proche]



# ==========================================================================
# LA DENSITE DE COURANT, ET CE QU'ELLE ECHAUFFE
# --------------------------------------------------------------------------
# LA CHUTE NE DIT PAS TOUT. Une piste peut tenir sa chute et fondre quand
# meme : c'est la SECTION qui chauffe, pas la longueur. Un retrecissement de
# deux millimetres ne pese presque rien sur la tension et beaucoup sur la
# temperature -- et c'est exactement le defaut qu'aucun controle geometrique
# ne voit, parce que la piste y respecte sa largeur minimale.
#
# CE QU'ON CALCULE, ET COMMENT.
#
#   LA DENSITE. Le solveur connait deja le courant de chaque arete de la
#   trame : I = g (Va - Vb). Cette arete traverse une face de section
#   t * pas, donc J = I / (t * pas). Au centre d'un carreau, on reconstruit le
#   vecteur en moyennant la face qui entre et celle qui sort, dans chaque
#   direction -- c'est la reconstruction centree ordinaire, et au bout d'une
#   piste elle rend bien la moitie : rien ne sort par la face qui n'existe pas.
#
#   L'ECHAUFFEMENT. C'est IPC-2221, la charte historique :
#
#       I = k * dT^0.44 * A^0.725        A en mils carres, I en amperes
#       k = 0,048 en couche EXTERIEURE, 0,024 en couche INTERNE
#
#   qu'on inverse en dT = (I / (k A^0.725))^(1/0,44). Elle demande la SECTION
#   du conducteur, pas seulement la densite : on mesure donc la largeur locale
#   du cuivre sur la trame, perpendiculairement au courant.
#
# CE QUE CE CHIFFRE N'EST PAS, ET IL FAUT LE LIRE AINSI.
#
#   · IPC-2221 est une CHARTE EMPIRIQUE, relevee sur un conducteur ISOLE, a
#     l'air calme, sans cuivre voisin ni composant chaud. Elle ne connait ni le
#     stratifie, ni les plans qui evacuent, ni les pistes d'a cote.
#   · IPC-2152 lui a succede et donne des temperatures NOTABLEMENT plus basses
#     dans la plupart des cas, justement parce qu'elle tient compte de la
#     conduction du substrat. Elle n'est pas implementee ici : ce qu'on rend
#     est donc CONSERVATEUR, et c'est le bon sens de l'erreur.
#   · Ce n'est pas une simulation thermique. C'est une lecture de charte, faite
#     point par point sur une section mesuree.
# ==========================================================================

IPC2221_K_EXT = 0.048               # couche exterieure, a l'air libre
IPC2221_K_INT = 0.024               # couche interne, noyee dans le stratifie
MILS2_PAR_MM2 = 1.0 / (0.0254 ** 2)  # 1 mm2 = 1550,0031 mils2
LARGEUR_MAX_CARREAUX = 400          # au-dela, c'est un plan, pas une piste


def _echauffement_ipc2221(courant, section_mm2, externe):
    """La montee en temperature d'un conducteur, en kelvins. Voir plus haut.

    `section_mm2` est la section de CUIVRE (largeur x epaisseur). Rend 0 pour
    un courant ou une section nuls -- pas une exception : un carreau sans
    courant est le cas ordinaire, pas une anomalie.
    """
    i = abs(float(courant))
    a = float(section_mm2)
    if not (i > 0 and a > 0):
        return 0.0
    k = IPC2221_K_EXT if externe else IPC2221_K_INT
    mils2 = a * MILS2_PAR_MM2
    denom = k * (mils2 ** 0.725)
    if denom <= 0:
        return 0.0
    return float((i / denom) ** (1.0 / 0.44))


def _densite_et_echauffement(maillage, potentiel, rho, externes):
    """Par noeud : la densite de courant (A/mm2), la largeur locale du cuivre
    (mm) et la montee en temperature (K).

    DEUX PASSES, ET LA SECONDE EST CE QUI REND LE CHIFFRE UTILISABLE.

    La premiere calcule la densite EN CHAQUE POINT. C'est ce qu'il faut pour la
    carte de chaleur -- on veut voir ou le courant se presse.

    La seconde calcule la temperature, et elle ne peut pas se contenter du
    point : IPC-2221 demande le courant TOTAL d'un conducteur et sa SECTION.
    On mesure donc, perpendiculairement au courant, l'etendue du cuivre, et on
    INTEGRE la densite sur cette traversee. Le courant ainsi obtenu est celui
    qui passe vraiment, et il converge.

    POURQUOI CETTE DISTINCTION N'EST PAS UN RAFFINEMENT. A l'entree d'un
    retrecissement, l'angle rentrant rend la densite SINGULIERE : le pic croit
    sans borne quand on raffine la trame -- mesure sur une piste de 2 mm
    etranglee a 1 mm, 93,7 A/mm2 au pas de 0,2, 104,4 a 0,1, 129,3 a 0,05. Un
    maximum ponctuel n'est donc PAS un chiffre d'ingenieur : il dit ou regarder,
    pas combien. La moyenne sur la section, elle, est un flux a travers une
    coupe, et elle ne bouge plus.

    Rend (densites, largeurs, echauffements), trois listes alignees sur les
    noeuds du maillage.
    """
    index = maillage["index"]
    cellules = maillage["cellules"]
    eps = maillage["epaisseurs"]
    nets = maillage["nets"]
    pas = maillage["pas"]
    n = len(cellules)
    densites = [0.0] * n
    largeurs = [0.0] * n
    montees = [0.0] * n
    if not n:
        return densites, largeurs, montees

    def conductance(i, j):
        """Celle que `mailler` a posee : moyenne harmonique des epaisseurs."""
        a, b = eps[i], eps[j]
        if a + b <= 0:
            return 0.0
        return (2.0 * a * b / (a + b)) / rho

    def voisin(cle, dx, dy):
        return index.get((cle[0], cle[1] + dx, cle[2] + dy))

    # -- PREMIERE PASSE : la densite en chaque point ------------------------
    axes = [None] * n                      # l'axe dominant du courant
    for i in range(n):
        cle = cellules[i]
        t = eps[i]
        if t <= 0:
            continue
        face = t * pas                      # la section que traverse une arete
        composante = []
        for dx, dy in ((1, 0), (0, 1)):
            avant = voisin(cle, -dx, -dy)
            apres = voisin(cle, dx, dy)
            # Le courant qui ENTRE par la face amont, celui qui SORT par
            # l'aval. Une face absente ne laisse rien passer.
            entre = (conductance(avant, i) * (potentiel[avant] - potentiel[i])
                     if avant is not None and nets[avant] == nets[i] else 0.0)
            sort = (conductance(i, apres) * (potentiel[i] - potentiel[apres])
                    if apres is not None and nets[apres] == nets[i] else 0.0)
            composante.append((entre + sort) / 2.0)
        jx, jy = composante[0] / face, composante[1] / face   # A/m2
        densites[i] = math.hypot(jx, jy) * 1e-6                # A/mm2
        if densites[i] > 0:
            # Courant selon x -> la largeur se mesure selon y, et l'inverse.
            axes[i] = (0, 1) if abs(jx) >= abs(jy) else (1, 0)

    # -- SECONDE PASSE : LES COUPES ------------------------------------------
    # ON NE MESURE PLUS UNE LARGEUR AUTOUR D'UN POINT, ON COMPTE UN FLUX A
    # TRAVERS UNE COUPE. C'est la meme grandeur qu'IPC-2221 attend -- le
    # courant TOTAL d'un conducteur et sa SECTION -- et elle se lit exactement
    # sur la trame : chaque colonne de carreaux est une coupe, et la somme des
    # aretes qui la franchissent est le courant qui passe.
    #
    # POURQUOI PAS LE BALAYAGE LOCAL, qui etait ecrit ici avant. Il marchait
    # perpendiculairement a l'AXE DOMINANT du courant. Dans un angle rentrant
    # le courant est diagonal : le balayage traversait alors la marche au lieu
    # du conducteur, voyait une section trop courte et rendait une temperature
    # trop haute -- 21,9 K la ou le col de 1 mm en vaut 16,7, soit trente pour
    # cent de trop, sur une geometrie ou la reponse se pose a la main. Une
    # coupe ne se laisse pas tromper par la direction : elle compte ce qui
    # passe.
    #
    # UN CONDUCTEUR PAR SUITE CONTIGUE. Une colonne peut traverser plusieurs
    # cuivres sans rapport ; on ne somme donc que des carreaux VOISINS et DE
    # MEME NET, et chaque suite est un conducteur distinct.
    par_cellule = {}
    for k, cle in enumerate(cellules):
        par_cellule[cle] = k

    def coupe(axe):
        """`axe` = 0 : coupes verticales (le courant passe selon x)."""
        vus = set()
        for k, cle in enumerate(cellules):
            if k in vus:
                continue
            couche, ix, iy = cle
            # La suite contigue a laquelle ce carreau appartient, le long de
            # l'axe PERPENDICULAIRE au courant.
            pas_perp = (0, 1) if axe == 0 else (1, 0)
            suite = [k]
            for sens in (1, -1):
                m = 1
                while m <= LARGEUR_MAX_CARREAUX:
                    v = par_cellule.get((couche,
                                         ix + pas_perp[0] * sens * m,
                                         iy + pas_perp[1] * sens * m))
                    if v is None or nets[v] != nets[k]:
                        break
                    suite.append(v)
                    m += 1
            vus.update(suite)
            # Le courant qui FRANCHIT la coupe : les aretes qui partent de
            # chaque carreau de la suite vers la colonne suivante.
            pas_flux = (1, 0) if axe == 0 else (0, 1)
            total = 0.0
            section = 0.0
            for v in suite:
                cv = cellules[v]
                apres = par_cellule.get((cv[0], cv[1] + pas_flux[0],
                                         cv[2] + pas_flux[1]))
                if apres is not None and nets[apres] == nets[v]:
                    total += conductance(v, apres) * (potentiel[v]
                                                      - potentiel[apres])
                section += eps[v] * pas                       # m2
            if section <= 0:
                continue
            largeur_mm = len(suite) * pas * 1e3
            dt = _echauffement_ipc2221(total, section * 1e6,
                                       cellules[suite[0]][0] in externes)
            for v in suite:
                if dt > montees[v]:
                    montees[v] = dt
                    largeurs[v] = largeur_mm

    coupe(0)
    coupe(1)
    return densites, largeurs, montees


def _resistance_via(via):
    """La resistance d'un via : un anneau de cuivre plaque, en serie.

        R = rho * h / A     A = pi ((d/2 + p)^2 - (d/2)^2)

    `h` est la hauteur traversee, `d` le percage, `p` le placage. Une valeur
    donnee dans le document l'emporte : un fabricant qui mesure ses trous a
    raison contre n'importe quelle formule.
    """
    r = via.get("resistance")
    if r is not None:
        return max(float(r), 0.0)
    d = float(via.get("percage", via.get("drill", 0.3e-3)) or 0.3e-3)
    p = float(via.get("placage", via.get("plating", PLACAGE_DEFAUT))
              or PLACAGE_DEFAUT)
    h = float(via.get("hauteur", via.get("height", 1.6e-3)) or 1.6e-3)
    aire = math.pi * ((d / 2.0 + p) ** 2 - (d / 2.0) ** 2)
    if aire <= 0:
        return 0.0
    return RESISTIVITE_CUIVRE * h / aire


# ==========================================================================
# Le calcul
# ==========================================================================

def _gradient_conjugue(matrice, second, atol):
    """CG avec preconditionneur de Jacobi, quelle que soit la version de SciPy.

    `tol` est devenu `rtol` en SciPy 1.14 : passer l'ancien nom leve un
    TypeError. C'est exactement ce que faisait la 1.0.0 -- et elle le
    rattrapait pour rendre des zeros.
    """
    import inspect
    from scipy.sparse.linalg import cg, LinearOperator

    diagonale = matrice.diagonal()
    diagonale = np.where(np.abs(diagonale) > 0, diagonale, 1.0)
    precond = LinearOperator(matrice.shape, matvec=lambda v: v / diagonale)

    nom = ("rtol" if "rtol" in inspect.signature(cg).parameters else "tol")
    kwargs = {nom: 1e-12, "maxiter": 20000, "M": precond}
    if nom == "rtol":
        kwargs["atol"] = atol
    x, info = cg(matrice, second, **kwargs)
    if info != 0:
        raise ErreurDC(
            "Le gradient conjugué n'a pas convergé (code %d)." % info,
            "Le réseau est probablement mal conditionné : vérifiez que le"
            " cuivre analysé est d'un seul tenant et qu'il porte une"
            " référence.")
    return x


def resoudre_dc(polygones, sources=None, references=None, vias=None, externes=None,
                pas=None, rho=RESISTIVITE_CUIVRE):
    """Le potentiel dans le cuivre, et la chute par net.

    `polygones`  [{vertices, couche, net, epaisseur}] -- en METRES
    `sources`    [{x, y, couche, net, courant, rayon}] -- courant INJECTE, en A
    `references` [{x, y, couche, net, tension, rayon}] -- Dirichlet, en V
    `vias`       [{x, y, couche_a, couche_b, percage, placage, hauteur}]
    `pas`        cote du carreau, en metres ; par defaut un centieme de la
                 plus grande dimension du cuivre analyse

    Rend {potentiel, chute_par_net, courant_par_net, noeuds, aretes, pas,
    reference_nets, avertissements}.
    """
    if ERREUR_SOLVEUR is not None:
        raise ErreurDC("Solveur DC indisponible : %s" % ERREUR_SOLVEUR,
                       "Le solveur a besoin de numpy :"
                       " « pip install numpy ».")
    try:
        from scipy.sparse import csr_matrix
    except ImportError as exc:
        raise ErreurDC("Solveur DC indisponible : %s" % exc,
                       "Le solveur a besoin de scipy :"
                       " « pip install scipy ».")

    polys = _normaliser(polygones)
    if not polys:
        raise ErreurDC("Aucun polygone de cuivre exploitable.",
                       "Un polygone demande au moins trois sommets.")
    sources = list(sources or [])
    references = list(references or [])
    vias = list(vias or [])

    if not references:
        raise ErreurDC(
            "Aucune référence de tension : le problème est flottant.",
            "Une chute de tension se mesure ENTRE deux points. Déclarez au"
            " moins un point de référence — la broche de masse du"
            " régulateur, en général.")

    if pas is None:
        x0, y0, x1, y1 = _boite(polys)
        pas = max(x1 - x0, y1 - y0) / 100.0
    maillage = mailler(polys, float(pas))
    n = len(maillage["coords"])
    nets = maillage["nets"]

    # -- la matrice de conductance -----------------------------------------
    lignes, colonnes, valeurs = [], [], []
    diagonale = np.zeros(n)

    aretes_posees = []

    def relier(a, b, g):
        if g <= 0 or a == b:
            return
        lignes.extend([a, b])
        colonnes.extend([b, a])
        valeurs.extend([-g, -g])
        diagonale[a] += g
        diagonale[b] += g
        aretes_posees.append((a, b, g))

    for a, b, g in maillage["aretes"]:
        relier(a, b, g * (RESISTIVITE_CUIVRE / rho))

    avertissements = []
    vias_relies = 0
    # CE QU'ON GARDE DE CHAQUE VIA, et pourquoi. Un via relie deja la trame ;
    # ce qui manquait, c'est de pouvoir DIRE apres coup ce qui l'a traverse.
    # On note donc les paires de noeuds qu'il a reliees et la conductance de
    # chacune : le courant s'en deduit exactement une fois le potentiel connu,
    # sans refaire le moindre calcul de geometrie.
    vias_montes = []
    vias_ignores = []
    for v in vias:
        ca = int(v.get("couche_a", v.get("layer_a", 0)) or 0)
        cb = int(v.get("couche_b", v.get("layer_b", 0)) or 0)
        x = float(v.get("x", 0.0))
        y = float(v.get("y", 0.0))
        if ca == cb:
            vias_ignores.append((v, x, y, ca, cb, "ses deux couches sont la même"))
            continue
        rayon = float(v.get("percage", v.get("drill", 0.3e-3)) or 0.3e-3) / 2.0
        # LA PORTEE DU VIA. Un via s'accroche au cuivre QU'IL TRAVERSE, pas au
        # cuivre le plus proche : sans borne, un via pose loin de tout se
        # rabattait sur le carreau le plus proche et fabriquait une liaison
        # verticale entre deux morceaux qui ne se touchent pas. Un carreau de
        # tolerance au-dela de la pastille suffit -- c'est la trame qui est
        # grossiere, pas le via qui est ailleurs.
        portee = rayon + maillage["pas"]
        na = _noeuds_du_point(maillage, {"x": x, "y": y, "couche": ca,
                                         "net": v.get("net")}, rayon, portee)
        nb = _noeuds_du_point(maillage, {"x": x, "y": y, "couche": cb,
                                         "net": v.get("net")}, rayon, portee)
        if not na or not nb:
            # UN VIA QUI NE TROUVE PAS SON CUIVRE N'EST PAS UN DETAIL : c'est
            # le chemin vertical qui manque, et le resultat sera celui d'une
            # carte ou ce via n'existe pas. On le dit au lieu de l'oublier.
            manque = "la couche %d" % (ca if not na else cb)
            vias_ignores.append((v, x, y, ca, cb,
                                 "aucun cuivre du net sous le via sur "
                                 + manque))
            continue
        r = _resistance_via(v)
        if r <= 0:
            vias_ignores.append((v, x, y, ca, cb, "sa résistance est nulle"))
            continue
        # Le via debouche sur PLUSIEURS carreaux de chaque cote : sa
        # conductance se repartit entre les paires, sinon un via fin devient un
        # point d'ancrage qui court-circuite la trame.
        paires = max(len(na), len(nb))
        g = 1.0 / (r * paires)
        liens = []
        for k in range(paires):
            ia, ib = na[k % len(na)], nb[k % len(nb)]
            relier(ia, ib, g)
            liens.append((ia, ib))
        vias_relies += 1
        vias_montes.append({
            "via": v, "x": x, "y": y, "couche_a": ca, "couche_b": cb,
            "resistance": r, "g": g, "liens": liens,
        })

    # -- les references (Dirichlet) et les sources (Neumann) ----------------
    fixes = {}
    refs_nets = set()
    # CHAQUE BORNE GARDE SES NOEUDS. Sans cela on ne saurait pas dire, apres
    # coup, QUELLE TENSION ARRIVE a un consommateur donne -- et c'est
    # exactement la question qu'on pose a ce calcul : « j'ai 3,3 V au
    # regulateur, combien en reste-t-il la-bas ? ». La chute par net n'y
    # repond pas des qu'il y a plus d'un consommateur.
    points = []
    for ref in references:
        couche = int(ref.get("couche", ref.get("layer", 0)) or 0)
        noeuds = _noeuds_du_point(maillage, ref)
        if not noeuds:
            avertissements.append(
                "Une référence tombe hors du cuivre de la couche %d : elle est"
                " ignorée." % couche)
            continue
        tension = float(ref.get("tension", ref.get("voltage", 0.0)) or 0.0)
        for i in noeuds:
            fixes[i] = tension
            refs_nets.add(nets[i])
        points.append({"repere": str(ref.get("repere") or ""),
                       "role": "tension", "couche": couche,
                       "consigne": tension, "noeuds": list(noeuds)})

    if not fixes:
        raise ErreurDC(
            "Aucune référence ne tombe sur le cuivre analysé.",
            "Vérifiez les coordonnées des points de référence, ou élargissez"
            " la sélection de cuivre.")

    injecte = np.zeros(n)
    courant_par_net = {}
    for src in sources:
        courant = float(src.get("courant", src.get("current", 0.0)) or 0.0)
        if courant == 0.0:
            continue
        couche = int(src.get("couche", src.get("layer", 0)) or 0)
        noeuds = _noeuds_du_point(maillage, src)
        if not noeuds:
            avertissements.append(
                "Une injection tombe hors du cuivre de la couche %d : elle est"
                " ignorée." % couche)
            continue
        for i in noeuds:
            injecte[i] += courant / len(noeuds)
            courant_par_net[nets[i]] = (courant_par_net.get(nets[i], 0.0)
                                        + courant / len(noeuds))
        points.append({"repere": str(src.get("repere") or ""),
                       "role": "courant", "couche": couche,
                       "consigne": courant, "noeuds": list(noeuds)})

    if not np.any(injecte):
        avertissements.append(
            "Aucun courant injecté : le potentiel est celui des références,"
            " et la chute est nulle partout. C'est un résultat juste, et il"
            " ne dit rien.")

    lignes.extend(range(n))
    colonnes.extend(range(n))
    valeurs.extend(diagonale.tolist())
    laplacien = csr_matrix((valeurs, (lignes, colonnes)), shape=(n, n))

    # LES INCONNUES DE DIRICHLET SORTENT DU SYSTEME. Les ecraser ligne par
    # ligne -- ce que faisait la 1.0.0 -- rend la matrice non symetrique, et un
    # gradient conjugue sur une matrice non symetrique ne converge pas vers la
    # solution : il converge vers autre chose, sans le dire.
    # TOUT NOEUD LIBRE DOIT VOIR UNE REFERENCE. Un ilot de cuivre qui n'en
    # atteint aucune -- une couche sans via, un morceau detache par une
    # decoupe -- rend la sous-matrice SINGULIERE. Le gradient conjugue ne le
    # signale pas : il s'arrete sur un residu petit et rend un potentiel de
    # plusieurs milliards de volts, ce qui est exactement le genre de chiffre
    # qu'un panneau affiche sans broncher. On le cherche donc AVANT, par un
    # simple parcours en largeur depuis les references.
    voisins = [[] for _ in range(n)]
    for a, b, _g in aretes_posees:
        voisins[a].append(b)
        voisins[b].append(a)
    vus = bytearray(n)
    pile = list(fixes)
    for i in pile:
        vus[i] = 1
    while pile:
        i = pile.pop()
        for j in voisins[i]:
            if not vus[j]:
                vus[j] = 1
                pile.append(j)
    orphelins = [i for i in range(n) if not vus[i]]
    if orphelins:
        nets_orphelins = sorted({nets[i] for i in orphelins})
        raise ErreurDC(
            "%d nœud(s) de cuivre n'atteignent aucune référence : %s."
            % (len(orphelins), ", ".join(nets_orphelins[:4])),
            "Ce cuivre est électriquement flottant — une couche sans via qui"
            " la relie, ou un morceau détaché par une découpe. Ajoutez une"
            " référence sur cet îlot, un via qui le raccorde, ou retirez-le"
            " de la sélection.")

    libres = np.array([i for i in range(n) if i not in fixes], dtype=int)
    if len(libres) == 0:
        potentiel = np.zeros(n)
        for i, v in fixes.items():
            potentiel[i] = v
    else:
        v_fixe = np.zeros(n)
        for i, v in fixes.items():
            v_fixe[i] = v
        second = injecte[libres] - laplacien[libres, :].dot(v_fixe)
        reduit = laplacien[libres, :][:, libres]
        # Un ilot de cuivre sans reference et sans via reste flottant : sa
        # sous-matrice est singuliere. On le dit plutot que de laisser le CG
        # divaguer.
        echelle = float(np.abs(second).max()) if len(second) else 0.0
        x = _gradient_conjugue(reduit, second, max(echelle * 1e-14, 1e-18))
        potentiel = v_fixe.copy()
        potentiel[libres] = x

    # -- LE DETAIL VIA PAR VIA ----------------------------------------------
    # Le courant qui traverse le via est la somme, sur les paires qu'il relie,
    # de g (V_a - V_b). Comme les `paires` liens sont en PARALLELE et portent
    # chacun 1/(r*paires), l'ensemble a bien la resistance r du via : la chute
    # vaut donc I*r exactement, et la puissance r*I^2. Le signe suit le sens
    # couche_a -> couche_b ; on rend aussi sa valeur absolue, qui est celle
    # qu'on lit dans un tableau.
    detail_vias = []
    for m in vias_montes:
        i_via = 0.0
        for ia, ib in m["liens"]:
            i_via += m["g"] * (potentiel[ia] - potentiel[ib])
        r = m["resistance"]
        detail_vias.append({
            "x": m["x"], "y": m["y"],
            "couche_a": m["couche_a"], "couche_b": m["couche_b"],
            "net": str((m["via"].get("net") or "?")),
            "repere": str(m["via"].get("repere") or ""),
            "resistance": r,
            "courant": float(i_via),
            "chute": float(abs(i_via) * r),
            "puissance": float(r * i_via * i_via),
            "relie": True,
        })
    for v, x, y, ca, cb, motif in vias_ignores:
        detail_vias.append({
            "x": x, "y": y, "couche_a": ca, "couche_b": cb,
            "net": str((v.get("net") or "?")),
            "repere": str(v.get("repere") or ""),
            "resistance": 0.0, "courant": 0.0, "chute": 0.0, "puissance": 0.0,
            "relie": False, "motif": motif,
        })
    # Le plus charge en tete : c'est celui qu'on cherche, et le seul ordre qui
    # ne demande pas de relire tout le tableau.
    detail_vias.sort(key=lambda d: (-abs(d["courant"]), d["x"], d["y"]))
    if vias_ignores:
        avertissements.append(
            "%d via(s) n'ont pas été montés dans le réseau : le chemin"
            " vertical qu'ils portent n'est PAS dans ce résultat."
            % len(vias_ignores))

    # -- LA DENSITE ET L'ECHAUFFEMENT ---------------------------------------
    # QUELLES COUCHES SONT A L'AIR LIBRE. IPC-2221 double le coefficient d'une
    # couche exterieure (0,048 contre 0,024), et un coefficient plus grand rend
    # une temperature plus BASSE : prendre une couche interne pour une externe
    # sous-estime son echauffement. C'est donc l'appelant qui tranche -- il a
    # l'empilage --, par `externes`.
    #
    # A DEFAUT, la premiere et la derniere couche PRESENTES. C'est vrai d'une
    # carte entiere ; ce ne l'est pas d'une selection qui ne porterait que des
    # couches internes, et le resultat emporte donc `couches_externes` pour
    # qu'on puisse lire ce qui a ete suppose.
    couches_vues = sorted(set(int(c[2]) for c in maillage["coords"]))
    if externes is None:
        ext = {couches_vues[0], couches_vues[-1]} if couches_vues else set()
    else:
        ext = set(int(c) for c in externes)
    densites, largeurs, montees = _densite_et_echauffement(
        maillage, potentiel, rho, ext)

    # -- ce qu'on en dit ----------------------------------------------------
    chute_par_net = {}
    for net in sorted(set(nets)):
        masque = np.array([k == net for k in nets])
        if not masque.any():
            continue
        v = potentiel[masque]
        chute_par_net[net] = float(v.max() - v.min())

    # CE QUI ARRIVE A CHAQUE BORNE. Le potentiel moyen sur ses noeuds -- une
    # pastille en couvre plusieurs, et ils ne sont pas tous au meme potentiel
    # exactement. L'ECART A LA CONSIGNE est ce qu'on lit : pour un
    # consommateur, c'est ce que le cuivre lui a coute.
    reference_haute = max((p["consigne"] for p in points
                           if p["role"] == "tension"), default=0.0)
    bornes = []
    for pt in points:
        vs = [potentiel[i] for i in pt["noeuds"]]
        v = sum(vs) / len(vs) if vs else 0.0
        bornes.append({
            "repere": pt["repere"],
            "role": pt["role"],
            "couche": pt["couche"],
            "consigne": pt["consigne"],
            "tension": float(v),
            "chute": float(reference_haute - v),
        })

    # Le pire point de chaque net, et OU il est : c'est ce qu'on lit d'abord,
    # et le chercher soi-meme dans dix mille nombres n'est pas une lecture.
    pires = {}
    for net in sorted(set(nets)):
        rangs = [k for k in range(n) if nets[k] == net]
        if not rangs:
            continue
        kd = max(rangs, key=lambda k: densites[k])
        kt = max(rangs, key=lambda k: montees[k])
        pires[net] = {
            "densite": densites[kd],
            "densite_en": [maillage["coords"][kd][0], maillage["coords"][kd][1],
                           maillage["coords"][kd][2]],
            "largeur": largeurs[kd],
            "echauffement": montees[kt],
            "echauffement_en": [maillage["coords"][kt][0],
                                maillage["coords"][kt][1],
                                maillage["coords"][kt][2]],
            "largeur_chaude": largeurs[kt],
        }

    return {
        "format": FORMAT_RESULTAT,
        "potentiel": potentiel.tolist(),
        "densite": densites,
        "largeur_locale": largeurs,
        "echauffement": montees,
        "pire_par_net": pires,
        "bornes": bornes,
        "couches_externes": sorted(ext),
        "modele_thermique": "IPC-2221 (charte historique, conducteur isolé à"
                            " l'air calme). IPC-2152 lui a succédé et donne"
                            " des températures plus basses : ce qui est rendu"
                            " ici est conservateur.",
        "noeuds": [[c[0], c[1], c[2]] for c in maillage["coords"]],
        "nets": nets,
        "chute_par_net": chute_par_net,
        "courant_par_net": courant_par_net,
        "reference_nets": sorted(refs_nets),
        "pas": maillage["pas"],
        "couches": maillage["couches"],
        "n_noeuds": n,
        "n_aretes": len(maillage["aretes"]),
        "n_vias": vias_relies,
        "vias": detail_vias,
        "avertissements": avertissements,
    }


def resoudre_document(doc):
    """Le document d'echange (en MILLIMETRES) -> le resultat (en volts).

    C'est le seul endroit ou la conversion mm -> m a lieu, comme
    `simulation_em.simuler` est le seul a la faire pour les sections.
    """
    if not isinstance(doc, dict):
        raise ErreurDC("Le document envoyé n'est pas un objet JSON.")
    if doc.get("format") not in (FORMAT, None):
        raise ErreurDC("Format inattendu : « %s » au lieu de « %s »."
                       % (doc.get("format"), FORMAT))

    mm = 1e-3

    polys = []
    for p in (doc.get("polygones") or doc.get("polygons") or []):
        sommets = p.get("vertices") or p.get("sommets") or []
        polys.append({
            "vertices": [[float(v[0]) * mm, float(v[1]) * mm] for v in sommets
                         if isinstance(v, (list, tuple)) and len(v) >= 2],
            "couche": int(p.get("couche", p.get("layer", 0)) or 0),
            "net": str(p.get("net") or "?"),
            "epaisseur": float(p.get("epaisseur",
                                     p.get("thickness", 0.035)) or 0.035) * mm,
            # Le drapeau de decoupe voyage avec la forme. Perdu ici, un plan
            # evide se calculait PLEIN et rendait une chute trop faible : une
            # erreur du cote qui rassure, celui qu'on ne va pas verifier.
            "trou": bool(p.get("trou") or p.get("hole")),
        })

    def points(cle, cle_en):
        out = []
        for s in (doc.get(cle) or doc.get(cle_en) or []):
            p = {
                "couche": int(s.get("couche", s.get("layer", 0)) or 0),
                "net": str(s.get("net") or "?"),
                "courant": float(s.get("courant", s.get("current", 0.0)) or 0.0),
                "tension": float(s.get("tension", s.get("voltage", 0.0)) or 0.0),
                "rayon": float(s.get("rayon", s.get("radius", 0.0)) or 0.0) * mm,
                # LE REPERE VOYAGE : c'est lui qui permet au panneau de dire
                # « il reste 3,29 V a U5.1 » plutot que « a une borne ». Perdu
                # ici, le resultat rendait des lignes anonymes.
                "repere": str(s.get("repere") or s.get("ref") or ""),
            }
            # `x` N'EST RECOPIE QUE S'IL EST DONNE : poser un zero par defaut
            # ferait taire le centre de la boite, et un plot rectangulaire se
            # replierait sur le noeud le plus proche de l'origine.
            if s.get("x") is not None:
                p["x"] = float(s["x"]) * mm
            if s.get("y") is not None:
                p["y"] = float(s["y"]) * mm
            boite = s.get("boite") or s.get("box")
            if boite and len(boite) >= 4:
                p["boite"] = [float(b) * mm for b in boite[:4]]
            out.append(p)
        return out

    vias = []
    for v in (doc.get("vias") or []):
        # LE NET DU VIA N'EST PAS DECORATIF : `_noeuds_du_point` s'en sert pour
        # ne raccorder le via qu'au cuivre de SON net. Le perdre ici laissait le
        # via s'accrocher au premier carreau venu, celui d'un autre net compris
        # -- un court-circuit que rien n'aurait signale. `repere` sert au
        # tableau du panneau, et `resistance` est la mesure du fabricant, qui
        # l'emporte sur la formule.
        via = {
            "x": float(v.get("x", 0.0)) * mm,
            "y": float(v.get("y", 0.0)) * mm,
            "couche_a": int(v.get("couche_a", v.get("layer_a", 0)) or 0),
            "couche_b": int(v.get("couche_b", v.get("layer_b", 0)) or 0),
            "percage": float(v.get("percage", v.get("drill", 0.3)) or 0.3) * mm,
            "placage": float(v.get("placage", v.get("plating", 0.025))
                             or 0.025) * mm,
            "hauteur": float(v.get("hauteur", v.get("height", 1.6))
                             or 1.6) * mm,
            "net": (str(v.get("net")) if v.get("net") is not None else None),
            "repere": str(v.get("repere") or v.get("ref") or ""),
        }
        # Une resistance mesuree est deja en OHMS : elle ne se convertit pas.
        if v.get("resistance") is not None:
            via["resistance"] = float(v["resistance"])
        vias.append(via)

    pas = doc.get("pas", doc.get("pitch"))
    resultat = resoudre_dc(polys, sources=points("sources", "sources"),
                           references=points("references", "references"),
                           vias=vias,
                           externes=doc.get("couches_externes"),
                           pas=(float(pas) * mm if pas else None))
    # Ce qui repart est en millimetres, comme ce qui est arrive. Les VOLTS,
    # les AMPERES et les OHMS ne se convertissent pas : seules les longueurs.
    resultat["noeuds"] = [[x / mm, y / mm, c] for x, y, c in resultat["noeuds"]]
    resultat["pas"] = resultat["pas"] / mm
    for d in resultat.get("vias") or []:
        d["x"] = d["x"] / mm
        d["y"] = d["y"] / mm
    # La DENSITE est deja en A/mm2 et l'ECHAUFFEMENT en kelvins : ni l'une ni
    # l'autre ne se convertit. Seules les POSITIONS du pire point le font.
    for d in (resultat.get("pire_par_net") or {}).values():
        for cle in ("densite_en", "echauffement_en"):
            p = d.get(cle)
            if p:
                d[cle] = [p[0] / mm, p[1] / mm, p[2]]
    return resultat


def carte_chaleur(resultat, resolution=120, couche=None):
    """Le potentiel sur une grille reguliere, pour la peindre.

    Interpolation AU PLUS PROCHE : le potentiel n'est defini que sur le
    cuivre, et lisser par-dessus le vide inventerait une chute la ou il n'y a
    pas de conducteur.
    """
    noeuds = resultat.get("noeuds") or []
    if not noeuds:
        return {"x": [], "y": [], "V": [], "couche": couche}
    potentiel = resultat["potentiel"]
    if couche is not None:
        garde = [i for i, nd in enumerate(noeuds) if int(nd[2]) == int(couche)]
        if not garde:
            return {"x": [], "y": [], "V": [], "couche": couche}
        noeuds = [noeuds[i] for i in garde]
        potentiel = [potentiel[i] for i in garde]

    pts = np.array([[nd[0], nd[1]] for nd in noeuds], dtype=float)
    v = np.array(potentiel, dtype=float)
    x_min, y_min = pts.min(axis=0)
    x_max, y_max = pts.max(axis=0)
    x = np.linspace(x_min, x_max, resolution)
    y = np.linspace(y_min, y_max, resolution)
    gx, gy = np.meshgrid(x, y)

    from scipy.interpolate import NearestNDInterpolator
    interp = NearestNDInterpolator(pts, v)
    grille = interp(np.column_stack([gx.ravel(), gy.ravel()]))
    return {"x": x.tolist(), "y": y.tolist(),
            "V": grille.reshape(resolution, resolution).tolist(),
            "couche": couche}
