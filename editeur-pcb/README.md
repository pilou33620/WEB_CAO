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
js/06-panels.js          onglets de couches, listes, règles, propriétés
                         (objet seul et groupes de sélection), empilage physique
js/07-app.js             fichiers, câblage des boutons, initialisation
js/08-empreinte.js       fenêtre d'édition d'empreinte, bibliothèque personnelle
js/09-diffpair.js        paires différentielles : règles, tracé couplé, impédance
js/10-pns-geom.js        routeur : enveloppes convexes, polylignes, trame 45°
js/11-pns-node.js        routeur : modèle du monde, index spatial, branches
js/12-pns-walk.js        routeur : contournement d'obstacle
js/13-pns-shove.js       routeur : poussée du cuivre gênant, de proche en proche
js/14-pns-placer.js      routeur : optimiseur du trajet posé
js/15-regles.js          fenêtre des règles : arbre, figures cotées, matrice
                         des natures de cuivre
js/16-profil.js          réglages d'affichage rangés dans le profil de
                         l'utilisateur : grille, vue, contraste, anti-collision
js/17-exemples.js        les deux cartes d'exemple et la fenêtre qui les ouvre
js/18-reperage.js        ce que la recherche et la mesure valent sur une carte :
                         aimant, cibles, cadrage, cross-probing et son phare
js/19-simulation.js      simulation EM : la carte de chaleur d'impédance sur la
                         sélection, et l'empilage / le cuivre d'un net mis au
                         format du solveur MoM, ports compris. C'est aussi lui
                         qui lit la masse coplanaire — nets de référence, un
                         écart par côté, plages d'écart, couture de vias
outils/build-monofichier.py assemble le tout dans dist/
test/harness.js          banc d'essai sans navigateur
```

Ces fichiers viennent du dossier partagé, à la racine du dépôt :

```
../commun/workspace.css  habillage de l'espace de travail
../commun/workspace.js   panneaux détachables, paramétré par WS_CONFIG
../commun/session.css    habillage des boutons de navigation
../commun/session.js     travail conservé en changeant d'outil (session d'onglet)
../commun/profils.css    habillage du bouton d'utilisateur et de son menu
../commun/profils.js     profils : panneaux et réglages par utilisateur,
                         dans profils/<nom>.json
../commun/reperage.css   habillage de la boîte de recherche
../commun/reperage.js    chercher un repère, mesurer une distance — paramétré
                         par l'adaptateur de js/18-reperage.js
../commun/simulation-em.css  habillage du panneau de simulation EM
../commun/simulation-em.js   le panneau lui-même : saisie, envoi au serveur,
                         courbe, exports — paramétré par l'adaptateur de
                         js/19-simulation.js. La visionneuse IPC-2581 charge
                         exactement le même
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
10. `15-regles` — la fenêtre des règles — vient après `07-app` pour la même
   raison, mais `05-tools` l'appelle, lui, depuis `loadDoc()`, et `loadDoc()`
   tourne DÈS LE DÉMARRAGE : c'est ainsi que revient la carte laissée dans
   l'onglet, à la dernière ligne d'`init()`. L'appel est donc gardé
   (`typeof reSync === "function"`), et `RE` — l'état de la fenêtre — est un
   `var` et non un `const` : en version un seul fichier la fonction est
   remontée mais un `const` serait encore dans sa zone morte, et
   `reIsOpen()` doit pouvoir répondre « non » à tout moment de la vie de la
   page, y compris avant que son propre fichier ait été exécuté. Sans cela,
   `loadDoc()` levait, `sessionPcb()` attrapait, et le travail mis de côté
   était déclaré illisible puis effacé à chaque aller-retour entre les outils.
11. `16-profil` lit le profil de l'utilisateur et rétablit ses réglages
   d'affichage : il vient après `07-app` parce qu'il remplace ce qu'`init()`
   vient de poser. Le chemin inverse — les setters de `05-tools` qui notent le
   réglage dans le profil — passe par un `typeof profilNoter === "function"`,
   et le drapeau `PCB_PROFIL_PRET` est un `var` pour la raison exposée au
   point précédent.
12. `17-exemples` construit les cartes d'exemple. Il vient après tout le reste
   parce qu'il s'en sert : `routeCorner` de `05-tools` pour la géométrie 45°,
   `dpOffset` et `dpLeg` de `09-diffpair` pour la paire, `fpGeomFor` et
   `padsWorld` de `01-core` pour les empreintes. Au chargement il ne fait qu'une
   chose, câbler son bouton ; les cartes ne se construisent qu'au clic.
13. `../commun/workspace.js` s'initialise tout seul et appelle `resize()` puis
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
- `01-core` calcule la ligne de transmission d'une piste (`ltLine`) sur la
  géométrie que `dpStripGeom` cherchait pour les paires différentielles : un
  même tracé n'a pas deux géométries selon le panneau qui le regarde.
- `18-reperage` n'est appelé que par l'interface, et n'appelle que ce qui
  existe déjà : `magnet` pour l'aimant, `fpBBox` et `netTable` pour les cibles,
  `selectNetRouting` pour la mise en avant. Il ne connaît rien du comportement
  de la recherche ni de la mesure — c'est `../commun/reperage.js` qui l'a, et
  qui ne connaît rien de la carte.
- `15-regles` ne calcule rien : il montre et il écrit. Chaque cote de ses pages
  vient de là où elle vit — `S.rule`, les classes de net, l'empilage, les règles
  de paire — et y retourne. La seule chose qu'il ait à lui, la matrice des
  natures, vit dans `01-core` avec les classes, parce que c'est le contrôle et
  le routeur qui l'appliquent, pas la fenêtre.

## Exemples de routage

Le bouton **Exemples…** ouvre deux cartes finies. Elles se chargent comme un
fichier ouvert : tout y marche — sélection, DRC, fenêtre des règles, export de
fabrication — et rien n'y est figé. Un exemple ouvert par-dessus un travail en
cours le remplace, et le demande d'abord.

| Carte | Empilage | Ce qu'elle montre |
|---|---|---|
| **Commande 12 V** (50 × 32 mm) | 2 couches, le dos entier en plan de masse | La carte du schéma de démonstration de l'éditeur schématique : régulateur 12 V → 5 V, étage de commande NPN. Aucune piste de masse ne traverse la carte — chaque pastille CMS descend au plan par son via, les pastilles traversantes des borniers y touchent sans rien de plus. Le 12 V du collecteur longe le bord : sur deux couches dont l'une est un plan, on contourne plutôt que de croiser. |
| **Interface USB 2.0** (60 × 40 mm) | 4 couches : signal / masse / 3,3 V / signal | Connecteur micro-B, régulateur 3,3 V, TQFP-32, connecteur SWD. Les alimentations ne se routent plus : deux couches internes entières, et un via par broche pour y descendre. La **paire différentielle USB** est tracée sur le dessus, 0,25 mm de piste et 0,15 mm d'écart tenus d'un bout à l'autre, sans changement de couche — le plan de masse de L2 lui sert de référence sur toute sa longueur. Sa règle de paire (profil D90) est dans la fenêtre *Règles…*. Le bus SWD passe au dos par deux vias. |

Les deux cartes sont **construites en code**, dans `js/17-exemples.js`, et non
rangées en `.json`. Elles suivent donc les cotes réelles des empreintes — les
pistes partent du centre de pastille que rend `padsWorld`, et un boîtier qui
changerait de cotes emmènerait le routage avec lui. La paire différentielle,
elle, est posée par la géométrie de l'outil de tracé couplé : un axe, décalé de
part et d'autre au demi-pas par `dpOffset`, et deux éventails par `dpLeg`. Les
deux pistes en ressortent à la même longueur au micron près.

Le banc d'essai les charge et leur passe le contrôle : **zéro liaison non
routée, zéro remarque au DRC**, aller-retour de document neutre, et pour la
carte à quatre couches, longueur découplée et appariement des deux pistes de la
paire. Un exemple qui ne serait plus conforme casse un essai plutôt que
d'enseigner le contraire de ce qu'il prétend montrer.

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

