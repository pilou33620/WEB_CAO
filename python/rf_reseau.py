# -*- coding: utf-8 -*-
"""Simulation RF : le S21 d'un reseau pistes + composants entre deux ports.

    >>> import rf_reseau
    >>> rf_reseau.etat()["dispo"]
    True

LA QUESTION. On sort d'une puce radio dont la sortie vaut 14+8j ohms, on
traverse un reseau d'adaptation -- une self en serie, une capacite a la masse,
quelques millimetres de piste -- et l'on arrive sur un connecteur U.FL ou une
antenne d'impedance connue. Combien de la puissance disponible arrive au bout,
et qu'est-ce qu'il faut retoucher ?

LES PISTES SONT CALCULEES PAR LE SIMULATEUR DU DEPOT, ET PAR LUI SEUL. Chaque
BRANCHE de cuivre -- d'une pastille a une autre, ou a une derivation -- part
dans `simulation_em.simuler` exactement comme une selection de l'onglet
Impedance : methode des moments sur la section droite, dispersion, pertes,
coudes, vias et moignons. On lui demande sa matrice ABCD a chaque frequence
(`garder_abcd`) et on n'y retouche pas. Une piste a donc ici le meme Z0 que
sous l'onglet Impedance, au chiffre pres.

CE QUE CE MODULE AJOUTE : l'assemblage. Une chaine ABCD ne sait pas ce qu'est
une capacite a la masse au milieu d'un T ; une analyse NODALE, si. Chaque
branche devient un quadripole Y, chaque composant son admittance (R, L, C
ideal, sous-circuit SPICE lineaire, ou fichier Touchstone a N ports), chaque
via de masse sous un composant en derivation son inductance -- et l'on reduit
le tout aux deux ports.

LES PORTS ONT DES IMPEDANCES COMPLEXES, d'ou des parametres S GENERALISES
(ondes de puissance, Kurokawa 1965) :

    a = (V + Z I) / (2 sqrt(Re Z)),   b = (V - Z* I) / (2 sqrt(Re Z))

obtenus en fermant chaque port sur sa reference et en attaquant l'autre --
voir `_s_ports`.

Avec la sortie de la puce en Z1 et la charge en Z2, |S21|^2 est le GAIN
TRANSDUCIQUE : la part de la puissance disponible de la puce qui arrive dans
la charge. S11 = 0 veut dire que la puce voit le conjugue de sa sortie --
l'adaptation parfaite. Avec deux references reelles egales, on retombe sur les
S ordinaires : c'est ce que le banc verifie contre `cascade_to_s`.

LES COMPOSANTS ACTIFS n'entrent que par un Touchstone. Un transistor SPICE est
non lineaire : il lui faut un point de polarisation, et ce n'est pas le sujet.
Il est refuse avec cette phrase, pas linearise en silence.

Le document d'entree, format « cao-sim-rf-1 », EN MILLIMETRES :

    stackup, reference_nets, analyse   comme pour `simulation_em`
    ports       [{noeud, z: [re, im]}] x 2 -- l'impedance de SORTIE de la
                puce au port 1, celle de la charge au port 2
    branches    [{a, b, net, objets, vias, fentes?}] -- `objets` rangés de a
                vers b, au format de `geometry.objects` de simulation_em ;
                `fentes` [{d1, d2, g, largeur, plan, borne}] les fentes du plan
                de reference franchies, d1 / d2 les detours (mm)
    composants  [{ref, noeuds: [..], modele, genre?, geo?}] -- un noeud par
                broche, « 0 » pour la masse ; modele = {type: "ideal", genre:
                R|L|C, valeur} | {type: "spice", texte, nom, sous_circuit?,
                params?} | {type: "snp", texte, nom} ; une self (genre "L")
                porte `geo` {x0, y0, x1, y1, largeur, couche} pour ses mutuelles
    voisines    [{net, objets}] -- les pistes d'AUTRES nets qui longent le
                reseau, fermees par le calcul sur leur Z0
    masses      [{noeud, couche, vias: [{x, y, percage, couche_plan}]}] --
                la pastille de masse d'un composant et les vias qui la
                descendent au plan ; sans via, la page met « 0 » directement
"""

import math
import os
import re
import sys
import time

_ICI = os.path.dirname(os.path.abspath(__file__))
if _ICI not in sys.path:
    sys.path.insert(0, _ICI)

try:
    import numpy as np
    import simulation_em as se
    import ligne_mom as tl
    ERREUR_RF = se.ERREUR_SOLVEUR
except Exception as _exc:                              # noqa: BLE001
    np = se = tl = None
    ERREUR_RF = _exc

try:
    import scipy.sparse as _SPARSE
except Exception:                                      # noqa: BLE001
    _SPARSE = None

# 1.6.0 (2026-10-10) : les options de `ligne_mom` 2.7.0 -- topologie, hauteur
# et rugosite de la couche dans les pertes du cuivre (piste de masse et
# sections couplees), dielectrique causal dans [C](f) et tan delta(f) des
# sections couplees. Les branches les recoivent par `simulation_em.simuler`.
# La piste de masse passe aussi son epaisseur de cuivre, qu'elle laissait au
# 35 um par defaut.
VERSION = "1.6.0"
FORMAT = "cao-sim-rf-1"
FORMAT_RESULTAT = "cao-sim-rf-resultat-1"
MASSE = "0"

# Un Touchstone de quelques milliers de points pese vite plusieurs megaoctets.
MAX_CORPS = 8 * 1024 * 1024
MAX_BRANCHES = 200
MAX_COMPOSANTS = 200

# Une resistance ou une self NULLE est un court-circuit : on la pose en tres
# grande admittance plutot que de fusionner les noeuds.
# ponytail: court-circuit en 1e9 S, fusion de noeuds si le conditionnement gene
Y_COURT = 1e9


class ErreurRF(Exception):
    """Refus explicite : un message d'une ligne et ce qu'il faut changer."""
    def __init__(self, message, conseil=""):
        super(ErreurRF, self).__init__(message)
        self.message = str(message)
        self.conseil = str(conseil)


def etat():
    if ERREUR_RF is not None:
        return {"dispo": False, "version": VERSION,
                "detail": "Simulation RF indisponible : %s" % ERREUR_RF,
                "conseil": "Elle a besoin de numpy : « pip install numpy »."}
    return {"dispo": True, "format": FORMAT, "resultat": FORMAT_RESULTAT,
            "version": VERSION, "max": MAX_CORPS,
            "methode": "pistes par simulation_em (MoM + cascade ABCD),"
                       " assemblage nodal, S generalises"}


def _nombre(v, defaut=0.0):
    try:
        v = float(v)
    except (TypeError, ValueError):
        return defaut
    return v if math.isfinite(v) else defaut


# ==========================================================================
# Touchstone (.sNp), versions 1 et 2
# ==========================================================================

_UNITES_F = {"hz": 1.0, "khz": 1e3, "mhz": 1e6, "ghz": 1e9}


def lire_touchstone(texte, nom="", n_ports=None):
    """Texte d'un .sNp -> (freqs [Hz], S (nf, n, n), z0 (n,)).

    Le nombre de ports vient de l'extension du nom (.s2p), du mot-cle
    [Number of Ports] en version 2, ou de `n_ports`. Les Y et Z sont convertis
    en S. Les donnees de bruit d'un .s2p -- qui suivent le reseau, frequences
    reparties de zero -- sont ignorees.
    """
    m = re.search(r"\.s(\d+)p$", str(nom or "").strip().lower())
    n = int(m.group(1)) if m else n_ports
    unite, param, forme, r_ref = 1e9, "s", "ma", 50.0
    refs = None
    ordre_21_12 = True
    nombres = []
    for brute in str(texte).splitlines():
        ligne = brute.split("!", 1)[0].strip()
        if not ligne:
            continue
        if ligne.startswith("#"):
            jetons = ligne[1:].lower().split()
            k = 0
            while k < len(jetons):
                j = jetons[k]
                if j in _UNITES_F:
                    unite = _UNITES_F[j]
                elif j in ("s", "y", "z"):
                    param = j
                elif j in ("ma", "db", "ri"):
                    forme = j
                elif j == "r" and k + 1 < len(jetons):
                    r_ref = _nombre(jetons[k + 1], 50.0)
                    k += 1
                elif j in ("g", "h"):
                    raise ErreurRF("%s : paramètres %s non gérés (seuls S, Y"
                                   " et Z le sont)." % (nom, j.upper()))
                k += 1
            continue
        if ligne.startswith("["):
            cle, _, reste = ligne[1:].partition("]")
            cle = cle.strip().lower()
            if cle == "number of ports":
                n = int(_nombre(reste, 0))
            elif cle == "two-port data order":
                ordre_21_12 = "21_12" in reste
            elif cle == "reference":
                refs = [_nombre(x, 50.0) for x in reste.split()]
            elif cle == "end":
                break
            continue
        nombres.extend(ligne.split())
    if not n or n < 1:
        raise ErreurRF("%s : nombre de ports inconnu." % (nom or "Touchstone"),
                       "Nommez le fichier .s1p, .s2p, ... .sNp.")
    try:
        valeurs = [float(x) for x in nombres]
    except ValueError as exc:
        raise ErreurRF("%s : donnée illisible (%s)." % (nom, exc))
    pas = 1 + 2 * n * n
    freqs, mats = [], []
    for i in range(0, len(valeurs) - pas + 1, pas):
        f = valeurs[i] * unite
        if freqs and f <= freqs[-1]:
            break                               # donnees de bruit : fin du reseau
        paires = valeurs[i + 1:i + pas]
        cplx = []
        for a, b in zip(paires[0::2], paires[1::2]):
            if forme == "ri":
                cplx.append(complex(a, b))
            else:
                mod = 10 ** (a / 20.0) if forme == "db" else a
                cplx.append(mod * complex(math.cos(math.radians(b)),
                                          math.sin(math.radians(b))))
        m_ = np.array(cplx, dtype=complex).reshape(n, n)
        # En version 1, un 2 ports s'ecrit S11 S21 S12 S22 : colonne d'abord.
        # C'est la norme, pas une coquille -- voir `simulation_em.touchstone`.
        if n == 2 and ordre_21_12:
            m_ = m_.T
        freqs.append(f)
        mats.append(m_)
    if not freqs:
        raise ErreurRF("%s : aucun point de fréquence lu." % (nom or "Touchstone"))
    z0 = np.array(refs if refs and len(refs) == n else [r_ref] * n, dtype=float)
    mats = np.array(mats)
    version2 = refs is not None or "[version]" in str(texte).lower()
    if param != "s":
        # En version 1, Y et Z sont normalises a R ; en version 2, non.
        echelle = 1.0 if version2 else r_ref
        mats = np.array([_zy_vers_s(m_, param, echelle, z0) for m_ in mats])
    return np.array(freqs), mats, z0


def _zy_vers_s(m_, param, echelle, z0):
    n = m_.shape[0]
    rac = np.diag(np.sqrt(z0))
    irac = np.diag(1.0 / np.sqrt(z0))
    ident = np.eye(n)
    if param == "z":
        zn = irac @ (m_ * echelle) @ irac
        return (zn - ident) @ np.linalg.inv(zn + ident)
    yn = rac @ (m_ / echelle) @ rac
    return (ident - yn) @ np.linalg.inv(ident + yn)


def _s_vers_y(s, z0):
    """S sur des references reelles z0 (par port) -> Y en siemens."""
    n = s.shape[0]
    irac = np.diag(1.0 / np.sqrt(z0))
    ident = np.eye(n)
    return irac @ (ident - s) @ np.linalg.inv(ident + s) @ irac


def _interpoler(freqs, mats, f, nom):
    """La matrice a la frequence f, lineaire en partie reelle et imaginaire.

    PAS D'EXTRAPOLATION. Un modele mesure jusqu'a 6 GHz ne dit rien de 8 GHz,
    et prolonger sa derniere pente inventerait une resonance ou en effacerait
    une. On refuse, en donnant la bande du fichier.
    """
    tol = 1e-6 * max(f, 1.0)
    if f < freqs[0] - tol or f > freqs[-1] + tol:
        raise ErreurRF(
            "%s ne couvre que %.4g à %.4g GHz ; la bande demandée va de ou"
            " jusqu'à %.4g GHz." % (nom, freqs[0] / 1e9, freqs[-1] / 1e9,
                                    f / 1e9),
            "Resserrez la bande d'analyse sur celle du fichier.")
    k = int(np.searchsorted(freqs, f))
    if k <= 0:
        return mats[0]
    if k >= len(freqs):
        return mats[-1]
    f0, f1 = freqs[k - 1], freqs[k]
    t = (f - f0) / (f1 - f0) if f1 > f0 else 0.0
    return mats[k - 1] * (1 - t) + mats[k] * t


# ==========================================================================
# SPICE lineaire : R, L, C et sous-circuits imbriques
# ==========================================================================

_SUFFIXES = [("meg", 1e6), ("mil", 25.4e-6), ("f", 1e-15), ("p", 1e-12),
             ("n", 1e-9), ("u", 1e-6), ("m", 1e-3), ("k", 1e3), ("g", 1e9),
             ("t", 1e12)]
_NOMBRE = re.compile(r"^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?")


def valeur_spice(jeton, params=None):
    """« 1.2n », « 10k », « 2pF », « {C} » -> float."""
    j = str(jeton).strip()
    if j.startswith("{") and j.endswith("}"):
        cle = j[1:-1].strip().upper()
        if params and cle in params:
            return float(params[cle])
        raise ErreurRF("Paramètre SPICE « %s » sans valeur." % cle)
    m = _NOMBRE.match(j)
    if not m:
        raise ErreurRF("Valeur SPICE illisible : « %s »." % j)
    v = float(m.group(0))
    reste = j[m.end():].lower()
    for suf, mult in _SUFFIXES:
        if reste.startswith(suf):
            return v * mult
    return v


def _params(jetons, params=None):
    """[« C=100n », « ESR=0.05 »] -> {« C »: 1e-7, ...}."""
    out = {}
    for j in jetons:
        if "=" in j:
            k, v = j.split("=", 1)
            out[k.strip().upper()] = valeur_spice(v, params)
    return out


