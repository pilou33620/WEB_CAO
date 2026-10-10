"""Banc d'essai du diagramme de l'oeil (python/oeil.py).

    python python/test/banc-oeil.py

Des etalons que ce code ne fabrique pas lui-meme :

  · une ligne adaptee sans pertes laisse passer un oeil PARFAIT : la moitie
    de l'excursion a vide (pont diviseur Rs / RL), une UI de large, et le
    retard de la ligne ;
  · une ligne ouverte au bout, attaquee par 30 ohms : le diagramme en treillis
    (Bewley) donne le curseur principal 2 Z0 / (Z0 + Rs) et l'interference
    entre bits sum (Gs GL)^m -- l'oeil pire cas en sort A LA MAIN ;
  · le pire cas (PDA) n'est jamais plus ouvert que l'oeil PRBS ;
  · un CTLE, une pre-accentuation, un DFE OUVRENT un oeil ferme par les pertes ;
  · la marge d'un gabarit est exactement son facteur d'agrandissement ;
  · `simulation_em.simuler` rend la meme cascade sur une grille imposee que
    sur la sienne.

Style des autres bancs du depot : pas de pytest, un decompte, un code de retour.
"""

import math
import os
import sys

import numpy as np

RACINE = os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(RACINE, "python"))

import ibis                                                          # noqa: E402
import oeil                                                          # noqa: E402
import simulation_em as se                                           # noqa: E402

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


def _canal(rs, rl, debit=1e9, retard=1e-9, tr=50e-12, pertes=0.0, **reg):
    """L'oeil d'une ligne uniforme de 50 ohms, sans geometrie."""
    o = {"debit": debit, "tr": tr, "v_haut": 1.0, "v_bas": 0.0,
         "r_source": rs, "r_charge": rl, "c_charge": 0.0}
    o.update(reg)
    p = oeil._params(o, None)
    df, n, _, _ = oeil.grille(debit, tr, retard)
    f = df * np.arange(1, n + 1)
    return oeil.oeil(f, oeil.ligne_ideale(f, 50.0, retard, pertes), p,
                     reg.get("gab"))


# -- l'empilage et la geometrie des essais complets ---------------------------
def _cu(nom, role):
    return {"name": nom, "type": "copper", "thickness": 0.035, "role": role}


def _di(nom, ep, er):
    return {"name": nom, "type": "dielectric", "thickness": ep,
            "epsilon_r": er, "tan_delta": 0.02}


QUATRE = [_cu("TOP", "signal"), _di("PP", 0.200, 4.20), _cu("GND", "plane"),
          _di("CORE", 0.800, 4.50), _cu("PWR", "plane"),
          _di("PP2", 0.200, 4.20), _cu("BOT", "signal")]


def _piste(x1, y1, x2, y2, net, largeur=0.35):
    return {"type": "track", "start": [x1, y1], "end": [x2, y2],
            "width": largeur, "layer": 0, "net": net,
            "copper_thickness": 0.035}


def _doc(objets, oeil_, voisinage=(), paires=()):
    d = {"format": "cao-sim-em-3", "net": objets[0]["net"],
         "stackup": {"layers": QUATRE}, "geometry": {"objects": objets},
         "analyse": {"f_debut": 1e7, "f_fin": 1e10, "f_centre": 1e9,
                     "points": 11},
         "oeil": oeil_}
    if voisinage:
        d["voisinage"] = list(voisinage)
    if paires:
        d["paires"] = [list(p) for p in paires]
    return d


def _paire(longueur=60.0):
    return dict(objets=[_piste(0, 0, longueur, 0, "USB_DP", 0.2)],
                voisinage=[_piste(0, 0.35, longueur, 0.35, "USB_DN", 0.2)],
                paires=[("USB_DP", "USB_DN")])


def _refus(doc, quoi):
    try:
        oeil.analyser(doc)
    except oeil.ErreurOeil as exc:
        return exc
    raise AssertionError("refus attendu : " + quoi)


# =============================================================================
# Les etalons
# =============================================================================

def les_sequences_prbs():
    """Periode 2^n - 1 et un « 1 » de plus que de « 0 » : la signature d'une
    sequence a longueur maximale. Une prise fausse donne une periode courte."""
    for n in (7, 9, 15):
        b = oeil.prbs(n)
        assert len(b) == 2 ** n - 1, "PRBS%d : %d bits" % (n, len(b))
        assert int(b.sum()) == 2 ** (n - 1), "PRBS%d desequilibree" % n
        # la plus longue suite de 1 fait n bits, et elle est unique
        txt = "".join(str(int(x)) for x in np.concatenate([b, b[:n]]))
        assert "1" * n in txt and "1" * (n + 1) not in txt


def la_ligne_adaptee_rend_un_oeil_parfait():
    r = _canal(50.0, 50.0)
    m = r["mesures"]
    # 1 V a vide dans 50 + 50 ohms : 0,5 V a la charge, crete a crete.
    proche(m["hauteur_prbs"], 0.5, 1e-3, "hauteur PRBS")
    proche(m["hauteur_pire"], 0.5, 1e-3, "hauteur pire cas")
    assert m["largeur_prbs_ui"] > 0.97, m["largeur_prbs_ui"]
    proche(m["retard"], 1e-9, 0.02, "retard de la ligne")
    assert m["isi_pire"] < 1e-3, m["isi_pire"]
    assert not r["avertissements"], r["avertissements"]


def le_treillis_de_bewley_donne_le_pire_cas():
    """Rs = 30 ohms, ligne de 1 ns ouverte, 1 Gb/s : les echos reviennent
    tous les 2 ns, soit aux curseurs pairs. Principal 2 x 50/80 = 1,25 ;
    echos 1,25 (Gs GL)^m avec Gs = -0,25 et GL = 1 ; somme 1,25/3. Demi-
    excursion 0,5 V : oeil pire cas 2 x 0,5 x (1,25 - 1,25/3) = 0,8333 V."""
    r = _canal(30.0, 0.0)
    m = r["mesures"]
    proche(m["principal"], 0.625, 2e-3, "curseur principal")
    proche(m["hauteur_pire"], 2 * 0.5 * (1.25 - 1.25 / 3), 3e-3,
           "oeil pire cas")
    assert m["hauteur_prbs"] >= m["hauteur_pire"] - 1e-6