### La nature d'un via se choisit, la portée suit

`viaBuild()` dit ce qu'une portée **vaut** une fois la carte pressée. Le panneau
*Propriétés* offre l'autre sens : une liste *Type de via* — traversant, borgne
dessus, borgne dessous, enterré — qui **pose** les couches (`viaSetKind`,
`js/01-core.js`). Quatre entrées et non trois : « borgne » ne dit pas de quel
côté, et c'est justement ce qu'on veut désigner d'un geste.

Les deux listes de couches restent la commande fine, pour ce qui ne se nomme
pas — un borgne qui descend de trois couches. La nature choisie garde d'ailleurs
la profondeur en place quand elle a un sens : un borgne dessus qui reste borgne
dessus ne remonte pas à une couche.

L'empilage ferme ce qu'il ne permet pas : deux couches n'offrent que le
traversant, un enterré demande deux couches internes, donc au moins quatre en
tout. Proposer le reste offrirait un choix qui se corrigerait tout seul au
premier clic.

Sous les champs, le panneau donne le verdict de `viaBuild()` en clair — « borgne
dans le prépreg extérieur, au laser », « enterré dans le diélectrique 2, percé
avant pressage » — et prévient quand un seul pressage n'y suffit pas. Un
laminage séquentiel se découvre sinon sur le devis.

La liste vaut pour **toute une sélection** : cinq vias pris au `Ctrl+clic`
passent en borgne dessus d'un seul choix, par le panneau de groupes (voir
[Sélection multiple](#sélection-multiple-et-presse-papier)).

### Un fichier de perçage par portée

Un via borgne ne se perce pas de part en part. L'export écrit donc **un
Excellon par portée** (`drillFile()`, `js/04-fabrication.js`) : les vias sont
groupés par couple `a`-`b`, chaque groupe donne un fichier, et les pastilles
traversées rejoignent le fichier de la portée la plus large. Un seul `.TXT` pour
tous les trous, c'est une quatre couches qui repart percée de bout en bout — un
défaut silencieux, que rien ne rattrape après gravure.

Les couches sont numérotées **à partir de 1** dans le nom, comme chez le
fabricant : `carte-1-4.TXT` traverse une quatre couches, `carte-1-2.TXT`
s'arrête au cuivre 2. Il n'existe pas de couche 0, et un dossier qui en annonce
une se fait retourner au contrôle d'entrée.

Chaque fichier porte sa portée en clair dans son en-tête (`; percage borgne -
L1-L2`), le LISEZ-MOI en donne la légende — nature, portée, nombre de trous et
d'outils — et le master drawing les liste avec la même portée. Celle-ci
**voyage avec le fichier** (`a`, `b`, `kind`) au lieu d'être relue dans son
nom : le nom commence par celui du projet, et « carte 2 » y aurait glissé son
chiffre.

## Les règles de conception, et leurs figures

Les règles vivaient dans deux panneaux du dock : *Règles de tracé* et *Paires
différentielles*. Une colonne de 280 pixels tient les nombres, mais elle ne dit
pas ce que chaque cote mesure. Une isolation de 0,25 mm entre quoi et quoi ? Un
rapport d'aspect de 10 : 1, compté sur quelle épaisseur ? Ces questions se
répondent avec un dessin, et un dessin ne rentre pas dans une colonne.

**Les deux panneaux ont donc disparu du dock.** Le bouton *Règles…* de la barre
d'outils ouvre la fenêtre qui les remplace : l'arbre des contraintes à gauche,
la règle choisie à droite, avec son nom, ce qu'elle vise, une **figure cotée**
et ses champs. Huit familles, dix-sept règles :

| Famille | Règles |
| --- | --- |
| Classes de net | classe de net (nom, piste, isolation, via, perçage) |
| Électrique | isolation, court-circuit, liaison non routée |
| Routage | largeur de piste, angle des pistes, face à un obstacle, écharde de gravure |
| Vias et perçage | style de via, via à via / trou à trou, rapport d'aspect |
| Plans et zones | bras thermique, zone de cuivre |
| Paires différentielles | règle et paires |
| Fabrication | masque et pâte, marge au bord |
| Carte et repères | dimensions et origine |

Le dock ne garde que ce qu'on regarde **en routant** : l'empilage, les
propriétés, les listes.

### Tout ce qui ressemble à un champ s'y modifie

C'est la règle de la fenêtre, et un essai du banc la tient : aucune page ne
porte de champ grisé. Ce qui ne se règle pas — un compte de défauts, une cote
calculée, le nom d'une règle, un seuil venu de l'empilage — se présente en
**valeur lue** : même monospace, même gouttière, mais sans cadre de saisie. On
ne cherche pas à cliquer dans ce qui ne s'écrit pas.

Trois réglages sont nés de cette exigence, parce qu'ils s'affichaient en
lecture seule alors qu'ils avaient de bonnes raisons de se régler :

- **Autoriser deux nets à se toucher** (page *Court-circuit*). Joindre deux
  masses en un point est une pratique ; le contrôle n'a alors pas à la
  condamner quinze fois. La case fait taire cette règle-là, et elle seule.
- **Les deux seuils du rapport d'aspect** (page *Rapport d'aspect*). 8 : 1 et
  10 : 1 sont les usages, pas des vérités : un fabricant qui annonce du 12 : 1
  existe, et une série bon marché peut vouloir se tenir à 6 : 1.
- **Le traitement des vias**, jusque-là réservé au panneau *Empilage physique*,
  se règle aussi depuis *Style de via* et *Masque et pâte* — c'est lui qui
  décide de l'ouverture du masque sur un via.

Le panneau des paires différentielles, lui, n'a pas été réécrit : il s'affiche
entier dans la page *Règle et paires*. `buildDiffPairs()` écrit toujours dans
`#dpair`, et c'est cette page qui fournit désormais l'élément — son
comportement, ses cotes et sa figure n'ont pas bougé d'un micron.

La page *Dimensions et origine* recueille ce que l'ancien panneau portait sans
que ce soient des règles : les dimensions de la carte, l'origine utilisateur, le
repère des fichiers de fabrication et le pas de la grille. Sa figure dessine le
contour à l'échelle, libre ou rectangulaire, avec l'origine posée dessus.

Les figures ne sont pas des illustrations : elles sont dessinées à partir des
valeurs du document, à l'échelle, avec les couleurs de la couche active, et
elles bougent quand on change un champ. C'est ce qui permet de voir qu'on a
écrit 2,5 au lieu de 0,25 avant que le contrôle le dise.

Chaque page porte aussi son **état au dernier contrôle** : le nombre de défauts
qui relèvent de cette règle, pris sur la liste du DRC lui-même. L'arbre en
montre le compte en pastille rouge, et *Contrôler maintenant* relance le
contrôle sans quitter la fenêtre. Les motifs de reconnaissance ne se recouvrent
pas : un défaut est compté par une règle et une seule — un essai du banc le
vérifie sur un document fautif.

