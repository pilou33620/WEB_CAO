#!/usr/bin/env python3
"""Génère screen/schematique-ne555.svg : 10 s de saisie, dans l'Éditeur
Schématique, du schéma interne du NE555 — 25 transistors, 16 résistances.

    python screen/generer_animation_ne555.py

Le SVG s'anime seul, en boucle, par des @keyframes CSS : il se lit dans le
README GitHub comme dans un navigateur, sans script ni dépendance. Couleurs et
traits reprennent ceux de l'éditeur (01-noyau.js, 02-bibliotheque.js) : fils
jaunes, symboles bleus, jonctions rouges, sur la grille de l'éditeur.

Le schéma suit le schéma interne classique du NE555 (fiche technique, relevé
de la puce) : comparateur de seuil (Q1-Q8), comparateur de déclenchement
(Q9-Q13), pont de 3 × 5 kΩ, bascule (Q15-Q19, remise à zéro Q25), étage de
sortie (Q20-Q24) et transistor de décharge (Q14).

Déroulé : placement bloc par bloc (0,3 → 3,4 s), câblage (3,45 → 6,85 s),
vérification des nets et jonctions (6,9 → 7,4 s), repérage des blocs
fonctionnels (7,4 → 9,4 s), puis fondu et reprise.

Avant d'écrire le fichier, le script vérifie que chaque broche de chaque
composant est bien reliée à un fil et compte les nets : un fil mal placé
arrête la génération au lieu de produire un schéma faux.
"""
import math
import os
import sys

DUREE = 10.0
W, H = 880, 600
TX, TY = 8, -747                  # repère du schéma -> écran

# couleurs de l'éditeur (01-noyau.js)
C_BG, C_GRID, C_GRIDMAJ = "#141416", "#232529", "#32353c"
C_WIRE, C_COMP, C_FILL = "#f2c744", "#4fa8e8", "#2f86cc"
C_RED, C_TXT, C_SEL = "#e8443a", "#ffffff", "#8af0ff"
C_PIN, C_VAL = "#8fd0ff", "#c9ced6"
C_BAR, C_BAR_BORD, C_BAR_TXT = "#1b1d21", "#2c2f35", "#aeb4bd"
POLICE = "'Segoe UI',system-ui,-apple-system,sans-serif"

css = []          # règles @keyframes et classes
_n = [0]


def pc(t):
    return "%.2f%%" % (max(0.0, min(DUREE, t)) / DUREE * 100)


def anim(etapes, extra=""):
    """Crée une animation de toute la durée à partir de [(t, "css"), …] et
    renvoie le nom de la classe qui la porte. Les instants avant le premier
    point et après le dernier gardent la valeur du point le plus proche."""
    _n[0] += 1
    nom = "a%d" % _n[0]
    etapes = sorted(etapes, key=lambda e: e[0])
    if etapes[0][0] > 0:
        etapes.insert(0, (0.0, etapes[0][1]))
    if etapes[-1][0] < DUREE:
        etapes.append((DUREE, etapes[-1][1]))
    corps = "".join("%s{%s}" % (pc(t), v) for t, v in etapes)
    css.append("@keyframes %s{%s}" % (nom, corps))
    css.append(".%s{animation:%s %gs linear infinite;%s}" % (nom, nom, DUREE, extra))
    return nom


def apparait(t, duree=0.25):
    """Pose d'un symbole : il surgit un peu plus grand, puis se cale."""
    return anim([
        (t - 0.01, "opacity:0;transform:scale(.5)"),
        (t, "opacity:.6;transform:scale(.7)"),
        (t + duree * 0.5, "opacity:1;transform:scale(1.15)"),
        (t + duree, "opacity:1;transform:scale(1)"),
    ], "transform-box:fill-box;transform-origin:center")


def fondu(t, duree=0.2, fin=None, fin_duree=0.2):
    e = [(t, "opacity:0"), (t + duree, "opacity:1")]
    if fin is not None:
        e += [(fin, "opacity:1"), (fin + fin_duree, "opacity:0")]
    return anim(e)


def largeur_texte(t, taille):
    etroit = "il1.,:;|'() "
    return sum(taille * (0.3 if ch in etroit else 0.6) for ch in t)


def txt(x, y, t, taille=10, col=C_TXT, ancre="middle", poids="bold"):
    return ('<text x="%g" y="%g" font-size="%g" fill="%s" text-anchor="%s" '
            'font-weight="%s" dominant-baseline="central" stroke="none">%s</text>'
            % (x, y, taille, col, ancre, poids, t))


def ligne(x1, y1, x2, y2, col=None, ep=None):
    s = ""
    if col:
        s += ' stroke="%s"' % col
    if ep:
        s += ' stroke-width="%g"' % ep
    return '<line x1="%g" y1="%g" x2="%g" y2="%g"%s/>' % (x1, y1, x2, y2, s)


def polyl(pts, extra=""):
    return '<polyline points="%s" fill="none"%s/>' % (
        " ".join("%g,%g" % p for p in pts), extra)


