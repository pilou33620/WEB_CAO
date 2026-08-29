"""
Module d'assemblage de la matrice d'impédance et construction du système MoM
Formulation MPIE (Mixed Potential Integral Equation) en milieu stratifié
"""

import numpy as np
import logging
from typing import Dict, List, Optional, Tuple
from numba import njit, prange

try:
    from .mesher import RWGBasis
    from .green_layered import NoyauxGreen, noyaux_green
except ImportError:                                    # noqa: BLE001
    from mesher import RWGBasis
    from green_layered import NoyauxGreen, noyaux_green

logger = logging.getLogger(__name__)

# Constantes
MU_0 = 4 * np.pi * 1e-7
EPSILON_0 = 8.854187817e-12
ETA_0 = np.sqrt(MU_0 / EPSILON_0)  # Impédance du vide (~377 Ω)


# ==========================================================================
# CE QUE CE MODULE ASSEMBLE, ET AVEC QUOI
# --------------------------------------------------------------------------
# LA FORMULATION. Z_mn = -<f_m, E(f_n)> avec E = -j omega A - grad Phi donne,
# après intégration par parties sur des fonctions RWG (qui n'ont pas de
# composante normale au bord de leur support) :
#
#     Z_mn = j omega  ∫∫ f_m·f_n G_A  +  1/(j omega) ∫∫ (div f_m)(div f_n) G_q
#
# DEUX FONCTIONS DE GREEN, ET C'ÉTAIT LE PREMIER DÉFAUT. La version précédente
# appelait `green_2d_layered` -- un seul scalaire -- pour les deux termes. Or
# G_A suit la ligne de transmission TE et G_q la différence des deux lignes :
# ce sont deux fonctions distinctes, et le terme inductif recevait celle du
# terme capacitif. Mesuré dans `banc_dcim.py` : les deux noyaux normalisés
# diffèrent d'un facteur 1,63 dans la limite quasi-statique du FR-4. Un
# Z0 = racine(L/C) calculé ainsi ne mesurait pas la ligne, il mesurait cette
# erreur-là. `green_layered.noyaux_green` rend maintenant les deux.
#
# LA PERMITTIVITÉ N'EST PLUS CHOISIE ICI, et c'était le deuxième défaut.
# `get_effective_epsilon` moyennait les épaisseurs de tout l'empilage, alors
# que l'ajustement DCIM normalise par le seul milieu porteur -- le stratifié
# sous la piste. Lire un ajustement dans une autre unité que la sienne se paie
# en racine(eps) sur la vitesse de phase. Les noyaux sortent désormais de
# `green_layered` avec leur mu_0 et leur 1/(eps_0 eps_ref) déjà dedans, et ce
# module n'a plus de permittivité à connaître.
#
# LA QUADRATURE INTÈGRE VRAIMENT LE 1/R, et c'était le troisième. Une règle de
# Gauss, même à sept points, n'intègre pas une singularité : elle
# l'échantillonne. La version précédente compensait par une correction
# logarithmique additive dont le poids -- « 1,0 si triangle partagé, 0,3 si
# sommet partagé » -- ne venait d'aucun calcul. Elle est supprimée. À la place,
# la part singulière -- l'image confondue avec la source, la seule qui pique --
# est intégrée par un changement de variable POLAIRE qui annule le 1/R contre
# son jacobien, exactement ; le reste, qui est borné, passe par Gauss.
# ==========================================================================


# Quadratures de Gauss sur triangle (coordonnées barycentriques + poids)
# Normalisées : somme des poids = 1 (l'aire est appliquée séparément)
GAUSS_TRI_3 = (
    np.array([[2/3, 1/6, 1/6],
              [1/6, 2/3, 1/6],
              [1/6, 1/6, 2/3]]),
    np.array([1/3, 1/3, 1/3])
)

GAUSS_TRI_7 = (
    np.array([
        [1/3, 1/3, 1/3],
        [0.059715871789770, 0.470142064105115, 0.470142064105115],
        [0.470142064105115, 0.059715871789770, 0.470142064105115],
        [0.470142064105115, 0.470142064105115, 0.059715871789770],
        [0.797426985353087, 0.101286507323456, 0.101286507323456],
        [0.101286507323456, 0.797426985353087, 0.101286507323456],
        [0.101286507323456, 0.101286507323456, 0.797426985353087],
    ]),
    np.array([0.225,
              0.132394152788506, 0.132394152788506, 0.132394152788506,
              0.125939180544827, 0.125939180544827, 0.125939180544827])
)

def _gauss_01(n):
    """Gauss-Legendre à n points, ramenée sur [0, 1]."""
    x, w = np.polynomial.legendre.leggauss(n)
    return 0.5 * (x + 1.0), 0.5 * w


# LES DEUX DIRECTIONS DU SECTEUR POLAIRE NE SE RESSEMBLENT PAS, et c'est mesuré.
#
# LE LONG DU RAYON (t), l'intégrande est exp(-jkR) fois une fonction linéaire.
# Sur une maille de circuit imprimé kR reste très petit devant 1 : quatre
# points sont déjà généreux.
#
# LE LONG DE LA BASE (s), l'intégrande est 1/|w(s)| et il PIQUE -- d'autant
# plus que le point d'observation approche la droite de l'arête, ce qui est
# précisément le cas des panneaux adjacents et celui d'un point proche d'un
# sommet. Ajouter des points de Gauss n'y répond pas bien : de cinq à seize
# points, l'écart contre la formule fermée de Wilton passait de 2,8 % à 0,04 %
# sur un point proche d'un sommet, et sans être monotone -- signe qu'on
# échantillonne un pic au lieu de l'intégrer.
#
# ON COUPE DONC L'INTERVALLE AU PIED DE LA PERPENDICULAIRE, là où |w(s)| est
# minimal, et on intègre les deux moitiés séparément : de chaque côté la
# fonction est monotone, et Gauss retrouve sa précision. Six points par moitié
# -- même coût que douze d'un seul tenant -- ramènent le pire cas à 0,001 %.
ORDRE_POLAIRE_S = 6           # PAR MOITIÉ : douze points en tout
ORDRE_POLAIRE_T = 4
GAUSS_POLAIRE = (_gauss_01(ORDRE_POLAIRE_S), _gauss_01(ORDRE_POLAIRE_T))

