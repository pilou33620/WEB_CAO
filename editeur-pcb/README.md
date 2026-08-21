# Éditeur PCB

Éditeur de circuit imprimé multicouche, en HTML/JS sans dépendance, qui part
de la netlist produite par l'éditeur schématique.

## Deux façons de l'ouvrir

- **Projet éclaté** : ouvrir `editeur-pcb.html`. C'est la version à modifier.
- **Fichier unique** : `dist/editeur-pcb.html`, autonome, à envoyer ou archiver.
  Il est régénéré par `python3 outils/build-monofichier.py`.

Les scripts sont des scripts classiques, pas des modules : `editeur-pcb.html`
s'ouvre directement depuis le disque, sans serveur local.

## Arborescence

```
editeur-pcb.html               structure de la page et branchement des fichiers
css/style.css            jetons visuels, panneaux, tableaux, boîtes
js/00-espace-config.js   WS_CONFIG : clé de stockage et disposition d'usine des panneaux
js/01-core.js            état, empilage logique et physique, rôles de couche,
                         repères,
                         empreintes, nets, classes, contour
js/02-connectivity.js    union-find, îlots de cuivre, chevelu, DRC, netlist, placement
js/03-render.js          canevas, ordre des couches, remplissage des zones, calques
js/04-fabrication.js     masque et pâte, Gerber RS-274X, Excellon, feuille
                         d'empilage, archive ZIP
js/05-tools.js           historique, sélection, tracé, zones, contour, souris, clavier
js/06-panels.js          onglets de couches, listes, règles, propriétés,
                         empilage physique
js/07-app.js             fichiers, câblage des boutons, initialisation
outils/build-monofichier.py assemble le tout dans dist/
test/harness.js          banc d'essai sans navigateur
```

Deux fichiers viennent du dossier partagé, à la racine du dépôt :

```
../commun/workspace.css  habillage de l'espace de travail
../commun/workspace.js   panneaux détachables, paramétré par WS_CONFIG
../commun/test/dom-stub.js  DOM minimal du banc d'essai
../commun/outils/monofichier.py  mécanique d'assemblage
```

L'éditeur schématique charge exactement les mêmes : tout ce qui les distingue
tient dans `js/00-espace-config.js`.

## L'ordre de chargement compte

Les scripts partagent une seule portée globale ; les `const` de haut
niveau d'un fichier sont visibles des suivants, mais **pas** des précédents au
moment où ils s'exécutent. La règle pratique :

1. `00-espace-config` déclare `WS_CONFIG`, lu par `../commun/workspace.js`
   chargé en dernier.
2. `01-core` déclare `S`, l'état commun. Rien avant lui, hors la config.
3. `03-render` récupère le canevas (`cv`, `ctx`) : il lui faut le DOM, d'où les
   scripts en fin de `<body>`.
4. `05-tools` pose les écouteurs sur `cv` : il vient donc après `03-render`.
5. `07-app` appelle `init()` en dernière ligne, quand tout est défini.
6. `../commun/workspace.js` s'initialise tout seul et appelle `resize()` puis
   `fit()` : il ferme la marche.

À l'intérieur d'un fichier, une fonction peut en appeler une autre définie
n'importe où : seules les instructions de haut niveau sont sensibles à l'ordre.

## Dépendances entre fichiers

Le découpage suit les responsabilités, pas une hiérarchie stricte : quelques
fonctions de rendu sont réutilisées par la connectivité et la fabrication, ce
qui est voulu — c'est ce qui garantit que l'écran, l'analyse des îlots et les
Gerber décrivent le même cuivre.

- `02-connectivity` appelle `padFill` et `clipToBoard` de `03-render` pour
  rasteriser le remplissage réel des zones.
- `04-fabrication` reprend les mêmes règles de dégagement et de liaison
  thermique que `03-render`.
- `06-panels` et `07-app` ne sont appelés que par l'interface.

## Empilage physique

Deux panneaux décrivent l'empilage, et ils ne parlent pas de la même chose.

**Empilage** est logique : combien de couches de cuivre, comment elles
s'appellent, laquelle est visible. C'est ce que le routage manipule.

Chaque couche de cuivre porte un **rôle** : signal, mixte, plan de masse, plan
d'alimentation, blindage. Les trois derniers entretiennent une zone pleine
carte — c'est l'ancien rôle « plan », précisé. Le champ `plane` reste la vérité
pour tout ce qui fabrique du cuivre (zone auto, DRC, Gerber) ; le rôle en est la
lecture humaine, et `coherentRole()` garantit qu'il ne peut pas contredire le
cuivre réellement posé, y compris à la lecture d'un fichier trafiqué. Le rôle se
change depuis la coupe du panneau d'empilage ou depuis le menu du bouton
« Zone cuivre » : les deux passent par `setLayerRole()`.

**Empilage physique** décrit la carte que le fabricant presse. Le modèle tient
en deux tableaux, dans `S.stack` :

