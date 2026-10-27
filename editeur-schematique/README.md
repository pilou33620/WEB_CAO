# Éditeur schématique — organisation des fichiers

Découpage de `editeur-schematique.html` (2 948 lignes en un seul bloc) en
modules séparés. **Le code JavaScript et le CSS sont recopiés à l'identique,
ligne pour ligne** : aucune fonction renommée, aucun comportement modifié,
aucune fonctionnalité retirée (à l'époque du découpage : l'éditeur a beaucoup évolué depuis).

```
editeur-schematique/
├── editeur-schematique.html      structure de la page + ordre de chargement
├── css/
│   └── editeur.css               thème « dashboard nocturne »
├── js/                           30 modules (00 à 29), chargés dans l'ordre numéroté
├── outils/
│   └── build-monofichier.py      recompose un HTML unique dans dist/
├── test/
│   └── harness.js                banc d'essai sans navigateur
└── dist/
    ├── editeur-schematique.html  version un-seul-fichier (générée)
    └── schema.js                 bundle JavaScript seul (banc d'essai)
```

Ces fichiers viennent du dossier partagé, à la racine du dépôt, et sont
identiques pour l'éditeur PCB :

```
../commun/echappe.js             esc() : échappement HTML, chargé en premier
../commun/csv.js                 lecture de LIB_composants.csv (avec la Gestion LIB)
../commun/workspace.css          habillage de l'espace de travail
../commun/workspace.js           panneaux détachables, paramétré par WS_CONFIG
../commun/session.css            habillage des boutons de navigation
../commun/session.js             travail conservé en changeant d'outil (session d'onglet)
../commun/profils.css            habillage du bouton d'utilisateur et de son menu
../commun/profils.js             profils : panneaux et réglages par utilisateur,
                                 dans profils/<nom>.json
../commun/reperage.css           habillage de la boîte de recherche
../commun/reperage.js            chercher un repère, mesurer une distance —
                                 paramétré par l'adaptateur de js/21-reperage.js
../commun/test/dom-stub.js       DOM minimal du banc d'essai
../commun/outils/monofichier.py  mécanique d'assemblage
```

## Les modules

