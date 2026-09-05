#!/usr/bin/python3
# -*- coding: utf-8 -*-
"""
Module de calcul de la qualité de placement PCB pour WEB_CAO.
Bibliothèque standard uniquement (math, re, collections, typing).

Métriques calculées :
1. HPWL (Half-Perimeter Wirelength) : estimation de la longueur minimale de cuivre.
2. Détection des 5 composants qui étirent le plus le chevelu (worst contributors).
3. Carte de congestion spatiale (grille 5 mm) et localisation du point chaud (hotspot).
4. Proximité des condensateurs de découplage par rapport aux circuits intégrés.
5. Recommandation d'ordre de placement par niveaux (Tiers 1 à 4).
"""

from collections import defaultdict
import math
import re
from typing import Any, Dict, List, Optional, Tuple

_RE_POWER_NET = re.compile(
    r"VCC|VDD|VEE|VBAT|3V3|3\.3V|5V|12V|\bPWR\b|AVCC|DVCC|\+V", re.IGNORECASE
)
_RE_GROUND_NET = re.compile(
    r"GND|AGND|DGND|VSS|0V", re.IGNORECASE
)

# Préfixes de repères pour la classification par tiers
_RE_TIER_ANCHOR = re.compile(r"^(J|P|CONN|USB|SMA|HEADER|H|MH|TP)\d*", re.IGNORECASE)
_RE_TIER_SEMI_FIXED = re.compile(r"^(U|IC|VR|REG|Q|T)\d*", re.IGNORECASE)
_RE_TIER_FLEXIBLE = re.compile(r"^(Y|X|OSC|K|RLY|L|TRANS)\d*", re.IGNORECASE)


def calculer_hpwl(footprints: List[Dict[str, Any]]) -> Tuple[float, Dict[str, float]]:
    """Calcule le HPWL (Half-Perimeter Wirelength) total et par net.

    Pour chaque net ayant au moins 2 pastilles :
    HPWL = (X_max - X_min) + (Y_max - Y_min)
    """
    net_pads: Dict[str, List[Tuple[float, float]]] = defaultdict(list)

    for fp in footprints:
        pads = fp.get("pads", [])
        for pad in pads:
            net = pad.get("net")
            if not net or _RE_GROUND_NET.search(net):
                # On exclut la masse générale du HPWL car elle est généralement
                # absorbée par un plan de cuivre et fausserait la mesure
                continue
            x = float(pad.get("x", 0.0))
            y = float(pad.get("y", 0.0))
            net_pads[net].append((x, y))

    total_hpwl = 0.0
    hpwl_par_net: Dict[str, float] = {}

    for net, coords in net_pads.items():
        if len(coords) < 2:
            continue
        xs = [c[0] for c in coords]
        ys = [c[1] for c in coords]
        dx = max(xs) - min(xs)
        dy = max(ys) - min(ys)
        score = dx + dy
        hpwl_par_net[net] = score
        total_hpwl += score

    return round(total_hpwl, 2), hpwl_par_net


