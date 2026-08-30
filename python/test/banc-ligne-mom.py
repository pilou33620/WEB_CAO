#!/usr/bin/python3
# -*- coding: utf-8 -*-
"""Banc d'essai du solveur d'impedance (python/ligne_mom.py).

    python python/test/banc-ligne-mom.py

C'est le module qui porte toute la simulation : l'editeur PCB et la visionneuse
peignent SUR LA CARTE les chiffres qu'il rend. Il a donc besoin d'etalons
EXTERIEURS, et pas seulement de non-regression -- un calcul faux qui ne change
pas reste faux.

Deux etalons, tous deux independants de ce code :

  · le MICRORUBAN contre Hammerstad-Jensen, la reference du domaine, annoncee
    a +-1 % ;
  · la TRIPLAQUE contre la solution EXACTE en integrales elliptiques
    (transformation conforme), qui n'est pas une approximation du tout.

Un troisieme etalon s'y ajoute pour le MICRORUBAN COUVERT -- la piste interne
qui n'a de plan que d'un cote -- et il ne depend d'aucune formule exterieure :
un ruban profondement enterre est noye dans un milieu HOMOGENE, donc son
eps_eff vaut er et son Z0 vaut Z0(air)/racine(er), exactement. La fonction de
Green couverte doit en outre se reduire a la fonction nue quand la couverture
est nulle, et cette reduction-la se verifie a la precision machine.

Le reste verifie des proprietes que la physique impose : eps_eff entre 1 et er,
Z0 qui baisse quand le ruban s'elargit, convergence au raffinement, et
conservation de la puissance sur une ligne sans pertes.

Le SOLVEUR ne demande que numpy. Ce banc demande scipy en plus, pour les
integrales elliptiques de son etalon de triplaque -- c'est la seule chose du
depot qui en ait besoin, et c'est pourquoi requirements.txt ne le presente pas
comme une dependance de l'outil. Le style est celui des autres bancs du depot
(visionneuse-ipc2581/test/banc-essai.py) : pas de pytest, un decompte a la fin,
un code de retour.
"""

import os
import sys

import numpy as np

RACINE = os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(RACINE, "python"))

from ligne_mom import (EPSILON_0, solve_line, dispersion_getsinger,   # noqa: E402
                       line_losses, abcd_line, cascade_to_s,
                       green_spectral_micro, green_spectral_micro_couvert,
                       green_spectral_micro_masque, elements_coude,
                       inductance_via, abcd_via, abcd_coude)
import ligne_mom as _tl                                              # noqa: E402
import simulation_em as _se                                          # noqa: E402

H = 0.2e-3
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
    ecart = abs(vu - attendu) / abs(attendu)
    assert ecart < tol, ("%s : %.4f contre %.4f, soit %.2f %% (tolere %.2f %%)"
                         % (quoi, vu, attendu, 100 * ecart, 100 * tol))


# ==========================================================================
# Les deux etalons exterieurs
# ==========================================================================

def hammerstad_jensen(u, er):
    """Z0 et eps_eff d'un microruban de ruban mince. u = w/h."""
    eeff = (er + 1) / 2 + (er - 1) / 2 / np.sqrt(1 + 12 / u)
    if u <= 1:
        z = 60 / np.sqrt(eeff) * np.log(8 / u + u / 4)
    else:
        z = 120 * np.pi / (np.sqrt(eeff)
                           * (u + 1.393 + 0.667 * np.log(u + 1.444)))
    return z, eeff


def stripline_exacte(w, b, er):
    """Triplaque centree, ruban mince : Z0 = (30 pi / sqrt(er)) K(k')/K(k).

    k = tanh(pi w / 2b). C'est bien la TANGENTE et non la secante : Z0 doit
    BAISSER quand le ruban s'elargit, et les intervertir donne la courbe a
    l'envers -- l'erreur a ete faite ici meme avant d'etre vue, et l'etalon
    accusait alors le solveur.
    """
    from scipy.special import ellipk
    k = np.tanh(np.pi * w / (2 * b))
    kp = 1.0 / np.cosh(np.pi * w / (2 * b))
    return (30 * np.pi / np.sqrt(er)) * ellipk(kp ** 2) / ellipk(k ** 2)


print("=" * 62)
print("  BANC D'ESSAI  --  python/ligne_mom.py")
print("=" * 62)

print("\nMicroruban contre Hammerstad-Jensen (+-1 %)")
for er in (2.2, 4.3, 4.5, 10.2):
    for u in (0.5, 1.0, 1.9, 3.0, 5.0):
        def essai(er=er, u=u):
            r = solve_line({"kind": "micro", "w": u * H, "t": 0.0, "h": H,
                            "epsilon_r": er})
            z_ref, e_ref = hammerstad_jensen(u, er)
            proche(r["z0"], z_ref, 0.015, "Z0")
            proche(r["eps_eff"], e_ref, 0.02, "eps_eff")
            # eps_eff d'un microruban est TOUJOURS entre 1 (tout l'air) et er
            # (tout le stratifie). Sortir de la, c'est une erreur et non une
            # imprecision : les deux premieres versions de ce solveur y sont
            # tombees, l'une a 0,5 et l'autre au-dessus de er.
            assert 1.0 < r["eps_eff"] < er, \
                "eps_eff = %.3f hors de ]1 ; %.1f[" % (r["eps_eff"], er)
        T("er=%4.1f  w/h=%3.1f" % (er, u), essai)

print("\nTriplaque contre la solution exacte (integrales elliptiques)")
for er in (3.5, 4.5):
    for u in (0.3, 0.6, 1.0, 1.6, 2.5):
        def essai(er=er, u=u):
            b = 0.6e-3
            r = solve_line({"kind": "strip", "w": u * b, "t": 0.0, "b": b,
                            "y0": b / 2, "epsilon_r": er})
            proche(r["z0"], stripline_exacte(u * b, b, er), 0.01, "Z0")
            # Une triplaque est noyee dans un milieu homogene : sa
            # permittivite effective vaut EXACTEMENT celle du stratifie.
            assert abs(r["eps_eff"] - er) < 1e-6, r["eps_eff"]
        T("er=%4.1f  w/b=%3.1f" % (er, u), essai)


print("\nCe que la physique impose")


def z0_decroit():
    zs = [solve_line({"kind": "micro", "w": w * H, "t": 0.0, "h": H,
                      "epsilon_r": 4.3})["z0"] for w in (0.4, 0.8, 1.6, 3.2)]
    assert all(a > b for a, b in zip(zs, zs[1:])), zs


T("elargir le ruban baisse son impedance", z0_decroit)


