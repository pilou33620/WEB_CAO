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
Le reste du fichier ([Package], [Pin], [Model Selector], [Diff Pin],
sous-modeles, AMI) est ignore -- et dit dans le resultat. Le boitier
(R_pkg, L_pkg, C_pkg) n'entre pas dans le calcul.

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

VERSION = "1.0.0"
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


def lire(texte, nom_fichier=""):
    """Le texte d'un fichier .ibs -> {version, composant, modeles, ignores}.

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
    modele = None
    section = None          # le mot-cle en cours, normalise
    onde = None             # la forme d'onde en cours
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
            if cle == "ibis ver":
                res["version"] = arg
            elif cle == "component":
                res["composant"] = res["composant"] or arg
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
    res["ignores"] = sorted(ignores)
    return res


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
        a1, a2 = self._newton(ku0, kd0, 0.0, 0.0, s_dc, 0.0, 0.0, None, None)
        A1 = np.empty(L - 1 + n_pas)
        A2 = np.empty(L - 1 + n_pas)
        A1[:L - 1], A2[:L - 1] = a1, a2
        v1_prec = None
        v2_prec = None
        b1, b2 = self._b(a1, a2, s_dc, 0.0, 0.0, total=True)
        v1_prec, v2_prec = a1 + b1, a2 + b2
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

    def _b(self, a1, a2, s, h1, h2, total=False):
        return (s[0] * a1 + s[1] * a2 + h1, s[2] * a1 + s[3] * a2 + h2)

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
