#!/usr/bin/python3
# -*- coding: utf-8 -*-
"""Banc d'essai de la fonction de Green stratifiee et de son ajustement GPOF.

    python mom_solver/tests/banc_dcim.py

POURQUOI CE BANC EXISTE. `apply_dcim` posait ses images a la main : une serie
de Fresnel amortie par un « exp(-0,1 n) » qui ne venait d'aucun calcul, et sa
propre docstring l'admettait. Rien ne le contredisait, parce que rien ne le
mesurait -- `test_basic.py` verifie des imports et des dimensions de matrices,
pas des valeurs. Un noyau faux passait donc tous les essais du depot.

CE QUI EST EPROUVE ICI, du plus sur au plus construit :

  1. LE SPECTRE, contre des cas ou la reponse est connue d'avance -- dont un
     qui est EXACTEMENT soluble : un plan de masse dans l'air, ou le noyau vaut
     1 - exp(-2 j k_z h), c'est-a-dire deux images et pas une de plus.

  2. GPOF, contre une somme d'exponentielles FABRIQUEE : on connait les
     amplitudes et les exposants, on doit les retrouver.

  3. L'AJUSTEMENT, contre le spectre qu'il pretend approcher, sur les deux
     chemins. Necessaire, et LARGEMENT INSUFFISANT : la version fautive y
     tombait a 0,000 % en etant fausse de moitie partout ailleurs.

  4. LE DOMAINE SPATIAL, ou le solveur lira vraiment. Contre la reponse
     analytique quand elle existe, et contre une integrale de Sommerfeld
     calculee NUMERIQUEMENT sinon -- quadrature directe sur k_rho, sans image
     d'aucune sorte.

Pas de framework, un decompte a la fin, un code de retour -- comme les autres
bancs du depot.
"""

import os
import sys

import numpy as np
from scipy.optimize import brentq
from scipy.special import hankel2, j0

# LE PAQUET S'IMPORTE A PLAT. `mom_solver/__init__.py` tire tout le paquet d'un
# coup -- mesher, mom_engine, numba --, et ces modules s'importent entre eux
# SANS prefixe (« from mesher import ... »). On met donc mom_solver/ dans le
# chemin et on prend le module de Green seul : ce banc n'eprouve que lui, et
# n'a aucune raison d'exiger que le mailleur s'installe pour tourner.
_ICI = os.path.dirname(os.path.abspath(__file__))
_PAQUET = os.path.dirname(_ICI)
if _PAQUET not in sys.path:
    sys.path.insert(0, _PAQUET)

from green_layered import (                     # noqa: E402
    C_0, EPSILON_0, MU_0, NOYAUX_SPECTRAUX, ajuster_noyau, apply_dcim, gpof,
    green_spatial, green_spectral_q, green_spectral_te, green_spectral_tm,
    noyaux_green, poles_du_noyau, profil_spectral,
    _chemins, _kz, _poles_modaux, _residu_v, _v_plan_source,
    green_croise_q, green_croise_te, noyaux_croises, noyaux_multicouches,
    profil_croise, _impedance_vue, _transfert_tension, _v_entre_plans,
    green_spectral_zz, noyaux_verticaux, _reflexion_haut,
    _somme_ondes_surface,
)

OK = 0
KO = 0


def essai(nom):
    def deco(fn):
        global OK, KO
        try:
            fn()
            print("  ok  " + nom)
            OK += 1
        except Exception as exc:                # noqa: BLE001
            print("  KO  " + nom + " -> " + str(exc))
            KO += 1
        return fn
    return deco


def ecart(a, b):
    """Ecart relatif, en pourcentage, sur des complexes.

    UN NAN EST UN ECHEC, ET PAS UN ECART INCONNU. Sans cette ligne, une
    comparaison qui rend nan passe tous les seuils -- « nan > 5 » est faux --
    et le banc affiche vert en n'ayant rien verifie. C'est arrive pendant
    l'ecriture de ce fichier : l'etalon tombait sur le point de branchement,
    rendait nan, et les deux essais qui s'en servaient se declaraient reussis
    en affichant « nan % ».
    """
    if not (np.isfinite(a) and np.isfinite(b)):
        raise AssertionError("valeur non finie : %s contre %s" % (a, b))
    d = abs(b)
    return 100.0 * abs(a - b) / (d if d > 1e-300 else 1.0)


# --------------------------------------------------------------------------
# Les empilages de laboratoire
# --------------------------------------------------------------------------
def empilage(couches):
    """De (type, epaisseur_mm, er, tan_delta, role) a ce que le spectre lit."""
    out = []
    z = 0.0
    for t, e, er, df, role in couches:
        out.append({'index': len(out), 'type': t, 'thickness': e * 1e-3,
                    'epsilon_r': er, 'tan_delta': df, 'role': role,
                    'z_bottom': z * 1e-3, 'z_top': (z + e) * 1e-3})
        z += e
    return {'layers': out, 'total_height': z * 1e-3, 'num_layers': len(out)}


# LE CAS EXACTEMENT SOLUBLE, et c'est lui qui juge toute la chaine. Un plan de
# masse a la distance h, de l'air partout : le noyau vaut alors
#
#     F(k_rho) = 1 - exp(-2 j k_z h)
#
# c'est-a-dire DEUX IMAGES et pas une de plus -- la source, et son image a la
# profondeur 2h avec le signe oppose. Rien n'est approche la-dedans : ni le
# spectre, ni la transformee. Un ajustement qui ne retrouve pas ces deux
# images-la se trompe, et on sait de combien.
H_PEC = 0.370
PEC_AIR = empilage([
    ('copper', 0.035, 1.0, 0.0, 'plane'),
    ('dielectric', H_PEC, 1.0, 0.0, ''),
    ('copper', 0.035, 1.0, 0.0, 'signal'),
])

# Un microruban ordinaire : plan de masse, 0,37 mm de FR-4, la piste dessus.
MICRO = empilage([
    ('copper', 0.035, 1.0, 0.0, 'plane'),
    ('dielectric', 0.370, 4.37, 0.022, ''),
    ('copper', 0.035, 1.0, 0.0, 'signal'),
])

# Le meme, sans pertes : les etalons analytiques s'ecrivent sans tan delta.
MICRO_SP = empilage([
    ('copper', 0.035, 1.0, 0.0, 'plane'),
    ('dielectric', 0.370, 4.37, 0.0, ''),
    ('copper', 0.035, 1.0, 0.0, 'signal'),
])

# Deux milieux epais de part et d'autre : la limite evanescente y est celle de
# deux demi-espaces identiques, seule region ou l'air du dessus est invisible.
EPAIS = empilage([
    ('dielectric', 50.0, 4.37, 0.0, ''),
    ('copper', 0.035, 1.0, 0.0, 'signal'),
    ('dielectric', 50.0, 4.37, 0.0, ''),
])

F0 = 1e9


def microruban(h_mm, er=4.37, tan_d=0.022):
    """Un microruban a la demande : le pole d'onde de surface depend de h."""
    return empilage([
        ('copper', 0.035, 1.0, 0.0, 'plane'),
        ('dielectric', h_mm, er, tan_d, ''),
        ('copper', 0.035, 1.0, 0.0, 'signal'),
    ])


# ==========================================================================
# 1. LE SPECTRE, CONTRE CE QU'ON SAIT DEJA
# ==========================================================================
@essai("plan de masse dans l'air : le spectre vaut exactement 1 - exp(-2j kz h)")
def _():
    """L'essai le plus dur du banc, parce qu'il ne tolere rien : la reponse
    s'ecrit en une ligne et le calcul doit tomber dessus au chiffre pres."""
    h = H_PEC * 1e-3
    k = 2 * np.pi * F0 * np.sqrt(MU_0 * EPSILON_0)
    for kr in (0.0, 10.0, 100.0, 1e3, 1e4, 1e5):
        f = complex(green_spectral_tm(np.array([kr]), PEC_AIR, F0)[0])
        kz = complex(_kz(k, np.array([kr]))[0])
        attendu = 1.0 - np.exp(-2j * kz * h)
        if ecart(f, attendu) > 0.001:
            raise AssertionError("k_rho=%g : %s au lieu de %s"
                                 % (kr, f, attendu))


@essai("deux milieux epais : le noyau normalise vaut 1 dans l'evanescent")
def _():
    """La normalisation elle-meme : dans un milieu qui se prolonge des deux
    cotes, le noyau doit valoir 1. On l'eprouve la ou l'air du dessus ne se
    voit plus, c'est-a-dire dans l'evanescent."""
    for kr in (500.0, 5e3, 5e4):
        f = complex(green_spectral_tm(np.array([kr]), EPAIS, F0)[0])
        if ecart(f, 1.0) > 0.01:
            raise AssertionError("k_rho=%g : %s au lieu de 1" % (kr, f))


@essai("microruban : la limite evanescente est celle de l'image parfaite")
def _():
    """En k_rho grand la longueur d'onde ne compte plus : il ne reste que
    l'electrostatique, ou le noyau vaut 2 er th(k_rho h)/(er + th(k_rho h)).
    Verifiable a la main, et c'est ce qui fait que `ligne_mom` extrait un
    milieu moyen (1+er)/2 dans le meme cas."""
    er = 4.37
    h = 0.370e-3
    for kr in (2e4, 5e4, 1e5):
        f = complex(green_spectral_tm(np.array([kr]), MICRO_SP, F0)[0])
        th = np.tanh(kr * h)
        attendu = 2.0 * er * th / (er + th)
        if ecart(f, attendu) > 0.5:
            raise AssertionError("k_rho=%g : %s au lieu de %s"
                                 % (kr, f, attendu))


@essai("deux demi-espaces : la limite est 2 eps1/(eps1+eps2)")
def _():
    """La constante la plus connue du microruban."""
    er = 4.37
    demi = empilage([
        ('dielectric', 5.0, er, 0.0, ''),
        ('copper', 0.035, 1.0, 0.0, 'signal'),
        ('dielectric', 5.0, 1.0, 0.0, ''),
    ])
    f = complex(green_spectral_tm(np.array([2e5]), demi, F0)[0])
    attendu = 2.0 * er / (er + 1.0)
    if ecart(f, attendu) > 0.5:
        raise AssertionError("%s au lieu de %s" % (f, attendu))


@essai("le profil trouve le plan de masse par son role, et le milieu porteur")
def _():
    bas, haut, m_bas, m_haut, eps_ref, z_src = profil_spectral(MICRO)
    if not m_bas:
        raise AssertionError("le plan de masse du bas n'a pas ete vu")
    if m_haut:
        raise AssertionError("il n'y a pas de plan au-dessus")
    if abs(bas[0][0] - 0.370e-3) > 1e-9:
        raise AssertionError("epaisseur sous la piste : %s" % (bas[0][0],))
    if abs(eps_ref.real - 4.37) > 1e-9:
        raise AssertionError("le milieu de reference est le stratifie")


