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


# ==========================================================================
# LA FONCTION DE GREEN STRATIFIEE, PAR LIGNES DE TRANSMISSION
# --------------------------------------------------------------------------
# CE QUI ETAIT LA AVANT, ET POURQUOI IL FALLAIT LE JETER. `apply_dcim` posait
# ses images a la main : une serie geometrique de reflexions de Fresnel a
# incidence normale, amortie par un « exp(-0,1 n) » qui ne venait d'aucun
# calcul. Sa propre docstring le disait -- « pour une vraie DCIM, il faudrait
# GPOF ». Une fonction de Green fausse fait une matrice d'impedance fausse, et
# aucune correction en aval ne la rattrape : Z0 = racine(L/C) n'a pas de raison
# de tomber juste si C ne tombe pas juste. Rien ne le contredisait, parce que
# rien ne le mesurait.
#
# CE QUI LA REMPLACE est la methode telle qu'elle se fait :
#
#   1. LE SPECTRE EXACT DU MILIEU STRATIFIE. Un milieu en couches EST un
#      circuit de lignes de transmission -- c'est la formulation TLGF, exacte,
#      pas un modele. Chaque couche est une ligne d'impedance caracteristique
#      Z_i = k_zi/(omega eps_i) en TM, de longueur electrique k_zi d_i. On
#      cascade depuis le plan de masse (court-circuit) jusqu'au plan de la
#      piste, on cascade depuis l'air (ligne adaptee) jusqu'au meme plan, et la
#      tension au plan source est la mise en PARALLELE des deux : c'est la
#      reponse a une source de courant, donc la fonction de Green spectrale du
#      potentiel scalaire.
#
#   2. UN AJUSTEMENT PAR GPOF (Hua & Sarkar). Le spectre est echantillonne le
#      long des chemins de Chow, puis approche par une somme d'exponentielles
#      en k_z. GPOF extrait amplitudes et exposants par un probleme aux VALEURS
#      PROPRES, sans valeur initiale a deviner, contrairement a Prony.
#
#   3. L'IDENTITE DE SOMMERFELD ferme la boucle : chaque exponentielle
#      exp(-j k_z d) du spectre EST une onde spherique exp(-j k r)/(4 pi r)
#      partant d'une image a la profondeur COMPLEXE d. C'est tout ce que veut
#      dire « image complexe », et c'est pourquoi `green_spatial` n'a plus qu'a
#      sommer des ondes spheriques.
#
# CE QUE CETTE VERSION NE FAIT PAS, ET QU'IL FAUT SAVOIR EN LISANT UN CHIFFRE :
#   · l'ajustement vaut pour UN plan source, celui des pistes. Un empilage a
#     deux couches de signal demanderait un jeu d'images par couche ;
#   · c'est le noyau TM (potentiel SCALAIRE) qui est ajuste, parce que c'est
#     lui qui porte les charges, donc la capacite, donc Z0. `mom_engine` s'en
#     sert AUSSI pour le potentiel vecteur, ce qui est une approximation qui
#     lui est propre et que ce module ne peut pas corriger ;
#   · les ondes de surface ne sont pas extraites separement. Sur du FR-4 mince
#     en dessous de quelques gigahertz elles ne portent rien ; au-dela, il
#     faudrait les sortir avant l'ajustement.
# ==========================================================================

# Les chemins d'echantillonnage de Chow.
#
# T0 NE PEUT PAS ETRE UNE CONSTANTE, et c'est ce qui a coute le plus cher a
# comprendre. La litterature donne T0 ~ 10, mais elle vise des substrats dont
# l'epaisseur est une fraction non negligeable de la longueur d'onde. Un
# stratifie de 0,37 mm a 1 GHz ne l'est pas du tout : le plus grand k_rho
# atteint vaut alors 10 k, soit 440 rad/m, quand il faudrait depasser 1/h =
# 2700 rad/m pour voir le spectre s'aplatir. L'ajustement travaillait donc sur
# une fenetre ou la fonction ne s'etait pas encore rangee.
DCIM_T0_MIN = 10.0
DCIM_KRHO_H = 10.0          # combien de 1/h le chemin lointain doit atteindre
DCIM_ECHANTILLONS = 256


