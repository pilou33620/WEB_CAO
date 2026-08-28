#!/usr/bin/python3
# -*- coding: utf-8 -*-
"""Banc d'essai de l'assemblage MoM : les deux potentiels, et la quadrature.

    python mom_solver/tests/banc_moteur.py

POURQUOI CE BANC EXISTE. `banc_dcim.py` eprouve les fonctions de Green ; rien
n'eprouvait ce que `mom_engine` en FAIT. Or c'est la qu'etaient les deux fautes
qui comptaient :

  · UN SEUL NOYAU POUR DEUX POTENTIELS. `compute_interactions` appelait la meme
    fonction pour le terme inductif et pour le terme de charge. Ce sont deux
    fonctions de Green differentes -- le potentiel vecteur suit la ligne TE, le
    potentiel scalaire la difference des deux lignes -- et elles diffement d'un
    facteur 1,63 en quasi-statique sur du FR-4. Un Z0 = racine(L/C) calcule
    ainsi ne mesurait pas la ligne, il mesurait cette erreur-la.

  · UNE QUADRATURE QUI N'INTEGRAIT PAS LA SINGULARITE. Une regle de Gauss, meme
    a sept points, ne fait qu'ECHANTILLONNER un 1/R. La version precedente
    compensait par une correction logarithmique additive dont le poids -- « 1,0
    si triangle partage, 0,3 si sommet partage » -- ne venait d'aucun calcul.

CE QUI EST EPROUVE ICI, du plus sur au plus construit :

  1. LA DESINGULARISATION POLAIRE, contre l'aire exacte du triangle et contre
     la formule fermee de Wilton pour l'integrale de 1/R.

  2. L'ASSEMBLAGE : symetrie exacte, cache de moments neutre, diagonale saine.

  3. LA PERMITTIVITE EFFECTIVE D'UNE LIGNE, mesuree sur l'onde stationnaire du
     courant, comparee a `python/ligne_mom.py` -- qui est verifie a 0,42 %
     contre Hammerstad-Jensen et a 0,30 % contre la solution exacte. C'est
     l'essai qui juge le RAPPORT des deux noyaux, donc le chantier au complet,
     et il est fait DEUX FOIS : avec les deux noyaux, et avec un seul, pour
     mesurer ce que la correction apporte.

LE MAILLAGE EST FABRIQUE ICI, en grille reguliere, et ce n'est pas de la
paresse. Les coupes transversales y sont exactes -- une ligne verticale de la
grille porte exactement une arete interne par cellule de largeur --, donc le
courant qui traverse une section se lit sans interpolation, l'excitation en
fente se pose sans approximation, et le battement de l'onde stationnaire se
depouille par une recurrence a trois termes plutot que par un ajustement non
lineaire. Ce banc mesure le MOTEUR, pas le mailleur.

Pas de framework, un decompte a la fin, un code de retour.
"""

import os
import sys

import numpy as np

_ICI = os.path.dirname(os.path.abspath(__file__))
_PAQUET = os.path.dirname(_ICI)
_RACINE = os.path.dirname(_PAQUET)
for _p in (_PAQUET, os.path.join(_RACINE, 'python')):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from mesher import extract_edges, build_rwg_basis                # noqa: E402
from green_layered import (C_0, EPSILON_0, MU_0, NoyauxGreen,     # noqa: E402
                           noyaux_green)
from mom_engine import fill_z_matrix, points_polaires             # noqa: E402
import ligne_mom                                                 # noqa: E402

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
    """Ecart relatif en pourcentage. UN NAN EST UN ECHEC, pas un inconnu."""
    if not (np.isfinite(a) and np.isfinite(b)):
        raise AssertionError("valeur non finie : %s contre %s" % (a, b))
    d = abs(b)
    return 100.0 * abs(a - b) / (d if d > 1e-300 else 1.0)