# ==========================================================================
# 1 bis. DEUX POTENTIELS, DEUX NOYAUX
# --------------------------------------------------------------------------
# `mom_engine` n'avait qu'UN noyau pour DEUX potentiels : la ligne TM servait
# le terme inductif autant que le terme capacitif. Ces essais mesurent ce que
# ca valait, et verifient les deux noyaux separement.
# ==========================================================================
@essai("milieu vraiment homogene : les TROIS noyaux valent exactement 1")
def _():
    """LA NORMALISATION, ET RIEN D'AUTRE. Un empilage ne peut pas etre
    homogene -- il y a toujours de l'air au-dessus d'une carte --, alors on
    fabrique le profil a la main : deux demi-espaces de meme permittivite, pas
    de plan de masse. La reponse est alors la fonction de Green de l'espace
    libre, donc F = 1 pour les trois, a la precision de la machine.

    C'est ce qui fixe les facteurs mu_0 et 1/eps du cote de `NoyauxGreen` : si
    cet essai passe, une image d'amplitude 1 a la profondeur 0 EST le terme
    direct, et pour les trois noyaux la meme chose.
    """
    eps = 4.37 + 0j
    profil = ([(0.0, eps)], [(0.0, eps)], False, False, eps, 0.0)
    omega = 2 * np.pi * F0

    for kr in (1.0, 30.0, 500.0, 5e3, 5e4):
        k_rho = np.array([kr])
        k_ref = omega * np.sqrt(MU_0 * EPSILON_0 * eps)
        kz = _kz(k_ref, k_rho)

        v_e = _v_plan_source(k_rho, omega, profil, 'tm')
        v_h = _v_plan_source(k_rho, omega, profil, 'te')

        f_tm = complex((2 * omega * EPSILON_0 * eps * v_e / kz)[0])
        f_te = complex((2 * kz * v_h / (omega * MU_0))[0])
        f_q = complex((2 * kz * EPSILON_0 * eps * omega
                       * (v_h - v_e) / k_rho ** 2)[0])

        for nom, f in (('tm', f_tm), ('te', f_te), ('q', f_q)):
            if ecart(f, 1.0) > 1e-6:
                raise AssertionError("k_rho=%g, noyau %s : %s au lieu de 1"
                                     % (kr, nom, f))


@essai("plan de masse dans l'air : les deux potentiels donnent 1 - exp(-2j kz h)")
def _():
    """LE CAS EXACTEMENT SOLUBLE, ETENDU AUX DEUX POTENTIELS. Dans l'air, les
    deux lignes voient la MEME geometrie -- un court-circuit a la distance h,
    un demi-espace adapte au-dessus -- et les deux impedances caracteristiques
    valent eta. Les deux noyaux tombent donc sur la meme expression, et c'est
    justement ce qui rend ce cas incapable de distinguer un noyau juste d'un
    noyau faux : c'est pour ca qu'il y a l'essai du microruban ci-dessous.
    """
    h = H_PEC * 1e-3
    k = 2 * np.pi * F0 * np.sqrt(MU_0 * EPSILON_0)
    for kr in (0.0, 10.0, 100.0, 1e3, 1e4, 1e5):
        kz = complex(_kz(k, np.array([kr]))[0])
        attendu = 1.0 - np.exp(-2j * kz * h)
        for nom, fonction in (('te', green_spectral_te),
                              ('q', green_spectral_q)):
            f = complex(fonction(np.array([kr]), PEC_AIR, F0)[0])
            # Le noyau du potentiel scalaire passe par une difference divisee
            # par k_rho^2 : en k_rho = 0 il est evalue sur un plancher, et les
            # 10^-6 annonces dans sa docstring sont ce qu'on lui accorde ici.
            seuil = 0.001 if nom == 'te' else 0.01
            if ecart(f, attendu) > seuil:
                raise AssertionError("k_rho=%g, noyau %s : %s au lieu de %s"
                                     % (kr, nom, f, attendu))


@essai("microruban : le potentiel vecteur tend vers 1, le scalaire vers 2er/(er+1)")
def _():
    """CE QUI SEPARE LES DEUX NOYAUX, ECRIT EN UNE LIGNE CHACUN.

    Le potentiel vecteur de tres pres vaut mu_0/(4 pi r), et le mu ne change
    pas d'une couche a l'autre : sa limite evanescente est 2 th(k_rho h)/(1 +
    th), donc 1. Le potentiel scalaire, lui, porte la permittivite : sa limite
    est 2 er th/(er + th), donc 2er/(er+1) = 1,6276 sur du FR-4. Le rapport
    entre les deux -- pres de 1,63 -- est l'ordre de grandeur de l'erreur que
    faisait le terme inductif en recevant le noyau du terme capacitif.
    """
    er = 4.37
    h = 0.370e-3
    for kr in (2e4, 5e4, 1e5):
        th = np.tanh(kr * h)
        f_te = complex(green_spectral_te(np.array([kr]), MICRO_SP, F0)[0])
        f_q = complex(green_spectral_q(np.array([kr]), MICRO_SP, F0)[0])
        if ecart(f_te, 2.0 * th / (1.0 + th)) > 0.5:
            raise AssertionError("k_rho=%g : potentiel vecteur %s" % (kr, f_te))
        if ecart(f_q, 2.0 * er * th / (er + th)) > 0.5:
            raise AssertionError("k_rho=%g : potentiel scalaire %s" % (kr, f_q))


@essai("le raccourci « G_q = ligne TM » : juste en statique, faux des que ca rayonne")
def _():
    """POURQUOI L'ANCIENNE VERSION DONNAIT UNE CAPACITE PLAUSIBLE, mesure.

    Le potentiel scalaire est la DIFFERENCE des deux lignes, pas la ligne TM.
    Mais le TE ne porte rien d'electrostatique : les deux ecritures coincident
    quand k_rho devient grand devant k. Cet essai borne l'ecart des deux cotes
    -- negligeable en evanescent profond, visible des que k_rho approche k --
    et c'est ce qui explique qu'un Z0 tire de la seule ligne TM tombait a peu
    pres juste tant qu'on restait quasi-statique.
    """
    proches, lointains = [], []
    for kr in (2e4, 1e5):
        a = complex(green_spectral_q(np.array([kr]), MICRO_SP, F0)[0])
        b = complex(green_spectral_tm(np.array([kr]), MICRO_SP, F0)[0])
        lointains.append((kr, ecart(a, b)))
    for kr in (100.0, 1e3):
        a = complex(green_spectral_q(np.array([kr]), MICRO_SP, F0)[0])
        b = complex(green_spectral_tm(np.array([kr]), MICRO_SP, F0)[0])
        proches.append((kr, ecart(a, b)))

    if max(e for _, e in lointains) > 0.01:
        raise AssertionError("en evanescent profond les deux devraient "
                             "coincider : %s" % (lointains,))
    if max(e for _, e in proches) < max(e for _, e in lointains):
        raise AssertionError("l'ecart devrait CROITRE vers le propagatif : "
                             "%s contre %s" % (proches, lointains))
    print("        (evanescent : %.4f %% ; propagatif : %.2f %%)"
          % (max(e for _, e in lointains), max(e for _, e in proches)))


@essai("le potentiel vecteur du microruban EST une paire d'images parfaites")
def _():
    """UN RESULTAT DE MANUEL, ET IL SERT DE CONTROLE. Le potentiel vecteur
    d'un courant horizontal au-dessus d'un plan de masse, c'est le courant et
    son image opposee : le mu ne varie pas, donc le stratifie ne reflechit
    rien pour ce mode-la -- seul le plan de masse le fait. L'ajustement du
    noyau 'a' sur du FR-4 doit donc rendre DEUX images, +1 a la profondeur 0
    et -1 a 2h, exactement comme dans l'air.

    Si cet essai tombe alors que le meme essai sur PEC_AIR passe, c'est que le
    noyau 'a' a recupere de la permittivite quelque part.
    """
    images = apply_dcim(MICRO, num_images=8, freq=F0, noyau='a')
    h2 = 2 * 0.370e-3

    direct = images[0]
    if abs(direct.position) > 1e-15 or ecart(direct.amplitude, 1.0) > 0.5:
        raise AssertionError("terme direct : %s a %s"
                             % (direct.amplitude, direct.position))

    autres = images[1:]
    miroir = min(autres, key=lambda im: abs(im.position - h2))
    if abs(miroir.position - h2) > 0.05 * h2:
        raise AssertionError("image miroir a %s m au lieu de %s"
                             % (miroir.position, h2))
    if ecart(miroir.amplitude, -1.0) > 2.0:
        raise AssertionError("amplitude miroir %s au lieu de -1"
                             % (miroir.amplitude,))
    parasites = [im for im in autres
                 if im is not miroir and abs(im.amplitude) > 0.05]
    if parasites:
        raise AssertionError("%d image(s) parasite(s) : %s"
                             % (len(parasites), [im.amplitude for im in parasites]))
    print("        (miroir %.5f a %.4f mm pour 2h = %.4f mm)"
          % (miroir.amplitude.real, miroir.position.real * 1e3, h2 * 1e3))


# ==========================================================================
# 2. GPOF, SUR UNE SOMME QU'ON A FABRIQUEE
# ==========================================================================
@essai("GPOF retrouve les amplitudes et les exposants qu'on lui a caches")
def _():
    vrais_c = np.array([1.0 + 0j, -0.4 + 0.2j, 0.05 - 0.1j])
    vrais_z = np.array([1.0 + 0j, 0.9 - 0.05j, 0.5 + 0.3j])
    n = 128
    y = sum(c * z ** np.arange(n) for c, z in zip(vrais_c, vrais_z))

    c, z = gpof(y, 3)
    for vc, vz in zip(vrais_c, vrais_z):
        i = int(np.argmin(np.abs(z - vz)))
        if ecart(z[i], vz) > 0.01:
            raise AssertionError("pole %s retrouve en %s" % (vz, z[i]))
        if ecart(c[i], vc) > 0.01:
            raise AssertionError("amplitude %s retrouvee en %s" % (vc, c[i]))


@essai("GPOF supporte le bruit sans fabriquer de poles absurdes")
def _():
    """La troncature aux valeurs singulieres dominantes est ce qui separe GPOF
    de Prony. On lui donne du bruit a un pour mille et on lui demande de ne pas
    le suivre."""
    rng = np.random.default_rng(20260828)
    vrais_z = np.array([1.0 + 0j, 0.85 - 0.1j])
    vrais_c = np.array([1.0 + 0j, 0.5 + 0j])
    n = 128
    y = sum(c * z ** np.arange(n) for c, z in zip(vrais_c, vrais_z))
    y = y + 1e-3 * (rng.standard_normal(n) + 1j * rng.standard_normal(n))

    c, z = gpof(y, 2)
    for vz in vrais_z:
        i = int(np.argmin(np.abs(z - vz)))
        if ecart(z[i], vz) > 1.0:
            raise AssertionError("pole %s retrouve en %s" % (vz, z[i]))


# ==========================================================================
# 3. L'AJUSTEMENT, CONTRE LE SPECTRE QU'IL APPROCHE
# ==========================================================================
@essai("les images rejouent le spectre sur les DEUX chemins d'ajustement")
def _():
    """Necessaire, et LARGEMENT INSUFFISANT : la version fautive y tombait a
    0,000 % en etant fausse de moitie dans le domaine spatial. C'est pourquoi
    cet essai n'est pas le dernier du fichier."""
    images = apply_dcim(MICRO, num_images=8, freq=F0)
    profil = profil_spectral(MICRO)
    chemins = _chemins(MICRO, F0, profil)

    for nom in ("loin", "proche"):
        kz, k_rho, _, _ = chemins[nom]
        exact = green_spectral_tm(k_rho, MICRO, F0, profil)
        ajuste = np.zeros_like(exact)
        for im in images:
            ajuste = ajuste + im.amplitude * np.exp(-1j * kz * im.position)
        pire = np.max(np.abs(ajuste - exact)) / np.max(np.abs(exact))
        if pire > 0.02:
            raise AssertionError("chemin « %s » : %.2f %% d'ecart"
                                 % (nom, 100 * pire))


