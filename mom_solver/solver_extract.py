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

try:
    from .mom_engine import courant_de_coupe, vecteur_de_coupe
except ImportError:                                    # noqa: BLE001
    from mom_engine import courant_de_coupe, vecteur_de_coupe

logger = logging.getLogger(__name__)

# Constantes
ETA_0 = 376.73031346958504  # Impédance du vide (Ω)
C_0 = 2.99792458e8          # Vitesse de la lumière (m/s)


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
                         freq: float, coupes: List[List] = None,
                         v_amplitude: float = 1.0) -> np.ndarray:
    """Les parametres S, par la matrice d'admittance multi-port.

    1. Pour chaque port j, excitation en fente sur SA COUPE (V_j = 1, les
       autres court-circuites)
    2. Resolution Z I = V_j -- une seule factorisation LU pour tous les ports
    3. Courant du port i : la somme algebrique sur sa coupe
    4. Y_ij = I_i / V_j
    5. Y -> S, normalise par l'impedance de reference de chaque port

    LE PORT EST UNE COUPE, PAS UNE ARETE, et c'est le changement qui compte.
    L'ancienne version prenait `port_map`, une arete par port : une tension sur
    une seule arete interne d'un ruban continu est CONTOURNEE par le metal d'a
    cote, et le solveur rendait |S21| = 0,0000 quelle que soit la geometrie.
    Voir le grand commentaire de `mom_engine.localiser_ports`, qui porte les
    mesures.

    Args:
        z_matrix: la matrice d'impedance MoM (N x N)
        rwg_basis: les fonctions de base
        ports: les ports, pour leur impedance de reference
        freq: la frequence (non utilisee ici, gardee pour la trace)
        coupes: une liste par port de couples (indice RWG, signe), telle que
                `mom_engine.localiser_ports` la rend
        v_amplitude: la tension de la fente

    Returns:
        La matrice S (num_ports x num_ports)
    """
    num_ports = len(ports)
    logger.debug(f"Calcul des parametres S ({num_ports} ports) par la matrice Y")

    if num_ports == 0:
        logger.warning("Aucun port defini, retour d'une matrice nulle 2x2")
        return np.zeros((2, 2), dtype=complex)

    if coupes is None or len(coupes) != num_ports:
        raise ValueError(
            "compute_s_parameters : il faut une coupe par port (%d fournies "
            "pour %d ports). Utiliser mom_engine.localiser_ports."
            % (0 if coupes is None else len(coupes), num_ports))

    muets = [i for i, c in enumerate(coupes) if not c]
    if muets:
        # ON REND DES NAN, ET C'EST VOULU. Une matrice de zeros passerait pour
        # une structure parfaitement reflechissante, ce qui est plausible et
        # faux ; un nan se remarque.
        logger.error(f"Ports sans coupe : {muets}")
        return np.full((num_ports, num_ports), np.nan, dtype=complex)

    n_basis = z_matrix.shape[0]
    z0_ports = np.array([p.get('impedance', 50.0) for p in ports], dtype=float)

    try:
        lu, piv = lu_factor(z_matrix)
        use_lu = True
    except (np.linalg.LinAlgError, ValueError) as e:
        logger.warning(f"Factorisation LU echouee ({e}), passage en lstsq")
        use_lu = False

    y_matrix = np.zeros((num_ports, num_ports), dtype=complex)

    for j in range(num_ports):
        v_vector = vecteur_de_coupe(rwg_basis, coupes[j], n_basis, v_amplitude)

        if use_lu:
            currents = lu_solve((lu, piv), v_vector)
        else:
            currents = np.linalg.lstsq(z_matrix, v_vector, rcond=1e-10)[0]

        for i in range(num_ports):
            y_matrix[i, j] = (courant_de_coupe(currents, rwg_basis, coupes[i])
                              / v_amplitude)

    # Symetrisation : impose la reciprocite (Y = Y^T) pour milieux reciproques
    y_matrix = 0.5 * (y_matrix + y_matrix.T)

    s_matrix = convert_y_to_s(y_matrix, z0_ports)

    if num_ports >= 2:
        logger.debug(
            f"  S11 = {np.abs(s_matrix[0,0]):.4f} angle "
            f"{np.degrees(np.angle(s_matrix[0,0])):.1f} deg, "
            f"S21 = {np.abs(s_matrix[1,0]):.4f} angle "
            f"{np.degrees(np.angle(s_matrix[1,0])):.1f} deg"
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
        # Approximation barycentrique : évaluation au centre de gravité du triangle
        c_plus = np.mean(vertices[elements[tri_plus]], axis=0)
        v_plus = vertices[rwg.vertex_plus]
        rho_plus = c_plus - v_plus
        vec_plus = np.zeros(3, dtype=float)
        vec_plus[:min(3, len(rho_plus))] = rho_plus[:min(3, len(rho_plus))]
        j_density[tri_plus] += current_coef * (rwg.edge_length / (2 * rwg.area_plus)) * vec_plus
        
        # Contribution au triangle T-
        # J = I_n * f_n où f_n = l_n/(2*A_n) * (r_n - r) = - l_n/(2*A_n) * (r - r_n)
        if rwg.area_minus > 1e-15:
            c_minus = np.mean(vertices[elements[tri_minus]], axis=0)
            v_minus = vertices[rwg.vertex_minus]
            rho_minus = c_minus - v_minus
            vec_minus = np.zeros(3, dtype=float)
            vec_minus[:min(3, len(rho_minus))] = rho_minus[:min(3, len(rho_minus))]
            j_density[tri_minus] -= current_coef * (rwg.edge_length / (2 * rwg.area_minus)) * vec_minus
    
    return j_density
# ==========================================================================
# LE DE-EMBARQUEMENT PAR DEUX LONGUEURS
# --------------------------------------------------------------------------
# CE QU'IL RETIRE, ET POURQUOI IL FAUT LE RETIRER. Un port vertical n'est pas
# un point : c'est un via, un trou perce dans la piste, et le coin ou le
# courant tourne. Tout cela porte une reactance qui n'appartient pas a la
# ligne, et qui se retrouve entiere dans |S11|. Sur le cas d'essai elle vaut
# 0,26 -- ce n'est pas un detail, c'est le quart de l'onde renvoyee.
#
# L'IDEE, ET ELLE TIENT EN UNE LIGNE D'ALGEBRE. On simule DEUX lignes qui ne
# different que par leur longueur, avec les MEMES ports. En matrices de chaine,
#
#     T1 = A . D(L1) . B          T2 = A . D(L2) . B
#
# ou A et B sont les deux acces -- inconnus -- et D(L) la ligne. Alors
#
#     T2 . T1^-1 = A . D(L2 - L1) . A^-1
#
# B a disparu, et A ne subsiste que par une similitude, qui ne change pas les
# valeurs propres. Or celles de D(dL) sont exp(-gamma dL) et exp(+gamma dL).
# La constante de propagation de la ligne se lit donc sur le spectre d'une
# matrice 2x2, SANS connaitre les acces, et sans etalon d'aucune sorte.
#
# CE QU'ON EN TIRE, ET CE QU'ON N'EN TIRE PAS :
#
#   · gamma = alpha + j beta, DONC eps_eff = (beta c / omega)^2 et
#     l'attenuation en dB/m. Exact, aux erreurs du solveur pres ;
#   · PAS l'impedance caracteristique. La methode a deux lignes ne la donne
#     pas : il y faudrait un troisieme etalon -- un court-circuit, une charge
#     -- comme dans un TRL complet. C'est une limite de la METHODE, pas du
#     code, et il vaut mieux l'ecrire que rendre un chiffre qu'on ne sait pas
#     justifier.
#
# LE PIEGE DE LA PHASE, ET COMMENT ON LE DESAMORCE. Le logarithme complexe ne
# rend beta dL que modulo 2 pi : si les deux lignes different de plus d'une
# demi-longueur d'onde guidee, le resultat est faux d'un multiple de 2 pi sans
# que rien ne le signale. La fonction le VERIFIE quand on lui donne une
# estimation d'eps_eff, et refuse plutot que de rendre un beta plausible.
# ==========================================================================

def _s_vers_t(s):
    """La matrice de chaine d'un deux-ports, dans la convention qui se cascade.

        T = (1/S21) [[ -det S, S11 ], [ -S22, 1 ]]

    C'est celle pour laquelle la mise bout a bout de deux reseaux est le
    PRODUIT de leurs T, dans l'ordre du signal. C'est tout ce qu'on lui
    demande.
    """
    s = np.asarray(s, dtype=complex)
    s21 = s[1, 0]
    if abs(s21) < 1e-300:
        raise ValueError("_s_vers_t : S21 nul, la matrice de chaine n'existe pas")
    det = s[0, 0] * s[1, 1] - s[0, 1] * s[1, 0]
    return np.array([[-det, s[0, 0]],
                     [-s[1, 1], 1.0]], dtype=complex) / s21


def deembarquement_deux_longueurs(s_courte, s_longue, delta_l, freq,
                                  eps_eff_attendu=None):
    """gamma de la ligne, les acces retires, par la methode des deux longueurs.

    Args:
        s_courte, s_longue: les matrices S 2x2 des deux lignes, MEMES ports
        delta_l: la difference de longueur, en metres (positive)
        freq: la frequence, en hertz
        eps_eff_attendu: si donne, sert a lever l'ambiguite de 2 pi sur la
              phase ET a la verifier. Sans lui, on rend la determination
              principale et on le DIT.

    Returns:
        dict avec 'gamma', 'beta', 'alpha_np_par_m', 'alpha_db_par_m',
        'eps_eff', 'valeurs_propres', 'tours' (le nombre de 2 pi ajoutes).

    LES DEUX VALEURS PROPRES SE CONTROLENT L'UNE L'AUTRE. Elles doivent etre
    inverses l'une de l'autre -- exp(-gamma dL) et exp(+gamma dL) --, et leur
    produit vaut donc un. L'ecart a un mesure tout ce qui n'est pas une ligne
    uniforme entre les deux simulations : maillage different, port qui a bouge,
    rayonnement. On le rend, sous 'residu_reciproque', et l'appelant a de quoi
    juger.
    """
    if delta_l <= 0:
        raise ValueError("deembarquement_deux_longueurs : delta_l doit etre > 0")

    t1 = _s_vers_t(s_courte)
    t2 = _s_vers_t(s_longue)
    m = t2 @ np.linalg.inv(t1)

    valeurs = np.linalg.eigvals(m)
    # Celle qui DECROIT est exp(-gamma dL) : son module est le plus petit,
    # puisque alpha >= 0 sur un milieu passif.
    ordre = np.argsort(np.abs(valeurs))
    lam = valeurs[ordre[0]]
    lam_inv = valeurs[ordre[1]]

    residu = abs(lam * lam_inv - 1.0)

    # gamma dL = -ln(lambda), a 2 pi j pres.
    g_dl = -np.log(lam)
    tours = 0
    if eps_eff_attendu is not None:
        omega = 2 * np.pi * freq
        beta_attendu = omega * np.sqrt(eps_eff_attendu) / C_0
        cible = beta_attendu * delta_l
        # On ajoute le nombre entier de tours qui rapproche le plus.
        tours = int(np.round((cible - g_dl.imag) / (2 * np.pi)))
        g_dl = g_dl + 2j * np.pi * tours

    gamma = g_dl / delta_l
    omega = 2 * np.pi * freq
    beta = gamma.imag
    alpha = gamma.real
    eps_eff = (beta * C_0 / omega) ** 2

    return {
        'gamma': complex(gamma),
        'beta': float(beta),
        'alpha_np_par_m': float(alpha),
        'alpha_db_par_m': float(alpha * 8.685889638065035),
        'eps_eff': float(eps_eff),
        'valeurs_propres': (complex(lam), complex(lam_inv)),
        'residu_reciproque': float(residu),
        'tours': int(tours),
        'phase_ambigue': eps_eff_attendu is None,
    }


# ==========================================================================
# LES PARAMETRES DE LIGNE, LUS SUR UNE SEULE SIMULATION
# --------------------------------------------------------------------------
# CE QUE CETTE FONCTION EXISTE POUR NE PLUS FAIRE. L'impedance qu'un panneau
# peint sur une piste est une impedance CARACTERISTIQUE : celle de la ligne,
# independante de ce qu'on branche au bout. Ce qu'un deux-ports donne le plus
# facilement est tout autre chose -- l'impedance d'ENTREE,
#
#     Z_in = Z_ref (1 + S11) / (1 - S11)
#
# qui est celle de la ligne CHARGEE par le port d'en face. Les deux se
# confondent quand la ligne est adaptee et divergent des qu'elle ne l'est pas.
# Mesure sur un microruban de 6 mm, FR4 de 0,370 mm, a 2 GHz :
#
#     largeur    Z0 vrai     Z_in
#     0,35 mm    71,5 ohm    55,7 ohm
#     0,70 mm    50,8 ohm    49,9 ohm
#     1,05 mm    38,7 ohm    43,3 ohm
#     2,00 mm    25,0 ohm    28,7 ohm
#
# L'ERREUR EST TOUJOURS DANS LE SENS DE Z_ref, ce qui est le pire des cas :
# une piste desadaptee se lit comme une piste correcte, et c'est precisement
# la question qu'on etait venu poser.
#
# LA LECTURE JUSTE, ET ELLE TIENT EN DEUX FORMULES (Eisenstadt et Eo, IEEE
# Trans. CHMT 15(4), 1992). Pour un deux-ports reciproque dont les plans de
# reference sont aux DEUX BOUTS de la ligne :
#
#     Z0^2 = Z_ref^2 . [ (1+S11)^2 - S21 S12 ] / [ (1-S11)^2 - S21 S12 ]
#     cosh(gamma L) = (1 - S11 S22 + S21 S12) / (2 S21)
#
# d'ou eps_eff = (beta c / omega)^2, le retard beta L / omega et
# l'attenuation en dB/m. TOUT SORT DE LA MEME MATRICE S que le solveur vient
# de rendre : aucune formule analytique ne se glisse dans le resultat, et
# c'est tout l'interet d'avoir paye un calcul pleine onde.
#
# CE QU'ELLE INCLUT, ET QUE LE DE-EMBARQUEMENT A DEUX LONGUEURS RETIRE. Les
# plans de reference sont ceux des PORTS, fut de via d'acces compris : sa
# reactance est donc comptee DANS la ligne, la ou `deembarquement_deux_
# longueurs` juste au-dessus sait l'enlever -- au prix d'une seconde
# simulation. C'est un choix, pas un oubli : sur les cas mesures l'ecart a
# Hammerstad reste sous 2 %, et doubler le prix du calcul pour gagner ces
# 2 % ne serait pas un bon echange sur une route interactive.
#
# ET ELLE SUPPOSE LA LIGNE UNIFORME. Sur un parcours qui change de largeur, de
# couche ou qui tourne, Z0 rendu est celui de la ligne uniforme EQUIVALENTE --
# une moyenne, qui a un sens pour la liaison entiere et aucun troncon par
# troncon. C'est a l'appelant de ne pas la peindre comme une valeur locale.
#
# L'AMBIGUITE DE PHASE EST LA MEME QU'A COTE, et desamorcee pareil : arccosh
# ne rend gamma L que modulo 2 pi j et au signe pres. On prend la
# determination physique -- un milieu passif n'amplifie pas, donc alpha >= 0 --
# et l'on DIT quand la ligne depasse la demi-longueur d'onde guidee, seuil
# au-dela duquel le nombre de tours ne se deduit plus de la seule matrice.
# ==========================================================================

def parametres_de_ligne(s, z_ref, longueur, freq, eps_eff_attendu=None):
    """Z0, gamma et eps_eff d'une ligne uniforme, depuis SA matrice S.

    Args:
        s: la matrice S 2x2 du troncon, normalisee sur z_ref
        z_ref: l'impedance de reference des ports, en ohms
        longueur: la longueur physique de la ligne, en METRES
        freq: la frequence, en hertz
        eps_eff_attendu: si donne, leve l'ambiguite de 2 pi sur beta L, et
              sert a la verifier

    Returns:
        dict avec 'z0' (complexe), 'z0_reel', 'z_in', 'gamma', 'beta',
        'alpha_np_par_m', 'alpha_db_par_m', 'eps_eff', 'retard', 'tours',
        'phase_ambigue'

    LES REFUS SONT EXPLICITES, comme partout ailleurs dans cette chaine. Une
    matrice dont S21 est nul ne porte AUCUNE ligne -- c'est une coupure, un
    via qui n'a pas ete maille, un port pose a cote du cuivre --, et rendre un
    Z0 dessus serait inventer un chiffre sur une structure ouverte.
    """
    s = np.asarray(s, dtype=complex)
    if s.shape != (2, 2):
        raise ValueError("parametres_de_ligne : il faut une matrice S 2x2, "
                         "recu %s" % (s.shape,))
    if not (longueur > 0):
        raise ValueError("parametres_de_ligne : la longueur doit etre > 0")
    if not (z_ref > 0):
        raise ValueError("parametres_de_ligne : z_ref doit etre > 0")

    s11, s12 = s[0, 0], s[0, 1]
    s21, s22 = s[1, 0], s[1, 1]

    if not np.isfinite(s).all():
        raise ValueError("parametres_de_ligne : la matrice S porte des nan "
                         "ou des infinis -- le solveur n'a pas abouti")
    if abs(s21) < 1e-12:
        raise ValueError(
            "parametres_de_ligne : |S21| = %.3g, la structure ne transmet "
            "rien. Il n'y a pas de ligne a caracteriser." % abs(s21))

    croise = s21 * s12
    num = (1.0 + s11) ** 2 - croise
    den = (1.0 - s11) ** 2 - croise
    if abs(den) < 1e-300:
        raise ValueError("parametres_de_ligne : denominateur nul, Z0 n'est "
                         "pas defini sur cette matrice")

    z0 = z_ref * np.sqrt(num / den)
    # LA RACINE A DEUX BRANCHES ET UNE SEULE EST PHYSIQUE : l'impedance
    # caracteristique d'une ligne passive a une partie reelle POSITIVE. numpy
    # rend la determination principale, qui peut tomber du mauvais cote.
    if z0.real < 0:
        z0 = -z0

    cosh_gl = (1.0 - s11 * s22 + croise) / (2.0 * s21)
    g_l = np.arccosh(cosh_gl)
    # MEME REGLE POUR gamma, et pour la meme raison : un milieu passif
    # n'amplifie pas, donc alpha >= 0.
    if g_l.real < 0:
        g_l = -g_l

    tours = 0
    if eps_eff_attendu is not None and eps_eff_attendu > 0 and freq > 0:
        beta_attendu = 2.0 * np.pi * freq * np.sqrt(eps_eff_attendu) / C_0
        cible = beta_attendu * longueur
        tours = int(np.round((cible - g_l.imag) / (2.0 * np.pi)))
        g_l = g_l + 2j * np.pi * tours

    # LA DEMI-LONGUEUR D'ONDE GUIDEE EST LE SEUIL, et non la longueur d'onde :
    # au-dela de beta L = pi, deux geometries differentes rendent le meme
    # cosh, et rien dans la matrice ne dit laquelle on tient.
    ambigue = bool(eps_eff_attendu is None and abs(g_l.imag) > np.pi)

    gamma = g_l / longueur
    omega = 2.0 * np.pi * freq
    beta = float(gamma.imag)
    alpha = float(gamma.real)
    eps_eff = float((beta * C_0 / omega) ** 2) if omega > 0 else 0.0
    retard = float(beta * longueur / omega) if omega > 0 else 0.0

    z_in = (z_ref * (1.0 + s11) / (1.0 - s11)
            if abs(1.0 - s11) > 1e-12 else complex(float('inf'), 0.0))

    return {
        'z0': complex(z0),
        'z0_reel': float(z0.real),
        'z_in': complex(z_in),
        'gamma': complex(gamma),
        'beta': beta,
        'alpha_np_par_m': alpha,
        'alpha_db_par_m': float(alpha * 8.685889638065035),
        'eps_eff': eps_eff,
        'retard': retard,
        'tours': int(tours),
        'phase_ambigue': ambigue,
    }

# ==========================================================================
# CE QUI A ETE RETIRE EN 1.1.0, ET POURQUOI
# --------------------------------------------------------------------------
# Six fonctions que personne n'appelait : `compute_z_parameters`,
# `convert_z_to_s`, `compute_power_flow`, `compute_vswr`,
# `compute_return_loss` et `compute_insertion_loss`. Ni le moteur, ni la
# route /api/simulation-25d, ni un banc d'essai, ni le CLI.
#
# ELLES N'ETAIENT PAS SEULEMENT INERTES, ELLES ETAIENT CONCURRENTES. La
# chaine passe par la matrice d'ADMITTANCE -- une excitation en fente par
# coupe de port, `convert_y_to_s` au bout --, et ces deux-la offraient une
# seconde route par la matrice d'impedance, avec une autre convention de
# port. Deux chemins pour le meme S sur le meme maillage, dont un jamais
# eprouve : c'est ainsi qu'on se retrouve un jour a debattre duquel des
# deux avait raison. Le VSWR et les deux pertes en dB, eux, sont trois
# lignes d'arithmetique que l'appelant ecrit ou il en a besoin.
# ==========================================================================
