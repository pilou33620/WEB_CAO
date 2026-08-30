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

from mesher import (extract_edges, build_rwg_basis,               # noqa: E402
                    hauteur_electrique, maillage_avec_ports_verticaux)
from solver_extract import (compute_s_parameters,                 # noqa: E402
                            deembarquement_deux_longueurs)
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



# ==========================================================================
# 4. LE PORT VERTICAL, ET LA MESURE QUI DECIDE
# --------------------------------------------------------------------------
# CE QUI ETAIT BLOQUE, ET DEPUIS QUAND. Le port du moteur etait une FENTE SERIE
# : une coupe du cuivre, avec le generateur entre les deux moities de la piste.
# C'est un port valide -- pour un dipole. Pour une ligne de transmission, c'est
# deux troncons OUVERTS mis en serie, donc deux impedances enormes, donc pas de
# courant. Le banc de chaine le mesurait sans equivoque : sur une ligne de
# L/lambda_g = 0,07, |S21| = 0,0065 et |S11| = 1,0000. Toute comparaison de
# parametres S avec `ligne_mom` attendait ce point-la, et lui seul.
#
# CE QUI LE DEBLOQUE. Un vrai port de microruban est un SHUNT entre la piste et
# le plan de masse : on perce le maillage, on descend un fut de via, et on pose
# le generateur sur la fente infinitesimale entre le bas du fut et le plan.
# Trois choses ont du etre faites pour cela, et chacune est eprouvee ailleurs :
#
#   · G_A^zz, la composante verticale du potentiel vecteur -- `banc_dcim.py`,
#     groupe 8 ;
#   · les demi-RWG du bas du fut, dont l'image dans le plan de masse complete
#     la fonction -- `mesher.demi_rwg_du_bas` ;
#   · le de-embarquement par deux longueurs, qui retire le via, le trou et le
#     coin, et ne laisse que la ligne.
#
# CE QUE LES DEUX ESSAIS CI-DESSOUS MESURENT, ET DANS QUEL ORDRE. Le premier
# compare les deux ports SUR LA MEME LIGNE, parce qu'un |S21| proche de un ne
# vaut que compare a ce qu'il remplace. Le second est la comparaison qui decide
# : eps_eff de-embarque contre `ligne_mom`, qui est verifie a 0,42 % contre
# Hammerstad-Jensen.
# ==========================================================================

def ligne_a_ports_verticaux(longueur, nx, ny, freq, noyaux, marge=0.5e-3):
    """Une ligne maillee, percee de deux ports verticaux, et sa matrice S."""
    mesh, _, _ = grille_ruban(longueur, W_PISTE, nx, ny, Z_PISTE)
    hauteur = hauteur_electrique(EMPILAGE)
    mesh, rwg, coupes = maillage_avec_ports_verticaux(
        mesh, [(marge, 0.0), (longueur - marge, 0.0)], hauteur,
        z_cible=Z_PISTE)

    z = fill_z_matrix(rwg, freq, noyaux, mesh['vertices'], mesh['elements'])
    ports = [{'id': 'P1', 'impedance': 50.0}, {'id': 'P2', 'impedance': 50.0}]
    return compute_s_parameters(z, rwg, ports, freq, coupes), len(rwg)


def ligne_a_fentes_series(longueur, nx, ny, freq, noyaux, i1=2, i2=None):
    """La MEME ligne, avec l'ancien port : une fente serie dans le cuivre."""
    mesh, rwg, coupes_grille = grille_ruban(longueur, W_PISTE, nx, ny, Z_PISTE)
    if i2 is None:
        i2 = nx - 2
    z = fill_z_matrix(rwg, freq, noyaux, mesh['vertices'], mesh['elements'])
    ports = [{'id': 'P1', 'impedance': 50.0}, {'id': 'P2', 'impedance': 50.0}]
    return compute_s_parameters(z, rwg, ports, freq,
                                [coupes_grille[i1], coupes_grille[i2]])