def top_contributeurs_hpwl(
    footprints: List[Dict[str, Any]],
    n: int = 5
) -> List[Dict[str, Any]]:
    """Identifie les composants dont les connexions sont les plus étirées

    Pour chaque composant, calcule la distance moyenne entre sa position
    et le barycentre de chacun des nets auxquels il est raccordé.
    """
    net_pads: Dict[str, List[Tuple[str, float, float]]] = defaultdict(list)
    fp_positions: Dict[str, Tuple[float, float]] = {}

    for fp in footprints:
        ref = fp.get("ref", "")
        if not ref:
            continue
        fx = float(fp.get("x", 0.0))
        fy = float(fp.get("y", 0.0))
        fp_positions[ref] = (fx, fy)

        pads = fp.get("pads", [])
        for pad in pads:
            net = pad.get("net")
            if not net or _RE_GROUND_NET.search(net):
                continue
            px = float(pad.get("x", fx))
            py = float(pad.get("y", fy))
            net_pads[net].append((ref, px, py))

    # Calcul du barycentre de chaque net
    net_centroids: Dict[str, Tuple[float, float]] = {}
    for net, pads in net_pads.items():
        if len(pads) >= 2:
            avg_x = sum(p[1] for p in pads) / len(pads)
            avg_y = sum(p[2] for p in pads) / len(pads)
            net_centroids[net] = (avg_x, avg_y)

    # Écart moyen de chaque composant par rapport aux barycentres
    fp_displacements: Dict[str, float] = {}
    for ref, (fx, fy) in fp_positions.items():
        connected_nets = [
            net for net, pads in net_pads.items()
            if any(p[0] == ref for p in pads) and net in net_centroids
        ]
        if not connected_nets:
            continue
        total_d = sum(
            math.hypot(fx - net_centroids[net][0], fy - net_centroids[net][1])
            for net in connected_nets
        )
        fp_displacements[ref] = total_d / len(connected_nets)

    trie = sorted(fp_displacements.items(), key=lambda kv: kv[1], reverse=True)[:n]
    return [
        {"ref": ref, "deplacement_moyen_mm": round(dist, 2)}
        for ref, dist in trie
    ]


def analyser_congestion(
    footprints: List[Dict[str, Any]],
    board: Optional[Dict[str, Any]] = None,
    grille_mm: float = 5.0
) -> Dict[str, Any]:
    """Découpe la carte en cellules de grille_mm x grille_mm et compte la densité

    Renvoie le pic de densité et les coordonnées (x, y) du hotspot.
    """
    if not footprints:
        return {
            "peak_density": 0,
            "hotspot_x": 0.0,
            "hotspot_y": 0.0,
            "cell_size_mm": grille_mm
        }

    # Bounding box
    if board and "w" in board and "h" in board:
        min_x = float(board.get("x", 0.0))
        min_y = float(board.get("y", 0.0))
    else:
        xs = [float(fp.get("x", 0.0)) for fp in footprints]
        ys = [float(fp.get("y", 0.0)) for fp in footprints]
        min_x = min(xs) if xs else 0.0
        min_y = min(ys) if ys else 0.0

    cells: Dict[Tuple[int, int], int] = defaultdict(int)
    for fp in footprints:
        # On compte les pastilles si disponibles, sinon le composant lui-même
        pads = fp.get("pads", [])
        if pads:
            for pad in pads:
                px = float(pad.get("x", 0.0))
                py = float(pad.get("y", 0.0))
                cx = int(math.floor((px - min_x) / grille_mm))
                cy = int(math.floor((py - min_y) / grille_mm))
                cells[(cx, cy)] += 1
        else:
            fx = float(fp.get("x", 0.0))
            fy = float(fp.get("y", 0.0))
            cx = int(math.floor((fx - min_x) / grille_mm))
            cy = int(math.floor((fy - min_y) / grille_mm))
            cells[(cx, cy)] += 1

    if not cells:
        return {
            "peak_density": 0,
            "hotspot_x": round(min_x, 2),
            "hotspot_y": round(min_y, 2),
            "cell_size_mm": grille_mm
        }

    peak_cell = max(cells.keys(), key=lambda k: cells[k])
    peak_count = cells[peak_cell]
    hotspot_x = min_x + (peak_cell[0] + 0.5) * grille_mm
    hotspot_y = min_y + (peak_cell[1] + 0.5) * grille_mm

    return {
        "peak_density": peak_count,
        "hotspot_x": round(hotspot_x, 2),
        "hotspot_y": round(hotspot_y, 2),
        "cell_size_mm": grille_mm
    }


