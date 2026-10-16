# Plan : trous NPTH dans les empreintes (module M1)

Source : `SPEC-trous-npth.md`, module M1. Les modules M2 (oblongs) et M3
(LIB) auront leur propre plan une fois M1 livré. La liste cochable est dans
`tasks/todo-trous-npth.md`.

## Vue d'ensemble

Un trou NPTH existe déjà de bout en bout au niveau de la carte (`S.holes`) :
dessin, contrôles, Excellon NPTH, IPC-2581, Draftsman, dossier méca,
placement. M1 ne pose donc pas de nouveau tuyau. Il fait trois choses :

1. **Porter les trous dans l'empreinte** : champ `holes` lu, écrit et recopié
   sur la carte.
2. **Une seule liste de trous en coordonnées monde**, `trousMonde()`. Elle
   réunit `S.holes` et les trous des empreintes passés par `fpXform`.
3. **Brancher chaque lecteur actuel de `S.holes` sur cette liste.** L'édition
   reste sur `S.holes`.

## Ce que le code montre (relevé avant le plan)

| Où | Constat | Conséquence |
|---|---|---|
| `08-empreinte.js` `fpApplyDef` | seule porte d'application d'une empreinte : import de netlist (`02-connectivity.js` l. 1019, 1045), mise à jour LIB et menu (`07-app.js` l. 899) | **relevé faux, corrigé à la revue** : la LIB du serveur passe par `pcbAppliquerDefEmpreinteBrut` et par `pkgGeom` (cache LIB → `mkFp`, `applyPkgGeomBrut`), `fpApplyDef` ne sert qu'à la bibliothèque locale ; `fpTrousDe` couvre tous ces chemins, et `fpGeneric` / l'import de netlist retirent les trous quand la forme est refaite |
| `05-tools.js` `normFp` / `docObj` | `docObj` enregistre `S.fps` tel quel ; `normFp` relit champ par champ | `normFp` doit relire `holes`, sinon le trou se perd à la réouverture |
| `05-tools.js` `normHole` | bornes Ø 0,4 à 30 mm, `id` obligatoire | `dHoles` reprend les bornes, sans `id` (un trou d'empreinte n'est pas sélectionnable) |
| `01-core.js` `fpXform` | translation + rotation + miroir face dessous, déjà utilisé par `padsWorld` | `trousMonde()` l'emploie tel quel |
| Lecteurs de `S.holes` | `03-render.js` 975, `02-connectivity.js` 608-660, `24-pcb-capabilities.js` 1141, `04-fabrication.js` 724, `35-ipc2581-export.js` 1094, `29-draftsman.js` 747 et 972, `33-draftsman-export.js` 490, `36-dossier-meca.js` 18, `28-placement-satellites.js` 138 | dix remplacements de `S.holes` par `trousMonde()`, sans autre logique |
| Draftsman `dfAccroches` / `dfPoint` (`34-draftsman-vues.js` 371, 513) | une cote s'accroche à un trou **par son `id`** | voir D3 |
| `03-render.js` `zoneCanvas` | les zones dégagent découpes, pistes, vias et pastilles, **pas les trous NPTH**, et aucun contrôle ne compare un trou à une zone | défaut existant, voir D4 |
| `02-connectivity.js` trou ↔ pastille | pastilles de toute la carte, même empreinte comprise | exemption « même empreinte » à ajouter (critère M1-5) |
| `harness.js` | lit `dist/pcb.js` | `build-monofichier.py` avant chaque passage du banc |
| `gestion-lib/js/02-rendu-pcb.js` | moteur passé en y vers le bas le 16/10 (`b5338ab`) | les trous s'y dessinent dans le même repère |

## Décisions d'architecture

- **D1 — `trousMonde()` dans `01-core.js`, à côté de `padsWorld`.**
  - Elle rend `S.holes` tels quels : même objet, `id` compris.
  - Elle rend aussi, pour chaque empreinte, ses trous transformés, sous la
    forme `{x, y, d, fp, i}`.
  - Pas de cache : le nombre de trous est faible et la liste se recalcule au
    même rythme que `padsWorld`.
- **D2 — Les trous d'empreinte ne sont ni sélectionnables ni supprimables
  seuls.** Ils suivent l'empreinte. La sélection, le copier-coller et la
  suppression continuent de lire `S.holes` (`05-tools.js`).
- **D3 — Draftsman.**
  - Les trous d'empreinte entrent dans le tableau de perçage, le DXF et les
    repères H1, H2…
  - L'accroche de cote par `id` reste réservée aux trous de carte en M1.
    Accrocher une cote à un trou d'empreinte demanderait une référence
    `(empreinte, rang)` : ce sera à décider en M3 si le besoin apparaît.
- **D4 — Les zones dégagent les trous NPTH (décidé le 16/10/2026, T8).** Le corriger change le Gerber cuivre de toute carte où un trou
  NPTH tombe dans une zone, trous de carte compris. La spec range « toucher au
  Gerber cuivre » dans *Demander d'abord*.
- **D5 — Gestion LIB.**
  - L'outil « Trou » de l'éditeur d'empreintes est calqué sur l'ajout de
    pastille : clic pour poser, glisser pour déplacer, Suppr pour effacer, et
    le diamètre dans le panneau.
  - L'outil ne crée pas de pastille et ne numérote rien.

## Phases et tâches

### Phase 1 : format et aller-retour (T1)

### Phase 2 : bout en bout dans l'éditeur PCB (T2 à T5)

- T2 : `trousMonde` et Excellon, la tranche qui fait la valeur.
- T3 : dessin et lecteurs simples.
- T4 : contrôles.
- T5 : IPC-2581, Draftsman, dossier méca.

### Phase 3 : Gestion LIB (T6)

### Phase 4 : clôture (T7, T8 facultative selon D4)

## Graphe des dépendances

```
T1 format ─▶ T2 trousMonde + Excellon ─┬─▶ T3 dessin, placement, capacités
                                       ├─▶ T4 contrôles
                                       └─▶ T5 IPC-2581, Draftsman, méca
T1 ─▶ T6 Gestion LIB (indépendante de T2-T5)
T3 ─▶ T8 dégagement zones (si D4 = oui)
T2..T6 (+T8) ─▶ T7 clôture
```

## Risques

1. **Non-régression au bit près.** Une carte sans trou d'empreinte doit
   sortir le même Excellon et le même IPC-2581.
   - Parade : `trousMonde()` rend `S.holes` d'abord et dans le même ordre.
   - Un essai compare les sorties avant et après sur une carte existante du
     banc.
2. **Face dessous.** `fpXform` applique le miroir. Un essai pose une
   empreinte asymétrique sur chaque face, à 0° et à 90°.
3. **Doublon de trou.** Un même trou peut être posé à la main sur la carte et
   porté par l'empreinte. Le contrôle trou à trou le signale déjà comme
   recouvrement : c'est le comportement voulu (la spec interdit de
   convertir en silence).

## Points de contrôle

- **Après T2.** Une empreinte à trous, posée et tournée, sort ses trous dans
  le fichier NPTH, et le banc complet passe.
- **Après T5.** Tous les lecteurs de la liste des trous de M1-4 sont branchés
  et le banc complet passe. Revue avant la Gestion LIB.
- **Après T7.** Bancs, `A-FAIRE.md`, commit, revue.

## Décisions de relecture (16/10/2026)

- D4 : oui. Tous les trous NPTH, de carte et d'empreinte, dégagent les zones
  à l'écartement de la classe du net de la zone, et un contrôle trou ↔ zone
  s'ajoute (T8, dans M1).
- Mise en œuvre : `/build auto`, puis une revue complète obligatoire.