# ==========================================================================
# 1. LA DESINGULARISATION POLAIRE
# ==========================================================================
def wilton_inverse_r(r_obs, verts):
    """∫_T dS'/|r-r'| par la formule FERMEE, pour r coplanaire au triangle.

        ∫ dS'/R = somme_aretes  P0_i ln[(R_i^+ + l_i^+)/(R_i^- + l_i^-)]

    C'est Wilton et al. (1984) dans le cas d = 0, ou le terme en arctangente
    disparait. Ecrite ici et nulle part ailleurs : c'est l'etalon, il ne doit
    RIEN partager avec ce qu'il juge.
    """
    n_hat = np.cross(verts[1] - verts[0], verts[2] - verts[0])
    n_hat = n_hat / np.linalg.norm(n_hat)

    total = 0.0
    for i in range(3):
        a = verts[i]
        b = verts[(i + 1) % 3]
        u = (b - a) / np.linalg.norm(b - a)
        m = np.cross(u, n_hat)              # normale d'arete, vers l'exterieur

        p0 = float(np.dot(m, a - r_obs))
        l_moins = float(np.dot(u, a - r_obs))
        l_plus = float(np.dot(u, b - r_obs))
        r_moins = float(np.linalg.norm(a - r_obs))
        r_plus = float(np.linalg.norm(b - r_obs))

        haut = r_plus + l_plus
        bas = r_moins + l_moins
        if abs(bas) < 1e-300 or abs(haut) < 1e-300:
            continue
        total += p0 * np.log(haut / bas)
    return total


TRI_TEST = np.array([[0.0, 0.0, 0.0],
                     [1.3e-3, 0.0, 0.0],
                     [0.4e-3, 0.9e-3, 0.0]])

POSITIONS = {
    'centroide': TRI_TEST.mean(axis=0),
    'sommet': TRI_TEST[0].copy(),
    'milieu arete': 0.5 * (TRI_TEST[1] + TRI_TEST[2]),
    'decentre': 0.7 * TRI_TEST[0] + 0.2 * TRI_TEST[1] + 0.1 * TRI_TEST[2],
    'dehors': np.array([3e-3, 0.4e-3, 0.0]),
    'dehors aligne': np.array([-1e-3, 0.0, 0.0]),
}


@essai("les poids polaires rendent l'aire du triangle, exactement")
def _():
    """LE CONTROLE LE PLUS SIMPLE, ET LE PLUS UTILE. Les poids valent
    jacobien/R ; les multiplier par R redonne donc la quadrature ordinaire,
    dont la somme est l'aire. Un jacobien faux, un secteur oublie, ou une aire
    signee du mauvais cote se voient ici et nulle part ailleurs -- y compris
    quand le point d'observation est HORS du triangle, ou les trois secteurs
    doivent se compenser algebriquement.
    """
    aire = 0.5 * np.linalg.norm(np.cross(TRI_TEST[1] - TRI_TEST[0],
                                         TRI_TEST[2] - TRI_TEST[0]))
    for nom, r in POSITIONS.items():
        pts, poids = points_polaires(r, TRI_TEST)
        rayons = np.linalg.norm(pts - r, axis=1)
        obtenu = float(np.sum(poids * rayons))
        if ecart(obtenu, aire) > 1e-8:
            raise AssertionError("%s : aire %g au lieu de %g"
                                 % (nom, obtenu, aire))


