#!/usr/bin/env python3
"""Génère screen/schematique-carte-usb.svg : 10 s de saisie, dans l'Éditeur
Schématique, du schéma de la carte USB 4 couches — la même carte que
l'animation de l'Éditeur PCB (screen/pcb-4-couches.svg).

    python screen/generer_animation_schema.py

Mêmes repères, mêmes nets que le PCB : connecteur USB micro-B (J1),
protection ESD (U3), régulateur 3,3 V (U2), STM32G431KB (U1) et son
découplage, quartz 8 MHz (Y1), Flash SPI (U4), connecteur SWD (J2) et LED.

Déroulé : placement bloc par bloc, câblage, vérification (ERC, étiquettes et
jonctions), puis envoi de la netlist vers l'Éditeur PCB.

Avant d'écrire le fichier, le script vérifie le schéma : chaque broche est
reliée au net qu'on lui destine, aucun net n'en touche un autre, et pour
chaque composant les nets du schéma sont exactement ceux de ses pastilles sur
le PCB (lus dans generer_animation_pcb.py). Un écart arrête la génération.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import generer_animation_pcb as pcb  # noqa: E402

DUREE = 10.0
W, H = 880, 600
C_BG, C_GRID, C_GRIDMAJ = "#141416", "#232529", "#32353c"
C_WIRE, C_COMP, C_FILL = "#f2c744", "#4fa8e8", "#2f86cc"
C_RED, C_TXT, C_SEL = "#e8443a", "#ffffff", "#8af0ff"
C_PIN, C_ICT, C_VAL = "#8fd0ff", "#cfe6fb", "#c9ced6"
C_BAR, C_BAR_BORD, C_BAR_TXT = "#1b1d21", "#2c2f35", "#aeb4bd"
POLICE = "'Segoe UI',system-ui,-apple-system,sans-serif"
TRAIT = 2.2

css = []
_n = [0]


def pc(t):
    return "%.2f%%" % (max(0.0, min(DUREE, t)) / DUREE * 100)


def anim(etapes, extra=""):
    _n[0] += 1
    nom = "a%d" % _n[0]
    etapes = sorted(etapes, key=lambda e: e[0])
    if etapes[0][0] > 0:
        etapes.insert(0, (0.0, etapes[0][1]))
    if etapes[-1][0] < DUREE:
        etapes.append((DUREE, etapes[-1][1]))
    css.append("@keyframes %s{%s}" % (nom, "".join("%s{%s}" % (pc(t), v) for t, v in etapes)))
    css.append(".%s{animation:%s %gs linear infinite;%s}" % (nom, nom, DUREE, extra))
    return nom


def apparait(t, duree=0.24):
    return anim([(t - 0.01, "opacity:0;transform:scale(.6)"), (t, "opacity:.6;transform:scale(.75)"),
                 (t + duree * 0.5, "opacity:1;transform:scale(1.08)"), (t + duree, "opacity:1;transform:scale(1)")],
                "transform-box:fill-box;transform-origin:center")


def fondu(t, duree=0.2, fin=None, fin_duree=0.2):
    e = [(t, "opacity:0"), (t + duree, "opacity:1")]
    if fin is not None:
        e += [(fin, "opacity:1"), (fin + fin_duree, "opacity:0")]
    return anim(e)


def largeur(t, taille):
    return sum(taille * (0.3 if c in "il1.,:;|' ·()" else 0.6) for c in t)


def txt(x, y, t, taille=10, col=C_TXT, ancre="middle", poids="bold"):
    return ('<text x="%g" y="%g" font-size="%g" fill="%s" text-anchor="%s" font-weight="%s" '
            'dominant-baseline="central" stroke="none">%s</text>' % (x, y, taille, col, ancre, poids, t))


def L(x1, y1, x2, y2, col=None, ep=None):
    s = ""
    if col:
        s += ' stroke="%s"' % col
    if ep:
        s += ' stroke-width="%g"' % ep
    return '<line x1="%g" y1="%g" x2="%g" y2="%g"%s/>' % (x1, y1, x2, y2, s)


# =============================================================================
#  Symboles : chacun rend (dessin, textes, broches [(ref.broche, x, y, net)])
# =============================================================================
SYMBOLES = []      # (bloc, ref, dessin, textes, broches)


def poser(bloc, ref, dessin, textes, broches):
    SYMBOLES.append((bloc, ref, dessin, textes, broches))


def ic(bloc, ref, val, x1, y1, x2, y2, broches, ref_pos=None, val_pos=None, sous=None):
    """Boîtier rectangulaire ; broches = [(côté, position, nom, net)]."""
    d = '<rect x="%g" y="%g" width="%g" height="%g" rx="4" fill="%s"/>' % (x1, y1, x2 - x1, y2 - y1, C_FILL)
    t, pins = "", []
    for cote, pos, nom, net in broches:
        if cote == "L":
            px, py, ix, iy = x1 - 30, pos, x1, pos
            t += txt(x1 + 6, pos, nom, 9.5, C_ICT, "start")
        elif cote == "R":
            px, py, ix, iy = x2 + 30, pos, x2, pos
            t += txt(x2 - 6, pos, nom, 9.5, C_ICT, "end")
        elif cote == "T":
            px, py, ix, iy = pos, y1 - 30, pos, y1
            t += txt(pos, y1 + 11, nom, 9, C_ICT)
        else:
            px, py, ix, iy = pos, y2 + 30, pos, y2
            t += txt(pos, y2 - 11, nom, 9, C_ICT)
        d += L(ix, iy, px, py)
        if not net:
            t += ('<g stroke="%s" stroke-width="2.2">%s%s</g>' % (
                C_RED, L(px - 5, py - 5, px + 5, py + 5), L(px - 5, py + 5, px + 5, py - 5)))
        pins.append(("%s.%s" % (ref, nom), px, py, net))
    rx, ry = ref_pos or ((x1 + x2) / 2, y1 - 12)
    t += txt(rx, ry, ref, 12.5, C_TXT)
    vx, vy, va = val_pos or ((x1 + x2) / 2, y2 + 14, "middle")
    t += txt(vx, vy, val, 10, C_VAL, va, "600")
    if sous:
        t += txt(sous[0], sous[1], sous[2], 9, "#9cc9ee", "middle", "600")
    poser(bloc, ref, d, t, pins)


def resistance(bloc, ref, val, xa, xb, y, na, nb):
    m = (xa + xb) / 2
    d = (L(xa, y, m - 18, y) + L(m + 18, y, xb, y) +
         '<rect x="%g" y="%g" width="36" height="14" rx="3" fill="%s"/>' % (m - 18, y - 7, C_FILL))
    t = txt(m, y + 0.5, ref, 9.5) + txt(m, y - 16, val, 9.5, C_VAL, "middle", "600")
    poser(bloc, ref, d, t, [(ref + ".1", xa, y, na), (ref + ".2", xb, y, nb)])


def condo(bloc, ref, val, x, ya, yb, na, nb, cote=1):
    m = (ya + yb) / 2
    d = (L(x, ya, x, m - 3) + L(x, m + 3, x, yb) +
         L(x - 9, m - 3, x + 9, m - 3, ep=3.4) + L(x - 9, m + 3, x + 9, m + 3, ep=3.4))
    an = "start" if cote > 0 else "end"
    t = txt(x + 13 * cote, m - 7, ref, 9.5, C_TXT, an) + txt(x + 13 * cote, m + 7, val, 9, C_VAL, an, "600")
    poser(bloc, ref, d, t, [(ref + ".1", x, ya, na), (ref + ".2", x, yb, nb)])


def led(bloc, ref, val, xa, xb, y, na, nk):
    m = (xa + xb) / 2
    d = (L(xa, y, m - 8, y) + L(m + 8, y, xb, y) +
         '<polygon points="%g,%g %g,%g %g,%g" fill="%s"/>' % (m - 8, y - 9, m - 8, y + 9, m + 8, y, C_FILL) +
         L(m + 8, y - 9, m + 8, y + 9, ep=3.4) +
         L(m - 2, y - 12, m + 4, y - 19) + L(m + 4, y - 12, m + 10, y - 19))
    t = txt(m, y + 18, ref, 9.5) + txt(m, y + 31, val, 9, C_VAL, "middle", "600")
    poser(bloc, ref, d, t, [(ref + ".A", xa, y, na), (ref + ".K", xb, y, nk)])


def quartz(bloc, ref, val, xa, xb, y, na, nb):
    m = (xa + xb) / 2
    d = (L(xa, y, m - 9, y) + L(m + 9, y, xb, y) + L(m - 9, y - 9, m - 9, y + 9, ep=3) +
         L(m + 9, y - 9, m + 9, y + 9, ep=3) +
         '<rect x="%g" y="%g" width="10" height="20" rx="1.5" fill="%s"/>' % (m - 5, y - 10, C_FILL))
    t = txt(m, y - 32, ref, 9.5) + txt(m, y - 19, val, 9, C_VAL, "middle", "600")
    poser(bloc, ref, d, t, [(ref + ".1", xa, y, na), (ref + ".2", xb, y, nb)])


ALIMS = []         # (bloc, nom, x, y)


def vcc(bloc, x, y, nom="+3V3"):
    ALIMS.append((bloc, nom, x, y))


def gnd(bloc, x, y):
    ALIMS.append((bloc, "GND", x, y))


def svg_alim(nom, x, y):
    if nom == "GND":
        return ('<g stroke="%s" stroke-width="%g" stroke-linecap="round">%s%s%s%s</g>' % (
            C_RED, TRAIT, L(x, y, x, y + 12), L(x - 12, y + 12, x + 12, y + 12, ep=3.6),
            L(x - 7, y + 16, x + 7, y + 16, ep=3.6), L(x - 3, y + 20, x + 3, y + 20, ep=3.6)))
    return ('<g stroke-linecap="round">%s%s</g>%s' % (
        L(x, y, x, y - 12, C_WIRE, TRAIT), L(x - 12, y - 12, x + 12, y - 12, C_RED, 3.6),
        txt(x, y - 23, nom, 10.5, C_TXT)))


FILS = []          # (bloc, points)
ETIQUETTES = []    # (x, y du fil, nom, couleur) — étiquettes de net posées sur un fil
DRAPEAUX = []      # (bloc, x, y, nom) — étiquettes globales, broche à gauche ou à droite


def fil(bloc, *pts):
    FILS.append((bloc, [tuple(map(float, p)) for p in pts]))


# =============================================================================
#  Le schéma
# =============================================================================
# --- entrée USB -------------------------------------------------------------------
ic("usb", "J1", "USB micro-B", 30, 120, 100, 280,
   [("R", 140, "VBUS", "VBUS"), ("R", 170, "D−", "USB_DM"), ("R", 200, "D+", "USB_DP"),
    ("R", 222, "ID", ""), ("R", 244, "GND", "GND"), ("R", 266, "SH", "GND")],
   val_pos=(65, 294, "middle"))
fil("usb", (130, 244), (150, 244), (150, 266))
fil("usb", (130, 266), (150, 266))
gnd("usb", 150, 266)
ic("usb", "U3", "USBLC6-2SC6", 205, 150, 295, 220,
   [("L", 170, "1 IO1", "USB_DM"), ("L", 200, "3 IO2", "USB_DP"), ("R", 170, "IO1 6", "USB_DM"),
    ("R", 200, "IO2 4", "USB_DP"), ("T", 250, "5 VBUS", "VBUS"), ("B", 250, "2 GND", "GND")],
   ref_pos=(196, 140), val_pos=(270, 262, "start"))
gnd("usb", 250, 250)
fil("usb", (130, 140), (150, 140), (150, 110), (280, 110))
fil("usb", (250, 110), (250, 120))
fil("usb", (130, 170), (175, 170))
fil("usb", (130, 200), (175, 200))
fil("usb", (325, 170), (370, 170))
fil("usb", (325, 200), (370, 200))
DRAPEAUX.append(("usb", 280, 110, "VBUS"))
ETIQUETTES += [(152, 170, "USB_DM", "#facc15"), (152, 200, "USB_DP", "#facc15"),
               (347, 170, "USB_DM", "#facc15"), (347, 200, "USB_DP", "#facc15")]

# --- régulateur 3,3 V ---------------------------------------------------------------
ic("alim", "U2", "AP2112K-3.3", 170, 460, 250, 520,
   [("L", 475, "VIN", "VBUS"), ("L", 505, "EN", "VBUS"), ("R", 475, "VOUT", "+3V3"),
    ("R", 505, "NC", ""), ("B", 210, "GND", "GND")],
   val_pos=(262, 540, "start"))
gnd("alim", 210, 550)
DRAPEAUX.append(("alim", 80, 475, "VBUS"))
fil("alim", (80, 475), (140, 475))
fil("alim", (140, 505), (140, 475))
condo("alim", "C1", "1µ", 110, 475, 515, "VBUS", "GND", -1)
gnd("alim", 110, 515)
fil("alim", (280, 475), (330, 475))
vcc("alim", 330, 475)
condo("alim", "C2", "1µ", 305, 475, 515, "+3V3", "GND")
gnd("alim", 305, 515)

# --- microcontrôleur et découplage ------------------------------------------------------
ic("mcu", "U1", "STM32G431KB", 400, 140, 540, 430,
   [("L", 170, "PA11", "USB_DM"), ("L", 200, "PA12", "USB_DP"), ("L", 370, "PA13", "SWDIO"),
    ("L", 395, "PA14", "SWCLK"),
    ("R", 185, "PA4", "SPI_CS"), ("R", 210, "PA5", "SPI_SCK"), ("R", 235, "PA6", "SPI_MISO"),
    ("R", 260, "PA7", "SPI_MOSI"), ("R", 340, "PA8", "LED"),
    ("T", 420, "VDD", "+3V3"), ("T", 450, "VDD", "+3V3"), ("T", 480, "VDD", "+3V3"),
    ("T", 510, "VDDA", "+3V3"),
    ("B", 430, "VSS", "GND"), ("B", 480, "PF0", "OSC_IN"), ("B", 520, "PF1", "OSC_OUT")],
   ref_pos=(470, 275), val_pos=(470, 295, "middle"), sous=(470, 312, "LQFP-32"))
vcc("mcu", 390, 85)
fil("mcu", (390, 85), (700, 85))
for x in (420, 450, 480, 510):
    fil("mcu", (x, 110), (x, 85))
for i, x in enumerate((565, 610, 655, 700)):
    condo("mcu", "C%d" % (3 + i), "100n", x, 85, 125, "+3V3", "GND")
    gnd("mcu", x, 125)
gnd("mcu", 430, 460)

# --- quartz 8 MHz -----------------------------------------------------------------------
fil("quartz", (480, 460), (480, 490))
fil("quartz", (520, 460), (520, 490))
quartz("quartz", "Y1", "8 MHz", 480, 520, 490, "OSC_IN", "OSC_OUT")
condo("quartz", "C8", "12p", 480, 490, 525, "OSC_IN", "GND", -1)
condo("quartz", "C9", "12p", 520, 490, 525, "OSC_OUT", "GND")
gnd("quartz", 480, 525)
gnd("quartz", 520, 525)

# --- Flash SPI ------------------------------------------------------------------------------
ic("flash", "U4", "W25Q32JV", 660, 170, 740, 275,
   [("L", 185, "/CS", "SPI_CS"), ("L", 210, "CLK", "SPI_SCK"), ("L", 235, "DO", "SPI_MISO"),
    ("L", 260, "DI", "SPI_MOSI"), ("R", 185, "VCC", "+3V3"), ("R", 210, "/WP", "+3V3"),
    ("R", 235, "/HOLD", "+3V3"), ("B", 700, "GND", "GND")],
   ref_pos=(700, 158), val_pos=(712, 292, "start"))
gnd("flash", 700, 305)
for y, nom in ((185, "SPI_CS"), (210, "SPI_SCK"), (235, "SPI_MISO"), (260, "SPI_MOSI")):
    fil("flash", (570, y), (630, y))
    ETIQUETTES.append((600, y, nom, "#c084fc"))
fil("flash", (770, 185), (790, 185))
fil("flash", (770, 210), (790, 210))
fil("flash", (770, 235), (790, 235), (790, 185), (790, 165))
vcc("flash", 790, 165)
fil("flash", (790, 185), (825, 185))
condo("flash", "C7", "100n", 825, 185, 225, "+3V3", "GND")
gnd("flash", 825, 225)

# --- SWD ------------------------------------------------------------------------------------
ic("swd", "J2", "SWD", 30, 330, 80, 430,
   [("R", 345, "1", "+3V3"), ("R", 370, "2", "SWDIO"), ("R", 395, "3", "SWCLK"), ("R", 420, "4", "GND")],
   val_pos=(55, 444, "middle"))
fil("swd", (110, 345), (130, 345))
vcc("swd", 130, 345)
fil("swd", (110, 420), (130, 420))
gnd("swd", 130, 420)
fil("swd", (110, 370), (370, 370))
fil("swd", (110, 395), (370, 395))
ETIQUETTES += [(240, 370, "SWDIO", "#22d3ee"), (240, 395, "SWCLK", "#22d3ee")]

# --- LED ------------------------------------------------------------------------------------
resistance("led", "R1", "1k", 590, 650, 340, "LED", "N_LED")
led("led", "D1", "LED", 670, 730, 340, "N_LED", "GND")
fil("led", (570, 340), (590, 340))
fil("led", (650, 340), (670, 340))
fil("led", (730, 340), (760, 340))
gnd("led", 760, 340)


# =============================================================================
#  Vérification : nets du schéma, et accord avec le PCB
# =============================================================================
def sur(p, a, b):
    (x, y), (x1, y1), (x2, y2) = p, a, b
    if x1 == x2 == x:
        return min(y1, y2) <= y <= max(y1, y2)
    if y1 == y2 == y:
        return min(x1, x2) <= x <= max(x1, x2)
    return False


def verifier():
    parent = {}

    def tr(k):
        parent.setdefault(k, k)
        while parent[k] != k:
            parent[k] = parent[parent[k]]
            k = parent[k]
        return k

    def un(a, b):
        parent[tr(a)] = tr(b)

    segs = [(i, a, b) for i, (_, f) in enumerate(FILS) for a, b in zip(f, f[1:])]
    broches = [(nom, x, y, net) for _, _, _, _, ps in SYMBOLES for nom, x, y, net in ps]
    points = [(("b", nom), (x, y)) for nom, x, y, _ in broches]
    points += [(("a", i), (x, y)) for i, (_, nom, x, y) in enumerate(ALIMS)]
    points += [(("d", i), (x, y)) for i, (_, x, y, _) in enumerate(DRAPEAUX)]
    points += [(("e", i), (x, y)) for i, (x, y, _, _) in enumerate(ETIQUETTES)]
    points += [(("x", i, j), p) for i, (_, f) in enumerate(FILS) for j, p in enumerate(f)]
    for k, p in points:
        for i, a, b in segs:
            if sur(p, a, b):
                un(k, ("f", i))
    # broches posées l'une sur l'autre (alimentation, capacité au bout d'un fil…)
    for i, (k1, p1) in enumerate(points):
        for k2, p2 in points[i + 1:]:
            if p1 == p2:
                un(k1, k2)
    # les noms relient : alimentations, étiquettes globales et étiquettes de net
    for i, (_, nom, _, _) in enumerate(ALIMS):
        un(("a", i), ("nom", nom))
    for i, (_, _, _, nom) in enumerate(DRAPEAUX):
        un(("d", i), ("nom", nom))
    for i, (_, _, nom, _) in enumerate(ETIQUETTES):
        un(("e", i), ("nom", nom))
    erreurs = []
    nets = {}
    for nom, x, y, net in broches:
        if not net:
            continue
        r = tr(("b", nom))
        nets.setdefault(r, set()).add(net)
        isole = not any(sur((x, y), a, b) for _, a, b in segs) and \
            not any((x, y) == (ax, ay) for _, _, ax, ay in ALIMS)
        if isole:
            erreurs.append("%s : broche reliée à rien" % nom)
    for r, noms in nets.items():
        if len(noms) > 1:
            erreurs.append("nets confondus : %s" % ", ".join(sorted(noms)))
    par_nom = {}
    for r, noms in nets.items():
        for n in noms:
            par_nom.setdefault(n, set()).add(r)
    for n, rs in par_nom.items():
        if len(rs) > 1:
            erreurs.append("net %s coupé en %d morceaux" % (n, len(rs)))
    # accord avec le PCB : chaque composant touche les mêmes nets
    sch = {}
    for _, ref, _, _, ps in SYMBOLES:
        sch[ref] = {net for _, _, _, net in ps if net}
    for ref, _, pads, _, _ in pcb.EMPREINTES:
        if ref.startswith("H"):
            continue                       # trous de fixation : pas de symbole
        nets_pcb = {p.net for p in pads if p.net}
        if sch.get(ref) != nets_pcb:
            erreurs.append("%s : schéma %s / PCB %s" % (ref, sorted(sch.get(ref, [])), sorted(nets_pcb)))
    manquants = set(sch) - {e[0] for e in pcb.EMPREINTES}
    if manquants:
        erreurs.append("absents du PCB : %s" % ", ".join(sorted(manquants)))
    if erreurs:
        sys.exit("\n".join(erreurs))
    # jonctions : au moins trois branches au même point
    jonctions = []
    cands = {p for _, f in FILS for p in f}
    for p in sorted(cands):
        n = sum(1 for _, x, y, _ in broches if (x, y) == p)
        n += sum(1 for _, _, x, y in ALIMS if (x, y) == p)
        for _, a, b in segs:
            n += 1 if p in (a, b) else (2 if sur(p, a, b) else 0)
        if n >= 3:
            jonctions.append(p)
    return len(par_nom), jonctions, len(SYMBOLES)


# =============================================================================
#  Chronologie et rendu
# =============================================================================
BLOCS = [("usb", 0.35, "Placement · entrée USB : micro-B J1 et protection ESD U3"),
         ("alim", 0.8, "Placement · régulateur 3,3 V U2, C1 et C2"),
         ("mcu", 1.25, "Placement · STM32G431KB et un 100 nF par broche d'alimentation"),
         ("quartz", 1.75, "Placement · quartz 8 MHz et ses capacités de charge"),
         ("flash", 2.1, "Placement · Flash SPI W25Q32 et son découplage"),
         ("swd", 2.5, "Placement · connecteur de programmation SWD"),
         ("led", 2.8, "Placement · LED témoin")]
T_FIL0, T_FIL1 = 3.3, 6.45
T_ERC = 6.55
T_PCB = 7.4
T_FONDU = 9.45


def generer():
    nb_nets, jonctions, nb_comp = verifier()
    t_bloc = {b: t for b, t, _ in BLOCS}
    etat = [(0.0, BLOCS[0][1] - 0.05, "Nouvelle feuille · carte_usb_4c")]
    for i, (b, t, m) in enumerate(BLOCS):
        etat.append((t - 0.05, (BLOCS[i + 1][1] if i + 1 < len(BLOCS) else T_FIL0) - 0.05, m))

    # symboles et alimentations
    corps = []
    for bloc, ref, d, t, ps in SYMBOLES:
        tp = t_bloc[bloc] + 0.06 * [s[1] for s in SYMBOLES if s[0] == bloc].index(ref)
        pastilles = "".join('<circle cx="%g" cy="%g" r="2.2" fill="%s"/>' % (x, y, C_PIN) for _, x, y, _ in ps)
        corps.append('<g class="%s"><g stroke="%s" stroke-width="%g" stroke-linecap="round" '
                     'stroke-linejoin="round" fill="none">%s</g>%s%s</g>' % (
                         apparait(tp), C_COMP, TRAIT, d, pastilles, t))
    for i, (bloc, nom, x, y) in enumerate(ALIMS):
        corps.append('<g class="%s">%s</g>' % (apparait(t_bloc[bloc] + 0.25 + 0.02 * (i % 5), 0.2),
                                               svg_alim(nom, x, y)))
    for bloc, x, y, nom in DRAPEAUX:
        w = largeur(nom, 10.5) + 22
        if x < 200:                               # drapeau à gauche de sa broche
            pts = [(x, y), (x - 10, y - 10), (x - w, y - 10), (x - w, y + 10), (x - 10, y + 10)]
            cx = x - w / 2 - 4
        else:
            pts = [(x, y), (x + 10, y - 10), (x + w, y - 10), (x + w, y + 10), (x + 10, y + 10)]
            cx = x + w / 2 + 4
        corps.append('<g class="%s"><polygon points="%s" fill="%s" stroke="%s" stroke-width="2"/>%s</g>' % (
            apparait(t_bloc[bloc] + 0.2, 0.2), " ".join("%g,%g" % p for p in pts), C_FILL, C_COMP,
            txt(cx, y + 0.5, nom, 10.5)))

    # fils, bloc par bloc
    fils_svg = []
    ordre = [b for b, _, _ in BLOCS]
    pas_bloc = (T_FIL1 - T_FIL0) / len(ordre)
    for k, b in enumerate(ordre):
        lot = [f for bb, f in FILS if bb == b]
        t0 = T_FIL0 + k * pas_bloc
        for i, f in enumerate(lot):
            t = t0 + i * min(0.05, pas_bloc * 0.4 / max(1, len(lot)))
            cls = anim([(t, "stroke-dashoffset:1"), (t + pas_bloc * 0.55, "stroke-dashoffset:0")])
            fils_svg.append('<path class="%s" d="M%s" pathLength="1" stroke-dasharray="1 2"/>' % (
                cls, " L".join("%g,%g" % p for p in f)))
        etat.append((t0, t0 + pas_bloc, "Câblage · %s" % dict((b, m.split(" · ")[1]) for b, _, m in BLOCS)[b]))

    # vérification : jonctions puis étiquettes de net
    dots = "".join('<circle class="%s" cx="%g" cy="%g" r="4.2" fill="%s"/>' % (
        apparait(T_ERC + 0.3 * i / len(jonctions), 0.16), x, y, C_RED) for i, (x, y) in enumerate(jonctions))
    pills = []
    for i, (x, y, nom, col) in enumerate(ETIQUETTES):
        w, h = largeur(nom, 10) + 12, 16
        pills.append('<g transform="translate(%g,%g)"><g class="%s"><rect x="%g" y="%g" width="%g" height="%g" '
                     'rx="4" fill="#16181c" stroke="%s" stroke-width="1.2"/>%s</g></g>' % (
                         x, y - h / 2 - 5, apparait(T_ERC + 0.3 + 0.04 * i, 0.2), -w / 2, -h / 2, w, h, col,
                         txt(0, 0.5, nom, 10, col)))
    etat.append((T_ERC, T_PCB, "ERC · %d composants, %d nets, %d jonctions — aucune erreur ✓"
                 % (nb_comp, nb_nets, len(jonctions))))

    # envoi vers le PCB
    px0, py0, pw = 586, 384, 280
    lignes = [("NETLIST → ÉDITEUR PCB", "#9aa1ab", 9, "700"),
              ("%d composants, chacun avec son empreinte" % nb_comp, "#e5e7eb", 10.5, "600"),
              ("LQFP-32 · SOIC-8 · SOT-23-6 · SOT-23-5", "#9cc9ee", 10, "600"),
              ("micro-B · SWD 1×4 · 0402 · 0603 · quartz", "#9cc9ee", 10, "600"),
              ("%d nets transmis : GND, +3V3, VBUS," % nb_nets, "#e5e7eb", 10.5, "600"),
              ("USB_DP/DM, SPI ×4, SWD ×2, OSC, LED", "#e5e7eb", 10.5, "600")]
    contenu = ""
    for i, (s, col, taille, poids) in enumerate(lignes):
        contenu += '<g class="%s">%s</g>' % (fondu(T_PCB + 0.15 + 0.18 * i, 0.15),
                                              txt(px0 + 14, py0 + 18 + 22 * i, s, taille, col, "start", poids))
    yb = py0 + 18 + 22 * len(lignes) + 4
    contenu += ('<g class="%s"><rect x="%g" y="%g" width="%g" height="24" rx="5" fill="%s" stroke="%s"/>%s</g>'
                % (apparait(T_PCB + 1.4, 0.25), px0 + 14, yb, pw - 28, C_FILL, C_SEL,
                   txt(px0 + pw / 2, yb + 12.5, "Pousser vers le PCB ✓", 11.5)))
    panneau = ('<g class="%s"><rect x="%g" y="%g" width="%g" height="%g" rx="6" fill="#1b1d21" '
               'fill-opacity=".97" stroke="#3a3d44"/>%s</g>' % (
                   fondu(T_PCB, 0.2), px0, py0, pw, yb + 34 - py0, contenu))
    etat.append((T_PCB, T_FONDU + 0.3, "Envoi vers l'Éditeur PCB · %d composants, %d nets — même carte, mêmes repères"
                 % (nb_comp, nb_nets)))

    # barres
    textes_etat = "".join(
        '<g class="%s">%s</g>' % (
            anim([(a + 0.04, "opacity:0"), (a + 0.1, "opacity:1"), (b, "opacity:1"), (b + 0.04, "opacity:0")]
                 if a > 0 else [(0, "opacity:1"), (b, "opacity:1"), (b + 0.04, "opacity:0")]),
            txt(16, H - 12, m, 11, "#d7dbe0", "start", "600"))
        for a, b, m in etat)
    etapes = [("1  Placement", 0.0, T_FIL0), ("2  Câblage", T_FIL0, T_ERC),
              ("3  ERC", T_ERC, T_PCB), ("4  → PCB", T_PCB, T_FONDU + 0.3)]
    puces, x = [], 530
    for nom, a, b in etapes:
        w = largeur(nom, 10.5) + 18
        actif = anim([(a, "opacity:0"), (a + 0.12, "opacity:1"), (b, "opacity:1"), (b + 0.12, "opacity:0")]
                     if a > 0 else [(0, "opacity:1"), (b, "opacity:1"), (b + 0.12, "opacity:0")])
        fait = (anim([(b, "opacity:0"), (b + 0.12, "opacity:1"), (T_FONDU, "opacity:1"), (T_FONDU + 0.4, "opacity:0")])
                if b < T_FONDU else anim([(0, "opacity:0")]))
        puces.append(
            '<rect x="%g" y="5" width="%g" height="17" rx="8.5" fill="#24272c" stroke="#3a3d44"/>' % (x, w) +
            txt(x + w / 2, 13.5, nom, 10.5, "#80868f", "middle", "600") +
            '<g class="%s"><rect x="%g" y="5" width="%g" height="17" rx="8.5" fill="#1d3a55" stroke="#2f6c9e"/>%s</g>' % (
                fait, x, w, txt(x + w / 2, 13.5, nom, 10.5, "#9cc9ee", "middle", "600")) +
            '<g class="%s"><rect x="%g" y="5" width="%g" height="17" rx="8.5" fill="%s" stroke="%s"/>%s</g>' % (
                actif, x, w, C_FILL, C_SEL, txt(x + w / 2, 13.5, nom, 10.5, C_TXT, "middle", "bold")))
        x += w + 8

    scene = fondu(0, 0.0, T_FONDU, 0.4)
    svg = [
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" width="%d" height="%d" '
        'font-family="%s" role="img" aria-labelledby="titre desc">' % (W, H, W, H, POLICE),
        '<title id="titre">WEB_CAO — saisie du schéma de la carte USB</title>',
        '<desc id="desc">Animation de 10 secondes dans l\'Éditeur Schématique : le schéma de la carte USB '
        '4 couches — connecteur micro-B, protection ESD, régulateur 3,3 V, STM32G431KB et son découplage, '
        'quartz 8 MHz, Flash SPI, SWD et LED — placé, câblé, vérifié (%d nets) puis envoyé à l\'Éditeur PCB.'
        '</desc>' % nb_nets,
        '<defs><pattern id="g1" width="20" height="20" patternUnits="userSpaceOnUse">'
        '<path d="M20,0 L0,0 L0,20" fill="none" stroke="%s" stroke-width="1"/></pattern>'
        '<pattern id="g2" width="100" height="100" patternUnits="userSpaceOnUse">'
        '<path d="M100,0 L0,0 L0,100" fill="none" stroke="%s" stroke-width="1"/></pattern>' % (C_GRID, C_GRIDMAJ),
        '<style>%s%s</style></defs>' % ("".join(css),
                                        "@media (prefers-reduced-motion:reduce){*{animation-duration:0s!important}}"),
        '<rect width="%d" height="%d" fill="%s"/>' % (W, H, C_BG),
        '<rect width="%d" height="%d" fill="url(#g1)"/><rect width="%d" height="%d" fill="url(#g2)"/>' % (W, H, W, H),
        '<g class="%s">' % scene,
        '<g stroke="%s" stroke-width="%g" stroke-linecap="round" stroke-linejoin="round" fill="none">%s</g>' % (
            C_WIRE, TRAIT, "".join(fils_svg)),
        "".join(corps), dots, "".join(pills), panneau,
        '</g>',
        '<rect width="%d" height="27" fill="%s"/>' % (W, C_BAR),
        '<line x1="0" y1="27.5" x2="%d" y2="27.5" stroke="%s"/>' % (W, C_BAR_BORD),
        '<rect x="12" y="7" width="13" height="13" rx="3" fill="%s"/>' % C_FILL,
        '<line x1="15" y1="13.5" x2="22" y2="13.5" stroke="%s" stroke-width="2"/>' % C_WIRE,
        txt(32, 13.5, "WEB_CAO", 12, C_TXT, "start"),
        txt(102, 13.5, "Éditeur Schématique — carte_usb_4c · Feuille 1", 11, C_BAR_TXT, "start", "600"),
        "".join(puces),
        '<rect y="%d" width="%d" height="24" fill="%s"/>' % (H - 24, W, C_BAR),
        '<line x1="0" y1="%g" x2="%d" y2="%g" stroke="%s"/>' % (H - 24.5, W, H - 24.5, C_BAR_BORD),
        textes_etat,
        txt(W - 14, H - 12, "1 carré = 1 mm", 10.5, C_BAR_TXT, "end", "600"),
        '</svg>',
    ]
    return "\n".join(svg) + "\n", nb_nets, len(jonctions), nb_comp


if __name__ == "__main__":
    contenu, nets, jonctions, comps = generer()
    chemin = os.path.join(os.path.dirname(os.path.abspath(__file__)), "schematique-carte-usb.svg")
    with open(chemin, "w", encoding="utf-8") as f:
        f.write(contenu)
    print("écrit : %s (%d octets) — %d composants, %d nets, %d jonctions" % (
        chemin, os.path.getsize(chemin), comps, nets, jonctions))