def un_oeil_ferme_se_dit_ferme():
    """Rs = 10 ohms : Gs = -2/3, la somme des echos (2 x 1,667) depasse le
    principal (1,667) -- l'oeil pire cas est ferme, sa hauteur negative."""
    r = _canal(10.0, 0.0)
    m = r["mesures"]
    proche(m["hauteur_pire"], 0.5 * (1.6667 - 3.3333) * 2, 0.01,
           "oeil pire cas ferme")
    assert m["largeur_pire_ui"] == 0.0


def le_pire_cas_n_est_jamais_plus_ouvert_que_le_prbs():
    for pertes in (0.5, 2.0, 5.0):
        for motif in ("prbs7", "prbs9"):
            m = _canal(50.0, 50.0, debit=5e9, tr=40e-12, pertes=pertes,
                       motif=motif)["mesures"]
            assert m["hauteur_pire"] <= m["hauteur_prbs"] + 1e-9, (
                pertes, motif, m["hauteur_pire"], m["hauteur_prbs"])


def le_ctle_ouvre_un_oeil_ferme_par_les_pertes():
    spec = {"forme": "usb3", "adc": 0.667, "fz": 650e6, "fp1": 1.95e9,
            "fp2": 5e9}
    brut = _canal(50.0, 50.0, debit=5e9, tr=40e-12, pertes=6.0)["mesures"]
    eg = _canal(50.0, 50.0, debit=5e9, tr=40e-12, pertes=6.0,
                ctle=spec)["mesures"]
    assert eg["hauteur_pire"] > brut["hauteur_pire"] + 0.02, (
        brut["hauteur_pire"], eg["hauteur_pire"])
    # le gain continu du CTLE est bien celui annonce
    proche(abs(oeil.ctle([1.0], spec)[0]), 0.667, 1e-6, "Adc du CTLE")
    hf = dict(spec, forme="pcie3", adc_db=-6)
    proche(abs(oeil.ctle([1.0], hf)[0]), 10 ** (-6 / 20.0), 1e-6,
           "Adc du CTLE PCIe")
    # entre ses deux poles, le CTLE PCIe remonte vers un gain de 1 (0,76 avec
    # des poles a 2 et 8 GHz, trop proches pour qu'il l'atteigne)
    crete = max(abs(oeil.ctle(np.linspace(1e9, 1e10, 200), hf)))
    assert 0.7 < crete <= 1.0, crete


def la_pre_accentuation_et_le_dfe_ouvrent_l_oeil():
    c = oeil._de_emphase(-3.5)
    proche(20 * math.log10((c[0] + c[1]) / (c[0] - c[1])), -3.5, 1e-3,
           "desaccentuation")
    proche(c[0] - c[1], 1.0, 1e-9, "excursion pleine")
    brut = _canal(50.0, 50.0, debit=5e9, tr=40e-12, pertes=6.0)["mesures"]
    ffe = _canal(50.0, 50.0, debit=5e9, tr=40e-12, pertes=6.0, ffe=c,
                 ffe_principal=0)["mesures"]
    assert ffe["hauteur_pire"] > brut["hauteur_pire"], (brut, ffe)
    r = _canal(50.0, 50.0, debit=5e9, tr=40e-12, pertes=6.0, dfe_prises=1,
               dfe_max=1.0)
    d1 = r["egalisation"]["dfe_v"][0]
    assert d1 != 0
    # LE DFE RETIRE EXACTEMENT LE PREMIER POST-CURSEUR : l'ouverture gagne
    # deux fois sa valeur, a l'instant d'echantillonnage retenu.
    assert r["mesures"]["hauteur_pire"] > brut["hauteur_pire"]
    # Et il est borne : avec 1 mV de plage, il ne retire qu'1 mV.
    r2 = _canal(50.0, 50.0, debit=5e9, tr=40e-12, pertes=6.0, dfe_prises=1,
                dfe_max=1e-3)
    assert abs(r2["egalisation"]["dfe_v"][0]) <= 1e-3 + 1e-12


def la_marge_est_le_facteur_d_agrandissement():
    carre = [[-1, -1], [1, -1], [1, 1], [-1, 1]]
    j = oeil.jauge(carre, [[0, 0], [1, 0], [0.5, 0.25], [2, 2], [-3, 0]])
    for vu, att in zip(j, [0.0, 1.0, 0.5, 2.0, 3.0]):
        proche(vu + 1, att + 1, 1e-12, "jauge")
    # Le sens de parcours ne change rien.
    j2 = oeil.jauge(carre[::-1], [[0.5, 0.25]])
    proche(j2[0], 0.5, 1e-12, "jauge sens horaire")
    # Les unites ne changent rien : axe des tensions en millivolts.
    gros = [[x, 1000 * y] for x, y in carre]
    proche(oeil.jauge(gros, [[0.5, 250.0]])[0], 0.5, 1e-12, "jauge unites")


def la_marge_pire_cas_se_lit_dans_l_ouverture():
    """Un oeil pire cas plat a +-0,25 V sur toute l'UI, un carre de +-0,2 V :
    le carre grandit de 25 % avant de toucher. Ferme sur une seule phase sous
    le gabarit, l'oeil ne laisse plus rien passer."""
    taus = [i / 64.0 - 0.5 for i in range(64)]
    carre = [[-0.1, -0.2], [0.1, -0.2], [0.1, 0.2], [-0.1, 0.2]]
    m = oeil.marge_pire(carre, taus, [0.25] * 64, [-0.25] * 64)
    proche(m + 1, 1.25, 1e-6, "marge pire cas")
    h = [0.25] * 64
    h[32] = -0.01
    assert oeil.marge_pire(carre, taus, h, [-0.25] * 64) < 0


def la_marge_pire_cas_ne_depasse_jamais_celle_du_prbs():
    """Le PRBS n'est qu'un ensemble de sequences parmi toutes : sa marge est
    au moins celle du pire cas. Le contraire est arrive, quand la frontiere
    pire cas etait jugee comme une trace -- elle plonge sous le seuil dans les
    croisements, la ou les vraies traces passent par zero."""
    g = {"id": "essai", "masque": {"type": "hexagone", "largeur_ui": 0.3,
                                   "plat_ui": 0.0, "hauteur_v": 0.05}}
    for pertes in (0.5, 2.0, 4.0):
        m = _canal(50.0, 50.0, debit=5e9, tr=40e-12, pertes=pertes, v_bas=-1.0,
                   gab=g)["mesures"]
        assert m["marge_pire"] <= m["marge"] + 1e-9, (pertes, m)


