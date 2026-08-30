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

    # QUATRE DECIMALES, ET NON TROIS : une inductance de BOUCLE descend sous
    # 0,5 nH des que le via de retour est serre, et la troisieme decimale n'y
    # distingue plus deux placements a un dixieme de millimetre pres.
    #
    # ET C'EST LA SELF PARTIELLE, PAS `inductance_via`. Sans via de retour
    # envoye, la chaine rend la self partielle de Grover -- un PLANCHER -- et
    # non la regle de pouce des manuels, qui contient un retour implicite jamais
    # dit et vaut pres du double. C'est aussi ce que le chevelu de l'editeur
    # affiche : une seule formule pour une seule grandeur.
    l_attendu = _tl.inductance_partielle_propre(0.0, _EPAISSEUR_CARTE * 1e-3,
                                                0.125e-3)
    proche(m["inductance_nH"], round(l_attendu * 1e9, 4), 1e-9,
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



# -----------------------------------------------------------------------------
# LE CHEMIN DE RETOUR DU COURANT
# -----------------------------------------------------------------------------
# CE QUI ETAIT FAUX, ET DANS QUEL SENS. Un via etait chiffre par une inductance
# PARTIELLE PROPRE : celle d'un conducteur seul, sans dire par ou le courant
# revient. Deux cartes identiques a ceci pres que l'une a son via de masse a
# 0,4 mm et l'autre a 3 mm rendaient donc le MEME |S11|, alors qu'elles
# different d'un facteur deux sur l'inductance qui compte -- et que le
# placement de ce via est justement la decision que l'outil devrait eclairer.
#
# CE QUE CES CAS VERROUILLENT, dans l'ordre de ce qu'ils coutent :
#   · qu'une reference qui change SANS QU'AUCUN VIA NE LA REJOIGNE soit
#     detectee et NOMMEE -- c'est le defaut grave, et il flatte le resultat ;
#   · que l'inductance depende vraiment du placement, et dans le bon sens ;
#   · que TROIS vias de retour soient pris pour trois, et pas seulement le plus
#     proche ni comme trois selfs en parallele ;
#   · qu'un via qui ne referme pas la boucle soit ECARTE plutot que compte, un
#     retour borgne rendant une inductance TROP PETITE de 18 % ;
#   · que l'antipad et la distance reelle des pastilles a leur plan entrent
#     dans la capacite -- le facteur sept qui manquait.
# -----------------------------------------------------------------------------

_QUATRE_NETS = [
    dict(_cu("TOP", "signal")),
    _di("PP", 0.200, 4.20),
    dict(_cu("GND", "plane"), net="GND"),
    _di("CORE", 0.800, 4.50),
    dict(_cu("PWR", "plane"), net="PWR"),
    _di("PP2", 0.200, 4.20),
    dict(_cu("BOT", "signal")),
]
# Le meme empilage, mais dont les deux plans internes sont de la masse : c'est
# la seule difference entre une liaison qui se referme et une qui ne se referme
# pas, et elle est invisible sur le dessin.
_QUATRE_GND = [dict(c) for c in _QUATRE_NETS]
_QUATRE_GND[4] = dict(_cu("IN2", "plane"), net="GND")


def _retour_via(x, y, net="GND", lf=0, lt=6, percage=0.25):
    return {"x": x, "y": y, "layer_from": lf, "layer_to": lt,
            "drill_diameter": percage, "pad_diameter": 0.55, "net": net}


def _doc_retour(couches, retours, x_via=15.0, antipad=0.80):
    """Deux troncons, TOP puis BOT, avec le via et ses retours."""
    via = {"drill_diameter": 0.25, "pad_diameter": 0.55,
           "x": x_via, "y": 0.0, "antipad_diameter": antipad,
           "retours": list(retours)}
    d = _doc_via([_piste(0, 0, x_via, 0, 0),
                  _piste(x_via, 0, x_via + 15, 0, 6, via=via)],
                 couches=couches)
    d["reference_nets"] = ["GND"]
    return d


def _trans(couches, retours, **kw):
    r = _se.simuler(_doc_retour(couches, retours, **kw))
    return r, r["discontinuites"]["transitions"][0]


def la_reference_qui_change_sans_retour_est_nommee():
    """LE DEFAUT LE PLUS GRAVE EST CELUI QU'ON NE VOIT PAS SUR LE DESSIN.

    Sur TOP/GND/PWR/BOT, une piste sur TOP se refere a GND et la meme piste sur
    BOT se refere a PWR. Le courant de retour doit changer de plan -- et un via
    de masse ne peut pas l'y aider : il joindrait du GND a du GND. Le retour
    passe alors par la cavite entre plans, que ce modele ne represente pas.

    Le via de masse est bien la, a 0,6 mm, parfaitement place. Il ne sert a
    rien, et c'est CELA qu'il faut dire -- pas afficher une belle inductance de
    boucle qui ne decrit pas le circuit.
    """
    r, t = _trans(_QUATRE_NETS, [_retour_via(15.6, 0.0)])
    ret = t["retour"]
    assert ret["reference_change"], (
        "GND d'un cote, PWR de l'autre : la reference change et ce n'est pas vu")
    assert not ret["raccorde"], (
        "un via de masse a ete cru capable de joindre GND a PWR")
    assert ret["trouves"] == 1 and ret["retenus"] == 0, (
        "le via devait etre trouve puis ecarte, pas ignore")
    assert "PWR" in ret["vias"][0]["raison"], (
        "la raison de l'ecart ne nomme pas le plan qui n'est pas rejoint : « %s »"
        % ret["vias"][0]["raison"])
    assert t["modelise"]["inductance_source"].startswith("self"), (
        "sans boucle refermee, l'inductance du via doit etre celle d'un"
        " conducteur seul (source lue : %s)"
        % t["modelise"]["inductance_source"])
    assert any("de la masse à de la masse" in a for a in r["avertissements"]), (
        "le defaut grave n'est pas remonte en avertissement")


def la_meme_carte_avec_deux_plans_de_masse_se_referme():
    """LA MEME GEOMETRIE, ET UN EMPILAGE QUI CHANGE TOUT.

    Seul le net du plan interne differe. Le via de retour, lui, n'a pas bouge.
    C'est le cas ou l'avertissement NE DOIT PAS sortir : un avertissement qui
    crie sur le cas ordinaire cesse d'etre lu, et emporte avec lui celui qui
    comptait.
    """
    r, t = _trans(_QUATRE_GND, [_retour_via(15.6, 0.0)])
    ret = t["retour"]
    assert ret["raccorde"] and ret["retenus"] == 1, (
        "le via de masse joint deux plans de masse et n'a pas ete retenu")
    assert t["modelise"]["inductance_source"] == "boucle"
    assert not any("de la masse à de la masse" in a
                   for a in r["avertissements"]), (
        "l'avertissement grave est sorti sur une liaison saine")

    # ET LE CHIFFRE A CHANGE DE NATURE, CE QUI N'EST PAS LA MEME CHOSE QUE
    # D'AVOIR BAISSE. Sans boucle refermee on rend la self partielle : un
    # PLANCHER, la valeur qu'aurait la boucle si le retour etait colle au via.
    # La refermer a 0,6 mm rend forcement DAVANTAGE -- et c'est bien ce qu'on
    # exige ici, parce qu'un plancher qu'on pourrait passer par en dessous ne
    # serait pas un plancher. Ce qui a change, c'est que le chiffre depend
    # desormais du routage ; c'est l'essai suivant qui le mesure.
    _, t_sans = _trans(_QUATRE_NETS, [_retour_via(15.6, 0.0)])
    plancher = t_sans["modelise"]["inductance_nH"]
    boucle = t["modelise"]["inductance_nH"]
    assert boucle > plancher, (
        "la boucle refermee passe SOUS le plancher : %.4f contre %.4f nH"
        % (boucle, plancher))
    assert t_sans["modelise"]["inductance_source"].startswith("self")


def rapprocher_le_via_de_retour_baisse_l_inductance():
    """C'EST LA QUESTION QUE L'UTILISATEUR POSE EN CLIQUANT SUR LE VIA.

    « Faut-il le rapprocher ? » n'a de reponse que si le chiffre bouge quand on
    le rapproche. On mesure donc la monotonie sur toute la plage utile, et
    l'ampleur : 0,4 mm contre 3 mm, c'est un facteur deux.
    """
    vus = []
    for ecart in (0.4, 0.6, 1.0, 2.0, 3.0):
        _, t = _trans(_QUATRE_GND, [_retour_via(15.0 + ecart, 0.0)])
        vus.append(t["modelise"]["inductance_nH"])
    for a, b in zip(vus, vus[1:]):
        assert b > a, ("l'inductance ne croit pas avec l'ecartement : %s" % vus)
    assert vus[-1] > 1.9 * vus[0], (
        "eloigner le retour de 0,4 a 3 mm ne double pas l'inductance :"
        " %.4f contre %.4f nH" % (vus[-1], vus[0]))


def trois_vias_de_retour_comptent_pour_trois():
    """TROIS VIAS, ET NI UN NI TROIS SELFS EN PARALLELE.

    Ne garder que le plus proche SURESTIME -- on mesure 31 % sur ce cas. Les
    traiter comme trois inductances en parallele SOUS-estime d'autant : leur
    mutuelle les empeche de travailler independamment, et c'est pour cela qu'on
    resout la repartition au lieu de la postuler.
    """
    trois = [_retour_via(15.5, 0.0), _retour_via(14.4, 0.3),
             _retour_via(15.0, -0.7)]
    _, t3 = _trans(_QUATRE_GND, trois)
    _, t1 = _trans(_QUATRE_GND, [trois[0]])
    l3 = t3["modelise"]["inductance_nH"]
    l1 = t1["modelise"]["inductance_nH"]
    assert t3["retour"]["retenus"] == 3, "les trois n'ont pas ete retenus"
    assert l3 < l1, "trois retours ne valent pas mieux qu'un"
    assert l3 > l1 / 3.0, (
        "trois retours ont divise l'inductance par trois ou plus (%.4f contre"
        " %.4f) : la mutuelle entre eux n'est pas comptee" % (l3, l1))

    # LA REPARTITION EST RENDUE, ET ELLE SOMME A UN. C'est elle que le chevelu
    # affiche : elle dit lequel travaille vraiment.
    parts = [f["part"] for f in t3["retour"]["vias"] if f["retenu"]]
    proche(sum(parts), 1.0, 1e-6, "la somme des parts de courant de retour")
    ordre = sorted(t3["retour"]["vias"], key=lambda f: f["distance_mm"])
    assert ordre[0]["part"] > ordre[-1]["part"], (
        "le via le plus proche ne porte pas la plus grosse part")


def un_retour_qui_ne_referme_pas_est_ecarte():
    """UN RETOUR BORGNE REND UNE INDUCTANCE TROP PETITE, ET C'EST LE PIRE CAS.

    L'inductance de boucle n'est definie que pour un courant a divergence
    nulle. Un via de masse qui ne couvre que la moitie de la hauteur ne referme
    rien : le reste du chemin passe par le cuivre des plans, absent du modele.
    Nourrir la formule avec lui rend un nombre, et ce nombre est PLUS PETIT que
    la verite -- on mesure -18 %. On refuse donc, plutot que de flatter.
    """
    _, t = _trans(_QUATRE_GND, [_retour_via(15.6, 0.0, lf=0, lt=2)])
    ret = t["retour"]
    assert ret["retenus"] == 0, "un via borgne mi-hauteur a ete pris pour un retour"
    assert "couvre" in ret["vias"][0]["raison"], (
        "la raison ne dit pas que la hauteur n'est pas couverte : « %s »"
        % ret["vias"][0]["raison"])
    # Et la formule elle-meme refuse, meme si on la force.
    h = _EPAISSEUR_CARTE * 1e-3
    sig = {"x": 0.0, "y": 0.0, "z1": 0.0, "z2": h, "rayon": 1.25e-4}
    try:
        _tl.inductance_boucle_vias(
            sig, [{"x": 6e-4, "y": 0.0, "z1": 0.0, "z2": h / 2, "rayon": 1.25e-4}])
    except ValueError:
        pass
    else:
        raise AssertionError("inductance_boucle_vias accepte un courant ouvert")


def un_via_d_un_autre_signal_n_est_pas_un_retour():
    """UN VIA A COTE N'EST PAS UN VIA DE RETOUR. Seul le cuivre des nets de
    reference porte le courant de retour ; un via d'un autre signal, aussi
    proche soit-il, ne referme rien. C'est la meme regle que la masse
    coplanaire, et elle etait deja tombee une fois faute d'etre ecrite."""
    _, t = _trans(_QUATRE_GND, [_retour_via(15.4, 0.0, net="D+")])
    assert t["retour"]["retenus"] == 0, "un via de signal a servi de retour"
    assert "référence" in t["retour"]["vias"][0]["raison"], (
        "la raison ne dit pas que ce n'est pas une reference : « %s »"
        % t["retour"]["vias"][0]["raison"])


def la_page_qui_n_envoie_rien_le_dit():
    """L'ABSENCE D'INFORMATION N'EST PAS UN DEFAUT DE LA CARTE.

    Une page qui n'envoie pas les vias voisins n'est pas une carte sans vias de
    masse. Les deux donnent la meme inductance, et il faut pourtant les
    distinguer : dans un cas c'est le routage qu'on juge, dans l'autre l'outil.
    """
    via = {"drill_diameter": 0.25, "pad_diameter": 0.55}
    r = _se.simuler(_doc_via([_piste(0, 0, 15, 0, 0),
                              _piste(15, 0, 30, 0, 6, via=via)],
                             couches=_QUATRE_GND))
    ret = r["discontinuites"]["transitions"][0]["retour"]
    assert ret["source"] == "absent", (
        "une page muette est comptee comme une carte sans via de masse")
    assert any("ne sont pas envoyés" in a for a in r["avertissements"]), (
        "le silence de la page n'est pas dit")


def un_empilage_sans_net_de_plan_le_dit_aussi():
    """SANS LE NET DES PLANS, LE TEST QUI COMPTE NE PEUT PAS SE FAIRE.

    Distinguer un plan de masse d'un plan d'alimentation demande leur net.
    Refuser tous les retours rendrait la mesure impossible sur ces empilages ;
    les accepter en silence ferait passer le cas GND/PWR pour sain. On accepte,
    et `plans_incertains` le porte jusqu'a la fiche.
    """
    _, t = _trans(_QUATRE, [_retour_via(15.6, 0.0)])
    assert t["retour"]["plans_incertains"], (
        "un empilage sans net de plan ne se declare pas incertain")
    assert t["retour"]["retenus"] == 1, (
        "l'incertitude a fait refuser le via au lieu de l'accepter en le disant")


def l_antipad_et_les_pastilles_entrent_dans_la_capacite():
    """LE FACTEUR SEPT QUI MANQUAIT, ET LES ANTIPADS QUI MANQUAIENT TOUT COURT.

    Les deux pastilles d'extremite etaient comptees a la HAUTEUR DU VIA --
    1,34 mm -- alors qu'une pastille voit le plan qui lui fait face a 0,2 mm.
    Et les antipads, un par plan traverse, ne l'etaient pas du tout.
    """
    _, t = _trans(_QUATRE_GND, [_retour_via(15.6, 0.0)])
    cap = t["capacite"]
    ancien = _tl.capacite_pastille(0.55e-3, _EPAISSEUR_CARTE * 1e-3, 4.2) * 1e15
    assert cap["totale_fF"] > 10 * ancien, (
        "la capacite n'a pas change d'ordre : %.2f contre %.2f fF"
        % (cap["totale_fF"], ancien))
    assert cap["antipad_fF"] > 0, "aucun antipad compte sur un via traversant"
    assert len(cap["plans_traverses"]) == 2, (
        "un via TOP -> BOT traverse deux plans, pas %d"
        % len(cap["plans_traverses"]))
    # Un antipad plus SERRE donne PLUS de capacite : c'est le sens physique, et
    # c'est ce qui prouve que la cote arrive jusqu'au modele.
    _, t_serre = _trans(_QUATRE_GND, [_retour_via(15.6, 0.0)], antipad=0.60)
    assert t_serre["capacite"]["antipad_fF"] > cap["antipad_fF"], (
        "resserrer l'antipad n'augmente pas la capacite")
    assert t["cotes"]["antipad_source"] == "page"


def la_fiche_et_la_courbe_portent_le_meme_via():
    """CE QUI EST AFFICHE EST CE QUI EST APPLIQUE, et les deux paliers viennent
    justement d'ajouter des arguments au modele -- c'est le moment ou les deux
    chemins divergent, s'ils doivent diverger.

    On recalcule la cascade a la main a partir des SEULS chiffres de la fiche,
    et on exige la meme matrice S que celle rendue.
    """
    r, t = _trans(_QUATRE_GND, [_retour_via(15.6, 0.0)])
    m = t["modelise"]
    f = r["f_centre"]
    k = min(range(len(r["freqs"])), key=lambda i: abs(r["freqs"][i] - f))

    a = np.eye(2, dtype=complex)
    for i, seg in enumerate(r["segments"]):
        # TOUT EN METRES POUR ligne_mom, ET LE RESULTAT EST EN MILLIMETRES.
        # `seg["h"]` est la hauteur au plan en mm ; la passer telle quelle a
        # `dispersion_getsinger` donne un microruban mille fois trop haut, et
        # l'essai accuse alors le serveur.
        eps_f, z_f = _tl.dispersion_getsinger(seg["z0_statique"], seg["eps_eff"],
                                              seg["er"], seg["h"] * 1e-3, f)
        ac, ad = _tl.line_losses(z_f, eps_f, seg["largeur"] * 1e-3, seg["er"],
                                 seg["tan_delta"], f, seg["cuivre"] * 1e-3)
        beta = 2 * np.pi * f * np.sqrt(eps_f) / _tl.C_0
        # LA DISCONTINUITE PRECEDE LE TRONCON QU'ELLE ANNONCE : « troncon 1 »
        # veut dire « entre le 0 et le 1 », donc AVANT la ligne du 1.
        if i == t["troncon"]:
            a = a @ _tl.abcd_via_boucle(m["inductance_nH"] * 1e-9,
                                        m["capacite_fF"] * 1e-15, f)
        a = a @ _tl.abcd_line(z_f, complex(ac + ad, beta),
                              seg["longueur"] * 1e-3)
    s_main = _tl.cascade_to_s(a, r["impedance_reference"])
    s_rendu = complex(*r["s"][k][0])
    proche(abs(s_main[0, 0]), abs(s_rendu), 2e-3,
           "le |S11| refait depuis la fiche contre celui rendu")


T("une référence qui change sans retour est nommée",
  la_reference_qui_change_sans_retour_est_nommee)
T("la même carte avec deux plans de masse se referme",
  la_meme_carte_avec_deux_plans_de_masse_se_referme)
T("rapprocher le via de retour baisse l'inductance",
  rapprocher_le_via_de_retour_baisse_l_inductance)
T("trois vias de retour comptent pour trois",
  trois_vias_de_retour_comptent_pour_trois)
T("un retour qui ne referme pas la boucle est écarté",
  un_retour_qui_ne_referme_pas_est_ecarte)
T("un via d'un autre signal n'est pas un retour",
  un_via_d_un_autre_signal_n_est_pas_un_retour)
T("la page qui n'envoie rien le dit", la_page_qui_n_envoie_rien_le_dit)
T("un empilage sans net de plan le dit aussi",
  un_empilage_sans_net_de_plan_le_dit_aussi)
T("l'antipad et les pastilles entrent dans la capacité",
  l_antipad_et_les_pastilles_entrent_dans_la_capacite)
T("la fiche et la courbe portent le même via",
  la_fiche_et_la_courbe_portent_le_meme_via)

def la_discontinuite_se_pose_entre_les_deux_troncons():
    """« TRONCON 1 » VEUT DIRE « ENTRE LE 0 ET LE 1 », ET NON « APRES LE 1 ».

    La cascade posait la ligne du troncon d'arrivee PUIS la discontinuite :
    chacune se retrouvait decalee d'un troncon vers la sortie, et la derniere
    sortait du parcours -- sur une liaison a trois troncons et deux vias, le
    second via tombait AU-DELA DU PORT 2.

    POURQUOI IL FAUT TROIS TRONCONS POUR LE VOIR. Sur deux troncons de meme
    impedance, les deux ordres donnent exactement le meme |S11| : une ligne
    uniforme et un reseau en pi sont tous deux symetriques. C'est pour cela que
    le defaut a survecu aux essais a deux troncons, et c'est pour cela que
    celui-ci en prend trois, d'impedances differentes.
    """
    via = {"drill_diameter": 0.25, "pad_diameter": 0.55}
    r = _se.simuler(_doc_via([_piste(0, 0, 10, 0, 0, largeur=0.35),
                              _piste(10, 0, 22, 0, 6, largeur=0.80, via=via),
                              _piste(22, 0, 32, 0, 0, largeur=0.35, via=via)],
                             couches=_QUATRE_GND, fc=3e9))
    trans = r["discontinuites"]["transitions"]
    assert len(trans) == 2, "deux changements de couche attendus"
    f = r["f_centre"]
    k = min(range(len(r["freqs"])), key=lambda i: abs(r["freqs"][i] - f))

    def cascade(avant):
        a = np.eye(2, dtype=complex)
        rangs = {t["troncon"]: t for t in trans}
        for i, seg in enumerate(r["segments"]):
            eps_f, z_f = _tl.dispersion_getsinger(
                seg["z0_statique"], seg["eps_eff"], seg["er"],
                seg["h"] * 1e-3, f)
            ac, ad = _tl.line_losses(z_f, eps_f, seg["largeur"] * 1e-3,
                                     seg["er"], seg["tan_delta"], f,
                                     seg["cuivre"] * 1e-3)
            beta = 2 * np.pi * f * np.sqrt(eps_f) / _tl.C_0
            ligne = _tl.abcd_line(z_f, complex(ac + ad, beta),
                                  seg["longueur"] * 1e-3)
            v = None
            if i in rangs:
                m = rangs[i]["modelise"]
                v = _tl.abcd_via_boucle(m["inductance_nH"] * 1e-9,
                                        m["capacite_fF"] * 1e-15, f)
            if avant and v is not None:
                a = a @ v
            a = a @ ligne
            if not avant and v is not None:
                a = a @ v
        return _tl.cascade_to_s(a, r["impedance_reference"])

    rendu = complex(*r["s"][k][0])
    juste = cascade(True)[0, 0]
    faux = cascade(False)[0, 0]
    # LES DEUX ORDRES DOIVENT DIFFERER, sans quoi l'essai ne prouve rien.
    assert abs(abs(juste) - abs(faux)) > 1e-3, (
        "les deux ordres donnent le meme |S11| : ce cas ne teste rien")
    proche(abs(rendu), abs(juste), 2e-3,
           "le |S11| rendu contre la cascade ou le via precede son troncon")
    assert abs(abs(rendu) - abs(faux)) > abs(abs(rendu) - abs(juste)), (
        "le resultat rendu colle a l'ordre FAUX")


T("la discontinuité se pose entre les deux tronçons",
  la_discontinuite_se_pose_entre_les_deux_troncons)



# -----------------------------------------------------------------------------
# LE MOIGNON, LA CAVITE, ET LA CERTITUDE DU VERDICT
# -----------------------------------------------------------------------------
# TROIS CHOSES QUE LA FICHE ANNONCAIT COMME ABSENTES OU FAUSSES :
#
#   · LE MOIGNON. Un via traversant qui ne sert que jusqu'a une couche interne
#     laisse pendre le reste du percage. 1 mm de moignon vaut 206 fF -- deux
#     fois et demie la capacite du via -- et court-circuite la liaison a sa
#     resonance quart d'onde. Rien sur le dessin ne le montre.
#   · LA CAVITE. Un retour qui change de plan de reference passe par un
#     decouplage, et cela coute. On le chiffre au lieu de dire « ne faites pas
#     cela ».
#   · LA CERTITUDE. Deux plans de NOMS differents ne sont pas deux plans de
#     NETS differents. La premiere version confondait les deux et criait au
#     defaut grave sur toute carte quatre couches dont l'empilage ne nomme pas
#     ses nets -- c'est-a-dire sur presque toutes.
# -----------------------------------------------------------------------------

# Six couches : de quoi router en interne, donc de quoi laisser un moignon.
_SIX = [
    _cu("TOP", "signal"),
    _di("PP1", 0.150, 4.30),
    dict(_cu("GND", "plane"), net="GND"),
    _di("C1", 0.400, 4.30),
    _cu("IN3", "signal"),
    _di("C2", 0.400, 4.30),
    dict(_cu("GND2", "plane"), net="GND"),
    _di("PP2", 0.150, 4.30),
    _cu("BOT", "signal"),
]
# Quatre couches, deux plans de nets DIFFERENTS : le cas ou le retour change.
_GND_PWR = [dict(c) for c in _QUATRE_NETS]
# Le meme, mais sans aucun net declare : le cas de la carte de l'utilisateur.
_SANS_NETS = [dict(c) for c in _QUATRE]


def _doc_moignon(couches, dep, arr, via, fc=3e9, fmax=20e9):
    d = _doc_via([_piste(0, 0, 10, 0, dep, largeur=0.15),
                  _piste(10, 0, 20, 0, arr, largeur=0.15, via=via)],
                 couches=couches, fc=fc)
    d["analyse"] = {"f_debut": 0.1e9, "f_fin": fmax, "f_centre": fc,
                    "points": 21}
    d["reference_nets"] = ["GND"]
    return d


def _via_moignon(lf=None, lt=None, ponts=None, retours=(), rayon=None):
    v = {"drill_diameter": 0.25, "pad_diameter": 0.55,
         "antipad_diameter": 0.80, "x": 10.0, "y": 0.0,
         "retours": list(retours)}
    if lf is not None:
        v["layer_from"], v["layer_to"] = lf, lt
    if ponts is not None:
        v["ponts"] = ponts
    if rayon is not None:
        v["ponts_rayon_mm"] = rayon
    return v


def le_moignon_se_soustrait_il_ne_se_devine_pas():
    """LA LONGUEUR EST CE QU'ON PERCE MOINS CE QU'ON EMPRUNTE.

    Le via est perce de TOP a BOT ; le signal ne va que de TOP a IN3. Ce qui
    depasse pend en circuit ouvert. La somme des morceaux doit rendre EXACTEMENT
    la longueur percee -- c'est ce qui prouve qu'on prend les bonnes bornes, et
    non les dessus de couche, qui feraient manquer une epaisseur de cuivre a
    chaque bout.
    """
    r = _se.simuler(_doc_moignon(_SIX, 0, 4, _via_moignon(0, 8)))
    t = r["discontinuites"]["transitions"][0]
    mo = t["moignons"]
    assert mo["connu"], "la portee est envoyee, le moignon devrait etre connu"
    assert mo["depart"] is None, (
        "le signal part de TOP, qui est le bout du percage : rien ne depasse"
        " de ce cote")
    assert mo["arrivee"] is not None, "le moignon sous IN3 n'est pas vu"

    perce = _se._hauteur_via(_SIX, 0, 8)
    utile = t["cotes"]["hauteur_mm"]
    proche(mo["arrivee"]["longueur_mm"], perce - utile, 1e-9,
           "moignon = perce - emprunte")


def le_moignon_pese_et_resonne():
    """DEUX CHIFFRES, ET LE SECOND EST CELUI QUI DECIDE.

    Une capacite en femtofarads ne dit pas si le moignon est un probleme ; la
    frequence a laquelle il court-circuite la liaison, si.
    """
    r = _se.simuler(_doc_moignon(_SIX, 0, 4, _via_moignon(0, 8)))
    t = r["discontinuites"]["transitions"][0]
    f = t["moignons"]["arrivee"]
    m = t["modelise"]

    # LA RESONANCE EST CELLE DU QUART D'ONDE, et on la refait a la main.
    attendu = _tl.C_0 / (4.0 * f["longueur_mm"] * 1e-3 * np.sqrt(f["er"]))
    proche(f["resonance_hz"], attendu, 1e-6, "la resonance quart d'onde")

    # ET IL PESE PLUS QUE LE VIA. C'est le chiffre qui justifie tout le palier.
    assert f["capacite_fF"] > m["capacite_fF"], (
        "le moignon (%.1f fF) devrait peser plus que le via (%.1f fF)"
        % (f["capacite_fF"], m["capacite_fF"]))
    # LA TOLERANCE EST CELLE DE L'AFFICHAGE, pas celle du calcul : les trois
    # chiffres sont arrondis separement avant d'arriver ici, et leur somme ne
    # peut pas retomber au bit pres. Un millieme de femtofarad d'ecart dit que
    # c'est bien la meme grandeur ; exiger mieux ne testerait que l'arrondi.
    proche(m["capacite_totale_fF"], m["capacite_fF"] + f["capacite_fF"], 1e-4,
           "la capacite totale est celle du via plus celle du moignon")

    # LE MEME LIEN AVEC UN VIA ENTERRE AJUSTE N'A PAS DE MOIGNON, et la phase
    # tombe. C'est la seule difference entre les deux cartes.
    r2 = _se.simuler(_doc_moignon(_SIX, 0, 4, _via_moignon(0, 4)))
    m2 = r2["discontinuites"]["transitions"][0]["modelise"]
    assert r2["discontinuites"]["transitions"][0]["moignons"]["arrivee"] is None
    assert m2["phase_deg"] < 0.7 * m["phase_deg"], (
        "supprimer le moignon ne change presque rien : %.3f contre %.3f deg"
        % (m2["phase_deg"], m["phase_deg"]))


def le_moignon_court_circuite_a_sa_resonance():
    """A LA RESONANCE, LE MOIGNON EFFACE LA LIAISON, et le modele doit le
    rendre -- c'est le seul defaut de cette fiche qui tue un lien au lieu de le
    degrader. On balaye la bande autour de la resonance et on exige un creux
    profond, et fini : une constante de propagation purement imaginaire
    donnerait l'infini, ce qui n'est pas un resultat mais une division par
    zero. La perte du dielectrique borne le creux."""
    via = _via_moignon(0, 8)
    r0 = _se.simuler(_doc_moignon(_SIX, 0, 4, via, fc=1e9, fmax=2e9))
    f_res = r0["discontinuites"]["transitions"][0]["moignons"]["arrivee"][
        "resonance_hz"]
    d = _doc_moignon(_SIX, 0, 4, via, fc=f_res, fmax=f_res * 1.4)
    d["analyse"]["f_debut"] = f_res * 0.6
    d["analyse"]["points"] = 81
    r = _se.simuler(d)

    pire = min(20 * np.log10(max(abs(complex(*m[2])), 1e-15)) for m in r["s"])
    assert pire < -20.0, (
        "le moignon ne court-circuite pas a sa resonance : creux de %.1f dB"
        % pire)
    assert np.isfinite(pire), "la resonance a diverge"


def la_portee_inconnue_ne_vaut_pas_moignon_nul():
    """UNE PAGE QUI NE DIT PAS N'EST PAS UNE CARTE QUI N'A PAS.

    Sans la portee percee, un via traversant et un via enterre bien ajuste ont
    exactement la meme apparence. Conclure « pas de moignon » serait le cas le
    plus flatteur choisi par defaut.
    """
    r = _se.simuler(_doc_moignon(_SIX, 0, 4, _via_moignon()))
    t = r["discontinuites"]["transitions"][0]
    assert not t["moignons"]["connu"]
    assert any("portée percée" in a for a in r["avertissements"]), (
        "le silence de la page sur la portee n'est pas dit")


def la_cavite_chiffre_ce_qui_etait_un_conseil():
    """LE RETOUR QUI CHANGE DE PLAN A UN PRIX, ET ON PEUT LE DIRE.

    Jusqu'ici la fiche rendait un plancher et disait « ne changez pas de
    reference ». Avec le decouplage qui joint les deux plans, on chiffre : la
    boucle passe par lui, et son eloignement se paie.
    """
    proche_pont = _via_moignon(0, 6, ponts=[{"x": 12.0, "y": 0.0,
                                             "repere": "C1"}], rayon=10.0)
    loin = _via_moignon(0, 6, ponts=[{"x": 20.0, "y": 0.0,
                                      "repere": "C2"}], rayon=10.0)
    a = _se.simuler(_doc_moignon(_GND_PWR, 0, 6, proche_pont))
    b = _se.simuler(_doc_moignon(_GND_PWR, 0, 6, loin))
    ta = a["discontinuites"]["transitions"][0]
    tb = b["discontinuites"]["transitions"][0]

    # CE N'EST PLUS UNE INDUCTANCE, ET C'EST TOUT LE POINT. La capacite
    # repartie des plans et l'inductance du decouplage forment une resonance
    # PARALLELE -- la « PRF » du chapitre 13 de Bogatin --, ou l'impedance de
    # la traversee CULMINE. Une inductance equivalente figee au point central
    # manquerait exactement ce qu'on veut voir. On compare donc des ohms.
    assert ta["cavite"]["impedance_fc_ohm"] is not None, (
        "la traversee n'est pas chiffree")
    assert "cavite" in ta["modelise"]["inductance_source"], (
        "la traversee n'est pas signalee dans la source")
    assert tb["cavite"]["impedance_fc_ohm"] > ta["cavite"]["impedance_fc_ohm"], (
        "eloigner le decouplage ne coute rien : %.4f contre %.4f ohm"
        % (tb["cavite"]["impedance_fc_ohm"], ta["cavite"]["impedance_fc_ohm"]))
    # L'ETALEMENT SUIT L'EQUATION 13-35 DE BOGATIN, refaite a la main.
    h = ta["cavite"]["hauteur_mm"] * 1e-3
    attendu = _tl.inductance_etalement_via_via(h, 2.0e-3, 0.25e-3)
    # La tolerance est celle de l'AFFICHAGE : la fiche arrondit au dix
    # millieme de nanohenry, et exiger mieux ne testerait que l'arrondi.
    proche(ta["cavite"]["etalement_nH"], attendu * 1e9, 1e-4,
           "l'etalement contre l'equation 13-35")
    # ET IL EST TROIS FOIS PLUS GRAND QUE CE QUE DONNAIT 13-31, l'equation du
    # via vers un anneau, employee a tort par la version precedente.
    anneau = _tl.inductance_etalement_via_anneau(h, 0.125e-3, 2.0e-3)
    assert attendu > 2.5 * anneau, (
        "l'equation des deux contacts devrait valoir bien plus que celle de"
        " l'anneau : %.4f contre %.4f nH" % (attendu * 1e9, anneau * 1e9))


def la_cavite_ne_se_traverse_pas_entre_deux_masses():
    """ENTRE DEUX PLANS DE MASSE, LE RETOUR N'A RIEN A TRAVERSER.

    Il passe par le premier via de masse venu, ce dont la boucle du palier 1
    rend deja compte. Y ajouter une cavite compterait deux fois le meme chemin
    -- et sur une carte bien cousue cela vaut le double du via lui-meme.
    """
    v = _via_moignon(0, 8, ponts=[{"x": 11.0, "y": 0.0}], rayon=10.0,
                     retours=[_retour_via(10.6, 0.0, lt=8)])
    r = _se.simuler(_doc_moignon(_SIX, 0, 8, v))
    t = r["discontinuites"]["transitions"][0]
    assert t.get("cavite") is None, (
        "une cavite a ete comptee entre deux plans de MASSE")
    assert t["modelise"]["inductance_source"] == "boucle"


def deux_noms_de_plan_ne_font_pas_deux_nets():
    """LE DEFAUT QUI CRIAIT SUR LES CARTES SAINES.

    Sur une carte quatre couches, une piste sur TOP se refere au plan du haut
    et la meme piste sur BOT au plan du bas : les NOMS different TOUJOURS. La
    premiere version en concluait au defaut grave -- « aucun via de masse ne
    joint les deux » -- y compris quand les deux plans sont de la masse et
    qu'un via de masse les joint parfaitement.
    """
    # Deux plans de MASSE : le plan change, ce n'est pas grave.
    r = _se.simuler(_doc_moignon(
        _SIX, 0, 8, _via_moignon(0, 8, retours=[_retour_via(10.6, 0.0, lt=8)])))
    ret = r["discontinuites"]["transitions"][0]["retour"]
    assert ret["plan_change"], "le plan change bel et bien"
    assert ret["nets_differents"] is False, (
        "deux plans de net GND ne sont pas de nets differents")
    assert not ret["reference_change"], (
        "le defaut grave a ete leve sur deux plans de masse")
    assert not any("de la masse à de la masse" in a
                   for a in r["avertissements"])

    # Deux plans de NETS differents : la, c'est grave.
    r2 = _se.simuler(_doc_moignon(_GND_PWR, 0, 6, _via_moignon(0, 6)))
    ret2 = r2["discontinuites"]["transitions"][0]["retour"]
    assert ret2["nets_differents"] is True
    assert ret2["reference_change"]


def sans_net_de_plan_on_ne_conclut_pas():
    """ON NE SAIT PAS, ET ON LE DIT -- c'est le troisieme etat.

    Sans le net des plans, « deux plans de masse » et « masse et alimentation »
    se ressemblent exactement. Trancher dans un sens crie a tort sur les cartes
    saines ; trancher dans l'autre tait un vrai defaut. On rend le doute.
    """
    r = _se.simuler(_doc_moignon(
        _SANS_NETS, 0, 6,
        _via_moignon(0, 6, retours=[_retour_via(10.6, 0.0)])))
    ret = r["discontinuites"]["transitions"][0]["retour"]
    assert ret["plan_change"], "le plan change"
    assert ret["nets_differents"] is None, (
        "sans net declare, on ne peut pas conclure -- ni oui ni non")
    assert not ret["reference_change"], (
        "le defaut grave exige la certitude")
    assert any("on ne peut pas dire si cela pose problème" in a
               for a in r["avertissements"]), (
        "le doute n'est pas remonte a l'utilisateur")
    assert not any("de la masse à de la masse" in a
                   for a in r["avertissements"]), (
        "l'alerte grave est sortie sans preuve")


def une_deduction_et_une_observation_ne_se_disent_pas_pareil():
    """CE QU'ON PEUT DIRE SANS AVOIR CHERCHE, ET CE QU'ON NE PEUT PAS.

    « Aucun via de masse ne peut joindre GND a PWR » est une DEDUCTION : elle
    decoule des nets et reste vraie qu'on ait regarde ou non. « Aucun
    decouplage n'est a cote » est une OBSERVATION : sans avoir cherche,
    l'affirmer est un enonce sur la carte sans preuve. La premiere version les
    disait d'un seul souffle, et affirmait donc la seconde sans jamais l'avoir
    verifiee.
    """
    # La page ne cherche pas les ponts : `ponts` absent.
    v = _via_moignon(0, 6)
    r = _se.simuler(_doc_moignon(_GND_PWR, 0, 6, v))
    a = " ".join(r["avertissements"])
    assert "de la masse à de la masse" in a, (
        "la deduction sur les vias de masse doit sortir : elle ne demande pas"
        " qu'on ait cherche")
    assert "ne cherche pas les découplages" in a, (
        "l'outil doit avouer qu'il n'a pas regarde les découplages")
    assert "SOUS-ESTIMÉE" in a, (
        "sans les decouplages, la traversee est minoree et il faut le dire")
    assert "MINORANT" not in a, (
        "on ne peut pas parler de minorant a un rayon qu'on n'a pas cherche")

    # La page cherche et ne trouve rien : le pont est AU MOINS au rayon.
    v2 = _via_moignon(0, 6, ponts=[], rayon=10.0)
    r2 = _se.simuler(_doc_moignon(_GND_PWR, 0, 6, v2))
    a2 = " ".join(r2["avertissements"])
    assert "MINORANT" in a2, (
        "la recherche a eu lieu et n'a rien trouve : le chiffre est un minorant")
    t2 = r2["discontinuites"]["transitions"][0]
    assert t2["cavite"]["borne"], "le cas borne n'est pas marque"
    # ET IL COUTE PLUS QUE LE PONT MESURE A 2 mm : c'est la monotonie qui rend
    # le minorant utilisable.
    v3 = _via_moignon(0, 6, ponts=[{"x": 12.0, "y": 0.0}], rayon=10.0)
    t3 = _se.simuler(_doc_moignon(_GND_PWR, 0, 6, v3))[
        "discontinuites"]["transitions"][0]
    assert (t2["cavite"]["impedance_fc_ohm"]
            > t3["cavite"]["impedance_fc_ohm"]), (
        "un decouplage suppose a 10 mm devrait couter plus qu'un mesure a 2")


T("le moignon se soustrait, il ne se devine pas",
  le_moignon_se_soustrait_il_ne_se_devine_pas)
T("le moignon pèse et résonne", le_moignon_pese_et_resonne)
T("le moignon court-circuite à sa résonance, sans diverger",
  le_moignon_court_circuite_a_sa_resonance)
T("une portée inconnue ne vaut pas moignon nul",
  la_portee_inconnue_ne_vaut_pas_moignon_nul)
def les_formules_de_cavite_rendent_les_exemples_du_livre():
    """LES FORMULES SONT CITEES, DONC ELLES SE VERIFIENT SUR LA SOURCE.

    Eric Bogatin, « Signal and Power Integrity -- Simplified », 2e ed. :

      · eq. 13-31, exemple p. 658 -- rayon interieur 5 mil, exterieur 1 pouce,
        10 mil entre plans : le livre annonce 270 pH ;
      · eq. 7-18 p. 247 -- l'impedance d'une paire de plans large ;
      · eq. 13-35 p. 659 -- deux contacts de via, le cas qui nous occupe.

    UN CHIFFRE RECOPIE D'UN LIVRE SANS ETRE REFAIT EST UN CHIFFRE QU'ON CROIT.
    Celui-ci est refait.
    """
    l = _tl.inductance_etalement_via_anneau(10 * 25.4e-6,
                                            0.005 * 0.0254, 1.0 * 0.0254)
    proche(l * 1e12, 270.0, 5e-3, "l'exemple de l'equation 13-31")

    # L'equation 13-31 EST mu0/(2 pi) : le 5,1 pH/mil du livre n'est qu'un
    # changement d'unites, et le verifier interdit de le prendre pour un
    # coefficient ajuste.
    h, a, b = 1e-3, 1.25e-4, 5e-3
    exact = (_tl.MU_0 * h / (2 * np.pi)) * np.log(b / a)
    proche(_tl.inductance_etalement_via_anneau(h, a, b), exact, 1e-12,
           "13-31 contre mu0/(2 pi)")

    # L'equation 13-35, elle, est EMPIRIQUE et son COEFFICIENT vaut environ
    # quatre fois celui de 13-31 : deux constrictions au lieu d'une, dans les
    # deux plans.
    #
    # ON COMPARE LES COEFFICIENTS, ET NON LES VALEURS. Les deux formules ne
    # prennent pas le meme argument : 13-31 le RAYON du via, 13-35 son
    # DIAMETRE. Sur une geometrie donnee le rapport des valeurs vaut donc 3,4
    # et non 4,1 -- l'ecart est dans les logarithmes, pas dans la physique, et
    # comparer les valeurs testerait ce choix d'argument plutot que le fond.
    rapport = _tl.COEFF_ETALEMENT_VIA_VIA / (_tl.MU_0 / (2 * np.pi))
    assert 3.9 < rapport < 4.4, (
        "le coefficient de 13-35 vaut %.2f fois celui de 13-31, attendu 4,1"
        % rapport)
    # Et sur une geometrie reelle, elle rend bien plus du triple.
    v = _tl.inductance_etalement_via_via(h, b, 2 * a)
    assert v > 3.0 * exact, (
        "13-35 devrait valoir plus du triple de 13-31 ici : %.4f contre %.4f nH"
        % (v * 1e9, exact * 1e9))

    # L'impedance d'une paire de plans : quelques ohms, et elle suit h/w.
    z = _tl.impedance_paire_plans(1e-3, 50e-3, 4.3)
    proche(z, (377.0 / np.sqrt(4.3)) * 1e-3 / 50e-3, 1e-12,
           "l'equation 7-18")
    proche(_tl.impedance_paire_plans(0.5e-3, 50e-3, 4.3), z / 2.0, 1e-12,
           "Z0 de la paire de plans est lineaire en l'ecartement")


def la_traversee_ne_diverge_ni_en_bas_ni_en_haut():
    """LA CAVITE SEULE DONNE 1,7 kOHM A 1 MHz, ET C'EST LE PIEGE.

    C'est exact pour une carte qui n'aurait AUCUN decouplage nulle part, et
    absurde pour une carte reelle dont le decouplage est simplement plus loin
    que le rayon cherche. Avec un pont -- mesure ou suppose au rayon -- la
    branche capacitive du condensateur prend le relais en basse frequence et
    l'impedance reste raisonnable.
    """
    l_cav, c_pp = 1.06e-9, 95e-12
    l_pont, c_pont = 2.72e-9, 100e-9
    for f in (1e5, 1e6, 1e7, 1e8, 1e9, 1e10):
        z_seul = _tl.impedance_traversee_plans(f, l_cav, c_pp)
        z_pont = _tl.impedance_traversee_plans(f, l_cav, c_pp,
                                               l_pont=l_pont, esr_pont=0.03,
                                               c_pont=c_pont)
        assert np.isfinite(abs(z_seul)) and np.isfinite(abs(z_pont)), (
            "l'impedance de traversee diverge a %.0e Hz" % f)
        assert abs(z_pont) < abs(z_seul), (
            "a %.0e Hz, ajouter un decouplage n'ameliore pas la traversee :"
            " %.3f contre %.3f ohm" % (f, abs(z_pont), abs(z_seul)))
    # ET EN BASSE FREQUENCE, LE PONT DOIT DOMINER LARGEMENT : c'est tout
    # l'interet du decouplage.
    z1 = _tl.impedance_traversee_plans(1e6, l_cav, c_pp, l_pont=l_pont,
                                       esr_pont=0.03, c_pont=c_pont)
    assert abs(z1) < 5.0, (
        "un decouplage devrait tenir la traversee sous quelques ohms a 1 MHz,"
        " et elle vaut %.1f" % abs(z1))


T("les formules de cavité rendent les exemples du livre",
  les_formules_de_cavite_rendent_les_exemples_du_livre)
T("la traversée ne diverge ni en bas ni en haut",
  la_traversee_ne_diverge_ni_en_bas_ni_en_haut)

T("la cavité chiffre ce qui n'était qu'un conseil",
  la_cavite_chiffre_ce_qui_etait_un_conseil)
T("la cavité ne se traverse pas entre deux masses",
  la_cavite_ne_se_traverse_pas_entre_deux_masses)
T("deux noms de plan ne font pas deux nets",
  deux_noms_de_plan_ne_font_pas_deux_nets)
T("sans net de plan, on ne conclut pas", sans_net_de_plan_on_ne_conclut_pas)
T("une déduction et une observation ne se disent pas pareil",
  une_deduction_et_une_observation_ne_se_disent_pas_pareil)


def la_fiche_du_retour_dit_ou_est_le_via():
    """DE QUOI TRACER LE CHEVELU, ET D'UNE SEULE SOURCE.

    La fiche disait deja quels vias de masse entourent un via de signal, a
    quelle distance, lesquels sont retenus et quelle part chacun porte. Il y
    manquait l'ORIGINE des traits : la position du via lui-meme. Sans elle une
    page qui veut dessiner ce que le modele a retenu doit retrouver le point
    par un autre chemin -- et deux chemins pour une meme grandeur finissent
    toujours par en donner deux valeurs, le dessin d'un cote et la fiche de
    l'autre.
    """
    v = _via_moignon(0, 6, retours=[{"x": 10.6, "y": 0.0, "net": "GND",
                                     "layer_from": 0, "layer_to": 6,
                                     "drill_diameter": 0.25}])
    r = _se.simuler(_doc_moignon(_QUATRE_GND, 0, 6, v))
    ret = r["discontinuites"]["transitions"][0]["retour"]
    proche(ret["x"], 10.0, 1e-9, "l'abscisse du via de signal")
    # `proche` compare en RELATIF : une valeur attendue nulle y divise par
    # zero. L'ordonnee se compare donc en absolu, ce qui est de toute facon
    # ce qu'on veut dire ici -- un point, pas un rapport.
    assert abs(ret["y"]) < 1e-9, "l'ordonnee du via de signal : %r" % ret["y"]
    # ET C'EST LE MEME REPERE QUE CELUI DES VIAS DE RETOUR : le trait va de
    # l'un a l'autre, il faut donc que les deux bouts soient dans la meme
    # unite et la meme origine.
    proche(ret["vias"][0]["x"], 10.6, 1e-9, "l'abscisse du via de retour")
    proche(((ret["vias"][0]["x"] - ret["x"]) ** 2
            + (ret["vias"][0]["y"] - ret["y"]) ** 2) ** 0.5,
           ret["vias"][0]["distance_mm"], 1e-6,
           "la distance annoncee contre celle des deux points")


def sans_position_la_fiche_ne_l_invente_pas():
    """ON N'INVENTE PAS UN POINT QU'ON N'A PAS.

    Une page qui envoie des vias de masse sans dire ou est le via de signal ne
    peut pas se voir dessiner un chevelu : poser l'origine au raccord serait
    affirmer une position que l'outil ne connait pas. La cle doit donc etre
    ABSENTE, et non valoir zero -- un zero se dessine, lui.
    """
    v = _via_moignon(0, 6, retours=[{"x": 10.6, "y": 0.0, "net": "GND",
                                     "layer_from": 0, "layer_to": 6}])
    del v["x"]
    del v["y"]
    r = _se.simuler(_doc_moignon(_QUATRE_GND, 0, 6, v))
    ret = r["discontinuites"]["transitions"][0]["retour"]
    assert "x" not in ret and "y" not in ret, (
        "la position est inventee alors que la page ne l'envoie pas")


# ==========================================================================
# LES VIAS QUE LA CHAINE N'A PAS VUS
# --------------------------------------------------------------------------
# UN VIA N'EXISTAIT QUE DANS UN PARCOURS, et c'etait le defaut. `_transitions`
# detecte les changements de couche LE LONG DE LA CHAINE : tout ce qui
# concerne un via -- ses cotes, son inductance de boucle, les vias de masse qui
# la referment, le chevelu -- pendait a cette detection. Sur un net qui se
# ramifie -- un bus qui dessert trois boitiers, releve sur une vraie carte --
# il n'y a pas de parcours unique, donc pas de transition, donc AUCUN chemin de
# retour, alors que le via est la avec ses coordonnees et son percage.
#
# Le retour d'un via ne doit rien a l'ordre des troncons : il est a un endroit
# fixe, joint deux couches connues, et a des vias de masse autour de lui.
# ==========================================================================

def _doc_vias_seuls(couches, vias, couche=0):
    """Une seule piste -- donc aucune transition -- et des vias a part."""
    d = _doc_via([_piste(0, 0, 10, 0, couche)], couches=couches)
    d["reference_nets"] = ["GND"]
    d["vias"] = list(vias)
    return d


def un_via_hors_chaine_a_quand_meme_un_retour():
    """LE CAS QUI MOTIVE TOUT LE LOT.

    Aucune transition -- la selection ne change pas de couche --, et pourtant
    un via avec ses retours. Avant, le resultat etait muet.
    """
    v = {"x": 10.0, "y": 0.0, "layer_from": 0, "layer_to": 6,
         "drill_diameter": 0.25, "pad_diameter": 0.55,
         "retours": [_retour_via(10.6, 0.0)]}
    r = _se.simuler(_doc_vias_seuls(_QUATRE_GND, [v]))
    assert not r["discontinuites"]["transitions"], (
        "la selection ne change pas de couche : il ne doit y avoir aucune"
        " transition")
    seuls = r["discontinuites"]["vias_hors_chaine"]
    assert len(seuls) == 1, "%d via(s) hors chaine au lieu de 1" % len(seuls)
    f = seuls[0]
    ret = f["retour"]
    assert ret["retenus"] == 1, (
        "le via de masse ne referme pas la boucle : %s" % ret.get("raison"))
    assert f["modelise"]["inductance_source"] == "boucle", (
        "l'inductance rendue est un plancher alors qu'un retour la referme")
    # LA POSITION EST CE QUI PERMET DE DESSINER LE CHEVELU. Sans elle, la page
    # n'a qu'un chiffre et rien a montrer.
    assert abs(ret["x"] - 10.0) < 1e-9 and abs(ret["y"]) < 1e-9, (
        "la position du via n'est pas rendue : %s" % ret)
    assert f["cascade"] is False, (
        "un via hors parcours ne doit pas se donner pour cascade")


def la_hauteur_vient_de_l_empilage_sans_troncon():
    """PAS DE TRONCON, MAIS UN EMPILAGE -- et c'est lui qui porte la hauteur.

    Le via va de la couche 0 a la couche 6 : sa longueur percee est celle que
    `_hauteur_via` somme, bornes comprises, et elle ne depend d'aucun troncon.
    """
    v = {"x": 10.0, "y": 0.0, "layer_from": 0, "layer_to": 6,
         "drill_diameter": 0.25, "pad_diameter": 0.55, "retours": []}
    r = _se.simuler(_doc_vias_seuls(_QUATRE_GND, [v]))
    f = r["discontinuites"]["vias_hors_chaine"][0]
    attendu = _se._hauteur_via(_QUATRE_GND, 0, 6)
    assert abs(f["cotes"]["hauteur_mm"] - attendu) < 1e-9, (
        "hauteur %.4f au lieu de %.4f" % (f["cotes"]["hauteur_mm"], attendu))
    assert f["cotes"]["hauteur_source"] == "empilage", (
        "la hauteur est donnee pour supposee alors qu'elle est lue")


def les_plans_se_lisent_dans_l_empilage_pas_dans_la_chaine():
    """LE VERDICT SUR LA REFERENCE TIENT SANS TRONCON.

    `_analyse_retour` lisait les plans dans les deux troncons qui encadrent la
    transition. Sans troncon, il faut les lire dans l'empilage -- c'est ce que
    fait `_plans_de_couche`, et le verdict doit etre le MEME.
    """
    v = {"x": 10.0, "y": 0.0, "layer_from": 0, "layer_to": 6,
         "drill_diameter": 0.25, "pad_diameter": 0.55,
         "retours": [_retour_via(10.6, 0.0)]}
    seuls = _se.simuler(_doc_vias_seuls(_QUATRE_GND, [v]))
    ret = seuls["discontinuites"]["vias_hors_chaine"][0]["retour"]
    # Les memes deux troncons, mais en chaine cette fois : le retour doit
    # dire la meme chose des deux cotes, sinon on a deux verites.
    chaine = _trans(_QUATRE_GND, [_retour_via(15.6, 0.0)])[1]["retour"]
    assert ret["plans_depart"] == chaine["plans_depart"], (
        "plans de depart : %s hors chaine contre %s en chaine"
        % (ret["plans_depart"], chaine["plans_depart"]))
    assert ret["plans_arrivee"] == chaine["plans_arrivee"], (
        "plans d'arrivee : %s contre %s"
        % (ret["plans_arrivee"], chaine["plans_arrivee"]))
    assert ret["reference_change"] == chaine["reference_change"]


def un_via_deja_pris_par_la_chaine_ne_compte_pas_deux_fois():
    """DEUX CHIFFRES POUR UNE MEME GRANDEUR, C'EST LE DEFAUT A NE PAS FAIRE.

    La page envoie ses vias sans savoir lesquels la chaine retiendra. Celui
    qu'elle a deja pris doit sortir des vias hors chaine, sinon la fiche
    affiche le meme via deux fois -- et rien ne dit lequel croire.
    """
    ret = [_retour_via(15.6, 0.0)]
    d = _doc_retour(_QUATRE_GND, ret)
    d["vias"] = [{"x": 15.0, "y": 0.0, "layer_from": 0, "layer_to": 6,
                  "drill_diameter": 0.25, "pad_diameter": 0.55,
                  "retours": list(ret)}]
    r = _se.simuler(d)
    assert len(r["discontinuites"]["transitions"]) == 1, (
        "la chaine devait voir ce via")
    assert not r["discontinuites"]["vias_hors_chaine"], (
        "le via de la chaine est compte une seconde fois hors chaine")


def un_via_sans_changement_de_couche_n_en_est_pas_un():
    """Une boucle de hauteur nulle n'est pas une boucle. On ne le compte pas
    plutot que de rendre zero, qui se dessine et se lit comme une mesure."""
    v = {"x": 10.0, "y": 0.0, "layer_from": 2, "layer_to": 2,
         "drill_diameter": 0.25, "pad_diameter": 0.55, "retours": []}
    r = _se.simuler(_doc_vias_seuls(_QUATRE_GND, [v]))
    assert not r["discontinuites"]["vias_hors_chaine"], (
        "un via qui ne change pas de couche a ete compte")


T("un via hors chaîne a quand même un retour",
  un_via_hors_chaine_a_quand_meme_un_retour)
T("sa hauteur vient de l'empilage, sans tronçon",
  la_hauteur_vient_de_l_empilage_sans_troncon)
T("les plans se lisent dans l'empilage, même verdict",
  les_plans_se_lisent_dans_l_empilage_pas_dans_la_chaine)
T("un via déjà pris par la chaîne ne compte pas deux fois",
  un_via_deja_pris_par_la_chaine_ne_compte_pas_deux_fois)
T("un via sans changement de couche n'en est pas un",
  un_via_sans_changement_de_couche_n_en_est_pas_un)


T("la fiche du retour dit où est le via", la_fiche_du_retour_dit_ou_est_le_via)
T("sans position, la fiche ne l'invente pas",
  sans_position_la_fiche_ne_l_invente_pas)


print("\n" + "-" * 62)
print("  %d cas, %s" % (ok + ko, "tous passes" if not ko else "%d en echec" % ko))
sys.exit(1 if ko else 0)
