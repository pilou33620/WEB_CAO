"""Banc d'essai de la simulation RF (python/rf_reseau.py).

    python python/test/banc-rf.py

Des etalons que ce code ne fabrique pas lui-meme :

  · un reseau en L calcule A LA MAIN pour adapter 14+8j sur 50 ohms doit
    rendre S11 = 0 et S21 = 0 dB a sa frequence ;
  · deux ports relies directement : |S21|^2 = 4 R1 R2 / |Z1 + Z2|^2, le gain
    transducique d'une simple desadaptation ;
  · avec deux references reelles egales, les S generalises doivent redonner
    EXACTEMENT ceux de la cascade de `simulation_em` -- meme piste, meme
    moteur ;
  · un modele Murata doit resonner la ou son C et son ESL le disent.

Style des autres bancs du depot : pas de pytest, un decompte, un code de retour.
"""

import cmath
import math
import os
import sys

import numpy as np

RACINE = os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(RACINE, "python"))

import rf_reseau as rf                                               # noqa: E402
import simulation_em as se                                           # noqa: E402

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib_essai                                                     # noqa: E402

# Lecture seule : les modeles Murata de la vraie LIB (voir lib_essai.py)
LIB_SIM = os.path.join(lib_essai.source(), "lib_simulation")
ok = ko = 0


def T(titre, fonction):
    global ok, ko
    try:
        fonction()
    except AssertionError as exc:
        ko += 1
        print("  KO  %s\n        %s" % (titre, exc))
    except Exception as exc:                           # noqa: BLE001
        ko += 1
        print("  KO  %s\n        %s : %s" % (titre, type(exc).__name__, exc))
    else:
        ok += 1
        print("  ok  %s" % titre)


def proche(vu, attendu, tol, quoi):
    ecart = abs(vu - attendu) / max(abs(attendu), 1e-30)
    assert ecart < tol, ("%s : %s contre %s, soit %.3g %% (tolere %.3g %%)"
                         % (quoi, vu, attendu, 100 * ecart, 100 * tol))


def _cu(nom, role):
    return {"name": nom, "type": "copper", "thickness": 0.035, "role": role}


def _di(nom, ep, er):
    return {"name": nom, "type": "dielectric", "thickness": ep,
            "epsilon_r": er, "tan_delta": 0.02}


QUATRE = [_cu("TOP", "signal"), _di("PP", 0.200, 4.20), _cu("GND", "plane"),
          _di("CORE", 0.800, 4.50), _cu("PWR", "plane"),
          _di("PP2", 0.200, 4.20), _cu("BOT", "signal")]

F0 = 2.44e9


def _piste(x1, y1, x2, y2, largeur=0.35):
    return {"type": "track", "start": [x1, y1], "end": [x2, y2],
            "width": largeur, "layer": 0, "net": "RF",
            "copper_thickness": 0.035}


def _doc(ports, composants=(), branches=(), masses=(), f1=2.0e9, f2=3.0e9,
         points=11):
    return {"format": rf.FORMAT, "stackup": {"layers": QUATRE},
            "reference_nets": ["GND"],
            "ports": [{"noeud": n, "z": [z.real, z.imag]} for n, z in ports],
            "branches": list(branches), "composants": list(composants),
            "masses": list(masses),
            "analyse": {"f_debut": f1, "f_fin": f2, "points": points,
                        "f_centre": F0}}


def _ideal(ref, genre, valeur, a, b):
    return {"ref": ref, "noeuds": [a, b],
            "modele": {"type": "ideal", "genre": genre, "valeur": valeur}}


def _s(r, k, i, j):
    v = r["s"][k][2 * i + j]
    return complex(v[0], v[1])


def _k0(r):
    return int(np.argmin(np.abs(np.array(r["freqs"]) - F0)))


# ==========================================================================
# Touchstone
# ==========================================================================

def touchstone_relu_redonne_ce_qui_a_ete_ecrit():
    freqs = np.array([1e9, 2e9, 3e9])
    mats = [np.array([[0.1 + 0.2j, 0.9 - 0.1j], [0.8 + 0.3j, -0.2j]]) * (k + 1)
            / 3 for k in range(3)]
    f, s, z0 = rf.lire_touchstone(se.touchstone(freqs, mats, 50.0), "a.s2p")
    assert len(f) == 3 and z0[0] == 50.0
    for k in range(3):
        # S21 et S12 doivent revenir A LEUR PLACE : l'ordre S11 S21 S12 S22
        # d'un 2 ports est le piege classique.
        assert np.allclose(s[k], mats[k], atol=1e-4), (s[k], mats[k])


def touchstone_formats_db_ri_mhz_et_bruit():
    txt = ("! commentaire\n# MHz S DB R 75\n"
           "100 -20 0  -1 90  -1 90  -20 180\n"
           "200 -10 0  -2 45  -2 45  -10 180\n"
           "! bruit\n100 1.5 0.3 20 0.4\n")
    f, s, z0 = rf.lire_touchstone(txt, "b.s2p")
    assert list(f) == [100e6, 200e6], "les donnees de bruit ont ete lues : %s" % f
    assert z0[0] == 75.0
    proche(abs(s[0][0, 0]), 0.1, 1e-9, "|S11| depuis -20 dB")
    proche(cmath.phase(s[1][1, 0]), math.pi / 4, 1e-9, "phase de S21")
    f, s, _ = rf.lire_touchstone("# GHZ S RI R 50\n1 0.5 0.5\n2 0.1 -0.1\n",
                                 "c.s1p")
    assert s.shape == (2, 1, 1) and s[1][0, 0] == 0.1 - 0.1j


def touchstone_trois_ports_en_rangees_et_version_2():
    # A partir de trois ports, la matrice s'ecrit rangee par rangee.
    valeurs = " ".join("%d 0" % (10 * (i + 1) + j + 1)
                       for i in range(3) for j in range(3))
    _, s, _ = rf.lire_touchstone("# HZ S MA R 50\n1e9 " + valeurs, "d.s3p")
    assert s[0][0, 1] == 12 and s[0][2, 0] == 31, s[0]
    v2 = ("[Version] 2.0\n# GHz S RI R 50\n[Number of Ports] 2\n"
          "[Two-Port Data Order] 12_21\n[Number of Frequencies] 1\n"
          "[Network Data]\n1 0 0 0.5 0 0.9 0 0 0\n[End]\n")
    _, s, _ = rf.lire_touchstone(v2, "sans_extension")
    assert s[0][0, 1] == 0.5 and s[0][1, 0] == 0.9, s[0]


def touchstone_en_y_revient_en_s():
    # Une admittance serie de 0,02 S (50 ohms) en Y normalise a 50 ohms.
    y = 0.02 * 50
    txt = "# GHZ Y RI R 50\n1 %g 0 %g 0 %g 0 %g 0\n" % (y, -y, -y, y)
    _, s, _ = rf.lire_touchstone(txt, "e.s2p")
    # 50 ohms en serie entre deux ports de 50 : S21 = 2/3, S11 = 1/3.
    assert np.allclose(s[0], [[1 / 3, 2 / 3], [2 / 3, 1 / 3]], atol=1e-9), s[0]


