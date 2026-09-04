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
                       inductance_via, abcd_via, abcd_coude,
                       solve_multiline)
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
    # ON MESURE LE DIAGNOSTIC, PAS LA TOURNURE DE LA PHRASE. La version
    # precedente cherchait « parcours continu » dans les avertissements : elle
    # passait au vert tant que le texte contenait ces deux mots, et serait
    # passee au rouge sur une reformulation qui ne change rien au calcul. Un
    # essai qui mesure une phrase mesure la phrase.
    def genre(objets):
        return _se.simuler(_doc_via(objets))["topologie"]["genre"]

    def cascade(objets):
        return _se.simuler(_doc_via(objets))["topologie"]["cascadable"]

    via = [_piste(0, 0, 15, 0, 0), _piste(15, 0, 30, 0, 6)]
    meme_couche = [_piste(0, 0, 15, 0, 0), _piste(20, 0, 30, 0, 0)]
    deux_couches = [_piste(0, 0, 15, 0, 0), _piste(20, 0, 30, 0, 6)]

    # Un via : parcours continu, cascade legitime.
    assert genre(via) == "chaine", "un via est annonce comme une rupture"
    assert cascade(via), "un via interdit la cascade"

    # Deux troncons qui ne se touchent pas, MEME couche : deux MORCEAUX -- et
    # pas un parcours mal range. La distinction porte : « rangez la selection »
    # n'a aucun sens devant du cuivre qui ne se touche nulle part.
    assert genre(meme_couche) == "eparse",         "une vraie rupture sur une couche n'est plus signalee"
    assert not cascade(meme_couche),         "une selection eparse rend quand meme des parametres S"

    # Deux troncons qui ne se touchent pas, couches DIFFERENTES : eparse
    # aussi -- il n'y a pas de via la ou rien ne se touche.
    assert genre(deux_couches) == "eparse",         "une rupture entre deux couches n'est plus signalee"


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
    assert ret["source"] == "boucle", "ret['source'] doit valoir 'boucle'"
    assert t["modelise"]["inductance_source"] == "boucle"
    assert "bilan_sante" in t, "bilan_sante doit être calculé pour la boucle de masse"
    assert t["bilan_sante"]["score_reconstruction_pct"] > 90.0
    assert all(h.get("part_vias_gnd_pct") == 100.0 for h in t["bilan_sante"]["harmoniques"])
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


def la_repartition_spectrale_somme_a_un_et_bascule_en_frequence():
    """LA REPARTITION CAVITE / DECOUPLAGE SUIT LA PHYSIQUE A TOUTE FREQUENCE.

    A 10 kHz, la cavite a une impedance de plusieurs kilo-ohms et le decouplage
    porte plus de 95 % du retour. A tres haute frequence (500 MHz), l'ESL du
    decouplage bloque et la cavite inter-plans prend le dessus.
    """
    l_cav = 0.05e-9
    c_plans = 1e-9
    l_pont = 1.5e-9
    c_pont = 100e-9
    esr_pont = 0.03

    # A 10 kHz : decouplage ultra-dominant
    pp_bf, pc_bf = _tl.repartition_retour_plans(10e3, l_cav, c_plans,
                                                l_pont=l_pont, esr_pont=esr_pont,
                                                c_pont=c_pont)
    proche(pp_bf + pc_bf, 1.0, 1e-6, "somme a 10 kHz")
    assert pp_bf > 0.95, "le decouplage ne porte pas le retour a 10 kHz (%.2f)" % pp_bf
    assert pc_bf < 0.05, "la cavite porte trop de retour a 10 kHz (%.2f)" % pc_bf

    # A 500 MHz : la cavite prend le dessus face a l'ESL du condensateur
    pp_hf, pc_hf = _tl.repartition_retour_plans(500e6, l_cav, c_plans,
                                                l_pont=l_pont, esr_pont=esr_pont,
                                                c_pont=c_pont)
    proche(pp_hf + pc_hf, 1.0, 1e-6, "somme a 500 MHz")
    assert pc_hf > pp_hf, (
        "la cavite ne prend pas le dessus en HF : cavite=%.2f, pont=%.2f"
        % (pc_hf, pp_hf))


def le_bilan_de_sante_evalue_la_reconstruction_et_chiffre_le_decouplage():
    """LE BILAN DE SANTE CHIFFRE LA QUALITE DU SIGNAL ET LE RETOUR DES HARMONIQUES.

    Il fournit les 10 premieres harmoniques, les sondes HF jusqu'au genou
    (350 MHz pour tr=1 ns), et montre que rapprocher le decouplage ameliore
    le score de reconstruction.
    """
    proche_pont = _via_moignon(0, 6, ponts=[{"x": 12.0, "y": 0.0,
                                             "repere": "C1"}], rayon=10.0)
    loin_pont = _via_moignon(0, 6, ponts=[{"x": 25.0, "y": 0.0,
                                           "repere": "C2"}], rayon=10.0)

    doc_a = _doc_moignon(_GND_PWR, 0, 6, proche_pont)
    doc_a["temps_montee"] = 1e-9
    doc_a["f_fondamentale"] = 10e3

    doc_b = _doc_moignon(_GND_PWR, 0, 6, loin_pont)
    doc_b["temps_montee"] = 1e-9
    doc_b["f_fondamentale"] = 10e3

    ra = _se.simuler(doc_a)
    rb = _se.simuler(doc_b)

    ta = ra["discontinuites"]["transitions"][0]
    tb = rb["discontinuites"]["transitions"][0]

    assert "bilan_sante" in ta, "bilan_sante absent de la transition a"
    bilan = ta["bilan_sante"]

    assert len(bilan["harmoniques"]) == 10, "doit comporter 10 harmoniques"
    assert len(bilan["sondes_hf"]) == 5, "doit comporter 5 sondes HF"

    # L'harmonique 1 (10 kHz) : plus de 95% par le decouplage
    h1 = bilan["harmoniques"][0]
    assert h1["freq_hz"] == 10e3
    assert h1["part_pont_pct"] > 90.0, "H1 doit passer en majorite par le pont"

    # Sonde HF a 100% f_knee (350 MHz) : la cavite est active
    hf_knee = bilan["sondes_hf"][-1]
    assert hf_knee["freq_hz"] == 350e6
    assert hf_knee["part_cavite_pct"] > h1["part_cavite_pct"], (
        "la cavite doit porter plus de retour au genou (350 MHz) qu'a 10 kHz")

    # Rapprocher le decouplage preserve mieux le signal
    score_a = ta["modelise"]["score_reconstruction_pct"]
    score_b = tb["modelise"]["score_reconstruction_pct"]
    assert score_a > score_b, (
        "decouplage proche devrait avoir un meilleur score : %.2f contre %.2f"
        % (score_a, score_b))


T("la répartition spectrale somme à un et bascule en fréquence",
  la_repartition_spectrale_somme_a_un_et_bascule_en_frequence)
T("le bilan de santé évalue la reconstruction et chiffre le découplage",
  le_bilan_de_sante_evalue_la_reconstruction_et_chiffre_le_decouplage)


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


# ==========================================================================
# LA TOPOLOGIE : CE QUI EST UNE CHAINE, ET CE QUI NE L'EST PAS
# --------------------------------------------------------------------------
# La version precedente comptait des RUPTURES et rendait les parametres S dans
# tous les cas, assortis d'une phrase disant qu'ils ne voulaient rien dire.
# Deux defauts en un :
#
#   - un compteur unique confondait « le parcours existe mais la selection est
#     mal rangee » -- que la page peut corriger -- avec « ce net se ramifie »,
#     ou aucun ordre n'existe ;
#   - la courbe s'affichait quand meme, et le .s2p exporte, lui, ne portait
#     aucun avertissement. Un chiffre faux qui voyage est pire qu'absent.
# ==========================================================================


def le_via_hors_chaine_emporte_le_doute_sur_ses_cotes():
    """LE DRAPEAU SUIT LES COTES, SANS QUOI IL NE SUIT RIEN.

    La fiche d'un via hors parcours recopiait `cotes` -- ou chaque champ porte
    sa provenance -- mais pas le booleen `cotes_supposees`. Or c'est sur CE
    booleen que le panneau filtre pour ecrire « ce via est chiffre avec des
    valeurs supposees ». Les provenances partaient donc completes, et personne
    ne les lisait : un via chiffre sur une pastille devinee par le lecteur
    IPC-2581 se presentait comme un via mesure.
    """
    v = {"x": 10.0, "y": 0.0, "layer_from": 0, "layer_to": 6,
         "drill_diameter": 0.25,
         "pad_diameter": 0.55, "pad_diameter_supposee": True, "retours": []}
    r = _se.simuler(_doc_vias_seuls(_QUATRE, [v]))
    fiche = r["discontinuites"]["vias_hors_chaine"][0]
    assert fiche["cotes"]["pastille_source"] == "supposee",         "la provenance de la pastille est « %s »" % fiche["cotes"]["pastille_source"]
    assert fiche.get("cotes_supposees") is True,         "le via hors parcours ne porte pas le doute jusqu'au panneau : %r"         % sorted(fiche)

    # LE REVERS : des cotes LUES ne doivent pas lever le drapeau, sans quoi la
    # mention s'afficherait partout et ne se lirait plus nulle part.
    lu = dict(v)
    lu.pop("pad_diameter_supposee")
    r2 = _se.simuler(_doc_vias_seuls(_QUATRE, [lu]))
    f2 = r2["discontinuites"]["vias_hors_chaine"][0]
    assert f2["cotes"]["pastille_source"] == "page",         "une pastille envoyee sans reserve passe pour supposee"
    assert f2.get("cotes_supposees") is False,         "des cotes lues levent quand meme le doute"


T("un via hors chaine emporte le doute sur ses cotes",
  le_via_hors_chaine_emporte_le_doute_sur_ses_cotes)


print("\nLa topologie de la selection")


def _en_T():
    """Trois branches sur un meme point : un bus qui dessert deux boitiers."""
    return [_piste(0, 0, 10, 0, 0),
            _piste(10, 0, 20, 0, 0),
            _piste(10, 0, 10, 10, 0)]


def un_net_ramifie_n_est_pas_une_chaine():
    """AUCUN ORDRE NE SAUVE UN T, et c'est ce qu'il faut dire.

    Trois bouts sur un point : la liaison n'a pas deux acces mais trois. La
    mise en cascade ABCD suppose une entree et une sortie ; ici il faudrait
    choisir laquelle des deux branches est « la suite », et ce choix
    changerait le resultat tout en ayant l'air d'un calcul.
    """
    r = _se.simuler(_doc_via(_en_T()))
    topo = r["topologie"]
    assert topo["genre"] == "ramifiee", \
        "un T est classe « %s »" % topo["genre"]
    assert not topo["cascadable"], "un T laisse passer la cascade"
    assert len(topo["derivations"]) == 1, \
        "%d derivation(s) vues au lieu d'une" % len(topo["derivations"])
    d = topo["derivations"][0]
    proche(d["x"], 10.0, 1e-6, "l'abscisse de la derivation")
    assert d["branches"] == 3, "%d branches comptees" % d["branches"]

    # ET LES PARAMETRES S NE SORTENT PAS. C'est la moitie qui manquait : le
    # diagnostic ne vaut que s'il empeche quelque chose.
    assert r["s"] == [], "%d matrices S rendues sur un net ramifie" % len(r["s"])
    assert r["touchstone"] == "", "un .s2p est exporte sur un net ramifie"
    assert "ramifie" in r["cascade_refusee"], \
        "la raison ne nomme pas la ramification : %r" % r["cascade_refusee"]


