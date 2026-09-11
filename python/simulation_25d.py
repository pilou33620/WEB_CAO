#!/usr/bin/python3
# -*- coding: utf-8 -*-
# ==========================================
# VERSIONING
# Version: 1.1.0
# Date: 2026-09-09
# Explication: LE SOLVEUR AVAIT RAISON, CE CONNECTEUR JETAIT SA REPONSE.
#   Six corrections, et la premiere vaut a elle seule le reste.
#
#   1. L'IMPEDANCE RENDUE N'ETAIT PAS UNE IMPEDANCE CARACTERISTIQUE. Le champ
#   `z0` de chaque troncon, et les trois `z0_min` / `z0_max` / `z0_moyen` de la
#   liaison, portaient Z_in = Z_ref (1+S11)/(1-S11) -- l'impedance d'ENTREE de
#   la ligne chargee par le port d'en face, ce qui n'est pas la meme grandeur
#   et ne s'en approche que lorsque la ligne est deja adaptee. Mesure sur un
#   microruban de 6 mm, FR4 0,370 mm, a 2 GHz :
#
#       largeur    Z0 vrai    ce qui etait rendu
#       0,35 mm    71,5 ohm   55,7 ohm   (-24 %)
#       0,70 mm    50,8 ohm   49,9 ohm
#       1,05 mm    38,7 ohm   43,3 ohm   (+11 %)
#       2,00 mm    25,0 ohm   28,7 ohm   (+17 %)
#
#   L'ERREUR ETAIT TOUJOURS DANS LE SENS DE Z_ref, donc toujours du cote
#   rassurant : une piste desadaptee se lisait comme une piste correcte, et
#   c'est exactement la question qu'on etait venu poser. La carte de chaleur
#   peignait par-dessus le marche TOUS les troncons de la meme couleur, celle
#   de ce chiffre-la, puisqu'ils partageaient la meme valeur.
#
#   Z0 SORT MAINTENANT DES PARAMETRES S DU SOLVEUR, par
#   `solver_extract.parametres_de_ligne`. Le calcul pleine onde avait la bonne
#   reponse dans sa matrice depuis le debut.
#
#   2. eps_eff, h, er ET tan_delta ETAIENT ANALYTIQUES. Le connecteur appliquait
#   Hammerstad et prenait le PREMIER dielectrique de l'empilage -- pas celui
#   sous la piste. Payer un calcul pleine onde pour rendre une formule fermee
#   n'a aucun sens : eps_eff vient desormais de beta, et le milieu est celui que
#   la piste voit reellement, couche par couche.
#
#   3. LE RETARD ET LES PERTES DE CHAQUE TRONCON ETAIENT DES TOTAUX REPETES.
#   `retard` employait `long_tot` -- la longueur ENTIERE -- pour chacun, et
#   `pertes_db` la perte d'insertion totale. Cinq troncons de 2 mm annoncaient
#   donc cinq fois le retard des 10 mm. Chacun porte maintenant SA longueur, et
#   `ligne` porte enfin `retard` et `pertes_db`, que le panneau lisait dans le
#   vide -- il affichait « — ps » et « — dB ».
#
#   4. UN VIA DONT LE MAILLAGE ECHOUAIT ETAIT PASSE SOUS SILENCE, et le
#   resultat affirmait le contraire. Le renversement d'empilage remappait
#   `layer` mais pas `layer_start` / `layer_end` : sur un empilage donne de haut
#   en bas -- celui que l'editeur PCB envoie -- un via explicite visait la
#   mauvaise couche, `mailler_via_interne` echouait, l'echec partait dans un
#   `logger.warning` que personne ne lit, et l'avertissement annoncait quand
#   meme « via maille en fut vertical RWG continu ». Mesure sur un 4 couches :
#   S21 = -34,75 dB au lieu de -0,05 dB. Une coupure franche, presentee comme
#   une liaison saine. Le remappage est fait, et l'echec est un REFUS.
#
#   5. AUCUN GARDE-FOU, seul des quatre moteurs de ce depot a n'en avoir aucun.
#   Le remplissage est en N^2 : 5,7 s pour 205 RWG, 60 s pour 755, 169 s pour
#   1367 -- et le panneau demande 21 points de frequence par defaut. Une piste
#   de 24 mm valait donc vingt minutes sans annulation ni progression, et
#   `points` n'etait pas ecrete. Le cout est maintenant ESTIME AVANT le calcul
#   et refuse au-dela d'un budget, en disant quoi changer.
#
#   6. LES CORRECTIONS DU DOCUMENT ETAIENT MUETTES. Bande remise dans l'ordre,
#   bande etendue pour englober f0, point de f0 ajoute au balayage, frequences
#   absentes remplacees par un defaut : rien ne repartait. C'est la regle de
#   `simulation_em._valider` -- « une valeur corrigee en silence se lit comme
#   une valeur acceptee » -- et elle vaut ici aussi.
#
#   ET CE QUE LE 2,5D NE COUVRE PAS EST ECRIT. Les avertissements annonçaient
#   « calcul exact des coudes, transitions et rayonnement » pendant que
#   `discontinuites` repartait vide. Le plan de masse y est ANALYTIQUE et
#   INFINI : ni masse coplanaire, ni ecart lateral, ni couture, ni `doc["vias"]`
#   -- tout ce que le moteur 2D existe pour juger. Le perçage d'un via n'est pas
#   honore non plus : le fut a la taille de la MAILLE. Basculer de moteur perdait
#   ces diagnostics sans qu'une ligne le dise ; elles sont dites.
# Fonctions ajoutees : _ajuster, _renverser_empilage, _dielectrique_de_reference,
#   _uniformite, _cout_estime, _touchstone (remplace _touchstone_s2p, N ports)
# Fonctions modifiees : etat, _valider_document (refus + ajustements rendus),
#   _fusionner_segments_pistes (trous signales), _detecter_vias_internes,
#   simuler_25d (Z0, eps_eff, retard, pertes, garde-fous, avertissements)
#
# Version: 1.0.0
# Date: 2026-09-08
# Explication: premiere version -- pont entre cao-sim-em-3 et mom_solver.
# ==========================================
"""
simulation_25d.py - Connecteur pour le solveur MoM 2.5D pleine onde

Fait le pont entre le format d'échange standard WEB_CAO (cao-sim-em-3)
et le solveur électromagnétique surfacique 2.5D (mom_solver).

Résout les structures PCB en formulation MPIE avec :
- Maillage surfacique 2D de triangles
- Fonctions de base RWG et demi-RWG pour les ports
- Ports verticaux via reliant le cuivre au plan de masse de référence
- Fonctions de Green spectrales multicouches exactes
- Extraction des paramètres S et formatage cao-sim-em-resultat-5

CE QU'IL REND, ET CE QU'IL NE REND PAS. Les paramètres S sortent d'un calcul
pleine onde : les coudes, les transitions de couche et le rayonnement y sont,
sans modèle. En échange, le plan de masse est ANALYTIQUE et INFINI, et rien de
ce que `simulation_em` mesure sur le cuivre latéral -- écart coplanaire,
couture, plan flottant -- n'entre ici. Les deux moteurs ne répondent donc pas
tout à fait à la même question, et le résultat le dit dans ses
avertissements plutôt que de le laisser deviner.
"""

import time
import math
import copy
import logging
import numpy as np
from typing import Dict, List, Tuple, Any, Optional

logger = logging.getLogger(__name__)

# Dépendances géométriques optionnelles
try:
    import shapely
    from shapely.geometry import Polygon, MultiPolygon
    from shapely.ops import unary_union
    HAS_SHAPELY = True
except ImportError:
    HAS_SHAPELY = False

# Import du solveur 2.5D
ERREUR_MOM = None
try:
    import mom_solver
    from mom_solver.pcb_parser import extract_stackup, extract_polygons, build_geometry_model
    from mom_solver.mesher import (generate_2d_mesh, hauteur_electrique,
                                   maillage_avec_ports_verticaux, mailler_via_interne)
    # `C_0` et `ETA_0` ne sont plus importes : c'est `parametres_de_ligne` qui
    # porte desormais la physique -- eps_eff sort de beta, pas d'une formule de
    # microruban ecrite ici. Le connecteur ne fait plus d'electromagnetisme.
    from mom_solver.green_layered import noyaux_multicouches
    from mom_solver.mom_engine import fill_z_matrix, vecteur_de_coupe
    from mom_solver.solver_extract import (compute_s_parameters,
                                           compute_current_density,
                                           parametres_de_ligne)
    from scipy.linalg import lu_factor, lu_solve
except Exception as exc:  # noqa: BLE001
    mom_solver = None
    ERREUR_MOM = str(exc)


FORMAT = "cao-sim-em-3"
FORMAT_RESULTAT = "cao-sim-em-resultat-5"

# ==========================================================================
# LES GARDE-FOUS
# --------------------------------------------------------------------------
# POURQUOI ILS SONT PLUS SERRES QUE CEUX DU MOTEUR 2D. Celui-la resout une
# SECTION par troncon -- une matrice de 120 panneaux, quelques millisecondes,
# et un cache qui ramene cent segments identiques a un seul calcul. Ici le
# maillage est SURFACIQUE et la matrice d'impedance est PLEINE : son
# remplissage coute N^2 interactions, chacune une quadrature de Gauss sur deux
# triangles. Mesure sur cette machine, un point de frequence :
#
#       205 RWG ->   5,7 s          755 RWG ->  60,2 s
#      1367 RWG -> 168,9 s
#
# soit environ 135 microsecondes par paire de fonctions de base, et une pente
# quadratique. Le panneau demande VINGT ET UN points par defaut : une piste de
# 24 mm au maillage automatique valait donc vingt minutes, sans progression ni
# bouton d'annulation. Un plafond sur le nombre de RWG ne suffit pas -- c'est
# le PRODUIT points x RWG^2 qui se paye --, d'ou l'estimation de cout ci-dessous,
# faite AVANT le remplissage et refusee avec ce qu'il faut changer.
# ==========================================================================

# Un document de simulation ne porte qu'une selection : il est petit. Meme
# plafond que le moteur 2D, pour que la route commune n'ait pas deux regles.
MAX_CORPS = 4 * 1024 * 1024
# Le 2,5D n'est pas un outil de balayage large : on vient y verifier un
# troncon precis, pas tracer une reponse sur trois decades.
MAX_POINTS = 41
MAX_OBJETS = 200
# Au-dela, meme un seul point de frequence ne rend pas la main.
MAX_RWG = 4000
# Le cout admis pour un calcul, en secondes. C'est ce qu'un panneau
# interactif peut faire attendre sans mentir sur ce qui se passe.
BUDGET_SECONDES = 600.0
# Le prix d'une paire de fonctions de base, calibre par les mesures ci-dessus.
# Il ne sert QU'A REFUSER : une machine deux fois plus rapide refusera deux
# fois trop tot, ce qui est le bon sens de l'erreur.
COUT_PAR_PAIRE = 135e-6