# ==========================================================================
# Les parametres S generalises
# ==========================================================================

def deux_ports_relies_donnent_le_gain_de_desadaptation():
    z1, z2 = 14 + 8j, 50 + 0j
    r = rf.analyser(_doc([("a", z1), ("b", z2)],
                         [_ideal("R0", "R", 0.0, "a", "b")]))
    attendu = 4 * z1.real * z2.real / abs(z1 + z2) ** 2
    proche(abs(_s(r, 0, 1, 0)) ** 2, attendu, 1e-6, "|S21|^2 d'un fil")
    proche(abs(_s(r, 0, 0, 0)) ** 2, 1 - attendu, 1e-6,
           "|S11|^2 d'un fil sans pertes")


def un_reseau_en_l_adapte_14_8j_sur_50():
    """Calcule a la main : self serie cote puce, capacite a la masse cote 50."""
    w = 2 * math.pi * F0
    g = 1 / 50.0
    b = math.sqrt(g / 14.0 - g * g)       # Re(1/(g+jb)) = 14
    x_serie = -8 + 14 * b / g             # Im total = -8 : le conjugue de +8
    l_, c_ = x_serie / w, b / w
    r = rf.analyser(_doc([("p1", 14 + 8j), ("p2", 50 + 0j)],
                         [_ideal("L1", "L", l_, "p1", "n"),
                          _ideal("C1", "C", c_, "n", "0"),
                          _ideal("R0", "R", 0.0, "n", "p2")]))
    k = _k0(r)
    assert abs(_s(r, k, 0, 0)) < 1e-6, "S11 = %s a f0" % _s(r, k, 0, 0)
    proche(abs(_s(r, k, 1, 0)), 1.0, 1e-6, "|S21| a f0")
    zin = complex(*r["zin"][k])
    assert abs(zin - (14 - 8j)) < 1e-4, "Zin = %s au lieu de 14-8j" % zin
    assert r["bilan"]["s21_db"] > -1e-4, r["bilan"]
    # Sans pertes, la puissance se conserve a TOUTES les frequences.
    for k in range(len(r["freqs"])):
        t = abs(_s(r, k, 0, 0)) ** 2 + abs(_s(r, k, 1, 0)) ** 2
        proche(t, 1.0, 1e-9, "conservation a %.3g GHz" % (r["freqs"][k] / 1e9))
    # Et hors de f0, l'adaptation se degrade : le reseau est bien selectif.
    assert abs(_s(r, 0, 0, 0)) > 0.05


def la_piste_est_celle_de_simulation_em():
    """MEME PISTE, MEME MOTEUR : a 50/50 ohms, S generalises = cascade."""
    objets = [_piste(0, 0, 10, 0), _piste(10, 0, 10, 8), _piste(10, 8, 25, 8)]
    doc = _doc([("a", 50 + 0j), ("b", 50 + 0j)],
               branches=[{"a": "a", "b": "b", "net": "RF", "objets": objets}])
    r = rf.analyser(doc)
    ref = se.simuler(rf._doc_branche(doc, doc["branches"][0]))
    assert len(ref["s"]) == len(r["s"])
    for k in range(len(r["s"])):
        for i in range(4):
            vu = complex(*r["s"][k][i])
            att = complex(*ref["s"][k][i])
            assert abs(vu - att) < 1e-9, ("S[%d] a %.3g GHz : %s contre %s"
                                          % (i, r["freqs"][k] / 1e9, vu, att))
    fiche = r["branches"][0]
    assert fiche["z0_min"] == ref["ligne"]["z0_min"]
    assert fiche["sections"] and fiche["sections"][0]["couche"] == "TOP"


def une_piste_retournee_donne_le_meme_s21():
    objets = [_piste(0, 0, 12, 0, 0.35), _piste(12, 0, 20, 0, 1.0)]
    envers = [{**o, "start": o["end"], "end": o["start"]}
              for o in reversed(objets)]
    d1 = _doc([("a", 14 + 8j), ("b", 50 + 0j)],
              branches=[{"a": "a", "b": "b", "objets": objets}])
    d2 = _doc([("a", 14 + 8j), ("b", 50 + 0j)],
              branches=[{"a": "b", "b": "a", "objets": envers}])
    r1, r2 = rf.analyser(d1), rf.analyser(d2)
    k = _k0(r1)
    assert abs(_s(r1, k, 1, 0) - _s(r2, k, 1, 0)) < 1e-9
    assert abs(_s(r1, k, 0, 0) - _s(r2, k, 0, 0)) < 1e-9


def une_derivation_en_t_passe():
    """Le cas que la cascade refuse : une capacite a la masse au bout d'un T."""
    br = [{"a": "p1", "b": "t", "objets": [_piste(0, 0, 10, 0)]},
          {"a": "t", "b": "p2", "objets": [_piste(10, 0, 20, 0)]},
          {"a": "t", "b": "c", "objets": [_piste(10, 0, 10, 3)]}]
    r = rf.analyser(_doc([("p1", 50 + 0j), ("p2", 50 + 0j)],
                         [_ideal("C1", "C", 2e-12, "c", "g")],
                         br, masses=[{"noeud": "g", "couche": 0, "vias": [
                             {"x": 10, "y": 4, "percage": 0.3,
                              "couche_plan": 2}]}]))
    k = _k0(r)
    s11, s21 = _s(r, k, 0, 0), _s(r, k, 1, 0)
    assert abs(s11) ** 2 + abs(s21) ** 2 < 1.0, "reseau a pertes non passif"
    assert _s(r, k, 1, 0) != 0 and abs(s21) < 0.99, "la derivation ne pese pas"
    assert r["masses"][0]["l_nH"] > 0


# ==========================================================================
# Les modeles de composants
# ==========================================================================

def _murata(nom):
    with open(os.path.join(LIB_SIM, nom), encoding="utf-8",
              errors="replace") as f:
        return f.read()


def un_condensateur_murata_vaut_son_reseau_calcule_a_la_main():
    """Le GCM0335C1E120FA16 est une echelle serie de cellules paralleles :
    (C01|R01) + L02 + R03 + (L04|R04) + (C05|L05|R05) + (C06|L06|R06).
    On la somme a la main, valeurs recopiees du fichier."""
    m = rf.ModeleSpice(_murata("GCM0335C1E120FA16.sub"), "GCM")

    def par(*zs):
        return 1 / sum(1 / z for z in zs)
    for f in (100e6, 1e9, 2.84e9, 6e9):
        jw = 2j * math.pi * f
        z = (par(1 / (jw * 1.20e-11), 1.00e+11) + jw * 1.97e-10 + 1.88e-01
             + par(jw * 2.04e-11, 5.14e-01)
             + par(1 / (jw * 3.25e-11), jw * 9.75e-12, 1.15)
             + par(1 / (jw * 5.48e-12), jw * 3.75e-11, 1.00e+05))
        zm = 1 / m.y(f)[0, 0]
        assert abs(zm - z) < 1e-9 * abs(z), "%.3g GHz : %s contre %s" % (
            f / 1e9, zm, z)
    # Et il se comporte en condensateur de 12 pF loin sous sa resonance.
    zb = 1 / m.y(100e6)[0, 0]
    proche(abs(zb), 1 / (2 * math.pi * 100e6 * 1.2e-11), 0.05, "|Z| a 100 MHz")