Aucune de ces règles n'est nouvelle : la fenêtre montre et écrit les cotes que
le contrôle applique déjà, prises là où elles vivent (`S.rule`, les classes de
net, l'empilage, les règles de paire). Trois règles ne produisent aucun défaut
parce qu'elles règlent un geste et non un dessin — l'angle imposé, la conduite
face à un obstacle, le bras thermique : leur page le dit en clair plutôt que de
laisser croire à un contrôle réussi.

### Deux vias voisins : le cuivre d'abord, le foret ensuite

La page *Via à via, trou à trou* porte deux contraintes, et deux physiques.

Le **cuivre à cuivre** sépare deux nets : il se mesure de rondelle à rondelle,
c'est la case *Via ↔ Via* de la matrice — éditable depuis cette page, sans avoir
à revenir à l'isolation —, et il s'annule entre deux vias du même net, du cuivre
déjà relié n'ayant rien à isoler.

Le **trou à trou** est ce que réclame le foret, et lui ne sait pas ce qu'est un
net : deux trous trop voisins, c'est une paroi qui casse au perçage ; deux trous
qui se recouvrent, c'est un seul trou déchiré, que le fichier de perçage rend
illisible. Cette règle vaut donc aussi entre deux vias d'un même net, là où le
cuivre se tait.

Entre deux vias, **c'est presque toujours le cuivre qui décide** : une rondelle
de 0,8 mm percée à 0,4 mm porte 0,2 mm de couronne de chaque côté, si bien que
le cuivre se rencontre 0,4 mm avant les trous. La figure place donc les deux
vias à l'écart que la règle *contraignante* impose, et cote les deux — celle qui
décide en jaune, celle qui a du mou en pointillé gris, avec l'écart d'axe en axe
qui en résulte. Elle ne dessine jamais deux rondelles qui se recouvrent, ce qui
serait un court-circuit franc et non une carte conforme.

### La matrice des natures de cuivre

Une seule chose s'ajoute au modèle, et c'est ce que la page *Isolation* porte
sous sa figure : un tableau à double entrée entre les six natures de cuivre —
**piste, pastille CMS, pastille traversante, via, cuivre plein, trou**.

Une classe de net dit ce qu'un net exige de tout le monde. Elle ne sait pas
dire qu'un via demande plus de place qu'une piste, ni qu'une pastille CMS
supporte d'être serrée là où une traversante ne le supporte pas — et c'est
pourtant ainsi que les fabricants écrivent leurs règles. La matrice comble ce
manque, et rien de plus :

- chaque case est un **minimum qui s'ajoute** à la classe, jamais un
  remplacement ; l'isolation retenue est la plus exigeante des deux classes en
  présence **et** de la case ;
- une case vide — l'état d'usine, et celui de tous les documents écrits avant
  elle — laisse la classe seule maîtresse : le contrôle rend exactement ce
  qu'il rendait ;
- la case **trou/trou** *est* la règle de trou à trou (`S.rule.hole`) : elle se
  lit et s'écrit là où elle a toujours vécu. Le reste de la ligne « trou »
  n'existe pas, un perçage n'ayant d'isolation qu'avec un autre perçage ;
- les deux nets d'une **paire différentielle** échappent à la matrice comme ils
  échappaient déjà aux classes : leur écart est celui de la règle de paire.
  Sans cette exception, une case piste/piste relevée condamnerait toutes les
  paires par la porte de derrière.

La case choisie est celle que la figure dessine : cliquer *Via ↔ Pastille TH*
montre un via et une pastille percée face à face, avec l'écart coté entre eux.
Un tableau de vingt nombres redevient lisible.

Le contrôle et le routeur appliquent la même cote, au même endroit : `clrK` dans
`01-core`, appelée par `pnsClrPair` (l'index spatial de `11-pns-node`), par le
masque de zone de `02-connectivity`, par l'aperçu de `03-render` et par le
Gerber de `04-fabrication`. Un via que le routeur refuse de poser est un via que
le contrôle aurait signalé, et le message dit les deux cotes — celle qu'on a et
celle que la règle exige.

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

**Le panneau Propriétés d'une sélection multiple.** Ce qui est pris se range par
familles — empreintes, segments, vias, zones, découpes — et, dans chaque
famille, par **cotes identiques** (`MP_KINDS`, `js/06-panels.js`). Cinq vias
dont trois partagent diamètre, perçage, portée et net donnent trois lignes :
« ×3 · Ø 0.80 · perçage 0.40 », puis les deux isolés. La ligne choisie ouvre ses
champs sous le tableau, et le champ commande le **groupe entier** : les trois
vias changent de diamètre en une saisie, et un seul `Ctrl+Z` les rend — un
`push()` pour tout le groupe, pas un par objet.

La ligne « tous » vient en tête dès qu'il y a plus d'un groupe : elle vise la
sélection entière, et les propriétés qui diffèrent d'un objet à l'autre y
portent « mixte ». Un champ resté sur « mixte » n'écrit rien — sans quoi ouvrir
le panneau alignerait la sélection sur le premier objet venu. C'est ce qui
permet de ne changer *que* le diamètre d'une sélection qui diffère aussi par le
net et par les couches.

Le groupe ouvert est retenu par **l'objet qui l'ancre** et non par son rang :
changer un diamètre refait les groupes, et la ligne qu'on avait ouverte doit
rester ouverte sous la souris. Les cotes impossibles sont bornées à
l'application, comme sur un objet seul : un perçage ne dépasse pas sa pastille,
un via garde deux couches distinctes.

Deux propriétés restent hors du lot : le **repère** d'une empreinte et sa
**position**. Deux boîtiers ne partagent ni l'un ni l'autre, et les empiler au
même X serait la seule chose que le champ saurait faire. Une empreinte dessinée
à la main dans la sélection grise les cotes génériques, comme dans son panneau
seul.

Une piste prise entière (`Maj+clic`, `Maj+double-clic`) garde son propre
panneau — impédance, retard, tronçons — et gagne le même tableau pour ses vias
de passage. Une découpe seule, qui n'affichait rien, a maintenant sa couche.

**Prendre un plan de cuivre.** Une zone s'attrape par son contour — mais un
plan de masse ou d'alimentation couvre toute la carte : son contour se confond
avec celui de la carte et n'offre rien à viser. Trois prises s'y ajoutent, dans
`hitTest` et autour :

- **Un clic dans son cuivre.** `hitTest` rend la zone dont le plein contient le
  point, mais en **dernier ressort** — après les pistes, les empreintes, les
  vias, les contours de zone et de carte — et marquée `inside`. Ce drapeau dit à
  l'appelant de ne pas trancher tout de suite : le geste part en lasso, et c'est
  le relâchement qui décide. Lasso resté fermé, c'était un clic : la zone est
  prise. Lasso ouvert, c'est un lasso — sans quoi on ne pourrait plus en tirer
  un seul au-dessus d'un plan. Une zone déjà prise, elle, se glisse directement
  depuis son plein, comme n'importe quel autre objet.
- **Le lasso.** Zones et découpes entrent dans la sélection rectangulaire au
  même titre que le reste, dès que leur emprise y tient entière. `Ctrl+A` les
  prend aussi.
- **Le pastillon de la couche.** Dans la liste des calques, le repère `PLAN`
  (ou le compte de zones) est un bouton : il sélectionne tout le cuivre plein de
  sa couche, la rend visible et la rend active (`selectLayerZones`). Le menu
  *Zone cuivre* offre le même geste pour la couche active. C'est la prise sûre,
  celle qui ne dépend d'aucune visée.

La gomme, elle, ignore les prises par le plein : un clic destiné à une piste
emporterait sinon le cuivre de toute la couche. Son contour reste une cible
franche.

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

- **Deux listes de nets**, *Net P* et *Net N*, puis *Créer la paire*. C'est le
  geste de départ, et le seul qui marche avant qu'une seule piste soit tirée :
  la paire se déclare sur la netlist, pas sur du cuivre. C'est aussi le seul où
  **la polarité est choisie** — la liste où atterrit un net décide, les suffixes
  des noms ne servent plus qu'à nommer la paire. Un net déjà apparié y reste
  visible mais grisé, suivi du nom de sa paire : le voir disparaître ne dirait
  pas pourquoi. Et quand le net P se lit comme un côté P (`USB_DP`), la liste N
  vide se remplit toute seule de son complémentaire — une proposition, pas une
  contrainte. Dans l'autre sens rien n'est proposé : retourner la polarité
  derrière le dos de qui vient de la désigner serait pire que de se taire.
- **Détecter** lit tous les noms de net d'un coup. Sont reconnus les suffixes
  `P`/`N`, `+`/`-`, `DP`/`DM`, `DP`/`DN`, `D+`/`D-`, `TP`/`TN`, `RP`/`RN`,
  `HSP`/`HSM`, avec ou sans séparateur (`USB_DP`, `CAN-P`, `TXP`). C'est la
  règle de KiCad, élargie aux notations des bus série. Une paire n'est proposée
  que si **les deux** nets existent : `VCCN` tout seul n'a jamais fait un net
  différentiel.
- **À la main**, en renommant une paire déjà créée.

`dpMakePair(p, n, keepOrder)` est le passage obligé des trois : deux nets
distincts, aucun des deux déjà apparié, et un nom tiré de la base commune.
`keepOrder` dit si l'appelant a déjà tranché la polarité — les deux listes le
savent, `dpFromSel()` (deux pistes sélectionnées, resté accessible pour le cas
où l'on vient de tirer deux amorces sans se rappeler leurs noms) s'en remet aux
suffixes, et faute de suffixe lisible à l'ordre d'arrivée.

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

## Ce qu'une piste sélectionnée vaut électriquement

Sélectionner du cuivre routé ouvre, en bas du panneau *Propriétés*, une section
**Ligne de transmission**. Elle paraît dans les trois cas où la sélection est
une piste : un segment seul, la piste entière prise au `Maj+clic`, la piste
entière sur toutes les couches prise au `Maj+double-clic` — vias de passage
compris.

Une piste n'est pas un fil : c'est une ligne, et l'empilage physique dit déjà
tout ce qu'il faut pour la calculer. `dpStripGeom()` (`js/01-core.js`) cherchait
déjà les plans de référence pour les paires différentielles ; le calcul s'en
sert tel quel, ce qui garantit qu'un même tracé n'a pas deux géométries selon le
panneau qui le regarde. **Microruban** quand la couche n'a de plan que d'un
côté, **triplaque** quand elle en a des deux ; un plan est soit un rôle de
couche, soit une zone pleine carte réellement posée — la même vérité que pour le
DRC.

### Les cinq grandeurs, et d'où elles sortent

| Grandeur | Formule | Fonction |
| --- | --- | --- |
| ε<sub>r</sub> effective | Hammerstad : (ε<sub>r</sub>+1)/2 + (ε<sub>r</sub>−1)/2 · (1+12h/w)<sup>−1/2</sup> | `ltEeff` |
| Z₀ microruban | Wheeler, deux branches selon w/h | `ltZ0` |
| Z₀ triplaque | IPC-2141A, comme `dpZ0` | `ltZ0` |
| Retard t<sub>pd</sub> | L·√ε<sub>eff</sub> / c | `ltSeg` |
| C et L | C = t<sub>pd</sub>/Z₀, L = t<sub>pd</sub>·Z₀ | `ltSeg` |

Le microruban a de l'air d'un côté : il voit une moyenne entre l'air et le
stratifié, et d'autant plus de stratifié que la piste est large devant la
hauteur du diélectrique. La triplaque, noyée, ne voit que le stratifié —
ε<sub>eff</sub> y vaut ε<sub>r</sub>, et le retard y est plus long qu'en surface
à longueur égale. Wheeler tient en deux branches parce qu'aucune des deux
expressions ne suit la courbe sur toute sa longueur ; elles se raccordent à
0,4 % près en w = h, ce que le banc d'essai vérifie.

Tout est calculé en millimètres et en secondes — la vitesse de la lumière avec,
en mm/s. Les retards sortent alors en secondes, les capacités en farads et les
inductances en henrys sans facteur caché en chemin ; c'est le panneau qui les
remet en picosecondes et en picofarads.

**C'est du JavaScript et cela reste dans le navigateur.** Quelques dizaines de
multiplications par segment : la section se recalcule à chaque changement de
sélection sans qu'on y pense, là où un calcul de champ 2D demanderait un
aller-retour au serveur pour gagner quelques pour cent sur des formules déjà
à ±5 %.

### Une piste change de largeur et de couche en route

L'impédance ne se somme pas. Le retard, la capacité et l'inductance, si.
`ltLine()` calcule donc chaque segment seul, somme ce qui se somme, et regroupe
les segments par **tronçon** — même couche, même largeur. Un coude à 45° en
compte trois et n'en fait qu'un : rien n'y change électriquement.

Dès qu'il y a plus d'un tronçon, la section affiche l'étendue de Z₀ plutôt qu'un
nombre unique, l'**équivalente √(L/C)** — ce que voit un front qui parcourt la
ligne entière —, et le tableau des tronçons du plus long au plus court. C'est à
chacune de ces frontières qu'une part du front repart en arrière, et le panneau
le dit.

### Les vias comptent

Un via n'est pas un fil non plus : c'est un tube inductif, et une pastille qui
regarde les plans à travers leur dégagement. `ltVia()` applique les formules de
Johnson sur la géométrie réellement en place — longueur percée tirée de
`stackSpan()`, donc plus courte pour un via borgne, diamètre de perçage,
pastille, et dégagement déduit de l'isolation de classe du net. Sur un
traversant de 1,6 mm percé à 0,4 mm cela donne de l'ordre de 1,2 nH et 0,6 pF,
ce qui est bien l'ordre de grandeur attendu.

Ce que le `Maj+double-clic` a pris entre dans le total : la self, la capacité et
le retard de traversée des vias s'ajoutent à ceux du cuivre, et le détail se lit
sur ses deux lignes. Sélectionner un via seul donne les deux mêmes valeurs, à
côté de son rapport d'aspect.

### Ce que cela vaut

**±5 % au mieux.** Wheeler ne tient pas compte de l'épaisseur du cuivre,
contrairement à la forme IPC que `dpZ0()` applique au microruban : sur du FR-4
courant les deux s'écartent de quelques pour cent, la première lisant un peu
plus haut. La triplaque est supposée symétrique. La capacité d'un via
traversant est un majorant — elle est calculée sur la longueur percée entière,
comme si le tube croisait des plans partout.

C'est de quoi dégrossir un tracé, pas de quoi signer une commande : le
fabricant, lui, tranchera au calcul de champ, et la section le dit. Sans plan de
référence dans l'empilage sous la couche, elle le dit aussi — les cotes sont
alors prises sur le diélectrique voisin, et une impédance à laquelle aucun plan
ne répond ne veut rien dire.

## Le panneau « Simulation EM » : l'impédance, peinte sur la piste

La section précédente dégrossit — une formule fermée, une piste, un plan. Le
panneau **« Simulation EM »**, ouvert par le bouton du même nom dans la barre
d'outils, fait l'autre calcul : la **section droite** de chaque tronçon
sélectionné part au solveur `python/ligne_mom.py`, qui la résout
par méthode des moments et rend son impédance caractéristique. La carte se
colore, et la valeur s'écrit dessus.

```bash
pip install numpy scipy
```

Le solveur est en Python et en numpy : le navigateur ne peut pas l'exécuter, et
c'est la seule raison pour laquelle cette fonction passe par le serveur —
exactement comme la lecture d'un IPC-2581. Le panneau, lui, est commun aux deux
outils (`../commun/simulation-em.js`) ; seul l'adaptateur `js/19-simulation.js`
est d'ici.

### Les trois gestes commandent l'étendue du calcul

Ils sont ceux qu'on connaît déjà — ce fichier ne lit que `S.sel.tracks`, il les
suit sans les connaître :

| Geste | Ce qui est calculé et peint |
| --- | --- |
| Clic | le tronçon cliqué, seul |
| `Maj`+clic | la piste entière, sur sa couche |
| `Maj`+clic à nouveau | la piste sur toutes les couches, vias de passage compris |

La case **« suivre »** s'arme au premier calcul réussi : à partir de là,
changer de sélection relance tout seul, après un court repos — déplacer la
sélection à la souris déclenche des dizaines de rafraîchissements, et on
n'envoie pas dix requêtes pour un geste. Avant ce premier calcul, non : on ne
lance pas de requête réseau dans le dos de quelqu'un qui n'a rien demandé.

### La carte de chaleur

On saisit une **cible**, une **tolérance** (en pourcentage, redite en ohms à
côté du champ) et une **fréquence centrale** — c'est à celle-ci que
l'impédance est donnée et la carte peinte. Puis :

- **bleu** — dans la tolérance ;
- **rouge** — trop élevé : piste trop étroite, ou trop loin de son plan ;
- **vert** — trop faible : piste trop large, ou trop près de son plan.

**Le vert ne veut pas dire « bon »** mais « trop bas ». C'est contraire à
l'habitude et c'est assumé : sur une carte de chaleur ce sont les deux *sens*
de l'écart qu'il faut distinguer d'un coup d'œil. La légende du panneau le
redit en toutes lettres.

La clarté porte l'écart — pâle au bord de la bande, pleine une tolérance plus
loin. La teinte, elle, ne bouge pas : une piste hors bande est rouge, plus ou
moins soutenu, jamais autre chose. Interpoler depuis le bleu, comme on l'a
d'abord fait, donnait du mauve d'un côté et du turquoise de l'autre.

Changer la cible ou la tolérance **ne relance pas le calcul** : elles ne
changent pas l'impédance, seulement la bande dans laquelle on la juge — la
carte se repeint donc au fil de la frappe, sans toucher au serveur. Changer la
fréquence, si : le résultat affiché ne lui correspond plus, et le panneau le
dit au lieu de laisser croire.

Le halo coloré est **plus large que le halo de sélection** — lequel fait déjà
`w + 3,4 px` en cyan (`drawTracks`, `js/03-render.js`). C'est délibéré, et
c'était le défaut de la première version : peinte à la seule largeur du
cuivre, la teinte tombait *à l'intérieur* du halo cyan et ne se voyait pas.
Elle l'encadre désormais, et le cyan reste lisible entre les deux — on
continue de voir ce qui est pris.

La valeur s'écrit dans un cartouche sombre bordé de la couleur du verdict,
**une étiquette par impédance distincte**, posée au milieu du plus long
tronçon qui la porte : une piste de cinquante segments de même largeur a une
seule impédance, et cinquante fois « 48,0 Ω » empilés ne se liraient pas. Le
texte est tracé en pixels écran et ne grossit donc pas avec le zoom.

La carte de chaleur est **absente du `.png` exporté**, comme la cote de mesure
et le phare du cross-probing : ni l'une ni l'autre ne décrivent la carte.

### Ce qui part, et ce qui revient

| Ce que le solveur reçoit | D'où ça vient |
| --- | --- |
| L'empilage entier, cuivre et diélectriques alternés | `S.stack` — `cuT()`, `diAt()` |
| Le rôle de chaque cuivre (signal ou plan) | `layerRole()`, la même vérité que pour le DRC |
| Les tronçons sélectionnés, découpés par plage d'écart au plan | `S.sel.tracks`, `simPlages()` |
| La longueur de CUIVRE de chaque tronçon | `trkLen()`, au prorata de la plage — mesurer la corde raccourcirait un demi-tour d'un tiers |
| **L'écart au cuivre de masse, un par côté** | `clrK()` pour la valeur, une sonde par côté pour savoir laquelle s'applique |
| **Les nets tenus pour de la masse** | les pastilles « Masse » du panneau, proposées d'après `layerRole()` et le nom des nets de zone |
| La cible, la tolérance, la fréquence, la bande | Ce qui est saisi dans le panneau |

C'est le serveur qui cherche les plans de référence dans l'empilage
(`section_de_couche`, `../python/simulation_em.py`), avec la même règle que
`dpStripGeom()` ici : le premier conducteur de rôle « plan » au-dessus et en
dessous. Un empilage 4 couches dissymétrique est traité **tel quel**, ruban là
où il est — c'est justement ce que la formule IPC de la section précédente ne
sait pas faire, elle qui suppose le ruban centré.

En retour : l'impédance de chaque tronçon, sa permittivité effective, son
retard et ses pertes ; le bilan de la liaison (minimum, maximum, moyenne
pondérée par la longueur) ; et les **paramètres S** de l'ensemble, obtenus en
mettant les matrices ABCD des tronçons bout à bout — un rétrécissement au
milieu d'une piste s'y lit comme une remontée de S₁₁, ce qui est bien ce qu'un
rétrécissement fait. Trois exports : `.csv`, `.s2p` et `.json`.

### L'unité des fréquences se choisit dans une liste

Les trois champs de fréquence — `f₀`, début et fin de bande — partagent une
**liste déroulante** Hz / kHz / MHz / GHz. Elle n'existe pas par confort :
écrire `868` dans un champ étiqueté GHz est une faute qui ne se voit pas. Elle
ne produit ni refus ni champ vide, seulement une bande trois cents fois trop
haute que le serveur ramène au bord de la sienne — avec des **pertes fausses
d'un facteur trois** et le repère `f₀` posé ailleurs qu'où on le croit sur la
courbe S. L'impédance et le retard, eux, restent justes : ils ne dépendent
presque pas de la fréquence.

Deux règles, et ce sont elles qui font le travail :

- **changer d'unité convertit, ça ne réinterprète pas.** `868` en MHz devient
  `0,868` en GHz, jamais `868` GHz. La valeur physique ne bouge pas, donc aucun
  résultat déjà calculé n'est effacé au passage — on peut choisir son unité
  après avoir tapé ;
- **une seule liste pour les trois champs.** Trois listes séparées
  permettraient d'écrire la bande en mégahertz et sa fréquence centrale en
  gigahertz, ce qui est exactement l'erreur qu'on cherche à rendre impossible.

Et si `f₀` tombe malgré tout hors de la bande, le panneau le dit **pendant la
saisie**. Le serveur le signalait déjà, mais dans les avertissements du
résultat : après coup, sous un chiffre déjà lu.

### La section résolue est écrite sous la fiche

Une ligne, avant les notes, qui dit sur QUOI l'impédance a été obtenue :

```
Section Conductor-4 — microruban : plan Conductor-3, h 0,380 mm, εr 4,44,
tan δ 0,0200, cuivre 35 µm, piste 0,520 mm → ε_eff 3,080.
Cuivre, h, εr du fichier ; tan δ supposé, à saisir dans « La carte ».
Le masque de soudure n'est pas dans l'empilage : sur une couche extérieure
il fait baisser Z₀ de deux à trois pour cent, non comptés ici.
```

Elle n'y était pas, et c'était le trou : la fiche montrait un chiffre sans
montrer ses entrées. Or **c'est là que se trouve la cause** quand le calcul ne
tombe pas sur la carte réelle — le solveur, lui, est vérifié à 0,25 % contre la
transformation conforme. Retrouver la hauteur au plan demandait d'inverser le
résultat.

Une ligne **par section distincte**, pas par tronçon : une piste découpée en
trois plages d'écart a la même section verticale, seuls ses bords changent. La
provenance de chaque cote vient de l'outil, pas du serveur — lui seul sait si
une épaisseur a été lue, saisie ou remplacée par un repli. Les mêmes colonnes
sont dans le `.csv` : `plan_reference`, `h_mm`, `er`, `tan_delta`, `cuivre_mm`,
`couverture_mm`.

### Les deux ports se déduisent, et ils se nomment

Personne ne place de port, et c'est voulu : le modèle est une **chaîne** de
lignes uniformes, elle a exactement deux bouts, il n'y a rien à choisir. Le
port 1 est le départ du premier tronçon envoyé, le port 2 l'arrivée du
dernier, tous deux ramenés à l'impédance du champ *« Réf. »*.

La fiche les **nomme** quand l'outil sait ce qu'il y a là :

```
Ports déduits, non placés : 1 au départ du premier tronçon, sur la pastille
J1.1 (12,40 ; 8,15), 2 à l'arrivée du dernier, sur la pastille U3.7
(23,09 ; 8,15), tous deux sur 50 Ω.
```

Les coordonnées restent — elles départagent deux pastilles du même repère —
mais elles ne sont plus la seule chose écrite : *« port 1 sur J1.1 »* se
vérifie sans quitter la fiche, un couple de nombres oblige à aller regarder la
carte, et c'est cette vérification-là qu'on saute. L'adaptateur répond par
`bout(pt, obj)` ; celui qui ne sait pas répondre rend une chaîne vide, et on
retombe sur les coordonnées seules. On ne prend que la pastille **la plus
proche**, et rien du tout au-delà de son rayon : un nom faux serait pire qu'une
coordonnée nue.

Nommer la pastille et dire qu'elle n'est pas modélisée n'est pas une
contradiction, c'est le point entier — **le port est posé là où elle est, et
son cuivre à elle ne compte pas**. Ni pastille, ni via, ni connecteur, ni
longueur d'accès à retrancher : S₁₁ est la réflexion du cuivre nu, et il est
donc nécessairement meilleur qu'une mesure au VNA sur la vraie carte.

### La masse coplanaire : trois questions, et qui y répond

Une piste noyée dans un plan arrosé n'est pas un microruban. Le cuivre qui la
borde **sur sa propre couche** lui prend une part de son champ et fait tomber
son impédance de vingt pour cent et davantage — c'est le cas ordinaire d'un
tracé RF. Le calcul le traite, mais il a besoin de trois réponses que le cuivre
ne donne pas seul.

**Quel cuivre est de la masse ?** La barre **« Masse »**, en tête du panneau,
porte une pastille par net candidat ; celles qui sont allumées comptent comme
plan de retour. Sont proposées d'office les nets d'une couche de rôle *masse*,
*alimentation* ou *blindage*, et tout net dont le NOM est celui d'une masse —
un arrosage `GND` sur une couche de signal est le cas ordinaire, et le rôle de
la couche ne le dit pas. Les autres nets arrosés sont là, éteints : une
alimentation qu'on n'a pas déclarée en plan est peut-être une masse RF, mais
c'est un choix, pas une évidence.

Décocher une pastille efface le résultat affiché et le dit : l'hypothèse a
changé, donc l'impédance. Le choix tient jusqu'à l'ouverture d'une autre carte ;
*« revenir à la proposition »* le rend à l'outil. Et le cuivre écarté n'est pas
tu : un net non-référence qui longe la piste ressort en note de couplage, avec
son écart et la longueur sur laquelle il la longe. Il n'entre pas dans Z₀ — ce
n'est pas un plan de retour — mais le modèle de ligne ne voit pas le couplage,
et le taire remplacerait une erreur par un silence.

**De quel côté, et sur quelle longueur ?** Chaque côté est sondé
**séparément**, tout le long du parcours. Une piste qui longe une découpe d'un
côté et du plan serré de l'autre part donc avec un écart d'un côté et rien de
l'autre, ce qui est ce qu'elle est : la calculer symétrique faisait tomber Z₀ de
plusieurs ohms. Le tableau des tronçons écrit *« coplanaire, un seul côté »*
quand c'est le cas, et les deux écarts quand ils diffèrent.

Et l'écart n'est plus une valeur pour toute la piste : elle est **découpée en
plages d'écart constant** — deux échantillons vont ensemble si leurs deux côtés
s'accordent à dix pour cent près —, chaque plage devenant un tronçon avec sa
propre impédance et sa propre couleur sur la carte. Une plage de moins d'un demi
millimètre n'est pas une section mais une discontinuité, que le modèle de ligne
ne sait pas traiter : elle rejoint sa voisine.

La valeur, elle, ne se mesure pas — c'est le luxe de l'éditeur. Le plan est
creusé autour du cuivre à `clrK(net du plan, net de la piste, "cu", "trk")`,
celle-là même que le Gerber applique. La sonde ne sert qu'à savoir QUELLE zone
borde ce côté-là, découpes comprises : `zoneAt()` ne connaît pas les découpes,
et une piste qui longe une découpe trouvait du plan là où il n'y a rien.

**Ce cuivre latéral est-il vraiment à la masse ?** Le solveur le tient à zéro
volt ; sur une carte, il ne l'est qu'autant que des vias le ramènent au plan
d'en face. Le panneau mesure le **plus grand espacement entre deux coutures
consécutives**, par côté, dans un couloir de 2 mm depuis le bord du cuivre, et
le compare à λ/20 et λ/10 dans le stratifié **en haut de la bande analysée** —
c'est là que le risque est le plus fort, pas à f₀ :

| Espacement | Ce que dit le panneau |
| --- | --- |
| ≤ λ/20 | couture serrée : l'hypothèse coplanaire tient |
| λ/20 … λ/10 | couture limite : la marge est mince, resserrez si la bande monte |
| > λ/10 | couture trop lâche : le cuivre latéral peut résonner au lieu de servir de masse |
| aucun via | dit en toutes lettres : rien ne ramène ce cuivre au plan d'en face |

Ce n'est pas une modélisation — il faudrait l'onde complète — mais un contrôle.
Ses limites sont dans `A-FAIRE.md`, section *« Ce que la masse coplanaire
suppose »* : un via borgne qui n'atteint pas le plan compte quand même, et le
couloir de 2 mm est fixe plutôt que déduit de la hauteur au plan.

### Ce que ça vaut

Ce n'est pas une formule de plus : c'est un calcul de champ sur la section, qui
converge quand on raffine. Il est vérifié contre des étalons extérieurs, et le
banc d'essai le refait à chaque exécution
(`../python/test/banc-ligne-mom.py`, 43 cas) :

| Géométrie | Étalon | Écart maximal |
| --- | --- | --- |
| Microruban, εr de 2,2 à 10,2, w/h de 0,5 à 5 | Hammerstad-Jensen (±1 %) | **0,42 %** |
| Triplaque, εr 3,5 et 4,5, w/b de 0,3 à 2,5 | solution exacte, intégrales elliptiques | **0,30 %** |

Ce qu'il ne voit pas, et le panneau le dit sous chaque résultat :

- **une suite de sections uniformes**, rien d'autre. Les coudes, les moignons,
  les transitions de via et le rayonnement n'y sont pas — ce qui se passe *au
  raccord* entre deux tronçons n'est pas modélisé ;
- le calcul est **quasi-statique** ; la dispersion vient du modèle de
  Getsinger, qui est un modèle et non un calcul ;
- le **masque de soudure** n'est pas dans l'empilage envoyé. L'ajouter en tête
  décalerait tous les indices de couche (`simCuIndex`) pour un effet marginal
  sur un microruban : à faire d'un coup, pas à moitié ;
- le **rouge de la carte de chaleur est celui des marqueurs DRC**. Les formes
  diffèrent — un trait le long de la piste contre des croix —, mais sur une
  carte qui affiche des erreurs DRC, mieux vaut le savoir.

La 2,5D pleine onde — `mom_engine.py`, `green_layered.py` — **n'est pas dans le
chemin de calcul** et ne doit pas y revenir en l'état : sa formulation EFIE a
perdu tout son terme de potentiel scalaire, celui qui porte les charges. C'est
écrit en tête du fichier et détaillé dans [../A-FAIRE.md](../A-FAIRE.md).

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

## Les pistes circulaires

Une antenne NFC ronde, une boucle d'accord, un congé au lieu d'un angle : tout
cela est du cuivre courbe, et un éditeur qui ne sait poser que des segments le
redresse ou l'ignore. `S.tracks` range désormais les deux.

Une piste courbe est **une piste comme les autres**, avec un champ de plus :
`ca`, l'**angle balayé** entre ses deux bouts, en radians, signé. Absent ou nul,
la piste est droite et rien ne change — un document sans arc ressort au
caractère près comme avant, et l'essai d'aller-retour de `normDoc()` le vérifie.

**Pourquoi l'angle et non un centre.** Un centre et un rayon enregistrés à côté
auraient dérivé au premier sommet déplacé : l'arc ne serait plus passé par ses
propres bouts, et le cuivre aurait quitté ce qu'il relie. Avec l'angle balayé,
les bouts restent les bouts. La connectivité les compare au micron, un coude
tiré à la souris les réécrit, le `.json` les relit — aucun de ces codes n'a à
savoir que la piste est courbe. Le centre, le rayon et les deux angles se
déduisent de la corde à la demande (`arcOf`).

Le signe suit le sens des angles du canevas, où l'axe Y descend : **positif,
l'arc tourne dans le sens des aiguilles d'une montre à l'écran**. Un tour
complet n'a pas de corde — deux bouts confondus ne sont plus une piste — :
`normTrack()` borne l'angle juste en deçà, et une boucle fermée s'écrit en deux
demi-tours, comme une spirale d'antenne s'écrit en une suite de demi-cercles.

**Une seule famille de fonctions**, dans `01-core`, et une piste droite y
retombe toujours sur le calcul d'avant :

| | |
|---|---|
| `isArc` / `arcOf` | la piste est-elle courbe ; son centre, son rayon, ses angles |
| `trkLen` | la longueur du **cuivre** — le rayon fois l'angle, pas la corde |
| `trkAt` / `trkMid` | un point du parcours ; le milieu, pris sur l'axe |
| `trkDist` | la distance d'un point à l'axe, hors du balayage comprise |
| `trkBBox` | la boîte de l'axe, **ventre de l'arc compris** |
| `trkSegs` | l'arc en cordes, pour ce qui ne sait mesurer que des segments |
| `trkPath` | l'axe posé dans un chemin de canevas |

Ce que chaque passage en fait :

- **Le rendu** (`03-render`) trace l'arc avec `trkPath` : un `arc()` de canevas,
  pas un escalier. Le dégagement d'une zone de cuivre suit la même courbe — le
  plan se creuse le long de l'arc, à l'isolation de la classe.
- **La connectivité** (`02-connectivity`) indexe la piste sur `trkBBox` — sans le
  ventre, l'arc aurait été rangé dans des cases qu'il ne traverse pas — et juge
  les jonctions en T sur `trkDist`. Une piste qui rejoint le ventre de l'arc s'y
  relie ; une piste posée sur sa **corde** ne relie rien, puisqu'il n'y a pas de
  cuivre là.
- **Le contrôle** (`runDrc`) mesure l'isolation par le modèle du monde, qui range
  l'arc en cordes assez fines pour que la flèche reste sous 5 µm (`ARC_SAG`).
  Un même défaut ne s'écrit qu'une fois : c'est la piste qui compte, pas la
  corde par laquelle on l'a mesurée. Et deux cordes d'un même arc ne se jugent
  pas entre elles — elles se touchent par construction, et un arc sans net
  n'aurait eu aucun moyen de se reconnaître relié à lui-même. Deux règles se taisent devant un arc —
  l'**écharde de gravure**, parce qu'un congé court est un raccord et non une
  languette, et l'**angle bâtard**, parce que la corde d'un arc n'est pas une
  direction de tracé.
- **Le Gerber** (`04-fabrication`) sort l'arc **en arc** : mode multi-quadrant
  `G75`, puis `G02`/`G03` avec les décalages `I`/`J` du départ vers le centre.
  Le sens s'inverse au passage, l'axe Y du Gerber montant là où celui du
  document descend. Une spirale de six tours tient en douze lignes au lieu de
  mille, et le fabricant lit un cercle rond.
- **Le routeur** ne pose pas d'arcs — il ne sait faire que du 45° — et surtout
  **il n'en défait pas**. Les cordes entrent dans le modèle du monde marquées
  `arc` : l'assemblage s'y arrête, et le *shove* refuse de pousser une courbe
  plutôt que de la rendre à `S.tracks` en segments droits. Face à elle, le tracé
  contourne, comme il contourne une pastille.
- **Les gestes** qui supposent une droite se retirent devant un arc : la
  sélection colinéaire, le chanfrein, le crochet, la fusion au dépôt. Deux
  gestes, eux, le suivent : la **désignation** (on attrape la piste sur son
  ventre, pas sur sa corde) et la **coupure** — poser un via au milieu d'un arc
  partage l'angle balayé, et les deux moitiés restent sur le même cercle.

Le panneau Propriétés d'une piste courbe affiche son **angle** et son **rayon** à
côté de la longueur : sans eux, une longueur d'arc n'aurait aucun rapport
visible avec les deux bouts, et l'on aurait cru à une erreur.

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
exécute `dist/pcb.js` et couvre 461 cas : import de netlist, boîtiers nommés
et empreintes qu'ils posent, chevelu
multicouche, vias, îlots de cuivre, classes de net, édition des pistes,
géométrie du L chanfreiné, posture du coude et règle d'angle (45° / 90° /
libre), non-croisement du cuivre tiré, réglages d'usine,
contour libre, origine utilisateur, saisie au clavier, anti-collision, rôles de
couche, chute continue (le cuivre du net envoyé au solveur, les tubes
métallisés qui font changer de couche, plusieurs sources et références,
sources en volts et charges en ampères, la tension qui arrive à chaque
charge, le tableau via par via, la carte de chaleur, ses trois grandeurs et la
valeur lue au survol), empilage physique et ce qu'il impose au perçage, Gerber, Excellon, archive ZIP, espace de travail (docks,
flottants, persistance), sélection multiple au Ctrl+clic, prise de la piste
entière au Maj+clic et de toutes ses couches au doublé, presse-papier
(copier/coller, contenu invalide, repères refaits), pas de grille, paires
différentielles (détection des couples, tracé couplé et son écart tenu,
éventail de départ, vias écartés, retour arrière, longueur découplée,
impédance et résolution des cotes, priorité des règles), ligne de transmission
d'une piste sélectionnée (ε<sub>r</sub> effective bornée par l'air et le
stratifié, raccord des deux branches de Wheeler, sens de variation avec la
largeur et la hauteur du diélectrique, √(L·C) qui rend le retard et √(L/C)
l'impédance, tronçons regroupés et sommes, parasites d'un via traversant contre
un borgne, panneau du segment seul comme de la piste entière avec ses vias,
avertissement sans plan de référence), moteur de routage
(enveloppes convexes et leur marge, index spatial confronté au balayage
complet sur une carte tirée au sort, branche et versement, assemblage des
polylignes, trame 45°, contournement d'un et de deux obstacles et choix du
côté le plus court, poussée d'une piste puis en cascade, poussée d'un via avec
le cuivre qui s'y raccroche, repli propre quand rien ne passe, Ctrl+Z et
abandon qui remettent le cuivre poussé en place, optimiseur et ses ancres,
poussée devant une paire différentielle), import
défensif d'un document et échappement HTML face à une netlist ou un `.json`
malveillant, cartes d'exemple (chargement, routage complet, contrôle DRC sans
remarque, aller-retour de document, paire couplée et appariée, plan pleine
carte qui n'est pas compté hors du contour), repérage (cote 3-4-5 et son angle
lu à l'écran, aimant qui prend le centre de la pastille et grille qui reprend
hors de sa portée, cote figée que la souris ne bouge plus, effacement au
changement de mode, classement d'un repère tapé en entier devant ses homonymes
plus longs, empreinte sélectionnée et amenée au centre, net dont le cuivre
sort, net absent qui ne fait pas sauter le cadrage, liste échappée face à un
document malveillant).

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

