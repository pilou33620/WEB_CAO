# -*- coding: utf-8 -*-
"""Modeles IBIS : lecture d'un fichier .ibs et tampons non lineaires.

    >>> import ibis
    >>> m = ibis.lire(open("composant.ibs").read())
    >>> sorted(m["modeles"])

POURQUOI. L'oeil de `oeil.py` ferme la liaison sur un generateur de Thevenin
-- une source et une resistance --, ce qu'un tampon CMOS n'est pas : sa
resistance de sortie depend de la tension qu'il voit, ses diodes de
protection ecretent les depassements, et son front est celui que le
fabricant a mesure, pas une gaussienne. Le fichier IBIS (ANSI/EIA-656) est
la facon dont les fabricants le decrivent, sans devoiler le transistor :
des tableaux, et rien d'autre.

CE QUI EST LU, de chaque [Model] :
    Model_type, C_comp (typ/min/max), Vinl, Vinh ;
    [Voltage Range], [Pullup Reference], [Pulldown Reference],
    [POWER Clamp Reference], [GND Clamp Reference] ;
    [Pullup], [Pulldown], [GND Clamp], [POWER Clamp] : courbes V-I ;
    [Ramp] : dV/dt montant et descendant, R_load ;
    [Rising Waveform], [Falling Waveform] : formes d'onde sous charge
    d'essai (R_fixture, V_fixture, C_fixture), autant qu'il y en a ;
    [Rgnd], [Rpower] : terminaisons d'entree.
Et, en lecture complete (1.1.0, `lire(..., complet=True)`), le BOITIER ET
LES BROCHES : [Package], [Pin], [Diff Pin], [Model Selector],
[Package Model] -> [Define Package Model] (diagonale des matrices ; les
mutuelles sont dites, pas comptees), le renvoi [Algorithmic Model] -- voir
« Le boitier et les broches ». Le reste (sous-modeles, [Model Spec],
boitiers par sections) est ignore, et dit dans le resultat.

LE FICHIER .AMI d'un modele IBIS-AMI se lit aussi (`lire_ami`) : l'arbre de
ses parametres, et ce qu'ils proposent pour un egaliseur de reference
(`proposer_egaliseur`). La bibliotheque du fabricant n'est PAS executee.

LA PAIRE (1.1.0) : deux tampons sur les deux brins d'une paire couplee,
remise par brin depuis ses deux modes -- voir `LiaisonPaire`.

LES CONVENTIONS DE LA NORME, a ne pas confondre :
  · un courant est COMPTE POSITIF QUAND IL ENTRE dans le composant par la
    broche ;
  · les tensions de [Pullup] et de [POWER Clamp] sont RELATIVES A LEUR
    REFERENCE : V_tableau = V_ref - V_broche ; celles de [Pulldown] et de
    [GND Clamp] le sont a la leur : V_tableau = V_broche - V_ref ;
  · les colonnes sont typ, min, max ; « NA » renvoie a typ ;
  · les suffixes sont T G M k m u n p f -- M est le MEGA, m le milli --, et
    ce qui suit le suffixe (V, A, F, H, s...) est ignore.

LE TAMPON EMETTEUR, dans le temps. A chaque instant
    I_broche(V, t) = Ku(t) I_pu(V) + Kd(t) I_pd(V) + I_pc(V) + I_gc(V)
                     + C_comp dV/dt
ou Ku et Kd, entre 0 et 1, disent a quel point le transistor du haut et
celui du bas conduisent. On les tire des formes d'onde du fichier : sous la
charge d'essai, l'equation ci-dessus doit rendre la forme d'onde mesuree.
  · DEUX formes d'onde par front (deux charges d'essai) : deux equations,
    deux inconnues, a chaque instant ;
  · UNE seule : on suppose Kd = 1 - Ku, et l'equation donne Ku ;
  · AUCUNE, seulement [Ramp] : Ku monte lineairement sur la duree du front
    (dt 20-80 / 0,6), Kd = 1 - Ku -- la plus pauvre des trois, et dite.
"""

import bisect
import math
import re

try:
    import numpy as np
except Exception:                                      # noqa: BLE001
    np = None

VERSION = "1.1.0"
COINS = {"typ": 0, "min": 1, "max": 2}
SUFFIXES = {"T": 1e12, "G": 1e9, "M": 1e6, "k": 1e3, "m": 1e-3, "u": 1e-6,
            "n": 1e-9, "p": 1e-12, "f": 1e-15}
_NOMBRE = re.compile(r"^([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)([A-Za-z]*)")
# Plafond du texte d'un fichier : les plus gros .ibs du commerce (FPGA a
# mille broches) pesent quelques megaoctets.
MAX_TEXTE = 12 * 1024 * 1024


class ErreurIbis(Exception):
    """Refus explicite : un message d'une ligne et ce qu'il faut changer."""
    def __init__(self, message, conseil=""):
        super(ErreurIbis, self).__init__(message)
        self.message = str(message)
        self.conseil = str(conseil)


# ==========================================================================
# La lecture
# ==========================================================================

def nombre(txt):
    """Un nombre IBIS (« 1.5nH », « -3.3e-1 », « 2.0k »), None pour « NA »."""
    txt = str(txt).strip()
    if not txt or txt.upper() == "NA":
        return None
    m = _NOMBRE.match(txt)
    if not m:
        raise ValueError("nombre illisible : %r" % txt)
    v = float(m.group(1))
    suite = m.group(2)
    if suite and suite[0] in SUFFIXES:
        v *= SUFFIXES[suite[0]]
    return v


def _trois(champs):
    """(typ, min, max) d'une liste de champs ; min et max absents ou « NA »
    renvoient a typ."""
    vals = [nombre(c) for c in champs[:3]]
    while len(vals) < 3:
        vals.append(None)
    if vals[0] is None:
        vals[0] = next((v for v in vals if v is not None), None)
    return tuple(v if v is not None else vals[0] for v in vals)


def _rapport(txt):
    """« 1.0/0.5n » -> (1.0, 0.5e-9), ou None."""
    if "/" not in txt:
        return None
    a, b = txt.split("/", 1)
    va, vb = nombre(a), nombre(b)
    if va is None or vb is None:
        return None
    return (va, vb)


def _cle(mot):
    """Le nom d'un mot-cle, normalise : minuscules, espaces et soulignes
    confondus. « [Rising Waveform] » -> « rising waveform »."""
    return re.sub(r"[\s_]+", " ", mot.strip().lower())


TABLEAUX_VI = ("pullup", "pulldown", "gnd clamp", "power clamp")
REFERENCES = {"voltage range": "voltage_range",
              "pullup reference": "pullup_ref",
              "pulldown reference": "pulldown_ref",
              "power clamp reference": "power_clamp_ref",
              "gnd clamp reference": "gnd_clamp_ref",
              "rgnd": "rgnd", "rpower": "rpower"}


# LE BOITIER ET LES BROCHES (1.1.0), lus quand `lire(..., complet=True)` :
# les mots-cles du [Component] et ceux des modeles de boitier.
BOITIER = {"r_pkg": "r", "l_pkg": "l", "c_pkg": "c"}
MATRICES = {"resistance matrix": "r", "inductance matrix": "l",
            "capacitance matrix": "c"}
MOTS_COMPLETS = ("package", "pin", "diff pin", "model selector",
                 "package model", "define package model",
                 "end package model", "number of sections", "pin numbers",
                 "resistance matrix", "inductance matrix",
                 "capacitance matrix", "bandwidth", "row",
                 "algorithmic model", "end algorithmic model")
# Ceux d'un [Define Package Model] qui ne portent rien d'utile au calcul :
# lus, et tus.
DECOR_BOITIER = ("manufacturer", "oem", "description", "model data",
                 "end model data", "number of pins", "merged pins")
# Les « modeles » de [Pin] qui n'en sont pas : alimentations et broches
# libres.
BROCHES_PASSIVES = ("POWER", "GND", "NC", "NA")