T("un net ramifie n'est pas une chaine, et ne rend pas de parametres S",
  un_net_ramifie_n_est_pas_une_chaine)


def le_desordre_se_distingue_de_la_ramification():
    """« RANGEZ LA SELECTION » N'A DE SENS QUE SI C'EN EST UNE.

    Les memes trois troncons colineaires, envoyes dans le desordre, forment un
    parcours : la page peut les ranger. Un T, non. Les confondre revient a
    demander a l'un l'impossible et a taire a l'autre ce qu'il suffirait de
    faire -- c'est pour cette phrase-la que le diagnostic existe.
    """
    ordre = [_piste(0, 0, 10, 0, 0), _piste(10, 0, 20, 0, 0),
             _piste(20, 0, 30, 0, 0)]
    desordre = [ordre[0], ordre[2], ordre[1]]

    assert _se.simuler(_doc_via(ordre))["topologie"]["genre"] == "chaine", \
        "un parcours range n'est pas reconnu"
    t = _se.simuler(_doc_via(desordre))["topologie"]
    assert t["genre"] == "desordre", "le desordre est classe « %s »" % t["genre"]
    assert t["morceaux"] == 1, \
        "un parcours mal range est vu en %d morceaux" % t["morceaux"]
    assert t["bouts_libres"] == 2, "un parcours n'a pas deux extremites"

    # LE MEME CUIVRE, LE MEME NOMBRE DE TRONCONS, UN DIAGNOSTIC DIFFERENT.
    assert _se.simuler(_doc_via(_en_T()))["topologie"]["genre"] == "ramifiee", \
        "le T et le desordre recoivent le meme verdict"


T("un parcours mal range n'est pas un net ramifie",
  le_desordre_se_distingue_de_la_ramification)


def une_boucle_n_a_pas_deux_acces():
    """UNE BOUCLE FERMEE N'A NI ENTREE NI SORTIE.

    Un anneau de cuivre est connexe, sans derivation, et chaque troncon touche
    le suivant : les trois criteres precedents le declarent chaine. Il n'en est
    pas une pour autant -- le cascader reviendrait a le couper en un point
    arbitraire, et le S11 rendu dependrait de ce choix.
    """
    anneau = [_piste(0, 0, 10, 0, 0), _piste(10, 0, 10, 10, 0),
              _piste(10, 10, 0, 10, 0), _piste(0, 10, 0, 0, 0)]
    t = _se.simuler(_doc_via(anneau))["topologie"]
    assert t["genre"] == "boucle", "un anneau est classe « %s »" % t["genre"]
    assert t["bouts_libres"] == 0, \
        "%d extremites libres sur un anneau" % t["bouts_libres"]
    assert not t["cascadable"], "un anneau laisse passer la cascade"


T("une boucle fermee n'est pas une chaine", une_boucle_n_a_pas_deux_acces)


def les_cumuls_disent_s_ils_valent_quelque_chose():
    """LE RETARD D'UN T N'EST LE TRAJET DE PERSONNE.

    Additionner les longueurs des trois branches d'une derivation donne une
    quantite de cuivre, pas un retard de propagation : aucun front ne parcourt
    les deux branches. Le chiffre reste rendu -- il repond a « combien de
    cuivre ai-je selectionne » -- mais il doit se presenter pour ce qu'il est.
    """
    droit = _se.simuler(_doc_via([_piste(0, 0, 10, 0, 0),
                                  _piste(10, 0, 20, 0, 0)]))
    assert droit["ligne"]["cumuls_valides"] is True, \
        "les cumuls d'une chaine sont annonces douteux"

    t = _se.simuler(_doc_via(_en_T()))
    assert t["ligne"]["cumuls_valides"] is False, \
        "les cumuls d'un net ramifie passent pour un retard de liaison"
    # Les impedances par troncon, elles, restent rendues : chacune ne depend
    # que de sa propre section, et c'est tout l'interet de la distinction.
    assert t["ligne"]["troncons"] == 3, \
        "%d troncons chiffres sur le T" % t["ligne"]["troncons"]
    assert t["ligne"]["z0_moyen"] > 0, "le T ne rend plus d'impedance"


T("les cumuls disent s'ils valent quelque chose",
  les_cumuls_disent_s_ils_valent_quelque_chose)


def un_document_sans_coordonnees_reste_calculable():
    """ON NE REFUSE PAS CE QU'ON NE PEUT PAS JUGER.

    Un document ecrit a la main qui ne porte que des longueurs est une chaine
    parfaitement legitime, envoyee dans l'ordre. Faute de coordonnees on ne
    peut ni le confirmer ni l'infirmer -- et refuser par defaut ferait taire un
    calcul juste. Le doute profite au document.
    """
    objets = [{"type": "track", "length": 10.0, "width": 0.35, "layer": 0,
               "net": "SIG", "copper_thickness": 0.035},
              {"type": "track", "length": 5.0, "width": 0.35, "layer": 0,
               "net": "SIG", "copper_thickness": 0.035}]
    r = _se.simuler(_doc_via(objets))
    assert r["topologie"]["genre"] == "sans_coordonnees", \
        "un document sans XY est classe « %s »" % r["topologie"]["genre"]
    assert r["topologie"]["cascadable"], \
        "un document sans XY se voit refuser la cascade"
    assert len(r["s"]) > 0, "un document sans XY ne rend plus de parametres S"
    assert r["touchstone"], "un document sans XY ne rend plus de .s2p"
    assert r["cascade_refusee"] == "", "un refus est annonce sans raison"


T("un document sans coordonnees reste calculable",
  un_document_sans_coordonnees_reste_calculable)

# ==========================================================================
# LES LIGNES COUPLEES : LA MATRICE DE MAXWELL ET LES DEUX MODES
# --------------------------------------------------------------------------
# UN SEUL CHANTIER, DEUX REPONSES. `solve_multiline` resout la meme section que
# `solve_line` avec N seconds membres au lieu d'un, et rend la matrice de
# capacite de Maxwell [C] puis [L] = mu0 eps0 [C0]^-1. Tout ce qui suit en
# sort : modes pair et impair, Z differentielle, Z commune, NEXT et FEXT.
#
# QUATRE INVARIANTS GRATUITS, et ils attrapent une erreur de signe ou d'indice
# avant tout etalon : la matrice est SYMETRIQUE, sa diagonale POSITIVE, ses
# termes croises NEGATIFS, et la somme d'une ligne vaut la capacite du
# conducteur VERS LA REFERENCE -- donc positive et plus petite que sa
# diagonale.
#
# DEUX REDUCTIONS EXACTES : un conducteur seul par la matrice doit redonner
# `solve_line` AU BIT PRES -- c'est la meme quadrature, les memes panneaux, le
# meme milieu --, et deux rubans qu'on eloigne doivent se decoupler, chacun
# retrouvant la capacite du ruban seul.
#
# UN ETALON EXTERIEUR : la forme fermee de Garg-Bahl pour le microruban couple
# par les aretes, qui vaut a quelques pour cent. Il en fallait un : les
# invariants et les reductions verifient la COHERENCE du calcul, pas sa
# justesse. C'est la meme exigence que Hammerstad-Jensen pour la ligne seule.
#
# ET UNE PROPRIETE PHYSIQUE QUI NE SE DISCUTE PAS : en milieu HOMOGENE, la
# couplage AVANT est nul. Une triplaque n'a pas de FEXT -- k_C et k_L y sont
# egaux terme a terme --, un microruban si, et de signe negatif. Rien de plus
# severe pour verifier que [C] et [L] decrivent bien la MEME geometrie.
# ==========================================================================

def garg_bahl(u, g, er):
    """Z pair, Z impair et leurs eps_eff d'un microruban couple. u=w/h, g=s/h.

    Garg et Bahl (1979), tel que repris par Gupta, « Microstrip Lines and
    Slotlines » : les capacites de chaque mode se composent d'un terme plan,
    d'une frange exterieure, et -- pour le mode impair seul -- des deux termes
    de couplage, celui de l'air (integrale elliptique) et celui du dielectrique
    (coth). La forme est donnee a quelques pour cent, ce qui est exactement ce
    qu'on attend d'un etalon exterieur ici : il ne sert pas a affiner le
    solveur, il sert a exclure qu'il se trompe de physique.
    """
    from scipy.special import ellipk

    def capacites(epsr):
        z0, ere = hammerstad_jensen(u, epsr)
        c_p = EPSILON_0 * epsr * u
        c_f = 0.5 * (np.sqrt(ere) / (_tl.C_0 * z0) - c_p)
        a = np.exp(-0.1 * np.exp(2.33 - 1.5 * u))
        c_fp = c_f / (1.0 + a / g * np.tanh(8.0 * g)) * np.sqrt(epsr / ere)
        k = g / (g + 2.0 * u)
        c_ga = EPSILON_0 * ellipk(1.0 - k * k) / ellipk(k * k)
        c_gd = (EPSILON_0 * epsr / np.pi) * np.log(1.0 / np.tanh(np.pi * g / 4.0)) \
            + 0.65 * c_f * (0.02 / g * np.sqrt(epsr) + 1.0 - epsr ** -2)
        return c_p + c_f + c_fp, c_p + c_f + c_ga + c_gd

    c_pair, c_impair = capacites(er)
    c_pair_air, c_impair_air = capacites(1.0)
    return (1.0 / (_tl.C_0 * np.sqrt(c_pair * c_pair_air)),
            1.0 / (_tl.C_0 * np.sqrt(c_impair * c_impair_air)),
            c_pair / c_pair_air, c_impair / c_impair_air)


def _paire(w, s, h=H, er=4.3, t=0.0, **reste):
    """Une paire symetrique de microruban, resolue."""
    return solve_multiline(dict({"kind": "micro", "t": t, "h": h,
                                 "epsilon_r": er,
                                 "conducteurs": [{"w": w}, {"w": w, "s": s}]},
                                **reste))


print("\nLes lignes couplees : les invariants de la matrice de Maxwell")


def un_conducteur_par_la_matrice_redonne_la_ligne_seule():
    """N = 1 DOIT REDONNER LE CHIFFRE ACTUEL AU BIT PRES.

    C'est la reduction la plus severe de tout ce lot : meme milieu, memes
    panneaux, meme quadrature -- le seul changement est la forme du second
    membre, qui devient une matrice a une colonne. Un ecart ici ne serait pas
    une imprecision, ce serait un chemin de calcul different.
    """
    geo = {"kind": "micro", "w": 0.35e-3, "t": 35e-6, "h": H, "epsilon_r": 4.3}
    seul = solve_line(geo)
    m = _tl._milieu(geo)
    places = _tl._conducteurs_places([{"w": 0.35e-3}], 35e-6, m["distance"])
    c = _tl.capacitance_matrice(places, 0.0, 0.0, m["g_diel"], m["distance"],
                                m["eps_moyen"])
    c0 = _tl.capacitance_matrice(places, 0.0, 0.0, m["g_vide"], m["distance"],
                                 m["eps_vide"])
    proche(c[0, 0], seul["c"], 1e-12, "C par la matrice")
    proche(c0[0, 0], seul["c0"], 1e-12, "C0 par la matrice")


