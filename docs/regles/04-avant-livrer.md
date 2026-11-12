# Avant de livrer

La liste à dérouler avant d'envoyer les fichiers au fabricant. Chaque ligne renvoie aux règles qui la justifient.

## Liste de contrôle

| Étape | Contrôle | Règles |
|---|---|---|
| Schéma | ERC propre, avertissements restants justifiés | S34 |
| Schéma | Brochages et polarités vérifiés contre les datasheets | S10, S29 |
| Schéma | Entrées non utilisées tirées, broches libres marquées | S15 |
| Schéma | Découplage et protections présents | S19, S22, S23 |
| Schéma | Références fabricant complètes et disponibles | S27, S28 |
| Synchronisation | Schéma et PCB identiques (aucune modification PCB seule) | S36 |
| Empilage | Symétrique, validé par le fabricant, impédances confirmées | C7, C12, R30 |
| Placement | Fiducials, distances au bord, encombrements sans chevauchement | C17, C30, C31 |
| Routage | DRC sans erreur, classes de nets respectées | R1 |
| Routage | Courants et isolements vérifiés sur les nets de puissance et haute tension | R5, R8, R10 |
| Routage | Aucune ligne rapide au-dessus d'une fente, vias de retour en place | R21, R23 |
| Routage | Paires et bus appariés dans leurs tolérances | R33, R38 |
| Vias | Anneaux, rapport d'aspect, vias dans les pastilles remplis | R16, R17, R18 |
| Cuivre | Pas d'îlot, coulées reliées, cuivre équilibré | R27, R54, R55 |
| Test | Un point de test par net, accès de programmation | C39, C41 |
| Sérigraphie | Lisible, hors pastilles, repères et broche 1 visibles | C16, C36 |
| Documentation | Plan de fabrication, plan d'assemblage, notes et exceptions | C46, C48, C50 |
| Sorties | IPC-2581 (ou Gerber + perçage), netlist de test, placement, nomenclature, relus dans une visionneuse | C47 |

## Ce que WEB_CAO vérifie seul

Le contrôle des règles, comme le bouton Règles de WEB_3D, se lance par le bouton **Règles** du ruban (groupe Inspecter du schéma, onglet Vérifier du PCB), dans la console de l'éditeur (`reglesTexte(schReglesControler())` au schéma, `reglesTexte(pcbReglesControler())` au PCB) ou par l'outil MCP `cao_regles`. Il juge d'un coup les règles qu'un programme peut voir sur le document et cite le repère de chaque règle en écart. Il ne change rien au document ; au PCB, il relance le DRC.

| Contrôle | Règles contrôlées |
|---|---|
| Éditeur schématique | S3 cartouche, S6 préfixes des repères, S7 repères uniques et numérotés, S13 paires nommées des deux côtés, S27 référence fabricant, S29 empreinte liée, S34 ERC sans erreur |
| Éditeur PCB | C46 cartouche, C7 empilage symétrique, C30 trois repères de pose par face peuplée (repères FID…), C36 sérigraphie ≥ 0,8 mm et trait ≥ 0,15 mm, R16 anneau ≥ 0,05 mm des vias et traversants, C39 un point de test (TP…) par net, R1 DRC sans erreur |

Les autres contrôles de WEB_CAO, et ce qu'ils couvrent. Le reste se relit à la main.

| Contrôle de WEB_CAO | Règles couvertes |
|---|---|
| ERC de l'Éditeur schématique | S11, S15, S16, S34 |
| Brochage schéma contre carte | S10, S36 |
| DRC de l'Éditeur PCB (largeurs, isolements, perçages, bord) | R1, R8, R16, C31 |
| Vérification de la carte : angles des pistes | R11 |
| Vérification de la carte : bouts de piste orphelins, branches en T, moignons de vias | R13, R20, R32 |
| Vérification de la carte : empilage, impédance des nets | C7, C8, R30 |
| Vérification de la carte : chemins de retour, fentes et vides des plans | R23, R24 |
| Vérification de la carte : vias de couture | R22 |
| Vérification de la carte : diaphonie | R42, R43 |
| Vérification de la carte : paires différentielles | R37, R38 |
| Vérification de la carte : découplage, quartz | C23, C24, R46 |
| Vérification de la carte : bord de carte | R58 |
| Audit de la simulation PI : courant et largeur des rails | R5, R7 |
| Visionneuse IPC-2581 : relecture des sorties | C47 |

Voir : [ERC](../manuel/manuel.html#02-editeur-schematique--je-veux-vérifier-le-schéma-erc), [brochage schéma contre carte](../manuel/manuel.html#03-editeur-pcb-edition-routage--je-veux-vérifier-le-brochage-schéma-contre-carte), [DRC](../manuel/manuel.html#03-editeur-pcb-edition-routage--je-veux-contrôler-la-carte-drc), [Vérification de la carte](../verification-carte.md).
