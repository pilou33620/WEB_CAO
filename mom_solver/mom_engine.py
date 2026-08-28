"""
Module d'assemblage de la matrice d'impédance et construction du système MoM
Implémentation de l'équation intégrale EFIE avec accélération Numba
"""

import numpy as np
import logging
from typing import List, Dict
from numba import njit, prange
from scipy.spatial.distance import cdist

from mesher import RWGBasis, get_rwg_center
from green_layered import (green_2d_layered, self_interaction_term, 
                           dyadic_green_tensor, ComplexImage)

logger = logging.getLogger(__name__)

# Constantes
MU_0 = 4 * np.pi * 1e-7
EPSILON_0 = 8.854187817e-12
ETA_0 = np.sqrt(MU_0 / EPSILON_0)  # Impédance du vide (~377 Ω)


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


def select_quadrature(distance: float, size: float):
    """
    Choisit l'ordre de quadrature selon la séparation des triangles

    CORRECTION (point 2.2): l'ancienne intégration évaluait la fonction de
    Green en 1 seul point (le centroïde), ce qui produit des erreurs massives
    en champ proche. On utilise 7 points quand les triangles sont proches
    (< 3 tailles caractéristiques) et 3 points au-delà.

    Args:
        distance: Distance entre centroïdes
        size: Taille caractéristique des triangles

    Returns:
        (points barycentriques, poids)
    """
    if distance < 3.0 * size:
        return GAUSS_TRI_7
    return GAUSS_TRI_3


def _bary_to_cart(verts: np.ndarray, bary: np.ndarray) -> np.ndarray:
    """Convertit des coordonnées barycentriques en points cartésiens"""
    return bary @ verts


def compute_interactions(rwg_m: RWGBasis, rwg_n: RWGBasis, freq: float,
                        images: List[ComplexImage], stackup: Dict,
                        vertices: np.ndarray, elements: np.ndarray) -> complex:
    """
    Évalue l'interaction électromagnétique entre deux fonctions RWG

    CORRECTION: Implémente la formulation MPIE (Mixed Potential Integral
    Equation) complète. L'ancienne version présentait deux erreurs majeures :

    1. Le terme de charge (potentiel scalaire) était totalement absent.
       Seul le potentiel vecteur était calculé, alors que le terme de
       divergence domine en basse fréquence et pour les structures planaires.
    2. Le produit f_m·f_n était calculé comme un produit de magnitudes
       scalaires, ignorant la direction vectorielle des fonctions RWG.

    Formulation correcte :
        Z_mn = jωμ₀ ∫∫ f_m·f_n G dS dS'
             + 1/(jωε) ∫∫ (∇·f_m)(∇·f_n) G dS dS'

    avec, sur chaque triangle T^p :
        f(r)   = s_p · (l/2A_p) · (r - v_p)
        ∇·f(r) = s_p · (l/A_p)

    Args:
        rwg_m: Fonction de base test (observation)
        rwg_n: Fonction de base source
        freq: Fréquence
        images: Sources images DCIM
        stackup: Stackup du PCB
        vertices: Sommets du maillage
        elements: Éléments du maillage

    Returns:
        Valeur de l'impédance Z_mn
    """
    omega = 2 * np.pi * freq

    # Si m == n : élément diagonal (auto-interaction)
    if rwg_m.edge_index == rwg_n.edge_index:
        return compute_self_interaction(rwg_m, freq, vertices, elements, stackup)

    l_m = rwg_m.edge_length
    l_n = rwg_n.edge_length

    # Description des 4 triangles : (signe, sommet libre, aire, sommets)
    tris_m = [
        (+1.0, rwg_m.vertex_plus,  rwg_m.area_plus,  vertices[elements[rwg_m.tri_plus]]),
        (-1.0, rwg_m.vertex_minus, rwg_m.area_minus, vertices[elements[rwg_m.tri_minus]]),
    ]
    tris_n = [
        (+1.0, rwg_n.vertex_plus,  rwg_n.area_plus,  vertices[elements[rwg_n.tri_plus]]),
        (-1.0, rwg_n.vertex_minus, rwg_n.area_minus, vertices[elements[rwg_n.tri_minus]]),
    ]

    # Accumulateurs des deux potentiels
    acc_vector = 0.0 + 0j   # ∫∫ f_m·f_n G
    acc_scalar = 0.0 + 0j   # ∫∫ (∇·f_m)(∇·f_n) G

    for s_m, v_m_idx, area_m, verts_m in tris_m:
        if area_m <= 0:
            continue
        v_m = vertices[v_m_idx]
        size_m = np.sqrt(area_m)

        for s_n, v_n_idx, area_n, verts_n in tris_n:
            if area_n <= 0:
                continue
            v_n = vertices[v_n_idx]
            size_n = np.sqrt(area_n)

            # Quadrature adaptative selon la proximité des triangles
            c_m = verts_m.mean(axis=0)
            c_n = verts_n.mean(axis=0)
            dist = np.linalg.norm(c_m - c_n)
            bary, weights = select_quadrature(dist, max(size_m, size_n))

            pts_m = _bary_to_cart(verts_m, bary)
            pts_n = _bary_to_cart(verts_n, bary)

            # Divergences (constantes par triangle)
            div_m = s_m * l_m / area_m
            div_n = s_n * l_n / area_n

            sum_vec = 0.0 + 0j
            sum_sca = 0.0 + 0j

            for i, w_i in enumerate(weights):
                p_m = pts_m[i]
                # Vecteur RWG en p_m : s_m · (l_m/2A_m) · (p_m - v_m)
                f_m_vec = s_m * (l_m / (2 * area_m)) * (p_m - v_m)

                for j, w_j in enumerate(weights):
                    p_n = pts_n[j]
                    f_n_vec = s_n * (l_n / (2 * area_n)) * (p_n - v_n)

                    g = green_2d_layered(p_m, p_n, freq, stackup, images)

                    # Produit scalaire vectoriel correct
                    sum_vec += w_i * w_j * np.dot(f_m_vec, f_n_vec) * g
                    sum_sca += w_i * w_j * g

            # Jacobiens : les poids sont normalisés, on applique les aires
            acc_vector += sum_vec * area_m * area_n
            acc_scalar += div_m * div_n * sum_sca * area_m * area_n

    # Permittivité effective du substrat (cohérente avec la fonction de Green)
    eps = EPSILON_0 * get_effective_epsilon(stackup)

    # Z_mn = jωμ₀ · A_term + 1/(jωε) · Phi_term
    z_mn = 1j * omega * MU_0 * acc_vector + acc_scalar / (1j * omega * eps)

    # Traitement de la quasi-singularité pour fonctions adjacentes
    # (CORRECTION point 2.1 : integrate_singular_term était défini mais jamais appelé)
    z_mn += integrate_singular_term(rwg_m, rwg_n, vertices, elements, freq, stackup)

    return z_mn