def lire_spice(texte, nom=""):
    """Texte SPICE -> {NOM: {broches, elements, params}}.

    Seuls R, L, C et X sont acceptes : c'est tout ce qu'il faut aux modeles
    Murata, et c'est la frontiere du lineaire. Un Q, un M, un D, une source
    commandee est refuse -- il faudrait un point de polarisation.
    """
    lignes = []
    for brute in str(texte).splitlines():
        l_ = brute.split(";", 1)[0].strip()
        if not l_ or l_.startswith("*"):
            continue
        if l_.startswith("+") and lignes:
            lignes[-1] += " " + l_[1:]
        else:
            lignes.append(l_)
    circuits, courant = {}, None
    for l_ in lignes:
        # « PARAMS: C=1 » et « C = 1 » se lisent comme « C=1 ».
        l_ = re.sub(r"\s*=\s*", "=", l_)
        jetons = l_.split()
        tete = jetons[0].lower()
        if tete == ".subckt":
            broches, params = [], {}
            reste = jetons[2:]
            for i, j in enumerate(reste):
                if j.lower() == "params:" or "=" in j:
                    params = _params([x for x in reste[i:]
                                      if x.lower() != "params:"])
                    break
                broches.append(j.lower())
            courant = {"broches": broches, "elements": [], "params": params}
            circuits[jetons[1].upper()] = courant
            continue
        if tete in (".ends", ".end"):
            courant = None
            continue
        if tete.startswith("."):
            continue                    # .model, .param... : lus par l'element
        if courant is None:
            continue                    # rien hors sous-circuit
        genre = tete[0]
        if genre in "rlc":
            if len(jetons) < 4:
                raise ErreurRF("%s : élément incomplet « %s »." % (nom, l_))
            courant["elements"].append(
                (genre, jetons[1].lower(), jetons[2].lower(), jetons[3]))
        elif genre == "x":
            args = [j for j in jetons[1:] if j.lower() != "params:"]
            noeuds = [j.lower() for j in args if "=" not in j]
            surcharges = [j for j in args if "=" in j]
            courant["elements"].append(
                ("x", noeuds[:-1], noeuds[-1].upper(), surcharges))
        else:
            raise ErreurRF(
                "%s : « %s » n'est pas un élément linéaire (seuls R, L, C et"
                " les sous-circuits le sont)." % (nom or "Modèle SPICE",
                                                  jetons[0]),
                "Un composant actif ou non linéaire se simule en RF par ses"
                " paramètres S : fournissez son fichier .sNp.")
    if not circuits:
        raise ErreurRF("%s : aucun .SUBCKT trouvé." % (nom or "Modèle SPICE"))
    return circuits


def _aplatir(circuits, nom, noeuds, params, prefixe, sortie, profondeur=0):
    """Deplie un sous-circuit en elements R/L/C sur des noeuds globaux."""
    if profondeur > 20:
        raise ErreurRF("Sous-circuits SPICE imbriqués trop profondément.")
    if nom not in circuits:
        raise ErreurRF("Sous-circuit SPICE « %s » introuvable." % nom)
    c = circuits[nom]
    if len(noeuds) != len(c["broches"]):
        raise ErreurRF("« %s » a %d broches, %d branchées."
                       % (nom, len(c["broches"]), len(noeuds)))
    p = dict(c["params"])
    p.update(params or {})
    carte = dict(zip(c["broches"], noeuds))

    def g(n):
        if n == "0" or n == "gnd":
            return MASSE
        return carte.get(n, prefixe + n)

    for el in c["elements"]:
        if el[0] == "x":
            _, ns, sous, surch = el
            _aplatir(circuits, sous, [g(n) for n in ns], _params(surch, p),
                     prefixe + "x.", sortie, profondeur + 1)
        else:
            sortie.append((el[0], g(el[1]), g(el[2]), valeur_spice(el[3], p)))


def _admittance(genre, valeur, omega):
    if genre == "r":
        return 1.0 / valeur if valeur else Y_COURT
    if genre == "c":
        return 1j * omega * valeur
    return 1.0 / (1j * omega * valeur) if valeur else Y_COURT


def _reduire(y, garder):
    """Reduction de Kron : ne garde que les noeuds d'indices `garder`."""
    tous = range(y.shape[0])
    enlever = [i for i in tous if i not in set(garder)]
    ypp = y[np.ix_(garder, garder)]
    if not enlever:
        return ypp
    yii = y[np.ix_(enlever, enlever)]
    try:
        x = np.linalg.solve(yii, y[np.ix_(enlever, garder)])
    except np.linalg.LinAlgError:
        raise ErreurRF("Réseau singulier : un nœud interne est isolé ou en"
                       " l'air.",
                       "Vérifiez que chaque pastille du chemin RF est reliée.")
    return ypp - y[np.ix_(garder, enlever)] @ x


class ModeleSpice(object):
    """Un sous-circuit SPICE vu depuis ses broches : Y(omega) a N ports."""

    def __init__(self, texte, nom="", sous_circuit=None, params=None):
        circuits = lire_spice(texte, nom)
        if sous_circuit:
            haut = str(sous_circuit).upper()
        else:
            instancies = set(el[2] for c in circuits.values()
                             for el in c["elements"] if el[0] == "x")
            hauts = [k for k in circuits if k not in instancies]
            if len(hauts) != 1:
                raise ErreurRF("%s : plusieurs sous-circuits, lequel prendre ?"
                               " (%s)" % (nom, ", ".join(sorted(hauts))))
            haut = hauts[0]
        broches = ["@%d" % i for i in range(len(circuits.get(haut, {})
                                                .get("broches", [])))]
        p = dict((str(k).upper(), _nombre(v)) for k, v in (params or {}).items())
        self.elements = []
        _aplatir(circuits, haut, broches, p, "", self.elements)
        self.nom = nom or haut
        self.n = len(broches)
        noms = list(broches)
        for _, a, b, _ in self.elements:
            for x in (a, b):
                if x != MASSE and x not in noms:
                    noms.append(x)
        self._index = dict((x, i) for i, x in enumerate(noms))

    def y(self, f):
        omega = 2 * math.pi * f
        y = np.zeros((len(self._index), len(self._index)), dtype=complex)
        for genre, a, b, v in self.elements:
            _poser(y, self._index, a, b, _admittance(genre, v, omega))
        return _reduire(y, list(range(self.n)))


def _poser(y, index, a, b, adm):
    """Une admittance entre deux noeuds (la masse n'a pas de ligne)."""
    ia, ib = index.get(a), index.get(b)
    if ia is not None:
        y[ia, ia] += adm
    if ib is not None:
        y[ib, ib] += adm
    if ia is not None and ib is not None:
        y[ia, ib] -= adm
        y[ib, ia] -= adm


class ModeleSnp(object):
    def __init__(self, texte, nom=""):
        self.freqs, self.s, self.z0 = lire_touchstone(texte, nom)
        self.n = self.s.shape[1]
        self.nom = nom

    def y(self, f):
        return _s_vers_y(_interpoler(self.freqs, self.s, f, self.nom), self.z0)


class ModeleIdeal(object):
    n = 2

    def __init__(self, genre, valeur, nom=""):
        genre = str(genre or "").lower()
        if genre not in ("r", "l", "c") or not (valeur >= 0):
            raise ErreurRF("%s : modèle idéal « %s = %s » invalide."
                           % (nom, genre.upper(), valeur))
        self.genre, self.valeur, self.nom = genre, valeur, nom

    def y(self, f):
        a = _admittance(self.genre, self.valeur, 2 * math.pi * f)
        return np.array([[a, -a], [-a, a]], dtype=complex)


class ModeleZ(object):
    """Une impedance fixe a la masse : une broche de la puce autre que le
    port, dont on connait ce qu'elle presente (une entree RX, un PA eteint)."""
    n = 1

    def __init__(self, re, im, nom=""):
        self.z = complex(re, im)
        self.nom = nom or "Z"
        if not abs(self.z) > 0:
            raise ErreurRF("%s : impédance nulle (utilisez un 0 Ω)." % self.nom)

    def y(self, f):
        return np.array([[1.0 / self.z]])


def modele(spec, ref=""):
    """{type, ...} -> objet qui rend Y(f) sur ses broches."""
    spec = spec or {}
    t = spec.get("type")
    nom = spec.get("nom") or ref
    if t == "z":
        return ModeleZ(_nombre(spec.get("re")), _nombre(spec.get("im")), ref)
    if t == "ideal":
        return ModeleIdeal(spec.get("genre"), _nombre(spec.get("valeur"), -1),
                           ref)
    if t == "spice":
        return ModeleSpice(spec.get("texte") or "", nom,
                           spec.get("sous_circuit"), spec.get("params"))
    if t == "snp":
        return ModeleSnp(spec.get("texte") or "", nom)
    raise ErreurRF("%s : type de modèle « %s » inconnu." % (ref, t))


# ==========================================================================
# Les vias de masse d'un composant en derivation
# ==========================================================================

def inductance_masse(couches, couche_pastille, vias):
    """L des vias qui descendent une pastille au plan, EN HENRYS.

    Chaque via est un filament de la pastille jusqu'au plan qu'il rejoint ;
    plusieurs vias en parallele portent chacun 1/n du courant, et leur
    mutuelle compte : L = somme(M_ij) / n^2. C'est la self PARTIELLE -- un
    plancher, le retour par le plan n'y est pas.
    """
    fil = []
    for v in vias:
        h = se._hauteur_via(couches, couche_pastille,
                            int(_nombre(v.get("couche_plan"), couche_pastille)))
        r = 0.5 * _nombre(v.get("percage"), 0.3)
        if h > 0 and r > 0:
            fil.append((_nombre(v.get("x")) * 1e-3, _nombre(v.get("y")) * 1e-3,
                        h * 1e-3, r * 1e-3))
    if not fil:
        return 0.0
    total = 0.0
    for i, (xi, yi, hi, ri) in enumerate(fil):
        for j, (xj, yj, hj, _) in enumerate(fil):
            if i == j:
                total += tl.inductance_partielle_propre(0.0, hi, ri)
            else:
                d = max(math.hypot(xi - xj, yi - yj), ri)
                total += tl.mutuelle_partielle(0.0, hi, 0.0, hj, d)
    return total / len(fil) ** 2


def _db(x):
    return 20 * math.log10(max(abs(x), 1e-15))


# ==========================================================================
# Les surfaces de cuivre : pastilles, zones, chemins de masse
# --------------------------------------------------------------------------
# TOUT SE CHIFFRE PAR LE MEME SOLVEUR QUE LES PISTES. Une pastille est une
# capacite au plan : la capacite par metre d'une ligne de sa largeur (MoM)
# fois sa longueur, allongee a chaque bout de l'extension de bout ouvert de
# Hammerstad -- la frange que la section droite ne voit pas. La piste qui y
# entre est deja comptee par sa branche : ce morceau-la est retranche.
#
# UNE ZONE EST MAILLEE, pas reduite a un noeud : une grille de cellules, une
# capacite par cellule (surface ET bord, les deux tires de deux resolutions
# MoM), une self et une resistance de peau par lien entre cellules voisines.
# Ce qui la touche s'accroche a la cellule la plus proche.
# ==========================================================================

SIGMA_CU = 5.8e7
MU_0 = 4e-7 * math.pi
MAX_CELLULES = 30000


def _ligne(couches, couche, largeur_mm, ep_mm, cache):
    """La ligne seule de cette largeur : {c (F/m), l (H/m), z0, eps, h (m),
    er}, ou None si la section n'a pas de plan en face."""
    cle = (couche, round(largeur_mm, 5), round(ep_mm, 5))
    if cle not in cache:
        geo, info = se.section_de_couche(couches, couche, largeur_mm, ep_mm,
                                         0.0, 0.0)
        try:
            r = tl.solve_line(geo) if geo is not None else None
        except Exception:                              # noqa: BLE001
            r = None
        cache[cle] = None if not (r and r["z0"] > 0) else {
            "c": math.sqrt(r["eps_eff"]) / (tl.C_0 * r["z0"]),
            "l": r["z0"] * math.sqrt(r["eps_eff"]) / tl.C_0,
            "z0": r["z0"], "eps": r["eps_eff"], "h": info["h"],
            "er": info["er"], "tan_delta": info["tan_delta"],
            # LES OPTIONS DE PERTES DE CETTE SECTION (1.6.0) : la ligne est
            # seule face a son plan, sans masse coplanaire -- elle recoit sa
            # topologie, sa hauteur (h au plan, ou b entre plans) et la
            # rugosite de sa couche. Voir `simulation_em._geometrie_pertes`.
            "kw_pertes": dict(se._geometrie_pertes(info),
                              **se._rugosite_couche(couches, couche)),
            "ep": ep_mm}
    return cache[cle]


EPS_0 = 8.8541878128e-12


_CACHE_3D = {}


def capacite_plaque_3d(w, l, h1, h2=None, n=20, er=1.0):
    """Voir `_plaque_3d`. Le resultat ne depend que de la geometrie : il est
    garde d'un calcul a l'autre, et un « et si » ne le refait pas."""
    cle = tuple(round(v, 12) if v is not None else None
                for v in (w, l, h1, h2, er)) + (n,)
    if cle not in _CACHE_3D:
        if len(_CACHE_3D) > 2000:
            _CACHE_3D.clear()
        _CACHE_3D[cle] = _plaque_3d(w, l, h1, h2, n, er)
    return _CACHE_3D[cle]


def _plaque_3d(w, l, h1, h2, n, er):
    """C (F) d'une plaque rectangulaire w x l (m), mince, a h1 au-dessus d'un
    plan de masse -- et a h2 sous un second en triplaque --, DANS LE VIDE.

    Methode des moments en 3D : n x n panneaux a densite de charge uniforme,
    serres vers les bords (pas en cosinus : c'est la que la charge se
    concentre), plans remplaces par leurs images. Toutes les interactions
    sont EXACTES : l'integrale de 1/r sur un rectangle a une primitive,
    F = u ln(v + R) + v ln(u + R) - z atan(uv / zR).
    """
    # LE PAS SUIT AUSSI LA HAUTEUR AU PLAN : au milieu d'une plaque longue,
    # un panneau plus grand que h ne resout plus l'image. Au moins n panneaux
    # par cote, et un pas median sous h/2.
    h_min = h1 if h2 is None else min(h1, h2)

    def bords(a):
        m = int(min(120, max(n, math.ceil(math.pi * a / h_min))))
        u = (1 - np.cos(np.linspace(0, np.pi, m + 1))) / 2
        return (u - 0.5) * a
    xb, yb = bords(w), bords(l)
    x1, x2 = np.meshgrid(xb[:-1], yb[:-1], indexing="ij")
    x2_, y2 = np.meshgrid(xb[1:], yb[1:], indexing="ij")
    _, y1 = x1, np.meshgrid(xb[:-1], yb[:-1], indexing="ij")[1]
    x1, x2, y1, y2 = x1.ravel(), x2_.ravel(), y1.ravel(), y2.ravel()
    cx, cy = (x1 + x2) / 2, (y1 + y2) / 2
    aire = (x2 - x1) * (y2 - y1)

    def ln_plus(a, r, s2):
        # ln(a + R) sans perte quand a est negatif : (a + R)(R - a) = s2.
        return np.where(a >= 0, np.log(np.maximum(a + r, 1e-300)),
                        np.log(np.maximum(s2, 1e-300))
                        - np.log(np.maximum(r - a, 1e-300)))

    def prim(u, v, z):
        r = np.sqrt(u * u + v * v + z * z)
        f = u * ln_plus(v, r, u * u + z * z) + v * ln_plus(u, r, v * v + z * z)
        if z:
            f = f - z * np.arctan2(u * v, z * r)
        return f

    def noyau(dz):
        xi, yi = cx[:, None], cy[:, None]
        return (prim(x2[None, :] - xi, y2[None, :] - yi, dz)
                - prim(x1[None, :] - xi, y2[None, :] - yi, dz)
                - prim(x2[None, :] - xi, y1[None, :] - yi, dz)
                + prim(x1[None, :] - xi, y1[None, :] - yi, dz))

    k = noyau(0.0)
    if h2 is None:
        # LE STRATIFIE, EXACTEMENT (quasi-statique) : une charge posee sur un
        # dielectrique d'epaisseur h au-dessus de son plan voit une serie
        # d'images, G = 2/(1+er) sum (-K)^m [1/R(2mh) - 1/R(2(m+1)h)],
        # K = (er-1)/(er+1). Dans le vide, K = 0 : l'image seule.
        kk = (er - 1.0) / (er + 1.0)
        rho = np.sqrt((cx[:, None] - cx[None, :]) ** 2
                      + (cy[:, None] - cy[None, :]) ** 2)
        pan = max((x2 - x1).max(), (y2 - y1).max())

        def image(dz):
            if dz > 4 * pan:              # loin : le panneau vaut un point
                return aire[None, :] / np.sqrt(rho * rho + dz * dz)
            return noyau(dz)
        total, g_prec, coef, m = 0.0, k, 1.0, 0
        while True:
            g_suiv = image(2 * (m + 1) * h1)
            total = total + coef * (g_prec - g_suiv)
            m += 1
            coef *= -kk
            if abs(coef) < 1e-7 or m > 200:
                break
            g_prec = g_suiv
        k = total * 2.0 / (1.0 + er)
        images = []
    else:
        b = h1 + h2
        images = []
        for m in range(-6, 7):
            if m:
                images.append((2 * m * b, 1.0))
            images.append((2 * m * b - 2 * h1, -1.0))
    for dz, signe in images:
        k += signe * noyau(abs(dz))
    sigma = np.linalg.solve(k / (4 * np.pi * EPS_0), np.ones(len(cx)))
    return float((sigma * aire).sum())


