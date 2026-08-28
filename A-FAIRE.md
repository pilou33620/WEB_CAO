# À faire

Ce qui manque pour que la chaîne soit un outil convenable. Un titre = une
tâche ; le corps dit ce qui existe déjà et où, pour ne pas repartir de zéro.

Ce qui est *assumé* comme absent — auto-routeur, serpentin d'appariement,
sauvegarde disque automatique — n'est pas ici : c'est dans les « Limites
connues » de [editeur-pcb/README.md](editeur-pcb/README.md#limites-connues).

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

## Simulation électromagnétique

**Ce qui marche** : l'impédance. Le panneau « Simulation EM » des deux outils
envoie la section droite des tronçons sélectionnés à
[python/ligne_mom.py](python/ligne_mom.py), qui la
résout par méthode des moments, et rend l'impédance, la permittivité effective,
le retard, les pertes, puis les paramètres S de la liaison par mise en cascade.
Vérifié à 0,42 % contre Hammerstad-Jensen et à 0,30 % contre la solution exacte
en intégrales elliptiques ; 51 cas dans
[python/test/banc-ligne-mom.py](python/test/banc-ligne-mom.py).

La MASSE COPLANAIRE est traitée côté par côté, plage par plage, et seulement sur
les nets déclarés comme masse — voir « Ce que la masse coplanaire suppose » plus
bas. La géométrie qui la mesure a ses propres bancs : 13 cas dans
[editeur-pcb/test/harness.js](editeur-pcb/test/harness.js) et 20 dans
[visionneuse-ipc2581/test/harness-sim.js](visionneuse-ipc2581/test/harness-sim.js).

### La famille PI est vide, et c'est un emplacement, pas un oubli

Le panneau se range désormais en deux familles — **SI** (intégrité du signal)
et **PI** (intégrité de l'alimentation). SI porte « Impédance » ; PI ne porte
rien, et l'affiche en toutes lettres plutôt que d'aligner des onglets grisés.

Le registre est `SIM_FAMILLES` / `SIM_ANALYSES`
([commun/simulation-em.js](commun/simulation-em.js)). Une analyse y déclare
`nom`, `titre`, `corps()` (ses commandes), `brancher()`, `rendre()` et `peint`
— ce dernier commandant `simZActif()`, donc la carte de chaleur. L'onglet
apparaît tout seul.

Ce qu'il y aurait à mettre dans PI, par ordre de ce que le dépôt sait déjà
faire :

1. **la chute continue dans les plans** (IR drop). C'est de l'électrostatique
   sur un plan maillé, pas de l'électromagnétisme : le plus accessible des
   trois, et le seul qui n'ait besoin d'aucun nouveau solveur — la capacité de
   `ligne_mom.py` se transpose en conductance ;
2. **l'impédance vue par le composant** (Z du PDN en fréquence), qui demande le
   condensateur de découplage, son inductance parasite d'accès, et la capacité
   plan-plan. Cette dernière tombe directement de l'empilage déjà envoyé ;
3. **les résonances de plan**, qui demandent l'onde complète — donc la section
   ci-dessous.

Et dans SI, à côté d'« Impédance » : la **diaphonie** (le solveur de section
sait déjà la faire — deux rubans dans la même matrice donnent la matrice de
capacité complète, donc le mode pair et le mode impair), et le **diagramme de
l'œil**, qui n'est que la réponse impulsionnelle des paramètres S déjà calculés.

### Réparer l'onde complète, ou l'assumer morte

`mom_engine.py` est **hors du chemin de calcul**, et c'est un avertissement en
tête de fichier, pas un oubli. Ce qui l'en tient écarté a changé : deux des
trois reproches d'origine sont levés, le troisième est nouveau et c'est
maintenant le seul qui compte.

**Ce qui est réparé.**

1. ~~La formulation EFIE est amputée de moitié.~~ **Faux depuis la 2026-08-28.**
   `compute_interactions` implémente la MPIE complète — terme de potentiel
   scalaire compris, et produit scalaire vectoriel f_m·f_n, non plus un produit
   de modules. Cette page l'affirmait encore après la correction ; c'est
   corrigé ici.
2. ~~Les images complexes sont inventées.~~ **Réécrit.** `apply_dcim` passe
   désormais par la fonction de Green spectrale **exacte** du milieu stratifié
   (cascade de lignes de transmission, TLGF), un vrai **GPOF** de Hua-Sarkar à
   **deux niveaux** (Aksun), et l'identité de Sommerfeld. Éprouvé par
   [mom_solver/tests/banc_dcim.py](mom_solver/tests/banc_dcim.py), 13 essais :
   sur le cas exactement soluble — plan de masse dans l'air, où le noyau vaut
   `1 − exp(−2j k_z h)` — GPOF rend exactement deux images, la directe et le
   miroir à −1,0000 pour 0,7400 mm quand 2h vaut 0,7400 mm, et la
   reconstruction spatiale tombe à **0,000 %** de 0,1 à 50 mm. Sur un
   microruban FR-4 contre une intégrale de Sommerfeld numérique : **moins de
   0,2 % jusqu'à 5 mm**.

**Ce qui reste, par ordre de gravité.**

1. **`mom_engine` n'a qu'UN noyau pour DEUX potentiels.** `green_2d_layered`
   rend un seul scalaire, et `compute_interactions` s'en sert à la fois pour le
   potentiel vecteur et pour le potentiel scalaire. Ce sont deux fonctions de
   Green différentes : `G_A^xx` suit la ligne de transmission **TE**, `G_q` la
   **TM**. Celle qui est ajustée aujourd'hui est la TM — choix délibéré, c'est
   elle qui porte les charges, donc la capacité, donc Z₀ — mais le terme
   inductif reçoit la mauvaise. **C'est le premier chantier**, et il est dans
   `mom_engine.py`, pas dans `green_layered.py` : ce dernier sait déjà cascader
   les deux modes, il suffit de lui demander le TE (`Z_i = ωμ/k_zi` au lieu de
   `k_zi/(ωε_i)`), d'ajuster deux jeux d'images, et de les passer séparément.
2. **L'onde de surface n'est pas extraite.** Un stratifié sur plan de masse
   porte une TM0 sans fréquence de coupure : dans le plan spectral c'est un
   **pôle**, et un pôle ne s'approche pas par une somme finie d'exponentielles
   — il décroît en 1/√ρ là où les images décroissent en 1/ρ. Le banc le mesure
   et le borne : l'écart ne dépend que de k·ρ (0,2 % à k·ρ ≤ 0,25 ; 1 % à 0,44 ;
   7 % à 0,88 ; 35 % à 2,2). **Sans conséquence pour une matrice d'impédance**
   — à ces distances le noyau vaut six ordres de grandeur de moins qu'en champ
   proche — **décisif pour un calcul de rayonnement**. À faire : localiser le
   pôle par recherche de racine sur `Z_bas + Z_haut = 0`, en extraire le résidu,
   l'ôter avant l'ajustement et le rajouter analytiquement en Hankel.
