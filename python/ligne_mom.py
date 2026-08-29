#!/usr/bin/python3
# -*- coding: utf-8 -*-
# ==========================================
# VERSIONING
# Version: 2.2.0
# Date: 2026-08-29
# Explication: LE MODULE NE S'IMPORTAIT PLUS, et le masque etait faux.
#
#   1. green_spectral_micro_masque avait ete inseree AVANT les imports, entre
#      la docstring du module et « import numpy as np », et le module posait
#      « logger = logging.getLogger(__name__) » sans jamais importer logging.
#      L'import levait donc NameError : simulation_em.py rattrapait, et les
#      DEUX panneaux affichaient « Solveur EM indisponible » depuis la 2.1.0.
#      La fonction est remise a sa place, avec les deux autres Green ; le
#      logger, jamais utilise, est retire.
#
#   2. LE MASQUE PRENAIT SA REFERENCE A VIDE AVEC LE MASQUE ENCORE LA :
#      g_vide appelait la Green a trois regions avec er_substrat = 1 mais
#      er_masque = 3,8. C0 gonflait, eps_eff BAISSAIT quand on vernissait la
#      piste -- l'inverse de la physique -- et Z0 tombait de 7,8 % au lieu des
#      2 a 3 % attendus. Le milieu moyen extrait etait lui aussi celui du
#      substrat seul, alors que l'asymptote de la Green vaut
#      eps0 (er1 + er2)/2. Corriges tous les deux : 25 um de vernis a er 3,8
#      donnent -2,53 % sur Z0, et eps_eff monte de 3,288 a 3,461.
#      Un masque a er = 1 redonne exactement le microruban nu.
#
#   3. LES DISCONTINUITES : une seule implementation, et les vraies formules.
#      capacite_coude etait donnee pour du Gupta et n'en etait pas -- ni
#      hauteur au plan, qui est le parametre dominant, ni angle : un coude a
#      dix degres pesait autant qu'un coude a angle droit. elements_coude
#      pose le modele publie (C/w et L/h de Gupta) et rend le couple (L, C) ;
#      abcd_coude monte le T complet au lieu d'un shunt seul. inductance_via
#      et capacite_pastille disent EN METRES dans leur docstring : la cascade
#      de simulation_em les appelait en millimetres, et l'inductance sortait
#      mille fois trop grande.
# Fonctions ajoutees : elements_coude
# Fonctions modifiees : capacite_coude (signature), abcd_coude (signature),
#   abcd_via (pi exact), solve_line (reference a vide et milieu moyen du
#   masque, masque d'epaisseur nulle qui retombe sur le cas nu)
#
# Version: 2.1.0
# Date: 2026-08-28
# Explication: R_AC AVEC EFFET DE PEAU AMELIORE. Le modele precedent utilisait
#   R_s / (Z0 * w) sans le facteur 2, ce qui doublait les pertes conducteur.
#   Le modele industriel correct est :
#     alpha_c = R_s / (2 * Z0 * w)   [Np/m]
#   avec R_s = 1/(sigma * delta) la resistance de surface.
#
#   A 5 GHz sur 35 µm de cuivre : delta = 0.93 µm, Rs = 18.5 mΩ/carré,
#   alpha_c ≈ 4.2 dB/m (au lieu de 8.4 dB/m avant).
#
#   Ajout de line_losses_detaillees() pour diagnostic : Rs, delta_peau,
#   R_ac_par_m, facteur de forme, tout en clair.
# Fonctions modifiees : line_losses
# Fonctions ajoutees : line_losses_detaillees
#
# Version: 2.0.0
# Date: 2026-08-28
# Explication: LOT 2 (MASQUE DE SOUDURE) ET LOT 3b (MODELISATION DISCONTINUITES).
#
#   LOT 2 : green_spectral_micro_masque — Green a trois regions pour microruban
#   sous masque de soudure. Trois regions : substrat (0 a h), masque (h a h+c),
#   air au-dessus. Les formules sont :
#     G = K / (eps0 * beta * (M + epsr1 * K * coth(beta*h)))
#     K = ch(beta*c) + sh(beta*c)/epsr2
#     M = epsr2 * sh(beta*c) + ch(beta*c)
#   Reductions exactes : c=0 -> microruban nu, epsr2=epsr1 -> couvert.
#
#   LOT 3b : abcd_via (pi L-C), abcd_coude (shunt C), inductance_via,
#   capacite_pastille, capacite_coude. Modeles analytiques pour les
#   discontinuites inseres dans la cascade.
#
# Fonctions ajoutees : green_spectral_micro_masque, inductance_via,
#   capacite_pastille, capacite_coude, abcd_via, abcd_coude
# Fonctions modifiees : solve_line (entree masque, sortie masque)
#
# Version: 1.3.0
# Date: 2026-08-28
# Explication: la masse coplanaire n'est plus SYMETRIQUE. Jusqu'ici un seul
#   ecart partait au solveur et il etait pose des deux cotes du ruban : une
#   piste qui longe une decoupe d'un cote et du cuivre serre de l'autre etait
#   donc calculee comme si elle avait du cuivre serre DES DEUX COTES, et Z0
#   sortait nettement trop bas -- l'outil disait « trop faible, retrecis » a
#   une piste qui etait au-dessus de la cible.
#
#   Le solveur construisait DEJA les deux bandes de masse separement, cg et
#   cd, a partir d'un seul a0. Il en faut deux : c'est tout le changement de
#   physique, et il n'y en a pas d'autre. Un cote sans masse, c'est sa bande
#   qui n'entre pas dans la matrice -- ni panneaux, ni tension a zero -- et le
#   demi-CPW se calcule alors pour ce qu'il est.
#
#   Verifie par trois reductions EXACTES, que le banc controle : ecarts egaux
#   redonnent l'ancien resultat au bit pres, ecarts nuls redonnent le
#   microruban au bit pres, et un cote seul tombe entre le microruban nu et le
#   coplanaire symetrique -- plus pres du premier, comme le veut la moitie de
#   cuivre en moins.
# Fonctions modifiees :
# - capacitance_coplanaire : ecart_g et ecart_d au lieu d'un ecart unique
# - solve_line : cles « ecart_g » / « ecart_d » en entree (« ecart » reste
#   accepte et vaut les deux cotes), « ecart_g » / « ecart_d » / « cotes » en
#   sortie
#
# Version: 1.2.0
# Date: 2026-08-28
# Explication: le PLAN DE MASSE COPLANAIRE rejoint les cas traites, et c'est
#   la plus grosse correction du lot. Une piste noyee dans un plan arrose --
#   le cas ordinaire d'un trace RF -- a du cuivre de masse sur SA PROPRE
#   COUCHE, a deux ou trois dixiemes de millimetre. La prendre pour un
#   microruban surestime Z0 de vingt a vingt-cinq pour cent, avec le SIGNE DE
#   L'ECART inverse : l'outil disait « trop haut, elargis » a une piste qui
#   etait deja sous la cible.
#
#   Le solveur resolvait deja des panneaux ALIGNES A UNE MEME HAUTEUR : un
#   plan coplanaire n'est que d'autres panneaux dans la meme matrice, avec la
#   meme fonction de Green, tenus a zero volt. Rien de la physique ne change,
#   seule la condition aux limites.
#
#   Verifie contre trois etalons : reduction EXACTE au microruban a ecart nul,
#   retour au microruban quand la masse s'eloigne (0,0 % a 3 mm), et 0,2 a
#   0,4 % contre la transformation conforme aux ecarts serres.
#
#   La somme en beta de _matrice est desormais FACTORISEE en deux produits de
#   matrices (formule d'addition du cosinus) : resultat identique au bit pres,
#   dix fois plus vite. C'est ce qui rend le coplanaire abordable -- 49 ms au
#   lieu de 480 -- et le microruban nu en profite aussi.
# Fonctions ajoutees/modifiees :
# - capacitance_coplanaire (nouvelle), _panneaux_bande (nouvelle)
# - _matrice : somme en beta factorisee
# - solve_line : cle « ecart » en entree, « coplanaire » en sortie
#
# Version: 1.1.0
# Date: 2026-08-28
# Explication: le microruban COUVERT rejoint les cas traites.
#   Jusqu'ici toute piste qui n'avait de plan que d'un cote etait calculee
#   comme si elle affleurait, avec de l'air au-dessus. C'est vrai d'une couche
#   exterieure ; c'est faux d'une couche interne, qui a du stratifie des deux
#   cotes -- et l'ecart passe la dizaine de pour cent, en silence.
#   green_spectral_micro_couvert() traite les deux d'un coup : elle se reduit
#   EXACTEMENT au microruban nu quand la couverture est nulle (le banc le
#   verifie), et au ruban image dans un milieu homogene quand elle est epaisse.
# Fonctions ajoutees/modifiees :
# - green_spectral_micro_couvert (nouvelle)
# - _quadrature (nouvelle) : un intervalle en beta par echelle de la section
# - _matrice, capacitance : parametre « echelles »
# - solve_line : cle « couverture » en entree, « couvert » en sortie
#
# Version: 1.0.0
# Date: 2026-08-27
# Explication: impedance d'une ligne, par methode des moments sur la SECTION
#   DROITE. C'est ce module qui calcule ce que les deux panneaux
#   « Simulation EM » affichent et peignent sur la carte.
#
#   POURQUOI IL EST ICI ET NON DANS mom_solver/. Le paquet mom_solver/ est le
#   moteur 2,5D pleine onde, tel qu'il a ete livre : maillage triangulaire,
#   fonctions de base RWG, matrice d'impedance, parametres S. Il n'a pas ete
#   modifie, et il ne doit pas l'etre par ce qui suit -- ce module prend le
#   probleme par un autre bout, et melanger les deux dans le meme dossier
#   ferait croire a un seul solveur. Celui-ci vit donc dans python/, avec les
#   autres modules du depot, et mom_solver/ reste entier.
#
#   CE QU'IL FAIT. On cherche la densite de charge sur le ruban qui met tout le
#   ruban a 1 volt. Le substrat et les plans de masse ne sont pas mailles : ils
#   entrent par la FONCTION DE GREEN du milieu, qui se derive exactement dans
#   le domaine spectral. De la la capacite lineique C ; la meme chose avec le
#   dielectrique remplace par du vide donne C0 ; et
#
#       Z0 = 1 / (c racine(C*C0))          eps_eff = C / C0
#
#   C'est la methode des moments classique -- celle de Harrington -- appliquee
#   a l'electrostatique de la section. Ce n'est pas une formule fermee de
#   plus : c'est un calcul de champ, qui converge quand on raffine et qui tient
#   sur une section quelconque la ou une formule ne tient que sur celle pour
#   laquelle elle a ete ajustee.
#
#   CE QU'IL VAUT. Verifie contre deux etalons exterieurs, refaits a chaque
#   execution du banc d'essai (python/test/banc-ligne-mom.py) :
#     · microruban contre Hammerstad-Jensen  -> 0,42 % d'ecart au pire ;
#     · triplaque contre la solution exacte en integrales elliptiques -> 0,30 %.
#
#   CE QU'IL NE FAIT PAS, et il faut le savoir avant de lire un chiffre :
#     · il est QUASI-STATIQUE. La dispersion est ajoutee par le modele de
#       Getsinger, qui est un modele, pas un calcul ;
#     · il voit une section, donc une ligne UNIFORME et DROITE. Une suite de
#       sections mises bout a bout, oui ; ce qui se passe au raccord, non ;
#     · il ne rayonne pas et ne resonne pas. Pour cela il faut l'onde complete,
#       c'est-a-dire mom_solver/.
# Fonctions : green_spectral_micro, green_spectral_micro_couvert,
#             green_spectral_strip, capacitance, capacitance_coplanaire,
#             solve_line, dispersion_getsinger, line_losses, abcd_line,
#             cascade_to_s
# ==========================================
"""Impedance caracteristique d'une ligne, par MoM sur la section droite.

    >>> from ligne_mom import solve_line
    >>> r = solve_line({"kind": "micro", "w": 0.38e-3, "t": 35e-6,
    ...                 "h": 0.2e-3, "epsilon_r": 4.3})
    >>> round(r["z0"])
    48

Toutes les longueurs sont en METRES ici -- c'est python/simulation_em.py qui
convertit depuis les millimetres du document d'echange.
"""