def capacite_pastille(couches, couche, w_mm, l_mm, ep, cache):
    """C au plan d'une pastille w x l, EN FARADS, franges comprises.

    LA FORME EST RESOLUE EN 3D (`capacite_plaque_3d`) : plaque mince sur son
    stratifie -- fonction de Green exacte du dielectrique sur plan -- ou entre
    deux plans en triplaque. Ses bouts, ses coins, ses bords, tout y est.

    L'EMPILAGE REEL, lui, est celui du MoM 2D : vernis epargne, epaisseur du
    cuivre, dielectriques empiles. On etalonne donc le 3D sur la ligne
    infinie : C = C3D(w, l) x C'2D / C'3D, ou C'3D est la capacite par metre
    que le MEME modele 3D donne a une plaque tres longue (difference de deux
    longueurs, pour que les bouts s'annulent).
    """
    cle = ("pastille", couche, round(w_mm, 5), round(l_mm, 5), round(ep, 5))
    if cle in cache:
        return cache[cle]
    geo, info = se.section_de_couche(couches, couche, w_mm, ep, 0.0, 0.0)
    li = _ligne(couches, couche, w_mm, ep, cache)
    if geo is None or li is None:
        cache[cle] = None
        return None
    if geo.get("kind") == "strip":
        h1, h2, er = geo["y0"], geo["b"] - geo["y0"], 1.0
        h_min = min(h1, h2)
    else:
        h1, h2, er = info["h"], None, info["er"]
        h_min = h1
    w = w_mm * 1e-3
    cle_l = ("lineique3d", couche, round(w_mm, 5))
    if cle_l not in cache:
        l1, l2 = 6 * h_min, 12 * h_min
        c1 = capacite_plaque_3d(w, l1, h1, h2, er=er)
        c2 = capacite_plaque_3d(w, l2, h1, h2, er=er)
        cache[cle_l] = (c2 - c1) / (l2 - l1)
    c3 = capacite_plaque_3d(w, l_mm * 1e-3, h1, h2, er=er)
    cache[cle] = (c3 * li["c"] / cache[cle_l], li["eps"])
    return cache[cle]


def capacite_surface(couches, s, cache):
    """C au plan d'une pastille, EN FARADS, par `capacite_pastille`, moins
    les recouvrements de piste deja comptes par leur branche. Rend
    (C, eps_eff)."""
    couche = int(_nombre(s.get("couche"), 0))
    ep = _nombre(s.get("cuivre"), 0.035)
    w, l_ = sorted([_nombre(s.get("largeur")), _nombre(s.get("longueur"))])
    if s.get("forme") == "rond":
        w = l_ = w * math.sqrt(math.pi) / 2        # le carre de meme aire
    if not (w > 0 and l_ > 0):
        return 0.0, 0.0
    r = capacite_pastille(couches, couche, w, l_, ep, cache)
    if r is None:
        return 0.0, 0.0
    c, eps = r
    for rec in s.get("recouvrements") or []:
        lr = _ligne(couches, couche, _nombre(rec.get("largeur")), ep, cache)
        if lr:
            c -= lr["c"] * _nombre(rec.get("longueur")) * 1e-3
    return max(c, 0.0), eps


def _dans_poly(x, y, p):
    dedans = False
    n = len(p) // 2
    j = n - 1
    for i in range(n):
        xi, yi, xj, yj = p[2 * i], p[2 * i + 1], p[2 * j], p[2 * j + 1]
        if (yi > y) != (yj > y) and \
                x < (xj - xi) * (y - yi) / ((yj - yi) or 1e-300) + xi:
            dedans = not dedans
        j = i
    return dedans


def r_peau(f, ep_mm):
    """Resistance par carre du cuivre a la frequence f, en ohms.
    # ponytail: une seule face conduit (celle du plan), pas de rugosite
    """
    delta = 1.0 / math.sqrt(math.pi * f * MU_0 * SIGMA_CU)
    return 1.0 / (SIGMA_CU * min(ep_mm * 1e-3, delta))


def _poly_np(x, y, p):
    """Point dans polygone (parite), vectorise sur les points."""
    px, py = p[0::2], p[1::2]
    dedans = np.zeros(np.shape(x), dtype=bool)
    j = len(px) - 1
    for i in range(len(px)):
        xi, yi, xj, yj = px[i], py[i], px[j], py[j]
        dy = (yj - yi) or 1e-300
        dedans ^= ((yi > y) != (yj > y)) & (x < (xj - xi) * (y - yi) / dy + xi)
        j = i
    return dedans


def _croise(qx, qy, s, p):
    """Quels carres [qx, qx + s] x [qy, qy + s] un bord du polygone p
    traverse-t-il ? Liang-Barsky, vectorise sur les carres. C'est ce qui
    garde un cuivre plus etroit que l'echantillonnage d'un grand carre."""
    out = np.zeros(qx.shape, dtype=bool)
    px, py = p[0::2], p[1::2]
    n = len(px)
    for i in range(n):
        x1, y1, x2, y2 = px[i - 1], py[i - 1], px[i], py[i]
        dx, dy = x2 - x1, y2 - y1
        t0, t1 = np.zeros(qx.shape), np.ones(qx.shape)
        ok = np.ones(qx.shape, dtype=bool)
        for pp, qq in ((-dx, x1 - qx), (dx, qx + s - x1),
                       (-dy, y1 - qy), (dy, qy + s - y1)):
            if pp == 0:
                ok &= qq >= 0
                continue
            r = qq / pp
            if pp < 0:
                t0 = np.maximum(t0, r)
            else:
                t1 = np.minimum(t1, r)
        out |= ok & (t0 <= t1)
    return out


def lire_masque(m):
    """Le cuivre REMPLI d'une zone, tel que l'outil le peint : dégagements et
    liaisons thermiques compris. Une grille de pas `pas` (mm) depuis (x0, y0),
    en plages alternees vide / cuivre, rangee par rangee. Rend une fonction
    vectorisee (x, y) -> bool, ou None."""
    if not isinstance(m, dict):
        return None
    try:
        nx, ny = int(m["nx"]), int(m["ny"])
        x0, y0, pas = float(m["x0"]), float(m["y0"]), float(m["pas"])
        plages = [int(v) for v in m["plages"]]
    except (KeyError, TypeError, ValueError):
        return None
    if not (nx > 0 and ny > 0 and pas > 0) or sum(plages) != nx * ny:
        return None
    bits = np.zeros(nx * ny, dtype=bool)
    k, plein = 0, False
    for n in plages:
        if plein:
            bits[k:k + n] = True
        k += n
        plein = not plein
    bits = bits.reshape(ny, nx)

    def dedans(x, y):
        i = np.floor((np.asarray(x) - x0) / pas).astype(int)
        j = np.floor((np.asarray(y) - y0) / pas).astype(int)
        ok = (i >= 0) & (i < nx) & (j >= 0) & (j < ny)
        out = np.zeros(np.shape(i), dtype=bool)
        out[ok] = bits[j[ok], i[ok]]
        return out
    return dedans


def maillage_zone(couches, z, f_max, cache):
    """Le maillage ADAPTATIF d'une zone de cuivre, en arbre quaternaire.

    Fin pres des acces -- la moitie de la hauteur au plan --, il grossit avec
    la distance jusqu'a λ/40 a la frequence haute ; le bord du cuivre est
    raffine a la moitie de la taille visee localement, la ou le courant passe.
    Le cuivre est celui du contour, moins ses trous, et -- quand l'outil le
    donne -- restreint a son remplissage reel (`masque`).

    Les cellules sont des volumes finis : chacune porte sa capacite au plan
    (surface c_s et bord libre c_b, tires de deux resolutions MoM), chaque
    paire de cellules voisines un lien de conductance g = e / d (longueur de
    bord commune sur distance des centres), soit une admittance
    g / (R_carre(f) + jw L_carre). Rend None si la couche n'a pas de plan.
    """
    pts = np.array([_nombre(v) for v in z.get("pts") or []])
    trous = [np.array([_nombre(v) for v in t]) for t in (z.get("trous") or [])
             if len(t) >= 6]
    if len(pts) < 6:
        return None
    rempli = lire_masque(z.get("masque"))
    couche = int(_nombre(z.get("couche"), 0))
    ep = _nombre(z.get("cuivre"), 0.035)
    x0, x1 = pts[0::2].min(), pts[0::2].max()
    y0, y1 = pts[1::2].min(), pts[1::2].max()
    li = _ligne(couches, couche, 1.0, ep, cache)
    if li is None:
        return None
    h = 1e3 * li["h"]
    lam = 1e3 * tl.C_0 / (f_max * math.sqrt(li["eps"]))
    s_max = lam / 40.0
    s_min = min(s_max, max(0.02, h / 2))
    acces = [(str(a.get("noeud")), _nombre(a.get("x")), _nombre(a.get("y")))
             for a in z.get("acces") or []]
    ax = np.array([a[1] for a in acces]) if acces else np.zeros(0)
    ay = np.array([a[2] for a in acces]) if acces else np.zeros(0)

    def cuivre(x, y):
        d = _poly_np(x, y, pts)
        for t in trous:
            d &= ~_poly_np(x, y, t)
        if rempli is not None:
            d &= rempli(x, y)
        return d

    def visee(cx, cy):
        if not len(ax):
            return np.full(cx.shape, s_max)
        d = np.full(cx.shape, np.inf)
        for q in range(0, len(ax), 256):
            dd = np.hypot(cx[:, None] - ax[None, q:q + 256],
                          cy[:, None] - ay[None, q:q + 256]).min(axis=1)
            d = np.minimum(d, dd)
        return np.minimum(s_max, s_min + 0.5 * d)

    grossier = False
    for _essai in range(8):
        cote = max(x1 - x0, y1 - y0) * 1.0001
        niv_max = max(0, int(math.ceil(math.log2(cote / s_min))) + 1)
        feuilles = []                              # (niveau, ix, iy)
        niv, qi, qj = 0, np.array([0]), np.array([0])
        ech = (np.arange(5) + 0.5) / 5
        ox, oy = [a.ravel() for a in np.meshgrid(ech, ech, indexing="ij")]
        trop = False
        while len(qi):
            s = cote / (2 ** niv)
            qx, qy = x0 + qi * s, y0 + qj * s
            dans = cuivre(qx[:, None] + s * ox[None, :],
                          qy[:, None] + s * oy[None, :])
            part = dans.mean(axis=1)
            bord = _croise(qx, qy, s, pts)
            for tr in trous:
                bord |= _croise(qx, qy, s, tr)
            garde = (part > 0) | bord
            cx, cy = qx + s / 2, qy + s / 2
            cible = visee(cx, cy)
            fendre = garde & ((s > cible) | (((part < 1) | bord) & (s > np.maximum(
                s_min, cible / 2)))) & (niv < niv_max)
            # UNE CELLULE A CHEVAL SUR LE BORD est gardee avec sa FRACTION
            # de cuivre : sa capacite et sa conduction la suivent.
            feuille = garde & ~fendre & (part > 0)
            feuilles += [(niv, int(i), int(j), float(pp)) for i, j, pp in
                         zip(qi[feuille], qj[feuille], part[feuille])]
            if len(feuilles) > MAX_CELLULES:
                trop = True
                break
            fi, fj = qi[fendre], qj[fendre]
            qi = np.concatenate([2 * fi, 2 * fi + 1, 2 * fi, 2 * fi + 1])
            qj = np.concatenate([2 * fj, 2 * fj, 2 * fj + 1, 2 * fj + 1])
            niv += 1
        if not trop:
            break
        grossier = True
        s_min *= 1.5
        s_max *= 1.5
    if not feuilles:                  # plus etroite que tout : une cellule
        feuilles = [(0, 0, 0, 1.0)]
        cote = max(x1 - x0, y1 - y0, 1e-3)
        niv_max = 0
    # LES VOISINAGES, entre cellules de tailles differentes : en unites de la
    # grille la plus fine, on longe le bord droit et le bord haut de chaque
    # cellule, et l'on demande quelle cellule est de l'autre cote.
    unite = cote / (2 ** niv_max)
    par_cle = {}
    fx, fy, fk = [], [], []
    for n_, (lv, i, j, _p) in enumerate(feuilles):
        k = 2 ** (niv_max - lv)
        par_cle[(lv, i, j)] = n_
        fx.append(i * k)
        fy.append(j * k)
        fk.append(k)
    niveaux = sorted(set(f[0] for f in feuilles))
    frac = np.array([f[3] for f in feuilles])

    def trouve(xu, yu):
        for lv in niveaux:
            d = niv_max - lv
            n_ = par_cle.get((lv, xu >> d, yu >> d))
            if n_ is not None:
                return n_
        return None
    # Pour chaque lien : les deux cellules, la longueur de bord commune e,
    # la distance des centres d, et le sens (horizontal ou vertical). Chaque
    # cellule garde, cote par cote, la part de son bord partagee.
    ia, ib, le, ld, lh = [], [], [], [], []
    n_f = len(feuilles)
    sh = {"d": np.zeros(n_f), "g": np.zeros(n_f), "h": np.zeros(n_f),
          "b": np.zeros(n_f)}
    for a in range(n_f):
        xa, ya, ka = fx[a], fy[a], fk[a]
        for droite in (True, False):
            pos = ya if droite else xa
            fin = pos + ka
            while pos < fin:
                b = trouve(xa + ka, pos) if droite else trouve(pos, ya + ka)
                if b is None:
                    pos += 1
                    continue
                debut_b = fy[b] if droite else fx[b]
                bout = min(fin, debut_b + fk[b])
                e = bout - pos
                ia.append(a)
                ib.append(b)
                le.append(e)
                ld.append((ka + fk[b]) / 2.0)
                lh.append(droite)
                if droite:
                    sh["d"][a] += e
                    sh["g"][b] += e
                else:
                    sh["h"][a] += e
                    sh["b"][b] += e
                pos = bout
    fx, fy, fk = np.array(fx), np.array(fy), np.array(fk)
    cote_mm = fk * unite
    cx = x0 + (fx + fk / 2.0) * unite
    cy = y0 + (fy + fk / 2.0) * unite
    # SURFACE ET BORD, par MoM : c_s d'un cuivre tres large (10 h et 20 h),
    # c_b la frange d'un bord libre -- dans le stratifie, et dans le vide.
    w1, w2 = 10 * h, 20 * h
    l1 = _ligne(couches, couche, w1, ep, cache)
    l2 = _ligne(couches, couche, w2, ep, cache)

    def s_b(c1, c2):
        cs = (c2 - c1) / ((w2 - w1) * 1e-3)
        return cs, max((c1 - cs * w1 * 1e-3) / 2, 0.0)
    c_s, c_b = s_b(l1["c"], l2["c"])
    c_sa, c_ba = s_b(l1["c"] / l1["eps"], l2["c"] / l2["eps"])
    partage = sh["d"] + sh["g"] + sh["h"] + sh["b"]
    libre = np.maximum(4 * fk - partage, 0) * unite
    c_cel = c_s * frac * (cote_mm * 1e-3) ** 2 + c_b * libre * 1e-3
    # LA SELF DE CHAQUE LIEN, PAR DUALITE : en quasi-TEM, L' = mu0 eps0 /
    # C'_vide. Chaque lien porte une « rangee » de cuivre, de largeur e : sa
    # capacite dans le vide par metre est sa surface, plus la frange des bords
    # LIBRES paralleles au courant. Des rangees en parallele redonnent
    # exactement L' = mu0 eps0 / C'_vide(W) d'un ruban : la frange -- qui fait
    # toute la self d'un cuivre etroit -- est comptee, la ou le courant
    # s'entasse, sur ses bords.
    ia, ib = np.array(ia, dtype=int), np.array(ib, dtype=int)
    le, ld, lh = np.array(le, float), np.array(ld, float), np.array(lh, bool)
    k_a, k_b = fk[ia].astype(float), fk[ib].astype(float)
    libres_a = np.where(lh, (2 * k_a - sh["h"][ia] - sh["b"][ia]) / k_a,
                        (2 * k_a - sh["d"][ia] - sh["g"][ia]) / k_a)
    libres_b = np.where(lh, (2 * k_b - sh["h"][ib] - sh["b"][ib]) / k_b,
                        (2 * k_b - sh["d"][ib] - sh["g"][ib]) / k_b)
    n_bords = np.clip(0.5 * (libres_a + libres_b), 0, 2)
    e_mm = le * unite * np.minimum(frac[ia], frac[ib]) if len(ia) else le
    d_mm = ld * unite
    c_rangee = c_sa * e_mm * 1e-3 + c_ba * n_bords
    l_lien = MU_0 * EPS_0 * d_mm * 1e-3 / np.maximum(c_rangee, 1e-30)
    r_lien = d_mm / np.maximum(e_mm, 1e-12)        # x R par carre(f)
    ou = []
    for nom, px_, py_ in acces:
        xu = int(math.floor((px_ - x0) / unite))
        yu = int(math.floor((py_ - y0) / unite))
        n_ = trouve(xu, yu) if 0 <= xu and 0 <= yu else None
        if n_ is None:
            n_ = int(np.argmin((cx - px_) ** 2 + (cy - py_) ** 2))
        ou.append((nom, n_))
    return {"cx": cx, "cy": cy, "c": c_cel, "aire": frac * cote_mm ** 2,
            "ia": ia, "ib": ib, "l_lien": l_lien, "r_lien": r_lien,
            "ep": ep, "acces": ou,
            "grossier": grossier, "pas_min": float(cote_mm.min()),
            "pas_max": float(cote_mm.max()), "lam": lam}


