#!/usr/bin/env python3
"""Génère screen/pcb-4-couches.svg : 10 s de conception d'une carte 4 couches
dans l'Éditeur PCB — une carte microcontrôleur USB-C de 44 × 30 mm.

    python screen/generer_animation_pcb.py

Empilage : L1 Top et L4 Bottom pour les signaux, L2 tout entière au plan de
masse (GND), L3 tout entière au plan d'alimentation (+3V3). Aucun signal ne
passe sur les couches internes : chaque broche de masse ou d'alimentation y
descend par son via, au plus près de la pastille.

Ce que montre le routage :
  · la paire USB 2.0 (90 Ω) tenue couplée, passée à travers la protection ESD
    sans tronçon, D− ramené au dessous par deux vias sous le connecteur, et
    les deux brins appariés en longueur par un accordéon ;
  · chaque condensateur de découplage entre sa broche et ses vias ;
  · le bus SPI : CS et MISO au dessus, SCK et MOSI au dessous par vias ;
  · le quartz 32,768 kHz court et symétrique, entouré de vias de masse ;
  · VBUS en piste large au dessous, plan +3V3 en retrait du bord, vias de
    couture de masse tout autour de la carte.

Le SVG s'anime seul, en boucle, par des @keyframes CSS. Couleurs et rendu
reprennent ceux de l'éditeur (01-core.js, 03-render.js) : Top rouge, Bottom
bleu, Inner 1 vert, Inner 2 violet, cuivre traversant jaune.

Avant d'écrire le fichier, le script passe sa propre vérification : isolement
d'au moins 0,15 mm entre cuivres de nets différents sur une même couche, et
chaque broche de chaque net reliée aux autres (pistes, vias et plans). Une
erreur arrête la génération : l'animation ne peut pas montrer une carte
fausse.
"""
import math
import os
import sys

DUREE = 10.0
W, H = 880, 600
K = 15.0                          # pixels par millimètre
BX, BY = 110, 90                  # coin haut-gauche de la carte, à l'écran
LARG, HAUT = 44.0, 30.0           # carte, en mm
ISOL = 0.15                       # isolement minimal vérifié
ISOL_BORD = 0.3

C_BG, C_GRID, C_GRIDMAJ = "#141416", "#232529", "#32353c"
C_GRID_S, C_GRIDMAJ_S = "#26302d", "#35423e"
C_SUB, C_EDGE, C_SILK = "#182120", "#e6e8ec", "#eef1f5"
C_THRU, C_DRILL, C_SEL, C_RATS = "#f2c744", "#0c0d0f", "#8af0ff", "#8b95a1"
C_TOP, C_IN1, C_IN2, C_BOT = "#e8443a", "#5bd6a0", "#c98cf0", "#3fa0ea"
C_FILL = "#2f86cc"
C_BAR, C_BAR_BORD, C_BAR_TXT = "#1b1d21", "#2c2f35", "#aeb4bd"
POLICE = "'Segoe UI',system-ui,-apple-system,sans-serif"

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
    corps = "".join("%s{%s}" % (pc(t), v) for t, v in etapes)
    css.append("@keyframes %s{%s}" % (nom, corps))
    css.append(".%s{animation:%s %gs linear infinite;%s}" % (nom, nom, DUREE, extra))
    return nom


def apparait(t, duree=0.22):
    return anim([
        (t - 0.01, "opacity:0;transform:scale(.6)"),
        (t, "opacity:.6;transform:scale(.75)"),
        (t + duree * 0.5, "opacity:1;transform:scale(1.1)"),
        (t + duree, "opacity:1;transform:scale(1)"),
    ], "transform-box:fill-box;transform-origin:center")


def fondu(t, duree=0.2, fin=None, fin_duree=0.2, haut="1"):
    e = [(t, "opacity:0"), (t + duree, "opacity:" + haut)]
    if fin is not None:
        e += [(fin, "opacity:" + haut), (fin + fin_duree, "opacity:0")]
    return anim(e)


def trace_anim(t, d):
    return anim([(t, "stroke-dashoffset:1"), (t + d, "stroke-dashoffset:0")])


def virgule(v, n):
    return ("%.*f" % (n, v)).replace(".", ",")


def largeur_texte(t, taille):
    etroit = "il1.,:;|'() ·"
    return sum(taille * (0.3 if ch in etroit else 0.6) for ch in t)


def txt(x, y, t, taille, col, ancre="middle", poids="bold"):
    return ('<text x="%g" y="%g" font-size="%g" fill="%s" text-anchor="%s" '
            'font-weight="%s" dominant-baseline="central" stroke="none">%s</text>'
            % (x, y, taille, col, ancre, poids, t))


def pts_attr(pts):
    return " ".join("%g,%g" % p for p in pts)


# =============================================================================
#  La carte
# =============================================================================
class Pad:
    def __init__(self, ref, num, x, y, w, h, net, forme="rect", drill=0.0):
        self.ref, self.num, self.x, self.y, self.w, self.h = ref, num, x, y, w, h
        self.net, self.forme, self.drill = net, forme, drill
        self.couches = {"T", "B"} if drill > 0 else {"T"}


EMPREINTES = []      # (ref, groupe, pastilles, soie, textes)
PISTES = []          # (couche, largeur, net, points, phase)
VIAS = []            # (x, y, diamètre, perçage, net, phase)


def empreinte(ref, groupe, pads, soie=(), textes=()):
    EMPREINTES.append((ref, groupe, pads, list(soie), list(textes)))


def piste(couche, w, net, pts, phase):
    PISTES.append((couche, w, net, [tuple(map(float, p)) for p in pts], phase))


def via(x, y, net, phase, d=0.45, drill=0.2):
    VIAS.append((float(x), float(y), d, drill, net, phase))


def ligne_soie(x1, y1, x2, y2):
    return ("l", x1, y1, x2, y2)


def rect_soie(x1, y1, x2, y2):
    return [ligne_soie(x1, y1, x2, y1), ligne_soie(x2, y1, x2, y2),
            ligne_soie(x2, y2, x1, y2), ligne_soie(x1, y2, x1, y1)]


def c0402(ref, cx, cy, sens, net1, net2, groupe, texte=None):
    """0402 : pastilles 0,5 × 0,6 à ±0,5 mm. net1 à gauche (h) ou en haut (v)."""
    if sens == "h":
        pads = [Pad(ref, 1, cx - 0.5, cy, 0.5, 0.6, net1), Pad(ref, 2, cx + 0.5, cy, 0.5, 0.6, net2)]
    else:
        pads = [Pad(ref, 1, cx, cy - 0.5, 0.6, 0.5, net1), Pad(ref, 2, cx, cy + 0.5, 0.6, 0.5, net2)]
    empreinte(ref, groupe, pads, [], [texte] if texte else [])


def c0603(ref, cx, cy, sens, net1, net2, groupe, texte=None):
    if sens == "h":
        pads = [Pad(ref, 1, cx - 0.75, cy, 0.8, 0.9, net1), Pad(ref, 2, cx + 0.75, cy, 0.8, 0.9, net2)]
    else:
        pads = [Pad(ref, 1, cx, cy - 0.75, 0.9, 0.8, net1), Pad(ref, 2, cx, cy + 0.75, 0.9, 0.8, net2)]
    empreinte(ref, groupe, pads, [], [texte] if texte else [])


# ---------------------------------------------------------------- connecteur USB-C
YC = 11.0
J1 = [(-3.2, 0.6, "GND"), (-2.4, 0.6, "VBUS"), (-1.75, 0.3, ""), (-1.25, 0.3, "CC1"),
      (-0.75, 0.3, "USB_DM"), (-0.25, 0.3, "USB_DP"), (0.25, 0.3, "USB_DM"), (0.75, 0.3, "USB_DP"),
      (1.25, 0.3, ""), (1.75, 0.3, "CC2"), (2.4, 0.6, "VBUS"), (3.2, 0.6, "GND")]