def fleche(p0, p1, f, d=6.5, vers_barre=False):
    """Pointe pleine sur le segment p0 -> p1 (barre -> broche), à la fraction f,
    tournée vers la broche (NPN) ou vers la barre (PNP), comme ARR()."""
    x = p0[0] + (p1[0] - p0[0]) * f
    y = p0[1] + (p1[1] - p0[1]) * f
    a = math.atan2(p1[1] - p0[1], p1[0] - p0[0])
    if vers_barre:
        a += math.pi
    pts = [(0, 0), (-d, -d * 0.42), (-d, d * 0.42)]
    pts = [(x + px * math.cos(a) - py * math.sin(a), y + px * math.sin(a) + py * math.cos(a))
           for px, py in pts]
    return '<polygon points="%s" fill="%s" stroke="none"/>' % (
        " ".join("%.2f,%.2f" % p for p in pts), C_COMP)


# =============================================================================
#  Le schéma interne du NE555
# =============================================================================
# Transistors : (repère, type, x de la barre, y, sens, bloc)
#   sens +1 : base à gauche, collecteur et émetteur à droite ; -1 : l'inverse.
#   Broche haute à (bx + 10·sens, by − 15), basse à (bx + 10·sens, by + 15) :
#   collecteur en haut pour un NPN, émetteur en haut pour un PNP.
TRANSISTORS = [
    ("Q1", "npn", 110, 983, +1, "seuil"), ("Q2", "npn", 143, 1015, +1, "seuil"),
    ("Q3", "npn", 295, 1015, -1, "seuil"), ("Q4", "npn", 328, 983, -1, "seuil"),
    ("Q5", "pnp", 130, 890, -1, "seuil"), ("Q6", "pnp", 175, 890, +1, "seuil"),
    ("Q7", "pnp", 260, 890, -1, "seuil"), ("Q8", "pnp", 308, 890, +1, "seuil"),
    ("Q9", "pnp", 393, 890, -1, "declenche"), ("Q10", "pnp", 258, 1137, +1, "declenche"),
    ("Q11", "pnp", 308, 1100, +1, "declenche"), ("Q12", "pnp", 410, 1100, -1, "declenche"),
    ("Q13", "pnp", 458, 1138, -1, "declenche"),
    ("Q14", "npn", 98, 1277, -1, "decharge"),
    ("Q15", "npn", 536, 1183, +1, "bascule"), ("Q16", "npn", 570, 1138, +1, "bascule"),
    ("Q17", "npn", 635, 1107, +1, "bascule"), ("Q18", "npn", 590, 1075, -1, "bascule"),
    ("Q19", "pnp2", 602, 890, +1, "bascule"),
    ("Q20", "npn", 683, 1075, +1, "sortie"), ("Q21", "npn", 717, 875, +1, "sortie"),
    ("Q22", "npn", 766, 920, +1, "sortie"), ("Q23", "pnp_h", 730, 1005, 0, "sortie"),
    ("Q24", "npn", 766, 1231, +1, "sortie"),
    ("Q25", "pnp", 143, 1090, +1, "bascule"),
]
# position du repère de chaque transistor : (x, y, ancre)
REPERES_Q = {
    "Q1": (125, 983, "start"), "Q2": (158, 1015, "start"), "Q3": (280, 1015, "end"),
    "Q4": (313, 983, "end"), "Q5": (115, 886, "end"), "Q6": (190, 886, "start"),
    "Q7": (245, 886, "end"), "Q8": (323, 886, "start"), "Q9": (378, 886, "end"),
    "Q10": (273, 1146, "start"), "Q11": (323, 1100, "start"), "Q12": (424, 1088, "start"),
    "Q13": (443, 1140, "end"), "Q14": (83, 1288, "end"), "Q15": (551, 1190, "start"),
    "Q16": (585, 1142, "start"), "Q17": (650, 1112, "start"), "Q18": (575, 1078, "end"),
    "Q19": (621, 883, "start"), "Q20": (698, 1080, "start"), "Q21": (732, 870, "start"),
    "Q22": (781, 918, "start"), "Q23": (748, 1024, "start"), "Q24": (781, 1236, "start"),
    "Q25": (158, 1092, "start"),
}
# Résistances : (repère, valeur, x, y du centre, "v"|"h", bloc, côté des textes)
RESISTANCES = [
    ("R1", "4.7k", 120, 840, "v", "seuil", +1), ("R2", "830", 219, 838, "v", "seuil", +1),
    ("R3", "4.7k", 318, 840, "v", "seuil", +1), ("R4", "1k", 383, 840, "v", "declenche", +1),
    ("R5", "10k", 219, 1180, "v", "seuil", +1), ("R6", "100k", 318, 1262, "v", "declenche", +1),
    ("R7", "5k", 481, 850, "v", "pont", +1), ("R8", "5k", 481, 1090, "v", "pont", +1),
    ("R9", "5k", 481, 1268, "v", "pont", +1), ("R10", "15k", 580, 965, "v", "bascule", +1),
    ("R11", "4.7k", 620, 1013, "h", "bascule", 0), ("R12", "6.8k", 693, 835, "v", "sortie", -1),
    ("R13", "3.9k", 727, 948, "v", "sortie", +1), ("R14", "220", 727, 1231, "h", "sortie", 0),
    ("R15", "4.7k", 662, 1268, "v", "sortie", +1), ("R16", "100", 390, 1231, "h", "decharge", 0),
]
# Broches du boîtier : (nom, n°, x, y de la broche, côté du drapeau)
BROCHES = [
    ("THR", 6, 72, 983, -1), ("RESET", 4, 72, 1090, -1), ("TRIG", 2, 72, 1137, -1),
    ("DIS", 7, 72, 1215, -1), ("VCC", 8, 795, 800, +1), ("CTRL", 5, 500, 983, +1),
    ("OUT", 3, 795, 1060, +1), ("GND", 1, 795, 1305, +1),
]