class ErreurSimulation25D(Exception):
    """Refus explicite, avec de quoi corriger le tir.

    Même forme que `simulation_em.ErreurSimulation` : le motif, et ce qu'il
    faut changer. Les deux pages affichent `detail` tel quel.
    """
    def __init__(self, message: str, conseil: str = ""):
        super().__init__(message)
        self.message = message
        self.conseil = conseil


def etat() -> Dict[str, Any]:
    """Retourne l'état de disponibilité du solveur 2.5D."""
    return {
        "dispo": ERREUR_MOM is None and mom_solver is not None,
        "moteur": "2.5d",
        "format": FORMAT,
        "version": getattr(mom_solver, "__version__", "inconnue") if mom_solver else None,
        "shapely": HAS_SHAPELY,
        "methode": "MoM surfacique MPIE, base RWG, Green stratifiée (DCIM)",
        "limites": {"objets": MAX_OBJETS, "points": MAX_POINTS,
                    "rwg": MAX_RWG, "budget_s": BUDGET_SECONDES},
        "erreur": ERREUR_MOM,
    }


def _ajuster(ajuste: List[str], phrase: str) -> None:
    """Consigne une correction faite d'office sur le document.

    CE QUI A ETE RAMENE DE FORCE PART AVEC LE RESULTAT. C'est la règle de
    `simulation_em._valider`, et elle vaut ici pour la même raison : une
    valeur corrigée en silence se lit comme une valeur acceptée, et
    l'utilisateur repart en croyant avoir demandé ce qu'il a obtenu.
    """
    ajuste.append(phrase)


def _valider_document(doc: Dict[str, Any]) -> Tuple[List[Dict], List[Dict], Dict[str, Any]]:
    """Vérifie le document cao-sim-em-3 et extrait couches, objets, analyse."""
    if not isinstance(doc, dict):
        raise ErreurSimulation25D("Le document envoyé n'est pas un objet JSON.")

    formats_acceptes = ["cao-sim-em-1", "cao-sim-em-2", "cao-sim-em-3"]
    if doc.get("format") not in formats_acceptes:
        raise ErreurSimulation25D(
            "Format inattendu : « %s » au lieu de « %s »."
            % (doc.get("format") or "absent", " ou ".join(formats_acceptes))
        )

    couches = (doc.get("stackup") or {}).get("layers") or []
    if not couches:
        raise ErreurSimulation25D(
            "Empilage vide : le solveur a besoin d'au moins un conducteur et un diélectrique.",
            "Complétez l'empilage dans la page avant de lancer le calcul."
        )

    objets = (doc.get("geometry") or {}).get("objects") or []
    if not objets:
        raise ErreurSimulation25D(
            "Aucun cuivre à analyser.",
            "Sélectionnez une piste sur la carte."
        )
    if len(objets) > MAX_OBJETS:
        raise ErreurSimulation25D(
            "Trop de tronçons pour le 2,5D : %d, maximum %d."
            % (len(objets), MAX_OBJETS),
            "Le maillage surfacique coûte le carré du cuivre envoyé. "
            "Restreignez la sélection, ou passez au moteur 2D, qui n'a pas "
            "cette limite.")

    ajuste: List[str] = []
    a = doc.get("analyse") or {}

    # LES FREQUENCES SONT REFUSEES QUAND ELLES MANQUENT, et non remplacees par
    # un defaut : une bande inventee rendrait un resultat sur une autre
    # question que celle posee.
    def _f(cle_a, cle_b):
        v = a.get(cle_a)
        if v is None:
            v = a.get(cle_b)
        try:
            return float(v) if v is not None else 0.0
        except (TypeError, ValueError):
            return 0.0

    f1 = _f("f_debut", "f1")
    f2 = _f("f_fin", "f2")
    if not (f1 > 0 and f2 > 0):
        raise ErreurSimulation25D(
            "Bande de fréquence absente ou nulle.",
            "Renseignez la fréquence de début et de fin de l'analyse.")

    try:
        demande = int(a.get("points") or a.get("nb_points") or 21)
    except (TypeError, ValueError):
        demande = 21

    if f2 < f1:
        f1, f2 = f2, f1
        _ajuster(ajuste, "La bande était donnée à l'envers : elle a été remise"
                         " dans l'ordre.")

    points = max(1, min(demande, MAX_POINTS))
    if demande > MAX_POINTS:
        _ajuster(ajuste,
                 "Bande S ramenée de %d à %d points, qui est le maximum du"
                 " moteur 2,5D : chaque point est un remplissage complet de la"
                 " matrice d'impédance." % (demande, MAX_POINTS))

    fc = _f("f_centre", "fc")
    if fc <= 0.0:
        fc = math.sqrt(f1 * f2)
    if not (f1 <= fc <= f2):
        if fc < f1:
            f1 = fc
            _ajuster(ajuste, "Début de bande S ajusté à %.4g GHz pour inclure"
                             " la fréquence de travail." % (f1 / 1e9))
        if fc > f2:
            f2 = fc
            _ajuster(ajuste, "Fin de bande S ajustée à %.4g GHz pour inclure"
                             " la fréquence de travail." % (f2 / 1e9))

    return couches, objets, {"f_debut": f1, "f_fin": f2, "points": points,
                             "f_centre": fc, "ajuste": ajuste}


def _fusionner_segments_pistes(polygons: List[Dict],
                               ajuste: Optional[List[str]] = None) -> List[Dict]:
    """
    Fusionne géométriquement les segments de piste consécutifs du même net
    sur la même couche.

    Crucial pour le maillage MoM : chaque polygone triangulé séparément possède
    des indices de sommets disjoints. Sans fusion préalable, la frontière entre
    deux segments consécutifs ne partage aucune arête de maillage et le courant
    conduit ne peut pas franchir l'interface.

    LES TROUS SONT SIGNALES, PAS COMBLES EN SILENCE. Une fusion peut refermer
    une boucle et créer un anneau ; le mailleur ne prend qu'un contour, si bien
    que le trou se remplirait de cuivre sans que rien ne le dise. On garde le
    contour extérieur -- c'est tout ce que le mailleur sait faire -- mais on
    le DIT, parce qu'un anneau comblé n'est plus la carte.
    """
    if not HAS_SHAPELY:
        if ajuste is not None:
            _ajuster(ajuste,
                     "shapely est absent : les tronçons consécutifs n'ont pas"
                     " été fusionnés, et le courant peut ne pas franchir la"
                     " frontière entre deux segments. Installez shapely"
                     " (« pip install shapely ») pour un maillage continu.")
        return polygons

    # Regrouper les objets par (couche, net, role)
    groupes: Dict[Tuple[int, str, str], List[Dict]] = {}
    autres: List[Dict] = []

    for p in polygons:
        if p.get("type") in ("track", "zone") and p.get("role") == "signal":
            cle = (int(p.get("layer", 0)), str(p.get("net", "")), str(p.get("role", "signal")))
            groupes.setdefault(cle, []).append(p)
        else:
            autres.append(p)

    fused_polygons = list(autres)
    trous = 0

    for (layer, net, role), plist in groupes.items():
        if len(plist) <= 1:
            fused_polygons.extend(plist)
            continue

        sh_polys = []
        for p in plist:
            verts = p["vertices"][:, :2]
            if len(verts) >= 3:
                try:
                    poly = Polygon(verts)
                    if poly.is_valid and not poly.is_empty:
                        sh_polys.append(poly)
                except Exception:  # noqa: BLE001
                    pass

        if not sh_polys:
            fused_polygons.extend(plist)
            continue

        try:
            union_geom = unary_union(sh_polys)
            geoms = union_geom.geoms if isinstance(union_geom, MultiPolygon) else [union_geom]

            for g in geoms:
                if not isinstance(g, Polygon) or g.is_empty:
                    continue
                trous += len(g.interiors)
                coords = np.array(g.exterior.coords)[:-1]
                if len(coords) < 3:
                    continue
                fused_polygons.append({
                    "type": "zone",
                    "vertices": coords,
                    "layer": layer,
                    "net": net,
                    "role": role,
                    "copper_thickness": plist[0].get("copper_thickness", 35e-6)
                })
        except Exception:  # noqa: BLE001
            fused_polygons.extend(plist)

    if trous and ajuste is not None:
        _ajuster(ajuste,
                 "La fusion des tronçons a refermé %d boucle(s) : le mailleur"
                 " ne prend que le contour extérieur, et le trou a donc été"
                 " comblé de cuivre. Le résultat surestime la surface"
                 " conductrice à cet endroit." % trous)

    return fused_polygons


def _renverser_empilage(doc: Dict[str, Any], n_couches: int) -> Dict[str, Any]:
    """Retourne l'empilage haut en bas, ET TOUS les indices de couche avec lui.

    POURQUOI CE RENVERSEMENT EXISTE. Dans `mom_solver`, z = 0 est en bas et le
    fût d'un port perce VERS LE BAS jusqu'au plan de masse. Un empilage donné
    de haut en bas -- TOP en 0, GND en dernier, ce que l'éditeur PCB envoie --
    met donc le plan au-dessus du signal, et il faut l'inverser pour que la
    géométrie maillée et la pile que la fonction de Green cascade soient la
    même chose.

    ET IL FAUT REMAPPER TOUT CE QUI DESIGNE UNE COUCHE, pas seulement `layer`.
    C'était le défaut : `layer_start` et `layer_end` des vias explicites
    restaient dans l'ancien repère, si bien qu'un via TOP -> IN1 visait après
    renversement le PLAN DE MASSE. `mailler_via_interne` échouait, l'échec
    partait dans un journal, et la ligne rendait S21 = -34,75 dB au lieu de
    -0,05 dB -- une coupure franche, présentée comme une liaison saine.
    """
    doc = copy.deepcopy(doc)
    doc["stackup"]["layers"].reverse()

    def _miroir(v):
        return n_couches - 1 - int(v)

    # Les clefs qui portent un indice de couche, dans tous les dialectes que
    # `_detecter_vias_internes` et `_localiser_bornes_chaine` savent lire.
    clefs = ("layer", "layer_start", "layer_end", "layer_from", "layer_to")

    for obj in (doc.get("geometry", {}).get("objects", []) or []):
        for k in clefs:
            if isinstance(obj.get(k), int):
                obj[k] = _miroir(obj[k])
        via = obj.get("via")
        if isinstance(via, dict):
            for k in clefs:
                if isinstance(via.get(k), int):
                    via[k] = _miroir(via[k])

    # `doc["vias"]` n'est pas lu par ce moteur (voir les avertissements), mais
    # on le remappe quand meme : un document qui repart de la route ne doit pas
    # porter deux reperes de couche differents.
    for via in (doc.get("vias") or []):
        if isinstance(via, dict):
            for k in clefs:
                if isinstance(via.get(k), int):
                    via[k] = _miroir(via[k])

    return doc


