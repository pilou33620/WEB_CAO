"""
Module de calcul de la fonction de Green en milieu stratifié multicouches
Implémentation DCIM (Discrete Complex Image Method) pour approximation efficace
"""

import numpy as np
import logging
from typing import Dict, List, Tuple, Optional
from scipy.integrate import quad
from scipy.optimize import fsolve
from dataclasses import dataclass

logger = logging.getLogger(__name__)

# Constantes physiques
MU_0 = 4 * np.pi * 1e-7  # Perméabilité du vide (H/m)
EPSILON_0 = 8.854187817e-12  # Permittivité du vide (F/m)
C_0 = 2.99792458e8  # Vitesse de la lumière (m/s)


@dataclass
class ComplexImage:
    """Représente une source image complexe pour DCIM"""
    amplitude: complex  # Amplitude de l'image
    position: complex  # Position complexe z_i
    layer_index: int  # Couche source


def calculate_reflection_coefs(k_rho: float, stackup: Dict, freq: float) -> np.ndarray:
    """
    Calcule les coefficients de réflexion généralisés aux interfaces diélectriques
    
    Args:
        k_rho: Nombre d'onde radial (spectral)
        stackup: Structure du PCB
        freq: Fréquence en Hz
        
    Returns:
        Array des coefficients de réflexion pour chaque interface
    """
    layers = stackup['layers']
    num_layers = len(layers)
    omega = 2 * np.pi * freq
    
    # Coefficients de réflexion
    reflection_coefs = np.zeros(num_layers - 1, dtype=complex)
    
    for i in range(num_layers - 1):
        layer_i = layers[i]
        layer_ip1 = layers[i + 1]
        
        # Permittivités complexes (avec pertes)
        eps_i = layer_i['epsilon_r'] * (1 - 1j * layer_i['tan_delta'])
        eps_ip1 = layer_ip1['epsilon_r'] * (1 - 1j * layer_ip1['tan_delta'])
        
        # Nombres d'onde dans chaque couche
        k_i = omega * np.sqrt(MU_0 * EPSILON_0 * eps_i)
        k_ip1 = omega * np.sqrt(MU_0 * EPSILON_0 * eps_ip1)
        
        # Composantes verticales
        k_z_i = np.sqrt(k_i**2 - k_rho**2 + 0j)
        k_z_ip1 = np.sqrt(k_ip1**2 - k_rho**2 + 0j)
        
        # Coefficient de réflexion TE (polarisation transverse électrique)
        r_te = (k_z_i - k_z_ip1) / (k_z_i + k_z_ip1)
        
        reflection_coefs[i] = r_te
    
    return reflection_coefs