# Fils : (vague de câblage, polyligne)
FILS = [
    ("rails", [(120, 800), (795, 800)]),
    ("rails", [(88, 1305), (795, 1305)]),
    # comparateur de seuil
    ("seuil", [(120, 800), (120, 820)]), ("seuil", [(120, 860), (120, 875)]),
    ("seuil", [(120, 905), (120, 968)]),
    ("seuil", [(136, 890), (169, 890)]), ("seuil", [(153, 890), (153, 920), (120, 920)]),
    ("seuil", [(120, 950), (153, 950), (153, 1000)]),
    ("seuil", [(120, 998), (120, 1015), (137, 1015)]),
    ("seuil", [(153, 1030), (153, 1045), (285, 1045), (285, 1030)]),
    ("seuil", [(219, 1045), (219, 1160)]), ("seuil", [(219, 1200), (219, 1305)]),
    ("seuil", [(219, 800), (219, 818)]),
    ("seuil", [(185, 875), (185, 858), (250, 858), (250, 875)]),
    ("seuil", [(250, 905), (250, 965), (200, 965), (200, 1305)]),
    ("seuil", [(266, 890), (302, 890)]), ("seuil", [(285, 890), (285, 920), (318, 920)]),
    ("seuil", [(318, 800), (318, 820)]), ("seuil", [(318, 860), (318, 875)]),
    ("seuil", [(318, 905), (318, 968)]),
    ("seuil", [(318, 950), (285, 950), (285, 1000)]),
    ("seuil", [(318, 998), (318, 1015), (301, 1015)]),
    ("seuil", [(72, 983), (104, 983)]),
    # pont diviseur et entrée CTRL
    ("pont", [(334, 983), (500, 983)]),
    ("pont", [(481, 800), (481, 830)]), ("pont", [(481, 870), (481, 1070)]),
    ("pont", [(481, 1110), (481, 1248)]), ("pont", [(481, 1288), (481, 1305)]),
    # comparateur de déclenchement
    ("declenche", [(383, 800), (383, 820)]), ("declenche", [(383, 860), (383, 875)]),
    ("declenche", [(399, 890), (596, 890)]),
    ("declenche", [(383, 905), (383, 1076)]),
    ("declenche", [(318, 1085), (318, 1076), (400, 1076), (400, 1085)]),
    ("declenche", [(72, 1137), (252, 1137)]),
    ("declenche", [(268, 1122), (268, 1100), (302, 1100)]),
    ("declenche", [(268, 1152), (268, 1305)]),
    ("declenche", [(318, 1115), (318, 1242)]), ("declenche", [(318, 1282), (318, 1305)]),
    ("declenche", [(416, 1100), (448, 1100), (448, 1123)]),
    ("declenche", [(400, 1115), (400, 1168), (448, 1168)]),
    ("declenche", [(448, 1153), (448, 1305)]),
    ("declenche", [(464, 1138), (481, 1138)]),
    # bascule
    ("bascule", [(185, 905), (185, 935), (546, 935), (546, 1168)]),
    ("bascule", [(612, 875), (612, 800)]),
    ("bascule", [(580, 890), (580, 945)]), ("bascule", [(612, 920), (580, 920)]),
    ("bascule", [(616, 902), (645, 902), (645, 1092)]),
    ("bascule", [(580, 985), (580, 1060)]),
    ("bascule", [(596, 1075), (612, 1075), (612, 1045), (580, 1045)]),
    ("bascule", [(72, 1090), (137, 1090)]),
    ("bascule", [(153, 1075), (153, 1060), (301, 1060), (301, 1045), (580, 1045)]),
    ("bascule", [(153, 1105), (153, 1231)]),
    ("bascule", [(580, 1090), (580, 1123)]), ("bascule", [(580, 1107), (629, 1107)]),
    ("bascule", [(546, 1138), (564, 1138)]), ("bascule", [(580, 1153), (580, 1305)]),
    ("bascule", [(318, 1183), (530, 1183)]), ("bascule", [(546, 1198), (546, 1305)]),
    ("bascule", [(546, 1013), (600, 1013)]), ("bascule", [(640, 1013), (645, 1013)]),
    ("bascule", [(645, 1122), (645, 1305)]),
    # étage de sortie
    ("sortie", [(693, 800), (693, 815)]), ("sortie", [(693, 855), (693, 1060)]),
    ("sortie", [(693, 875), (711, 875)]), ("sortie", [(727, 860), (727, 800)]),
    ("sortie", [(727, 890), (727, 928)]), ("sortie", [(727, 920), (760, 920)]),
    ("sortie", [(776, 905), (776, 800)]), ("sortie", [(776, 935), (776, 1216)]),
    ("sortie", [(727, 968), (776, 968)]),
    ("sortie", [(708, 995), (693, 995)]), ("sortie", [(752, 995), (776, 995)]),
    ("sortie", [(730, 1015), (730, 1025), (693, 1025)]),
    ("sortie", [(645, 1075), (677, 1075)]), ("sortie", [(693, 1090), (693, 1231)]),
    ("sortie", [(776, 1060), (795, 1060)]),
    ("sortie", [(410, 1231), (707, 1231)]), ("sortie", [(747, 1231), (760, 1231)]),
    ("sortie", [(662, 1231), (662, 1248)]), ("sortie", [(662, 1288), (662, 1305)]),
    ("sortie", [(776, 1246), (776, 1305)]),
    # décharge
    ("decharge", [(104, 1277), (120, 1277), (120, 1231), (370, 1231)]),
    ("decharge", [(88, 1262), (88, 1215), (72, 1215)]),
    ("decharge", [(88, 1292), (88, 1305)]),
]