@essai("l'ajustement retrouve les deux images exactes du plan de masse")
def _():
    """LA CHAINE ENTIERE, jugee sur le seul cas ou la reponse s'ecrit. GPOF
    doit rendre l'image directe d'amplitude 1 a la profondeur 0, et UNE image
    d'amplitude -1 a la profondeur 2h. Tout le reste serait du bruit ajuste."""
    images = apply_dcim(PEC_AIR, num_images=6, freq=F0)
    h2 = 2 * H_PEC * 1e-3

    direct = images[0]
    if abs(direct.position) > 1e-15 or ecart(direct.amplitude, 1.0) > 0.5:
        raise AssertionError("terme direct : %s a %s"
                             % (direct.amplitude, direct.position))

    autres = images[1:]
    if not autres:
        raise AssertionError("l'image miroir manque")
    miroir = min(autres, key=lambda im: abs(im.position - h2))
    if abs(miroir.position - h2) > 0.05 * h2:
        raise AssertionError("image miroir a %s m au lieu de %s"
                             % (miroir.position, h2))
    if ecart(miroir.amplitude, -1.0) > 2.0:
        raise AssertionError("amplitude miroir %s au lieu de -1"
                             % (miroir.amplitude,))
    # ET RIEN D'AUTRE DE SIGNIFICATIF : une troisieme image qui pese autant que
    # les deux vraies serait un pole parasite, exact sur le chemin et faux
    # partout ailleurs. C'est exactement le symptome qu'on a corrige.
    parasites = [im for im in autres
                 if im is not miroir and abs(im.amplitude) > 0.05]
    if parasites:
        raise AssertionError("%d image(s) parasite(s) : %s"
                             % (len(parasites),
                                [im.amplitude for im in parasites]))
    print("        (%d images, miroir %.4f a %.4f mm pour 2h = %.4f mm)"
          % (len(images), miroir.amplitude.real,
             miroir.position.real * 1e3, h2 * 1e3))


# ==========================================================================
# 3 bis. L'ONDE DE SURFACE, EXTRAITE
# --------------------------------------------------------------------------
# Un pole ne s'ajuste pas par une somme finie d'exponentielles. `apply_dcim`
# le laissait donc dans le residu, et le banc se contentait de BORNER l'ecart
# qui s'ensuivait. Il est maintenant localise, son residu pris, et rendu
# analytiquement en Hankel. Ces essais eprouvent les trois morceaux SEPAREMENT
# -- localisation, residu, transformee -- parce qu'un terme faux ajoute au bon
# endroit est pire que pas de terme du tout, et qu'un ecart global qui diminue
# ne prouve pas qu'un terme est juste.
# ==========================================================================
@essai("le pole tombe sur la relation de dispersion du manuel")
def _():
    """LA LOCALISATION, contre l'equation que tout le monde ecrit pour la lame
    dielectrique sur plan de masse :

        k_z1 tan(k_z1 h) = er alpha_0

    resolue ici par un Brent independant, sur la formule ecrite a la main. Le
    module, lui, cherche le zero de Z_bas + Z_haut sans savoir qu'il y a une
    lame : les deux doivent tomber au meme endroit.
    """
    for h_mm, f in ((0.370, 1e9), (1.600, 5e9), (3.000, 10e9)):
        st = microruban(h_mm, tan_d=0.0)
        h = h_mm * 1e-3
        omega = 2 * np.pi * f
        k0 = omega * np.sqrt(MU_0 * EPSILON_0)
        k1 = k0 * np.sqrt(4.37)

        def dispersion(kr):
            kz1 = np.sqrt(k1 ** 2 - kr ** 2)
            a0 = np.sqrt(kr ** 2 - k0 ** 2)
            return kz1 * np.tan(kz1 * h) - 4.37 * a0

        attendu = brentq(dispersion, k0 * (1 + 1e-12), k1 * (1 - 1e-9))

        poles = _poles_modaux(profil_spectral(st), omega, 'tm')
        if not poles:
            raise AssertionError("h=%.3f mm, %.0f GHz : aucun pole trouve"
                                 % (h_mm, f / 1e9))
        if ecart(poles[0].real, attendu) > 1e-6:
            raise AssertionError("h=%.3f mm : k_p = %.10f au lieu de %.10f"
                                 % (h_mm, poles[0].real, attendu))


@essai("le residu du pole contre sa forme fermee")
def _():
    """LE RESIDU, contre N/D' ECRIT A LA MAIN pour la lame sur plan de masse.

        D  = j (k_z1/(w e0 er)) tan(k_z1 h) + k_z0/(w e0)
        D' = -(k_rho/(w e0)) [ j(tan + k_z1 h sec^2)/(er k_z1) + 1/k_z0 ]

    Le module calcule D' en differences finies ; cet essai verifie qu'il tombe
    sur la derivee analytique. C'est ce qui fixe l'AMPLITUDE de l'onde de
    surface, et une amplitude fausse est invisible dans un ecart global qui
    diminue quand meme.
    """
    for h_mm, f in ((0.370, 1e9), (1.600, 10e9), (3.000, 10e9)):
        st = microruban(h_mm)
        er_c = 4.37 * (1 - 1j * 0.022)
        h = h_mm * 1e-3
        omega = 2 * np.pi * f
        profil = profil_spectral(st)
        k_p = _poles_modaux(profil, omega, 'tm')[0]

        k0 = omega * np.sqrt(MU_0 * EPSILON_0)
        k1 = omega * np.sqrt(MU_0 * EPSILON_0 * er_c)
        kz1 = complex(_kz(k1, np.array([k_p]))[0])
        kz0 = complex(_kz(k0, np.array([k_p]))[0])
        th = np.tan(kz1 * h)
        sec2 = 1.0 / np.cos(kz1 * h) ** 2

        num = (1j * (kz1 / (omega * EPSILON_0 * er_c)) * th) * (kz0 / (omega * EPSILON_0))
        dprime = -(k_p / (omega * EPSILON_0)) * (
            1j * (th + kz1 * h * sec2) / (er_c * kz1) + 1.0 / kz0)

        if ecart(_residu_v(k_p, omega, profil, 'tm'), num / dprime) > 0.01:
            raise AssertionError("h=%.3f mm : %s au lieu de %s"
                                 % (h_mm, _residu_v(k_p, omega, profil, 'tm'),
                                    num / dprime))


@essai("la transformee du pole EST un Hankel, verifie sur du purement rationnel")
def _():
    """LA TRANSFORMEE, SANS PHYSIQUE DEDANS. Ce qu'on retranche du spectre est
    une fraction rationnelle, et sa transformee de Hankel s'ecrit exactement :

        (1/2pi) integrale_0^inf 2 R k_p J0(k rho) k dk/(k^2 - k_p^2)
              = -(j/2) R k_p H_0^(2)(k_p rho)

    C'est le theoreme des residus, et rien d'autre : le contour se ferme dans
    le demi-plan inferieur parce que H_0^(2) y decroit, et le pole y est parce
    qu'une onde qui s'amortit a Im(k_p) < 0. On l'eprouve par quadrature
    directe -- H_0^(2) et non H_0^(1) est ce qui se joue ici, et une erreur de
    conjugue ne se verrait pas autrement.
    """
    r_test = 0.37 - 0.21j
    for k_p in (30.0 - 0.5j, 250.0 - 2.0j):
        for rho in (2e-3, 1e-2, 5e-2):
            bornes = [0.0, 0.5 * abs(k_p), 0.98 * abs(k_p), 1.02 * abs(k_p),
                      2 * abs(k_p), 10 * abs(k_p),
                      max(2000.0 / rho, 100 * abs(k_p))]
            total = 0.0 + 0j
            for p, q in zip(bornes[:-1], bornes[1:]):
                n = int(max(100000, (q - p) * rho / 0.002))
                k = p + (q - p) * (np.arange(n) + 0.5) / n
                total += np.sum(2.0 * r_test * k_p / (k ** 2 - k_p ** 2)
                                * j0(k * rho) * k) * (q - p) / n
            par_quadrature = total / (2 * np.pi)
            par_residu = -0.5j * r_test * k_p * hankel2(0, k_p * rho)
            if ecart(par_quadrature, par_residu) > 0.01:
                raise AssertionError("k_p=%s, rho=%g mm : %s au lieu de %s"
                                     % (k_p, rho * 1e3, par_quadrature,
                                        par_residu))


@essai("pas d'onde de surface la ou il n'y en a pas")
def _():
    """CE QUE LA RECHERCHE DOIT NE PAS TROUVER, ce qui compte autant.

      · dans l'air au-dessus d'un plan de masse, rien n'est plus dense que
        l'exterieur : aucun mode ne peut etre lie, et il n'y a pas de pole ;
      · le TE0 d'une lame a une coupure -- vers 110 GHz pour 0,37 mm de FR-4 --
        et en dessous il n'y a pas de pole TE. C'est ce qui autorise le noyau
        du potentiel vecteur a se passer d'extraction, et ce n'est pas suppose
        ici : c'est la recherche qui rend une liste vide.
    """
    omega = 2 * np.pi * F0
    if _poles_modaux(profil_spectral(PEC_AIR), omega, 'tm'):
        raise AssertionError("un pole dans l'air au-dessus d'un plan de masse")
    if _poles_modaux(profil_spectral(MICRO), omega, 'te'):
        raise AssertionError("un pole TE a 1 GHz, tres en dessous de la coupure")

    k_ref = omega * np.sqrt(MU_0 * EPSILON_0 * profil_spectral(MICRO)[4])
    if poles_du_noyau(profil_spectral(MICRO), omega, 'a', k_ref):
        raise AssertionError("le potentiel vecteur ne devrait porter aucun pole")
    if len(poles_du_noyau(profil_spectral(MICRO), omega, 'q', k_ref)) != 1:
        raise AssertionError("le potentiel scalaire devrait porter le seul TM0")


# ==========================================================================
# 4. LE DOMAINE SPATIAL, LA OU LE SOLVEUR LIRA
# ==========================================================================
def _milieux(a, b, n):
    """Les n points MILIEUX de [a, b] : aucune evaluation aux bornes."""
    pas = (b - a) / n
    return a + pas * (np.arange(n) + 0.5)


def c_infini(stackup, freq, h_min, noyau='tm'):
    """La constante du noyau en evanescent profond.

    Elle vaut 2 eps1/(eps1+eps2) pour le potentiel scalaire et pour la ligne
    TM ; elle vaut 1 pour le potentiel vecteur, parce que le mu ne change pas
    d'une couche a l'autre.
    """
    f = NOYAUX_SPECTRAUX[noyau]
    return complex(f(np.array([1e4 / h_min]), stackup, freq, None)[0])


def _morceau(integrande, p, q, sing, n):
    """L'integrale de `integrande` sur [p, q], avec une racine a desingulariser.

    UNE SINGULARITE EN 1/RACINE SE MANGE PAR UN CHANGEMENT DE VARIABLE, et pas
    par des points en plus. En posant k_rho = p + (q-p) s^2, le jacobien 2(q-p)s
    s'annule exactement contre le 1/racine(k_rho - p) : il ne reste rien de
    singulier a integrer, et la regle du point milieu retrouve sa precision.

    `sing` dit de quel cote est le point de branchement -- "p", "q", ou None
    quand l'intervalle est sain.
    """
    if q <= p:
        return 0.0 + 0j
    s = _milieux(0.0, 1.0, n)
    if sing == "p":
        k_rho = p + (q - p) * s ** 2
    elif sing == "q":
        k_rho = q - (q - p) * s ** 2
    else:
        k_rho = p + (q - p) * s
    jac = (2.0 * (q - p) * s) if sing else (q - p)
    return np.sum(integrande(k_rho) * jac) / n