def convergence():
    a = solve_line({"kind": "micro", "w": 1.9 * H, "t": 0.0, "h": H,
                    "epsilon_r": 4.3}, n=60)["z0"]
    b = solve_line({"kind": "micro", "w": 1.9 * H, "t": 0.0, "h": H,
                    "epsilon_r": 4.3}, n=240)["z0"]
    proche(a, b, 0.005, "Z0 a 60 puis 240 panneaux")


T("Z0 converge quand on raffine le maillage", convergence)


def decentree():
    b = 1.0e-3
    zs = [solve_line({"kind": "strip", "w": 0.2e-3, "t": 0.0, "b": b,
                      "y0": y * b, "epsilon_r": 4.3})["z0"]
          for y in (0.5, 0.35, 0.25, 0.15)]
    assert all(a > c for a, c in zip(zs, zs[1:])), zs


T("triplaque decentree : approcher un plan baisse Z0", decentree)


def epaisseur():
    mince = solve_line({"kind": "micro", "w": 0.38e-3, "t": 0.0, "h": H,
                        "epsilon_r": 4.3})["z0"]
    epais = solve_line({"kind": "micro", "w": 0.38e-3, "t": 35e-6, "h": H,
                        "epsilon_r": 4.3})["z0"]
    assert epais < mince, (epais, mince)
    assert 0.85 < epais / mince < 1.0, epais / mince


T("un ruban epais a une impedance plus basse", epaisseur)


# ==========================================================================
# Le microruban couvert
# --------------------------------------------------------------------------
# Une piste interne qui n'a de plan que d'un cote a du stratifie AU-DESSUS
# d'elle, pas de l'air. La fonction de Green couverte doit tenir les deux bouts
# connus : le microruban nu d'un cote, le ruban noye de l'autre. Ces deux
# reductions sont des etalons EXACTS -- pas des approximations a tolerer.
# ==========================================================================

def couvert_reduit_au_nu():
    """Couverture nulle -> la fonction couverte EST la fonction nue."""
    betas = np.array([1e-9, 1e-3, 1.0, 1e2, 5e3, 1e5, 1e7])
    for er in (1.0, 4.3, 10.2):
        nu = green_spectral_micro(betas, H, er)
        cv = green_spectral_micro_couvert(betas, H, 0.0, er)
        ecart = float(np.max(np.abs(cv - nu) / np.abs(nu)))
        assert ecart < 1e-12, "er=%.1f : ecart %.2e" % (er, ecart)


T("couverture nulle : la Green couverte redonne la Green nue",
  couvert_reduit_au_nu)


def couvert_tend_vers_noye():
    """Couverture epaisse -> ruban et son image dans un milieu er homogene."""
    betas = np.array([1e-3, 1.0, 1e2, 5e3, 1e5])
    er = 4.3
    cv = green_spectral_micro_couvert(betas, H, 1.0, er)
    ref = (1 - np.exp(-2 * betas * H)) / (2 * EPSILON_0 * er * betas)
    ecart = float(np.max(np.abs(cv - ref) / np.abs(ref)))
    assert ecart < 1e-4, "ecart %.2e" % ecart


T("couverture epaisse : la Green couverte redonne le ruban noye",
  couvert_tend_vers_noye)


# -----------------------------------------------------------------------------
# LE MASQUE DE SOUDURE -- trois reductions EXACTES, et le sens de l'effet
# -----------------------------------------------------------------------------
# La Green a trois regions doit SUBSUMER les deux autres. Ces trois cas sont ce
# qui separe une derivation juste d'une formule qui "donne des chiffres
# plausibles" : chacun ramene la fonction a un cas dont on connait la reponse
# fermee, et un seul terme mal place les fait tomber.

def masque_nul_redonne_le_nu():
    """Masque d'epaisseur nulle -> le microruban nu, a la precision machine."""
    betas = np.array([1e-3, 1.0, 1e2, 5e3, 1e5])
    for er in (1.0, 4.3, 10.2):
        nu = green_spectral_micro(betas, H, er)
        mq = green_spectral_micro_masque(betas, H, 1e-15, er, 3.8)
        ecart = float(np.max(np.abs(mq - nu) / np.abs(nu)))
        assert ecart < 1e-7, "er=%.1f : ecart %.2e" % (er, ecart)


T("masque nul : la Green a trois regions redonne le microruban nu",
  masque_nul_redonne_le_nu)


def masque_de_meme_er_redonne_le_couvert():
    """Masque de meme permittivite que le substrat -> le ruban couvert."""
    betas = np.array([1e-3, 1.0, 1e2, 5e3, 1e5])
    er = 4.3
    for c in (25e-6, 200e-6, 2e-3):
        cv = green_spectral_micro_couvert(betas, H, c, er)
        mq = green_spectral_micro_masque(betas, H, c, er, er)
        ecart = float(np.max(np.abs(mq - cv) / np.abs(cv)))
        assert ecart < 1e-10, "c=%.0f um : ecart %.2e" % (c * 1e6, ecart)


T("masque de meme er que le substrat : c'est le ruban couvert, au bit pres",
  masque_de_meme_er_redonne_le_couvert)


def masque_epais_tend_vers_deux_dielectriques():
    """Masque epais -> l'asymptote est 1/(eps0 beta (er2 + er1 coth(beta h))).

    C'est CETTE limite qui fixe le milieu moyen a extraire dans `solve_line` :
    eps0 (er1 + er2)/2, et non le substrat seul. Poser le substrat seul
    decalait l'extraction de la partie singuliere.
    """
    betas = np.array([2e4, 5e4, 1e5])
    er1, er2 = 4.3, 3.8
    mq = green_spectral_micro_masque(betas, H, 10e-3, er1, er2)
    ref = 1.0 / (EPSILON_0 * betas * (er2 + er1 / np.tanh(betas * H)))
    ecart = float(np.max(np.abs(mq - ref) / np.abs(ref)))
    assert ecart < 1e-9, "ecart %.2e" % ecart


T("masque epais : l'asymptote est celle des deux dielectriques",
  masque_epais_tend_vers_deux_dielectriques)


