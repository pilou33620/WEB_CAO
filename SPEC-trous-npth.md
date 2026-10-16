# Spec : trous non métallisés et perçages oblongs dans les empreintes

Origine : complétion de la LIB (commit PROJETS `eee214b`, 16/10/2026). Sur
les 167 empreintes créées, une vingtaine décrivent **en texte** des trous
que le format ne sait pas porter : trous de centrage, trous de fixation,
perçages oblongs. Les composants de méca (MECA-LOC, entretoises nylon, vis)
sont restés sans empreinte pour la même raison.

## Objectif

Aujourd'hui, un trou non métallisé (NPTH) n'existe qu'au niveau de la carte
(`S.holes`, posé à la main). Une empreinte ne connaît que des pastilles, et
un perçage de pastille est toujours rond et toujours métallisé. Conséquences :

- les trous de centrage d'un RJ45, d'un M.2 ou d'un support de pile sont à
  reposer à la main sur chaque carte, à la bonne place ;
- un trou de locating MECA-LOC ne peut pas être un composant ;
- les pattes oblongues du blindage USB-C TE 2305018-2 sont réduites à un
  trou rond de 0,45 mm, et l'oblong doit être demandé à part au fabricant.

On ajoute à l'empreinte :

- des **trous non métallisés**, qui suivent l'empreinte (position, rotation,
  face) et empruntent tout le circuit existant des trous de carte ;
