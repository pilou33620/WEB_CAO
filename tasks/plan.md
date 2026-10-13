# Plan d'implémentation : classes d'interface

Source : `SPEC.md` (USB FS/HS, Ethernet 100BASE-TX/1000BASE-T, LVDS, CAN,
RS-485). La liste cochable est dans `tasks/todo.md`.

## Vue d'ensemble

Une classe d'interface est une classe de net ordinaire : son nom voyage
déjà comme une chaîne du schéma au PCB, du PCB au serveur (`natures`) et
dans le fichier IPC-2581. Il n'y a donc pas de nouveau tuyau à poser.

- **Côté serveur**, deux choses changent :
  - tester la **famille** de la classe là où l'on teste aujourd'hui son nom ;
  - lire le front, la cadence, Z₀ et Z_diff dans une table.
- **Côté pages**, la même table alimente les menus et le panneau.

## Ce que le code montre (relevé avant le plan)

| Où | Constat | Conséquence |
|---|---|---|
| `analyse_carte._reglages` | part de `TR_CLASSES` / `CADENCES`, puis fusionne `reglages.tr` / `cadences` envoyés par la page | une classe d'interface présente dans `reg["tr"]` est jugée à son front par `_par_frequence` et `_plus_vite`, **sans autre changement** |
| `analyse_carte` l. 3509 | le rapport **recopie `reg`** (`"reglages": reg`) | ajouter les interfaces à `TR_CLASSES`, ou les envoyer toujours depuis la page, **changerait le rapport** de toute carte (critère 7) |
| `simCarteReglagesDoc` (`commun/simulation-em.js`) | envoie `tr` et `cadences` en entier | même conséquence que la ligne précédente |
| `simCarteReglagesCharger` | `Object.assign(defaut, mémorisé)` | les réglages mémorisés se complètent **déjà** avec les nouvelles clés : il suffit d'un essai |
| `analyse_carte` l. 1712, 1929 (`_tient_z`), 2376, et `_signal` | tests sur le nom de classe | l. 1712, 1929 et 2376 passent par `famille()` ; `_signal` n'exclut que Masse, Alimentation, Découpage et Antenne, donc il reste juste tel quel |
| `analyse_carte` l. 2716 | `zt = reg["zdiff"]`, une seule cible pour toutes les paires | la cible se prend par paire |
| `simNaturePcb` (`editeur-pcb/js/19-simulation.js`) | rattache la classe PCB à une nature par les regex de `SCH_CLASSES` | une classe « USB HS » y tomberait sur **Lent** : il faut tester d'abord le nom exact de l'interface |
| `mdlNatureDeClasse` (visionneuse) | même mécanisme de regex | même correctif |
| `crosstalk.py` | n'importe que la bibliothèque standard en tête ; numpy et `simulation_em` sont dans un `try` | `analyse_carte` peut l'importer en tête sans cycle (vérifié : ni `simulation_em` ni `ligne_mom` n'importent `analyse_carte`) |
| Pages | `session.js` et `projet.js` sont chargés par les trois outils ; `simulation-em.js` par le PCB et la visionneuse ; `contraintes.js` par le PCB et le schéma | voir D1 |

## Décisions d'architecture

- **D1. Une table JS dans un nouveau fichier `commun/classes-interface.js`,**
  chargé par les trois pages et les trois bancs.
  - `projet.js` parle du nom de projet, et la table n'y a pas sa place.
  - `monofichier.py` intègre tout `<script src>` de la page : rien à
    déclarer, à vérifier en T4.
  - Contenu : `CLASSES_INTERFACE = {nom: {famille, tr, cadence, z0, zdiff}}`
    et `familleClasse(nom)`.
- **D2. La table Python vit dans `crosstalk.py`** : `INTERFACES` et
  `famille(classe)`, comme le dit la spec.
  - `analyse_carte` en tire `INTERFACES` et `famille` par un import en
    tête.
  - `TR_CLASSES` et `CADENCES` de base **ne changent pas**.
- **D3. Un rapport identique au bit près sans interface :** le serveur
  n'ajoute une interface à `reg` (`tr`, `cadences`, `z0_classes`,
  `zdiff_classes`) **que si un net du document porte cette classe**.
  - Les valeurs du panneau passent devant les défauts de la table.
  - Les clés d'interface envoyées pour une classe absente sont ignorées.
  - Ce filtrage se fait à **un seul** endroit, côté serveur : la page peut
    continuer d'envoyer `tr` et `cadences` en entier.
- **D4. Une seule aide côté serveur, `famille(classe)`.** Elle rend la
  famille d'une interface et la classe elle-même sinon. `RAPIDES` et
  `CLASSES_Z` ne changent pas : on teste `famille(c) in RAPIDES`.
- **D5. Côté PCB, une classe d'interface créée sur la carte prend les
  règles de sa famille** (`SCH_CLASSES[famille]`) : largeur, isolement,
  via. C'est la réponse proposée à la question ouverte 4 (voir plus bas).