# À partir de combien de tailles de triangle une paire est « éloignée », donc
# traitable par la seule règle de Gauss. En dessous, la part singulière passe
# par les polaires. Trois tailles est la valeur usuelle ; c'est aussi celle qui
# était déjà écrite ici pour choisir entre 3 et 7 points.
SEUIL_PROCHE = 3.0

# Sous quelle dénivelée deux triangles sont considérés coplanaires, donc la
# désingularisation polaire (qui se fait DANS le plan) applicable. Un
# micromètre est très en dessous de toute épaisseur de cuivre.
SEUIL_COPLANAIRE = 1e-6


def _normale(verts: np.ndarray) -> np.ndarray:
    """La normale unitaire d'un triangle donné par ses trois sommets."""
    n = np.cross(verts[1] - verts[0], verts[2] - verts[0])
    norme = np.linalg.norm(n)
    if norme < 1e-30:
        return np.array([0.0, 0.0, 1.0])
    return n / norme


def points_polaires(r_obs: np.ndarray, verts: np.ndarray, ordre=None):
    """Points et poids de ∫_T f(r')/|r_obs - r'| dS', DÉSINGULARISÉE.

    UNE SINGULARITÉ EN 1/R SE MANGE PAR UN CHANGEMENT DE VARIABLE, pas par des
    points en plus. On découpe le triangle en trois secteurs ayant `r_obs` pour
    sommet, et on paramètre chaque secteur par

        r'(t, s) = r_obs + t · w(s),   w(s) = (a - r_obs) + s (b - a)

    avec t et s dans [0, 1]. Alors R = t |w(s)| et le jacobien vaut
    t |w × (b-a)| : le t s'annule EXACTEMENT, et

        ∫_secteur f/R dS' = 2 A_secteur ∫∫ f(r_obs + t w(s)) / |w(s)| dt ds

    où A_secteur est l'aire SIGNÉE -- ce qui fait que la formule reste juste
    quand `r_obs` est hors du triangle, les trois secteurs se compensant alors
    comme il faut. Il ne reste rien de singulier à intégrer, et une règle de
    Gauss-Legendre ordinaire retrouve toute sa précision.

    VALABLE DANS LE PLAN DU TRIANGLE. `r_obs` doit y être : c'est le cas du
    2,5D, où source et observation sont sur la même couche de cuivre. Hors du
    plan le noyau n'est de toute façon plus singulier, et l'appelant retombe
    sur Gauss.

    Args:
        r_obs: point d'observation, coplanaire au triangle
        verts: 3x3, les sommets
        ordre: ((noeuds_s, poids_s), (noeuds_t, poids_t)) sur [0,1] ;
               GAUSS_POLAIRE par défaut

    Returns:
        (points Nx3, poids N) tels que Σ w_i f(p_i) ≈ ∫_T f/R dS'
    """
    if ordre is None:
        ordre = GAUSS_POLAIRE
    (noeuds_s, poids_s), (noeuds_t, poids_t) = ordre
    n_hat = _normale(verts)

    # Les trois secteurs d'un coup : c'est le point chaud de l'assemblage, il
    # est appele une fois par point d'observation et par paire proche.
    a = verts                                   # (3, 3) : les origines d'arete
    b = np.roll(verts, -1, axis=0)              # (3, 3) : leurs extremites

    d1 = a - r_obs                              # (3, 3)
    d2 = b - a                                  # (3, 3)
    aires = 0.5 * (np.cross(d1, b - r_obs) @ n_hat)          # (3,)

    # LE PIED DE LA PERPENDICULAIRE, par secteur : s* = -(d1·d2)/|d2|^2, borné
    # à [0, 1]. C'est le minimum de |w(s)|, donc le sommet du pic.
    d2_carre = np.sum(d2 * d2, axis=1)
    d2_carre = np.where(d2_carre < 1e-300, 1.0, d2_carre)
    pied = np.clip(-np.sum(d1 * d2, axis=1) / d2_carre, 0.0, 1.0)      # (3,)

    # Les nœuds en s, DEUX MOITIÉS par secteur, avec leurs poids remis à
    # l'échelle de la moitié qu'ils couvrent.
    s_bas = pied[:, None] * noeuds_s[None, :]
    s_haut = pied[:, None] + (1.0 - pied)[:, None] * noeuds_s[None, :]
    n_s = np.concatenate([s_bas, s_haut], axis=1)                      # (3,2S)
    w_s = np.concatenate([pied[:, None] * poids_s[None, :],
                          (1.0 - pied)[:, None] * poids_s[None, :]], axis=1)

    w_vec = d1[:, None, :] + n_s[:, :, None] * d2[:, None, :]          # (3,2S,3)
    norme = np.linalg.norm(w_vec, axis=2)                              # (3,2S)

    valide = ((np.abs(aires)[:, None] > 1e-30) & (norme > 1e-30))
    norme_sure = np.where(valide, norme, 1.0)

    facteur = 2.0 * aires[:, None] * w_s / norme_sure                  # (3,2S)

    pts = r_obs + noeuds_t[None, None, :, None] * w_vec[:, :, None, :]  # (3,S,T,3)
    wts = facteur[:, :, None] * poids_t[None, None, :]                 # (3,S,T)
    wts = np.where(valide[:, :, None], wts, 0.0)

    return pts.reshape(-1, 3), wts.reshape(-1)