```
stack.cu[i]   épaisseur du cuivre de la couche i          S.cu entrées
stack.di[i]   diélectrique entre les cuivres i et i+1      S.cu-1 entrées
```

Une carte simple face n'a aucun intervalle entre deux cuivres : son unique
entrée de diélectrique décrit alors l'âme qui la porte. Tout est en
millimètres, cuivre compris ; seule l'interface le montre en micromètres.

La coupe se lit en tableau, du dessus vers le dessous, avec le vocabulaire des
fabricants : `#`, nom, matière, rôle, poids du cuivre, épaisseur, Dk, Df. La
teinte de la ligne dit son rôle sans qu'on ait à lire la colonne — masse en
bleu, alimentation en rouge, blindage en cyan, signal et mixte en jaune pâle,
couches techniques en vert — et la ligne choisie s'édite juste en dessous. La sérigraphie y figure, comme chez le fabricant, mais ne pèse rien
dans l'épaisseur.

Le panneau en tire l'épaisseur totale, l'écart à l'épaisseur visée, la symétrie
de l'empilage et le rapport d'aspect du perçage le plus défavorable, calculé sur
la longueur réellement percée : un via borgne ne traverse pas toute la carte.
Deux boutons font le travail ingrat : « Répartir sur la cible » met les
diélectriques à l'échelle pour tomber sur l'épaisseur commandée, « Symétriser »
fait la moyenne des couches deux à deux. Ils sont neutralisés quand ils
n'auraient rien à faire, et leur infobulle dit pourquoi.

Une carte dissymétrique se voile à la cuisson, mais l'apprendre ne suffit pas :
`stackAsym()` renvoie la liste des paires qui ne se répondent pas — épaisseur,
nature ou Dk — et le panneau les nomme (« Diélectrique 1 (0.500 mm) contre le 3
(0.210 mm) »).

Le traitement des vias se déclare ici, avec les autres options de fabrication :
laissés nus, recouverts de vernis, bouchés résine, ou bouchés et plaqués pour
une pastille sur le via (IPC-4761). Seul le premier ouvre le masque. Il
remplace l'ancien booléen `tented`, que les fichiers antérieurs portent encore
et que `normDoc` convertit à la lecture.

## Sélection multiple et presse-papier

`Ctrl+clic` (ou `Maj+clic`) ajoute une empreinte, une piste, un via, une zone à
la sélection, et l'en retire au clic suivant (`toggleHit`). Un lasso tiré
modificateur enfoncé s'ajoute à ce qui est déjà pris. Le déplacement, la
rotation, le retournement et la suppression travaillent depuis toujours sur
l'ensemble de la sélection.

**Dérouter la sélection seule.** `U`, ou le bouton *Dérouter* de la barre
d'outils, ou celui que le panneau Propriétés propose sur une sélection mêlée
(`unrouteSel`, `js/05-tools.js`). C'est la touche `U` de l'éditeur schématique,
portée sur la carte. Un lasso prend tout — empreintes, pistes, vias, zones ;
`U` vide le routage de la sélection et laisse les empreintes en place, et
sélectionnées, prêtes à être replacées avant de router autrement. Le routage,
c'est le cuivre du chemin : les segments **et** les vias qui les font changer de
couche — un via resté seul n'est pas du routage, c'est un trou dans la carte. Une
zone de cuivre, elle, décrit la carte et ne relie pas deux pastilles : elle
reste, comme le contour et les découpes. `Suppr` est là pour tout emporter. Sans
piste ni via dans la sélection, rien n'est supprimé : le pied de page le dit
plutôt que d'emporter les empreintes.

**La piste reste d'un seul tenant.** Glisser un segment n'arrache plus ses
voisins et ne leur impose plus d'angle de travers. Le déplacement se décrit par
ses **articulations** — les points où ce qui bouge touche ce qui reste
(`moveJoints`, `js/05-tools.js`) :

- La sélection s'étend d'abord à la **portion droite** entière (`collinearRun`) :
  la ligne d'un coude à l'autre, sans exception. Le routeur pose un segment par
  clic, et une ligne droite se trouve en plus coupée par tout ce qu'elle
  rencontre — pastille traversée, via, embranchement, changement de largeur.
  Il faut la prendre **entière**, et pas seulement jusqu'à la première coupure :
  un morceau resté en arrière est parallèle à celui qu'on tire, donc aucune
  intersection ne peut lui rendre son angle — il basculerait de travers. La
  portion ne s'arrête donc qu'au vrai coude et au changement de net. Un via ne
  l'arrête pas non plus : une ligne droite qui change de couche reste une ligne
  droite, et la laisser derrière la coucherait de la même façon.
- À chaque bout, le **coude voisin garde sa direction** et glisse le long
  d'elle jusqu'à retomber sur la ligne de la portion tirée : `applyJoints`
  calcule l'intersection des deux droites. Un 45° reste un 45°, un angle droit
  reste droit, et la piste ne s'ouvre nulle part. Deux directions parallèles
  n'ayant pas d'intersection, le point suit alors simplement le déplacement.