3. **Un seul plan source.** L'ajustement vaut pour la couche des pistes. Un
   empilage à deux couches de signal demande un jeu d'images par couche, et un
   jeu croisé par paire de couches.
4. **La quadrature de `compute_interactions` est à un point.** Correcte en
   ordre, insuffisante pour des panneaux voisins : il faut au moins une règle à
   7 points sur triangle, et un traitement analytique de la singularité 1/R
   pour les paires proches.
5. **`test_basic.py` est périmé et ne mesure rien.** Il appelle
   `compute_s_parameters()` sans son argument `port_map`, et pour le reste il
   vérifie des imports et des dimensions de matrices — jamais une valeur. C'est
   ce qui a permis à un noyau faux de passer tous les essais du dépôt pendant
   des mois. À refondre sur le modèle de `banc_dcim.py` : des étalons
   extérieurs, ou rien.

**Le cas de non-régression est écrit d'avance** : une ligne microruban 50 Ω de
20 mm doit rendre |S₂₁| proche de 1 et |S₁₁| bas — `ligne_mom.py` le donne déjà,
et sert donc d'étalon. **Cette comparaison n'a pas encore été faite** : c'est
l'étape qui décide si le moteur 2,5D peut remplacer le modèle de ligne, et elle
ne veut rien dire tant que le point 1 ci-dessus n'est pas réglé.

Les dépendances de maillage (`gmsh`, `meshio`, `pygmsh`) sont désormais
installées ; le solveur va jusqu'aux paramètres S.

### Ce qu'il reste au panneau de simulation

Quatre chantiers, chiffrés et indépendants. Les trois premiers ont été
spécifiés en détail ; le dernier attend le moteur.

#### 1. Le masque de soudure dans le calcul  *(le plus gros gain immédiat)*