def get_effective_epsilon(stackup: Dict) -> complex:
    """
    Permittivité relative effective du substrat

    Moyenne pondérée par l'épaisseur des couches diélectriques. Assure la
    cohérence entre le terme de charge MPIE et la fonction de Green.

    Args:
        stackup: Stackup du PCB

    Returns:
        Permittivité relative complexe effective
    """
    layers = stackup.get('layers', [])

    num = 0.0 + 0j
    den = 0.0

    for layer in layers:
        if layer.get('type') == 'copper':
            continue
        t = layer.get('thickness', 0.0)
        if t <= 0:
            continue
        eps_r = layer.get('epsilon_r', 1.0) * (1 - 1j * layer.get('tan_delta', 0.0))
        num += eps_r * t
        den += t

    if den <= 0:
        return 1.0 + 0j

    return num / den


def compute_self_interaction(rwg: RWGBasis, freq: float,
                             vertices: np.ndarray, elements: np.ndarray,
                             stackup: Dict = None) -> complex:
    """
    Calcule l'auto-impédance (élément diagonal) avec extraction de singularité

    CORRECTION: Ajout du terme de potentiel scalaire (charge), absent de
    l'ancienne version. Pour l'élément diagonal, les deux contributions
    self de T+ et T- s'ajoutent avec (∇·f)² > 0, et les termes croisés
    T+/T- entrent avec un signe négatif.

    Args:
        rwg: Fonction de base RWG
        freq: Fréquence
        vertices: Sommets
        elements: Éléments
        stackup: Stackup (pour la permittivité effective)

    Returns:
        Auto-impédance Z_nn
    """
    omega = 2 * np.pi * freq
    l_e = rwg.edge_length

    eps_r = get_effective_epsilon(stackup) if stackup else 1.0 + 0j
    eps = EPSILON_0 * eps_r

    tris = [
        (+1.0, rwg.vertex_plus,  rwg.area_plus,  vertices[elements[rwg.tri_plus]]),
        (-1.0, rwg.vertex_minus, rwg.area_minus, vertices[elements[rwg.tri_minus]]),
    ]

    acc_vector = 0.0 + 0j
    acc_scalar = 0.0 + 0j

    bary, weights = GAUSS_TRI_7

    for s_p, v_p_idx, area_p, verts_p in tris:
        if area_p <= 0:
            continue
        v_p = vertices[v_p_idx]
        div_p = s_p * l_e / area_p

        # --- Contribution self du triangle (singulière) ---
        # ∫∫ 1/R sur un triangle : approximation par rayon équivalent
        r_eq = np.sqrt(area_p / np.pi)

        # Moment moyen de |r - v_p|² sur le triangle (exact par quadrature)
        pts_p = _bary_to_cart(verts_p, bary)
        rho_sq = np.sum(weights[:, None] * (pts_p - v_p)**2)

        # Terme vecteur : (l/2A)² · <|r-v|²> · ∫∫G ≈ ... · A/(4π r_eq)
        coef_p = (l_e / (2 * area_p))**2
        g_self = area_p / (4 * np.pi * r_eq)
        acc_vector += coef_p * rho_sq * g_self * area_p

        # Terme charge : (∇·f)² · ∫∫G
        acc_scalar += div_p**2 * g_self * area_p

        # --- Contribution croisée T+ / T- ---
        for s_q, v_q_idx, area_q, verts_q in tris:
            if s_q == s_p or area_q <= 0:
                continue
            v_q = vertices[v_q_idx]
            div_q = s_q * l_e / area_q

            pts_q = _bary_to_cart(verts_q, bary)

            sum_vec = 0.0 + 0j
            sum_sca = 0.0 + 0j

            for i, w_i in enumerate(weights):
                f_p_vec = s_p * (l_e / (2 * area_p)) * (pts_p[i] - v_p)
                for j, w_j in enumerate(weights):
                    f_q_vec = s_q * (l_e / (2 * area_q)) * (pts_q[j] - v_q)
                    g = green_2d_layered(pts_p[i], pts_q[j], freq, stackup, [])
                    sum_vec += w_i * w_j * np.dot(f_p_vec, f_q_vec) * g
                    sum_sca += w_i * w_j * g

            # 0.5 : chaque paire croisée est visitée deux fois
            acc_vector += 0.5 * sum_vec * area_p * area_q
            acc_scalar += 0.5 * div_p * div_q * sum_sca * area_p * area_q

    z_self = 1j * omega * MU_0 * acc_vector + acc_scalar / (1j * omega * eps)

    return z_self