- Tirer plus loin que la **naissance du coude** n'a pas de sens : la ligne du
  voisin y repart en arrière, et la piste se replie en crochet au-dessus de son
  départ — la forme qu'on ne dessine jamais à la main. `wallChain` relève donc,
  derrière le premier voisin, ceux qui le suivent de coude en coude : passé sa
  naissance, c'est le **mur suivant** qui tient le coude, et celui qu'on a
  dépassé se replie sur l'articulation — il disparaîtra au relâchement. La piste
  se tend comme un fil. La chaîne s'arrête à ce qui ne peut pas se replier :
  pastille, via, embranchement, ou bout de piste libre. Là, le coude **se
  retourne** (`wallFlip`) : sa direction est renvoyée par la ligne de la portion
  tirée, si bien qu'un 45° reste un 45° et passe simplement de l'autre côté —
  ce que fait la main quand le coude change de bord.
- Le retournement sert aussi quand le mur suivant est **parallèle** à la portion
  tirée : deux droites de même sens n'ont pas d'intersection, ce mur n'offre donc
  aucun appui, et la chaîne se retrouve épuisée sans que rien ne tienne le coude.
  Le cas se présente dès qu'un 45° est pris entre deux horizontales — le tracé le
  plus courant qui soit. `slideAt` retient pour cela le **dernier mur consommé**
  et c'est lui qui se retourne. Se contenter de translater l'articulation, comme
  avant, lui faisait perdre son angle : le voisin repartait de biais, ni droit ni
  à 45°, en travers de la grille, et son autre bout s'étirait au loin en une
  longue diagonale.
- Le coude mangé laisse ses deux voisins bout à bout. S'ils repartent du même
  point dans le **même sens**, la piste se replie sur son propre cuivre puis
  ressort en l'air : le **crochet**, ce V refermé pointant vers nulle part. Au
  dépôt, il se défait (`pruneHooks`) — les deux segments n'en font plus qu'un,
  d'un bout à l'autre. La liaison est conservée, le cuivre en double s'en va. Un
  point tenu par une pastille, un via ou un embranchement ne se défait pas : s'il
  y a là un rebroussement, c'est qu'on l'a voulu. Le ménage se fait dans l'ordre —
  segments morts d'abord, sinon l'articulation compte quatre extrémités et le
  crochet passe inaperçu ; puis crochets ; puis segments morts de nouveau, car
  défaire un crochet peut annuler un segment.
- Les deux bouts d'une portion glissent chacun le long de son mur, et rien ne
  les empêchait de **se croiser**. Deux cas, tous deux dessinant un papillon.
  Le premier : le retournement d'un coude envoie son bout par-delà l'autre, la
  portion prend une **longueur négative** et la piste se recroise. Il reste alors
  une place tenable — l'appui du premier mur au-delà de sa naissance
  (`slideAt` en rend la liste, `jointFlips` écarte celles qui renversent la
  portion) : le coude repart en arrière, ce qu'on évite tant qu'on peut, mais
  son angle est gardé et rien ne se croise. Le second : les deux murs
  eux-mêmes se croisent, passé le point où leurs lignes se rencontrent. Là,
  aucun arrangement de coudes ne rattrape la figure et le geste **bute**
  (`crossStop`), comme sur un obstacle d'isolation.
- Un **embranchement** au bord de la portion est un voisin comme un autre : il
  garde sa direction et se raccourcit ou s'allonge. C'est ce qui permet de
  déplacer une ligne qui porte une dérivation sans rien mettre de travers.
- `anchorKey` réunit sous une même clé les extrémités qu'un **via** relie :
  la piste qui repart sur l'autre couche suit, sinon le changement de couche se
  déchirerait. Une pastille, elle, reste fixe — c'est le coude qui glisse.
- Les positions de départ sont relevées au premier mouvement réel et le
  déplacement s'applique en **absolu** : on peut le suspendre (Alt) puis le
  reprendre sans décalage, et rien ne dérive au fil des images.
- Un segment ramené sur lui-même disparaît au dépôt (`pruneDeadTracks`), comme
  lorsqu'on tire une extrémité sur l'autre.

C'est le geste des fils de l'éditeur schématique, transposé au cuivre, avec en
plus la contrainte d'angle que le schématique n'a pas besoin de tenir.

### L'aimant angulaire du sommet tiré

Tout cela vaut pour la portion tirée par son **milieu**. Tirer un **sommet** par
sa poignée est un autre geste : les bouts d'en face ne bougent pas, et rien
n'obligeait les deux jambes à retomber d'aplomb. On tirait un coude de quelques
dixièmes et il en sortait du 32° — l'**angle bâtard** (*off-angle track*), que
le rendu Gerber n'optimise plus et que certains fabricants refusent au contrôle
d'entrée.