def _kz(k, k_rho):
    """La composante verticale, sur la bonne feuille de Riemann.

    Im(k_z) <= 0 : c'est la condition de rayonnement pour la convention
    exp(-j k z) utilisee partout ici. La racine principale de numpy rend
    Re >= 0, ce qui n'est pas la meme chose -- et prendre la mauvaise feuille
    fait CROITRE les ondes au lieu de les amortir.
    """
    kz = np.sqrt(k ** 2 - k_rho ** 2 + 0j)
    return np.where(np.imag(kz) > 0, -kz, kz)


def _impedance_vue(k_rho, omega, couches, court_circuit):
    """L'impedance TM vue depuis le plan source, en regardant vers l'exterieur.

    `couches` est la liste des milieux traverses, du plus proche du plan source
    au plus lointain : [(epaisseur, epsilon_complexe), ...]. Quand la pile ne
    bute pas sur un plan de masse, la DERNIERE entree est le demi-espace
    terminal et son epaisseur est ignoree.

    La cascade est ecrite en exponentielles DECROISSANTES plutot qu'en
    tangentes : sur les echantillons evanescents profonds, tan(k_z d) deborde,
    et c'est precisement la que l'ajustement a besoin de precision.
    """
    def z_car(eps_c):
        k = omega * np.sqrt(MU_0 * EPSILON_0 * eps_c)
        kz = _kz(k, k_rho)
        return kz / (omega * EPSILON_0 * eps_c), kz

    if not couches:
        return z_car(1.0 + 0j)[0]

    if court_circuit:
        z_l = np.zeros_like(np.asarray(k_rho, dtype=complex))
        a_traverser = list(reversed(couches))
    else:
        z_l = z_car(couches[-1][1])[0]
        a_traverser = list(reversed(couches[:-1]))

    for epaisseur, eps_c in a_traverser:
        z_i, kz = z_car(eps_c)
        u = np.exp(-2j * kz * epaisseur)      # |u| <= 1 par construction de _kz
        num = z_l * (1 + u) + z_i * (1 - u)
        den = z_i * (1 + u) + z_l * (1 - u)
        z_l = z_i * num / den

    return z_l


def profil_spectral(stackup, z_src=None):
    """Ce que le spectre a besoin de savoir : deux piles et un milieu de reference.

    Rend (bas, haut, masse_en_bas, masse_en_haut, eps_ref, z_src).

    `bas` et `haut` sont les milieux traverses de part et d'autre du plan des
    pistes, du plus proche au plus lointain. Le cuivre n'y figure pas : il est
    soit un plan de masse -- et alors c'est une TERMINAISON, pas un milieu --,
    soit une couche de signal, que le maillage represente et qui n'a pas
    d'epaisseur electrique ici.

    QUI EST LE PLAN DE MASSE. Le role, quand l'empilage le porte -- c'est pour
    cela que `extract_stackup` le recopie. Sinon le cuivre le plus bas, ce qui
    est le cas d'une carte deux couches et le repli le moins surprenant.
    """
    couches = stackup['layers']

    cuivres = [i for i, c in enumerate(couches) if c.get('type') == 'copper']
    plans = [i for i in cuivres if str(couches[i].get('role', '')) == 'plane']
    if not plans and cuivres:
        plans = [cuivres[0]]

    # Le plan des pistes : le cuivre de SIGNAL le plus haut, ou le plus haut
    # tout court si tout est plan.
    i_src = None
    if z_src is not None:
        for i in cuivres:
            if abs(couches[i].get('z_top', 0.0) - z_src) < 1e-12:
                i_src = i
                break
    if i_src is None:
        signaux = [i for i in cuivres if i not in plans]
        i_src = (signaux[-1] if signaux else (cuivres[-1] if cuivres else 0))
        z_src = couches[i_src].get('z_top', 0.0) if couches else 0.0

    def eps_c(c):
        return c.get('epsilon_r', 1.0) * (1 - 1j * c.get('tan_delta', 0.0))

    def pile(indices):
        """Les milieux dans l'ordre, et si la pile bute sur un plan de masse."""
        out = []
        for i in indices:
            c = couches[i]
            if c.get('type') == 'copper':
                if i in plans:
                    return out, True          # plan de masse : terminaison
                continue                      # cuivre de signal : transparent
            e = c.get('thickness', 0.0)
            if e > 0:
                out.append((e, eps_c(c)))
        return out, False

    bas, masse_bas = pile(range(i_src - 1, -1, -1))
    haut, masse_haut = pile(range(i_src + 1, len(couches)))

    # Un demi-espace ferme la pile qui ne bute sur rien : de l'air au-dessus de
    # la carte, et en dessous le dernier stratifie prolonge.
    if not masse_haut:
        haut.append((0.0, 1.0 + 0j))
    if not masse_bas:
        bas.append((0.0, bas[-1][1] if bas else 1.0 + 0j))

    # LE MILIEU DE REFERENCE est celui qui porte le champ, donc le stratifie
    # sous la piste. Il fixe le nombre d'onde des images, et sa permittivite
    # normalise l'ajustement.
    eps_ref = bas[0][1] if bas else (1.0 + 0j)
    return bas, haut, masse_bas, masse_haut, eps_ref, z_src