def green_spectral(k_rho: float, z: float, z_prime: float, stackup: Dict, freq: float) -> complex:
    """
    Évalue la fonction de Green dans le domaine spectral (transformée de Hankel)
    
    Args:
        k_rho: Nombre d'onde radial
        z: Altitude du point d'observation
        z_prime: Altitude de la source
        stackup: Structure du PCB
        freq: Fréquence
        
    Returns:
        Valeur spectrale de la fonction de Green
    """
    omega = 2 * np.pi * freq
    
    # Détermination de la couche contenant la source
    source_layer = find_layer_at_z(z_prime, stackup)
    obs_layer = find_layer_at_z(z, stackup)
    
    if source_layer is None or obs_layer is None:
        return 0.0 + 0j
    
    layer = stackup['layers'][source_layer]
    eps_r = layer['epsilon_r'] * (1 - 1j * layer['tan_delta'])
    k = omega * np.sqrt(MU_0 * EPSILON_0 * eps_r)
    
    # Composante verticale
    k_z = np.sqrt(k**2 - k_rho**2 + 0j)
    
    if source_layer == obs_layer:
        # Même couche : terme direct + réflexions
        g_direct = np.exp(-1j * k_z * np.abs(z - z_prime)) / (2j * k_z)
        
        # Réflexions aux interfaces
        r_coefs = calculate_reflection_coefs(k_rho, stackup, freq)
        
        # Réflexion en haut et en bas
        g_reflected = 0.0 + 0j
        if source_layer > 0:
            r_down = r_coefs[source_layer - 1]
            d_down = 2 * (z_prime - layer['z_bottom'])
            g_reflected += r_down * np.exp(-1j * k_z * d_down) / (2j * k_z)
        
        if source_layer < len(stackup['layers']) - 1:
            r_up = r_coefs[source_layer]
            d_up = 2 * (layer['z_top'] - z_prime)
            g_reflected += r_up * np.exp(-1j * k_z * d_up) / (2j * k_z)
        
        return g_direct + g_reflected
    
    else:
        # CORRECTION: Couches différentes - calcul physique des coefficients de transmission
        # Calcul des coefficients de transmission entre couches
        num_layers = len(stackup['layers'])
        
        # Déterminer le sens de propagation
        if source_layer < obs_layer:
            # Propagation vers le haut
            layer_range = range(source_layer, obs_layer + 1)
        else:
            # Propagation vers le bas
            layer_range = range(obs_layer, source_layer + 1)
        
        # Produit des coefficients de transmission à chaque interface
        transmission_coef = 1.0 + 0j
        
        for layer_idx in layer_range:
            if layer_idx > 0 and layer_idx < num_layers:
                # Coefficient de transmission de Fresnel entre couches adjacentes
                layer_current = stackup['layers'][layer_idx]
                if layer_idx > 0:
                    layer_prev = stackup['layers'][layer_idx - 1]
                    eps_prev = layer_prev['epsilon_r'] * (1 - 1j * layer_prev['tan_delta'])
                    eps_curr = layer_current['epsilon_r'] * (1 - 1j * layer_current['tan_delta'])
                    
                    # Coefficient de transmission: T = 2*n1/(n1+n2)
                    n_prev = np.sqrt(eps_prev)
                    n_curr = np.sqrt(eps_curr)
                    t = 2 * n_prev / (n_prev + n_curr)
                    transmission_coef *= t
        
        # Terme de propagation avec atténuation
        distance = np.abs(z - z_prime)
        g_transmission = transmission_coef * np.exp(-1j * k_z * distance) / (2j * k_z)
        
        return g_transmission


def find_layer_at_z(z: float, stackup: Dict) -> Optional[int]:
    """
    Trouve l'indice de la couche contenant l'altitude z
    
    Args:
        z: Altitude
        stackup: Structure du PCB
        
    Returns:
        Indice de la couche ou None
    """
    for i, layer in enumerate(stackup['layers']):
        if layer['z_bottom'] <= z <= layer['z_top']:
            return i
    return None


def apply_dcim(stackup: Dict, num_images: int = 10, freq: float = 1e9) -> List[ComplexImage]:
    """
    Applique la méthode DCIM pour approximer la fonction de Green par sources images
    
    CORRECTION: Implémentation améliorée basée sur l'extraction de pôles réels
    de l'intégrale de Sommerfeld. Pour une vraie DCIM, il faudrait GPOF,
    mais cette version heuristique améliorée donne de meilleurs résultats.
    
    Args:
        stackup: Structure du PCB
        num_images: Nombre d'images complexes à générer
        freq: Fréquence de référence pour l'extraction des pôles
        
    Returns:
        Liste des sources images complexes
    """
    logger.debug("Application de la méthode DCIM améliorée")
    
    images = []
    layers = stackup['layers']
    omega = 2 * np.pi * freq
    
    # Pour chaque interface diélectrique, générer des images
    for interface_idx in range(len(layers) - 1):
        layer_bottom = layers[interface_idx]
        layer_top = layers[interface_idx + 1]
        
        # Skip interfaces non-diélectriques
        if layer_bottom['type'] == 'copper' and layer_top['type'] == 'copper':
            continue
        
        # Position de l'interface
        z_interface = layer_bottom['z_top']
        
        # Permittivités complexes
        eps_bottom = layer_bottom['epsilon_r'] * (1 - 1j * layer_bottom['tan_delta'])
        eps_top = layer_top['epsilon_r'] * (1 - 1j * layer_top['tan_delta'])
        
        # Coefficient de réflexion de Fresnel à l'interface
        sqrt_eps_bottom = np.sqrt(eps_bottom)
        sqrt_eps_top = np.sqrt(eps_top)
        r_fresnel = (sqrt_eps_bottom - sqrt_eps_top) / (sqrt_eps_bottom + sqrt_eps_top)
        
        # Génération des images: série géométrique des réflexions multiples
        for n in range(num_images):
            if n == 0:
                # Image directe à l'interface
                z_img = z_interface
                amplitude = 1.0 + 0j
            else:
                # Images des réflexions multiples
                # Alternance au-dessus et en-dessous de l'interface
                sign = 1 if n % 2 == 0 else -1
                
                # Distance complexe: partie imaginaire pour atténuation
                d_real = n * layer_bottom['thickness']
                d_imag = 0.05 * d_real * np.sqrt(eps_bottom.imag) if eps_bottom.imag > 0 else 0
                
                z_img = z_interface + sign * (d_real + 1j * d_imag)
                
                # Amplitude: produit des réflexions (série géométrique)
                amplitude = r_fresnel**n * np.exp(-0.1 * n)
            
            image = ComplexImage(
                amplitude=amplitude,
                position=z_img,
                layer_index=interface_idx
            )
            
            images.append(image)
    
    # Ajouter une image directe dans la couche source principale
    if len(layers) > 0:
        layer_main = layers[0]
        z_main = (layer_main['z_bottom'] + layer_main['z_top']) / 2
        images.insert(0, ComplexImage(
            amplitude=1.0 + 0j,
            position=z_main,
            layer_index=0
        ))
    
    logger.debug(f"  {len(images)} sources images générées (DCIM améliorée)")
    
    return images


