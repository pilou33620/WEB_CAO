# À faire — fonctionnalités et bugs

Ce qui reste à coder dans WEB_CAO, au 22/10/2026 : nouvelles fonctionnalités et bugs,
plus le seul essai en conditions réelles gardé (en bas) ; ce qui est fait, dans
[docs/HISTORIQUE_DEVELOPPEMENT.md](docs/HISTORIQUE_DEVELOPPEMENT.md) (le carnet de route
complet jusqu'au 22/10/2026 y est recopié).

## Bugs

Aucun bug connu ouvert. Corrigés le 22/10/2026 : l'empreinte SOT-89-5 de la LIB, refaite
selon le plan de pastilles Torex (dans `WEB_SUITE_PROJETS`), et la description du Template 4
USB dans `oeil.py`. Le 21/10/2026 : le chanfrein du routeur qui entrait dans une pastille d'un
autre net, la Gestion LIB qui montait à environ 890 Mo au chargement.

## Fonctionnalités

- [x] **Rugosité de Huray selon Simonovich** (22/10/2026) : les préréglages « Huray · ED
  standard » et « Huray · HVLP » (`editeur-pcb/js/01-core.js`) suivent la méthode
  « cannonball » : a = Rz / 16,73, SR = 4,887 ; Rz 5 µm (a 0,299 µm) et 1,5 µm (a 0,09 µm).
  Un empilage déjà réglé garde ses valeurs : seuls les choix faits ensuite dans la liste changent.
- [x] **Port différentiel en simulation RF** (22/10/2026) : un port peut avoir deux bornes
  (RFI_P / RFI_N du SX1261 de P01x274), sans masse : `rf_reseau.py` 1.9.0 (`noeud_n`), et un
  bouton ± par port dans le panneau RF pour cliquer la borne −. Le S21 en réception de
  P01x274 ne demande plus de code : c'est l'essai gardé, en bas.

Le S21 en émission de P01x274 ne demande pas de code non plus (l'impédance de chaque port se
règle dans le panneau, les modèles des composants viennent de la LIB). Retirée le 22/10/2026 :
une rugosité de Huray par face du feuillard (écart faible, données rarement publiées).

Les limites connues des guides qui restent à coder (22/10/2026) :

- [ ] **Pastilles de forme quelconque** (éditeur PCB) : pastille en polygone, plage
  thermique découpée, chanfrein. Aujourd'hui : rectangle (coins adoucis ou droits),
  oblong ou rond.
- [ ] **Arcs posés par le routeur** : les pistes circulaires venues d'un fichier se
  montrent, se mesurent et partent en Gerber, mais le routeur ne trace que des segments ;
  zones de cuivre, coupes et contour de carte restent des polygones.
- [ ] **Sauvegarde automatique sur disque** : le travail tient dans l'onglet, un
  avertissement part à la fermeture, mais sans « Enregistrer .json » il est perdu.
- [ ] **Laminage séquentiel** : un empilage à pressages successifs est signalé, mais sa
  séquence ne se décrit pas (une seule liste de diélectriques, pas de sous-ensembles) ;
  le contrôle des vias borgnes et enterrés suppose un pressage unique.
- [ ] **Vue de détail sur une autre feuille** (plans Draftsman) : elle ne se pose
  aujourd'hui que sur la feuille de sa vue mère.

Côté pilotage par Claude (MCP), les fonctionnalités possibles sont listées dans
[l'A-FAIRE de web_suite](https://github.com/pilou33620/web_suite/blob/main/A-FAIRE.md).

## Essai en conditions réelles

Un seul gardé, les autres sont abandonnés (22/10/2026) :

- [ ] **S21 de P01x274**, en émission et en réception (port différentiel RFI_P / RFI_N
  du SX1261), dans le panneau RF, avec les modèles des composants pris dans la LIB.
