"""
Module de calcul de la fonction de Green en milieu stratifié multicouches
Implémentation DCIM (Discrete Complex Image Method) pour approximation efficace
"""

import numpy as np
import logging
from typing import Dict, List, Tuple, Optional
from scipy.optimize import brentq
from scipy.special import hankel2
from dataclasses import dataclass

logger = logging.getLogger(__name__)

# Constantes physiques
MU_0 = 4 * np.pi * 1e-7  # Perméabilité du vide (H/m)
EPSILON_0 = 8.854187817e-12  # Permittivité du vide (F/m)
C_0 = 2.99792458e8  # Vitesse de la lumière (m/s)


@dataclass
class ComplexImage:
    """Une source image complexe de la DCIM, AVEC LE NOMBRE D'ONDE QUI LA LIT.

    `k_onde` EST LE CHAMP QUI MANQUAIT, et son absence a coute le 3e niveau
    entier. L'identite de Sommerfeld dit qu'une exponentielle exp(-j k_z d) du
    spectre EST une onde spherique exp(-j k r)/(4 pi r) -- mais avec LE k DONT
    ON A PRIS LE k_z. Un niveau ajuste le long d'un chemin parametre en k_z du
    SUBSTRAT rend des images qui se relisent avec k_substrat ; un niveau
    parametre en k_z de l'AIR rend des images qui se relisent avec k_0. Les
    melanger dans une liste resommee avec un seul k, c'est lire un ajustement
    dans une unite qui n'est pas la sienne : le 3e niveau ajoutait alors du
    bruit COHERENT, ce que `banc_dcim` mesurait (25 essais -> 21) sans que rien
    ne designe la cause.

    `None` veut dire « le k de reference de l'ajustement », ce qui est le cas
    de tous les niveaux ecrits en k_z du substrat -- donc de la totalite du
    chemin par defaut, dont aucun comportement ne change.
    """
    amplitude: complex          # Amplitude de l'image
    position: complex           # Profondeur complexe z_i, depuis le plan source
    layer_index: int            # Couche source
    k_onde: Optional[complex] = None   # le k qui la resomme ; None -> k_ref








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


def _impedance_caracteristique(k_rho, omega, eps_c, mode):
    """(Z_i, k_zi) de la ligne equivalente a UN milieu, dans le mode demande.

    UN MILIEU STRATIFIE EST DEUX CIRCUITS, ET PAS UN. Le champ s'y separe en
    deux familles qui ne se parlent pas, et chacune voit sa propre ligne :

        TM, mode « e »   Z_i = k_zi / (omega eps_i)
        TE, mode « h »   Z_i = omega mu_i / k_zi

    C'est la SEULE difference entre les deux cascades. Longueurs electriques,
    terminaisons, mise en parallele : tout le reste est identique, et c'est
    pourquoi une seule fonction les sert toutes les deux.

    Le mu ne varie pas ici -- aucun stratifie de circuit imprime n'est
    magnetique. Si un jour il y en a un, c'est cette ligne-la qu'il faut
    ouvrir, et `profil_spectral` devra transporter un mu par couche.
    """
    k = omega * np.sqrt(MU_0 * EPSILON_0 * eps_c)
    kz = _kz(k, k_rho)
    # Au point de branchement k_z s'annule et l'impedance TE diverge. Le plancher
    # ne sert que la : aucun echantillon des chemins de Chow n'y tombe, mais une
    # couche intermediaire peut avoir son propre branchement sur le trajet.
    kz = np.where(np.abs(kz) < 1e-30, 1e-30, kz)
    if mode == 'te':
        return omega * MU_0 / kz, kz
    return kz / (omega * EPSILON_0 * eps_c), kz


def _impedance_vue(k_rho, omega, couches, court_circuit, mode='tm'):
    """L'impedance vue depuis le plan source, en regardant vers l'exterieur.

    `couches` est la liste des milieux traverses, du plus proche du plan source
    au plus lointain : [(epaisseur, epsilon_complexe), ...]. Quand la pile ne
    bute pas sur un plan de masse, la DERNIERE entree est le demi-espace
    terminal et son epaisseur est ignoree.

    La cascade est ecrite en exponentielles DECROISSANTES plutot qu'en
    tangentes : sur les echantillons evanescents profonds, tan(k_z d) deborde,
    et c'est precisement la que l'ajustement a besoin de precision.
    """
    def z_car(eps_c):
        return _impedance_caracteristique(k_rho, omega, eps_c, mode)

    if not couches:
        # PILE VIDE : LE COURT-CIRCUIT COMPTE ENCORE. Le cas se presente quand
        # le point d'observation est POSE sur le plan de masse -- ce qui arrive
        # a l'anneau du bas d'un via de port --, et la reponse est alors zero,
        # pas l'impedance du vide. La version precedente rendait le vide dans
        # les deux cas ; ca ne se voyait pas tant qu'aucun point n'etait sur le
        # plan, et ca faussait le noyau vertical d'un facteur quatre des qu'un
        # via en touchait un.
        if court_circuit:
            return np.zeros_like(np.asarray(k_rho, dtype=complex))
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


# ==========================================================================
# LE PLAN DE MASSE EST INFINI ET PARFAIT : RESERVE, ET NON DEFAUT
# --------------------------------------------------------------------------
# CE QUE CE MODULE SUPPOSE, EN UNE PHRASE. Un plan de masse n'est pas un
# conducteur du probleme : c'est une TERMINAISON du circuit de lignes de
# transmission -- un court-circuit, a l'infini dans les deux directions
# horizontales, sans resistance et sans trou. C'est cette hypothese qui permet
# d'ecrire la fonction de Green sous forme spectrale ANALYTIQUE, donc qui rend
# le calcul 2,5D possible du tout.
#
# CE N'EST PAS UN CHOIX D'IMPLEMENTATION, C'EST LA DEFINITION DU MODELE. On
# peut raffiner le maillage, ajouter des images, extraire des poles : rien de
# tout cela ne fait apparaitre le bord d'un plan. Le plan n'a pas de bord dans
# les equations. Lever l'hypothese demande un solveur qui MAILLE le plan --
# 3D complet, ou MoM surfacique sur le plan lui-meme --, c'est-a-dire un autre
# programme, avec un autre cout : le plan d'une carte de dix centimetres
# maille au dixieme de millimetre, c'est de l'ordre du million d'inconnues, la
# ou le 2,5D en tient quelques centaines.
#
# DEUX ENDROITS APPLIQUENT LA MEME REGLE, ET UN SEUL LA DECIDE.
# `indices_plans_masse` dit quelles couches sont des plans ; `mesher` lui
# demande, et n'en maille aucune. Si les deux en decidaient separement, le
# courant d'un plan serait compte DEUX fois -- une fois analytiquement, une
# fois par le maillage -- et la matrice d'impedance qui en sortirait serait
# plausible et fausse.
#
# QUAND L'HYPOTHESE CESSE D'ETRE BONNE, ET DE COMBIEN :
#
#   · PLAN ETROIT DEVANT LA HAUTEUR. Le retour du courant s'etale sous la
#     piste sur une largeur de l'ordre de trois fois la hauteur du
#     dielectrique. Un plan plus etroit que cela ne le porte pas tout : le
#     modele sous-estime alors l'inductance, donc surestime la vitesse. Sur du
#     FR-4 de 0,37 mm, un plan de moins d'un millimetre de large sous la piste
#     est deja hors du domaine.
#
#   · PLAN FENDU SOUS LA PISTE. C'est le cas le plus dangereux, parce que le
#     modele ne rend PAS un resultat degrade : il rend le resultat du plan
#     PLEIN, comme si la fente n'existait pas. Or une fente force le retour a
#     la contourner, ce qui ajoute de l'inductance et fait rayonner. Un
#     franchissement de fente est precisement le genre de defaut qu'on
#     voudrait simuler, et c'est celui que ce moteur ne verra jamais.
#
#   · PLAN PERCE D'UN CHAMP DE VIAS. Meme raisonnement, en plus doux : tant
#     que les trous sont petits et espaces devant la hauteur, le plan reste
#     equivalent a un plan plein.
#
#   · CONDUCTIVITE FINIE. Le court-circuit est parfait, donc le plan
#     n'apporte aucune perte. Sur du cuivre a quelques gigahertz c'est une
#     erreur de second ordre devant les pertes dielectriques -- la resistance
#     de surface du cuivre vaut quelques dizaines de milliohms par carre --,
#     mais elle est SYSTEMATIQUE et va toujours dans le meme sens :
#     l'attenuation calculee est trop faible. `python/ligne_mom.py` sait la
#     compter, lui, par sa resistance de surface ; le lecteur qui veut une
#     attenuation de conducteur doit la lire la-bas.
#
#   · DEUX PLANS, ET LA CAVITE ENTRE EUX. La cascade traite le premier plan
#     rencontre comme une terminaison et ignore ce qu'il y a derriere -- ce
#     qui est juste pour le champ de la piste, et faux pour une resonance de
#     plan. Les modes de cavite d'une paire de plans d'alimentation ne sont
#     pas dans ce modele, et `poles_du_noyau` rend d'ailleurs une liste vide
#     sur un empilage ferme des deux cotes : c'est correct pour la fonction de
#     Green, et ca ne dit rien du PDN.
#
# CE QU'IL FAUT EN FAIRE. Rien, sinon le savoir. Un resultat de ce moteur vaut
# pour une piste au-dessus d'un plan continu qui deborde largement de chaque
# cote. Hors de ce cadre, ce n'est pas que la precision se degrade : c'est que
# la question posee n'est plus celle a laquelle le modele repond.
# ==========================================================================

def indices_plans_masse(stackup):
    """Les couches de cuivre que la fonction de Green traite en PLAN DE MASSE.

    LE ROLE, QUAND L'EMPILAGE LE PORTE -- c'est pour cela que `extract_stackup`
    le recopie. Sinon le cuivre le plus bas, ce qui est le cas d'une carte deux
    couches et le repli le moins surprenant.

    CETTE FONCTION EST PUBLIQUE POUR UNE RAISON PRECISE. Le mailleur doit
    savoir exactement la meme chose : un plan que la fonction de Green compte
    ANALYTIQUEMENT ne doit pas etre maille en plus, sinon son courant est
    compte deux fois. Deux endroits qui decident cela separement finiront par
    ne plus etre d'accord, et l'erreur qui s'ensuit est invisible -- une
    matrice d'impedance plausible et fausse.
    """
    couches = stackup.get('layers', [])
    cuivres = [i for i, c in enumerate(couches) if c.get('type') == 'copper']
    plans = [i for i in cuivres if str(couches[i].get('role', '')) == 'plane']
    if not plans and cuivres:
        plans = [cuivres[0]]
    return plans


# `profil_spectral` est la brique : UNE couche de signal, ses deux piles.
# `profil_spectral_multiple` plus bas l'appelle une fois par couche de
# signal ; elle ne redit donc pas la regle du plan de masse terminal, qui
# n'a qu'un seul endroit ou etre juste.
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
    plans = indices_plans_masse(stackup)

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


def profil_spectral_multiple(stackup):
    """Les profils spectraux de TOUTES les couches de signal.

    UN AJUSTEMENT PAR COUCHE, plus les jeux croises. Un empilage a deux couches
    de signal demande :
      - un jeu d'images pour la couche 1
      - un jeu d'images pour la couche 2
      - un jeu CROISE pour les interactions entre couches

    CAS SUPPORTE (2026-08-28) : une ou deux couches de signal entre deux
    plans de masse. Le cas general (N couches) necessiterait N(N+1)/2 ajustements.

    Args:
        stackup: empilage complet

    Returns:
        dict {
          'profiles': {couche_index: (bas, haut, masse_bas, masse_haut, eps_ref, z_src)},
          'cross_profiles': [(couche_i, couche_j, profil_ij), ...]
        }
    """
    couches = stackup.get('layers', [])
    cuivres = [i for i, c in enumerate(couches) if c.get('type') == 'copper']
    plans = indices_plans_masse(stackup)

    def eps_c(c):
        return c.get('epsilon_r', 1.0) * (1 - 1j * c.get('tan_delta', 0.0))

    # Les couches de signal
    signaux = [i for i in cuivres if i not in plans]
    if not signaux:
        return {'profiles': {}, 'cross_profiles': []}

    # UN PROFIL PAR COUCHE DE SIGNAL, et c'est `profil_spectral` qui le
    # construit -- pas une seconde copie de la meme regle. La version
    # precedente en tenait une, et elle divergeait sur deux points : elle
    # empilait les dielectriques SITUES AU-DELA du plan de masse (un plan est
    # une terminaison : ce qu'il y a derriere ne porte aucun champ), et elle
    # fermait la pile du bas avec la permittivite du HAUT. Les deux faussaient
    # le milieu de reference, donc le nombre d'onde des images.
    profiles = {}
    for i_src in signaux:
        z_src = couches[i_src].get('z_top', 0.0)
        profiles[i_src] = profil_spectral(stackup, z_src)

    # LES « PROFILS CROISES » ONT ETE RETIRES D'ICI. Ils recollaient le bas
    # d'une couche et le haut de l'autre, ce qui fabrique un empilage qui
    # n'existe pas : la fonction de Green entre deux plans est celle de la
    # MEME ligne, lue a un autre endroit. Voir `profil_croise`.
    return {'profiles': profiles, 'cross_profiles': []}


# `profils_noyaux_multiples` A ETE RETIRE, ET NON CORRIGE (2026-08-30).
#
# Elle rendait un dictionnaire {couche: NoyauxGreen, 'cross': {...}} dont les
# noyaux croises etaient, au bit pres, ceux de la couche du bas : elle
# construisait un « profil croise », puis rappelait `noyaux_green(stackup,
# freq, n, z_src=z_i)` sans le lui passer. Deux couches de signal etaient donc
# calculees comme une, et rien ne le disait.
#
# ET LE PROFIL CROISE LUI-MEME N'ETAIT PAS LA BONNE IDEE : il recollait le bas
# d'une couche et le haut de l'autre pour fabriquer un empilage qui n'existe
# pas. La fonction de Green entre deux plans n'est pas celle d'un autre
# empilage -- c'est la MEME ligne de transmission, lue a un autre endroit.
#
# Ce qui la remplace est `noyaux_multicouches`, plus bas, avec
# `profil_croise` / `noyaux_croises` : la TLGF entre z et z' par transfert de
# tension exact. Le banc l'eprouve sur un cas a reponse fermee et sur la
# reciprocite.

