# Spec : simulation RF à plus de deux ports

Origine : l'essai gardé « S21 de P01x274 » (émission et réception) montre qu'une puce
radio a au moins trois accès (TX, antenne, RX) et que la simulation RF n'en lit que deux.
On passe de « le S21 de la puce à la charge » à « la matrice S de tout le réseau ».

## Objectif

Aujourd'hui (`python/rf_reseau.py` 1.9.0, onglet S21) : exactement deux ports, un seul
S21 par calcul. Émission et réception sont deux calculs où l'on déplace le port 2 et
on change l'état du commutateur à la main.

Après : de 2 à 4 ports, une seule résolution, la matrice S N×N complète, un `.sNp` exporté.
Un port reste un accès simple ou différentiel (`noeud_n`) avec son impédance R + jX.

Utilisateur : le concepteur qui regarde une chaîne radio (TX, RX, antenne, test) dans
l'éditeur PCB ou la visionneuse IPC-2581 (le code est commun : `commun/simulation-em.js`).

## Ce qui change

### Solveur (`python/rf_reseau.py`)

- `_valider` : 2 à `MAX_PORTS` = 4 ports (avant : exactement 2). Refus d'un nœud pris par
  deux ports, de la masse, d'une impédance à partie réelle ≤ 0 : les contrôles actuels,
  appliqués à chaque paire.
- `_s_ports` : N seconds membres au lieu de 2, **une seule factorisation** (déjà le cas).
  Le coût d'un port de plus est une substitution, pas une factorisation.
- `s_mats` et `s50` deviennent N×N. Le résultat garde `s` en liste aplatie par fréquence
  et gagne `n_ports`.
- `zin` / `zout` : l'impédance vue à chaque port, `zports[k]` (liste de N courbes). Les
  champs `zin` (port 1) et `zout` (port 2) restent remplis pour le cas à 2 ports.
- `bilan` (port 1 → port 2) et `voisines` (attaque du port 1) gardent leurs champs. Le
  résultat gagne `bilans` : un bilan par couple (attaqué j, mesuré i), avec ses pertes de
  désadaptation et de dissipation, la Z vue à j et les `voisines` de l'attaque j. La page
  choisit le couple sans relancer le calcul. À N = 2, `bilan` et le reste sont inchangés.
- À N > 2, une table des |Sij| à f0 en dB.
- Touchstone (`simulation_em.touchstone`) : écrit N ports. Ordre de la norme : à 2 ports
  S11 S21 S12 S22 (colonne d'abord, inchangé) ; à N ≥ 3 ligne d'abord, 4 couples par ligne
  physique avec continuation. `lire_touchstone` sait déjà lire ce format.

Rien n'est ajouté à la liste des composants, des modèles ou des couplages : le réseau
(pistes, pastilles, vias, couplages, selfs, fentes, zones) est celui d'aujourd'hui.

### Page (`commun/simulation-em.js`, onglet S21)

- `rf.ports` : tableau de 2 à 4 entrées (aujourd'hui `[null, null]`). Boutons « + port »
  et « ✕ » par port à partir du troisième ; 🎯 et ± (borne −) par port, comme aujourd'hui.
- Réseau trouvé par la page : la marche part du port 1 et doit atteindre **chaque** autre
  port ; sinon refus qui nomme le port non atteint (message actuel, par port).
- Courbes : un menu « Sij » (par défaut S21, S11, S22) ; l'abaque de Smith suit le port
  choisi. La fiche prend le couple « de j vers i » choisi (par défaut 1 → 2, comme
  aujourd'hui) pour son bilan et ses voisines, et ajoute la table des Sij à f0.
- État gardé avec la carte : `rf.ports` plus long ; lecture d'un état à 2 ports inchangée.

### Compatibilité

- Document `cao-sim-rf-1` à 2 ports : mêmes entrées, mêmes sorties, mêmes chiffres. Le
  champ `ports` du document accepte simplement plus d'entrées ; `FORMAT` ne change pas.
- Résultat : `n_ports` ajouté, `s` de taille N² par fréquence. Un client qui lit un
  résultat sans `n_ports` suppose 2 (anciens fichiers).
- MCP (`simulation_rf`, `cao_calcul` s21) : accepte un tableau de ports de taille 2 à 4.
  À vérifier à l'implémentation : où le document est fabriqué (la page) et ce que le MCP
  transmet.

## Hors périmètre

- Modes mixtes Sdd / Sdc / Scc (piste B), assistant d'adaptation et tolérances (C),
  marqueurs et bruit (D) : des pistes à part.
- Plus de 4 ports, ports de rayonnement, source active : la quasi-statique reste la règle.

## Critères de réussite (vérifiés par `python/test/banc-rf.py` et les bancs de page)

1. À 2 ports, tous les bancs actuels passent sans changer un chiffre.
2. Trois ports sur un T de lignes adaptées : S31 = S21 sur un T symétrique, Σ|Si1|² ≤ 1
   (passif), réciprocité Sij = Sji.
3. Un port de plus à Z = 50 Ω fermé sur une charge de 50 Ω rend le S2 ports du même
   réseau (cohérence N → 2 ports par fermeture d'un port).
4. Export `.s3p` relu par `lire_touchstone` : mêmes S à la précision du fichier.
5. Port non atteint : refus nommé, rien de calculé.

## Décisions (utilisateur, validées)

- Plafond de **4 ports**.
- Bilan et voisines : **couple choisi** (par défaut 1 → 2).

## Demander d'abord

Touche à l'API `/api/simulation-rf` (champ `ports`), au format de résultat et au banc
RF : l'accord de cette spec vaut accord pour ces trois points.