## Chercher un repère, mesurer une distance

Deux gestes que le schématique partage mot pour mot : mêmes touches, même
boîte, même lecture. Le comportement est dans `../commun/reperage.js` ;
`js/18-reperage.js` ne fournit que ce que ce fichier ne peut pas deviner —
l'aimant, la liste des cibles, le cadrage — par un adaptateur remis à
`rpInit()`, exactement comme `WS_CONFIG` paramètre l'espace de travail.

### Rechercher — `Ctrl+F`

Un champ, une liste, `Entrée`. La recherche atteint deux familles, et deux
seulement, parce que ce sont les deux seules choses qu'on cherche en routant :

| On tape | On trouve | Ce que « y aller » fait |
|---|---|---|
| `C47`, `R1`, `U3` | l'empreinte | elle est sélectionnée, la vue se cadre sur elle |
| `GND`, `USB_DP` | le net | tout son cuivre est sélectionné et mis en avant, la vue cadre sur son étendue |

Le classement va du plus sûr au plus large : ce qu'on a tapé en entier d'abord,
puis ce qui commence par, puis ce qui contient — et en dernier ce que seul le
libellé rattrape, la valeur ou le boîtier. Taper `R1` met donc `R1` avant `R10`
et `R100`, sans quoi la frappe la plus courte, qui est la plus fréquente,
serait la plus mal servie. Les flèches choisissent, `Entrée` y va, `Échap`
ferme. Le champ vide n'affiche rien : on invite, on ne déroule pas les cent
empreintes de la carte.