def le_vernis_baisse_z0_de_deux_a_trois_pour_cent():
    """LE CHIFFRE ATTENDU, et surtout LE SENS de l'effet.

    Un vernis de 25 um sur une piste exterieure fait baisser Z0 de 2 a 3 % et
    MONTER eps_eff -- il y a plus de dielectrique autour du ruban. La premiere
    version prenait la reference "a vide" en LAISSANT le masque a son er : C0
    gonflait, eps_eff BAISSAIT en vernissant la piste, et Z0 tombait de huit
    pour cent. C'est le sens de l'effet qui l'a trahie, pas son amplitude.
    """
    base = {"kind": "micro", "w": 0.38e-3, "t": 35e-6, "h": H,
            "epsilon_r": 4.3}
    nu = solve_line(dict(base))
    vernie = solve_line(dict(base, masque={"epaisseur": 25e-6,
                                           "epsilon_r": 3.8}))
    baisse = 100.0 * (nu["z0"] - vernie["z0"]) / nu["z0"]
    assert 1.5 < baisse < 3.5, "Z0 baisse de %.2f %%, attendu 2 a 3 %%" % baisse
    assert vernie["eps_eff"] > nu["eps_eff"], (
        "eps_eff BAISSE en vernissant : %.4f contre %.4f"
        % (vernie["eps_eff"], nu["eps_eff"]))


T("le vernis baisse Z0 de deux a trois pour cent, et monte eps_eff",
  le_vernis_baisse_z0_de_deux_a_trois_pour_cent)


def un_masque_dair_ne_fait_rien():
    """Un masque de permittivite 1 est de l'air : Z0 ne doit pas bouger."""
    base = {"kind": "micro", "w": 0.38e-3, "t": 35e-6, "h": H,
            "epsilon_r": 4.3}
    nu = solve_line(dict(base))
    air = solve_line(dict(base, masque={"epaisseur": 25e-6, "epsilon_r": 1.0}))
    proche(air["z0"], nu["z0"], 1e-4, "Z0 sous un masque d'air")


T("un masque de permittivite 1 ne change rien", un_masque_dair_ne_fait_rien)


# -----------------------------------------------------------------------------
# LES DISCONTINUITES LOCALISEES
# -----------------------------------------------------------------------------
def le_coude_suit_gupta():
    """Le coude a angle droit : les formules publiees, reposees a la main."""
    w, h, er = 0.38e-3, 0.2e-3, 4.3
    u = w / h
    c_ref = ((9.5 * er + 1.25) * u + 5.2 * er + 7.0) * 1e-12 * w
    l_ref = 100.0 * (4.0 * np.sqrt(u) - 4.21) * 1e-9 * h
    L, C = elements_coude(w, h, er, 90.0)
    proche(C, c_ref, 1e-9, "capacite du coude")
    proche(L, l_ref, 1e-9, "inductance du coude")


T("le coude a angle droit suit les formules de Gupta", le_coude_suit_gupta)


def le_coude_sannule_a_angle_nul():
    """Un troncon qui continue tout droit n'est PAS une discontinuite.

    L'ancienne formule n'avait pas d'angle du tout : un raccord aligne pesait
    autant qu'un coude a angle droit.
    """
    L, C = elements_coude(0.38e-3, 0.2e-3, 4.3, 0.0)
    assert L == 0.0 and C == 0.0, "L=%.3e C=%.3e a angle nul" % (L, C)
    C45 = elements_coude(0.38e-3, 0.2e-3, 4.3, 45.0)[1]
    C90 = elements_coude(0.38e-3, 0.2e-3, 4.3, 90.0)[1]
    proche(C45, C90 / 2.0, 1e-9, "capacite du coude a 45 degres")


T("un raccord aligne ne coute rien, un coude a 45 la moitie d'un coude droit",
  le_coude_sannule_a_angle_nul)


def les_discontinuites_sont_reciproques():
    """det(ABCD) = 1 : c'est ce que vaut tout reseau passif RECIPROQUE.

    Un signe inverse ou un facteur oublie dans le montage du T ou du pi le
    casse, et rien d'autre ne l'attraperait.
    """
    for f in (1e8, 1e9, 1e10):
        d = abcd_coude(0.38e-3, 0.2e-3, 4.3, f, 90.0)
        proche(abs(np.linalg.det(d)), 1.0, 1e-9, "det du coude")
        d = abcd_via(1.6e-3, 0.3e-3, 0.75e-3, 4.3, f)
        proche(abs(np.linalg.det(d)), 1.0, 1e-9, "det du via")


T("les matrices de discontinuite sont reciproques : det = 1",
  les_discontinuites_sont_reciproques)


def linductance_du_via_est_en_metres():
    """UN VIA DE 1,6 mm PESE ENVIRON UN NANOHENRY, pas un microhenry.

    Le rapport h/d est sans dimension : le logarithme survit a une erreur
    d'unite, et seul le prefacteur mu0*h la trahit. La cascade appelait ces
    fonctions EN MILLIMETRES et rendait donc mille fois trop -- un ordre de
    grandeur faux dans une fiche a l'air d'un ordre de grandeur.
    """
    L = inductance_via(1.6e-3, 0.3e-3)
    assert 0.5e-9 < L < 3e-9, "L = %.3e H pour un via de 1,6 mm" % L


T("un via de 1,6 mm vaut environ un nanohenry",
  linductance_du_via_est_en_metres)


def enterre_vaut_le_milieu_homogene():
    """Ruban profondement enterre : eps_eff -> er, et Z0 = Z0(air)/racine(er).

    C'est la contrainte la plus forte du lot, parce qu'elle ne depend d'aucune
    formule exterieure : un ruban noye dans un milieu HOMOGENE voit sa vitesse
    divisee par racine(er) et son impedance avec, quelle que soit la section.
    """
    er = 4.3
    g = {"kind": "micro", "w": 0.38e-3, "t": 35e-6, "h": H, "couverture": 5e-3}
    plein = solve_line(dict(g, epsilon_r=er))
    vide = solve_line(dict(g, epsilon_r=1.0))
    proche(plein["eps_eff"], er, 0.005, "eps_eff d'un ruban enterre")
    proche(plein["z0"], vide["z0"] / np.sqrt(er), 0.005,
           "Z0 enterre contre Z0(air)/racine(er)")


T("ruban enterre : eps_eff vaut er, et Z0 suit racine(er)",
  enterre_vaut_le_milieu_homogene)


def couverture_baisse_z0():
    """Couvrir une piste ne peut que monter eps_eff et baisser Z0."""
    g = {"kind": "micro", "w": 0.38e-3, "t": 35e-6, "h": H, "epsilon_r": 4.3}
    rs = [solve_line(dict(g, couverture=c))
          for c in (0.0, 0.05e-3, 0.1e-3, 0.2e-3, 0.5e-3, 2e-3)]
    zs = [r["z0"] for r in rs]
    es = [r["eps_eff"] for r in rs]
    assert all(a > b for a, b in zip(zs, zs[1:])), zs
    assert all(a < b for a, b in zip(es, es[1:])), es
    assert es[-1] < 4.3, es[-1]
    # L'ecart au modele nu est ce qui justifie tout ce code : sur une couche
    # interne courante il depasse largement le pour cent.
    assert (zs[0] - zs[3]) / zs[0] > 0.05, (zs[0], zs[3])