| Fichier | Lignes | Rôle |
|---|---:|---|
| `js/00-espace-config.js` | 22 | `WS_CONFIG` : clé de stockage local et disposition d'usine des panneaux, lus par `../commun/workspace.js` |
| `js/01-noyau.js` | 103 | Constantes de style (couleurs, pas de grille) et helpers de dessin (`L`, `P`, `RR`, `CIR`, `TXT`…) |
| `js/02-bibliotheque.js` | 348 | `LIB` : définition et tracé de chaque symbole, plus `CATS` |
| `js/03-boitiers.js` | 155 | `PKG_BASES`, nommage et filtrage des empreintes, accès sûr à la bibliothèque (`defOf`) |
| `js/04-etat.js` | 370 | `S` (état global), sélection mixte, canvas, géométrie des symboles et des broches (rectangle, carré, disposition libre) |
| `js/05-feuilles.js` | 470 | Feuilles et onglets, blocs hiérarchiques, cartouche, historique undo/redo, `addComp` / `nextRef` |
| `js/06-rendu-fond.js` | 128 | Cadrage, conversions monde↔écran, grille et son échelle en millimètres, fils, cache des jonctions |
| `js/07-connectivite.js` | 582 | Découpe automatique des segments + extraction des nets (feuille et document) |
| `js/08-rendu-schema.js` | 664 | Jonctions, halo de net, étiquettes, symboles, sélection, boucle `draw()` |
| `js/09-interaction.js` | 1114 | Souris/tactile : pose, tracé de fils et de bus, glisser, sondes, marquee, zoom, pan, fenêtre de piquage de bus |
| `js/10-actions.js` | 376 | Pivoter, miroir, dupliquer, supprimer, recadrer, pas de grille, presse-papier (copier/couper/coller), changement de mode |
| `js/11-palette.js` | 52 | Icônes de la bibliothèque et construction du panneau de gauche |
| `js/12-panneaux.js` | 1066 | Propriétés, champ boîtier, nomenclature, liste des nets, menu du bouton Trait |
| `js/13-fichiers.js` | 686 | Export JSON, PNG, netlist `.txt`, nomenclature `.csv` et `.xlsx` (format BOM : onglets Presentation, History, BOM) |
| `js/14-clavier-boutons.js` | 213 | Raccourcis clavier et branchement de la barre d'outils |
| `js/15-import.js` | 349 | Import JSON défensif (normalisation), sauvegarde automatique (brouillon) et reprise de la session d'onglet (`sessionSchema`) |
| `js/16-demo.js` | 462 | Les deux schémas d'exemple (« Interface IoT & Bus Haute Vitesse — 4 couches », « Commande 12 V — 2 couches »), la fenêtre **Fichier → Exemples…** ; le premier sert de démonstration au démarrage sans projet |
| `js/17-demarrage.js` | 94 | Séquence de démarrage des données et de l'affichage, puis reprise du travail laissé dans l'onglet |
| `js/18-csv.js` | 90 | Bibliothèque `LIB_composants.csv` : chargement HTTP ou manuel (la lecture du fichier est dans `../commun/csv.js`) |
| `js/19-broches.js` | 406 | Fenêtre **Édition du composant** (`ceOpen`, ouverte par double-clic) ; retouches du brochage (`icSetCount`, `icSetShape`, `icSetBody`, `icMovePin`) : nombre de broches, représentation, taille du corps, placement des pattes à la grille |
| `js/20-profil.js` | 83 | Réglages d'affichage rangés dans le profil de l'utilisateur : grille, étiquettes de net, onglet de liste |
| `js/21-reperage.js` | 223 | Ce que la recherche et la mesure valent sur un schéma : aimant sur les broches, cibles de toutes les feuilles, cadrage, cross-probing vers le PCB |
| `js/22-recherche-composants.js` | 1266 | Fenêtre « Enrichissement composant » : recherche JLCPCB puis distributeurs (Mouser/DigiKey), brochage officiel et vérification du câblage |
| `js/23-patterns.js` | 450 | Reconnaissance des motifs de circuits, estimation des courants DC et pont vers le placement/DRC PCB |
| `js/24-lib-sync.js` | 277 | Synchronisation et alertes avec Gestion LIB |
| `js/25-brochage.js` | 412 | Brochage par référence : broche du symbole → patte de l'empreinte (`el.pinMap`), parties d'un composant multiple (`U3A`, `U3B`), choix de la référence, contrôle du brochage |
| `../commun/brochage.js` | 158 | Lecture de la colonne « Brochage » de `LIB_composants.csv`, partagée avec Gestion LIB |
| `js/26-variantes.js` | 302 | Variantes de montage : fenêtre des variantes, choix dans la nomenclature, section du panneau Propriétés, non-montés barrés sur la feuille |
| `js/27-contraintes.js` | 290 | Contraintes de nets pour le PCB : fenêtre (Outils → Contraintes de nets…), section du panneau Propriétés d'un net, groupes d'appariement |
| `js/28-dessin-pilote.js` | 554 | Dessin par Claude : les cartes d'opérations (poser, fil, relier, étiqueter, feuille…) appliquées par le canal de pilotage, 40 opérations au plus |
| `js/29-symboles-lib.js` | 136 | Symboles de la LIB (fichiers `schsym-1`) : lus au chargement du catalogue, ajoutés à `LIB`, recopiés dans le document (`S.symboles`) |
| `../commun/variantes.js` | 147 | Le modèle des variantes de montage, partagé avec le PCB — **chargé avant `js/`** |
| `../commun/contraintes.js` | 109 | Ce qu'est une contrainte de net et un groupe d'appariement, et comment se lit une saisie : les mêmes bornes que le PCB — **chargé avant `js/`** |
| `../commun/reperage.js` | 290 | Chercher un repère, mesurer une distance — le geste, partagé avec l'éditeur PCB et paramétré par l'adaptateur de `21-reperage.js` |
| `../commun/profils.js` | 567 | Profils utilisateur : qui travaille, ses panneaux, ses réglages, ses derniers documents — **chargé avant `js/`**, avant l'espace de travail qui l'interroge |
| `../commun/session.js` | 502 | Session d'onglet : le schéma part et revient quand on passe au PCB ou à la recherche, et porte le cross-probing entre les deux — **chargé avant `js/`**, juste après `echappe.js` |
| `../commun/workspace.js` | 751 | Espace de travail : docks, panneaux flottants, persistance — chargé **après `js/`** (puis `telephone.js`, `tactile.js`, `menus.js`, `tuto.js` et le pilotage `pilote*.js`) |

## Ce que sait faire l'éditeur, au-delà du tracé

**Sélection multiple.** `Ctrl+clic` (ou `Maj+clic`) ajoute un composant, un
fil, une étiquette à la sélection — et l'en retire au clic suivant. Un lasso
tiré modificateur enfoncé s'ajoute lui aussi à ce qui est déjà pris. Tout ce
qui suit vaut alors pour le groupe entier : déplacement, rotation, miroir,
copier-coller, suppression, `U` pour n'effacer que les fils.

