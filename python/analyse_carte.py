#!/usr/bin/python3
# -*- coding: utf-8 -*-
"""
Analyse de la carte entière pour WEB_CAO : toutes les pistes, tous les nets,
sans sélection. Les angles se jugent avec la bibliothèque standard seule ; les
règles électriques demandent numpy et scipy, ceux des moteurs de simulation.

Les angles des pistes :
  aigu         deux branches à moins de 90° : le fond du V retient le bain de
               gravure (acid trap) ;
  angle_droit  un coude à 90° (vigilance : les fabricants le tiennent) ;
  jonction     trois branches ou plus sur un même point, ou un bout de piste
               posé au milieu d'une autre (T) ;
  hors_45      des segments hors des huit directions, une ligne par piste.
Un point posé dans une pastille ou un via n'est pas jugé : la piste y entre
et en repart, et le cuivre de la pastille recouvre l'angle.

Puis, sur l'empilage et à la cadence de chaque classe (voir « LES RÈGLES ÉLECTRIQUES ») :
l'empilage, l'impédance de chaque net, le chemin de retour de chaque via, les
fentes des plans de référence, les vias de couture, la diaphonie, le
découplage, le bord de carte, les paires différentielles et les bouts de piste
orphelins.

Entrée : le format de la visionneuse, dans les unités du fichier --
pistes {c, n, w, p: [x, y, x, y, ...]}, arcs {c, n, s, e, m, h (horaire)},
pastilles {x, y, r (rayon inscrit), c (absent : toutes les couches)}.
L'éditeur PCB envoie un segment comme une piste de deux points. c (couche)
et n (net) sont des clés opaques : un rang ou un nom. Les règles électriques
lisent en plus : stackup, vias (fiches de Current Return Path), plans
{c, n, o, t} (le cuivre des surfaces, trous compris), contour {o, t},
percages {x, y, d, n, de, a}, composants {ref, c, broches [{x, y, n, pin}]},
natures, bruyants, paires, reference_nets, reglages.

Deux portes d'entrée :
  analyser_document(doc)  le document « cao-analyse-carte-1 » que les deux
                          outils envoient à /api/analyse-carte ; chacun y met
                          SES pastilles déjà placées et SES couches de cuivre ;
  analyser_modele(m)      le modèle brut de la visionneuse, pour la ligne de
                          commande :
    python python/analyse_carte.py carte.xml     # constats d'un IPC-2581
"""

import math
import re
import time
from collections import defaultdict

import numpy as np

TOL_DEG = 1.0     # un 90° dessiné sur des coordonnées arrondies au µm s'en écarte de quelques dixièmes
EPS_MM = 1e-3     # deux bouts à moins d'un micron sont le même point
CASE_MM = 2.0     # maille de la grille de voisinage

SEVERITE = {"aigu": "critique", "angle_droit": "vigilance",
            "jonction": "vigilance", "hors_45": "info"}
_ORDRE = ("critique", "vigilance", "info")


def _constat(regle, x, y, c, n, msg, deg=None):
    return {"regle": regle, "severite": SEVERITE[regle], "x": x, "y": y,
            "c": c, "n": n, "deg": deg, "msg": msg}


def _cases(case, x1, y1, x2, y2, marge):
    for i in range(math.floor((min(x1, x2) - marge) / case),
                   math.floor((max(x1, x2) + marge) / case) + 1):
        for j in range(math.floor((min(y1, y2) - marge) / case),
                       math.floor((max(y1, y2) + marge) / case) + 1):
            yield i, j


def _accrocher(noeuds, c, n, x, y, eps):
    """Le nœud du net n, couche c, posé à moins d'eps de (x, y), créé au
    besoin : [x, y, [attaches], clé]. L'arrondi seul couperait en deux un
    point à cheval sur une limite : on cherche d'abord dans les cases
    voisines."""
    ix, iy = round(x / eps), round(y / eps)
    for cle in ((c, n, ix + a, iy + b) for a in (0, -1, 1) for b in (0, -1, 1)):
        nd = noeuds.get(cle)
        if nd and math.hypot(nd[0] - x, nd[1] - y) <= eps:
            return nd
    nd = noeuds[(c, n, ix, iy)] = [x, y, [], (c, n, ix, iy)]
    return nd


def angles(pistes, arcs=(), pastilles=(), unite_mm=1.0, tol_deg=TOL_DEG):
    """Constats d'angles et de jonctions, du plus grave au moins grave."""
    eps = EPS_MM / unite_mm
    case = CASE_MM / unite_mm
    tol = math.radians(tol_deg)
    noeuds = {}                      # (c, n, ix, iy) -> [x, y, [(direction, longueur, demi-largeur)], clé]
    grille = defaultdict(list)       # (c, n, i, j) -> segments qui la touchent
    constats = []

    def branche(c, n, x, y, dx, dy, L, hw):
        _accrocher(noeuds, c, n, x, y, eps)[2].append((math.atan2(dy, dx), L, hw))

    for p in pistes:
        c, n, pts = p.get("c"), p.get("n"), p.get("p") or []
        hw = (p.get("w") or 0) / 2
        hors, premier = 0, None
        for k in range(0, len(pts) - 3, 2):
            x1, y1, x2, y2 = pts[k:k + 4]
            dx, dy = x2 - x1, y2 - y1
            L = math.hypot(dx, dy)
            if L < eps:
                continue
            branche(c, n, x1, y1, dx, dy, L, hw)
            branche(c, n, x2, y2, -dx, -dy, L, hw)
            seg = (x1, y1, x2, y2, hw)
            for i, j in _cases(case, x1, y1, x2, y2, hw):
                grille[(c, n, i, j)].append(seg)
            a = math.atan2(dy, dx) % (math.pi / 4)
            if min(a, math.pi / 4 - a) > tol:
                hors += 1
                premier = premier or ((x1 + x2) / 2, (y1 + y2) / 2)
        if hors:
            constats.append(_constat(
                "hors_45", premier[0], premier[1], c, n,
                "%d segment%s hors des huit directions" % (hors, "s" if hors > 1 else "")))

    # Un arc part de ses bouts selon sa tangente : un congé bien posé
    # prolonge la piste (180°), un arc qui arrive de biais fait un vrai coude.
    for a in arcs:
        (sx, sy), (ex, ey), (mx, my) = a["s"], a["e"], a["m"]
        corde, hw = math.hypot(ex - sx, ey - sy), (a.get("w") or 0) / 2
        if corde < eps:
            continue                                   # cercle entier : pas de bout
        sens = -1 if a.get("h") else 1                 # tangente = rayon tourné d'un quart de tour
        branche(a.get("c"), a.get("n"), sx, sy, -sens * (sy - my), sens * (sx - mx), corde, hw)
        branche(a.get("c"), a.get("n"), ex, ey, sens * (ey - my), -sens * (ex - mx), corde, hw)

    couvert = defaultdict(list)
    for t in pastilles:
        r = max(t.get("r") or 0, eps)
        for i, j in _cases(case, t["x"], t["y"], t["x"], t["y"], r):
            couvert[(i, j)].append((t["x"], t["y"], r, t.get("c")))

    for (c, n, _, _), (x, y, dirs, _) in noeuds.items():
        i, j = math.floor(x / case), math.floor(y / case)
        if any(math.hypot(x - tx, y - ty) <= r and tc in (None, c)
               for tx, ty, r, tc in couvert[(i, j)]):
            continue
        # Un bout posé au milieu d'une autre piste : le T. Les deux moitiés
        # de la piste touchée deviennent deux branches du point.
        for x1, y1, x2, y2, hw in grille[(c, n, i, j)]:
            dx, dy = x2 - x1, y2 - y1
            L = math.hypot(dx, dy)
            s = ((x - x1) * dx + (y - y1) * dy) / L
            marge = max(hw, eps)
            if marge < s < L - marge and abs((x - x1) * dy - (y - y1) * dx) / L <= marge:
                dirs = dirs + [(math.atan2(dy, dx), L - s, hw), (math.atan2(-dy, -dx), s, hw)]
        # Deux branches dans la même direction se recouvrent (piste doublée) :
        # c'est du cuivre en double, pas un angle. On garde la plus longue.
        uniques = []
        for b in sorted((d % (2 * math.pi), L, hw) for d, L, hw in dirs):
            if uniques and b[0] - uniques[-1][0] <= tol:
                uniques[-1] = max(uniques[-1], b, key=lambda u: u[1])
            else:
                uniques.append(b)
        if len(uniques) > 1 and uniques[0][0] + 2 * math.pi - uniques[-1][0] <= tol:
            dernier = uniques.pop()
            uniques[0] = max(uniques[0], dernier, key=lambda u: u[1])
        # Le coin intérieur d'un V ne s'ouvre qu'au-delà de (w/2)/tan(θ/2) le
        # long de chaque branche : plus court, il est noyé dans le cuivre (un
        # micro-zigzag d'export de quelques µm dans une piste de 0,2 mm).
        # ponytail: longueur du SEGMENT, pas de la branche entière ; une jambe
        # coupée en segments colinéaires plus courts que ce seuil passerait.
        ouverts = []
        for k in range(len(uniques)):
            a, b = uniques[k], uniques[(k + 1) % len(uniques)]
            ecart = (b[0] - a[0]) % (2 * math.pi)
            if 0 < ecart < math.pi and min(a[1], b[1]) > max(a[2], b[2]) / math.tan(ecart / 2):
                ouverts.append(math.degrees(ecart))
        if sum(L > hw for _, L, hw in uniques) >= 3:
            nb = len(uniques)
            constats.append(_constat(
                "jonction", x, y, c, n,
                "Jonction en T" if nb == 3 else "Jonction à %d branches" % nb))
        plus_petit = min(ouverts, default=180)
        if plus_petit < 90 - tol_deg:
            constats.append(_constat(
                "aigu", x, y, c, n,
                "Angle aigu de %.0f° : le fond du V retient le bain de gravure" % plus_petit,
                round(plus_petit, 1)))
        elif len(uniques) == 2 and plus_petit <= 90 + tol_deg:
            constats.append(_constat("angle_droit", x, y, c, n, "Angle droit", 90.0))

    constats.sort(key=lambda k: _ORDRE.index(k["severite"]))
    return constats


# ==========================================================================
# LES RÈGLES ÉLECTRIQUES : une cadence et un front par classe
# --------------------------------------------------------------------------
# Un net n'a pas le front qu'on veut : il a celui de la techno qui le pilote
# (sa CLASSE : un GPIO de microcontrôleur monte en quelques ns même à
# 100 kHz), borné par la période de sa CADENCE MAXIMALE (à 100 MHz, pas plus
# de 10 % de 10 ns). Le front effectif est donc min(t_r, 0,1 / cadence), et ce
# qu'il excite va jusqu'au genou 0,35 / t_r. C'est à ce genou que les règles
# jugent : une colonne par constat.
#
# La carte avait trois fréquences communes à toutes les classes. Elles ne
# changeaient presque rien -- le front de la classe tranchait déjà, sauf à
# la plus haute -- et la cadence d'un net est une propriété de sa classe,
# pas de la carte : un I2C ne monte pas à 100 MHz, une horloge si.
# ==========================================================================

# Le front de chaque classe, en secondes. Des défauts, modifiables dans le
# panneau ; « Découpage » est celui d'un nœud SW de hacheur (nets_bruyants).
TR_CLASSES = {"Horloge": 2e-9, "Rapide": 1e-9, "RF": 1e-10,
              "Analogique": 1e-7, "Lent": 1e-8, "Découpage": 5e-9}
# La cadence maximale de chaque classe, en Hz : une horloge à 50 MHz, un bus
# rapide à 100 MHz, un I2C ou un SPI sous 10 MHz, un hacheur à 2 MHz. Toutes
# restent sous 0,1 / t_r du front par défaut : à défauts égaux, c'est le
# front de la classe qui juge, la cadence ne l'écrase pas.
CADENCES = {"Horloge": 5e7, "Rapide": 1e8, "RF": 1e9,
            "Analogique": 1e6, "Lent": 1e7, "Découpage": 2e6}
Z0 = 50.0                # impédance de ligne supposée pour juger une réflexion
# LA DIAPHONIE, NIVEAU 2 : un front GLOBAL pour toute la carte (1 ns, la
# majorité des fronts rapides du numérique moderne) et les seuils DRC vert /
# orange / rouge, en fraction de l'agresseur. Les mêmes que l'analyse d'une
# piste sélectionnée (crosstalk.TR_DEFAUT, SEUIL_ORANGE, SEUIL_ROUGE).
XT_TR = 1e-9
XT_ORANGE, XT_ROUGE = 0.03, 0.07
PAIRES_MAX = 3000        # paires rendues au tableau « toute la carte »
# Réflexion d'un via : |Γ| au-delà duquel on alerte, puis on condamne.
GAMMA_VIGILANCE, GAMMA_CRITIQUE = 0.05, 0.10
C0 = 299792458.0
SECTIONS_MAX = 3000      # résolutions MoM de la diaphonie, cache compris
ANGLE_PARALLELE = math.radians(10)


def tr_effectif(tr_classe, cadence):
    """Le front d'un net : celui de sa techno, borné par 10 % de la période
    de sa cadence."""
    return min(tr_classe, 0.1 / cadence)


def _pire(verdicts):
    return next((s for s in ("critique", "vigilance") if s in verdicts), "ok")


def _reglages(doc):
    r = doc.get("reglages") or {}
    tr = dict(TR_CLASSES)
    for k, v in (r.get("tr") or {}).items():
        if float(v) > 0:
            tr[str(k)] = float(v)
    cadences = dict(CADENCES)
    for k, v in (r.get("cadences") or {}).items():  # 0 ou vide : le défaut
        if v and float(v) > 0:
            cadences[str(k)] = float(v)
    # UNE PORTEUSE RF : les nets RF se jugent à leur porteuse, pas au genou
    # d'un front. Elle devient le front RF (0,35 / f), sans borne de période.
    porteuse = float(r.get("porteuse_rf") or 0)
    if porteuse > 0:
        tr["RF"] = 0.35 / porteuse
    out = {"tr": tr, "cadences": cadences,
           "porteuse_rf": porteuse if porteuse > 0 else None,
           "z0": float(r.get("z0") or Z0),
           "xt_tr": float(r.get("xt_tr") or XT_TR),
           "xt_orange": float(r.get("xt_orange") or XT_ORANGE),
           "xt_rouge": float(r.get("xt_rouge") or XT_ROUGE),
           "zdiff": float(r.get("zdiff") or ZDIFF)}
    if not out["xt_tr"] > 0:
        raise ErreurAnalyse("Le front global de la diaphonie doit être positif.")
    if not 0 < out["xt_orange"] <= out["xt_rouge"] < 1:
        raise ErreurAnalyse("Seuils de diaphonie incohérents : il faut"
                            " 0 < orange ≤ rouge < 100 %.")
    # PAR CLASSE ET PAR NET, ce qui passe devant les réglages de carte. Une
    # carte LoRa + NFC porte deux radios : 868 MHz sur l'une, 13,56 MHz sur
    # l'autre, et juger le NFC à 868 MHz le condamne à tort. De même une
    # vidéo à 75 Ω et une RF à 50 Ω sur la même carte. Clés absentes du
    # rapport quand rien n'est donné : le rapport d'avant, à l'identique.
    for cle in ("z0_classes", "porteuses"):
        d = {str(k): float(v) for k, v in (r.get(cle) or {}).items() if v and float(v) > 0}
        if d:
            out[cle] = d
    return out


def _z0(reg, classe):
    """L'impédance visée pour un net de cette classe : la sienne si le panneau
    la donne, Z₀ de la carte sinon."""
    return (reg.get("z0_classes") or {}).get(classe, reg["z0"])


def _tient_z(reg, classe):
    """La classe tient-elle une impédance ? Horloge, Rapide, RF d'office, et
    toute classe à laquelle le panneau donne une cible."""
    return classe in CLASSES_Z or classe in (reg.get("z0_classes") or {})


def _classe(doc, net):
    """La classe d'un net : un nœud de découpage d'abord, une masse de
    référence ensuite, sinon ce que la page a classé, Lent à défaut."""
    if net in set(doc.get("bruyants") or ()):
        return "Découpage"
    if net in set(doc.get("reference_nets") or ()):
        return "Masse"
    return str((doc.get("natures") or {}).get(net) or "Lent")


def _porteuse(reg, classe, net):
    """La porteuse d'un net : la sienne (`porteuses`), celle des nets RF
    sinon, aucune pour les autres classes."""
    return ((reg.get("porteuses") or {}).get(net)
            or (reg.get("porteuse_rf") if classe == "RF" else None))


def _par_frequence(reg, classe, juge, net=None):
    """[{f, tr, f_eval, valeur, verdict, ...}] pour un net de `classe` (une
    classe sans front, masse ou alimentation, se juge comme Lent) :
    `juge(f_eval, tr)` rend (valeur, verdict) ou (valeur, verdict, {champs}).
    `net` : sa porteuse propre, s'il en a une, passe devant celle de sa classe.
    UNE SEULE COLONNE, à la cadence de la classe (ou à la porteuse) ; la liste
    reste une liste, que chaque règle et le rapport parcourent déjà."""
    c = classe if classe in reg["tr"] else "Lent"
    porteuse = _porteuse(reg, c, net)
    f = porteuse or reg["cadences"].get(c) or reg["cadences"]["Lent"]
    tr = 0.35 / porteuse if porteuse else tr_effectif(reg["tr"][c], f)
    res = juge(0.35 / tr, tr)
    col = {"f": f, "tr": tr, "f_eval": 0.35 / tr,
           "valeur": round(res[0], 5), "verdict": res[1]}
    if porteuse:
        col["porteuse"] = porteuse
    return [dict(col, **(res[2] if len(res) > 2 else {}))]


def _plus_vite(reg, doc, nets):
    """(net, classe) au front le plus raide -- sa porteuse s'il en a une ;
    (None, "Lent") sans net."""
    def tr(n):
        c = _classe(doc, n)
        p = _porteuse(reg, c, n)
        return 0.35 / p if p else reg["tr"].get(c, reg["tr"]["Lent"])
    n = min(nets, key=tr, default=None)
    return n, (_classe(doc, n) if n is not None else "Lent")


def _er_entre(couches, a, b):
    """La permittivité moyenne des diélectriques entre deux couches, 4,3 à défaut."""
    lo, hi = sorted((a, b))
    ers = [float(c.get("epsilon_r") or 0) for c in couches[lo:hi + 1]
           if c.get("type") == "dielectric" and float(c.get("epsilon_r") or 0) > 0]
    return sum(ers) / len(ers) if ers else 4.3


def _moteurs(notes):
    """simulation_em et crosstalk, ou (None, None) : ils demandent numpy et scipy."""
    try:
        import simulation_em
        import crosstalk
        return simulation_em, crosstalk
    except Exception as exc:                            # noqa: BLE001
        notes.append("Chemins de retour et diaphonie non vérifiés : le moteur de"
                     " simulation ne se charge pas (%s). pip install numpy scipy." % exc)
        return None, None