@essai("l'integrale de 1/R desingularisee retombe sur la formule de Wilton")
def _():
    """LA QUADRATURE CONTRE L'ANALYTIQUE. La formule fermee et le changement de
    variable polaire n'ont rien en commun : l'une somme trois logarithmes sur
    les aretes, l'autre integre trois secteurs par Gauss-Legendre. Elles
    doivent tomber au meme endroit -- et c'est ce qui autorise a se passer de
    la formule fermee dans le moteur, ou le noyau n'est pas 1/R mais
    exp(-jkR)/R, que la formule fermee ne sait pas faire.
    """
    mesures = []
    for nom, r in POSITIONS.items():
        _, poids = points_polaires(r, TRI_TEST)
        par_polaires = float(np.sum(poids))
        par_wilton = wilton_inverse_r(r, TRI_TEST)
        e = ecart(par_polaires, par_wilton)
        mesures.append((nom, e))
        if e > 0.05:
            raise AssertionError("%s : %.4f %% (%g contre %g)"
                                 % (nom, e, par_polaires, par_wilton))
    print("        (" + ", ".join("%s : %.4f %%" % m for m in mesures) + ")")
    print("        (le pire est le point PROCHE D'UN SOMMET : la, |w(s)| pique "
          "en 1/s et il n'y a plus de pied de perpendiculaire a couper)")


# Un voisin qui partage l'arete (v1, v2) : c'est la configuration qui porte
# l'essentiel du couplage dans une matrice d'impedance.
TRI_VOISIN = np.array([TRI_TEST[1], TRI_TEST[2],
                       TRI_TEST[1] + TRI_TEST[2] - TRI_TEST[0]])


@essai("Gauss seul ne sait pas integrer ce 1/R -- ni de pres, ni du tout")
def _():
    """CE QUE LA DESINGULARISATION APPORTE, MESURE PAR SON ABSENCE.

    DEUX CONFIGURATIONS, ET DEUX VERDICTS DIFFERENTS.

    Sur des triangles ADJACENTS -- la configuration qui porte l'essentiel du
    couplage --, la regle de Gauss a sept points donne une valeur, et elle est
    fausse de plusieurs pour cent. C'est ce que la correction logarithmique
    additive de la version precedente devait rattraper avec un coefficient pose
    a la main (« 1,0 si triangle partage, 0,3 si sommet partage ») ; or l'ecart
    depend de la FORME des triangles, et aucun coefficient constant ne peut le
    suivre.

    Sur le triangle LUI-MEME, c'est pire que faux : la regle a sept points a un
    point au centroide, donc quand le point d'observation y est aussi, elle
    evalue 1/0. La version precedente contournait cela par une fonction
    separee qui remplacait l'integrale par A/(4 pi r_eq) -- une approximation
    de disque equivalent -- et qui, pour les contributions croisees T+/T-,
    appelait la fonction de Green avec une liste d'images VIDE, ce qui les
    annulait purement et simplement.
    """
    from mom_engine import GAUSS_TRI_7
    bary, poids_g = GAUSS_TRI_7
    aire_m = 0.5 * np.linalg.norm(np.cross(TRI_VOISIN[1] - TRI_VOISIN[0],
                                           TRI_VOISIN[2] - TRI_VOISIN[0]))
    aire_n = 0.5 * np.linalg.norm(np.cross(TRI_TEST[1] - TRI_TEST[0],
                                           TRI_TEST[2] - TRI_TEST[0]))
    pts_m = bary @ TRI_VOISIN
    pts_n = bary @ TRI_TEST

    # LA GRANDEUR QUI COMPTE EST L'INTEGRALE DOUBLE, celle que l'assemblage
    # calcule vraiment -- pas l'integrale interieure en un point choisi. Au
    # centroide du voisin, Gauss ne se trompe que de trois dixiemes de pour
    # cent ; ce qui la met dehors, c'est le point de quadrature EXTERIEUR le
    # plus proche de l'arete partagee, et c'est bien celui-la qui compte dans
    # la somme.
    double_gauss = 0.0
    double_exact = 0.0
    pire_interieur = 0.0
    for p_m, w_m in zip(pts_m, poids_g):
        interieur_gauss = float(np.sum(poids_g / np.linalg.norm(pts_n - p_m, axis=1))
                                * aire_n)
        interieur_exact = wilton_inverse_r(p_m, TRI_TEST)
        pire_interieur = max(pire_interieur, ecart(interieur_gauss, interieur_exact))
        double_gauss += w_m * aire_m * interieur_gauss
        double_exact += w_m * aire_m * interieur_exact

    e_double = ecart(double_gauss, double_exact)

    # Et les polaires, sur la meme integrale double.
    double_polaire = 0.0
    for p_m, w_m in zip(pts_m, poids_g):
        _, poids_p = points_polaires(p_m, TRI_TEST)
        double_polaire += w_m * aire_m * float(np.sum(poids_p))
    e_polaire = ecart(double_polaire, double_exact)

    if e_double < 1.0:
        raise AssertionError("Gauss seul ne se tromperait que de %.2f %% sur "
                             "l'integrale double de deux triangles adjacents : "
                             "l'essai n'a plus de sens" % e_double)
    if e_polaire > 0.05:
        raise AssertionError("les polaires se trompent de %.4f %%" % e_polaire)

    # CONFONDU : Gauss n'a meme pas de valeur. La regle a sept points a un
    # point au centroide, donc l'integrale interieure y evalue 1/0.
    with np.errstate(divide='ignore'):
        brut = float(np.sum(poids_g / np.linalg.norm(pts_n - TRI_TEST.mean(axis=0),
                                                     axis=1)))
    if np.isfinite(brut):
        raise AssertionError("la regle a 7 points n'aurait donc pas de point au "
                             "centroide : l'essai ne dit plus ce qu'il dit")

    print("        (adjacents, integrale double : Gauss %.1f %% contre "
          "polaires %.4f %%)" % (e_double, e_polaire))
    print("        (le pire point exterieur, celui qui frole l'arete "
          "partagee : %.1f %%)" % pire_interieur)
    print("        (confondus : la regle de Gauss n'a pas de valeur du tout)")


