# À faire — Roadmap & Backlog

Ce document liste les tâches planifiées, en cours et à venir pour la suite de CAO électronique WEB_CAO.
Pour les détails techniques approfondis, les dérivations physiques et l'historique complet des réalisations passées, consulter :
- [docs/simulation-em.md](docs/simulation-em.md) — Référence technique des solveurs et modèles SI/PI.
- [docs/HISTORIQUE_DEVELOPPEMENT.md](docs/HISTORIQUE_DEVELOPPEMENT.md) — Archive complète des développements, audits et post-mortems (août - sept. 2026).

---

## État des lieux (septembre 2026)

L'ensemble de la chaîne est fonctionnel et couvert par **plus de 1 500 essais automatisés, tous passés** (relevé du 25/09/2026) :

| Composant | Statut | Couverture / Bancs |
| --- | --- | --- |
| **Éditeur PCB** | En service | 756 essais (`editeur-pcb/test/harness.js`) |
| **Éditeur Schématique** | En service | 119 essais (`editeur-schematique/test/harness.js`) |
| **Visionneuse IPC-2581** | En service | 178 essais (`harness-sim.js`) + 55 (`banc-essai.py`) |
| **SI — Impédance & Vias (`ligne_mom` v2.5.0)** | En service (0,3 à 0,4 % vs étalons) | 199 cas (`python/test/banc-ligne-mom.py`) |
| **SI — Z différentielle (`solve_multiline`)** | En service (< 3 % vs Garg-Bahl) | inclus dans les 199 cas |
| **SI — Crosstalk localisé (`crosstalk` v3.6.0)** | En service (%, dB, volts le long du tracé ; mode simple classé par Kb·2Td) | 65 cas (`python/test/banc-crosstalk.py`), dont validation de bout en bout contre la triplaque exacte, Cohn et Garg-Bahl |
| **Cascade SI / PDN (`simulation_em` v4.2.0)** | En service | couvert par les bancs `ligne_mom`, crosstalk et éditeur |
| **PI — Chute DC & Échauffement (`dc_solver` v2.1.0)** | En service (IR drop, densité J, modèle étalement) | 42 cas (`python/test/banc-dc.py`) |
| **Scoring placement & Rotation (`pcb_scoring`)** | En service (HPWL, congestion, découplage HF, auto-rotation) | 18 cas (`python/test/banc-pcb-scoring.py`) |
| **Reconnaissance de motifs (`pattern_recognition`)** | En service (LDO/78xx/79xx/Buck, I2C, SPI, UART, quartz, RC, courants DC) | 22 cas (`python/test/banc-patterns.py`) |
| **Assistant IA (schéma, PCB, visionneuse, Gestion LIB)** | En service (Google AI Studio : Gemma 4 31B par défaut, Gemini 3.8 Flash / Flash Thinking ; clé API en mémoire vive uniquement ; datasheets PDF jointes → réglages de simulation vérifiés et cochés un à un) | `commun/ia-assistant.js`, `gestion-lib/js/06-ia-lib.js` |
| **Serveur `web_CAO.py`** | En service (détection Raspberry Pi / terminal sans affichage : navigateur non ouvert par défaut, `--navigateur` / `--sans-navigateur`) | `banc-serveur-routes.py`, `banc-lib-routes.py`, `banc-maj-github.py`, `banc-detection-plateforme.py` |
| **Moteur 2,5D pleine onde (`mom_solver`)** | Archivé dans branche `archive/mom-solver-25d` (recentrage sur 2D instantané) | Préservé dans l'historique Git |
| **Support Android / Termux** | Abandonné volontairement (ajouté le 17/09, retiré au commit suivant) | — |
| **Passerelle MCP, profils, cross-probing** | En service | `web_CAO.py`, `commun/session.js` |
| **Gestion LIB — catalogue, recherche, import JLCPCB / LCSC** | En service | 11 + 65 essais (`gestion-lib/test/banc-catalogue.js`, `banc-import-jlc.js`) ; routes LIB : 16 cas (`banc-lib-routes.py`) |