def _localiser_bornes_chaine(objets: List[Dict], stackup: Dict[str, Any]) -> List[Dict]:
    """
    Identifie les bornes de la piste pour positionner les ports verticaux.
    Port 1 à l'entrée de la ligne, Port 2 à la sortie.
    """
    # Si les ports sont fournis explicitement dans les objets, les conserver.
    #
    # LES DEUX CLEFS SONT ACCEPTEES, comme dans `pcb_parser.detect_ports` :
    # celui-la se declenche sur `port_id`, celui-ci ne regardait que
    # `port_position`. Deux detecteurs qui ne repondaient pas au meme signal
    # sur le meme document est precisement ce qu'on ne veut pas.
    ports_explicites = []
    for obj in objets:
        if "port_position" in obj or "port_id" in obj:
            brut = obj.get("port_position")
            if brut is None:
                # `port_id` sans position : on prend le debut du troncon, ce
                # que fait `_resolve_port_position` de son cote.
                brut = obj.get("start") or obj.get("end")
            if brut is None:
                logger.warning("Port %s : position indeterminable, ignore",
                               obj.get("port_id"))
                continue
            pos = np.asarray(brut, dtype=float) * 1e-3
            ports_explicites.append({
                "id": obj.get("port_id", len(ports_explicites) + 1),
                "position": pos,
                "layer": int(obj.get("layer", 0)),
                "net": obj.get("net", "SIG"),
                "impedance": float(obj.get("port_impedance", 50.0)),
                "type": "via"
            })

    if len(ports_explicites) >= 2:
        return ports_explicites

    # Filtrer uniquement les segments linéaires (tracks)
    tracks = [o for o in objets if o.get("type", "track") == "track" and "start" in o and "end" in o]
    if not tracks:
        tracks = [o for o in objets if "start" in o and "end" in o]
    if not tracks:
        tracks = objets

    p_start = np.asarray(tracks[0].get("start", [0.0, 0.0]), dtype=float) * 1e-3
    p_end = np.asarray(tracks[-1].get("end", [0.0, 0.0]), dtype=float) * 1e-3

    layer_start = int(tracks[0].get("layer", 0))
    layer_end = int(tracks[-1].get("layer", 0))
    net = tracks[0].get("net", "SIG")

    return [
        {
            "id": 1,
            "position": p_start,
            "layer": layer_start,
            "net": net,
            "impedance": 50.0,
            "type": "via"
        },
        {
            "id": 2,
            "position": p_end,
            "layer": layer_end,
            "net": net,
            "impedance": 50.0,
            "type": "via"
        }
    ]


def _detecter_vias_internes(objets: List[Dict], stackup: Dict[str, Any]) -> List[Dict]:
    """
    Détecte les transitions verticales de couche (vias de signal) le long de la chaîne.
    Prend en charge :
    1. Les objets explicites de type 'via'
    2. Les transitions de couche consécutives entre tronçons ('track')

    LES INDICES SONT CEUX DU DOCUMENT TEL QU'IL EST ARRIVE ICI : si l'empilage
    a été renversé, `_renverser_empilage` a déjà remappé toutes les clefs de
    couche, celles des vias comprises. Cette fonction n'a donc rien à savoir de
    l'orientation.
    """
    vias = []
    tol = 1e-4  # 0.1 mm en mètres
    positions_vues = set()

    # 1. Vias explicites dans la liste d'objets
    for obj in objets:
        if obj.get("type") == "via":
            x = float(obj.get("x", 0.0)) * 1e-3
            y = float(obj.get("y", 0.0)) * 1e-3
            l_start = int(obj.get("layer_start", obj.get("layer_from", 0)))
            l_end = int(obj.get("layer_end", obj.get("layer_to", 0)))
            if l_start != l_end:
                cle = (round(x, 5), round(y, 5))
                positions_vues.add(cle)
                vias.append({
                    "x": x,
                    "y": y,
                    "layer_from": min(l_start, l_end),
                    "layer_to": max(l_start, l_end),
                    "drill": float(obj.get("drill", obj.get("drill_diameter", 0.3))) * 1e-3,
                    "pad": float(obj.get("pad", obj.get("pad_diameter", 0.55))) * 1e-3
                })

    # 2. Détection par changement de couche entre segments consécutifs
    tracks = [o for o in objets if o.get("type", "track") == "track" and "start" in o and "end" in o]
    for i in range(1, len(tracks)):
        o_prev = tracks[i - 1]
        o_curr = tracks[i]
        l_prev = int(o_prev.get("layer", 0))
        l_curr = int(o_curr.get("layer", 0))

        if l_prev != l_curr:
            p_end = np.asarray(o_prev.get("end", [0, 0]), dtype=float) * 1e-3
            p_start = np.asarray(o_curr.get("start", [0, 0]), dtype=float) * 1e-3

            pos = p_start
            via_meta = o_curr.get("via") or o_prev.get("via") or {}
            if "x" in via_meta and "y" in via_meta:
                pos = np.array([float(via_meta["x"]), float(via_meta["y"])]) * 1e-3
            elif np.linalg.norm(p_end - p_start) < tol:
                pos = (p_end + p_start) / 2.0

            cle = (round(pos[0], 5), round(pos[1], 5))
            if cle not in positions_vues:
                positions_vues.add(cle)
                vias.append({
                    "x": float(pos[0]),
                    "y": float(pos[1]),
                    "layer_from": min(l_prev, l_curr),
                    "layer_to": max(l_prev, l_curr),
                    "drill": float(via_meta.get("drill_diameter", 0.3)) * 1e-3,
                    "pad": float(via_meta.get("pad_diameter", 0.55)) * 1e-3
                })

    return vias


def _dielectrique_de_reference(couches: List[Dict], i_cu: int,
                               vers_le_bas: bool) -> Tuple[float, float]:
    """L'epsilon_r et le tan_delta du dielectrique que la piste voit vraiment.

    ON MARCHE VERS LE PLAN DE MASSE, et non vers le début de la liste. La
    version précédente prenait le PREMIER diélectrique de l'empilage, quelle
    que soit la couche de la piste : sur un quatre couches, une piste interne
    se voyait attribuer le préimprégné de surface, et le renversement de
    l'empilage changeait la réponse sans changer la carte.
    """
    pas = -1 if vers_le_bas else 1
    i = i_cu + pas
    while 0 <= i < len(couches):
        c = couches[i]
        if c.get("type") == "dielectric":
            return (float(c.get("epsilon_r") or 4.3),
                    float(c.get("tan_delta") or 0.02))
        i += pas
    # Rien de ce cote : on tente l'autre, puis le repli.
    i = i_cu - pas
    while 0 <= i < len(couches):
        c = couches[i]
        if c.get("type") == "dielectric":
            return (float(c.get("epsilon_r") or 4.3),
                    float(c.get("tan_delta") or 0.02))
        i -= pas
    return (4.3, 0.02)


def _uniformite(objets: List[Dict], vias_mailles: int) -> Tuple[bool, str]:
    """La sélection est-elle UNE ligne uniforme, et sinon pourquoi.

    CE QUE CETTE QUESTION DECIDE. `parametres_de_ligne` rend le Z0 de la ligne
    uniforme EQUIVALENTE au deux-ports mesuré. Sur une piste de largeur
    constante posée sur une seule couche, c'est le Z0 de sa section, et il a un
    sens sur chaque tronçon : la carte de chaleur peut le peindre. Dès que la
    largeur change, que la piste change de couche ou qu'un via s'y trouve, ce
    chiffre est une MOYENNE -- juste pour la liaison, faux tronçon par tronçon.

    ET UNE MOYENNE PEINTE COMME UNE VALEUR LOCALE EST PIRE QUE PAS DE CARTE :
    « une carte qu'on ne sait pas peindre ne se peint pas » est la règle du
    panneau, et c'est celle qu'on applique ici en rendant un Z0 nul, que
    `simCouleurBande` peint en gris et que le tableau écrit « — ».
    """
    pistes = [o for o in objets if o.get("type", "track") != "via"]
    if not pistes:
        return False, "aucun tronçon de piste"
    if vias_mailles:
        return False, "la liaison change de couche (%d via%s interne%s)" % (
            vias_mailles, "s" if vias_mailles > 1 else "",
            "s" if vias_mailles > 1 else "")

    couches = {int(o.get("layer", 0)) for o in pistes}
    if len(couches) > 1:
        return False, "les tronçons ne sont pas tous sur la même couche"

    largeurs = [round(float(o.get("width") or 0.0), 4) for o in pistes]
    if len(set(largeurs)) > 1:
        return False, "la largeur change le long du parcours (%s mm)" % (
            " / ".join("%.3f" % w for w in sorted(set(largeurs))))

    return True, ""


def _cout_estime(n_rwg: int, n_points: int) -> float:
    """Le temps de remplissage attendu, en secondes. Voir les garde-fous."""
    return COUT_PAR_PAIRE * float(n_rwg) * float(n_rwg) * float(n_points)


def _resolution_maille(mesh_size_m: float, largeur_min_m: float) -> Tuple[str, str]:
    """La maille resout-elle la piste la plus fine ? Rend (verdict, phrase).

    CE QUE CELA RATTRAPE, ET C'EST MESURE. Sur une piste de 0,25 mm, la maille
    automatique tombait a 0,30 mm -- son PLANCHER, plus large que la piste
    elle-meme. Le solveur resolvait alors une bande d'un triangle de large :
    Z0 sortait a 164,7 ohms la ou la section rendait 123,6, soit 33 % d'ecart,
    et rien ne le disait. Le plancher a ete descendu (c'est le budget de temps
    qui refuse, desormais, et il dit quoi changer), mais une maille SAISIE A LA
    MAIN peut toujours etre trop grossiere.

    TROIS RUBANS EN LARGEUR, c'est le minimum pour qu'une section porte le
    profil de courant transverse -- fort sur les deux bords, creux au milieu.
    En dessous de DEUX, la geometrie resolue n'est plus celle qu'on a dessinee
    et l'on ne rend pas de Z0 du tout : mieux vaut pas de chiffre qu'un chiffre
    faux d'un tiers.
    """
    if not (largeur_min_m > 0 and mesh_size_m > 0):
        return "ok", ""
    rubans = largeur_min_m / mesh_size_m
    if rubans < 2.0:
        return "refus", (
            "La maille (%.3f mm) est plus grossiere que la moitie de la piste"
            " la plus fine (%.3f mm) : elle ne tient que %.1f ruban(s) en"
            " largeur. La geometrie resolue n'est pas celle dessinee, et Z0"
            " n'est donc pas rendu. Il faut une maille de %.3f mm ou moins."
            % (mesh_size_m * 1e3, largeur_min_m * 1e3, rubans,
               largeur_min_m / 3.0 * 1e3))
    if rubans < 3.0:
        return "douteux", (
            "Maillage juste : %.1f rubans en largeur sur la piste la plus fine"
            " (%.3f mm). Z0 est rendu, mais comptez quelques pour cent"
            " d'incertitude ; une maille de %.3f mm les leverait."
            % (rubans, largeur_min_m * 1e3, largeur_min_m / 3.0 * 1e3))
    return "ok", ""


