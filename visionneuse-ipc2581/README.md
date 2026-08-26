# Visionneuse IPC-2581 — organisation des fichiers

Quatrième outil du dépôt : ouvrir une carte au format **IPC-2581** et la
regarder — empilage, cuivre, plans, perçages, pastilles, composants et nets,
couche par couche.

IPC-2581 est le format d'échange qui décrit une carte entière dans un seul
fichier XML : c'est ce que livre un fabricant, et ce qu'on reçoit d'un bureau
d'études qui ne travaille pas sur le même outil. Cette page le lit et l'affiche.
Elle ne modifie rien — ce n'est pas un éditeur, et rien de ce qui s'y passe ne
touche le fichier.

Comme la recherche de composants, **cette page a besoin d'un serveur**, et pour
une raison précise : le parseur IPC-2581 est en Python (`../ipc2581_parser.py`),
un navigateur ne peut pas l'exécuter. La page envoie le fichier à
`../serveur.py`, qui renvoie le modèle traduit en JSON — et à partir de là, tout
se passe dans le navigateur.

Ce modèle JSON s'exporte (« Exporter .json ») et se rouvre ici **sans serveur**,
en double-clic : de quoi archiver une carte lue à un instant donné, ou la
consulter sur une machine sans Python.

```
visionneuse-ipc2581/
├── visionneuse-ipc2581.html      structure de la page + ordre de chargement
├── css/
│   └── visionneuse.css           thème « dashboard nocturne »
└── js/                           7 modules, chargés dans l'ordre numéroté
```

Côté Python, trois fichiers à la racine du dépôt :

```
../ipc2581_data.py                le modèle : Point, Track, Pad, Component…
../ipc2581_parser.py              le parseur XML -> IPCDesign
../ipc2581_json.py                IPCDesign -> JSON compact pour cette page
```

et quatre du dossier partagé, identiques aux autres outils :

```
../commun/workspace.css           habillage de l'espace de travail
../commun/workspace.js            panneaux détachables, paramétré par WS_CONFIG
../commun/session.css             habillage des boutons de navigation
../commun/session.js              contexte conservé en changeant d'outil
../commun/profils.js              réglages d'affichage propres à l'utilisateur
```

## Les modules

| Fichier | Lignes | Rôle |
|---|---:|---|
| `js/00-espace-config.js` | 25 | `WS_CONFIG` : clé de stockage local et disposition d'usine des cinq panneaux |
| `js/01-api.js` | 121 | Découverte du serveur (origine courante, secours en 8000), envoi du fichier à `/api/ipc2581`, relecture d'un `.json` déjà traduit |
| `../ipc2581_json.py` | 419 | Traduction `IPCDesign` → dictionnaire JSON : couches et nets deviennent des index, les polygones des tableaux plats. Ouvre aussi les archives `.zip` |
| `js/02-modele.js` | 804 | Table des couches et couleurs, rangement par couche et par net, placement des pastilles, assemblage des `Path2D`, et la ligne de transmission (impédance, retard, capacité, self) |
| `js/03-rendu.js` | 374 | Canevas : repère écran/monde, ordre de dessin, couches, perçages, textes, mise en évidence, règle d'échelle |
| `js/04-interaction.js` | 302 | Déplacement, zoom, pincement à deux doigts, désignation (piste, pastille, perçage, boîtier), clavier |
| `js/05-panneaux.js` | 505 | Les cinq panneaux : couches, la carte, nets, composants, sélection — et la fiche de ligne de transmission |
| `js/06-demarrage.js` | 266 | Ouverture d'un fichier (bouton, dépôt, reprise de session), exports `.json` et `.png`, réglages de l'utilisateur |

## Démarrage

```bash
python serveur.py
```

puis, depuis la page d'accueil, « Visionneuse IPC-2581 ». Le fichier se choisit
au bouton ou se dépose n'importe où sur la page.

Formats acceptés : `.xml`, `.cvg`, `.ipc`, `.ipc2581`, l'archive `.zip` qui en
contient un — c'est souvent sous cette forme qu'arrive un dossier de
fabrication — et le `.json` exporté depuis cette page.

## Ce qu'on voit, et comment

**Les couches** sont dans le panneau de gauche, dans l'ordre de l'empilage. Un
clic en montre ou en cache une. Le cuivre du dessus est rouge, celui du dessous
bleu, les internes prennent la suite de la palette ; sérigraphie, masque et
contour se reconnaissent à leur nom dans le fichier. En tête du panneau,
*Tout*, *Rien* et *Cuivre seul* les allument ou les éteignent d'un coup.

La rangée de boutons juste au-dessus commande ce qu'on dessine, non plus par
couche mais par **nature d'objet** : plans, pistes, pastilles, perçages, textes,
boîtiers, repères, contour. Un plan de masse couvre tout — c'est en le coupant
qu'on voit ce qu'il y a dessous.