Le geste **reste libre** — il faut bien pouvoir sortir d'une pastille de
travers — mais les places où les jambes retombent d'aplomb sont désormais
**magnétiques**, à quelques pixels près, comme les pastilles le sont déjà
(`tendMagnet`). Deux cas, selon ce que le sommet a en face de lui :

- **un seul point d'appui** — un bout libre, une extrémité détachée à l'Alt : le
  curseur se projette sur le plus proche des huit rails partant de ce point ;
- **deux points d'appui** — un vrai coude : les places d'aplomb sont les
  intersections des deux éventails de rails.

Ces places-là sont peu nombreuses, et c'est la géométrie qui le veut, non
l'aimant : **deux bouts fixes ne laissent pas le choix**. Garder les deux jambes
d'aplomb ailleurs demanderait de poser un segment de plus — c'est exactement ce
que fait le chanfrein (**D**), et c'est par là qu'il faut passer. L'aimant ne
joue pas quand la grille pose déjà le sommet d'aplomb, ni en angle libre : c'est
alors un choix, et ce qui reste de biais, le contrôle le dit — voir *L'angle
bâtard au contrôle*.

`Ctrl+C` / `Ctrl+X` / `Ctrl+V` copient et collent ce bloc : empreintes, pistes,
vias, zones et découpes. Le contenu est rangé relativement à son coin
haut-gauche puis reposé sous le pointeur, les écarts internes conservés. Les
repères sont refaits pour rester uniques (`R12` → `R13`), les nets des
pastilles, pistes et vias sont gardés — dupliquer un découplage avec son
routage n'aurait pas de sens si la copie se retrouvait en l'air. Ce qui sort du
presse-papier repasse par `normFp` / `normTrack` / `normVia` / `normZone`, les
mêmes normalisations que la lecture d'un fichier.

Ctrl servant désormais à la sélection, les gestes de géométrie sont passés sur
**Alt** : `Alt+clic` insère un point sur une piste sélectionnée ou un sommet sur
une arête de zone ou de contour, `Alt+glisser` sur une extrémité de piste la
détache du coude, et **Alt enfoncé pendant un déplacement** laisse les voisins
sur place au lieu de les étirer. Alt sur le vide continue de déplacer la vue —
`altTarget()` départage les deux. **D** adoucit un angle droit en 45°.

## Le L chanfreiné et sa posture

Un clic pose un chemin en **L chanfreiné** : une diagonale et une portion
droite (`route45`, `js/05-tools.js`). Leurs deux longueurs se prennent sur les
valeurs absolues du trajet — `d = min(|dx|,|dy|)` pour la diagonale,
`s = | |dx| - |dy| |` pour la portion droite.

Écrite `|dx| - |dy|`, cette seconde longueur devient **négative** dès que le
trajet est plus haut que large : la portion droite repart alors en arrière
par-dessus la diagonale, et le contour se recroise. C'est le **papillon**
(*bowtie polygon*), dont les zones de surface nulle sont des *échardes*
(*slivers*) — et la spec Gerber RS-274X interdit les contours auto-intersectants
dans une région G36/G37. Prises en valeur absolue, les deux longueurs sont
positives par construction : le papillon devient impossible. Les trajets
dégénérés — tout droit, ou à 45° plein — ne posent **qu'un seul segment** : un
point milieu confondu avec un bout laisserait un segment de longueur nulle dans
le document, dans le .json et dans le Gerber.

### L'aimant angulaire, contre l'écharde

Entre les deux se tient une zone morte : `s` positif, mais minuscule. Le
papillon est mort, l'**écharde** le remplace — un décrochement (*jog*) de trois
centièmes, une languette de cuivre plus fine que la piste qu'elle prolonge, que
le bain de gravure sous-attaque. Le fabricant la compte parmi ses défauts, et le
test d'égalité stricte ne l'attrape pas : avec un curseur libre, `s` ne vaut
jamais *exactement* zéro. Une grille au dixième sous une piste de trois dixièmes
en fabrique à la chaîne, et un centre de pastille hors grille en pose de
n'importe quelle longueur.

D'où le **seuil d'écrasement** `minSeg`, passé à `route45()` et à
`routeCorner()`. En deçà, on ne supprime pas le point milieu — ça laisserait un
angle bâtard — on **déplace l'arrivée** :

| ce qui est trop court | ce que devient le trajet |
| --- | --- |
| la portion droite (`s < minSeg`) | la diagonale pure, arrivée en `(|dx|+|dy|)/2` sur chaque axe |
| la diagonale (`d < minSeg`) | l'axe pur, horizontal ou vertical |

C'est l'aimant angulaire du routeur de KiCad : la piste **colle aux huit rails**
et le décrochement ne peut plus naître dans la zone morte. Le seuil se prend sur
la **largeur de la piste** (`minJog()`) — un épaulement plus court que la piste
n'est pas un coude. `minSeg` absent ou nul rend la géométrie pure, sans aimant :
c'est ce que `route45()` fait quand on l'appelle pour lui-même.