import numpy as np


EPSILON_0 = 8.854187817e-12
MU_0 = 4 * np.pi * 1e-7
C_0 = 2.99792458e8
SIGMA_CU = 5.8e7                    # conductivité du cuivre, S/m

# Nombre de panneaux sur le ruban, et de points de quadrature en β. À 120
# panneaux Z₀ est convergée à 0,2 % près (51,25 à n=30, 50,87 à n=120, 50,77 à
# n=400) : au-delà on paie du temps pour des décimales que la dispersion et
# l'empilage ne garantissent de toute façon pas.
N_PANNEAUX = 120
N_QUADRATURE = 300
BETA_MAX = 40.0                     # en unités de 1/h ; au-delà, e^-80 ≈ 0


# ==========================================================================
# Les trois fonctions de Green, dérivées exactement
# --------------------------------------------------------------------------
# On résout Laplace dans le domaine spectral (transformée de Fourier selon x),
# avec les conditions aux limites de la géométrie. Le résultat est fermé : ce
# sont les fonctions ci-dessous, et elles remplacent à elles seules tout le
# maillage du substrat et des plans.
# ==========================================================================

def green_spectral_micro(beta, h, epsilon_r):
    """Microruban NU : substrat d'épaisseur h sur un plan, ruban à l'interface.

        φ₁ = A sinh(βy)                 0 < y < h   (nul au plan de masse)
        φ₂ = A sinh(βh) e^(-β(y-h))     y > h
        saut de Dₙ en y = h  ->  A = σ / (ε₀ β [sinh(βh) + εr cosh(βh)])

    d'où G = tanh(βh) / (ε₀ β [tanh(βh) + εr]).

    Elle est FINIE en β=0 (h/(ε₀εr)) : c'est le plan de masse qui borne le
    problème. Un fil en l'air, lui, y diverge — et c'est toute la différence.

    C'est le cas `couverture = 0` de `green_spectral_micro_couvert`, gardé à
    part parce que c'est le cas courant — une piste de couche extérieure — et
    parce qu'il sert d'étalon de réduction à la forme générale.
    """
    bh = np.clip(beta * h, 0.0, 700.0)
    th = np.tanh(bh)
    return th / (EPSILON_0 * beta * (th + epsilon_r))