T("N = 1 par la matrice redonne solve_line au bit pres",
  un_conducteur_par_la_matrice_redonne_la_ligne_seule)


def la_matrice_porte_ses_quatre_invariants():
    """SYMETRIQUE, DIAGONALE POSITIVE, CROISES NEGATIFS, SOMME DE LIGNE JUSTE.

    Les trois premiers attrapent une erreur de signe ou d'indice ; le quatrieme
    dit ce que la matrice de Maxwell EST : la somme d'une ligne est la charge
    portee par le conducteur quand TOUS sont au meme potentiel, c'est-a-dire sa
    capacite vers la reference seule -- necessairement positive, et plus petite
    que sa diagonale puisque le voisin lui en a pris une part.

    LA SYMETRIE SE MESURE SUR LA MATRICE BRUTE. `capacitance_matrice` symetrise
    en sortie, comme tout extracteur ; la verifier apres coup ne verifierait
    rien du tout, et cacherait justement le jour ou la discretisation ne
    suffirait plus. Sur trois pistes de largeurs differentes -- le cas le plus
    defavorable, puisque A[m,k] ne depend que de la largeur de k --, l'ecart
    mesure vaut 3,1e-06 ; le seuil est pose a 1e-05, et le franchir voudrait
    dire qu'il faut plus de panneaux.
    """
    geo = {"kind": "micro", "t": 35e-6, "h": H, "epsilon_r": 4.3,
           "conducteurs": [{"w": 0.25e-3}, {"w": 0.4e-3, "s": 0.18e-3},
                           {"w": 0.25e-3, "s": 0.3e-3}]}
    m = _tl._milieu(geo)
    places = _tl._conducteurs_places(geo["conducteurs"], 35e-6, m["distance"])
    brute = _tl.capacitance_matrice(places, 0.0, 0.0, m["g_diel"],
                                    m["distance"], m["eps_moyen"],
                                    symetriser=False)
    ecart = np.max(np.abs(brute - brute.T)) / np.max(np.abs(brute))
    assert ecart < 1e-5, "matrice brute asymetrique de %.2e" % ecart

    c = np.array(solve_multiline(geo)["c"])
    assert np.all(np.diag(c) > 0), "diagonale non positive : %s" % np.diag(c)
    for i in range(3):
        for j in range(3):
            if i != j:
                assert c[i, j] < 0, \
                    "C[%d,%d] = %.3e, une mutuelle de Maxwell est negative" \
                    % (i, j, c[i, j])
        vers_masse = c[i].sum()
        assert 0 < vers_masse < c[i, i], \
            "somme de la ligne %d : %.3e hors de ]0 ; %.3e[" \
            % (i, vers_masse, c[i, i])


T("la matrice porte ses quatre invariants", la_matrice_porte_ses_quatre_invariants)


def deux_rubans_eloignes_se_decouplent():
    """LOIN L'UN DE L'AUTRE, CHACUN REDEVIENT UN RUBAN SEUL.

    Le terme croise doit tomber a rien, et surtout chaque DIAGONALE doit
    retrouver la capacite du ruban seul : un couplage residuel se verrait
    d'abord la, parce que la diagonale de Maxwell compte la mutuelle.
    """
    w = 0.35e-3
    seul = solve_line({"kind": "micro", "w": w, "t": 35e-6, "h": H,
                       "epsilon_r": 4.3})
    r = _paire(w, 20.0 * H, t=35e-6)
    c = np.array(r["c"])
    couplage = abs(c[0, 1] / c[0, 0])
    assert couplage < 2e-3, "a vingt hauteurs, il reste %.3e de couplage" % couplage
    proche(c[0, 0], seul["c"], 2e-3, "C11 du ruban eloigne")
    proche(r["lignes"][0]["z0"], seul["z0"], 2e-3, "Z0 du ruban eloigne")


T("deux rubans eloignes se decouplent", deux_rubans_eloignes_se_decouplent)


def z_diff_tend_vers_deux_fois_z0():
    """Z_DIFF -> 2 Z0 QUAND L'ECART DEVIENT GRAND DEVANT LA HAUTEUR.

    Deux lignes qui ne se voient plus, prises en differentiel, ne sont que deux
    lignes en serie : la tension entre elles est deux fois celle de chacune au
    plan de symetrie, et le courant est le meme. C'est la seule facon de
    verifier le facteur deux de Z_diff sans le poser par convention.
    """
    w = 0.35e-3
    z0 = solve_line({"kind": "micro", "w": w, "t": 0.0, "h": H,
                     "epsilon_r": 4.3})["z0"]
    proche(_paire(w, 30.0 * H)["paire"]["z_diff"], 2.0 * z0, 5e-3, "Z_diff loin")
    # Et Z commune tend vers Z0/2, par le meme raisonnement en parallele.
    proche(_paire(w, 30.0 * H)["paire"]["z_commune"], z0 / 2.0, 5e-3,
           "Z_commune loin")


T("Z_diff tend vers 2 Z0 quand l'ecart s'ouvre", z_diff_tend_vers_deux_fois_z0)


def serrer_la_paire_baisse_z_diff():
    """SERRER FAIT BAISSER Z_DIFF ET MONTER Z_COMMUNE, toujours.

    Les deux vont en sens INVERSE, et c'est ce qui distingue un vrai couplage
    d'une erreur d'echelle qui deplacerait les deux ensemble.
    """
    diff, comm, k = [], [], []
    for s in (0.15e-3, 0.25e-3, 0.5e-3, 1.0e-3):
        p = _paire(0.25e-3, s)["paire"]
        diff.append(p["z_diff"]); comm.append(p["z_commune"]); k.append(p["k_c"])
    assert all(a < b for a, b in zip(diff, diff[1:])), diff
    assert all(a > b for a, b in zip(comm, comm[1:])), comm
    assert all(a > b for a, b in zip(k, k[1:])), k


T("serrer la paire baisse Z_diff et monte Z_commune",
  serrer_la_paire_baisse_z_diff)


print("\nLa paire de microruban contre Garg-Bahl (+-3 %)")

for _u in (0.5, 1.0, 2.0):
    for _g in (0.5, 1.0, 2.0):
        def essai(u=_u, g=_g):
            z_pair, z_impair, e_pair, e_impair = garg_bahl(u, g, 4.3)
            p = _paire(u * H, g * H)["paire"]
            proche(p["z_diff"], 2.0 * z_impair, 0.03, "Z_diff")
            proche(p["z_commune"], z_pair / 2.0, 0.03, "Z_commune")
            proche(p["eps_eff_impair"], e_impair, 0.02, "eps_eff impair")
            proche(p["eps_eff_pair"], e_pair, 0.02, "eps_eff pair")
            # L'IMPAIR VOIT PLUS D'AIR QUE LE PAIR : son champ passe entre les
            # deux rubans, au-dessus du stratifie. eps_eff impair < pair, et
            # c'est CE fait qui fait exister le couplage avant (FEXT).
            assert p["eps_eff_impair"] < p["eps_eff_pair"], \
                "eps_eff impair %.3f >= pair %.3f" % (p["eps_eff_impair"],
                                                      p["eps_eff_pair"])
        T("w/h=%3.1f  s/h=%3.1f" % (_u, _g), essai)


# ==========================================================================
# L'APPARIEMENT : QUELLES PISTES SE LONGENT, ET SUR QUELLE LONGUEUR
# --------------------------------------------------------------------------
# LE SOLVEUR NE PEUT PAS LE SAVOIR, et la page ne le dit pas : c'est
# `simulation_em._scenes_paralleles` qui apparie, a partir de la selection et
# du voisinage que la page envoie. Une erreur ici ne se verrait pas dans les
# chiffres -- ils resteraient justes pour la geometrie appariee --, elle se
# verrait dans la carte : un couplage annonce la ou il n'y en a pas, ou tu.
#
# On verifie donc la REGLE, pas le chiffre : ce qui est retenu, ce qui est
# ecarte, et ce que vaut la longueur de recouvrement quand elle est partielle.
# ==========================================================================

def _doc_couplage(objets, voisinage, couches=None, paires=None):
    """Un document de simulation avec son voisinage."""
    couches = couches or [_cu("TOP", "signal"), _di("core", 0.2, 4.3),
                          _cu("GND", "plane"), _di("ame", 0.8, 4.3),
                          _cu("IN2", "signal"), _di("bas", 0.2, 4.3),
                          _cu("BOT", "plane")]
    doc = {"format": "cao-sim-em-3", "carte": "banc", "net": "SIG",
           "stackup": {"layers": couches},
           "geometry": {"objects": objets},
           "voisinage": voisinage,
           "reference_nets": ["GND"],
           "ports": [{"id": 1, "impedance": 50}, {"id": 2, "impedance": 50}],
           "analyse": {"f_debut": 1e8, "f_fin": 5e9, "points": 11,
                       "f_centre": 1e9}}
    if paires:
        doc["paires"] = paires
    return doc


def _pis(x1, y1, x2, y2, net, couche=0, largeur=0.25):
    return {"type": "track", "start": [x1, y1], "end": [x2, y2],
            "width": largeur, "layer": couche, "net": net,
            "copper_thickness": 0.035}


print("\nL'appariement des troncons paralleles")


def deux_pistes_qui_se_longent_sont_appariees():
    """CE QUI EST RETENU, ET AVEC QUELLES COTES.

    Deux pistes de 0,25 mm dont les AXES sont a 0,5 mm laissent 0,25 mm de
    cuivre a cuivre : l'ecart rendu est celui-la, et pas la distance entre
    axes. C'est la meme convention que partout ailleurs dans cette chaine, et
    s'en ecarter ferait sortir Z_diff de plusieurs ohms.
    """
    r = _se.simuler(_doc_couplage([_pis(0, 0, 25, 0, "SIG")],
                                  [_pis(0, 0.5, 25, 0.5, "AGR")]))
    paires = r["couplage"]["paires"]
    assert len(paires) == 1, "%d longement(s) au lieu d'un" % len(paires)
    f = paires[0]
    proche(f["ecart"], 0.25, 1e-6, "ecart de cuivre a cuivre")
    proche(f["longueur"], 25.0, 1e-6, "longueur de recouvrement")
    assert f["net_voisin"] == "AGR", f["net_voisin"]
    assert f["z_diff"] > 0 and f["z_commune"] > 0, f


T("deux pistes qui se longent sont appariees",
  deux_pistes_qui_se_longent_sont_appariees)