def une_self_murata_se_charge():
    m = rf.ModeleSpice(_murata("LQW15AN10NG00.sub"), "LQW")
    z = 1 / m.y(100e6)[0, 0]
    proche(z.imag / (2 * math.pi * 100e6), 10e-9, 0.05, "L a 100 MHz")


def le_modele_generique_prend_ses_parametres():
    m = rf.ModeleSpice(_murata("capacitor.sub"), "cap",
                       params={"C": 1e-9, "ESR": 0.1, "ESL": 0.5e-9})
    f = 1e8
    w = 2 * math.pi * f
    attendu = 0.1 + 1j * w * 0.5e-9 + 1 / (1j * w * 1e-9)
    assert abs(1 / m.y(f)[0, 0] - attendu) < 1e-9 * abs(attendu)


def une_self_et_une_capa_en_parallele_comptent_toutes_les_deux():
    """Un circuit bouchon L // C en serie entre les ports : a sa resonance il
    coupe, S21 = 2 Z0 / (2 Z0 + Z) avec Z = 1 / (Y_L + Y_C). En ideal, puis
    avec les deux modeles SPICE Murata poses sur les memes noeuds."""
    def s21_attendu(f, y):
        return 100.0 / (100.0 + 1 / y)
    r = rf.analyser(_doc([("a", 50 + 0j), ("b", 50 + 0j)],
                         [_ideal("L1", "L", 10e-9, "a", "b"),
                          _ideal("C1", "C", 1e-12, "a", "b")],
                         f1=1.0e9, f2=2.2e9, points=13))
    for k, f in enumerate(r["freqs"]):
        w = 2 * math.pi * f
        y = 1 / (1j * w * 10e-9) + 1j * w * 1e-12
        assert abs(_s(r, k, 1, 0) - s21_attendu(f, y)) < 1e-6, f
    # A 1,59 GHz, le bouchon coupe : seule la self, ou seule la capa, passent.
    k = int(np.argmin([abs(_s(r, k, 1, 0)) for k in range(13)]))
    assert abs(_s(r, k, 1, 0)) < 0.1 and 1.4e9 < r["freqs"][k] < 1.8e9, \
        (r["freqs"][k], abs(_s(r, k, 1, 0)))
    ml = rf.ModeleSpice(_murata("LQW15AN10NG00.sub"), "LQW")
    mc = rf.ModeleSpice(_murata("GCM0335C1E120FA16.sub"), "GCM")
    doc = _doc([("a", 50 + 0j), ("b", 50 + 0j)], f1=0.3e9, f2=1.0e9, points=8)
    doc["composants"] = [
        {"ref": "L1", "noeuds": ["a", "b"], "modele": {
            "type": "spice", "texte": _murata("LQW15AN10NG00.sub")}},
        {"ref": "C1", "noeuds": ["a", "b"], "modele": {
            "type": "spice", "texte": _murata("GCM0335C1E120FA16.sub")}}]
    r = rf.analyser(doc)
    for k, f in enumerate(r["freqs"]):
        y = ml.y(f)[0, 0] + mc.y(f)[0, 0]
        assert abs(_s(r, k, 1, 0) - s21_attendu(f, y)) < 1e-6, f


def un_actif_spice_est_refuse_avec_la_consigne():
    try:
        rf.ModeleSpice(_murata("bjt_npn.sub"), "bjt_npn.sub")
    except rf.ErreurRF as exc:
        assert ".sNp" in exc.conseil, exc.conseil
    else:
        raise AssertionError("un transistor SPICE a ete accepte")


def un_snp_vaut_le_modele_qu_il_decrit():
    freqs = np.linspace(1e9, 4e9, 31)
    l_ = 3.3e-9
    mats = []
    for f in freqs:
        z = 1j * 2 * math.pi * f * l_ / 50.0
        mats.append(np.array([[z / (z + 2), 2 / (z + 2)],
                              [2 / (z + 2), z / (z + 2)]]))
    txt = se.touchstone(freqs, mats, 50.0)
    ports = [("a", 14 + 8j), ("b", 50 + 0j)]
    r1 = rf.analyser(_doc(ports, [_ideal("L1", "L", l_, "a", "b")]))
    r2 = rf.analyser(_doc(ports, [{"ref": "L1", "noeuds": ["a", "b"],
                                   "modele": {"type": "snp", "texte": txt,
                                              "nom": "l.s2p"}}]))
    for k in range(len(r1["s"])):
        assert abs(_s(r1, k, 1, 0) - _s(r2, k, 1, 0)) < 1e-3


def un_snp_actif_garde_sa_non_reciprocite():
    txt = "# GHZ S RI R 50\n1 0 0 10 0 0.01 0 0 0\n4 0 0 10 0 0.01 0 0 0\n"
    r = rf.analyser(_doc([("a", 50 + 0j), ("b", 50 + 0j)],
                         [{"ref": "U2", "noeuds": ["a", "b"],
                           "modele": {"type": "snp", "texte": txt,
                                      "nom": "lna.s2p"}}]))
    k = _k0(r)
    proche(abs(_s(r, k, 1, 0)), 10.0, 1e-9, "gain de l'amplificateur")
    proche(abs(_s(r, k, 0, 1)), 0.01, 1e-9, "isolation inverse")
    proche(r["bilan"]["s21_db"], 20.0, 1e-9, "S21 en dB")


def un_snp_thru_parfait_passe():
    """Un fil mesure n'a pas de matrice Y : le bloc se pose en S."""
    txt = "# GHZ S RI R 50\n1 0 0 1 0 1 0 0 0\n4 0 0 1 0 1 0 0 0\n"
    r = rf.analyser(_doc([("a", 14 + 8j), ("b", 50 + 0j)],
                         [{"ref": "R1", "noeuds": ["a", "b"],
                           "modele": {"type": "snp", "texte": txt,
                                      "nom": "thru.s2p"}}]))
    attendu = 4 * 14 * 50 / abs(64 + 8j) ** 2
    proche(abs(_s(r, _k0(r), 1, 0)) ** 2, attendu, 1e-9, "|S21|^2 d'un thru")


def un_snp_hors_de_sa_bande_est_refuse():
    txt = "# GHZ S RI R 50\n1 0 0 1 0 1 0 0 0\n2 0 0 1 0 1 0 0 0\n"
    try:
        rf.analyser(_doc([("a", 50 + 0j), ("b", 50 + 0j)],
                         [{"ref": "X", "noeuds": ["a", "b"],
                           "modele": {"type": "snp", "texte": txt,
                                      "nom": "x.s2p"}}]))
    except rf.ErreurRF as exc:
        assert "x.s2p" in exc.message
    else:
        raise AssertionError("extrapolation silencieuse au-dela de 2 GHz")


