"""
Module de résolution du système linéaire et extraction des paramètres RF
Calcul des paramètres S et export au format Touchstone
"""

import numpy as np
import logging
from typing import List, Dict, Tuple
from scipy.linalg import solve, lu_factor, lu_solve
from scipy.sparse.linalg import gmres, spsolve
from scipy.sparse import csr_matrix
from scipy.sparse.linalg import LinearOperator

logger = logging.getLogger(__name__)

# Constantes
ETA_0 = 376.73031346958504  # Impédance du vide (Ω)


def solve_currents(z_matrix: np.ndarray, v_vector: np.ndarray) -> np.ndarray:
    """
    Inverse le système linéaire Z·I = V pour trouver les coefficients de courant
    
    Args:
        z_matrix: Matrice d'impédance NxN
        v_vector: Vecteur d'excitation N
        
    Returns:
        Vecteur des courants I (coefficients des fonctions RWG)
    """
    n = len(v_vector)
    logger.debug(f"Résolution du système linéaire ({n}x{n})")
    
    # Vérification du conditionnement
    cond = np.linalg.cond(z_matrix)
    logger.debug(f"  Conditionnement : {cond:.2e}")
    
    if cond > 1e12:
        logger.warning(f"Matrice mal conditionnée (cond={cond:.2e})")
    
    try:
        # Méthode directe : factorisation LU
        if n < 1000:
            logger.debug("  Méthode : Factorisation LU directe")
            currents = solve(z_matrix, v_vector)
        else:
            # Pour matrices larges : solveur itératif GMRES
            # CORRECTION: 'tol' est déprécié/supprimé depuis SciPy 1.14 -> 'rtol'
            logger.debug("  Méthode : GMRES itératif")

            # La matrice Z MoM est dense : csr_matrix la stockerait sans gain.
            # On la passe directement (GMRES accepte les tableaux denses).
            currents, info = gmres(z_matrix, v_vector, rtol=1e-6, restart=50)

            if info != 0:
                logger.warning(
                    f"GMRES n'a pas convergé (code: {info}), "
                    "repli sur résolution directe"
                )
                currents = solve(z_matrix, v_vector)
            else:
                logger.debug("  GMRES convergé")
        
        # Vérification de la solution
        residual = np.linalg.norm(z_matrix @ currents - v_vector)
        residual_rel = residual / np.linalg.norm(v_vector)
        logger.debug(f"  Résidu relatif : {residual_rel:.2e}")
        
        return currents
        
    except np.linalg.LinAlgError as e:
        logger.error(f"Échec de la résolution : {e}")
        logger.info("Tentative avec pseudo-inverse")
        
        # Fallback : pseudo-inverse (Moore-Penrose)
        currents = np.linalg.lstsq(z_matrix, v_vector, rcond=1e-10)[0]
        return currents