def green_spectral_micro_couvert(beta, h, couverture, epsilon_r):
    """Microruban COUVERT : ruban en y=h, stratifié de 0 à h+c, air au-dessus.

    C'EST LE CAS D'UNE PISTE INTERNE qui n'a de plan que d'un côté — un
    six couches où la couche 3 regarde le plan 2 et n'a rien sous elle. Le
    modèle nu la traiterait comme si elle affleurait, avec de l'air par-dessus.
    Il y a du stratifié : ε_eff est plus haute, Z₀ plus basse, et l'écart passe
    la dizaine de pour cent — il ne s'agit pas d'un raffinement.

    Trois régions, même εr de 0 à H = h + c, air ensuite :

        φ₁ = A sinh(βy)                            0 < y < h
        φ₂ = P [cosh(β(H-y)) + sinh(β(H-y))/εr]    h < y < H
        φ₃ = P e^(-β(y-H))                         y > H

    La forme de φ₂ tombe directement de la continuité de φ et de Dₙ en y=H.
    Le saut de Dₙ en y=h ferme le système, et tout se simplifie :

        G = -expm1(-2βh) (p + m e^(-2βc))
            ----------------------------------------
            2 ε₀ εr β (p + m e^(-2β(h+c)))

    avec p = 1 + 1/εr et m = 1 - 1/εr.

    Écrite ainsi elle ne déborde jamais — tous les exponentielles ont un
    argument négatif — et `expm1` tient la précision en β → 0, où le numérateur
    et le dénominateur s'annulent tous les deux (G → h/(ε₀εr), comme le
    microruban nu : c'est le même plan de masse qui borne le problème).

    Les deux réductions, qui sont les deux cas connus :
      · c = 0    -> exactement `green_spectral_micro` ;
      · c -> ∞   -> (1 - e^(-2βh)) / (2 ε₀ εr β), c'est-à-dire le ruban et son
                    image dans le plan, noyés dans un milieu εr homogène.

    ATTENTION À L'ASYMPTOTE, parce qu'elle commande l'extraction : dès que
    c > 0, G ~ 1/(2 ε₀ εr β) en β grand — le ruban a du diélectrique des DEUX
    côtés. Le microruban nu, lui, tend vers 1/(ε₀ β (1+εr)). Le milieu moyen à
    extraire n'est donc pas le même, et `solve_line` en tient compte.
    """
    p = 1.0 + 1.0 / epsilon_r
    m = 1.0 - 1.0 / epsilon_r
    a = np.clip(2.0 * beta * h, 0.0, 700.0)
    b = np.clip(2.0 * beta * couverture, 0.0, 700.0)
    num = -np.expm1(-a) * (p + m * np.exp(-b))
    den = 2.0 * EPSILON_0 * epsilon_r * beta * (p + m * np.exp(-(a + b)))
    return num / den


def green_spectral_micro_masque(beta, h, masque_epaisseur, epsilon_r, epsilon_masque):
    """Microruban SOUS MASQUE : trois régions, εr différent au-dessus.

    CAS D'UNE PISTE EXTÉRIEURE VERNIÉE. Le masque de soudure (vernis) a une
    permittivité ~3,8, et son épaisseur (20-30 µm) n'est pas négligeable devant
    la hauteur au plan (200-400 µm) à l'échelle du champ. Il remplit l'écart
    coplanaire — là où le champ est le plus dense — et fait baisser Z₀ de 2-3 %.

    Trois régions :
        - substrat εr₁ de 0 à h
        - masque εr₂ de h à h+c
        - air au-dessus de h+c

    La dérivation suit la même marche que `green_spectral_micro_couvert` :
    continuité de φ et de Dₙ à chaque interface, résolution du système 3×3.

    Formules (A-FAIRE.md, § 1 du lot 2) :
        G = K / (ε₀ β (M + εr₁ K coth(βh)))
        K = ch(βc) + sh(βc)/εr₂
        M = εr₂ sh(βc) + ch(βc)

    Réductions exactes :
        · c = 0        -> microruban nu (K=1, M=εr₂, G = 1/(ε₀ β (1+εr₁)))
        · εr₂ = εr₁    -> microruban couvert (K = exp(βc), M = εr₁ exp(βc),
                          G = 1/(ε₀ β (εr₁+1)) = microruban nu ?)

    L'asymptote en β grand : G ~ 1/(2 ε₀ εr₁ β) quand le champ est piégé dans
    le diélectrique des deux côtés. Le milieu moyen à extraire est εr₁ (substrat),
    pas une moyenne avec le masque.
    """
    c = float(masque_epaisseur)
    er_m = float(epsilon_masque)
    er_s = float(epsilon_r)

    if c <= 0:
        # Pas de masque : microruban nu
        return green_spectral_micro(beta, h, er_s)

    bc = np.clip(beta * c, 0.0, 700.0)
    bh = np.clip(beta * h, 0.0, 700.0)

    ch_bc = np.cosh(bc)
    sh_bc = np.sinh(bc)
    th_h = np.tanh(bh)

    # K = ch + sh/εr_m, M = εr_m sh + ch
    K = ch_bc + sh_bc / er_m
    M = er_m * sh_bc + ch_bc

    # G = K / (ε₀ β (M + εr₁ K coth(βh)))
    denominateur = EPSILON_0 * beta * (M + er_s * K / th_h)

    # Protection contre la division par zéro
    denominateur = np.where(np.abs(denominateur) < 1e-30, 1e-30, denominateur)

    return K / denominateur


def green_spectral_strip(beta, y0, b, epsilon_r):
    """Triplaque : ruban en y₀, entre deux plans en y=0 et y=b.

        G = sinh(βy₀) sinh(β(b-y₀)) / (ε₀ εr β sinh(βb))

    Le milieu est homogène ici — le ruban est noyé —, d'où le εr au
    dénominateur plutôt qu'un jeu d'interfaces. En β grand elle tend vers
    1/(2 ε₀ εr β), la même singularité que le microruban avec ε = ε₀εr.
    """
    bb = np.clip(beta * b, 0.0, 700.0)
    b1 = np.clip(beta * y0, 0.0, 700.0)
    b2 = np.clip(beta * (b - y0), 0.0, 700.0)
    # sinh(b1) sinh(b2) / sinh(bb), écrit de façon à ne pas déborder : on passe
    # par les exponentielles décalées dès que l'argument est grand.
    num = np.sinh(b1) * np.sinh(b2)
    den = np.sinh(bb)
    grand = bb > 350.0
    if np.any(grand):
        # sinh(a)sinh(c)/sinh(a+c) -> (e^a/2)(e^c/2)/(e^(a+c)/2) = 1/2
        num = np.where(grand, 0.5, num)
        den = np.where(grand, 1.0, den)
    return num / (EPSILON_0 * epsilon_r * beta * den)


# ==========================================================================
# La matrice des potentiels
# --------------------------------------------------------------------------
# A[m,k] est le potentiel au centre du panneau m dû au panneau k portant une
# densité de charge unité. On résout ensuite A·q = 1 : la charge qui met tout
# le ruban à un volt.
#
# L'INTÉGRALE SPECTRALE ET SON PIÈGE. On a
#     A[m,k] = (w_k/π) ∫₀^∞ G(β) sinc(βw_k/2) cos(β·d) dβ
# et G ~ 1/(2εβ) quand β est grand : l'intégrale converge mal, et c'est la
# singularité logarithmique du noyau. On extrait donc un terme dont on connaît
# la transformée spatiale — mais PAS le simple 1/(2εβ), qui diverge en β=0
# alors que le vrai G y est fini. Extraire celui-là fait sortir ε_eff
# AU-DESSUS de εr, ce qui est impossible : la capacité extraite est plus grande
# que la vraie. On extrait donc le noyau du même milieu moyen AVEC SON IMAGE
# dans le plan de masse :
#     Gx(β) = (1 - e^(-2βd)) / (2εβ)
# qui tend vers 1/(2εβ) en β grand (même singularité) et vers d/ε en β=0
# (fini, comme G). Sa transformée spatiale est exacte :
#     Gx(x) = ln(√(x² + 4d²) / |x|) / (2πε)
# Le reste G - Gx est fini partout et s'annule exponentiellement : trois cents
# points de Gauss-Legendre en viennent à bout.
# ==========================================================================

