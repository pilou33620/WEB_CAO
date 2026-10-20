# À faire — Roadmap & Backlog

Ce document liste les tâches planifiées, en cours et à venir pour la suite de CAO électronique WEB_CAO.
Pour les détails techniques approfondis, les dérivations physiques et l'historique complet des réalisations passées, consulter :
- [docs/simulation-em.md](docs/simulation-em.md) — Référence technique des solveurs et modèles SI/PI.
- [docs/HISTORIQUE_DEVELOPPEMENT.md](docs/HISTORIQUE_DEVELOPPEMENT.md) — Archive complète des développements, audits et post-mortems (août - sept. 2026).

---

## État des lieux (septembre 2026)

L'ensemble de la chaîne est fonctionnel et couvert par **plus de 1 700 essais automatisés, tous passés** (relevé du 02/10/2026) :

| Composant | Statut | Couverture / Bancs |
| --- | --- | --- |
| **Éditeur PCB** | En service | 1002 essais (`editeur-pcb/test/harness.js`, relevé du 16/10/2026), dont 44 pour les plans (Draftsman), 30 pour le dossier mécanique, 24 pour le gestionnaire de contraintes et la topologie, 3 pour l'export IPC-2581 (+ 60 cas d'aller-retour, `banc-ipc2581-export.py`) |
| **Éditeur Schématique** | En service | 157 essais (`editeur-schematique/test/harness.js`), dont 3 pour les contraintes de nets |
| **Visionneuse IPC-2581** (lecteur `ipc2581_parser` 1.82, `ipc2581_json` 1.3.0) | En service | 226 essais (`harness-sim.js`), dont 13 pour le dossier mécanique + 76 (`banc-essai.py`) |
| **SI — Impédance & Vias (`ligne_mom` v2.9.0)** | En service (0,3 à 0,4 % vs étalons ; pertes conducteur par l'inductance incrémentale de Wheeler, ruban + plan(s) + bords ; rugosité Hammerstad / Huray, diélectrique causal Djordjevic-Sarkar, via en ligne — branchés dans la cascade) | 236 cas (`python/test/banc-ligne-mom.py`) |
| **SI — Z différentielle (`solve_multiline`)** | En service (< 3 % vs Garg-Bahl) | inclus dans les 199 cas |
| **SI — Crosstalk niveau 2 (`crosstalk` v4.6.0)** | En service (scan normalisé : k_total, NEXT et FEXT en % et dB, statut vert / orange / rouge, piste sélectionnée — t_r saisi ou déduit de la classe — ou toute la carte sous un t_r global ; pistes superposées résolues ; pertes R, G au genou du front en option ; carte sans plan avec masse arrosée sur la couche ; somme des agresseurs en phase ou quadratique ; **fente du plan franchie par les deux pistes : impédance commune du détour, le courant de retour résolu par PEEC sur l'image des plans que la page envoie (toute forme, plan intact dessous, vias de masse, victime superposée), Ott en repli et en borne haute de la fourchette** — dans « Analyser la piste » et dans la règle *diaphonie* de toute la carte ; garde sans perçage dans le document supposée cousue des deux côtés ; coloration au statut DRC sur le layout ; l'analyse électrique est retirée ; S = 3W pile sur le seuil retenu, couples écartés de peu nommés, front RF imposé signalé) | 56 cas (`python/test/banc-crosstalk.py`), dont la triplaque exacte (Cohn), les formules du niveau 2, l'estimation d'Ott du cas 4 du banc de mesure et le retour résolu (microruban, convergence, cas 4b, vias, fente en biais, victime superposée) |
| **Cascade SI / PDN (`simulation_em` v5.5.0)** | En service (hauteur et topologie aux pertes, rugosité par cuivre et rugosité propre du plan — cascade simple et différentielle —, diélectrique causal en option, via en π ou en ligne au-delà de 0,3 rad, mutuelle des fûts de la paire, contre-perçage ; dispersion de Getsinger comptée une seule fois dans la cascade ; paire par brin : via sur le brin N seul, brins superposés couplés en large face) | couvert par les bancs `ligne_mom`, crosstalk, œil, RF et éditeur |
| **SI — Diagramme de l'œil (`oeil` v2.4.0)** | En service (réponse à un bit depuis la cascade ABCD, simple et différentiel, vias et coudes de la paire compris ; œil PRBS et pire cas PDA ; CTLE, FFE, DFE ; œil statistique RJ/DJ/bruit, contours 10⁻⁶…10⁻¹⁵ et baignoire ; diaphonie bornée saisie ou reprise du couplage (NEXT/FEXT du niveau 2) ; tampons IBIS émetteur et récepteur simulés dans le temps avec leur boîtier, [Diff Pin], paire brin par brin et mode commun ; condensateurs de liaison (couplage AC, coupure basse et droop exact) ; .ami lu et **modèle AMI exécuté** par ctypes depuis la LIB/projet — GetWave de l'émetteur et du récepteur, horloge récupérée imposée, forme d'onde des tampons IBIS —, repli sur l'égaliseur de référence ; mutuelles du boîtier vers les broches voisines (`ibis.py` 1.4.0) ; 18 gabarits avec leur fiabilité, plus aucun « à vérifier ») | 62 cas (`python/test/banc-oeil.py`) |
| **RF — S21 port à port (`rf_reseau` v1.7.0)** | En service dans l'éditeur PCB et la visionneuse, chacun avec son empilage (pistes par `simulation_em`, lignes couplées à N conducteurs avec pertes et dispersion modale, coudes et vias aux bords des longements, pastilles en MoM 3D sur stratifié étalonné sur l'empilage, zones et coulées de masse entières en maillage adaptatif creux sur leur cuivre rempli, longements recoupés à leur écart local, chemins de masse piste + via, broches annexes, pistes des autres nets fermées sur leur Z₀, mutuelles des selfs entre elles et avec les pistes (Neumann avec image), fentes du plan de référence (Ott), composants SPICE / .sNp / idéaux, S généralisés sur ports complexes, « et si ») — quasi-statique (+ Getsinger) : le domaine de validité (modes supérieurs, ondes de surface, rayonnement) est calculé et signalé ; les modéliser demande le moteur pleine onde | 47 cas (`python/test/banc-rf.py`) + 8 essais de page (`editeur-pcb/test/harness.js`) + 3 (`harness-sim.js`) |
| **PI — Chute DC & Échauffement (`dc_solver` v2.1.0)** | En service (IR drop, densité J, modèle étalement) | 42 cas (`python/test/banc-dc.py`) |
| **Scoring placement & Rotation (`pcb_scoring`)** | En service (HPWL, congestion, découplage HF, auto-rotation) | 18 cas (`python/test/banc-pcb-scoring.py`) |
| **Vérification de la carte (`analyse_carte`)** | En service (tous nets : angles, bouts orphelins, empilage ; à la cadence de chaque classe : impédance, chemins de retour, fentes de plan, vias de couture, diaphonie, paires différentielles, découplage, bord de carte, moignons de vias, branches en T ; quartz, ESD, courant des rails ; dérogations et comparaison de révisions ; classes d'interface USB, Ethernet, LVDS, CAN, RS-485 à leur front et à la Z_diff de leur norme) — mode d'emploi : [docs/verification-carte.md](docs/verification-carte.md) | 25 cas (`python/test/banc-analyse-carte.py`) + route (`banc-serveur-routes.py`) + 11 essais éditeur + 4 visionneuse |
| **Reconnaissance de motifs (`pattern_recognition`)** | En service (LDO/78xx/79xx/Buck, I2C, SPI, UART, quartz, RC, courants DC) | 24 cas (`python/test/banc-patterns.py`) |
| **Claude par le MCP de web_suite (schéma, PCB, visionneuse, Gestion LIB)** | En service (lectures, écritures en cartes cliquées, calculs, routage, composants ; l'ancien assistant IA intégré est retiré) | `commun/lecture-cao.js`, `commun/pilote-cao.js`, `commun/ecriture-cao.js` ; bancs de web_suite (`lanceur/banc_mcp.py`) |
| **Serveur `web_CAO.py`** | En service (détection Raspberry Pi / terminal sans affichage : navigateur non ouvert par défaut, `--navigateur` / `--sans-navigateur`) | `banc-serveur-routes.py`, `banc-lib-routes.py`, `banc-maj-github.py`, `banc-detection-plateforme.py` |
| **Moteur 2,5D pleine onde (`mom_solver`)** | Archivé dans branche `archive/mom-solver-25d` (recentrage sur 2D instantané) | Préservé dans l'historique Git |
| **Support Android / Termux** | Abandonné volontairement (ajouté le 17/09, retiré au commit suivant) | — |
| **Passerelle MCP, profils, cross-probing** | En service | `web_CAO.py`, `commun/session.js` |
| **Gestion LIB — catalogue, recherche, import JLCPCB / LCSC** | En service | 27 + 65 essais (`gestion-lib/test/banc-catalogue.js`, `banc-import-jlc.js`) ; repère et trous des empreintes (`banc-repere-pcb.js`) ; routes LIB : 16 cas (`banc-lib-routes.py`) |

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

## Reste à faire — fonctionnalités de l'outil (relevé du 11/10/2026)

Ce qui manque au code des outils eux-mêmes. Les bancs, cartes d'essai, mesures
et vérifications contre des documents externes sont à part, dans la section
suivante.

### Pilotage par Claude (MCP de web_suite) — relevé du 19/10/2026

Ce que les modules du MCP ont laissé ouvert côté WEB_CAO (détail dans
`web_suite/tasks/todo-*.md`) :

- [ ] **Datasheet → simulation, deux familles non écrites** : les parasites des condensateurs
  (ESR, ESL, capacité effective) et les bornes de la chute DC (courant d'une charge, tension
  d'une source) sont au catalogue (`simDsCatalogue`) mais `cao_sim_ecrire` ne les écrit pas ;
  aujourd'hui Claude les donne à saisir. Étendre `ECRITURE_CAO.simulation` (`commun/ecriture-cao.js`)
  aux entrées `condensateurs` et `bornes_dc` de `simDsPreparer`.
- [ ] **« Bus synchrone » absent de `cao_calcul`** : l'analyse existe dans la page (setup / hold,
  temps de vol, skews), mais le canal ne sait pas la lancer (`piloteCaoCalcul`, `commun/pilote-cao.js`).
- [ ] **Gestion LIB trop lourde sur le Pi** : environ 890 Mo au chargement (500 Mo ensuite), plus
  encore en rechargeant ou en ouvrant la galerie des 269 empreintes ; l'onglet a été tué par le
  noyau (OOM) pendant un essai. Mesurer ce qui coûte (table du catalogue, vignettes), puis alléger.
- [ ] **Générateurs IPC-7351B** (`commun/composants-lib.js`) : les constantes des puces plus petites
  que 0603 (tableau 3-6) sont « à confirmer sur la norme » ; QFN, DIP et barrette n'ont pas de
  comparaison à une référence externe (seuls 0603, SOT-23-5 et SOIC-8 sont comparés à KiCad).
- [ ] **LIB : SOIC-8 et SOT-23-5** ne suivent pas l'IPC-7351B (pastilles décalées de 0,15 à
  0,23 mm) : à régénérer, ou à garder en connaissance de cause.
- [ ] **Essais réels restants** : `cao_paire` et `cao_placement_auto` dans la vraie page après la
  revue du routage ; le canal depuis l'iPad.

### Dossier de fabrication — animation 3D de la carte qui s'assemble (demandé le 19/10/2026)

Modèle : une vidéo de gopcb.ai (contrôleur de vol 36 × 36 mm) — carte 3D sur fond noir,
caméra qui tourne et s'approche, la carte se construit sous les yeux, titre et dimensions en haut.

- [ ] **Option à la génération de `fabrication.zip`** (case à cocher, décochée par défaut) :
  - **Rendu 3D** : substrat à l'épaisseur de l'empilage et au vrai contour (découpes, trous),
    cuivre et pastilles dorés, vernis, sérigraphie, composants en volumes (encombrement de
    l'empreinte × hauteur de la LIB, boîte par défaut sinon) ; three.js, déjà dans
    `WEB_3D/vendor/three/` (l'éditeur PCB n'a aujourd'hui aucune vue 3D).
  - **Contenu** : titre (nom du projet) et « L × l mm » lus sur le contour, cotes sur la carte ;
    ordre d'assemblage : carte nue → cuivre / pistes → composants posés un par un (gros boîtiers
    d'abord, face dessus puis dessous), puis un tour complet de la carte finie.
  - **Sorties** : vidéo **MP4 ou WebM** (enregistrée dans le navigateur, `MediaRecorder` sur le
    canvas — à vérifier sur le Pi : codecs disponibles, temps de rendu) et **page HTML autonome**
    (animation en boucle, carte orientable à la souris, three.js embarqué pour s'ouvrir hors ligne).
  - Pas retenu pour l'instant : bulles de description des composants, schéma-bloc qui se construit.
  - À réutiliser : `trousMonde()`, contour et empilage du dossier méca (`commun/dossier-meca.js`),
    l'esprit des animations de `screen/` (2D, SVG / GIF).

### Code en double à fusionner (relevé par l'audit du 16/10/2026)
L'audit complet a corrigé les défauts et retiré le code mort ; ces doublons, eux, sont des chantiers à part (/spec puis /plan) : chaque copie doit être corrigée N fois, et certaines ont déjà divergé.
- [ ] **Adaptateurs de simulation éditeur / visionneuse** : environ 920 lignes à 60–100 % identiques entre `editeur-pcb/js/19-simulation.js` et `visionneuse-ipc2581/js/07-simulation.js` (`simRetourValeurs`, `simRetourTrace`, `simZValeurs`, `simXtFentes`, `simDocDiff`, `simXtDetours`, `simZNumeroLot`, `simVoile`, `simZTrace`, `simXtCoupe`, `simDCCercle`, `simEstResistance*`, `pcbParseResistance` / `simParseResistance`). Déjà divergé : `plans_sans_cuivre` (la visionneuse l'envoie, `simCheveluRes` le perd, `simRetourValeursIpc` n'a pas la branche), libellés « portée supposée » / « découplages non cherchés » côté visionneuse seulement. À ranger dans `commun/` avec un rappel de coordonnées et de nom de couche.
- [ ] **`ltZ0` / `ltEeff`** copiés entre `editeur-pcb/js/01-core.js` et `visionneuse-ipc2581/js/02-modele.js` (divergés : arrondi d'ε_eff, h ≤ 0).
- [ ] **Cavité modale du PDN** (`simPDNCalculerModesCavite`, `InductancesEpandage`, `ResoudreComplexe`, ~190 lignes JS) en miroir de `ligne_mom.cavite_modale` : à comparer, puis n'en garder qu'une.
- [x] **Lecteur CSV** (20/10/2026) : `parseCSVLine`, `csvLignes` et la liste des chemins de repli (`CSV_LIB_REPLIS`, les 6) dans `commun/csv.js`, chargé par le schéma et la Gestion LIB.
- [ ] **Échappement HTML** : 13 copies (`esc` ×4, `escapeHtml`, `crEsc`, `echapperHtml`, `uEsc`, `libEsc`, `elibEsc`, `profEsc`, `wsEsc`, `trEchappe`) → une seule dans `commun/`.
- [ ] **Serveur `web_CAO.py`** : 7 lecteurs de corps de requête, 6 enveloppes erreur → JSON (`_api`, `_profil_api`, `_projet_api`, `_lib_api`, `_ipc_api`, `_datasheet_api`), tables de routes répétées dans `do_GET` et `do_HEAD`, `_client_local` qui refait `appairage.Garde.ce_poste`.
- [x] **Bibliothèque d'empreintes de l'éditeur PCB** (20/10/2026) : `fpLibPut`, `fpLibDel`, `fpLibFile`, `fpLibParse`, `fpLibNames`, `fpDefOf`, `fpCenterOrigin` (et `fpOffCenter`, `fpIsCentered`, `fpMoveOrigin`) retirés, la Gestion LIB reste le seul éditeur ; les essais encore utiles (lecture de la LIB, reprise de l'ancien stockage, `fpApplyDef`, trous) sont réécrits sans elles. Restent, morts eux aussi depuis la fenêtre d'édition : `fpMovePad`, `fpSetPad`, `fpDelPad`, `fpGeneric`, `fpSetBody` (le banc s'en sert pour fabriquer des empreintes dessinées).
- [x] **Repli « page en double-clic + serveur sur 127.0.0.1:8000 »** (20/10/2026) : retiré (`simCandidats`, `apiCandidats` de la visionneuse et de la recherche de composants, `do_OPTIONS` / `_cors` du serveur) ; les README disent que la page s'ouvre par l'adresse du serveur. Reste, mort pour la même raison : le bouton « Serveur… » de la recherche de composants (une autre adresse que l'origine est refusée). WEB_ANTENNA garde la même sonde dans son `js/01-api.js`.
- [x] Constantes en double côté Python (20/10/2026) : `analyse_carte` reprend les seuils de diaphonie de `crosstalk` et la résistivité de `dc_solver` (1,724e-8 Ω·m partout).

### Simulation SI — crosstalk
Rien en cours : l'option B, les limites de l'option A et la garde de la règle *diaphonie* sont faites (13/10/2026, détail dans *Backlog par domaine → Simulation SI*).

### Trous dans les empreintes (`SPEC-trous-npth.md`, 16/10/2026)
- [x] **M1 — trous ronds NPTH dans l'empreinte** (`holes` de pcbfp-1, `trousMonde()`) : voir *Éditeur PCB* ci-dessous.
- [x] **M2 — perçages oblongs** (16/10/2026) : pastille à fente (`slot`), trou NPTH oblong (`w`, `rot`, carte et empreinte) ; `axePercage` pour l'Excellon (G85), le tableau de perçage, le DXF, le dessin, les dégagements (écran, îlots, Gerber, IPC-2581), le DRC (y compris la fente sur une couche sans cuivre) et l'audit fabricant (`drilling.slots`) ; IPC-2581C en `SlotCavity` (calque ROUT) comme KiCad, conforme au XSD ; Gestion LIB (colonnes Fente, L, Rot). 8 essais + carte d'essai `exemple-1-fentes`.
- [x] **Points ouverts de M1 à M3** (17/10/2026, `tasks/plan-points-ouverts.md`) :
  - le routeur voit les trous NPTH (carte et empreinte, rond ou fente) comme des obstacles pour tous les nets ;
  - DRC : bord de carte d'une fente sur tout son axe, fente plus grande que sa pastille ; Gerber : trou près d'une zone sans net dégagé ;
  - la visionneuse lit les fentes (`SlotCavity`, calque ROUT), les dessine et les passe au dossier méca ;
  - Draftsman et DXF : fentes en vraie forme, calques `TROUS_PTH_<Ø>X<L>` ; `fpBBox` compte les trous ; l'écran dégage à l'écartement de la zone qui contient l'objet, comme le Gerber ;
  - panneau d'un trou de carte : longueur et angle ; Gestion LIB : glisser et Suppr pour les trous ; la mise à jour LIB relit aussi le miroir `FPLIB` ;
  - doutes de fiche : Amphenol 10132797 et Keystone 1067 confirmés par deux sources, corps du Yamaichi IC51 tourné (32 × 29).
- [x] **M3 — LIB** (16/10/2026, PROJETS) : les trous de 13 empreintes revérifiés sur fiche et passés dans `holes`, pattes oblongues du TE 2305018-2 en `slot`. Les MECA-LOC ne deviennent pas des empreintes : un trou de locating se pose comme trou de carte (décision du 16/10/2026).
- [ ] Restent ouverts :
  - Yamaichi IC51-0484-806 : broche 1 non marquée sur le plan 48 broches (une seule source indirecte) — à vérifier sur le repère moulé du support ;
  - MPD-BA2AAPC : trou Ø2,03 (plan rév. H) gardé, trop juste pour la vis 2-56 que la fiche recommande (choix du 16/10/2026) ;
  - IPC-D-356 : une fente garde sa largeur, le format ne connaît pas les fentes ;
  - accrocher une cote du Draftsman à un trou d'empreinte (référence empreinte + rang), laissé hors de M1 (D3) ;
  - l'essai « empreintes toutes centrées » contrôle la géométrie calculée pour chaque nom, pas celle des fichiers de la LIB : beaucoup d'empreintes de connecteur suivent l'origine de leur fiche, à décider ;
  - le tableau de perçage range les plots de centrage d'un connecteur sous « fixation ».

### Contenu de la LIB (données, pas code)
- [x] **Empreintes PCB** (16/10/2026) : 208 composants associés, 167 empreintes nouvelles d'après les fiches (land pattern, pad thermique, pattes de fixation) ; restent sans empreinte les antennes, selfs et modules maison, méca non électrique, piles, Testpoint_HFS_810 et CONN_BatteryHolder_TypeC/D.
- [x] **Brochages de la LIB** (10–15/10/2026) : toutes les références sur un symbole à broches nommées ont leur brochage, relevé sur datasheet (détail dans *Éditeur schématique* ci-dessous).

### Simulation RF — S21 TX de la carte P01x274 (U400 → antenne, étudié le 15/10/2026, en attente des réponses)
Carte `IPC2581_Exemple/P01x274PCB-C.xml`, radio SX1261 (U400, datasheet `IPC2581_Exemple/DS_SX1261-2_V2_1_EN.pdf`), LoRa 868 MHz.
- **Ports.** Port 1 sur **U400.23 (RFO)**, asymétrique. **U400.24 (VR_PA) n'est pas un port** : c'est l'alimentation du PA, amenée sur RFO par la self de choc L404 (47 nH) et mise à la masse en RF par C406 / C407. Elle devient une *broche annexe* (ouverte, ou quelques ohms). Port 2 sur **A400.1** (alimentation de l'IFA) ou **J400.3** (U.FL, comme au banc).
- **Chaîne TX** : RFO → C411 // L405 (piège vers 1,71 GHz, 2ᵉ harmonique) → C412 → C413 → L406 → C433 → U401 AS179 (broche 1 → 5) → C416 → π C418 / L407 / C419 → U402 AS179 (broche 5 → 3) → C423 → R416 0 Ω → A400.
- **Exclusions à poser** (sinon la marche fuit jusqu'au MCU U301 et dépasse le plafond de nets) : R412, R413, R414, R415 (commandes des commutateurs ; garder les 1 nF C415, C417, C420, C421) ; C431 et C414 (branche RX : SAW FLT400 / FLT401, LNA U403) ; les non-montés (C424 et C425 « XX », R425 / J401 ou R416 selon la variante), J400 / PTST400 / PTST401 si l'on ne veut pas leurs moignons.
- **Bloquant : les Touchstone des AS179.** L'outil branche un Touchstone sur TOUTES les broches du composant, dans l'ordre des numéros (`simRfProbleme`, `commun/simulation-em.js`) : il faut un `.s6p` (broche 2 = masse, 4 et 6 = commandes) alors que Skyworks fournit des 3 ports par état. Solutions : (A) script de conversion 3 ports → `.s6p`, broches 2 / 4 / 6 découplées ouvertes, état TX (J2 = 1, J3 = 3, J1 = 5, à vérifier sur la datasheet AS179) ; (B) sous-circuit SPICE linéaire Ron / Coff à 6 broches ; (C) correspondance broche → port dans l'outil pour les Touchstone à N ports. Les fichiers doivent couvrir jusqu'à ~2,6 GHz (pas d'extrapolation hors bande).
- **Impédance du port 1** : conjugué de la Zopt du PA (absente du datasheet, § 13.1.14.1 : dépend de `paDutyCycle`) → design de référence Semtech 868 MHz ; à défaut 50 Ω (perte d'insertion seule).
- **Limites notées** : deux ports asymétriques seulement, pas de port différentiel (un S21 RX sur RFI_P / RFI_N demanderait une évolution) ; simulation petit signal (ni puissance réelle ni harmoniques du PA commuté).
- [ ] Questions posées à l'utilisateur, sans réponse : (1) modèle des AS179 : A / B / C ; (2) port 1 : Zopt Semtech ou 50 Ω ; (3) port 2 : antenne, U.FL ou les deux ; (4) branche RX : exclue, gardée, ou S21 RX plus tard ; (5) fichiers déjà en main (Touchstone AS179, Murata, impédance de l'IFA, Zopt).

### En attente d'un vrai besoin — export vers eCADSTAR (étudié le 14/10/2026, mis de côté)
- [ ] **Export projet complet vers eCADSTAR 2026** (schéma + PCB + lien des bibliothèques). Seul chemin officiel qui garde schéma, PCB et bibliothèque : écrire des archives CADSTAR `.csa` (schéma) et `.cpa` (PCB), reprises par l'outil de migration CADSTAR → eCADSTAR (installé). Format non documenté par Zuken, décrypté par l'importeur CADSTAR de KiCad. eCADSTAR n'importe ni l'IPC-2581 ni KiCad ; IDF/Gerber ne donnent qu'un PCB sans lien avec le schéma. À valider d'abord : une petite carte `.cpa` d'essai acceptée par la migration.
  - Découpage prévu : `lien-ecadstar` (comparateur de bibliothèques, utile seul) → `export-csa`, `export-cpa`.
  - `lien-ecadstar` : compare `LIB_composants.csv` à l'export de la bibliothèque eCADSTAR, fichier de lien, alerte sur les pièces ajoutées d'un côté ou les champs qui divergent. Les noms de pièces sont communs aux deux bibliothèques (560 / 592 au 14/10/2026). Comparer les nombres en nombres (`1.45` = `1.45000`) et `xx` / `None` / vide comme absents. Écarts réels déjà relevés : `22-05-3061` devenu `22/05/3061` et `0603` devenu `603` (abîmés par Excel dans notre LIB), préfixe de `MCU_EFM32PG23B210F512IM48-C` (J contre IC), boîtier de `DIODE_1PS76SB40_115`.
  - **Extraction de la bibliothèque eCADSTAR** : un outil sur le PC pro sort la liste des composants en CSV (`bibliotheque_composants.csv`, séparateur `;`, UTF-8 avec BOM). Pas de colonne d'empreinte : à ajouter à l'extraction le jour de l'export PCB.

---

## Bancs de test, cartes d'essai et validations externes

Ce qui sert à éprouver l'outil (mesures, comparaisons à d'autres solveurs,
relecture de normes, fichiers réels) et non à lui ajouter une fonction. Les
bancs automatiques en CI sont listés dans l'*État des lieux*.

### Banc de mesure crosstalk (`bancs-mesure/crosstalk/`)
- [ ] Vérifier l'empreinte de la SMA 142-0701-801 sur la datasheet.
- [ ] Faire fabriquer la carte d'essai JLC 4 couches (6 cas, dont 4b), mesurer à l'oscilloscope, comparer à SIwave, remplir `releves.csv`.
- [ ] Refaire `carte.png` (elle montre encore 5 cas).
- [ ] Trancher par la mesure : cas 4 (prévision 4,56 % de NEXT à 1 ns, dont fente résolue +3,66 % ; fourchette jusqu'à Ott, 16,7 %) et cas 4b (2,31 %, dont fente résolue +0,97 %) — départage le retour résolu (option B) et Ott (option A).
- [ ] Réexporter `docs-sim/` par `exporter-docs-sim.js` (Playwright) : l'image des plans des cas 4 et 4b y a été calculée en Python depuis les zones et les découpes de la carte, avec la règle de la page.
- [ ] **Fentes : option D — référence pleine onde externe** (openEMS, SIwave SYZ / HFSS) pour valider A / B, pas comme fonction de l'outil.

### Banc uSimmics (`python/test/banc-usimmics.py`)
- [ ] 12 relevés uSimmics manquants dans `python/test/usimmics-releves.csv`.

### Normes et documents à relire
- [ ] **USB 2.0 Template 1** : points 2 et 3 à 37,5 / 62,5 % UI dans le code, la figure 7-14 (spécification publique) pourrait les placer à 32,5 / 67,5 % ; valeurs non changées faute de certitude.
- [ ] **USB 2.0 Template 2** : concordance avec la figure 7-15 établie de mémoire, à relire dans le document.
- [ ] **HDMI 1.4 TP2** : reste « dérivé » (norme et CTS sous accord).
- [ ] **Sections IBIS** : ordre broche → die des sections (`Len=`, `Fork`) à confirmer dans le texte de la norme.
- [ ] **Rugosité de Huray** : jeux de paramètres à confronter à des fiches de feuillard.

### Fichiers réels à faire passer
- [ ] **Contre-perçage** : valider la lecture sur de vrais exports Altium / Allegro.
- [ ] **Règles IPC-2581** : valider la lecture des `<Impedance>` et `<Spec>` de règles écrites par Altium / Allegro (seule la forme de l'éditeur est éprouvée).
- [ ] **AMI** : faire tourner un vrai modèle de fabricant (seul le modèle d'essai FFE en C est éprouvé).

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
  - [x] **Remplir la colonne `Brochage` de la LIB** — « 🔄 Auto-associer » de Gestion LIB la complète là où le brochage est certain, sans jamais remplacer une saisie : transistors bipolaires SOT-23 / SOT-323 `B=1,E=2,C=3`, MOSFET SOT-23 `G=1,S=2,D=3`, OPA369 (SC70-5) `OUT=1,V-=2,IN+=3,IN-=4,V+=5`, LM78L05 (SO-8) `OUT=1,GND=2/3/6/7,IN=8,NC=4/5`, LP2980 (SOT-23-5) `IN=1/3,GND=2,OUT=5,NC=4` (ON/OFF relié à l'entrée). Fait sur la LIB actuelle (43 références avec brochage ; « Auto-associer » rejoué le 10/10/2026 : 0 modification en attente).
  - [x] **LIB corrigée (dépôt WEB_SUITE_PROJETS, fusionnée dans `main` le 08/10/2026)** : colonne `Brochage` sur 43 références ; six MOSFET canal P passés sur `pmos.json` ; LMC7215 sur `opamp.json` (SOT-23-5) ; BGA7L1 sur `ic.json` ; empreinte `SC-70-5.json` créée pour l'OPA369 ; `TO-252.json` renumérotée JEDEC (languette = 2) et LP2950CDT `IN=1,GND=2,OUT=3` ; diodes deux pattes selon IPC, patte 1 = cathode (`A=2,K=1`), diodes simples en SOT-23 `A=1,K=3,NC=2` ; 1PS76SB40 en SOD-323, BC858CW en SOT-323, BAT54 en SOT-23 ; MPN de BAS16 corrigé ; ajout de `AOP_MCP6001T-I/OT`.
  - [x] **Brochage de 18 semi-conducteurs** (15/10/2026, relevés sur les datasheets des fabricants, dépôt WEB_SUITE_PROJETS) : BAV99, BAV199, BAR43C, FDS9934C, DMC2400UV en deux parties ; BAR43, RB411D, DTC144EKA ; régulateurs LD39050, R1180Q (×2), TPS78230, XC6231 — EN / CE relié à l'entrée, comme le LP2980 ; TVS PESD5V0S2UQ, RClamp0582BQ, SM712 (×2), ESDA6V1W5, une partie par ligne. Les 71 références sur le symbole `ic` (MCU, capteurs, modules RF…) n'en ont pas besoin. Au passage, un conflit `git stash` enregistré par le commit « maj » de la LIB a été résolu.
  - [x] **Les cinq derniers** (15/10/2026) : symboles `esd_rail4` / `esd_rail2` (IO, VCC, GND) pour 824001, SRV05-4, NUP2201MR6, SR05 ; symbole `mos_np` (Q1 canal N, Q2 canal P, comme les datasheets) pour FDS9934C et DMC2400UV ; XC6231A332PR-G en SOT-89-5 avec son empreinte ; LED RVB KRTBLSLPS1 avec son empreinte (pastilles OSRAM, numérotation 1–3 = A1–A3, 4–6 = C1–C3, choisie faute de numéros dans la datasheet) et un brochage en parties R, V, B. Empreintes SOT-563 (DMC2400UV, pastilles Diodes Inc.) et SOT-143 (SR05, pastilles Semtech) ; FDS9934C en SO-8. Les modèles de simulation à 2 ou 3 broches (`diode.sub`, `mosfet_n.sub`) sont retirés des réseaux ESD et des paires N + P, où ils ne collaient pas au symbole : ces références n'ont plus de modèle.
  - [ ] **À vérifier sur une vraie carte** : l'empreinte SOT-89-5 est calculée depuis le contour Torex (Torex ne publie pas de pastilles recommandées dans la datasheet, et son site refuse le téléchargement du plan de boîtier) ; les pastilles de la LED RVB suivent OSRAM, mais la vue (dessus) est déduite du schéma « Component Location on Pad ».

### Éditeur PCB
- [x] **Gestionnaire d'empreintes de bibliothèque** : prévisualisation visuelle pop-up, filtrage et affectation directe des empreintes sur la carte (`commun/explorateur-lib.js`).
- [x] **Éléments mécaniques et graphiques secondaires** :
  - **Trous NPTH portés par l'empreinte** (16/10/2026) : champ `holes` de pcbfp-1 (Gestion LIB : outil Trou et tableau X / Y / Ø), recopié sur la carte avec l'empreinte et mis à jour avec elle depuis la LIB ; `trousMonde()` réunit trous de carte et trous d'empreinte (rotation, face dessous) pour le dessin, les contrôles (une pastille de la même empreinte peut être plus près que l'écartement, jamais recouvrir), l'Excellon NPTH, l'IPC-2581, le Draftsman, le DXF, le dossier méca, le placement et l'audit fabricant. Les zones de cuivre dégagent désormais tous les trous NPTH (écran, îlots, Gerber, IPC-2581) ; au dossier méca, les trous d'une empreinte vont chez son composant (contrat de `commun/dossier-meca.js`). 9 essais.
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
  - [x] Cote angulaire (trois points ou deux arêtes du contour, arc posé à la souris, angle opposé par le sommet pour l'angle extérieur), cotes en chaîne et d'ordonnée (origine accrochée ou origine des fichiers `gOrigin()`, une valeur orpheline sans casser les autres), tolérances (±, écarts, limites, référence, exacte encadrée) à l'écran, au PDF et sur le calque COTES du DXF ; saisie au double-clic. 9 essais, vérifié à la souris dans Chromium.
  - [x] Une vue lâchée sur d'autres les écarte vers la place libre la plus proche (grille 2,5 mm, cadre, hors cartouche ; recouvrement minimal signalé si la feuille est pleine), un seul Ctrl+Z.
  - [x] Master Drawing : épaisseurs d'empilage en mm (cuivre et vernis affichés en µm sous l'étiquette « mm »), contour de carte centré dans son cadre au-dessus du cartouche, schéma de l'anneau dégagé du texte. 3 essais.
  - [x] Aperçu au glisser des vues qui vont s'écarter (tirets orange à leur place future, flèche ; rouge et « Feuille pleine » sinon), le lâcher pose exactement l'aperçu, Échap annule ; tolérance propre à chaque point d'une chaîne ou d'une cote d'ordonnée (`tols`), écran, PDF et DXF.
  - [x] Plans : l'aperçu du glisser ne refait plus que la feuille de la vue (12/10/2026) — `dfDocument(genre)`, le genre lu dans la clé par `dfGenreVue` (suite ôtée, vue mère d'un détail) ; même disposition que le document entier, le lâcher passe par le même calcul. 1 essai.
  - [x] Tableau des impédances contrôlées au plan de fabrication (classes à Z cible du gestionnaire de contraintes).
  - [x] Export DXF pour la mécanique (`editeur-pcb/js/33-draftsman-export.js`) : R12 (AC1009) en mm ; carte seule à 1:1 dans le repère des Gerber (contour et découpes en LINE/ARC, arcs facettés retrouvés, un CIRCLE par trou métallisé / non métallisé, encombrement et repères par face, cotes, tableau de perçage) et feuille entière lue dans la liste d'objets (calques par `dfCalque`, catégorie ou place) ; boutons dans la fenêtre, `-CARTE.dxf` et `-PLAN-FABRICATION.dxf` dans `fabrication.zip`.
  - [x] Fonte embarquée : PlansSans (Liberation Sans OFL, pré-réduite par `outils/fonte-plans.py`, 80 Ko dans `js/fontes/plans-sans.js`), sous-ensemble des glyphes employés à chaque PDF, CIDFontType2 / Identity-H / ToUnicode (Ω, ≤, ≥ cherchables) ; option cochée par défaut, repli Helvetica. 8 essais (`harness.js`), vérifiés par pdftotext, pypdf et ezdxf.
  - [x] Master Drawing en fonte PlansSans embarquée (TrueType simple : ASCII en clair, accents et symboles sur codes libres, ToUnicode ; µm, ±, ≥, °C, εr cherchables), même option et même sous-ensembleur que les plans ; repli Helvetica WinAnsi. DXF carte : un calque par outil (`TROUS_PTH_<Ø>`, `TROUS_NPTH_<Ø>`, `VIAS_<Ø>`, `VIAS_L1-L2_<Ø>`, `CONTRE_PERCAGE_DESSOUS_<Ø>`) avec un POINT par trou et une couleur par diamètre, cercles gardés sur les calques historiques. 6 essais.
- [x] **Dossier mécanique** (15/10/2026, spec `SPEC-dossier-meca.md`) : pour concevoir le boîtier, `<projet>-MECA.zip` = plan mécanique PDF (vue de dessus cotée, vues de face et de côté, fixations, ouvertures, hauteurs), JSON pour une IA (`web_cao-meca-1`) et DXF 1:1 (corps par face et par hauteur). Calcul commun `commun/dossier-meca.js` ; éditeur PCB (feuille et bouton dans Plans, tableau des hauteurs et ouvertures, `dessin.meca`) et visionneuse (bouton « Dossier méca »). Hauteurs : saisie, `<Package height>` du fichier, sinon « Maximun Height » de la LIB. Lecteur IPC-2581 1.82 (`<Package height>` et `<Outline>`, recopié dans WEB_ANTENNA) ; l'export IPC écrit la hauteur.
  - [ ] À vérifier sur une vraie carte : un fichier eCADSTAR porte-t-il `<Package><Outline>` et `height` ? Sinon les corps sont estimés d'après les pastilles.
  - [ ] La chaîne IPC de la visionneuse ne lit pas `populate="false"` : les non-montés d'un fichier y sont montés (dossier méca compris).

- [x] **Gestionnaire de contraintes** (`editeur-pcb/js/30-contraintes.js`, modèle dans `01-core.js`, 10/10/2026) : tableur Nets / Classes / Paires / Groupes d'appariement / Isolation entre classes, mesure à côté de chaque contrainte (longueur, délai, vias, Z₀) ; contraintes de net ou héritées de la classe (Z cible et tolérance, longueur min / max, vias max, couches permises) ; largeur pour Z cible couche par couche ; groupes en longueur ou en délai, cible du serpentin ; matrice d'isolation classe × classe appliquée au routeur, au DRC, aux zones et aux Gerber ; écarts au DRC ; export CSV ; tableau des impédances contrôlées au plan de fabrication. La visionneuse IPC-2581 et `commun/` ne sont pas touchés. 10 essais (`harness.js`).
  - [x] Saisie des contraintes dans le schéma (`editeur-schematique/js/27-contraintes.js`, règles communes `commun/contraintes.js`) : tableau des nets nommés, groupes d'appariement, section du panneau Propriétés ; reprises par le PCB à l'ouverture du gestionnaire, par l'ECO (ligne « Contraintes ») et à l'export ⇉ PCB, gardées à part (`contraintes.schema`), le PCB passant devant champ par champ. 3 essais schéma, 3 essais PCB.
  - [x] Topologie : une piste qui traverse une pastille du net sans s'y arrêter s'y raccorde.
  - [x] Largeur de classe par couche (`wL`, `classWidth`) : le routeur prend celle de la couche active et en change au via, le DRC et « aligner sur la classe » la suivent, la largeur pour Z cible se pose couche par couche ; report quand le nombre de couches change. 4 essais.
  - [x] Topologie (point à point, chaîne avec ordre imposé, étoile à branches égales, fly-by terminé) et moignons (dérivation, point de test, bout libre, moignon de via) par net ou par classe (`editeur-pcb/js/31-topologie.js`) ; onglet « Topologie et moignons », DRC, CSV. 7 essais sur cartes construites.
  - [x] Contre-perçage (back-drill) décrit dans l'empilage (`stack.cp` : face, couche à ne pas couper ou auto, surperçage, moignon résiduel), pris par un via, un net ou une classe (`cp`) ; `cpVia` ramène le moignon au résiduel dans la topologie / DRC, la simulation SI/RF (`contre_percage`) et la vérification de la carte (`cp`) ; contre-perçage impossible signalé au DRC. 3 essais (`harness.js`), bancs ligne-mom et analyse-carte.
  - [x] Contre-perçage en fabrication : un Excellon par paire de couches (`…-BACKDRILL-B-In2.DRL`, couche à ne pas couper et profondeur en commentaire), LISEZ-MOI, feuille d'empilage, master drawing ; plan de fabrication : symboles dans la vue de la carte (et ses détails), tableau, passe sur la coupe, note.
  - [x] Contre-perçage dans la visionneuse IPC-2581 (`ipc2581_parser` 1.76) : `<Spec><Backdrill type=START_LAYER|MUST_NOT_CUT_LAYER|MAX_STUB_LENGTH>` et `<SpecRef>` du trou (forme de l'export KiCad), foret à part rattaché à son via ; cercle orange, fiches du via, compte au panneau ; `contre_percage` et `cp` envoyés au serveur comme l'éditeur. Carte d'essai `visionneuse-ipc2581/test/carte-contre-percage.xml`.
  - [x] Couches empruntées par une zone du net (`viaZones` de `computeConn`) : le foret ne doit pas les couper (faute DRC), le mode auto s'y arrête. Au passage, `zoneMask` applique désormais les découpes de zone comme le dessin (un via dans une découpe n'est plus relié au plan).
  - [x] Contre-perçage en Gerber X2 à côté du `.DRL` inchangé : `%TF.FileFunction,NonPlated,i,j,Blind,Drill*%`, `%TA.AperFunction,BackDrill*%` (comme KiCad ; pas de fonction de fichier dédiée dans la norme), profondeur, couche gardée et moignon en attributs utilisateur.
  - [x] Le Master Drawing liste le Gerber X2 du contre-perçage sous son Excellon.
  - [x] **Export IPC-2581 révision C** de l'éditeur (`editeur-pcb/js/35-ipc2581-export.js`) : empilage (εr, tan δ, rugosité), couches et portées de perçage, contour, empreintes, composants, nets, pistes, arcs, vias, zones remplies, sérigraphie, nomenclature et variante, contre-perçage en `<Spec><Backdrill>` ; bouton du menu Fichier et `<projet>.xml` dans `fabrication.zip`. Aller-retour par la chaîne de la visionneuse (`editeur-pcb/test/banc-ipc2581-export.py`, en CI) et conformité au XSD IPC-2581C. Lecteur 1.78 : la place d'un `<Text>` lue dans son `<Features>` (XSD).
  - [x] **Export IPC-2581 : classes, paires différentielles et contraintes** (11/10/2026) : `<LogicalNet netClass netPair>` + `<NonstandardAttribute>` NET_CLASS / DIFF_PAIR / DIFF_PAIR_POLARITY + `<SpecRef>` ; une `<Spec>` par classe, net contraint, paire, groupe d'appariement et pour la matrice (`<General type="ELECTRICAL">` à `<Property>` nommées, `<Impedance>` normalisée avec `<SingleEnded>` / `<EdgeCoupled>` par couche de signal) ; `<Set netPair>`. Rugosité de Huray sous `SURFACE_ROUGHNESS_UPFACING` en propriétés nommées (plus de type OTHER). Lecteur 1.79 (`regles`, `rug_huray`) ; la visionneuse reprend classes et paires du fichier comme classement initial (devant la détection, derrière la main), nomme la partenaire d'une paire et envoie Huray au serveur. Conformité XSD IPC-2581C vérifiée. À recopier dans WEB_ANTENNA : `python/ipc2581_parser.py`.
  - [x] Export IPC-2581 : la classe d'un net sans broche part (12/10/2026) — pas de `<LogicalNet>` (le XSD y exige un `<PinRef>`), la `<Spec>` de sa classe le nomme en `<Property name="MEMBER">` ; lecteur 1.80 (`_ranger_regle`), le `NET_CLASS` d'un `<LogicalNet>` restant devant. Essais `harness.js`, `banc-ipc2581-export.py` (aller-retour), `banc-essai.py`. À recopier dans WEB_ANTENNA : `python/ipc2581_parser.py`.
  - [x] Visionneuse : « portée percée de tous les vias déclarés » activée par défaut (12/10/2026) ; décochée, la fiche d'avant revient à l'identique (essai révisé, `harness-sim.js`).
  - Validation sur de vrais exports Altium / Allegro (contre-perçage, règles) → *Bancs de test et validations externes*.

- [x] **Rooms** (`editeur-pcb/js/32-rooms.js`) : les blocs du schéma (zones étiquetées) encadrés sur la carte comme les rooms d'Altium — cadre, fond teinté, étiquette ; un clic sur l'étiquette prend le bloc ; Affichage → Rooms ; lus dans le document du schéma (session ou projet), à défaut dans l'analyse « Motifs & Blocs ». Remplacent les pastilles de couleur. 3 essais.

### Simulation SI (Signal Integrity)
- [x] **Pertes conducteur** (`ligne_mom.line_losses`, v2.7.0, 10/10/2026) : l'ancien `Rs/(2·Z0·w)` ne comptait que le ruban ; remplacé par l'inductance incrémentale de Wheeler (ruban et plan(s) reculés séparément, Hammerstad-Jensen corrigé de l'épaisseur pour le microruban, Wheeler 1978 pour la triplaque, résistance continue en quadrature). Validé : coaxiale exacte, plaques parallèles, Pucel ±8 %, exemple de Pozar ±5 %. Inchangé à 50 Ω en microruban (les oublis se compensaient) ; ×0,64 sur un microruban 87 Ω, ×1,30 sur un 26 Ω, ×0,70 en triplaque étroite. `modele_conducteur="ancien"` rend l'ancien chiffre.
- [x] **Options de `ligne_mom` 2.7.0 branchées** (`simulation_em` 5.0.0, `rf_reseau` 1.6.0, `crosstalk` 4.2.0) : hauteur et topologie passées aux pertes (actif, +0,07 à +0,6 %) ; rugosité par cuivre dans l'empilage physique (préréglages lisse / ED / RTF / VLP / HVLP / Huray, `stack.cu[i].rug`), lisse par défaut ; diélectrique causal (case de l'empilage, εr(f) aussi dans la phase), désactivé par défaut ; via en ligne, défaut « auto » (π au bit près sous 0,3 rad de phase) ; visionneuse : rugosité lue dans les `<Spec>` IPC-2581 (parseur 1.77).
- [x] **Mutuelle des fûts de la paire différentielle** (Grover par l'énergie, retours par symétrie, C_m écrantée) : L − M en mode impair, L + M en commun ; `s_diff.vias_mutuelle`.
- [x] **Double dispersion corrigée** (`simulation_em` 5.0.1) : la cascade repassait à Getsinger l'eps_eff déjà dispersé au point central (microruban seulement, défaut antérieur) ; elle part maintenant du couple statique.
- [x] **Rugosité propre du plan de référence** (`ligne_mom` 2.8.0 `rugosite_plan`, `simulation_em` 5.2.0, `rf_reseau` 1.7.0, `crosstalk` 4.3.0) : lue sur la couche du plan ; un plan qui ne déclare rien prend celle de la piste (résultat d'avant au bit près).
- [x] **Visionneuse : diélectrique causal et modèle de via** (« Modèles de simulation », gardés par fichier).
- [x] **Essais shove robustes** : le budget de la poussée compte le travail fait (`PNS_SHOVE_TRAVAIL`), l'horloge n'est plus qu'un garde-fou à 250 ms ; plus d'échec sous charge.
- [x] **Rugosité du plan dans la paire** (`simulation_em` 5.4.0) : `_cascade_differentielle` lit la rugosité propre du plan sur chaque tronçon (deux modes, section dissymétrique à quatre accès, partenaire seule, surlongueur) ; un plan muet rend la paire d'avant au bit près (cas du banc de l'œil), un plan lisse déclaré sous une piste rugueuse perd moins. Éditeur : réglage « Lisse déclaré » dans l'empilage (`stack.cu[i].rug = {m, rms:0, decl:true}`, envoyé `rugosite_rms_um: 0`), 1 essai `harness.js`.
- [x] **Visionneuse : plan déclaré lisse** (12/10/2026) : une `<Spec>` qui écrit une rugosité de 0 (le « Lisse déclaré » exporté par l'éditeur) n'est plus confondue avec une absence — lecteur 1.81 (`rugosite_declaree`), `ipc2581_json` 1.2.0 (`"rug": 0`), la page envoie `rugosite_rms_um: 0` ; une face rugueuse de la même spec reste devant. Essais `banc-essai.py`, `harness-sim.js`, aller-retour de l'export (`banc-ipc2581-export.py`). À recopier dans WEB_ANTENNA : `python/ipc2581_parser.py` et `python/ipc2581_json.py`.
- [ ] Rugosité : jeux de Huray à confronter à des fiches de feuillard (→ *Bancs de test et validations externes*).
- [x] **Banc de mesure crosstalk** (`bancs-mesure/crosstalk/`, 10/10/2026) : carte d'essai 4 couches JLC générée (6 cas avec le 4b, lignes d'étalonnage), prévisions WEB_CAO, comparaison à SIwave et à l'oscilloscope préparées. La fabrication et la mesure sont suivies dans *Bancs de test, cartes d'essai et validations externes*. Constats faits en y passant la carte, tous corrigés dans l'outil :
  - [x] **la règle *diaphonie* de « toute la carte » ignorait la piste de garde** (`analyse_carte.diaphonie`, 11/10/2026) : sa section n'avait que les deux pistes du couple, et `joue` écartait la masse. Elle pose maintenant dans la section tout ce qui longe le couple sur la même couche (`intercales`) : une garde (classe Masse / net de référence) à 0 V si ses vias (`percages`) la cousent au pas λ/10 du front global, FLOTTANTE sinon (elle transfère, le NEXT remonte), une voisine de signal avec son port — le même chemin que `crosstalk._matrices_bloc`. Cas 3 : 0,58 % / 0,43 % par les deux outils (banc : écart < 3 %). Les paires portent `gardes`, `gardes_flottantes`, `voisines` ; le constat nomme la garde et son état.
  - [x] **S = 3W pile sur le seuil** (`crosstalk` 4.4.1) : l'égalité est retenue, et 2 % au-dessus (`TOLERANCE_SEUIL`, les arrondis d'export) ; un couple écarté à moins de 1,5 × le seuil (`PRESELECTION_PROCHE`) le dit « écartée par la présélection (S = … ≥ seuil …) » dans sa fiche, dans un avertissement et dans `etape0.ecartes_proches`, avec le geste (distance max). Même règle dans `analyse_carte` (seuil max(5 H, 3 max(W, H)), `bilan.ecartes_proches`, note). Le cas 2 se chiffre sans ouvrir la distance max.
  - [x] **`simXtFentes` / `simXtFentesIpc` voient les fentes fines** : en plus des sondes à pas (0,5 mm), chaque corde du parcours est coupée par les arêtes des zones / découpes (éditeur) ou des contours de plan, trous compris (visionneuse), de toutes les couches de plan des deux côtés, et une sonde est posée de chaque côté de chaque arête (2 µm). Une fente est bornée par ses arêtes, à sa largeur et sa position exactes (0,2 mm vu ; les bouts d'un trou sont recalés sur l'arête) ; le filtre « ≥ 1,5 pas » ne s'applique plus qu'aux trous qu'aucune arête ne borne. Champs d'avant (`s`, `longueur`, `plans`, `quoi`) plus, depuis `crosstalk` 4.5.0, les détours `d1` / `d2`, `largeur`, `borne`, `retour`, `x`, `y` : vue, la fente AJOUTE son couplage par impédance commune du retour (option A ci-dessous).
  - [x] **la classe « RF » impose t_r = 100 ps et le dit fort** : sans front saisi, c'est une RÉSERVE (`graves`) « t_r = 100 ps imposé par la classe RF — saisissez un front ou une porteuse pour affiner », la première des hypothèses, et `front_impose` pour la page (alerte à côté du t_r dans le résumé, ligne ATTENTION du rapport texte). La porteuse RF du panneau (`porteuse_rf`, envoyée par `simXtReglages`) donne alors t_r = 0,35 / f comme dans la vérification de carte. `analyse_carte` note les nets RF jugés sans porteuse (`bilan.front_rf`).
  - [x] **Cas 4b ajouté** (repère J5x, `generer-carte.js` option `fente.couches`) : la même fente sur **L2 seulement**, L3 et Bottom intacts. La carte passe de 176 à 204 mm, toujours routée et sans remarque au DRC. WEB_CAO le chiffre (retour sur L3 : NEXT +50 % à 1 ns sur le cas 2, borne du niveau 2, sans terme de détour) alors que le cas 4 reçoit depuis la 4.5.0 le terme d'impédance commune d'Ott (≈ +11 % à 1 ns) ; la mesure dira lequel a raison. Il départage les options A et B ci-dessous. `carte.png` est à refaire (elle montre encore 5 cas).
- [x] **Crosstalk : simuler les fentes du plan de référence** (couplage par impédance commune du retour). Jusqu'à la 4.4.0, une fente sous l'agresseur et la victime était détectée, avertie, et n'ajoutait rien : le NEXT / FEXT restait celui des lignes couplées. Estimation (Ott) pour le cas 4 du banc (fente de ±10 mm coupant L2, L3, Bottom, entraxe 1,4 mm) : self du détour ≈ 16 nH, mutuelle ≈ 11 nH, soit **≈ 10 % à chaque bout de la victime à 1 ns** (≈ 2 % à 5 ns), contre 0,9 % calculé. Options :
  - [x] **A — impédance commune analytique (Ott), avec fourchette** (`crosstalk` 4.5.0, 11/10/2026) : pour une fente franchie par l'agresseur et la victime, self du détour et mutuelle (L_d = μ0/π · 2d · ln(2d/W), M de même avec l'entraxe au franchissement, deux détours en parallèle), f.é.m. M · dI/dt partagée en +NEXT / −FEXT au front t_r, lissée par τ = L_d/2Z0 (le terme ne dépasse pas M/L_d) ; fourchette entre mutuelle basse (entraxe compté depuis le bord d'un retour étalé sur W + 2H) et haute (M = L_d, l'option E). La page envoie d1 / d2, la largeur, `borne` et `retour` (les plans qui ferment encore le retour) avec les fentes du crosstalk (`simXtFentes`, `simXtFentesIpc`, même mesure que le RF) ; le terme est dans `crosstalk.py` (`impedance_commune_fente`, `termes_fentes`, `ajouter_fentes_niveau2` : valeur centrale, fourchette, statut, texte, pic sur la carte locale) et dans la règle *diaphonie* d'`analyse_carte` (fentes lues dans l'image des plans sous la portion en regard). Cas 4 du banc : +10,97 % à 1 ns, fourchette 9,2 à 16,7 % (`bancs-mesure/crosstalk/README.md`). Le cas 4b (fente sur L2 seule, L3 intact) n'a PAS ce terme : le calcul garde le retour sur L3 et la fiche le signale — c'est l'objet de la mesure. Limites, dites dans la fiche : fente droite franchie à peu près perpendiculairement, tous les plans de retour coupés, pistes à plat.
  - [x] **C — résonance de la fente** (même version), en complément de A : terme tan(βd)/βd et perte Q ≈ 50 de `rf_reseau.z_fente`, appliqué à chaque détour au genou 0,35/t_r ; négligeable à 1 ns (× 1,01), sensible sous ~300 ps (× 30 à 100 ps sur la fente de 20 mm, quart d'onde vers 3,5 GHz dans le FR-4) ; la fiche dit quand elle a pesé.
  - [x] **B — le courant de retour résolu autour de la fente (PEEC)** (`crosstalk` 4.6.0, 13/10/2026) : la page envoie avec chaque fente l'image du cuivre des plans autour du franchissement (`simXtImageFente`, commun ; lignes à v constant coupées aux arêtes exactes, de chaque côté jusqu'au premier plan qui ferme le retour, vias de masse) ; le serveur y pose un maillage gradué (3000 branches au plus), selfs et mutuelles partielles de rubans minces (distance moyenne géométrique exacte), capacité entre plans, frontière absorbante de la cavité, vias en branches verticales, agresseur et victimes pris dans leur cuivre ; résolu au genou, cuivre réel moins plans pleins → L_d et M dans la formule du terme. Microruban retrouvé (0,39 nH/mm), convergé à 0,4 %. **Cas 4 : 4,4 nH de détour et non 16,8** (deux bords d'une fente étroite, courants opposés) → +3,7 % au lieu de 11 % ; Ott reste la borne haute de la fourchette. **Cas 4b : un terme enfin** (+0,97 %), plus petit avec des vias de masse. Six fentes résolues par analyse (les plus grandes), Ott au-delà. Même résolution dans la règle *diaphonie* d'`analyse_carte`, une par couple et par fente.
  - [x] **Limites de l'option A, levées pour une fente imagée** : forme et angle quelconques, plans partiellement coupés, **victime superposée** (couche voisine, aussi dans la règle *diaphonie*), entraxe lu dans le cuivre de la victime au franchissement et non dans le profil d'espacement.
  - [x] **Garde de la règle *diaphonie*** : un document sans aucun perçage n'a pas mesuré la couture, la garde y est supposée tenue — comme `crosstalk.py` d'une couture nulle — et une note le dit (`bilan.diaphonie.gardes_couture_supposee`) ; avec des perçages mais aucun sur la garde, elle reste flottante.
  - [ ] **D — référence pleine onde externe** (openEMS, SIwave SYZ / HFSS) pour valider A / B, pas comme fonction de l'outil (→ *Bancs de test et validations externes*).
  - [x] **E — borne haute seulement** (M = L du détour) : couverte par la borne haute de la fourchette de A (`crosstalk` 4.5.0), plus de version séparée à faire.
- [x] **Mode différentiel dans la cascade de paramètres S** :
  - Calcul complet des paramètres S en mode mixte (*Mixed-Mode S-Parameters*) dans `python/simulation_em.py` (`_cascade_differentielle`) : mode différentiel pur $S_{dd}$ ($S_{dd11}, S_{dd21}$ sur $Z_{ref,diff}$ ex: 100 Ω ou 90 Ω), mode commun $S_{cc}$ ($S_{cc11}, S_{cc21}$ sur $Z_{ref,comm} = Z_{ref,diff}/4$ ex: 25 Ω), et conversion de mode CEM $S_{cd21}(\omega)$ calculée à partir du skew $\Delta L = |L_+ - L_-|$.
  - Interface dédiée dans l'onglet « Z différentielle » (`commun/simulation-em.js`) avec sélecteur interactif `[ Sdd ]`, `[ Scc ]`, `[ Scd ]`, courbe SVG multi-traces avec seuil CEM à $-20\text{ dB}$, repère de fréquence centrale $f_0$, lecture dynamique au survol et export Touchstone différentiel `.s2p`.

- [x] **Diagramme de l'œil** (onglet SI, `python/oeil.py`, route `/api/oeil`) : œil PRBS et pire cas, gabarits par protocole (USB 2.0/3.x, PCIe 1–3, HDMI, LVDS, MIPI D-PHY, SATA, SGMII, SPI, QSPI, SD, eMMC), égaliseur de référence, marge, export CSV.
- [x] **Œil : gabarits vérifiés** — PCIe Gen 2 et Gen 3 recoupés (valeurs inchangées, jugés à 10⁻¹²), SATA Gen 1–3 recoupés (largeur 1 − TJ : 0,49 / 0,43 / 0,43 UI, en losange) ; gabarits dérivés rattachés aux récepteurs réels (SN65LVDS32, D-PHY 70/40 mV).
- [x] **Œil : gigue et diaphonie** — œil statistique (RJ, DJ double Dirac, bruit), contours de taux d'erreur, baignoire, marge au taux visé ; agresseurs bornés dans le pire cas, repris de `crosstalk.py`.
- [x] **Œil : modèles IBIS** (`python/ibis.py`) — lecteur .ibs, tampon émetteur et diodes du récepteur simulés pas à pas contre le canal ; vias et coudes de la paire dans la cascade différentielle (`simulation_em` 4.4.0).
- [x] **Œil : boîtier IBIS** (`oeil` 2.1.0, `ibis` 1.1.0) : [Package], [Pin], diagonale de [Package Model] fondus dans la cascade die ↔ broche, émetteur et récepteur ; choix de broche dans l'interface. **[Diff Pin]** : modèle et boîtier par broche, tdelay entre brins, vdiff en seuil.
- [x] **Paire simulée brin par brin** (mode commun reconstruit des S_cc) : mode commun au récepteur, conversion en dB, courbe, œil comparé à la paire rendue symétrique.
- [x] **IBIS-AMI** : `.ami` lu et montré, égaliseur de référence réglable d'après ses paramètres ; le modèle AMI (binaire du fabricant) n'est pas exécuté.
- [x] **Exécution IBIS-AMI** (`ibis` 1.3.0 `ModeleAmi`, `oeil` 2.3.0 `executer_ami`, `web_CAO` 2.22.0) : bibliothèque du fabricant exécutée par ctypes selon IBIS 7.x (AMI_Init, AMI_GetWave par blocs, AMI_Close) — réponse impulsionnelle du canal → Init de l'émetteur → canal → Init/GetWave du récepteur ; paramètres In/InOut du `.ami` surchargeables, Out rendus dans la fiche ; seul un fichier désigné sous la LIB ou un projet s'exécute, tout échec est un avertissement et un repli sur l'égaliseur de référence. Modèle d'essai en C (`python/test/ami_test/`, FFE 2 coefficients, compilé à la volée) concordant avec la FFE interne à 10⁻⁴.
- [x] **Condensateurs de liaison (couplage AC)** (`oeil` 2.3.0 `couplage_ac`) : C par brin, ESR, ESL du boîtier, côté émetteur ou récepteur, dans la cascade simple, les deux modes et la paire par brin ; coupure basse f_c = 1/(2π·C_x·(Z_tx+Z_rx)), droop des longues suites dans le pire cas et le PRBS, continu de l'IFFT corrigé quand la fenêtre ne couvre pas τ ; sans condensateur, l'œil d'avant au bit près. Champs dans l'onglet SI / œil.
- [x] **Gabarits** : USB 2.0 Template 2 passe « recoupé » (la spécification USB 2.0 est publique ; figure 7-15, six points concordants, de mémoire), HDMI 1.4 TP2 passe « dérivé » (norme et CTS sous accord, forme usuelle du masque de puits TMDS + sensibilité 150 mV). Plus aucun gabarit « à vérifier ».
- [x] **Paire dissymétrique en cascade à quatre accès** (`simulation_em` 5.2.0) : largeurs ou écarts différents, via ou coude sur un seul brin, partenaire sur une autre couche, surlongueur sur le brin le plus long (nommé) ; Sdd, Scc, Scd, Sdc exacts ; une paire symétrique reste au bit près. L'œil l'emploie, tampons IBIS compris.
- [x] **Boîtier IBIS** (`ibis` 1.2.0, `oeil` 2.2.0) : mutuelles de `[Package Model]` entre les broches d'une paire comptées ; boîtiers par sections (`Len=`, `Fork`) en lignes RLGC ; modèle et coin du brin inverse dans l'interface.
- [x] **Œil 2.4.0, IBIS 1.4.0, `simulation_em` 5.5.0** (12/10/2026) — le reste de l'œil, fait :
  - [x] **Mutuelles du boîtier vers les broches voisines** : voisines au repos, fermées sur 50 Ω aux deux bouts (POWER/GND en court-circuit, NC ouvertes), éliminées par réduction de Kron (`ibis.abcd_boitier_couple`) ; case « voisines » de la page. Les mutuelles « entre sections » n'existent pas : `[Number Of Sections]` et `[Model Data]` s'excluent (BIRD 54).
  - [x] **Via sur le brin N seul** : posé à son abscisse, modèle du via de la piste de mêmes couches (retourné si besoin), sinon ramené à sa hauteur, sinon plancher ; le cas miroir de P rend le même Scd21 à 5 %.
  - [x] **Brins superposés sur deux couches** : couplés en large face (`ligne_mom.section_deux_niveaux`) sur leur recouvrement, sans plan entre les couches ; une paire déclarée qui ne longe nulle part à plat est reconnue.
  - [x] **AMI_GetWave de l'émetteur** : la stimulation passe par lui puis par le canal brut ; un Rx à Init seul derrière lui est réinitialisé sur le canal brut.
  - [x] **Horloge récupérée imposée** : instants + bit/2 (BIRD 214), phase moyenne pour le pire cas et le statistique, chaque bit PRBS à son instant ; fiche `horloge_ami`.
  - [x] **AMI sur tampons IBIS non linéaires** : le GetWave du Rx reçoit la forme d'onde non linéaire de la broche, l'égalisation du Tx ajoutée par le canal linéarisé (hypothèse LTI de la norme).
  - [x] **Couplage AC** : pôle lent séparé dans les chemins linéaires (décharge exacte : 4·10⁻⁴ quand T_w ≈ τ, contre 4 %), pont diviseur de la paire par brin sans terminaison.
  - Essais : 7 nouveaux dans `banc-oeil.py` (faux modèle AMI en Python pour le flot, la bibliothèque compilée reste essayée en CI). Restent dans *Bancs de test et validations externes* : gabarits USB 2.0 Template 1 et 2, HDMI 1.4, ordre des sections IBIS, vrai modèle AMI.

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
- [x] **Classes d'interface** (13/10/2026, spec : `SPEC.md`) : USB FS / HS, ETH 100 / 1000, LVDS, CAN, RS-485, posées **à la main** dans le schéma, le PCB ou la visionneuse (aucune heuristique de nom). Chacune porte son front, sa cadence et la Z_diff de sa norme (`crosstalk.INTERFACES`, même table que `commun/classes-interface.js`, comparées par le banc crosstalk) et se range dans une famille (Rapide, Lent) qui décide des règles. Pas de Z₀ de brin par défaut : une interface ne tient une impédance que si le panneau lui en donne une. La règle *paires* juge chaque paire face à la Z_diff de sa classe (`zdiff_classes`) : USB à 90 Ω et Ethernet à 100 Ω cohabitent. Une interface n'entre dans les réglages, donc dans le rapport, que si un net la porte : sans elle, le rapport d'avant à l'octet près. Constat d'origine résolu : un ETH 100 jugé à 3 ns n'est plus condamné par la règle de retour à 30 mm. Reste à vérifier sur la vraie carte TRD1_N.
- [x] **Classes d'interface, suites** (relevées à la revue du 13/10/2026, faites le 14/10/2026) : (1) une classe qui porte le nom d'une interface — une carte ANCIENNE a pu appeler une classe « CAN » ou « LVDS » — est jugée comme elle, et le rapport de vérification le dit dans ses notes (« Classe « CAN » jugée comme l'interface CAN (ISO 11898) : famille Lent, front 50 ns, Z_diff 120 Ω »), sans bloquer ; (2) une interface créée sur la carte prend les règles de la classe de sa famille si la carte l'a (une classe Rapide réglée à 0,15 / 0,30 passe devant les 0,25 / 0,25 de `SCH_CLASSES.Rapide`), comme une famille Lent prend la classe par défaut ; (3) `autoPairs` crée aussi la paire du schéma entre deux nets de la même classe d'interface : USB FS, CAN, RS-485 (famille Lent) n'ont plus à être posées à la main ; deux interfaces différentes ne s'appairent pas.

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