pads = [Pad("J1", i + 1, 6.55, YC + dy, 1.15, h, net) for i, (dy, h, net) in enumerate(J1)]
for i, (x, y) in enumerate([(1.6, YC - 4.32), (5.0, YC - 4.32), (1.6, YC + 4.32), (5.0, YC + 4.32)]):
    pads.append(Pad("J1", "S%d" % (i + 1), x, y, 1.8, 1.0, "GND", "oval", 0.6))
empreinte("J1", "usb", pads,
          [ligne_soie(0.3, 5.75, 4.0, 5.75), ligne_soie(0.3, 16.25, 4.0, 16.25)],
          [(3.0, 10.3, "J1", 0.8), (3.0, 11.6, "USB-C", 0.6)])

# ---------------------------------------------------------------- CC : 5,1 kΩ à la masse
c0402("R2", 8.9, 7.6, "v", "GND", "CC1", "usb", (9.45, 7.6, "R2", 0.55, "start"))
c0402("R3", 8.9, 14.4, "v", "CC2", "GND", "usb", (9.45, 14.4, "R3", 0.55, "start"))

# ---------------------------------------------------------------- ESD USBLC6-2SC6, couché
ESD = [(1, 10.45, 10.475, "USB_DP"), (2, 10.45, 11.425, "GND"), (3, 10.45, 12.375, "USB_DM"),
       (4, 12.75, 12.375, "USB_DM"), (5, 12.75, 11.425, "VBUS"), (6, 12.75, 10.475, "USB_DP")]
empreinte("U3", "usb", [Pad("U3", n, x, y, 1.1, 0.6, net) for n, x, y, net in ESD],
          [ligne_soie(11.05, 9.85, 12.15, 9.85), ligne_soie(11.05, 13.0, 12.15, 13.0)],
          [(11.6, 9.2, "U3", 0.6)])

# ---------------------------------------------------------------- MCU LQFP-32
MX, MY = 21.5, 12.0
COTES = {
    "L": ["+3V3", "", "USB_DP", "USB_DM", "GND", "", "", ""],
    "T": ["", "+3V3", "GND", "", "LED", "", "SWDIO", "SWCLK"],
    "R": ["+3V3", "SPI_CS", "SPI_MISO", "GND", "SPI_SCK", "SPI_MOSI", "", ""],
    "B": ["+3V3", "GND", "", "", "OSC_IN", "OSC_OUT", "", ""],
}
pads, n = [], 1
for cote in "LBRT":
    for i, net in enumerate(COTES[cote]):
        o = -2.8 + 0.8 * i
        if cote == "L":
            pads.append(Pad("U1", n, MX - 4.15, MY + o, 1.5, 0.5, net))
        elif cote == "R":
            pads.append(Pad("U1", n, MX + 4.15, MY + o, 1.5, 0.5, net))
        elif cote == "T":
            pads.append(Pad("U1", n, MX + o, MY - 4.15, 0.5, 1.5, net))
        else:
            pads.append(Pad("U1", n, MX + o, MY + 4.15, 0.5, 1.5, net))
        n += 1
empreinte("U1", "mcu", pads, rect_soie(18.25, 8.75, 24.75, 15.25) + [("c", 18.85, 9.35, 0.22)],
          [(21.5, 11.3, "U1", 1.0), (21.5, 12.7, "STM32G431KB", 0.55)])


def mcu(cote, i):
    o = -2.8 + 0.8 * i
    return {"L": (MX - 4.15, MY + o), "R": (MX + 4.15, MY + o),
            "T": (MX + o, MY - 4.15), "B": (MX + o, MY + 4.15)}[cote]


# découplage du MCU
c0402("C3", 15.3, 9.2, "h", "GND", "+3V3", "mcu", (15.3, 7.55, "C3", 0.5))
c0402("C4", 20.0, 5.7, "h", "+3V3", "GND", "mcu", (17.9, 5.7, "C4", 0.5))
c0402("C5", 19.2, 18.4, "h", "+3V3", "GND", "mcu", (17.3, 18.4, "C5", 0.5))
c0402("C6", 27.7, 8.0, "h", "+3V3", "GND", "mcu", (29.4, 8.0, "C6", 0.5))

# ---------------------------------------------------------------- Flash SPI SOIC-8
FX, FY = 33.0, 11.905
FLASH = [(1, 30.3, FY - 1.905, "SPI_CS"), (2, 30.3, FY - 0.635, "SPI_MISO"),
         (3, 30.3, FY + 0.635, "+3V3"), (4, 30.3, FY + 1.905, "GND"),
         (5, 35.7, FY + 1.905, "SPI_MOSI"), (6, 35.7, FY + 0.635, "SPI_SCK"),
         (7, 35.7, FY - 0.635, "+3V3"), (8, 35.7, FY - 1.905, "+3V3")]
empreinte("U4", "flash", [Pad("U4", n, x, y, 1.55, 0.6, net) for n, x, y, net in FLASH],
          [ligne_soie(31.25, 9.3, 34.75, 9.3), ligne_soie(31.25, 14.5, 34.75, 14.5),
           ligne_soie(31.25, 9.3, 31.25, 14.5), ligne_soie(34.75, 9.3, 34.75, 14.5),
           ("c", 31.65, 9.75, 0.2)],
          [(33.0, 10.65, "U4", 0.8), (33.0, 13.2, "W25Q32", 0.5)])
c0402("C7", 37.6, 10.5, "v", "+3V3", "GND", "flash", (38.3, 9.6, "C7", 0.5, "start"))

# ---------------------------------------------------------------- régulateur 3,3 V
LDO = [(1, 9.55, 24.15, "VBUS"), (2, 10.5, 24.15, "GND"), (3, 11.45, 24.15, "VBUS"),
       (4, 11.45, 21.85, ""), (5, 9.55, 21.85, "+3V3")]
empreinte("U2", "alim", [Pad("U2", n, x, y, 0.6, 1.1, net) for n, x, y, net in LDO],
          [("c", 8.85, 24.95, 0.18)],
          [(12.7, 22.6, "U2", 0.7, "start"), (12.7, 23.6, "AP2112K", 0.5, "start")])
c0603("C1", 7.6, 23.5, "v", "VBUS", "GND", "alim", (6.6, 23.5, "C1", 0.55, "end"))
c0603("C2", 10.3, 20.0, "h", "+3V3", "GND", "alim", (10.3, 18.95, "C2", 0.55))

# ---------------------------------------------------------------- quartz 32,768 kHz
empreinte("Y1", "quartz", [Pad("Y1", 1, 21.05, 20.8, 1.0, 1.8, "OSC_IN"),
                           Pad("Y1", 2, 23.55, 20.8, 1.0, 1.8, "OSC_OUT")],
          [ligne_soie(21.75, 19.75, 22.85, 19.75), ligne_soie(21.75, 21.85, 22.85, 21.85)],
          [(22.3, 20.8, "Y1", 0.6)])
c0402("C8", 21.05, 23.1, "v", "OSC_IN", "GND", "quartz", (20.4, 23.1, "C8", 0.5, "end"))
c0402("C9", 23.55, 23.1, "v", "OSC_OUT", "GND", "quartz", (24.2, 23.1, "C9", 0.5, "start"))

# ---------------------------------------------------------------- SWD et LED
J2 = [(1, 30.0, "+3V3"), (2, 32.54, "SWDIO"), (3, 35.08, "SWCLK"), (4, 37.62, "GND")]
empreinte("J2", "swd", [Pad("J2", n, x, 2.4, 1.7, 1.7, net, "rect" if n == 1 else "circ", 1.0)
                        for n, x, net in J2],
          rect_soie(28.75, 1.15, 38.87, 3.65), [(28.2, 2.4, "SWD", 0.6, "end")])