def retours(doc, couches, reg, unite, notes, se):
    """Chaque via de signal qui change de couche : son courant de retour
    trouve-t-il un chemin court, et que coûte-t-il à la cadence de son net ?

    LE MÊME MOTEUR QUE L'ONGLET CURRENT RETURN PATH (simulation_em) : plans de
    référence de part et d'autre, net de ces plans AU DROIT du via (mesuré par
    la page), vias de masse retenus et leur inductance de boucle, traversée de
    cavité par les condensateurs de pontage quand les deux plans sont de nets
    différents. Ce qu'on ajoute : le verdict à la cadence du net, par la
    réflexion |Γ| = |Z| / |Z + 2 Z0| que cette impédance série cause sur la
    ligne.
    """
    tl = se.tl
    z_bornes = se._z_empilage(couches)
    refs = set(str(x) for x in (doc.get("reference_nets") or ()) if str(x).strip())

    def nom(i):
        return str(couches[i].get("name") or i) if 0 <= i < len(couches) else "?"

    out, bilan = [], {"vias": 0, "plan_change": 0}
    for v in doc.get("vias") or ():
        a, b = int(v.get("layer_from", -1)), int(v.get("layer_to", -1))
        if a < 0 or b < 0 or a == b or max(a, b) >= len(couches):
            continue
        if _classe(doc, str(v.get("net") or "")) == ANTENNE:
            continue
        bilan["vias"] += 1
        trans = {"troncon": -1, "couche_depart": a, "couche_arrivee": b,
                 "hauteur_empilage": se._hauteur_via(couches, a, b)}
        h_via, d_percage, _ = se._cotes_via({"via": v}, trans)
        refs_a, refs_b = se._plans_de_couche(couches, a), se._plans_de_couche(couches, b)
        l_via, source = se._inductance_transition(
            trans, v, couches, [], z_bornes, refs, h_via, d_percage,
            refs_av=refs_a, refs_ap=refs_b)
        r = trans.get("retour") or {}
        if not r.get("plan_change"):
            continue                    # même plan des deux côtés : le retour suit
        bilan["plan_change"] += 1
        net = str(v.get("net") or "")
        z0 = _z0(reg, _classe(doc, net))
        x, y = float(v["x"]) / unite, float(v["y"]) / unite
        plans = "%s → %s" % ("/".join(r.get("nets_depart") or r.get("plans_depart") or ["?"]),
                             "/".join(r.get("nets_arrivee") or r.get("plans_arrivee") or ["?"]))
        base = {"regle": "retour", "x": x, "y": y, "c": "%s → %s" % (nom(a), nom(b)), "n": net}

        if r.get("plans_sans_cuivre"):
            out.append(dict(base, severite="critique", frequences=[],
                            msg="Référence %s : pas de cuivre de plan au droit du via sur %s"
                                % (plans, ", ".join(r["plans_sans_cuivre"]))))
            continue
        if r.get("nets_differents") is None:
            out.append(dict(base, severite="vigilance", frequences=[],
                            msg="Le plan de référence change (%s), mais le net des plans"
                                " n'est pas connu : un via de masse suffit-il ?" % plans))
            continue

        param, chemin, dist = None, "", None
        if r["nets_differents"]:
            # La cavité lit ses deux plans dans les tronçons qui encadrent le
            # via ; hors parcours, on les lui pose depuis l'empilage.
            encadre = [dict(zip(("plan_haut", "plan_bas"), sorted(refs_a))),
                       dict(zip(("plan_haut", "plan_bas"), sorted(refs_b)))]
            cav = se._cavite_de_retour(dict(trans, troncon=1), v, couches,
                                       encadre, d_percage) or {}
            param = se._param_cavite(cav)
            # `borne` : le pont est SUPPOSÉ au rayon, rien n'y a été trouvé ;
            # le nommer « traversée par un découplage » inventait un composant.
            if cav.get("pont") and not cav.get("borne"):
                dist = float(cav["pont"].get("distance_mm") or 0)
                chemin = "traversée par %s à %.2f mm" % (
                    cav["pont"].get("repere") or "un découplage", dist)
            elif cav.get("cherche"):
                # rien dans le rayon : le pont est AU MOINS aussi loin
                dist = float(cav.get("rayon_mm") or 0) or None
                chemin = "aucun découplage à moins de %s mm" % cav.get("rayon_mm", "?")
                if cav.get("aucun_pont_carte"):
                    # Rien nulle part : au front rapide le retour s'étale dans
                    # toute la paire de plans, la boucle se prend à son rayon.
                    # ponytail: rayon de l'aire envoyée (celle de la carte,
                    # majorée) ; les modes de la cavité si le chiffre doit tenir.
                    dist = max(dist or 0, math.sqrt(
                        float(cav.get("aire_plans_mm2") or 0) / math.pi)) or None
                    chemin = "aucun découplage entre ces plans sur toute la carte"
            if param is None:
                out.append(dict(base, severite="critique", frequences=[],
                                msg="Référence %s : le retour doit traverser entre plans"
                                    " et rien ne permet de le chiffrer (%s)"
                                    % (plans, chemin or "ni pont ni aire de plans")))
                continue
        elif source != "boucle":
            # Aucun via de masse dans le rayon cherché : la boucle se referme
            # au plus proche, plus loin. Même formule que le moteur, avec ce
            # via-là. Sans aucun via de masse, rien ne se chiffre.
            d = v.get("retour_hors_rayon_mm")
            if d is None:
                out.append(dict(base, severite="critique", frequences=[],
                                msg="Référence %s : aucun via de masse ne referme la boucle"
                                    % plans))
                continue
            dist = float(d)
            lo, hi = sorted((a, b))
            z1, z2 = z_bornes[lo] * 1e-3, z_bornes[hi + 1] * 1e-3
            rayon = d_percage * 1e-3 / 2.0
            l_via, _ = tl.inductance_boucle_vias(
                {"x": 0.0, "y": 0.0, "z1": z1, "z2": z2, "rayon": rayon},
                [{"x": dist * 1e-3, "y": 0.0, "z1": z1, "z2": z2, "rayon": rayon}])
            chemin = "via de masse le plus proche à %.2f mm, hors du rayon cherché" % dist
        else:
            proches = [f.get("distance_mm") for f in r.get("vias") or ()
                       if f.get("retenu") and f.get("distance_mm") is not None]
            dist = min(proches) if proches else None
            chemin = ("%d via(s) de masse, le plus proche à %.2f mm" % (len(proches), dist)
                      if proches else "vias de masse retenus")

        # DEUX QUESTIONS, LE PIRE DES DEUX VERDICTS. La réflexion |Γ| dit ce
        # que la ligne voit ; elle reste faible sur une seule transition, même
        # mal refermée. La DISTANCE du retour dit la taille de la boucle, qui
        # excite la cavité entre plans et rayonne : on la compare à λ/20 au
        # genou du front, dans le diélectrique entre les plans (règle de
        # couture classique), λ/10 pour condamner.
        er = _er_entre(couches, a, b)

        def gamma(fs, L=l_via, P=param):
            """|Γ| à toutes les fréquences de `fs` d'un coup (numpy)."""
            fs = np.asarray(fs, float)
            zz = 2j * np.pi * fs * L + se.tl.impedance_traversee_vec(fs, P)
            return np.abs(zz) / np.abs(zz + 2 * z0)
        # LA CAVITÉ MODALE RÉSONNE SOUS LE GENOU, et un front contient toutes
        # les fréquences jusqu'à lui : P01x291 culmine à 142 MHz (335 Ω), qu'un
        # front de 1 ns excite alors que son genou, 350 MHz, passe à 1 %. On
        # prend donc le pire sur les deux décades sous le genou. Le modèle
        # localisé garde son point unique : son pont supposé y inventerait le pic.
        modal = bool(param and param.get("modal"))

        def juge(f_eval, tr, d=dist):
            fs = f_eval * 10 ** (-np.arange(25) / 12) if modal else np.array([f_eval])
            gs = gamma(fs)
            g, f_g = float(gs.max()), float(fs[int(gs.argmax())])
            verdicts = ["critique" if g > GAMMA_CRITIQUE else
                        "vigilance" if g > GAMMA_VIGILANCE else "ok"]
            extra = {"f_pire_hz": round(f_g)} if modal else {}
            if d:
                l20 = C0 / (f_eval * math.sqrt(er)) / 20 * 1e3
                extra["d_sur_lambda20"] = round(d / l20, 3)
                verdicts.append("critique" if d > 2 * l20 else
                                "vigilance" if d > l20 else "ok")
            return g, _pire(verdicts), extra
        freqs = _par_frequence(reg, _classe(doc, net), juge, net)
        sev = _pire([f["verdict"] for f in freqs])
        if sev == "ok":
            continue
        # LE FRONT LE PLUS RAIDE QUE CE RETOUR SUPPORTE : le plus exigeant des
        # deux critères. Distance : λ/20 = d au genou. Réflexion (réactance
        # pure seulement) : |Γ| = 10 % pour X = 0,201 Z0.
        limites = []
        if dist:
            limites.append(0.35 * 20 * dist * 1e-3 * math.sqrt(er) / C0)
        if param is None and l_via > 0:
            limites.append(0.35 * 2 * math.pi * l_via / (0.201 * z0))
        resonance = ""
        if modal:
            # la plus basse fréquence où la traversée réfléchit trop : un front
            # dont le genou la dépasse l'excite
            # de 100 kHz à 3 GHz, là où le modèle modal tient ses modes
            fs = 1e5 * 10 ** (np.arange(108) / 24)
            gs = gamma(fs)
            trop = fs[gs > GAMMA_CRITIQUE]
            if trop.size:
                limites.append(0.35 / trop[0])
            # le pic de la TRAVERSÉE seule, sans l'inductance du via qui
            # monte avec la fréquence et masquerait la résonance
            zt = np.abs(se.tl.impedance_traversee_vec(fs, param))
            i = int(zt.argmax())
            if 0 < i < len(zt) - 1 and gs[i] > GAMMA_VIGILANCE:
                resonance = " ; la traversée résonne à %s (%.0f Ω, |Γ| %.0f %%)" % (
                    _hz(fs[i]), zt[i], 100 * gs[i])
            # SUR UN ILOT, la resonance depend du chemin qui le relie a la cavite :
            # on donne la fourchette (du couplage parfait a aucun couplage)
            if (cav.get("grille") or {}).get("via_sur_ilot"):
                fo = se.traversee_fourchette(cav)
                if fo:
                    resonance += " ; sur un îlot du recouvrement, entre %s et %s selon son lien" % (
                        _hz(min(fo["f_bas"], fo["f_haut"])), _hz(max(fo["f_bas"], fo["f_haut"])))
        tient = (" ; tient des fronts jusqu'à %.2g ns" % (max(limites) * 1e9)
                 if limites else "")
        out.append(dict(base, severite=sev, frequences=freqs,
                        msg="Référence %s, %s, L = %.2f nH%s%s"
                            % (plans, chemin, l_via * 1e9, resonance, tient)))
    return out, bilan


def _longement(a, b):
    """(longueur en regard, écart bord à bord, milieu) de deux segments
    parallèles, `a` le plus long ; None s'ils ne se font pas face."""
    _, ax1, ay1, ax2, ay2, wa = a
    _, bx1, by1, bx2, by2, wb = b
    dx, dy = ax2 - ax1, ay2 - ay1
    L = math.hypot(dx, dy)
    ux, uy = dx / L, dy / L
    ex, ey = bx2 - bx1, by2 - by1
    lb = math.hypot(ex, ey)
    if abs(ux * ey - uy * ex) / lb > math.sin(ANGLE_PARALLELE):
        return None
    t1 = (bx1 - ax1) * ux + (by1 - ay1) * uy
    t2 = (bx2 - ax1) * ux + (by2 - ay1) * uy
    lo, hi = max(0.0, min(t1, t2)), min(L, max(t1, t2))
    if hi - lo <= 0:
        return None
    m = (lo + hi) / 2
    mx, my = ax1 + ux * m, ay1 + uy * m
    d = abs((mx - bx1) * ey - (my - by1) * ex) / lb
    return hi - lo, d - (wa + wb) / 2, (mx, my)


def _kb_larges_faces(h_v, h_a, x_lat, w_v, w_a):
    """Kb de deux pistes de couches voisines, sans plan entre elles, au-dessus
    du même plan de référence : méthode des images en milieu homogène (Kf
    nul, Kb = K_L / 2). Hauteurs et écart latéral d'axe à axe, en mm.
    Le repli de `_kb_deux_niveaux`, quand le budget de résolutions est
    épuisé : fil fin de rayon w/4, un seul plan, donc prudent."""
    lv = math.log(2 * h_v / (w_v / 4))
    la = math.log(2 * h_a / (w_a / 4))
    lm = 0.5 * math.log((x_lat ** 2 + (h_v + h_a) ** 2)
                        / max(x_lat ** 2 + (h_v - h_a) ** 2, 1e-12))
    if not (lv > 0 and la > 0):
        return 0.0
    return max(0.0, min(1.0, lm / math.sqrt(lv * la))) / 2