Le groupe se saisit par **n'importe lequel** de ses éléments : un composant, son
libellé, un fil, une étiquette de net. Les poignées — bout de fil, coin de
trait — et le déplacement d'un libellé seul ne passent devant que lorsque
l'élément est **seul** sélectionné. `Ctrl+clic` sur un élément déjà pris ne
l'en retire qu'au relâchement : si le geste glisse, c'est toute la sélection
qui part, lui compris.

**Au stylet**, glisser sur le vide trace le lasso, comme à la souris ; le doigt, lui, déplace la vue.
**Au doigt**, la commande **Multi** de la roulette tactile (groupe *Sélection*) tient lieu de `Ctrl` :
enclenché, chaque toucher ajoute un élément à la sélection ou l'en retire, et
glisser sur le vide trace un lasso au lieu de déplacer la vue (deux doigts la
déplacent toujours). Glisser ensuite l'un des éléments pris emmène le groupe.

**Le schéma attend le retour quand on change d'outil.** Les boutons *Éditeur
PCB*, *Composants* et *Accueil* mettent le document de côté dans la session de
l'onglet avant de changer de page (`commun/session.js`), et `sessionSchema()`
le reprend à l'arrivée : feuilles, fils, cadrage, feuille courante et état
« modifié ». Aller vérifier une empreinte sur le PCB, puis revenir, ne coûte
plus rien — et le va-et-vient peut se répéter autant qu'on veut.

Deux filets se superposent alors, et ils ne servent pas à la même chose. La
session de l'onglet vient du même travail, poursuivi il y a quelques secondes :
elle se reprend sans rien demander. La sauvegarde automatique, elle, vise le
plantage et la fermeture accidentelle : projet ouvert, toutes les 30 s, si le
schéma est modifié et a changé depuis la dernière fois, elle écrit un
**brouillon** à côté du document, `<nom>-SCH.brouillon.json` dans le dossier
du projet (`projdBrouillonTic`, `commun/projet-disque.js` ; route
`/api/projet/doc?brouillon=1`, ou le dossier choisi dans le navigateur). Ce
fichier est ignoré par git (`.gitignore` de PROJETS), sans netlist, et
*Enregistrer .json* l'efface. À la réouverture du projet, un brouillon plus
récent que le document est proposé (confirmation) : repris, le schéma reste
« modifié » ; refusé, il reste jusqu'au prochain enregistrement (rien ne se
propose si le schéma a été modifié pendant la lecture). Au démarrage la session passe
d'abord, et sans rien demander ; le brouillon ne sert qu'à défaut. Rien n'est
gardé dans le navigateur : le disque fait foi. Sans projet ouvert (version
téléchargement), pas de brouillon : l'avertissement de fermeture reste le seul
filet, et il reste posé sur tout schéma modifié.

Ctrl étant pris, le **détachement** du câblage est passé sur `Alt+glisser`.
Alt garde ses deux usages sans qu'ils se gênent : sur le vide il déplace la vue
(comme le bouton du milieu), sur un élément il détache. Le partage se fait dans
`pointerdown`, qui ne prend le geste de déplacement de vue que si le pointeur
ne survole rien.

**Fils en équerre au déplacement.** Un symbole déplacé (à la souris, au stylet
ou aux flèches) emmène ses fils sans jamais les mettre en biais : si l'autre
bout du fil est un coude libre, le coude glisse avec le symbole et le fil
voisin s'allonge ; sinon un décroché en Z rattrape l'écart. `Alt+glisser`
garde l'étirement libre.

**Presse-papier.** `Ctrl+C` / `Ctrl+X` / `Ctrl+V`, ou les boutons *Copier* et
*Coller*. Le bloc copié est rangé relativement à son coin haut-gauche puis
reposé sous le pointeur ; les composants reçoivent un repère libre (coller deux
fois ne crée pas deux `R1`) et les fils gardent leur nom de net. La copie passe
aussi par le stockage local : on peut coller sur une autre feuille, après un
rechargement, ou dans un autre onglet. Ce qui en ressort repasse par
`normComp()` / `normWire()`, comme un fichier importé.

**Effacer le câblage seul.** `U`, ou le bouton *Supprimer les fils*. Un lasso
prend tout — composants et fils ; `U` vide le câblage de la sélection et laisse
les symboles en place, et sélectionnés, prêts à être recâblés autrement. Sans
fil dans la sélection, rien n'est supprimé : le pied de page le dit plutôt que
d'emporter les composants.

