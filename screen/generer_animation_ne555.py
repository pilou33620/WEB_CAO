#!/usr/bin/env python3
"""Génère screen/schematique-ne555.svg : 10 s de saisie d'un schéma dans
l'Éditeur Schématique, le clignoteur à NE555 en astable.

    python screen/generer_animation_ne555.py

Le SVG s'anime seul, en boucle, par des @keyframes CSS : il se lit dans le
README GitHub comme dans un navigateur, sans script ni dépendance. Couleurs,
traits et symboles reprennent ceux de l'éditeur (01-noyau.js,
02-bibliotheque.js) : pas de grille de 20 px, fils jaunes, symboles bleus,
alimentations rouges.

Déroulé : placement des composants (0,5 → 3,5 s), câblage (3,5 → 6,6 s),
connectivité et étiquettes de nets (6,6 → 7,4 s), simulation transitoire —
la LED clignote au vrai rythme du montage, 1,4 Hz — puis fondu et reprise.
"""
import math
import os

DUREE = 10.0
W, H = 800, 450
OX, OY = 280, 226                 # origine du repère schéma, à l'écran

# couleurs de l'éditeur (01-noyau.js)
C_BG, C_GRID, C_GRIDMAJ = "#141416", "#232529", "#32353c"
C_WIRE, C_COMP, C_FILL = "#f2c744", "#4fa8e8", "#2f86cc"
C_RED, C_TXT, C_SEL = "#e8443a", "#ffffff", "#8af0ff"
C_PIN, C_IC_TXT, C_VAL = "#8fd0ff", "#cfe6fb", "#d4d8de"
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
        (t - 0.01, "opacity:0;transform:scale(.6)"),
        (t, "opacity:.6;transform:scale(.75)"),
        (t + duree * 0.5, "opacity:1;transform:scale(1.08)"),
        (t + duree, "opacity:1;transform:scale(1)"),
    ], "transform-box:fill-box;transform-origin:center")


def fondu(t, duree=0.2, fin=None, fin_duree=0.2):
    e = [(t, "opacity:0"), (t + duree, "opacity:1")]
    if fin is not None:
        e += [(fin, "opacity:1"), (fin + fin_duree, "opacity:0")]
    return anim(e)


def creneaux(intervalles, haut="1", bas="0"):
    """Opacité en tout-ou-rien : `haut` pendant chacun des intervalles."""
    e = [(0.0, "opacity:" + bas)]
    for a, b in intervalles:
        e += [(a - 0.005, "opacity:" + bas), (a, "opacity:" + haut),
              (b - 0.005, "opacity:" + haut), (b, "opacity:" + bas)]
    return anim(e)


def largeur_texte(t, taille):
    etroit = "il1.,:;|' "
    return sum(taille * (0.3 if ch in etroit else 0.62) for ch in t)


def txt(x, y, t, taille=12, col=C_TXT, ancre="middle", poids="bold", cls=""):
    c = ' class="%s"' % cls if cls else ""
    return ('<text x="%g" y="%g" font-size="%g" fill="%s" text-anchor="%s" '
            'font-weight="%s" dominant-baseline="central" stroke="none"%s>%s</text>'
            % (x, y, taille, col, ancre, poids, c, t))


def rot(p, r):
    a = math.radians(r)
    return (p[0] * math.cos(a) - p[1] * math.sin(a),
            p[0] * math.sin(a) + p[1] * math.cos(a))


def ligne(x1, y1, x2, y2, col=None, ep=None):
    s = ""
    if col:
        s += ' stroke="%s"' % col
    if ep:
        s += ' stroke-width="%g"' % ep
    return '<line x1="%g" y1="%g" x2="%g" y2="%g"%s/>' % (x1, y1, x2, y2, s)