def ce_qui_ne_longe_pas_est_ecarte():
    """QUATRE FACONS DE NE PAS ETRE APPARIE, et aucune ne doit faire de paire.

    Une perpendiculaire, une piste trop loin, une piste sur une autre couche,
    et une piste du MEME net -- qui est la meme liaison, pas un agresseur.

    ET CELLE DE L'AUTRE COUCHE NE SE TAIT PLUS TOUT A FAIT : elle ne peut pas
    entrer dans la section -- un seul plan de conducteurs --, mais l'empilage
    du banc pose GND entre TOP et IN2, et c'est ce PLAN qui la rend inoffensive.
    Elle est donc comptee comme BLINDEE, ce qui n'est pas la meme chose que de
    ne pas l'avoir vue. Voir le test suivant pour le cas sans plan.
    """
    r = _se.simuler(_doc_couplage(
        [_pis(0, 0, 25, 0, "SIG")],
        [_pis(12, -5, 12, 5, "CROISE"),          # perpendiculaire
         _pis(0, 4.0, 25, 4.0, "LOIN"),          # au-dela de 3 mm
         _pis(0, 0.5, 25, 0.5, "DESSOUS", 4),    # une autre couche, sous GND
         _pis(0, 0.5, 25, 0.5, "SIG")]))         # le meme net
    c = r["couplage"]
    assert not c["paires"], \
        "apparie a tort : %s" % [f["net_voisin"] for f in c["paires"]]
    assert not c["superposes"], \
        "signale a tort par-dessus : %s" % [f["net"] for f in c["superposes"]]
    assert c["superposes_blindes"] == 1, \
        "%d longement(s) blinde(s) au lieu d'un" % c["superposes_blindes"]


T("ce qui ne longe pas est ecarte", ce_qui_ne_longe_pas_est_ecarte)


# Deux couches de SIGNAL adossees -- rien entre elles que du prepreg --, et le
# plan de reference plus bas. C'est l'empilage qui rend le piege possible.
_ADOSSEES = [_cu("TOP", "signal"), _di("pp", 0.1, 4.3),
             _cu("IN1", "signal"), _di("ame", 0.8, 4.3),
             _cu("GND", "plane"), _di("bas", 0.2, 4.3),
             _cu("BOT", "plane")]


def ce_qui_longe_par_dessus_est_vu_sans_etre_chiffre():
    """LE PIRE CAS DU METIER NE DOIT PAS S'AFFICHER COMME LE MEILLEUR.

    Deux couches de signal ADOSSEES, une piste exactement sous l'autre sur
    toute sa longueur : la section droite ne sait pas le decrire -- elle pose
    tous ses conducteurs a la meme hauteur -- et rendait donc « aucune voisine
    ne longe ». On verifie les trois choses qui font la difference entre un
    silence et une reserve :

      · aucune PAIRE, parce que le couplage n'est toujours pas chiffre ;
      · une entree dans `superposes`, avec la geometrie qui decide -- longueur
        en regard, decalage de cuivre a cuivre NUL (les deux pistes se
        chevauchent en projection), et l'epaisseur de PREPREG, pas la distance
        entre les milieux des deux cuivres ;
      · un AVERTISSEMENT, parce qu'une hypothese ne dit pas si le cas se
        produit ici.
    """
    r = _se.simuler(_doc_couplage([_pis(0, 0, 25, 0, "SIG")],
                                  [_pis(0, 0, 25, 0, "DESSUS", 2)],
                                  couches=_ADOSSEES))
    c = r["couplage"]
    assert not c["paires"], "chiffre ce qu'il ne sait pas resoudre"
    assert len(c["superposes"]) == 1, \
        "%d longement(s) entre couches" % len(c["superposes"])
    f = c["superposes"][0]
    assert f["net"] == "DESSUS", f["net"]
    assert f["nom_couche"] == "IN1" and f["nom_depuis"] == "TOP", f
    proche(f["longueur"], 25.0, 1e-6, "longueur en regard")
    assert f["decalage"] == 0.0, "decalage %.3f au lieu de 0" % f["decalage"]
    proche(f["hauteur"], 0.1, 1e-6, "prepreg entre les deux faces")
    assert any("ENTRE COUCHES" in a for a in r["avertissements"]), \
        "aucun avertissement : le silence se lit comme un couplage nul"


T("ce qui longe par-dessus est vu sans etre chiffre",
  ce_qui_longe_par_dessus_est_vu_sans_etre_chiffre)


def le_decalage_entre_couches_se_compte_de_cuivre_a_cuivre():
    """LA MEME CONVENTION QUE POUR L'ECART COPLANAIRE, et pour la meme raison.

    Deux pistes de 0,25 mm dont les axes sont a 0,4 mm laissent 0,15 mm de
    cuivre a cuivre. Compter la distance entre AXES deguiserait un pire cas en
    cas moyen -- deux pistes qui se chevauchent encore largement en projection
    seraient annoncees « decalees de 0,4 mm ».

    ET AU-DELA DE LA PORTEE, PLUS RIEN : une piste a 4 mm sur la couche
    adossee ne se voit plus lateralement, comme sur la meme couche.
    """
    r = _se.simuler(_doc_couplage(
        [_pis(0, 0, 25, 0, "SIG")],
        [_pis(0, 0.4, 25, 0.4, "DECALEE", 2),
         _pis(0, 4.0, 25, 4.0, "HORS", 2)],
        couches=_ADOSSEES))
    sup = r["couplage"]["superposes"]
    assert len(sup) == 1, "%s" % [f["net"] for f in sup]
    assert sup[0]["net"] == "DECALEE", sup[0]["net"]
    proche(sup[0]["decalage"], 0.15, 1e-6, "decalage de cuivre a cuivre")


T("le decalage entre couches se compte de cuivre a cuivre",
  le_decalage_entre_couches_se_compte_de_cuivre_a_cuivre)


def un_croisement_entre_couches_ne_se_signale_pas():
    """SIGNALER UN CROISEMENT SERAIT SIGNALER LA SOLUTION.

    L'aire de recouvrement d'une traversee orthogonale est minuscule, et c'est
    precisement pourquoi la regle du metier est de router deux couches
    adossees a angle droit. Une carte correctement routee ne doit donc pas
    recevoir une alarme par croisement.

    Le meme net d'une couche a l'autre ne compte pas non plus : c'est la meme
    liaison qui change de couche par un via, pas un agresseur.
    """
    r = _se.simuler(_doc_couplage(
        [_pis(0, 0, 25, 0, "SIG")],
        [_pis(12, -5, 12, 5, "CROISE", 2),
         _pis(0, 0, 25, 0, "SIG", 2)],
        couches=_ADOSSEES))
    assert not r["couplage"]["superposes"], \
        "signale a tort : %s" % [f["net"] for f in r["couplage"]["superposes"]]


T("un croisement entre couches ne se signale pas",
  un_croisement_entre_couches_ne_se_signale_pas)


def le_recouvrement_partiel_compte_pour_ce_quil_est():
    """UNE VOISINE QUI NE LONGE QUE LA MOITIE NE COUPLE QUE SUR LA MOITIE.

    C'est tout l'objet de la projection sur l'axe : prendre la longueur de la
    voisine, ou celle de la victime, donnerait un couplage deux fois trop long
    -- et le NEXT sature justement sur la longueur.
    """
    r = _se.simuler(_doc_couplage([_pis(0, 0, 20, 0, "SIG")],
                                  [_pis(12, 0.5, 40, 0.5, "AGR")]))
    f = r["couplage"]["paires"][0]
    proche(f["longueur"], 8.0, 1e-6, "recouvrement partiel")


T("le recouvrement partiel compte pour ce qu'il est",
  le_recouvrement_partiel_compte_pour_ce_quil_est)


def les_longements_dun_meme_net_se_cumulent():
    """TROIS TRONCONS QUI LONGENT LA MEME VOISINE FONT UNE SEULE LIGNE.

    La fiche repond a « combien ce net me prend-il », pas a « combien de
    segments ai-je dessines » : les longueurs s'additionnent, et l'ecart rendu
    est la moyenne PONDEREE, l'ecart le plus serre restant a part.
    """
    r = _se.simuler(_doc_couplage(
        [_pis(0, 0, 10, 0, "SIG"), _pis(10, 0, 20, 0, "SIG")],
        [_pis(0, 0.5, 10, 0.5, "AGR"), _pis(10, 0.8, 20, 0.8, "AGR")]))
    paires = r["couplage"]["paires"]
    assert len(paires) == 1, "%d lignes pour un seul net voisin" % len(paires)
    f = paires[0]
    proche(f["longueur"], 20.0, 1e-6, "longueur cumulee")
    assert f["troncons"] == 2, "%d troncons" % f["troncons"]
    proche(f["ecart_min"], 0.25, 1e-6, "ecart le plus serre")
    proche(f["ecart"], 0.4, 1e-6, "ecart moyen pondere")


T("les longements d'un meme net se cumulent",
  les_longements_dun_meme_net_se_cumulent)


def la_paire_differentielle_se_nomme():
    """QUI EST UNE PAIRE, ET QUI N'EST QU'UN VOISIN.

    Le calcul est le meme -- deux pistes qui se longent sont couplees, quels
    que soient leurs noms. Ce qui change est la QUESTION : sur une paire, Z_diff
    est la reponse ; sur un voisin quelconque, c'est le NEXT. Les suffixes
    tranchent a defaut de declaration, et la declaration de la page l'emporte.
    """
    r = _se.simuler(_doc_couplage([_pis(0, 0, 25, 0, "USB_DP")],
                                  [_pis(0, 0.5, 25, 0.5, "USB_DM"),
                                   _pis(0, -0.8, 25, -0.8, "CLK")]))
    par_net = {f["net_voisin"]: f for f in r["couplage"]["paires"]}
    assert par_net["USB_DM"]["differentielle"], \
        "USB_DP / USB_DM n'est pas reconnu comme une paire"
    assert not par_net["CLK"]["differentielle"], \
        "CLK passe pour la moitie d'une paire differentielle"

    # LA DECLARATION DE LA PAGE L'EMPORTE : deux nets qui ne se ressemblent pas
    # forment une paire des lors qu'on l'a dit dans l'editeur.
    r2 = _se.simuler(_doc_couplage([_pis(0, 0, 25, 0, "ALPHA")],
                                   [_pis(0, 0.5, 25, 0.5, "BETA")],
                                   paires=[["ALPHA", "BETA"]]))
    assert r2["couplage"]["paires"][0]["differentielle"], \
        "une paire declaree par la page n'est pas reconnue"


T("la paire differentielle se nomme", la_paire_differentielle_se_nomme)


def le_pire_longement_vient_en_tete():
    """LA FICHE SE LIT DE HAUT EN BAS, donc le pire doit y etre.

    Un longement long et lache fait moins de bruit qu'un court et serre : c'est
    le BRUIT qui ordonne la liste, pas la longueur.
    """
    r = _se.simuler(_doc_couplage(
        [_pis(0, 0, 40, 0, "SIG")],
        [_pis(0, 2.0, 40, 2.0, "LACHE"),        # long, mais a 1,75 mm
         _pis(0, -0.4, 8, -0.4, "SERRE")]))     # court, mais a 0,15 mm
    noms = [f["net_voisin"] for f in r["couplage"]["paires"]]
    assert noms[0] == "SERRE", "la fiche met « %s » en tete" % noms[0]


T("le pire longement vient en tete", le_pire_longement_vient_en_tete)