# ==========================================================================
# Le domaine de validite
# --------------------------------------------------------------------------
# CE SIMULATEUR EST QUASI-STATIQUE -- sections en 2D, pastilles en 3D,
# dispersion de Getsinger par-dessus. Il ne voit ni les modes superieurs, ni
# les ondes de surface, ni le rayonnement : cela demande un solveur pleine
# onde. Ce qu'il PEUT faire, c'est dire ou il cesse d'etre valable, a partir
# de la geometrie meme qu'il resout, et le dire des que la bande le depasse.
# ==========================================================================

def _largeur_equivalente(couches, couche, w, ep, cache):
    """La largeur du condensateur plan qui a la capacite MoM de la section
    (mm), et la permittivite du stratifie : de quoi placer le premier mode
    superieur d'une ligne."""
    geo, info = se.section_de_couche(couches, couche, w, ep, 0.0, 0.0)
    li = _ligne(couches, couche, w, ep, cache)
    if geo is None or li is None:
        return None, None
    inv_h = (1 / geo["y0"] + 1 / (geo["b"] - geo["y0"])
             if geo.get("kind") == "strip" else 1 / info["h"])
    return 1e3 * li["c"] / (EPS_0 * info["er"] * inv_h), info


def domaine_validite(couches, doc, cache, f_fin):
    """Les frequences ou le modele quasi-statique cesse de valoir, par cause.

    - le PREMIER MODE SUPERIEUR d'une piste : c0 / (2 W_eff rac(er)), W_eff
      la largeur equivalente tiree de la capacite MoM ;
    - la RESONANCE PROPRE d'une pastille (au-dela, ce n'est plus une
      capacite) : c0 / (2 L_eff rac(eps_eff)), L_eff sa longueur allongee de
      ses franges ;
    - le COUPLAGE FORT AUX ONDES DE SURFACE d'un stratifie en microruban
      (Bahl et Trivedi) : c0 atan(er) / (rac(2) pi h rac(er - 1)), et la
      coupure du mode TE1, c0 / (4 h rac(er - 1)) ;
    - le RAYONNEMENT des discontinuites, qui croit comme (k0 h)^2 : on rend
      k0 h a la frequence haute, et la frequence ou il atteint 0,1.
    """
    c0 = tl.C_0
    limites, vus = [], set()
    for br in doc.get("branches") or []:
        for o in br.get("objets") or []:
            couche = int(_nombre(o.get("layer"), 0))
            w = round(_nombre(o.get("width")), 4)
            ep = _nombre(o.get("copper_thickness"), 0.035)
            if (couche, w) in vus or not w > 0:
                continue
            vus.add((couche, w))
            w_eff, info = _largeur_equivalente(couches, couche, w, ep, cache)
            if not w_eff:
                continue
            limites.append({"cause": "mode supérieur", "net": br.get("net"),
                            "detail": "piste de %.3g mm" % w,
                            "f": c0 / (2 * w_eff * 1e-3
                                       * math.sqrt(info["er"]))})
            if info.get("topo") == "micro" and ("sw", couche) not in vus:
                vus.add(("sw", couche))
                h, er = info["h"], info["er"]
                nom = se._nom_de_couche(couches, couche) or couche
                if er > 1.0001:
                    limites.append({
                        "cause": "ondes de surface", "net": "",
                        "detail": "stratifié sous %s (h %.3g mm, εr %.3g)"
                                  % (nom, 1e3 * h, er),
                        "f": c0 * math.atan(er)
                        / (math.sqrt(2) * math.pi * h * math.sqrt(er - 1))})
                    limites.append({
                        "cause": "mode TE1 du stratifié", "net": "",
                        "detail": "sous %s" % nom,
                        "f": c0 / (4 * h * math.sqrt(er - 1))})
                limites.append({
                    "cause": "rayonnement", "net": "",
                    "detail": "discontinuités sur %s : (k0 h)² = 1 %%" % nom,
                    "f": 0.1 * c0 / (2 * math.pi * h)})
    for s in doc.get("pastilles") or []:
        couche = int(_nombre(s.get("couche"), 0))
        cote = max(_nombre(s.get("largeur")), _nombre(s.get("longueur")))
        li = _ligne(couches, couche, max(min(_nombre(s.get("largeur")),
                                             _nombre(s.get("longueur"))), 0.01),
                    _nombre(s.get("cuivre"), 0.035), cache)
        if li and cote > 0:
            l_eff = cote * 1e-3 + 2 * 0.4 * li["h"]
            limites.append({"cause": "résonance de pastille",
                            "net": str(s.get("noeud") or ""),
                            "detail": "%.3g mm" % cote,
                            "f": c0 / (2 * l_eff * math.sqrt(li["eps"]))})
    limites.sort(key=lambda d: d["f"])
    for d in limites:
        d["f"] = float(d["f"])
    f_ok = limites[0]["f"] if limites else float("inf")
    k0h = max([2 * math.pi * f_fin / c0 * 1e-3 * _nombre(
        (se.section_de_couche(couches, int(_nombre(o.get("layer"), 0)),
                              max(_nombre(o.get("width")), 0.01), 0.035,
                              0.0, 0.0)[1] or {}).get("h", 0) * 1e3)
        for br in doc.get("branches") or []
        for o in (br.get("objets") or [])[:1]] or [0.0])
    return {"f_max": f_ok, "limites": limites[:8], "k0h": k0h}


def admittance_masse(couches, g, freqs, cache):
    """L'admittance de la broche a la masse, par frequence : les vias sous la
    pastille (mutuelles comprises), et chaque chemin piste + via en parallele.
    La piste de masse est une ligne au-dessus de son plan : sa self et sa
    resistance de peau par le meme solveur que le reste."""
    couche = int(_nombre(g.get("couche"), 0))
    vias = g.get("vias") or []
    directs = [v for v in vias if not v.get("piste")]
    l_dir = inductance_masse(couches, couche, directs) if directs else 0.0
    chemins = []
    for v in vias:
        p = v.get("piste")
        if not p:
            continue
        lv = inductance_masse(couches, couche, [v])
        li = _ligne(couches, int(_nombre(p.get("couche"), couche)),
                    _nombre(p.get("largeur"), 0.3), _nombre(p.get("cuivre"),
                                                            0.035), cache)
        lg = _nombre(p.get("longueur")) * 1e-3
        chemins.append((lv, li, lg, _nombre(p.get("largeur"), 0.3)))
    ys = []
    for f in freqs:
        w = 2 * math.pi * f
        y = 1.0 / (1j * w * l_dir) if l_dir > 0 else 0.0
        for lv, li, lg, larg in chemins:
            z = 1j * w * lv
            if li:
                a_c, _ = tl.line_losses(li["z0"], li["eps"], larg * 1e-3,
                                        li["er"], 0.0, f, li["ep"] * 1e-3,
                                        **li["kw_pertes"])
                z += (2 * a_c * li["z0"] + 1j * w * li["l"]) * lg
            y += 1.0 / z
        ys.append(y)
    return ys


# ==========================================================================
# Le couplage entre les pistes du reseau
# --------------------------------------------------------------------------
# DES PISTES DU RESEAU QUI SE LONGENT NE SONT PAS DES LIGNES SEPAREES, mais
# UNE ligne a N conducteurs. On les trouve sur la geometrie -- meme couche,
# paralleles a 15 degres pres, a moins de trois hauteurs au plan de cuivre a
# cuivre (la regle des 3H) --, on les range en GROUPES (les composantes
# connexes de ce voisinage : trois pistes cote a cote en font un), on decoupe
# chaque groupe en intervalles le long de son axe, et chaque intervalle ou
# plusieurs conducteurs sont presents devient une ligne couplee a 2N ports :
# [L] et [C] par `ligne_mom.solve_multiline`, les pertes du cuivre (effet de
# peau, `line_losses`) et du dielectrique, et la matrice de chaine par la
# decomposition propre des equations des telegraphistes.
#
# LES BORDS DE CHAQUE MORCEAU COUPLE PORTENT UN RACCORD d'un micron, copie de
# son bout : il repart avec la chaine voisine dans `simulation_em.simuler`, et
# le coude ou le via qui est la y est compte par le modele de toujours.
# ==========================================================================

COUPLAGE_HAUTEURS = 3.0
RACCORD = 1e-3                    # mm : le raccord qui porte coude et via


def _bouts(o):
    a, b = o.get("start") or [0, 0], o.get("end") or [0, 0]
    return ((_nombre(a[0]), _nombre(a[1])), (_nombre(b[0]), _nombre(b[1])))


def _droit(o):
    """Un arc part en corde avec sa longueur de cuivre : on ne le couple pas.
    Les pages envoient les arcs en facettes, donc droites a leur echelle."""
    (ax, ay), (bx, by) = _bouts(o)
    corde = math.hypot(bx - ax, by - ay)
    lg = _nombre(o.get("length"), corde) or corde
    return corde > 1e-6 and abs(lg - corde) <= 0.02 * corde


def _h_mm(couches, o, cache):
    li = _ligne(couches, int(_nombre(o.get("layer"), 0)),
                _nombre(o.get("width")),
                _nombre(o.get("copper_thickness"), 0.035), cache)
    return 1e3 * li["h"] if li else 0.0