def sommerfeld_numerique(rho, stackup, freq, noyau='tm'):
    """L'integrale de Sommerfeld, calculee sans aucune image.

        G(rho) = (1/2pi) integrale_0^inf  G_spectral(k_rho) J0(k_rho rho)
                                          k_rho dk_rho
        avec G_spectral = F/(2 j k_z)

    En milieu homogene l'identite de Sommerfeld en fait exp(-j k r)/(4 pi r),
    et c'est cette normalisation-la que `green_spectral_tm` respecte.

    DEUX PRECAUTIONS, ET LES DEUX ONT ETE PAYEES POUR :

      1. LA PARTIE ELECTROSTATIQUE EST SORTIE A LA MAIN. Le noyau tend vers une
         CONSTANTE c_inf en k_rho grand, donc l'integrande vers c_inf J0/2 :
         une integrale qui ne converge que conditionnellement, et qu'une
         troncature brutale rate de plusieurs pour cent. Elle se fait
         exactement -- integrale_0^inf J0(k x) dk = 1/x -- ce qui laisse un
         reste en 1/k_rho^2 que la quadrature avale sans peine.

      2. IL Y A DEUX POINTS DE BRANCHEMENT, PAS UN. k_z s'annule en k_rho = k
         pour CHAQUE milieu semi-infini du probleme : celui de l'air (k0) et
         celui du stratifie (k_ref). Le premier etalon n'en desingularisait
         qu'un -- ce qui explique qu'il tombait a 0,000 % sur le plan de masse
         dans l'air, ou les deux sont confondus, et se trompait de moitie sur
         le microruban, ou ils sont ecartes d'un facteur racine(er). On decoupe
         donc l'axe a chaque branchement et on substitue de part et d'autre.

    C'EST L'ETALON EXTERIEUR de ce banc : il ne partage avec `apply_dcim` ni
    chemin d'echantillonnage, ni ajustement, ni image. Il est lent, et c'est
    sans importance -- il ne tourne qu'ici.
    """
    profil = profil_spectral(stackup)
    eps_ref = profil[4]
    omega = 2 * np.pi * freq
    k_ref = omega * np.sqrt(MU_0 * EPSILON_0 * eps_ref)
    k_air = omega * np.sqrt(MU_0 * EPSILON_0)

    ep = [e for e, _ in (profil[0] + profil[1]) if e > 0]
    h_min = min(ep) if ep else 1e-3
    c_inf = c_infini(stackup, freq, h_min, noyau)
    fonction = NOYAUX_SPECTRAUX[noyau]

    def integrande(k_rho):
        kz = _kz(k_ref, k_rho)
        g = fonction(k_rho, stackup, freq, profil) / (2j * kz)
        return (g * k_rho - c_inf / 2) * j0(k_rho * rho)

    # Les deux branchements, dans l'ordre, et le milieu entre eux : chaque
    # sous-intervalle porte sa singularite a UNE seule de ses bornes.
    a, b = sorted((abs(k_air), abs(k_ref)))
    borne = max(50.0 / h_min, 200.0 / rho, 100.0 * abs(k_ref))
    n = 40000

    total = _morceau(integrande, 0.0, a, "q", n)
    if b > a * (1 + 1e-12):
        m = 0.5 * (a + b)
        total += _morceau(integrande, a, m, "p", n)
        total += _morceau(integrande, m, b, "q", n)
    total += _morceau(integrande, b, 2 * b, "p", n)

    # Au-dela, plus rien de singulier -- mais J0 oscille, et il faut assez de
    # points pour ne jamais le sous-echantillonner.
    n_loin = int(min(4_000_000, max(400_000, borne * rho / 0.005)))
    total += _morceau(integrande, 2 * b, borne, None, n_loin)

    return c_inf / (4 * np.pi * rho) + total / (2 * np.pi)


def deux_images_exactes(rho, freq):
    """La reponse analytique du plan de masse dans l'air : deux images.

        G = exp(-j k r0)/(4 pi r0) - exp(-j k r1)/(4 pi r1)
        avec r0 = rho et r1 = racine(rho^2 + 4 h^2)

    Elle tombe de F = 1 - exp(-2 j k_z h) par l'identite de Sommerfeld, sans la
    moindre approximation. C'est l'etalon le plus sur du banc.
    """
    h = H_PEC * 1e-3
    k = 2 * np.pi * freq * np.sqrt(MU_0 * EPSILON_0)
    r1 = np.sqrt(rho ** 2 + (2 * h) ** 2)
    return (np.exp(-1j * k * rho) / (4 * np.pi * rho)
            - np.exp(-1j * k * r1) / (4 * np.pi * r1))


@essai("l'etalon numerique retrouve la reponse analytique du plan de masse")
def _():
    """ON EPROUVE L'ETALON AVANT DE S'EN SERVIR. Un instrument non verifie ne
    juge personne -- et celui-ci s'est trompe de 83 % avant correction."""
    pires = []
    for rho in (0.2e-3, 1e-3, 5e-3, 20e-3):
        num = sommerfeld_numerique(rho, PEC_AIR, F0)
        exact = deux_images_exactes(rho, F0)
        e = ecart(num, exact)
        pires.append((rho, e))
        if e > 1.0:
            raise AssertionError("rho=%g mm : %.3f %% (%s contre %s)"
                                 % (rho * 1e3, e, num, exact))
    print("        (" + ", ".join("%.1f mm : %.3f %%" % (r * 1e3, e)
                                  for r, e in pires) + ")")


@essai("les images redonnent la reponse analytique dans le domaine spatial")
def _():
    """Le cas exactement soluble, lu ou le solveur le lira : en distance."""
    images = apply_dcim(PEC_AIR, num_images=6, freq=F0)
    pires = []
    for rho in (0.1e-3, 0.5e-3, 2e-3, 10e-3, 50e-3):
        par_images = green_spatial(rho, 0.0, 0.0, images, F0, PEC_AIR)
        exact = deux_images_exactes(rho, F0)
        e = ecart(par_images, exact)
        pires.append((rho, e))
        if e > 1.0:
            raise AssertionError("rho=%g mm : %.2f %% (%s contre %s)"
                                 % (rho * 1e3, e, par_images, exact))
    print("        (" + ", ".join("%.1f mm : %.3f %%" % (r * 1e3, e)
                                  for r, e in pires) + ")")


@essai("microruban FR-4 : les images suivent l'integrale en champ proche")
def _():
    """LE CAS REEL, juge contre la quadrature, dans le domaine ou le solveur
    s'en sert : les interactions entre panneaux d'un maillage. Sur une piste de
    quelques millimetres, toutes les distances utiles sont ici.

    LES TROIS NOYAUX Y PASSENT, parce qu'ils sont trois fonctions differentes
    et qu'un ajusteur juste sur l'une ne l'est pas d'office sur les autres. Le
    potentiel vecteur est le plus facile -- sa limite est 1, et le mu ne
    reflechit rien --, le potentiel scalaire le plus dur : c'est lui qui porte
    la constante 2 er/(er+1) et toute la serie d'images du stratifie.

    LES SEUILS SONT DONC DIFFERENTS, ET CHACUN EST MESURE, PAS CHOISI. Ce qui
    les separe est le point de branchement de l'AIR, celui du demi-espace
    superieur, que des exponentielles en k_z du SUBSTRAT ne savent pas rendre
    -- voir l'essai « le champ LOINTAIN decroche » qui l'isole. Il pese
    d'autant plus que le noyau pondere la region propagative, et le potentiel
    scalaire la pondere par un 1/k_rho^2.
    """
    seuils = {'a': 0.05, 'tm': 0.20, 'q': 1.00}
    for noyau in ('a', 'q', 'tm'):
        aj = ajuster_noyau(MICRO, F0, noyau, 8)
        pires = []
        for rho in (0.1e-3, 0.2e-3, 0.5e-3, 1e-3, 2e-3, 3e-3, 5e-3):
            par_images = complex(aj.valeur(rho))
            par_integrale = sommerfeld_numerique(rho, MICRO, F0, noyau)
            e = ecart(par_images, par_integrale)
            pires.append((rho, e))
            if e > seuils[noyau]:
                raise AssertionError(
                    "noyau %s, rho=%g mm : %.2f %% pour un seuil de %.2f %% "
                    "(%s contre %s)"
                    % (noyau, rho * 1e3, e, seuils[noyau], par_images,
                       par_integrale))
        print("        %-3s (" % noyau
              + ", ".join("%.1f mm : %.2f %%" % (r * 1e3, e) for r, e in pires)
              + ")")


@essai("sur un substrat qui guide, extraire le pole divise l'erreur")
def _():
    """CE QUE L'EXTRACTION APPORTE, MESURE DES DEUX COTES.

    Sur 0,37 mm de FR-4 a 1 GHz le TM0 est a peine lie -- n_eff = 1,000018 --
    et son residu est minuscule : l'extraction n'y change rien, et l'essai
    suivant dit ce qui reste vraiment. Il faut un substrat EPAIS et une
    frequence HAUTE pour que le mode porte quelque chose. On prend 3 mm de
    FR-4 a 10 GHz, ou n_eff = 1,222 : l'extraction doit alors ameliorer
    l'ecart, et pas de peu.
    """
    st = microruban(3.000)
    f = 10e9
    lam = C_0 / f
    mesures = []
    for rho in (0.5 * lam, 1.0 * lam):
        etalon = sommerfeld_numerique(rho, st, f, 'q')
        sans = ajuster_noyau(st, f, 'q', 8, None, extraire_poles=False)
        avec = ajuster_noyau(st, f, 'q', 8, None, extraire_poles=True)
        e_sans = ecart(complex(sans.valeur(rho)), etalon)
        e_avec = ecart(complex(avec.valeur(rho)), etalon)
        mesures.append((rho / lam, e_sans, e_avec))

    for part, e_sans, e_avec in mesures:
        if e_avec > e_sans / 2.0:
            raise AssertionError(
                "a %.2f lambda l'extraction ne divise pas l'erreur par deux : "
                "%.4f %% -> %.4f %%" % (part, e_sans, e_avec))
    print("        (" + ", ".join("%.1f lambda : %.4f %% -> %.4f %%"
                                  % m for m in mesures) + ")")


@essai("le champ LOINTAIN decroche, et ce n'est PAS l'onde de surface")
def _():
    """CE QUE CETTE DCIM NE FAIT TOUJOURS PAS -- ET LE COUPABLE A CHANGE.

    CE QUE DISAIT CETTE PAGE AVANT, et qui etait faux. « L'ecart lointain est
    l'onde de surface TM0, non extraite. » L'onde de surface est maintenant
    extraite -- pole localise a onze chiffres contre la relation de dispersion
    du manuel, residu verifie contre sa forme fermee, transformee verifiee sur
    du purement rationnel, trois essais ci-dessus. Et l'ecart n'a pas bouge :
    9,6 % a 10 mm avant, 9,6 % apres. Le raisonnement etait plausible, il
    n'avait simplement jamais ete mesure. A 1 GHz sur 0,37 mm de FR-4 le TM0 a
    n_eff = 1,000018 : il est a peine lie, et il ne porte rien.

    CE QUE C'EST VRAIMENT : LE SECOND POINT DE BRANCHEMENT. Il y en a deux dans
    ce probleme -- celui du substrat, en k_ref, et celui de l'air, en k_0. La
    DCIM ajuste des exponentielles en k_z DU SUBSTRAT : c'est exactement la
    bonne base pour le branchement de reference, et ce n'en est aucune pour
    l'autre. Ce qui en decoule dans le domaine spatial est l'onde laterale, qui
    decroit en 1/rho^2 -- plus vite que les images en 1/rho, plus lentement que
    ce qu'un ajustement fini peut suivre.

    ET C'EST MESURABLE, PARCE QUE LE CONTRASTE LE COMMANDE. Quand er tend vers
    1 les deux branchements se confondent, et l'ecart doit DISPARAITRE -- ce
    qui ne serait vrai d'aucune autre cause. C'est ce que cet essai verifie :
    le meme calcul, la meme distance, le seul er qui change.

        er = 1,0001  ->  0,005 % a 10 mm,  0,15 % a 30 mm
        er = 4,37    ->  9,6   % a 10 mm,  41   % a 30 mm

    A CES DISTANCES LE NOYAU VAUT SIX ORDRES DE GRANDEUR DE MOINS qu'en champ
    proche : sans consequence pour une matrice d'impedance, decisif pour un
    calcul de rayonnement. A faire, le jour ou quelqu'un demandera le
    rayonnement : un TROISIEME niveau de DCIM, dont le chemin
    d'echantillonnage est parametre en k_z DE L'AIR et non du substrat.
    """
    plat = microruban(0.370, er=1.0001)
    mesures = []
    for st, nom in ((plat, 'er=1'), (MICRO, 'er=4,37')):
        aj = ajuster_noyau(st, F0, 'q', 8)
        ligne = []
        for rho in (10e-3, 30e-3):
            e = ecart(complex(aj.valeur(rho)),
                      sommerfeld_numerique(rho, st, F0, 'q'))
            ligne.append((rho, e))
        mesures.append((nom, ligne))

    (_, sans_contraste), (_, avec_contraste) = mesures

    # 1. SANS CONTRASTE, PAS D'ECART : c'est la signature du branchement.
    if max(e for _, e in sans_contraste) > 0.5:
        raise AssertionError("a contraste nul l'ecart devrait s'annuler : %s"
                             % (sans_contraste,))
    # 2. AVEC CONTRASTE, L'ECART CROIT AVEC LA DISTANCE.
    if not (avec_contraste[0][1] < avec_contraste[1][1]):
        raise AssertionError("l'ecart ne croit pas avec la distance : %s"
                             % (avec_contraste,))
    # 3. ET IL RESTE BORNE la ou on l'a mesure. Si cet essai tombe, ce n'est
    #    plus la meme limitation -- c'est une regression.
    if avec_contraste[1][1] > 50.0:
        raise AssertionError("a 30 mm l'ecart passe a %.1f %%, ce n'est plus "
                             "le seul branchement" % (avec_contraste[1][1],))

    for nom, ligne in mesures:
        print("        %-8s (" % nom
              + ", ".join("%.0f mm : %.3f %%" % (r * 1e3, e) for r, e in ligne)
              + ")")