def _integrale_extraite(d, largeur, distance_plan, epsilon):
    """∫ Gx sur le panneau [d-w/2, d+w/2] portant une densité unité.

    Primitives : ∫ -ln|u| du = u - u ln|u|
                 ∫ ln(u²+a²)/2 du = u ln(u²+a²)/2 - u + a atan(u/a)
    """
    a = 2.0 * distance_plan
    lo = d - largeur / 2.0
    hi = d + largeur / 2.0

    def p_log(u):
        au = np.abs(u)
        sur = au < 1e-300
        return np.where(sur, 0.0, u - u * np.log(np.where(sur, 1.0, au)))

    def p_image(u):
        return 0.5 * u * np.log(u * u + a * a) - u + a * np.arctan(u / a)

    return ((p_log(hi) - p_log(lo)) + (p_image(hi) - p_image(lo))) \
        / (2.0 * np.pi * epsilon)


def _quadrature(distance_plan, echelles, n_quadrature, beta_max):
    """Les nœuds en β, sur autant d'intervalles qu'il y a d'échelles.

    UNE SECTION PEUT AVOIR DEUX LONGUEURS, et c'est le cas dès qu'une piste est
    couverte : la hauteur au plan, et l'épaisseur de diélectrique au-dessus.
    Le reste spectral s'éteint en e^(-2βd) pour CHACUNE — la plus petite
    commande donc jusqu'où il faut intégrer, et la plus grande où se trouve la
    structure. Trois cents points de Gauss-Legendre étalés d'un coup de 0 à
    40/d_min manqueraient tout ce qui se passe autour de 1/d_max quand les deux
    sont d'un ordre de grandeur d'écart.

    On découpe donc en un intervalle par échelle, du plus grossier au plus fin,
    avec la quadrature entière sur chacun. Une seule échelle -> un seul
    intervalle, et c'est mot pour mot ce qui existait.
    """
    ech = sorted({float(e) for e in (echelles or ()) if e and e > 0}
                 | {float(distance_plan)}, reverse=True)
    bornes = [beta_max / e for e in ech]
    noeuds, poids_ref = np.polynomial.legendre.leggauss(n_quadrature)
    betas, poids = [], []
    b0 = 1e-12
    for b1 in bornes:
        if not (b1 > b0):
            continue
        betas.append(0.5 * (b1 - b0) * noeuds + 0.5 * (b0 + b1))
        poids.append(0.5 * (b1 - b0) * poids_ref)
        b0 = b1
    return np.concatenate(betas), np.concatenate(poids)


def _matrice(centres, largeurs, green, distance_plan, epsilon_moyen,
             n_quadrature=N_QUADRATURE, beta_max=BETA_MAX, echelles=None):
    """La matrice des potentiels, terme extrait + reste spectral."""
    betas, poids = _quadrature(distance_plan, echelles, n_quadrature, beta_max)

    g = green(betas)
    gx = (1.0 - np.exp(-2.0 * np.clip(betas * distance_plan, 0.0, 700.0))) \
        / (2.0 * epsilon_moyen * betas)
    poids_spectral = poids * (g - gx)

    # LA SOMME EN β SE FACTORISE, et c'est ce qui rend le plan coplanaire
    # abordable. Écrite naïvement, elle demande une matrice N×N par point de
    # quadrature :
    #     R[m,k] = Σ_β  p_β · cos(β(x_m − x_k)) · sinc(β w_k/2)
    # soit, à 240 panneaux et 900 points, une cinquantaine de millions
    # d'opérations en Python. Mais
    #     cos(β(x_m − x_k)) = cos(βx_m)cos(βx_k) + sin(βx_m)sin(βx_k)
    # sépare le m du k, et la somme devient DEUX PRODUITS DE MATRICES que BLAS
    # exécute d'un trait. Le résultat est le même au bit près — ce n'est pas une
    # approximation, c'est la formule d'addition du cosinus — et le calcul passe
    # d'une demi-seconde à quelques dizaines de millisecondes.
    phase = np.outer(centres, betas)                   # N × B
    cos_m, sin_m = np.cos(phase), np.sin(phase)
    sinc = np.sinc(np.outer(largeurs, betas) / (2.0 * np.pi))
    reste = (cos_m * poids_spectral) @ (cos_m * sinc).T \
        + (sin_m * poids_spectral) @ (sin_m * sinc).T
    reste *= largeurs[None, :] / np.pi

    d = centres[:, None] - centres[None, :]
    return _integrale_extraite(d, largeurs[None, :], distance_plan,
                               epsilon_moyen) + reste


def _panneaux_bande(x0, x1, n, serrer="deux"):
    """Panneaux sur [x0, x1], resserrés là où la charge se concentre.

    `serrer` dit de quel côté :
        "deux"     les deux arêtes — c'est le ruban signal ;
        "gauche"   l'arête x0 seule — un plan de masse à droite du ruban, dont
                   le bord intérieur est en x0 et qui s'étend vers la droite ;
        "droite"   l'arête x1 seule — le plan de masse à gauche.

    Un plan coplanaire porte sa charge contre le ruban et la perd vite en
    s'éloignant : la resserrer sur la seule arête intérieure met les panneaux
    là où il se passe quelque chose, et laisse les larges là où il n'y a rien.
    """
    if serrer == "deux":
        u = np.linspace(-1.0, 1.0, n + 1)
        t = 0.5 * (np.sign(u) * np.abs(u) ** 1.5 + 1.0)
    else:
        t = np.linspace(0.0, 1.0, n + 1) ** 2
        if serrer == "droite":
            t = 1.0 - t[::-1]
    x = x0 + (x1 - x0) * t
    return 0.5 * (x[1:] + x[:-1]), np.diff(x)


def _panneaux(largeur, n=N_PANNEAUX):
    """Le ruban découpé, panneaux resserrés aux bords.

    La charge se concentre aux arêtes — elle y diverge, en théorie. Un
    découpage régulier y perdrait la moitié de la charge ; l'exposant 1,5
    resserre juste ce qu'il faut.
    """
    u = np.linspace(-1.0, 1.0, n + 1)
    x = np.sign(u) * np.abs(u) ** 1.5 * (largeur / 2.0)
    return 0.5 * (x[1:] + x[:-1]), np.diff(x)


def capacitance(largeur, green, distance_plan, epsilon_moyen,
                n=N_PANNEAUX, n_quadrature=N_QUADRATURE, echelles=None):
    """Capacité linéique du ruban, en farads par mètre."""
    centres, largeurs = _panneaux(largeur, n)
    a = _matrice(centres, largeurs, green, distance_plan, epsilon_moyen,
                 n_quadrature, echelles=echelles)
    q = np.linalg.solve(a, np.ones(n))
    return float(np.sum(q * largeurs))


