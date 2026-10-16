# À faire : trous NPTH dans les empreintes (module M1)

Plan : `tasks/plan-trous-npth.md`. Spec : `SPEC-trous-npth.md`. Les
numéros de critère (M1-1 à M1-8) renvoient à la spec.

Bancs :
- `BUILD` = `python3 editeur-pcb/outils/build-monofichier.py` (le banc PCB lit `dist/pcb.js` : à relancer avant `JS_PCB`)
- `JS_PCB` = `node editeur-pcb/test/harness.js`
- `JS_LIB` = `node gestion-lib/test/banc-repere-pcb.js` et `node gestion-lib/test/banc-catalogue.js`
- `PY_LIB` = `python python/test/banc-lib-routes.py`
- `COMP` = `python -m compileall -q web_CAO.py python`

---

## Phase 1 : format

### T1 : `holes` lu, écrit, posé sur la carte et relu (M1-1, M1-2, M1-6)
`dHoles` dans `05-tools.js` (bornes de `normHole`, pas d'`id`). Dans
`08-empreinte.js`, `normFpDef`, `fpDefOf` et `fpApplyDef` portent `holes`.
`normFp` les relit dans le fichier de carte.
- [x] Une définition avec deux trous, appliquée à une empreinte de la carte, lui donne ces deux trous ; une définition sans trous retire ceux de l'empreinte
- [x] Aller-retour `docObj` → `normDoc` : les trous de l'empreinte reviennent identiques
- [x] Une entrée illisible est ignorée, un Ø hors bornes est ramené dans 0,4-30 mm
- [x] Une définition sans `holes` donne la même empreinte qu'avant (objet identique)
- [x] `BUILD` puis `JS_PCB` passent

## Phase 2 : éditeur PCB de bout en bout

### T2 : `trousMonde()` et fichier NPTH (M1-3, M1-4 Excellon)
`trousMonde()` dans `01-core.js`. `04-fabrication.js` l'emploie pour le
fichier NPTH.
- [x] Empreinte à trous posée à (x, y), tournée de 90°, puis passée sur la face dessous : coordonnées monde attendues dans les deux cas
- [x] Les trous sortent dans `-NPTH.TXT`, aux coordonnées attendues
- [x] Carte du banc sans trou d'empreinte : Excellon identique au bit près avant et après
- [x] `BUILD` puis `JS_PCB` passent
**Point de contrôle 1**

### T3 : dessin, placement, capacités (M1-4)
`drawHoles` (`03-render.js`), obstacles du placement
(`28-placement-satellites.js`), plus petit NPTH (`24-pcb-capabilities.js`).
- [x] Un trou d'empreinte se dessine (le banc relève l'appel de dessin ou la liste dessinée)
- [x] Un trou d'empreinte de Ø 0,45 mm est jugé sous le minimum NPTH du fabricant
- [x] `JS_PCB` passe

### T4 : contrôles (M1-5)
`02-connectivity.js` lit `trousMonde()`. Une pastille de la même empreinte
n'est pas signalée en deçà de l'écartement ; un recouvrement l'est toujours.
- [x] Trou d'empreinte trop près d'une piste d'un autre net : signalé
- [x] Trou d'empreinte trop près d'une pastille d'une autre empreinte : signalé
- [x] Trou d'empreinte à 0,1 mm d'une pastille de sa propre empreinte : non signalé ; s'il la recouvre : signalé
- [x] Trou d'empreinte posé sur un trou de carte : recouvrement signalé
- [x] `JS_PCB` passe

### T5 : IPC-2581, Draftsman, dossier méca (M1-4)
`35-ipc2581-export.js`, `29-draftsman.js`, `33-draftsman-export.js`,
`36-dossier-meca.js` lisent `trousMonde()`. Les accroches de cote restent
sur `S.holes` (D3).
- [x] IPC-2581 : les trous d'empreinte sont `NONPLATED` et `stats.trousNpth` les compte
- [x] Tableau de perçage et DXF Draftsman : les trous d'empreinte y sont, sous le diamètre attendu
- [x] Dossier méca : `trous` contient les trous d'empreinte, `metallise:false`
- [x] Carte sans trou d'empreinte : IPC-2581 identique au bit près
- [x] `BUILD` puis `JS_PCB` passent
**Point de contrôle 2 : revue de T1 à T5**

## Phase 3 : Gestion LIB

### T6 : dessin et édition des trous (M1-7)
`02-rendu-pcb.js` dessine `holes`. `05-editeur-lib.js` ajoute l'outil
« Trou » (poser, déplacer, supprimer, diamètre) et garde `holes` dans la vue
JSON et à l'enregistrement.
- [x] `banc-repere-pcb.js` : un trou en (1, -2) est dessiné au-dessus de l'axe et à droite de l'origine
- [x] Un clic de l'outil Trou à un point écran donne un trou à la position monde attendue
- [x] Enregistrer puis relire une empreinte garde ses trous (banc ou essai manuel décrit)
  → l'enregistrement et la vue JSON écrivent `EDITEUR_LIB.data` entier : `holes` passe sans code. Déplacement : par le tableau (X, Y), pas encore au glisser
- [x] `JS_LIB` et `PY_LIB` passent

## Phase 4 : clôture

### T8 : dégagement des trous dans les zones (D4 = oui)
`zoneCanvas` dégage chaque trou de `trousMonde()`, à l'écartement de la
classe du net de la zone. Un contrôle trou ↔ zone s'ajoute.
- [ ] Un trou dans une zone de masse y fait un dégagement de Ø + 2 × écartement
- [ ] `JS_PCB` passe

### T7 : documentation et commit
- [ ] `A-FAIRE.md` et l'*État des lieux* mis à jour
- [ ] Tous les bancs passent (`BUILD`, `JS_PCB`, `JS_LIB`, `PY_LIB`, `COMP`)
- [ ] Revue (`/review`) de toutes les modifications de M1
- [ ] Commit, puis la proposition de mise à jour du graphe graphify de WEB_CAO
