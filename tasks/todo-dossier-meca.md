# À faire : dossier mécanique

Plan : `tasks/plan-dossier-meca.md`. Spec : `SPEC-dossier-meca.md`. Les
numéros de critère (1 à 6) renvoient à la spec.

Bancs :
- `BUILD` = `python3 editeur-pcb/outils/build-monofichier.py` (le banc PCB lit `dist/pcb.js` : à relancer avant `JS_PCB`)
- `JS_PCB` = `node editeur-pcb/test/harness.js`
- `JS_VIS` = `node visionneuse-ipc2581/test/harness-sim.js`
- `PY_VIS` = `python visionneuse-ipc2581/test/banc-essai.py`
- `PY_EXP` = `python editeur-pcb/test/banc-ipc2581-export.py`
- `COMP` = `python -m compileall -q web_CAO.py python`

---

## Phase 1 : socle et risques

### T1 : la visionneuse peut charger le Draftsman (essai de faisabilité)
Charger `fontes/plans-sans.js`, `29-draftsman.js` et `33-draftsman-export.js`
dans le banc de la visionneuse, sans le reste de l'éditeur. Sortir le PDF
d'une feuille vide et un DXF minimal.
- [x] `dfNouvelle` + `dfCadre` + `dfPdf` donnent un PDF commençant par `%PDF`, fonte embarquée comprise
- [x] `dxfNouveau` + `dxfContour` + `dxfOctets` donnent un DXF
- [x] Ce qui manque (`S`, `fmt`, `clamp`, autre) est listé et la parade choisie (voir le risque n° 1 du plan)
  → Manquaient `clamp`/`fmt` (posés par `08-dossier-meca.js`) et `dfCfg().fonte` dans `dfFontePreparer` : `dfPdf` le lit désormais dans `meta.fonte` s'il est donné. Pas de `S` global (`commun/ia-assistant.js` s'en sert pour reconnaître l'outil).
- Vérifier : `JS_VIS`
- Fichiers : `visionneuse-ipc2581/test/harness-sim.js`
- Taille : S

### T2 : `mecaDonnees(entree, lib, reglages)`, le calcul pur
Fixations (hypothèse 4), hauteurs (saisie > fichier > LIB par Part Name puis
par référence fabricant), ouvertures (hypothèse 5), hauteur maximale par
face, non-montés gardés, avertissements. Le format `web_cao-meca-1` est
celui de la spec.
- [x] Essais de la spec n° 2, 3 et 4 sur une entrée écrite à la main
- [x] Un composant sans hauteur donne `null`, `"inconnue"` et un avertissement
- [x] `JSON.parse(JSON.stringify(json))` redonne le même objet (aucun `NaN` ni `Infinity`)
- Vérifier : `BUILD && JS_PCB`
- Fichiers : `commun/dossier-meca.js` (nouveau), `editeur-pcb/editeur-pcb.html`, `editeur-pcb/test/harness.js`
- Taille : M

### Point de contrôle 1
- [x] `JS_PCB` et `JS_VIS` passent
- [x] Le résultat de T1 est connu et la parade notée dans le plan

## Phase 2 : éditeur de bout en bout

### T3 : `mecaEntreeEditeur()`, l'entrée tirée de `S`
Elle lit le contour (`boardPoly`), les découpes (`boardCutouts`),
l'épaisseur (`stackTotal`), les trous (`S.holes`, pastilles percées des
empreintes de fixation), les corps (`bodyOf` + `fpXform`), la face, Part
Name / MPN et l'état monté (`varEstMonte`). Tout est exprimé dans le repère
des Gerber (`gOrigin`, Y vers le haut), comme `dxfCarte`.
- [x] Sur l'exemple 2 : contour 66 × 42, épaisseur = `stackTotal()`
- [x] Un trou NPTH et une empreinte `MH1` (une pastille percée) deviennent deux fixations, avec Ø et Ø de dégagement
- [x] Un composant du dessous a `face: "dessous"` et son corps au bon endroit (même repère que le DXF)
- Vérifier : `BUILD && JS_PCB`
- Fichiers : `editeur-pcb/js/36-dossier-meca.js` (nouveau), `editeur-pcb/editeur-pcb.html`, `editeur-pcb/test/harness.js`
- Dépend de : T2
- Taille : S