# ==========================================================================
# DEUX POTENTIELS, DONC DEUX NOYAUX
# --------------------------------------------------------------------------
# CE QU'IL Y AVAIT AVANT : un seul noyau, celui de la ligne TM, que
# `mom_engine` employait pour le potentiel VECTEUR autant que pour le
# potentiel SCALAIRE. Le terme inductif recevait donc la fonction de Green du
# terme capacitif. Comparer un Z0 = racine(L/C) dans cet etat n'aurait mesure
# que cette erreur-la.
#
# CE QUE DIT LA FORMULATION MIXTE. On veut E = -j omega A - grad Phi avec
#
#     A_tangentiel = G_A * J        Phi = G_q * q       q = -div(J)/(j omega)
#
# Dans le plan spectral la reponse du milieu s'ecrit exactement (Michalski &
# Zheng, formulation C) :
#
#     E_u = -V_i^e J_u        E_v = -V_i^h J_v
#
# ou u est la direction de k_rho, v la perpendiculaire, et V_i la TENSION au
# plan source pour un courant unite sur la ligne du mode. En separant les deux
# potentiels a partir de ces deux equations il vient, SANS approximation :
#
#     G_A^xx  = V_i^h / (j omega)                     -- la ligne TE, seule
#     G_q     = omega (V_i^h - V_i^e) / (j k_rho^2)   -- la DIFFERENCE des deux
#
# LE POTENTIEL SCALAIRE N'EST DONC PAS « LA LIGNE TM ». C'est un raccourci
# repandu, et il n'est juste qu'a la limite quasi-statique : quand k_rho tend
# vers l'infini les deux ecritures coincident -- le TE ne porte rien
# d'electrostatique -- et c'est exactement pour cela que la version precedente
# donnait une capacite plausible. Elles se separent en O((k/k_rho)^2), c'est-a-
# dire la ou le rayonnement commence.
#
# VERIFICATION EN MILIEU HOMOGENE, qui est ce qui fixe les normalisations :
# V_i^h = omega mu/(2 k_z), V_i^e = k_z/(2 omega eps), leur difference vaut
# k_rho^2/(2 omega eps k_z), et l'on retrouve G_A = mu/(2 j k_z) et
# G_q = 1/(2 j k_z eps). L'identite de Sommerfeld en fait mu exp(-jkr)/(4 pi r)
# et exp(-jkr)/(4 pi r eps). Le banc l'eprouve.
#
# LES TROIS FONCTIONS CI-DESSOUS RENDENT TOUTES UN F NORMALISE de la meme
# maniere : F = 1 dans un milieu homogene de permittivite de reference. C'est
# ce qui rend un ajustement lisible -- une image d'amplitude 1 a la profondeur
# zero EST le terme direct -- et ce qui permet a UN SEUL ajusteur de les servir
# toutes les trois. Le facteur physique se remet a la sortie :
#
#     G_A = mu_0        * F_te / (2 j k_z_ref)
#     G_q = 1/(eps_ref) * F_q  / (2 j k_z_ref)
# ==========================================================================

def _v_plan_source(k_rho, omega, profil, mode):
    """La tension au plan source pour un courant unite : Z_bas // Z_haut.

    C'est la reponse du circuit equivalent, donc la fonction de Green spectrale
    du mode -- a la normalisation pres, que les appelants appliquent.
    """
    bas, haut, masse_bas, masse_haut = profil[0], profil[1], profil[2], profil[3]

    z_bas = _impedance_vue(k_rho, omega, bas, masse_bas, mode)
    z_haut = _impedance_vue(k_rho, omega, haut, masse_haut, mode)

    somme = z_bas + z_haut
    # Les deux impedances s'annulent quand le plan source EST le plan de masse.
    # Elles s'annulent AUSSI sur le pole de l'onde de surface, et c'est le
    # chantier suivant : ici on ne fait que ne pas diviser par zero.
    somme = np.where(np.abs(somme) < 1e-30, 1e-30, somme)
    return z_bas * z_haut / somme


def green_spectral_tm(k_rho, stackup, freq, profil=None):
    """Le noyau spectral de la seule ligne TM, normalise comme l'espace libre.

        F_tm = 2 omega eps_ref V_i^e / k_z_ref

    CE N'EST PAS le noyau du potentiel scalaire -- voir `green_spectral_q` et
    le commentaire au-dessus. On le garde parce qu'il a une limite
    quasi-statique qui s'ecrit a la main, donc parce qu'il est MESURABLE : les
    asymptotes du banc (2 er th(k_rho h)/(er + th), 2 eps1/(eps1+eps2)) sont
    les siennes, et ce sont aussi celles de F_q. Il sert d'etalon interieur.
    """
    if profil is None:
        profil = profil_spectral(stackup)
    eps_ref = profil[4]

    omega = 2 * np.pi * freq
    k_ref = omega * np.sqrt(MU_0 * EPSILON_0 * eps_ref)
    kz_ref = _kz(k_ref, k_rho)

    v_e = _v_plan_source(k_rho, omega, profil, 'tm')
    return 2.0 * omega * EPSILON_0 * eps_ref * v_e / kz_ref


def green_spectral_te(k_rho, stackup, freq, profil=None):
    """Le noyau du POTENTIEL VECTEUR : la ligne TE, et rien d'autre.

        G_A^xx = V_i^h/(j omega),  soit  F_te = 2 k_z_ref V_i^h / (omega mu_0)

    Sa limite en k_rho grand vaut 1 -- le potentiel vecteur de tres pres est
    mu_0/(4 pi r), quelle que soit la permittivite : le mu ne change pas d'une
    couche a l'autre. C'est ce qui rend l'ajustement du potentiel vecteur plus
    facile que celui du potentiel scalaire, et non l'inverse.
    """
    if profil is None:
        profil = profil_spectral(stackup)
    eps_ref = profil[4]

    omega = 2 * np.pi * freq
    k_ref = omega * np.sqrt(MU_0 * EPSILON_0 * eps_ref)
    kz_ref = _kz(k_ref, k_rho)

    v_h = _v_plan_source(k_rho, omega, profil, 'te')
    return 2.0 * kz_ref * v_h / (omega * MU_0)


def green_spectral_q(k_rho, stackup, freq, profil=None):
    """Le noyau du POTENTIEL SCALAIRE : la difference des deux lignes.

        G_q = omega (V_i^h - V_i^e)/(j k_rho^2)
        F_q = 2 k_z_ref eps_0 eps_ref omega (V_i^h - V_i^e) / k_rho^2

    LE ZERO EN k_rho = 0 EST UN VRAI ZERO, PAS UNE SINGULARITE. A incidence
    normale les deux lignes sont la MEME ligne : Z^e = k/(omega eps) = eta =
    omega mu/k = Z^h couche par couche, et les terminaisons ne distinguent pas
    les modes. Donc V^h - V^e s'annule en k_rho = 0, comme k_rho^2 puisque le
    noyau est pair, et le quotient reste fini. Mais 0/0 rend nan, et le chemin
    d'echantillonnage PROCHE demarre exactement la (k_z = k_ref, donc
    k_rho = 0). On evalue donc a un k_rho plancher, a un millieme de k_ref :
    l'erreur relative qui s'ensuit est de l'ordre de (10^-3)^2 = 10^-6, et la
    soustraction y garde une dizaine de chiffres significatifs.
    """
    if profil is None:
        profil = profil_spectral(stackup)
    eps_ref = profil[4]

    omega = 2 * np.pi * freq
    k_ref = omega * np.sqrt(MU_0 * EPSILON_0 * eps_ref)

    k_rho = np.asarray(k_rho, dtype=complex)
    plancher = 1e-3 * abs(k_ref)
    k_rho = np.where(np.abs(k_rho) < plancher, plancher, k_rho)

    kz_ref = _kz(k_ref, k_rho)

    v_h = _v_plan_source(k_rho, omega, profil, 'te')
    v_e = _v_plan_source(k_rho, omega, profil, 'tm')

    return (2.0 * kz_ref * EPSILON_0 * eps_ref * omega
            * (v_h - v_e) / (k_rho ** 2))


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


def _chemins_3_niveaux(stackup, freq, profil):
    """LES TROIS CHEMINS de la DCIM a trois niveaux.

    LE TROISIEME NIVEAU EST NOUVEAU (2026-08-28). Le 2e niveau (proche) ajuste
    le spectre en k_z du SUBSTRAT, mais le demi-espace d'AIR au-dessus de la
    carte a son PROPRE point de branchement en k_z = k_0. Le second terme
    d'onde de fuite -- celui qui rayonne dans l'air -- ne peut pas etre ajuste
    par des exponentielles en k_z du substrat.

    L'ecart etait mesurable : 9.6% sur le champ a 10 mm en champ lointain. Il
    disparait quand epsilon_r tend vers 1 (0.005% a 10 mm), ce qui confirme que
    c'est le contraste dielectrique qui fait rater l'ajustement.

    TROISIEME NIVEAU : un chemin parametre en k_z de l'AIR, autour du branchement
    k_z = k_0. Il ajuste ce que les deux premiers niveaux ont laisse dans cette
    region.

    Les trois chemins :
      1. LOINTAIN (k_z du substrat, purement imaginaire) : evanescent proche
      2. PROCHE (k_z du substrat, propagatif) : onde guidee et debut evanescent
      3. BRANCHEMENT AIR (k_z de l'air, autour de k_0) : terme de rayonnement
    """
    eps_ref = profil[4]
    omega = 2 * np.pi * freq
    k_ref = omega * np.sqrt(MU_0 * EPSILON_0 * eps_ref)
    k_0 = omega * np.sqrt(MU_0 * EPSILON_0)  # k dans l'air
    h_min, _ = _echelles(profil)

    t0_proche = DCIM_T0_MIN
    t0_loin = max(2.0 * t0_proche, DCIM_KRHO_H / (abs(k_ref) * h_min))

    n = DCIM_ECHANTILLONS

    # Chemin 1 : lointain (k_z du substrat, purement imaginaire)
    t_loin = np.linspace(t0_proche, t0_loin, n)
    kz_loin = -1j * k_ref * t_loin

    # Chemin 2 : proche (k_z du substrat, propagatif)
    t_proche = np.linspace(0.0, t0_proche, n)
    kz_proche = k_ref * (1.0 - t_proche / t0_proche - 1j * t_proche)

    # Chemin 3 : BRANCHEMENT AIR (k_z de l'air, autour de k_0)
    # Le branchement est en k_z = k_0 (dans l'air). On paramètre en k_z de l'air
    # avec un chemin qui contourne ce point de branchement.
    # Paramétrisation : k_z = k_0 * (1 - t/T1 - j t)  pour t dans [0, T1]
    # Quand t = 0, k_z = k_0 (point de branchement)
    # Quand t = T1, k_z = k_0 * (1 - T1/T1 - j T1) = -j k_0 * T1 (imaginaire pur)
    # T1 = 5 : le chemin va de k_z = k_0 (donc k_rho = 0) a k_z = -5j k_0, soit
    # k_rho jusqu'a 5,1 k_0 -- au-dela du k du substrat, qui vaut 2,09 k_0 sur
    # du FR-4. Le resultat est PLAT de T1 = 5 a T1 = 50 (mesure). En dessous il
    # ne l'est pas : a T1 = 2, GPOF rend une image d'amplitude 2,6.10^7 a une
    # profondeur de partie imaginaire -2,7 m -- une paire compensatrice, exacte
    # sur les echantillons et absurde ailleurs, qui fait diverger le champ. On
    # prend donc le plateau, pas son bord.
    T1 = 5.0  # portee du chemin en k_0 (adimensionnel)
    t_air = np.linspace(0.0, T1, n)
    kz_air = k_0 * (1.0 - t_air / T1 - 1j * t_air)

    def krho_substrat(kz):
        """k_rho en fonction de k_z, pour k du substrat."""
        return np.sqrt(k_ref ** 2 - kz ** 2 + 0j)

    def krho_air(kz):
        """k_rho en fonction de k_z, pour k de l'air."""
        return np.sqrt(k_0 ** 2 - kz ** 2 + 0j)

    k_rho_air = krho_air(kz_air)

    return {
        'k_ref': k_ref,
        'k_0': k_0,
        'loin': (kz_loin, krho_substrat(kz_loin), kz_loin[0],
                 kz_loin[1] - kz_loin[0]),
        'proche': (kz_proche, krho_substrat(kz_proche),
                   kz_proche[0], kz_proche[1] - kz_proche[0]),
        'air': (kz_air, k_rho_air, kz_air[0],
                kz_air[1] - kz_air[0]),
        # LE k_z DU SUBSTRAT AUX MEMES k_rho QUE LE CHEMIN AIR. Il faut les
        # deux : le chemin air ajuste ce que les deux premiers niveaux
        # LAISSENT, et les images des deux premiers niveaux se relisent en
        # k_z du SUBSTRAT, pas en k_z de l'air. Retrancher leur somme evaluee
        # en kz_air etait la seconde faute du 3e niveau -- moins visible que
        # la premiere, et du meme genre : deux bases confondues.
        'air_kz_substrat': _kz(k_ref, k_rho_air),
    }


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

    NOTE (2026-08-29) : cette fonction ne DELEGUE PAS a `_chemins_3_niveaux`.
    Elle l'a fait un temps, et c'etait une erreur de plomberie : le 3e niveau
    ne se contente pas d'ajouter un chemin, il change ce que `ajuster_noyau`
    fait des deux premiers. Le banc a mesure la difference -- voir
    l'avertissement en tete de `ajuster_noyau_3_niveaux`. Les deux niveaux
    VALIDES gardent donc leur propre code, et le troisieme est a cote.
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