def analyser_decouplage(
    footprints: List[Dict[str, Any]],
    distance_cible_mm: float = 3.5
) -> Dict[str, Any]:
    """Analyse la proximité des condensateurs de découplage par rapport aux CI.

    Détecte les CI (U..., IC... ou >= 4 broches) et les condensateurs (C... avec <= 3 broches).
    Pour chaque condensateur relié à un rail d'alimentation VCC/3V3/etc.,
    cherche la broche d'alimentation de CI la plus proche sur le même net.
    """
    ic_power_pads: List[Dict[str, Any]] = []
    cap_power_pads: List[Dict[str, Any]] = []

    for fp in footprints:
        ref = fp.get("ref", "")
        pads = fp.get("pads", [])
        nb_pads = len(pads)

        is_ic = bool(_RE_TIER_SEMI_FIXED.match(ref) or nb_pads >= 8)
        is_cap = bool(ref.upper().startswith("C") and nb_pads <= 3)

        for pad in pads:
            net = pad.get("net", "")
            if not net:
                continue
            if _RE_POWER_NET.search(net) and not _RE_GROUND_NET.search(net):
                px = float(pad.get("x", fp.get("x", 0.0)))
                py = float(pad.get("y", fp.get("y", 0.0)))
                pad_info = {
                    "ref": ref,
                    "pad": pad.get("n", 1),
                    "net": net,
                    "x": px,
                    "y": py
                }
                if is_ic:
                    ic_power_pads.append(pad_info)
                elif is_cap:
                    cap_power_pads.append(pad_info)

    if not cap_power_pads or not ic_power_pads:
        return {
            "mean_dist_mm": None,
            "conform_pct": 100.0 if not cap_power_pads else 0.0,
            "total_caps_decouplage": len(cap_power_pads),
            "details": []
        }

    details = []
    distances = []

    for cap in cap_power_pads:
        c_net = cap["net"]
        c_x, c_y = cap["x"], cap["y"]

        # Cherche le CI sur le même net le plus proche
        candidats = [ic for ic in ic_power_pads if ic["net"] == c_net]
        if not candidats:
            continue

        plus_proche = min(
            candidats,
            key=lambda ic: math.hypot(c_x - ic["x"], c_y - ic["y"])
        )
        dist = math.hypot(c_x - plus_proche["x"], c_y - plus_proche["y"])
        dist_arr = round(dist, 2)
        distances.append(dist)

        details.append({
            "cap_ref": cap["ref"],
            "ic_ref": plus_proche["ref"],
            "net": c_net,
            "dist_mm": dist_arr,
            "conforme": dist <= distance_cible_mm,
            "cap_pos": (round(c_x, 2), round(c_y, 2)),
            "ic_pos": (round(plus_proche["x"], 2), round(plus_proche["y"], 2))
        })

    if distances:
        mean_d = round(sum(distances) / len(distances), 2)
        conformes = sum(1 for d in distances if d <= distance_cible_mm)
        pct = round((conformes / len(distances)) * 100.0, 1)
    else:
        mean_d = None
        pct = 100.0

    return {
        "mean_dist_mm": mean_d,
        "conform_pct": pct,
        "total_caps_decouplage": len(details),
        "details": details
    }