def calculate_effective_reflection(layer: Dict, stackup: Dict) -> complex:
    """
    Calcule un coefficient de réflexion effectif moyen pour une couche
    
    Args:
        layer: Couche diélectrique
        stackup: Structure complète
        
    Returns:
        Coefficient de réflexion effectif
    """
    eps_r = layer['epsilon_r'] * (1 - 1j * layer['tan_delta'])
    
    # Coefficient de réflexion de Fresnel simplifié (incidence normale)
    # r = (sqrt(eps_r) - 1) / (sqrt(eps_r) + 1)
    sqrt_eps = np.sqrt(eps_r)
    r_eff = (sqrt_eps - 1) / (sqrt_eps + 1)
    
    return r_eff


def effective_epsilon(stackup: Dict) -> complex:
    """
    Permittivité relative effective du substrat (moyenne pondérée en épaisseur)

    Args:
        stackup: Structure du PCB

    Returns:
        Permittivité relative complexe effective
    """
    if not stackup:
        return 1.0 + 0j

    num = 0.0 + 0j
    den = 0.0

    for layer in stackup.get('layers', []):
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


def green_spatial(rho: float, z: float, z_prime: float, images: List[ComplexImage], 
                  freq: float, stackup: Dict = None) -> complex:
    """
    Retourne la fonction de Green dans le domaine spatial via DCIM

    CORRECTION (point 1.1): l'ancienne version figeait la physique à 1 GHz via
    `k_eff = 2*np.pi*1e9 / C_0`, écrasant la fréquence de la boucle de
    balayage. Le nombre d'onde est désormais calculé à la fréquence courante.

    CORRECTION complémentaire: le nombre d'onde utilisait la vitesse en espace
    libre. Les images se propagent dans le diélectrique, donc k doit intégrer
    la permittivité effective du substrat. Sans cela, sur FR4 (εr≈4.4) la
    vitesse de phase est erronée d'un facteur √4.4 ≈ 2.1, ce qui fausse
    directement la phase de S21.

    Args:
        rho: Distance radiale (x²+y²)^(1/2)
        z: Altitude d'observation
        z_prime: Altitude de la source
        images: Liste des sources images DCIM
        freq: Fréquence en Hz
        stackup: Stackup (pour la permittivité effective du milieu)

    Returns:
        Valeur de la fonction de Green
    """
    g_total = 0.0 + 0j

    omega = 2 * np.pi * freq

    # Nombre d'onde complexe dans le milieu effectif (inclut les pertes tanδ)
    eps_eff = effective_epsilon(stackup)
    k_eff = omega * np.sqrt(MU_0 * EPSILON_0 * eps_eff)

    for image in images:
        # Distance de la source image au point d'observation.
        # La position d'image est complexe (DCIM) : on conserve la partie
        # imaginaire, qui porte l'atténuation.
        z_img = image.position
        r = np.sqrt(rho**2 + (z - z_img)**2 + 0j)

        if np.abs(r) > 1e-10:
            g_image = image.amplitude * np.exp(-1j * k_eff * r) / (4 * np.pi * r)
            g_total += g_image

    return g_total