def _distances(pts_m: np.ndarray, pts_n: np.ndarray):
    """(rho, dz, R) entre deux jeux de points, en grille."""
    d = pts_m[:, None, :] - pts_n[None, :, :]
    rho = np.sqrt(d[..., 0] ** 2 + d[..., 1] ** 2)
    dz = d[..., 2]
    return rho, dz, np.sqrt(rho ** 2 + dz ** 2)


class MomentsTriangles:
    """Les moments de la fonction de Green sur une paire de triangles.

    POURQUOI DES MOMENTS ET NON DES IMPÉDANCES. Un triangle appartient jusqu'à
    trois fonctions RWG, donc une même paire de triangles est visitée jusqu'à
    neuf fois pendant l'assemblage. Ce qui change d'une visite à l'autre, c'est
    le sommet libre v et la longueur d'arête -- pas la géométrie d'intégration.
    En développant

        (p_m - v_m)·(p_n - v_n) = p_m·p_n - v_n·p_m - v_m·p_n + v_m·v_n

    tout ce qui dépend de v se lit sur quatre moments calculés UNE fois :

        q00 = ∫∫ G_q            le terme de charge, entier
        a00 = ∫∫ G_A
        a10 = ∫∫ p_m G_A        (vecteur)
        a01 = ∫∫ p_n G_A        (vecteur)
        a11 = ∫∫ p_m ⊗ p_n G_A  (tenseur, dont seule la trace sert ici)

    Le gain mesuré sur un maillage de ligne est proche d'un facteur sept, et il
    est gratuit : c'est de l'algèbre, pas une approximation.
    """

    __slots__ = ('q00', 'a00', 'a10', 'a01', 'a11')

    def __init__(self, q00, a00, a10, a01, a11):
        self.q00 = q00
        self.a00 = a00
        self.a10 = a10
        self.a01 = a01
        self.a11 = a11

    def terme_charge(self):
        """∫∫ G_q : le terme de charge ne dépend d'aucun sommet libre."""
        return self.q00

    def terme_courant(self, v_m: np.ndarray, v_n: np.ndarray):
        """∫∫ (p_m - v_m)·(p_n - v_n) G_A, reconstruit depuis les moments."""
        return (np.trace(self.a11)
                - np.dot(v_n, self.a10)
                - np.dot(v_m, self.a01)
                + float(np.dot(v_m, v_n)) * self.a00)


def _moments_gauss(verts_m, verts_n, aire_m, aire_n, noyaux, bary, poids,
                   reste_seulement=False):
    """Les moments par la seule règle de Gauss, sur les deux triangles."""
    pts_m = bary @ verts_m
    pts_n = bary @ verts_n
    rho, dz, _ = _distances(pts_m, pts_n)

    if reste_seulement:
        g_a = noyaux.g_a_reste(rho, dz)
        g_q = noyaux.g_q_reste(rho, dz)
    else:
        g_a = noyaux.g_a(rho, dz)
        g_q = noyaux.g_q(rho, dz)

    w = (poids[:, None] * poids[None, :]) * (aire_m * aire_n)

    wa = w * g_a
    q00 = np.sum(w * g_q)
    a00 = np.sum(wa)
    a10 = np.einsum('mn,mi->i', wa, pts_m)
    a01 = np.einsum('mn,ni->i', wa, pts_n)
    a11 = np.einsum('mn,mi,nj->ij', wa, pts_m, pts_n)
    return q00, a00, a10, a01, a11


def _moments_singuliers(verts_m, verts_n, aire_m, noyaux, bary, poids):
    """Les moments de la SEULE image confondue, par désingularisation polaire.

    L'intégrale extérieure reste une règle de Gauss sur le triangle test ; pour
    chacun de ses points, l'intégrale intérieure passe par les secteurs
    polaires. Le noyau y est amplitude · exp(-j k R)/(4 pi R) : c'est le 1/R
    que les polaires annulent, et le exp(-j k R) est régulier.
    """
    pts_m = bary @ verts_m
    k_ref = noyaux.k_ref
    amp_a = noyaux.amplitude_directe_a
    amp_q = noyaux.amplitude_directe_q

    q00 = 0.0 + 0j
    a00 = 0.0 + 0j
    a10 = np.zeros(3, dtype=complex)
    a01 = np.zeros(3, dtype=complex)
    a11 = np.zeros((3, 3), dtype=complex)

    for p_m, w_m in zip(pts_m, poids):
        pts_n, w_n = points_polaires(p_m, verts_n)
        if len(pts_n) == 0:
            continue

        r = np.linalg.norm(p_m[None, :] - pts_n, axis=1)
        # exp(-j k R)/(4 pi) : le 1/R est déjà dans les poids polaires.
        commun = np.exp(-1j * k_ref * r) / (4 * np.pi) * w_n
        poids_ext = w_m * aire_m

        contrib_a = poids_ext * amp_a * commun
        q00 += poids_ext * amp_q * np.sum(commun)
        a00 += np.sum(contrib_a)
        a10 += np.sum(contrib_a) * p_m
        a01 += contrib_a @ pts_n
        a11 += np.outer(p_m, contrib_a @ pts_n)

    return q00, a00, a10, a01, a11


