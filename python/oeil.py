# -*- coding: utf-8 -*-
"""Diagramme de l'oeil : la liaison vue par le recepteur, bit apres bit.

    >>> import oeil
    >>> oeil.etat()["dispo"]
    True

LA QUESTION. Les parametres S disent ce que la liaison fait a une sinusoide ;
le recepteur, lui, voit une suite de bits. Chaque bit deborde sur ses voisins
-- pertes, reflexions, moignons -- et l'oeil est ce qu'il reste d'ouvert quand
on superpose tous les bits les uns sur les autres. C'est aussi ce que les
normes jugent : un gabarit (« masque ») dans lequel aucune trace n'a le droit
d'entrer.

LA LIAISON EST CELLE DU DEPOT, ET RIEN D'AUTRE. La selection part dans
`simulation_em.simuler` exactement comme sous l'onglet Impedance -- methode
des moments sur la section droite, dispersion, pertes, coudes, vias,
moignons -- et l'on demande sa matrice ABCD a chaque frequence d'une grille
reguliere (`freqs_imposees`). En differentiel, c'est la cascade du mode
impair (`s_diff["abcd_dd"]`). Ce module n'ajoute que ce qui est AUTOUR :

    1. l'emetteur, un generateur de Thevenin lineaire : tension a vide
       (v_bas, v_haut), resistance de sortie, front gaussien de temps de
       montee tr (10-90 %) et, au besoin, une pre-accentuation (FFE) ;
    2. le recepteur : resistance de terminaison et capacite de broche, et
       l'egaliseur de reference du protocole quand le gabarit en suppose un
       (CTLE, DFE) ;
    3. le passage en temporel : la fonction de transfert generateur -> broche
       du recepteur, IFFT, reponse a un echelon puis a UN BIT ;
    4. deux yeux tires de cette meme reponse a un bit :
       - l'oeil PRBS (PRBS7, 9 ou 15) par superposition -- la liaison est
         lineaire, la somme des reponses decalees EST la forme d'onde ;
       - l'oeil PIRE CAS par analyse de distorsion crete (PDA) : la pire
         combinaison de bits voisins, toutes sequences confondues, et pas
         seulement celles que le PRBS contient ;
    5. le gabarit du protocole, et la marge : de combien on peut l'agrandir
       avant qu'une trace le touche.

DEPUIS LA 2.0.0, TROIS CHOSES DE PLUS, toutes FACULTATIVES -- sans elles,
le resultat est celui de la 1.0.0 :
    6. l'OEIL STATISTIQUE : gigue aleatoire (RJ) et deterministe (DJ) de
       l'emetteur, bruit du recepteur, contours de taux d'erreur (10^-6 a
       10^-15) et baignoire -- voir `oeil_statistique` ;
    7. la DIAPHONIE des voisines, bornee, dans le pire cas et dans l'oeil
       statistique : saisie, ou reprise du couplage de `simulation_em` par le
       niveau 2 de `crosstalk.py` -- voir `agresseurs_du_couplage` ;
    8. des tampons IBIS a l'emetteur et au recepteur, simules dans le temps
       contre le canal (`ibis.py`) -- voir `simuler_non_lineaire`.
Et la cascade differentielle porte maintenant les vias et les coudes de la
paire (`simulation_em` 4.4.0).

DEPUIS LA 2.1.0, l'IBIS va jusqu'au bout, toujours FACULTATIF :
    9. le BOITIER de chaque broche ([Package], [Pin], diagonale d'un
       [Package Model]), fondu dans la cascade entre le die et la piste --
       voir `appliquer_boitiers` ; un boitier nul rend l'oeil d'avant ;
   10. en differentiel, les DEUX BRINS de la paire, chacun son tampon, son
       modele, son coin, son boitier ([Diff Pin]) et le tdelay du brin
       inverse ; le MODE COMMUN qui en sort, et l'oeil d'une paire
       symetrique pour comparer -- voir `simuler_paire`, `mode_commun` ;
       le vdiff du recepteur devient son seuil ;
   11. le fichier .ami d'un modele IBIS-AMI, LU et montre, et l'egaliseur
       de reference regle d'apres lui sur demande -- la bibliotheque du
       fabricant n'est PAS executee : voir `preparer_ami`.

DEPUIS LA 2.2.0, la paire et le boitier vont jusqu'au bout :
   12. une paire DISSYMETRIQUE -- largeurs ou masses differentes, vias ou
       coudes sur un seul brin, un brin plus long -- passe par la cascade a
       quatre acces de `simulation_em` 5.1.0 (`s_diff["abcd_brins"]`) : en
       lineaire, son transfert differentiel (`transfert_paire`) ; avec des
       tampons IBIS, les deux brins simules sur elle. Le brin le plus long
       est celui que les longueurs designent, plus le brin N d'office. Une
       paire symetrique rend l'oeil d'avant, au bit pres ;
   13. les MUTUELLES du [Package Model] entre les deux broches d'une paire
       de [Diff Pin] sont comptees (`ibis.mutuelle_paire`) : boitier couple
       brin par brin, ou L - L_m et C + C_m dans la moyenne du mode impair ;
   14. un boitier PAR SECTIONS (Len=) est une cascade de lignes
       (`ibis.abcd_sections`).

DEPUIS LA 2.3.0, toujours FACULTATIF :
   15. les CONDENSATEURS DE LIAISON (couplage AC) : un condensateur en
       serie sur chaque brin, ESL et ESR compris, cote emetteur ou
       recepteur, dans la cascade du canal (simple, deux modes, quatre
       acces) ; coupure basse, et le droop des longues suites dans le pire
       cas et le PRBS -- voir « LES CONDENSATEURS DE LIAISON » ;
   16. l'EXECUTION DU MODELE AMI (bibliotheque du fabricant, par ctypes,
       `ibis.ModeleAmi`) : AMI_Init de l'emetteur sur la reponse
       impulsionnelle du canal, AMI_Init et AMI_GetWave du recepteur par
       blocs, parametres In/InOut du .ami surchargeables, Out rendus --
       voir « L'EXECUTION DES MODELES AMI ». Seul un fichier designe par
       l'utilisateur sous la LIB ou un projet s'execute ; tout echec est un
       avertissement et un repli sur l'egaliseur de reference ;
   17. la rugosite propre du plan de reference dans la cascade de la paire
       (`simulation_em` 5.4.0) : l'oeil differentiel la suit.

DEPUIS LA 2.4.0, ce qui restait dit et pas compte l'est :
   18. les MUTUELLES du [Package Model] vers les broches VOISINES
       (`ibis.abcd_boitier_couple`) : voisines au repos, fermees sur
       `r_voisin` (50 ohms) aux deux bouts -- alimentations et masses en
       court-circuit, NC ouvertes -- et eliminees ; `boitier_voisins: false`
       rend le boitier d'avant. Un boitier PAR SECTIONS n'a pas de
       mutuelles : [Number Of Sections] et les matrices s'excluent (BIRD 54) ;
   19. l'AMI_GETWAVE DE L'EMETTEUR : la stimulation (+-0,5 par bit) passe
       par lui, puis par le canal brut ; un recepteur a AMI_Init seul
       derriere lui est initialise une seconde fois sur le canal brut ;
   20. l'HORLOGE RECUPEREE par le recepteur AMI FIXE l'echantillonnage
       (instant + bit / 2, BIRD 214) : phase moyenne pour le pire cas et
       l'oeil statistique, chaque bit de l'oeil PRBS a son instant -- voir
       « L'HORLOGE RECUPEREE » dans `oeil` ;
   21. l'AMI SUR DES TAMPONS IBIS SIMULES DANS LE TEMPS : le GetWave du
       recepteur recoit la forme d'onde NON LINEAIRE de la broche,
       l'egalisation de l'emetteur ajoutee par le canal linearise (la
       norme suppose le canal analogique lineaire ; ce qui ne l'est pas
       reste dans la forme d'onde) ;
   22. le via sur le brin N seul et les brins superposes sur deux couches
       (`simulation_em` 5.5.0), dans la cascade a quatre acces ;
   23. les condensateurs de liaison : le pole lent SEPARE dans les
       chemins lineaires (decharge exacte quelle que soit la fenetre), le
       pont diviseur de la paire par brin sans terminaison.

CE QUI N'EST PAS LA, et se dit dans chaque resultat : un recepteur AMI a
AMI_Init seul sur des tampons non lineaires egalise la part lineaire de la
forme d'onde, pas ce que les tampons y ajoutent ; un Tx AMI ne pilote pas
le tampon IBIS lui-meme (multi-niveaux), son egalisation passe par le canal
linearise.
Les gabarits portent chacun leur FIABILITE : les normes sont payantes, et
une valeur qui n'a pas pu etre recoupee le dit.

Le document d'entree est celui de `simulation_em` (format « cao-sim-em-* »)
avec un champ de plus, EN UNITES SI :

    oeil {debit (bit/s), tr (s), v_haut, v_bas (V, a vide), r_source (ohm),
          r_charge (ohm, 0 = haute impedance), c_charge (F),
          mode "simple"|"diff", motif "prbs7"|"prbs9"|"prbs15",
          gabarit (id de GABARITS ou ""), egaliseur (bool),
          ffe [coefficients], ffe_principal (rang du curseur principal),
          dfe_prises, dfe_max (V), ctle {adc_db, fz, fp1, fp2},
          setup, hold (s, pour les gabarits « seuils »),
          -- facultatifs, 2.0.0 --
          rj (s rms) ou rj_ui, dj (s crete a crete, double Dirac) ou dj_ui,
          bruit_v (V rms au recepteur), ber_cible, statistique (bool),
          agresseurs [{nom, crete_v} ou {nom, coef, v}],
          agresseurs_auto (bool), agresseurs_sens "meme"|"oppose"|"inconnu",
          agresseurs_v (V), agresseurs_tr (s),
          ibis_emetteur, ibis_recepteur {texte, fichier, modele,
                                         coin "typ"|"min"|"max",
          -- facultatifs, 2.1.0 --
                                         broche (de [Pin] ; en differentiel,
                                         celle d'une paire de [Diff Pin]),
                                         modele_n, coin_n (brin inverse),
                                         ami {texte, fichier,
          -- facultatifs, 2.3.0 --
                                              bibliotheque (chemin du .so /
                                              .dll sous la LIB ou un projet),
                                              parametres {nom ou chemin:
                                              valeur}}},
          boitier (bool, vrai par defaut), decalage_n (s, retard du brin
          inverse : remplace le tdelay), r_charge_mc (ohm, impedance de mode
          commun du recepteur, 0 = flottant), ami_regler (bool),
          couplage_ac {c (F, par brin), esr (ohm), esl (H), boitier ("0402"
          ...), position "emetteur"|"recepteur"}}
"""

import math
import os
import sys
import time

_ICI = os.path.dirname(os.path.abspath(__file__))
if _ICI not in sys.path:
    sys.path.insert(0, _ICI)

try:
    import numpy as np
    import simulation_em as se
    ERREUR_OEIL = se.ERREUR_SOLVEUR
except Exception as _exc:                              # noqa: BLE001
    np = se = None
    ERREUR_OEIL = _exc

VERSION = "2.4.1"
FORMAT_RESULTAT = "cao-oeil-resultat-1"
# UN FICHIER IBIS VOYAGE DANS LA REQUETE, en texte : quelques megaoctets pour
# les plus gros composants, deux fois si l'emetteur et le recepteur en ont
# chacun un.
MAX_CORPS = 16 * 1024 * 1024

# Echantillons par intervalle unitaire : 64 colonnes par UI, 128 sur les deux
# UI affichees. C'est aussi la resolution de la largeur d'oeil (1/64 UI).
ECHANTILLONS_UI = 64
# Lignes de l'histogramme de densite.
LIGNES_DENSITE = 160
# Plafond de la grille de frequences : au-dela, la fenetre est raccourcie et
# on le dit. 8192 points coutent moins d'une seconde de cascade.
MAX_FREQS = 8192
# Le front gaussien : 10-90 % = 2 x 1,2816 sigma.
TR_SUR_SIGMA = 2.5631

C_0 = 299792458.0


class ErreurOeil(Exception):
    """Refus explicite : un message d'une ligne et ce qu'il faut changer."""
    def __init__(self, message, conseil=""):
        super(ErreurOeil, self).__init__(message)
        self.message = str(message)
        self.conseil = str(conseil)


# ==========================================================================
# LES GABARITS
# --------------------------------------------------------------------------
# UNE SEULE SOURCE, ICI. La page les recoit par GET /api/oeil et ne les
# recopie pas : un gabarit corrige ici l'est partout.
#
# CONVENTIONS. Le temps est en UI, COMPTE DEPUIS L'INSTANT D'ECHANTILLONNAGE
# (0 = centre de l'oeil) ; les tensions sont en volts, a la broche du
# recepteur, differentielles en mode « diff » (donc centrees sur 0). Un
# polygone est CONVEXE et entoure son centre : c'est ce qui permet de calculer
# la marge exactement (voir `_jauge`).
#
# TROIS FORMES DE MASQUE :
#   polygone   points [[t_ui, v], ...] donnes tels quels ;
#   hexagone   largeur_ui (au seuil), plat_ui (largeur du plateau),
#              hauteur_v (crete a crete) -- plat_ui = 0 donne un losange ;
#   seuils     vil, vih : la zone interdite entre les deux seuils logiques,
#              de -setup a +hold autour de l'echantillonnage. C'est le
#              gabarit DERIVE des bus lents, qui n'en ont pas d'officiel.
#
# LA FIABILITE, sur chaque gabarit :
#   norme       valeurs relues dans le texte de la norme elle-meme ;
#   corrobore   valeurs recoupees avec une source publique (fiche de
#               fabricant, note d'application) -- la norme elle-meme, payante,
#               n'a pas ete lue ;
#   a_verifier  valeurs connues de la norme mais NON recoupees ici ;
#   derive      pas de gabarit officiel : construit a partir des seuils du
#               recepteur et de sa fenetre setup/hold.
# ==========================================================================

FIABILITES = {
    "norme": ("Valeurs relues dans le texte de la norme elle-même. Le "
              "contrôle reste un gabarit : pas un verdict de conformité."),
    "corrobore": ("Valeurs recoupées avec une source publique (fiche de "
                  "fabricant, note d'application). La norme elle-même n'a "
                  "pas été consultée."),
    "a_verifier": ("Valeurs de la norme NON recoupées par une source "
                   "publique : à vérifier dans la version de la norme qui "
                   "s'applique avant de conclure."),
    "derive": ("Gabarit non officiel : construit à partir des seuils du "
               "récepteur (VIL/VIH, sensibilité) et de sa fenêtre "
               "setup/hold. Pas un verdict de conformité."),
}


def _de_emphase(db):
    """Coefficients [c0, c1] d'une desaccentuation de `db` (negatif).

    Desaccentuation = 20 log10((c0 - |c1|) / (c0 + |c1|)), avec
    c0 + |c1| = 1 : l'excursion d'un bit de transition reste pleine."""
    r = 10.0 ** (db / 20.0)
    c1 = (1.0 - r) / 2.0
    return [round(1.0 - c1, 4), round(-c1, 4)]