@essai("le port vertical fait passer la ligne, la fente serie non")
def _():
    """LA MEME LIGNE, LE MEME MAILLAGE, LA MEME FREQUENCE -- et le port change.

    CE QU'ON ATTEND DE LA FENTE, ET POURQUOI. Elle coupe la piste et met le
    generateur entre les deux moities : deux troncons ouverts en serie. A
    L/lambda_g petit, chacun est une capacite minuscule, donc une impedance
    enorme, donc |S11| = 1 et |S21| = 0. Ce n'est pas une imprecision, c'est le
    mauvais modele de port.

    CE QU'ON ATTEND DU VIA. Le generateur est entre la piste et le PLAN : le
    courant monte le fut, part le long de la ligne, revient par le plan. |S21|
    doit etre proche de un, et la structure PASSIVE -- |S11|^2 + |S21|^2 au
    plus un, aux pertes et au rayonnement pres.

    LE |S11| QUI RESTE N'EST PAS UN DEFAUT : c'est le via, le trou perce et le
    coin, tout ce que le de-embarquement retire a l'essai suivant.
    """
    freq = 5e9
    longueur = 6e-3
    noyaux_h = noyaux_green(EMPILAGE, freq, num_images=8)
    noyaux_v = noyaux_green(EMPILAGE, freq, num_images=8, avec_vertical=True)

    s_fente = ligne_a_fentes_series(longueur, 16, 3, freq, noyaux_h)
    s_via, n_rwg = ligne_a_ports_verticaux(longueur, 16, 3, freq, noyaux_v)

    lam_g = C_0 / (freq * np.sqrt(3.49))
    print("        (L/lambda_g = %.2f, %d RWG)" % (longueur / lam_g, n_rwg))
    print("        (fente serie  : |S11| = %.4f, |S21| = %.4f)"
          % (abs(s_fente[0, 0]), abs(s_fente[1, 0])))
    print("        (port vertical: |S11| = %.4f, |S21| = %.4f, "
          "|S11|^2+|S21|^2 = %.4f)"
          % (abs(s_via[0, 0]), abs(s_via[1, 0]),
             abs(s_via[0, 0]) ** 2 + abs(s_via[1, 0]) ** 2))

    if abs(s_fente[1, 0]) > 0.1:
        raise AssertionError(
            "la fente serie transmet %.4f : ce n'est plus le cas de reference "
            "qui justifie le port vertical" % abs(s_fente[1, 0]))
    if abs(s_via[1, 0]) < 0.9:
        raise AssertionError("le port vertical ne transmet que %.4f"
                             % abs(s_via[1, 0]))
    somme = abs(s_via[0, 0]) ** 2 + abs(s_via[1, 0]) ** 2
    if somme > 1.02:
        raise AssertionError("structure ACTIVE : |S11|^2 + |S21|^2 = %.4f"
                             % somme)


@essai("le de-embarquement par deux longueurs retrouve eps_eff de ligne_mom")
def _():
    """LA COMPARAISON QUI DECIDE, ET QUI N'AVAIT JAMAIS PU ETRE FAITE.

    DEUX LONGUEURS, MEME PAS DE MAILLE, MEMES PORTS. Le produit T2 T1^-1
    elimine les acces et ne laisse que la ligne ; ses valeurs propres sont
    exp(-+ gamma dL), donc eps_eff = (beta c/omega)^2. Aucun etalon n'y entre.

    L'ETALON EXTERIEUR EST `ligne_mom`, verifie a 0,42 % contre
    Hammerstad-Jensen et a 0,30 % contre la solution exacte, avec sa correction
    de dispersion de Getsinger -- le moteur, lui, est plein onde et disperse
    tout seul.

    CE QUI RESTE DANS L'ECART, ET IL FAUT LE LIRE AVEC : la ligne est maillee
    sur TROIS cellules de largeur, et la densite de courant d'un microruban est
    concentree sur les bords -- une grille reguliere la rend mal. C'est la meme
    erreur de maillage que sur la mesure d'eps_eff par onde stationnaire, qui
    donne 0,49 % sur un maillage plus fin.

    LE RESIDU DE RECIPROCITE EST LE GARDE-FOU. Les deux valeurs propres doivent
    etre inverses l'une de l'autre ; leur produit vaut un a 10^-16 pres si, et
    seulement si, les deux simulations ne different vraiment que par une
    longueur de ligne uniforme. S'il derive, c'est que le maillage ou le port a
    bouge entre les deux, et le gamma extrait ne veut plus rien dire.
    """
    freq = 5e9
    pas = 0.375e-3
    noyaux = noyaux_green(EMPILAGE, freq, num_images=8, avec_vertical=True)

    s_courte, _ = ligne_a_ports_verticaux(6e-3, int(round(6e-3 / pas)), 3,
                                          freq, noyaux)
    s_longue, _ = ligne_a_ports_verticaux(12e-3, int(round(12e-3 / pas)), 3,
                                          freq, noyaux)

    _, disp, z0 = etalon_ligne_mom(freq)
    d = deembarquement_deux_longueurs(s_courte, s_longue, 6e-3, freq,
                                      eps_eff_attendu=disp)

    print("        (ligne_mom : eps_eff = %.4f a %.0f GHz, Z0 = %.2f ohms)"
          % (disp, freq / 1e9, z0))
    print("        (de-embarque : eps_eff = %.4f, alpha = %.2f dB/m, "
          "residu de reciprocite %.1e)"
          % (d['eps_eff'], d['alpha_db_par_m'], d['residu_reciproque']))

    if d['residu_reciproque'] > 1e-6:
        raise AssertionError(
            "les deux valeurs propres ne sont pas inverses (%.2e) : les deux "
            "simulations ne different pas que par la longueur"
            % d['residu_reciproque'])
    if d['tours'] != 0:
        raise AssertionError(
            "la phase a demande %d tours de 2 pi : dL est trop grand devant "
            "la longueur d'onde guidee, l'extraction n'est plus sure"
            % d['tours'])

    e = ecart(d['eps_eff'], disp)
    print("        (ecart : %.2f %%)" % e)
    if e > 4.0:
        raise AssertionError("eps_eff = %.4f contre %.4f attendu : %.2f %%"
                             % (d['eps_eff'], disp, e))