def fleche(x, y, ang, d=8, col=C_COMP):
    """Pointe pleine, comme ARR() de l'éditeur : sommet en (x, y)."""
    pts = [(0, 0), (-d, -d * 0.42), (-d, d * 0.42)]
    pts = [rot(p, math.degrees(ang)) for p in pts]
    return '<polygon points="%s" fill="%s" stroke="none"/>' % (
        " ".join("%.2f,%.2f" % (x + p[0], y + p[1]) for p in pts), col)


# =============================================================================
#  Symboles (repère local du composant, comme LIB[type].d)
# =============================================================================
def sym_resistance():
    return (ligne(-40, 0, -20, 0) + ligne(20, 0, 40, 0) +
            '<rect x="-20" y="-10" width="40" height="20" rx="4" fill="%s"/>' % C_FILL)


def sym_condensateur():
    return (ligne(-40, 0, -5, 0) + ligne(5, 0, 40, 0) +
            ligne(-5, -15, -5, 15, ep=4.5) + ligne(5, -15, 5, 15, ep=4.5))


def sym_chimique():
    a1, a2 = math.pi * 0.72, math.pi * 1.28
    p1 = (25 + 20 * math.cos(a1), 20 * math.sin(a1))
    p2 = (25 + 20 * math.cos(a2), 20 * math.sin(a2))
    return (ligne(-40, 0, -5, 0) + ligne(5, 0, 40, 0) +
            ligne(-5, -15, -5, 15, ep=4.5) +
            '<path d="M%.2f,%.2f A20,20 0 0 1 %.2f,%.2f" fill="none"/>' % (p1 + p2))


def sym_led(cls_triangle, cls_fleches):
    return (ligne(-40, 0, -10, 0) +
            '<polygon points="-10,-15 -10,15 10,0" fill="%s"/>' % C_FILL +
            '<polygon class="%s" points="-10,-15 -10,15 10,0" fill="#ff3b30" stroke="#ff6b5e"/>' % cls_triangle +
            ligne(10, -15, 10, 15, ep=4.5) + ligne(10, 0, 40, 0) +
            ligne(-5, -20, 5, -30) + fleche(7, -32, -math.pi / 4) +
            ligne(5, -20, 15, -30) + fleche(17, -32, -math.pi / 4) +
            '<g class="%s" stroke="#ff6b5e">' % cls_fleches +
            ligne(-5, -20, 5, -30) + fleche(7, -32, -math.pi / 4, col="#ff6b5e") +
            ligne(5, -20, 15, -30) + fleche(17, -32, -math.pi / 4, col="#ff6b5e") +
            '</g>')


def sym_alim():
    return (ligne(0, 20, 0, -10, C_WIRE, 3) + ligne(-20, -10, 20, -10, C_RED, 5))


def sym_masse():
    return ('<g stroke="%s">' % C_RED + ligne(0, -20, 0, 0) +
            ligne(-20, 0, 20, 0, ep=5) + ligne(-10, 5, 10, 5, ep=5) +
            ligne(-5, 10, 5, 10, ep=5) + '</g>')


# NE555 en disposition libre (brochage fonctionnel) : numéro, nom, position
NE555 = [
    (1, "GND", (-20, 80)), (2, "TRIG", (-100, 40)), (3, "OUT", (100, 0)),
    (4, "RESET", (20, -80)), (5, "CTRL", (20, 80)), (6, "THR", (-100, 0)),
    (7, "DIS", (-100, -40)), (8, "VCC", (-20, -80)),
]
CORPS = (-80, -60, 80, 60)


def sym_ne555():
    x1, y1, x2, y2 = CORPS
    s = '<rect x="%d" y="%d" width="%d" height="%d" rx="4" fill="%s"/>' % (
        x1, y1, x2 - x1, y2 - y1, C_FILL)
    for num, nom, (px, py) in NE555:
        if px <= x1:
            s += ligne(x1, py, px, py) + txt(x1 + 7, py, "%d %s" % (num, nom), 9.5, C_IC_TXT, "start")
        elif px >= x2:
            s += ligne(x2, py, px, py) + txt(x2 - 7, py, "%d %s" % (num, nom), 9.5, C_IC_TXT, "end")
        elif py <= y1:
            s += ligne(px, y1, px, py) + txt(px, y1 + 11, str(num), 9.5, C_IC_TXT) + txt(px, y1 + 23, nom, 9, C_IC_TXT)
        else:
            s += ligne(px, y2, px, py) + txt(px, y2 - 11, str(num), 9.5, C_IC_TXT) + txt(px, y2 - 23, nom, 9, C_IC_TXT)
    return s + txt(0, 0, "NE555", 13)


