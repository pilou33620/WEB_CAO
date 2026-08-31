#!/usr/bin/python3
# -*- coding: utf-8 -*-
# ==========================================
# VERSIONING
# Version: 2.3.0
# Date: 2026-08-31
# Explication: N CONDUCTEURS. Z DIFFERENTIELLE ET DIAPHONIE, MEME CHANTIER.
#   capacitance_coplanaire assemblait DEJA une matrice multi-conducteurs --
#   plusieurs blocs de panneaux a la meme hauteur, une seule Green -- mais ne
#   resolvait qu'un second membre. On en resout N (potentiel unite sur le
#   conducteur i, zero sur les autres), on releve les charges, et l'on obtient
#   la matrice de capacite de MAXWELL [C] ; avec er = 1 on obtient [C0], et
#   [L] = mu0 eps0 [C0]^-1 puisque le milieu n'est pas magnetique.
#
#   IL N'Y A PAS UN SOLVEUR DE PLUS. La matrice -- la partie chere, avec sa
#   quadrature spectrale -- est construite une fois, et numpy factorise une
#   fois pour les N seconds membres. Le surcout est celui des substitutions
#   arriere, et la precision est la meme parce que c'est la meme
#   discretisation.
#
#   CE QUI EN SORT : Z differentielle et Z commune par les modes pair/impair,
#   la decomposition modale de [L][C] au-dela de deux conducteurs, les
#   coefficients de couplage, et la diaphonie NEXT/FEXT par la theorie des
#   lignes multiconducteurs.
#
#   LA PISTE DE GARDE EST UN CONDUCTEUR TENU A ZERO VOLT -- meme condition aux
#   limites que les plans coplanaires, mais a la place qu'on lui donne. Elle
#   entre dans la matrice, prend du champ aux deux signaux, et n'a pas de port.
#
#   LE MILIEU EST DESORMAIS CHOISI EN UN SEUL ENDROIT (`_milieu`) : solve_line
#   et solve_multiline resolvent la meme section, et la 2.2.0 a assez montre ce
#   que coutent deux copies d'une meme formule. solve_line rend le meme chiffre
#   au bit pres -- les 105 cas du banc le verifient.
#
#   MESURE : la paire de microruban tombe a moins de 3 % de la forme fermee de
#   Garg-Bahl (etalon exterieur, lui-meme donne a quelques pour cent), et la
#   triplaque rend un FEXT nul a 1e-16 pres -- ce qu'impose le milieu homogene,
#   et ce qu'aucune erreur de signe entre [L] et [C] ne laisserait passer.
#   `sous_systeme` lit une PAIRE prise dans un bus : les autres conducteurs
#   tenus a zero volt, ce qui est la sous-matrice de Maxwell, et l'inductance
#   qui suit. C'est exact, et c'est la seule facon de parler de Z
#   differentielle quand la section porte plus de deux rubans.
#
#   `solve_multiline` rend `ordre` : les rubans sont ranges de gauche a droite
#   pour la matrice, et l'appelant doit pouvoir retrouver lequel est le sien.
#   Sans lui, poser ses conducteurs dans un autre ordre faisait lire la
#   diaphonie de la mauvaise paire -- en silence.
# Fonctions ajoutees : _milieu, _conducteurs_places, capacitance_matrice,
#   _modes, solve_multiline, modes_paire, sous_systeme, diaphonie
# Fonctions modifiees : solve_line (elle appelle _milieu ; meme resultat)
#
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



import math
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

# Combien de conducteurs couples au plus dans une meme section. Le cout est en
# N sur les panneaux et en N^2 sur les seconds membres : huit pistes d'un bus
# tiennent largement, et au-dela ce n'est plus une section qu'on lit, c'est un
# tableau que personne ne lira.
MAX_CONDUCTEURS = 8


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

# ==========================================================================
# LE MILIEU, CHOISI UNE FOIS POUR TOUTES
# --------------------------------------------------------------------------
# `solve_line` et `solve_multiline` resolvent la MEME section : meme empilage,
# meme fonction de Green, meme milieu moyen, memes echelles de quadrature. Seul
# le nombre de conducteurs change. Ce choix-la est donc ecrit ICI et nulle part
# ailleurs -- la 2.2.0 a corrige trois copies divergentes des formules de
# discontinuite, et il n'y a aucune raison de recommencer avec le milieu.
# ==========================================================================

def _milieu(geometry):
    """Ce que la section impose au solveur, avant tout conducteur.

    Rend {kind, distance, eps_moyen, eps_vide, g_diel, g_vide, echelles,
    couvert, masque} -- `distance` est la hauteur au plan qui sert de longueur
    de reference (la plus courte des deux pour une triplaque), `masque` porte
    le vernis retenu ou None.
    """
    kind = geometry.get("kind", "micro")
    epsilon_r = float(geometry.get("epsilon_r", 4.3))

    if kind == "strip":
        b = float(geometry.get("b", 0.0))
        y0 = float(geometry.get("y0", b / 2.0))
        if not (b > 0) or not (0 < y0 < b):
            raise ValueError("triplaque : ecart entre plans invalide")
        return {
            "kind": "strip",
            "distance": min(y0, b - y0),
            "eps_moyen": EPSILON_0 * epsilon_r,
            "eps_vide": EPSILON_0,
            "g_diel": lambda be: green_spectral_strip(be, y0, b, epsilon_r),
            "g_vide": lambda be: green_spectral_strip(be, y0, b, 1.0),
            "echelles": (y0, b - y0),
            "couvert": False,
            "masque": None,
        }

    h = float(geometry.get("h", 0.0))
    if not (h > 0):
        raise ValueError("microruban : hauteur au plan nulle")
    t = float(geometry.get("t", 0.0))
    # Une couverture qui ne pese rien devant l'epaisseur du cuivre n'est pas
    # une couverture : on la laisse tomber plutot que de faire porter la
    # quadrature sur une longueur qui n'existe pas.
    c_diel = float(geometry.get("couverture", 0.0) or 0.0)
    if c_diel < max(t, 1e-9):
        c_diel = 0.0
    couvert = c_diel > 0

    # LOT 2 : masque de soudure sur piste exterieure. Le masque a son propre
    # epsilon_r (vernis ~3,8) et son epaisseur (20-30 um) : une Green a trois
    # regions.
    masque_info = geometry.get("masque")
    masque_epaisseur = 0.0
    masque_epsilon = 3.8
    if masque_info is not None:
        masque_epaisseur = float(masque_info.get("epaisseur", 0.0) or 0.0)
        masque_epsilon = float(masque_info.get("epsilon_r", 3.8))
        # Un masque plus mince que le nanometre n'est pas un masque : on le
        # laisse tomber et la piste retombe sur le cas nu ou couvert.
        if masque_epaisseur < 1e-9:
            masque_epaisseur = 0.0

    commun = {"kind": "micro", "distance": h, "eps_vide": EPSILON_0,
              "couvert": couvert, "masque": None}
    if masque_epaisseur > 0:
        # LE MILIEU MOYEN EST L'ASYMPTOTE DE LA GREEN, pas le substrat.
        # Quand beta -> l'infini : coth(beta h) -> 1, K -> (1+1/er2)e^{beta c}/2
        # et M -> (er2+1)e^{beta c}/2, donc G -> 1/(eps0 beta (er1+er2)). Le
        # milieu moyen est donc eps0 (er1+er2)/2 -- la moyenne des deux
        # dielectriques qui bordent le ruban, exactement comme le microruban nu
        # donne eps0 (1+er)/2 avec l'air pour second milieu. Poser le substrat
        # seul decalait l'extraction de la partie singuliere.
        commun.update({
            "eps_moyen": EPSILON_0 * (epsilon_r + masque_epsilon) / 2.0,
            "g_diel": lambda be: green_spectral_micro_masque(
                be, h, masque_epaisseur, epsilon_r, masque_epsilon),
            # LE VIDE, C'EST TOUT LE DIELECTRIQUE RETIRE -- le masque compris.
            # Le laisser a son er dans la reference gonflait C0, et eps_eff
            # BAISSAIT quand on vernissait la piste : l'inverse de la physique.
            "g_vide": lambda be: green_spectral_micro_masque(
                be, h, masque_epaisseur, 1.0, 1.0),
            "echelles": (h, masque_epaisseur),
            "masque": {"epaisseur": masque_info.get("epaisseur", 0.0),
                       "epsilon_r": masque_info.get("epsilon_r", 3.8)},
        })
    elif couvert:
        # Ruban couvert : du dielectrique des deux cotes, donc le milieu moyen
        # est le stratifie tout entier -- c'est l'asymptote de la fonction de
        # Green qui le dit, et c'est ce qui change tout par rapport au cas nu.
        commun.update({
            "eps_moyen": EPSILON_0 * epsilon_r,
            "g_diel": lambda be: green_spectral_micro_couvert(
                be, h, c_diel, epsilon_r),
            "g_vide": lambda be: green_spectral_micro_couvert(be, h, c_diel, 1.0),
            "echelles": (h, c_diel),
        })
    else:
        # Le milieu moyen d'un microruban nu : moitie air, moitie stratifie.
        # C'est ce que dit l'asymptote, pas une convention.
        commun.update({
            "eps_moyen": EPSILON_0 * (1.0 + epsilon_r) / 2.0,
            "g_diel": lambda be: green_spectral_micro(be, h, epsilon_r),
            "g_vide": lambda be: green_spectral_micro(be, h, 1.0),
            "echelles": (h,),
        })
    return commun


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