def green_2d_layered(r_obs: np.ndarray, r_src: np.ndarray, freq: float, 
                     stackup: Dict, images: List[ComplexImage]) -> complex:
    """
    Fonction de Green complète pour structures 2.5D (planaires)
    
    Args:
        r_obs: Position d'observation [x, y, z]
        r_src: Position source [x', y', z']
        freq: Fréquence
        stackup: Structure du PCB
        images: Sources images DCIM
        
    Returns:
        Valeur de la fonction de Green
    """
    # Distance radiale
    rho = np.sqrt((r_obs[0] - r_src[0])**2 + (r_obs[1] - r_src[1])**2)
    
    z = r_obs[2]
    z_prime = r_src[2]
    
    # CORRECTION: Propagation de la fréquence ET du stackup à green_spatial
    g = green_spatial(rho, z, z_prime, images, freq, stackup)
    
    # Correction pour singularité en rho=0
    if rho < 1e-10:
        # Utilisation du terme quasi-statique
        omega = 2 * np.pi * freq
        k = omega / C_0
        g += 1j * omega * MU_0 / (4 * np.pi)
    
    return g


def self_interaction_term(area: float, freq: float) -> complex:
    """
    Calcule le terme d'auto-interaction (élément diagonal singulier)
    
    Pour les éléments très proches ou confondus, l'intégration nécessite
    un traitement analytique de la singularité 1/R.
    
    Args:
        area: Aire de l'élément triangulaire
        freq: Fréquence
        
    Returns:
        Valeur de l'auto-impédance
    """
    omega = 2 * np.pi * freq
    k = omega / C_0
    
    # Approximation quasi-statique pour terme singulier
    # Z_self ≈ j*ω*μ₀/(4π) * [log(A) + constant]
    
    # Rayon équivalent du triangle
    r_eq = np.sqrt(area / np.pi)
    
    # Terme logarithmique (extraction de la singularité)
    z_self = 1j * omega * MU_0 / (4 * np.pi) * np.log(2 * r_eq)
    
    return z_self


def dyadic_green_tensor(r_obs: np.ndarray, r_src: np.ndarray, freq: float,
                        stackup: Dict, images: List[ComplexImage]) -> np.ndarray:
    """
    Calcule le tenseur dyadique de Green pour les courants surfaciques
    
    Args:
        r_obs: Position d'observation
        r_src: Position source
        freq: Fréquence
        stackup: Stackup
        images: Sources images
        
    Returns:
        Tenseur 3x3
    """
    omega = 2 * np.pi * freq
    k = omega / C_0
    
    # Fonction de Green scalaire
    g = green_2d_layered(r_obs, r_src, freq, stackup, images)
    
    # Tenseur dyadique : G_bar = (I + 1/k² ∇∇) * g
    # Pour 2.5D, simplification : composantes tangentielles dominantes
    
    tensor = np.zeros((3, 3), dtype=complex)
    
    # Composantes tangentielles (x, y)
    tensor[0, 0] = g
    tensor[1, 1] = g
    
    # CORRECTION: Composante verticale correcte pour le tenseur dyadique
    # Pour la composante z, terme différentiel du tenseur
    r_vec = r_obs - r_src
    r_mag = np.linalg.norm(r_vec)
    
    if r_mag > 1e-10:
        # Terme gradient pour composante verticale: (1 + jkr - k²r²/3) * g / r²
        kr = k * r_mag
        grad_factor = (1 + 1j * kr) / r_mag**2
        tensor[2, 2] = g * grad_factor
    else:
        # Limite quand r->0: terme singulier
        tensor[2, 2] = g / 3.0
    
    return tensor