def un_gabarit_touche_se_compte():
    g = {"id": "essai", "nom": "essai", "fiabilite": "derive",
         "masque": {"type": "hexagone", "largeur_ui": 0.6, "plat_ui": 0.2,
                    "hauteur_v": 0.4}}
    # Oeil parfait de 0,5 V centre sur 0,25 V : un hexagone de 0,4 V centre
    # sur 0 deborde sous le niveau bas... on le recentre sur le seuil.
    g["masque"] = {"type": "polygone",
                   "points": [[-0.3, 0.25], [-0.1, 0.45], [0.1, 0.45],
                              [0.3, 0.25], [0.1, 0.05], [-0.1, 0.05]]}
    r = _canal(50.0, 50.0, gab=g)
    m = r["mesures"]
    assert m["violations"] == 0, m
    # 0,25 V de demi-ouverture contre 0,20 : marge 25 %, a la resolution
    # d'echantillonnage pres.
    assert 0.15 < m["marge"] < 0.26, m["marge"]
    g2 = dict(g, masque={"type": "polygone",
                         "points": [[-0.3, 0.25], [-0.1, 0.6], [0.1, 0.6],
                                    [0.3, 0.25], [0.1, -0.1], [-0.1, -0.1]]})
    m2 = _canal(50.0, 50.0, gab=g2)["mesures"]
    assert m2["violations"] > 0 and m2["marge"] < 0, m2
    g3 = dict(g, v_max=0.4)
    assert _canal(50.0, 50.0, gab=g3)["mesures"]["hors_limites"] > 0


def les_gabarits_sont_coherents():
    vus = set()
    for g in oeil.GABARITS:
        assert g["id"] not in vus, "doublon " + g["id"]
        vus.add(g["id"])
        for cle in ("famille", "nom", "debit", "mode", "lieu", "fiabilite",
                    "source", "masque", "emetteur", "recepteur"):
            assert cle in g, "%s : %s manque" % (g["id"], cle)
        assert g["fiabilite"] in oeil.FIABILITES, g["id"]
        assert g["mode"] in ("simple", "diff"), g["id"]
        ui = 1.0 / g["debit"]
        poly = oeil.polygone(g, ui)
        assert len(poly) >= 3, g["id"]
        # convexe et autour de son centre : la jauge du centre vaut 0
        c = np.mean(np.asarray(poly), axis=0)
        assert oeil.jauge(poly, [c])[0] < 1e-9, g["id"]
        assert all(abs(t) <= 0.5 for t, _ in poly), g["id"]
        em = g["emetteur"]
        assert em["v_haut"] > em["v_bas"], g["id"]
        if g["mode"] == "diff":
            assert abs(c[1]) < 1e-9, "%s : masque differentiel decentre" % g["id"]
        else:
            # un gabarit a seuils est entre le niveau bas et le niveau haut
            assert em["v_bas"] < c[1] < em["v_haut"], g["id"]
    et = oeil.etat()
    assert et["dispo"] and len(et["gabarits"]) == len(oeil.GABARITS)


def les_seuils_prennent_setup_et_hold():
    g = oeil.gabarit("spi-lvcmos33")
    poly = oeil.polygone(g, 40e-9, setup=4e-9, hold=2e-9)
    xs = sorted(set(t for t, _ in poly))
    proche(xs[0], -0.1, 1e-12, "setup en UI")
    proche(xs[1], 0.05, 1e-12, "hold en UI")
    assert oeil.polygone(g, 40e-9, setup=0, hold=0) == []


def la_grille_imposee_rend_la_meme_cascade():
    d = _doc([_piste(0, 0, 30, 0, "SIG")], {})
    libre = se.simuler(d)
    f = np.array(libre["freqs"])
    imp = se.simuler(d, garder_abcd=True, freqs_imposees=f)
    assert len(imp["abcd"]) == len(f)
    assert imp["freqs"] == libre["freqs"]
    for ml, mi in zip(libre["s"], imp["s"]):
        for a, b in zip(ml, mi):
            assert abs(a[0] - b[0]) < 1e-12 and abs(a[1] - b[1]) < 1e-12


def un_bus_spi_propre_passe_son_gabarit():
    r = oeil.analyser(_doc([_piste(0, 0, 60, 0, "MOSI")],
                           {"gabarit": "spi-lvcmos33"}))
    m = r["mesures"]
    assert m["violations"] == 0 and m["hors_limites"] == 0, m
    assert m["largeur_prbs_ui"] > 0.9, m["largeur_prbs_ui"]
    # haute impedance : presque toute l'excursion a vide arrive
    assert m["hauteur_prbs"] > 3.0, m["hauteur_prbs"]
    assert r["gabarit"]["fiabilite"] == "derive"
    assert r["densite"]["nx"] == 2 * oeil.ECHANTILLONS_UI
    assert len(r["densite"]["comptes"]) == r["densite"]["nx"] * r["densite"]["ny"]


def une_paire_usb2_passe_le_template_1():
    p = _paire()
    r = oeil.analyser(_doc(p["objets"], {"gabarit": "usb2-hs-connecteur"},
                           p["voisinage"], p["paires"]))
    assert r["mode"] == "diff" and r["partenaire"] == "USB_DN", r["partenaire"]
    m = r["mesures"]
    assert m["violations"] == 0 and m["hors_limites"] == 0, m
    # ±0,4 V sur 90 ohms adaptes
    proche(m["niveau_1"], 0.4, 0.03, "niveau haut USB 2.0")


def un_emetteur_trop_faible_viole_le_gabarit():
    p = _paire()
    r = oeil.analyser(_doc(p["objets"],
                           {"gabarit": "usb2-hs-connecteur", "v_haut": 0.5,
                            "v_bas": -0.5},
                           p["voisinage"], p["paires"]))
    assert r["mesures"]["violations"] > 0 and r["mesures"]["marge"] < 0


def le_pcie3_choisit_son_ctle_et_son_dfe():
    p = _paire(150.0)
    r = oeil.analyser(_doc(p["objets"], {"gabarit": "pcie-gen3"},
                           p["voisinage"], p["paires"]))
    eg = r["egalisation"]
    assert eg["ctle"]["adc_db"] in range(-12, -5), eg["ctle"]
    assert len(eg["dfe_v"]) == 1 and abs(eg["dfe_v"][0]) <= 0.030 + 1e-12
    assert eg["ffe"] == [-0.1, 0.7, -0.2]
    # sans egaliseur, l'oeil est moins ouvert
    r0 = oeil.analyser(_doc(p["objets"], {"gabarit": "pcie-gen3",
                                          "egaliseur": False},
                            p["voisinage"], p["paires"]))
    assert r0["egalisation"]["ctle"] is None and not r0["egalisation"]["dfe_v"]