# ==========================================================================
# 2. UN RUBAN EN GRILLE REGULIERE, ET SES COUPES
# ==========================================================================
def grille_ruban(longueur, largeur, nx, ny, z):
    """Un ruban maille en grille reguliere, et la liste de ses coupes.

    Chaque cellule est coupee en deux triangles par sa diagonale (A,B,C) et
    (A,C,D). LA CONSEQUENCE QUI NOUS INTERESSE : la ligne verticale x = i dx
    porte, pour chaque bande de largeur, exactement UNE arete interne, partagee
    par la cellule de gauche et celle de droite. Une coupe transversale est
    donc un ensemble d'aretes RWG, et le courant qui la traverse est une somme
    exacte -- pas une interpolation.

    Rend (mesh, rwg, coupes) ou `coupes` est la liste, pour i = 1..nx-1, des
    (indice RWG, signe) dont le signe dit si le courant de la fonction de base
    traverse la coupe vers les x croissants.
    """
    xs = np.linspace(0.0, longueur, nx + 1)
    ys = np.linspace(-0.5 * largeur, 0.5 * largeur, ny + 1)

    sommets = np.empty(((nx + 1) * (ny + 1), 3))
    numero = {}
    for i in range(nx + 1):
        for j in range(ny + 1):
            k = i * (ny + 1) + j
            numero[(i, j)] = k
            sommets[k] = (xs[i], ys[j], z)

    elements = []
    for i in range(nx):
        for j in range(ny):
            a = numero[(i, j)]
            b = numero[(i + 1, j)]
            c = numero[(i + 1, j + 1)]
            d = numero[(i, j + 1)]
            elements.append((a, b, c))
            elements.append((a, c, d))
    elements = np.asarray(elements, dtype=int)

    mesh = {
        'vertices': sommets,
        'elements': elements,
        'layer_ids': np.zeros(len(elements), dtype=int),
        'num_vertices': len(sommets),
        'num_elements': len(elements),
        'mesh_size': longueur / nx,
    }

    rwg = build_rwg_basis(mesh, extract_edges(mesh))

    # Les coupes : une arete verticale a x = xs[i], et le sens du courant.
    coupes = [[] for _ in range(nx + 1)]
    centroides = sommets[elements].mean(axis=1)
    for n, r in enumerate(rwg):
        p1 = sommets[r.edge_vertices[0]]
        p2 = sommets[r.edge_vertices[1]]
        if abs(p1[0] - p2[0]) > 1e-12 * longueur:
            continue                                  # pas une arete verticale
        i = int(round(p1[0] / (longueur / nx)))
        if not (1 <= i <= nx - 1):
            continue
        # Le courant de la RWG va de T+ vers T-.
        signe = 1.0 if centroides[r.tri_minus][0] > centroides[r.tri_plus][0] else -1.0
        coupes[i].append((n, signe))

    return mesh, rwg, coupes