# Les noyaux qu'on sait ajuster, et leur nom court.
#
#   'a' -> le potentiel VECTEUR, donc la ligne TE. C'est ce que le terme
#          inductif de la MPIE attend.
#   'q' -> le potentiel SCALAIRE, donc la difference des deux lignes. C'est ce
#          que le terme de charge attend.
#   'tm' -> la seule ligne TM. N'est le potentiel de personne ; on le garde
#          parce que ses asymptotes s'ecrivent a la main, donc parce qu'il est
#          l'etalon interieur du banc.
# ==========================================================================
# L'ONDE DE SURFACE, EXTRAITE AVANT L'AJUSTEMENT
# --------------------------------------------------------------------------
# CE QUI MANQUAIT, ET CE QUE CA COUTAIT. Un stratifie sur plan de masse guide
# une onde de surface TM0, et elle n'a pas de frequence de coupure : elle
# existe toujours. Dans le plan spectral c'est un POLE, et un pole ne
# s'approche pas par une somme finie d'exponentielles -- il decroit en
# 1/racine(rho) la ou les images decroissent en 1/rho. Le banc le mesurait et
# le bornait, sans le corriger : 0,5 a 0,7 % a 5 mm sur le potentiel scalaire,
# 7 a 10 % a 10 mm.
#
# POURQUOI LE POTENTIEL SCALAIRE SOUFFRE PLUS QUE LE VECTEUR, mesure aussi :
# 0,04 % contre 0,74 % a 5 mm. Deux raisons qui vont dans le meme sens. Le
# pole est celui de la ligne TM, et le potentiel vecteur ne la voit pas -- le
# TE0 d'une lame de 0,37 mm de FR-4 a sa coupure vers 110 GHz, donc pas de
# pole TE en bande. Et le noyau du potentiel scalaire porte un 1/k_rho^2, qui
# PONDERE la region propagative -- justement celle ou le pole vit.
#
# COMMENT ON L'EXTRAIT, en trois gestes :
#
#   1. LE LOCALISER. Le pole est la ou la mise en parallele explose, donc ou
#      Z_bas + Z_haut = 0 : c'est la relation de dispersion du mode guide, et
#      pour un microruban elle se lit k_z1 tan(k_z1 h) = er alpha_0, ce que
#      les manuels ecrivent pour la lame dielectrique sur plan de masse. Sans
#      pertes cette somme est purement imaginaire entre k_air et k_substrat,
#      et sa partie imaginaire y change de signe UNE fois : un balayage, un
#      Brent, puis deux pas de Newton complexes pour suivre le pole hors de
#      l'axe reel quand le tan delta l'y pousse.
#
#   2. EN SORTIR LE RESIDU. V = Z_bas Z_haut/(Z_bas + Z_haut) a un pole
#      SIMPLE, donc son residu vaut N(k_p)/D'(k_p) -- pas besoin de contour :
#      D est analytique la, parce qu'une couche d'epaisseur FINIE contribue au
#      cascade par une fonction PAIRE de son k_z (verifiable : la cascade est
#      invariante par k_z -> -k_z). Seuls les demi-espaces terminaux portent
#      un point de branchement, et il est ailleurs.
#
#   3. LE RETRANCHER SOUS UNE FORME DONT ON CONNAIT LA TRANSFORMEE. On ote du
#      spectre, non pas R/(k - k_p) qui n'est pas pair, mais
#
#          F_pole(k) = 2 R k_p k_z(k) / (k_z(k_p) (k^2 - k_p^2))
#
#      Le facteur k_z(k)/k_z(k_p) n'est pas decoratif : c'est lui qui fait que
#      la fonction RETRANCHEE A G_TILDE soit RATIONNELLE -- sans point de
#      branchement --, seule condition pour que le contour se ferme et donne
#      exactement, par le theoreme des residus,
#
#          G_onde(rho) = -(R k_p / (4 k_z(k_p))) H_0^(2)(k_p rho)
#
#      H_0^(2) et non H_0^(1), parce que la convention de ce module est
#      exp(-j k r) : l'onde qui sort, en deux dimensions, c'est H_0^(2).
#
# CE QUE CETTE EXTRACTION NE FAIT TOUJOURS PAS :
#   · elle vaut au PLAN SOURCE. Le residu porte le profil vertical du mode, et
#     on ne l'a pas : pour un dz non nul le terme de Hankel serait a corriger.
#     Sans consequence tant qu'il n'y a qu'un plan de signal -- ce qui est
#     l'autre limite connue du module ;
#   · elle ne cherche le pole qu'entre le plus rapide des demi-espaces
#     terminaux et le plus lent des milieux. Un empilage FERME des deux cotes
#     -- piste entre deux plans de masse -- n'a pas d'onde de surface au sens
#     ou on l'entend ici, mais des modes de cavite ; la fonction rend alors une
#     liste vide, et c'est correct pour la fonction de Green, pas pour une
#     resonance de plan.
# ==========================================================================

@dataclass
class PoleSurface:
    """Un pole d'onde de surface, et de quoi le rendre au domaine spatial."""
    k_p: complex        # le nombre d'onde longitudinal du mode guide
    residu: complex     # R_F : le residu du noyau NORMALISE, pas du potentiel
    kz_p: complex       # k_z du milieu de reference AU pole
    mode: str           # 'tm' ou 'te'


def _k_milieu(omega, eps_c):
    return omega * np.sqrt(MU_0 * EPSILON_0 * eps_c)


def _denominateur_modal(k_rho, omega, profil, mode):
    """(Z_bas + Z_haut, Z_bas * Z_haut) : le denominateur et le numerateur.

    Le pole de V = N/D est le zero de D, et son residu N/D'. Les deux sortent
    du meme calcul, alors on les rend ensemble.
    """
    z_bas = _impedance_vue(k_rho, omega, profil[0], profil[2], mode)
    z_haut = _impedance_vue(k_rho, omega, profil[1], profil[3], mode)
    return z_bas + z_haut, z_bas * z_haut


def _intervalle_pole(profil, omega):
    """Ou chercher : entre le plus RAPIDE dehors et le plus LENT dedans.

    Un mode guide est plus lent que le milieu qui le porte et plus rapide que
    ce qui l'entoure -- sinon il fuit. Ses bornes sont donc le plus grand k des
    demi-espaces TERMINAUX (l'air, en general) et le plus grand k de tous les
    milieux traverses. Quand les deux cotes butent sur du cuivre il n'y a pas
    de demi-espace, donc rien a guider au sens ouvert : on rend None.
    """
    bas, haut, masse_bas, masse_haut = profil[0], profil[1], profil[2], profil[3]

    terminaux = []
    if not masse_bas and bas:
        terminaux.append(bas[-1][1])
    if not masse_haut and haut:
        terminaux.append(haut[-1][1])
    if not terminaux:
        return None

    k_ouvert = max(abs(_k_milieu(omega, e)) for e in terminaux)
    k_dense = max(abs(_k_milieu(omega, e)) for _, e in (bas + haut))

    if k_dense <= k_ouvert * (1.0 + 1e-9):
        return None
    return k_ouvert, k_dense


def _newton_pole(depart, omega, profil, mode, iterations=12):
    """Affine un zero de D dans le plan COMPLEXE, a partir d'un depart reel.

    Le tan delta pousse le pole sous l'axe reel, et c'est la qu'il doit etre :
    une onde guidee qui s'amortit s'ecrit exp(-j k_p rho) avec Im(k_p) < 0.
    Newton en differences finies suffit -- D est analytique ici, c'est le
    point 2 du commentaire ci-dessus.
    """
    k = complex(depart)
    for _ in range(iterations):
        pas_h = 1e-7 * max(abs(k), 1.0)
        d0 = complex(_denominateur_modal(np.array([k]), omega, profil, mode)[0][0])
        d_p = complex(_denominateur_modal(np.array([k + pas_h]), omega, profil, mode)[0][0])
        d_m = complex(_denominateur_modal(np.array([k - pas_h]), omega, profil, mode)[0][0])
        derivee = (d_p - d_m) / (2.0 * pas_h)
        if abs(derivee) < 1e-300 or not np.isfinite(derivee):
            return None
        delta = d0 / derivee
        k = k - delta
        if abs(delta) < 1e-13 * abs(k):
            break
    if not np.isfinite(k):
        return None
    return k


def _poles_modaux(profil, omega, mode, n_grille=2001):
    """Les zeros de Z_bas + Z_haut, donc les modes guides du mode donne.

    Le balayage porte sur la PARTIE IMAGINAIRE : sans pertes les deux
    impedances sont purement imaginaires dans l'intervalle, et le changement
    de signe est net. Avec des pertes ordinaires -- un tan delta de quelques
    pour cent -- il l'est encore assez pour amorcer Newton, qui finit le
    travail dans le plan complexe.
    """
    bornes = _intervalle_pole(profil, omega)
    if bornes is None:
        return []
    a, b = bornes

    x = np.linspace(a * (1.0 + 1e-7), b * (1.0 - 1e-7), n_grille)
    d, _ = _denominateur_modal(x, omega, profil, mode)
    im = np.imag(d)
    fini = np.isfinite(im)
    if not np.all(fini):
        im = np.where(fini, im, 0.0)

    def imag_d(t):
        return float(np.imag(_denominateur_modal(
            np.array([t]), omega, profil, mode)[0][0]))

    poles = []
    for i in np.where(np.sign(im[:-1]) * np.sign(im[1:]) < 0)[0]:
        try:
            x0 = brentq(imag_d, x[i], x[i + 1], xtol=1e-12, rtol=1e-14)
        except (ValueError, RuntimeError):
            continue
        k_p = _newton_pole(x0, omega, profil, mode)
        if k_p is None:
            continue
        # Le pole doit etre reste dans son intervalle : un Newton qui s'echappe
        # a suivi autre chose, et sommer ce « autre chose » en Hankel ajouterait
        # une onde qui n'existe pas.
        if not (a * 0.99 < abs(k_p) < b * 1.01):
            logger.debug("  pole %s hors intervalle [%g ; %g], ecarte",
                         k_p, a, b)
            continue
        if np.imag(k_p) > 0:
            k_p = np.conj(k_p)      # la feuille physique est Im <= 0
        poles.append(complex(k_p))

    return poles


def _residu_v(k_p, omega, profil, mode):
    """Le residu de V = N/D au pole simple k_p : N(k_p)/D'(k_p)."""
    pas_h = 1e-7 * max(abs(k_p), 1.0)
    d_p, num = _denominateur_modal(np.array([k_p + pas_h]), omega, profil, mode)
    d_m, _ = _denominateur_modal(np.array([k_p - pas_h]), omega, profil, mode)
    _, num0 = _denominateur_modal(np.array([k_p]), omega, profil, mode)
    derivee = (complex(d_p[0]) - complex(d_m[0])) / (2.0 * pas_h)
    if abs(derivee) < 1e-300:
        return 0.0 + 0j
    return complex(num0[0]) / derivee


def poles_du_noyau(profil, omega, noyau, k_ref):
    """Les poles du NOYAU demande, residus deja mis a son echelle.

    Chaque noyau ne voit que les modes qui le composent :
      · 'tm' voit V^e, donc le pole TM ;
      · 'te'/'a' voient V^h, donc le pole TE -- il n'y en a pas en dessous de
        la coupure du TE0, et la recherche rend alors une liste vide toute
        seule, sans qu'on ait a le supposer ;
      · 'q' voit la DIFFERENCE V^h - V^e, donc les deux, avec le signe qui va.
    """
    eps_ref = profil[4]
    sortie = []

    for mode in ('tm', 'te'):
        if noyau == 'tm' and mode != 'tm':
            continue
        if noyau in ('te', 'a') and mode != 'te':
            continue

        for k_p in _poles_modaux(profil, omega, mode):
            r_v = _residu_v(k_p, omega, profil, mode)
            if r_v == 0:
                continue
            kz_p = complex(_kz(k_ref, np.array([k_p]))[0])
            if abs(kz_p) < 1e-30:
                continue

            if noyau == 'tm':
                r_f = 2.0 * omega * EPSILON_0 * eps_ref * r_v / kz_p
            elif noyau in ('te', 'a'):
                r_f = 2.0 * kz_p * r_v / (omega * MU_0)
            else:                                     # 'q'
                signe = 1.0 if mode == 'te' else -1.0
                r_f = (2.0 * kz_p * EPSILON_0 * eps_ref * omega
                       * signe * r_v / (k_p ** 2))

            sortie.append(PoleSurface(k_p=complex(k_p), residu=complex(r_f),
                                      kz_p=kz_p, mode=mode))

    return sortie


def _spectre_des_poles(k_rho, poles, k_ref):
    """La part de pole, ecrite pour que sa transformee soit un Hankel exact.

        F_pole(k) = somme  2 R k_p k_z(k) / (k_z(k_p) (k^2 - k_p^2))
    """
    k_rho = np.asarray(k_rho, dtype=complex)
    out = np.zeros(k_rho.shape, dtype=complex)
    if not poles:
        return out

    kz = _kz(k_ref, k_rho)
    for p in poles:
        ecart = k_rho ** 2 - p.k_p ** 2
        ecart = np.where(np.abs(ecart) < 1e-30, 1e-30, ecart)
        out = out + 2.0 * p.residu * p.k_p * kz / (p.kz_p * ecart)
    return out


def _somme_ondes_surface(poles, rho):
    """Les ondes de surface, en Hankel, dans les unites de `_somme_ondes`.

        G_onde(rho) = - somme  (R k_p / (4 k_z(k_p))) H_0^(2)(k_p rho)
    """
    rho = np.asarray(rho, dtype=float)
    out = np.zeros(rho.shape, dtype=complex)
    if not poles:
        return out

    # H_0^(2) diverge en logarithme a l'origine, et la part d'images porte le
    # 1/rho qui domine : le plancher ne sert qu'a ne pas rendre un inf.
    r = np.where(rho < 1e-12, 1e-12, rho)
    for p in poles:
        out = out - (p.residu * p.k_p / (4.0 * p.kz_p)) * hankel2(0, p.k_p * r)
    return out


