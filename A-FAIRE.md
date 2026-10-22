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
- [ ] **Huray, une rugosité par face** (piste) : Simonovich calcule K pour chaque face du
  feuillard (côté tambour, côté mat) puis fait la moyenne ; le code n'a qu'une rugosité par
  cuivre. Demande la Rz des deux faces de chaque feuillard.
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