### Corrections du 24/09/2026 (révélées par l'extension des bancs scoring et motifs)
- [x] **Motifs** : la tension d'un LDO se lisait aussi dans le repère (`U5` + `AMS1117-3.3` → 5 V, `U12` → 12 V) ; elle ne se lit plus que dans la valeur.
- [x] **Motifs** : `7808`, `7809`, `7824` annoncés à 5 V et tous les `79xx` à −5 V ; la tension vient désormais des deux derniers chiffres.
- [x] **Motifs** : le net d'horloge SPI `SCLK` créait un faux bus I2C (`SCL` ⊂ `SCLK`).
- [x] **Motifs** : une ferrite `600R@100MHz` était prise pour un oscillateur.
- [x] **Motifs** : le condensateur d'entrée d'un LDO apparaissait aussi en sortie (revu sur la masse).
- [x] **Motifs** : toute résistance de 100 Ω à 4,7 kΩ comptait comme une LED dans les courants DC ; il faut maintenant une LED sur l'un de ses nets.
- [x] **Motifs** : la masse des quartz et filtres n'était reconnue que sous `GND`/`0V`/`AGND`/`VSS` ; `DGND`, `GNDA`… sont maintenant acceptées.
- [x] **Scoring et motifs** : un rail `10V` / `20V` était traité comme une masse (`0V` ⊂ `10V`) et exclu du HPWL et du découplage.
- [x] **Scoring** : `CONN1` était compté comme condensateur de découplage, `LED1` classé comme inductance, `TP1` vu comme CI.
- [x] **Scoring** : une rotation hors quart de tour (45°) était comparée à 0° et annonçait un gain inexistant.

---

## ✅ Priorité 1 (sprint terminé) : Gestion des bibliothèques

Mettre en place une gestion modulaire et unifiée des bibliothèques de composants pour le schéma, le PCB et la simulation.

### 1. Arborescence du dossier `lib/`
- [x] Arborescence standardisée unifiée via jonctions de répertoires transparentes :
```text
lib/
├── empreinte/         # Définitions d'empreintes PCB (formes de pastilles arbitraires, boîtiers, 3D/plans) -> lib_empreinte_pcb
├── symbole/           # Définitions de symboles schématiques (brochages, catégories, graphismes) -> lib_empreinte_schematique
└── simulation/        # Modèles pour l'analyse et la simulation -> lib_simulation
```

### 2. Intégration dans la base de données (`LIB_composants.csv`)
- [x] Uniformisation complète des 563 entrées de `LIB_composants.csv` (à la racine et dans `lib/`) avec chemins relatifs standardisés `lib/empreinte/<nom>.json`, `lib/symbole/<nom>.json` et `lib/simulation/<nom>.sub`.
- [x] 100 % des fichiers référencés (297 empreintes, 563 symboles, 320 modèles de simulation SPICE) existent sur disque et sont vérifiés sans orphelin.
- [x] Serveur d'API (`web_CAO.py`) sécurisé avec support des alias canoniques (`empreinte`, `symbole`, `simulation`) et protection anti-traversée.

### 3. Exploitation par les outils
- [x] **Éditeur schématique** : naviguer et placer des symboles directement issus de `lib/symbole/` et `LIB_composants.csv` via l'explorateur visuel pop-up (`commun/explorateur-lib.js`), avec affectation automatique des préfixes, valeurs et broches.
- [x] **Éditeur PCB** : assigner, charger ou réaffecter interactivement des empreintes réelles depuis `lib/empreinte/` via le bouton « 🔍 » du panneau de propriétés (`pcbChangerEmpreinteSelectionnee`), avec préservation des connexions et des nets câblés.
- [x] **Panneau de simulation** : injection automatique des caractéristiques réelles (ESR/ESL des condensateurs Murata/catalogue, DCR et courant de saturation $I_{sat}$ des inductances) dans les calculs de chute DC (`pcbSpecsComposant`) et d'impédance de plan / traversée de cavité (`simPontsPlans`, `_cavite_de_retour`).

### 4. Qualité des références du catalogue