**Brochage** (`js/19-broches.js`). La fenêtre *Édition du composant*
(`ceOpen()` : double-clic sur le composant ou *✎ Détails du composant…*)
règle noms de broches et pattes ; le tracé du symbole se gère dans la Gestion
LIB (l'ancienne fenêtre de brochage, `peOpen()`, a été retirée avec son
bouton). Les retouches `icSetCount`, `icSetShape`, `icSetBody`, `icMovePin`
restent le seul endroit qui touche au brochage — le fil accroché à une patte
déplacée suit. Trois représentations :

| Représentation | Broches |
|---|---|
| Rectangulaire | deux rangées, numérotation DIP/SOIC ; largeur du corps réglable |
| Carrée | quatre côtés, numérotation antihoraire QFP/QFN ; côté réglable |
| Libre | chaque broche est posée à la main (`el.pinPos`), le corps est décrit par `el.icBody` |

Les noms s'impriment dans le corps, à côté du numéro. Sur les côtés haut et bas
ils ne sont écrits que si la broche voisine est assez loin — deux noms
horizontaux à un pas d'écart se chevaucheraient. La valeur ne s'imprime au
centre que si les colonnes de noms lui laissent la place, sinon elle descend
sous le corps.

**Brochage par référence** (`js/25-brochage.js`, `../commun/brochage.js`). Un
symbole générique ne dit que ses broches (AOP : `IN-`, `IN+`, `OUT`, `V+`,
`V-`) ; c'est la référence de la LIB qui sait sur quelle patte du boîtier
chacune tombe, colonne `Brochage` de `LIB_composants.csv` :

| Référence | Brochage |
|---|---|
| MCP6001 (SOT-23-5) | `OUT=1,V-=2,IN+=3,IN-=4,V+=5` |
| LM358 (SOIC-8, deux AOP) | `A:OUT=1,IN-=2,IN+=3\|B:OUT=7,IN-=6,IN+=5\|*:V-=4,V+=8` |
| AMS1117 (SOT-223, languette = OUT) | `GND=1,OUT=2/4,IN=3` |