# =============================================================================
#  Le montage
# =============================================================================
#  (repère, type, x, y, rotation, textes [(x, y, texte, taille, couleur, ancre)],
#   message de la barre d'état)
COMPOSANTS = [
    ("U1", "ne555", 0, 0, 0, [(50, -72, "U1", 13, C_TXT, "start")],
     "Placer · U1 — NE555, minuterie · DIP-8"),
    ("R1", "res", -180, -80, 90, [(-180, -80, "R1", 11, C_TXT, "middle"),
                                  (-200, -80, "10k", 12, C_VAL, "end")],
     "Placer · R1 — résistance 10 kΩ · 0603"),
    ("R2", "res", -180, 0, 90, [(-180, 0, "R2", 11, C_TXT, "middle"),
                                (-200, 0, "47k", 12, C_VAL, "end")],
     "Placer · R2 — résistance 47 kΩ · 0603"),
    ("C1", "chim", -180, 80, 90, [(-202, 72, "C1", 12, C_TXT, "end"),
                                  (-202, 89, "10µ", 12, C_VAL, "end")],
     "Placer · C1 — chimique 10 µF, la base de temps"),
    ("C2", "cap", 20, 120, 90, [(42, 112, "C2", 12, C_TXT, "start"),
                                (42, 129, "10n", 12, C_VAL, "start")],
     "Placer · C2 — 10 nF sur CTRL"),
    ("R3", "res", 160, 0, 0, [(160, 0, "R3", 11, C_TXT, "middle"),
                              (160, 25, "470", 12, C_VAL, "middle")],
     "Placer · R3 — 470 Ω, limite le courant de la LED"),
    ("D1", "led", 260, 80, 90, [(238, 72, "D1", 12, C_TXT, "end"),
                                (238, 89, "rouge", 12, C_VAL, "end")],
     "Placer · D1 — LED rouge · 0805"),
    ("+9V", "alim", -180, -160, 0, [(-180, -186, "+9V", 13, C_TXT, "middle")],
     "Placer · alimentation +9 V"),
    ("GND", "masse", 100, 180, 0, [], "Placer · masse"),
]

BROCHES = {
    "res": [(-40, 0), (40, 0)], "cap": [(-40, 0), (40, 0)], "chim": [(-40, 0), (40, 0)],
    "led": [(-40, 0), (40, 0)], "alim": [(0, 20)], "masse": [(0, -20)],
    "ne555": [p for _, _, p in NE555],
}

# fils, dans l'ordre du câblage : chaque fil est une polyligne
FILS = [
    [(-180, -140), (-180, -120)],                          # +9V → R1
    [(-180, -140), (20, -140), (20, -80)],                 # rail +9V → RESET
    [(-20, -140), (-20, -80)],                             # rail → VCC
    [(-180, -40), (-100, -40)],                            # DIS
    [(-100, 0), (-120, 0), (-120, 40)],                    # THR
    [(-180, 40), (-100, 40)],                              # TRIG
    [(-20, 80), (-20, 160)],                               # GND du NE555
    [(-180, 120), (-180, 160), (260, 160), (260, 120)],    # rail de masse
    [(100, 0), (120, 0)],                                  # OUT → R3
    [(200, 0), (260, 0), (260, 40)],                       # R3 → LED
]
JONCTIONS = [(-20, -140), (-180, -40), (-180, 40), (-120, 40),
             (-20, 160), (20, 160), (100, 160)]