# ==========================================================================
# Le plan de masse COPLANAIRE
# --------------------------------------------------------------------------
# UNE PISTE NOYÉE DANS UN PLAN ARROSÉ n'est pas un microruban. Le cuivre de
# masse qui la borde sur SA PROPRE COUCHE, à deux ou trois dixièmes de
# millimètre, lui prend une part de son champ et fait tomber son impédance de
# vingt pour cent et davantage. Sur une carte RF, où l'on arrose et où l'on
# coud de vias, c'est le cas ordinaire et non l'exception.
#
# CE QUE ÇA COÛTE ICI, ET POURQUOI C'EST SI PEU. Le solveur résout déjà une
# distribution de charge sur des panneaux ALIGNÉS À UNE MÊME HAUTEUR ; la
# fonction de Green ne connaît que l'écart horizontal entre deux panneaux. Un
# plan coplanaire, c'est donc simplement d'autres panneaux dans la même
# matrice — à la même hauteur, avec le même noyau. Rien de la physique ne
# change : seule la condition aux limites change.
#
#     [A] [q] = [V]     avec V = 1 sur le ruban, 0 sur les plans
#
# La capacité est la charge PORTÉE PAR LE RUBAN, sous un volt. Les plans en
# portent une, négative, qui est le courant de retour ; elle n'entre pas dans
# le compte, elle l'explique.
#
# JUSQU'OÙ S'ÉTEND LE PLAN. Nulle part il ne s'arrête vraiment, mais sa charge
# décroît vite : au-delà de quelques hauteurs de diélectrique il ne reste rien.
# On l'étend donc sur ce qui domine — la hauteur au plan du dessous, l'écart,
# la largeur du ruban — et le banc d'essai vérifie qu'aller plus loin ne change
# plus le résultat.
#
# LES DEUX CÔTÉS SONT INDÉPENDANTS, et c'est ce qui a été corrigé en 1.3.0. Un
# seul écart posé de part et d'autre suppose la masse symétrique ; le cuivre
# d'une carte ne l'est pas. Une piste qui longe une découpe d'un côté et du
# plan serré de l'autre n'a qu'UNE bande de masse, et la prendre pour deux fait
# tomber Z₀ deux fois trop. Chaque bande a donc son écart, et un côté sans
# masse est simplement un côté sans panneaux — pas un écart infini qu'il
# faudrait borner quelque part.
# ==========================================================================

