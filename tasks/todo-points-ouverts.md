# À faire : points ouverts après M1 à M3

Plan : `tasks/plan-points-ouverts.md`.

Bancs :
- `BUILD` = `python3 editeur-pcb/outils/build-monofichier.py`
- `JS_PCB` = `node editeur-pcb/test/harness.js`
- `JS_VIS` = `node visionneuse-ipc2581/test/harness-sim.js`
- `PY_VIS` = `python3 visionneuse-ipc2581/test/banc-essai.py`
- `PY_EXP` = `python3 editeur-pcb/test/banc-ipc2581-export.py --xsd <copie KiCad>`
- `JS_LIB` = `node gestion-lib/test/banc-*.js`

---

## Phase 1 : risques de fabrication

### T1 : le routeur voit les trous NPTH
- [x] Une piste routée au travers d'un trou de carte, puis d'une fente d'empreinte, est refusée ou contournée (`pnsWorld`)
- [x] Ajouter ou supprimer un trou invalide le cache du routeur
- [x] `JS_PCB` passe

### T2 : DRC, anneau de fente et bord concave
- [x] Pastille dont la fente déborde : « anneau de fente » signalé sur la pastille
- [x] Fente NPTH dont l'axe frôle une encoche concave du contour : signalée
- [x] `JS_PCB` passe

### T3 : Gerber, trou près d'une zone sans net
- [x] Trou hors d'une zone sans net mais à moins de son écartement : dégagé
- [x] `JS_PCB` passe

## Phase 2 : cohérence des sorties

### T4 : la visionneuse lit les fentes (SlotCavity)
- [x] `ipc2581_parser` : un `SlotCavity` devient un trou avec `l` et `rot`
- [x] `ipc2581_json` les porte ; la visionneuse les dessine en gélule et les compte
- [x] Dossier méca de la visionneuse : la fente avec `l` et `rot` ; comparaison méca rebranchée pour `exemple-1-fentes`
- [x] `PY_EXP` (attendu : fentes comptées), `PY_VIS`, `JS_VIS` passent

### T5 : fentes en vraie forme aux plans et au DXF
- [x] Détail du plan de fabrication et feuilles cuivre : contour oblong
  → l'essai vérifie les feuilles cuivre ; le détail est un rappel de dessin de la vue (même `contourOblong`), non relevé par le banc
- [x] DXF : calque `TROUS_PTH_<Ø>x<L>` / `TROUS_NPTH_<Ø>x<L>` pour une fente
- [x] `JS_PCB` passe

### T6 : `fpBBox` compte les trous
- [x] Un plot qui dépasse du corps élargit la boîte de l'empreinte
- [x] Les essais de placement et de score passent sans changer d'attendu
- [x] `JS_PCB` passe

### T7 : dégagement à l'écran égal au Gerber
- [x] Deux zones de classes différentes sur une couche : l'écran dégage à l'écartement de la zone qui contient l'objet
- [x] `JS_PCB` passe
**Point de contrôle : tous les bancs**

## Phase 3 : confort

### T8 : panneau Propriétés d'un trou de carte, L et Rot
- [x] Champs L et Rot ; L ≤ Ø remet le trou rond
- [x] `JS_PCB` passe

### T9 : Gestion LIB, glisser et Suppr pour les trous
- [x] Un trou se glisse comme une pastille et s'efface par Suppr
- [x] `JS_LIB` passe

### T10 : la mise à jour LIB relit aussi FPLIB
- [x] Après une modification signalée par la Gestion LIB, `fpLibPourBoitier` rend la nouvelle définition
- [x] `JS_PCB` passe

## Phase 4 : données

### T11 : doutes de fiche (PROJETS)
- [x] Amphenol 10132797 (numérotation), Yamaichi IC51-0484-806 (broche 1), Keystone 1067 (côté du trou) confrontés à deux sources
- [x] Empreinte corrigée seulement si deux sources concordent, sinon doute laissé écrit

  → Amphenol et Keystone confirmés (deux sources) ; Yamaichi : corps corrigé, broche 1 en doute écrit (une seule source)

## Clôture

### T12 : revue, documentation, push
- [ ] Revue indépendante, constats traités
- [ ] `A-FAIRE.md` à jour ; tous les bancs passent
- [ ] Push WEB_CAO et PROJETS ; graphe graphify mis à jour