def compute_s_parameters(z_matrix: np.ndarray, rwg_basis: List, ports: List[Dict],
                        freq: float, port_map: List[int],
                        v_amplitude: float = 1.0) -> np.ndarray:
    """
    Calcule les paramètres S via la matrice d'admittance multi-port

    CORRECTION: Remplace l'ancienne approche (découpe currents[:n//2] et
    rapports de puissance scalaires) par le formalisme rigoureux :

    1. Pour chaque port j, excitation delta-gap unitaire (V_j = 1, V_k≠j = 0)
    2. Résolution Z·I = V_j -> courants
    3. Courant au port i : I_i = c_i * l_i (coefficient RWG x longueur d'arête)
    4. Admittance : Y_ij = I_i / V_j
    5. Conversion Y -> S : S = (I - Z0·Y)·(I + Z0·Y)^(-1)

    Cette méthode conserve l'amplitude ET la phase de chaque port
    indépendamment, et respecte la géométrie du maillage.

    Args:
        z_matrix: Matrice d'impédance MoM (N x N)
        rwg_basis: Liste des fonctions RWG
        ports: Liste des ports avec leurs propriétés
        freq: Fréquence
        port_map: Mapping port -> indice RWG (depuis map_ports_to_rwg)
        v_amplitude: Amplitude de la tension d'excitation

    Returns:
        Matrice S (num_ports x num_ports)
    """
    num_ports = len(ports)
    logger.debug(f"Calcul des paramètres S ({num_ports} ports) via matrice Y")

    if num_ports == 0:
        logger.warning("Aucun port défini, retour matrice identité 2x2")
        return np.zeros((2, 2), dtype=complex)

    # Validation du mapping
    if port_map is None or len(port_map) != num_ports:
        raise ValueError(
            f"compute_s_parameters: port_map invalide "
            f"({len(port_map) if port_map else 0} entrées pour {num_ports} ports)"
        )

    invalid = [i for i, idx in enumerate(port_map) if idx < 0]
    if invalid:
        logger.error(f"Ports non mappés géométriquement : {invalid}")
        return np.full((num_ports, num_ports), np.nan, dtype=complex)

    n_basis = z_matrix.shape[0]

    # Impédances de référence de chaque port
    z0_ports = np.array([p.get('impedance', 50.0) for p in ports], dtype=float)

    # Factorisation LU unique : réutilisée pour toutes les excitations
    y_matrix = np.zeros((num_ports, num_ports), dtype=complex)

    try:
        lu, piv = lu_factor(z_matrix)
        use_lu = True
    except (np.linalg.LinAlgError, ValueError) as e:
        logger.warning(f"Factorisation LU échouée ({e}), passage en lstsq")
        use_lu = False

    for j in range(num_ports):
        # Excitation delta-gap sur le port j uniquement
        v_vector = np.zeros(n_basis, dtype=complex)
        rwg_j = port_map[j]
        l_j = rwg_basis[rwg_j].edge_length
        v_vector[rwg_j] = v_amplitude * l_j

        # Résolution du système
        if use_lu:
            currents = lu_solve((lu, piv), v_vector)
        else:
            currents = np.linalg.lstsq(z_matrix, v_vector, rcond=1e-10)[0]

        # Extraction du courant à chaque port (amplitude + phase conservées)
        for i in range(num_ports):
            rwg_i = port_map[i]
            l_i = rwg_basis[rwg_i].edge_length

            # Courant total traversant l'arête du port i
            i_port = currents[rwg_i] * l_i

            # Y_ij = I_i / V_j
            y_matrix[i, j] = i_port / v_amplitude

    # Symétrisation : impose la réciprocité (Y = Y^T) pour milieux réciproques
    y_matrix = 0.5 * (y_matrix + y_matrix.T)

    # Conversion Y -> S avec normalisation par port
    s_matrix = convert_y_to_s(y_matrix, z0_ports)

    if num_ports >= 2:
        logger.debug(
            f"  S11 = {np.abs(s_matrix[0,0]):.4f}∠{np.degrees(np.angle(s_matrix[0,0])):.1f}°, "
            f"S21 = {np.abs(s_matrix[1,0]):.4f}∠{np.degrees(np.angle(s_matrix[1,0])):.1f}°"
        )

    return s_matrix


def convert_y_to_s(y_matrix: np.ndarray, z0: np.ndarray) -> np.ndarray:
    """
    Convertit la matrice d'admittance en paramètres S

    S = (I - Z0^(1/2)·Y·Z0^(1/2))·(I + Z0^(1/2)·Y·Z0^(1/2))^(-1)

    Utilise la normalisation par racine d'impédance pour gérer
    des impédances de référence différentes par port.

    Args:
        y_matrix: Matrice d'admittance (N x N)
        z0: Impédances de référence par port (N)

    Returns:
        Matrice S (N x N)
    """
    n = y_matrix.shape[0]

    # Normalisation : y_norm = sqrt(Z0) · Y · sqrt(Z0)
    sqrt_z0 = np.sqrt(z0)
    y_norm = y_matrix * np.outer(sqrt_z0, sqrt_z0)

    identity = np.eye(n, dtype=complex)
    numerator = identity - y_norm
    denominator = identity + y_norm

    try:
        s_matrix = numerator @ np.linalg.inv(denominator)
    except np.linalg.LinAlgError:
        logger.warning("Inversion impossible pour conversion Y->S, utilisation de lstsq")
        s_matrix = np.linalg.lstsq(denominator.T, numerator.T, rcond=None)[0].T

    return s_matrix