NOYAUX_SPECTRAUX = {
    'a': lambda kr, st, f, pr: green_spectral_te(kr, st, f, pr),
    'te': lambda kr, st, f, pr: green_spectral_te(kr, st, f, pr),
    'q': lambda kr, st, f, pr: green_spectral_q(kr, st, f, pr),
    'tm': lambda kr, st, f, pr: green_spectral_tm(kr, st, f, pr),
}


@dataclass
class Ajustement:
    """UN noyau, entierement represente : des images ET des ondes de surface.

    LES DEUX SONT NECESSAIRES, et c'est le fond de l'affaire : une somme finie
    d'exponentielles ne peut pas rendre un pole. Les images portent la partie
    en 1/rho, les poles la partie en 1/racine(rho). Manipuler l'une sans
    l'autre, c'est ce que faisait la version precedente, et ca se payait a
    partir de quelques millimetres.
    """
    images: List[ComplexImage]
    poles: List[PoleSurface]
    k_ref: complex
    noyau: str

    # POURQUOI L'IMAGE A LA PROFONDEUR ZERO EST MISE A PART. C'est la SEULE
    # qui soit singuliere quand les deux points se rejoignent : les autres
    # sont a une profondeur complexe non nulle, donc leur 1/R reste borne dans
    # le plan des pistes. Un solveur qui integre sur des panneaux voisins doit
    # traiter celle-la analytiquement et les autres par quadrature ordinaire ;
    # les melanger, c'est demander a Gauss d'integrer un 1/R.
    #
    # SEUIL EN LONGUEUR ET NON EN RELATIF : un nanometre est en dessous de
    # toute geometrie de circuit imprime, et GPOF rend parfois une image a une
    # profondeur minuscule mais non nulle qu'il faut compter avec la directe.
    SEUIL_COINCIDENT = 1e-9

    @property
    def amplitude_directe(self):
        """L'amplitude de l'image confondue avec la source : celle qui pique."""
        return sum((im.amplitude for im in self.images
                    if abs(im.position) < self.SEUIL_COINCIDENT), 0.0 + 0j)

    @property
    def images_ecartees(self):
        """Toutes les autres : leur noyau est borne dans le plan source."""
        return [im for im in self.images
                if abs(im.position) >= self.SEUIL_COINCIDENT]

    def _tab(self, ecartees):
        """Les tableaux d'images, construits une fois et gardes.

        L'ajustement ne change plus une fois fait : ses tableaux non plus.
        `object.__setattr__` parce que le dataclass n'est pas figé mais que
        l'on tient a ce que ce cache reste un detail interne.
        """
        cle = '_tab_ecartees' if ecartees else '_tab_tout'
        tab = getattr(self, cle, None)
        if tab is None:
            source = self.images_ecartees if ecartees else self.images
            tab = _tableaux_images(source, self.k_ref)
            object.__setattr__(self, cle, tab)
        return tab

    def valeur_reste(self, rho, dz=0.0):
        """Tout sauf l'image confondue : borne, donc integrable par Gauss.

        L'onde de surface y figure. Elle porte un logarithme a l'origine, qui
        est integrable mais que Gauss rend mal ; son amplitude est de cinq
        ordres de grandeur sous celle de l'image directe sur les empilages
        vises, et c'est ce qui autorise a la laisser ici plutot que de lui
        faire son propre traitement. Sur un substrat epais a haute frequence,
        c'est une chose a revoir.
        """
        total = _somme_ondes_tableaux(*self._tab(True), rho, dz)
        if self.poles:
            total = total + _somme_ondes_surface(self.poles, rho)
        return total

    def valeur(self, rho, dz=0.0):
        """Le noyau NORMALISE au point (rho, dz) : images + ondes de surface.

        Le terme de Hankel vaut au plan source ; `dz` ne le corrige pas, faute
        du profil vertical du mode. Sans consequence tant qu'il n'y a qu'un
        plan de signal, ce qui est l'autre limite connue de ce module.
        """
        total = _somme_ondes_tableaux(*self._tab(False), rho, dz)
        if self.poles:
            total = total + _somme_ondes_surface(self.poles, rho)
        return total


def ajuster_noyau_3_niveaux(stackup, freq, noyau='q', num_images=10, z_src=None,
                             extraire_poles=True):
    """UN noyau spectral avec DCIM A TROIS NIVEAUX, pole compris.

    ================================================================
    REPARE ET MESURE (2026-08-30). Hors du chemin par defaut POUR SON
    COUT, et non plus parce qu'il serait faux.
    ================================================================

    CE QU'IL VISE. L'ecart de champ lointain -- 9,6 % a 10 mm, 41 % a 30 mm
    sur du FR-4 -- dont la cause est le SECOND point de branchement, celui du
    demi-espace d'air en k_0. Les deux premiers niveaux ajustent des
    exponentielles en k_z du SUBSTRAT : c'est la bonne base pour le
    branchement de reference, et ce n'en est aucune pour l'autre.

    LES DEUX FAUTES QUI LE RENDAIENT NUISIBLE, ET CE QUI LES A REMPLACEES.

      1. LES IMAGES DU 3e NIVEAU ETAIENT RESOMMEES AVEC LE MAUVAIS k. Elles
         etaient poussees dans la meme liste que les deux premiers niveaux, et
         `_somme_ondes` reconstruisait toute la liste avec k_ref. Une image
         ajustee contre exp(-j k_z^air d) et relue avec k_substrat ne
         represente rien : elle ajoutait du bruit COHERENT. C'est ce qui
         cassait l'invariant « a contraste dielectrique nul, l'ecart doit
         s'annuler » -- le seul qui designait la cause. `ComplexImage` porte
         desormais son `k_onde`, et `_somme_ondes` somme chaque groupe avec le
         sien.

      2. ET LE RESTE ETAIT PRIS DANS LA MAUVAISE BASE AUSSI. `reste_air` etait
         calcule en retranchant `somme(kz_air, images)` : les images des deux
         premiers niveaux, evaluees en k_z de l'AIR. Il faut les evaluer avec
         LEUR k_z, celui du substrat aux memes k_rho -- c'est
         `chemins['air_kz_substrat']`.

      3. ET LE GARDE-FOU DE PORTEE LES REJETAIT TOUTES. « Une image plus loin
         que la carte n'est pas physique » se mesure en epaisseurs de
         stratifie ; les images du branchement air representent l'onde
         LATERALE, dont l'echelle est la longueur d'onde dans l'air. Zero
         image posee, ecart inchange au dixieme de pour cent pres.

    CE QUE LA REPARATION MESURE, sur MICRO (0,37 mm de FR-4 a 1 GHz),
    images contre integrale de Sommerfeld :

        noyau      2 niveaux                 3 niveaux
        a       0,32 % / 7,74 %  a 10/30 mm  0,20 % / 4,95 %
        q       9,59 % / 40,8 %              6,19 % / 27,7 %
        tm      1,15 % / 15,2 %              0,65 % /  9,2 %

    et, ce qui compte autant, PLUS AUCUNE DEGRADATION : `banc_dcim` repasse de
    21 essais a 25 sur 25, l'ecart d'eps_eff de `banc_moteur` contre
    `ligne_mom` revient de 11,4 % a 0,49 % -- exactement celui du chemin a
    deux niveaux --, et l'invariant a contraste nul tient (0,148 % a 30 mm
    contre 0,149 %).

    POURQUOI IL RESTE HORS DU CHEMIN PAR DEFAUT. Le gain est un tiers d'erreur
    en champ LOINTAIN, la ou le noyau vaut six ordres de grandeur de moins
    qu'en champ proche : sans consequence pour une matrice d'impedance, et
    l'essai d'eps_eff le confirme -- meme chiffre a quatre decimales. Le cout,
    lui, est immediat : huit images de plus par noyau, donc pres du double
    d'ondes spheriques a sommer dans la boucle la plus chaude de l'assemblage.
    On l'allume le jour ou on demande un RAYONNEMENT, pas pour un parametre S.

    CE QU'IL NE FAIT TOUJOURS PAS. Il divise l'erreur lointaine par trois, il
    ne l'annule pas : l'onde laterale decroit en 1/rho^2 quand les images
    decroissent en 1/rho, et une somme finie d'exponentielles ne rend pas
    cette loi-la exactement. La sortir en forme fermee, comme on a sorti le
    pole d'onde de surface, serait le chantier suivant.

    Args:
        stackup: l'empilage, tel que `extract_stackup` le rend
        freq: la frequence
        noyau: 'a' (potentiel vecteur), 'q' (potentiel scalaire), 'tm'
        num_images: le nombre d'images ajustees PAR NIVEAU
        z_src: le plan des pistes
        extraire_poles: poles du mode guide (TM0)

    Returns:
        Un `Ajustement` dont les images du 3e niveau portent `k_onde = k_0`.
    """
    profil = profil_spectral(stackup, z_src)
    chemins = _chemins_3_niveaux(stackup, freq, profil)
    h_min, h_max = _echelles(profil)
    portee = 200.0 * h_max
    omega = 2 * np.pi * freq
    k_ref = chemins['k_ref']
    k_0 = chemins['k_0']

    if noyau not in NOYAUX_SPECTRAUX:
        raise ValueError("noyau inconnu : %r (attendu %s)"
                         % (noyau, sorted(NOYAUX_SPECTRAUX)))
    fonction = NOYAUX_SPECTRAUX[noyau]

    # 0. L'onde de surface d'abord
    poles = (poles_du_noyau(profil, omega, noyau, k_ref)
             if extraire_poles else [])

    def spectre_substrat(k_rho):
        """Le spectre en k_rho, debarrasse de ses poles."""
        brut = fonction(k_rho, stackup, freq, profil)
        return brut - _spectre_des_poles(k_rho, poles, k_ref)

    # 1. La constante evanescente. Elle appartient au groupe SUBSTRAT : sa
    #    transformee est une image d'amplitude c_inf a la profondeur zero, et
    #    c'est le k du milieu porteur qui la resomme.
    c_inf = complex(spectre_substrat(np.array([1e4 / h_min]))[0])
    if not np.isfinite(c_inf):
        c_inf = 0.0 + 0j

    # DEUX GROUPES, ET C'EST TOUT LE CHANTIER. `sub` est ajuste en k_z du
    # substrat, `air` en k_z de l'air. Chacun ne se somme QUE le long de sa
    # propre parametrisation, a l'ajustement comme a la relecture.
    sub = [(complex(c_inf), 0.0 + 0j)]
    air = []

    def somme(kz, paires):
        out = np.zeros_like(kz)
        for amp, d in paires:
            out = out + amp * np.exp(-1j * kz * d)
        return out

    def reste(f, kz_sub, kz_air):
        """Ce que les deux groupes laissent, chacun lu dans SA base."""
        r = f - somme(kz_sub, sub)
        if air:
            r = r - somme(kz_air, air)
        return r

    # 2. Niveau LOINTAIN (k_z du substrat, purement imaginaire)
    kz_loin, k_rho_loin, kz0_loin, dkz_loin = chemins['loin']
    f_loin = spectre_substrat(k_rho_loin)
    if not np.all(np.isfinite(f_loin)):
        logger.warning("Spectre non fini sur le chemin lointain")
    else:
        sub.extend(_images_dun_chemin(f_loin - somme(kz_loin, sub),
                                      kz0_loin, dkz_loin, num_images, portee))

    # 3. Niveau PROCHE (k_z du substrat, propagatif)
    kz_proche, k_rho_proche, kz0_proche, dkz_proche = chemins['proche']
    f_proche = spectre_substrat(k_rho_proche)
    if not np.all(np.isfinite(f_proche)):
        logger.warning("Spectre non fini sur le chemin proche")
    else:
        sub.extend(_images_dun_chemin(f_proche - somme(kz_proche, sub),
                                      kz0_proche, dkz_proche, num_images,
                                      portee))

    # 4. Niveau AIR (k_z de l'air, autour du branchement k_0)
    #
    #    LE RESTE SE CALCULE EN k_z DU SUBSTRAT, L'AJUSTEMENT EN k_z DE L'AIR.
    #    Les deux niveaux precedents ont pose des exponentielles en k_z du
    #    substrat : pour savoir ce qu'ils laissent aux k_rho du chemin air, il
    #    faut les evaluer avec LEUR k_z, celui du substrat aux memes k_rho.
    #    C'est `chemins['air_kz_substrat']`. Ce qui reste, lui, est ajuste
    #    contre exp(-j k_z^air d) et sera resomme avec k_0.
    #
    #    LA PORTEE DU GROUPE AIR N'EST PAS CELLE DU GROUPE SUBSTRAT, et c'est
    #    la seconde raison pour laquelle le 3e niveau ne servait a rien. Le
    #    garde-fou « une image plus loin que la carte n'est pas physique »
    #    se mesure en epaisseurs de stratifie -- 200 h_max, soit 74 mm sur du
    #    FR-4 de 0,37 mm. Or les images du branchement air representent l'onde
    #    LATERALE, dont l'echelle naturelle est la longueur d'onde DANS L'AIR :
    #    a 1 GHz les profondeurs ajustees valent de 0,1 a 0,5 m. Elles etaient
    #    donc TOUTES rejetees, et le 3e niveau ne posait pas une seule image.
    #    Mesure : zero image air, et l'ecart a 10 mm inchange a 9,586 %.
    kz_air, k_rho_air, kz0_air, dkz_air = chemins['air']
    kz_sub_sur_air = chemins['air_kz_substrat']
    portee_air = 10.0 * 2.0 * np.pi / abs(k_0)      # dix longueurs d'onde d'air
    f_air = spectre_substrat(k_rho_air)
    if not np.all(np.isfinite(f_air)):
        logger.warning("Spectre non fini sur le chemin air")
    else:
        air.extend(_images_dun_chemin(reste(f_air, kz_sub_sur_air, kz_air),
                                      kz0_air, dkz_air, num_images,
                                      portee_air))

    logger.debug("  noyau %s (3 niveaux) : %d images substrat, %d images air, "
                 "%d pole(s)", noyau, len(sub), len(air), len(poles))
    images = [ComplexImage(amplitude=a, position=d, layer_index=0,
                           k_onde=None) for a, d in sub]
    images += [ComplexImage(amplitude=a, position=d, layer_index=0,
                            k_onde=complex(k_0)) for a, d in air]
    return Ajustement(
        images=images,
        poles=poles,
        k_ref=complex(k_ref),
        noyau=noyau,
    )


