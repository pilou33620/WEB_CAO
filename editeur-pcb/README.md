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
js/01-core.js            état, empilage, repères, empreintes, nets, classes, contour
js/02-connectivity.js    union-find, îlots de cuivre, chevelu, DRC, netlist, placement
js/03-render.js          canevas, ordre des couches, remplissage des zones, calques
js/04-fabrication.js     masque et pâte, Gerber RS-274X, Excellon, archive ZIP
js/05-tools.js           historique, sélection, tracé, zones, contour, souris, clavier
js/06-panels.js          onglets de couches, listes, règles, propriétés
js/07-app.js             fichiers, câblage des boutons, initialisation
outils/build-monofichier.py assemble le tout dans dist/
test/harness.js          banc d'essai sans navigateur
```

## L'ordre de chargement compte

Les sept scripts partagent une seule portée globale ; les `const` de haut
niveau d'un fichier sont visibles des suivants, mais **pas** des précédents au
moment où ils s'exécutent. La règle pratique :

1. `01-core` déclare `S`, l'état commun. Rien avant lui.
2. `03-render` récupère le canevas (`cv`, `ctx`) : il lui faut le DOM, d'où les
   scripts en fin de `<body>`.
3. `05-tools` pose les écouteurs sur `cv` : il vient donc après `03-render`.
4. `07-app` appelle `init()` en dernière ligne, quand tout est défini.

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

## Banc d'essai

```
python3 outils/build-monofichier.py && node test/harness.js
```

Le banc reconstruit un DOM minimal, exécute `dist/pcb.js` et couvre 50 cas :
import de netlist, chevelu multicouche, vias, îlots de cuivre, classes de net,
édition des pistes, contour libre, origine utilisateur, saisie au clavier,
anti-collision, Gerber, Excellon et archive ZIP.

Installer `canvas` (`npm i canvas`) est facultatif mais recommandé : sans lui,
les essais qui rasterisent réellement le cuivre sont ignorés.

## Limites connues

- Pas de bibliothèque d'empreintes : les pastilles sont paramétriques.
- Ni trous non métallisés, ni pastilles libres, ni texte de sérigraphie libre.
- Pas d'arcs : pistes, zones et contour sont faits de segments.
- Pas de copier/coller, pas de sauvegarde automatique.