- des **perçages oblongs**, métallisés (dans une pastille) ou non (trou
  d'empreinte ou de carte), exportés en Excellon G85.

Utilisateur : le concepteur qui crée des empreintes (Gestion LIB, JSON de la
LIB) puis les pose sur une carte dans l'éditeur PCB et sort les fichiers de
fabrication.

## Carte des capacités (validée le 16/10/2026)

| Module | Capacité | Dépend de |
|---|---|---|
| **M1** | Trous ronds NPTH dans une empreinte, de la LIB jusqu'aux fichiers de fabrication | — |
| **M2** | Perçages oblongs : pastille métallisée oblongue, trou NPTH oblong (empreinte et carte), export G85 | M1 |
| **M3** | Mise à jour des empreintes de la LIB qui décrivent ces trous en texte, puis empreintes MECA-LOC | M1, M2 |

Ordre : M1 → M2 → M3. Chaque module est livré, testé et commité avant le
suivant.

## Format (pcbfp-1, rétrocompatible)

Un nouveau champ facultatif `holes`, à côté de `pads` :

```json
"holes": [
  {"x": -5.715, "y": 3.05, "d": 3.25},
  {"x": 0, "y": 6.0, "d": 1.0, "w": 2.6, "rot": 90}
]
```

- `x`, `y` en mm dans le repère de l'empreinte : vue de dessus, y vers le
  bas, comme `pads`. `d` est le diamètre du trou fini.
- Pas de numéro, pas de net : un trou n'est pas une broche.
- M2 : `w` > `d` en fait un oblong. `d` est alors la largeur, `w` la longueur
  hors tout, et `rot` (en degrés) l'orientation de la grande longueur.
- Pastille oblongue (M2) : la pastille garde `drill` (la largeur) et gagne
  `slot` (la longueur hors tout), orienté selon la grande dimension de la
  pastille.
- Un fichier sans `holes` ni `slot` se lit et s'exporte **au bit près** comme
  aujourd'hui.

## Comportement attendu (critères d'acceptation)

### M1 — trous ronds NPTH dans l'empreinte

1. **Lecture et écriture.** `normFpDef` / `fpDefOf` lisent et écrivent
   `holes`, avec les mêmes bornes que `normHole` (Ø 0,4 à 30 mm). Une valeur
   hors bornes est ramenée, une entrée illisible est ignorée.
2. **Pose sur la carte.** `fpApplyDef` recopie les trous sur l'empreinte de
   la carte. Le fichier de carte les enregistre et les relit.
3. **Repère monde.** Une fonction unique rend tous les trous NPTH de la
   carte : ceux de `S.holes`, plus ceux des empreintes passés par
   `fpXform` (translation, rotation, miroir sur la face dessous). Chaque trou
   y porte son origine (`fp` ou carte).
4. **Mêmes consommateurs que les trous de carte.** Ceux qui lisent
   aujourd'hui `S.holes` passent par cette fonction :
   - rendu (`03-render.js`) ;
   - contrôles d'écartement (`02-connectivity.js`) ;
   - plus petit NPTH face au fabricant (`24-pcb-capabilities.js`) ;
   - Excellon NPTH (`04-fabrication.js`) ;
   - IPC-2581 (`35-ipc2581-export.js`) ;
   - Draftsman (`29`, `33`, `34`) ;
   - dossier méca (`36`) ;
   - obstacles du placement (`28`).

   L'édition, la sélection et la suppression restent réservées à `S.holes`.
   Un trou d'empreinte bouge avec son empreinte.
5. **Contrôles.** Un trou d'empreinte est contrôlé comme un trou de carte :
   - bord de carte, trou à trou, via, perçage de pastille et piste ;
   - plus cuivre et zones des autres nets, déjà couverts pour `S.holes`.

   Seul ajout : un trou d'empreinte contre une pastille **de la même
   empreinte** n'est pas signalé en deçà de l'écartement, si la fiche l'a
   voulu ainsi (cas des entretoises Würth). Le chevauchement reste signalé.
6. **Mise à jour depuis la LIB.** L'alerte « empreinte de la LIB modifiée »
   (`21-lib-sync.js`) propose aussi les trous. Accepter la mise à jour remplace
   les trous de l'empreinte posée.
7. **Gestion LIB.**
   - Le moteur `02-rendu-pcb.js` dessine les trous : cercle sans cuivre,
     contour sérigraphie.
   - L'éditeur d'empreintes permet d'ajouter, déplacer et supprimer un trou,
     et d'en régler le diamètre.
   - La vue JSON les garde.
   - L'aperçu du catalogue les montre.
8. **IPC-D-356.** Comme les trous de carte aujourd'hui : non exportés.

### M2 — perçages oblongs

1. Trou oblong NPTH (empreinte et carte) et pastille oblongue métallisée,
   au format décrit plus haut.
2. **Rendu** du perçage oblong, dans l'éditeur PCB et dans la Gestion LIB.
3. **Excellon** :
   - le perçage oblong sort en `X..Y..G85X..Y..` ;
   - les oblongs métallisés vont dans le fichier PTH, les non métallisés dans
     le fichier NPTH ;
   - l'outil est la largeur.
4. **Contrôles** :
   - les distances se calculent contre la forme oblongue, pas contre un
     cercle ;
   - la largeur est jugée face aux tables du fabricant (`slots.platedMinW_*`,
     `slots.nonPlatedMinW`, rapport longueur/largeur) déjà présentes dans
     `24-pcb-capabilities.js`.
5. **IPC-2581** : le perçage oblong est déclaré comme un oblong.
6. **Gerber cuivre** : la pastille oblongue garde son ouverture actuelle.
   Seul le perçage change.

### M3 — LIB

1. Les empreintes dont la description demande d'« ajouter sur la carte » des
   trous reçoivent des `holes`, et leur description est raccourcie d'autant.
   Liste de départ, à relire une par une contre la fiche :
   - Amphenol-10132797-021100LF, Amphenol-10128798-005RLF ;
   - Bulgin-BX0037, Keystone-1067, MPD-BA2AAPC ;
   - JST-B5B-XH-A, Molex-22-05-3051/3061/3081 ;
   - Pulse-JXT7-1140NL, Pulse-J0011D01BNL ;
   - Samtec-CLP-120-02-D-A, Samtec-FW-03-05-G-D-255-217-A ;
   - Tag-Connect-TC2030-IDC-NL, Quectel-L80, TE-2305018-2 ;
   - Wurth-9774030151R, Wurth-9774040360R ;
   - Yamaichi-IC51-0484-806, Trou-metalise-1.3mm-O3.6x1.8.
2. TE-2305018-2 retrouve ses pattes oblongues de la fiche.
3. Empreintes MECA-LOC (Ø 1,5 / 2,0 / 2,1 / 2,5 / 2,6 / 2,7 / 3,2 mm),
   associées dans `LIB_composants.csv`. Une empreinte faite seulement de
   trous doit donc être acceptée (zéro pastille).

## Tech stack

Celle de l'éditeur PCB et de la Gestion LIB :

- JavaScript sans dépendance ni outil de construction ;
- bancs d'essai en Node (`vm`) ;
- serveur Python inchangé.

Aucune bibliothèque ajoutée.

## Commandes

```
node editeur-pcb/test/harness.js
node gestion-lib/test/banc-repere-pcb.js
node gestion-lib/test/banc-catalogue.js
python python/test/banc-lib-routes.py
python -m compileall -q web_CAO.py python
```

Les bundles monofichiers sont produits par `commun/outils/monofichier.py`.
Le plan vérifiera qu'aucun fichier nouveau n'est à y déclarer.

## Structure (où va le code)

- `editeur-pcb/js/05-tools.js` : lecture défensive (`dHoles`, à côté de
  `dPads` et `normHole`).
- `editeur-pcb/js/08-empreinte.js` : `fpDefOf`, `normFpDef`, `fpApplyDef`.
- `editeur-pcb/js/01-core.js` : la fonction unique des trous en coordonnées
  monde, à côté de `padsWorld`.
- Les consommateurs listés en M1-4 : on y remplace `S.holes` par cette
  fonction, sans autre changement de logique.
- `gestion-lib/js/02-rendu-pcb.js` et `05-editeur-lib.js` : dessin et
  édition.
- `PROJETS/LIB_CAO` (M3 seulement, dépôt séparé).

## Style

Le même que le code existant :

- commentaires en français, avec le pourquoi ;
- noms en français quand le voisinage l'est (`trousMonde`, `dHoles`) ;
- une ligne de commentaire par décision non évidente.

```js
/* Un trou d'empreinte suit son empreinte : même passage au monde que les
   pastilles. Les consommateurs ne distinguent plus trou de carte et trou
   d'empreinte — seule l'édition le fait. */
```

## Essais

- **`editeur-pcb/test/harness.js`.**
  - Une empreinte avec deux trous, posée, tournée de 90° puis retournée sur
    la face dessous : les trous tombent aux bonnes coordonnées monde.
  - Ils sortent dans le fichier NPTH et dans l'IPC-2581, et se dessinent.
  - Ils sont signalés trop près d'une piste d'un autre net.
  - Aller-retour fichier de carte.
  - Non-régression : une carte sans trou d'empreinte produit un Excellon et
    un IPC-2581 identiques au bit près.
  - M2 : une ligne G85 attendue, le contrôle oblong contre une piste, la
    largeur sous le minimum du fabricant signalée.
- **`gestion-lib/test/banc-repere-pcb.js`.** Le trou est dessiné au bon
  endroit (y vers le bas) et l'éditeur l'ajoute là où on clique.
- **M3.** Le validateur des empreintes de la LIB (celui du 16/10, à
  reprendre dans le dépôt) accepte `holes`, vérifie qu'aucun trou ne
  chevauche une pastille d'un autre numéro et qu'une empreinte MECA-LOC sans
  pastille passe.

## Limites

- **Toujours :**
  - fichiers sans `holes` ni `slot` lus et exportés au bit près comme avant ;
  - faire tourner les bancs touchés avant chaque commit ;
  - mettre à jour `A-FAIRE.md`.
- **Demander d'abord :**
  - exporter les NPTH dans l'IPC-D-356 ;
  - changer l'écartement par défaut trou ↔ cuivre (`S.rule.hole`) ;
  - toucher au Gerber cuivre des pastilles ;
  - modifier une carte de `PROJETS/CAO`.
- **Jamais :**
  - transformer un trou d'empreinte en trou de carte en silence, ou
    l'inverse ;
  - retirer ou affaiblir un essai existant.

## Critères de réussite

- Un RJ45 Pulse posé sur une carte sort ses trous de centrage dans le
  fichier NPTH, à la bonne place quelles que soient sa rotation et sa face.
- Le TE 2305018-2 sort ses pattes de blindage en G85 dans le fichier PTH.
- Un MECA-LOC se place comme un composant et sort un seul trou NPTH.
- Tous les bancs passent. Les sorties d'une carte existante sans trou
  d'empreinte ne changent pas.

## Questions ouvertes

1. **Fabricant visé.** G85 est retenu ; on vérifiera que le fabricant
   habituel le lit (JLCPCB, PCBWay et Eurocircuits l'acceptent).
2. **Origine d'un oblong.** Pour `holes`, un oblong est-il décrit par son
   centre, sa longueur et son angle (choix ci-dessus), ou par ses deux
   extrémités comme en G85 ? Le plan tranchera d'après le code
   d'export.