def ajuster_noyau(stackup, freq, noyau='q', num_images=10, z_src=None,
                  extraire_poles=True, trois_niveaux=False):
    """UN noyau spectral, mis en images complexes par GPOF, pole compris.

    QUATRE (ou CINQ) MORCEAUX, ET CHACUN A SA RAISON :

      0. L'ONDE DE SURFACE, SORTIE AVANT TOUT LE RESTE. C'est un pole, et un
         pole ne s'ajuste pas par des exponentielles -- voir le grand
         commentaire au-dessus de `PoleSurface`. On le localise, on en prend le
         residu, on le retranche du spectre, et on le rendra en Hankel.
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
      4. (NOUVEAU) LE NIVEAU AIR, qui ajuste le branchement air/substrat pour
         le terme de rayonnement en champ lointain.

    Args:
        stackup: l'empilage, tel que `extract_stackup` le rend
        freq: la frequence. L'ajustement en depend, il faut le refaire a
              chaque point de la bande, et `main.py` le fait
        noyau: 'a' (potentiel vecteur), 'q' (potentiel scalaire), 'tm'
        num_images: le nombre d'images ajustees PAR NIVEAU
        z_src: le plan des pistes. Deduit de l'empilage quand il manque
        extraire_poles: mettre a False n'a qu'un usage, MESURER ce que
              l'extraction apporte. Le banc s'en sert ; un calcul, jamais.
        trois_niveaux: FAUX PAR DEFAUT -- POUR SON COUT, plus parce qu'il
              serait faux. Repare le 2026-08-30 : chaque groupe d'images
              porte son nombre d'onde, le reste est pris dans la bonne base,
              et la portee du groupe air se mesure en longueurs d'onde
              d'air. Il divise par trois l'erreur de champ LOINTAIN et ne
              change rien au champ proche ni a eps_eff (0,49 % dans les deux
              cas, a quatre decimales). Il coute huit images de plus par
              noyau dans la boucle la plus chaude de l'assemblage : on
              l'allume pour un calcul de rayonnement, pas pour un parametre
              S. Voir `ajuster_noyau_3_niveaux`.

    Returns:
        Un `Ajustement`. La `position` d'une image est une PROFONDEUR COMPLEXE
        mesuree depuis le plan source, et non une altitude absolue : c'est ce
        que l'identite de Sommerfeld produit.
    """
    if trois_niveaux:
        return ajuster_noyau_3_niveaux(stackup, freq, noyau, num_images,
                                       z_src, extraire_poles)

    # --- VERSION A DEUX NIVEAUX (compatibilite) ---
    profil = profil_spectral(stackup, z_src)
    chemins = _chemins(stackup, freq, profil)
    h_min, h_max = _echelles(profil)
    portee = 200.0 * h_max
    omega = 2 * np.pi * freq
    k_ref = chemins['k_ref']

    if noyau not in NOYAUX_SPECTRAUX:
        raise ValueError("noyau inconnu : %r (attendu %s)"
                         % (noyau, sorted(NOYAUX_SPECTRAUX)))
    fonction = NOYAUX_SPECTRAUX[noyau]

    # 0. L'onde de surface d'abord : tout ce qui suit ajuste ce qu'elle laisse.
    poles = (poles_du_noyau(profil, omega, noyau, k_ref)
             if extraire_poles else [])

    def spectre(k_rho):
        brut = fonction(k_rho, stackup, freq, profil)
        return brut - _spectre_des_poles(k_rho, poles, k_ref)

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

    logger.debug("  noyau %s : %d images complexes et %d onde(s) de surface",
                 noyau, len(images), len(poles))
    return Ajustement(
        images=[ComplexImage(amplitude=a, position=d, layer_index=0)
                for a, d in images],
        poles=poles,
        k_ref=complex(k_ref),
        noyau=noyau,
    )


def apply_dcim(stackup, num_images=10, freq=1e9, z_src=None, noyau='tm'):
    """Les IMAGES SEULES d'un noyau -- sans son onde de surface.

    Cette enveloppe existe pour ce qui veut juger l'ajustement exponentiel tout
    seul : le banc s'en sert pour verifier que GPOF retrouve exactement deux
    images sur le cas soluble, et l'onde de surface n'a rien a faire dans ce
    decompte-la. Pour un calcul, c'est `ajuster_noyau` ou `noyaux_green` qu'il
    faut appeler -- eux rendent la fonction ENTIERE.
    """
    return ajuster_noyau(stackup, freq, noyau, num_images, z_src).images


def _tableaux_images(images, k_ref):
    """Les images en TROIS TABLEAUX : amplitudes, profondeurs, nombres d'onde.

    POURQUOI CETTE FORME. `_somme_ondes` etait la moitie du temps
    d'assemblage -- 10 s sur 20 pour 269 fonctions de base --, et pas parce que
    le calcul est lourd : parce qu'il etait fait image par image, en une
    poignee d'operations numpy sur des tableaux de quarante-neuf nombres. Le
    cout est celui des APPELS, pas des flottants. Range ainsi, la somme entiere
    devient trois operations sur un tableau de (points x images), quelle que
    soit la longueur de la liste.

    RIEN N'EST APPROCHE ICI : c'est la meme somme, ecrite autrement.
    """
    n = len(images)
    amp = np.empty(n, dtype=complex)
    pos = np.empty(n, dtype=complex)
    k = np.empty(n, dtype=complex)
    for i, im in enumerate(images):
        amp[i] = im.amplitude
        pos[i] = im.position
        k[i] = k_ref if im.k_onde is None else im.k_onde
    return amp, pos, k


def _somme_ondes_tableaux(amp, pos, k, rho, dz=0.0):
    """La somme des ondes spheriques, vectorisee sur les points ET les images."""
    rho = np.asarray(rho, dtype=float)
    if amp.size == 0:
        return np.zeros(rho.shape, dtype=complex)

    forme = rho.shape
    r_plat = rho.reshape(-1)[:, None]
    d = np.asarray(pos)[None, :] + np.asarray(dz).reshape(-1)[:, None]

    r = np.sqrt(r_plat ** 2 + d ** 2 + 0j)
    # La racine principale peut sortir du bon demi-plan sur un d complexe ;
    # une distance de partie reelle negative ferait CROITRE l'onde.
    r = np.where(np.real(r) < 0, -r, r)
    r = np.where(np.abs(r) < 1e-15, 1e-15, r)

    total = np.sum(amp[None, :] * np.exp(-1j * k[None, :] * r)
                   / (4 * np.pi * r), axis=1)
    return total.reshape(forme)


def _somme_ondes(images, k_ref, rho, dz=0.0):
    """La somme des ondes spheriques des images, VECTORISEE sur rho.

    `rho` peut etre un scalaire ou un tableau de n'importe quelle forme ; le
    resultat a la meme. C'est ce qui permet a `mom_engine` d'evaluer une
    quadrature 7x7 en un appel au lieu de quarante-neuf : l'assemblage de la
    matrice Z passe son temps ici, et une boucle Python par point de Gauss
    coutait deux ordres de grandeur.

    CHAQUE GROUPE SOMME AVEC SON PROPRE NOMBRE D'ONDE. Une image ajustee le
    long d'un chemin parametre en k_z du substrat se relit avec k_substrat ;
    une image du niveau AIR se relit avec k_0. Voir `ComplexImage`.

    CETTE ENVELOPPE REFAIT LES TABLEAUX A CHAQUE APPEL : elle est la pour ce
    qui appelle rarement -- les bancs, `green_spatial`. Le chemin chaud passe
    par `Ajustement.valeur`, qui les garde.
    """
    amp, pos, k = _tableaux_images(images, k_ref)
    return _somme_ondes_tableaux(amp, pos, k, rho, dz)


@dataclass
class NoyauxGreen:
    """LES DEUX fonctions de Green du plan des pistes, prêtes a l'emploi.

    C'est le seul objet que `mom_engine` doit connaitre. Il porte les deux jeux
    d'images -- un par potentiel -- ET les constantes qui vont avec : le nombre
    d'onde de reference, qui est celui dans lequel les images ont ete ajustees,
    et la permittivite de reference, qui normalise le potentiel scalaire.

    POURQUOI ELLES SORTENT DEJA MISES A L'ECHELLE (`g_a` porte son mu_0, `g_q`
    son 1/eps). Parce que sinon l'appelant doit choisir un eps, et il l'a
    choisi de travers : `get_effective_epsilon` moyennait les epaisseurs de
    TOUT l'empilage, alors que l'ajustement a normalise par le SEUL milieu
    porteur -- le stratifie sous la piste. Lire un ajustement dans une autre
    unite que la sienne, c'est se tromper de racine(eps) sur la vitesse.
    """
    ajust_a: Ajustement               # potentiel vecteur, ligne TE
    ajust_q: Ajustement               # potentiel scalaire, difference TE - TM
    k_ref: complex                    # nombre d'onde du milieu porteur
    eps_ref: complex                  # sa permittivite relative
    z_src: float                      # le plan des pistes, en metres
    freq: float

    # LE COURANT VERTICAL VOYAGE AVEC LES DEUX AUTRES, ou pas du tout. `None`
    # veut dire « pas de conducteur vertical dans ce maillage », ce qui est le
    # cas de toute carte sans via de port : le moteur ne demande alors jamais
    # G_A^zz, et le chemin valide par les essais ne change pas d'un bit.
    vertical: Optional['NoyauxVerticaux'] = None

    def pour(self, couche_m=None, couche_n=None):
        """Le noyau qui vaut entre ces deux couches : lui-meme.

        LA MEME METHODE QUE `NoyauxParCouche.pour`, pour que `mom_engine` ne
        distingue jamais les deux cas. Un empilage a une seule couche de
        signal traverse alors exactement le meme code qu'un empilage a
        plusieurs, et le chemin valide par les 38 essais ne se dedouble pas.
        """
        return self

    def g_a(self, rho, dz=0.0):
        """G_A^xx, en henry par metre : A_x = G_A * J_x. Porte son mu_0."""
        return MU_0 * self.ajust_a.valeur(rho, dz)

    def g_q(self, rho, dz=0.0):
        """G_q : Phi = G_q * q. Porte son 1/(eps_0 eps_ref)."""
        return self.ajust_q.valeur(rho, dz) / (EPSILON_0 * self.eps_ref)

    # --- la meme chose, coupee en deux, pour qui doit desingulariser ---------
    #
    # LE MOTEUR EN A BESOIN, ET PAS QU'UN PEU. Les panneaux qui se touchent
    # portent l'essentiel de la matrice d'impedance, et leur integrale a un
    # 1/R dedans : une quadrature de Gauss, meme a sept points, ne l'integre
    # pas -- elle l'echantillonne. Le decoupage ci-dessous laisse le moteur
    # traiter la part singuliere par un changement de variable polaire et le
    # reste par Gauss, sans que ni l'un ni l'autre ait a savoir combien
    # d'images il y a.

    @property
    def amplitude_directe_a(self):
        """Le coefficient du 1/(4 pi R) singulier du potentiel vecteur."""
        return MU_0 * self.ajust_a.amplitude_directe

    @property
    def amplitude_directe_q(self):
        """Le coefficient du 1/(4 pi R) singulier du potentiel scalaire."""
        return self.ajust_q.amplitude_directe / (EPSILON_0 * self.eps_ref)

    def g_a_reste(self, rho, dz=0.0):
        """G_A sans son image confondue : borne, donc bon pour Gauss."""
        return MU_0 * self.ajust_a.valeur_reste(rho, dz)

    def g_q_reste(self, rho, dz=0.0):
        """G_q sans son image confondue : borne, donc bon pour Gauss."""
        return self.ajust_q.valeur_reste(rho, dz) / (EPSILON_0 * self.eps_ref)


def noyaux_green(stackup, freq, num_images=10, z_src=None,
                 trois_niveaux=False, avec_vertical=False):
    """Les deux ajustements, faits ensemble, et ce qu'il faut pour les lire.

    DEUX AJUSTEMENTS ET NON UN, parce que ce sont deux fonctions differentes --
    voir le grand commentaire au-dessus de `green_spectral_te`. Ils partagent
    le profil, les chemins d'echantillonnage et le nombre d'onde ; ils ne
    partagent ni leurs poles ni leurs profondeurs.

    A refaire a chaque point de frequence : les images en dependent.

    Args:
        trois_niveaux: FAUX PAR DEFAUT, pour son cout. Le 3e niveau DCIM
              couvre le branchement air ; repare le 2026-08-30, il divise
              par trois l'erreur de champ lointain sans rien changer au
              champ proche. A allumer pour un calcul de rayonnement.
    """
    profil = profil_spectral(stackup, z_src)
    eps_ref = profil[4]
    z_plan = profil[5]

    omega = 2 * np.pi * freq
    k_ref = omega * np.sqrt(MU_0 * EPSILON_0 * eps_ref)

    # LE NOYAU VERTICAL N'EST CALCULE QUE SI ON LE DEMANDE, et c'est un choix
    # de cout : il vaut deux ajustements GPOF de plus par frequence, pour un
    # maillage qui, neuf fois sur dix, n'a pas un seul triangle vertical.
    vertical = (noyaux_verticaux(stackup, freq, num_images)
                if avec_vertical else None)

    return NoyauxGreen(
        ajust_a=ajuster_noyau(stackup, freq, 'a', num_images, z_plan,
                             trois_niveaux=trois_niveaux),
        ajust_q=ajuster_noyau(stackup, freq, 'q', num_images, z_plan,
                             trois_niveaux=trois_niveaux),
        k_ref=complex(k_ref),
        eps_ref=complex(eps_ref),
        z_src=float(z_plan),
        freq=float(freq),
        vertical=vertical,
    )






