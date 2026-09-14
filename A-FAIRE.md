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
| **Éditeur PCB** | En service | 660 essais (`editeur-pcb/test/harness.js`) |
| **Éditeur Schématique** | En service | 108 essais (`editeur-schematique/test/harness.js`) |
| **Visionneuse IPC-2581** | En service | 123 essais (`harness-sim.js`) + 46 (`banc-essai.py`) |
| **SI — Impédance & Vias (`ligne_mom`)** | En service (0,3 à 0,4 % vs étalons) | 170 cas (`python/test/banc-ligne-mom.py`) |
| **SI — Z différentielle (`solve_multiline`)** | En service (< 3 % vs Garg-Bahl) | 170 cas |
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
Créer à la racine du dépôt un répertoire de bibliothèque structuré en 3 sous-dossiers :
```text
lib/
├── empreinte/         # Définitions d'empreintes PCB (formes de pastilles arbitraires, boîtiers, 3D/plans)
├── symbole/           # Définitions de symboles schématiques (brochages, catégories, graphismes)
└── simulation/        # Modèles pour l'analyse et la simulation
    ├── composants/    # Composants réels RLC (capas avec ESR/ESL/fréquence, inductances avec DCR/sat)
    └── spice/         # Fichiers et sous-circuits SPICE (.subckt, .model, .lib)
```

### 2. Intégration dans la base de données (`LIB_composants.csv`)
- Enrichir `LIB_composants.csv` avec les nouvelles colonnes nécessaires :
  - `empreinte_fichier` : chemin relatif dans `lib/empreinte/`.
  - `symbole_fichier` : chemin relatif dans `lib/symbole/`.
  - `modele_simulation` : référence vers le modèle RLC réel dans `lib/simulation/composants/`.
  - `modele_spice` : référence vers le fichier SPICE dans `lib/simulation/spice/`.
- Permettre la recherche et le filtrage dans la base selon la disponibilité d'un modèle de simulation ou d'un modèle SPICE.

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
- [ ] **Ergonomie des bus et hiérarchie** :
  - Poursuivre le confort de saisie sur le piquage de bus (`D[0..7]`, `SPI{...}`).
  - Affichage synthétique des liaisons inter-blocs sur la feuille racine (page 1).
- [ ] **Export netlist & BOM** : enrichissement de la nomenclature avec les références de bibliothèques et fabricants.

### Éditeur PCB
- [x] **Gestionnaire d'empreintes de bibliothèque** : prévisualisation visuelle pop-up, filtrage et affectation directe des empreintes sur la carte (`commun/explorateur-lib.js`).
- [ ] **Synchronisation Schéma ↔ PCB** :
  - Détection automatique des disparités de boîtier/empreinte entre la netlist schéma et le placement PCB.
  - Mise à jour interactive avec conservation du routage existant.
- [ ] **Amélioration du placement assisté** :
  - Exploitation des groupes de motifs pour proposer un pré-placement automatique par bloc fonctionnel (ex: placer régulateur + capas + self ensemble).

### Simulation SI (Signal Integrity)
- [ ] **Diagramme de l'œil (*Eye Diagram*)** :
  - Calcul de la réponse impulsionnelle et convolution avec une séquence pseudo-aléatoire (PRBS).
  - Tracé du diagramme de l'œil dans le panneau avec gabarit de masque, jitter crête-à-crête et ouverture en tension.
- [ ] **Mode différentiel dans la cascade de paramètres S** :
  - Offrir le choix explicite du mode (différentiel pur vs mode commun) pour que la matrice S globale soit celle du signal différentiel.
- [ ] **Corrélation empilage réel vs nominal** :
  - Permettre de saisir l'empilage micrographique mesuré par le fabricant à côté de l'empilage nominal pour calibrer les impédances calculées.

### Simulation PI (Power Integrity)
- [ ] **Impédance fréquentielle du PDN ($Z(\omega)$)** :
  - Calcul de l'impédance vue aux bornes d'un composant sur une bande 100 kHz – 1 GHz.
  - Prise en compte combinée des condensateurs de découplage réels (avec ESR/ESL depuis `lib/simulation/`), des inductances de boucle de vias et de la capacité inter-plans.
- [ ] **Résonances de cavité entre plans** :
  - Détection des fréquences de résonance propre de la paire de plans d'alimentation ($f_{mn} = \frac{c}{2\sqrt{\varepsilon_r}} \sqrt{(m/a)^2 + (n/b)^2}$) pour prévenir les points chauds HF de tension.

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