Une piste de couche extérieure est sous vernis. Le masque remplit l'écart
coplanaire — là où le champ est le plus dense — et fait **baisser Z₀ de 2 à
3 %**, soit environ 1,5 Ω sur une ligne à 50. La fiche le signale ; le calcul ne
le compte pas.

**Ne pas se contenter de l'ajouter à l'empilage** : `_couverture()`
([python/simulation_em.py](python/simulation_em.py)) accumule tout le non-cuivre
au-dessus sans regarder ce que c'est, `_entre_exterieur()` en fait une moyenne
d'εr appliquée à **toute** la région 0→h+c — y compris entre la piste et le
plan, où il n'y a pas de masque —, et `solve_line` jette toute couverture plus
mince que le cuivre (`c_diel < max(t, 1e-9)`), donc un masque de 25 µm sous
35 µm de cuivre disparaît **en silence**.

Ce qu'il faut :

- **une fonction de Green à trois régions** dans `ligne_mom.py` : stratifié εr₁
  de 0 à h, masque εr₂ de h à h+c, air au-dessus. Elle se dérive comme
  l'existante et **subsume les deux** :

      G = K / (ε₀ β (M + εr₁ K coth(βh)))
      K = ch(βc) + sh(βc)/εr₂       M = εr₂ sh(βc) + ch(βc)

  avec c = 0 qui redonne le microruban nu et εr₂ = εr₁ le couvert. L'asymptote
  devient ε₀(εr₁+εr₂)/2, ce qui unifie les deux extractions de milieu moyen
  aujourd'hui écrites en branches séparées dans `solve_line` ;
- **baisser le seuil** qui jette les couvertures minces ;
- `section_de_couche` ne doit plus **homogénéiser** : `_couverture()` rend
  (épaisseur, εr) et la couverture part telle quelle ;
- côté pages : `simStackupIpc` ajoute la couche masque en tête et en queue, lue
  du fichier IPC-2581 quand il la porte (`SOLDERMASK`, déjà reconnu par
  [visionneuse-ipc2581/js/02-modele.js](visionneuse-ipc2581/js/02-modele.js)),
  sinon saisissable avec repli 25 µm / εr 3,8 — et **la provenance le dit** ;
  côté éditeur PCB, `S.stack.maskT`/`maskEr` existent déjà, il n'y a qu'à les
  envoyer ;
- `simTopoNom` doit distinguer **« microruban sous masque »** de « microruban
  couvert », sinon une piste externe vernie et une piste interne portent le
  même mot ;
- **réserve à écrire dans le code** : le masque est modélisé en nappe uniforme,
  le vrai est conforme — plus mince sur le sommet du cuivre que dans l'écart.
  Second ordre devant les 2–3 %, mais ça doit être écrit.

Non-régression : trois réductions exactes (c = 0, εr₂ = εr₁, c → grand) dans
[python/test/banc-ligne-mom.py](python/test/banc-ligne-mom.py).

#### 2. Voir et dire les discontinuités  *(peu cher, gros gain de lisibilité)*

Le modèle ne change pas ; la fiche cesse d'être muette.

- **`_coudes()`** dans `simulation_em.py` : l'angle à chaque raccord, à partir
  des `start`/`end` déjà envoyés. Rendre le nombre de coudes, leur angle, et la
  **capacité d'excès estimée** en femtofarads avec ce qu'elle vaut en degrés de
  phase à f₀. Une note qui **chiffre** la négligeabilité vaut mieux qu'une note
  qui l'affirme ;
- **`_transitions()`** : détecter les changements de `layer` **le long de la
  chaîne** et les nommer (« Conductor-4 → Conductor-1 au tronçon 7 »). Ça
  remplace la note « N vias du net », qui compte le mauvais ensemble — les vias
  du net entier, y compris hors sélection ;
- **`_ruptures()`** gagne un contrôle de couche : deux tronçons au même XY sur
  deux couches différentes ne sont pas un raccord, c'est un via. Aujourd'hui il
  ne compare que les coordonnées, or les deux bouts d'un via sont au même XY :
  la chaîne est déclarée continue et le via passe inaperçu.

À savoir, et qui est déjà juste : la **longueur** envoyée est celle du cuivre
(`trkLen`, au prorata de la plage), pas la corde — un demi-tour n'est pas
raccourci, et le retard est bon. Seule la discontinuité manque.

#### 3. Modéliser les discontinuités  *(à décider après le 2)*