`python/lier_modeles_murata.py` relie chaque référence GCM/GRM/LQW du catalogue à son modèle SPICE fabricant :
- [x] **Sept références GCM C0G 0402 50 V arbitrées** : modèles SPICE Murata équivalents cross-package rattachés automatiquement selon la table d'arbitrage de valeurs et diélectrique.
- [x] **Quarante-deux références passées du modèle générique aux vrais modèles SPICE** : déballage récursif des packs d'archives `LIB/lib_simulation/` (~16 800 fichiers `.mod`), indexation multi-critères et synchronisation : **104/104 références Murata reliées avec succès (100 % de couverture)**.
- [x] **Pagination et filtrage de la galerie de Gestion LIB** : navigation fluide par pages de 24 éléments avec recherche instantanée, badges de comptage et chargement différé (*lazy loading*) des modèles SPICE `.sub`, éliminant les lenteurs du navigateur.

---

## Backlog par domaine

### Éditeur schématique
- [x] **Navigateur de symboles de bibliothèque** : sélecteur visuel pop-up avec aperçu des broches et des caractéristiques issues de `lib/symbole/` et `LIB_composants.csv` (`commun/explorateur-lib.js`).
- [x] **Ergonomie des bus et hiérarchie** :
  - [x] **Piquage de bus interactif (`D[0..7]`, `SPI{...}`)** : modal contextuel de dérivation avec puces de signaux cliquables, auto-incrémentation du signal suivant, isolation électrique du tronc en Union-Find, pastilles de piquage cyan/blanc distinctes et sélecteur de signal dans l'inspecteur.
  - [x] **Affichage synthétique des liaisons inter-blocs sur la feuille racine (page 1)** : représentation visuelle des sous-feuilles avec leurs broches de ports (*sheet pins*), détection des bus/signaux/alims et tracé synoptique automatique des bus traversants et faisceaux inter-blocs avec badges et dérivations à 45°.
- [x] **Export netlist & BOM enrichi** : réconciliation automatique avec `LIB_composants.csv` (`window.CSV_LIB`), colonnes empreinte PCB, référence bibliothèque, MPN, fabricant et commande LCSC/Mouser/DigiKey, section de catalogue dédiée en commentaires dans la netlist sans régression pour l'éditeur PCB.

### Éditeur PCB
- [x] **Gestionnaire d'empreintes de bibliothèque** : prévisualisation visuelle pop-up, filtrage et affectation directe des empreintes sur la carte (`commun/explorateur-lib.js`).
- [x] **Éléments mécaniques et graphiques secondaires** :
  - **Trous non métallisés (NPTH) autonomes** : gestion dédiée `S.holes`, perçages mécaniques sans pastille cuivre, réticule et diamètre visuels, inspecteur avec raccourcis M2/M2.5/M3/M4, vérification DRC (distance bord de carte, trou-à-trou, cuivre-NPTH) et génération séparée du fichier de perçage Excellon non plaqué `*-NPTH.TXT`.
  - **Outil texte libre de sérigraphie** : support du texte libre sur `F.SilkS` et `B.SilkS`, rotation angulaire, miroir bottom automatique, fonte vectorielle et inclusion dans les calques Gerber sérigraphie (`.GTO`/`.GBO`).
- [x] **Synchronisation Schéma ↔ PCB (ECO)** :
  - Détection automatique des disparités de boîtier, d'empreinte, de valeur, de composants et de netlist entre le schéma et la carte (`editeur-pcb/js/23-eco-sync.js`).
  - Fenêtre de mise à jour interactive (ECO) avec conservation rigoureuse du routage et des pistes existantes, badge d'alerte dynamique et synchronisation temps réel inter-onglets.
  - Mise en production complète dans les bundles monofichiers (`dist/pcb.js`, `dist/editeur-pcb.html`) et validation par bancs d'essai.
- [x] **Amélioration du placement assisté** :
  - Exploitation des groupes de motifs pour proposer un pré-placement automatique par bloc fonctionnel (`editeur-pcb/js/22-bloc-placement.js`).
  - Agencement automatique dès l'import de la netlist ou de l'ECO en grappes cohérentes (régulateur Buck/LDO + condensateurs de découplage + inductance + diode) avec orientation des pastilles et absence de collision.