# ==========================================================================
# DEUX PLANS DE SIGNAL : LA TLGF ENTRE z ET z', ET NON UN EMPILAGE INVENTE
# --------------------------------------------------------------------------
# CE QU'IL Y AVAIT, ET POURQUOI CA NE POUVAIT PAS MARCHER. `profil_spectral_
# multiple` fabriquait un « profil croise » en recollant le bas de la couche i
# et le haut de la couche j, puis `profils_noyaux_multiples` l'IGNORAIT et
# rappelait `noyaux_green(stackup, freq, n, z_src=z_i)`. Le noyau croise etait
# donc, au bit pres, celui de la couche i seule -- verifiable en une ligne, et
# verifie. Deux couches de signal etaient calculees comme une.
#
# ET LE RECOLLAGE LUI-MEME N'ETAIT PAS LA BONNE IDEE. La fonction de Green
# entre deux plans n'est pas celle d'un empilage different : c'est la MEME
# ligne de transmission, avec la source a z' et l'observation a z. Ce qui
# change n'est pas le circuit, c'est l'endroit ou on lit la tension.
#
# CE QUE CA DONNE, ET C'EST EXACT :
#
#     V_i(z, z') = [Z_bas(z') // Z_haut(z')] x T(z' -> z)
#
# ou T est le rapport des tensions le long du reseau qui va de z' a z. Le
# premier facteur est deja ce que `_v_plan_source` calcule ; le second se
# cascade couche par couche comme le reste du module.
#
# LA RECIPROCITE EN EST LA PREUVE, et le banc la mesure : V_i(z,z') doit valoir
# V_i(z',z) alors que les deux chemins de calcul n'ont RIEN en commun -- l'un
# part du bas, l'autre du haut. Une egalite a la precision machine entre deux
# calculs aussi differents ne s'obtient pas par accident.
#
# CE QUE LE SPECTRE CROISE A DE PLUS FACILE, ET C'EST HEUREUX : a k_rho grand
# il DECROIT comme exp(-k_rho |z - z'|) au lieu de tendre vers une constante.
# Il n'y a donc ni terme non decroissant a sortir a la main, ni image
# confondue -- la plus proche est a la profondeur |z - z'|, qui vaut au moins
# une epaisseur de dielectrique. Le moteur n'a aucune singularite a traiter sur
# ces paires-la, et `moments_triangles` le sait deja : il les voit non
# coplanaires et passe par Gauss.
# ==========================================================================

def _transferts_ligne(k_rho, omega, couches, z_charge, mode='tm'):
    """(T_V, T_I, Z_vue) a travers `couches`, chargees par `z_charge`.

    `couches` est la liste des milieux traverses du plan PRES vers le plan
    LOIN. T_V et T_I sont les rapports V(loin)/V(pres) et I(loin)/I(pres) ;
    `Z_vue` est l'impedance vue depuis le plan PRES en regardant vers le loin.

    LES DEUX RAPPORTS NE SONT PAS LE MEME, et c'est ce qui separe un courant
    vertical d'un courant horizontal. Sur une section chargee par Gamma :

        T_V = e (1 + Gamma)/(1 + Gamma e^2)     T_I = e (1 - Gamma)/(1 - Gamma e^2)

    avec e = exp(-j k_z d). Un court-circuit (Gamma = -1) annule T_V et double
    T_I : la tension s'y annule, le courant y est maximal. C'est exactement ce
    qui fait qu'un dipole VERTICAL a une image de MEME signe dans un plan de
    masse, quand un dipole horizontal en a une opposee.

    ECRIT EN COEFFICIENTS DE REFLEXION plutot qu'en tangentes, pour la meme
    raison que `_impedance_vue` : |e| <= 1 par construction de `_kz`, donc rien
    ne deborde sur les echantillons evanescents profonds -- ceux-la memes ou
    l'ajustement a besoin de precision.
    """
    def z_car(eps_c):
        return _impedance_caracteristique(k_rho, omega, eps_c, mode)

    un = np.ones_like(np.asarray(k_rho, dtype=complex))
    t_v = un.copy()
    t_i = un.copy()
    z_l = np.asarray(z_charge, dtype=complex) * un

    for epaisseur, eps_c in reversed(couches):
        z_i, kz = z_car(eps_c)
        somme = z_l + z_i
        somme = np.where(np.abs(somme) < 1e-30, 1e-30, somme)
        gamma = (z_l - z_i) / somme

        e = np.exp(-1j * kz * epaisseur)
        u = e * e                                  # |u| <= 1

        den_v = 1.0 + gamma * u
        den_v = np.where(np.abs(den_v) < 1e-30, 1e-30, den_v)
        den_i = 1.0 - gamma * u
        den_i = np.where(np.abs(den_i) < 1e-30, 1e-30, den_i)

        t_v = t_v * e * (1.0 + gamma) / den_v
        t_i = t_i * e * (1.0 - gamma) / den_i
        z_l = z_i * den_v / den_i

    return t_v, t_i, z_l


def _transfert_tension(k_rho, omega, couches, z_charge, mode='tm'):
    """Le rapport V(loin)/V(pres) a travers `couches`, chargees par `z_charge`.

    `couches` est la liste des milieux traverses du plan SOURCE vers le plan
    d'OBSERVATION, du plus proche de la source au plus proche de
    l'observation ; `z_charge` est l'impedance vue depuis le plan
    d'observation en continuant de s'eloigner de la source.

    Rend (T, z_vue) : le rapport de tension, et l'impedance vue depuis le plan
    SOURCE en regardant vers l'observation -- qui est exactement ce que
    `_impedance_vue` rendrait sur la pile complete, et c'est ce que le banc
    verifie.

    ECRIT EN COEFFICIENTS DE REFLEXION plutot qu'en tangentes, pour la meme
    raison que `_impedance_vue` : u = exp(-2j k_z d) a un module au plus egal
    a un par construction de `_kz`, donc rien ne deborde sur les echantillons
    evanescents profonds -- ceux-la memes ou l'ajustement a besoin de
    precision.
    """
    t_v, _, z_l = _transferts_ligne(k_rho, omega, couches, z_charge, mode)
    return t_v, z_l


def _couches_entre(stackup, i_bas, i_haut):
    """Les dielectriques strictement entre deux couches de cuivre, de bas en haut.

    LE CUIVRE DE SIGNAL EST TRANSPARENT ICI, comme partout dans ce module : il
    n'a pas d'epaisseur electrique, c'est le maillage qui le represente. Un
    PLAN de masse entre les deux, en revanche, coupe tout : deux plans de
    signal separes par un plan de masse ne se voient pas, et la fonction rend
    None pour le dire.
    """
    couches = stackup['layers']
    plans = set(indices_plans_masse(stackup))

    def eps_c(c):
        return c.get('epsilon_r', 1.0) * (1 - 1j * c.get('tan_delta', 0.0))

    entre = []
    for k in range(i_bas + 1, i_haut):
        c = couches[k]
        if c.get('type') == 'copper':
            if k in plans:
                return None                # un plan de masse ferme le passage
            continue
        e = c.get('thickness', 0.0)
        if e > 0:
            entre.append((e, eps_c(c)))
    return entre


def _v_entre_plans(k_rho, omega, profil_bas, profil_haut, entre, mode):
    """La tension au plan HAUT pour un courant unite au plan BAS.

    Le circuit est celui du plan bas -- son Z_bas propre, et vers le haut la
    pile `entre` fermee par le Z_haut du plan haut. On lit la tension au plan
    bas, puis on la transporte.
    """
    z_bas = _impedance_vue(k_rho, omega, profil_bas[0], profil_bas[2], mode)
    z_charge = _impedance_vue(k_rho, omega, profil_haut[1], profil_haut[3], mode)

    t, z_vers_haut = _transfert_tension(k_rho, omega, entre, z_charge, mode)

    somme = z_bas + z_vers_haut
    somme = np.where(np.abs(somme) < 1e-30, 1e-30, somme)
    v_source = z_bas * z_vers_haut / somme
    return v_source * t


def profil_croise(stackup, i_bas, i_haut):
    """Ce qu'il faut pour le spectre croise entre deux couches de signal.

    Rend (profil_bas, profil_haut, entre, eps_ref, z_bas, z_haut), ou None si
    un plan de masse separe les deux couches -- auquel cas elles ne se voient
    pas, et le noyau croise est nul.

    LE MILIEU DE REFERENCE est celui qui porte le champ ENTRE les deux plans :
    c'est lui qui fixe le nombre d'onde des images croisees, donc la vitesse a
    laquelle le couplage voyage d'une couche a l'autre.
    """
    couches = stackup['layers']
    if i_bas > i_haut:
        i_bas, i_haut = i_haut, i_bas

    entre = _couches_entre(stackup, i_bas, i_haut)
    if entre is None:
        return None

    z_bas = couches[i_bas].get('z_top', 0.0)
    z_haut = couches[i_haut].get('z_top', 0.0)

    p_bas = profil_spectral(stackup, z_bas)
    p_haut = profil_spectral(stackup, z_haut)

    eps_ref = entre[0][1] if entre else p_bas[4]
    return p_bas, p_haut, entre, eps_ref, z_bas, z_haut


def green_croise_te(k_rho, croise, freq):
    """Le noyau croise du POTENTIEL VECTEUR, normalise comme les autres.

        F_te = 2 k_z_ref V_i^h(z, z') / (omega mu_0)

    MEME NORMALISATION QUE `green_spectral_te`, et il le faut : c'est ce qui
    permet a `ajuster_noyau` de servir les deux sans savoir lequel il ajuste,
    et a `_somme_ondes` de rendre des ondes spheriques dans la meme unite.
    """
    p_bas, p_haut, entre, eps_ref, _, _ = croise
    omega = 2 * np.pi * freq
    k_ref = omega * np.sqrt(MU_0 * EPSILON_0 * eps_ref)
    kz_ref = _kz(k_ref, k_rho)

    v_h = _v_entre_plans(k_rho, omega, p_bas, p_haut, entre, 'te')
    return 2.0 * kz_ref * v_h / (omega * MU_0)


def green_croise_q(k_rho, croise, freq):
    """Le noyau croise du POTENTIEL SCALAIRE : la difference des deux lignes.

        F_q = 2 k_z_ref eps_0 eps_ref omega (V_i^h - V_i^e) / k_rho^2

    Le zero en k_rho = 0 est le meme vrai zero qu'au plan source -- a
    incidence normale les deux lignes sont la meme ligne, terminaisons et
    transferts compris --, et il se traite de la meme facon : un plancher a un
    millieme de k_ref.
    """
    p_bas, p_haut, entre, eps_ref, _, _ = croise
    omega = 2 * np.pi * freq
    k_ref = omega * np.sqrt(MU_0 * EPSILON_0 * eps_ref)

    k_rho = np.asarray(k_rho, dtype=complex)
    plancher = 1e-3 * abs(k_ref)
    k_rho = np.where(np.abs(k_rho) < plancher, plancher, k_rho)
    kz_ref = _kz(k_ref, k_rho)

    v_h = _v_entre_plans(k_rho, omega, p_bas, p_haut, entre, 'te')
    v_e = _v_entre_plans(k_rho, omega, p_bas, p_haut, entre, 'tm')
    return (2.0 * kz_ref * EPSILON_0 * eps_ref * omega
            * (v_h - v_e) / (k_rho ** 2))


def _ajuster_croise(croise, freq, noyau, num_images):
    """L'ajustement DCIM d'un noyau croise.

    UN SEUL NIVEAU SUFFIT, ET C'EST LA DIFFERENCE AVEC LE PLAN SOURCE. Le
    spectre croise decroit comme exp(-k_rho |z - z'|) : il n'a ni terme non
    decroissant a sortir a la main -- pas de c_inf --, ni image confondue a
    desingulariser. Ce qui rendait la DCIM du plan source delicate, c'est
    justement ce qui n'existe pas ici. On garde les deux chemins de Chow parce
    qu'ils ne coutent rien et couvrent les deux regimes ; on ne garde pas
    l'echafaudage qui allait avec.

    LE POLE D'ONDE DE SURFACE N'EST PAS EXTRAIT ICI, et c'est une reserve a
    ecrire : le residu porte le profil VERTICAL du mode, que ce module n'a
    pas. Sur un empilage a deux couches de signal entre deux plans de masse --
    le cas vise -- il n'y a pas d'onde de surface au sens ou on l'entend :
    l'empilage est ferme des deux cotes. Sur un microruban a deux couches de
    signal, il y en a une, et le couplage croise la manquera.
    """
    p_bas, p_haut, entre, eps_ref, z_bas, z_haut = croise
    omega = 2 * np.pi * freq
    k_ref = omega * np.sqrt(MU_0 * EPSILON_0 * eps_ref)

    ecart_z = abs(z_haut - z_bas)
    portee = 200.0 * max(ecart_z, 1e-9)

    # Les chemins de Chow, batis sur l'ecart vertical -- la seule echelle
    # geometrique du probleme croise.
    t0_proche = DCIM_T0_MIN
    t0_loin = max(2.0 * t0_proche, DCIM_KRHO_H / (abs(k_ref) * max(ecart_z, 1e-9)))
    n = DCIM_ECHANTILLONS

    t_loin = np.linspace(t0_proche, t0_loin, n)
    kz_loin = -1j * k_ref * t_loin
    t_proche = np.linspace(0.0, t0_proche, n)
    kz_proche = k_ref * (1.0 - t_proche / t0_proche - 1j * t_proche)

    fonction = green_croise_te if noyau == 'a' else green_croise_q

    images = []

    def somme(kz):
        out = np.zeros_like(kz)
        for amp, d in images:
            out = out + amp * np.exp(-1j * kz * d)
        return out

    for kz, kz0, dkz in ((kz_loin, kz_loin[0], kz_loin[1] - kz_loin[0]),
                         (kz_proche, kz_proche[0],
                          kz_proche[1] - kz_proche[0])):
        k_rho = np.sqrt(k_ref ** 2 - kz ** 2 + 0j)
        f = fonction(k_rho, croise, freq)
        if not np.all(np.isfinite(f)):
            logger.warning("Spectre croise non fini sur un chemin")
            continue
        images.extend(_images_dun_chemin(f - somme(kz), kz0, dkz,
                                         num_images, portee))

    return Ajustement(
        images=[ComplexImage(amplitude=a, position=d, layer_index=0)
                for a, d in images],
        poles=[],
        k_ref=complex(k_ref),
        noyau=noyau,
    )