def green_spectral_tm(k_rho, stackup, freq, profil=None):
    """Le noyau spectral TM au plan des pistes, normalise comme l'espace libre.

    Rend F(k_rho) tel que, dans un milieu HOMOGENE de permittivite de
    reference, F vaille exactement 1 : c'est ce qui rend l'ajustement lisible
    -- une image d'amplitude 1 a la profondeur 0 EST le terme direct.

        F = 2 omega eps_ref V_TM / k_z_ref      avec V_TM = Z_haut // Z_bas

    et G_spectral = F / (2 j k_z_ref), dont l'identite de Sommerfeld fait
    exp(-j k r)/(4 pi r).
    """
    if profil is None:
        profil = profil_spectral(stackup)
    bas, haut, masse_bas, masse_haut, eps_ref, _ = profil

    omega = 2 * np.pi * freq
    k_ref = omega * np.sqrt(MU_0 * EPSILON_0 * eps_ref)
    kz_ref = _kz(k_ref, k_rho)

    z_bas = _impedance_vue(k_rho, omega, bas, masse_bas)
    z_haut = _impedance_vue(k_rho, omega, haut, masse_haut)

    somme = z_bas + z_haut
    # Les deux impedances s'annulent quand le plan source EST le plan de masse.
    somme = np.where(np.abs(somme) < 1e-30, 1e-30, somme)
    v_tm = z_bas * z_haut / somme

    return 2.0 * omega * EPSILON_0 * eps_ref * v_tm / kz_ref


