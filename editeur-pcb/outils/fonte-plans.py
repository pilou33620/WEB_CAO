#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
    python3 outils/fonte-plans.py [Regular.ttf Bold.ttf]   -> js/fontes/plans-sans.js

La fonte que les plans (29-draftsman.js) embarquent dans leur PDF, PRÉ-RÉDUITE
ici, une fois pour toutes, à ce qu'un plan écrit : ASCII, Latin-1 et Latin
étendu A (accents d'Europe), ponctuation WinAnsi, grec (Ω, µ, Δ, εr…) et les
symboles d'un technicien (± ° ≤ ≥ ≈ ≠ ∞ √ → ‰ …). Le PDF, lui, n'emporte que
les glyphes qu'il emploie : 33-draftsman-export.js resserre encore ce
sous-ensemble à la volée.

La source est Liberation Sans 2.x (SIL Open Font License 1.1), cherchée par
défaut dans /usr/share/fonts/truetype/liberation/. Pourquoi elle et pas DejaVu
Sans : ses chasses sont celles d'Arial, donc d'Helvetica, à l'unité près. Les
plans centrent les repères et coupent les colonnes avec la table d'Helvetica ;
avec DejaVu, plus large d'un dixième, les tableaux déborderaient.

Ce que le script fait à la fonte, en Python sans module externe :
  · ne garde que les glyphes des caractères voulus, composants des glyphes
    composites compris, renumérotés de 0 (.notdef) à n-1 ;
  · retire les instructions de hinting (fpgm, prep, cvt, gasp et le code de
    chaque glyphe) et les tables de mise en page (GSUB, GPOS, GDEF, kern) :
    un PDF imprimé ou zoomé n'en a pas l'usage, et c'est la moitié du poids ;
  · réécrit cmap (format 4), hmtx (une métrique pleine par glyphe), loca
    (format long), maxp, hhea, head, post (format 3, sans noms de glyphes) ;
  · RENOMME la fonte « PlansSans » : la licence OFL interdit qu'une version
    modifiée porte les noms réservés « Liberation » et « Arimo ». Le copyright
    et la licence restent dans la table name, et OFL-PlansSans.txt les
    accompagne dans le dépôt.

Le résultat est écrit en base64 dans js/fontes/plans-sans.js, que l'éditeur
charge comme ses autres scripts : la fonte est là quand on ouvre la page
depuis le disque, sans serveur, et dans le monofichier dist/editeur-pcb.html.
"""
import base64
import io
import math
import os
import struct
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCES = ("/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
           "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf")
DEST = os.path.join(ROOT, "js", "fontes", "plans-sans.js")
NOM = "PlansSans"


def jeu_de_caracteres():
    """Les points de code gardés : ce qu'un plan de fabrication écrit."""
    cs = set(range(0x20, 0x7F)) | set(range(0xA0, 0x180))      # ASCII, Latin-1, Latin étendu A
    cs |= {0x192, 0x2C6, 0x2C7, 0x2D8, 0x2D9, 0x2DA, 0x2DB, 0x2DC, 0x2DD}
    cs |= set(range(0x391, 0x3CA))                             # grec
    cs |= {0x2009, 0x202F, 0x2013, 0x2014, 0x2018, 0x2019, 0x201A, 0x201C,
           0x201D, 0x201E, 0x2020, 0x2021, 0x2022, 0x2026, 0x2030, 0x2032,
           0x2033, 0x2039, 0x203A, 0x20AC, 0x2116, 0x2122, 0x2126}
    cs |= set(range(0x2190, 0x2196))                           # flèches
    cs |= {0x2202, 0x2206, 0x220F, 0x2211, 0x2212, 0x2215, 0x2219, 0x221A,
           0x221E, 0x222B, 0x2248, 0x2260, 0x2261, 0x2264, 0x2265,
           0x25A0, 0x25A1, 0x25CB, 0x25CF}
    return cs


# ---------------------------------------------------------------------------
#  Lecture
# ---------------------------------------------------------------------------
def tables(data):
    n = struct.unpack(">H", data[4:6])[0]
    t = {}
    for i in range(n):
        tag, _, off, ln = struct.unpack(">4sIII", data[12 + 16 * i:28 + 16 * i])
        t[tag.decode("latin-1")] = data[off:off + ln]
    return t


def lire_cmap(cmap):
    """Unicode -> glyphe, depuis la sous-table (3,10) format 12 ou (3,1) format 4."""
    n = struct.unpack(">H", cmap[2:4])[0]
    subs = {}
    for i in range(n):
        pid, eid, off = struct.unpack(">HHI", cmap[4 + 8 * i:12 + 8 * i])
        subs[(pid, eid)] = off
    out = {}
    if (3, 10) in subs:
        o = subs[(3, 10)]
        ng = struct.unpack(">I", cmap[o + 12:o + 16])[0]
        for k in range(ng):
            a, b, g = struct.unpack(">III", cmap[o + 16 + 12 * k:o + 28 + 12 * k])
            for c in range(a, b + 1):
                out[c] = g + c - a
        return out
    o = subs.get((3, 1), subs.get((0, 3)))
    if o is None:
        sys.exit("pas de table cmap Unicode")
    segx2 = struct.unpack(">H", cmap[o + 6:o + 8])[0]
    seg = segx2 // 2
    ends = struct.unpack(">%dH" % seg, cmap[o + 14:o + 14 + segx2])
    starts = struct.unpack(">%dH" % seg, cmap[o + 16 + segx2:o + 16 + 2 * segx2])
    deltas = struct.unpack(">%dh" % seg, cmap[o + 16 + 2 * segx2:o + 16 + 3 * segx2])
    ro_pos = o + 16 + 3 * segx2
    ros = struct.unpack(">%dH" % seg, cmap[ro_pos:ro_pos + segx2])
    for i in range(seg):
        for c in range(starts[i], ends[i] + 1):
            if c == 0xFFFF:
                continue
            if ros[i] == 0:
                g = (c + deltas[i]) & 0xFFFF
            else:
                p = ro_pos + 2 * i + ros[i] + 2 * (c - starts[i])
                g = struct.unpack(">H", cmap[p:p + 2])[0]
                if g:
                    g = (g + deltas[i]) & 0xFFFF
            if g:
                out[c] = g
    return out


def glyphes(t):
    head, maxp, loca, glyf = t["head"], t["maxp"], t["loca"], t["glyf"]
    ng = struct.unpack(">H", maxp[4:6])[0]
    longue = struct.unpack(">h", head[50:52])[0] == 1
    if longue:
        offs = struct.unpack(">%dI" % (ng + 1), loca[:4 * (ng + 1)])
    else:
        offs = [2 * v for v in struct.unpack(">%dH" % (ng + 1), loca[:2 * (ng + 1)])]
    return [glyf[offs[i]:offs[i + 1]] for i in range(ng)]


def metriques(t, ng):
    nh = struct.unpack(">H", t["hhea"][34:36])[0]
    hm = t["hmtx"]
    out = []
    for i in range(ng):
        if i < nh:
            out.append(struct.unpack(">Hh", hm[4 * i:4 * i + 4]))
        else:
            aw = struct.unpack(">H", hm[4 * (nh - 1):4 * (nh - 1) + 2])[0]
            p = 4 * nh + 2 * (i - nh)
            out.append((aw, struct.unpack(">h", hm[p:p + 2])[0]))
    return out


# Drapeaux des composants d'un glyphe composite
ARG_WORDS, HAS_SCALE, MORE, XY_SCALE, TWO_BY_TWO, INSTR = 0x1, 0x8, 0x20, 0x40, 0x80, 0x100


def composants(g):
    """Les glyphes qu'un composite appelle, avec la position de leur index."""
    out = []
    if len(g) < 10 or struct.unpack(">h", g[:2])[0] >= 0:
        return out
    p = 10
    while True:
        fl, gi = struct.unpack(">HH", g[p:p + 4])
        out.append((p + 2, gi, fl))
        p += 4 + (4 if fl & ARG_WORDS else 2)
        p += 2 if fl & HAS_SCALE else (4 if fl & XY_SCALE else (8 if fl & TWO_BY_TWO else 0))
        if not fl & MORE:
            return out


def longueur_points(g, nc, p):
    """Longueur exacte des drapeaux et coordonnées d'un glyphe simple : sans
    elle, le bourrage de la fonte d'origine s'ajouterait au nôtre."""
    if nc == 0:
        return 0
    npts = struct.unpack(">H", g[10 + 2 * (nc - 1):12 + 2 * (nc - 1)])[0] + 1
    q, fl = p, []
    while len(fl) < npts:
        f = g[q]
        q += 1
        n = 1
        if f & 8:                                # répété
            n += g[q]
            q += 1
        fl += [f] * n
    lx = sum(1 if f & 2 else (0 if f & 16 else 2) for f in fl)
    ly = sum(1 if f & 4 else (0 if f & 32 else 2) for f in fl)
    return q - p + lx + ly


def sans_instructions(g, remap):
    """Le glyphe sans son code de hinting, composants renumérotés."""
    if not g:
        return b""
    nc = struct.unpack(">h", g[:2])[0]
    if nc >= 0:
        p = 10 + 2 * nc
        il = struct.unpack(">H", g[p:p + 2])[0]
        return g[:p] + b"\0\0" + g[p + 2 + il:p + 2 + il + longueur_points(g, nc, p + 2 + il)]
    b = bytearray(g)
    comps = composants(g)
    for pos, gi, fl in comps:
        struct.pack_into(">H", b, pos, remap[gi])
    pos, _, fl = comps[-1]
    fin = pos - 2 + 4 + (4 if fl & ARG_WORDS else 2)
    fin += 2 if fl & HAS_SCALE else (4 if fl & XY_SCALE else (8 if fl & TWO_BY_TWO else 0))
    if fl & INSTR:
        struct.pack_into(">H", b, pos - 2, fl & ~INSTR)
    return bytes(b[:fin])


# ---------------------------------------------------------------------------
#  Écriture
# ---------------------------------------------------------------------------
def cmap4(carte):
    """cmap avec une seule sous-table (3,1) format 4 : un segment par suite de
    points de code consécutifs, delta quand les glyphes suivent aussi."""
    cs = sorted(carte)
    segs = []
    for c in cs:
        if segs and c == segs[-1][1] + 1 and carte[c] == carte[segs[-1][1]] + 1:
            segs[-1][1] = c
        else:
            segs.append([c, c])
    segs.append([0xFFFF, 0xFFFF])
    n = len(segs)
    ends = [s[1] for s in segs]
    starts = [s[0] for s in segs]
    deltas = [((carte[s[0]] - s[0]) if s[0] != 0xFFFF else 1) & 0xFFFF for s in segs]
    e = 1
    while e * 2 <= n:
        e *= 2
    sr = 2 * e
    corps = struct.pack(">HHHH", 2 * n, sr, int(math.log2(e)), 2 * n - sr)
    corps += struct.pack(">%dH" % n, *ends) + b"\0\0" + struct.pack(">%dH" % n, *starts)
    corps += struct.pack(">%dH" % n, *deltas) + struct.pack(">%dH" % n, *([0] * n))
    sous = struct.pack(">HHH", 4, 6 + len(corps), 0) + corps
    return struct.pack(">HHHHI", 0, 1, 3, 1, 12) + sous


def table_name(ancienne, style):
    """Les noms : la fonte s'appelle PlansSans (nom réservé oblige), le
    copyright, la version et la licence de l'original restent."""
    n = struct.unpack(">H", ancienne[2:4])[0]
    so = struct.unpack(">H", ancienne[4:6])[0]
    garde = {}
    for i in range(n):
        pid, eid, lid, nid, ln, off = struct.unpack(">HHHHHH", ancienne[6 + 12 * i:18 + 12 * i])
        if pid == 3 and eid == 1 and lid == 0x409 and nid in (0, 5, 13, 14):
            garde[nid] = ancienne[so + off:so + off + ln].decode("utf-16-be")
    garde[0] = garde.get(0, "") + " Sous-ensemble renommé " + NOM + " pour WEB_CAO (OFL 1.1, nom réservé)."
    garde[1] = NOM
    garde[2] = style
    garde[3] = NOM + "-" + style + " WEB_CAO"
    garde[4] = NOM + " " + style
    garde[6] = NOM + "-" + style
    enr, donnees = [], b""
    for nid in sorted(garde):
        b = garde[nid].encode("utf-16-be")
        enr.append(struct.pack(">HHHHHH", 3, 1, 0x409, nid, len(b), len(donnees)))
        donnees += b
    return struct.pack(">HHH", 0, len(enr), 6 + 12 * len(enr)) + b"".join(enr) + donnees


def somme(b):
    b = b + b"\0" * (-len(b) % 4)
    return sum(struct.unpack(">%dI" % (len(b) // 4), b)) & 0xFFFFFFFF


def assembler(tabs):
    tags = sorted(tabs)
    n = len(tags)
    e = 1
    while e * 2 <= n:
        e *= 2
    tete = struct.pack(">IHHHH", 0x00010000, n, 16 * e, int(math.log2(e)), 16 * n - 16 * e)
    off = 12 + 16 * n
    rep, corps = b"", b""
    for tg in tags:
        d = tabs[tg]
        rep += struct.pack(">4sIII", tg.encode("latin-1"), somme(d), off + len(corps), len(d))
        corps += d + b"\0" * (-len(d) % 4)
    fonte = bytearray(tete + rep + corps)
    # checkSumAdjustment de head : 0xB1B0AFBA moins la somme de tout le fichier
    p = 12 + 16 * tags.index("head")
    ho = struct.unpack(">I", fonte[p + 8:p + 12])[0]
    struct.pack_into(">I", fonte, ho + 8, (0xB1B0AFBA - somme(bytes(fonte))) & 0xFFFFFFFF)
    return bytes(fonte)


def reduire(chemin, style):
    data = open(chemin, "rb").read()
    if data[:4] not in (b"\0\1\0\0", b"true"):
        sys.exit("%s : pas une fonte TrueType (glyf)" % chemin)
    t = tables(data)
    uni = lire_cmap(t["cmap"])
    gl = glyphes(t)
    mt = metriques(t, len(gl))
    carte = {c: uni[c] for c in jeu_de_caracteres() if c in uni}
    garde = {0} | set(carte.values())
    pile = list(garde)
    while pile:                                  # composants des composites
        for _, gi, _ in composants(gl[pile.pop()]):
            if gi not in garde:
                garde.add(gi)
                pile.append(gi)
    ordre = sorted(garde)
    remap = {g: i for i, g in enumerate(ordre)}

    glyf, loca, hmtx = b"", [0], b""
    for g in ordre:
        b = sans_instructions(gl[g], remap)
        b += b"\0" * (-len(b) % 4)
        glyf += b
        loca.append(len(glyf))
        hmtx += struct.pack(">Hh", *mt[g])
    n = len(ordre)

    head = bytearray(t["head"])
    struct.pack_into(">I", head, 8, 0)
    struct.pack_into(">h", head, 50, 1)          # loca longue
    hhea = bytearray(t["hhea"])
    struct.pack_into(">H", hhea, 34, n)
    maxp = bytearray(t["maxp"])
    struct.pack_into(">H", maxp, 4, n)
    if len(maxp) >= 32:                          # plus de hinting : rien à réserver
        for off in (14, 16, 18, 20, 22, 24, 26):  # zones gardées à 2 (14), le reste à 0
            struct.pack_into(">H", maxp, off, 2 if off == 14 else 0)
    post = bytearray(t["post"][:32])
    struct.pack_into(">I", post, 0, 0x00030000)

    tabs = {"head": bytes(head), "hhea": bytes(hhea), "maxp": bytes(maxp),
            "OS/2": t["OS/2"], "hmtx": hmtx, "cmap": cmap4({c: remap[g] for c, g in carte.items()}),
            "loca": struct.pack(">%dI" % len(loca), *loca), "glyf": glyf,
            "name": table_name(t["name"], style), "post": bytes(post)}
    return assembler(tabs), len(data), n, len(carte)


def main():
    src = sys.argv[1:3] if len(sys.argv) >= 3 else SOURCES
    blocs, notes = [], []
    for chemin, style, cle in zip(src, ("Regular", "Bold"), ("normal", "gras")):
        if not os.path.exists(chemin):
            sys.exit("fonte introuvable : %s (paquet fonts-liberation2, ou donner les deux chemins)" % chemin)
        ttf, avant, ng, nc = reduire(chemin, style)
        b64 = base64.b64encode(ttf).decode("ascii")
        lignes = [b64[i:i + 100] for i in range(0, len(b64), 100)]
        blocs.append('  %s:[\n%s].join("")' % (cle, ",\n".join('"%s"' % l for l in lignes)))
        notes.append("%s : %d glyphes pour %d caractères, %d octets (original %d)"
                     % (os.path.basename(chemin), ng, nc, len(ttf), avant))
    entete = ('"use strict";\n'
              "/* ==========================================================================\n"
              "   PlansSans — fonte des plans PDF (29-draftsman.js, 33-draftsman-export.js)\n"
              "   --------------------------------------------------------------------------\n"
              "   FICHIER GÉNÉRÉ par outils/fonte-plans.py : ne pas modifier à la main.\n"
              "   Sous-ensemble de Liberation Sans 2.x (Regular et Bold), renommé comme\n"
              "   l'exige la licence SIL Open Font License 1.1 (noms réservés « Liberation »\n"
              "   et « Arimo ») ; texte de la licence dans js/fontes/OFL-PlansSans.txt.\n"
              "     Digitized data copyright (c) 2010 Google Corporation\n"
              "     Copyright (c) 2012 Red Hat, Inc.\n"
              + "".join("   %s\n" % n for n in notes) +
              "   ========================================================================== */\n")
    os.makedirs(os.path.dirname(DEST), exist_ok=True)
    with io.open(DEST, "w", encoding="utf-8", newline="\n") as f:
        f.write(entete + "var DF_FONTE_TTF={\n" + ",\n".join(blocs) + "\n};\n")
    for n in notes:
        print(n)
    print("écrit : %s (%d Ko)" % (os.path.relpath(DEST, ROOT), os.path.getsize(DEST) // 1024))


if __name__ == "__main__":
    main()
