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
js/04-pdf-masterdraw.js  Master Drawing PDF (pages IPC du dossier de
                         fabrication), fonte des plans embarquée
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
js/25-liens.js           liens des bouts de piste (pastille, via) et transformation des boîtiers
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
                         écart par côté, plages d'écart, couture de vias — et
                         qui joint au problème le CUIVRE VOISIN, sans lequel il
                         n'y a ni Z différentielle ni crosstalk. Pour l'onglet
                         Crosstalk il mesure en plus les trois choses que le
                         serveur ne peut pas deviner : les POSITIONS des vias
                         de couture le long du parcours, les FENTES du plan de
                         référence sondées sous la piste, et les VIAS DE MASSE
                         qui referment le retour aux changements de couche
js/20-placement-score.js panneau Qualité de placement & rotation assistée :
                         score HPWL en temps réel, hotspots de congestion (grille 5 mm),
                         conformité du découplage HF (≤ 3.5 mm), groupement par bloc
                         fonctionnel schéma et optimisation d'orientation en 1 clic (✨ Auto)
                         pour minimiser les croisements de chevelu (0°, 90°, 180°, 270°)
js/26-variantes.js       variantes de montage reprises du schéma : choix de la
                         variante, empreintes non montées barrées, bom.csv et
                         positions.csv sans elles
js/27-groupes.js         groupes (Unions) : composants et vias déplacés d'une pièce,
                         retournés en miroir du groupe entier, copiés-collés en
                         nouveau groupe avec leur cuivre interne
js/28-placement-satellites.js  « Placement auto », second temps : découplage et
                         composants série posés contre leur broche
js/29-draftsman.js       plans de fabrication et d'assemblage (Draftsman) :
                         feuilles cadrées et cartouchées, PDF au texte
                         cherchable, aperçu SVG et recherche dans la fenêtre
js/33-draftsman-export.js  plans : export DXF (carte 1:1 pour la mécanique,
                         feuille entière, un calque par outil de perçage) et
                         fonte TrueType embarquée en sous-ensemble dans le PDF
                         des plans et dans le Master Drawing
js/fontes/plans-sans.js  la fonte PlansSans (Liberation Sans pré-réduite, en
                         base64), produite par outils/fonte-plans.py ; sa
                         licence OFL à côté, js/fontes/OFL-PlansSans.txt
js/30-contraintes.js     gestionnaire de contraintes : mesures par net,
                         contraintes héritées ou propres, groupes
                         d'appariement, DRC, fenêtre en tableur (le modèle
                         et l'isolation entre classes sont dans 01-core.js)
../commun/contraintes.js ce qu'est une contrainte de net, partagé avec le
                         schéma qui en saisit aussi