**Se retourner** (`B`) regarde la carte par en dessous : la pile de couches
s'inverse et l'image est en miroir, comme quand on retourne la carte dans la
main.

**Désigner** — un clic sur une piste, un plan, une pastille ou un via met son
net en évidence et remplit le panneau « Sélection » ; un clic sur un boîtier
ouvre sa fiche, avec la liste de ses broches et le net de chacune. Les listes
« Nets » et « Composants » mènent au même endroit, avec un filtre. Ce qu'on
désigne est cherché dans le cuivre d'abord, de la couche du dessus vers celle
du dessous : masque et pâte se superposent au cuivre partout, et c'est la
piste qu'on vise, pas le vernis qui la couvre.

**Un plan de masse ou d'alimentation se désigne comme le reste**, en cliquant
dessus. Sa fiche donne son net, sa couche, son aire de cuivre et le nombre de
ses découpes. Le vide au milieu d'un dégagement n'est pas du cuivre : y
cliquer ne désigne pas le plan, mais ce qu'il y a dessous.

**Et `Maj` décide jusqu'où va la mise en évidence.** Un net traverse la carte :
le montrer en entier répond à « où va ce signal », le montrer sur la seule
couche cliquée répond à « qu'est-ce qui court ici ». Les deux questions se
posent, et le geste choisit — le clic seul reste sur la couche visée, `Maj`
tenue suit le net partout où il passe.

Un via ne suit pas la même règle, parce qu'on ne lui pose pas la même
question : le clic seul ne montre que lui, `Maj`+clic montre **tous les vias du
même net et rien d'autre**. Y ajouter le cuivre reviendrait à recouvrir la
carte du plan de masse, et à ne plus voir aucun via — c'est pourtant ce qu'on
venait chercher. Viser un via, c'est en pratique viser sa pastille : une
pastille qui a un trou compte donc comme un via, ce qu'elle est.

La fiche du net dit toujours, en clair, ce qui est montré — « Conductor-1 seule
— Maj+clic : toutes les couches ». Un net qui ne s'allume que sur une couche
n'est alors plus un défaut d'affichage, mais la réponse à la question posée.

**Une piste sélectionnée est une ligne de transmission**, et sa fiche le dit à
la suite de la largeur et de la longueur : topologie (microruban ou triplaque),
plan de référence et hauteur au plan, permittivité du stratifié puis
permittivité effective, impédance Z₀, retard et retard par millimètre,
capacité et inductance réparties. Ce sont les chiffres et les formules de
l'éditeur PCB du dépôt — Hammerstad, Wheeler, IPC-2141A — pour que les deux
outils ne racontent pas deux histoires sur la même carte.

**Et `Maj` chiffre le net entier.** La portée commande la fiche comme elle
commande le dessin : le clic seul donne les valeurs du bout de piste cliqué —
sa largeur, sa longueur, son Z₀ —, `Maj`+clic donne celles du net d'un bout à
l'autre. Choisir un net dans la liste revient au même : c'est le net entier
qu'on regarde.

Un net n'est pas fait d'une piste mais de plusieurs, et le tableau le dit :
« Conductor-4 · 1,61 mm en 2 pistes ». C'est ce qui distingue cette fiche de
celle d'un clic simple, qui ne parle que de la piste cliquée — celle de 0,64 mm
qui, à elle seule, ne fait pas les 1,61 mm de sa couche. Le nombre en tête,
lui, est celui de la fiche du net juste au-dessus.

Ce qui s'additionne est additionné : longueur, retard, capacité au plan,
inductance série. **Z₀ ne s'additionne pas** — un net n'a pas une impédance, il
en a une par tronçon, et ce qui est rendu est l'étendue (de tant à tant) avec
la moyenne pondérée par la longueur. Un tableau la détaille par couche et par
largeur, dès qu'il y a plus d'un tronçon ; un net qui court à la même
impédance d'un bout à l'autre n'a rien à détailler et affiche une valeur, sans
tableau.

Le total dit aussi ce qu'il ne contient pas : la longueur qui court sur des
couches absentes de l'empilage, et les arcs — IPC-2581 les décrit à part des
pistes, et leur longueur n'entre nulle part ici.

La différence est dans la provenance : là-bas l'empilage est saisi, ici tout
vient du fichier. Ce qui manque est donc écrit sous le tableau, en jaune —
permittivité absente et remplacée par celle d'un FR-4, épaisseur de cuivre
absente, aucun plan de référence dans l'empilage, triplaque trop dissymétrique
pour la formule. Une valeur calculée sur une hypothèse n'est pas une valeur
lue, et la fiche ne laisse pas les confondre.