### T4 : feuille « Plan mécanique », vue de dessus
`mecaFeuille(json, ctx)` dessine, avec les primitives `df…`, la vue de
dessus (contour, découpes, trous à leur taille, corps dessus en trait plein
et dessous en tirets, ouvertures en couleur, NM), les cotes hors tout, les
cotes en ordonnée des fixations et les tableaux (fixations, ouvertures,
hauteurs, composants sans hauteur). La case « Plan mécanique » vient dans
`DF_FEUILLES` et dans `dfCfg`, décochée par défaut, et `dfDocument` l'ajoute.
- [x] La feuille sort au PDF avec son cadre et son cartouche ; « 66,00 mm » et « H1 » s'y trouvent par `dfChercher`
- [x] Case décochée : le PDF des plans est inchangé ; les 44 essais Draftsman passent
- [x] Les cotes manuelles se posent sur la vue (`F.vues` déclarée)
- Vérifier : `BUILD && JS_PCB`
- Fichiers : `commun/dossier-meca.js`, `editeur-pcb/js/29-draftsman.js`, `editeur-pcb/test/harness.js`
- Dépend de : T3
- Taille : M

### T5 : vues de face et de côté
La carte en coupe à son épaisseur, chaque composant en pavé de sa hauteur
au-dessus ou en dessous, et la hauteur maximale de chaque face cotée.
- [x] La vue de face montre le composant le plus haut à sa hauteur (cote présente, valeur juste)
- [x] Un composant sans hauteur est dessiné en pointillés à 0, et cité dans le tableau
- Vérifier : `BUILD && JS_PCB`
- Fichiers : `commun/dossier-meca.js`, `editeur-pcb/test/harness.js`
- Dépend de : T4
- Taille : S

### T6 : `crc32` / `zipBlob` déplacés dans `commun/zip.js`
Le code est déplacé tel quel. La balise est ajoutée avant `04-fabrication.js`.
- [x] Les essais zip existants passent sans retouche (`crc32("123456789")`, marque d'ordre des CSV, contenu)
- [x] `fabrication.zip` contient les mêmes fichiers qu'avant
- Vérifier : `BUILD && JS_PCB`
- Fichiers : `commun/zip.js` (nouveau), `editeur-pcb/js/04-fabrication.js`, `editeur-pcb/editeur-pcb.html`
- Taille : XS

### Point de contrôle 2
- [ ] `JS_PCB` passe ; la feuille s'affiche dans la fenêtre Plans (contrôle à la main)

### T7 : DXF, zip et bouton « Dossier méca .zip »
`mecaDxf(json)` donne la carte à 1:1 : contour par `dxfContour`, découpes,
un CIRCLE par trou, corps par face, hauteur dans le nom du calque, cotes hors
tout. `mecaZip(json, feuille, base)` donne `<base>-MECA.zip`, qui contient
le PDF, le JSON et le DXF. Le bouton se place à côté des boutons DXF
(`dfxCadre`).
- [ ] Le zip contient `-PLAN-MECA.pdf`, `-MECA.json` et `-MECA.dxf` ; le JSON se relit
- [ ] Le DXF a un CIRCLE par trou et les calques `CORPS_DESSUS_…` / `CORPS_DESSOUS_…`
- [ ] Le `-CARTE.dxf` et `fabrication.zip` sont inchangés
- Vérifier : `BUILD && JS_PCB`
- Fichiers : `commun/dossier-meca.js`, `editeur-pcb/js/36-dossier-meca.js`, `editeur-pcb/js/33-draftsman-export.js`, `editeur-pcb/test/harness.js`
- Dépend de : T5, T6
- Taille : M

### T8 : réglages manuels dans l'éditeur
Quand la case « Plan mécanique » est cochée, la fenêtre Plans montre un
tableau des composants : repère, hauteur (champ, avec la valeur de la LIB en
grisé), case « ouverture ». Les valeurs vont dans `S.dessin.meca`, bornées
par `dfCfg` : hauteur entre 0 et 100 mm, identifiants existants seulement.
La LIB vient de `pcbChargerCsvLib()`.
- [ ] Une hauteur saisie l'emporte et donne `source_hauteur: "saisie"`
- [ ] La case retire ou ajoute une ouverture ; le choix survit à `serialize` → `loadDoc`
- [ ] Une valeur invalide (texte, négative, `1e9`) est refusée sans casser le document
- Vérifier : `BUILD && JS_PCB` ; contrôle à la main dans le navigateur
- Fichiers : `editeur-pcb/js/29-draftsman.js`, `editeur-pcb/js/36-dossier-meca.js`, `editeur-pcb/css/…` (si besoin), `editeur-pcb/test/harness.js`
- Dépend de : T7
- Taille : M

### Point de contrôle 3 : éditeur terminé
- [ ] Critères 1 à 4 tenus sur la carte d'exemple
- [ ] Contrôle à la main : ouvrir Plans, cocher la case, télécharger le zip, ouvrir le PDF et importer le DXF
- [ ] Relecture humaine avant la visionneuse

## Phase 3 : visionneuse

### T9 : le parseur lit le corps et la hauteur des boîtiers
`<Package><Outline><Polygon>` donne `corps`, et l'attribut `height` du
`<Package>` donne `hauteur`. Les clés sont absentes quand le fichier ne les
porte pas.
- [ ] Une carte d'essai avec `height` et `<Outline>` donne `hauteur` et `corps` par composant, dans le repère de la carte (rotation et miroir appliqués comme pour les pastilles)
- [ ] Sans eux, rien ne change dans le modèle (les essais existants passent)
- Vérifier : `PY_VIS && COMP`
- Fichiers : `python/ipc2581_data.py`, `python/ipc2581_parser.py`, `python/ipc2581_json.py`, `visionneuse-ipc2581/test/banc-essai.py`
- Taille : M

### T10 : l'export IPC de l'éditeur écrit la hauteur
`height` du `<Package>` quand la hauteur est connue (saisie ou LIB). On
réutilise la recherche de T2/T3.
- [ ] Un export suivi d'une relecture par la chaîne de la visionneuse redonne la hauteur
- [ ] Sans hauteur connue, l'attribut est absent (le XSD le permet)
- Vérifier : `BUILD && JS_PCB && PY_EXP`
- Fichiers : `editeur-pcb/js/35-ipc2581-export.js`, `editeur-pcb/test/banc-ipc2581-export.py`
- Dépend de : T3, T9
- Taille : S

### T11 : `mecaEntreeIpc(modele)`, l'entrée de la visionneuse
- Le contour vient de `contour.o` et les découpes de `contour.t`.
- L'épaisseur vient de `epaisseur`, sinon de la somme d'`empilage[].ep`, sinon un avertissement.
- Les trous viennent de `percages` (NON_PLATED, pastille du padstack).
- La face se lit par `calques`.
- Le corps vient de `corps`, sinon de la boîte des pastilles avec `corps_estime`.
- La hauteur vient de `hauteur`, avec `part`, `props.PART_NAME` et `props.MPN`.
- [ ] Sur le JSON du banc de T9 : face, NPTH, `corps_estime`, épaisseur de repli
- [ ] Le même composant donne, à 0,01 mm près, le même corps que dans l'éditeur (export IPC de la carte d'exemple)
- Vérifier : `JS_VIS`
- Fichiers : `visionneuse-ipc2581/js/08-dossier-meca.js` (nouveau), `visionneuse-ipc2581/test/harness-sim.js`
- Dépend de : T2, T9
- Taille : S