def les_vias_de_masse_en_parallele():
    un = rf.inductance_masse(QUATRE, 0, [{"x": 0, "y": 0, "percage": 0.3,
                                          "couche_plan": 2}])
    loin = rf.inductance_masse(QUATRE, 0, [
        {"x": 0, "y": 0, "percage": 0.3, "couche_plan": 2},
        {"x": 5, "y": 0, "percage": 0.3, "couche_plan": 2}])
    pres = rf.inductance_masse(QUATRE, 0, [
        {"x": 0, "y": 0, "percage": 0.3, "couche_plan": 2},
        {"x": 0.5, "y": 0, "percage": 0.3, "couche_plan": 2}])
    assert 0.02e-9 < un < 0.5e-9, "via TOP -> GND : %.3g nH" % (un * 1e9)
    assert un / 2 < loin < pres < un, (un, loin, pres)


# ==========================================================================
# Les refus
# ==========================================================================

# ==========================================================================
# Les surfaces, le couplage, les broches annexes
# ==========================================================================

def une_pastille_vaut_au_moins_sa_plaque():
    """La plaque parallele (sans frange) est une BORNE INFERIEURE, et la
    frange d'une pastille de 0,5 mm sur 0,2 mm de stratifie ne double pas."""
    s = {"couche": 0, "largeur": 0.5, "longueur": 0.6}
    cache = {}
    c, _ = rf.capacite_surface(QUATRE, s, cache)
    plaque = 8.854e-12 * 4.2 * 0.5e-3 * 0.6e-3 / 0.2e-3
    assert plaque < c < 3 * plaque, (c, plaque)
    # LA FRANGE DE BOUT EST CALCULEE en 3D : l'allongement equivalent de
    # bout ouvert qu'on en tire tombe entre Hammerstad-Bekkadal et
    # Kirschning-Jansen, formules exterieures qui different deja entre elles.
    li = rf._ligne(QUATRE, 0, 0.4, 0.035, cache)
    c1 = rf.capacite_pastille(QUATRE, 0, 0.4, 2.0, 0.035, cache)[0]
    c2 = rf.capacite_pastille(QUATRE, 0, 0.4, 4.0, 0.035, cache)[0]
    cp = (c2 - c1) / 2e-3
    dl = (c1 - cp * 2e-3) / 2 / cp
    h, e, u = li["h"], li["eps"], 0.4e-3 / li["h"]
    dl_h = 0.412 * h * (e + 0.3) * (u + 0.264) / ((e - 0.258) * (u + 0.8))
    assert 0.85 * dl_h < dl < 1.2 * dl_h, (dl, dl_h)
    # Le recouvrement d'une piste deja comptee par sa branche est ote.
    s["recouvrements"] = [{"largeur": 0.3, "longueur": 0.3}]
    c2, _ = rf.capacite_surface(QUATRE, s, {})
    assert 0 < c2 < c


def une_pastille_charge_le_noeud():
    ports = [("a", 50 + 0j), ("b", 50 + 0j)]
    fil = [_ideal("R0", "R", 0.0, "a", "b")]
    nu = rf.analyser(_doc(ports, fil))
    avec = rf.analyser(dict(_doc(ports, fil), pastilles=[
        {"noeud": "a", "couche": 0, "largeur": 2.0, "longueur": 2.0}]))
    k = _k0(avec)
    assert abs(_s(nu, k, 1, 0) - 1) < 1e-9
    c = avec["surfaces"][0]["c_pF"] * 1e-12
    y = 2j * math.pi * F0 * c * 50
    # c_pF est arrondi a 1e-4 pF dans la fiche : d'ou la tolerance.
    proche(abs(_s(avec, k, 1, 0)), abs(2 / (2 + y)), 1e-4,
           "S21 d'une capacite en derivation")


def _paire(ecart, longueur=10.0):
    """Deux pistes paralleles, chacune entre deux ports ou deux 50 ohms."""
    w = 0.35
    d = w + ecart
    return [{"a": "p1", "b": "p2", "net": "A",
             "objets": [_piste(0, 0, longueur, 0, w)]},
            {"a": "q1", "b": "q2", "net": "B",
             "objets": [_piste(0, d, longueur, d, w)]}]


def _doc_paire(ecart, couplage=True):
    d = _doc([("p1", 50 + 0j), ("p2", 50 + 0j)],
             [_ideal("RQ1", "R", 50.0, "q1", "0"),
              _ideal("RQ2", "R", 50.0, "q2", "0")], _paire(ecart))
    d["couplage"] = couplage
    return d


def deux_pistes_proches_se_couplent():
    r = rf.analyser(_doc_paire(0.15))
    assert len(r["couplages"]) == 1, r["couplages"]
    c = r["couplages"][0]
    assert c["longueur"] == 10.0 and 0.5 < c["next_pct"] < 30, c
    sans = rf.analyser(_doc_paire(0.15, couplage=False))
    k = _k0(r)
    perdu = abs(_s(sans, k, 1, 0)) - abs(_s(r, k, 1, 0))
    assert perdu > 1e-4, "le couplage ne prend rien a la ligne : %g" % perdu


def le_couplage_ne_cree_pas_de_puissance():
    doc = _doc_paire(0.15)
    for c in doc["stackup"]["layers"]:
        if c.get("type") == "dielectric":
            c["tan_delta"] = 0.0
    r = rf.analyser(doc)
    for k in range(len(r["freqs"])):
        t = abs(_s(r, k, 0, 0)) ** 2 + abs(_s(r, k, 1, 0)) ** 2
        assert t <= 1.0 + 1e-9, "puissance creee : %g" % t


def au_dela_de_3h_rien_ne_se_couple():
    r = rf.analyser(_doc_paire(1.0))       # h = 0,2 mm : 1 mm > 3 h
    assert not r["couplages"]
    ref = rf.analyser(_doc_paire(1.0, couplage=False))
    assert all(abs(complex(*a) - complex(*b)) < 1e-12
               for m1, m2 in zip(r["s"], ref["s"]) for a, b in zip(m1, m2))


def un_couple_decoupe_garde_la_longueur():
    """Une piste plus longue que le longement : decoupee, elle doit garder sa
    longueur de cuivre entiere dans la fiche."""
    br = _paire(0.15)
    br[0]["objets"] = [_piste(-5, 0, 15, 0, 0.35)]
    doc = _doc([("p1", 50 + 0j), ("p2", 50 + 0j)],
               [_ideal("RQ1", "R", 50.0, "q1", "0"),
                _ideal("RQ2", "R", 50.0, "q2", "0")], br)
    r = rf.analyser(doc)
    assert r["couplages"][0]["longueur"] == 10.0
    assert abs(r["branches"][0]["longueur"] - 20.0) < 1e-6, r["branches"][0]


