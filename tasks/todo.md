# À faire : classes d'interface

Plan : `tasks/plan.md`. Spec : `SPEC.md`. Les numéros de critère (1 à 8)
renvoient à la spec.

Bancs :
- `PY_AC` = `python python/test/banc-analyse-carte.py`
- `PY_XT` = `python python/test/banc-crosstalk.py`
- `PY_SRV` = `python python/test/banc-serveur-routes.py`
- `JS_PCB` = `node editeur-pcb/test/harness.js`
- `JS_SCH` = `node editeur-schematique/test/harness.js`
- `JS_VIS` = `node visionneuse-ipc2581/test/harness-sim.js`
- `COMP` = `python -m compileall -q web_CAO.py python`

---

## Phase 1 : serveur

### T1 : table `INTERFACES`, `famille()` et `front_de_classe`

**Description.** On ajoute à `crosstalk.py` la table des sept interfaces
(nom long, famille, tr, cadence, zdiff ; pas de z0) et `famille(classe)`, qui rend la famille
d'une interface ou la classe elle-même sinon. `front_de_classe` y lit le
front d'une interface, au lieu de tomber sur « Lent ». `TR_CLASSES` reste
tel quel.

**Critères d'acceptation**
- [x] `front_de_classe("USB HS")` rend `(5e-10, "déduit de la classe « USB HS »")` (critère 6).
- [x] Un front saisi dans le panneau (`tr_classes`) passe encore devant celui de la table.
- [x] `famille("CAN") == "Lent"`, `famille("Rapide") == "Rapide"` et `famille("inconnue") == "inconnue"`.

**Vérification :** `PY_XT` vert, avec deux essais ajoutés ; `COMP` propre.

**Dépendances :** aucune. **Fichiers :** `python/crosstalk.py`, `python/test/banc-crosstalk.py`. **Taille :** S.

### T2 : `analyse_carte` juge une interface à son front et selon sa famille

**Description.**
- `_reglages(doc)` ajoute à `tr` et `cadences` les seules interfaces
  portées par un net de `doc["natures"]` (D3). Les valeurs du
  panneau passent devant les défauts, et une clé d'interface sans net est
  ignorée.
- Les tests de nom passent par `famille()` : `RAPIDES` (l. 1712),
  `_tient_z` (l. 1929) et `("Analogique", "Lent")` (l. 2376).

**Il faut écrire en premier** l'essai de non-régression : une carte sans
interface, dont la page envoie un `tr` étendu, doit donner le même rapport
JSON que sans ce `tr` étendu.

**Critères d'acceptation**
- [x] Le rapport d'une carte sans classe d'interface est identique octet pour octet, même quand `reglages.tr` contient des clés d'interface (critère 7).
- [x] Un net « ETH 100 » est jugé à 3 ns et n'est pas condamné par la règle `retour`, là où « Rapide » le condamne (critère 2).
- [x] USB HS compte comme rapide pour le retour, et CAN compte comme Lent dans le découplage (critère 3).
- [x] Une interface sans Z₀ saisie ne tient aucune Z₀. Avec une Z₀ dans `z0_classes`, elle se juge face à elle (critère 5, D6).

**Vérification :** `PY_AC` vert, avec les trois cas ; `COMP` propre.

**Dépendances :** T1. **Fichiers :** `python/analyse_carte.py`, `python/test/banc-analyse-carte.py`. **Taille :** M.

### T3 : la Z_diff par classe pour les paires

**Description.**
- Le serveur lit une nouvelle clé `zdiff_classes`, sur le modèle de
  `z0_classes`, et la filtre comme en D3.
- La règle *paires* prend la cible de la classe de P, et sinon
  `reg["zdiff"]`.

**Critères d'acceptation**
- [x] Une paire USB à 90 Ω est jugée correcte face à 90 Ω (critère 4).
- [x] Sur la même carte, une paire ETH à 90 Ω est signalée face à 100 Ω.
- [x] Une paire de classe ordinaire garde la `zdiff` de la carte, sans `zdiff_classes` dans le rapport.

**Vérification :** `PY_AC` et `PY_SRV` verts.

**Dépendances :** T2. **Fichiers :** `python/analyse_carte.py`, `python/test/banc-analyse-carte.py`. **Taille :** S.

## Point d'étape 1
- [x] `PY_AC`, `PY_XT`, `PY_SRV` et `COMP` verts
- ~~Le cas TRD1_N n'est plus condamné~~ (retiré le 22/10/2026 : essai abandonné)
- [ ] Relecture humaine, puis un commit par tâche

---

## Phase 2 : pages

### T4 : `commun/classes-interface.js`

**Description.** La table JS `CLASSES_INTERFACE` reprend les mêmes
valeurs que `INTERFACES`, avec la fonction `familleClasse(nom)`. Le
fichier est chargé par :
- `editeur-pcb.html`, `editeur-schematique.html` et
  `visionneuse-ipc2581.html`, avant les scripts qui s'en servent ;
- les trois bancs JS.