def integrate_singular_term(rwg_m: RWGBasis, rwg_n: RWGBasis,
                            vertices: np.ndarray, elements: np.ndarray,
                            freq: float, stackup: Dict = None) -> complex:
    """
    Correction de quasi-singularité pour fonctions RWG adjacentes

    CORRECTION (point 2.1): cette fonction était définie mais jamais appelée.
    Elle est maintenant invoquée depuis compute_interactions pour toute paire
    de fonctions partageant un triangle ou un sommet.

    Elle retourne une correction *additive* qui compense le déficit de la
    quadrature de Gauss lorsque le noyau 1/R varie fortement sur le domaine
    d'intégration. La correction porte sur le terme de charge (dominant dans
    la singularité) et est déjà mise à l'échelle en ohms.

    Limite connue : il s'agit d'une extraction logarithmique standard, pas de
    l'intégrale analytique exacte de Wilton-Rao sur triangles adjacents.
    L'erreur résiduelle décroît avec le raffinement du maillage.

    Args:
        rwg_m: Fonction test
        rwg_n: Fonction source
        vertices: Sommets
        elements: Éléments
        freq: Fréquence
        stackup: Stackup (permittivité effective)

    Returns:
        Correction d'impédance en ohms (0 si non adjacentes)
    """
    triangles_m = {rwg_m.tri_plus, rwg_m.tri_minus}
    triangles_n = {rwg_n.tri_plus, rwg_n.tri_minus}

    shares_triangle = len(triangles_m & triangles_n) > 0

    verts_m = set(rwg_m.edge_vertices)
    verts_n = set(rwg_n.edge_vertices)
    shares_vertex = len(verts_m & verts_n) > 0

    if not (shares_triangle or shares_vertex):
        return 0.0 + 0j

    # Un triangle partagé implique une singularité plus forte qu'un simple
    # sommet commun : on pondère la correction en conséquence.
    strength = 1.0 if shares_triangle else 0.3

    omega = 2 * np.pi * freq
    eps = EPSILON_0 * (get_effective_epsilon(stackup) if stackup else 1.0 + 0j)

    edge_length = 0.5 * (rwg_m.edge_length + rwg_n.edge_length)
    area_avg = 0.25 * (rwg_m.area_plus + rwg_m.area_minus +
                       rwg_n.area_plus + rwg_n.area_minus)

    if area_avg <= 0:
        return 0.0 + 0j

    r_eq = np.sqrt(area_avg / np.pi)

    # Déficit logarithmique de l'intégrale de 1/R
    log_arg = 2 * edge_length / (r_eq + 1e-15)
    if log_arg <= 1.0:
        return 0.0 + 0j

    # Correction sur le terme de charge : (l/A)² · A² · Δ(∫G) / (jωε)
    delta_g = strength * np.log(log_arg) / (4 * np.pi)
    charge_corr = (edge_length / area_avg)**2 * area_avg**2 * delta_g

    return charge_corr / (1j * omega * eps)