# L'empilage de l'essai : microruban FR-4, sans pertes -- les etalons
# analytiques de `ligne_mom` s'ecrivent sans tan delta.
H_SUB = 0.370e-3
ER_SUB = 4.37
T_CU = 35e-6

EMPILAGE = {'layers': [
    {'index': 0, 'type': 'copper', 'thickness': T_CU, 'epsilon_r': 1.0,
     'tan_delta': 0.0, 'role': 'plane', 'z_bottom': 0.0, 'z_top': T_CU},
    {'index': 1, 'type': 'dielectric', 'thickness': H_SUB, 'epsilon_r': ER_SUB,
     'tan_delta': 0.0, 'role': '', 'z_bottom': T_CU, 'z_top': T_CU + H_SUB},
    {'index': 2, 'type': 'copper', 'thickness': T_CU, 'epsilon_r': 1.0,
     'tan_delta': 0.0, 'role': 'signal', 'z_bottom': T_CU + H_SUB,
     'z_top': 2 * T_CU + H_SUB},
]}
Z_PISTE = EMPILAGE['layers'][2]['z_top']

W_PISTE = 1.05e-3          # ~50 ohms sur 0,37 mm de FR-4
F_ESSAI = 10e9             # voir `permittivite_mesuree` pour le choix


class NoyauxUnSeul(NoyauxGreen):
    """L'ANCIENNE FAUTE, REPRODUITE EXPRES : un noyau pour deux potentiels.

    Elle n'existe que pour etre mesuree. Le potentiel vecteur recoit ici le
    noyau NORMALISE du potentiel scalaire -- avec son mu_0, donc la bonne unite
    et la mauvaise fonction --, qui est exactement ce que faisait
    `compute_interactions` en appelant `green_2d_layered` pour les deux termes.
    """

    def g_a(self, rho, dz=0.0):
        return MU_0 * self.ajust_q.valeur(rho, dz)

    def g_a_reste(self, rho, dz=0.0):
        return MU_0 * self.ajust_q.valeur_reste(rho, dz)

    @property
    def amplitude_directe_a(self):
        return MU_0 * self.ajust_q.amplitude_directe


def _un_seul_noyau(noyaux):
    return NoyauxUnSeul(ajust_a=noyaux.ajust_a, ajust_q=noyaux.ajust_q,
                        k_ref=noyaux.k_ref, eps_ref=noyaux.eps_ref,
                        z_src=noyaux.z_src, freq=noyaux.freq)


