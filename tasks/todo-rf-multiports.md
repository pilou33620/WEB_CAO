# À faire : simulation RF à plus de deux ports

Plan : `tasks/plan-rf-multiports.md`. Spec : `SPEC-rf-multiports.md`. Les numéros de
critère (1 à 5) renvoient à la spec.

Bancs :
- `PY_RF` = `python python/test/banc-rf.py`
- `PY_ROUTES` = `python python/test/banc-serveur-routes.py`
- `JS_PCB` = `node editeur-pcb/test/harness.js` (après `python3 editeur-pcb/outils/build-monofichier.py`)
- `JS_IPC` = le banc de la visionneuse (`visionneuse-ipc2581/test/`)

---

## Phase 1 : solveur

### T1 : 2 à 4 ports dans `_valider` et `_s_ports` (critères 1, 2, 3, 5)
- [ ] `_valider` accepte 2 à `MAX_PORTS` = 4, refuse un nœud commun à deux ports, la masse, une partie réelle ≤ 0
- [ ] `_s_ports` rend N×N, une factorisation, `zports` (Z vue par port) et `energie` par port attaqué
- [ ] À 2 ports, `PY_RF` passe sans changer un chiffre
- [ ] Un T symétrique à 3 ports : S21 = S31, Σ|Si1|² ≤ 1, Sij = Sji
- [ ] Un port de plus fermé sur sa propre Z rend le S 2 ports du même réseau

### T2 : résultat (critère 1)
- [ ] `n_ports`, `bilans` (un par couple), `zports` dans le résultat ; `bilan`, `zin`, `zout`, `voisines` inchangés
- [ ] À 2 ports, le résultat complet est identique à celui d'avant, hors les champs ajoutés
- [ ] `PY_ROUTES` passe

### T3 : Touchstone N ports (critère 4)
- [ ] `simulation_em.touchstone` écrit N ports (ligne d'abord, 4 couples par ligne), branche 2 ports intacte
- [ ] Export `.s3p` relu par `lire_touchstone` : mêmes S à la précision du fichier

## Phase 2 : page

### T4 : ports dynamiques et marche (critère 5)
- [ ] `rf.ports` de 2 à 4 entrées, boutons « + port » / « ✕ », 🎯 et ± par port
- [ ] La marche depuis le port 1 doit atteindre chaque autre port, refus qui nomme le port non atteint
- [ ] Un état gardé à 2 ports se relit sans changement
- [ ] `JS_PCB` et `JS_IPC` passent

### T5 : lecture du résultat
- [ ] Menu Sij pour les courbes, Smith sur le port choisi, menu « de j vers i » pour le bilan et les voisines
- [ ] Table des |Sij| à f0 en dB quand N > 2
- [ ] Export `.sNp` nommé selon N
- [ ] `JS_PCB` et `JS_IPC` passent

## Phase 3 : documentation

### T6
- [ ] `docs/simulation-em.md` (section RF), docstring de `rf_reseau.py`, version 1.10.0
- [ ] Description de l'outil MCP `simulation_rf` : ports de 2 à 4
- [ ] `A-FAIRE.md` de WEB_CAO : la ligne P01x274 renvoie à cette fonction
- [ ] `/review` complet avant de déclarer terminé