**Et ce qui manque se complète.** Le panneau « La carte » porte, sous
« Empilage du calcul », l'empilage tel que le calcul le voit : un conducteur,
le diélectrique qui le sépare du suivant, un conducteur… Chaque épaisseur et
chaque permittivité y est un champ. Ce que le fichier donne s'y lit tel quel ;
ce qu'il tait apparaît en jaune, avec entre parenthèses la valeur qui sera
prise à défaut. Une valeur écrite là vaut aussitôt pour toutes les pistes de la
couche, se distingue en bleu de ce qui vient du fichier, et **suit
l'utilisateur d'une ouverture à l'autre** — un empilage se saisit une fois. Le
pied de page annonce dès l'import ce qui manque, et un lien sous le tableau
oublie les valeurs saisies pour revenir à ce que dit le fichier.

| Geste | Effet |
|---|---|
| Glisser | Déplacer la carte |
| Molette, pincement | Zoomer sur le point visé |
| Clic | Désigner ce qu'il y a dessous, sur sa couche |
| `Maj`+clic | Suivre le net au-delà de la couche cliquée, et le chiffrer en entier |
| Double-clic, `F` | Voir toute la carte |
| `B` | Dessus / dessous |
| `R`, `D`, `P` | Repères, perçages, plans |
| `O` | Ouvrir un fichier |
| `Échap` | Ne plus rien sélectionner |

## Limites connues

**Pas de contour de boîtier.** IPC-2581 décrit les broches d'une empreinte, pas
la silhouette du composant. Le cadre affiché est donc celui de ses pastilles :
un connecteur dont toutes les broches sont sur une rangée apparaît comme une
bande, ce qui est fidèle aux données mais pas au boîtier.

**Hauteur des textes.** Le fichier ne porte pas de hauteur exploitable pour les
textes ; ils sont dessinés à une hauteur de référence (1,2 mm) qui suit le zoom.
La position et l'orientation, elles, sont celles du fichier.

**Les couches d'une pastille sont celles de son padstack**, telles que le
fichier les nomme — le côté du composant n'est pas utilisé pour les deviner. Un
fichier qui décrit un boîtier du dessous avec un padstack ne mentionnant que
`TOP` verra donc ses pastilles sur le dessus. C'est ce que dit le fichier.

**L'impédance suppose la piste centrée entre ses plans.** La formule IPC-2141A
de la triplaque ne connaît que l'écart entre les deux plans, pas la position de
la piste entre eux : sur un empilage 4 couches courant — âme épaisse d'un côté,
préimprégné mince de l'autre — elle sort nettement au-dessus de la réalité. La
fiche le signale dès que les deux hauteurs s'écartent de plus de 40 %. C'est
aussi la limite de l'éditeur PCB, dont les formules sont reprises telles
quelles.

**Une couche est un conducteur si le fichier le déclare** (`layerFunction`), et
un plan de référence s'il annonce `PLANE`, `POWER` ou `GROUND`. À défaut, c'est
le cuivre réellement posé qui tranche : une zone pleine couvrant au moins 40 %
de la carte est tenue pour un plan. Un fichier sans `layerFunction` et sans
zone pleine n'a donc pas de plan, et la fiche affiche « aucun plan » plutôt
qu'une impédance inventée.

**La permittivité vient du fichier quand il la donne.** Elle ne vit jamais sur
la couche d'empilage elle-même : IPC-2581 la range dans une `<Spec>` que la
couche désigne par un `<SpecRef>`, sous `<Content>` ou sous
`<Ecad><CadHeader>`, et sous deux écritures — l'attribut direct, ou la forme
`type` + `<Property>` :

```xml
<Spec name="DielectricLayer-1-2_Dielectric">
 <Dielectric type="DIELECTRIC_CONSTANT">
  <Property value="4.37"/>
```

Le parseur lit les deux emplacements et les deux écritures depuis la version
1.70 — avant, un fichier parfaitement renseigné ressortait sans le moindre Dk.
Reste que tous les outils n'écrivent pas ces spécifications : c'est à cela que
sert la saisie du panneau « La carte ».

Pour voir ce qu'un fichier donne vraiment, sans passer par le navigateur :

```bash
python ipc2581_json.py votre-carte.xml
```

La sortie liste l'empilage couche par couche — type, épaisseur, Dk, Df,
matériau — et marque d'un `?` ce que le fichier ne dit pas.

**Un plan de référence peut n'être déclaré nulle part.** Beaucoup de fichiers
annoncent toutes leurs couches de cuivre en `SIGNAL`, y compris celles qui
portent un plan de masse. C'est alors le cuivre posé qui tranche, et la fiche
d'une piste écrit le taux de couverture à côté du nom du plan — « Conductor-2
(80 % de cuivre) » — pour qu'on puisse juger de l'assimilation.

**Les plans d'une même couche sont remplis d'un seul tenant** (règle du
pair-impair), ce qui est exact pour un plan et ses découpes. Deux plans qui se
chevauchent sur la même couche — cas rare et déjà douteux dans le fichier —
laisseraient un vide à leur intersection.