T("couvrir une piste monte eps_eff et baisse Z0, et ce n'est pas marginal",
  couverture_baisse_z0)


# ==========================================================================
# Le plan de masse COPLANAIRE
# --------------------------------------------------------------------------
# Une piste noyee dans un plan arrose -- le cas ordinaire d'une carte RF -- a
# du cuivre de masse sur SA PROPRE COUCHE, a quelques dixiemes de millimetre.
# Le prendre pour un microruban surestime Z0 de vingt pour cent et davantage.
#
# Trois etalons, et les deux premiers sont EXACTS :
#   · ecart nul  -> le microruban, au bit pres ;
#   · ecart grand -> le microruban de nouveau, la masse coplanaire etant partie
#     a l'infini. C'est la contrainte la plus severe : le modele doit etre
#     CONTINU aux deux bouts, sans quoi il y a une bosse quelque part au milieu ;
#   · aux ecarts serres, la transformation conforme (Wen), qui est la reference
#     du domaine. Elle derive quand la masse s'eloigne -- sa geometrie de
#     depart ne se reduit pas au microruban --, on ne la teste donc que la ou
#     elle vaut quelque chose.
# ==========================================================================

def cpwg_conforme(w, s, h, er):
    """CPW sur plan, par transformation conforme. Ruban d'epaisseur nulle."""
    from scipy.special import ellipk
    a, b = w / 2.0, w / 2.0 + s
    k1 = a / b
    k3 = np.tanh(np.pi * a / (2 * h)) / np.tanh(np.pi * b / (2 * h))
    K = lambda k: ellipk(k * k)                        # noqa: E731
    Kp = lambda k: ellipk(1 - k * k)                   # noqa: E731
    q = (Kp(k1) / K(k1)) * (K(k3) / Kp(k3))
    eeff = (1 + er * q) / (1 + q)
    return 60 * np.pi / np.sqrt(eeff) / (K(k1) / Kp(k1) + K(k3) / Kp(k3))


def coplanaire_nul_est_microruban():
    """Ecart nul -> exactement le microruban, sans la moindre derive."""
    g = {"kind": "micro", "w": 0.52e-3, "t": 35e-6, "h": 0.37e-3,
         "epsilon_r": 4.37}
    sans = solve_line(g)["z0"]
    avec = solve_line(dict(g, ecart=0.0))["z0"]
    assert abs(sans - avec) < 1e-12, (sans, avec)


T("ecart nul : le coplanaire redonne le microruban au bit pres",
  coplanaire_nul_est_microruban)


def coplanaire_loin_est_microruban():
    """Masse coplanaire repoussee -> le microruban de nouveau."""
    g = {"kind": "micro", "w": 0.52e-3, "t": 0.0, "h": 0.37e-3,
         "epsilon_r": 4.37}
    nu = solve_line(g)["z0"]
    for s in (3e-3, 10e-3):
        proche(solve_line(dict(g, ecart=s))["z0"], nu, 0.005,
               "Z0 a ecart %.0f mm contre le microruban nu" % (s * 1e3))


T("masse coplanaire repoussee : on retrouve le microruban",
  coplanaire_loin_est_microruban)


def coplanaire_contre_conforme():
    """Aux ecarts serres, contre la transformation conforme."""
    H = 0.37e-3
    for wr in (0.6, 1.4, 3.0):
        for sr in (0.3, 0.6):
            w, s = wr * H, sr * H
            vu = solve_line({"kind": "micro", "w": w, "t": 0.0, "h": H,
                             "epsilon_r": 4.37, "ecart": s})["z0"]
            proche(vu, cpwg_conforme(w, s, H, 4.37), 0.015,
                   "w/h=%.1f s/h=%.1f" % (wr, sr))


T("coplanaire contre la transformation conforme, aux ecarts serres",
  coplanaire_contre_conforme)


def coplanaire_serre_baisse_z0():
    """Rapprocher la masse ne peut que baisser Z0, sans marche ni bosse."""
    g = {"kind": "micro", "w": 0.52e-3, "t": 35e-6, "h": 0.37e-3,
         "epsilon_r": 4.37}
    zs = [solve_line(dict(g, ecart=s))["z0"]
          for s in (2e-3, 1e-3, 0.5e-3, 0.3e-3, 0.2e-3, 0.12e-3)]
    assert all(a > b for a, b in zip(zs, zs[1:])), zs
    # Et l'ecart au microruban nu doit etre GROS : c'est tout l'objet du calcul.
    nu = solve_line(g)["z0"]
    assert (nu - zs[-1]) / nu > 0.15, (nu, zs[-1])


T("resserrer la masse coplanaire baisse Z0, et pas qu'un peu",
  coplanaire_serre_baisse_z0)


# --------------------------------------------------------------------------
# LA MASSE N'EST PAS SYMETRIQUE (1.3.0)
# Le cuivre d'une carte ne l'est pas : une piste longe une decoupe d'un cote et
# du plan serre de l'autre. Ces quatre cas verrouillent les reductions exactes
# -- ce sont elles qui garantissent qu'ajouter un deuxieme ecart n'a rien casse
# de ce qui marchait -- puis la physique du cas asymetrique lui-meme.
# --------------------------------------------------------------------------
ASYM = {"kind": "micro", "w": 0.52e-3, "t": 35e-6, "h": 0.37e-3,
        "epsilon_r": 4.37}


def asym_ecarts_egaux_est_lancien():
    """Deux ecarts egaux -> exactement l'ecart unique, au bit pres."""
    for s in (0.12e-3, 0.3e-3, 1e-3):
        un = solve_line(dict(ASYM, ecart=s))["z0"]
        deux = solve_line(dict(ASYM, ecart_g=s, ecart_d=s))["z0"]
        assert abs(un - deux) < 1e-12, (s, un, deux)


T("ecarts egaux des deux cotes : c'est l'ancien calcul, au bit pres",
  asym_ecarts_egaux_est_lancien)


def asym_deux_zeros_est_microruban():
    """Aucun cote avec masse -> le microruban nu, au bit pres."""
    nu = solve_line(ASYM)["z0"]
    vu = solve_line(dict(ASYM, ecart_g=0.0, ecart_d=0.0))["z0"]
    assert abs(nu - vu) < 1e-12, (nu, vu)