def _eps_plausible(couches: List[Dict], eps_eff: float) -> Tuple[bool, str]:
    """eps_eff extrait est-il celui d'une LIGNE, ou d'autre chose ?

    LA BORNE EST PHYSIQUE ET NE SE DISCUTE PAS. Le champ d'un microruban se
    partage entre le stratifie et l'air : sa permittivite effective est donc
    comprise entre 1 et le plus grand epsilon_r de l'empilage. Un triplaque
    noye atteint cet epsilon_r, jamais plus.

    CE QUE CELA ATTRAPE. Sur une selection COURTE, les deux vias d'acces --
    hauts de toute l'epaisseur du stratifie -- pesent plus lourd que la ligne
    elle-meme, et la ligne uniforme equivalente n'est plus une ligne du tout.
    Mesure sur deux troncons de 3,2 mm d'une carte de 1,55 mm : eps_eff sortait
    a 8,1 puis 12,0 selon la maille, pour un FR4 a 4,4 -- et Z0 errait de 95 a
    134 ohms sans converger. Un chiffre impossible se remarque ; un Z0 faux de
    30 % ne se remarque pas. On refuse donc les deux ensemble, en nommant la
    cause : c'est le de-embarquement a deux longueurs qu'il faut ici, et il
    demande une seconde simulation.
    """
    er_max = 1.0
    for c in couches:
        if c.get("type") == "dielectric":
            er_max = max(er_max, float(c.get("epsilon_r") or 1.0))
    if not (0.9 <= eps_eff <= er_max * 1.05):
        return False, (
            "l'extraction rend eps_eff = %.2f, hors des bornes physiques"
            " [1 ; %.2f] de cet empilage. La ligne est trop courte devant ses"
            " deux vias d'acces (hauts de %.0f %% du stratifie) : ce que la"
            " matrice S decrit n'est plus une ligne. Allongez la selection,"
            " ou passez au moteur 2D, qui calcule la section sans acces."
            % (eps_eff, er_max, 100.0))
    return True, ""


# ==========================================================================
# OU LA DISCONTINUITE MORD -- LA LOCALISATION, ET NON LE CHIFFRAGE
# --------------------------------------------------------------------------
# CE QUE CETTE SECTION NE PRETEND PAS FAIRE, ET IL FAUT LE DIRE D'ABORD. Le
# moteur 2D NOMME chaque discontinuite ET LA CHIFFRE : sur un coude a 90
# degres suivi d'un via TOP -> IN1, il rend « le coude vaut 29,0 fF et 3,33
# degres de phase, le via vaut 65,6 fF et 41 pH de boucle ». Ici, les
# discontinuites sont DANS les parametres S -- resolues, sans modele, et le
# 2,5D voit d'ailleurs 0,67 dB de perte la ou le modele localise du 2D n'en
# voit que 0,19 --, mais rien ne sait les en extraire une par une.
#
# POURQUOI ON NE LES CHIFFRE PAS. Attribuer une discontinuite dans un calcul
# pleine onde demande un calcul DIFFERENTIEL : resoudre la meme geometrie SANS
# elle, et attribuer l'ecart. Une resolution de plus par discontinuite, donc,
# et a 844 fonctions RWG c'est 96 secondes chacune par point de frequence. Le
# prix de l'attribution est un multiple du prix de la reponse.
#
# CE QU'ON PEUT DIRE POUR RIEN, EN REVANCHE : OU. La densite de courant de
# surface est DEJA calculee a f0, pour la carte Jsurf. Une discontinuite y
# laisse un exces LOCAL, et cet exces se projette sur l'abscisse curviligne du
# parcours -- le meme axe en millimetres que la carte de crosstalk, ce qui
# n'est pas un hasard : c'est le seul axe sur lequel un electronicien retrouve
# un endroit de sa carte.
#
# ET C'EST LA MOYENNE EN TRAVERS QU'ON REGARDE, JAMAIS LE MAXIMUM. Le courant
# se concentre sur les BORDS du ruban partout, d'un bout a l'autre du
# parcours, avec plusieurs decades entre le bord et le milieu : un maximum ne
# verrait que cette singularite de bord, qui n'est pas une discontinuite mais
# la physique ordinaire d'une ligne. En integrant sur la LARGEUR a chaque
# abscisse -- la moyenne ponderee par l'aire des triangles --, la singularite
# de bord sort de la comparaison puisqu'elle est partout, et ce qui reste est
# l'exces reellement local.
#
# LES DEUX BOUTS SONT ECARTES, et c'est deliberé. Le fut du port est chaud par
# construction -- c'est la qu'on injecte -- et il n'est PAS sur la carte : la
# piste reelle continue au-dela. Signaler « le port est chaud » ferait
# chercher un defaut a un endroit qui n'existe pas.
#
# ON NE REND DONC NI FARAD NI HENRY, et le champ le dit. « Le via a 3,0 mm
# porte 2,4 fois la densite moyenne de la ligne » est verifiable sur la carte
# Jsurf ; « le via vaut 65 fF » ne le serait pas ici.
# ==========================================================================

# L'exces qui vaut d'etre signale, en multiple de la densite MEDIANE de la
# ligne. Calibre par le banc : une ligne droite uniforme ne depasse pas 1,2 --
# c'est la dispersion de maillage --, un coude a 90 degres et un fut de via
# passent 1,5. La mediane et non la moyenne : elle ne se laisse pas tirer par
# le point chaud qu'on cherche justement a detecter.
# LES DEUX SEUILS, ET LA MESURE QUI LES JUSTIFIE. Sur une ligne droite de
# 8 mm maillee a 0,15 mm, la part transverse du courant vaut 0,035 d'un bout a
# l'autre -- c'est le bruit de la triangulation -- et la part verticale vaut
# EXACTEMENT zero. Au coude a 90 degres, la transverse monte a 0,590 ; au fut
# d'un via, la verticale monte a 0,458. Les seuils sont donc places a environ
# quatre fois le bruit et trois fois sous le signal : il n'y a pas de zone
# grise a arbitrer.
SEUIL_PERP = 0.20
SEUIL_VERT = 0.10
MAX_POINTS_CHAUDS = 12


def _parcours_abscisses(objets: List[Dict]) -> Tuple[List[Dict], float]:
    """La polyligne du parcours, en millimetres, avec l'abscisse curviligne.

    LES VIAS N'ONT PAS DE LONGUEUR le long du parcours : ils n'entrent pas
    dans la polyligne. Leur position sert a NOMMER un point chaud, pas a
    avancer l'abscisse -- l'y compter decalerait tout ce qui suit.
    """
    troncons: List[Dict] = []
    s = 0.0
    for o in objets:
        if o.get("type") == "via":
            continue
        a, b = o.get("start"), o.get("end")
        if not a or not b:
            continue
        p0 = (float(a[0]), float(a[1]))
        p1 = (float(b[0]), float(b[1]))
        lg = math.hypot(p1[0] - p0[0], p1[1] - p0[1])
        if lg <= 0:
            continue
        troncons.append({
            "p0": p0, "p1": p1, "s0": s, "s1": s + lg, "long": lg,
            "dir": ((p1[0] - p0[0]) / lg, (p1[1] - p0[1]) / lg),
            "layer": int(o.get("layer", 0)),
            "largeur": float(o.get("width") or 0.2),
        })
        s += lg
    return troncons, s


def _projeter(troncons: List[Dict], x: float, y: float) -> Tuple[float, float]:
    """(abscisse, ecart) du point du parcours le plus proche de (x, y), en mm."""
    s_best, d_best = 0.0, float("inf")
    for t in troncons:
        dx = t["p1"][0] - t["p0"][0]
        dy = t["p1"][1] - t["p0"][1]
        l2 = dx * dx + dy * dy
        if l2 <= 0:
            continue
        u = ((x - t["p0"][0]) * dx + (y - t["p0"][1]) * dy) / l2
        u = max(0.0, min(1.0, u))
        d = math.hypot(x - (t["p0"][0] + u * dx), y - (t["p0"][1] + u * dy))
        if d < d_best:
            s_best, d_best = t["s0"] + u * t["long"], d
    return s_best, d_best


def _point_du_parcours(troncons: List[Dict], s: float) -> Tuple[float, float, int, float]:
    """(x, y, couche, largeur) a l'abscisse s du parcours."""
    if not troncons:
        return 0.0, 0.0, 0, 0.2
    for t in troncons:
        if s <= t["s1"] or t is troncons[-1]:
            u = 0.0 if t["long"] <= 0 else max(0.0, min(1.0, (s - t["s0"]) / t["long"]))
            return (t["p0"][0] + u * (t["p1"][0] - t["p0"][0]),
                    t["p0"][1] + u * (t["p1"][1] - t["p0"][1]),
                    t["layer"], t["largeur"])
    return 0.0, 0.0, 0, 0.2


def _troncon_a(troncons: List[Dict], s: float) -> Dict:
    """Le troncon qui porte l'abscisse s -- pour sa DIRECTION locale.

    Sur un parcours qui tourne, une normale globale n'aurait aucun sens : la
    part transverse du courant se mesure contre la normale DU TRONCON.
    """
    for t in troncons:
        if s <= t["s1"]:
            return t
    return troncons[-1]


def _reperes_du_parcours(troncons: List[Dict],
                         vias_internes: List[Dict]) -> List[Dict]:
    """Ce qui est NOMMABLE le long du parcours, avec son abscisse.

    Un point chaud tombe rarement pile sur son repere -- le maillage a son
    pas, et l'exces s'etale sur deux ou trois mailles. On rend donc la liste,
    et c'est l'appelant qui apparie avec une tolerance liee a la maille.
    """
    reperes: List[Dict] = []
    for i in range(1, len(troncons)):
        a, b = troncons[i - 1], troncons[i]
        if a["layer"] != b["layer"]:
            # Le changement de couche est deja porte par le via qui le realise,
            # et le nommer deux fois ferait croire a deux causes.
            continue
        cos = a["dir"][0] * b["dir"][0] + a["dir"][1] * b["dir"][1]
        angle = math.degrees(math.acos(max(-1.0, min(1.0, cos))))
        if angle > 5.0:
            reperes.append({"s": a["s1"],
                            "quoi": "coude à %.0f°" % angle})
    for v in vias_internes:
        s, _ = _projeter(troncons, v["x"] * 1e3, v["y"] * 1e3)
        reperes.append({"s": s, "quoi": "via interne"})
    return reperes