GABARITS = [
    # -- USB ----------------------------------------------------------------
    {"id": "usb2-hs-connecteur", "famille": "USB",
     "nom": "USB 2.0 HS — au connecteur (Template 1)",
     "debit": 480e6, "mode": "diff",
     "lieu": "Au connecteur USB de la carte (TP2 d'un hub, TP3 d'un "
             "périphérique sans câble captif) : la piste va du PHY au "
             "connecteur, la charge est celle de l'appareil d'essai.",
     "fiabilite": "corrobore",
     "source": "USB 2.0 §7.1.2.2, Template 1 ; points recoupés dans la fiche "
               "Microchip DS00002142A (tableau 6-6 « Hi-Speed eye pattern » : "
               "0 V à 7,5 et 92,5 % UI, ±300 mV de 37,5 à 62,5 % UI) et chez "
               "Analog Devices (« Improving USB 2.0 Switched-System "
               "Response » : 0,375 UI, 300 mV).",
     "note": "Les limites ±525 mV ne valent que dans l'UI qui suit une "
             "transition ; ±475 mV ailleurs. Le contrôle ci-dessous applique "
             "525 mV partout, donc il est un peu indulgent.",
     "masque": {"type": "polygone",
                "points": [[-0.425, 0.0], [-0.125, 0.300], [0.125, 0.300],
                           [0.425, 0.0], [0.125, -0.300], [-0.125, -0.300]]},
     "v_max": 0.525, "v_min": -0.525,
     # Source de courant 17,78 mA dans 45 ohms par fil : 0,8 V a vide.
     "emetteur": {"v_haut": 0.8, "v_bas": -0.8, "r_source": 90.0,
                  "tr": 500e-12},
     "recepteur": {"r_charge": 90.0, "c_charge": 1e-12}},
    {"id": "usb2-hs-recepteur", "famille": "USB",
     "nom": "USB 2.0 HS — extrémité de câble (Template 2/4)",
     "debit": 480e6, "mode": "diff",
     "lieu": "À l'entrée du récepteur, au bout de la liaison.",
     "fiabilite": "norme",
     # RELU LE 22/10/2026 DANS LA COPIE OFFICIELLE DE LA SPECIFICATION USB 2.0
     # (usb.org) : §7.1.2.2, figure 7-14 (Template 2), et non 7-15 comme on
     # l'avait ecrit de memoire. Points 1 et 4 a 12,5 et 87,5 % UI (0 mV),
     # points 2, 3, 5 et 6 a 35 et 65 % UI (±175 mV), limites ±525 mV : ce
     # sont les six points ci-dessous. La norme ne parle pas de « TP3 pour un
     # hub » : la mention est retiree. Le Template 4 (figure 7-16, et non
     # 7-17 ; sensibilite du recepteur) n'a pas la meme forme : 0 V a 15 et
     # 85 % UI, ±150 mV a 35 et 65 % UI, niveaux ±575 mV ; il n'est pas
     # repris.
     "source": "USB 2.0 §7.1.2.2, figure 7-14 (Template 2) : 0 mV à 12,5 "
               "et 87,5 % UI, ±175 mV de 35 à 65 % UI, limites ±525 mV "
               "(±475 mV hors transition). Relu dans la spécification "
               "USB 2.0 (usb.org, publique) le 22/10/2026 ; les mêmes points "
               "font le gabarit « far end » des logiciels de conformité "
               "(Tektronix TDSUSB2, Keysight U7242A).",
     "note": "Six points et limites ±525 mV relus dans la figure 7-14 de la "
             "spécification. Le Template 4 (figure 7-16, sensibilité du "
             "récepteur : 0 V à 15 et 85 % UI, ±150 mV à 35 et 65 % UI, "
             "niveaux ±575 mV) n'est pas repris. Les "
             "limites ±525 mV s'appliquent partout ici, donc un peu "
             "indulgentes.",
     "masque": {"type": "polygone",
                "points": [[-0.375, 0.0], [-0.15, 0.175], [0.15, 0.175],
                           [0.375, 0.0], [0.15, -0.175], [-0.15, -0.175]]},
     "v_max": 0.525, "v_min": -0.525,
     "emetteur": {"v_haut": 0.8, "v_bas": -0.8, "r_source": 90.0,
                  "tr": 500e-12},
     "recepteur": {"r_charge": 90.0, "c_charge": 1e-12}},
    {"id": "usb3-gen1", "famille": "USB",
     "nom": "USB 3.x Gen 1 (5 Gb/s) — après CTLE de référence",
     "debit": 5e9, "mode": "diff",
     "lieu": "À l'entrée du récepteur (TP1), après l'égaliseur de référence.",
     "fiabilite": "corrobore",
     "source": "Hauteur 100 mV à ±0,05 UI du centre après égalisation : USB "
               "3.1 ECN « SSP System Jitter Budget » ; CTLE (Adc 0,667, "
               "zéro 650 MHz, pôles 1,95 et 5 GHz) cité depuis la figure du "
               "CTLE de référence de la spécification (forum Infineon). "
               "Largeur 0,34 UI = 1 − TJ 0,66 UI.",
     "note": "Désaccentuation de l'émetteur −3,5 dB.",
     "masque": {"type": "hexagone", "largeur_ui": 0.34, "plat_ui": 0.10,
                "hauteur_v": 0.100},
     "emetteur": {"v_haut": 1.0, "v_bas": -1.0, "r_source": 100.0,
                  "tr": 60e-12, "ffe": _de_emphase(-3.5), "ffe_principal": 0},
     "recepteur": {"r_charge": 100.0, "c_charge": 0.5e-12},
     "egaliseur": {"ctle": {"forme": "usb3", "adc": 0.667, "fz": 650e6,
                            "fp1": 1.95e9, "fp2": 5e9}}},
    # -- PCI Express -----------------------------------------------------------
    {"id": "pcie-gen1", "famille": "PCI Express",
     "nom": "PCIe Gen 1 (2,5 GT/s) — récepteur",
     "debit": 2.5e9, "mode": "diff",
     "lieu": "Aux broches du récepteur.",
     "fiabilite": "corrobore",
     "source": "VRX-DIFFp-p ≥ 175 mV et TRX-EYE ≥ 0,4 UI : fiche TI XIO2000 "
               "(tableau du récepteur 2,5 GT/s).",
     "note": "Forme en losange supposée : la hauteur est exigée au centre, "
             "la largeur au seuil.",
     "masque": {"type": "hexagone", "largeur_ui": 0.40, "plat_ui": 0.0,
                "hauteur_v": 0.175},
     "emetteur": {"v_haut": 1.0, "v_bas": -1.0, "r_source": 100.0,
                  "tr": 100e-12, "ffe": _de_emphase(-3.5), "ffe_principal": 0},
     "recepteur": {"r_charge": 100.0, "c_charge": 0.5e-12}},
    {"id": "pcie-gen2", "famille": "PCI Express",
     "nom": "PCIe Gen 2 (5 GT/s) — récepteur",
     "debit": 5e9, "mode": "diff",
     "lieu": "Aux broches du récepteur (horloge commune).",
     "fiabilite": "corrobore",
     "ber": 1e-12,
     # PCIe 2.0 Base, §4.3.4 (5 GT/s, horloge commune) : VRX-DIFF-PP-CC >=
     # 120 mV et TRX-TJ-CC <= 0,40 UI, soit 0,60 UI d'ouverture a 1e-12.
     # Recoupe : guide de simulation PCIe de Microchip, tableau
     # « Specifications of the Received Signal for PCIe » (5 Gb/s : hauteur
     # 120 mV, largeur 0,6 UI). Le 0,4 UI qu'on lit parfois est la largeur
     # de 2,5 GT/s.
     "source": "PCIe 2.0 Base §4.3.4 : VRX-DIFF-PP-CC ≥ 120 mV, "
               "TRX-TJ-CC ≤ 0,40 UI (largeur 0,60 UI à 10⁻¹²) ; recoupé "
               "dans le guide de simulation PCIe de Microchip (tableau "
               "« Specifications of the Received Signal », 5 Gb/s : 120 mV, "
               "0,6 UI).",
     "note": "Désaccentuation de l'émetteur −3,5 dB (−6 dB possible). La "
             "largeur s'entend à 10⁻¹² : jugez-la sur le contour de taux "
             "d'erreur quand la gigue est saisie.",
     "masque": {"type": "hexagone", "largeur_ui": 0.60, "plat_ui": 0.0,
                "hauteur_v": 0.120},
     "emetteur": {"v_haut": 1.0, "v_bas": -1.0, "r_source": 100.0,
                  "tr": 50e-12, "ffe": _de_emphase(-3.5), "ffe_principal": 0},
     "recepteur": {"r_charge": 100.0, "c_charge": 0.5e-12}},
    {"id": "pcie-gen3", "famille": "PCI Express",
     "nom": "PCIe Gen 3 (8 GT/s) — après égaliseur de référence",
     "debit": 8e9, "mode": "diff",
     "lieu": "Derrière les broches du récepteur, après CTLE et DFE de "
             "référence.",
     "fiabilite": "corrobore",
     "ber": 1e-12,
     # PCIe 3.0 Base §4.3.4.5 (oeil stresse du recepteur, 8 GT/s) : EH >=
     # 25 mV et EW >= 0,3 UI a 1e-12, DERRIERE le CTLE et le DFE de
     # reference. Recoupements 2026-10 : CTLE a deux poles fixes 2 et 8 GHz
     # (fiche Tektronix des CTLE PCIe3/PCIe4), gain continu -6 a -12 dB par
     # pas de 1 dB (Pericom AN359, TI DS80PCI800), DFE a une prise bornee a
     # ±30 mV (brevet US 9 191 245, qui cite la norme), EH 25 mV / EW 0,3 UI
     # (forum allaboutcircuits -- source secondaire, la plus faible des
     # quatre ; la meme paire 15 mV / 0,3 UI se lit pour Gen 5 chez
     # Tektronix).
     "source": "PCIe 3.0 Base §4.3.4.5 : EH ≥ 25 mV, EW ≥ 0,3 UI à 10⁻¹² "
               "après CTLE et DFE de référence. Pôles 2 et 8 GHz : fiche "
               "Tektronix des CTLE PCIe3 ; gain continu −6 à −12 dB : "
               "Pericom AN359, TI DS80PCI800 ; DFE ±30 mV : brevet "
               "US 9 191 245 ; EH/EW : source secondaire (forum), cohérente "
               "avec 15 mV / 0,3 UI cités pour Gen 5 par Tektronix.",
     "note": "Le gain continu du CTLE est choisi parmi les sept réglages pour "
             "ouvrir l'œil au mieux. Émetteur : préréglage P7 (pré-accentuation "
             "−0,1, désaccentuation −0,2).",
     "masque": {"type": "hexagone", "largeur_ui": 0.30, "plat_ui": 0.0,
                "hauteur_v": 0.025},
     "emetteur": {"v_haut": 1.0, "v_bas": -1.0, "r_source": 100.0,
                  "tr": 35e-12, "ffe": [-0.1, 0.7, -0.2], "ffe_principal": 1},
     "recepteur": {"r_charge": 100.0, "c_charge": 0.5e-12},
     "egaliseur": {"ctle": {"forme": "pcie3", "fp1": 2e9, "fp2": 8e9,
                            "adc_db": [-6, -7, -8, -9, -10, -11, -12]},
                   "dfe": {"prises": 1, "max_v": 0.030}}},
    # -- Vidéo et écrans -------------------------------------------------------
    {"id": "hdmi14-tmds", "famille": "Vidéo et écrans",
     "nom": "HDMI 1.4 TMDS — récepteur (TP2)",
     "debit": 3.4e9, "mode": "diff",
     "lieu": "Au connecteur du récepteur (TP2).",
     "fiabilite": "corrobore",
     # RECOUPE EN 2026-10 PAR UNE SOURCE SECONDAIRE. La specification HDMI 1.4
     # et sa procedure de conformite (CTS) ne sont diffusees qu'aux
     # adoptants, sous accord : le masque du puits a TP2 (§4.2.6, figure
     # 4-32) n'a pas ete lu. Le logiciel ouvert ngscopeclient (scopehal-apps,
     # src/ngscopeclient/masks/hdmi-1.4-sink-tp2.yml, « HDMI v1.4b figure
     # 4-32 ») le publie : hexagone 0 V a ±0,35 UI, ±75 mV de -0,25 a
     # +0,25 UI, zones interdites au-dela de ±780 mV. Ce sont les points
     # ci-dessous. Avant, un gabarit derive (0,6 UI, plateau 0,2 UI, 150 mV,
     # sensibilite d'un recepteur TMDS) : la hauteur etait la meme. Ce
     # qu'on trouve chez ST (AN5121) et TI (TMDS181) -- 0,6 UI / 335 mV a
     # 3,4 Gb/s -- est le masque de la SOURCE au bout du cable de reference
     # de HDMI 2.0, une autre exigence.
     "source": "HDMI 1.4b §4.2.6, figure 4-32 (masque du puits à TP2), "
               "d'après le masque publié par le logiciel ouvert ngscopeclient "
               "(hdmi-1.4-sink-tp2.yml) : 0 mV à ±0,35 UI, ±75 mV de −0,25 à "
               "+0,25 UI, limites ±780 mV. La norme, diffusée sous accord, "
               "n'a pas été lue.",
     "note": "Source secondaire : relisez la figure 4-32 pour un verdict de "
             "conformité HDMI. L'émetteur TMDS est une source de courant "
             "(10 mA) sans terminaison de départ : les réflexions qui "
             "reviennent ne sont pas absorbées côté émetteur.",
     "masque": {"type": "polygone",
                "points": [[-0.35, 0.0], [-0.25, 0.075], [0.25, 0.075],
                           [0.35, 0.0], [0.25, -0.075], [-0.25, -0.075]]},
     "v_max": 0.780, "v_min": -0.780,
     "emetteur": {"v_haut": 5.5, "v_bas": -5.5, "r_source": 1000.0,
                  "tr": 100e-12},
     "recepteur": {"r_charge": 100.0, "c_charge": 1e-12}},
    {"id": "lvds", "famille": "Vidéo et écrans",
     "nom": "LVDS (TIA/EIA-644) — récepteur",
     "debit": 400e6, "mode": "diff",
     "lieu": "Aux broches du récepteur.",
     "fiabilite": "derive",
     # LES VALEURS DU COMPOSANT, PAS SEULEMENT DE LA NORME : les recepteurs
     # du commerce (SN65LVDS32, DS90LV028A) garantissent leur basculement a
     # ±100 mV -- c'est le pire cas qu'on retient --, et leur fiche ne donne
     # pas de fenetre setup/hold propre : elle appartient au deserialiseur
     # qui suit. D'ou 0,5 UI, a remplacer par la sienne.
     "source": "Seuil du récepteur ±100 mV (TIA/EIA-644), garanti tel quel "
               "par les récepteurs courants (SN65LVDS32, DS90LV028A : "
               "VIT ±100 mV au plus). Largeur 0,5 UI supposée : la fenêtre "
               "est celle du désérialiseur qui suit, à reprendre de sa "
               "fiche.",
     "note": "Driver à courant de 3,5 mA, terminaison 100 Ω au récepteur.",
     "masque": {"type": "hexagone", "largeur_ui": 0.50, "plat_ui": 0.20,
                "hauteur_v": 0.200},
     "emetteur": {"v_haut": 3.85, "v_bas": -3.85, "r_source": 1000.0,
                  "tr": 300e-12},
     "recepteur": {"r_charge": 100.0, "c_charge": 2e-12}},
    {"id": "mipi-dphy-hs", "famille": "Vidéo et écrans",
     "nom": "MIPI D-PHY HS — récepteur",
     "debit": 1e9, "mode": "diff",
     "lieu": "Aux broches du récepteur.",
     "fiabilite": "derive",
     "source": "Seuils ±70 mV (VIDTH / VIDTL, D-PHY v1.2) : fiches "
               "Microchip SAM9X7, Intel AN 754, TI TDA2 — c'est le pire cas "
               "retenu ; un récepteur réel peut faire mieux (Efinix T55, "
               "D-PHY v1.1 : VIDTH 40 mV au plus). Fenêtre setup + hold de "
               "0,3 UI (TSETUP[RX] 0,15 + THOLD[RX] 0,15 UI, tableau des "
               "temps données-horloge de D-PHY) non recoupée.",
     "note": "Émetteur HS terminé 50 Ω par fil, ±200 mV différentiel sur "
             "100 Ω.",
     "masque": {"type": "hexagone", "largeur_ui": 0.30, "plat_ui": 0.30,
                "hauteur_v": 0.140},
     "emetteur": {"v_haut": 0.4, "v_bas": -0.4, "r_source": 100.0,
                  "tr": 150e-12},
     "recepteur": {"r_charge": 100.0, "c_charge": 1e-12}},
    # -- Stockage et réseau ----------------------------------------------------
    {"id": "sata-gen1", "famille": "Stockage et réseau",
     "nom": "SATA Gen 1 (1,5 Gb/s) — récepteur",
     "debit": 1.5e9, "mode": "diff",
     "lieu": "Aux broches du récepteur.",
     "fiabilite": "corrobore",
     "ber": 1e-12,
     # SATA rev. 3.x §7.2 (recepteur, iSATA) : amplitude minimale 325 mVppd
     # en Gen 1i. LARGEUR = 1 - TJ du signal de tolerance a la gigue du
     # recepteur (§7.4.12/7.4.13). Recoupe : procedure de test SATA-IO
     # (SyntheSys/BERTScope, « SATA_PHY_MOI ») -- « smallest bit of the lone
     # bit pattern » 325 mV, gigue totale 0,51 UI. Avant 2026-10 : largeur
     # 0,4 UI pour les trois et un plateau de 0,1 UI, ni l'une ni l'autre
     # recoupes ; le losange (plateau nul) ne suppose rien de plus que les
     # deux exigences.
     "source": "SATA rev. 3.x : 325 mVppd minimum (Gen 1i) ; largeur "
               "1 − TJ = 0,49 UI d'après la tolérance à la gigue du "
               "récepteur. Recoupé dans la procédure de test SATA-IO "
               "(SyntheSys/BERTScope) : bit isolé ≥ 325 mV, gigue totale "
               "0,51 UI.",
     "note": "",
     "masque": {"type": "hexagone", "largeur_ui": 0.49, "plat_ui": 0.0,
                "hauteur_v": 0.325},
     "emetteur": {"v_haut": 0.5, "v_bas": -0.5, "r_source": 100.0,
                  "tr": 100e-12},
     "recepteur": {"r_charge": 100.0, "c_charge": 0.5e-12}},
    {"id": "sata-gen2", "famille": "Stockage et réseau",
     "nom": "SATA Gen 2 (3 Gb/s) — récepteur",
     "debit": 3e9, "mode": "diff",
     "lieu": "Aux broches du récepteur.",
     "fiabilite": "corrobore",
     "ber": 1e-12,
     # SATA rev. 3.x §7.2 (recepteur, iSATA) : amplitude minimale 275 mVppd
     # en Gen 2i. LARGEUR = 1 - TJ du signal de tolerance a la gigue du
     # recepteur (§7.4.12/7.4.13). Recoupe : procedure de test SATA-IO
     # (SyntheSys/BERTScope, « SATA_PHY_MOI ») -- « smallest bit of the lone
     # bit pattern » 275 mV, gigue totale 0,57 UI. Avant 2026-10 : largeur
     # 0,4 UI pour les trois et un plateau de 0,1 UI, ni l'une ni l'autre
     # recoupes ; le losange (plateau nul) ne suppose rien de plus que les
     # deux exigences.
     "source": "SATA rev. 3.x : 275 mVppd minimum (Gen 2i) ; largeur "
               "1 − TJ = 0,43 UI d'après la tolérance à la gigue du "
               "récepteur. Recoupé dans la procédure de test SATA-IO "
               "(SyntheSys/BERTScope) : bit isolé ≥ 275 mV, gigue totale "
               "0,57 UI.",
     "note": "",
     "masque": {"type": "hexagone", "largeur_ui": 0.43, "plat_ui": 0.0,
                "hauteur_v": 0.275},
     "emetteur": {"v_haut": 0.5, "v_bas": -0.5, "r_source": 100.0,
                  "tr": 67e-12},
     "recepteur": {"r_charge": 100.0, "c_charge": 0.5e-12}},
    {"id": "sata-gen3", "famille": "Stockage et réseau",
     "nom": "SATA Gen 3 (6 Gb/s) — récepteur",
     "debit": 6e9, "mode": "diff",
     "lieu": "Aux broches du récepteur.",
     "fiabilite": "corrobore",
     "ber": 1e-12,
     # SATA rev. 3.x §7.2 (recepteur, iSATA) : amplitude minimale 240 mVppd
     # en Gen 3i. LARGEUR = 1 - TJ du signal de tolerance a la gigue du
     # recepteur (§7.4.12/7.4.13). Recoupe : procedure de test SATA-IO
     # (SyntheSys/BERTScope, « SATA_PHY_MOI ») -- « smallest bit of the lone
     # bit pattern » 240 mV, gigue totale 0,57 UI. Avant 2026-10 : largeur
     # 0,4 UI pour les trois et un plateau de 0,1 UI, ni l'une ni l'autre
     # recoupes ; le losange (plateau nul) ne suppose rien de plus que les
     # deux exigences.
     # Un ECN propose (SATA-IO, ECN 050) d'abaisser ce minimum a 200 mV du
     # cote du peripherique : son adoption n'a pas pu etre confirmee.
     "source": "SATA rev. 3.x : 240 mVppd minimum (Gen 3i) ; largeur "
               "1 − TJ = 0,43 UI d'après la tolérance à la gigue du "
               "récepteur. Recoupé dans la procédure de test SATA-IO "
               "(SyntheSys/BERTScope) : bit isolé ≥ 240 mV, gigue totale "
               "0,57 UI.",
     "note": "",
     "masque": {"type": "hexagone", "largeur_ui": 0.43, "plat_ui": 0.0,
                "hauteur_v": 0.240},
     "emetteur": {"v_haut": 0.5, "v_bas": -0.5, "r_source": 100.0,
                  "tr": 40e-12},
     "recepteur": {"r_charge": 100.0, "c_charge": 0.5e-12}},
    {"id": "sgmii", "famille": "Stockage et réseau",
     "nom": "SGMII / 1000BASE-X (1,25 Gb/s) — récepteur",
     "debit": 1.25e9, "mode": "diff",
     "lieu": "Aux broches du récepteur (liaison PHY ↔ MAC).",
     "fiabilite": "corrobore",
     "source": "Sensibilité 100 mV crête à crête : fiche Freescale MSC8152. "
               "Largeur 0,4 UI supposée.",
     "note": "L'Ethernet cuivre (100BASE-TX en MLT-3, 1000BASE-T en PAM-5) "
             "n'est pas binaire : il n'a pas de gabarit ici.",
     "masque": {"type": "hexagone", "largeur_ui": 0.40, "plat_ui": 0.10,
                "hauteur_v": 0.100},
     "emetteur": {"v_haut": 0.7, "v_bas": -0.7, "r_source": 100.0,
                  "tr": 120e-12},
     "recepteur": {"r_charge": 100.0, "c_charge": 1e-12}},
    # -- Bus lents, CMOS simple ------------------------------------------------
    {"id": "spi-lvcmos33", "famille": "Bus lents (CMOS)",
     "nom": "SPI — LVCMOS 3,3 V",
     "debit": 25e6, "mode": "simple",
     "lieu": "À la broche d'entrée du récepteur (MOSI côté esclave, MISO côté "
             "maître).",
     "fiabilite": "derive",
     "source": "Seuils LVCMOS/LVTTL 3,3 V (JESD8) : VIH 2,0 V, VIL 0,8 V. "
               "Setup/hold : ceux du récepteur, à reprendre de sa fiche.",
     "note": "L'œil est centré au mieux : le décalage entre la donnée et "
             "l'horloge est l'affaire de l'onglet « Bus synchrone ».",
     "masque": {"type": "seuils", "vil": 0.8, "vih": 2.0},
     "v_max": 3.6, "v_min": -0.3,
     "setup": 3e-9, "hold": 3e-9,
     "emetteur": {"v_haut": 3.3, "v_bas": 0.0, "r_source": 40.0,
                  "tr": 1.5e-9},
     "recepteur": {"r_charge": 0.0, "c_charge": 5e-12}},
    {"id": "spi-lvcmos18", "famille": "Bus lents (CMOS)",
     "nom": "SPI — LVCMOS 1,8 V",
     "debit": 50e6, "mode": "simple",
     "lieu": "À la broche d'entrée du récepteur.",
     "fiabilite": "derive",
     "source": "Seuils LVCMOS 1,8 V (JESD8-7) : VIH 0,65 VDD, VIL 0,35 VDD.",
     "note": "",
     "masque": {"type": "seuils", "vil": 0.63, "vih": 1.17},
     "v_max": 2.1, "v_min": -0.3,
     "setup": 2e-9, "hold": 2e-9,
     "emetteur": {"v_haut": 1.8, "v_bas": 0.0, "r_source": 40.0,
                  "tr": 1e-9},
     "recepteur": {"r_charge": 0.0, "c_charge": 4e-12}},
    {"id": "qspi-33", "famille": "Bus lents (CMOS)",
     "nom": "QSPI (mémoire flash) — 3,3 V",
     "debit": 80e6, "mode": "simple",
     "lieu": "À la broche de la mémoire (écriture) ou du contrôleur "
             "(lecture).",
     "fiabilite": "derive",
     "source": "Seuils LVCMOS 3,3 V ; setup 2 ns / hold 3 ns, ordre de "
               "grandeur des mémoires flash QSPI courantes.",
     "note": "",
     "masque": {"type": "seuils", "vil": 0.8, "vih": 2.0},
     "v_max": 3.6, "v_min": -0.3,
     "setup": 2e-9, "hold": 3e-9,
     "emetteur": {"v_haut": 3.3, "v_bas": 0.0, "r_source": 33.0,
                  "tr": 1e-9},
     "recepteur": {"r_charge": 0.0, "c_charge": 6e-12}},
    {"id": "sd-hs", "famille": "Bus lents (CMOS)",
     "nom": "Carte SD High Speed (50 MHz) — 3,3 V",
     "debit": 50e6, "mode": "simple",
     "lieu": "Au connecteur de la carte SD.",
     "fiabilite": "derive",
     "source": "SD : VIH 0,625 VDD, VIL 0,25 VDD ; tISU 6 ns, tIH 2 ns en "
               "High Speed.",
     "note": "",
     "masque": {"type": "seuils", "vil": 0.825, "vih": 2.0625},
     "v_max": 3.6, "v_min": -0.3,
     "setup": 6e-9, "hold": 2e-9,
     "emetteur": {"v_haut": 3.3, "v_bas": 0.0, "r_source": 40.0,
                  "tr": 2e-9},
     "recepteur": {"r_charge": 0.0, "c_charge": 10e-12}},
    {"id": "emmc-hs52", "famille": "Bus lents (CMOS)",
     "nom": "eMMC High Speed (52 MHz) — 3,3 V",
     "debit": 52e6, "mode": "simple",
     "lieu": "À la broche de l'eMMC.",
     "fiabilite": "derive",
     "source": "eMMC : VIH 0,625 VCCQ, VIL 0,25 VCCQ ; tISU 3 ns, tIH 3 ns.",
     "note": "",
     "masque": {"type": "seuils", "vil": 0.825, "vih": 2.0625},
     "v_max": 3.6, "v_min": -0.3,
     "setup": 3e-9, "hold": 3e-9,
     "emetteur": {"v_haut": 3.3, "v_bas": 0.0, "r_source": 40.0,
                  "tr": 1.5e-9},
     "recepteur": {"r_charge": 0.0, "c_charge": 6e-12}},
]

_PAR_ID = dict((g["id"], g) for g in GABARITS)


def gabarit(ident):
    """Le gabarit `ident`, ou None."""
    return _PAR_ID.get(str(ident or ""))


def polygone(g, ui=None, setup=None, hold=None):
    """Le masque de `g` en polygone [[t_ui, v], ...], ou [] s'il n'en a pas.

    `ui`, `setup` et `hold` (s) ne servent qu'aux masques « seuils », dont la
    largeur est une duree et non une fraction d'UI."""
    m = (g or {}).get("masque") or {}
    genre = m.get("type")
    if genre == "polygone":
        return [[float(t), float(v)] for t, v in m.get("points") or []]
    if genre == "hexagone":
        w = float(m["largeur_ui"]) / 2.0
        p = min(float(m.get("plat_ui", 0.0)) / 2.0, w)
        h = float(m["hauteur_v"]) / 2.0
        if p <= 0:
            return [[-w, 0.0], [0.0, h], [w, 0.0], [0.0, -h]]
        return [[-w, 0.0], [-p, h], [p, h], [w, 0.0], [p, -h], [-p, -h]]
    if genre == "seuils":
        if not ui:
            return []
        su = float(setup if setup is not None else g.get("setup", 0.0)) / ui
        ho = float(hold if hold is not None else g.get("hold", 0.0)) / ui
        if su + ho <= 0:
            return []
        vil, vih = float(m["vil"]), float(m["vih"])
        return [[-su, vil], [-su, vih], [ho, vih], [ho, vil]]
    return []


def etat():
    if ERREUR_OEIL is not None:
        return {"dispo": False, "version": VERSION,
                "detail": "Diagramme de l'œil indisponible : %s" % ERREUR_OEIL,
                "conseil": "Il a besoin de numpy : « pip install numpy »."}
    liste = []
    for g in GABARITS:
        d = dict(g)
        d["fiabilite_texte"] = FIABILITES.get(g["fiabilite"], "")
        if g["masque"]["type"] != "seuils":
            d["polygone"] = polygone(g)
        liste.append(d)
    return {"dispo": True, "version": VERSION, "gabarits": liste,
            "fiabilites": FIABILITES,
            # LA CHAINE DES VERSIONS : ce que l'oeil a sous lui.
            "moteurs": {"oeil": VERSION,
                        "ibis": getattr(ibis, "VERSION", "indisponible"),
                        "simulation_em": getattr(se, "VERSION", "indisponible")}}


# ==========================================================================
# Les briques
# ==========================================================================

def _nombre(v, defaut=0.0):
    try:
        x = float(v)
    except (TypeError, ValueError):
        return defaut
    return x if math.isfinite(x) else defaut


def prbs(ordre):
    """Une periode de la sequence PRBS `ordre` (7, 9 ou 15), en 0/1.

    Registres a decalage des polynomes usuels : x^7+x^6+1, x^9+x^5+1,
    x^15+x^14+1 (ITU-T O.150). Periode 2^ordre - 1."""
    prises = {7: (7, 6), 9: (9, 5), 15: (15, 14)}
    if ordre not in prises:
        raise ErreurOeil("Motif PRBS%s inconnu." % ordre,
                         "Choisissez PRBS7, PRBS9 ou PRBS15.")
    a, b = prises[ordre]
    n = (1 << ordre) - 1
    reg = n                                   # tous les bits a 1
    bits = np.empty(n, dtype=np.int8)
    for i in range(n):
        nouveau = ((reg >> (a - 1)) ^ (reg >> (b - 1))) & 1
        bits[i] = reg & 1
        reg = ((reg << 1) | nouveau) & n
    return bits


def ctle(freqs, spec):
    """La reponse du CTLE `spec` sur `freqs` (Hz), complexe.

    Deux formes, normalisees a un gain continu Adc :
      usb3   Adc * wp1 wp2 / wz * (s + wz) / ((s + wp1)(s + wp2))
      pcie3  wp2 * (s + Adc wp1) / ((s + wp1)(s + wp2)) -- gain 1 en haut
    """
    s = 2j * math.pi * np.asarray(freqs, dtype=float)
    wp1 = 2 * math.pi * float(spec["fp1"])
    wp2 = 2 * math.pi * float(spec["fp2"])
    if spec.get("forme") == "pcie3":
        adc = 10.0 ** (float(spec["adc_db"]) / 20.0)
        return wp2 * (s + adc * wp1) / ((s + wp1) * (s + wp2))
    adc = float(spec.get("adc", 10.0 ** (float(spec.get("adc_db", 0.0)) / 20.0)))
    wz = 2 * math.pi * float(spec["fz"])
    return adc * wp1 * wp2 / wz * (s + wz) / ((s + wp1) * (s + wp2))


def _gain_continu_ctle(spec):
    if not spec:
        return 1.0
    if spec.get("forme") == "pcie3":
        return 10.0 ** (float(spec["adc_db"]) / 20.0)
    return float(spec.get("adc", 10.0 ** (float(spec.get("adc_db", 0.0)) / 20.0)))


def transfert(abcds, freqs, r_source, r_charge, c_charge):
    """V_charge / V_generateur a travers la cascade ABCD, sur `freqs`.

        H = 1 / (A + B Y_L + Z_s (C + D Y_L)),  Y_L = 1/R_L + j w C_L

    R_L nul ou infini : haute impedance, il ne reste que la capacite."""
    m = np.asarray(abcds, dtype=complex)
    a, b, c, d = m[:, 0, 0], m[:, 0, 1], m[:, 1, 0], m[:, 1, 1]
    w = 2 * math.pi * np.asarray(freqs, dtype=float)
    g_l = (1.0 / r_charge) if (r_charge and r_charge < 1e9) else 0.0
    y_l = g_l + 1j * w * c_charge
    h = 1.0 / (a + b * y_l + r_source * (c + d * y_l))
    # LE CONTINU, extrapole : au continu une ligne n'est plus que sa
    # resistance serie, que la partie reelle de B au premier point approche.
    r_ligne = max(0.0, float(np.real(b[0]))) if len(b) else 0.0
    h0 = 1.0 / (1.0 + (r_ligne + r_source) * g_l)
    return h, h0


def continu_couplage_ac(ca, abcds, freqs, r_source, r_charge, c_charge):
    """La case du continu de l'IFFT quand la cascade porte des condensateurs
    de liaison (voir l'en-tete « LES CONDENSATEURS DE LIAISON ») : le
    transfert au continu avec `resistance_continu_ac` a la place du
    condensateur -- la boucle de decharge est R_s + R_ligne + R_L --, ou,
    sans terminaison, le pont diviseur C_x / (C_x + C_L). `transfert` rend
    le continu SANS condensateur, celui autour duquel l'oeil se centre."""
    freqs = np.asarray(freqs, dtype=float)
    g_l = (1.0 / r_charge) if (r_charge and r_charge < 1e9) else 0.0
    b = np.asarray(abcds, dtype=complex)[:, 0, 1]
    r_ligne = max(0.0, float(np.real(b[0]))) if len(b) else 0.0
    if g_l <= 0:
        return ca["c_x"] / (ca["c_x"] + c_charge) if c_charge > 0 else 1.0
    r_x = resistance_continu_ac(ca["c_x"], r_ligne + r_source + 1.0 / g_l,
                                1.0 / (freqs[1] - freqs[0]))
    return 1.0 / (1.0 + (r_ligne + r_x + r_source) * g_l)


def _continu_ac_simple(ca, abcds, freqs, p):
    """(h0_bin, lent) d'une cascade simple (ou du mode impair) qui porte des
    condensateurs de liaison : `lent` {h0, tau} quand une terminaison les
    decharge -- le pole lent, separe exactement par
    `reponse_indicielle_ac` --, sinon la case du pont diviseur
    (`continu_couplage_ac`). (None, None) sans condensateur."""
    if not ca:
        return None, None
    h0_bin = continu_couplage_ac(ca, abcds, freqs, p["r_source"],
                                 p["r_charge"], p["c_charge"])
    if not (0 < p["r_charge"] < 1e9):
        return h0_bin, None
    b = np.asarray(abcds, dtype=complex)[:, 0, 1]
    r_ligne = max(0.0, float(np.real(b[0]))) if len(b) else 0.0
    r_tot = r_ligne + p["r_source"] + p["r_charge"]
    _, h0 = transfert(np.asarray(abcds, dtype=complex)[:1], freqs[:1],
                      p["r_source"], p["r_charge"], p["c_charge"])
    return h0_bin, {"h0": float(h0), "tau": ca["c_x"] * r_tot}


def reponse_indicielle_ac(freqs, h, h0, tr, n_fft_min, tau):
    """`reponse_indicielle` d'un transfert qui porte le POLE LENT des
    condensateurs de liaison (voir « LES CONDENSATEURS DE LIAISON »), sa
    decharge comptee EXACTEMENT, quelle que soit la fenetre.

    Au-dessous des frequences de la ligne, le canal n'est que la boucle
    R_tot et C_x : H = h0 s tau / (1 + s tau) = h0 - h0 / (1 + s tau), h0
    son continu SANS condensateur. Le terme -h0 / (1 + s tau) est le seul
    qui deborde la fenetre ; on le retire du spectre -- ce qui reste n'a
    plus de pole lent, sa case du continu vaut h0 et l'IFFT ne replie
    rien -- et l'on rajoute sa reponse a un echelon, connue :
    -h0 (1 - exp(-t / tau)), au retard du front gaussien."""
    w = 2.0 * math.pi * np.asarray(freqs, dtype=float)
    lent = -h0 / (1.0 + 1j * w * tau)
    dt, s = reponse_indicielle(freqs, np.asarray(h) - lent, h0, tr,
                               n_fft_min)
    t = np.arange(len(s)) * dt - 4.0 * tr / TR_SUR_SIGMA
    return dt, s - h0 * (1.0 - np.exp(-np.maximum(t, 0.0) / tau))


def ligne_ideale(freqs, z0, retard, pertes_db_ghz=0.0):
    """La matrice ABCD d'une ligne uniforme, pour les bancs et les essais.

    `pertes_db_ghz` : pertes en dB a 1 GHz, proportionnelles a la racine de
    la frequence (effet de peau seul)."""
    f = np.asarray(freqs, dtype=float)
    alpha_l = pertes_db_ghz / 8.686 * np.sqrt(f / 1e9)
    gl = alpha_l + 2j * math.pi * f * retard
    ch, sh = np.cosh(gl), np.sinh(gl)
    m = np.empty((len(f), 2, 2), dtype=complex)
    m[:, 0, 0] = ch
    m[:, 0, 1] = z0 * sh
    m[:, 1, 0] = sh / z0
    m[:, 1, 1] = ch
    return m