T("aucun cote avec masse : le microruban nu, au bit pres",
  asym_deux_zeros_est_microruban)


def asym_un_seul_cote():
    """Masse d'un cote seul : entre le microruban nu et le coplanaire.

    C'EST LE CAS QUI ETAIT FAUX. La piste qui longe une decoupe partait avec
    l'ecart serre pose des DEUX cotes : deux fois la baisse de Z0 qu'elle
    subit vraiment. La moitie du cuivre, ce n'est pas la moitie de l'effet --
    le champ se redistribue -- mais c'est franchement moins, et le calcul doit
    tomber entre les deux bornes sans jamais les toucher.
    """
    nu = solve_line(ASYM)["z0"]
    for s in (0.12e-3, 0.2e-3, 0.4e-3):
        sym = solve_line(dict(ASYM, ecart=s))["z0"]
        seul = solve_line(dict(ASYM, ecart_g=s, ecart_d=0.0))
        assert sym < seul["z0"] < nu, (s, sym, seul["z0"], nu)
        assert seul["cotes"] == 1, seul["cotes"]
        # Et la gauche vaut la droite : la section est mise en miroir, rien de
        # plus. Sans cela, le signe du produit vectoriel qui choisit le cote
        # dans la page deviendrait un parametre du resultat.
        miroir = solve_line(dict(ASYM, ecart_g=0.0, ecart_d=s))["z0"]
        proche(miroir, seul["z0"], 1e-9, "gauche contre droite a %.2f mm"
               % (s * 1e3))


T("masse d'un cote seul : entre le nu et le symetrique, et sans cote privilegie",
  asym_un_seul_cote)


def asym_repousser_un_cote_monte_z0():
    """Eloigner UN cote fait monter Z0, jusqu'au cas du cote seul."""
    serre = 0.15e-3
    zs = [solve_line(dict(ASYM, ecart_g=serre, ecart_d=d))["z0"]
          for d in (0.15e-3, 0.3e-3, 0.6e-3, 1.2e-3, 3e-3)]
    assert all(a < b for a, b in zip(zs, zs[1:])), zs
    # A trois millimetres sous 0,37 mm de dielectrique, ce cote ne compte plus :
    # on doit retrouver le cas du cote seul a un demi pour cent.
    seul = solve_line(dict(ASYM, ecart_g=serre, ecart_d=0.0))["z0"]
    proche(zs[-1], seul, 0.005, "cote repousse a 3 mm contre le cote seul")


T("repousser un seul cote monte Z0 et rejoint le cas du cote seul",
  asym_repousser_un_cote_monte_z0)


def dispersion():
    r = solve_line({"kind": "micro", "w": 0.38e-3, "t": 35e-6, "h": H,
                    "epsilon_r": 4.3})
    e1, _ = dispersion_getsinger(r["z0"], r["eps_eff"], 4.3, H, 1e8)
    e2, _ = dispersion_getsinger(r["z0"], r["eps_eff"], 4.3, H, 10e9)
    assert e1 <= e2 < 4.3, (e1, e2)


T("eps_eff monte avec la frequence, sans depasser er", dispersion)


def pertes():
    ac1, ad1 = line_losses(50.0, 3.3, 0.38e-3, 4.3, 0.02, 1e9)
    ac2, ad2 = line_losses(50.0, 3.3, 0.38e-3, 4.3, 0.02, 10e9)
    assert 0 < ac1 < ac2, (ac1, ac2)
    assert 0 < ad1 < ad2, (ad1, ad2)


T("les pertes croissent avec la frequence", pertes)


print("\nLa mise en cascade et les parametres S")


def adaptee():
    """Une ligne 50 ohms sans pertes chargee sur 50 ohms : rien ne revient."""
    beta = 2 * np.pi * 1e9 * np.sqrt(3.3) / 2.99792458e8
    s = cascade_to_s(abcd_line(50.0, complex(0.0, beta), 30e-3), 50.0)
    assert abs(s[0, 0]) < 1e-9, abs(s[0, 0])
    assert abs(abs(s[1, 0]) - 1.0) < 1e-9, abs(s[1, 0])


T("une ligne adaptee ne reflechit rien", adaptee)


def discontinuite():
    """Un troncon etroit entre deux larges renvoie de l'energie : c'est tout
    l'interet de la mise en cascade."""
    beta = 2 * np.pi * 5e9 * np.sqrt(3.3) / 2.99792458e8
    g = complex(0.0, beta)
    droit = abcd_line(50.0, g, 30e-3)
    coupe = (abcd_line(50.0, g, 10e-3)
             @ abcd_line(90.0, g, 10e-3)
             @ abcd_line(50.0, g, 10e-3))
    assert abs(cascade_to_s(droit, 50.0)[0, 0]) < 1e-9
    assert abs(cascade_to_s(coupe, 50.0)[0, 0]) > 0.2


T("un retrecissement au milieu reflechit", discontinuite)


def puissance():
    """Sans pertes, |S11|^2 + |S21|^2 = 1. Une matrice S qui ne le respecte pas
    decrit une ligne qui cree ou detruit de l'energie."""
    beta = 2 * np.pi * 3e9 * np.sqrt(3.3) / 2.99792458e8
    s = cascade_to_s(abcd_line(75.0, complex(0.0, beta), 12e-3), 50.0)
    total = abs(s[0, 0]) ** 2 + abs(s[1, 0]) ** 2
    assert abs(total - 1.0) < 1e-9, total


T("la puissance se conserve sans pertes", puissance)


# -----------------------------------------------------------------------------
# DE L'EMPILAGE A LA SECTION -- simulation_em.section_de_couche
# -----------------------------------------------------------------------------
# Le solveur ci-dessus n'est juste que si on lui donne la BONNE SECTION, et
# c'est `section_de_couche` qui la lui donne. C'est du code qu'aucun banc
# n'executait : les defauts ci-dessous y ont vecu tels quels, sans rien casser
# de visible.
# -----------------------------------------------------------------------------

def _cu(nom, role):
    return {"name": nom, "type": "copper", "thickness": 0.035, "role": role}


def _di(nom, ep, er):
    return {"name": nom, "type": "dielectric", "thickness": ep,
            "epsilon_r": er, "tan_delta": 0.02}


_FACE = [_cu("Bot", "plane"), _di("Core", 0.2, 4.3), _cu("Top", "signal")]