def le_temps_de_montee_se_deduit_de_la_bande():
    """SANS FRONT DONNE, ON LE DEDUIT -- ET ON DIT QU'ON L'A DEDUIT.

    Le temps de montee ne change ni [C] ni [L] : il decide de la saturation du
    NEXT et de l'amplitude du FEXT. Le poser en dur ferait mentir les deux ;
    le deduire de la bande analysee par la regle du genou est une hypothese
    defendable, a condition de l'ecrire.
    """
    doc = _doc_couplage([_pis(0, 0, 25, 0, "SIG")],
                        [_pis(0, 0.5, 25, 0.5, "AGR")])
    c = _se.simuler(doc)["couplage"]
    proche(c["temps_montee"], 0.35 / 5e9, 1e-9, "temps de montee deduit")
    assert "deduit" in c["temps_montee_source"], c["temps_montee_source"]

    doc["analyse"]["temps_montee"] = 500e-12
    c2 = _se.simuler(doc)["couplage"]
    proche(c2["temps_montee"], 500e-12, 1e-9, "temps de montee saisi")
    assert c2["temps_montee_source"] == "saisi", c2["temps_montee_source"]
    # ET IL NE CHANGE RIEN A LA Z DIFFERENTIELLE : elle sort de [C] et [L],
    # que le front ne touche pas. C'est ce qui rend cette page-ci lisible
    # sans rien savoir du signal -- le front n'y sert qu'au seuil de
    # couture.
    proche(c2["paires"][0]["z_diff"], c["paires"][0]["z_diff"], 1e-9,
           "le front ne doit pas bouger la Z differentielle")


T("le temps de montee se deduit de la bande",
  le_temps_de_montee_se_deduit_de_la_bande)


def sans_voisinage_il_ny_a_pas_de_couplage_et_ce_nest_pas_une_erreur():
    """UN DOCUMENT SANS VOISINAGE RESTE UN DOCUMENT VALIDE.

    Une page qui n'envoie pas de voisinage -- une version anterieure, un banc,
    un fichier ecrit a la main -- doit obtenir tout le reste : les impedances,
    la cascade, les discontinuites. Le couplage y est simplement vide, et la
    fiche le dira.
    """
    doc = _doc_couplage([_pis(0, 0, 25, 0, "SIG")], [])
    doc.pop("voisinage")
    r = _se.simuler(doc)
    assert r["couplage"]["paires"] == [], r["couplage"]["paires"]
    assert r["couplage"]["voisinage"] == 0
    assert r["ligne"]["z0_moyen"] > 0, "le reste du calcul a souffert"


T("sans voisinage, le reste du calcul tient",
  sans_voisinage_il_ny_a_pas_de_couplage_et_ce_nest_pas_une_erreur)


# ==========================================================================
# LA SCENE : TOUTES LES VOISINES DANS LA MEME SECTION
# --------------------------------------------------------------------------
# UNE PISTE ET SES DEUX VOISINES NE SONT PAS DEUX PAIRES. Resolues separement,
# chaque paire compterait le champ que la troisieme prend deja, et les deux
# couplages sortiraient trop grands. Elles entrent donc dans UNE matrice.
#
# ET LA MASSE COPLANAIRE Y EST, sous ses deux formes : le PLAN qui borde le
# groupe -- les deux pages mesurent son ecart sans voir les pistes, si bien
# qu'il borde le groupe et non la seule victime -- et la PISTE DE GARDE, un
# conducteur du net de reference qui longe, pose a zero volt.
# ==========================================================================

def _essai_scene(voisinage, gap=0.0, refs=("GND",), tr=150e-12):
    """La piste d'essai, son voisinage, et le couplage qui en sort."""
    doc = _doc_couplage([_pis(0, 0, 25, 0, "SIG")], voisinage)
    doc["geometry"]["objects"][0]["gap_left"] = gap
    doc["geometry"]["objects"][0]["gap_right"] = gap
    doc["reference_nets"] = list(refs)
    doc["analyse"]["temps_montee"] = tr
    return _se.simuler(doc)["couplage"]


print("\nLa scene couplee : plusieurs voisines, le plan et la garde")


def les_voisines_entrent_dans_une_seule_section():
    """DEUX VOISINES FONT UN PROBLEME A TROIS CONDUCTEURS, PAS DEUX A DEUX.

    Une seule section est resolue, elle porte les trois rubans, et la piste du
    milieu voit son impedance BAISSER -- deux voisines lui prennent du champ.
    Deux paires resolues separement ne le verraient pas.
    """
    c = _essai_scene([_pis(0, 0.5, 25, 0.5, "GAUCHE"),
                      _pis(0, -0.5, 25, -0.5, "DROITE")], gap=2.0)
    assert len(c["sections"]) == 1, "%d sections" % len(c["sections"])
    sec = c["sections"][0]
    assert len(sec["conducteurs"]) == 3, \
        "%d conducteurs dans la section" % len(sec["conducteurs"])
    assert len(c["paires"]) == 2, "%d longements" % len(c["paires"])

    # LES DEUX COTES SONT DISTINGUES, et par la position : « gauche » et
    # « droite » ne sont pas une etiquette, c'est le signe de x.
    cotes = sorted(f["cote"] for f in c["paires"])
    assert cotes == ["droite", "gauche"], cotes
    xs = sorted(round(d["x"], 4) for d in sec["conducteurs"])
    assert xs[0] < 0 < xs[2] and xs[1] == 0.0, xs

    # La piste du milieu, prise seule, serait a 57,6 ohms ; encadree, moins.
    seule = _essai_scene([_pis(0, 0.5, 25, 0.5, "GAUCHE")], gap=2.0)
    assert sec["z0_selection"] < seule["sections"][0]["z0_selection"], \
        "deux voisines ne font pas baisser Z0 : %.2f puis %.2f" \
        % (seule["sections"][0]["z0_selection"], sec["z0_selection"])


T("les voisines entrent dans une seule section",
  les_voisines_entrent_dans_une_seule_section)


def le_plan_coplanaire_borde_le_groupe():
    """L'ECART MESURE EST CELUI DE LA SELECTION ; LE PLAN BORDE LE GROUPE.

    Les deux pages sondent les PLANS sans voir les pistes : `gap_left` est donc
    la distance de la selection au plan de gauche MEME quand une voisine se
    trouve entre les deux. L'ecart du groupe est celui-la moins le cuivre
    ajoute de ce cote, et c'est ce qui rend la masse coplanaire recuperable
    sans rien mesurer de plus.
    """
    # Une voisine a gauche (axe a 0,5 mm), un plan mesure a 1,5 mm de part et
    # d'autre. A gauche le groupe s'est etendu de 0,5 mm : il reste 1,0 mm.
    c = _essai_scene([_pis(0, 0.5, 25, 0.5, "AGR")], gap=1.5)
    sec = c["sections"][0]
    proche(sec["ecart_g"], 1.0, 1e-6, "ecart du groupe cote voisine")
    proche(sec["ecart_d"], 1.5, 1e-6, "ecart du groupe cote libre")

    # ET IL COMPTE : le meme longement, plan serre contre plan lointain, ne
    # rend pas la meme Z differentielle. Le plan prend du champ au couple,
    # donc il baisse le mode impair.
    loin = _essai_scene([_pis(0, 0.5, 25, 0.5, "AGR")], gap=0.0)
    pres = _essai_scene([_pis(0, 0.5, 25, 0.5, "AGR")], gap=0.8)
    assert pres["paires"][0]["z_diff"] < loin["paires"][0]["z_diff"], (
        "le plan ne baisse pas Z_diff : %.2f contre %.2f"
        % (pres["paires"][0]["z_diff"], loin["paires"][0]["z_diff"]))
    # Sans plan a portee, l'ecart du groupe est nul et le calcul est majorant :
    # c'est la seule reserve qui reste, et elle se dit.
    assert loin["sections"][0]["ecart_g"] == 0.0, loin["sections"][0]


T("le plan coplanaire borde le groupe, pas la seule piste",
  le_plan_coplanaire_borde_le_groupe)


def une_piste_du_net_de_masse_est_une_garde():
    """UNE VOISINE DE MASSE N'EST PAS UNE VOISINE, C'EST UN BOUCLIER.

    Elle entre dans la section a ZERO VOLT -- elle occupe la place, elle prend
    du champ -- et elle n'a ni port, ni Z differentielle, ni bruit a elle. La
    prendre pour un agresseur afficherait une impedance differentielle entre un
    signal et la masse, et un NEXT que personne ne subit.

    CE QU'ELLE COUTE, et il faut le dire : elle fait BAISSER Z0 des deux
    signaux. On ne pose pas une garde sans revoir la largeur.
    """
    avec = _essai_scene([_pis(0, 0.70, 25, 0.70, "AGR"),
                         _pis(0, 0.35, 25, 0.35, "GND")], gap=2.0)
    sans = _essai_scene([_pis(0, 0.70, 25, 0.70, "AGR")], gap=2.0)

    sec = avec["sections"][0]
    assert sec["gardes"] == 1, "%d garde(s) posee(s)" % sec["gardes"]
    assert len(sec["conducteurs"]) == 3, sec["conducteurs"]
    gardes = [d for d in sec["conducteurs"] if d["garde"]]
    assert len(gardes) == 1 and gardes[0]["net"] == "GND", sec["conducteurs"]

    # LA GARDE N'A PAS DE LIGNE DE FICHE : un seul longement, celui du signal.
    assert len(avec["paires"]) == 1, \
        [f["net_voisin"] for f in avec["paires"]]
    assert avec["paires"][0]["net_voisin"] == "AGR"

    a = avec["paires"][0]["z_diff"]
    b = sans["paires"][0]["z_diff"]
    assert a < b, (
        "la garde ne baisse pas Z_diff : %.2f avec contre %.2f sans"
        % (a, b))
    assert sec["z0_selection"] < sans["sections"][0]["z0_selection"], \
        "une garde a zero volt ne fait pas baisser Z0"


T("une piste du net de masse est une garde, pas un agresseur",
  une_piste_du_net_de_masse_est_une_garde)


def z_diff_dans_un_bus_tient_les_autres_a_la_masse():
    """UNE PAIRE PRISE DANS UN BUS N'A PAS LA Z_DIFF DE LA PAIRE SEULE.

    La troisieme piste prend du champ au couple : sa Z differentielle baisse.
    La reduction est exacte -- les autres conducteurs tenus a zero volt, ce qui
    est la sous-matrice de Maxwell --, mais c'est une hypothese, et le panneau
    la dit.
    """
    seule = _essai_scene([_pis(0, 0.5, 25, 0.5, "AGR")], gap=0.0)
    bus = _essai_scene([_pis(0, 0.5, 25, 0.5, "AGR"),
                        _pis(0, -0.5, 25, -0.5, "TIERS")], gap=0.0)
    z_seule = seule["paires"][0]["z_diff"]
    z_bus = [f for f in bus["paires"] if f["net_voisin"] == "AGR"][0]["z_diff"]
    assert z_bus < z_seule, \
        "Z_diff ne baisse pas dans un bus : %.2f puis %.2f" % (z_seule, z_bus)
    assert abs(z_bus - z_seule) < 0.05 * z_seule, \
        "Z_diff s'effondre : %.2f contre %.2f" % (z_bus, z_seule)


T("Z_diff d'une paire dans un bus tient les autres a la masse",
  z_diff_dans_un_bus_tient_les_autres_a_la_masse)


