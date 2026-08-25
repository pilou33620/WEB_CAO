# À faire

Ce qui manque pour que la chaîne soit un outil convenable. Un titre = une
tâche ; le corps dit ce qui existe déjà et où, pour ne pas repartir de zéro.

Ce qui est *assumé* comme absent — auto-routeur, serpentin d'appariement,
sauvegarde disque automatique — n'est pas ici : c'est dans les « Limites
connues » de [editeur-pcb/README.md](editeur-pcb/README.md#limites-connues).

Ce qui en sort est retiré d'ici et documenté là où il vit. **Fait :** l'outil de
mesure et la recherche par repère, dans les deux éditeurs
(`commun/reperage.js`).

## Fabrication

### Un fichier Excellon par portée de via

Excellon unique alors que les vias borgnes existent. `drillFile()`
([editeur-pcb/js/04-fabrication.js:353](editeur-pcb/js/04-fabrication.js:353))
parcourt `S.vias` et ignore complètement le span `v.a`/`v.b`. Tous les trous
atterrissent dans un seul `.TXT` « percage metallise (PTH) ». Sur une 4 couches
avec un via borgne 1-2, le fabricant perce de part en part.

Le DRC, lui, sait parfaitement distinguer borgne / enterré / traversant
(`viaBuild`, [editeur-pcb/js/01-core.js:302](editeur-pcb/js/01-core.js:302)) —
c'est juste l'export qui n'a pas suivi. Il faut un fichier par portée
(`carte-1-2.TXT`, `carte-1-4.TXT`…).

C'est un défaut de fabrication silencieux, pas un manque de fonction : une
carte multicouche exportée aujourd'hui part fausse chez le fabricant.

### Fichier de placement et nomenclature côté PCB

Pas de fichier de placement ni de BOM côté PCB. L'assemblage (JLCPCB, PCBA en
général) demande un `positions.csv` — repère, valeur, empreinte, X, Y,
rotation, face — et un `bom.csv`.

Toutes les données sont dans `S.fps`, c'est un export à écrire, pas une
fonction à inventer. Les deux fichiers rejoignent l'archive de
`buildFabFiles()`
([editeur-pcb/js/04-fabrication.js:513](editeur-pcb/js/04-fabrication.js:513)).

## Les deux éditeurs

### Cross-probing schéma ↔ PCB

Pas de cross-probing schéma ↔ PCB. La session transporte les deux documents
mais rien ne relie « ce R1 » à « ce R1 ».

Le transport existe déjà (`commun/session.js`) ; ce qui manque, c'est le lien
de sélection dans les deux sens.

## Éditeur schématique

### Bus et feuilles hiérarchiques

Pas de bus ni de feuilles hiérarchiques — un `D0..D7` se tire à huit fils. Les
nets globaux couvrent le multi-feuille, c'est un demi-lot.