def fill_z_matrix(rwg_basis: List[RWGBasis], freq: float, 
                  images: List[ComplexImage], stackup: Dict,
                  vertices: np.ndarray = None,
                  elements: np.ndarray = None) -> np.ndarray:
    """
    Remplit la matrice d'impédance complète Z

    CORRECTION: deux changements par rapport à l'ancienne version.

    1. vertices/elements sont désormais obligatoires. L'ancien code se
       rabattait silencieusement sur `np.zeros((100, 3))`, produisant une
       matrice Z calculée sur une géométrie nulle sans aucune erreur visible.
    2. Exploitation de la réciprocité (Z_mn = Z_nm) : seul le triangle
       supérieur est calculé, ce qui divise le coût d'assemblage par ~2.
       C'est un gain réel, contrairement au noyau Numba qui ne connaissait
       pas le milieu stratifié (voir fill_z_matrix_freespace_numba).

    Args:
        rwg_basis: Liste des fonctions de base RWG
        freq: Fréquence
        images: Sources images DCIM
        stackup: Stackup
        vertices: Sommets du maillage (obligatoire)
        elements: Éléments du maillage (obligatoire)

    Returns:
        Matrice d'impédance NxN complexe
    """
    n_basis = len(rwg_basis)
    logger.info(f"Assemblage de la matrice Z ({n_basis}x{n_basis})")

    # CORRECTION: échec explicite au lieu d'un repli silencieux sur des zéros
    if vertices is None or elements is None:
        raise ValueError(
            "fill_z_matrix: 'vertices' et 'elements' sont obligatoires. "
            "L'ancien repli sur des tableaux nuls produisait une matrice Z "
            "physiquement fausse sans lever d'erreur."
        )

    z_matrix = np.zeros((n_basis, n_basis), dtype=complex)

    # Réciprocité : n_basis(n_basis+1)/2 évaluations au lieu de n_basis²
    total = n_basis * (n_basis + 1) // 2
    computed = 0
    log_interval = max(1, total // 10)

    for m in range(n_basis):
        for n in range(m, n_basis):
            z_val = compute_interactions(
                rwg_basis[m], rwg_basis[n], freq, images,
                stackup, vertices, elements
            )

            z_matrix[m, n] = z_val
            if m != n:
                z_matrix[n, m] = z_val

            computed += 1
            if computed % log_interval == 0:
                logger.info(f"  Progression : {100 * computed / total:.1f}%")

    logger.info("  Matrice Z assemblée")

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

    Pour accélérer réellement l'assemblage stratifié, il faudrait tabuler
    green_2d_layered sur une grille (rho, z, z') par fréquence puis
    interpoler dans un noyau nopython. C'est un chantier distinct, avec sa
    propre validation d'erreur d'interpolation.

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


def map_ports_to_rwg(ports: List[Dict], rwg_basis: List[RWGBasis],
                     vertices: np.ndarray, tolerance: float = None) -> List[int]:
    """
    Associe chaque port à l'indice de la fonction RWG la plus proche géométriquement

    CORRECTION: Remplace la logique arbitraire (currents[:n//2]) par un vrai
    mapping géométrique basé sur la position réelle des ports et le centre
    des arêtes RWG générées par le mailleur.

    Args:
        ports: Liste des ports (avec clé 'position')
        rwg_basis: Liste des fonctions RWG
        vertices: Sommets du maillage
        tolerance: Distance max acceptée (None = automatique)

    Returns:
        Liste des indices RWG, un par port (-1 si aucun candidat valide)
    """
    if len(rwg_basis) == 0:
        return [-1] * len(ports)

    # Pré-calcul des centres d'arêtes RWG (vectorisé)
    edge_centers = np.array([
        (vertices[rwg.edge_vertices[0]] + vertices[rwg.edge_vertices[1]]) / 2
        for rwg in rwg_basis
    ])

    # Tolérance automatique : basée sur la longueur d'arête moyenne
    if tolerance is None:
        mean_edge = np.mean([rwg.edge_length for rwg in rwg_basis])
        tolerance = 5.0 * mean_edge

    port_map = []
    used = set()

    for port in ports:
        port_pos = np.asarray(port['position'], dtype=float)

        # Distance 2D (projection dans le plan du PCB)
        d = np.sqrt((edge_centers[:, 0] - port_pos[0])**2 +
                    (edge_centers[:, 1] - port_pos[1])**2)

        # Un port ne peut pas partager son arête avec un autre port
        order = np.argsort(d)
        chosen = -1
        for idx in order:
            if idx not in used:
                chosen = int(idx)
                break

        if chosen < 0 or d[chosen] > tolerance:
            logger.warning(
                f"  Port {port.get('id', '?')} non mappé "
                f"(distance min={d[chosen]*1e3:.3f}mm > tol={tolerance*1e3:.3f}mm)"
            )
            port_map.append(-1)
        else:
            used.add(chosen)
            port_map.append(chosen)
            logger.debug(
                f"  Port {port.get('id', '?')} -> RWG {chosen} "
                f"(distance={d[chosen]*1e3:.3f}mm)"
            )

    return port_map


def build_v_vector(rwg_basis: List[RWGBasis], ports: List[Dict], freq: float,
                   vertices: np.ndarray = None, port_map: List[int] = None,
                   excited_port: int = 0, v_amplitude: float = 1.0) -> np.ndarray:
    """
    Crée le vecteur second membre V représentant l'excitation delta-gap

    CORRECTION: L'excitation est appliquée sur l'arête RWG réellement située
    au port (via port_map), et non arbitrairement sur v_vector[0].

    Modèle delta-gap : V_m = l_m * E_gap pour l'arête du port excité,
    0 ailleurs (les autres ports sont court-circuités, V_k = 0).

    Args:
        rwg_basis: Liste des fonctions RWG
        ports: Liste des ports d'excitation
        freq: Fréquence
        vertices: Sommets du maillage
        port_map: Mapping port -> indice RWG (calculé si None)
        excited_port: Indice du port à exciter
        v_amplitude: Tension appliquée au gap (V)

    Returns:
        Vecteur V de taille N (complexe)
    """
    n_basis = len(rwg_basis)
    v_vector = np.zeros(n_basis, dtype=complex)

    if n_basis == 0:
        return v_vector

    if len(ports) == 0:
        logger.warning("Aucun port défini, excitation par défaut sur RWG 0")
        v_vector[0] = v_amplitude * rwg_basis[0].edge_length
        return v_vector

    # Mapping géométrique des ports
    if port_map is None:
        if vertices is None:
            raise ValueError("build_v_vector: vertices ou port_map requis")
        port_map = map_ports_to_rwg(ports, rwg_basis, vertices)

    if excited_port >= len(port_map):
        raise ValueError(
            f"build_v_vector: port {excited_port} hors limites ({len(port_map)} ports)"
        )

    rwg_idx = port_map[excited_port]

    if rwg_idx < 0:
        logger.error(
            f"Port {excited_port} non mappé géométriquement, "
            "excitation impossible (vecteur nul)"
        )
        return v_vector

    # Excitation delta-gap : V_m = l_m * V_gap sur l'arête du port
    v_vector[rwg_idx] = v_amplitude * rwg_basis[rwg_idx].edge_length

    logger.debug(
        f"  V construit : port {excited_port} -> RWG {rwg_idx}, "
        f"|V|={np.abs(v_vector[rwg_idx]):.3e}"
    )

    return v_vector


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