def ce_qui_ne_tient_pas_dans_la_section_est_nomme():
    """UNE VOISINE QUI DISPARAIT SANS UN MOT SE LIT COMME UN COUPLAGE NUL.

    Deux nets qui passent tour a tour au meme endroit, chacun sur une moitie de
    la longueur, se retrouvent a la MEME abscisse moyenne : il n'y a de place
    que pour un. On pose le plus proche et l'on NOMME l'autre, avec la raison.
    """
    c = _essai_scene([_pis(0, 0.5, 12, 0.5, "A"),
                      _pis(13, 0.5, 25, 0.5, "B")], gap=2.0)
    sec = c["sections"][0]
    assert len(sec["conducteurs"]) == 2, sec["conducteurs"]
    assert len(sec["ecartes"]) == 1, sec["ecartes"]
    assert "chevauche" in sec["ecartes"][0]["raison"], sec["ecartes"]
    assert len(c["paires"]) == 1, [f["net_voisin"] for f in c["paires"]]


T("ce qui ne tient pas dans la section est nomme",
  ce_qui_ne_tient_pas_dans_la_section_est_nomme)


print("\nLa carte de chaleur du couplage")


def _essai_chaleur(objets, voisinage, paires=None, tr=25e-12, gap=2.0):
    """Une victime en PLUSIEURS troncons, et ce qui longe chacun d'eux."""
    doc = _doc_couplage(objets, voisinage, paires=paires)
    for o in doc["geometry"]["objects"]:
        o["gap_left"] = gap
        o["gap_right"] = gap
    doc["analyse"]["temps_montee"] = tr
    return _se.simuler(doc)["couplage"]


def _victime_a_ecart_variable():
    """Trois troncons de dix millimetres, l'agresseur se rapproche a chacun."""
    victime = [_pis(0, 0, 10, 0, "SIG"), _pis(10, 0, 20, 0, "SIG"),
               _pis(20, 0, 30, 0, "SIG")]
    voisinage = [_pis(0, 1.05, 10, 1.05, "AGR"),      # ecart 0,80
                 _pis(10, 0.65, 20, 0.65, "AGR"),     # ecart 0,40
                 _pis(20, 0.37, 30, 0.37, "AGR")]     # ecart 0,12
    return _essai_chaleur(victime, voisinage)


def la_chaleur_est_alignee_sur_les_troncons_envoyes():
    """LA CARTE SE LIT PAR LE RANG, comme les segments.

    C'est par cet alignement que la page retrouve le cuivre a peindre : un
    enregistrement de plus ou de moins, et elle peint la couleur d'un troncon
    sur son voisin.
    """
    c = _victime_a_ecart_variable()
    assert len(c["chaleur"]) == 3, "%d entrees" % len(c["chaleur"])
    assert all(x is not None for x in c["chaleur"]), c["chaleur"]

    # UN TRONCON QUI NE LONGE RIEN VAUT None, ET PAS ZERO : « rien ne couple
    # ici » et « je n'en sais rien » ne se peignent pas pareil.
    victime = [_pis(0, 0, 10, 0, "SIG"), _pis(10, 0, 20, 0, "SIG")]
    seul = _essai_chaleur(victime, [_pis(0, 0.65, 10, 0.65, "AGR")])
    assert seul["chaleur"][0] is not None, "le troncon qui longe n'est pas peint"
    assert seul["chaleur"][1] is None, \
        "un troncon qui ne longe rien porte une valeur : %s" % (
            seul["chaleur"][1],)


T("la chaleur est alignee sur les troncons envoyes",
  la_chaleur_est_alignee_sur_les_troncons_envoyes)


def la_z_diff_est_reprise_a_l_ecart_de_chaque_troncon():
    """« MA PAIRE EST-ELLE A 100 OHMS SUR TOUTE SA LONGUEUR ? »

    Le tableau repond par un chiffre, obtenu sur l'ecart moyen. La carte
    reprend chaque troncon a SON ecart -- et c'est la que se voit un
    ecartement qui derive.
    """
    paire = [_pis(0, 0, 10, 0, "USB_P"), _pis(10, 0, 20, 0, "USB_P")]
    vois = [_pis(0, 0.40, 10, 0.40, "USB_N"),         # ecart 0,15
            _pis(10, 0.65, 20, 0.65, "USB_N")]        # ecart 0,40
    c = _essai_chaleur(paire, vois, paires=[["USB_P", "USB_N"]])
    z = [x["z_diff"] for x in c["chaleur"]]
    assert all(v is not None for v in z), z
    assert z[1] > z[0], \
        "l'ecart double et Z_diff ne monte pas : %s" % z
    assert all(x["z_diff_net"] == "USB_N" for x in c["chaleur"]), c["chaleur"]
    assert all(x["z_diff_declare"] for x in c["chaleur"]), \
        "une paire declaree n'est pas signalee comme telle"

    # SANS PAIRE DECLAREE NI SUFFIXE, on peint quand meme -- la voisine la plus
    # proche -- et l'on DIT que ce n'en est pas une. Peindre du gris priverait
    # d'un renseignement juste ; le peindre en silence ferait croire a une
    # paire qui n'existe pas.
    quelconque = [_pis(0, 0, 10, 0, "CLK"), _pis(10, 0, 20, 0, "CLK")]
    v2 = [_pis(0, 0.40, 10, 0.40, "CLKB"), _pis(10, 0.65, 20, 0.65, "CLKB")]
    c2 = _essai_chaleur(quelconque, v2)
    assert c2["chaleur"][0]["z_diff"] is not None, "rien n'est peint"
    assert not c2["chaleur"][0]["z_diff_declare"], \
        "une voisine quelconque est donnee pour une paire declaree"

    # ET LA PAGE PEUT LA DECLARER : c'est le meme champ que celui de l'editeur,
    # et le serveur ne fait pas de difference.
    c3 = _essai_chaleur(quelconque, v2, paires=[["CLK", "CLKB"]])
    assert c3["chaleur"][0]["z_diff_declare"], \
        "une paire declaree a la main n'est pas reconnue"


T("la Z differentielle est reprise a l'ecart de chaque troncon",
  la_z_diff_est_reprise_a_l_ecart_de_chaque_troncon)


def deux_voisines_jointives_n_emportent_plus_la_section():
    """LE DEFAUT QUI FAISAIT PERDRE SIX LONGEMENTS POUR DEUX CONDUCTEURS.

    `ligne_mom` elargit chaque ruban de la correction de Wheeler avant de
    resoudre. Deux voisines separees de trente-sept microns de cuivre nu s'y
    rejoignent, et `_conducteurs_places` levait -- ce qui perdait TOUS les
    longements de la section, y compris ceux de voisines qui n'avaient rien a
    voir avec la collision. On mesure donc avant de poser, avec la meme
    correction, et l'on ecarte la voisine de trop EN LE DISANT.
    """
    # Six voisines ; N4 (a 1,187) et N2 (a 0,94) laissent 0,037 mm de cuivre
    # nu entre elles, moins que ce que l'epaisseur ajoute.
    voisinage = [_pis(0, y, 20, y, "N%d" % k) for k, y in
                 enumerate([0.42, -0.42, 0.94, -0.94, 1.227, -1.45])]
    c = _essai_chaleur([_pis(0, 0, 20, 0, "SIG")], voisinage)
    sec = c["sections"][0]
    assert not sec["raison"], \
        "la section entiere est perdue : %s" % sec["raison"]
    chiffres = [f for f in c["paires"] if not f["raison"]]
    assert len(chiffres) == 5, \
        "%d longements chiffres au lieu de 5" % len(chiffres)
    ecartes = sec["ecartes"]
    assert len(ecartes) == 1, ecartes
    assert ecartes[0]["net"] == "N4", ecartes
    assert "cuivre epaissi" in ecartes[0]["raison"], ecartes
    # ET LA RAISON PORTE LE CHIFFRE : « trop proches » sans dire de combien ne
    # se corrige pas sur un routage.
    assert "0.037" in ecartes[0]["raison"], ecartes[0]["raison"]


T("deux voisines jointives n'emportent plus la section",
  deux_voisines_jointives_n_emportent_plus_la_section)


def le_plafond_de_sections_locales_tient():
    """UNE CARTE PLATE PLUTOT QU'UN CALCUL SANS FIN.

    Une piste de cinquante troncons a cinquante ecarts differents demanderait
    cinquante resolutions de section. On plafonne, et au-dela l'on retombe sur
    le couplage moyen : la carte devient plate sur la fin, elle ne devient
    jamais fausse -- la somme vaut toujours le bruit de la fiche.
    """
    n = _se.MAX_SECTIONS_LOCALES + 8
    victime = [_pis(i, 0, i + 1, 0, "SIG") for i in range(n)]
    voisinage = [_pis(i, 0.35 + 0.03 * i, i + 1, 0.35 + 0.03 * i, "AGR")
                 for i in range(n)]
    c = _essai_chaleur(victime, voisinage)
    assert c["sections_locales"] <= _se.MAX_SECTIONS_LOCALES, \
        "%d resolutions locales" % c["sections_locales"]
    assert len([x for x in c["chaleur"] if x]) == n, \
        "tous les troncons ne sont pas peints"
    # ET AU-DELA DU PLAFOND, LA Z DIFFERENTIELLE MANQUE PLUTOT QUE DE
    # MENTIR : la cellule est peinte, sa geometrie est la, et son ohm est
    # None. Une valeur reprise d'un autre ecart serait un chiffre faux et
    # propre.
    chiffrees = [x for x in c["chaleur"] if x and x["z_diff"]]
    assert 0 < len(chiffrees) < n, (
        "%d troncons chiffres sur %d : le plafond ne mord pas"
        % (len(chiffrees), n))


T("le plafond de sections locales tient",
  le_plafond_de_sections_locales_tient)