def compute_z_parameters(currents: np.ndarray, v_ports: np.ndarray,
                        ports: List[Dict]) -> np.ndarray:
    """
    Calcule les paramètres d'impédance Z
    
    Z_ij = V_i / I_j (avec I_k = 0 pour k ≠ j)
    
    Args:
        currents: Vecteur des courants
        v_ports: Tensions aux ports
        ports: Liste des ports
        
    Returns:
        Matrice Z des paramètres d'impédance
    """
    num_ports = len(ports)
    z_params = np.zeros((num_ports, num_ports), dtype=complex)
    
    # Extraction des courants aux ports
    # Simplification : un port par région
    
    for i in range(num_ports):
        for j in range(num_ports):
            if i == j:
                # Impédance d'entrée
                z_params[i, j] = ports[i].get('impedance', 50.0)
            else:
                # Impédance de transfert
                z_params[i, j] = 0.0 + 0j
    
    return z_params


def convert_z_to_s(z_params: np.ndarray, z0: float = 50.0) -> np.ndarray:
    """
    Convertit les paramètres Z en paramètres S
    
    S = (Z - Z0·I)·(Z + Z0·I)^(-1)
    
    Args:
        z_params: Matrice Z
        z0: Impédance de référence
        
    Returns:
        Matrice S
    """
    n = z_params.shape[0]
    z0_matrix = z0 * np.eye(n)
    
    numerator = z_params - z0_matrix
    denominator = z_params + z0_matrix
    
    try:
        s_params = numerator @ np.linalg.inv(denominator)
        return s_params
    except np.linalg.LinAlgError:
        logger.warning("Inversion impossible pour conversion Z->S")
        return np.eye(n, dtype=complex)


def export_touchstone(s_params_list: List[np.ndarray], freq_array: np.ndarray,
                     ports: List[Dict], filename: str):
    """
    Formate et écrit le fichier standard Touchstone (.sNp)
    
    Le format Touchstone est le standard industriel pour les paramètres S.
    Format : .s2p pour 2 ports, .s3p pour 3 ports, etc.
    
    Args:
        s_params_list: Liste des matrices S pour chaque fréquence
        freq_array: Array des fréquences (Hz)
        ports: Liste des ports
        filename: Nom du fichier de sortie
    """
    num_ports = len(ports)
    num_freq = len(freq_array)
    
    logger.info(f"Export Touchstone : {filename}")
    logger.debug(f"  {num_ports} ports, {num_freq} points de fréquence")
    
    # CORRECTION: l'ancienne logique laissait une extension .s2p sur un
    # réseau à 3 ports (le replace('.sNp', ...) ne matchait jamais).
    from pathlib import Path as _Path
    filename = str(_Path(filename).with_suffix(f'.s{num_ports}p'))

    # CORRECTION: l'impédance de référence était codée en dur à 50Ω
    z_ref = ports[0].get('impedance', 50.0) if num_ports > 0 else 50.0

    with open(filename, 'w') as f:
        # En-tête Touchstone
        f.write("! Touchstone file exported from MoM Solver\n")
        f.write(f"! {num_ports}-port S-parameters\n")
        f.write("! Frequency [GHz]  S-parameters [Magnitude/Angle]\n")
        f.write(f"# GHz S MA R {z_ref:g}\n")
        f.write("!\n")
        
        # Données pour chaque fréquence
        for i, freq in enumerate(freq_array):
            freq_ghz = freq / 1e9
            
            if i < len(s_params_list):
                s_matrix = s_params_list[i]
            else:
                s_matrix = np.zeros((num_ports, num_ports), dtype=complex)
            
            # Format : freq S11_mag S11_ang S21_mag S21_ang S12_mag S12_ang S22_mag S22_ang
            if num_ports == 2:
                s11 = s_matrix[0, 0]
                s21 = s_matrix[1, 0]
                s12 = s_matrix[0, 1]
                s22 = s_matrix[1, 1]
                
                # Magnitude et angle (degrés)
                s11_mag = np.abs(s11)
                s11_ang = np.angle(s11, deg=True)
                s21_mag = np.abs(s21)
                s21_ang = np.angle(s21, deg=True)
                s12_mag = np.abs(s12)
                s12_ang = np.angle(s12, deg=True)
                s22_mag = np.abs(s22)
                s22_ang = np.angle(s22, deg=True)
                
                f.write(f"{freq_ghz:.6f}  "
                       f"{s11_mag:.6f} {s11_ang:.2f}  "
                       f"{s21_mag:.6f} {s21_ang:.2f}  "
                       f"{s12_mag:.6f} {s12_ang:.2f}  "
                       f"{s22_mag:.6f} {s22_ang:.2f}\n")
            
            else:
                # Pour N ports : format sur plusieurs lignes
                f.write(f"{freq_ghz:.6f}  ")
                for row in range(num_ports):
                    for col in range(num_ports):
                        s_val = s_matrix[row, col]
                        mag = np.abs(s_val)
                        ang = np.angle(s_val, deg=True)
                        f.write(f"{mag:.6f} {ang:.2f}  ")
                f.write("\n")
    
    logger.info(f"  Fichier écrit : {filename}")


