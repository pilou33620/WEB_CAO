# À faire : perçages oblongs (module M2)

Plan : `tasks/plan-trous-oblongs.md`. Spec : `SPEC-trous-npth.md` (M2-1 à
M2-6).

Bancs :
- `BUILD` = `python3 editeur-pcb/outils/build-monofichier.py` (le banc PCB lit `dist/pcb.js`)
- `JS_PCB` = `node editeur-pcb/test/harness.js`
- `JS_LIB` = `node gestion-lib/test/banc-*.js`
- `PY_EXP` = `python3 editeur-pcb/test/banc-ipc2581-export.py --xsd <copie KiCad de IPC-2581C.xsd>`
- `COMP` = `python -m compileall -q web_CAO.py python`

---

## Phase 1 : format et axe

### T1 : `slot`, `w`/`rot` lus, écrits, passés au monde (M2-1)
- `dPads` garde `slot` s'il dépasse `drill`.
- `dHoles` et `normHole` gardent `w` (s'il dépasse `d`) et `rot`.
- `trousMonde` passe `rot` au monde.
- `axePercage` rend l'axe de perçage d'une pastille ou d'un trou.
- [x] Pastille 2,0 × 1,0, `drill` 0,6, `slot` 1,6, à 0° : axe de ±0,5 en x ; même pastille tournée de 90° : axe en y
- [x] Trou d'empreinte `{d:1, w:3, rot:0}` sur une empreinte à 90° puis face dessous : extrémités attendues
- [x] Trou de carte oblong : aller-retour `docObj` → `normDoc`
- [x] Rond (`slot` absent, `w ≤ d`) : axe aux deux points confondus, aucune clé ajoutée
- [x] `BUILD` puis `JS_PCB` passent

## Phase 2 : bout en bout

### T2 : Excellon G85, tableau de perçage, DXF (M2-3)
- [x] Pastille oblongue : ligne `X..Y..G85X..Y..` dans le fichier traversant, outil = largeur
- [x] Trou NPTH oblong : ligne G85 dans `-NPTH.TXT`
- [x] Tableau de perçage et DXF : autant d'entrées que l'Excellon, et la fente dite oblongue (largeur × longueur)
- [x] Carte sans fente : Excellon identique au bit près
- [x] `JS_PCB` passe
**Point de contrôle 1**

### T3 : contrôles et audit fabricant (M2-4)
- [x] Piste qui frôle le bout d'une fente NPTH (signalée) alors qu'elle est loin de son centre
- [x] Deux perçages : distance entre axes moins demi-largeurs
  → via ↔ fente de pastille : toujours couvert d'abord par l'isolation (l'anneau entoure la fente) ; le calcul sur l'axe est en place, l'essai vérifie l'isolation
- [x] Audit : largeur de fente métallisée sous `platedMinW_*`, NPTH sous `nonPlatedMinW`, allongement sous `platedLengthOverWidthMin`, anneau dans le grand sens
- [x] `JS_PCB` passe

### T4 : dessin et dégagements (M2-2)
- [x] La fente se dessine en vraie forme (pastille et trou)
- [x] Zone : dégagement autour de la fente au Gerber (trait de la largeur + 2 × écartement) et dans l'IPC-2581 ; écran et îlots au même dessin
- [x] `JS_PCB` passe

### T5 : IPC-2581 SlotCavity (M2-5)
- [x] Calque `…SLOT` (fonction `ROUT`), `SlotCavity` `PLATED` / `NONPLATED` avec `Location`, `Xform` et `Oval` (width ≥ height)
- [x] La fente ne sort plus en `Hole` rond
- [x] `PY_EXP` passe, avec la validation XSD
  → nouvelle carte d'essai `exemple-1-fentes` (sans dossier méca : la visionneuse ne lit pas encore SlotCavity) ; 75 cas, 5 exports conformes à IPC-2581C.xsd (copie KiCad, hors dépôt) ; visionneuse 226 essais
- [x] Carte sans fente : IPC-2581 identique au bit près
- [x] `JS_PCB` passe
**Point de contrôle 2**

## Phase 3 : Gestion LIB

### T6 : saisir et dessiner les fentes (M2-2, Gestion LIB)
- [x] Tableau des pastilles : colonne Fente ; tableau des trous : colonnes L et Rot
- [x] Le moteur dessine la fente de la pastille et le trou oblong (y vers le bas)
- [x] Champs numériques forcés en nombre (garde de `banc-repere-pcb.js`)
- [x] `JS_LIB` passe

## Phase 4 : clôture

### T7 : documentation, revue, commit
- [x] `A-FAIRE.md` à jour
- [x] Tous les bancs passent (`BUILD`, `JS_PCB`, `JS_LIB`, `PY_EXP`, `COMP`)
- [x] Revue complète (relecteur indépendant), constats traités
- [x] Commit, push, graphe graphify mis à jour

  → revue indépendante : 3 défauts réels (Gerber à cheval sur une zone, fente sur couche sans cuivre, presse-papier / rotation) et l'écart du dossier méca corrigés ; suggestions restantes dans `A-FAIRE.md`.