BLOCS = {   # nom, couleur, message de pose, puce (x, y, lignes)
    "pont": ("Pont 3 × 5 kΩ", "#4ade80",
             "Placer · pont diviseur R7-R8-R9 : ⅓ et ⅔ de Vcc",
             (528, 1214, ["Pont", "3 × 5k"])),
    "seuil": ("Comparateur de seuil", "#fb923c",
              "Placer · comparateur de seuil (⅔ Vcc) — Q1 à Q8",
              (52, 850, ["Comparateur", "seuil ⅔"])),
    "declenche": ("Comparateur de déclenchement", "#c084fc",
                  "Placer · comparateur de déclenchement (⅓ Vcc) — Q9 à Q13",
                  (62, 1176, ["Comparateur", "déclench. ⅓"])),
    "bascule": ("Bascule", "#22d3ee",
                "Placer · bascule Q15 à Q19, remise à zéro Q25",
                (614, 1178, ["Bascule"])),
    "sortie": ("Étage de sortie", "#facc15",
               "Placer · étage de sortie Q20 à Q24",
               (822, 1140, ["Sortie"])),
    "decharge": ("Décharge", "#f87171",
                 "Placer · transistor de décharge Q14",
                 (40, 1252, ["Décharge"])),
}
ORDRE_BLOCS = ["pont", "seuil", "declenche", "bascule", "sortie", "decharge"]


# =============================================================================
#  Géométrie des symboles
# =============================================================================
def geo_transistor(nom, typ, bx, by, s):
    """Dessin (en coordonnées du schéma), broches et boîte englobante."""
    parts, broches = [], []
    if typ == "pnp_h":
        # PNP couché : barre horizontale, base vers le bas, émetteur à droite
        parts.append(ligne(bx - 14, by, bx + 14, by, ep=3))
        parts.append(ligne(bx, by, bx, by + 10))
        parts.append(polyl([(bx - 8, by), (bx - 22, by - 10)]))
        parts.append(polyl([(bx + 8, by), (bx + 22, by - 10)]))
        parts.append(fleche((bx + 8, by), (bx + 22, by - 10), 0.3, vers_barre=True))
        broches = [(bx - 22, by - 10), (bx + 22, by - 10), (bx, by + 10)]
        return "".join(parts), broches, (bx - 24, by - 14, bx + 24, by + 13)
    lx = bx + 10 * s
    parts.append(ligne(bx, by - 11, bx, by + 11, ep=3))
    parts.append(ligne(bx, by, bx - 6 * s, by))
    broches.append((bx - 6 * s, by))
    if typ == "pnp2":
        # PNP latéral à deux collecteurs (Q19)
        parts.append(polyl([(bx, by - 6), (lx, by - 13), (lx, by - 15)]))
        parts.append(fleche((bx, by - 6), (lx, by - 13), 0.3, vers_barre=True))
        parts.append(polyl([(bx, by + 4), (lx + 4, by + 12)]))
        parts.append(polyl([(bx, by + 9), (lx, by + 22), (lx, by + 30)]))
        broches += [(lx, by - 15), (lx + 4, by + 12), (lx, by + 30)]
        return "".join(parts), broches, (min(bx - 9, lx) , by - 17, max(bx, lx + 6), by + 32)
    haut = [(bx, by - 6), (lx, by - 13), (lx, by - 15)]
    bas = [(bx, by + 6), (lx, by + 13), (lx, by + 15)]
    parts.append(polyl(haut))
    parts.append(polyl(bas))
    if typ == "npn":
        parts.append(fleche(bas[0], bas[1], 0.92))
    else:
        parts.append(fleche(haut[0], haut[1], 0.3, vers_barre=True))
    broches += [(lx, by - 15), (lx, by + 15)]
    x1, x2 = sorted([bx - 6 * s, lx])
    return "".join(parts), broches, (x1 - 3, by - 17, x2 + 3, by + 17)