def les_refus():
    d = _doc([_piste(0, 0, 30, 0, "SIG")], {"gabarit": "inconnu"})
    _refus(d, "gabarit inconnu")
    _refus(_doc([_piste(0, 0, 30, 0, "SIG")], {"debit": 0}), "debit nul")
    _refus(_doc([_piste(0, 0, 30, 0, "SIG")],
                {"debit": 1e8, "v_haut": 0, "v_bas": 1}), "niveaux inverses")
    _refus(_doc([_piste(0, 0, 30, 0, "SIG")],
                {"debit": 1e8, "motif": "prbs31"}), "motif inconnu")
    e = _refus(_doc([_piste(0, 0, 30, 0, "SIG")],
                    {"debit": 1e9, "mode": "diff"}), "paire absente")
    assert "paire" in e.message.lower(), e.message
    # un net ramifie n'a pas de parcours : pas d'oeil
    t = [_piste(0, 0, 20, 0, "SIG"), _piste(20, 0, 40, 0, "SIG"),
         _piste(20, 0, 20, 15, "SIG")]
    _refus(_doc(t, {"debit": 1e8}), "net ramifie")


# =============================================================================
# 2.0.0 -- les gabarits verifies
# =============================================================================

def les_gabarits_verifies_disent_leur_source():
    """SATA : la largeur est 1 - TJ de la tolerance du recepteur, en
    losange ; PCIe 2 et 3 sont recoupes et se jugent a 10^-12 ; ce qui n'a
    pas pu l'etre (USB 2.0 extremite, HDMI 1.4) le reste, et le DIT."""
    for gid, larg, h in (("sata-gen1", 0.49, 0.325), ("sata-gen2", 0.43, 0.275),
                         ("sata-gen3", 0.43, 0.240)):
        g = oeil.gabarit(gid)
        assert g["masque"]["largeur_ui"] == larg, gid
        assert g["masque"]["hauteur_v"] == h, gid
        assert g["masque"]["plat_ui"] == 0.0, gid
        assert g["fiabilite"] == "corrobore" and g["ber"] == 1e-12, gid
    for gid in ("pcie-gen2", "pcie-gen3"):
        g = oeil.gabarit(gid)
        assert g["fiabilite"] == "corrobore" and g["ber"] == 1e-12, gid
    proche(oeil.gabarit("pcie-gen2")["masque"]["hauteur_v"], 0.120, 1e-12,
           "PCIe 2 : 120 mV")
    proche(oeil.gabarit("pcie-gen3")["masque"]["hauteur_v"], 0.025, 1e-12,
           "PCIe 3 : 25 mV")
    assert oeil.gabarit("pcie-gen3")["egaliseur"]["dfe"]["max_v"] == 0.030
    for gid in ("usb2-hs-recepteur", "hdmi14-tmds"):
        g = oeil.gabarit(gid)
        assert g["fiabilite"] == "a_verifier", gid
        assert "NON recoup" in g["source"] + g["note"], gid


# =============================================================================
# 2.0.0 -- l'oeil statistique : gigue, bruit, diaphonie
# =============================================================================

def la_gigue_aleatoire_suit_l_echelle_q():
    """Ligne adaptee sans pertes, RJ seule : l'oeil a 10^-n se ferme de
    sigma Q^-1(2 BER) de chaque cote -- la moitie des transitions seulement
    change de bit, d'ou le facteur deux --, a la resolution de phase pres."""
    rj = 0.05
    st = _canal(50.0, 50.0, rj_ui=rj)["statistique"]
    for c in st["contours"]:
        att = 1.0 - 2.0 * rj * oeil.q_inverse(2.0 * c["ber"])
        assert abs(c["largeur_ui"] - att) < 0.004, (c["ber"], c["largeur_ui"],
                                                    att)
    # La baignoire, sommee des deux cotes, rend la meme largeur que le
    # contour au seuil : deux lectures de la meme distribution.
    b = st["baignoire"]["ber"]
    assert max(b) <= 0.5 + 1e-9 and min(b) >= 0.0
    # Q de la baignoire, cote par cote, contre la distance au croisement :
    # la somme des deux Q-distances vaut 1 UI, quel que soit le centrage.
    tau = st["baignoire"]["tau"]
    i_g = tau.index(-0.25)
    i_d = tau.index(0.25)
    d_g = rj * oeil.q_inverse(2.0 * b[i_g])
    d_d = rj * oeil.q_inverse(2.0 * b[i_d])
    proche(0.5 + d_g + d_d, 1.0, 0.01, "baignoire en echelle Q")


def la_gigue_deterministe_s_ajoute_en_double_dirac():
    """DJ en double Dirac : TJ(BER) = DJ + 2 sigma Q^-1(4 BER) -- chaque
    Dirac porte la moitie des transitions."""
    rj, dj = 0.03, 0.2
    st = _canal(50.0, 50.0, rj_ui=rj, dj_ui=dj)["statistique"]
    for c in st["contours"]:
        att = 1.0 - dj - 2.0 * rj * oeil.q_inverse(4.0 * c["ber"])
        assert abs(c["largeur_ui"] - att) < 0.004, (c["ber"], c["largeur_ui"],
                                                    att)


def le_bruit_gaussien_ferme_l_oeil_comme_erfc():
    """Bruit de 20 mV rms sur un oeil parfait de 0,5 V : a 10^-n, la demi-
    ouverture est 0,25 - sigma Q^-1(2 BER)."""
    st = _canal(50.0, 50.0, bruit_v=0.02)["statistique"]
    for c in st["contours"]:
        att = 2.0 * (0.25 - 0.02 * oeil.q_inverse(2.0 * c["ber"]))
        assert abs(c["hauteur"] - att) < 2 * st["pas_v"], (c["ber"],
                                                           c["hauteur"], att)


