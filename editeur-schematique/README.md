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
├── js/                           17 modules, chargés dans l'ordre numéroté
├── outils/
│   └── build-monofichier.py      recompose un HTML unique dans dist/
└── dist/
    └── editeur-schematique.html  version un-seul-fichier (générée)
```

## Les modules

| Fichier | Lignes | Rôle |
|---|---:|---|
| `js/01-noyau.js` | 83 | Constantes de style (couleurs, pas de grille) et helpers de dessin (`L`, `P`, `RR`, `CIR`, `TXT`…) |
| `js/02-bibliotheque.js` | 186 | `LIB` : définition et tracé de chaque symbole, plus `CATS` |
| `js/03-boitiers.js` | 128 | `PKG_BASES`, nommage et filtrage des empreintes, accès sûr à la bibliothèque (`defOf`) |
| `js/04-etat.js` | 142 | `S` (état global), sélection mixte, canvas, géométrie des symboles et des broches |
| `js/05-feuilles.js` | 137 | Feuilles et onglets, historique undo/redo, `addComp` / `nextRef` |
| `js/06-rendu-fond.js` | 74 | Cadrage, conversions monde↔écran, grille, fils, cache des jonctions |
| `js/07-connectivite.js` | 318 | Découpe automatique des segments + extraction des nets (feuille et document) |
| `js/08-rendu-schema.js` | 188 | Jonctions, halo de net, étiquettes, symboles, sélection, boucle `draw()` |
| `js/09-interaction.js` | 443 | Souris/tactile : pose, tracé de fils, glisser, sondes, marquee, zoom, pan |
| `js/10-actions.js` | 112 | Pivoter, miroir, dupliquer, supprimer, recadrer, changement de mode |
| `js/11-palette.js` | 52 | Icônes de la bibliothèque et construction du panneau de gauche |
| `js/12-panneaux.js` | 451 | Propriétés, champ boîtier, nomenclature, liste des nets |
| `js/13-fichiers.js` | 153 | Export JSON, PNG, netlist `.txt`, nomenclature `.csv` |
| `js/14-clavier-boutons.js` | 81 | Raccourcis clavier et branchement de la barre d'outils |
| `js/15-import.js` | 137 | Import JSON défensif (normalisation) + sauvegarde automatique |
| `js/16-demo.js` | 61 | Schéma de démonstration des deux feuilles |
| `js/17-demarrage.js` | 24 | Séquence de démarrage — **point d'entrée**, toujours en dernier |

## Deux règles à respecter

**1. L'ordre des `<script>` compte.** Ce sont des scripts classiques, pas des
modules ES : tout le code partage la même portée globale, exactement comme
avant. Les déclarations `const` / `let` de premier niveau (`G`, `LIB`, `S`,
`cv`…) doivent être évaluées avant d'être lues, et `17-demarrage.js` doit
rester le dernier. Ajouter un module = ajouter une balise `<script>` à la
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

Recopie le CSS et les 17 scripts dans un HTML autonome, sans minification ni
transformation. Pratique pour envoyer l'éditeur par mail ou l'archiver ; le
développement reste sur les fichiers séparés.

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