def lire(texte, nom_fichier="", complet=False):
    """Le texte d'un fichier .ibs -> {version, composant, modeles, ignores}.

    `complet` (1.1.0) lit AUSSI le boitier et les broches -- [Package],
    [Pin], [Diff Pin], [Model Selector], [Package Model],
    [Define Package Model] -- et le renvoi [Algorithmic Model] de chaque
    [Model] : voir `boitier_broche`, `paire_diff`, `modele_broche`. Sans
    lui, la lecture est celle de la 1.0.0 au mot pres, et ces mots-cles
    sont dits ignores.

    Leve ErreurIbis si aucun [Model] n'est lisible."""
    if not isinstance(texte, str):
        raise ErreurIbis("Le fichier IBIS doit arriver en texte.")
    if len(texte) > MAX_TEXTE:
        raise ErreurIbis("Fichier IBIS de %.1f Mo : au-delà de ce que la "
                         "route accepte." % (len(texte) / 1e6),
                         "Extrayez le [Model] utile dans un fichier à part.")
    commentaire = "|"
    res = {"fichier": nom_fichier, "version": "", "composant": "",
           "modeles": {}, "ignores": []}
    if complet:
        res.update({"boitier": None, "broches": {}, "ordre_broches": [],
                    "paires_diff": [], "selecteurs": {},
                    "modele_boitier": "", "modeles_boitier": {},
                    "composants": 0})
    modele = None
    section = None          # le mot-cle en cours, normalise
    onde = None             # la forme d'onde en cours
    etat = {"composants": 0, "colonnes": [], "selecteur": None,
            "mb": None, "matrice": None, "rang": None}
    ignores = set()
    for n_ligne, brute in enumerate(texte.splitlines(), start=1):
        ligne = brute
        if ligne.lstrip().lower().startswith("[comment char]"):
            reste = ligne.split("]", 1)[1].strip()
            if reste:
                commentaire = reste[0]
            continue
        if commentaire in ligne:
            ligne = ligne[:ligne.index(commentaire)]
        ligne = ligne.strip()
        if not ligne:
            continue
        if ligne.startswith("["):
            if "]" not in ligne:
                continue
            mot, arg = ligne[1:].split("]", 1)
            cle = _cle(mot)
            arg = arg.strip()
            section, onde = cle, None
            if complet and (cle in MOTS_COMPLETS or (
                    etat["mb"] is not None and cle in DECOR_BOITIER)):
                _mot_complet(res, etat, cle, arg, modele)
                continue
            if cle == "ibis ver":
                res["version"] = arg
            elif cle == "component":
                res["composant"] = res["composant"] or arg
                etat["composants"] += 1
            elif cle == "model":
                nom = arg.split()[0] if arg else "modele%d" % (
                    len(res["modeles"]) + 1)
                modele = {"nom": nom, "type": "", "c_comp": None,
                          "vinl": None, "vinh": None, "tableaux": {},
                          "rampe": {}, "montant": [], "descendant": []}
                res["modeles"][nom] = modele
            elif cle in ("end", "end model", "end component"):
                section = None
            elif modele is not None and cle in REFERENCES:
                champs = arg.split()
                if champs:
                    modele[REFERENCES[cle]] = _trois(champs)
                section = None
            elif modele is not None and cle in TABLEAUX_VI:
                modele["tableaux"][cle] = []
            elif modele is not None and cle in ("rising waveform",
                                                "falling waveform"):
                onde = {"r_fixture": None, "v_fixture": None,
                        "v_fixture_min": None, "v_fixture_max": None,
                        "c_fixture": 0.0, "table": []}
                (modele["montant"] if cle.startswith("rising")
                 else modele["descendant"]).append(onde)
            elif modele is not None and cle == "ramp":
                pass
            elif cle not in ("file name", "file rev", "date", "source",
                             "notes", "disclaimer", "copyright",
                             "manufacturer", "model spec", "receiver "
                             "thresholds", "temperature range"):
                ignores.add("[%s]" % mot.strip())
            continue
        # -- le boitier et les broches, en lecture complete ------------------
        if complet and section in MOTS_COMPLETS:
            try:
                _ligne_complete(res, etat, section, ligne, modele)
            except ValueError:
                raise ErreurIbis("Ligne %d illisible dans [%s] : « %s »."
                                 % (n_ligne, section, brute.strip()),
                                 "Vérifiez le fichier : une valeur IBIS n'a "
                                 "que des chiffres, un suffixe et « NA ».")
            continue
        if modele is None:
            continue
        champs = ligne.replace("=", " = ").split()
        # -- les sous-parametres du [Model] ---------------------------------
        if section == "model":
            k = champs[0].lower()
            vals = [c for c in champs[1:] if c != "="]
            try:
                if k == "model_type" and vals:
                    modele["type"] = vals[0]
                elif k == "c_comp" and vals:
                    modele["c_comp"] = _trois(vals)
                elif k == "vinl" and vals:
                    modele["vinl"] = nombre(vals[0])
                elif k == "vinh" and vals:
                    modele["vinh"] = nombre(vals[0])
            except ValueError:
                raise ErreurIbis("Ligne %d illisible dans le [Model] %s : "
                                 "« %s »." % (n_ligne, modele["nom"],
                                              brute.strip()))
            continue
        try:
            if section in TABLEAUX_VI:
                if len(champs) >= 2:
                    v = nombre(champs[0])
                    i = _trois(champs[1:4])
                    if v is not None and i[0] is not None:
                        modele["tableaux"][section].append((v,) + i)
            elif section == "ramp":
                k = champs[0].lower()
                vals = [c for c in champs[1:] if c != "="]
                if k in ("dv/dt_r", "dv/dt_f"):
                    rr = [_rapport(c) for c in vals[:3]]
                    while len(rr) < 3:
                        rr.append(None)
                    rr = [x if x is not None else rr[0] for x in rr]
                    modele["rampe"][k[-1]] = rr
                elif k == "r_load" and vals:
                    modele["rampe"]["r_load"] = nombre(vals[0])
            elif section in ("rising waveform", "falling waveform") \
                    and onde is not None:
                k = champs[0].lower()
                if k in ("r_fixture", "v_fixture", "v_fixture_min",
                         "v_fixture_max", "c_fixture", "l_fixture",
                         "r_dut", "l_dut", "c_dut"):
                    vals = [c for c in champs[1:] if c != "="]
                    if vals:
                        onde[k] = nombre(vals[0])
                elif len(champs) >= 2:
                    t = nombre(champs[0])
                    v = _trois(champs[1:4])
                    if t is not None and v[0] is not None:
                        onde["table"].append((t,) + v)
        except ValueError:
            raise ErreurIbis("Ligne %d illisible dans le [Model] %s : « %s »."
                             % (n_ligne, modele["nom"], brute.strip()),
                             "Vérifiez le fichier : un tableau IBIS n'a que "
                             "des nombres, des suffixes et « NA ».")
    if not res["modeles"]:
        raise ErreurIbis("Aucun [Model] dans ce fichier IBIS.",
                         "Le fichier est-il bien un .ibs ?")
    for m in res["modeles"].values():
        for cle, tab in list(m["tableaux"].items()):
            tab.sort(key=lambda r: r[0])
    if complet:
        res["composants"] = etat["composants"]
        for mb in res["modeles_boitier"].values():
            _matrices(mb)
    res["ignores"] = sorted(ignores)
    return res


# ==========================================================================
# Le boitier et les broches
# --------------------------------------------------------------------------
# CE QUE LA NORME EN DIT, et ce qui est lu :
#   [Package]   R_pkg, L_pkg, C_pkg (typ/min/max) : le boitier MOYEN, celui
#               de toute broche qui n'en dit pas plus ;
#   [Pin]       nom, signal, modele, et R_pin, L_pin, C_pin facultatifs (une
#               seule colonne) : ils PRIMENT sur [Package], valeur par
#               valeur -- un « NA » renvoie a [Package] ;
#   [Package Model] nom -> [Define Package Model] : des matrices R, L, C
#               par broche (pleine, en bande ou creuse). Elles priment sur
#               les deux autres. On en prend la DIAGONALE ; les mutuelles
#               sont lues pour etre DITES (le plus fort couplage, et celui
#               entre les deux broches d'une paire), pas comptees. Une
#               description par sections (Len=, [Number Of Sections]) n'est
#               pas lue : on retombe alors sur [Pin] et [Package], et on le
#               dit ;
#   [Diff Pin]  broche, broche inverse, vdiff, tdelay typ/min/max ;
#   [Model Selector] : un nom de [Pin] qui designe plusieurs modeles, le
#               premier etant celui par defaut.
# LA TOPOLOGIE, celle des simulateurs IBIS : C_comp au die, puis R_pkg et
# L_pkg en serie, puis C_pkg a la broche, vers la masse. Les colonnes
# min/max de [Package] suivent le coin choisi pour le tampon.
# ==========================================================================

def _mot_complet(res, etat, cle, arg, modele):
    """Un mot-cle du boitier ou des broches : l'etat qu'il ouvre."""
    if cle == "model selector":
        etat["selecteur"] = arg.split()[0] if arg else ""
        res["selecteurs"].setdefault(etat["selecteur"], [])
    elif cle == "package model":
        if arg and not res["modele_boitier"] and etat["composants"] <= 1:
            res["modele_boitier"] = arg.split()[0]
    elif cle == "define package model":
        mb = {"nom": arg.split()[0] if arg else "", "broches": [],
              "sections": 0, "lignes": {}, "genres": {},
              "diag": {"r": {}, "l": {}, "c": {}},
              "mutuelles": {"r": {}, "l": {}, "c": {}}}
        etat["mb"], etat["matrice"], etat["rang"] = mb, None, None
        res["modeles_boitier"][mb["nom"]] = mb
    elif cle == "end package model":
        etat["mb"], etat["matrice"], etat["rang"] = None, None, None
    elif cle in MATRICES and etat["mb"] is not None:
        lettre = MATRICES[cle]
        etat["matrice"] = lettre
        etat["mb"]["genres"][lettre] = (arg.split() or ["full_matrix"])[
            0].lower()
        etat["rang"] = None
    elif cle == "row" and etat["mb"] is not None:
        etat["rang"] = _rang(etat["mb"], arg)
    elif cle == "number of sections" and etat["mb"] is not None:
        try:
            etat["mb"]["sections"] = int(nombre(arg) or 0)
        except ValueError:
            etat["mb"]["sections"] = 0
    elif cle == "pin":
        etat["colonnes"] = [c.lower() for c in arg.split()]
    elif cle == "algorithmic model" and modele is not None:
        modele.setdefault("ami", [])


def _rang(mb, arg):
    """L'indice (0..N-1) de la broche d'une [Row] : son nom dans
    [Pin Numbers], ou son rang compte depuis 1."""
    a = (arg.split() or [""])[0]
    if a in mb["broches"]:
        return mb["broches"].index(a)
    try:
        k = int(float(a)) - 1
    except ValueError:
        return None
    return k if 0 <= k < max(len(mb["broches"]), k + 1) else None


def _ligne_complete(res, etat, section, ligne, modele):
    """Une ligne de donnees du boitier ou des broches."""
    champs = ligne.replace("=", " = ").split()
    premier = etat["composants"] <= 1
    if section == "package" and premier:
        k = champs[0].lower()
        vals = [c for c in champs[1:] if c != "="]
        if k in BOITIER and vals:
            if res["boitier"] is None:
                res["boitier"] = {"r": None, "l": None, "c": None}
            res["boitier"][BOITIER[k]] = _trois(vals)
    elif section == "pin" and premier:
        bruts = ligne.split()
        if len(bruts) < 3:
            return
        b = {"nom": bruts[0], "signal": bruts[1], "modele": bruts[2],
             "r": None, "l": None, "c": None}
        # Les colonnes R/L/C_pin, a la place que leur donne l'en-tete.
        for j, col in enumerate(etat["colonnes"]):
            lettre = {"r_pin": "r", "l_pin": "l", "c_pin": "c"}.get(col)
            if lettre and j + 1 < len(bruts):
                b[lettre] = nombre(bruts[j + 1])
        if b["nom"] not in res["broches"]:
            res["ordre_broches"].append(b["nom"])
        res["broches"][b["nom"]] = b
    elif section == "diff pin" and premier:
        bruts = ligne.split()
        if len(bruts) < 2:
            return
        vdiff = nombre(bruts[2]) if len(bruts) > 2 else None
        td = _trois(bruts[3:6]) if len(bruts) > 3 else (None,) * 3
        res["paires_diff"].append({
            "broche": bruts[0], "inverse": bruts[1], "vdiff": vdiff,
            "tdelay": tuple(x if x is not None else 0.0 for x in td)})
    elif section == "model selector" and etat["selecteur"] is not None:
        res["selecteurs"][etat["selecteur"]].append(champs[0])
    elif section == "pin numbers" and etat["mb"] is not None:
        etat["mb"]["broches"].append(champs[0])
        if any("=" in c for c in ligne.split()) or "/" in ligne:
            # Une description par sections (Len=, L=, R=, C=) : non lue.
            etat["mb"]["sections"] = max(etat["mb"]["sections"], 1)
    elif section == "row" and etat["mb"] is not None \
            and etat["matrice"] and etat["rang"] is not None:
        cle = (etat["matrice"], etat["rang"])
        etat["mb"]["lignes"].setdefault(cle, []).extend(ligne.split())
    elif section == "algorithmic model" and modele is not None:
        bruts = ligne.split()
        if bruts and bruts[0].lower().startswith("executable") and \
                len(bruts) >= 4:
            modele.setdefault("ami", []).append(
                {"plateforme": bruts[1], "bibliotheque": bruts[2],
                 "fichier_ami": bruts[3]})