c0402("R1", 21.9, 4.1, "v", "N_LED", "LED", "swd", (22.55, 4.1, "R1", 0.5, "start"))
c0603("D1", 19.9, 3.6, "h", "GND", "N_LED", "swd", (19.9, 2.55, "D1", 0.5))

# ---------------------------------------------------------------- trous de fixation
for i, (x, y) in enumerate([(2.5, 2.5), (41.5, 2.5), (2.5, 27.5), (41.5, 27.5)]):
    empreinte("H%d" % (i + 1), "trous", [Pad("H%d" % (i + 1), 1, x, y, 3.4, 3.4, "GND", "circ", 2.2)])


# =============================================================================
#  Le routage
# =============================================================================
SIG, PWR = 0.2, 0.4

# -- fan-out : chaque broche d'alimentation descend au plan par son via --------
def fan(net, pts, vx, vy, w=SIG, d=0.45, drill=0.2):
    piste("T", w, net, pts, "fanout")
    via(vx, vy, net, "fanout", d, drill)


piste("T", 0.3, "GND", [(5.975, 7.8), (5.6, 7.8), (5.0, 7.2), (5.0, 6.68)], "fanout")
piste("T", 0.3, "GND", [(5.975, 14.2), (5.6, 14.2), (5.0, 14.8), (5.0, 15.32)], "fanout")
fan("GND", [(8.9, 7.1), (8.9, 6.3)], 8.9, 6.3)                         # R2
fan("GND", [(8.9, 14.9), (8.9, 15.7)], 8.9, 15.7)                      # R3
fan("GND", [(11.0, 11.425), (11.6, 11.425)], 11.6, 11.425)             # U3 broche 2
piste("T", SIG, "+3V3", [(16.6, 9.2), (15.8, 9.2)], "fanout")         # U1 -> C3
fan("+3V3", [(15.8, 9.2), (15.8, 8.4)], 15.8, 8.4)
fan("GND", [(14.8, 9.2), (14.8, 8.4)], 14.8, 8.4)
fan("GND", [(16.6, 12.4), (16.1, 12.4)], 16.1, 12.4)                   # U1 L4
piste("T", SIG, "+3V3", [(19.5, 7.1), (19.5, 6.0)], "fanout")         # U1 T1 -> C4
piste("T", SIG, "GND", [(20.3, 7.1), (20.3, 6.4), (20.5, 6.2), (20.5, 6.0)], "fanout")
fan("+3V3", [(19.5, 5.7), (19.5, 4.9)], 19.5, 4.9)
fan("GND", [(20.5, 5.7), (20.5, 4.9)], 20.5, 4.9)
piste("T", SIG, "+3V3", [(26.4, 9.2), (26.6, 9.2), (27.2, 8.6), (27.2, 8.0)], "fanout")  # R0 -> C6
fan("+3V3", [(27.2, 8.0), (27.2, 7.2)], 27.2, 7.2)
fan("GND", [(28.2, 8.0), (28.2, 7.2)], 28.2, 7.2)
fan("GND", [(26.4, 11.6), (27.2, 11.6)], 27.2, 11.6)                   # U1 R3
piste("T", SIG, "+3V3", [(18.7, 16.9), (18.7, 18.4)], "fanout")       # U1 B0 -> C5
piste("T", SIG, "GND", [(19.5, 16.9), (19.5, 17.9), (19.7, 18.1), (19.7, 18.4)], "fanout")
fan("+3V3", [(18.7, 18.4), (18.7, 19.2)], 18.7, 19.2)
fan("GND", [(19.7, 18.4), (19.7, 19.2)], 19.7, 19.2)
fan("+3V3", [(31.075, 12.54), (31.7, 12.54)], 31.7, 12.54)             # U4 WP
fan("GND", [(31.075, 13.81), (31.7, 13.81)], 31.7, 13.81)              # U4 GND
fan("+3V3", [(34.925, 11.27), (34.3, 11.27)], 34.3, 11.27)             # U4 HOLD
fan("+3V3", [(34.925, 10.0), (34.3, 10.0)], 34.3, 10.0)                # U4 VCC
piste("T", SIG, "+3V3", [(36.475, 10.0), (37.6, 10.0)], "fanout")     # U4 VCC -> C7
fan("GND", [(37.6, 11.0), (38.4, 11.0)], 38.4, 11.0)
fan("GND", [(21.05, 23.6), (21.05, 24.4)], 21.05, 24.4)                # C8
fan("GND", [(23.55, 23.6), (23.55, 24.4)], 23.55, 24.4)                # C9
fan("GND", [(18.75, 3.6), (18.3, 3.6)], 18.3, 3.6)                     # D1 cathode
fan("GND", [(10.5, 23.6), (10.5, 23.0)], 10.5, 23.0, PWR, 0.6, 0.3)    # U2 GND
fan("GND", [(7.6, 24.25), (7.6, 25.2)], 7.6, 25.2, PWR, 0.6, 0.3)      # C1
fan("GND", [(11.05, 20.0), (11.9, 20.0)], 11.9, 20.0, PWR, 0.6, 0.3)   # C2
piste("T", PWR, "+3V3", [(9.55, 21.3), (9.55, 20.0)], "fanout")       # U2 VOUT -> C2
piste("T", PWR, "+3V3", [(9.55, 20.0), (8.5, 20.0), (8.5, 20.9)], "fanout")
via(8.5, 20.0, "+3V3", "fanout", 0.6, 0.3)
via(8.5, 20.9, "+3V3", "fanout", 0.6, 0.3)
for x, y in [(19.9, 20.8), (24.7, 20.8), (22.3, 22.6)]:                # garde du quartz
    via(x, y, "GND", "fanout")


# -- la paire USB --------------------------------------------------------------
def longueur(pts):
    return sum(math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(pts, pts[1:]))


def accordeon(x0, x1, y, n, haut, sens=-1, c=0.1):
    """Accordéon d'accord de longueur entre x0 et x1, n bosses de hauteur
    `haut`, coins chanfreinés à 45°."""
    pas = (x1 - x0) / (2 * n)
    pts = [(x0, y)]
    for k in range(n):
        xa, xb = x0 + (2 * k + 0.5) * pas, x0 + (2 * k + 1.5) * pas
        yh = y + sens * haut
        pts += [(xa - c, y), (xa, y + sens * c), (xa, yh - sens * c), (xa + c, yh),
                (xb - c, yh), (xb, yh - sens * c), (xb, y + sens * c), (xb + c, y)]
    pts.append((x1, y))
    return pts


DP_A6 = [(7.125, 10.75), (7.95, 10.75), (8.45, 11.25)]
DP_B6 = [(7.125, 11.75), (7.95, 11.75), (8.45, 11.25)]
DP_TETE = [(8.45, 11.25), (9.2, 11.25), (9.975, 10.475), (13.5, 10.475)]
DP_QUEUE = [(15.9, 10.475), (16.225, 10.8), (17.35, 10.8)]
DN_DEBUT = [(7.125, 10.25), (7.55, 10.25)]
DN_DESSOUS = [(7.55, 10.25), (7.55, 11.25), (7.55, 11.6), (8.05, 12.1), (8.6, 12.1)]
DN_A7 = [(7.125, 11.25), (7.55, 11.25)]
DN_DESSUS = [(8.6, 12.1), (9.3, 12.1), (9.575, 12.375), (13.7, 12.375), (14.475, 11.6), (17.35, 11.6)]
L_DN = longueur(DN_DEBUT) + longueur(DN_DESSOUS) + longueur(DN_DESSUS)
L_DP0 = longueur(DP_A6) + longueur(DP_TETE) + longueur(DP_QUEUE)
# hauteur des bosses : celle qui égale D+ à D− (dichotomie)
a, b = 0.05, 0.7
for _ in range(60):
    m = (a + b) / 2
    if L_DP0 + longueur(accordeon(13.5, 15.9, 10.475, 2, m)) < L_DN:
        a = m
    else:
        b = m