def _points_chauds(mesh: Dict, j_vect, objets: List[Dict],
                   vias_internes: List[Dict], maille_mm: float,
                   uniforme: bool = True) -> Dict[str, Any]:
    """Ou le courant CHANGE DE DIRECTION le long du parcours, et sur quoi.

    Rend {points, profil_perp, profil_vert, pas_mm, longueur_mm, ...}.

    ==================================================================
    CE QU'ON MESURE, ET LES DEUX FAUSSES PISTES ECARTEES AVANT
    ------------------------------------------------------------------
    UNE DISCONTINUITE, POUR UNE LIGNE, C'EST DU COURANT QUI TOURNE. Sur un
    troncon droit et uniforme, le courant va TOUT DROIT : il suit l'axe du
    ruban, et rien d'autre. A un coude il doit virer ; a un via il doit
    descendre. C'est cela qu'on mesure, et c'est une definition, pas un
    indice : la composante du courant qui n'est pas dans l'axe du parcours
    est, exactement, le courant que la geometrie redirige.

    A chaque abscisse, deux rapports sans dimension, ponderes par l'aire :

        part transverse = <|J . n|> / <|J|>     n = normale au parcours, a plat
        part verticale   = <|J_z|> / <|J|>

    MESURE, ligne de 8 mm, maille 0,15 mm, 5 GHz :

                            transverse        verticale
        ligne droite        0,035 partout     0,000 partout
        coude a 90 deg      0,590 AU COUDE    0,000
        via TOP -> IN1      0,399 AU VIA      0,458 AU VIA

    SEIZE FOIS LE BRUIT DE FOND pour le coude, et la part verticale est un
    discriminant BINAIRE : 0,000 sur du cuivre a plat, un demi au fut d'un
    via. Elle dit donc aussi le TYPE de discontinuite -- du courant qui vire a
    plat est un coude ou un changement de largeur ; du courant qui descend est
    un via.

    PREMIERE FAUSSE PISTE, ECARTEE : LA DENSITE MOYENNE. On a d'abord cherche
    l'exces de densite de courant moyenne. Mesure : sur une ligne DROITE, elle
    varie d'un facteur TRENTE-DEUX le long du parcours, et le meme « point
    chaud » sortait a 8,36 mm sur la ligne droite et sur celle qui porte un
    coude a 4,5 mm. C'est l'ONDE STATIONNAIRE -- la densite est calculee avec
    le port 1 excite et l'autre COURT-CIRCUITE, ce qui est correct pour en
    tirer les S. Sur une MEME ligne droite, profil normalise :

        2 GHz (L = 0,11 lambda_g)  0,87 ... 1,06   presque plat
        5 GHz (L = 0,28 lambda_g)  0,05 ... 1,56   un quart d'onde
        9 GHz (L = 0,49 lambda_g)  1,73 ... 0,12   un noeud en plein milieu

    SECONDE FAUSSE PISTE, ECARTEE AUSSI : L'ENTASSEMENT EN TRAVERS. On a
    ensuite mesure le rapport du neuvieme decile a la moyenne, en travers du
    ruban -- insensible a l'onde stationnaire, lui. Il discrimine, mais mal :
    1,29 de bruit de maillage sur une ligne droite contre 1,50 au coude, et
    1,17 seulement au via. Seize pour cent de marge ne suffisent pas.

    LES DEUX RAPPORTS D'ICI, EUX, SONT INSENSIBLES A L'ONDE STATIONNAIRE POUR
    LA MEME RAISON que l'entassement -- numerateur et denominateur montent
    ensemble avec le courant --, et ils portent le signal la ou l'entassement
    ne le portait pas.

    LES DEUX BOUTS SORTENT DE LA RECHERCHE, et la mesure dit pourquoi : la
    part verticale y vaut 0,41 a 0,56, parce que le fut du port fait descendre
    le courant vers le plan. C'est le port, pas la carte -- la piste reelle
    continue au-dela.

    ET ON NE REND NI FARAD NI HENRY. « Au coude a 4,0 mm, 59 % du courant
    passe en travers » se verifie sur la carte Jsurf ; « le coude vaut 29 fF »
    ne se justifierait pas ici. C'est le moteur 2D qui le dit, et il faut le
    lui demander.
    ==================================================================
    """
    vide = {"points": [], "profil_perp": [], "profil_vert": [],
            "pas_mm": 0.0, "longueur_mm": 0.0,
            "seuil_perp": SEUIL_PERP, "seuil_vert": SEUIL_VERT,
            "bords_ecartes_mm": 0.0,
            "observable": "part du courant hors de l'axe du parcours"}

    troncons, long_tot = _parcours_abscisses(objets)
    if long_tot <= 0 or j_vect is None or len(j_vect) == 0:
        return vide

    elements = np.asarray(mesh["elements"])
    sommets = np.asarray(mesh["vertices"], dtype=float)
    jv = np.asarray(j_vect)
    if len(elements) != len(jv) or jv.ndim != 2 or jv.shape[1] < 3:
        return vide

    tri = sommets[elements]                          # (M, 3, 3), en metres
    centres = tri.mean(axis=1) * 1e3                 # en millimetres
    aires = 0.5 * np.linalg.norm(
        np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0]), axis=1)
    module = np.linalg.norm(jv, axis=1)

    s_tri = np.array([_projeter(troncons, c[0], c[1])[0] for c in centres])

    # LE PAS EST DEUX MAILLES : c'est aussi l'ordre de grandeur d'une largeur
    # de piste, donc de l'etendue d'une discontinuite.
    pas = max(2.0 * max(maille_mm, 1e-3), long_tot / 200.0)
    nb = max(6, int(math.ceil(long_tot / pas)))
    pas = long_tot / nb
    rang = np.clip((s_tri / long_tot * nb).astype(int), 0, nb - 1)

    MINI = 5
    perp = np.zeros(nb)
    vert = np.zeros(nb)
    parle = np.zeros(nb, dtype=bool)
    for k in range(nb):
        m = rang == k
        if int(m.sum()) < MINI:
            continue
        aa = aires[m]
        mm_ = module[m]
        ref = float((mm_ * aa).sum())
        if not (ref > 0):
            continue
        # LA NORMALE EST CELLE DU TRONCON DE CETTE TRANCHE : sur un parcours
        # qui tourne, une normale globale n'aurait aucun sens.
        t = _troncon_a(troncons, (k + 0.5) * pas)
        n_hat = np.array([-t["dir"][1], t["dir"][0], 0.0])
        j_m = jv[m]
        perp[k] = float((np.abs(j_m @ n_hat) * aa).sum()) / ref
        vert[k] = float((np.abs(j_m[:, 2]) * aa).sum()) / ref
        parle[k] = True

    if not parle.any():
        return vide

    # LES DEUX BOUTS SORTENT DE LA RECHERCHE : voir la docstring, la mesure y
    # est. Deux largeurs de piste suffisent -- au-dela du deuxieme rang, la
    # part verticale est deja retombee a zero.
    largeur_bout = _point_du_parcours(troncons, 0.0)[3]
    marge = max(2.0 * maille_mm, 2.0 * largeur_bout)
    n_bord = max(1, int(math.ceil(marge / pas)))
    cherchable = parle.copy()
    cherchable[:n_bord] = False
    cherchable[max(0, nb - n_bord):] = False

    reperes = _reperes_du_parcours(troncons, vias_internes)

    # LE FOND DE BRUIT MESURE, pour le dire dans le resultat : c'est lui qui
    # justifie le seuil, et un seuil sans son fond de bruit ne se discute pas.
    fond = float(np.median(perp[cherchable])) if cherchable.any() else 0.0

    points: List[Dict[str, Any]] = []
    chaud = cherchable & ((perp >= SEUIL_PERP) | (vert >= SEUIL_VERT))
    i = 0
    while i < nb:
        if not chaud[i]:
            i += 1
            continue
        a = i
        while i < nb and chaud[i]:
            i += 1
        b = i - 1
        # LE PIC EST CELUI DU TOTAL HORS AXE : un via porte les deux
        # composantes, et ne regarder que l'une le placerait de biais.
        hors = np.hypot(perp, vert)
        pic = a + int(np.argmax(hors[a:b + 1]))
        s_pic = (pic + 0.5) * pas
        x, y, couche, largeur = _point_du_parcours(troncons, s_pic)

        tol = max(3.0 * maille_mm, 1.5 * largeur, 2.0 * pas)
        cause = ""
        ecart_repere = None
        if reperes:
            r = min(reperes, key=lambda z: abs(z["s"] - s_pic))
            if abs(r["s"] - s_pic) <= tol:
                cause = r["quoi"]
                ecart_repere = round(abs(r["s"] - s_pic), 3)

        # LE TYPE SORT DE LA MESURE, pas du repere : du courant qui DESCEND est
        # un chemin vertical, qu'on ait su le nommer ou non.
        if vert[pic] >= SEUIL_VERT:
            genre = "chemin vertical"
        else:
            genre = "changement de direction"

        points.append({
            "s_mm": round(s_pic, 3),
            "x": round(x, 3),
            "y": round(y, 3),
            "couche": couche,
            "etendue_mm": round((b - a + 1) * pas, 3),
            "part_transverse": round(float(perp[pic]), 3),
            "part_verticale": round(float(vert[pic]), 3),
            "genre": genre,
            "cause": cause,
            "ecart_repere_mm": ecart_repere,
        })

    # Le plus franc d'abord : c'est celui par lequel on commence a regarder.
    points.sort(key=lambda p: -math.hypot(p["part_transverse"],
                                          p["part_verticale"]))
    del points[MAX_POINTS_CHAUDS:]

    return {
        "points": points,
        "profil_perp": [round(float(v), 4) for v in perp],
        "profil_vert": [round(float(v), 4) for v in vert],
        "pas_mm": round(pas, 4),
        "longueur_mm": round(long_tot, 3),
        "fond_de_bruit": round(fond, 4),
        "seuil_perp": SEUIL_PERP,
        "seuil_vert": SEUIL_VERT,
        "bords_ecartes_mm": round(n_bord * pas, 3),
        "observable": "part du courant hors de l'axe du parcours",
        "largeur_constante": bool(uniforme),
    }


def _touchstone(freqs: np.ndarray, matrices: List[np.ndarray], z0: float = 50.0,
                entete: Optional[List[str]] = None) -> str:
    """Le texte d'un fichier .sNp, format « MA » (module / angle en degrés).

    N PORTS ET NON DEUX. La version précédente indexait s[0,0], s[1,0], s[0,1]
    et s[1,1] en dur : sur un réseau à trois ports -- ce que rend
    `_localiser_bornes_chaine` dès que le document porte trois
    `port_position` --, elle écrivait un fichier d'apparence valide qui avait
    perdu la moitié de la matrice, en-tête « 2 ports » comprise.

    L'ORDRE EST CELUI DE LA NORME : ligne par ligne, S11 S12 … S1N, puis
    S21 … -- sauf pour un deux-ports, où la norme veut S11 S21 S12 S22. Quatre
    paires au plus par ligne, comme le veut le format.
    """
    n = matrices[0].shape[0] if matrices else 2
    lignes = ["! " + str(l) for l in (entete or [])]
    lignes.append("# HZ S MA R %g" % z0)
    for f, s in zip(freqs, matrices):
        if n == 2:
            ordre = [(0, 0), (1, 0), (0, 1), (1, 1)]
        else:
            ordre = [(i, j) for i in range(n) for j in range(n)]
        vals = []
        for i, j in ordre:
            vals.append("%.6g %.4f" % (abs(s[i, j]),
                                       math.degrees(math.atan2(s[i, j].imag,
                                                               s[i, j].real))))
        # Une rangee de la matrice par ligne physique, quatre paires au plus.
        premiere = "%.6g" % f
        for k in range(0, len(vals), 4):
            morceau = " ".join(vals[k:k + 4])
            lignes.append(("%s %s" % (premiere, morceau)) if k == 0
                          else ("       " + morceau))
    return "\n".join(lignes) + "\n"