# ==========================================================================
# 5. `NoyauxGreen` : LES DEUX POTENTIELS AVEC LEURS UNITES
# --------------------------------------------------------------------------
# Ce que `mom_engine` recoit vraiment. Les essais precedents portent sur des F
# NORMALISES ; ici on verifie les facteurs physiques -- le mu_0 du potentiel
# vecteur, le 1/(eps_0 eps_ref) du potentiel scalaire -- parce qu'un facteur
# faux a cet endroit ne se voit nulle part ailleurs et se retrouve entier dans
# Z0 = racine(L/C).
# ==========================================================================
@essai("NoyauxGreen : G_A et G_q portent les bonnes constantes physiques")
def _():
    """CONTRE LA MAIN, sur le cas ou la reponse s'ecrit : plan de masse dans
    l'air. Le potentiel vecteur doit valoir mu_0 [1/(4 pi r0) - 1/(4 pi r1)] et
    le potentiel scalaire la meme chose divisee par eps_0 -- avec eps_ref = 1,
    puisqu'il n'y a que de l'air. On se place assez pres pour que la phase ne
    compte pas, et c'est le module qu'on juge.
    """
    n = noyaux_green(PEC_AIR, F0, num_images=6)
    if ecart(n.eps_ref, 1.0) > 1e-9:
        raise AssertionError("eps_ref = %s au lieu de 1" % (n.eps_ref,))

    h2 = 2 * H_PEC * 1e-3
    for rho in (0.1e-3, 0.2e-3, 0.5e-3):
        r1 = np.sqrt(rho ** 2 + h2 ** 2)
        paire = 1.0 / (4 * np.pi * rho) - 1.0 / (4 * np.pi * r1)

        g_a = complex(n.g_a(rho))
        g_q = complex(n.g_q(rho))

        if ecart(g_a, MU_0 * paire) > 0.5:
            raise AssertionError("rho=%g mm : G_A = %s au lieu de %s"
                                 % (rho * 1e3, g_a, MU_0 * paire))
        if ecart(g_q, paire / EPSILON_0) > 0.5:
            raise AssertionError("rho=%g mm : G_q = %s au lieu de %s"
                                 % (rho * 1e3, g_q, paire / EPSILON_0))


@essai("NoyauxGreen : le rapport des deux noyaux tend vers le milieu moyen")
def _():
    """LE CONTROLE QUI COMPTE POUR Z0, et il n'est valable qu'a UNE distance.

    Une ligne a Z0 = racine(L/C) : L vient de G_A, 1/C vient de G_q, donc c'est
    le RAPPORT des deux noyaux qui fixe l'impedance. En milieu homogene ce
    rapport vaut exactement c^2/er. TRES PRES de la source -- rho tres
    inferieur a h --, ni l'un ni l'autre ne voit encore le plan de masse, et le
    rapport doit rendre le MILIEU MOYEN du microruban :

        G_q/G_A -> c^2 / ((1+er)/2)

    ce (1+er)/2 = 2,685 etant precisement ce que `ligne_mom` extrait par un
    tout autre chemin, et ce que l'essai des asymptotes spectrales a deja vu
    sous la forme 2 er/(er+1). Les deux noyaux se rencontrent donc ici, et
    d'accord.

    AU-DELA DE h CE RAPPORT N'EST PLUS UNE PERMITTIVITE, et il ne faut pas le
    lire comme telle : le plan de masse annule le potentiel vecteur -- courant
    et image opposee -- bien plus vite qu'il n'annule le potentiel scalaire, et
    le quotient part vers l'infini. Mesure : 2,69 a rho/h = 0,014 ; 3,32 a
    rho/h = 1 ; 17,1 a rho/h = 8. La permittivite effective d'une LIGNE est une
    integrale sur la piste, pas un rapport en un point.

    L'ANCIEN CODE AVAIT CE RAPPORT CONSTANT ET EGAL A 1/(mu_0 eps_0 er_moyen)
    PAR CONSTRUCTION, puisque les deux termes lisaient le meme noyau : il ne
    pouvait RIEN dire de la permittivite effective, il la postulait.
    """
    n = noyaux_green(MICRO_SP, F0, num_images=8)
    moyen = (1.0 + 4.37) / 2.0
    mesures = []
    for rho in (5e-6, 1e-5, 2e-5, 5e-5):
        rapport = complex(n.g_q(rho)) / complex(n.g_a(rho))
        mesures.append((rho, (1.0 / (MU_0 * EPSILON_0 * rapport)).real))

    # 1. LA LIMITE : le point le plus proche doit tomber sur (1+er)/2.
    if ecart(mesures[0][1], moyen) > 0.5:
        raise AssertionError("rho/h = %.3f : %.4f au lieu de %.4f"
                             % (mesures[0][0] / 0.370e-3, mesures[0][1], moyen))
    # 2. LE SENS DE LA DERIVE : en s'eloignant, le plan de masse se fait voir
    #    du potentiel vecteur d'abord, donc le rapport CROIT. Un rapport qui
    #    baisserait voudrait dire que les deux noyaux sont echanges.
    for (r1, e1), (r2, e2) in zip(mesures[:-1], mesures[1:]):
        if not (e2 > e1):
            raise AssertionError("le rapport ne croit pas : %.4f a %g m puis "
                                 "%.4f a %g m" % (e1, r1, e2, r2))
    print("        ((1+er)/2 = %.4f ; " % moyen
          + ", ".join("rho/h=%.3f : %.4f" % (r / 0.370e-3, e)
                      for r, e in mesures) + ")")


# ==========================================================================
# 6. LE TROISIEME NIVEAU : LE BRANCHEMENT DE L'AIR
# --------------------------------------------------------------------------
# CE QU'IL Y AVAIT A REPARER, ET CE QUE CES ESSAIS VERROUILLENT. Le 3e niveau
# ajuste des exponentielles en k_z de l'AIR, parce que c'est la bonne base pour
# le second point de branchement. Trois choses le rendaient nuisible, et les
# trois etaient du meme genre -- deux bases confondues :
#
#   1. ses images etaient resommees avec le k du SUBSTRAT (`_somme_ondes` ne
#      connaissait qu'un seul nombre d'onde) ;
#   2. le reste a ajuster etait obtenu en evaluant les images des deux premiers
#      niveaux en k_z de l'AIR, alors qu'elles vivent en k_z du substrat ;
#   3. le garde-fou de portee, mesure en epaisseurs de stratifie, rejetait
#      TOUTES les images du branchement air -- dont l'echelle est la longueur
#      d'onde.
#
# LES TROIS ESSAIS CI-DESSOUS SONT COMPLEMENTAIRES. Le premier verifie que le
# niveau APPORTE quelque chose la ou il vise ; le deuxieme, qu'il n'ABIME rien
# ailleurs -- c'est celui-la qui tombait avant ; le troisieme regarde la
# structure de donnees elle-meme, parce qu'un groupe air VIDE se comporte
# exactement comme un niveau absent, sans que rien ne le dise.
# ==========================================================================
@essai("le 3e niveau DCIM divise l'erreur de champ lointain")
def _():
    """LA OU IL VISE, ET DE COMBIEN. Le branchement de l'air produit l'onde
    laterale, qui decroit en 1/rho^2 : elle ne pese rien en champ proche et
    domine le decrochage lointain. Les trois noyaux doivent y gagner, parce que
    la cause est geometrique et ne depend pas du potentiel qu'on regarde.

    ON N'EXIGE PAS L'ANNULATION, et ce serait faux de le faire : une somme
    finie d'exponentielles ne rend pas exactement une loi en 1/rho^2. On exige
    un sixieme de moins, ce que la reparation donne avec de la marge (mesure :
    9,59 % -> 6,19 % et 40,8 % -> 27,7 % sur le potentiel scalaire).
    """
    lignes = []
    for noyau in ('a', 'q', 'tm'):
        a2 = ajuster_noyau(MICRO, F0, noyau, 8, trois_niveaux=False)
        a3 = ajuster_noyau(MICRO, F0, noyau, 8, trois_niveaux=True)
        mesures = []
        for rho in (10e-3, 30e-3):
            etalon = sommerfeld_numerique(rho, MICRO, F0, noyau)
            e2 = ecart(complex(a2.valeur(rho)), etalon)
            e3 = ecart(complex(a3.valeur(rho)), etalon)
            mesures.append((rho, e2, e3))
            if e3 > 0.85 * e2:
                raise AssertionError(
                    "noyau %s a %g mm : le 3e niveau ne gagne rien "
                    "(%.3f %% -> %.3f %%)" % (noyau, rho * 1e3, e2, e3))
        lignes.append("%-3s (" % noyau
                      + ", ".join("%.0f mm : %.2f %% -> %.2f %%"
                                  % (r * 1e3, e2, e3) for r, e2, e3 in mesures)
                      + ")")
    for ligne in lignes:
        print("        " + ligne)


@essai("le 3e niveau n'abime ni le champ proche, ni le cas sans contraste")
def _():
    """L'ESSAI QUI TOMBAIT, ET QUI DESIGNAIT LA CAUSE. A contraste
    dielectrique nul les deux points de branchement se confondent : le 3e
    niveau n'a alors RIEN a corriger, et il doit rendre exactement ce que
    rendent les deux premiers. Quand ses images etaient resommees avec le
    mauvais nombre d'onde, elles ajoutaient un bruit COHERENT que rien ne
    compensait -- et c'est ici que ca se voyait, parce que c'est ici seulement
    que la bonne reponse est connue d'avance.

    ET LE CHAMP PROCHE AVEC, parce que c'est lui qui remplit la matrice
    d'impedance : un 3e niveau qui gagnerait au loin en perdant a 1 mm ne
    serait pas allumable du tout.
    """
    plat = microruban(0.370, er=1.0001)
    for noyau in ('a', 'q', 'tm'):
        a2 = ajuster_noyau(plat, F0, noyau, 8, trois_niveaux=False)
        a3 = ajuster_noyau(plat, F0, noyau, 8, trois_niveaux=True)
        for rho in (10e-3, 30e-3):
            etalon = sommerfeld_numerique(rho, plat, F0, noyau)
            e2 = ecart(complex(a2.valeur(rho)), etalon)
            e3 = ecart(complex(a3.valeur(rho)), etalon)
            if e3 > max(0.5, 1.5 * e2):
                raise AssertionError(
                    "sans contraste, noyau %s a %g mm : le 3e niveau degrade "
                    "(%.4f %% -> %.4f %%)" % (noyau, rho * 1e3, e2, e3))

    proches = []
    for noyau in ('a', 'q', 'tm'):
        a2 = ajuster_noyau(MICRO, F0, noyau, 8, trois_niveaux=False)
        a3 = ajuster_noyau(MICRO, F0, noyau, 8, trois_niveaux=True)
        for rho in (0.2e-3, 1e-3, 3e-3):
            etalon = sommerfeld_numerique(rho, MICRO, F0, noyau)
            e2 = ecart(complex(a2.valeur(rho)), etalon)
            e3 = ecart(complex(a3.valeur(rho)), etalon)
            proches.append((noyau, rho, e2, e3))
            if e3 > max(0.05, 1.5 * e2):
                raise AssertionError(
                    "champ proche, noyau %s a %g mm : %.4f %% -> %.4f %%"
                    % (noyau, rho * 1e3, e2, e3))
    print("        (champ proche, pire des 9 points : %.4f %% a 2 niveaux, "
          "%.4f %% a 3)" % (max(p[2] for p in proches),
                            max(p[3] for p in proches)))