def gpof(y, ordre, pinceau=None):
    """GPOF : y[n] = somme_i c_i z_i^n, retrouver les c_i et les z_i.

    C'est la methode de Hua et Sarkar (1989). Elle passe par un probleme aux
    VALEURS PROPRES la ou Prony passe par les racines d'un polynome : pas de
    valeur initiale a fournir, et une robustesse au bruit sans commune mesure.

    `pinceau` (le « pencil parameter » L) vaut N/3 par defaut, ce que la
    litterature donne comme optimum de variance. La troncature aux `ordre`
    premieres valeurs singulieres filtre le bruit numerique : sans elle, on
    ajuste les derniers chiffres du calcul en virgule flottante.
    """
    y = np.asarray(y, dtype=complex)
    n = len(y)
    if pinceau is None:
        pinceau = max(2, n // 3)
    pinceau = int(min(pinceau, n - 2))
    ordre = int(max(1, min(ordre, pinceau)))

    lignes = n - pinceau
    hankel = np.empty((lignes, pinceau + 1), dtype=complex)
    for i in range(lignes):
        hankel[i, :] = y[i:i + pinceau + 1]
    y0 = hankel[:, :pinceau]
    y1 = hankel[:, 1:]

    u, s, vh = np.linalg.svd(y0, full_matrices=False)
    garde = int(min(ordre, int(np.sum(s > s[0] * 1e-12)))) if s.size else 0
    if garde < 1:
        return np.array([0.0 + 0j]), np.array([1.0 + 0j])

    u_m = u[:, :garde]
    s_m = s[:garde]
    v_m = vh[:garde, :].conj().T

    noyau = np.diag(1.0 / s_m) @ u_m.conj().T @ y1 @ v_m
    z = np.linalg.eigvals(noyau)
    z = z[np.abs(z) > 1e-14]
    if z.size == 0:
        return np.array([0.0 + 0j]), np.array([1.0 + 0j])

    # Les amplitudes : un Vandermonde et un moindre carre. Rien de plus.
    vander = z[np.newaxis, :] ** np.arange(n)[:, np.newaxis]
    c, *_ = np.linalg.lstsq(vander, y, rcond=None)
    return c, z


def _echelles(profil):
    """(h_min, h_max) des dielectriques traverses, en metres."""
    ep = [e for e, _ in (profil[0] + profil[1]) if e > 0]
    if not ep:
        return 1e-3, 1e-3
    return min(ep), max(ep)


def _chemins(stackup, freq, profil):
    """LES DEUX CHEMINS de la DCIM a deux niveaux, et leur parametrisation.

    POURQUOI DEUX. Un chemin unique ne peut pas servir les deux regimes a la
    fois. Le spectre d'un microruban a deux echelles tres separees : l'onde, en
    1/lambda, et la geometrie, en 1/h. Sur du FR-4 de 0,37 mm a 1 GHz elles
    different d'un facteur soixante. Un chemin assez long pour atteindre
    l'evanescent de la geometrie n'accorde alors que quelques echantillons a la
    region propagative -- celle qui commande le champ LOIN de la source --, et
    l'ajustement y devient faux. Le banc l'a mesure : juste a 0,2 mm, faux de
    dix-sept pour cent a 3 mm.

    C'est la DCIM a deux niveaux d'Aksun, et la separation est celle-la :

      · le chemin LOINTAIN, purement imaginaire, k_z = -j k t, qui balaie
        l'evanescent jusqu'a une dizaine de 1/h. Il capte le comportement
        quasi-statique, celui des images proches ;
      · le chemin PROCHE, k_z = k(1 - t/T0 - j t), qui couvre le propagatif et
        le debut de l'evanescent. On l'ajuste sur ce que le premier niveau a
        LAISSE, et il capte ce qui porte le champ a distance.

    Chacun est AFFINE en son parametre, et c'est toute l'astuce : exp(-j k_z d)
    devient une suite geometrique en l'indice d'echantillon, ce que GPOF sait
    defaire.
    """
    eps_ref = profil[4]
    omega = 2 * np.pi * freq
    k_ref = omega * np.sqrt(MU_0 * EPSILON_0 * eps_ref)
    h_min, _ = _echelles(profil)

    t0_proche = DCIM_T0_MIN
    t0_loin = max(2.0 * t0_proche, DCIM_KRHO_H / (abs(k_ref) * h_min))

    n = DCIM_ECHANTILLONS
    t_loin = np.linspace(t0_proche, t0_loin, n)
    kz_loin = -1j * k_ref * t_loin

    t_proche = np.linspace(0.0, t0_proche, n)
    kz_proche = k_ref * (1.0 - t_proche / t0_proche - 1j * t_proche)

    def krho(kz):
        return np.sqrt(k_ref ** 2 - kz ** 2 + 0j)

    return {
        'k_ref': k_ref,
        'loin': (kz_loin, krho(kz_loin), kz_loin[0], kz_loin[1] - kz_loin[0]),
        'proche': (kz_proche, krho(kz_proche),
                   kz_proche[0], kz_proche[1] - kz_proche[0]),
    }


def _images_dun_chemin(y, kz0, dkz, ordre, portee):
    """GPOF sur un chemin, puis retour aux profondeurs complexes.

    k_z(n) = kz0 + n dkz, donc exp(-j k_z(n) d) = exp(-j kz0 d) rapport^n avec
    rapport = exp(-j dkz d) : le pole rendu par GPOF EST ce rapport, et
    l'amplitude porte le exp(-j kz0 d) qu'on lui rend.
    """
    c, z = gpof(y, ordre)
    out = []
    for c_i, z_i in zip(c, z):
        d = 1j * np.log(z_i) / dkz
        amp = c_i * np.exp(1j * kz0 * d)
        if not (np.isfinite(amp) and np.isfinite(d)):
            continue
        # UNE IMAGE PLUS LOIN QUE LA CARTE N'EST PAS PHYSIQUE : c'est un pole
        # parasite de l'ajustement, et le sommer n'ajoute que du bruit avec un
        # poids arbitraire.
        if abs(d) > portee:
            continue
        if abs(amp) < 1e-12:
            continue
        out.append((complex(amp), complex(d)))
    return out


def apply_dcim(stackup, num_images=10, freq=1e9, z_src=None):
    """La fonction de Green stratifiee, mise en images complexes par GPOF.

    TROIS MORCEAUX, ET CHACUN A SA RAISON :

      1. LE TERME NON DECROISSANT, SORTI A LA MAIN. En k_rho grand le noyau ne
         tend pas vers zero mais vers la constante 2 eps1/(eps1+eps2) -- celle
         qui donne le milieu moyen du microruban. Ajuster une fonction qui ne
         decroit pas par une somme d'exponentielles revient a demander a GPOF
         de fabriquer un pole de module 1 par compensation entre poles
         voisins : exact sur les points d'echantillonnage, absurde ailleurs. Le
         banc l'a mesure -- 0,000 % sur le chemin, 52 % dans le domaine
         spatial. Or sa transformee est EXACTEMENT une image d'amplitude c_inf
         a la profondeur zero, alors on la pose.
      2. LE NIVEAU LOINTAIN, qui ajuste le reste dans l'evanescent profond.
      3. LE NIVEAU PROCHE, qui ajuste ce que le niveau lointain a laisse dans
         la region propagative. C'est lui qui porte le champ a distance.

    Args:
        stackup: l'empilage, tel que `extract_stackup` le rend
        num_images: le nombre d'images ajustees PAR NIVEAU
        freq: la frequence. Les images en dependent, il faut les refaire a
              chaque point de la bande, et `main.py` le fait
        z_src: le plan des pistes. Deduit de l'empilage quand il manque

    Returns:
        La liste des images. `position` est une PROFONDEUR COMPLEXE mesuree
        depuis le plan source, et non une altitude absolue : c'est ce que
        l'identite de Sommerfeld produit, et ce que `green_spatial` attend.
    """
    profil = profil_spectral(stackup, z_src)
    chemins = _chemins(stackup, freq, profil)
    h_min, h_max = _echelles(profil)
    portee = 200.0 * h_max

    def spectre(k_rho):
        return green_spectral_tm(k_rho, stackup, freq, profil)

    # 1. La constante evanescente, prise tres loin sur l'axe REEL -- et non au
    #    bout d'un chemin, qui n'y est pas forcement arrive. « Tres loin » se
    #    mesure en 1/h : c'est la seule echelle qui compte, l'onde oubliee.
    c_inf = complex(spectre(np.array([1e4 / h_min]))[0])
    if not np.isfinite(c_inf):
        c_inf = 0.0 + 0j

    images = [(complex(c_inf), 0.0 + 0j)]

    def somme(kz, paires):
        out = np.zeros_like(kz)
        for amp, d in paires:
            out = out + amp * np.exp(-1j * kz * d)
        return out

    # 2. puis 3. Chaque niveau ajuste ce que le precedent a laisse.
    for nom in ('loin', 'proche'):
        kz, k_rho, kz0, dkz = chemins[nom]
        f = spectre(k_rho)
        if not np.all(np.isfinite(f)):
            logger.warning("Spectre non fini sur le chemin « %s »", nom)
            continue
        reste = f - somme(kz, images)
        images.extend(_images_dun_chemin(reste, kz0, dkz, num_images, portee))

    logger.debug("  %d images complexes ajustees par GPOF a deux niveaux",
                 len(images))
    return [ComplexImage(amplitude=a, position=d, layer_index=0)
            for a, d in images]


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

    # LE NOMBRE D'ONDE EST CELUI DU MILIEU DE REFERENCE de l'ajustement, et non
    # une moyenne ponderee de tout l'empilage : les images ont ete obtenues en
    # normalisant le spectre par CE milieu-la, et les sommer avec un autre k
    # reviendrait a lire l'ajustement dans une unite qui n'est pas la sienne.
    eps_ref = profil_spectral(stackup)[4] if stackup else 1.0 + 0j
    k_ref = omega * np.sqrt(MU_0 * EPSILON_0 * eps_ref)

    # LA PROFONDEUR D'IMAGE EST RELATIVE AU PLAN SOURCE depuis que l'ajustement
    # est un vrai GPOF : c'est ce que l'identite de Sommerfeld produit. L'ecart
    # vertical entre les deux points s'y ajoute -- nul dans le cas courant, ou
    # source et observation sont sur la meme couche de cuivre.
    dz = z - z_prime

    for image in images:
        d = image.position + dz
        r = np.sqrt(rho ** 2 + d ** 2 + 0j)
        # La racine principale peut sortir du bon demi-plan sur un d complexe ;
        # une distance de partie reelle negative ferait CROITRE l'onde.
        if np.real(r) < 0:
            r = -r

        if np.abs(r) > 1e-12:
            g_total += image.amplitude * np.exp(-1j * k_ref * r) / (4 * np.pi * r)

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