Choisir la référence (badge « Référence à choisir » de l'inspecteur) recopie
la table sur le composant, `el.pinMap` : la netlist écrit alors la patte, plus
le numéro de broche. Sans table, la broche n va sur la patte n — et un AOP en
SOIC-8 mettait V+ sur la masse du LM358 ; ce cas est signalé. Un composant à
plusieurs parties garde un seul repère (`U3`) et une partie (`el.part`),
affichés `U3A` ; netlist et nomenclature n'y voient qu'un boîtier. Le contrôle
(`brControles()`) relève aussi une alimentation reliée à la masse, une patte
partagée prise par deux nets, une partie posée deux fois ou oubliée.

**Libellés déplaçables.** Le repère et la valeur d'un composant s'attrapent à
la souris et se posent où on veut ; un trait pointillé — le fil de rappel —
relie le texte à son symbole pendant le déplacement et tant que le composant
est sélectionné, pour ne pas l'attribuer au voisin. Double-clic sur le texte,
ou bouton *Replacer les textes*, et il retrouve sa place. Les décalages sont
rangés sur le composant (`el.refOff`, `el.valOff`), en coordonnées monde.

`compTexts()` (`js/08-rendu-schema.js`) est la source unique de ces positions :
le tracé, l'accrochage à la souris et le fil de rappel la partagent, sinon on
attraperait un texte à côté de l'endroit où il s'affiche. Les symboles qui
impriment eux-mêmes leur texte en leur centre (`refIn`, `valIn` — le `R1` d'une
résistance) n'entrent pas dans le lot : le déplacer reviendrait à défaire le
dessin du symbole.

**Étiquettes de net.** Mêmes gestes : glisser pour déplacer, double-clic pour
remettre en place. Le clic sélectionne le net, et le panneau des propriétés
propose alors de **masquer l'étiquette** — un schéma dense n'a pas besoin de
voir tous ses noms. Masquage et déplacement sont rangés sur *tous* les fils du
net (`w.lblHide`, `w.lblOff`) : le fil qui porte l'étiquette est le plus long,
et il peut changer à la prochaine scission. Une étiquette déplacée garde un
trait de rappel vers son fil.

**Contacts broche à broche.** Deux composants mis bout à bout, broche contre
broche, sont reliés sans qu'aucun fil ne soit tracé — l'extraction des nets les
met dans le même groupe, et un point de jonction rouge le montre. Si l'un des
deux s'en va (glissement, flèches, rotation), la liaison n'est pas perdue :
`pinContacts()` relève les contacts avant le mouvement et `reconnectContacts()`
tire un fil en équerre entre les deux broches après coup, comme si on l'avait
posé soi-même.

**Le corps d'un CI s'ajuste à ce qu'il contient.** La valeur s'imprime au
milieu du symbole et les noms de broches en colonnes de part et d'autre :
`icTextHalf()` calcule la largeur qu'il faut pour que tout cela tienne, marges
comprises. Nommer un composant `IRA-S400st01A01` élargit donc son symbole au
lieu de laisser le texte déborder sur les fils voisins. Les broches s'écartent
d'autant — c'est ce qui garde le texte à l'intérieur — et le câblage suit
(`reshapeComp`), de sorte qu'un symbole déjà relié ne se décroche pas. Une
largeur saisie à la main ne fait qu'agrandir davantage ; le bouton *Largeur
automatique* rend la main au calcul.

**Pas de grille et échelle.** Une case de grille vaut **1 mm**. C'est une
convention de dessin, pas une cote de fabrication — un schéma n'a pas d'échelle
physique — mais elle rend tout le reste net : les symboles sont dessinés à ce
pas, les valeurs proposées tombent juste, et une broche est toujours sur une
ligne de la grille.

| Pas offerts | 0,25 · 0,5 · 1 · 2 · 5 mm |
|---|---|
| Broches des symboles | sur le millimètre (multiples de 20 px) |
| Traits des corps | sur le quart de millimètre (multiples de 5 px) |

Le menu est à côté du bouton *Grille*, et le pied de page annonce ce que vaut
une case : `1 carré = 1 mm`. Trop serrée à l'écran, la grille n'est plus tracée
qu'une case sur deux : le pied de page annonce alors la case réellement visible
et rappelle le pas d'accrochage — `1 carré = 2 mm · pas 0,5 mm`. Un essai du
banc parcourt tout le catalogue et vérifie ces deux règles, symbole par
symbole ; l'éditeur PCB, lui, garde ses pas impériaux (1,27 et 2,54 mm), qui
sont des cotes physiques de boîtier.

Changer cette échelle n'a **pas** touché aux documents existants : les
coordonnées sont inchangées, seule la valeur annoncée en millimètres l'est.

**Saisie dans les panneaux.** Le panneau Propriétés se reconstruit à chaque
rafraîchissement ; il rend au champ actif son focus et la position du curseur.
Sans cela, renommer un net revenait à taper une lettre, perdre le champ, et
voir les suivantes prises pour des raccourcis. Le gestionnaire de clavier
regarde en plus `document.activeElement` : un champ de saisie garde ses lettres
pour lui.

**Le boîtier voyage jusqu'au PCB.** Le boîtier choisi dans le panneau
Propriétés n'est pas une donnée de schéma : c'est le lien avec le routage. Il
part donc dans la netlist, troisième colonne de la section `=== Composants ===`,
et c'est lui qui pose l'empreinte à l'import côté PCB — `SOIC-8` y arrive en
deux rangées CMS au pas de 1,27 mm, `TQFP-64` en quatre côtés, `0603` en puce.

Les colonnes sont séparées par **deux espaces au moins** et un champ vide reçoit
un tiret (`nlCol()`, `js/13-fichiers.js`). Ce n'est pas une coquetterie de
présentation : l'éditeur de PCB découpe la ligne sur ces doubles espaces, et
tant que la valeur pouvait laisser sa colonne vide, le boîtier d'un composant
sans valeur — un connecteur, un trou — passait pour une valeur et l'empreinte
importée n'avait plus rien à voir avec celle choisie ici. Les espaces internes
d'une valeur sont réduits à un pour la même raison, une ligne de titre en
commentaire annonce les colonnes, et un essai du banc vérifie le découpage.

**Chercher un repère — `Ctrl+F`.** Un champ, une liste, `Entrée`. On tape
`R1`, `C47` ou un nom de net, et la vue arrive dessus en le sélectionnant. La
recherche **traverse les feuilles** : c'est justement quand `R1` est ailleurs
qu'on le cherche. La ligne annonce alors sa feuille — sans quoi la choisir
ferait sauter la vue sans qu'on comprenne où l'on vient d'atterrir — et y aller
change de feuille avant de sélectionner.

Les nets viennent de `docNets()`, vue document : un net global n'apparaît qu'une
fois pour toutes les feuilles qu'il traverse, et la ligne le dit. Changer de
feuille refait les nets, si bien que l'objet retenu par la ligne n'est plus
celui du document affiché : `rpNetFrais()` le reprend par son premier fil — les
fils, eux, sont les mêmes objets d'un calcul à l'autre — et par le nom pour un
net sans fil.

Le classement va du plus sûr au plus large : ce qu'on a tapé en entier d'abord,
puis ce qui commence par, puis ce qui contient. Taper `R1` met donc `R1` avant
`R10` et `R100`. Un symbole sans repère — une masse, une étiquette de net — ne
figure pas dans la liste : une ligne vide ne mène nulle part.

Le cadrage ne touche à l'échelle que s'il le faut, et c'est le **symbole** qu'il
amène au centre, pas son point d'ancrage : le corps d'un CI ne se dessine pas
autour de son origine, et centrer l'ancre laisserait le symbole à moitié sorti
de l'écran.

**Mesurer — `K`.** Un clic pose le départ, le suivant fige l'arrivée, le
troisième repart d'ailleurs ; `Échap` efface. Les broches attirent le point,
la grille prend le relais hors de leur portée. La cote se lit sur la feuille —
distance, ΔX, ΔY — et le pied de page ajoute l'angle.

Ce que la lecture dit et que le PCB ne dit pas : **une case vaut 1 mm par
convention de dessin, pas par cote de fabrication.** Un schéma n'a pas
d'échelle physique ; la mesure sert à aligner et à espacer, et le rappeler en
toutes lettres évite qu'on prenne le nombre pour une dimension de carte. C'est
la seule différence de fond entre les deux mesures, et elle tient à un booléen
de l'adaptateur (`physique:false`, `js/21-reperage.js`) — tout le reste du
geste est le même code, `../commun/reperage.js`, partagé avec le PCB.

### Classes de nets

Chaque net nommé se classe dans la liste **Nets** du panneau « Nomenclature &
Nets » (colonne *Classe*, sur la feuille ou sur tout le document) et dans le
panneau Propriétés quand on sélectionne un de ses fils. Les quinze classes sont
celles de l'éditeur PCB et de la visionneuse IPC-2581 : Masse, Alimentation,
Horloge, Rapide, RF, Analogique, Antenne, USB FS, USB HS, ETH 100, ETH 1000,
LVDS, CAN, RS-485, Lent. Les sept classes d'interface (USB FS à RS-485,
`../commun/classes-interface.js`) ne se posent qu'à la main, jamais devinées.