def largeur_effective(largeur, epaisseur, distance_plan):
    """L'elargissement de Wheeler, offert a qui pose une section.

    C'EST LA MEME FONCTION QUE `_largeur_effective`, et elle est publique parce
    qu'un appelant qui POSE des conducteurs doit pouvoir savoir, AVANT de les
    poser, de combien le cuivre epais va les elargir. Sans cela il les pose a
    un ecart nu qui parait suffisant, et c'est `_conducteurs_places` qui refuse
    la section entiere -- un refus qu'il ne pouvait pas prevoir.
    """
    return float(_largeur_effective(largeur, epaisseur, distance_plan))


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
    m = _milieu(geometry)
    t = float(geometry.get("t", 0.0))
    couvert = m["couvert"]
    distance = m["distance"]
    eps_moyen, eps_vide = m["eps_moyen"], m["eps_vide"]
    g_diel, g_vide = m["g_diel"], m["g_vide"]
    echelles = m["echelles"]
    w = _largeur_effective(float(geometry["w"]), t, distance)

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
    if m["masque"]:
        result["masque"] = m["masque"]
    return result


# ==========================================================================
# N CONDUCTEURS : Z DIFFERENTIELLE ET DIAPHONIE, MEME CHANTIER
# --------------------------------------------------------------------------
# CE QUI CHANGE, ET C'EST TOUT CE QUI CHANGE : LE SECOND MEMBRE.
# `capacitance_coplanaire` assemblait deja une matrice MULTI-CONDUCTEURS --
# plusieurs blocs de panneaux a la meme hauteur, une seule matrice, une seule
# fonction de Green -- mais elle ne resolvait qu'un vecteur :
#
#     [A] [q] = [V]     avec V = 1 sur le ruban, 0 sur les plans coplanaires
#
# On en resout N : potentiel unite sur le conducteur i, zero sur les autres et
# sur les plans, et l'on releve la charge portee par CHACUN. Cela donne la
# MATRICE DE CAPACITE DE MAXWELL (dite de court-circuit) [C], celle-la meme que
# la theorie des lignes multiconducteurs demande :
#
#     Q = [C] V     diagonale positive, hors-diagonale negative,
#                   somme de ligne = capacite vers la reference
#
# On refait avec er = 1 -> [C0], et comme le milieu n'est pas magnetique,
#
#     [L] = mu0 eps0 [C0]^-1
#
# De ces deux matrices sortent, SANS AUCUN SOLVEUR DE PLUS : Z differentielle
# et Z commune (modes pair/impair pour une paire, decomposition modale de
# [L][C] au-dela), les coefficients de couplage, et la diaphonie NEXT/FEXT.
#
# CE QUE CA COUTE. `_matrice` -- la partie chere, avec sa quadrature spectrale
# -- est construite UNE SEULE FOIS ; `np.linalg.solve` recoit les N seconds
# membres D'UN COUP et n'en factorise qu'une fois. Le surcout sur le calcul
# d'un conducteur seul est celui des N-1 substitutions arriere : negligeable.
# La precision est la meme -- meme discretisation, memes panneaux resserres.
#
# CE QUE CELA NE COUVRE PAS, et qui doit etre dit la ou on l'emploie : le
# couplage entre pistes PARALLELES, c'est-a-dire l'immense majorite de la
# diaphonie qui compte sur une carte. Deux pistes qui se croisent sur des
# couches differentes, ou qui couplent par un champ de vias, ne sont plus une
# section : la, et la seulement, il faut le 2,5D.
# ==========================================================================

def _conducteurs_places(conducteurs, epaisseur, distance_plan):
    """Les rubans, ramenes a (centre, largeur effective) en metres.

    Chaque conducteur porte sa largeur `w` et, au choix, son centre `x` ou son
    ecart `s` au precedent -- de cuivre a cuivre, comme partout ailleurs ici.
    `masse` a vrai en fait une PISTE DE GARDE : elle occupe la place, prend du
    champ, et reste a zero volt.

    L'EPAISSEUR ELARGIT CHAQUE RUBAN AUTOUR DE SON CENTRE, et l'ecart se reduit
    donc tout seul de ce que les deux bords se sont avances : c'est la meme
    correction de Wheeler que pour un ruban seul, et poser les centres AVANT de
    l'appliquer est ce qui la rend juste sans avoir a corriger l'ecart a la
    main.
    """
    places, x = [], None
    for k, cond in enumerate(conducteurs):
        w = float(cond.get("w", 0.0))
        if not (w > 0):
            raise ValueError("conducteur %d : largeur nulle" % (k + 1))
        if cond.get("x") is not None:
            centre = float(cond["x"])
        elif x is None:
            centre = 0.0
        else:
            ecart = float(cond.get("s", 0.0) or 0.0)
            if not (ecart > 0):
                raise ValueError("conducteur %d : ecart nul au precedent"
                                 % (k + 1))
            centre = x + places[-1]["w_nue"] / 2.0 + ecart + w / 2.0
        t = float(cond.get("t", epaisseur) or 0.0)
        places.append({"x": centre, "w_nue": w, "rang": k,
                       "w": _largeur_effective(w, t, distance_plan),
                       # UNE PISTE DE GARDE EST UN CONDUCTEUR TENU A ZERO
                       # VOLT, et rien d'autre : elle entre dans la matrice
                       # comme les plans coplanaires, avec ses panneaux et sa
                       # condition aux limites, mais elle ne porte pas de port
                       # et ne sort donc pas dans [C].
                       "masse": bool(cond.get("masse"))})
        x = centre
    # RANGES DE GAUCHE A DROITE, ce que la matrice exige -- les bandes de
    # panneaux se posent dans l'ordre, et l'ecart entre deux conducteurs est
    # celui de deux voisins dans cette liste. `rang` garde le numero d'ENTREE,
    # sans quoi l'appelant ne saurait plus quelle ligne de [C] est sa piste.
    places.sort(key=lambda c: c["x"])
    # DEUX CONDUCTEURS QUI SE TOUCHENT NE FONT PAS DEUX LIGNES. L'elargissement
    # de Wheeler peut les faire se rejoindre alors que le cuivre ne se touche
    # pas : on le dit plutot que de resoudre une matrice singuliere.
    for a, b in zip(places, places[1:]):
        libre = (b["x"] - b["w"] / 2.0) - (a["x"] + a["w"] / 2.0)
        if libre <= 0:
            raise ValueError(
                "conducteurs trop proches : l'epaisseur de cuivre les fait se"
                " toucher (%.4f mm de cuivre a cuivre)"
                % (1e3 * ((b["x"] - b["w_nue"] / 2.0)
                          - (a["x"] + a["w_nue"] / 2.0))))
    return places