@essai("chaque groupe d'images porte SON nombre d'onde")
def _():
    """LA STRUCTURE DE DONNEES, VERIFIEE POUR ELLE-MEME. C'est le champ
    `ComplexImage.k_onde` qui manquait, et son absence ne se voyait que par
    ses consequences. On regarde donc directement : a deux niveaux, aucune
    image ne porte de nombre d'onde propre -- toutes vivent en k_ref ; a trois,
    le groupe air en porte un, et c'est k_0.

    ET LE GROUPE AIR N'EST PAS VIDE, ce qui est l'autre moitie de la
    verification : le garde-fou de portee, laisse en epaisseurs de stratifie,
    les rejetait toutes, et le niveau ne posait alors pas une seule image --
    exactement le meme resultat qu'un niveau absent, sans que rien ne le dise.
    """
    omega = 2 * np.pi * F0
    k_0 = omega * np.sqrt(MU_0 * EPSILON_0)

    a2 = ajuster_noyau(MICRO, F0, 'q', 8, trois_niveaux=False)
    if any(im.k_onde is not None for im in a2.images):
        raise AssertionError("a deux niveaux, aucune image ne doit porter de "
                             "nombre d'onde propre")

    a3 = ajuster_noyau(MICRO, F0, 'q', 8, trois_niveaux=True)
    air = [im for im in a3.images if im.k_onde is not None]
    if not air:
        raise AssertionError("le groupe air est VIDE : le 3e niveau ne pose "
                             "aucune image, il ne fait donc rien")
    for im in air:
        if abs(im.k_onde - k_0) > 1e-9 * abs(k_0):
            raise AssertionError("une image du groupe air porte %s au lieu de "
                                 "k_0 = %s" % (im.k_onde, k_0))
    print("        (%d images substrat en k_ref, %d images air en k_0 ; "
          "profondeurs air de %.0f a %.0f mm)"
          % (len(a3.images) - len(air), len(air),
             min(abs(im.position) for im in air) * 1e3,
             max(abs(im.position) for im in air) * 1e3))


# ==========================================================================
# 7. DEUX COUCHES DE SIGNAL : LE NOYAU CROISE
# --------------------------------------------------------------------------
# CE QU'IL Y AVAIT A LA PLACE. `profils_noyaux_multiples` rendait un noyau
# croise qui etait, au bit pres, celui de la couche du bas : elle construisait
# un profil croise puis rappelait `noyaux_green(stackup, freq, n, z_src=z_i)`
# sans le lui passer. Rien ne le mesurait, donc rien ne le disait.
#
# CE QUI LE REMPLACE, ET POURQUOI C'EST VERIFIABLE. La fonction de Green entre
# deux plans n'est pas celle d'un empilage recolle : c'est la MEME ligne de
# transmission, avec la source a z' et l'observation a z. Trois choses s'en
# deduisent, et les trois se mesurent contre quelque chose qui ne vient pas du
# module :
#
#   · la RECIPROCITE. V_i(z,z') = V_i(z',z), alors que les deux calculs n'ont
#     rien en commun -- l'un part du bas, l'autre du haut ;
#   · la COHERENCE avec `_impedance_vue`. L'impedance que le transfert laisse
#     au plan source est celle que la cascade ordinaire donne sur la pile
#     entiere ;
#   · une FORME FERMEE. Deux plans de signal au-dessus d'un plan de masse dans
#     l'air : le spectre croise vaut exp(-j k_z (h2-h1)) - exp(-j k_z (h2+h1)),
#     soit deux images d'amplitude +1 et -1 aux profondeurs exactes. C'est
#     l'analogue croise du cas exactement soluble deja employe au 1.
# ==========================================================================

def _empilage_deux_signaux(er=4.3, h1=0.2e-3, h2=0.3e-3, ferme=False,
                           t_cu=35e-6):
    """Plan de masse, signal, dielectrique, signal -- et un second plan si `ferme`."""
    z = 0.0
    couches = []

    def cuivre(role):
        nonlocal z
        couches.append({'index': len(couches), 'type': 'copper',
                        'thickness': t_cu, 'epsilon_r': 1.0, 'tan_delta': 0.0,
                        'role': role, 'z_bottom': z, 'z_top': z + t_cu})
        z += t_cu

    def diel(e):
        nonlocal z
        couches.append({'index': len(couches), 'type': 'dielectric',
                        'thickness': e, 'epsilon_r': er, 'tan_delta': 0.0,
                        'role': '', 'z_bottom': z, 'z_top': z + e})
        z += e

    cuivre('plane')
    diel(h1)
    cuivre('signal')
    diel(h2)
    cuivre('signal')
    if ferme:
        diel(h1)
        cuivre('plane')
    return {'layers': couches}


@essai("la tension entre deux plans est reciproque, et recolle a la cascade")
def _():
    """LES DEUX INVARIANTS DU TRANSFERT, ET ILS SE SUFFISENT.

    La RECIPROCITE d'abord : V_i(z,z') = V_i(z',z). Les deux membres sont
    calcules par des chemins qui n'ont rien en commun -- l'un descend, l'autre
    monte, les terminaisons ne sont pas les memes -- et pourtant ils doivent
    coincider a la precision machine. C'est ce que le theoreme de reciprocite
    dit d'un milieu reciproque, et aucune erreur de cascade n'y survit.

    LA COHERENCE ensuite : l'impedance que `_transfert_tension` laisse au plan
    source, apres avoir traverse les couches intermediaires et charge la pile
    du haut, doit etre exactement celle que `_impedance_vue` calcule d'un coup
    sur la pile complete. Deux ecritures du meme circuit.
    """
    omega = 2 * np.pi * F0
    for nom, ferme in (("ouvert (microruban)", False),
                       ("ferme (triplaque)", True)):
        st = _empilage_deux_signaux(ferme=ferme)
        croise = profil_croise(st, 2, 4)
        if croise is None:
            raise AssertionError("%s : les deux couches devraient se voir" % nom)
        p_bas, p_haut, entre, eps_ref, _, _ = croise
        k_ref = omega * np.sqrt(MU_0 * EPSILON_0 * eps_ref)
        # ON EVITE k_rho = k_ref, ET IL FAUT LE DIRE. C'est le point de
        # branchement du milieu de reference : k_z y est nul, l'impedance TE
        # omega mu / k_z y diverge, et `_impedance_caracteristique` la plafonne
        # a un plancher numerique -- une valeur inventee, qui casse l'algebre
        # exacte des deux cotes de facon differente. La reciprocite y tombe a
        # 5.10^-2, et ce n'est pas une erreur de cascade : aucun chemin
        # d'echantillonnage de la DCIM n'y tombe non plus, par construction.
        # On l'encadre a un pour mille pres pour montrer que c'est le POINT et
        # rien de son voisinage.
        k_rho = np.concatenate([
            np.logspace(-1.0, 2.0, 13) * abs(k_ref) * 1.013,
            np.array([0.999, 1.001]) * abs(k_ref),
        ])

        for mode in ('tm', 'te'):
            aller = _v_entre_plans(k_rho, omega, p_bas, p_haut, entre, mode)
            # Le meme probleme retourne : les deux piles echangees, la liste
            # des milieux intermediaires lue a l'envers.
            retourne_bas = (p_haut[1], p_haut[0], p_haut[3], p_haut[2],
                            p_haut[4], p_haut[5])
            retourne_haut = (p_bas[1], p_bas[0], p_bas[3], p_bas[2],
                             p_bas[4], p_bas[5])
            retour = _v_entre_plans(k_rho, omega, retourne_bas, retourne_haut,
                                    list(reversed(entre)), mode)
            e = float(np.max(np.abs(aller - retour)
                             / np.maximum(np.abs(aller), 1e-300)))
            if e > 1e-10:
                raise AssertionError("%s, mode %s : reciprocite violee de %.3e"
                                     % (nom, mode, e))

        z_charge = _impedance_vue(k_rho, omega, p_haut[1], p_haut[3], 'tm')
        _, z_vue = _transfert_tension(k_rho, omega, entre, z_charge, 'tm')
        z_direct = _impedance_vue(k_rho, omega, p_bas[1], p_bas[3], 'tm')
        e = float(np.max(np.abs(z_vue - z_direct) / np.abs(z_direct)))
        if e > 1e-10:
            raise AssertionError("%s : le transfert ne redonne pas "
                                 "_impedance_vue (%.3e)" % (nom, e))
        print("        (%-20s reciprocite et cascade a mieux que 1e-10)" % nom)


@essai("le noyau croise, contre sa forme fermee dans l'air")
def _():
    """LE CAS EXACTEMENT SOLUBLE, VERSION CROISEE. Deux plans de signal a h1 et
    h2 au-dessus d'un plan de masse, tout en air : le spectre croise vaut

        exp(-j k_z (h2 - h1))  -  exp(-j k_z (h2 + h1))

    -- la source vue directement, et son image dans le plan. Deux
    exponentielles, donc DEUX images complexes et pas une de plus, aux
    profondeurs h2-h1 et h2+h1, d'amplitudes +1 et -1.

    ON VERIFIE LES DEUX BOUTS : le spectre contre la formule, et l'ajustement
    contre les images qu'on sait d'avance. Le second est le plus severe : GPOF
    n'a aucune raison de tomber sur exactement deux poles si le spectre qu'on
    lui donne n'est pas celui-la.
    """
    h1, h2 = 0.4e-3, 1.1e-3
    freq = 3e9
    st = _empilage_deux_signaux(er=1.0, h1=h1, h2=h2 - h1, t_cu=0.0)

    croise = profil_croise(st, 2, 4)
    omega = 2 * np.pi * freq
    k_0 = omega * np.sqrt(MU_0 * EPSILON_0)
    k_rho = np.concatenate([np.linspace(0.05, 0.95, 9) * k_0,
                            np.logspace(0.05, 2.0, 9) * k_0])
    kz = _kz(k_0, k_rho)
    exact = np.exp(-1j * kz * (h2 - h1)) - np.exp(-1j * kz * (h2 + h1))

    for nom, fonction in (('a', green_croise_te), ('q', green_croise_q)):
        v = fonction(k_rho, croise, freq)
        e = float(np.max(np.abs(v - exact)
                         / np.maximum(np.abs(exact), 1e-300)))
        if e > 1e-9:
            raise AssertionError("noyau croise %s : %.3e contre la forme "
                                 "fermee" % (nom, e))

    noyaux = noyaux_croises(st, freq, 2, 4, num_images=6)
    fortes = sorted((im for im in noyaux.ajust_a.images
                     if abs(im.amplitude) > 1e-6),
                    key=lambda im: abs(im.position))
    if len(fortes) != 2:
        raise AssertionError("%d image(s) d'amplitude notable au lieu de 2 : %s"
                             % (len(fortes),
                                [(im.amplitude, im.position) for im in fortes]))
    attendu = ((1.0, h2 - h1), (-1.0, h2 + h1))
    for im, (amp, prof) in zip(fortes, attendu):
        if abs(im.amplitude - amp) > 1e-4:
            raise AssertionError("amplitude %s au lieu de %+.0f"
                                 % (im.amplitude, amp))
        if abs(im.position - prof) > 1e-4 * prof:
            raise AssertionError("profondeur %s au lieu de %.6f mm"
                                 % (im.position, prof * 1e3))
    print("        (2 images : %+.6f a %.4f mm, %+.6f a %.4f mm ; "
          "attendu %+.0f a %.4f mm, %+.0f a %.4f mm)"
          % (fortes[0].amplitude.real, fortes[0].position.real * 1e3,
             fortes[1].amplitude.real, fortes[1].position.real * 1e3,
             1, (h2 - h1) * 1e3, -1, (h2 + h1) * 1e3))