def l_oeil_statistique_converge_vers_le_pire_cas():
    """Le treillis de Bewley (30 ohms, ligne ouverte) n'a qu'une poignee
    d'echos qui comptent : leur pire alignement a une probabilite de
    quelques pour mille, et des 10^-6 l'oeil statistique EST le pire cas,
    a deux cases de tension pres. Il n'est jamais plus ferme que lui."""
    r = _canal(30.0, 0.0, statistique=True)
    h_pire = r["mesures"]["hauteur_pire"]
    st = r["statistique"]
    for c in st["contours"]:
        assert c["hauteur"] >= h_pire - 2 * st["pas_v"], (c, h_pire)
        assert abs(c["hauteur"] - h_pire) < 2 * st["pas_v"], (c, h_pire)
    # Sur une liaison a pertes, l'oeil a 10^-6 est plus ouvert que le pire
    # cas, et il se referme a mesure que le taux descend.
    r = _canal(50.0, 50.0, debit=5e9, tr=40e-12, pertes=6.0, retard=3e-9,
               statistique=True)
    h = [c["hauteur"] for c in r["statistique"]["contours"]]
    assert all(a >= b - 1e-12 for a, b in zip(h, h[1:])), h
    assert h[-1] >= r["mesures"]["hauteur_pire"] - 2 * r["statistique"]["pas_v"]


def la_diaphonie_bornee_retranche_sa_crete():
    """Un agresseur de 50 mV de crete ferme le pire cas d'exactement deux
    fois 50 mV, et l'oeil statistique profond d'autant."""
    r0 = _canal(30.0, 0.0)
    r = _canal(30.0, 0.0, agresseurs=[{"nom": "SCK", "coef": 0.05,
                                       "v": 1.0}])
    proche(r0["mesures"]["hauteur_pire"] - r["mesures"]["hauteur_pire"], 0.1,
           1e-9, "pire cas moins deux cretes")
    assert r["diaphonie"]["crete_totale_v"] == 0.05
    c = r["statistique"]["contours"][-1]
    assert abs(c["hauteur"] - r["mesures"]["hauteur_pire"]) < \
        3 * r["statistique"]["pas_v"], (c["hauteur"],
                                        r["mesures"]["hauteur_pire"])
    # L'oeil PRBS, lui, ne la connait pas : la sequence voisine est inconnue.
    proche(r["mesures"]["hauteur_prbs"], r0["mesures"]["hauteur_prbs"], 1e-12,
           "PRBS sans diaphonie")


def sans_gigue_ni_diaphonie_rien_ne_change():
    """Les reglages de la 2.0.0 sont facultatifs : sans eux, pas un champ de
    plus, pas un chiffre de change."""
    r = _canal(30.0, 0.0)
    assert "statistique" not in r and "diaphonie" not in r
    r2 = _canal(30.0, 0.0, rj_ui=0.0, dj_ui=0.0, bruit_v=0.0, agresseurs=[])
    assert "statistique" not in r2
    assert r["mesures"] == r2["mesures"]
    assert r["pire_cas"] == r2["pire_cas"]


def le_gabarit_se_juge_aussi_au_taux_d_erreur():
    g = {"id": "essai", "masque": {"type": "hexagone", "largeur_ui": 0.5,
                                   "plat_ui": 0.0, "hauteur_v": 0.2}}
    m = _canal(50.0, 50.0, v_bas=-1.0, gab=g, rj_ui=0.04)["mesures"]
    assert m["ber_cible"] == 1e-12
    # la gigue mange la largeur que le pire cas sans gigue laissait
    assert m["marge_ber"] < m["marge_pire"], m
    proche(m["largeur_ber_ui"], 1 - 2 * 0.04 * oeil.q_inverse(2e-12), 0.01,
           "largeur a 1e-12")


def les_voisines_du_couplage_deviennent_des_agresseurs():
    """La voisine de MOSI, prise dans la fiche de couplage, avec le NEXT et
    le FEXT du niveau 2 de crosstalk.py : le pire cas perd deux fois sa
    crete, et le coefficient est celui que crosstalk.niveau2 rend."""
    import crosstalk
    objets = [_piste(0, 0, 60, 0, "MOSI")]
    vois = [_piste(0, 0.6, 60, 0.6, "SCK")]
    r = oeil.analyser(_doc(objets, {"gabarit": "spi-lvcmos33",
                                    "agresseurs_auto": True}, vois))
    xt = r["diaphonie"]["agresseurs"]
    assert len(xt) == 1 and xt[0]["nom"] == "SCK", xt
    a = xt[0]
    assert a["coef"] == max(a["next"], a["fext"])
    proche(a["crete_v"], a["coef"] * 3.3, 1e-9, "crete = coef x 3,3 V")
    assert r["statistique"]["contours"][-1]["hauteur"] < \
        r["mesures"]["hauteur_prbs"]
    # le meme chiffre que l'onglet Crosstalk, recalcule a la main
    d = _doc(objets, {}, vois)
    d["analyse"]["temps_montee"] = 1.5e-9
    res = se.simuler(d)
    f = [x for x in res["couplage"]["paires"] if x["net_voisin"] == "SCK"][0]
    zo, ze = f["z_impair"], f["z_pair"]
    eo, ee = f["eps_eff_impair"], f["eps_eff_pair"]
    co, ce = math.sqrt(eo) / zo, math.sqrt(ee) / ze
    lo, le = zo * math.sqrt(eo), ze * math.sqrt(ee)
    kc, kl = (co - ce) / (co + ce), (le - lo) / (le + lo)
    td = f["longueur"] * 1e-3 * math.sqrt(0.5 * (eo + ee)) / oeil.C_0
    n2 = crosstalk.niveau2([(0.25 * (kc + kl), 0.5 * (kl - kc), td)], 1.5e-9)
    proche(a["next"], n2["next"], 1e-6, "NEXT du niveau 2")
    proche(a["fext"], n2["fext"], 1e-6, "FEXT du niveau 2")
    # sens connu : le FEXT seul, ou le NEXT seul
    p = oeil._params({"gabarit": "spi-lvcmos33"},
                     oeil.gabarit("spi-lvcmos33"))
    for sens, cle in (("meme", "fext"), ("oppose", "next")):
        x, _ = oeil.agresseurs_du_couplage(res["couplage"], p,
                                           {"agresseurs_sens": sens})
        proche(x[0]["coef"], a[cle], 1e-9, sens)
    # la partenaire d'une paire n'est jamais un agresseur
    x, notes = oeil.agresseurs_du_couplage(res["couplage"], p, {}, "SCK")
    assert not x and notes


# =============================================================================
# 2.0.0 -- les modeles IBIS
# =============================================================================