def declarer_le_masque_ne_change_pas_le_resultat():
    """LE MEME empilage physique doit rendre LE MEME chiffre.

    Une piste exterieure porte du vernis, qu'on l'ait ecrit dans l'empilage ou
    non : le repli est de 25 um a er 3,8, et c'est exactement ce que vaut le
    masque declare ici. Les deux doivent donc coincider AU BIT PRES.

    Ils ne coincidaient pas. Le vernis declare etait compte DEUX FOIS : une
    fois par la Green a trois regions, ce qui est juste, et une fois de plus en
    moyenne ponderee dans l'epsilon du SUBSTRAT, ce qui ne l'est pas -- comme
    si la resine se trouvait ENTRE la piste et le plan alors qu'elle est
    au-dessus. er tombait de 4,3 a 4,2444, Z0 montait de 0,56 % et eps_eff
    baissait de 1,12 %. Autrement dit : renseigner son empilage rendait le
    resultat faux, et le taire le rendait juste.
    """
    geo_i, _ = _se.section_de_couche(_FACE, 2, 0.38, 0.035)
    geo_d, _ = _se.section_de_couche(
        _FACE + [_di("Solder Mask", 0.025, 3.8)], 2, 0.38, 0.035)
    proche(geo_d["epsilon_r"], 4.3, 1e-12,
           "l'epsilon du substrat sous un masque declare")
    r_i, r_d = solve_line(geo_i), solve_line(geo_d)
    proche(r_d["z0"], r_i["z0"], 1e-9, "Z0, masque declare contre implicite")
    proche(r_d["eps_eff"], r_i["eps_eff"], 1e-9,
           "eps_eff, masque declare contre implicite")


T("declarer le masque dans l'empilage ne change pas le resultat",
  declarer_le_masque_ne_change_pas_le_resultat)


def un_masque_plus_epais_pese_plus():
    """Plus de vernis, c'est plus de dielectrique autour du ruban : Z0 baisse
    et eps_eff monte. On verifie le SENS et la MONOTONIE."""
    r = []
    for ep in (0.015, 0.025, 0.050):
        geo, _ = _se.section_de_couche(
            _FACE + [_di("Solder Mask", ep, 3.8)], 2, 0.38, 0.035)
        r.append(solve_line(geo))
    for a, b in zip(r, r[1:]):
        assert b["z0"] < a["z0"], (
            "Z0 ne baisse pas : %.4f puis %.4f" % (a["z0"], b["z0"]))
        assert b["eps_eff"] > a["eps_eff"], (
            "eps_eff ne monte pas : %.4f puis %.4f"
            % (a["eps_eff"], b["eps_eff"]))


T("un masque plus epais baisse Z0 et monte eps_eff",
  un_masque_plus_epais_pese_plus)


def une_piste_enterree_ne_recoit_pas_de_vernis():
    """Sous du prepreg, la piste est ENTERREE, pas vernie.

    Le test d'exterieur posait la question du MAUVAIS COTE : il regardait la
    couche d'indice - 1, celle du cote du PLAN, pour decider ce qu'il y avait
    du cote de la FACE, et il y cherchait du cuivre la ou c'est le dielectrique
    qui tranche. Une piste couverte de 0,1 mm de prepreg recevait donc par
    dessus un vernis de 25 um, et son prepreg -- le dielectrique qui compte --
    partait a la poubelle.
    """
    geo, _ = _se.section_de_couche(
        _FACE + [_di("PP2", 0.1, 3.6)], 2, 0.38, 0.035)
    assert geo.get("masque") is None, (
        "vernis invente sur une piste enterree : %r" % (geo.get("masque"),))
    proche(geo["couverture"], 0.1e-3, 1e-9, "la couverture de prepreg")
    proche(geo["epsilon_r"], (4.3 * 0.2 + 3.6 * 0.1) / 0.3, 1e-12,
           "l'epsilon melange de la piste enterree")


T("une piste enterree sous prepreg ne recoit pas de vernis invente",
  une_piste_enterree_ne_recoit_pas_de_vernis)


def couverture_et_masque_ne_sont_jamais_les_deux():
    """La meme resine ne doit pas etre nommee deux fois.

    Ou bien la piste est a la face et ce qui la couvre est un MASQUE, ou bien
    elle est enterree et c'est une COUVERTURE. Jamais les deux a la fois : la
    section porterait deux fois la meme epaisseur de dielectrique.
    """
    for cs in (_FACE,
               _FACE + [_di("Solder Mask", 0.025, 3.8)],
               _FACE + [_di("PP2", 0.1, 3.6)]):
        geo, _ = _se.section_de_couche(cs, 2, 0.38, 0.035)
        deux = geo.get("masque") is not None and geo.get("couverture", 0.0) > 0
        assert not deux, ("masque ET couverture sur %s"
                          % [c["name"] for c in cs])


T("couverture et masque ne decrivent jamais la meme resine",
  couverture_et_masque_ne_sont_jamais_les_deux)


def une_seule_definition_par_fonction():
    """Deux `def` du meme nom, c'est la derniere qui gagne -- en silence.

    `inductance_via` et `capacite_pastille` etaient definies DEUX FOIS dans
    ligne_mom : la premiere documentait ses arguments en MILLIMETRES, la
    seconde en METRES, et seule la seconde s'executait. Un lecteur qui tombait
    sur la premiere l'appelait en mm et se trompait d'un facteur mille sans que
    rien ne le lui dise.
    """
    import io as _io
    noms = []
    for ligne in _io.open(_tl.__file__, encoding="utf-8"):
        if ligne.startswith("def "):
            noms.append(ligne[4:].split("(")[0].strip())
    doubles = sorted({n for n in noms if noms.count(n) > 1})
    assert not doubles, "definies plusieurs fois dans ligne_mom : %s" % doubles


T("chaque fonction de ligne_mom n'est definie qu'une fois",
  une_seule_definition_par_fonction)



# -----------------------------------------------------------------------------
# LE VIA D'UNE TRANSITION -- simulation_em._hauteur_via, _cotes_via, _coudes,
# _ruptures
# -----------------------------------------------------------------------------
# CE QUE CES CAS VERROUILLENT. Une liaison qui change de couche est le cas le
# plus banal d'une vraie carte, et c'est celui que la chaine traitait le plus
# mal -- non pas dans le solveur, qui est juste, mais dans les trois fonctions
# qui LISENT la selection avant lui :
#
#   · `_coudes` fabriquait un coude de 0 degre, 0 pH, 0 fF a chaque changement
#     de couche : deux troncons colineaires sur deux couches n'ont pas de
#     coude, et deux troncons sur des couches differentes ne se raccordent pas
#     dans un plan de toute facon ;
#   · `_ruptures` exigeait DEUX points de contact pour reconnaitre un via.
#     Un via en fournit UN. Toute liaison changeant de couche etait donc
#     annoncee ROMPUE, devant un parcours parfaitement continu ;
#   · `_cotes_via` SUPPOSAIT la hauteur du via -- « 0,2 mm par couche
#     traversee », compte en indices d'empilage, donc 0,4 mm par couche de
#     cuivre --, alors que l'empilage la porte exactement.
#
# Les trois etaient silencieux : aucun ne leve, tous rendent un chiffre.
# -----------------------------------------------------------------------------