def diaphonie(doc, couches, reg, unite, notes, se, xt, troncons=None):
    """Chaque couple de pistes voisines de nets différents : combien la
    victime reçoit de l'agresseur, à la cadence de l'agresseur.

    SUR LA MÊME COUCHE, LA SECTION EST RÉSOLUE, PAS ESTIMÉE : Kb et Kf sortent
    des matrices [L] et [C] de la section à deux conducteurs, par la méthode
    des moments (ligne_mom, via `section_de_couche` et
    `crosstalk.coefficients_couple`), à l'écart réel de chaque longement --
    arcs compris, en cordes de 5°. Le niveau est celui du NIVEAU 2 -- un
    échelon unitaire, des lignes adaptées, `crosstalk.niveau2` :
        k_total = ½ (Cm/C11 + Lm/L11) ;
        NEXT = Kb si 2 T_d ≥ t_r, Σ Kb·2Td / t_r sinon ;
        FEXT = |Σ Kf·Td| / t_r.
    t_r est le front GLOBAL de la carte (1 ns par défaut, réglable), et
    chaque niveau se juge aux seuils vert / orange / rouge (3 % et 7 %).

    ENTRE DEUX COUCHES VOISINES sans plan entre elles (larges faces), deux
    pistes qui se superposent se couplent par leur largeur : Kb RÉSOLU aussi,
    rubans à leurs deux hauteurs entre les plans qui encadrent la paire
    (`ligne_mom.section_deux_niveaux`, milieu homogène : Kf nul), même modèle
    de niveau. Au-delà du budget, la méthode des images (`_kb_larges_faces`).

    LA SOMME DES AGRESSEURS : plusieurs voisins d'une même victime peuvent
    basculer ensemble. Leurs niveaux s'ajoutent au pire (en phase) ; une ligne
    de plus quand la somme franchit un seuil qu'aucun ne franchit seul.

    Hors jeu : la masse et les antennes (ni victimes ni agresseurs), les
    alimentations (sauf un nœud de découpage, qui agresse), et les deux
    moitiés d'une paire différentielle entre elles, couplées exprès.
    """
    tl = se.tl
    rang = {c.get("name"): i for i, c in enumerate(couches) if c.get("type") == "copper"}
    if troncons is None:
        troncons = _troncons(doc, unite)
    par = defaultdict(list)
    for n, c, x1, y1, x2, y2, w in troncons:
        if rang.get(c) is not None and w > 0:
            par[rang[c]].append((str(n or ""), x1, y1, x2, y2, w))
    paires = set(frozenset(map(str, pr)) for pr in (doc.get("paires") or ()) if len(pr) == 2)

    def joue(n, agresse):
        c = _classe(doc, n)
        return (bool(n) and not _SANS_NET.match(n) and c not in ("Masse", ANTENNE)
                and (c != "Alimentation" or agresse and c == "Découpage"))

    def face(a, b):
        la = math.hypot(a[3] - a[1], a[4] - a[2])
        lb = math.hypot(b[3] - b[1], b[4] - b[2])
        return _longement(a, b) if la >= lb else _longement(b, a)

    cache, couples, larges = {}, defaultdict(list), defaultdict(list)
    bilan = {"couples": 0, "sections": 0, "couples_larges_faces": 0}
    sans_plan = []

    def deux_niveaux(h_v, h_a, x_lat, w_v, w_a, b_mm):
        """Kb de la victime, rubans à leurs hauteurs (mm) ; None hors budget."""
        cle = ("2n", round(h_v, 4), round(h_a, 4), round(x_lat, 2),
               round(w_v, 3), round(w_a, 3), b_mm and round(b_mm, 4))
        if cle not in cache:
            if len(cache) >= SECTIONS_MAX:
                return None
            cache[cle] = None
            try:
                # milieu homogène : Kf est nul, seul Kb compte
                cache[cle] = xt.kb_superposees(h_v, h_a, x_lat, w_v, w_a, b_mm)
            except Exception:                           # noqa: BLE001
                pass
        return cache[cle]

    for i, segs in par.items():
        h = se._hauteur_de_couche(couches, i, segs[0][5],
                                  float(couches[i].get("thickness") or 0.035))
        if not h > 0:
            sans_plan.append(str(couches[i].get("name")))
            continue
        smax = 5 * h
        case = max(1.0, 2 * smax)
        grille = defaultdict(list)
        for k, sg in enumerate(segs):
            for cle in _cases(case, sg[1], sg[2], sg[3], sg[4], smax + sg[5]):
                grille[cle].append(k)
        vus = set()
        for cellule in grille.values():
            for u in range(len(cellule)):
                for w_ in range(u + 1, len(cellule)):
                    ka, kb_ = sorted((cellule[u], cellule[w_]))
                    if (ka, kb_) in vus:
                        continue
                    vus.add((ka, kb_))
                    a, b = segs[ka], segs[kb_]
                    if a[0] == b[0] or frozenset((a[0], b[0])) in paires:
                        continue
                    lg = face(a, b)
                    if not lg or lg[0] < 0.05 or not (0 < lg[1] <= smax):
                        continue
                    for v_, g_ in ((a, b), (b, a)):
                        if joue(v_[0], False) and joue(g_[0], True):
                            couples[(v_[0], g_[0], i)].append(
                                (lg[0], lg[1], v_[5], g_[5], lg[2]))

    # LARGES FACES : deux couches de cuivre consécutives, ni l'une ni l'autre
    # plan, jugées au-dessus du plan de référence le plus proche des deux.
    cu = sorted(rang.values())
    for i, j in zip(cu, cu[1:]):
        if (couches[i].get("role") == "plane" or couches[j].get("role") == "plane"
                or not par.get(i) or not par.get(j)):
            continue
        refs = set(_plans_voisins(couches, i)) | set(_plans_voisins(couches, j))
        if not refs:
            continue
        # LES PLANS QUI ENCADRENT LA PAIRE : celui du dessous sert d'origine
        # des hauteurs, celui du dessus (s'il existe) ferme le domaine.
        dessous = [q for q in refs if q > j]
        p = min(dessous) if dessous else max(refs)
        dessus = [q for q in refs if q < i] if dessous else []
        b_mm = _ep(couches, max(dessus), p) if dessus else None
        # hauteur de l'axe de chaque piste au-dessus du plan p, en mm
        h_i = _ep(couches, i, p) + float(couches[i].get("thickness") or 0.035) / 2
        h_j = _ep(couches, j, p) + float(couches[j].get("thickness") or 0.035) / 2
        smax = 3 * max(h_i, h_j)
        v = C0 / math.sqrt(_er_entre(couches, min(i, j, p), max(i, j, p)))
        grille = defaultdict(list)
        for k, sg in enumerate(par[j]):
            for cle in _cases(CASE_MM, sg[1], sg[2], sg[3], sg[4], smax + sg[5]):
                grille[cle].append(k)
        nom = "%s ↔ %s" % (couches[i].get("name"), couches[j].get("name"))
        for a in par[i]:
            cand = set()
            for cle in _cases(CASE_MM, a[1], a[2], a[3], a[4], smax + a[5]):
                cand.update(grille.get(cle, ()))
            for k in cand:
                b = par[j][k]
                if a[0] == b[0] or frozenset((a[0], b[0])) in paires:
                    continue
                lg = face(a, b)
                if not lg or lg[0] < 0.05:
                    continue
                x_lat = max(lg[1] + (a[5] + b[5]) / 2, 0.0)       # d'axe à axe
                if x_lat > smax:
                    continue
                for v_, g_, hv, ha in ((a, b, h_i, h_j), (b, a, h_j, h_i)):
                    if joue(v_[0], False) and joue(g_[0], True):
                        kb = deux_niveaux(hv, ha, x_lat, v_[5], g_[5], b_mm)
                        quoi = "MoM, %s" % ("deux plans" if b_mm else "un plan")
                        if kb is None:
                            kb, quoi = _kb_larges_faces(hv, ha, x_lat, v_[5], g_[5]), "images, un plan"
                        larges[(v_[0], g_[0], nom)].append(
                            (lg[0], x_lat, kb, 0.0, lg[0] * 1e-3 / v, lg[2], quoi))
    if sans_plan:
        notes.append("Diaphonie non calculée sur %s : pas de plan de référence dans"
                     " l'empilage." % ", ".join(sorted(set(sans_plan))))

    def section(i, w_v, w_a, s):
        cle = (i, round(w_v, 3), round(w_a, 3), round(s, 2))
        if cle not in cache:
            if len(cache) >= SECTIONS_MAX:
                return None
            cache[cle] = None
            geo, _ = se.section_de_couche(couches, i, w_v,
                                          float(couches[i].get("thickness") or 0.035),
                                          0.0, 0.0)
            if geo is not None:
                geo = dict(geo)
                geo["conducteurs"] = [
                    {"w": w_v * 1e-3, "x": 0.0, "masse": False},
                    {"w": w_a * 1e-3, "x": -((w_v + w_a) / 2 + s) * 1e-3, "masse": False}]
                try:
                    r = tl.solve_multiline(geo)
                    rg = {e: m for m, e in enumerate(r["ordre"])}
                    kb, kf = xt.coefficients_couple(r["c"], r["l"], rg[0], rg[1])
                    v = C0 / math.sqrt(max(float(r["lignes"][rg[0]]["eps_eff"]), 1.0))
                    cache[cle] = (kb, kf, v)
                except Exception:                       # noqa: BLE001
                    pass
        return cache[cle]

    # LE NIVEAU 2 : un échelon unitaire sous le front GLOBAL de la carte, des
    # lignes adaptées. Les formules sont celles de `crosstalk.niveau2`, que
    # l'analyse d'une piste sélectionnée emploie aussi : deux outils qui
    # jugent le même longement rendent le même chiffre.
    t_r, orange, rouge = reg["xt_tr"], reg["xt_orange"], reg["xt_rouge"]
    sev_de = {"rouge": "critique", "orange": "vigilance", "vert": "ok"}
    perdus = 0

    def colonne(n2):
        """La colonne unique du constat : le front global, et le pire des deux."""
        return [{"f": 0.35 / t_r, "tr": t_r, "f_eval": 0.35 / t_r,
                 "valeur": round(max(n2["next"], n2["fext"]), 5),
                 "verdict": sev_de[n2["statut"]],
                 "next": n2["next"], "fext": n2["fext"],
                 "statut_next": n2["statut_next"],
                 "statut_fext": n2["statut_fext"]}]

    # (victime, agresseur, couche) -> ([(L, écart, Kb, Kf, Td, point)], larges faces ?)
    tous = {}
    for (nv, na, i), morceaux in couples.items():
        vals = []
        for L, s, w_v, w_a, pt in morceaux:
            sec = section(i, w_v, w_a, s)
            if sec is None:
                perdus += 1
                continue
            vals.append((L, s, sec[0], sec[1], L * 1e-3 / sec[2], pt))
        if vals:
            tous[(nv, na, str(couches[i].get("name")))] = (vals, False)
    for cle, vals in larges.items():
        tous[cle] = (vals, True)

    # UN COUPLE, UNE LIGNE : A ← B et B ← A sont le même longement. On garde
    # le sens le plus grave et l'on dit que l'autre est signalé aussi.
    garde, par_victime, paires_vues = {}, defaultdict(list), {}
    rang_sev = {"critique": 2, "vigilance": 1, "ok": 0}
    for (nv, na, c), (vals, large) in tous.items():
        bilan["couples_larges_faces" if large else "couples"] += 1
        n2 = xt.niveau2([(x[2], x[3], x[4]) for x in vals], t_r, orange, rouge)
        freqs = colonne(n2)
        long_ = max(vals, key=lambda x: x[0])
        par_victime[nv].append((na, n2, long_[5], c))
        sev = sev_de[n2["statut"]]
        # LE TUPLE DE DIAGNOSTIC DE LA PAIRE, vert compris : c'est le tableau
        # « toute la carte » du panneau Crosstalk.
        paire = {"victime": nv, "agresseur": na, "couche": c,
                 "superposee": large,
                 "longueur": round(sum(x[0] for x in vals), 3),
                 "ecart": round(min(x[1] for x in vals), 4),
                 "x": long_[5][0] / unite, "y": long_[5][1] / unite,
                 "k_total": n2["k_total"], "next": n2["next"],
                 "next_db": n2["next_db"], "fext": n2["fext"],
                 "fext_db": n2["fext_db"], "sature": n2["sature"],
                 "td_ps": n2["td_ps"], "statut_next": n2["statut_next"],
                 "statut_fext": n2["statut_fext"], "statut": n2["statut"]}
        cle_p = (frozenset((nv, na)), c)
        avant = paires_vues.get(cle_p)
        if avant is None or max(paire["next"], paire["fext"]) > \
                max(avant["next"], avant["fext"]):
            paires_vues[cle_p] = paire
        if sev == "ok":
            continue
        chiffres = ("k_total %.1f %%, NEXT %.2f %% (%s), FEXT %.2f %% (%s)"
                    % (100 * n2["k_total"], 100 * n2["next"], n2["statut_next"],
                       100 * n2["fext"], n2["statut_fext"]))
        if large:
            msg = ("Depuis %s, couche voisine : %.1f mm superposés, décalage mini %.3f mm"
                   " d'axe à axe, %s (%s)"
                   % (na, sum(x[0] for x in vals), min(x[1] for x in vals), chiffres,
                      " ; ".join(sorted({x[6] for x in vals}))))
        else:
            msg = ("Depuis %s : %.1f mm en regard, écart mini %.3f mm, %s"
                   % (na, sum(x[0] for x in vals), min(x[1] for x in vals), chiffres))
        k = {"regle": "diaphonie", "severite": sev, "frequences": freqs,
             "x": long_[5][0] / unite, "y": long_[5][1] / unite, "c": c, "n": nv, "msg": msg}
        cle = (frozenset((nv, na)), c)
        autre = garde.get(cle)
        if autre is not None:
            poids = lambda q: (rang_sev[q["severite"]], max(f["valeur"] for f in q["frequences"]))
            pire, mieux = (k, autre) if poids(k) > poids(autre) else (autre, k)
            pire["msg"] += " ; et réciproquement (%s ← %s, %s)" % (
                mieux["n"], pire["n"], mieux["severite"])
            k = pire
        garde[cle] = k
    out = list(garde.values())
    bilan["paires"] = sorted(paires_vues.values(),
                             key=lambda p: -max(p["next"], p["fext"]))[:PAIRES_MAX]
    bilan["paires_total"] = len(paires_vues)
    bilan["t_r"] = t_r
    bilan["seuils"] = {"orange": orange, "rouge": rouge}

    # LA SOMME, EN PHASE : ce qu'aucun agresseur ne fait seul. NEXT et FEXT
    # se somment chacun de leur côté, et se jugent aux mêmes seuils.
    for nv, lst in par_victime.items():
        if len(lst) < 2:
            continue
        s_next = sum(x[1]["next"] for x in lst)
        s_fext = sum(x[1]["fext"] for x in lst)
        s_n, s_f = xt.statut(s_next, orange, rouge), xt.statut(s_fext, orange, rouge)
        somme = {"next": round(s_next, 6), "fext": round(s_fext, 6),
                 "statut_next": s_n, "statut_fext": s_f,
                 "statut": xt.pire_statut([s_n, s_f])}
        seul = max(rang_sev[sev_de[x[1]["statut"]]] for x in lst)
        sev = sev_de[somme["statut"]]
        if rang_sev[sev] <= seul:
            continue
        top = sorted(lst, key=lambda x: -max(x[1]["next"], x[1]["fext"]))
        _, _, pt, c = top[0]
        out.append({"regle": "diaphonie", "severite": sev, "frequences": colonne(somme),
                    "x": pt[0] / unite, "y": pt[1] / unite, "c": c, "n": nv,
                    "msg": "Somme de %d agresseurs en phase (%s%s) : NEXT %.2f %%, FEXT"
                           " %.2f %% — aucun ne dépasse seul, ensemble ils franchissent"
                           " le seuil"
                           % (len(lst), ", ".join("%s %.1f %%" % (x[0], 100 * max(
                               x[1]["next"], x[1]["fext"])) for x in top[:4]),
                              "…" if len(top) > 4 else "", 100 * s_next, 100 * s_fext)})
    bilan["sections"] = sum(1 for c in cache.values() if c)
    if perdus:
        notes.append("%d longement(s) sans section résolue (plafond de %d résolutions"
                     " ou section impossible) : non comptés." % (perdus, SECTIONS_MAX))
    return out, bilan


# ==========================================================================
# CE QUE LES RÈGLES SUIVANTES PARTAGENT
# ==========================================================================

_SANS_NET = re.compile(r"^(|non[-_ ]?net|no[-_ ]?net|\(sans net\))$", re.IGNORECASE)
RAPIDES = ("Horloge", "Rapide", "RF", "Découpage")
# UNE ANTENNE EST FAITE POUR RAYONNER : sur une réserve de plan, près du bord,
# ouverte au bout. Seules les règles de fabrication la jugent (angles, bord
# de détourage, piste isolée) ; les règles électriques la laissent.
ANTENNE = "Antenne"


def _signal(doc, n):
    """Un net qui porte un signal : ni masse, ni alimentation, ni nœud de
    découpage (qui agresse, mais ne se juge pas comme une ligne)."""
    return (bool(n) and not _SANS_NET.match(n)
            and _classe(doc, n) not in ("Masse", "Alimentation", "Découpage", ANTENNE))


def _gamma(g):
    return ("critique" if g > GAMMA_CRITIQUE else
            "vigilance" if g > GAMMA_VIGILANCE else "ok")


def _ratio(r):
    """Une longueur rapportée à sa limite : au-delà, vigilance ; au-delà du
    double, critique (λ/20 puis λ/10, λ/40 puis λ/20)."""
    return "critique" if r > 2 else "vigilance" if r > 1 else "ok"


def _rangs(couches):
    return {c.get("name"): i for i, c in enumerate(couches) if c.get("type") == "copper"}


def _ep(couches, a, b):
    """Ce qui sépare deux couches (diélectrique et cuivre traversé), en mm."""
    lo, hi = sorted((a, b))
    return sum(float(c.get("thickness") or 0) for c in couches[lo + 1:hi])


def _plans_voisins(couches, i):
    """Les plans de référence d'une couche : le plus proche au-dessus, le plus
    proche au-dessous -- même lecture que `section_de_couche`."""
    cu = [k for k, c in enumerate(couches) if c.get("type") == "copper"]
    k = cu.index(i)
    haut = next((j for j in reversed(cu[:k]) if couches[j].get("role") == "plane"), None)
    bas = next((j for j in cu[k + 1:] if couches[j].get("role") == "plane"), None)
    return [j for j in (haut, bas) if j is not None]


def _troncons(doc, unite):
    """Pistes et arcs en segments droits, en mm : (net, couche, x1, y1, x2,
    y2, w). Un arc part en cordes de 5° au plus."""
    out = []
    for p in doc.get("pistes") or ():
        pts = [float(v) * unite for v in (p.get("p") or ())]
        w, n = float(p.get("w") or 0) * unite, str(p.get("n") or "")
        for k in range(0, len(pts) - 3, 2):
            if math.hypot(pts[k + 2] - pts[k], pts[k + 3] - pts[k + 1]) > 1e-6:
                out.append((n, p.get("c"), pts[k], pts[k + 1], pts[k + 2], pts[k + 3], w))
    for a in doc.get("arcs") or ():
        (sx, sy), (ex, ey), (mx, my) = [(float(u) * unite, float(v) * unite)
                                        for u, v in (a["s"], a["e"], a["m"])]
        r = math.hypot(sx - mx, sy - my)
        if r <= 1e-6:
            continue
        d0 = math.atan2(sy - my, sx - mx)
        balaye = math.atan2(ey - my, ex - mx) - d0
        if a.get("h"):
            while balaye >= 0:
                balaye -= 2 * math.pi
        else:
            while balaye <= 0:
                balaye += 2 * math.pi
        m = max(1, int(math.ceil(abs(balaye) / math.radians(5))))
        pts = [(mx + r * math.cos(d0 + balaye * k / m), my + r * math.sin(d0 + balaye * k / m))
               for k in range(m + 1)]
        pts[0], pts[-1] = (sx, sy), (ex, ey)
        w, n = float(a.get("w") or 0) * unite, str(a.get("n") or "")
        for (x1, y1), (x2, y2) in zip(pts, pts[1:]):
            if math.hypot(x2 - x1, y2 - y1) > 1e-6:
                out.append((n, a.get("c"), x1, y1, x2, y2, w))
    return out


def _aire(o):
    return 0.5 * sum(o[k] * o[k + 3] - o[k + 2] * o[k + 1]
                     for k in range(0, len(o) - 3, 2)) + 0.5 * (o[-2] * o[1] - o[0] * o[-1])


# ==========================================================================
# LES SURFACES DE CUIVRE, PEINTES UNE FOIS
# --------------------------------------------------------------------------
# Plans et versements arrivent en contours -- le cuivre réel d'un IPC-2581,
# troué de ses dégagements ; les zones de l'éditeur, découpes en trous.
# Plusieurs règles posent la même question en des milliers de points : y
# a-t-il du cuivre ici, et de quel net ? On peint donc chaque couche UNE fois
# dans une image, un net par pixel, et on y lit.
#
# Un contour se peint par ses traversées de ligne : chaque arête bascule les
# pixels à sa droite, et la somme cumulée le long de la ligne dit dedans ou
# dehors -- tout en numpy, sans boucle par pixel. Chaque contour se peint puis
# ses trous s'effacent, du plus grand au plus petit : un îlot posé dans le
# dégagement d'un autre n'est pas effacé par lui.
# ==========================================================================

PIXELS_MAX = 4e6          # par couche : le pas s'élargit au-delà
PAS_MIN_MM = 0.05


class _Surfaces:
    """Le cuivre des plans et versements, une image par couche : l'entier
    d'un net par pixel (-1 : cuivre sans net), 0 là où il n'y a rien."""

    def __init__(self, plans, unite, np):
        self.np, self.ids, self.images, self.pas = np, {}, {}, 0.0
        anneaux = []
        for p in plans:
            o = [float(v) * unite for v in (p.get("o") or ())]
            if len(o) < 6:
                continue
            trous = [[float(v) * unite for v in t] for t in (p.get("t") or ()) if len(t) >= 6]
            n = str(p.get("n") or "")
            if n:
                self.ids.setdefault(n, len(self.ids) + 1)
            anneaux.append((abs(_aire(o)), str(p.get("c")), n, o, trous))
        if not anneaux:
            return
        xs = [v for a in anneaux for v in a[3][0::2]]
        ys = [v for a in anneaux for v in a[3][1::2]]
        self.pas = max(PAS_MIN_MM, math.sqrt((max(xs) - min(xs)) * (max(ys) - min(ys)) / PIXELS_MAX))
        self.x0, self.y0 = min(xs) - self.pas, min(ys) - self.pas
        self.W = int((max(xs) - self.x0) / self.pas) + 2
        self.H = int((max(ys) - self.y0) / self.pas) + 2
        genre = np.int16 if len(self.ids) < 32000 else np.int32
        for _, c, n, o, trous in sorted(anneaux, key=lambda a: -a[0]):
            if c not in self.images:
                self.images[c] = np.zeros((self.H, self.W), genre)
            self._peindre(self.images[c], o, self.ids.get(n, -1))
            for t in trous:
                self._peindre(self.images[c], t, 0)

    def _peindre(self, img, o, val):
        np = self.np
        fj = (np.asarray(o[0::2]) - self.x0) / self.pas - 0.5    # centre du pixel j : fj == j
        fi = (np.asarray(o[1::2]) - self.y0) / self.pas - 0.5
        i0, i1 = max(0, int(math.ceil(fi.min()))), min(self.H - 1, int(math.floor(fi.max())))
        j0, j1 = max(0, int(math.ceil(fj.min()))), min(self.W - 1, int(math.floor(fj.max())))
        if i1 < i0 or j1 < j0:
            return
        bi, bj = np.roll(fi, -1), np.roll(fj, -1)
        # la ligne r compte si lo <= r < hi : un sommet n'est vu qu'une fois
        r_lo = np.maximum(np.ceil(np.minimum(fi, bi)), i0).astype(np.int64)
        r_hi = np.minimum(np.ceil(np.maximum(fi, bi)) - 1, i1).astype(np.int64)
        nb = np.where(fi != bi, np.maximum(r_hi - r_lo + 1, 0), 0)
        if not nb.sum():
            return
        e = np.repeat(np.arange(len(fi)), nb)
        lignes = np.repeat(r_lo, nb) + (np.arange(nb.sum()) - np.repeat(np.cumsum(nb) - nb, nb))
        xc = fj[e] + (lignes - fi[e]) / (bi[e] - fi[e]) * (bj[e] - fj[e])
        col = np.clip(np.ceil(xc), j0, j1 + 1).astype(np.int64)
        bascules = np.zeros((i1 - i0 + 1, j1 - j0 + 2), np.int32)
        np.add.at(bascules, (lignes - i0, col - j0), 1)
        dedans = (np.cumsum(bascules, axis=1) & 1).astype(bool)[:, :-1]
        img[i0:i1 + 1, j0:j1 + 1][dedans] = val

    def lire(self, c, x, y):
        """Le net (entier) sous des points en mm ; 0 hors image."""
        np = self.np
        x, y = np.atleast_1d(np.asarray(x, float)), np.atleast_1d(np.asarray(y, float))
        out = np.zeros(x.shape, np.int32)
        img = self.images.get(c)
        if img is None:
            return out
        j = np.floor((x - self.x0) / self.pas).astype(np.int64)
        i = np.floor((y - self.y0) / self.pas).astype(np.int64)
        ok = (i >= 0) & (i < self.H) & (j >= 0) & (j < self.W)
        out[ok] = img[i[ok], j[ok]]
        return out

    def point(self, i, j):
        return self.x0 + (j + 0.5) * self.pas, self.y0 + (i + 0.5) * self.pas


