# Plan : points ouverts après M1 à M3

Source : `A-FAIRE.md`, sections « Relevés de la revue M1 » et « Suites de
M2 », plus les doutes de fiche de M3. Choix du 17/10/2026 : les quatre
groupes, plan puis `/build auto`. La liste cochable est dans
`tasks/todo-points-ouverts.md`.

## Ce que le code montre (relevé avant le plan)

| Où | Constat | Conséquence |
|---|---|---|
| `11-pns-node.js` `pnsBuild` | les obstacles sont les pastilles, les vias et les pistes ; aucun trou NPTH ; `pnsStamp` ne compte pas les trous | les trous de `trousMonde()` entrent comme items sans net, toutes couches, de la forme de `trouSeul` (rond ou oval) ; le compte des trous entre dans la clé du cache |
| `02-connectivity.js` (bloc NPTH) | bord de carte contrôlé aux deux bouts de la fente seulement ; l'anneau d'une fente n'est jugé que par l'audit | distance axe ↔ côtés du contour (`segSegDist`) ; contrôle « anneau de fente » par pastille |
| `04-fabrication.js` `zoneEtrangereProche(zs,"",…)` | saute les zones dont le net vaut `""` : un trou proche d'une zone sans net n'y est pas dégagé | chercher toutes les zones pour un trou (il n'a pas de net) |
| `python/ipc2581_parser.py` l. 1809 | lit les `Hole` des `Set`, pas les `SlotCavity` | lire `SlotCavity` (`Location`, `Xform`, `Oval`) en trou à longueur et angle ; `ipc2581_json.py` les porte ; `visionneuse-ipc2581/js/02-modele.js` (l. 847, `V.trous.pth/npth`) les dessine en gélule ; dossier méca de la visionneuse |
| `29-draftsman.js` l. 942, 1185 ; `33-draftsman-export.js` `dxfOutils` | fente dessinée en cercle (détail, feuilles cuivre) ; calques DXF par seul diamètre | `contourOblong` ; calque `TROUS_PTH_<Ø>x<L>` pour une fente |
| `01-core.js` `fpBBox` | ignore les trous | les compter (boîte de chaque trou, `holeBBox`) ; vérifier placement et score sur les exemples |
| `03-render.js` `zoneCanvas` | écartement de la première zone de la couche (`zs[0]`) | celui de la zone qui contient l'objet, comme le Gerber |
| panneau Propriétés d'un trou (`propsHole`) | Ø seul | champs L et Rot |
| Gestion LIB, outil Trou | pas de glisser, pas de Suppr | même mécanique que les pastilles |
| `21-lib-sync.js` | vide `PCB_LIB_CACHE` seulement | relire aussi le miroir `FPLIB` |

## Décisions

- **D1 — Un trou est un obstacle sans net pour le routeur.** Même item que
  le `trouSeul` d'une pastille : il bloque le cuivre de tous les nets, à
  l'écartement « trou » (`S.rule.hole`), sur toutes les couches.
- **D2 — Le bord de carte se mesure de l'axe au contour,** pas des seuls
  bouts. Le contrôle des ronds ne change pas.
- **D3 — La visionneuse lit `SlotCavity` comme le fait l'export.**
  - `Location` donne le centre, `Oval` donne la longueur et la largeur,
    `Xform` donne l'angle (sens de la norme).
  - Une fente reste comptée parmi les trous, avec `l` et `rot` en plus.
  - L'aller-retour méca de `exemple-1-fentes` est rebranché.
- **D4 — Doutes de fiche : deux sources concordantes ou rien.**
  - Sources : le modèle CAO du fabricant (empreinte ou 3D, publiés par lui
    ou via Ultra Librarian / SnapEDA), la fiche de la pièce appariée, une
    empreinte officielle KiCad.
  - On ne change une empreinte que si deux sources concordent. Sinon le
    doute reste écrit dans la description.

## Phases et tâches

- **Phase 1 : risques de fabrication.**
  - T1 : routeur et trous.
  - T2 : DRC (anneau de fente, bord concave).
  - T3 : Gerber, zone sans net.
- **Phase 2 : cohérence des sorties.**
  - T4 : visionneuse, `SlotCavity`.
  - T5 : Draftsman et DXF.
  - T6 : `fpBBox`.
  - T7 : dégagement à l'écran égal au Gerber.
- **Phase 3 : confort.**
  - T8 : champs L et Rot.
  - T9 : glisser et Suppr dans la Gestion LIB.
  - T10 : recharge de `FPLIB`.
- **Phase 4 : données (PROJETS).**
  - T11 : doutes de fiche. Recherche en parallèle, par un agent qui écrit
    dans le dossier de travail.
- **Clôture :** T12, revue indépendante, `A-FAIRE.md`, push, graphe.

T1 à T3 sont indépendantes. T4 suit T3 (même banc IPC). T6 et T7 peuvent
changer des sorties existantes : on compare les cartes d'exemple avant et
après.

## Risques

1. **T6 (`fpBBox`) touche le placement, le score et `arrange`.** Les
   essais de placement doivent passer sans changement d'attendu ; si l'un
   bouge, on s'arrête et on te le montre.
2. **T7 change l'écran** quand deux zones de classes différentes partagent
   une couche. C'est voulu (aligné sur le Gerber), mais à vérifier sur les
   cartes d'exemple.
3. **T4 touche le lecteur Python partagé** par la visionneuse et le
   serveur : les bancs `banc-essai.py` de la visionneuse et
   `banc-ipc2581-export.py` doivent rester verts.

## Points de contrôle

- **Après T3.** Bancs PCB verts.
- **Après T7.** Tous les bancs (PCB, visionneuse, IPC, Python) verts.
- **Après T12.** Revue, `A-FAIRE.md`, push des deux dépôts, graphe.