def une_piste_voisine_vaut_une_branche_fermee_sur_son_z0():
    """La piste d'un autre net, envoyee en « voisine », doit rendre EXACTEMENT
    ce que rend la meme piste posee en branche et fermee a ses deux bouts sur
    son impedance caracteristique -- et dire la puissance qu'elle emporte."""
    br = _paire(0.15)
    z0 = rf._ligne(rf.se.doc_valide(dict(_doc([("a", 50j + 50)]),
                                         format="cao-sim-em-3",
                                         geometry={"objects": [{"type": "track"}]}))[0],
                   0, 0.35, 0.035, {})["z0"]
    ref = _doc([("p1", 50 + 0j), ("p2", 50 + 0j)],
               [_ideal("RQ1", "R", z0, "q1", "0"),
                _ideal("RQ2", "R", z0, "q2", "0")], br)
    doc = _doc([("p1", 50 + 0j), ("p2", 50 + 0j)], (), br[:1])
    doc["voisines"] = [{"net": "B", "objets": br[1]["objets"]}]
    for d in (ref, doc):
        for c in d["stackup"]["layers"]:
            if c.get("type") == "dielectric":
                c["tan_delta"] = 0.0
    r1, r2 = rf.analyser(ref), rf.analyser(doc)
    for m1, m2 in zip(r1["s"], r2["s"]):
        for a, b in zip(m1, m2):
            assert abs(complex(*a) - complex(*b)) < 1e-9, (a, b)
    k = _k0(r2)
    manque = 100 * (1 - abs(_s(r2, k, 0, 0)) ** 2 - abs(_s(r2, k, 1, 0)) ** 2)
    pct = r2["bilan"]["voisines_pct"]
    assert r2["voisines"][0]["net"] == "B" and pct > 0.1, r2["voisines"]
    # Ce qui manque au bilan = la voisine + le cuivre (qui ne pese ici que
    # quelques dixiemes de %).
    assert pct <= manque + 1e-6 and manque - pct < 1.0, (pct, manque)
    # Une voisine que rien ne couple est laissee : rien ne change.
    loin = dict(doc, voisines=[{"net": "C", "objets": [_piste(0, 3, 10, 3)]}])
    r3 = rf.analyser(loin)
    assert not r3["voisines"] and r3["bilan"]["s21_db"] == rf.analyser(
        dict(doc, voisines=[]))["bilan"]["s21_db"]


# ==========================================================================
# Les selfs couplees et les fentes du plan
# ==========================================================================

def la_mutuelle_de_neumann_rend_celle_de_maxwell():
    """Deux spires coaxiales de 1 mm de rayon a 0,5 mm : Maxwell donne
    M = mu0 rac(ab) [(2/k - k) K - (2/k) E], k^2 = 4ab / ((a+b)^2 + d^2)."""
    from scipy.special import ellipk, ellipe
    a, d, n = 1e-3, 0.5e-3, 96
    th = np.linspace(0, 2 * math.pi, n + 1)

    def spire(z):
        pts = np.stack([a * np.cos(th), a * np.sin(th), np.full(n + 1, z)], 1)
        return pts[:-1], pts[1:], np.ones(n)
    m = rf._neumann(*(spire(0.0) + spire(d)))
    k2 = 4 * a * a / ((2 * a) ** 2 + d * d)
    k = math.sqrt(k2)
    attendu = rf.MU_0 * a * ((2 / k - k) * ellipk(k2) - 2 / k * ellipe(k2))
    proche(m, attendu, 2e-3, "mutuelle de deux spires")


def _self(ref, x0, y0, x1, y1, a, b, l_h=10e-9):
    return {"ref": ref, "noeuds": [a, b], "genre": "L",
            "geo": {"x0": x0, "y0": y0, "x1": x1, "y1": y1, "largeur": 0.5,
                    "couche": 0},
            "modele": {"type": "ideal", "genre": "L", "valeur": l_h}}


def deux_selfs_bout_a_bout_s_ajoutent_leur_mutuelle():
    """L1 et L2 en serie, sur le meme axe : Z = jw (L1 + L2 + 2M), M > 0 ;
    cote a cote, axes paralleles, la mutuelle change de signe."""
    doc = _doc([("a", 50 + 0j), ("b", 50 + 0j)],
               [_self("L1", 0, 0, 1, 0, "a", "m"),
                _self("L2", 1.6, 0, 2.6, 0, "m", "b")], f1=1e8, f2=1e9,
               points=5)
    r = rf.analyser(doc)
    m = r["mutuelles"][0]
    assert m["m_nH"] > 0 and 0.001 < m["k"] < 0.3, m
    for k, f in enumerate(r["freqs"]):
        z = 2j * math.pi * f * (20e-9 + 2 * m["m_nH"] * 1e-9)
        assert abs(_s(r, k, 1, 0) - 100 / (100 + z)) < 1e-6, f
        assert abs(_s(r, k, 1, 0) - _s(r, k, 0, 1)) < 1e-12, "non reciproque"
    cote = _doc([("a", 50 + 0j), ("b", 50 + 0j)],
                [_self("L1", 0, 0, 1, 0, "a", "m"),
                 _self("L2", 0, 1.0, 1, 1.0, "m", "b")], f1=1e8, f2=1e9,
                points=3)
    mc = rf.analyser(cote)["mutuelles"][0]
    assert mc["m_nH"] < 0 and abs(mc["k"]) < 0.3, mc
    loin = rf.analyser(_doc([("a", 50 + 0j), ("b", 50 + 0j)],
                            [_self("L1", 0, 0, 1, 0, "a", "m"),
                             _self("L2", 20, 0, 21, 0, "m", "b")],
                            f1=1e8, f2=1e9, points=3))
    assert not loin["mutuelles"]


def une_self_induit_dans_la_piste_qui_la_longe():
    br = [{"a": "m", "b": "b", "net": "RF", "objets": [_piste(-3, 0.8, 5, 0.8)]}]
    doc = _doc([("a", 50 + 0j), ("b", 50 + 0j)],
               [_self("L1", 0, 0, 1, 0, "a", "m")], br)
    r = rf.analyser(doc)
    mp = [m for m in r["mutuelles"] if "piste" in " ".join(m["entre"])]
    assert mp and 1e-3 < abs(mp[0]["m_nH"]) < 1.0, r["mutuelles"]
    for k in range(len(r["freqs"])):
        assert abs(_s(r, k, 1, 0) - _s(r, k, 0, 1)) < 1e-12
    assert any("enroulement" in w for w in r["avertissements"])


