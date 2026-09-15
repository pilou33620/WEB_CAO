# À faire — Roadmap & Backlog

Ce document liste les tâches planifiées, en cours et à venir pour la suite de CAO électronique WEB_CAO.
Pour les détails techniques approfondis, les dérivations physiques et l'historique complet des réalisations passées, consulter :
- [docs/simulation-em.md](docs/simulation-em.md) — Référence technique des solveurs et modèles SI/PI.
- [docs/HISTORIQUE_DEVELOPPEMENT.md](docs/HISTORIQUE_DEVELOPPEMENT.md) — Archive complète des développements, audits et post-mortems (août - sept. 2026).

---

## État des lieux (septembre 2026)

L'ensemble de la chaîne est fonctionnel et couvert par **plus de 1 200 essais automatisés, tous passés** :

| Composant | Statut | Couverture / Bancs |
| --- | --- | --- |
| **Éditeur PCB** | En service | 703 essais (`editeur-pcb/test/harness.js`) |
| **Éditeur Schématique** | En service | 119 essais (`editeur-schematique/test/harness.js`) |
| **Visionneuse IPC-2581** | En service | 132 essais (`harness-sim.js`) + 46 (`banc-essai.py`) |
| **SI — Impédance & Vias (`ligne_mom`)** | En service (0,3 à 0,4 % vs étalons) | 171 cas (`python/test/banc-ligne-mom.py`) |
| **SI — Z différentielle (`solve_multiline`)** | En service (< 3 % vs Garg-Bahl) | 171 cas |
| **SI — Crosstalk localisé (`crosstalk`)** | En service (%, dB, volts le long du tracé) | 45 cas (`python/test/banc-crosstalk.py`) |
| **PI — Chute DC & Échauffement (`dc_solver`)** | En service (IR drop, densité J, modèle étalement) | 42 cas (`python/test/banc-dc.py`) |
| **Scoring placement & Rotation (`pcb_scoring`)** | En service (HPWL, congestion, découplage HF, auto-rotation) | 7 cas (`python/test/banc-pcb-scoring.py`) |
| **Reconnaissance de motifs (`pattern_recognition`)** | En service (LDO/Buck/Boost, I2C, SPI, UART, quartz, RC) | 5 cas (`python/test/banc-patterns.py`) |
| **Moteur 2,5D pleine onde (`mom_solver`)** | En service (ports verticaux, Green stratifiée 2 niveaux) | 56 essais (`mom_solver/tests/`) |
| **Passerelle MCP, profils, cross-probing** | En service | `serveur.py`, `commun/session.js` |

---

## 🎯 Priorité 1 (Sprint en cours) : Gestion des bibliothèques

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
- [x] Serveur d'API (`serveur.py`) sécurisé avec support des alias canoniques (`empreinte`, `symbole`, `simulation`) et protection anti-traversée.

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
- [ ] **Diagramme de l'œil (*Eye Diagram*)** :
  - Calcul de la réponse impulsionnelle et convolution avec une séquence pseudo-aléatoire (PRBS).
  - Tracé du diagramme de l'œil dans le panneau avec gabarit de masque, jitter crête-à-crête et ouverture en tension.
- [x] **Mode différentiel dans la cascade de paramètres S** :
  - Calcul complet des paramètres S en mode mixte (*Mixed-Mode S-Parameters*) dans `python/simulation_em.py` (`_cascade_differentielle`) : mode différentiel pur $S_{dd}$ ($S_{dd11}, S_{dd21}$ sur $Z_{ref,diff}$ ex: 100 Ω ou 90 Ω), mode commun $S_{cc}$ ($S_{cc11}, S_{cc21}$ sur $Z_{ref,comm} = Z_{ref,diff}/4$ ex: 25 Ω), et conversion de mode CEM $S_{cd21}(\omega)$ calculée à partir du skew $\Delta L = |L_+ - L_-|$.
  - Interface dédiée dans l'onglet « Z différentielle » (`commun/simulation-em.js`) avec sélecteur interactif `[ Sdd ]`, `[ Scc ]`, `[ Scd ]`, courbe SVG multi-traces avec seuil CEM à $-20\text{ dB}$, repère de fréquence centrale $f_0$, lecture dynamique au survol et export Touchstone différentiel `.s2p`.
- [ ] **Corrélation empilage réel vs nominal** :
  - Permettre de saisir l'empilage micrographique mesuré par le fabricant à côté de l'empilage nominal pour calibrer les impédances calculées.

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

### Visionneuse IPC-2581 & Outils communs
- [ ] **Indicateur de lot actif dans la vue graphique** :
  - Lors d'une sélection multi-morceaux en chute DC ou retour de courant, expliciter visuellement sur le canevas le lot actuellement déplié et peint.
- [ ] **Export des rapports consolidés** :
  - Export PDF ou Markdown unifié regroupant le rapport de santé de liaison, les discontinuités, le profil de chute DC et le scoring de placement.

---

## Réalisations majeures archivées

Les fonctionnalités suivantes sont entièrement développées, intégrées et validées. Leur historique détaillé d'implémentation est consultable dans [docs/HISTORIQUE_DEVELOPPEMENT.md](docs/HISTORIQUE_DEVELOPPEMENT.md) :

1. **Solveur DC & Thermique** : maillage surfacique multi-couches, extraction exacte des vias en série/parallèle, modèle d'étalement thermique IPC-2152 en °C, détection des culs-de-sac.
2. **SI & Crosstalk spatial** : matrice multi-lignes MoM 2D, réflectométrie temporelle IFFT pour localiser le couplage en volts et en position sur la victime.
3. **Modélisation physique des discontinuités** : coudes de Gupta (L, C), vias en $\pi$ (L Grover, C antipads), moignons résonants complexes, traversée de plans selon Bogatin.
4. **Scoring de placement & Motifs** : HPWL, congestion, découplage HF, auto-rotation vectorielle anti-croisements, détection de motifs (LDO, Buck, bus numériques, quartz, RC) et injection automatique des courants DC.
5. **Bus & Feuilles hiérarchiques** : mode bus épaissi, notation vectorielle, feuille racine synoptique avec blocs de sous-feuilles et sheet pins.
6. **Éditeur PCB avancé** : serpentins d'appariement de longueur (*meanders*), pastilles de formes arbitraires (`poly`, chanfrein, découpes thermiques), support complet des pistes en arc de cercle dans tous les solveurs et panneaux.