js/34-draftsman-vues.js  plans, ce qui se pose à la main : cotes accrochées
                         à la géométrie (par référence, orphelines en rouge),
                         tolérances (par valeur pour chaînes et ordonnées),
                         vues déplacées à la souris (aperçu de celles qui
                         s'écartent), vues de détail
js/32-rooms.js           rooms : les blocs fonctionnels du schéma encadrés
                         sur la carte, sélection d'un bloc par son étiquette
js/31-topologie.js       forme du cuivre de chaque net (graphe des pistes,
                         vias et broches) : point à point, chaîne, étoile,
                         fly-by ; moignons de dérivation et de vias
js/35-ipc2581-export.js  export IPC-2581 révision C : toute la carte en un
                         XML (empilage, cuivre et nets, zones remplies,
                         perçages et contre-perçage, composants, empreintes,
                         nomenclature) ; voir « Export IPC-2581 »
outils/build-monofichier.py assemble le tout dans dist/
outils/fonte-plans.py    réduit Liberation Sans à la fonte des plans
test/harness.js          banc d'essai sans navigateur
test/banc-ipc2581-export.py  relit les exports IPC-2581 écrits par le banc
                         d'essai par la chaîne de la visionneuse
                         (python/ipc2581_parser.py → ipc2581_json.py),
                         et les valide contre le XSD s'il est fourni
```

Ces fichiers viennent du dossier partagé, à la racine du dépôt :

```
../commun/variantes.js   le modèle des variantes de montage, partagé avec le
                         schéma (chargé avant js/) ; variantes.css son habillage
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

### Rugosité du cuivre et modèles de simulation

Une ligne de cuivre de la coupe porte aussi sa **rugosité** : le feuillard
électrodéposé a des dents de l'ordre de la profondeur de peau dès le gigahertz,
et la perte du cuivre en monte jusqu'à doubler. Une liste de réglages usuels —
lisse, ED standard (Rq 2 µm), traité inversé (1 µm), VLP (0,6 µm), HVLP
(0,3 µm), et deux jeux de Huray — puis le modèle (Hammerstad-Groiss sur Rq, ou
Huray sur le rayon des nodules et leur rapport de surface) et ses valeurs, en
micromètres. Sous la synthèse, **Modèles de simulation** : la case
*diélectrique causal* (Djordjevic-Sarkar, Dk et Df lus à la fréquence de la
fiche, 1 GHz par défaut) et le **modèle de via** (π, ligne, ou « auto », le
défaut : π tant que le via est court devant λ).

```
stack.cu[i].rug   {m: "hammerstad", rms} | {m: "huray", a, sr}   µm, si non lisse
stack.sim         {causal, fref (Hz), via}                       si hors défaut
```

Rien ne s'écrit tant que tout est au défaut : un document qui n'en parle pas se
relit à l'identique. `simStackup()` (`js/19-simulation.js`) envoie la rugosité
sur chaque couche de cuivre et les options sur l'empilage ; la simulation, la
RF, l'œil et les pertes du crosstalk les lisent (voir
[simulation-em.md](../docs/simulation-em.md#pertes-diélectrique-causal-via-en-ligne-simulation_em-500)).

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

### Contre-perçage (back-drill)

Un traversant que le signal n'emprunte que de L1 à L3 laisse pendre le fût
jusqu'au dessous : un **moignon**, qui charge la ligne et résonne au quart
d'onde. Le contre-perçage le retire après métallisation — un foret un peu plus
gros repasse depuis une face et s'arrête avant la **couche à ne pas couper**,
en laissant un **moignon résiduel** (0,1 à 0,25 mm).

Les règles se décrivent dans l'**empilage physique**, section *Contre-perçage*
(`S.stack.cp`, `js/01-core.js`) : la face d'où l'on repasse, la couche gardée
(ou *auto* : la dernière couche où le signal entre, via par via), le
surperçage (foret = perçage du via + 0,25 mm d'usage) et le moignon résiduel
admis (0,15 mm d'usage). Une règle s'applique à un **via** (panneau
Propriétés), à un **net** ou à une **classe** (gestionnaire de contraintes,
onglet *Topologie et moignons*, champ `cp`) ; le via passe devant le net, le
net devant la classe, et « aucun » arrête l'héritage. Enregistré dans le
document :

    stack.cp   [{id:"cp1", cote:"dessous"|"dessus", garde:2 (indice de couche, −1 = auto),
                 sur:0.25, res:0.15}]
    vias[i].cp "cp1" | "non"
    contraintes.classes[nom].cp, contraintes.nets[nom].cp   "cp1" | "non"

`cpVia(v)` dit pour un via s'il est contre-percé, de quel côté, la couche
gardée, le diamètre du foret, la profondeur depuis la face, les couches
coupées, le moignon avant et après — ou pourquoi ce perçage ne peut pas se
faire (il couperait une couche où le signal entre ; un moignon admis plus
épais que le diélectrique laisserait la couche suivante reliée : faute au DRC,
et le moignon reste entier).

Le signal entre dans le via sur les couches de ses **pistes**, d'une
**pastille CMS** du net posée dessus, et d'une **zone de cuivre** (plan,
coulée) du net qui touche le fût : cuivre plein autour du perçage, liaison
directe ou thermique — exactement ce qui relie le via à la zone pour la
connectivité (`viaZones` de `conn()`, `js/02-connectivity.js` : le remplissage
rasterisé quand il est calculé, sinon la zone du dessus au droit du via, hors
découpes et trous d'une zone au cuivre du fichier). Une coulée SIG sur L3
interdit donc de couper L3 (« le foret couperait L3 (zone SIG), où le signal
entre » au DRC), la couche *auto* devient L3 et le moignon se mesure depuis
elle. Un via pris dans un **dégagement** — découpe de zone, zone d'un autre
net posée par-dessus, trou du remplissage du fichier — ou une zone qui ne fait
que passer à côté n'y comptent pas. Les **moignons de via** de la topologie, la
simulation SI/RF (`contre_percage` de la fiche de via) et la vérification de
la carte (`cp` d'un perçage) comptent le moignon résiduel.

En fabrication, **un Excellon par paire de couches**, comme KiCad et Altium :
`carte-BACKDRILL-B-In2.DRL` repasse par-dessous jusqu'à In2 gardée ; l'en-tête
dit la face, la couche à ne pas couper, les couches retirées et la profondeur
de chaque outil, en commentaire (Excellon n'a pas de champ de profondeur que
tous les outils CAM lisent). Le LISEZ-MOI, la feuille d'empilage et le master
drawing les annoncent ; le plan de fabrication (Draftsman) porte leurs
symboles, un tableau (foret, face, couche gardée, profondeur, moignon admis,
nombre), la passe sur la coupe d'empilage et une note.

À côté de chaque `.DRL`, inchangé, la même passe part en **Gerber X2**
(`carte-BACKDRILL-B-In2.gbr`, `cpGerberX2`, `js/04-fabrication.js`), où la
profondeur est un **champ**. La spécification Gerber d'Ucamco n'a pas de
fonction de fichier propre au contre-perçage : un perçage se déclare
`Plated` / `NonPlated` avec sa paire de couches et `PTH`, `NPTH`, `Blind` ou
`Buried`. Elle a en revanche la fonction d'ouverture `.AperFunction,BackDrill`.
Le fichier s'écrit donc comme chez KiCad : `%TF.FileFunction,NonPlated,3,4,Blind,Drill*%`
(les couches que le foret retire, face comprise, couche gardée exclue, comptées
de 1) et `%TA.AperFunction,BackDrill*%` sur chaque outil. La profondeur et la
couche à ne pas couper n'ont pas d'attribut normalisé : elles partent en
**attributs utilisateur** (sans point devant, comme la norme le réserve),
nommés d'après les types `<Backdrill>` d'IPC-2581 :

    %TFBackDrill_StartLayer,4*%         face percée
    %TFBackDrill_MustNotCutLayer,2*%    couche à ne pas couper
    %TFBackDrill_MaxStubLengthMM,0.150*%  moignon résiduel admis
    %TABackDrill_DepthMM,1.234*%        profondeur de l'outil défini juste après

Le LISEZ-MOI explique ce choix. L'export IPC-2581 (voir « Export
IPC-2581 ») écrit le même contre-perçage avec les vrais types de la norme :
une `<Spec>` faite de `<Backdrill type="START_LAYER | MUST_NOT_CUT_LAYER |
MAX_STUB_LENGTH">` pointée par le `<SpecRef>` du trou du via, et un calque de
perçage par passe pour le foret. Le `.gbr` n'est pas listé par le master drawing (qui ne détaille que les
Excellon).

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

## Classer un net

La colonne *Classe* de la liste **Nets** (et « Classe du net » dans le panneau
d'une piste) propose les classes de la carte, puis, sous *Nouvelle classe*,
celles que le schéma connaît et que la carte n'a pas encore : Horloge, RF,
Antenne… Choisie là, une classe est créée avec ses règles d'office (largeur,
isolation, via ; 50 Ω sur la couche du dessus pour RF), réglables ensuite dans
**Règles**. « Défaut » tient lieu de « Lent ».

Les classes posées dans le schéma arrivent seules (`autoClass`) : en direct
quand le schéma est ouvert dans un autre onglet, sinon à l'ouverture, par la
session de l'onglet ou par la copie que le schéma garde pour le projet. Un
choix fait dans le PCB reste prioritaire.

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
même essai de neutralité que le reste du document. « Sans perte » vaut pour
tout ce que porte une pastille : les sommets d'un polygone (`pts`), le
chanfrein et ses coins, les branches thermiques, et le **nom d'origine** de la
broche (`nom`, « A1 », « K ») quand une carte venue d'ailleurs a dû être
renumérotée — le numéro `n` reste l'entier qui porte le net, le nom
l'accompagne et s'affiche sous lui dans le panneau Propriétés. La rotation
d'une empreinte est un angle **quelconque**, ramené dans [0, 360[ au millième
de degré : la liste du panneau propose les huitièmes de tour et l'angle réel
du composant s'il n'en est pas un, et le Gerber flashe les pastilles à cet
angle, sans l'arrondir au degré. Sur la carte aussi, la forme suit :
`padsWorld()` transmet les sommets, le chanfrein et les branches thermiques
(les sommets au miroir pour une empreinte posée dessous), si bien qu'une
pastille polygonale se dessine, se contrôle et part au Gerber avec sa vraie
forme, et non plus comme le rectangle w × h qui l'encadre.

**Jusqu'à 32 couches de cuivre** (`CU_MAX`), nombre impair compris. Au-delà
des modèles d'usine, l'empilage proposé reste fabricable (épaisseur selon le
nombre de couches, prepreg et cœurs alternés) ; changer le nombre de couches
garde l'épaisseur visée tant qu'elle laisse 60 µm par isolant. Clavier :
1-9, 0 pour la dixième couche, Page ↑ / Page ↓ pour la couche voisine.

**Zone au cuivre du fichier** (`fichier`, `trous`, `sig`) : une zone dont le
document porte le cuivre déjà calculé est remplie avec ce cuivre — ses trous, liaisons
thermiques comprises — à l'écran, à l'analyse, au Gerber et en simulation.
Les isolations autour du cuivre d'un autre net restent appliquées (rien ne
change pour le cuivre d'origine, qui les respecte ; ce qu'on ajoute est
protégé). Dès que le contour change, la signature ne correspond plus et la
zone se recalcule comme une autre.

**Masque, pâte et forme par couche d'une pastille** — réglés dans l'éditeur
d'empreintes de Gestion LIB (onglet « Pastilles / Broches », fiche de la
pastille sélectionnée) :
- *masque* : règle de la carte, marge propre (`mask`, en mm, positive = le
  vernis s'ouvre au-delà de la pastille), ou pastille recouverte de vernis
  (`noMask`) ;
- *pâte* (CMS) : règle de la carte, réduction propre (`paste`), ou sans pâte
  (`noPaste`) ;
- *forme par couche* (traversante) : la forme du tableau vaut pour le dessus ;
  « couches internes » (`parCouche.int`) et « dessous » (`parCouche.bas`)
  peuvent prendre une autre forme, et les couches internes aucune pastille.
  Une couche nommée par son rang (`parCouche[2]`) l'emporte. Comme une
  empreinte de bibliothèque ignore le nombre de couches de la carte, c'est
  `padSurCouche(q, l)` qui résout la forme d'une couche donnée.

La forme par couche est utilisée partout : Gerber cuivre, remplissage des
zones, **contrôle des règles et routeur** (une traversante entre dans l'index
en un item par suite de couches de même forme ; là où la pastille est
retirée, le trou seul reste un obstacle, signalé « trou, sans pastille sur
cette couche »), et **connectivité** (`padCuLayers` : une piste qui arrive sur
une couche sans pastille n'est pas raccordée). `padLayers` reste la liste des
couches que traverse le trou — c'est elle que les zones dégagent.

**Aplat de sérigraphie** : dessin `poly`, polygone plein avec ses trous. Il se
trace avec l'outil Sérigraphie, forme « Aplat plein » (menu Sérigraphie, ou
Maj+S pour passer d'une forme à l'autre) : un clic par sommet, retour sur le
premier point ou Entrée pour fermer, ou deux coins puis Entrée pour un
rectangle plein. Sélection, déplacement, rotation, presse-papier, Gerber ; la
fiche permet de changer de face et de le supprimer.

**Broches nommées dans la netlist** : « U1.A1 », « D1.K » se résolvent par
le nom de la pastille (`nom`), puis par la grille d'un BGA calculé (lettre =
rangée, chiffre = colonne, lettres JEDEC), sinon reçoivent un numéro libre et
gardent leur nom sur la pastille (l'empreinte devient dessinée). Une seconde
importation retrouve les mêmes numéros ; la synchronisation ECO résout les
mêmes noms.

**Découpes intérieures de carte** (`board.cutouts`, une liste de polygones) :
une fenêtre fraisée dans le substrat. Elles sont dessinées comme le contour,
exclues de la carte pour tout ce qui demande « est-ce dedans ? » (`inBoard` :
DRC des vias, trous et pastilles, routeur, poussée), rognées du remplissage
des zones avec la marge de bord, effacées du cuivre Gerber, fraisées dans le
profil (`Profile,NP`) et rappelées dans le master drawing et la fiche de la
carte. Elles suivent un redimensionnement ; le panneau de la carte les compte
et les retire. Un document sans découpe n'écrit pas la clé.

Elles se tracent avec l'outil **Découpe carte** (menu Placer, ou Maj+E) : un
clic par sommet, retour sur le premier point ou Entrée pour fermer, deux
coins puis Entrée pour un rectangle, Maj pour 45°/90°. Une découpe qui sort
du contour est refusée. Un clic dans une découpe la sélectionne : ses sommets
se tirent, Alt+clic sur une arête en ajoute un, elle se déplace avec la
sélection, Suppr ou la gomme la retirent. (« Découpe zone », touche X, reste
la découpe d'une zone de cuivre.)

**Sérigraphie automatique** : chaque empreinte imprime d'office le contour de
son boîtier, son point de broche 1 et son repère. `fp.silk = false` (la case
« Sérigraphie automatique » des propriétés) coupe les trois : utile quand la
sérigraphie de l'empreinte est dessinée à part, dans les dessins. Le repère
reste visible à l'écran, en gris — le gris de ce qui ne s'imprime pas.

L'historique garde 80 instantanés, dans la limite de 48 millions de caractères
(`UNDO_BUDGET`, ~96 Mo en mémoire) : sur une très grosse carte, ce sont les plus
récents qui tiennent dans ce budget qui restent — jamais moins d'un.

## Placement auto : l'ensemble, puis les satellites

Le bouton « Placement auto » (panneau Propriétés, rien de sélectionné) dégrossit
en deux temps. Un seul Ctrl+Z défait les deux.

1. **L'ensemble** (`autoPlace`, 02-connectivity.js) : attraction le long du
   chevelu, répulsion des boîtiers. Les empreintes encore à côté de la carte
   partent d'une grille sur la carte ; un circuit garde 3 mm autour de lui
   pour ses satellites, un petit composant 1 mm. Une dernière série de passes
   écarte jusqu'à ce que plus rien ne se recouvre.
2. **Les satellites** (`placerSatellites`, 28-placement-satellites.js), dans cet
   ordre :
   - **découplage** : un condensateur entre une alimentation et la masse va
     contre une broche de ce net d'un circuit (trois pattes ou plus, sur la
     carte). Un par broche d'abord, du plus petit au plus gros ; ceux qui
     restent repassent derrière les premiers ;
   - **série et liaison** : un composant à deux pattes dont un net de signal
     touche un circuit va contre cette broche. Le net le plus privé l'emporte,
     puis le circuit le plus proche ;
   - **chaîne** : ce qui ne touche aucun circuit mais touche un satellite déjà
     posé va contre lui (la LED derrière sa résistance), sur deux niveaux ;
   - le reste reprend la place libre la plus proche.

   Chaque satellite tourne sa pastille du net partagé vers la broche et prend
   la première place libre en partant d'elle (0,6 mm entre boîtes).

Ne bougent pas : les points de test (`TP…`), qui se placent à la main. Les
connecteurs (`J…`) ne sont ni satellites ni circuits d'accueil. Les textes de
sérigraphie ne comptent pas dans l'encombrement : ils restent à reprendre.

## Rooms : les blocs du schéma sur la carte

Chaque bloc fonctionnel du schéma — un rectangle étiqueté (« Étage 1 · ampli
non inverseur ×215 ») — apparaît sur la carte comme une **room**, à la manière
d'Altium : un cadre à coins arrondis autour de toutes ses empreintes, un fond
à peine teinté (sous le cuivre), et un onglet à son nom court (ce qui précède
le premier « · ») dans sa couleur.

- **Un clic sur l'étiquette prend le bloc entier** : il glisse d'une pièce,
  R le tourne, Ctrl ou Maj l'ajoute à la sélection.
- La room **suit ses composants** : elle se resserre quand on les rapproche,
  et deux rooms qui se chevauchent disent deux blocs mêlés.
- **Affichage → Rooms** les montre ou les cache ; le réglage est celui du
  profil, comme la grille.

Les blocs se lisent dans le **document du schéma** (session de l'onglet ou
dossier du projet) : un composant appartient à une zone si son centre est
dedans, la règle de l'éditeur schématique. À défaut, ce sont les zones de
l'analyse « Motifs & Blocs ». Les rooms remplacent les pastilles de couleur
posées au coin de chaque empreinte. Rien n'est gravé ni exporté.

## Variantes de montage (BOM)

Les variantes se créent dans le **schéma** (Fichier → Variantes de montage…) :
c'est lui qui sait quel composant est posé dans quelle version de la carte.
La carte en garde une copie dans son document — `variantes` et, sur chaque
empreinte rapprochée par son repère, `nonMonte` — reprise du schéma :

- en ouvrant **Fichier → Variante de montage…** (et par « ⟳ Reprendre du
  schéma », qui relit le schéma enregistré du projet) ;
- à l'application d'un ECO Schéma ↔ PCB, dans le même pas d'historique ;
- avant chaque **Fabrication .zip**.

Chaque reprise qui change quelque chose s'annule par `Ctrl+Z`. La variante
choisie sur la carte est gardée tant qu'elle existe au schéma.

La variante active barre ses empreintes non montées (NM) sur la carte et dans
la liste des composants, et les **retire de `bom.csv` et `positions.csv`** :
un assembleur ne commande ni ne place un composant DNP. Le cuivre, lui, ne
change pas — pastilles, masque et pâte restent ceux de la carte complète. Le
`LISEZ-MOI.txt` de l'archive nomme la variante et liste les DNP, et l'archive
prend son nom (`…-fabrication-Lite.zip`).

## Plans de fabrication et d'assemblage (Draftsman)

**Fichier → Plans (Draftsman)…** ouvre une fenêtre à deux volets : à gauche
les réglages et les résultats de recherche, à droite la feuille. Le bouton
**Exporter PDF** télécharge `<projet>-PLANS.pdf`, et le même fichier part
dans **Fabrication .zip**, où le Master Drawing l'annonce avec son contenu.

| Feuille | Ce qu'elle porte |
| --- | --- |
| Plan de fabrication | vue de dessus à une échelle normalisée (2:1, 1:1, 1:2…), contour et découpes, cotes hors tout, origine des fichiers ; un symbole de perçage par outil (diamètre, métallisation, portée) et son tableau ; trous de fixation avec leurs coordonnées ; coupe d'empilage dessinée ; notes de fabrication tirées de la carte (matériau, Tg, épaisseur, finition, vernis, vias, test électrique) puis celles qu'on ajoute |
| Assemblage dessus / dessous | corps des composants, pastilles en gris, point de broche 1, repère centré et tourné selon le boîtier ; non-montés de la variante active en tirets, marqués NM. Dessous, la vue est en miroir : la carte retournée, comme le monteur la voit |
| Nomenclature | groupée par valeur, boîtier et référence fabricant : quantité, repères, fabricant, face ; non-montés listés à part |
| Couches de cuivre (option) | une feuille par couche : pistes, arcs, pastilles, vias, zones |

Chaque feuille a son cadre, ses repères de zones (1, 2, 3… / A, B, C…) et un
cartouche : société, projet, titre, dessiné / vérifié / approuvé, date, n° de
document (`<projet>-PLANS`), révision (celle du projet), échelle, format,
feuille n / N. Les formats sont A4, A3 (par défaut) et A2 paysage. Une
colonne trop longue (beaucoup d'outils, une longue nomenclature) continue sur
une feuille « (suite) », l'en-tête de tableau répété.

### Un PDF qui se cherche

Tout le texte est du texte, jamais des traits : `Ctrl+F` dans n'importe quel
lecteur PDF trouve un repère, une valeur, une note. Trois choix le
garantissent :

- la fonte est **embarquée** (option « Fonte embarquée », cochée par défaut,
  voir plus bas) : chaque glyphe est codé par son numéro et une table
  `/ToUnicode` dit quel caractère il porte, si bien que « Épaisseur », « Ω »,
  « ≥ », « µ », « ± » s'affichent, se cherchent et se copient tels quels.
  Décochée, ce sont les fontes standard en **WinAnsi** : les accents et
  « ± », « µ », « Ø » passent encore, ce que WinAnsi n'a pas s'écrit comme
  un technicien l'écrirait (Ω → `Ohm`, ≥ → `>=`, εr → `er`) ;
- ce qui ne s'affiche pas est posé en **texte invisible** (mode de rendu 3,
  celui de la couche texte d'un document numérisé) : sur le corps de chaque
  composant, sa valeur, son boîtier, sa référence fabricant, son fabricant ;
  sur chaque pastille, son net ; sur les feuilles de cuivre, le nom de chaque
  net sur sa plus longue piste. Chercher `100nF` surligne les condensateurs
  **à leur place sur le plan**, chercher `GND` les broches où arrive la masse ;
- des **signets** : une entrée par feuille et, sous chaque assemblage, une
  entrée par composant qui mène à lui.

La fenêtre cherche de la même façon, dans le même texte (invisibles compris),
sans tenir compte des accents ni de la casse : la liste des résultats dit ce
qui a été trouvé et où (« net · U1 · broche 5 · f. 2 »), les onglets comptent
les résultats par feuille, et l'aperçu surligne les endroits. `Entrée` passe
au résultat suivant, `Maj+Entrée` au précédent.

### Cotes, vues et détails posés à la main

Au-dessus de la feuille, une barre d'outils :

| Outil | Geste |
| --- | --- |
| ↖ Sélection | glisser une vue (vue de la carte, tableau de perçage, coupe d'empilage, notes, nomenclature, détail…) ou une cote ; double-clic sur une cote : sa tolérance ; `Suppr` efface la cote ou le détail choisi, ou rend sa place calculée à la vue choisie |
| ↔ ↕ ⤢ Cote horizontale, verticale, alignée | deux points accrochés, puis la ligne de cote |
| Ø R Diamètre, rayon | un trou de fixation, un via ou une pastille percée, puis le texte |
| ∠ Cote angulaire | le sommet puis un point sur chaque côté, ou deux arêtes du contour (cliquées loin de leurs sommets) ; puis l'arc |
| ⊢⊣ Cotes en chaîne | des points accrochés, puis un clic hors accroche (ou `Entrée`, à la souris) pour la ligne commune ; sens horizontal ou vertical à côté |
| ⌖ Cotes d'ordonnée | l'origine (premier point cliqué, ou l'origine des fichiers de fabrication), des points, puis un clic hors accroche (ou `Entrée`) pour la ligne |
| ◯ ▭ Détail | sur une vue de la carte, un cercle (centre puis rayon) ou un rectangle (deux coins) ; l'échelle se choisit à côté (2:1 à 20:1) |
| Replacer automatiquement | les vues de la feuille reviennent à la disposition calculée |

Les points **s'aimantent** sur la géométrie : centre d'un trou de fixation ou
d'un via, centre ou bord (gauche, droit, haut, bas) d'une pastille, sommet
ou bord du contour et des découpes. Le nom du point visé s'affiche sous la
souris. Une cote est enregistrée **par référence**, pas en coordonnées :
déplacez le connecteur, la cote suit et sa valeur change. Si la référence
disparaît (repère renommé, trou effacé), la cote ne devient pas fausse en
silence : elle se dessine en **rouge et en tirets**, suivie de
« (orpheline) », à la dernière place connue, au PDF comme à l'écran, et la
colonne de gauche la liste ; un clic y mène. `Échap` défait le geste en
cours, puis rend l'outil de sélection ; `Ctrl+Z` passe par l'historique de la
carte.

La **cote angulaire** mesure entre 0 et 180° (« 45,0° »). Sur deux arêtes,
le sommet est l'intersection de leurs droites — il peut tomber hors de la
carte — et chaque côté va vers le point cliqué ; deux arêtes parallèles
sont refusées. L'arc se pose à la souris, centré au sommet : dans l'angle,
dans l'angle opposé par le sommet (c'est ainsi qu'on cote l'angle extérieur
d'un coin, les côtés prolongés au-delà), ou ailleurs, prolongé jusqu'au
texte. Une **chaîne** cote ses points de proche en proche, rangés dans le
sens coté, sur une seule ligne ; une **ordonnée** cote chacun par sa distance
signée à l'origine, Y vers le haut comme dans les Gerber, l'origine marquée
« 0 » et les lignes de rappel coudées quand deux valeurs ne tiennent pas
côte à côte. L'une et l'autre ne sont qu'une cote, mais un point perdu ne
rend orpheline que la valeur qui en dépend.

Une cote choisie (un clic, ou un **double-clic** qui ouvre directement sa
saisie) montre sa **tolérance** dans la colonne de gauche, où toutes les
cotes sont listées :

| Tolérance | Rendu |
| --- | --- |
| ± symétrique | `12,00 ±0,10` |
| + / − écarts | `12,00` suivi de `+0,10` sur `−0,05`, plus petits, superposés |
| limites max / min | `12,10` sur `11,95` |
| ( ) de référence | `(12,00)` |
| ▭ théoriquement exacte | `12,00` encadré |

Les écarts sont signés, dans l'unité de la cote (degrés pour un angle) ; un
écart fin garde ses décimales (`±0,005`). Les limites sont « valeur +
écart » : elles suivent la géométrie comme la valeur. Chaque morceau est un
vrai texte : au PDF, `±0,10` ou `(12,00)` se cherchent ; au DXF, ils vont
sur le calque `COTES` (± en `%%p`, ° en `%%d`).

Une **chaîne** ou une **ordonnée** tolère aussi chaque valeur à part. Le
volet commence alors par la liste **Valeur** : « Toutes les valeurs » règle
la tolérance commune ; « Point 2 : 30,00 — trou de fixation n° 7 » règle
celle de ce point, qui peut suivre la **commune** (le défaut), n'en avoir
**aucune**, ou avoir la sienne — n'importe lequel des genres ci-dessus. Dans
le document, c'est `tols`, aligné sur `pts` : `null` pour la commune,
`{genre:"aucune"}`, ou une tolérance comme `tol`. Une valeur de chaîne prend
la tolérance du point où elle aboutit, le plus loin dans le sens de la cote
(le premier point n'en porte donc pas). Une liste de mauvaise longueur est
écartée, une liste toute à `null` disparaît : une cote sans tolérance par
valeur s'écrit et se relit comme avant. L'écran, le PDF et le DXF montrent
chaque valeur avec la sienne.

Une vue glissée garde sa place : le coin haut gauche de sa boîte, aimanté
sur une grille de 2,5 mm, toujours ramené dans le cadre et sorti du
cartouche. Lâchée sur d'autres vues, elle reste où on l'a posée et les vues
qu'elle recouvre **s'écartent** vers la place libre la plus proche, à 2 mm
au moins de leurs voisines, dans le cadre et hors du cartouche — celles
qu'on n'a jamais déplacées choisissent les premières. S'il n'y a plus de
place, chacune prend celle qui recouvre le moins, et la barre d'outils le
dit. Le tout est un seul pas d'historique. Sans place enregistrée, la
disposition calculée ne change pas.

**Pendant le glisser**, on voit ce que le lâcher fera, sans que rien ne soit
écrit : chaque vue qui s'écarterait est dessinée en tirets orange à sa place
future, une flèche depuis sa place actuelle ; s'il n'y a plus de place, ces
vues passent en rouge et « Feuille pleine : … resterai(en)t recouverte(s) »
s'affiche au-dessus de la vue glissée, comme dans la barre d'outils. `Échap`
abandonne le geste et l'aperçu avec lui. C'est le même calcul que le lâcher
(`dfDispositionRepousser`, sur une copie des réglages) : ce qu'on voit est
exactement ce qui sera posé. Refaire la feuille coûte quelques dizaines de
millisecondes ; le calcul ne se refait donc qu'au changement de position
**aimantée** (tous les 2,5 mm), les positions déjà vues pendant le geste se
gardent, et le calque ne se redessine qu'une fois par image
(`requestAnimationFrame`).
Une **vue de détail** redessine la vue mère à l'échelle choisie, découpée
proprement à sa fenêtre (au plan de fabrication, les pastilles et les trous à
leur vraie taille s'y ajoutent, pour coter un connecteur) ; la vue mère porte
le repère « A », le détail l'étiquette « DÉTAIL A — ÉCHELLE 5:1 ». Il se pose
de lui-même à la première place libre de la feuille, puis se glisse comme
les autres, et les cotes s'y posent aussi.

### Où vivent les réglages

Dans le document, `dessin` : format, feuilles cochées, noms du cartouche,
notes. `normDoc` n'en fait qu'une copie — il tourne au démarrage, avant que
`29-draftsman.js` soit chargé — et `dfCfg()` les borne à chaque usage. Une
nouvelle carte les garde, comme les règles : ils décrivent qui dessine, pas la
carte.

Ce qui est posé à la main y est aussi, et part avec la carte (Fichier →
Nouveau l'oublie, le cartouche reste) :

```
dessin.cotes   [{id, vue:"fab/carte", type:"h"|"v"|"a"|"d"|"r",
                 a:<réf>, b:<réf> (pas pour d / r), dx, dy, tol?, memo},
                {id, vue, type:"ang", s?:<réf>, a:<réf>, b:<réf>, dx, dy, tol?, memo},
                {id, vue, type:"ch", sens:"h"|"v", pts:[<réf>…], tols?, dx, dy, tol?, memo},
                {id, vue, type:"ord", sens:"h"|"v", o:<réf>, pts:[<réf>…], tols?, dx, dy, tol?, memo}]
dessin.vues    {"fab/percage": {x, y}, "det/7": {x, y}, …}
dessin.details [{id, lettre:"A", source:"fab/carte", forme:"cercle"|"rect",
                 x, y, r | w, h, echelle}]

<réf> : {type:"trou", id}  {type:"via", id}
        {type:"pastille", fp:"J1", pad:"3", ou:"c"|"g"|"d"|"h"|"b"}
        {type:"contour", i, c?}  {type:"bord", i, t, c?}
        {type:"origine"}                      (origine des fichiers, gOrigin())
tol   : {genre:"sym", sup}  {genre:"asym"|"lim", sup, inf}  {genre:"ref"|"base"}
tols  : [tol | {genre:"aucune"} | null …]     (un par point de pts ; null : la tol commune)
```

Une cote angulaire sans `s` prend deux arêtes : `a` et `b` sont alors des
références `bord`. Pour elle, `dx, dy` placent l'arc depuis le sommet ;
pour une chaîne, la ligne commune passe à `dy` (sens h) ou `dx` (sens v)
du premier point ; pour une ordonnée, de l'origine. Une chaîne a de 2 à 60
points, une ordonnée de 1 à 60 ; une seule référence mal formée écarte la
cote entière. `memo` d'un angle : `{s, a, b, v}` ; d'une chaîne :
`{pts:[{x,y}|null…]}` ; d'une ordonnée : `{o, pts}` — un point jamais vu
vaut `null`. `sup` et `inf` d'une tolérance sont des écarts signés
(`inf ≤ sup`, rangés à la lecture).

Une **clé de vue** nomme la feuille puis la vue : `fab/carte`,
`fab/percage`, `fab/fixation`, `fab/impedances`, `fab/empilage`,
`fab/notes`, `asmT/carte`, `asmB/carte`, `bom/nomenclature`,
`bom/nonmontes`, `cu0/carte`… ; `fab~1/notes` est la suite sur la feuille
suivante, `det/7` le détail n° 7. `dx, dy` placent la ligne de cote (ou le
texte d'un diamètre) en millimètres de feuille depuis le milieu des points
mesurés ; `x, y` d'un détail et sa taille sont en millimètres de carte ; `c`
est l'indice d'une découpe (absent pour le contour extérieur), `t` la
position sur le côté `i → i+1`, `ou` le centre ou un bord de la pastille.
`memo` garde la dernière mesure connue ({a, b, v}, en mm de carte) : c'est
elle qui place une orpheline. `dfResoudre(réf)` donne le point d'une
référence, `dfMesurer(cote)` sa valeur (null si elle est orpheline).

### Comment c'est fait

Une feuille est une liste d'objets en millimètres, Y vers le bas : traits et
polygones, cercles, textes (taille en points, ancrage, rotation, invisible
ou non, zone à surligner). Deux sorties la lisent, `dfPdf()` et `dfSvg()` :
l'aperçu est donc exactement ce qui s'imprime. Le PDF est écrit à la main,
sans dépendance, comme le Master Drawing : contenu non compressé, état
graphique réémis seulement quand il change, table xref comptée en écrivant.
La chasse des caractères vient de la table métrique d'Helvetica : c'est elle
qui centre un repère sur son composant et coupe les colonnes des tableaux.

### La fonte embarquée

Helvetica n'est jamais embarquée : chaque lecteur la remplace par ce qu'il a,
et le plan ne se ressemble pas d'un poste à l'autre. Le PDF des plans
emporte donc sa fonte, **PlansSans** : Liberation Sans 2.x (licence SIL Open
Font License 1.1), dont les chasses sont celles d'Arial, donc d'Helvetica —
la mise en page ne bouge pas d'un trait. Elle arrive en deux temps :

1. **À la construction**, `outils/fonte-plans.py` (Python sans module
   externe) réduit les deux graisses de la fonte du système à ce qu'un plan
   écrit — ASCII, Latin-1, Latin étendu A, ponctuation WinAnsi, grec,
   flèches et symboles (± ° ≤ ≥ ≈ ≠ ∞ √ ‰…) : 432 caractères, le hinting et
   les tables de mise en page retirés, 29 Ko par graisse au lieu de 410.
   L'OFL interdit qu'une version modifiée porte les noms réservés
   « Liberation » et « Arimo » : la fonte est renommée, son copyright et sa
   licence restent dans sa table `name`, et `js/fontes/OFL-PlansSans.txt`
   l'accompagne. Le résultat, `js/fontes/plans-sans.js` (80 Ko de base64),
   se charge comme un script : la fonte est là depuis le disque, sans
   serveur, et dans `dist/editeur-pcb.html`.
2. **À chaque PDF**, `33-draftsman-export.js` ne garde que les glyphes que
   les feuilles emploient (composants des glyphes composites compris) et
   réécrit la fonte en JavaScript pur : `glyf` et `loca` réduits, `cmap`,
   `hmtx`, `head`, `hhea`, `maxp`, `OS/2`, `name`, `post` minimal — 7 à 9 Ko
   par graisse pour l'exemple. Le PDF la déclare en `CIDFontType2`, codage
   `Identity-H`, avec sa `/ToUnicode`.

Un caractère que la fonte n'a pas suit le chemin de WinAnsi (⌀ → Ø, ✓ → OK,
lettre sans son accent, puis « ? »). Décochée — ou si la fonte ne se charge
pas —, le PDF reprend Helvetica en WinAnsi, comme avant. Le choix est gardé
dans le document (`dessin.fonte`).

**Le Master Drawing** (`04-pdf-masterdraw.js`, dans **Fabrication .zip**)
emporte la même fonte, par le même sous-ensembleur et sous la même option.
Il était en Helvetica sans accents (« 35 um », « +/-10% », « >= 100V ») ; il
écrit maintenant « 35 µm », « ±10% », « ≥ 100 V », « 150 °C », « εr », et le
nom du projet avec ses accents — le tout cherchable et copiable. Mais ici en
**TrueType simple**, un octet par caractère : l'ASCII garde son propre code,
les autres caractères prennent les codes libres (159 par graisse, au-delà
« ? »), la fonte est déclarée symbolique et sa `cmap` (1,0) et (3,0) dit quel
glyphe porte quel code, la `/ToUnicode` quel caractère. Le contenu des pages
se relit donc en clair (« SHEET: 1 / 3 », « REV: B », les noms de fichiers
annoncés) : un `grep` ou un `diff` entre deux révisions le lisent. Les chasses
sont celles d'Helvetica : aucune ligne ne bouge, seuls « — » et « °C » sont un
peu plus larges que les « - » et « C » d'avant, dans des cases qui ont la
place. Option décochée, ou fonte absente : Helvetica en WinAnsi, accents
compris (Ω → `Ohm`, ≥ → `>=`).

Pour changer de fonte ou de jeu de caractères : `python3 outils/fonte-plans.py
[Regular.ttf Bold.ttf]`, puis reconstruire le monofichier.

### Export DXF pour la mécanique

Deux boutons dans la fenêtre, et deux fichiers dans **Fabrication .zip**
(annoncés par le Master Drawing et le LISEZ-MOI) :

| Fichier | Contenu |
| --- | --- |
| `<projet>-CARTE.dxf` (**DXF carte 1:1**) | la carte seule, à l'échelle 1:1, en millimètres, dans le repère des Gerber et de l'Excellon (même origine, Y vers le haut) : contour et découpes en `LINE` et `ARC`, un `CIRCLE` par trou au diamètre fini, un calque par outil de perçage (un `POINT` par trou), encombrement (`POLYLINE` fermée, en tirets pour un non-monté) et repère (`TEXT`) de chaque composant, cotes hors tout, tableau de perçage à côté |
| `<projet>-PLAN-FABRICATION.dxf` (**DXF feuille**, la feuille affichée) | la feuille entière : cadre, cartouche, vue cotée, symboles et tableaux, coupe, notes |

Les calques : `CONTOUR`, `DECOUPES`, `TROUS_METALLISES`,
`TROUS_NON_METALLISES`, `COMPOSANTS_DESSUS` / `_DESSOUS`, `REPERES_DESSUS` /
`_DESSOUS`, `COTES`, `ORIGINE`, `TABLEAU_PERCAGE` pour la carte ; `CADRE`,
`CARTOUCHE`, `CONTOUR`, `PERCAGE`, `COTES`, `PASTILLES`, `COMPOSANTS`,
`REPERES`, `TABLEAUX`, `EMPILAGE`, `NOTES`, `TEXTES`, `DESSIN` pour la
feuille.

**Les trous de la carte, par outil.** Les cercles restent sur les calques
historiques `TROUS_METALLISES` et `TROUS_NON_METALLISES`, un par trou : un
lecteur qui s'y attend les retrouve. Chaque outil a en plus son calque, avec
un `POINT` au centre de chacun de ses trous — les positions que l'assistant
de perçage d'un modeleur ou une FAO de perçage attend, et de quoi choisir les
trous d'un diamètre d'un clic :

| Calque | Trous |
| --- | --- |
| `TROUS_PTH_<Ø>` | pastilles traversantes, métallisées |
| `TROUS_NPTH_<Ø>` | trous de fixation, non métallisés |
| `VIAS_<Ø>`, `VIAS_L1-L2_<Ø>` | vias traversants ; borgnes et enterrés, par portée |
| `CONTRE_PERCAGE_<DESSUS\|DESSOUS>_<Ø>` | contre-perçage, au Ø du foret, depuis la face indiquée — avec aussi le `CIRCLE` du foret |

Le Ø s'écrit `0_30` (deux décimales, trois s'il le faut : `0_864`) : R12
n'admet dans un nom de calque que lettres, chiffres, `$`, `-` et `_`. Chaque
diamètre a sa couleur (table `LAYER`), la même pour tous les calques de ce
diamètre, et les `POINT` s'affichent en petite croix (`$PDMODE` 3,
`$PDSIZE` 0,2 mm). Pourquoi ne pas remplacer les deux calques historiques :
un lecteur qui les attend les perdrait ; pourquoi pas des `CIRCLE` par
diamètre en plus : chaque trou serait compté deux fois.

Le format est **AutoCAD R12** (`AC1009`), en ASCII : c'est la version que
tout lit, des modeleurs (SolidWorks, Inventor, Fusion, FreeCAD) aux
machines de découpe. R2000 n'apporterait que la `LWPOLYLINE`, au prix des
poignées et de la section `OBJECTS` qu'un lecteur strict refuse au moindre
écart. Les unités sont annoncées quand même (`$INSUNITS` = 4, millimètres ;
`$MEASUREMENT` = 1) : un lecteur R12 les ignore, un lecteur récent ne
demande plus l'unité. Le texte est en Windows-1252 — le jeu de WinAnsi,
écrit de la même façon —, °, ± et Ø en `%%d`, `%%p`, `%%c`.

Le contour de la carte n'est qu'une liste de sommets : un coin arrondi ou une
carte ronde importés y sont des suites de cordes égales. L'export les
reconnaît (cordes égales, tournant du même côté, 30° au plus chacune, sommets
sur un même cercle) et les écrit en `ARC`, sur le cercle qui passe exactement
par les sommets de part et d'autre : le contour reste fermé, et le modeleur
reçoit un rayon au lieu de vingt facettes. Un octogone reste un octogone.

La feuille est lue dans la même liste d'objets que le PDF et l'aperçu : tout
ce qui s'y dessine passe dans le DXF. Pour ranger un nouveau dessin sur son
calque (des cotes posées à la main, une vue de détail), il suffit de
l'encadrer de `dfCalque(F,"NOM")` … `dfCalque(F)` ; un texte va sur le
calque de sa catégorie (`cat`), le cadre et le cartouche se reconnaissent à
leur place, et le reste va sur `DESSIN`. Le texte invisible du PDF n'y va
pas : il sert la recherche du lecteur PDF, pas le modeleur.

## Export IPC-2581

**Fichier → IPC-2581 .xml** écrit toute la carte en un seul fichier XML,
`<projet>.xml` (`carte.xml` sans projet) ; le même fichier part dans
**Fabrication .zip**, annoncé par le Master Drawing et le LISEZ-MOI. Le code
est dans `js/35-ipc2581-export.js` (`ipc2581Document`).

**Révision C.** C'est la révision en vigueur (2020), celle qu'écrit KiCad par
défaut, et son XSD est public. Tout ce qu'il nous faut — `<Backdrill>`, la
rugosité en `<Conductor type="SURFACE_ROUGHNESS_UPFACING">`, les
`<Dielectric>` — existe aussi en B ; la C ajoute la finition de surface
(`<SurfaceFinish>`, codes de l'IPC-6012), le type de `<Step>` et l'état de
l'empilage, et retire le niveau des `<FunctionMode>`.

Ce qui part, section par section :

| Section | Contenu |
| --- | --- |
| `Content` | rôle (`Proprietaire`), fonction `USERDEF` (fabrication, assemblage et nomenclature réunis), un `LayerRef` par calque, dictionnaires de traits (`LineDesc`) et de formes (`Circle`, `RectCenter`, `RectRound`, `Oval`, `Contour` pour les pastilles chanfreinées ou polygonales) |
| `LogisticHeader`, `HistoryRecord` | émetteur, auteur et révision du dossier de projet, date |
| `Bom` | une ligne par référence de commande (MPN, sinon valeur et boîtier) : repères, quantité, valeur, boîtier, MPN, fabricant en `Textual` ; `populate="false"` pour ce que la variante active ne pose pas |
| `CadHeader` | une `<Spec>` par couche d'empilage — cuivre (conductivité, rugosité), diélectrique (matière, εr, tan δ, âme ou prépreg), masque (εr, couleur) —, la finition, et une par contre-perçage |
| `Layer` | sérigraphie, pâte, masque, cuivres (`SIGNAL`, `MIXED` ou `PLANE` selon le rôle de couche), diélectriques, `CONTOUR` (`BOARD_OUTLINE`), un calque `DRILL` par portée avec son `<Span>` (borgnes et enterrés compris), `PERCAGE_NPTH`, un calque par passe de contre-perçage |
| `Stackup` | la coupe, masque compris, épaisseur hors-tout |
| `Step` | `PadStackDef` (pastilles et vias, perçage et forme par couche), `Profile` (contour et découpes), `Package` (une empreinte par géométrie : broches, forme, encombrement), `Component` (place, rotation, face, repère, valeur et MPN en `NonstandardAttribute`), `LogicalNet` (broche → net), `PhyNetGroup` (points de sonde des faces), et un `LayerFeature` par calque |

Dans les `LayerFeature` : les pistes (`Line`) avec leur largeur, les arcs en
`Arc`, les pastilles et les vias (`Pad` avec leur pile et leur broche), les
**zones remplies** (`Contour` et ses `Cutout`), les traits et textes de
sérigraphie (`UserSpecial` : les traits du Gerber, et le `Text` pour qu'un
outil le lise), les ouvertures de masque et de pâte, les trous (`Hole`,
`VIA` / `PLATED` / `NONPLATED`).

**Le repère** est celui des Gerber du même dossier (`gOrigin`), en
millimètres, Y vers le haut. Les rotations sont comptées dans le sens
trigonométrique, comme le veut la norme — l'éditeur les compte dans le sens
horaire, d'où 270° à l'écran pour 90° dans le fichier. Un composant posé
dessous est un miroir en X puis une rotation (`<Xform mirror="true">`),
l'ordre que suit la visionneuse ; le banc le vérifie broche par broche.

**Les zones partent remplies.** Une zone de l'éditeur n'est qu'un contour :
son cuivre se calcule au rendu, et le Gerber le dit en polarité négative.
IPC-2581 veut le cuivre lui-même. `ipcRemplir` le calcule exactement comme
`gerberCopper` le trace — la zone rognée à la carte moins sa marge et aux
découpes, privée des découpes de zone, des trous du cuivre importé et du
dégagement de tout cuivre d'un autre net, avec l'anneau et les bras de ses
liaisons thermiques — mais en géométrie exacte, sans trame : toutes les
arêtes sont coupées à leurs croisements, chaque tronçon qui sépare le dedans
du dehors devient un bord, et les bords se rechaînent en îlots et en trous
(`ipcBooleen`). Les cercles des dégagements partent en polygones
**circonscrits** : un isolement exporté n'est jamais plus petit que la règle.
Une géométrie dégénérée qui ne se refermerait pas donne la zone telle que
dessinée et ses dégagements en `Cutout` (le banc d'essai exige qu'aucune
zone d'exemple n'en arrive là).

**Les arcs du contour sont gardés.** Le contour n'est qu'une liste de
sommets ; les cordes égales d'un coin arrondi ou d'une carte ronde
importés y sont reconnues par `dxfSegments`, comme pour le DXF, et partent en
`PolyStepCurve` sur le cercle qui passe exactement par les sommets.

Ce qui ne part pas : les règles de conception (classes, matrice), les paires
différentielles et les contraintes, qui n'ont pas d'écriture que les outils
de FAO reconnaissent ; la rugosité de Huray, qui n'a pas de type normalisé,
part en `<Conductor type="OTHER">` commenté. Comme dans le Gerber, une zone
ne se dégage pas autour d'un trou NPTH.

**L'aller-retour.** `test/harness.js` écrit quatre exports dans
`dist/essai-ipc2581/` — les deux cartes d'exemple, la seconde chargée de ce
qui leur manque (contre-perçage, rugosité, composants dessous à 30° et 45°,
pastilles chanfreinée, polygonale et oblongue, arc, découpe, trous NPTH,
variante), la première aux coins arrondis percée d'une découpe ronde — et ce
que l'éditeur en attend. `test/banc-ipc2581-export.py` les relit par la
chaîne de la visionneuse et compare : composants (place, rotation, face,
chaque broche sur sa pastille), nets, pistes et arcs, vias et trous, contour
(aire au millième, arcs), couches et empilage, rugosité, contre-perçage,
zones (le net raccordé, les autres dégagés), masque, pâte, nomenclature.

    python3 outils/build-monofichier.py && node test/harness.js
    python3 test/banc-ipc2581-export.py --xsd chemin/IPC-2581C.xsd

Le XSD n'est pas dans le dépôt (il est à l'IPC) : KiCad en garde une copie,
`qa/data/pcbnew/ipc2581/IPC-2581C.xsd`, que la CI télécharge. Sans `--xsd`
(ou la variable `IPC2581_XSD`) ni `lxml`, la validation est sautée et le banc
le dit.

## Gestionnaire de contraintes

**Outils → Gestionnaire de contraintes…** rassemble en tableur ce qui était
réparti entre la fenêtre des règles, le panneau des paires et le serpentin,
et met à côté de chaque contrainte la valeur **mesurée** : vert si elle est
tenue, rouge sinon, gris pour un net non routé.

| Onglet | Ce qu'on y voit et règle |
| --- | --- |
| Nets | classe (modifiable, aussi pour tous les nets cochés), longueur, délai (vias compris), vias, Z₀ ; impédance cible et tolérance, longueur min / max, vias max, couches permises. Une case vide hérite de la classe, dont la valeur s'affiche en grisé. Un clic sur le nom ferme la fenêtre et sélectionne son routage |
| Classes | largeur, isolation, via, perçage (les règles de la fenêtre des règles, mêmes valeurs), **une largeur par couche** de signal, et les contraintes électriques de la classe. Pour une impédance cible : la largeur qui la donne sur chaque couche, d'après l'empilage, à poser d'un clic sur sa couche ou sur toutes |
| Paires diff. | longueurs P et N, écart en mm et en ps, longueur découplée face à la règle |
| Groupes d'appariement | des nets qui doivent avoir la même longueur ou le même délai, à une tolérance près, autour d'une référence (le plus long, ou un net choisi). Ce qui manque à chaque net est affiché ; un groupe se crée en cochant ses nets, ou depuis les pistes sélectionnées sur la carte |
| Topologie et moignons | la forme lue sur le cuivre de chaque net, l'ordre des repères le long du cuivre, le plus long moignon et le plus long moignon de via ; la topologie exigée, l'ordre imposé, les moignons admis — par classe ou par net |
| Isolation entre classes | une matrice classe × classe : « Alimentation ↔ RF : 0,5 mm » |

**Largeur par couche.** Une même impédance ne demande pas la même piste en
microruban (dessus, dessous) et en triplaque (couches internes) : prise
entre deux plans, la piste de 50 Ω est nettement plus fine. Une classe garde sa
largeur générale et peut la préciser couche par couche (`wL` sur la classe,
lue par `classWidth(net, couche)`) ; une couche sans réglage prend la largeur
générale, si bien qu'une carte sans réglage ne change pas. Le routeur part
avec la largeur de la couche active et en change au via ; chaque tronçon
garde celle de sa couche. Le DRC juge une piste à la largeur de sa couche, et
« aligner sur la classe » (panneau Propriétés) la suit. Quand le nombre de
couches change, dessus et dessous gardent leur réglage, comme le cuivre.

**Topologie et moignons** (`31-topologie.js`). Le cuivre d'un net est lu
comme un graphe : ses broches, ses vias et les jonctions de pistes (une
jonction en T coupe la piste qu'elle touche, comme une piste qui traverse une
pastille du net sans s'y arrêter), reliés par les pistes avec
leur longueur. Le bout d'une piste se rattache à ce que `linkSync` dit qui
le tient. On en tire :

- la **forme** : point à point, chaîne, chaîne à dérivations courtes, étoile
  (un centre, une broche au bout de chaque branche — le centre peut être la
  broche du pilote), arbre, maillé (une boucle), incomplet, plan ;
- le **tronc** : le plus long chemin entre deux broches, ou celui qui part
  de la source quand l'ordre imposé la donne ; l'**ordre** des repères le
  long de ce tronc, dérivations comprises ;
- les **moignons** : la distance de chaque broche hors du tronc jusqu'à lui
  (un point de test `TP…` est nommé comme tel), et les bouts de piste qui
  ne mènent à aucune broche ;
- les **moignons de via** : la part du fût au-delà de la plus haute et de la
  plus basse couche où le signal entre et sort, en épaisseur d'empilage (un
  traversant qui relie L1 à L2 d'une quatre couches laisse L2 → L4).

| Contrainte | Ce qui est contrôlé |
| --- | --- |
| Point à point | deux broches exactement, un seul chemin |
| Chaîne | pas d'étoile ni de boucle ; aucune dérivation au-delà du moignon admis (1 mm sans réglage) ; l'ordre imposé, lu dans un sens ou dans l'autre |
| Étoile | un centre ; les branches de même longueur à la tolérance près (1 mm sans réglage), sauf celle de la source (premier repère de l'ordre) |
| Fly-by | ce que demande une chaîne, et la terminaison au bout opposé à la source : une résistance `R…`, ou le dernier repère de l'ordre |
| Moignon max | chaque dérivation et chaque bout libre ; 0 interdit tout moignon. Les branches d'une étoile n'en sont pas |
| Moignon de via max | chaque via du net, contre-perçage déduit ; le message propose un via borgne ou un contre-perçage |
| Contre-perçage | la règle de l'empilage que prennent les vias du net (voir [Contre-perçage](#contre-perçage-back-drill)) |

Un net qui porte une zone de cuivre (un plan) n'est pas jugé ; un net dont
une broche n'est pas encore reliée l'est pour information seulement.

**Ce que la carte en fait** :

- le **DRC** liste chaque écart : `Contrainte SPI_CS : longueur 45,00 mm, au-delà du maximum de 30,00 mm (classe Défaut)`,
  `Groupe SPI : SPI_SCK à -28,63 mm de SPI_CS, tolérance ± 1,00 mm` ;
- l'**isolation entre classes** entre dans `clrPair` / `clrK` : le routeur, le
  DRC, le remplissage des zones et les Gerber l'appliquent. C'est un minimum
  qui s'ajoute aux classes et à la matrice des natures, comme elle : une
  matrice vide ne change rien. Les deux nets d'une paire différentielle
  gardent l'écart de leur règle ;
- le **serpentin**, posé sur un net d'un groupe, prend pour cible ce qui lui
  manque (en délai, converti avec le retard par millimètre du net). La paire
  différentielle garde la priorité ;
- les **plans** (Draftsman) reprennent les classes à impédance cible dans un
  tableau « Impédances contrôlées » du plan de fabrication.

Les longueurs, délais et Z₀ sont ceux de `ltLine` : formules de ligne
(Hammerstad, Wheeler, IPC-2141A) sur l'empilage. L'audit par la méthode des
moments reste dans **Simulation EM**. **⬇ CSV** exporte le tableau des nets.

**Contraintes saisies dans le schéma.** Le schéma saisit lui aussi des
contraintes de net et des groupes d'appariement (Outils → Contraintes de
nets…). Le PCB les reprend de son document — à l'ouverture de cette fenêtre,
par l'ECO (une ligne « ⊞ CONTRAINTES », cochée par défaut) et à l'export
« ⇉ PCB » — et les garde à part, dans `contraintes.schema`, sans les recopier
dans les siennes. Pour chaque champ d'un net : le réglage du PCB, sinon celui
du schéma, sinon celui de la classe ; la source est dite (« (schéma) » au
DRC, marque « sch » et valeur en grisé dans le tableau). Les groupes du schéma
sont évalués, contrôlés et suivis par le serpentin comme ceux du PCB, et se
modifient dans le schéma. Chaque reprise s'annule par Ctrl+Z.

Les contraintes sont dans le document, `contraintes`, bornées à la lecture
(`cmNorm`, sur les règles communes de `commun/contraintes.js`). Une nouvelle carte garde celles des classes et la matrice (un
métier, comme les règles) et perd celles des nets et les groupes.

Ce module ne touche à rien de ce qui est partagé avec la visionneuse
IPC-2581 : ses natures de nets, ses Z₀ par classe et ses porteuses vivent
dans `commun/simulation-em.js` et l'audit du serveur, inchangés.

## Sélection multiple et presse-papier

`Ctrl+clic` (ou `Maj+clic`) ajoute une empreinte, une piste, un via, une zone à
la sélection, et l'en retire au clic suivant (`toggleHit`). Un lasso tiré
modificateur enfoncé s'ajoute à ce qui est déjà pris. Le déplacement, la
rotation, le retournement et la suppression travaillent depuis toujours sur
l'ensemble de la sélection.

Le groupe se saisit par **n'importe lequel** de ses éléments. Le repère d'une
empreinte prise avec d'autres vaut son empreinte — il passe devant le boîtier au
test d'atteinte, et le saisir défaisait la sélection pour ne déplacer que le
texte ; il ne se déplace plus à part que lorsque son empreinte est seule
sélectionnée. De même, dès que la sélection contient une empreinte, les bouts de
piste, de trait et les sommets de zone cessent d'être des poignées : ils tombent
sur les pastilles, et c'est le groupe qui doit partir. `Ctrl+clic` sur un
élément déjà pris ne l'en retire qu'au relâchement : si le geste glisse, toute
la sélection part, lui compris.

**Au doigt**, la commande **Multi** de la roulette tactile (groupe *Sélection*) tient lieu de `Ctrl` :
chaque toucher ajoute un élément à la sélection ou l'en retire. Le lasso se
tire déjà au doigt sur le vide ; deux doigts déplacent la vue.

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
- Quand aucune place ne tient, le coude repartait en arrière et laissait un
  **angle aigu** — le V à 45° qui dépasse la pastille, avec son cuivre en
  double. Le geste bute désormais sur tout angle de moins de 80° qu'il créerait
  (`acutePairs`, `acuteStop`), qu'on tire une portion, un coude, un via ou un
  boîtier ; un crochet est jugé sur l'angle qu'il fera une fois défait. Un
  angle aigu déjà présent au départ ne bloque rien, et le DRC signale ceux qui
  restent (page « Angle des pistes »).
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

### Déplacer un boîtier ou un via déjà routé

Déplacer un boîtier laissait ses pistes derrière lui, et déplacer un via
étirait son dernier segment d'un seul trait, à un angle quelconque — un « V »
qu'on ne trace jamais à la main. Le cuivre accroché **suit** désormais, en
gardant ses 45°, comme le glissement d'Altium ou de KiCad (`followMoved`,
`followPath`, `applyFollow`) :

- chaque piste qui arrive sur une pastille ou un via déplacé est suivie de
  coude en coude jusqu'à ce qui la tient (pastille, via, embranchement) ;
- si ce bout-là bouge lui aussi (deux pastilles du même boîtier, un via et son
  boîtier), la piste part **en bloc** ;
- sinon la piste est gardée telle quelle jusqu'à un sommet, et repart de là
  vers le point déplacé par un coude à 45° (ou 90° selon la règle) dont la
  première jambe **prolonge** le segment d'origine : le coude glisse le long de
  son voisin. C'est le `dragCornerInternal` du routeur PNS de KiCad : on part du
  sommet le plus proche, et on recule d'un sommet quand le coude tournerait à
  rebrousse-poil, recroiserait la piste ou passerait sous l'isolation ;
- quand **aucun coude direct ne passe** l'isolation, la piste **contourne**
  l'obstacle comme au routage interactif (`pnsWalkaround`), puis le détour est
  retendu : l'optimiseur du routeur raccourcit, et `followSmooth` retire les
  marches qui ne rallongent pas — tous les chemins à 45° sans retour en arrière
  ayant la même longueur, l'optimiseur seul laissait un crochet au ras de la
  pastille. Les obstacles sont jugés dans le monde **à l'instant du geste**
  (`followBase` / `followWorld`, une branche du modèle PNS) : les pastilles du
  boîtier qu'on tire y sont à leur nouvelle place, et la broche voisine compte
  comme n'importe quel obstacle. Ce qui tient les deux bouts de la piste n'en
  est jamais un. Sans passage d'aucun côté, on garde le coude direct : le
  glissement d'un via bute alors comme avant, et le DRC le signale pour un
  boîtier ;
- en règle de routage **« pousser »** (le défaut), tirer un **boîtier** fait
  le **shove** comme le routage interactif (`followShove`) : les pistes qui
  suivent ne contournent que les pastilles, et tout ce qui bouge devient une
  tête de `pnsShoveHeads` — les pistes qui suivent, le cuivre sélectionné, les
  vias emmenés, et les pastilles du boîtier, en **une seule tête-objet** dont
  l'enveloppe est l'octogone qui les entoure toutes (`pnsHullGroup`) : le
  cuivre poussé fait le tour du boîtier d'un geste au lieu de serpenter entre
  ses broches. Chaque ligne écartée est **retendue avant de pousser ses
  voisines** (`pnsTendre`, option `tendre`) : retendues après coup, deux
  lignes poussées l'une contre l'autre se bloqueraient mutuellement. Les
  sommets sont reposés au micron le long de leur direction
  (`followRound45`), sinon l'arrondi coordonnée par coordonnée casse le 45°
  d'un pan court. L'aperçu se dessine en pointillé pendant le geste
  (`S.dragShove`) et le relâchement le verse (`pnsApply`), d'un seul Ctrl+Z.
  Garde-fous : une paire différentielle ne se pousse pas brin par brin, et le
  cuivre qui tient une piste qui suit ne doit pas partir — sinon on se rabat
  sur le contournement. Un **via tiré seul** ne pousse pas : il bute, comme
  avant. En règle « contourner », rien n'est poussé ; en règle « signaler »,
  rien n'est contourné non plus ;
- le point tenu par une pastille ou un via déplacé ne glisse jamais : il suit
  son support en bloc (clé « rigide » de `moveJoints`) ;
- le tracé se recalcule à chaque mouvement depuis la forme de départ : revenir
  en arrière rend la piste intacte. `Alt` laisse le cuivre où il est. En règle
  d'angle « libre », le bout s'étire simplement, comme avant.

### L'aimant angulaire du sommet tiré

Tout cela vaut pour la portion tirée par son **milieu**. Tirer un **sommet** par
sa poignée est un autre geste : les bouts d'en face ne bougent pas, et rien
n'obligeait les deux jambes à retomber d'aplomb. On tirait un coude de quelques
dixièmes et il en sortait du 32° — l'**angle bâtard** (*off-angle track*), que
le rendu Gerber n'optimise plus et que certains fabricants refusent au contrôle
d'entrée.

En angle imposé (45° ou 90°), le sommet ne se pose **que** là où ses jambes
retombent d'aplomb : l'aimant (`tendMagnet`) n'a plus de portée limitée, et
là où il n'y a aucune place (embranchement, deux bouts fixes sans
intersection), le geste **bute** (`offAngleStop`). Seule exception, l'arrivée
accrochée au centre d'une pastille hors grille, que le relâchement redresse.
Une jambe déjà de biais au départ ne bloque rien. En angle libre, le geste
reste libre : c'est un choix. Deux cas, selon ce que le sommet a en face de
lui :

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
mêmes normalisations que la lecture d'un fichier. Les liens des bouts de piste
(`a1`/`a2`) et le boîtier d'un via marqué sont rangés en **rang dans la copie** :
collés, ils visent les copies, et chaque via collé reçoit son identifiant.

Un **groupe** copié entier (`js/27-groupes.js`) se colle en nouveau groupe
(« G1 (copie) », puis « G1 (copie 2) »…), avec son **cuivre interne** même s'il
n'était pas sélectionné : les pistes qui vont d'un membre à un autre, et les
vias libres qu'elles traversent. Une piste qui aboutit à un composant hors du
groupe, ou qui pend d'un seul membre, reste où elle est. `Ctrl+X` emporte ce
cuivre interne avec le groupe.

**F** sur un groupe le retourne **en miroir du groupe entier**, autour de l'axe
vertical du centre de son cadre — à l'arrêt comme en plein glissement, comme
**R**. Chaque composant change de face, sa place est symétrisée et sa rotation
change de signe (θ → −θ, la convention de `fpXform` : chaque pastille tombe
alors exactement au miroir de sa place). Les vias du groupe et la piste tendue
entre ses membres passent au miroir et sur la **couche miroir** (F.Cu ↔ B.Cu,
In1 ↔ In(n) ; un via borgne L1–L2 devient L(n−1)–L(n)) ; les pistes qui sortent
suivent à 45° et sont jugées au relâchement. Un seul `Ctrl+Z` défait le geste.
Un composant hors groupe se retourne toujours sur place, rotation gardée.

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

### Le budget d'un geste : du travail, pas des millisecondes

Une poussée doit rester assez courte pour suivre la souris. Ce budget était
autrefois de 25 ms d'horloge : sur un poste chargé, la même poussée renonçait
(`cause:"temps"`) là où elle aboutissait au calme, et les essais du shove
passaient ou cassaient selon la charge de la machine. Il se compte maintenant
en **travail fait** — des examens d'isolation, un couple (objet gênant,
segment examiné), une requête à l'index valant `PNS_SHOVE_INDEX` = 32 examens —
et plafonne à `PNS_SHOVE_TRAVAIL` = 60 000 (`cause:"travail"` au-delà). Le
résultat porte ce qu'il a coûté (`r.travail`).

Le plafond vient des cartes d'exemple, chaque boîtier tiré dans six
directions et des tracés lancés à travers toute la carte, sur chaque face :

| Geste | Médiane | 9 sur 10 sous | Plus grosse poussée aboutie |
|---|---|---|---|
| boîtier tiré | ~400 | ~2 300 | ~1 100 |
| tracé à travers la carte | ~400 | ~6 000 | ~50 000 (≈ 20 ms) |

Un examen coûte de 0,3 à 0,5 µs : le plafond tient dans l'ancien budget sur un
poste ordinaire, mais il décide pareil partout. L'horloge reste en garde-fou
des seuls cas pathologiques (`PNS_SHOVE_MS` = 250 ms, dix fois l'ancien
budget), qu'un geste ordinaire n'atteint pas même sur une machine à genoux.

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

### Les gestes commandent l'étendue du calcul

Ils sont ceux qu'on connaît déjà — ce fichier ne lit que `S.sel.tracks`, il les
suit sans les connaître :

| Geste | Ce qui est calculé et peint |
| --- | --- |
| Clic | le tronçon cliqué, seul |
| `Maj`+clic | la piste entière, sur sa couche |
| `Maj`+clic à nouveau | la piste sur toutes les couches, vias de passage compris |
| `Ctrl`+clic | **ajoute** un morceau : chaque parcours continu est calculé séparément |

### Les onglets de SI, et trois lisent la même réponse du serveur

Le panneau se range en deux familles — **SI** (intégrité du signal) et **PI**
(intégrité de l'alimentation). SI porte notamment :

| Onglet | Ce qu'il répond | Ce qu'il lit |
| --- | --- | --- |
| **Impédance** | Z₀ tronçon par tronçon, paramètres S de la liaison | la section droite d'UNE piste |
| **Z différentielle** | Z_diff et Z_commune des paires qui longent la sélection | la même section, à DEUX conducteurs |
| **Crosstalk** | le **niveau 2** : pour la piste sélectionnée ou pour toute la carte, le pic de bruit relatif de chaque victime — k_total, NEXT et FEXT en % et en dB, statut vert / orange / rouge (3 % / 7 %) — sous un échelon unitaire et un front t_r, et **OÙ** le NEXT se fabrique le long du parcours | [C] et [L] bloc par bloc (MoM 2D) le long du parcours, depuis le DESIGN |
| **Current Return Path** | par où revient le courant de chaque via | la liaison verticale |
| **Diagramme de l'œil** | si la liaison passe le gabarit de son protocole (USB, PCIe, HDMI, LVDS, MIPI, SATA, SGMII, SPI, QSPI, SD, eMMC), avec quelle marge — œil PRBS et œil pire cas | la même cascade que l'Impédance (ou la paire), passée en temporel par sa propre route, `/api/oeil` — voir [le guide Simulation EM](../docs/simulation-em.md) |

**Impédance, Z différentielle et Current Return Path lisent la MÊME réponse du serveur** : changer d'onglet ne
relance rien, et les trois fiches parlent nécessairement du même cuivre. Elles
ne posent pas la même question — une piste parfaitement à 50 Ω peut avoir un
retour catastrophique.

> **Un onglet *Diaphonie* a existé, et il a été retiré — puis l'analyse
> « électrique » qui l'avait remplacé.** *Crosstalk* ne fait plus que le
> **niveau 2**, le scan normalisé : le pic de bruit relatif que chaque victime
> subit, en pour-cent et en décibels de l'amplitude de l'agresseur, sans
> tension ni protocole à connaître, avec une abscisse en millimètres en plus.

Le bouton **« réglages »**, au bout de la rangée des onglets, **replie les
commandes** de l'analyse courante pour laisser toute la hauteur du panneau au
résultat : une fois le calcul lancé, on n'y touche plus, c'est la fiche qu'on
lit. La rangée qui porte le bouton d'action ne se replie jamais — on relance
sans déplier —, non plus que celle qui avertit sur la bande.

**Crosstalk est à part**, avec sa route (`/api/crosstalk`), son calcul et son
résultat. C'est le **niveau 2** : un échelon d'agresseur unitaire, des lignes
adaptées, un front t_r — celui de la piste sélectionnée (saisi, ou déduit de la
**classe** de son net), ou un t_r **global** (1 ns) pour **toute la carte**. Par
paire, il rend **k_total** = ½(Cm/C11 + Lm/L11), le **NEXT** (Kb si 2T_d ≥ t_r,
Kb·2T_d/t_r sinon) et le **FEXT** (|Kf|·T_d/t_r), en % et en dB, chacun avec
son **statut** vert / orange / rouge (3 % et 7 % par défaut, réglables, les mêmes
que la vérification de carte). Le seul geste demandé est de **sélectionner
l'agresseur** : les victimes se déduisent de la géométrie, pistes superposées
comprises. La **carte locale** dit où, le long du parcours, le NEXT se fabrique,
et les portions à reprendre sont peintes **sur le cuivre** de chaque victime.
Le bouton **▶ Toute la carte** scanne toutes les paires voisines sous le t_r
global ; un clic sur une ligne du tableau centre la vue sur la paire. Voir
[le guide Simulation EM](../docs/simulation-em.md).


**L'autre moitié d'une paire n'est pas toujours dans la sélection** : on
désigne un net, pas deux. La page joint donc au problème le **voisinage** — le
cuivre qui passe à portée sur la même couche — et c'est le serveur qui apparie :
même couche, parallèle à 15° près, un recouvrement mesuré par projection, un
écart de cuivre à cuivre. Sélectionner UNE des deux pistes suffit.

Ici, **un couplage n'est pas un défaut** : c'est le mode impair d'une paire,
celui que le récepteur différentiel rejette. Ce qu'une voisine *prend* se lit
sous *Crosstalk*, en pour-cent et en décibels.

### Une piste, deux voisines : une seule section

**Une piste avec deux voisines n'est pas deux problèmes à deux conducteurs :
c'est un problème à trois.** Les résoudre séparément compterait deux fois le
même champ. Toutes les voisines d'une même piste entrent donc dans la même
matrice, chacune à sa distance réelle et **du bon côté** — la fiche affiche la
coupe résolue, de gauche à droite, avec les deux écarts au plan.

Z différentielle d'une paire prise dans un bus se lit alors par réduction
exacte : **les autres conducteurs tenus à la masse**. C'est une hypothèse — une
piste réellement terminée sur son impédance n'est pas une piste à la masse — et
la fiche l'écrit dès que la section porte plus de deux conducteurs.

### La masse coplanaire est dans le calcul

Sous ses deux formes, et sans rien mesurer de plus :

- **le plan qui borde le groupe.** Les deux outils sondent les *plans* sans
  voir les pistes : l'écart mesuré est déjà la distance de la sélection au plan,
  *même quand une voisine se trouve entre les deux*. Le plan borde donc le
  groupe, et l'écart du groupe est celui de la sélection moins le cuivre ajouté
  de ce côté-là ;
- **la piste de garde.** Une piste du **net de référence** qui longe n'est pas
  une voisine : c'est un conducteur **tenu à zéro volt** dans la section — elle
  occupe la place, elle prend du champ, elle n'a ni port ni impédance
  différentielle. Mesuré sur la section, une garde entre deux signaux à
  0,45 mm fait tomber le couplage arrière de **3,15 % à 0,96 %**, et Z₀ des
  signaux de 57,6 à 50,7 Ω — ce dernier est **affiché**, parce qu'on ne pose
  pas une garde sans revoir la largeur. Le gain de couplage, lui, se lit sous
  *Crosstalk*.

### La sélection est l'agresseur, sous *Crosstalk*

**On clique le net qu'on soupçonne, et la fiche liste ses victimes.** C'est le
geste du routage : on tient un fil bruyant — une horloge, le nœud de découpage
d'un régulateur, un bus qui commute — et on veut savoir *qui il dérange, de
combien, et où*. Une ligne par piste qui longe la sélection.

**Rien ne se totalise, et c'est voulu.** Une *victime* additionne ses agresseurs
— la vérification de carte les somme au pire en phase —, un *agresseur* non :
ses victimes sont des nets différents. Chaque ligne se juge donc seule, et le
NEXT et le FEXT ont **chacun leur statut** : le NEXT s'observe au bout proche de
la victime, le FEXT à son bout lointain, jamais au même point — donc jamais
additionnés. La paire prend le pire des deux.

**Un partenaire différentiel déclaré n'est pas une victime.** Une paire est
serrée *par construction* — c'est tout ce qu'on lui demande —, et son couplage
**est** son mode impair, celui que le récepteur différentiel rejette. Compté
comme du bruit, il repeignait toute paire en rouge quel que soit le budget :
mesuré sur une paire USB à 0,15 mm, **10,8 %** annoncés comme du bruit contre
**3,7 %** pour le *vrai* agresseur d'à côté, lequel disparaissait sous l'alarme.
C'est l'onglet **Z différentielle** qui la juge, contre une cible en ohms. Une
voisine simplement *proche*, elle, compte : le repli « la plus proche » ne fait
pas une paire.

**Ce que ce bout-là de la lunette ne montre pas** : les *autres* agresseurs de
chaque victime. Le chiffre annoncé est ce qu'elle prend à la sélection, pas son
bruit total — c'est un **minorant**, et la fiche le dit. Pour le budget complet
d'une victime, sélectionnez-la : elle devient l'agresseur à son tour.

**Le temps de montée** se saisit en nanosecondes. Laissé vide, il est déduit
de la **classe** du net agresseur — les fronts du tableau des classes de la
vérification de carte (Horloge 2 ns, Rapide 1 ns, RF 100 ps, Lent 10 ns…) —, et
la fiche dit lequel a servi. Il ne change ni [C] ni [L] : il fait d'un Kb un
NEXT et d'un Kf un FEXT, et fixe le seuil de pas de couture. Il n'y a plus
d'amplitude : le niveau 2 est normalisé.

**Ce que ça ne couvre pas, et qui est écrit sous chaque fiche** : le couplage
entre pistes de **couches différentes** dans la section droite — *Crosstalk*,
lui, les présélectionne et les signale —, les **croisements**, et le couplage
par champ de vias. Et quand aucun plan n'est trouvé à portée du groupe — la
sonde va jusqu'à trois millimètres —, le calcul se fait sans lui, donc
**majoré** ; la fiche le dit alors, et seulement alors.

### Un cuivre de masse non cousu ne blinde pas — il transfère

La section posait tout cuivre de masse coplanaire **à zéro volt**. C'est vrai
d'un plan cousu de vias ; c'est faux d'une garde qui ne l'est pas, et ce n'est
pas une question de précision, c'est un changement de **nature** : un cuivre
flottant est chargé par l'agresseur, porte cette charge sur toute sa longueur et
la rend à la victime.

Le solveur sait désormais poser un conducteur **flottant** — charge totale nulle,
potentiel libre — par système augmenté d'une inconnue et d'une équation. C'est
exact, pas une correction. Mesuré sur la section, une garde entre deux
signaux :

| | couplage arrière |
| --- | --- |
| sans garde | 0,88 % |
| garde **cousue** | 0,53 % |
| garde **non cousue** | **1,04 %** |

Une garde non cousue fait donc **pire que pas de garde du tout**. C'était le seul
endroit où le dessin pouvait rassurer à tort.

**Le critère est une longueur d'onde, pas un nombre de vias** : le plus grand
trou entre deux coutures doit rester sous λ/10 à la fréquence du genou, soit
moins d'un tiers de la longueur physique du front — 6,4 mm pour un front de
150 ps. La page mesurait déjà cet espacement, côté par côté ; il **entre
maintenant dans le calcul**, et la coupe marque en rouge *garde NON COUSUE* avec
le trou mesuré. Sur la carte d'exemple, la même garde à 1,4 mm de couture tient
à 150 ps et **flotte à 15 ps** — le couplage y passe de 0,69 % à 5,74 %. La
nature du conducteur entre donc dans **toutes** les sections : la Z
différentielle comme les sections du crosstalk.

*Ce qui n'y est pas* : la **résonance** d'un tel cuivre. Le quasi-statique rend
le transfert, pas le pic aux multiples de λ/2.

### Ce que ce calcul ne couvre pas — rassemblé, et dans quel sens

Chacun de ces manques est déjà dit plus haut, à l'endroit où il se produit. Les
réunir a un intérêt propre : **savoir de quel côté penche ce qui reste.**

| Ce qui manque | Sens de l'écart |
| --- | --- |
| la **résonance** d'un cuivre de masse flottant, qui sonne aux multiples de λ/2 — le quasi-statique rend le transfert, pas le pic | **optimiste** à ces fréquences |
| le **couplage entre couches** — deux pistes superposées couplent, et la section pose tous ses conducteurs à la même hauteur | **vu mais non chiffré** : la géométrie est cherchée et signalée, le couplage ne l'est pas — **optimiste** quand il y en a |

**Les deux vont dans le sens rassurant.** Ce que la fiche affiche est donc un
**plancher** sur une carte mal cousue, ou routée en parallèle sur deux couches
adossées, jamais un plafond. C'est la seule chose qu'on ne peut pas
déduire des hypothèses prises une par une, et c'est celle qu'il faut savoir
avant de signer.

Le second a changé de nature le 2026-09-01, et la nuance n'est pas
cosmétique : il était **absent — simplement pas vu**, et ces voisines-là
disparaissaient sans un mot, ce qui se lit comme un couplage nul. Un bus routé
en parallèle sur deux couches adossées affichait « aucune voisine ne longe ».
Elles sont maintenant **cherchées**, et la fiche porte, sous le tableau, un bloc
**« au-dessus et au-dessous »** : le net, les deux couches, la longueur en
regard, le décalage de **cuivre à cuivre** vu de dessus — zéro quand les deux
pistes se chevauchent en projection, ce qui est le pire cas — et l'épaisseur de
diélectrique entre les **deux faces en regard**, qui est ce qui décide. Les
longements qu'un **plan de référence** sépare sont **comptés et tus** : le plan
est un écran, et c'est la raison d'être de l'empilage. Un manque qu'on ne voit
pas ne penche d'aucun côté ; un manque qu'on voit penche du côté rassurant, et
il faut le dire.

Aller plus loin demande, pour le couplage entre couches, un solveur de section
à **conducteurs empilés**, ou le moteur 2,5D, qui discrétise une surface et non
une section droite.

Ce bloc est rendu par le serveur et apparaît en dernier sous chaque fiche : il
clôt la liste des hypothèses.

### Le statut DRC : vert, orange, rouge

Le crosstalk se juge en **pour-cent de l'agresseur**, contre deux seuils : vert
sous **3 %**, orange de 3 à **7 %**, rouge au-delà. Ils se règlent dans la
rangée **Statut DRC** de l'onglet *Crosstalk* — ou dans la vérification de
carte, ce sont les mêmes — et changer un seuil re-juge la fiche sans relancer
le calcul : les niveaux ne dépendent que du cuivre et du front.

### Plusieurs morceaux à la fois : les lots

**Une ligne RF coupée par des composants n'est pas un net, mais quatre.** Trois
condensateurs de liaison, et le cuivre qui doit faire 50 Ω d'un bout à l'autre
arrive en quatre morceaux portant quatre noms de net. `Ctrl`+clic les prenait
déjà — la sélection de l'éditeur est additive depuis toujours — mais ils
partaient dans un seul document, où le serveur voyait une liaison rompue et
refusait la cascade.

Le panneau découpe donc la sélection en **lots** — un lot = un parcours continu,
du cuivre qui se touche sur un seul net — et calcule chacun séparément :

* un **tableau de synthèse** en tête de la fiche, une ligne par lot : longueur,
  Z₀ minimale et maximale, moyenne, nombre de sections hors tolérance, et le
  verdict d'ensemble au-dessus — « 4 morceaux, tous dans la tolérance » ;
* un **clic sur une ligne** déplie la fiche complète de ce lot ;
* la **carte peint tous les lots**, chacun marqué de son numéro ;
* le **`.csv`** les exporte tous, avec une colonne `lot` ; le `.s2p` et le
  `.json` sont ceux du lot déplié, et leur nom porte son numéro.

**Pourquoi séparément et non bout à bout.** La mise en cascade suppose que la
sortie d'un tronçon soit l'entrée du suivant. Entre deux lots il y a un
condensateur, une résistance, un connecteur — dont ce panneau ne sait rien.
Les additionner rendrait un S₂₁ qui aurait l'air d'être celui de la ligne
entière en ignorant les composants.

**Un parcours continu reste un seul lot**, par le chemin exact d'avant : les
trois gestes du tableau ci-dessus ne changent pas de comportement. Au-delà de
seize lots — un `Ctrl+A`, un lasso sur la carte entière — tout repart dans un
seul document, et la note dit que la comparaison n'a pas eu lieu.

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
Ses limites sont dans `docs/HISTORIQUE_DEVELOPPEMENT.md`, section *« Ce que la
masse coplanaire suppose »* : un via borgne qui n'atteint pas le plan compte quand même, et le
couloir de 2 mm est fixe plutôt que déduit de la hauteur au plan.

### Ce que ça vaut

Ce n'est pas une formule de plus : c'est un calcul de champ sur la section, qui
converge quand on raffine. Il est vérifié contre des étalons extérieurs, et le
banc d'essai le refait à chaque exécution
(`../python/test/banc-ligne-mom.py`) :

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
d'accord : *Pas de grille* dans le menu *Affichage*, sous *Grille*, et le
panneau *Règles*. Les deux passent par `setGridStep()`, dans `js/05-tools.js`. Des millimètres ronds
d'abord — 0,05 · 0,1 · 0,25 · 0,5 · 1 · 2 · 5 mm — plus les deux pas impériaux
dont on ne peut pas se passer : 1,27 et 2,54 mm (0,05 et 0,1 pouce),
l'écartement des broches de la plupart des boîtiers traversants.

**Un boîtier tiré pose son centre sur la grille.** Toutes les empreintes ont
leur origine au centre de leur corps (LIB et boîtiers intégrés : un essai le
vérifie). Saisi par son corps ou une pastille, un boîtier n'avance donc pas d'un
nombre entier de pas : c'est son centre qui va au nœud le plus proche
(`drag.anc`, `js/05-tools.js`). Avant, un boîtier rangé hors grille par le
placement automatique gardait son décalage, et deux 0402 identiques ne
s'alignaient jamais. Un clic qui tremble de moins de 3 px ne recale rien.

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
exécute `dist/pcb.js` et couvre : import de netlist, boîtiers nommés
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
entière au Maj+clic et de toutes ses couches au doublé, découpage de la
sélection en lots — un par parcours continu, calculé séparément, avec le repli
et sa note au-delà du plafond —, presse-papier
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
- Gestionnaire de contraintes : le moignon d'un via se compte en épaisseur
  d'empilage, contre-perçage déduit ; les contraintes de classe
  ne se saisissent que dans le PCB.
- Plans (Draftsman) : les cotes à la main sont linéaires (horizontale,
  verticale, alignée), de diamètre ou de rayon — ni cote angulaire, ni cote
  en chaîne ou depuis une origine commune, ni tolérance portée sur la
  cote. Une vue déplacée
  ne repousse pas les autres (elle peut les recouvrir), et une vue de détail
  ne se pose que sur la feuille de sa vue mère. Ni export DXF. Le texte est
  en Helvetica standard (non embarquée) : un lecteur la remplace par une
  fonte équivalente.
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
- Le contrôle des vias borgnes et enterrés suppose un pressage unique. Un
  empilage à laminage séquentiel est signalé comme tel, mais sa séquence ne se
  décrit pas : il n'y a qu'une liste de diélectriques, pas de sous-ensembles.