def une_fente_du_plan_est_la_self_de_ott():
    """A basse frequence, une fente franchie vaut la self de Ott : deux
    detours (mu0/pi) 2d ln(2d/W) en parallele, poses au depart."""
    fente = {"d1": 3.0, "d2": 5.0, "g": 0.3, "largeur": 0.35, "plan": 2}
    br = {"a": "a", "b": "b", "net": "RF", "objets": [_piste(0, 0, 10, 0)],
          "fentes": [fente]}
    doc = _doc([("a", 50 + 0j), ("b", 50 + 0j)], (), [br], f1=5e7, f2=1.5e8,
               points=3)
    doc["analyse"]["f_centre"] = 1e8
    r = rf.analyser(doc)
    ld = [rf.MU_0 / math.pi * 2 * d * 1e-3 * math.log(2 * d / 0.35)
          for d in (3.0, 5.0)]
    lp = ld[0] * ld[1] / (ld[0] + ld[1])
    ref = _doc([("a", 50 + 0j), ("b", 50 + 0j)],
               [_ideal("LF", "L", lp, "a", "a2")],
               [dict(br, a="a2", fentes=[])], f1=5e7, f2=1.5e8, points=3)
    ref["analyse"]["f_centre"] = 1e8
    r0 = rf.analyser(ref)
    assert len(r["freqs"]) == 3 and max(r["freqs"]) <= 1.5e8, r["freqs"]
    for k in range(3):
        assert abs(_s(r, k, 1, 0) - _s(r0, k, 1, 0)) < 2e-4, k
    assert r["branches"][0]["fentes"][0]["d1"] == 3.0
    haut = rf.analyser(_doc([("a", 50 + 0j), ("b", 50 + 0j)], (), [br],
                            f1=3e9, f2=3e9, points=1))
    sans = rf.analyser(_doc([("a", 50 + 0j), ("b", 50 + 0j)], (),
                            [dict(br, fentes=[])], f1=3e9, f2=3e9, points=1))
    assert abs(_s(haut, 0, 1, 0)) < abs(_s(sans, 0, 1, 0)) - 0.01


def une_broche_annexe_porte_son_impedance():
    ports = [("a", 50 + 0j), ("b", 50 + 0j)]
    fil = [_ideal("R0", "R", 0.0, "a", "b"),
           {"ref": "U1.5", "noeuds": ["a"],
            "modele": {"type": "z", "re": 50, "im": 0}}]
    r = rf.analyser(_doc(ports, fil))
    # 50 ohms en derivation sur une ligne 50/50 : S21 = 2/3.
    proche(abs(_s(r, _k0(r), 1, 0)), 2 / 3, 1e-9, "S21 avec 50 ohms au noeud")


def la_ligne_couplee_sans_pertes_est_celle_du_crosstalk():
    """phi_mtl (Pade) contre crosstalk.chaine_mtl (base modale) : meme L, C."""
    import crosstalk
    l_m = np.array([[3.2e-7, 6e-8], [6e-8, 3.0e-7]])
    c_m = np.array([[1.3e-10, -2e-11], [-2e-11, 1.25e-10]])
    freqs = [1e8, 2.4e9, 6e9]
    ref = crosstalk.chaine_mtl(l_m, c_m, 0.012, 2 * np.pi * np.array(freqs))
    vu = rf.phi_mtl(l_m, c_m, [[0, 0]] * 3, 0.0, 0.012, freqs)
    for a, b in zip(vu, ref):
        assert np.allclose(a, b, rtol=1e-7, atol=1e-9), (a, b)


def les_pertes_du_cuivre_attenuent_en_exp():
    """Un conducteur seul, adapte : |S21| = exp(-R l / 2 Z0)."""
    l_, c_ = 3.2e-7, 1.28e-10
    z0 = math.sqrt(l_ / c_)
    r_ = 20.0                                       # ohm/m
    p = rf.phi_mtl(np.array([[l_]]), np.array([[c_]]), [[r_]], 0.0, 0.05,
                   [1e9])[0]
    # ABCD d'un conducteur seul, puis S sur Z0 : le module de S21.
    a_, b_, c2, d_ = p[0, 0], -p[0, 1], -p[1, 0], p[1, 1]
    s21 = 2 / (a_ + b_ / z0 + c2 * z0 + d_)
    proche(abs(s21), math.exp(-r_ * 0.05 / (2 * z0)), 1e-3, "attenuation")


def trois_pistes_font_une_section_a_trois():
    w = 0.35
    br = _paire(0.15)
    br.append({"a": "s1", "b": "s2", "net": "C",
               "objets": [_piste(0, 2 * (w + 0.15), 10, 2 * (w + 0.15), w)]})
    doc = _doc([("p1", 50 + 0j), ("p2", 50 + 0j)],
               [_ideal("RQ1", "R", 50.0, "q1", "0"),
                _ideal("RQ2", "R", 50.0, "q2", "0"),
                _ideal("RS1", "R", 50.0, "s1", "0"),
                _ideal("RS2", "R", 50.0, "s2", "0")], br)
    r = rf.analyser(doc)
    assert len(r["couplages"]) == 1 and len(r["couplages"][0]["nets"]) == 3,         r["couplages"]


def le_via_au_bord_d_un_longement_est_compte():
    """Le troncon couple arrive par un via : le raccord le rend a la chaine."""
    w = 0.35
    a = _piste(-5, 0, 0, 0, w)
    a["layer"] = 6
    b = _piste(0, 0, 10, 0, w)
    b["via"] = {"drill_diameter": 0.3, "pad_diameter": 0.6}
    br = _paire(0.15)
    br[0]["objets"] = [a, b]
    doc = _doc([("p1", 50 + 0j), ("p2", 50 + 0j)],
               [_ideal("RQ1", "R", 50.0, "q1", "0"),
                _ideal("RQ2", "R", 50.0, "q2", "0")], br)
    r = rf.analyser(doc)
    assert r["couplages"], "le longement doit etre vu"
    assert r["branches"][0]["vias"] == 1, r["branches"][0]
    assert abs(r["branches"][0]["longueur"] - 15.0) < 1e-6


def une_zone_large_se_comporte_en_ligne():
    """Une plage de 3 mm sur 20, maillee, contre la ligne MoM de 3 mm."""
    doc_z = _doc([("a", 50 + 0j), ("b", 50 + 0j)], f1=0.5e9, f2=3e9)
    doc_z["zones"] = [{"noeud": "Z", "couche": 0, "cuivre": 0.035,
                       "pts": [0, 0, 20, 0, 20, 3, 0, 3], "aire": 60.0,
                       # ATTAQUEE SUR TOUTE SA LARGEUR, comme la ligne : un
                       # acces ponctuel ajouterait une self d'etalement que
                       # la ligne n'a pas.
                       "acces": [{"noeud": n, "x": x, "y": y}
                                 for n, x in (("a", 0.05), ("b", 19.95))
                                 for y in (0.1, 0.5, 0.9, 1.3, 1.7, 2.1,
                                           2.5, 2.9)]}]
    rz = rf.analyser(doc_z)
    doc_l = _doc([("a", 50 + 0j), ("b", 50 + 0j)], f1=0.5e9, f2=3e9,
                 branches=[{"a": "a", "b": "b",
                            "objets": [_piste(0, 1.5, 20, 1.5, 3.0)]}])
    rl = rf.analyser(doc_l)
    k = _k0(rz)
    sz, sl = _s(rz, k, 1, 0), _s(rl, k, 1, 0)
    proche(abs(sz), abs(sl), 0.05, "|S21| zone contre ligne")
    assert abs(cmath.phase(sz / sl)) < math.radians(12),         "phase : %g contre %g" % (cmath.phase(sz), cmath.phase(sl))
    assert rz["surfaces"][0]["cellules"] > 20


