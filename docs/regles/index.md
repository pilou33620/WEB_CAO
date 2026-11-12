# Règles de conception WEB_CAO

Les règles à suivre pour concevoir une carte électronique dans WEB_CAO, du schéma aux fichiers de fabrication, chacune avec **pourquoi** elle existe. Elles valent pour l'utilisateur comme pour Claude quand il pilote les éditeurs.

## Base de travail

Les règles suivent le corpus de l'examen **IPC CID / CID+** (*Certified Interconnect Designer*, niveau de base et niveau avancé) et les normes IPC qu'il couvre. Le texte est une reformulation : il ne recopie aucune norme. Les valeurs chiffrées sont des valeurs **typiques** de ces normes, à confirmer dans l'édition en vigueur et auprès du fabricant.

| Norme | Sujet |
|---|---|
| IPC-2221 / IPC-2222 | Règles génériques de conception, cartes rigides |
| IPC-2226 | Cartes HDI (microvias, couches séquentielles) |
| IPC-2223 | Circuits flexibles et flex-rigides |
| IPC-2152 | Courant admissible dans les conducteurs |
| IPC-2141 | Impédance contrôlée |
| IPC-7351 | Empreintes (pastilles) des composants CMS |
| IPC-7095 | Conception et assemblage des BGA |
| IPC-4101 | Stratifiés et préimprégnés |
| IPC-4761 | Protection des vias (bouchage, remplissage) |
| IPC-6012 | Qualification et performance des cartes rigides |
| IPC-A-600 / IPC-A-610 | Acceptabilité de la carte nue / de la carte assemblée |
| IPC-2581 | Format de données de fabrication |
| ASME Y14.44 / IEEE 315 | Repères et symboles des schémas |

## Ordre de priorité

1. Les exigences du client ou du contrat (classe, normes de sécurité, environnement).
2. Les capacités du fabricant retenu (profil fabricant de l'Éditeur PCB : largeurs, perçages, empilages).
3. Ces règles.

En cas de contradiction, appliquer la règle la plus exigeante, puis la signaler. Une règle qu'on ne peut pas respecter s'écrit dans les notes de fabrication avec sa justification : jamais en silence.

## Classes IPC

La classe se fixe au premier jour : elle règle les anneaux, les tolérances, les contrôles et le prix.

| Classe | Produit | Exemple |
|---|---|---|
| 1 | Électronique générale, durée de vie courte | Jouet, gadget |
| 2 | Service dédié, fonctionnement continu souhaité | Industriel, informatique, télécom |
| 3 | Haute fiabilité, arrêt inacceptable | Médical vital, aéronautique, militaire |

Le **niveau de producibilité** (A : simple, B : moyen, C : avancé, selon IPC-2221) dit combien la conception pousse le fabricant. Viser le niveau A ou B partout où c'est possible ; réserver le C aux zones qui l'exigent (BGA au pas fin, par exemple).

## Comment lire une règle

Chaque règle porte un repère à citer (C pour Conception, S pour Schéma, R pour Routage), un énoncé, puis :

- *Pourquoi* : la raison physique, de fabrication ou de fiabilité ;
- *Réf.* : la norme d'où elle vient, quand il y en a une.

Les chapitres :

- [Conception de la carte](01-conception.md) : cadrage, empilage, empreintes, placement, fabrication, test, thermique, documentation.
- [Schéma](02-schema.md) : organisation, symboles, nets, alimentation, protection, données composants.
- [Routage](03-routage.md) : courant, isolement, géométrie, vias, retours de courant, impédance, paires, diaphonie, alimentation.
- [Avant de livrer](04-avant-livrer.md) : la liste de contrôle et ce que WEB_CAO vérifie seul.