def geo_resistance(cx, cy, sens):
    if sens == "v":
        d = (ligne(cx, cy - 20, cx, cy - 11) + ligne(cx, cy + 11, cx, cy + 20) +
             '<rect x="%g" y="%g" width="10" height="22" rx="2.5" fill="%s"/>' % (cx - 5, cy - 11, C_FILL))
        return d, [(cx, cy - 20), (cx, cy + 20)], (cx - 8, cy - 20, cx + 8, cy + 20)
    d = (ligne(cx - 20, cy, cx - 11, cy) + ligne(cx + 11, cy, cx + 20, cy) +
         '<rect x="%g" y="%g" width="22" height="10" rx="2.5" fill="%s"/>' % (cx - 11, cy - 5, C_FILL))
    return d, [(cx - 20, cy), (cx + 20, cy)], (cx - 20, cy - 8, cx + 20, cy + 8)


def geo_broche(nom, num, x, y, cote):
    """Drapeau d'étiquette (comme le symbole « port » de l'éditeur)."""
    if cote < 0:
        pts = [(x, y), (x - 6, y - 6), (x - 26, y - 6), (x - 26, y + 6), (x - 6, y + 6)]
        cx = x - 15
    else:
        pts = [(x, y), (x + 6, y - 6), (x + 26, y - 6), (x + 26, y + 6), (x + 6, y + 6)]
        cx = x + 15
    d = ('<polygon points="%s" fill="%s" stroke-width="1.6"/>' % (
        " ".join("%g,%g" % p for p in pts), C_FILL) +
         txt(cx, y + 0.5, str(num), 8.5, C_TXT) + txt(cx, y - 13, nom, 9.5, C_TXT))
    return d, [(x, y)], (min(x, x + 26 * cote) - 2, y - 20, max(x, x + 26 * cote) + 2, y + 8)


# =============================================================================
#  Connectivité : chaque broche sur un fil, nets, points de jonction
# =============================================================================
def sur_segment(p, a, b):
    (x, y), (x1, y1), (x2, y2) = p, a, b
    if x1 == x2 == x:
        return min(y1, y2) <= y <= max(y1, y2)
    if y1 == y2 == y:
        return min(x1, x2) <= x <= max(x1, x2)
    return False


def connectivite(fils, broches_par_composant):
    parent = {}

    def trouve(k):
        parent.setdefault(k, k)
        while parent[k] != k:
            parent[k] = parent[parent[k]]
            k = parent[k]
        return k

    def unit(a, b):
        parent[trouve(a)] = trouve(b)

    segments = []
    for i, f in enumerate(fils):
        for j in range(len(f) - 1):
            a, b = f[j], f[j + 1]
            if a[0] != b[0] and a[1] != b[1]:
                sys.exit("fil %d non orthogonal : %s -> %s" % (i, a, b))
            segments.append((i, a, b))
    points = {p for f in fils for p in (f[0], f[-1])}
    for pins in broches_par_composant.values():
        points.update(pins)
    for p in points:
        for i, a, b in segments:
            if sur_segment(p, a, b):
                unit(("p", p), ("f", i))
    erreurs = []
    for nom, pins in broches_par_composant.items():
        for p in pins:
            if not any(sur_segment(p, a, b) for _, a, b in segments):
                erreurs.append("%s : broche %s reliée à rien" % (nom, p))
    for i, f in enumerate(fils):
        for p in (f[0], f[-1]):
            touche = any(sur_segment(p, a, b) for j, a, b in segments if j != i)
            touche |= any(p in pins for pins in broches_par_composant.values())
            if not touche:
                erreurs.append("fil %d : extrémité %s en l'air" % (i, p))
    if erreurs:
        sys.exit("\n".join(erreurs))
    nets = {trouve(("p", p)) for pins in broches_par_composant.values() for p in pins}
    # jonction : au moins trois branches se rejoignent au même point
    jonctions = []
    for p in sorted(points):
        n = sum(1 for pins in broches_par_composant.values() for q in pins if q == p)
        for _, a, b in segments:
            if p in (a, b):
                n += 1
            elif sur_segment(p, a, b):
                n += 2
        if n >= 3:
            jonctions.append(p)
    return len(nets), jonctions


# =============================================================================
#  Chronologie
# =============================================================================
T_POSE = {"pont": 0.3, "seuil": 0.7, "declenche": 1.25, "bascule": 1.75,
          "sortie": 2.3, "decharge": 2.8, "broches": 3.05}
T_FIL0, T_FIL1 = 3.45, 6.85
VAGUES = ["rails", "seuil", "pont", "declenche", "bascule", "sortie", "decharge"]
T_ERC, T_BLOCS, T_FONDU = 6.9, 7.45, 9.45