def _ibis_lineaire(r=30.0, vcc=1.0, sigma=40e-12, c_comp=0.0, clamps=False,
                   rf=50.0, nom="LIN"):
    """Un tampon IBIS DONT ON CONNAIT LA REPONSE : courbes V-I droites (une
    resistance r vers Vcc, une vers la masse) et formes d'onde gaussiennes
    sous 50 ohms -- c'est un generateur de Thevenin, front gaussien compris."""
    lignes = ["[IBIS Ver] 4.2", "[File Name] essai.ibs",
              "[Component] ESSAI", "[Model] %s" % nom, "Model_type I/O",
              "C_comp %gp %gp %gp" % ((c_comp * 1e12,) * 3),
              "[Voltage Range] %g %g %g" % (vcc, vcc, vcc), "[Pulldown]"]
    for v in np.linspace(-vcc, 2 * vcc, 7):
        lignes.append("%g %g NA NA" % (v, v / r))
    lignes.append("[Pullup]")
    for v in np.linspace(-vcc, 2 * vcc, 7):
        lignes.append("%g %g NA NA" % (v, -v / r))
    if clamps:
        # diodes franches : 0 jusqu'a 0,5 V de depassement, 1 ohm au-dela
        lignes.append("[GND Clamp]")
        for v in (-5.0, -0.5, 0.0, vcc):
            lignes.append("%g %g" % (v, min(0.0, (v + 0.5) / 1.0)))
        lignes.append("[POWER Clamp]")
        for v in (-5.0, -0.5, 0.0, vcc):
            lignes.append("%g %g" % (v, max(0.0, -(v + 0.5) / 1.0)))
    for mot, haut in (("Rising", True), ("Falling", False)):
        lignes += ["[%s Waveform]" % mot, "R_fixture = %g" % rf,
                   "V_fixture = 0"]
        for t in np.linspace(0, 10 * sigma, 201):
            ph = 0.5 * math.erfc(-(t - 4 * sigma) / (sigma * math.sqrt(2)))
            ku = ph if haut else 1 - ph
            lignes.append("%.6gp %.9g NA NA" % (t * 1e12,
                                                vcc * ku * rf / (r + rf)))
    lignes.append("[End]")
    return "\n".join(lignes)


CMOS33 = """[IBIS Ver] 5.0
[Comment Char] #_char
[Component] CMOS33
[Package]
R_pkg 0.2 0.1 0.3
# un commentaire, | n'en est plus un
[Model] OUT33
Model_type I/O
C_comp 3.0pF 2.5pF 3.5pF
Vinl = 0.8V
Vinh = 2.0V
[Voltage Range] 3.3V 3.0V 3.6V
[Pulldown]
-3.3 -60mA -50mA -70mA
0.0 0 0 0
0.3 15mA 12mA 18mA
1.0 40mA 32mA 48mA
3.3 52mA 42mA 62mA
6.6 54mA NA 64mA
[Pullup]
-3.3 60mA 50mA 70mA
0.0 0 0 0
0.3 -12mA -10mA -15mA
1.0 -32mA -26mA -39mA
3.3 -42mA -34mA -50mA
6.6 -44mA -36mA -52mA
[GND Clamp]
-3.3 -300mA -250mA -350mA
-1.0 -50mA -40mA -60mA
-0.7 -5mA -4mA -6mA
-0.3 0 0 0
0 0 0 0
[POWER Clamp]
-3.3 300mA 250mA 350mA
-1.0 50mA 40mA 60mA
-0.7 5mA 4mA 6mA
-0.3 0 0 0
0 0 0 0
[Ramp]
dV/dt_r 1.6/0.6n 1.4/0.8n 1.8/0.45n
dV/dt_f 1.6/0.5n 1.4/0.7n 1.8/0.4n
R_load = 50
[Model] IN33
Model_type Input
C_comp 4pF NA NA
[GND Clamp]
-3.3 -300mA NA NA
-1.0 -50mA NA NA
-0.7 -5mA NA NA
-0.3 0 NA NA
0 0 NA NA
[End]
"""


def la_lecture_ibis():
    """Suffixes (m milli, M mega), « NA » renvoyant a typ, caractere de
    commentaire change en cours de fichier, rapports de [Ramp], conventions
    de signe des tableaux."""
    proche(ibis.nombre("1.5nH"), 1.5e-9, 1e-12, "n")
    proche(ibis.nombre("2M"), 2e6, 1e-12, "M mega")
    proche(ibis.nombre("2mA"), 2e-3, 1e-12, "m milli")
    proche(ibis.nombre("-3.3e-1V"), -0.33, 1e-12, "exposant")
    assert ibis.nombre("NA") is None
    lu = ibis.lire(CMOS33, "cmos33.ibs")
    assert set(lu["modeles"]) == {"OUT33", "IN33"}
    assert "[Package]" in lu["ignores"]
    m = lu["modeles"]["OUT33"]
    assert m["type"] == "I/O" and m["c_comp"] == (3e-12, 2.5e-12, 3.5e-12)
    proche(m["vinh"], 2.0, 1e-12, "Vinh")
    assert m["rampe"]["r"][0] == (1.6, 0.6e-9)
    assert m["tableaux"]["pulldown"][-1][2] == m["tableaux"]["pulldown"][-1][1]
    assert lu["modeles"]["IN33"]["c_comp"] == (4e-12, 4e-12, 4e-12)
    t = ibis.Tampon(m, "typ")
    proche(t.v_pu, 3.3, 1e-12, "Vcc typ")
    proche(ibis.Tampon(m, "max").v_pu, 3.6, 1e-12, "Vcc max")
    # a l'etat haut a vide, la broche est a Vcc ; a l'etat bas, a 0
    proche(t.niveau(1.0, 0.0), 3.3, 1e-6, "niveau haut")
    assert abs(t.niveau(0.0, 1.0)) < 1e-6
    # un courant ENTRANT est positif : etat haut tire vers 0 V -> il sort
    assert t.i_total(0.0, 1.0, 0.0)[0] < 0
    assert t.i_statique(-1.0)[0] < 0          # diode de masse : il sort
    assert ibis.est_emetteur(m) and not ibis.est_emetteur(lu["modeles"]["IN33"])
    try:
        ibis.lire("[IBIS Ver] 5.0\n[Component] X\n")
    except ibis.ErreurIbis:
        pass
    else:
        raise AssertionError("un fichier sans [Model] doit etre refuse")