## Graphe des dépendances

```
T1 table Python + front_de_classe (crosstalk.py)
 └─ T2 analyse_carte : réglages filtrés + familles   ← risque principal (critère 7)
     └─ T3 Z_diff par paire (zdiff_classes)
T4 table JS commun/classes-interface.js (+ 3 pages, 3 bancs)
 ├─ T5 PCB : menu, simNaturePcb, autoPairs
 │   └─ T6 panneau de vérification (simulation-em.js) : lignes, envoi, mémoire
 ├─ T7 schéma : menu, passage au PCB          (dépend aussi de T5 pour l'essai de bout en bout)
 └─ T8 visionneuse : nature, mémoire, envoi    (dépend de T6 : même panneau)
T9 docs : A-FAIRE.md, État des lieux, aides du panneau
```

Les tâches T1 à T3 (Python) et T4 (table JS) sont indépendantes et
peuvent se mener en parallèle. Les tâches T5 à T8 touchent des fichiers
distincts, sauf T6 et T8 qui partagent le panneau.

## Liste des tâches

### Phase 1 : serveur
- [x] T1 : la table `INTERFACES`, `famille()` et `front_de_classe` (crosstalk)
- [ ] T2 : `analyse_carte` juge une interface à son front, selon sa famille, avec un rapport identique sans interface
- [ ] T3 : la Z_diff par classe pour les paires (`zdiff_classes`)

### Point d'étape 1
- [ ] `banc-analyse-carte`, `banc-crosstalk` et `banc-serveur-routes` passent, `compileall` est propre
- [ ] Le cas TRD1_N n'est plus condamné par la règle de retour
- [ ] Relecture humaine avant de passer au JS

### Phase 2 : pages
- [ ] T4 : `commun/classes-interface.js`, chargé par les trois pages et les trois bancs
- [ ] T5 : PCB : menu de classe, `simNaturePcb`, `autoPairs`
- [ ] T6 : le panneau de vérification : une ligne par interface, Z_diff, envoi, réglages mémorisés
- [ ] T7 : le schéma : menu de classe et passage au PCB
- [ ] T8 : la visionneuse : nature d'interface, mémoire par fichier, envoi

### Point d'étape 2
- [ ] Les sept bancs de la spec passent
- [ ] Les bundles monofichiers se construisent et contiennent la table
- [ ] Vérification à la main dans le navigateur (carte TRD1_N)

### Phase 3 : finition
- [ ] T9 : A-FAIRE.md, l'État des lieux et les aides du panneau

### Point d'étape final
- [ ] Les critères 1 à 8 de la spec sont tenus et couverts
- [ ] `/review` avant de déclarer le travail fini

## Risques et parades

| Risque | Impact | Parade |
|---|---|---|
| Le rapport change pour une carte sans interface (`reg` y est recopié) | Haut | D3, et un essai de non-régression qui compare un rapport avec et sans `reglages.tr` étendu, **écrit en premier dans T2** |
| Une classe d'interface tombe sur « Lent » dans `simNaturePcb` ou `mdlNatureDeClasse` (regex) | Haut, en silence | Tester le nom exact de l'interface **avant** les regex ; un essai par outil |
| Un nom d'interface est capté par une regex existante (`/rf\b/`, `/rapide\|fast/`…) | Moyen | Un essai qui passe les sept noms dans `mdlNatureDeClasse` et `simNaturePcb` |
| `crosstalk.py` expose `tr_classes: TR_CLASSES` dans sa description (l. 961) | Faible | La laisser telle quelle : elle ne fait pas partie du rapport de carte |
| L'import en tête de `crosstalk` alourdit le chargement d'`analyse_carte` (numpy et `simulation_em`) | Faible : `analyse_carte` importe déjà numpy | Si gênant, sortir la table dans `python/classes_interface.py`, ce qui demande votre accord car cela s'écarte de la spec |
| Le tableau du panneau devient trop large avec une colonne Z_diff et 13 lignes | Moyen (UI) | Afficher la Z_diff seulement sur les lignes d'interface (« — » ailleurs), comme Z₀ aujourd'hui |

## Décisions prises (13/10/2026, voir SPEC.md)

1. **Valeurs par défaut** : celles du tableau de la spec.
2. **Pas de Z₀ de brin** : on ne juge que la Z_diff de la norme. On en tire
   **D6** :
   - `_tient_z(reg, c)` vaut, pour une interface, `c in z0_classes` ;
   - la famille Rapide ne suffit pas à tenir une Z₀ ;
   - la table ne porte pas de clé `z0`.
3. **Noms courts** : USB FS, USB HS, ETH 100, ETH 1000, LVDS, CAN, RS-485,
   avec la clé `nom` (le nom long) en info-bulle.
4. **Largeur côté PCB** : celle de la famille (D5).
