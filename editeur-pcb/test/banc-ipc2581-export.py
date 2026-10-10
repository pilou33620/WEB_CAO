# -*- coding: utf-8 -*-
# =============================================================================
# editeur-pcb/test/banc-ipc2581-export.py
# Banc d'essai de l'export IPC-2581 de l'editeur PCB, par aller-retour.
#
#     python3 outils/build-monofichier.py && node test/harness.js
#     python3 test/banc-ipc2581-export.py [--xsd chemin/IPC-2581C.xsd]
#
# L'export s'ecrit en JavaScript (js/35-ipc2581-export.js) ; il se relit ici
# par la chaine de la visionneuse, telle quelle : python/ipc2581_parser.py puis
# python/ipc2581_json.py. Un export qui ne se relirait que par lui-meme ne
# prouverait rien -- c'est le lecteur d'en face qui juge.
#
# Le banc d'essai de l'editeur (test/harness.js) charge les deux cartes
# d'exemple, et une troisieme qui ajoute ce que les exemples n'ont pas
# (contre-percage, rugosite, composants dessous a angle quelconque, pastilles
# chanfreinee, polygonale et oblongue, arc, decoupe de carte, trous NPTH,
# variante de montage). Il ecrit chaque export dans dist/essai-ipc2581/, a
# cote de ce que l'editeur en attend (<nom>.attendu.json) : ce banc compare.
#
# LE XSD. IPC-2581C.xsd n'est pas dans le depot : il appartient a l'IPC.
# KiCad en garde une copie (qa/data/pcbnew/ipc2581/IPC-2581C.xsd). Donne par
# --xsd ou par la variable IPC2581_XSD, et lxml installe, chaque export est
# valide contre lui ; sans eux, la validation est sautee et le banc le dit.
# =============================================================================
import json
import math
import os
import re
import sys
import xml.etree.ElementTree as ET

ICI = os.path.dirname(os.path.abspath(__file__))
RACINE = os.path.dirname(os.path.dirname(ICI))
sys.path.insert(0, os.path.join(RACINE, "python"))

import ipc2581_json                                          # noqa: E402

DOSSIER = os.path.join(os.path.dirname(ICI), "dist", "essai-ipc2581")
NS = "{http://webstds.ipc.org/2581}"
RE_CUIVRE = re.compile(r"COND|SIGNAL|PLANE|POWER|GROUND|MIXED")

XSD = os.environ.get("IPC2581_XSD", "")
for i, a in enumerate(sys.argv[1:]):
    if a == "--xsd" and i + 2 < len(sys.argv):
        XSD = sys.argv[i + 2]
    elif a.startswith("--xsd="):
        XSD = a[6:]

# =============================================================================
# Le harnais, celui de visionneuse-ipc2581/test/banc-essai.py : un T() par
# cas, et un cas rate n'arrete pas les autres.
# =============================================================================
CAS = []
ECHECS = []
SAUTES = []


def T(titre, fonction):
    CAS.append(titre)
    try:
        fonction()
    except Exception as exc:                                  # noqa: BLE001
        ECHECS.append((titre, exc))
        print(u"  ECHEC  %s" % titre)
        print(u"         %s" % exc)
    else:
        print(u"  ok     %s" % titre)


def egal(vu, attendu, quoi):
    if vu != attendu:
        raise AssertionError(u"%s : %r attendu, %r vu" % (quoi, attendu, vu))


def proche(vu, attendu, quoi, tol=1e-6):
    if vu is None or abs(float(vu) - float(attendu)) > tol:
        raise AssertionError(u"%s : %s attendu, %s vu" % (quoi, attendu, vu))


def vrai(condition, quoi):
    if not condition:
        raise AssertionError(quoi)


# =============================================================================
# Geometrie, dans le repere du fichier
# =============================================================================
def aire(plat):
    """Aire d'un polygone donne a plat [x1, y1, x2, y2, ...]."""
    p = list(zip(plat[0::2], plat[1::2]))
    return abs(sum(p[i - 1][0] * p[i][1] - p[i][0] * p[i - 1][1]
                   for i in range(len(p)))) / 2


def dans(x, y, plat):
    """Point dans un polygone a plat (pair-impair)."""
    p = list(zip(plat[0::2], plat[1::2]))
    dedans = False
    j = len(p) - 1
    for i in range(len(p)):
        (xi, yi), (xj, yj) = p[i], p[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            dedans = not dedans
        j = i
    return dedans


def dist_segment(x, y, a, b):
    """Distance du point (x, y) au segment [a, b]."""
    dx, dy = b[0] - a[0], b[1] - a[1]
    l2 = dx * dx + dy * dy
    t = 0 if l2 == 0 else max(0, min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l2))
    return math.hypot(x - a[0] - t * dx, y - a[1] - t * dy)