ACC = accordeon(13.5, 15.9, 10.475, 2, (a + b) / 2)
DP_TOUT = DP_TETE + ACC[1:] + DP_QUEUE[1:]
L_DP = longueur(DP_A6) + longueur(DP_TOUT)
piste("T", SIG, "USB_DP", DP_A6, "usb")
piste("T", SIG, "USB_DP", DP_B6, "usb")
piste("T", SIG, "USB_DP", DP_TOUT, "usb")
piste("T", SIG, "USB_DM", DN_DEBUT, "usb")
piste("T", SIG, "USB_DM", DN_A7, "usb")
piste("B", SIG, "USB_DM", DN_DESSOUS, "usb")
piste("T", SIG, "USB_DM", DN_DESSUS, "usb")
via(7.55, 10.25, "USB_DM", "usb")
via(7.55, 11.25, "USB_DM", "usb")
via(8.6, 12.1, "USB_DM", "usb")
via(9.9, 13.2, "GND", "usb")                                           # retour de D−

# -- CC, VBUS et régulateur ----------------------------------------------------
piste("T", SIG, "CC1", [(7.125, 9.75), (7.9, 9.75), (8.9, 8.75), (8.9, 8.1)], "cc")
piste("T", SIG, "CC2", [(7.125, 12.75), (7.9, 12.75), (8.9, 13.75), (8.9, 13.9)], "cc")
piste("T", PWR, "VBUS", [(7.125, 8.6), (7.6, 8.6)], "vbus")
piste("T", PWR, "VBUS", [(7.125, 13.4), (7.6, 13.4)], "vbus")
via(7.6, 8.6, "VBUS", "vbus", 0.6, 0.3)
via(7.6, 13.4, "VBUS", "vbus", 0.6, 0.3)
piste("B", 0.5, "VBUS", [(7.6, 8.6), (6.5, 9.7), (6.5, 12.3), (7.6, 13.4), (7.6, 21.9)], "vbus")
piste("T", SIG, "VBUS", [(13.3, 11.425), (13.85, 11.425)], "vbus")
via(13.85, 11.425, "VBUS", "vbus", 0.6, 0.3)
piste("B", PWR, "VBUS", [(13.85, 11.425), (13.85, 16.4), (12.85, 17.4), (7.6, 17.4)], "vbus")
via(7.6, 21.9, "VBUS", "vbus", 0.6, 0.3)
piste("T", PWR, "VBUS", [(7.6, 21.9), (7.6, 22.75)], "vbus")
piste("T", PWR, "VBUS", [(7.6, 22.75), (8.7, 22.75), (9.55, 23.6), (9.55, 24.15)], "vbus")
piste("T", 0.25, "VBUS", [(11.45, 24.15), (11.45, 25.1), (11.05, 25.5), (9.95, 25.5),
                          (9.55, 25.1), (9.55, 24.15)], "vbus")

# -- bus SPI -------------------------------------------------------------------
piste("T", SIG, "SPI_CS", [(26.4, 10.0), (29.525, 10.0)], "spi")
piste("T", SIG, "SPI_MISO", [(26.4, 10.8), (28.6, 10.8), (29.07, 11.27), (29.525, 11.27)], "spi")
piste("T", SIG, "SPI_SCK", [(26.4, 12.4), (27.5, 12.4)], "spi")
piste("T", SIG, "SPI_MOSI", [(26.4, 13.2), (27.5, 13.2)], "spi")
via(27.5, 12.4, "SPI_SCK", "spi")
via(27.5, 13.2, "SPI_MOSI", "spi")
piste("B", SIG, "SPI_SCK", [(27.5, 12.4), (28.3, 13.2), (28.3, 14.6), (28.9, 15.2),
                            (36.6, 15.2), (37.2, 14.6), (37.2, 12.54)], "spi")
piste("B", SIG, "SPI_MOSI", [(27.5, 13.2), (27.5, 15.4), (28.1, 16.0), (37.4, 16.0),
                             (38.0, 15.4), (38.0, 13.81)], "spi")
via(37.2, 12.54, "SPI_SCK", "spi")
via(38.0, 13.81, "SPI_MOSI", "spi")
piste("T", SIG, "SPI_SCK", [(36.475, 12.54), (37.2, 12.54)], "spi")
piste("T", SIG, "SPI_MOSI", [(36.475, 13.81), (38.0, 13.81)], "spi")

# -- SWD, LED, quartz ------------------------------------------------------------
piste("T", SIG, "SWDIO", [(23.5, 7.1), (23.5, 4.6), (24.1, 4.0), (31.14, 4.0), (32.54, 2.6),
                          (32.54, 2.4)], "swd")
piste("T", SIG, "SWCLK", [(24.3, 7.1), (24.3, 5.2), (24.9, 4.6), (34.48, 4.6), (35.08, 4.0),
                          (35.08, 2.4)], "swd")
piste("T", SIG, "LED", [(21.9, 7.1), (21.9, 4.6)], "swd")
piste("T", SIG, "N_LED", [(21.9, 3.6), (20.65, 3.6)], "swd")
piste("T", SIG, "OSC_IN", [(21.9, 16.9), (21.9, 18.4), (21.05, 19.25), (21.05, 22.6)], "quartz")
piste("T", SIG, "OSC_OUT", [(22.7, 16.9), (22.7, 18.4), (23.55, 19.25), (23.55, 22.6)], "quartz")

# -- les plans --------------------------------------------------------------------
PLANS = [("L2", "GND", 0.4, C_IN1), ("L3", "+3V3", 1.0, C_IN2)]


# =============================================================================
#  Vérification : isolement et connectivité
# =============================================================================
def d_pt_seg(p, a, b):
    ax, ay = a
    dx, dy = b[0] - ax, b[1] - ay
    l2 = dx * dx + dy * dy
    t = 0 if l2 == 0 else max(0, min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / l2))
    return math.hypot(p[0] - ax - t * dx, p[1] - ay - t * dy)