@essai("la voie verticale reste eteinte sur un maillage plat")
def _():
    """LA GARANTIE DE NON-REGRESSION, ET ELLE SE VERIFIE AU BIT.

    Le dyade du potentiel vecteur vaut diag(G_A^xx, G_A^xx, G_A^zz), et le
    moteur coupe donc le produit f_m.f_n en deux voies. Sur un maillage
    entierement horizontal, la composante z de (p - v) est IDENTIQUEMENT nulle
    : la voie verticale ne peut rien apporter, et `moments_triangles` ne
    l'allume meme pas.

    ON LE MESURE PLUTOT QUE DE LE RAISONNER : la meme ligne plate, assemblee
    avec un noyau qui porte G_A^zz et avec un noyau qui ne le porte pas, doit
    rendre EXACTEMENT la meme matrice. Pas « a peu pres » -- exactement, parce
    que c'est le meme chemin de code.
    """
    freq = 5e9
    mesh, rwg, _ = grille_ruban(3e-3, W_PISTE, 8, 3, Z_PISTE)
    sans = noyaux_green(EMPILAGE, freq, num_images=8)
    avec = noyaux_green(EMPILAGE, freq, num_images=8, avec_vertical=True)
    if avec.vertical is None:
        raise AssertionError("le noyau vertical n'a pas ete construit")

    z_sans = fill_z_matrix(rwg, freq, sans, mesh['vertices'], mesh['elements'])
    z_avec = fill_z_matrix(rwg, freq, avec, mesh['vertices'], mesh['elements'])
    ecart_max = float(np.max(np.abs(z_sans - z_avec)))
    print("        (%d RWG, ecart maximal %.1e)" % (len(rwg), ecart_max))
    if ecart_max != 0.0:
        raise AssertionError("la voie verticale a change la matrice d'un "
                             "maillage plat : %.3e" % ecart_max)


@essai("le fut de via ne casse ni la symetrie de Z ni sa diagonale")
def _():
    """CE QUI POURRAIT CASSER EN SILENCE quand des triangles se dressent.

    TROIS CHOSES, ET LES TROIS ONT ETE CORRIGEES POUR CET ESSAI :

      · la COPLANARITE se testait par une denivelee en z. Deux triangles d'une
        meme facette de fut sont coplanaires et leurs centres n'ont pas le meme
        z : ils auraient ete envoyes a Gauss seul, qui n'integre pas un 1/R ;
      · `_impedance_vue` rendait l'impedance du VIDE quand la pile devenait
        vide, meme sur un court-circuit. Ca arrive exactement sur l'anneau du
        bas du fut, qui est POSE sur le plan de masse ;
      · la demi-RWG du bas a une aire moins NULLE, et `_triangles_de` doit la
        sauter sans lever.

    Une diagonale qui contient un zero fait une matrice singuliere, et la
    resolution rend alors des courants absurdes sans lever d'erreur.
    """
    freq = 5e9
    mesh, _, _ = grille_ruban(4e-3, W_PISTE, 10, 3, Z_PISTE)
    hauteur = hauteur_electrique(EMPILAGE)
    mesh, rwg, coupes = maillage_avec_ports_verticaux(
        mesh, [(0.5e-3, 0.0), (3.5e-3, 0.0)], hauteur, z_cible=Z_PISTE)

    verticaux = [i for i, t in enumerate(mesh['elements'])
                 if np.ptp(mesh["vertices"][t][:, 2]) > 1e-9]
    demi = [r for r in rwg if r.area_minus == 0.0]

    noyaux = noyaux_green(EMPILAGE, freq, num_images=8, avec_vertical=True)
    z = fill_z_matrix(rwg, freq, noyaux, mesh['vertices'], mesh['elements'])

    if not np.all(np.isfinite(z)):
        raise AssertionError("la matrice Z contient des valeurs non finies")
    asym = float(np.max(np.abs(z - z.T)))
    if asym != 0.0:
        raise AssertionError("Z n'est pas exactement symetrique : %.3e" % asym)
    diag = np.abs(np.diag(z))
    if np.min(diag) <= 0.0:
        raise AssertionError("un element diagonal est nul")

    print("        (%d triangles dont %d verticaux ; %d RWG dont %d demi ; "
          "coupes de %s ; cond %.1e)"
          % (len(mesh['elements']), len(verticaux), len(rwg), len(demi),
             [len(c) for c in coupes], np.linalg.cond(z)))


if __name__ == "__main__":
    print("- banc d'essai : assemblage MoM, deux potentiels et quadrature -\n")
    print("\n%d essais reussis, %d en echec." % (OK, KO))
    sys.exit(1 if KO else 0)