L'aimant ne joue **qu'en l'air** (`routeJog()`). Une arrivée ancrée — pastille,
via, bout de piste — se pose au point exact : déplacer l'arrivée de quelques
centièmes pour effacer un décrochement raterait le centre visé, et la liaison
avec lui. Le décrochement qui subsiste au pied d'une pastille hors grille, c'est
le contrôle DRC qui le dit, après coup — voir *Le décrochement au contrôle*.

La **posture** dit lequel des deux segments vient en premier : diagonale
d'abord, ou portion droite d'abord. C'est le terme de KiCad, dont le routeur la
bascule sur `/`. Elle ne se **mémorise pas** dans la piste en cours : la retenir
verrouille le coude — une fois posé un segment droit, `min(|dx|,|dy|)` reste nul
et le chanfrein ne réapparaît plus, quoi qu'on fasse de la souris. Elle se
recalcule donc à chaque mouvement (`autoPosture`), sur deux règles :

- la piste **continue dans sa direction** puis tourne : après un 45°, la
  diagonale repasse devant ; après une droite, la portion droite. Deux clics
  dans le même axe ne font ainsi qu'un seul segment ;
- un départ à l'exact **opposé** du segment qu'on vient de poser repasserait sur
  son cuivre — deux segments bout à bout en sens contraire se recouvrent, et ce
  recouvrement de surface nulle est ce qu'un Gerber ne sait pas rendre. C'est
  l'autre arrangement qui l'emporte : il quitte le point tout de suite.

**`/`** (ou **Espace**) bascule la posture à la main, comme dans KiCad. La
bascule inverse l'arrangement choisi le temps du coude en cours, et se rend au
dépôt du segment : elle ne survit jamais à un clic.

### L'angle imposé aux pistes

Le panneau *Règles de tracé* porte, à côté du pas de grille, le choix de
l'angle — `S.rule.corner`, lu par `cornerMode()` et posé par `setCornerMode()` :

| règle | ce que pose un clic |
| --- | --- |
| **45°** *(défaut)* | le L chanfreiné ci-dessus : une portion droite et une diagonale |
| **90°** | deux segments orthogonaux, l'axe le plus avancé d'abord |
| **libre** | un seul segment, l'angle qu'on veut |

`routeCorner()` distribue les trois sur un même contrat : des segments bout à
bout, aucun de longueur nulle, l'arrivée où on l'a demandée — à l'aimant près,
qui peut la ramener de moins d'une largeur de piste sur le rail. L'angle droit
s'y range aussi : une marche de trois centièmes n'y est pas plus fabricable
qu'ailleurs, et le trajet se redresse alors sur son axe long. La posture et sa
bascule valent pour les deux règles qui posent un coude ; en libre, il n'y a
rien à arranger. `cornerLegs()` décrit les deux départs possibles selon la
règle, si bien qu'`autoPosture()` n'a pas à connaître la géométrie de chacune.

La règle se range **avec le document** : elle décrit la carte au même titre que
l'isolation ou la marge de bord, se défait d'un Ctrl+Z, et `normDoc()` la relit
sur liste fermée — un fichier antérieur à ce réglage, ou qui raconte n'importe
quoi, se lit à 45°. Rien de ce qui est déjà posé ne bouge quand on en change :
la règle vaut pour la suite du tracé.

## Adoucir un angle droit

Un coude à 90° se passe en 45° d'une touche : **D**, ou le bouton
*Angle droit → 45°* du panneau des propriétés. Sélectionner n'importe quel
morceau d'une des deux portions suffit — c'est la portion qui porte le coude,
pas le segment cliqué (`mitreSel`, `js/05-tools.js`).

Le calcul recule d'autant sur les deux portions qui se rejoignent, puis pose la
corde entre les deux points obtenus : deux longueurs égales sur deux directions
perpendiculaires donnent exactement 45°. La longueur retenue est celle de la
**plus courte des deux portions** — c'est le tracé qu'aurait posé le routeur
s'il était passé par là. Quand la portion courte y passe tout entière, elle
disparaît et la diagonale part de son point d'attache : une piste qui sortait
d'une pastille à angle droit en sort désormais en biais, sans se décrocher.

Reculer d'autant des deux côtés est ce qui donne le 45° — la portion la plus
longue garde donc l'**écart des deux longueurs**. Sous la largeur de piste, ce
reste est une écharde : cinq millimètres onze contre cinq tout rond laissaient
onze centièmes de cuivre famélique au bout de la piste. On recule alors des deux
côtés d'une largeur de plus, ce qui rend du cuivre aux deux restes au lieu d'en
laisser un seul, exsangue.

La commande refuse tout ce qui n'est pas un angle droit franc (tolérance ~2,5°),
un chanfrein plus court que la largeur de piste — il ne voudrait rien dire —,
un coude portant un via ou une pastille, et deux portions de largeurs
différentes — un 45° déjà en place n'est donc jamais retouché. Elle ne pose un
pas d'annulation que si elle a vraiment quelque chose à faire.