def la_masse_interposee_entre_dans_la_section():
    """LE DEFAUT LE PLUS COUTEUX DE CETTE PAGE, ET IL ETAIT INVISIBLE.

    Les deux pages mesurent l'ecart de la SELECTION au cuivre de masse, cote
    par cote. Quand une voisine se trouve PLUS LOIN que la ou ce cuivre
    commence, il y a du plan entre les deux -- c'est le geste de routage le
    plus banal : on glisse une garde, ou du plan arrose cousu de vias, entre un
    signal rapide et son voisin.

    Or `_ecarts_masse_du_groupe` place la masse au BORD du groupe. Elle passait
    donc de l'autre cote de la voisine, l'ecart calcule devenait negatif, on le
    ramenait a zero -- et la section se resolvait comme DEUX PISTES FACE A FACE
    au-dessus du dielectrique nu, sans la masse qui, sur la carte, faisait tout
    le travail. Le couplage annonce etait celui d'un routage qu'on n'avait pas
    fait, et rien dans la fiche ne le disait.
    """
    # La selection porte de la masse a 0,2 mm de chaque bord ; la voisine est
    # a 2,0 mm : il y a donc 1,4 mm de cuivre de masse entre les deux.
    victime = _pis(0, 0, 20, 0, "SIG")
    victime["gap_left"] = victime["gap_right"] = 0.2
    voisine = _pis(0, 2.0, 20, 2.0, "AGR")
    voisine["gap_left"] = voisine["gap_right"] = 0.2
    doc = _doc_couplage([victime], [voisine])
    doc["analyse"]["temps_montee"] = 100e-12
    c = _se.simuler(doc)["couplage"]

    sec = c["sections"][0]
    gardes = [d for d in sec["conducteurs"] if d["garde"]]
    assert len(gardes) == 1, \
        "la masse interposee n'est pas posee : %s" % sec["conducteurs"]
    g = gardes[0]
    assert g["interposee"], \
        "elle est posee mais pas signalee comme deduite : %s" % g
    assert g["net"] == "GND", g
    # ELLE EST ENTRE LES DEUX, et elle occupe la place qui reste entre les deux
    # degagements : 2,0 - 0,105 - 0,2 - (0,105 + 0,2) = 1,39 mm, moins ce que
    # l'epaisseur du cuivre ajoutera.
    assert -2.0 < g["x"] < 0.0, "la garde n'est pas entre les deux : %s" % g
    assert 1.2 < g["largeur"] < 1.4, "largeur de garde : %s" % g["largeur"]

    # ET LES DEUX PISTES CESSENT DE SE VOIR. C'est tout l'objet : la masse
    # interposee prend le champ qu'elles se passaient, et cela se lit sur
    # la CAPACITE MUTUELLE -- la grandeur qui porte le couplage, et la
    # seule que ce test puisse lire maintenant que le bruit n'est plus
    # chiffre ici. Z_diff, elle, ne conclut rien : la garde baisse aussi
    # les deux Z0, et les deux effets se compensent en partie.
    doc_nu = _doc_couplage([_pis(0, 0, 20, 0, "SIG")],
                           [_pis(0, 2.0, 20, 2.0, "AGR")])
    doc_nu["analyse"]["temps_montee"] = 100e-12
    nu = _se.simuler(doc_nu)["couplage"]
    avec = abs(c["paires"][0]["c_mutuelle"])
    sans = abs(nu["paires"][0]["c_mutuelle"])
    assert avec < sans / 1.5, (
        "la masse interposee ne decouple pas : C_m %.4g contre %.4g"
        % (avec, sans))


T("la masse interposee entre dans la section",
  la_masse_interposee_entre_dans_la_section)


def rien_ne_s_interpose_quand_la_voisine_est_devant_la_masse():
    """LA VOISINE PLUS PROCHE QUE LA MASSE N'EST PAS PROTEGEE, et il ne faut
    surtout pas lui inventer un bouclier.

    C'est le cas ordinaire du bus serre : deux signaux cote a cote, le plan
    commence au-dela. Le modele d'avant etait juste dans ce cas-la, et il doit
    le rester -- une correction qui repare un cas en cassant l'autre n'est pas
    une correction.
    """
    victime = _pis(0, 0, 20, 0, "SIG")
    victime["gap_left"] = victime["gap_right"] = 0.6
    voisine = _pis(0, 0.5, 20, 0.5, "AGR")
    voisine["gap_left"] = voisine["gap_right"] = 0.6
    doc = _doc_couplage([victime], [voisine])
    c = _se.simuler(doc)["couplage"]
    sec = c["sections"][0]
    assert not [d for d in sec["conducteurs"] if d["garde"]], \
        "une garde est inventee entre deux pistes qui se touchent presque : %s" \
        % sec["conducteurs"]

    # ET SANS MASSE DU TOUT DE CE COTE, on n'en invente pas davantage : un
    # ecart nul veut dire « pas de plan a portee », pas « plan colle ».
    v2 = _pis(0, 0, 20, 0, "SIG")
    v2["gap_left"] = v2["gap_right"] = 0.0
    c2 = _se.simuler(_doc_couplage([v2], [_pis(0, 2.0, 20, 2.0, "AGR")]))
    assert not [d for d in c2["couplage"]["sections"][0]["conducteurs"]
                if d["garde"]], "une garde sort d'un ecart nul"


T("rien ne s'interpose quand la voisine est devant la masse",
  rien_ne_s_interpose_quand_la_voisine_est_devant_la_masse)


def la_garde_ne_coute_jamais_la_voisine_qu_elle_protege():
    """PERDRE LE LONGEMENT POUR AVOIR POSE SON BOUCLIER remplacerait une
    reponse fausse par une absence de reponse, ce qui n'est pas un progres.

    La garde est retrecie de ce que l'epaisseur du cuivre lui ajoutera, et si
    la voisine ne tient toujours pas apres, on retire la garde plutot que la
    voisine.
    """
    victime = _pis(0, 0, 20, 0, "SIG")
    victime["gap_left"] = victime["gap_right"] = 0.06
    voisine = _pis(0, 0.42, 20, 0.42, "AGR")
    voisine["gap_left"] = voisine["gap_right"] = 0.06
    doc = _doc_couplage([victime], [voisine])
    c = _se.simuler(doc)["couplage"]
    sec = c["sections"][0]
    assert not sec["raison"], "la section est perdue : %s" % sec["raison"]
    ports = [d for d in sec["conducteurs"] if not d["garde"]]
    assert len(ports) == 2, \
        "la voisine a ete perdue au profit de sa garde : %s" \
        % sec["conducteurs"]
    assert len(c["paires"]) == 1 and not c["paires"][0]["raison"], c["paires"]


T("la garde ne coute jamais la voisine qu'elle protege",
  la_garde_ne_coute_jamais_la_voisine_qu_elle_protege)


def l_ecart_de_la_voisine_se_lit_dans_SON_sens():
    """UNE VOISINE DESSINEE A REBOURS A SES DEUX ETIQUETTES ECHANGEES.

    Chaque troncon porte ses deux ecarts nommes dans SON sens de parcours. Pour
    savoir ou finit la masse interposee, il faut celui de la voisine qui REGARDE
    la selection -- et lire le mauvais bord poserait une garde de travers une
    piste sur deux, selon le sens ou le routeur l'a tracee.
    """
    victime = _pis(0, 0, 20, 0, "SIG")
    victime["gap_left"] = victime["gap_right"] = 0.2

    def largeur_garde(voisine):
        doc = _doc_couplage([victime], [voisine])
        sec = _se.simuler(doc)["couplage"]["sections"][0]
        g = [d for d in sec["conducteurs"] if d["garde"]]
        return g[0]["largeur"] if g else None

    # Meme piste, meme place, dessinee dans un sens puis dans l'autre. Ses
    # deux ecarts sont FRANCHEMENT differents : 0,2 mm d'un bord, 1,0 de
    # l'autre. Le modele doit lire le meme des deux dans les deux cas.
    droit = _pis(0, 2.0, 20, 2.0, "AGR")
    droit["gap_left"], droit["gap_right"] = 1.0, 0.2
    envers = _pis(20, 2.0, 0, 2.0, "AGR")
    envers["gap_left"], envers["gap_right"] = 0.2, 1.0

    a, b = largeur_garde(droit), largeur_garde(envers)
    assert a is not None and b is not None, (a, b)
    assert abs(a - b) < 1e-6, \
        "la meme piste dessinee a rebours donne une autre garde : %.4f puis" \
        " %.4f" % (a, b)


T("l'ecart de la voisine se lit dans SON sens",
  l_ecart_de_la_voisine_se_lit_dans_SON_sens)


# ==========================================================================
# CE QUE LA CARTE DE Z DIFFERENTIELLE PEINT, ET SUR QUELLE PAIRE
# --------------------------------------------------------------------------
# UNE PAIRE DECLAREE PASSE AVANT LA VOISINE LA PLUS PROCHE. La carte n'a
# qu'une Z differentielle par troncon, et il faut donc choisir de QUELLE
# paire elle parle. La declaration -- suffixes _P/_N, ou paire nommee par
# l'outil -- tranche ; a defaut on prend la plus proche ET ON LE DIT
# (`z_diff_declare` a faux), parce qu'un repli qui se donnerait pour une
# declaration ferait lire une Z differentielle de paire sur deux pistes
# qui n'en forment pas une.
# ==========================================================================

print("\nCe que la carte de Z differentielle peint")


def le_partenaire_declare_nest_pas_peint_comme_un_agresseur():
    """LE PARTENAIRE DECLARE SORT DE LA CARTE, ET LUI SEUL.

    Une paire nommee par ses suffixes -- USB_DP / USB_DN -- couple fort : la
    section rend une dizaine de pour cent de NEXT a 0,15 mm. Ce n'est pas du
    bruit sur USB_DP, c'est sa propre paire. La fiche garde la ligne, marquee ;
    la carte de chaleur, elle, ne doit rien lui compter, sans quoi le vrai
    agresseur d'a cote disparait sous la couleur.

    ET LA VOISINE ORDINAIRE RESTE COMPTEE : c'est la moitie de l'essai. Une
    exclusion qui emporterait aussi SPI_CLK ne serait pas une correction, ce
    serait un trou.
    """
    doc = _doc_couplage([_pis(0, 0, 25, 0, "USB_DP")],
                        [_pis(0, 0.4, 25, 0.4, "USB_DN"),
                         _pis(0, -0.65, 25, -0.65, "SPI_CLK")])
    doc["analyse"]["temps_montee"] = 150e-12
    c = _se.simuler(doc)["couplage"]

    par_net = {f["net_voisin"]: f for f in c["paires"]}
    assert par_net["USB_DN"]["differentielle"],         "USB_DP / USB_DN doit etre reconnue comme paire"
    assert par_net["USB_DN"]["z_diff"] > 0, (
        "la paire doit avoir une Z differentielle : %s"
        % par_net["USB_DN"])

    peints = [x for x in c["chaleur"] if x]
    assert peints, "la carte de chaleur est vide"
    cellule = peints[0]
    # LA Z DIFFERENTIELLE PEINTE EST CELLE DE LA PAIRE DECLAREE, et non
    # celle de la voisine la plus proche : c'est la declaration qui
    # tranche, pas la distance.
    assert cellule["z_diff"] and cellule["z_diff_declare"], (
        "la Z differentielle de la paire declaree doit etre sur la carte"
        )
    assert cellule["z_diff_net"] == "USB_DN", cellule["z_diff_net"]
    assert cellule["z_diff"] and cellule["z_diff_declare"],         "la Z differentielle de la paire declaree doit rester sur la carte"


T("le partenaire declare n'est pas peint comme un agresseur",
  le_partenaire_declare_nest_pas_peint_comme_un_agresseur)


def la_voisine_proche_non_declaree_reste_un_agresseur():
    """LE REPLI « LA PLUS PROCHE » NE FAIT PAS UNE PAIRE.

    `_chaleur_scene` retient la voisine la plus proche pour y peindre une Z
    differentielle, faute de paire declaree. C'est un renseignement utile, et
    ce n'est PAS une declaration : exclure son bruit ferait disparaitre en
    silence l'agresseur le plus serre de la carte, c'est-a-dire exactement
    celui qu'on cherche.
    """
    doc = _doc_couplage([_pis(0, 0, 25, 0, "SIG")],
                        [_pis(0, 0.4, 25, 0.4, "CLK")])
    doc["analyse"]["temps_montee"] = 150e-12
    c = _se.simuler(doc)["couplage"]
    f = c["paires"][0]
    assert not f["differentielle"], "SIG / CLK n'est pas une paire nommee"
    peints = [x for x in c["chaleur"] if x]
    # LE REPLI PEINT SA Z DIFFERENTIELLE, ET IL SE DIT REPLI.
    assert peints[0]["z_diff_net"] == "CLK", peints[0]
    assert not peints[0]["z_diff_declare"], (
        "le repli ne doit pas se donner pour une paire declaree")