def compute_current_density(currents: np.ndarray, rwg_basis: List,
                            mesh: Dict) -> np.ndarray:
    """
    Calcule la densité de courant surfacique pour visualisation
    
    Args:
        currents: Coefficients des fonctions RWG
        rwg_basis: Liste des fonctions de base
        mesh: Structure du maillage
        
    Returns:
        Densité de courant sur chaque élément triangulaire
    """
    num_elements = mesh['num_elements']
    j_density = np.zeros((num_elements, 3), dtype=complex)
    
    vertices = mesh['vertices']
    elements = mesh['elements']
    
    # Contribution de chaque fonction RWG
    for i, (current_coef, rwg) in enumerate(zip(currents, rwg_basis)):
        # Triangles T+ et T-
        tri_plus = rwg.tri_plus
        tri_minus = rwg.tri_minus
        
        # Contribution au triangle T+
        # J = I_n * f_n où f_n = l_n/(2*A_n) * (r - r_n)
        # Approximation : vecteur constant par triangle
        j_density[tri_plus] += current_coef * rwg.edge_length / (2 * rwg.area_plus)
        
        # Contribution au triangle T-
        j_density[tri_minus] -= current_coef * rwg.edge_length / (2 * rwg.area_minus)
    
    return j_density


def compute_power_flow(currents: np.ndarray, z_matrix: np.ndarray,
                      v_vector: np.ndarray) -> Dict[str, float]:
    """
    Calcule les bilans de puissance
    
    Args:
        currents: Vecteur des courants
        z_matrix: Matrice d'impédance
        v_vector: Vecteur d'excitation
        
    Returns:
        Dictionnaire avec les puissances (incidente, réfléchie, dissipée)
    """
    # Puissance complexe : P = 1/2 · V* · I
    power_complex = 0.5 * (np.conj(v_vector) @ currents)

    # Puissance active et réactive
    p_active = float(power_complex.real)
    p_reactive = float(power_complex.imag)

    # CORRECTION: p_incident était un tableau (np.abs(v_vector)**2 renvoie un
    # vecteur), ce qui faisait lever ValueError au test `if p_incident > 0`.
    # Puissance incidente scalaire : P = |V|²/(2·Z₀)
    z0 = 50.0
    v_mag_sq = float(np.sum(np.abs(v_vector)**2))
    p_incident = v_mag_sq / (2 * z0)

    # Puissance dissipée dans les pertes
    # P_loss = 1/2 · Re(I* · Z · I)
    z_currents = z_matrix @ currents
    p_loss = float(0.5 * (np.conj(currents) @ z_currents).real)

    return {
        'incident': p_incident,
        'active': p_active,
        'reactive': p_reactive,
        'loss': p_loss,
        'efficiency': (p_active / p_incident) if p_incident > 0 else 0.0
    }


def compute_vswr(s11: complex) -> float:
    """
    Calcule le VSWR (Voltage Standing Wave Ratio) à partir de S11
    
    VSWR = (1 + |Γ|) / (1 - |Γ|)
    
    Args:
        s11: Coefficient de réflexion
        
    Returns:
        VSWR
    """
    gamma = np.abs(s11)
    
    if gamma >= 1.0:
        return np.inf
    
    vswr = (1 + gamma) / (1 - gamma)
    return vswr


def compute_return_loss(s11: complex) -> float:
    """
    Calcule la perte de retour en dB
    
    RL = -20·log10(|S11|)
    
    Args:
        s11: Coefficient de réflexion
        
    Returns:
        Perte de retour en dB
    """
    mag = np.abs(s11)
    
    if mag < 1e-10:
        return 100.0  # Très faible réflexion
    
    return -20 * np.log10(mag)


def compute_insertion_loss(s21: complex) -> float:
    """
    Calcule la perte d'insertion en dB
    
    IL = -20·log10(|S21|)
    
    Args:
        s21: Coefficient de transmission
        
    Returns:
        Perte d'insertion en dB
    """
    mag = np.abs(s21)
    
    if mag < 1e-10:
        return 100.0
    
    return -20 * np.log10(mag)