def noyaux_croises(stackup, freq, i_bas, i_haut, num_images=10):
    """Les deux noyaux de Green ENTRE deux couches de signal.

    Rend un `NoyauxGreen` ordinaire -- meme interface, memes unites --, de
    sorte que `mom_engine` n'a pas a savoir s'il tient un noyau propre ou un
    noyau croise. Rend None quand un plan de masse separe les deux couches :
    elles ne se voient pas, et le bloc croise de la matrice est nul.
    """
    croise = profil_croise(stackup, i_bas, i_haut)
    if croise is None:
        return None

    _, _, _, eps_ref, z_bas, _ = croise
    omega = 2 * np.pi * freq
    k_ref = omega * np.sqrt(MU_0 * EPSILON_0 * eps_ref)

    return NoyauxGreen(
        ajust_a=_ajuster_croise(croise, freq, 'a', num_images),
        ajust_q=_ajuster_croise(croise, freq, 'q', num_images),
        k_ref=complex(k_ref),
        eps_ref=complex(eps_ref),
        z_src=float(z_bas),
        freq=float(freq),
    )


class NoyauxParCouche:
    """LE JEU DE NOYAUX D'UN EMPILAGE A PLUSIEURS COUCHES DE SIGNAL.

    UN NOYAU PROPRE PAR COUCHE, UN NOYAU CROISE PAR PAIRE. `mom_engine` demande
    `pour(couche_m, couche_n)` et ne sait pas laquelle des deux sortes il
    recoit -- c'est voulu : le jour ou le croise change de methode, le moteur
    n'a pas a le savoir.

    `NoyauxGreen` porte la MEME methode `pour`, qui se rend elle-meme. Un
    empilage a une seule couche de signal n'a donc rien de special a faire, et
    le chemin a une couche -- celui que les 38 essais mesurent -- traverse
    exactement le meme code qu'avant.
    """

    def __init__(self, propres, croises, freq):
        self.propres = dict(propres)
        self.croises = dict(croises)
        self.freq = float(freq)
        self._unique = (list(self.propres.values())[0]
                        if len(self.propres) == 1 else None)

    def pour(self, couche_m, couche_n):
        """Le noyau qui vaut entre ces deux couches. None si elles ne se voient pas."""
        if self._unique is not None:
            return self._unique
        if couche_m == couche_n:
            return self.propres.get(couche_m)
        cle = (min(couche_m, couche_n), max(couche_m, couche_n))
        return self.croises.get(cle)

    @property
    def k_ref(self):
        """Le k du premier noyau propre : ce que la trace veut voir."""
        premier = next(iter(self.propres.values()))
        return premier.k_ref

    def __len__(self):
        return len(self.propres)


def noyaux_multicouches(stackup, freq, num_images=10, trois_niveaux=False,
                        avec_vertical=False):
    """Tous les noyaux d'un empilage, ranges par couche de signal.

    C'EST CE QUE `mom_engine` DOIT APPELER quand l'empilage porte plus d'une
    couche de signal, et c'est la plomberie qui manquait : les profils
    existaient, personne ne les demandait.

    UNE SEULE COUCHE DE SIGNAL REND UN JEU A UN ELEMENT, dont `pour()` rend
    toujours le meme noyau. C'est le cas courant, et il ne coute rien de plus
    qu'avant.
    """
    couches = stackup.get('layers', [])
    plans = set(indices_plans_masse(stackup))
    signaux = [i for i, c in enumerate(couches)
               if c.get('type') == 'copper' and i not in plans]

    if not signaux:
        # Tout est plan : on garde le repli de `profil_spectral`, qui prend le
        # cuivre le plus haut comme plan source.
        return NoyauxParCouche(
            {0: noyaux_green(stackup, freq, num_images,
                             trois_niveaux=trois_niveaux,
                             avec_vertical=avec_vertical)}, {}, freq)

    propres = {}
    for i in signaux:
        z_src = couches[i].get('z_top', 0.0)
        propres[i] = noyaux_green(stackup, freq, num_images, z_src,
                                  trois_niveaux=trois_niveaux,
                                  avec_vertical=avec_vertical)

    croises = {}
    for a in range(len(signaux)):
        for b in range(a + 1, len(signaux)):
            i, j = signaux[a], signaux[b]
            nc = noyaux_croises(stackup, freq, i, j, num_images)
            if nc is not None:
                croises[(i, j)] = nc
            else:
                logger.debug("  couches %d et %d separees par un plan de masse "
                             ": couplage nul", i, j)

    logger.info("  %d couche(s) de signal, %d noyau(x) croise(s)",
                len(propres), len(croises))
    return NoyauxParCouche(propres, croises, freq)


# ==========================================================================
# LE COURANT VERTICAL : G_A^zz, ET D'OU ELLE SORT
# --------------------------------------------------------------------------
# CE QUI MANQUAIT. Tout ce qui precede ne connait que des courants HORIZONTAUX :
# G_A^xx suit la ligne TE, G_q la difference des deux lignes. Un port de
# microruban, lui, injecte un courant VERTICAL -- entre la piste et le plan de
# masse --, et pour ce courant-la il faut la composante zz du dyade.
#
# LA DERIVATION, EN TROIS PAS, ET ELLE TIENT EN UNE LIGNE.
#
#   1. UN COURANT VERTICAL EST UNE SOURCE DE TENSION EN SERIE sur la ligne TM,
#      la ou un courant horizontal est une source de COURANT en parallele.
#      C'est toute la difference, et elle change le circuit de la mise en
#      PARALLELE -- Z_bas // Z_haut, ce que rend `_v_plan_source` -- a la mise
#      en SERIE : I = 1/(Z_bas + Z_haut). Les deux circuits sont duaux, et
#      confondre les deux est l'erreur qui ne se voit pas.
#
#   2. LES DEUX EQUATIONS DE LA LIGNE donnent alors, au plan source,
#
#          E_t = V_v^e v_s u^     avec  v_s = -(k_rho/(omega eps')) J_z
#          E_z = -(k_rho/(omega eps)) I_v^e v_s - J_z delta/(j omega eps)
#
#   3. ON IDENTIFIE AVEC E = -j omega A - grad Phi en gardant LE MEME potentiel
#      scalaire que pour les courants horizontaux -- c'est la definition de la
#      formulation C de Michalski. Le terme transverse donne
#      d(Phi)/dz' = -V_v^e/eps', le terme vertical se reduit alors, et il ne
#      reste que
#
#          G_A^zz(z, z') = mu_0 I_v^e(z, z') / (j omega eps_1)
#
#      ou eps_1 est la permittivite ABSOLUE du milieu qui porte les deux
#      points. Le k_rho a disparu.
#
# LES DEUX VERIFICATIONS QUI LA FIXENT, et le banc les porte :
#
#   · EN MILIEU HOMOGENE, I_v^e = omega eps/(2 k_z) et la formule rend
#     mu_0/(2 j k_z) -- exactement G_A^xx, ce qui doit etre : dans un milieu
#     homogene le dyade est isotrope ;
#   · AU-DESSUS D'UN PLAN DE MASSE, elle doit rendre l'image PLUS. Un dipole
#     electrique VERTICAL se reflechit dans un conducteur parfait avec le MEME
#     signe, quand un dipole horizontal change de signe. C'est le seul essai
#     qui distingue un signe faux d'un signe juste, et il tombe a 3.10^-16.
#
# LA COORDONNEE EST UNE PROFONDEUR SOUS LA PISTE, ET PAS UNE ALTITUDE. C'est
# une precaution, pas une preference. La pile GEOMETRIQUE et la pile
# ELECTRIQUE ne coincident pas : le cuivre a une epaisseur geometrique et
# AUCUNE epaisseur electrique -- le 2,5D le suppose infiniment mince, et tout
# ce module le suppose avec lui. Sur du FR-4 de 0,37 mm avec 35 um de cuivre,
# les deux hauteurs different de 9 %, et un via calcule dans la mauvaise s'en
# trouve faux d'autant. On compte donc en profondeur zeta SOUS le plan des
# pistes, dans la pile que `profil_spectral` a deja etablie, et la question ne
# se pose plus.
#
# CE QUE CE MODULE NE FAIT PAS. La formulation C porte, en toute rigueur, un
# TERME CORRECTIF G^C qui couple le courant vertical au courant horizontal par
# le potentiel VECTEUR. Il est neglige ici, si bien qu'un via et une piste ne
# se parlent que par le potentiel SCALAIRE -- leurs charges. Ce qui manque est
# l'inductance du COIN, la ou le courant tourne. C'est exactement ce que le
# de-embarquement par deux longueurs retire, et c'est pourquoi on peut vivre
# avec ; ce n'est pas une raison pour ne pas l'ecrire.
# ==========================================================================

def _scinder_pile(pile, zeta):
    """Coupe une pile de milieux a la profondeur `zeta`.

    Rend (traverse, reste) : ce qu'on a franchi pour descendre jusqu'a zeta,
    dans l'ordre du parcours, et ce qui subsiste au-dela. Le milieu coupe en
    deux figure dans les deux, avec sa part.
    """
    traverse = []
    reste = []
    parcouru = 0.0
    for i, (e, eps) in enumerate(pile):
        if e <= 0:                                  # le demi-espace terminal
            reste.append((e, eps))
            continue
        if parcouru + e <= zeta + 1e-18:
            traverse.append((e, eps))
            parcouru += e
            continue
        if parcouru < zeta:
            haut = zeta - parcouru
            traverse.append((haut, eps))
            reste.append((e - haut, eps))
            parcouru = zeta
        else:
            reste.append((e, eps))
    return traverse, reste


def _piles_a_profondeur(profil, zeta):
    """Les deux piles vues depuis la profondeur zeta SOUS le plan des pistes.

    Rend (vers_le_bas, masse_bas, vers_le_haut, masse_haut, eps_local).
    """
    bas, haut, masse_bas, masse_haut = profil[0], profil[1], profil[2], profil[3]
    traverse, reste = _scinder_pile(bas, zeta)

    eps_local = (traverse[-1][1] if traverse
                 else (bas[0][1] if bas else 1.0 + 0j))

    # Vers le haut : on remonte ce qu'on a traverse, puis la pile du dessus.
    montant = [(e, eps) for e, eps in reversed(traverse) if e > 0]
    return reste, masse_bas, montant + list(haut), masse_haut, eps_local


def _courant_source_serie(k_rho, omega, profil, zeta_src, zeta_obs, mode='tm'):
    """I_v : le courant a zeta_obs pour une source de TENSION en serie a zeta_src.

    LA MISE EN SERIE, et non la mise en parallele. Une source de tension
    inseree dans la ligne voit les deux impedances EN SERIE : I = 1/(Z_a + Z_b).
    `_v_plan_source` fait l'autre, parce qu'un courant horizontal est une
    source de COURANT en parallele.

    I_v EST SYMETRIQUE en ses deux arguments -- c'est la reciprocite --, et on
    s'en sert : on range toujours la source au-dessous.
    """
    if zeta_obs > zeta_src:
        zeta_src, zeta_obs = zeta_obs, zeta_src     # source la plus profonde

    bas_s, masse_bas, _, _, _ = _piles_a_profondeur(profil, zeta_src)
    _, _, haut_o, masse_haut, _ = _piles_a_profondeur(profil, zeta_obs)

    z_dessous = _impedance_vue(k_rho, omega, bas_s, masse_bas, mode)
    z_charge = _impedance_vue(k_rho, omega, haut_o, masse_haut, mode)

    # Ce qui separe les deux profondeurs, dans l'ordre du parcours vers le haut.
    entre_bas, _ = _scinder_pile(profil[0], zeta_src)
    entre_haut, _ = _scinder_pile(profil[0], zeta_obs)
    epaisseur = zeta_src - zeta_obs
    entre = []
    if epaisseur > 0:
        reste_a_prendre = epaisseur
        for e, eps in reversed(entre_bas):
            if reste_a_prendre <= 1e-18:
                break
            part = min(e, reste_a_prendre)
            if part > 0:
                entre.append((part, eps))
            reste_a_prendre -= part

    _, t_i, z_dessus = _transferts_ligne(k_rho, omega, entre, z_charge, mode)

    somme = z_dessous + z_dessus
    somme = np.where(np.abs(somme) < 1e-30, 1e-30, somme)
    return t_i / somme


def green_spectral_zz(k_rho, stackup, freq, zeta_src, zeta_obs, profil=None):
    """Le noyau du POTENTIEL VECTEUR VERTICAL, normalise comme les autres.

        G_A^zz = mu_0 I_v^e / (j omega eps_1)     F_zz = 2 k_z_ref I_v^e/(omega eps_1)

    `zeta_src` et `zeta_obs` sont des PROFONDEURS sous le plan des pistes.

    LA FORMULE VAUT POUR DEUX POINTS DANS LE MEME MILIEU : la derivation fait
    apparaitre eps(z) eps(z') et k_z(z)^2, qui ne se recombinent en un seul
    eps_1 que si les deux points partagent leur permittivite. C'est le cas du
    fut d'un via, qui vit entier dans le dielectrique entre le plan et la
    piste, et c'est le seul cas que ce module pretend traiter.
    """
    if profil is None:
        profil = profil_spectral(stackup)

    _, _, _, _, eps_ref = _piles_a_profondeur(profil, zeta_src)

    omega = 2 * np.pi * freq
    k_ref = omega * np.sqrt(MU_0 * EPSILON_0 * eps_ref)
    kz_ref = _kz(k_ref, k_rho)

    i_v = _courant_source_serie(k_rho, omega, profil, zeta_src, zeta_obs, 'tm')
    return 2.0 * kz_ref * i_v / (omega * EPSILON_0 * eps_ref)