@essai("la matrice Z est exactement symetrique, et sa diagonale est saine")
def _():
    """LA RECIPROCITE N'EST PAS APPROCHEE ICI, ELLE EST IMPOSEE -- le triangle
    inferieur est recopie. Ce que cet essai verifie vraiment, c'est que rien
    dans le chemin de calcul ne rend un nan ou un zero : une diagonale qui
    contient un zero fait une matrice singuliere, et la resolution rend alors
    des courants absurdes sans lever d'erreur.
    """
    mesh, rwg, _ = grille_ruban(3e-3, W_PISTE, 8, 3, Z_PISTE)
    noyaux = noyaux_green(EMPILAGE, F_ESSAI, num_images=8)
    z = fill_z_matrix(rwg, F_ESSAI, noyaux, mesh['vertices'], mesh['elements'])

    if not np.all(np.isfinite(z)):
        raise AssertionError("la matrice Z contient des valeurs non finies")
    dissymetrie = np.max(np.abs(z - z.T)) / np.max(np.abs(z))
    if dissymetrie > 1e-14:
        raise AssertionError("dissymetrie %g" % dissymetrie)

    diag = np.abs(np.diag(z))
    if diag.min() <= 0:
        raise AssertionError("un element diagonal nul")
    # La diagonale doit DOMINER sa ligne : c'est ce qui fait qu'un systeme MoM
    # se resout. Si elle ne domine plus, la singularite n'est pas integree.
    hors_diag = np.max(np.abs(z - np.diag(np.diag(z))), axis=1)
    if np.min(diag / hors_diag) < 1.0:
        raise AssertionError("la diagonale ne domine pas : rapport min %.3f"
                             % np.min(diag / hors_diag))
    print("        (%d RWG, dominance diagonale min %.2f, cond %.1e)"
          % (len(rwg), np.min(diag / hors_diag), np.linalg.cond(z)))


@essai("le cache de moments ne change RIEN au resultat")
def _():
    """UNE OPTIMISATION QUI CHANGE UN CHIFFRE N'EST PAS UNE OPTIMISATION.

    Le cache range les moments par paire de triangles NON ORDONNEE, et les
    relit transposes quand la paire se presente dans l'autre sens. C'est exact
    parce que l'integrande est symetrique sous l'echange simultane des deux
    triangles et de leurs sommets libres -- mais c'est le genre d'exactitude
    qui se perd a la premiere retouche, alors on la mesure.
    """
    from mom_engine import compute_interactions
    mesh, rwg, _ = grille_ruban(2e-3, W_PISTE, 5, 2, Z_PISTE)
    noyaux = noyaux_green(EMPILAGE, F_ESSAI, num_images=6)

    avec = fill_z_matrix(rwg, F_ESSAI, noyaux,
                         mesh['vertices'], mesh['elements'])

    n = len(rwg)
    sans = np.zeros((n, n), dtype=complex)
    for m in range(n):
        for k in range(m, n):
            v = compute_interactions(rwg[m], rwg[k], F_ESSAI, noyaux,
                                     mesh['vertices'], mesh['elements'], None)
            sans[m, k] = v
            sans[k, m] = v

    pire = np.max(np.abs(avec - sans)) / np.max(np.abs(sans))
    if pire > 1e-12:
        raise AssertionError("le cache change le resultat de %.3e" % pire)
    print("        (%d RWG : ecart maximal %.1e)" % (n, pire))


