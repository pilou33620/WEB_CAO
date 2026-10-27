# Manuel de WEB_CAO

WEB_CAO est une suite de CAO électronique qui tourne dans le navigateur : du schéma au dossier de fabrication, avec bibliothèque de composants, inspection de fichiers IPC-2581 et simulation. Ce manuel décrit chaque outil et chaque fonction.

Chaque chapitre a deux niveaux : un **guide par tâche** (« je veux faire X », en étapes) puis une **référence** (chaque bouton, menu, raccourci et option, avec son effet et ses limites). Le champ de recherche, à gauche, cherche dans tout le manuel.

## Les chapitres

| Chapitre | Contenu |
|---|---|
| [Accueil, projets, tactile](01-accueil-projets-tactile.md) | Serveur local, projets sur disque, profils, mode tactile, mode tuto, raccourcis communs |
| [Éditeur Schématique](02-editeur-schematique.md) | Dessin, bus, hiérarchie, netlist et BOM, variantes, motifs, contraintes, export vers le PCB |
| [Éditeur PCB : édition et routage](03-editeur-pcb-edition-routage.md) | Outils, empreintes, routage Push & Shove, paires, DRC, placement, synchro schéma |
| [Éditeur PCB : contraintes et fabrication](04-editeur-pcb-fabrication.md) | Gestionnaire de contraintes, exports de fabrication, Draftsman, dossier mécanique, 3D, thermique |
| [Gestion LIB](05-gestion-lib.md) | Catalogue, empreintes, symboles, modèles de simulation, import JLCPCB |
| [Recherche de composants](06-recherche-composants.md) | Stocks et prix, équivalences, empreintes, datasheets |
| [Visionneuse IPC-2581](07-visionneuse-ipc2581.md) | Couches, empilage, nets, mesures, plans |
| [Simulation du signal (SI)](08-simulation-si.md) | Le panneau de simulation, Z₀, diaphonie, œil, setup & hold |
| [Simulation de l'alimentation, thermique, audit](09-simulation-pi-thermique-audit.md) | Chute DC, PDN, échauffement, vérification de toute la carte |
| [Simulation RF](10-simulation-rf-em.md) | S₂₁, Smith, « et si », modèles Touchstone et SPICE |
| [Simulation RF : les broches d'une puce radio](10b-rf-acces-des-broches.md) | Que faire de chaque broche |
| [Claude et le MCP](11-claude-mcp.md) | Pilotage des pages par Claude Code, cartes de proposition |

## Aller plus loin

- Physique, équations et étalons de validation : [guide de la simulation EM](../simulation-em.md).
- Vérification d'une carte entière : [mode d'emploi](../verification-carte.md).
- Démarrage et options du serveur : [README](../../README.md).