`Ctrl+F` est pris à la barre de recherche du navigateur, volontairement : les
repères et les nets ne sont pas du texte du document HTML, elle ne les
trouverait jamais.

### Le cadrage ne bouge que s'il le faut

`rpCadrer()` ne touche à l'échelle que dans deux cas : la cible déborde de
l'écran — on recule juste assez —, ou elle est trop petite pour se voir — on
s'approche, sans dépasser `RP_ZOOM_MIN` (12 px/mm, de quoi lire une 0603 et ses
deux pastilles). Le reste du temps le zoom ne bouge pas. Un recadrage qui
zoome sans raison désoriente : on ne sait plus si la carte a tourné ou si c'est
la vue qui a bougé.

Un net déclaré par la netlist mais posé nulle part — ni pastille, ni piste, ni
via — ne rend pas de boîte (`rpNetBox` renvoie `null`) et la vue reste où elle
est, plutôt que de cadrer sur un rectangle vide.

### Mesurer — `K`

Un clic pose le départ, le suivant fige l'arrivée, le troisième repart
d'ailleurs : on enchaîne les cotes sans repasser par un bouton. `Échap` efface
la cote sans quitter le mode ; un second `Échap` rend la main à la sélection.

Le point s'accroche avec **l'aimant du tracé** (`magnet`), sur la couche
active : pastilles, vias, sommets de piste. Mesurer d'un centre de pastille à
l'autre est le geste courant, et c'est exactement ce que cet aimant attrape.
Hors de sa portée, la grille reprend la main — jamais le point brut, sans quoi
on relèverait 3,4712 mm là où on visait 3,5.

