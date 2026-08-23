# Éditeur PCB

Éditeur de circuit imprimé multicouche, en HTML/JS sans dépendance, qui part
de la netlist produite par l'éditeur schématique.

## Deux façons de l'ouvrir

- **Projet éclaté** : ouvrir `editeur-pcb.html`. C'est la version à modifier.
- **Fichier unique** : `dist/editeur-pcb.html`, autonome, à envoyer ou archiver.
  Il est régénéré par `python3 outils/build-monofichier.py` (sous Windows,
  `python` : `python3` y renvoie vers le raccourci du Microsoft Store).

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
js/08-empreinte.js       fenêtre d'édition d'empreinte, bibliothèque personnelle
js/09-diffpair.js        paires différentielles : règles, tracé couplé, impédance
js/10-pns-geom.js        routeur : enveloppes convexes, polylignes, trame 45°
js/11-pns-node.js        routeur : modèle du monde, index spatial, branches
js/12-pns-walk.js        routeur : contournement d'obstacle
js/13-pns-shove.js       routeur : poussée du cuivre gênant, de proche en proche
js/14-pns-placer.js      routeur : optimiseur du trajet posé
outils/build-monofichier.py assemble le tout dans dist/
test/harness.js          banc d'essai sans navigateur
```

Ces fichiers viennent du dossier partagé, à la racine du dépôt :

```
../commun/workspace.css  habillage de l'espace de travail
../commun/workspace.js   panneaux détachables, paramétré par WS_CONFIG
../commun/session.css    habillage des boutons de navigation
../commun/session.js     travail conservé en changeant d'outil (session d'onglet)
../commun/test/dom-stub.js  DOM minimal du banc d'essai
../commun/outils/monofichier.py  mécanique d'assemblage
```

L'éditeur schématique charge exactement les mêmes : tout ce qui les distingue
tient dans `js/00-espace-config.js`.

## L'ordre de chargement compte

Les scripts partagent une seule portée globale ; les `const` de haut
niveau d'un fichier sont visibles des suivants, mais **pas** des précédents au
moment où ils s'exécutent. La règle pratique :

1. `../commun/session.js` ouvre la marche : il câble les boutons de
   navigation dès que l'entête est là, et déclare `sessBrancher()` dont
   `07-app` se sert à la dernière ligne de `init()`.
2. `00-espace-config` déclare `WS_CONFIG`, lu par `../commun/workspace.js`
   chargé en dernier.
3. `01-core` déclare `S`, l'état commun. Rien avant lui, hors la config.
4. `03-render` récupère le canevas (`cv`, `ctx`) : il lui faut le DOM, d'où les
   scripts en fin de `<body>`.
5. `05-tools` pose les écouteurs sur `cv` : il vient donc après `03-render`.
6. `07-app` appelle `init()` en dernière ligne, quand tout est défini.
7. `08-empreinte` ne s'exécute pas au chargement : il ne déclare que la
   fenêtre d'empreinte et la bibliothèque, appelées au clic. Il vient donc
   après `07-app`, comme `19-broches.js` côté schématique.
8. `09-diffpair` vient après `07-app` pour la même raison — son panneau et son
   outil ne servent qu'au clic — mais il a besoin d'un premier affichage : sa
   dernière ligne appelle `buildDiffPairs()` elle-même. L'appeler depuis
   `init()` ne marcherait qu'en version un seul fichier, où tout est concaténé
   et les déclarations remontées ; en pages séparées, la fonction n'existe pas
   encore quand `init()` s'exécute. Les points d'entrée que les fichiers
   antérieurs lui empruntent — `drawDp()` dans `paint()`, `dpDrc()` dans
   `runDrc()`, `buildDiffPairs()` dans `refreshPanels()`, `dpOfNet()` dans
   `clrPair()` — passent donc tous par un `typeof … === "function"`.
9. `10-pns-*` à `14-pns-*` — le moteur de routage — viennent après
   `09-diffpair` pour la même raison qu'`08` et `09` : rien n'y tourne au
   chargement, tout y est appelé au clic. `05-tools` et `09-diffpair` les
   appellent donc sans précaution particulière, la résolution se faisant au
   moment de l'appel. Entre eux l'ordre compte, en revanche, et il est celui
   des numéros : la géométrie, puis le monde, puis le contournement, puis la
   poussée qui s'en sert, puis l'optimiseur.
10. `../commun/workspace.js` s'initialise tout seul et appelle `resize()` puis
   `fit()` : il ferme la marche.

À l'intérieur d'un fichier, une fonction peut en appeler une autre définie
n'importe où : seules les instructions de haut niveau sont sensibles à l'ordre.

Le revers de cette portée unique : **deux fichiers ne peuvent pas donner le même
nom à deux fonctions différentes**, la seconde déclaration effaçant la première
sans un mot. C'est arrivé — `padOutline()` du rendu (contour d'une pastille) et
`padOutline()` de la fabrication (contour d'une ouverture, avec dilatation)
avaient le même nom et deux signatures : l'anneau des pastilles traversantes
était tracé avec une couleur en guise de dilatation, donc pas tracé du tout. La
seconde s'appelle désormais `padOpening()`.

## Dépendances entre fichiers

Le découpage suit les responsabilités, pas une hiérarchie stricte : quelques
fonctions de rendu sont réutilisées par la connectivité et la fabrication, ce
qui est voulu — c'est ce qui garantit que l'écran, l'analyse des îlots et les
Gerber décrivent le même cuivre.

- `02-connectivity` appelle `padFill` et `clipToBoard` de `03-render` pour
  rasteriser le remplissage réel des zones.
- `02-connectivity` (le DRC) et `05-tools` (le tracé et le glissement)
  interrogent tous deux l'index spatial de `11-pns-node`. C'est voulu, et c'est
  la garantie que le routeur et le contrôle jugent le même cuivre au même
  seuil : `pnsPairGap` rappelle les mesures de `02-connectivity`, et `PNS_EPS`
  vaut sa tolérance.
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

## Le boîtier choisi au schéma décide de l'empreinte

L'éditeur schématique fait choisir un boîtier par composant (`0603`, `SOIC-8`,
`TQFP-64`, `BGA-256`…) et le recopie dans la netlist, troisième colonne de la
section `=== Composants ===`. C'est ce nom qui pose l'empreinte à l'import :
sans lui, tout se déduisait du seul nombre de broches et un SOIC-8 arrivait en
DIP traversant au pas de 2,54 mm, à replacer et à re-régler à la main.

`PKG_LIB` (`js/01-core.js`) donne, par famille, le style et les cotes :

| famille | style d'empreinte | ce que le nom fixe |
| --- | --- | --- |
| `01005` … `2512`, `SMA`/`SMB`/`SMC`, `MELF`, `SOD-123` | puce | l'écartement des deux bornes |
| `SOT-23`, `SOT-89`, `SOT-223`, `TO-252`, `TO-263` | deux rangées CMS | pas et écartement, languette non dessinée |
| `TO-92`, `TO-220`, `TO-247` | une rangée traversante | le pas des pattes |
| `SOIC`, `SOP`, `SSOP`, `TSSOP`, `MSOP`, `DFN` | deux rangées CMS | pas, et largeur qui suit le brochage |
| `DIP` | deux rangées traversantes | 7,62 mm jusqu'à 28 broches, 15,24 au-delà |
| `LQFP`, `TQFP`, `QFP`, `PQFP`, `QFN`, `PLCC`, `LCC` | quatre côtés | pas selon le brochage, écartement calculé |
| `BGA`, `WLCSP`, `CSP` | grille de billes | le pas de la grille |

`pkgGeom()` lit le nom sans se soucier de la casse ni des séparateurs, écarte le
surnom entre parenthèses que propose le schématique (`TO-252 (DPAK)`) et prend
le brochage porté par le nom : `SOT-23-5`, `SOT23-5` et `sot 23 5` désignent le
même boîtier à cinq broches. Un nom hors table — `SOD-80`, `boîtier maison` —
ne renvoie rien : l'empreinte retombe alors sur le style déduit du brochage,
exactement comme avant, et le nom saisi est conservé tel quel.

Deux garde-fous :

- **Une broche câblée ne reste jamais sans pastille.** Le plus grand numéro de
  broche vu dans la netlist fait plancher : un `SOIC-8` dont la netlist cite
  `U1.14` arrive avec quatorze pastilles, pas huit. Le brochage annoncé par le
  boîtier l'emporte partout ailleurs, y compris pour le réduire quand le schéma
  passe de `SOIC-8` à `SOT-23-5`.
- **Réimporter ne défait pas le travail fait sur la carte.** À boîtier
  inchangé, position, rotation et cotes retouchées à la main restent en place.
  Seul un boîtier *différent* de celui déjà porté par l'empreinte la refait — et
  sans la déplacer. Le compte des empreintes refaites est annoncé dans le pied
  de page avec le reste du bilan d'import.

Le panneau *Propriétés* dit sous le champ *Boîtier* ce que le nom a décidé
(style, brochage, pas, écartement) ou pourquoi il n'a rien décidé. Saisir un
boîtier connu y repose l'empreinte ; si les cotes en place ne sont plus celles
du boîtier — parce qu'on les a retouchées à la main, puis regrettées — un
bouton *Reposer l'empreinte sur le boîtier* les remet. Il ne paraît que dans ce
cas, faute de quoi il n'y aurait rien à reposer. Les deux styles ajoutés
pour l'occasion — quatre côtés et grille de billes — sont proposés dans la liste
*Empreinte générique* comme les autres, et se relisent dans un document
enregistré.

Les cotes restent celles d'une empreinte paramétrique, au dixième de
millimètre : de quoi router juste, pas de quoi remplacer la fiche du fabricant.
Sur un boîtier à quatre côtés, la broche 1 est en haut à gauche et la
numérotation tourne dans le sens trigonométrique, comme sur le boîtier réel.

## Dessiner une empreinte à la main, l'enregistrer, la réutiliser

Le boîtier nommé couvre le cas courant, pas tous les cas : une languette de
DPAK, une pastille thermique de QFN, un connecteur maison, un brochage relevé
sur une fiche. Le bouton *Modifier l'empreinte…* du panneau *Propriétés* ouvre
une fenêtre où l'empreinte se voit — pastilles, numéros, contour de
sérigraphie, origine, point de repère — et se règle pastille par pastille
(`js/08-empreinte.js`). C'est la fenêtre de brochage du schématique
(`19-broches.js`), transposée au cuivre, et la mécanique est la même.

**Deux états, un seul basculement.** Une empreinte reste *calculée* tant que
ses trois cotes suffisent : style, pas, écartement. Le premier geste manuel —
glisser une pastille, la retailler, la percer, changer son numéro — la fige en
liste explicite (`fp.pads`, `fpFreeze()`), et les cotes génériques ne
commandent plus rien : le panneau les grise et le dit. Figer ne déplace aucun
cuivre : les pastilles calculées sont recopiées telles quelles, contour compris
— un essai du banc le vérifie au dixième de micromètre, faute de quoi passer en
dessin manuel décalerait le routage déjà posé. *Revenir au calcul* rend la main
au boîtier ; c'est un geste explicite, et `Ctrl+Z` le rattrape.

**Ce qui se règle sur une pastille** : le numéro de broche, le centre, la
largeur, la hauteur, la rotation, la forme et le perçage. Un perçage non nul
fait la pastille traversante — elle apparaît alors sur toutes les couches, part
au fichier de perçage, et reste plus étroite que la pastille, sinon il n'en
resterait pas de cuivre. *Appliquer à toutes* recopie dimensions, forme et
perçage sur les autres pastilles ; *Carré* recopie la largeur sur la hauteur.
Le contour de sérigraphie se saisit en largeur et hauteur autour du centre, ou
se rend au calcul automatique.

**Quatre formes, un seul paramètre** (`PAD_SHAPES`, `padRadius`) : le rayon des
coins.

| forme | rayon des coins | à quoi elle sert |
| --- | --- | --- |
| Rectangle (coins adoucis) | 0,22 × petit côté | la forme des empreintes calculées, celle des plages brasées d'un CMS |
| Rectangle (angles droits) | nul | pastille franche, et **carré** quand la hauteur égale la largeur |
| Oblong (bouts ronds) | moitié du petit côté | traversant à souder à la vague, pastille de connecteur |
| Rond | — | perçage, bille de BGA |

Un carré n'est pas une forme de plus : c'est un rectangle dont les deux côtés
sont égaux, d'où le bouton *Carré* plutôt qu'une cinquième entrée dans la liste.

La **rotation** est propre à chaque pastille, en degrés, dans le repère de
l'empreinte ; elle s'ajoute à celle de l'empreinte entière et s'inverse quand
celle-ci passe au dessous — un miroir renverse le sens des angles. Elle est
suivie partout : à l'écran, dans l'encombrement du contour (`padHalf`), dans la
distance au cuivre du DRC et du routeur (`padDist`), et dans les ouvertures
Gerber — `R` ou `O` aux quarts de tour, macro d'ouverture (`RRECT`, `OBR`) pour
un angle quelconque. L'oblong est mesuré pour ce qu'il est, un rectangle à
bouts ronds : sans cela une piste qui rejoint son extrémité en biais se
croirait déjà dans le cuivre.

Le **numéro de broche est l'identité de la patte**, pas son rang dans la liste :
c'est lui qui porte le net. Supprimer la pastille 3 ne renumérote donc rien, et
le net de la broche 5 reste celui de la broche 5. Le brochage de l'empreinte se
relit sur le plus grand numéro présent — c'est ce que lit l'import de netlist
pour rattacher les nets.

**L'origine est visible et se déplace.** La croix jaune — la même que
l'origine de la carte — marque le point d'accrochage : `fp.x`, `fp.y`. C'est
par lui que l'empreinte se déplace, autour de lui qu'elle pivote, et de lui que
se placent le repère et la valeur sur la sérigraphie (`fpTextPos`). On le
glisse à la souris ou on le décale au clavier ; le cuivre ne bouge pas d'un
micron pour autant — les pastilles reculent exactement de ce que `fp.x`/`fp.y`
avancent (`fpMoveOrigin`).

**À la fermeture de la fenêtre, l'origine revient au centre du composant**
(`fpCenterOrigin`). Une poignée restée sur un coin, ou pire à côté de la pièce,
se saisit là où on ne la cherche pas, fait pivoter l'empreinte autour du vide
et envoie le repère de sérigraphie hors du contour. Le recentrage est donc
systématique, et il est annoncé dans le pied de page. Une empreinte calculée est
centrée par construction : elle n'est pas figée pour rien au passage
(`fpIsCentered` tranche avant tout).

**Le repère de broche 1 est un point de sérigraphie**, et rien d'autre :
`fp.mark`, un disque en coordonnées locales, avec son diamètre (0,4 mm par
défaut). Ce qui s'affiche est exactement ce qui sortira sur le film — l'écran
montrait jusqu'ici un large anneau translucide autour de la pastille 1, qui
n'existait dans aucun fichier et masquait le cuivre. Il se glisse à la souris,
se grossit, et une case à cocher le retire.

Il ne paraît pas d'office sur un composant symétrique : sur une résistance, une
inductance, une ferrite, un quartz ou un condensateur CMS, les deux pattes se
valent et le point ne dit rien (`fpMarkWanted`, repères `R`, `RN`, `RV`, `L`,
`FB`, `FL`, `Y`, `X`, et `C` en boîtier puce). Un condensateur en boîtier
radial ou tantale le garde : il est presque toujours polarisé, et un doute sur
la polarité coûte plus cher qu'un point de trop. La case tranche dans les deux
sens, composant par composant, et **ce choix est écrit dans le document**
(`fp.mark=false` pour un retrait) — sans quoi la règle automatique le déferait
à la relecture.

**Les gestes sont ceux de la carte.** Une pastille — comme l'origine ou le
point de repère — se prend et se maintient pour la déplacer ; un clic dans le
vide ne fait rien. Le déplacement applique le **décalage** entre deux positions
accrochées à la grille, exactement comme le déplacement d'une empreinte sur la
carte : ce qu'on tient ne saute pas sous le pointeur, une pastille se prend par
son bord et garde son écart au curseur, et une cote qui ne tombe pas sur la
grille — un pas de 0,65 mm — n'y est pas ramenée de force. `Alt` relâche
l'accrochage, `R` tourne la pastille sélectionnée d'un quart de tour et
`Maj+R` dans l'autre sens : le même raccourci qu'`R` sur la carte, un cran plus
bas.

**Zoom et déplacement de la vue.** Le cadrage suit l'empreinte tant qu'on n'y
touche pas. La molette zoome autour du pointeur, les boutons `+` et `−` de
l'en-tête autour du centre, `⤢` (ou un double-clic sur le dessin) recadre. La
vue se déplace au bouton du milieu ou avec `Maj` enfoncée. Le facteur est
affiché dans l'en-tête, dans la même unité que le pied de page de la carte.

Pendant un geste, le cadrage automatique se tait et reprend au relâcher : sans
cela il se recalculait à chaque millimètre parcouru, le dessin glissait sous le
pointeur et ce qu'on tenait dérivait. Déplacer l'origine demande la même
précaution en sens inverse — le repère local recule, donc la vue avance
d'autant (`feOriginMove`) : à l'écran le cuivre ne bouge pas, ce qui est la
vérité de l'opération, et seule la croix suit le pointeur.

**Annuler et rétablir traversent la fenêtre** : `Ctrl+Z` et `Ctrl+Y` y agissent
sur la carte comme ailleurs. Annuler recharge le document et remplace les
empreintes : la fenêtre reprend la sienne par son identifiant (`feReattach`),
ou se ferme si elle a disparu. La fenêtre de brochage du schématique fait de
même (`peReattach`).

**Deux pastilles superposées** sont cerclées de rouge dans la fenêtre. Ce n'est
pas interdit — une traversante peut recouvrir une plage — mais si elles portent
deux nets différents, c'est un court-circuit, et le DRC le signale. Le contrôle
ne compare pas l'isolation *entre pastilles d'une même empreinte* : un QFN au
pas de 0,5 mm n'a pas 0,25 mm entre ses plages, et ce n'est pas un défaut de la
carte. Seul le recouvrement franc est repris.

**Ni le boîtier ni la netlist ne refont un dessin manuel.** `applyPkgGeom()`
refuse de toucher à une empreinte dessinée, et réimporter une netlist où le
schéma a changé de boîtier note le nouveau nom sans effacer le travail : le nom
ne sert plus qu'à la nomenclature, le panneau le dit. Une broche câblée
au-delà du dessin reçoit malgré tout sa pastille — rien de ce que porte la
netlist ne peut rester sans cuivre.

**La bibliothèque personnelle**, au bas de la fenêtre :

- *Enregistrer* range l'empreinte sous un nom, dans le stockage du navigateur
  (clé `pcbedit.empreintes.v1`). Une empreinte calculée s'enregistre aussi :
  seules ses cotes sont retenues, et elle se recalculera à l'arrivée.
- *Appliquer* pose une empreinte enregistrée sur le composant en cours. Seule
  la forme change : le repère, la valeur, le boîtier, la position, la face, la
  rotation et les nets appartiennent à la carte et n'y touchent pas.
- *Exporter .json* écrit `empreintes.json` (`{"format":"pcbfp-1",
  "footprints":[…]}`), *Importer .json…* le relit. C'est ce qui emporte une
  empreinte sur une autre machine ou dans un autre projet — le stockage du
  navigateur, lui, ne suit pas. Un nom déjà pris par une empreinte *différente*
  n'est jamais écrasé en silence : la nouvelle reçoit un suffixe, et la fenêtre
  le dit. Le même fichier importé deux fois ne fait qu'une entrée.

Tout ce qui entre — fichier, stockage du navigateur — passe par `normFpDef()`,
aussi défensif que `normFp()` : une pastille sans centre exploitable est
écartée, une liste vide rend l'empreinte au calcul, un contenu illisible est
ignoré sans rien casser.

L'accrochage de la fenêtre reprend le pas de grille de la carte, pour qu'une
pastille tombe sur la trame des pistes qui viendront la rejoindre ; `Alt` le
relâche, pour les cotes qui ne tombent pas dessus (un pas de 0,65 mm, par
exemple). Les pastilles dessinées et le contour imposé sont enregistrés dans le
`.json` de la carte (`fp.pads`, `fp.body`) et font l'aller-retour sans perte —
même essai de neutralité que le reste du document.

## Sélection multiple et presse-papier

`Ctrl+clic` (ou `Maj+clic`) ajoute une empreinte, une piste, un via, une zone à
la sélection, et l'en retire au clic suivant (`toggleHit`). Un lasso tiré
modificateur enfoncé s'ajoute à ce qui est déjà pris. Le déplacement, la
rotation, le retournement et la suppression travaillent depuis toujours sur
l'ensemble de la sélection.

**Prendre une piste entière.** Sur une piste, `Maj` fait autre chose qu'ajouter
un segment : `Maj+clic` prend la **piste entière**, tout le cuivre d'un seul
tenant à partir du segment cliqué (`trackRun`, `js/05-tools.js`). Le parcours
suit les extrémités qui se touchent tant qu'il reste sur le même net, et prend
les embranchements avec — une piste n'est pas une ligne, c'est ce qui tient
ensemble. Le routeur pose un segment par clic et une ligne droite se retrouve
coupée par tout ce qu'elle rencontre : sans ce geste, déplacer une liaison
demandait de rattraper ses morceaux un par un.

`Maj+double-clic` **étend la prise à toutes les couches** : le second clic
franchit les vias et emporte la piste sur chaque couche qu'elle traverse, les
vias de passage compris — les laisser derrière déchirerait le changement de
couche au premier glissement. Il en franchit **autant qu'il en faut** : dessus,
dessous, dessus à nouveau, la piste est prise en entier. Le doublé se reconnaît
dans `pointerdown` (`selectRun`) et non sur l'événement `dblclick` : celui-ci
n'arrive qu'après les deux appuis, quand la sélection est déjà faite et le
glissement déjà armé. Le second clic n'a pas à retomber sur le même segment —
n'importe lequel de ceux que le premier venait de prendre fait l'affaire.

Le franchissement se juge **géométriquement**, sur le critère électrique de la
connectivité : un via est de la piste dès que sa pastille recouvre le cuivre
(`viaTracks`, `js/05-tools.js`), et non seulement quand son axe tombe au micron
sur une extrémité. Un bout posé un peu de travers dans la pastille, un via
planté au milieu d'une ligne : dans les deux cas le courant passe, donc la
sélection passe. Le test porte sur le **segment entier** et pas sur ses seules
extrémités, et chaque via n'est ouvert qu'une fois — le balayage reste borné à
ceux que la piste touche vraiment. Un via portant un autre nom de net arrête
net le parcours : ce n'est pas cette piste-là.

`Ctrl` garde son rôle d'ajout par-dessus : `Ctrl+Maj+clic` **ajoute** la piste
entière à ce qui est déjà sélectionné au lieu de repartir de zéro. Et comme
`Maj` est pris, il n'attrape plus les extrémités d'une piste déjà sélectionnée :
un `Maj+clic` tombant sur un bout sélectionne au lieu de partir en glissement.
Le pied de page dit ce qui vient d'être pris — nombre de segments, et de vias
au doublé.

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

## Le routeur : pousser, contourner, signaler

Face à un obstacle, le tracé ne bute plus. Le moteur `1x-pns-*` reprend la
méthode du routeur de KiCad — le **PNS**, *Push and Shove* — réimplémentée
ici à partir de la description de ses algorithmes.

Le choix se fait dans *Règles de tracé*, ligne **Face à un obstacle**, et se
range avec le document (`S.rule.route`) :

| Règle | Ce qui se passe |
|---|---|
| **pousser le cuivre** (défaut) | le cuivre gêné s'écarte, et pousse à son tour ses propres voisins |
| **contourner** | la piste se faufile autour de l'obstacle ; rien d'autre ne bouge |
| **signaler** | le trajet fautif s'affiche en rouge et refuse de se poser |

Les trois se rabattent l'une sur l'autre dans cet ordre : ce qui ne peut pas
être poussé est contourné, ce qui ne peut pas être contourné est signalé. Une
pastille, elle, ne se pousse jamais — elle appartient à un boîtier placé, ce
n'est pas au routeur de déménager un composant.

### Ce sur quoi tout repose : l'enveloppe

Une **enveloppe** est le polygone convexe qui entoure un obstacle, gonflé de
l'isolation exigée plus la demi-largeur de la piste qui circule. La piste
devient alors une ligne sans épaisseur, et « cette piste respecte-t-elle
l'isolation ? » se ramène à « cette ligne entre-t-elle dans ce polygone ? ».
Contourner, c'est longer le bord ; pousser, c'est demander à la ligne adverse
de longer la nôtre.

L'enveloppe que le routeur longe est un **octogone aligné sur les axes** : ses
huit pans sont exactement dans les huit sens du tracé. Le tour est donc
nativement à 45°, sans rien à redresser après coup — et sans risque de
retomber dans l'obstacle qu'on venait d'éviter en le redressant.

### La branche

Un **nœud** est une vue de tout le cuivre de la carte ; une **branche** est une
couche mince posée par-dessus, qui ne retient que ce qu'elle ajoute et ce
qu'elle masque. Le shove essaie dans une branche : si l'essai rate, on jette la
branche et rien n'a bougé. Tant que la souris se déplace, ce qu'on voit
s'écarter n'existe que là ; le clic verse la branche dans la carte.

Un traçé entier — les pistes posées **et** tout le cuivre qu'il a poussé — ne
fait qu'un seul Ctrl+Z. Échap en cours de route remet tout en place de même.

### L'index spatial

Le même nœud sert au tracé, au glissement et au DRC. Le contrôle comptait
auparavant les conflits deux à deux — le carré du nombre d'objets ; il
interroge maintenant un voisinage. Sur une carte de 3 000 pistes, 300 vias et
960 pastilles, la seule partie « isolations » de l'ancien contrôle prenait
1 258 ms ; le contrôle complet en prend désormais 73.

Les mesures et les seuils n'ont pas bougé d'un micron : `pnsPairGap` rappelle
les fonctions de `02-connectivity`, et `PNS_EPS` vaut la tolérance du DRC. Un
routeur plus tolérant que son contrôle poserait du cuivre que le contrôle
refuse ensuite ; plus sévère, il refuserait des passages qui tiennent.

### L'optimiseur

Chaque tour d'enveloppe laisse derrière lui les sommets du polygone qu'il a
longé, y compris ceux dont plus rien ne justifie l'existence une fois
l'obstacle passé. Après chaque clic, la portion qu'on vient de figer repasse
donc à l'optimiseur, qui essaie de remplacer chaque fenêtre de sommets par le
coude direct et garde le remplacement s'il est plus court, à 45°, sur la carte
et sans faute d'isolation.

Il ne nettoie que ce que le **routeur** a produit. Un coude posé au doigt est
une intention, pas un détour : le raccourcir serait manger le clic. Et un
sommet tenu par une pastille, un via ou un embranchement ne bouge jamais —
raccourcir en décrochant une connexion ne serait pas une optimisation.

### Les paires différentielles

La paire se présente au moteur comme **une seule ligne large**, celle de son
axe, portant ses deux nets. Elle obtient ainsi le contournement sans une ligne
de code de plus. Pour la poussée, en revanche, ce sont les **deux pistes
réelles** qui sont soumises au moteur, éventails compris : près des pastilles
la paire s'ouvre bien au-delà de son pas, et un axe large ne la
représenterait pas.

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

### Le même chanfrein, posé d'office, est borné

Le tracé chanfreine tout seul les coudes qu'il vient de former, au dépôt
(`chamferPosed`). Là, le chanfrein maximal ne convient pas : sur un coude de
45 mm par 16, il remplacerait les **deux** jambes par une seule diagonale de
16 mm, et le coude se retrouverait 16 mm avant l'endroit cliqué. Géométriquement
c'est le tracé qu'aurait posé le routeur d'un seul clic ; à l'usage, c'est un
clic qui disparaît.

Le chanfrein automatique est donc borné à `MITRE_AUTO` largeurs de piste — 4,
soit 1,2 mm sur une piste de 0,3. Il casse l'angle, il ne déplace pas le coude.
Un coude entre deux jambes plus courtes que cette borne y passe toujours en
entier : c'est le petit coude qu'on veut voir disparaître.

La touche **D** garde le chanfrein maximal. Là, c'est un geste voulu : on
demande explicitement la plus grande diagonale que la géométrie autorise.

### Le glissement rend le 45° qu'il avait replié

Tirer une piste raccourcit ses jambes. Passé un certain point, le chanfrein
qu'elles portaient se replie sur son articulation — c'est voulu, `wallChain`
tend la piste comme un fil plutôt que de la laisser revenir sur elle-même. Mais
le coude, lui, redevenait alors **franc** : on voulait raccourcir, on récoltait
un angle droit à reprendre à la main.

Le relâchement le rend (`mitreAfterDrag`), à la même borne que le dépôt, et
**seulement si un chanfrein a réellement été perdu** : les segments en diagonale
du cuivre concerné sont relevés au départ du geste, et si l'un d'eux a disparu à
l'arrivée, les articulations touchées repassent au chanfrein. Un coude déjà
franc avant le geste le reste — un glissement n'est pas le moment de réécrire un
tracé qu'on n'a pas demandé à réécrire.

Au relâchement, et non pendant : le glissement s'applique en absolu depuis les
positions relevées au départ (`drag.trk`, `drag.joints`). Créer ou supprimer du
cuivre en cours de geste détacherait ces références, et la piste cesserait de
suivre la souris. L'angle droit se voit donc le temps du glissement, et se
referme au lâcher. Le `push()` du premier mouvement couvre l'ensemble : le
chanfrein rendu se défait avec le glissement, d'un seul Ctrl+Z.

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

## Paires différentielles

Deux nets qui portent le même signal en opposition — USB, Ethernet, LVDS, CAN —
ne se routent pas l'un après l'autre. Ce qui compte est **ce qui se passe entre
les deux** : un écart tenu au centième sur toute la longueur, parce que c'est le
couple largeur/écart qui fixe l'impédance différentielle, et le peu de trajet où
il ne l'est pas. Router la P puis la N donne deux pistes qui se ressemblent ;
router la paire donne une paire.

L'outil tient dans `js/09-diffpair.js` et le panneau *Paires différentielles*.
Le reste de l'éditeur continue de ne voir que deux nets ordinaires : **une paire
ne crée aucun objet sur la carte**, elle dit seulement comment router ces deux
nets et ce que le contrôle DRC doit y vérifier.

### Déclarer la paire

Trois chemins, du plus explicite au plus rapide :

- **Deux pistes sélectionnées** → *Créer depuis la sélection*. C'est le geste de
  départ : on montre les deux pistes (ou les deux segments amorcés à la main),
  l'éditeur en tire le couple de nets, le nom et, si les noms le disent, lequel
  est P et lequel est N.
- **Détecter** lit tous les noms de net d'un coup. Sont reconnus les suffixes
  `P`/`N`, `+`/`-`, `DP`/`DM`, `DP`/`DN`, `D+`/`D-`, `TP`/`TN`, `RP`/`RN`,
  `HSP`/`HSM`, avec ou sans séparateur (`USB_DP`, `CAN-P`, `TXP`). C'est la
  règle de KiCad, élargie aux notations des bus série. Une paire n'est proposée
  que si **les deux** nets existent : `VCCN` tout seul n'a jamais fait un net
  différentiel.
- **À la main**, en renommant une paire déjà créée.

Le suffixe le plus long est essayé d'abord — sans quoi `USB_DP` se lirait
`USB_D` + `P`, et son complémentaire serait `USB_DN` au lieu de `USB_DM`. La
casse se recopie : `usb_dp` appelle `usb_dm`, pas `usb_DM`.

### La règle : six cotes, trois lignes

Le panneau reprend la disposition des règles de conception des logiciels du
commerce, parce que c'est celle que connaissent ceux qui routent des paires :
un entête qui nomme la règle (nom, commentaire, identifiant), *Objets visés* qui
dit à quoi elle s'applique, *Contraintes* qui aligne les six cotes en trois
lignes — mini, préféré, maxi, pour la largeur comme pour l'écart —, puis le
tableau qui les décline couche par couche. L'habillage, lui, est celui de
l'éditeur : mêmes jetons de couleur, même monospace, mêmes tableaux que
l'empilage physique.

Une **figure** en tête dit lequel des deux chiffres est la largeur et lequel est
l'écart, avec le pas de la paire (largeur + écart) — la cote qui commande
réellement le tracé, puisque c'est de ce pas que l'axe se dédouble.

Plusieurs règles peuvent coexister. **La première qui vise la paire l'emporte** ;
une règle sans portée les vise toutes. C'est la priorité par l'ordre de la
liste, comme les classes de net. Tant qu'aucune règle n'a été écrite, celle
d'usine sert (`DP_FALLBACK`, 0,20 mm de piste et 0,15 mm d'écart) : une carte
sans règle se route quand même, et la **première retouche inscrit la règle dans
le document**, identifiant compris. Le bouton *Paires visées* dit lesquelles la
reçoivent — utile quand une règle plus haut dans la liste passe devant.

*Ces valeurs s'appliquent à toutes les couches* décochée, chaque couche reçoit
ses propres cotes : un microruban extérieur et une triplaque intérieure ne
tiennent pas la même impédance avec la même largeur.

### L'écart d'une paire passe devant l'isolation de classe

Une paire à 0,15 mm sous une classe qui exige 0,25 mm n'est pas une carte en
faute : c'est le principe même de la paire. `clrPair()` le sait — **entre les
deux nets d'une paire, c'est l'écart mini de la règle qui fait loi**, partout
ailleurs c'est la plus exigeante des deux classes. Cette exception unique suffit
à mettre d'accord le routeur (qui refusait d'avancer), le contrôle DRC (qui
condamnait le tracé) et les zones de cuivre (qui l'écartaient à tort).

De même, la largeur d'une piste de paire échappe au minimum de sa classe : c'est
l'impédance qui la décide, et ce sont les bornes de la règle qui la vérifient.

### Le tracé couplé

Touche **P**, ou le bouton *Paire diff.* de la barre. L'algorithme reprend celui
du routeur de KiCad — `pns_diff_pair_placer.cpp`, à la racine du dépôt —, ramené
à ce que cet éditeur sait faire :

1. **Le couple d'ancres** (`FindDpPrimitivePair`). On clique près d'une pastille
   — ou entre les deux —, le routeur va chercher tout seul l'ancre
   complémentaire la plus proche dans l'autre net. Comme chez KiCad, un bout de
   piste ne fait une ancre que s'il est **libre** : repartir du milieu d'une
   piste déjà posée ne relie rien.
2. **La porte** (`DP_GATEWAYS::BuildFromPrimitivePair`). Deux pastilles côte à
   côte n'ont qu'une façon d'ouvrir une paire : sortir **perpendiculairement à
   leur axe**. Prendre le sens de marche du curseur ferait repartir la piste N
   sur la pastille P — deux pistes qui se recouvrent, ce qu'aucun Gerber ne sait
   rendre. La porte est le point d'où la paire est déjà au pas ; les deux jambes
   qui y mènent forment l'**éventail**, deux diagonales de même longueur, si
   bien que les deux pistes restent appariées dès le premier millimètre.
3. **L'axe.** Le trajet se calcule au milieu des deux pistes, avec la géométrie
   45° de l'éditeur (`routeCorner`, donc la règle d'angle en vigueur), puis se
   dédouble de part et d'autre au demi-pas. C'est ce que fait
   `DP_GATEWAYS::FitGateways`, sans son catalogue de portes : décaler l'axe
   suffit tant que le pas de la paire quantifie les décrochements, ce dont
   `minSeg` se charge. Aux coudes, les deux droites décalées se coupent — le
   décalage **à onglet** : l'intérieur du coude se raccourcit, l'extérieur
   s'allonge, et l'écart reste constant. C'est pourquoi le tracé de paire, seul
   de tout l'éditeur, **ne passe pas par le chanfrein automatique du dépôt** :
   reprendre chaque angle une piste à la fois le déferait.
4. **La tête repoussée** (`propagateDpHeadForces`). Le point visé s'écarte des
   obstacles comme s'il portait un via du diamètre de la paire entière, écart
   compris (`gap + 2 × largeur`) : la paire ne se glisse jamais à moitié dans un
   couloir trop étroit.
5. **L'arrivée.** Survoler une pastille d'en face accroche le couple d'arrivée,
   et la paire s'y referme par son propre éventail. Le clic dépose et termine.
   Si les deux pastilles d'arrivée se présentent dans l'ordre inverse — le
   trajet fait demi-tour, et une paire ne change pas de côté sans se croiser —
   l'aperçu passe au rouge et **le dépôt est refusé** : ce serait un
   court-circuit franc, pas un tracé.

Pendant le tracé : `/` ou Espace bascule la posture du coude, `V` pose les deux
vias, `1`-`8` changent de couche (deux vias au passage), Retour arrière recule
d'un coude — vias compris —, Échap ou Entrée dépose ce qui est tracé.

### Les vias en éventail

Deux vias ne tiennent pas au pas des pistes : leur cuivre se toucherait.
`dpViaSpread()` calcule l'écartement qu'il leur faut — diamètre plus isolation
entre les deux nets — et la paire **s'ouvre en éventail juste avant**, une jambe
à 45° de chaque côté, avant de poser les deux vias. De l'autre côté, sur la
nouvelle couche, l'éventail d'entrée la referme tout seul : les ancres sont
écartées, la porte les ramène au pas. C'est l'`EffectiveDiffPairViaGap` de
KiCad, avec sa conséquence géométrique explicite.

La couche d'arrivée peut imposer d'autres cotes : la largeur et l'écart sont
relus dans la règle après chaque changement de couche.

### Longueur découplée, et ce que le DRC en dit

Une paire tenue à son écart est couplée ; partout ailleurs elle ne l'est plus —
dans l'éventail de départ, autour d'un obstacle contourné d'un seul côté, de
part et d'autre d'une paire de vias. C'est cette **longueur découplée** que la
règle borne (500 mil ≈ 12,7 mm par défaut, la valeur usuelle).

`dpCoupling()` la mesure en parcourant la piste P au pas de 0,1 mm et en
regardant, à chaque pas, si la piste N est bien là où elle doit être — écart
entre bords de cuivre compris entre le mini et le maxi de la couche. Rien de
plus fin ne servirait : la mesure sert à décider si un contournement est trop
long, pas à publier un chiffre. Le pas se desserre au-delà de quarante mille
échantillons, pour qu'une carte entière reste analysable.

Le contrôle DRC ajoute donc quatre entrées propres aux paires :

- une piste **hors des bornes de largeur** de sa règle, couche par couche ;
- une **longueur découplée** au-delà de ce que la règle admet ;
- un **écart de longueur** entre les deux pistes au-delà d'un demi-millimètre,
  en remarque : c'est un décalage temporel entre les deux fronts, et le
  corriger demande un serpentin que cet éditeur ne pose pas encore ;
- une paire dont **un net a disparu** de la carte, en remarque également. Une
  paire orpheline n'est pas effacée pour autant : réimporter une netlist
  retouchée ne doit pas défaire des règles écrites à la main.

### Impédance différentielle

L'empilage physique dit déjà tout ce qu'il faut : l'épaisseur qui sépare la
piste de son plan de référence, la constante diélectrique du stratifié et
l'épaisseur du cuivre. `dpStripGeom()` cherche les plans de part et d'autre de
la couche — rôle de plan, ou zone pleine carte, la même vérité que pour le DRC :
le cuivre réellement posé, pas l'intention — et en déduit la géométrie :
**microruban** quand la couche n'a de plan que d'un côté, **triplaque** quand
elle en a des deux.

`dpZdiff()` applique ensuite les formules approchées de l'IPC-2141A. Cocher
*Profil d'impédance* affiche la cible et l'écart ; *Ajuster la largeur* et
*Ajuster l'écart* résolvent par dichotomie (ces formules ne s'inversent pas) et
écrivent la cote dans la règle. Quatre profils sont proposés — D90 (USB 2.0),
D100 (Ethernet, LVDS), D85 (PCIe, USB 3), D120 (CAN, RS-485).

**Ce que cela vaut :** ±10 % au mieux. C'est de quoi partir avec des cotes
plausibles, pas de quoi signer une commande — le fabricant, lui, tranchera au
calcul de champ, et le panneau le dit. Sans plan de référence dans l'empilage,
il le dit aussi plutôt que d'afficher un nombre qui ne veut rien dire.

### Ce que le module ne fait pas

- **Pas de serpentin d'appariement** : l'écart de longueur entre P et N est
  mesuré et signalé, jamais corrigé.
- Une paire ne **traverse pas** du cuivre étranger qui barre tout son passage :
  la poussée déforme un voisin, elle ne le supprime pas. Il faut alors changer
  de couche par un via en éventail. Le trajet est signalé, il ne se pose pas.
- Une paire ne vit que sur **une couche à la fois** ; c'est le via en éventail
  qui la fait passer, pas un tracé simultané sur deux couches.

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

Le Dk de chaque diélectrique, lui, a fini par servir : c'est
`dpStripGeom()`/`dpZdiff()` qui le lisent, pour l'impédance différentielle des
paires (voir *Paires différentielles*). Le Df ne sert toujours à rien ici — il
décrit la matière commandée, et il faudrait un calcul de pertes pour l'exploiter.

`EMPILAGE.txt` reprend tout cela dans l'archive de fabrication : les Gerber ne
portent pas l'empilage, il faut donc l'écrire à côté. Le panneau sait aussi
l'exporter seul.

## Le travail reste dans l'onglet quand on change d'outil

Un routage s'interrompt sans arrêt pour aller relire le schéma ou chercher une
référence. Les boutons *Éditeur schématique*, *Composants* et *Accueil* de
l'entête ne perdent plus la carte : avant de changer de page, `sessAller()`
demande à l'éditeur sa photographie — le document complet (`docObj()`), le
cadrage, la face regardée et l'état « modifié » — et la range dans la session
de l'onglet. Au retour, `sessionPcb()` la relit, la passe par `normDoc()` comme
n'importe quel fichier importé, et le pied de page annonce la reprise.

Trois détails comptent :

- **L'état « modifié » voyage avec le document.** Sans lui, revenir sur la carte
  la ferait passer pour propre, et l'onglet se fermerait sans un mot sur un
  travail jamais enregistré.
- **La garde de sortie se tait, mais seulement pour un changement d'outil.**
  `sessQuitte()` distingue les deux : changer d'outil ne demande rien, fermer
  l'onglet sur une carte modifiée avertit toujours.
- **Le cadrage revient aussi**, sinon chaque aller-retour recadrerait la vue et
  il faudrait rezoomer sur la zone en cours de routage.

La portée est l'onglet, pas la machine : `sessionStorage` survit à la
navigation et à F5, disparaît à la fermeture, et ne se mélange pas d'un onglet
à l'autre. Ce n'est pas un enregistrement : *Enregistrer .json* reste le seul
moyen de garder une carte au-delà de la session. Dans la version un seul
fichier (`dist/`), les autres outils ne sont pas à côté : les boutons de
navigation s'effacent d'eux-mêmes.

## Banc d'essai

```
python3 outils/build-monofichier.py && node test/harness.js
```

Le banc s'appuie sur le DOM minimal partagé (`../commun/test/dom-stub.js`),
exécute `dist/pcb.js` et couvre 238 cas : import de netlist, boîtiers nommés
et empreintes qu'ils posent, chevelu
multicouche, vias, îlots de cuivre, classes de net, édition des pistes,
géométrie du L chanfreiné, posture du coude et règle d'angle (45° / 90° /
libre), non-croisement du cuivre tiré, réglages d'usine,
contour libre, origine utilisateur, saisie au clavier, anti-collision, rôles de
couche, empilage physique et ce qu'il impose au perçage, Gerber, Excellon, archive ZIP, espace de travail (docks,
flottants, persistance), sélection multiple au Ctrl+clic, prise de la piste
entière au Maj+clic et de toutes ses couches au doublé, presse-papier
(copier/coller, contenu invalide, repères refaits), pas de grille, paires
différentielles (détection des couples, tracé couplé et son écart tenu,
éventail de départ, vias écartés, retour arrière, longueur découplée,
impédance et résolution des cotes, priorité des règles), moteur de routage
(enveloppes convexes et leur marge, index spatial confronté au balayage
complet sur une carte tirée au sort, branche et versement, assemblage des
polylignes, trame 45°, contournement d'un et de deux obstacles et choix du
côté le plus court, poussée d'une piste puis en cascade, poussée d'un via avec
le cuivre qui s'y raccroche, repli propre quand rien ne passe, Ctrl+Z et
abandon qui remettent le cuivre poussé en place, optimiseur et ses ancres,
poussée devant une paire différentielle), import
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

- Pas de bibliothèque d'empreintes livrée avec l'éditeur : les empreintes de
  départ sont paramétriques et le nom du boîtier venu du schéma en fixe le
  style et les cotes (`PKG_LIB`). Les languettes de dissipation (DPAK,
  SOT-223), les pastilles thermiques centrales (QFN) et le brochage réel d'un
  BGA — lettres et colonnes — ne sont pas dessinés d'avance ; ils se dessinent
  à la main dans la fenêtre d'empreinte, et s'enregistrent ensuite dans la
  bibliothèque personnelle.
- Une pastille est rectangulaire (coins adoucis ou angles droits), oblongue ou
  ronde, avec sa rotation propre. Pas de forme quelconque : ni pastille en
  polygone, ni plage thermique découpée, ni chanfrein.
- Ni trous non métallisés, ni texte de sérigraphie libre. Une pastille sans net
  fait office de pastille libre, mais elle appartient toujours à une
  empreinte.
- Pas d'arcs : pistes, zones et contour sont faits de segments.
- Le routeur ne reprend pas le `SMART_PADS` de KiCad, qui décale l'entrée d'une
  piste vers le bord d'une grosse pastille. Cet éditeur fait le choix inverse,
  explicitement : l'aimant accroche au **centre** de la pastille. Les deux
  règles ne peuvent pas coexister.
- Le retour arrière du tracé (Retour arrière) recule d'un coude, mais ne remet
  pas en place le cuivre que ce coude avait poussé. Échap ou Ctrl+Z le font,
  eux, en une fois.
- Pas d'auto-routeur : le moteur assiste un geste, il ne route pas une carte
  tout seul. Il n'y a ni recherche de chemin global, ni ordonnancement des
  nets.
- Pas de sauvegarde automatique sur disque. Le travail tient dans l'onglet
  tant qu'il est ouvert (voir plus haut), mais fermer l'onglet sans
  « Enregistrer .json » le perd.
- Le calcul de ligne de transmission se limite à l'impédance différentielle
  des paires, par les formules approchées de l'IPC-2141A (±10 %). Ni impédance
  simple, ni pertes (le Df reste inexploité), ni prise en compte de la gravure
  en trapèze ou du vernis épargne.
- Pas de serpentin d'appariement de longueur : l'écart entre les deux pistes
  d'une paire est mesuré et signalé, jamais corrigé.
- Le contrôle des vias borgnes et enterrés suppose un pressage unique. Un
  empilage à laminage séquentiel est signalé comme tel, mais sa séquence ne se
  décrit pas : il n'y a qu'une liste de diélectriques, pas de sous-ensembles.
