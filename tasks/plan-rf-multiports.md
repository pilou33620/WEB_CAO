# Plan : simulation RF à plus de deux ports

Source : `SPEC-rf-multiports.md`. La liste cochable est dans `tasks/todo-rf-multiports.md`.

## Vue d'ensemble

Le solveur n'est limité à deux ports que par trois endroits : `_valider`, `_s_ports` (boucles
`range(2)`, tableau 2×2) et les champs du résultat (`s21`, `zin`, `zout`, `bilan`). L'assemblage
nodal (`analyser`) ne sait rien du nombre de ports : il pose le réseau, puis appelle `_s_ports`.
Le travail est donc : généraliser `_s_ports` et `analyser`, écrire N ports en Touchstone, puis
faire suivre la page.

Le code de la page est dans `commun/simulation-em.js` (onglet S21), partagé par l'éditeur PCB et
la visionneuse. Un seul endroit à changer pour les deux outils.

## Ce que le code montre (relevé avant le plan)

| Où | Constat | Conséquence |
|---|---|---|
| `rf_reseau.py` `_valider` (l. 1851) | `len(ports) != 2` refuse ; renvoie `z, noeuds` ; contrôle « même nœud » écrit pour la paire | boucle sur toutes les paires, `MAX_PORTS = 4` |
| `rf_reseau.py` `_s_ports` (l. 2502) | `rhs` de 2 colonnes, `s` 2×2, `impedances` par `(zin, zout)`, `energie` seulement `j == 0` | N colonnes, `s` N×N, une Z vue par port, `energie` par port attaqué |
| `rf_reseau.py` `analyser` (l. 2319) | appelle `_s_ports` deux fois (Z réelles du calcul, puis 50 Ω pour l'export) ; `bilan` lit `s0[1, 0]`, `s0[0, 0]` | les deux appels deviennent N ports ; `bilan` reste 1 → 2, `bilans` s'ajoute |
| `simulation_em.touchstone` (l. 8140) | écrit 4 valeurs par fréquence, ordre 2 ports | N ports, branche 2 ports gardée telle quelle (ordre S11 S21 S12 S22) |
| `lire_touchstone` | lit déjà les `.sNp` | sert au banc d'aller-retour |
| `simulation-em.js` l. 16451 `ports=[null,null]`, 16784 `PP=[…ports[0], …ports[1]]`, 16862 | la marche part du port 1 et vérifie le port 2 | boucle sur `rf.ports`, refus nommé par port |
| `simulation-em.js` `simRfPortsEcrire`, `simRfBilan`, `simRfCourbe`, `simRfSmith` | un port 1, un port 2 en dur | lignes de ports dynamiques, menu Sij, menu « de → vers » |
| Harnais de page | `harness-sim.js` et `harness.js` listent `simRfProbleme`, `simRfClic`, `SIM_RF_ATTENTE`… | rien à ajouter si les fonctions gardent leur nom ; sinon mise à jour du harnais |
| `web_CAO.py` `_rf_lancer` | passe le document tel quel à `analyser` | aucun changement attendu ; le banc de routes le confirme |
| MCP (`mcp_api_outils.py` l. 26) | route `simulation_rf` vers `/api/simulation-rf` | à relire à l'implémentation : doc des ports dans la description de l'outil |

## Décisions d'architecture

- **D1 — N colonnes dans une seule factorisation.** `_s_ports` garde son principe (force
  électromotrice de 1 V derrière Zk, les autres ports fermés sur leur référence) et empile N
  seconds membres. Pas de nouvelle fonction.
- **D2 — `bilan` inchangé, `bilans` ajouté.** La page lit `bilans` pour son couple choisi ;
  les clients qui ne lisent que `bilan` ne voient rien changer. À N = 2, `bilans` a deux
  entrées (1 → 2 et 2 → 1), `bilan` reste la première.
- **D3 — `energie` (voisines) par attaque.** Calculée pour chaque port attaqué, rapportée à sa
  puissance disponible (4 Rj Σ G |V|²). C'est la même formule qu'aujourd'hui avec j au lieu de 0.
- **D4 — Pas de nouveau format.** `FORMAT` reste `cao-sim-rf-1` ; `n_ports` s'ajoute au résultat,
  absent = 2.
- **D5 — Page.** `rf.ports` s'allonge, un état gardé à 2 ports se relit tel quel.
  Les lignes de ports sont dessinées par une boucle, pas écrites en double.

## Ordre de construction

1. **Solveur** : `_valider`, `_s_ports`, `analyser` (bilans, zports, voisines), `MAX_PORTS`.
   Banc : les cas actuels inchangés, puis les cas à 3 et 4 ports.
2. **Touchstone** : écriture N ports, aller-retour avec `lire_touchstone`.
3. **Page** : ports dynamiques, marche vers tous les ports, menus Sij et « de → vers »,
   table des Sij, export `.sNp` (nom du fichier selon N).
4. **Documentation** : `docs/simulation-em.md` (section RF), docstring de `rf_reseau.py`,
   `A-FAIRE.md` (ligne remplacée par la fonction livrée).

## Risques

- Une régression à 2 ports serait sournoise : le critère 1 de la spec (chiffres identiques,
  tous les bancs actuels) est l'arrêt-net de chaque étape.
- Le tri des fichiers `.s2p` de l'utilisateur (renormalisés à 50 Ω) ne doit pas changer :
  l'écriture 2 ports garde sa branche d'origine.
- L'abaque de Smith et les courbes sont du code de page long (`simRfSmith`, `simRfCourbe`) :
  on les rend paramétrables par (i, j), on ne les réécrit pas.