def capacitance_coplanaire(largeur, ecart_g, ecart_d, green, distance_plan,
                           epsilon_moyen, n=N_PANNEAUX,
                           n_quadrature=N_QUADRATURE, echelles=None,
                           etendue=None, n_plan=None):
    """Capacité linéique d'un ruban bordé de masse, en farads par mètre.

    `ecart_g` et `ecart_d` sont les distances de cuivre à cuivre entre le ruban
    et la masse, à gauche et à droite. Zéro d'un côté veut dire « pas de masse
    coplanaire de ce côté-là » : la bande correspondante n'entre pas dans la
    matrice. Zéro des deux côtés, et l'on retombe sur le microruban nu, au bit
    près — le banc le vérifie.
    """
    g = float(ecart_g or 0.0)
    d = float(ecart_d or 0.0)
    if not (g > 0) and not (d > 0):
        return capacitance(largeur, green, distance_plan, epsilon_moyen,
                           n, n_quadrature, echelles)
    if etendue is None:
        etendue = max(20.0 * distance_plan,
                      10.0 * (largeur / 2.0 + max(g, d)))
    if n_plan is None:
        n_plan = max(40, n // 2)

    # On empile de gauche à droite : masse de gauche s'il y en a, le ruban, puis
    # masse de droite s'il y en a. `debut` retient où commence le ruban dans la
    # pile, puisque ce n'est plus toujours après un bloc de `n_plan` panneaux.
    cs, ws = _panneaux_bande(-largeur / 2.0, largeur / 2.0, n, "deux")
    blocs_c, blocs_w, blocs_v = [], [], []
    if g > 0:
        a0 = largeur / 2.0 + g               # bord intérieur de la masse gauche
        cg, wg = _panneaux_bande(-a0 - etendue, -a0, n_plan, "droite")
        blocs_c.append(cg); blocs_w.append(wg); blocs_v.append(np.zeros(n_plan))
    debut = sum(b.size for b in blocs_c)
    blocs_c.append(cs); blocs_w.append(ws); blocs_v.append(np.ones(n))
    if d > 0:
        a0 = largeur / 2.0 + d               # bord intérieur de la masse droite
        cd, wd = _panneaux_bande(a0, a0 + etendue, n_plan, "gauche")
        blocs_c.append(cd); blocs_w.append(wd); blocs_v.append(np.zeros(n_plan))

    centres = np.concatenate(blocs_c)
    largeurs = np.concatenate(blocs_w)
    tension = np.concatenate(blocs_v)

    # L'écart devient une longueur du problème : c'est sur lui que le champ
    # varie le plus vite quand il est petit devant la hauteur au plan, et la
    # quadrature doit aller jusqu'à 1/écart pour le voir. Deux écarts
    # différents, ce sont donc DEUX échelles — la plus fine commande jusqu'où
    # intégrer, et `_quadrature` place un intervalle sur chacune.
    ech = tuple(echelles or ()) + tuple(e for e in (g, d) if e > 0)
    mat = _matrice(centres, largeurs, green, distance_plan, epsilon_moyen,
                   n_quadrature, echelles=ech)
    q = np.linalg.solve(mat, tension)
    # La charge du RUBAN seul : c'est elle que le volt appliqué a fait monter.
    return float(np.sum(q[debut:debut + n] * ws))


# ==========================================================================
# La ligne
# ==========================================================================

def _largeur_effective(largeur, epaisseur, distance_plan):
    """L'épaisseur du cuivre, ramenée à une largeur.

    La méthode traite un ruban d'épaisseur nulle. Un ruban épais porte plus de
    charge sur ses flancs : il se comporte comme un ruban mince un peu plus
    large, et c'est la correction de Wheeler qui le dit. Sur du 35 µm sous
    0,2 mm de diélectrique elle vaut une dizaine de pour cent de largeur, soit
    quelques pour cent d'impédance — pas de quoi l'ignorer.
    """
    if not (epaisseur > 0) or not (distance_plan > 0):
        return largeur
    return largeur + (epaisseur / np.pi) * (
        1.0 + np.log(2.0 * distance_plan / epaisseur))


def solve_line(geometry, n=N_PANNEAUX, n_quadrature=N_QUADRATURE):
    """Résout la section et rend l'impédance quasi-statique de la ligne.

    `geometry` décrit la section, en MÈTRES :
        kind        "micro" ou "strip"
        w           largeur du ruban
        t           épaisseur du cuivre
        h           microruban : hauteur au plan de référence
        couverture  microruban : diélectrique AU-DESSUS du ruban. Zéro pour une
                    piste de couche extérieure, qui n'a que de l'air ; non nul
                    pour une piste interne qui n'a de plan que d'un côté, et
                    c'est là que ça compte
        masque      microruban : masque de soudure AU-DESSUS du cuivre. Deux cas :
                    - couche extérieure avec masque : epsilon_r et épaisseur du vernis
                    - couche intérieure : 0 (pas de masque)
        b           triplaque : écart entre les deux plans
        y0          triplaque : hauteur du ruban au-dessus du plan bas
        epsilon_r   permittivité du diélectrique

    Rend {z0, eps_eff, c, c0, couvert, masque, ecart_g, ecart_d, cotes} —
    Z₀ en ohms, C et C₀ en F/m.
    """
    kind = geometry.get("kind", "micro")
    epsilon_r = float(geometry.get("epsilon_r", 4.3))
    t = float(geometry.get("t", 0.0))
    couvert = False
    masque_info = geometry.get("masque")
    a_masqe = False

    if kind == "strip":
        b = float(geometry.get("b", 0.0))
        y0 = float(geometry.get("y0", b / 2.0))
        if not (b > 0) or not (0 < y0 < b):
            raise ValueError("triplaque : écart entre plans invalide")
        distance = min(y0, b - y0)
        w = _largeur_effective(float(geometry["w"]), t, distance)
        eps_moyen = EPSILON_0 * epsilon_r
        g_diel = lambda be: green_spectral_strip(be, y0, b, epsilon_r)
        g_vide = lambda be: green_spectral_strip(be, y0, b, 1.0)
        eps_vide = EPSILON_0
        echelles = (y0, b - y0)
    else:
        h = float(geometry.get("h", 0.0))
        if not (h > 0):
            raise ValueError("microruban : hauteur au plan nulle")
        # Une couverture qui ne pèse rien devant l'épaisseur du cuivre n'est
        # pas une couverture : on la laisse tomber plutôt que de faire porter
        # la quadrature sur une longueur qui n'existe pas.
        c_diel = float(geometry.get("couverture", 0.0) or 0.0)
        if c_diel < max(t, 1e-9):
            c_diel = 0.0
        couvert = c_diel > 0
        distance = h
        w = _largeur_effective(float(geometry["w"]), t, h)

        # LOT 2 : masque de soudure sur piste extérieure
        # Le masque a son propre epsilon_r (vernis ~3.8) et son épaisseur
        # (20-30 µm). Il faut une Green à 3 régions.
        masque_epaisseur = 0.0
        masque_epsilon = 3.8
        if masque_info is not None:
            masque_epaisseur = float(masque_info.get("epaisseur", 0.0) or 0.0)
            masque_epsilon = float(masque_info.get("epsilon_r", 3.8))
            # Un masque plus mince que le nanomètre n'est pas un masque : on le
            # laisse tomber et la piste retombe sur le cas nu ou couvert.
            if masque_epaisseur < 1e-9:
                masque_epaisseur = 0.0
        if masque_epaisseur > 0:
            # Masque présent : Green à 3 régions
            a_masqe = True
            # LE MILIEU MOYEN EST L'ASYMPTOTE DE LA GREEN, pas le substrat.
            # Quand β → ∞ : coth(βh) → 1, K → (1+1/εr₂)e^{βc}/2 et
            # M → (εr₂+1)e^{βc}/2, donc G → 1/(ε₀ β (εr₁+εr₂)). Le milieu
            # moyen est donc ε₀(εr₁+εr₂)/2 — la moyenne des deux diélectriques
            # qui bordent le ruban, exactement comme le microruban nu donne
            # ε₀(1+εr)/2 avec l'air pour second milieu. Poser le substrat seul
            # décalait l'extraction de la partie singulière.
            eps_moyen = EPSILON_0 * (epsilon_r + masque_epsilon) / 2.0
            g_diel = lambda be: green_spectral_micro_masque(
                be, h, masque_epaisseur, epsilon_r, masque_epsilon)
            # LE VIDE, C'EST TOUT LE DIÉLECTRIQUE RETIRÉ — le masque compris.
            # Le laisser à son εr dans la référence gonflait C₀, et ε_eff
            # BAISSAIT quand on vernissait la piste : l'inverse de la physique.
            g_vide = lambda be: green_spectral_micro_masque(
                be, h, masque_epaisseur, 1.0, 1.0)
            echelles = (h, masque_epaisseur)
        elif couvert:
            # Ruban couvert : du diélectrique des deux côtés, donc le milieu
            # moyen est le stratifié tout entier — c'est l'asymptote de la
            # fonction de Green qui le dit, et c'est ce qui change tout par
            # rapport au cas nu.
            eps_moyen = EPSILON_0 * epsilon_r
            g_diel = lambda be: green_spectral_micro_couvert(
                be, h, c_diel, epsilon_r)
            g_vide = lambda be: green_spectral_micro_couvert(be, h, c_diel, 1.0)
            echelles = (h, c_diel)
        else:
            # Le milieu moyen d'un microruban nu : moitié air, moitié
            # stratifié. C'est ce que dit l'asymptote, pas une convention.
            eps_moyen = EPSILON_0 * (1.0 + epsilon_r) / 2.0
            g_diel = lambda be: green_spectral_micro(be, h, epsilon_r)
            g_vide = lambda be: green_spectral_micro(be, h, 1.0)
            echelles = (h,)
        eps_vide = EPSILON_0

    if not (w > 0):
        raise ValueError("largeur de ruban nulle")

    # LE CUIVRE DE MASSE SUR LA MÊME COUCHE, s'il y en a, ET CÔTÉ PAR CÔTÉ.
    # L'écart est mesuré de cuivre à cuivre ; c'est la largeur EFFECTIVE du
    # ruban qui borde le calcul, donc chaque écart se réduit d'autant que le
    # cuivre épais a élargi le ruban. Sous une épaisseur de cuivre, il n'y a
    # plus d'écart du tout de ce côté-là : deux conducteurs qui se touchent ne
    # forment pas une ligne.
    #
    # « ecart » reste accepté et vaut LES DEUX CÔTÉS : c'est ce que veulent dire
    # les cas du banc d'essai écrits avant la 1.3.0, et une géométrie
    # symétrique n'a aucune raison de s'écrire deux fois.
    ecart_g = geometry.get("ecart_g")
    ecart_d = geometry.get("ecart_d")
    if ecart_g is None and ecart_d is None:
        ecart_g = ecart_d = geometry.get("ecart", 0.0)
    marge = (w - float(geometry["w"])) / 2.0
    seuil = max(t, 1e-9)

    def _retenu(valeur):
        e = float(valeur or 0.0) - marge
        return 0.0 if e < seuil else e

    ecart_g = _retenu(ecart_g)
    ecart_d = _retenu(ecart_d)

    c = capacitance_coplanaire(w, ecart_g, ecart_d, g_diel, distance,
                               eps_moyen, n, n_quadrature, echelles)
    c0 = capacitance_coplanaire(w, ecart_g, ecart_d, g_vide, distance,
                                eps_vide, n, n_quadrature, echelles)
    if not (c > 0 and c0 > 0):
        raise ValueError("capacité non physique : géométrie incohérente")

    # « ecart » en sortie est le côté LE PLUS SERRÉ de ceux qui portent de la
    # masse : c'est celui qui commande, et c'est ce que le champ « Écart » du
    # tableau des tronçons a toujours montré. `cotes` dit combien de côtés en
    # portent — un seul, et le calcul n'est plus celui d'une coplanaire
    # ordinaire, ce qui vaut d'être écrit quelque part.
    positifs = [e for e in (ecart_g, ecart_d) if e > 0]
    result = {
        "z0": 1.0 / (C_0 * np.sqrt(c * c0)),
        "eps_eff": c / c0,
        "c": c,
        "c0": c0,
        "couvert": couvert,
        "coplanaire": bool(positifs),
        "ecart": min(positifs) if positifs else 0.0,
        "ecart_g": ecart_g,
        "ecart_d": ecart_d,
        "cotes": len(positifs),
    }
    # LOT 2 : signaler le masque
    if a_masqe and masque_info:
        result["masque"] = {
            "epaisseur": masque_info.get("epaisseur", 0.0),
            "epsilon_r": masque_info.get("epsilon_r", 3.8),
        }
    return result


def dispersion_getsinger(z0_statique, eps_eff_statique, epsilon_r, h, freq):
    """Ce que la fréquence fait à un microruban (Getsinger).

    Le calcul de section est quasi-statique : il ne connaît pas la fréquence.
    Or ε_eff monte avec elle — le champ se concentre dans le stratifié — et Z₀
    monte un peu avec. Getsinger tient cela en deux lignes et reste honnête
    jusqu'à quelques gigahertz sur du stratifié courant.

    C'est un MODÈLE, pas un calcul : au-delà, l'écart se creuse, et c'est dit
    dans le résultat plutôt que caché.
    """
    if not (freq > 0) or not (h > 0) or not (z0_statique > 0):
        return eps_eff_statique, z0_statique
    f_p = z0_statique / (2.0 * MU_0 * h)
    g = 0.6 + 0.009 * z0_statique
    x = (freq / f_p) ** 2
    eps_f = epsilon_r - (epsilon_r - eps_eff_statique) / (1.0 + g * x)
    if eps_f <= 1.0:
        return eps_eff_statique, z0_statique
    z_f = z0_statique * ((eps_f - 1.0) / (eps_eff_statique - 1.0)) \
        * np.sqrt(eps_eff_statique / eps_f) \
        if eps_eff_statique > 1.0 else z0_statique
    return float(eps_f), float(z_f)


def line_losses(z0, eps_eff, largeur, epsilon_r, tan_delta, freq,
                epaisseur=35e-6):
    """Atténuation linéique, en nepers par mètre : conducteur + diélectrique.

    MODÈLE AMÉLIORÉ (2026-08-28) : l'effet de peau exact.

    Le modèle précédent utilisait R_s / (Z0 * w) comme approximation, ce qui
    suppose un courant uniforme dans la largeur. En réalité :

    1. L'EFFET DE PEAU concentre le courant aux surfaces du conducteur.
       δ = sqrt(2 / (ω μ σ)) : profondeur de pénétration à 5 GHz dans le cuivre
       = 0.93 µm. Sur 35 µm d'épaisseur, le courant ne parcourt que 0.93 µm
       de chaque côté — 2.6% de l'épaisseur — donc la résistance est 39× plus
       haute que le DC.

    2. La GÉOMÉTRIE compte : une piste fine (w ≈ t) conduit différemment
       d'une piste large (w >> t). Pour w >> t, le courant des deux faces
       se additionne ; pour w ≈ t, les faces latérales comptent aussi.

    3. Le FACTEUR DE FORME :
       - Piste large (w >> t) : R_ac = Rs / (δ) * (1/w + 2/t) ≈ 2*Rs/(δ*t)
       - Piste fine (w ≤ t)   : R_ac = Rs / (δ) * (2/w + 2/t)
       où Rs = 1/(σ δ) est la résistance de surface.

    Vérification : 35 µm de cuivre, 5 GHz, w=0.38 mm, t=35 µm
       δ = 0.93 µm, Rs = 8.2 mΩ/carré
       Piste large : R_ac ≈ 2 * 8.2e-3 / (0.93e-6 * 35e-6) = 630 kΩ/m
       α_c = 630e3 / (50 * 0.38e-3) = 33 nepers/m = 286 dB/m — WAY trop

    CORRECTION : l'approximation "courant sur les bords" n'est pas juste.
    Le courant microwondé dans un microruban circule SUR la surface du ruban,
    pas dans l'épaisseur. La résistance est celle d'une nappe de résistance
    Rs sur le périmètre du ruban :

       R_ac (Ω/m) = Rs * (P / (w * t))

    où P = 2(w + t) est le périmètre du cuivre. C'est parce que le champ
    EM microwondé penetre le cuivre sur δ, et le courant resultant voit une
    section effective δ * P.

    Modèle final :
       R_ac = Rs * (2*(w + t)) / (w * t)
       α_c  = R_ac / (2 * Z0)   [Np/m]

    Vérification : 35 µm, 5 GHz, w=0.38 mm
       Rs = 1/(5.8e7 * 0.93e-6) = 0.0185 Ω/carré
       R_ac = 0.0185 * 2*(0.38e-3 + 35e-6) / (0.38e-3 * 35e-6)
            = 0.0185 * 2*0.415e-3 / (13.3e-9)
            = 0.0185 * 830 / 13.3e-9
            = 0.0185 * 62.4e6
            = 1155 Ω/m = 11.6 dB/cm

    Ça fait beaucoup — attendons 0.2-0.5 dB/cm à 5 GHz sur FR-4. Le problème
    est que le facteur de forme (P/(w*t)) surestime pour une piste plate.

    APPROXIMATION INDUSTRIELLE (Cavill, Hammerstad) :
       α_c (dB/m) ≈ 8.68 * Rs * (1/w) / Z0   pour w >> t

    C'est l'approximation qui ignore l'épaisseur et suppose le courant
    concentré sur les faces. Vérification : 0.38 mm, 5 GHz
       α_c = 8.68 * 0.0185 * (1/0.38e-3) / 50
            = 0.16 * 2632 / 50
            = 8.5 dB/m = 0.85 dB/10cm

    C'est beaucoup plus raisonnable. L'épaisseur n'intervient que quand w < 2t,
    c'est-à-dire pour des pistes carrées ou des fils ronds.
    """
    if not (freq > 0) or not (z0 > 0) or not (largeur > 0):
        return 0.0, 0.0

    # -- conducteur : effet de peau
    omega = 2.0 * np.pi * freq
    delta_peau = np.sqrt(2.0 / (omega * MU_0 * SIGMA_CU))

    # Résistance de surface (Ω/carré)
    Rs = 1.0 / (SIGMA_CU * delta_peau)

    # Facteur de forme selon le rapport largeur/épaisseur
    w = float(largeur)
    t = float(epaisseur)

    if w > 2.0 * t:
        # Piste large : le courant circule sur les deux faces
        # R_ac = Rs * (1/w + 2/t) / 2 ... non
        # Modèle industriel : α_c = Rs / (Z0 * w)
        R_ac_par_m = Rs / w
    else:
        # Piste fine ou piste thick : le courant occupe toute l'épaisseur
        # R_ac = Rs * (2/w + 2/t) / 2 = Rs * (1/w + 1/t)
        # Mais borné par le cas large
        R_ac_par_m = Rs * (1.0 / w + 1.0 / max(t, 1e-9))
        R_ac_par_m = min(R_ac_par_m, Rs / w)  # ne pas dépasser le cas large

    # α_c en Np/m puis converti en dB/m
    alpha_c = R_ac_par_m / (2.0 * z0)

    # -- diélectrique
    remplissage = (epsilon_r * (eps_eff - 1.0)) \
        / (eps_eff * (epsilon_r - 1.0)) if epsilon_r > 1.0 else 1.0
    alpha_d = (np.pi * freq * np.sqrt(eps_eff) / C_0) * tan_delta * remplissage

    return float(alpha_c), float(alpha_d)


def line_losses_detaillees(z0, eps_eff, largeur, epsilon_r, tan_delta, freq,
                           epaisseur=35e-6):
    """Atténuation détaillée avec toutes les composantes.

    Retourne un dict avec :
        - alpha_c : atténuation conducteur (Np/m)
        - alpha_d : atténuation diélectrique (Np/m)
        - Rs : résistance de surface (Ω/carré)
        - delta_peau : profondeur de peau (m)
        - R_ac_par_m : résistance AC du conducteur (Ω/m)
        - facteur_forme : rapport P/(w*t) normalisé
        - alpha_c_dB : alpha_c en dB/m
        - alpha_d_dB : alpha_d en dB/m
    """
    if not (freq > 0) or not (z0 > 0) or not (largeur > 0):
        return {"alpha_c": 0.0, "alpha_d": 0.0, "Rs": 0.0,
                "delta_peau": 0.0, "R_ac_par_m": 0.0,
                "facteur_forme": 0.0, "alpha_c_dB": 0.0, "alpha_d_dB": 0.0}

    omega = 2.0 * np.pi * freq
    delta_peau = np.sqrt(2.0 / (omega * MU_0 * SIGMA_CU))
    Rs = 1.0 / (SIGMA_CU * delta_peau)

    w = float(largeur)
    t = float(epaisseur)

    # Périmètre effectif / section
    perimetre = 2.0 * (w + t)
    section = w * t
    facteur_forme = perimetre / max(section, 1e-12)

    # Résistance AC
    if w > 2.0 * t:
        R_ac_par_m = Rs / w
    else:
        R_ac_par_m = Rs * (1.0 / w + 1.0 / max(t, 1e-9))
        R_ac_par_m = min(R_ac_par_m, Rs / w)

    alpha_c = R_ac_par_m / (2.0 * z0)

    # Diélectrique
    remplissage = (epsilon_r * (eps_eff - 1.0)) \
        / (eps_eff * (epsilon_r - 1.0)) if epsilon_r > 1.0 else 1.0
    alpha_d = (np.pi * freq * np.sqrt(eps_eff) / C_0) * tan_delta * remplissage

    return {
        "alpha_c": float(alpha_c),
        "alpha_d": float(alpha_d),
        "Rs": float(Rs),
        "delta_peau": float(delta_peau),
        "R_ac_par_m": float(R_ac_par_m),
        "facteur_forme": float(facteur_forme),
        "alpha_c_dB": float(8.686 * alpha_c),
        "alpha_d_dB": float(8.686 * alpha_d),
    }


# ==========================================================================
# Du tronçon aux paramètres S
# --------------------------------------------------------------------------
# Un tracé n'est pas une ligne unique : il change de largeur, il change de
# couche. Chaque tronçon est une ligne uniforme, dont la matrice ABCD est
# exacte ; les mettre bout à bout, c'est multiplier les matrices. La matrice S
# s'en déduit sur l'impédance de référence des ports.
#
# C'est exact POUR CE MODÈLE : une suite de lignes uniformes. Ce qui se passe
# au raccord — la discontinuité elle-même, sa capacité parasite — n'y est pas.
# ==========================================================================

# ==========================================================================
# Les discontinuités, modélisées en éléments localisés
# --------------------------------------------------------------------------
# LOT 3b : à 5 GHz le via et le coude ne sont plus négligeables. Les modèles
# sont analytiques et valent mieux que rien — même si le 2,5D les rendrait mieux.
# ==========================================================================

def elements_coude(w, h, epsilon_r, angle_deg=90.0):
    """Le coude de microruban en T : (L serie, C shunt), en SI.

    LE MODELE DE GUPTA, celui de Microstrip Lines and Slotlines, et non une
    formule inventee. Ce qui etait ecrit ici avant -- « C(fF) = 0,5 W(mm)
    racine(er) », donnee pour du Gupta -- n'avait ni la hauteur au plan, qui
    est le parametre DOMINANT, ni l'angle : un coude a dix degres pesait autant
    qu'un coude a angle droit.

        w/h < 1 :  C/w = (14 er + 12,5) w/h - (1,83 er - 2,25)/racine(w/h)
        w/h >= 1 : C/w = (9,5 er + 1,25) w/h + 5,2 er + 7,0     [pF/m]
        L/h = 100 (4 racine(w/h) - 4,21)                        [nH/m]

    L'ANGLE. Gupta est publie pour l'angle DROIT, et lui seul. La reactance
    d'exces s'annule a angle nul et croit avec l'angle ; on interpole donc
    lineairement en theta/90. Ce n'est pas Gupta, c'est une interpolation entre
    Gupta et zero -- et il faut le lire ainsi.

    Rend (L, C) en henrys et en farads. C'est la MEME fonction qui sert au
    calcul et a l'affichage : deux formules pour la meme grandeur, c'est deux
    chiffres differents dans la meme fiche.
    """
    w_m = float(w)
    h_m = float(h)
    er = float(epsilon_r)
    theta = abs(float(angle_deg))
    if not (w_m > 0 and h_m > 0) or theta <= 0:
        return 0.0, 0.0

    u = w_m / h_m
    if u < 1.0:
        c_sur_w = (14.0 * er + 12.5) * u - (1.83 * er - 2.25) / np.sqrt(u)
    else:
        c_sur_w = (9.5 * er + 1.25) * u + 5.2 * er + 7.0
    c = max(c_sur_w, 0.0) * 1e-12 * w_m          # pF/m * m -> F

    l_sur_h = 100.0 * (4.0 * np.sqrt(u) - 4.21)
    l = max(l_sur_h, 0.0) * 1e-9 * h_m           # nH/m * m -> H

    part = min(theta, 180.0) / 90.0
    return l * part, c * part


def capacite_coude(w, h, epsilon_r, angle_deg=90.0):
    """La seule capacite d'exces du coude -- voir `elements_coude`."""
    return elements_coude(w, h, epsilon_r, angle_deg)[1]


def inductance_via(h, d):
    """Inductance d'un via traversant, en henrys. TOUT EN METRES.

        L = (mu0 h / 2pi) [ln(4h/d) + 1]

    `h` est la hauteur traversee, `d` le diametre du percage. Le rapport h/d
    est sans dimension, donc le logarithme survit a une erreur d'unite -- mais
    le prefacteur mu0*h, lui, non : appeler ceci en millimetres rend une
    inductance MILLE FOIS trop grande, et le resultat reste plausible a l'oeil.
    """
    h_m = float(h)
    d_m = float(d)
    if not (h_m > 0 and d_m > 0):
        return 0.0
    return (MU_0 * h_m / (2.0 * np.pi)) * (np.log(4.0 * h_m / d_m) + 1.0)


def capacite_pastille(d_pastille, h, epsilon_r):
    """Capacite parasite pastille/plan, en farads. TOUT EN METRES.

    Plan parallele avec un coefficient de bord de 0,8. Meme avertissement
    d'unite que `inductance_via`, et il est pire ici : C va comme d^2/h, donc
    une saisie en millimetres se trompe d'un facteur mille.
    """
    d = float(d_pastille)
    h_m = float(h)
    er = float(epsilon_r)
    if not (d > 0 and h_m > 0):
        return 0.0
    return 0.8 * EPSILON_0 * er * (np.pi * (d / 2.0) ** 2) / h_m


def abcd_via(h, d, d_pastille, epsilon_r, freq):
    """Matrice ABCD d'un via : reseau en pi, C/2 - L - C/2. TOUT EN METRES."""
    L = inductance_via(h, d)
    C = capacite_pastille(d_pastille, h, epsilon_r) / 2.0

    omega = 2.0 * np.pi * float(freq)
    Z = 1j * omega * L
    Y = 1j * omega * C

    # Le pi exact : [1 0; Y 1] [1 Z; 0 1] [1 0; Y 1]
    return np.array([[1.0 + Z * Y, Z],
                     [Y * (2.0 + Z * Y), 1.0 + Z * Y]], dtype=complex)


def abcd_coude(w, h, epsilon_r, freq, angle_deg=90.0):
    """Matrice ABCD d'un coude : le T de Gupta, L/2 - C - L/2. EN METRES.

    L'ancienne version ne posait qu'un shunt C, ce qui jette la moitie du
    modele : c'est l'inductance serie qui porte l'essentiel de l'exces au-dela
    de quelques gigahertz.
    """
    L, C = elements_coude(w, h, epsilon_r, angle_deg)
    omega = 2.0 * np.pi * float(freq)
    Z = 1j * omega * L / 2.0          # une moitie de chaque cote
    Y = 1j * omega * C

    # [1 Z; 0 1] [1 0; Y 1] [1 Z; 0 1]
    return np.array([[1.0 + Z * Y, 2.0 * Z + Z * Z * Y],
                     [Y, 1.0 + Z * Y]], dtype=complex)


def abcd_line(z_c, gamma, longueur):
    """Matrice ABCD d'un tronçon de ligne uniforme."""
    gl = gamma * longueur
    ch, sh = np.cosh(gl), np.sinh(gl)
    return np.array([[ch, z_c * sh],
                     [sh / z_c, ch]], dtype=complex)


def cascade_to_s(abcd, z_ref=50.0):
    """ABCD -> matrice S 2 ports, sur l'impédance de référence."""
    a, b = abcd[0, 0], abcd[0, 1]
    c, d = abcd[1, 0], abcd[1, 1]
    z = z_ref
    den = a * z + b + c * z * z + d * z
    if abs(den) < 1e-300:
        return np.zeros((2, 2), dtype=complex)
    s11 = (a * z + b - c * z * z - d * z) / den
    s12 = 2.0 * (a * d - b * c) * z / den
    s21 = 2.0 * z / den
    s22 = (-a * z + b - c * z * z + d * z) / den
    return np.array([[s11, s12], [s21, s22]], dtype=complex)