### T12 : fenêtre « Dossier méca » de la visionneuse
- Les balises : `commun/zip.js`, la fonte, 29, 33, `commun/dossier-meca.js`, `08-dossier-meca.js`, avec la parade de T1.
- Un bouton dans la barre ouvre une fenêtre avec le tableau des composants (hauteur, case), l'aperçu `dfSvg` de la feuille et « Télécharger .zip ».
- La LIB vient de `GET /api/lib/composants`. Les réglages vont dans `V.modele.meca`, donc dans `-IPC.json`.
- [ ] Sur un IPC exporté par l'éditeur, le zip a les mêmes trous, corps et hauteurs que celui de l'éditeur (critère 5)
- [ ] Sans serveur (`.json` rouvert), la fenêtre marche avec les hauteurs du fichier et le dit
- [ ] Les réglages survivent à « Exporter .json » puis réouverture
- Vérifier : `JS_VIS` ; contrôle à la main dans le navigateur
- Fichiers : `visionneuse-ipc2581/visionneuse-ipc2581.html`, `visionneuse-ipc2581/js/08-dossier-meca.js`, `visionneuse-ipc2581/css/…`
- Dépend de : T1, T7, T11
- Taille : M

### Point de contrôle 4 : fini
- [ ] Les critères 1 à 6 sont tenus (critère 6 : donner le JSON de la carte d'exemple à une IA et contrôler sa réponse à la main)
- [ ] `editeur-pcb/README.md`, `visionneuse-ipc2581/README.md` et `A-FAIRE.md` sont à jour
- [ ] `/review` est passé
- [ ] Proposer la mise à jour du graphe (`/graphify`)