def groupes_couples(couches, branches, cache):
    """Les sections couplees : [{membres: [(b, k, lat)], t1, t2, axe}], et
    pour chaque troncon concerne ses coupes et le role de chaque morceau."""
    objs = [(b, k, o) for b, br in enumerate(branches)
            for k, o in enumerate(br.get("objets") or []) if _droit(o)]
    geo = []
    for b, k, o in objs:
        (ax, ay), (bx, by) = _bouts(o)
        lg = math.hypot(bx - ax, by - ay)
        geo.append(((ax, ay), ((bx - ax) / lg, (by - ay) / lg), lg))
    sin_max = math.sin(math.radians(se.ANGLE_PARALLELE))
    voisins = dict((i, set()) for i in range(len(objs)))
    for i, (b, k, o) in enumerate(objs):
        (a_, u, lg) = geo[i]
        h = _h_mm(couches, o, cache)
        if not h:
            continue
        for j in range(i + 1, len(objs)):
            b2, k2, o2 = objs[j]
            if (b2 == b and abs(k2 - k) <= 1) or \
                    int(_nombre(o2.get("layer"), 0)) != \
                    int(_nombre(o.get("layer"), 0)):
                continue
            (c_, v, lg2) = geo[j]
            if abs(u[0] * v[1] - u[1] * v[0]) > sin_max:
                continue
            (dx, dy) = (c_[0] + v[0] * lg2, c_[1] + v[1] * lg2)
            lat = 0.5 * (((c_[0] - a_[0]) * -u[1] + (c_[1] - a_[1]) * u[0])
                         + ((dx - a_[0]) * -u[1] + (dy - a_[1]) * u[0]))
            ecart = abs(lat) - 0.5 * (_nombre(o.get("width"))
                                      + _nombre(o2.get("width")))
            if ecart <= 0.01 or ecart > COUPLAGE_HAUTEURS * h:
                continue
            pc = (c_[0] - a_[0]) * u[0] + (c_[1] - a_[1]) * u[1]
            pd = (dx - a_[0]) * u[0] + (dy - a_[1]) * u[1]
            if min(lg, max(pc, pd)) - max(0.0, min(pc, pd)) \
                    < se.RECOUVREMENT_MIN:
                continue
            voisins[i].add(j)
            voisins[j].add(i)
    # Les groupes : composantes connexes du voisinage.
    vus, sections, coupes = set(), [], {}
    for i0 in range(len(objs)):
        if i0 in vus or not voisins[i0]:
            continue
        pile, groupe = [i0], []
        vus.add(i0)
        while pile:
            i = pile.pop()
            groupe.append(i)
            for j in voisins[i]:
                if j not in vus:
                    vus.add(j)
                    pile.append(j)
        a_, u, _ = geo[groupe[0]]
        n_ = (-u[1], u[0])
        proj = {}
        for i in groupe:
            (s, d, lg) = geo[i]
            e = (s[0] + d[0] * lg, s[1] + d[1] * lg)
            ta = (s[0] - a_[0]) * u[0] + (s[1] - a_[1]) * u[1]
            tb = (e[0] - a_[0]) * u[0] + (e[1] - a_[1]) * u[1]
            la = (s[0] - a_[0]) * n_[0] + (s[1] - a_[1]) * n_[1]
            lb = (e[0] - a_[0]) * n_[0] + (e[1] - a_[1]) * n_[1]
            proj[i] = (ta, tb, la, lb)
        ts = sorted(set(round(t, 6) for i in groupe for t in proj[i][:2]))
        # DEUX PISTES PRESQUE PARALLELES N'ONT PAS UN ECART, elles en ont un
        # par abscisse. On recoupe chaque intervalle tant que l'ecart de deux
        # membres presents y varie de plus de 5 % (ou de 10 microns) : chaque
        # morceau est alors une section droite a son propre ecart.
        fins = []
        for t1, t2 in zip(ts, ts[1:]):
            lat = lambda i, t: proj[i][2] + (proj[i][3] - proj[i][2]) * \
                (t - proj[i][0]) / ((proj[i][1] - proj[i][0]) or 1e-300)
            pres = [i for i in groupe
                    if min(proj[i][:2]) <= t1 + 1e-6
                    and max(proj[i][:2]) >= t2 - 1e-6]
            decoupe = 1
            for a_i, b_i in zip(pres, pres[1:]):
                e1 = abs(lat(b_i, t1) - lat(a_i, t1))
                e2 = abs(lat(b_i, t2) - lat(a_i, t2))
                tol = max(0.01, 0.05 * min(e1, e2))
                decoupe = max(decoupe, int(math.ceil(abs(e2 - e1) / tol)))
            decoupe = min(decoupe, 40)
            fins += [round(t1 + (t2 - t1) * q / decoupe, 6)
                     for q in range(decoupe)]
        ts = sorted(set(fins + ts[-1:]))
        for t1, t2 in zip(ts, ts[1:]):
            if t2 - t1 < 1e-4:
                continue
            tm = 0.5 * (t1 + t2)
            present = []
            for i in groupe:
                ta, tb, la, lb = proj[i]
                if min(ta, tb) <= t1 + 1e-6 and max(ta, tb) >= t2 - 1e-6:
                    lat = la + (lb - la) * (tm - ta) / ((tb - ta) or 1e-300)
                    present.append((lat, i))
            present.sort()
            # Des amas, coupes la ou deux voisins s'ecartent de plus de 3H.
            amas, cour = [], present[:1]
            for (l0, i0_), (l1, i1) in zip(present, present[1:]):
                w0 = _nombre(objs[i0_][2].get("width"))
                w1_ = _nombre(objs[i1][2].get("width"))
                h = _h_mm(couches, objs[i1][2], cache)
                if (l1 - l0) - 0.5 * (w0 + w1_) > COUPLAGE_HAUTEURS * h:
                    amas.append(cour)
                    cour = []
                cour.append((l1, i1))
            amas.append(cour)
            for am in amas:
                for part in range(0, len(am), tl.MAX_CONDUCTEURS):
                    morceau = am[part:part + tl.MAX_CONDUCTEURS]
                    if len(morceau) < 2:
                        continue
                    sid = len(sections)
                    sections.append({"membres": [], "t1": t1, "t2": t2})
                    for rang, (lat, i) in enumerate(morceau):
                        ta, tb = proj[i][:2]
                        f1 = (t1 - ta) / (tb - ta)
                        f2 = (t2 - ta) / (tb - ta)
                        sens = tb > ta
                        sections[sid]["membres"].append(
                            {"obj": objs[i][:2], "lat": lat, "sens": sens})
                        coupes.setdefault(objs[i][:2], []).append(
                            (min(f1, f2), max(f1, f2), sid, rang))
        # Les autres intervalles de chaque membre sont de simples morceaux :
        # on coupe aussi a leurs bornes, pour que tout tombe juste.
        for i in groupe:
            ta, tb = proj[i][:2]
            lst = coupes.setdefault(objs[i][:2], [])
            for t in ts:
                f = (t - ta) / (tb - ta)
                if 1e-9 < f < 1 - 1e-9:
                    lst.append((f, f, None, None))
    return sections, coupes


def _morceau(o, a, b):
    """Le morceau [a, b] (mm depuis le debut) d'un troncon droit."""
    (ax, ay), (bx, by) = _bouts(o)
    lg = math.hypot(bx - ax, by - ay)
    m = dict(o)
    m["start"] = [ax + (bx - ax) * a / lg, ay + (by - ay) * a / lg]
    m["end"] = [ax + (bx - ax) * b / lg, ay + (by - ay) * b / lg]
    m["length"] = b - a
    if a > 1e-9:
        m.pop("via", None)          # le via est au debut du troncon d'origine
    return m


def _decouper(branches, coupes):
    """Chaque branche -> une suite d'elements : ("chaine", [objets]) ou
    ("couple", section, rang, morceau), raccords de bord compris."""
    suites = []
    for b, br in enumerate(branches):
        suite, chaine = [], []
        for k, o in enumerate(br.get("objets") or []):
            cs = coupes.get((b, k))
            if not cs:
                chaine.append(o)
                continue
            (ax, ay), (bx, by) = _bouts(o)
            lg = math.hypot(bx - ax, by - ay)
            fr = sorted(set([0.0, 1.0] + [c[0] for c in cs] + [c[1] for c in cs]))
            role = dict(((round(c[0], 9), round(c[1], 9)), (c[2], c[3]))
                        for c in cs if c[2] is not None)
            for f1, f2 in zip(fr, fr[1:]):
                if (f2 - f1) * lg < 1e-4:
                    continue
                p = _morceau(o, f1 * lg, f2 * lg)
                r = role.get((round(f1, 9), round(f2, 9)))
                if r is None:
                    chaine.append(p)
                else:
                    if chaine:
                        suite.append(("chaine", chaine))
                    chaine = []
                    suite.append(("couple", r[0], r[1], p))
        if chaine:
            suite.append(("chaine", chaine))
        # LES RACCORDS : un micron de chaque morceau couple, rendu a la chaine
        # voisine, pour que le coude ou le via du bord y soit compte.
        def tete(p):
            m = _morceau(p, 0.0, min(RACCORD, p["length"] / 4))
            m["raccord"] = True
            return m

        def queue(p):
            m = _morceau(p, p["length"] - min(RACCORD, p["length"] / 4),
                         p["length"])
            m["raccord"] = True
            return m
        final = []
        for e, el in enumerate(suite):
            prec = final[-1] if final else None
            if el[0] == "couple" and prec is not None:
                if prec[0] == "chaine":
                    prec[1].append(tete(el[3]))
                else:
                    final.append(("chaine", [queue(prec[3]), tete(el[3])]))
            if el[0] == "chaine" and prec is not None and prec[0] == "couple":
                el = ("chaine", [queue(prec[3])] + list(el[1]))
            final.append(el)
        suites.append(final)
    return suites


def phi_mtl(l_m, c_m, r_par_f, tan_delta, longueur_m, freqs):
    """`l_m` et `c_m` sont une matrice, ou une LISTE par frequence quand la
    section est dispersive ; `tan_delta` un nombre, ou une liste par
    frequence quand le dielectrique est causal."""
    return [_phi_un(l_m[k] if isinstance(l_m, list) else l_m,
                    c_m[k] if isinstance(c_m, list) else c_m,
                    r_par_f[k],
                    tan_delta[k] if isinstance(tan_delta, list) else tan_delta,
                    longueur_m, f)
            for k, f in enumerate(freqs)]


def _phi_un(l_m, c_m, r, tan_delta, longueur_m, f):
    """La matrice de chaine 2N x 2N [V(L), I(L)] = Phi [V(0), I(0)] d'un
    troncon a N conducteurs, pertes comprises, par frequence.

    dV/dz = -Z I, dI/dz = -Y V, Z = R + jwL, Y = jwC (1 - j tan d) : Phi est
    l'exponentielle de [[0, -Z], [-Y, 0]] L, prise par ses valeurs propres.
    """
    n = l_m.shape[0]
    w = 2 * math.pi * f
    z = np.diag(r) + 1j * w * l_m
    y = 1j * w * c_m * complex(1.0, -tan_delta)
    m = np.zeros((2 * n, 2 * n), dtype=complex)
    m[:n, n:] = -z
    m[n:, :n] = -y
    return _expm(m * longueur_m)


def dispersion_modale(l_m, c_m, er, h_m, freqs):
    """[L](f) et [C](f) d'un microruban couple : Getsinger MODE PAR MODE.

    La base modale symetrique (`crosstalk._modes_mtl`) diagonalise les deux
    matrices ensemble : T^-1 L T^-T = I, T^T C T = diag(lambda), et
    eps_mode = c0^2 lambda. Chaque mode recoit l'eps_eff(f) et le Z(f) de
    Getsinger -- exactement ce que `simuler` applique a une ligne seule --, sa
    self et sa capacite modales sont remises a l'echelle en consequence :
    L x C suit eps(f), racine(L / C) suit Z(f).
    """
    import crosstalk as xt
    t_m, _w, racines = xt._modes_mtl(l_m, c_m)
    lam = racines ** 2
    eps = (tl.C_0 ** 2) * lam
    zmod = [math.sqrt(float(t_m[:, i] @ l_m @ t_m[:, i])
                      / float(t_m[:, i] @ c_m @ t_m[:, i]))
            for i in range(len(lam))]
    ti = np.linalg.inv(t_m)
    ls, cs = [], []
    for f in freqs:
        a_, b_ = [], []
        for i in range(len(lam)):
            eps_f, z_f = tl.dispersion_getsinger(zmod[i], eps[i], er, h_m, f)
            r = eps_f / eps[i]
            q = z_f / zmod[i]
            a_.append(q * math.sqrt(r))
            b_.append(math.sqrt(r) / q)
        ls.append(t_m @ np.diag(a_) @ t_m.T)
        cs.append(ti.T @ np.diag(lam * np.array(b_)) @ ti)
    return ls, cs


def _expm(a):
    """exp(A) par Pade (6, 6) avec mise a l'echelle et elevations au carre.

    PAS PAR LES VALEURS PROPRES : en triplaque, milieu homogene, tous les
    modes vont a la meme vitesse et la base propre devient mal conditionnee.
    """
    norme = np.linalg.norm(a, 1)
    s = max(0, int(math.ceil(math.log2(norme / 0.5)))) if norme > 0.5 else 0
    a = a / (2.0 ** s)
    c = [1.0, 0.5, 5.0 / 44, 1.0 / 66, 1.0 / 792, 1.0 / 15840,
         1.0 / 665280]
    ident = np.eye(a.shape[0], dtype=complex)
    x = a
    num = ident + c[1] * a
    den = ident - c[1] * a
    for k in range(2, 7):
        x = a @ x
        num = num + c[k] * x
        den = den + (c[k] if k % 2 == 0 else -c[k]) * x
    e = np.linalg.solve(den, num)
    for _ in range(s):
        e = e @ e
    return e


def y_section(couches, section, objs, freqs, cache, opts=None):
    """Le 2N-ports d'une section couplee, bornes [proches..., lointaines...]
    dans l'ordre lateral, et sa fiche.

    `opts` (`simulation_em.options_modele`) : avec le dielectrique causal,
    [C](f) suit er(f) a remplissage constant -- C0 + (C - C0)(er(f) - 1)/
    (er - 1), la meme approximation que la ligne seule -- et tan delta(f) la
    fiche prolongee. Les pertes du cuivre prennent la topologie et la
    rugosite de la couche, pas la hauteur : la section est couplee."""
    membres = section["membres"]
    o0 = objs[0]
    couche = int(_nombre(o0.get("layer"), 0))
    ep = _nombre(o0.get("copper_thickness"), 0.035)
    # LA MASSE COPLANAIRE AUTOUR DU GROUPE, cote par cote. Gauche et droite
    # d'un troncon se lisent dans son sens de parcours ; l'axe lateral du
    # groupe est a gauche de son axe : un membre parcouru a l'envers les
    # echange.
    cote = lambda m, o, gauche: se._ecarts(o)[0 if gauche == m["sens"] else 1]
    e_bas = cote(membres[0], objs[0], False)
    e_haut = cote(membres[-1], objs[-1], True)
    geo, info = se.section_de_couche(couches, couche,
                                     _nombre(o0.get("width")), ep,
                                     e_bas, e_haut)
    if geo is None:
        return None
    geo = dict(geo)
    geo["conducteurs"] = [{"w": _nombre(o.get("width")) * 1e-3,
                           "x": m["lat"] * 1e-3}
                          for m, o in zip(membres, objs)]
    r = tl.solve_multiline(geo)
    ordre = [r["ordre"].index(q) for q in range(len(membres))]
    l_m = np.asarray(r["l"])[np.ix_(ordre, ordre)]
    c_m = np.asarray(r["c"])[np.ix_(ordre, ordre)]
    lignes = [r["lignes"][q] for q in ordre]
    tan_d = _nombre(info.get("tan_delta"), 0.0)
    kw = dict(se._geometrie_pertes(info, couple=True),
              **se._rugosite_couche(couches, couche))
    r_f = []
    for f in freqs:
        r_f.append([2 * tl.line_losses(li["z0"], li["eps_eff"],
                                       _nombre(o.get("width")) * 1e-3,
                                       info["er"], 0.0, f, ep * 1e-3, **kw)[0]
                    * li["z0"] for li, o in zip(lignes, objs)])
    lg = (section["t2"] - section["t1"]) * 1e-3
    ys = []
    n = len(membres)
    # LA DISPERSION DU MICRORUBAN, comme sur les branches ; la triplaque,
    # noyee dans un milieu homogene, n'en a pas.
    l_f, c_f = (dispersion_modale(l_m, c_m, info["er"], info["h"], freqs)
                if info.get("topo") == "micro" else (l_m, c_m))
    # LE DIELECTRIQUE CAUSAL : la part dielectrique de [C] suit er(f), et
    # tan delta(f) la fiche. Rien ne bouge sans l'option.
    er = _nombre(info.get("er"), 1.0)
    if (opts or {}).get("causal") and er > 1.0 and tan_d > 0:
        c0_m = np.asarray(r["c0"])[np.ix_(ordre, ordre)]
        tds = []
        cs = []
        for k, f in enumerate(freqs):
            er_f, td_f = se._dielectrique(er, tan_d, f, opts)
            c_k = c_f[k] if isinstance(c_f, list) else c_f
            cs.append(c0_m + (c_k - c0_m) * ((er_f - 1.0) / (er - 1.0)))
            tds.append(td_f)
        c_f, tan_d = cs, tds
    for p in phi_mtl(l_f, c_f, r_f, tan_d, lg, freqs):
        a_, b_, c_, d_ = p[:n, :n], p[:n, n:], p[n:, :n], p[n:, n:]
        bi = np.linalg.inv(b_)
        ys.append(np.block([[-bi @ a_, bi], [d_ @ bi @ a_ - c_, -d_ @ bi]]))
    kb = 0.0
    for i in range(n):
        for j in range(i + 1, n):
            kc = -c_m[i, j] / math.sqrt(c_m[i, i] * c_m[j, j])
            kl = l_m[i, j] / math.sqrt(l_m[i, i] * l_m[j, j])
            kb = max(kb, 0.25 * (kl + kc))
    return ys, {"kb": kb, "z0": [li["z0"] for li in lignes]}


