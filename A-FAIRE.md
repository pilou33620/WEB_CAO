# À faire — fonctionnalités et bugs

Ce qui reste à coder dans WEB_CAO, au 22/10/2026 : nouvelles fonctionnalités et bugs, rien
d'autre. Les essais (sur du réel, sur le Pi, contre les normes) sont dans
[TESTS-A-FAIRE.md](TESTS-A-FAIRE.md) ; ce qui est fait, dans
[docs/HISTORIQUE_DEVELOPPEMENT.md](docs/HISTORIQUE_DEVELOPPEMENT.md) (le carnet de route
complet jusqu'au 22/10/2026 y est recopié).

## Bugs

- [ ] **Empreinte SOT-89-5 de la LIB** (essai du 22/10/2026) : pastilles de 0,6 × 1,2 mm
  contre 0,7 × 1,5 mm chez Torex, et la pastille 2 doit passer sous le boîtier d'un seul
  tenant. À refaire selon Torex, numérotation gardée (elle est juste). L'empreinte est dans la
  LIB privée (`WEB_SUITE_PROJETS`).

Les deux derniers bugs de code (le chanfrein du routeur qui entrait dans une pastille d'un
autre net, la Gestion LIB qui montait à environ 890 Mo au chargement) sont corrigés depuis le
21/10/2026.

## Fonctionnalités

- [ ] **Rugosité de Huray selon Simonovich** (décidé le 22/10/2026) : les préréglages « Huray ·
  ED standard » (a 0,5 µm, SR 1,5) et « Huray · HVLP » (a 0,3 µm, SR 0,6)
  (`editeur-pcb/js/01-core.js`) passent à la méthode « cannonball » : SR = 4,887 et un rayon
  tiré de la Rz du feuillard. Les résultats changent au-dessus de 10 GHz ; bancs à reprendre
  (`banc-ligne-mom.py`).
- [ ] **Simulation RF S21 TX de la carte P01x274** (U400 → antenne) : les modèles AS179 sont
  en place, l'étude est faite (voir l'historique, *Simulation RF — S21 TX de la carte P01x274*).
  En attente de tes réponses : (2) port 1, Zopt Semtech ou 50 Ω ; (3) port 2, antenne, U.FL ou
  les deux ; (4) branche RX exclue, gardée, ou S21 RX plus tard ; (5) les fichiers Murata,
  l'impédance de l'IFA, la Zopt. La mesure de comparaison est dans
  [TESTS-A-FAIRE.md](TESTS-A-FAIRE.md).
- [ ] **Port différentiel en simulation RF** (piste) : seuls deux ports asymétriques existent ;
  un S21 RX sur RFI_P / RFI_N le demanderait. Ne se commence que si la réponse (4) ci-dessus
  garde la branche RX.

Côté pilotage par Claude (MCP), les fonctionnalités possibles sont listées dans
[l'A-FAIRE de web_suite](https://github.com/pilou33620/web_suite/blob/main/A-FAIRE.md).
