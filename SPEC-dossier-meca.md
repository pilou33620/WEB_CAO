# Spec : dossier mécanique (éditeur PCB et visionneuse IPC-2581)

Demande du 15/10/2026. `SPEC.md` (classes d'interface) n'est pas terminée
(vérification TRD1_N et relecture en attente) : cette spec vit à côté, sous son
propre nom, pour ne pas l'écraser.

Mise à jour du 29/10/2026 : le DXF 1:1 du dossier est remplacé par un STEP
3D (carte et composants), et l'export DXF a disparu de l'éditeur. La spec
décrit l'état actuel.

## Objectif

Produire, pour une carte, un **dossier mécanique** qu'on peut confier à un
ingénieur méca ou à une IA pour **concevoir le boîtier**. Il dit tout ce que le
boîtier doit respecter, sans rien sur le cuivre :

- les dimensions de la carte : contour, découpes, cotes hors tout, épaisseur ;
- les trous de fixation : position, diamètre, métallisé ou non, diamètre de
  dégagement autour (tête de vis, entretoise) ;
- l'encombrement de chaque composant par face, avec sa **hauteur** ;
- les **ouvertures** à prévoir dans le boîtier : connecteurs en bord de carte
  (USB, jack, bornier), et organes qu'on doit voir ou toucher par le dessus ou
  le dessous (LED, bouton).

Utilisateurs :

- le concepteur, qui produit le dossier depuis l'éditeur PCB ou la
  visionneuse ;
- l'ingénieur méca, qui lit le PDF et importe le STEP dans sa CAO ;
- une IA, qui lit le JSON.

### Décisions prises (15/10/2026)

| Question | Choix |
|---|---|
| Livrable | Un `.zip` : PDF (feuille « Plan mécanique ») + JSON + STEP 3D (DXF 1:1 à l'origine, remplacé le 29/10/2026) |
| Hauteurs | Colonne « Maximun Height » de la LIB, corrigible à la main ; les composants sans hauteur sont signalés |
| Ouvertures | Proposées automatiquement, avec une case par composant pour corriger |
| Interface PCB | Dans la fenêtre Plans (Draftsman) : nouvelle feuille + bouton « Dossier méca .zip » |
| Jeu aux parois | Aucun : le dossier donne les cotes réelles, le mécanicien choisit le jeu |
| `fabrication.zip` | Le dossier méca reste à part (autre destinataire) |
| Code PDF / STEP dans la visionneuse | Elle charge les fichiers du Draftsman de l'éditeur tels quels pour le PDF, et `commun/export-step.js` pour le STEP |
| Export IPC de l'éditeur | Écrit aussi la hauteur (`<Package height>`) |
| Trous de fixation | NPTH, repère `H` / `MH`, boîtier « MOUNT » / « TROU » (les trois) |
| Connecteurs | Tous proposés comme ouverture, où qu'ils soient |
| Non-montés | Gardés, marqués NM et en tirets : le boîtier leur réserve la place |
| Repère | Celui des Gerber, Z = 0 sur la face dessus (hypothèse 1) |

### Hypothèses (validées le 15/10/2026)

1. **Repère** : celui des Gerber. Millimètres, origine
   `gOrigin()`, X vers la droite, Y vers le haut, vue de dessus. Z = 0 sur la
   face dessus de la carte, Z positif au-dessus. Le dessous va de −épaisseur à
   −épaisseur − hauteur.
2. **Hauteur d'un composant** = « Maximun Height » de sa ligne LIB, mesurée
   depuis la surface de la carte. La ligne se trouve par « Part Name »
   (`csvPartName` / `partName`, `props.PART_NAME`), sinon par référence
   fabricant (« Part Number », « manufacturer part Number »). Ordre :
   saisie > fichier IPC > LIB. On ne tient pas compte de « Standoof
   Height » : un pavé plein de 0 à h suffit pour un boîtier.
3. **Encombrement** = le corps de l'empreinte (`bodyOf(fp)`), en rectangle
   orienté, pour le PDF et le JSON. Le STEP prend le modèle 3D de la LIB
   quand il y en a un, sinon ce corps extrudé à sa hauteur.
4. **Trou de fixation** = un trou non métallisé `S.holes`, **ou** une empreinte
   dont le repère commence par `H` ou `MH`, ou dont le boîtier contient
   « MOUNT » ou « TROU », et qui n'a qu'une pastille percée. Le diamètre de
   dégagement est celui de la pastille de cuivre quand il y en a une, sinon
   le diamètre du trou + 2 × 1 mm.
5. **Ouverture proposée** :
   - **tout connecteur** (repère `J`, `P`, `CN`, `USB`, `X`), où qu'il soit :
     ouverture de **bord** si son corps est à moins de 2 mm du contour ou le
     dépasse (le bord N, S, E ou O le plus proche), sinon ouverture sur sa
     **face** (un connecteur au milieu de la carte se branche par le
     couvercle) ;
   - repère `SW`, `LED`, `DS`, `BT`, ou `D` dont la valeur ou le boîtier
     contient « LED » : ouverture de bord s'il touche le bord, sinon sur sa
     face.
   La case corrige ce choix dans les deux sens.
6. **Non-montés** de la variante active : gardés dans le dossier, marqués
   `"monte": false`, en tirets et « NM » sur la feuille. Ils comptent dans
   les hauteurs maximales : le boîtier leur réserve la place si une autre
   variante les monte.
7. Les réglages manuels (hauteur saisie, case d'ouverture) sont enregistrés
   dans le document, `S.dessin.meca`, **par identifiant d'empreinte** (`fp.id`,
   qui survit à un changement de repère). `normDoc` recopie déjà `dessin` en
   entier, et `dfCfg` le bornera comme les cotes.

## Contenu du dossier

`<projet>-MECA.zip` :

| Fichier | Pour qui | Contenu |
|---|---|---|
| `<projet>-PLAN-MECA.pdf` | ingénieur | la feuille « Plan mécanique », PDF cherchable comme les autres plans |
| `<projet>-MECA.json` | IA, scripts | toutes les données ci-dessous, en clair |
| `<projet>-MECA.step` | CAO méca | assemblage 3D (`stepFabriquer`, `commun/export-step.js`) : la carte (contour avec ses arcs retrouvés, découpes, trous en cylindres) et les composants dessus et dessous (modèle STEP de la LIB, sinon corps extrudé à sa hauteur), comme « Export STEP… » avec ces trois cases |

### Feuille « Plan mécanique » (Draftsman)

- **Vue de dessus** à l'échelle normalisée : contour, découpes, trous de
  fixation à leur taille réelle, corps des composants (dessus en trait plein,
  dessous en tirets), ouvertures en couleur avec leur repère.
- **Cotes** : hors tout, et position de chaque trou de fixation depuis
  l'origine (cotes en ordonnée, X et Y).
- **Vue de face et vue de côté** simplifiées : la carte en coupe à son
  épaisseur, chaque composant en pavé à sa hauteur, au-dessus ou en dessous ;
  la hauteur maximale de chaque face cotée.
- **Tableaux** : trous de fixation (N°, X, Y, Ø, métallisé, Ø de dégagement),
  ouvertures (repère, bord ou face, position le long du bord, largeur,
  hauteur depuis la carte), hauteurs maximales (dessus, dessous, épaisseur,
  total), composants sans hauteur connue.
- Cadre et cartouche des autres feuilles. Les cotes manuelles et les vues
  déplacées (34-draftsman-vues.js) fonctionnent aussi sur cette feuille.

### JSON (`format: "web_cao-meca-1"`)

```json
{
  "format": "web_cao-meca-1",
  "projet": "Carte USB", "revision": "A", "date": "2026-10-15",
  "repere": "mm ; origine des Gerber ; X droite, Y haut, vue de dessus ; Z=0 face dessus, Z>0 vers le haut",
  "carte": {
    "contour": [[0,0],[44,0],[44,30],[0,30]],
    "decoupes": [],
    "encombrement": {"x1":0,"y1":0,"x2":44,"y2":30},
    "epaisseur": 1.6
  },
  "fixations": [
    {"id":"H1","x":3.5,"y":3.5,"d":3.2,"metallise":false,"d_degagement":5.2}
  ],
  "composants": [
    {"ref":"J1","face":"dessus","x":22,"y":1.5,"rot":0,
     "corps":[[18,-0.5],[26,-0.5],[26,4.5],[18,4.5]],
     "hauteur":3.1,"source_hauteur":"lib","monte":true,
     "ouverture":{"type":"bord","bord":"S","debut":18,"fin":26,"z_min":0,"z_max":3.1}}
  ],
  "hauteur_max": {"dessus":3.1,"dessous":0,"total":4.7},
  "avertissements": ["U4 : hauteur inconnue (absente de la LIB, non saisie)"]
}
```

`source_hauteur` vaut `"saisie"`, `"fichier"` (IPC-2581), `"lib"` ou
`"inconnue"` (hauteur `null`).
Pour une ouverture sur une face, `"ouverture":{"type":"face","face":"dessus"}`.

## Architecture : un calcul commun, deux entrées

Le Draftsman lit l'état `S` de l'éditeur et ne peut pas tourner tel quel
dans la visionneuse. En revanche, ses sorties sont génériques : `dfPdf`,
`dfSvg`, les primitives `dfNouvelle` / `dfLigne` / `dfTexte`… / `dfCadre`, la
fonte. Le STEP vient de `commun/export-step.js` (`stepFabriquer`, et
`ctrSegments` qui retrouve les arcs d'un contour facetté), commun aux deux
outils. Les fichiers 29 et 33 ne font que des définitions au chargement
(vérifié). D'où :

```
éditeur (S)  ──mecaEntreeEditeur()──┐
                                     ├─▶ mecaDonnees(entree, lib, reglages) ─▶ JSON
visionneuse ──mecaEntreeIpc(modele)─┘        │
                                             ├─▶ mecaFeuille(json, ctx) ─▶ feuille Draftsman ─▶ PDF / aperçu SVG
                                             └─▶ scène 3D ─▶ stepFabriquer(scène) ─▶ STEP 3D
```

- **Entrée neutre** : `{contour, decoupes, epaisseur, trous:[{x,y,d,metallise,pad}],
  composants:[{id, ref, face, x, y, rot, corps, corps_estime, hauteur_fichier,
  part_name, mpn, pkg, val, monte}]}`.
- `mecaDonnees` et `mecaFeuille` sont dans **`commun/dossier-meca.js`**,
  sans `S` ni DOM : ce sont eux qui portent les essais.
- **STEP** : le même `stepFabriquer` dans les deux outils, sur une scène
  tirée de l'éditeur (`stepSceneEditeur`) ou du modèle IPC
  (`stepSceneIpc`) ; les modèles 3D viennent de LIB/Models par
  `GET /api/lib/fichier?type=step`.

## Visionneuse IPC-2581

Ce que le modèle de la visionneuse fournit déjà (`ipc2581_json.design_en_dict`) :
contour et découpes (`contour.o`, `contour.t`, arcs facettés à environ
0,05 mm), épaisseur (`epaisseur`, tirée de `overallThickness`), perçages
(`percages[]`, `p` = PLATED / NON_PLATED), composants (`ref`, `x`, `y`, `r`,
`m`, `c` → face par `calques`, `part`, `props.PART_NAME`, `props.MPN`, `pkg`,
`val`).

Ce qui manque, et qu'on ajoute au parseur et au JSON :

1. **Corps du boîtier** : `<Package><Outline>` (l'export de notre éditeur
   l'écrit, et c'est la norme). Nouvelle clé `corps` par composant. S'il
   manque, on se rabat sur la boîte des pastilles (`mdlBoiteComp`), marquée
   `corps_estime` et signalée dans les avertissements : un connecteur USB
   déborde de ses pastilles.
2. **Hauteur** : l'attribut `height` du `<Package>` quand le fichier le
   porte (`hauteur_fichier`). Il passe avant la LIB, et `source_hauteur`
   vaut alors `"fichier"`.
3. **Trous de fixation** : un perçage NON_PLATED, ou un composant reconnu
   comme fixation (hypothèse 4) ; `pad` = diamètre de la pastille du
   padstack.
4. **Épaisseur absente** (`epaisseur` = 0) : somme des `empilage[].ep`, sinon
   un avertissement.

Interface : un bouton **« Dossier méca »** dans la barre de la visionneuse
ouvre une fenêtre avec le tableau des composants (hauteur modifiable, case
« ouverture »), l'aperçu SVG de la feuille et le bouton « Télécharger .zip ».
La LIB vient de `GET /api/lib/composants`, déjà servie. Les réglages manuels
partent dans le modèle sous la clé `meca`, donc dans l'export `-IPC.json`
comme les natures de nets.

La visionneuse charge en plus `editeur-pcb/js/29-draftsman.js`,
`33-draftsman-export.js` et la fonte `fontes/plans-sans.js` pour le PDF,
`commun/dossier-meca.js` et `commun/export-step.js`. Les deux aides dont ils ont besoin hors d'eux
(`fmt`, `clamp`) et le zip (`crc32`, `zipBlob`, aujourd'hui dans
`04-fabrication.js`) passent dans `commun/`.

## Commandes

```
JS_PCB = node editeur-pcb/test/harness.js
JS_VIS = node visionneuse-ipc2581/test/harness-sim.js
PY_VIS = python visionneuse-ipc2581/test/banc-essai.py
PY_SRV = python python/test/banc-serveur-routes.py
COMP   = python -m compileall -q web_CAO.py python
Lancer : python web_CAO.py   (ou demarrer_WEB_CAO.cmd)
Monofichier : python editeur-pcb/outils/build-monofichier.py
```

## Structure

| Fichier | Rôle |
|---|---|
| `commun/dossier-meca.js` (nouveau) | `mecaDonnees`, `mecaFeuille`, `mecaZip` : sans `S` ni DOM |
| `commun/export-step.js` | l'assemblage STEP du dossier et de « Export STEP… » |
| `commun/zip.js` (nouveau, déplacé) | `crc32`, `zipBlob` sortis de `04-fabrication.js`, inchangés |
| `editeur-pcb/js/29-draftsman.js` | entrée `meca` dans `DF_FEUILLES`, `dfCfg` (borne `meca`), `dfDocument`, tableau des réglages et bouton du zip |
| `editeur-pcb/js/36-dossier-meca.js` (nouveau) | `mecaEntreeEditeur()` : l'entrée neutre tirée de `S` |
| `editeur-pcb/js/35-ipc2581-export.js` | `height` du `<Package>` quand la hauteur est connue (saisie ou LIB) |
| `editeur-pcb/editeur-pcb.html`, `outils/build-monofichier.py` | balises des nouveaux scripts |
| `python/ipc2581_parser.py`, `ipc2581_data.py`, `ipc2581_json.py` | `<Package><Outline>` et `height` → `corps`, `hauteur` |
| `visionneuse-ipc2581/js/08-dossier-meca.js` (nouveau) | `mecaEntreeIpc(modele)`, fenêtre, bouton |
| `visionneuse-ipc2581/visionneuse-ipc2581.html` | bouton et balises |
| `editeur-pcb/test/harness.js`, `visionneuse-ipc2581/test/banc-essai.py` | essais |
| `editeur-pcb/README.md`, `visionneuse-ipc2581/README.md`, `A-FAIRE.md` | documentation |

## Style

Celui de 29-draftsman.js : JS sans module, `"use strict"`, fonctions préfixées
(`meca…`), noms et commentaires en français, commentaire de bloc qui dit le
pourquoi, sorties construites sur les primitives existantes (`dfNouvelle`,
`dfVue`, `dfCote`, `dfTableau`, `dfFlux`, `ctrSegments`, `zipBlob`).

```js
/* Un trou de fixation : ceux de `S.holes`, et les empreintes qui n'ont
   qu'une pastille percée (H1, MH2, MOUNT…). */
function mecaFixations(){
  const out=(S.holes||[]).filter(h=>h.d>0).map(h=>({x:h.x,y:h.y,d:h.d,metallise:false,dg:h.d+2}));
  …
}
```

## Essais

`commun/dossier-meca.js` se teste sans navigateur, dans `harness.js`, sur une
entrée neutre écrite à la main puis sur la carte d'exemple de l'éditeur :

1. Contour, épaisseur = `stackTotal()`, trous `S.holes` et empreinte de
   fixation reconnus avec leur Ø et leur Ø de dégagement.
2. Hauteur : `CSV_LIB` simulé, trouvée par Part Name puis par référence
   fabricant ; le fichier passe avant la LIB, la saisie avant tout ; sans
   hauteur, `null` et un avertissement.
3. Ouvertures : un `J` au bord S est proposé avec le bon bord et la bonne
   plage ; un `J` au centre est proposé sur sa face ; une LED loin du bord
   est proposée sur sa face ; une résistance ne l'est pas ; la case les
   inverse.
4. Un non-monté de la variante reste dans les composants avec
   `"monte": false` et compte dans la hauteur maximale.
5. Le JSON se relit et porte son format ; le zip contient les trois fichiers ;
   la feuille sort en PDF avec son cadre ; le STEP se relit par OpenCascade
   (`occt-import-js` de WEB_3D).
6. Plans existants : les 44 essais Draftsman passent sans changement, le
   `fabrication.zip` est identique (zip déplacé, pas réécrit).

Export IPC (`banc-ipc2581-export.py`) : la hauteur écrite par l'éditeur
est relue par la visionneuse.

Visionneuse (`banc-essai.py`) : une carte IPC avec `<Package height>` et
`<Outline>` donne `hauteur` et `corps` ; sans eux, les clés sont absentes et
rien d'autre ne change. `mecaEntreeIpc` est essayé dans `harness.js` sur le
JSON de ce banc (face, NPTH, `corps_estime`).

## Limites

- **Toujours** : passer `JS_PCB` (et `JS_VIS`, `PY_SRV` si touchés) avant un
  commit ; réutiliser les primitives du Draftsman et du STEP commun ;
  repère identique aux Gerber.
- **Demander d'abord** : une nouvelle dépendance, un changement de
  `fabrication.zip` ou du format du document de l'éditeur.
- **Jamais** : modifier la LIB depuis le dossier (une hauteur saisie reste
  dans la carte) ; casser les plans existants ; toucher à `SPEC.md`.

## Critères de réussite

1. **Éditeur.** Dans Plans (Draftsman), la case « Plan mécanique » ajoute la
   feuille ; le bouton « Dossier méca .zip » télécharge `<projet>-MECA.zip`
   avec le PDF, le JSON et le STEP.
2. Sur l'exemple 2 de l'éditeur (66 × 42 mm) : cotes hors tout 66 et 42, épaisseur de
   l'empilage, chaque trou de fixation coté en X et Y avec son Ø.
3. Chaque composant monté a sa hauteur, ou figure parmi les avertissements ;
   la hauteur maximale par face est juste.
4. Le connecteur USB au bord est une ouverture « bord » avec sa plage. La
   case la retire ou en ajoute une, et le choix suit la carte à
   l'enregistrement.
5. **Visionneuse.** Sur un IPC-2581 exporté par l'éditeur, le bouton
   « Dossier méca » donne le même dossier que l'éditeur sur la même carte
   (mêmes trous, mêmes corps, mêmes hauteurs, à 0,01 mm près). Sur un fichier
   sans `<Outline>`, les corps sont estimés et le dossier le dit.
6. Une IA à qui l'on ne donne que le JSON en déduit les dimensions
   intérieures minimales du boîtier et la position des entretoises (contrôle
   à la main).

## Questions ouvertes

Aucune : les quatre questions et les hypothèses ont été tranchées le
15/10/2026 (tableau « Décisions prises »).