### L'anti-collision pendant un glissement

Le routeur refuse d'avancer sous l'isolation ; le glissement, lui, ne regardait
rien. On traversait un boîtier entier — pistes posées sur des pastilles d'un
autre net — sans un mot, et seul le DRC, après coup, le disait.

Le cuivre tiré **bute** donc sur l'obstacle : la position fautive n'est jamais
appliquée, le geste s'arrête là et reprend dès qu'on repart de l'autre côté. Le
déplacement s'appliquant en absolu, revenir au décalage précédent suffit à
replacer tout ce que le geste avait touché, coudes compris. Un message le dit
une fois, et rappelle qu'on peut couper l'anti-collision pour forcer — comme au
tracé.

Deux précautions, dans `armClear()` et `moveClearBad()` :

- on ne juge que ce qui était **propre avant** le geste : une carte déjà en faute
  doit rester réparable à la main, sinon le geste se fige précisément là où il
  faudrait pouvoir sortir la piste ;
- ce que le geste emmène ne se juge pas **contre lui-même** : deux segments tirés
  ensemble gardent leur écart, et un coude ne colle pas à son propre voisin.

Le même « bute » sert une seconde fois, contre la piste elle-même : `crossStop()`
refuse la position où le cuivre déplacé se **recroiserait**. Seuls comptent les
croisements francs — bout à bout ne compte pas, un embranchement en T non plus —
et, comme pour l'isolation, seuls ceux que le geste **ajoute** : une piste déjà
croisée reste réparable à la main.

Ce que cela ne couvre pas : le déplacement d'un boîtier ou d'une zone, qui
emmène ses propres pastilles — c'est un autre problème que l'isolation d'une
piste, et le geste y reste libre. Traverser un obstacle *en passant*, pendant le
geste, ne compte pas non plus : seul l'endroit où le cuivre se pose est jugé.

## Pas de grille

L'éditeur ouvre sur un pas de **0,1 mm** : assez fin pour tomber sur le centre
d'une pastille sans se battre avec l'accrochage, assez rond pour que les
coordonnées restent lisibles. Il se règle ensuite à deux endroits, qui restent
d'accord : le menu de la barre d'outils, à côté du bouton *Grille*, et le
panneau *Règles*. Les deux passent par `setGridStep()`, dans `js/05-tools.js`. Des millimètres ronds
d'abord — 0,05 · 0,1 · 0,25 · 0,5 · 1 · 2 · 5 mm — plus les deux pas impériaux
dont on ne peut pas se passer : 1,27 et 2,54 mm (0,05 et 0,1 pouce),
l'écartement des broches de la plupart des boîtiers traversants.

Le pied de page annonce ce que vaut une case : `1 carré = 0,5 mm`. Trop serrée
à l'écran, la grille n'est plus tracée qu'une case sur deux, sur cinq… : le
pied de page annonce alors la case réellement visible et rappelle le pas
d'accrochage entre les deux — `1 carré = 2 mm · pas 0,5 mm`. C'est
`gridShownStep()` (`js/03-render.js`) qui décide, et le tracé comme l'affichage
en découlent : ils ne peuvent pas diverger.

La case tracée grimpe l'échelle **1 · 2 · 5 · 10** du pas de départ : 0,1 puis
0,2 · 0,5 · 1 · 2 · 5 mm. Doubler à chaque fois, comme avant, annonçait des
cases de 1,6 puis 3,2 mm dès un pas de 0,1 mm — personne ne compte en 1,6 mm, et
le quadrillage ne retombait jamais sur le millimètre. Un pas impérial garde de
même ses multiples : 1,27 · 2,54 · 5,08 mm.

La grille se peint **par-dessus le substrat**, entre le remplissage de la carte
et son contour (`drawSub` puis `drawGrid` puis `drawBoard`, dans `paint()`).
Peinte dessous, la carte l'avalait : dès qu'on entrait dans le contour — là où
l'on vise, justement — plus rien ne disait où tomberait le point suivant. Le
substrat étant plus clair que le fond, ses lignes le sont d'autant
(`C_GRID_S`, `C_GRIDMAJ_S`) : même quadrillage, deux teintes, et la lisibilité
ne change pas au passage du bord. Le contour, lui, repasse au-dessus, sinon la
grille entaillait son trait à chaque croisement.

### La case de l'ancre

Un centre de pastille tombe rarement sur le quadrillage : une rangée au pas de
2,54 mm pose ses colonnes à 1,27 mm de son axe, un DIP à 3,81 mm — des valeurs
qu'une grille au demi-millimètre ignore. Accrocher la suite du tracé au seul
quadrillage faisait alors sortir la piste de travers du centre, d'un décalage
plus large que la piste elle-même : ce qui émergeait de l'anneau n'était plus
centré, et le premier segment partait en biais.