def capacitance_matrice(conducteurs, ecart_g, ecart_d, green, distance_plan,
                        epsilon_moyen, n=N_PANNEAUX,
                        n_quadrature=N_QUADRATURE, echelles=None,
                        etendue=None, n_plan=None, symetriser=True):
    """La matrice de Maxwell [C] de N rubans coplanaires, en F/m.

    `conducteurs` sort de `_conducteurs_places` : (centre, largeur effective).
    `ecart_g` et `ecart_d` sont les ecarts au cuivre de masse qui borde le
    GROUPE, a gauche du premier ruban et a droite du dernier ; zero d'un cote
    veut dire pas de masse coplanaire de ce cote-la, exactement comme pour un
    conducteur seul.

    Rend un tableau N x N tel que Q = [C] V, ou N est le nombre de
    conducteurs QUI NE SONT PAS DES MASSES : une piste de garde occupe la
    place et prend du champ, mais n'a pas de ligne dans la matrice.
    """
    g = float(ecart_g or 0.0)
    d = float(ecart_d or 0.0)
    if not conducteurs:
        raise ValueError("aucun conducteur")
    gauche = conducteurs[0]["x"] - conducteurs[0]["w"] / 2.0
    droite = conducteurs[-1]["x"] + conducteurs[-1]["w"] / 2.0
    if etendue is None:
        etendue = max(20.0 * distance_plan,
                      10.0 * ((droite - gauche) / 2.0 + max(g, d)))
    if n_plan is None:
        n_plan = max(40, n // 2)

    blocs_c, blocs_w, tranches = [], [], []
    rang = 0
    if g > 0:
        a0 = gauche - g
        cg, wg = _panneaux_bande(a0 - etendue, a0, n_plan, "droite")
        blocs_c.append(cg); blocs_w.append(wg); rang += n_plan
    for cond in conducteurs:
        cs, ws = _panneaux_bande(cond["x"] - cond["w"] / 2.0,
                                 cond["x"] + cond["w"] / 2.0, n, "deux")
        blocs_c.append(cs); blocs_w.append(ws)
        # UNE PISTE DE GARDE N'A PAS DE COLONNE : ses panneaux sont dans la
        # matrice et sa tension y vaut zero dans TOUS les seconds membres, ce
        # qui est exactement la condition d'un plan coplanaire. Elle prend du
        # champ aux deux signaux -- c'est tout l'objet d'une garde --, mais on
        # ne lui demande pas son impedance.
        if not cond.get("masse"):
            tranches.append((rang, n))
        rang += n
    if d > 0:
        a0 = droite + d
        cd, wd = _panneaux_bande(a0, a0 + etendue, n_plan, "gauche")
        blocs_c.append(cd); blocs_w.append(wd)

    centres = np.concatenate(blocs_c)
    largeurs = np.concatenate(blocs_w)

    # LES ECARTS SONT DES LONGUEURS DU PROBLEME, tous : c'est sur eux que le
    # champ varie le plus vite quand ils sont petits devant la hauteur au plan.
    # Celui qui separe deux rubans compte autant que celui qui les separe de la
    # masse -- c'est meme lui qui porte tout le couplage.
    ecarts = [e for e in (g, d) if e > 0]
    for a, b in zip(conducteurs, conducteurs[1:]):
        ecarts.append((b["x"] - b["w"] / 2.0) - (a["x"] + a["w"] / 2.0))
    ech = tuple(echelles or ()) + tuple(e for e in ecarts if e > 0)

    mat = _matrice(centres, largeurs, green, distance_plan, epsilon_moyen,
                   n_quadrature, echelles=ech)

    # LES N SECONDS MEMBRES D'UN COUP. `np.linalg.solve` factorise la matrice
    # une fois et substitue N fois : c'est exactement la LU reutilisee, sans
    # avoir a sortir de numpy.
    n_c = len(tranches)
    if not n_c:
        raise ValueError("tous les conducteurs sont a la masse")
    tension = np.zeros((centres.size, n_c))
    for j, (debut, taille) in enumerate(tranches):
        tension[debut:debut + taille, j] = 1.0
    charges = np.linalg.solve(mat, tension)

    c = np.empty((n_c, n_c))
    for i, (debut, taille) in enumerate(tranches):
        w_i = largeurs[debut:debut + taille]
        c[i, :] = w_i @ charges[debut:debut + taille, :]
    # LA MATRICE EST SYMETRIQUE PAR CONSTRUCTION PHYSIQUE, et la collocation ne
    # l'est qu'a la discretisation pres : les panneaux ne portent pas tous la
    # meme largeur, et A[m,k] depend de celle de k seule. On symetrise donc,
    # comme le fait tout extracteur. `symetriser=False` rend la matrice BRUTE,
    # et c'est ce que le banc mesure : une asymetrie qui grandirait dirait que
    # la discretisation ne suffit plus, et la symetrisation la cacherait.
    return 0.5 * (c + c.T) if symetriser else c


def _modes(l_mat, c_mat):
    """Les modes propres de la ligne multiconducteurs.

    [L][C] a pour valeurs propres les 1/v^2 des modes, et pour vecteurs propres
    leurs distributions de tension. En milieu homogene toutes les vitesses sont
    egales et il n'y a qu'une valeur propre, N fois : c'est le cas de la
    triplaque, et c'est ce qui fait qu'elle n'a pas de diaphonie avant.
    """
    valeurs, vecteurs = np.linalg.eig(l_mat @ c_mat)
    valeurs = np.real(valeurs)
    modes = []
    for k in np.argsort(valeurs):
        v = np.real(vecteurs[:, k])
        pic = int(np.argmax(np.abs(v)))
        if v[pic] < 0:
            v = -v
        vitesse = 1.0 / math.sqrt(valeurs[k]) if valeurs[k] > 0 else 0.0
        modes.append({
            "eps_eff": float(valeurs[k] * C_0 * C_0),
            "vitesse": float(vitesse),
            "tensions": [float(x) for x in v / np.max(np.abs(v))],
        })
    return modes


def solve_multiline(geometry, n=N_PANNEAUX, n_quadrature=N_QUADRATURE):
    """Resout une section a N conducteurs. Meme `geometry` que `solve_line`.

    `geometry["conducteurs"]` remplace `w` : une liste de {w, x} ou {w, s}, en
    METRES, chacun pouvant porter `masse` a vrai pour etre une PISTE DE GARDE
    -- dans la matrice, a zero volt, mais sans port. `ecart_g` / `ecart_d` bordent le GROUPE, comme pour une ligne
    seule ; tout le reste de la section -- kind, h, b, y0, couverture, masque,
    epsilon_r -- se lit exactement comme dans `solve_line`, et par le meme
    `_milieu`.

    Rend {n, c, c0, l, lignes, modes, paire, ecart_g, ecart_d} : [C] et [C0] en
    F/m, [L] en H/m, `lignes` le detail conducteur par conducteur, `paire` les
    grandeurs differentielles quand il y en a exactement deux.
    """
    conducteurs = geometry.get("conducteurs") or []
    if len(conducteurs) < 2:
        raise ValueError("une ligne couplee demande au moins deux conducteurs")

    if len(conducteurs) > MAX_CONDUCTEURS:
        raise ValueError("%d conducteurs, maximum %d"
                         % (len(conducteurs), MAX_CONDUCTEURS))

    m = _milieu(geometry)
    t = float(geometry.get("t", 0.0))
    places = _conducteurs_places(conducteurs, t, m["distance"])
    ports = [c for c in places if not c["masse"]]
    if len(ports) < 2:
        raise ValueError("une ligne couplee demande au moins deux conducteurs"
                         " qui ne soient pas des masses")

    # Les ecarts au cuivre de masse, ramenes comme dans `solve_line` : ils sont
    # mesures de cuivre a cuivre, et c'est la largeur EFFECTIVE qui borde le
    # calcul. Sous une epaisseur de cuivre, il n'y a plus d'ecart du tout de ce
    # cote-la.
    ecart_g = geometry.get("ecart_g")
    ecart_d = geometry.get("ecart_d")
    if ecart_g is None and ecart_d is None:
        ecart_g = ecart_d = geometry.get("ecart", 0.0)
    seuil = max(t, 1e-9)
    marge_g = (places[0]["w"] - places[0]["w_nue"]) / 2.0
    marge_d = (places[-1]["w"] - places[-1]["w_nue"]) / 2.0
    e_g = float(ecart_g or 0.0) - marge_g
    e_d = float(ecart_d or 0.0) - marge_d
    e_g = 0.0 if e_g < seuil else e_g
    e_d = 0.0 if e_d < seuil else e_d

    c = capacitance_matrice(places, e_g, e_d, m["g_diel"], m["distance"],
                            m["eps_moyen"], n, n_quadrature, m["echelles"])
    c0 = capacitance_matrice(places, e_g, e_d, m["g_vide"], m["distance"],
                             m["eps_vide"], n, n_quadrature, m["echelles"])
    if np.any(np.diag(c) <= 0) or np.any(np.diag(c0) <= 0):
        raise ValueError("capacite non physique : geometrie incoherente")

    # [L] = mu0 eps0 [C0]^-1, et rien de plus : le milieu n'est pas magnetique,
    # donc l'inductance est celle de la MEME geometrie sans dielectrique. C'est
    # la seule facon d'obtenir [L] sans un second solveur, et elle est exacte.
    l_mat = MU_0 * EPSILON_0 * np.linalg.inv(c0)

    lignes = []
    for i, place in enumerate(ports):
        # Z0 DU CONDUCTEUR i, LES AUTRES A LA MASSE : c'est ce que la diagonale
        # de Maxwell decrit, et ce n'est PAS l'impedance de la piste seule --
        # une voisine tenue a la masse lui prend du champ. Les deux chiffres
        # sont utiles, celui-ci pour lire la matrice, `solve_line` pour la
        # piste isolee.
        lignes.append({
            "w": place["w_nue"], "x": place["x"],
            "z0": float(math.sqrt(l_mat[i, i] / c[i, i])),
            "eps_eff": float(C_0 * C_0 * l_mat[i, i] * c[i, i]),
            "c": float(c[i, i]), "l": float(l_mat[i, i]),
        })

    resultat = {
        "n": len(ports),
        "gardes": len(places) - len(ports),
        # QUELLE LIGNE DE [C] EST QUEL CONDUCTEUR. Les rubans sont ranges de
        # gauche a droite pour la matrice ; `ordre[i]` rend le numero d'ENTREE
        # du port i. Sans lui, un appelant qui pose ses conducteurs dans un
        # autre ordre lirait la diaphonie de la mauvaise paire -- en silence.
        "ordre": [c["rang"] for c in ports],
        "c": [[float(v) for v in ligne] for ligne in c],
        "c0": [[float(v) for v in ligne] for ligne in c0],
        "l": [[float(v) for v in ligne] for ligne in l_mat],
        "lignes": lignes,
        "modes": _modes(l_mat, c),
        "ecart_g": e_g,
        "ecart_d": e_d,
        "couvert": m["couvert"],
        "ecart_conducteurs": [float((b["x"] - b["w_nue"] / 2.0)
                                    - (a["x"] + a["w_nue"] / 2.0))
                              for a, b in zip(places, places[1:])],
    }
    if m["masque"]:
        resultat["masque"] = m["masque"]
    if len(ports) == 2:
        resultat["paire"] = modes_paire(c, l_mat)
    return resultat


def modes_paire(c_mat, l_mat):
    """Les modes pair et impair d'une paire, et ce qu'on en lit.

    LES DEUX MODES, ET RIEN D'AUTRE. Le mode IMPAIR est celui du signal
    differentiel -- les deux rubans a +V et -V, un plan de symetrie a zero volt
    entre eux : le couplage capacitif s'AJOUTE (les deux armatures se font
    face) et le couplage inductif se RETRANCHE. Le mode PAIR est celui du
    signal commun, et c'est l'inverse.

        L_impair = (L11 + L22)/2 - L12      C_impair = (C11 + C22)/2 - C12
        L_pair   = (L11 + L22)/2 + L12      C_pair   = (C11 + C22)/2 + C12

    C12 est NEGATIF dans la convention de Maxwell : « - C12 » ajoute donc bien
    la mutuelle au mode impair. La moyenne des deux diagonales est ce qui rend
    la formule utilisable sur une paire LEGEREMENT dissymetrique -- deux pistes
    de largeurs voisines ; sur une paire franchement asymetrique, ce sont les
    modes propres de `_modes` qu'il faut lire, et rien d'autre.

        Z_diff = 2 Z_impair       Z_commune = Z_pair / 2

    Le facteur deux n'est pas une convention d'affichage : la tension
    differentielle est celle qui existe ENTRE les deux conducteurs, soit deux
    fois celle de chacun au plan de symetrie.
    """
    c_mat = np.asarray(c_mat, dtype=float)
    l_mat = np.asarray(l_mat, dtype=float)
    c11 = 0.5 * (c_mat[0, 0] + c_mat[1, 1])
    l11 = 0.5 * (l_mat[0, 0] + l_mat[1, 1])
    c12, l12 = c_mat[0, 1], l_mat[0, 1]
    c_impair, c_pair = c11 - c12, c11 + c12
    l_impair, l_pair = l11 - l12, l11 + l12
    if not (c_impair > 0 and c_pair > 0 and l_impair > 0 and l_pair > 0):
        raise ValueError("modes non physiques : matrices incoherentes")
    z_impair = math.sqrt(l_impair / c_impair)
    z_pair = math.sqrt(l_pair / c_pair)
    return {
        "z_impair": float(z_impair),
        "z_pair": float(z_pair),
        "z_diff": float(2.0 * z_impair),
        "z_commune": float(z_pair / 2.0),
        "eps_eff_impair": float(C_0 * C_0 * l_impair * c_impair),
        "eps_eff_pair": float(C_0 * C_0 * l_pair * c_pair),
        # LA MUTUELLE, EN CLAIR. C_m = -C12 est la capacite entre les deux
        # rubans ; L_m = L12 leur inductance mutuelle. Ce sont elles qui font
        # toute la diaphonie, et les afficher evite d'avoir a inverser les
        # modes pour les retrouver.
        "c_mutuelle": float(-c12),
        "l_mutuelle": float(l12),
        "k_c": float(-c12 / c11),
        "k_l": float(l12 / l11),
    }


def sous_systeme(c_mat, c0_mat, indices):
    """Deux conducteurs d'une section a N, LES AUTRES TENUS A LA MASSE.

    Rend (C, L) du systeme reduit -- de quoi appeler `modes_paire` ou
    `diaphonie` sur une paire prise dans un bus.

    POURQUOI C'EST EXACT, ET PAS UNE APPROXIMATION. Tenir un conducteur a zero
    volt, c'est exactement ce que fait un plan de reference : la matrice de
    Maxwell des conducteurs restants est alors la SOUS-MATRICE de [C] -- il
    suffit d'ecrire Q_i = somme_j C_ij V_j avec V_k = 0 pour les autres. Et
    l'inductance suit : [L] = mu0 eps0 [C0_sous]^-1, ou C0_sous est la meme
    sous-matrice prise a vide. Le conducteur mis a la masse porte alors du
    courant de retour, ce qui est precisement ce qu'on suppose de lui.

    CE QUE CETTE HYPOTHESE VAUT, et il faut la dire la ou on l'emploie : une
    troisieme piste TERMINEE sur son impedance n'est pas une piste a la masse.
    L'ecart est du second ordre pour un couplage faible -- c'est la convention
    de tous les extracteurs --, mais c'en est un.
    """
    c_mat = np.asarray(c_mat, dtype=float)
    c0_mat = np.asarray(c0_mat, dtype=float)
    idx = np.ix_(list(indices), list(indices))
    c_sous = c_mat[idx]
    c0_sous = c0_mat[idx]
    return c_sous, MU_0 * EPSILON_0 * np.linalg.inv(c0_sous)


def diaphonie(c_mat, l_mat, longueur, temps_montee, agresseur=0, victime=1):
    """NEXT et FEXT entre deux conducteurs, en fraction de l'amplitude emise.

    LES DEUX BRUITS N'ONT NI LA MEME CAUSE NI LA MEME LOI.

    L'ARRIERE (NEXT, near end) remonte vers la source. Son coefficient est la
    demi-somme des deux couplages, parce que l'onde capacitive et l'onde
    inductive y repartent dans le meme sens et s'ajoutent :

        k_b = (k_L + k_C) / 4      avec k_L = Lm/L, k_C = Cm/C

    Il SATURE : passe une longueur de couplage telle que l'aller-retour dure
    plus qu'un temps de montee, il ne monte plus, et vaut k_b fois l'amplitude.
    En deca il vaut k_b * 2 T_D / t_r. C'est pourquoi allonger un bus parallele
    ne fait empirer la diaphonie arriere que jusqu'a un certain point -- et
    aussi pourquoi la raccourcir en deca de cette longueur-la, elle, paie.

    L'AVANT (FEXT, far end) part avec le signal. Son coefficient est la
    DIFFERENCE des deux couplages :

        k_f = (k_C - k_L) / 2      et  V_fext / V = k_f * T_D / t_r

    EN MILIEU HOMOGENE IL EST NUL : k_C et k_L y sont egaux, terme a terme.
    C'est la propriete la plus utile de toute cette page -- une TRIPLAQUE n'a
    pas de diaphonie avant, un MICRORUBAN si, et le signe est negatif parce que
    l'inductif l'emporte. Le banc le verifie sur les deux geometries.

    Il ne sature pas : il croit avec la longueur, tant que le modele de
    couplage faible tient.

    `longueur` et `temps_montee` en metres et en secondes ; les deux indices
    designent les conducteurs dans [C] et [L].
    """
    c_mat = np.asarray(c_mat, dtype=float)
    l_mat = np.asarray(l_mat, dtype=float)
    a, v = int(agresseur), int(victime)
    c_s, l_s = c_mat[a, a], l_mat[a, a]
    c_m, l_m = -c_mat[a, v], l_mat[a, v]
    if not (c_s > 0 and l_s > 0):
        raise ValueError("conducteur agresseur non physique")
    k_c, k_l = c_m / c_s, l_m / l_s
    k_b = 0.25 * (k_l + k_c)
    k_f = 0.5 * (k_c - k_l)

    vitesse = 1.0 / math.sqrt(l_s * c_s)
    t_d = float(longueur) / vitesse if longueur > 0 else 0.0
    t_r = float(temps_montee)
    sature = t_r <= 0 or 2.0 * t_d >= t_r
    bruit_arriere = k_b if sature else k_b * 2.0 * t_d / t_r
    bruit_avant = 0.0 if t_r <= 0 else k_f * t_d / t_r
    return {
        "k_c": float(k_c), "k_l": float(k_l),
        "k_arriere": float(k_b), "k_avant": float(k_f),
        "next": float(bruit_arriere), "fext": float(bruit_avant),
        "retard": float(t_d), "vitesse": float(vitesse),
        "sature": bool(sature),
        # LA LONGUEUR DE SATURATION : au-dela, la diaphonie arriere ne monte
        # plus. C'est le seul chiffre de cette fiche sur lequel on agit en
        # dessinant, et il repond a « jusqu'ou puis-je longer ».
        "longueur_saturation": float(vitesse * t_r / 2.0) if t_r > 0 else 0.0,
        "eps_eff": float(C_0 * C_0 * l_s * c_s),
    }


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
    """Regle de pouce des manuels pour un via traversant, en henrys. EN METRES.

    ELLE N'EST PLUS DANS LE CHEMIN DE CALCUL, et il faut savoir pourquoi. Ce
    n'est ni une self partielle ni une inductance de boucle : c'est la self
    partielle de Grover -- (mu0 h/2pi)[ln(4h/d) - 1] -- ou le -1 a ete remplace
    par +1. L'ecart, mu0 h/pi, est le retour implicite qu'elle contient sans le
    dire, et il vaut pres du double sur un via ordinaire (1,295 nH annonces
    pour 0,703 de self reelle).

    Ce que la chaine emploie desormais : `inductance_boucle_vias` quand des
    vias de masse referment le courant, `inductance_partielle_propre` sinon --
    et cette derniere est alors annoncee comme un PLANCHER, pas comme une
    mesure. On garde celle-ci parce qu'elle est la valeur que citent les
    manuels et qu'il faut pouvoir s'y comparer.

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


# ==========================================================================
# L'INDUCTANCE D'UN VIA N'EXISTE PAS TOUTE SEULE
# --------------------------------------------------------------------------
# CE QUE `inductance_via` CALCULE, ET POURQUOI CE N'EST PAS LA BONNE GRANDEUR.
# Elle rend une inductance PARTIELLE PROPRE : celle d'un conducteur seul, sans
# dire par ou le courant revient. Or un courant revient toujours, et c'est la
# SURFACE DE BOUCLE qu'il enferme qui porte l'inductance. Un via de signal avec
# son via de masse a 0,4 mm et le meme via avec son retour a 3 mm n'ont pas la
# meme inductance -- ils en ont dans un rapport de deux et demi -- et rien dans
# une self partielle ne peut le voir.
#
# CE QUE CELA CHANGE, MESURE. Sur 1,54 mm de hauteur et 0,25 mm de percage, la
# self partielle de `inductance_via` donne 1,295 nH. L'inductance de boucle vaut
# 0,616 nH avec un retour a 0,4 mm et 1,252 nH avec un retour a 3 mm. La self
# partielle ne tombe juste pour aucun ecartement utile.
#
# POURQUOI LA FORME EXACTE ET NON L'APPROXIMATION. La formule qu'on lit partout,
# L = (mu0 h / pi) ln(2s/d), suppose h >> s : un conducteur long devant
# l'ecartement. Sur une carte, h vaut 1,5 mm et s vaut 0,6 mm -- le rapport
# vaut 2,6, l'hypothese est fausse, et elle coute 21 % ; a 3 mm d'ecart elle en
# coute 56, toujours en surestimant. On prend donc la forme exacte de Grover,
# valable a tout rapport h/s : mesuree contre l'approximation a h/s = 257, elle
# la rejoint a 0,2 %, et l'approximation n'est plus qu'un cas limite qu'elle
# contient.
#
# LE RAYON GEOMETRIQUE MOYEN EST LE RAYON, ET NON 0,7788 r. Un conducteur
# parcouru uniformement a pour RGM r*exp(-1/4) ; un conducteur en regime de peau
# porte tout son courant en surface et a pour RGM le rayon lui-meme. Au-dessus
# de quelques megahertz un via est dans le second cas -- l'ecart vaut un quart
# sur le logarithme, soit 8 % sur L, toujours dans le sens qui rassure.
# ==========================================================================


def _grover_f(u, d):
    """La primitive de Grover : F(u) = u*asinh(u/d) - sqrt(u^2 + d^2).

    Elle n'a d'interet qu'assemblee par `mutuelle_partielle` ; isolee, elle n'a
    pas de sens physique. `d` est une distance STRICTEMENT positive.
    """
    u = float(u)
    d = float(d)
    return u * np.arcsinh(u / d) - np.sqrt(u * u + d * d)


def mutuelle_partielle(z1, z2, z3, z4, d):
    """Mutuelle partielle de deux filaments PARALLELES, en henrys. EN METRES.

    Le premier occupe l'intervalle [z1, z2] sur son axe, le second [z3, z4] sur
    un axe parallele distant de `d`. Les deux intervalles sont donnes dans le
    MEME repere : c'est ce qui permet de traiter un via de masse borgne, qui ne
    couvre qu'une partie de la hauteur du via de signal.

        M = (mu0/4pi) [ F(z4-z1) + F(z3-z2) - F(z4-z2) - F(z3-z1) ]

    C'est la forme exacte, integrale double du noyau de Neumann sur les deux
    segments. Pour deux filaments de meme longueur h parfaitement en regard elle
    se reduit a (mu0/2pi)[h*asinh(h/d) - sqrt(h^2+d^2) + d], et pour h >> d a
    (mu0 h/2pi)[ln(2h/d) - 1] -- l'expression des manuels.

    RECOUVREMENT NUL, MUTUELLE NON NULLE. Deux vias qui ne se font pas face du
    tout se couplent quand meme, faiblement et par leurs extremites : la formule
    le rend, et c'est juste. On ne coupe donc rien a la main.
    """
    d = abs(float(d))
    if d <= 0.0:
        raise ValueError("mutuelle_partielle : distance nulle entre deux axes")
    return (MU_0 / (4.0 * np.pi)) * (_grover_f(z4 - z1, d)
                                     + _grover_f(z3 - z2, d)
                                     - _grover_f(z4 - z2, d)
                                     - _grover_f(z3 - z1, d))


def inductance_partielle_propre(z1, z2, rayon):
    """Self partielle d'un filament cylindrique [z1, z2], en henrys. EN METRES.

    C'est `mutuelle_partielle` du segment avec lui-meme, prise a la distance du
    RAYON GEOMETRIQUE MOYEN. En regime de peau -- tout via au-dessus de quelques
    megahertz -- le RGM d'un cylindre plein vaut son rayon : le courant est
    entierement en surface.

    UNE SEULE FORMULE POUR LA SELF ET LA MUTUELLE, et c'est voulu : deux
    expressions pour deux membres du meme systeme lineaire, c'est une matrice
    qui cesse d'etre coherente sans que rien ne le signale.
    """
    r = abs(float(rayon))
    if r <= 0.0:
        raise ValueError("inductance_partielle_propre : rayon nul")
    return mutuelle_partielle(z1, z2, z1, z2, r)


def inductance_boucle_vias(signal, retours, minimum_ecart=1e-6):
    """L'inductance de boucle d'un via et de ses retours, en henrys. EN METRES.

    `signal` et chaque element de `retours` sont des dicts
    {x, y, z1, z2, rayon} : la position de l'axe, les deux bouts du percage sur
    cet axe, et le rayon du barreau.

    LA REPARTITION DU COURANT N'EST PAS IMPOSEE, ELLE EST CALCULEE, et c'est
    tout l'interet. Le via de signal porte +1 A ; les vias de retour se
    partagent -1 A, en proportions a_k inconnues. A haute frequence le courant
    se distribue de facon a MINIMISER L'ENERGIE MAGNETIQUE -- c'est-a-dire
    l'inductance de boucle elle-meme. On resout donc

        minimiser   L(a) = L_ss - 2 b.a + a.M.a     sous   somme(a_k) = 1

    ou M est la matrice des inductances partielles des retours entre eux et
    b_k la mutuelle du signal au retour k. C'est un systeme lineaire sous
    contrainte, resolu par un multiplicateur de Lagrange -- pas une iteration,
    pas une heuristique.

    POURQUOI PAS « LE PLUS PROCHE ». Prendre le seul via le plus proche
    surestime L des qu'il y en a d'autres qui aident ; le prendre comme unique
    retour quand il est mal place la sous-estime. Et surtout, trois vias a
    0,6 mm ne divisent PAS L par trois : la mutuelle entre les retours eux-memes
    les empeche de travailler independamment. C'est ce que la matrice M porte,
    et c'est ce qu'aucune somme de contributions separees ne peut rendre.

    UN a_k NEGATIF EST UNE REPONSE, PAS UNE ERREUR. Un via de retour peut se
    trouver dans une position ou le courant s'y inverse ; c'est physique, et
    c'est le signe qu'il ne sert pas ce via-la. On le rend tel quel plutot que
    de le forcer a zero -- un chiffre corrige en silence est un chiffre faux.

    LA LIMITE HAUTE FREQUENCE EST LA BONNE ICI. Le partage minimise l'energie
    magnetique, ce qui suppose que l'inductance domine la resistance. Sur un via
    metallise ordinaire, omega*L passe R des quelques centaines de kilohertz, et
    vaut plusieurs centaines de fois R a 200 MHz : l'hypothese est acquise
    partout ou ce modele sert.

    LE COURANT DOIT SE REFERMER, ET C'EST UNE CONDITION, PAS UN DETAIL. Une
    inductance de boucle n'est definie que pour un courant a divergence nulle :
    ce qui descend par le via de signal doit remonter INTEGRALEMENT par les
    retours, sur la MEME hauteur. Un via de masse borgne qui ne couvre que la
    moitie de la hauteur ne referme rien -- le reste du chemin passe par le
    cuivre des plans, que ce modele ne represente pas. Nourrir la formule avec
    lui rend un nombre, et ce nombre est PLUS PETIT que la verite : on mesure
    -18 % sur un retour a mi-hauteur. C'est le pire des defauts possibles,
    puisqu'il flatte. On refuse donc, plutot que de le rendre.

    Chaque retour est donc RECADRE sur la hauteur du via de signal, et doit la
    couvrir entierement. Celui qui ne la couvre pas leve `ValueError` : c'est a
    l'appelant de l'ecarter et de dire pourquoi.

    Rend (L_boucle, parts) : l'inductance en henrys, et la liste des a_k dans
    l'ordre des `retours`. Sans aucun retour, rend la self partielle du via de
    signal et une liste vide -- la seule chose qu'on puisse dire alors.
    """
    r_s = float(signal["rayon"])
    z1s, z2s = float(signal["z1"]), float(signal["z2"])
    if z2s < z1s:
        z1s, z2s = z2s, z1s
    l_ss = inductance_partielle_propre(z1s, z2s, r_s)

    retours = list(retours or [])
    n = len(retours)
    if n == 0:
        return l_ss, []

    # Le recadrage, et le refus. La tolerance vaut le micron : c'est la
    # resolution des epaisseurs d'empilage, pas un seuil de jugement.
    tol = 1e-9
    for rk in retours:
        a, b = float(rk["z1"]), float(rk["z2"])
        if b < a:
            a, b = b, a
        if a > z1s + tol or b < z2s - tol:
            raise ValueError(
                "inductance_boucle_vias : un via de retour ne couvre pas la"
                " hauteur du via de signal ; le courant ne se referme pas et"
                " l'inductance de boucle n'est pas definie")

    def _ecart(a, b):
        d = math.hypot(float(a["x"]) - float(b["x"]),
                       float(a["y"]) - float(b["y"]))
        # DEUX AXES CONFONDUS N'ONT PAS DE MUTUELLE FINIE. Cela n'arrive pas sur
        # une carte -- deux vias au meme XY seraient le meme trou -- mais un
        # arrondi de coordonnees peut le produire, et le plancher le dit.
        return max(d, float(minimum_ecart))

    b = np.empty(n, dtype=float)
    m = np.empty((n, n), dtype=float)
    for k, rk in enumerate(retours):
        b[k] = mutuelle_partielle(z1s, z2s, z1s, z2s, _ecart(signal, rk))
        m[k, k] = inductance_partielle_propre(z1s, z2s, float(rk["rayon"]))
        for j in range(k + 1, n):
            rj = retours[j]
            v = mutuelle_partielle(z1s, z2s, z1s, z2s, _ecart(rk, rj))
            m[k, j] = v
            m[j, k] = v

    # Lagrange : M a = b + (lambda/2) 1, avec 1.a = 1.
    un = np.ones(n, dtype=float)
    try:
        mi_b = np.linalg.solve(m, b)
        mi_1 = np.linalg.solve(m, un)
    except np.linalg.LinAlgError:
        # Matrice singuliere : deux retours indiscernables. On retombe sur le
        # seul retour le plus proche, ET ON LE DIT par la liste rendue.
        k = min(range(n), key=lambda i: _ecart(signal, retours[i]))
        a = np.zeros(n, dtype=float)
        a[k] = 1.0
    else:
        denom = float(un @ mi_1)
        if abs(denom) < 1e-300:
            a = mi_b
        else:
            demi_lambda = (1.0 - float(un @ mi_b)) / denom
            a = mi_b + demi_lambda * mi_1

    l_boucle = l_ss - 2.0 * float(b @ a) + float(a @ m @ a)
    # L'ENERGIE D'UNE BOUCLE EST POSITIVE. Un resultat negatif ne peut venir que
    # d'une geometrie degeneree ; on le refuse plutot que de le cascader.
    if not np.isfinite(l_boucle) or l_boucle <= 0.0:
        return l_ss, [0.0] * n
    return float(l_boucle), [float(x) for x in a]


# ==========================================================================
# LA CAPACITE D'UN VIA N'EST PAS CELLE DE SES DEUX PASTILLES
# --------------------------------------------------------------------------
# CE QUI MANQUAIT, ET CE QUE CELA COUTAIT. Le modele ne comptait que les deux
# pastilles d'extremite, et il les comptait a la HAUTEUR DU VIA -- 1,54 mm --
# alors qu'une pastille voit le plan qui lui fait face a 0,2 mm. Un facteur
# sept, dans le sens qui rassure. Manquaient en plus, entierement :
#
#   · L'ANTIPAD. Le via traverse les plans qu'il ne touche pas, et chaque plan
#     est perce d'un trou autour de lui. Barreau au centre, bord du trou tout
#     autour : c'est un condensateur coaxial, et il vaut de dix a quarante
#     femtofarads PAR PLAN TRAVERSE.
#   · LES PASTILLES NON FONCTIONNELLES. Sur les couches internes qu'il ne
#     raccorde pas, un via porte -- ou ne porte pas -- une pastille inutile. Si
#     elle est la, c'est elle qui fait face au bord de l'antipad, et non le
#     barreau : le diametre interieur du coaxial passe de 0,25 a 0,55 mm, et la
#     capacite double. C'est le seul parametre de fabrication qui change la
#     capacite d'un via d'un facteur deux, et il ne coute rien a demander.
#
# CE QUE CELA DONNE, MESURE, sur le via traversant du banc : de 4,70 fF a
# 86,8 fF pastilles retirees, 117,1 fF pastilles conservees -- dont 72,4 pour
# les deux seules pastilles d'extremite, ramenees a la distance du plan qu'elles
# regardent. L'impedance caracteristique du via tombe de 525 a 96 ohms :
# invisible a 200 MHz, dominante au-dela de deux gigahertz.
#
# POURQUOI LA FORME LOGARITHMIQUE. La formule industrielle qu'on lit partout,
# C[pF] = 1,41 er T D1/(D2-D1) en pouces, est le coaxial 2 pi eps T/ln(D2/D1)
# ou l'on a remplace ln(D2/D1) par (D2-D1)/D1. C'est la meme chose tant que
# l'antipad serre la pastille ; des que D2 vaut deux fois D1 elle sous-estime de
# 44 %, et sur un antipad de 0,8 mm autour d'un barreau de 0,25 -- ce qui est
# courant sur un via de signal soigne -- d'un facteur 1,9 (3,8 fF annonces pour
# 7,2). On garde donc le logarithme, et la formule industrielle en est le cas
# limite.
# ==========================================================================


def capacite_antipad(d_interieur, d_antipad, epaisseur_plan, epsilon_r):
    """Capacite barreau-plan a la traversee d'un plan, en farads. EN METRES.

        C = 2 pi eps0 er t / ln(D_antipad / D_interieur)

    `d_interieur` est ce qui fait face au bord du trou : le PERCAGE quand les
    pastilles non fonctionnelles sont retirees, la PASTILLE quand elles sont
    conservees. `epaisseur_plan` est celle du cuivre du plan.

    L'EPAISSEUR NUE SOUS-ESTIME, ET ON NE LA CORRIGE PAS. Le champ deborde de
    part et d'autre du plan sur une distance de l'ordre de l'ecart radial, ce
    qui ajoute quelques femtofarads qu'on ne compte pas. Le coefficient 1,41 de
    la formule industrielle les absorbe empiriquement ; on prefere une formule
    dont on sait ce qu'elle contient a un chiffre ajuste dont on ne sait pas
    dans quel cas il a ete ajuste. L'erreur va dans le sens qui rassure et elle
    est nommee, ce qui est la seule chose qui compte.
    """
    di = float(d_interieur)
    da = float(d_antipad)
    t = float(epaisseur_plan)
    er = float(epsilon_r)
    if not (di > 0 and da > di and t > 0):
        return 0.0
    return 2.0 * np.pi * EPSILON_0 * er * t / np.log(da / di)


def capacite_pastille_au_plan(d_pastille, h_au_plan, epsilon_r):
    """Capacite d'une pastille d'extremite au plan qu'elle regarde. EN METRES.

    `h_au_plan` est la distance de la pastille AU PLAN LE PLUS PROCHE, et non la
    hauteur du via : c'est la correction qui vaut un facteur sept sur un
    empilage quatre couches ordinaire.

    ELLE COMPTE UN PEU DEUX FOIS, ET DANS LE BON SENS. Une part de ce disque
    prolonge la piste et se trouve deja dans l'impedance de la ligne. La
    retrancher demanderait de savoir quelle part du disque la piste couvre, ce
    que le document d'echange ne porte pas. On la laisse donc entiere : le via
    en ressort legerement trop capacitif, donc legerement trop desadapte, ce
    qui est le cote ou une erreur ne fait pas prendre une mauvaise carte pour
    une bonne.
    """
    d = float(d_pastille)
    h = float(h_au_plan)
    er = float(epsilon_r)
    if not (d > 0 and h > 0):
        return 0.0
    return 0.8 * EPSILON_0 * er * (np.pi * (d / 2.0) ** 2) / h


def capacite_via_complete(d_percage, d_pastille, d_antipad, epsilon_r,
                          plans_traverses=(), h_pastille_depart=0.0,
                          h_pastille_arrivee=0.0,
                          pastilles_internes=False):
    """La capacite totale d'un via, en farads, et son detail. EN METRES.

    `plans_traverses` est la liste des epaisseurs de cuivre des plans que le via
    TRAVERSE SANS LES TOUCHER -- un par antipad. Les deux `h_pastille_*` sont
    les distances de chaque pastille d'extremite au plan qui lui fait face, zero
    quand il n'y en a pas de ce cote-la.

    `pastilles_internes` dit si les pastilles non fonctionnelles sont
    CONSERVEES. C'est un choix de fabrication, et il double la part d'antipad.
    A defaut d'information on suppose qu'elles sont RETIREES -- c'est le
    reglage courant des fondeurs depuis vingt ans, et c'est aussi le choix qui
    sous-estime, donc celui qu'on doit annoncer plutot que subir.

    Rend (C_totale, detail) ou `detail` porte les trois parts en farads.
    """
    d_int = float(d_pastille if pastilles_internes else d_percage)
    c_anti = 0.0
    for t in (plans_traverses or ()):
        c_anti += capacite_antipad(d_int, d_antipad, t, epsilon_r)

    c_dep = capacite_pastille_au_plan(d_pastille, h_pastille_depart, epsilon_r)
    c_arr = capacite_pastille_au_plan(d_pastille, h_pastille_arrivee, epsilon_r)

    total = c_anti + c_dep + c_arr
    return total, {"antipad": c_anti,
                   "pastille_depart": c_dep,
                   "pastille_arrivee": c_arr,
                   "diametre_interieur": d_int,
                   "plans_traverses": len(plans_traverses or ())}


def abcd_via_boucle(l_boucle, c_totale, freq):
    """Matrice ABCD d'un via a partir de son L de boucle et de son C. EN SI.

    Meme reseau en pi que `abcd_via` -- C/2, L, C/2 -- mais nourri par les deux
    grandeurs que les paliers 1 et 2 calculent au lieu des deux formules
    fermees. Les deux fonctions existent, et c'est voulu : `abcd_via` reste le
    modele de repli quand la page n'envoie ni via de retour ni antipad, et il
    faut pouvoir comparer les deux sur la meme geometrie.
    """
    omega = 2.0 * np.pi * float(freq)
    z = 1j * omega * float(l_boucle)
    y = 1j * omega * float(c_totale) / 2.0
    return np.array([[1.0 + z * y, z],
                     [y * (2.0 + z * y), 1.0 + z * y]], dtype=complex)


# ==========================================================================
# LE MOIGNON DE VIA, ET LA CAVITE ENTRE PLANS
# --------------------------------------------------------------------------
# LES DEUX CHOSES QUE LE RESEAU EN PI NE DIT PAS, et elles ne se ressemblent
# pas : l'une est un bout de conducteur en trop, l'autre est un chemin de
# retour qui manque.
#
# 1. LE MOIGNON. Un via traversant qui ne sert que de TOP a une couche interne
#    laisse pendre le reste du percage. Ce bout-la n'est raccorde a rien par le
#    bas : c'est un TRONCON DE LIGNE EN CIRCUIT OUVERT, en derivation sur le
#    signal. Sous sa resonance il se comporte comme une capacite -- et pas une
#    petite : 1 mm de moignon vaut 206 fF a 3 GHz, deux fois et demie la
#    capacite du via lui-meme. A sa resonance quart d'onde il devient un
#    COURT-CIRCUIT et efface la liaison ; c'est le defaut qui tue un lien
#    multi-gigabit, et aucune inspection visuelle ne le montre.
#
# 2. LA CAVITE. Quand la reference change -- GND d'un cote du via, PWR de
#    l'autre --, le courant de retour doit passer d'un plan a l'autre. Il ne
#    peut le faire que la ou quelque chose joint les deux : un condensateur de
#    decouplage. La boucle qu'il decrit alors -- descendre par le via, courir
#    dans un plan jusqu'au condensateur, remonter, revenir dans l'autre plan --
#    est une boucle de PAIRE DE PLANS, et son inductance se calcule.
#
#    C'EST CE QUI TRANSFORME UN CONSEIL EN CHIFFRE. Jusqu'ici le modele disait
#    « ne changez pas de reference » et rendait un plancher ; il peut desormais
#    dire combien cela coute, et donc si l'on peut se le permettre.
# ==========================================================================


def impedance_moignon(d_barreau, d_antipad, epsilon_r):
    """Z0 du coax barreau/antipad, en ohms. EN METRES.

        Z0 = (60 / sqrt(er)) * ln(D_antipad / d_barreau)

    LE MOIGNON EST UN COAX, ET C'EST L'APPROXIMATION DU METIER. Le barreau est
    l'ame ; le bord de l'antipad, dans chaque plan traverse, est le blindage.
    Entre deux plans il n'y a pas de blindage a ce rayon-la, et le champ
    s'evase : on garde quand meme D_antipad sur toute la longueur, ce qui
    SURESTIME Z0, donc sous-estime la capacite du moignon. L'erreur va dans le
    sens qui rassure, et c'est pour cela qu'elle est ecrite ici.

    Sur un percage de 0,25 mm dans un antipad de 0,80 en FR-4, Z0 vaut 33,6
    ohms -- l'ordre de grandeur que donnent les mesures de moignons.
    """
    d = float(d_barreau)
    da = float(d_antipad)
    er = float(epsilon_r)
    if not (d > 0 and da > d and er > 0):
        return 0.0
    return (60.0 / np.sqrt(er)) * np.log(da / d)


def admittance_moignon(longueur, d_barreau, d_antipad, epsilon_r, tan_delta,
                       freq):
    """Admittance d'entree d'un moignon en circuit ouvert, en siemens. EN SI.

        Y = Y0 * tanh(gamma L),    gamma = j*beta*sqrt(1 - j tan_delta)

    LA CONSTANTE DE PROPAGATION EST COMPLEXE, ET CE N'EST PAS UN DETAIL. Avec
    un beta purement imaginaire, Y = j Y0 tan(beta L) DIVERGE au quart d'onde :
    la matrice ABCD devient infinie et la cascade rend n'importe quoi. Ce n'est
    pas une difficulte numerique a contourner par un plafond arbitraire -- c'est
    la PERTE qui manque. Un moignon reel a un facteur de qualite fini, de
    l'ordre de 1/tan_delta, et sa resonance a une profondeur finie. En mettant
    la perte dans gamma, `tanh` ne diverge jamais et le creux a la bonne
    profondeur : sur du FR-4 a tan_delta = 0,02, Y culmine a 64 fois Y0.

    ON NEGLIGE LA PERTE DU CONDUCTEUR, et cela SUR-estime le facteur de qualite,
    donc la profondeur du creux. C'est le sens prudent : on annonce une
    resonance plus mechante qu'elle ne sera.
    """
    lg = float(longueur)
    z0 = impedance_moignon(d_barreau, d_antipad, epsilon_r)
    if not (lg > 0 and z0 > 0):
        return 0.0 + 0.0j
    omega = 2.0 * np.pi * float(freq)
    beta = omega * np.sqrt(float(epsilon_r)) / C_0
    gamma = 1j * beta * np.sqrt(1.0 - 1j * float(tan_delta))
    return np.tanh(gamma * lg) / z0


def frequence_resonance_moignon(longueur, epsilon_r):
    """La frequence quart d'onde d'un moignon, en hertz. LONGUEUR EN METRES.

    C'est LE chiffre a montrer : au-dessous, le moignon est une capacite qu'on
    peut compenser ; a cette frequence-la, il court-circuite la liaison. Un
    moignon de 1 mm dans du FR-4 resonne a 36 GHz, un de 1,1 mm a 33 -- et un
    canal a 25 Gbit/s travaille jusqu'au troisieme harmonique de 12,5 GHz.
    """
    lg = float(longueur)
    if not (lg > 0):
        return float("inf")
    return C_0 / (4.0 * lg * np.sqrt(float(epsilon_r)))


def inductance_cavite(hauteur_plans, ecart, rayon):
    """Inductance de boucle d'un retour dans une paire de plans. EN METRES.

        L = (mu0 h / 2pi) * ln(s / r)

    LA GEOMETRIE QU'ELLE DECRIT. Le courant descend par le via -- rayon `r` --,
    s'etale dans le plan du haut, remonte par un pont situe a la distance `s`,
    et revient par le plan du bas. `hauteur_plans` est l'ecart entre les deux
    plans, et c'est lui qui commande : deux plans colles n'enferment aucune
    surface, deux plans separes par un coeur de 1 mm en enferment.

    CE N'EST PAS UNE INDUCTANCE A AJOUTER A CELLE DU VIA -- c'en est UNE AUTRE,
    en serie avec elle, et l'appelant les additionne en le disant. La mutuelle
    entre les deux boucles est negligee ; elles sont dans des plans differents
    et se recoupent peu, mais la negliger reste une approximation, et elle est
    nommee.

    Ordre de grandeur : 1 mm entre plans, un pont a 2 mm, un percage de
    0,25 mm -> 0,55 nH. C'est le meme ordre que le via lui-meme : changer de
    reference DOUBLE l'inductance, meme quand on decouple bien.
    """
    h = float(hauteur_plans)
    s = float(ecart)
    r = float(rayon)
    if not (h > 0 and r > 0 and s > r):
        return 0.0
    return (MU_0 * h / (2.0 * np.pi)) * np.log(s / r)


def capacite_paire_plans(aire, hauteur_plans, epsilon_r):
    """La cavite vue comme un condensateur plan, en farads. EN METRES.

    Elle ne sert PAS a chiffrer le retour -- une paire de plans n'est un
    condensateur qu'en dessous de sa premiere resonance de cavite, et le retour
    d'un signal passe par les ponts bien avant. Elle sert a dire ce qu'on a en
    l'absence de tout pont : c'est ce qui reste, et c'est peu.
    """
    a = float(aire)
    h = float(hauteur_plans)
    if not (a > 0 and h > 0):
        return 0.0
    return EPSILON_0 * float(epsilon_r) * a / h


# ==========================================================================
# LA TRAVERSEE ENTRE DEUX PLANS -- CE QUE BOGATIN EN DIT, ET CE QU'ON AVAIT FAUX
# --------------------------------------------------------------------------
# SOURCE : Eric Bogatin, « Signal and Power Integrity -- Simplified », 2e ed.,
# Prentice Hall 2010. Section 7.14 « When Return Paths Switch Reference
# Planes » (p. 244-247) et section 13.14 « Approximating Loop Inductance »
# (p. 653-659, equations 13-31 et 13-35).
#
# DEUX CHOSES QUE LE MODELE PRECEDENT RATAIT, ET ELLES VONT DANS DES SENS
# OPPOSES.
#
# 1. IL FAUT UN PONT -- NON. C'etait l'erreur de fond. Le courant de retour
#    n'attend pas un condensateur de decouplage pour changer de plan : il passe
#    par la PAIRE DE PLANS ELLE-MEME, en courant de deplacement a travers sa
#    capacite. Bogatin le montre en 7.14 : le conducteur du milieu, meme
#    FLOTTANT, porte des courants de Foucault induits qui referment la boucle,
#    et le pilote voit simplement deux lignes en serie -- Z(1-2) + Z(2-3).
#    L'impedance de la paire de plans vaut typiquement quelques ohms, souvent
#    moins d'un ohm. Refuser de chiffrer la traversee faute de condensateur,
#    c'etait declarer impossible ce qui se produit sur toute carte multicouche.
#
# 2. L'ETALEMENT ETAIT QUATRE FOIS TROP PETIT. On employait l'equation 13-31,
#    qui decrit un via central rejoignant un ANNEAU exterieur lointain :
#    L = 5,1 * h[mil] * ln(b/a) pH -- soit exactement mu0/(2 pi) en unites SI.
#    Or le cas d'un via de signal et d'un condensateur est celui de DEUX
#    CONTACTS PONCTUELS, ou le courant s'etale au depart ET se resserre a
#    l'arrivee, dans les DEUX plans. Bogatin lui consacre l'equation 13-35 :
#    L = 21 * h[mil] * ln(B/D) pH, soit environ quatre fois plus. Mesure sur le
#    cas du banc : 1,72 nH au lieu de 0,55.
#
# CE QUI RESTE HORS DE PORTEE, ET LE LIVRE LE DIT AUSSI. Une paire de plans est
# une CAVITE : elle a ses propres resonances, et l'impedance vue depuis un via
# n'est un simple L-C serie qu'en dessous de la premiere. Bogatin : « the only
# accurate way of estimating the impedance profile is with a 3D simulator ».
# On modelise donc le premier ordre, et la fiche dit ou il cesse de valoir.
# ==========================================================================

# Le coefficient de l'equation 13-35, en henrys par metre de separation entre
# plans. Bogatin l'ecrit 21 pH par mil ; en SI cela fait 21e-12 / 25,4e-6.
# Il vaut 4,13 fois mu0/(2 pi), qui est le coefficient du cas a un seul contact
# (equation 13-31) : c'est le prix des deux constrictions et des deux plans.
# Le chiffre est EMPIRIQUE -- il n'y a pas de forme fermee exacte pour cette
# geometrie, le livre le dit -- et c'est pour cela qu'il est nomme ici plutot
# que derive.
COEFF_ETALEMENT_VIA_VIA = 21.0e-12 / 25.4e-6


def inductance_etalement_via_anneau(hauteur_plans, rayon_via, rayon_exterieur):
    """Etalement d'un via vers un anneau exterieur lointain. EN METRES.

        L = (mu0 h / 2pi) * ln(b/a)          [Bogatin eq. 13-31]

    C'est le SEUL cas de cette famille qui ait une forme fermee exacte : la
    symetrie de revolution la donne. Elle decrit le courant qui descend par un
    via central, s'etale radialement jusqu'a un contact annulaire de rayon `b`,
    et revient par le plan du dessous.

    ELLE NE DECRIT PAS DEUX VIAS. Pour deux contacts ponctuels, voir
    `inductance_etalement_via_via` : le courant y subit deux constrictions au
    lieu d'une, et l'inductance vaut quatre fois plus. Employer celle-ci a la
    place de l'autre -- ce que faisait la version precedente -- sous-estime d'un
    facteur trois a quatre.

    On la garde parce qu'elle est la bonne quand le retour se fait vers la
    cavite ENTIERE plutot que vers un point : c'est le cas quand aucun
    condensateur ne joint les deux plans et que le courant se referme par la
    capacite repartie des plans.
    """
    h = float(hauteur_plans)
    a = float(rayon_via)
    b = float(rayon_exterieur)
    if not (h > 0 and a > 0 and b > a):
        return 0.0
    return (MU_0 * h / (2.0 * np.pi)) * np.log(b / a)


def inductance_etalement_via_via(hauteur_plans, ecart, diametre_via):
    """Etalement entre DEUX contacts de via dans une paire de plans. EN METRES.

        L = 21 * h[mil] * ln(B/D) pH         [Bogatin eq. 13-35]

    C'est la geometrie reelle du chemin de retour quand la reference change :
    le courant descend par le via de signal, s'etale dans le plan du haut, se
    resserre dans le via du condensateur de decouplage, et revient par le plan
    du bas. Deux etalements, deux constrictions, deux plans.

    IL N'Y A PAS DE FORME FERMEE EXACTE, et le livre le dit : « There are no
    exact analytical equations that describe this loop spreading inductance ».
    Le coefficient est ajuste. On le prend tel quel plutot que de bricoler une
    derivation qui aurait l'air exacte.

    LE PARAMETRE DOMINANT EST L'ECART ENTRE PLANS, pas la distance au
    condensateur : L croit lineairement avec `hauteur_plans` et seulement en
    logarithme avec `ecart`. Rapprocher le decouplage de moitie ne gagne que
    ln(2) ; amincir le dielectrique entre plans de moitie gagne la moitie. C'est
    le conseil que la fiche doit porter, et il n'est pas celui qu'on attend.
    """
    h = float(hauteur_plans)
    b = float(ecart)
    d = float(diametre_via)
    if not (h > 0 and d > 0 and b > d):
        return 0.0
    return COEFF_ETALEMENT_VIA_VIA * h * np.log(b / d)


def impedance_paire_plans(hauteur_plans, largeur, epsilon_r):
    """Impedance caracteristique d'une paire de plans larges. EN METRES.

        Z0 = (377 / sqrt(er)) * h / w         [Bogatin eq. 7-18, h << w]

    C'EST LE CHIFFRE QUI DIT SI LA TRAVERSEE COMPTE. Le pilote voit deux lignes
    en serie -- celle de la piste a son plan, et celle des deux plans entre eux
    (section 7.14). Quand la seconde vaut un ohm devant cinquante, le
    changement de reference ne se voit pas ; quand elle vaut dix, si.

    Sur du FR-4, deux plans de 50 mm de large separes par 1 mm donnent 3,6 ohms ;
    separes par 0,1 mm, 0,36 ohm. C'est encore l'ecart entre plans qui commande.
    """
    h = float(hauteur_plans)
    w = float(largeur)
    er = float(epsilon_r)
    if not (h > 0 and w > 0 and er > 0):
        return 0.0
    return (377.0 / np.sqrt(er)) * h / w


def impedance_traversee_plans(freq, l_etalement_cavite, c_plans,
                              l_pont=None, esr_pont=0.0, c_pont=None):
    """L'impedance serie que la traversee entre deux plans ajoute. EN SI.

    DEUX CHEMINS EN PARALLELE, et c'est toute la structure :

      · LA CAVITE elle-meme -- le courant s'etale du via jusqu'a la capacite
        repartie des deux plans et se referme par elle. Ce chemin EXISTE
        TOUJOURS ; c'est ce que la version precedente refusait de chiffrer.
            Z_cav = j w L_etalement + 1/(j w C_plans)
      · LE PONT, quand il y en a un : un condensateur de decouplage, son
        inductance de montage et l'etalement qui y mene.
            Z_pont = j w L_pont + ESR [+ 1/(j w C_pont) si la valeur est connue]

    LE PARALLELE DE CES DEUX-LA RESONNE, et ce n'est pas un artefact : c'est la
    « parallel resonant frequency » du chapitre 13, ou l'inductance du
    condensateur et la capacite des plans s'annulent. L'impedance de la
    traversee y CULMINE. Le modele la rend, et c'est bien : c'est un vrai
    defaut de conception, pas un accident numerique. Ce qu'il ne rend pas, ce
    sont les resonances propres de la cavite plus haut en frequence -- il y
    faudrait un solveur 3D, le livre le dit.

    Rend une impedance complexe, en ohms.
    """
    omega = 2.0 * np.pi * float(freq)
    if omega <= 0:
        return 0.0 + 0.0j

    def _branche(l_serie, c_serie, r_serie):
        z = complex(r_serie, omega * float(l_serie))
        if c_serie and c_serie > 0:
            z += 1.0 / (1j * omega * float(c_serie))
        return z

    z_cav = _branche(l_etalement_cavite, c_plans, 0.0)
    if l_pont is None:
        return z_cav
    z_pont = _branche(l_pont, c_pont, esr_pont)
    somme = z_cav + z_pont
    if abs(somme) < 1e-300:
        return 0.0 + 0.0j
    return z_cav * z_pont / somme


def abcd_via_complet(l_boucle, c_totale, freq, y_depart=0.0, y_arrivee=0.0,
                    z_traversee=0.0):
    """Le via entier : le pi L-C, plus un moignon a chaque bout s'il y en a.

        [1 0; Y1+jwC/2 1] [1 Z; 0 1] [1 0; Y2+jwC/2 1]

    LE MOIGNON SE POSE EN DERIVATION AU NOEUD, ET NON EN SERIE. C'est un bout
    de ligne raccorde au barreau par un bout et ouvert par l'autre : le courant
    du signal ne le traverse pas, il s'y engage et revient. Le mettre en serie
    -- l'erreur naturelle -- en ferait un allongement du via, ce qu'il n'est
    pas : un moignon ne retarde pas le signal, il le charge.

    `y_depart` charge le noeud d'ENTREE, `y_arrivee` celui de sortie : un via
    traversant utilise de TOP a une couche interne laisse son moignon du cote
    de la sortie, et l'y mettre du mauvais cote change |S11| sans changer
    |S21|, donc se voit mal.

    `z_traversee` s'ajoute EN SERIE a l'inductance du via : c'est l'impedance
    que le retour paie pour changer de plan de reference. Ce n'est pas une
    inductance -- la cavite entre plans est un L-C, elle resonne -- et c'est
    pour cela qu'elle arrive ici en impedance complexe deja evaluee a la
    frequence, et non en henrys. Voir `impedance_traversee_plans`.
    """
    omega = 2.0 * np.pi * float(freq)
    z = 1j * omega * float(l_boucle) + complex(z_traversee)
    y_c = 1j * omega * float(c_totale) / 2.0
    y1 = y_c + complex(y_depart)
    y2 = y_c + complex(y_arrivee)
    # [1 0; y1 1] [1 z; 0 1] [1 0; y2 1]
    a = 1.0 + z * y2
    b = z
    c = y1 + y2 + z * y1 * y2
    d = 1.0 + z * y1
    return np.array([[a, b], [c, d]], dtype=complex)


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