def _matrices(mb):
    """Les matrices d'un modele de boitier -> diagonale et mutuelles."""
    n = len(mb["broches"])
    for (lettre, i), vals in mb.pop("lignes").items():
        genre = mb["genres"].get(lettre, "full_matrix")
        if not 0 <= i < n:
            continue
        ligne = []
        if genre.startswith("sparse"):
            for j in range(0, len(vals) - 1, 2):
                col = _rang(mb, vals[j])
                if col is not None:
                    ligne.append((col, nombre(vals[j + 1])))
        else:
            # Pleine ou en bande : la ligne i part de la diagonale.
            for k, v in enumerate(vals):
                ligne.append((i + k, nombre(v)))
        for col, v in ligne:
            if v is None or not 0 <= col < n:
                continue
            if col == i:
                mb["diag"][lettre][mb["broches"][i]] = v
            elif v:
                mb["mutuelles"][lettre][(mb["broches"][i],
                                         mb["broches"][col])] = v


def couplage_boitier(mb, a, b=None):
    """Le coefficient de couplage |Mij| / sqrt(Mii Mjj) le plus fort de la
    broche `a` (avec `b` seule si elle est donnee), en L et en C."""
    sortie = {}
    for lettre in ("l", "c"):
        d = mb["diag"][lettre]
        k_max = 0.0
        for (i, j), v in mb["mutuelles"][lettre].items():
            if a not in (i, j) or (b is not None and b not in (i, j)):
                continue
            if d.get(i) and d.get(j):
                k_max = max(k_max, abs(v) / math.sqrt(abs(d[i] * d[j])))
        sortie[lettre] = k_max
    return sortie


def modele_broche(lu, broche, voulu=""):
    """(nom du [Model], note) de la broche `broche` d'un fichier lu en
    entier. Un [Model Selector] rend `voulu` s'il en fait partie, son
    premier modele sinon. Leve ErreurIbis pour une broche inconnue ou
    passive (POWER, GND, NC)."""
    b = (lu.get("broches") or {}).get(broche)
    if b is None:
        raise ErreurIbis("Pas de broche « %s » dans [Pin]." % broche,
                         "Choisissez une broche de la liste.")
    nom = b["modele"]
    if nom.upper() in BROCHES_PASSIVES:
        raise ErreurIbis("La broche %s est %s : elle n'a pas de tampon."
                         % (broche, nom),
                         "Choisissez une broche de signal.")
    sel = (lu.get("selecteurs") or {}).get(nom)
    if sel:
        if voulu in sel:
            return voulu, "%s parmi le sélecteur %s" % (voulu, nom)
        return sel[0], "%s, premier du sélecteur %s" % (sel[0], nom)
    if nom not in lu["modeles"]:
        raise ErreurIbis("La broche %s renvoie au [Model] « %s », absent du "
                         "fichier." % (broche, nom),
                         "Le fichier est-il complet ?")
    return nom, ""


def paire_diff(lu, broche):
    """L'entree de [Diff Pin] de `broche` : {broche, inverse, vdiff, tdelay,
    note}, ou None. Une broche donnee par son INVERSE rend la paire
    retournee, tdelay de signe oppose."""
    for p in lu.get("paires_diff") or []:
        if p["broche"] == broche:
            return dict(p, note="")
        if p["inverse"] == broche:
            return dict(p, broche=p["inverse"], inverse=p["broche"],
                        tdelay=tuple(-x for x in p["tdelay"]),
                        note="paire prise par sa broche inverse")
    return None


def boitier_broche(lu, broche="", coin="typ"):
    """Le boitier d'une broche : {r, l, c (SI), source, notes}.

    Priorite, valeur par valeur : [Define Package Model] (diagonale), puis
    [Pin], puis [Package] a la colonne du coin. Sans rien de tout cela,
    r = l = c = 0."""
    col = COINS.get(coin, 0)
    notes = []
    val = {"r": 0.0, "l": 0.0, "c": 0.0}
    src = {"r": "", "l": "", "c": ""}
    pk = lu.get("boitier") or {}
    for k in val:
        if pk.get(k) is not None and pk[k][col] is not None:
            val[k], src[k] = float(pk[k][col]), "[Package]"
    b = (lu.get("broches") or {}).get(broche) if broche else None
    if b is not None:
        for k in val:
            if b.get(k) is not None:
                val[k], src[k] = float(b[k]), "[Pin]"
    nom_mb = lu.get("modele_boitier") or ""
    if nom_mb and broche:
        mb = (lu.get("modeles_boitier") or {}).get(nom_mb)
        if mb is None:
            notes.append("[Package Model] %s défini hors du fichier (.pkg) : "
                         "non lu." % nom_mb)
        elif mb["sections"]:
            notes.append("[Package Model] %s décrit par sections : non lu, "
                         "[Pin] et [Package] le remplacent." % nom_mb)
        elif broche in mb["broches"]:
            for k in val:
                if mb["diag"][k].get(broche) is not None:
                    val[k] = float(mb["diag"][k][broche])
                    src[k] = "[Package Model] " + nom_mb
            kc = couplage_boitier(mb, broche)
            if kc["l"] > 0 or kc["c"] > 0:
                notes.append("Mutuelles du [Package Model] ignorées (couplage "
                             "le plus fort de %s : k_L %.2f, k_C %.2f)."
                             % (broche, kc["l"], kc["c"]))
    sources = sorted(set(s for s in src.values() if s))
    return {"r": val["r"], "l": val["l"], "c": val["c"],
            "source": " + ".join(sources) if sources else "aucun",
            "notes": notes}


def boitier_nul(bt):
    return bt is None or not (bt["r"] or bt["l"] or bt["c"])


def abcd_boitier(freqs, bt, sens):
    """La matrice ABCD (N, 2, 2) d'un boitier, ou None s'il est nul.

    `sens` « emission » : du die vers la broche -- R et L en serie, puis
    C_pkg ; « reception » : de la broche vers le die -- C_pkg, puis R et L."""
    if boitier_nul(bt):
        return None
    w = 2 * math.pi * np.asarray(freqs, dtype=float)
    z = bt["r"] + 1j * w * bt["l"]
    y = 1j * w * bt["c"]
    m = np.zeros((len(w), 2, 2), dtype=complex)
    if sens == "emission":
        # [1 Z ; 0 1] @ [1 0 ; Y 1]
        m[:, 0, 0] = 1.0 + z * y
        m[:, 0, 1] = z
        m[:, 1, 0] = y
        m[:, 1, 1] = 1.0
    else:
        # [1 0 ; Y 1] @ [1 Z ; 0 1]
        m[:, 0, 0] = 1.0
        m[:, 0, 1] = z
        m[:, 1, 0] = y
        m[:, 1, 1] = 1.0 + y * z
    return m


# ==========================================================================
# IBIS-AMI : le fichier .ami
# --------------------------------------------------------------------------
# LE MODELE AMI N'EST PAS EXECUTE ICI. Un [Algorithmic Model] renvoie a une
# bibliotheque binaire du fabricant (.dll, .so) -- son egaliseur, sa
# recuperation d'horloge, ses algorithmes d'adaptation -- et a un fichier
# .ami, texte, qui en decrit les PARAMETRES : ceux que la norme reserve
# (AMI_Version, Init_Returns_Impulse, Tx_Rj, Rx_Noise...) et ceux propres
# au modele (Model_Specific : prises de FFE, de DFE, gains de CTLE...).
# Executer du code natif venu d'un fichier televerse n'est pas une option.
# On LIT donc le .ami -- syntaxe en arbre, a parentheses --, on le montre,
# et l'on en tire, quand ils sont lisibles, de quoi REGLER L'EGALISEUR DE
# REFERENCE de l'oeil (FFE, DFE, CTLE) et sa gigue : c'est une proposition
# fondee sur des noms de parametres usuels, pas le comportement du modele.
# ==========================================================================

MAX_AMI = 2 * 1024 * 1024
MAX_PARAMS_AMI = 400
_CLES_PARAM = ("usage", "type", "format", "value", "default", "range",
               "list", "description", "increment", "steps", "corner",
               "table", "list_tip", "labels")


def _jetons_ami(texte):
    """Les jetons d'un .ami : « ( », « ) », et des atomes (une chaine entre
    guillemets est un seul atome)."""
    i, n = 0, len(texte)
    while i < n:
        c = texte[i]
        if c in "()":
            yield c
            i += 1
        elif c.isspace():
            i += 1
        elif c == '"':
            j = texte.find('"', i + 1)
            if j < 0:
                raise ErreurIbis("Chaîne entre guillemets non fermée dans le "
                                 "fichier AMI.")
            yield ("chaine", texte[i + 1:j])
            i = j + 1
        elif c == "|":
            # L'usage des fichiers du commerce : « | » commente la ligne.
            j = texte.find("\n", i)
            i = n if j < 0 else j
        else:
            j = i
            while j < n and not texte[j].isspace() and texte[j] not in '()"':
                j += 1
            yield texte[i:j]
            i = j


class _Chaine(str):
    """Un atome AMI ecrit entre guillemets : du texte, meme s'il a l'air
    d'un nombre (« "7.0" »)."""


def _noeud(liste):
    tete = liste[0] if liste else ""
    nom = str(tete[1]) if isinstance(tete, tuple) else (
        tete if isinstance(tete, str) else "")
    n = {"nom": nom, "valeurs": [], "enfants": []}
    for x in liste[1:]:
        if isinstance(x, list):
            n["enfants"].append(_noeud(x))
        else:
            n["valeurs"].append(_Chaine(x[1]) if isinstance(x, tuple)
                                else x)
    return n


def _num(x):
    if isinstance(x, _Chaine):
        return None
    try:
        return nombre(x)
    except (ValueError, TypeError):
        return None