def simuler_25d(doc: Dict[str, Any], journal: Optional[Any] = None,
                mesh_size_mm: Optional[float] = None) -> Dict[str, Any]:
    """
    Point d'entrée principal : résout un document cao-sim-em-3 avec mom_solver.

    Retourne un dictionnaire standardisé cao-sim-em-resultat-5 directement
    exploitable par le panneau de simulation WEB_CAO.
    """
    if ERREUR_MOM is not None or mom_solver is None:
        raise ErreurSimulation25D(
            "Solveur MoM 2.5D indisponible : %s" % ERREUR_MOM,
            "Vérifiez que mom_solver et ses dépendances (numpy, scipy) sont présents."
        )

    t0 = time.time()
    couches, objets, analyse = _valider_document(doc)
    fc = analyse["f_centre"]
    f1, f2 = analyse["f_debut"], analyse["f_fin"]
    points = analyse["points"]
    ajuste: List[str] = list(analyse["ajuste"])
    z_ref = float(((doc.get("ports") or [{}])[0]).get("impedance") or 50.0)

    if journal:
        journal("Solveur 2.5D : extraction de la géométrie...\n")

    # 1. Extraction et adaptation du stackup
    stackup = extract_stackup(doc)
    couches_cu = [i for i, c in enumerate(stackup.get("layers", [])) if c.get("type") == "copper"]
    plans = [i for i in couches_cu if str(stackup["layers"][i].get("role", "")) == "plane"]
    signaux = [i for i in couches_cu if str(stackup["layers"][i].get("role", "")) != "plane"]
    if not plans:
        raise ErreurSimulation25D(
            "Aucun plan de masse détecté dans l'empilage.",
            "Définissez au moins une couche de cuivre comme plan de référence (role: 'plane')."
        )
    if not signaux:
        raise ErreurSimulation25D(
            "Aucune couche de signal détectée dans l'empilage.",
            "Définissez au moins une couche de cuivre pour le signal (role: 'signal')."
        )

    # Orientation de l'empilage : voir `_renverser_empilage`, qui porte la
    # raison ET remappe TOUS les indices de couche, vias compris.
    if plans and signaux and all(p > max(signaux) for p in plans):
        doc = _renverser_empilage(doc, len(doc.get("stackup", {}).get("layers", [])))
        stackup = extract_stackup(doc)
        objets = doc["geometry"]["objects"]

    # 2. Extraction des polygones et fusion topologique
    polygons_bruts = extract_polygons(doc)
    polygons = _fusionner_segments_pistes(polygons_bruts, ajuste)

    # 3. Positionnement des ports d'accès
    ports = _localiser_bornes_chaine(objets, stackup)
    for p in ports:
        p["impedance"] = z_ref

    # LES PORTS SONT DONNES, ET NON REDETECTES. `build_geometry_model`
    # appelait `pcb_parser.detect_ports` sur les polygones FUSIONNES -- des
    # zones sans `start` ni `end` --, si bien qu'il retombait toujours sur son
    # repli de boîte englobante, et son résultat était ensuite écrasé par
    # celui-ci. Deux détecteurs de ports, dont un tournait pour rien.
    geometry = build_geometry_model(polygons, stackup, ports=ports)

    # 4. Taille de maille
    opt = doc.get("options") or {}
    if mesh_size_mm is None:
        mesh_size_mm = opt.get("mesh_size_mm") or opt.get("maille_mm")

    # LA PISTE LA PLUS FINE COMMANDE LA MAILLE, et le plancher ne la commande
    # plus. Il etait a 0,30 mm : sur une piste de 0,25 mm -- courant sur une
    # carte a deux couches -- la maille automatique sortait donc PLUS LARGE que
    # la piste, et le solveur resolvait un ruban d'un triangle de large. Mesure
    # sur l'exemple 1 du depot : Z0 = 164,7 ohms contre 123,6 par la section,
    # soit un tiers d'ecart, sans un mot.
    #
    # LE PLANCHER RESTE, mais a 0,05 mm : il n'est plus la que pour ecarter une
    # largeur aberrante (zero, ou un micron). C'est le BUDGET DE TEMPS qui
    # refuse maintenant les maillages hors de portee, et lui sait dire quoi
    # changer -- un plancher, non.
    largeurs_m = [float(o.get("width") or 0.0) * 1e-3 for o in objets
                  if o.get("type") != "via" and float(o.get("width") or 0.0) > 0]
    min_w = min(largeurs_m) if largeurs_m else 0.5e-3

    maille_auto = False
    if mesh_size_mm is not None and float(mesh_size_mm) > 0:
        mesh_size_m = float(mesh_size_mm) * 1e-3
    else:
        maille_auto = True
        bbox = geometry["bbox"]
        dim = max(bbox["x_max"] - bbox["x_min"], bbox["y_max"] - bbox["y_min"])
        mesh_size_m = max(min(min_w / 3.0, dim / 20.0), 0.05e-3)

    verdict_maille, phrase_maille = _resolution_maille(mesh_size_m, min_w)
    if verdict_maille == "douteux":
        _ajuster(ajuste, phrase_maille)

    if journal:
        journal(f"Solveur 2.5D : génération du maillage (h={mesh_size_m*1e3:.3f} mm)...\n")

    try:
        mesh = generate_2d_mesh(geometry, mesh_size_m)
    except ValueError as exc:
        raise ErreurSimulation25D(
            f"Erreur de maillage 2.5D : {exc}",
            conseil="Vérifiez que vos pistes sont tracées sur une couche de cuivre signal et non sur un plan de masse."
        ) from exc

    # 5. Vias internes de signal (changement de couche au milieu de la chaîne)
    #
    # UN VIA QU'ON NE SAIT PAS MAILLER EST UN REFUS, ET NON UN AVERTISSEMENT
    # DANS UN JOURNAL. Sans son fût, les deux moitiés de la piste ne se
    # touchent pas dans le maillage : la structure résolue est une COUPURE, et
    # les paramètres S qui en sortent sont ceux de deux tronçons ouverts. Le
    # résultat reste parfaitement présentable -- c'est tout le problème.
    z_couches = {i: c.get("z_top", 0.0) for i, c in enumerate(stackup.get("layers", []))}
    vias_internes = _detecter_vias_internes(objets, stackup)
    for v in vias_internes:
        z_from = z_couches.get(int(v["layer_from"]), 0.0)
        z_to = z_couches.get(int(v["layer_to"]), 0.0)
        if journal:
            journal(f"Solveur 2.5D : maillage du via interne à ({v['x']*1e3:.2f}, {v['y']*1e3:.2f}) mm "
                    f"(couches {v['layer_from']} -> {v['layer_to']})...\n")
        try:
            mesh = mailler_via_interne(
                mesh, (v["x"], v["y"]), z_from, z_to,
                couche_haut=v["layer_from"], couche_bas=v["layer_to"]
            )
        except Exception as exc:  # noqa: BLE001
            raise ErreurSimulation25D(
                "Le via interne à (%.3f, %.3f) mm, entre les couches %d et %d,"
                " n'a pas pu être maillé : %s"
                % (v["x"] * 1e3, v["y"] * 1e3, v["layer_from"], v["layer_to"], exc),
                "Sans son fût, les deux moitiés de la piste ne se touchent pas"
                " et le calcul porterait sur une liaison coupée. Affinez la"
                " maille (le fût se pose sur un triangle existant), vérifiez"
                " que les deux couches du via portent bien du cuivre du net"
                " analysé, ou passez au moteur 2D, qui modélise la transition"
                " analytiquement."
            ) from exc

    # 6. Ports verticaux
    positions = [tuple(np.asarray(p["position"], dtype=float).ravel()[:2]) for p in ports]
    z_ports = [z_couches.get(int(p.get("layer", 0)), 0.0) for p in ports]
    try:
        hauteurs_ports = [hauteur_electrique(stackup, z_piste=z_p) for z_p in z_ports]
    except ValueError as exc:
        raise ErreurSimulation25D(
            "Pas de plan de masse sous (ni sur) la couche d'un port : %s" % exc,
            "Un port relie la piste au plan de référence. Déclarez une couche"
            " de cuivre en role: 'plane' du bon côté de la piste.") from exc

    try:
        mesh, rwg_basis, coupes = maillage_avec_ports_verticaux(
            mesh, positions, hauteurs_ports, z_cible=z_ports
        )
    except ValueError as exc:
        raise ErreurSimulation25D(
            f"Erreur de placement des ports 2.5D : {exc}",
            conseil="Vérifiez la position des ports ou les bornes de vos pistes."
        ) from exc

    hauteur = abs(hauteurs_ports[0]) if hauteurs_ports else 0.8e-3
    vers_le_bas = (hauteurs_ports[0] >= 0) if hauteurs_ports else True
    couches_st = stackup.get("layers", [])

    # 6 bis. Balayage fréquentiel, et LE COUT AVANT DE LE PAYER.
    freqs = np.linspace(f1, f2, points)
    if freqs.size and np.min(np.abs(freqs - fc)) > 1e-6 * max(fc, 1.0):
        freqs = np.sort(np.append(freqs, fc))
        _ajuster(ajuste,
                 "La fréquence de travail (%.4g GHz) ne tombait sur aucun point"
                 " de la bande : elle a été ajoutée, ce qui fait %d points au"
                 " lieu de %d." % (fc / 1e9, len(freqs), points))

    n_rwg = len(rwg_basis)
    if n_rwg > MAX_RWG:
        raise ErreurSimulation25D(
            "Maillage trop lourd pour le 2,5D : %d fonctions RWG, maximum %d."
            % (n_rwg, MAX_RWG),
            "La matrice d'impédance est PLEINE : son remplissage coûte le carré"
            " de ce nombre. Augmentez la taille de maille (champ « Maille »),"
            " réduisez la sélection, ou passez au moteur 2D.")

    cout = _cout_estime(n_rwg, len(freqs))
    if cout > BUDGET_SECONDES:
        raise ErreurSimulation25D(
            "Calcul 2,5D trop long : environ %d min pour %d fonctions RWG sur"
            " %d point(s) de fréquence (budget %d min)."
            % (round(cout / 60.0), n_rwg, len(freqs),
               round(BUDGET_SECONDES / 60.0)),
            "Le coût varie comme le carré du maillage et comme le nombre de"
            " points. Trois leviers, du plus efficace au moins : augmentez la"
            " taille de maille%s, réduisez le nombre de points de la bande"
            " (%d actuellement), ou raccourcissez la sélection. Le moteur 2D"
            " répond en millisecondes sur la même géométrie."
            % (" (elle est automatique, à %.3f mm)" % (mesh_size_m * 1e3)
               if maille_auto else "", len(freqs)))

    idx_fc = int(np.argmin(np.abs(freqs - fc)))
    s_params = []
    if journal:
        journal(f"Solveur 2.5D : résolution MoM sur {len(freqs)} fréquence(s) "
                f"({n_rwg} RWG, environ {cout:.0f} s attendues)...\n")

    z_matrix_fc = None
    for idx, f in enumerate(freqs):
        noyaux = noyaux_multicouches(stackup, float(f), avec_vertical=True)
        z_matrix = fill_z_matrix(
            rwg_basis, float(f), noyaux,
            vertices=mesh["vertices"], elements=mesh["elements"],
            layer_ids=mesh.get("layer_ids")
        )
        if idx == idx_fc:
            z_matrix_fc = z_matrix
        s_matrix = compute_s_parameters(z_matrix, rwg_basis, ports, float(f), coupes)
        s_params.append(s_matrix)
        if journal:
            journal("Solveur 2.5D : point %d/%d à %.4f GHz fait.\n"
                    % (idx + 1, len(freqs), f / 1e9))

    # 7. Synthèse des grandeurs à f0
    s_fc = s_params[idx_fc]
    s11_fc = s_fc[0, 0]
    s21_fc = s_fc[1, 0]

    if not np.isfinite(s_fc).all():
        raise ErreurSimulation25D(
            "Le solveur a rendu une matrice S non finie à %.4f GHz."
            % (fc / 1e9),
            "C'est en général un port qui n'a pas trouvé de coupe sur le"
            " maillage. Affinez la maille ou vérifiez la position des ports.")

    # Longueur totale de la ligne, en millimètres. LES VIAS N'EN SONT PAS :
    # un via n'a pas de longueur le long du parcours, et l'y compter gonflerait
    # le retard comme les pertes.
    def _long_obj(obj):
        if obj.get("type") == "via":
            return 0.0
        v = obj.get("length")
        if v is not None:
            return float(v)
        a = obj.get("start") or [0.0, 0.0]
        b = obj.get("end") or [0.0, 0.0]
        return math.hypot(float(b[0]) - float(a[0]), float(b[1]) - float(a[1]))

    longueurs = [_long_obj(o) for o in objets]
    long_tot = float(sum(longueurs))

    # LES PARAMETRES DE LIGNE, TIRES DES S DU SOLVEUR ET DE RIEN D'AUTRE.
    # Voir `solver_extract.parametres_de_ligne` pour le pourquoi et l'algèbre.
    ligne_pl = None
    refus_pl = ""
    if verdict_maille == "refus":
        refus_pl = phrase_maille
    elif long_tot > 0 and len(ports) == 2:
        try:
            ligne_pl = parametres_de_ligne(s_fc, z_ref, long_tot * 1e-3, fc)
        except ValueError as exc:
            refus_pl = str(exc)
        else:
            # LE CHIFFRE EST-IL CELUI D'UNE LIGNE ? Voir `_eps_plausible` : sur
            # une selection courte, les deux vias d'acces pesent plus que la
            # ligne, et l'extraction rend un eps_eff impossible. On ne garde
            # pas un Z0 qu'on ne sait pas justifier.
            bon, pourquoi = _eps_plausible(couches_st, ligne_pl["eps_eff"])
            if not bon:
                ligne_pl = None
                refus_pl = pourquoi
    elif len(ports) != 2:
        refus_pl = ("la structure a %d ports : Z0 et eps_eff ne se lisent que "
                    "sur un deux-ports" % len(ports))
    else:
        refus_pl = "la sélection n'a pas de longueur"

    if ligne_pl is not None:
        z0_ligne = ligne_pl["z0_reel"]
        eps_eff = ligne_pl["eps_eff"]
        retard_tot = ligne_pl["retard"]
        alpha_db_m = ligne_pl["alpha_db_par_m"]
        z_in = ligne_pl["z_in"]
    else:
        z0_ligne = 0.0
        eps_eff = 0.0
        retard_tot = 0.0
        alpha_db_m = 0.0
        z_in = (z_ref * (1.0 + s11_fc) / (1.0 - s11_fc)
                if abs(1.0 - s11_fc) > 1e-5 else complex(1e6, 0.0))

    if ligne_pl is not None and ligne_pl["phase_ambigue"]:
        _ajuster(ajuste,
                 "La liaison dépasse la demi-longueur d'onde guidée à %.4g GHz :"
                 " la phase de la constante de propagation est ambiguë d'un"
                 " multiple de 2π, et ε_eff comme le retard peuvent être"
                 " sous-estimés. Baissez la fréquence de travail ou"
                 " raccourcissez la sélection pour lever le doute."
                 % (fc / 1e9))
    if refus_pl:
        _ajuster(ajuste,
                 "Impédance caractéristique et ε_eff non extraits : %s. Les"
                 " paramètres S restent valables." % refus_pl)

    # Densité de courant de surface Jsurf à fc (excitation port 1)
    j_mag_list = []
    j_min_val = 0.0
    j_max_val = 0.0
    # LES VECTEURS, ET NON LEUR MODULE. `j_mag_list` ne garde que |J|, arrondi
    # au dix-millieme pour l'affichage ; la recherche de discontinuites a
    # besoin de la DIRECTION du courant -- c'est toute son observable. On
    # gardait le module et on jetait le reste.
    j_vect = None
    if z_matrix_fc is not None and coupes and len(coupes) > 0:
        try:
            v_vec = vecteur_de_coupe(rwg_basis, coupes[0], len(rwg_basis), 1.0)
            lu, piv = lu_factor(z_matrix_fc)
            cur_fc = lu_solve((lu, piv), v_vec)
            j_vecs = compute_current_density(cur_fc, rwg_basis, mesh)
            j_mags = np.linalg.norm(j_vecs, axis=1)
            j_min_val = float(np.min(j_mags))
            j_max_val = float(np.max(j_mags))
            j_mag_list = [round(float(val), 4) for val in j_mags]
            j_vect = j_vecs
        except Exception as exc:  # noqa: BLE001
            logger.warning("Calcul de la densité de courant Jsurf échoué : %s", exc)
            _ajuster(ajuste, "La carte de densité de courant n'a pas pu être"
                             " calculée : %s" % exc)

    # OU LES DISCONTINUITES MORDENT. Gratuit : la densité de courant vient
    # d'être calculée pour la carte Jsurf, et il ne reste qu'à la projeter sur
    # l'abscisse curviligne. Voir le grand commentaire de `_points_chauds`
    # pour ce que cela dit -- et surtout pour ce que cela ne dit pas.
    uniforme_pc = _uniformite(objets, len(vias_internes))[0]
    chauds = {"points": [], "profil": [], "pas_mm": 0.0, "reference": 0.0,
              "longueur_mm": 0.0}
    if j_vect is not None:
        try:
            chauds = _points_chauds(mesh, j_vect, objets, vias_internes,
                                    mesh_size_m * 1e3, uniforme_pc)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Recherche des points chauds échouée : %s", exc)

    duree_calcul = time.time() - t0

    # LA CARTE PAR TRONCON N'EST PEINTE QUE SI ELLE VEUT DIRE QUELQUE CHOSE.
    uniforme, motif = _uniformite(objets, len(vias_internes))
    raison_z0 = ""
    if ligne_pl is None:
        raison_z0 = "Z₀ non extrait : %s." % refus_pl
    elif not uniforme:
        raison_z0 = ("Le 2,5D rend une seule impédance équivalente pour la"
                     " liaison entière (%.1f Ω) : %s, ce chiffre est donc une"
                     " moyenne et non la valeur de ce tronçon."
                     % (z0_ligne, motif))

    entete = [
        "Généré par WEB_CAO -- MoM 2.5D Pleine Onde (mom_solver)",
        f"Carte : {doc.get('carte', '-')}",
        f"Net : {doc.get('net', '-')}",
        f"Fréquence centrale : {fc/1e9:.4f} GHz",
        f"Z0 extrait des S : {z0_ligne:.2f} ohm"
        + (" (ligne équivalente : %s)" % motif if not uniforme else ""),
        f"Z_in vue du port 1 : {z_in.real:.2f} + j{z_in.imag:.2f} ohm",
        f"eps_eff extrait : {eps_eff:.4f}",
        f"Éléments : {mesh['num_elements']} triangles, {n_rwg} RWG",
        f"Durée de calcul : {duree_calcul:.2f} s"
    ]

    touchstone_txt = _touchstone(freqs, s_params, z_ref, entete)

    segments_res = []
    for obj, long_seg in zip(objets, longueurs):
        i_cu = int(obj.get("layer", 0))
        er_seg, tan_seg = _dielectrique_de_reference(couches_st, i_cu, vers_le_bas)
        # LE NOM DE LA COUCHE VOYAGE AVEC LE TRONCON. `simSection` l'affiche,
        # et sans lui la fiche ecrivait « couche 4 » -- un indice d'empilage,
        # et de surcroit celui d'APRES le renversement, que personne sur la
        # carte ne reconnait.
        nom_cu = ""
        if 0 <= i_cu < len(couches_st):
            nom_cu = str(couches_st[i_cu].get("name") or "")
        # LA HAUTEUR EST CELLE DE CETTE COUCHE-LA, et non celle du port : sur
        # une liaison qui change de couche, les deux moitiés ne voient pas le
        # même diélectrique.
        try:
            h_seg = abs(hauteur_electrique(
                stackup, z_piste=z_couches.get(i_cu, 0.0)))
        except ValueError:
            h_seg = hauteur

        if obj.get("type") == "via":
            # UN VIA N'EST PAS UN TRONCON DE LIGNE, mais le contrat du format
            # veut « un segment par objet envoyé, dans le même ordre » : c'est
            # par cet alignement que la page retrouve le cuivre à peindre. On
            # garde donc la ligne, et on la marque au lieu de l'inventer.
            segments_res.append({
                "z0": 0.0,
                "longueur": 0.0,
                "largeur": 0.0,
                "couche": i_cu,
                "nom_couche": nom_cu,
                "topo": "via",
                "h": round(h_seg * 1e3, 3),
                "er": round(er_seg, 2),
                "tan_delta": round(tan_seg, 4),
                "cuivre": round(float(obj.get("copper_thickness") or 0.035), 4),
                "eps_eff": 0.0,
                "retard": 0.0,
                "pertes_db": 0.0,
                "raison": "Transition verticale : le fût est maillé et entre"
                          " dans les paramètres S, mais il n'a ni section ni"
                          " impédance de ligne.",
            })
            continue

        segments_res.append({
            "z0": round(z0_ligne, 2) if (uniforme and ligne_pl is not None) else 0.0,
            "longueur": round(float(long_seg), 4),
            "largeur": round(float(obj.get("width") or 0.2), 4),
            "couche": i_cu,
            "nom_couche": nom_cu,
            "topo": "2.5d_pleine_onde",
            "h": round(h_seg * 1e3, 3),
            "er": round(er_seg, 2),
            "tan_delta": round(tan_seg, 4),
            "cuivre": round(float(obj.get("copper_thickness") or 0.035), 4),
            "eps_eff": round(eps_eff, 3),
            # CHACUN SA LONGUEUR. Le retard et les pertes viennent de beta et
            # de alpha, extraits des S, multiplies par la longueur DE CE
            # TRONCON.
            #
            # LE RETARD N'EST PAS ARRONDI, et c'est pour la meme raison que
            # dans `simulation_em` : un retard de troncon vaut quelques
            # picosecondes, et l'arrondir a la treizieme decimale -- ce que
            # faisait la 1.0.0 a la onzieme -- en perd le pour-cent. La somme
            # des troncons ne redonnait plus le total de la liaison, ce qui
            # est la seule chose qu'on lui demande de garantir.
            "retard": (retard_tot * (long_seg / long_tot)) if long_tot > 0 else 0.0,
            "pertes_db": round(alpha_db_m * long_seg * 1e-3, 4),
            "raison": raison_z0,
        })

    n_troncons = sum(1 for o in objets if o.get("type") != "via")

    # LE BILAN DE LA LIAISON EST LA SOMME DE SES TRONCONS, et non un second
    # calcul a cote : c'est ce que fait `simulation_em`, et c'est ce qui
    # garantit que la fiche et le tableau ne se contredisent pas.
    retard_ligne = sum(s["retard"] for s in segments_res)
    pertes_ligne = sum(s["pertes_db"] for s in segments_res)

    # ==================================================================
    # CE QUE CE CALCUL COUVRE, ET CE QU'IL NE COUVRE PAS
    # ------------------------------------------------------------------
    # LES DEUX MOTEURS NE REPONDENT PAS A LA MEME QUESTION, et basculer de
    # l'un a l'autre perdait des diagnostics sans qu'une ligne le dise. Le
    # 2,5D gagne les coudes, les transitions et le rayonnement, sans modele ;
    # il perd TOUT CE QUE `simulation_em` mesure sur le cuivre voisin, parce
    # que son plan de masse est analytique et infini. C'est ecrit ici, a
    # cote du chiffre, et non dans un fichier de documentation.
    # ==================================================================
    avertissements = [
        "Simulation MoM 2.5D pleine onde (MPIE) : les coudes, les transitions"
        " de couche et le rayonnement sont dans les paramètres S, sans modèle"
        " analytique.",
        "Maillage surfacique : %d triangles, %d fonctions RWG, maille %.3f mm%s"
        " -- %.1f ruban(s) en largeur sur la piste la plus fine (%.3f mm)."
        % (mesh["num_elements"], n_rwg, mesh_size_m * 1e3,
           " (automatique)" if maille_auto else "",
           (min_w / mesh_size_m) if mesh_size_m > 0 else 0.0, min_w * 1e3),
        "Z₀ et ε_eff sont extraits des paramètres S du solveur (Eisenstadt et"
        " Eo, 1992) : Z₀ = %.2f Ω, ε_eff = %.4f à %.4g GHz."
        % (z0_ligne, eps_eff, fc / 1e9),
        "LE PLAN DE MASSE EST ANALYTIQUE ET INFINI. Ce moteur ne voit ni la"
        " masse coplanaire, ni l'écart latéral au cuivre voisin, ni la couture"
        " de vias : un plan fendu, mal cousu ou absent sous une partie du"
        " parcours donnerait ici le même chiffre qu'un plan parfait. Le moteur"
        " 2D mesure ces trois choses et refuse de créditer un plan flottant.",
        "Les vias de masse et de retour du document (« vias ») ne sont pas lus"
        " par ce moteur : seules les transitions de couche du parcours sont"
        " maillées. L'inductance de boucle de retour, les moignons et la"
        " cavité entre plans relèvent du moteur 2D.",
    ]
    if vias_internes:
        avertissements.append(
            "Transitions de couches : %d via(s) interne(s) maillé(s) en fût"
            " vertical RWG continu. LE PERÇAGE N'EST PAS HONORE : le fût prend"
            " la taille de la maille (%.3f mm) et non celle du trou"
            " (%.3f mm), et l'antipad n'entre pas dans le modèle."
            % (len(vias_internes), mesh_size_m * 1e3,
               min(v["drill"] for v in vias_internes) * 1e3))
    if chauds.get("points"):
        avertissements.append(
            "Discontinuités : %d endroit(s) où le courant sort de l'axe du"
            " parcours, LOCALISÉS et non chiffrés — ce moteur ne rend ni"
            " farad ni henry pour un coude ou un via. Ce qu'ils coûtent se lit"
            " avec le moteur 2D, sur la même sélection."
            % len(chauds["points"]))
    if not uniforme and ligne_pl is not None:
        avertissements.append(
            "Sélection non uniforme (%s) : Z₀ est celui de la ligne équivalente"
            " à la liaison entière. La carte de chaleur reste donc grise, faute"
            " de valeur par tronçon." % motif)
    # LES CORRECTIONS FAITES D'OFFICE, EN TETE DE CE QUI SUIT.
    avertissements = ajuste + avertissements

    # Formatage du maillage pour visualisation (coordonnées en mm)
    v_mm = [[round(float(v[0]) * 1e3, 4), round(float(v[1]) * 1e3, 4), round(float(v[2]) * 1e3, 4)]
            for v in mesh["vertices"]]
    el_list = [list(map(int, e)) for e in mesh["elements"]]
    lay_list = [int(l) for l in mesh.get("layer_ids", np.zeros(len(el_list), dtype=int))]

    # LES COUCHES QUE LE MAILLAGE PORTE, NOMMEES ET SITUEES EN Z.
    #
    # POURQUOI CE TABLEAU EXISTE. `layer_ids` etait exporte et lu par personne :
    # le calque de maillage regroupait les triangles a l'oeil, sur un ecart en
    # z, et n'avait donc aucun moyen de DIRE de quelle couche il parlait. Sur
    # une liaison qui change de couche, les deux se peignaient l'une sur
    # l'autre, du meme cyan, sans rien pour les distinguer. Avec ceci, la
    # legende nomme ce qu'elle montre.
    #
    # ET C'EST BIEN layer_ids QUI FAIT FOI POUR LES COUCHES, pas le z : les
    # PAROIS d'un via portent le layer_id d'une couche de signal alors qu'elles
    # s'etendent entre deux z. C'est l'inverse pour reconnaitre une paroi --
    # seul le z le dit --, et les deux informations ne sont donc pas
    # interchangeables.
    couches_maillage = []
    for i_cu in sorted(set(lay_list)):
        if 0 <= i_cu < len(couches_st):
            c = couches_st[i_cu]
            couches_maillage.append({
                "layer": int(i_cu),
                "nom": str(c.get("name") or ("couche %d" % i_cu)),
                "role": str(c.get("role") or ""),
                "z": round(float(c.get("z_top", 0.0)) * 1e3, 4),
            })

    maillage_res = {
        "sommets": v_mm,
        "elements": el_list,
        "layer_ids": lay_list,
        "couches": couches_maillage,
        "num_elements": int(mesh["num_elements"]),
        "num_rwg": n_rwg,
        "ports": [
            {
                "id": p["id"],
                "x": round(float(p["position"][0]) * 1e3, 4),
                "y": round(float(p["position"][1]) * 1e3, 4),
                "z": round(float(z_couches.get(int(p.get("layer", 0)), 0.0)) * 1e3, 4),
                "layer": int(p.get("layer", 0)),
                "type": "port"
            } for p in ports
        ],
        "vias_internes": [
            {
                "x": round(float(v["x"]) * 1e3, 4),
                "y": round(float(v["y"]) * 1e3, 4),
                "z_haut": round(float(max(z_couches.get(int(v["layer_from"]), 0.0), z_couches.get(int(v["layer_to"]), 0.0))) * 1e3, 4),
                "z_bas": round(float(min(z_couches.get(int(v["layer_from"]), 0.0), z_couches.get(int(v["layer_to"]), 0.0))) * 1e3, 4),
                "layer_from": int(v["layer_from"]),
                "layer_to": int(v["layer_to"]),
                "type": "via_interne"
            } for v in vias_internes
        ],
        "courants": j_mag_list,
        "courant_min": round(j_min_val, 4),
        "courant_max": round(j_max_val, 4),
        "courant_unite": "A/m"
    }

    duree = time.time() - t0

    return {
        "format": FORMAT_RESULTAT,
        "moteur": "2.5d",
        "carte": doc.get("carte") or "",
        "net": doc.get("net") or "",
        "reference_nets": [str(c.get("net") or c.get("name")) for c in couches_st
                           if c.get("role") == "plane"],
        "f_centre": fc,
        "impedance_reference": z_ref,
        "segments": segments_res,
        "ligne": {
            "z0_min": round(z0_ligne, 2),
            "z0_max": round(z0_ligne, 2),
            "z0_moyen": round(z0_ligne, 2),
            "eps_eff": round(eps_eff, 3),
            # LE RETARD ET LES PERTES DE LA LIAISON, que le panneau lisait dans
            # le vide : ils manquaient tous les deux, et l'en-tete affichait
            # « — ps » et « — dB » en 2,5D.
            "retard": retard_ligne,
            "pertes_db": round(pertes_ligne, 4),
            "z_in_reel": round(float(z_in.real), 2),
            "z_in_imag": round(float(z_in.imag), 2),
            "s11_db": round(20.0 * math.log10(max(abs(s11_fc), 1e-12)), 2),
            "s21_db": round(20.0 * math.log10(max(abs(s21_fc), 1e-12)), 2),
            "longueur": round(long_tot, 3),
            "troncons": n_troncons,
            "vias_internes": len(vias_internes),
            "triangles": mesh["num_elements"],
            "rwg": n_rwg,
            # LE CUMUL EST VALABLE : les paramètres S portent le parcours
            # entier, et le retard comme les pertes en sortent. Sur une
            # sélection ramifiée il n'y aurait pas de deux-ports du tout, et
            # `parametres_de_ligne` aurait refusé plus haut.
            "cumuls_valides": ligne_pl is not None,
        },
        # CE MOTEUR NE CHIFFRE PAS SES DISCONTINUITES, et c'est une limite de
        # methode et non un oubli : elles sont DANS les paramètres S, resolues,
        # mais les en extraire une par une demanderait de resoudre la meme
        # geometrie SANS chacune d'elles. Le moteur 2D les nomme et les estime
        # en farads et en henrys ; ici, `coudes` et `transitions` restent donc
        # vides -- et l'avertissement dit pourquoi.
        #
        # IL DIT EN REVANCHE OU, ce qui ne coute rien : voir `points_chauds` et
        # le grand commentaire de `_points_chauds`. La densite de courant est
        # deja calculee pour la carte Jsurf, et l'exces local d'une
        # discontinuite se projette sur l'abscisse curviligne du parcours.
        "discontinuites": {
            "coudes": [],
            "transitions": [],
            "vias_hors_chaine": [],
            "points_chauds": chauds,
        },
        "freqs": [float(f) for f in freqs],
        "s": [[[float(v.real), float(v.imag)] for v in m.flatten()] for m in s_params],
        "ports": len(ports),
        "touchstone": touchstone_txt,
        "topologie": {"cascadable": True, "chaine": True,
                      "uniforme": bool(uniforme)},
        "cascade_refusee": "",
        "maillage": maillage_res,
        "maille_mm": round(mesh_size_m * 1e3, 4),
        "duree": round(duree, 3),
        "notes": avertissements,
        "avertissements": avertissements
    }
