# -*- coding: utf-8 -*-
"""D'ou viennent les references figees de ce dossier : python/ibis.py, tel qu'il etait au
portage. A relancer depuis la racine du depot tant que le module Python existe :

    python3 rust/ibis/essais/references.py

Ecrit numerique.txt -- une ligne « nom valeurs... » par grandeur, que src/essais.rs recalcule
et compare (a l'octet pour les lignes « exact: », a 1e-9 pres pour les autres : numpy, sa FFT
et LAPACK n'arrondissent pas le dernier chiffre comme Rust).
"""
import math
import os
import random
import sys

import numpy as np

ICI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(ICI, "..", "..", "..", "python"))
import ibis                                                            # noqa: E402

lignes = []


def dire(nom, v, exact=False):
    v = np.asarray(v)
    if np.iscomplexobj(v):
        v = np.stack([v.real, v.imag], axis=-1)
    lignes.append("%s%s %s" % ("exact:" if exact else "", nom,
                               " ".join(repr(float(x)) for x in v.ravel())))


def texte(nom):
    with open(os.path.join(ICI, nom), encoding="utf-8") as fh:
        return fh.read()


# -- les fonctions de numpy refaites a la main ------------------------------
r = random.Random(1)
for n in (1, 2, 3, 4, 5, 7, 9, 23, 60):
    xp = [r.uniform(0, 10) for _ in range(n)]
    if n % 2:
        xp.sort()
    fp = [r.uniform(-1, 1) for _ in range(n)]
    x = [r.uniform(-1, 11) for _ in range(40)] + xp[:3]
    dire("entree:interp_xp_%d" % n, xp, True)
    dire("entree:interp_fp_%d" % n, fp, True)
    dire("entree:interp_x_%d" % n, x, True)
    dire("interp_%d" % n, np.interp(x, xp, fp), True)
for n in (0, 1, 5, 7, 8, 9, 17, 100, 128, 129, 300, 1000):
    a = [r.uniform(-1, 1) * 10 ** r.randrange(-8, 8) for _ in range(n)]
    dire("entree:somme_%d" % n, a, True)
    dire("somme_%d" % n, [np.sum(np.array(a))], True)

# -- les boitiers en frequence ----------------------------------------------
f = 1e8 * (1 + 5 * np.arange(20))
lu = ibis.lire(texte("riche.ibs"), "riche.ibs", complet=True)
ls = ibis.lire(texte("sections.ibs"), "sections.ibs", complet=True)
mb_s = ls["modeles_boitier"]["PKG_S"]
dire("sections_a2", ibis.abcd_sections(f, mb_s["sections_broche"]["A2"]))
for sens in ("emission", "reception"):
    dire("boitier_a1_" + sens, ibis.abcd_boitier(f, ibis.boitier_broche(lu, "A1"), sens))
    dire("boitier_sections_" + sens, ibis.abcd_boitier(f, ibis.boitier_broche(ls, "A1"), sens))
    bp, bn = ibis.boitier_broche(lu, "A1", "typ", "A2"), ibis.boitier_broche(lu, "A2", "typ", "A1")
    mut = ibis.mutuelle_paire(lu, "A1", "A2")
    paire = ibis.abcd_boitier_paire(f, bp, bn, mut, sens)
    dire("paire_" + sens, paire)
    cpl = ibis.voisins_boitier(lu, ["A1", "A2"])
    couple = ibis.abcd_boitier_couple(f, cpl, sens, 50.0)
    dire("couple_" + sens, couple)
    dire("impair_" + sens, ibis.mode_impair_couple(couple))
    dire("couple_b1_" + sens, ibis.abcd_boitier_couple(f, ibis.voisins_boitier(lu, ["B1"]), sens, 75.0))
m_dd = ibis.abcd_boitier(f, bp, "emission")
m_cc = ibis.abcd_boitier(f, bn, "reception")
brins = ibis.abcd_brins(m_dd, m_cc)
dire("brins", brins)
dire("par_brin", ibis.abcd_par_brin(m_dd, None, len(f)))
y_l = np.zeros((len(f), 2, 2), dtype=complex)
y_l[:] = [[0.012, -0.002], [-0.002, 0.012]]
dire("charges", ibis.charger_brins(brins, y_l))
dire("s4", ibis.s_depuis_abcd_4(ibis.charger_brins(paire, y_l), 50.0))
dire("s2", np.array(ibis.s_depuis_abcd(m_dd, 50.0)))

# -- le passage en temporel ---------------------------------------------------
N, df, dt, tr = 400, 25e6, 10e-12, 60e-12
freqs = df * np.arange(1, N + 1)
BT = {"r": 0.5, "l": 3e-9, "c": 1e-12}