def _param_ami(n):
    """Un parametre AMI (un noeud qui a Usage ou Type), ou None."""
    enf = {}
    for e in n["enfants"]:
        enf.setdefault(e["nom"].lower(), e)
    if "usage" not in enf and "type" not in enf:
        return None
    p = {"nom": n["nom"],
         "usage": (enf.get("usage", {}).get("valeurs") or [""])[0],
         "type": " ".join(enf.get("type", {}).get("valeurs") or []),
         "description": " ".join(enf.get("description", {}).get("valeurs")
                                 or []),
         "forme": "", "valeur": None, "plage": None, "liste": None}
    vals = []
    if "format" in enf and enf["format"]["valeurs"]:
        p["forme"] = enf["format"]["valeurs"][0].lower()
        vals = enf["format"]["valeurs"][1:]
    else:
        for f in ("range", "list", "increment", "steps", "corner", "value",
                  "table"):
            if f in enf:
                p["forme"] = f
                vals = enf[f]["valeurs"]
                break
    nums = [_num(v) for v in vals]
    if p["forme"] in ("range", "increment", "steps", "corner") and \
            len(nums) >= 3:
        p["valeur"] = nums[0] if nums[0] is not None else vals[0]
        if nums[1] is not None and nums[2] is not None:
            p["plage"] = (min(nums[1], nums[2]), max(nums[1], nums[2]))
        if p["forme"] == "increment" and len(nums) >= 4:
            p["pas"] = nums[3]
    elif p["forme"] == "list" and vals:
        p["liste"] = [x if y is None else y for x, y in zip(vals, nums)]
        p["valeur"] = p["liste"][0]
        lnum = [y for y in nums if y is not None]
        if lnum:
            p["plage"] = (min(lnum), max(lnum))
    elif vals:
        p["valeur"] = nums[0] if nums[0] is not None else vals[0]
    for f in ("value", "default"):
        if f in enf and enf[f]["valeurs"]:
            v = enf[f]["valeurs"][0]
            p["valeur"] = _num(v) if _num(v) is not None else v
    return p


def lire_ami(texte, nom_fichier=""):
    """Le texte d'un fichier .ami -> {modele, description, reserves,
    specifiques, parametres, fichier}.

    `parametres` : la liste a plat, chacun avec son CHEMIN dans l'arbre
    (« Model_Specific/TX_FFE/Tap/-1 »), son Usage, son Type, sa valeur
    (Value, Default ou typ), sa plage et sa liste. Leve ErreurIbis si le
    texte n'est pas un arbre AMI."""
    if not isinstance(texte, str) or not texte.strip():
        raise ErreurIbis("Fichier AMI vide.")
    if len(texte) > MAX_AMI:
        raise ErreurIbis("Fichier AMI de %.1f Mo : trop gros pour un .ami."
                         % (len(texte) / 1e6))
    pile, racines = [], []
    for j in _jetons_ami(texte):
        if j == "(":
            pile.append([])
        elif j == ")":
            if not pile:
                raise ErreurIbis("Parenthèse fermante en trop dans le "
                                 "fichier AMI.")
            fini = pile.pop()
            (pile[-1] if pile else racines).append(fini)
        elif pile:
            pile[-1].append(j)
    if pile or not racines:
        raise ErreurIbis("Fichier AMI incomplet : parenthèses non "
                         "équilibrées." if pile else
                         "Aucun arbre « (modèle ...) » dans le fichier AMI.",
                         "Un .ami s'écrit (Nom (Reserved_Parameters ...) "
                         "(Model_Specific ...)).")
    racine = _noeud(racines[0])
    res = {"fichier": nom_fichier, "modele": racine["nom"],
           "description": "", "parametres": [], "tronque": False}
    for e in racine["enfants"]:
        if e["nom"].lower() == "description":
            res["description"] = " ".join(e["valeurs"])

    def parcourir(n, chemin):
        p = _param_ami(n)
        if p is not None:
            if len(res["parametres"]) >= MAX_PARAMS_AMI:
                res["tronque"] = True
                return
            p["chemin"] = "/".join(chemin)
            p["groupe"] = ("reserve" if chemin and chemin[0].lower()
                           .startswith("reserved") else "specifique")
            res["parametres"].append(p)
            return
        for e in n["enfants"]:
            if e["nom"].lower() in _CLES_PARAM:
                continue
            parcourir(e, chemin + [e["nom"]])
    for e in racine["enfants"]:
        if e["nom"].lower() != "description":
            parcourir(e, [e["nom"]])
    res["reserves"] = {p["nom"]: p for p in res["parametres"]
                       if p["groupe"] == "reserve"}
    return res


def _valeur(p):
    v = p.get("valeur") if p else None
    return v if isinstance(v, (int, float)) else None


def _indice_prise(nom):
    """Le rang d'une prise de FFE d'apres son nom : « -1 », « pre1 »,
    « post2 », « main », « c_m1 », « c1 »... ou None."""
    n = nom.lower()
    m = re.match(r"^[+-]?\d+$", n)
    if m:
        return int(n)
    m = re.match(r"^(?:tap_?)?pre(?:_?cursor)?_?(\d*)$", n)
    if m:
        return -int(m.group(1) or 1)
    m = re.match(r"^(?:tap_?)?post(?:_?cursor)?_?(\d*)$", n)
    if m:
        return int(m.group(1) or 1)
    if n in ("main", "main_cursor", "tap_main", "cursor", "c0", "tap0"):
        return 0
    m = re.match(r"^c_?(m|n|-)_?(\d+)$", n)
    if m:
        return -int(m.group(2))
    m = re.match(r"^c_?p?(\d+)$", n)
    if m:
        return int(m.group(1))
    return None


def proposer_egaliseur(ami_tx=None, ami_rx=None, debit=1e9):
    """Ce que les .ami permettent de proposer pour l'egaliseur de reference
    et la gigue de l'oeil : {ffe, ffe_principal, dfe_prises, dfe_max, ctle,
    rj, dj, bruit_v, sensibilite, notes}. Une cle absente : rien de lisible.

    HEURISTIQUE, ET DITE : on reconnait des noms usuels (Tap, FFE, DFE,
    CTLE, dB) et les parametres reserves de gigue et de bruit. Chaque
    proposition dit le parametre d'ou elle vient."""
    prop = {"notes": []}
    tx = (ami_tx or {}).get("parametres") or []
    rx = (ami_rx or {}).get("parametres") or []

    # -- la FFE de l'emetteur --------------------------------------------
    prises = {}
    for p in tx:
        ch = p["chemin"].lower()
        if p["groupe"] != "specifique" or "dfe" in ch:
            continue
        if not any(k in ch for k in ("tap", "ffe", "emph", "cursor")):
            continue
        k = _indice_prise(p["nom"])
        v = _valeur(p)
        if k is not None and v is not None and k not in prises:
            prises[k] = (v, p["chemin"])
    if prises and 0 in prises and len(prises) >= 2:
        rangs = sorted(prises)
        coefs = [prises[k][0] for k in rangs]
        if max(abs(c) for c in coefs) > 1.5:
            prop["notes"].append(
                "FFE : les prises (%s…) valent jusqu'à %g — des codes de "
                "réglage, pas des coefficients : non proposée."
                % (prises[rangs[0]][1], max(abs(c) for c in coefs)))
        else:
            somme = sum(abs(c) for c in coefs) or 1.0
            prop["ffe"] = [round(c / somme, 4) for c in coefs]
            prop["ffe_principal"] = rangs.index(0)
            prop["notes"].append(
                "FFE : %d prises (rangs %d à %d) tirées des valeurs par "
                "défaut de %s…, ramenées à Σ|c| = 1."
                % (len(rangs), rangs[0], rangs[-1],
                   "/".join(prises[0][1].split("/")[:-1])))

    # -- le DFE du recepteur ---------------------------------------------
    n_dfe, dfe_max, src = None, None, ""
    rangs_dfe = []
    for p in rx:
        ch = p["chemin"].lower()
        if p["groupe"] != "specifique" or "dfe" not in ch:
            continue
        nom = p["nom"].lower()
        v = _valeur(p)
        if re.match(r"^(n|num|nb|number|nombre)?_?(of_)?taps?(_count)?$|"
                    r"^tap_?count$|^dfe_?taps$", nom) and v is not None \
                and float(v).is_integer() and v >= 1 and "dfe" in ch:
            n_dfe, src = int(v), p["chemin"]
            if p.get("plage"):
                n_dfe = int(p["plage"][1])
            continue
        m = re.match(r"^(?:dfe_?)?(?:tap|h)_?(\d+)$", nom) or \
            re.match(r"^(\d+)$", nom)
        if m and int(m.group(1)) >= 1:
            rangs_dfe.append(int(m.group(1)))
            borne = max(abs(x) for x in p["plage"]) if p.get("plage") \
                else (abs(v) if v is not None else None)
            if borne is not None:
                dfe_max = max(dfe_max or 0.0, borne)
            src = src or p["chemin"]
    if n_dfe is None and rangs_dfe:
        n_dfe = max(rangs_dfe)
    if n_dfe:
        prop["dfe_prises"] = min(n_dfe, 8)
        if dfe_max:
            prop["dfe_max"] = dfe_max
        prop["notes"].append(
            "DFE : %d prise(s)%s d'après %s%s." % (
                n_dfe, (" (limitées à 8)" if n_dfe > 8 else ""), src,
                (", amplitude bornée à %g (lue telle quelle, en volts si le "
                 "modèle les exprime ainsi)" % dfe_max) if dfe_max else ""))

    # -- le CTLE du recepteur --------------------------------------------
    for p in rx:
        ch = p["chemin"].lower()
        if p["groupe"] != "specifique" or "ctle" not in ch:
            continue
        nom = p["nom"].lower()
        texte_db = ("db" in nom) or ("db" in (p.get("description") or "")
                                     .lower())
        if not texte_db or not any(k in nom for k in
                                   ("gain", "boost", "peak", "db")):
            continue
        if p.get("liste"):
            vals = [x for x in p["liste"] if isinstance(x, (int, float))]
        elif p.get("plage"):
            a, b = p["plage"]
            pas = p.get("pas") or max(1.0, (b - a) / 12.0)
            vals = list(np.arange(a, b + 0.5 * pas, pas))
        elif _valeur(p) is not None:
            vals = [_valeur(p)]
        else:
            continue
        if not vals:
            continue
        continu = "dc" in nom
        adc = sorted(set(round(float(v) if continu else -abs(float(v)), 2)
                         for v in vals))[:16]
        prop["ctle"] = {"forme": "pcie3", "fp1": debit / 4.0,
                        "fp2": float(debit), "adc_db": adc}
        prop["notes"].append(
            "CTLE : gains continus %s dB essayés, d'après %s ; pôles SUPPOSÉS "
            "(fp1 = débit/4, fp2 = débit) — le .ami ne les donne pas."
            % (", ".join("%g" % x for x in adc), p["chemin"]))
        break

    # -- la gigue et le bruit : les parametres reserves ------------------
    def res_(ami, nom):
        p = ((ami or {}).get("reserves") or {}).get(nom)
        return _valeur(p)
    rj = [res_(ami_tx, "Tx_Rj"), res_(ami_rx, "Rx_Rj")]
    dj = [res_(ami_tx, "Tx_Dj"), res_(ami_tx, "Tx_DCD"),
          res_(ami_rx, "Rx_Dj"), res_(ami_rx, "Rx_DCD")]
    if any(x for x in rj if x):
        prop["rj"] = math.sqrt(sum(x * x for x in rj if x))
        prop["notes"].append("RJ %.3g ps rms : Tx_Rj et Rx_Rj en quadrature."
                             % (prop["rj"] * 1e12))
    if any(x for x in dj if x):
        prop["dj"] = sum(abs(x) for x in dj if x)
        prop["notes"].append("DJ %.3g ps c-c : somme de Tx_Dj, Tx_DCD, Rx_Dj "
                             "et Rx_DCD présents." % (prop["dj"] * 1e12))
    bruit = res_(ami_rx, "Rx_Noise")
    if bruit:
        prop["bruit_v"] = abs(bruit)
    sens = res_(ami_rx, "Rx_Receiver_Sensitivity")
    if sens:
        prop["sensibilite"] = abs(sens)
    return prop