@essai("un plan de masse entre deux signaux coupe le couplage, exactement")
def _():
    """CE QUE LE MODULE DOIT REFUSER DE CALCULER. Un plan de masse est une
    TERMINAISON : le champ ne le traverse pas, et deux couches de signal qu'il
    separe ne se voient pas du tout. Le noyau croise n'est alors pas petit, il
    est NUL -- et `noyaux_croises` doit rendre None pour que le moteur pose un
    bloc de zeros plutot qu'un couplage approche.

    L'ERREUR QUE CA EVITE. Un empilage a quatre couches, signal en 2 et en 6
    avec un plan en 4, calcule avec un noyau croise « quelconque » donnerait de
    la diaphonie entre deux pistes qui, physiquement, s'ignorent. C'est le
    genre de resultat plausible qu'on ne pense jamais a mettre en doute.
    """
    t = 35e-6
    h = 0.2e-3
    z = 0.0
    couches = []
    for typ, role, e in (('copper', 'plane', t), ('dielectric', '', h),
                         ('copper', 'signal', t), ('dielectric', '', h),
                         ('copper', 'plane', t), ('dielectric', '', h),
                         ('copper', 'signal', t)):
        couches.append({'index': len(couches), 'type': typ, 'thickness': e,
                        'epsilon_r': 4.3 if typ == 'dielectric' else 1.0,
                        'tan_delta': 0.0, 'role': role,
                        'z_bottom': z, 'z_top': z + e})
        z += e
    st = {'layers': couches}

    if profil_croise(st, 2, 6) is not None:
        raise AssertionError("le plan de masse en 4 devrait couper le couplage")
    if noyaux_croises(st, F0, 2, 6, num_images=4) is not None:
        raise AssertionError("noyaux_croises devrait rendre None")

    jeu = noyaux_multicouches(st, F0, num_images=4)
    if len(jeu) != 2:
        raise AssertionError("%d couche(s) de signal au lieu de 2" % len(jeu))
    if jeu.pour(2, 6) is not None:
        raise AssertionError("pour(2, 6) devrait rendre None")
    if jeu.pour(2, 2) is None or jeu.pour(6, 6) is None:
        raise AssertionError("les noyaux propres manquent")
    if jeu.pour(2, 2) is jeu.pour(6, 6):
        raise AssertionError("les deux couches partagent le meme noyau : le "
                             "multi-couches n'est pas branche")
    print("        (2 couches de signal, noyaux propres distincts, "
          "couplage croise nul)")


@essai("chaque couche de signal recoit SON noyau, et ce ne sont pas les memes")
def _():
    """CE QUE « BRANCHER LE MULTI-COUCHES » VEUT DIRE, MESURE. Deux couches de
    signal a des hauteurs differentes au-dessus du meme plan de masse n'ont pas
    la meme fonction de Green : celle du bas voit le plan de pres, celle du
    haut de loin. Si les deux noyaux propres se valaient, c'est que le moteur
    n'en aurait qu'un -- ce qui etait exactement le cas avant.

    ET LE CROISE N'EST NI L'UN NI L'AUTRE, ce qui est l'autre moitie : le
    leurre qu'on a retire rendait le noyau de la couche du bas.
    """
    st = _empilage_deux_signaux(h1=0.2e-3, h2=0.5e-3)
    jeu = noyaux_multicouches(st, F0, num_images=6)
    bas, haut = jeu.pour(2, 2), jeu.pour(4, 4)
    croise = jeu.pour(2, 4)

    rho = 1e-3
    v_bas = complex(bas.g_q(rho))
    v_haut = complex(haut.g_q(rho))
    v_croise = complex(croise.g_q(rho, dz=0.0))

    if ecart(v_haut, v_bas) < 1.0:
        raise AssertionError("les deux noyaux propres sont a %.3f %% l'un de "
                             "l'autre : une seule couche est vue"
                             % ecart(v_haut, v_bas))
    if ecart(v_croise, v_bas) < 1.0:
        raise AssertionError("le noyau croise vaut celui de la couche basse "
                             "(%.3f %%) : c'est l'ancien leurre"
                             % ecart(v_croise, v_bas))
    print("        (a 1 mm : G_q bas %.4e, haut %.4e, croise %.4e)"
          % (abs(v_bas), abs(v_haut), abs(v_croise)))


# ==========================================================================
# 8. LE COURANT VERTICAL : G_A^zz
# --------------------------------------------------------------------------
# CE QUE CE GROUPE VERROUILLE. Le noyau vertical est la brique du port de
# microruban, et c'est la seule fonction de Green du module dont le SIGNE peut
# etre faux sans que rien d'autre ne bouge : un dipole electrique vertical a
# une image de MEME signe dans un conducteur parfait, la ou un dipole
# horizontal en a une opposee. Un signe inverse rendrait un noyau parfaitement
# lisse, parfaitement plausible, et faux d'un facteur qui depend de la
# hauteur. L'essai « l'image du plan est POSITIVE » est donc le premier de la
# liste, et le plus important.
#
# LES QUATRE FAMILLES DE RAYONS sont l'autre chose a verrouiller. La forme
# fermee qu'on emploie -- deux amplitudes, quatre chemins geometriques -- n'est
# pas une approximation : c'est la somme exacte de la serie de rebonds entre le
# plan de masse et l'interface du haut. On la confronte a la cascade TLGF, qui
# ne partage avec elle aucune ligne de code, sur toute la grille des couples de
# profondeurs.
# ==========================================================================

def _microruban_zz(er=4.37, h_mm=0.370, t_cu=35e-6):
    """Le microruban du groupe vertical : plan, dielectrique, signal."""
    h = h_mm * 1e-3
    return {'layers': [
        {'index': 0, 'type': 'copper', 'thickness': t_cu, 'epsilon_r': 1.0,
         'tan_delta': 0.0, 'role': 'plane', 'z_bottom': 0.0, 'z_top': t_cu},
        {'index': 1, 'type': 'dielectric', 'thickness': h, 'epsilon_r': er,
         'tan_delta': 0.0, 'role': '', 'z_bottom': t_cu, 'z_top': t_cu + h},
        {'index': 2, 'type': 'copper', 'thickness': t_cu, 'epsilon_r': 1.0,
         'tan_delta': 0.0, 'role': 'signal', 'z_bottom': t_cu + h,
         'z_top': 2 * t_cu + h},
    ]}


@essai("l'image d'un courant VERTICAL dans le plan de masse est POSITIVE")
def _():
    """L'ESSAI QUI DISTINGUE UN SIGNE JUSTE D'UN SIGNE FAUX, et il n'y en a pas
    d'autre. Au-dessus d'un conducteur parfait dans l'air, le noyau du courant
    vertical vaut exactement

        exp(-j k_z |zeta - zeta'|)  +  exp(-j k_z (zeta + zeta'))

    -- la source vue directement, PLUS son image. Le noyau du courant
    horizontal, lui, porte un MOINS au meme endroit : `green_spectral_te` le
    verifie ailleurs dans ce banc, sur la meme geometrie.

    D'OU VIENT LA DIFFERENCE DE SIGNE, pour qui voudra la refaire : un courant
    vertical est une source de TENSION en serie sur la ligne TM, et un
    court-circuit reflechit les ondes de COURANT avec +1 quand il reflechit
    celles de TENSION avec -1.

    ON MESURE L'ECART AUX DEUX FORMULES, et pas seulement a la bonne : si un
    jour le signe se retourne, l'essai doit dire lequel des deux il a trouve.
    """
    h = 5e-3
    st = {'layers': [
        {'index': 0, 'type': 'copper', 'thickness': 0.0, 'epsilon_r': 1.0,
         'tan_delta': 0.0, 'role': 'plane', 'z_bottom': 0.0, 'z_top': 0.0},
        {'index': 1, 'type': 'dielectric', 'thickness': h, 'epsilon_r': 1.0,
         'tan_delta': 0.0, 'role': '', 'z_bottom': 0.0, 'z_top': h},
        {'index': 2, 'type': 'copper', 'thickness': 0.0, 'epsilon_r': 1.0,
         'tan_delta': 0.0, 'role': 'signal', 'z_bottom': h, 'z_top': h},
    ]}
    freq = 3e9
    omega = 2 * np.pi * freq
    k_0 = omega * np.sqrt(MU_0 * EPSILON_0)
    k_rho = np.concatenate([np.linspace(0.05, 0.95, 7) * k_0,
                            np.logspace(0.05, 2.0, 8) * k_0])
    kz = _kz(k_0, k_rho)

    mesures = []
    for zeta_s, zeta_o in ((0.2 * h, 0.2 * h), (0.2 * h, 0.7 * h),
                           (0.9 * h, 0.9 * h)):
        f = green_spectral_zz(k_rho, st, freq, zeta_s, zeta_o)
        d = abs(zeta_o - zeta_s)
        s = 2 * h - zeta_s - zeta_o          # profondeur -> altitude : l'image
        plus = np.exp(-1j * kz * d) + np.exp(-1j * kz * s)
        moins = np.exp(-1j * kz * d) - np.exp(-1j * kz * s)
        e_plus = float(np.max(np.abs(f - plus)
                              / np.maximum(np.abs(plus), 1e-300)))
        e_moins = float(np.max(np.abs(f - moins)
                               / np.maximum(np.abs(moins), 1e-300)))
        mesures.append((zeta_s / h, e_plus, e_moins))
        if e_plus > 1e-10:
            raise AssertionError(
                "zeta = %.2f h : le noyau vertical s'ecarte de %.2e de "
                "l'image POSITIVE (et de %.2e de la negative). Si le second "
                "chiffre est le petit, le signe s'est retourne."
                % (zeta_s / h, e_plus, e_moins))
    print("        (" + ", ".join("zeta=%.1fh : +%.0e / -%.0e" % m
                                  for m in mesures) + ")")


