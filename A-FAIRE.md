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
- **Éditeur schématique** : naviguer et placer des symboles directement issus de `lib/symbole/`.
- **Éditeur PCB** : assigner ou charger des empreintes depuis `lib/empreinte/`.
- **Panneau de simulation** : injecter les caractéristiques réelles (ESR/ESL d'une capacité, DCR d'une self) dans les analyses de chute DC, de découplage et d'impédance de plan.

### 4. Qualité des références du catalogue

`python/lier_modeles_murata.py` relie chaque référence GCM/GRM/LQW du catalogue à son modèle SPICE fabricant. Il recoupe au passage la valeur déclarée avec celle codée dans la référence — ce contrôle a sorti sept lignes dont **la valeur n'existe pas dans la série Murata annoncée**.

- [ ] **Sept références GCM C0G 0402 50 V à arbitrer** : leur valeur est absente du pack `gcm-n-v68` alors que toutes les valeurs voisines y figurent. Le plus probable est que la référence ait été composée à la main à partir de la valeur voulue. Ces lignes portent encore le modèle générique `capacitor.sub`.

  | Référence au catalogue | Valeur annoncée | Valeurs réellement disponibles |
  | --- | --- | --- |
  | `GCM1555C1HR70WA16D` | 0,7 pF | 0,5 / 1,0 |
  | `GCM1555C1H2R1BA16D` | 2,1 pF | 1,8 / 2,0 / 2,2 |
  | `GCM1555C1H2R4BA16D` | 2,4 pF | 2,2 / 2,7 |
  | `GCM1555C1H3R6BA16D` | 3,6 pF | 3,3 / 3,9 / 4,0 |
  | `GCM1555C1H7R5DA16D` | 7,5 pF | 6,8 / 7,0 / 8,0 |
  | `GCM1555G1H8R7CA16J` | 8,7 pF | 8,0 / 8,2 / 9,0 |
  | `GCM1555C1H131JA16D` | 130 pF | 120 (puis 150) |

  Marche à suivre, référence par référence :
  1. Confirmer sur le site Murata que la valeur n'est pas au catalogue — la conclusion ci-dessus vient de l'absence dans le pack téléchargé, qui peut être partiel.
  2. Si elle n'existe pas : choisir la valeur voisine, ou basculer sur la série GRM (non automotive), qui couvre davantage de valeurs E24.
  3. Corriger `Part Name`, `Value`, `Part Number` et la tolérance, puis relancer `python python/lier_modeles_murata.py --appliquer` pour attacher le vrai modèle.

  Le remplacement ne peut pas être automatisé : substituer 3,3 pF à 3,6 pF change le circuit, c'est un arbitrage de conception. Deux lignes du même symptôme (5,1 et 6,2 pF, nées d'un copier-coller de leurs voisines) ont déjà été ramenées à 5,0 et 6,0 pF.

- [ ] **Quarante-deux références encore sur le modèle générique** : les packs Murata présents ne couvrent que GCM155 (0402), GRM022 (01005) et LQW15AN (0402). Télécharger GCM en 0201/0603/0805, GRM en 0402 à 0805, LQW03A et LQW04A, les déposer dans `LIB/lib_simulation/` et relancer le script — il déballe les `.zip` et complète seul.

- [ ] **Modèles disponibles mais absents du catalogue** : les packs contiennent 195 valeurs GCM155 et 373 valeurs LQW15AN qui ne figurent dans aucune ligne. Les ajouter doublerait le catalogue, qui est une liste de pièces préférées et non un catalogue fabricant — à trancher, et à conditionner à la pagination de la galerie de `gestion-lib`, qui charge aujourd'hui le contenu de chaque `.sub` en un appel par fichier.

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