def canal(fr):
    """boitier, ligne (55 ohms, 0,3 ns), charge (10 kohms // 1 pF)"""
    w = 2 * math.pi * np.asarray(fr, dtype=float)
    th = w * 0.3e-9
    ligne = np.zeros((len(w), 2, 2), dtype=complex)
    ligne[:, 0, 0] = ligne[:, 1, 1] = np.cos(th)
    ligne[:, 0, 1] = 55j * np.sin(th)
    ligne[:, 1, 0] = 1j * np.sin(th) / 55
    ch = np.zeros((len(w), 2, 2), dtype=complex)
    ch[:, 0, 0] = ch[:, 1, 1] = 1.0
    ch[:, 1, 0] = 1e-4 + 1j * w * 1e-12
    return ibis.abcd_boitier(fr, BT, "emission") @ ligne @ ch


s_f = ibis.s_depuis_abcd(canal(freqs), 50.0)
s_dc = [float(np.real(x[0])) for x in ibis.s_depuis_abcd(canal([0.0]), 50.0)]
reps = [ibis.reponses_impulsionnelles(freqs, s_f[i], s_dc[i], dt, None, tr) for i in range(4)]
for i, (h, inst) in enumerate(reps):
    dire("reponse_%d" % i, h)
    dire("instantane_%d" % i, [inst])
reps = [h for h, _ in reps]
dire("tronquer", [ibis._tronquer(reps), ibis._tronquer(reps, 1e-3)], True)

# -- les commandes ------------------------------------------------------------
cmds = {}
for nom, coin in (("IO1", "typ"), ("IO1", "max"), ("IO2", "min")):
    m = lu["modeles"][nom]
    t = ibis.Tampon(m, coin)
    c = ibis.commandes(m, t, dt)
    cmds[nom, coin] = (t, c)
    for sens in ("montant", "descendant"):
        dire("ku_%s_%s_%s" % (nom, coin, sens), c[sens][0])
        dire("kd_%s_%s_%s" % (nom, coin, sens), c[sens][1])
    dire("fronts_%s_%s" % (nom, coin), [ibis.duree_front(c["montant"], dt),
                                        ibis.instant_mi_front(c["montant"], dt)])
t_lin, c_lin = ibis.tampon_lineaire(30.0, 1.0, 0.0, 100e-12, dt, 1e-12)
dire("ku_lineaire", c_lin["montant"][0], True)
dire("fronts_lineaire", [ibis.duree_front(c_lin["montant"], dt),
                         ibis.instant_mi_front(c_lin["montant"], dt)], True)

# -- la liaison dans le temps -------------------------------------------------
bits = [0, 1, 0, 1, 1, 0, 0, 1]
Lr = ibis._tronquer(reps)
court = [h[:Lr] for h in reps]
rx = ibis.Tampon(lu["modeles"]["IN1"], "typ")
for nom, (t, c), r_ in (("io1", cmds["IO1", "typ"], rx), ("io2", cmds["IO2", "min"], None),
                        ("lin", (t_lin, c_lin), rx)):
    v1, v2 = ibis.Liaison(court, 50.0, dt, t, c, r_, 0.1).simuler(bits, 20, 200e-12)
    dire("liaison_%s_v1" % nom, v1)
    dire("liaison_%s_v2" % nom, v2)

# -- la paire -------------------------------------------------------------------
ligne4 = ibis.abcd_brins(canal(freqs), canal(freqs * 1.1))
y_p = np.zeros((N, 2, 2), dtype=complex)
y_p[:] = [[0.012, -0.002], [-0.002, 0.012]]
s4 = ibis.s_depuis_abcd_4(ibis.charger_brins(ligne4, y_p), 50.0)
s4_0 = np.real(ibis.s_depuis_abcd_4(ibis.charger_brins(
    ibis.abcd_brins(canal([0.0]), canal([0.0])), y_p[:1]), 50.0))[0]
reps4 = [[ibis.reponses_impulsionnelles(freqs, s4[:, i, j], s4_0[i, j], dt, None, tr)[0]
          for j in range(4)] for i in range(4)]
L4 = ibis._tronquer([h for l in reps4 for h in l])
reps4 = [[h[:L4] for h in l] for l in reps4]
dire("tronquer4", [L4], True)
t1, c1 = cmds["IO1", "typ"]
t2, c2 = cmds["IO1", "max"]
for nom, rxs, dec in (("sans", (None, None), (0.0, 0.0)), ("diodes", (rx, rx), (0.0, 33e-12)),
                      ("avance", (None, rx), (-17e-12, 0.0))):
    v = ibis.LiaisonPaire(reps4, 50.0, dt, (t1, t2), (c1, c2), rxs, dec).simuler(bits, 20, 200e-12)
    dire("paire_%s" % nom, v)

with open(os.path.join(ICI, "numerique.txt"), "w", encoding="utf-8", newline="\n") as fh:
    fh.write("\n".join(lignes) + "\n")
print(len(lignes), "lignes")
