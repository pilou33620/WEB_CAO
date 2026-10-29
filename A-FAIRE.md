# À faire — fonctionnalités et bugs

Ce qui reste à coder dans WEB_CAO, au 22/10/2026 : nouvelles fonctionnalités et bugs,
plus le seul essai en conditions réelles gardé (en bas) ; ce qui est fait, dans
[docs/HISTORIQUE_DEVELOPPEMENT.md](docs/HISTORIQUE_DEVELOPPEMENT.md) (le carnet de route
complet jusqu'au 22/10/2026 y est recopié).

## Bugs

Aucun bug connu ouvert. Corrigés le 22/10/2026 : le canal de pilotage (`pilote.py`, copie de
web_suite) qui refusait les pages servies en HTTPS, donc celles de l'iPad en mode réseau ; l'empreinte SOT-89-5 de la LIB, refaite
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
- [x] **Visionneuse : contour des boîtiers, hauteur des textes, triplaque décentrée**
  (22/10/2026) : le `<Package><Outline>` se dessine à l'écran et entre dans la boîte du
  composant (sans lui, le cadre des pastilles en tirets) ; un texte prend la hauteur de sa
  `<BoundingBox>` ou de son `fontSize` (1,2 mm à défaut) ; une triplaque décentrée de plus de
  40 % prend sa Z₀ et sa εr effective du solveur de section (`ligne_mom` par `/api/simulation`),
  la formule entre parenthèses ; retard, capacité et inductance en sont refaits.

Le S21 en émission de P01x274 ne demande pas de code non plus (l'impédance de chaque port se
règle dans le panneau, les modèles des composants viennent de la LIB). Retirée le 22/10/2026 :
une rugosité de Huray par face du feuillard (écart faible, données rarement publiées).

Les limites connues des guides qui restent à coder (22/10/2026) :

- [x] **Arcs posés par le routeur** (22/10/2026) : nouvelle règle d'angle « arrondi »
  (`S.rule.corner = "arc"`) : au dépôt, un arc tangent à chaque coude, 90° comme 45°, au
  rayon borné à 4 largeurs, resserré devant le cuivre pris dans le coude (`mitreAt(…, arc)`,
  `chamferPosed`) ; `cao_router` la garde. Les zones et les découpes de cuivre rondes partent
  en arcs au Gerber (G02/G03 dans la région) et à l'IPC-2581 (`<PolyStepCurve>`), comme le
  contour de carte. Reste : les polygones sont toujours des points en interne, pas d'outil
  d'arc pour les zones.
- [x] **Sauvegarde automatique sur disque** (22/10/2026) : projet ouvert, toutes les 30 s,
  le schéma ou la carte modifiés et changés depuis la dernière fois partent dans un
  brouillon à côté du document (`<nom>-SCH.brouillon.json`, `-PCB.brouillon.json`, ignorés
  par git), effacé à l'enregistrement ; à la réouverture, un brouillon plus récent que le
  document est proposé (refusé, il reste jusqu'au prochain enregistrement ; rien ne se
  propose si le travail a commencé), la session de l'onglet passant devant.
  Reste : sans projet ouvert (téléchargement), pas de brouillon ; les 30 dernières
  secondes ne sont pas dans le brouillon.
- [x] **Laminage séquentiel** (22/10/2026) : la séquence de pressages se décrit dans
  l'empilage (`S.stack.press`, plages de cuivres pressées ensemble, de l'intérieur vers
  l'extérieur ; liste « Pressages » du panneau Empilage physique). Décrite, `viaBuild` la
  suit (perçage mécanique d'un sous-ensemble pressé, micro-via laser depuis sa surface) et
  un via qu'aucun pressage ne permet devient une erreur DRC ; non décrite, rien ne change
  (remarque). La séquence part dans la feuille d'empilage, le plan maître, les notes de
  fabrication Draftsman et la lecture MCP `empilage` ; l'IPC-2581 garde un seul
  StackupGroup. Reste : le chercheur de chemin (`cao_chemin`) et la pose de vias ne
  consultent pas `viaBuild`, ils peuvent poser un via que la séquence ne permet pas (le DRC
  le dit) ; pas de micro-via empilé ou décalé sur plusieurs pressages en une portée.
- [x] **Vue de détail sur une autre feuille** (plans Draftsman, 22/10/2026) : la feuille se
  choisit dans le volet « Cotes et détails » quand le détail est sélectionné ; « FEUILLE n »
  sous la lettre du repère, « VOIR FEUILLE n » sous le détail ; feuille décochée, il revient
  sur celle de sa vue mère.

Côté pilotage par Claude (MCP), les fonctionnalités possibles sont listées dans
[l'A-FAIRE de web_suite](https://github.com/pilou33620/web_suite/blob/main/A-FAIRE.md).

## Essai en conditions réelles

Un seul gardé, les autres sont abandonnés (22/10/2026) :

- [ ] **S21 de P01x274**, en émission et en réception (port différentiel RFI_P / RFI_N
  du SX1261), dans le panneau RF, avec les modèles des composants pris dans la LIB.