# ==========================================================================
# Le couplage magnetique des selfs
# --------------------------------------------------------------------------
# DEUX SELFS CMS COTE A COTE SE PARLENT, et une self parle aux pistes qui
# passent sous son flanc. Chaque self est un SOLENOIDE : son axe va d'une
# pastille a l'autre (c'est une self bobinee CMS, LQW et consoeurs), son
# diametre est 70 % de la largeur du boitier -- tiree de la pastille --, sa
# longueur 60 % de l'entraxe, son centre a mi-hauteur du boitier au-dessus du
# cuivre. On le decoupe en six spires-filaments de N/6 tours, plus le courant
# qui avance le long de l'axe. N se tire de la self du modele par Wheeler,
# L = mu0 N^2 pi r^2 / (l + 0,9 r) : la mutuelle ne depend donc que de la
# geometrie et des selfs, pas d'un nombre de tours qu'on ne connait pas.
#
# LES MUTUELLES SONT DE NEUMANN, M = mu0/4pi SS dl.dl'/r, par Gauss-Legendre
# sur des segments, AVEC L'IMAGE dans le plan de reference : le plan
# conducteur renverse les courants horizontaux de l'image, et c'est lui qui
# ferme la boucle d'une piste. Une self et une piste d'une autre face, ou
# d'une couche interne sous le plan, ne se voient pas.
#
# LE SENS D'ENROULEMENT n'est pas sur le dessin. Il ne change rien entre deux
# selfs de la meme serie (le signe se compense) ; entre une self et une piste,
# on le prend DROIT, et la fiche le dit.
# ==========================================================================

BOBINE_SPIRES = 6
BOBINE_COTES = 12
COUPLAGE_BOBINES_MM = 6.0      # entraxe au-dela duquel deux selfs sont seules
COUPLAGE_PISTE_MM = 3.0        # piste au-dela de laquelle une self est seule
_GL_X, _GL_W = (np.polynomial.legendre.leggauss(6) if ERREUR_RF is None
                else (None, None))


def _neumann(pa, qa, wa, pb, qb, wb):
    """La mutuelle (H) entre deux familles de segments P -> Q (m), chaque
    segment pondere par le courant qu'il porte."""
    if not len(pa) or not len(pb):
        return 0.0
    t = 0.5 * (_GL_X + 1.0)
    w = 0.5 * _GL_W
    total = 0.0
    for i0 in range(0, len(pa), 64):         # par paquets : la memoire reste bornee
        sa, ea = pa[i0:i0 + 64], qa[i0:i0 + 64]
        ra = sa[:, None, :] + t[None, :, None] * (ea - sa)[:, None, :]
        rb = pb[:, None, :] + t[None, :, None] * (qb - pb)[:, None, :]
        d = ra[:, None, :, None, :] - rb[None, :, None, :, :]
        inv = 1.0 / np.maximum(np.sqrt((d * d).sum(-1)), 1e-9)
        integ = (inv * w[None, None, :, None] * w[None, None, None, :]).sum((2, 3))
        dot = (ea - sa) @ (qb - pb).T
        total += float((wa[i0:i0 + 64, None] * wb[None, :] * dot * integ).sum())
    return 1e-7 * total


def _image(seg):
    """L'image dans le plan z = 0 : miroir, courant horizontal renverse."""
    p, q, w = seg
    m = np.array([1.0, 1.0, -1.0])
    return p * m, q * m, -w


def bobine(couches, geo, l_h, cache):
    """Les segments d'une self CMS (m, plan de reference en z = 0), ou None.
    `geo` : pastilles x0, y0 -> x1, y1 (mm), largeur, couche."""
    x0, y0 = _nombre(geo.get("x0")), _nombre(geo.get("y0"))
    x1, y1 = _nombre(geo.get("x1")), _nombre(geo.get("y1"))
    entraxe = math.hypot(x1 - x0, y1 - y0)
    larg = min(max(_nombre(geo.get("largeur"), 0.5), 0.2), 3.0)
    couche = int(_nombre(geo.get("couche"), 0))
    li = _ligne(couches, couche, larg, 0.035, cache)
    if not (entraxe > 0.1 and l_h > 0 and li):
        return None
    ux, uy = (x1 - x0) / entraxe, (y1 - y0) / entraxe
    u = np.array([ux, uy, 0.0])
    nrm = np.array([-uy, ux, 0.0])
    z = np.array([0.0, 0.0, 1.0])
    r = 0.35 * larg * 1e-3
    lc = 0.6 * entraxe * 1e-3
    c = np.array([0.5 * (x0 + x1) * 1e-3, 0.5 * (y0 + y1) * 1e-3,
                  li["h"] + 35e-6 + 0.5 * larg * 1e-3])
    n_tours = math.sqrt(l_h * (lc + 0.9 * r) / (MU_0 * math.pi * r * r))
    th = np.linspace(0, 2 * math.pi, BOBINE_COTES + 1)
    p, q = [], []
    for s in range(BOBINE_SPIRES):
        cs = c + u * lc * ((s + 0.5) / BOBINE_SPIRES - 0.5)
        # nrm x z = u : la spire tourne dans le sens droit autour de l'axe.
        pts = cs[None, :] + r * (np.cos(th)[:, None] * nrm[None, :]
                                 + np.sin(th)[:, None] * z[None, :])
        p.append(pts[:-1])
        q.append(pts[1:])
    p, q = np.vstack(p), np.vstack(q)
    w = np.full(len(p), n_tours / BOBINE_SPIRES)
    p = np.vstack([p, c - 0.5 * lc * u])
    q = np.vstack([q, c + 0.5 * lc * u])
    w = np.append(w, 1.0)
    return {"seg": (p, q, w), "c": c, "u": u, "couche": couche,
            "demi": (0.5 * entraxe + 0.25 * larg, 0.5 * larg), "n": n_tours}


def mutuelle_bobines(b1, b2):
    return (_neumann(*(b1["seg"] + b2["seg"]))
            + _neumann(*(b1["seg"] + _image(b2["seg"]))))


def segments_piste(couches, objets, bob, cache):
    """Les morceaux (m) d'une branche qui passent a moins de 3 mm d'une self,
    sur sa couche, hors de son empreinte, parcourus de a vers b."""
    p, q = [], []
    for o in objets:
        if int(_nombre(o.get("layer"), -1)) != bob["couche"]:
            continue
        (ax, ay), (bx, by) = _bouts(o)
        lg = math.hypot(bx - ax, by - ay)
        li = _ligne(couches, bob["couche"], _nombre(o.get("width")),
                    _nombre(o.get("copper_thickness"), 0.035), cache)
        if lg < 1e-6 or not li:
            continue
        zt = li["h"] + 0.5e-3 * _nombre(o.get("copper_thickness"), 0.035)
        n = min(400, int(math.ceil(lg / 0.1)))
        for i in range(n):
            f1, f2 = i / n, (i + 1) / n
            xm = (ax + (bx - ax) * 0.5 * (f1 + f2)) * 1e-3
            ym = (ay + (by - ay) * 0.5 * (f1 + f2)) * 1e-3
            dx, dy = xm - bob["c"][0], ym - bob["c"][1]
            along = abs(dx * bob["u"][0] + dy * bob["u"][1]) * 1e3
            across = abs(-dx * bob["u"][1] + dy * bob["u"][0]) * 1e3
            if math.hypot(dx, dy) * 1e3 > COUPLAGE_PISTE_MM or \
                    (along <= bob["demi"][0] and across <= bob["demi"][1]):
                continue
            p.append([(ax + (bx - ax) * f1) * 1e-3, (ay + (by - ay) * f1) * 1e-3, zt])
            q.append([(ax + (bx - ax) * f2) * 1e-3, (ay + (by - ay) * f2) * 1e-3, zt])
    if not p:
        return None
    return np.array(p), np.array(q), np.ones(len(p))


def mutuelle_piste(bob, seg):
    return (_neumann(*(bob["seg"] + seg)) + _neumann(*(bob["seg"] + _image(seg))))


# ==========================================================================
# Les fentes du plan de reference
# --------------------------------------------------------------------------
# UNE PISTE QUI FRANCHIT UNE FENTE DE SON PLAN y perd son retour : le courant
# de retour, qui la suivait dessous, doit contourner la fente par ses deux
# bouts. La page mesure, au franchissement, la distance d1 et d2 jusqu'a
# chaque bout (et plafonne a 30 mm un plan coupe de bord a bord). Chaque
# detour est une self, par la formule de Ott (EMC Engineering, 2009) :
# L = (mu0 / 2 pi) D ln(D / W) pour une fente de longueur D franchie en son
# milieu par une piste de largeur W -- soit, pour un detour d, la moitie
# d'une boucle de 2d : L_d = (mu0 / pi) 2d ln(2d / W). Les deux detours sont
# en parallele. En frequence, chacun est un tronçon de fente COURT-CIRCUITE
# au bout : Z = j w L tan(beta d) / (beta d), dans la permittivite moyenne
# des deux faces du plan, avec une perte (Q ~ 50) qui tient lieu de son
# rayonnement. C'est une estimation d'ingenieur -- la fente vraie rayonne --,
# et la fiche la donne pour ce qu'elle est.
# ==========================================================================

FENTE_Q = 50.0


def _eps_plan(couches, plan):
    ers = []
    for k in (plan - 1, plan + 1):
        if 0 <= k < len(couches) and couches[k].get("type") == "dielectric":
            ers.append(_nombre(couches[k].get("epsilon_r"), 4.3))
        else:
            ers.append(1.0)
    return 0.5 * sum(ers)


def z_fente(couches, fe, f):
    w = max(_nombre(fe.get("largeur"), 0.2), 0.01)
    beta = 2 * math.pi * f * math.sqrt(
        _eps_plan(couches, int(_nombre(fe.get("plan"), 0)))) / tl.C_0
    zs = []
    for d in (_nombre(fe.get("d1")), _nombre(fe.get("d2"))):
        l_d = MU_0 / math.pi * 2 * d * 1e-3 * math.log(max(2 * d / w, 1.0))
        x = beta * d * 1e-3 * complex(1.0, -0.5 / FENTE_Q)
        zs.append(1j * 2 * math.pi * f * l_d * (np.tan(x) / x if abs(x) > 1e-9
                                               else 1.0))
    if abs(zs[0]) == 0 or abs(zs[1]) == 0:
        return 0j
    return zs[0] * zs[1] / (zs[0] + zs[1])


def _poser_couples(y, index, elements, zmat, rang):
    """Des elements en SERIE COUPLES, en impedance : un courant inconnu par
    element (des le rang `rang`), V_p - V_q = sum Z_ij I_j. Une impedance
    propre nulle -- la force electromotrice qu'une self induit dans une
    piste -- s'y pose sans perte de precision."""
    for e, (p, q) in enumerate(elements):
        ip = index.get(p) if p != MASSE else None
        iq = index.get(q) if q != MASSE else None
        if ip is not None:
            y[ip, rang + e] += 1.0
            y[rang + e, ip] += 1.0
        if iq is not None:
            y[iq, rang + e] -= 1.0
            y[rang + e, iq] -= 1.0
        for j in range(len(elements)):
            if zmat[e, j] != 0:
                y[rang + e, rang + j] -= zmat[e, j]


# ==========================================================================
# Le calcul
# ==========================================================================

def _valider(doc):
    if not isinstance(doc, dict) or doc.get("format") != FORMAT:
        raise ErreurRF("Format inattendu : « %s » au lieu de « %s »."
                       % ((doc or {}).get("format") if isinstance(doc, dict)
                          else "absent", FORMAT))
    ports = doc.get("ports") or []
    if len(ports) != 2:
        raise ErreurRF("Il faut exactement deux ports.",
                       "Posez le port 1 (sortie de la puce) et le port 2"
                       " (connecteur ou antenne).")
    z, noeuds = [], []
    for k, p in enumerate(ports):
        zz = p.get("z") or [50, 0]
        zc = complex(_nombre(zz[0]), _nombre(zz[1] if len(zz) > 1 else 0))
        if not zc.real > 0:
            raise ErreurRF("Port %d : la partie réelle de l'impédance doit"
                           " être positive (%s)." % (k + 1, zc))
        n = str(p.get("noeud") or "")
        if not n or n == MASSE:
            raise ErreurRF("Port %d posé sur la masse ou nulle part." % (k + 1))
        z.append(zc)
        noeuds.append(n)
    if noeuds[0] == noeuds[1]:
        raise ErreurRF("Les deux ports sont sur le même nœud.")
    if len(doc.get("branches") or []) > MAX_BRANCHES:
        raise ErreurRF("Trop de branches de piste (maximum %d)." % MAX_BRANCHES)
    if len(doc.get("composants") or []) > MAX_COMPOSANTS:
        raise ErreurRF("Trop de composants (maximum %d)." % MAX_COMPOSANTS)
    return z, noeuds


def _doc_branche(doc, br):
    return {"format": "cao-sim-em-3", "source": doc.get("source") or "rf",
            "carte": doc.get("carte") or "", "net": br.get("net") or "",
            "stackup": doc.get("stackup") or {},
            "geometry": {"objects": br.get("objets") or []},
            "vias": br.get("vias") or [],
            "reference_nets": doc.get("reference_nets") or [],
            "ports": [{"id": 1, "impedance": 50.0},
                      {"id": 2, "impedance": 50.0}],
            "analyse": doc.get("analyse") or {}}