def placer(px, py, cx, cy, rot, mir):
    """Le placement d'une broche, comme la visionneuse (mdlPlacer) : miroir
    en X d'abord, rotation ensuite, sens trigonometrique."""
    if mir:
        px = -px
    a = math.radians(rot or 0)
    return (cx + px * math.cos(a) - py * math.sin(a),
            cy + px * math.sin(a) + py * math.cos(a))


def milieu_arc(a):
    """Milieu et longueur d'un arc du modele : debut, fin, centre, sens."""
    (sx, sy), (ex, ey), (mx, my) = a["s"], a["e"], a["m"]
    r = math.hypot(sx - mx, sy - my)
    a1 = math.atan2(sy - my, sx - mx)
    d = math.atan2(ey - my, ex - mx) - a1
    if a["h"]:
        while d > 0:
            d -= 2 * math.pi
    else:
        while d < 0:
            d += 2 * math.pi
    t = a1 + d / 2
    return (mx + r * math.cos(t), my + r * math.sin(t)), r * abs(d)


# =============================================================================
# Les cas, pour chaque export
# =============================================================================
def cas_export(nom):
    chemin = os.path.join(DOSSIER, nom + ".xml")
    with open(chemin, "rb") as f:
        octets = f.read()
    with open(os.path.join(DOSSIER, nom + ".attendu.json"), encoding="utf-8") as f:
        A = json.load(f)
    etat = {}

    def bien_forme():
        racine = ET.fromstring(octets)
        egal(racine.tag, NS + "IPC-2581", u"element racine")
        egal(racine.get("revision"), "C", u"revision")
        egal([e.tag[len(NS):] for e in racine],
             ["Content", "LogisticHeader", "HistoryRecord", "Bom", "Ecad"]
             if racine.find(NS + "Bom") is not None else
             ["Content", "LogisticHeader", "HistoryRecord", "Ecad"],
             u"sections")
        etat["racine"] = racine
    T(u"%s : XML bien forme, IPC-2581 revision C, sections dans l'ordre" % nom, bien_forme)

    if XSD and os.path.isfile(XSD):
        try:
            from lxml import etree                            # noqa: WPS433
        except ImportError:
            etree = None
            SAUTES.append(u"%s : lxml absent, XSD non verifie" % nom)
        if etree is not None:
            def conforme():
                schema = etree.XMLSchema(etree.parse(XSD))
                doc = etree.fromstring(octets)
                if not schema.validate(doc):
                    e = schema.error_log[0]
                    raise AssertionError(u"ligne %s : %s" % (e.line, e.message))
            T(u"%s : conforme a %s" % (nom, os.path.basename(XSD)), conforme)
    else:
        SAUTES.append(u"%s : XSD non fourni (--xsd ou IPC2581_XSD)" % nom)

    M = ipc2581_json.ipc2581_en_dict(octets, nom + ".xml")
    couches, nets, st = M["couches"], M["nets"], M["stats"]
    fonction = {c: i["f"] for c, i in M["calques"].items()}
    cuivre = [c for c in couches if RE_CUIVRE.search(fonction.get(c, ""))]

    def composants():
        egal(st["composants"], len(A["composants"]), u"composants")
        parref = {c["ref"]: c for c in M["composants"]}
        for a in A["composants"]:
            c = parref.get(a["ref"])
            vrai(c is not None, u"%s absent" % a["ref"])
            proche(c["x"], a["x"], a["ref"] + u" x", 1e-4)
            proche(c["y"], a["y"], a["ref"] + u" y", 1e-4)
            proche(c["r"], a["r"], a["ref"] + u" rotation", 1e-3)
            egal(c["m"], a["m"], a["ref"] + u" miroir (face)")
            egal(couches[c["c"]], a["couche"], a["ref"] + u" couche")
            egal(c["val"], a["val"], a["ref"] + u" valeur")
            if a["mpn"]:
                egal(c["part"], a["mpn"], a["ref"] + u" MPN")
    T(u"%s : composants -- place, rotation, face, valeur, MPN" % nom, composants)

    def broches():
        # la broche de l'empreinte, posee par le composant, tombe sur la
        # pastille que l'editeur a gravee : rotation et miroir sont bons
        parref = {c["ref"]: c for c in M["composants"]}
        for a in A["composants"]:
            c = parref[a["ref"]]
            vues = c.get("pins", [])
            vrai(vues, a["ref"] + u" sans broches")
            for b in vues:
                x, y = placer(b["x"], b["y"], c["x"], c["y"], c["r"], c["m"])
                ok = any(p["num"] == b["num"] and abs(p["x"] - x) < 1e-3
                         and abs(p["y"] - y) < 1e-3 for p in a["pins"])
                vrai(ok, u"%s broche %s posee en (%.4f ; %.4f), hors de sa pastille"
                     % (a["ref"], b["num"], x, y))
            egal(sorted({b["num"] for b in vues}), sorted({p["num"] for p in a["pins"]}),
                 a["ref"] + u" numeros de broche")
    T(u"%s : chaque broche posee sur sa pastille (miroir puis rotation)" % nom, broches)

    def les_nets():
        egal(sorted(set(nets) - {"Non-Net"}), A["nets"], u"nets")
        vrai(all(len(c.get("pins", [])) for c in M["composants"]), u"composant sans broche")
        lies = sum(1 for c in M["composants"] for b in c["pins"] if "n" in b)
        vrai(lies > 0, u"aucune broche reliee a son net (<LogicalNet>)")
    T(u"%s : memes nets" % nom, les_nets)

    def cuivre_trace():
        par = {}
        for p in M["pistes"]:
            nomc = couches[p["c"]]
            if nomc in cuivre:
                par[nomc] = par.get(nomc, 0) + 1
        egal(par, A["pistes"], u"pistes par couche de cuivre")
        arcs = [a for a in M["arcs"] if couches[a["c"]] in cuivre]
        egal(len(arcs), len(A["arcs"]), u"arcs")
        for a in A["arcs"]:
            vrai(any(couches[b["c"]] == a["couche"]
                     and abs(milieu_arc(b)[0][0] - a["mid"][0]) < 1e-3
                     and abs(milieu_arc(b)[0][1] - a["mid"][1]) < 1e-3
                     and abs(milieu_arc(b)[1] - a["len"]) < 1e-3 for b in arcs),
                 u"arc de %s, milieu %s : pas relu au meme endroit" % (a["couche"], a["mid"]))
    T(u"%s : memes pistes, arcs gardes en arcs (milieu, longueur)" % nom, cuivre_trace)

    def percages():
        p = [d["p"] for d in M["percages"]]
        egal(p.count("VIA"), A["vias"], u"vias")
        egal(p.count("PLATED"), A["trous"]["PLATED"], u"trous de pastilles")
        egal(p.count("NONPLATED"), A["trous"]["NONPLATED"], u"trous NPTH")
        egal(len(p), sum(A["trous"].values()), u"trous en tout")
        for d in M["percages"]:
            if d["p"] == "VIA":
                vrai("sa" in d and "sb" in d, u"via sans portee declaree")
                vrai(d.get("a", 0) > 0 and not d.get("a_sup"), u"anneau du via suppose")
    T(u"%s : memes vias et trous, portee et anneau declares" % nom, percages)

    def contour():
        c, a = M["contour"], A["contour"]
        trous = c.get("t", [])
        egal(len(trous), a["decoupes"], u"decoupes")
        # les arcs du profil : ceux que l'editeur reconnait dans ses cordes
        racine = etat.get("racine")
        profil = racine.find(NS + "Ecad/" + NS + "CadData/" + NS + "Step/" + NS + "Profile")
        egal(len(profil.findall(".//" + NS + "PolyStepCurve")), a["arcs"], u"arcs du profil")
        vu = aire(c["o"]) - sum(aire(t) for t in trous)
        if not a["arcs"]:
            proche(vu, a["aire"], u"aire", 1e-3)
            return
        # un arc remplace des cordes : l'aire change de leurs fleches (au
        # millieme pres, relativement), les sommets de l'editeur restent sur
        # le contour relu, et le contour relu ne s'ecarte pas des cordes
        proche(vu, a["aire"], u"aire (relative)", 1e-3 * a["aire"])
        for lu, bord in zip([c["o"]] + trous, a["bords"]):
            P = list(zip(lu[0::2], lu[1::2]))
            for x, y in bord:
                vrai(min(dist_segment(x, y, P[i - 1], P[i]) for i in range(len(P))) < 1e-3,
                     u"sommet (%s ; %s) de l'editeur hors du contour relu" % (x, y))
            for x, y in P:
                vrai(min(dist_segment(x, y, bord[i - 1], bord[i]) for i in range(len(bord))) < 0.01,
                     u"le contour relu s'ecarte des cordes en (%s ; %s)" % (x, y))
    T(u"%s : meme contour (aire au millieme, decoupes, arcs gardes)" % nom, contour)

    def empilage():
        egal(cuivre, A["cuivres"], u"couches de cuivre")
        E = M["empilage"]
        egal([e["nom"] for e in E], [a["nom"] for a in A["empilage"]], u"empilage")
        for e, a in zip(E, A["empilage"]):
            proche(e["ep"], a["ep"], e["nom"] + u" epaisseur")
            for cle in ("dk", "df"):
                if cle in a:
                    proche(e[cle], a[cle], e["nom"] + u" " + cle)
            if "mat" in a:
                egal(e["mat"], a["mat"], e["nom"] + u" matiere")
            if "type" in a:
                egal(e["type"], a["type"], e["nom"] + u" fonction")
        proche(M["epaisseur"], A["epaisseur"], u"epaisseur hors-tout")
    T(u"%s : meme empilage (epaisseurs, er, tan d, matieres)" % nom, empilage)

    def rugosite():
        for e in M["empilage"]:
            if e["nom"] in A["rugosite"]:
                proche(e.get("rug"), A["rugosite"][e["nom"]], e["nom"] + u" rugosite")
            else:
                vrai("rug" not in e, e["nom"] + u" : rugosite inventee")
    T(u"%s : rugosite du cuivre retrouvee" % nom, rugosite)

    def contre_percage():
        egal(st["contre_percages"], len(A["contre_percage"]), u"vias contre-perces")
        egal(st["contre_percages_orphelins"], 0, u"forets sans via")
        for a in A["contre_percage"]:
            d = next((d for d in M["percages"] if abs(d["x"] - a["x"]) < 1e-4
                      and abs(d["y"] - a["y"]) < 1e-4 and "cp" in d), None)
            vrai(d is not None, u"via (%s ; %s) sans contre-percage" % (a["x"], a["y"]))
            cp = d["cp"]
            egal(cp.get("cote"), a["cote"], u"face")
            egal(couches[cp["g"]], a["garde"], u"couche a ne pas couper")
            proche(cp["res"], a["res"], u"moignon residuel")
            proche(cp["d"], a["diam"], u"diametre du foret")
            proche(cp["prof"], a["prof"], u"profondeur", 1e-4)
    T(u"%s : contre-percage retrouve (face, couche gardee, moignon, foret)" % nom, contre_percage)

    def zones():
        for z in A["zones"]:
            ilots = [g for p in M["plans"]
                     if couches[p["c"]] == z["couche"] and nets[p["n"]] == z["net"]
                     for g in p["g"]]
            vrai(ilots, u"zone %s de %s absente" % (z["net"], z["couche"]))

            def cuivre_en(x, y):
                return any(dans(x, y, g["o"]) and not any(dans(x, y, t) for t in g.get("t", []))
                           for g in ilots)
            for x, y in z["dedans"]:
                vrai(cuivre_en(x, y), u"%s/%s : le via du net en (%s ; %s) n'est pas dans le cuivre"
                     % (z["couche"], z["net"], x, y))
            for x, y in z["dehors"]:
                vrai(not cuivre_en(x, y), u"%s/%s : du cuivre sous l'objet d'un autre net en (%s ; %s)"
                     % (z["couche"], z["net"], x, y))
    T(u"%s : zones remplies -- le net raccorde, les autres degages" % nom, zones)

    def technique():
        par = {}
        for p in M["pads"]:
            ps = M["padstacks"].get(p["ps"], {})
            for c in {q["c"] for q in ps.get("pads", [])}:
                par[c] = par.get(c, 0) + 1
        egal([par.get("MASQUE_DESSUS", 0), par.get("MASQUE_DESSOUS", 0)], A["masque"], u"ouvertures de masque")
        egal([par.get("PATE_DESSUS", 0), par.get("PATE_DESSOUS", 0)], A["pate"], u"ouvertures de pate")
        egal(st["textes"], A["textes"], u"textes de serigraphie")
    T(u"%s : masque, pate et textes de serigraphie" % nom, technique)

    def nomenclature():
        racine = etat.get("racine")
        vrai(racine is not None, u"XML illisible")
        pose = {r.get("name"): r.get("populate") == "true"
                for r in racine.iter(NS + "RefDes")}
        egal(pose, {a["ref"]: a["pose"] for a in A["composants"]}, u"repere -> monte")
    T(u"%s : nomenclature, non-montes de la variante marques" % nom, nomenclature)


# =============================================================================
noms = sorted(f[:-len(".attendu.json")] for f in
              (os.listdir(DOSSIER) if os.path.isdir(DOSSIER) else [])
              if f.endswith(".attendu.json"))
if not noms:
    print(u"Aucun export dans %s : lancer d'abord le banc de l'editeur\n"
          u"    python3 outils/build-monofichier.py && node test/harness.js" % DOSSIER)
    sys.exit(1)
for n in noms:
    cas_export(n)

print(u"-" * 62)
for s in SAUTES:
    print(u"  saute  %s" % s)
if ECHECS:
    print(u"%d cas, %d ECHEC(S)" % (len(CAS), len(ECHECS)))
    for titre, exc in ECHECS:
        print(u"  - %s : %s" % (titre, exc))
    sys.exit(1)
print(u"%d cas, tous passes" % len(CAS))