def generer():
    composants = []   # (nom, bloc, dessin, broches, boîte, textes)
    for nom, typ, bx, by, s, bloc in TRANSISTORS:
        d, pins, boite = geo_transistor(nom, typ, bx, by, s)
        x, y, an = REPERES_Q[nom]
        composants.append((nom, bloc, d, pins, boite, txt(x, y, nom, 9.5, C_TXT, an)))
    for nom, val, cx, cy, sens, bloc, cote in RESISTANCES:
        d, pins, boite = geo_resistance(cx, cy, sens)
        if sens == "h":
            t = txt(cx, cy - 13, nom, 9.5, C_TXT) + txt(cx, cy + 14, val, 9, C_VAL, "middle", "600")
        else:
            an = "start" if cote > 0 else "end"
            x = cx + 9 * cote
            t = txt(x, cy - 6, nom, 9.5, C_TXT, an) + txt(x, cy + 7, val, 9, C_VAL, an, "600")
            if nom == "R6":
                t += txt(x, cy + 19, "(pincée)", 8.5, C_VAL, an, "600")
        composants.append((nom, bloc, d, pins, boite, t))
    for nom, num, x, y, cote in BROCHES:
        d, pins, boite = geo_broche(nom, num, x, y, cote)
        composants.append((nom, "broches", d, pins, boite, ""))

    fils = [f for _, f in FILS]
    nb_nets, jonctions = connectivite(fils, {c[0]: c[3] for c in composants})

    pos_curseur = [(0.0, 760, 560), (0.12, 760, 560)]
    clics = []
    etat = [(0.0, T_POSE["pont"] - 0.05, "Nouvelle feuille · ne555_interne")]

    # --- placement, bloc par bloc ---------------------------------------------
    corps_svg, teintes, puces = [], [], []
    groupes = ORDRE_BLOCS + ["broches"]
    for gi, g in enumerate(groupes):
        membres = [c for c in composants if c[1] == g]
        membres.sort(key=lambda c: (c[4][0] + c[4][2], c[4][1]))
        t0 = T_POSE[g]
        t_fin = T_POSE[groupes[gi + 1]] if gi + 1 < len(groupes) else T_FIL0
        pas = min(0.045, 0.3 / max(1, len(membres)))
        cx = sum((c[4][0] + c[4][2]) / 2 for c in membres) / len(membres) + TX
        cy = sum((c[4][1] + c[4][3]) / 2 for c in membres) / len(membres) + TY
        pos_curseur += [(t0 - 0.2, None, None), (t0 - 0.03, cx, cy), (t0 + 0.15, cx, cy)]
        clics.append((t0, cx, cy))
        etat.append((t0 - 0.05, t_fin - 0.05,
                     BLOCS[g][2] if g in BLOCS else "Placer · broches du boîtier DIP-8"))
        for i, (nom, bloc, d, pins, (x1, y1, x2, y2), t) in enumerate(membres):
            tp = t0 + i * pas
            pastilles = "".join('<circle cx="%g" cy="%g" r="1.7" fill="%s"/>' % (p[0], p[1], C_PIN)
                                for p in pins)
            corps_svg.append(
                '<g class="%s"><g stroke="%s" stroke-width="2" stroke-linecap="round" '
                'stroke-linejoin="round" fill="none">%s</g>%s%s</g>' % (
                    apparait(tp, 0.22), C_COMP, d, pastilles, t))
            if g in BLOCS:
                # teinte du bloc : un éclair à la pose, puis au repérage final
                tr = T_BLOCS + ORDRE_BLOCS.index(g) * 0.22
                cls = anim([(tp, "opacity:0"), (tp + 0.1, "opacity:.5"), (t0 + 0.7, "opacity:0"),
                            (tr, "opacity:0"), (tr + 0.2, "opacity:.32")])
                teintes.append('<rect class="%s" x="%g" y="%g" width="%g" height="%g" rx="4" fill="%s"/>'
                               % (cls, x1 - 3, y1 - 2, x2 - x1 + 6, y2 - y1 + 4, BLOCS[g][1]))

    # --- câblage, par vagues ----------------------------------------------------
    fils_svg = []
    duree_vague = (T_FIL1 - T_FIL0) / len(VAGUES)
    for vi, v in enumerate(VAGUES):
        tv = T_FIL0 + vi * duree_vague
        lot = [f for w, f in FILS if w == v]
        lg = [sum(abs(b[0] - a[0]) + abs(b[1] - a[1]) for a, b in zip(f, f[1:])) for f in lot]
        pas = min(0.03, (duree_vague * 0.35) / max(1, len(lot)))
        k = (duree_vague * 0.6) / max(lg)
        nom_vague = (BLOCS[v][0][0].lower() + BLOCS[v][0][1:]) if v in BLOCS else "rails Vcc et masse"
        etat.append((tv, tv + duree_vague, "Câbler · %s — %d fils" % (nom_vague, len(lot))))
        # le curseur suit le plus long fil de la vague
        i_long = max(range(len(lot)), key=lambda i: lg[i])
        for i, (f, l) in enumerate(zip(lot, lg)):
            t = tv + i * pas
            d = max(0.08, l * k)
            cls = anim([(t, "stroke-dashoffset:1"), (t + d, "stroke-dashoffset:0")])
            fils_svg.append('<path class="%s" d="M%s" pathLength="1" stroke-dasharray="1 2"/>' % (
                cls, " L".join("%g,%g" % p for p in f)))
            if i == i_long:
                pos_curseur.append((t, f[0][0] + TX, f[0][1] + TY))
                tt = t
                for a, b in zip(f, f[1:]):
                    tt += d * (abs(b[0] - a[0]) + abs(b[1] - a[1])) / l
                    pos_curseur.append((tt, b[0] + TX, b[1] + TY))

    # --- vérification -------------------------------------------------------------
    pas = 0.45 / len(jonctions)
    jonctions_svg = "".join(
        '<circle class="%s" cx="%g" cy="%g" r="3.4" fill="%s"/>' % (
            apparait(T_ERC + i * pas, 0.16), x, y, C_RED)
        for i, (x, y) in enumerate(sorted(jonctions, key=lambda p: (p[0], p[1]))))
    etat.append((T_ERC, T_BLOCS,
                 "Vérifier · %d nets, %d jonctions — ERC : aucune erreur ✓" % (nb_nets, len(jonctions))))

    # --- repérage des blocs -------------------------------------------------------
    for i, g in enumerate(ORDRE_BLOCS):
        nom, col, _, (px, py, lignes) = BLOCS[g]
        tr = T_BLOCS + i * 0.22
        w = max(largeur_texte(l, 9.5) for l in lignes) + 12
        h = 6 + 12 * len(lignes)
        corps = "".join(txt(0, -h / 2 + 9 + 12 * j, l, 9.5, col) for j, l in enumerate(lignes))
        puces.append(
            '<g transform="translate(%g,%g)"><g class="%s">'
            '<rect x="%g" y="%g" width="%g" height="%g" rx="4" fill="#16181c" fill-opacity=".92" '
            'stroke="%s" stroke-width="1.2"/>%s</g></g>' % (
                px, py, apparait(tr, 0.2), -w / 2, -h / 2, w, h, col, corps))
    etat.append((T_BLOCS, T_FONDU + 0.3,
                 "NE555 · 25 transistors, 16 résistances — conçu par Hans Camenzind pour Signetics (1971)"))

    # --- curseur ----------------------------------------------------------------
    pos, der = [], None
    for tm, x, y in sorted(pos_curseur, key=lambda p: p[0]):
        if x is None:
            x, y = der
        pos.append((tm, x, y))
        der = (x, y)
    fin_cur = T_FIL1 + 0.05
    pos.append((fin_cur + 0.4, der[0] + 50, der[1] - 30))
    cls_cur = anim([(tm, "transform:translate(%.1fpx,%.1fpx)" % (x, y)) for tm, x, y in pos])
    curseur = (
        '<g class="%s"><g class="%s"><path d="M0,0 L0,17 L4.6,13 L7.6,20 L10.2,18.9 L7.3,12.4 L13,12.4 Z" '
        'fill="#fff" stroke="#111" stroke-width="1.1" stroke-linejoin="round"/></g></g>' % (
            fondu(0.08, 0.2, fin_cur, 0.35), cls_cur))
    ondes = "".join(
        '<circle class="%s" cx="%.1f" cy="%.1f" r="22" fill="none" stroke="%s" stroke-width="2"/>' % (
            anim([(t - 0.01, "opacity:0;transform:scale(.2)"), (t, "opacity:.9;transform:scale(.3)"),
                  (t + 0.4, "opacity:0;transform:scale(1.7)")],
                 "transform-box:fill-box;transform-origin:center"), x, y, C_SEL)
        for t, x, y in clics)

    # --- barres -----------------------------------------------------------------
    textes_etat = "".join(
        '<g class="%s">%s</g>' % (
            anim([(a + 0.04, "opacity:0"), (a + 0.1, "opacity:1"), (b, "opacity:1"), (b + 0.04, "opacity:0")]
                 if a > 0 else [(0, "opacity:1"), (b, "opacity:1"), (b + 0.04, "opacity:0")]),
            txt(16, H - 12, m, 11, "#d7dbe0", "start", "600"))
        for a, b, m in etat)
    etapes = [("1  Placer", T_POSE["pont"] - 0.1, T_FIL0), ("2  Câbler", T_FIL0, T_ERC),
              ("3  Vérifier", T_ERC, T_BLOCS), ("4  Repérer", T_BLOCS, T_FONDU + 0.3)]
    puces_etapes, x = [], 548
    for nom, a, b in etapes:
        w = largeur_texte(nom, 10.5) + 18
        actif = anim([(a, "opacity:0"), (a + 0.12, "opacity:1"), (b, "opacity:1"), (b + 0.12, "opacity:0")])
        # la dernière étape dure jusqu'au fondu : elle n'a pas d'état « faite »
        fait = (anim([(b, "opacity:0"), (b + 0.12, "opacity:1"), (T_FONDU, "opacity:1"), (T_FONDU + 0.4, "opacity:0")])
                if b < T_FONDU else anim([(0, "opacity:0")]))
        puces_etapes.append(
            '<rect x="%g" y="5" width="%g" height="17" rx="8.5" fill="#24272c" stroke="#3a3d44"/>' % (x, w) +
            txt(x + w / 2, 13.5, nom, 10.5, "#80868f", "middle", "600") +
            '<g class="%s"><rect x="%g" y="5" width="%g" height="17" rx="8.5" fill="#1d3a55" stroke="#2f6c9e"/>%s</g>' % (
                fait, x, w, txt(x + w / 2, 13.5, nom, 10.5, "#9cc9ee", "middle", "600")) +
            '<g class="%s"><rect x="%g" y="5" width="%g" height="17" rx="8.5" fill="%s" stroke="%s"/>%s</g>' % (
                actif, x, w, C_FILL, C_SEL, txt(x + w / 2, 13.5, nom, 10.5, C_TXT, "middle", "bold")))
        x += w + 8

    scene = fondu(0, 0.0, T_FONDU, 0.4)
    sub = ('<g class="%s">' % fondu(T_POSE["bascule"] + 0.2, 0.2) + txt(593, 1280, "SUB", 8.5, C_VAL, "start", "600") +
           '<rect x="584" y="1276" width="6" height="6" fill="none" stroke="%s" stroke-width="1"/></g>' % C_VAL)

    # --- assemblage -------------------------------------------------------------
    grille_min = ('<pattern id="g1" width="20" height="20" patternUnits="userSpaceOnUse">'
                  '<path d="M20,0 L0,0 L0,20" fill="none" stroke="%s" stroke-width="1"/></pattern>' % C_GRID)
    grille_maj = ('<pattern id="g2" width="100" height="100" patternUnits="userSpaceOnUse">'
                  '<path d="M100,0 L0,0 L0,100" fill="none" stroke="%s" stroke-width="1"/></pattern>' % C_GRIDMAJ)
    svg = [
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" width="%d" height="%d" '
        'font-family="%s" role="img" aria-labelledby="titre desc">' % (W, H, W, H, POLICE),
        '<title id="titre">WEB_CAO — saisie du schéma interne du NE555</title>',
        '<desc id="desc">Animation de 10 secondes dans l\'Éditeur Schématique : les 25 transistors '
        'et 16 résistances du NE555 sont posés bloc par bloc, câblés, vérifiés (%d nets), puis '
        'les blocs fonctionnels sont repérés : comparateurs de seuil et de déclenchement, pont de '
        '3 × 5 kΩ, bascule, étage de sortie et décharge.</desc>' % nb_nets,
        '<defs>', grille_min, grille_maj,
        '<style>%s%s</style>' % ("".join(css),
                                 "@media (prefers-reduced-motion:reduce){*{animation-duration:0s!important}}"),
        '</defs>',
        '<rect width="%d" height="%d" fill="%s"/>' % (W, H, C_BG),
        '<rect width="%d" height="%d" fill="url(#g1)"/>' % (W, H),
        '<rect width="%d" height="%d" fill="url(#g2)"/>' % (W, H),
        '<g class="%s"><g transform="translate(%d,%d)">' % (scene, TX, TY),
        "".join(teintes),
        '<g stroke="%s" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none">' % C_WIRE,
        "".join(fils_svg), '</g>',
        "".join(corps_svg), sub, jonctions_svg, "".join(puces),
        '</g></g>',
        ondes, curseur,
        '<rect width="%d" height="27" fill="%s"/>' % (W, C_BAR),
        ligne(0, 27.5, W, 27.5, C_BAR_BORD, 1),
        '<rect x="12" y="7" width="13" height="13" rx="3" fill="%s"/>' % C_FILL,
        ligne(15, 13.5, 22, 13.5, C_WIRE, 2),
        txt(32, 13.5, "WEB_CAO", 12, C_TXT, "start"),
        txt(102, 13.5, "Éditeur Schématique — ne555_interne · Feuille 1", 11, C_BAR_TXT, "start", "600"),
        "".join(puces_etapes),
        '<rect y="%d" width="%d" height="24" fill="%s"/>' % (H - 24, W, C_BAR),
        ligne(0, H - 24.5, W, H - 24.5, C_BAR_BORD, 1),
        textes_etat,
        txt(W - 14, H - 12, "1 carré = 1 mm", 10.5, C_BAR_TXT, "end", "600"),
        '</svg>',
    ]
    return "\n".join(svg) + "\n", nb_nets, len(jonctions)


if __name__ == "__main__":
    contenu, nets, jonctions = generer()
    chemin = os.path.join(os.path.dirname(os.path.abspath(__file__)), "schematique-ne555.svg")
    with open(chemin, "w", encoding="utf-8") as f:
        f.write(contenu)
    print("écrit : %s (%d octets) — %d nets, %d jonctions" % (
        chemin, os.path.getsize(chemin), nets, jonctions))