# ==========================================================================
# 3. LA PERMITTIVITE EFFECTIVE D'UNE LIGNE
# --------------------------------------------------------------------------
# L'ESSAI QUI JUGE LE CHANTIER. La permittivite effective d'une ligne vaut
# eps_eff = (beta c / omega)^2, et beta = omega racine(LC) : elle ne depend que
# du PRODUIT des deux noyaux, comme Z0 = racine(L/C) n'en depend que du
# RAPPORT. Les mesurer, c'est mesurer les deux fonctions de Green ensemble.
#
# POURQUOI PAS LES PARAMETRES S. Parce qu'ils dependent du modele de port, qui
# est ici une fente d'un seul panneau, sans de-embarquement -- c'est le « lot 5
# bis » de A-FAIRE, et il n'est pas fait. Un |S21| compare a `ligne_mom`
# mesurerait surtout le port. L'onde stationnaire du COURANT, elle, se lit au
# milieu de la ligne, loin des deux bouts, et ne sait rien du port.
#
# COMMENT beta SE LIT SANS AJUSTEMENT. Entre deux coupes voisines le courant
# est une somme de deux ondes, exp(-j beta x) et exp(+j beta x), quelles que
# soient les reflexions aux extremites. Or toute suite de cette forme,
# echantillonnee a pas CONSTANT, obeit a
#
#     I(i+1) + I(i-1) = 2 cos(beta dx) I(i)
#
# et c'est tout : un moindre carre sur cette recurrence donne cos(beta dx) sans
# valeur initiale, sans hypothese sur les reflexions, et sans supposer la ligne
# adaptee. C'est la meme idee que GPOF a l'ordre deux.
#
# LE CHOIX DE LA FREQUENCE EST UN CHOIX DE CONDITIONNEMENT. Le cosinus varie en
# (beta dx)^2/2 : trop bas en frequence, la recurrence ne voit plus rien.
# A 10 GHz sur ce maillage, beta dx vaut environ 0,15, ce qui laisse quatre
# chiffres utiles. La contrepartie est que `ligne_mom` est quasi-statique, et
# qu'il faut donc lui appliquer sa correction de dispersion (Getsinger) avant
# de comparer -- ce que l'essai fait, et affiche.
# ==========================================================================
def courants_aux_coupes(z_matrix, rwg, coupes, i_source, v_gap=1.0):
    """Excite une coupe en fente, resout, et rend le courant a chaque coupe.

    L'EXCITATION EST EXACTE, pas approchee : un champ E_x = v_gap delta(x - xs)
    donne V_m = ∫ f_m·E = v_gap l_m s_m, ou s_m dit si le flux de la fonction
    de base traverse la coupe vers les x croissants. C'est ce que la grille
    reguliere permet et qu'un maillage libre ne permet pas.
    """
    v = np.zeros(len(rwg), dtype=complex)
    for n, signe in coupes[i_source]:
        v[n] = v_gap * rwg[n].edge_length * signe

    i_rwg = np.linalg.solve(z_matrix, v)

    return np.array([
        sum(i_rwg[n] * rwg[n].edge_length * signe for n, signe in coupe)
        if coupe else 0.0 + 0j
        for coupe in coupes
    ])


def beta_par_recurrence(courants, dx, garde):
    """cos(beta dx) par moindre carre sur la recurrence a trois termes."""
    i0, i1 = garde, len(courants) - garde
    milieu = courants[i0:i1]
    if len(milieu) < 5:
        raise AssertionError("trop peu de coupes utilisables")

    gauche = milieu[:-2]
    centre = milieu[1:-1]
    droite = milieu[2:]

    num = np.sum((gauche + droite) * np.conj(centre))
    den = np.sum(np.abs(centre) ** 2)
    if abs(den) < 1e-300:
        raise AssertionError("courant nul sur la partie utile de la ligne")

    cos_bdx = num / den / 2.0
    beta = np.arccos(complex(cos_bdx)) / dx
    return beta, complex(cos_bdx)


