# Plan : perçages oblongs (module M2)

Source : `SPEC-trous-npth.md`, module M2. M1 est livré (`trousMonde()`,
`holes`). La liste cochable est dans `tasks/todo-trous-oblongs.md`.

## Vue d'ensemble

Un perçage oblong est un perçage rond qui s'allonge. On garde donc `drill`
(et `d` pour un trou NPTH) comme **largeur**, et on ajoute une longueur.
Tout lecteur actuel qui ne connaît pas la fente continue de voir un trou
rond de la largeur : c'est sans danger pour l'affichage, mais faux pour la
fabrication et les distances. Seuls ces lecteurs-là passent par un axe de
perçage commun.

## Ce que le code montre (relevé avant le plan)

| Où | Constat | Conséquence |
|---|---|---|
| Lecteurs de `q.drill` | environ 85 lectures dans 16 fichiers (rendu, contrôles, Excellon, IPC-2581, IPC-356, Draftsman, DXF, méca, PNS, simulation) | on ne les touche pas toutes : ceux qui dépendent de la forme du trou passent par `axePercage` |
| `04-fabrication.js` `drillFile` | `buildOne(name, holes)` prend `{drill, x, y}` ; les pastilles vont dans le fichier traversant (`padDrills`), les NPTH dans `-NPTH.TXT` | une entrée peut porter `x2, y2` : ligne `X..Y..G85X..Y..` |
| Banc « tableau de perçage » et « DXF : un CIRCLE par trou » | comptent les trous du plan et du DXF face à `drillFile().holes` | le tableau de perçage, le DXF et l'Excellon changent **dans la même tâche** (T2) |
| `35-ipc2581-export.js` | révision C, validée contre `IPC-2581C.xsd` quand on le fournit (`banc-ipc2581-export.py --xsd`) | forme de KiCad (`pcb_io_ipc2581.cpp`, `addSlotCavity`) : calque `…SLOT` de fonction `ROUT`, `Set` (net) > `SlotCavity name platingStatus plusTol minusTol` > `Location`, `Xform rotation`, `Oval width height` (width ≥ height) |
| Visionneuse (`ipc2581_parser`) | ne lit pas `SlotCavity` | une fente exportée n'y apparaîtra pas : hors M2, noté (Q2) |
| `24-pcb-capabilities.js` | tables `slots.platedMinW_2layer`, `platedMinW_multilayer`, `platedLengthOverWidthMin`, `nonPlatedMinW` déjà présentes ; anneau `pthAnnularRingMin` | l'audit juge la largeur, l'allongement et l'anneau dans les deux sens |
| `02-connectivity.js` | distances de perçage en `dist(centres) − rayons` | remplacées par la distance entre axes (`segSegDist` existe déjà) moins les demi-largeurs |
| `ipc317` (IPC-D-356) | un diamètre par trou, pas de fente dans le format | la largeur y reste ; noté |

## Décisions d'architecture

- **D1 — Description d'un oblong (question ouverte n° 2 de la spec,
  tranchée).**
  - Trou NPTH (`S.holes` et `holes` d'empreinte) : `{x, y, d, w, rot}`.
    - `d` est la largeur.
    - `w` est la longueur hors tout, et doit être supérieure à `d`, sinon le
      trou reste rond.
    - `rot` est l'angle de la longueur, en degrés.
  - Pastille : `slot` est la longueur hors tout, plus grande que `drill`.
    Elle suit le grand côté de la pastille (x si `w ≥ h`), puis la rotation
    de la pastille.
  - Pourquoi le centre : c'est ce qui tourne, passe en miroir et se déplace
    avec l'empreinte. Les extrémités se calculent.
- **D2 — `axePercage(o)` dans `01-core.js`.**
  - Il prend une pastille de `padsWorld` ou un trou de `trousMonde`, et rend
    `{x1, y1, x2, y2, d}` en coordonnées monde. Pour un trou rond, les deux
    points sont confondus.
  - Le G85, les distances, le dessin et les dégagements l'emploient tous.
  - `trousMonde` passe `rot` au monde : l'angle de l'empreinte s'ajoute, et
    l'angle change de signe face dessous, comme pour une pastille.
- **D3 — Excellon G85.**
  - L'outil est la largeur.
  - Les fentes métallisées vont dans le fichier traversant, les non
    métallisées dans `-NPTH.TXT`.
  - La ligne s'écrit `X<x1>Y<y1>G85X<x2>Y<y2>`, dans le même format de
    coordonnées que les trous.
- **D4 — Ce qui reste rond, et pourquoi.**
  - IPC-D-356 : le format ne sait pas décrire une fente.
  - Simulations (19) et routeur PNS (11) : ils lisent le cuivre, pas le trou.
  - Dossier méca : il reçoit la largeur, plus `l` et `rot` en champs
    facultatifs que `commun/dossier-meca.js` ignore aujourd'hui.

## Phases et tâches

- **Phase 1 : format et axe (T1).**
- **Phase 2 : bout en bout (T2 à T5).**
  - T2 : fichiers de fabrication. C'est la tranche qui fait la valeur.
  - T3 : contrôles et audit fabricant.
  - T4 : dessin et dégagements.
  - T5 : IPC-2581.
- **Phase 3 : Gestion LIB (T6).**
- **Phase 4 : clôture (T7).**

## Graphe des dépendances

```
T1 format + axePercage ─┬─▶ T2 Excellon, tableau de perçage, DXF
                        ├─▶ T3 contrôles, audit fabricant
                        ├─▶ T4 dessin, zones (écran, îlots, Gerber, IPC)
                        └─▶ T5 IPC-2581 SlotCavity
T1 ─▶ T6 Gestion LIB
T2..T6 ─▶ T7 clôture, revue
```

## Risques

1. **Non-régression au bit près.**
   - Sans `slot` ni `w`, `axePercage` rend deux points confondus.
   - Chaque lecteur garde alors sa sortie d'avant. Un essai le vérifie sur
     l'Excellon et l'IPC-2581.
2. **Sens de rotation et miroir.** Un essai pose une empreinte à fente à 0°,
   90° et face dessous, et compare les extrémités attendues.
3. **XSD.** `IPC-2581C.xsd` n'est pas dans le dépôt. Je prends la copie de
   KiCad (`qa/data/pcbnew/ipc2581/IPC-2581C.xsd`) dans le dossier de travail,
   seulement pour valider. Elle ne sera pas commitée.
4. **Fabricant.** G85 est accepté par JLCPCB, PCBWay et Eurocircuits (choix
   de la spec). À confirmer à la première commande (Q1).

## Points de contrôle

- **Après T2.** Une pastille oblongue sort une ligne G85 dans le fichier
  traversant, et le banc complet passe.
- **Après T5.** Tous les lecteurs de M2 sont branchés, l'IPC-2581 passe le
  XSD, le banc complet passe.
- **Après T7.** Bancs, `A-FAIRE.md`, revue, commit.

## Questions ouvertes

1. Lecture de `SlotCavity` par la visionneuse : pas dans M2. À faire si
   l'aller-retour IPC-2581 des cartes à fentes devient utile.
2. Dossier méca : faut-il dessiner les fentes en vraie forme dans ses vues ?
   M2 ne fait que les transmettre.