La cote se dessine **en pixels d'écran**, pas dans le repère de la carte. Ce
n'est pas un détail d'implémentation : dessinée dans le monde, l'étiquette
serait retournée en vue dessous et changerait de taille à chaque cran de zoom.
Seuls les deux points passent par `w2s`. Le triangle rectangle en pointillé
montre ΔX et ΔY d'un coup d'œil — ce que deux nombres seuls ne montrent pas —
et n'est tracé que s'il a une surface, sinon il doublerait le trait principal.

Ici, la cote **est** la cote de fabrication : la lecture ne la relativise pas.
C'est ce que dit `physique:true` dans l'adaptateur, et c'est toute la
différence avec le schématique, où une case vaut 1 mm par convention de dessin
et où la lecture le précise.

La cote est une annotation de travail : `paint()` ne la trace que lorsqu'il
trace aussi la grille, c'est-à-dire jamais dans le `.png` exporté — ni l'une ni
l'autre ne décrivent la carte. Quitter le mode l'efface (`setMode`).

### Cross-probing vers le schéma

Une empreinte sélectionnée -- une seule -- ou, à défaut, le net mis en
évidence (`S.hlNet`) : cliquer *Éditeur schématique* dans l'entête y amène
directement sur ce même repère, feuille retrouvée comprise. Rien de
sélectionné, et le bouton fait ce qu'il a toujours fait -- changer de page.

