# Plan : dossier mécanique

Spec : `SPEC-dossier-meca.md` (validée le 15/10/2026). Tâches :
`tasks/todo-dossier-meca.md`. Le plan des classes d'interface
(`tasks/plan.md`, `tasks/todo.md`) n'est pas touché : il lui reste sa
vérification à la main et sa relecture.

## Vue d'ensemble

Un calcul commun (`commun/dossier-meca.js`) prend une **entrée neutre** et
rend le JSON, la feuille « Plan mécanique » et le DXF. L'éditeur PCB et la
visionneuse ne font que fabriquer l'entrée et l'interface. On bâtit d'abord
l'éditeur de bout en bout (c'est lui qui a la carte d'exemple et le Draftsman),
puis la visionneuse s'y branche.

## Graphe des dépendances

```
T1 essai : la visionneuse charge le Draftsman ──────────────────────────┐
T2 mecaDonnees (commun, pur) ─┬─ T3 entrée éditeur ─┬─ T4 feuille (dessus)  │
                              │                     │    └─ T5 vues face/côté
T6 zip déplacé dans commun ───┼─────────────────────┴─ T7 DXF + zip + bouton
                              │                          └─ T8 réglages manuels (éditeur)
T9 parseur : corps + hauteur ─┤
T10 export IPC : height ──────┤ (T10 dépend de T3 pour la hauteur connue)
                              └─ T11 entrée IPC (visionneuse) ── T12 fenêtre visionneuse (dépend de T1, T7)
```

## Décisions d'architecture

- **Entrée neutre** entre les outils et le calcul. Elle permet d'essayer le
  calcul sans `S` ni DOM, et elle garantit que les deux outils produisent le
  même dossier (critère 5).
- **La feuille se dessine depuis le JSON**, pas depuis `S` : ce qu'on donne à
  l'IA est exactement ce qui est dessiné.
- **Primitives empruntées** : la visionneuse charge `29-draftsman.js`,
  `fontes/plans-sans.js` et `33-draftsman-export.js` tels quels (décision du
  15/10). Seuls `crc32`/`zipBlob` passent dans `commun/zip.js`, déplacés
  sans changement : le zip sert aux deux outils, et charger
  `04-fabrication.js` dans la visionneuse serait disproportionné.
- **Réglages manuels** dans `S.dessin.meca` (éditeur) et `V.modele.meca`
  (visionneuse), même forme :
  `{h:{<id>:mm}, ouv:{<id>:true|false}}`. La clé est `fp.id` dans
  l'éditeur, le repère dans la visionneuse (l'IPC n'a pas d'identifiant plus
  stable).
- La feuille « meca » est **décochée par défaut** dans les plans, pour que
  le PDF des plans de fabrication ne change pas. Le bouton du zip la produit
  toujours.

## Phases et tâches

### Phase 1 : socle et risques (T1, T2)
- T1 : la visionneuse peut charger le Draftsman. C'est un essai de faisabilité.
- T2 : `mecaDonnees`, le calcul pur et ses essais.

### Phase 2 : éditeur de bout en bout (T3 à T8)
- T3 : l'entrée de l'éditeur.
- T4 : la feuille, vue de dessus.
- T5 : les vues de face et de côté.
- T6 : le zip déplacé dans `commun/`.
- T7 : le DXF, le zip et le bouton.
- T8 : les réglages manuels.

### Phase 3 : visionneuse (T9 à T12)
- T9 : le parseur lit le corps et la hauteur des boîtiers.
- T10 : l'export IPC de l'éditeur écrit la hauteur.
- T11 : l'entrée de la visionneuse.
- T12 : la fenêtre de la visionneuse.

### Phase 4 : clôture
- La documentation (README, A-FAIRE), `/review`, puis la mise à jour du graphe.

## Risques

| Risque | Impact | Parade |
|---|---|---|
| Le PDF du Draftsman relit `dfCfg()` → `S.dessin` (fonte embarquée) : `S` n'existe pas dans la visionneuse | Haut | T1 le montre d'abord. Parade prévue : un `S` minimal (`{dessin:{}}`) posé par la visionneuse, ou un paramètre de fonte passé à `dfPdf` ; à choisir selon ce que T1 trouve |
| `fmt` / `clamp` sont des `const` de `01-core.js`, absents de la visionneuse | Moyen | Définis dans `08-dossier-meca.js` de la visionneuse seulement (pas de collision : la visionneuse n'en a pas, vérifié) |
| Le déplacement du zip change `fabrication.zip` | Moyen | Code déplacé tel quel ; les essais zip existants (`crc32`, BOM, contenu) doivent passer sans retouche |
| Corps d'empreinte faux pour certains connecteurs (le corps n'est que le rectangle `bodyOf`) | Moyen | C'est déjà ce que montrent le DXF et l'assemblage ; on l'accepte et on le dit dans le JSON (`repere`) |
| Fichiers eCADSTAR sans `<Outline>` ni `height` | Moyen | Repli sur la boîte des pastilles et sur la LIB, avec un avertissement (T11) |
| Contours facettés dans la visionneuse (arcs perdus) | Faible | `dxfContour` retrouve les arcs ; la feuille et le JSON gardent les points |

## Points de contrôle

- Après T2 : le calcul est essayé seul.
- Après T5 : la feuille sort de l'éditeur ; les 44 essais Draftsman passent sans retouche.
- Après T8 : l'éditeur remplit les critères 1 à 4. Contrôle à la main dans le navigateur, puis relecture.
- Après T12 : critère 5 (même dossier dans les deux outils) et critère 6 (JSON donné à une IA). Puis `/review`.
