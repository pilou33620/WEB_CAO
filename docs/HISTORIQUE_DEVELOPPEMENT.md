# Historique des développements, audits et notes techniques

> **Archive de référence (août 2026 – 22 octobre 2026)**
> Ce document regroupe l'historique complet des chantiers réalisés, les audits de validité physique, les dérivations mathématiques (solveurs SI/PI, MoM 2D et 2.5D, formules de Grover, Bogatin, Gupta, etc.), les post-mortems de bugs et les cas de validation.
> Pour le carnet de route et les tâches en cours ou à venir, consulter [A-FAIRE.md](../A-FAIRE.md). Le carnet de route d'avant le 22/10/2026 est à la fin de ce fichier.

---

Ce qui est *assumé* comme absent — auto-routeur, sauvegarde disque automatique —
n'est pas ici : c'est dans les « Limites connues » de
[editeur-pcb/README.md](editeur-pcb/README.md#limites-connues) et
[editeur-schematique/README.md](editeur-schematique/README.md#limites-connues).

Ce qui en sort est retiré d'ici et documenté là où il vit. **Fait :** l'outil de
mesure et la recherche par repère, dans les deux éditeurs
(`commun/reperage.js`) ; le fichier de placement et la nomenclature côté PCB
(`positions.csv`, `bom.csv`, dans `buildFabFiles()`,
[editeur-pcb/js/04-fabrication.js:839](editeur-pcb/js/04-fabrication.js:839)) ; le
cross-probing schéma ↔ PCB, en trois morceaux — le saut par changement d'outil
(`pcbSonde`/`schSonde` et `sessAller()`), le même geste entre deux onglets
ouverts côte à côte (`sessMontrerAilleurs()`/`sessEcouterProbe()`, un
`BroadcastChannel`, bouton « ⇱ Montrer » et touche `L`), et le phare qui
désigne l'arrivée sur le PCB (`rpPhare()`,
[editeur-pcb/js/18-reperage.js](editeur-pcb/js/18-reperage.js)) — le tout dans
[commun/session.js](commun/session.js), documenté dans
[README.md](README.md#passer-dun-outil-à-lautre-sans-rien-perdre) ; l'Excellon
par portée de via, nommé en couches comptées à partir de 1, avec sa légende au
LISEZ-MOI et au master drawing (`drillFile()`,
[editeur-pcb/js/04-fabrication.js:514](editeur-pcb/js/04-fabrication.js:514)),
et la nature d'un via — traversant, borgne dessus/dessous, enterré — choisie au
panneau Propriétés, sur un via comme sur toute une sélection (`viaSetKind`,
[editeur-pcb/js/01-core.js:340](editeur-pcb/js/01-core.js:340)).

## État des lieux au 2026-09-05

Ce que le dépôt fait tourner, et ce qui le mesure. **Plus de 1 200 essais, tous
passés.**

| Partie | État | Ce qui la mesure |
| --- | --- | --- |
| Éditeur PCB — géométrie, routage, DRC, fabrication, coplanaire, santé, pinout, empreintes | en service | 660 essais, [editeur-pcb/test/harness.js](editeur-pcb/test/harness.js) |
| Éditeur schématique — bus, feuilles hiérarchiques, distributeurs, pinout, motifs | en service | 108 essais, [editeur-schematique/test/harness.js](editeur-schematique/test/harness.js) |
| Visionneuse IPC-2581 | en service ; **arcs comptés, parcours chaîné, chevelu du retour, pastilles devinées avouées, sélection à plusieurs morceaux** | 123 essais ([harness-sim.js](visionneuse-ipc2581/test/harness-sim.js)) + 46 ([banc-essai.py](visionneuse-ipc2581/test/banc-essai.py)) |
| **SI — impédance** (`ligne_mom`) | en service, 0,3 à 0,4 % contre les étalons ; **vias : boucle de retour, antipads, moignons, traversée de plans** | 170 cas, [banc-ligne-mom.py](python/test/banc-ligne-mom.py) |
| **SI — Z différentielle** (`solve_multiline`) | **en service**, moins de 3 % contre Garg-Bahl ; N conducteurs dans UNE section, masse coplanaire et pistes de garde comprises | 170 cas |
| **SI — couplage** (`crosstalk`) | **en service** ; l'onglet Diaphonie a été RETIRÉ le 2026-09-02, le crosstalk répond seul — combien (%, dB, **volts**) et où | 45 cas, [banc-crosstalk.py](python/test/banc-crosstalk.py) |
| **PI — chute DC** (`dc_solver`) | **en service** ; alimenté en direct par l'estimation automatique des courants schéma | 42 cas ([banc-dc.py](python/test/banc-dc.py)) + [banc-trois-ponts.js](editeur-pcb/test/banc-trois-ponts.js) |
| **Scoring placement & Rotation assistée** (`pcb_scoring`) | **en service** ; HPWL, congestion, découplage HF, Tiers 1-4, rotation anti-croisements | 7 cas ([banc-pcb-scoring.py](python/test/banc-pcb-scoring.py)) + [banc-trois-ponts.js](editeur-pcb/test/banc-trois-ponts.js) |
| **Reconnaissance de motifs & DRC** (`pattern_recognition`) | **en service** ; LDO/Buck/Boost, I2C, SPI, UART, quartz, RC, déduction DC & netclasses | 5 cas, [banc-patterns.py](python/test/banc-patterns.py) |
| Moteur 2,5D pleine onde (`mom_solver`) | **port vertical fait ; ε_eff dé-embarqué à 0,93 % de `ligne_mom`** | 56 essais, [mom_solver/tests/](mom_solver/tests) |
| Passerelle MCP, projets, profils, repérage, cross-probing | en service | — |

**Les chantiers qui comptent, dans l'ordre :**

1. ~~**`ligne_mom` à N conducteurs**~~ **FAIT le 2026-08-31**, et il a bien
   débloqué les deux d'un coup. `capacitance_coplanaire` assemblait déjà la
   matrice multiconducteurs ; il ne manquait que la généralisation du second
   membre — N résolutions au lieu d'une, la matrice de Maxwell [C], puis
   [L] = μ₀ε₀[C₀]⁻¹. **Z différentielle et diaphonie sont deux onglets de la
   famille SI**, qui lisent la même section résolue une seule fois. Détail
   plus bas : « `ligne_mom` à N conducteurs » ;
2. ~~**le crosstalk localisé**~~ **FAIT le 2026-09-01** : l'onglet Diaphonie
   disait COMBIEN une voisine prend, il ne disait pas OÙ ce couplage se
   fabrique. Une matrice S multi-ports — **synthétisée depuis le design**, en
   mettant la même section droite en cascade — passée en temporel par IFFT,
   puis convertie en positions, et **recoupée avec le profil d'espacement**
   mesuré sur le tracé. Deux étapes zéro qui restent deux, et le plan de
   masse contrôlé à côté du couplage et jamais dedans. Détail plus bas :
   « Le crosstalk localisé » ;
3. ~~**deux réponses pour une seule question**~~ **RÉGLÉ le 2026-09-02** :
   l'onglet **Diaphonie a été retiré**, code, carte, tests et docs compris, et
   « Crosstalk » répond seul au couplage. Les deux répondaient à « combien ma
   voisine prend-elle » par deux physiques — ici une section droite unique et
   des coefficients de couplage faible, là une matrice S multi-ports mise en
   cascade puis passée en temporel — et rien ne permettait d'arbitrer un
   désaccord entre elles. La seconde rend le même « combien » ET le « où ».

   **Ce que le retrait a emporté** : côté serveur `emis`, `recu`, `scan`,
   `chaleur_voisins`, `terminaisons`, les seuils du balayage, l'étalement du
   bruit sur les tronçons et les avertissements de couplage faible
   (`simulation_em` 4.0.0) ; côté solveur `coefficients_couplage`,
   `bruits_depuis_coefficients`, `diaphonie`, `diaphonie_terminee` et
   `reflexion` (`ligne_mom` 2.5.0) ; côté page l'onglet, sa fiche, ses deux
   modes et la carte de chaleur du bruit peinte sur les voisines. La carte de
   Z différentielle par tronçon **reste**, réduite à ce qu'elle porte encore.

   **Ce que le crosstalk a gagné en échange** : le bruit **en volts**. Une
   rangée « Signal » porte l'amplitude de l'agresseur, le budget en pour cent
   et la marge du récepteur en millivolts ; la tension apparaît alors partout
   où le pour-cent apparaît — cases des victimes, graduation des deux graphes,
   lecture sous la réglette donc position par position, colonne « bruit » de
   l'étape 0b, verdict, `.csv` et rapport texte —, l'unité suivant l'ordre de
   grandeur (V, mV, µV). Le seuil qui juge se trace en travers des courbes.
   Ces trois champs sont les **seuls du panneau qui ne relancent rien** : le
   serveur ne rend que des rapports, et l'amplitude ne fait que les
   convertir ;
4. ~~**les courants du schéma et ponts transversaux**~~ **FAIT le 2026-09-05** :
   le moteur de reconnaissance de motifs (`pattern_recognition.py` et `23-patterns.js`)
   déduit les courants consommés (régulateurs LDO/Buck/Boost, MCU/IC, tirages I2C) et les injecte
   dans le solveur DC (`pcbSpecsComposant`). Il relie aussi les blocs fonctionnels au
   panneau de placement PCB et suggère les classes DRC (`autoClass()`). Détail plus bas :
   « Scoring de placement PCB, Reconnaissance de motifs et Rotation assistée » ;
5. ~~le port vertical du moteur 2,5D~~ **FAIT le 2026-08-30** : le port est
   un via qui relie la piste au plan de masse, et la comparaison de paramètres
   S avec `ligne_mom` — celle qui attendait ce point depuis le début — donne
   **0,93 %** sur ε_eff dé-embarqué. Ce qui reste au moteur est du confort, pas
   du blocage : voir « L'état du moteur 2,5D » plus bas ;
6. ~~**Prise en compte des arcs dans ltNet, pastilles polygonales arbitraires, et serpentins d'appariement avec simulateur de bus nommé & fermeture temporelle Setup/Hold**~~ **FAIT le 2026-09-06** :
   - **Arcs dans ltNet** : prise en compte de la longueur géométrique exacte des arcs de cercle dans `ltNet` et `mdlArcLongueur` côté éditeur PCB et visionneuse IPC-2581 (impédance et délai de propagation exacts) ;
   - **Pastilles arbitraires** : support complet des pastilles polygonales (`poly`), chanfreinées (`chamfer`) et découpes thermiques personnalisées (`thermalCutout`), avec hit-test point dans polygone, masques de vernis/pâte et export Gerber standard RS-274X (`G36`/`G37`) ;
   - **Serpentins d'appariement & timing closure** : menu interactif des options de serpentin (`amplitude`, `pas`, `côté`, `targetDelta`), et outil complet de simulation temporelle des bus synchrones (`busSkewAnalyze`, modale `busSkewModal`) intégrant calcul physique des temps de vol ($T_{flight}$), vérification formelle de Setup Slack ($\text{Slack}_{su}$) et Hold Slack ($\text{Slack}_h$), pré-réglages protocoles (SPI, QSPI, SDRAM, RGMII, DDR), détection automatique des violations de maintien (données trop rapides) et armement direct de l'outil serpentin avec l'allongement $\Delta L_{opt}$ calculé ;
   - **Simulateur de bus nommé partagé** : nouvel onglet « Bus synchrone » dans le panneau de Simulation EM commun (`commun/simulation-em.js`, famille SI), accessible à la fois dans l'Éditeur PCB et dans la Visionneuse IPC-2581. Permet de nommer le bus, de sélectionner librement les $X$ signaux de données et la ou les horloges de référence (support multi-horloges avec association dynamique par signal), de saisir à la main directement tous les paramètres temporels ($f$, $T_{cyc}$, $t_{su}$, $t_h$, $T_{co\_min}$, $T_{co\_max}$), de visualiser l'œil temporel et d'exporter les résultats au format CSV et JSON.

## Simulation électromagnétique

### Audit du 2026-08-29 : ce qui était écrit « FAIT » et ne l'était pas

**Rien de la chaîne EM ne tournait plus.** Six défauts ont été trouvés en
exécutant simplement ce que cette page affirmait, et les six sont dans du code
annoncé **fait** ici même. Ils sont corrigés, et chacun a désormais un cas de
banc — c'est l'absence de mesure, pas l'absence de travail, qui les a laissés
passer : le code était écrit, souvent bien, mais rien ne l'exécutait.

| Ce que la page affirmait | Ce que l'exécution a montré | État |
| --- | --- | --- |
| « le panneau résout la section par MoM » | `ligne_mom.py` ne s'importait plus : une fonction posée avant les `import`, et un `logging` jamais importé. **Les deux panneaux affichaient « Solveur EM indisponible »** depuis le dernier commit | réparé |
| « `simuler()` rend les paramètres S » | `_ruptures` définie **deux fois** ; l'ancienne, qui rend un entier, écrasait la neuve, qui rend un couple. `TypeError` à chaque appel | réparé |
| lot 2 : « masque de soudure, réductions exactes vérifiées » | la référence à vide gardait le masque à son εr : **ε_eff BAISSAIT** quand on vernissait la piste, et Z₀ tombait de 7,8 % au lieu de 2 à 3 %. Aucun cas de banc ne l'avait vérifié | réparé, 5 cas |
| lot 3b : « discontinuités modélisées » | trois copies des mêmes formules, trois résultats : la fiche affichait **21,28 fF** de capacité de coude là où la cascade en appliquait **0,394**. Et la cascade appelait en millimètres des fonctions écrites en mètres — inductance de via **1000 ×** trop grande | réparé, 5 cas |
| « 2ᵉ branchement DCIM **FAIT**, erreur de 9,6 % → 0,05 % » | faux : le 3ᵉ niveau faisait tomber `banc_dcim` de **25/25 à 21/25** et portait l'écart d'ε_eff du moteur de **0,49 % à 11,4 %** | **réparé le 2026-08-30** : 25/25, ε_eff revenu à 0,49 %, erreur lointaine divisée par trois |
| PI : « chute continue (IR drop) **FAIT** » | `dc_solver.py` montait son réseau sur le **périmètre** des polygones, passait à SciPy un argument retiré en 1.14, et **rattrapait l'exception pour rendre zéro volt partout** | réécrit, 16 cas |

**Ce qui n'a pas bougé et qui reste vrai** : le noyau 2,5D remis en état passe
ses essais — 38 à l'audit, **56 au 2026-08-30** —, et l'écart d'ε_eff contre
`ligne_mom` vaut bien les 0,49 % annoncés. Les deux fonctions de Green, la DCIM à deux niveaux, l'extraction du
pôle et la désingularisation polaire sont justes et mesurées.

**La leçon, et elle vaut pour la suite** : les cinq défauts silencieux étaient
tous dans du code qu'aucun banc n'exécutait. Un chantier n'est pas fini quand
il est écrit, il est fini quand un cas le mesure — et le cas doit porter sur ce
qui se trompe *sans se voir* : un signe, un ordre de grandeur, une unité.

### Contre-vérification du 2026-08-29 (2ᵉ passe)

Les six correctifs ci-dessus ont été **repris un par un et remesurés**, pas
relus. Les six tiennent. Mais la contre-vérification a trouvé **quatre restes**,
tous de la même famille que les défauts d'origine — du code ou du texte qui
affirme une chose que l'exécution dément — et tous corrigés :

| Ce qui restait | Ce que l'exécution a montré | État |
| --- | --- | --- |
| lot 3b : « une seule implémentation » | `inductance_via` et `capacite_pastille` étaient **encore définies deux fois** dans `ligne_mom`. La consolidation avait bien été écrite, l'ancien bloc n'avait pas été retiré. Python garde la dernière, donc le calcul était juste — mais la **première documentait ses arguments en millimètres** et la seconde « TOUT EN MÈTRES ». Un lecteur tombant sur la première se trompait d'un facteur mille | doublon supprimé, 1 cas de banc |
| lot 2 : « masque de soudure corrigé » | la physique de `solve_line` était bien juste (−2,53 % sur Z₀, +5,26 % sur ε_eff), mais `simulation_em.section_de_couche` **comptait le vernis déclaré deux fois** : une fois par la Green à trois régions, et une fois de plus dilué dans l'εr du **substrat**, comme si la résine était *entre* la piste et le plan. Mesure : un empilage qui **déclare** son masque voyait er tomber de 4,3 à 4,2444, Z₀ monter de 0,56 % et ε_eff baisser de 1,12 % par rapport au **même** empilage qui ne le déclare pas. Renseigner son empilage rendait donc le résultat faux | corrigé, 3 cas |
| détection de couche extérieure | le test posait la question **du mauvais côté** : il regardait `couches[indice - 1]`, la couche du côté du *plan*, pour décider ce qu'il y avait du côté de la *face*, et y cherchait du cuivre là où c'est le diélectrique qui tranche. Une piste couverte de 0,1 mm de préimprégné recevait par-dessus un vernis de 25 µm, et son préimprégné partait à la poubelle | réécrit en `_masque_exterieur`, 1 cas |
| deux docstrings contre leur propre code | `_coudes` citait encore la formule inventée que le correctif avait supprimée (`C ≈ 0,3 × W × √εr × |θ|`) ; et `trois_niveaux` était documenté « si True (**defaut**) » aux deux endroits alors que la signature dit `False` — soit exactement l'inverse de l'avertissement en tête de `ajuster_noyau_3_niveaux` | textes remis sur le code |

**Vérifié de bout en bout par HTTP**, et pas seulement par les bancs : le
serveur lancé, `GET /api/simulation` et `GET /api/simulation-dc` répondent tous
deux `dispo: true` ; un POST sur la chaîne EM rend 2 tronçons, 5 points S, la
fiche de coude à 26,07 pH / 41,55 fF — **le même chiffre que le modèle**, ce qui
était tout l'objet du lot 3b — et 12 lignes de Touchstone. Un POST sur la chaîne
DC, sur une barre de 40 × 10 mm en 35 µm parcourue par 2 A, rend **3,854 mV**
avec des bornes sur toute la largeur, contre 3,882 mV pour ρL/(Wt) : **0,72 %**,
l'écart tenant à l'endroit où l'on place le bout effectif de la barre. Avec des
contacts *ponctuels* le même problème rend 4,31 mV, soit 15 % de plus — ce n'est
pas une erreur du solveur mais la résistance d'étranglement au contact, que la
formule à une dimension ne contient pas.

**Ce que la 2ᵉ passe confirme sur la méthode** : sur les quatre restes, trois
étaient du texte qui contredisait son propre code. Un correctif n'est pas fini
quand le calcul est juste — il l'est quand plus rien alentour n'affirme le
contraire, parce que c'est ce texte-là qu'on relit six mois plus tard.

**Ce qui marche** : l'impédance. Le panneau « Simulation EM » des deux outils
envoie la section droite des tronçons sélectionnés à
[python/ligne_mom.py](python/ligne_mom.py), qui la
résout par méthode des moments, et rend l'impédance, la permittivité effective,
le retard, les pertes, puis les paramètres S de la liaison par mise en cascade.
Vérifié à 0,42 % contre Hammerstad-Jensen et à 0,30 % contre la solution exacte
en intégrales elliptiques ; **65 cas** dans
[python/test/banc-ligne-mom.py](python/test/banc-ligne-mom.py) — les quatorze
derniers couvrent le masque de soudure, les discontinuités localisées et le
passage de l'empilage à la section, qui n'en avaient aucun.

La MASSE COPLANAIRE est traitée côté par côté, plage par plage, et seulement sur
les nets déclarés comme masse — voir « Ce que la masse coplanaire suppose » plus
bas. La géométrie qui la mesure a ses propres bancs : 13 cas dans
[editeur-pcb/test/harness.js](editeur-pcb/test/harness.js) et 20 dans
[visionneuse-ipc2581/test/harness-sim.js](visionneuse-ipc2581/test/harness-sim.js).

### Quel solveur pour quel besoin, et pourquoi ce n'est pas toujours le plus général

**À lire avant d'ouvrir n'importe lequel des chantiers ci-dessous.** La question
« et si on branchait le moteur 2,5D ? » revient, et la réponse est non pour la
plupart des besoins qui restent. Ce n'est pas une préférence, c'est une histoire
de dimension.

#### « Plus général » n'est pas « plus précis »

Le moteur 2,5D voit des choses que le modèle de ligne ne peut pas voir. Il n'est
pas plus exact sur ce que les deux savent faire, et il est **moins** exact à
868 MHz.

À cette fréquence, λ_g vaut 185 mm sur du FR-4 : une piste de 20 mm en fait
0,11. La physique y est quasi-statique — il n'y a rien à voir que Z₀ et ε_eff —
et [ligne_mom.py](python/ligne_mom.py) ne l'approche pas, il la résout : 0,42 %
contre Hammerstad-Jensen, 0,30 % contre la solution exacte en intégrales
elliptiques. Il n'y a pas de marge à reprendre.

La raison de fond :

- `ligne_mom` discrétise une **section droite** — une ligne de panneaux,
  resserrés sur les arêtes où la charge diverge. Une centaine d'inconnues, et la
  géométrie est exacte ;
- le moteur 2,5D discrétise une **surface**. La mesure d'ε_eff de
  [banc_moteur.py](mom_solver/tests/banc_moteur.py) tourne sur trois cellules
  dans la largeur de la piste, et c'est de là que viennent l'essentiel de ses
  0,49 %. Pour égaler `ligne_mom`, il faudrait dix cellules en largeur et un
  maillage fin sur toute la longueur : quelques milliers d'inconnues au lieu de
  cent, pour un résultat moins bon.

Ce n'est pas un défaut d'implémentation, c'est le prix de la généralité. Et les
0,49 % ne disent pas « le 2,5D est moins bon » : ils disent que **deux méthodes
qui ne partagent aucun code tombent sur le même chiffre**. C'est un certificat
de validité, pas un concours de précision.

Le 2,5D gagne là où les **hypothèses** du modèle de ligne tombent, pas là où sa
précision faiblit : coudes, moignons, changements de couche, rayonnement,
résonances de plan, couplage entre pistes non parallèles. Soit, sur ces
géométries, **au-delà de 2 à 3 GHz** — ce que dit déjà le lot 3 plus bas.

#### La carte

| Besoin | Bon outil | Effort | Précision attendue |
| --- | --- | --- | --- |
| Z₀, ε_eff, retard, pertes d'une ligne | `ligne_mom` — **fait** | — | 0,3 % |
| **Z différentielle, Z commune** | `ligne_mom` → N conducteurs — **fait** | — | < 3 % / Garg-Bahl |
| **Couplage entre pistes parallèles** | matrice S multi-ports depuis la même section — **fait** | — | < 3 % / Garg-Bahl |
| **OÙ le couplage se fabrique le long d'une piste** | matrice S multi-ports → IFFT — **fait** | — | la bande décide |
| Couplage croisé, via, changement de couche | moteur 2,5D | gros | quelques % |
| **Chute continue, densité de courant DC** | nouveau solveur résistif surfacique | moyen, simple | bonne |
| **R_AC, effet de peau, resserrement** | section, à l'intérieur du cuivre | moyen | bonne |
| Résonances de plan, Z du PDN en fréquence | 2,5D, ou modèle de cavité | gros | quelques % |
| **Ampacité, échauffement** | modèle d'étalement dans le stratifié — **fait** | — | ±20 % par nature |

Trois physiques différentes, et le moteur 2,5D n'est le bon outil pour aucune
des lignes en gras. Les deux premières sont faites ; la chute continue et R_AC
aussi. Ce qui reste en gras est ce que la PAGE ne fabrique pas encore.

#### 0. ~~Le crosstalk localisé~~ **FAIT (2026-09-01)** — OÙ, et non plus seulement COMBIEN

L'onglet Diaphonie résolvait la section droite et rendait **un chiffre par
longement**. Quand ce chiffre est mauvais, il ne dit pas lequel des quarante
millimètres qui longent en est responsable — et c'est pourtant la seule chose
dont on ait besoin pour corriger le dessin. Sa carte de chaleur ATTRIBUAIT le
bruit aux tronçons au prorata du couplage local ; elle ne le MESURAIT pas le
long de la piste. Il a été **retiré le 2026-09-02** — voir plus bas.

La section **Crosstalk** ([python/crosstalk.py](python/crosstalk.py)) le
mesure. Les termes croisés d'une matrice S multi-ports portent, en fréquence,
tout ce que le couplage fait le long du parcours ; leur transformée de Fourier
inverse est une **réponse impulsionnelle**, et le retard s'y convertit en
**position**. C'est la réflectométrie temporelle appliquée aux termes
*croisés* — NEXT en aller-retour (`x = v·t/2`), FEXT en trajet simple.

**Dix choses en font autre chose qu'un affichage de plus :**

- **la matrice vient du DESIGN, et de nulle part ailleurs.** Le **réseau de
  lignes couplées** est synthétisé à partir de la même section droite que
  l'onglet Z différentielle, mise en cascade le long du parcours : l'outil répond sans
  rien importer, et le seul geste demandé est de désigner l'agresseur.
  **Aucun fichier de paramètres S n'est accepté en entrée** — la première
  version l'offrait, et le retrait est délibéré : un `.sNp` apportait une
  physique qu'on ne sait pas calculer, mais aussi l'**ordre de ses ports**, que
  rien dans le fichier ne donne. Il fallait une table à composer, une
  confirmation et un refus total tant qu'elle manquait ; les ports sont
  maintenant posés ici, donc connus. Le `.sNp` demeure en **sortie**, pour aller
  comparer le réseau ailleurs — et un document qui porterait encore une matrice
  extérieure est **refusé en le disant**, jamais ignoré ;
- **la mise en cascade est une matrice de CHAÎNE en tension-courant, pas une
  matrice S.** Deux blocs du parcours n'ont pas les mêmes conducteurs couplés —
  une voisine commence, une autre s'arrête — donc pas les mêmes bases modales ;
  leurs matrices de chaîne, elles, sont écrites dans la même base physique et se
  multiplient sans autre précaution. C'est la seule façon d'assembler un
  parcours dont la section change. Et l'écriture retenue,
  `W = L⁻¹ T √λ`, **ne dépend pas de la fréquence** : le `1/jω` de `Z⁻¹`
  s'annule exactement contre le `jω` de `Γ`, ce qui rend le **continu**
  calculable — précisément le point que la grille harmonique de l'IFFT exige, et
  où une écriture naïve rendrait des infinis ;
- **les deux étapes zéro restent DEUX.** La présélection **géométrique** trouve
  ce qui longe avec sa distance et sa longueur mesurées — couches adjacentes
  comprises, parce que deux pistes superposées couplent souvent plus que les
  mêmes côte à côte ; la confirmation par **simulation** n'en retient que ce qui
  dépasse −40 dB. Une piste écartée **garde son chiffre**, et c'est ce qui
  permet de distinguer une piste *loin* d'une piste *proche et blindée* — deux
  gestes de routage opposés qu'une décision unique rendrait indiscernables ;
- **LES ZONES À RISQUE SE POSENT SUR LE CUIVRE.** La carte du panneau range
  les victimes sur un axe commun, ce qu'il faut pour les COMPARER ; devant le
  dessin, la question n'est plus « laquelle prend le plus » mais « quel
  millimètre de CELLE-CI reprendre ». Les portions où le couplage d'une
  victime se fabrique sont donc peintes sur SON cuivre, ambre quand le dessin
  des pistes l'explique et rouge quand rien ne l'explique — deux gestes
  différents, et écarter une piste pour un pic rouge ne servirait à rien. La
  position de la victime n'est JAMAIS reconstruite par décalage latéral : on
  projette son cuivre sur le parcours de l'agresseur, ce qui ne suppose
  aucune convention de signe — un signe inversé aurait posé le trait sur la
  piste d'en face, visiblement juste et faux ;
- **LA BANDE SE DÉDUIT DU DESSIN**, et elle sépare deux grandeurs qu'on
  confond systématiquement. Le HAUT DE BANDE fixe la RÉSOLUTION ; le PAS
  fréquentiel fixe la FENÊTRE temporelle, donc le repliement. Ajouter des
  points à bande constante allonge la fenêtre et n'affine RIEN — c'est
  l'erreur la plus courante sur ce genre de figure, et elle coûte dans les deux
  sens. La déduction part de trois mesures du dessin : le plus court longement
  (trois échantillons en travers de ce qu'il y a de plus fin à montrer), la
  longueur du parcours (l'aller-retour, donc les points), et l'épaisseur du
  diélectrique — au-delà de λ/10 dedans, la section droite quasi-TEM ne décrit
  plus la ligne, et monter encore affine la carte en apparence tout en la
  fabriquant. La fiche nomme laquelle des trois bornes a mordu : c'est elle
  qui dit quoi changer ;
- **LA FICHE REFUSE DE CONCLURE QUAND ELLE NE PEUT PAS**, et c'est la
  contrainte la plus difficile à tenir des neuf, parce que rien ne la
  réclame : un verdict rendu tout seul ressemble en tout point à un verdict
  gagné. Trois cas s'en sortaient mal. (1) « Expliqué par le plan » ne vaut
  que si la coïncidence pouvait ne pas avoir lieu : le seuil de couture se
  déduit du **haut de bande**, on monte le haut de bande pour affiner la
  carte, le seuil tombe au dixième de millimètre, le parcours entier devient
  zone de vigilance, et chaque pic y tombe forcément. L'**union** des zones se
  mesure donc, et au-delà de la moitié du parcours le verdict devient
  **indécidable** — ni « le plan l'explique », ni « rien ne l'explique ».
  (2) Les décibels de l'étape 0b sont un maximum sur *toute* la bande
  analysée, et la bande se règle pour la RÉSOLUTION SPATIALE, pas pour le
  signal : la fiche donne donc la fréquence du pire point et le couplage sous
  le **genou** du front saisi, et dit qu'elle ne sait pas quand la grille n'a
  aucun point utile en dessous — plutôt que de lire le zéro du continu et de
  l'annoncer comme une mesure. (3) Le seuil de couture écrit **de quelle règle
  il sort**, et ce que l'autre aurait donné quand les deux diffèrent :
  quatorze alarmes qui apparaissent sans que le cuivre ait bougé viennent d'un
  champ du panneau, et sans cette ligne on les cherche dans le dessin ;
- **le PROFIL D'ESPACEMENT est le témoin indépendant de la carte.** Une courbe
  de couplage seule ne se vérifie pas : elle a des pics, ils sont quelque part,
  et rien à l'écran ne dit s'ils sont à leur place — c'est le défaut de toute
  réflectométrie. Le profil vient de la **géométrie** et non du calcul
  électromagnétique : les deux ne peuvent pas se tromper de la même façon. Il
  se superpose à la carte, **axe inversé** pour qu'un resserrement se lise dans
  le même sens qu'un pic, et c'est leur **désaccord** qui devient le signal —
  un pic là où l'espacement est large et constant n'est pas expliqué par le
  dessin des pistes. Corollaire, et il corrige la première version : l'**écart
  entre deux victimes symétriques cesse d'être une anomalie**. Un agresseur
  équidistant de ses deux voisines *à tout instant* est l'exception ; l'écart
  n'est alerté que lorsque les profils sont comparables et les couplages non ;
- **le couplage VERTICAL est annoncé non modélisé.** Le solveur de section
  range ses conducteurs côte à côte et ne sait pas les EMPILER : une voisine de
  couche adjacente traverse le réseau comme une ligne isolée et ressortirait au
  plancher. Or deux pistes superposées couplent souvent PLUS que les mêmes côte
  à côte — lire « découplée » là où le couplage est maximal serait exactement le
  résultat faux et silencieux que cette section existe pour empêcher ;
- **le plan de masse est à côté du couplage, jamais dedans.** Son blindage est
  déjà dans les paramètres S ; le compter deux fois serait le compter faux. Ce
  qu'on ajoute sont des **causes** superposées à la carte en bandes hachurées :
  pas de couture insuffisant, fentes du plan sondées sous la piste, changements
  de couche sans via de masse. Un pic à la même abscisse qu'un trou de couture
  n'est plus un mystère ;
- **ce que la carte ne peut pas faire est dit à chaque fois.** La ligne FEXT ne
  localise **rien** quand les deux vitesses sont égales : le bruit avant
  co-propage, tout arrive au même instant, et aucune transformée ne sépare ce
  qui s'est superposé. Elle ne localise qu'en milieu inhomogène — donc sur un
  microruban et jamais sur une triplaque. Une ligne qui ne localise rien
  ressemble exactement à une ligne qui localise, et c'est pour cela que la fiche
  le répète.

**Ce que ça a coûté au reste du dépôt : une fonction.**
`_longement_intervalle` ([python/simulation_em.py](python/simulation_em.py))
porte désormais la projection, et `_longement` n'est plus qu'une soustraction
sur son résultat. Aucun chiffre existant ne bouge — deux copies de la même
trigonométrie auraient dérivé, et c'est l'onglet Diaphonie et l'onglet Crosstalk
qui auraient fini par ne plus désigner le même cuivre sur la même carte.

**Non-régression, dans
[python/test/banc-crosstalk.py](python/test/banc-crosstalk.py)** — 32 cas, dont
cinq étalons indépendants du code testé :

- une **ligne adaptée** rend `S₁₁ = 0` et `S₂₁ = exp(−jβL)` à **10⁻¹²** ;
- au **continu**, le réseau est un jeu de fils, à 10⁻⁹ sur deux conducteurs
  couplés — c'est le point où une écriture naïve divise par zéro ;
- une ligne **coupée en deux** redonne la ligne entière à **4·10⁻¹⁶** : sans
  cela, la carte porterait des marches aux frontières de blocs, qui se liraient
  comme des zones de couplage ;
- **le pic de NEXT tombe là où le longement commence**, à la résolution
  annoncée près, et on le déplace pour le vérifier. C'est le seul cas qui
  vérifie l'axe lui-même : un facteur deux oublié — l'erreur la plus facile à
  commettre et la plus difficile à voir — mettrait le pic à la moitié, ce qui
  reste une carte parfaitement lisible ;
- le **`.sNp` exporté, relu par un lecteur écrit dans le banc**. Il ne partage
  aucune ligne de code avec l'écrivain, donc aucune erreur commune : il relit le
  terme croisé et le recoupe avec le NEXT affiché, ce qui vérifie d'un coup
  l'ordre des rangées et la table des ports — deux endroits où une transposition
  passerait inaperçue en échangeant NEXT et FEXT ;
- le **recoupement carte ↔ géométrie dans les deux sens** : il doit signaler un
  pic que rien ne resserre, et surtout ne **rien** signaler sur un longement
  franc. C'est le côté qui compte le plus — une alerte qui se déclenche à tort
  fait ignorer toutes les autres.

28 cas de plus au banc de l'éditeur.

**Ce qui reste dehors, et dans quel sens.** Le réseau synthétisé porte les
pertes **diélectriques** (tan δ dans une permittivité complexe, exacte dans
cette écriture) mais pas les pertes **conductrices** — elles rendraient la base
modale dépendante de la fréquence —, ni le rayonnement, ni les coudes, ni les
transitions de via ; et il ne sait pas EMPILER deux conducteurs, donc pas
modéliser le couplage vertical. Le couplage y est donc celui d'une liaison
idéalisée, un **plancher** — et un plancher d'autant plus bas que l'empilage est
dense. Tout cela est dit dans la fiche, à l'endroit où le manque se produit et
une seconde fois dans le bloc de clôture qui en donne le SENS.

**Ce qui manquerait pour aller plus loin** : un solveur de section à
conducteurs EMPILÉS. C'est la seule chose qui séparerait aujourd'hui cette
carte d'une carte complète, et elle est chiffrable — la présélection compte
déjà les voisines superposées et mesure leur distance ; il ne manque que la
section qui les résoudrait.

#### 0 bis. ~~Le balayage de diaphonie~~ **RETIRÉ le 2026-09-02 avec l'onglet**

> Ce qui suit est un **compte rendu historique**. Le balayage vivait dans
> l'onglet Diaphonie, et il est parti avec lui le 2026-09-02 : le seuil de
> longement qu'il avait introduit (`LONGEMENT_TRANSVERSE_MIN`) survit seul,
> comme défaut de la présélection du crosstalk.

L'onglet Diaphonie répond désormais à **deux questions**, et la première ne
demande **rien**. Pour savoir s'il y avait un risque sur une piste qu'on venait
de tirer, il fallait fournir un temps de montée, une amplitude, deux
terminaisons et un budget — quatre chiffres dont **aucun n'entre dans le
couplage** : [C] et [L] ne dépendent que de la géométrie de la section. On
demandait tout ce qu'il faut pour fabriquer une *amplitude* à qui ne voulait
qu'un *verdict*.

Le mode **balayage** (défaut) est celui d'Ansys SIwave : K_NEXT (sans dimension)
et K_FEXT (ns/m) sortent de la seule section, et chaque voisine est **classée**
*ok / alerte / violation*. Le mode **budget** est celui d'avant, inchangé, et
changer de mode **ne relance rien** — les deux lectures sont dans le même
résultat, comme NEXT et FEXT.

Trois choses en font autre chose qu'un affichage de plus :

- **il n'a coûté aucun solveur.** `coefficients_couplage`
  ([python/ligne_mom.py](python/ligne_mom.py)) est désormais le seul endroit où
  les coefficients se forment — `diaphonie` lui délègue —, et le balayage
  reprend la section locale que la carte de chaleur résolvait déjà : sur une
  piste à écart constant, il est **gratuit** ;
- **il est rattaché au reste, et c'est mesuré.** À lignes identiques, K_NEXT
  vaut **exactement** `k_arrière` — 10⁻¹² sur quatre géométries. Ce n'est donc
  pas un second modèle à valider : les 3 % contre Garg-Bahl valent pour lui.
  C'est aussi ce qui a tranché la **coquille de la note d'Ansys**, qui imprime
  un `−` dans les deux formules : avec un moins, la réduction ne tomberait pas
  sur `k_arrière` et le NEXT s'annulerait en milieu homogène — alors que c'est
  le FEXT qui s'y annule, ce que le banc vérifie sur triplaque ;
- **les seuils sont une convention calculée, pas inventée.** SIwave les fait
  saisir, et ils le sont ici aussi ; les défauts sont ceux que ce solveur rend
  sur la **règle 3W** — alerte au niveau de trois largeurs d'écart, violation à
  deux. Le tableau se recalcule.

Ce que le balayage ne dit pas, et pourquoi le mode budget reste : les K
supposent les deux lignes **adaptées**. Mesuré sur un microruban de 0,25 mm à
0,20 mm d'écart, 50 mm, front de 1 ns — **1,16 %** au récepteur en ligne
adaptée contre **6,82 %** sur une entrée CMOS en l'air, un facteur **5,9**. Le
balayage dit **où** regarder, le budget dit **combien** cela coûte.

Quatre cas au banc Python, trois au banc de l'éditeur.

#### 1. ~~`ligne_mom` à N conducteurs~~ **FAIT (2026-08-31)** — Z différentielle ET couplage

> **Compte rendu historique.** Les coefficients de couplage rendus par ce
> chantier ont été **retirés le 2026-09-02** avec l'onglet Diaphonie ; ce que
> `solve_multiline` rend encore — [C], [L], les modes pair et impair — sert
> la Z différentielle et les matrices par bloc du crosstalk.

**Le meilleur rapport valeur/effort de tout ce fichier**, et c'était vrai : la
machinerie était déjà là. `capacitance_coplanaire`
([python/ligne_mom.py](python/ligne_mom.py)) **assemblait déjà une matrice
multi-conducteurs** — plusieurs blocs de panneaux à la même hauteur, une seule
matrice, un seul noyau — mais ne résolvait qu'un vecteur :

    [A] [q] = [V]     avec V = 1 sur le ruban, 0 sur les plans coplanaires

**Ce qui manquait était le second membre, et rien d'autre.** On en résout
désormais N — potentiel unité sur le conducteur *i*, zéro sur les autres — et
l'on relève la charge portée par chacun. C'est la **matrice de capacité de
Maxwell** [C], celle que la théorie des lignes multiconducteurs demande :
Q = [C] V, diagonale positive, hors-diagonale négative, somme de ligne égale à
la capacité vers la référence. Avec εr = 1 on obtient [C₀], et comme le milieu
n'est pas magnétique,

    [L] = μ₀ ε₀ [C₀]⁻¹

De ces deux matrices sortent, **sans aucun solveur de plus** :

- **Z différentielle et Z commune** — modes pair/impair pour une paire
  (`modes_paire`), décomposition modale de [L][C] au-delà (`_modes`) ;
- **la diaphonie** — NEXT, FEXT, longueur de saturation (`diaphonie`) ;
- les coefficients de couplage k_C et k_L, qui sont ce que la fiche affiche.

**Ce que ça a coûté.** `_matrice` — la partie chère, avec sa quadrature
spectrale — est construite **une seule fois**, et `np.linalg.solve` reçoit les
N seconds membres d'un coup : une factorisation, N substitutions arrière. Le
surcoût est négligeable, et la précision est la même — même discrétisation,
mêmes panneaux resserrés. **N = 1 par la matrice redonne `solve_line` au bit
près**, et le banc le vérifie.

**Une pièce en plus, qui n'était pas prévue : la piste de garde.** Un
conducteur peut porter `masse` — il entre dans la matrice avec ses panneaux et
sa condition à zéro volt, exactement comme un plan coplanaire, mais n'a pas de
port. C'est la réponse de dessin la plus courante à un problème de diaphonie,
et le banc la mesure : elle divise le NEXT par plus de deux, et fait baisser Z₀
des deux signaux — ce qui se dit, parce qu'on ne la pose pas sans revoir la
largeur.

**Le milieu est désormais choisi en un seul endroit** (`_milieu`) : `solve_line`
et `solve_multiline` résolvent la même section, et la 2.2.0 a assez montré ce
que coûtent deux copies d'une même formule.

**Non-régression, dans
[python/test/banc-ligne-mom.py](python/test/banc-ligne-mom.py)** — les cinq cas
annoncés y sont, et sept de plus :

- N = 1 redonne le chiffre actuel **au bit près** (1e-12 relatif) ;
- deux rubans très éloignés se découplent : hors-diagonale à 5·10⁻⁴ de la
  diagonale, et chaque diagonale retrouve la capacité du ruban seul ;
- la matrice est **symétrique** (3,1·10⁻⁶ sur la matrice BRUTE, mesurée avant
  symétrisation, sur trois pistes de largeurs différentes — le cas le plus
  défavorable), à diagonale positive, hors-diagonale négative, et somme de
  ligne entre zéro et la diagonale ;
- **l'étalon extérieur** : Garg-Bahl pour le microruban couplé par les arêtes,
  sur neuf couples (w/h et s/h de 0,5 à 2) — **moins de 3 %** sur Z_diff et
  Z_commune, moins de 2 % sur les ε_eff modaux ;
- Z_diff → 2 Z₀ et Z_commune → Z₀/2 quand l'écart devient grand devant la
  hauteur, à 0,5 % près — c'est ce qui vérifie le facteur deux autrement que
  par convention.

Et une propriété qui ne se discute pas, plus sévère que tous les étalons :
**en milieu homogène, la diaphonie avant est nulle**. Une triplaque y donne
k_C = k_L terme à terme et un FEXT de 4·10⁻¹⁷ ; un microruban donne k_L > k_C
et un FEXT **négatif**. Rien ne vérifie mieux que [C] et [L] décrivent la même
géométrie — une erreur d'un panneau sur l'un des deux se verrait là et nulle
part ailleurs.

**La masse coplanaire y est, sous ses deux formes.** La première version
jetait les deux écarts au plan et annonçait un majorant ; c'était une
précaution inutile. Les deux pages sondent les **plans** sans voir les pistes :
`gap_left` est donc déjà la distance de la sélection au plan de gauche *même
quand une voisine se trouve entre les deux*. Le plan borde le **groupe**, et
l'écart du groupe est celui de la sélection moins le cuivre ajouté de ce
côté-là — rien de plus à mesurer. Et une piste du **net de référence** qui
longe n'est pas une voisine : c'est une **piste de garde**, posée à zéro volt
dans la section, sans port. Mesuré sur une garde entre deux signaux à 0,45 mm :
le NEXT tombe de **3,15 % à 0,96 %**, et Z₀ des signaux de 57,6 à 50,7 Ω — ce
qui se dit, parce qu'on ne pose pas une garde sans revoir la largeur.

**Une section, pas une suite de paires.** Une piste avec deux voisines n'est
pas deux problèmes à deux conducteurs : c'est **un** problème à trois, et les
résoudre séparément compterait deux fois le même champ. Toutes les voisines
d'une même piste entrent donc dans la même matrice. Z différentielle d'une
paire prise dans un bus se lit alors par réduction exacte — les autres
conducteurs tenus à la masse (`sous_systeme`) —, ce qui est une hypothèse, et
qui se dit aussi.

**Les deux sens du bruit.** « Ce que ma piste prend » et « ce qu'elle envoie »
ne sont pas la même chose dès que les deux pistes n'ont pas la même largeur :
le bruit se compte en fraction de l'amplitude de **l'agresseur** et se rapporte
à ses termes propres. Les deux sortent de la même matrice, sans rien résoudre
de plus. Mesuré sur une voisine quatre fois plus large : **5,50 % reçu contre
4,51 % émis**, et le bruit avant **change de signe** d'un sens à l'autre. La
fiche juge ce que la sélection *subit* — c'est la question qu'on pose en la
sélectionnant — et affiche à côté ce qu'elle *injecte*.

**Ce qui reste hors modèle**, et qui est écrit dans le code comme dans la
fiche : ceci couvre le couplage entre pistes **parallèles, sur la même
couche**. Deux pistes qui se croisent, qui se superposent sur deux couches, ou
qui couplent par un champ de vias, ne sont plus une section : là, et là
seulement, il faut le 2,5D. Et quand la page ne trouve **aucun plan à portée**
— elle sonde jusqu'à trois millimètres —, le couplage est calculé sans lui,
donc majoré ; la fiche le dit alors, et seulement alors.

#### 1 bis. L'appariement, côté pages — **FAIT le 2026-08-31**

Le solveur ne peut pas savoir *quelles* pistes se longent. Il fallait deux
choses, et elles ont été mises chacune du bon côté :

- **la page apporte le cuivre**, elle seule le connaît. L'agresseur n'est
  **jamais** dans la sélection — c'est la définition — et l'autre moitié d'une
  paire différentielle non plus. Les deux outils joignent donc au document un
  `voisinage` : les tronçons de piste qui passent à portée, au même format que
  la géométrie (`simVoisinagePcb`,
  [editeur-pcb/js/19-simulation.js](editeur-pcb/js/19-simulation.js) ;
  `simVoisinageIpc`,
  [visionneuse-ipc2581/js/07-simulation.js](visionneuse-ipc2581/js/07-simulation.js)).
  L'éditeur y ajoute ses **paires déclarées** (`S.dpPairs`), que le nommage ne
  dit pas toujours ;
- **le serveur apparie**, une fois pour les deux outils
  (`_paires_paralleles`, [python/simulation_em.py](python/simulation_em.py)) :
  même couche, parallèle à 15° près, un recouvrement mesuré **par projection
  sur l'axe de la victime**, et un écart de cuivre à cuivre qui reste un écart.
  Les longements d'un même net se cumulent en longueur, l'écart est la moyenne
  pondérée, et le plus serré est gardé à part. **Toutes les voisines d'une même
  piste vont dans la même section** (`_poser_section`), avec la masse
  coplanaire du groupe (`_ecarts_masse_du_groupe`) et les pistes du net de
  référence posées en gardes. Deux implémentations de la même règle géométrique
  auraient dérivé : l'éditeur et la visionneuse doivent rendre le même chiffre
  sur la même carte.

**Le temps de montée** vient de la page, ou de la règle du genou
(t_r = 0,35 / f_max) à défaut. Il ne change ni [C] ni [L] : il décide de la
**saturation** du bruit arrière et de l'amplitude du bruit avant.

**Côté panneau**, un onglet de plus dans la famille SI — « Z différentielle » —,
qui lit **la même réponse du serveur** que « Impédance » : changer d'onglet ne
relance rien, et les fiches parlent nécessairement du même cuivre. *(Un onglet
« Diaphonie » lisait la même réponse ; il a été retiré le 2026-09-02, et le
couplage se lit désormais sous « Crosstalk ».)*

#### 2. Le solveur DC — **fait**, mais rien ne l'alimente

**Ce n'est pas de l'électromagnétisme du tout** : c'est un problème résistif sur
les formes de cuivre, réel, sans fréquence, à matrice symétrique définie
positive — donc un gradient conjugué et rien de plus. Il est **indépendant de
tout le reste** : il ne partage aucun code avec `ligne_mom` ni avec
`mom_solver`.

**Le solveur est écrit et mesuré** —
[python/dc_solver.py](python/dc_solver.py) 2.0.0, 16 cas dans
[python/test/banc-dc.py](python/test/banc-dc.py) :

- le maillage **surfacique** est là. Une trame carrée par couche, une cellule
  par carreau de cuivre, les voisines de même net reliées par une conductance
  qui vaut exactement σt — donc **indépendante du pas**. C'est ce qui fait
  qu'un barreau redonne ρL/(Wt) *à 0,000 %* et que raffiner la trame ne
  déplace pas le résultat : la trame ne décrit mal que le contour et les
  rétrécissements, c'est-à-dire ce qu'elle décrit mal, et rien d'autre ;
- les **vias** en résistances localisées entre couches, section d'anneau
  plaqué, la conductance répartie sur les carreaux que le trou débouche ;
- les **points d'injection et d'extraction** sont acceptés en disque ou en
  **rectangle** — une pastille en est un —, et filtrés par net : une référence
  de masse posée au milieu d'une carte attrapait sinon le cuivre du net voisin
  qui passe dans le même disque, et le fixait à zéro volt ;
- la sortie : le potentiel par nœud, la chute pire-cas par net, et une carte
  de chaleur **par couche** — peindre deux couches l'une sur l'autre
  mélangerait deux potentiels sans le dire.

**Ce qui manque est tout entier du côté PAGE**, et c'était déjà le cas quand
cette page a été écrite : les **courants**. C'est le schéma qui sait ce qu'un
composant tire, et il ne le porte pas encore. **Avancée au 2026-09-05** : le moteur
d'analyse de motifs de circuits ([python/pattern_recognition.py](python/pattern_recognition.py)
et [editeur-schematique/js/23-patterns.js](editeur-schematique/js/23-patterns.js)) extrait
et estime désormais automatiquement les courants nominaux et crêtes (régulateurs LDO/Buck/Boost,
tirages I2C, oscillateurs, etc.), avec export vers `sessionStorage` et fichier JSON.
Avec eux, l'extraction du cuivre par couche et par net dans les deux adaptateurs
(`cuivreDC()`, contrat décrit en tête de [commun/simulation-em.js](commun/simulation-em.js))
et la peinture de la carte (`peindreDC()`).

#### 3. ~~La résistance AC~~ **FAIT (2026-08-28)**

~~Aujourd'hui `line_losses` ([python/ligne_mom.py](python/ligne_mom.py)) prend une~~
~~formule analytique d'épaisseur de peau. Un vrai calcul demande Helmholtz complexe~~
~~**à l'intérieur** du conducteur : des panneaux dans le cuivre, ou une condition~~
~~d'impédance de surface. Même architecture que le reste de `ligne_mom`, et ça se~~
~~branche au même endroit.~~

~~À noter : le **resserrement par proximité** — le courant d'une piste repoussé par~~
~~celui de sa voisine — n'apparaît que dans une section **multi-conducteurs**. Ce~~
~~chantier vient donc après le n° 1, et en dépend.~~

**Ce qui est fait :**

- `line_losses` corrigée avec le modèle industriel :
  - `α_c = R_s / (2 * Z0 * w)` en Np/m, avec `R_s = 1/(σ δ)` la résistance de surface
  - Correction du bug : l'ancienne version avait un facteur 2 manquant qui doublait les pertes
  - À 5 GHz sur 35 µm de cuivre : δ = 0.93 µm, Rs = 18.5 mΩ/carré, α_c ≈ 4.2 dB/m

- `line_losses_detaillees` ajoutée pour le diagnostic :
  - `Rs` : résistance de surface en Ω/carré
  - `delta_peau` : profondeur de peau en mètres
  - `R_ac_par_m` : résistance AC du conducteur en Ω/m
  - `facteur_forme` : rapport périmètre/section
  - `alpha_c_dB` et `alpha_d_dB` en dB/m

#### 4. Ce qui n'est pas un solveur

**L'ampacité** — combien d'ampères une piste peut porter — est de la thermique :
IPC-2152, un modèle et des tables, avec une incertitude de ±20 % dans la nature
des choses. Si c'est ce qu'on veut afficher, il ne faut pas le chercher du côté
des champs, et il faut afficher l'incertitude avec le chiffre.

#### L'ordre

1. ~~**`ligne_mom` à N conducteurs**~~ **FAIT (2026-08-31)**, et il a bien
   débloqué les deux : Z différentielle et diaphonie sortent de la même section
   à N conducteurs, résolue une seule fois. Moins de 3 % contre Garg-Bahl,
   FEXT nul en milieu homogène, et l'appariement des tronçons parallèles avec.
   Ce qui reste de ce côté-là n'est plus un chantier mais des réserves écrites :
   pas de couplage entre couches **chiffré** — mais il est **VU et signalé
   depuis le 2026-09-01**, voir plus bas —, pas de croisement, et un couplage
   majoré quand aucun plan n'est à portée du groupe.
2. ~~Le côté PAGE du solveur DC~~ **FAIT dans les DEUX outils (2026-08-29)** :
   bornes désignées au clic — autant de sources et de références qu'on veut —,
   ampérages saisis, tout le cuivre du net envoyé sur toutes ses couches,
   détail **via par via**, **densité de courant** et **échauffement IPC-2221**
   en retour, la tension qui arrive à chaque charge, et la carte de chaleur au
   choix des trois (42 cas dans
   [python/test/banc-dc.py](python/test/banc-dc.py), 35 dans
   [editeur-pcb/test/harness.js](editeur-pcb/test/harness.js), 42 dans
   [visionneuse-ipc2581/test/harness-sim.js](visionneuse-ipc2581/test/harness-sim.js)).
   Reste la donnée que rien ne fabrique : **les courants du schéma**.
3. ~~R_AC par la section~~ **FAIT** (2026-08-28).
4. ~~Le port vertical du moteur 2,5D~~ **FAIT (2026-08-30)**. Le port est un
   VIA : on perce le maillage, on descend un fût jusqu'au plan de masse, et on
   pose le générateur sur la fente du bas — un shunt piste/plan, qui est ce
   qu'un port de microruban est. Il a fallu les trois pièces annoncées, et une
   quatrième qu'on n'avait pas vue :
   - `G_A^zz`, dérivée puis vérifiée sur sa signature : un dipôle électrique
     **vertical** a une image de **même signe** dans un plan parfait, quand un
     dipôle horizontal en a une opposée. 3·10⁻¹⁶ contre la forme fermée ;
   - les **demi-RWG** du bas du fût, dont l'image dans le plan complète la
     fonction — exactes, et non un pis-aller ;
   - le **dé-embarquement** par T₂T₁⁻¹, qui retire le via, le trou et le coin ;
   - et la **hauteur électrique** : la pile géométrique et la pile électrique
     ne coïncident pas, le cuivre ayant une épaisseur géométrique et aucune
     épaisseur électrique. 9 % d'écart sur du FR-4 de 0,37 mm.

   **Mesuré** : |S₂₁| passe de 0,0065 à 0,96 sur la même ligne, et ε_eff
   dé-embarqué tombe à **0,93 %** de `ligne_mom` à 5 GHz, 1,11 % à 10 GHz.

5. ~~Le 2ᵉ branchement DCIM~~ **RÉPARÉ (2026-08-30)**. Trois fautes, toutes du
   même genre — deux bases confondues : les images du 3ᵉ niveau étaient
   resommées avec le `k` du substrat ; le reste à ajuster était pris en `k_z`
   de l'air alors que les deux premiers niveaux vivent en `k_z` du substrat ;
   et le garde-fou de portée, mesuré en épaisseurs de stratifié, **rejetait
   toutes** les images du branchement air — le niveau ne posait pas une seule
   image. `ComplexImage` porte maintenant son `k_onde`. `banc_dcim` repasse à
   25/25, ε_eff revient à 0,49 %, et l'erreur de champ lointain est divisée
   par trois (9,6 % → 6,2 % à 10 mm). Reste **hors du chemin par défaut**,
   pour son coût : le gain est en champ lointain, sans effet sur une matrice
   d'impédance, et il vaut huit images de plus par noyau.

6. ~~Plan de masse multiple~~ **FAIT (2026-08-30)**, et ce n'était pas de la
   plomberie. `profils_noyaux_multiples` rendait un noyau croisé qui était, au
   bit près, celui de la couche du bas : elle construisait un « profil
   croisé » puis rappelait `noyaux_green` sans le lui passer. Et le profil
   croisé lui-même n'était pas la bonne idée — il recollait deux demi-empilages
   pour fabriquer une pile qui n'existe pas. La fonction de Green entre deux
   plans est celle de la **même** ligne, lue à un autre endroit : c'est
   `profil_croise` / `noyaux_croises`, par transfert de tension exact.
   Vérifié par la réciprocité (10⁻¹⁴), par la cohérence avec `_impedance_vue`
   (4·10⁻¹⁶) et par une forme fermée qui redonne les deux images ±1 aux
   profondeurs exactes. `mom_engine` route désormais chaque paire de triangles
   vers le noyau de sa paire de couches ; un plan de masse entre deux signaux
   rend un bloc **exactement nul**.

7. ~~Optimisation numba~~ **FAIT AUTREMENT, ET MIEUX (2026-08-30)**. Le profil
   désignait `_somme_ondes` — la moitié du temps —, mais pas pour la raison
   qu'on croyait : le calcul était fait **image par image**, en petites
   opérations numpy sur des tableaux de 49 nombres, et le coût était celui des
   appels. Rangé en tableaux (points × images), l'assemblage passe de
   **20,4 s à 5,0 s** pour 269 RWG. C'est **exact** — le banc le vérifie
   contre une somme naïve —, donc aucune étude d'erreur d'interpolation n'a
   été nécessaire. Le profil est maintenant **plat** : `_somme_ondes` n'y pèse
   plus que 19 %, et une tabulation approchée ne rapporterait au mieux qu'un
   facteur 1,2 pour le prix d'une approximation. Ce n'est plus la bonne
   dépense.


Le plan parfait et infini est une hypothèse fondamentale du modèle 2,5D — la
lever demande un solveur 3D complet. C'est une **réserve écrite**, pas un
chantier : ce qu'elle coûte, cas par cas, est en tête de `indices_plans_masse`
([mom_solver/green_layered.py](mom_solver/green_layered.py)) et résumé plus
bas.


### La famille PI porte une analyse, dont la moitié serveur seule est faite

Le panneau se range en deux familles — **SI** (intégrité du signal) et **PI**
(intégrité de l'alimentation). SI porte quatre analyses, dont trois — « Impédance »,
« Z différentielle » et « Current Return Path » — lisent **la même réponse du
serveur** : changer d'onglet ne relance rien. La quatrième, « Crosstalk », a sa
propre route. PI porte
« Chute DC », **branchée de bout en bout dans les DEUX outils depuis le
2026-08-29** : bornes désignées au clic, cuivre du net envoyé sur toutes ses
couches, détail via par via en retour, et la carte de potentiel peinte sur la
carte. **Sa fiche parle le même langage visuel que celles de SI depuis le
2026-09-03** — verdict contre budget, ligne de contexte, légende à pastilles,
`simTab` / `simNote` — là où elle portait les classes génériques du panneau de
l'outil : le résultat n'était pas laid, il était *étranger*, et il fallait
réapprendre où regarder en changeant d'onglet. **Ses COMMANDES aussi** : les champs de
saisie sortent tous de `simChamp`, qui porte désormais leur classe — la
feuille de style nommait les sept champs de l'onglet Impédance un par un, donc
tous ceux ajoutés depuis (Crosstalk, Chute DC) tombaient sur le style du
navigateur, police sans empattement et largeur élastique. Et `pnl-u` /
`pnl-note`, deux classes qui n'ont de règle dans **aucune** feuille de style du
dépôt, ont laissé place à `simU` / `simNote` : les unités de PI — « mm »,
« °C », « W/(m·K) » — s'écrivaient à la taille du navigateur au milieu d'un
panneau en monospace de dix pixels. Un cas de non-régression les garde
dehors.

Le registre est `SIM_FAMILLES` / `SIM_ANALYSES`
([commun/simulation-em.js](commun/simulation-em.js)). Une analyse y déclare
`nom`, `titre`, `corps()` (ses commandes), `brancher()`, `rendre()` et `peint`
— ce dernier commandant `simZActif()`, donc la carte de chaleur. L'onglet
apparaît tout seul.

Ce qu'il y aurait à mettre dans PI, par ordre de ce que le dépôt sait déjà
faire :

1. **La chute continue (IR drop).** **Le SOLVEUR est fait et mesuré ; le
   côté PAGE ne l'est pas.** Les deux moitiés étaient annoncées faites, et
   aucune ne l'était.

   **Ce qui est fait**, dans [python/dc_solver.py](python/dc_solver.py) 2.0.0 :

   - un maillage **surfacique** — chaque couche tramée au pas demandé, une
     cellule par carreau de cuivre, les voisines de même net reliées par une
     conductance. Sur une trame carrée cette conductance vaut exactement σt,
     donc un barreau redonne ρL/(Wt) **à 0,000 %** ; raffiner la trame ne
     déplace pas le résultat, ce que le banc vérifie sur trois pas dans un
     rapport de quatre ;
   - les **vias** en résistances localisées entre couches, section d'anneau
     plaqué ;
   - des **références déclarées** (Dirichlet), et un refus explicite quand il
     n'y en a pas : une chute se mesure entre deux points, et la version
     précédente ancrait le nœud numéro zéro — un coin de la boîte englobante,
     sur n'importe quel net ;
   - une matrice qui reste **symétrique définie positive** : les inconnues de
     Dirichlet sortent du système au lieu d'être écrasées ligne par ligne, ce
     qui détruisait la symétrie sous un gradient conjugué qui la suppose ;
   - un contrôle de **connexité** : un îlot qui n'atteint aucune référence rend
     la sous-matrice singulière, et le CG s'arrête alors sur un résidu petit en
     rendant des milliards de volts. On le cherche par un parcours en largeur,
     avant de résoudre ;
   - la route `/api/simulation-dc`, en POST **et en GET** — `_dc_etat` était
     écrite mais routée nulle part.

   **Ce que la 1.0.0 faisait, et qui explique le reste :** elle montait son
   réseau sur le **périmètre** des polygones — le courant faisait le tour du
   cuivre au lieu de le traverser —, passait `tol=` à `scipy.sparse.linalg.cg`
   (retiré en SciPy 1.14, et ce dépôt tourne sur 1.16), et **rattrapait le
   TypeError pour rendre un potentiel identiquement nul**. Zéro volt de chute
   sur toute la carte est le pire des faux résultats : il a l'air d'une bonne
   nouvelle.

   **LE CÔTÉ PAGE, FAIT LE 2026-08-29 — et le blocage levé par un détour.**

   Le chantier était réputé bloqué par les **courants**, qui ne viennent pas
   du PCB : c'est le schéma qui sait ce qu'un composant tire, et il ne le
   porte toujours pas. Le détour est de ne pas les attendre : **l'utilisateur
   désigne deux pastilles** — une SOURCE qui injecte, une RÉFÉRENCE tenue à sa
   tension — et pose lui-même l'ampérage. La question qu'on se pose devant une
   carte, « combien je perds entre ce régulateur et ce connecteur », n'en
   demandait pas davantage.

   - **`cuivreDC()` dans l'éditeur PCB**
     ([editeur-pcb/js/19-simulation.js](editeur-pcb/js/19-simulation.js)) :
     tout le cuivre du net des deux bornes part au solveur — pistes (une droite
     en un quadrilatère, un arc en une suite), zones, pastilles, sur **toutes**
     les couches ; les découpes partent en `trou`, qui retire du cuivre au lieu
     d'en poser.
   - **La désignation par clic**, calquée sur le mode « mesure » : le panneau
     arme, la carte reçoit le clic, la pastille est nommée (« J1.1 ») et le
     panneau la relit à chaque affichage — une pastille effacée en disparaît.
   - **LE CHANGEMENT DE COUCHE, ET CE QU'IL A COÛTÉ.** Les vias du net partent,
     évidemment. Mais une **pastille traversante** pose un anneau de cuivre sur
     chaque couche, et ce qui les relie est le **tube métallisé** de son
     perçage — un conducteur au même titre. Ne pas l'envoyer laissait ces
     anneaux électriquement flottants et le solveur refusait tout le calcul :
     « 2016 nœuds n'atteignent aucune référence ». **Aucune relecture ne
     l'aurait montré** : il a fallu envoyer au serveur le document que
     l'éditeur produit vraiment. Vias et tubes partent donc en liaisons entre
     couches **voisines**, chacune avec la hauteur de son propre intervalle, et
     seulement entre les couches qui portent effectivement du cuivre.
   - **Le tableau via par via**, qui est ce qui a été demandé : repère,
     couples de couches, courant, chute et résistance, les plus chargés en
     tête. Le solveur le rend à partir des paires de nœuds qu'il a reliées, ce
     qui rend le courant **exact** — sur deux plans reliés par un seul via, il
     redonne l'ampérage entier, par la loi des nœuds, et le banc le vérifie.
   - **Le déséquilibre, dit juste.** La première version sommait le courant de
     tous les vias pour en tirer une part — et annonçait « le plus chargé porte
     25 % » là où un seul chemin portait la totalité, parce qu'un tube est une
     **chaîne** de liaisons en SÉRIE. On ne compare donc que les vias reliant
     le **même couple de couches**, qui sont bien en parallèle.

   **LES TROIS RESTES, FAITS LE 2026-08-29 (2ᵉ passe) :**

   - **LA VALEUR SOUS LE CURSEUR.** Une carte de chaleur montre OÙ, jamais
     COMBIEN : on voyait que ça chauffait là, sans savoir si c'était deux
     degrés ou quarante. Le survol affiche maintenant la valeur du carreau
     pointé, dans la grandeur choisie. Elle lit le RÉSULTAT et non le pixel
     peint — repasser par la couleur ferait deux conversions et rendrait un
     nombre qui n'est plus celui du solveur. Hors du cuivre : rien, pas un
     zéro, pas la valeur du voisin. Et le survol ne redessine que si l'on
     change de carreau, sans quoi une grande sélection deviendrait inutilisable.

   - **LA CARTE SORTAIT EN MIROIR VERTICAL**, dans les deux outils. L'image
     était construite avec sa ligne 0 au y *maximum* du monde, « parce que
     l'écran a son y vers le bas » — vrai de l'écran, faux de la destination :
     `drawImage(img, x0, y0, w, h)` pose la ligne 0 au y **minimum**, et on
     dessine en coordonnées MONDE. C'était donc un retournement de trop côté
     visionneuse (`setTransform(s,0,0,-s,…)`) et un de trop côté éditeur
     (`(s,0,0,s,…)`) : un défaut d'alimentation se lisait à l'opposé de là où
     il est. Le cas qui le garde est **asymétrique dans les deux axes** — un
     motif symétrique passe un miroir sans broncher, et c'est exactement ce
     qui avait laissé ce défaut vivre.

   - **LA TRAME N'EST PLUS UN RÉGLAGE.** Le champ portait 0,2 mm d'office et
     personne ne pouvait savoir ce qu'il fallait y mettre. Elle se déduit
     maintenant du cuivre : **huit carreaux dans la largeur de la forme la plus
     étroite**, avec un garde-fou qui l'élargit — en le disant — si le nombre
     de nœuds dépasse le budget. Le champ vide veut dire « choisis-la ».

     POURQUOI HUIT ET NON QUATRE, qui est le seuil du mailleur : la largeur que
     le solveur VOIT est **quantifiée par la trame**, et l'échauffement va en
     `A^(−0,725/0,44)`. Mesuré : la même piste de 0,5 mm rendait 0,60 mm de
     section au pas de 0,15 et 0,50 mm au pas de 0,125 — 15,45 K contre 20,87,
     soit exactement `(0,5/0,6)^1,6477`. À huit carreaux l'écart tombe de
     moitié. Il en reste une incertitude d'une dizaine de pour cent sur la
     forme la plus fine, et c'est écrit.

   - **UN « undefined » S'AFFICHAIT SOUS LE PANNEAU.** `simRendre` fait
     `box.innerHTML = a.rendre()` ; « Chute DC » écrivait dans un `<div>` à
     elle et ne rendait **rien**. Les essais ne l'ont pas vu parce qu'ils
     appelaient `rendre()` directement, où la valeur de retour ne gêne
     personne — c'était le CONTRAT du registre qui n'était pas tenu. Un cas le
     vérifie désormais pour **toutes** les analyses, dans chacun de leurs états.

   - **LE PANNEAU DIT CE QU'IL A PRIS** : combien de formes, sur combien de
     couches, découpes comprises, « pistes, pastilles et plans compris ». Un
     chiffre dont on ignore l'assiette ne se vérifie pas — et rien ne montrait
     que le plan de masse était bien dedans.

   - **LE VOCABULAIRE, remis à l'endroit.** Les deux bornes s'appelaient
     « source » (qui portait le COURANT) et « référence » (qui portait la
     TENSION) — l'inverse exact de la façon dont on raisonne devant une carte,
     et l'utilisateur l'a dit : *« je veux choisir une source où je règle la
     tension, et une charge où je règle le courant consommé »*. C'est ainsi
     désormais : une **source** est une alimentation, on lui règle ses
     **volts** ; une **charge** est un consommateur, on lui règle ses
     **ampères**. Le solveur, lui, n'a pas bougé : une source est une condition
     de Dirichlet, une charge une condition de Neumann à courant **négatif** —
     il sort du cuivre. La traduction se fait dans les deux adaptateurs, en un
     seul endroit chacun.

   - **CE QUE LE PANNEAU DIT MAINTENANT EN PREMIER** : la tension qui ARRIVE à
     chaque charge. C'est la question qu'on pose à ce calcul — « j'ai 3,3 V au
     régulateur, combien en reste-t-il là-bas ? » —, et la chute du net n'y
     répond pas dès qu'il y a plus d'un consommateur. Vérifié à la main :
     3,2928 V calculés contre 3,2927 attendus sur un barreau à deux
     consommateurs.

   - **UN DÉFAUT VIVANT, TROUVÉ EN LE CHERCHANT.** `simDCLancer` lisait encore
     `simDCI` et `simDCU`, les deux champs disparus du panneau le jour où les
     bornes sont devenues une liste. `parseFloat(undefined)` rend NaN : le
     bouton « Calculer » **refusait toujours**. Aucun essai ne l'a vu, parce
     qu'aucun n'exerçait cette fonction — le contrôle de câblage ne lisait que
     l'affichage. Il lit désormais le lancement aussi.

   - **Plusieurs bornes, et pas deux.** Le panneau n'acceptait qu'une source et
     une référence, ce qui décrit un cas et un seul. Or la chute que voit un
     consommateur dépend de **ce que tirent les autres** — c'est même la raison
     d'être du calcul —, et deux champs obligeaient à autant de calculs
     séparés, dont aucun n'aurait été juste. Le panneau porte maintenant une
     **liste** : « + source », « + référence », chacune avec sa valeur.
     Plusieurs références ont aussi un sens (deux régulateurs en parallèle, un
     connecteur à deux broches). Vérifié contre le calcul à la main sur un
     barreau : l'écart entre deux consommateurs vaut `r·I₂·(x₂−x₁)` à
     **0,278 %**.
   - **La carte de potentiel est peinte**, dans les deux outils. On peint les
     **nœuds** — un carreau de trame chacun —, et non la grille `cartes` que le
     serveur rend aussi : celle-ci couvre la *boîte englobante* et porte, hors
     du cuivre, le potentiel du nœud le plus proche ; la peindre étalerait de
     la couleur sur du vide. Une image par couche est pré-calculée à l'arrivée
     du résultat, un pixel par carreau, et la teinte va du **cyan** à
     l'**ambre** — délibérément pas du rouge, qui est celui du DRC. **La couche
     peinte se choisit dans la fiche depuis le 2026-09-03** : l'outil propose
     (sa couche active, ou celle de la charge), l'utilisateur dispose, et le
     changement ne coûte qu'un redessin.
   - **`cuivreDC()` dans la visionneuse.** Pistes, arcs, plans à contours et
     pastilles tirées de padstacks ressortent en polygones, en millimètres
     quelle que soit l'unité du fichier ; les découpes de plan partent en
     `trou`.

   **CE QUE LA VISIONNEUSE A COÛTÉ, ET C'EST LA MÊME LEÇON QUE LA PREMIÈRE
   FOIS.** Onze cas de banc passaient — tube contigu, hauteur juste, net
   conservé, unité convertie — pendant que le document, dans son ensemble,
   était **incalculable** : les pastilles traversantes posaient du cuivre sur
   les deux couches et rien ne les joignait, faute d'un perçage listé à leur
   emplacement. Le solveur refusait tout (« 1240 nœuds n'atteignent aucune
   référence »), et il a fallu lui **envoyer** le document pour le voir. Un
   padstack qui place du cuivre sur deux conducteurs *décrit* un trou
   métallisé : le tube est maintenant déduit, avec son perçage marqué SUPPOSÉ.
   Le côté éditeur avait eu exactement le même défaut, pour exactement la même
   raison. Les cas qui vérifiaient la FORME de chaque morceau l'ont tous
   laissé passer ; celui qui juge le document **entier** — « toute couche
   portant du cuivre doit être atteignable depuis la source » — l'aurait vu, et
   il existe maintenant dans les deux bancs.

   **LA CHUTE NE DIT PAS TOUT — densité et échauffement (2026-08-29, 3ᵉ passe).**

   Une piste peut tenir sa chute et fondre quand même : c'est la **section** qui
   chauffe, pas la longueur. Mesuré sur une piste de 2 mm étranglée à 1 mm sur
   deux millimètres : la chute monte de **6 %**, la température **triple**. Ni
   la chute ni aucun contrôle géométrique ne le voient — la piste y respecte sa
   largeur minimale. Le panneau rend donc aussi :

   - **la densité de courant**, `J = I/(W·t)`, en A/mm². Vérifiée à **0,000 %**
     contre le calcul à la main sur un barreau ;
   - **l'échauffement**, par la charte **IPC-2221** :
     `I = k·ΔT^0,44·A^0,725`, `k` = 0,048 en couche extérieure et 0,024 en
     interne. Vérifié à **0,00 %** contre la charte reposée à la main, et le
     rapport interne/externe tombe sur le `2^(1/0,44) = 4,83` qu'elle impose.

   **CE QUI A FAILLI PARTIR FAUX, ET QUI EST LA VRAIE LEÇON DE CETTE PASSE.**
   Le maximum de densité **ne converge pas** : à un angle rentrant le champ est
   singulier, et le pic croît sans borne au raffinement — 93,7 puis 104,4 puis
   129,3 A/mm² aux pas 0,2 / 0,1 / 0,05 mm, sur la même géométrie. Ce n'est pas
   un défaut du solveur, c'est la solution exacte ; mais **un maximum qui
   dépend d'un réglage de maillage n'est pas un chiffre d'ingénieur**.

   La première version mesurait pour cela une largeur locale autour de chaque
   point, perpendiculairement à l'axe dominant du courant. Dans un angle le
   courant est diagonal : le balayage traversait la marche au lieu du
   conducteur, voyait une section trop courte, et rendait **21,9 K là où le col
   en vaut 16,7** — trente pour cent de trop, sur une géométrie où la réponse se
   pose à la main. L'échauffement vient maintenant d'une **coupe** : la somme
   des courants qui franchissent une colonne de carreaux. C'est un flux, donc
   il ne bouge plus — 16,739 K aux trois pas, et 0,0 % d'écart avec la main.

   Les deux chiffres se lisent donc différemment, et le panneau le dit : la
   **densité de pointe** dit *où* regarder, l'**échauffement** dit *combien*.

   **L'ÉCHAUFFEMENT NE VIENT PLUS D'UNE CHARTE — FAIT LE 2026-09-03.** IPC-2221
   est une charte empirique, relevée sur un conducteur **isolé**, à l'air calme :
   elle ne connaît ni le stratifié, ni les plans qui évacuent, c'est-à-dire ni
   l'un ni l'autre des deux chemins par lesquels la chaleur part vraiment. Deux
   de ses conséquences se posent à la main :

   - une couche **interne** y sort **4,83 fois** plus chaude qu'une externe
     (2^(1/0,44)). C'est le résultat que la campagne **IPC-2152** a renversé :
     une piste noyée dans le stratifié est mieux refroidie, pas moins ;
   - un **plan de cuivre** à côté de la piste ne change rien à son chiffre. Or
     35 µm de cuivre pleine carte étalent **dix fois** mieux que 1,6 mm de
     FR-4 — le facteur le plus lourd de tout le problème, absent de la charte.

   Ce qui la remplace est un **modèle d'étalement** : la carte est une ailette
   plane de conductance de nappe `Ks = λ·h_lamine + λ_cu·t_étaleur`, qui perd
   par `h` sur ses deux faces, donc `g = 2·√(Ks·2h)` par mètre de conducteur,
   plus `h·W` pour une couche extérieure. `ΔT = p'/g`, avec la boucle en
   résistivité du cuivre résolue (`ΔT = u/(1−α·u)`) et **l'emballement
   thermique refusé au lieu d'être rendu**. Mesuré sur le barreau du banc, 3 A
   dans 2 mm de 35 µm : **6,06 °C** sur carte nue, **1,83 °C** dès qu'un plan
   est là, contre **5,34 °C** que la charte annonce dans les deux cas. Les deux
   couches, elles, ne s'écartent plus que de 7 % au lieu de 4,83×.

   **TOUT CE QUI EST THERMIQUE S'ÉCRIT EN DEGRÉS CELSIUS — FAIT LE 2026-09-03.**
   Un écart de température vaut autant en kelvins qu'en degrés Celsius : les
   deux échelles ont le même pas, seule leur origine diffère. Or c'est en °C
   qu'IPC-2221 et IPC-2152 écrivent toutes deux leurs chartes (« temperature
   rise in °C »), et en °C que se lisent les cotes contre lesquelles on
   compare — Tg d'un stratifié, température maximale d'un boîtier, déclassement
   d'un condensateur. Écrire des kelvins obligeait à convertir de tête un
   nombre qui ne change pas. L'**ambiante** se saisit à côté du budget (20 °C
   d'office) : elle n'entre dans aucun calcul — l'échauffement est un écart —
   et donne la température **absolue** du point chaud, la seule qu'on puisse
   mettre en face d'un Tg.

   **LES DEUX CHIFFRES SONT RENDUS**, côte à côte dans le tableau et au choix
   sur la carte : là où ils se ressemblent, la carte n'évacue rien ; là où ils
   s'écartent, c'est un plan qui travaille — et cela ne se devine pas de la
   géométrie. Les trois cotes que le modèle consomme viennent de l'empilage
   (`cuivreDC().thermique`), la conductivité du laminé se saisit dans le
   panneau, et **tout repli est nommé** dans le résultat : « 6 K sur un λ
   déclaré » et « 6 K sur un λ supposé » ne se défendent pas pareil.

   Ce n'est toujours **pas une simulation thermique** : ailette plane uniforme,
   `h` constant, pas de composant chaud ni de piste voisine qui dissipe. ±20 %
   est la nature de la chose.

   **LA CARTE DE CHALEUR** se choisit entre les quatre grandeurs — échauffement
   d'office, puisque c'est celle sur laquelle on élargit une piste. Elle est
   découpée exactement sur le cuivre analysé : un carreau de trame par pixel,
   rien hors du cuivre.

   **LA TRAME NE SE HEURTE PLUS AU REFUS DU SOLVEUR — FAIT LE 2026-09-03.**
   `mailler()` refuse sur **deux** critères et la page n'en connaissait qu'un :
   le nombre de **nœuds** (carreaux *de cuivre*, 400 000) et la taille de la
   **grille** (`nx × ny × couches`, 1 600 000, sur la **boîte englobante** de
   tout le cuivre envoyé, cuivre ou pas). Les deux quantités n'ont rien à voir
   sur une carte réelle : un rail couvre une grande boîte avec peu de cuivre,
   donc la forme la plus étroite (0,32 mm) faisait tomber le pas à 0,04 mm, le
   budget des nœuds passait haut la main — 28 000 sur 250 000 — et le serveur
   répondait « Trame trop fine : 875 × 1177 carreaux sur 4 couche(s) ». Un
   refus que personne ne pouvait corriger en connaissance de cause, puisque le
   pas venait de l'outil. Les deux budgets s'appliquent maintenant, on retient
   le pas le plus grand des deux, et **la note dit lequel a borné** — sur une
   grande carte peu remplie la réponse est de restreindre la portée, sur un
   plan dense de découper le calcul : deux causes, deux gestes. Le refus du
   solveur, s'il arrive encore (pas imposé à la main), **nomme le pas qui
   tient**.

   **UNE CHARGE QUI « NE DONNE PLUS RIEN » EST UNE CHARGE D'UNE AUTRE
   COUCHE — CORRIGÉ LE 2026-09-03.** La carte ne peint qu'une couche, et
   « auto » suivait la **première borne posée**. Deux défauts, et le second
   coûte cher : ce n'est pas la couche qu'on veut voir — sur un rail à
   plusieurs charges, c'est celle de la plus mal servie, celle que le verdict
   nomme —, et surtout cette couche **changeait toute seule** dès qu'on
   réordonnait la liste des bornes. La charge restée sur l'autre couche cessait
   alors d'être peinte, et rien ne le disait : du cuivre non coloré autour
   d'une charge se lit « cette charge ne donne rien » au lieu de « tu regardes
   une autre couche ». Trois corrections : « auto » suit désormais la charge la
   plus mal servie, le tableau des bornes porte une colonne **Couche** (les
   bornes hors de la couche peinte y sont en gris), et une note les nomme en
   rappelant que **leurs chiffres, eux, sont ceux de tout le calcul**.

   **DEUX NOTES QUE J'AVAIS MAL ÉCRITES, reprises le 2026-09-03 :**

   - la note des portées supposées annonçait « portent 5,643 A » sur un rail de
     2 A. Ce n'était pas un courant : `suppose` est une somme de **valeurs
     absolues** sur des liaisons — le même ampère y est compté une fois en
     descendant et une fois en remontant, et une chaîne de trois liaisons le
     compte trois fois. Écrire cet ampère rouvrait exactement la confusion que
     le reste de la fiche sert à fermer. Seul le **rapport** est juste (les deux
     sommes se comptent de la même façon, le double comptage s'annule), et le
     seul ampère écrit est maintenant celui du via le plus chargé — celui-là
     est un vrai courant ;
   - **une marque qui serait partout n'est plus mise.** Quand le fichier ne
     déclare aucune portée — le cas le plus courant —, le « ? » se posait sur
     les quinze lignes du tableau et ne distinguait plus rien : du bruit qu'on
     apprend à ne plus voir, et qui emporte avec lui les cas où la marque
     compte. On ne marque donc que si le tableau est **mêlé** ; sinon une note
     le dit une fois. Même règle pour le perçage supposé.

   **LE CUL-DE-SAC EST VÉRIFIÉ, PLUS SUPPOSÉ — FAIT LE 2026-09-03.** La
   question posée était juste, et elle méritait mieux qu'une explication : « ce
   via remonte à une pastille où je n'ai réglé aucune charge, pourquoi porte-t-il
   du courant ? ». Un morceau de cuivre relié au reste par **un seul** chemin,
   et qui ne porte ni source ni charge, ne peut porter **aucun** courant : ce
   qui entre doit sortir, et il n'y a pas d'autre porte. Il n'y a donc que deux
   réponses possibles, et il fallait pouvoir dire laquelle — le cuivre continue
   au-delà de la pastille, ou bien c'est un bug.

   `_culs_de_sac` tranche maintenant tout seul. Les composantes connexes du
   cuivre sont calculées sur les seules arêtes **dans le plan**, sans les
   liaisons verticales : une composante est donc un morceau de cuivre d'une
   couche. Zéro borne et **un seul** via qui la touche : c'est un cul-de-sac, et
   le via qui l'alimente doit porter zéro. Le solveur le vérifie sur sa propre
   solution — ce n'est pas la loi qu'il a résolue, il a résolu un système
   linéaire, donc la vérifier apprend quelque chose — et **lève une
   incohérence** au-delà du microampère. Mesuré sur l'étalon : **2,1 × 10⁻¹⁰ A**
   sur un rail de 3 A, soit zéro à la précision du gradient conjugué ; la même
   géométrie avec 0,5 A au bout du via rend **0,5000 A**. Le second contrôle
   compte autant que le premier : sans lui, un solveur qui ignorerait ce via
   passerait le test.

   La fiche le rend visible, et c'est ce qui permet de conclure sur SA carte :
   les culs-de-sac portent zéro, donc **un via qui porte du courant n'en est
   pas un** — le cuivre continue au-delà de sa pastille, et le courant ne fait
   que passer. Une pastille n'est un terminus que si le cuivre s'arrête là ;
   posée sur un plan, elle en est une bosse.

   **CE QU'UN VIA PORTE N'EST PAS UNE CHARGE, et la fiche le disait mal.**
   La densité se peint sur tout le cuivre analysé, pas seulement là où l'on a
   cliqué. Trois notes entretenaient la confusion, et les trois sont reprises
   le 2026-09-03 :

   - **le déséquilibre des vias** annonçait « 21 vias se partagent le passage :
     le plus chargé en prend 100,0 %, contre 4,8 % à parts égales ». C'est
     faux comme lecture : sur un plan cousu, vingt de ces vias ne sont sur
     AUCUN chemin — ils joignent du cuivre qui ne demande pas de courant. Les
     compter comme des parallèles inactifs faisait passer un **chemin unique**
     pour un défaut de routage. La note distingue maintenant les deux
     situations, et les parts se comptent sur les vias ACTIFS ;
   - **la trame se contredisait à deux lignes d'écart** : « choisie pour que la
     forme la plus étroite (0,210 mm) reçoive 2,3 carreaux », puis « élargie
     pour tenir le calcul ». Les deux ne peuvent pas être vraies. Trois cas,
     trois phrases — imposée, élargie par un budget, ou déduite de la forme la
     plus étroite. **Et sous quatre carreaux, une forme n'est plus maillée :
     elle est ÉCHANTILLONNÉE**, sa résistance sortant de la position de deux ou
     trois points et non de sa géométrie. La note d'élargissement disait « les
     rétrécissements plus fins qu'elle ne sont pas décrits », ce qui laissait
     croire qu'ELLE l'était : une alerte le dit désormais ;
   - **la part du courant qui repose sur une PORTÉE SUPPOSÉE est désormais
     chiffrée**, et c'est la seule façon dont ce calcul peut inventer du
     courant. Un perçage dont le fichier ne déclare pas les couches est pris
     traversant — l'hypothèse qui ne perd aucun chemin, donc la bonne par
     défaut ; mais si le trou est en réalité borgne, la liaison verticale
     n'existe pas et le courant que le solveur y fait passer n'est dans aucun
     cuivre réel. « 21 trous pris pour traversants » ne disait pas si ça
     **compte** : un via supposé qui porte 0,01 mA ne change rien, le même qui
     porte le tiers du rail change tout. La fiche rend donc une **part du
     passage**, nomme le plus chargé, et se taît sous un pour cent — une alerte
     qui s'allume toujours n'est plus une alerte. Les lignes concernées portent
     leur marque **sur les couches**, là où on la lit ;
   - **« 90 forme(s) écartée(s) »** ne se corrigeait pas. La note nomme
     maintenant les couches et compte par couche : c'est ce qui distingue un
     oubli d'empilage — une couche de cuivre entière absente, donc un chemin
     manquant — du cas normal, du cuivre sur une couche technique qui ne
     conduit pas.

   **LES BORNES SE RENOMMENT — FAIT LE 2026-09-03.** « pastille 32.1 ;
   72.34 » est ce que le fichier sait dire, pas ce que la carte veut dire : sur
   cinq bornes, deux couples de coordonnées ne se distinguent plus à l'œil, et
   le tableau du résultat les reprenait telles quelles — « la charge la plus mal
   servie est *pastille 32.1 ; 72.34* » au lieu de « *U7 VDD* ». Le nom est
   maintenant un champ, il voyage jusqu'au document (`repere`) donc jusqu'au
   résultat et aux exports, et vidé il retombe sur celui que la carte propose.
   **L'identité d'une borne est devenue sa POSITION** : elle se comparait par
   son nom, ce qui suffisait tant que le nom venait de la pastille — depuis
   qu'il se renomme, recliquer une pastille renommée posait une *seconde* borne
   au même endroit, donc deux fois le courant, sans un mot.

   **LA PROGRESSION, DANS LES CINQ ANALYSES — FAIT LE 2026-09-03.** « Le solveur
   travaille… », une fois, et plus rien : sur un calcul de dix secondes la page
   est identique à la seconde 1 et à la seconde 30, et rien ne distingue un
   solveur qui avance d'un solveur bloqué. **Pas de faux pourcentage** — le
   solveur ne rend rien avant d'avoir fini, et une barre qui monterait en
   devinant serait un mensonge qu'on croit. Ce qui est vrai et qui suffit : le
   **temps écoulé**, qui avance à chaque seconde et prouve que ça tourne ; la
   **taille** du problème, qui dit pourquoi c'est long ; les **étapes** en
   clair ; et, quand il y en a, la **progression réelle** — les lots d'une
   sélection éparse se comptent un par un, et là la barre est déterminée.

   **ET LE TERMINAL EN DIT PLUS.** `dc_solver` écrit désormais une ligne par
   étape avec sa durée — maillage, montage du système, gradient conjugué,
   thermique —, comme `simulation_em` le faisait déjà pour sa synthèse finale.
   C'est le seul endroit qui dise *laquelle* coince, et le panneau y renvoie.
   Le journal est **sans accent ni typographie**, et ce n'est pas de la
   négligence : `sys.stderr` d'une console Windows peut être en cp437, où
   l'em-dash et le degré n'existent pas — l'écriture y lèverait un
   `UnicodeEncodeError` et ferait échouer la requête *à cause d'une ligne de
   journal*.

   **UN PERÇAGE SUPPOSÉ EST MARQUÉ — FAIT LE 2026-09-03.** La résistance d'un
   via va comme 1/section : un diamètre deviné à cinquante pour cent près se
   paie **double** sur l'ohm. Or le tableau affichait « 0,076 mΩ » déduit d'une
   pastille et « 0,295 mΩ » lu dans le fichier avec le même aplomb, et seule une
   note de bas de panneau disait qu'il y en avait — sans dire *lesquels*. Les
   lignes concernées portent maintenant leur marque, dans le tableau et sous la
   sonde. **Et le dédoublonnage des perçages se fait par DISTANCE**, non plus
   par case d'arrondi : la clé était `Math.round(x*100)`, donc deux
   emplacements distants de deux microns mais posés de part et d'autre d'un
   demi-centième tombaient dans deux cases différentes et échappaient au
   dédoublonnage — deux résistances en parallèle là où il n'y a qu'un tube, et
   chaque ligne du tableau annonçant la moitié du passage réel.

   **LE RÉSULTAT S'EXPORTE — FAIT LE 2026-09-03.** Deux boutons sur la rangée
   qui reste quand les réglages se replient. Le **.csv** est une pièce — quatre
   tableaux à plat (bornes, nets, pire point, détail via par via) précédés des
   réglages qui les ont produits : un tableau de chiffres sans son λ, son
   ambiante et sa trame ne se vérifie pas six mois plus tard. Le **.json** se
   rejoue et se compare : il porte le problème entier et le résultat à côté,
   sans le potentiel par nœud — soixante mille nombres pèsent plus que tout le
   reste du fichier et ne se lisent pas. Les deux textes sortent de fonctions
   **pures** (`simDCCsvTexte`, `simDCJsonTexte`), ce qui les rend éprouvables
   sans navigateur : un export qu'on ne peut contrôler qu'en cliquant n'est pas
   contrôlé.

   **LE VOILE SE COUPE — FAIT LE 2026-09-03.** « Ce qui n'est pas dans la
   simulation s'estompe » s'allumait dès qu'une carte de chaleur existait,
   **sans interrupteur** : sous l'onglet Chute DC toute la carte passait au
   sombre, et le seul moyen de retrouver des couleurs normales était de
   *changer d'onglet*. Un affichage dont on ne peut pas sortir n'est pas un
   affichage. La case existe maintenant des deux côtés, avec deux valeurs
   d'usine différentes et une seule raison : la carte des impédances peint
   **tout** le cuivre sélectionné — ce qui reste dessous est du cuivre
   étranger, et l'estomper est exactement ce qu'on veut —, tandis que la carte
   de chute ne peint qu'**un net sur une couche**, un fil dans une carte
   entière, et le voile y efface le contexte qui sert justement à lire le
   résultat : les autres couches du même net, le connecteur d'arrivée, le
   composant alimenté. Allumé sous SI, éteint sous PI.

   **LA COUCHE PEINTE SE CHOISIT — FAIT LE 2026-09-03.** Il en faut une et une
   seule — superposer deux potentiels les mélangerait sans le dire —, mais le
   choix appartenait à l'outil : l'éditeur peignait sa couche active, la
   visionneuse celle de la **première charge posée**, et rien d'autre. Sur un
   rail qui traverse la carte — le cas ordinaire d'un calcul de chute — la
   couche où ça chauffe n'est presque jamais celle-là, et il fallait effacer les
   bornes et les reposer dans un autre ordre pour la voir, ce qui relance le
   calcul pour rien. L'outil **propose** désormais, la fiche **dispose** : une
   liste des couches que le résultat porte, « auto » suivant la proposition, et
   changer de couche ne coûte qu'un redessin — les images sont déjà là, une par
   couche.

   **LA PORTÉE DES PERÇAGES EST LUE — FAIT LE 2026-09-03.** IPC-2581 la déclare,
   mais pas sur le trou : sur le **calque** de perçage,
   `<Layer layerFunction="DRILL"><Span fromLayer toLayer/>`, que le padstack
   désigne par le `layerRef` de son `<LayerHole>`. Rien ne le lisait, donc tous
   les trous ressortaient traversants — et l'erreur allait dans les **deux**
   sens : sur une carte à six couches, un borgne 1-2 était monté en **chaîne**
   1→2→3→4→5→6, soit cinq résistances en série là où il en faut une
   (résistance surestimée, le côté prudent) mais aussi **quatre liaisons
   verticales inventées** entre des couches que rien ne joint (chute trop
   faible, le côté qui rassure). Non déclarée, la portée reste supposée
   traversante — l'hypothèse qui ne perd aucun chemin —, et les deux comptes
   sont **séparés** dans les notes. Rien n'est deviné d'après un nom de calque :
   une portée devinée à tort coupe un chemin réel et fait refuser tout le
   calcul, ce qui est bien pire. Le contrôle du **chemin de retour** s'en sert
   aussi, et c'est là que ça compte le plus : lui, l'erreur ne le rend pas
   prudent, elle le rend optimiste.

   **LE CHEMIN QUI CHANGE DE COUCHE EST BIEN CE QUI EST CALCULÉ**, et c'est
   désormais posé sur un étalon. La topologie d'un vrai rail — connecteur sur
   une plage en couche 1, trois vias qui plongent, plan d'alimentation en
   couche 3, cinq vias répartis qui remontent, pastille du composant en
   couche 1 — se résout à la **loi des nœuds près** : 3,0000 A qui descendent,
   3,0000 A qui remontent, et le solveur dit comment chaque étage se partage
   (le retour le plus chargé en prend 25,1 % au lieu de 20). Les vias d'un
   même couple de couches sont en **parallèle**, les deux étages en **série**,
   et `simDesequilibreVias` groupe par couple justement pour ne pas les
   sommer ensemble. Doubler un via de retour se lit aussi : de un à cinq, la
   chute tombe de 7,80 à 4,82 mV — dont 1,30 mV pour le tube retiré, et le
   reste pour la **constriction** du cuivre qui devait converger sur un seul
   trou, celle qu'on ne calcule pas de tête et qui est dans la carte de
   densité. Quatre cas dans
   [python/test/banc-dc.py](python/test/banc-dc.py), deux côté page.

   **UN VIA SURVOLÉ DIT CE QU'IL A PORTÉ — FAIT LE 2026-09-03.** La sonde
   lisait le carreau de trame ; or au droit d'un via, la question n'est pas la
   densité du cuivre, c'est « celui-là, il en a pris combien ? ». La réponse
   était dans le tableau, à retrouver parmi quinze lignes nommées « T7 » sans
   savoir laquelle est le via sous le curseur — et c'est précisément le chiffre
   qui décide d'en doubler un. L'étiquette porte maintenant, sous la valeur du
   carreau, **une ligne par liaison** à cet endroit : repère, couches, courant,
   chute, résistance. Un tube traversant est monté en chaîne, donc il en donne
   plusieurs — même courant, chutes différentes. Le disque de détection est
   celui du perçage, que le résultat transporte désormais (`percage`).

   **Ce qui manque encore de ce côté :**

   - les **courants venus du schéma**, toujours. Ce qui est là remplace la
     donnée manquante par une saisie, il ne la fabrique pas : dix consommateurs
     demandent dix clics, et personne ne vérifie que la somme correspond à
     quelque chose de réel. La saisie, elle, se règle désormais **dans l'unité
     qu'on veut** — V ou mV pour une source, A, mA ou µA pour une charge : un
     consommateur en veille tire 250 µA, et « 0,00025 » se tape mais ne se
     relit pas ;
   - le **cuivre étaleur** est mesuré sur les seules **zones** de chaque couche,
     pondérées par la part de carte qu'elles couvrent. Les pistes et les
     pastilles ne comptent pas : quelques pour cent d'une couche de routage,
     fragmentés, donc mauvaises ailettes. Le chiffre penche vers le chaud, ce
     qui est le bon sens de l'erreur, mais une couche de routage dense étale
     tout de même un peu ;
   - un **via sans net** n'est pas monté, et ne peut pas l'être : il
     relierait le premier cuivre venu, celui d'un autre net compris, et un
     court-circuit inventé est pire qu'un chemin manquant. C'est le cas
     ordinaire d'une couture de plan posée sans net actif — le calcul échouait
     alors sur « des nœuds n'atteignent aucune référence », un message juste
     dont la cause était ailleurs. Ils sont désormais **comptés et nommés**
     dans les deux outils ; il reste à leur deviner un net, ce que seule la
     connectivité pourrait faire ;
   - `h` en surface est un **ordre de grandeur** (12 W/(m²·K), soit environ 7 de
     convection naturelle et 5 de rayonnement) et il est **constant** : ni
     convection forcée, ni montée du rayonnement quand la carte chauffe. Ce
     dernier point penche du côté prudent.

2. **l'impédance vue par le composant** (Z du PDN en fréquence), qui demande le
   condensateur de découplage, son inductance parasite d'accès, et la capacité
   plan-plan. Cette dernière tombe directement de l'empilage déjà envoyé ;
3. **les résonances de plan**, qui demandent l'onde complète — donc la section
   ci-dessus.

Dans SI, à côté d'« Impédance » : le **couplage** et l'**impédance
différentielle** sont **faits depuis le 2026-08-31** — c'était bien le même
chantier, et le second membre généralisé a suffi. Voir « Quel solveur pour quel
besoin », point 1. Ce qui reste de ce côté-là est le **diagramme de l'œil**, qui
n'est que la réponse impulsionnelle des paramètres S déjà calculés.

### Réparer l'onde complète, ou l'assumer morte

`mom_engine.py` **est sur le chemin de calcul depuis le 2026-08-30.** Ce qui
l'en tenait écarté était le modèle de port, et ce n'est plus le cas : le port
est un via qui relie la piste au plan de masse, |S₂₁| passe de 0,0065 à 0,96
sur la même ligne, et ε_eff dé-embarqué tombe à 0,93 % de `ligne_mom`. Ce qui
reste est écrit plus bas, et se lit comme des réserves, pas comme des
blocages.

**Ce qui est réparé, et à combien.**

1. ~~La formulation EFIE est amputée de moitié.~~ **Faux depuis la 2026-08-28.**
   `compute_interactions` implémente la MPIE complète — terme de potentiel
   scalaire compris, produit scalaire vectoriel f_m·f_n.
2. ~~Les images complexes sont inventées.~~ **Réécrit.** `apply_dcim` passe par
   la fonction de Green spectrale **exacte** du milieu stratifié (cascade de
   lignes de transmission, TLGF), un vrai **GPOF** de Hua-Sarkar à **deux
   niveaux** (Aksun), et l'identité de Sommerfeld.
3. ~~`mom_engine` n'a qu'UN noyau pour DEUX potentiels.~~ **Réparé.** C'était le
   chantier n° 1 et il est fait. `G_A^xx = V_i^h/(jω)` suit la ligne **TE** ;
   `G_q = ω(V_i^h − V_i^e)/(j k_ρ²)` est la **différence des deux lignes** —
   Michalski-Zheng, formulation C. Et non « la ligne TM », comme cette page
   l'écrivait : le raccourci n'est juste qu'à la limite quasi-statique, où le TE
   ne porte rien d'électrostatique, ce qui explique que l'ancienne version
   donnait une capacité plausible. `green_layered.noyaux_green` rend les deux
   jeux d'images séparément, avec leurs constantes (μ₀ d'un côté,
   1/(ε₀ ε_ref) de l'autre) : `mom_engine` n'a plus de permittivité à choisir —
   `get_effective_epsilon`, qui moyennait les épaisseurs de tout l'empilage
   alors que l'ajustement normalise par le seul milieu porteur, est supprimé.
4. ~~L'onde de surface n'est pas extraite.~~ **Extraite** — pôle localisé par
   recherche de racine sur `Z_bas + Z_haut = 0`, résidu par `N/D'`, réinjecté
   analytiquement en `H₀⁽²⁾`. **Et ça n'a rien changé au champ lointain, ce qui
   était la découverte** : voir ci-dessous.
5. ~~La quadrature de `compute_interactions` est à un point.~~ **Réparée.** La
   correction logarithmique additive dont le poids était posé à la main (« 1,0
   si triangle partagé, 0,3 si sommet partagé ») est supprimée. La part
   singulière — l'image confondue avec la source, la seule qui pique — est
   intégrée par un **changement de variable polaire** qui annule le 1/R contre
   son jacobien, avec coupure au pied de la perpendiculaire ; le reste, borné,
   passe par Gauss à 7 points.
6. ~~`test_basic.py` est périmé et ne mesure rien.~~ **Supprimé**, remplacé par
   [mom_solver/tests/banc_chaine.py](mom_solver/tests/banc_chaine.py).

**Deux défauts de maillage trouvés au passage, et corrigés.** `mesh_polygon`
posait tous ses sommets à `z = 0` et le mailleur gardait ce zéro : une piste et
son plan de masse se retrouvaient **confondus dans l'espace**. Et le plan de
masse était **maillé**, alors que la fonction de Green le compte
analytiquement — son courant était compté deux fois. La règle vient maintenant
de `green_layered.indices_plans_masse`, appelée des deux côtés, pour qu'ils ne
puissent pas diverger.

**Ce que ça vaut, mesuré.** Trois bancs, **56 essais** au 2026-08-30.

| Contrôle | Résultat |
| --- | --- |
| Milieu vraiment homogène : les trois noyaux normalisés | 1 à 10⁻⁶ près |
| Plan de masse dans l'air : les deux potentiels valent `1 − exp(−2j k_z h)` | exact |
| Potentiel vecteur d'un microruban FR-4 : deux images parfaites | −1,00008 à 0,7400 mm pour 2h = 0,7400 mm |
| Rapport G_q/G_A en champ très proche contre (1+εr)/2 = 2,6850 | 2,6898 |
| Pôle d'onde de surface contre la relation de dispersion du manuel | 11 chiffres |
| Résidu du pôle contre sa forme fermée | 0,0004 % |
| Transformée du pôle (Hankel) sur une fonction purement rationnelle | 0,003 % |
| Images contre Sommerfeld numérique, 0,1 → 5 mm | 0,04 % (G_A), 0,74 % (G_q) |
| Désingularisation polaire contre la formule fermée de Wilton | 0,0002 % (0,019 % près d'un sommet) |
| **ε_eff d'une ligne de 12 mm contre `ligne_mom`** | **0,49 %** |
| La même, avec UN seul noyau pour les deux potentiels | **26 %** |

Cette dernière ligne est la mesure du chantier n° 1 : même maillage, même
ligne, seule change la fonction de Green du terme inductif.

**Trois choses que la mesure a démenties.**

1. **Le champ lointain ne décroche PAS à cause de l'onde de surface.** Cette
   page l'affirmait ; c'était plausible et jamais mesuré. Le pôle est
   maintenant extrait exactement, et l'écart n'a pas bougé (9,6 % à 10 mm
   avant, 9,6 % après). Sur 0,37 mm de FR-4 à 1 GHz le TM0 a
   `n_eff = 1,000018` : il est à peine lié et ne porte rien. **La vraie cause
   est le SECOND point de branchement**, celui du demi-espace d'air en `k₀` :
   la DCIM ajuste des exponentielles en `k_z` du *substrat*, ce qui est la
   bonne base pour le branchement de référence et n'en est aucune pour l'autre.
   Preuve : l'écart suit le contraste diélectrique et **disparaît** quand εr
   tend vers 1 (0,005 % à 10 mm contre 9,6 % sur du FR-4), ce qui ne serait
   vrai d'aucune autre cause. **Fait le 2026-08-30** : le troisième niveau de
   DCIM, paramétré en `k_z` de l'air, divise l'écart par trois (9,59 % →
   6,19 % à 10 mm). Il ne l'annule pas, et pour une raison qui se dit :
   l'onde latérale décroît en 1/ρ², les images en 1/ρ.
   *L'extraction du pôle reste utile et est conservée* : sur 3 mm de FR-4 à
   10 GHz (`n_eff = 1,222`) elle divise l'écart par trois à quatre.
2. **Le modèle de port ne conduisait rien, et la passivité n'y voyait rien.**
   `map_ports_to_rwg` associait à chaque port **une** arête : une tension posée
   sur une seule arête interne d'un ruban continu est **contournée par le métal
   d'à côté** — `|Y₂₁/Y₁₁| = 1,5·10⁻⁵`, `|S₁₁| = 1,0000`, `|S₂₁| = 0,0000`,
   quelle que soit la géométrie. Et la matrice S était parfaitement passive :
   un solveur qui ne transmet rien ne viole aucune conservation. C'est pourquoi
   `banc_chaine.py` sépare l'essai de passivité de l'essai de transmission.
   Le port est maintenant une **coupe complète** du conducteur — l'ensemble des
   arêtes dont les deux triangles tombent de part et d'autre d'un plan, donc la
   frontière exacte entre deux paquets de triangles : rien ne passe sans en
   traverser une. `|Y₂₁/Y₁₁|` passe à 5,0·10⁻², trois ordres de grandeur.
3. **Mais une coupe est une fente EN SÉRIE, et ce n'est pas un port de
   microruban** — **corrigé le 2026-08-30, voir plus bas.** Un port de
   microruban est une tension entre la piste et le **plan de masse** : il
   demande un courant **vertical**, donc un via. Entre
   deux fentes série, la piste est un conducteur flottant — le générateur ne
   voit que la capacité du tronçon qu'il isole (mesuré : `Z_in = 14 − j766 Ω`,
   soit quelques centièmes de picofarad). Une fente série finit par coupler au
   mode guidé, mais seulement quand la ligne est longue devant la longueur
   d'onde, et **c'est mesuré sur une même géométrie** :

   | L/λ_g | 0,07 | 0,37 | 0,75 | 1,50 |
   | --- | --- | --- | --- | --- |
   | \|S₂₁\| | 0,007 | 0,106 | 0,206 | 0,540 |

   La croissance est la signature : un écart venu de la fonction de Green ou de
   la quadrature n'aurait aucune raison de suivre L/λ. C'est aussi pourquoi
   `banc_moteur.py` mesure ε_eff sur **l'onde stationnaire du courant** au
   milieu d'une ligne de une virgule cinq longueur d'onde, et non sur des
   paramètres S : là, le couplage est établi et le modèle de port ne compte
   plus.

**Ce qui a été fait le 2026-08-30, et ce qui reste.**

1. ~~Le port de microruban demande des courants VERTICAUX.~~ **FAIT.** Ce qui
   existait — `excitation_via_port()`, `courant_total_via()`,
   `_creer_via_port()` — approchait l'excitation par des **poids en distance**
   sur les arêtes horizontales voisines : ça n'introduisait aucun courant
   vertical, seulement une excitation floue de la piste. Ces trois fonctions
   ont été remplacées, pas complétées.

   **Le port est maintenant un puits.** On perce le maillage — un triangle
   retiré —, on descend un fût sur le contour du trou, et on pose le
   générateur sur la fente infinitésimale entre le bas du fût et le plan de
   masse. Percer plutôt que souder sous la piste évite la **jonction en T** :
   chaque arête du trou retrouve exactement deux triangles, donc une RWG
   ordinaire, et rien de nouveau n'est nécessaire au sommet.

   Quatre pièces, chacune éprouvée séparément :

   - **`G_A^zz`**, la composante verticale du potentiel vecteur. Elle se
     dérive en trois pas — un courant vertical est une source de **tension en
     série** sur la ligne TM, là où un courant horizontal est une source de
     **courant en parallèle** — et elle tient en une ligne :
     `G_A^zz = μ₀ I_v^e/(jω ε₁)`. Sa signature la fixe : un dipôle électrique
     **vertical** a une image de **même signe** dans un conducteur parfait,
     quand un dipôle horizontal en a une opposée. Le banc mesure 3·10⁻¹⁶
     contre la forme fermée, et vérifie qu'on est loin de l'autre signe ;
   - **quatre familles de rayons** pour lire n'importe quel couple de
     profondeurs sans réajuster. Une DCIM par couple (ζ, ζ′) serait hors de
     prix ; ajuster une fois à mi-hauteur et décaler la profondeur ne marche
     pas — mesuré, 3 à 60 % d'écart. La série des rebonds entre le plan et
     l'interface du haut se somme en forme **fermée** : deux amplitudes,
     quatre chemins géométriques, exact à 1,4·10⁻¹⁵ sur 49 couples ;
   - les **demi-RWG** du bas du fût. Une `RWGBasis` d'aire moins nulle : la
     fonction ne vit que sur son T+, et c'est **exact**, parce que son image
     dans le plan de masse complète la fonction et porte la charge opposée —
     ce que la fonction de Green stratifiée produit toute seule ;
   - le **dé-embarquement** par T₂T₁⁻¹, qui élimine les accès par similitude
     et lit γ sur les valeurs propres d'une matrice 2×2. Sans étalon d'aucune
     sorte, et avec son propre garde-fou : les deux valeurs propres doivent
     être inverses l'une de l'autre, ce qu'elles sont à 2·10⁻¹⁶.

   **Une cinquième pièce qui n'était pas au programme, et sans laquelle tout
   le reste est faux de 9 % :** la **hauteur électrique**. Le modèle 2,5D
   suppose le cuivre infiniment mince, mais le maillage lui donne une
   épaisseur géométrique. Un fût bâti du sommet du cuivre du plan au sommet du
   cuivre de la piste mesure h + 2t au lieu de h. On compte donc en
   **profondeur sous la piste**, dans la pile que `profil_spectral` établit
   déjà, et la question ne se pose plus.

   **Trois défauts trouvés en chemin, tous silencieux :** le test de
   coplanarité se faisait par une dénivelée en `z` — deux triangles d'une même
   facette de fût sont coplanaires et n'ont pas le même `z`, ils auraient été
   envoyés à Gauss seul, qui n'intègre pas un 1/R ; `_impedance_vue` rendait
   l'impédance du **vide** quand la pile devenait vide, même sur un
   court-circuit, ce qui arrive exactement sur l'anneau du bas du fût, posé
   sur le plan ; et `np.cross` coûtait 15 % du temps d'assemblage sur des
   vecteurs de trois nombres.

   **Ce qui est négligé, et il faut l'écrire :** la formulation C porte un
   terme correctif `G^C` qui couple courant vertical et courant horizontal par
   le potentiel **vecteur**. Sans lui, un via et une piste ne se parlent que
   par leurs **charges**. Ce qui manque est l'inductance du **coin**, là où le
   courant tourne — et c'est précisément ce que le dé-embarquement retire.

2. ~~Le second point de branchement n'est pas ajusté.~~ **RÉPARÉ.** Le
   diagnostic de 2026-08-29 était juste mais incomplet : il y avait **trois**
   fautes, toutes du même genre — deux bases confondues.

   - les images du 3ᵉ niveau étaient poussées dans la même liste que les deux
     premiers et resommées avec le `k` du **substrat**, alors qu'elles avaient
     été ajustées contre `exp(−j k_z^air d)`. `ComplexImage` porte maintenant
     son `k_onde`, et `_somme_ondes` somme chaque groupe avec le sien ;
   - **le reste à ajuster était pris dans la mauvaise base aussi** : on
     retranchait `somme(kz_air, images)`, c'est-à-dire les images des deux
     premiers niveaux évaluées en `k_z` de l'air. Il faut les évaluer avec
     **leur** `k_z`, celui du substrat aux mêmes `k_ρ` ;
   - **et le garde-fou de portée les rejetait toutes.** « Une image plus loin
     que la carte n'est pas physique » se mesure en épaisseurs de stratifié —
     74 mm sur du FR-4 de 0,37 mm. Or les images du branchement air
     représentent l'onde **latérale**, dont l'échelle est la longueur d'onde
     dans l'air : à 1 GHz, de 77 à 866 mm. **Zéro image posée**, et l'écart à
     10 mm inchangé au dixième de pour cent près.

   **Mesuré après réparation** : `banc_dcim` repasse de 21 à **25/25**,
   l'écart d'ε_eff de `banc_moteur` revient de 11,4 % à **0,49 %** — celui du
   chemin à deux niveaux, à quatre décimales —, l'invariant à contraste nul
   tient (0,148 % contre 0,149 %), et l'erreur de champ lointain est divisée
   par trois sur les trois noyaux : 9,59 % → 6,19 % à 10 mm, 40,8 % → 27,7 %
   à 30 mm sur le potentiel scalaire.

   **Il reste hors du chemin par défaut, et pour une autre raison qu'avant :
   son coût.** Le gain est en champ lointain, là où le noyau vaut six ordres
   de grandeur de moins qu'en champ proche — sans conséquence pour une matrice
   d'impédance, ce que l'essai d'ε_eff confirme au chiffre près. Le prix, lui,
   est immédiat : huit images de plus par noyau dans la boucle la plus chaude.
   On l'allume pour un calcul de **rayonnement**, pas pour un paramètre S.

   **Ce qu'il ne fait toujours pas** : il divise l'erreur lointaine par trois,
   il ne l'annule pas. L'onde latérale décroît en 1/ρ² quand les images
   décroissent en 1/ρ, et une somme finie d'exponentielles ne rend pas cette
   loi-là. La sortir en forme fermée, comme on a sorti le pôle d'onde de
   surface, serait le chantier suivant.

3. ~~Un seul plan source.~~ **FAIT, et ce n'était pas de la plomberie.**
   `profils_noyaux_multiples()` rendait un noyau croisé qui était, **au bit
   près**, celui de la couche du bas : elle construisait un « profil croisé »,
   puis rappelait `noyaux_green(stackup, freq, n, z_src=z_i)` sans le lui
   passer. Vérifiable en une ligne, et vérifié. Deux couches de signal étaient
   calculées comme une.

   **Et le profil croisé lui-même n'était pas la bonne idée** : il recollait
   le bas d'une couche et le haut de l'autre pour fabriquer un empilage qui
   n'existe pas. La fonction de Green entre deux plans n'est pas celle d'un
   autre empilage — c'est la **même** ligne de transmission, avec la source à
   z′ et l'observation à z. Ce qui change n'est pas le circuit, c'est
   l'endroit où on lit la tension :

       V_i(z, z′) = [Z_bas(z′) ∥ Z_haut(z′)] × T(z′ → z)

   `profil_croise` / `noyaux_croises` le calculent, et trois choses le
   vérifient, chacune contre quelque chose qui ne vient pas du module : la
   **réciprocité** V_i(z,z′) = V_i(z′,z) à 10⁻¹⁴ entre deux calculs qui n'ont
   rien en commun ; la **cohérence** avec `_impedance_vue` sur la pile
   complète à 4·10⁻¹⁶ ; et une **forme fermée** — deux plans de signal
   au-dessus d'un plan de masse dans l'air — qui redonne exactement les deux
   images +1 et −1 aux profondeurs h₂−h₁ et h₂+h₁.

   `mom_engine` route désormais chaque paire de triangles vers le noyau de sa
   paire de couches, par `noyaux.pour(couche_m, couche_n)`. `NoyauxGreen`
   porte la même méthode et se rend lui-même, de sorte qu'un empilage à une
   seule couche traverse **exactement** le même code qu'avant. Un plan de
   masse entre deux couches de signal rend un bloc **exactement nul**, et non
   un couplage approché : un plan est une terminaison, le champ ne le traverse
   pas.

4. ~~L'assemblage plafonne vers 300 fonctions de base.~~ **FAIT AUTREMENT, ET
   MIEUX.** Le profil désignait bien `_somme_ondes` — 10,2 s sur 20,4 —, mais
   pas pour la raison qu'on croyait. Le calcul était fait **image par image**,
   en une poignée d'opérations numpy sur des tableaux de 49 nombres : le coût
   était celui des **appels**, pas des flottants. Rangé en tableaux
   (points × images), l'assemblage passe de **20,4 s à 5,0 s** pour 269 RWG —
   un facteur quatre.

   **C'est exact**, et c'est ce qui change tout par rapport au plan initial.
   La piste retenue était de tabuler les noyaux sur une grille de ρ et
   d'interpoler dans un noyau numba ; elle aurait demandé sa propre étude
   d'erreur. Celle-ci n'en demande aucune : c'est la même somme, écrite
   autrement, et le banc le vérifie contre une somme naïve.

   **Et le profil est maintenant plat.** `_somme_ondes` n'y pèse plus que
   19 %, `points_polaires` 22 %, `terme_courant` 13 % : une tabulation
   approchée ne rapporterait au mieux qu'un facteur 1,2, pour le prix d'une
   approximation à valider. Ce n'est plus la bonne dépense. Le prochain
   facteur, s'il en faut un, est algorithmique — compression de la matrice,
   ACA ou multipôles —, pas arithmétique.

5. **Le plan de masse est supposé infini et parfait — HYPOTHÈSE FONDAMENTALE,
   et c'est une réserve écrite, pas un défaut à corriger.** Ce n'est pas un
   choix d'implémentation : un plan de masse n'est pas un conducteur du
   problème, c'est une **terminaison** du circuit de lignes de transmission.
   C'est cette hypothèse qui permet la fonction de Green spectrale analytique,
   donc qui rend le 2,5D possible du tout. La lever demande un solveur qui
   **maille** le plan — de l'ordre du million d'inconnues, là où le 2,5D en
   tient quelques centaines.

   Le détail est écrit dans le code, en tête de `indices_plans_masse`
   ([mom_solver/green_layered.py](mom_solver/green_layered.py)), et se résume
   ainsi :

   | Cas | Ce que le modèle fait |
   | --- | --- |
   | Plan étroit devant la hauteur | sous-estime l'inductance ; hors domaine sous ~3 h de large |
   | **Plan fendu sous la piste** | rend le résultat du plan **plein** — pas dégradé, faux |
   | Plan percé d'un champ de vias | correct tant que trous et pas restent petits devant h |
   | Conductivité finie | aucune perte de plan ; erreur systématique, toujours dans le même sens |
   | Deux plans, cavité entre eux | pas de modes de cavité ; ne dit rien du PDN |

**Résumé de l'état du moteur 2,5D**, tel que les trois bancs le mesurent —
**56 essais, tous passés au 2026-08-30** :

| | État | Ce que la mesure dit |
| --- | --- | --- |
| Green spectrale, deux noyaux séparés | ✅ | ε_eff à **0,49 %** de `ligne_mom` ; 26 % avec un noyau unique |
| DCIM à **deux** niveaux, pôle extrait | ✅ | images contre Sommerfeld : 0,04 % (G_A), 0,74 % (G_q) |
| DCIM à **trois** niveaux (branchement air) | ✅ | réparé : 25/25, erreur lointaine ÷3 ; hors chemin par défaut **pour son coût** |
| Port horizontal (coupe complète) | ✅ | \|Y₂₁/Y₁₁\| passe de 1,5·10⁻⁵ à 5,0·10⁻² |
| **Port vertical (via)** | ✅ | \|S₂₁\| de **0,0065 à 0,96** sur la même ligne ; G_A^zz à 3·10⁻¹⁶ de la forme fermée |
| **Dé-embarquement T₂T₁⁻¹** | ✅ | ε_eff à **0,93 %** de `ligne_mom` (5 GHz), 1,11 % (10 GHz) ; résidu de réciprocité 2·10⁻¹⁶ |
| **Multi-couches de signal** | ✅ | noyau croisé exact (réciprocité 10⁻¹⁴, forme fermée à 10⁻¹⁴) ; branché dans `mom_engine` |
| Plan de masse parfait et infini | ⚠️ | hypothèse du modèle, **réserve écrite** — non levable sans solveur 3D |
| Performance | ✅ | 269 RWG en **5,0 s** (était 20,4 s) ; exact, pas tabulé ; profil plat |
| Terme correctif `G^C` de la formulation C | ⚠️ | négligé : via et piste ne se parlent que par leurs charges ; retiré par le dé-embarquement |

**Le cas de non-régression a été fait.** Une ligne microruban sur 0,37 mm de
FR-4, deux longueurs (6 et 12 mm), même pas de maille, ports verticaux
identiques :

| | \|S₁₁\| | \|S₂₁\| | \|S₁₁\|²+\|S₂₁\|² |
| --- | --- | --- | --- |
| Ancien port, fente série, L = 6 mm | 0,9972 | **0,0744** | — |
| Port vertical, L = 6 mm | 0,2607 | **0,9642** | 0,9975 |
| Port vertical, L = 12 mm | 0,0959 | **0,9925** | 0,9943 |

et, dé-embarqué, ε_eff = 3,4893 contre 3,4573 pour `ligne_mom` à 5 GHz —
**0,93 %**. Le |S₁₁| de 0,26 sur la ligne courte n'est pas un défaut : c'est
le via, le trou percé et le coin, c'est-à-dire exactement ce que le
dé-embarquement retire.

Sur la carte du banc de chaîne, avec le maillage réel — irrégulier, pas la
grille du banc moteur —, le même changement donne |S₂₁| = 0,0065 → **0,9870**,
et la structure reste passive (0,9883, le FR-4 y ayant un tan δ de 0,022).

Le port par défaut de `main.py` est désormais `--port via` ; `--port fente`
reste disponible, parce qu'un port au **milieu** d'une structure — une coupure
de piste, un composant série — est bien une fente.

Les dépendances de maillage (`gmsh`, `meshio`, `pygmsh`) sont installées ; la
chaîne va du JSON au fichier Touchstone.


### Ce qu'il reste au panneau de simulation

Trois chantiers, chiffrés et indépendants. Les trois premiers ont été
spécifiés en détail ; le dernier attend le moteur.

#### 1. ~~Le masque de soudure dans le calcul~~ **FAIT (2026-08-28, corrigé le 2026-08-29)**

**~~*(le plus gros gain immédiat)*~~**

~~Une piste de couche extérieure est sous vernis. Le masque remplit l'écart~~
~~coplanaire — là où le champ est le plus dense — et fait **baisser Z₀ de 2 à~~
~~3 %**, soit environ 1,5 Ω sur une ligne à 50. La fiche le signale ; le calcul ne~~
~~le compte pas.~~

~~**Ne pas se contenter de l'ajouter à l'empilage** : `_couverture()`~~
~~([python/simulation_em.py](python/simulation_em.py)) accumule tout le non-cuivre~~
~~au-dessus sans regarder ce que c'est, `_entre_exterieur()` en fait une moyenne~~
~~d'εr appliquée à **toute** la région 0→h+c — y compris entre la piste et le~~
~~plan, où il n'y a pas de masque —, et `solve_line` jette toute couverture plus~~
~~mince que le cuivre (`c_diel < max(t, 1e-9)`), donc un masque de 25 µm sous~~
~~35 µm de cuivre disparaît **en silence**.~~

~~Ce qu'il faut :~~

~~- **une fonction de Green à trois régions** dans `ligne_mom.py` : stratifié εr₁~~
~~  de 0 à h, masque εr₂ de h à h+c, air au-dessus. Elle se dérive comme~~
~~  l'existante et **subsume les deux** :~~

~~    G = K / (ε₀ β (M + εr₁ K coth(βh)))~~
~~    K = ch(βc) + sh(βc)/εr₂       M = εr₂ sh(βc) + ch(βc)~~

~~  avec c = 0 qui redonne le microruban nu et εr₂ = εr₁ le couvert. L'asymptote~~
~~  devient ε₀(εr₁+εr₂)/2, ce qui unifie les deux extractions de milieu moyen~~
~~  aujourd'hui écrites en branches séparées dans `solve_line` ;~~
~~- **baisser le seuil** qui jette les couvertures minces ;~~
~~- `section_de_couche` ne doit plus **homogénéiser** : `_couverture()` rend~~
~~  (épaisseur, εr) et la couverture part telle quelle ;~~
~~- côté pages : `simStackupIpc` ajoute la couche masque en tête et en queue, lue~~
~~  du fichier IPC-2581 quand il la porte (`SOLDERMASK`, déjà reconnu par~~
~~  [visionneuse-ipc2581/js/02-modele.js](visionneuse-ipc2581/js/02-modele.js)),~~
~~  sinon saisissable avec repli 25 µm / εr 3,8 — et **la provenance le dit** ;~~
~~  côté éditeur PCB, `S.stack.maskT`/`maskEr` existent déjà, il n'y a qu'à les~~
~~  envoyer ;~~
~~- `simTopoNom` doit distinguer **« microruban sous masque »** de « microruban~~
~~  couvert », sinon une piste externe vernie et une piste interne portent le~~
~~  même mot ;~~
~~- **réserve à écrire dans le code** : le masque est modélisé en nappe uniforme,~~
~~  le vrai est conforme — plus mince sur le sommet du cuivre que dans l'écart.~~
~~  Second ordre devant les 2–3 %, mais ça doit être écrit.~~

**Ce qui est fait :**

- `green_spectral_micro_masque` dans `ligne_mom.py` : Green à trois régions
  (substrat/masque/air), avec les formules exactes ci-dessus. La **fonction**
  était juste dès le premier jet — les trois réductions le confirment à la
  précision machine ;
- `solve_line` prend `masque = {epaisseur, epsilon_r}` et route vers la Green
  appropriée ;
- `section_de_couche` détecte les couches extérieures et envoie le masque au
  solveur (défaut 25 µm / εr 3,8 si non déclaré) ;
- le segment de sortie porte `"masque"` avec son épaisseur et εr.

**Ce qui était FAUX, et qu'aucun cas ne mesurait (corrigé le 2026-08-29) :**

- la référence **à vide** gardait le masque à son εr — `g_vide` appelait la
  Green à trois régions avec `εr_substrat = 1` et `εr_masque = 3,8`. C₀
  gonflait, et **ε_eff BAISSAIT quand on vernissait la piste**, ce qui est
  l'inverse de la physique. Z₀ tombait de 7,8 % au lieu des 2 à 3 % que cette
  page annonçait ;
- le **milieu moyen** extrait était celui du substrat seul, alors que
  l'asymptote de la Green vaut ε₀(εr₁+εr₂)/2 — ce que cette page écrivait
  déjà, deux paragraphes plus haut ;
- un masque d'épaisseur nulle ne retombait sur aucune branche : `eps_moyen`,
  `g_diel` et `echelles` restaient indéfinis, et `solve_line` levait
  `NameError`.

Avec les trois corrections : 25 µm de vernis à εr 3,8 donnent **−2,53 %** sur
Z₀ et font monter ε_eff de 3,288 à 3,461. Un masque à εr = 1 redonne
exactement le microruban nu.

**Non-régression, écrite** : cinq cas dans
[python/test/banc-ligne-mom.py](python/test/banc-ligne-mom.py) — les trois
réductions exactes (c = 0, εr₂ = εr₁, c → grand), le chiffre attendu **et son
sens**, et le masque d'air qui ne fait rien. C'est le cas « sens de l'effet »
qui aurait attrapé le défaut : l'amplitude seule, à 7,8 %, restait plausible.

#### 2. ~~Voir et dire les discontinuités~~ **FAIT (2026-08-28)**

**~~*(peu cher, gros gain de lisibilité)*~~**

~~Le modèle ne change pas ; la fiche cesse d'être muette.~~

~~- **`_coudes()`** dans `simulation_em.py` : l'angle à chaque raccord, à partir~~
~~  des `start`/`end` déjà envoyés. Rendre le nombre de coudes, leur angle, et la~~
~~  **capacité d'excès estimée** en femtofarads avec ce qu'elle vaut en degrés de~~
~~  phase à f₀. Une note qui **chiffre** la négligeabilité vaut mieux qu'une note~~
~~  qui l'affirme ;~~
~~- **`_transitions()`** : détecter les changements de `layer` **le long de la~~
~~  chaîne** et les nommer (« Conductor-4 → Conductor-1 au tronçon 7 »). Ça~~
~~  remplace la note « N vias du net », qui compte le mauvais ensemble — les vias~~
~~  du net entier, y compris hors sélection ;~~
~~- **`_ruptures()`** gagne un contrôle de couche : deux tronçons au même XY sur~~
~~  deux couches différentes ne sont pas un raccord, c'est un via. Aujourd'hui il~~
~~  ne compare que les coordonnées, or les deux bouts d'un via sont au même XY :~~
~~  la chaîne est déclarée continue et le via passe inaperçu.~~

~~À savoir, et qui est déjà juste : la **longueur** envoyée est celle du cuivre~~
~~(`trkLen`, au prorata de la plage), pas la corde — un demi-tour n'est pas~~
~~raccourci, et le retard est bon. Seule la discontinuité manque.~~

**Ce qui est fait :**

- `_coudes(objets)` : calcule l'angle de chaque raccord, la capacité d'excès
  estimée (Gupta), et la phase en degrés à 5 GHz ;
- `_transitions(objets, couches)` : détecte les changements de couche, nomme les
  conductiveurs concernés ;
- `_ruptures(objets)` corrigée : compare maintenant XY ET couche. Deux tronçons
  au même XY sur couches différentes sont un via, pas une continuité ;
- le résultat porte `discontinuites = {coudes, transitions}`.

#### 3. ~~Modéliser les discontinuités~~ **FAIT (2026-08-28, corrigé le 2026-08-29)**

~~Insérer dans la cascade ABCD un élément localisé par discontinuité : shunt C~~
~~pour le coude (Gupta), π L-C pour le via (`L ≈ (µ₀h/2π)[ln(4h/d)+1]`, C de~~
~~pastille/antipastille). Demande que les pages **envoient les vias de la~~
~~chaîne** (perçage, pastille, portée) — la visionneuse les a, l'éditeur aussi.~~
~~Le format `cao-sim-em-1` gagne alors un tableau `transitions` et passe à `-2`.~~

**~~À 868 MHz ça ne déplacera aucun chiffre lisible~~** : ~~λ vaut 197 mm dans le~~
~~stratifié, un coude à 45° pèse quelques femtofarads.~~

**À 5 GHz, c'est dans le périmètre.** λ_g ≈ 40 mm sur FR-4, et les
discontinuités commencent à compter au-delà de 2-3 GHz. La note originale
ci-dessus a été écrite pour 868 MHz (λ ≈ 197 mm).

**Ce qui est fait :**

- `ligne_mom.py` : `elements_coude()` — le modèle **de Gupta**, celui de
  *Microstrip Lines and Slotlines*, qui rend le couple (L, C) —,
  `abcd_coude()` qui monte le **T complet**, `abcd_via()` en π exact,
  `inductance_via()` et `capacite_pastille()` ;
- `simulation_em.py` insère ces matrices dans la cascade pour chaque coude et
  chaque transition de couche détectés, et enrichit `discontinuites` avec
  **les mêmes valeurs** ;
- les formats passent de `cao-sim-em-1` à `cao-sim-em-2` et de
  `cao-sim-em-resultat-2` à `cao-sim-em-resultat-3`.

**Ce qui était faux, et qu'aucun cas ne mesurait (corrigé le 2026-08-29) :**

- **trois copies des mêmes formules, trois résultats.** Une dans `_coudes`
  pour l'affichage, une dans `solve_line` pour la cascade, une troisième dans
  `ligne_mom`. La fiche annonçait **21,28 fF** de capacité de coude là où la
  cascade en appliquait **0,394** — cinquante-quatre fois moins, dans la même
  réponse. Il n'en reste qu'une, et elle sert aux deux usages ;
- **la formule dite « de Gupta » n'en était pas.** Ni hauteur au plan — qui
  est le paramètre dominant —, ni angle : un coude à dix degrés pesait autant
  qu'un coude à angle droit, et un raccord parfaitement aligné aussi ;
- **la cascade appelait en millimètres des fonctions écrites en mètres.**
  Dans `inductance_via`, le rapport h/d est sans dimension : le logarithme
  survit à l'erreur, seul le préfacteur μ₀h la trahit — l'inductance sortait
  **mille fois** trop grande, et la capacité de pastille aussi (elle va comme
  d²/h). Un ordre de grandeur faux dans une fiche a l'air d'un ordre de
  grandeur ;
- la **fréquence** du modèle de coude était posée à 5 GHz en dur, quelle que
  soit la bande demandée. C'est la fréquence centrale de l'analyse ;
- `abcd_coude` ne posait qu'un **shunt C**, jetant l'inductance série — celle
  qui porte l'essentiel de l'excès au-delà de quelques gigahertz.

Sur un coude à 90° d'une piste de 0,38 mm sur 0,2 mm de FR-4, le modèle rend
maintenant **26,1 pH et 41,6 fF**, soit 0,78° de phase à 868 MHz — et c'est ce
chiffre-là, celui qui dit s'il faut s'en soucier, que la fiche affiche.

**Non-régression, écrite** : quatre cas dans
[python/test/banc-ligne-mom.py](python/test/banc-ligne-mom.py) — les formules
de Gupta reposées à la main, l'annulation à angle nul et la moitié à 45°,
`det(ABCD) = 1` sur les deux réseaux (ce que vaut tout réseau passif
réciproque, et rien d'autre ne l'attraperait), et l'ordre de grandeur du via.

~~**Ce qui reste** : **aucune page n'envoie les vias.**~~ **FAIT (2026-08-30),
et trois autres défauts avec — tous silencieux, tous dans les fonctions qui
LISENT la sélection avant le solveur.**

**1. Les deux pages envoient maintenant les cotes du via.**

- côté éditeur, `simViaAuRaccord()` / `simAccrocherVias()`
  ([editeur-pcb/js/19-simulation.js](editeur-pcb/js/19-simulation.js)) :
  à chaque changement de couche, on cherche le via de `S.vias` posé au raccord
  et dont la portée couvre le saut. Entre deux qui conviennent, **le plus
  court** — un traversant retenu à la place d'un enterré donnerait une
  inductance presque double, et personne ne le verrait ;
- côté visionneuse, `simViaAuRaccordIpc()`
  ([visionneuse-ipc2581/js/07-simulation.js](visionneuse-ipc2581/js/07-simulation.js)) :
  la source est plus pauvre — l'IPC-2581 porte des **trous** d'un côté et des
  **pastilles** de l'autre —, et on reprend les deux règles du chemin DC : un
  trou marqué NON métallisé ne joint rien, et à défaut de trou déclaré deux
  pastilles au même endroit valent un tube, perçage déduit ;
- le via s'accroche au tronçon d'**arrivée**, parce que c'est
  `objets[trans["troncon"]]` que le serveur relit, et que `troncon` est le rang
  du second.

**LA HAUTEUR N'EST PAS ENVOYÉE, ET C'EST VOULU.** L'éditeur la connaît —
`stackSpan()` est ce qui commande le foret de l'Excellon — mais le serveur la
recalcule depuis l'empilage qu'on lui envoie, par la même somme. Deux
définitions de la même longueur, c'est deux chiffres le jour où l'une dérive.
Les pages n'envoient donc que ce que le serveur ne peut **pas** savoir : le
perçage et la pastille.

**2. La hauteur du via se lisait dans l'empilage, et personne ne la lisait.**
`_hauteur_via()` la somme, bornes comprises. L'ancien repli — « 0,2 mm par
couche traversée » — comptait en indices d'**empilage**, qui alternent cuivre
et diélectrique : cela faisait 0,4 mm par couche de cuivre franchie, ce qui n'a
de rapport avec rien. Sur un empilage quatre couches ordinaire, une liaison
TOP → BOT donnait **1,200 mm** quand l'empilage en dit **1,340** : 12 %
d'erreur, que l'inductance emporte au premier ordre. Mesuré sur le cas du
banc : L passe de **0,905 nH à 1,041 nH**.

**3. Un changement de couche fabriquait un coude.** `_coudes()` ne regardait
pas les couches : deux tronçons colinéaires sur deux couches différentes
donnaient un coude de **0°, 0 pH, 0 fF**, affiché dans la fiche à côté du via.
Deux tronçons sur des couches différentes ne se raccordent pas dans un plan —
ce qui les joint est un via, et c'est le modèle de via qui s'applique. Un
alignement sur la même couche n'en est pas un non plus, et le seuil qui le dit
est celui de la **résolution des coordonnées** (0,1°, dix fois au-dessus du
bruit d'arrondi), pas un jugement sur ce qui mérite d'être modélisé : un coude
de 5° reste émis, avec son dix-huitième de la valeur à angle droit.

**4. Un via était compté comme une rupture.** `_ruptures()` exigeait **deux**
points de contact pour reconnaître un via, en commentant « les deux bouts du
via sont au même XY ». Non : un via joint la **fin** d'un tronçon au **début**
du suivant, ce qui fait **un** point commun. Toute liaison changeant de couche
était donc annoncée rompue, et le panneau prévenait « la sélection n'est pas un
parcours continu » devant un parcours parfaitement continu. Un avertissement
qui crie à tort finit par ne plus être lu, et c'est ce qui rend ce défaut plus
grave que son ampleur : le jour où la sélection est vraiment rompue, personne
ne le voit.

**5. Et la fiche ne montrait rien de tout cela.** `res.discontinuites`
arrivait dans le résultat et n'était lu **nulle part** : le serveur cascadait
les coudes et les vias — la courbe S les portait — sans que rien ne le dise.
Devant un |S₂₁| qui plonge, personne ne pouvait savoir si un via y était
compté. `simDiscontinuites()`
([commun/simulation-em.js](commun/simulation-em.js)) affiche maintenant, par
discontinuité : son rang, son type, les couches franchies, les cotes du via,
son L, son C, et **la phase qu'il vaut à la fréquence centrale** — c'est ce
dernier chiffre qui dit s'il faut s'en soucier, et une phase sous le dixième de
degré est marquée comme telle. La provenance voyage **cote par cote** :
`hauteur_source`, `percage_source`, `pastille_source` valent « page »,
« empilage » ou « repli », de sorte que la fiche puisse dire que la hauteur est
exacte pendant que le perçage ne l'est pas.

**Non-régression, écrite** : cinq cas dans
[python/test/banc-ligne-mom.py](python/test/banc-ligne-mom.py) — la hauteur
contre l'épaisseur de carte connue d'avance, le via borgne, l'indifférence au
sens, le coude qui disparaît sur un changement de couche et survit à 5°, le via
qui n'est plus une rupture pendant qu'une vraie rupture le reste, la provenance
de chaque cote, et le fait qu'un perçage plus fin donne **plus** d'inductance ;
cinq dans [editeur-pcb/test/harness.js](editeur-pcb/test/harness.js) — le via
accroché au bon tronçon, l'absence de via inventé, le via borgne qui ne couvre
pas le saut, le plus court entre deux qui conviennent, et le via trop loin ;
quatre autres pour l'affichage — le décompte, le chiffre supposé dit comme tel,
le silence expliqué, la phase négligeable marquée ; et quatre dans
[visionneuse-ipc2581/test/harness-sim.js](visionneuse-ipc2581/test/harness-sim.js)
— le trou déclaré, les deux pastilles qui valent un tube, le trou nu qui ne
joint rien, et le raccord sans rien.



### Le chemin de retour du courant — FAIT le 2026-08-30

**CE QUI ÉTAIT FAUX, ET DANS QUEL SENS.** Un via était chiffré par une
inductance **partielle propre** : celle d'un conducteur seul, sans dire par où
le courant revient. Or un courant revient toujours, et c'est la **surface de
boucle** qu'il enferme qui porte l'inductance. Deux cartes identiques à ceci
près que l'une a son via de masse à 0,4 mm et l'autre à 3 mm rendaient donc le
**même** |S₁₁| — alors qu'elles diffèrent d'un facteur deux, et que le
placement de ce via est justement la décision que l'outil devrait éclairer.

**1. L'inductance est celle de la boucle, calculée exactement.**
`inductance_boucle_vias` ([python/ligne_mom.py](python/ligne_mom.py)) résout la
matrice d'inductance partielle du via de signal et de ses retours.

- **Grover exact, pas l'approximation des manuels.** `L = (µ₀h/π)·ln(2s/d)`
  suppose h ≫ s ; sur une carte h vaut 1,5 mm et s 0,6, le rapport vaut 2,6, et
  l'approximation **surestime de 21 %** — de 56 % à 3 mm. La forme exacte de
  Grover vaut à tout rapport ; mesurée contre l'approximation à h/s = 257, elle
  la rejoint à **0,2 %**.
- **Le RGM est le rayon, non 0,7788 r** : un via au-dessus de quelques
  mégahertz est en régime de peau, tout son courant est en surface.
- **La répartition du courant se RÉSOUT, elle ne se postule pas.** Le signal
  porte +1 A, les retours se partagent −1 A en proportions inconnues ; à haute
  fréquence le courant minimise l'énergie magnétique, donc l'inductance
  elle-même. C'est un système linéaire sous contrainte Σaₖ = 1, résolu par
  multiplicateur de Lagrange. Conséquences mesurées : ne garder que le via le
  plus proche **surestime de 31 %** sur le cas à trois vias ; et trois vias
  serrés ne divisent **pas** l'inductance par trois — leur mutuelle les en
  empêche, on plafonne vers un facteur deux quel que soit leur nombre.
- **Le courant doit se refermer, et c'est une condition.** Un via de masse
  borgne qui ne couvre que la moitié de la hauteur ne referme rien. Nourrir la
  formule avec lui rend un nombre **plus petit de 18 %** que la vérité — le
  pire défaut possible, puisqu'il flatte. La fonction lève plutôt que de le
  rendre, et l'appelant écarte le via en disant pourquoi.

**2. Le plan de référence qui change est le défaut grave, et il est nommé.**
Sur un empilage TOP/GND/PWR/BOT, une piste sur TOP se réfère à GND et la même
piste sur BOT se réfère à PWR. Le courant de retour doit changer de plan — et
**aucun via de masse ne sait faire cela** : il joindrait de la masse à de la
masse. Le retour passe par la cavité entre plans et ses condensateurs de
découplage, absents de ce modèle. Coût mesuré : jusqu'à **7 dB de |S₁₁| à
3 GHz**, toujours en flattant.

`_analyse_retour` ([python/simulation_em.py](python/simulation_em.py)) sépare
**deux questions qui n'en font pas une** : « la référence change-t-elle ? » est
une propriété de l'empilage ; « un via la rejoint-il ? » est une propriété du
routage. Une référence qui change et qu'un via rejoint est le cas ordinaire —
l'alerte ne sort pas. Les confondre sous un seul drapeau ferait crier sur le
cas ordinaire, et on cesserait de lire l'avertissement qui compte.

**3. La capacité comptait les deux pastilles, à la mauvaise distance.** Elles
étaient prises à la **hauteur du via** — 1,34 mm — alors qu'une pastille voit
le plan qui lui fait face à 0,2 mm : facteur sept, dans le sens qui rassure. Et
les **antipads**, un par plan traversé, ne l'étaient pas du tout. Mesuré sur le
via traversant du banc : de **4,70 fF à 86,8 fF** pastilles internes retirées,
**117,1 fF** conservées. L'impédance caractéristique du via tombe de 525 à
96 Ω — invisible à 200 MHz, dominante au-delà de deux gigahertz.

La forme logarithmique est gardée : la formule industrielle
`C = 1,41·εr·T·D1/(D2−D1)` est le coaxial où `ln(D2/D1)` a été remplacé par
`(D2−D1)/D1`, et elle **sous-estime d'un facteur 1,9** sur un antipad de 0,8 mm
autour d'un barreau de 0,25.

**4. Un défaut de cascade trouvé au passage, et il datait du lot 3b.** Les
discontinuités étaient posées **après** la ligne du tronçon d'arrivée, alors
qu'elles portent son rang parce qu'elles le **précèdent**. Chacune était donc
décalée d'un tronçon vers la sortie, et la dernière sortait du parcours : sur
une liaison à trois tronçons et deux vias — le cas des captures — le second via
tombait **au-delà du port 2**. Personne ne l'avait vu parce qu'il faut trois
tronçons pour que cela se voie : sur deux tronçons de même impédance les deux
ordres donnent exactement le même |S₁₁| (une ligne uniforme et un réseau en π
sont tous deux symétriques). Mesuré à trois tronçons : 0,34 dB et 2,7° à 3 GHz.

**5. Le chevelu — la question « faut-il le rapprocher ? » a une réponse.**
Cliquer un via de signal, panneau ouvert sur l'impédance, trace un lien vers
chaque via de masse à portée (`simRetourTrace`,
[editeur-pcb/js/19-simulation.js](editeur-pcb/js/19-simulation.js)) :
l'inductance de boucle au pied du via, **l'épaisseur du trait dit la part du
courant** que ce retour porte, et un trait pointillé rouge porte la raison pour
laquelle un voisin ne compte pas. Un via de **masse** sélectionné n'ouvre rien :
il n'a pas de boucle à lui, il *est* le retour de quelqu'un d'autre.

**LA PHYSIQUE EST DUPLIQUÉE EN JS, ET C'EST TENU.** Un chevelu qui demande un
aller-retour au serveur à chaque mouvement de souris n'est pas un chevelu. Le
banc de l'éditeur exige que `simBoucleVias` rende, au dixième de picohenry,
**exactement** ce que rend `ligne_mom.inductance_boucle_vias` sur la même
géométrie — les valeurs attendues viennent du banc Python. Le jour où l'une des
deux dérive, l'essai tombe.

**6. Sans retour identifié, le chiffre est annoncé comme un PLANCHER.** Il n'y
a alors pas d'inductance de boucle à rendre : le courant revient quand même,
mais par un chemin inconnu — le cuivre des plans, plus loin. On rend la self
partielle, qui est la valeur qu'aurait la boucle si le retour était collé au
via : une **borne inférieure**, écrite « L ≥ » et non « L = ». `inductance_via`
— la règle de pouce des manuels, `(µ₀h/2π)(ln(4h/d)+1)` — **sort du chemin de
calcul** : ce n'est ni une self partielle ni une boucle, c'est la self de
Grover où le −1 a été changé en +1, et l'écart est un retour implicite jamais
dit qui vaut près du double.

**Ce que les deux pages envoient désormais** : la **position** du via — sans
elle aucun écart n'est mesurable —, le diamètre d'**antipad** (côté éditeur,
`v.d + 2·clrK(...)`, exactement ce qui creuse le Gerber), et la liste des vias
de masse à 3 mm. Côté visionneuse, la **portée est supposée traversante** et le
dit : l'IPC-2581 déclare la position, le diamètre et le net d'un perçage, mais
pas ses couches.

~~**Ce qui reste hors modèle**~~ **FAIT le 2026-08-30** : le moignon et la
cavité sont désormais cascadés — voir « Le moignon et la cavité » plus bas. Ce
qui reste vraiment hors modèle : les résonances propres de la paire de plans,
et le couplage entre deux vias voisins.

**Non-régression, écrite** : onze cas dans
[python/test/banc-ligne-mom.py](python/test/banc-ligne-mom.py) — la référence
qui change nommée, la même carte à deux plans de masse qui se referme, la
monotonie et l'ampleur contre l'écartement, trois vias qui comptent pour trois,
le retour borgne écarté, le via d'un autre net écarté, la page muette et
l'empilage sans net de plan distingués, l'antipad qui entre dans la capacité,
la fiche qui porte le même via que la courbe, et la discontinuité posée entre
les deux tronçons ; treize dans
[editeur-pcb/test/harness.js](editeur-pcb/test/harness.js) — dont la physique
JS épinglée sur celle de Python ; cinq dans
[visionneuse-ipc2581/test/harness-sim.js](visionneuse-ipc2581/test/harness-sim.js).

**Un défaut trouvé hors sujet et corrigé** : la liste `EXPOSE` du banc de
l'éditeur nommait encore `simUniteBande`, que le panneau appelle désormais
`simUniteBande1`/`simUniteBande2`. Ce n'était pas un cas en échec — c'était le
**chargement du banc entier** qui levait.



### Le moignon et la cavité — FAIT le 2026-08-30

Les deux dernières choses que la fiche nommait comme absentes. Elles ne se
ressemblent pas : l'une est un bout de conducteur **en trop**, l'autre un
chemin de retour qui **manque**.

**1. Le moignon.** Un via percé de part en part mais utilisé jusqu'à une couche
interne laisse pendre le reste du perçage. Ce bout n'est raccordé à rien par le
bas : c'est un **tronçon de ligne en circuit ouvert, en dérivation** sur le
signal. `admittance_moignon` ([python/ligne_mom.py](python/ligne_mom.py)) le
traite comme le coax barreau/antipad qu'il est — `Z₀ = (60/√εr)·ln(D/d)`, soit
33,7 Ω sur un perçage de 0,25 dans un antipad de 0,80.

- **Sous sa résonance, c'est une capacité, et pas une petite.** 1 mm de moignon
  vaut **206 fF** — deux fois et demie la capacité du via entier. Elle est
  constante de 200 MHz à 3 GHz, comme doit l'être un stub court.
- **À sa résonance quart d'onde, il court-circuite la liaison.** 1 mm résonne à
  **36,1 GHz**, 1,5 mm à 24,1. Un canal à 25 Gbit/s travaille jusqu'au
  troisième harmonique de 12,5 GHz : le moignon est le défaut qui tue un lien
  multi-gigabit, et rien sur le dessin ne le montre — le via a l'air normal,
  c'est ce qu'on n'utilise **pas** de son perçage qui nuit.
- **La constante de propagation est complexe, et ce n'est pas un détail.** Avec
  un β purement imaginaire, `Y = jY₀tan(βL)` **diverge** au quart d'onde et la
  cascade rend n'importe quoi. Ce n'est pas une difficulté numérique à plafonner
  arbitrairement : c'est la **perte** qui manque. Un moignon réel a un facteur
  de qualité fini, de l'ordre de 1/tan δ. En mettant la perte dans γ, `tanh` ne
  diverge jamais et le creux a la bonne profondeur — mesuré : Y culmine à
  64 fois Y₀, soit 0,53 Ω, ce qui efface bien la liaison.
- **La longueur se soustrait, elle ne se devine pas** : percé moins emprunté,
  aux bornes du **perçage** et non aux dessus de couche. Sans la portée percée
  — que la page doit envoyer —, un via traversant et un via enterré bien ajusté
  ont exactement la même apparence : on rend « inconnu » plutôt que le cas le
  plus flatteur.

**2. La cavité — ce qui était un conseil devient un chiffre.** Quand la
référence change, le retour doit passer d'un plan à l'autre, et il ne peut le
faire que par un **condensateur de découplage**. La boucle qu'il décrit —
descendre par le via, courir dans le plan du haut jusqu'au condensateur, le
traverser, revenir par le plan du bas — est une boucle de paire de plans, et
`inductance_cavite` la calcule : `L = (µ₀h/2π)·ln(s/r)`.

Mesuré sur 1 mm entre plans : **0,42 nH** pour un découplage à 1 mm, **0,55** à
2 mm, **0,74** à 5 mm — plus son inductance de montage. Changer de référence
**double** l'inductance du via, même quand on découple bien. La fiche le dit
maintenant en nanohenrys au lieu de dire « ne faites pas cela », ce qui est une
tout autre conversation : on peut décider.

**Aucun pont trouvé, aucun chiffre inventé.** On pourrait prendre le bord de la
carte comme distance ; ce nombre serait faux et aurait l'air d'une mesure.

### Quatre défauts trouvés en branchant, et le premier est le pire

**a. La fiche affirmait une absence qu'elle n'avait pas constatée.** Sur une
carte réelle portant un via de masse au bon endroit, le panneau annonçait
« *aucun via de masse ne joint les deux* » — un énoncé **sur la carte**, sans la
moindre preuve, parce que la page n'avait rien envoyé. Deux causes distinctes,
corrigées séparément :

- **Deux plans de NOMS différents ne sont pas deux plans de NETS différents.**
  Sur une carte quatre couches, une piste sur TOP se réfère au plan interne du
  haut et la même piste sur BOT à celui du bas : les noms diffèrent
  **toujours**. Si les deux sont de la masse, un via de masse referme la boucle
  et c'est le cas ordinaire ; s'ils sont GND et PWR, rien ne peut la refermer.
  La première version ne regardait que les noms, et criait donc au défaut grave
  sur **toute carte quatre couches dont l'empilage ne nomme pas ses nets**.
  Il y a désormais **trois états** — `plan_change`, `nets_differents`
  vrai/faux/**inconnu** — et le défaut grave exige la certitude. Le doute a sa
  propre phrase et sa propre couleur.
- **Une déduction et une observation ne se disent pas pareil.** « Aucun via de
  masse ne peut joindre GND à PWR » **découle des nets** et reste vraie qu'on
  ait cherché ou non. « Aucun découplage n'est à côté » demande d'avoir
  regardé. La première version les disait d'un seul souffle.

**b. Les pages n'envoyaient rien tant que le via n'était pas reconnu** — ni sa
position, ni les vias de masse voisins. Or le changement de couche existe
indépendamment du perçage qu'on sait nommer : ses deux tronçons se raccordent
quelque part, et ce quelque part suffit à mesurer les écarts. Les cotes
manquantes ne touchent que le perçage et la pastille, qui ont leurs replis
annoncés. C'est ce qui privait le serveur de toute donnée sur la carte réelle.

**c. Un seul trou non métallisé rendait tout le net aveugle.**
`simViaAuRaccordIpc` testait le placage **avant** la position : « ce trou-ci
n'est pas métallisé » sortait de la fonction pour de bon, donc un trou de
fixation ou un point de test quelque part sur le net empêchait de reconnaître
le via à l'autre bout de la piste, et toute la fiche tombait sur des replis.

**d. La visionneuse connaissait le net de ses plans et ne l'envoyait pas.**
`simNetDuPlanIpc` le lit désormais — le net qui couvre le plus de cuivre plein
sur la couche — et l'empilage le porte. C'est ce qui lève le doute du point (a)
sur une carte IPC-2581.

**Deux avertissements permanents devenus faux, corrigés.** Celui du modèle de
ligne annonçait comme absents « les coudes, les moignons, les transitions de
via », alors que les trois sont cascadés ; celui de la visionneuse comptait
tous les perçages du net comme non modélisés. Un avertissement qui se trompe en
se **noircissant** est presque aussi nuisible qu'un qui flatte : on cesse de le
lire, et il emporte avec lui ceux qui comptent.

**Non-régression, écrite** : neuf cas dans
[python/test/banc-ligne-mom.py](python/test/banc-ligne-mom.py) — le moignon qui
se soustrait exactement, sa résonance refaite à la main, le court-circuit borné
et fini, la portée inconnue qui ne vaut pas moignon nul, la cavité chiffrée et
son coût qui croît avec la distance, la cavité qui **ne** se traverse **pas**
entre deux masses, les trois états du verdict, le doute rendu, et la déduction
séparée de l'observation ; huit dans
[editeur-pcb/test/harness.js](editeur-pcb/test/harness.js) — dont le chevelu à
trois états, les ponts filtrés par le nombre de bornes, et l'affichage des
trois nouveautés ; quatre dans
[visionneuse-ipc2581/test/harness-sim.js](visionneuse-ipc2581/test/harness-sim.js)
— dont le trou nu ailleurs sur le net qui n'aveugle plus rien, et l'empilage
qui porte le net de ses plans.



### La traversée entre plans, refaite d'après Bogatin — 2026-08-30

**Source** : Eric Bogatin, *Signal and Power Integrity — Simplified*, 2ᵉ éd.,
Prentice Hall 2010. Section **7.14** « When Return Paths Switch Reference
Planes » (p. 244-247) et section **13.14** « Approximating Loop Inductance »
(p. 653-659, équations 13-31 et 13-35). Le PDF est à la racine du dépôt.

Deux erreurs, qui vont dans des sens opposés.

**1. « Il faut un pont » — non, et c'était l'erreur de fond.** Le modèle
refusait de chiffrer la traversée quand aucun condensateur de découplage ne
joignait les deux plans. Or le courant de retour ne l'attend pas : il passe par
**la paire de plans elle-même**, en courant de déplacement à travers sa
capacité. Bogatin le montre en 7.14 — le conducteur du milieu, **même
flottant**, porte des courants de Foucault induits qui referment la boucle, et
le pilote voit simplement deux lignes en série, `Z(1-2) + Z(2-3)`. L'impédance
d'une paire de plans (éq. 7-18, `Z₀ = (377/√εr)·h/w`) vaut **3,6 Ω** pour 1 mm
d'écart sur 50 mm de large, **0,36 Ω** pour 0,1 mm.

Refuser de chiffrer faute de condensateur, c'était déclarer impossible ce qui se
produit sur toute carte multicouche.

**2. L'étalement était trois à quatre fois trop petit.** On employait
l'équation **13-31**, qui décrit un via central rejoignant un **anneau**
extérieur lointain — `L = 5,1·h[mil]·ln(b/a)` pH, soit exactement `µ₀/2π` en SI.
Le cas d'un via de signal et d'un condensateur est celui de **deux contacts
ponctuels** : le courant s'étale au départ **et** se resserre à l'arrivée, dans
les **deux** plans. C'est l'équation **13-35**, `L = 21·h[mil]·ln(B/D)` pH — un
coefficient **4,1 fois** plus grand. Mesuré sur le cas du banc : **1,72 nH au
lieu de 0,55**.

Le livre dit lui-même qu'il n'y a pas de forme fermée pour cette géométrie
(« There are no exact analytical equations that describe this loop spreading
inductance ») : le coefficient est ajusté, et il est nommé comme tel plutôt que
maquillé en dérivation.

**Ce que le modèle fait maintenant.** La traversée est une **impédance**, pas
une inductance, et elle se recalcule à chaque fréquence :

```
Z(ω) = [ jωL_étalement_cavité + 1/(jωC_plans) ]  ∥  [ jωL_pont + ESR + 1/(jωC_pont) ]
```

Les deux branches en parallèle **résonnent** — c'est la *parallel resonant
frequency* du chapitre 13, où la capacité des plans et l'inductance du
découplage s'annulent et où l'impédance de la traversée **culmine**. Une
inductance équivalente figée au point central manquerait exactement ce qu'on
veut voir. Ce qui reste hors de portée, et le livre le dit aussi : les
résonances propres de la cavité, pour lesquelles il faut un solveur 3D.

**Trois cas, et ils ne se confondent pas :**

| | |
|---|---|
| **un pont mesuré** | étalement (13-35) + montage + capacité du condensateur, en parallèle avec la capacité des plans |
| **cherché, rien vu** | pont supposé **au rayon de recherche** — un **minorant**, marqué |
| **la page ne cherche pas** | seul l'étalement est compté, et la traversée est dite **sous-estimée** |

**Pourquoi pas la cavité seule dans le deuxième cas.** Elle donne **1,7 kΩ à
1 MHz** sur une paire de plans de 95 pF. C'est exact pour une carte qui n'aurait
aucun découplage nulle part, et absurde pour une carte réelle dont le découplage
est simplement plus loin que le rayon cherché.

**Le conseil que la fiche porte n'est pas celui qu'on attend.** L'étalement
croît **linéairement** avec l'écart entre plans et seulement en **logarithme**
avec la distance au condensateur. Rapprocher le découplage de moitié ne gagne
que `ln 2` ; amincir le diélectrique entre plans de moitié gagne la moitié.

**Ce que les pages envoient en plus** : l'aire des deux plans en regard (côté
éditeur, l'aire de la carte — une **majoration**, donc une capacité surestimée,
donc une traversée qui paraît meilleure qu'elle n'est en basse fréquence, et
c'est dit), leur εr, et la **valeur** du condensateur lue dans le champ
« valeur » de l'empreinte. Sans valeur lisible, le serveur suppose 100 nF et
l'annonce : en dessous de sa résonance propre, c'est la capacité qui fixe
l'impédance de la branche, et l'omettre ferait passer le pont pour un
court-circuit parfait.

**Non-régression** : deux cas dans
[python/test/banc-ligne-mom.py](python/test/banc-ligne-mom.py) refont les
**exemples chiffrés du livre** — l'équation 13-31 rend bien les 270 pH annoncés
p. 658, le coefficient de 13-35 vaut bien 4,1 fois celui de 13-31, et
l'équation 7-18 est linéaire en l'écartement — et un troisième vérifie que
l'impédance de traversée ne diverge ni en bas ni en haut de bande et qu'un
découplage l'améliore partout.

### Les arcs : une piste courbe est une piste — 2026-08-30

**La cause réelle du parcours en morceaux**, trouvée après le chaînage et plus
grave que lui. L'IPC-2581 range les segments droits et les arcs dans **deux
collections distinctes**. `simZPistes` ne lisait que la première.

Sur une carte RF — où l'on courbe justement pour ne pas réfléchir — la liaison
partait donc au serveur en morceaux droits **séparés par les arcs qui les
joignent**. Tout ce qui suppose un parcours en tombait : les raccords annoncés
manquants, les angles pris entre des tronçons qui ne se suivent pas (un coude
de **168°**, c'est-à-dire un demi-tour, sur une piste presque droite), et
surtout **aucun via accroché** — un via se pose là où la fin d'un tronçon
rejoint le début du suivant, et cela n'arrivait jamais. Ni perçage, ni portée,
ni vias de masse voisins ne partaient, et le chevelu n'avait rien à dessiner.

**Et le chemin DC croyait les traiter.** `simDCPolysArcIpc` lisait `a.p`, un
tableau de sommets — la forme d'une **piste**. Un arc porte `s`, `e`, `m`, `h`.
Le test `pl.length>=4` échouait donc toujours, la fonction retombait sur son
repli « ce n'est pas un arc » et rendait une piste **sans sommets**. Les deux
moitiés de l'outil ne voyaient pas la même carte, et aucune ne le disait.

Le pliage est maintenant écrit **une fois**, dans `simArcEnPolyligne`, et il
passe par **`mdlArc`** — la seule définition de la géométrie d'un arc dans cet
outil, celle du dessin, donc celle qui ne peut pas se désynchroniser de ce
qu'on voit à l'écran. Les deux bouts de la polyligne sont **replacés sur ceux
du fichier** : le rayon se déduit du point de départ, le dernier point calculé
peut retomber à un micron du bout déclaré, et un micron suffit à casser un
chaînage.

**La finesse se prend sur l'ANGLE, pas sur la largeur de piste.** Le critère
« une facette par largeur » vient du tracé de contour, où la facette est plus
fine que le trait qu'elle dessine. Pour une **longueur** il est trop grossier :
un quart de cercle y tombait à quatre facettes, et une corde est plus courte
qu'un arc — **0,64 % de moins**, que le retard de propagation emporte tel quel.
Un pas de deux degrés ramène l'écart à cinq millionièmes.

**Reste à faire, et c'est la même famille** : `ltNet` — la fiche de ligne du
panneau « Sélection » — ne compte toujours pas les arcs dans ses totaux. Elle
l'**avoue** (« leur longueur n'entre nulle part ici »), ce qui la rend
honnête mais fausse, et désormais incohérente avec la simulation qui, elle, les
compte.

**Non-régression** : deux cas — le pliage et ses bouts replacés, et la
topologie de la carte livrée (droite, arc, changement de couche, droite) où
l'on vérifie l'ordre du parcours, la longueur de l'arc contre π/2, et
l'accrochage du via avec ses vias de masse.

### La topologie, le pad inventé, et « Current Return Path » — 2026-08-30 (lot 2)

Trois chantiers, dont deux qui étaient au « ce qui reste à faire » de ce
fichier depuis le lot précédent.

**1. La topologie de la sélection, et le refus franc.** Le serveur comptait des
RUPTURES — un décrochage entre deux tronçons consécutifs — et rendait les
paramètres S dans tous les cas, assortis d'une phrase disant qu'ils ne
voulaient rien dire. Deux défauts en un.

Le premier : un compteur unique confondait trois choses. « La sélection est un
parcours mais mal rangée » se corrige en la rangeant ; « ce net se ramifie en
T » ne se corrige pas du tout — il n'a pas deux accès mais trois, et aucun
ordre n'existe ; « la sélection est en morceaux » est encore autre chose.
Répondre la même phrase aux trois, c'est demander à l'un l'impossible et taire
à l'autre ce qu'il suffirait de faire. `_topologie()` rend maintenant un genre
— `chaine`, `desordre`, `ramifiee`, `eparse`, `boucle`, `sans_coordonnees` — et
la phrase suit le genre.

Le second, et c'est le pire : la courbe s'affichait quand même. Elle a l'air
d'un résultat, on l'exporte en `.s2p`, **et le `.s2p` ne porte pas
l'avertissement**. Un chiffre faux qui voyage est pire qu'un chiffre absent.
Les paramètres S et le Touchstone ne sortent plus quand la sélection n'est pas
une chaîne ; le panneau écrit à la place de la courbe ce qui a été refusé, où
sont les points de dérivation, et ce qui reste valable — les impédances par
tronçon et la carte de chaleur, qui ne dépendent d'aucun ordre. Le retard et
les pertes cumulés restent affichés mais **barrés** : sur un T, la somme des
longueurs n'est le trajet de personne.

**Et l'éditeur PCB range enfin sa sélection.** Il parcourait `S.tracks` dans
l'ordre du DOCUMENT, c'est-à-dire de création : juste par accident tant qu'on
route une liaison d'un bout à l'autre en une fois, faux dès qu'on retouche. La
visionneuse chaînait déjà (`simChainePistes`), et c'est ce qui a caché le
défaut ici — là-bas le désordre est visible, ici il ne l'est pas. Au passage :
**inverser une piste échange sa gauche et sa droite**, donc `gap_left` et
`gap_right` doivent suivre. Ça ne change pas Z₀, la géométrie étant symétrique,
mais ça faisait mentir la fiche sur quel bord longe quoi.

**2. La pastille que personne n'avait lue.** `ipc2581_parser.py` fabrique la
pastille d'un via à « perçage + 0,3 mm » quand aucun `<PadstackDef>` ne porte
son nom — soit un anneau de 0,15 mm posé par convention. Sur la carte
mesurée : perçage ⌀0,25, « anneau 0,15 », pastille ⌀0,55. Ces trois chiffres
n'en font qu'un, et **aucun ne vient du fichier**. La fiche du perçage
l'affichait avec l'aplomb d'une cote déclarée par le fabricant ; le contrôle
d'isolation mesure ses distances contre elle ; la simulation la fait entrer
dans la capacité du via.

La pastille devinée est désormais marquée (`pad_supposee`), l'aveu voyage
jusqu'à la page (`pad_sup`, `a_sup`), et la fiche écrit « supposé » à côté du
chiffre.

**Et la page fabriquait la sienne.** Faute de pastille connue, `simViasIpc`
envoyait `perçage × 2,5` — très exactement le repli que le serveur applique
lui-même. Le chiffre était donc le même ; ce qui changeait, c'est qu'il
arrivait DÉCLARÉ PAR LA PAGE. Or `_cotes_via` écrit la provenance selon que
`pad_diameter` est présent ou absent : `pastille_source` passait de « repli » à
« page » et `cotes_supposees` à faux. Le résultat ne bougeait pas d'un micron,
**la fiche cessait de prévenir**. Le serveur connaît maintenant trois
provenances — `page`, `supposee`, `repli` — et la page ne fabrique plus rien.

Reste ouvert, et non tranché : les **0,275 mm de cuivre absent** entre le bout
de piste et le bord de l'anneau. Les bouts de piste convergent à 0,5500 mm du
centre du perçage, soit exactement le diamètre de la pastille inventée. Si la
vraie pastille faisait ⌀1,10, les pistes s'arrêteraient pile à son bord et il
n'y aurait pas de trou. C'est un indice sérieux que la pastille réelle est plus
grande que la devinette — mais tant que le fichier ne déclare pas son padstack,
on ne peut pas le savoir. **La simulation marche dans les deux cas** ; l'affichage
et le contrôle d'isolation, eux, sont concernés.

**3. « Current Return Path » a sa propre section.** Le chemin de retour vivait
en pièces détachées sous l'onglet « Impédance » : une colonne du tableau des
discontinuités, quelques notes en bas de fiche, un chevelu sur la carte. Trois
endroits, aucun qui réponde à la question qu'on se pose — « par où revient le
courant de ce via, et est-ce que ça se ferme ». On lisait une impédance et on
trouvait, en marge, de quoi s'inquiéter d'autre chose.

Ce ne sont pas les mêmes questions. L'impédance caractéristique est une
propriété de la SECTION DROITE ; le chemin de retour, une propriété de la
LIAISON VERTICALE. **Une piste parfaitement à 50 Ω peut avoir un retour
catastrophique**, et c'est précisément le cas qu'on ne voyait pas.

La sélection se fait comme pour l'impédance, le calcul est le même — le serveur
rend les deux dans une seule réponse, changer d'onglet ne relance rien. Ce qui
change est ce qu'on montre : un via par ligne, sa position, ses couches, ses
vias de masse un par un avec distance et part du courant, l'inductance de
boucle et sa source. Le chevelu se dessine sous cet onglet et **plus sous
l'impédance**.

La coupure a demandé de séparer les notes en deux : le MOIGNON et l'ANTIPAD
sont des cotes du via — elles chargent la liaison, elles entrent dans la
cascade, elles expliquent la capacité et la phase du tableau des
discontinuités — et restent donc sous l'impédance (`simViaNotes`). Le reste
part avec le retour.

**Un trou trouvé en le vérifiant** : la fiche d'un via hors parcours recopiait
`cotes` — où chaque champ porte sa provenance — mais pas le booléen
`cotes_supposees`, sur lequel le panneau filtre. Les provenances partaient
complètes, et personne ne les lisait.

**Ce qui reste, et qui n'a pas bougé :** le chaînage s'arrête toujours à la
dérivation, et les tronçons non vus partent dans l'ordre du fichier. Les
impédances par tronçon restent justes ; leur ordre, non — mais les paramètres S
ne sortent plus, donc plus rien ne dépend de cet ordre-là.

### La visionneuse : le parcours, et le chevelu du retour — 2026-08-30

**Un défaut de fond, trois symptômes qui n'en avaient pas l'air.**
`simZPistes` rend les pistes du net dans l'ordre où l'IPC-2581 les a écrites,
et le sens de chaque polyligne y est arbitraire — rien dans le format ne dit
par quel bout on entre. Tout l'aval supposait pourtant une chaîne parcourue
dans l'ordre envoyé.

| le panneau disait | c'était |
|---|---|
| « 2 raccord(s) manquent » | deux tronçons voisins dans la **liste**, pas sur le cuivre |
| « coude 168° » | l'angle se prend entre vecteurs : **un demi-tour** sur une piste droite |
| « non envoyé », cotes par défaut, moignon inconnu | le via n'avait **jamais** été accroché |

Le dernier coûtait le plus. `simAccrocherViasIpc` ne pose un via que là où la
fin d'un tronçon rejoint le début du suivant, à 20 µm près. Le test échouait,
donc rien ne partait — ni perçage, ni pastille, ni portée, ni **vias de masse
voisins**. Le serveur remplaçait tout par des replis, et disait « non envoyé » :
vrai, mais sans dire pourquoi.

**`simChainePistes`** chaîne par les extrémités et **retourne** les pistes qu'il
faut. Deux bouts au même point sont un raccord ; deux bouts au même point sur
des couches différentes sont un via — c'est le même test, et c'est ce qui fait
que le via se pose tout seul une fois l'ordre rétabli. Une piste retournée
entraîne tout : ses plages sortent en ordre inverse, bout pour bout, et
**gauche et droite s'échangent** — `simEcartsEn` les mesure par rapport à la
tangente du parcours. Sans cet échange, le panneau écrivait « 0,187 / 2,325 »
en miroir un tronçon sur deux.

**Rien n'est forcé.** À un nœud où trois pistes se rejoignent il n'y a plus de
parcours unique : la marche s'arrête, le reste part dans l'ordre du fichier, et
le serveur continue d'annoncer les raccords manquants. Une sélection ramifiée
doit rester visiblement ramifiée.

**Le chevelu, et pourquoi il est LU et non recalculé.** L'éditeur PCB recalcule
le sien à chaque image : on y route, il faut répondre pendant qu'on déplace le
via. La visionneuse lit une carte faite, où rien ne bouge — le seul chevelu qui
vaille y est celui que le modèle a **réellement employé**. `simCheveluRes`
(commun) le lit dans le résultat : position du via, chaque via de masse avec sa
part et, s'il est écarté, le motif. Le trait et le chiffre viennent de la même
source ; il ne peut pas y avoir de désaccord entre le dessin et la fiche.

Il fallait pour cela que la fiche dise **où** est le via : `retour` porte
désormais `x` et `y`, et la clé est **absente** quand la page ne l'envoie pas —
un zéro, lui, se dessinerait.

Une mention propre à cette page, **allégée le 2026-09-03** : la portée d'un
perçage est désormais **lue** quand l'IPC-2581 la déclare — `<Span fromLayer
toLayer>` sur le calque de perçage, voir « la portée des perçages » plus haut.
Ce qui reste supposé traversant est ce que le fichier ne déclare pas ; un
enterré pris pour traversant rend une boucle trop petite de près de vingt pour
cent, et la note ne parle plus que de ceux-là. Le chevelu le dit sur le dessin
— pas seulement en note de bas de panneau.

**Non-régression** : trois cas tiennent le chaînage — et j'ai vérifié qu'ils
**échouent** sans lui —, cinq le contrat de lecture du chevelu, un la
conversion millimètres → unités du fichier (sur une carte en pouces, une
conversion oubliée poserait le chevelu vingt-cinq fois trop loin, donc hors
carte, où personne ne le trouverait pour s'en plaindre), et deux, côté serveur,
la position rendue et le refus de l'inventer.

### La sélection à plusieurs morceaux, et les lots — FAIT le 2026-08-31

**Le cas qui l'a demandée, et il est ordinaire en RF.** Une ligne 50 Ω coupée
par trois condensateurs de liaison n'est pas un net : c'est quatre nets bout à
bout, séparés par des boîtiers. La question, elle, ne se pose qu'une fois —
« fait-elle 50 Ω sur toute sa longueur ? » — et il fallait la poser quatre fois,
cliquer quatre fois, relire quatre fiches et se souvenir des chiffres
entre-temps. Le même besoin revient partout où le cuivre est coupé sans que la
LIAISON le soit : té de polarisation, filtre, résistance série, pont de mesure.

**Ce qui a été fait.**

| Où | Quoi |
|---|---|
| `visionneuse-ipc2581/js/02-modele.js` | `V.sel` : la liste des morceaux retenus, `{s, mev}` chacun, et les fonctions d'état qui la rangent (`selPoser`, `selRefleter`, `selMeme`, `selNets`, `selRefs`) |
| `js/04-interaction.js` | Ctrl+clic ajoute ou retire ; Ctrl+Maj+clic ajoute un net entier ; le vide ne vide plus une sélection qu'on construit |
| `js/03-rendu.js` | tous les morceaux s'allument ensemble, boîtiers compris |
| `js/05-panneaux.js` | la fiche « Sélection » : liste numérotée, chaque ligne se retire seule ; Ctrl+clic dans les listes de nets et de composants |
| `commun/simulation-em.js` | **les lots** : `SIM.lots`, le lot actif reflété dans `SIM.res`, le tableau de synthèse, le calcul lot par lot, le `.csv` de tous les lots |
| `js/07-simulation.js`, `editeur-pcb/js/19-simulation.js` | `problemes()` : un document par parcours continu, et la carte de chaleur qui peint TOUS les lots |

**Un lot est un parcours continu** : le même net, et du cuivre qui se touche —
deux bouts au même point sur deux couches comptent comme un via, exactement
comme pour le chaînage. Un net qui se ramifie reste donc un lot, avec l'arrêt
de marche que le panneau annonçait déjà ; on ne découpe pas les branches, on
découpe ce qui ne se touche pas.

**Pourquoi séparément et non bout à bout.** La cascade ABCD suppose que la
sortie d'un tronçon soit l'entrée du suivant. Entre deux lots il y a un
composant, dont ce panneau ne sait rien : les additionner rendrait un S₂₁ qui
aurait l'air d'être celui de la ligne entière en l'ignorant. Envoyés séparément,
ils rendent quatre résultats justes, et la fiche dit sous le tableau ce qu'elle
ne modélise pas.

**`SIM.res` survit, et c'est ce qui a rendu la chose petite.** Tout ce qui
affiche, peint et exporte le lit depuis toujours. Le lot actif s'y REFLÈTE :
la fiche complète, la courbe S, la section résolue, le `.csv`, le `.s2p` et les
deux canevas fonctionnent sans une ligne de changement, et un seul morceau
désigné se comporte exactement comme avant. Ce qui s'ajoute est au-dessus.

**Deux replis, tous les deux dits.** Un morceau posé sur une couche absente de
l'empilage n'a pas d'impédance : son lot est écarté, et la note le nomme. Et
au-delà de **seize lots** — un Ctrl+A, un lasso sur la carte entière, un net de
masse en cinquante îlots — tout repart dans un seul document plutôt qu'en seize
requêtes : les impédances par tronçon restent justes, la cascade sera refusée
par le serveur, et la note dit que la comparaison n'a pas eu lieu. Aucun
plafond silencieux.

**Non-régression** : neuf cas côté visionneuse (`test/harness-sim.js`, 92 au
total) et cinq côté éditeur (`test/harness.js`, 513 au total). Les deux qui
comptent le plus sont ceux qui protègent l'ancien comportement : « un seul
morceau désigné rend un seul lot, par le chemin d'avant » et « une liaison
continue reste un seul lot, et le document est celui d'avant ». Vient ensuite
« la même piste prise deux fois ne part qu'une fois » — cliquer une piste puis
Ctrl+Maj+clic pour prendre son net la mettait dans deux entrées, et sans
dédoublonnage elle se chaînait avec elle-même.

**Ce qui reste à faire.** Le chevelu du retour et la carte de chute continue ne
peignent que le lot déplié : c'est défendable — six chevelus superposés ne se
lisent pas — mais ce n'est pas dit à l'écran. Et le `.s2p` reste par lot, ce qui
est la seule chose juste : un Touchstone de la ligne entière demanderait le
modèle des composants qui la coupent.

### FAIT le 2026-09-05 : Rapport de santé de la liaison

**Le constat initial.** Le panneau d'impédance affichait une quinzaine de notes dont la plupart ne parlaient pas d'impédance pure : chemin de retour, moignons résonants, couture de vias, plans non déclarés, couplages, traversées de cavités.

**Ce qui a été réalisé.**
L'onglet **« Santé »** (`SIM_ANALYSES.sante`) a été créé au sein de la famille d'analyses d'intégrité de signal (`SIM_FAMILLES.si`), partagé entre l'éditeur PCB et la visionneuse IPC-2581 ([commun/simulation-em.js](commun/simulation-em.js) et [commun/simulation-em.css](commun/simulation-em.css)) :
1. **Moteur de diagnostic hiérarchisé (`simDiagnostiquerSante`)** :
   - Agrège l'ensemble des grandeurs physiques calculées (impédances des tronçons, désadaptations relatives par rapport à la cible ou aux terminaisons, chemin de retour des vias, discontinuités de plans, fentes et traversées de cavités, moignons / stubs et fréquences de résonance, couture de vias coplanaires et couplage diaphonique).
   - Catégorise chaque constat sous trois niveaux stricts de sévérité :
     - **Critique** (`critique`) : moignon résonant dans la bande passante, rupture complète de référence / plan de retour manquant sans via de retour, désadaptation d'impédance majeure (> 25 %), traversée de cavité sans découplage.
     - **Avertissement** (`alerte`) : désadaptation modérée (10-25 %), écart de couture coplanaire > $\lambda/10$, couplage diaphonique proche des seuils de marge, asymétrie de blindage.
     - **Conforme** (`ok`) : impédance dans le gabarit (±10 %), blindage et chemin de retour adéquats.
   - Fournit pour chaque item un diagnostic précis, la grandeur chiffrée, et une **recommandation concrète** pour le concepteur (ex: backdrilling du via, ajout d'un via de retour GND à < 1 mm, élargissement de piste, pose d'un condensateur de découplage de plan).
2. **Interface utilisateur dédiée (`simCorpsSante`, `simRendreSante`, `simFicheSante`)** :
   - Tableau de bord avec jauge globale de santé (score 0 à 100 %), badges de décompte par gravité cliquables pour filtrer les constats.
   - Fiches détaillées par catégorie (Impédance & Adaptation, Vias & Chemin de retour, Plans & Continuité, Blindage & Diaphonie).
   - Export du compte-rendu de santé au format texte structuré (`simSanteExporter`).
3. **Validation et couverture** :
   - Banc d'essai PCB étendu (`editeur-pcb/test/harness.js`) avec vérification des liaisons conformes, des cas de dégradation critique et des interactions de filtrage de l'interface (640 tests réussis).

### FAIT le 2026-09-05 : Scoring de placement PCB, Reconnaissance de motifs et Rotation assistée

**Ce qui a été réalisé :**
1. **Scoring de placement PCB (`python/pcb_scoring.py` et `editeur-pcb/js/20-placement-score.js`)** :
   - Calcul de la longueur totale de chevelu estimée (HPWL - Half-Perimeter Wirelength) et suivi dynamique du delta (en mm, vert si gain, rouge si dégradation).
   - Analyse spatiale de la congestion sur grille 5 mm avec détection du point chaud critique (`peak_density`, coordonnées `hotspot_x`, `hotspot_y`), et bouton d'action `⌖ Voir` qui braque le phare visuel (`rpPhare`) sur la zone.
   - Contrôle de proximité des condensateurs de découplage HF vis-à-vis de leurs circuits intégrés cibles (seuil ≤ 3.5 mm), pourcentage de conformité et alertes détaillées pour les capacités éloignées.
   - Ordonnancement automatique des composants en 4 tiers de priorité (`anchor`, `semi_fixed`, `flexible`, `free`) selon leur rôle électrique.
2. **Reconnaissance de motifs de circuits (`python/pattern_recognition.py` et `editeur-schematique/js/23-patterns.js`)** :
   - Détection heuristique des blocs fonctionnels élémentaires : alimentations LDO, Buck, Boost ; bus numériques et leurs tirages I2C, bus SPI, bus UART ; oscillateurs à quartz et leurs capas de charge ; filtres RC passe-bas et passe-haut.
   - Estimation automatique des consommations DC nominales et crêtes (régulateurs, MCU/IC avec modèles de consommation, tirages résistifs).
   - Recommandation automatique des classes de règles DRC (`ALIM`, `RAPIDE`, `ANALOGIQUE`, `DEFAUT`).
3. **Câblage des 3 ponts transversaux entre Schéma, PCB et Simulation** :
   - **Pont 1 (Schéma ➔ Placement)** : Le cache de motifs est synchronisé en temps réel via `sessionStorage` et `BroadcastChannel("web_cao_patterns_sync")`. Le panneau Placement PCB propose pour chaque bloc un bouton « Grouper » qui sélectionne toutes les empreintes, cadre la vue et active le phare visuel.
   - **Pont 2 (Schéma ➔ Solveur DC)** : Les courants nominaux estimés par le schéma sont injectés directement dans `pcbSpecsComposant(c)` (`editeur-pcb/js/19-simulation.js`) et surchargent la valeur par défaut de 30 mA lors de l'import des charges avec `dcImporterSchema(net)`.
   - **Pont 3 (Schéma ➔ Règles DRC)** : La fonction `autoClass()` de l'éditeur PCB crée et affecte automatiquement les classes `Rapide` (largeur 0.25 mm, isolement 0.25 mm) et `Analogique` (largeur 0.30 mm, isolement 0.35 mm) aux pistes correspondantes.
4. **Optimisation automatique de l'orientation (Rotation assistée)** :
   - Algorithme d'intersection vectorielle stricte 2D CCW testant les 4 orientations cardinaux (0°, 90°, 180°, 270°).
   - Minimise en priorité le nombre de croisements de chevelu (*ratsnest crossings*), puis la longueur euclidienne cumulée.
   - Intégré dans le panneau Propriétés via le bouton `✨ Auto` (`#bOptRot`) à côté du sélecteur de rotation, et dans le panneau Placement avec grille comparative des 4 angles et liste des composants optimisables.
5. **Couverture par les essais** :
   - `editeur-pcb/test/banc-trois-ponts.js` (4/4 validés)
   - `python/test/banc-pcb-scoring.py` (7/7 validés)
   - `python/test/banc-patterns.py` (5/5 validés)
   - `python/test/banc-serveur-routes.py` (4/4 validés)
   - `editeur-pcb/test/harness.js` (650/650 réussis, 100%)
   - `editeur-schematique/test/harness.js` (108/108 réussis, 100%)



### La section résolue est désormais lisible

Chaque tronçon rend `h`, `er`, `tan_delta`, `couverture`, `entre_plans` et
`cuivre` ([python/simulation_em.py](python/simulation_em.py) 2.4.0), et la fiche
les écrit en une ligne par section distincte (`simSection()`,
[commun/simulation-em.js](commun/simulation-em.js)), avec la provenance de
chaque cote fournie par l'outil (`provenance()` de l'adaptateur).

C'était un trou réel : le panneau montrait Z₀ sans montrer ses entrées, si bien
que diagnostiquer trois ohms d'écart avec une carte mesurée demandait d'INVERSER
le résultat pour retrouver la hauteur au plan. Le solveur n'étant en cause dans
aucun de ces cas — 0,25 % contre la transformation conforme, 0,42 % contre
Hammerstad-Jensen —, c'est toujours dans ses entrées que la réponse se trouve.

**Ce qui reste à faire de ce côté** : l'écart nominal/pressé n'est qu'un
avertissement. Rien ne permet de saisir l'empilage RÉEL mesuré par le fabricant
à côté du nominal, ni de dire lequel des deux le calcul emploie. C'est ce qui
transformerait la simulation en outil de corrélation plutôt qu'en outil de
prédiction.

### Ce que la masse coplanaire suppose

Une piste noyée dans un plan arrosé n'est pas un microruban : le cuivre qui la
borde sur sa propre couche fait tomber son impédance de vingt pour cent et
davantage. C'est le cas ordinaire d'un tracé RF, et il est traité. Mais le
traiter demande de répondre à trois questions que le cuivre ne répond pas seul,
et les trois réponses étaient tacites — et fausses — avant la 1.3.0 de
`ligne_mom.py` :

**1. Quel cuivre est de la masse ?** La règle était « tout net différent de
celui de la piste ». Un îlot d'un autre signal comptait donc comme plan de
retour, ce qu'il n'est pas. Les nets de masse sont maintenant DÉCLARÉS : chaque
outil en propose une liste, le panneau l'affiche en pastilles cliquables, et le
document d'échange l'emporte sous `reference_nets` pour que le `.csv` et
l'entête Touchstone disent sous quelle hypothèse le chiffre a été obtenu
(`simRefSet()`, [commun/simulation-em.js](commun/simulation-em.js)).

L'éditeur PCB déduit sa proposition du RÔLE de ses couches et du nom des nets de
zone ; la visionneuse la DEVINE sur le cuivre livré — nom, part de la carte
couverte, nombre de perçages — parce qu'un fichier IPC-2581 ne déclare pas quel
net est la masse. Une proposition devinée se trompe parfois : c'est pour cela
qu'elle se corrige d'un clic, et qu'un décochage tient.

**2. De quel côté, et sur quelle longueur ?** L'écart était mesuré au point le
plus serré, sur toute la longueur et les deux côtés confondus, puis posé à
gauche ET à droite. Une piste qui longe une découpe d'un côté et du plan serré
de l'autre était donc calculée comme si elle avait du plan serré des deux côtés.
Désormais : deux écarts indépendants (`gap_left` / `gap_right`), et la piste
DÉCOUPÉE en plages d'écart constant, chacune partant au solveur avec le sien
(`simPlagesDe()`, partagé par les deux outils pour que « plage » veuille dire la
même chose des deux côtés). Le solveur construit une bande de masse par côté ;
un côté sans masse est un côté sans panneaux, pas un écart infini à borner.

**3. Ce cuivre latéral est-il vraiment à la masse ?** Le solveur le tient à zéro
volt — c'est sa condition aux limites. Sur une carte, il ne l'est qu'autant que
des vias le ramènent au plan d'en face ; sans couture il flotte et finit par
résonner. **Ce n'est pas modélisé et ne le sera pas ici** : il faudrait l'onde
complète. C'est en revanche CONTRÔLÉ — le plus grand espacement entre deux
coutures consécutives, par côté, comparé à λ/20 et λ/10 dans le stratifié en
haut de la bande analysée (`simCouture()`).

**Ce qui reste tacite, et qu'il faut savoir :**

- le contrôle de couture ne vérifie pas que le via ATTEINT le plan de
  référence. Côté éditeur il exige seulement que la plage de couches du via
  contienne celle de la piste ; côté visionneuse, la plage est lue quand le
  fichier la déclare (depuis le 2026-09-03) et supposée traversante sinon. Un
  via borgne qui s'arrête avant compte donc encore comme une couture ;
- le couloir de couture est fixé à 2 mm depuis le bord du cuivre, et non déduit
  de la hauteur au plan. Sur un stratifié très épais, des coutures utiles
  tombent hors du couloir et le verdict est pessimiste ;
- la portée de l'effet coplanaire est plafonnée à 3 mm (`SIM_GAP_MAX`,
  `SIM_ECART_MAX`). Au-delà, l'écart est rendu nul. C'est juste sur un
  stratifié courant ; sur un diélectrique de plus de 0,3 mm, un plan à 4 mm
  compte encore un peu et n'est pas compté ;
- côté visionneuse, la mesure lit les ARÊTES des polygones de plan. Deux trous
  de plan qui se CHEVAUCHENT auraient des arêtes intérieures au cuivre absent,
  prises pour des bords de plan. Un fichier IPC-2581 conforme n'en produit pas —
  l'union est faite en amont — mais rien ici ne le vérifie ;
- la mesure écarte le cuivre qui se trouve DEVANT la piste plutôt qu'à côté
  (composante longitudinale dominante) : c'est ce qui ferme le couloir au bout
  d'une piste, et le compter donnait une plage fantôme à chaque extrémité. Le
  revers est qu'un plan qui borde la piste à quarante-cinq degrés est compté
  pour ce qu'il est, mais qu'un plan à plus de quarante-cinq degrés ne l'est
  plus du tout.

### Ce que le modèle de ligne ignore

- **la largeur variable au sein d'un tronçon.** Une piste qui s'évase — une
  transition vers une pastille, un col — porte une seule largeur dans le
  modèle, donc une seule impédance. C'est fidèle au document ; ce n'est pas
  fidèle au cuivre gravé ;
- **la piste VOISINE — dans la CASCADE.** Elle est calculée depuis le
  2026-08-31, mais **à côté** : `solve_multiline` rend la Z différentielle dans
  son onglet, et le Z₀ de la colonne « Impédance » reste
  celui de la piste prise seule. C'est défendable — une piste couplée n'a pas
  UNE impédance, elle en a deux, une par mode — et c'est écrit dans la fiche ;
  ce qui manque est le **choix du mode** dans la cascade, pour que S₂₁ soit celui
  du signal différentiel quand c'en est un ;
- **le couplage entre COUCHES — CHIFFRÉ non, VU oui depuis le 2026-09-01.**
  Deux pistes superposées sur deux couches voisines couplent, parfois plus que
  deux pistes côte à côte, et la section droite de ce solveur n'a qu'un plan de
  conducteurs : elle ne sait pas le **chiffrer**. Le chiffrer reste le domaine
  du 2,5D. Ce qui a changé est qu'elle ne se **taisait** pas non plus à
  moitié : `_scenes_paralleles` écartait ces voisines dès sa première ligne
  — `layer` différent, `continue` —, et elles disparaissaient **sans un mot**,
  ni ligne au tableau, ni entrée dans `ecartes`, ni avertissement. Un bus routé
  en parallèle sur deux couches adossées affichait « aucune voisine ne longe » :
  le pire cas du métier rendu comme le meilleur, et l'exact contraire de la
  règle de cette chaîne — une voisine qui disparaît sans un mot se lit comme un
  couplage nul. `_superposes()`
  ([python/simulation_em.py](python/simulation_em.py)) les cherche désormais :
  `voisinage` portait déjà toutes les couches, c'est le serveur qui les
  filtrait. Rendus, la longueur en regard, le décalage de **cuivre à cuivre**
  vu de dessus et l'épaisseur de diélectrique entre les **deux faces** ; la
  fiche les affiche (`simCoupleSuperposes`) et annonce alors ses chiffres comme
  un **PLANCHER**. Le discriminant est le **plan**, pas la distance : deux
  couches de signal séparées par un plan de référence ne se voient pas, ces
  longements-là sont **comptés et tus** — sans ce tri, la moitié des cartes
  quatre couches recevrait une alarme pour un empilage qui fait exactement son
  travail. Les **croisements** restent hors du champ, et volontairement :
  l'aire de recouvrement d'une traversée orthogonale est minuscule, et c'est
  précisément pourquoi la règle du métier est de router deux couches adossées à
  angle droit — signaler un croisement serait signaler la solution. Quatre cas
  au banc ([python/test/banc-ligne-mom.py](python/test/banc-ligne-mom.py)) ;
- **les découpes du plan de référence, EN FACE de la piste.** Une piste qui
  franchit une fente du plan d'en face n'a plus de référence sous elle sur cette
  longueur : le calcul continue de rendre la valeur du plan plein. Les découpes
  du cuivre COPLANAIRE, sur la couche de la piste, sont en revanche vues des
  deux côtés depuis que l'écart est mesuré côté par côté ;
- ~~**le masque de soudure**~~ — **traité depuis le 2026-08-28**, et
  *justement* depuis le 2026-08-29 : la Green à trois régions le compte, une
  piste extérieure vernie voit son Z₀ baisser de 2 à 3 %. Reste une réserve à
  connaître : le masque est modélisé en **nappe uniforme**, alors que le vrai
  est conforme — plus mince sur le sommet du cuivre que dans l'écart. Second
  ordre devant les 2–3 %, mais ce n'est pas rien sur une ligne serrée ;
- **les vias**, pour la même raison : la transition verticale manque au modèle,
  et les deux panneaux la comptent sous le résultat plutôt que de la taire ;
- **la topologie de la liaison.** La mise en cascade ABCD suppose une CHAÎNE,
  parcourue dans l'ordre envoyé. Le produit de matrices n'est pas commutatif :
  les mêmes tronçons dans un autre ordre donnent un autre S₁₁ (mesuré : −1,65
  contre −2,31 dB sur trois sections 75/25/48 Ω permutées). Un net qui se
  ramifie en T n'est pas une chaîne du tout. Le serveur vérifie désormais la
  topologie de la sélection (`_topologie()`,
  [python/simulation_em.py](python/simulation_em.py)) et distingue le parcours
  MAL RANGÉ — que la page corrige en le rangeant — du net RAMIFIÉ, qu'aucun
  ordre ne sauve. **Fait le 2026-08-30** : les deux pages ordonnent leur
  sélection en parcours, et les paramètres S ne sortent plus du tout quand ce
  n'en est pas un — la courbe cède la place à la raison du refus, et le `.s2p`
  n'est pas écrit. Les impédances par tronçon et la carte de chaleur restent
  rendues : elles ne dépendent d'aucun ordre.

### Les deux modes, et pourquoi ils doivent se recouper

Cliquer une piste donne son impédance sans serveur (`ltZ0()`) ; le panneau
« Simulation EM » la donne par le solveur de section. Ce sont deux modes
voulus, pas une redondance — mais ils ne valent que s'ils s'accordent là où ils
devraient. Trois choses ont été remises d'aplomb :

- `ltZ0()` ignorait l'épaisseur du cuivre et lisait donc **6 % trop haut**
  (51,0 Ω contre 48,0). Avec la correction de Wheeler — la même
  qu'applique `_largeur_effective()` côté solveur — les deux s'accordent
  maintenant à **0,2 %** sur tout le domaine courant ;
- `dpZ0()`, qui sert les paires différentielles, appliquait sa propre forme
  IPC-2141A au microruban et sortait **45,9 Ω** sur la piste où `ltZ0()`
  sortait 51,0 : deux panneaux du même éditeur, 11 % d'écart, rien pour
  trancher. `dpZ0()` passe désormais par `ltZ0()` pour le microruban ;
- **la piste interne était calculée comme si elle affleurait**, avec de l'air
  au-dessus. Elle a du stratifié : `green_spectral_micro_couvert()`
  ([python/ligne_mom.py](python/ligne_mom.py)) traite le cas, vérifié contre
  deux limites exactes (réduction au microruban nu à la précision machine,
  et ε_eff = εr avec Z₀ = Z₀(air)/√εr en enterré profond). Sur une couche
  interne courante, Z₀ passe de 47,98 à 43,73 Ω.

Ce qui **reste** un écart légitime entre les deux modes : la triplaque
décentrée (le mode léger suppose le ruban centré et sort au-dessus), et la
piste interne couverte, que seule la formule légère continue de voir comme un
microruban nu. Les deux sont dits dans le panneau.

### Le rouge de la carte de chaleur est celui du DRC

`SIM_Z_ROUGE` ([commun/simulation-em.js](commun/simulation-em.js)) vaut
`#e8443a`, exactement `C_ERR`
([editeur-pcb/js/01-core.js:25](editeur-pcb/js/01-core.js:25)). Les formes
diffèrent — un trait le long de la piste contre des croix — et le choix des
trois couleurs a été demandé tel quel, mais sur une carte qui affiche des
erreurs DRC les deux se confondent au premier coup d'œil. Deux sorties : décaler
la teinte de quelques degrés, ou éteindre l'affichage DRC tant que la carte de
chaleur est en service — la seconde est plus honnête, mais elle éteint quelque
chose sans le dire, ce qui demande au moins une mention au pied de page.

## Éditeur schématique

### Limites actuelles : bus et hiérarchie

**Bus et hiérarchie :** Pas de bus de signaux (un bus D0..D7 doit être tiré à huit fils individuels) ni de feuilles hiérarchiques (seuls les nets globaux multi-feuilles sont gérés).

Les nets globaux couvrent le multi-feuille actuel (masses, alimentations, étiquettes globales), mais c'est un demi-lot : tout net étiqueté identiquement fusionne à l'échelle du document entier, sans modularité, sans encapsulation locale et sans synoptique d'ensemble du système.

---

### Bus de signaux

Tirer huit ou seize fils individuels pour un bus de données ou d'adresses alourdit inutilement la feuille et complique la relecture du schéma. Ce qui est attendu :

1. **Icône et mode d'outil dédié dans la barre d'outils et la palette :**
   - Une **icône expressément dédiée au bus** dans la barre d'outils et dans la palette d'outils (en complément de l'outil Fil simple `W`, avec son propre raccourci clavier, par exemple `B`).
   - Tracé distinctif : trait de bus épaissi (3 à 4 px de large contre 1,5 px pour un fil ordinaire) pour identifier immédiatement un bus au premier coup d'œil.
   - Accrochage aux pas de grille et gestion des coudes orthogonaux comme pour les fils standards.

2. **Syntaxe et nommage vectoriel :**
   - Prise en charge des notations vectorielles standards : `D0..D7`, `D[0..7]`, `A[0..15]`, etc.
   - Support des bus composites ou nommés (ex. `SPI{MOSI,MISO,SCK,CS}`).
   - Affichage clair de l'étiquette de bus le long du segment principal.

3. **Dérivation et raccordement individuel (Tap / Breakout) :**
   - Raccordement d'un fil simple vers le bus par une jonction ou un piquage biseauté à 45°.
   - Boîte de sélection rapide de la ligne extraite : au clic sur la dérivation ou lors du piquage, proposer le choix du signal parmi les lignes disponibles du bus (`D0`, `D1`...) sans avoir à retaper le nom complet.
   - Contrôle d'appartenance : interdire ou signaler un indice hors plage par rapport à la définition du bus.

4. **Connectivité et netlist :**
   - Évolution de l'extracteur de connectivité (`js/07-connectivite.js`) : un bus n'est pas un net unique, mais un faisceau ordonné de nets unitaires.
   - Propagation des signaux éclatés vers les broches de composants et inscription exacte dans la netlist (`js/13-fichiers.js`) pour l'import dans l'éditeur PCB sans régression sur les formats actuels.

---

### Feuilles hiérarchiques et feuille racine

Au fur et à mesure qu'un circuit grossit, empiler des feuilles à plat dans une simple barre d'onglets rend la compréhension du système difficile. L'architecture hiérarchique visée :

1. **Feuille racine (page 1 = feuille hiérarchique) :**
   - La première page du schéma fait office de **feuille hiérarchique racine** (vue synoptique / bloc-diagramme de haut niveau).
   - **À l'ouverture d'un projet, l'éditeur s'ouvre systématiquement sur cette feuille hiérarchique**, donnant d'emblée la vision d'ensemble de l'architecture électronique.

2. **Apparition et synchronisation dynamique des sous-feuilles :**
   - Quand le projet comporte ou ajoute des feuilles de schématique (ex. alimentation, microcontrôleur, puissance, communication...), **celles-ci apparaissent automatiquement sur la feuille hiérarchique** sous la forme de **blocs de feuille hiérarchique** (« sheet blocks » / cartouches de sous-circuits).
   - Chaque bloc porte le nom de la sous-feuille, son rôle / titre, et un aperçu ou résumé de son contenu.
   - Navigation naturelle : un double-clic (ou clic) sur un bloc hiérarchique ouvre et affiche directement la feuille de schématique correspondante.

3. **Interconnexions et broches de feuille (Sheet Pins) :**
   - Définition de ports hiérarchiques (entrées, sorties, bidirectionnels, bus) dans chaque sous-feuille.
   - Les ports d'une feuille sont automatiquement exposés comme broches de connexion sur le pourtour de son bloc hiérarchique en page 1.
   - Le câblage entre blocs s'effectue directement sur la feuille hiérarchique au moyen de fils et de bus de signaux.
   - Dépassement des nets globaux : les nets internes restent désormais strictement locaux à leur feuille (évitant les collisions accidentelles de repères ou de noms de nets entre sous-systèmes), et seules les broches hiérarchiques explicitement reliées sur la feuille racine traversent les frontières de blocs.

4. **Modèle de données et rétrocompatibilité :**
   - Persistance dans le document JSON du schéma (`doc.sheets`, coordonnées des blocs hiérarchiques, liaisons inter-feuilles).
   - Maintien d'une rétrocompatibilité totale avec les schémas existants non hiérarchiques (mode séquentiel plat classique préservé si aucune hiérarchie n'est déclarée).

---

## D. Éditeur PCB et ergonomie

### Prise en compte des arcs dans `ltNet` [FAIT]

- La simulation EM et le solveur DC prennent parfaitement en compte les pistes en arc de cercle (découpées en segments/polylignes fines).
- La fiche rapide `ltNet` du panneau Sélection calcule désormais la longueur exacte (`mdlArcLongueur`), l'impédance, le délai et les caractéristiques de chaque arc (`ltArc`), les agrège dans le total textuel du net et dans `pnlSegments`, et l'avertissement « arcs non comptés » a été retiré.

### Pastilles de formes arbitraires [FAIT]

- Support complet des formes `poly` (polygone arbitraire défini par `pts`) et `chamfer` (rectangle chanfreiné à 45° sur les 4 coins ou pin 1 seul).
- Découpes thermiques personnalisables : nombre de branches (`thermalSpokes`), largeur (`thermalWidth`), angle d'orientation (`thermalAngle`).
- Prise en compte dans le rendu canvas, le modèle de géométrie, le calcul d'isolation DRC/PNS, le solveur DC, l'éditeur d'empreintes et la génération Gerber RS-274X (`G36*...G37*`).
- Ajout du raccourci/bouton dans la barre d'outils (`bFootprint`).

### Serpentins d'appariement de longueur (*length matching meanders*) [FAIT]

- Outil interactif pour générer des accordéons de retard sur les paires différentielles ou bus synchrones.
- Détection automatique de la désynchronisation (*skew*) et de la compensation requise via `dpSkewForTrack(track)`.
- Générateur d'accordéons paramétriques à 45° via `dpMeander(track, opts)`.
- Mode interactif `meander` activé via le bouton de la barre d'outils `mMeander` ou le raccourci clavier `M`.
- Prévisualisation dynamique sur canevas avec badge de delta de longueur (`+X.XX mm`) et application avec annulation Ctrl+Z.

### Arcs posés par le routeur — 2026-10-22 [FAIT]

- Règle d'angle « arrondi » (`CORNER_MODES.arc`, panneau *Règles de tracé*, 4ᵉ case de la figure) : le tracé reste celui du 45° ; au dépôt, `chamferPosed` appelle `mitreAt(l, x, y, false, MITRE_AUTO, true)`, qui recule les deux jambes de L = r·tan(θ/2) et pose une piste arc (`ca` = ±θ, signe vérifié contre `arcOf`) tangente aux deux, pour tout angle de virage (90° de deux clics, 45° du routeur). Rayon borné à `MITRE_AUTO` = 4 largeurs, resserré d'une largeur à la fois tant que les cordes de l'arc (`trkSegs`) gênent (`firstObstacle`), sans écharde laissée sur les jambes ; sans place, le coude reste franc.
- `cao_router` (`37-routage-pilote.js`) ne force plus 45° quand la règle est « arrondi » ; l'aperçu de la carte dessine les arcs (`trkPath`).
- Zones et découpes de cuivre : `gRegionArcs` (`04-fabrication.js`) écrit leur contour en G02/G03 dans la région `G36` quand `dxfSegments` y retrouve des arcs assez fins (`gArcsFins`), la région refermée exactement sur son départ ; à l'IPC-2581, les îlots de zone et leurs trous passent par `contourArcs(P, true)` (les dégagements ronds circonscrits en profitent : ils s'élargissent de la flèche, jamais ne rétrécissent). Les polygones restent des listes de points en interne.
- Essais (`harness.js`) : règle arrondi (L, coude 45°, deux coudes, tangence, DRC, rayon réduit ou coude laissé devant un obstacle), `cao_router` en règle arrondi, zone et découpe rondes en arcs au Gerber et à l'IPC, zone rectangulaire en droites ; le compte d'arcs de `exemple-0-arrondi.xml` passe de 12 à 16 (deux dégagements ronds de la zone du dessous).

### Laminage séquentiel — 2026-10-22 [FAIT]

- `S.stack.press` = `[{a,b}, …]`, facultatif : plages de cuivres (bornes comprises) pressées ensemble, de l'intérieur vers l'extérieur ; chaque âme et la carte entière sont des pressages implicites, non écrits. `pressNorm` (`01-core.js`) les valide au chargement (`normStack`), au changement du nombre de couches (`stackResize`) et à chaque lecture (`pressList`, contre l'empilage du moment) : entiers, 0 ≤ a < b ≤ n − 1, pas la carte entière, pas de bord qui coupe une âme, emboîtées ou disjointes ; le reste est écarté.
- `viaBuild` : sans séquence, la règle du pressage unique telle quelle. Avec, `viaBuildSeq` : perçage mécanique d'un sous-ensemble pressé (âme, plage, carte) ou micro-via laser franchissant un prépreg ou un film depuis la surface d'un pressage ; sinon refus, le pourquoi nomme la séquence. Le DRC en fait une erreur (une remarque sans séquence).
- Panneau *Empilage physique* : liste « Pressages » (ajouter du cuivre / au cuivre, retirer ; une étape d'annulation chacun, une plage refusée le dit). Sorties : feuille d'empilage, plan maître (nombre de pressages et plages au lieu de « A VALIDER »), notes Draftsman, lecture MCP `empilage`. IPC-2581 inchangé (un seul `StackupGroup`).
- Essais (`harness.js`, 1 essai) : validation (bornes, croisement, âme coupée, doublon), 6 couches pressées L2–L5 (L2–L5 mécanique, L1–L2 laser, L1–L3 et L3–L4 refusés), DRC remarque / erreur, sorties, panneau et annulation, aller-retour du document, `stackResize` 6 → 8 → 4 couches.

### Vue de détail sur une autre feuille — 2026-10-22 [FAIT]

- `dessin.details[].feuille`, facultatif : le genre de la feuille qui porte le détail (`fab`, `asmT`, `asmB`, `bom`, `cuN`, `meca`, `DF_FEUILLE_RE`) ; absent, celle de la vue mère (anciens fichiers inchangés). `dfNormDetails` écarte une valeur inconnue ; `dfFeuilleDetail(id, feuille)` l'écrit en un pas d'historique et oublie la place enregistrée du détail.
- `dfAgencer(feuilles, ctx)` (`34-draftsman-vues.js`) travaille sur tout le document : vues placées à la main, puis chaque détail sur la première feuille de son genre (pas une suite), ou sur celle de sa vue mère si elle est décochée. Renvois : `dfRepereDetail` pose « FEUILLE ? » sous la lettre, que `dfAgencer` remplit avant de poser les vues (la boîte de la vue mère se garde), ou cache vide s'il n'y a pas de renvoi ; l'étiquette du détail prend « — VOIR FEUILLE n ». `dfGenreVue` rend `null` (document entier) pour une feuille qui donne ou reçoit un tel détail. `mecaPlan` (`commun/dossier-meca.js`) suit la nouvelle signature.
- Volet « Cotes et détails » : liste « Feuille du détail » quand un détail est choisi, l'aperçu le suit sur sa feuille. Le DXF `-PLAN-FABRICATION.dxf` ne prend toujours que les feuilles de fabrication (signalé au README).
- Essais (`harness.js`, 1 essai) : bornes de `feuille`, détail sur l'assemblage et pas sur la fabrication, renvois sur les deux feuilles et au PDF, `dfGenreVue`, volet, annulation, assemblage décoché (repli sans renvoi).

### Sauvegarde automatique sur disque — 2026-10-22 [FAIT]

- Décision : un brouillon à côté du document du projet, rien dans le navigateur (le disque fait foi depuis `8485332`). `commun/projet-disque.js` : `projdNomBrouillon` (`-SCH.json` → `-SCH.brouillon.json`), `projdBrouillonEcrire/Lire/Effacer` (voie serveur ou dossier choisi, sans `PROJD_VU` ni 409), `projdBrouillonTic(outil, sale, doc)` (n'écrit que si le travail est modifié et que son JSON a changé ; une écriture à la fois, l'effacement attend celle en cours), `projdBrouillonProposer` (plus récent que le document → `confirm` ; refus → effacé ; plus ancien → laissé).
- Éditeurs : minuterie de 30 s (`15-import.js`, `07-app.js`) ; le brouillon du schéma est `schDocCourant(true)`, sans netlist ni annonce au PCB (son heure le rendait toujours neuf). `saveJsonProjet` efface le brouillon si rien n'a bougé pendant l'écriture. `schChargerProjet` / `pcbChargerProjet` proposent le brouillon après la lecture du document, même sans document ; repris, le travail reste « modifié ». La session de l'onglet passe devant sans question. Rien à la fermeture (`pagehide` borné à 64 Ko). Sans projet ouvert : pas de brouillon (limite notée).
- `web_CAO.py` 2.23.0 : `brouillon=1` sur GET/PUT `/api/projet/doc` (`chemin_brouillon`, dérivé du nom canonique, mêmes gardes : CSRF, appairage, `_projet_garde`, racines, `projet.cao.json` exigé), DELETE `/api/projet/doc?…&brouillon=1` (405 sans le paramètre : le document ne s'efface jamais). Le nom ne finit pas par le suffixe de l'outil : relevé `documents`, repli `_projet_doc_trouver` et `derniere_sauvegarde` l'ignorent. WEB_SUITE : `*.brouillon.json` au `.gitignore` de PROJETS (`lanceur/projets.py`, ajouté aussi à un `.gitignore` existant).
- Essais : `banc-serveur-routes.py` (écrit sans 409, relu avec sa date, hors relevé et hors repli, CSRF et hors racine refusés, DELETE sans brouillon refusé, absent → 404) ; `harness.js` PCB (minuterie, enregistrement → effacé, proposé et repris « modifié », refusé → effacé, plus ancien → ni question ni effacement) ; `harness.js` schéma (minuterie sans netlist, rien dans le navigateur, effacé à l'enregistrement, repris).

---

# Carnet de route jusqu'au 22/10/2026 (ancien `A-FAIRE.md`)

> Le 22/10/2026, les essais à faire (`TESTS-A-FAIRE.md`) ont été retirés : on ne s'occupe pour
> l'instant que des fonctionnalités, les essais se feront plus tard et autrement. Ils restent
> dans l'historique git, au commit `2e66d19`.

> Le 22/10/2026, `A-FAIRE.md` a été séparé en deux : [A-FAIRE.md](../A-FAIRE.md) (fonctionnalités
> et bugs encore ouverts) et [TESTS-A-FAIRE.md](../TESTS-A-FAIRE.md) (essais à faire). Le carnet
> d'avant, avec ses points cochés, est recopié ci-dessous tel quel (titres descendus d'un niveau) :
> c'est lui que visent les renvois « A-FAIRE.md » des commentaires antérieurs. Ses cases encore
> vides ont été reprises dans les deux nouveaux fichiers.

## À faire — Roadmap & Backlog

Ce document liste les tâches planifiées, en cours et à venir pour la suite de CAO électronique WEB_CAO.
Pour les détails techniques approfondis, les dérivations physiques et l'historique complet des réalisations passées, consulter :
- [docs/simulation-em.md](docs/simulation-em.md) — Référence technique des solveurs et modèles SI/PI.
- [docs/HISTORIQUE_DEVELOPPEMENT.md](docs/HISTORIQUE_DEVELOPPEMENT.md) — Archive complète des développements, audits et post-mortems (août - sept. 2026).

---

### État des lieux (octobre 2026)

L'ensemble de la chaîne est fonctionnel et couvert par **plus de 2 300 essais automatisés, tous passés** (relevé du 21/10/2026) :

| Composant | Statut | Couverture / Bancs |
| --- | --- | --- |
| **Éditeur PCB** | En service | 1047 essais (`editeur-pcb/test/harness.js`, relevé du 21/10/2026), dont 44 pour les plans (Draftsman), 30 pour le dossier mécanique, 24 pour le gestionnaire de contraintes et la topologie, 3 pour l'export IPC-2581 (+ 70 cas d'aller-retour, `banc-ipc2581-export.py`) |
| **Éditeur Schématique** | En service | 175 essais (`editeur-schematique/test/harness.js`), dont 3 pour les contraintes de nets |
| **Visionneuse IPC-2581** (lecteur `ipc2581_parser` 1.83, `ipc2581_json` 1.4.0) | En service | 232 essais (`harness-sim.js`, relevé du 21/10/2026), dont 13 pour le dossier mécanique + 79 (`banc-essai.py`) |
| **SI — Impédance & Vias (`ligne_mom` v2.9.0)** | En service (0,3 à 0,4 % vs étalons ; pertes conducteur par l'inductance incrémentale de Wheeler, ruban + plan(s) + bords ; rugosité Hammerstad / Huray, diélectrique causal Djordjevic-Sarkar, via en ligne — branchés dans la cascade) | 236 cas (`python/test/banc-ligne-mom.py`) |
| **SI — Z différentielle (`solve_multiline`)** | En service (< 3 % vs Garg-Bahl) | inclus dans les 199 cas |
| **SI — Crosstalk niveau 2 (`crosstalk` v4.6.0)** | En service (scan normalisé : k_total, NEXT et FEXT en % et dB, statut vert / orange / rouge, piste sélectionnée — t_r saisi ou déduit de la classe — ou toute la carte sous un t_r global ; pistes superposées résolues ; pertes R, G au genou du front en option ; carte sans plan avec masse arrosée sur la couche ; somme des agresseurs en phase ou quadratique ; **fente du plan franchie par les deux pistes : impédance commune du détour, le courant de retour résolu par PEEC sur l'image des plans que la page envoie (toute forme, plan intact dessous, vias de masse, victime superposée), Ott en repli et en borne haute de la fourchette** — dans « Analyser la piste » et dans la règle *diaphonie* de toute la carte ; garde sans perçage dans le document supposée cousue des deux côtés ; coloration au statut DRC sur le layout ; l'analyse électrique est retirée ; S = 3W pile sur le seuil retenu, couples écartés de peu nommés, front RF imposé signalé) | 56 cas (`python/test/banc-crosstalk.py`), dont la triplaque exacte (Cohn), les formules du niveau 2, l'estimation d'Ott du cas 4 du banc de mesure et le retour résolu (microruban, convergence, cas 4b, vias, fente en biais, victime superposée) |
| **Cascade SI / PDN (`simulation_em` v5.5.0)** | En service (hauteur et topologie aux pertes, rugosité par cuivre et rugosité propre du plan — cascade simple et différentielle —, diélectrique causal en option, via en π ou en ligne au-delà de 0,3 rad, mutuelle des fûts de la paire, contre-perçage ; dispersion de Getsinger comptée une seule fois dans la cascade ; paire par brin : via sur le brin N seul, brins superposés couplés en large face) | couvert par les bancs `ligne_mom`, crosstalk, œil, RF et éditeur |
| **SI — Diagramme de l'œil (`oeil` v2.4.0)** | En service (réponse à un bit depuis la cascade ABCD, simple et différentiel, vias et coudes de la paire compris ; œil PRBS et pire cas PDA ; CTLE, FFE, DFE ; œil statistique RJ/DJ/bruit, contours 10⁻⁶…10⁻¹⁵ et baignoire ; diaphonie bornée saisie ou reprise du couplage (NEXT/FEXT du niveau 2) ; tampons IBIS émetteur et récepteur simulés dans le temps avec leur boîtier, [Diff Pin], paire brin par brin et mode commun ; condensateurs de liaison (couplage AC, coupure basse et droop exact) ; .ami lu et **modèle AMI exécuté** par ctypes depuis la LIB/projet — GetWave de l'émetteur et du récepteur, horloge récupérée imposée, forme d'onde des tampons IBIS —, repli sur l'égaliseur de référence ; mutuelles du boîtier vers les broches voisines, sections du boîtier lues du die vers la broche (`ibis.py` 1.5.0) ; 18 gabarits avec leur fiabilité, plus aucun « à vérifier ») | 62 cas (`python/test/banc-oeil.py`) |
| **RF — S21 port à port (`rf_reseau` v1.8.0)** | En service dans l'éditeur PCB et la visionneuse, chacun avec son empilage (pistes par `simulation_em`, lignes couplées à N conducteurs avec pertes et dispersion modale, coudes et vias aux bords des longements, pastilles en MoM 3D sur stratifié étalonné sur l'empilage, zones et coulées de masse entières en maillage adaptatif creux sur leur cuivre rempli, longements recoupés à leur écart local, chemins de masse piste + via, broches annexes, pistes des autres nets fermées sur leur Z₀, mutuelles des selfs entre elles et avec les pistes (Neumann avec image), fentes du plan de référence (Ott), composants SPICE / .sNp (broches et masse nommées, variantes d'état) / idéaux, S généralisés sur ports complexes, « et si ») — quasi-statique (+ Getsinger) : le domaine de validité (modes supérieurs, ondes de surface, rayonnement) est calculé et signalé ; les modéliser demande le moteur pleine onde | 50 cas (`python/test/banc-rf.py`) + 8 essais de page (`editeur-pcb/test/harness.js`) + 4 (`harness-sim.js`) |
| **PI — Chute DC & Échauffement (`dc_solver` v2.1.0)** | En service (IR drop, densité J, modèle étalement) | 43 cas (`python/test/banc-dc.py`) |
| **Scoring placement & Rotation (`pcb_scoring`)** | En service (HPWL, congestion, découplage HF, auto-rotation) | 18 cas (`python/test/banc-pcb-scoring.py`) |
| **Vérification de la carte (`analyse_carte`)** | En service (tous nets : angles, bouts orphelins, empilage ; à la cadence de chaque classe : impédance, chemins de retour, fentes de plan, vias de couture, diaphonie, paires différentielles, découplage, bord de carte, moignons de vias, branches en T ; quartz, ESD, courant des rails ; dérogations et comparaison de révisions ; classes d'interface USB, Ethernet, LVDS, CAN, RS-485 à leur front et à la Z_diff de leur norme) — mode d'emploi : [docs/verification-carte.md](docs/verification-carte.md) | 25 cas (`python/test/banc-analyse-carte.py`) + route (`banc-serveur-routes.py`) + 11 essais éditeur + 4 visionneuse |
| **Reconnaissance de motifs (`pattern_recognition`)** | En service (LDO/78xx/79xx/Buck, I2C, SPI, UART, quartz, RC, courants DC) | 24 cas (`python/test/banc-patterns.py`) |
| **Claude par le MCP de web_suite (schéma, PCB, visionneuse, Gestion LIB)** | En service (lectures, écritures en cartes cliquées, calculs, routage et chemins proposés par A* (`40-chemin-auto.js`), composants et modèles de simulation liés ; l'ancien assistant IA intégré est retiré) | `commun/lecture-cao.js`, `commun/pilote-cao.js`, `commun/ecriture-cao.js` ; bancs de web_suite (`lanceur/banc_mcp.py`) |
| **Serveur `web_CAO.py`** | En service (détection Raspberry Pi / terminal sans affichage : navigateur non ouvert par défaut, `--navigateur` / `--sans-navigateur`) | `banc-serveur-routes.py`, `banc-lib-routes.py`, `banc-maj-github.py`, `banc-detection-plateforme.py` |
| **Moteur 2,5D pleine onde (`mom_solver`)** | Archivé dans branche `archive/mom-solver-25d` (recentrage sur 2D instantané) | Préservé dans l'historique Git |
| **Support Android / Termux** | Abandonné volontairement (ajouté le 17/09, retiré au commit suivant) | — |
| **Passerelle MCP, profils, cross-probing** | En service | `web_CAO.py`, `commun/session.js` |
| **Gestion LIB — catalogue, recherche, import JLCPCB / LCSC** | En service | 45 + 67 essais (`gestion-lib/test/banc-catalogue.js`, `banc-import-jlc.js`) ; générateurs IPC-7351B, vérification et conversion KiCad, commandes de pilotage : 197 contrôles (`banc-composants.js`) ; repère et trous des empreintes (`banc-repere-pcb.js`) ; routes LIB : 16 cas (`banc-lib-routes.py`) |

#### Ce qui reste — synthèse au 21/10/2026

Le détail de chaque point est plus bas, dans sa section.

**Code (faisable sans rien d'autre)**
- Plus rien d'ouvert ici (l'animation 3D de `fabrication.zip` est faite le 21/10/2026 ; reste son essai sur le Pi, ci-dessous).

**Décisions à prendre**
- Simulation RF S21 de la carte P01x274 : modèles AS179 en place (21/10/2026) ; trois questions sans réponse (port 1, port 2, branche RX) et les fichiers Murata, IFA, Zopt.

**À vérifier sur du réel (carte, fichier, matériel)**
- Broche 1 du Yamaichi IC51-0484-806 ; empreintes SOT-89-5 et LED RVB ; `<Package><Outline>` et `height` d'un fichier eCADSTAR.
- `cao_chemin` sur le Pi (durée) ; le canal depuis l'iPad.
- Animation 3D de `fabrication.zip` sur le Pi : format de vidéo retenu par son Chromium et images par seconde du rendu (la barre d'état les donne).

**Normes (réseau de l'environnement à ouvrir : usb.org, fabricants de feuillard)**
- USB 2.0 Template 2 : positions en % UI à relire dans la figure 7-15.
- Rugosité de Huray : a et SR à tirer des fiches de feuillard (méthode « cannonball »).
- Relus le 21/10/2026 sur sources secondaires seulement (à confirmer dans la norme quand elle est lisible) : sections IBIS, constantes IPC-7351B des puces, masque HDMI 1.4 TP2.

#### Corrections du 24/09/2026 (révélées par l'extension des bancs scoring et motifs)
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

### ✅ Priorité 1 (sprint terminé) : Gestion des bibliothèques

Mettre en place une gestion modulaire et unifiée des bibliothèques de composants pour le schéma, le PCB et la simulation.

#### 1. Arborescence du dossier `lib/`
- [x] Arborescence standardisée unifiée via jonctions de répertoires transparentes :
```text
lib/
├── empreinte/         # Définitions d'empreintes PCB (formes de pastilles arbitraires, boîtiers, 3D/plans) -> lib_empreinte_pcb
├── symbole/           # Définitions de symboles schématiques (brochages, catégories, graphismes) -> lib_empreinte_schematique
└── simulation/        # Modèles pour l'analyse et la simulation -> lib_simulation
```

#### 2. Intégration dans la base de données (`LIB_composants.csv`)
- [x] Uniformisation complète des 563 entrées de `LIB_composants.csv` (à la racine et dans `lib/`) avec chemins relatifs standardisés `lib/empreinte/<nom>.json`, `lib/symbole/<nom>.json` et `lib/simulation/<nom>.sub`.
- [x] 100 % des fichiers référencés (297 empreintes, 563 symboles, 320 modèles de simulation SPICE) existent sur disque et sont vérifiés sans orphelin.
- [x] Serveur d'API (`web_CAO.py`) sécurisé avec support des alias canoniques (`empreinte`, `symbole`, `simulation`) et protection anti-traversée.

#### 3. Exploitation par les outils
- [x] **Éditeur schématique** : naviguer et placer des symboles directement issus de `lib/symbole/` et `LIB_composants.csv` via l'explorateur visuel pop-up (`commun/explorateur-lib.js`), avec affectation automatique des préfixes, valeurs et broches.
- [x] **Éditeur PCB** : assigner, charger ou réaffecter interactivement des empreintes réelles depuis `lib/empreinte/` via le bouton « 🔍 » du panneau de propriétés (`pcbChangerEmpreinteSelectionnee`), avec préservation des connexions et des nets câblés.
- [x] **Panneau de simulation** : injection automatique des caractéristiques réelles (ESR/ESL des condensateurs Murata/catalogue, DCR et courant de saturation $I_{sat}$ des inductances) dans les calculs de chute DC (`pcbSpecsComposant`) et d'impédance de plan / traversée de cavité (`simPontsPlans`, `_cavite_de_retour`).

#### 4. Qualité des références du catalogue

`python/lier_modeles_murata.py` relie chaque référence GCM/GRM/LQW du catalogue à son modèle SPICE fabricant :
- [x] **Sept références GCM C0G 0402 50 V arbitrées** : modèles SPICE Murata équivalents cross-package rattachés automatiquement selon la table d'arbitrage de valeurs et diélectrique.
- [x] **Quarante-deux références passées du modèle générique aux vrais modèles SPICE** : déballage récursif des packs d'archives `LIB/lib_simulation/` (~16 800 fichiers `.mod`), indexation multi-critères et synchronisation : **104/104 références Murata reliées avec succès (100 % de couverture)**.
- [x] **Pagination et filtrage de la galerie de Gestion LIB** : navigation fluide par pages de 24 éléments avec recherche instantanée, badges de comptage et chargement différé (*lazy loading*) des modèles SPICE `.sub`, éliminant les lenteurs du navigateur.

---

### Reste à faire — fonctionnalités de l'outil (relevé du 11/10/2026)

Ce qui manque au code des outils eux-mêmes. Les bancs, cartes d'essai, mesures
et vérifications contre des documents externes sont à part, dans la section
suivante.

#### Pilotage par Claude (MCP de web_suite) — relevé du 19/10/2026

Ce que les modules du MCP ont laissé ouvert côté WEB_CAO (détail dans
`web_suite/tasks/todo-*.md`) :

- [x] **Datasheet → simulation, condensateurs et bornes DC** (21/10/2026) : `cao_sim_ecrire` les écrit, avec une « cible » (`{refs}`, `{mpn}` ou `{valeur, boitier}` pour les condensateurs, `{composant}` pour une borne déjà posée), contrôlés par `simDsPreparer` ; Annuler sur la carte remet parasites, bornes et profil (`commun/ecriture-cao.js`, essai dans `harness-sim.js`).
- [x] **« Bus synchrone » dans `cao_calcul`** (21/10/2026) : `analyse=bus` lance `simBusCalculer` ; sans net désigné ou sans calcul physique, un refus le dit (`commun/pilote-cao.js`, `banc-pilote-cao.js`).
- [x] **Générateur IPC-7351B dans Gestion LIB** (21/10/2026) : l'onglet « Générateurs » de l'éditeur d'empreintes appelle le même calcul que `lib_empreinte_generer` (famille, densité, cotes min / max de la datasheet ; `COMPOSANTS_LIB.CHAMPS` et `lireParametres`), et pose l'empreinte dans l'éditeur sans rien écrire. Il remplace les trois générateurs à la main (DIP, SOIC, barrette), qui ne suivaient pas la norme. L'enregistrement demande avant de remplacer un fichier de même nom déjà dans la LIB.
- [x] **Générateurs IPC-7351B** (21/10/2026) : constantes des puces alignées sur celles que relaie le générateur d'empreintes de KiCad (< 0603 : pointe 0,30 / 0,20 / 0,10, talon 0 ; ≥ 0603 : talon 0 au lieu du −0,05 de l'IPC-7351 A). Avec les mêmes cotes de boîtier, 0201, 0402, 0603 et un QFN-16 3×3 retombent sur les empreintes KiCad à 0,01–0,025 mm (son arrondi au 0,05) : essais dans `banc-composants.js`. Ailes de mouette et QFN avaient déjà ses constantes. DIP et barrette (traversants, simplifiés) : DIP-8 trou 0,8 / pastille 1,5 (KiCad 0,8 / 1,6) ; barrette trou 1,15 / 1,85 (KiCad 1,0 / 1,7), plus large parce qu'il couvre la diagonale de la patte carrée — le champ le dit désormais (0,64 → 0,91).
- [x] **LIB : SOIC-8 et SOT-23-5 régénérés à l'IPC-7351B** (21/10/2026, densité N, cotes JEDEC du
  générateur) : SOIC-8 1,969 × 0,599 mm à ±2,473 mm (KiCad 1,95 × 0,6 à ±2,475), SOT-23-5
  1,409 × 0,589 mm à ±1,153 mm. Nom, corps et brochage gardés : les composants posés gardent leurs broches.
- [x] **Outil MCP pour lier un modèle de simulation** (21/10/2026, branche `mcp`) :
  `lib_simulation_lier`, le « 📎 Lier un fichier » de la fiche par Claude, carte toujours
  cliquée (`js/08-pilote-lib.js`, `brancherTouchstone`) ; le serveur ne réécrit que la case
  « Modèle Simulation » de la référence (`POST /api/lib/composants {lier_simulation}`,
  `banc-serveur-routes.py`). Fichier de 4 Mo au plus (le canal porte 8 Mo par commande).
- [x] **Limites laissées par les modules** (21/10/2026, branche `mcp`) : les lots de Claude se
  fondent entre eux quand l'historique est plein, au lieu de chasser les étapes de
  l'utilisateur (`histBorner`, PCB et schéma) ; « affecter » crée une classe que le schéma
  connaît (`schClass`) ; étiquettes et alimentations désignées par « #id » au dessin
  (lecture `etiquettes`) ; aperçu dessiné du placement automatique, et un essai réussi de la
  méthode « blocs ».
- [x] **chemin-auto** (21/10/2026) : `cao_chemin` propose les points de passage
  par A* sur grille (`editeur-pcb/js/40-chemin-auto.js`), sans rien écrire ; `cao_router` pose.
- [x] **Essai réel** (21/10/2026, sous Linux, Chromium) : `cao_paire`, `cao_placement_auto` et
  `cao_chemin` dans la vraie page, par le vrai serveur MCP (exemple 2, cartes cliquées) : tout
  répond, aucune erreur JavaScript ; une liaison sur 20 sans chemin (l'ordre), 19 posées.
- [x] **Le routeur entrait dans une pastille d'un autre net** (vu à l'essai du 21/10/2026, corrigé
  le 21/10/2026) : sur l'exemple 2, route U3.1 → U3.3 (+5V) autour de U3.2 (GND). La faute
  n'était pas dans `11-pns-*` à `13-pns-shove.js` mais dans le chanfrein posé au dépôt
  (`chamferPosed` → `mitreAt`, `05-tools.js`) : il coupait l'intérieur du coude sans regarder ce
  qui s'y trouvait. La diagonale passe maintenant l'anti-collision du routeur ; sinon elle
  recule d'une largeur à la fois, et le coude reste droit si rien ne tient. Même scénario : DRC
  sans faute d'isolation. 1 essai (`harness.js`).
- [ ] **Essais réels restants** : la durée de `cao_chemin` sur le Pi ; le canal depuis l'iPad.

#### Dossier de fabrication — animation 3D de la carte qui s'assemble (demandé le 19/10/2026)

Modèle : une vidéo de gopcb.ai (contrôleur de vol 36 × 36 mm) — carte 3D sur fond noir,
caméra qui tourne et s'approche, la carte se construit sous les yeux, titre et dimensions en haut.

- [x] **Option à la génération de `fabrication.zip`** (21/10/2026, `editeur-pcb/js/41-animation-3d.js`,
  README de l'éditeur « Animation 3D dans le dossier de fabrication ») : bascule **Fichier →
  Animation 3D dans le .zip**, éteinte à l'ouverture. Substrat au contour, découpes et trous,
  cuivre des faces externes, vernis, sérigraphie, composants en pavés (hauteur du dossier méca,
  boîte par défaut sinon), posés du plus gros au plus petit, dessus puis dessous, puis un tour
  complet ; titre, « L × l mm » et étape en bandeau. Sorties : vidéo 1280 × 720 (H.264 en MP4 si
  le navigateur l'encode, sinon WebM VP9 / VP8) et page HTML autonome (three.js r186 embarqué,
  `commun/vendor/three-source.js`), annoncées par le Master Drawing et le LISEZ-MOI. Éprouvé dans
  Chromium headless (SwiftShader) : WebM VP9, 20 s, 6 images/s en rendu logiciel ; la page
  s'ouvre hors ligne et se tourne à la souris. Essai au banc (`harness.js`).
  - [ ] Sur le Pi : format retenu par son Chromium et images par seconde (la barre d'état les donne).
  - Faits ensuite (21/10/2026) : cotes hors tout dessinées à côté de la carte, zones de cuivre
    avec leurs dégagements (l'image de l'écran), un seul enregistrement à la fois.
  - Pas retenus : bulles de description des composants, schéma-bloc qui se construit.

#### Code en double à fusionner (relevé par l'audit du 16/10/2026)
L'audit complet a corrigé les défauts et retiré le code mort ; ces doublons, eux, sont des chantiers à part (/spec puis /plan) : chaque copie doit être corrigée N fois, et certaines ont déjà divergé.
- [x] **Adaptateurs de simulation éditeur / visionneuse** (20/10/2026) :
  - les copies identiques sont dans `commun/simulation-em.js` (`simVoile`, qui reçoit la couleur de fond de la page, `simXtCoupe`, `simDCCercle`, `simEstResistance`, `simParseResistance` — ex-`pcbParseResistance`) ; les divergences qui étaient des défauts sont corrigées : `plans_sans_cuivre` revient du serveur jusqu'à la visionneuse (`simCheveluRes`), qui dit « aucun cuivre … sous ce via » comme l'éditeur ; la visionneuse peint le cuivre de tous les lots avant les étiquettes (`simZTrace`) et décale les étiquettes qui se chevauchent (`simZPlaceLibre`, partagé).
  - les fonctions qui suivaient le même algorithme sur deux modèles sont fusionnées dans `commun/simulation-em.js` : `simXtFentes` / `simXtDetours` (et les pas `SIM_XT_PAS`…), `simZTrace` / `simZTraceLot` / `simZValeurs` / `simZNumeroLot`, `simRetourTrace` / `simRetourValeurs`, `simDocDiff`. Ce qui tient à la page passe par son adaptateur (`SIM_PCB` / `SIM_IPC`) : `xt` (unité, sondes d'un tronçon, plans d'une couche), `z` (repère, tracé d'un objet, piste partenaire ; plans élargis de la visionneuse), `retour` (chevelu à la forme de `simCheveluRes`, que l'éditeur calcule sur place : `simCheveluPcb`), `diff` (pistes d'un net, sélection, voisinage de masse). Le document de paire de la visionneuse gagne au passage la note « aucun net de masse retenu », la couture et les voisins qu'il perdait. Essais ajoutés dans les deux bancs : peintre Z entier, chevelu de l'éditeur, document de paire.
  - restent propres à la visionneuse, parce qu'ils tiennent à des données que l'éditeur n'a pas : « découplages non cherchés », « portée supposée », « hors parcours » (le peintre commun les écrit quand le chevelu les porte).
- [x] **`ltZ0` / `ltEeff` / `ltWeff`** (20/10/2026) : une seule copie dans `commun/simulation-em.js`, chargé par les deux pages ; gardée sans arrondi (il faisait des paliers dans les recherches de largeur) et avec le refus d'une hauteur nulle.
- [x] **Cavité modale du PDN** (examinée le 20/10/2026) : pas de doublon à fusionner. Le JavaScript n'a qu'une copie (`simPDNCalculerModesCavite` et voisines, `commun/simulation-em.js`) et sert l'impédance PI dans le navigateur, partagée par les deux pages ; `ligne_mom.cavite_modale` sert le chemin de retour sur le serveur (`_param_cavite`). N'en garder qu'une ferait passer l'une des deux analyses de l'autre côté. Écarts de réglage notés : bande des modes `max(1,5·fMax ; 2,5 GHz)` contre 6 GHz, ordre de queue 256 contre 400.
- [x] **Lecteur CSV** (20/10/2026) : `parseCSVLine`, `csvLignes` et la liste des chemins de repli (`CSV_LIB_REPLIS`, les 6) dans `commun/csv.js`, chargé par le schéma et la Gestion LIB.
- [x] **Échappement HTML** (20/10/2026) : une seule fonction `esc` dans `commun/echappe.js`, chargé en premier par les six pages ; elle remplace les copies (`esc` ×6, `escapeHtml`, `crEsc`, `uEsc`, `libEsc`, `elibEsc`, `profEsc`, `wsEsc`, `trEchappe`, `rpEsc`, `simEsc`, `mdlEsc`). Elle échappe `&`, `<`, `>`, `"`, `'` et l'accent grave, rend vide pour null / undefined et écrit 0. Restent à part, parce qu'ils font autre chose : `ipcEsc` (XML, retire les caractères de contrôle) et `appairage._html` (Python).
- [x] **Serveur `web_CAO.py`** (20/10/2026) : une enveloppe d'erreurs `_json_api` (pour `_api`, `_profil_api`, `_projet_api`, `_lib_api`), un lecteur de corps JSON `_corps_json` (pour les quatre lecteurs JSON et celui de `_datasheet_telecharger`), une table `LECTURES` commune à `do_GET` et `do_HEAD` (HEAD gagne `/api/github`, qui lui manquait), `_client_local` passe par `appairage.Garde.ce_poste`. Restent à part, parce qu'ils lisent autre chose : les lecteurs de l'IPC-2581 (octets bruts), de `_lire_document` (gzip, purge avant 413), du scoring et des motifs, et les enveloppes `_ipc_api` (journal, page fermée) et `_datasheet_api` (l'action répond elle-même).
- [x] **Bibliothèque d'empreintes de l'éditeur PCB** (20/10/2026) : `fpLibPut`, `fpLibDel`, `fpLibFile`, `fpLibParse`, `fpLibNames`, `fpDefOf`, `fpCenterOrigin` (et `fpOffCenter`, `fpIsCentered`, `fpMoveOrigin`) retirés, la Gestion LIB reste le seul éditeur ; les essais encore utiles (lecture de la LIB, reprise de l'ancien stockage, `fpApplyDef`, trous) sont réécrits sans elles. Restent, morts eux aussi depuis la fenêtre d'édition : `fpMovePad`, `fpDelPad`, `fpGeneric`, `fpSetBody` (seul le banc s'en sert, pour fabriquer des empreintes dessinées) ; `fpSetPad`, lui, sert encore (connexion des pastilles au panneau, `editeur-pcb/js/06-panels.js`, et écriture par Claude, `commun/ecriture-cao.js`).
- [x] **Repli « page en double-clic + serveur sur 127.0.0.1:8000 »** (20/10/2026) : retiré (`simCandidats`, `apiCandidats` de la visionneuse et de la recherche de composants, `do_OPTIONS` / `_cors` du serveur) ; les README disent que la page s'ouvre par l'adresse du serveur. Le bouton « Serveur… » de la recherche de composants, mort pour la même raison, est retiré aussi. WEB_ANTENNA garde la même sonde dans son `js/01-api.js`.
- [x] Constantes en double côté Python (20/10/2026) : `analyse_carte` reprend les seuils de diaphonie de `crosstalk` et la résistivité de `dc_solver` (1,724e-8 Ω·m partout).

#### Simulation SI — crosstalk
Rien en cours : l'option B, les limites de l'option A et la garde de la règle *diaphonie* sont faites (13/10/2026, détail dans *Backlog par domaine → Simulation SI*).

#### Trous dans les empreintes (`SPEC-trous-npth.md`, 16/10/2026)
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
- [x] **Points ouverts après M3** (20/10/2026) :
  - accrocher une cote du Draftsman à un trou d'empreinte : référence `{type:"trou-fp", fp, i}` (empreinte, rang dans `holes`), proposée à l'accroche, relue, suivie quand le composant bouge, orpheline quand l'empreinte disparaît (D3 levé) ;
  - le tableau de perçage range les trous d'empreinte sous « centrage », les trous de carte sous « fixation » ; le tableau des H1, H2… devient « Trous non métallisés » et dit l'usage de chacun (« centrage J1 » ou « fixation ») ;
  - empreintes de la LIB qui ne sont pas centrées : on garde l'origine de la fiche (décision du 20/10/2026 — recentrer décalerait tout composant déjà posé). L'essai lit maintenant les FICHIERS de la LIB (posés par `fpApplyDef`), pas seulement la géométrie que le nom calcule ; les 28 empreintes « origine fiche » sont nommées (`FP_ORIGINE_FICHE`, banc de l'éditeur), toute autre doit être centrée, et une empreinte de la liste redevenue centrée doit en sortir. Sans la LIB (CI sans jeton), restent les boîtiers intégrés ;
  - MPD-BA2AAPC : le trou Ø2,03 du plan rév. H reste, trop juste pour la vis 2-56 recommandée — choix du 16/10/2026, clos ;
  - IPC-D-356 : une fente y garde sa largeur pour diamètre — le format ne connaît pas les fentes, c'est sa limite ; le Gerber, l'Excellon (G85) et l'IPC-2581 portent la vraie forme. Clos.
- [ ] Reste ouvert : Yamaichi IC51-0484-806, broche 1 non marquée sur le plan 48 broches (une seule source indirecte) — à vérifier sur le repère moulé du support, par toi.

#### Retour d'essai de la carte LED_UV (21/10/2026)
Corrigé le 21/10/2026 : connexion d'une piste à une pastille par sa vraie forme ; sérigraphie
identique à l'écran et au Gerber (repère décalé, valeurs non imprimées) ; brochage « K=2/3 »
au PCB ; taille des composants à une rangée ; zone pleine carte sur un contour fin ; contour
en disque et arcs G03 au Gerber ; liaison directe des pastilles à une zone ; commandes de
pilotage `cao_contour_ecrire`, `cao_zones_ecrire`, `cao_serigraphie_ecrire`,
`cao_pastille_regler` ; écriture appliquée sans carte signalée ; `/api/lib/fichier` sans
extension ; note du schéma décochée qui n'est plus une room ; 2512 en IPC-7351B.
Puis, d'après le retour complet : bras thermiques jamais par-dessus un autre net
(`padBras`) et DRC des bras ; cuivre de zone mini (`S.rule.cuMin`, lanières retirées
entre dégagements, DRC le long des pistes) ; repère posé au-dessus des pastilles et DRC
« sérigraphie sur le cuivre nu » ; `cao_decoupes_ecrire` ; liaison « aucune » et plot
exposé réglé dans la Gestion LIB ; opération `cadre` au schéma (le texte libre existait :
`poser` annot_text) ; empreintes en attente qui suivent un nouveau contour ;
acquittement d'une anomalie de brochage.

Puis le reste du retour, fait le 21/10/2026 : lanières retirées le long des pistes (droites
et arcs) ; banc de charge (300 boîtiers sous un plan) ; empreintes 1206/1210 en IPC-7351B et
pastilles des grandes puces calculées ; vue « cuivre final » (4e cran du contraste) ; zones
interdites par face et hauteurs maximales (`38-interdits.js`, `cao_interdits_ecrire`) ;
`Pilote.aide` (tirée du MCP, `lanceur/aide_pilote.py`) ; échauffement estimé des composants qui
dissipent (`39-thermique.js`, `/api/thermique-composants`, `cao_thermique`).

Reste :
- Décalages de repère des cartes antérieures au 21/10/2026 : le repère se pose maintenant
  au-dessus de l'encombrement (pastilles comprises) et non plus du corps ; un décalage
  glissé à la main avant cette date peut donc avoir bougé de quelques dixièmes.
- Gardé tel quel : les noms de colonnes du catalogue (« Maximun », « Standoof »,
  « Dimenssions », « 3nd source ») — une douzaine d'endroits du code et sans doute le format
  d'origine de la bibliothèque en dépendent ; le symbole `header.json` sans noms de broches —
  aucun symbole de la LIB n'en porte, une barrette se désigne par ses numéros.
- L'échauffement est un ordre de grandeur (îlot pris rond, carte uniforme, sans voisin qui
  chauffe) : une vraie simulation thermique de la carte reste à faire si le besoin vient.

#### Contenu de la LIB (données, pas code)
- [x] **Empreintes PCB** (16/10/2026) : 208 composants associés, 167 empreintes nouvelles d'après les fiches (land pattern, pad thermique, pattes de fixation) ; restent sans empreinte les antennes, selfs et modules maison, méca non électrique, piles, Testpoint_HFS_810 et CONN_BatteryHolder_TypeC/D.
- [x] **Brochages de la LIB** (10–15/10/2026) : toutes les références sur un symbole à broches nommées ont leur brochage, relevé sur datasheet (détail dans *Éditeur schématique* ci-dessous).

#### Simulation RF — S21 TX de la carte P01x274 (U400 → antenne, étudié le 15/10/2026, en attente des réponses)
Carte `IPC2581_Exemple/P01x274PCB-C.xml`, radio SX1261 (U400, datasheet `IPC2581_Exemple/DS_SX1261-2_V2_1_EN.pdf`), LoRa 868 MHz.
- **Ports.** Port 1 sur **U400.23 (RFO)**, asymétrique. **U400.24 (VR_PA) n'est pas un port** : c'est l'alimentation du PA, amenée sur RFO par la self de choc L404 (47 nH) et mise à la masse en RF par C406 / C407. Elle devient une *broche annexe* (ouverte, ou quelques ohms). Port 2 sur **A400.1** (alimentation de l'IFA) ou **J400.3** (U.FL, comme au banc).
- **Chaîne TX** : RFO → C411 // L405 (piège vers 1,71 GHz, 2ᵉ harmonique) → C412 → C413 → L406 → C433 → U401 AS179 (broche 1 → 5) → C416 → π C418 / L407 / C419 → U402 AS179 (broche 5 → 3) → C423 → R416 0 Ω → A400.
- **Exclusions à poser** (sinon la marche fuit jusqu'au MCU U301 et dépasse le plafond de nets) : R412, R413, R414, R415 ne sont plus à exclure depuis que le modèle des AS179 nomme ses broches (21/10/2026, la marche ne passe plus par V1 / V2) ; C431 et C414 (branche RX : SAW FLT400 / FLT401, LNA U403) ; les non-montés (C424 et C425 « XX », R425 / J401 ou R416 selon la variante), J400 / PTST400 / PTST401 si l'on ne veut pas leurs moignons.
- [x] **Les Touchstone des AS179** (21/10/2026) : les deux états fournis par Skyworks (`AS179-92LF_Vdd_0mV_Vctrl_3000mV_J1-J2_25C.s3p`, J1-J2 passant, et `…_J1-J3_25C.s3p`), rangés dans `LIB/lib_simulation` et donnés tous deux par la ligne `RF_AS179-92LF` du catalogue (« a.s3p | b.s3p », empreinte corrigée en `SC-70-6`, brochage J3 = 1, GND = 2, J2 = 3, V1 = 4, J1 = 5, V2 = 6). Option C retenue : chaque fichier porte `! broches : 5 3 1` et `! masse : 2`, la page met le port k sur la broche nommée et le rapporte aux vias de la broche 2 (`rf_reseau` 1.8.0) ; le panneau RF propose l'état, composant par composant (U401 : J1-J3, broche 1 → 5 ; U402 : J1-J2, broche 5 → 3). Essais : `banc-rf.py` (S21 du fichier retrouvé au bit près, broche de masse), `harness-sim.js` (marche, broches, variantes). Fichiers valables de 0,3 MHz à 8 GHz. Un autre .sNp se lie à une référence depuis la Gestion LIB (fiche → « Modèles de simulation » → 📎 Lier un fichier : patte de chaque port par numéro ou nom du brochage, masse), essais dans `banc-composants.js`.
- **Impédance du port 1** : conjugué de la Zopt du PA (absente du datasheet, § 13.1.14.1 : dépend de `paDutyCycle`) → design de référence Semtech 868 MHz ; à défaut 50 Ω (perte d'insertion seule).
- **Limites notées** : deux ports asymétriques seulement, pas de port différentiel (un S21 RX sur RFI_P / RFI_N demanderait une évolution) ; simulation petit signal (ni puissance réelle ni harmoniques du PA commuté).
- [ ] Questions posées à l'utilisateur, sans réponse : (2) port 1 : Zopt Semtech ou 50 Ω ; (3) port 2 : antenne, U.FL ou les deux ; (4) branche RX : exclue, gardée, ou S21 RX plus tard ; (5) fichiers encore à fournir (Murata, impédance de l'IFA, Zopt). La (1) est réglée : Touchstone fabricant, deux états, option C.

---

### Bancs de test, cartes d'essai et validations externes

Ce qui sert à éprouver l'outil et non à lui ajouter une fonction. Les bancs
automatiques en CI sont listés dans l'*État des lieux*. Retirés le 21/10/2026
(décision de l'utilisateur) : la fabrication et la mesure de la carte
crosstalk (SMA 142-0701-801, `releves.csv`, cas 4 / 4b, `carte.png`,
`docs-sim/`), la référence pleine onde des fentes (option D), les 12 relevés
uSimmics, les exports Altium / Allegro (contre-perçage, règles IPC-2581) et
un vrai modèle AMI de fabricant. Ne reste que la relecture des normes.

#### Normes et documents à relire
Relu le 21/10/2026 sur sources secondaires (décision : le réseau de l'environnement n'atteint ni usb.org, ni ibis.org, ni les sites des fabricants ; recherche web, dépôts publics GitHub / GitLab).
- [x] **USB 2.0 Template 1** : 37,5 / 62,5 % UI et ±300 mV confirmés par deux sources indépendantes (Microchip DS00002142A, tableau 6-6 ; Analog Devices, « Improving USB 2.0 Switched-System Response ») ; le 32,5 / 67,5 % ne se confirme pas. Code inchangé, source complétée (`oeil.py`).
- [ ] **USB 2.0 Template 2** : ±175 mV retrouvé (brevet sur la réception USB 2.0), mais les positions 12,5 / 35 / 65 / 87,5 % UI ne le sont toujours pas — à relire dans la figure 7-15 dès que usb.org est joignable.
- [x] **HDMI 1.4 TP2** : masque repris de ngscopeclient (`hdmi-1.4-sink-tp2.yml`, « HDMI v1.4b figure 4-32 ») : 0 mV à ±0,35 UI, ±75 mV de −0,25 à +0,25 UI, limites ±780 mV ; « recoupé », source secondaire (`oeil.py`, `banc-oeil.py`, `docs/simulation-em.md`).
- [x] **Sections IBIS** : lues du die vers la broche (fil de câblage d'abord), comme l'exemple de la norme repris au sommet IBIS 2014 (KEI Systems) et la présentation ICM d'Intel ; le code les cascadait à l'envers (`ibis` 1.5.0, essai dans `banc-oeil.py`). Le texte normatif n'a pas été lu.
- [ ] **Rugosité de Huray** : aucune fiche de feuillard ne donne a et SR (elles donnent Rz / Ra) ; la méthode « cannonball » de Simonovich les déduit de Rz, mais son texte n'est pas joignable ici. Jeux inchangés (STD a 0,5 µm SR 1,5 ; HVLP a 0,3 µm SR 0,6).

---

### Backlog par domaine

#### Éditeur schématique
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
- [x] **Propriétés : une étape d'historique par saisie** (21/10/2026, `editeur-schematique/js/12-panneaux.js`) : le repère, la valeur et le boîtier tapés ou choisis dans Propriétés font une étape, que Ctrl+Z défait. Essai `harness.js`.

#### Éditeur PCB
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
  - [x] `populate="false"` lu par la chaîne IPC (21/10/2026, parseur 1.83, `ipc2581_json` 1.4.0 : `"nm": 1`, recopiés dans WEB_ANTENNA) : la visionneuse coche « Non monté » d'après le fichier (simulations et dossier méca) ; la mémoire du navigateur ne garde que ce qu'on en change. Aller-retour éprouvé par `banc-ipc2581-export.py`.
  - [x] Fentes en vraie forme (21/10/2026, `commun/dossier-meca.js`) : le JSON garde `l` et `rot`, le plan et le DXF dessinent l'oblong et son dégagement, la cote dit « Ø d × l ».
  - [x] Visionneuse : l'aller-retour « Exporter .json » puis réouverture des réglages méca a son essai automatique (21/10/2026, `harness-sim.js` ; `tasks/todo-dossier-meca.md`).

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
  - [x] **Export IPC-2581 : classes, paires différentielles et contraintes** (11/10/2026) : `<LogicalNet netClass netPair>` + `<NonstandardAttribute>` NET_CLASS / DIFF_PAIR / DIFF_PAIR_POLARITY + `<SpecRef>` ; une `<Spec>` par classe, net contraint, paire, groupe d'appariement et pour la matrice (`<General type="ELECTRICAL">` à `<Property>` nommées, `<Impedance>` normalisée avec `<SingleEnded>` / `<EdgeCoupled>` par couche de signal) ; `<Set netPair>`. Rugosité de Huray sous `SURFACE_ROUGHNESS_UPFACING` en propriétés nommées (plus de type OTHER). Lecteur 1.79 (`regles`, `rug_huray`) ; la visionneuse reprend classes et paires du fichier comme classement initial (devant la détection, derrière la main), nomme la partenaire d'une paire et envoie Huray au serveur. Conformité XSD IPC-2581C vérifiée. Recopié dans WEB_ANTENNA (lecteur 1.83 identique, vérifié le 21/10/2026).
  - [x] Export IPC-2581 : la classe d'un net sans broche part (12/10/2026) — pas de `<LogicalNet>` (le XSD y exige un `<PinRef>`), la `<Spec>` de sa classe le nomme en `<Property name="MEMBER">` ; lecteur 1.80 (`_ranger_regle`), le `NET_CLASS` d'un `<LogicalNet>` restant devant. Essais `harness.js`, `banc-ipc2581-export.py` (aller-retour), `banc-essai.py`. Recopié dans WEB_ANTENNA (lecteur 1.83 identique, vérifié le 21/10/2026).
  - [x] Visionneuse : « portée percée de tous les vias déclarés » activée par défaut (12/10/2026) ; décochée, la fiche d'avant revient à l'identique (essai révisé, `harness-sim.js`).

- [x] **Rooms** (`editeur-pcb/js/32-rooms.js`) : les blocs du schéma (zones étiquetées) encadrés sur la carte comme les rooms d'Altium — cadre, fond teinté, étiquette ; un clic sur l'étiquette prend le bloc ; Affichage → Rooms ; lus dans le document du schéma (session ou projet), à défaut dans l'analyse « Motifs & Blocs ». Remplacent les pastilles de couleur. 3 essais.

#### Simulation SI (Signal Integrity)
- [x] **Pertes conducteur** (`ligne_mom.line_losses`, v2.7.0, 10/10/2026) : l'ancien `Rs/(2·Z0·w)` ne comptait que le ruban ; remplacé par l'inductance incrémentale de Wheeler (ruban et plan(s) reculés séparément, Hammerstad-Jensen corrigé de l'épaisseur pour le microruban, Wheeler 1978 pour la triplaque, résistance continue en quadrature). Validé : coaxiale exacte, plaques parallèles, Pucel ±8 %, exemple de Pozar ±5 %. Inchangé à 50 Ω en microruban (les oublis se compensaient) ; ×0,64 sur un microruban 87 Ω, ×1,30 sur un 26 Ω, ×0,70 en triplaque étroite. `modele_conducteur="ancien"` rend l'ancien chiffre.
- [x] **Options de `ligne_mom` 2.7.0 branchées** (`simulation_em` 5.0.0, `rf_reseau` 1.6.0, `crosstalk` 4.2.0) : hauteur et topologie passées aux pertes (actif, +0,07 à +0,6 %) ; rugosité par cuivre dans l'empilage physique (préréglages lisse / ED / RTF / VLP / HVLP / Huray, `stack.cu[i].rug`), lisse par défaut ; diélectrique causal (case de l'empilage, εr(f) aussi dans la phase), désactivé par défaut ; via en ligne, défaut « auto » (π au bit près sous 0,3 rad de phase) ; visionneuse : rugosité lue dans les `<Spec>` IPC-2581 (parseur 1.77).
- [x] **Mutuelle des fûts de la paire différentielle** (Grover par l'énergie, retours par symétrie, C_m écrantée) : L − M en mode impair, L + M en commun ; `s_diff.vias_mutuelle`.
- [x] **Double dispersion corrigée** (`simulation_em` 5.0.1) : la cascade repassait à Getsinger l'eps_eff déjà dispersé au point central (microruban seulement, défaut antérieur) ; elle part maintenant du couple statique.
- [x] **Rugosité propre du plan de référence** (`ligne_mom` 2.8.0 `rugosite_plan`, `simulation_em` 5.2.0, `rf_reseau` 1.7.0, `crosstalk` 4.3.0) : lue sur la couche du plan ; un plan qui ne déclare rien prend celle de la piste (résultat d'avant au bit près).
- [x] **Visionneuse : diélectrique causal et modèle de via** (« Modèles de simulation », gardés par fichier).
- [x] **Essais shove robustes** : le budget de la poussée compte le travail fait (`PNS_SHOVE_TRAVAIL`), l'horloge n'est plus qu'un garde-fou à 250 ms ; plus d'échec sous charge.
- [x] **Rugosité du plan dans la paire** (`simulation_em` 5.4.0) : `_cascade_differentielle` lit la rugosité propre du plan sur chaque tronçon (deux modes, section dissymétrique à quatre accès, partenaire seule, surlongueur) ; un plan muet rend la paire d'avant au bit près (cas du banc de l'œil), un plan lisse déclaré sous une piste rugueuse perd moins. Éditeur : réglage « Lisse déclaré » dans l'empilage (`stack.cu[i].rug = {m, rms:0, decl:true}`, envoyé `rugosite_rms_um: 0`), 1 essai `harness.js`.
- [x] **Visionneuse : plan déclaré lisse** (12/10/2026) : une `<Spec>` qui écrit une rugosité de 0 (le « Lisse déclaré » exporté par l'éditeur) n'est plus confondue avec une absence — lecteur 1.81 (`rugosite_declaree`), `ipc2581_json` 1.2.0 (`"rug": 0`), la page envoie `rugosite_rms_um: 0` ; une face rugueuse de la même spec reste devant. Essais `banc-essai.py`, `harness-sim.js`, aller-retour de l'export (`banc-ipc2581-export.py`). Recopiés dans WEB_ANTENNA (lecteur 1.83 et `ipc2581_json` 1.4.0 identiques, vérifié le 21/10/2026).
- Rugosité : jeux de Huray à confronter à des fiches de feuillard → *Normes et documents à relire* (Rugosité de Huray).
- [x] **Banc de mesure crosstalk** (`bancs-mesure/crosstalk/`, 10/10/2026) : carte d'essai 4 couches JLC générée (6 cas avec le 4b, lignes d'étalonnage), prévisions WEB_CAO, comparaison à SIwave et à l'oscilloscope préparées. La fabrication et la mesure ont été abandonnées le 21/10/2026. Constats faits en y passant la carte, tous corrigés dans l'outil :
  - [x] **la règle *diaphonie* de « toute la carte » ignorait la piste de garde** (`analyse_carte.diaphonie`, 11/10/2026) : sa section n'avait que les deux pistes du couple, et `joue` écartait la masse. Elle pose maintenant dans la section tout ce qui longe le couple sur la même couche (`intercales`) : une garde (classe Masse / net de référence) à 0 V si ses vias (`percages`) la cousent au pas λ/10 du front global, FLOTTANTE sinon (elle transfère, le NEXT remonte), une voisine de signal avec son port — le même chemin que `crosstalk._matrices_bloc`. Cas 3 : 0,58 % / 0,43 % par les deux outils (banc : écart < 3 %). Les paires portent `gardes`, `gardes_flottantes`, `voisines` ; le constat nomme la garde et son état.
  - [x] **S = 3W pile sur le seuil** (`crosstalk` 4.4.1) : l'égalité est retenue, et 2 % au-dessus (`TOLERANCE_SEUIL`, les arrondis d'export) ; un couple écarté à moins de 1,5 × le seuil (`PRESELECTION_PROCHE`) le dit « écartée par la présélection (S = … ≥ seuil …) » dans sa fiche, dans un avertissement et dans `etape0.ecartes_proches`, avec le geste (distance max). Même règle dans `analyse_carte` (seuil max(5 H, 3 max(W, H)), `bilan.ecartes_proches`, note). Le cas 2 se chiffre sans ouvrir la distance max.
  - [x] **`simXtFentes` / `simXtFentesIpc` voient les fentes fines** : en plus des sondes à pas (0,5 mm), chaque corde du parcours est coupée par les arêtes des zones / découpes (éditeur) ou des contours de plan, trous compris (visionneuse), de toutes les couches de plan des deux côtés, et une sonde est posée de chaque côté de chaque arête (2 µm). Une fente est bornée par ses arêtes, à sa largeur et sa position exactes (0,2 mm vu ; les bouts d'un trou sont recalés sur l'arête) ; le filtre « ≥ 1,5 pas » ne s'applique plus qu'aux trous qu'aucune arête ne borne. Champs d'avant (`s`, `longueur`, `plans`, `quoi`) plus, depuis `crosstalk` 4.5.0, les détours `d1` / `d2`, `largeur`, `borne`, `retour`, `x`, `y` : vue, la fente AJOUTE son couplage par impédance commune du retour (option A ci-dessous).
  - [x] **la classe « RF » impose t_r = 100 ps et le dit fort** : sans front saisi, c'est une RÉSERVE (`graves`) « t_r = 100 ps imposé par la classe RF — saisissez un front ou une porteuse pour affiner », la première des hypothèses, et `front_impose` pour la page (alerte à côté du t_r dans le résumé, ligne ATTENTION du rapport texte). La porteuse RF du panneau (`porteuse_rf`, envoyée par `simXtReglages`) donne alors t_r = 0,35 / f comme dans la vérification de carte. `analyse_carte` note les nets RF jugés sans porteuse (`bilan.front_rf`).
  - [x] **Cas 4b ajouté** (repère J5x, `generer-carte.js` option `fente.couches`) : la même fente sur **L2 seulement**, L3 et Bottom intacts. La carte passe de 176 à 204 mm, toujours routée et sans remarque au DRC. WEB_CAO le chiffre (retour sur L3 : NEXT +50 % à 1 ns sur le cas 2, borne du niveau 2, sans terme de détour) alors que le cas 4 reçoit depuis la 4.5.0 le terme d'impédance commune d'Ott (≈ +11 % à 1 ns) ; il départageait les options A et B ci-dessous, mais la mesure est abandonnée (21/10/2026).
- [x] **Crosstalk : simuler les fentes du plan de référence** (couplage par impédance commune du retour). Jusqu'à la 4.4.0, une fente sous l'agresseur et la victime était détectée, avertie, et n'ajoutait rien : le NEXT / FEXT restait celui des lignes couplées. Estimation (Ott) pour le cas 4 du banc (fente de ±10 mm coupant L2, L3, Bottom, entraxe 1,4 mm) : self du détour ≈ 16 nH, mutuelle ≈ 11 nH, soit **≈ 10 % à chaque bout de la victime à 1 ns** (≈ 2 % à 5 ns), contre 0,9 % calculé. Options :
  - [x] **A — impédance commune analytique (Ott), avec fourchette** (`crosstalk` 4.5.0, 11/10/2026) : pour une fente franchie par l'agresseur et la victime, self du détour et mutuelle (L_d = μ0/π · 2d · ln(2d/W), M de même avec l'entraxe au franchissement, deux détours en parallèle), f.é.m. M · dI/dt partagée en +NEXT / −FEXT au front t_r, lissée par τ = L_d/2Z0 (le terme ne dépasse pas M/L_d) ; fourchette entre mutuelle basse (entraxe compté depuis le bord d'un retour étalé sur W + 2H) et haute (M = L_d, l'option E). La page envoie d1 / d2, la largeur, `borne` et `retour` (les plans qui ferment encore le retour) avec les fentes du crosstalk (`simXtFentes`, `simXtFentesIpc`, même mesure que le RF) ; le terme est dans `crosstalk.py` (`impedance_commune_fente`, `termes_fentes`, `ajouter_fentes_niveau2` : valeur centrale, fourchette, statut, texte, pic sur la carte locale) et dans la règle *diaphonie* d'`analyse_carte` (fentes lues dans l'image des plans sous la portion en regard). Cas 4 du banc : +10,97 % à 1 ns, fourchette 9,2 à 16,7 % (`bancs-mesure/crosstalk/README.md`). Le cas 4b (fente sur L2 seule, L3 intact) n'a PAS ce terme : le calcul garde le retour sur L3 et la fiche le signale — c'est l'objet de la mesure. Limites, dites dans la fiche : fente droite franchie à peu près perpendiculairement, tous les plans de retour coupés, pistes à plat.
  - [x] **C — résonance de la fente** (même version), en complément de A : terme tan(βd)/βd et perte Q ≈ 50 de `rf_reseau.z_fente`, appliqué à chaque détour au genou 0,35/t_r ; négligeable à 1 ns (× 1,01), sensible sous ~300 ps (× 30 à 100 ps sur la fente de 20 mm, quart d'onde vers 3,5 GHz dans le FR-4) ; la fiche dit quand elle a pesé.
  - [x] **B — le courant de retour résolu autour de la fente (PEEC)** (`crosstalk` 4.6.0, 13/10/2026) : la page envoie avec chaque fente l'image du cuivre des plans autour du franchissement (`simXtImageFente`, commun ; lignes à v constant coupées aux arêtes exactes, de chaque côté jusqu'au premier plan qui ferme le retour, vias de masse) ; le serveur y pose un maillage gradué (3000 branches au plus), selfs et mutuelles partielles de rubans minces (distance moyenne géométrique exacte), capacité entre plans, frontière absorbante de la cavité, vias en branches verticales, agresseur et victimes pris dans leur cuivre ; résolu au genou, cuivre réel moins plans pleins → L_d et M dans la formule du terme. Microruban retrouvé (0,39 nH/mm), convergé à 0,4 %. **Cas 4 : 4,4 nH de détour et non 16,8** (deux bords d'une fente étroite, courants opposés) → +3,7 % au lieu de 11 % ; Ott reste la borne haute de la fourchette. **Cas 4b : un terme enfin** (+0,97 %), plus petit avec des vias de masse. Six fentes résolues par analyse (les plus grandes), Ott au-delà. Même résolution dans la règle *diaphonie* d'`analyse_carte`, une par couple et par fente.
  - [x] **Limites de l'option A, levées pour une fente imagée** : forme et angle quelconques, plans partiellement coupés, **victime superposée** (couche voisine, aussi dans la règle *diaphonie*), entraxe lu dans le cuivre de la victime au franchissement et non dans le profil d'espacement.
  - [x] **Garde de la règle *diaphonie*** : un document sans aucun perçage n'a pas mesuré la couture, la garde y est supposée tenue — comme `crosstalk.py` d'une couture nulle — et une note le dit (`bilan.diaphonie.gardes_couture_supposee`) ; avec des perçages mais aucun sur la garde, elle reste flottante.
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
- [x] **Gabarits** : USB 2.0 Template 2 passe « recoupé » (la spécification USB 2.0 est publique ; figure 7-15, six points concordants, de mémoire), HDMI 1.4 TP2 passe « recoupé » (norme et CTS sous accord ; masque repris de ngscopeclient, source secondaire, → *Normes et documents à relire*). Plus aucun gabarit « à vérifier ».
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
  - Essais : 7 nouveaux dans `banc-oeil.py` (faux modèle AMI en Python pour le flot, la bibliothèque compilée reste essayée en CI). Reste dans *Normes et documents à relire* : gabarit USB 2.0 Template 2 (le vrai modèle AMI est abandonné, 21/10/2026).

#### Vérification de la carte entière

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

#### Simulation PI (Power Integrity)
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

### Réalisations majeures archivées

Les fonctionnalités suivantes sont entièrement développées, intégrées et validées. Leur historique détaillé d'implémentation est consultable dans [docs/HISTORIQUE_DEVELOPPEMENT.md](docs/HISTORIQUE_DEVELOPPEMENT.md) :

1. **Solveur DC & Thermique** : maillage surfacique multi-couches, extraction exacte des vias en série/parallèle, modèle d'étalement thermique IPC-2152 en °C, détection des culs-de-sac.
2. **SI & Crosstalk niveau 2** : matrice multi-lignes MoM 2D, k_total, NEXT et FEXT normalisés (échelon unitaire, lignes adaptées, t_r par classe ou global) avec statut vert / orange / rouge, pour la piste sélectionnée et pour toute la carte ; la carte locale dit où le NEXT se fabrique. (L'analyse électrique — matrice S, IFFT, volts — a été retirée.)
3. **Modélisation physique des discontinuités** : coudes de Gupta (L, C), vias en $\pi$ (L Grover, C antipads), moignons résonants complexes, traversée de plans selon Bogatin.
4. **Scoring de placement & Motifs** : HPWL, congestion, découplage HF, auto-rotation vectorielle anti-croisements, détection de motifs (LDO, Buck, bus numériques, quartz, RC) et injection automatique des courants DC.
5. **Bus & Feuilles hiérarchiques** : mode bus épaissi, notation vectorielle, feuille racine synoptique avec blocs de sous-feuilles et sheet pins.
6. **Éditeur PCB avancé** : serpentins d'appariement de longueur (*meanders*), pastilles de formes arbitraires (`poly`, chanfrein, découpes thermiques), support complet des pistes en arc de cercle dans tous les solveurs et panneaux.