# ==========================================================================
# LES CONDENSATEURS DE LIAISON (couplage AC, 2.3.0)
# --------------------------------------------------------------------------
# Un condensateur en SERIE sur chaque brin, entre l'emetteur et le canal ou
# entre le canal et le recepteur : Z = ESR + j w ESL + 1 / (j w C). Il coupe
# le continu -- la coupure basse est f_c = 1 / (2 pi C_x (R_tx + R_rx)), C_x
# le condensateur que la boucle voit : C en simple, C/2 en differentiel (les
# deux brins en serie) -- et, au-dessus, il laisse passer la ligne telle
# quelle. Ce qu'il fait a l'oeil : une longue suite de bits identiques se
# decharge dans R_tx + R_rx avec tau = C_x (R_tx + R_rx) ; le niveau derive
# (« droop », « baseline wander ») de UI / tau par bit, et le bit qui suit
# la suite part d'un niveau fausse. Le pire cas (PDA) le compte sur toute la
# memoire de la fenetre, le PRBS sur ses plus longues suites.
#
# LE CONTINU DANS L'IFFT. Les S sont echantillonnes a partir de df = 1 / T_w
# (T_w la fenetre) ; en dessous, c'est la case du continu qui dit ce que la
# reponse fait de lent. Avec un condensateur, H(0) = 0 -- mais poser 0 dans
# la case du continu force la reponse a revenir a zero DANS la fenetre : la
# decharge, qui dure tau >> T_w, serait etalee sur T_w (repliement). La case
# du continu doit porter l'integrale de la reponse SUR LA FENETRE, c'est-a-
# dire la reponse a un echelon a t = T_w : h0 . exp(-T_w / tau). On l'obtient
# en remplacant le condensateur, au continu seulement, par la resistance
# R_x = R_tot (exp(T_w / tau) - 1) -- T_w / C quand tau >> T_w : la tension
# moyenne d'un condensateur charge par I pendant T_w --, R_tot la resistance
# de la boucle de decharge. Les cases k >= 1 sont exactes ; l'erreur restante
# est du second ordre en T_w / tau (jusqu'a ~4 % quand T_w ~ tau). Quand
# tau << T_w, R_x -> infini et le continu vaut 0, exactement ce que H(0) dit.
#
# LE POLE LENT SEPARE (2.4.0), pour tous les chemins lineaires -- simple,
# paire par brin, reponse que lit l'AMI. Au-dessous des frequences de la
# ligne, le canal n'est que la boucle : H = h0 - h0 / (1 + s tau). On retire
# ce terme du spectre, ce qui reste n'a plus de pole lent et ne replie rien,
# et l'on rajoute sa reponse a un echelon, connue, -h0 (1 - exp(-t / tau)) :
# la decharge est EXACTE quelle que soit la fenetre (4e-4 quand T_w ~ tau,
# contre 4e-2 par la case corrigee) -- `reponse_indicielle_ac`. La case
# corrigee ne sert plus qu'aux tampons IBIS simules dans le temps, dont les
# reponses sont bornees a la fenetre : une decharge plus longue n'y tient
# pas, et le resultat le dit. Sans terminaison, rien ne decharge : le
# condensateur et C_L font un pont diviseur, en simple comme pour la paire
# par brin.
# ==========================================================================

# L'inductance serie (ESL) montee des boitiers CMS usuels, EN HENRYS -- ce
# que les fiches de condensateurs donnent (pastilles comprises).
ESL_BOITIERS = {"01005": 0.2e-9, "0201": 0.25e-9, "0402": 0.4e-9,
                "0603": 0.6e-9, "0805": 0.8e-9, "1206": 1.0e-9}
POSITIONS_AC = ("emetteur", "recepteur")


def couplage_ac(spec, p):
    """Les condensateurs de liaison du document, ou None s'il n'y en a pas.

    `spec` {c (F, par brin), esr (ohm), esl (H), boitier ("0402"...),
    position "emetteur"|"recepteur"} -> {c, esr, esl, boitier, position,
    c_x, f_c, tau} : C_x le condensateur vu par la boucle, f_c la coupure
    basse, tau la constante de decharge (None sans terminaison : rien ne
    decharge, le condensateur et C_L font un pont diviseur)."""
    if not isinstance(spec, dict):
        return None
    c = _nombre(spec.get("c"), 0.0)
    if not c > 0:
        return None
    if c > 1.0:
        raise ErreurOeil("Condensateur de liaison de %.3g F : la valeur se "
                         "saisit en farads." % c,
                         "100 nF s'écrit 1e-7.")
    boitier = str(spec.get("boitier") or "").strip()
    esl = _nombre(spec.get("esl"), -1.0)
    if esl < 0:
        esl = ESL_BOITIERS.get(boitier, 0.0)
    esr = max(0.0, _nombre(spec.get("esr"), 0.0))
    position = str(spec.get("position") or "emetteur").lower()
    if position not in POSITIONS_AC:
        raise ErreurOeil("Position « %s » des condensateurs de liaison "
                         "inconnue." % position,
                         "« emetteur » (entre l'émetteur et la piste) ou "
                         "« recepteur » (entre la piste et le récepteur).")
    c_x = c / 2.0 if p["mode"] == "diff" else c
    r_l = p["r_charge"]
    tau = f_c = None
    if 0 < r_l < 1e9:
        tau = c_x * (p["r_source"] + r_l)
        f_c = 1.0 / (2.0 * math.pi * tau)
    return {"c": c, "esr": esr, "esl": esl, "boitier": boitier or None,
            "position": position, "c_x": c_x, "f_c": f_c, "tau": tau}


def impedance_couplage_ac(freqs, ca):
    """Z (N,) d'un condensateur de liaison, par brin : ESR + j w ESL
    + 1 / (j w C)."""
    w = 2.0 * math.pi * np.asarray(freqs, dtype=float)
    return ca["esr"] + 1j * w * ca["esl"] - 1j / (w * ca["c"])


def abcd_couplage_ac(freqs, ca, mode="simple"):
    """(N, 2, 2) des condensateurs de liaison : Z en serie par brin ; en mode
    impair (V_d = V_p - V_n, I_d = (I_p - I_n) / 2) la paire en voit 2 Z,
    en mode commun (V_c, I_c = I_p + I_n) Z / 2."""
    z = impedance_couplage_ac(freqs, ca)
    if mode == "diff":
        z = 2.0 * z
    elif mode == "comm":
        z = z / 2.0
    m = np.zeros((len(z), 2, 2), dtype=complex)
    m[:, 0, 0] = m[:, 1, 1] = 1.0
    m[:, 0, 1] = z
    return m


def _poser_ac(m, m_ac, ca):
    """La cascade `m` avec les condensateurs devant (position emetteur) ou
    derriere (recepteur)."""
    return m_ac @ m if ca["position"] == "emetteur" else m @ m_ac


def poser_couplage_ac(ca, freqs, abcds, abcd_cc=None, m_brins=None,
                      mode="simple"):
    """Les condensateurs de liaison dans les cascades du canal : la cascade
    (simple, ou du mode impair), celle du mode commun et la paire par brin
    (N, 4, 4) quand elles existent. Rend (abcds, abcd_cc, m_brins)."""
    freqs = np.asarray(freqs, dtype=float)
    if ca is None:
        return abcds, abcd_cc, m_brins
    abcds = _poser_ac(np.array(abcds, dtype=complex),
                      abcd_couplage_ac(freqs, ca, mode), ca)
    if abcd_cc is not None:
        abcd_cc = _poser_ac(np.array(abcd_cc, dtype=complex),
                            abcd_couplage_ac(freqs, ca, "comm"), ca)
    if m_brins is not None:
        un = abcd_couplage_ac(freqs, ca, "simple")
        m_brins = _poser_ac(np.array(m_brins, dtype=complex),
                            ibis.abcd_par_brin(un, un, len(freqs)), ca)
    return abcds, abcd_cc, m_brins


def _farads(c):
    """« 100 nF », « 4,7 µF » : une capacite lisible."""
    for seuil, unite in ((1e-6, "µF"), (1e-9, "nF"), (1e-12, "pF")):
        if c >= seuil:
            return ("%.3g %s" % (c / seuil, unite)).replace(".", ",")
    return "%.3g F" % c


def _fiche_couplage_ac(ca, p, fenetre, av):
    """Ce que le resultat dit des condensateurs de liaison, et l'avertissement
    qui va avec : coupure basse, constante de temps, droop par bit et sur la
    memoire de la fenetre (t_h = fenetre / 2, la part de la reponse que
    l'oeil lit), fenetre couverte ou non."""
    ui = p["ui"]
    t_h = fenetre / 2.0
    fiche = {"c": ca["c"], "esr": ca["esr"], "esl": ca["esl"],
             "boitier": ca["boitier"], "position": ca["position"],
             "c_boucle": ca["c_x"], "f_c": ca["f_c"], "tau": ca["tau"],
             "fenetre": fenetre, "fenetre_couvre": None,
             "droop_par_ui": None, "droop_fenetre": None,
             "bits_memoire": int(t_h / ui)}
    ou = "entre l'émetteur et la piste" if ca["position"] == "emetteur" \
        else "entre la piste et le récepteur"
    if ca["tau"]:
        fiche["fenetre_couvre"] = bool(fenetre >= 6.0 * ca["tau"] * 0.999)
        fiche["droop_par_ui"] = 1.0 - math.exp(-ui / ca["tau"])
        fiche["droop_fenetre"] = 1.0 - math.exp(-t_h / ca["tau"])
        texte = ("Condensateurs de liaison : %s par brin (ESL %.2g nH, ESR "
                 "%.2g Ω) %s ; coupure basse f_c = %.3g MHz, τ = C·(R_tx + "
                 "R_rx) = %.3g µs : chaque bit d'une longue suite dérive de "
                 "%.2g %% (droop), %.1f %% sur les %d bits de mémoire du "
                 "pire cas." % (
                     _farads(ca["c"]), ca["esl"] * 1e9, ca["esr"], ou,
                     ca["f_c"] / 1e6, ca["tau"] * 1e6,
                     100.0 * fiche["droop_par_ui"],
                     100.0 * fiche["droop_fenetre"], fiche["bits_memoire"]))
        if not fiche["fenetre_couvre"]:
            texte += (" La fenêtre de calcul (%.3g ns) ne couvre pas la "
                      "décharge (τ = %.3g µs) : le continu est corrigé pour "
                      "la fenêtre, et le droop n'est compté que sur ces %d "
                      "bits — les suites plus longues dériveraient "
                      "davantage." % (fenetre * 1e9, ca["tau"] * 1e6,
                                      fiche["bits_memoire"]))
    else:
        texte = ("Condensateurs de liaison : %s par brin %s, sans "
                 "terminaison au récepteur : rien ne les décharge, ils font "
                 "un pont diviseur avec la capacité d'entrée (C/(C + C_L) = "
                 "%.3f)." % (_farads(ca["c"]), ou,
                             ca["c_x"] / (ca["c_x"] + p["c_charge"])
                             if p["c_charge"] > 0 else 1.0))
    av.append(texte)
    return fiche


def resistance_continu_ac(c_x, r_tot, fenetre):
    """La resistance qui remplace le condensateur C_x AU CONTINU de l'IFFT
    (voir l'en-tete) : R_tot (exp(T_w / tau) - 1), tau = C_x R_tot. Infinie
    (1e12) quand la fenetre couvre bien plus que tau : le continu est 0."""
    if not (c_x > 0) or not (r_tot > 0):
        return 1e12
    x = fenetre / (c_x * r_tot)
    if x > 60.0:
        return 1e12
    return r_tot * (math.exp(x) - 1.0)


def grille(debit, tr, retard_estime, tau_extra=0.0):
    """La grille de frequences du passage en temporel : (df, n, fenetre, pleine).

    LA FENETRE doit contenir toute la reponse : trente traversees de la ligne
    (les reflexions s'eteignent en quelques allers-retours, meme sur une
    charge haute impedance), douze fronts, et les constantes de temps du
    recepteur. On en prend le DOUBLE, pour que la queue ne revienne pas par
    l'autre bout de l'IFFT.
    LE HAUT DE LA GRILLE est la ou le front gaussien ne laisse plus rien :
    1,6 / tr, ou il vaut 5e-4."""
    ui = 1.0 / debit
    t_h = 30.0 * retard_estime + 12.0 * tr + tau_extra + 2.0 * ui
    t_h = max(t_h, 2e-9)
    fenetre = 2.0 * t_h
    f_max = max(1.6 / tr, 2.0 / ui)
    n = int(math.ceil(f_max * fenetre))
    pleine = True
    if n > MAX_FREQS:
        n = MAX_FREQS
        fenetre = n / f_max
        pleine = False
    n = max(n, 64)
    return 1.0 / fenetre, n, fenetre, pleine