def resume(lu):
    """Ce que la page affiche d'un fichier lu : les modeles et leur type."""
    return {"version": lu["version"], "composant": lu["composant"],
            "modeles": [{"nom": m["nom"], "type": m["type"],
                         "emetteur": est_emetteur(m),
                         "formes_d_onde": len(m["montant"]) +
                         len(m["descendant"])}
                        for m in lu["modeles"].values()],
            "ignores": lu["ignores"]}


def est_emetteur(m):
    t = (m.get("type") or "").lower()
    return not t.startswith("input") and ("pullup" in m["tableaux"] or
                                          "pulldown" in m["tableaux"])


# ==========================================================================
# Le tampon, a un coin donne
# ==========================================================================

class Courbe(object):
    """Une courbe V-I lineaire par morceaux, prolongee par ses pentes
    extremes. Rapide sur des scalaires : c'est elle que le pas de temps
    interroge des dizaines de milliers de fois."""

    def __init__(self, vs, is_):
        paires = sorted(zip(vs, is_))
        self.v = [float(a) for a, _ in paires]
        self.i = [float(b) for _, b in paires]

    def __call__(self, x):
        v, i = self.v, self.i
        n = len(v)
        if n == 0:
            return 0.0, 0.0
        if n == 1:
            return i[0], 0.0
        k = bisect.bisect_right(v, x) - 1
        k = min(max(k, 0), n - 2)
        dv = v[k + 1] - v[k]
        g = (i[k + 1] - i[k]) / dv if dv else 0.0
        return i[k] + g * (x - v[k]), g


def _courbe(m, cle, col):
    tab = m["tableaux"].get(cle) or []
    if not tab:
        return None
    return Courbe([r[0] for r in tab], [r[1 + col] for r in tab])


def _ref(m, cle, col, defaut):
    t = m.get(cle)
    return float(t[col]) if t else defaut


class Tampon(object):
    """Les courbes d'un [Model] a un coin (typ, min ou max), et le courant
    qu'il prend a la broche pour des commandes (Ku, Kd) donnees."""

    def __init__(self, m, coin="typ"):
        if coin not in COINS:
            raise ErreurIbis("Coin « %s » inconnu." % coin,
                             "Choisissez typ, min ou max.")
        col = COINS[coin]
        self.nom, self.type, self.coin = m["nom"], m["type"], coin
        vr = _ref(m, "voltage_range", col, 0.0)
        self.v_pu = _ref(m, "pullup_ref", col, vr)
        self.v_pd = _ref(m, "pulldown_ref", col, 0.0)
        self.v_pc = _ref(m, "power_clamp_ref", col, vr)
        self.v_gc = _ref(m, "gnd_clamp_ref", col, 0.0)
        self.c_comp = float(m["c_comp"][col]) if m.get("c_comp") else 0.0
        self.pu = _courbe(m, "pullup", col)
        self.pd = _courbe(m, "pulldown", col)
        self.pc = _courbe(m, "power clamp", col)
        self.gc = _courbe(m, "gnd clamp", col)
        # Les terminaisons d'entree IBIS 3 : une resistance vers la masse,
        # une vers l'alimentation.
        self.g_gnd = 1.0 / float(m["rgnd"][col]) if m.get("rgnd") and \
            m["rgnd"][col] else 0.0
        self.g_pow = 1.0 / float(m["rpower"][col]) if m.get("rpower") and \
            m["rpower"][col] else 0.0
        self.vinl, self.vinh = m.get("vinl"), m.get("vinh")

    def a_des_diodes(self):
        return self.pc is not None or self.gc is not None

    def i_statique(self, v):
        """(courant entrant, conductance) des diodes et des terminaisons."""
        i = g = 0.0
        if self.pc is not None:
            a, b = self.pc(self.v_pc - v)
            i, g = i + a, g - b
        if self.gc is not None:
            a, b = self.gc(v - self.v_gc)
            i, g = i + a, g + b
        if self.g_gnd:
            i, g = i + self.g_gnd * v, g + self.g_gnd
        if self.g_pow:
            i, g = i + self.g_pow * (v - self.v_pu), g + self.g_pow
        return i, g

    def i_commande(self, v, ku, kd):
        """(courant entrant, conductance) de l'etage de sortie seul."""
        i = g = 0.0
        if self.pu is not None and ku:
            a, b = self.pu(self.v_pu - v)
            i, g = i + ku * a, g - ku * b
        if self.pd is not None and kd:
            a, b = self.pd(v - self.v_pd)
            i, g = i + kd * a, g + kd * b
        return i, g

    def i_total(self, v, ku, kd):
        a, ga = self.i_commande(v, ku, kd)
        b, gb = self.i_statique(v)
        return a + b, ga + gb

    def niveau(self, ku, kd, r_charge=None, v_charge=0.0):
        """La tension de broche en regime etabli, a vide ou sous une charge
        R vers v_charge, par dichotomie (le courant est monotone en V)."""
        def f(v):
            i, _ = self.i_total(v, ku, kd)
            if r_charge:
                i += (v - v_charge) / r_charge
            return i
        lo, hi = min(self.v_pd, self.v_gc) - 5.0, max(self.v_pu, self.v_pc) + 5.0
        flo, fhi = f(lo), f(hi)
        if flo * fhi > 0:
            return 0.5 * (lo + hi)
        for _ in range(100):
            mi = 0.5 * (lo + hi)
            fm = f(mi)
            if (fm > 0) == (fhi > 0):
                hi, fhi = mi, fm
            else:
                lo, flo = mi, fm
        return 0.5 * (lo + hi)


# ==========================================================================
# Les commandes Ku(t), Kd(t)
# ==========================================================================

def _echantillonner(table, col, dt, duree=None):
    """Une forme d'onde (t, v...) sur une grille reguliere de pas dt."""
    t = [r[0] for r in table]
    v = [r[1 + col] for r in table]
    t0 = t[0]
    fin = t[-1] if duree is None else t0 + duree
    n = max(2, int(math.ceil((fin - t0) / dt)) + 1)
    tt = t0 + dt * np.arange(n)
    return tt - t0, np.interp(tt, t, v)


def _commande_une_onde(tampon, onde, col, dt, montant):
    """Ku(t) d'une seule forme d'onde, Kd = 1 - Ku. Voir l'en-tete."""
    t, v = _echantillonner(onde["table"], col, dt)
    r_f = onde.get("r_fixture") or 50.0
    v_f = onde.get("v_fixture")
    v_f = {1: onde.get("v_fixture_min"), 2: onde.get("v_fixture_max")}.get(
        col) or v_f or 0.0
    c_tot = tampon.c_comp + (onde.get("c_fixture") or 0.0)
    dvdt = np.gradient(v, dt)
    ku = np.empty(len(v))
    for k in range(len(v)):
        i_u, _ = tampon.i_commande(v[k], 1.0, 0.0)
        i_d, _ = tampon.i_commande(v[k], 0.0, 1.0)
        i_s, _ = tampon.i_statique(v[k])
        reste = i_s + c_tot * dvdt[k] + (v[k] - v_f) / r_f
        den = i_u - i_d
        ku[k] = -(i_d + reste) / den if abs(den) > 1e-15 else \
            (1.0 if montant else 0.0) if k else (0.0 if montant else 1.0)
    ku = np.clip(ku, -0.25, 1.25)
    return ku, 1.0 - ku


def _commande_deux_ondes(tampon, a, b, col, dt):
    """(Ku, Kd) de deux formes d'onde sous deux charges : deux equations."""
    duree = min(a["table"][-1][0] - a["table"][0][0],
                b["table"][-1][0] - b["table"][0][0])
    _, va = _echantillonner(a["table"], col, dt, duree)
    _, vb = _echantillonner(b["table"], col, dt, duree)
    n = min(len(va), len(vb))
    va, vb = va[:n], vb[:n]
    ku, kd = np.empty(n), np.empty(n)
    lignes = []
    for onde, v in ((a, va), (b, vb)):
        r_f = onde.get("r_fixture") or 50.0
        v_f = {1: onde.get("v_fixture_min"),
               2: onde.get("v_fixture_max")}.get(col) or \
            onde.get("v_fixture") or 0.0
        c_tot = tampon.c_comp + (onde.get("c_fixture") or 0.0)
        lignes.append((v, np.gradient(v, dt), r_f, v_f, c_tot))
    for k in range(n):
        m = np.zeros((2, 2))
        y = np.zeros(2)
        for r, (v, dv, r_f, v_f, c_tot) in enumerate(lignes):
            m[r, 0], _ = tampon.i_commande(v[k], 1.0, 0.0)
            m[r, 1], _ = tampon.i_commande(v[k], 0.0, 1.0)
            i_s, _ = tampon.i_statique(v[k])
            y[r] = -(i_s + c_tot * dv[k] + (v[k] - v_f) / r_f)
        try:
            ku[k], kd[k] = np.linalg.solve(m, y)
        except np.linalg.LinAlgError:
            return None
    if not np.all(np.isfinite(ku)) or not np.all(np.isfinite(kd)):
        return None
    return np.clip(ku, -0.25, 1.25), np.clip(kd, -0.25, 1.25)


def _commande_rampe(m, col, dt, montant):
    """Ku lineaire sur la duree du front tiree de [Ramp]."""
    r = (m.get("rampe") or {}).get("r" if montant else "f")
    if not r or not r[col]:
        return None
    dv, dt_2080 = r[col]
    duree = max(abs(dt_2080) / 0.6, dt)
    n = int(math.ceil(duree / dt)) + 1
    ku = np.clip(np.arange(n) * dt / duree, 0.0, 1.0)
    if not montant:
        ku = 1.0 - ku
    return ku, 1.0 - ku