- **Auto · …** suit l'analyse du serveur (motifs, broches, composants reliés) ;
  sans serveur, la masse et les alimentations se reconnaissent encore à leur
  nom, le reste est « Lent ».
- Un autre choix est une correction : elle ressort en jaune, part avec le
  document (`netClasses`) et se défait par *Auto*.
- L'éditeur PCB l'applique : en direct s'il est ouvert dans un autre onglet,
  sinon à son ouverture (session de l'onglet, ou copie gardée par projet).
  Sans analyse du serveur, le PCB ne reçoit que les corrections et les
  évidences : un net non cité garde sa classe sur la carte.

Un net sans nom (`N$…`) ne se classe pas : son nom change au moindre fil.

### Variantes de montage (BOM)

Une même carte se monte souvent de plusieurs façons : une version « Lite »
sans le module radio, une version « Pro » sans le connecteur de debug. Le
cuivre est le même ; seule la liste des composants posés change.

- **Fichier → Variantes de montage…** (ou ◫ dans la barre de la nomenclature)
  ouvre la fenêtre : à gauche les variantes (ajouter, au besoin en copiant
  une autre, renommer, supprimer, exporter), à droite une case « monté » par
  composant et par variante, avec un filtre et « tout / rien » par colonne.
- La **carte complète** monte tout. Une variante retire des composants.
- Le **panneau Propriétés** d'un composant donne ses cases ; plusieurs
  composants sélectionnés se posent ou se retirent d'un coup dans la variante
  active.
- La **variante active** se choisit dans la barre de la nomenclature : ses
  non-montés y sont barrés (NM) et voilés d'une croix rouge sur la feuille.
- **Nomenclature .csv** suit la variante active : colonne *Montage*,
  récapitulatif de commande sans les DNP, puis la variante et la liste des
  DNP en fin de fichier. « Exporter la BOM de chaque variante » en sort un
  fichier par variante, carte complète comprise.
- **Nomenclature .xlsx** (menu Fichier) suit aussi la variante active, au
  format BOM maison : onglets *Presentation*, *History* et *BOM*, la carte nue
  (CIP1) en tête, une ligne par repère, les non-montés en rouge
  « [Not Fitted] ». Puissance, tolérance, PPM, tension, diélectrique et
  secondes sources viennent de `LIB_composants.csv` ; « xx » quand ils
  manquent.

Le document garde `variantes: {liste:[{id, nom}], active}` et, sur chaque
composant, `nonMonte: [id…]` : c'est le composant qui porte l'information,
renuméroter les repères ne perd donc rien. Chaque geste s'annule (`Ctrl+Z`),
sauf le choix de la variante active, réglage du document hors historique.
Le PCB reprend ces variantes par repère (voir son README).

### Cross-probing vers le PCB

Un composant sélectionné -- un seul -- ou, à défaut, le net du premier fil
retenu : cliquer *Éditeur PCB* dans l'entête y amène directement sur ce même
repère. Rien de sélectionné, et le bouton fait ce qu'il a toujours fait --
changer de page.

Le mécanisme ne réinvente rien : `schSonde()` (`js/15-import.js`) répond « quoi
chercher », `sessAller()` (`../commun/session.js`) l'écrit dans un second canal
de `sessionStorage`, distinct du document transporté et qui ne survit qu'à une
seule navigation, et `schSonderCible()` (`js/21-reperage.js`) le consomme à
l'arrivée en s'appuyant sur `rpTrouve()` -- la même recherche par repère que
`Ctrl+F`, sur laquelle `schSonderCible()` s'appelle exactement comme
`rpQAller()`.

### Exporter vers le PCB — **⇉ PCB**

Pour une retouche de dernière minute, sans passer par la netlist `.txt` :
`exporterVersPcb()` (`js/13-fichiers.js`) écrit le schéma dans le dossier du
projet, dépose une demande dans `sessionStorage` (`cao.export.pcb.v1`) puis
ouvre l'éditeur PCB dans l'onglet. À son chargement complet,
`pcbExportDepuisSchema()` (`editeur-pcb/js/23-eco-sync.js`) attend le
projet, la carte et la LIB d'empreintes, applique la netlist mise de côté par
la session (`importNetlist`, comme « Importer netlist » : placement et routage
gardés) et écrit la carte dans le projet.

Tout reste **local** : lancé par WEB·SUITE, ni l'export ni « Enregistrer »
(`Ctrl+S`) n'envoient sur GitHub. C'est « ☁ Sauvegarder le projet »
(`Ctrl+Maj+S`) qui le fait, en un seul commit pour tout le projet. Sans
projet ouvert, la carte de l'onglet est mise à jour sans être écrite.

### Montrer sur l'onglet d'à côté — `L`

L'autre façon de travailler : le schéma ici, le PCB dans une seconde fenêtre.
Le bouton **⇱ Montrer au PCB** (touche `L`) fait sauter l'onglet voisin sur le
composant sélectionné, ou sur le net du fil retenu ; celui-ci ne bouge pas.

Sur demande, et non en suivi permanent : un onglet qui saute à chaque clic
d'à côté devient impossible à utiliser. Le transport est un
`BroadcastChannel` (`../commun/session.js`), qui ne dit jamais s'il a été
entendu — l'onglet qui reçoit accuse donc réception, et le pied de page
distingue *montré*, *ce repère n'y est pas*, *aucun onglet ouvert sur le PCB*,
et *ce navigateur ne partage rien entre onglets*. En `file://`, deux onglets
n'ont pas la même origine et le canal n'existe pas : le bouton se désactive au
lieu de disparaître.

## Contraintes de nets pour le PCB

C'est au schéma qu'on sait ce qu'un net doit tenir. **Outils → Contraintes de
nets…** (ou « Contraintes du net… » dans le panneau Propriétés d'un net nommé)
ouvre un tableau des nets nommés du document, où l'on saisit, net par net :

- l'impédance cible et sa tolérance, la longueur min / max, les vias max, les
  couches permises (« 1,4 ») ;
- la topologie (point à point, chaîne, étoile, fly-by) et l'ordre des repères
  le long du net (« U1, U4, U5 », le premier est la source) ;
- le moignon admis, le moignon de via admis, la tolérance d'une étoile ;
- et, en bas, des **groupes d'appariement** : des nets à égaliser en longueur
  (mm) ou en délai (ps), autour du plus long ou d'un net de référence.

La classe du net se choisit dans la même ligne. Le panneau Propriétés d'un net
résume ce qui est réglé (« 50 Ω ± 5 % · L ≤ 40 mm · chaîne R1→R2 »).

Les contraintes vivent dans le document (`contraintes` : `nets` et
`groupes`), s'enregistrent et s'annulent avec lui, et partent au PCB avec lui :
l'export **⇉ PCB**, l'**ECO** (une ligne « Contraintes » dans sa liste) et
l'ouverture du **gestionnaire de contraintes** du PCB les reprennent. Le PCB les
garde à part et les marque « sch » : un champ réglé dans le PCB passe devant
celui du schéma. Les contraintes de classe, l'isolation entre classes et les
largeurs restent au PCB, qui connaît l'empilage. Les bornes sont celles du PCB
(`commun/contraintes.js`, partagé) : une valeur hors bornes est écartée à la
saisie comme à la lecture.

Seuls les nets nommés sont listés : un nom automatique (`N$12`) change d'une
netlist à l'autre et ne désigne rien de stable au PCB. Les contraintes d'un net
renommé ou supprimé ne sont pas effacées d'office : la fenêtre les montre
« à revoir », avec de quoi les effacer.

## Deux règles à respecter

**1. L'ordre des `<script>` compte.** Ce sont des scripts classiques, pas des
modules ES : tout le code partage la même portée globale, exactement comme
avant. Les déclarations `const` / `let` de premier niveau (`G`, `LIB`, `S`,
`cv`…) doivent être évaluées avant d'être lues. `../commun/echappe.js` ouvre la
marche (`esc()`), `../commun/session.js` le suit (il câble les boutons de
navigation de l'entête et déclare `sessBrancher()`), `00-espace-config.js`
ouvre les modules de `js/` (il déclare `WS_CONFIG`) et `../commun/workspace.js`
vient après eux (il s'initialise lui-même), avant `tactile.js`, `menus.js`,
`tuto.js` et le pilotage. Ajouter un module = ajouter une balise `<script>` à la
bonne place dans `editeur-schematique.html`.

**2. Chaque fichier commence par `"use strict";`.** Le mode strict ne se
propage pas d'un script à l'autre ; sans cette ligne, un nouveau module
retomberait en mode permissif et une faute de frappe créerait silencieusement
une variable globale.

Le choix des scripts classiques est délibéré : `type="module"` obligerait à
servir la page par HTTP (les modules sont bloqués en `file://` par la politique
CORS des navigateurs). Là, un double-clic sur le HTML suffit toujours.

## Version un seul fichier

```bash
python3 outils/build-monofichier.py     # -> dist/editeur-schematique.html
```

Recopie le CSS et tous les scripts dans un HTML autonome, sans minification ni
transformation, et écrit à côté `dist/schema.js` — le bundle JavaScript seul,
que charge le banc d'essai. Pratique pour envoyer l'éditeur par mail ou
l'archiver ; le développement reste sur les fichiers séparés.

## Banc d'essai

```bash
python3 outils/build-monofichier.py && node test/harness.js
```

Sans navigateur : découpe automatique des fils, extraction des nets
(union-find, labels, symboles nommants, conflits de noms), nets globaux entre
feuilles, netlist (dont les colonnes qui portent le boîtier jusqu'au PCB) et
nomenclature, analyse du CSV de bibliothèque, espace de
travail, échappement HTML des panneaux face à un fichier malveillant,
presse-papier (copier/couper/coller, contenu invalide), brochage (disposition
libre, câblage qui suit la broche déplacée, cases occupées refusées, corps
élargi, import défensif), pas de grille, libellés déplaçables, étiquettes de
net (déplacement, masquage, survie à une scission), contacts broche à broche
largeur d'un CI ajustée à son texte, le catalogue entier vérifié au pas
(broches au millimètre, traits au quart de millimètre), et le repérage (cote
3-4-5 et son angle, aimant sur la broche, lecture qui annonce la convention de
dessin plutôt qu'une cote, effacement au changement de mode, classement d'un
repère tapé en entier, composant d'une autre feuille qui fait changer de
feuille et arrive centré, net global trouvé et repris frais après le
changement, symbole sans repère écarté de la liste, liste échappée).

Les fonctions d'export ont été scindées pour cela : `netlistText()` et
`bomCsvText()` produisent le texte sans effet de bord, `exportNetlist()` et
`exportBomCsv()` se contentent de l'écrire sur le disque.

## Contrôles effectués sur ce découpage

*(Relevé d'époque : 17 modules et 38 symboles alors ; il y a aujourd'hui 30
modules et 58 symboles dans la palette.)*

- La concaténation des 17 modules est **strictement identique**, octet pour
  octet, au bloc `<script>` d'origine (assertion dans le script de découpe).
- Le CSS et le corps HTML sont des extractions exactes de l'original.
- Chargement réel de la page dans un DOM simulé, avec comparaison des deux
  versions sur : nombre de feuilles, de composants, de fils et de nets ;
  onglets ; palette (38 symboles) ; nomenclature ; liste des nets ; panneau de
  propriétés ; options de boîtier ; rotation/miroir/duplication ; undo/redo ;
  changement de feuille ; modes ; étiquettes de net ; grille ; recadrage ;
  ajout de composant ; aller-retour sérialisation/import ; import d'un fichier
  volontairement corrompu. **Résultats identiques, aucune exception.**