def reponse_indicielle(freqs, h, h0, tr, n_fft_min):
    """Reponse a un echelon unite, (dt, s), du transfert `h` (Hz -> V/V).

    Le front gaussien de l'emetteur est inclus, decale de quatre ecarts-types
    pour qu'il commence apres t = 0 : un front gaussien n'est pas causal."""
    df = freqs[1] - freqs[0]
    n = len(freqs)
    sigma = tr / TR_SUR_SIGMA
    retard = 4.0 * sigma
    g = np.exp(-2.0 * (math.pi * sigma * freqs) ** 2) \
        * np.exp(-2j * math.pi * freqs * retard)
    n_fft = 1
    while n_fft < max(2 * n + 2, n_fft_min):
        n_fft *= 2
    x = np.zeros(n_fft // 2 + 1, dtype=complex)
    x[0] = h0
    x[1:n + 1] = h * g
    impulsion = np.fft.irfft(x, n_fft)
    dt = 1.0 / (n_fft * df)
    return dt, np.cumsum(impulsion)


def filtrer_ctle(s, dt, spec):
    """Une reponse a un echelon `s` (pas dt) passee par le CTLE `spec`.

    Derivee, transformee, produit, retour, integrale : le CTLE est lineaire,
    et c'est exact des que la fenetre contient sa constante de temps la plus
    longue -- on la complete d'autant par la valeur finale."""
    s = np.asarray(s, dtype=float)
    if not spec:
        return s
    f_bas = min(float(spec.get("fz") or spec["fp1"]), float(spec["fp1"]))
    queue = int(math.ceil(8.0 / (2 * math.pi * f_bas) / dt))
    n = 1
    while n < 2 * (len(s) + queue):
        n *= 2
    imp = np.diff(np.concatenate([[0.0], s, np.full(queue, s[-1])]))
    f = np.fft.rfftfreq(n, dt)
    sortie = np.fft.irfft(np.fft.rfft(imp, n) * ctle(f, spec), n)
    return np.cumsum(sortie[:len(s) + queue])


def _jauge(poly):
    """(centre, normales, distances) d'un polygone convexe.

    LA MARGE EXACTE. Pour un polygone convexe qui entoure son centre c, la
    jauge g(q) = max_i n_i.(q - c) / d_i vaut 1 sur le bord, moins dedans,
    plus dehors -- et le polygone agrandi d'un facteur k autour de c est
    exactement {g <= k}. La plus petite jauge des traces EST donc le facteur
    d'agrandissement que le gabarit supporte. Elle ne depend pas des unites
    des axes : une transformation lineaire la laisse invariante."""
    p = np.asarray(poly, dtype=float)
    c = p.mean(axis=0)
    q = np.roll(p, -1, axis=0)
    arete = q - p
    normales = np.stack([arete[:, 1], -arete[:, 0]], axis=1)
    d = np.einsum("ij,ij->i", normales, p - c)
    # Sens trigonometrique ou horaire : les normales doivent sortir.
    if np.all(d < 0):
        normales, d = -normales, -d
    return c, normales, d


def jauge(poly, pts):
    """La jauge de chaque point de `pts` (N x 2) dans le polygone `poly`."""
    c, normales, d = _jauge(poly)
    q = np.asarray(pts, dtype=float) - c
    return np.max(q @ normales.T / d, axis=1)


def _tranche(poly, x):
    """L'intervalle [bas, haut] du polygone convexe a l'abscisse x, ou None."""
    ys = []
    n = len(poly)
    for i in range(n):
        (x0, y0), (x1, y1) = poly[i], poly[(i + 1) % n]
        if (x0 - x) * (x1 - x) > 0:
            continue
        if x0 == x1:
            ys += [y0, y1]
        else:
            ys.append(y0 + (y1 - y0) * (x - x0) / (x1 - x0))
    return (min(ys), max(ys)) if ys else None


def marge_pire(poly, taus, hauts, bas):
    """La marge du gabarit contre l'oeil PIRE CAS : le plus grand facteur k tel
    que le gabarit agrandi de k autour de son centre tienne, phase par phase,
    entre la frontiere basse et la frontiere haute de l'oeil -- moins un.

    CE N'EST PAS LA JAUGE DES POINTS DE LA FRONTIERE. Dans les croisements,
    la frontiere pire cas plonge sous le seuil alors que de vraies traces y
    passent par zero : juger ses points comme des traces rendrait une marge
    plus large que celle de l'oeil PRBS, qui n'en est pourtant qu'un cas
    particulier. Ici, une phase ou l'oeil pire cas est ferme ne laisse passer
    AUCUNE part du gabarit."""
    p = np.asarray(poly, dtype=float)
    c = p.mean(axis=0)
    phases = [(t, h, b) for t, h, b in zip(taus, hauts, bas)]

    def tient(k):
        q = c + k * (p - c)
        for t, h, b in phases:
            tr = _tranche(q, t)
            if tr is None:
                continue
            if h is None or b is None or tr[1] > h or tr[0] < b:
                return False
        return True

    if not tient(1e-6):
        return -1.0
    lo, hi = 1e-6, 1.0
    while tient(hi) and hi < 1e3:
        lo, hi = hi, hi * 2.0
    for _ in range(40):
        mi = 0.5 * (lo + hi)
        if tient(mi):
            lo = mi
        else:
            hi = mi
    return float(lo - 1.0)


# ==========================================================================
# L'oeil statistique : gigue aleatoire, bruit, diaphonie bornee
# --------------------------------------------------------------------------
# LA QUESTION QUE LE PIRE CAS NE POSE PAS. L'oeil pire cas est la frontiere
# qu'AUCUNE sequence ne franchit ; il ne dit pas combien de fois on s'en
# approche. Une liaison se juge pourtant a un taux d'erreur (10^-12 pour
# PCIe et SATA), et deux choses le fixent que la reponse a un bit ne porte
# pas : la gigue de l'emetteur, qui deplace l'instant ou l'on lit, et le
# bruit, qui deplace la tension lue.
#
# LA METHODE EST CELLE DES YEUX STATISTIQUES (StatEye, mode statistique de
# l'IBIS-AMI), sans tirage au sort :
#
#   1. A CHAQUE PHASE, la tension lue pour un « 1 » est
#          v_c + A c_0 + sum_k a_k A c_k        (a_k = ±1, independants)
#      -- sa densite est le produit de convolution de deux Dirac par
#      curseur. On la construit sur une grille de tensions, curseur apres
#      curseur, dans le domaine des PROBABILITES (jamais negatives, d'ou des
#      queues justes jusqu'a 10^-300 ; une transformee de Fourier
#      plafonnerait au bruit d'arrondi, vers 10^-16).
#   2. LE BRUIT GAUSSIEN DU RECEPTEUR (V rms) se convolue ensuite, et chaque
#      AGRESSEUR borne y entre comme un curseur de plus : deux Dirac a ±A.
#      C'est l'hypothese du pire cas borne -- l'agresseur bascule, il n'a
#      pas de queue -- et c'est elle qui fait converger cet oeil vers le pire
#      cas quand le taux vise descend.
#   3. LA GIGUE (RJ gaussienne en UI rms, DJ en double Dirac crete a crete)
#      melange les phases : lire a tau + J, c'est lire la densite de la
#      phase tau + J. Les poids sont les probabilites de J sur chaque case
#      de phase (1/64 UI), integrees exactement (erfc).
#   4. Le taux d'erreur a (tau, v) vaut
#          BER = 1/2 P(V1 < v) + 1/2 P(V0 > v)
#      et, les donnees etant symetriques, V0 - v_c a la loi de -(V1 - v_c) :
#      une seule densite suffit. Le CONTOUR a 10^-n est la frontiere
#      BER = 10^-n ; la BAIGNOIRE est le BER au seuil, phase par phase.
#
# LA QUANTIFICATION ne s'additionne pas au pire endroit. Chaque curseur est
# arrondi a la case, et l'erreur d'arrondi est REPORTEE sur le suivant (les
# curseurs ranges du plus fort au plus faible) : l'extreme -- tous les bits
# contre l'oeil, la ou se lisent les petits taux -- reste exact a une demi-
# case pres, au lieu de cumuler une demi-case par curseur.
#
# CE QUE CE MODELE SUPPOSE, et le resultat le redit : des bits independants
# et equiprobables (pas la sequence PRBS), une gigue rapportee a
# l'echantillonneur -- celle de l'emetteur n'y est pas filtree par le canal,
# ce qui est PRUDENT sur une liaison a pertes --, et une decision du DFE
# toujours juste.
# ==========================================================================

NIVEAUX_BER = (1e-6, 1e-9, 1e-12, 1e-15)
CASES_STAT = 2048
# Ecarts-types gardes dans les queues gaussiennes : Q(8,5) = 9,5e-18, sous
# le plus petit des niveaux traces.
QUEUE_GAUSS = 8.5
PLANCHER_BER = 1e-40
# Phases de l'oeil statistique par phase affichee : voir `oeil_statistique`.
SUR_ECHANTILLONNAGE = 4


def q_gauss(x):
    """La queue gaussienne Q(x) = P(N(0,1) > x)."""
    return 0.5 * math.erfc(x / math.sqrt(2.0))


def q_inverse(p):
    """x tel que Q(x) = p, par dichotomie sur erfc (p entre 1e-300 et 0,5)."""
    p = min(max(float(p), 1e-300), 0.5)
    lo, hi = 0.0, 40.0
    for _ in range(200):
        mi = 0.5 * (lo + hi)
        if q_gauss(mi) > p:
            lo = mi
        else:
            hi = mi
    return 0.5 * (lo + hi)


def _masse_gauss(a, b):
    """P(a < N(0,1) < b), juste dans les deux queues (erfc, jamais 1 - 1)."""
    if a >= 0:
        return q_gauss(a) - q_gauss(b)
    if b <= 0:
        return q_gauss(-b) - q_gauss(-a)
    return 1.0 - q_gauss(b) - q_gauss(-a)


def _noyau_gauss(sigma, pas):
    """Le noyau d'un bruit gaussien sur des cases de largeur `pas`, ou None."""
    if not sigma > 0:
        return None
    k = int(math.ceil(QUEUE_GAUSS * sigma / pas))
    if k < 1:
        return None
    return np.array([_masse_gauss((i - 0.5) * pas / sigma,
                                  (i + 0.5) * pas / sigma)
                     for i in range(-k, k + 1)])


def poids_gigue(rj_ui, dj_ui, spu, m_max):
    """Les poids de la gigue sur les decalages de phase -m_max..m_max.

    J = DJ (double Dirac a ±DJ/2) + RJ (gaussienne). Le poids du decalage m
    est P(J dans [(m - 1/2)/spu, (m + 1/2)/spu]). Sans RJ, chaque Dirac se
    partage entre les deux phases qui l'encadrent."""
    m = np.arange(-m_max, m_max + 1)
    w = np.zeros(len(m))
    diracs = [-dj_ui / 2.0, dj_ui / 2.0] if dj_ui > 0 else [0.0]
    for d in diracs:
        part = 1.0 / len(diracs)
        if rj_ui > 0:
            for i, mm in enumerate(m):
                w[i] += part * _masse_gauss(((mm - 0.5) / spu - d) / rj_ui,
                                            ((mm + 0.5) / spu - d) / rj_ui)
        else:
            x = d * spu
            k = int(math.floor(x))
            f = x - k
            for kk, pp in ((k, 1.0 - f), (k + 1, f)):
                if -m_max <= kk <= m_max:
                    w[kk + m_max] += part * pp
    return w


def _quantifier(principal, amplitudes, pas):
    """(case du principal, decalages entiers) avec report de l'erreur.

    L'extreme bas principal - sum |a| est rendu a une demi-case pres, quel
    que soit le nombre de curseurs : chaque arrondi rattrape le precedent."""
    x0 = principal / pas
    f0 = math.floor(x0)
    d = x0 - (f0 + 0.5)
    q = []
    for a in amplitudes:
        x = a / pas
        k = int(round(x - d))
        k = max(k, 0)
        d = d - x + k
        q.append(k)
    return int(f0), q


def oeil_statistique(p_eq, i_s, spu, amp, prises, bornes=(), rj_ui=0.0,
                     dj_ui=0.0, bruit_v=0.0, niveaux=NIVEAUX_BER,
                     cases=CASES_STAT, sur=SUR_ECHANTILLONNAGE):
    """L'oeil statistique autour de l'echantillonnage i_s. Voir plus haut.

    `p_eq` : reponse a un bit (normalisee, excursion 2 amp), egalisee ;
    `prises` : DFE (V) ; `bornes` : cretes des agresseurs (V) ; `rj_ui`,
    `dj_ui` : gigue en UI ; `bruit_v` : bruit du recepteur en V rms.
    Les tensions rendues sont relatives au seuil (u = v - v_c), a chacune
    des `spu` phases de l'affichage.

    LES PHASES SONT AFFINEES `sur` FOIS. Le melange de gigue pose chaque
    croisement au milieu d'une case de phase : a 1/64 UI, c'est une demi-
    case de biais sur la largeur, 0,15 en echelle Q pour une gigue de
    0,05 UI rms -- un facteur deux sur le taux d'erreur. La reponse a un bit
    est lisse a cette echelle : on l'interpole, et le biais tombe d'autant."""
    spu_aff = spu
    if sur > 1:
        p_eq = np.interp(np.arange(len(p_eq) * sur) / float(sur),
                         np.arange(len(p_eq)), p_eq)
        i_s, spu = i_s * sur, spu * sur
    ext = dj_ui / 2.0 + QUEUE_GAUSS * rj_ui
    m_max = int(math.ceil(ext * spu - 1e-9)) if ext > 0 else 0
    tronquee = m_max > spu // 2
    m_max = min(m_max, spu // 2)
    bornes = [abs(float(b)) for b in (bornes or ()) if abs(float(b)) > 0]

    # -- les curseurs de chaque phase, et la plage des tensions ----------
    phases = []
    y_max = 0.0
    for o_ in range(-spu // 2 - m_max, spu // 2 + m_max):
        j = i_s + o_
        if j < 0:
            phases.append(None)
            continue
        k0, c = _curseurs(p_eq, j, spu)
        principal = amp * float(c[k0])
        reste = amp * np.delete(c, k0)
        rangs = np.delete(np.arange(len(c)) - k0, k0)
        for jj, dj in enumerate(prises or (), start=1):
            idx = np.where(rangs == jj)[0]
            if len(idx):
                reste[idx[0]] -= dj
        mags = sorted([float(x) for x in np.abs(reste)] + bornes,
                      reverse=True)
        phases.append((principal, mags))
        y_max = max(y_max, abs(principal) + sum(mags))
    y_max += QUEUE_GAUSS * max(bruit_v, 0.0)
    y_max = max(y_max * 1.02, 1e-9)
    n = int(cases) // 2 * 2
    pas = 2.0 * y_max / n
    noyau = _noyau_gauss(bruit_v, pas)

    # -- la densite de chaque phase, puis sa fonction de repartition -----
    rep = np.zeros((len(phases), n + 1))
    for ip, ph in enumerate(phases):
        if ph is None:
            rep[ip, 1:] = 1.0                 # rien a lire : tout est faux
            continue
        principal, mags = ph
        f0, qs = _quantifier(principal, mags, pas)
        dens = np.zeros(n)
        dens[min(max(f0 + n // 2, 0), n - 1)] = 1.0
        for q in qs:
            if q <= 0:
                continue
            if q >= n:
                dens = 0.5 * dens
                continue
            nouv = np.zeros(n)
            nouv[q:] += dens[:-q]
            nouv[:-q] += dens[q:]
            dens = 0.5 * nouv
        if noyau is not None:
            dens = np.convolve(dens, noyau, mode="same")
        rep[ip, 1:] = np.cumsum(dens)

    # -- la gigue melange les phases --------------------------------------
    w = poids_gigue(rj_ui, dj_ui, spu, m_max)
    mel = np.zeros((spu, n + 1))
    for i, wi in enumerate(w):
        if wi > 0:
            mel += wi * rep[i:i + spu]
    # Le taux d'erreur a la distance u du seuil : 1/2 (F(u) + F(-u)).
    mi = n // 2
    g = 0.5 * (mel[:, mi:] + mel[:, mi::-1])
    g = np.maximum(g, 0.0)
    u = pas * np.arange(mi + 1)
    baignoire = g[:, 0]

    def demi(b):
        """La demi-ouverture u* (V) a chaque phase, ou None si fermee."""
        sortie = []
        lg = np.log10(np.maximum(g, 1e-300))
        lb = math.log10(b)
        for ip in range(spu):
            if g[ip, 0] > b:
                sortie.append(None)
                continue
            au_dela = np.nonzero(g[ip] > b)[0]
            if not len(au_dela):
                sortie.append(float(u[-1]))
                continue
            k = int(au_dela[0])
            a0, a1 = lg[ip, k - 1], lg[ip, k]
            f = (lb - a0) / (a1 - a0) if a1 > a0 else 0.0
            sortie.append(float(u[k - 1] + min(max(f, 0.0), 1.0) * pas))
        return sortie

    def largeur(b):
        """La largeur (UI) ou BER <= b au seuil, bords interpoles en log."""
        c0 = spu // 2
        if baignoire[c0] > b:
            return 0.0
        if np.all(baignoire <= b):
            return 1.0
        lb = math.log10(b)

        def bord(sens):
            k = 0
            while k + 1 < spu and baignoire[(c0 + sens * (k + 1)) % spu] <= b:
                k += 1
            a0 = math.log10(max(baignoire[(c0 + sens * k) % spu], 1e-300))
            a1 = math.log10(max(baignoire[(c0 + sens * (k + 1)) % spu],
                                1e-300))
            f = (lb - a0) / (a1 - a0) if a1 > a0 else 0.0
            return k + min(max(f, 0.0), 1.0)
        return min(1.0, (bord(1) + bord(-1)) / spu)

    contours = []
    for b in niveaux:
        d = demi(b)
        contours.append({"ber": float(b), "u": d,
                         "hauteur": 2.0 * d[spu // 2]
                         if d[spu // 2] is not None else 0.0,
                         "largeur_ui": largeur(b)})
    # La baignoire verticale a l'echantillonnage : BER en fonction de u.
    pas_v = max(1, (mi + 1) // 200)
    for c in contours:
        c["u"] = c["u"][::sur]
    return {
        "contours": contours,
        "baignoire": [max(float(x), PLANCHER_BER)
                      for x in baignoire[::sur]],
        "baignoire_v": {"u": [float(x) for x in u[::pas_v]],
                        "ber": [max(float(x), PLANCHER_BER)
                                for x in g[spu // 2, ::pas_v]]},
        "pas_v": pas, "cases": n, "gigue_tronquee": bool(tronquee),
        "phases": int(spu), "phases_affichees": int(spu_aff),
    }


# ==========================================================================
# L'oeil, a partir d'une fonction de transfert
# ==========================================================================

def _params(o, g):
    """Les reglages du document, completes par ceux du gabarit."""
    em = (g or {}).get("emetteur") or {}
    rc = (g or {}).get("recepteur") or {}
    debit = _nombre(o.get("debit"), 0.0) or _nombre((g or {}).get("debit"), 0.0)
    if not debit > 0:
        raise ErreurOeil("Débit absent ou nul.",
                         "Saisissez le débit de la liaison, en bit/s.")
    if debit > 64e9:
        raise ErreurOeil("Débit de %.3g Gb/s : au-delà de ce que le modèle de "
                         "ligne tient." % (debit / 1e9),
                         "Le calcul de section est quasi-statique.")
    ui = 1.0 / debit

    def val(cle, defaut, source=None):
        v = o.get(cle)
        if v is None or v == "":
            v = (source or {}).get(cle, defaut)
        return _nombre(v, defaut)

    tr = val("tr", 0.3 * ui, em)
    if not tr > 0:
        tr = 0.3 * ui
    p = {
        "debit": debit, "ui": ui, "tr": tr,
        "v_haut": val("v_haut", 1.0, em), "v_bas": val("v_bas", 0.0, em),
        "r_source": max(0.1, val("r_source", 50.0, em)),
        "r_charge": max(0.0, val("r_charge", 50.0, rc)),
        "c_charge": max(0.0, val("c_charge", 0.0, rc)),
        "mode": "diff" if (o.get("mode") or (g or {}).get("mode")) == "diff"
                else "simple",
        "motif": str(o.get("motif") or "prbs7").lower(),
    }
    if p["v_haut"] <= p["v_bas"]:
        raise ErreurOeil("Le niveau haut de l'émetteur n'est pas au-dessus du "
                         "niveau bas.")
    ffe = o.get("ffe")
    if ffe is None or ffe == "":
        ffe = em.get("ffe") or [1.0]
        principal = em.get("ffe_principal", 0)
    else:
        principal = o.get("ffe_principal")
    try:
        ffe = [float(x) for x in ffe]
    except (TypeError, ValueError):
        raise ErreurOeil("Coefficients de pré-accentuation illisibles.",
                         "Écrivez-les séparés par des espaces, ex. « 0.83 -0.17 ».")
    if not ffe or len(ffe) > 8 or not any(abs(x) > 0 for x in ffe):
        raise ErreurOeil("Pré-accentuation : entre 1 et 8 coefficients, pas "
                         "tous nuls.")
    if principal is None or principal == "":
        principal = int(np.argmax(np.abs(ffe)))
    principal = int(_nombre(principal, 0))
    if not 0 <= principal < len(ffe):
        principal = int(np.argmax(np.abs(ffe)))
    p["ffe"], p["ffe_principal"] = ffe, principal

    eg = ((g or {}).get("egaliseur") or {}) if o.get("egaliseur", True) else {}
    p["ctle"] = o.get("ctle") or eg.get("ctle")
    dfe = eg.get("dfe") or {}
    p["dfe_prises"] = int(_nombre(o.get("dfe_prises"), dfe.get("prises", 0)))
    p["dfe_prises"] = max(0, min(p["dfe_prises"], 8))
    p["dfe_max"] = _nombre(o.get("dfe_max"), dfe.get("max_v", 0.05))
    p["setup"] = _nombre(o.get("setup"), (g or {}).get("setup", 0.0))
    p["hold"] = _nombre(o.get("hold"), (g or {}).get("hold", 0.0))
    # -- les condensateurs de liaison (2.3.0) : FACULTATIFS ----------------
    # Absents, rien n'est pose dans la cascade et le continu est celui
    # d'avant : l'oeil est celui de la 2.2.0 au bit pres.
    p["couplage_ac"] = couplage_ac(o.get("couplage_ac"), p)

    # -- la gigue, le bruit, la diaphonie : TOUT EST FACULTATIF ----------
    # Sans aucun de ces champs, l'oeil est celui d'avant, a l'octet pres :
    # rien n'est calcule et rien n'est ajoute au resultat.
    rj = _nombre(o.get("rj"), 0.0) / ui if o.get("rj") not in (None, "") \
        else _nombre(o.get("rj_ui"), 0.0)
    dj = _nombre(o.get("dj"), 0.0) / ui if o.get("dj") not in (None, "") \
        else _nombre(o.get("dj_ui"), 0.0)
    if rj < 0 or dj < 0 or _nombre(o.get("bruit_v"), 0.0) < 0:
        raise ErreurOeil("Gigue ou bruit négatif.",
                         "La gigue aléatoire est un écart-type, la gigue "
                         "déterministe une excursion crête à crête : deux "
                         "grandeurs positives.")
    if dj >= 1.0:
        raise ErreurOeil("Gigue déterministe de %.2f UI : l'œil est fermé "
                         "avant tout calcul." % dj,
                         "Elle se saisit crête à crête, en secondes.")
    p["rj_ui"], p["dj_ui"] = rj, dj
    p["bruit_v"] = max(0.0, _nombre(o.get("bruit_v"), 0.0))
    ber = _nombre(o.get("ber_cible"), 0.0) or \
        _nombre((g or {}).get("ber"), 0.0) or 1e-12
    if not 1e-30 <= ber <= 1e-2:
        raise ErreurOeil("Taux d'erreur visé hors de 10⁻³⁰ … 10⁻².")
    p["ber_cible"] = ber
    bornes = []
    for i, a in enumerate(o.get("agresseurs") or []):
        if not isinstance(a, dict):
            continue
        crete = _nombre(a.get("crete_v"), 0.0)
        coef = _nombre(a.get("coef"), 0.0)
        v = _nombre(a.get("v"), 0.0)
        if not crete and coef and v:
            crete = abs(coef) * abs(v)
        if crete > 0:
            bornes.append({"nom": str(a.get("nom") or "agresseur %d" % (i + 1)),
                           "crete_v": abs(crete), "coef": abs(coef) or None,
                           "v": abs(v) or None, "source": "saisi"})
    p["bornes"] = bornes
    p["stat"] = bool(o.get("statistique") or rj > 0 or dj > 0
                     or p["bruit_v"] > 0 or bornes
                     or o.get("agresseurs_auto"))
    return p


def _candidats_ctle(spec):
    """Les reglages de CTLE a essayer : un seul, ou la liste de gains."""
    if not spec:
        return [None]
    liste = spec.get("adc_db")
    if isinstance(liste, (list, tuple)):
        return [dict(spec, adc_db=float(x)) for x in liste]
    return [dict(spec)]


def _curseurs(p_eq, i_s, spu):
    """Les curseurs de la reponse a un bit autour de l'echantillon i_s :
    (rang du principal, tableau des curseurs)."""
    k_avant = i_s // spu
    debut = i_s - k_avant * spu
    c = p_eq[debut::spu]
    return k_avant, c


def _ouverture(c, k0, amp, dfe_prises, dfe_max):
    """(demi-ouverture pire cas en V, prises DFE en V, residu ISI en V)."""
    principal = amp * c[k0]
    reste = amp * np.delete(c, k0)
    rangs = np.delete(np.arange(len(c)) - k0, k0)
    prises = []
    for j in range(1, dfe_prises + 1):
        idx = np.where(rangs == j)[0]
        if not len(idx):
            prises.append(0.0)
            continue
        dj = float(np.clip(reste[idx[0]], -dfe_max, dfe_max))
        prises.append(dj)
        reste[idx[0]] -= dj
    isi = float(np.sum(np.abs(reste)))
    return principal - isi, prises, isi


def oeil(freqs, abcds_ou_h, p, gab=None, h0=None, journal=None,
         non_lineaire=None, h0_bin=None, lent=None):
    """L'oeil complet a partir d'une cascade ABCD (ou d'un transfert H).

    `abcds_ou_h` : (N, 2, 2) ABCD -- on y ferme alors generateur et charge --,
    ou un vecteur H(f) deja ferme, accompagne de `h0`. C'est cette seconde
    forme que les bancs emploient pour des canaux ideaux.

    `non_lineaire` : la liaison simulee dans le temps avec ses tampons IBIS
    (voir `simuler_non_lineaire`). La reponse a un echelon et la forme
    d'onde PRBS viennent alors de la simulation, et non de la superposition ;
    le reste -- egaliseur, pire cas, oeil statistique, gabarit -- est le
    meme, sur la reponse a un bit MOYENNE des deux fronts. Un `x0` dans le
    dictionnaire (flot AMI) est le niveau etabli de sa reponse a un echelon,
    1 sinon.

    `h0_bin` : la case du continu de l'IFFT quand elle differe de `h0` --
    des condensateurs de liaison sans terminaison (`continu_couplage_ac`,
    le pont diviseur) : l'oeil reste centre sur `h0`, la reponse derive
    vers `h0_bin`. `lent` {h0, tau} : leur POLE LENT quand une terminaison
    les decharge -- la decharge est alors comptee exactement
    (`reponse_indicielle_ac`), et `h0_bin` ne sert plus."""
    freqs = np.asarray(freqs, dtype=float)
    av = []
    nl = non_lineaire
    arr = np.asarray(abcds_ou_h)
    ca = p.get("couplage_ac")
    if nl is not None:
        h, h0 = None, float(nl.get("x0", 1.0))
    elif arr.ndim == 3:
        h, h0 = transfert(arr, freqs, p["r_source"], p["r_charge"],
                          p["c_charge"])
        if ca and h0_bin is None and lent is None:
            h0_bin, lent = _continu_ac_simple(ca, arr, freqs, p)
    else:
        h = arr.astype(complex)
        if h0 is None:
            h0 = float(abs(h[0]))
    if h0_bin is None:
        h0_bin = h0
    ui, tr = p["ui"], p["tr"]
    spu = ECHANTILLONS_UI
    dt_e = ui / spu
    amp = (p["v_haut"] - p["v_bas"]) / 2.0
    v_mil = (p["v_haut"] + p["v_bas"]) / 2.0
    df = freqs[1] - freqs[0]
    fenetre = 1.0 / df
    t_h = fenetre / 2.0
    if nl is not None:
        t_h = len(nl["s"]) * nl["dt"]

    meilleur = None
    for spec in _candidats_ctle(p.get("ctle")):
        x0 = h0 * _gain_continu_ctle(spec)
        if nl is not None:
            dt = nl["dt"]
            s = filtrer_ctle(nl["s"], dt, spec)
            n_h = len(s)
        else:
            hc = h * ctle(freqs, spec) if spec else h
            n_min = int(math.ceil(fenetre / min(dt_e, tr / 8.0)))
            if lent:
                dt, s = reponse_indicielle_ac(
                    freqs, hc, lent["h0"] * _gain_continu_ctle(spec), tr,
                    n_min, lent["tau"])
            else:
                dt, s = reponse_indicielle(freqs, hc,
                                           h0_bin * _gain_continu_ctle(spec),
                                           tr, n_min)
            n_h = int(t_h / dt)
        s_h = s[:n_h]
        # Le pas de l'oeil : interpolation lineaire de la reponse fine.
        n_p = int(math.ceil((t_h + ui) / dt_e)) + 1
        t_e = np.arange(n_p) * dt_e
        t_fin = s_h[-1]
        s_e = np.interp(t_e, np.arange(n_h) * dt, s_h, left=0.0, right=t_fin)
        s_dec = np.interp(t_e - ui, np.arange(n_h) * dt, s_h, left=0.0,
                          right=t_fin)
        p1 = s_e - s_dec
        # LA PRE-ACCENTUATION, sur la reponse a un bit : le symbole emis est
        # sum c_j a_(n-j), donc la reponse est sum c_j p(t - j UI).
        p_eq = np.zeros(n_p + (len(p["ffe"]) - 1) * spu)
        for j, cj in enumerate(p["ffe"]):
            p_eq[j * spu:j * spu + n_p] += cj * p1
        i_pk = int(np.argmax(p_eq))
        # L'INSTANT D'ECHANTILLONNAGE : celui qui ouvre le plus l'oeil pire
        # cas, a plus ou moins une demi-UI du sommet.
        # UN PLATEAU SE PREND PAR SON MILIEU : sur une liaison sans
        # interference entre bits, toutes les phases du plateau ouvrent
        # autant, et retenir la premiere decentrerait l'oeil d'autant.
        # On cherche sur une UI de part et d'autre du sommet : le sommet tombe
        # n'importe ou sur le plateau (une ondulation de Gibbs suffit), et
        # au-dela d'une UI le « principal » serait le bit voisin.
        essais = []
        for o_ in range(-spu, spu):
            i_s = i_pk + o_
            if i_s < 0:
                continue
            k0, c = _curseurs(p_eq, i_s, spu)
            ouv, prises, isi = _ouverture(c, k0, amp, p["dfe_prises"],
                                          p["dfe_max"])
            essais.append((ouv, o_, prises, isi))
        # L'ECHANTILLONNAGE AU MILIEU DE L'OEIL, ENTRE LES DEUX CROISEMENTS :
        # c'est ce que fait une recuperation d'horloge, et c'est la qu'un
        # gabarit se pose. On prend la plage de phases ou l'oeil pire cas est
        # ouvert, autour du maximum, et son milieu. Un oeil ferme n'a pas de
        # plage : on garde le maximum, a un pour cent pres (une ondulation de
        # quelques millivolts sur un palier suffirait sinon a le placer au
        # bord du palier).
        haut = max(e[0] for e in essais)
        ib = max(range(len(essais)), key=lambda i: essais[i][0])
        seuil = 0.0 if haut > 0 else \
            haut - (0.01 * abs(haut) + 1e-4 * max(abs(amp), 1e-12))
        g_, d_ = ib, ib
        while g_ - 1 >= 0 and essais[g_ - 1][0] > seuil:
            g_ -= 1
        while d_ + 1 < len(essais) and essais[d_ + 1][0] > seuil:
            d_ += 1
        best = essais[(g_ + d_) // 2]
        cand = {"spec": spec, "x0": x0, "s": s, "dt": dt, "n_h": n_h,
                "p_eq": p_eq, "i_pk": i_pk, "ouv": best[0], "o": best[1],
                "prises": best[2], "isi": best[3]}
        if meilleur is None or cand["ouv"] > meilleur["ouv"]:
            meilleur = cand

    m = meilleur
    s, dt, n_h, x0 = m["s"], m["dt"], m["n_h"], m["x0"]
    p_eq, i_pk, o_s, prises = m["p_eq"], m["i_pk"], m["o"], m["prises"]
    i_s = i_pk + o_s

    ordre = {"prbs7": 7, "prbs9": 9, "prbs15": 15}.get(p["motif"])
    if ordre is None:
        raise ErreurOeil("Motif « %s » inconnu." % p["motif"],
                         "Choisissez PRBS7, PRBS9 ou PRBS15.")
    bits = prbs(ordre)
    # LA FORME D'ONDE SIMULEE, une periode du motif : demandee ici, avant
    # l'echantillonnage, parce qu'un recepteur AMI y rend son horloge.
    onde_nl = None if nl is None else np.asarray(nl["onde"](bits),
                                                  dtype=float)
    # -- L'HORLOGE RECUPEREE (2.4.0) --------------------------------------
    # Un recepteur AMI dont l'AMI_GetWave rend ses instants d'horloge FIXE
    # l'echantillonnage, comme dans le circuit : la phase de l'oeil est leur
    # phase moyenne (et non plus le centre que l'outil choisit), le pire cas
    # et l'oeil statistique s'y lisent, et chaque bit de l'oeil PRBS est lu
    # a SON instant -- la gigue de la recuperation d'horloge comprise.
    cdr = None
    hz = ((nl or {}).get("ami") or {}).get("horloges") or {}
    if hz.get("instants") is not None and len(hz["instants"]):
        inst = np.asarray(hz["instants"], dtype=float)
        phase = (np.angle(np.mean(np.exp(2j * math.pi * inst / spu)))
                 / (2 * math.pi) * spu) % spu
        d = ((phase - i_s) + spu / 2.0) % spu - spu / 2.0
        if i_pk + o_s + int(round(d)) >= 0:
            o_s += int(round(d))
            i_s = i_pk + o_s
            k0, c = _curseurs(p_eq, i_s, spu)
            ouv, prises, isi = _ouverture(c, k0, amp, p["dfe_prises"],
                                          p["dfe_max"])
            m = dict(m, ouv=ouv, prises=prises, isi=isi, o=o_s)
            cdr = {"instants": inst, "phase_ui": phase / spu,
                   "decalage_ui": round(d) / spu}
    v_c = v_mil * x0
    echelle = max(float(np.max(np.abs(s[:n_h]))), 1e-12)
    # Avec des condensateurs de liaison qui se dechargent, la reponse DOIT
    # deriver dans la fenetre : ce n'est pas une sonnerie, et la fiche du
    # couplage le dit.
    if abs(s[n_h - 1] - x0) > 0.02 * echelle and not (ca and ca["tau"]):
        av.append("La réponse ne s'est pas éteinte dans la fenêtre de calcul "
                  "(%.3g ns) : la liaison sonne encore. Les niveaux peuvent "
                  "être faux de quelques pour cent." % (t_h * 1e9))
    if abs(s[0]) > 0.02 * echelle:
        av.append("La réponse déborde de la fenêtre de calcul et revient par "
                  "l'autre bout : l'œil est à prendre avec réserve.")

    # -- la diaphonie bornee ---------------------------------------------
    # CHAQUE AGRESSEUR AJOUTE SA CRETE AU PIRE CAS, avec son signe le plus
    # defavorable et au meme instant que les autres : c'est la definition du
    # pire cas, et la somme arithmetique est la seule qui en soit un. Le
    # bruit est saisi A LA BROCHE ; derriere un CTLE il passe par le gain du
    # CTLE dans la bande d'un front (jusqu'au genou 0,35 / tr), ce qui
    # majore ce qu'un front d'agresseur y laisse.
    agr = p.get("bornes") or []
    xt_gain = 1.0
    if agr and m["spec"]:
        f_g = freqs[freqs <= max(0.35 / tr, freqs[0])]
        xt_gain = float(np.max(np.abs(ctle(f_g, m["spec"]))))
    xt_crete = xt_gain * sum(b["crete_v"] for b in agr)

    # -- l'oeil pire cas, phase par phase --------------------------------
    taus, hauts, bas_ = [], [], []
    for o_ in range(-spu // 2, spu // 2):
        j = i_s + o_
        if j < 0:
            taus.append(o_ / spu)
            hauts.append(None)
            bas_.append(None)
            continue
        k0, c = _curseurs(p_eq, j, spu)
        principal = amp * c[k0]
        reste = amp * np.delete(c, k0)
        rangs = np.delete(np.arange(len(c)) - k0, k0)
        for jj, dj in enumerate(prises, start=1):
            idx = np.where(rangs == jj)[0]
            if len(idx):
                reste[idx[0]] -= dj
        isi = float(np.sum(np.abs(reste))) + xt_crete
        taus.append(o_ / spu)
        hauts.append(v_c + principal - isi)
        bas_.append(v_c - principal + isi)
    # Deux UI affichees : la periode se repete.
    tau_aff = [t - 1.0 for t in taus[spu // 2:]] + taus + \
              [t + 1.0 for t in taus[:spu // 2]] + [1.0]
    haut_aff = hauts[spu // 2:] + hauts + hauts[:spu // 2] + [hauts[spu // 2]]
    bas_aff = bas_[spu // 2:] + bas_ + bas_[:spu // 2] + [bas_[spu // 2]]
    ouvert = [hh is not None and hh > v_c and bb < v_c
              for hh, bb in zip(hauts, bas_)]
    larg_pire = _largeur(ouvert, spu // 2) / spu
    h_pire = 2.0 * (m["ouv"] - xt_crete)

    # -- l'oeil PRBS, par superposition ----------------------------------
    per = len(bits)
    # La convolution circulaire est exacte des que la periode emise couvre la
    # reponse a un bit : une repetition de plus ne doublerait que la memoire.
    rep = max(1, int(math.ceil(len(p_eq) / float(per * spu))))
    a = np.tile(2 * bits.astype(float) - 1.0, rep)
    nb = len(a)
    ns = nb * spu
    imp = np.zeros(ns)
    imp[::spu] = a
    pp = np.zeros(ns)
    pp[:len(p_eq)] = p_eq
    if nl is not None:
        # LA FORME D'ONDE SIMULEE, et non la superposition : le tampon non
        # lineaire ne la verifie pas. Elle est periodique (regime etabli),
        # et le CTLE s'y applique donc en circulaire, exactement.
        y = np.tile(onde_nl, rep)
        if len(p["ffe"]) > 1 or p["ffe"][0] != 1.0:
            # LA FFE SUR LA FORME D'ONDE SIMULEE, comme le flot IBIS-AMI la
            # pose sur la reponse du canal analogique : lineairement, la
            # somme des formes d'onde decalees d'un bit, autour du milieu.
            # Le tampon non lineaire n'a qu'un niveau par etat ; c'est la
            # meme approximation que celle d'un emetteur AMI.
            yy = np.zeros(ns)
            for j, cj in enumerate(p["ffe"]):
                yy += cj * np.roll(y - v_mil, j * spu)
            y = v_mil + yy
        if m["spec"]:
            fy = np.fft.rfftfreq(ns, dt_e)
            y = np.fft.irfft(np.fft.rfft(y) * ctle(fy, m["spec"]), ns)
    else:
        y = v_c + amp * np.fft.irfft(np.fft.rfft(imp) * np.fft.rfft(pp), ns)
    # LE DFE, sur la forme d'onde : la contre-reaction du bit n vaut
    # sum d_j a_(n-j) et tient toute l'UI centree sur son echantillonnage.
    if prises:
        fb = np.zeros(nb)
        for j, dj in enumerate(prises, start=1):
            fb += dj * np.roll(a, j)
        rang = ((np.arange(ns) - i_s + spu // 2) // spu) % nb
        y = y - fb[rang]
    # Le rang de chaque echantillon dans les deux UI affichees.
    rel = (np.arange(ns) - i_s) % ns
    col = (rel + spu) % (2 * spu)
    tau_ech = (col - spu) / float(spu)
    # Hauteur et largeur PRBS, phase par phase.
    idx_bits = np.arange(nb) * spu
    uns = a > 0
    h_phase, ouvert_prbs = [], []
    for o_ in range(-spu // 2, spu // 2):
        v = y[(idx_bits + i_s + o_) % ns]
        mn1 = float(np.min(v[uns]))
        mx0 = float(np.max(v[~uns]))
        h_phase.append(mn1 - mx0)
        ouvert_prbs.append(mn1 > v_c > mx0)
    h_prbs = h_phase[spu // 2]
    larg_prbs = _largeur(ouvert_prbs, spu // 2) / spu
    v_ech = y[(idx_bits + i_s) % ns]
    if cdr is not None:
        # chaque bit a l'instant de l'horloge recuperee qui le lit
        x = cdr["instants"]
        rang_b = np.round((x - i_s) / spu).astype(int)
        ecart = x - (rang_b * spu + i_s)
        dev = np.zeros(per)
        dev[rang_b % per] = ecart
        v_ech = y[(idx_bits + i_s + np.round(np.tile(dev, rep)).astype(int))
                  % ns]
        h_prbs = float(np.min(v_ech[uns]) - np.max(v_ech[~uns]))
        cdr.update({"ticks": int(len(x)),
                    "gigue_rms_ui": float(np.std(ecart)) / spu,
                    "gigue_cc_ui": float(np.ptp(ecart)) / spu})
        av.append("Horloge récupérée par le modèle AMI du récepteur, "
                  "imposée à l'échantillonnage : phase %.3f UI (%+.3f UI du "
                  "centre que l'outil aurait pris), gigue %.3f UI rms, "
                  "%.3f UI crête à crête sur %d instants."
                  % (cdr["phase_ui"], cdr["decalage_ui"],
                     cdr["gigue_rms_ui"], cdr["gigue_cc_ui"], cdr["ticks"]))
    niveau_1 = float(np.mean(v_ech[uns]))
    niveau_0 = float(np.mean(v_ech[~uns]))

    # -- le gabarit ------------------------------------------------------
    g_out = None
    mes_g = {}
    poly = []
    if gab:
        poly = gab.get("polygone_perso") or polygone(gab, ui, p["setup"],
                                                     p["hold"])
        g_out = {"id": gab.get("id", "perso"), "nom": gab.get("nom", ""),
                 "fiabilite": gab.get("fiabilite", ""),
                 "fiabilite_texte": FIABILITES.get(gab.get("fiabilite"), ""),
                 "source": gab.get("source", ""), "note": gab.get("note", ""),
                 "lieu": gab.get("lieu", ""), "polygone": poly,
                 "v_max": gab.get("v_max"), "v_min": gab.get("v_min")}
        if poly and len(poly) >= 3:
            dans = np.abs(tau_ech) <= 0.5 + 1e-9
            jg = jauge(poly, np.stack([tau_ech[dans], y[dans]], axis=1))
            mes_g = {"violations": int(np.sum(jg < 1.0)),
                     "marge": float(np.min(jg) - 1.0),
                     "marge_pire": marge_pire(poly, taus, hauts, bas_)}
        elif gab.get("masque", {}).get("type") == "seuils":
            av.append("Gabarit à seuils sans fenêtre setup/hold : saisissez "
                      "les temps du récepteur pour qu'il ait une largeur.")
        hors = 0
        if gab.get("v_max") is not None:
            hors += int(np.sum(y > float(gab["v_max"])))
        if gab.get("v_min") is not None:
            hors += int(np.sum(y < float(gab["v_min"])))
        mes_g["hors_limites"] = hors

    # -- l'oeil statistique, s'il est demande -----------------------------
    stat = None
    if p.get("stat"):
        niveaux = sorted(set(list(NIVEAUX_BER) + [p["ber_cible"]]),
                         reverse=True)
        st = oeil_statistique(p_eq, i_s, spu, amp, prises,
                              [xt_gain * b["crete_v"] for b in agr],
                              p["rj_ui"], p["dj_ui"], p["bruit_v"], niveaux)
        contours = []
        for c in st["contours"]:
            d = c["u"]
            # Deux UI affichees, comme le pire cas : la periode se repete.
            d_aff = d[spu // 2:] + d + d[:spu // 2] + [d[spu // 2]]
            contours.append({
                "ber": c["ber"], "hauteur": c["hauteur"],
                "largeur_ui": c["largeur_ui"],
                "haut": [None if x is None else round(v_c + x, 6)
                         for x in d_aff],
                "bas": [None if x is None else round(v_c - x, 6)
                        for x in d_aff]})
        cible = [c for c in st["contours"] if c["ber"] == p["ber_cible"]][0]
        mes_g["hauteur_ber"] = cible["hauteur"]
        mes_g["largeur_ber_ui"] = cible["largeur_ui"]
        mes_g["ber_cible"] = p["ber_cible"]
        if poly and len(poly) >= 3:
            d = cible["u"]
            mes_g["marge_ber"] = marge_pire(
                poly, taus, [None if x is None else v_c + x for x in d],
                [None if x is None else v_c - x for x in d])
        b_aff = st["baignoire"]
        stat = {
            "niveaux": [c["ber"] for c in contours],
            "ber_cible": p["ber_cible"],
            "tau": [round(t, 5) for t in tau_aff],
            "contours": contours,
            "baignoire": {"tau": [round(t, 5) for t in taus] + [0.5],
                          "ber": b_aff + [b_aff[0]]},
            "baignoire_v": {"v": [round(v_c + x, 6)
                                  for x in st["baignoire_v"]["u"]],
                            "ber": st["baignoire_v"]["ber"]},
            "rj_ui": p["rj_ui"], "dj_ui": p["dj_ui"],
            "rj_s": p["rj_ui"] * ui, "dj_s": p["dj_ui"] * ui,
            "bruit_v": p["bruit_v"],
            "pas_v": st["pas_v"], "cases": st["cases"],
            "hypotheses": [
                "Bits indépendants et équiprobables (et non la séquence "
                "PRBS) ; la gigue est rapportée à l'échantillonneur — celle "
                "de l'émetteur n'y est pas filtrée par le canal, ce qui est "
                "prudent sur une liaison à pertes ; décisions du DFE "
                "supposées justes ; chaque agresseur est un bruit borné à "
                "±sa crête, comme au pire cas."],
        }
        if st["gigue_tronquee"]:
            av.append("Gigue de plus d'une demi-UI à 10⁻¹⁷ : elle est "
                      "tronquée à ±0,5 UI, et l'œil statistique est fermé "
                      "bien avant.")

    # -- la densite ------------------------------------------------------
    bornes = [float(np.min(y)), float(np.max(y))]
    for t, v in poly:
        bornes.append(v)
    if gab:
        for cle in ("v_max", "v_min"):
            if gab.get(cle) is not None:
                bornes.append(float(gab[cle]))
    lo, hi = min(bornes), max(bornes)
    marge = 0.06 * max(hi - lo, 1e-6)
    lo, hi = lo - marge, hi + marge
    ny = LIGNES_DENSITE
    ligne_v = np.clip(((hi - y) / (hi - lo) * ny).astype(np.int32), 0, ny - 1)
    # LES TRACES SONT CONTINUES, PAS EN POINTILLES. Un front de 1,5 ns sur
    # une UI de 40 ns ne tombe que dans deux ou trois des 128 colonnes : en
    # ne comptant que les echantillons, il disparait de la figure. Chaque
    # segment entre deux echantillons successifs remplit donc les lignes
    # qu'il traverse dans sa colonne. La forme d'onde est periodique (produit
    # de convolution circulaire) : le dernier echantillon rejoint le premier.
    r0 = ligne_v
    r1 = np.roll(ligne_v, -1)
    bas_r = np.minimum(r0, r1)
    n_r = np.abs(r1 - r0) + 1
    debut_r = np.cumsum(n_r) - n_r
    total = int(n_r.sum())
    cases = np.repeat((bas_r.astype(np.int64) - debut_r) * (2 * spu) + col,
                      n_r)
    cases += np.arange(total, dtype=np.int64) * (2 * spu)
    comptes = np.bincount(cases, minlength=ny * 2 * spu)
    del cases, r0, r1, bas_r, n_r, debut_r

    # -- la reponse a un bit, pour la figure et l'export -----------------
    debut = max(0, i_s - 2 * spu)
    fin = min(len(p_eq), i_s + 10 * spu)
    pas = 2
    rep_bit = {"dt": dt_e * pas, "t0": (debut - i_s) * dt_e,
               "v": [round(float(v) * 2 * amp, 6)
                     for v in p_eq[debut:fin:pas]]}

    spec = m["spec"]
    if spec and spec.get("forme") == "pcie3":
        av.append("CTLE : gain continu retenu %.0f dB (le meilleur des "
                  "réglages essayés)." % spec["adc_db"])
    r = {
        "debit": p["debit"], "ui": ui, "tr": tr, "mode": p["mode"],
        "motif": p["motif"], "bits": int(nb),
        "seuil": v_c,
        "densite": {"nx": 2 * spu, "ny": ny, "v_haut": hi, "v_bas": lo,
                    "comptes": comptes.tolist(), "max": int(comptes.max())},
        "pire_cas": {"tau": [round(t, 5) for t in tau_aff],
                     "haut": [None if v is None else round(v, 6)
                              for v in haut_aff],
                     "bas": [None if v is None else round(v, 6)
                             for v in bas_aff]},
        "mesures": dict({
            "hauteur_prbs": h_prbs,
            "largeur_prbs_ui": larg_prbs,
            "hauteur_pire": float(h_pire),
            "largeur_pire_ui": larg_pire,
            "isi_pire": m["isi"],
            "principal": amp * float(p_eq[i_s]),
            "niveau_1": niveau_1, "niveau_0": niveau_0,
            "v_max_vu": float(np.max(y)), "v_min_vu": float(np.min(y)),
            "retard": (i_s * dt_e - ui / 2.0 - nl["t50"]
                       - p["ffe_principal"] * ui) if nl is not None
            else (i_s * dt_e - 4.0 * tr / TR_SUR_SIGMA - ui / 2.0
                  - p["ffe_principal"] * ui),
        }, **mes_g),
        "gabarit": g_out,
        "egalisation": {"ctle": spec, "dfe_v": prises,
                        "ffe": p["ffe"], "ffe_principal": p["ffe_principal"]},
        "reponse_bit": rep_bit,
        "grille": {"points": int(len(freqs)), "df": float(df),
                   "f_max": float(freqs[-1]), "fenetre": float(fenetre),
                   "h0": float(x0)},
        "avertissements": av,
    }
    if stat is not None:
        r["statistique"] = stat
    if cdr is not None:
        r["horloge_ami"] = {k: v for k, v in cdr.items() if k != "instants"}
        r["horloge_ami"]["imposee"] = True
    if agr:
        r["diaphonie"] = {
            "agresseurs": agr, "gain_ctle": xt_gain,
            "crete_totale_v": xt_crete,
            "note": "Somme arithmétique des crêtes (pire cas), ramenée à "
                    "l'échantillonneur. L'œil PRBS, lui, est sans "
                    "diaphonie : la séquence des voisines n'est pas connue."}
    return r


def _largeur(ouvert, centre):
    """Le nombre de phases ouvertes d'affilee autour de `centre`.

    `ouvert` couvre UNE UI, et l'oeil se repete d'une UI a l'autre : la
    recherche fait le tour. Sans cela, un echantillonnage un peu decentre
    tronquerait la largeur au bord de la fenetre au lieu de la mesurer."""
    n = len(ouvert)
    if not ouvert[centre]:
        return 0
    if all(ouvert):
        return n
    g = 0
    while g + 1 < n and ouvert[(centre - g - 1) % n]:
        g += 1
    d = 0
    while d + 1 < n and ouvert[(centre + d + 1) % n]:
        d += 1
    return min(n, g + d + 1)


# ==========================================================================
# Le point d'entree de la route
# ==========================================================================

def _longueur_mm(doc):
    total = 0.0
    for o in ((doc.get("geometry") or {}).get("objects") or []):
        lg = _nombre(o.get("length"), 0.0)
        if lg <= 0:
            a = o.get("start") or [0, 0]
            b = o.get("end") or [0, 0]
            lg = math.hypot(_nombre(b[0]) - _nombre(a[0]),
                            _nombre(b[1]) - _nombre(a[1]))
        total += lg
    return total


def _er_max(doc):
    er = [_nombre(c.get("epsilon_r"), 0.0)
          for c in ((doc.get("stackup") or {}).get("layers") or [])
          if c.get("type") != "copper"]
    er = [e for e in er if e > 0]
    return max(er) if er else 4.5


# ==========================================================================
# Les tampons IBIS : emetteur et recepteur non lineaires
# --------------------------------------------------------------------------
# QUAND UN FICHIER IBIS ARRIVE, la superposition ne vaut plus : un tampon
# CMOS n'a pas la meme resistance a l'etat haut et a l'etat bas, et ses
# diodes ecretent. La liaison se simule alors DANS LE TEMPS (`ibis.Liaison`) :
# le canal en ondes de puissance -- sa cascade ABCD, charge lineaire du
# recepteur comprise --, le tampon emetteur au bout gauche, les diodes du
# recepteur au bout droit, et un Newton a chaque pas.
#
# DEUX SIMULATIONS, ET LE RESTE NE CHANGE PAS :
#   · deux fronts isoles, un montant et un descendant, laisses s'etablir :
#     leur moyenne normalisee est la REPONSE A UN ECHELON dont le pire cas,
#     l'oeil statistique et l'egaliseur ont besoin (l'ecart entre les deux
#     se rend : c'est ce que la linearisation neglige) ;
#   · la sequence PRBS elle-meme, en regime etabli : c'est elle qui fait
#     l'oeil PRBS et sa densite, sans aucune linearisation.
#
# LE BOITIER (2.1.0) : R_pkg et L_pkg en serie, C_pkg a la broche, de
# chaque cote -- [Package], [Pin] par broche, diagonale d'un
# [Package Model] (voir `ibis.boitier_broche`). Il est LINEAIRE : on le fond
# dans la cascade du canal, ABCD contre ABCD, ENTRE le die (ou le tampon
# et C_comp restent au Newton) et la piste. Rien n'est ajoute au pas de
# temps -- ni inconnue, ni integration de plus --, et le boitier passe par
# le meme chemin que la piste : parametres S, fenetre, reponses
# impulsionnelles. Le prix : ses resonances au-dessus du haut de la grille
# sont lissees comme le reste (le lissage est la moitie du front du
# tampon, bien plus court que L_pkg / R0 ou R0 C_pkg pour les boitiers
# usuels). Un boitier nul ne touche pas la cascade : le resultat est celui
# d'avant, au bit pres.
#
# EN DIFFERENTIEL (2.1.0), LES DEUX BRINS. Chaque tampon attaque SON brin
# de la paire, remise par brin a partir de ses deux modes -- la cascade du
# mode impair (`abcd_dd`) et celle du mode commun, reconstruite des S_cc
# que `simulation_em` rend (voir `abcd_depuis_s`). Le brin inverse recoit
# la sequence inverse, retardee de tdelay ([Diff Pin]) ; chaque brin a son
# modele, son coin, son boitier, sa capacite d'entree. Ce qui n'est pas
# oppose part en mode commun, et se rend : `mode_commun` du resultat.
# Sans la cascade du mode commun, on retombe sur le demi-circuit du mode
# impair, le mode commun tenu a sa valeur continue, et on le dit.
# ==========================================================================

try:
    import ibis
    _exc_ibis = None
except Exception as _exc:                              # noqa: BLE001
    ibis = None
    _exc_ibis = _exc

# Pas de temps d'une simulation non lineaire, au plus : au-dela, quelques
# dizaines de secondes de calcul.
MAX_PAS_NL = 400000
# Le lissage du canal, en fraction du front du tampon : voir `ibis`.
LISSAGE_SUR_FRONT = 0.5
# La courbe du mode commun rendue : ses premiers bits, a ce pas par UI.
BITS_MODE_COMMUN = 40
PAS_MODE_COMMUN = 16


def _tampon(lu, nom, coin, role):
    """([Model], Tampon) du modele `nom` (ou du premier qui convient au
    role) d'un fichier lu."""
    modeles = lu["modeles"]
    if nom and nom not in modeles:
        raise ErreurOeil("IBIS de l'%s : pas de [Model] « %s » dans %s."
                         % (role, nom, lu["fichier"] or "le fichier"),
                         "Modèles présents : %s." % ", ".join(sorted(modeles)))
    if not nom:
        voulus = [m for m in modeles.values()
                  if ibis.est_emetteur(m) == (role == "émetteur")]
        nom = (voulus or list(modeles.values()))[0]["nom"]
    m = modeles[nom]
    try:
        t = ibis.Tampon(m, coin)
    except ibis.ErreurIbis as exc:
        raise ErreurOeil(exc.message, exc.conseil)
    return m, t


def _charger_ibis(d, role, diff=False, boitier=True, voisins=True,
                  r_voisin=50.0):
    """Un bout de la liaison, d'un champ `ibis_emetteur` ou `ibis_recepteur`
    {texte, fichier, modele, coin, broche, modele_n, coin_n} :
    {lu, m, t, m_n, t_n, bt, bt_n, broche, inverse, paire, notes}.

    LA BROCHE choisit le modele ([Pin], ou le premier d'un
    [Model Selector]) et le boitier. EN DIFFERENTIEL, la broche designe une
    paire de [Diff Pin], et le brin inverse prend le modele et le boitier
    de SA broche ; sans broche, la premiere paire dont le modele est celui
    choisi est prise d'office, et sans [Diff Pin] les deux brins prennent
    le meme modele et le boitier moyen."""
    try:
        lu = ibis.lire(d.get("texte") or "", str(d.get("fichier") or ""),
                       complet=True)
    except ibis.ErreurIbis as exc:
        raise ErreurOeil("IBIS de l'%s : %s" % (role, exc.message),
                         exc.conseil)
    coin = str(d.get("coin") or "typ").lower()
    coin_n = str(d.get("coin_n") or coin).lower()
    nom = str(d.get("modele") or "")
    nom_n = str(d.get("modele_n") or "")
    broche = str(d.get("broche") or "")
    inverse = ""
    paire = None
    notes = []

    def erreur(exc):
        return ErreurOeil("IBIS de l'%s : %s" % (role, exc.message),
                          exc.conseil)
    if diff:
        if broche:
            paire = ibis.paire_diff(lu, broche)
            if paire is None:
                liste = ", ".join("%s/%s" % (x["broche"], x["inverse"])
                                  for x in lu["paires_diff"])
                raise ErreurOeil(
                    "IBIS de l'%s : la broche %s n'est dans aucune "
                    "[Diff Pin]." % (role, broche),
                    ("Paires du fichier : %s." % liste) if liste else
                    "Le fichier n'a pas de [Diff Pin] : laissez la broche "
                    "vide, les deux brins prendront le même modèle.")
        else:
            for x in lu["paires_diff"]:
                try:
                    nm, _ = ibis.modele_broche(lu, x["broche"], nom)
                except ibis.ErreurIbis:
                    continue
                if not nom or nm == nom:
                    paire = dict(x, note="paire prise d'office")
                    break
        if paire is not None:
            broche, inverse = paire["broche"], paire["inverse"]
            if paire.get("note"):
                notes.append("%s : %s/%s, %s." % (role, broche, inverse,
                                                   paire["note"]))
    if broche:
        try:
            nom, note = ibis.modele_broche(lu, broche, nom)
        except ibis.ErreurIbis as exc:
            raise erreur(exc)
        if note:
            notes.append("%s, broche %s : %s." % (role, broche, note))
    if inverse:
        try:
            nom_n, note = ibis.modele_broche(lu, inverse, nom_n or nom)
        except ibis.ErreurIbis as exc:
            raise erreur(exc)
    m, t = _tampon(lu, nom, coin, role)
    m_n = t_n = None
    if diff:
        m_n, t_n = _tampon(lu, nom_n or m["nom"], coin_n, role)
    bt = bt_n = mut = cpl = None
    if boitier:
        # LES MUTUELLES DE LA PAIRE (2.2.0) : entre la broche et son
        # inverse, elles se comptent ; les autres se disent.
        if diff and broche and inverse:
            mut = ibis.mutuelle_paire(lu, broche, inverse)
        bt = ibis.boitier_broche(lu, broche, coin,
                                 comptee=inverse if mut else None)
        if diff:
            bt_n = ibis.boitier_broche(lu, inverse, coin_n,
                                       comptee=broche if mut else None)
        for x in (bt, bt_n):
            if x is not None:
                notes.extend(x["notes"])
        if mut:
            notes.append("%s : mutuelles du %s entre %s et %s comptées "
                         "(L_m %.3g nH, C_m %.3g pF ; k_L %.2f, k_C %.2f)."
                         % (role, mut["source"], broche, inverse,
                            mut["l"] * 1e9, mut["c"] * 1e12, mut["k_l"],
                            mut["k_c"]))
        bt = None if ibis.boitier_nul(bt) else bt
        bt_n = None if ibis.boitier_nul(bt_n) else bt_n
        # LES MUTUELLES HORS DE LA PAIRE (2.4.0, `ibis.voisins_boitier`) :
        # les voisines du [Package Model], au repos, fermees aux deux bouts
        # et eliminees. Elles remplacent la note « ignorées ».
        if broche and voisins:
            cpl = ibis.voisins_boitier(
                lu, [broche, inverse] if diff and inverse else [broche])
            if cpl is not None:
                cpl["r_voisin"] = r_voisin
                notes[:] = [x for x in notes
                            if not x.startswith("Mutuelles du [Package Model]")]
                courts = [x for x in cpl["voisines"]
                          if cpl["genres"][x] == "court"]
                notes.append(
                    "%s : mutuelles du [Package Model] %s vers %d broche(s) "
                    "voisine(s) comptées (%s ; couplage le plus fort k = "
                    "%.2f), voisines au repos fermées sur %.0f Ω aux deux "
                    "bouts%s." % (
                        role, cpl["nom"], len(cpl["voisines"]),
                        ", ".join(cpl["voisines"][:6])
                        + (", …" if len(cpl["voisines"]) > 6 else ""),
                        cpl["k_max"], r_voisin,
                        (", alimentations et masses (%s) en court-circuit"
                         % ", ".join(courts[:4])) if courts else ""))
    return {"lu": lu, "m": m, "t": t, "m_n": m_n, "t_n": t_n, "bt": bt,
            "bt_n": bt_n, "broche": broche, "inverse": inverse,
            "paire": paire, "notes": notes, "coin": coin, "mut": mut,
            "cpl": cpl}


def _infos_boitier(bt):
    if bt is None:
        return None
    sortie = {"r": bt["r"], "l": bt["l"], "c": bt["c"],
              "source": bt["source"]}
    if bt.get("sections"):
        sortie["sections"] = len(bt["sections"])
    return sortie


def _infos_mutuelle(mut):
    if not mut:
        return None
    return {"r": mut["r"], "l": mut["l"], "c": mut["c"], "k_l": mut["k_l"],
            "k_c": mut["k_c"], "source": mut["source"]}


def preparer_ibis(o, p):
    """Le contexte des tampons IBIS de la requete, ou None s'il n'y en a pas.

    Modifie `p` : la capacite du recepteur devient son C_comp, et un
    emetteur IBIS n'a ni pre-accentuation ni front gaussien -- ses niveaux
    et son front sont les siens. En differentiel, un `decalage_n` saisi
    suffit a simuler les deux brins, meme sans fichier."""
    em_d = o.get("ibis_emetteur")
    rx_d = o.get("ibis_recepteur")
    em_d = em_d if isinstance(em_d, dict) and em_d.get("texte") else None
    rx_d = rx_d if isinstance(rx_d, dict) and rx_d.get("texte") else None
    diff = p["mode"] == "diff"
    dec_saisi = diff and o.get("decalage_n") not in (None, "")
    dec = _nombre(o.get("decalage_n"), 0.0) if dec_saisi else 0.0
    if not (em_d or rx_d or dec):
        return None
    if ibis is None:
        raise ErreurOeil("Lecteur IBIS indisponible : %s" % _exc_ibis)
    if abs(dec) >= p["ui"]:
        raise ErreurOeil("Décalage du brin inverse de %.3g ps : au moins une "
                         "UI." % (dec * 1e12),
                         "Il se saisit en secondes, plus petit qu'un bit.")
    avec_bt = o.get("boitier", True) not in (False, 0, "0", "false", "non")
    avec_v = o.get("boitier_voisins", True) not in (False, 0, "0", "false",
                                                    "non")
    r_voisin = _nombre(o.get("r_voisin"), 50.0)
    if not r_voisin > 0:
        r_voisin = 50.0
    ctx = {"em": None, "m_em": None, "em_n": None, "m_em_n": None,
           "m_rx": None, "rx": None, "rx_n": None, "c_rx": None,
           "bt_em": (None, None), "bt_rx": (None, None), "decalage": 0.0, "vdiff": None,
           "mut_em": None, "mut_rx": None, "cpl_em": None, "cpl_rx": None,
           "infos": {}, "notes": [], "boitier": avec_bt,
           "r_mc": max(0.0, _nombre(o.get("r_charge_mc"), 0.0))}
    dt0 = p["ui"] / ECHANTILLONS_UI / 8.0
    if em_d:
        b = _charger_ibis(em_d, "émetteur", diff, avec_bt, avec_v, r_voisin)
        m, t = b["m"], b["t"]
        for mm in (m, b["m_n"]):
            if mm is not None and not ibis.est_emetteur(mm):
                raise ErreurOeil("Le [Model] « %s » est de type %s : ce "
                                 "n'est pas un émetteur."
                                 % (mm["nom"], mm["type"] or "inconnu"),
                                 "Choisissez un modèle Output, I/O ou "
                                 "3-state.")
        try:
            cmd = ibis.commandes(m, t, dt0)
            if diff:
                ibis.commandes(b["m_n"], b["t_n"], dt0)
        except ibis.ErreurIbis as exc:
            raise ErreurOeil(exc.message, exc.conseil)
        ctx.update(em=t, m_em=m, em_n=b["t_n"], m_em_n=b["m_n"],
                   bt_em=(b["bt"], b["bt_n"]), mut_em=b["mut"],
                   cpl_em=b["cpl"])
        ctx["notes"].extend(b["notes"])
        if b["paire"] is not None:
            ctx["decalage"] = float(b["paire"]["tdelay"][ibis.COINS[t.coin]])
        tr_e = ibis.duree_front(cmd["montant"], dt0)
        lu = b["lu"]
        ctx["infos"]["emetteur"] = {
            "fichier": lu["fichier"], "composant": lu["composant"],
            "modele": m["nom"], "type": m["type"], "coin": t.coin,
            "c_comp": t.c_comp, "commande": cmd["source"],
            "front_10_90": tr_e,
            "niveau_haut_vide": t.niveau(1.0, 0.0),
            "niveau_bas_vide": t.niveau(0.0, 1.0),
            "broche": b["broche"], "boitier": _infos_boitier(b["bt"]),
            "ignores": lu["ignores"]}
        if diff:
            ctx["infos"]["emetteur"].update({
                "inverse": b["inverse"], "modele_n": b["m_n"]["nom"],
                "coin_n": b["t_n"].coin,
                "boitier_n": _infos_boitier(b["bt_n"]),
                "tdelay": ctx["decalage"] if b["paire"] else None})
            if b["mut"]:
                ctx["infos"]["emetteur"]["mutuelle"] = _infos_mutuelle(b["mut"])
        p["tr"] = tr_e
        p["ffe"], p["ffe_principal"] = [1.0], 0
    if rx_d:
        b = _charger_ibis(rx_d, "récepteur", diff, avec_bt, avec_v, r_voisin)
        m, t, t_n = b["m"], b["t"], b["t_n"]
        ctx["m_rx"] = m
        # LA CAPACITE D'ENTREE PART DANS LE CANAL, lineaire ; seules les
        # diodes et les terminaisons restent au Newton. En differentiel,
        # deux broches en serie.
        if diff:
            cs = t.c_comp + t_n.c_comp
            p["c_charge"] = t.c_comp * t_n.c_comp / cs if cs > 0 else 0.0
            ctx["c_rx"] = (t.c_comp, t_n.c_comp)
        else:
            p["c_charge"] = t.c_comp
        for cle, tt in (("rx", t), ("rx_n", t_n)):
            if tt is not None and (tt.a_des_diodes() or tt.g_gnd or
                                   tt.g_pow):
                ctx[cle] = tt
        ctx["bt_rx"] = (b["bt"], b["bt_n"])
        ctx["mut_rx"] = b["mut"]
        ctx["cpl_rx"] = b["cpl"]
        ctx["notes"].extend(b["notes"])
        if b["paire"] is not None and b["paire"]["vdiff"]:
            ctx["vdiff"] = abs(float(b["paire"]["vdiff"]))
        lu = b["lu"]
        ctx["infos"]["recepteur"] = {
            "fichier": lu["fichier"], "composant": lu["composant"],
            "modele": m["nom"], "type": m["type"], "coin": t.coin,
            "c_comp": t.c_comp, "diodes": bool(t.a_des_diodes()),
            "vinl": t.vinl, "vinh": t.vinh, "broche": b["broche"],
            "boitier": _infos_boitier(b["bt"]), "ignores": lu["ignores"]}
        if diff:
            ctx["infos"]["recepteur"].update({
                "inverse": b["inverse"], "modele_n": b["m_n"]["nom"],
                "coin_n": t_n.coin, "c_comp_n": t_n.c_comp,
                "boitier_n": _infos_boitier(b["bt_n"]),
                "vdiff": ctx["vdiff"]})
            if b["mut"]:
                ctx["infos"]["recepteur"]["mutuelle"] = _infos_mutuelle(b["mut"])
    if dec_saisi:
        ctx["decalage"] = dec
    ctx["temporel"] = (ctx["em"] is not None or ctx["rx"] is not None or
                       ctx["rx_n"] is not None or
                       (diff and ctx["decalage"] != 0.0))
    ctx["paire"] = diff and ctx["temporel"]
    ctx["tr_e"] = p["tr"]
    ctx["tr_lissage"] = LISSAGE_SUR_FRONT * p["tr"]
    return ctx


def asymetries(ctx):
    """Ce qui distingue les deux brins d'une paire, en clair."""
    out = []
    if not ctx:
        return out
    if ctx["decalage"]:
        out.append("brin inverse décalé de %.3g ps" % (ctx["decalage"] * 1e12))
    a, b = ctx["em"], ctx["em_n"]
    if a is not None and b is not None:
        if ctx["m_em"] is not ctx["m_em_n"]:
            out.append("émetteur : modèles %s / %s" % (ctx["m_em"]["nom"],
                                                       ctx["m_em_n"]["nom"]))
        elif a.coin != b.coin:
            out.append("émetteur : coins %s / %s" % (a.coin, b.coin))
    rp, rn = ctx["rx"], ctx["rx_n"]
    if (rp is None) != (rn is None):
        out.append("récepteur : diodes sur un seul brin")
    if ctx["c_rx"] and abs(ctx["c_rx"][0] - ctx["c_rx"][1]) > 1e-18:
        out.append("récepteur : C_comp %.3g / %.3g pF"
                   % (ctx["c_rx"][0] * 1e12, ctx["c_rx"][1] * 1e12))
    for bout, cle in (("émetteur", "bt_em"), ("récepteur", "bt_rx")):
        a, b = ctx[cle]
        if (a is None) != (b is None) or (a is not None and any(
                abs(a[k] - b[k]) > 1e-6 * max(abs(a[k]), abs(b[k]), 1e-30)
                for k in ("r", "l", "c"))):
            out.append("%s : boîtiers différents" % bout)
    return out


def appliquer_boitiers(ctx, freqs, abcds, mode="simple"):
    """La cascade (N, 2, 2) entre die et die : boitier de l'emetteur IBIS
    devant, boitier du recepteur IBIS derriere. En differentiel (cascade
    du mode impair), le boitier de chaque brin est pose a l'identique sur
    les deux -- la MOYENNE des deux broches, serie doublee et derivation
    divisee par deux. Rend (abcds, note).

    LES MUTUELLES DE LA PAIRE (2.2.0, `ibis.mutuelle_paire`) entrent dans
    cette moyenne comme elles entrent dans le mode impair : L - L_m et
    R - R_m en serie, C + C_m a la broche. UN BOITIER PAR SECTIONS est sa
    cascade de lignes (`ibis.abcd_sections`) : les memes sections sur les
    deux brins se posent en mode impair telles quelles ([A, 2B ; C/2, D]),
    des sections differentes retombent sur la moyenne de leurs totaux --
    la cascade a quatre acces, elle, les pose brin par brin."""
    if not ctx:
        return abcds, ""
    m = np.array(abcds, dtype=complex)
    touche = mutuelle = False
    moyenne = ""
    voisins = False
    for cle, sens, actif, cle_m in (
            ("bt_em", "emission", ctx["em"] is not None, "mut_em"),
            ("bt_rx", "reception", True, "mut_rx")):
        a, b = ctx[cle]
        if not actif or (a is None and b is None):
            continue
        mb = None
        cpl = ctx.get("cpl" + cle_m[3:])
        if cpl is not None and (mode == "diff") == (cpl["victimes"] == 2):
            # LE BOITIER COUPLE A SES VOISINES (2.4.0) : en simple tel quel,
            # en differentiel par son mode impair
            mc = ibis.abcd_boitier_couple(freqs, cpl, sens, cpl["r_voisin"])
            mb = ibis.mode_impair_couple(mc) if mode == "diff" else mc
            voisins = True
            mutuelle = mutuelle or mode == "diff"
        elif mode == "diff":
            sa, sb = (a or {}).get("sections"), (b or {}).get("sections")
            if sa and sa == sb:
                m1 = ibis.abcd_boitier(freqs, a, sens)
                mb = m1.copy()
                mb[:, 0, 1] *= 2.0
                mb[:, 1, 0] /= 2.0
            else:
                if sa or sb:
                    moyenne = (" — boîtiers par sections différents sur "
                               "les deux brins : la moyenne de leurs totaux")
                mut = ctx.get(cle_m) or {}
                mutuelle = mutuelle or bool(mut)
                moy = {k: 0.5 * ((a or {}).get(k, 0.0) + (b or {}).get(k, 0.0))
                       for k in ("r", "l", "c")}
                bt = {"r": 2.0 * (moy["r"] - mut.get("r", 0.0)),
                      "l": 2.0 * (moy["l"] - mut.get("l", 0.0)),
                      "c": (moy["c"] + mut.get("c", 0.0)) / 2.0}
                mb = ibis.abcd_boitier(freqs, bt, sens)
        else:
            mb = ibis.abcd_boitier(freqs, a, sens)
        if mb is None:
            continue
        m = mb @ m if sens == "emission" else m @ mb
        touche = True
    if not touche:
        return abcds, ""
    return m, ("boîtiers comptés (R/L_pkg en série, C_pkg à la broche%s%s)%s"
               % (", mutuelles de la paire comprises" if mutuelle else "",
                  ", mutuelles vers les broches voisines comprises"
                  if voisins else "", moyenne))


def abcd_depuis_s(s_plats, z_ref):
    """(N, 2, 2) ABCD des S 2-ports a plat [[re, im] x 4] (S11, S12, S21,
    S22) sur z_ref : la cascade du mode commun que `simulation_em` rend
    sous forme de S_cc. Exacte, tant que S21 n'est pas nul."""
    s = np.array([[complex(v[0], v[1]) for v in m] for m in s_plats])
    s11, s12, s21, s22 = s[:, 0], s[:, 1], s[:, 2], s[:, 3]
    if np.any(np.abs(s21) < 1e-300):
        return None
    z = float(z_ref)
    m = np.empty((len(s), 2, 2), dtype=complex)
    m[:, 0, 0] = ((1 + s11) * (1 - s22) + s12 * s21) / (2 * s21)
    m[:, 0, 1] = z * ((1 + s11) * (1 + s22) - s12 * s21) / (2 * s21)
    m[:, 1, 0] = ((1 - s11) * (1 - s22) - s12 * s21) / (2 * s21 * z)
    m[:, 1, 1] = ((1 - s11) * (1 + s22) + s12 * s21) / (2 * s21)
    return m


def _mode_commun(em, r_demi, v0):
    """La tension de mode commun d'une paire de tampons en opposition : le
    point fixe de la moyenne des deux niveaux, chacun charge par R/2 vers
    elle."""
    vcm = v0
    for _ in range(40):
        hi = em.niveau(1.0, 0.0, r_demi, vcm)
        lo = em.niveau(0.0, 1.0, r_demi, vcm)
        nouv = 0.5 * (hi + lo)
        if abs(nouv - vcm) < 1e-9:
            break
        vcm = nouv
    return vcm


def _pas(freqs, ui):
    """(dt, k) : le pas de la simulation, un k-ieme du pas de l'oeil."""
    dt_e = ui / ECHANTILLONS_UI
    k = int(math.ceil(dt_e * 2.2 * freqs[-1]))
    k = min(max(k, 1), 16)
    return dt_e / k, k


def _fronts_et_onde(courir, L, dt, k, n_cmd, ui, facteur, seulement_onde=False):
    """Ce que les deux simulations rendent, quelle que soit la liaison :
    {s, v_haut, v_bas, asym, onde, dernier}.

    `courir(bits)` rend (v, quatre) : la tension vue par le recepteur, au
    pas dt, et les quatre tensions des brins (ou None). `facteur` : le cout
    d'un pas, en pas de ligne seule, pour le plafond."""
    spu = ECHANTILLONS_UI
    pas_bit = k * spu
    n_long = int(math.ceil(L * dt / ui)) + 4
    n_long = max(n_long, int(math.ceil(n_cmd * dt / ui)) + 4)
    dernier = {}

    def onde(bits):
        bits = [int(b) for b in bits]
        per = len(bits)
        reps_ = int(math.ceil(n_long / float(per))) + 1
        if (reps_ + 1) * per * pas_bit * facteur > MAX_PAS_NL:
            raise ErreurOeil("Simulation IBIS trop longue pour ce motif "
                             "(%d bits, %d pas par bit)." % (per, pas_bit),
                             "Prenez PRBS7, ou un débit plus faible.")
        vv, quatre = courir(bits * (reps_ + 1))
        debut = reps_ * per * pas_bit
        if quatre is not None:
            dernier["brins"] = quatre[:, debut::k][:, :per * spu]
            dernier["bits"] = bits
        return vv[debut::k][:per * spu]

    if seulement_onde:
        return {"onde": onde, "dernier": dernier}
    if (2 + 2 * n_long) * pas_bit * facteur > MAX_PAS_NL:
        raise ErreurOeil("Simulation IBIS trop longue : la réponse dure %d "
                         "bits à %d pas par bit." % (n_long, pas_bit),
                         "Réduisez la longueur de la liaison ou le débit, ou "
                         "retirez le modèle IBIS.")
    v, _ = courir([0, 0] + [1] * n_long + [0] * n_long)
    i_r, i_f = 2 * pas_bit, (2 + n_long) * pas_bit
    v_bas, v_haut = float(v[i_r - 1]), float(v[i_f - 1])
    if not v_haut - v_bas > 1e-6:
        raise ErreurOeil("Le tampon IBIS ne bascule pas : niveaux %.3g V et "
                         "%.3g V au récepteur." % (v_bas, v_haut),
                         "Vérifiez le modèle choisi (un Input ne pilote "
                         "rien) et le coin.")
    s_r = (v[i_r:i_f] - v_bas) / (v_haut - v_bas)
    s_d = (v_haut - v[i_f:i_f + n_long * pas_bit]) / (v_haut - v_bas)
    n = min(len(s_r), len(s_d))
    s = 0.5 * (s_r[:n] + s_d[:n])
    asym = float(np.max(np.abs(s_r[:n] - s_d[:n])))
    return {"s": s, "v_haut": v_haut, "v_bas": v_bas, "asym": asym,
            "onde": onde, "dernier": dernier}


def simuler_non_lineaire(ctx, freqs, abcds, p, r0):
    """La liaison simulee dans le temps : ce que `oeil(non_lineaire=...)` lit.

    Rend {s, dt, onde, t50, v_haut, v_bas, infos} : la reponse moyenne a un
    echelon (normalisee de 0 a 1, au pas dt), une fonction qui rend la forme
    d'onde periodique d'une sequence (au pas ui/64), l'instant de mi-front
    du tampon, et les niveaux etablis a la broche du recepteur.

    En differentiel, c'est le DEMI-CIRCUIT du mode impair (deux tampons
    exactement opposes, mode commun fixe) : `simuler_paire` fait mieux des
    que la cascade du mode commun est connue."""
    ui = p["ui"]
    freqs = np.asarray(freqs, dtype=float)
    dt, k = _pas(freqs, ui)
    diff = p["mode"] == "diff"
    abcd = np.array(abcds, dtype=complex)
    r_l, c_l = p["r_charge"], p["c_charge"]
    if diff:
        # Le demi-circuit du mode impair : V/2, meme courant.
        abcd[:, 0, 1] /= 2.0
        abcd[:, 1, 0] *= 2.0
        r_l = r_l / 2.0
        c_l = 2.0 * c_l
        r0 = r0 / 2.0
    g_l = (1.0 / r_l) if 0 < r_l < 1e9 else 0.0
    y_l = g_l + 2j * math.pi * freqs * c_l
    r_ligne = max(0.0, float(np.real(abcd[0, 0, 1])))
    ca = p.get("couplage_ac")
    if ca and len(freqs) > 1:
        # Le continu des condensateurs de liaison (voir l'en-tete) : le
        # canal est en ondes sur r0, la boucle se ferme sur 2 r0 ; en
        # differentiel le demi-circuit voit le condensateur d'UN brin.
        r_ligne += resistance_continu_ac(ca["c"], 2.0 * r0 + r_ligne,
                                         1.0 / (freqs[1] - freqs[0]))
    ch = abcd.copy()
    ch[:, 0, 0] = abcd[:, 0, 0] + abcd[:, 0, 1] * y_l
    ch[:, 1, 0] = abcd[:, 1, 0] + abcd[:, 1, 1] * y_l
    s_f = ibis.s_depuis_abcd(ch, r0)
    dc = np.array([[[1.0 + r_ligne * g_l, r_ligne], [g_l, 1.0]]],
                  dtype=complex)
    s_dc = [float(np.real(x[0])) for x in ibis.s_depuis_abcd(dc, r0)]
    reps = [ibis.reponses_impulsionnelles(freqs, s_f[i], s_dc[i], dt, None,
                                          ctx["tr_lissage"])[0]
            for i in range(4)]
    L = ibis._tronquer(reps)
    reps = [h[:max(L, 2)].copy() for h in reps]

    em = ctx["em"]
    if em is not None:
        cmd = ibis.commandes(ctx["m_em"], em, dt)
        t50 = ibis.instant_mi_front(cmd["montant"], dt)
    else:
        # Seul le recepteur est IBIS : l'emetteur reste celui de Thevenin,
        # passe au pas de temps (demi-emetteur en differentiel).
        vh, vb, rs = p["v_haut"], p["v_bas"], p["r_source"]
        if diff:
            vh, vb, rs = vh / 2.0, vb / 2.0, rs / 2.0
        em, cmd = ibis.tampon_lineaire(rs, vh, vb, p["tr"], dt)
        t50 = 4.0 * p["tr"] / TR_SUR_SIGMA
    v_ref = 0.0
    rx = ctx["rx"]
    if diff:
        if ctx["em"] is not None:
            v_ref = _mode_commun(em, (r_l if r_l > 0 else None),
                                 0.5 * (em.v_pu + em.v_pd))
        elif rx is not None:
            v_ref = 0.5 * (rx.v_pc + rx.v_gc)
    lia = ibis.Liaison(reps, r0, dt, em, cmd, rx, v_ref)
    pas_bit = k * ECHANTILLONS_UI

    def courir(bits):
        _, v2 = lia.simuler(bits, pas_bit, ui)
        if diff:
            _, v2n = lia.simuler([1 - b for b in bits], pas_bit, ui)
            v2 = v2 - v2n
        return v2, None

    fo = _fronts_et_onde(courir, L, dt, k, len(cmd["montant"][0]), ui,
                         2 if diff else 1)
    infos = dict(ctx["infos"])
    infos.update({"pas_s": dt, "pas_par_ui": pas_bit, "r0": r0,
                  "lissage_s": ctx["tr_lissage"], "longueur_reponse": L,
                  "asymetrie": fo["asym"], "v_haut": fo["v_haut"],
                  "v_bas": fo["v_bas"],
                  "mode_commun": v_ref if diff else None})
    return {"s": fo["s"], "dt": dt, "onde": fo["onde"], "t50": t50,
            "v_haut": fo["v_haut"], "v_bas": fo["v_bas"], "infos": infos,
            "liaison": lia}


def _boitiers_brin(freqs, bt, mut, sens, cpl=None, symetrique=False):
    """(N, 4, 4) : les boitiers des deux broches (bt_p, bt_n), poses chacun
    sur son brin -- et couples par les mutuelles de la paire s'il y en a
    (`ibis.abcd_boitier_paire`), ou, avec des voisines couplees (`cpl`,
    2.4.0), le boitier couple a elles (`ibis.abcd_boitier_couple`) --
    symetrise pour la reference symetrique : la moyenne de lui et de son
    image, brins echanges."""
    if cpl is not None and cpl["victimes"] == 2:
        m = ibis.abcd_boitier_couple(freqs, cpl, sens, cpl["r_voisin"])
        if symetrique:
            pm = np.array([1, 0, 3, 2])
            m = 0.5 * (m + m[:, pm][:, :, pm])
        return m
    if mut:
        return ibis.abcd_boitier_paire(freqs, bt[0], bt[1], mut, sens)
    return ibis.abcd_par_brin(ibis.abcd_boitier(freqs, bt[0], sens),
                              ibis.abcd_boitier(freqs, bt[1], sens),
                              len(freqs))


def _continu_brins(m):
    """La paire par brin (N, 4, 4) au continu, (1, 4, 4) : les resistances
    serie, que la partie reelle de B au premier point approche."""
    m0 = np.zeros((1, 4, 4), dtype=complex)
    m0[0] = np.eye(4)
    m0[0, :2, 2:] = np.real(np.asarray(m)[0, :2, 2:])
    return m0


def _continu_couplage_ac(m0, ca, freqs, r_bouts):
    """Les condensateurs de liaison AU CONTINU de la paire par brin (1, 4, 4),
    EN PLACE : la resistance `resistance_continu_ac` de la boucle de
    decharge -- les deux brins en serie (C/2), fermes sur `r_bouts` (la
    somme des resistances des deux bouts, R_s + R_L, ou 2 R0 pour un canal
    en ondes) -- partagee entre les deux brins. Rien sans condensateur."""
    if not ca or len(freqs) < 2:
        return m0
    r_tot = float(np.real(m0[0, 0, 2]) + np.real(m0[0, 1, 3])) + r_bouts
    r_x = resistance_continu_ac(ca["c"] / 2.0, r_tot,
                                1.0 / (freqs[1] - freqs[0])) / 2.0
    m0[0, 0, 2] += r_x
    m0[0, 1, 3] += r_x
    return m0


def _charge_brins(ctx, p, w, symetrique=False):
    """LA CHARGE PAR BRIN (N, 2, 2) en admittance : la resistance
    differentielle entre les deux brins, l'impedance de mode commun (prise
    mediane) s'il y en a une, la capacite d'entree de chaque broche vers la
    masse."""
    r_l = p["r_charge"]
    yd = (1.0 / r_l) if 0 < r_l < 1e9 else 0.0
    r_mc = (ctx or {}).get("r_mc") or 0.0
    yc = (1.0 / r_mc) if r_mc > 0 else 0.0
    cp, cn = (ctx or {}).get("c_rx") or (2.0 * p["c_charge"],
                                         2.0 * p["c_charge"])
    if symetrique:
        cn = cp
    y = np.zeros((len(w), 2, 2), dtype=complex)
    y[:, 0, 0] = yc / 4.0 + yd + 1j * w * cp
    y[:, 1, 1] = yc / 4.0 + yd + 1j * w * cn
    y[:, 0, 1] = y[:, 1, 0] = yc / 4.0 - yd
    return y


def _poser_boitiers_brins(ctx, freqs, m, m0, symetrique=False,
                          avant_reception=None):
    """Les boitiers des deux bouts, brin par brin, autour de la paire
    (N, 4, 4) et de son continu (1, 4, 4) : (m, m0, compte). Celui de
    l'emetteur ne se pose qu'avec un emetteur IBIS ; `avant_reception`
    (N, 4, 4) s'insere juste avant celui du recepteur."""
    zero = np.array([0.0])
    bt_e, bt_r = ctx["bt_em"], ctx["bt_rx"]
    mut_e, mut_r = ctx.get("mut_em"), ctx.get("mut_rx")
    cpl_e, cpl_r = ctx.get("cpl_em"), ctx.get("cpl_rx")
    if symetrique:
        bt_e, bt_r = (bt_e[0], bt_e[0]), (bt_r[0], bt_r[0])
    compte = False
    if ctx["em"] is not None and (bt_e[0] or bt_e[1] or mut_e or cpl_e):
        m = _boitiers_brin(freqs, bt_e, mut_e, "emission", cpl_e,
                           symetrique) @ m
        m0 = _boitiers_brin(zero, bt_e, mut_e, "emission", cpl_e,
                            symetrique) @ m0
        compte = True
    if avant_reception is not None:
        m = m @ avant_reception
    if bt_r[0] or bt_r[1] or mut_r or cpl_r:
        m = m @ _boitiers_brin(freqs, bt_r, mut_r, "reception", cpl_r,
                               symetrique)
        m0 = m0 @ _boitiers_brin(zero, bt_r, mut_r, "reception", cpl_r,
                                 symetrique)
        compte = True
    return m, m0, compte


def transfert_paire(ctx, freqs, m_brins, p, continu=None):
    """V_diff a la charge / V du generateur differentiel, a travers la paire
    PAR BRIN (N, 4, 4) : (h, h0, note). C'est `transfert` pour une paire
    dissymetrique, dont le mode impair ne reste pas impair.

    Le generateur de Thevenin se partage en deux : +V/2 et -V/2, R_s/2 de
    chaque cote ; la charge est celle de `_charge_brins`. Avec les blocs
    [[A, B], [C, D]] et Y la charge, V1 = (A + B Y) V2, I1 = (C + D Y) V2 :
        (A + B Y + Z_s (C + D Y)) V2 = E,  H = V2p - V2n.
    Les boitiers IBIS s'y posent brin par brin, mutuelles de la paire
    comprises. Pour une paire symetrique, c'est `transfert` sur le mode
    impair, exactement.

    `continu` : un dictionnaire, s'il est donne, recoit `bin` -- la case du
    continu de l'IFFT -- et, quand la paire porte des condensateurs de
    liaison qu'une terminaison decharge, `lent` {h0, tau} : leur pole lent,
    la boucle R_s + R_L et les deux brins en serie (C/2), que
    `reponse_indicielle_ac` compte exactement. Sans terminaison, rien ne
    decharge : la case est le pont diviseur C_x / (C_x + C_L), comme en
    simple."""
    freqs = np.asarray(freqs, dtype=float)
    m = np.array(m_brins, dtype=complex)
    m0 = _continu_brins(m)
    compte = False
    if ctx:
        m, m0, compte = _poser_boitiers_brins(ctx, freqs, m, m0)
    zs = 0.5 * float(p["r_source"]) * np.eye(2)
    e = np.array([0.5, -0.5], dtype=complex)

    def h_de(mm, w):
        y = _charge_brins(ctx, p, w)
        k = (mm[:, :2, :2] + mm[:, :2, 2:] @ y
             + zs @ (mm[:, 2:, :2] + mm[:, 2:, 2:] @ y))
        v2 = np.linalg.solve(k, np.broadcast_to(e, (len(w), 2))[..., None])
        return v2[:, 0, 0] - v2[:, 1, 0]
    h = h_de(m, 2 * math.pi * freqs)
    h0 = float(np.real(h_de(m0, np.array([0.0]))[0]))
    if continu is not None:
        continu["bin"] = h0
        ca = p.get("couplage_ac")
        if ca and 0 < p["r_charge"] < 1e9:
            r_tot = float(np.real(m0[0, 0, 2]) + np.real(m0[0, 1, 3]))                 + float(p["r_source"]) + float(p["r_charge"])
            continu["lent"] = {"h0": h0, "tau": 0.5 * ca["c"] * r_tot}
        elif ca and p["c_charge"] > 0:
            continu["bin"] = h0 * ca["c_x"] / (ca["c_x"] + p["c_charge"])
    return h, h0, ("boîtiers comptés brin par brin" if compte else "")


def _canal_paire(ctx, freqs, abcd_dd, abcd_cc, p, r0, dt, symetrique=False,
                 surlongueur=None, m_brins=None):
    """Les 4 x 4 reponses impulsionnelles de la paire PAR BRIN, boitiers,
    surlongueur et charge comprises, et leur longueur utile.

    `m_brins` (N, 4, 4) : la paire par brin de la cascade a quatre acces de
    `simulation_em` -- dissymetries et surlongueur comprises ; sinon, la
    paire symetrique remise par brin depuis ses deux modes."""
    freqs = np.asarray(freqs, dtype=float)
    n = len(freqs)
    zero = np.array([0.0])
    if m_brins is not None and not symetrique:
        m = np.array(m_brins, dtype=complex)
        m0 = _continu_brins(m)
        surlongueur = None
    else:
        m = ibis.abcd_brins(abcd_dd, abcd_cc)
        m0 = ibis.abcd_brins(
            np.array([[[1.0, max(0.0, float(np.real(abcd_dd[0][0][1])))],
                       [0.0, 1.0]]]),
            np.array([[[1.0, max(0.0, float(np.real(abcd_cc[0][0][1])))],
                       [0.0, 1.0]]]))
    lg = None
    if surlongueur and not symetrique:
        # La surlongueur d'un brin : une ligne seule, sur le brin n.
        lg = ibis.abcd_par_brin(None, ligne_ideale(
            freqs, surlongueur["z0"], surlongueur["retard"]), n)
    m, m0, _ = _poser_boitiers_brins(ctx, freqs, m, m0, symetrique, lg)
    # Le continu des condensateurs de liaison, le canal etant en ondes sur
    # R0 par brin : la boucle se ferme sur 2 R0.
    _continu_couplage_ac(m0, p.get("couplage_ac"), freqs, 2.0 * r0)
    s = ibis.s_depuis_abcd_4(ibis.charger_brins(
        m, _charge_brins(ctx, p, 2 * math.pi * freqs, symetrique)), r0)
    s0 = np.real(ibis.s_depuis_abcd_4(ibis.charger_brins(
        m0, _charge_brins(ctx, p, zero, symetrique)), r0)[0])
    reps = [[ibis.reponses_impulsionnelles(freqs, s[:, i, j], s0[i, j], dt,
                                           None, ctx["tr_lissage"])[0]
             for j in range(4)] for i in range(4)]
    L = ibis._tronquer([h for ligne in reps for h in ligne])
    reps = [[h[:max(L, 2)].copy() for h in ligne] for ligne in reps]
    return reps, L


def simuler_paire(ctx, freqs, abcd_dd, abcd_cc, p, r0_diff, surlongueur=None,
                  symetrique=False, seulement_onde=False, m_brins=None):
    """La paire simulee dans le temps, brin par brin : ce que
    `oeil(non_lineaire=...)` lit, plus les tensions des deux brins.

    `r0_diff` : la reference differentielle (R0 = r0_diff / 2 par brin).
    `symetrique` : la MEME paire, mais les deux brins pareils (ceux du brin
    p, sans decalage ni surlongueur) -- la reference a laquelle on compare
    la vraie. `surlongueur` {retard, z0} : un brin plus long que l'autre.
    `m_brins` : la paire dissymetrique par brin (cascade a quatre acces) ;
    la reference symetrique reste alors celle de `abcd_dd` et `abcd_cc`."""
    ui = p["ui"]
    freqs = np.asarray(freqs, dtype=float)
    dt, k = _pas(freqs, ui)
    r0 = r0_diff / 2.0
    reps, L = _canal_paire(ctx, freqs, abcd_dd, abcd_cc, p, r0, dt,
                           symetrique, surlongueur, m_brins)
    em, em_n = ctx["em"], ctx["em_n"]
    if em is not None:
        cmd = ibis.commandes(ctx["m_em"], em, dt)
        if symetrique or (ctx["m_em_n"] is ctx["m_em"] and
                          em_n.coin == em.coin):
            em_n, cmd_n = em, cmd
        else:
            cmd_n = ibis.commandes(ctx["m_em_n"], em_n, dt)
        t50 = ibis.instant_mi_front(cmd["montant"], dt)
    else:
        # L'emetteur de Thevenin, partage en deux brins : la moitie de la
        # tension a vide et de la resistance de chaque cote.
        em, cmd = ibis.tampon_lineaire(p["r_source"] / 2.0,
                                       p["v_haut"] / 2.0, p["v_bas"] / 2.0,
                                       p["tr"], dt)
        em_n, cmd_n = em, cmd
        t50 = 4.0 * p["tr"] / TR_SUR_SIGMA
    dec = 0.0 if symetrique else ctx["decalage"]
    rx = (ctx["rx"], ctx["rx"] if symetrique else ctx["rx_n"])
    lia = ibis.LiaisonPaire(reps, r0, dt, (em, em_n), (cmd, cmd_n), rx,
                            (0.0, dec) if dec >= 0 else (-dec, 0.0))
    pas_bit = k * ECHANTILLONS_UI
    # Le croisement differentiel tombe au milieu des deux fronts.
    t50 += 0.5 * abs(dec)

    def courir(bits):
        v = lia.simuler(bits, pas_bit, ui)
        return v[2] - v[3], v
    n_cmd = max(len(cmd["montant"][0]), len(cmd_n["montant"][0]))
    fo = _fronts_et_onde(courir, L, dt, k, n_cmd, ui, 2, seulement_onde)
    if seulement_onde:
        return fo
    infos = dict(ctx["infos"])
    infos.update({"pas_s": dt, "pas_par_ui": pas_bit, "r0": r0,
                  "lissage_s": ctx["tr_lissage"], "longueur_reponse": L,
                  "asymetrie": fo["asym"], "v_haut": fo["v_haut"],
                  "v_bas": fo["v_bas"], "deux_brins": True,
                  "decalage_s": dec,
                  "r_charge_mc": ctx["r_mc"] or None})
    return {"s": fo["s"], "dt": dt, "onde": fo["onde"], "t50": t50,
            "v_haut": fo["v_haut"], "v_bas": fo["v_bas"], "infos": infos,
            "liaison": lia, "dernier": fo["dernier"], "pas_bit": pas_bit}


def hauteur_onde(y, bits, spu=None):
    """La hauteur d'oeil d'une forme d'onde periodique BRUTE (sans
    egaliseur), a la meilleure phase -- latence comprise : min des 1 moins
    max des 0. C'est la mesure commune de la paire reelle et de sa
    reference symetrique.

    LA LATENCE, en bits, se lit a l'intercorrelation de la forme d'onde
    (moyennee sur l'UI) avec la sequence ; on cherche ensuite la phase sur
    ce rang et ses deux voisins -- sans tableau de per x per x spu."""
    spu = spu or ECHANTILLONS_UI
    bits = np.asarray(bits, dtype=bool)
    per = len(bits)
    y = np.asarray(y, dtype=float)[:per * spu].reshape(per, spu)
    a = np.where(bits, 1.0, -1.0)
    c = np.fft.irfft(np.fft.rfft(y.mean(axis=1)) * np.conj(np.fft.rfft(a)),
                     per)
    k0 = int(np.argmax(c))
    meilleur = -np.inf
    for k in (k0 - 1, k0, k0 + 1):
        yk = np.roll(y, -k, axis=0)
        h = np.min(yk[bits], axis=0) - np.max(yk[~bits], axis=0)
        meilleur = max(meilleur, float(np.max(h)))
    return meilleur


def mode_commun(nl, nl_ref=None):
    """Le mode commun de la paire, d'apres la derniere forme d'onde PRBS
    simulee : {continu, crete_crete, crete, rms, conversion_db, emetteur,
    courbe, hauteur_brute, hauteur_symetrique}."""
    d = nl.get("dernier") or {}
    v = d.get("brins")
    if v is None:
        return None
    vc = 0.5 * (v[2] + v[3])
    vd = v[2] - v[3]
    ve = 0.5 * (v[0] + v[1])
    moy = float(np.mean(vc))
    cc = float(np.max(vc) - np.min(vc))
    dpp = float(np.max(vd) - np.min(vd))
    spu = ECHANTILLONS_UI
    pas = spu // PAS_MODE_COMMUN
    nb = min(len(d["bits"]), BITS_MODE_COMMUN)
    sortie = {
        "continu": moy, "crete_crete": cc,
        "crete": float(np.max(np.abs(vc - moy))),
        "rms": float(np.std(vc)),
        "conversion_db": (20.0 * math.log10(cc / dpp)
                          if cc > 0 and dpp > 0 else None),
        "emetteur": {"continu": float(np.mean(ve)),
                     "crete_crete": float(np.max(ve) - np.min(ve))},
        "courbe": {"dt_ui": 1.0 / PAS_MODE_COMMUN,
                   "v": [round(float(x), 6) for x in vc[:nb * spu:pas]],
                   "v_diff": [round(float(x), 6)
                              for x in vd[:nb * spu:pas]]},
        "hauteur_brute": hauteur_onde(vd, d["bits"], spu),
    }
    if nl_ref is not None:
        sortie["hauteur_symetrique"] = hauteur_onde(
            nl_ref["onde"](d["bits"]), d["bits"], spu)
    return sortie


def preparer_ami(o, p, ctx):
    """Les fichiers .ami de la requete, lus et montres, et ce qu'ils
    proposent pour l'egaliseur de reference -- applique si `ami_regler`.
    Rend None s'il n'y a ni .ami ni [Algorithmic Model]."""
    if ibis is None:
        return None
    lus = {}
    for cle, champ in (("emetteur", "ibis_emetteur"),
                       ("recepteur", "ibis_recepteur")):
        d = o.get(champ)
        a = d.get("ami") if isinstance(d, dict) else None
        if isinstance(a, dict) and a.get("texte"):
            try:
                lus[cle] = ibis.lire_ami(a["texte"], str(a.get("fichier") or
                                                         ""))
            except ibis.ErreurIbis as exc:
                raise ErreurOeil("AMI de l'%s : %s" % (
                    "émetteur" if cle == "emetteur" else "récepteur",
                    exc.message), exc.conseil)
    renvois = []
    for bout, cle in (("émetteur", "m_em"), ("récepteur", "m_rx")):
        m = (ctx or {}).get(cle) or {}
        for x in (m.get("ami") or []):
            renvois.append(dict(x, bout=bout, modele=m["nom"]))
    if not lus and not renvois:
        return None
    prop = ibis.proposer_egaliseur(lus.get("emetteur"), lus.get("recepteur"),
                                   p["debit"])
    applique = []
    if o.get("ami_regler") and lus:
        if prop.get("ffe"):
            p["ffe"], p["ffe_principal"] = prop["ffe"], prop["ffe_principal"]
            applique.append("FFE")
        if prop.get("dfe_prises"):
            p["dfe_prises"] = prop["dfe_prises"]
            if prop.get("dfe_max"):
                p["dfe_max"] = prop["dfe_max"]
            applique.append("DFE")
        if prop.get("ctle"):
            p["ctle"] = prop["ctle"]
            applique.append("CTLE")
        # La gigue et le bruit du modele, seulement s'ils n'ont pas ete
        # saisis : la saisie l'emporte.
        if prop.get("rj") and not p["rj_ui"]:
            p["rj_ui"] = prop["rj"] / p["ui"]
            applique.append("RJ")
        if prop.get("dj") and not p["dj_ui"] and prop["dj"] < p["ui"]:
            p["dj_ui"] = prop["dj"] / p["ui"]
            applique.append("DJ")
        if prop.get("bruit_v") and not p["bruit_v"]:
            p["bruit_v"] = prop["bruit_v"]
            applique.append("bruit")
        if any(x in applique for x in ("RJ", "DJ", "bruit")):
            p["stat"] = True
        if prop.get("sensibilite") and ctx is not None and \
                ctx.get("vdiff") is None and p["mode"] == "diff":
            ctx["vdiff"] = prop["sensibilite"]
            applique.append("sensibilité")

    def resume(a):
        if a is None:
            return None
        return {"fichier": a["fichier"], "modele": a["modele"],
                "description": a["description"], "tronque": a["tronque"],
                "parametres": [
                    {k: x.get(k) for k in ("chemin", "groupe", "usage",
                                           "type", "forme", "valeur",
                                           "plage", "liste", "description")}
                    for x in a["parametres"]]}
    # LES BIBLIOTHEQUES A EXECUTER (2.3.0) : le chemin que l'utilisateur
    # designe, et ses surcharges de parametres ; `executer_ami` fera le
    # reste, apres la cascade. Rien de designe : rien n'est execute.
    biblios = {}
    for cle, champ in (("emetteur", "ibis_emetteur"),
                       ("recepteur", "ibis_recepteur")):
        d = o.get(champ)
        a = d.get("ami") if isinstance(d, dict) else None
        if isinstance(a, dict) and str(a.get("bibliotheque") or "").strip():
            biblios[cle] = {"chemin": str(a["bibliotheque"]).strip(),
                            "surcharges": (a.get("parametres")
                                           if isinstance(a.get("parametres"),
                                                         dict) else {})}
    execute = bool(biblios)
    return {"emetteur": resume(lus.get("emetteur")),
            "recepteur": resume(lus.get("recepteur")),
            "renvois": renvois, "propositions": prop, "applique": applique,
            "execution": None,
            "_lus": lus, "_biblios": biblios,
            "note": (("Le modèle AMI (bibliothèque du fabricant) est "
                      "EXÉCUTÉ par ctypes : AMI_Init de l'émetteur sur la "
                      "réponse impulsionnelle du canal, puis AMI_Init et "
                      "AMI_GetWave du récepteur, par blocs ; les paramètres "
                      "In/InOut viennent du .ami, surchargeables. "
                      "Si l'AMI_GetWave du récepteur rend ses instants "
                      "d'horloge, ils fixent l'échantillonnage (phase moyenne, "
                      "chaque bit lu à son instant) ; sinon l'instant reste "
                      "celui de l'œil (milieu du pire cas).")
                     if execute else
                     ("Le modèle AMI lui-même (bibliothèque du fabricant) "
                      "n'est PAS exécuté : seul son fichier .ami est lu. "
                      "L'égaliseur de l'œil reste celui de référence (CTLE, "
                      "FFE, DFE linéaires), réglé — si demandé — d'après les "
                      "paramètres lisibles ; l'adaptation et la récupération "
                      "d'horloge du modèle ne sont pas reproduites. "
                      "Désignez la bibliothèque (.so/.dll, dans la LIB ou "
                      "le projet) pour l'exécuter."))}


# ==========================================================================
# L'EXECUTION DES MODELES AMI (2.3.0)
# --------------------------------------------------------------------------
# LE FLOT DE LA NORME (IBIS 7.x, section 10.4, « reference flows »), tel
# qu'il est reproduit ici :
#
#   1. la REPONSE IMPULSIONNELLE DU CANAL ANALOGIQUE : celle que l'oeil a
#      deja -- la reponse a un echelon du transfert generateur -> broche
#      (tampons IBIS lineaires, boitiers, condensateurs de liaison compris ;
#      avec des tampons IBIS simules dans le temps, la reponse moyenne des
#      deux fronts), au pas de l'oeil (UI / 64, pour que bit_time /
#      sample_interval soit entier), derivee et mise en volts par seconde
#      pour une excursion pleine de l'emetteur ;
#   2. AMI_Init DE L'EMETTEUR : la pre-accentuation du modele s'applique a
#      cette impulsion s'il a Init_Returns_Impulse (sinon elle reste telle
#      quelle, et c'est dit : l'AMI_GetWave de l'emetteur n'est pas
#      reproduit, la FFE de reference saisie l'est a sa place) ;
#   3. le CANAL : la forme d'onde PRBS au recepteur est la superposition de
#      cette impulsion equalisee -- la liaison est lineaire a cet endroit,
#      c'est l'hypothese du flot AMI lui-meme ;
#   4. AMI_Init DU RECEPTEUR sur l'impulsion de l'etape 2 : l'impulsion
#      rendue (Init_Returns_Impulse) fait la reponse a un bit du PIRE CAS et
#      de l'oeil statistique ; puis, s'il a GetWave_Exists, AMI_GetWave par
#      blocs sur la forme d'onde de l'etape 3 -- apres Ignore_Bits de mise
#      en route, une periode entiere du motif est gardee : c'est l'oeil
#      PRBS. Sans GetWave, l'oeil PRBS est la superposition de l'impulsion
#      rendue par Init. Comme le veut la norme, quand les deux existent,
#      l'impulsion d'Init du recepteur ne sert PAS a la forme d'onde.
#   5. AMI_Close des deux.
#
# Le CTLE, le DFE et la FFE de reference de l'oeil s'effacent devant le
# modele qui s'execute (l'emetteur efface la FFE, le recepteur le CTLE et
# le DFE) ; un bout qui ne s'execute pas les garde. Les instants d'horloge
# que le recepteur rend FIXENT l'echantillonnage depuis la 2.4.0 (voir
# « L'HORLOGE RECUPEREE » dans `oeil`) ; sans eux, l'instant reste le milieu
# du pire cas. Tout echec -- fichier absent, autre
# architecture, Init qui rend 0 -- est un AVERTISSEMENT et un repli sur
# l'egaliseur de reference, jamais une exception.
# ==========================================================================

# Les blocs passes a AMI_GetWave : en bits (fois 64 echantillons).
BITS_PAR_BLOC_AMI = 256
# Plafond du nombre de periodes de mise en route (Ignore_Bits deraisonnable).
MAX_PERIODES_AMI = 64


def _echelon_canal(freqs, canal, h0, h0_bin, p, nl, lent=None):
    """La reponse a un echelon du canal analogique, au pas UI / 64 et sur la
    demi-fenetre : (dt_e, s). Normalisee a un echelon unite de l'emetteur
    (le continu sans condensateur vaut h0). Les condensateurs de liaison
    comme dans `oeil` : `lent`, ou la case `h0_bin`."""
    ui = p["ui"]
    dt_e = ui / ECHANTILLONS_UI
    if nl is not None:
        s_src, dt = np.asarray(nl["s"], dtype=float), nl["dt"]
        t_h = len(s_src) * dt
    else:
        arr = np.asarray(canal)
        if arr.ndim == 3:
            h, h0 = transfert(arr, freqs, p["r_source"], p["r_charge"],
                              p["c_charge"])
            if p.get("couplage_ac") and h0_bin is None and lent is None:
                h0_bin, lent = _continu_ac_simple(p["couplage_ac"], arr,
                                                  freqs, p)
        else:
            h = arr.astype(complex)
        if h0_bin is None:
            h0_bin = h0
        df = freqs[1] - freqs[0]
        t_h = 0.5 / df
        n_min = int(math.ceil(1.0 / df / min(dt_e, p["tr"] / 8.0)))
        if lent:
            dt, s_src = reponse_indicielle_ac(freqs, h, lent["h0"], p["tr"],
                                              n_min, lent["tau"])
        else:
            dt, s_src = reponse_indicielle(freqs, h, h0_bin, p["tr"], n_min)
    n_e = int(t_h / dt_e)
    t_e = np.arange(n_e) * dt_e
    s = np.interp(t_e, np.arange(len(s_src)) * dt, s_src, left=0.0,
                  right=float(s_src[-1]))
    return dt_e, s


def _decaler_ffe(s, ffe, spu):
    """La reponse a un echelon avec la FFE de reference : sum c_j s(t - j UI)."""
    out = np.zeros(len(s))
    for j, cj in enumerate(ffe):
        if j * spu < len(s):
            out[j * spu:] += cj * s[:len(s) - j * spu]
    return out


def _onde_lineaire(bits, p_bit, spu, amp, v_c):
    """La forme d'onde periodique d'une sequence par superposition de la
    reponse a un bit `p_bit` (au pas UI / spu) : ce que fait `oeil` en
    lineaire, repete autant de fois que la reponse deborde la periode."""
    bits = np.asarray(bits, dtype=int)
    per = len(bits)
    rep = max(1, int(math.ceil(len(p_bit) / float(per * spu))))
    a = np.tile(2.0 * bits - 1.0, rep)
    ns = len(a) * spu
    imp = np.zeros(ns)
    imp[::spu] = a
    pp = np.zeros(ns)
    pp[:len(p_bit)] = p_bit[:ns]
    y = v_c + amp * np.fft.irfft(np.fft.rfft(imp) * np.fft.rfft(pp), ns)
    return y[:per * spu], y


def executer_ami(ami, p, freqs, canal, h0, h0_bin, nl, racines, notes,
                 lent=None):
    """Les modeles AMI designes, executes (voir l'en-tete) : rend ce que
    `oeil(non_lineaire=...)` lit -- ou `nl` inchange si rien n'a pu
    s'executer -- et remplit `ami["execution"]`. Les echecs vont dans
    `notes`."""
    biblios = ami.get("_biblios") or {}
    lus = ami.get("_lus") or {}
    if not biblios or ibis is None:
        return nl
    ui, spu = p["ui"], ECHANTILLONS_UI
    fiche = {}
    modeles = {}
    chemins = {}
    for bout in ("emetteur", "recepteur"):
        if bout not in biblios:
            continue
        b = biblios[bout]
        f = {"bibliotheque": b["chemin"], "chargee": False, "init": None,
             "init_returns_impulse": None, "getwave": None,
             "parametres_in": "", "parametres_out": {}, "message": "",
             "surcharges_ignorees": [], "horloges": None, "note": ""}
        fiche[bout] = f
        qui = "de l'émetteur" if bout == "emetteur" else "du récepteur"
        try:
            if lus.get(bout) is None:
                raise ibis.ErreurIbis(
                    "le fichier .ami %s n'est pas chargé : sans lui, "
                    "pas de paramètres à passer au modèle." % qui)
            chemin = ibis.chemin_bibliotheque_ami(b["chemin"], racines)
            modeles[bout] = ibis.ModeleAmi(chemin)
            chemins[bout] = chemin
            f["chargee"] = True
            f["getwave"] = modeles[bout].getwave_existe
        except ibis.ErreurIbis as exc:
            f["note"] = exc.message
            notes.append("Modèle AMI %s non exécuté (%s) : repli sur "
                         "l'égaliseur de référence." % (qui, exc.message))
    if not modeles:
        ami["execution"] = fiche
        return nl

    amp = (p["v_haut"] - p["v_bas"]) / 2.0
    v_mil = (p["v_haut"] + p["v_bas"]) / 2.0
    dt_e, s_canal = _echelon_canal(freqs, canal, h0, h0_bin, p, nl, lent)
    x0 = float(nl.get("x0", 1.0)) if nl is not None else (
        h0 if h0 is not None else float(s_canal[-1]))
    s_brut = s_canal
    ffe_appliquee = False
    if "emetteur" not in modeles and (len(p["ffe"]) > 1 or p["ffe"][0] != 1.0):
        # La FFE de reference de l'emetteur, posee ici puisque l'oeil ne la
        # posera plus (la reponse qu'on lui rend l'inclut).
        s_canal = _decaler_ffe(s_canal, p["ffe"], spu)
        ffe_appliquee = True
    swing = 2.0 * amp
    impulsion = np.diff(np.concatenate([[0.0], s_canal])) * swing / dt_e
    imp_tx = impulsion
    executes = []

    def lancer(bout, imp):
        m, f, a = modeles[bout], fiche[bout], lus[bout]
        texte, appl, ign = ibis.parametres_ami_in(
            a, biblios[bout]["surcharges"])
        f["parametres_in"] = texte
        f["surcharges_ignorees"] = ign
        f["init_returns_impulse"] = bool(
            ibis.reserve_ami(a, "Init_Returns_Impulse", True))
        try:
            ok, rendu, p_out, msg = m.init(imp, dt_e, ui, texte)
        except Exception as exc:                        # noqa: BLE001
            ok, rendu, p_out, msg = False, imp, "", "%s : %s" % (
                type(exc).__name__, exc)
        f["init"] = ok
        f["message"] = msg
        f["parametres_out"] = ibis.lire_parametres_ami(p_out)
        if not ok:
            notes.append("AMI_Init du modèle %s a échoué%s : repli sur "
                         "l'égaliseur de référence." % (
                             "de l'émetteur" if bout == "emetteur" else
                             "du récepteur", (" (« %s »)" % msg) if msg else ""))
            m.fermer()
            del modeles[bout]
            return imp
        executes.append(bout)
        if not f["init_returns_impulse"]:
            f["note"] = ("Init_Returns_Impulse False : l'impulsion n'est pas "
                         "modifiée par AMI_Init.")
            return imp
        if not np.all(np.isfinite(rendu)):
            notes.append("Le modèle de l'%s a rendu une impulsion non "
                         "finie : ignorée." % bout)
            return imp
        return rendu

    tx = None
    if "emetteur" in modeles:
        imp_tx = lancer("emetteur", impulsion)
        if "emetteur" in modeles:
            if (len(p["ffe"]) > 1 or p["ffe"][0] != 1.0):
                notes.append("Émetteur AMI exécuté : la FFE de référence "
                             "saisie est ignorée, le modèle fait la sienne.")
            # L'AMI_GETWAVE DE L'EMETTEUR (2.4.0) : il fait la forme d'onde
            # du flot temporel (voir plus bas) ; sans lui, l'emetteur est
            # pris lineaire sur son impulsion.
            tx = modeles["emetteur"]
            tx_gw = tx.getwave_existe and bool(ibis.reserve_ami(
                lus["emetteur"], "GetWave_Exists", True))
            fiche["emetteur"]["getwave"] = tx_gw
            if not tx_gw:
                if not fiche["emetteur"]["init_returns_impulse"]:
                    notes.append("Émetteur AMI sans Init_Returns_Impulse ni "
                                 "AMI_GetWave : il est pris linéaire sur "
                                 "l'impulsion du canal.")
                tx.fermer()
                tx = None
    imp_rx = imp_tx
    rx = None
    if "recepteur" in modeles:
        imp_rx = lancer("recepteur", imp_tx)
        rx = modeles.get("recepteur")
    if not executes:
        ami["execution"] = fiche
        return nl

    # -- ce que l'oeil lit ----------------------------------------------
    s_stat = np.cumsum(imp_rx) * dt_e / swing
    s_tx = np.cumsum(imp_tx) * dt_e / swing
    x0_ami = float(np.mean(s_stat[-max(1, spu):]))
    p_tx = s_tx - np.concatenate([np.zeros(spu), s_tx[:-spu]])
    p_rx = s_stat - np.concatenate([np.zeros(spu), s_stat[:-spu]])
    # Le niveau moyen : celui du canal pour la forme d'onde qui ENTRE dans
    # le modele du recepteur, celui que le modele rend pour l'oeil.
    v_in, v_c = v_mil * x0, v_mil * x0_ami
    horloges = {"n": 0}
    getwave = rx is not None and rx.getwave_existe and bool(
        ibis.reserve_ami(lus["recepteur"], "GetWave_Exists", True))
    if rx is not None:
        fiche["recepteur"]["getwave"] = getwave
    ignore = int(_nombre(ibis.reserve_ami(lus["recepteur"], "Ignore_Bits", 0)
                         if rx is not None else 0, 0))
    ignore_tx = int(_nombre(ibis.reserve_ami(lus["emetteur"], "Ignore_Bits",
                                             0) if tx is not None else 0, 0))
    s_b = np.asarray(s_brut, dtype=float)
    p_brut = s_b - np.concatenate([np.zeros(spu), s_b[:-spu]])
    # LE RECEPTEUR SANS GETWAVE, DERRIERE UN EMETTEUR A GETWAVE : son
    # egaliseur seul, sur le canal BRUT -- une seconde instance, initialisee
    # sur l'impulsion du canal sans l'emetteur (c'est elle que la forme
    # d'onde de l'emetteur traverse). A defaut, celle du flot statistique.
    imp_rx_brut = imp_rx
    if tx is not None and rx is not None and not getwave:
        try:
            rx2 = ibis.ModeleAmi(chemins["recepteur"])
            ok2, rendu2, _, msg2 = rx2.init(
                impulsion, dt_e, ui, fiche["recepteur"]["parametres_in"])
            rx2.fermer()
            if ok2 and np.all(np.isfinite(rendu2)) and \
                    fiche["recepteur"]["init_returns_impulse"]:
                imp_rx_brut = rendu2
            else:
                raise ValueError(msg2 or "AMI_Init a rendu 0")
        except Exception as exc:                        # noqa: BLE001
            notes.append("Seconde initialisation du récepteur AMI sur le "
                         "canal brut impossible (%s) : l'égaliseur de "
                         "l'émetteur y est compté deux fois." % exc)
    nl_ibis = nl if (nl is not None and callable(nl.get("onde"))) else None

    def _circulaire(w, g):
        """La forme d'onde periodique `w` passee par la reponse `g` (au pas
        dt_e) : la reponse repliee sur la periode, en convolution
        circulaire -- le regime etabli."""
        n = len(w)
        gp = np.zeros(n)
        g = np.asarray(g, dtype=float)
        for k in range(0, len(g), n):
            gp[:min(n, len(g) - k)] += g[k:k + n]
        return np.fft.irfft(np.fft.rfft(w) * np.fft.rfft(gp), n) * dt_e

    def _flot(m, x, qui):
        """AMI_GetWave de `m` sur le flot `x`, par blocs : (sortie,
        instants d'horloge depuis le debut du flot)."""
        bloc = BITS_PAR_BLOC_AMI * spu
        sortie = np.empty_like(x)
        hor = []
        nom = "de l'émetteur" if qui == "emetteur" else "du récepteur"
        for i in range(0, len(x), bloc):
            try:
                ok, w, h, p_out = m.getwave(x[i:i + bloc], spu)
            except Exception as exc:                    # noqa: BLE001
                raise ErreurOeil("AMI_GetWave %s a levé %s : %s"
                                 % (nom, type(exc).__name__, exc),
                                 "Vérifiez la bibliothèque et ses "
                                 "paramètres.")
            if not ok:
                raise ErreurOeil("AMI_GetWave %s a rendu 0 (échec) sur un "
                                 "bloc." % nom,
                                 "Vérifiez les paramètres du modèle.")
            sortie[i:i + len(w)] = w
            hor.extend(float(t) for t in h)
            if p_out:
                fiche[qui]["parametres_out"].update(
                    ibis.lire_parametres_ami(p_out))
        return sortie, hor

    def onde(bits):
        """LE FLOT TEMPOREL, une periode du motif `bits` en regime etabli :
          1. a la broche du recepteur : l'emetteur -- son AMI_GetWave sur la
             stimulation (+-0,5 par bit) passe par le canal brut, ou son
             impulsion (AMI_Init, ou la FFE de reference) en superposition ;
          2. avec des tampons IBIS simules dans le temps (`nl`), la forme
             d'onde NON LINEAIRE de la broche, et l'egalisation de
             l'emetteur ajoutee par le canal linearise : la norme suppose
             le canal analogique lineaire, et ce qui ne l'est pas -- les
             tampons -- reste dans la forme d'onde, intact ;
          3. le recepteur : son AMI_GetWave sur cette forme d'onde, par
             blocs, apres Ignore_Bits -- et les instants de son horloge
             recuperee ; sans GetWave, son impulsion (AMI_Init)."""
        bits = [int(b) for b in bits]
        per = len(bits)
        n_l = per * spu
        n_per = min(MAX_PERIODES_AMI,
                    int(math.ceil(max(ignore, ignore_tx) / float(per))) + 2)
        stim = np.repeat(np.asarray(bits, dtype=float) - 0.5, spu)
        w = None
        if tx is not None:
            w, _ = _flot(tx, np.tile(stim, n_per), "emetteur")
            w = w[-n_l:]
            pin = v_in + _circulaire(w, impulsion)
        else:
            pin, _ = _onde_lineaire(bits, p_tx, spu, amp, v_in)
        # ce que les tampons font de plus que le canal lineaire
        corr = 0.0
        if nl_ibis is not None:
            plat, _ = _onde_lineaire(bits, p_brut, spu, amp, v_in)
            corr = np.asarray(nl_ibis["onde"](bits), dtype=float)[:n_l] - plat
            pin = pin + corr
        if rx is None:
            return pin
        if not getwave:
            if w is not None:
                out = v_c + _circulaire(w, imp_rx_brut)
            else:
                out, _ = _onde_lineaire(bits, p_rx, spu, amp, v_c)
            return out + corr
        sortie, hor = _flot(rx, np.tile(pin, n_per), "recepteur")
        horloges["n"] = len(hor)
        if hor:
            # L'ECHANTILLONNAGE DE L'HORLOGE RECUPEREE (IBIS, BIRD 214) :
            # chaque instant + bit_time / 2, compte depuis le debut du flot.
            # Ceux de la periode gardee, en echantillons depuis son debut :
            # l'oeil les impose (`oeil`, « L'HORLOGE RECUPEREE »).
            t = np.asarray(hor) + 0.5 * ui - (n_per - 1) * per * ui
            t = t[(t >= 0.0) & (t < per * ui)]
            horloges["instants"] = t / dt_e
            horloges["phase_ui"] = float(
                (np.angle(np.mean(np.exp(2j * math.pi * np.asarray(hor)
                                         / ui))) / (2 * math.pi)) % 1.0)
        return sortie[-n_l:]

    infos = dict(nl["infos"]) if nl is not None else {}
    infos.update({"asymetrie": infos.get("asymetrie", 0.0), "ami": True,
                  "ami_executes": list(executes)})
    sortie = dict(nl) if nl is not None else {}
    sortie.update({"s": s_stat, "dt": dt_e, "x0": x0_ami, "onde": onde,
                   "t50": nl["t50"] if nl is not None
                   else 4.0 * p["tr"] / TR_SUR_SIGMA,
                   "v_haut": p["v_haut"], "v_bas": p["v_bas"],
                   "infos": infos, "ami": {"horloges": horloges, "rx": rx}})
    # L'egaliseur de reference s'efface devant le modele qui s'execute.
    if "emetteur" in executes or ffe_appliquee:
        p["ffe"], p["ffe_principal"] = [1.0], 0
    if "recepteur" in executes:
        if p.get("ctle") or p.get("dfe_prises"):
            notes.append("Récepteur AMI exécuté : le CTLE et le DFE de "
                         "référence sont retirés, le modèle égalise lui-même.")
        p["ctle"], p["dfe_prises"] = None, 0
    ami["execution"] = fiche
    flots = []
    if tx is not None:
        flots.append("AMI_GetWave de l'émetteur sur la stimulation, puis le "
                     "canal brut")
    if getwave:
        flots.append("AMI_GetWave du récepteur par blocs de %d bits"
                     % BITS_PAR_BLOC_AMI)
    if nl_ibis is not None:
        flots.append("sur la forme d'onde des tampons IBIS simulés dans le "
                     "temps, l'égalisation ajoutée par le canal linéarisé")
    notes.append("Modèle(s) AMI exécuté(s) : %s — %s." % (
        " et ".join("émetteur" if x == "emetteur" else "récepteur"
                    for x in executes),
        ("AMI_Init, puis " + " ; ".join(flots)) if flots
        else "AMI_Init seul (impulsion)"))
    sortie["ami"]["tx"] = tx
    return sortie


def agresseurs_du_couplage(couplage, p, o, partenaire=None, excursion=None):
    """Les agresseurs bornes tires du couplage de `simulation_em`.

    LE MEME CHIFFRE QUE L'ONGLET CROSSTALK. Chaque longement de la fiche de
    couplage porte les modes pair et impair de la paire (victime, voisine) ;
    on en tire Kb et Kf -- les memes que `crosstalk.coefficients_couple` --,
    et le niveau 2 de `crosstalk.niveau2` rend le NEXT et le FEXT en
    fraction de l'agresseur, sature ou non selon le front. Les morceaux d'une
    meme voisine s'ajoutent, comme la-bas.

    LE SENS. Une voisine qui emet dans le MEME sens que la victime lui
    envoie son FEXT au recepteur ; en sens OPPOSE, c'est son NEXT. Sans le
    savoir, on prend le plus grand des deux.

    En differentiel, la partenaire n'est pas un agresseur, et le bruit pris
    par UNE piste majore celui de la paire : l'autre piste en prend presque
    autant, du meme signe, et le recepteur differentiel le retranche.
    Rend (agresseurs, notes)."""
    notes = []
    sens = str(o.get("agresseurs_sens") or "inconnu")
    paires = (couplage or {}).get("paires") or []
    try:
        import crosstalk
    except Exception as exc:                           # noqa: BLE001
        return [], ["Diaphonie des voisines indisponible : %s." % exc]
    tr_a = _nombre(o.get("agresseurs_tr"), 0.0) or p["tr"]
    v_a = _nombre(o.get("agresseurs_v"), 0.0) or (excursion or 0.0)
    if not v_a > 0:
        # L'EXCURSION DE LA VICTIME A SA CHARGE, faute de mieux : une voisine
        # de la meme famille logique bascule autant qu'elle.
        k = (p["r_charge"] / (p["r_charge"] + p["r_source"])
             if 0 < p["r_charge"] < 1e9 else 1.0)
        v_a = (p["v_haut"] - p["v_bas"]) * k
    morceaux = {}
    for f in paires:
        voisin = str(f.get("net_voisin") or "")
        if not voisin or (partenaire and voisin == partenaire):
            continue
        try:
            zo, ze = float(f["z_impair"]), float(f["z_pair"])
            eo, ee = float(f["eps_eff_impair"]), float(f["eps_eff_pair"])
            lg = float(f.get("longueur") or 0.0)
        except (KeyError, TypeError, ValueError):
            continue
        if not (zo > 0 and ze > 0 and eo > 0 and ee > 0 and lg > 0):
            continue
        c_o, c_e = math.sqrt(eo) / (C_0 * zo), math.sqrt(ee) / (C_0 * ze)
        l_o, l_e = zo * math.sqrt(eo) / C_0, ze * math.sqrt(ee) / C_0
        k_c = (c_o - c_e) / (c_o + c_e)
        k_l = (l_e - l_o) / (l_e + l_o)
        td = lg * 1e-3 * math.sqrt(0.5 * (eo + ee)) / C_0
        morceaux.setdefault(voisin, []).append(
            (0.25 * (k_c + k_l), 0.5 * (k_l - k_c), td))
    sortie = []
    for voisin in sorted(morceaux):
        n2 = crosstalk.niveau2(morceaux[voisin], tr_a)
        nxt, fxt = abs(n2["next"]), abs(n2["fext"])
        coef = {"meme": fxt, "oppose": nxt}.get(sens, max(nxt, fxt))
        if coef <= 0:
            continue
        sortie.append({"nom": voisin, "coef": coef, "v": v_a,
                       "crete_v": coef * v_a, "next": nxt, "fext": fxt,
                       "sens": sens, "source": "couplage"})
    if sortie:
        notes.append(
            "Diaphonie : %d voisine(s) reprise(s) du couplage (NEXT/FEXT du "
            "niveau 2 de l'onglet Crosstalk, front %.3g ps, excursion %.3g V"
            " %s)%s." % (len(sortie), tr_a * 1e12, v_a,
                         "saisie" if _nombre(o.get("agresseurs_v"), 0.0) > 0
                         else "supposée égale à celle de la victime",
                         " ; en différentiel, le bruit d'une piste majore "
                         "celui de la paire" if partenaire else ""))
    else:
        notes.append("Diaphonie demandée, mais aucune voisine ne longe la "
                     "sélection sur la même couche : rien n'est ajouté.")
    return sortie, notes


def _r_reference(res, p):
    """La resistance de reference des ondes : Z0 de la ligne (Z differentielle
    en differentiel, le demi-circuit la divise). Elle ne change pas le
    resultat, seulement la longueur des reponses impulsionnelles."""
    if p["mode"] == "diff":
        for f in ((res.get("couplage") or {}).get("paires") or []):
            if f.get("differentielle") and f.get("z_diff"):
                return float(f["z_diff"])
        return float((res.get("s_diff") or {}).get("z_ref_diff") or 100.0)
    return float((res.get("ligne") or {}).get("z0_moyen") or 50.0)


def _seuil_vdiff(r, ctx):
    """LA SENSIBILITE DU RECEPTEUR DIFFERENTIEL -- vdiff de [Diff Pin], ou
    Rx_Receiver_Sensitivity d'un .ami -- contre l'oeil : il faut |V| >= vdiff
    a l'echantillonnage, soit une demi-hauteur au moins egale."""
    v = (ctx or {}).get("vdiff")
    if not v or r.get("mode") != "diff":
        return
    m = r["mesures"]
    m["vdiff"] = v
    m["marge_vdiff_prbs"] = 0.5 * m["hauteur_prbs"] - v
    m["marge_vdiff_pire"] = 0.5 * m["hauteur_pire"] - v
    if m["marge_vdiff_pire"] < 0:
        r["avertissements"].append(
            "Seuil du récepteur ±%.3g mV : l'œil pire cas %s." % (
                v * 1e3, "n'y arrive pas" if m["marge_vdiff_prbs"] < 0 else
                "n'y arrive pas, l'œil PRBS si"))


def analyser(doc, journal=None, racines_ami=None):
    """Document de simulation + reglages de l'oeil -> l'oeil. Leve ErreurOeil.

    `racines_ami` : les dossiers sous lesquels une bibliotheque AMI designee
    par la requete peut etre chargee (la LIB, les racines de projets) ;
    aucun, et rien ne s'execute."""
    if ERREUR_OEIL is not None:
        raise ErreurOeil("Diagramme de l'œil indisponible : %s" % ERREUR_OEIL,
                         "Il a besoin de numpy : « pip install numpy ».")
    if not isinstance(doc, dict):
        raise ErreurOeil("Le document envoyé n'est pas un objet JSON.")
    o = doc.get("oeil") or {}
    if not isinstance(o, dict):
        raise ErreurOeil("Réglages de l'œil illisibles.")
    debut = time.time()
    gid = o.get("gabarit") or ""
    gab = gabarit(gid)
    if gid and gab is None:
        raise ErreurOeil("Gabarit « %s » inconnu." % gid,
                         "Rechargez la page : la liste vient du serveur.")
    p = _params(o, gab)
    ctx = preparer_ibis(o, p)
    # L'AMI apres l'IBIS : il peut regler l'egaliseur que l'IBIS a remis a
    # zero, et AVANT la grille, qui depend du CTLE.
    ami = preparer_ami(o, p, ctx)
    temporel = bool(ctx and ctx["temporel"])
    if temporel and p["motif"] == "prbs15":
        raise ErreurOeil("PRBS15 et modèle IBIS : 32 767 bits à simuler pas "
                         "à pas, c'est trop long.",
                         "Prenez PRBS7 ou PRBS9 : le pire cas et l'œil "
                         "statistique couvrent les longues suites.")

    ctl = p.get("ctle")
    tau = 0.0
    if ctl:
        f_bas = min(float(ctl.get("fz") or ctl["fp1"]), float(ctl["fp1"]))
        tau = 8.0 / (2 * math.pi * f_bas)
    tau += 10.0 * (p["r_source"] + 100.0) * p["c_charge"]
    # LES CONDENSATEURS DE LIAISON : la fenetre doit couvrir leur decharge
    # (trois tau de part et d'autre, six en tout) pour que le continu de
    # l'IFFT soit vrai sans artifice ; au-dela du plafond de la grille, le
    # continu est corrige (`resistance_continu_ac`) et le resultat le dit.
    ca = p.get("couplage_ac")
    if ca and ca["tau"]:
        tau += 3.0 * ca["tau"]
    retard_est = _longueur_mm(doc) * 1e-3 * math.sqrt(_er_max(doc)) / C_0
    # AVEC UN TAMPON IBIS, le haut de la grille suit le LISSAGE du canal --
    # la moitie du front du tampon --, pas le front lui-meme : voir `ibis`.
    tr_grille = ctx["tr_lissage"] if temporel else p["tr"]
    if temporel:
        tau += 4.0 * p["tr"]
    df, n, fenetre, pleine = grille(p["debit"], tr_grille, retard_est, tau)
    freqs = df * np.arange(1, n + 1)

    d2 = dict(doc)
    a = dict(d2.get("analyse") or {})
    fc = min(max(p["debit"] / 2.0, freqs[0]), freqs[-1])
    a.update({"f_debut": float(freqs[0]), "f_fin": float(freqs[-1]),
              "points": 2, "f_centre": float(fc)})
    if not a.get("temps_montee"):
        a["temps_montee"] = p["tr"]
    d2["analyse"] = a
    # PAS DE « mode_diff » FORCE : sans seconde piste, la cascade
    # differentielle inventerait une paire decouplee a 2 Z0. L'oeil exige la
    # vraie, trouvee par le couplage ou declaree dans `paires`.
    d2.pop("mode_diff", None)
    try:
        res = se.simuler(d2, garder_abcd=True, freqs_imposees=freqs)
    except se.ErreurSimulation as exc:
        raise ErreurOeil(exc.message, exc.conseil)
    if res.get("cascade_refusee"):
        raise ErreurOeil(res["cascade_refusee"],
                         "L'œil demande une liaison d'un bout à l'autre : "
                         "sélectionnez un seul parcours, sans dérivation.")
    av = []
    m_brins = None
    if p["mode"] == "diff":
        sd = res.get("s_diff") or {}
        abcds = sd.get("abcd_dd")
        if not abcds or not sd.get("partenaire"):
            raise ErreurOeil("Aucune paire différentielle trouvée pour la "
                             "sélection.",
                             "Sélectionnez les deux pistes de la paire, ou "
                             "nommez la Piste 2.")
        nv, nc = int(sd.get("vias") or 0), int(sd.get("coudes") or 0)
        if sd.get("quatre_acces") and sd.get("abcd_brins") is not None:
            # LA PAIRE DISSYMETRIQUE, BRIN PAR BRIN (2.2.0) : la cascade a
            # quatre acces de `simulation_em`, conversions de mode comprises.
            m_brins = np.array(sd["abcd_brins"], dtype=complex)
            av.append("Différentiel : paire dissymétrique (%s) — cascade à "
                      "quatre accès, brin par brin : chaque brin a sa "
                      "section, ses vias et ses coudes, et l'œil lit la "
                      "tension différentielle au récepteur, conversions de "
                      "mode comprises." % "; ".join(
                          sd.get("dissymetries") or ["forcée"]))
        else:
            av.append("Différentiel : la cascade du mode impair porte les "
                      "tronçons de la paire%s." % (
                          (", ses %d via(s) et %d coude(s), posés à "
                           "l'identique sur les deux brins, mutuelle des "
                           "fûts comprise" % (nv, nc)) if (nv or nc) else
                          " ; elle n'a ni via ni coude"))
    else:
        abcds = res.get("abcd")
        if not abcds:
            raise ErreurOeil("La liaison n'a pas pu être mise en cascade.")
    if not pleine:
        av.append("Grille de fréquences plafonnée à %d points : la fenêtre de "
                  "calcul est raccourcie à %.3g ns." % (MAX_FREQS,
                                                        fenetre * 1e9))
    # -- les deux brins de la paire, ou le canal seul avec ses boitiers --
    abcd_cc, surlong, nl_ref = None, None, None
    sd = res.get("s_diff") or {}
    dl = float(sd.get("delta_l_mm") or 0.0)
    if m_brins is not None and dl > 0 and sd.get("brin_long"):
        segs = res.get("segments") or [{}]
        eps = float(segs[0].get("eps_eff", 4.0) or 4.0)
        av.append("Les deux brins diffèrent de %.3g mm : le brin %s est le "
                  "plus long, et sa surlongueur (%.3g ps) est posée sur lui, "
                  "côté récepteur, dans la cascade à quatre accès." % (
                      dl, sd["brin_long"],
                      dl * 1e-3 * math.sqrt(max(eps, 1.0)) / C_0 * 1e12))
    if ctx and ctx["paire"]:
        if m_brins is not None and sd.get("abcd_cc") is not None:
            # La reference symetrique : la paire symetrisee, ses deux modes.
            abcd_cc = np.array(sd["abcd_cc"], dtype=complex)
        elif sd.get("s_cc") and len(sd["s_cc"]) == len(freqs):
            abcd_cc = abcd_depuis_s(sd["s_cc"], sd.get("z_ref_comm") or
                                    0.25 * float(sd.get("z_ref_diff") or
                                                 100.0))
        if abcd_cc is not None and dl > 0 and m_brins is None:
            segs = res.get("segments") or [{}]
            eps = float(segs[0].get("eps_eff", 4.0) or 4.0)
            surlong = {"retard": dl * 1e-3 * math.sqrt(max(eps, 1.0)) / C_0,
                       "z0": float((res.get("ligne") or {}).get("z0_moyen")
                                   or 50.0), "mm": dl}
            av.append("Les deux brins diffèrent de %.3g mm : la surlongueur "
                      "(%.3g ps) est posée sur le brin inverse, comme une "
                      "ligne seule — la cascade de la paire ne dit pas lequel "
                      "est le plus long." % (dl, surlong["retard"] * 1e12))
        if abcd_cc is None:
            av.append("Cascade du mode commun indisponible : la paire est "
                      "simulée en demi-circuit du mode impair, le mode "
                      "commun tenu fixe — décalage et dissymétries des deux "
                      "brins ne sont pas suivis.")
    # -- les condensateurs de liaison, dans les cascades du canal ---------
    # Entre le boitier et la piste : devant le canal (position emetteur) ou
    # derriere (recepteur), avant que les boitiers IBIS ne les encadrent.
    info_ac = None
    if ca:
        abcds, abcd_cc, m_brins = poser_couplage_ac(ca, freqs, abcds, abcd_cc,
                                                    m_brins, p["mode"])
        info_ac = _fiche_couplage_ac(ca, p, fenetre, av)
    note_bt = ""
    canal, h0_canal, h0_bin, lent = abcds, None, None, None
    mut = bool(ctx and (ctx.get("mut_em") or ctx.get("mut_rx")))
    if m_brins is not None and not (temporel and abcd_cc is not None):
        # LA PAIRE DISSYMETRIQUE EN LINEAIRE : le transfert differentiel
        # de la paire par brin, boitiers poses brin par brin.
        bins = {}
        canal, h0_canal, note_bt = transfert_paire(ctx, freqs, m_brins, p,
                                                   continu=bins)
        h0_bin = bins["bin"] if ca else None
        lent = bins.get("lent")
        if note_bt and mut:
            note_bt += ", mutuelles de la paire comprises"
    elif abcd_cc is None:
        abcds, note_bt = appliquer_boitiers(ctx, freqs, abcds, p["mode"])
        canal = abcds
        if note_bt and p["mode"] == "diff" and asymetries(ctx):
            note_bt += " — la moyenne des deux broches, sur les deux brins"
    elif any(ctx["bt_em"]) or any(ctx["bt_rx"]) or mut:
        note_bt = "boîtiers comptés, broche par broche%s" % (
            ", mutuelles de la paire comprises" if mut else "")
    if ctx and ctx["notes"]:
        av.extend(ctx["notes"])
    nl = None
    if temporel and abcd_cc is not None:
        nl = simuler_paire(ctx, freqs, abcds, abcd_cc, p,
                           _r_reference(res, p), surlong, m_brins=m_brins)
        p["v_haut"], p["v_bas"] = nl["v_haut"], nl["v_bas"]
        if asymetries(ctx) or surlong or m_brins is not None:
            nl_ref = simuler_paire(ctx, freqs, abcds, abcd_cc, p,
                                   _r_reference(res, p), None,
                                   symetrique=True, seulement_onde=True)
    elif temporel:
        nl = simuler_non_lineaire(ctx, freqs, abcds, p, _r_reference(res, p))
        p["v_haut"], p["v_bas"] = nl["v_haut"], nl["v_bas"]
    if nl is not None:
        if nl["infos"]["asymetrie"] > 0.05:
            av.append("Les fronts montant et descendant du tampon diffèrent "
                      "de %.0f %% : le pire cas et l'œil statistique "
                      "prennent leur moyenne, l'œil PRBS les suit tels "
                      "quels." % (100 * nl["infos"]["asymetrie"]))
    if o.get("agresseurs_auto"):
        part = ((res.get("s_diff") or {}).get("partenaire")
                if p["mode"] == "diff" else None)
        trouves, notes = agresseurs_du_couplage(
            res.get("couplage"), p, o, part,
            excursion=(nl["v_haut"] - nl["v_bas"]) if nl else None)
        p["bornes"] = list(p["bornes"]) + trouves
        av.extend(notes)
    # LES MODELES AMI, s'il y en a a executer : apres la cascade et les
    # tampons, avant l'oeil, qui lit alors leur reponse (voir `executer_ami`).
    if ami is not None and ami.get("_biblios"):
        nl = executer_ami(ami, p, freqs, canal, h0_canal, h0_bin, nl,
                          racines_ami, av, lent)
    try:
        r = oeil(freqs, canal, p, gab, h0=h0_canal, journal=journal,
                 non_lineaire=nl, h0_bin=h0_bin, lent=lent)
    finally:
        for bout in ("rx", "tx"):
            if nl is not None and nl.get("ami") and nl["ami"].get(bout):
                nl["ami"][bout].fermer()
    manque = []
    if not (p.get("rj_ui") or p.get("dj_ui") or p.get("bruit_v")):
        manque.append("sans gigue aléatoire ni bruit")
    if not p.get("bornes"):
        manque.append("sans diaphonie des voisines")
    if ctx:
        bouts = []
        if ctx["em"] is not None:
            bouts.append("émetteur IBIS")
        else:
            bouts.append("émetteur linéaire (Thévenin)")
        if (ctx["infos"].get("recepteur") or {}).get("modele"):
            bouts.append("récepteur IBIS (C_comp%s)" % (
                " et diodes" if ctx["rx"] is not None else ""))
        else:
            bouts.append("récepteur linéaire")
        quoi = " et ".join(bouts)
        if temporel:
            quoi += (", simulés dans le temps (pas %.3g ps, canal lissé par "
                     "un front de %.3g ps%s)"
                     % (nl["dt"] * 1e12, ctx["tr_lissage"] * 1e12,
                        (" ; les deux brins de la paire" if abcd_cc is not
                         None else "")))
        quoi += " ; %s" % (note_bt or (
            "boîtier non compté (demandé)" if not ctx["boitier"] else
            "sans boîtier dans les fichiers"))
        r["ibis"] = nl["infos"] if nl else ctx["infos"]
        if abcd_cc is not None and nl is not None:
            mc = mode_commun(nl, nl_ref)
            if mc is not None:
                mc["asymetries"] = asymetries(ctx) + (
                    ["surlongueur de %.3g mm" % surlong["mm"]]
                    if surlong else []) + (
                    ["paire : %s" % x for x in (sd.get("dissymetries") or [])]
                    if m_brins is not None else []) + (
                    ["fronts montant et descendant du tampon différents "
                     "(%.0f %%) : le mode commun en vient même entre deux "
                     "brins identiques" % (100 * nl["infos"]["asymetrie"])]
                    if nl["infos"]["asymetrie"] > 0.01 else [])
                r["mode_commun"] = mc
        _seuil_vdiff(r, ctx)
    else:
        quoi = "Émetteur et récepteur linéaires (pas de modèle IBIS)"
    if ami is not None:
        ami.pop("_lus", None)
        ami.pop("_biblios", None)
        r["ami"] = ami
        ex = ami.get("execution") or {}
        if nl is not None and nl.get("ami"):
            # les instants eux-memes restent ici : un tableau par bit
            r["ami"]["horloges"] = {
                k: v for k, v in nl["ami"]["horloges"].items()
                if k != "instants"}
            if r.get("horloge_ami"):
                r["ami"]["horloges"].update(r["horloge_ami"])
            ami["execution_ok"] = [b for b, f in ex.items() if f.get("init")]
        if ami["renvois"] and not (ami["emetteur"] or ami["recepteur"]):
            av.append("Le modèle déclare un [Algorithmic Model] (%s) : "
                      "chargez son fichier .ami pour le lire. La bibliothèque "
                      "elle-même n'est pas exécutée." % ", ".join(
                          "%s, %s" % (x["fichier_ami"], x["bibliotheque"])
                          for x in ami["renvois"]))
        elif ami["applique"]:
            av.append("Égaliseur de référence réglé d'après le .ami : %s.%s"
                      % (", ".join(ami["applique"]),
                         "" if ami.get("execution_ok") else
                         " Le modèle AMI n'est pas exécuté."))
    r["avertissements"] = av + r["avertissements"] + [
        "%s, %s, %s : l'œil est celui que la piste%s laisse passer." % (
            quoi[0].upper() + quoi[1:],
            ", ".join(manque) if manque else "gigue et diaphonie comprises",
            ("condensateurs de liaison de %s par brin côté %s compris"
             % (_farads(ca["c"]), "émetteur" if ca["position"] == "emetteur"
                else "récepteur")) if ca else
            "et sans condensateurs de liaison",
            "" if ca else " seule")]
    if info_ac is not None:
        r["couplage_ac"] = info_ac
    if not p.get("stat"):
        # Les reglages facultatifs ne s'ajoutent pas au resultat quand ils
        # n'ont pas servi : sans eux, la reponse reste celle d'avant.
        for cle in ("rj_ui", "dj_ui", "bruit_v", "ber_cible", "bornes",
                    "stat"):
            p.pop(cle, None)
    if not ca:
        p.pop("couplage_ac", None)
    r.update({
        "format": FORMAT_RESULTAT, "version": VERSION,
        "net": doc.get("net") or "", "carte": doc.get("carte") or "",
        "partenaire": ((res.get("s_diff") or {}).get("partenaire")
                       if p["mode"] == "diff" else None),
        "ligne": res.get("ligne"),
        "avertissements_ligne": res.get("avertissements") or [],
        "parametres": {k: v for k, v in p.items() if k != "ctle"},
        "duree": round(time.time() - debut, 3),
    })
    if m_brins is not None:
        # CE QUI DISTINGUE LES DEUX BRINS, quand la cascade a quatre acces a
        # servi -- rien de plus sinon : la reponse d'une paire symetrique
        # reste celle d'avant.
        r["paire_brins"] = {"dissymetries": list(sd.get("dissymetries") or []),
                            "brin_long": sd.get("brin_long"),
                            "delta_l_mm": dl,
                            "vias": sd.get("vias_brins")}
    if journal:
        mes = r["mesures"]
        journal("  oeil « %s » : %.4g Gb/s, hauteur %.1f mV (pire %.1f mV),"
                " %d points, %.1f s\n" % (r["net"] or "(sans nom)",
                                          p["debit"] / 1e9,
                                          mes["hauteur_prbs"] * 1e3,
                                          mes["hauteur_pire"] * 1e3, n,
                                          r["duree"]))
    return r
