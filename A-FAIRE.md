# À faire — Roadmap & Backlog

Ce document liste les tâches planifiées, en cours et à venir pour la suite de CAO électronique WEB_CAO.
Pour les détails techniques approfondis, les dérivations physiques et l'historique complet des réalisations passées, consulter :
- [docs/simulation-em.md](docs/simulation-em.md) — Référence technique des solveurs et modèles SI/PI.
- [docs/HISTORIQUE_DEVELOPPEMENT.md](docs/HISTORIQUE_DEVELOPPEMENT.md) — Archive complète des développements, audits et post-mortems (août - sept. 2026).
- [docs/spec-crosstalk-reel.md](docs/spec-crosstalk-reel.md) — **Spécification à lire avant de toucher au crosstalk** : simulation en conditions réelles (terminaisons, passifs, stimuli, natures de victime).

---

## État des lieux (septembre 2026)

L'ensemble de la chaîne est fonctionnel et couvert par **plus de 1 700 essais automatisés, tous passés** (relevé du 02/10/2026) :

| Composant | Statut | Couverture / Bancs |
| --- | --- | --- |
| **Éditeur PCB** | En service | 908 essais (`editeur-pcb/test/harness.js`), dont 28 pour les plans (Draftsman) et 24 pour le gestionnaire de contraintes et la topologie |
| **Éditeur Schématique** | En service | 155 essais (`editeur-schematique/test/harness.js`), dont 3 pour les contraintes de nets |
| **Visionneuse IPC-2581** | En service | 190 essais (`harness-sim.js`) + 59 (`banc-essai.py`) |
| **SI — Impédance & Vias (`ligne_mom` v2.7.0)** | En service (0,3 à 0,4 % vs étalons ; pertes conducteur par l'inductance incrémentale de Wheeler, ruban + plan(s) + bords ; rugosité, diélectrique causal et via en ligne disponibles, non branchés) | 221 cas (`python/test/banc-ligne-mom.py`) |
| **SI — Z différentielle (`solve_multiline`)** | En service (< 3 % vs Garg-Bahl) | inclus dans les 199 cas |
| **SI — Crosstalk niveau 2 (`crosstalk` v4.1.0)** | En service (scan normalisé : k_total, NEXT et FEXT en % et dB, statut vert / orange / rouge, piste sélectionnée — t_r saisi ou déduit de la classe — ou toute la carte sous un t_r global ; pistes superposées résolues ; pertes R, G au genou du front en option ; somme des agresseurs en phase ou quadratique ; coloration au statut DRC sur le layout ; l'analyse électrique est retirée) | 41 cas (`python/test/banc-crosstalk.py`), dont la triplaque exacte (Cohn) et les formules du niveau 2 |
| **Cascade SI / PDN (`simulation_em` v4.3.0)** | En service | couvert par les bancs `ligne_mom`, crosstalk et éditeur |
| **SI — Diagramme de l'œil (`oeil` v2.0.0)** | En service (réponse à un bit depuis la cascade ABCD, simple et différentiel, vias et coudes de la paire compris ; œil PRBS et pire cas PDA ; CTLE, FFE, DFE ; œil statistique RJ/DJ/bruit, contours 10⁻⁶…10⁻¹⁵ et baignoire ; diaphonie bornée saisie ou reprise du couplage (NEXT/FEXT du niveau 2) ; tampons IBIS émetteur et récepteur simulés dans le temps (`ibis.py`) ; 18 gabarits avec leur fiabilité) — boîtier IBIS, AMI et couplage AC hors modèle | 36 cas (`python/test/banc-oeil.py`) |
| **RF — S21 port à port (`rf_reseau` v1.5.0)** | En service dans l'éditeur PCB et la visionneuse, chacun avec son empilage (pistes par `simulation_em`, lignes couplées à N conducteurs avec pertes et dispersion modale, coudes et vias aux bords des longements, pastilles en MoM 3D sur stratifié étalonné sur l'empilage, zones et coulées de masse entières en maillage adaptatif creux sur leur cuivre rempli, longements recoupés à leur écart local, chemins de masse piste + via, broches annexes, pistes des autres nets fermées sur leur Z₀, mutuelles des selfs entre elles et avec les pistes (Neumann avec image), fentes du plan de référence (Ott), composants SPICE / .sNp / idéaux, S généralisés sur ports complexes, « et si ») — quasi-statique (+ Getsinger) : le domaine de validité (modes supérieurs, ondes de surface, rayonnement) est calculé et signalé ; les modéliser demande le moteur pleine onde | 47 cas (`python/test/banc-rf.py`) + 8 essais de page (`editeur-pcb/test/harness.js`) + 3 (`harness-sim.js`) |
| **PI — Chute DC & Échauffement (`dc_solver` v2.1.0)** | En service (IR drop, densité J, modèle étalement) | 42 cas (`python/test/banc-dc.py`) |
| **Scoring placement & Rotation (`pcb_scoring`)** | En service (HPWL, congestion, découplage HF, auto-rotation) | 18 cas (`python/test/banc-pcb-scoring.py`) |
| **Vérification de la carte (`analyse_carte`)** | En service (tous nets : angles, bouts orphelins, empilage ; à la cadence de chaque classe : impédance, chemins de retour, fentes de plan, vias de couture, diaphonie, paires différentielles, découplage, bord de carte, moignons de vias, branches en T ; quartz, ESD, courant des rails ; dérogations et comparaison de révisions) — mode d'emploi : [docs/verification-carte.md](docs/verification-carte.md) | 20 cas (`python/test/banc-analyse-carte.py`) + route (`banc-serveur-routes.py`) + 9 essais éditeur + 3 visionneuse |
| **Reconnaissance de motifs (`pattern_recognition`)** | En service (LDO/78xx/79xx/Buck, I2C, SPI, UART, quartz, RC, courants DC) | 24 cas (`python/test/banc-patterns.py`) |
| **Assistant IA (schéma, PCB, visionneuse, Gestion LIB)** | En service (Google AI Studio : Gemma 4 31B par défaut, Gemini 3.8 Flash / Flash Thinking ; clé API en mémoire vive uniquement ; datasheets PDF jointes → réglages de simulation vérifiés et cochés un à un) | `commun/ia-assistant.js`, `gestion-lib/js/06-ia-lib.js` |
| **Serveur `web_CAO.py`** | En service (détection Raspberry Pi / terminal sans affichage : navigateur non ouvert par défaut, `--navigateur` / `--sans-navigateur`) | `banc-serveur-routes.py`, `banc-lib-routes.py`, `banc-maj-github.py`, `banc-detection-plateforme.py` |
| **Moteur 2,5D pleine onde (`mom_solver`)** | Archivé dans branche `archive/mom-solver-25d` (recentrage sur 2D instantané) | Préservé dans l'historique Git |
| **Support Android / Termux** | Abandonné volontairement (ajouté le 17/09, retiré au commit suivant) | — |
| **Passerelle MCP, profils, cross-probing** | En service | `web_CAO.py`, `commun/session.js` |
| **Gestion LIB — catalogue, recherche, import JLCPCB / LCSC** | En service | 27 + 65 essais (`gestion-lib/test/banc-catalogue.js`, `banc-import-jlc.js`) ; routes LIB : 16 cas (`banc-lib-routes.py`) |

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
- [x] **Symbole générique → composant réel de la LIB, brochage raccord datasheet / empreinte** (relevé sur la carte PIR, 08/10/2026) :
  - [x] **Choisir le composant en posant le symbole** : l'inspecteur affiche « ⚠ Référence à choisir (n) » sur un symbole générique qui a des références dans `LIB_composants.csv` (`Empreinte Schématique` = son symbole) ; la liste du catalogue se restreint à ces références, celles qui ont un brochage en tête (« brochage ✓ »), une case élargit à tout le préfixe.
  - [x] **Brochage porté par la référence, pas par le symbole** : colonne `Brochage` de `LIB_composants.csv`, `NOM=patte` séparés par des virgules (`OUT=1,V-=2,IN+=3,IN-=4,V+=5` pour un MCP6001 SOT-23-5). Les symboles génériques ont des noms de broches (AOP `IN-,IN+,OUT,V+,V-` ; NPN/PNP `B,C,E` ; NMOS `G,D,S` ; PMOS `G,S,D` ; diodes `A,K` ; régulateur `IN,OUT,GND`). Le choix de la référence recopie la table sur le composant (`el.pinMap`) ; la netlist écrit la patte, le PCB suit. Retouche à la main : colonne « Patte » de la fenêtre Détails du composant. Saisie dans Gestion LIB (inspecteur, vérifiée à la frappe) ou par l'IA LIB (`commun/brochage.js`, `editeur-schematique/js/25-brochage.js`).
  - [x] **Bug actuel** : l'AOP sans référence en `SOIC-8` est signalé (« symbole à 5 broches sur un boîtier SOIC-8 à 8 pattes, sans brochage ») dans l'inspecteur, en commentaire dans la netlist et à l'export. Avec la référence LM358, V+ va sur la patte 8.
  - [x] **Composants à plusieurs parties** : `A:OUT=1,IN-=2,IN+=3|B:OUT=7,IN-=6,IN+=5|*:V-=4,V+=8`. Repère `U3` + partie, affiché `U3A` / `U3B` ; une seule empreinte, une ligne de nomenclature, V+/V− une fois par net. Inspecteur : choix de la partie et bouton « + U3B » qui pose la suivante. Alimentations sur chaque partie.
  - [x] **Contrôle** : alimentation (V+, VCC, VDD…) sur la masse, masse sur un rail, V− sur un rail positif ; patte partagée reliée à deux nets ; partie posée deux fois ou non posée (entrées en l'air) ; broche absente du brochage de la référence.
  - [x] **Remplir la colonne `Brochage` de la LIB** — « 🔄 Auto-associer » de Gestion LIB la complète là où le brochage est certain, sans jamais remplacer une saisie : transistors bipolaires SOT-23 / SOT-323 `B=1,E=2,C=3`, MOSFET SOT-23 `G=1,S=2,D=3`, OPA369 (SC70-5) `OUT=1,V-=2,IN+=3,IN-=4,V+=5`, LM78L05 (SO-8) `OUT=1,GND=2/3/6/7,IN=8,NC=4/5`, LP2980 (SOT-23-5) `IN=1/3,GND=2,OUT=5,NC=4` (ON/OFF relié à l'entrée). Sur la LIB actuelle : 16 références. Reste à cliquer « Auto-associer » puis « Enregistrer » dans Gestion LIB.
  - [x] **LIB corrigée (dépôt WEB_SUITE_PROJETS, branche `ccr-2e60961f-qwqjwa`)** : colonne `Brochage` sur 43 références ; six MOSFET canal P passés sur `pmos.json` ; LMC7215 sur `opamp.json` (SOT-23-5) ; BGA7L1 sur `ic.json` ; empreinte `SC-70-5.json` créée pour l'OPA369 ; `TO-252.json` renumérotée JEDEC (languette = 2) et LP2950CDT `IN=1,GND=2,OUT=3` ; diodes deux pattes selon IPC, patte 1 = cathode (`A=2,K=1`), diodes simples en SOT-23 `A=1,K=3,NC=2` ; 1PS76SB40 en SOD-323, BC858CW en SOT-323, BAT54 en SOT-23 ; MPN de BAS16 corrigé ; ajout de `AOP_MCP6001T-I/OT`. À fusionner **après** la branche WEB_CAO (le banc `banc-lib-routes.py` d'avant attend 39 colonnes).
  - [ ] **Reste sans brochage sûr** : diodes doubles en SOT-23 (BAV99, BAV199, BAR43C, BAR43), réseaux ESD (SM712, SRV05-4, NUP2201…), transistor numérique DTC144EKA, MOSFET double FDS9934C, LED RVB, régulateurs TPS78230, R1180Q, LD39050, XC6231 (sans empreinte). À saisir sur datasheet dans Gestion LIB.
- [x] **Une broche sur plusieurs pattes** : `OUT=2/4` (languette d'un SOT-223 : AMS1117 `GND=1,OUT=2/4,IN=3` ; masses multiples d'un QFN). La netlist écrit chaque patte dans le net ; saisie aussi à la main (« 2/4 » dans la colonne Patte).
- [x] **Netlist : nom de boîtier tronqué à 40 caractères** — limite commune `PKG_MAX` = 120 (`03-boitiers.js`), à la relecture du schéma comme dans les champs.
- [x] **Import de netlist au PCB : appliquer l'empreinte de la LIB** quand le boîtier en a une (`fpLibPourBoitier` : nom exact, même clé `pkgKey`, chemin de catalogue réduit à son fichier) ; si la LIB n'est pas encore lue, le fichier `lib_empreinte_pcb/<boîtier>.json` est demandé au serveur.

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

- [x] **Liens du cuivre et suivi des boîtiers** (`editeur-pcb/js/25-liens.js`) :
  - [x] Étape 1 : chaque bout de piste porte le lien de ce qui le tient (`a1`/`a2` : `{f, p}` pastille ou `{v}` via), vérifié contre la géométrie avant usage et reconstruit s'il ment ; les vias ont un identifiant. Rotation (R, autour du centre du boîtier), retournement (F), cotes X / Y / Rot / Face du panneau et « Aller à » passent par `transformFps` : le cuivre suit par le même moteur que le glissement, au centre des pastilles ; un bout volontairement décalé garde son décalage dans le repère du boîtier.
  - [x] Étape 2 : via de sortie emporté par son boîtier — posé dans une de ses pastilles, ou relié à elles par une piste courte (≤ 3 mm, `FANOUT_MAX`) et à aucune pastille d'un autre boîtier resté en place ; il glisse, tourne et se retourne avec lui, et ce qui part de lui suit. Ctrl au routage : le bout se pose où l'on vise dans le cuivre de la pastille au lieu du centre.
  - [x] Étape 3 : au relâchement, chaque liaison qui a suivi est jugée (isolation, croisement, pastille passée sur l'autre face). Rien n'est refait d'office — un re-routage silencieux changerait longueurs appariées, paires et impédances : la liaison en faute est tracée en rouge et portée au DRC « à re-router » ; la marque tombe quand la faute disparaît (réévaluée à chaque geste et à chaque DRC).
  - [x] Tourner en glissant : R / Maj+R ou Espace, la souris enfoncée sur un boîtier, un quart de tour autour de son centre ; le cuivre qui suit, la piste entre deux broches et le via de sortie tournent avec lui ; un seul Ctrl+Z défait le geste.
  - [x] Conduite des pistes au déplacement d'un boîtier, comme les options d'Allegro : glisser (suivi à 45°), étirer (le dernier segment s'étire), arracher (pistes accrochées retirées, chevelu). Réglage de l'utilisateur (fenêtre des règles, gardé d'une session à l'autre) ; Maj+Espace le change en plein geste, qui repart de l'état d'avant et refait le chemin parcouru.

- [x] **Suivi des boîtiers — réglages tranchés** :
  - Via de sortie, comme Allegro (qui MARQUE le via de sortie comme celui du composant) : marquage à la main dans le panneau Propriétés du via — « toujours U1 » (quelle que soit la distance, tant qu'une piste ou la pastille l'y relie), « jamais », ou automatique (piste ≤ 3 mm). Aucun outil du commerce ne fixe de longueur : les 3 mm ne servent qu'à deviner.
  - Alt en plein glissement : le via de sortie et sa piste restent en place, comme les autres pistes.
  - R sur plusieurs boîtiers (et en plein glissement) : le groupe tourne en bloc autour du centre de son encombrement ; la piste tendue entre deux d'entre eux part sans se déformer.
  - Contrôle : un bout de piste arrêté hors du centre de sa pastille est signalé (information, pas une faute) ; un coude qui passe dans une pastille longue n'en est pas un.

- [x] **Liens exploités quand une empreinte est refaite** (ECO « boîtier », empreinte reprise de la LIB, boîtier saisi, retour au générique, pas / écartement / nombre de broches) : une seule porte, `fpReshape` ; chaque piste reliée retrouve la pastille de même NUMÉRO dans la nouvelle empreinte et la suit comme à un déplacement (conduite « glisser » imposée). Une pastille disparue laisse sa piste en place, marquée « sa pastille n'existe plus, à re-router ».
- [x] **Ménage** : `26-variantes.js` (PCB et schéma) au lieu d'un second fichier 25 ; `simLotsSontPaireDiff` n'est plus défini qu'une fois (`commun/simulation-em.js`).

- [x] **Groupes** (les « Unions » d'Altium, `editeur-pcb/js/27-groupes.js`) : Ctrl+G groupe les composants et vias sélectionnés, Ctrl+Maj+G dissout ; un clic (ou le lasso) sur un membre prend le groupe entier, Ctrl+clic le retire entier ; glissement, R (à l'arrêt comme en glissant), cotes saisies emportent tout, les vias du groupe à toute distance ; les pistes entre membres partent en bloc, celles qui sortent suivent à 45°. Le panneau Propriétés d'un composant montre son groupe (renommer, dissoudre), la carte l'encadre quand il est sélectionné. Enregistré dans le document ; un groupe sans composant ou réduit à un membre disparaît.
  - [x] Retournement (F) d'un groupe, à l'arrêt comme en glissant : miroir du groupe entier autour de l'axe vertical de son cadre — faces changées, places symétrisées, rotation θ → −θ (pastilles au miroir exact) ; vias et pistes internes sur la couche miroir (F.Cu ↔ B.Cu, In1 ↔ In(n), via borgne retourné), pistes sortantes suivies puis jugées ; un seul Ctrl+Z, Maj+Espace le rejoue. Un composant seul se retourne toujours sur place. « Étirer » emporte désormais en bloc la piste tendue entre deux membres. 5 essais.
  - [x] Copier-coller d'un groupe : nouveau groupe (« G1 (copie) », « G1 (copie 2) »…) avec ses vias et son cuivre interne même non sélectionné (pistes entre membres, vias libres traversés) ; liens `a1`/`a2` et vias marqués re-pointés sur les copies ; les pistes sortantes restent ; Ctrl+X emporte le cuivre interne. 1 essai.

- [x] **Plans de fabrication et d'assemblage (Draftsman)** (`editeur-pcb/js/29-draftsman.js`, 10/10/2026) : feuilles A4 / A3 / A2 avec cadre, repères de zones et cartouche ; plan de fabrication (vue cotée, symboles et tableau de perçage, trous de fixation, coupe d'empilage, notes), assemblage dessus / dessous (dessous en miroir, non-montés de la variante en tirets), nomenclature, couches de cuivre en option. PDF au **texte cherchable** (WinAnsi, accents compris ; valeurs, boîtiers, références fabricant et nets en texte invisible à leur place ; signets par feuille et par composant), dans `fabrication.zip` et annoncé par le Master Drawing. Recherche et surlignage dans la fenêtre. 13 essais (`harness.js`).
  - [x] Cotes posées à la main, accrochées à la géométrie (`editeur-pcb/js/34-draftsman-vues.js`) : horizontale, verticale, alignée, diamètre, rayon ; points aimantés (trous, vias, centres et bords de pastilles, sommets et bords du contour) ; enregistrées par référence, elles suivent le composant, orphelines en rouge « (orpheline) » à l'écran comme au PDF, sur le calque COTES du DXF. Vues déplacées à la souris (aimant 2,5 mm, dans le cadre, hors cartouche, « Replacer automatiquement »). 7 essais.
  - [x] Vue de détail agrandie : cercle ou rectangle, 2:1 à 20:1, découpée à sa fenêtre, repère « A » et étiquette « DÉTAIL A — ÉCHELLE 5:1 », placée d'office puis déplaçable, cotable.
  - [ ] Cotes angulaires, en chaîne ou depuis une origine commune ; tolérances portées sur la cote ; vues qui se repoussent au lieu de se recouvrir.
  - [x] Tableau des impédances contrôlées au plan de fabrication (classes à Z cible du gestionnaire de contraintes).
  - [x] Export DXF pour la mécanique (`editeur-pcb/js/33-draftsman-export.js`) : R12 (AC1009) en mm ; carte seule à 1:1 dans le repère des Gerber (contour et découpes en LINE/ARC, arcs facettés retrouvés, un CIRCLE par trou métallisé / non métallisé, encombrement et repères par face, cotes, tableau de perçage) et feuille entière lue dans la liste d'objets (calques par `dfCalque`, catégorie ou place) ; boutons dans la fenêtre, `-CARTE.dxf` et `-PLAN-FABRICATION.dxf` dans `fabrication.zip`.
  - [x] Fonte embarquée : PlansSans (Liberation Sans OFL, pré-réduite par `outils/fonte-plans.py`, 80 Ko dans `js/fontes/plans-sans.js`), sous-ensemble des glyphes employés à chaque PDF, CIDFontType2 / Identity-H / ToUnicode (Ω, ≤, ≥ cherchables) ; option cochée par défaut, repli Helvetica. 8 essais (`harness.js`), vérifiés par pdftotext, pypdf et ezdxf.
  - [ ] Fonte embarquée dans le Master Drawing ; trous du DXF par diamètre.

- [x] **Gestionnaire de contraintes** (`editeur-pcb/js/30-contraintes.js`, modèle dans `01-core.js`, 10/10/2026) : tableur Nets / Classes / Paires / Groupes d'appariement / Isolation entre classes, mesure à côté de chaque contrainte (longueur, délai, vias, Z₀) ; contraintes de net ou héritées de la classe (Z cible et tolérance, longueur min / max, vias max, couches permises) ; largeur pour Z cible couche par couche ; groupes en longueur ou en délai, cible du serpentin ; matrice d'isolation classe × classe appliquée au routeur, au DRC, aux zones et aux Gerber ; écarts au DRC ; export CSV ; tableau des impédances contrôlées au plan de fabrication. La visionneuse IPC-2581 et `commun/` ne sont pas touchés. 10 essais (`harness.js`).
  - [x] Saisie des contraintes dans le schéma (`editeur-schematique/js/27-contraintes.js`, règles communes `commun/contraintes.js`) : tableau des nets nommés, groupes d'appariement, section du panneau Propriétés ; reprises par le PCB à l'ouverture du gestionnaire, par l'ECO (ligne « Contraintes ») et à l'export ⇉ PCB, gardées à part (`contraintes.schema`), le PCB passant devant champ par champ. 3 essais schéma, 3 essais PCB.
  - [x] Topologie : une piste qui traverse une pastille du net sans s'y arrêter s'y raccorde.
  - [x] Largeur de classe par couche (`wL`, `classWidth`) : le routeur prend celle de la couche active et en change au via, le DRC et « aligner sur la classe » la suivent, la largeur pour Z cible se pose couche par couche ; report quand le nombre de couches change. 4 essais.
  - [x] Topologie (point à point, chaîne avec ordre imposé, étoile à branches égales, fly-by terminé) et moignons (dérivation, point de test, bout libre, moignon de via) par net ou par classe (`editeur-pcb/js/31-topologie.js`) ; onglet « Topologie et moignons », DRC, CSV. 7 essais sur cartes construites.
  - [x] Contre-perçage (back-drill) décrit dans l'empilage (`stack.cp` : face, couche à ne pas couper ou auto, surperçage, moignon résiduel), pris par un via, un net ou une classe (`cp`) ; `cpVia` ramène le moignon au résiduel dans la topologie / DRC, la simulation SI/RF (`contre_percage`) et la vérification de la carte (`cp`) ; contre-perçage impossible signalé au DRC. 3 essais (`harness.js`), bancs ligne-mom et analyse-carte.
  - [x] Contre-perçage en fabrication : un Excellon par paire de couches (`…-BACKDRILL-B-In2.DRL`, couche à ne pas couper et profondeur en commentaire), LISEZ-MOI, feuille d'empilage, master drawing ; plan de fabrication : symboles dans la vue de la carte (et ses détails), tableau, passe sur la coupe, note.
  - [ ] Contre-perçage : visionneuse IPC-2581 (lire le back-drill du fichier), couches empruntées par une zone de cuivre, profondeur en champ Excellon/IPC-2581 plutôt qu'en commentaire.

- [x] **Rooms** (`editeur-pcb/js/32-rooms.js`) : les blocs du schéma (zones étiquetées) encadrés sur la carte comme les rooms d'Altium — cadre, fond teinté, étiquette ; un clic sur l'étiquette prend le bloc ; Affichage → Rooms ; lus dans le document du schéma (session ou projet), à défaut dans l'analyse « Motifs & Blocs ». Remplacent les pastilles de couleur. 3 essais.

### Simulation SI (Signal Integrity)
- [ ] **Crosstalk en conditions réelles** — voir [docs/spec-crosstalk-reel.md](docs/spec-crosstalk-reel.md) (décisions du 09/10/2026, rien de codé) :
  - case « conditions réelles » dans l'Analyse électrique, éditeur PCB et visionneuse IPC-2581 ;
  - drivers en presets modifiables (CMOS, FPGA, open-drain, TTL 74LS / 74F-ALS, LVTTL), Rs haut / Rs bas, valeurs gardées par projet ;
  - passifs détectés et posés à leur position réelle (R série avec nets chaînés, pull-up/down, C vers masse, ESD/TVS, ferrite) ;
  - stimuli front / horloge / trame série ; victimes par nature (logique, reset, ADC, horloge, alim, VREF) avec leur critère ;
  - sortie : forme d'onde, verdict, spectre ; analyse géométrique : étiquette « net sensible » seulement.
- [x] **Pertes conducteur** (`ligne_mom.line_losses`, v2.7.0, 10/10/2026) : l'ancien `Rs/(2·Z0·w)` ne comptait que le ruban ; remplacé par l'inductance incrémentale de Wheeler (ruban et plan(s) reculés séparément, Hammerstad-Jensen corrigé de l'épaisseur pour le microruban, Wheeler 1978 pour la triplaque, résistance continue en quadrature). Validé : coaxiale exacte, plaques parallèles, Pucel ±8 %, exemple de Pozar ±5 %. Inchangé à 50 Ω en microruban (les oublis se compensaient) ; ×0,64 sur un microruban 87 Ω, ×1,30 sur un 26 Ω, ×0,70 en triplaque étroite. `modele_conducteur="ancien"` rend l'ancien chiffre.
- [ ] **Brancher les options de `ligne_mom` 2.7.0** (prêtes, désactivées) : `hauteur=` / `topologie=` et rugosité de l'empilage (Hammerstad-Groiss, Huray) dans `simulation_em.py` (cascades simple et différentielle), `rf_reseau.py`, `crosstalk.py` (`alpha_genou`) ; `dielectrique_causal=True` (Djordjevic-Sarkar) pour l'œil ; `abcd_via_ligne` (via en ligne coaxiale + moignon en ligne ouverte) comme modèle haute fréquence du via.
- [x] **Mode différentiel dans la cascade de paramètres S** :
  - Calcul complet des paramètres S en mode mixte (*Mixed-Mode S-Parameters*) dans `python/simulation_em.py` (`_cascade_differentielle`) : mode différentiel pur $S_{dd}$ ($S_{dd11}, S_{dd21}$ sur $Z_{ref,diff}$ ex: 100 Ω ou 90 Ω), mode commun $S_{cc}$ ($S_{cc11}, S_{cc21}$ sur $Z_{ref,comm} = Z_{ref,diff}/4$ ex: 25 Ω), et conversion de mode CEM $S_{cd21}(\omega)$ calculée à partir du skew $\Delta L = |L_+ - L_-|$.
  - Interface dédiée dans l'onglet « Z différentielle » (`commun/simulation-em.js`) avec sélecteur interactif `[ Sdd ]`, `[ Scc ]`, `[ Scd ]`, courbe SVG multi-traces avec seuil CEM à $-20\text{ dB}$, repère de fréquence centrale $f_0$, lecture dynamique au survol et export Touchstone différentiel `.s2p`.

- [x] **Diagramme de l'œil** (onglet SI, `python/oeil.py`, route `/api/oeil`) : œil PRBS et pire cas, gabarits par protocole (USB 2.0/3.x, PCIe 1–3, HDMI, LVDS, MIPI D-PHY, SATA, SGMII, SPI, QSPI, SD, eMMC), égaliseur de référence, marge, export CSV.
- [x] **Œil : gabarits vérifiés** — PCIe Gen 2 et Gen 3 recoupés (valeurs inchangées, jugés à 10⁻¹²), SATA Gen 1–3 recoupés (largeur 1 − TJ : 0,49 / 0,43 / 0,43 UI, en losange) ; gabarits dérivés rattachés aux récepteurs réels (SN65LVDS32, D-PHY 70/40 mV).
- [x] **Œil : gigue et diaphonie** — œil statistique (RJ, DJ double Dirac, bruit), contours de taux d'erreur, baignoire, marge au taux visé ; agresseurs bornés dans le pire cas, repris de `crosstalk.py`.
- [x] **Œil : modèles IBIS** (`python/ibis.py`) — lecteur .ibs, tampon émetteur et diodes du récepteur simulés pas à pas contre le canal ; vias et coudes de la paire dans la cascade différentielle (`simulation_em` 4.4.0).
- [ ] **Œil : reste** — USB 2.0 Template 2 et HDMI 1.4 TP2 à vérifier dans la norme (non publiques) ; mutuelle entre fûts des vias de la paire ; boîtier IBIS (R/L/C_pkg), [Diff Pin] et AMI ; conversion de mode d'une paire de tampons dissymétriques.

### Vérification de la carte entière

Une analyse de toute la carte, tous les nets, sans sélection, qui range ses
constats du plus grave au moins grave (famille « Audit de la carte » du panneau). Mode
d'emploi : [docs/verification-carte.md](docs/verification-carte.md). Les règles
électriques se jugent à la **cadence de chaque classe**, avec pour chaque net
le front effectif min(front de sa classe, 10 % de la période de sa cadence),
au genou 0,35 / t_r.

**Fait (30/09/2026)**
- [x] Classes de nets automatiques + correction à la main (schéma, PCB, visionneuse) ; nœud de découpage d'un hacheur marqué **bruyant** (`nets_bruyants`).
- [x] Rapport par règle puis par net, classe du net affichée, clic → vue + marque, marquages sans net et nets « Lent par défaut » à part, export texte ; l'onglet *Santé liaison* retiré.
- [x] **Angles des pistes** (tous nets) : aigus (critiques), droits (vigilance), jonctions en T ou en étoile, hors 45° ; pastilles et vias exclus, micro-zigzags d'export noyés dans le cuivre exclus.
- [x] **Chemins de retour** (point 3) : chaque via de signal qui change de plan, par le moteur de Current Return Path ; verdict = pire de la réflexion |Γ| et de la boucle face à λ/20 ; traversée de cavité GND → alimentation chiffrée même hors parcours.
- [x] **Diaphonie** (point 6) : chaque couple de pistes voisines, Kb/Kf par MoM à l'écart réel, NEXT/FEXT au niveau 2 sous le t_r global, statut vert / orange / rouge (3 % / 7 %).
- [x] **Le cuivre des surfaces** envoyé par les deux outils (plans et versements de la visionneuse, zones et découpes de l'éditeur) et peint une fois par couche côté serveur (`_Surfaces`, numpy) ; contour de carte, trous métallisés et leur portée, broches des composants avec leur net.
- [x] **1. Empilage** : couche de signal sans plan (critique si elle porte un net rapide), plan derrière une autre couche, plan collé à plus de 0,5 mm pour un net rapide, couches de signal face à face, cavité alimentation / masse (pF/cm²), symétrie (voilage).
- [x] **2. Impédance des nets** : Z₀ par section MoM avec la masse coplanaire mesurée dans le cuivre de la couche, R, L, C, T_d par net ; réflexion Γ · min(1, 2T_d / t_r) de chaque tronçon face à la cible (Horloge, Rapide, RF) ou à l'impédance dominante du net.
- [x] **4. Fentes et vides des plans** : plan de référence lu sous chaque piste, détours d1 / d2 plafonnés à 30 mm, impédance de fente d'Ott par `rf_reseau.z_fente`, |Γ| comme un via ; propre dégagement exclu ; une ligne par net et par plan.
- [x] **5. Vias de couture** : cavités entre deux couches d'une même masse, plus grand trou sans via par transformée de distance, pas équivalent face à λ/20 au front le plus rapide de la carte.
- [x] **7. Découplage** : chaque broche d'alimentation de CI, condensateur vers la masse le plus proche face à λ/40 au genou des signaux du circuit ; « aucun condensateur » critique.
- [x] **8. Bord de carte** : cuivre à moins de 0,25 / 0,5 mm du détourage (tous nets), longueur de piste rapide à moins de max(1 mm, 5 h) du bord face à λ/20, règle des 20 H (info).
- [x] **9. Paires différentielles** : Z_diff MoM à l'écart réel des morceaux couplés, 2 Z₀ pour les découplés, face à la cible réglable ; écart de longueur en temps face au front ; vias en nombre différent.
- [x] **Bouts de piste orphelins** : piste isolée (critique), bout libre au départ d'une pastille, moignon, dépassement après un coin ; 2T_d / t_r à sa cadence sur un signal. Trouve sur P01x290 une piste qui s'arrête à 1,2 mm de sa pastille.
- [x] Durée de chaque règle rendue au panneau (`durees_s`) ; P01x274 : 20 s en tout.
- [x] **Classe Antenne** (fabrication seulement), **porteuse RF** réglable (les nets RF jugés à leur fréquence), angle droit en vigilance, broches de circuit reliées à la masse par un condensateur mais non classées Alimentation listées en réserve. P01x274 reclassé : de ~50 critiques à 4.
- [x] **Fréquence maximale par classe** (`FMAX_CLASSES` : Lent 10 MHz, Analogique 1 MHz, Découpage 10 MHz) : un net lent n'est plus condamné par la colonne 100 MHz ; unités réglables par champ ; diaphonie : une ligne par couple ; le cuivre sans net ne porte plus de classe au rapport.

- [x] **Diaphonie** : arcs (cordes de 5°), couches voisines sans plan (méthode des images, un plan), somme des agresseurs en phase.
- [x] **Diaphonie** : pertes R, G au genou du front (option), somme des agresseurs en phase ou quadratique, paires colorées au statut DRC sur le layout.
- [x] **Paires** : masse coplanaire dans Z_diff (`_ecart_exterieur`) ; plan de référence sous une seule moitié, jugé en temps.
- [x] **Bord** : clôture de vias dans la bande de 2 mm du détourage, face à λ/20.
- [x] **Découplage** : plus court chemin sur les pistes du rail (`_Chemins`), inductance de boucle (pistes, vias, montage du boîtier), valeur et résonance du condensateur.
- [x] **Éditeur** : zones envoyées remplies (dégagements autour des autres nets en trous) ; nœuds de découpage du schéma → PCB (`netBruyants`, gardés dans la carte).
- [x] Nouvelles règles : **moignons de vias**, **branches en T**, **quartz**, **protection ESD**, **courant des rails** (IPC-2221, `courants` du document).
- [x] Rapport : **dérogations**, **référence** et comparaison de révisions dans la page, **tout peindre** ; visionneuse : classement manuel **mémorisé par fichier**.

**Reste à faire — compléter ce qui existe**
- [x] **Z₀ par classe** plutôt qu'une seule cible ; **porteuse par net** (une carte LoRa + NFC).
- [x] **Courant par rail** saisi dans le panneau (ou repris de l'onglet Chute DC) pour la règle de courant.
- [x] Couplage entre couches voisines **résolu** (MoM à conducteurs sur deux niveaux, `ligne_mom.section_deux_niveaux`) au lieu de la méthode des images.
- [x] Éditeur : liaisons thermiques et rognage au bord dans les zones envoyées.

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
2. **SI & Crosstalk niveau 2** : matrice multi-lignes MoM 2D, k_total, NEXT et FEXT normalisés (échelon unitaire, lignes adaptées, t_r par classe ou global) avec statut vert / orange / rouge, pour la piste sélectionnée et pour toute la carte ; la carte locale dit où le NEXT se fabrique. (L'analyse électrique — matrice S, IFFT, volts — a été retirée.)
3. **Modélisation physique des discontinuités** : coudes de Gupta (L, C), vias en $\pi$ (L Grover, C antipads), moignons résonants complexes, traversée de plans selon Bogatin.
4. **Scoring de placement & Motifs** : HPWL, congestion, découplage HF, auto-rotation vectorielle anti-croisements, détection de motifs (LDO, Buck, bus numériques, quartz, RC) et injection automatique des courants DC.
5. **Bus & Feuilles hiérarchiques** : mode bus épaissi, notation vectorielle, feuille racine synoptique avec blocs de sous-feuilles et sheet pins.
6. **Éditeur PCB avancé** : serpentins d'appariement de longueur (*meanders*), pastilles de formes arbitraires (`poly`, chanfrein, découpes thermiques), support complet des pistes en arc de cercle dans tous les solveurs et panneaux.