# Un empilage quatre couches ordinaire, et sa hauteur totale connue d'avance.
_QUATRE = [
    _cu("TOP", "signal"),
    _di("PP", 0.200, 4.20),
    _cu("GND", "plane"),
    _di("CORE", 0.800, 4.50),
    _cu("PWR", "plane"),
    _di("PP2", 0.200, 4.20),
    _cu("BOT", "signal"),
]
# 4 x 0,035 de cuivre + 0,200 + 0,800 + 0,200 de dielectrique
_EPAISSEUR_CARTE = 4 * 0.035 + 0.200 + 0.800 + 0.200


def _piste(x1, y1, x2, y2, couche, largeur=0.35, via=None):
    o = {"type": "track", "start": [x1, y1], "end": [x2, y2],
         "width": largeur, "layer": couche, "net": "SIG",
         "copper_thickness": 0.035}
    if via is not None:
        o["via"] = via
    return o


def _doc_via(objets, couches=None, fc=200e6):
    return {"format": "cao-sim-em-1",
            "stackup": {"layers": couches if couches is not None else _QUATRE},
            "geometry": {"objects": objets},
            "analyse": {"f_debut": fc / 10, "f_fin": fc * 2,
                        "f_centre": fc, "points": 11}}


def la_hauteur_du_via_se_lit_dans_l_empilage():
    """LA HAUTEUR N'A JAMAIS EU BESOIN D'ETRE SUPPOSEE.

    Un via traversant perce toute la carte : sa longueur est la somme des
    epaisseurs, bornes comprises. L'ancien repli comptait « 0,2 mm par couche
    traversee » en indices d'EMPILAGE -- qui alternent cuivre et dielectrique,
    donc 0,4 mm par couche de cuivre -- et rendait 1,200 mm la ou la carte en
    fait 1,340 : 12 % d'erreur, que l'inductance emporte au premier ordre.
    """
    h = _se._hauteur_via(_QUATRE, 0, 6)
    proche(h, _EPAISSEUR_CARTE, 1e-9,
           "la hauteur d'un via traversant TOP -> BOT")
    assert abs(h - 0.2 * 6) > 0.1, (
        "la hauteur vaut encore le repli 0,2 x sauts (%.4f)" % h)

    # UN VIA BORGNE ne perce que jusqu'a sa couche d'arrivee.
    h_borgne = _se._hauteur_via(_QUATRE, 0, 2)
    proche(h_borgne, 0.035 + 0.200 + 0.035, 1e-9,
           "la hauteur d'un via borgne TOP -> GND")

    # LE SENS NE CHANGE RIEN : un via se perce dans les deux sens.
    proche(_se._hauteur_via(_QUATRE, 6, 0), h, 1e-12,
           "la hauteur ne depend pas du sens")


T("la hauteur d'un via se lit dans l'empilage, elle ne se suppose plus",
  la_hauteur_du_via_se_lit_dans_l_empilage)


def un_changement_de_couche_n_est_pas_un_coude():
    """DEUX TRONCONS SUR DEUX COUCHES NE SE RACCORDENT PAS DANS UN PLAN.

    Ce qui les joint est un via, et le via a son propre modele. Un modele de
    coude planaire n'a rien a faire la, meme si les deux troncons font un
    angle vu de dessus -- et la version precedente en posait un, a 0 degre,
    0 pH, 0 fF, affiche dans la fiche a cote du via.

    ON VERIFIE AUSSI LE CAS COLINEAIRE SUR LA MEME COUCHE : deux troncons
    alignes n'ont pas de coude non plus, et le seuil qui le dit est celui de la
    RESOLUTION des coordonnees, pas un jugement de modelisation. Un coude de
    5 degres, lui, reste emis.
    """
    # Colineaires, deux couches : ni coude, ni rupture -- un via.
    d = _doc_via([_piste(0, 0, 15, 0, 0), _piste(15, 0, 30, 0, 6)])
    r = _se.simuler(d)
    assert not r["discontinuites"]["coudes"], (
        "un changement de couche a produit un coude : %s"
        % r["discontinuites"]["coudes"])
    assert len(r["discontinuites"]["transitions"]) == 1, \
        "la transition de couche n'a pas ete vue"

    # A angle droit, deux couches : toujours pas de coude -- c'est un via.
    d = _doc_via([_piste(0, 0, 15, 0, 0), _piste(15, 0, 15, 15, 6)])
    r = _se.simuler(d)
    assert not r["discontinuites"]["coudes"], (
        "un via coude a produit un coude planaire : %s"
        % r["discontinuites"]["coudes"])

    # Colineaires, MEME couche : pas de coude non plus.
    d = _doc_via([_piste(0, 0, 15, 0, 0), _piste(15, 0, 30, 0, 0)])
    r = _se.simuler(d)
    assert not r["discontinuites"]["coudes"], (
        "deux troncons colineaires ont produit un coude : %s"
        % r["discontinuites"]["coudes"])

    # A angle droit, MEME couche : LA il y a un coude, et il doit peser.
    d = _doc_via([_piste(0, 0, 15, 0, 0), _piste(15, 0, 15, 15, 0)])
    r = _se.simuler(d)
    coudes = r["discontinuites"]["coudes"]
    assert len(coudes) == 1, "le coude a angle droit n'a pas ete vu"
    proche(coudes[0]["angle_deg"], 90.0, 1e-6, "l'angle du coude")
    assert coudes[0]["modelise"]["capacite_fF"] > 0, \
        "le coude a angle droit ne pese rien"

    # UN PETIT COUDE RESTE UN COUDE : 5 degres, un dix-huitieme de l'angle
    # droit, doit etre emis avec sa part.
    import math as _m
    dx, dy = 15 * _m.cos(_m.radians(5)), 15 * _m.sin(_m.radians(5))
    d = _doc_via([_piste(0, 0, 15, 0, 0),
                  _piste(15, 0, 15 + dx, dy, 0)])
    r = _se.simuler(d)
    coudes = r["discontinuites"]["coudes"]
    assert len(coudes) == 1, "un coude de 5 degres a ete jete"
    proche(coudes[0]["angle_deg"], 5.0, 0.05, "l'angle du petit coude")


