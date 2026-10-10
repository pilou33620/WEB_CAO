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

CE QUI N'EST PAS LA, et se dit dans chaque resultat : un emetteur et un
recepteur NON lineaires (IBIS), la gigue aleatoire de l'emetteur, la
diaphonie des voisines, les condensateurs de liaison (couplage AC). Les
gabarits portent chacun leur FIABILITE : les normes sont payantes, et une
valeur qui n'a pas pu etre recoupee le dit.

Le document d'entree est celui de `simulation_em` (format « cao-sim-em-* »)
avec un champ de plus, EN UNITES SI :

    oeil {debit (bit/s), tr (s), v_haut, v_bas (V, a vide), r_source (ohm),
          r_charge (ohm, 0 = haute impedance), c_charge (F),
          mode "simple"|"diff", motif "prbs7"|"prbs9"|"prbs15",
          gabarit (id de GABARITS ou ""), egaliseur (bool),
          ffe [coefficients], ffe_principal (rang du curseur principal),
          dfe_prises, dfe_max (V), ctle {adc_db, fz, fp1, fp2},
          setup, hold (s, pour les gabarits « seuils »)}
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

VERSION = "1.0.0"
FORMAT_RESULTAT = "cao-oeil-resultat-1"
MAX_CORPS = 4 * 1024 * 1024

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
#   corrobore   valeurs recoupees avec une source publique (fiche de
#               fabricant, note d'application) -- la norme elle-meme, payante,
#               n'a pas ete lue ;
#   a_verifier  valeurs connues de la norme mais NON recoupees ici ;
#   derive      pas de gabarit officiel : construit a partir des seuils du
#               recepteur et de sa fenetre setup/hold.
# ==========================================================================

FIABILITES = {
    "corrobore": ("Valeurs recoupées avec une source publique (fiche de "
                  "fabricant, note d'application). La norme elle-même n'a "
                  "pas été consultée."),
    "a_verifier": ("Valeurs de la norme NON recoupées par une source "
                   "publique : à vérifier dans la version de la norme qui "
                   "s'applique avant de conclure."),
    "derive": ("Pas de gabarit officiel pour ce bus : celui-ci est construit "
               "à partir des seuils logiques du récepteur (VIL/VIH) et de sa "
               "fenêtre setup/hold."),
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
               "Microchip DS00002142A (tableau « Hi-Speed eye pattern »).",
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
     "fiabilite": "a_verifier",
     # VERIFIE EN 2026-10 SANS SUCCES : aucune source publique accessible
     # (fiches TI, Keysight, Diodes AN77, notes onsemi) ne reproduit les
     # points du Template 2 ; elles renvoient toutes a la figure 7-15 de la
     # norme. Les points ci-dessous sont ceux de la figure tels qu'on s'en
     # souvient (0 V a 12,5 et 87,5 % UI, ±175 mV de 35 a 65 % UI) : ils
     # restent « a verifier », et c'est dit.
     "source": "USB 2.0 §7.1.2.2, figure 7-15 (Template 2, extrémité de "
               "câble captif / TP3 d'un hub) et figure 7-17 (Template 4, "
               "sensibilité du récepteur au bout du câble).",
     "note": "Points du template NON recoupés : aucune source publique "
             "consultée (fiches TI, Keysight, Diodes, onsemi) ne les "
             "reproduit ; elles renvoient à la figure 7-15 de la norme. "
             "Vérifiez-les avant de vous fier au verdict.",
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
     "fiabilite": "a_verifier",
     # VERIFIE EN 2026-10 SANS SUCCES. Le masque du puits a TP2 est la
     # figure 4-32 de HDMI 1.4 (§4.2.6), qu'aucune source publique ne
     # reproduit. Ce qu'on trouve (ST AN5121, TI TMDS181) est le masque de
     # la SOURCE au bout du cable de reference (TP2_EQ) de HDMI 2.0 : 0,6 UI
     # et 335 mV a 3,4 Gb/s, 0,4 UI et 150 mV a 6 Gb/s. Ce n'est pas la meme
     # exigence : on ne le recopie pas, et le gabarit reste « a verifier ».
     "source": "HDMI 1.4 §4.2.6, figure 4-32 (masque du puits à TP2) : "
               "150 mV, 0,6 UI, NON recoupés. Les seules valeurs publiques "
               "(ST AN5121, TI TMDS181 : 0,6 UI / 335 mV à 3,4 Gb/s, "
               "0,4 UI / 150 mV à 6 Gb/s) sont celles de la SOURCE au bout "
               "du câble de référence en HDMI 2.0 — une autre exigence.",
     "note": "L'émetteur TMDS est une source de courant (10 mA) sans "
             "terminaison de départ : les réflexions qui reviennent ne sont "
             "pas absorbées côté émetteur.",
     "masque": {"type": "hexagone", "largeur_ui": 0.60, "plat_ui": 0.20,
                "hauteur_v": 0.150},
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
            "fiabilites": FIABILITES}


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