def moments_triangles(verts_m, verts_n, aire_m, aire_n,
                      noyaux: NoyauxGreen) -> MomentsTriangles:
    """Les moments de la paire, en choisissant le traitement qui convient.

    ÉLOIGNÉE : le noyau est lisse sur les deux domaines, une règle de Gauss à
    trois points suffit et c'est le cas le plus fréquent.

    PROCHE OU CONFONDUE : on sépare. L'image confondue avec la source porte le
    1/R et passe par les polaires ; tout le reste -- les autres images, l'onde
    de surface -- est borné et passe par Gauss à sept points. Les deux parts
    s'additionnent, et aucune n'est corrigée après coup.

    NON COPLANAIRE : la désingularisation polaire se fait dans le plan du
    triangle source, elle n'a donc pas de sens hors plan -- mais hors plan le
    noyau n'est plus singulier non plus, et Gauss reprend ses droits.
    """
    c_m = verts_m.mean(axis=0)
    c_n = verts_n.mean(axis=0)
    distance = float(np.linalg.norm(c_m - c_n))
    taille = max(np.sqrt(aire_m), np.sqrt(aire_n))
    coplanaire = abs(c_m[2] - c_n[2]) < SEUIL_COPLANAIRE

    if distance > SEUIL_PROCHE * taille or not coplanaire:
        bary, poids = (GAUSS_TRI_3 if distance > SEUIL_PROCHE * taille
                       else GAUSS_TRI_7)
        return MomentsTriangles(*_moments_gauss(
            verts_m, verts_n, aire_m, aire_n, noyaux, bary, poids))

    bary, poids = GAUSS_TRI_7
    reg = _moments_gauss(verts_m, verts_n, aire_m, aire_n, noyaux,
                         bary, poids, reste_seulement=True)
    sing = _moments_singuliers(verts_m, verts_n, aire_m, noyaux, bary, poids)
    return MomentsTriangles(*[r + s for r, s in zip(reg, sing)])


def _triangles_de(rwg: RWGBasis, vertices, elements):
    """Les deux triangles d'une RWG : (signe, sommet libre, aire, sommets)."""
    return (
        (+1.0, vertices[rwg.vertex_plus], rwg.area_plus,
         vertices[elements[rwg.tri_plus]], rwg.tri_plus),
        (-1.0, vertices[rwg.vertex_minus], rwg.area_minus,
         vertices[elements[rwg.tri_minus]], rwg.tri_minus),
    )


def compute_interactions(rwg_m: RWGBasis, rwg_n: RWGBasis, freq: float,
                         noyaux: NoyauxGreen, vertices: np.ndarray,
                         elements: np.ndarray, cache: Optional[Dict] = None
                         ) -> complex:
    """L'impédance mutuelle Z_mn de la formulation MPIE.

        Z_mn = j omega ∫∫ f_m·f_n G_A + 1/(j omega) ∫∫ (div f_m)(div f_n) G_q

    avec, sur chaque triangle T^p :  f = s_p (l/2A_p)(r - v_p)  et
    div f = s_p l/A_p. Les deux fonctions de Green sortent de `noyaux`, mises à
    l'échelle : G_A porte son mu_0, G_q son 1/(eps_0 eps_ref). Ce module n'a
    donc aucune constante de milieu à choisir, et c'est voulu -- voir l'en-tête.

    L'ÉLÉMENT DIAGONAL N'EST PLUS UN CAS À PART. L'ancienne version avait une
    fonction séparée qui, entre autres, appelait la fonction de Green avec une
    liste d'images VIDE pour les contributions croisées T+/T- : le couplage
    entre les deux moitiés de la fonction de base valait donc zéro. Ici les
    quatre paires de triangles passent par le même chemin, diagonale comprise ;
    c'est la quadrature qui sait qu'une paire est confondue, pas l'appelant.

    Args:
        rwg_m, rwg_n: les deux fonctions de base
        freq: la fréquence (elle ne sert plus qu'à omega : les noyaux la
              portent déjà)
        noyaux: les deux fonctions de Green, de `green_layered.noyaux_green`
        vertices, elements: le maillage
        cache: dictionnaire de moments par paire de triangles, partagé par
               l'assemblage. Facultatif, mais il divise le travail par ~7.
    """
    omega = 2 * np.pi * freq

    l_m = rwg_m.edge_length
    l_n = rwg_n.edge_length

    acc_courant = 0.0 + 0j     # ∫∫ f_m·f_n G_A, sans les coefficients
    acc_charge = 0.0 + 0j      # ∫∫ (div f_m)(div f_n) G_q

    for s_m, v_m, aire_m, verts_m, i_m in _triangles_de(rwg_m, vertices, elements):
        if aire_m <= 0:
            continue
        for s_n, v_n, aire_n, verts_n, i_n in _triangles_de(rwg_n, vertices, elements):
            if aire_n <= 0:
                continue

            cle = (i_m, i_n) if i_m <= i_n else (i_n, i_m)
            moments = None if cache is None else cache.get(cle)

            if moments is None:
                if cle[0] == i_m:
                    moments = moments_triangles(verts_m, verts_n,
                                                aire_m, aire_n, noyaux)
                else:
                    # Le cache est indexé par paire NON ordonnée ; on calcule
                    # dans l'ordre de la clé et on lira transposé.
                    moments = moments_triangles(verts_n, verts_m,
                                                aire_n, aire_m, noyaux)
                if cache is not None:
                    cache[cle] = moments

            if cle[0] == i_m:
                courant = moments.terme_courant(v_m, v_n)
            else:
                # Les moments ont été calculés (n, m) : m devient le second.
                courant = moments.terme_courant(v_n, v_m)

            charge = moments.terme_charge()

            acc_courant += (s_m * s_n * (l_m / (2 * aire_m))
                            * (l_n / (2 * aire_n)) * courant)
            acc_charge += (s_m * l_m / aire_m) * (s_n * l_n / aire_n) * charge

    return 1j * omega * acc_courant + acc_charge / (1j * omega)