**Critères d'acceptation**
- [x] Les trois pages et les trois bancs chargent le fichier.
- [x] Les bundles de `monofichier.py` le contiennent.
- [x] Un essai compare la table JS à la table Python (un banc Python relit le fichier JS, ou un JSON commun s'il est plus simple) : les deux ne peuvent pas diverger en silence.

**Vérification :** `JS_PCB`, `JS_SCH`, `JS_VIS` et `PY_AC` verts ; le bundle se construit.

**Dépendances :** aucune. **Fichiers :** `commun/classes-interface.js`, les 3 `.html`, les 3 bancs. **Taille :** M.

### T5 : PCB : menu de classe, `simNaturePcb` et `autoPairs`

**Description.**
- Les sept interfaces s'ajoutent à `classesAProposer` et
  `classOptionsHtml`, dans le groupe « Nouvelle classe ».
- `schClass` crée une classe d'interface avec les règles de sa famille
  (D5).
- `simNaturePcb` rend le nom exact de l'interface **avant** de tester les
  regex.
- `autoPairs` teste la famille (critère 8).

**Critères d'acceptation**
- [x] Les sept interfaces apparaissent dans le menu ; une fois choisie, l'interface est créée avec la largeur de sa famille (critère 1).
- [x] `simNaturePcb` rend le nom exact pour chacun des sept noms, et rend toujours la même chose pour les classes d'avant.
- [x] `autoPairs` crée une paire « USB HS » / « USB HS » et refuse une paire CAN / CAN.

**Vérification :** `JS_PCB` vert, avec les essais ajoutés.

**Dépendances :** T4. **Fichiers :** `editeur-pcb/js/01-core.js`, `editeur-pcb/js/19-simulation.js`, `editeur-pcb/test/harness.js`. **Taille :** S.

### T6 : le panneau de vérification

**Description.** Dans `commun/simulation-em.js` :
- une ligne par interface (t_r, cadence, Z₀, Z_diff), chacune dans son
  unité ;
- `simCarteReglagesDoc` envoie `zdiff_classes`, et `z0_classes` pour une
  interface seulement si une Z₀ y est saisie (champ vide par défaut) ;
- les réglages mémorisés se complètent, ce que le code fait déjà : un
  essai suffit.

**Critères d'acceptation**
- [x] Le panneau montre les sept lignes ; Z_diff est vide (« — ») pour les classes d'avant (critère 7).
- [x] `simCarteReglagesDoc` envoie `zdiff_classes` et `z0_classes` d'interface.
- [x] Des réglages mémorisés sans ces clés se chargent complétés, et les valeurs saisies sont gardées.

**Vérification :** `JS_PCB` et `JS_VIS` verts.

**Dépendances :** T3, T4. **Fichiers :** `commun/simulation-em.js`, `editeur-pcb/test/harness.js`. **Taille :** S.

### T7 : le schéma : menu de classe et passage au PCB

**Description.**
- Les interfaces s'ajoutent à `NET_CLASSES` (`04-etat.js`), donc aussi à
  `netClassSelect`, au menu de `23-patterns.js` et au filtre d'import
  (`15-import.js`).
- Le choix passe au PCB par le chemin existant (`publierClasses` →
  `autoClass`).

**Critères d'acceptation**
- [x] Le menu du schéma propose les sept interfaces (critère 1).
- [x] Une classe « ETH 100 » posée dans le schéma arrive telle quelle dans `S.netClass` du PCB.
- [x] Un schéma rouvert garde la classe d'interface (`15-import.js`).

**Vérification :** `JS_SCH` vert, avec l'essai de passage.

**Dépendances :** T4 et T5. **Fichiers :** `editeur-schematique/js/04-etat.js`, `editeur-schematique/test/harness.js`, éventuellement `23-patterns.js`. **Taille :** S.

### T8 : la visionneuse : nature d'interface

**Description.**
- Les interfaces s'ajoutent à `MDL_NATURES_SIGNAL`, donc à
  `pnlSelNature`.
- `mdlNatureDeClasse` reconnaît le nom exact **avant** les regex.
- Le choix est mémorisé dans `netNatures` et part dans `natures`.

**Critères d'acceptation**
- [x] La nature d'interface se choisit, est mémorisée par fichier et part vers le serveur (critère 1).
- [x] Une classe « USB HS » lue dans un IPC-2581 donne la nature « USB HS », pas « Lent ».

**Vérification :** `JS_VIS` vert.

**Dépendances :** T4 et T6. **Fichiers :** `visionneuse-ipc2581/js/02-modele.js`, `visionneuse-ipc2581/test/harness-sim.js`. **Taille :** S.

## Point d'étape 2
- [x] Les sept commandes de la spec sont vertes
- [x] Les bundles monofichiers se construisent
- ~~Vérification à la main : la carte TRD1_N, classée « ETH 100 » dans la visionneuse puis dans le PCB, n'est plus condamnée par la règle `retour`~~ (retiré le 22/10/2026 : essai abandonné)
- [ ] Relecture humaine

---

## Phase 3 : finition

### T9 : la documentation

**Description.**
- A-FAIRE.md : cocher la ligne *Classes d'interface* et mettre l'*État des
  lieux* à jour.
- Ajouter des exemples (`EX`) pour les lignes d'interface du panneau.
- Corriger l'aide « Rapide : USB D+/D−, Ethernet… », qui renvoie désormais
  aux classes d'interface.

**Critères d'acceptation**
- [x] A-FAIRE.md est à jour.
- [x] Les aides du panneau sont justes.

**Vérification :** relecture ; `JS_PCB` vert.

**Dépendances :** T1 à T8. **Fichiers :** `A-FAIRE.md`, `commun/simulation-em.js`. **Taille :** XS.

## Point d'étape final
- [x] Les critères 1 à 8 de la spec sont tenus et couverts, sauf TRD1_N (vérification sur la vraie carte)
- [x] `/review` est passé (revue du 13/10/2026, suites faites le 14/10/2026)
- [x] ~~Proposer la mise à jour du graphe (`/graphify`)~~ : sans objet (pas de graphe dans le dépôt)