def _surfaces(doc, unite, notes):
    plans = [p for p in (doc.get("plans") or ()) if isinstance(p, dict)]
    if not plans:
        return None
    try:
        import numpy
    except Exception:                                   # noqa: BLE001
        notes.append("Surfaces de cuivre non lues : numpy manque (pip install numpy).")
        return None
    s = _Surfaces(plans, unite, numpy)
    return s if s.images else None


# ==========================================================================
# 1. L'EMPILAGE
# ==========================================================================

H_LOIN_MM = 0.5           # plan de référence au-delà : boucle large pour un front rapide
CAVITE_MINCE_MM = 0.25    # paire alimentation / masse : au-delà, peu de capacité entre plans
SYMETRIE = 0.10           # écart toléré entre deux couches en miroir


def empilage(doc, couches):
    """L'empilage lui-même : chaque couche de signal a-t-elle un plan collé
    contre elle, deux couches de signal se font-elles face, l'alimentation
    est-elle collée à sa masse, l'empilage est-il symétrique ? Des constats
    de carte (n = None, sans position)."""
    cu = [i for i, c in enumerate(couches) if c.get("type") == "copper"]
    rang = _rangs(couches)

    def nom(i):
        return str(couches[i].get("name") or i)

    def plan(i):
        return couches[i].get("role") == "plane"

    nets = defaultdict(set)
    for p in list(doc.get("pistes") or ()) + list(doc.get("arcs") or ()):
        i, n = rang.get(p.get("c")), str(p.get("n") or "")
        if i is not None and _signal(doc, n):
            nets[i].add(n)
    out = []

    def constat(sev, c, msg):
        out.append({"regle": "empilage", "severite": sev, "x": None, "y": None,
                    "c": c, "n": None, "frequences": [], "msg": msg})

    def compte(i):
        rapides = sorted(n for n in nets[i] if _classe(doc, n) in RAPIDES)
        txt = "%d net%s de signal" % (len(nets[i]), "s" if len(nets[i]) > 1 else "")
        if rapides:
            txt += ", dont %d rapide%s (%s%s)" % (len(rapides), "s" if len(rapides) > 1 else "",
                                                  ", ".join(rapides[:4]),
                                                  "…" if len(rapides) > 4 else "")
        return txt, rapides

    for k, i in enumerate(cu):
        if plan(i) or not nets.get(i):
            continue
        txt, rapides = compte(i)
        refs = _plans_voisins(couches, i)
        if not refs:
            constat("critique" if rapides else "vigilance", nom(i),
                    "Aucun plan de référence dans l'empilage : %s ; leur courant de"
                    " retour n'a pas de chemin défini" % txt)
        elif not any(abs(cu.index(j) - k) == 1 for j in refs):
            j = min(refs, key=lambda j: abs(cu.index(j) - k))
            constat("vigilance", nom(i),
                    "Le plan le plus proche, %s, est à %.2f mm derrière une autre couche"
                    " de cuivre : %s, qui se couplent au lieu de s'y référer"
                    % (nom(j), _ep(couches, i, j), txt))
        elif rapides:
            h = min(_ep(couches, i, j) for j in refs if abs(cu.index(j) - k) == 1)
            if h > H_LOIN_MM:
                constat("vigilance", nom(i),
                        "Plan de référence à %.2f mm : %s ; une boucle de retour large,"
                        " un Z₀ haut, une diaphonie forte" % (h, txt))
        if k + 1 < len(cu) and not plan(cu[k + 1]) and nets.get(cu[k + 1]):
            constat("vigilance", "%s ↔ %s" % (nom(i), nom(cu[k + 1])),
                    "Deux couches de signal face à face (%.2f mm) sans plan entre elles :"
                    " leurs pistes parallèles se couplent sur toute leur largeur ;"
                    " croisez-les à angle droit" % _ep(couches, i, cu[k + 1]))

    for i in cu:
        pn = str(couches[i].get("net") or "")
        if not plan(i) or _classe(doc, pn) != "Alimentation":
            continue
        masses = [j for j in cu if j != i and plan(j)
                  and _classe(doc, str(couches[j].get("net") or "")) == "Masse"]
        if not masses:
            constat("vigilance", nom(i), "Plan d'alimentation %s sans plan de masse dans"
                    " l'empilage : pas de cavité pour découpler en haute fréquence" % pn)
            continue
        j = min(masses, key=lambda j: abs(j - i))
        d, er = _ep(couches, i, j), _er_entre(couches, i, j)
        cpf = 8.854e-12 * er / max(d * 1e-3, 1e-6) * 1e-4 * 1e12
        if any(couches[x].get("type") == "copper" for x in range(min(i, j) + 1, max(i, j))):
            constat("vigilance", "%s ↔ %s" % (nom(i), nom(j)),
                    "Le plan %s est séparé de sa masse par une couche de signal : cavité"
                    " de %.2f mm, %.0f pF/cm²" % (pn, d, cpf))
        elif d > CAVITE_MINCE_MM:
            constat("info", "%s ↔ %s" % (nom(i), nom(j)),
                    "Cavité %s / masse de %.2f mm : %.0f pF/cm². Un diélectrique mince"
                    " (≤ 0,1 mm) fait une capacité répartie qui découple au-delà de"
                    " 100 MHz" % (pn, d, cpf))

    if len(cu) >= 3 and len(cu) % 2:
        constat("vigilance", "empilage", "Nombre impair de couches de cuivre (%d) :"
                " l'empilage est dissymétrique par construction, la carte voile" % len(cu))
    ecarts = []
    for a in range(len(couches) // 2):
        b = len(couches) - 1 - a
        ta, tb = (float(couches[x].get("thickness") or 0) for x in (a, b))
        if couches[a].get("type") != couches[b].get("type"):
            ecarts.append("%s face à %s" % (nom(a), nom(b)))
        elif ta > 0 and tb > 0 and abs(ta - tb) / max(ta, tb) > SYMETRIE:
            ecarts.append("%s %.3f / %s %.3f mm" % (nom(a), ta, nom(b), tb))
    if ecarts:
        constat("vigilance", "empilage", "Empilage dissymétrique autour de son milieu"
                " (%s%s) : les contraintes ne s'équilibrent pas au refusion, la carte"
                " voile (bow & twist)" % ("; ".join(ecarts[:3]), "…" if len(ecarts) > 3 else ""))
    roles = ["%s plan / %s signal" % ((nom(cu[k]), nom(cu[-1 - k])) if plan(cu[k])
                                     else (nom(cu[-1 - k]), nom(cu[k])))
             for k in range(len(cu) // 2) if plan(cu[k]) != plan(cu[-1 - k])]
    if roles:
        constat("info", "empilage", "Cuivre réparti de façon dissymétrique (%s) : une"
                " face plus chargée que l'autre tire la carte" % "; ".join(roles))
    return out


# ==========================================================================
# 2. L'IMPÉDANCE DE CHAQUE NET
# --------------------------------------------------------------------------
# Chaque section (couche, largeur, écarts à la masse coplanaire) résolue par
# la méthode des moments : Z₀, vitesse, C'. Par net : longueur, retard, R, L,
# C. La masse coplanaire se mesure dans l'image de la couche, de chaque côté,
# jusqu'à 3 mm : une ligne RF noyée dans sa masse n'est pas un microruban, et
# vingt pour cent d'impédance en dépendent. Une piste posée DANS une zone de
# masse (l'éditeur envoie ses zones sans les isolations) prend l'isolement de
# la zone. Un tronçon d'impédance Z
# dans une ligne de référence Z_ref réfléchit |Z - Z_ref| / (Z + Z_ref) --
# mais seulement s'il est assez long pour que le front le voie : une
# discontinuité courte réfléchit Γ · 2T_d / t_r. La référence est la cible
# Z₀ pour les classes à impédance tenue (Horloge, Rapide, RF, et toute
# classe à qui `z0_classes` donne sa propre cible), l'impédance dominante du
# net sinon.
# ==========================================================================

RHO_CU = 1.72e-8
CLASSES_Z = ("Horloge", "Rapide", "RF")


ECART_COPLANAIRE_MM = 2.0


def _quantifier(e):
    """Un écart ramené sur une échelle géométrique de 25 % : Z₀ n'en bouge
    pas de 2 %, et le nombre de sections à résoudre fond."""
    if not e > 0:
        return 0.0
    return round(0.05 * 1.25 ** round(math.log(e / 0.05) / math.log(1.25)), 3)


def _ecarts_masse(doc, surf, c, x1, y1, x2, y2, w, unite):
    """(gauche, droite) : l'écart de la piste au cuivre de masse de sa
    couche, en mm, 0 quand il n'y en a pas à moins de 3 mm."""
    if surf is None or c not in surf.images:
        return 0.0, 0.0
    np = surf.np
    masses = getattr(surf, "masses", None)
    if masses is None:
        masses = surf.masses = {g for nm, g in surf.ids.items() if _classe(doc, nm) == "Masse"}
    if not masses:
        return 0.0, 0.0
    L = math.hypot(x2 - x1, y2 - y1)
    nx, ny = -(y2 - y1) / L, (x2 - x1) / L
    t = np.array([0.25, 0.5, 0.75])
    px, py = x1 + (x2 - x1) * t, y1 + (y2 - y1) * t
    dedans = surf.lire(c, px, py)
    if int(dedans[1]) in masses:
        iso = [float(p.get("isolement") or 0) * unite for p in doc.get("plans") or ()
               if str(p.get("c")) == str(c) and surf.ids.get(str(p.get("n") or "")) == int(dedans[1])]
        e = _quantifier(max(iso, default=0.0))
        return e, e
    out = [_ecart_cote(surf, masses, c, px, py, nx, ny, w, sg) for sg in (1, -1)]
    return tuple(sorted(out))           # la section est symétrique


def _ecart_cote(surf, masses, c, px, py, nx, ny, w, sg):
    """L'écart au cuivre de masse d'UN côté (sg = ±1 le long de la normale),
    médiane de trois points, quantifié ; 0 sans masse à moins de 2 mm."""
    np = surf.np
    pas = np.arange(1, int(ECART_COPLANAIRE_MM / surf.pas) + 1) * surf.pas
    ecarts = []
    for k in range(len(px)):
        d = w / 2 + pas
        lab = surf.lire(c, px[k] + sg * nx * d, py[k] + sg * ny * d)
        hit = np.nonzero(lab != 0)[0]
        ecarts.append(float(pas[hit[0]]) if hit.size and int(lab[hit[0]]) in masses else 0.0)
    return _quantifier(sorted(ecarts)[len(ecarts) // 2])


def _ecart_exterieur(doc, surf, c, a, b):
    """L'écart à la masse coplanaire du côté de `a` qui NE regarde PAS `b` :
    deux moitiés d'une paire, (n, x1, y1, x2, y2, w)."""
    if surf is None or c not in surf.images:
        return 0.0
    masses = getattr(surf, "masses", None)
    if masses is None:
        masses = surf.masses = {g for nm, g in surf.ids.items() if _classe(doc, nm) == "Masse"}
    if not masses:
        return 0.0
    _, x1, y1, x2, y2, w = a
    L = math.hypot(x2 - x1, y2 - y1)
    nx, ny = -(y2 - y1) / L, (x2 - x1) / L
    vers_b = ((b[1] + b[3]) / 2 - (x1 + x2) / 2) * nx + ((b[2] + b[4]) / 2 - (y1 + y2) / 2) * ny
    t = surf.np.array([0.25, 0.5, 0.75])
    return _ecart_cote(surf, masses, c, x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, nx, ny, w,
                       -1 if vers_b > 0 else 1)


def impedances(doc, couches, reg, unite, notes, se, troncons, surf=None):
    tl = se.tl
    rang = _rangs(couches)
    parts, ou = defaultdict(lambda: defaultdict(float)), {}
    for n, c, x1, y1, x2, y2, w in troncons:
        i = rang.get(c)
        if i is None or not _signal(doc, n):
            continue
        L = math.hypot(x2 - x1, y2 - y1)
        eg, ed = _ecarts_masse(doc, surf, c, x1, y1, x2, y2, w, unite)
        parts[n][(i, round(w, 3), eg, ed)] += L
        if L > ou.get(n, (0,))[0]:
            ou[n] = (L, (x1 + x2) / 2, (y1 + y2) / 2, c)
    cache = {}

    def section(i, w, eg, ed):
        if (i, w, eg, ed) not in cache:
            cache[(i, w, eg, ed)] = None
            t = float(couches[i].get("thickness") or 0.035)
            geo, _ = se.section_de_couche(couches, i, w, t, eg, ed)
            if geo is not None:
                try:
                    r = tl.solve_line(geo)
                    cache[(i, w, eg, ed)] = (float(r["z0"]),
                                             C0 / math.sqrt(max(float(r["eps_eff"]), 1.0)),
                                             float(r["c"]), t)
                except Exception:                       # noqa: BLE001
                    pass
        return cache[(i, w, eg, ed)]

    out, bilan, sans = [], {"nets": 0, "sections": 0}, 0
    for n, groupes in parts.items():
        pieces = []
        for (i, w, eg, ed), L in groupes.items():
            s = section(i, w, eg, ed)
            if s:
                z, v, c, t = s
                pieces.append({"z": z, "L": L, "td": L * 1e-3 / v, "c": c * L * 1e-3,
                               "l": z * z * c * L * 1e-3, "r": RHO_CU * L / (w * t) * 1e3})
        if not pieces:
            sans += 1
            continue
        bilan["nets"] += 1
        cls = _classe(doc, n)
        tenu = _tient_z(reg, cls)
        zref = _z0(reg, cls) if tenu else max(pieces, key=lambda p: p["L"])["z"]

        def juge(f_eval, tr, P=pieces, zr=zref):
            g = max(abs(p["z"] - zr) / (p["z"] + zr) * min(1.0, 2 * p["td"] / tr) for p in P)
            return g, _gamma(g)
        freqs = _par_frequence(reg, _classe(doc, n), juge, n)
        sev = _pire([f["verdict"] for f in freqs])
        if sev == "ok":
            continue
        zs = sorted(p["z"] for p in pieces)
        tot = {k: sum(p[k] for p in pieces) for k in ("L", "td", "r", "l", "c")}
        _, x, y, c = ou[n]
        out.append({"regle": "impedance", "severite": sev, "frequences": freqs,
                    "x": x / unite, "y": y / unite, "c": c, "n": n,
                    "msg": "%.1f mm, Z₀ %s Ω%s, T_d %.0f ps ; R %.0f mΩ, L %.1f nH, C %.1f pF"
                           % (tot["L"], ("%.0f" % zs[0]) if zs[-1] - zs[0] < 0.5
                              else "%.0f–%.0f" % (zs[0], zs[-1]),
                              " (cible %.0f Ω)" % zref if tenu else "",
                              tot["td"] * 1e12, tot["r"] * 1e3, tot["l"] * 1e9, tot["c"] * 1e12)})
    bilan["sections"] = sum(1 for v in cache.values() if v)
    if sans:
        notes.append("%d net(s) sur des couches sans plan de référence : impédance non"
                     " chiffrée." % sans)
    return out, bilan


# ==========================================================================
# 4. LES FENTES ET LES VIDES DES PLANS DE RÉFÉRENCE
# --------------------------------------------------------------------------
# Sous chaque piste de signal, le plan de référence est lu dans l'image de sa
# couche, pas à pas. Là où il manque, le retour contourne le vide par ses
# deux bouts : on mesure d1 et d2 le long de la normale à la piste,
# plafonnés à 30 mm (plan coupé de bord à bord). Chaque détour est une self
# (Ott), et c'est `rf_reseau.z_fente` -- le moteur de la simulation RF -- qui
# donne son impédance. Verdict par |Γ|, comme un via. Le dégagement du propre
# via ou de la propre pastille du net n'est pas un vide : la piste y plonge.
# Une ligne par net et par plan : le pire franchissement, et leur nombre --
# une antenne posée sur une réserve de plan en franchit des centaines.
# ==========================================================================

FENTE_MAX_MM = 30.0
MARGE_DEGAGEMENT_MM = 0.3


def fentes(doc, couches, reg, unite, notes, surf, troncons):
    try:
        import rf_reseau
        rf_reseau.z_fente
    except Exception as exc:                            # noqa: BLE001
        notes.append("Fentes de plan non vérifiées : %s." % exc)
        return [], {}
    np, pas = surf.np, surf.pas
    rang = _rangs(couches)
    propres = defaultdict(list)
    for t in list(doc.get("pastilles") or ()) + list(doc.get("percages") or ()):
        if t.get("n"):
            x, y = float(t["x"]) * unite, float(t["y"]) * unite
            r = float(t.get("r") if t.get("r") is not None else (t.get("d") or 0) / 2) * unite
            for cle in _cases(CASE_MM, x, y, x, y, r + MARGE_DEGAGEMENT_MM):
                propres[(str(t["n"]),) + cle].append((x, y, r + MARGE_DEGAGEMENT_MM))
    sans_image, vus, pires = set(), set(), {}
    bilan = {"franchissements": 0}
    marche = np.arange(1, int(FENTE_MAX_MM / pas) + 1) * pas
    for n, c, x1, y1, x2, y2, w in troncons:
        i = rang.get(c)
        if i is None or not _signal(doc, n) or couches[i].get("role") == "plane":
            continue
        refs = _plans_voisins(couches, i)
        if not refs:
            continue
        L = math.hypot(x2 - x1, y2 - y1)
        ux, uy = (x2 - x1) / L, (y2 - y1) / L
        m = max(1, int(L / pas))
        s = (np.arange(m) + 0.5) / m * L
        px, py = x1 + ux * s, y1 + uy * s
        excuse = np.zeros(m, bool)
        pres = set()
        for cle in _cases(CASE_MM, x1, y1, x2, y2, 0):
            pres.update(propres.get((n,) + cle, ()))
        for qx, qy, r in pres:
            excuse |= np.hypot(px - qx, py - qy) <= r
        for p in refs:
            nomp = couches[p].get("name")
            if nomp not in surf.images:
                sans_image.add(str(nomp))
                continue
            vide = (surf.lire(nomp, px, py) == 0) & ~excuse
            if not vide.any():
                continue
            bords_ = np.diff(np.concatenate(([0], vide.astype(np.int8), [0])))
            for a, b in zip(np.nonzero(bords_ == 1)[0], np.nonzero(bords_ == -1)[0]):
                k = (a + b - 1) // 2
                xm, ym = float(px[k]), float(py[k])
                cle = (n, p, round(xm), round(ym))
                if cle in vus:
                    continue
                vus.add(cle)
                bilan["franchissements"] += 1
                ds = []
                for sg in (1, -1):
                    hit = np.nonzero(surf.lire(nomp, xm - sg * uy * marche,
                                               ym + sg * ux * marche) != 0)[0]
                    ds.append(float(marche[hit[0]]) if hit.size else FENTE_MAX_MM)
                autre = [q for q in refs if q != p and couches[q].get("name") in surf.images
                         and surf.lire(couches[q].get("name"), xm, ym)[0] != 0]
                fe = {"largeur": w, "plan": p, "d1": ds[0], "d2": ds[1]}

                def juge(f_eval, tr, fe=fe, z0=_z0(reg, _classe(doc, n))):
                    z = complex(rf_reseau.z_fente(couches, fe, f_eval))
                    g = abs(z) / abs(z + 2 * z0)
                    return g, _gamma(g)
                freqs = _par_frequence(reg, _classe(doc, n), juge, n)
                sev = _pire([f["verdict"] for f in freqs])
                if autre and sev == "critique":
                    sev = "vigilance"
                if sev == "ok":
                    continue
                msg = ("Plan %s : %.2f mm de vide sous la piste, le retour contourne à"
                       " %.1f / %.1f mm" % (nomp, (b - a) * L / m, ds[0], ds[1]))
                if min(ds) >= FENTE_MAX_MM:
                    msg += " — plan coupé d'un bord à l'autre"
                if autre:
                    msg += " ; %s reste dessous et porte une part du retour" % (
                        couches[autre[0]].get("name"))
                k = {"regle": "fente", "severite": sev, "frequences": freqs,
                     "x": xm / unite, "y": ym / unite, "c": c, "n": n, "msg": msg}
                rang_k = (("ok", "vigilance", "critique").index(sev),
                          max(f["valeur"] for f in freqs))
                p0 = pires.get((n, p))
                if p0 is None:
                    pires[(n, p)] = [rang_k, k, 1]
                else:
                    p0[2] += 1
                    if rang_k > p0[0]:
                        p0[0], p0[1] = rang_k, k
    out = []
    for _, k, nb in pires.values():
        if nb > 1:
            k["msg"] += " (le pire de %d franchissements sur ce plan)" % nb
        out.append(k)
    if sans_image:
        notes.append("Plans %s déclarés dans l'empilage sans cuivre dans le document :"
                     " fentes non vérifiées sous eux." % ", ".join(sorted(sans_image)))
    return out, bilan


# ==========================================================================
# 5. LES VIAS DE COUTURE
# --------------------------------------------------------------------------
# Deux couches qui portent le cuivre d'une même masse forment une cavité ;
# les vias de ce net qui les traversent l'une et l'autre la cousent. Entre
# deux vias, la cavité résonne quand l'écart approche la demi-longueur
# d'onde : on garde le pas sous λ/20 au genou du front le plus rapide de la
# carte (λ/10 pour condamner). Le plus grand trou sans via se lit par une
# transformée de distance sur le cuivre commun aux deux couches ; son rayon
# d_max fait un pas équivalent √2 · d_max (maille carrée).
#
# LE LONG DU BORD, UNE CLÔTURE : dans la bande de 2 mm du détourage, là où la
# cavité s'ouvre sur l'extérieur et rayonne, les vias de masse forment une
# rangée ; son plus grand écart, 2 · d_max le long d'une ligne, se juge au
# même λ/20. Le constat range sous « Bord de carte ».
# ==========================================================================

AIRE_PLAN_MM2 = 100.0
AIRE_COMMUNE_MM2 = 25.0
BANDE_BORD_MM = 2.0


def coutures(doc, couches, reg, unite, notes, surf):
    try:
        from scipy import ndimage
    except Exception:                                   # noqa: BLE001
        notes.append("Vias de couture non vérifiés : scipy manque.")
        return [], {}
    np, a2 = surf.np, surf.pas ** 2
    rang = _rangs(couches)
    nets = {str(p.get("n") or "") for p in
            list(doc.get("pistes") or ()) + list(doc.get("arcs") or ())
            if _signal(doc, str(p.get("n") or ""))}
    nv, vite = _plus_vite(reg, doc, nets)
    trous = []
    for t in doc.get("percages") or ():
        de, a = rang.get(t.get("de")), rang.get(t.get("a"))
        lo, hi = (sorted((de, a)) if de is not None and a is not None else (0, len(couches)))
        trous.append((float(t["x"]) * unite, float(t["y"]) * unite, str(t.get("n") or ""), lo, hi))
    out, bilan = [], {"cavites": 0}
    bord = None
    ct = doc.get("contour") or {}
    if len(ct.get("o") or ()) >= 6:
        dedans = np.zeros((surf.H, surf.W), np.int16)
        surf._peindre(dedans, [float(v) * unite for v in ct["o"]], 1)
        for t in ct.get("t") or ():
            if len(t) >= 6:
                surf._peindre(dedans, [float(v) * unite for v in t], 0)
        if dedans.any():
            bord = ndimage.distance_transform_edt(dedans.astype(bool)) * surf.pas
    for g, gid in sorted(surf.ids.items()):
        if _classe(doc, g) != "Masse":
            continue
        couvre = sorted((rang[c], c, img == gid) for c, img in surf.images.items()
                        if c in rang and (img == gid).sum() * a2 >= AIRE_PLAN_MM2)
        for (ia, na, ma), (ib, nb, mb) in zip(couvre, couvre[1:]):
            commun = ma & mb
            aire = commun.sum() * a2
            if aire < AIRE_COMMUNE_MM2:
                continue
            bilan["cavites"] += 1
            vias = [(x, y) for x, y, n, lo, hi in trous if n == g and lo <= ia and ib <= hi]
            base = {"regle": "couture", "c": "%s ↔ %s" % (na, nb), "n": g}
            if not vias:
                ii, jj = np.nonzero(commun)
                x, y = surf.point(ii.mean(), jj.mean())
                out.append(dict(base, severite="critique", frequences=[], x=x / unite, y=y / unite,
                                msg="Aucun via de %s ne relie %s à %s : %.1f cm² de cuivre en"
                                    " regard, sans couture" % (g, na, nb, aire / 100)))
                continue
            mv = np.zeros(commun.shape, bool)
            for x, y in vias:
                j, i = int((x - surf.x0) / surf.pas), int((y - surf.y0) / surf.pas)
                if 0 <= i < surf.H and 0 <= j < surf.W:
                    mv[i, j] = True
            dist = ndimage.distance_transform_edt(~mv) * surf.pas
            er = _er_entre(couches, ia, ib)
            if bord is not None:
                bande = commun & (bord > 0) & (bord <= BANDE_BORD_MM)
                if bande.sum() * surf.pas >= 10 * BANDE_BORD_MM:       # 10 mm de bord au moins
                    db = np.where(bande, dist, 0)
                    bi, bj = np.unravel_index(int(np.argmax(db)), db.shape)
                    s_bord = 2 * float(db[bi, bj])

                    def juge_b(f_eval, tr, s=s_bord, er=er):
                        r = s / (C0 / (f_eval * math.sqrt(er)) / 20 * 1e3)
                        return r, _ratio(r)
                    fb = _par_frequence(reg, vite, juge_b, nv)
                    sev_b = _pire([f["verdict"] for f in fb])
                    if sev_b != "ok":
                        x, y = surf.point(bi, bj)
                        out.append(dict(base, regle="bord", severite=sev_b, frequences=fb,
                                        x=x / unite, y=y / unite,
                                        msg="Clôture de vias %s le long du bord : le plus grand"
                                            " écart entre deux vias fait %.1f mm dans la bande"
                                            " de %.0f mm du détourage ; la cavité s'y ouvre et"
                                            " rayonne (réglé sur le plus rapide de la carte : %s)"
                                            % (g, s_bord, BANDE_BORD_MM, vite)))
            dist[~commun] = 0
            i, j = np.unravel_index(int(np.argmax(dist)), dist.shape)
            d_max = float(dist[i, j])
            s_eq = math.sqrt(2) * d_max

            def juge(f_eval, tr, s=s_eq, er=er):
                r = s / (C0 / (f_eval * math.sqrt(er)) / 20 * 1e3)
                return r, _ratio(r)
            freqs = _par_frequence(reg, vite, juge, nv)
            sev = _pire([f["verdict"] for f in freqs])
            if sev == "ok":
                continue
            x, y = surf.point(i, j)
            tient = 0.35 * 20 * s_eq * 1e-3 * math.sqrt(er) / C0
            out.append(dict(base, severite=sev, frequences=freqs, x=x / unite, y=y / unite,
                            msg="%d via%s de couture sur %.1f cm² en regard ; le plus grand trou"
                                " sans via fait Ø %.1f mm, un pas de %.1f mm ; tient des fronts"
                                " jusqu'à %.2g ns (réglé sur le plus rapide de la carte : %s)"
                                % (len(vias), "s" if len(vias) > 1 else "", aire / 100,
                                   2 * d_max, s_eq, tient * 1e9, vite)))
    return out, bilan


# ==========================================================================
# 7. LE DÉCOUPLAGE
# --------------------------------------------------------------------------
# Chaque broche d'alimentation d'un circuit intégré doit trouver, tout près,
# un condensateur entre ce rail et la masse. « Tout près » se mesure sur le
# CHEMIN RÉEL : les pistes du rail de la broche au condensateur (plus court
# chemin, vias compris), à vol d'oiseau seulement quand le rail passe par un
# plan. Ce chemin se juge face à λ/40 au genou du front le plus rapide des
# signaux du circuit (λ/20 pour condamner). Et il donne une INDUCTANCE de
# boucle -- pistes (L' de leur section), vias (0,76 nH/mm), montage du boîtier
# (0402 : 0,5 nH…) -- qui, avec la VALEUR du condensateur, fixe sa résonance :
# au-delà, un condensateur n'est plus qu'une self. Un condensateur qui résonne
# plus d'une décade sous le genou ne découple pas ce circuit (vigilance).
# ==========================================================================

RE_CI = re.compile(r"^(U|IC|VR|REG)\d", re.IGNORECASE)
RE_CAPA = re.compile(r"^C\d", re.IGNORECASE)
RE_CONNECTEUR = re.compile(r"^(J|P|CN|CONN|X)\d", re.IGNORECASE)
# Mêmes valeurs que SIM_PDN_L_MOUNT_BOITIER (commun/simulation-em.js).
L_MONTAGE = ((re.compile(r"0201"), 0.35e-9), (re.compile(r"0402"), 0.50e-9),
             (re.compile(r"0603"), 0.75e-9), (re.compile(r"0805"), 1.00e-9),
             (re.compile(r"1206"), 1.30e-9),
             (re.compile(r"radial|elec|tant", re.IGNORECASE), 2.50e-9))
L_MONTAGE_DEFAUT = 0.8e-9
L_VIA_PAR_MM = 0.76e-9
L_PISTE_PAR_MM = 1.0e-9   # sans empilage : la règle de pouce d'une piste fine
ACCROCHE_MM = 0.6         # une broche touche une piste du rail à moins de ça


def _farads(txt):
    """La valeur d'un condensateur en farads (« 100nF », « 0,1 µF », « 10p ») ;
    0 si on ne sait pas la lire. Même lecture que `simValeurFaradsIpc`."""
    m = re.search(r"([0-9]+(?:[.,][0-9]+)?)\s*([pnuµm])F?", str(txt or ""), re.IGNORECASE)
    if not m:
        return 0.0
    return float(m.group(1).replace(",", ".")) * {"p": 1e-12, "n": 1e-9, "u": 1e-6,
                                                   "µ": 1e-6, "m": 1e-3}[m.group(2).lower()]


def _l_montage(pkg):
    return next((l for rx, l in L_MONTAGE if rx.search(str(pkg or ""))), L_MONTAGE_DEFAUT)


class _Chemins:
    """Le plus court chemin, en inductance, sur les pistes d'un net : nœuds
    (couche, x, y) au pas de 20 µm, un segment de piste par arête (L' de sa
    section), et un via supposé partout où deux couches ont un nœud au même
    point. ponytail: un T posé au milieu d'un segment n'est pas un nœud (il
    faudrait couper le segment) ; le plan du rail n'est pas maillé."""

    def __init__(self, troncons, couches, se):
        self.couches, self.se, self.rang = couches, se, _rangs(couches)
        self.par_net, self.lp = defaultdict(list), {}
        for t in troncons:
            if t[0]:
                self.par_net[t[0]].append(t)
        self.graphes = {}

    def _l_par_m(self, c, w):
        cle = (c, round(w, 3))
        if cle not in self.lp:
            l = L_PISTE_PAR_MM * 1e3
            i = self.rang.get(c)
            if self.se is not None and i is not None and w > 0:
                try:
                    geo, _ = self.se.section_de_couche(
                        self.couches, i, w, float(self.couches[i].get("thickness") or 0.035))
                    if geo is not None:
                        r = self.se.tl.solve_line(geo)
                        l = float(r["z0"]) * math.sqrt(max(float(r["eps_eff"]), 1.0)) / C0
                except Exception:                       # noqa: BLE001
                    pass
            self.lp[cle] = l
        return self.lp[cle]

    def _l_via(self, c1, c2):
        i, j = self.rang.get(c1), self.rang.get(c2)
        h = _ep(self.couches, i, j) if i is not None and j is not None else 1.6
        return L_VIA_PAR_MM * max(h, 0.1)

    def graphe(self, n):
        if n not in self.graphes:
            adj, pos = defaultdict(list), defaultdict(set)
            cle = lambda c, x, y: (c, round(x / 0.02), round(y / 0.02))
            for _, c, x1, y1, x2, y2, w in self.par_net.get(n, ()):
                a, b = cle(c, x1, y1), cle(c, x2, y2)
                L = math.hypot(x2 - x1, y2 - y1)
                l = self._l_par_m(c, w) * L * 1e-3
                adj[a].append((b, l, L))
                adj[b].append((a, l, L))
                pos[a[1:]].add(a)
                pos[b[1:]].add(b)
            for noeuds in pos.values():
                for a in noeuds:
                    for b in noeuds:
                        if a != b:
                            adj[a].append((b, self._l_via(a[0], b[0]), 0.0))
            self.graphes[n] = adj
        return self.graphes[n]

    def accroches(self, n, x, y, c):
        """Les nœuds du net à moins de ACCROCHE_MM de (x, y), et l'inductance
        de via pour les rejoindre depuis la couche `c` de la broche."""
        out = []
        for k in self.graphe(n):
            d = math.hypot(k[1] * 0.02 - x, k[2] * 0.02 - y)
            if d <= ACCROCHE_MM:
                out.append((k, 0.0 if k[0] == c else self._l_via(c, k[0])))
        return out

    def chemin(self, n, depart, arrivees):
        """(inductance en H, longueur en mm, index de l'arrivée atteinte) du
        plus court chemin de `depart` vers l'une des `arrivees` -- chacune une
        liste d'accroches --, ou None."""
        import heapq
        adj = self.graphe(n)
        cible = {}
        for idx, acc in enumerate(arrivees):
            for k, l in acc:
                if k not in cible or l < cible[k][0]:
                    cible[k] = (l, idx)
        vus, tas = {}, [(l, 0.0, k) for k, l in depart]
        heapq.heapify(tas)
        meilleur = None
        while tas:
            l, L, k = heapq.heappop(tas)
            if k in vus:
                continue
            vus[k] = l
            if k in cible:
                tot = l + cible[k][0]
                if meilleur is None or tot < meilleur[0]:
                    meilleur = (tot, L, cible[k][1])
            if meilleur is not None and l > meilleur[0]:
                break
            for b, dl, dL in adj.get(k, ()):
                if b not in vus:
                    heapq.heappush(tas, (l + dl, L + dL, b))
        return meilleur


def decouplages(doc, couches, reg, unite, notes, troncons=(), se=None):
    comps = [c for c in (doc.get("composants") or ()) if isinstance(c, dict)]
    if not comps:
        notes.append("Pas de composants dans le document : découplage non vérifié.")
        return [], {}
    ers = [float(c.get("epsilon_r") or 0) for c in couches
           if c.get("type") == "dielectric" and float(c.get("epsilon_r") or 0) > 0]
    er = sum(ers) / len(ers) if ers else 4.3
    chemins = _Chemins(troncons, couches, se)
    caps, vers_masse = defaultdict(list), set()
    for cp in comps:
        ref, br = str(cp.get("ref") or ""), cp.get("broches") or []
        nets = [str(b.get("n") or "") for b in br]
        if RE_CAPA.match(ref) and len(br) <= 3 and any(_classe(doc, n) == "Masse" for n in nets):
            for b, n in zip(br, nets):
                if n and _classe(doc, n) == "Alimentation":
                    caps[n].append({"x": float(b["x"]) * unite, "y": float(b["y"]) * unite,
                                    "ref": ref, "c": str(cp.get("c") or ""),
                                    "C": _farads(cp.get("val")),
                                    "lm": _l_montage(cp.get("pkg")), "val": cp.get("val")})
                elif n and not _SANS_NET.match(n):
                    vers_masse.add(n)
    # UN RAIL AU NOM AUTOMATIQUE (SIGN00358) SORT SOUVENT « ANALOGIQUE » : ses
    # broches échappent alors à la règle. On ne le reclasse pas -- on le montre.
    suspects = []
    out, bilan = [], {"circuits": 0, "broches": 0, "chemins_routes": 0}
    for cp in comps:
        ref, br = str(cp.get("ref") or ""), cp.get("broches") or []
        if not (RE_CI.match(ref) or (len(br) >= 8 and not RE_CONNECTEUR.match(ref)
                                     and not RE_CAPA.match(ref))):
            continue
        alims, signaux = defaultdict(list), set()
        for b in br:
            n = str(b.get("n") or "")
            if n and _classe(doc, n) == "Alimentation":
                alims[n].append(b)
            elif _signal(doc, n):
                signaux.add(n)
                if n in vers_masse and _classe(doc, n) in ("Analogique", "Lent"):
                    suspects.append("%s.%s (%s)" % (ref, b.get("pin", "?"), n))
        if not alims:
            continue
        bilan["circuits"] += 1
        nv, vite = _plus_vite(reg, doc, signaux)
        c_ci = str(cp.get("c") or "")
        for n, pins in sorted(alims.items()):
            bilan["broches"] += len(pins)
            base = {"regle": "decouplage", "c": c_ci, "n": n}
            if not caps.get(n):
                b = pins[0]
                out.append(dict(base, severite="critique", frequences=[], x=float(b["x"]),
                                y=float(b["y"]), msg="%s : %d broche%s sur ce rail et aucun"
                                " condensateur entre %s et la masse sur la carte. Si"
                                " c'est une sortie de %s qui alimente une autre puce,"
                                " classer ce net en signal"
                                % (ref, len(pins), "s" if len(pins) > 1 else "", n, ref)))
                continue
            arrivees = [chemins.accroches(n, k["x"], k["y"], k["c"]) for k in caps[n]]
            pires = []
            for b in pins:
                bx, by = float(b["x"]) * unite, float(b["y"]) * unite
                vol = [math.hypot(bx - k["x"], by - k["y"]) for k in caps[n]]
                r = chemins.chemin(n, chemins.accroches(n, bx, by, c_ci), arrivees)
                if r is not None:
                    l_ch, long_, idx = r
                    route = True
                else:                   # par le plan : la plus proche à vol d'oiseau
                    idx = min(range(len(vol)), key=vol.__getitem__)
                    long_, l_ch, route = vol[idx], 0.0, False
                k = caps[n][idx]
                pires.append((long_, b, k, vol[idx], l_ch + k["lm"], route))
            long_, b, k, vol, l_b, route = max(pires, key=lambda t: t[0])
            bilan["chemins_routes"] += route
            f_res = 1 / (2 * math.pi * math.sqrt(l_b * k["C"])) if k["C"] > 0 else None
            # LES AUTRES CONDENSATEURS DU RAIL autour de cette broche : un 10 µF
            # tout près et un 100 nF à côté, c'est le 100 nF qui découple le
            # haut du spectre. Leur boucle, comme celle du condensateur choisi :
            # le montage, plus la piste à vol d'oiseau quand le rail est routé.
            bx, by = float(b["x"]) * unite, float(b["y"]) * unite
            autour = []
            for q in caps[n]:
                if q["C"] > 0:
                    dq = math.hypot(bx - q["x"], by - q["y"])
                    lq = q["lm"] + (L_PISTE_PAR_MM * dq if route else 0.0)
                    autour.append((dq, 1 / (2 * math.pi * math.sqrt(lq * q["C"]))))

            def juge(f_eval, tr, d=long_, f_res=f_res, autour=autour):
                r40 = C0 / (f_eval * math.sqrt(er)) / 40 * 1e3
                r = d / r40
                v = _ratio(r)
                extra = {}
                if f_res:
                    extra["f_res"] = round(f_res)
                    haut = max([f for dq, f in autour if dq <= max(r40, d)] + [f_res])
                    if haut < f_eval / 10 and v == "ok":
                        v = "vigilance"
                return r, v, extra
            freqs = _par_frequence(reg, vite, juge, nv)
            sev = _pire([f["verdict"] for f in freqs])
            if sev == "ok":
                continue
            tient = 0.35 * 40 * long_ * 1e-3 * math.sqrt(er) / C0
            quoi = ("%s à %.1f mm par la piste (%.1f à vol d'oiseau)" % (k["ref"], long_, vol)
                    if route else "%s à %.1f mm à vol d'oiseau (par le plan)" % (k["ref"], long_))
            res = ""
            if k["C"] > 0:
                res = " ; %s, boucle %.1f nH : résonance à %s" % (
                    k["val"], l_b * 1e9, _hz(f_res))
            else:
                res = " ; boucle %.1f nH (valeur illisible : « %s »)" % (l_b * 1e9, k["val"] or "")
            out.append(dict(base, severite=sev, frequences=freqs, x=float(b["x"]), y=float(b["y"]),
                            msg="%s : %d broche%s sur ce rail ; la plus mal servie (%s) a %s%s ;"
                                " signaux %s ; la distance tient des fronts jusqu'à %.2g ns"
                                % (ref, len(pins), "s" if len(pins) > 1 else "",
                                   b.get("pin") or "?", quoi, res, vite, tient * 1e9)))
    if suspects:
        notes.append("Broches de circuit reliées à la masse par un condensateur mais pas"
                     " classées Alimentation, donc non jugées en découplage — des rails à"
                     " reclasser ? %s%s" % (", ".join(suspects[:12]),
                                            " …" if len(suspects) > 12 else ""))
        bilan["rails_suspects"] = len(suspects)
    return out, bilan


def _hz(f):
    return ("%.3g GHz" % (f / 1e9) if f >= 1e9 else "%.3g MHz" % (f / 1e6) if f >= 1e6
            else "%.3g kHz" % (f / 1e3))


# ==========================================================================
# 8. LE BORD DE LA CARTE
# --------------------------------------------------------------------------
# Deux raisons de s'en écarter. La fabrication : le détourage met à nu le
# cuivre trop proche (0,25 mm critique, 0,5 mm vigilance ; tous nets). La
# CEM : le champ d'une piste déborde de ~5 h de son axe ; près du bord, il
# déborde du plan de référence et rayonne. On cumule par net la longueur qui
# court à moins de max(1 mm, 5 h) du bord, jugée face à λ/20 au genou (λ/10
# pour condamner). Et la règle des 20 H : un plan d'alimentation se tient en
# retrait de 20 fois son écart à la masse sur le bord de celle-ci (info : la
# règle se discute, elle vaut surtout au-delà du GHz).
# ==========================================================================

BORD_CRITIQUE_MM, BORD_VIGILANCE_MM = 0.25, 0.5
BORD_H = 5
PAS_BORD_MM = 0.1


def _dist_segments(px, py, A, np):
    """Distance de chaque point au plus proche des segments A (E, 4)."""
    x1, y1, x2, y2 = A[:, 0], A[:, 1], A[:, 2], A[:, 3]
    dx, dy = x2 - x1, y2 - y1
    l2 = np.maximum(dx * dx + dy * dy, 1e-12)
    t = np.clip(((px[:, None] - x1) * dx + (py[:, None] - y1) * dy) / l2, 0.0, 1.0)
    return np.hypot(px[:, None] - (x1 + t * dx), py[:, None] - (y1 + t * dy)).min(axis=1)


def bords(doc, couches, reg, unite, notes, se, troncons, surf):
    import numpy as np
    ct = doc.get("contour") or {}
    anneaux = [[float(v) * unite for v in a] for a in [ct.get("o") or []] + list(ct.get("t") or [])
               if len(a) >= 6]
    if not anneaux:
        notes.append("Pas de contour de carte dans le document : distance au bord non vérifiée.")
        return [], {}
    aretes = []
    for o in anneaux:
        pts = list(zip(o[0::2], o[1::2]))
        aretes += [(a[0], a[1], b[0], b[1]) for a, b in zip(pts, pts[1:] + pts[:1])]
    A = np.asarray(aretes, float)
    grille = defaultdict(set)
    for e, (x1, y1, x2, y2) in enumerate(aretes):
        m = max(1, int(math.hypot(x2 - x1, y2 - y1) / (CASE_MM / 2)))
        for k in range(m + 1):
            grille[(math.floor((x1 + (x2 - x1) * k / m) / CASE_MM),
                    math.floor((y1 + (y2 - y1) * k / m) / CASE_MM))].add(e)
    rang, hauteurs = _rangs(couches), {}

    def hauteur(i):
        if i not in hauteurs:
            hauteurs[i] = se._hauteur_de_couche(couches, i, 0.2,
                                                float(couches[i].get("thickness") or 0.035))
        return hauteurs[i]

    fab, cem = {}, {}
    for n, c, x1, y1, x2, y2, w in troncons:
        if not n or _SANS_NET.match(n):
            continue
        i = rang.get(c)
        vite = _signal(doc, n) or _classe(doc, n) == "Découpage"
        lim_cem = max(1.0, BORD_H * hauteur(i)) if vite and i is not None else 0.0
        lim = max(BORD_VIGILANCE_MM + w / 2, lim_cem)
        ids = set()
        for cle in _cases(CASE_MM, x1, y1, x2, y2, lim):
            ids |= grille.get(cle, set())
        if not ids:
            continue
        L = math.hypot(x2 - x1, y2 - y1)
        t = np.linspace(0.0, 1.0, max(2, int(L / PAS_BORD_MM) + 1))
        px, py = x1 + (x2 - x1) * t, y1 + (y2 - y1) * t
        d = _dist_segments(px, py, A[sorted(ids)], np)
        k = int(np.argmin(d))
        cu = float(d[k]) - w / 2
        if cu < BORD_VIGILANCE_MM and cu < fab.get((n, c), (9e9,))[0]:
            fab[(n, c)] = (cu, float(px[k]), float(py[k]))
        if lim_cem:
            proche = d < lim_cem
            if proche.any():
                v = cem.setdefault(n, [0.0, 9e9, 0, 0, c, lim_cem, i])
                v[0] += L * proche.mean()
                if d[k] < v[1]:
                    v[1:6] = [float(d[k]), float(px[k]), float(py[k]), c, lim_cem]
                    v[6] = i
    out = []
    for (n, c), (cu, x, y) in fab.items():
        out.append({"regle": "bord", "severite": "critique" if cu < BORD_CRITIQUE_MM else "vigilance",
                    "frequences": [], "x": x / unite, "y": y / unite, "c": c, "n": n,
                    "msg": "Cuivre à %.2f mm du bord de carte : le détourage peut le mettre à nu"
                           " (0,25 à 0,5 mm selon le fabricant)" % max(cu, 0.0)})
    for n, (L, dmin, x, y, c, lim, i) in cem.items():
        er = _er_entre(couches, max(i - 1, 0), min(i + 1, len(couches) - 1))

        def juge(f_eval, tr, L=L, er=er):
            r = L / (C0 / (f_eval * math.sqrt(er)) / 20 * 1e3)
            return r, _ratio(r)
        freqs = _par_frequence(reg, _classe(doc, n), juge, n)
        sev = _pire([f["verdict"] for f in freqs])
        if sev != "ok":
            out.append({"regle": "bord", "severite": sev, "frequences": freqs,
                        "x": x / unite, "y": y / unite, "c": c, "n": n,
                        "msg": "%.1f mm de piste à moins de %.1f mm du bord (au plus près"
                               " %.2f mm) : le champ déborde du plan de référence et rayonne"
                               % (L, lim, dmin)})
    if surf is not None:
        out += _vingt_h(doc, couches, unite, surf)
    return out, {"pistes_pres_du_bord": len(fab) + len(cem)}


def _vingt_h(doc, couches, unite, surf):
    try:
        from scipy import ndimage
    except Exception:                                   # noqa: BLE001
        return []
    out = []
    cu = [i for i, c in enumerate(couches) if c.get("type") == "copper"]
    for i in cu:
        pn = str(couches[i].get("net") or "")
        if couches[i].get("role") != "plane" or _classe(doc, pn) != "Alimentation":
            continue
        masses = [j for j in cu if j != i and couches[j].get("role") == "plane"
                  and _classe(doc, str(couches[j].get("net") or "")) == "Masse"]
        if not masses:
            continue
        j = min(masses, key=lambda j: abs(j - i))
        gn = str(couches[j].get("net") or "")
        ni, nj = couches[i].get("name"), couches[j].get("name")
        if ni not in surf.images or nj not in surf.images or pn not in surf.ids or gn not in surf.ids:
            continue
        pwr = surf.images[ni] == surf.ids[pn]
        gnd = ndimage.binary_fill_holes(surf.images[nj] == surf.ids[gn])
        if not pwr.any() or not gnd.any():
            continue
        retrait = 20 * _ep(couches, i, j)
        dist = ndimage.distance_transform_edt(gnd) * surf.pas
        viol = pwr & (dist < retrait)
        if not viol.any():
            continue
        d = surf.np.where(viol, dist, 9e9)
        a, b = surf.np.unravel_index(int(surf.np.argmin(d)), d.shape)
        x, y = surf.point(a, b)
        out.append({"regle": "bord", "severite": "info", "frequences": [],
                    "x": x / unite, "y": y / unite, "c": "%s ↔ %s" % (ni, nj), "n": pn,
                    "msg": "Règle des 20 H : le plan %s s'approche à %.2f mm du bord de la masse"
                           " %s (retrait conseillé %.1f mm) sur %.0f %% de sa surface"
                           % (pn, float(dist[a, b]), gn, retrait,
                              100.0 * viol.sum() / pwr.sum())})
    return out


# ==========================================================================
# 9. LES PAIRES DIFFÉRENTIELLES
# --------------------------------------------------------------------------
# Le long de la paire : les morceaux couplés (P face à N, même couche, à
# moins de 5 h) et leur Z_diff résolue par la méthode des moments à l'écart
# réel ; les morceaux découplés, qui valent deux lignes seules (2 Z₀). Chaque
# morceau réfléchit |Z - Z_cible| / (Z + Z_cible), pondéré par 2T_d / t_r
# comme une discontinuité courte. L'écart de longueur, en temps, se compare
# au front : il convertit le différentiel en mode commun (10 % du front en
# vigilance, 20 % critique). Des vias en nombre différent sur P et N
# dissymétrisent la paire. La masse coplanaire qui borde la paire, mesurée
# dans le cuivre de la couche du côté extérieur de chaque moitié, entre dans
# Z_diff. Et le plan de référence doit passer sous LES DEUX moitiés : là où
# une seule le voit, la paire se déséquilibre et convertit en mode commun --
# jugé en temps face au front, comme l'écart de longueur.
# ==========================================================================

ZDIFF = 100.0


def paires_diff(doc, couches, reg, unite, notes, se, troncons, surf=None):
    tl = se.tl
    paires = [tuple(map(str, pr)) for pr in (doc.get("paires") or ()) if len(pr) == 2]
    if not paires:
        return [], {}
    rang = _rangs(couches)
    par, longueur, plus_long = defaultdict(list), defaultdict(float), {}
    for n, c, x1, y1, x2, y2, w in troncons:
        L = math.hypot(x2 - x1, y2 - y1)
        longueur[n] += L
        if L > plus_long.get(n, (0,))[0]:
            plus_long[n] = (L, (x1 + x2) / 2, (y1 + y2) / 2, c)
        if rang.get(c) is not None:
            par[(n, rang[c])].append((n, x1, y1, x2, y2, w))
    vias = defaultdict(int)
    for t in doc.get("percages") or ():
        vias[str(t.get("n") or "")] += 1
    cache = {}

    def epaisseur(i):
        return float(couches[i].get("thickness") or 0.035)

    def z_couple(i, wa, wb, s, eg=0.0, ed=0.0):
        cle = ("d", i, round(wa, 3), round(wb, 3), round(s, 2), eg, ed)
        if cle not in cache:
            cache[cle] = None
            geo, _ = se.section_de_couche(couches, i, wa, epaisseur(i), eg, ed)
            if geo is not None:
                geo = dict(geo)
                geo["conducteurs"] = [{"w": wa * 1e-3, "x": 0.0, "masse": False},
                                      {"w": wb * 1e-3, "x": ((wa + wb) / 2 + s) * 1e-3,
                                       "masse": False}]
                try:
                    r = tl.solve_multiline(geo)
                    pr = r.get("paire") or tl.modes_paire(r["c"], r["l"])
                    cache[cle] = (float(pr["z_diff"]),
                                  C0 / math.sqrt(max(float(pr["eps_eff_impair"]), 1.0)))
                except Exception:                       # noqa: BLE001
                    pass
        return cache[cle]

    def z_seule(i, w):
        cle = ("s", i, round(w, 3))
        if cle not in cache:
            cache[cle] = None
            geo, _ = se.section_de_couche(couches, i, w, epaisseur(i), 0.0, 0.0)
            if geo is not None:
                try:
                    r = tl.solve_line(geo)
                    cache[cle] = (2 * float(r["z0"]),
                                  C0 / math.sqrt(max(float(r["eps_eff"]), 1.0)))
                except Exception:                       # noqa: BLE001
                    pass
        return cache[cle]

    def plan_sous(i, x, y):
        """Pour chaque plan de référence de la couche i : du cuivre en (x, y) ?"""
        return tuple(bool(surf.lire(couches[p].get("name"), x, y)[0])
                     for p in _plans_voisins(couches, i)
                     if couches[p].get("name") in surf.images)

    def desequilibre(i, a, b, lg):
        """La longueur, en mm, où le plan ne passe que sous une des deux moitiés."""
        if surf is None:
            return 0.0
        _, x1, y1, x2, y2, _w = a
        L = math.hypot(x2 - x1, y2 - y1)
        ux, uy = (x2 - x1) / L, (y2 - y1) / L
        mx, my = lg[2]
        # décalage de `a` vers `b`, le long de la normale
        dn = (b[1] - mx) * (-uy) + (b[2] - my) * ux
        m = max(2, int(lg[0] / max(surf.pas, 0.05)))
        rate = 0
        for k in range(m):
            s_ = (k + 0.5) / m - 0.5
            px, py = mx + ux * s_ * lg[0], my + uy * s_ * lg[0]
            if plan_sous(i, px, py) != plan_sous(i, px - uy * dn, py + ux * dn):
                rate += 1
        return lg[0] * rate / m

    out, bilan, zt = [], {"paires": 0}, reg["zdiff"]
    for p, q in paires:
        if not (longueur[p] and longueur[q]):
            continue
        bilan["paires"] += 1
        pieces, couple, bancal = [], 0.0, 0.0        # (Z, L, v, couplé ?)
        for i in sorted({i for (n, i) in par if n in (p, q)}):
            h = se._hauteur_de_couche(couches, i, 0.2, epaisseur(i))
            smax = 5 * h if h > 0 else 1.0
            for moi, lui in ((p, q), (q, p)):
                for a in par.get((moi, i), ()):
                    la, cov = math.hypot(a[3] - a[1], a[4] - a[2]), 0.0
                    for b in par.get((lui, i), ()):
                        lb = math.hypot(b[3] - b[1], b[4] - b[2])
                        lg = _longement(a, b) if la >= lb else _longement(b, a)
                        if not lg or lg[0] < 0.01 or not (0 < lg[1] <= smax):
                            continue
                        cov += lg[0]
                        if moi != p:
                            continue
                        c_nom = couches[i].get("name")
                        r = z_couple(i, a[5], b[5], lg[1],
                                     _ecart_exterieur(doc, surf, c_nom, a, b),
                                     _ecart_exterieur(doc, surf, c_nom, b, a))
                        if r:
                            pieces.append((r[0], lg[0], r[1], True))
                            couple += lg[0]
                        bancal += desequilibre(i, a, b, lg)
                    if la - min(cov, la) > 0.01:
                        r = z_seule(i, a[5])
                        if r:
                            pieces.append((r[0], la - min(cov, la), r[1], False))
        if not pieces:
            continue
        v_ref = max(pieces, key=lambda x: x[1])[2]
        dl = abs(longueur[p] - longueur[q])
        dt = dl * 1e-3 / v_ref
        nv, vite = _plus_vite(reg, doc, (p, q))

        db = bancal * 1e-3 / v_ref

        def juge(f_eval, tr, P=pieces, dt=dt, db=db):
            g = max(abs(z - zt) / (z + zt) * min(1.0, 2 * L * 1e-3 / v / tr) for z, L, v, _ in P)
            sk, mc = dt / tr, db / tr
            v = _pire([_gamma(g)] + ["critique" if x > 0.2 else "vigilance" if x > 0.1 else "ok"
                                     for x in (sk, mc)])
            return g, v, {"skew": round(sk, 4), "plan_bancal": round(mc, 4)}
        freqs = _par_frequence(reg, vite, juge, nv)
        sev = _pire([f["verdict"] for f in freqs])
        nv = (vias[p], vias[q])
        if nv[0] != nv[1] and sev == "ok":
            sev = "vigilance"
        if sev == "ok":
            continue
        zc = sorted(z for z, _, _, c in pieces if c)
        _, x, y, c = plus_long[p]
        out.append({"regle": "paire", "severite": sev, "frequences": freqs,
                    "x": x / unite, "y": y / unite, "c": c, "n": p,
                    "msg": "Paire %s / %s : Z_diff %s (cible %.0f Ω), %.1f mm couplés sur %.1f,"
                           " écart de longueur %.2f mm (%.0f ps)%s"
                           % (p, q, ("%.0f–%.0f Ω" % (zc[0], zc[-1]) if zc and zc[-1] - zc[0] >= 0.5
                                     else "%.0f Ω" % zc[0] if zc else "jamais couplée"),
                              zt, couple, max(longueur[p], longueur[q]), dl, dt * 1e12,
                              " ; %d via(s) sur %s contre %d sur %s" % (nv[0], p, nv[1], q)
                              if nv[0] != nv[1] else "")
                    + (" ; plan de référence sous une seule moitié sur %.1f mm" % bancal
                       if bancal >= 0.1 else "")})
    return out, bilan


# ==========================================================================
# BOUTS DE PISTE ORPHELINS
# --------------------------------------------------------------------------
# Un bout de piste qui ne touche rien -- ni pastille, ni via, ni une autre
# piste du net, ni le versement de son net -- est un bout libre. On remonte
# la piste jusqu'à ce qui la retient : une pastille (la piste est une
# antenne), un embranchement (un moignon ; un dépassement s'il est court),
# ou rien (une piste isolée, reliée à rien). Ce qui retient peut tomber au
# milieu d'un segment : le T d'une autre piste posé sur son corps, une
# pastille qu'il traverse, le versement du net où il entre. Sur un net de signal, le bout
# se juge aussi à la cadence de sa classe : un moignon réfléchit dès que son
# aller-retour 2T_d dépasse 10 % du front (20 % : critique).
# ==========================================================================

DEPASSEMENT_MM = 0.5


def orphelins(doc, reg, unite, couches, surf, troncons):
    eps = EPS_MM
    noeuds, segs = {}, []
    for n, c, x1, y1, x2, y2, w in troncons:
        if not n or _SANS_NET.match(n):
            continue
        a = _accrocher(noeuds, c, n, x1, y1, eps)
        b = _accrocher(noeuds, c, n, x2, y2, eps)
        if a is not b:
            a[2].append(len(segs))
            b[2].append(len(segs))
            segs.append((n, c, x1, y1, x2, y2, w, a, b))
    if not segs:
        return [], {}
    # Une pastille couvre ici jusqu'à sa demi-longueur R : une piste qui
    # s'arrête au bout d'une pastille rectangulaire, hors de son cercle
    # inscrit, y est quand même reliée.
    couvert = defaultdict(list)
    for t in doc.get("pastilles") or ():
        x, y = float(t["x"]) * unite, float(t["y"]) * unite
        r = max(float(t.get("R") or t.get("r") or 0) * unite, eps)
        for cle in _cases(CASE_MM, x, y, x, y, r):
            couvert[cle].append((x, y, r, t.get("c")))
    grille = defaultdict(list)
    for k, s in enumerate(segs):
        for cle in _cases(CASE_MM, s[2], s[3], s[4], s[5], s[6] / 2):
            grille[(s[1], s[0]) + cle].append(k)
    rang = _rangs(couches)

    def attache(nd):
        x, y, lst, (c, n, _, _) = nd
        cle = (math.floor(x / CASE_MM), math.floor(y / CASE_MM))
        if any(math.hypot(x - tx, y - ty) <= r and tc in (None, c)
               for tx, ty, r, tc in couvert[cle]):
            return "pastille"
        if surf is not None and n in surf.ids and surf.lire(c, x, y)[0] == surf.ids[n]:
            return "pastille"
        # Un bout posé DANS le cuivre d'une autre piste du net y est relié,
        # même à quelques microns de son extrémité (un export qui arrondit
        # les bouts d'arcs) ; un bout qui la frôle sans y entrer ne l'est pas.
        for k in grille[(c, n) + cle]:
            if k in lst:
                continue
            _, _, x1, y1, x2, y2, w, _, _ = segs[k]
            dx, dy = x2 - x1, y2 - y1
            t = max(0.0, min(1.0, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)))
            if math.hypot(x - x1 - t * dx, y - y1 - t * dy) <= max(w / 2, eps):
                return "noeud"
        return "libre" if len(lst) == 1 else "noeud" if len(lst) >= 3 else None

    def arret(k, depart):
        """Sur le segment k parcouru depuis `depart`, (distance, quoi) du
        premier point qui retient le cuivre avant l'autre bout, ou None."""
        n, c, x1, y1, x2, y2, w, a, _ = segs[k]
        if depart is not a:
            x1, y1, x2, y2 = x2, y2, x1, y1
        L = math.hypot(x2 - x1, y2 - y1)
        ux, uy = (x2 - x1) / L, (y2 - y1) / L
        prises = []
        for cle in _cases(CASE_MM, x1, y1, x2, y2, w / 2):
            for k2 in grille.get((c, n) + cle, ()):
                if k2 == k or k2 in depart[2]:
                    continue
                for ex, ey in (segs[k2][2:4], segs[k2][4:6]):
                    s = (ex - x1) * ux + (ey - y1) * uy
                    if eps < s < L - eps and abs((ex - x1) * uy - (ey - y1) * ux) <= max(w / 2, eps):
                        prises.append((s, "noeud"))
            for tx, ty, r, tc in couvert.get(cle, ()):
                d = abs((tx - x1) * uy - (ty - y1) * ux)
                if tc in (None, c) and d <= r:
                    s = (tx - x1) * ux + (ty - y1) * uy - math.sqrt(r * r - d * d)
                    if eps < s < L - eps:
                        prises.append((s, "pastille"))
        if surf is not None and n in surf.ids:
            s = surf.np.arange(surf.pas, L - eps, surf.pas)
            dans = surf.np.nonzero(surf.lire(c, x1 + ux * s, y1 + uy * s) == surf.ids[n])[0]
            if dans.size:
                prises.append((float(s[dans[0]]), "pastille"))
        return min(prises) if prises else None

    out, vus, bilan = [], set(), {"bouts": 0}
    for nd in list(noeuds.values()):
        if len(nd[2]) != 1 or attache(nd) != "libre":
            continue
        bilan["bouts"] += 1
        c, n = nd[3][0], nd[3][1]
        long_, cur, k, fin = 0.0, nd, nd[2][0], None
        for _ in range(len(segs)):
            s = segs[k]
            prise = arret(k, cur)
            if prise:
                long_ += prise[0]
                fin = prise[1]
                break
            long_ += math.hypot(s[4] - s[2], s[5] - s[3])
            cur = s[8] if s[7] is cur else s[7]
            fin = attache(cur)
            if fin is not None:
                break
            k = cur[2][1] if cur[2][0] == k else cur[2][0]
        if fin == "libre":
            if cur[3] in vus:
                continue
            vus.add(nd[3])
        w = segs[nd[2][0]][6]
        # Plus court que le bout arrondi de la piste elle-même : un arrondi
        # d'export, pas du cuivre qui dépasse.
        if fin == "pastille" and long_ < w or fin == "noeud" and long_ < w / 2:
            bilan["bouts"] -= 1
            continue
        if fin != "libre" and _classe(doc, n) == ANTENNE:
            continue                    # une antenne est ouverte au bout
        if fin == "libre":
            base, msg = "critique", "Piste isolée de %.2f mm : reliée à rien à ses deux bouts"
        elif fin == "pastille":
            base, msg = "vigilance", ("Bout libre : %.2f mm de piste partent d'une pastille et"
                                      " ne mènent nulle part (antenne)")
        elif long_ <= max(DEPASSEMENT_MM, 2 * w):
            base, msg = "vigilance", "Dépassement de %.2f mm après un coin : du cuivre qui ne mène nulle part"
        else:
            base, msg = "vigilance", "Moignon de %.2f mm en bout de branche, ouvert à son extrémité"
        freqs = []
        if _signal(doc, n):
            i = rang.get(c)
            er = _er_entre(couches, max(i - 1, 0), i + 1) if i is not None else 4.3
            td = long_ * 1e-3 * math.sqrt(er) / C0

            def juge(f_eval, tr, td=td):
                r = 2 * td / tr
                return r, "critique" if r > 0.2 else "vigilance" if r > 0.1 else "ok"
            freqs = _par_frequence(reg, _classe(doc, n), juge, n)
        out.append({"regle": "orphelin", "severite": _pire([base] + [f["verdict"] for f in freqs]),
                    "frequences": freqs, "x": nd[0] / unite, "y": nd[1] / unite,
                    "c": c, "n": n, "msg": msg % long_})
    return out, bilan


# ==========================================================================
# CE QUE LES RÈGLES DE TOPOLOGIE PARTAGENT : le graphe d'un net
# --------------------------------------------------------------------------
# Des nœuds (couche, x, y) au pas de 20 µm, une arête par segment de piste. Un
# bout de piste posé AU MILIEU d'un autre segment du même net (un T) coupe ce
# segment : sans cela, la moitié des embranchements d'un vrai routage ne
# seraient pas des nœuds.
# ==========================================================================

GRAIN_MM = 0.02


def _graphe_topo(segs):
    """segs : [(c, x1, y1, x2, y2, w)] d'un net -> (adj {nœud: [(voisin, L)]},
    positions {nœud: (x, y)})."""
    cle = lambda c, x, y: (c, round(x / GRAIN_MM), round(y / GRAIN_MM))
    bouts = [(c, x, y) for c, x1, y1, x2, y2, w in segs for x, y in ((x1, y1), (x2, y2))]
    adj, pos = defaultdict(list), {}
    for c, x1, y1, x2, y2, w in segs:
        L = math.hypot(x2 - x1, y2 - y1)
        if L <= 0:
            continue
        ux, uy = (x2 - x1) / L, (y2 - y1) / L
        coupes = sorted({t for cb, x, y in bouts if cb == c
                         for t in [(x - x1) * ux + (y - y1) * uy]
                         if GRAIN_MM < t < L - GRAIN_MM
                         and abs((x - x1) * uy - (y - y1) * ux) <= w / 2})
        pts = [0.0] + coupes + [L]
        for t0, t1 in zip(pts, pts[1:]):
            a = cle(c, x1 + ux * t0, y1 + uy * t0)
            b = cle(c, x1 + ux * t1, y1 + uy * t1)
            if a == b:
                continue
            pos[a] = (x1 + ux * t0, y1 + uy * t0)
            pos[b] = (x1 + ux * t1, y1 + uy * t1)
            adj[a].append((b, t1 - t0))
            adj[b].append((a, t1 - t0))
    return adj, pos


# ==========================================================================
# LES MOIGNONS DE VIAS
# --------------------------------------------------------------------------
# Un via percé de L1 à L6 dont le signal n'emprunte que L1 à L3 laisse pendre
# L3 à L6 en circuit ouvert : un moignon, qui résonne au quart d'onde. On le
# garde sous λ/20 au genou (λ/10 pour condamner) -- il résonne alors cinq fois
# plus haut que le genou. La portée percée vient du document (`de`, `a` d'un
# perçage) ; absente, le via est SUPPOSÉ traversant, et le message le dit.
# Les couches empruntées : celles où une piste du net arrive dans le via. Une
# broche traversante de composant n'est pas un via de routage : pas jugée.
# Une ligne par net, sur le pire via.
# ==========================================================================

def moignons_vias(doc, couches, reg, unite, troncons):
    rang = _rangs(couches)
    cu = sorted(rang.values())
    if len(cu) < 3:
        return [], {}
    z, h = {}, 0.0                                   # cote du milieu de chaque couche
    for k, c in enumerate(couches):
        t = float(c.get("thickness") or 0)
        z[k] = h + t / 2
        h += t
    broches = defaultdict(list)
    for cp in doc.get("composants") or ():
        for b in cp.get("broches") or ():
            bx, by = float(b["x"]) * unite, float(b["y"]) * unite
            broches[(math.floor(bx / CASE_MM), math.floor(by / CASE_MM))].append((bx, by))
    bouts = defaultdict(list)
    for n, c, x1, y1, x2, y2, w in troncons:
        if rang.get(c) is not None:
            for x, y in ((x1, y1), (x2, y2)):
                for cle in _cases(CASE_MM, x, y, x, y, 0):
                    bouts[(n,) + cle].append((x, y, rang[c]))
    pires, bilan = {}, {"vias": 0}
    for t in doc.get("percages") or ():
        n = str(t.get("n") or "")
        if not _signal(doc, n):
            continue
        x, y = float(t["x"]) * unite, float(t["y"]) * unite
        if any(math.hypot(bx - x, by - y) < 0.1 for cle in _cases(CASE_MM, x, y, x, y, 0.1)
               for bx, by in broches.get(cle, ())):
            continue
        r = float(t.get("d") or 0.3) * unite / 2 + 0.1
        pris = {k for cle in _cases(CASE_MM, x, y, x, y, r)
                for bx, by, k in bouts.get((n,) + cle, ()) if math.hypot(bx - x, by - y) <= r}
        if len(pris) < 2:
            continue
        bilan["vias"] += 1
        de, a = rang.get(t.get("de")), rang.get(t.get("a"))
        suppose = de is None or a is None
        vlo, vhi = (cu[0], cu[-1]) if suppose else sorted((de, a))
        ulo, uhi = min(pris), max(pris)
        bouts_ = [(z[ulo] - z[vlo], vlo, ulo), (z[vhi] - z[uhi], uhi, vhi)]
        L, i1, i2 = max(bouts_)
        if L <= 0.05:
            continue
        er = _er_entre(couches, i1, i2)

        def juge(f_eval, tr, L=L, er=er):
            r = L / (C0 / (f_eval * math.sqrt(er)) / 20 * 1e3)
            return r, _ratio(r)
        freqs = _par_frequence(reg, _classe(doc, n), juge, n)
        sev = _pire([f["verdict"] for f in freqs])
        if sev == "ok":
            continue
        f_res = C0 / (4 * L * 1e-3 * math.sqrt(er))
        k = {"regle": "moignon_via", "severite": sev, "frequences": freqs,
             "x": x / unite, "y": y / unite,
             "c": "%s → %s" % (couches[ulo].get("name"), couches[uhi].get("name")), "n": n,
             "msg": "Moignon de %.2f mm (%s → %s inemprunté), résonance au quart d'onde à %s%s"
                    % (L, couches[i1].get("name"), couches[i2].get("name"), _hz(f_res),
                       " ; perçage supposé traversant (portée absente du document)"
                       if suppose else "")}
        poids = (("ok", "vigilance", "critique").index(sev), L)
        p0 = pires.get(n)
        if p0 is None:
            pires[n] = [poids, k, 1]
        else:
            p0[2] += 1
            if poids > p0[0]:
                p0[0], p0[1] = poids, k
    out = []
    for _, k, nb in pires.values():
        if nb > 1:
            k["msg"] += " (le pire de %d vias à moignon sur ce net)" % nb
        out.append(k)
    return out, bilan


# ==========================================================================
# LES BRANCHES EN T
# --------------------------------------------------------------------------
# Un net qui se ramifie hors pastille -- un T vers une deuxième charge --
# n'est plus une ligne : chaque branche courte pend comme un moignon, et se
# juge pareil, 2T_d / t_r face au front (10 % vigilance, 20 % critique). À
# chaque embranchement, les deux branches les plus longues font le tronc ;
# les autres sont des dérivations. Une dérivation qui finit dans le vide est
# un orphelin (règle à part) ; ici, celles qui mènent à une pastille.
# ==========================================================================

def branches_t(doc, couches, reg, unite, troncons):
    rang = _rangs(couches)
    par = defaultdict(list)
    for n, c, x1, y1, x2, y2, w in troncons:
        if _signal(doc, n):
            par[n].append((c, x1, y1, x2, y2, w))
    pads = defaultdict(list)
    for t in doc.get("pastilles") or ():
        if t.get("n"):
            pads[str(t["n"])].append((float(t["x"]) * unite, float(t["y"]) * unite,
                                      max(float(t.get("R") or t.get("r") or 0) * unite, 0.05)))
    out, bilan = [], {"embranchements": 0}
    for n, segs in par.items():
        adj, pos = _graphe_topo(segs)
        sur_pad = lambda k: any(math.hypot(pos[k][0] - x, pos[k][1] - y) <= r
                                for x, y, r in pads.get(n, ()))
        pire = None
        for k, v in adj.items():
            if len(v) < 3 or sur_pad(k):
                continue
            bilan["embranchements"] += 1
            branches = []
            for b, L in v:
                prec, cur, tot = k, b, L
                while len(adj[cur]) == 2 and not sur_pad(cur):
                    nxt, dl = next((q, d) for q, d in adj[cur] if q != prec)
                    prec, cur, tot = cur, nxt, tot + dl
                    if cur == k:
                        break
                branches.append((tot, sur_pad(cur)))
            branches.sort(reverse=True)
            derivs = [L for L, pad in branches[2:] if pad]
            if not derivs:
                continue
            L = max(derivs)
            i = rang.get(k[0])
            er = _er_entre(couches, max(i - 1, 0), i + 1) if i is not None else 4.3
            td = L * 1e-3 * math.sqrt(er) / C0

            def juge(f_eval, tr, td=td):
                r = 2 * td / tr
                return r, "critique" if r > 0.2 else "vigilance" if r > 0.1 else "ok"
            freqs = _par_frequence(reg, _classe(doc, n), juge, n)
            sev = _pire([f["verdict"] for f in freqs])
            if sev != "ok" and (pire is None or L > pire[0]):
                pire = (L, k, freqs, sev, len(v))
        if pire:
            L, k, freqs, sev, nb = pire
            out.append({"regle": "branche", "severite": sev, "frequences": freqs,
                        "x": pos[k][0] / unite, "y": pos[k][1] / unite, "c": k[0], "n": n,
                        "msg": "Embranchement en T hors pastille (%d branches) : une dérivation"
                               " de %.1f mm vers une charge pend comme un moignon ; routez en"
                               " chaîne (daisy chain) ou terminez" % (nb, L)})
    return out, bilan


# ==========================================================================
# LES QUARTZ
# --------------------------------------------------------------------------
# Un quartz se tient tout contre son oscillateur : pistes courtes (10 mm en
# vigilance, 25 mm critique, règle de pouce des notes d'application), et
# rien d'autre que la masse dessous ni tout autour -- une piste qui passe y
# injecte son bruit dans un circuit à gain élevé et à très haute impédance.
# Quartz : repère Y, XT, XTAL (ou X, G avec une valeur en Hz), et deux
# broches de signal.
# ==========================================================================

RE_QUARTZ = re.compile(r"^(Y|XT|XTAL)\d", re.IGNORECASE)
# X (aussi un connecteur) et G (oscillateur, CEI) : quartz seulement si la
# valeur le dit. Un filtre SAW (FLT, 868 MHz) n'en est pas un.
RE_QUARTZ_SI_VALEUR = re.compile(r"^(X|G)\d", re.IGNORECASE)
RE_VAL_QUARTZ = re.compile(r"\d\s*(k|M)Hz|quartz|crystal|xtal", re.IGNORECASE)
QUARTZ_VIGILANCE_MM, QUARTZ_CRITIQUE_MM = 10.0, 25.0
QUARTZ_MARGE_MM = 1.0


def quartz(doc, couches, unite, troncons, surf):
    longueur = defaultdict(float)
    for n, c, x1, y1, x2, y2, w in troncons:
        longueur[n] += math.hypot(x2 - x1, y2 - y1)
    out, bilan = [], {"quartz": 0}
    for cp in doc.get("composants") or ():
        ref, br = str(cp.get("ref") or ""), cp.get("broches") or []
        if not (RE_QUARTZ.match(ref) or (RE_QUARTZ_SI_VALEUR.match(ref)
                                         and RE_VAL_QUARTZ.search(str(cp.get("val") or "")))):
            continue
        sig = sorted({str(b.get("n") or "") for b in br if _signal(doc, str(b.get("n") or ""))})
        if len(sig) != 2:
            continue
        bilan["quartz"] += 1
        xs = [float(b["x"]) * unite for b in br]
        ys = [float(b["y"]) * unite for b in br]
        x0, x1_, y0, y1_ = (min(xs) - QUARTZ_MARGE_MM, max(xs) + QUARTZ_MARGE_MM,
                            min(ys) - QUARTZ_MARGE_MM, max(ys) + QUARTZ_MARGE_MM)
        cx, cy = (x0 + x1_) / 2, (y0 + y1_) / 2
        base = {"x": cx / unite, "y": cy / unite, "c": str(cp.get("c") or ""), "n": sig[0],
                "frequences": []}
        L = max(longueur[n] for n in sig)
        if L > QUARTZ_VIGILANCE_MM:
            out.append(dict(base, regle="quartz",
                            severite="critique" if L > QUARTZ_CRITIQUE_MM else "vigilance",
                            msg="%s : %.1f mm de piste sur %s entre le quartz et son"
                                " oscillateur (%s) ; rapprochez-le à moins de %.0f mm"
                                % (ref, L, max(sig, key=lambda n: longueur[n]),
                                   " / ".join(sig), QUARTZ_VIGILANCE_MM)))
        dessous = set()
        for n, c, xa, ya, xb, yb, w in troncons:
            if n in sig or not n or _SANS_NET.match(n) or _classe(doc, n) == "Masse":
                continue
            if max(xa, xb) >= x0 and min(xa, xb) <= x1_ and max(ya, yb) >= y0 and min(ya, yb) <= y1_:
                m = max(2, int(math.hypot(xb - xa, yb - ya) / 0.1))
                if any(x0 <= xa + (xb - xa) * s / m <= x1_ and y0 <= ya + (yb - ya) * s / m <= y1_
                       for s in range(m + 1)):
                    dessous.add(n)
        if surf is not None:
            for c, img in surf.images.items():
                g = int(surf.lire(c, cx, cy)[0])
                nom = next((nm for nm, v in surf.ids.items() if v == g), None) if g > 0 else None
                if nom and nom not in sig and _classe(doc, nom) != "Masse":
                    dessous.add("%s (plan %s)" % (nom, c))
        if dessous:
            out.append(dict(base, regle="quartz", severite="vigilance",
                            msg="%s : %s passe%s sous le quartz ou à moins de %.0f mm ; ne"
                                " laissez que la masse" % (ref, ", ".join(sorted(dessous)[:5]),
                                                            "nt" if len(dessous) > 1 else "",
                                                            QUARTZ_MARGE_MM)))
    return out, bilan


# ==========================================================================
# LA PROTECTION ESD AU PIED DES CONNECTEURS
# --------------------------------------------------------------------------
# Chaque signal qui sort par un connecteur doit trouver, tout près de la
# broche (10 mm), une protection vers la masse : diode, TVS, réseau ESD
# (repère D, TVS, ESD, Z, ou valeur PESD, USBLC, SMAJ…). Un connecteur dont
# AUCUN signal n'est protégé est sans doute interne (programmation, nappe) :
# info. Un connecteur protégé en partie, ou protégé trop loin : vigilance.
# ==========================================================================

RE_PROTECTION = re.compile(r"^(D|TVS|ESD|Z|DZ)\d", re.IGNORECASE)
RE_VAL_PROTECTION = re.compile(r"ESD|TVS|PESD|USBLC|SMAJ|SMBJ|SMF|PRTR|TPD\d|IP4|RCLAMP|"
                               r"SP05|NUP|CDSOT|ESDA", re.IGNORECASE)
ESD_MM = 10.0


def esd(doc, unite):
    comps = [c for c in doc.get("composants") or () if isinstance(c, dict)]
    gardes = defaultdict(list)                 # net -> [(x, y, ref)] broches de protection
    for cp in comps:
        ref = str(cp.get("ref") or "")
        if not (RE_PROTECTION.match(ref) or RE_VAL_PROTECTION.search(str(cp.get("val") or ""))):
            continue
        br = cp.get("broches") or []
        if not any(_classe(doc, str(b.get("n") or "")) == "Masse" for b in br):
            continue
        for b in br:
            n = str(b.get("n") or "")
            if n and _classe(doc, n) != "Masse":
                gardes[n].append((float(b["x"]) * unite, float(b["y"]) * unite, ref))
    out, bilan = [], {"connecteurs": 0}
    for cp in comps:
        ref = str(cp.get("ref") or "")
        if not RE_CONNECTEUR.match(ref):
            continue
        sig = [(b, str(b.get("n") or "")) for b in cp.get("broches") or ()
               if _signal(doc, str(b.get("n") or ""))]
        if not sig:
            continue
        bilan["connecteurs"] += 1
        nus, loin, bons = [], [], 0
        for b, n in sig:
            bx, by = float(b["x"]) * unite, float(b["y"]) * unite
            g = min(((math.hypot(bx - x, by - y), r) for x, y, r in gardes.get(n, ())),
                    default=None)
            if g is None:
                nus.append(n)
            elif g[0] > ESD_MM:
                loin.append("%s à %.0f mm (%s)" % (g[1], g[0], n))
            else:
                bons += 1
        if not nus and not loin:
            continue
        b0 = sig[0][0]
        sev = "info" if not bons and not loin else "vigilance"
        msg = "%s : " % ref
        if nus:
            msg += "pas de protection ESD vers la masse sur %s%s" % (
                ", ".join(sorted(set(nus))[:6]), "…" if len(set(nus)) > 6 else "")
        if loin:
            msg += ("%sprotection trop loin de la broche : %s" % (" ; " if nus else "",
                                                                 ", ".join(loin[:4])))
        if sev == "info":
            msg += " — aucun signal protégé : connecteur interne ?"
        out.append({"regle": "esd", "severite": sev, "frequences": [],
                    "x": float(b0["x"]), "y": float(b0["y"]), "c": str(cp.get("c") or ""),
                    "n": sig[0][1], "msg": msg})
    return out, bilan


# ==========================================================================
# LE COURANT FACE À LA LARGEUR
# --------------------------------------------------------------------------
# Chaque rail (alimentation, nœud de découpage) passe par sa piste la plus
# étroite. Ce qu'elle tient se lit par IPC-2221 (ΔT = 10 K, couche externe
# ou interne) : c'est plus prudent que l'étalement que résout l'onglet Chute
# DC, qui reste l'outil pour un chiffre précis. Avec un courant donné par
# rail (`courants` du document, en A), verdict : au-delà de ce que la piste
# tient à +10 K, vigilance ; à +20 K, critique. Sans courant, on signale
# l'étranglement en info : une piste plus de deux fois plus étroite que le
# reste du rail, qui porte pourtant tout son courant -- et ce qu'elle tient.
# ==========================================================================

COURANT_DT_VIGILANCE, COURANT_DT_CRITIQUE = 10.0, 20.0
ETRANGLEMENT = 0.5


def _i_max(w_mm, t_mm, externe, dt):
    """Le courant qu'une piste tient à +dt kelvins, IPC-2221."""
    try:
        import dc_solver
        k = dc_solver.IPC2221_K_EXT if externe else dc_solver.IPC2221_K_INT
        mils2 = dc_solver.MILS2_PAR_MM2
    except Exception:                                   # noqa: BLE001
        k, mils2 = (0.048 if externe else 0.024), 1.0 / 0.0254 ** 2
    return k * dt ** 0.44 * (w_mm * t_mm * mils2) ** 0.725


def courants(doc, couches, unite, troncons):
    rang = _rangs(couches)
    cu = sorted(rang.values())
    donnes = {str(k): float(v) for k, v in (doc.get("courants") or {}).items()
              if v is not None and float(v) > 0}
    par = defaultdict(lambda: defaultdict(float))
    ou = {}
    for n, c, x1, y1, x2, y2, w in troncons:
        if not n or _classe(doc, n) not in ("Alimentation", "Découpage") or w <= 0:
            continue
        L = math.hypot(x2 - x1, y2 - y1)
        par[n][(round(w, 3), c)] += L
        cle = (n, round(w, 3), c)
        if L > ou.get(cle, (0,))[0]:
            ou[cle] = (L, (x1 + x2) / 2, (y1 + y2) / 2)
    out, bilan = [], {"rails": 0}
    if donnes:              # que le rapport dise qu'un courant a été jugé, même sans constat
        bilan["courants_donnes"] = sum(1 for n in donnes if n in par)
    for n, largeurs in par.items():
        bilan["rails"] += 1
        tot = sum(largeurs.values())
        (w_min, c_min), l_min = min(largeurs.items(), key=lambda kv: kv[0][0])
        w_dom = max(largeurs.items(), key=lambda kv: kv[1])[0][0]
        i = rang.get(c_min)
        t = float(couches[i].get("thickness") or 0.035) if i is not None else 0.035
        externe = i is None or not cu or i in (cu[0], cu[-1])
        i10 = _i_max(w_min, t, externe, COURANT_DT_VIGILANCE)
        i20 = _i_max(w_min, t, externe, COURANT_DT_CRITIQUE)
        _, x, y = ou[(n, w_min, c_min)]
        base = {"regle": "courant", "frequences": [], "x": x / unite, "y": y / unite,
                "c": c_min, "n": n}
        if n in donnes:
            I = donnes[n]
            if I > i10:
                out.append(dict(base, severite="critique" if I > i20 else "vigilance",
                                msg="%.2f A dans une piste de %.2f mm (%s, %.0f µm) : elle"
                                    " tient %.2f A à +10 °C, %.2f A à +20 °C (IPC-2221) ;"
                                    " élargissez-la ou doublez-la"
                                    % (I, w_min, c_min, t * 1e3, i10, i20)))
        elif w_min < ETRANGLEMENT * w_dom and l_min < 0.5 * tot:
            out.append(dict(base, severite="info",
                            msg="Étranglement : %.1f mm de piste à %.2f mm sur un rail tiré à"
                                " %.2f mm ; tout le courant y passe, et elle ne tient que"
                                " %.2f A à +10 °C (IPC-2221). Pour le chiffre exact, onglet"
                                " Chute DC" % (l_min, w_min, w_dom, i10)))
    return out, bilan


FORMAT = "cao-analyse-carte-1"


class ErreurAnalyse(Exception):
    """Document refusé : le message part tel quel vers la page."""


def analyser_document(doc):
    """Le document d'un des deux outils -> {constats, compte, ...}."""
    if not isinstance(doc, dict) or doc.get("format") != FORMAT:
        raise ErreurAnalyse("Format inattendu : « %s » au lieu de « %s »."
                            % ((doc or {}).get("format") if isinstance(doc, dict) else "?",
                               FORMAT))
    listes = [doc.get(k) or [] for k in ("pistes", "arcs", "pastilles")]
    try:
        unite = float(doc.get("unite_mm") or 1.0)
    except (TypeError, ValueError):
        unite = float("nan")
    if not all(isinstance(l, list) for l in listes) or not (0 < unite < 1e3):
        raise ErreurAnalyse("Document mal formé : pistes, arcs et pastilles sont"
                            " des listes, unite_mm un nombre positif.")
    notes, bilan, durees = [], {}, {}
    antennes = sorted(n for n, c in (doc.get("natures") or {}).items() if c == ANTENNE)
    if antennes:
        notes.append("Classés Antenne, jugés en fabrication seulement (angles, détourage,"
                     " piste isolée) : %s." % ", ".join(antennes))
    # `regles` : la liste des règles à faire tourner, toutes à défaut. Le
    # panneau Crosstalk n'y met que « diaphonie » : la carte entière, sous son
    # front global, sans attendre les angles, les impédances ni les retours.
    regles = set(str(x) for x in (doc.get("regles") or ()) if x)
    voulue = (lambda r: not regles or r in regles)
    try:
        t0 = time.perf_counter()
        angulaires = {"aigu", "angle_droit", "jonction", "hors_45"}
        constats = ([k for k in angles(*listes, unite_mm=unite)
                     if voulue(k["regle"])]
                    if not regles or regles & angulaires else [])
        reg = _reglages(doc)
        couches = (doc.get("stackup") or {}).get("layers") or []
        troncons = _troncons(doc, unite)
        surf = _surfaces(doc, unite, notes)
        durees["angles et surfaces"] = time.perf_counter() - t0
        etapes = [("orphelin", lambda: orphelins(doc, reg, unite, couches, surf, troncons)),
                  ("quartz", lambda: quartz(doc, couches, unite, troncons, surf)),
                  ("esd", lambda: esd(doc, unite)),
                  ("courant", lambda: courants(doc, couches, unite, troncons)),
                  ("decouplage", lambda: decouplages(doc, couches, reg, unite, notes, troncons,
                                                       se))]
        se = xt = None
        if not couches:
            notes.append("Pas d'empilage dans le document : empilage, impédances, chemins de"
                         " retour, fentes, coutures, diaphonie, bord de carte et paires"
                         " différentielles non vérifiés.")
        else:
            if voulue("empilage"):
                constats += empilage(doc, couches)
            se, xt = _moteurs(notes)
            if se:
                etapes += [
                    ("retour", lambda: retours(doc, couches, reg, unite, notes, se)),
                    ("diaphonie", lambda: diaphonie(doc, couches, reg, unite, notes, se, xt,
                                                     troncons)),
                    ("impedance", lambda: impedances(doc, couches, reg, unite, notes, se, troncons,
                                                     surf)),
                    ("bord", lambda: bords(doc, couches, reg, unite, notes, se, troncons, surf)),
                    ("paire", lambda: paires_diff(doc, couches, reg, unite, notes, se, troncons,
                                                  surf)),
                    ("moignon_via", lambda: moignons_vias(doc, couches, reg, unite, troncons)),
                    ("branche", lambda: branches_t(doc, couches, reg, unite, troncons))]
                if surf is not None:
                    etapes += [
                        ("fente", lambda: fentes(doc, couches, reg, unite, notes, surf, troncons)),
                        ("couture", lambda: coutures(doc, couches, reg, unite, notes, surf))]
                else:
                    notes.append("Pas de plans ni de versements dans le document : fentes et"
                                 " vias de couture non vérifiés.")
        for regle, etape in etapes:
            if not voulue(regle):
                continue
            t0 = time.perf_counter()
            k, b = etape()
            durees[regle] = time.perf_counter() - t0
            constats += k
            if b:
                bilan[regle] = b
    except (KeyError, TypeError, ValueError, IndexError) as exc:
        raise ErreurAnalyse("Document mal formé : %s" % exc)
    constats.sort(key=lambda k: _ORDRE.index(k["severite"]))
    return {"format": FORMAT, "constats": constats,
            "compte": {s: sum(k["severite"] == s for k in constats) for s in _ORDRE},
            "pistes": len(listes[0]), "tolerance_deg": TOL_DEG,
            "reglages": reg, "bilan": bilan, "notes": notes,
            "durees_s": {k: round(v, 2) for k, v in durees.items()}}


# Genre d'une couche : même lecture que mdlGenre (visionneuse, 02-modele.js).
# Le type déclaré tranche ; sans lui, le nom. Hors empilage : pas du cuivre.
_TYPE_CUIVRE = re.compile(r"CONDUCTOR|SIGNAL|PLANE|POWER|GROUND|MIXED")
_NOM_PAS_CUIVRE = re.compile(
    r"SILK|LEGEND|SERIGRAPH|NOMENCLATURE|MASK|RESIST|VERNIS|PASTE|CREAM|STENCIL|"
    r"ETAIN|DRILL|HOLE|PERCAGE|DIELECTRIC|PREPREG|DIELECTRIQUE|OUTLINE|PROFILE|"
    r"CONTOUR|BOARD|EDGE|MECA|DIMENSION|ASSEMB|DOC|FAB")


def _couches_cuivre(m):
    cuivre = set()
    for e in m.get("empilage") or []:
        t = str(e.get("type") or "").upper()
        nom = str(e.get("nom") or "")
        if (_TYPE_CUIVRE.search(t) if t and t != "UNKNOWN"
                else not _NOM_PAS_CUIVRE.search(nom.upper())):
            cuivre.add(nom)
    return {i for i, nom in enumerate(m.get("couches") or []) if nom in cuivre}


def _rayon_inscrit(forme, d):
    """Le plus grand cercle centré dans la pastille : un point dedans est
    dans son cuivre, quelle que soit la rotation."""
    if forme.get("d"):
        return forme["d"] / 2
    if forme.get("w") and forme.get("h"):
        return min(forme["w"], forme["h"]) / 2
    return (d or 0) / 2      # polygone, forme utilisateur : la taille du padstack


def analyser_modele(m):
    """Constats d'angles d'un modèle de visionneuse (ipc2581_json)."""
    cuivre = _couches_cuivre(m)
    rang = {nom: i for i, nom in enumerate(m.get("couches") or [])}
    formes, padstacks = m.get("formes") or {}, m.get("padstacks") or {}
    pastilles = [{"x": t["x"], "y": t["y"], "r": (t.get("d") or 0) / 2}
                 for t in m.get("percages") or []]
    for p in m.get("pads") or []:
        for couche in (padstacks.get(p.get("ps")) or {}).get("pads") or []:
            if rang.get(couche.get("c")) in cuivre:
                pastilles.append({"x": p["x"], "y": p["y"], "c": rang[couche["c"]],
                                  "r": _rayon_inscrit(formes.get(couche.get("f")) or {},
                                                      couche.get("d"))})
    unite = 25.4 if str(m.get("unites") or "").upper().startswith("INCH") else 1.0
    return angles([p for p in m.get("pistes") or [] if p.get("c") in cuivre],
                  [a for a in m.get("arcs") or [] if a.get("c") in cuivre],
                  pastilles, unite)


if __name__ == "__main__":
    import sys
    from collections import Counter
    import ipc2581_json

    with open(sys.argv[1], "rb") as f:
        m = ipc2581_json.ipc2581_en_dict(f.read(), sys.argv[1])
    res = analyser_modele(m)
    print(dict(Counter(k["regle"] for k in res)))
    for k in res[:int(sys.argv[2]) if len(sys.argv) > 2 else 20]:
        net = m["nets"][k["n"]] if isinstance(k["n"], int) and 0 <= k["n"] < len(m["nets"]) else k["n"]
        couche = m["couches"][k["c"]] if isinstance(k["c"], int) and 0 <= k["c"] < len(m["couches"]) else k["c"]
        print("%-9s %-11s %-12s %-14s (%.3f, %.3f)  %s"
              % (k["severite"], k["regle"], couche, net, k["x"], k["y"], k["msg"]))
