# À faire — fonctionnalités et bugs

Ce qui reste à coder dans WEB_CAO, au 22/10/2026 : nouvelles fonctionnalités et bugs, rien
d'autre. Les essais (sur du réel, sur le Pi, contre les normes) sont dans
[TESTS-A-FAIRE.md](TESTS-A-FAIRE.md) ; ce qui est fait, dans
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
- [ ] **Port différentiel en simulation RF** (décidé le 22/10/2026, pour plus tard) : la
  simulation RF n'a que des ports simples (un signal par rapport à la masse). Une entrée
  différentielle, comme l'entrée réception RFI_P / RFI_N du SX1261 de P01x274, en demande un.
  Prérequis du S21 en réception de cette carte, qui viendra après celui en émission.

La simulation S21 en émission de P01x274 n'est plus ici : elle ne demande aucun code
(l'impédance de chaque port se règle dans le panneau, les modèles des composants viennent de la
LIB). C'est un essai, dans [TESTS-A-FAIRE.md](TESTS-A-FAIRE.md). Retirée le 22/10/2026 : une
rugosité de Huray par face du feuillard (écart faible, données rarement publiées).

Côté pilotage par Claude (MCP), les fonctionnalités possibles sont listées dans
[l'A-FAIRE de web_suite](https://github.com/pilou33620/web_suite/blob/main/A-FAIRE.md).
