# Crosstalk en conditions réelles — spécification

> **Statut : spécification, rien n'est codé.** Décisions prises le 2026-10-09
> pour étendre l'onglet *Crosstalk* du panneau Simulation EM, commun à
> l'**éditeur PCB** et à la **visionneuse IPC-2581**. Le fonctionnement actuel
> est décrit dans [simulation-em.md](simulation-em.md#crosstalk--où-le-couplage-se-fabrique)
> et dans [python/crosstalk.py](../python/crosstalk.py).

---

## 1. Point de départ : ce que les deux modes font aujourd'hui

| | Analyse géométrique (`simple`) | Analyse électrique (`precis`) |
| --- | --- | --- |
| **Adaptation** | supposée parfaite aux 4 bouts, implicite dans Kb = ¼(Cm/C₀ + Lm/L₀) et Kf = ½(Lm/L₀ − Cm/C₀) | les 2N ports fermés sur une même résistance « Réf. ports » (50 Ω par défaut) ; ni Rs de driver, ni Cin de récepteur, ni R série |
| **Réflexions** | aucune, onde directe seulement | exactes dans la cascade (changement de largeur, de couche) et aux ports, mais **par rapport à la référence**, pas aux vraies charges |
| **Retard** | profil de retard cumulé bloc par bloc, vitesse propre à chaque piste ; sert à Kb·2T_d, Kf·T_d, front de saturation | complet : phase, vitesses modales, instant du pic, conversion temps → position |

Conséquence : sur une victime CMOS réelle (récepteur haute impédance), le bruit
peut dépasser ce qui est affiché — le FEXT double sur un bout ouvert, et le NEXT
se réfléchit selon le Rs du driver.

---

## 2. Où et comment

- Une **case « conditions réelles »** dans l'Analyse électrique. Décochée, rien
  ne change : ports sur la référence, bancs de test et export Touchstone
  intacts. Pas de troisième mode.
- Même comportement dans l'**éditeur PCB** et la **visionneuse IPC-2581**.
- Principe de calcul : la matrice S du réseau existe déjà ; les terminaisons et
  les passifs se posent **après coup, en fréquence**, sans relancer la
  résolution des sections droites.
- Règle du dépôt, conservée : **rien de supposé en silence**. Toute valeur
  venant d'un preset ou d'une valeur typique est affichée comme *supposée*.

---

## 3. Terminaisons

### 3.1 Drivers

- Saisie par **presets selon la nature**, **chaque valeur de chaque preset est
  modifiable**.
- Rs en **deux champs : Rs haut et Rs bas** (égaux par défaut en CMOS).
- On saisit les valeurs **du chip seul** (datasheet). Une R série détectée est
  un élément à part du réseau, ajouté en plus — voir § 4.
- Valeurs modifiées gardées **par projet uniquement** ; les presets d'origine
  restent figés.

| Preset | Rs haut | Rs bas | tr | tf | Niveaux |
| --- | --- | --- | --- | --- | --- |
| CMOS 3,3 V (GPIO µC) | 33 Ω | 33 Ω | 1 ns | 1 ns | 0 / 3,3 V |
| CMOS 1,8 V | 45 Ω | 45 Ω | 0,5 ns | 0,5 ns | 0 / 1,8 V |
| FPGA rapide | 20 Ω | 20 Ω | 0,3 ns | 0,3 ns | selon la banque d'E/S |
| Open-drain (I²C, superviseur) | pull-up R (+ C) | 15 Ω | R·C | 1 ns | VDD |
| TTL 5 V (74LS) | 100 Ω | 15 Ω | 5 ns | 3 ns | VOL 0,4 V / VOH 3,4 V |
| TTL rapide 5 V (74F/ALS) | 50 Ω | 10 Ω | 2 ns | 1,5 ns | VOL 0,4 V / VOH 3,4 V |
| LVTTL 3,3 V | 30 Ω | 30 Ω | 1 ns | 1 ns | 0 / 3,3 V |

Les fronts CMOS rejoignent `FRONTS_FAMILLE` de `crosstalk.py` (1 ns ≥ 2,5 V,
0,5 ns de 1,2 à 2,5 V).

### 3.2 Sens du signal de la victime

**Choix manuel** : l'utilisateur indique de quel côté est le driver de chaque
victime. Il décide si le NEXT tombe sur le récepteur ou sur le driver.
(L'IPC-2581 ne porte presque jamais le sens des broches.)

---

## 4. Composants passifs

- **Détectés automatiquement** dans l'éditeur et dans la visionneuse : type et
  valeur depuis la BOM (`Component.value`, `comp_type`), topologie depuis les
  broches (`Component.pin_nets`).
- **Posés à leur position réelle**, à l'abscisse de leur pastille le long du
  parcours, comme élément localisé entre deux blocs de la cascade.
- **Valeur absente de la BOM → elle est demandée** ; la simulation réelle
  attend la saisie.

| Passif (tous en V1) | Détection | Modèle |
| --- | --- | --- |
| R série | 2 broches, sur deux nets de signal | R en série ; **les deux nets sont chaînés** : driver → piste → R → piste → récepteur simulé comme une seule liaison |
| R pull-up / pull-down | une broche sur le net, l'autre sur une alim / la masse | R en parallèle |
| C vers masse | une broche sur le net, l'autre sur la masse | C en parallèle |
| Diode ESD / TVS | idem | sa capacité (datasheet), en parallèle |
| Ferrite / self série | 2 broches en série | R + L simplifié, **signalé approximatif** |

Avertissement affiché dès qu'une R série est prise en compte, par exemple :
« R12 (33 Ω) en série détectée et prise en compte. Ne l'incluez pas dans le Rs du
driver. »

---

## 5. Stimulus de l'agresseur

Trois types en V1, tous les champs réglables.

| Type | Paramètres (défaut) |
| --- | --- |
| Front unique | comme aujourd'hui |
| Horloge | fréquence (25 MHz), rapport cyclique (50 %), tr / tf du driver |
| Trame série **sur une piste** | motif hex ou binaire (`0xA5` ; `0x55` = pire cas en transitions), débit (1 Mbit/s), ordre MSB/LSB (MSB), encadrement UART start + stop (non), répétition (1) |

**Durée simulée** : automatique (quelques périodes jusqu'au régime établi, ou
longueur de la trame), modifiable.

### 5.1 Méthode de calcul : un front, puis la superposition

**Le piège.** La transformée inverse ne voit qu'une fenêtre T = 1/Δf, et ce
qui la dépasse se replie au début. Simuler la trame d'un coup en fréquence
coûterait f_max × durée points : 8 bits à 1 Mbit/s avec des fronts de 1 ns,
soit ~3 GHz × 8 µs ≈ **24 000 fréquences**, contre `MAX_POINTS` = 401
aujourd'hui. Même problème pour une horloge sur plusieurs périodes. **On ne
fait donc pas ça.**

**La méthode retenue**, exacte puisque le réseau (lignes, terminaisons,
passifs) est linéaire :

1. **Une réponse par sens de front**, calculée en fréquence comme
   aujourd'hui, avec terminaisons et passifs posés sur la matrice S : la
   tension sur la broche de la victime pour un front montant de l'agresseur,
   et une pour un front descendant. Deux réponses distinctes parce que
   Rs haut ≠ Rs bas (TTL, open-drain) et tr ≠ tf ; avec un driver symétrique,
   la descendante est l'opposée de la montante. La fenêtre n'a à couvrir que
   le front, quelques allers-retours et l'amortissement des rebonds — quelques
   dizaines de ns —, donc les 401 points suffisent.
2. **La trame ou l'horloge se construit dans le temps** en additionnant, à
   chaque transition du motif, la réponse du bon sens décalée à son instant.
   Deux bits identiques à la suite n'ajoutent rien. Coût négligeable, durée
   et motif quelconques.
3. **Le spectre** affiché se calcule ensuite sur cette forme d'onde.

**Garde-fous à prévoir :**

- la fenêtre de la réponse à un front doit contenir **tout** l'amortissement :
  vérifier que la réponse est revenue sous un seuil (par exemple 1 % de son
  pic) en fin de fenêtre, sinon allonger la fenêtre, et le dire si la limite
  de points est atteinte ;
- la superposition suppose un réseau **linéaire** : c'est vrai avec les
  presets (Rs fixes, capacités fixes) ; une diode ESD qui conduit ou un
  driver modélisé en IBIS sortiraient de ce cadre (voir § 9) ;
- le front unique reste calculé tel quel : c'est le cas particulier d'une
  seule transition.

---

## 6. Victimes : nature, charge, critère

- Nature **proposée d'après le nom du net** (RESET, CLK, D0..D7, ADC_IN…), à
  confirmer, dans l'éditeur **et** la visionneuse.
- Toutes les natures en V1 ; toutes les valeurs modifiables.

| Nature | Charge par défaut | Critère par défaut |
| --- | --- | --- |
| Logique CMOS 3,3 V | Cin 5 pF | marge de bruit 0,4 V |
| Logique CMOS 1,8 V | Cin 5 pF | marge de bruit 0,18 V |
| Logique TTL / LVTTL | Cin 5 pF ; VIL 0,8 V, VIH 2,0 V | marge de bruit 0,4 V |
| Reset / IRQ / CS | pull-up 10 kΩ, Cin 10 pF, hystérésis | glitch sous VIL plus long que **20 ns** = danger (seuil à régler selon le µC) |
| Entrée ADC | filtre du preset 100 Ω + 1 nF, C d'échantillonnage 8 pF | bruit < ½ LSB (12 bits, Vref 3,3 V → 0,4 mV) |
| Horloge victime | Rs 33 Ω, Cin 5 pF | gigue = bruit ÷ pente au seuil, < 1 % de la période |
| Alim numérique | 100 nF (ESL 0,5 nH), régulateur 50 mΩ | ondulation < 1 % du rail |
| VREF / alim analogique | 10 µF + 100 nF | ondulation < 1 mV, ou ½ LSB d'un ADC rattaché |

**Filtre ADC** : saisi dans le preset, mais **si un filtre est détecté sur la
carte** (R série et C vers masse sur le net), **il remplace celui du preset**,
et la fiche le dit. Pas de double comptage.

---

## 7. Sortie

- **Forme d'onde** sur la broche de la victime, sur la durée simulée.
- **Verdict** selon le critère de sa nature.
- **Spectre** (raies d'horloge, utile pour l'ADC et la CEM).

---

## 8. Analyse géométrique

Elle reste **sans aucun signal**. Seul ajout retenu : une **étiquette « net
sensible »** (reset, ADC, horloge…). Elle ne change aucun calcul et fait
remonter ces nets en tête du classement et des actions.

---

## 9. Hors périmètre / plus tard

- Pertes conductrices (effet de peau) : plus tard.
- Bus parallèle multi-agresseurs (relever `MAX_AGRESSEURS`) : non demandé en V1.
- Couplage vertical entre pistes superposées : manque connu du solveur de
  section, hors de ce chantier.
- Rebond de masse (SSN) : hors de l'onglet Crosstalk.
- Composants non linéaires (driver IBIS, diode ESD en conduction) : la
  superposition du § 5.1 ne s'y applique plus ; il faudrait une approche
  mixte, lignes en fréquence et composants dans le temps.