def commandes(m, tampon, dt):
    """{"montant": (Ku, Kd), "descendant": (Ku, Kd), "source": texte}.

    Les deux tableaux sont echantillonnes au pas dt, depuis le debut du
    front. Leve ErreurIbis si le modele ne permet pas de les construire."""
    col = COINS[tampon.coin]
    sortie = {}
    sources = []
    for sens, liste, montant in (("montant", m["montant"], True),
                                 ("descendant", m["descendant"], False)):
        liste = [o for o in liste if len(o["table"]) >= 2]
        k = None
        if len(liste) >= 2:
            k = _commande_deux_ondes(tampon, liste[0], liste[1], col, dt)
            if k is not None:
                sources.append("%s : deux formes d'onde" % sens)
        if k is None and liste:
            k = _commande_une_onde(tampon, liste[0], col, dt, montant)
            sources.append("%s : une forme d'onde (Kd = 1 − Ku)" % sens)
        if k is None:
            k = _commande_rampe(m, col, dt, montant)
            if k is not None:
                sources.append("%s : [Ramp] seule, Ku linéaire" % sens)
        if k is None:
            raise ErreurIbis("Le modèle %s n'a ni forme d'onde ni [Ramp] "
                             "pour le front %s." % (m["nom"], sens),
                             "Un émetteur IBIS doit décrire ses fronts.")
        sortie[sens] = k
    sortie["source"] = " ; ".join(sources)
    return sortie


def tampon_lineaire(r_source, v_haut, v_bas, tr, dt, c_comp=0.0):
    """Un emetteur de Thevenin ecrit comme un tampon IBIS : Ku est le front
    gaussien de `oeil.py`, Kd = 1 - Ku, les courbes sont des droites.

    C'est l'etalon des bancs (un tampon lineaire doit rendre l'oeil
    lineaire), et l'emetteur qu'on prend quand seul le RECEPTEUR est IBIS :
    ses diodes rendent le calcul non lineaire, et l'emetteur doit alors
    passer par le meme pas de temps."""
    m = {"nom": "thevenin", "type": "Output", "c_comp": (c_comp,) * 3,
         "tableaux": {}, "montant": [], "descendant": [], "rampe": {},
         "pullup_ref": (v_haut,) * 3, "pulldown_ref": (v_bas,) * 3,
         "voltage_range": (v_haut,) * 3}
    vs = [-100.0, 100.0]
    m["tableaux"]["pullup"] = [(x, -x / r_source, -x / r_source,
                                -x / r_source) for x in vs]
    m["tableaux"]["pulldown"] = [(x, x / r_source, x / r_source,
                                  x / r_source) for x in vs]
    t = Tampon(m, "typ")
    sigma = tr / 2.5631
    n = int(math.ceil(8.0 * sigma / dt)) + 1
    tt = np.arange(n) * dt
    ku = np.array([0.5 * math.erfc(-(x - 4.0 * sigma) / (sigma * math.sqrt(2)))
                   for x in tt])
    return t, {"montant": (ku, 1.0 - ku), "descendant": (1.0 - ku, ku),
               "source": "émetteur de Thévenin (front gaussien)"}


def duree_front(k, dt):
    """Le temps de montee 10-90 % de Ku sur un front montant, en s."""
    ku = np.asarray(k[0], dtype=float)
    a, b = float(ku[0]), float(ku[-1])
    if abs(b - a) < 1e-9:
        return dt
    x = (ku - a) / (b - a)
    i10 = int(np.argmax(x >= 0.1))
    i90 = int(np.argmax(x >= 0.9))
    return max(dt, (i90 - i10) * dt)


def instant_mi_front(k, dt):
    ku = np.asarray(k[0], dtype=float)
    a, b = float(ku[0]), float(ku[-1])
    if abs(b - a) < 1e-9:
        return 0.0
    return float(np.argmax((ku - a) / (b - a) >= 0.5)) * dt


# ==========================================================================
# La liaison dans le temps : tampon -- canal -- recepteur
# --------------------------------------------------------------------------
# LE CANAL EST LINEAIRE, LES DEUX BOUTS NE LE SONT PAS. On ecrit le canal en
# ondes de puissance sur une resistance de reference R0 : a1, a2 entrent,
# b1, b2 sortent, et
#     b = s * a       (produit de convolution, terme a terme)
# avec s(t) la reponse impulsionnelle des parametres S du canal -- la
# cascade ABCD de `simulation_em`, charge lineaire du recepteur comprise.
# A chaque pas, l'histoire (tout sauf l'echantillon courant) est connue :
#     b1 = s11[0] a1 + s12[0] a2 + h1      b2 = s21[0] a1 + s22[0] a2 + h2
# et il reste DEUX equations a deux inconnues (a1, a2), celles des bouts :
#     (a1 - b1)/R0 = - I_tampon(V1, t)     V1 = a1 + b1
#     (a2 - b2)/R0 = - I_diodes(V2)        V2 = a2 + b2
# qu'un Newton resout en deux ou trois iterations. C'est la methode des
# simulateurs de liaison qui melangent IBIS et parametres S, et elle est
# exacte au pas de temps pres -- la capacite C_comp est integree en Euler
# implicite.
#
# LE PASSAGE EN TEMPOREL DEMANDE UNE BANDE BORNEE. Un parametre S ne
# s'eteint pas en frequence (un echo garde son amplitude), et l'IFFT d'une
# grille coupee net sonnerait. On le multiplie donc par une fenetre
# gaussienne, nulle (5e-4) au haut de la grille, qui revient a lisser chaque
# trajet par un front gaussien -- mais PAS la reflexion instantanee de
# l'entree (R0 contre l'impedance haute frequence du canal), retiree avant la
# fenetre et remise a part : lissee, elle serait non causale, et la boucle
# tampon-canal ne la verrait plus au bon instant. Le lissage se rend dans le
# resultat ; le haut de la grille est pris pour qu'il reste sous le tiers du
# front du tampon.
# ==========================================================================

def s_depuis_abcd(abcd, r0):
    """Les quatre S (N,) d'une cascade ABCD (N, 2, 2) sur R0 aux deux ports."""
    a, b, c, d = abcd[:, 0, 0], abcd[:, 0, 1], abcd[:, 1, 0], abcd[:, 1, 1]
    den = a + b / r0 + c * r0 + d
    s11 = (a + b / r0 - c * r0 - d) / den
    s22 = (-a + b / r0 - c * r0 + d) / den
    s21 = 2.0 / den
    s12 = 2.0 * (a * d - b * c) / den
    return s11, s12, s21, s22