@essai("les quatre familles de rayons redonnent la cascade, partout")
def _():
    """LA FORME FERMEE CONTRE LA CASCADE, SUR TOUTE LA GRILLE. Le noyau
    vertical d'une lame entre un plan de masse et une interface se somme
    exactement :

        F = [e(-D) + e(-Sg) + Gt e(-St) + Gt e(-(2h-D))] / (1 - Gt e(-2h))

    quatre chemins, deux amplitudes, et rien d'approche -- c'est la serie
    geometrique des rebonds, fermee. `noyaux_verticaux` s'en sert pour
    n'ajuster QUE les deux amplitudes, une fois par frequence, et lire ensuite
    n'importe quel couple de profondeurs sans rien recalculer.

    L'ETALON EST LA CASCADE TLGF, qui descend les impedances couche par couche
    et ne connait aucune serie de rebonds. Les deux ne partagent que le
    coefficient de reflexion.

    ON BALAIE 49 COUPLES, bords compris -- zeta = 0 (sur la piste) et
    zeta = h (sur le plan de masse). Le bord bas est celui qui compte : c'est
    la que vivent les demi-RWG du port, et c'est la que `_impedance_vue`
    rendait l'impedance du VIDE au lieu de zero quand la pile devenait vide,
    ce qui faussait le noyau d'un facteur quatre.
    """
    st = _microruban_zz()
    freq = 1e9
    omega = 2 * np.pi * freq
    profil = profil_spectral(st)
    hauteur = sum(e for e, _ in profil[0] if e > 0)
    eps_1 = profil[0][0][1]
    k_ref = omega * np.sqrt(MU_0 * EPSILON_0 * eps_1)
    k_rho = np.concatenate([np.linspace(0.05, 0.95, 6) * abs(k_ref),
                            np.logspace(0.05, 3.0, 10) * abs(k_ref)])
    kz = _kz(k_ref, k_rho)
    gamma = _reflexion_haut(k_rho, omega, profil, eps_1)
    p = np.exp(-2j * kz * hauteur)

    pire = 0.0
    for zeta_s in np.linspace(0.0, hauteur, 7):
        for zeta_o in np.linspace(0.0, hauteur, 7):
            d = abs(zeta_s - zeta_o)
            sg = 2 * hauteur - zeta_s - zeta_o
            st_ = zeta_s + zeta_o
            rayons = ((np.exp(-1j * kz * d) + np.exp(-1j * kz * sg)
                       + gamma * np.exp(-1j * kz * st_)
                       + gamma * np.exp(-1j * kz * (2 * hauteur - d)))
                      / (1.0 - gamma * p))
            cascade = green_spectral_zz(k_rho, st, freq, zeta_s, zeta_o, profil)
            pire = max(pire, float(np.max(
                np.abs(rayons - cascade)
                / np.maximum(np.abs(cascade), 1e-300))))
    if pire > 1e-10:
        raise AssertionError("rayons contre cascade : %.3e" % pire)

    # La limite du coefficient de reflexion, qui n'est pas un detail : c'est
    # elle qui dit que la reflexion du haut vaut -0,63 et non quelque chose de
    # petit, donc qu'on ne pouvait pas la traiter comme un reste.
    attendu = (1.0 - eps_1.real) / (1.0 + eps_1.real)
    if abs(gamma[-1].real - attendu) > 1e-3:
        raise AssertionError("Gamma_t(infini) = %.4f au lieu de %.4f"
                             % (gamma[-1].real, attendu))
    print("        (49 couples de profondeurs : %.1e ; "
          "Gamma_t(infini) = %.4f)" % (pire, gamma[-1].real))


@essai("le noyau vertical ajuste suit l'integrale de Sommerfeld")
def _():
    """LE DOMAINE SPATIAL, la ou le moteur lit vraiment. L'etalon est la meme
    quadrature directe sur k_rho que pour les noyaux horizontaux, appliquee au
    spectre vertical : aucune image, aucun ajustement.

    LE SEUIL EST PLUS LARGE QUE POUR LES NOYAUX HORIZONTAUX, et c'est mesure,
    pas choisi. Les deux amplitudes M et O portent le branchement de l'AIR --
    le meme second point de branchement qui fait decrocher le champ lointain
    des noyaux horizontaux --, et l'ajustement plafonne autour du pour cent
    quel que soit le nombre d'images : 8, 12, 16 et 20 donnent 1,05 %, 0,99 %,
    1,06 % et 1,06 %. Ce n'est pas une resolution qui manque, c'est une base
    qui ne convient pas, exactement comme au 6.

    CE QUE CE POUR CENT COUTE : il porte sur le PORT, et le de-embarquement
    par deux longueurs retire le port. Ce qui reste dans le resultat
    de-embarque est la ligne, calculee par les noyaux horizontaux.
    """
    st = _microruban_zz()
    freq = 1e9
    profil = profil_spectral(st)
    hauteur = sum(e for e, _ in profil[0] if e > 0)
    eps_1 = profil[0][0][1]
    omega = 2 * np.pi * freq
    k_ref = omega * np.sqrt(MU_0 * EPSILON_0 * eps_1)
    k_air = omega * np.sqrt(MU_0 * EPSILON_0)

    def sommerfeld_zz(rho, zeta_s, zeta_o):
        def integrande(k_rho):
            kz = _kz(k_ref, k_rho)
            g = green_spectral_zz(k_rho, st, freq, zeta_s, zeta_o,
                                  profil) / (2j * kz)
            return g * k_rho * j0(k_rho * rho)
        a, b = sorted((abs(k_air), abs(k_ref)))
        borne = max(2e5, 400.0 / rho, 200 * abs(k_ref))
        n = 60000
        total = _morceau(integrande, 0.0, a, "q", n)
        if b > a * (1 + 1e-12):
            m = 0.5 * (a + b)
            total += _morceau(integrande, a, m, "p", n)
            total += _morceau(integrande, m, b, "q", n)
        total += _morceau(integrande, b, 2 * b, "p", n)
        n_loin = int(min(4_000_000, max(600_000, borne * rho / 0.004)))
        total += _morceau(integrande, 2 * b, borne, None, n_loin)
        return total / (2 * np.pi)

    noyau = noyaux_verticaux(st, freq, num_images=8)

    # L'AMPLITUDE DU TERME SINGULIER EST UN, ET C'EST VERIFIABLE. De tres pres,
    # le potentiel vecteur vaut mu_0 J/(4 pi R) quel que soit le milieu : le mu
    # ne change pas d'une couche a l'autre. C'est ce que la desingularisation
    # polaire du moteur suppose, et si l'ajustement s'en ecartait, les deux
    # moities de l'integrale ne se recolleraient plus.
    amp = complex(noyau.amplitude_directe_zz / MU_0)
    if abs(amp - 1.0) > 1e-3:
        raise AssertionError("l'amplitude du terme singulier vaut %s, pas 1"
                             % amp)

    pires = []
    for zeta_s, zeta_o in ((0.25 * hauteur, 0.25 * hauteur),
                           (0.25 * hauteur, 0.75 * hauteur),
                           (hauteur, hauteur), (0.0, hauteur)):
        for rho in (0.05e-3, 0.2e-3, 1e-3):
            par_images = complex(noyau.g_a_zz(rho, zeta_s, zeta_o)) / MU_0
            par_integrale = sommerfeld_zz(rho, zeta_s, zeta_o)
            e = ecart(par_images, par_integrale)
            pires.append(e)
            if e > 3.0:
                raise AssertionError(
                    "zeta = (%.2f, %.2f) h, rho = %g mm : %.3f %%"
                    % (zeta_s / hauteur, zeta_o / hauteur, rho * 1e3, e))
    print("        (12 points : pire %.3f %%, median %.3f %% ; "
          "amplitude singuliere %.6f)"
          % (max(pires), float(np.median(pires)), amp.real))


@essai("deux dielectriques differents sous la piste : on refuse plutot")
def _():
    """CE QUE LE MODULE DOIT REFUSER DE CALCULER. La decomposition en quatre
    familles suppose UNE lame homogene entre le plan de masse et la piste.
    Deux dielectriques empiles y ajoutent une interface, donc deux familles de
    plus, et la forme fermee ne vaut plus.

    ON LEVE PLUTOT QUE D'APPROCHER, parce qu'une approximation silencieuse a
    cet endroit rendrait un port plausible et faux -- et un port faux
    contamine tout ce qui en sort, y compris le resultat de-embarque quand
    l'approximation n'est pas la meme sur les deux longueurs.
    """
    t = 35e-6
    z = 0.0
    couches = []
    for typ, role, e, er in (('copper', 'plane', t, 1.0),
                             ('dielectric', '', 0.2e-3, 4.3),
                             ('dielectric', '', 0.2e-3, 3.0),
                             ('copper', 'signal', t, 1.0)):
        couches.append({'index': len(couches), 'type': typ, 'thickness': e,
                        'epsilon_r': er, 'tan_delta': 0.0, 'role': role,
                        'z_bottom': z, 'z_top': z + e})
        z += e
    try:
        noyaux_verticaux({'layers': couches}, 1e9, num_images=6)
    except NotImplementedError as exc:
        print("        (refus explicite : %s...)" % str(exc)[:58])
        return
    raise AssertionError("deux dielectriques differents ont ete acceptes en "
                         "silence")


@essai("la somme d'ondes vectorisee est la meme somme, image par image")
def _():
    """UNE OPTIMISATION QUI CHANGE UN CHIFFRE N'EN EST PAS UNE.

    `_somme_ondes` etait la moitie du temps d'assemblage -- dix secondes sur
    vingt pour 269 fonctions de base --, et pas parce que le calcul est lourd :
    parce qu'il etait fait IMAGE PAR IMAGE, en une poignee d'operations numpy
    sur des tableaux de quarante-neuf nombres. Le cout etait celui des appels.
    Range en tableaux (points x images), la somme entiere devient trois
    operations, et l'assemblage passe de 20,4 s a 5,0 s -- un facteur quatre.

    CE N'EST PAS UNE TABULATION, et c'est le point de cet essai. La piste
    envisagee etait d'echantillonner les noyaux sur une grille de rho et
    d'interpoler ; elle aurait demande sa propre etude d'erreur. Celle-ci n'en
    demande aucune : c'est la meme somme, ecrite autrement. On le VERIFIE
    quand meme, contre une boucle naive ecrite ici et nulle part ailleurs,
    parce que « c'est la meme formule » est exactement ce qu'on dit avant de
    decouvrir que non.

    LE SEUIL EST CELUI DE L'ARITHMETIQUE FLOTTANTE, pas de la physique :
    l'ordre des additions change, donc les derniers bits aussi.
    """
    def somme_naive(images, k_ref, rho, dz=0.0):
        rho = np.asarray(rho, dtype=float)
        total = np.zeros(rho.shape, dtype=complex)
        for im in images:
            k = k_ref if im.k_onde is None else im.k_onde
            d = im.position + dz
            r = np.sqrt(rho ** 2 + d ** 2 + 0j)
            r = np.where(np.real(r) < 0, -r, r)
            r = np.where(np.abs(r) < 1e-15, 1e-15, r)
            total = total + im.amplitude * np.exp(-1j * k * r) / (4 * np.pi * r)
        return total

    rho = np.logspace(-5, -2, 11).reshape(11, 1) * np.ones((1, 5))
    dz = np.linspace(-0.5e-3, 0.5e-3, 5)[None, :] * np.ones((11, 1))

    pires = []
    for noyau in ('a', 'q', 'tm'):
        for trois in (False, True):
            aj = ajuster_noyau(MICRO, F0, noyau, 8, trois_niveaux=trois)
            for decalage in (0.0, dz):
                vite = aj.valeur(rho, decalage)
                lent = somme_naive(aj.images, aj.k_ref, rho, decalage)
                if aj.poles:
                    lent = lent + _somme_ondes_surface(aj.poles, rho)
                e = float(np.max(np.abs(vite - lent)
                                 / np.maximum(np.abs(lent), 1e-300)))
                pires.append(e)
                if e > 1e-12:
                    raise AssertionError(
                        "noyau %s (%d niveaux) : la somme vectorisee s'ecarte "
                        "de %.3e de la somme image par image"
                        % (noyau, 3 if trois else 2, e))

    # ET LE RESTE AUSSI, parce que c'est lui que le moteur emploie sur les
    # panneaux voisins -- ceux qui portent l'essentiel de la matrice.
    aj = ajuster_noyau(MICRO, F0, 'q', 8)
    vite = aj.valeur_reste(rho, dz)
    lent = somme_naive(aj.images_ecartees, aj.k_ref, rho, dz)
    if aj.poles:
        lent = lent + _somme_ondes_surface(aj.poles, rho)
    e = float(np.max(np.abs(vite - lent) / np.maximum(np.abs(lent), 1e-300)))
    pires.append(e)
    if e > 1e-12:
        raise AssertionError("le reste s'ecarte de %.3e" % e)

    print("        (%d comparaisons, ecart relatif maximal %.1e)"
          % (len(pires), max(pires)))


if __name__ == "__main__":
    print("- banc d'essai : fonction de Green stratifiee et DCIM par GPOF -\n")
    print("\n%d essais reussis, %d en echec." % (OK, KO))
    sys.exit(1 if KO else 0)