Le point de départ sert donc d'ancre. `snapNear()` (`js/01-core.js`) lui
réserve une case, centrée sur son axe et large d'un pas : viser cet axe suffit
à y rester, et les nœuds voisins restent atteignables de part et d'autre. Le
tracé s'y réfère par `routeTarget()`, le glissement d'une articulation par
`tendAnchor()` — là, ce sont les points d'en face qui donnent les axes à tenir,
si bien que tirer un coude sous une pastille recentre la piste sur son centre.

Le départ tenait ainsi son axe, mais l'arrivée non : l'accroche (`magnet`) se
mesurait depuis le **centre** de la pastille. Or le centre d'une pastille de
2 mm est à plus d'un millimètre de son bord — arriver dessus ne l'accrochait
qu'en visant le milieu. Manqué de peu, le point retombait sur le quadrillage,
hors de l'axe et court d'un rien : la piste n'entrait plus au centre. La
distance se mesure maintenant au **cuivre** (`padDist`, négative à l'intérieur),
si bien que la portée s'ajoute au bord quelle que soit la taille de la pastille.
Le point rendu reste le centre : c'est là que la piste doit entrer.

Poser une extrémité sur une pastille ne suffisait pas à recentrer la piste :
l'autre bout restait sur la grille et le segment demeurait légèrement de biais
— vertical à l'œil, mais dérivant d'une largeur de piste sur sa longueur. Au
relâchement, `straightenTend()` ramène ce bout sur l'axe de l'arrivée s'il en
est à moins d'un demi-pas, et l'articulation emmène ses voisins. Un bout tenu
par une pastille ou un via, lui, ne bouge pas.

### Voir la piste entrer dans la pastille

Le cuivre traversant — pastilles percées et vias — est peint avant les pistes.
Peint par-dessus, il avalait la fin de la piste : centrée ou de travers, elle
avait la même allure dès qu'elle passait sous l'anneau. Le contour et le
perçage, eux, repassent au-dessus (`drawThruMarks()`, `drawViaMarks()`) pour que
la pastille reste reconnaissable sous un plan ou une piste de passage.

La pastille **SMD** suit la même règle, pour la même raison : peinte après les
zones — donc lisible sous un plan — mais avant les pistes de sa couche. Peinte
par-dessus, elle escamotait le dernier millimètre du tracé : arrivée au centre
ou arrêtée de travers au bord, on voyait la même chose, un trait qui disparaît
sous le rectangle. Elle n'a pas besoin de contour par-dessus, lui : il serait de
la couleur de la piste. C'est le cuivre resté visible autour du trait qui donne
sa forme.

La sélection d'une piste suit la même logique : un halo posé sous le cuivre, et
non plus une bande tracée dedans, qui en masquait l'axe — or c'est cet axe que
l'œil cherche pour juger du centrage.

### Une ligne droite se peint d'un seul trait

Un segment se peint d'un bout rond : deux segments bout à bout se recouvrent
donc au coude. Peints l'un après l'autre, ils y déposaient **deux fois
l'encre** — la couture se voyait comme un cran en travers de la piste, d'autant
plus net que la couche était en retrait ou le net en veille, et le halo de
sélection passait carrément au travers. `strokeRuns()` réunit les segments d'un
même lot — une largeur, une transparence — dans un seul chemin : le pinceau ne
passe qu'une fois, et la ligne est continue, coupée ou non. L'aperçu du tracé en
cours (`drawRoute`) suit la même règle.

C'est le pendant, à l'écran, de ce que `commitRoute` fait dans le document : le
routeur pose un segment par clic — et `route45` en pose deux, la portion droite
puis la diagonale. Suivre une même direction sur trois clics laissait trois
morceaux là où l'œil, le fichier et le DRC ne voient qu'un trait. `sameLine()`
reconnaît la **suite d'une ligne** — même couche, bout à bout, même direction —
et ne garde la césure que là où elle veut dire quelque chose : sous un via, qui
ancre le changement de couche et qu'on doit pouvoir tirer. Un segment par
direction, donc, comme sur le dessin.

### Le décrochement au contrôle

L'aimant angulaire empêche l'écharde de naître sous le curseur ; il ne dit rien
de celles qui sont déjà là — posées par d'anciens clics, ou imposées par une
arrivée sur une pastille hors grille, où l'exactitude du point l'emporte. Le
contrôle DRC porte donc la règle DFM correspondante : **longueur de segment
minimale**, prise sur la largeur de la piste elle-même, sans réglage à tenir à
jour.

Seul un **décrochement** compte — un segment court pris entre deux autres. Un
moignon en bout de piste, entre une pastille et un via, est court par nécessité
et non par accident ; un via ancre le cuivre autour de lui. L'entrée sort en
remarque et non en erreur : le cuivre est électriquement juste, c'est le graveur
qui s'en plaindra.

### L'angle bâtard au contrôle

Troisième règle de fabrication, à côté de l'auto-intersection et de la longueur
minimale : **un segment doit tomber sur l'un des huit sens du tracé**. Le
routeur n'en pose jamais d'autre ; ceux qui existent viennent d'un sommet
déplacé à la main entre deux bouts fixes, là où aucun arrangement de coudes ne
rend l'angle. La tolérance est serrée — un dixième de degré, mille fois
l'arrondi au micron d'un vrai 45° —, l'entrée dit l'angle mesuré et de combien
il s'écarte, et la règle **se tait en angle libre** : c'est alors ce qu'on a
demandé. Comme les deux autres, elle sort en remarque : le cuivre est
électriquement juste, c'est l'atelier qui s'en plaindra.

## Ce que l'empilage apprend au DRC

Deux contrôles ne se voient pas sur le dessin, seulement dans la pile :

- **le rapport d'aspect** de chaque perçage — longueur percée sur diamètre —,
  remarque au-delà de 8 : 1, erreur au-delà de 10 : 1. Les pastilles
  traversantes sont regroupées par diamètre pour ne pas noyer la liste ; les
  vias, non : l'entrée porte le via fautif, et un clic dans la liste le
  sélectionne.
- **la faisabilité d'un via qui ne traverse pas la carte.** Une carte pressée en
  une fois ne sait faire qu'un via enterré dans une âme (percé et métallisé
  avant pressage) ou un via borgne dans le diélectrique extérieur (au laser).
  Tout le reste demande un laminage séquentiel : `viaBuild()` le dit et
  explique pourquoi, en remarque et non en erreur — c'est faisable, mais c'est
  un autre prix.