Le mécanisme ne réinvente rien : `pcbSonde()` (`js/07-app.js`) répond « quoi
chercher », `sessAller()` (`../commun/session.js`) l'écrit dans un second canal
de `sessionStorage`, distinct du document transporté et qui ne survit qu'à une
seule navigation, et `pcbSonderCible()` (`js/18-reperage.js`) le consomme à
l'arrivée en s'appuyant sur `rpTrouve()` -- la même recherche par repère que
`Ctrl+F`, sur laquelle `pcbSonderCible()` s'appelle exactement comme
`rpQAller()`.

### Le phare : dire où l'on vient d'atterrir

Sélectionner ne suffit pas. Sur une carte dense, la surbrillance d'une 0603 se
cherche autant que l'empreinte elle-même — c'est précisément ce qu'on venait
d'éviter en sautant depuis le schéma. Toute arrivée de cross-probing allume
donc un repère franc et **temporaire** : deux traits qui traversent la vue et
se croisent sur la cible, un cercle qui se resserre depuis le bord, puis le
cadre exact de l'empreinte. Il bat trois fois et s'éteint seul en 2,5 s — un
marquage permanent finirait par masquer le cuivre qu'on est venu regarder.

Le magenta n'est la couleur de rien d'autre sur la carte : ni le cuivre, ni la
sélection (cyan), ni le DRC (rouge), ni la pastille traversante (jaune). Rien à
confondre avec le document.