T("un changement de couche n'est pas un coude, un alignement non plus",
  un_changement_de_couche_n_est_pas_un_coude)


def un_via_n_est_pas_une_rupture():
    """L'AVERTISSEMENT QUI CRIAIT A TORT.

    `_ruptures` exigeait DEUX points de contact pour reconnaitre un via, en
    commentant « les deux bouts du via sont au meme XY ». Non : un via joint la
    FIN d'un troncon au DEBUT du suivant, ce qui fait UN point commun. Toute
    liaison changeant de couche etait donc declaree rompue.

    UN AVERTISSEMENT QUI CRIE A TORT FINIT PAR NE PLUS ETRE LU, et c'est ce qui
    rend ce defaut plus grave que son ampleur : le jour ou la selection est
    VRAIMENT rompue, personne ne le voit. On verifie donc les deux sens --
    qu'il se taise sur un via, et qu'il parle sur une vraie rupture.
    """
    def rupture_annoncee(objets):
        r = _se.simuler(_doc_via(objets))
        return any("parcours continu" in a for a in r["avertissements"])

    # Un via : parcours continu, aucun avertissement.
    assert not rupture_annoncee([_piste(0, 0, 15, 0, 0),
                                 _piste(15, 0, 30, 0, 6)]), \
        "un via est annonce comme une rupture"

    # Deux troncons qui ne se touchent pas, MEME couche : vraie rupture.
    assert rupture_annoncee([_piste(0, 0, 15, 0, 0),
                             _piste(20, 0, 30, 0, 0)]), \
        "une vraie rupture sur une couche n'est plus signalee"

    # Deux troncons qui ne se touchent pas, couches DIFFERENTES : vraie
    # rupture aussi -- il n'y a pas de via la ou rien ne se touche.
    assert rupture_annoncee([_piste(0, 0, 15, 0, 0),
                             _piste(20, 0, 30, 0, 6)]), \
        "une rupture entre deux couches n'est plus signalee"


T("un via n'est pas une rupture, et une vraie rupture le reste",
  un_via_n_est_pas_une_rupture)


def la_provenance_de_chaque_cote_est_dite():
    """UN CHIFFRE SUPPOSE AFFICHE COMME UN CHIFFRE MESURE EST PIRE QUE RIEN.

    Les pages n'envoient pas encore le percage et la pastille : le modele
    tourne sur des replis. Il le DIT, cote par cote -- et il doit cesser de le
    dire des que la page les envoie, sans quoi la mention perd son sens.
    """
    # Sans via envoye : hauteur exacte, percage et pastille supposes.
    r = _se.simuler(_doc_via([_piste(0, 0, 15, 0, 0),
                              _piste(15, 0, 30, 0, 6)]))
    t = r["discontinuites"]["transitions"][0]
    assert t["cotes_supposees"] is True, "les replis ne sont pas signales"
    assert t["cotes"]["hauteur_source"] == "empilage", t["cotes"]
    assert t["cotes"]["percage_source"] == "repli", t["cotes"]
    assert t["cotes"]["pastille_source"] == "repli", t["cotes"]
    proche(t["cotes"]["hauteur_mm"], _EPAISSEUR_CARTE, 1e-6,
           "la hauteur annoncee dans les cotes")

    # Avec le via envoye : plus rien de suppose, et les valeurs sont celles-la.
    via = {"drill_diameter": 0.25, "pad_diameter": 0.55}
    r = _se.simuler(_doc_via([_piste(0, 0, 15, 0, 0),
                              _piste(15, 0, 30, 0, 6, via=via)]))
    t = r["discontinuites"]["transitions"][0]
    assert t["cotes_supposees"] is False, \
        "la page a envoye les cotes et la fiche les dit encore supposees"
    assert t["cotes"]["percage_source"] == "page", t["cotes"]
    assert t["cotes"]["pastille_source"] == "page", t["cotes"]
    proche(t["cotes"]["percage_mm"], 0.25, 1e-9, "le percage envoye")
    proche(t["cotes"]["pastille_mm"], 0.55, 1e-9, "la pastille envoyee")


T("chaque cote de via dit d'ou elle vient", la_provenance_de_chaque_cote_est_dite)


def le_via_pese_ce_que_la_fiche_annonce():
    """CE QUI EST AFFICHE EST CE QUI EST APPLIQUE, et on le mesure.

    La fiche annonce une inductance et une capacite ; la cascade en applique.
    Si les deux divergent, la fiche ment -- c'est exactement le defaut qui
    avait ete trouve sur les coudes, ou 21,28 fF etaient affiches pour 0,394
    appliques. On refait donc le calcul a la main, avec les memes fonctions de
    `ligne_mom`, et on exige l'egalite.

    ET ON VERIFIE QUE LE VIA PESE : un percage plus fin donne PLUS
    d'inductance, ce qui est le sens physique -- moins de section, plus de
    self. Si le chiffre ne bougeait pas, c'est que les cotes n'arrivent pas
    jusqu'au modele.
    """
    via = {"drill_diameter": 0.25, "pad_diameter": 0.55}
    r = _se.simuler(_doc_via([_piste(0, 0, 15, 0, 0),
                              _piste(15, 0, 30, 0, 6, via=via)]))
    t = r["discontinuites"]["transitions"][0]
    m = t["modelise"]

    l_attendu = _tl.inductance_via(_EPAISSEUR_CARTE * 1e-3, 0.25e-3)
    proche(m["inductance_nH"], round(l_attendu * 1e9, 3), 1e-9,
           "l'inductance affichee contre celle de ligne_mom")

    # Un percage plus FIN : plus d'inductance.
    via_fin = {"drill_diameter": 0.15, "pad_diameter": 0.40}
    r2 = _se.simuler(_doc_via([_piste(0, 0, 15, 0, 0),
                               _piste(15, 0, 30, 0, 6, via=via_fin)]))
    m2 = r2["discontinuites"]["transitions"][0]["modelise"]
    assert m2["inductance_nH"] > m["inductance_nH"], (
        "un percage plus fin ne donne pas plus d'inductance (%.3f contre %.3f)"
        % (m2["inductance_nH"], m["inductance_nH"]))


T("le via pese ce que la fiche annonce, et les cotes le commandent",
  le_via_pese_ce_que_la_fiche_annonce)



print("\n" + "-" * 62)
print("  %d cas, %s" % (ok + ko, "tous passes" if not ko else "%d en echec" % ko))
sys.exit(1 if ko else 0)