def oeil(freqs, abcds_ou_h, p, gab=None, h0=None, journal=None):
    """L'oeil complet a partir d'une cascade ABCD (ou d'un transfert H).

    `abcds_ou_h` : (N, 2, 2) ABCD -- on y ferme alors generateur et charge --,
    ou un vecteur H(f) deja ferme, accompagne de `h0`. C'est cette seconde
    forme que les bancs emploient pour des canaux ideaux."""
    freqs = np.asarray(freqs, dtype=float)
    av = []
    arr = np.asarray(abcds_ou_h)
    if arr.ndim == 3:
        h, h0 = transfert(arr, freqs, p["r_source"], p["r_charge"],
                          p["c_charge"])
    else:
        h = arr.astype(complex)
        if h0 is None:
            h0 = float(abs(h[0]))
    ui, tr = p["ui"], p["tr"]
    spu = ECHANTILLONS_UI
    dt_e = ui / spu
    amp = (p["v_haut"] - p["v_bas"]) / 2.0
    v_mil = (p["v_haut"] + p["v_bas"]) / 2.0
    df = freqs[1] - freqs[0]
    fenetre = 1.0 / df
    t_h = fenetre / 2.0

    meilleur = None
    for spec in _candidats_ctle(p.get("ctle")):
        hc = h * ctle(freqs, spec) if spec else h
        x0 = h0 * _gain_continu_ctle(spec)
        n_min = int(math.ceil(fenetre / min(dt_e, tr / 8.0)))
        dt, s = reponse_indicielle(freqs, hc, x0, tr, n_min)
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
    v_c = v_mil * x0
    echelle = max(float(np.max(np.abs(s[:n_h]))), 1e-12)
    if abs(s[n_h - 1] - x0) > 0.02 * echelle:
        av.append("La réponse ne s'est pas éteinte dans la fenêtre de calcul "
                  "(%.3g ns) : la liaison sonne encore. Les niveaux peuvent "
                  "être faux de quelques pour cent." % (t_h * 1e9))
    if abs(s[0]) > 0.02 * echelle:
        av.append("La réponse déborde de la fenêtre de calcul et revient par "
                  "l'autre bout : l'œil est à prendre avec réserve.")

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
        isi = float(np.sum(np.abs(reste)))
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
    h_pire = 2.0 * m["ouv"]

    # -- l'oeil PRBS, par superposition ----------------------------------
    ordre = {"prbs7": 7, "prbs9": 9, "prbs15": 15}.get(p["motif"])
    if ordre is None:
        raise ErreurOeil("Motif « %s » inconnu." % p["motif"],
                         "Choisissez PRBS7, PRBS9 ou PRBS15.")
    bits = prbs(ordre)
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
    return {
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
            "retard": i_s * dt_e - 4.0 * tr / TR_SUR_SIGMA - ui / 2.0
                      - p["ffe_principal"] * ui,
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


def analyser(doc, journal=None):
    """Document de simulation + reglages de l'oeil -> l'oeil. Leve ErreurOeil."""
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

    ctl = p.get("ctle")
    tau = 0.0
    if ctl:
        f_bas = min(float(ctl.get("fz") or ctl["fp1"]), float(ctl["fp1"]))
        tau = 8.0 / (2 * math.pi * f_bas)
    tau += 10.0 * (p["r_source"] + 100.0) * p["c_charge"]
    retard_est = _longueur_mm(doc) * 1e-3 * math.sqrt(_er_max(doc)) / C_0
    df, n, fenetre, pleine = grille(p["debit"], p["tr"], retard_est, tau)
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
    if p["mode"] == "diff":
        sd = res.get("s_diff") or {}
        abcds = sd.get("abcd_dd")
        if not abcds or not sd.get("partenaire"):
            raise ErreurOeil("Aucune paire différentielle trouvée pour la "
                             "sélection.",
                             "Sélectionnez les deux pistes de la paire, ou "
                             "nommez la Piste 2.")
        av.append("Différentiel : la cascade du mode impair porte les "
                  "tronçons de la paire, mais pas ses vias ni ses coudes.")
    else:
        abcds = res.get("abcd")
        if not abcds:
            raise ErreurOeil("La liaison n'a pas pu être mise en cascade.")
    if not pleine:
        av.append("Grille de fréquences plafonnée à %d points : la fenêtre de "
                  "calcul est raccourcie à %.3g ns." % (MAX_FREQS,
                                                        fenetre * 1e9))
    r = oeil(freqs, abcds, p, gab, journal=journal)
    r["avertissements"] = av + r["avertissements"] + [
        "Émetteur et récepteur linéaires (pas de modèle IBIS), sans gigue "
        "aléatoire, sans diaphonie des voisines et sans condensateurs de "
        "liaison : l'œil est celui que la piste seule laisse passer."]
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
    if journal:
        mes = r["mesures"]
        journal("  oeil « %s » : %.4g Gb/s, hauteur %.1f mV (pire %.1f mV),"
                " %d points, %.1f s\n" % (r["net"] or "(sans nom)",
                                          p["debit"] / 1e9,
                                          mes["hauteur_prbs"] * 1e3,
                                          mes["hauteur_pire"] * 1e3, n,
                                          r["duree"]))
    return r
