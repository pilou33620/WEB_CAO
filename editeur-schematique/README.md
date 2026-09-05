# Éditeur schématique — organisation des fichiers

Découpage de `editeur-schematique.html` (2 948 lignes en un seul bloc) en
modules séparés. **Le code JavaScript et le CSS sont recopiés à l'identique,
ligne pour ligne** : aucune fonction renommée, aucun comportement modifié,
aucune fonctionnalité retirée.

```
editeur-schematique/
├── editeur-schematique.html      structure de la page + ordre de chargement
├── css/
│   └── editeur.css               thème « dashboard nocturne »
├── js/                           22 modules, chargés dans l'ordre numéroté
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
| `js/00-espace-config.js` | 21 | `WS_CONFIG` : clé de stockage local et disposition d'usine des panneaux, lus par `../commun/workspace.js` |
| `js/01-noyau.js` | 83 | Constantes de style (couleurs, pas de grille) et helpers de dessin (`L`, `P`, `RR`, `CIR`, `TXT`…) |
| `js/02-bibliotheque.js` | 237 | `LIB` : définition et tracé de chaque symbole, plus `CATS` |
| `js/03-boitiers.js` | 128 | `PKG_BASES`, nommage et filtrage des empreintes, accès sûr à la bibliothèque (`defOf`) |
| `js/04-etat.js` | 245 | `S` (état global), sélection mixte, canvas, géométrie des symboles et des broches (rectangle, carré, disposition libre) |
| `js/05-feuilles.js` | 137 | Feuilles et onglets, historique undo/redo, `addComp` / `nextRef` |
| `js/06-rendu-fond.js` | 110 | Cadrage, conversions monde↔écran, grille et son échelle en millimètres, fils, cache des jonctions |
| `js/07-connectivite.js` | 327 | Découpe automatique des segments + extraction des nets (feuille et document) |
| `js/08-rendu-schema.js` | 189 | Jonctions, halo de net, étiquettes, symboles, sélection, boucle `draw()` |
| `js/09-interaction.js` | 443 | Souris/tactile : pose, tracé de fils, glisser, sondes, marquee, zoom, pan |
| `js/10-actions.js` | 240 | Pivoter, miroir, dupliquer, supprimer, recadrer, pas de grille, presse-papier (copier/couper/coller), changement de mode |
| `js/11-palette.js` | 52 | Icônes de la bibliothèque et construction du panneau de gauche |
| `js/12-panneaux.js` | 561 | Propriétés, champ boîtier, nomenclature, liste des nets |
| `js/13-fichiers.js` | 182 | Export JSON, PNG, netlist `.txt`, nomenclature `.csv` |
| `js/14-clavier-boutons.js` | 105 | Raccourcis clavier et branchement de la barre d'outils |
| `js/15-import.js` | 216 | Import JSON défensif (normalisation), sauvegarde automatique et reprise de la session d'onglet (`sessionSchema`) |
| `js/16-demo.js` | 61 | Schéma de démonstration des deux feuilles |
| `js/17-demarrage.js` | 30 | Séquence de démarrage des données et de l'affichage, puis reprise du travail laissé dans l'onglet |
| `js/18-csv.js` | 108 | Bibliothèque `LIB_composants.csv` : analyse, chargement HTTP ou manuel |
| `js/19-broches.js` | 379 | Éditeur de brochage : nombre de broches, représentation, taille du corps, noms et placement des pattes à la grille |
| `js/20-profil.js` | 83 | Réglages d'affichage rangés dans le profil de l'utilisateur : grille, étiquettes de net, onglet de liste |
| `js/21-reperage.js` | 223 | Ce que la recherche et la mesure valent sur un schéma : aimant sur les broches, cibles de toutes les feuilles, cadrage, cross-probing vers le PCB |
| `js/22-recherche-composants.js` | 215 | Intégration recherche distributeurs (Mouser/DigiKey) et pinouts |
| `js/23-patterns.js` | 135 | Reconnaissance des motifs de circuits, estimation des courants DC et pont vers le placement/DRC PCB |
| `../commun/reperage.js` | 294 | Chercher un repère, mesurer une distance — le geste, partagé avec l'éditeur PCB et paramétré par l'adaptateur de `21-reperage.js` |
| `../commun/profils.js` | 555 | Profils utilisateur : qui travaille, ses panneaux, ses réglages, ses derniers documents — **chargé en premier**, avant l'espace de travail qui l'interroge |
| `../commun/session.js` | 362 | Session d'onglet : le schéma part et revient quand on passe au PCB ou à la recherche, et porte le cross-probing entre les deux — **chargé en premier** |
| `../commun/workspace.js` | 610 | Espace de travail : docks, panneaux flottants, persistance — **chargé en dernier** |

## Ce que sait faire l'éditeur, au-delà du tracé

**Sélection multiple.** `Ctrl+clic` (ou `Maj+clic`) ajoute un composant, un
fil, une étiquette à la sélection — et l'en retire au clic suivant. Un lasso
tiré modificateur enfoncé s'ajoute lui aussi à ce qui est déjà pris. Tout ce
qui suit vaut alors pour le groupe entier : déplacement, rotation, miroir,
copier-coller, suppression, `U` pour n'effacer que les fils.

**Le schéma attend le retour quand on change d'outil.** Les boutons *Éditeur
PCB*, *Composants* et *Accueil* mettent le document de côté dans la session de
l'onglet avant de changer de page (`commun/session.js`), et `sessionSchema()`
le reprend à l'arrivée : feuilles, fils, cadrage, feuille courante et état
« modifié ». Aller vérifier une empreinte sur le PCB, puis revenir, ne coûte
plus rien — et le va-et-vient peut se répéter autant qu'on veut.

Deux filets se superposent alors, et ils ne servent pas à la même chose. La
session de l'onglet vient du même travail, poursuivi il y a quelques secondes :
elle se reprend sans rien demander. La sauvegarde automatique de
`15-import.js`, elle, vise le plantage et la fermeture accidentelle : elle vit
dans le stockage local, peut dater de la veille, et demande donc confirmation.
Au démarrage la session passe d'abord ; la sauvegarde ne sert qu'à défaut.
Aucune des deux ne remplace *Enregistrer .json* : fermer l'onglet efface la
première, et c'est pour cela que l'avertissement de fermeture reste posé sur un
schéma modifié.

Ctrl étant pris, le **détachement** du câblage est passé sur `Alt+glisser`.
Alt garde ses deux usages sans qu'ils se gênent : sur le vide il déplace la vue
(comme le bouton du milieu), sur un élément il détache. Le partage se fait dans
`pointerdown`, qui ne prend le geste de déplacement de vue que si le pointeur
ne survole rien.

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

**Éditeur de brochage** (bouton *Éditer les broches…* du panneau Propriétés, ou
`js/19-broches.js`). Le composant y est représenté avec ses broches : on les
nomme, on règle leur nombre, la taille du corps, et **on déplace chaque patte à
la grille** — le fil qui y était accroché suit. Trois représentations :

| Représentation | Broches |
|---|---|
| Rectangulaire | deux rangées, numérotation DIP/SOIC ; largeur du corps réglable |
| Carrée | quatre côtés, numérotation antihoraire QFP/QFN ; côté réglable |
| Libre | chaque broche est posée à la main (`el.pinPos`), le corps est décrit par `el.icBody` |

`Ctrl+Z` et `Ctrl+Y` agissent aussi la fenêtre ouverte : c'est là qu'on vient
de se tromper. Annuler recharge la feuille et remplace ses composants, celui en
cours de brochage compris — `peReattach()` le reprend par son identifiant, ou
ferme la fenêtre s'il a disparu. `Échap` ferme, et rien d'autre n'agit sur la
feuille pendant ce temps.

Les noms s'impriment dans le corps, à côté du numéro. Sur les côtés haut et bas
ils ne sont écrits que si la broche voisine est assez loin — deux noms
horizontaux à un pas d'écart se chevaucheraient. La valeur ne s'imprime au
centre que si les colonnes de noms lui laissent la place, sinon elle descend
sous le corps. *Ajuster aux noms* élargit le corps juste ce qu'il faut : les
broches s'écartent d'autant, c'est une action volontaire et jamais un effet de
bord de la frappe d'un nom.

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

## Limites connues

- **Bus et hiérarchie :** Pas de bus de signaux (un bus D0..D7 doit être tiré à huit fils individuels) ni de feuilles hiérarchiques (seuls les nets globaux multi-feuilles sont gérés).

## Deux règles à respecter

**1. L'ordre des `<script>` compte.** Ce sont des scripts classiques, pas des
modules ES : tout le code partage la même portée globale, exactement comme
avant. Les déclarations `const` / `let` de premier niveau (`G`, `LIB`, `S`,
`cv`…) doivent être évaluées avant d'être lues. `../commun/session.js` ouvre la
marche (il câble les boutons de navigation de l'entête et déclare
`sessBrancher()`), `00-espace-config.js` le suit (il déclare `WS_CONFIG`) et
`../commun/workspace.js` ferme (il s'initialise lui-même). Ajouter un module = ajouter une balise `<script>` à la
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

75 cas, sans navigateur : découpe automatique des fils, extraction des nets
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