# ==========================================================================
# LE FUT DU VIA : QUATRE FAMILLES DE RAYONS, DEUX AMPLITUDES A AJUSTER
# --------------------------------------------------------------------------
# LE PROBLEME QUE CA RESOUT. Les noyaux horizontaux vivent sur UN plan source :
# leurs images sont ajustees une fois et relues partout. Un via porte du
# courant a TOUTES les profondeurs entre la piste et le plan de masse, et
# G_A^zz depend des DEUX profondeurs, pas de leur seul ecart. Une DCIM par
# couple (zeta, zeta') serait hors de prix.
#
# LA FAUSSE BONNE IDEE, ET CE QU'ELLE A COUTE DE MESURER. On peut ajuster le
# noyau une fois a mi-hauteur et le relire ailleurs par un DECALAGE de
# profondeur. Ca marcherait si la correction etait un seul rebond. Elle ne
# l'est pas : mesure, le « reste » vaut 1,4 quand le noyau entier vaut 0,52 --
# il n'est pas une correction, il est l'essentiel --, et le decalage rend des
# ecarts de 3 a 60 % contre l'integrale de Sommerfeld.
#
# LA STRUCTURE EXACTE, ET ELLE EST FINIE. Dans une lame homogene entre un plan
# de masse et une interface, la reponse est une serie de rebonds qui se somme
# en forme fermee. Avec Gamma_g = +1 (le plan, pour un courant vertical) et
# Gamma_t la reflexion en COURANT du haut :
#
#     F_zz = [ e^(-j kz D) + e^(-j kz Sg) + Gt e^(-j kz St) + Gt e^(-j kz (2h-D)) ]
#            / (1 - Gt e^(-2j kz h))
#
#     D  = |zeta - zeta'|        l'ecart des deux points
#     Sg = 2h - zeta - zeta'     par le plan de masse
#     St = zeta + zeta'          par le haut
#
# QUATRE CHEMINS, ET DEUX AMPLITUDES SEULEMENT : M = 1/(1 - Gt P) porte les
# deux premiers, O = Gt/(1 - Gt P) les deux derniers. Ni M ni O ne depend des
# profondeurs -- toute la geometrie est dans les quatre exponentielles.
#
# D'OU LE PROCEDE : on ajuste M et O par DCIM UNE fois par frequence, et on
# lit n'importe quel couple (zeta, zeta') en posant les memes images a quatre
# profondeurs decalees. Ce n'est plus une approximation de rebond : c'est la
# forme exacte, et le seul ecart qui subsiste est celui de l'ajustement de
# deux fonctions LISSES de k_rho.
# ==========================================================================

@dataclass
class NoyauxVerticaux:
    """G_A^zz le long d'un fut de via, pret a l'emploi par le moteur.

    Les images de `amplitude_m` servent les deux chemins directs -- celui qui
    va droit d'un point a l'autre, et celui qui passe par le plan de masse --,
    celles de `amplitude_o` les deux qui rebondissent sur le haut.
    """
    amplitude_m: List[ComplexImage]     # ajustement de 1/(1 - Gt P)
    amplitude_o: List[ComplexImage]     # ajustement de Gt/(1 - Gt P)
    k_ref: complex                      # le k du milieu qui porte le via
    hauteur: float                      # l'epaisseur ELECTRIQUE piste <-> plan
    freq: float

    def _chemins_geometriques(self, zeta, zeta_prime):
        """Les quatre profondeurs de rayon, et quel groupe d'images les porte."""
        h = self.hauteur
        d = np.abs(np.asarray(zeta) - np.asarray(zeta_prime))
        sg = 2.0 * h - np.asarray(zeta) - np.asarray(zeta_prime)
        st = np.asarray(zeta) + np.asarray(zeta_prime)
        return d, sg, st, 2.0 * h - d

    def _somme_famille(self, images, rho, decalage):
        if not images:
            return np.zeros(np.shape(np.asarray(rho) * 1.0 + decalage * 0.0),
                            dtype=complex)
        return _somme_ondes(images, self.k_ref, rho, dz=decalage)

    def g_a_zz(self, rho, zeta, zeta_prime):
        """G_A^zz entier, en henry par metre. Porte son mu_0."""
        d, sg, st, dt = self._chemins_geometriques(zeta, zeta_prime)
        total = (self._somme_famille(self.amplitude_m, rho, d)
                 + self._somme_famille(self.amplitude_m, rho, sg)
                 + self._somme_famille(self.amplitude_o, rho, st)
                 + self._somme_famille(self.amplitude_o, rho, dt))
        return MU_0 * total

    def g_a_zz_reste(self, rho, zeta, zeta_prime):
        """Tout sauf l'image confondue du chemin direct.

        SEULE CELLE-LA PIQUE. Le chemin direct porte une image a la profondeur
        D = |zeta - zeta'|, qui s'annule quand les deux points sont a la meme
        hauteur ; c'est la seule qui devienne singuliere a l'interieur du fut.
        Les trois autres chemins passent par une reflexion, donc par une
        profondeur au moins egale a... zero aussi, quand les deux points sont
        SUR le plan de masse ou SUR la piste. Le banc le dit : sur l'anneau du
        bas, la source et son image sont adjacentes, et Gauss les integre a
        quelques pour cent. C'est dans le port, donc dans ce que le
        de-embarquement retire.
        """
        d, sg, st, dt = self._chemins_geometriques(zeta, zeta_prime)
        ecartees = [im for im in self.amplitude_m
                    if abs(im.position) >= Ajustement.SEUIL_COINCIDENT]
        total = (self._somme_famille(ecartees, rho, d)
                 + self._somme_famille(self.amplitude_m, rho, sg)
                 + self._somme_famille(self.amplitude_o, rho, st)
                 + self._somme_famille(self.amplitude_o, rho, dt))
        return MU_0 * total

    @property
    def amplitude_directe_zz(self):
        """Le coefficient du 1/(4 pi R) singulier du chemin direct.

        C'est la marque du potentiel vecteur : de tres pres, A vaut
        mu_0 J/(4 pi R) quel que soit le milieu, parce que le mu ne change pas
        d'une couche a l'autre. L'ajustement de M doit donc rendre une image
        d'amplitude 1 a la profondeur zero, et c'est ce qu'on lit ici plutot
        que de le poser : si l'ajustement s'en ecarte, la desingularisation
        doit s'en ecarter avec lui, sans quoi les deux moities ne se recollent
        pas.
        """
        return MU_0 * sum((im.amplitude for im in self.amplitude_m
                           if abs(im.position) < Ajustement.SEUIL_COINCIDENT),
                          0.0 + 0j)


def _reflexion_haut(k_rho, omega, profil, eps_1):
    """Gamma_t : la reflexion en COURANT au sommet de la lame.

    EN COURANT, ET NON EN TENSION -- c'est le signe qui fait tout. Une source
    de tension en serie lance des ondes de COURANT, dont le coefficient de
    reflexion est l'oppose de celui des ondes de tension. Sur un plan de masse
    (Z = 0) il vaut +1 : d'ou l'image de MEME signe du dipole vertical, quand
    le dipole horizontal en a une opposee.

    Sa limite en k_rho grand vaut (eps_haut - eps_1)/(eps_haut + eps_1), soit
    -0,628 pour du FR-4 sous de l'air : ce n'est pas une petite correction, et
    c'est pourquoi on ne peut pas la traiter comme un reste.
    """
    z_1, _ = _impedance_caracteristique(k_rho, omega, eps_1, 'tm')
    z_haut = _impedance_vue(k_rho, omega, profil[1], profil[3], 'tm')
    somme = z_1 + z_haut
    somme = np.where(np.abs(somme) < 1e-30, 1e-30, somme)
    return (z_1 - z_haut) / somme


def noyaux_verticaux(stackup, freq, num_images=8):
    """Le noyau du courant vertical pour un via entre le plan de masse et la piste.

    LA LAME DOIT ETRE HOMOGENE, et la fonction le verifie. La decomposition en
    quatre familles de rayons suppose UN milieu entre le plan de masse et la
    piste ; deux dielectriques empiles y ajouteraient une interface, donc deux
    familles de plus. C'est le cas du microruban ordinaire, et on refuse
    plutot que d'approcher en silence.
    """
    profil = profil_spectral(stackup)
    bas, masse_bas = profil[0], profil[2]

    if not masse_bas:
        raise ValueError(
            "noyaux_verticaux : la pile sous la piste ne bute sur aucun plan "
            "de masse. Un port vertical relie la piste au plan ; sans plan il "
            "n'y a pas de port.")

    reels = [(e, eps) for e, eps in bas if e > 0]
    if not reels:
        raise ValueError("noyaux_verticaux : aucun dielectrique sous la piste")
    if len(reels) > 1:
        eps_uns = set(np.round(np.asarray([eps for _, eps in reels]), 9))
        if len(eps_uns) > 1:
            raise NotImplementedError(
                "noyaux_verticaux : %d dielectriques DIFFERENTS entre la piste "
                "et le plan de masse. La decomposition en quatre familles de "
                "rayons suppose une lame homogene ; il faudrait deux familles "
                "de plus par interface." % len(reels))

    hauteur = float(sum(e for e, _ in reels))
    eps_1 = reels[0][1]

    omega = 2 * np.pi * freq
    k_ref = omega * np.sqrt(MU_0 * EPSILON_0 * eps_1)

    # LES CHEMINS DE CHOW, batis sur l'epaisseur de la lame -- la seule echelle
    # geometrique que M et O connaissent.
    t0_proche = DCIM_T0_MIN
    t0_loin = max(2.0 * t0_proche, DCIM_KRHO_H / (abs(k_ref) * hauteur))
    n = DCIM_ECHANTILLONS
    t_loin = np.linspace(t0_proche, t0_loin, n)
    kz_loin = -1j * k_ref * t_loin
    t_proche = np.linspace(0.0, t0_proche, n)
    kz_proche = k_ref * (1.0 - t_proche / t0_proche - 1j * t_proche)
    portee = 200.0 * hauteur

    def amplitudes(kz):
        k_rho = np.sqrt(k_ref ** 2 - kz ** 2 + 0j)
        gamma = _reflexion_haut(k_rho, omega, profil, eps_1)
        p = np.exp(-2j * kz * hauteur)
        den = 1.0 - gamma * p
        den = np.where(np.abs(den) < 1e-30, 1e-30, den)
        return 1.0 / den, gamma / den

    # LES DEUX CONSTANTES EVANESCENTES, SORTIES A LA MAIN. En k_rho grand,
    # P s'annule : M tend vers 1 et O vers (eps_haut - eps_1)/(eps_haut + eps_1).
    # Une somme d'exponentielles ne rend pas une constante -- c'est la meme
    # raison qu'au c_inf de `ajuster_noyau`, et le meme remede : une image a la
    # profondeur zero, dont la transformee EST cette constante.
    kz_tres_loin = -1j * k_ref * (1e4 / (abs(k_ref) * hauteur))
    m_inf, o_inf = amplitudes(np.array([kz_tres_loin]))
    m_inf = complex(m_inf[0]) if np.isfinite(m_inf[0]) else 1.0 + 0j
    o_inf = complex(o_inf[0]) if np.isfinite(o_inf[0]) else 0.0 + 0j

    images_m = [(m_inf, 0.0 + 0j)]
    images_o = [(o_inf, 0.0 + 0j)]

    def somme(kz, paires):
        out = np.zeros_like(kz)
        for amp, d in paires:
            out = out + amp * np.exp(-1j * kz * d)
        return out

    for kz in (kz_loin, kz_proche):
        kz0, dkz = kz[0], kz[1] - kz[0]
        m, o = amplitudes(kz)
        if not (np.all(np.isfinite(m)) and np.all(np.isfinite(o))):
            logger.warning("Amplitudes verticales non finies sur un chemin")
            continue
        images_m.extend(_images_dun_chemin(m - somme(kz, images_m),
                                           kz0, dkz, num_images, portee))
        images_o.extend(_images_dun_chemin(o - somme(kz, images_o),
                                           kz0, dkz, num_images, portee))

    logger.debug("  noyau vertical : lame de %.4f mm, %d + %d images",
                 hauteur * 1e3, len(images_m), len(images_o))

    return NoyauxVerticaux(
        amplitude_m=[ComplexImage(amplitude=a, position=d, layer_index=0)
                     for a, d in images_m],
        amplitude_o=[ComplexImage(amplitude=a, position=d, layer_index=0)
                     for a, d in images_o],
        k_ref=complex(k_ref),
        hauteur=hauteur,
        freq=float(freq),
    )


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


# ==========================================================================
# CE QUI A ETE RETIRE D'ICI, ET POURQUOI ON NE L'A PAS SEULEMENT LAISSE
# --------------------------------------------------------------------------
# La reecriture du noyau a rendu orphelines huit fonctions. Deux raisons de les
# supprimer plutot que de les garder « au cas ou » :
#
#   · `green_spectral` et `calculate_reflection_coefs` implementaient L'ANCIEN
#     MODELE -- une serie de reflexions de Fresnel a incidence normale, avec un
#     coefficient de transmission « 2 n1/(n1+n2) » applique couche par couche.
#     C'est faux, et c'etait appelable. Du code faux qu'on peut appeler finit
#     par etre appele ;
#   · `green_2d_layered` rendait UN scalaire pour « la » fonction de Green du
#     milieu stratifie. Il n'y en a pas une : le potentiel vecteur suit la
#     ligne TE, le potentiel scalaire la difference des deux. Cette signature
#     ETAIT le defaut n° 1, et la garder c'etait garder la porte par laquelle
#     il revient. Ce qui la remplace est `NoyauxGreen`, qui rend les deux, avec
#     leurs constantes.
#
# Les six autres -- `find_layer_at_z`, `calculate_effective_reflection`,
# `effective_epsilon`, `self_interaction_term`, `dyadic_green_tensor` -- ne
# servaient qu'a celles-la, ou a personne.
#
# `green_spatial` est conserve : le banc s'en sert pour juger un jeu d'images
# tout seul, sans son onde de surface, et c'est un usage legitime.
# ==========================================================================