def analyser(doc, journal=None):
    """Document « cao-sim-rf-1 » -> S generalises entre les deux ports."""
    if ERREUR_RF is not None:
        raise ErreurRF("Simulation RF indisponible : %s" % ERREUR_RF,
                       "Elle a besoin de numpy : « pip install numpy ».")
    debut = time.time()
    z_ports, noeuds_ports = _valider(doc)
    try:
        couches, _, analyse = se.doc_valide(dict(
            doc, format="cao-sim-em-3",
            geometry={"objects": [{"type": "track"}]}))
    except se.ErreurSimulation as exc:
        raise ErreurRF(exc.message, exc.conseil)
    freqs = se.frequences(analyse)
    fc = analyse["f_centre"]
    avert = list(analyse.get("ajuste") or [])

    # -- les pistes, par le simulateur du depot --------------------------
    cache = {}
    reseau = doc.get("branches") or []
    # LES PISTES DES AUTRES NETS qui longent le reseau entrent dans ses lignes
    # couplees comme des conducteurs a part entiere, chacune fermee a ses deux
    # bouts sur sa propre impedance caracteristique : ce qui y passe s'en va,
    # et c'est compte comme perdu. Celles que rien ne couple sont laissees.
    voisines = [{"a": "V:%d:a" % i, "b": "V:%d:b" % i,
                 "net": str(v.get("net") or ""), "objets": v.get("objets") or [],
                 "voisine": True}
                for i, v in enumerate((doc.get("voisines") or [])[:MAX_BRANCHES])]
    brutes = reseau + voisines
    sections, coupes = (groupes_couples(couches, brutes, cache)
                        if doc.get("couplage", True) else ([], {}))
    suites = _decouper(brutes, coupes)
    branches, fiches, blocs = [], [], []
    terminaisons = []               # (noeud, conductance, net) des voisines
    bornes = {}                     # (section, rang) -> (debut, fin, morceau)
    # LES BRANCHES QUI RECOIVENT UN ELEMENT SERIE a leur depart : une fente du
    # plan sous elles, ou une self a moins de 3 mm qui y induit une tension.
    geos_l = [c.get("geo") for c in doc.get("composants") or []
              if str(c.get("genre") or "").upper() == "L" and c.get("geo")]

    def pres_d_une_self(br):
        for g in geos_l:
            cx = 0.5 * (_nombre(g.get("x0")) + _nombre(g.get("x1")))
            cy = 0.5 * (_nombre(g.get("y0")) + _nombre(g.get("y1")))
            for o in br.get("objets") or []:
                if int(_nombre(o.get("layer"), -1)) != int(_nombre(g.get("couche"), -2)):
                    continue
                (ax, ay), (bx, by) = _bouts(o)
                l2 = (bx - ax) ** 2 + (by - ay) ** 2
                u = max(0.0, min(1.0, ((cx - ax) * (bx - ax) + (cy - ay) * (by - ay))
                                 / l2)) if l2 > 0 else 0.0
                if math.hypot(ax + u * (bx - ax) - cx, ay + u * (by - ay) - cy) \
                        <= COUPLAGE_PISTE_MM:
                    return True
        return False
    inserts = dict((k, "E:%d" % k) for k, br in enumerate(reseau)
                   if br.get("fentes") or pres_d_une_self(br))
    for k, (br, suite) in enumerate(zip(brutes, suites)):
        if br.get("voisine"):
            if not any((k, q) in coupes for q in range(len(br["objets"]))):
                continue
            o0 = br["objets"][0]
            li = _ligne(couches, int(_nombre(o0.get("layer"), 0)),
                        _nombre(o0.get("width")),
                        _nombre(o0.get("copper_thickness"), 0.035), cache)
            if not li:
                continue
            terminaisons += [(br["a"], 1.0 / li["z0"], br["net"]),
                             (br["b"], 1.0 / li["z0"], br["net"])]
        a, b = str(br.get("a") or ""), str(br.get("b") or "")
        nom = "%s (%s → %s)" % (br.get("net") or "branche %d" % (k + 1), a, b)
        fiche = {"net": br.get("net") or "", "a": a, "b": b, "longueur": 0.0,
                 "pertes_db": 0.0, "retard": 0.0, "vias": 0, "couplee": 0.0}
        if br.get("fentes"):
            fiche["fentes"] = [{"d1": _nombre(fe.get("d1")), "d2": _nombre(fe.get("d2")),
                                "largeur_fente": _nombre(fe.get("g")),
                                "borne": bool(fe.get("borne"))}
                               for fe in br["fentes"]]
        depart = inserts.get(k, a)
        z0s, secs = [], []
        for e, el in enumerate(suite):
            na = depart if e == 0 else "K:%d:%d" % (k, e)
            nb = b if e == len(suite) - 1 else "K:%d:%d" % (k, e + 1)
            if el[0] == "couple":
                bornes[(el[1], el[2])] = (na, nb, el[3])
                fiche["longueur"] += el[3]["length"]
                fiche["couplee"] += el[3]["length"]
                continue
            sous = dict(br, objets=el[1], vias=br.get("vias") if e == 0 else [])
            try:
                r = se.simuler(_doc_branche(doc, sous), garder_abcd=True)
            except se.ErreurSimulation as exc:
                raise ErreurRF("Piste %s : %s" % (nom, exc.message), exc.conseil)
            if r.get("cascade_refusee") or \
                    len(r.get("abcd") or []) != len(freqs):
                raise ErreurRF("Piste %s : %s" % (nom, r.get("cascade_refusee")
                                                  or "cascade impossible."),
                               "La page doit découper le net en branches"
                               " continues de pastille à pastille.")
            branches.append((na, nb, r["abcd"]))
            lg = r["ligne"]
            fiche["longueur"] += lg["longueur"] - sum(
                o["length"] for o in el[1] if o.get("raccord"))
            fiche["pertes_db"] += lg["pertes_db"]
            fiche["retard"] += lg["retard"]
            fiche["vias"] += len((r.get("discontinuites") or {})
                                 .get("transitions") or [])
            z0s += [lg["z0_min"], lg["z0_max"]]
            for s in r.get("segments") or []:
                if s.get("z0", 0) > 0 and s.get("longueur", 0) > 10 * RACCORD:
                    secs.append((s["couche"], s["h"], s["er"]))
            for w in r.get("avertissements") or []:
                if w not in avert and w not in se.AVERTISSEMENTS_MODELE                         and not br.get("voisine"):
                    avert.append(w)
        # L'EMPILAGE RESOLU SE MONTRE : couche, hauteur au plan, permittivite.
        # C'est ce qui dit, sans aller relire l'empilage, si 114 ohms viennent
        # d'une piste trop fine ou d'un plan trop loin.
        fiche["sections"] = [{"couche": se._nom_de_couche(couches, c) or c,
                              "h": h, "er": er}
                             for c, h, er in sorted(set(secs))]
        fiche["longueur"] = round(fiche["longueur"], 3)
        fiche["pertes_db"] = round(fiche["pertes_db"], 4)
        fiche["z0_min"] = round(min(z0s), 3) if z0s else None
        fiche["z0_max"] = round(max(z0s), 3) if z0s else None
        if not br.get("voisine"):
            fiches.append(fiche)

    fiches_couplage = []
    for sid, sec in enumerate(sections):
        n = len(sec["membres"])
        prises = [bornes[(sid, r)] for r in range(n)]
        # Les bornes de chaque membre rangees dans le sens de l'axe du groupe.
        proches = [p[0] if m["sens"] else p[1]
                   for p, m in zip(prises, sec["membres"])]
        loin = [p[1] if m["sens"] else p[0]
                for p, m in zip(prises, sec["membres"])]
        yc = y_section(couches, sec, [p[2] for p in prises], freqs, cache,
                       se.options_modele(doc))
        nets = [brutes[m["obj"][0]].get("net") or "" for m in sec["membres"]]
        if yc is None:
            raise ErreurRF("Longement non calculable entre %s."
                           % " et ".join(nets))
        blocs.append((proches + loin, yc[0]))
        ecarts = [(m2["lat"] - m1["lat"])
                  - 0.5 * (_nombre(p1[2].get("width"))
                           + _nombre(p2[2].get("width")))
                  for m1, m2, p1, p2 in zip(sec["membres"], sec["membres"][1:],
                                            prises, prises[1:])]
        fiches_couplage.append({
            "nets": nets, "longueur": round(sec["t2"] - sec["t1"], 3),
            "ecart": round(min(ecarts), 4),
            "next_pct": round(100 * yc[1]["kb"], 3),
            "z0": [round(z, 2) for z in yc[1]["z0"]]})

    # -- les pastilles -------------------------------------------------------
    shunts, fiches_surf, fils = [], [], []
    for s in doc.get("pastilles") or []:
        c, _eps = capacite_surface(couches, s, cache)
        if c > 0:
            shunts.append((str(s.get("noeud")), c))
            fiches_surf.append({"noeud": str(s.get("noeud")),
                                "genre": "pastilles", "c_pF": round(c * 1e12, 4)})

    # -- les zones, maillees --------------------------------------------------
    f_fin = float(freqs[-1])
    maillages = []                 # (noms des cellules, maillage)

    def mailler(z, base, quoi):
        m = maillage_zone(couches, z, f_fin, cache)
        if m is None:
            raise ErreurRF("La zone de cuivre « %s » n'a pas de plan en face :"
                           " elle n'est pas calculable." % (z.get("net") or base))
        maillages.append((["%s#%d" % (base, q) for q in range(len(m["c"]))], m))
        for noeud, q in m["acces"]:
            fils.append((noeud, "%s#%d" % (base, q)))
        fiches_surf.append({"noeud": base, "genre": quoi,
                            "c_pF": round(1e12 * float(m["c"].sum()), 4),
                            "cellules": int(len(m["c"])),
                            "pas_min_mm": round(m["pas_min"], 4),
                            "pas_max_mm": round(m["pas_max"], 4)})
        if m["grossier"]:
            avert.append("La zone « %s » dépasse %d cellules : son maillage a "
                         "été desserré (pas de %.2f à %.2f mm)."
                         % (z.get("net") or base, MAX_CELLULES, m["pas_min"],
                            m["pas_max"]))
        return m

    for zi, z in enumerate(doc.get("zones") or []):
        mailler(z, str(z.get("noeud") or "Z%d" % zi), "zones")

    # -- les composants ---------------------------------------------------
    composants, fiches_comp, bobines = [], [], []
    for c in doc.get("composants") or []:
        ref = str(c.get("ref") or "?")
        noeuds = [str(n) for n in (c.get("noeuds") or [])]
        m = modele(c.get("modele"), ref)
        if m.n != len(noeuds):
            raise ErreurRF("%s : le modèle « %s » a %d port(s), le composant"
                           " %d broche(s) branchée(s)." % (ref, m.nom, m.n,
                                                            len(noeuds)))
        composants.append((noeuds, m))
        spec = c.get("modele") or {}
        fiche = {"ref": ref, "type": spec.get("type"), "nom": m.nom,
                 "noeuds": noeuds}
        if spec.get("type") == "ideal":
            fiche.update(genre=spec.get("genre"), valeur=m.valeur)
        if isinstance(m, ModeleSnp):
            fiche["bande"] = [float(m.freqs[0]), float(m.freqs[-1])]
        # UNE SELF A DEUX BROCHES, modele en admittance, devient un solenoide.
        if str(c.get("genre") or "").upper() == "L" and c.get("geo")                 and m.n == 2 and not isinstance(m, ModeleSnp):
            f_ref = min(float(freqs[0]), 1e8)
            y11 = m.y(f_ref)[0, 0]
            l_h = (1.0 / y11).imag / (2 * math.pi * f_ref) if abs(y11) > 0 else 0
            bob = bobine(couches, c["geo"], l_h, cache) if l_h > 0 else None
            if bob is not None:
                bobines.append((len(fiches_comp), m, bob))
        fiches_comp.append(fiche)

    # -- les vias de masse --------------------------------------------------
    masses = []
    coulees = {}
    for g in doc.get("masses") or []:
        noeud = str(g.get("noeud"))
        ys = admittance_masse(couches, g, freqs, cache)
        if any(abs(v) > 0 for v in ys):
            masses.append((noeud, ys))
        cl = g.get("coulee")
        if cl:
            cle = str(cl.get("id") or noeud)
            coulees.setdefault(cle, {"cl": cl, "pads": [], "couche":
                                     int(_nombre(g.get("couche"), 0))})
            cx, cy = [_nombre(v) for v in cl.get("centre") or [0, 0]]
            coulees[cle]["pads"].append({"noeud": noeud, "x": cx, "y": cy})
    # LA COULEE DE MASSE, ENTIERE, maillee une fois pour toutes les pastilles
    # qui s'y posent : elles s'y accrochent, et chacun de ses vias la descend
    # au plan.
    for cle, co in coulees.items():
        cl, vias_c = co["cl"], co["cl"].get("vias") or []
        acces = co["pads"] + [{"noeud": "%s~v%d" % (cle, i),
                               "x": _nombre(v.get("x")),
                               "y": _nombre(v.get("y"))}
                              for i, v in enumerate(vias_c)]
        mailler(dict(cl, acces=acces), "C:%s" % cle, "coulées")
        for i, v in enumerate(vias_c):
            lv = inductance_masse(couches, co["couche"], [v])
            if lv > 0:
                masses.append(("%s~v%d" % (cle, i),
                               [1.0 / (1j * 2 * math.pi * f * lv)
                                for f in freqs]))

    # -- les noeuds ---------------------------------------------------------
    # UN 0 OHM EST UN FIL, pas une grosse admittance : poser 1e9 S a cote de
    # 1/50 S coute six chiffres de precision a la resolution, et les jumpers
    # de 0 ohm sont justement l'ordinaire d'un reseau d'adaptation qu'on
    # garde ouvert au reglage. On fusionne leurs deux noeuds.
    parent = {}

    def racine(n):
        while parent.get(n, n) != n:
            n = parent[n]
        return n

    for a_, b_ in fils:                  # les acces aux zones
        ra, rb = racine(a_), racine(b_)
        if ra != rb:
            if ra == MASSE:
                ra, rb = rb, ra
            parent[ra] = rb
    gardes = []
    for ns, m in composants:
        if isinstance(m, ModeleIdeal) and m.genre in "rl" and m.valeur == 0:
            ra, rb = racine(ns[0]), racine(ns[1])
            if ra != rb:
                # La masse reste la racine : c'est elle qu'on ne numerote pas.
                if ra == MASSE:
                    ra, rb = rb, ra
                parent[ra] = rb
        else:
            gardes.append((ns, m))
    composants = [([racine(n) for n in ns], m) for ns, m in gardes]
    branches = [(racine(a), racine(b), abcd) for a, b, abcd in branches]
    blocs = [([racine(n) for n in ns], ys) for ns, ys in blocs]
    maillages = [([racine(n) for n in ns], m) for ns, m in maillages]
    shunts = [(racine(n), c) for n, c in shunts]
    noms_masses = [n for n, _ in masses]      # les noms, pour la fiche
    masses = [(racine(n), ys) for n, ys in masses]
    noeuds_ports = [racine(n) for n in noeuds_ports]
    if MASSE in noeuds_ports:
        raise ErreurRF("Un port est court-circuité à la masse par un 0 Ω.")

    noms = list(noeuds_ports)
    for a, b, _ in branches:
        noms += [a, b]
    for ns, _ in composants + blocs:
        noms += ns
    noms += [n for n, _ in masses]
    noms += [n for n, _ in shunts]
    for ns, _ in maillages:
        noms += ns
    index = {}
    for n in noms:
        if n != MASSE and n not in index:
            index[n] = len(index)
    # Les blocs Touchstone ajoutent leurs courants de broche aux inconnues :
    # ils se posent en S, sans passer par Y -- un « thru » parfait n'a pas de
    # matrice Y, et un composant mesure s'en approche souvent.
    snp = [(ns, m) for ns, m in composants if isinstance(m, ModeleSnp)]
    autres = [(ns, m) for ns, m in composants if not isinstance(m, ModeleSnp)]

    # -- les elements series couples ------------------------------------------
    # Les departs de branche (fente, tension induite) et les selfs qui se
    # couplent : UNE matrice d'impedance, propres et mutuelles ensemble.
    noeuds_de = dict((id(m), ns) for ns, m in composants)
    elements, propres, geos = [], [], []
    for k in sorted(inserts):
        elements.append((racine(str(reseau[k].get("a") or "")), inserts[k]))
        propres.append(("fentes", reseau[k].get("fentes") or []))
        geos.append(("piste", k))
    for ic, m, bob in bobines:
        if id(m) in noeuds_de:
            elements.append(tuple(noeuds_de[id(m)]))
            propres.append(("self", m))
            geos.append(("self", bob))
    mut = np.zeros((len(elements), len(elements)))
    fiches_mut = []
    for i in range(len(elements)):
        for j in range(i + 1, len(elements)):
            (gi, bi), (gj, bj) = geos[i], geos[j]
            if gi == "piste" and gj == "piste":
                continue
            if gi == "piste":
                (gi, bi), (gj, bj) = (gj, bj), (gi, bi)
            if gj == "self":
                if bi["couche"] != bj["couche"] or                         np.linalg.norm(bi["c"] - bj["c"]) * 1e3 > COUPLAGE_BOBINES_MM:
                    continue
                mm = mutuelle_bobines(bi, bj)
            else:
                seg = segments_piste(couches, reseau[bj].get("objets") or [],
                                     bi, cache)
                mm = mutuelle_piste(bi, seg) if seg is not None else 0.0
            mut[i, j] = mut[j, i] = mm
    # Une self que rien ne couple reste posee en admittance.
    garde = [e for e in range(len(elements))
             if propres[e][0] != "self" or np.any(np.abs(mut[e]) > 1e-15)]
    elements = [elements[e] for e in garde]
    propres = [propres[e] for e in garde]
    mut = mut[np.ix_(garde, garde)]
    couplees = set(id(p[1]) for p in propres if p[0] == "self")
    autres = [(ns, m) for ns, m in autres if id(m) not in couplees]
    noms_el = []
    for e, (p_, q_) in enumerate(elements):
        if propres[e][0] == "self":
            ref = next(fc["ref"] for (ic, m, b) in bobines
                       for fc in [fiches_comp[ic]] if m is propres[e][1])
        else:
            ref = "piste %s" % (reseau[int(q_.split(":")[1])].get("net") or q_)
        noms_el.append(ref)
    for i in range(len(elements)):
        for j in range(i + 1, len(elements)):
            if abs(mut[i, j]) > 1e-15:
                li = [1.0 / propres[q][1].y(float(freqs[0]))[0, 0]
                      for q in (i, j) if propres[q][0] == "self"]
                fiche = {"entre": [noms_el[i], noms_el[j]],
                         "m_nH": round(1e9 * mut[i, j], 5)}
                if len(li) == 2:
                    l1, l2 = [z.imag / (2 * math.pi * float(freqs[0])) for z in li]
                    if l1 > 0 and l2 > 0:
                        fiche["k"] = round(mut[i, j] / math.sqrt(l1 * l2), 5)
                fiches_mut.append(fiche)

    n_v = len(index)
    n_snp = sum(m.n for _, m in snp)
    n_tot = n_v + n_snp + len(elements)
    sondes = [(net, index[racine(n)], g) for n, g, net in terminaisons
              if racine(n) in index]
    energie_voisines = []
    idx_mailles = [np.array([index[n] for n in ns], dtype=int)
                   for ns, _ in maillages]

    # -- l'assemblage, frequence par frequence ------------------------------
    s_mats, s50, zin, zout = [], [], [], []
    for k, f in enumerate(freqs):
        omega = 2 * math.pi * f
        y = _Assemblage(n_tot)
        for a, b, abcd in branches:
            (A, B), (C, D) = abcd[k]
            yq = np.array([[D / B, (B * C - A * D) / B], [-1.0 / B, A / B]])
            _poser_nports(y, index, [a, b], yq)
        for ns, m in autres:
            _poser_nports(y, index, ns, m.y(f))
        for ns, ys in blocs:
            _poser_nports(y, index, ns, ys[k])
        for n, c in shunts:
            _poser(y, index, n, MASSE, 1j * omega * c)
        for q, (ns, m) in enumerate(maillages):
            y.maillage(idx_mailles[q], m, omega, r_peau(f, m["ep"]))
        for n, ys in masses:
            if abs(ys[k]) > 0:
                _poser(y, index, n, MASSE, ys[k])
            elif n in index:
                raise ErreurRF("Une masse sans via doit arriver sur le nœud"
                               " « 0 ».")
        rang = n_v
        for ns, m in snp:
            _poser_snp(y, index, ns, m, f, rang)
            rang += m.n
        for n, g, _net in terminaisons:
            _poser(y, index, racine(n), MASSE, g)
        if elements:
            zm = 1j * omega * mut.astype(complex)
            for e, (genre, v) in enumerate(propres):
                zm[e, e] = (1.0 / v.y(f)[0, 0] if genre == "self"
                            else sum(z_fente(couches, fe, f) for fe in v))
            _poser_couples(y, index, elements, zm, n_v + n_snp)
        s_mats.append(_s_ports(y, index, noeuds_ports, z_ports, (zin, zout),
                               sondes=sondes, energie=energie_voisines))
        s50.append(_s_ports(y, index, noeuds_ports, [50.0, 50.0]))

    # -- le bilan a la frequence de travail ---------------------------------
    k0 = int(np.argmin(np.abs(freqs - fc)))
    s0 = s_mats[k0]
    t11, t21 = abs(s0[0, 0]) ** 2, abs(s0[1, 0]) ** 2
    desadapt = 1.0 - t11
    bilan = {
        "f": float(freqs[k0]),
        "s21_db": round(_db(s0[1, 0]), 3), "s11_db": round(_db(s0[0, 0]), 3),
        "s22_db": round(_db(s0[1, 1]), 3),
        "zin": [zin[k0].real, zin[k0].imag],
        "zout": [zout[k0].real, zout[k0].imag],
        # La perte d'insertion se partage en deux : ce qui repart vers la
        # puce (desadaptation) et ce que le reseau brule. Les confondre, c'est
        # chercher a retoucher une self quand c'est la piste qui chauffe.
        "perte_desadaptation_db": round(-10 * math.log10(max(desadapt, 1e-15)),
                                        3),
        "perte_dissipee_db": (round(-10 * math.log10(max(t21 / desadapt,
                                                         1e-15)), 3)
                              if desadapt > 1e-12 else None),
        # L'impedance que la puce devrait voir : le conjugue de sa sortie.
        "zin_cible": [z_ports[0].real, -z_ports[0].imag],
        # Ce que les pistes des autres nets emportent, sur la puissance
        # disponible du port 1.
        "voisines_pct": round(100 * sum(energie_voisines[k0].values()), 4)
                        if energie_voisines else 0.0,
    }
    fiches_voisines = sorted(
        [{"net": net, "pct": round(100 * v, 4)}
         for net, v in (energie_voisines[k0] if energie_voisines else {}).items()],
        key=lambda d: -d["pct"])
    if any("piste" in " ".join(fm["entre"]) for fm in fiches_mut):
        avert.append("Couplage self → piste : le sens d'enroulement des selfs "
                     "n'est pas sur le dessin, il est pris droit. Il fixe le "
                     "signe de la mutuelle avec une piste (pas entre deux "
                     "selfs de la même série).")
    for br in reseau:
        for fe in br.get("fentes") or []:
            if fe.get("borne"):
                avert.append("Net %s : le plan de référence est coupé de bord à"
                             " bord sous la piste ; le retour y passe par les "
                             "condensateurs ou les coutures, que ce calcul ne voit"
                             " pas. Le détour est plafonné à %g mm." % (
                                 br.get("net") or "?", max(_nombre(fe.get("d1")),
                                                          _nombre(fe.get("d2")))))

    validite = domaine_validite(couches, doc, cache, float(freqs[-1]))
    if validite["f_max"] < float(freqs[-1]):
        lim = validite["limites"][0]
        avert.append(
            "HORS DU DOMAINE QUASI-STATIQUE au-delà de %.3g GHz : %s (%s%s)."
            " Ce simulateur ne voit ni les modes supérieurs, ni les ondes de "
            "surface, ni le rayonnement ; au-dessus de cette fréquence, les "
            "résultats ne valent plus qu'une tendance."
            % (lim["f"] / 1e9, lim["cause"], lim["detail"],
               (", " + lim["net"]) if lim["net"] else ""))

    duree = time.time() - debut
    if journal:
        journal("  simulation RF : %d branche(s), %d composant(s), S21 %.2f dB"
                " à %.4g GHz, %.1f s\n" % (len(branches), len(composants),
                                           bilan["s21_db"], fc / 1e9, duree))

    entete = ["Genere par WEB_CAO -- simulation RF (python/rf_reseau.py)",
              "Carte : %s" % (doc.get("carte") or "-"),
              "RENORMALISE A 50 OHM. Le calcul a ete fait entre Z1 = %s et"
              " Z2 = %s ohm." % (_cplx_txt(z_ports[0]), _cplx_txt(z_ports[1]))]
    return {
        "format": FORMAT_RESULTAT, "version": VERSION,
        "carte": doc.get("carte") or "",
        "ports": [{"noeud": n, "z": [z.real, z.imag]}
                  for n, z in zip(noeuds_ports, z_ports)],
        "f_centre": fc,
        "freqs": [float(f) for f in freqs],
        "s": [[[float(v.real), float(v.imag)] for v in m.flatten()]
              for m in s_mats],
        "zin": [[z.real, z.imag] for z in zin],
        "zout": [[z.real, z.imag] for z in zout],
        "bilan": bilan,
        "branches": fiches,
        "composants": fiches_comp,
        "masses": [{"noeud": nom,
                    "l_nH": round(1e9 * (1.0 / ys[k0]).imag
                                  / (2 * math.pi * float(freqs[k0])), 4)}
                   for nom, (n, ys) in zip(noms_masses, masses)],
        "couplages": fiches_couplage,
        "voisines": fiches_voisines,
        "mutuelles": fiches_mut,
        "validite": validite,
        "surfaces": fiches_surf,
        "touchstone": se.touchstone(freqs, s50, 50.0, entete),
        "duree": round(duree, 3),
        "avertissements": avert,
    }