def permittivite_mesuree(noyaux, longueur, nx, ny, freq):
    """eps_eff de la ligne, lue sur l'onde stationnaire du courant."""
    mesh, rwg, coupes = grille_ruban(longueur, W_PISTE, nx, ny, Z_PISTE)
    z = fill_z_matrix(rwg, freq, noyaux, mesh['vertices'], mesh['elements'])

    dx = longueur / nx
    # La fente se pose pres d'un bout ; on lit au milieu, loin des deux.
    courants = courants_aux_coupes(z, rwg, coupes, i_source=2)
    beta, cos_bdx = beta_par_recurrence(courants, dx, garde=max(4, nx // 6))

    omega = 2 * np.pi * freq
    eps_eff = (beta * C_0 / omega) ** 2
    return complex(eps_eff), complex(beta), complex(cos_bdx), len(rwg)


def etalon_ligne_mom(freq):
    """(eps_eff quasi-statique, eps_eff dispersee, z0) selon `ligne_mom`."""
    geo = {'kind': 'micro', 'w': W_PISTE, 't': T_CU, 'h': H_SUB,
           'couverture': 0.0, 'epsilon_r': ER_SUB}
    res = ligne_mom.solve_line(geo)
    eps_disp, _ = ligne_mom.dispersion_getsinger(
        res['z0'], res['eps_eff'], ER_SUB, H_SUB, freq)
    return res['eps_eff'], eps_disp, res['z0']


@essai("la permittivite effective de la ligne, contre ligne_mom")
def _():
    """LA MESURE QUI DECIDE. `ligne_mom` est verifie a 0,42 % contre
    Hammerstad-Jensen et a 0,30 % contre la solution exacte en integrales
    elliptiques : c'est un etalon, pas un avis.

    CE QUI RESTE DANS L'ECART, ET QU'IL FAUT LIRE AVEC : la ligne est maillee
    sur trois cellules de largeur seulement, et la densite de courant d'un
    microruban est fortement concentree sur les bords -- une grille reguliere
    la rend mal. C'est une erreur de MAILLAGE, pas de noyau, et elle joue dans
    le meme sens pour les deux variantes comparees ci-dessous.
    """
    quasi, disp, z0 = etalon_ligne_mom(F_ESSAI)
    eps, beta, cos_bdx, n = permittivite_mesuree(
        noyaux_green(EMPILAGE, F_ESSAI, num_images=8),
        longueur=12e-3, nx=34, ny=3, freq=F_ESSAI)

    print("        (ligne_mom : eps_eff = %.4f quasi-statique, %.4f a %.0f GHz"
          " -- Z0 = %.2f ohms)" % (quasi, disp, F_ESSAI / 1e9, z0))
    print("        (moteur    : eps_eff = %.4f%+.4fj, beta = %.2f rad/m, "
          "cos(beta dx) = %.5f, %d RWG)"
          % (eps.real, eps.imag, beta.real, cos_bdx.real, n))

    e = ecart(eps.real, disp)
    print("        (ecart : %.2f %%)" % e)
    if e > 12.0:
        raise AssertionError("eps_eff = %.4f contre %.4f attendu : %.2f %%"
                             % (eps.real, disp, e))


@essai("un seul noyau pour deux potentiels : l'ecart que ca faisait")
def _():
    """LE MEME CALCUL, LE MEME MAILLAGE, LA MEME LIGNE -- et le potentiel
    vecteur qui recoit le noyau du potentiel scalaire, comme avant. Tout ce qui
    differe est la fonction de Green du terme inductif.

    CE QU'ON ATTEND, ET POURQUOI. beta = omega racine(LC), et le noyau du
    potentiel scalaire vaut 1,63 fois celui du potentiel vecteur en
    quasi-statique sur du FR-4 : une inductance gonflee d'autant donne un
    eps_eff gonfle d'autant, donc autour de 1,6 fois trop grand. L'essai ne
    verifie pas ce chiffre-la -- il verifie que la variante fautive est
    NETTEMENT plus loin de `ligne_mom` que la bonne. Si un jour les deux se
    valent, c'est que le decouplage des deux noyaux a ete defait.
    """
    _, disp, _ = etalon_ligne_mom(F_ESSAI)
    noyaux = noyaux_green(EMPILAGE, F_ESSAI, num_images=8)

    bon, _, _, _ = permittivite_mesuree(noyaux, 12e-3, 34, 3, F_ESSAI)
    faux, _, _, _ = permittivite_mesuree(_un_seul_noyau(noyaux),
                                         12e-3, 34, 3, F_ESSAI)

    e_bon = ecart(bon.real, disp)
    e_faux = ecart(faux.real, disp)
    print("        (deux noyaux : %.4f -> %.2f %% ; un seul : %.4f -> %.2f %%)"
          % (bon.real, e_bon, faux.real, e_faux))

    if e_faux < 3.0 * e_bon:
        raise AssertionError(
            "la variante a un seul noyau n'est pas nettement plus fausse "
            "(%.2f %% contre %.2f %%) : le decouplage a-t-il ete defait ?"
            % (e_faux, e_bon))


if __name__ == "__main__":
    print("- banc d'essai : assemblage MoM, deux potentiels et quadrature -\n")
    print("\n%d essais reussis, %d en echec." % (OK, KO))
    sys.exit(1 if KO else 0)