### Simulation SI (Signal Integrity)
- [x] **Mode différentiel dans la cascade de paramètres S** :
  - Calcul complet des paramètres S en mode mixte (*Mixed-Mode S-Parameters*) dans `python/simulation_em.py` (`_cascade_differentielle`) : mode différentiel pur $S_{dd}$ ($S_{dd11}, S_{dd21}$ sur $Z_{ref,diff}$ ex: 100 Ω ou 90 Ω), mode commun $S_{cc}$ ($S_{cc11}, S_{cc21}$ sur $Z_{ref,comm} = Z_{ref,diff}/4$ ex: 25 Ω), et conversion de mode CEM $S_{cd21}(\omega)$ calculée à partir du skew $\Delta L = |L_+ - L_-|$.
  - Interface dédiée dans l'onglet « Z différentielle » (`commun/simulation-em.js`) avec sélecteur interactif `[ Sdd ]`, `[ Scc ]`, `[ Scd ]`, courbe SVG multi-traces avec seuil CEM à $-20\text{ dB}$, repère de fréquence centrale $f_0$, lecture dynamique au survol et export Touchstone différentiel `.s2p`.

### Simulation PI (Power Integrity)
- [x] **Impédance fréquentielle du PDN ($Z(\omega)$)** :
  - Calcul et tracé de l'impédance globale vue sur chaque rail d'alimentation de 10 kHz à 1 GHz (`SIM_ANALYSES.pdn`, famille `pi`).
  - Prise en compte combinée du VRM ($R_{vrm}, L_{vrm}$), des condensateurs de découplage réels avec parasites consolidés Murata/catalogue (ESR, ESL et $L_{mount}$ par boîtier), et de la capacité de cavité inter-plans ($C_{plane} = \frac{\varepsilon_0 \varepsilon_r A}{d}$, $\tan\delta$).
  - Impédance cible $Z_{target} = \frac{V_{dd} \cdot \text{ripple\%}}{\Delta I}$, détection automatique des anti-résonances et dépassements, tracé log-log interactif avec curseur dynamique, tableau de simulation what-if (activer/désactiver chaque condo) et exports CSV/JSON.
- [x] **Résonances spatiales 2D de cavité entre plans** :
  - Détection analytique des modes propres $TM_{mn0}$ ($f_{mn} = \frac{c}{2\sqrt{\varepsilon_r}} \sqrt{(m/a)^2 + (n/b)^2}$) et facteurs de qualité $Q_{mn}$ (pertes diélectriques $\tan\delta$ et effet de peau cuivre).
  - Repères visuels verticaux des modes résonants sur le profil d'impédance $Z(\omega)$ du PDN et prise en compte de l'admittance distribuée.
  - Cartographie thermique interactive 2D (Heatmap SVG) de la tension stationnaire $|V_{mn}(x,y)|$, lignes nodales ($V=0$), points chauds (coins et bords) et projection des condensateurs de découplage avec taux d'amortissement $\kappa$.
  - Sélecteur de mode ($TM_{10}, TM_{01}, TM_{11}, \dots$), tableau récapitulatif modal, recommandations CEM / règle des 20-H et exports CSV/JSON.

---

## Réalisations majeures archivées

Les fonctionnalités suivantes sont entièrement développées, intégrées et validées. Leur historique détaillé d'implémentation est consultable dans [docs/HISTORIQUE_DEVELOPPEMENT.md](docs/HISTORIQUE_DEVELOPPEMENT.md) :

1. **Solveur DC & Thermique** : maillage surfacique multi-couches, extraction exacte des vias en série/parallèle, modèle d'étalement thermique IPC-2152 en °C, détection des culs-de-sac.
2. **SI & Crosstalk spatial** : matrice multi-lignes MoM 2D, réflectométrie temporelle IFFT pour localiser le couplage en volts et en position sur la victime.
3. **Modélisation physique des discontinuités** : coudes de Gupta (L, C), vias en $\pi$ (L Grover, C antipads), moignons résonants complexes, traversée de plans selon Bogatin.
4. **Scoring de placement & Motifs** : HPWL, congestion, découplage HF, auto-rotation vectorielle anti-croisements, détection de motifs (LDO, Buck, bus numériques, quartz, RC) et injection automatique des courants DC.
5. **Bus & Feuilles hiérarchiques** : mode bus épaissi, notation vectorielle, feuille racine synoptique avec blocs de sous-feuilles et sheet pins.
6. **Éditeur PCB avancé** : serpentins d'appariement de longueur (*meanders*), pastilles de formes arbitraires (`poly`, chanfrein, découpes thermiques), support complet des pistes en arc de cercle dans tous les solveurs et panneaux.