def reponses_impulsionnelles(freqs, s_f, s_dc, dt, fenetre, tr_lissage):
    """Les reponses impulsionnelles (L,) des S, au pas dt.

    `s_f` : S sur la grille `freqs` (reguliere, partant de df) ; `s_dc` :
    leur valeur au continu ; `tr_lissage` : le front gaussien equivalent a
    la fenetre (10-90 %). Rend (rep, partie instantanee)."""
    freqs = np.asarray(freqs, dtype=float)
    df = freqs[1] - freqs[0]
    n_fft = int(round(1.0 / (df * dt)))
    n_fft += n_fft % 2
    nb = n_fft // 2 + 1
    sigma = tr_lissage / 2.5631
    fen = np.exp(-2.0 * (math.pi * sigma * freqs) ** 2)
    m = min(len(freqs), nb - 1)
    x = np.zeros(nb, dtype=complex)
    x[0] = s_dc
    x[1:m + 1] = s_f[:m] * fen[:m]
    h = np.fft.irfft(x, n_fft)
    # LE NOYAU DU LISSAGE, au meme pas et par le meme chemin : une gaussienne
    # centree sur t = 0, dont la moitie gauche est repliee en fin de tableau.
    xg = np.zeros(nb)
    xg[0] = 1.0
    xg[1:m + 1] = fen[:m]
    g = np.fft.irfft(xg, n_fft)
    # LA PART INSTANTANEE se lit a ce qui deborde AVANT t = 0 : un trajet
    # retarde n'y laisse rien, une reflexion immediate y laisse la moitie de
    # sa gaussienne. Sa moyenne sur le haut de la grille la donnerait mal --
    # un echo retarde y tourne en phase et n'y fait pas zero.
    k = int(math.ceil(6.0 * sigma / dt)) + 1
    k = min(k, n_fft // 4)
    num = h[0] + 2.0 * np.sum(h[n_fft - k:])
    den = g[0] + 2.0 * np.sum(g[n_fft - k:])
    inst = float(num / den) if abs(den) > 1e-12 else 0.0
    # Elle est remise en Dirac, au pas zero, a la place de sa gaussienne ;
    # le reste de la partie non causale tombe.
    # LE DEBORD QUI N'EST PAS LE DIRAC. Une reponse rapide qui demarre a
    # t = 0 (la capacite d'entree contre R0) deborde elle aussi un peu avant
    # zero, et ce debord tombait avec le reste : le niveau etabli derivait
    # alors de quelques pour cent. Il revient au pas zero -- la ou se trouve,
    # a la resolution du lissage, ce qui l'a produit. Un trajet retarde n'en
    # laisse pas : sa correction est nulle.
    debord = float(np.sum(h[n_fft - k:]) - inst * np.sum(g[n_fft - k:]))
    h = h[: n_fft // 2] - inst * g[: n_fft // 2]
    h[0] += inst + debord
    return h, inst


def _tronquer(reps, seuil=1e-7):
    """La longueur au-dela de laquelle les quatre reponses sont negligeables."""
    l_max = 1
    for h in reps:
        a = np.abs(h)
        if not len(a):
            continue
        cum = np.cumsum(a[::-1])[::-1]
        tot = cum[0] if cum[0] > 0 else 1.0
        k = int(np.argmax(cum < seuil * tot)) if np.any(cum < seuil * tot) \
            else len(a)
        l_max = max(l_max, k)
    return l_max


class Liaison(object):
    """Un tampon emetteur, un canal en ondes, des diodes de reception.

    `canal` : (s11, s12, s21, s22) reponses impulsionnelles au pas dt sur R0 ;
    `emetteur` : Tampon ; `commandes` : sortie de `commandes()` ;
    `recepteur` : Tampon (diodes seulement : sa capacite et ses resistances
    sont deja dans le canal) ou None ; `v_ref` : la tension a laquelle
    les ondes sont rapportees (0 en simple, le mode commun en differentiel)."""

    def __init__(self, canal, r0, dt, emetteur, cmd, recepteur=None,
                 v_ref=0.0):
        self.s = [np.asarray(h, dtype=float) for h in canal]
        self.L = len(self.s[0])
        self.r0, self.dt = float(r0), float(dt)
        self.em, self.cmd, self.rx = emetteur, cmd, recepteur
        self.v_ref = float(v_ref)
        self.s0 = [float(h[0]) for h in self.s]
        # Les noyaux renverses, pour l'histoire : sum_k>=1 s[k] a[n-k].
        self.kr = [h[1:][::-1].copy() for h in self.s]

    def _k(self, etat_bas, sens, t):
        """(Ku, Kd) a l'instant t du front `sens` ; hors front, l'etat."""
        if sens is None:
            return (0.0, 1.0) if etat_bas else (1.0, 0.0)
        ku, kd = self.cmd[sens]
        i = int(t / self.dt)
        if i >= len(ku) - 1:
            return float(ku[-1]), float(kd[-1])
        f = t / self.dt - i
        return (float(ku[i] + f * (ku[i + 1] - ku[i])),
                float(kd[i] + f * (kd[i + 1] - kd[i])))

    def _depart(self, sens, ku_actuel):
        """Le decalage dans le tableau du front `sens` ou Ku vaut deja
        `ku_actuel` : un front qui en interrompt un autre repart de la ou
        le premier s'est arrete, sans saut de commande."""
        ku = self.cmd[sens][0]
        a, b = float(ku[0]), float(ku[-1])
        if abs(b - a) < 1e-12:
            return 0.0
        x = (ku_actuel - a) / (b - a)
        if x <= 0:
            return 0.0
        y = (ku - a) / (b - a)
        k = int(np.argmax(y >= min(x, 1.0)))
        return k * self.dt

    def simuler(self, bits, spu_sim, ui):
        """La tension a la broche du recepteur, un echantillon par pas, pour
        la suite de `bits` (0/1) emise a raison d'un bit par UI. Le bit n
        bascule a l'instant n UI. Rend (v1, v2) en volts absolus."""
        bits = [int(b) for b in bits]
        n_pas = len(bits) * spu_sim
        dt = self.dt
        L = self.L
        # -- le point de repos du premier bit -------------------------------
        etat_bas = bits[0] == 0
        ku0, kd0 = self._k(etat_bas, None, 0.0)
        s_dc = [float(np.sum(h)) for h in self.s]
        # Le continu : pas de C_comp (v_prec absent), les reponses sommees.
        a1, a2 = self._newton(ku0, kd0, 0.0, 0.0, s_dc, None, None, None, None)
        A1 = np.empty(L - 1 + n_pas)
        A2 = np.empty(L - 1 + n_pas)
        A1[:L - 1], A2[:L - 1] = a1, a2
        v1_prec = a1 + s_dc[0] * a1 + s_dc[1] * a2
        v2_prec = a2 + s_dc[2] * a1 + s_dc[3] * a2
        V1 = np.empty(n_pas)
        V2 = np.empty(n_pas)
        sens, t_front, ku_cour = None, 0.0, ku0
        kr = self.kr
        for n in range(n_pas):
            ib, ph = divmod(n, spu_sim)
            if ph == 0 and ib > 0 and bits[ib] != bits[ib - 1]:
                sens = "montant" if bits[ib] else "descendant"
                t_front = self._depart(sens, ku_cour)
                etat_bas = bits[ib] == 0
            elif sens is not None:
                t_front += dt
            ku, kd = self._k(etat_bas, sens, t_front)
            ku_cour = ku
            j = n + L - 1
            hist = A1[j - L + 1:j]
            hist2 = A2[j - L + 1:j]
            h1 = float(kr[0] @ hist) + float(kr[1] @ hist2)
            h2 = float(kr[2] @ hist) + float(kr[3] @ hist2)
            a1, a2 = self._newton(ku, kd, h1, h2, self.s0, v1_prec, v2_prec,
                                  a1, a2)
            A1[j], A2[j] = a1, a2
            b1 = self.s0[0] * a1 + self.s0[1] * a2 + h1
            b2 = self.s0[2] * a1 + self.s0[3] * a2 + h2
            v1_prec, v2_prec = a1 + b1, a2 + b2
            V1[n], V2[n] = v1_prec + self.v_ref, v2_prec + self.v_ref
        return V1, V2

    def _newton(self, ku, kd, h1, h2, s, v1_prec, v2_prec, a1, a2):
        """Les ondes entrantes (a1, a2) qui satisfont les deux bouts."""
        r0, dt = self.r0, self.dt
        em, rx = self.em, self.rx
        cc = em.c_comp if v1_prec is not None else 0.0
        if a1 is None:
            a1 = a2 = 0.0
        for _ in range(60):
            b1 = s[0] * a1 + s[1] * a2 + h1
            b2 = s[2] * a1 + s[3] * a2 + h2
            v1, v2 = a1 + b1, a2 + b2
            i_e, g_e = em.i_total(v1 + self.v_ref, ku, kd)
            if cc:
                i_e += cc * (v1 - v1_prec) / dt
                g_e += cc / dt
            if rx is not None:
                i_r, g_r = rx.i_statique(v2 + self.v_ref)
            else:
                i_r = g_r = 0.0
            # F1 = (a1 - b1)/R0 + I_e(V1) ; F2 = (a2 - b2)/R0 + I_r(V2)
            f1 = (a1 - b1) / r0 + i_e
            f2 = (a2 - b2) / r0 + i_r
            j11 = (1.0 - s[0]) / r0 + g_e * (1.0 + s[0])
            j12 = -s[1] / r0 + g_e * s[1]
            j21 = -s[2] / r0 + g_r * s[2]
            j22 = (1.0 - s[3]) / r0 + g_r * (1.0 + s[3])
            det = j11 * j22 - j12 * j21
            if abs(det) < 1e-30:
                break
            d1 = (f1 * j22 - f2 * j12) / det
            d2 = (j11 * f2 - j21 * f1) / det
            # Pas borne : une diode qui s'ouvre fait des sauts de pente, et
            # un Newton nu y oscille.
            lim = 0.5
            d1 = max(-lim, min(lim, d1))
            d2 = max(-lim, min(lim, d2))
            a1 -= d1
            a2 -= d2
            if abs(d1) < 1e-10 and abs(d2) < 1e-10:
                break
        return a1, a2


# ==========================================================================
# La paire : deux tampons, deux brins couples, deux recepteurs
# --------------------------------------------------------------------------
# POURQUOI DEUX BRINS. Le demi-circuit du mode impair suppose deux tampons
# parfaitement opposes : ce que l'un monte, l'autre le descend au meme
# instant et de la meme facon, et le mode commun ne bouge pas. Un vrai
# couple de tampons CMOS ne l'est pas -- montee et descente differentes,
# un brin en retard sur l'autre (tdelay de [Diff Pin]), deux coins, deux
# boitiers -- et ce qui n'est pas oppose part en MODE COMMUN : le bruit que
# le recepteur differentiel rejette (a peu pres), mais que la paire rayonne
# et que les diodes voient.
#
# LE CANAL, PAR BRIN. La paire symetrique de `simulation_em` est donnee par
# ses deux modes, sans couplage entre eux : la cascade du mode impair
# (V_d = V_p - V_n, I_d = (I_p - I_n)/2) et celle du mode commun
# (V_c = (V_p + V_n)/2, I_c = I_p + I_n). On les remet par brin -- quatre
# acces, p et n de chaque cote, ondes de tension sur R0 par brin --, et ce
# qui est propre a UN brin s'y pose tel quel : boitier de chaque broche,
# capacite d'entree de chaque recepteur, surlongueur d'un brin. La
# terminaison du recepteur est une resistance differentielle et, au
# besoin, une impedance de mode commun (prise mediane).
#
# LE PAS DE TEMPS, comme pour la ligne seule (`Liaison`), mais quatre ondes
# entrantes et un Newton 4x4 : b = S0 a + h, (a - b)/R0 = - I(V) a chaque
# acces. L'histoire est un seul produit matrice-vecteur par pas.
# ==========================================================================

def abcd_brins(abcd_dd, abcd_cc):
    """(N, 4, 4) ABCD par brin -- blocs 2x2 [[A, B], [C, D]] sur (p, n) --
    d'une paire symetrique donnee par ses deux modes (N, 2, 2).

    Les deux bases : V_brins = TV V_modes, I_brins = TI I_modes, les modes
    dans l'ordre (d, c) ; A_brins = TV A_modes TV^-1, B = TV B TI^-1,
    C = TI C TV^-1, D = TI D TI^-1."""
    tv = np.array([[0.5, 1.0], [-0.5, 1.0]])
    ti = np.array([[1.0, 0.5], [-1.0, 0.5]])
    tvi, tii = np.linalg.inv(tv), np.linalg.inv(ti)
    dd = np.asarray(abcd_dd, dtype=complex)
    cc = np.asarray(abcd_cc, dtype=complex)
    n = len(dd)
    m = np.zeros((n, 4, 4), dtype=complex)
    for (r, c), (ga, dr) in (((0, 0), (tv, tvi)), ((0, 1), (tv, tii)),
                             ((1, 0), (ti, tvi)), ((1, 1), (ti, tii))):
        bloc = np.zeros((n, 2, 2), dtype=complex)
        bloc[:, 0, 0] = dd[:, r, c]
        bloc[:, 1, 1] = cc[:, r, c]
        m[:, 2 * r:2 * r + 2, 2 * c:2 * c + 2] = ga @ bloc @ dr
    return m


def abcd_par_brin(m_p, m_n, n):
    """(N, 4, 4) de deux 2-ports (N, 2, 2) poses chacun sur son brin, sans
    couplage ; None vaut un fil."""
    out = np.zeros((n, 4, 4), dtype=complex)
    for k, mm in enumerate((m_p, m_n)):
        if mm is None:
            mm = np.zeros((n, 2, 2), dtype=complex)
            mm[:, 0, 0] = mm[:, 1, 1] = 1.0
        for r in range(2):
            for c in range(2):
                out[:, 2 * r + k, 2 * c + k] = mm[:, r, c]
    return out


def charger_brins(m, y_l):
    """La charge (N, 2, 2) en admittance, posee au bout de la cascade
    (N, 4, 4) : A' = A + B Y, C' = C + D Y."""
    out = m.copy()
    out[:, :2, :2] = m[:, :2, :2] + m[:, :2, 2:] @ y_l
    out[:, 2:, :2] = m[:, 2:, :2] + m[:, 2:, 2:] @ y_l
    return out


def s_depuis_abcd_4(m, r0):
    """(N, 4, 4) S, ondes de tension sur R0 a chaque brin, d'une cascade
    (N, 4, 4) ; acces dans l'ordre (1p, 1n, 2p, 2n). C'est la formule du
    deux-ports, ecrite en blocs : a1 = P V2 + Q I2, b1 = R V2 + U I2."""
    a, b = m[:, :2, :2], m[:, :2, 2:]
    c, d = m[:, 2:, :2], m[:, 2:, 2:]
    p, q = (a + r0 * c) / 2.0, (b + r0 * d) / 2.0
    r, u = (a - r0 * c) / 2.0, (b - r0 * d) / 2.0
    w = np.linalg.inv(p + q / r0)
    s21 = w
    s22 = -w @ (p - q / r0)
    s11 = (r + u / r0) @ w
    s12 = (r - u / r0) + (r + u / r0) @ s22
    s = np.zeros(m.shape, dtype=complex)
    s[:, :2, :2], s[:, :2, 2:] = s11, s12
    s[:, 2:, :2], s[:, 2:, 2:] = s21, s22
    return s


class _Commande(object):
    """Les commandes d'un brin, avec le pas : de quoi reprendre `_k` et
    `_depart` de `Liaison` sans les recopier."""
    _k = Liaison._k
    _depart = Liaison._depart

    def __init__(self, cmd, dt):
        self.cmd, self.dt = cmd, dt


class LiaisonPaire(object):
    """Deux tampons, la paire en ondes par brin, deux recepteurs.

    `canal` : 4 x 4 reponses impulsionnelles au pas dt (acces 1p, 1n, 2p,
    2n) ; `emetteurs`, `cmds`, `recepteurs` : un par brin (p, n) ;
    `decalages` : le retard de chaque brin sur la sequence (s) -- tdelay."""

    def __init__(self, canal, r0, dt, emetteurs, cmds,
                 recepteurs=(None, None), decalages=(0.0, 0.0)):
        self.s = [[np.asarray(canal[i][j], dtype=float) for j in range(4)]
                  for i in range(4)]
        self.L = len(self.s[0][0])
        self.r0, self.dt = float(r0), float(dt)
        self.em = list(emetteurs)
        self.cmd = [_Commande(c, self.dt) for c in cmds]
        self.rx = list(recepteurs)
        d0 = min(decalages)
        self.dec = [float(x) - d0 for x in decalages]
        self.s0 = np.array([[h[0] for h in ligne] for ligne in self.s])
        # LES DEUX BOUTS SE RESOLVENT A TOUR DE ROLE : ce qui traverse la
        # paire en un pas n'est que le reste de la fenetre (1e-3 au plus
        # quand la ligne est plus longue que le pas). Deux Newton 2x2 en
        # scalaires, l'un apres l'autre, chacun avec la derniere valeur de
        # l'autre bout, jusqu'a ce que rien ne bouge -- trois fois plus
        # vite que le Newton 4x4 en numpy, qui reste le recours. Un bout
        # sans diode est lineaire, et se resout d'un produit.
        s0 = self.s0
        self.s0_12 = s0[:2, 2:].copy()
        self.s0_21 = s0[2:, :2].copy()
        self.s0_1 = [float(s0[0, 0]), float(s0[0, 1]), float(s0[1, 0]),
                     float(s0[1, 1])]
        self.s0_2 = [float(s0[2, 2]), float(s0[2, 3]), float(s0[3, 2]),
                     float(s0[3, 3])]
        self.lin_2 = None
        if self.rx[0] is None and self.rx[1] is None:
            # (I - S22) a2 = h2
            self.lin_2 = np.linalg.inv(np.eye(2) - s0[2:, 2:])
        # LE NOYAU A PLAT : l'histoire A[j-L+1:j] (L-1 lignes, 4 colonnes)
        # se lit d'un seul produit, K[i, 4k + j] = s_ij[L-1-k].
        L = self.L
        self.K = np.zeros((4, 4 * (L - 1)))
        for i in range(4):
            for j in range(4):
                self.K[i, j::4] = self.s[i][j][1:][::-1]

    def _evenements(self, bits, spu_sim, n_pas):
        """Pour chaque brin, {pas: (sens, avance)} : le brin n emet
        l'inverse, chaque brin bascule a n UI + son decalage."""
        dt = self.dt
        ev = [{}, {}]
        for x in (0, 1):
            b = bits if x == 0 else [1 - v for v in bits]
            for ib in range(1, len(b)):
                if b[ib] == b[ib - 1]:
                    continue
                t_s = ib * spu_sim * dt + self.dec[x]
                n_s = int(math.ceil(t_s / dt - 1e-9))
                if n_s < n_pas:
                    ev[x][n_s] = ("montant" if b[ib] else "descendant",
                                  n_s * dt - t_s)
        return ev

    def simuler(self, bits, spu_sim, ui):
        """Les quatre tensions (4, n_pas) -- broche p et n de l'emetteur,
        puis du recepteur, au die --, en volts absolus."""
        bits = [int(b) for b in bits]
        n_pas = len(bits) * spu_sim
        dt, L = self.dt, self.L
        ev = self._evenements(bits, spu_sim, n_pas)
        etat_bas = [bits[0] == 0, bits[0] == 1]
        sens = [None, None]
        t_front = [0.0, 0.0]
        ku = [0.0, 0.0]
        kd = [0.0, 0.0]
        for x in (0, 1):
            ku[x], kd[x] = self.cmd[x]._k(etat_bas[x], None, 0.0)
        ku_cour = list(ku)
        s_dc = np.array([[float(np.sum(h)) for h in ligne]
                         for ligne in self.s])
        a = self._newton(ku, kd, np.zeros(4), s_dc, None, None)
        A = np.empty((L - 1 + n_pas, 4))
        A[:L - 1] = a
        v_prec = a + s_dc @ a
        V = np.empty((n_pas, 4))
        K, s0 = self.K, self.s0
        for n in range(n_pas):
            for x in (0, 1):
                e = ev[x].get(n)
                if e is not None:
                    sens[x] = e[0]
                    t_front[x] = self.cmd[x]._depart(e[0], ku_cour[x]) + e[1]
                    etat_bas[x] = e[0] == "descendant"
                elif sens[x] is not None:
                    t_front[x] += dt
                ku[x], kd[x] = self.cmd[x]._k(etat_bas[x], sens[x],
                                              t_front[x])
                ku_cour[x] = ku[x]
            j = n + L - 1
            h = K @ A[j - L + 1:j].ravel() if L > 1 else np.zeros(4)
            a_ = self._deux_bouts(ku, kd, h, v_prec, a)
            a = a_ if a_ is not None else \
                self._newton(ku, kd, h, s0, v_prec, a)
            A[j] = a
            v_prec = a + s0 @ a + h
            V[n] = v_prec
        return V.T

    def _deux_bouts(self, ku, kd, h, v_prec, a):
        """Les quatre ondes entrantes, bout par bout, a tour de role ; None
        si cela ne converge pas."""
        dt = self.dt
        em = self.em
        rx = self.rx

        def tampons(x, v):
            i, g = em[x].i_total(v, ku[x], kd[x])
            cc = em[x].c_comp
            if cc:
                i += cc * (v - v_prec[x]) / dt
                g += cc / dt
            return i, g
        def diodes(x, v):
            return rx[x].i_statique(v) if rx[x] is not None else (0.0, 0.0)
        (c00, c01), (c10, c11) = self.s0_12.tolist()
        (e00, e01), (e10, e11) = self.s0_21.tolist()
        h0, h1, h2, h3 = h.tolist()
        a0, a1, a2, a3 = a.tolist()
        for _ in range(30):
            p0, p1 = a0, a1
            a0, a1 = self._newton2(self.s0_1, h0 + c00 * a2 + c01 * a3,
                                   h1 + c10 * a2 + c11 * a3, tampons, a0, a1)
            g0, g1 = h2 + e00 * a0 + e01 * a1, h3 + e10 * a0 + e11 * a1
            if self.lin_2 is not None:
                (l00, l01), (l10, l11) = self.lin_2.tolist()
                n2, n3 = l00 * g0 + l01 * g1, l10 * g0 + l11 * g1
            else:
                n2, n3 = self._newton2(self.s0_2, g0, g1, diodes, a2, a3)
            fini = abs(n2 - a2) < 1e-11 and abs(n3 - a3) < 1e-11 and \
                abs(a0 - p0) < 1e-11 and abs(a1 - p1) < 1e-11
            a2, a3 = n2, n3
            if fini:
                return np.array([a0, a1, a2, a3])
        return None

    def _newton2(self, s, h0, h1, courant, a0, a1):
        """Un bout de la paire : deux ondes, deux equations, en scalaires --
        le Newton de `Liaison`, les deux brins a la place des deux bouts."""
        r0 = self.r0
        s00, s01, s10, s11 = s
        for _ in range(60):
            b0 = s00 * a0 + s01 * a1 + h0
            b1 = s10 * a0 + s11 * a1 + h1
            i0, g0 = courant(0, a0 + b0)
            i1, g1 = courant(1, a1 + b1)
            f0 = (a0 - b0) / r0 + i0
            f1 = (a1 - b1) / r0 + i1
            j00 = (1.0 - s00) / r0 + g0 * (1.0 + s00)
            j01 = -s01 / r0 + g0 * s01
            j10 = -s10 / r0 + g1 * s10
            j11 = (1.0 - s11) / r0 + g1 * (1.0 + s11)
            det = j00 * j11 - j01 * j10
            if abs(det) < 1e-30:
                break
            d0 = (f0 * j11 - f1 * j01) / det
            d1 = (j00 * f1 - j10 * f0) / det
            d0 = max(-0.5, min(0.5, d0))
            d1 = max(-0.5, min(0.5, d1))
            a0 -= d0
            a1 -= d1
            if abs(d0) < 1e-10 and abs(d1) < 1e-10:
                break
        return a0, a1

    def _newton(self, ku, kd, h, s, v_prec, a):
        """Les quatre ondes entrantes qui satisfont les quatre acces."""
        r0, dt = self.r0, self.dt
        un = np.eye(4)
        a = np.zeros(4) if a is None else np.array(a, dtype=float)
        jac0 = (un - s) / r0
        plus = un + s
        i = np.zeros(4)
        g = np.zeros(4)
        for _ in range(60):
            b = s @ a + h
            v = a + b
            for x in (0, 1):
                em = self.em[x]
                ie, ge = em.i_total(v[x], ku[x], kd[x])
                if v_prec is not None and em.c_comp:
                    ie += em.c_comp * (v[x] - v_prec[x]) / dt
                    ge += em.c_comp / dt
                i[x], g[x] = ie, ge
                rx = self.rx[x]
                if rx is not None:
                    i[2 + x], g[2 + x] = rx.i_statique(v[2 + x])
            f = (a - b) / r0 + i
            jac = jac0 + g[:, None] * plus
            try:
                d = np.linalg.solve(jac, f)
            except np.linalg.LinAlgError:
                break
            # Pas borne, comme pour la ligne seule.
            d = np.clip(d, -0.5, 0.5)
            a = a - d
            if float(np.max(np.abs(d))) < 1e-10:
                break
        return a