def fill_z_matrix(rwg_basis: List[RWGBasis], freq: float,
                  noyaux: NoyauxGreen,
                  vertices: np.ndarray = None,
                  elements: np.ndarray = None) -> np.ndarray:
    """Assemble la matrice d'impédance complète Z.

    Deux économies, toutes deux exactes :

      · la RÉCIPROCITÉ. Z_mn = Z_nm, donc seul le triangle supérieur est
        calculé. Facteur deux.
      · le CACHE DE MOMENTS par paire de triangles. Un triangle appartient
        jusqu'à trois RWG, donc une paire de triangles est visitée jusqu'à neuf
        fois ; ses moments ne dépendent que de la géométrie. Voir
        `MomentsTriangles`.

    `vertices` et `elements` sont obligatoires : l'ancienne version se rabattait
    silencieusement sur `np.zeros((100, 3))`, ce qui produisait une matrice Z
    calculée sur une géométrie nulle sans lever la moindre erreur.
    """
    n_basis = len(rwg_basis)
    logger.info(f"Assemblage de la matrice Z ({n_basis}x{n_basis})")

    if vertices is None or elements is None:
        raise ValueError(
            "fill_z_matrix: 'vertices' et 'elements' sont obligatoires. "
            "L'ancien repli sur des tableaux nuls produisait une matrice Z "
            "physiquement fausse sans lever d'erreur."
        )

    z_matrix = np.zeros((n_basis, n_basis), dtype=complex)
    cache = {}

    total = n_basis * (n_basis + 1) // 2
    computed = 0
    log_interval = max(1, total // 10)

    for m in range(n_basis):
        for n in range(m, n_basis):
            z_val = compute_interactions(
                rwg_basis[m], rwg_basis[n], freq, noyaux,
                vertices, elements, cache
            )

            z_matrix[m, n] = z_val
            if m != n:
                z_matrix[n, m] = z_val

            computed += 1
            if computed % log_interval == 0:
                logger.info(f"  Progression : {100 * computed / total:.1f}%")

    logger.info(f"  Matrice Z assemblée ({len(cache)} paires de triangles)")

    return z_matrix


@njit(parallel=True)
def fill_z_matrix_freespace_numba(centers: np.ndarray, edge_lengths: np.ndarray,
                                  areas: np.ndarray, freq: float) -> np.ndarray:
    """
    Noyau Numba : matrice Z de RÉFÉRENCE EN ESPACE LIBRE (benchmark uniquement)

    ATTENTION - Ne pas utiliser dans le pipeline de simulation.

    Le retour d'analyse signalait ce noyau comme « code mort ». Le brancher
    dans fill_z_matrix serait toutefois pire que de le laisser inutilisé :
    il n'a accès ni au stackup ni aux images DCIM, et suppose donc un milieu
    homogène en espace libre. Sur un microruban sur FR4, il ignorerait le
    couplage piste/plan de masse à travers le diélectrique et renverrait des
    paramètres S plausibles mais faux, sans aucun avertissement.

    Il évalue en outre la fonction de Green au centre de l'arête (1 point),
    ce qui est précisément l'erreur de quadrature corrigée au point 2.2.

    Pour accélérer réellement l'assemblage stratifié, il faudrait tabuler les
    deux noyaux de `NoyauxGreen` sur une grille de rho par fréquence puis
    interpoler dans un noyau nopython. C'est un chantier distinct, avec sa
    propre validation d'erreur d'interpolation. Le cache de moments par paire
    de triangles (voir `MomentsTriangles`) est le gain qui a été pris, parce
    qu'il est exact ; celui-là ne l'est pas.

    Conservé comme référence analytique pour tests de non-régression : sur une
    géométrie sans substrat (epsilon_r = 1), le chemin Python doit converger
    vers ce résultat au raffinement du maillage.

    Args:
        centers: Nx3 array des centres des arêtes
        edge_lengths: N array des longueurs d'arêtes
        areas: Nx2 array des aires (T+, T-)
        freq: Fréquence

    Returns:
        Matrice Z en espace libre homogène
    """
    n = len(centers)
    z_matrix = np.zeros((n, n), dtype=np.complex128)
    omega = 2 * np.pi * freq
    k = omega / 3e8
    
    for m in prange(n):
        for n_idx in range(n):
            if m == n_idx:
                # Auto-interaction
                area_avg = (areas[m, 0] + areas[m, 1]) / 2
                r_eq = np.sqrt(area_avg / np.pi)
                z_matrix[m, n_idx] = 1j * omega * MU_0 / (4 * np.pi) * np.log(2 * r_eq)
            else:
                # Interaction mutuelle
                r_vec = centers[m] - centers[n_idx]
                r = np.sqrt(r_vec[0]**2 + r_vec[1]**2 + r_vec[2]**2)
                
                if r > 1e-10:
                    g = np.exp(-1j * k * r) / (4 * np.pi * r)
                    l_m = edge_lengths[m]
                    l_n = edge_lengths[n_idx]
                    a_m = (areas[m, 0] + areas[m, 1]) / 2
                    a_n = (areas[n_idx, 0] + areas[n_idx, 1]) / 2
                    
                    z_matrix[m, n_idx] = -1j * omega * MU_0 * l_m * l_n / (4 * a_m * a_n) * g
    
    return z_matrix


# ==========================================================================
# PORT VERTICAL : injection de courant entre piste et plan de masse
# --------------------------------------------------------------------------
# LE PORT ACTUEL EST UNE FENTE HORIZONTALE. La coupe RWG coupe le plan du cuivre,
# perpendiculairement a la piste. Le courant injecté est donc HORIZONTAL.
#
# UN VRAI PORT MICRORUBAN injecte le courant VERTICALEMENT : entre la piste et
# le plan de masse. Le générateur est connecte a la pastille, qui voit le plan
# de masse a travers le dielectrique.
#
# CE QU'IL FAUT :
#   1. Des fonctions de base VERTICALES sur le via de port : RWG vertical,
#      ou element filaire attache au conducteur.
#   2. La fonction de Green G_A^zz : composante verticale du potentiel vecteur.
#      `green_layered` sait deja cascader les modes TE et TM ; il manque la
#      composante z du dyade.
#   3. Le de-embarquement par la methode des deux longueurs (T2T1^-1).
#
# CE QUI EST FAIT ICI : un port vertical simplifie. On ajoute un "via de port"
# au maillage -- un filament vertical entre la piste et le plan de masse --
# et on excite ce filament. C'est une approximation mais ca introduit le
# courant VERTICAL dans le systeme.
# ==========================================================================

def _creer_via_port(vertices, elements, position_xy, z_piste, z_plan, layer):
    """Cree un via de port : filament vertical entre piste et plan.

    Ajoute deux vertex (un en z_piste, un en z_plan) et deux triangles
    formant un filament vertical. Retourne les indices de base RWG du port.

    Args:
        vertices: array des sommets (N, 3)
        elements: array des elements (M, 3)
        position_xy: (x, y) du via en metres
        z_piste: z de la couche de piste
        z_plan: z du plan de masse
        layer: couche du port (indice de stackup)

    Returns:
        (vertex_haut, vertex_bas, rwg_indices) ou None si echec
    """
    n_verts = len(vertices)
    n_basis = len(elements)

    # Ajouter deux vertex : un en haut (piste), un en bas (plan)
    vertex_haut = n_verts
    vertex_bas = n_verts + 1

    # Ajouter les nouveaux vertex
    vertices = np.vstack([vertices,
                          [position_xy[0], position_xy[1], z_piste],
                          [position_xy[0], position_xy[1], z_plan]])

    # Creer deux triangles formant le filament
    # Triangle 1: le long du filament, partie superieure
    # Triangle 2: le long du filament, partie inferieure
    # On cree un mini-element en forme de "V" vertical

    # Les vertex du filament
    # v0 = vertex_haut, v1 = vertex_bas, v2 = point milieu du cote

    # Pour simplifier : deux triangles rectangles qui partagent l'arete verticale
    # Triangle A: (vertex_haut, vertex_bas, vertex_haut+2)
    # Triangle B: (vertex_haut, vertex_bas, vertex_bas+2)

    v_creux = n_verts + 2  # point lateral pour former le triangle

    # Creer les deux triangles du filament
    decalage = 0.1e-3  # 0.1 mm de rayon
    vertices = np.vstack([vertices,
                          [position_xy[0] + decalage, position_xy[1], z_piste]])

    nouveau_triangle_1 = np.array([vertex_haut, vertex_bas, vertex_haut + 2])
    elements = np.vstack([elements, nouveau_triangle_1])

    return {
        'vertex_haut': vertex_haut,
        'vertex_bas': vertex_bas,
        'vertices': vertices,
        'elements': elements,
        'position_xy': position_xy,
    }


def excitation_via_port(via_info, rwg_basis, vertices, z_piste, z_plan,
                       v_gap=1.0):
    """Le second membre pour un port vertical (via).

    Le port vertical injecte le courant ENTRE la piste et le plan de masse.
    On excite la connexion verticale entre les deux.

    Args:
        via_info: dict avec 'position' = (x, y) du via
        rwg_basis: liste des fonctions de base RWG
        vertices: array des sommets
        z_piste: z de la couche de piste
        z_plan: z du plan de masse
        v_gap: tension du gap (1V)

    Returns:
        vecteur v pour le systeme lineaire
    """
    n_basis = len(rwg_basis)
    v = np.zeros(n_basis, dtype=complex)

    position = np.asarray(via_info.get('position', [0, 0]), dtype=float)

    # Trouver les RWG qui sont PRES du via (verticalement)
    # Une vraie implementation aurait des fonctions de base verticales.
    # Ici on approxime : on excite les aretes HORIZONTALES qui sont
    # sur la couche de la piste et proches du via.

    # Recherche par distance dans le plan xy
    seuil_distance = 0.5e-3  # 0.5 mm

    for i, rwg in enumerate(rwg_basis):
        # Coordonnees du centre de l'arete
        tri_plus_vertices = vertices[rwg.tri_plus]
        tri_minus_vertices = vertices[rwg.tri_minus]

        # Centre de l'arete (milieu de l'arete commune)
        edge_center = (vertices[rwg.edge_vertices[0]] + vertices[rwg.edge_vertices[1]]) / 2

        # Distance horizontale au via
        dx = edge_center[0] - position[0]
        dy = edge_center[1] - position[1]
        dist_xy = np.sqrt(dx*dx + dy*dy)

        if dist_xy < seuil_distance:
            # Verifier que l'arete est sur la bonne couche (z ~= z_piste)
            z_arete = edge_center[2]
            if abs(z_arete - z_piste) < 1e-6:  # sur la couche de piste
                # Excitation avec ponderation par distance
                ponderation = 1.0 - dist_xy / seuil_distance
                v[i] = v_gap * ponderation * rwg.edge_length

    return v


def courant_total_via(courants, rwg_basis, vertices, z_piste, z_plan,
                     position_xy):
    """Le courant total traversant le plan de la piste pour un port vertical.

    Integre le courant sur toutes les RWG qui traversent le plan z = z_piste
    au voisinage du via.

    Args:
        courants: vecteur des courants (solution du systeme MoM)
        rwg_basis: liste des fonctions de base RWG
        vertices: array des sommets
        z_piste: z de la couche de piste
        z_plan: z du plan de masse
        position_xy: position du via

    Returns:
        courant total en amperes
    """
    I_total = 0.0 + 0j
    seuil = 0.5e-3  # 0.5 mm

    for i, rwg in enumerate(rwg_basis):
        edge_center = (vertices[rwg.edge_vertices[0]] + vertices[rwg.edge_vertices[1]]) / 2
        dx = edge_center[0] - position_xy[0]
        dy = edge_center[1] - position_xy[1]
        dist = np.sqrt(dx*dx + dy*dy)

        if dist < seuil:
            # Courant a travers l'arete
            I_total += courants[i] * rwg.edge_length

    return I_total
#
#     |Y21 / Y11| = 1,5 . 10^-5      |S11| = 1,0000     |S21| = 0,0000
#
# CE N'EST PAS UNE IMPRECISION, C'EST UN COURT-CIRCUIT. Une tension imposee sur
# une seule arete interne d'un ruban continu est contournee par le metal d'a
# cote : le courant fait le tour de la « fente » par les triangles voisins sans
# jamais descendre la ligne. L'admittance vue est celle de cette boucle locale
# -- pres d'un siemens, soit une impedance d'entree de l'ordre de l'ohm -- et
# elle noie completement le chemin utile. Le solveur rendait donc |S21| = 0
# quelle que soit la geometrie, et aucun travail sur la fonction de Green ne
# l'aurait montre.
#
# ORIENTER MIEUX L'ARETE NE SUFFIT PAS, et c'est mesure aussi : en prenant la
# mieux alignee sur l'axe de la ligne, |Y21/Y11| tombe a 3,4 . 10^-6 -- ca
# empire. En excitant toutes les aretes bien alignees du voisinage, 5 . 10^-4.
# Toujours rien.
#
# CE QU'IL FAUT EST UNE COUPE COMPLETE : un ensemble d'aretes tel que TOUT
# chemin de courant d'un cote a l'autre en traverse une. Alors la tension n'est
# plus contournable, et le modele delta-gap redevient ce qu'il est cense etre.
#
# ET UNE COUPE SE RECONNAIT SANS GEOMETRIE COMPLIQUEE. On coupe l'ensemble des
# TRIANGLES par un plan ; les aretes de la coupe sont exactement celles dont les
# deux triangles tombent de part et d'autre. C'est, par construction, la
# frontiere entre les deux paquets de triangles : rien ne passe d'un paquet a
# l'autre sans franchir une de ces aretes. Le critere ne suppose ni maillage
# regulier, ni piste rectiligne, et il vaut aussi bien pour un port au bord
# qu'au milieu d'un plan.
#
# CE QUE CETTE VERSION NE FAIT TOUJOURS PAS -- le « lot 5 bis » de A-FAIRE :
#   · pas de DE-EMBARQUEMENT. La coupe porte encore la reactance de la
#     discontinuite d'acces ; sur une ligne courte elle n'est pas negligeable.
#     Se fait par la methode des deux longueurs, et demande deux resolutions ;
#   · pas de pastille, de via, ni de connecteur : le port est une fente idelae
#     dans le plan du cuivre ;
#   · la DIRECTION du port est deduite -- du champ 'direction' quand le JSON le
#     porte, sinon du centre de gravite du maillage. Juste pour un acces en
#     bout de piste, ce qui est le cas courant ; a revoir pour un port au
#     milieu d'une structure.
# ==========================================================================

def _cotes_du_plan(vertices, elements, point, normale):
    """De quel cote du plan tombe chaque triangle (par son centre de gravite)."""
    centres = vertices[elements].mean(axis=1)
    return (centres - np.asarray(point, dtype=float)) @ np.asarray(normale,
                                                                   dtype=float)


def aretes_de_coupe(rwg_basis: List[RWGBasis], vertices: np.ndarray,
                    elements: np.ndarray, point, normale
                    ) -> List[Tuple[int, float]]:
    """Les aretes RWG que le plan (point, normale) coupe, avec leur sens.

    Le courant d'une fonction RWG va de T+ vers T-. Si T+ est du cote negatif
    et T- du cote positif, ce courant traverse le plan dans le sens de la
    normale, et le signe rendu est +1 ; dans l'autre sens, -1.

    L'ENSEMBLE RENDU EST UNE COUPE, et pas seulement une collection d'aretes :
    c'est la frontiere exacte entre les triangles du cote negatif et ceux du
    cote positif. Aucun courant ne passe d'un cote a l'autre sans en traverser
    une -- c'est ce qui fait qu'une tension imposee dessus n'est pas
    contournable.
    """
    cotes = _cotes_du_plan(vertices, elements, point, normale)

    coupe = []
    for n, r in enumerate(rwg_basis):
        a = cotes[r.tri_plus]
        b = cotes[r.tri_minus]
        if a < 0.0 <= b:
            coupe.append((n, +1.0))
        elif b < 0.0 <= a:
            coupe.append((n, -1.0))
    return coupe


def _direction_du_port(port: Dict, position: np.ndarray,
                       vertices: np.ndarray) -> np.ndarray:
    """Vers ou regarde le port : la normale du plan de coupe.

    Le champ 'direction' du port quand il existe -- c'est a l'editeur de le
    dire, il connait l'axe de la piste. Sinon la direction du centre de gravite
    du maillage, ce qui est juste pour un acces en bout de piste.
    """
    d = port.get('direction')
    if d is not None:
        d = np.asarray(d, dtype=float).ravel()
        if len(d) == 2:
            d = np.array([d[0], d[1], 0.0])
        if np.linalg.norm(d) > 0:
            return d / np.linalg.norm(d)

    v = vertices.mean(axis=0) - position
    v[2] = 0.0
    norme = np.linalg.norm(v)
    if norme < 1e-15:
        return np.array([1.0, 0.0, 0.0])
    return v / norme


def localiser_ports(ports: List[Dict], rwg_basis: List[RWGBasis],
                    vertices: np.ndarray, elements: np.ndarray,
                    taille_maille: float = None
                    ) -> List[List[Tuple[int, float]]]:
    """Associe a chaque port la COUPE d'aretes qui le represente.

    LE PLAN EST DECALE VERS L'INTERIEUR, et il faut qu'il le soit : pose
    exactement sur la position du port -- c'est-a-dire sur le bord du cuivre --
    tous les triangles tombent du meme cote et la coupe est vide. On decale
    donc d'une maille, et on essaie plus loin si besoin.

    Args:
        ports: la liste des ports, avec 'position' et facultativement
               'direction'
        rwg_basis, vertices, elements: le maillage et ses fonctions de base
        taille_maille: l'echelle du decalage. Deduite des aretes si absente

    Returns:
        Une liste par port, de couples (indice RWG, signe). Une liste VIDE
        signale un port non localise, et l'appelant doit le traiter comme un
        echec -- pas comme un port muet.
    """
    if not rwg_basis:
        return [[] for _ in ports]

    if taille_maille is None:
        taille_maille = float(np.mean([r.edge_length for r in rwg_basis]))

    coupes = []
    for port in ports:
        position = np.asarray(port['position'], dtype=float).ravel()
        if len(position) == 2:
            position = np.array([position[0], position[1], 0.0])
        normale = _direction_du_port(port, position, vertices)

        coupe = []
        for facteur in (1.0, 2.0, 3.0, 5.0, 8.0):
            candidat = aretes_de_coupe(
                rwg_basis, vertices, elements,
                position + facteur * taille_maille * normale, normale)
            if candidat:
                coupe = candidat
                break

        if not coupe:
            logger.warning(
                "  Port %s : aucune coupe trouvee autour de (%.3f, %.3f) mm. "
                "Le plan de coupe ne rencontre aucun conducteur -- position "
                "hors du cuivre, ou direction du port fausse.",
                port.get('id', '?'), position[0] * 1e3, position[1] * 1e3)
        else:
            logger.debug("  Port %s -> coupe de %d aretes, normale "
                         "(%.2f, %.2f)", port.get('id', '?'), len(coupe),
                         normale[0], normale[1])
        coupes.append(coupe)

    return coupes


def vecteur_de_coupe(rwg_basis: List[RWGBasis], coupe: List[Tuple[int, float]],
                     n_basis: int, v_gap: float = 1.0) -> np.ndarray:
    """Le second membre d'une excitation en fente sur une coupe.

    UN CHAMP E = v_gap delta(plan) DONNE V_m = v_gap l_m s_m, exactement : le
    produit de la tension par le flux de la fonction de base a travers la
    coupe, qui vaut l_m s_m. Rien n'est approche ici, et c'est pourquoi la
    somme des courants sur la coupe est le courant du port.
    """
    v = np.zeros(n_basis, dtype=complex)
    for n, signe in coupe:
        v[n] = v_gap * signe * rwg_basis[n].edge_length
    return v


def courant_de_coupe(courants: np.ndarray, rwg_basis: List[RWGBasis],
                     coupe: List[Tuple[int, float]]) -> complex:
    """Le courant total qui traverse une coupe, dans le sens de sa normale."""
    return sum(courants[n] * rwg_basis[n].edge_length * signe
               for n, signe in coupe)


def build_v_vector(rwg_basis: List[RWGBasis], ports: List[Dict], freq: float,
                   vertices: np.ndarray = None, elements: np.ndarray = None,
                   coupes: List[List[Tuple[int, float]]] = None,
                   excited_port: int = 0, v_amplitude: float = 1.0
                   ) -> np.ndarray:
    """Le vecteur second membre : une fente sur la coupe du port excite.

    Les autres ports sont court-circuites (V = 0), ce qui est le modele
    delta-gap ordinaire.
    """
    n_basis = len(rwg_basis)
    if n_basis == 0:
        return np.zeros(0, dtype=complex)

    if coupes is None:
        if vertices is None or elements is None:
            raise ValueError("build_v_vector : 'coupes', ou bien 'vertices' "
                             "et 'elements', sont necessaires")
        coupes = localiser_ports(ports, rwg_basis, vertices, elements)

    if excited_port >= len(coupes):
        raise ValueError("build_v_vector : port %d hors limites (%d ports)"
                         % (excited_port, len(coupes)))

    coupe = coupes[excited_port]
    if not coupe:
        raise ValueError(
            "build_v_vector : le port %d n'a pas de coupe. Exciter un vecteur "
            "nul rendrait des courants nuls et des parametres S plausibles et "
            "faux -- on echoue ici." % excited_port)

    v = vecteur_de_coupe(rwg_basis, coupe, n_basis, v_amplitude)
    logger.debug("  V construit : port %d sur %d aretes, |V| = %.3e",
                 excited_port, len(coupe), np.linalg.norm(v))
    return v


def apply_preconditioner(z_matrix: np.ndarray) -> np.ndarray:
    """
    Applique un préconditionneur pour améliorer le conditionnement
    
    Args:
        z_matrix: Matrice d'impédance
        
    Returns:
        Matrice préconditionnée
    """
    # Préconditionneur diagonal simple
    diag = np.diag(z_matrix)
    diag_sqrt = np.sqrt(np.abs(diag))
    
    precond = np.diag(1.0 / (diag_sqrt + 1e-12))
    
    z_precond = precond @ z_matrix @ precond
    
    return z_precond, precond