def coupe(a, b, c, d):
    def o(p, q, r):
        return (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
    return (o(a, b, c) * o(a, b, d) < 0) and (o(c, d, a) * o(c, d, b) < 0)


def d_seg_seg(a, b, c, d):
    if coupe(a, b, c, d):
        return 0.0
    return min(d_pt_seg(a, c, d), d_pt_seg(b, c, d), d_pt_seg(c, a, b), d_pt_seg(d, a, b))


def dans_rect(p, r):
    return r[0] <= p[0] <= r[2] and r[1] <= p[1] <= r[3]


def d_seg_rect(a, b, r):
    if dans_rect(a, r) or dans_rect(b, r):
        return 0.0
    coins = [(r[0], r[1]), (r[2], r[1]), (r[2], r[3]), (r[0], r[3])]
    return min(d_seg_seg(a, b, coins[i], coins[(i + 1) % 4]) for i in range(4))


def forme_pad(p):
    if p.forme == "rect":
        return ("r", (p.x - p.w / 2, p.y - p.h / 2, p.x + p.w / 2, p.y + p.h / 2))
    if p.forme == "circ" or p.w == p.h:
        return ("c", (p.x, p.y), (p.x, p.y), p.w / 2)
    if p.w > p.h:
        e = (p.w - p.h) / 2
        return ("c", (p.x - e, p.y), (p.x + e, p.y), p.h / 2)
    e = (p.h - p.w) / 2
    return ("c", (p.x, p.y - e), (p.x, p.y + e), p.w / 2)


def distance(f, g):
    if f[0] == "c" and g[0] == "c":
        return d_seg_seg(f[1], f[2], g[1], g[2]) - f[3] - g[3]
    if f[0] == "r" and g[0] == "r":
        a, b = f[1], g[1]
        dx = max(0, a[0] - b[2], b[0] - a[2])
        dy = max(0, a[1] - b[3], b[1] - a[3])
        return math.hypot(dx, dy)
    if f[0] == "r":
        f, g = g, f
    return d_seg_rect(f[1], f[2], g[1]) - f[3]


def objets_cuivre():
    """(net, couches, forme, étiquette) de tout le cuivre des couches externes."""
    objs = []
    for ref, _, pads, _, _ in EMPREINTES:
        for p in pads:
            net = p.net or "nc:%s.%s" % (ref, p.num)
            objs.append((net, p.couches, forme_pad(p), "%s.%s" % (ref, p.num)))
    for i, (c, w, net, pts, _) in enumerate(PISTES):
        for a, b in zip(pts, pts[1:]):
            objs.append((net, {c}, ("c", a, b, w / 2), "piste %d %s" % (i, net)))
    for x, y, d, _, net, _ in VIAS:
        objs.append((net, {"T", "B"}, ("c", (x, y), (x, y), d / 2), "via %s (%g,%g)" % (net, x, y)))
    return objs


def boite(f):
    if f[0] == "r":
        return f[1]
    r = f[3]
    return (min(f[1][0], f[2][0]) - r, min(f[1][1], f[2][1]) - r,
            max(f[1][0], f[2][0]) + r, max(f[1][1], f[2][1]) + r)


def verifier():
    objs = objets_cuivre()
    boites = [boite(o[2]) for o in objs]
    erreurs, d_min = [], 99.0
    parent = list(range(len(objs)))

    def trouve(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for i in range(len(objs)):
        bi = boites[i]
        for j in range(i + 1, len(objs)):
            bj = boites[j]
            if bi[0] > bj[2] + 1 or bj[0] > bi[2] + 1 or bi[1] > bj[3] + 1 or bj[1] > bi[3] + 1:
                continue
            if not (objs[i][1] & objs[j][1]):
                continue
            d = distance(objs[i][2], objs[j][2])
            if objs[i][0] == objs[j][0]:
                if d <= 1e-6:
                    parent[trouve(i)] = trouve(j)
            else:
                d_min = min(d_min, d)
                if d < ISOL - 1e-6:
                    erreurs.append("isolement %.3f mm : %s / %s" % (d, objs[i][3], objs[j][3]))
    # les plans relient tout le cuivre traversant de leur net
    for _, net, _, _ in PLANS:
        trav = [i for i, o in enumerate(objs) if o[0] == net and o[1] == {"T", "B"}]
        for i in trav[1:]:
            parent[trouve(i)] = trouve(trav[0])
    # bord de carte
    for o in objs:
        x1, y1, x2, y2 = boite(o[2])
        if o[3].startswith("J1"):
            continue
        if min(x1, y1, LARG - x2, HAUT - y2) < ISOL_BORD - 1e-6:
            erreurs.append("trop près du bord : %s" % o[3])
    # chaque net d'un seul tenant
    nets = {}
    for i, o in enumerate(objs):
        if not o[0].startswith("nc:") and not o[3].startswith(("piste", "via")):
            nets.setdefault(o[0], set()).add(trouve(i))
    for net, comps in sorted(nets.items()):
        if len(comps) > 1:
            pads = [o[3] for i, o in enumerate(objs) if o[0] == net and not o[3].startswith(("piste", "via"))]
            erreurs.append("net %s en %d morceaux (%s)" % (net, len(comps), ", ".join(pads)))
    if erreurs:
        sys.exit("\n".join(erreurs))
    return d_min, len(nets)


# =============================================================================
#  Vias de couture : tout autour de la carte, là où il y a la place
# =============================================================================
def coudre():
    objs = objets_cuivre()
    cands = []
    for x in [3.0 + 2.5 * i for i in range(16)]:
        cands += [(x, 1.0), (x, HAUT - 1.0)]
    for y in [3.5 + 2.5 * i for i in range(10)]:
        cands += [(1.0, y), (LARG - 1.0, y)]
    poses = []
    for x, y in cands:
        f = ("c", (x, y), (x, y), 0.225)
        if x < 8.5 and 4.5 < y < 17.5:
            continue                                   # sous le connecteur
        ok = all(distance(f, o[2]) >= 0.35 for o in objs if o[0] != "GND")
        ok = ok and all(distance(f, o[2]) >= 0.25 for o in objs if o[0] == "GND")
        ok = ok and all(math.hypot(x - a, y - b) >= 2.0 for a, b in poses)
        if ok:
            poses.append((x, y))
    for x, y in poses:
        via(x, y, "GND", "couture")
    return len(poses)


# =============================================================================
#  Rendu
# =============================================================================
def chevelu():
    """Arbre couvrant minimal des pastilles de chaque net (le chevelu)."""
    par_net = {}
    for ref, _, pads, _, _ in EMPREINTES:
        for p in pads:
            if p.net:
                par_net.setdefault(p.net, []).append((p.x, p.y))
    lignes = {}
    for net, pts in par_net.items():
        pts = sorted(set(pts))
        if len(pts) < 2:
            continue
        dedans, reste, segs = [pts[0]], pts[1:], []
        while reste:
            best = min(((a, b) for a in dedans for b in reste), key=lambda ab: math.dist(*ab))
            segs.append(best)
            dedans.append(best[1])
            reste.remove(best[1])
        lignes[net] = segs
    return lignes


def svg_pad(p, couleur):
    if p.forme == "rect":
        return '<rect x="%g" y="%g" width="%g" height="%g" fill="%s"/>' % (
            p.x - p.w / 2, p.y - p.h / 2, p.w, p.h, couleur)
    r = min(p.w, p.h) / 2
    return '<rect x="%g" y="%g" width="%g" height="%g" rx="%g" fill="%s"/>' % (
        p.x - p.w / 2, p.y - p.h / 2, p.w, p.h, r, couleur)


def svg_trou(p):
    if p.w != p.h and p.forme == "oval":
        lw = p.drill * 2 if p.w > p.h else p.drill
        lh = p.drill if p.w > p.h else p.drill * 2
        return '<rect x="%g" y="%g" width="%g" height="%g" rx="%g" fill="%s"/>' % (
            p.x - lw / 2, p.y - lh / 2, lw, lh, min(lw, lh) / 2, C_DRILL)
    return '<circle cx="%g" cy="%g" r="%g" fill="%s"/>' % (p.x, p.y, p.drill / 2, C_DRILL)


def cercle_sp(x, y, r):
    """Cercle en sous-chemin (pour les évidements du plan, règle evenodd)."""
    return "M%g,%g a%g,%g 0 1,0 %g,0 a%g,%g 0 1,0 %g,0 Z" % (x - r, y, r, r, 2 * r, r, r, -2 * r)


def instant_via(v):
    """Instant où un via est posé (et où les plans s'en écartent)."""
    x, y, d, drill, net, ph = v
    if ph == "couture":
        couture = [w for w in VIAS if w[5] == "couture"]
        return T_COUTURE + 0.4 * couture.index(v) / max(1, len(couture))
    if ph == "fanout":
        return T_FANOUT0 + 0.5 * (x / LARG)
    if ph == "usb":
        return T_USB0 + 0.15
    return T_ROUTE[ph] + 0.1


def svg_plan(nom, net, retrait, couleur):
    """Le plan : un aplat en retrait du bord, et un masque qui le perce autour
    du cuivre traversant des autres nets. Chaque dégagement s'ouvre à l'instant
    où son via est posé ; le cuivre traversant du net du plan y est relié par
    quatre bras (liaison thermique)."""
    m = ['<rect x="0" y="0" width="%g" height="%g" fill="#fff"/>' % (LARG, HAUT)]
    for v in VIAS:
        x, y, dv, drill, n, _ = v
        if n != net:
            m.append('<circle class="%s" cx="%g" cy="%g" r="%g" fill="#000"/>' % (
                fondu(instant_via(v), 0.05), x, y, dv / 2 + 0.3))
    for ref, _, pads, _, _ in EMPREINTES:
        for p in pads:
            if p.drill > 0:
                r = max(p.w, p.h) / 2 + 0.3
                m.append('<circle cx="%g" cy="%g" r="%g" fill="#000"/>' % (p.x, p.y, r))
                if p.net == net:
                    for ang in (0, 90, 180, 270):
                        m.append('<rect x="%g" y="%g" width="%g" height="0.5" fill="#fff" '
                                 'transform="rotate(%d %g %g)"/>' % (p.x, p.y - 0.25, r + 0.05, ang, p.x, p.y))
    masque = '<mask id="perce-%s" maskUnits="userSpaceOnUse" x="0" y="0" width="%g" height="%g">%s</mask>' % (
        nom, LARG, HAUT, "".join(m))
    aplat = '<rect x="%g" y="%g" width="%g" height="%g" fill="%s" mask="url(#perce-%s)"/>' % (
        retrait, retrait, LARG - 2 * retrait, HAUT - 2 * retrait, couleur, nom)
    return masque, aplat


# chronologie
T_CONTOUR = 0.0
T_PLACE = {"trous": 0.55, "usb": 0.75, "mcu": 1.05, "flash": 1.35, "alim": 1.6,
           "quartz": 1.85, "swd": 2.05}
T_CHEVELU = 2.3
T_FANOUT0, T_FANOUT1 = 2.5, 3.05
T_L2, T_L3 = 3.1, 3.5
T_USB0, T_USB1 = 3.95, 4.95
T_ROUTE = {"cc": 5.0, "vbus": 5.3, "spi": 5.65, "swd": 6.0, "quartz": 6.3}
T_COUTURE = 6.65
T_DRC0, T_DRC1 = 7.15, 7.7
T_TOUR = [(7.75, "T"), (8.15, "L2"), (8.55, "L3"), (8.95, "B")]
T_TOUR_FIN = 9.35
T_FONDU = 9.45


def couche_opacite(couche, base):
    """Opacité d'une couche : `base` pendant la construction, pleine quand le
    tour des couches la montre, presque éteinte quand il en montre une autre."""
    plein = {"T": 1, "B": 1, "L2": 0.85, "L3": 0.85}[couche]
    e, v = [(0.0, base)], base
    for t, c in T_TOUR:
        e += [(t, v)]
        v = plein if c == couche else 0.1
        e += [(t + 0.12, v)]
    e += [(T_TOUR_FIN, v), (T_TOUR_FIN + 0.15, base)]
    return anim([(t, "opacity:%g" % o) for t, o in e])


def generer():
    nb_couture = coudre()
    d_min, nb_nets = verifier()
    etat = [(0.0, T_PLACE["trous"], "Contour de carte · 44 × 30 mm · empilage 4 couches")]

    # --- empreintes ----------------------------------------------------------
    pads_top, pads_tht, soie = [], [], []
    for ref, groupe, pads, traits, textes in EMPREINTES:
        t = T_PLACE[groupe] + 0.03 * (sum(1 for e in EMPREINTES[:EMPREINTES.index((ref, groupe, pads, traits, textes))]
                                           if e[1] == groupe))
        cls = apparait(t)
        top = "".join(svg_pad(p, C_TOP) for p in pads if p.drill == 0)
        tht = "".join(svg_pad(p, C_THRU) + svg_trou(p) for p in pads if p.drill > 0)
        if top:
            pads_top.append('<g class="%s">%s</g>' % (cls, top))
        if tht:
            pads_tht.append('<g class="%s">%s</g>' % (cls, tht))
        s = ""
        for e in traits:
            if e[0] == "l":
                s += '<line x1="%g" y1="%g" x2="%g" y2="%g"/>' % e[1:]
            else:
                s += '<circle cx="%g" cy="%g" r="%g" fill="%s" stroke="none"/>' % (e[1], e[2], e[3], C_SILK)
        for tx in textes:
            x, y, mot, taille = tx[:4]
            ancre = tx[4] if len(tx) > 4 else "middle"
            s += txt(x, y, mot, taille, C_SILK, ancre)
        if s:
            soie.append('<g class="%s">%s</g>' % (cls, s))
    for g, msg in [("usb", "Placer · USB-C, protection ESD, résistances CC"),
                   ("mcu", "Placer · microcontrôleur LQFP-32 et son découplage"),
                   ("flash", "Placer · mémoire Flash SPI"),
                   ("alim", "Placer · régulateur 3,3 V"),
                   ("quartz", "Placer · quartz 32,768 kHz et capacités de charge"),
                   ("swd", "Placer · connecteur SWD et LED")]:
        suivants = [v for v in T_PLACE.values() if v > T_PLACE[g]]
        etat.append((T_PLACE[g], min(suivants) if suivants else T_CHEVELU, msg))

    # --- pistes ---------------------------------------------------------------
    traces = {"T": [], "B": []}
    fin_net = {}

    def poser(c, w, net, pts, t, d):
        cls = trace_anim(t, d)
        traces[c].append('<path class="%s" d="M%s" stroke-width="%g" pathLength="1" '
                         'stroke-dasharray="1 2"/>' % (cls, " L".join("%g,%g" % p for p in pts), w))
        fin_net[net] = max(fin_net.get(net, 0), t + d)

    fanout = [p for p in PISTES if p[4] == "fanout"]
    pas = (T_FANOUT1 - T_FANOUT0 - 0.15) / len(fanout)
    for i, (c, w, net, pts, _) in enumerate(fanout):
        poser(c, w, net, pts, T_FANOUT0 + i * pas, 0.15)
    usb = [p for p in PISTES if p[4] == "usb"]
    for c, w, net, pts, _ in usb:
        # D+ et D− avancent ensemble ; le dessous et les entrées suivent leur rang
        l = longueur(pts)
        if pts == DP_TOUT or pts == DN_DESSUS:
            poser(c, w, net, pts, T_USB0 + 0.25, T_USB1 - T_USB0 - 0.3)
        else:
            poser(c, w, net, pts, T_USB0, 0.25)
    phases = list(T_ROUTE)
    for k, ph in enumerate(phases):
        lot = [p for p in PISTES if p[4] == ph]
        t0 = T_ROUTE[ph]
        t1 = T_ROUTE[phases[k + 1]] if k + 1 < len(phases) else T_COUTURE
        lmax = max(longueur(p[3]) for p in lot)
        for i, (c, w, net, pts, _) in enumerate(lot):
            poser(c, w, net, pts, t0 + i * 0.02, max(0.08, (t1 - t0 - 0.1) * longueur(pts) / lmax))
    etat += [(T_CHEVELU, T_FANOUT0, "Chevelu · %d nets à relier" % nb_nets),
             (T_FANOUT0, T_L2, "Fan-out · chaque broche d'alimentation descend à son plan par un via"),
             (T_L2, T_L3, "Plan L2 · Inner 1 entièrement à la masse (GND)"),
             (T_L3, T_USB0, "Plan L3 · Inner 2 entièrement au +3V3, en retrait de 1 mm du bord"),
             (T_USB0, T_ROUTE["cc"],
              "Paire USB · 90 Ω, D+ et D− de même longueur (%s mm) — D− passe au dessous sous le connecteur"
              % virgule(L_DN, 1)),
             (T_ROUTE["cc"], T_ROUTE["spi"], "Router · CC1/CC2, VBUS en piste large au dessous, régulateur"),
             (T_ROUTE["spi"], T_ROUTE["swd"], "Router · bus SPI : CS et MISO dessus, SCK et MOSI dessous"),
             (T_ROUTE["swd"], T_COUTURE, "Router · SWD, LED et quartz, courts et symétriques"),
             (T_COUTURE, T_DRC0, "Vias de couture · %d vias de masse sur le pourtour" % nb_couture),
             (T_DRC0, T_TOUR[0][0],
              "DRC · 0 erreur, 0 connexion non routée — isolement mini %s mm" % virgule(d_min, 2)),
             (T_TOUR[0][0], T_TOUR[1][0], "L1 Top · signaux"),
             (T_TOUR[1][0], T_TOUR[2][0], "L2 Inner 1 · plan de masse, rien d'autre"),
             (T_TOUR[2][0], T_TOUR[3][0], "L3 Inner 2 · plan +3V3, rien d'autre"),
             (T_TOUR[3][0], T_FONDU + 0.3, "L4 Bottom · signaux : D−, SCK, MOSI, VBUS")]

    # --- vias ---------------------------------------------------------------------
    vias_svg = []
    for v in VIAS:
        x, y, d, drill, net, ph = v
        t = instant_via(v)
        vias_svg.append('<g class="%s"><circle cx="%g" cy="%g" r="%g" fill="%s"/>'
                        '<circle cx="%g" cy="%g" r="%g" fill="%s"/></g>' % (
                            apparait(t, 0.18), x, y, d / 2, C_THRU, x, y, drill / 2, C_DRILL))

    # --- chevelu -----------------------------------------------------------------
    rats = []
    for net, segs in chevelu().items():
        fin = {"GND": T_L2 + 0.3, "+3V3": T_L3 + 0.3}.get(net, fin_net.get(net, T_COUTURE))
        cls = anim([(T_CHEVELU, "opacity:0"), (T_CHEVELU + 0.15, "opacity:.75"),
                    (fin - 0.1, "opacity:.75"), (fin, "opacity:0")])
        rats.append('<g class="%s">%s</g>' % (cls, "".join(
            '<line x1="%g" y1="%g" x2="%g" y2="%g"/>' % (a[0], a[1], b[0], b[1]) for a, b in segs)))

    # --- plans : versés de gauche à droite --------------------------------------
    plans = []
    for (nom, net, retrait, couleur), t in zip(PLANS, (T_L2, T_L3)):
        coupe_cls = anim([(t, "transform:scaleX(0)"), (t + 0.38, "transform:scaleX(1)")],
                         "transform-box:view-box;transform-origin:0 0")
        masque, aplat = svg_plan(nom, net, retrait, couleur)
        plans.append((nom, '<clipPath id="verse-%s"><rect class="%s" x="0" y="0" width="%g" height="%g"/>'
                           '</clipPath>%s' % (nom, coupe_cls, LARG, HAUT, masque),
                       '<g clip-path="url(#verse-%s)">%s</g>' % (nom, aplat)))

    # --- groupes de couches -----------------------------------------------------
    o_bot = couche_opacite("B", 0.5)
    o_l3 = couche_opacite("L3", 0.26)
    o_l2 = couche_opacite("L2", 0.26)
    o_top = couche_opacite("T", 1)
    o_soie = couche_opacite("T", 1)

    # --- DRC : un balayage ------------------------------------------------------
    balayage = anim([(T_DRC0, "transform:translateX(0px);opacity:0"),
                     (T_DRC0 + 0.05, "transform:translateX(0px);opacity:1"),
                     (T_DRC1 - 0.05, "transform:translateX(%gpx);opacity:1" % LARG),
                     (T_DRC1, "transform:translateX(%gpx);opacity:0" % LARG)])
    drc = ('<g class="%s"><rect x="-1.2" y="-0.5" width="1.2" height="%g" fill="url(#drc)"/>'
           '<line x1="0" y1="-0.5" x2="0" y2="%g" stroke="%s" stroke-width="0.12"/></g>' % (
               balayage, HAUT + 1, HAUT + 0.5, C_SEL))

    # --- contour --------------------------------------------------------------------
    contour = ('<rect class="%s" x="0" y="0" width="%g" height="%g" rx="1" fill="none" stroke="%s" '
               'stroke-width="0.11" pathLength="1" stroke-dasharray="1 2"/>' % (
                   trace_anim(0.1, 0.45), LARG, HAUT, C_EDGE))
    substrat = '<rect class="%s" x="0" y="0" width="%g" height="%g" rx="1" fill="%s"/>' % (
        fondu(0.1, 0.4), LARG, HAUT, C_SUB)
    logo = ('<g class="%s">%s%s</g>' % (fondu(T_COUTURE + 0.1, 0.3),
                                         txt(34.6, 22.7, "WEB_CAO", 1.7, C_SILK),
                                         txt(34.6, 24.6, "USB-C · 4 couches · rév. A", 0.62, C_SILK, "middle", "600")))

    # --- onglets de couches -----------------------------------------------------
    onglets, x = [], 12
    defs_onglets = [("Top", "L1_Top · 1", C_TOP, None, "T"),
                    ("Inner 1", "L2_Inner · 2", C_IN1, "PLAN GND", "L2"),
                    ("Inner 2", "L3_Inner · 3", C_IN2, "PLAN +3V3", "L3"),
                    ("Bottom", "L4_Bottom · 4", C_BOT, None, "B")]
    for nom, ident, col, role, cle in defs_onglets:
        w = 22 + largeur_texte(nom, 11.5) + largeur_texte(ident, 9.5) + (largeur_texte(role, 8.5) + 14 if role else 0) + 10
        actifs = []
        if cle == "T":
            actifs = [(0.0, T_L2), (T_L3 + 0.4, T_TOUR[1][0]), (T_TOUR_FIN, DUREE)]
        elif cle == "L2":
            actifs = [(T_L2, T_L3), (T_TOUR[1][0], T_TOUR[2][0])]
        elif cle == "L3":
            actifs = [(T_L3, T_L3 + 0.4), (T_TOUR[2][0], T_TOUR[3][0])]
        else:
            actifs = [(T_TOUR[3][0], T_TOUR_FIN)]
        e = [(0.0, "opacity:0")]
        for a, b in actifs:
            e += [(a, "opacity:0"), (a + 0.08, "opacity:1"), (b, "opacity:1"), (b + 0.08, "opacity:0")]
        if cle == "T":
            e = [(0.0, "opacity:1"), (T_L2, "opacity:1"), (T_L2 + 0.08, "opacity:0"),
                 (T_L3 + 0.4, "opacity:0"), (T_L3 + 0.48, "opacity:1"),
                 (T_TOUR[1][0], "opacity:1"), (T_TOUR[1][0] + 0.08, "opacity:0"),
                 (T_TOUR_FIN, "opacity:0"), (T_TOUR_FIN + 0.08, "opacity:1")]
        cls = anim(e)
        corps = ('<rect x="%g" y="31" width="9" height="9" rx="2" fill="%s"/>' % (x + 8, col) +
                 txt(x + 22, 35.5, nom, 11.5, "#e5e7eb", "start", "600"))
        xx = x + 22 + largeur_texte(nom, 11.5) + 6
        if role:
            wr = largeur_texte(role, 8.5) + 8
            corps += ('<rect x="%g" y="29.5" width="%g" height="12" rx="3" fill="none" stroke="%s"/>' % (
                xx, wr, "#c9a227") + txt(xx + wr / 2, 35.6, role, 8.5, "#f2c744"))
            xx += wr + 6
        corps += txt(xx, 35.6, ident, 9.5, "#f2c744" if cle == "T" else "#9aa1ab", "start", "600")
        onglets.append('<g class="%s"><rect x="%g" y="27.5" width="%g" height="17" fill="#202328"/>'
                       '<rect x="%g" y="42.5" width="%g" height="2" fill="%s"/></g>%s' % (
                           cls, x, w, x, w, col, corps))
        x += w + 4

    # --- barres -----------------------------------------------------------------------
    textes_etat = "".join(
        '<g class="%s">%s</g>' % (
            anim([(a + 0.04, "opacity:0"), (a + 0.1, "opacity:1"), (b, "opacity:1"), (b + 0.04, "opacity:0")]
                 if a > 0 else [(0, "opacity:1"), (b, "opacity:1"), (b + 0.04, "opacity:0")]),
            txt(16, H - 12, m, 11, "#d7dbe0", "start", "600"))
        for a, b, m in etat)
    etapes = [("1  Placer", 0.0, T_FANOUT0), ("2  Plans", T_FANOUT0, T_USB0),
              ("3  Router", T_USB0, T_DRC0), ("4  DRC", T_DRC0, T_FONDU + 0.3)]
    puces, x = [], 548
    for nom, a, b in etapes:
        w = largeur_texte(nom, 10.5) + 18
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
                actif, x, w, C_FILL, C_SEL, txt(x + w / 2, 13.5, nom, 10.5, "#fff", "middle", "bold")))
        x += w + 8

    scene = fondu(0, 0.0, T_FONDU, 0.4)
    svg = [
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" width="%d" height="%d" '
        'font-family="%s" role="img" aria-labelledby="titre desc">' % (W, H, W, H, POLICE),
        '<title id="titre">WEB_CAO — conception d\'une carte 4 couches</title>',
        '<desc id="desc">Animation de 10 secondes dans l\'Éditeur PCB : une carte USB-C de 44 × 30 mm '
        'sur 4 couches — signaux sur Top et Bottom, plan de masse en L2, plan +3V3 en L3. Placement, '
        'fan-out des alimentations, coulée des plans, paire USB 90 Ω appariée en longueur, bus SPI, '
        'vias de couture, DRC sans erreur puis tour des quatre couches.</desc>',
        '<defs>',
        '<pattern id="g1" width="20" height="20" patternUnits="userSpaceOnUse">'
        '<path d="M20,0 L0,0 L0,20" fill="none" stroke="%s" stroke-width="1"/></pattern>' % C_GRID,
        '<pattern id="g2" width="100" height="100" patternUnits="userSpaceOnUse">'
        '<path d="M100,0 L0,0 L0,100" fill="none" stroke="%s" stroke-width="1"/></pattern>' % C_GRIDMAJ,
        '<pattern id="s1" width="1" height="1" patternUnits="userSpaceOnUse">'
        '<path d="M1,0 L0,0 L0,1" fill="none" stroke="%s" stroke-width="0.05"/></pattern>' % C_GRID_S,
        '<pattern id="s2" width="5" height="5" patternUnits="userSpaceOnUse">'
        '<path d="M5,0 L0,0 L0,5" fill="none" stroke="%s" stroke-width="0.06"/></pattern>' % C_GRIDMAJ_S,
        '<linearGradient id="drc"><stop offset="0" stop-color="%s" stop-opacity="0"/>'
        '<stop offset="1" stop-color="%s" stop-opacity=".35"/></linearGradient>' % (C_SEL, C_SEL),
        '<clipPath id="carte"><rect x="0" y="0" width="%g" height="%g" rx="1"/></clipPath>' % (LARG, HAUT),
        "".join(p[1] for p in plans),
        '<style>%s%s</style>' % ("".join(css),
                                 "@media (prefers-reduced-motion:reduce){*{animation-duration:0s!important}}"),
        '</defs>',
        '<rect width="%d" height="%d" fill="%s"/>' % (W, H, C_BG),
        '<rect width="%d" height="%d" fill="url(#g1)"/>' % (W, H),
        '<rect width="%d" height="%d" fill="url(#g2)"/>' % (W, H),
        '<g class="%s"><g transform="translate(%g,%g) scale(%g)">' % (scene, BX, BY, K),
        substrat,
        '<g class="%s"><rect width="%g" height="%g" rx="1" fill="url(#s1)"/>'
        '<rect width="%g" height="%g" rx="1" fill="url(#s2)"/></g>' % (fondu(0.1, 0.4), LARG, HAUT, LARG, HAUT),
        # dessous, puis plans internes, puis dessus : comme l'éditeur, couche active au-dessus
        '<g class="%s" stroke="%s" fill="none" stroke-linecap="round" stroke-linejoin="round">%s</g>' % (
            o_bot, C_BOT, "".join(traces["B"])),
        '<g class="%s" clip-path="url(#carte)">%s</g>' % (o_l3, plans[1][2]),
        '<g class="%s" clip-path="url(#carte)">%s</g>' % (o_l2, plans[0][2]),
        '<g class="%s">%s<g stroke="%s" fill="none" stroke-linecap="round" stroke-linejoin="round">%s</g></g>' % (
            o_top, "".join(pads_top), C_TOP, "".join(traces["T"])),
        "".join(pads_tht), "".join(vias_svg),
        '<g class="%s" stroke="%s" stroke-width="0.15" fill="none" stroke-linecap="round">%s</g>%s' % (
            o_soie, C_SILK, "".join(soie), ""),
        '<g class="%s">%s</g>' % (o_soie, logo),
        '<g stroke="%s" stroke-width="0.07" stroke-dasharray="0.25 0.18">%s</g>' % (C_RATS, "".join(rats)),
        contour, drc,
        '</g></g>',
        # barre de titre
        '<rect width="%d" height="27" fill="%s"/>' % (W, C_BAR),
        '<rect x="12" y="7" width="13" height="13" rx="3" fill="%s"/>' % C_TOP,
        '<rect x="15.5" y="10.5" width="6" height="6" rx="1" fill="none" stroke="%s" stroke-width="1.6"/>' % C_THRU,
        txt(32, 13.5, "WEB_CAO", 12, "#fff", "start"),
        txt(102, 13.5, "Éditeur PCB — carte_usb_4c · 44 × 30 mm", 11, C_BAR_TXT, "start", "600"),
        "".join(puces),
        '<rect y="27" width="%d" height="18" fill="#17191c"/>' % W,
        "".join(onglets),
        '<line x1="0" y1="45.5" x2="%d" y2="45.5" stroke="%s"/>' % (W, C_BAR_BORD),
        '<rect y="%d" width="%d" height="24" fill="%s"/>' % (H - 24, W, C_BAR),
        '<line x1="0" y1="%g" x2="%d" y2="%g" stroke="%s"/>' % (H - 24.5, W, H - 24.5, C_BAR_BORD),
        textes_etat,
        txt(W - 14, H - 12, "%d pistes · %d vias" % (len(PISTES), len(VIAS)), 10.5, C_BAR_TXT, "end", "600"),
        '</svg>',
    ]
    return "\n".join(svg) + "\n", d_min, nb_nets


if __name__ == "__main__":
    contenu, d_min, nets = generer()
    chemin = os.path.join(os.path.dirname(os.path.abspath(__file__)), "pcb-4-couches.svg")
    with open(chemin, "w", encoding="utf-8") as f:
        f.write(contenu)
    print("écrit : %s (%d octets) — %d nets, %d pistes, %d vias, isolement mini %.3f mm, "
          "D+ %.2f mm / D− %.2f mm" % (chemin, os.path.getsize(chemin), nets, len(PISTES), len(VIAS),
                                      d_min, L_DP, L_DN))