# étiquettes de nets : (x du centre, y du fil, nom, couleur)
NETS = [(-100, -140, "+9V", "#4ade80"), (-140, -40, "DIS", "#c084fc"),
        (-150, 40, "TRIG", "#fb923c"), (230, 0, "OUT", "#facc15"),
        (180, 160, "GND", "#f87171")]

# simulation : NE555 astable, 9 V, R1 = 10k, R2 = 47k, C1 = 10 µF
VCC, R1, R2, C1 = 9.0, 10e3, 47e3, 10e-6
TAU_C, TAU_D = (R1 + R2) * C1, R2 * C1
SIM = 2.0                                     # secondes simulées = secondes animées


def simuler(pas=0.005):
    """V(C1) et OUT, au démarrage à vide : charge jusqu'à 2/3 Vcc, décharge
    jusqu'à 1/3 Vcc, etc. Renvoie les points et les intervalles OUT haut."""
    t, v, haut, debut = 0.0, 0.0, True, 0.0
    pts, hauts = [(0.0, 0.0)], []
    while t < SIM - 1e-9:
        t = min(SIM, t + pas)
        if haut:
            v = VCC - (VCC - v) * math.exp(-pas / TAU_C)
            if v >= 2 * VCC / 3:
                v, haut = 2 * VCC / 3, False
                hauts.append((debut, t))
        else:
            v = v * math.exp(-pas / TAU_D)
            if v <= VCC / 3:
                v, haut, debut = VCC / 3, True, t
        pts.append((t, v))
    if haut:
        hauts.append((debut, SIM + 1))
    return pts, hauts


# =============================================================================
#  Chronologie
# =============================================================================
T_POSE0, T_POSE_PAS = 0.55, 0.33
T_FIL0, T_FIL1 = 3.55, 6.55
T_ERC = 6.6
T_SIM = 7.4
T_FONDU = 9.45