def ordonnancer_placement(footprints: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Classe les composants par priorité de placement (Tiers 1 à 4)

    Tier 1 : Ancres (connecteurs, trous de montage, fixations)
    Tier 2 : Actifs critiques (CI, régulateurs, transistors de puissance)
    Tier 3 : Flexibles (quartz, relais, transformateurs, inductances)
    Tier 4 : Libres (résistances, capas, diodes)
    """
    tiers: Dict[str, List[str]] = {
        "anchor": [],
        "semi_fixed": [],
        "flexible": [],
        "free": []
    }

    for fp in footprints:
        ref = fp.get("ref", "")
        if not ref:
            continue

        if _RE_TIER_ANCHOR.match(ref):
            tiers["anchor"].append(ref)
        elif _RE_TIER_SEMI_FIXED.match(ref):
            tiers["semi_fixed"].append(ref)
        elif _RE_TIER_FLEXIBLE.match(ref):
            tiers["flexible"].append(ref)
        else:
            tiers["free"].append(ref)

    # Tri alphabétique dans chaque catégorie
    for k in tiers:
        tiers[k].sort()

    return {
        "tiers": tiers,
        "counts": {k: len(v) for k, v in tiers.items()}
    }


def _segments_croisent(
    p1: Tuple[float, float], p2: Tuple[float, float],
    p3: Tuple[float, float], p4: Tuple[float, float]
) -> bool:
    """Vérifie si deux segments 2D [p1, p2] et [p3, p4] se croisent strictement."""
    x1, y1 = p1
    x2, y2 = p2
    x3, y3 = p3
    x4, y4 = p4

    tol = 1e-4
    if ((abs(x1 - x3) < tol and abs(y1 - y3) < tol) or
        (abs(x1 - x4) < tol and abs(y1 - y4) < tol) or
        (abs(x2 - x3) < tol and abs(y2 - y3) < tol) or
        (abs(x2 - x4) < tol and abs(y2 - y4) < tol)):
        return False

    def ccw(ax, ay, bx, by, cx, cy):
        return (cy - ay) * (bx - ax) > (by - ay) * (cx - ax)

    return (ccw(x1, y1, x3, y3, x4, y4) != ccw(x2, y2, x3, y3, x4, y4)) and \
           (ccw(x1, y1, x2, y2, x3, y3) != ccw(x1, y1, x2, y2, x4, y4))


def evaluer_rotation_composant(
    ref: str,
    footprints: List[Dict[str, Any]]
) -> Optional[Dict[str, Any]]:
    """Évalue les 4 rotations (0°, 90°, 180°, 270°) d'un composant pour minimiser les croisements."""
    target_fp = next((f for f in footprints if f.get("ref") == ref), None)
    if not target_fp:
        return None

    pads_target = target_fp.get("pads", [])
    connected_pads = [p for p in pads_target if p.get("net")]
    if len(connected_pads) < 2:
        return None

    fx = float(target_fp.get("x", 0.0))
    fy = float(target_fp.get("y", 0.0))
    frot = float(target_fp.get("rot", 0.0)) % 360

    # Pastilles locales (lx, ly)
    a_cur = math.radians(frot)
    pads_loc = []
    for p in connected_pads:
        if "lx" in p and "ly" in p:
            lx, ly = float(p["lx"]), float(p["ly"])
        else:
            px, py = float(p.get("x", fx)), float(p.get("y", fy))
            # Dé-rotation
            dx = px - fx
            dy = py - fy
            lx = dx * math.cos(-a_cur) - dy * math.sin(-a_cur)
            ly = dx * math.sin(-a_cur) + dy * math.cos(-a_cur)
        pads_loc.append({
            "n": p.get("n", 1),
            "net": p.get("net"),
            "lx": lx,
            "ly": ly
        })

    # Indexation des pastilles externes par net
    ext_pads_by_net: Dict[str, List[Tuple[float, float]]] = defaultdict(list)
    for fp in footprints:
        if fp.get("ref") == ref:
            continue
        for p in fp.get("pads", []):
            net = p.get("net")
            if net:
                ext_pads_by_net[net].append((float(p.get("x", 0.0)), float(p.get("y", 0.0))))

    angles_eval = [0, 90, 180, 270]
    resultats_angles = []

    for angle in angles_eval:
        a_rad = math.radians(angle)
        cos_a = math.cos(a_rad)
        sin_a = math.sin(a_rad)

        segments = []
        longueur_totale = 0.0

        for p in pads_loc:
            net = p["net"]
            targets = ext_pads_by_net.get(net, [])
            if not targets:
                continue

            wx = fx + p["lx"] * cos_a - p["ly"] * sin_a
            wy = fy + p["lx"] * sin_a + p["ly"] * cos_a

            # Cible la plus proche
            best_t = min(targets, key=lambda t: math.hypot(wx - t[0], wy - t[1]))
            dist_t = math.hypot(wx - best_t[0], wy - best_t[1])
            longueur_totale += dist_t
            segments.append({
                "p1": (wx, wy),
                "p2": best_t,
                "net": net
            })

        # Compter les croisements entre segments de nets différents
        nb_croisements = 0
        n_seg = len(segments)
        for i in range(n_seg):
            for j in range(i + 1, n_seg):
                if segments[i]["net"] != segments[j]["net"]:
                    if _segments_croisent(segments[i]["p1"], segments[i]["p2"],
                                          segments[j]["p1"], segments[j]["p2"]):
                        nb_croisements += 1

        score = nb_croisements * 1000.0 + longueur_totale
        resultats_angles.append({
            "angle": angle,
            "croisements": nb_croisements,
            "longueur_mm": round(longueur_totale, 2),
            "score": round(score, 2)
        })

    # Trouver l'angle optimal
    meilleur = min(resultats_angles, key=lambda r: r["score"])
    actuel = next((r for r in resultats_angles if r["angle"] == int(round(frot))), resultats_angles[0])

    gain_croisements = actuel["croisements"] - meilleur["croisements"]
    gain_longueur_mm = round(actuel["longueur_mm"] - meilleur["longueur_mm"], 2)

    return {
        "ref": ref,
        "rotation_actuelle": int(round(frot)),
        "rotation_optimale": meilleur["angle"],
        "croisements_actuels": actuel["croisements"],
        "croisements_optimaux": meilleur["croisements"],
        "gain_croisements": gain_croisements,
        "longueur_actuelle_mm": actuel["longueur_mm"],
        "longueur_optimale_mm": meilleur["longueur_mm"],
        "gain_longueur_mm": gain_longueur_mm,
        "rotations": resultats_angles
    }


def optimiser_rotations_placement(
    footprints: List[Dict[str, Any]],
    seuil_gain_croisements: int = 1
) -> List[Dict[str, Any]]:
    """Identifie tous les composants dont la rotation réduit les croisements de chevelu."""
    suggestions = []
    for fp in footprints:
        ref = fp.get("ref", "")
        if not ref:
            continue
        eval_rot = evaluer_rotation_composant(ref, footprints)
        if not eval_rot:
            continue
        # Retenir si gain de croisement ou gain de longueur significatif (> 8 mm)
        if eval_rot["gain_croisements"] >= seuil_gain_croisements or (eval_rot["gain_croisements"] == 0 and eval_rot["gain_longueur_mm"] >= 8.0 and eval_rot["rotation_actuelle"] != eval_rot["rotation_optimale"]):
            suggestions.append(eval_rot)

    suggestions.sort(key=lambda s: (s["gain_croisements"], s["gain_longueur_mm"]), reverse=True)
    return suggestions


def evaluer_placement_pcb(data: Dict[str, Any]) -> Dict[str, Any]:
    """Point d'entrée principal pour évaluer un document PCB.

    Args:
        data: Dictionnaire contenant "footprints" et éventuellement "board".

    Returns:
        Dictionnaire avec les résultats de scoring complets.
    """
    footprints = data.get("footprints", [])
    board = data.get("board")

    hpwl_total, hpwl_nets = calculer_hpwl(footprints)
    worst = top_contributeurs_hpwl(footprints, n=5)
    congestion = analyser_congestion(footprints, board=board, grille_mm=5.0)
    decouplage = analyser_decouplage(footprints, distance_cible_mm=3.5)
    ordonnancement = ordonnancer_placement(footprints)
    rotations_suggerees = optimiser_rotations_placement(footprints)

    return {
        "succes": True,
        "hpwl_mm": hpwl_total,
        "top_contributeurs": worst,
        "congestion": congestion,
        "decouplage": decouplage,
        "ordonnancement": ordonnancement,
        "rotations_suggerees": rotations_suggerees
    }