def _oeil_ibis(o, retard=1e-9, pertes=1.0, z0=50.0, gab=None):
    """L'oeil d'une ligne ideale avec les tampons IBIS de `o`."""
    p = oeil._params(o, gab)
    ctx = oeil.preparer_ibis(o, p)
    df, n, _, _ = oeil.grille(p["debit"], ctx["tr_lissage"] if ctx and
                              ctx["temporel"] else p["tr"], retard,
                              4 * p["tr"])
    f = df * np.arange(1, n + 1)
    abcd = oeil.ligne_ideale(f, z0, retard, pertes)
    nl = None
    if ctx and ctx["temporel"]:
        nl = oeil.simuler_non_lineaire(ctx, f, abcd, p, z0)
        p["v_haut"], p["v_bas"] = nl["v_haut"], nl["v_bas"]
    return oeil.oeil(f, abcd, p, gab, non_lineaire=nl), nl


def un_tampon_ibis_lineaire_rend_l_oeil_lineaire():
    """Courbes V-I droites et front gaussien : le tampon IBIS EST le
    generateur de Thevenin. Ligne ouverte attaquee par 30 ohms -- les echos
    reviennent sur le tampon et y repartent : c'est la boucle tampon-canal
    qui est eprouvee. Le lissage du canal (un front de la moitie de celui
    du tampon) se compose en quadrature avec le front."""
    sigma = 40e-12
    r, nl = _oeil_ibis({"debit": 1e9, "r_charge": 0.0, "c_charge": 0.0,
                        "ibis_emetteur": {"texte": _ibis_lineaire(sigma=sigma)}},
                       pertes=1.0)
    tr_eq = 2.5631 * sigma * math.sqrt(1.0 + oeil.LISSAGE_SUR_FRONT ** 2)
    r2 = _canal(30.0, 0.0, tr=tr_eq, pertes=1.0)
    for k in ("hauteur_prbs", "hauteur_pire", "niveau_1", "niveau_0",
              "principal"):
        assert abs(r["mesures"][k] - r2["mesures"][k]) < 0.01, (
            k, r["mesures"][k], r2["mesures"][k])
    proche(r["mesures"]["retard"], r2["mesures"]["retard"], 0.01, "retard")
    assert nl["infos"]["asymetrie"] < 1e-3


def la_simulation_temporelle_est_la_superposition_si_tout_est_lineaire():
    """Le pas de temps ne sait rien de la linearite : sur un tampon
    lineaire, la forme d'onde PRBS qu'il rend doit etre, au pas pres, la
    somme des reponses a un echelon qu'il rend aussi."""
    o = {"debit": 1e9, "r_charge": 0.0, "c_charge": 1e-12,
         "ibis_emetteur": {"texte": _ibis_lineaire(c_comp=1e-12)}}
    p = oeil._params(o, None)
    ctx = oeil.preparer_ibis(o, p)
    df, n, _, _ = oeil.grille(1e9, ctx["tr_lissage"], 1e-9, 4 * p["tr"])
    f = df * np.arange(1, n + 1)
    nl = oeil.simuler_non_lineaire(ctx, f, oeil.ligne_ideale(f, 50.0, 1e-9,
                                                             1.0), p, 50.0)
    bits = oeil.prbs(7)
    y = nl["onde"](bits)
    spu = oeil.ECHANTILLONS_UI
    dt_e = 1e-9 / spu
    t = np.arange(len(y)) * dt_e
    s = nl["s"]
    ts = np.arange(len(s)) * nl["dt"]
    per = len(bits) * 1e-9
    ampl = nl["v_haut"] - nl["v_bas"]
    # avant la premiere transition comptee, l'etat du dernier bit
    sup = np.full(len(y), nl["v_bas"] + ampl * int(bits[-1]))
    # la sequence est periodique : les transitions des periodes d'avant
    for rep in range(-6, 1):
        for i in range(len(bits)):
            prec = bits[i - 1]
            if bits[i] != prec:
                signe = 1.0 if bits[i] else -1.0
                t0 = i * 1e-9 + rep * per
                sup += signe * ampl * np.interp(t - t0, ts, s, left=0.0,
                                                right=s[-1])
    ecart = float(np.max(np.abs(y - sup)))
    assert ecart < 2e-3 * ampl, ecart


def le_c_comp_du_recepteur_vaut_une_capacite_de_charge():
    """Un recepteur IBIS sans diode n'est que son C_comp : meme oeil, au
    chiffre pres, que la capacite de charge saisie a la main."""
    txt = CMOS33.replace("[GND Clamp]\n-3.3 -300mA NA NA\n-1.0 -50mA NA NA\n"
                         "-0.7 -5mA NA NA\n-0.3 0 NA NA\n0 0 NA NA\n", "")
    o = {"debit": 1e9, "tr": 100e-12, "v_haut": 1.0, "v_bas": 0.0,
         "r_source": 30.0, "r_charge": 0.0,
         "ibis_recepteur": {"texte": txt, "modele": "IN33"}}
    r, nl = _oeil_ibis(o)
    assert nl is None
    r2 = _canal(30.0, 0.0, tr=100e-12, pertes=1.0, c_charge=4e-12)
    # (a la grille pres : celle de l'IBIS compte aussi le front du tampon)
    for k in ("hauteur_prbs", "hauteur_pire", "v_max_vu"):
        proche(r["mesures"][k], r2["mesures"][k], 1e-3, k)


def les_diodes_du_recepteur_ecretent():
    """Ligne ouverte, tampon fort : la broche deborde de pres de deux fois
    l'excursion. Les diodes du recepteur (franches, 0,5 V de seuil) la
    tiennent a quelques dixiemes de volt des rails."""
    vcc = 1.0
    em = {"texte": _ibis_lineaire(r=10.0, vcc=vcc)}
    rx = {"texte": _ibis_lineaire(r=10.0, vcc=vcc, clamps=True, nom="RX")}
    base = {"debit": 1e9, "r_charge": 0.0, "c_charge": 0.0,
            "ibis_emetteur": em}
    r0, _ = _oeil_ibis(base, pertes=0.2)
    r1, nl = _oeil_ibis(dict(base, ibis_recepteur=rx), pertes=0.2)
    assert nl["infos"]["recepteur"]["diodes"]
    assert r0["mesures"]["v_max_vu"] > vcc + 0.55, r0["mesures"]["v_max_vu"]
    assert r1["mesures"]["v_max_vu"] < vcc + 0.55, r1["mesures"]["v_max_vu"]
    assert r1["mesures"]["v_min_vu"] > -0.55, r1["mesures"]["v_min_vu"]
    assert r0["mesures"]["v_min_vu"] < -0.55, r0["mesures"]["v_min_vu"]
    # les niveaux etablis ne bougent pas : les diodes ne conduisent pas
    proche(nl["v_haut"], vcc, 1e-3, "niveau haut etabli")