def generer():
    pos_curseur = [(0.0, 720, 420), (0.15, 720, 420)]
    clics = []
    corps_svg = []
    etat = []

    def ecran(x, y):
        return (x + OX, y + OY)

    # --- composants -----------------------------------------------------------
    for i, (ref, typ, x, y, r, textes, message) in enumerate(COMPOSANTS):
        t = T_POSE0 + i * T_POSE_PAS
        sx, sy = ecran(x, y)
        pos_curseur += [(t - 0.24, None, None), (t - 0.05, sx, sy), (t + 0.06, sx, sy)]
        clics.append((t, sx, sy))
        etat.append((t - 0.05, t + T_POSE_PAS - 0.05 if i < len(COMPOSANTS) - 1 else T_FIL0, message))
        cls = apparait(t)
        cls_led = cls_fl = ""
        if typ == "ne555":
            dessin = sym_ne555()
        elif typ == "res":
            dessin = sym_resistance()
        elif typ == "cap":
            dessin = sym_condensateur()
        elif typ == "chim":
            dessin = sym_chimique()
            px, py = rot((-20, -20), r)
            textes = textes + [(x + px, y + py, "+", 14, C_TXT, "middle")]
        elif typ == "led":
            cls_led = "led-allumee"
            cls_fl = "led-allumee"
            dessin = sym_led(cls_led, cls_fl)
        elif typ == "alim":
            dessin = sym_alim()
        else:
            dessin = sym_masse()
        tourne = '<g transform="rotate(%g)">%s</g>' % (r, dessin) if r else dessin
        pastilles = "".join(
            '<circle cx="%.1f" cy="%.1f" r="2.6" fill="%s"/>' % (
                rot(p, r)[0], rot(p, r)[1], C_PIN) for p in BROCHES[typ])
        ecrits = "".join(txt(tx - x, ty - y, t_, sz, col, an) for tx, ty, t_, sz, col, an in textes)
        if typ == "led":
            halo = '<circle class="led-halo" cx="0" cy="0" r="34" fill="url(#halo)"/>'
        else:
            halo = ""
        corps_svg.append(
            '<g transform="translate(%g,%g)"><g class="%s">%s'
            '<g stroke="%s" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none">%s</g>'
            '%s%s</g></g>' % (x, y, cls, halo, C_COMP, tourne, pastilles, ecrits))

    # --- fils -----------------------------------------------------------------
    longueurs = [sum(abs(b[0] - a[0]) + abs(b[1] - a[1]) for a, b in zip(f, f[1:])) for f in FILS]
    aller, mini = 0.09, 0.1
    k = (T_FIL1 - T_FIL0 - len(FILS) * (aller + mini)) / sum(longueurs)
    t = T_FIL0
    fils_svg = []
    for f, lg in zip(FILS, longueurs):
        t += aller
        d = mini + lg * k
        pos_curseur.append((t, *ecran(*f[0])))
        tt = t
        for a, b in zip(f, f[1:]):
            tt += d * (abs(b[0] - a[0]) + abs(b[1] - a[1])) / lg
            pos_curseur.append((tt, *ecran(*b)))
        cls = anim([(t, "stroke-dashoffset:1"), (t + d, "stroke-dashoffset:0")])
        fils_svg.append('<path class="%s" d="M%s" pathLength="1" stroke-dasharray="1 2"/>' % (
            cls, " L".join("%g,%g" % p for p in f)))
        t += d
    etat.append((T_FIL0, T_ERC, "Câbler · fils accrochés à la grille, broche à broche"))

    # --- connectivité ---------------------------------------------------------
    jonctions = "".join(
        '<g transform="translate(%g,%g)"><circle class="%s" r="5" fill="%s"/></g>' % (
            x, y, apparait(T_ERC + i * 0.04, 0.18), C_RED) for i, (x, y) in enumerate(JONCTIONS))
    etiquettes = []
    for i, (cx, y, nom, col) in enumerate(NETS):
        w, h = largeur_texte(nom, 10.5) + 13, 17
        etiquettes.append(
            '<g transform="translate(%g,%g)"><g class="%s">'
            '<rect x="%g" y="%g" width="%g" height="%g" rx="4" fill="#16181c" stroke="%s" stroke-width="1.2"/>'
            '%s</g></g>' % (cx, y - h / 2 - 7, apparait(T_ERC + 0.25 + i * 0.07, 0.2),
                            -w / 2, -h / 2, w, h, col, txt(0, 0.5, nom, 10.5, col)))
    etat.append((T_ERC, T_SIM, "Vérifier · 7 nets, ERC : aucune erreur ✓"))

    # --- simulation -----------------------------------------------------------
    pts, hauts = simuler()
    allume = [(T_SIM + a, min(T_SIM + b, DUREE)) for a, b in hauts]
    cls_led = creneaux(allume)
    cls_halo = creneaux(allume, "0.95")
    cls_lueur = creneaux(allume, "0.32")
    eteint = [(T_SIM, allume[0][0])] + [(b, allume[i + 1][0]) for i, (a, b) in enumerate(allume[:-1])]
    cls_v_haut = creneaux(allume)
    cls_v_bas = creneaux([(a, b) for a, b in eteint if b > a])
    etat.append((T_SIM, T_FONDU + 0.3,
                 "Simuler · astable f ≈ 1,4 Hz, rapport cyclique 55 % — la LED clignote"))

    # sonde sur OUT, à la manière des sondes de l'éditeur
    sonde = (
        '<g class="%s">' % fondu(T_SIM - 0.1, 0.2) +
        ligne(110, -34, 110, 0, C_WIRE, 1.5) +
        '<circle cx="110" cy="0" r="3.2" fill="%s"/>' % C_WIRE +
        '<rect x="80" y="-58" width="60" height="24" rx="5" fill="#16181c" stroke="%s" stroke-width="1.6"/>' % C_WIRE +
        '<g class="%s">%s</g>' % (cls_v_haut, txt(110, -45.5, "8,7 V", 12, "#facc15")) +
        '<g class="%s">%s</g>' % (cls_v_bas, txt(110, -45.5, "0,1 V", 12, "#facc15")) +
        '</g>')
    lueur_out = ('<g class="%s" stroke="%s" stroke-width="11" stroke-linecap="round" fill="none">'
                 '<path d="M100,0 L120,0"/><path d="M200,0 L260,0 L260,40"/></g>' % (cls_lueur, C_WIRE))

    # oscilloscope
    ox0, ox1, oy0, oy1 = 578, 770, 82, 170
    def px(tm):
        return ox0 + (ox1 - ox0) * tm / SIM
    def py(v):
        return oy1 - (oy1 - oy0) * v / VCC
    trace_c = " L".join("%.1f,%.1f" % (px(tm), py(v)) for tm, v in pts)
    trace_out = []
    for i, (a, b) in enumerate(hauts):
        b = min(b, SIM)
        if i:
            trace_out += [(px(a), py(0.1))]
        trace_out += [(px(a), py(8.7)), (px(b), py(8.7))]
        if b < SIM:
            trace_out += [(px(b), py(0.1))]
    trace_out = " L".join("%.1f,%.1f" % p for p in trace_out)
    balayage = anim([(T_SIM, "transform:translateX(0px)"),
                     (T_SIM + SIM, "transform:translateX(%gpx)" % (ox1 - ox0 + 4))])
    seuils = "".join(
        '<line x1="%g" y1="%.1f" x2="%g" y2="%.1f" stroke="#3a3e46" stroke-dasharray="3 3"/>' % (
            ox0, py(v), ox1, py(v)) + txt(ox0 - 4, py(v), lab, 8, "#7c8490", "end", "600")
        for v, lab in [(VCC / 3, "⅓"), (2 * VCC / 3, "⅔")])
    graduations = "".join(
        ligne(px(s), oy1, px(s), oy1 + 3, "#555b64", 1) +
        txt(px(s), oy1 + 10, ("%d s" % s) if s else "0", 8, "#7c8490", "middle", "600")
        for s in (0, 1, 2))
    oscillo = (
        '<g class="%s">' % fondu(T_SIM - 0.25, 0.25) +
        '<rect x="560" y="40" width="224" height="158" rx="6" fill="#1b1c1f" stroke="#3a3d44"/>'
        '<rect x="560" y="40" width="3" height="158" fill="%s"/>' % C_WIRE +
        txt(572, 54, "Simulation transitoire · 2 s", 10.5, "#e5e7eb", "start") +
        '<rect x="%g" y="%g" width="%g" height="%g" fill="#141416"/>' % (ox0, oy0 - 6, ox1 - ox0, oy1 - oy0 + 6) +
        seuils + graduations +
        ligne(668, 68, 680, 68, "#facc15", 2) + txt(684, 68, "V(OUT)", 9, "#facc15", "start", "600") +
        ligne(720, 68, 732, 68, "#fb923c", 2) + txt(736, 68, "V(C1)", 9, "#fb923c", "start", "600") +
        '<path d="M%s" fill="none" stroke="#fb923c" stroke-width="1.8" stroke-linejoin="round"/>' % trace_c +
        '<path d="M%s" fill="none" stroke="#facc15" stroke-width="1.8" stroke-linejoin="round"/>' % trace_out +
        '<g clip-path="url(#ecran-oscillo)"><g class="%s">' % balayage +
        '<rect x="%g" y="%g" width="%g" height="%g" fill="#141416"/>' % (ox0, oy0 - 6, ox1 - ox0 + 8, oy1 - oy0 + 6) +
        ligne(ox0, oy0 - 6, ox0, oy1, C_SEL, 1.2) +
        '</g></g>' +
        txt(572, 190, "f ≈ 1,4 Hz · 55 % · R1 10k · R2 47k · C1 10µ", 8.5, "#9aa1ab", "start", "600") +
        '</g>')

    # --- curseur --------------------------------------------------------------
    # les étapes « None » reprennent la position précédente (départ du geste)
    pos, der = [], None
    for tm, x, y in sorted(pos_curseur, key=lambda p: p[0]):
        if x is None:
            x, y = der
        pos.append((tm, x, y))
        der = (x, y)
    fin_cur = T_FIL1 + 0.15
    pos.append((fin_cur + 0.4, der[0] + 60, der[1] + 30))
    cls_cur = anim([(tm, "transform:translate(%gpx,%gpx)" % (x, y)) for tm, x, y in pos])
    cls_cur_vis = fondu(0.1, 0.2, fin_cur, 0.35)
    curseur = (
        '<g class="%s"><g class="%s"><path d="M0,0 L0,17 L4.6,13 L7.6,20 L10.2,18.9 L7.3,12.4 L13,12.4 Z" '
        'fill="#fff" stroke="#111" stroke-width="1.1" stroke-linejoin="round"/></g></g>' % (cls_cur_vis, cls_cur))
    ondes = "".join(
        '<circle class="%s" cx="%g" cy="%g" r="16" fill="none" stroke="%s" stroke-width="2"/>' % (
            anim([(t - 0.01, "opacity:0;transform:scale(.2)"), (t, "opacity:.9;transform:scale(.3)"),
                  (t + 0.38, "opacity:0;transform:scale(1.6)")],
                 "transform-box:fill-box;transform-origin:center"), x, y, C_SEL)
        for t, x, y in clics)

    # --- barre d'état et étapes ----------------------------------------------
    etat.insert(0, (0.0, T_POSE0 - 0.05, "Nouvelle feuille · prête"))
    textes_etat = "".join(
        '<g class="%s">%s</g>' % (
            anim([(a + 0.04, "opacity:0"), (a + 0.1, "opacity:1"), (b, "opacity:1"), (b + 0.04, "opacity:0")]
                 if a > 0 else [(0, "opacity:1"), (b, "opacity:1"), (b + 0.04, "opacity:0")]),
            txt(16, H - 12, m, 11, "#d7dbe0", "start", "600"))
        for a, b, m in etat)
    etapes = [("1  Placer", T_POSE0 - 0.1, T_FIL0), ("2  Câbler", T_FIL0, T_ERC),
              ("3  Vérifier", T_ERC, T_SIM), ("4  Simuler", T_SIM, T_FONDU + 0.3)]
    puces, x = [], 476
    for nom, a, b in etapes:
        w = largeur_texte(nom, 10.5) + 18
        actif = anim([(a, "opacity:0"), (a + 0.12, "opacity:1"), (b, "opacity:1"), (b + 0.12, "opacity:0")])
        fait = anim([(b, "opacity:0"), (b + 0.12, "opacity:1"), (T_FONDU, "opacity:1"), (T_FONDU + 0.4, "opacity:0")])
        puces.append(
            '<rect x="%g" y="5" width="%g" height="17" rx="8.5" fill="#24272c" stroke="#3a3d44"/>' % (x, w) +
            txt(x + w / 2, 13.5, nom, 10.5, "#80868f", "middle", "600") +
            '<g class="%s"><rect x="%g" y="5" width="%g" height="17" rx="8.5" fill="#1d3a55" stroke="%s"/>%s</g>' % (
                fait, x, w, "#2f6c9e", txt(x + w / 2, 13.5, nom, 10.5, "#9cc9ee", "middle", "600")) +
            '<g class="%s"><rect x="%g" y="5" width="%g" height="17" rx="8.5" fill="%s" stroke="%s"/>%s</g>' % (
                actif, x, w, C_FILL, C_SEL, txt(x + w / 2, 13.5, nom, 10.5, C_TXT, "middle", "bold")))
        x += w + 8

    scene = fondu(0, 0.0, T_FONDU, 0.4)

    # --- assemblage -----------------------------------------------------------
    grille_min = ('<pattern id="g1" width="20" height="20" patternUnits="userSpaceOnUse" x="%d" y="%d">'
                  '<path d="M20,0 L0,0 L0,20" fill="none" stroke="%s" stroke-width="1"/></pattern>'
                  % (OX % 20, OY % 20, C_GRID))
    grille_maj = ('<pattern id="g2" width="100" height="100" patternUnits="userSpaceOnUse" x="%d" y="%d">'
                  '<path d="M100,0 L0,0 L0,100" fill="none" stroke="%s" stroke-width="1"/></pattern>'
                  % (OX % 100, OY % 100, C_GRIDMAJ))
    svg = [
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" width="%d" height="%d" '
        'font-family="%s" role="img" aria-labelledby="titre desc">' % (W, H, W, H, POLICE),
        '<title id="titre">WEB_CAO — saisie d\'un clignoteur à NE555</title>',
        '<desc id="desc">Animation de 10 secondes dans l\'Éditeur Schématique : placement d\'un NE555, '
        'de R1 10k, R2 47k, C1 10 µF, C2 10 nF, R3 470 Ω et d\'une LED, câblage en astable, '
        'vérification des nets puis simulation transitoire où la LED clignote à 1,4 Hz.</desc>',
        '<defs>', grille_min, grille_maj,
        '<radialGradient id="halo"><stop offset="0" stop-color="#ff3b30" stop-opacity=".75"/>'
        '<stop offset=".45" stop-color="#ff3b30" stop-opacity=".25"/>'
        '<stop offset="1" stop-color="#ff3b30" stop-opacity="0"/></radialGradient>',
        '<clipPath id="ecran-oscillo"><rect x="%g" y="%g" width="%g" height="%g"/></clipPath>' % (
            ox0, oy0 - 6, ox1 - ox0 + 1, oy1 - oy0 + 7),
        '<style>%s</style>' % "".join(css + [
            ".led-allumee{opacity:0;animation:%s %gs linear infinite}" % (cls_led, DUREE),
            ".led-halo{opacity:0;animation:%s %gs linear infinite}" % (cls_halo, DUREE),
            "@media (prefers-reduced-motion:reduce){*{animation-duration:0s!important}}",
        ]),
        '</defs>',
        '<rect width="%d" height="%d" fill="%s"/>' % (W, H, C_BG),
        '<rect width="%d" height="%d" fill="url(#g1)"/>' % (W, H),
        '<rect width="%d" height="%d" fill="url(#g2)"/>' % (W, H),
        '<g class="%s">' % scene,
        '<g transform="translate(%d,%d)">' % (OX, OY),
        lueur_out,
        '<g stroke="%s" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" fill="none">' % C_WIRE,
        "".join(fils_svg), '</g>',
        "".join(corps_svg), jonctions, "".join(etiquettes), sonde,
        '</g>', oscillo, '</g>',
        ondes, curseur,
        # barre de titre
        '<rect width="%d" height="27" fill="%s"/>' % (W, C_BAR),
        ligne(0, 27.5, W, 27.5, C_BAR_BORD, 1),
        '<rect x="12" y="7" width="13" height="13" rx="3" fill="%s"/>' % C_FILL,
        ligne(15, 13.5, 22, 13.5, C_WIRE, 2),
        txt(32, 13.5, "WEB_CAO", 12, C_TXT, "start"),
        txt(102, 13.5, "Éditeur Schématique — astable_ne555 · Feuille 1", 11, C_BAR_TXT, "start", "600"),
        "".join(puces),
        # barre d'état
        '<rect y="%d" width="%d" height="24" fill="%s"/>' % (H - 24, W, C_BAR),
        ligne(0, H - 24.5, W, H - 24.5, C_BAR_BORD, 1),
        textes_etat,
        txt(W - 14, H - 12, "1 carré = 1 mm", 10.5, C_BAR_TXT, "end", "600"),
        '</svg>',
    ]
    return "\n".join(svg) + "\n"


if __name__ == "__main__":
    chemin = os.path.join(os.path.dirname(os.path.abspath(__file__)), "schematique-ne555.svg")
    with open(chemin, "w", encoding="utf-8") as f:
        f.write(generer())
    print("écrit :", chemin, "(%d octets)" % os.path.getsize(chemin))
