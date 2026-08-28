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
                       green_spectral_micro, green_spectral_micro_couvert)

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

print("\n" + "-" * 62)
print("  %d cas, %s" % (ok + ko, "tous passes" if not ko else "%d en echec" % ko))
sys.exit(1 if ko else 0)