def la_piste_de_masse_s_ajoute_au_via():
    via = {"x": 0, "y": 0, "percage": 0.3, "couche_plan": 2}
    seul = rf.admittance_masse(QUATRE, {"couche": 0, "vias": [via]}, [1e9], {})
    avec = rf.admittance_masse(QUATRE, {"couche": 0, "vias": [dict(via, piste={
        "longueur": 2.0, "largeur": 0.3, "couche": 0})]}, [1e9], {})
    l_seul = (1 / seul[0]).imag / (2 * math.pi * 1e9)
    l_avec = (1 / avec[0]).imag / (2 * math.pi * 1e9)
    assert l_avec > l_seul + 0.3e-9, (l_seul, l_avec)
    assert (1 / avec[0]).real > 0, "la piste de masse a sa resistance"


def la_dispersion_modale_est_celle_de_getsinger():
    """Un conducteur seul : la dispersion modale redonne Getsinger ; deux
    conducteurs : au continu, [L] et [C] ne bougent pas."""
    import ligne_mom as tl
    z0, eps, er, h = 50.0, 3.2, 4.3, 0.2e-3
    l1 = np.array([[z0 * math.sqrt(eps) / tl.C_0]])
    c1 = np.array([[math.sqrt(eps) / (tl.C_0 * z0)]])
    ls, cs = rf.dispersion_modale(l1, c1, er, h, [5e9])
    eps_f, z_f = tl.dispersion_getsinger(z0, eps, er, h, 5e9)
    proche(tl.C_0 ** 2 * float(ls[0][0, 0] * cs[0][0, 0]), eps_f, 1e-9,
           "eps(f) d'un conducteur seul")
    proche(math.sqrt(float(ls[0][0, 0] / cs[0][0, 0])), z_f, 1e-9, "Z(f)")
    l_m = np.array([[3.2e-7, 6e-8], [6e-8, 3.0e-7]])
    c_m = np.array([[1.3e-10, -2e-11], [-2e-11, 1.25e-10]])
    ls, cs = rf.dispersion_modale(l_m, c_m, 4.3, h, [1.0])
    assert np.allclose(ls[0], l_m, rtol=1e-6) and \
        np.allclose(cs[0], c_m, rtol=1e-6)


def le_masque_ote_le_degagement():
    """Le meme contour, dont la moitie droite n'est pas remplie."""
    base = {"couche": 0, "cuivre": 0.035, "pts": [0, 0, 10, 0, 10, 4, 0, 4],
            "aire": 40.0, "acces": [{"noeud": "a", "x": 1, "y": 2}]}
    plein = rf.maillage_zone(QUATRE, base, 3e9, {})
    nx, ny = 20, 8                      # pas de 0,5 mm
    # Rangees : 10 plein, 10 vide ; la premiere plage est « vide » de 0.
    masque = {"x0": 0, "y0": 0, "pas": 0.5, "nx": nx, "ny": ny,
              "plages": [0] + [10, 10] * ny}
    moitie = rf.maillage_zone(QUATRE, dict(base, masque=masque), 3e9, {})
    proche(float(plein["aire"].sum()), 40.0, 0.02, "surface maillee pleine")
    proche(float(moitie["aire"].sum()), 20.0, 0.05, "surface a moitie")
    assert (moitie["cx"] < 5).all()


def la_coulee_de_masse_est_maillee():
    """C1 en derivation, sa pastille de masse dans une coulee : les vias de
    la coulee la descendent au plan, a travers le maillage."""
    ports = [("p1", 50 + 0j), ("p2", 50 + 0j)]
    comp = [_ideal("R0", "R", 0.0, "p1", "p2"),
            _ideal("C1", "C", 10e-12, "p2", "g")]
    ideal = rf.analyser(_doc(ports, [_ideal("R0", "R", 0.0, "p1", "p2"),
                                     _ideal("C1", "C", 10e-12, "p2", "0")]))
    doc = _doc(ports, comp, masses=[{"noeud": "g", "couche": 0, "vias": [],
        "coulee": {"couche": 0, "cuivre": 0.035,
                   "pts": [-5, -5, 5, -5, 5, 5, -5, 5], "aire": 100.0,
                   "centre": [0, 0], "rayon": 3.0,
                   "vias": [{"x": 2.0, "y": 0, "percage": 0.3,
                             "couche_plan": 2}]}}])
    r = rf.analyser(doc)
    k = _k0(r)
    # 10 pF a 2,44 GHz resonne avec ~0,4 nH : la masse reelle pese.
    assert abs(_s(r, k, 1, 0) - _s(ideal, k, 1, 0)) > 0.02, \
        (_s(r, k, 1, 0), _s(ideal, k, 1, 0))
    t_ = abs(_s(r, k, 0, 0)) ** 2 + abs(_s(r, k, 1, 0)) ** 2
    assert t_ <= 1 + 1e-9


def la_plaque_3d_retrouve_ses_etalons():
    """Le carre isole (Read 1997 : 0,36679 x 4 pi e0 a) ; la capacite par
    metre d'un microruban, dans le vide et sur FR-4, contre Hammerstad-Jensen
    -- qui valide la fonction de Green du stratifie."""
    a = 1e-3
    proche(rf.capacite_plaque_3d(a, a, 200 * a) / (4 * math.pi * rf.EPS_0 * a),
           0.36679, 0.005, "carre isole")
    h = 0.2e-3
    for er, u in ((1.0, 1.0), (4.2, 1.0), (4.2, 5.0)):
        w = u * h
        c1 = rf.capacite_plaque_3d(w, 6 * h, h, er=er)
        c2 = rf.capacite_plaque_3d(w, 12 * h, h, er=er)
        a_ = 1 + math.log((u ** 4 + (u / 52) ** 2) / (u ** 4 + 0.432)) / 49             + math.log(1 + (u / 18.1) ** 3) / 18.7
        b_ = 0.564 * ((er - 0.9) / (er + 3)) ** 0.053
        e = (er + 1) / 2 + (er - 1) / 2 * (1 + 10 / u) ** (-a_ * b_)
        f = 6 + (2 * math.pi - 6) * math.exp(-(30.666 / u) ** 0.7528)
        z = 60 * math.log(f / u + math.sqrt(1 + 4 / u ** 2)) / math.sqrt(e)
        proche((c2 - c1) / (6 * h), math.sqrt(e) / (299792458.0 * z), 0.01,
               "C par metre, er %g, W/h %g" % (er, u))