Le compte à rebours part de la **première image peinte**, pas de l'instant où
le phare est allumé : un onglet en arrière-plan ne peint pas (le navigateur y
suspend `requestAnimationFrame`), et le phare aurait expiré avant d'être vu —
or c'est justement le cas du cross-probing entre deux onglets.

Comme la cote de mesure, il est **absent du `.png` exporté** : il désigne, il ne
décrit pas. Trois réglages, en tête de `js/18-reperage.js` : `RP_PHARE_MS` la
durée, `RP_PHARE_COL` la couleur, et le `shadowBlur` du tracé pour le halo.

### Montrer sur l'onglet d'à côté — `L`

L'autre façon de travailler : le PCB ici, le schéma dans une seconde fenêtre.
Le bouton **⇱ Montrer au schéma** (touche `L`) fait sauter l'onglet voisin sur
l'empreinte sélectionnée, ou sur le net désigné ; celui-ci ne bouge pas.

Sur demande, et non en suivi permanent : un onglet qui saute à chaque clic
d'à côté devient impossible à utiliser. Le transport est un
`BroadcastChannel` (`../commun/session.js`), qui ne dit jamais s'il a été
entendu — l'onglet qui reçoit accuse donc réception, et le pied de page
distingue *montré*, *ce repère n'y est pas*, *aucun onglet ouvert sur le
schéma*, et *ce navigateur ne partage rien entre onglets*. En `file://`, deux
onglets n'ont pas la même origine et le canal n'existe pas : le bouton se
désactive au lieu de disparaître.

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
- Les **pistes** savent être circulaires (voir plus haut) ; les zones de
  cuivre, les coupes et le contour de carte restent des polygones. Le
  routeur ne pose pas d'arc : ils arrivent d'un fichier, et l'éditeur les
  montre, les mesure, les contrôle et les sort en Gerber sans les redresser.
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
- Le calcul de ligne de transmission tient aux formules approchées
  (Hammerstad, Wheeler, IPC-2141A) : ±5 % sur une piste seule, ±10 % sur une
  paire. Pas de pertes — le Df de l'empilage reste inexploité, il n'y a donc ni
  atténuation ni résistance série. Ni gravure en trapèze, ni vernis épargne sur
  le microruban, ni triplaque asymétrique : le plan le plus proche décide, et la
  formule la suppose centrée. Le couplage entre deux pistes voisines n'est pris
  en compte que pour une paire différentielle déclarée.
- Pas de serpentin d'appariement de longueur : l'écart entre les deux pistes
  d'une paire est mesuré et signalé, jamais corrigé.
- Le contrôle des vias borgnes et enterrés suppose un pressage unique. Un
  empilage à laminage séquentiel est signalé comme tel, mais sa séquence ne se
  décrit pas : il n'y a qu'une liste de diélectriques, pas de sous-ensembles.