T("la voisine proche non declaree reste un agresseur",
  la_voisine_proche_non_declaree_reste_un_agresseur)


# ==========================================================================
# LA COUTURE — UN CUIVRE NON COUSU NE BLINDE PAS, IL TRANSFERE
# --------------------------------------------------------------------------
# LE SEUL ENDROIT DE CETTE CHAINE OU LE DESSIN PEUT RASSURER A TORT. On voit du
# cuivre de masse entre deux pistes, on le croit protecteur -- et s'il n'est pas
# cousu au plan, il fait l'inverse : l'agresseur le charge, il porte cette
# charge sur toute sa longueur, et il la rend a la victime.
#
# CE QU'ON EPROUVE ICI :
#   1. la condition aux limites FLOTTANTE est bien l'inverse d'une garde --
#      charge nulle et potentiel libre, contre potentiel nul et charge libre ;
#   2. le resultat physique : cousue < sans garde < non cousue ;
#   3. le critere est une LONGUEUR D'ONDE, donc il suit le temps de montee ;
#   4. un outil qui n'envoie pas la couture ne voit pas tout son cuivre declare
#      flottant -- le repli est du bon cote.
# ==========================================================================

print("\nLa couture du cuivre de masse")


def un_conducteur_flottant_a_charge_nulle_et_potentiel_libre():
    """LA CONDITION AUX LIMITES, ET ELLE EST EXACTE.

    Un flottant n'a pas de ligne dans [C] -- on ne lui demande pas son
    impedance --, exactement comme une garde. Ce qui les separe est ce qu'on
    leur impose : la garde a un POTENTIEL nul et une charge libre, le flottant
    une CHARGE nulle et un potentiel libre.

    On verifie d'abord que la matrice a bien la taille des seuls PORTS, dans
    les deux cas : si le flottant y gardait une ligne, tout ce qui lit [C] par
    rang designerait la mauvaise piste.
    """
    def section(garde):
        c = [{"w": 0.25e-3, "x": -0.6e-3}, {"w": 0.25e-3, "x": 0.6e-3}]
        if garde:
            c.insert(1, dict({"w": 0.35e-3, "x": 0.0}, **garde))
        return solve_multiline({"kind": "microstrip", "h": 0.2e-3,
                                "epsilon_r": 4.3, "t": 35e-6,
                                "conducteurs": c,
                                "ecart_g": 0.5e-3, "ecart_d": 0.5e-3})

    for garde in ({"masse": True}, {"flottant": True}):
        r = section(garde)
        c = np.asarray(r["c"], dtype=float)
        assert c.shape == (2, 2), \
            "%s : la matrice doit n'avoir que les PORTS, pas %s" \
            % (garde, c.shape)
        assert len(r["lignes"]) == 2, "%s : %d lignes" % (garde,
                                                          len(r["lignes"]))


T("un conducteur flottant a charge nulle et potentiel libre",
  un_conducteur_flottant_a_charge_nulle_et_potentiel_libre)


def le_seuil_de_couture_suit_le_temps_de_montee():
    """LE CRITERE EST UNE LONGUEUR D'ONDE, PAS UN NOMBRE DE VIAS.

    Une couture tous les dix millimetres tient pour un front lent et ne tient
    plus pour un front rapide : c'est lambda/10 a la frequence du genou, donc
    proportionnel au temps de montee. Un seuil fixe en millimetres serait faux
    d'un facteur dix entre du 74HC et du LVDS.
    """
    lent = _se._couture_max(2e-9)
    rapide = _se._couture_max(100e-12)
    proche(lent / rapide, 20.0, 1e-9,
           "le seuil doit etre proportionnel au temps de montee")
    # Ordre de grandeur : 6,4 mm pour 150 ps sur stratifie courant.
    proche(_se._couture_max(150e-12), 6.43, 0.02, "seuil a 150 ps")


T("le seuil de couture suit le temps de montee",
  le_seuil_de_couture_suit_le_temps_de_montee)


def sans_mesure_de_couture_le_cuivre_reste_suppose_tenu():
    """LE REPLI EST DU BON COTE, et ce n'est pas un detail.

    Une page qui n'envoie pas la couture -- un outil plus ancien, un document
    ecrit a la main -- ne doit pas voir TOUT son cuivre de masse declare
    flottant : elle verrait le bruit doubler partout sans avoir rien change.
    Zero veut donc dire « pas mesure », et l'on suppose tenu.
    """
    def pis(y, net, w=0.25):
        return {"type": "track", "start": [0, y], "end": [25, y], "width": w,
                "layer": 0, "net": net, "copper_thickness": 0.035,
                "gap_left": 0.5, "gap_right": 0.5}
    doc = _doc_couplage([pis(0, "SIG")],
                        [pis(0.6, "GND", w=0.35), pis(1.2, "AGR")])
    doc["analyse"]["temps_montee"] = 150e-12
    r = _se.simuler(doc)
    gardes = [p for p in r["couplage"]["sections"][0]["conducteurs"]
              if p["garde"]]
    assert gardes and not gardes[0]["flottant"], \
        "sans mesure, le cuivre doit rester suppose TENU : %s" % (gardes,)
    assert not any("COUS" in a for a in (r.get("avertissements") or ())), \
        "et rien ne doit etre signale"


T("sans mesure de couture, le cuivre reste suppose tenu",
  sans_mesure_de_couture_le_cuivre_reste_suppose_tenu)


def le_plan_qui_borde_ne_compte_que_s_il_est_cousu():
    """LA MEME REGLE POUR LE PLAN ARROSE EXTERIEUR QUE POUR UNE GARDE.

    `_ecarts_masse_du_groupe` rendait l'ecart au cuivre lateral sans jamais
    regarder ses vias : le solveur posait donc ce plan a ZERO VOLT PARFAIT,
    qu'il porte une couture au millimetre ou aucune sur trente. Le defaut ne
    sortait qu'en texte -- les ohms et les decibels, eux, ne bougeaient pas,
    et c'est le chiffre qu'on lit.

    L'ecart du cote mal cousu est donc mis a ZERO, ce que `ligne_mom` lit
    « pas de masse coplanaire ici » : le calcul cesse de faire cadeau d'un
    blindage que la carte n'a pas. Un bord dont l'ecart etait DEJA nul -- le
    groupe s'etend au-dela du cuivre trouve par la sonde -- ne perd rien, et
    ne se compte pas.
    """
    def pis(y, net, couture=0.0, w=0.25):
        o = {"type": "track", "start": [0, y], "end": [25, y], "width": w,
             "layer": 0, "net": net, "copper_thickness": 0.035,
             "gap_left": 0.2, "gap_right": 0.2}
        if couture:
            o["couture_left"] = o["couture_right"] = couture
        return o

    def essai(couture):
        doc = _doc_couplage([pis(0, "SIG", couture)], [pis(0.5, "AGR")])
        doc["analyse"]["temps_montee"] = 100e-12
        return _se.simuler(doc)

    cousu = essai(0.4)
    nu = essai(30.0)
    sec_c = cousu["couplage"]["sections"][0]
    sec_n = nu["couplage"]["sections"][0]
    assert not sec_c["masse_non_cousue"], sec_c["masse_non_cousue"]
    # L'AGRESSEUR EST D'UN SEUL COTE : le groupe s'etend de ce cote-la, l'ecart
    # y etait deja nul, et c'est donc UN SEUL bord qui perd sa masse.
    assert sec_n["masse_non_cousue"] == ["droite"], sec_n["masse_non_cousue"]
    assert sec_c["ecart_d"] > 0 and sec_n["ecart_d"] == 0.0, \
        "l'ecart du bord mal cousu doit tomber a zero : %s -> %s" \
        % (sec_c["ecart_d"], sec_n["ecart_d"])
    z_c = cousu["couplage"]["paires"][0]["z_diff"]
    z_n = nu["couplage"]["paires"][0]["z_diff"]
    assert z_n > z_c, \
        "sans masse coplanaire a portee, la Z differentielle MONTE :" \
        " %.2f contre %.2f" % (z_n, z_c)
    assert any("PLAN ARROSÉ NON COUSU" in a
               for a in (nu.get("avertissements") or ())), \
        nu.get("avertissements")


T("le plan qui borde ne compte que s'il est cousu",
  le_plan_qui_borde_ne_compte_que_s_il_est_cousu)


print("\nCe que le calcul ne couvre pas")


def ce_que_le_calcul_ne_couvre_pas_est_rassemble_et_oriente():
    """LES MANQUES, EN UN SEUL ENDROIT, AVEC LEUR SENS.

    Chacun est deja dit plus haut, la ou il se produit : le couplage entre
    couches sous la regle d'appariement, la resonance sous la couture, les
    rebonds sous les terminaisons. Il faut donc lire les douze hypotheses pour
    se faire une idee de ce qui reste dehors, et personne ne le fait.

    ET LE SENS EST LE VRAI APPORT. Les QUATRE manques rendent le chiffre
    OPTIMISTE : ce qui est affiche est un PLANCHER sur une carte mal terminee,
    mal cousue, ou routee en parallele sur deux couches adossees. Cela ne se
    deduit d'aucune hypothese prise isolement, et c'est pourtant la seule chose
    qu'il faut savoir avant de signer.

    LE QUATRIEME A CHANGE DE NATURE, et le banc doit le suivre : le couplage
    entre couches etait « ABSENT, ni majore ni minore, simplement pas vu ». Il
    est desormais VU -- la geometrie est cherchee et rendue dans `superposes`
    -- sans etre chiffre, ce qui n'est pas la meme chose et n'a pas le meme
    sens. Un manque qu'on ne voit pas ne penche d'aucun cote ; un manque qu'on
    voit penche du cote rassurant, et il faut le dire.
    """
    doc = _doc_couplage([_pis(0, 0, 25, 0, "SIG")],
                        [_pis(0, 0.5, 25, 0.5, "AGR")])
    dits = _se.simuler(doc)["couplage"]["hypotheses"]
    cloture = [h for h in dits if "NE COUVRE PAS" in h]
    assert len(cloture) == 1,         "il faut UNE ligne de cloture, pas %d" % len(cloture)
    bloc = cloture[0]
    for attendu in ("RÉSONANCE", "COUPLAGE ENTRE"):
        assert attendu in bloc, "le bloc de cloture ne dit pas %r" % attendu
    assert bloc.count("OPTIMISTE") == 2, (
        "chaque manque doit dire dans quel sens il penche : %d fois"
        " OPTIMISTE" % bloc.count("OPTIMISTE"))
    assert "VU mais NON CHIFFRÉ" in bloc and "PLANCHER" in bloc, (
        "le bloc doit dire que le chiffre est un plancher, et que le couplage"
        " entre couches est vu sans etre chiffre : %s" % bloc)
    # ET C'EST LA DERNIERE : une cloture au milieu ne cloture rien.
    assert dits[-1] is bloc, "le bloc de cloture doit fermer la liste"


T("ce que le calcul ne couvre pas est rassemble, et oriente",
  ce_que_le_calcul_ne_couvre_pas_est_rassemble_et_oriente)


print("\n" + "-" * 62)
print("  %d cas, %s" % (ok + ko, "tous passes" if not ko else "%d en echec" % ko))
sys.exit(1 if ko else 0)