def un_tampon_cmos_non_lineaire():
    """Le tampon CMOS de [Ramp] seule, au coin typ : niveaux 0 et 3,3 V a
    vide, fronts montant et descendant differents (la note le dit), et le
    coin max -- plus fort -- deborde davantage."""
    o = {"debit": 25e6, "r_charge": 0.0, "c_charge": 5e-12,
         "ibis_emetteur": {"texte": CMOS33, "modele": "OUT33"}}
    r, nl = _oeil_ibis(o, retard=1e-9, pertes=0.0)
    proche(nl["v_haut"], 3.3, 1e-3, "niveau haut")
    assert abs(nl["v_bas"]) < 1e-3
    assert nl["infos"]["asymetrie"] > 0.05
    assert "Ramp" in nl["infos"]["emetteur"]["commande"]
    o2 = dict(o, ibis_emetteur={"texte": CMOS33, "modele": "OUT33",
                                "coin": "max"})
    r2, nl2 = _oeil_ibis(o2, retard=1e-9, pertes=0.0)
    proche(nl2["v_haut"], 3.6, 1e-3, "niveau haut max")
    assert r2["mesures"]["v_max_vu"] - 3.6 > r["mesures"]["v_max_vu"] - 3.3


def les_refus_ibis():
    d = _doc([_piste(0, 0, 30, 0, "SIG")],
             {"debit": 1e8, "motif": "prbs15",
              "ibis_emetteur": {"texte": CMOS33}})
    _refus(d, "PRBS15 et IBIS")
    e = _refus(_doc([_piste(0, 0, 30, 0, "SIG")],
                    {"debit": 1e8, "ibis_emetteur": {"texte": CMOS33,
                                                     "modele": "XX"}}),
               "modele inconnu")
    assert "OUT33" in e.conseil, e.conseil
    e = _refus(_doc([_piste(0, 0, 30, 0, "SIG")],
                    {"debit": 1e8, "ibis_emetteur": {"texte": CMOS33,
                                                     "modele": "IN33"}}),
               "un Input n'emet pas")
    assert "émetteur" in e.message, e.message
    _refus(_doc([_piste(0, 0, 30, 0, "SIG")],
                {"debit": 1e8, "rj": -1e-12}), "gigue negative")


# =============================================================================
# 2.0.0 -- les vias de la paire
# =============================================================================

def les_vias_de_la_paire_entrent_dans_la_cascade():
    """Une paire qui plonge de TOP a une couche interne par deux vias
    traversants laisse sous elle deux moignons de 2,6 mm : ils resonnent
    vers 14 GHz, et l'oeil a 16 Gb/s se ferme. La cascade differentielle ne
    le voyait pas -- elle n'avait que les troncons. On compare la MEME
    geometrie avec et sans ses vias, dans le meme calcul. Et un element pose
    sur les deux brins double sa serie et divise sa derivation en mode
    impair."""
    m = np.array([[1.0, 7.0], [0.2, 1.0]], dtype=complex)
    dd = se._abcd_deux_brins(m, "diff")
    cc = se._abcd_deux_brins(m, "comm")
    assert dd[0, 1] == 14.0 and dd[1, 0] == 0.1
    assert cc[0, 1] == 3.5 and cc[1, 0] == 0.4

    six = [_cu("TOP", "signal"), _di("PP", 0.200, 4.20), _cu("GND", "plane"),
           _di("C1", 0.200, 4.50), _cu("IN1", "signal"),
           _di("C2", 2.200, 4.50), _cu("PWR", "plane"),
           _di("PP2", 0.200, 4.20), _cu("BOT", "signal")]

    def piste(x1, x2, y, net, couche, via=None):
        o = _piste(x1, y, x2, y, net, 0.2)
        o["layer"] = couche
        if via:
            o["via"] = via
        return o
    # Traversant de TOP a BOT : la portee percee fait le moignon.
    via = {"drill_diameter": 0.3, "pad_diameter": 0.6, "layer_from": 0,
           "layer_to": 8}
    objets = [piste(0, 20, 0, "P", 0), piste(20, 40, 0, "P", 4, via)]
    vois = [piste(0, 20, 0.35, "N", 0), piste(20, 40, 0.35, "N", 4, via)]
    d = _doc(objets, {}, vois, [("P", "N")])
    d["stackup"]["layers"] = six
    o = {"debit": 16e9, "tr": 20e-12, "v_haut": 1.0, "v_bas": -1.0,
         "r_source": 100.0, "r_charge": 100.0, "c_charge": 0.0,
         "mode": "diff"}
    p = oeil._params(o, None)
    df, n, _, _ = oeil.grille(16e9, 20e-12, 0.3e-9)
    f = df * np.arange(1, n + 1)
    # LA MEME CASCADE, SANS SES VIAS, dans le meme appel : le couplage --
    # le plus cher -- n'est resolu qu'une fois.
    orig = se._cascade_differentielle
    sans = {}

    def double(*a, **k):
        sans["s_diff"] = orig(*a, **dict(k, modeles_via=None,
                                          coudes_par_troncon=None,
                                          z_trav=None))
        return orig(*a, **k)
    se._cascade_differentielle = double
    try:
        res = se.simuler(d, garder_abcd=True, freqs_imposees=f)
    finally:
        se._cascade_differentielle = orig
    sd, s0 = res["s_diff"], sans["s_diff"]
    assert sd["vias"] == 1 and s0["vias"] == 0, (sd["vias"], s0["vias"])
    h_avec = oeil.oeil(f, sd["abcd_dd"], dict(p))["mesures"]["hauteur_pire"]
    h_sans = oeil.oeil(f, s0["abcd_dd"], dict(p))["mesures"]["hauteur_pire"]
    assert h_avec < h_sans - 0.02, (h_avec, h_sans)


for nom, fn in list(globals().items()):
    if callable(fn) and getattr(fn, "__module__", "") == "__main__" \
            and not nom.startswith("_") and nom not in ("T", "proche"):
        T(nom.replace("_", " "), fn)

print("\n" + "-" * 62)
print("  %d cas, %s" % (ok + ko, "tous passes" if not ko else "%d en echec" % ko))
sys.exit(1 if ko else 0)