def _poser_snp(y, index, noeuds, m, f, rang):
    """Un bloc S a N ports, courants de broche en inconnues des le rang `rang`.

    Ondes de puissance sur les references reelles z0 du fichier :
    (V - z0 I)/rac(z0) = S (V + z0 I)/rac(z0), I entrant dans le composant.
    """
    s = _interpoler(m.freqs, m.s, f, m.nom)
    rz = np.sqrt(m.z0)
    for k, n in enumerate(noeuds):
        i = index.get(n) if n != MASSE else None
        if i is not None:
            y[i, rang + k] += 1.0              # le courant quitte le noeud
        for j, nj in enumerate(noeuds):
            ij = index.get(nj) if nj != MASSE else None
            d = 1.0 if j == k else 0.0
            if ij is not None:
                y[rang + k, ij] += d / rz[k] - s[k, j] / rz[j]
            y[rang + k, rang + j] += -d * rz[k] - s[k, j] * rz[j]


class _Assemblage(object):
    """La matrice nodale, creuse. On n'y fait que des `y[i, j] += v` (c'est
    tout ce que les poses emploient) : l'element lu vaut 0, l'ecrit s'empile
    en triplets. Les maillages de zone s'y posent en bloc, vectorises."""

    def __init__(self, n):
        self.n = n
        self.r, self.c, self.v = [], [], []
        self.blocs = []

    def __getitem__(self, ij):
        return 0.0

    def __setitem__(self, ij, v):
        self.r.append(ij[0])
        self.c.append(ij[1])
        self.v.append(v)

    def maillage(self, idx, m, omega, r_carre):
        a, b = idx[m["ia"]], idx[m["ib"]]
        v = 1.0 / (r_carre * m["r_lien"] + 1j * omega * m["l_lien"])
        self.blocs.append((np.concatenate([a, b, a, b, idx]),
                           np.concatenate([a, b, b, a, idx]),
                           np.concatenate([v, v, -v, -v,
                                           1j * omega * m["c"]])))

    def matrice(self, diag):
        r = [np.array(self.r, dtype=int)] + [b[0] for b in self.blocs]
        c = [np.array(self.c, dtype=int)] + [b[1] for b in self.blocs]
        v = [np.array(self.v, dtype=complex)] + [b[2] for b in self.blocs]
        di = np.array(list(diag.keys()), dtype=int)
        r = np.concatenate(r + [di])
        c = np.concatenate(c + [di])
        v = np.concatenate(v + [np.array(list(diag.values()), dtype=complex)])
        if self.n > 400 and _SPARSE is not None:
            return _SPARSE.coo_matrix((v, (r, c)),
                                      shape=(self.n, self.n)).tocsc(), True
        m = np.zeros((self.n, self.n), dtype=complex)
        np.add.at(m, (r, c), v)
        return m, False


def _resoudre(m, creuse, rhs):
    try:
        if creuse:
            import scipy.sparse.linalg as spl
            return spl.splu(m).solve(rhs)
        return np.linalg.solve(m, rhs)
    except (np.linalg.LinAlgError, RuntimeError):
        raise ErreurRF("Réseau singulier : un nœud du chemin RF est en"
                       " l'air ou isolé.",
                       "Vérifiez que chaque pastille est reliée.")


def _s_ports(y, index, ports, z, impedances=None, sondes=None, energie=None):
    """S generalises par deux resolutions, chaque port ferme sur sa reference.

    On attaque un port par une force electromotrice de 1 V derriere Zk (son
    equivalent de Norton), l'autre etant ferme sur la sienne :
        a_j = 1 / (2 rac(Rj)),  b_i = (V_i - Zi* I_i) / (2 rac(Ri))
    ce qui ne demande jamais d'inverser la matrice Y du reseau -- donc marche
    aussi sur un fil ou un bloc S sans matrice Y. Les deux attaques partagent
    UNE factorisation.
    """
    ip = [index[n] for n in ports]
    diag = {}
    for i, zk in zip(ip, z):
        diag[i] = diag.get(i, 0) + 1.0 / zk
    m, creuse = y.matrice(diag)
    rhs = np.zeros((y.n, 2), dtype=complex)
    for j in range(2):
        rhs[ip[j], j] += 1.0 / z[j]
    vv = _resoudre(m, creuse, rhs)
    s = np.zeros((2, 2), dtype=complex)
    for j in range(2):
        v = vv[:, j]
        for i in range(2):
            vi = v[ip[i]]
            courant = ((1.0 - vi) if i == j else -vi) / z[i]
            b = (vi - z[i].conjugate() * courant) / (2 * math.sqrt(z[i].real))
            s[i, j] = b * 2 * math.sqrt(z[j].real)
        # LA PUISSANCE PARTIE DANS LES VOISINES, rapportee a la puissance
        # disponible du port 1 : 4 R1 sum G |V|^2 (1 V de force
        # electromotrice derriere Z1).
        if j == 0 and energie is not None:
            par = {}
            for net, i_n, g in sondes or []:
                par[net] = par.get(net, 0.0) + 4 * z[0].real * g * abs(v[i_n]) ** 2
            energie.append(par)
        if impedances is not None:
            vj = v[ip[j]]
            courant = (1.0 - vj) / z[j]
            impedances[j].append(vj / courant if abs(courant) > 1e-300
                                 else complex(float("inf")))
    return s


def _cplx_txt(z):
    return "%g%+gj" % (z.real, z.imag)


def _poser_nports(y, index, noeuds, yq):
    """Un N-ports reference a la masse, broche k sur noeuds[k]."""
    ids = [index.get(n) if n != MASSE else None for n in noeuds]
    for i, a in enumerate(ids):
        if a is None:
            continue
        for j, b in enumerate(ids):
            if b is not None:
                y[a, b] += yq[i, j]
