# Spec : manuel d'utilisation de WEB_CAO, dans l'application

## Objectif
Un manuel complet, consultable depuis l'accueil, qui décrit chaque outil et chaque fonction :
Éditeur Schématique, Éditeur PCB, Gestion LIB, Recherche de composants, Visionneuse IPC-2581,
toutes les simulations (SI, PI, RF, EM, thermique, audit), l'accueil / projets / profils / tactile
et le pilotage par Claude (MCP).

## Forme
- Sources : un chapitre Markdown par fichier, `docs/manuel/NN-nom.md` (versionné, lisible sur GitHub).
- Page : `docs/manuel/manuel.html`, fichier unique et autonome (sommaire, recherche), produit par
  `python commun/outils/build-manuel.py`. Elle s'ouvre aussi en double-clic (`file://`), sans serveur.
- Accès : bouton « 📖 Manuel » sur l'accueil (`index.html`).
- Chaque chapitre a deux niveaux : « Guide par tâche » (je veux faire X) puis « Référence »
  (chaque bouton, menu, raccourci, option : effet, limites).

## Critères de réussite
1. Le bouton de l'accueil ouvre le manuel ; sommaire cliquable ; recherche plein texte.
2. Chaque outil a son chapitre ; chaque simulation a le sien ; le chapitre RF existant est conservé.
3. Tout ce qui est écrit est vérifié dans le code ou dans un guide existant. Rien d'inventé :
   ce qui n'est pas établi est marqué `À vérifier`.
4. Les raccourcis et noms de boutons sont ceux de l'interface.
5. `build-manuel.py` échoue (code ≠ 0) sur un lien interne cassé.

## Hors périmètre
Changer le comportement des outils ; le mode tuto existant (visite guidée) reste tel quel.
