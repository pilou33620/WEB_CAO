# Plan : manuel d'utilisation

Source : `SPEC-manuel.md`.

1. **Générateur** `commun/outils/build-manuel.py` (stdlib seule : Markdown → HTML, sommaire,
   recherche, contrôle des liens) + bouton sur l'accueil. Vérifié sur le chapitre RF existant.
2. **Chapitres**, un rédacteur par chapitre, en parallèle, chacun sur ses seuls fichiers :
   - 01 accueil, projets, profils, tactile, raccourcis communs
   - 02 éditeur schématique
   - 03 éditeur PCB : édition, routage, DRC, placement
   - 04 éditeur PCB : contraintes, fabrication, Draftsman, 3D, thermique, dossier mécanique
   - 05 gestion LIB   - 06 recherche de composants   - 07 visionneuse IPC-2581
   - 08 simulation SI   - 09 simulation PI, thermique, audit de carte
   - 10 simulation RF et EM (reprend `rf-acces-des-broches.md`)
   - 11 Claude et le MCP
3. **Assemblage** : `index.md` (sommaire), relecture d'homogénéité, build, contrôle des liens.
4. **Relecture** du résultat, puis commit (un par étape).

Gabarit d'un chapitre : introduction (3 lignes) → Guide par tâche (« Je veux… ») → Référence
(tableaux Bouton / Raccourci / Effet / Limites) → Limites connues → Voir aussi.