S'y ajoute une confrontation du rôle annoncé au cuivre réellement posé : un plan
qui porte des pistes, une couche de signal sous une zone pleine carte, une
couche mixte sans aucune zone. `roleCheck()` sert à la fois au DRC, à l'éditeur
de la ligne et au marquage de la colonne « Rôle » dans la coupe.

Le Dk et le Df de chaque diélectrique n'entrent dans aucun calcul ici : ils
décrivent la matière commandée, et c'est un solveur de ligne de transmission —
à venir, dans sa propre section — qui les lira.

`EMPILAGE.txt` reprend tout cela dans l'archive de fabrication : les Gerber ne
portent pas l'empilage, il faut donc l'écrire à côté. Le panneau sait aussi
l'exporter seul.

## Banc d'essai

```
python3 outils/build-monofichier.py && node test/harness.js
```

Le banc s'appuie sur le DOM minimal partagé (`../commun/test/dom-stub.js`),
exécute `dist/pcb.js` et couvre 138 cas : import de netlist, chevelu
multicouche, vias, îlots de cuivre, classes de net, édition des pistes,
géométrie du L chanfreiné, posture du coude et règle d'angle (45° / 90° /
libre), non-croisement du cuivre tiré, réglages d'usine,
contour libre, origine utilisateur, saisie au clavier, anti-collision, rôles de
couche, empilage physique et ce qu'il impose au perçage, Gerber, Excellon, archive ZIP, espace de travail (docks,
flottants, persistance), sélection multiple au Ctrl+clic, presse-papier
(copier/coller, contenu invalide, repères refaits), pas de grille, import
défensif d'un document et échappement HTML face à une netlist ou un `.json`
malveillant.

Installer `canvas` (`npm i canvas`) est facultatif mais recommandé : sans lui,
les essais qui rasterisent réellement le cuivre sont ignorés.

## Lecture d'un document

`loadDoc()` commence par `normDoc()`, qui reconstruit le document champ par
champ : types forcés, bornes appliquées, enregistrements inutilisables écartés
(polygone à moins de trois sommets, segment de longueur nulle, couche
inexistante, couleur qui n'est pas une couleur, identifiant en doublon). C'est
le pendant de `normComp()` côté schématique.

Une contrainte encadre cette normalisation : **elle doit être neutre sur un
document que l'éditeur a lui-même produit**, parce que `loadDoc()` sert aussi
à annuler et rétablir. Toute borne doit donc être sans effet sur une valeur
légitime. L'essai « import : neutre sur un document produit par l'éditeur »
compare la structure avant et après un aller-retour et signale la première
différence — c'est lui qui garde cette propriété.

## Limites connues

- Pas de bibliothèque d'empreintes : les pastilles sont paramétriques.
- Ni trous non métallisés, ni pastilles libres, ni texte de sérigraphie libre.
- Pas d'arcs : pistes, zones et contour sont faits de segments.
- Pas de copier/coller, pas de sauvegarde automatique.
- Aucun calcul de ligne de transmission : l'empilage note les matières et leurs
  constantes diélectriques, mais rien n'en tire d'impédance pour l'instant.
- Le contrôle des vias borgnes et enterrés suppose un pressage unique. Un
  empilage à laminage séquentiel est signalé comme tel, mais sa séquence ne se
  décrit pas : il n'y a qu'une liste de diélectriques, pas de sous-ensembles.