def deux_pistes_qui_s_ecartent_sont_recoupees():
    """Une piste a 0,15 mm de l'autre a un bout, 0,45 mm a l'autre : chaque
    morceau couple porte son propre ecart, et ils croissent."""
    w = 0.35
    br = [{"a": "p1", "b": "p2", "net": "A",
           "objets": [_piste(0, 0, 10, 0, w)]},
          {"a": "q1", "b": "q2", "net": "B",
           "objets": [_piste(0, w + 0.15, 10, w + 0.45, w)]}]
    doc = _doc([("p1", 50 + 0j), ("p2", 50 + 0j)],
               [_ideal("RQ1", "R", 50.0, "q1", "0"),
                _ideal("RQ2", "R", 50.0, "q2", "0")], br)
    r = rf.analyser(doc)
    ec = [c["ecart"] for c in r["couplages"]]
    assert len(ec) >= 5, ec
    assert all(b > a for a, b in zip(ec, ec[1:])), ec
    assert abs(sum(c["longueur"] for c in r["couplages"]) - 10.0) < 0.01
    assert abs(r["branches"][1]["longueur"] - math.hypot(10, 0.3)) < 1e-3


def _doc_grande_coulee():
    ports = [("p1", 50 + 0j), ("p2", 50 + 0j)]
    comp = [_ideal("R0", "R", 0.0, "p1", "p2"),
            _ideal("C1", "C", 10e-12, "p2", "g")]
    vias = [{"x": x, "y": y, "percage": 0.3, "couche_plan": 2}
            for x in (-25, -15, -5, 5, 15, 25) for y in (-25, -15, -5, 5,
                                                          15, 25)]
    return _doc(ports, comp, masses=[{"noeud": "g", "couche": 0, "vias": [],
        "coulee": {"id": "GND0", "couche": 0, "cuivre": 0.035,
                   "pts": [-30, -30, 30, -30, 30, 30, -30, 30],
                   "centre": [0, 0], "vias": vias}}])


def une_grande_coulee_est_maillee_en_entier():
    """60 x 60 mm, 36 vias : bien au-dela des 400 cellules d'autrefois, et
    maillee EN ENTIER, fin pres de la pastille, grossier au loin."""
    import time
    t0 = time.time()
    r = rf.analyser(_doc_grande_coulee())
    duree = time.time() - t0
    s = [x for x in r["surfaces"] if x["genre"] == "coulées"][0]
    assert s["cellules"] > 400, s
    assert s["pas_max_mm"] > 4 * s["pas_min_mm"], s
    assert duree < 30, "%.1f s" % duree
    assert len(r["masses"]) == 36


def le_creux_et_le_plein_donnent_le_meme_s():
    """Au-dela de 400 inconnues la resolution passe en creux : elle doit
    redonner la resolution pleine au bit pres, sur un reseau ou la pleine
    reste abordable."""
    doc = _doc_grande_coulee()
    cl = doc["masses"][0]["coulee"]
    cl["pts"] = [-6, -6, 6, -6, 6, 6, -6, 6]
    cl["vias"] = [v for v in cl["vias"] if abs(v["x"]) < 6 and abs(v["y"]) < 6]
    creux = rf.analyser(doc)
    memo = rf._SPARSE
    rf._SPARSE = None
    try:
        plein = rf.analyser(doc)
    finally:
        rf._SPARSE = memo
    for a, b in zip(creux["s"], plein["s"]):
        for u, v in zip(a, b):
            assert abs(complex(*u) - complex(*v)) < 1e-9, (u, v)


def le_domaine_quasi_statique_est_dit():
    """Une piste de 5 mm sur 0,2 mm de FR-4 a son premier mode superieur vers
    13,8 GHz (c0 / 2 W_eff rac(er)) : une bande qui monte a 15 GHz le fait
    dire ; a 2,44 GHz, rien a dire."""
    def doc(w, f2):
        return _doc([("a", 50 + 0j), ("b", 50 + 0j)], f1=1e9, f2=f2,
                    branches=[{"a": "a", "b": "b", "net": "RF",
                               "objets": [_piste(0, 0, 10, 0, w)]}])
    large = rf.analyser(doc(5.0, 15e9))
    v = large["validite"]
    assert v["limites"][0]["cause"] == "mode supérieur", v["limites"][0]
    proche(v["f_max"], 13.8e9, 0.05, "coupure du premier mode superieur")
    assert any("HORS DU DOMAINE" in a for a in large["avertissements"])
    fin = rf.analyser(doc(0.35, 3e9))
    assert fin["validite"]["f_max"] > 20e9
    assert not any("HORS DU DOMAINE" in a for a in fin["avertissements"])


def une_zone_etroite_ou_large_rejoint_la_ligne_mom():
    """La zone maillee contre la ligne MoM de meme largeur, de l'etroit (les
    franges font la self : dualite L' = mu0 eps0 / C'_vide) au large (la
    plaque) : phase de S21 a 3 degres, Zin a 15 %."""
    for w in (0.3, 1.0, 3.0):
        ys = [w * (i + 0.5) / 4 for i in range(4)]
        dz = _doc([("a", 50 + 0j), ("b", 50 + 0j)], f1=1e9, f2=3e9)
        dz["zones"] = [{"noeud": "Z", "couche": 0, "cuivre": 0.035,
                        "pts": [0, 0, 5, 0, 5, w, 0, w],
                        "acces": [{"noeud": n, "x": x, "y": y}
                                  for n, x in (("a", 0.01), ("b", 4.99))
                                  for y in ys]}]
        rz = rf.analyser(dz)
        rl = rf.analyser(_doc([("a", 50 + 0j), ("b", 50 + 0j)], f1=1e9,
                              f2=3e9, branches=[{"a": "a", "b": "b",
                                  "objets": [_piste(0, w / 2, 5, w / 2, w)]}]))
        k = _k0(rz)
        dphi = abs(cmath.phase(_s(rz, k, 1, 0) / _s(rl, k, 1, 0)))
        assert dphi < math.radians(3), "w %g : %.2f deg" % (w, math.degrees(dphi))
        zz, zl = complex(*rz["zin"][k]), complex(*rl["zin"][k])
        assert abs(zz - zl) < 0.15 * abs(zl), "w %g : %s contre %s" % (w, zz, zl)


def les_refus():
    for ports, quoi in ((["a", "a"], "meme noeud"), (["0", "b"], "masse")):
        try:
            rf.analyser(_doc([(ports[0], 50 + 0j), (ports[1], 50 + 0j)],
                             [_ideal("R", "R", 1, "a", "b")]))
        except rf.ErreurRF:
            pass
        else:
            raise AssertionError("port refuse attendu : " + quoi)
    try:
        rf.analyser(_doc([("a", -5 + 0j), ("b", 50 + 0j)],
                         [_ideal("R", "R", 1, "a", "b")]))
    except rf.ErreurRF:
        pass
    else:
        raise AssertionError("une partie reelle negative a ete acceptee")


for nom, fn in list(globals().items()):
    if callable(fn) and getattr(fn, "__module__", "") == "__main__" \
            and not nom.startswith("_") and nom not in ("T", "proche"):
        T(nom.replace("_", " "), fn)

print("\n" + "-" * 62)
print("  %d cas, %s" % (ok + ko, "tous passes" if not ko else "%d en echec" % ko))
sys.exit(1 if ko else 0)
