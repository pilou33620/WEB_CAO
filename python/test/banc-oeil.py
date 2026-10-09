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


for nom, fn in list(globals().items()):
    if callable(fn) and getattr(fn, "__module__", "") == "__main__" \
            and not nom.startswith("_") and nom not in ("T", "proche"):
        T(nom.replace("_", " "), fn)

print("\n" + "-" * 62)
print("  %d cas, %s" % (ok + ko, "tous passes" if not ko else "%d en echec" % ko))
sys.exit(1 if ko else 0)