Insérer dans la cascade ABCD un élément localisé par discontinuité : shunt C
pour le coude (Gupta), π L-C pour le via (`L ≈ (µ₀h/2π)[ln(4h/d)+1]`, C de
pastille/antipastille). Demande que les pages **envoient les vias de la
chaîne** (perçage, pastille, portée) — la visionneuse les a, l'éditeur aussi.
Le format `cao-sim-em-1` gagne alors un tableau `transitions` et passe à `-2`.

**À 868 MHz ça ne déplacera aucun chiffre lisible** : λ vaut 197 mm dans le
stratifié, un coude à 45° pèse quelques femtofarads. À faire seulement si la
bande monte au-delà de 2–3 GHz.

#### 4. Les ports chargés, et le dé-embarquement

Les ports se nomment désormais, mais restent **idéaux**. Trois choses qu'un
port placé à la main permettrait, et qu'aucune ne fait aujourd'hui :

- **déplacer le plan de référence** ailleurs qu'au bout du cuivre (retrancher
  une longueur d'accès) ;
- **charger le port** d'une pastille, d'un via ou d'un connecteur, pour que S₁₁
  soit comparable à une mesure au VNA — aujourd'hui il est nécessairement
  meilleur, et la fiche le dit ;
- découper une chaîne en **plus de deux accès** (té, moignon) — mais ça, la
  cascade ABCD ne sait pas le faire du tout : c'est un autre modèle, et il
  appartient au chantier 3.

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
  contienne celle de la piste ; côté visionneuse, un perçage ne dit même pas sa
  plage. Un via borgne qui s'arrête avant compte donc comme une couture ;
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
- **la piste VOISINE.** Le plan de masse coplanaire, lui, est désormais traité
  — c'était le gros morceau, et le plus fréquent. Reste le couplage à une autre
  PISTE : deux signaux serrés se voient, et le modèle de ligne ne le dit pas.
  Il est en revanche DÉTECTÉ depuis que les nets de masse sont déclarés : le
  cuivre d'un net non-référence qui longe la piste ne compte plus comme un plan
  de retour, il ressort en note de couplage avec son écart et sa longueur
  (`simVoisins()`, [commun/simulation-em.js](commun/simulation-em.js)). C'est le
  signalement, pas le calcul. Le calcul est le domaine de `dpZdiff()`, qui
  existe pour les paires différentielles et n'est pas branché sur la simulation.
  Le chemin est ouvert : `capacitance_coplanaire()` met déjà plusieurs
  conducteurs dans la même matrice ; il suffit de tenir le second à un potentiel
  au lieu de zéro pour sortir la matrice de capacité complète, donc le mode pair
  et le mode impair ;
- **les découpes du plan de référence, EN FACE de la piste.** Une piste qui
  franchit une fente du plan d'en face n'a plus de référence sous elle sur cette
  longueur : le calcul continue de rendre la valeur du plan plein. Les découpes
  du cuivre COPLANAIRE, sur la couche de la piste, sont en revanche vues des
  deux côtés depuis que l'écart est mesuré côté par côté ;
- **le masque de soudure**, absent de l'empilage envoyé. L'ajouter décale tous
  les indices de couche (`simCuIndex`,
  [editeur-pcb/js/19-simulation.js](editeur-pcb/js/19-simulation.js)) pour un
  effet marginal sur un microruban : à faire d'un coup, pas à moitié ;
- **les vias**, pour la même raison : la transition verticale manque au modèle,
  et les deux panneaux la comptent sous le résultat plutôt que de la taire ;
- **la topologie de la liaison.** La mise en cascade ABCD suppose une CHAÎNE,
  parcourue dans l'ordre envoyé. Le produit de matrices n'est pas commutatif :
  les mêmes tronçons dans un autre ordre donnent un autre S₁₁ (mesuré : −1,65
  contre −2,31 dB sur trois sections 75/25/48 Ω permutées). Un net qui se
  ramifie en T n'est pas une chaîne du tout. Le serveur vérifie désormais la
  continuité de la sélection (`_ruptures()`,
  [python/simulation_em.py](python/simulation_em.py)) et le dit quand elle
  manque — les impédances par tronçon et la carte de chaleur restent justes,
  seuls les paramètres S et les cumuls perdent leur sens. **Ce qui reste à
  faire** : ordonner la sélection en parcours quand c'en est un, et refuser
  franchement les paramètres S quand ce n'en est pas un, plutôt que de les
  rendre assortis d'une réserve.

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

### Bus et feuilles hiérarchiques

Pas de bus ni de feuilles hiérarchiques — un `D0..D7` se tire à huit fils. Les
nets globaux couvrent le multi-feuille, c'est un demi-lot.
