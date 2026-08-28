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
from scipy.special import j0

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
    EPSILON_0, MU_0, apply_dcim, gpof, green_spatial, green_spectral_tm,
    profil_spectral, _chemins, _kz,
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
# 4. LE DOMAINE SPATIAL, LA OU LE SOLVEUR LIRA
# ==========================================================================
def _milieux(a, b, n):
    """Les n points MILIEUX de [a, b] : aucune evaluation aux bornes."""
    pas = (b - a) / n
    return a + pas * (np.arange(n) + 0.5)


def c_infini(stackup, freq, h_min):
    """La constante du noyau en evanescent profond : 2 eps1/(eps1+eps2)."""
    return complex(green_spectral_tm(np.array([1e4 / h_min]), stackup, freq)[0])


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


def sommerfeld_numerique(rho, stackup, freq):
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
    c_inf = c_infini(stackup, freq, h_min)

    def integrande(k_rho):
        kz = _kz(k_ref, k_rho)
        g = green_spectral_tm(k_rho, stackup, freq, profil) / (2j * kz)
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
    quelques millimetres, toutes les distances utiles sont ici."""
    images = apply_dcim(MICRO, num_images=8, freq=F0)
    pires = []
    for rho in (0.1e-3, 0.2e-3, 0.5e-3, 1e-3, 2e-3, 3e-3, 5e-3):
        par_images = green_spatial(rho, 0.0, 0.0, images, F0, MICRO)
        par_integrale = sommerfeld_numerique(rho, MICRO, F0)
        e = ecart(par_images, par_integrale)
        pires.append((rho, e))
        if e > 0.2:
            raise AssertionError("rho=%g mm : %.2f %% (%s contre %s)"
                                 % (rho * 1e3, e, par_images, par_integrale))
    print("        (" + ", ".join("%.1f mm : %.2f %%" % (r * 1e3, e)
                                  for r, e in pires) + ")")


@essai("le champ LOINTAIN decroche, et c'est l'onde de surface qui manque")
def _():
    """CE QUE CETTE DCIM NE FAIT PAS, ECRIT NOIR SUR BLANC ET MESURE.

    Un stratifie sur plan de masse porte une onde de surface TM0, qui n'a pas
    de frequence de coupure : elle existe toujours. Dans le plan spectral c'est
    un POLE, et un pole ne s'approche pas par une somme finie d'exponentielles
    -- il decroit en 1/racine(rho) la ou les images decroissent en 1/rho. Le
    faire proprement demande de l'EXTRAIRE avant l'ajustement, par son residu,
    et de le rajouter analytiquement. Ce n'est pas fait.

    Cet essai ne cache donc pas l'ecart : il le MESURE et le borne. L'erreur ne
    depend que de k*rho, et de rien d'autre -- c'est la signature du phenomene,
    et c'est ce qui permet de dire ou l'outil est utilisable :

        k*rho <= 0,25   ->  moins de 0,2 %
        k*rho ~  0,44   ->  environ 1 %
        k*rho ~  0,88   ->  environ 7 %
        k*rho ~  2,2    ->  environ 35 %

    A ces distances-la le noyau vaut six ordres de grandeur de moins qu'en
    champ proche : sans consequence pour une matrice d'impedance, decisif pour
    un calcul de rayonnement. Le jour ou quelqu'un demandera le rayonnement a
    ce solveur, c'est ici qu'il faudra revenir.
    """
    images = apply_dcim(MICRO, num_images=8, freq=F0)
    mesures = []
    for rho in (10e-3, 30e-3):
        par_images = green_spatial(rho, 0.0, 0.0, images, F0, MICRO)
        e = ecart(par_images, sommerfeld_numerique(rho, MICRO, F0))
        mesures.append((rho, e))

    # L'ecart CROIT avec la distance : c'est ce qui prouve que le manque est
    # l'onde de surface et non une erreur d'ajustement, laquelle n'aurait
    # aucune raison de suivre k*rho.
    if not (mesures[0][1] < mesures[1][1]):
        raise AssertionError("l'ecart ne croit pas avec la distance : %s"
                             % (mesures,))
    # ET IL RESTE BORNE la ou on l'a mesure. Si cet essai tombe, ce n'est plus
    # la meme limitation -- c'est une regression.
    if mesures[1][1] > 20.0:
        raise AssertionError("a 30 mm l'ecart passe a %.1f %%, ce n'est plus "
                             "l'onde de surface seule" % (mesures[1][1],))
    print("        (" + ", ".join("%.0f mm : %.1f %%" % (r * 1e3, e)
                                  for r, e in mesures) + " -- onde de surface)")


if __name__ == "__main__":
    print("- banc d'essai : fonction de Green stratifiee et DCIM par GPOF -\n")
    print("\n%d essais reussis, %d en echec." % (OK, KO))
    sys.exit(1 if KO else 0)
