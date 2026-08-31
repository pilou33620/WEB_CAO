# À faire

Ce qui manque pour que la chaîne soit un outil convenable. Un titre = une
tâche ; le corps dit ce qui existe déjà et où, pour ne pas repartir de zéro.

Ce qui est *assumé* comme absent — auto-routeur, serpentin d'appariement,
sauvegarde disque automatique — n'est pas ici : c'est dans les « Limites
connues » de [editeur-pcb/README.md](editeur-pcb/README.md#limites-connues).

Ce qui en sort est retiré d'ici et documenté là où il vit. **Fait :** l'outil de
mesure et la recherche par repère, dans les deux éditeurs
(`commun/reperage.js`) ; le fichier de placement et la nomenclature côté PCB
(`positions.csv`, `bom.csv`, dans `buildFabFiles()`,
[editeur-pcb/js/04-fabrication.js:839](editeur-pcb/js/04-fabrication.js:839)) ; le
cross-probing schéma ↔ PCB, en trois morceaux — le saut par changement d'outil
(`pcbSonde`/`schSonde` et `sessAller()`), le même geste entre deux onglets
ouverts côte à côte (`sessMontrerAilleurs()`/`sessEcouterProbe()`, un
`BroadcastChannel`, bouton « ⇱ Montrer » et touche `L`), et le phare qui
désigne l'arrivée sur le PCB (`rpPhare()`,
[editeur-pcb/js/18-reperage.js](editeur-pcb/js/18-reperage.js)) — le tout dans
[commun/session.js](commun/session.js), documenté dans
[README.md](README.md#passer-dun-outil-à-lautre-sans-rien-perdre) ; l'Excellon
par portée de via, nommé en couches comptées à partir de 1, avec sa légende au
LISEZ-MOI et au master drawing (`drillFile()`,
[editeur-pcb/js/04-fabrication.js:514](editeur-pcb/js/04-fabrication.js:514)),
et la nature d'un via — traversant, borgne dessus/dessous, enterré — choisie au
panneau Propriétés, sur un via comme sur toute une sélection (`viaSetKind`,
[editeur-pcb/js/01-core.js:340](editeur-pcb/js/01-core.js:340)).

## État des lieux au 2026-08-31

Ce que le dépôt fait tourner, et ce qui le mesure. **892 essais, tous passés.**

| Partie | État | Ce qui la mesure |
| --- | --- | --- |
| Éditeur PCB — géométrie, routage, DRC, fabrication, coplanaire | en service | 522 essais, [editeur-pcb/test/harness.js](editeur-pcb/test/harness.js) |
| Éditeur schématique | en service ; **ni bus ni feuilles hiérarchiques** | — |
| Visionneuse IPC-2581 | en service ; **arcs comptés, parcours chaîné, chevelu du retour, pastilles devinées avouées, sélection à plusieurs morceaux** | 95 essais ([harness-sim.js](visionneuse-ipc2581/test/harness-sim.js)) + 46 ([banc-essai.py](visionneuse-ipc2581/test/banc-essai.py)) |
| **SI — impédance** (`ligne_mom`) | en service, 0,3 à 0,4 % contre les étalons ; **vias : boucle de retour, antipads, moignons, traversée de plans** | 139 cas, [banc-ligne-mom.py](python/test/banc-ligne-mom.py) |
| **SI — Z différentielle et diaphonie** (`solve_multiline`) | **en service**, moins de 3 % contre Garg-Bahl ; N conducteurs dans UNE section, masse coplanaire et pistes de garde comprises, bruit rendu dans les deux sens | 139 cas, dont 6 sur la scène, + 12 côté pages |
| **PI — chute DC** (`dc_solver`) | **solveur fait et mesuré ; aucun outil ne l'alimente** | 34 cas, [banc-dc.py](python/test/banc-dc.py) |
| Moteur 2,5D pleine onde (`mom_solver`) | **port vertical fait ; ε_eff dé-embarqué à 0,93 % de `ligne_mom`** | 56 essais, [mom_solver/tests/](mom_solver/tests) |
| Passerelle MCP, projets, profils, repérage, cross-probing | en service | — |

**Les chantiers qui comptent, dans l'ordre :**

1. ~~**`ligne_mom` à N conducteurs**~~ **FAIT le 2026-08-31**, et il a bien
   débloqué les deux d'un coup. `capacitance_coplanaire` assemblait déjà la
   matrice multiconducteurs ; il ne manquait que la généralisation du second
   membre — N résolutions au lieu d'une, la matrice de Maxwell [C], puis
   [L] = μ₀ε₀[C₀]⁻¹. **Z différentielle et diaphonie sont deux onglets de la
   famille SI**, qui lisent la même section résolue une seule fois. Détail
   plus bas : « `ligne_mom` à N conducteurs » ;
2. **les courants du schéma** — c'est ce qui manque au solveur DC, et ce n'est
   pas un problème de solveur : le schéma ne porte pas ce qu'un composant tire.
   **C'est désormais le premier de la liste** ;
3. ~~le port vertical du moteur 2,5D~~ **FAIT le 2026-08-30** : le port est
   un via qui relie la piste au plan de masse, et la comparaison de paramètres
   S avec `ligne_mom` — celle qui attendait ce point depuis le début — donne
   **0,93 %** sur ε_eff dé-embarqué. Ce qui reste au moteur est du confort, pas
   du blocage : voir « L'état du moteur 2,5D » plus bas.

## Simulation électromagnétique

### Audit du 2026-08-29 : ce qui était écrit « FAIT » et ne l'était pas

**Rien de la chaîne EM ne tournait plus.** Six défauts ont été trouvés en
exécutant simplement ce que cette page affirmait, et les six sont dans du code
annoncé **fait** ici même. Ils sont corrigés, et chacun a désormais un cas de
banc — c'est l'absence de mesure, pas l'absence de travail, qui les a laissés
passer : le code était écrit, souvent bien, mais rien ne l'exécutait.

| Ce que la page affirmait | Ce que l'exécution a montré | État |
| --- | --- | --- |
| « le panneau résout la section par MoM » | `ligne_mom.py` ne s'importait plus : une fonction posée avant les `import`, et un `logging` jamais importé. **Les deux panneaux affichaient « Solveur EM indisponible »** depuis le dernier commit | réparé |
| « `simuler()` rend les paramètres S » | `_ruptures` définie **deux fois** ; l'ancienne, qui rend un entier, écrasait la neuve, qui rend un couple. `TypeError` à chaque appel | réparé |
| lot 2 : « masque de soudure, réductions exactes vérifiées » | la référence à vide gardait le masque à son εr : **ε_eff BAISSAIT** quand on vernissait la piste, et Z₀ tombait de 7,8 % au lieu de 2 à 3 %. Aucun cas de banc ne l'avait vérifié | réparé, 5 cas |
| lot 3b : « discontinuités modélisées » | trois copies des mêmes formules, trois résultats : la fiche affichait **21,28 fF** de capacité de coude là où la cascade en appliquait **0,394**. Et la cascade appelait en millimètres des fonctions écrites en mètres — inductance de via **1000 ×** trop grande | réparé, 5 cas |
| « 2ᵉ branchement DCIM **FAIT**, erreur de 9,6 % → 0,05 % » | faux : le 3ᵉ niveau faisait tomber `banc_dcim` de **25/25 à 21/25** et portait l'écart d'ε_eff du moteur de **0,49 % à 11,4 %** | **réparé le 2026-08-30** : 25/25, ε_eff revenu à 0,49 %, erreur lointaine divisée par trois |
| PI : « chute continue (IR drop) **FAIT** » | `dc_solver.py` montait son réseau sur le **périmètre** des polygones, passait à SciPy un argument retiré en 1.14, et **rattrapait l'exception pour rendre zéro volt partout** | réécrit, 16 cas |

**Ce qui n'a pas bougé et qui reste vrai** : le noyau 2,5D remis en état passe
ses essais — 38 à l'audit, **56 au 2026-08-30** —, et l'écart d'ε_eff contre
`ligne_mom` vaut bien les 0,49 % annoncés. Les deux fonctions de Green, la DCIM à deux niveaux, l'extraction du
pôle et la désingularisation polaire sont justes et mesurées.

**La leçon, et elle vaut pour la suite** : les cinq défauts silencieux étaient
tous dans du code qu'aucun banc n'exécutait. Un chantier n'est pas fini quand
il est écrit, il est fini quand un cas le mesure — et le cas doit porter sur ce
qui se trompe *sans se voir* : un signe, un ordre de grandeur, une unité.

### Contre-vérification du 2026-08-29 (2ᵉ passe)

Les six correctifs ci-dessus ont été **repris un par un et remesurés**, pas
relus. Les six tiennent. Mais la contre-vérification a trouvé **quatre restes**,
tous de la même famille que les défauts d'origine — du code ou du texte qui
affirme une chose que l'exécution dément — et tous corrigés :

| Ce qui restait | Ce que l'exécution a montré | État |
| --- | --- | --- |
| lot 3b : « une seule implémentation » | `inductance_via` et `capacite_pastille` étaient **encore définies deux fois** dans `ligne_mom`. La consolidation avait bien été écrite, l'ancien bloc n'avait pas été retiré. Python garde la dernière, donc le calcul était juste — mais la **première documentait ses arguments en millimètres** et la seconde « TOUT EN MÈTRES ». Un lecteur tombant sur la première se trompait d'un facteur mille | doublon supprimé, 1 cas de banc |
| lot 2 : « masque de soudure corrigé » | la physique de `solve_line` était bien juste (−2,53 % sur Z₀, +5,26 % sur ε_eff), mais `simulation_em.section_de_couche` **comptait le vernis déclaré deux fois** : une fois par la Green à trois régions, et une fois de plus dilué dans l'εr du **substrat**, comme si la résine était *entre* la piste et le plan. Mesure : un empilage qui **déclare** son masque voyait er tomber de 4,3 à 4,2444, Z₀ monter de 0,56 % et ε_eff baisser de 1,12 % par rapport au **même** empilage qui ne le déclare pas. Renseigner son empilage rendait donc le résultat faux | corrigé, 3 cas |
| détection de couche extérieure | le test posait la question **du mauvais côté** : il regardait `couches[indice - 1]`, la couche du côté du *plan*, pour décider ce qu'il y avait du côté de la *face*, et y cherchait du cuivre là où c'est le diélectrique qui tranche. Une piste couverte de 0,1 mm de préimprégné recevait par-dessus un vernis de 25 µm, et son préimprégné partait à la poubelle | réécrit en `_masque_exterieur`, 1 cas |
| deux docstrings contre leur propre code | `_coudes` citait encore la formule inventée que le correctif avait supprimée (`C ≈ 0,3 × W × √εr × |θ|`) ; et `trois_niveaux` était documenté « si True (**defaut**) » aux deux endroits alors que la signature dit `False` — soit exactement l'inverse de l'avertissement en tête de `ajuster_noyau_3_niveaux` | textes remis sur le code |

**Vérifié de bout en bout par HTTP**, et pas seulement par les bancs : le
serveur lancé, `GET /api/simulation` et `GET /api/simulation-dc` répondent tous
deux `dispo: true` ; un POST sur la chaîne EM rend 2 tronçons, 5 points S, la
fiche de coude à 26,07 pH / 41,55 fF — **le même chiffre que le modèle**, ce qui
était tout l'objet du lot 3b — et 12 lignes de Touchstone. Un POST sur la chaîne
DC, sur une barre de 40 × 10 mm en 35 µm parcourue par 2 A, rend **3,854 mV**
avec des bornes sur toute la largeur, contre 3,882 mV pour ρL/(Wt) : **0,72 %**,
l'écart tenant à l'endroit où l'on place le bout effectif de la barre. Avec des
contacts *ponctuels* le même problème rend 4,31 mV, soit 15 % de plus — ce n'est
pas une erreur du solveur mais la résistance d'étranglement au contact, que la
formule à une dimension ne contient pas.

**Ce que la 2ᵉ passe confirme sur la méthode** : sur les quatre restes, trois
étaient du texte qui contredisait son propre code. Un correctif n'est pas fini
quand le calcul est juste — il l'est quand plus rien alentour n'affirme le
contraire, parce que c'est ce texte-là qu'on relit six mois plus tard.

**Ce qui marche** : l'impédance. Le panneau « Simulation EM » des deux outils
envoie la section droite des tronçons sélectionnés à
[python/ligne_mom.py](python/ligne_mom.py), qui la
résout par méthode des moments, et rend l'impédance, la permittivité effective,
le retard, les pertes, puis les paramètres S de la liaison par mise en cascade.
Vérifié à 0,42 % contre Hammerstad-Jensen et à 0,30 % contre la solution exacte
en intégrales elliptiques ; **65 cas** dans
[python/test/banc-ligne-mom.py](python/test/banc-ligne-mom.py) — les quatorze
derniers couvrent le masque de soudure, les discontinuités localisées et le
passage de l'empilage à la section, qui n'en avaient aucun.

La MASSE COPLANAIRE est traitée côté par côté, plage par plage, et seulement sur
les nets déclarés comme masse — voir « Ce que la masse coplanaire suppose » plus
bas. La géométrie qui la mesure a ses propres bancs : 13 cas dans
[editeur-pcb/test/harness.js](editeur-pcb/test/harness.js) et 20 dans
[visionneuse-ipc2581/test/harness-sim.js](visionneuse-ipc2581/test/harness-sim.js).

### Quel solveur pour quel besoin, et pourquoi ce n'est pas toujours le plus général

**À lire avant d'ouvrir n'importe lequel des chantiers ci-dessous.** La question
« et si on branchait le moteur 2,5D ? » revient, et la réponse est non pour la
plupart des besoins qui restent. Ce n'est pas une préférence, c'est une histoire
de dimension.

#### « Plus général » n'est pas « plus précis »

Le moteur 2,5D voit des choses que le modèle de ligne ne peut pas voir. Il n'est
pas plus exact sur ce que les deux savent faire, et il est **moins** exact à
868 MHz.

À cette fréquence, λ_g vaut 185 mm sur du FR-4 : une piste de 20 mm en fait
0,11. La physique y est quasi-statique — il n'y a rien à voir que Z₀ et ε_eff —
et [ligne_mom.py](python/ligne_mom.py) ne l'approche pas, il la résout : 0,42 %
contre Hammerstad-Jensen, 0,30 % contre la solution exacte en intégrales
elliptiques. Il n'y a pas de marge à reprendre.

La raison de fond :

- `ligne_mom` discrétise une **section droite** — une ligne de panneaux,
  resserrés sur les arêtes où la charge diverge. Une centaine d'inconnues, et la
  géométrie est exacte ;
- le moteur 2,5D discrétise une **surface**. La mesure d'ε_eff de
  [banc_moteur.py](mom_solver/tests/banc_moteur.py) tourne sur trois cellules
  dans la largeur de la piste, et c'est de là que viennent l'essentiel de ses
  0,49 %. Pour égaler `ligne_mom`, il faudrait dix cellules en largeur et un
  maillage fin sur toute la longueur : quelques milliers d'inconnues au lieu de
  cent, pour un résultat moins bon.

Ce n'est pas un défaut d'implémentation, c'est le prix de la généralité. Et les
0,49 % ne disent pas « le 2,5D est moins bon » : ils disent que **deux méthodes
qui ne partagent aucun code tombent sur le même chiffre**. C'est un certificat
de validité, pas un concours de précision.

Le 2,5D gagne là où les **hypothèses** du modèle de ligne tombent, pas là où sa
précision faiblit : coudes, moignons, changements de couche, rayonnement,
résonances de plan, diaphonie entre pistes non parallèles. Soit, sur ces
géométries, **au-delà de 2 à 3 GHz** — ce que dit déjà le lot 3 plus bas.

#### La carte

| Besoin | Bon outil | Effort | Précision attendue |
| --- | --- | --- | --- |
| Z₀, ε_eff, retard, pertes d'une ligne | `ligne_mom` — **fait** | — | 0,3 % |
| **Z différentielle, Z commune** | `ligne_mom` → N conducteurs — **fait** | — | < 3 % / Garg-Bahl |
| **Diaphonie entre pistes parallèles** | idem, même section — **fait** | — | < 3 % / Garg-Bahl |
| Diaphonie croisée, via, changement de couche | moteur 2,5D | gros | quelques % |
| **Chute continue, densité de courant DC** | nouveau solveur résistif surfacique | moyen, simple | bonne |
| **R_AC, effet de peau, resserrement** | section, à l'intérieur du cuivre | moyen | bonne |
| Résonances de plan, Z du PDN en fréquence | 2,5D, ou modèle de cavité | gros | quelques % |
| Ampacité, échauffement | modèle IPC-2152, pas un solveur | petit | ±20 % par nature |

Trois physiques différentes, et le moteur 2,5D n'est le bon outil pour aucune
des lignes en gras. Les deux premières sont faites ; la chute continue et R_AC
aussi. Ce qui reste en gras est ce que la PAGE ne fabrique pas encore.

#### 1. ~~`ligne_mom` à N conducteurs~~ **FAIT (2026-08-31)** — Z différentielle ET diaphonie

**Le meilleur rapport valeur/effort de tout ce fichier**, et c'était vrai : la
machinerie était déjà là. `capacitance_coplanaire`
([python/ligne_mom.py](python/ligne_mom.py)) **assemblait déjà une matrice
multi-conducteurs** — plusieurs blocs de panneaux à la même hauteur, une seule
matrice, un seul noyau — mais ne résolvait qu'un vecteur :

    [A] [q] = [V]     avec V = 1 sur le ruban, 0 sur les plans coplanaires

**Ce qui manquait était le second membre, et rien d'autre.** On en résout
désormais N — potentiel unité sur le conducteur *i*, zéro sur les autres — et
l'on relève la charge portée par chacun. C'est la **matrice de capacité de
Maxwell** [C], celle que la théorie des lignes multiconducteurs demande :
Q = [C] V, diagonale positive, hors-diagonale négative, somme de ligne égale à
la capacité vers la référence. Avec εr = 1 on obtient [C₀], et comme le milieu
n'est pas magnétique,

    [L] = μ₀ ε₀ [C₀]⁻¹

De ces deux matrices sortent, **sans aucun solveur de plus** :

- **Z différentielle et Z commune** — modes pair/impair pour une paire
  (`modes_paire`), décomposition modale de [L][C] au-delà (`_modes`) ;
- **la diaphonie** — NEXT, FEXT, longueur de saturation (`diaphonie`) ;
- les coefficients de couplage k_C et k_L, qui sont ce que la fiche affiche.

**Ce que ça a coûté.** `_matrice` — la partie chère, avec sa quadrature
spectrale — est construite **une seule fois**, et `np.linalg.solve` reçoit les
N seconds membres d'un coup : une factorisation, N substitutions arrière. Le
surcoût est négligeable, et la précision est la même — même discrétisation,
mêmes panneaux resserrés. **N = 1 par la matrice redonne `solve_line` au bit
près**, et le banc le vérifie.

**Une pièce en plus, qui n'était pas prévue : la piste de garde.** Un
conducteur peut porter `masse` — il entre dans la matrice avec ses panneaux et
sa condition à zéro volt, exactement comme un plan coplanaire, mais n'a pas de
port. C'est la réponse de dessin la plus courante à un problème de diaphonie,
et le banc la mesure : elle divise le NEXT par plus de deux, et fait baisser Z₀
des deux signaux — ce qui se dit, parce qu'on ne la pose pas sans revoir la
largeur.

**Le milieu est désormais choisi en un seul endroit** (`_milieu`) : `solve_line`
et `solve_multiline` résolvent la même section, et la 2.2.0 a assez montré ce
que coûtent deux copies d'une même formule.

**Non-régression, dans
[python/test/banc-ligne-mom.py](python/test/banc-ligne-mom.py)** — les cinq cas
annoncés y sont, et sept de plus :

- N = 1 redonne le chiffre actuel **au bit près** (1e-12 relatif) ;
- deux rubans très éloignés se découplent : hors-diagonale à 5·10⁻⁴ de la
  diagonale, et chaque diagonale retrouve la capacité du ruban seul ;
- la matrice est **symétrique** (3,1·10⁻⁶ sur la matrice BRUTE, mesurée avant
  symétrisation, sur trois pistes de largeurs différentes — le cas le plus
  défavorable), à diagonale positive, hors-diagonale négative, et somme de
  ligne entre zéro et la diagonale ;
- **l'étalon extérieur** : Garg-Bahl pour le microruban couplé par les arêtes,
  sur neuf couples (w/h et s/h de 0,5 à 2) — **moins de 3 %** sur Z_diff et
  Z_commune, moins de 2 % sur les ε_eff modaux ;
- Z_diff → 2 Z₀ et Z_commune → Z₀/2 quand l'écart devient grand devant la
  hauteur, à 0,5 % près — c'est ce qui vérifie le facteur deux autrement que
  par convention.

Et une propriété qui ne se discute pas, plus sévère que tous les étalons :
**en milieu homogène, la diaphonie avant est nulle**. Une triplaque y donne
k_C = k_L terme à terme et un FEXT de 4·10⁻¹⁷ ; un microruban donne k_L > k_C
et un FEXT **négatif**. Rien ne vérifie mieux que [C] et [L] décrivent la même
géométrie — une erreur d'un panneau sur l'un des deux se verrait là et nulle
part ailleurs.

**La masse coplanaire y est, sous ses deux formes.** La première version
jetait les deux écarts au plan et annonçait un majorant ; c'était une
précaution inutile. Les deux pages sondent les **plans** sans voir les pistes :
`gap_left` est donc déjà la distance de la sélection au plan de gauche *même
quand une voisine se trouve entre les deux*. Le plan borde le **groupe**, et
l'écart du groupe est celui de la sélection moins le cuivre ajouté de ce
côté-là — rien de plus à mesurer. Et une piste du **net de référence** qui
longe n'est pas une voisine : c'est une **piste de garde**, posée à zéro volt
dans la section, sans port. Mesuré sur une garde entre deux signaux à 0,45 mm :
le NEXT tombe de **3,15 % à 0,96 %**, et Z₀ des signaux de 57,6 à 50,7 Ω — ce
qui se dit, parce qu'on ne pose pas une garde sans revoir la largeur.

**Une section, pas une suite de paires.** Une piste avec deux voisines n'est
pas deux problèmes à deux conducteurs : c'est **un** problème à trois, et les
résoudre séparément compterait deux fois le même champ. Toutes les voisines
d'une même piste entrent donc dans la même matrice. Z différentielle d'une
paire prise dans un bus se lit alors par réduction exacte — les autres
conducteurs tenus à la masse (`sous_systeme`) —, ce qui est une hypothèse, et
qui se dit aussi.

**Les deux sens du bruit.** « Ce que ma piste prend » et « ce qu'elle envoie »
ne sont pas la même chose dès que les deux pistes n'ont pas la même largeur :
le bruit se compte en fraction de l'amplitude de **l'agresseur** et se rapporte
à ses termes propres. Les deux sortent de la même matrice, sans rien résoudre
de plus. Mesuré sur une voisine quatre fois plus large : **5,50 % reçu contre
4,51 % émis**, et le bruit avant **change de signe** d'un sens à l'autre. La
fiche juge ce que la sélection *subit* — c'est la question qu'on pose en la
sélectionnant — et affiche à côté ce qu'elle *injecte*.

**Ce qui reste hors modèle**, et qui est écrit dans le code comme dans la
fiche : ceci couvre le couplage entre pistes **parallèles, sur la même
couche**. Deux pistes qui se croisent, qui se superposent sur deux couches, ou
qui couplent par un champ de vias, ne sont plus une section : là, et là
seulement, il faut le 2,5D. Et quand la page ne trouve **aucun plan à portée**
— elle sonde jusqu'à trois millimètres —, le couplage est calculé sans lui,
donc majoré ; la fiche le dit alors, et seulement alors.

#### 1 bis. L'appariement, côté pages — **FAIT le 2026-08-31**

Le solveur ne peut pas savoir *quelles* pistes se longent. Il fallait deux
choses, et elles ont été mises chacune du bon côté :

- **la page apporte le cuivre**, elle seule le connaît. L'agresseur n'est
  **jamais** dans la sélection — c'est la définition — et l'autre moitié d'une
  paire différentielle non plus. Les deux outils joignent donc au document un
  `voisinage` : les tronçons de piste qui passent à portée, au même format que
  la géométrie (`simVoisinagePcb`,
  [editeur-pcb/js/19-simulation.js](editeur-pcb/js/19-simulation.js) ;
  `simVoisinageIpc`,
  [visionneuse-ipc2581/js/07-simulation.js](visionneuse-ipc2581/js/07-simulation.js)).
  L'éditeur y ajoute ses **paires déclarées** (`S.dpPairs`), que le nommage ne
  dit pas toujours ;
- **le serveur apparie**, une fois pour les deux outils
  (`_paires_paralleles`, [python/simulation_em.py](python/simulation_em.py)) :
  même couche, parallèle à 15° près, un recouvrement mesuré **par projection
  sur l'axe de la victime**, et un écart de cuivre à cuivre qui reste un écart.
  Les longements d'un même net se cumulent en longueur, l'écart est la moyenne
  pondérée, et le plus serré est gardé à part. **Toutes les voisines d'une même
  piste vont dans la même section** (`_poser_section`), avec la masse
  coplanaire du groupe (`_ecarts_masse_du_groupe`) et les pistes du net de
  référence posées en gardes. Deux implémentations de la même règle géométrique
  auraient dérivé : l'éditeur et la visionneuse doivent rendre le même chiffre
  sur la même carte.

**Le temps de montée** vient de la page, ou de la règle du genou
(t_r = 0,35 / f_max) à défaut. Il ne change ni [C] ni [L] : il décide de la
**saturation** du bruit arrière et de l'amplitude du bruit avant.

**Côté panneau**, deux onglets de plus dans la famille SI — « Z différentielle »
et « Diaphonie » —, qui lisent **la même réponse du serveur** que « Impédance » :
changer d'onglet ne relance rien, et les quatre fiches parlent nécessairement du
même cuivre. La fiche de diaphonie **cumule** les agresseurs, parce que trois
voisins à 4 % crèvent un budget de 10 % sans qu'aucune ligne du tableau soit en
rouge.

#### 2. Le solveur DC — **fait**, mais rien ne l'alimente

**Ce n'est pas de l'électromagnétisme du tout** : c'est un problème résistif sur
les formes de cuivre, réel, sans fréquence, à matrice symétrique définie
positive — donc un gradient conjugué et rien de plus. Il est **indépendant de
tout le reste** : il ne partage aucun code avec `ligne_mom` ni avec
`mom_solver`.

**Le solveur est écrit et mesuré** —
[python/dc_solver.py](python/dc_solver.py) 2.0.0, 16 cas dans
[python/test/banc-dc.py](python/test/banc-dc.py) :

- le maillage **surfacique** est là. Une trame carrée par couche, une cellule
  par carreau de cuivre, les voisines de même net reliées par une conductance
  qui vaut exactement σt — donc **indépendante du pas**. C'est ce qui fait
  qu'un barreau redonne ρL/(Wt) *à 0,000 %* et que raffiner la trame ne
  déplace pas le résultat : la trame ne décrit mal que le contour et les
  rétrécissements, c'est-à-dire ce qu'elle décrit mal, et rien d'autre ;
- les **vias** en résistances localisées entre couches, section d'anneau
  plaqué, la conductance répartie sur les carreaux que le trou débouche ;
- les **points d'injection et d'extraction** sont acceptés en disque ou en
  **rectangle** — une pastille en est un —, et filtrés par net : une référence
  de masse posée au milieu d'une carte attrapait sinon le cuivre du net voisin
  qui passe dans le même disque, et le fixait à zéro volt ;
- la sortie : le potentiel par nœud, la chute pire-cas par net, et une carte
  de chaleur **par couche** — peindre deux couches l'une sur l'autre
  mélangerait deux potentiels sans le dire.

**Ce qui manque est tout entier du côté PAGE**, et c'était déjà le cas quand
cette page a été écrite : les **courants**. C'est le schéma qui sait ce qu'un
composant tire, et il ne le porte pas encore. Avec eux, l'extraction du cuivre
par couche et par net dans les deux adaptateurs (`cuivreDC()`, contrat décrit
en tête de [commun/simulation-em.js](commun/simulation-em.js)) et la peinture
de la carte (`peindreDC()`).

#### 3. ~~La résistance AC~~ **FAIT (2026-08-28)**

~~Aujourd'hui `line_losses` ([python/ligne_mom.py](python/ligne_mom.py)) prend une~~
~~formule analytique d'épaisseur de peau. Un vrai calcul demande Helmholtz complexe~~
~~**à l'intérieur** du conducteur : des panneaux dans le cuivre, ou une condition~~
~~d'impédance de surface. Même architecture que le reste de `ligne_mom`, et ça se~~
~~branche au même endroit.~~

~~À noter : le **resserrement par proximité** — le courant d'une piste repoussé par~~
~~celui de sa voisine — n'apparaît que dans une section **multi-conducteurs**. Ce~~
~~chantier vient donc après le n° 1, et en dépend.~~

**Ce qui est fait :**

- `line_losses` corrigée avec le modèle industriel :
  - `α_c = R_s / (2 * Z0 * w)` en Np/m, avec `R_s = 1/(σ δ)` la résistance de surface
  - Correction du bug : l'ancienne version avait un facteur 2 manquant qui doublait les pertes
  - À 5 GHz sur 35 µm de cuivre : δ = 0.93 µm, Rs = 18.5 mΩ/carré, α_c ≈ 4.2 dB/m

- `line_losses_detaillees` ajoutée pour le diagnostic :
  - `Rs` : résistance de surface en Ω/carré
  - `delta_peau` : profondeur de peau en mètres
  - `R_ac_par_m` : résistance AC du conducteur en Ω/m
  - `facteur_forme` : rapport périmètre/section
  - `alpha_c_dB` et `alpha_d_dB` en dB/m

#### 4. Ce qui n'est pas un solveur

**L'ampacité** — combien d'ampères une piste peut porter — est de la thermique :
IPC-2152, un modèle et des tables, avec une incertitude de ±20 % dans la nature
des choses. Si c'est ce qu'on veut afficher, il ne faut pas le chercher du côté
des champs, et il faut afficher l'incertitude avec le chiffre.

#### L'ordre

1. ~~**`ligne_mom` à N conducteurs**~~ **FAIT (2026-08-31)**, et il a bien
   débloqué les deux : Z différentielle et diaphonie sortent de la même section
   à N conducteurs, résolue une seule fois. Moins de 3 % contre Garg-Bahl,
   FEXT nul en milieu homogène, et l'appariement des tronçons parallèles avec.
   Ce qui reste de ce côté-là n'est plus un chantier mais des réserves écrites :
   pas de couplage entre couches, pas de croisement, et un couplage majoré
   quand aucun plan n'est à portée du groupe.
2. ~~Le côté PAGE du solveur DC~~ **FAIT dans les DEUX outils (2026-08-29)** :
   bornes désignées au clic — autant de sources et de références qu'on veut —,
   ampérages saisis, tout le cuivre du net envoyé sur toutes ses couches,
   détail **via par via**, **densité de courant** et **échauffement IPC-2221**
   en retour, la tension qui arrive à chaque charge, et la carte de chaleur au
   choix des trois (34 cas dans
   [python/test/banc-dc.py](python/test/banc-dc.py), 35 dans
   [editeur-pcb/test/harness.js](editeur-pcb/test/harness.js), 42 dans
   [visionneuse-ipc2581/test/harness-sim.js](visionneuse-ipc2581/test/harness-sim.js)).
   Reste la donnée que rien ne fabrique : **les courants du schéma**.
3. ~~R_AC par la section~~ **FAIT** (2026-08-28).
4. ~~Le port vertical du moteur 2,5D~~ **FAIT (2026-08-30)**. Le port est un
   VIA : on perce le maillage, on descend un fût jusqu'au plan de masse, et on
   pose le générateur sur la fente du bas — un shunt piste/plan, qui est ce
   qu'un port de microruban est. Il a fallu les trois pièces annoncées, et une
   quatrième qu'on n'avait pas vue :
   - `G_A^zz`, dérivée puis vérifiée sur sa signature : un dipôle électrique
     **vertical** a une image de **même signe** dans un plan parfait, quand un
     dipôle horizontal en a une opposée. 3·10⁻¹⁶ contre la forme fermée ;
   - les **demi-RWG** du bas du fût, dont l'image dans le plan complète la
     fonction — exactes, et non un pis-aller ;
   - le **dé-embarquement** par T₂T₁⁻¹, qui retire le via, le trou et le coin ;
   - et la **hauteur électrique** : la pile géométrique et la pile électrique
     ne coïncident pas, le cuivre ayant une épaisseur géométrique et aucune
     épaisseur électrique. 9 % d'écart sur du FR-4 de 0,37 mm.

   **Mesuré** : |S₂₁| passe de 0,0065 à 0,96 sur la même ligne, et ε_eff
   dé-embarqué tombe à **0,93 %** de `ligne_mom` à 5 GHz, 1,11 % à 10 GHz.

5. ~~Le 2ᵉ branchement DCIM~~ **RÉPARÉ (2026-08-30)**. Trois fautes, toutes du
   même genre — deux bases confondues : les images du 3ᵉ niveau étaient
   resommées avec le `k` du substrat ; le reste à ajuster était pris en `k_z`
   de l'air alors que les deux premiers niveaux vivent en `k_z` du substrat ;
   et le garde-fou de portée, mesuré en épaisseurs de stratifié, **rejetait
   toutes** les images du branchement air — le niveau ne posait pas une seule
   image. `ComplexImage` porte maintenant son `k_onde`. `banc_dcim` repasse à
   25/25, ε_eff revient à 0,49 %, et l'erreur de champ lointain est divisée
   par trois (9,6 % → 6,2 % à 10 mm). Reste **hors du chemin par défaut**,
   pour son coût : le gain est en champ lointain, sans effet sur une matrice
   d'impédance, et il vaut huit images de plus par noyau.

6. ~~Plan de masse multiple~~ **FAIT (2026-08-30)**, et ce n'était pas de la
   plomberie. `profils_noyaux_multiples` rendait un noyau croisé qui était, au
   bit près, celui de la couche du bas : elle construisait un « profil
   croisé » puis rappelait `noyaux_green` sans le lui passer. Et le profil
   croisé lui-même n'était pas la bonne idée — il recollait deux demi-empilages
   pour fabriquer une pile qui n'existe pas. La fonction de Green entre deux
   plans est celle de la **même** ligne, lue à un autre endroit : c'est
   `profil_croise` / `noyaux_croises`, par transfert de tension exact.
   Vérifié par la réciprocité (10⁻¹⁴), par la cohérence avec `_impedance_vue`
   (4·10⁻¹⁶) et par une forme fermée qui redonne les deux images ±1 aux
   profondeurs exactes. `mom_engine` route désormais chaque paire de triangles
   vers le noyau de sa paire de couches ; un plan de masse entre deux signaux
   rend un bloc **exactement nul**.

7. ~~Optimisation numba~~ **FAIT AUTREMENT, ET MIEUX (2026-08-30)**. Le profil
   désignait `_somme_ondes` — la moitié du temps —, mais pas pour la raison
   qu'on croyait : le calcul était fait **image par image**, en petites
   opérations numpy sur des tableaux de 49 nombres, et le coût était celui des
   appels. Rangé en tableaux (points × images), l'assemblage passe de
   **20,4 s à 5,0 s** pour 269 RWG. C'est **exact** — le banc le vérifie
   contre une somme naïve —, donc aucune étude d'erreur d'interpolation n'a
   été nécessaire. Le profil est maintenant **plat** : `_somme_ondes` n'y pèse
   plus que 19 %, et une tabulation approchée ne rapporterait au mieux qu'un
   facteur 1,2 pour le prix d'une approximation. Ce n'est plus la bonne
   dépense.


Le plan parfait et infini est une hypothèse fondamentale du modèle 2,5D — la
lever demande un solveur 3D complet. C'est une **réserve écrite**, pas un
chantier : ce qu'elle coûte, cas par cas, est en tête de `indices_plans_masse`
([mom_solver/green_layered.py](mom_solver/green_layered.py)) et résumé plus
bas.


### La famille PI porte une analyse, dont la moitié serveur seule est faite

Le panneau se range en deux familles — **SI** (intégrité du signal) et **PI**
(intégrité de l'alimentation). SI porte quatre analyses — « Impédance »,
« Z différentielle », « Diaphonie » et « Current Return Path », qui lisent
**la même réponse du serveur** : changer d'onglet ne relance rien. PI porte
« Chute DC », **branchée de bout en bout dans les DEUX outils depuis le
2026-08-29** : bornes désignées au clic, cuivre du net envoyé sur toutes ses
couches, détail via par via en retour, et la carte de potentiel peinte sur la
carte.

Le registre est `SIM_FAMILLES` / `SIM_ANALYSES`
([commun/simulation-em.js](commun/simulation-em.js)). Une analyse y déclare
`nom`, `titre`, `corps()` (ses commandes), `brancher()`, `rendre()` et `peint`
— ce dernier commandant `simZActif()`, donc la carte de chaleur. L'onglet
apparaît tout seul.

Ce qu'il y aurait à mettre dans PI, par ordre de ce que le dépôt sait déjà
faire :

1. **La chute continue (IR drop).** **Le SOLVEUR est fait et mesuré ; le
   côté PAGE ne l'est pas.** Les deux moitiés étaient annoncées faites, et
   aucune ne l'était.

   **Ce qui est fait**, dans [python/dc_solver.py](python/dc_solver.py) 2.0.0 :

   - un maillage **surfacique** — chaque couche tramée au pas demandé, une
     cellule par carreau de cuivre, les voisines de même net reliées par une
     conductance. Sur une trame carrée cette conductance vaut exactement σt,
     donc un barreau redonne ρL/(Wt) **à 0,000 %** ; raffiner la trame ne
     déplace pas le résultat, ce que le banc vérifie sur trois pas dans un
     rapport de quatre ;
   - les **vias** en résistances localisées entre couches, section d'anneau
     plaqué ;
   - des **références déclarées** (Dirichlet), et un refus explicite quand il
     n'y en a pas : une chute se mesure entre deux points, et la version
     précédente ancrait le nœud numéro zéro — un coin de la boîte englobante,
     sur n'importe quel net ;
   - une matrice qui reste **symétrique définie positive** : les inconnues de
     Dirichlet sortent du système au lieu d'être écrasées ligne par ligne, ce
     qui détruisait la symétrie sous un gradient conjugué qui la suppose ;
   - un contrôle de **connexité** : un îlot qui n'atteint aucune référence rend
     la sous-matrice singulière, et le CG s'arrête alors sur un résidu petit en
     rendant des milliards de volts. On le cherche par un parcours en largeur,
     avant de résoudre ;
   - la route `/api/simulation-dc`, en POST **et en GET** — `_dc_etat` était
     écrite mais routée nulle part.

   **Ce que la 1.0.0 faisait, et qui explique le reste :** elle montait son
   réseau sur le **périmètre** des polygones — le courant faisait le tour du
   cuivre au lieu de le traverser —, passait `tol=` à `scipy.sparse.linalg.cg`
   (retiré en SciPy 1.14, et ce dépôt tourne sur 1.16), et **rattrapait le
   TypeError pour rendre un potentiel identiquement nul**. Zéro volt de chute
   sur toute la carte est le pire des faux résultats : il a l'air d'une bonne
   nouvelle.

   **LE CÔTÉ PAGE, FAIT LE 2026-08-29 — et le blocage levé par un détour.**

   Le chantier était réputé bloqué par les **courants**, qui ne viennent pas
   du PCB : c'est le schéma qui sait ce qu'un composant tire, et il ne le
   porte toujours pas. Le détour est de ne pas les attendre : **l'utilisateur
   désigne deux pastilles** — une SOURCE qui injecte, une RÉFÉRENCE tenue à sa
   tension — et pose lui-même l'ampérage. La question qu'on se pose devant une
   carte, « combien je perds entre ce régulateur et ce connecteur », n'en
   demandait pas davantage.

   - **`cuivreDC()` dans l'éditeur PCB**
     ([editeur-pcb/js/19-simulation.js](editeur-pcb/js/19-simulation.js)) :
     tout le cuivre du net des deux bornes part au solveur — pistes (une droite
     en un quadrilatère, un arc en une suite), zones, pastilles, sur **toutes**
     les couches ; les découpes partent en `trou`, qui retire du cuivre au lieu
     d'en poser.
   - **La désignation par clic**, calquée sur le mode « mesure » : le panneau
     arme, la carte reçoit le clic, la pastille est nommée (« J1.1 ») et le
     panneau la relit à chaque affichage — une pastille effacée en disparaît.
   - **LE CHANGEMENT DE COUCHE, ET CE QU'IL A COÛTÉ.** Les vias du net partent,
     évidemment. Mais une **pastille traversante** pose un anneau de cuivre sur
     chaque couche, et ce qui les relie est le **tube métallisé** de son
     perçage — un conducteur au même titre. Ne pas l'envoyer laissait ces
     anneaux électriquement flottants et le solveur refusait tout le calcul :
     « 2016 nœuds n'atteignent aucune référence ». **Aucune relecture ne
     l'aurait montré** : il a fallu envoyer au serveur le document que
     l'éditeur produit vraiment. Vias et tubes partent donc en liaisons entre
     couches **voisines**, chacune avec la hauteur de son propre intervalle, et
     seulement entre les couches qui portent effectivement du cuivre.
   - **Le tableau via par via**, qui est ce qui a été demandé : repère,
     couples de couches, courant, chute et résistance, les plus chargés en
     tête. Le solveur le rend à partir des paires de nœuds qu'il a reliées, ce
     qui rend le courant **exact** — sur deux plans reliés par un seul via, il
     redonne l'ampérage entier, par la loi des nœuds, et le banc le vérifie.
   - **Le déséquilibre, dit juste.** La première version sommait le courant de
     tous les vias pour en tirer une part — et annonçait « le plus chargé porte
     25 % » là où un seul chemin portait la totalité, parce qu'un tube est une
     **chaîne** de liaisons en SÉRIE. On ne compare donc que les vias reliant
     le **même couple de couches**, qui sont bien en parallèle.

   **LES TROIS RESTES, FAITS LE 2026-08-29 (2ᵉ passe) :**

   - **LA VALEUR SOUS LE CURSEUR.** Une carte de chaleur montre OÙ, jamais
     COMBIEN : on voyait que ça chauffait là, sans savoir si c'était deux
     degrés ou quarante. Le survol affiche maintenant la valeur du carreau
     pointé, dans la grandeur choisie. Elle lit le RÉSULTAT et non le pixel
     peint — repasser par la couleur ferait deux conversions et rendrait un
     nombre qui n'est plus celui du solveur. Hors du cuivre : rien, pas un
     zéro, pas la valeur du voisin. Et le survol ne redessine que si l'on
     change de carreau, sans quoi une grande sélection deviendrait inutilisable.

   - **LA CARTE SORTAIT EN MIROIR VERTICAL**, dans les deux outils. L'image
     était construite avec sa ligne 0 au y *maximum* du monde, « parce que
     l'écran a son y vers le bas » — vrai de l'écran, faux de la destination :
     `drawImage(img, x0, y0, w, h)` pose la ligne 0 au y **minimum**, et on
     dessine en coordonnées MONDE. C'était donc un retournement de trop côté
     visionneuse (`setTransform(s,0,0,-s,…)`) et un de trop côté éditeur
     (`(s,0,0,s,…)`) : un défaut d'alimentation se lisait à l'opposé de là où
     il est. Le cas qui le garde est **asymétrique dans les deux axes** — un
     motif symétrique passe un miroir sans broncher, et c'est exactement ce
     qui avait laissé ce défaut vivre.

   - **LA TRAME N'EST PLUS UN RÉGLAGE.** Le champ portait 0,2 mm d'office et
     personne ne pouvait savoir ce qu'il fallait y mettre. Elle se déduit
     maintenant du cuivre : **huit carreaux dans la largeur de la forme la plus
     étroite**, avec un garde-fou qui l'élargit — en le disant — si le nombre
     de nœuds dépasse le budget. Le champ vide veut dire « choisis-la ».

     POURQUOI HUIT ET NON QUATRE, qui est le seuil du mailleur : la largeur que
     le solveur VOIT est **quantifiée par la trame**, et l'échauffement va en
     `A^(−0,725/0,44)`. Mesuré : la même piste de 0,5 mm rendait 0,60 mm de
     section au pas de 0,15 et 0,50 mm au pas de 0,125 — 15,45 K contre 20,87,
     soit exactement `(0,5/0,6)^1,6477`. À huit carreaux l'écart tombe de
     moitié. Il en reste une incertitude d'une dizaine de pour cent sur la
     forme la plus fine, et c'est écrit.

   - **UN « undefined » S'AFFICHAIT SOUS LE PANNEAU.** `simRendre` fait
     `box.innerHTML = a.rendre()` ; « Chute DC » écrivait dans un `<div>` à
     elle et ne rendait **rien**. Les essais ne l'ont pas vu parce qu'ils
     appelaient `rendre()` directement, où la valeur de retour ne gêne
     personne — c'était le CONTRAT du registre qui n'était pas tenu. Un cas le
     vérifie désormais pour **toutes** les analyses, dans chacun de leurs états.

   - **LE PANNEAU DIT CE QU'IL A PRIS** : combien de formes, sur combien de
     couches, découpes comprises, « pistes, pastilles et plans compris ». Un
     chiffre dont on ignore l'assiette ne se vérifie pas — et rien ne montrait
     que le plan de masse était bien dedans.

   - **LE VOCABULAIRE, remis à l'endroit.** Les deux bornes s'appelaient
     « source » (qui portait le COURANT) et « référence » (qui portait la
     TENSION) — l'inverse exact de la façon dont on raisonne devant une carte,
     et l'utilisateur l'a dit : *« je veux choisir une source où je règle la
     tension, et une charge où je règle le courant consommé »*. C'est ainsi
     désormais : une **source** est une alimentation, on lui règle ses
     **volts** ; une **charge** est un consommateur, on lui règle ses
     **ampères**. Le solveur, lui, n'a pas bougé : une source est une condition
     de Dirichlet, une charge une condition de Neumann à courant **négatif** —
     il sort du cuivre. La traduction se fait dans les deux adaptateurs, en un
     seul endroit chacun.

   - **CE QUE LE PANNEAU DIT MAINTENANT EN PREMIER** : la tension qui ARRIVE à
     chaque charge. C'est la question qu'on pose à ce calcul — « j'ai 3,3 V au
     régulateur, combien en reste-t-il là-bas ? » —, et la chute du net n'y
     répond pas dès qu'il y a plus d'un consommateur. Vérifié à la main :
     3,2928 V calculés contre 3,2927 attendus sur un barreau à deux
     consommateurs.

   - **UN DÉFAUT VIVANT, TROUVÉ EN LE CHERCHANT.** `simDCLancer` lisait encore
     `simDCI` et `simDCU`, les deux champs disparus du panneau le jour où les
     bornes sont devenues une liste. `parseFloat(undefined)` rend NaN : le
     bouton « Calculer » **refusait toujours**. Aucun essai ne l'a vu, parce
     qu'aucun n'exerçait cette fonction — le contrôle de câblage ne lisait que
     l'affichage. Il lit désormais le lancement aussi.

   - **Plusieurs bornes, et pas deux.** Le panneau n'acceptait qu'une source et
     une référence, ce qui décrit un cas et un seul. Or la chute que voit un
     consommateur dépend de **ce que tirent les autres** — c'est même la raison
     d'être du calcul —, et deux champs obligeaient à autant de calculs
     séparés, dont aucun n'aurait été juste. Le panneau porte maintenant une
     **liste** : « + source », « + référence », chacune avec sa valeur.
     Plusieurs références ont aussi un sens (deux régulateurs en parallèle, un
     connecteur à deux broches). Vérifié contre le calcul à la main sur un
     barreau : l'écart entre deux consommateurs vaut `r·I₂·(x₂−x₁)` à
     **0,278 %**.
   - **La carte de potentiel est peinte**, dans les deux outils. On peint les
     **nœuds** — un carreau de trame chacun —, et non la grille `cartes` que le
     serveur rend aussi : celle-ci couvre la *boîte englobante* et porte, hors
     du cuivre, le potentiel du nœud le plus proche ; la peindre étalerait de
     la couleur sur du vide. Une image par couche est pré-calculée à l'arrivée
     du résultat, un pixel par carreau, et la teinte va du **cyan** à
     l'**ambre** — délibérément pas du rouge, qui est celui du DRC.
   - **`cuivreDC()` dans la visionneuse.** Pistes, arcs, plans à contours et
     pastilles tirées de padstacks ressortent en polygones, en millimètres
     quelle que soit l'unité du fichier ; les découpes de plan partent en
     `trou`.

   **CE QUE LA VISIONNEUSE A COÛTÉ, ET C'EST LA MÊME LEÇON QUE LA PREMIÈRE
   FOIS.** Onze cas de banc passaient — tube contigu, hauteur juste, net
   conservé, unité convertie — pendant que le document, dans son ensemble,
   était **incalculable** : les pastilles traversantes posaient du cuivre sur
   les deux couches et rien ne les joignait, faute d'un perçage listé à leur
   emplacement. Le solveur refusait tout (« 1240 nœuds n'atteignent aucune
   référence »), et il a fallu lui **envoyer** le document pour le voir. Un
   padstack qui place du cuivre sur deux conducteurs *décrit* un trou
   métallisé : le tube est maintenant déduit, avec son perçage marqué SUPPOSÉ.
   Le côté éditeur avait eu exactement le même défaut, pour exactement la même
   raison. Les cas qui vérifiaient la FORME de chaque morceau l'ont tous
   laissé passer ; celui qui juge le document **entier** — « toute couche
   portant du cuivre doit être atteignable depuis la source » — l'aurait vu, et
   il existe maintenant dans les deux bancs.

   **LA CHUTE NE DIT PAS TOUT — densité et échauffement (2026-08-29, 3ᵉ passe).**

   Une piste peut tenir sa chute et fondre quand même : c'est la **section** qui
   chauffe, pas la longueur. Mesuré sur une piste de 2 mm étranglée à 1 mm sur
   deux millimètres : la chute monte de **6 %**, la température **triple**. Ni
   la chute ni aucun contrôle géométrique ne le voient — la piste y respecte sa
   largeur minimale. Le panneau rend donc aussi :

   - **la densité de courant**, `J = I/(W·t)`, en A/mm². Vérifiée à **0,000 %**
     contre le calcul à la main sur un barreau ;
   - **l'échauffement**, par la charte **IPC-2221** :
     `I = k·ΔT^0,44·A^0,725`, `k` = 0,048 en couche extérieure et 0,024 en
     interne. Vérifié à **0,00 %** contre la charte reposée à la main, et le
     rapport interne/externe tombe sur le `2^(1/0,44) = 4,83` qu'elle impose.

   **CE QUI A FAILLI PARTIR FAUX, ET QUI EST LA VRAIE LEÇON DE CETTE PASSE.**
   Le maximum de densité **ne converge pas** : à un angle rentrant le champ est
   singulier, et le pic croît sans borne au raffinement — 93,7 puis 104,4 puis
   129,3 A/mm² aux pas 0,2 / 0,1 / 0,05 mm, sur la même géométrie. Ce n'est pas
   un défaut du solveur, c'est la solution exacte ; mais **un maximum qui
   dépend d'un réglage de maillage n'est pas un chiffre d'ingénieur**.

   La première version mesurait pour cela une largeur locale autour de chaque
   point, perpendiculairement à l'axe dominant du courant. Dans un angle le
   courant est diagonal : le balayage traversait la marche au lieu du
   conducteur, voyait une section trop courte, et rendait **21,9 K là où le col
   en vaut 16,7** — trente pour cent de trop, sur une géométrie où la réponse se
   pose à la main. L'échauffement vient maintenant d'une **coupe** : la somme
   des courants qui franchissent une colonne de carreaux. C'est un flux, donc
   il ne bouge plus — 16,739 K aux trois pas, et 0,0 % d'écart avec la main.

   Les deux chiffres se lisent donc différemment, et le panneau le dit : la
   **densité de pointe** dit *où* regarder, l'**échauffement** dit *combien*.

   **CE QUE L'ÉCHAUFFEMENT N'EST PAS.** IPC-2221 est une charte empirique,
   relevée sur un conducteur **isolé**, à l'air calme, sans cuivre voisin ni
   composant chaud — elle ne connaît ni le stratifié, ni les plans qui évacuent.
   **IPC-2152** lui a succédé et donne des températures notablement plus basses
   dans la plupart des cas, justement parce qu'elle tient compte de la
   conduction du substrat. Elle n'est pas implémentée : ce qui est rendu est
   **conservateur**, et c'est le bon sens de l'erreur. Le résultat porte cette
   phrase lui-même, et le panneau l'affiche.

   **LA CARTE DE CHALEUR** se choisit entre les trois grandeurs — échauffement
   d'office, puisque c'est celle sur laquelle on élargit une piste. Elle est
   découpée exactement sur le cuivre analysé : un carreau de trame par pixel,
   rien hors du cuivre.

   **Ce qui manque encore de ce côté :**

   - **IPC-2152** à la place d'IPC-2221 : elle demande la conductivité du
     stratifié et l'épaisseur de la carte, que l'empilage porte déjà des deux
     côtés. C'est le chantier qui rendrait la température juste plutôt que
     prudente ;
   - les **courants venus du schéma**, toujours. Ce qui est là remplace la
     donnée manquante par une saisie, il ne la fabrique pas : dix consommateurs
     demandent dix clics, et personne ne vérifie que la somme correspond à
     quelque chose de réel ;
   - la **portée des perçages** dans la visionneuse : le modèle ne la porte
     pas, tous les trous sont pris traversants. Un via borgne ou enterré est
     donc modélisé plus long qu'il n'est, et sa résistance surestimée. C'est le
     parseur qu'il faudrait compléter, pas le solveur ;
   - dans la visionneuse, la carte de potentiel ne peint que **la couche de la
     première source** : l'outil affiche toutes les couches à la fois et n'a
     pas de couche active, alors que superposer deux potentiels les mélangerait
     sans le dire.

2. **l'impédance vue par le composant** (Z du PDN en fréquence), qui demande le
   condensateur de découplage, son inductance parasite d'accès, et la capacité
   plan-plan. Cette dernière tombe directement de l'empilage déjà envoyé ;
3. **les résonances de plan**, qui demandent l'onde complète — donc la section
   ci-dessus.

Dans SI, à côté d'« Impédance » : la **diaphonie** et l'**impédance
différentielle** sont **faites depuis le 2026-08-31** — c'était bien le même
chantier, et le second membre généralisé a suffi. Voir « Quel solveur pour quel
besoin », point 1. Ce qui reste de ce côté-là est le **diagramme de l'œil**, qui
n'est que la réponse impulsionnelle des paramètres S déjà calculés.

### Réparer l'onde complète, ou l'assumer morte

`mom_engine.py` **est sur le chemin de calcul depuis le 2026-08-30.** Ce qui
l'en tenait écarté était le modèle de port, et ce n'est plus le cas : le port
est un via qui relie la piste au plan de masse, |S₂₁| passe de 0,0065 à 0,96
sur la même ligne, et ε_eff dé-embarqué tombe à 0,93 % de `ligne_mom`. Ce qui
reste est écrit plus bas, et se lit comme des réserves, pas comme des
blocages.

**Ce qui est réparé, et à combien.**

1. ~~La formulation EFIE est amputée de moitié.~~ **Faux depuis la 2026-08-28.**
   `compute_interactions` implémente la MPIE complète — terme de potentiel
   scalaire compris, produit scalaire vectoriel f_m·f_n.
2. ~~Les images complexes sont inventées.~~ **Réécrit.** `apply_dcim` passe par
   la fonction de Green spectrale **exacte** du milieu stratifié (cascade de
   lignes de transmission, TLGF), un vrai **GPOF** de Hua-Sarkar à **deux
   niveaux** (Aksun), et l'identité de Sommerfeld.
3. ~~`mom_engine` n'a qu'UN noyau pour DEUX potentiels.~~ **Réparé.** C'était le
   chantier n° 1 et il est fait. `G_A^xx = V_i^h/(jω)` suit la ligne **TE** ;
   `G_q = ω(V_i^h − V_i^e)/(j k_ρ²)` est la **différence des deux lignes** —
   Michalski-Zheng, formulation C. Et non « la ligne TM », comme cette page
   l'écrivait : le raccourci n'est juste qu'à la limite quasi-statique, où le TE
   ne porte rien d'électrostatique, ce qui explique que l'ancienne version
   donnait une capacité plausible. `green_layered.noyaux_green` rend les deux
   jeux d'images séparément, avec leurs constantes (μ₀ d'un côté,
   1/(ε₀ ε_ref) de l'autre) : `mom_engine` n'a plus de permittivité à choisir —
   `get_effective_epsilon`, qui moyennait les épaisseurs de tout l'empilage
   alors que l'ajustement normalise par le seul milieu porteur, est supprimé.
4. ~~L'onde de surface n'est pas extraite.~~ **Extraite** — pôle localisé par
   recherche de racine sur `Z_bas + Z_haut = 0`, résidu par `N/D'`, réinjecté
   analytiquement en `H₀⁽²⁾`. **Et ça n'a rien changé au champ lointain, ce qui
   était la découverte** : voir ci-dessous.
5. ~~La quadrature de `compute_interactions` est à un point.~~ **Réparée.** La
   correction logarithmique additive dont le poids était posé à la main (« 1,0
   si triangle partagé, 0,3 si sommet partagé ») est supprimée. La part
   singulière — l'image confondue avec la source, la seule qui pique — est
   intégrée par un **changement de variable polaire** qui annule le 1/R contre
   son jacobien, avec coupure au pied de la perpendiculaire ; le reste, borné,
   passe par Gauss à 7 points.
6. ~~`test_basic.py` est périmé et ne mesure rien.~~ **Supprimé**, remplacé par
   [mom_solver/tests/banc_chaine.py](mom_solver/tests/banc_chaine.py).

**Deux défauts de maillage trouvés au passage, et corrigés.** `mesh_polygon`
posait tous ses sommets à `z = 0` et le mailleur gardait ce zéro : une piste et
son plan de masse se retrouvaient **confondus dans l'espace**. Et le plan de
masse était **maillé**, alors que la fonction de Green le compte
analytiquement — son courant était compté deux fois. La règle vient maintenant
de `green_layered.indices_plans_masse`, appelée des deux côtés, pour qu'ils ne
puissent pas diverger.

**Ce que ça vaut, mesuré.** Trois bancs, **56 essais** au 2026-08-30.

| Contrôle | Résultat |
| --- | --- |
| Milieu vraiment homogène : les trois noyaux normalisés | 1 à 10⁻⁶ près |
| Plan de masse dans l'air : les deux potentiels valent `1 − exp(−2j k_z h)` | exact |
| Potentiel vecteur d'un microruban FR-4 : deux images parfaites | −1,00008 à 0,7400 mm pour 2h = 0,7400 mm |
| Rapport G_q/G_A en champ très proche contre (1+εr)/2 = 2,6850 | 2,6898 |
| Pôle d'onde de surface contre la relation de dispersion du manuel | 11 chiffres |
| Résidu du pôle contre sa forme fermée | 0,0004 % |
| Transformée du pôle (Hankel) sur une fonction purement rationnelle | 0,003 % |
| Images contre Sommerfeld numérique, 0,1 → 5 mm | 0,04 % (G_A), 0,74 % (G_q) |
| Désingularisation polaire contre la formule fermée de Wilton | 0,0002 % (0,019 % près d'un sommet) |
| **ε_eff d'une ligne de 12 mm contre `ligne_mom`** | **0,49 %** |
| La même, avec UN seul noyau pour les deux potentiels | **26 %** |

Cette dernière ligne est la mesure du chantier n° 1 : même maillage, même
ligne, seule change la fonction de Green du terme inductif.

**Trois choses que la mesure a démenties.**

1. **Le champ lointain ne décroche PAS à cause de l'onde de surface.** Cette
   page l'affirmait ; c'était plausible et jamais mesuré. Le pôle est
   maintenant extrait exactement, et l'écart n'a pas bougé (9,6 % à 10 mm
   avant, 9,6 % après). Sur 0,37 mm de FR-4 à 1 GHz le TM0 a
   `n_eff = 1,000018` : il est à peine lié et ne porte rien. **La vraie cause
   est le SECOND point de branchement**, celui du demi-espace d'air en `k₀` :
   la DCIM ajuste des exponentielles en `k_z` du *substrat*, ce qui est la
   bonne base pour le branchement de référence et n'en est aucune pour l'autre.
   Preuve : l'écart suit le contraste diélectrique et **disparaît** quand εr
   tend vers 1 (0,005 % à 10 mm contre 9,6 % sur du FR-4), ce qui ne serait
   vrai d'aucune autre cause. **Fait le 2026-08-30** : le troisième niveau de
   DCIM, paramétré en `k_z` de l'air, divise l'écart par trois (9,59 % →
   6,19 % à 10 mm). Il ne l'annule pas, et pour une raison qui se dit :
   l'onde latérale décroît en 1/ρ², les images en 1/ρ.
   *L'extraction du pôle reste utile et est conservée* : sur 3 mm de FR-4 à
   10 GHz (`n_eff = 1,222`) elle divise l'écart par trois à quatre.
2. **Le modèle de port ne conduisait rien, et la passivité n'y voyait rien.**
   `map_ports_to_rwg` associait à chaque port **une** arête : une tension posée
   sur une seule arête interne d'un ruban continu est **contournée par le métal
   d'à côté** — `|Y₂₁/Y₁₁| = 1,5·10⁻⁵`, `|S₁₁| = 1,0000`, `|S₂₁| = 0,0000`,
   quelle que soit la géométrie. Et la matrice S était parfaitement passive :
   un solveur qui ne transmet rien ne viole aucune conservation. C'est pourquoi
   `banc_chaine.py` sépare l'essai de passivité de l'essai de transmission.
   Le port est maintenant une **coupe complète** du conducteur — l'ensemble des
   arêtes dont les deux triangles tombent de part et d'autre d'un plan, donc la
   frontière exacte entre deux paquets de triangles : rien ne passe sans en
   traverser une. `|Y₂₁/Y₁₁|` passe à 5,0·10⁻², trois ordres de grandeur.
3. **Mais une coupe est une fente EN SÉRIE, et ce n'est pas un port de
   microruban** — **corrigé le 2026-08-30, voir plus bas.** Un port de
   microruban est une tension entre la piste et le **plan de masse** : il
   demande un courant **vertical**, donc un via. Entre
   deux fentes série, la piste est un conducteur flottant — le générateur ne
   voit que la capacité du tronçon qu'il isole (mesuré : `Z_in = 14 − j766 Ω`,
   soit quelques centièmes de picofarad). Une fente série finit par coupler au
   mode guidé, mais seulement quand la ligne est longue devant la longueur
   d'onde, et **c'est mesuré sur une même géométrie** :

   | L/λ_g | 0,07 | 0,37 | 0,75 | 1,50 |
   | --- | --- | --- | --- | --- |
   | \|S₂₁\| | 0,007 | 0,106 | 0,206 | 0,540 |

   La croissance est la signature : un écart venu de la fonction de Green ou de
   la quadrature n'aurait aucune raison de suivre L/λ. C'est aussi pourquoi
   `banc_moteur.py` mesure ε_eff sur **l'onde stationnaire du courant** au
   milieu d'une ligne de une virgule cinq longueur d'onde, et non sur des
   paramètres S : là, le couplage est établi et le modèle de port ne compte
   plus.

**Ce qui a été fait le 2026-08-30, et ce qui reste.**

1. ~~Le port de microruban demande des courants VERTICAUX.~~ **FAIT.** Ce qui
   existait — `excitation_via_port()`, `courant_total_via()`,
   `_creer_via_port()` — approchait l'excitation par des **poids en distance**
   sur les arêtes horizontales voisines : ça n'introduisait aucun courant
   vertical, seulement une excitation floue de la piste. Ces trois fonctions
   ont été remplacées, pas complétées.

   **Le port est maintenant un puits.** On perce le maillage — un triangle
   retiré —, on descend un fût sur le contour du trou, et on pose le
   générateur sur la fente infinitésimale entre le bas du fût et le plan de
   masse. Percer plutôt que souder sous la piste évite la **jonction en T** :
   chaque arête du trou retrouve exactement deux triangles, donc une RWG
   ordinaire, et rien de nouveau n'est nécessaire au sommet.

   Quatre pièces, chacune éprouvée séparément :

   - **`G_A^zz`**, la composante verticale du potentiel vecteur. Elle se
     dérive en trois pas — un courant vertical est une source de **tension en
     série** sur la ligne TM, là où un courant horizontal est une source de
     **courant en parallèle** — et elle tient en une ligne :
     `G_A^zz = μ₀ I_v^e/(jω ε₁)`. Sa signature la fixe : un dipôle électrique
     **vertical** a une image de **même signe** dans un conducteur parfait,
     quand un dipôle horizontal en a une opposée. Le banc mesure 3·10⁻¹⁶
     contre la forme fermée, et vérifie qu'on est loin de l'autre signe ;
   - **quatre familles de rayons** pour lire n'importe quel couple de
     profondeurs sans réajuster. Une DCIM par couple (ζ, ζ′) serait hors de
     prix ; ajuster une fois à mi-hauteur et décaler la profondeur ne marche
     pas — mesuré, 3 à 60 % d'écart. La série des rebonds entre le plan et
     l'interface du haut se somme en forme **fermée** : deux amplitudes,
     quatre chemins géométriques, exact à 1,4·10⁻¹⁵ sur 49 couples ;
   - les **demi-RWG** du bas du fût. Une `RWGBasis` d'aire moins nulle : la
     fonction ne vit que sur son T+, et c'est **exact**, parce que son image
     dans le plan de masse complète la fonction et porte la charge opposée —
     ce que la fonction de Green stratifiée produit toute seule ;
   - le **dé-embarquement** par T₂T₁⁻¹, qui élimine les accès par similitude
     et lit γ sur les valeurs propres d'une matrice 2×2. Sans étalon d'aucune
     sorte, et avec son propre garde-fou : les deux valeurs propres doivent
     être inverses l'une de l'autre, ce qu'elles sont à 2·10⁻¹⁶.

   **Une cinquième pièce qui n'était pas au programme, et sans laquelle tout
   le reste est faux de 9 % :** la **hauteur électrique**. Le modèle 2,5D
   suppose le cuivre infiniment mince, mais le maillage lui donne une
   épaisseur géométrique. Un fût bâti du sommet du cuivre du plan au sommet du
   cuivre de la piste mesure h + 2t au lieu de h. On compte donc en
   **profondeur sous la piste**, dans la pile que `profil_spectral` établit
   déjà, et la question ne se pose plus.

   **Trois défauts trouvés en chemin, tous silencieux :** le test de
   coplanarité se faisait par une dénivelée en `z` — deux triangles d'une même
   facette de fût sont coplanaires et n'ont pas le même `z`, ils auraient été
   envoyés à Gauss seul, qui n'intègre pas un 1/R ; `_impedance_vue` rendait
   l'impédance du **vide** quand la pile devenait vide, même sur un
   court-circuit, ce qui arrive exactement sur l'anneau du bas du fût, posé
   sur le plan ; et `np.cross` coûtait 15 % du temps d'assemblage sur des
   vecteurs de trois nombres.

   **Ce qui est négligé, et il faut l'écrire :** la formulation C porte un
   terme correctif `G^C` qui couple courant vertical et courant horizontal par
   le potentiel **vecteur**. Sans lui, un via et une piste ne se parlent que
   par leurs **charges**. Ce qui manque est l'inductance du **coin**, là où le
   courant tourne — et c'est précisément ce que le dé-embarquement retire.

2. ~~Le second point de branchement n'est pas ajusté.~~ **RÉPARÉ.** Le
   diagnostic de 2026-08-29 était juste mais incomplet : il y avait **trois**
   fautes, toutes du même genre — deux bases confondues.

   - les images du 3ᵉ niveau étaient poussées dans la même liste que les deux
     premiers et resommées avec le `k` du **substrat**, alors qu'elles avaient
     été ajustées contre `exp(−j k_z^air d)`. `ComplexImage` porte maintenant
     son `k_onde`, et `_somme_ondes` somme chaque groupe avec le sien ;
   - **le reste à ajuster était pris dans la mauvaise base aussi** : on
     retranchait `somme(kz_air, images)`, c'est-à-dire les images des deux
     premiers niveaux évaluées en `k_z` de l'air. Il faut les évaluer avec
     **leur** `k_z`, celui du substrat aux mêmes `k_ρ` ;
   - **et le garde-fou de portée les rejetait toutes.** « Une image plus loin
     que la carte n'est pas physique » se mesure en épaisseurs de stratifié —
     74 mm sur du FR-4 de 0,37 mm. Or les images du branchement air
     représentent l'onde **latérale**, dont l'échelle est la longueur d'onde
     dans l'air : à 1 GHz, de 77 à 866 mm. **Zéro image posée**, et l'écart à
     10 mm inchangé au dixième de pour cent près.

   **Mesuré après réparation** : `banc_dcim` repasse de 21 à **25/25**,
   l'écart d'ε_eff de `banc_moteur` revient de 11,4 % à **0,49 %** — celui du
   chemin à deux niveaux, à quatre décimales —, l'invariant à contraste nul
   tient (0,148 % contre 0,149 %), et l'erreur de champ lointain est divisée
   par trois sur les trois noyaux : 9,59 % → 6,19 % à 10 mm, 40,8 % → 27,7 %
   à 30 mm sur le potentiel scalaire.

   **Il reste hors du chemin par défaut, et pour une autre raison qu'avant :
   son coût.** Le gain est en champ lointain, là où le noyau vaut six ordres
   de grandeur de moins qu'en champ proche — sans conséquence pour une matrice
   d'impédance, ce que l'essai d'ε_eff confirme au chiffre près. Le prix, lui,
   est immédiat : huit images de plus par noyau dans la boucle la plus chaude.
   On l'allume pour un calcul de **rayonnement**, pas pour un paramètre S.

   **Ce qu'il ne fait toujours pas** : il divise l'erreur lointaine par trois,
   il ne l'annule pas. L'onde latérale décroît en 1/ρ² quand les images
   décroissent en 1/ρ, et une somme finie d'exponentielles ne rend pas cette
   loi-là. La sortir en forme fermée, comme on a sorti le pôle d'onde de
   surface, serait le chantier suivant.

3. ~~Un seul plan source.~~ **FAIT, et ce n'était pas de la plomberie.**
   `profils_noyaux_multiples()` rendait un noyau croisé qui était, **au bit
   près**, celui de la couche du bas : elle construisait un « profil croisé »,
   puis rappelait `noyaux_green(stackup, freq, n, z_src=z_i)` sans le lui
   passer. Vérifiable en une ligne, et vérifié. Deux couches de signal étaient
   calculées comme une.

   **Et le profil croisé lui-même n'était pas la bonne idée** : il recollait
   le bas d'une couche et le haut de l'autre pour fabriquer un empilage qui
   n'existe pas. La fonction de Green entre deux plans n'est pas celle d'un
   autre empilage — c'est la **même** ligne de transmission, avec la source à
   z′ et l'observation à z. Ce qui change n'est pas le circuit, c'est
   l'endroit où on lit la tension :

       V_i(z, z′) = [Z_bas(z′) ∥ Z_haut(z′)] × T(z′ → z)

   `profil_croise` / `noyaux_croises` le calculent, et trois choses le
   vérifient, chacune contre quelque chose qui ne vient pas du module : la
   **réciprocité** V_i(z,z′) = V_i(z′,z) à 10⁻¹⁴ entre deux calculs qui n'ont
   rien en commun ; la **cohérence** avec `_impedance_vue` sur la pile
   complète à 4·10⁻¹⁶ ; et une **forme fermée** — deux plans de signal
   au-dessus d'un plan de masse dans l'air — qui redonne exactement les deux
   images +1 et −1 aux profondeurs h₂−h₁ et h₂+h₁.

   `mom_engine` route désormais chaque paire de triangles vers le noyau de sa
   paire de couches, par `noyaux.pour(couche_m, couche_n)`. `NoyauxGreen`
   porte la même méthode et se rend lui-même, de sorte qu'un empilage à une
   seule couche traverse **exactement** le même code qu'avant. Un plan de
   masse entre deux couches de signal rend un bloc **exactement nul**, et non
   un couplage approché : un plan est une terminaison, le champ ne le traverse
   pas.

4. ~~L'assemblage plafonne vers 300 fonctions de base.~~ **FAIT AUTREMENT, ET
   MIEUX.** Le profil désignait bien `_somme_ondes` — 10,2 s sur 20,4 —, mais
   pas pour la raison qu'on croyait. Le calcul était fait **image par image**,
   en une poignée d'opérations numpy sur des tableaux de 49 nombres : le coût
   était celui des **appels**, pas des flottants. Rangé en tableaux
   (points × images), l'assemblage passe de **20,4 s à 5,0 s** pour 269 RWG —
   un facteur quatre.

   **C'est exact**, et c'est ce qui change tout par rapport au plan initial.
   La piste retenue était de tabuler les noyaux sur une grille de ρ et
   d'interpoler dans un noyau numba ; elle aurait demandé sa propre étude
   d'erreur. Celle-ci n'en demande aucune : c'est la même somme, écrite
   autrement, et le banc le vérifie contre une somme naïve.

   **Et le profil est maintenant plat.** `_somme_ondes` n'y pèse plus que
   19 %, `points_polaires` 22 %, `terme_courant` 13 % : une tabulation
   approchée ne rapporterait au mieux qu'un facteur 1,2, pour le prix d'une
   approximation à valider. Ce n'est plus la bonne dépense. Le prochain
   facteur, s'il en faut un, est algorithmique — compression de la matrice,
   ACA ou multipôles —, pas arithmétique.

5. **Le plan de masse est supposé infini et parfait — HYPOTHÈSE FONDAMENTALE,
   et c'est une réserve écrite, pas un défaut à corriger.** Ce n'est pas un
   choix d'implémentation : un plan de masse n'est pas un conducteur du
   problème, c'est une **terminaison** du circuit de lignes de transmission.
   C'est cette hypothèse qui permet la fonction de Green spectrale analytique,
   donc qui rend le 2,5D possible du tout. La lever demande un solveur qui
   **maille** le plan — de l'ordre du million d'inconnues, là où le 2,5D en
   tient quelques centaines.

   Le détail est écrit dans le code, en tête de `indices_plans_masse`
   ([mom_solver/green_layered.py](mom_solver/green_layered.py)), et se résume
   ainsi :

   | Cas | Ce que le modèle fait |
   | --- | --- |
   | Plan étroit devant la hauteur | sous-estime l'inductance ; hors domaine sous ~3 h de large |
   | **Plan fendu sous la piste** | rend le résultat du plan **plein** — pas dégradé, faux |
   | Plan percé d'un champ de vias | correct tant que trous et pas restent petits devant h |
   | Conductivité finie | aucune perte de plan ; erreur systématique, toujours dans le même sens |
   | Deux plans, cavité entre eux | pas de modes de cavité ; ne dit rien du PDN |

**Résumé de l'état du moteur 2,5D**, tel que les trois bancs le mesurent —
**56 essais, tous passés au 2026-08-30** :

| | État | Ce que la mesure dit |
| --- | --- | --- |
| Green spectrale, deux noyaux séparés | ✅ | ε_eff à **0,49 %** de `ligne_mom` ; 26 % avec un noyau unique |
| DCIM à **deux** niveaux, pôle extrait | ✅ | images contre Sommerfeld : 0,04 % (G_A), 0,74 % (G_q) |
| DCIM à **trois** niveaux (branchement air) | ✅ | réparé : 25/25, erreur lointaine ÷3 ; hors chemin par défaut **pour son coût** |
| Port horizontal (coupe complète) | ✅ | \|Y₂₁/Y₁₁\| passe de 1,5·10⁻⁵ à 5,0·10⁻² |
| **Port vertical (via)** | ✅ | \|S₂₁\| de **0,0065 à 0,96** sur la même ligne ; G_A^zz à 3·10⁻¹⁶ de la forme fermée |
| **Dé-embarquement T₂T₁⁻¹** | ✅ | ε_eff à **0,93 %** de `ligne_mom` (5 GHz), 1,11 % (10 GHz) ; résidu de réciprocité 2·10⁻¹⁶ |
| **Multi-couches de signal** | ✅ | noyau croisé exact (réciprocité 10⁻¹⁴, forme fermée à 10⁻¹⁴) ; branché dans `mom_engine` |
| Plan de masse parfait et infini | ⚠️ | hypothèse du modèle, **réserve écrite** — non levable sans solveur 3D |
| Performance | ✅ | 269 RWG en **5,0 s** (était 20,4 s) ; exact, pas tabulé ; profil plat |
| Terme correctif `G^C` de la formulation C | ⚠️ | négligé : via et piste ne se parlent que par leurs charges ; retiré par le dé-embarquement |

**Le cas de non-régression a été fait.** Une ligne microruban sur 0,37 mm de
FR-4, deux longueurs (6 et 12 mm), même pas de maille, ports verticaux
identiques :

| | \|S₁₁\| | \|S₂₁\| | \|S₁₁\|²+\|S₂₁\|² |
| --- | --- | --- | --- |
| Ancien port, fente série, L = 6 mm | 0,9972 | **0,0744** | — |
| Port vertical, L = 6 mm | 0,2607 | **0,9642** | 0,9975 |
| Port vertical, L = 12 mm | 0,0959 | **0,9925** | 0,9943 |

et, dé-embarqué, ε_eff = 3,4893 contre 3,4573 pour `ligne_mom` à 5 GHz —
**0,93 %**. Le |S₁₁| de 0,26 sur la ligne courte n'est pas un défaut : c'est
le via, le trou percé et le coin, c'est-à-dire exactement ce que le
dé-embarquement retire.

Sur la carte du banc de chaîne, avec le maillage réel — irrégulier, pas la
grille du banc moteur —, le même changement donne |S₂₁| = 0,0065 → **0,9870**,
et la structure reste passive (0,9883, le FR-4 y ayant un tan δ de 0,022).

Le port par défaut de `main.py` est désormais `--port via` ; `--port fente`
reste disponible, parce qu'un port au **milieu** d'une structure — une coupure
de piste, un composant série — est bien une fente.

Les dépendances de maillage (`gmsh`, `meshio`, `pygmsh`) sont installées ; la
chaîne va du JSON au fichier Touchstone.


### Ce qu'il reste au panneau de simulation

Trois chantiers, chiffrés et indépendants. Les trois premiers ont été
spécifiés en détail ; le dernier attend le moteur.

#### 1. ~~Le masque de soudure dans le calcul~~ **FAIT (2026-08-28, corrigé le 2026-08-29)**

**~~*(le plus gros gain immédiat)*~~**

~~Une piste de couche extérieure est sous vernis. Le masque remplit l'écart~~
~~coplanaire — là où le champ est le plus dense — et fait **baisser Z₀ de 2 à~~
~~3 %**, soit environ 1,5 Ω sur une ligne à 50. La fiche le signale ; le calcul ne~~
~~le compte pas.~~

~~**Ne pas se contenter de l'ajouter à l'empilage** : `_couverture()`~~
~~([python/simulation_em.py](python/simulation_em.py)) accumule tout le non-cuivre~~
~~au-dessus sans regarder ce que c'est, `_entre_exterieur()` en fait une moyenne~~
~~d'εr appliquée à **toute** la région 0→h+c — y compris entre la piste et le~~
~~plan, où il n'y a pas de masque —, et `solve_line` jette toute couverture plus~~
~~mince que le cuivre (`c_diel < max(t, 1e-9)`), donc un masque de 25 µm sous~~
~~35 µm de cuivre disparaît **en silence**.~~

~~Ce qu'il faut :~~

~~- **une fonction de Green à trois régions** dans `ligne_mom.py` : stratifié εr₁~~
~~  de 0 à h, masque εr₂ de h à h+c, air au-dessus. Elle se dérive comme~~
~~  l'existante et **subsume les deux** :~~

~~    G = K / (ε₀ β (M + εr₁ K coth(βh)))~~
~~    K = ch(βc) + sh(βc)/εr₂       M = εr₂ sh(βc) + ch(βc)~~

~~  avec c = 0 qui redonne le microruban nu et εr₂ = εr₁ le couvert. L'asymptote~~
~~  devient ε₀(εr₁+εr₂)/2, ce qui unifie les deux extractions de milieu moyen~~
~~  aujourd'hui écrites en branches séparées dans `solve_line` ;~~
~~- **baisser le seuil** qui jette les couvertures minces ;~~
~~- `section_de_couche` ne doit plus **homogénéiser** : `_couverture()` rend~~
~~  (épaisseur, εr) et la couverture part telle quelle ;~~
~~- côté pages : `simStackupIpc` ajoute la couche masque en tête et en queue, lue~~
~~  du fichier IPC-2581 quand il la porte (`SOLDERMASK`, déjà reconnu par~~
~~  [visionneuse-ipc2581/js/02-modele.js](visionneuse-ipc2581/js/02-modele.js)),~~
~~  sinon saisissable avec repli 25 µm / εr 3,8 — et **la provenance le dit** ;~~
~~  côté éditeur PCB, `S.stack.maskT`/`maskEr` existent déjà, il n'y a qu'à les~~
~~  envoyer ;~~
~~- `simTopoNom` doit distinguer **« microruban sous masque »** de « microruban~~
~~  couvert », sinon une piste externe vernie et une piste interne portent le~~
~~  même mot ;~~
~~- **réserve à écrire dans le code** : le masque est modélisé en nappe uniforme,~~
~~  le vrai est conforme — plus mince sur le sommet du cuivre que dans l'écart.~~
~~  Second ordre devant les 2–3 %, mais ça doit être écrit.~~

**Ce qui est fait :**

- `green_spectral_micro_masque` dans `ligne_mom.py` : Green à trois régions
  (substrat/masque/air), avec les formules exactes ci-dessus. La **fonction**
  était juste dès le premier jet — les trois réductions le confirment à la
  précision machine ;
- `solve_line` prend `masque = {epaisseur, epsilon_r}` et route vers la Green
  appropriée ;
- `section_de_couche` détecte les couches extérieures et envoie le masque au
  solveur (défaut 25 µm / εr 3,8 si non déclaré) ;
- le segment de sortie porte `"masque"` avec son épaisseur et εr.

**Ce qui était FAUX, et qu'aucun cas ne mesurait (corrigé le 2026-08-29) :**

- la référence **à vide** gardait le masque à son εr — `g_vide` appelait la
  Green à trois régions avec `εr_substrat = 1` et `εr_masque = 3,8`. C₀
  gonflait, et **ε_eff BAISSAIT quand on vernissait la piste**, ce qui est
  l'inverse de la physique. Z₀ tombait de 7,8 % au lieu des 2 à 3 % que cette
  page annonçait ;
- le **milieu moyen** extrait était celui du substrat seul, alors que
  l'asymptote de la Green vaut ε₀(εr₁+εr₂)/2 — ce que cette page écrivait
  déjà, deux paragraphes plus haut ;
- un masque d'épaisseur nulle ne retombait sur aucune branche : `eps_moyen`,
  `g_diel` et `echelles` restaient indéfinis, et `solve_line` levait
  `NameError`.

Avec les trois corrections : 25 µm de vernis à εr 3,8 donnent **−2,53 %** sur
Z₀ et font monter ε_eff de 3,288 à 3,461. Un masque à εr = 1 redonne
exactement le microruban nu.

**Non-régression, écrite** : cinq cas dans
[python/test/banc-ligne-mom.py](python/test/banc-ligne-mom.py) — les trois
réductions exactes (c = 0, εr₂ = εr₁, c → grand), le chiffre attendu **et son
sens**, et le masque d'air qui ne fait rien. C'est le cas « sens de l'effet »
qui aurait attrapé le défaut : l'amplitude seule, à 7,8 %, restait plausible.

#### 2. ~~Voir et dire les discontinuités~~ **FAIT (2026-08-28)**

**~~*(peu cher, gros gain de lisibilité)*~~**

~~Le modèle ne change pas ; la fiche cesse d'être muette.~~

~~- **`_coudes()`** dans `simulation_em.py` : l'angle à chaque raccord, à partir~~
~~  des `start`/`end` déjà envoyés. Rendre le nombre de coudes, leur angle, et la~~
~~  **capacité d'excès estimée** en femtofarads avec ce qu'elle vaut en degrés de~~
~~  phase à f₀. Une note qui **chiffre** la négligeabilité vaut mieux qu'une note~~
~~  qui l'affirme ;~~
~~- **`_transitions()`** : détecter les changements de `layer` **le long de la~~
~~  chaîne** et les nommer (« Conductor-4 → Conductor-1 au tronçon 7 »). Ça~~
~~  remplace la note « N vias du net », qui compte le mauvais ensemble — les vias~~
~~  du net entier, y compris hors sélection ;~~
~~- **`_ruptures()`** gagne un contrôle de couche : deux tronçons au même XY sur~~
~~  deux couches différentes ne sont pas un raccord, c'est un via. Aujourd'hui il~~
~~  ne compare que les coordonnées, or les deux bouts d'un via sont au même XY :~~
~~  la chaîne est déclarée continue et le via passe inaperçu.~~

~~À savoir, et qui est déjà juste : la **longueur** envoyée est celle du cuivre~~
~~(`trkLen`, au prorata de la plage), pas la corde — un demi-tour n'est pas~~
~~raccourci, et le retard est bon. Seule la discontinuité manque.~~

**Ce qui est fait :**

- `_coudes(objets)` : calcule l'angle de chaque raccord, la capacité d'excès
  estimée (Gupta), et la phase en degrés à 5 GHz ;
- `_transitions(objets, couches)` : détecte les changements de couche, nomme les
  conductiveurs concernés ;
- `_ruptures(objets)` corrigée : compare maintenant XY ET couche. Deux tronçons
  au même XY sur couches différentes sont un via, pas une continuité ;
- le résultat porte `discontinuites = {coudes, transitions}`.

#### 3. ~~Modéliser les discontinuités~~ **FAIT (2026-08-28, corrigé le 2026-08-29)**

~~Insérer dans la cascade ABCD un élément localisé par discontinuité : shunt C~~
~~pour le coude (Gupta), π L-C pour le via (`L ≈ (µ₀h/2π)[ln(4h/d)+1]`, C de~~
~~pastille/antipastille). Demande que les pages **envoient les vias de la~~
~~chaîne** (perçage, pastille, portée) — la visionneuse les a, l'éditeur aussi.~~
~~Le format `cao-sim-em-1` gagne alors un tableau `transitions` et passe à `-2`.~~

**~~À 868 MHz ça ne déplacera aucun chiffre lisible~~** : ~~λ vaut 197 mm dans le~~
~~stratifié, un coude à 45° pèse quelques femtofarads.~~

**À 5 GHz, c'est dans le périmètre.** λ_g ≈ 40 mm sur FR-4, et les
discontinuités commencent à compter au-delà de 2-3 GHz. La note originale
ci-dessus a été écrite pour 868 MHz (λ ≈ 197 mm).

**Ce qui est fait :**

- `ligne_mom.py` : `elements_coude()` — le modèle **de Gupta**, celui de
  *Microstrip Lines and Slotlines*, qui rend le couple (L, C) —,
  `abcd_coude()` qui monte le **T complet**, `abcd_via()` en π exact,
  `inductance_via()` et `capacite_pastille()` ;
- `simulation_em.py` insère ces matrices dans la cascade pour chaque coude et
  chaque transition de couche détectés, et enrichit `discontinuites` avec
  **les mêmes valeurs** ;
- les formats passent de `cao-sim-em-1` à `cao-sim-em-2` et de
  `cao-sim-em-resultat-2` à `cao-sim-em-resultat-3`.

**Ce qui était faux, et qu'aucun cas ne mesurait (corrigé le 2026-08-29) :**

- **trois copies des mêmes formules, trois résultats.** Une dans `_coudes`
  pour l'affichage, une dans `solve_line` pour la cascade, une troisième dans
  `ligne_mom`. La fiche annonçait **21,28 fF** de capacité de coude là où la
  cascade en appliquait **0,394** — cinquante-quatre fois moins, dans la même
  réponse. Il n'en reste qu'une, et elle sert aux deux usages ;
- **la formule dite « de Gupta » n'en était pas.** Ni hauteur au plan — qui
  est le paramètre dominant —, ni angle : un coude à dix degrés pesait autant
  qu'un coude à angle droit, et un raccord parfaitement aligné aussi ;
- **la cascade appelait en millimètres des fonctions écrites en mètres.**
  Dans `inductance_via`, le rapport h/d est sans dimension : le logarithme
  survit à l'erreur, seul le préfacteur μ₀h la trahit — l'inductance sortait
  **mille fois** trop grande, et la capacité de pastille aussi (elle va comme
  d²/h). Un ordre de grandeur faux dans une fiche a l'air d'un ordre de
  grandeur ;
- la **fréquence** du modèle de coude était posée à 5 GHz en dur, quelle que
  soit la bande demandée. C'est la fréquence centrale de l'analyse ;
- `abcd_coude` ne posait qu'un **shunt C**, jetant l'inductance série — celle
  qui porte l'essentiel de l'excès au-delà de quelques gigahertz.

Sur un coude à 90° d'une piste de 0,38 mm sur 0,2 mm de FR-4, le modèle rend
maintenant **26,1 pH et 41,6 fF**, soit 0,78° de phase à 868 MHz — et c'est ce
chiffre-là, celui qui dit s'il faut s'en soucier, que la fiche affiche.

**Non-régression, écrite** : quatre cas dans
[python/test/banc-ligne-mom.py](python/test/banc-ligne-mom.py) — les formules
de Gupta reposées à la main, l'annulation à angle nul et la moitié à 45°,
`det(ABCD) = 1` sur les deux réseaux (ce que vaut tout réseau passif
réciproque, et rien d'autre ne l'attraperait), et l'ordre de grandeur du via.

~~**Ce qui reste** : **aucune page n'envoie les vias.**~~ **FAIT (2026-08-30),
et trois autres défauts avec — tous silencieux, tous dans les fonctions qui
LISENT la sélection avant le solveur.**

**1. Les deux pages envoient maintenant les cotes du via.**

- côté éditeur, `simViaAuRaccord()` / `simAccrocherVias()`
  ([editeur-pcb/js/19-simulation.js](editeur-pcb/js/19-simulation.js)) :
  à chaque changement de couche, on cherche le via de `S.vias` posé au raccord
  et dont la portée couvre le saut. Entre deux qui conviennent, **le plus
  court** — un traversant retenu à la place d'un enterré donnerait une
  inductance presque double, et personne ne le verrait ;
- côté visionneuse, `simViaAuRaccordIpc()`
  ([visionneuse-ipc2581/js/07-simulation.js](visionneuse-ipc2581/js/07-simulation.js)) :
  la source est plus pauvre — l'IPC-2581 porte des **trous** d'un côté et des
  **pastilles** de l'autre —, et on reprend les deux règles du chemin DC : un
  trou marqué NON métallisé ne joint rien, et à défaut de trou déclaré deux
  pastilles au même endroit valent un tube, perçage déduit ;
- le via s'accroche au tronçon d'**arrivée**, parce que c'est
  `objets[trans["troncon"]]` que le serveur relit, et que `troncon` est le rang
  du second.

**LA HAUTEUR N'EST PAS ENVOYÉE, ET C'EST VOULU.** L'éditeur la connaît —
`stackSpan()` est ce qui commande le foret de l'Excellon — mais le serveur la
recalcule depuis l'empilage qu'on lui envoie, par la même somme. Deux
définitions de la même longueur, c'est deux chiffres le jour où l'une dérive.
Les pages n'envoient donc que ce que le serveur ne peut **pas** savoir : le
perçage et la pastille.

**2. La hauteur du via se lisait dans l'empilage, et personne ne la lisait.**
`_hauteur_via()` la somme, bornes comprises. L'ancien repli — « 0,2 mm par
couche traversée » — comptait en indices d'**empilage**, qui alternent cuivre
et diélectrique : cela faisait 0,4 mm par couche de cuivre franchie, ce qui n'a
de rapport avec rien. Sur un empilage quatre couches ordinaire, une liaison
TOP → BOT donnait **1,200 mm** quand l'empilage en dit **1,340** : 12 %
d'erreur, que l'inductance emporte au premier ordre. Mesuré sur le cas du
banc : L passe de **0,905 nH à 1,041 nH**.

**3. Un changement de couche fabriquait un coude.** `_coudes()` ne regardait
pas les couches : deux tronçons colinéaires sur deux couches différentes
donnaient un coude de **0°, 0 pH, 0 fF**, affiché dans la fiche à côté du via.
Deux tronçons sur des couches différentes ne se raccordent pas dans un plan —
ce qui les joint est un via, et c'est le modèle de via qui s'applique. Un
alignement sur la même couche n'en est pas un non plus, et le seuil qui le dit
est celui de la **résolution des coordonnées** (0,1°, dix fois au-dessus du
bruit d'arrondi), pas un jugement sur ce qui mérite d'être modélisé : un coude
de 5° reste émis, avec son dix-huitième de la valeur à angle droit.

**4. Un via était compté comme une rupture.** `_ruptures()` exigeait **deux**
points de contact pour reconnaître un via, en commentant « les deux bouts du
via sont au même XY ». Non : un via joint la **fin** d'un tronçon au **début**
du suivant, ce qui fait **un** point commun. Toute liaison changeant de couche
était donc annoncée rompue, et le panneau prévenait « la sélection n'est pas un
parcours continu » devant un parcours parfaitement continu. Un avertissement
qui crie à tort finit par ne plus être lu, et c'est ce qui rend ce défaut plus
grave que son ampleur : le jour où la sélection est vraiment rompue, personne
ne le voit.

**5. Et la fiche ne montrait rien de tout cela.** `res.discontinuites`
arrivait dans le résultat et n'était lu **nulle part** : le serveur cascadait
les coudes et les vias — la courbe S les portait — sans que rien ne le dise.
Devant un |S₂₁| qui plonge, personne ne pouvait savoir si un via y était
compté. `simDiscontinuites()`
([commun/simulation-em.js](commun/simulation-em.js)) affiche maintenant, par
discontinuité : son rang, son type, les couches franchies, les cotes du via,
son L, son C, et **la phase qu'il vaut à la fréquence centrale** — c'est ce
dernier chiffre qui dit s'il faut s'en soucier, et une phase sous le dixième de
degré est marquée comme telle. La provenance voyage **cote par cote** :
`hauteur_source`, `percage_source`, `pastille_source` valent « page »,
« empilage » ou « repli », de sorte que la fiche puisse dire que la hauteur est
exacte pendant que le perçage ne l'est pas.

**Non-régression, écrite** : cinq cas dans
[python/test/banc-ligne-mom.py](python/test/banc-ligne-mom.py) — la hauteur
contre l'épaisseur de carte connue d'avance, le via borgne, l'indifférence au
sens, le coude qui disparaît sur un changement de couche et survit à 5°, le via
qui n'est plus une rupture pendant qu'une vraie rupture le reste, la provenance
de chaque cote, et le fait qu'un perçage plus fin donne **plus** d'inductance ;
cinq dans [editeur-pcb/test/harness.js](editeur-pcb/test/harness.js) — le via
accroché au bon tronçon, l'absence de via inventé, le via borgne qui ne couvre
pas le saut, le plus court entre deux qui conviennent, et le via trop loin ;
quatre autres pour l'affichage — le décompte, le chiffre supposé dit comme tel,
le silence expliqué, la phase négligeable marquée ; et quatre dans
[visionneuse-ipc2581/test/harness-sim.js](visionneuse-ipc2581/test/harness-sim.js)
— le trou déclaré, les deux pastilles qui valent un tube, le trou nu qui ne
joint rien, et le raccord sans rien.



### Le chemin de retour du courant — FAIT le 2026-08-30

**CE QUI ÉTAIT FAUX, ET DANS QUEL SENS.** Un via était chiffré par une
inductance **partielle propre** : celle d'un conducteur seul, sans dire par où
le courant revient. Or un courant revient toujours, et c'est la **surface de
boucle** qu'il enferme qui porte l'inductance. Deux cartes identiques à ceci
près que l'une a son via de masse à 0,4 mm et l'autre à 3 mm rendaient donc le
**même** |S₁₁| — alors qu'elles diffèrent d'un facteur deux, et que le
placement de ce via est justement la décision que l'outil devrait éclairer.

**1. L'inductance est celle de la boucle, calculée exactement.**
`inductance_boucle_vias` ([python/ligne_mom.py](python/ligne_mom.py)) résout la
matrice d'inductance partielle du via de signal et de ses retours.

- **Grover exact, pas l'approximation des manuels.** `L = (µ₀h/π)·ln(2s/d)`
  suppose h ≫ s ; sur une carte h vaut 1,5 mm et s 0,6, le rapport vaut 2,6, et
  l'approximation **surestime de 21 %** — de 56 % à 3 mm. La forme exacte de
  Grover vaut à tout rapport ; mesurée contre l'approximation à h/s = 257, elle
  la rejoint à **0,2 %**.
- **Le RGM est le rayon, non 0,7788 r** : un via au-dessus de quelques
  mégahertz est en régime de peau, tout son courant est en surface.
- **La répartition du courant se RÉSOUT, elle ne se postule pas.** Le signal
  porte +1 A, les retours se partagent −1 A en proportions inconnues ; à haute
  fréquence le courant minimise l'énergie magnétique, donc l'inductance
  elle-même. C'est un système linéaire sous contrainte Σaₖ = 1, résolu par
  multiplicateur de Lagrange. Conséquences mesurées : ne garder que le via le
  plus proche **surestime de 31 %** sur le cas à trois vias ; et trois vias
  serrés ne divisent **pas** l'inductance par trois — leur mutuelle les en
  empêche, on plafonne vers un facteur deux quel que soit leur nombre.
- **Le courant doit se refermer, et c'est une condition.** Un via de masse
  borgne qui ne couvre que la moitié de la hauteur ne referme rien. Nourrir la
  formule avec lui rend un nombre **plus petit de 18 %** que la vérité — le
  pire défaut possible, puisqu'il flatte. La fonction lève plutôt que de le
  rendre, et l'appelant écarte le via en disant pourquoi.

**2. Le plan de référence qui change est le défaut grave, et il est nommé.**
Sur un empilage TOP/GND/PWR/BOT, une piste sur TOP se réfère à GND et la même
piste sur BOT se réfère à PWR. Le courant de retour doit changer de plan — et
**aucun via de masse ne sait faire cela** : il joindrait de la masse à de la
masse. Le retour passe par la cavité entre plans et ses condensateurs de
découplage, absents de ce modèle. Coût mesuré : jusqu'à **7 dB de |S₁₁| à
3 GHz**, toujours en flattant.

`_analyse_retour` ([python/simulation_em.py](python/simulation_em.py)) sépare
**deux questions qui n'en font pas une** : « la référence change-t-elle ? » est
une propriété de l'empilage ; « un via la rejoint-il ? » est une propriété du
routage. Une référence qui change et qu'un via rejoint est le cas ordinaire —
l'alerte ne sort pas. Les confondre sous un seul drapeau ferait crier sur le
cas ordinaire, et on cesserait de lire l'avertissement qui compte.

**3. La capacité comptait les deux pastilles, à la mauvaise distance.** Elles
étaient prises à la **hauteur du via** — 1,34 mm — alors qu'une pastille voit
le plan qui lui fait face à 0,2 mm : facteur sept, dans le sens qui rassure. Et
les **antipads**, un par plan traversé, ne l'étaient pas du tout. Mesuré sur le
via traversant du banc : de **4,70 fF à 86,8 fF** pastilles internes retirées,
**117,1 fF** conservées. L'impédance caractéristique du via tombe de 525 à
96 Ω — invisible à 200 MHz, dominante au-delà de deux gigahertz.

La forme logarithmique est gardée : la formule industrielle
`C = 1,41·εr·T·D1/(D2−D1)` est le coaxial où `ln(D2/D1)` a été remplacé par
`(D2−D1)/D1`, et elle **sous-estime d'un facteur 1,9** sur un antipad de 0,8 mm
autour d'un barreau de 0,25.

**4. Un défaut de cascade trouvé au passage, et il datait du lot 3b.** Les
discontinuités étaient posées **après** la ligne du tronçon d'arrivée, alors
qu'elles portent son rang parce qu'elles le **précèdent**. Chacune était donc
décalée d'un tronçon vers la sortie, et la dernière sortait du parcours : sur
une liaison à trois tronçons et deux vias — le cas des captures — le second via
tombait **au-delà du port 2**. Personne ne l'avait vu parce qu'il faut trois
tronçons pour que cela se voie : sur deux tronçons de même impédance les deux
ordres donnent exactement le même |S₁₁| (une ligne uniforme et un réseau en π
sont tous deux symétriques). Mesuré à trois tronçons : 0,34 dB et 2,7° à 3 GHz.

**5. Le chevelu — la question « faut-il le rapprocher ? » a une réponse.**
Cliquer un via de signal, panneau ouvert sur l'impédance, trace un lien vers
chaque via de masse à portée (`simRetourTrace`,
[editeur-pcb/js/19-simulation.js](editeur-pcb/js/19-simulation.js)) :
l'inductance de boucle au pied du via, **l'épaisseur du trait dit la part du
courant** que ce retour porte, et un trait pointillé rouge porte la raison pour
laquelle un voisin ne compte pas. Un via de **masse** sélectionné n'ouvre rien :
il n'a pas de boucle à lui, il *est* le retour de quelqu'un d'autre.

**LA PHYSIQUE EST DUPLIQUÉE EN JS, ET C'EST TENU.** Un chevelu qui demande un
aller-retour au serveur à chaque mouvement de souris n'est pas un chevelu. Le
banc de l'éditeur exige que `simBoucleVias` rende, au dixième de picohenry,
**exactement** ce que rend `ligne_mom.inductance_boucle_vias` sur la même
géométrie — les valeurs attendues viennent du banc Python. Le jour où l'une des
deux dérive, l'essai tombe.

**6. Sans retour identifié, le chiffre est annoncé comme un PLANCHER.** Il n'y
a alors pas d'inductance de boucle à rendre : le courant revient quand même,
mais par un chemin inconnu — le cuivre des plans, plus loin. On rend la self
partielle, qui est la valeur qu'aurait la boucle si le retour était collé au
via : une **borne inférieure**, écrite « L ≥ » et non « L = ». `inductance_via`
— la règle de pouce des manuels, `(µ₀h/2π)(ln(4h/d)+1)` — **sort du chemin de
calcul** : ce n'est ni une self partielle ni une boucle, c'est la self de
Grover où le −1 a été changé en +1, et l'écart est un retour implicite jamais
dit qui vaut près du double.

**Ce que les deux pages envoient désormais** : la **position** du via — sans
elle aucun écart n'est mesurable —, le diamètre d'**antipad** (côté éditeur,
`v.d + 2·clrK(...)`, exactement ce qui creuse le Gerber), et la liste des vias
de masse à 3 mm. Côté visionneuse, la **portée est supposée traversante** et le
dit : l'IPC-2581 déclare la position, le diamètre et le net d'un perçage, mais
pas ses couches.

~~**Ce qui reste hors modèle**~~ **FAIT le 2026-08-30** : le moignon et la
cavité sont désormais cascadés — voir « Le moignon et la cavité » plus bas. Ce
qui reste vraiment hors modèle : les résonances propres de la paire de plans,
et le couplage entre deux vias voisins.

**Non-régression, écrite** : onze cas dans
[python/test/banc-ligne-mom.py](python/test/banc-ligne-mom.py) — la référence
qui change nommée, la même carte à deux plans de masse qui se referme, la
monotonie et l'ampleur contre l'écartement, trois vias qui comptent pour trois,
le retour borgne écarté, le via d'un autre net écarté, la page muette et
l'empilage sans net de plan distingués, l'antipad qui entre dans la capacité,
la fiche qui porte le même via que la courbe, et la discontinuité posée entre
les deux tronçons ; treize dans
[editeur-pcb/test/harness.js](editeur-pcb/test/harness.js) — dont la physique
JS épinglée sur celle de Python ; cinq dans
[visionneuse-ipc2581/test/harness-sim.js](visionneuse-ipc2581/test/harness-sim.js).

**Un défaut trouvé hors sujet et corrigé** : la liste `EXPOSE` du banc de
l'éditeur nommait encore `simUniteBande`, que le panneau appelle désormais
`simUniteBande1`/`simUniteBande2`. Ce n'était pas un cas en échec — c'était le
**chargement du banc entier** qui levait.



### Le moignon et la cavité — FAIT le 2026-08-30

Les deux dernières choses que la fiche nommait comme absentes. Elles ne se
ressemblent pas : l'une est un bout de conducteur **en trop**, l'autre un
chemin de retour qui **manque**.

**1. Le moignon.** Un via percé de part en part mais utilisé jusqu'à une couche
interne laisse pendre le reste du perçage. Ce bout n'est raccordé à rien par le
bas : c'est un **tronçon de ligne en circuit ouvert, en dérivation** sur le
signal. `admittance_moignon` ([python/ligne_mom.py](python/ligne_mom.py)) le
traite comme le coax barreau/antipad qu'il est — `Z₀ = (60/√εr)·ln(D/d)`, soit
33,7 Ω sur un perçage de 0,25 dans un antipad de 0,80.

- **Sous sa résonance, c'est une capacité, et pas une petite.** 1 mm de moignon
  vaut **206 fF** — deux fois et demie la capacité du via entier. Elle est
  constante de 200 MHz à 3 GHz, comme doit l'être un stub court.
- **À sa résonance quart d'onde, il court-circuite la liaison.** 1 mm résonne à
  **36,1 GHz**, 1,5 mm à 24,1. Un canal à 25 Gbit/s travaille jusqu'au
  troisième harmonique de 12,5 GHz : le moignon est le défaut qui tue un lien
  multi-gigabit, et rien sur le dessin ne le montre — le via a l'air normal,
  c'est ce qu'on n'utilise **pas** de son perçage qui nuit.
- **La constante de propagation est complexe, et ce n'est pas un détail.** Avec
  un β purement imaginaire, `Y = jY₀tan(βL)` **diverge** au quart d'onde et la
  cascade rend n'importe quoi. Ce n'est pas une difficulté numérique à plafonner
  arbitrairement : c'est la **perte** qui manque. Un moignon réel a un facteur
  de qualité fini, de l'ordre de 1/tan δ. En mettant la perte dans γ, `tanh` ne
  diverge jamais et le creux a la bonne profondeur — mesuré : Y culmine à
  64 fois Y₀, soit 0,53 Ω, ce qui efface bien la liaison.
- **La longueur se soustrait, elle ne se devine pas** : percé moins emprunté,
  aux bornes du **perçage** et non aux dessus de couche. Sans la portée percée
  — que la page doit envoyer —, un via traversant et un via enterré bien ajusté
  ont exactement la même apparence : on rend « inconnu » plutôt que le cas le
  plus flatteur.

**2. La cavité — ce qui était un conseil devient un chiffre.** Quand la
référence change, le retour doit passer d'un plan à l'autre, et il ne peut le
faire que par un **condensateur de découplage**. La boucle qu'il décrit —
descendre par le via, courir dans le plan du haut jusqu'au condensateur, le
traverser, revenir par le plan du bas — est une boucle de paire de plans, et
`inductance_cavite` la calcule : `L = (µ₀h/2π)·ln(s/r)`.

Mesuré sur 1 mm entre plans : **0,42 nH** pour un découplage à 1 mm, **0,55** à
2 mm, **0,74** à 5 mm — plus son inductance de montage. Changer de référence
**double** l'inductance du via, même quand on découple bien. La fiche le dit
maintenant en nanohenrys au lieu de dire « ne faites pas cela », ce qui est une
tout autre conversation : on peut décider.

**Aucun pont trouvé, aucun chiffre inventé.** On pourrait prendre le bord de la
carte comme distance ; ce nombre serait faux et aurait l'air d'une mesure.

### Quatre défauts trouvés en branchant, et le premier est le pire

**a. La fiche affirmait une absence qu'elle n'avait pas constatée.** Sur une
carte réelle portant un via de masse au bon endroit, le panneau annonçait
« *aucun via de masse ne joint les deux* » — un énoncé **sur la carte**, sans la
moindre preuve, parce que la page n'avait rien envoyé. Deux causes distinctes,
corrigées séparément :

- **Deux plans de NOMS différents ne sont pas deux plans de NETS différents.**
  Sur une carte quatre couches, une piste sur TOP se réfère au plan interne du
  haut et la même piste sur BOT à celui du bas : les noms diffèrent
  **toujours**. Si les deux sont de la masse, un via de masse referme la boucle
  et c'est le cas ordinaire ; s'ils sont GND et PWR, rien ne peut la refermer.
  La première version ne regardait que les noms, et criait donc au défaut grave
  sur **toute carte quatre couches dont l'empilage ne nomme pas ses nets**.
  Il y a désormais **trois états** — `plan_change`, `nets_differents`
  vrai/faux/**inconnu** — et le défaut grave exige la certitude. Le doute a sa
  propre phrase et sa propre couleur.
- **Une déduction et une observation ne se disent pas pareil.** « Aucun via de
  masse ne peut joindre GND à PWR » **découle des nets** et reste vraie qu'on
  ait cherché ou non. « Aucun découplage n'est à côté » demande d'avoir
  regardé. La première version les disait d'un seul souffle.

**b. Les pages n'envoyaient rien tant que le via n'était pas reconnu** — ni sa
position, ni les vias de masse voisins. Or le changement de couche existe
indépendamment du perçage qu'on sait nommer : ses deux tronçons se raccordent
quelque part, et ce quelque part suffit à mesurer les écarts. Les cotes
manquantes ne touchent que le perçage et la pastille, qui ont leurs replis
annoncés. C'est ce qui privait le serveur de toute donnée sur la carte réelle.

**c. Un seul trou non métallisé rendait tout le net aveugle.**
`simViaAuRaccordIpc` testait le placage **avant** la position : « ce trou-ci
n'est pas métallisé » sortait de la fonction pour de bon, donc un trou de
fixation ou un point de test quelque part sur le net empêchait de reconnaître
le via à l'autre bout de la piste, et toute la fiche tombait sur des replis.

**d. La visionneuse connaissait le net de ses plans et ne l'envoyait pas.**
`simNetDuPlanIpc` le lit désormais — le net qui couvre le plus de cuivre plein
sur la couche — et l'empilage le porte. C'est ce qui lève le doute du point (a)
sur une carte IPC-2581.

**Deux avertissements permanents devenus faux, corrigés.** Celui du modèle de
ligne annonçait comme absents « les coudes, les moignons, les transitions de
via », alors que les trois sont cascadés ; celui de la visionneuse comptait
tous les perçages du net comme non modélisés. Un avertissement qui se trompe en
se **noircissant** est presque aussi nuisible qu'un qui flatte : on cesse de le
lire, et il emporte avec lui ceux qui comptent.

**Non-régression, écrite** : neuf cas dans
[python/test/banc-ligne-mom.py](python/test/banc-ligne-mom.py) — le moignon qui
se soustrait exactement, sa résonance refaite à la main, le court-circuit borné
et fini, la portée inconnue qui ne vaut pas moignon nul, la cavité chiffrée et
son coût qui croît avec la distance, la cavité qui **ne** se traverse **pas**
entre deux masses, les trois états du verdict, le doute rendu, et la déduction
séparée de l'observation ; huit dans
[editeur-pcb/test/harness.js](editeur-pcb/test/harness.js) — dont le chevelu à
trois états, les ponts filtrés par le nombre de bornes, et l'affichage des
trois nouveautés ; quatre dans
[visionneuse-ipc2581/test/harness-sim.js](visionneuse-ipc2581/test/harness-sim.js)
— dont le trou nu ailleurs sur le net qui n'aveugle plus rien, et l'empilage
qui porte le net de ses plans.



### La traversée entre plans, refaite d'après Bogatin — 2026-08-30

**Source** : Eric Bogatin, *Signal and Power Integrity — Simplified*, 2ᵉ éd.,
Prentice Hall 2010. Section **7.14** « When Return Paths Switch Reference
Planes » (p. 244-247) et section **13.14** « Approximating Loop Inductance »
(p. 653-659, équations 13-31 et 13-35). Le PDF est à la racine du dépôt.

Deux erreurs, qui vont dans des sens opposés.

**1. « Il faut un pont » — non, et c'était l'erreur de fond.** Le modèle
refusait de chiffrer la traversée quand aucun condensateur de découplage ne
joignait les deux plans. Or le courant de retour ne l'attend pas : il passe par
**la paire de plans elle-même**, en courant de déplacement à travers sa
capacité. Bogatin le montre en 7.14 — le conducteur du milieu, **même
flottant**, porte des courants de Foucault induits qui referment la boucle, et
le pilote voit simplement deux lignes en série, `Z(1-2) + Z(2-3)`. L'impédance
d'une paire de plans (éq. 7-18, `Z₀ = (377/√εr)·h/w`) vaut **3,6 Ω** pour 1 mm
d'écart sur 50 mm de large, **0,36 Ω** pour 0,1 mm.

Refuser de chiffrer faute de condensateur, c'était déclarer impossible ce qui se
produit sur toute carte multicouche.

**2. L'étalement était trois à quatre fois trop petit.** On employait
l'équation **13-31**, qui décrit un via central rejoignant un **anneau**
extérieur lointain — `L = 5,1·h[mil]·ln(b/a)` pH, soit exactement `µ₀/2π` en SI.
Le cas d'un via de signal et d'un condensateur est celui de **deux contacts
ponctuels** : le courant s'étale au départ **et** se resserre à l'arrivée, dans
les **deux** plans. C'est l'équation **13-35**, `L = 21·h[mil]·ln(B/D)` pH — un
coefficient **4,1 fois** plus grand. Mesuré sur le cas du banc : **1,72 nH au
lieu de 0,55**.

Le livre dit lui-même qu'il n'y a pas de forme fermée pour cette géométrie
(« There are no exact analytical equations that describe this loop spreading
inductance ») : le coefficient est ajusté, et il est nommé comme tel plutôt que
maquillé en dérivation.

**Ce que le modèle fait maintenant.** La traversée est une **impédance**, pas
une inductance, et elle se recalcule à chaque fréquence :

```
Z(ω) = [ jωL_étalement_cavité + 1/(jωC_plans) ]  ∥  [ jωL_pont + ESR + 1/(jωC_pont) ]
```

Les deux branches en parallèle **résonnent** — c'est la *parallel resonant
frequency* du chapitre 13, où la capacité des plans et l'inductance du
découplage s'annulent et où l'impédance de la traversée **culmine**. Une
inductance équivalente figée au point central manquerait exactement ce qu'on
veut voir. Ce qui reste hors de portée, et le livre le dit aussi : les
résonances propres de la cavité, pour lesquelles il faut un solveur 3D.

**Trois cas, et ils ne se confondent pas :**

| | |
|---|---|
| **un pont mesuré** | étalement (13-35) + montage + capacité du condensateur, en parallèle avec la capacité des plans |
| **cherché, rien vu** | pont supposé **au rayon de recherche** — un **minorant**, marqué |
| **la page ne cherche pas** | seul l'étalement est compté, et la traversée est dite **sous-estimée** |

**Pourquoi pas la cavité seule dans le deuxième cas.** Elle donne **1,7 kΩ à
1 MHz** sur une paire de plans de 95 pF. C'est exact pour une carte qui n'aurait
aucun découplage nulle part, et absurde pour une carte réelle dont le découplage
est simplement plus loin que le rayon cherché.

**Le conseil que la fiche porte n'est pas celui qu'on attend.** L'étalement
croît **linéairement** avec l'écart entre plans et seulement en **logarithme**
avec la distance au condensateur. Rapprocher le découplage de moitié ne gagne
que `ln 2` ; amincir le diélectrique entre plans de moitié gagne la moitié.

**Ce que les pages envoient en plus** : l'aire des deux plans en regard (côté
éditeur, l'aire de la carte — une **majoration**, donc une capacité surestimée,
donc une traversée qui paraît meilleure qu'elle n'est en basse fréquence, et
c'est dit), leur εr, et la **valeur** du condensateur lue dans le champ
« valeur » de l'empreinte. Sans valeur lisible, le serveur suppose 100 nF et
l'annonce : en dessous de sa résonance propre, c'est la capacité qui fixe
l'impédance de la branche, et l'omettre ferait passer le pont pour un
court-circuit parfait.

**Non-régression** : deux cas dans
[python/test/banc-ligne-mom.py](python/test/banc-ligne-mom.py) refont les
**exemples chiffrés du livre** — l'équation 13-31 rend bien les 270 pH annoncés
p. 658, le coefficient de 13-35 vaut bien 4,1 fois celui de 13-31, et
l'équation 7-18 est linéaire en l'écartement — et un troisième vérifie que
l'impédance de traversée ne diverge ni en bas ni en haut de bande et qu'un
découplage l'améliore partout.

### Les arcs : une piste courbe est une piste — 2026-08-30

**La cause réelle du parcours en morceaux**, trouvée après le chaînage et plus
grave que lui. L'IPC-2581 range les segments droits et les arcs dans **deux
collections distinctes**. `simZPistes` ne lisait que la première.

Sur une carte RF — où l'on courbe justement pour ne pas réfléchir — la liaison
partait donc au serveur en morceaux droits **séparés par les arcs qui les
joignent**. Tout ce qui suppose un parcours en tombait : les raccords annoncés
manquants, les angles pris entre des tronçons qui ne se suivent pas (un coude
de **168°**, c'est-à-dire un demi-tour, sur une piste presque droite), et
surtout **aucun via accroché** — un via se pose là où la fin d'un tronçon
rejoint le début du suivant, et cela n'arrivait jamais. Ni perçage, ni portée,
ni vias de masse voisins ne partaient, et le chevelu n'avait rien à dessiner.

**Et le chemin DC croyait les traiter.** `simDCPolysArcIpc` lisait `a.p`, un
tableau de sommets — la forme d'une **piste**. Un arc porte `s`, `e`, `m`, `h`.
Le test `pl.length>=4` échouait donc toujours, la fonction retombait sur son
repli « ce n'est pas un arc » et rendait une piste **sans sommets**. Les deux
moitiés de l'outil ne voyaient pas la même carte, et aucune ne le disait.

Le pliage est maintenant écrit **une fois**, dans `simArcEnPolyligne`, et il
passe par **`mdlArc`** — la seule définition de la géométrie d'un arc dans cet
outil, celle du dessin, donc celle qui ne peut pas se désynchroniser de ce
qu'on voit à l'écran. Les deux bouts de la polyligne sont **replacés sur ceux
du fichier** : le rayon se déduit du point de départ, le dernier point calculé
peut retomber à un micron du bout déclaré, et un micron suffit à casser un
chaînage.

**La finesse se prend sur l'ANGLE, pas sur la largeur de piste.** Le critère
« une facette par largeur » vient du tracé de contour, où la facette est plus
fine que le trait qu'elle dessine. Pour une **longueur** il est trop grossier :
un quart de cercle y tombait à quatre facettes, et une corde est plus courte
qu'un arc — **0,64 % de moins**, que le retard de propagation emporte tel quel.
Un pas de deux degrés ramène l'écart à cinq millionièmes.

**Reste à faire, et c'est la même famille** : `ltNet` — la fiche de ligne du
panneau « Sélection » — ne compte toujours pas les arcs dans ses totaux. Elle
l'**avoue** (« leur longueur n'entre nulle part ici »), ce qui la rend
honnête mais fausse, et désormais incohérente avec la simulation qui, elle, les
compte.

**Non-régression** : deux cas — le pliage et ses bouts replacés, et la
topologie de la carte livrée (droite, arc, changement de couche, droite) où
l'on vérifie l'ordre du parcours, la longueur de l'arc contre π/2, et
l'accrochage du via avec ses vias de masse.

### La topologie, le pad inventé, et « Current Return Path » — 2026-08-30 (lot 2)

Trois chantiers, dont deux qui étaient au « ce qui reste à faire » de ce
fichier depuis le lot précédent.

**1. La topologie de la sélection, et le refus franc.** Le serveur comptait des
RUPTURES — un décrochage entre deux tronçons consécutifs — et rendait les
paramètres S dans tous les cas, assortis d'une phrase disant qu'ils ne
voulaient rien dire. Deux défauts en un.

Le premier : un compteur unique confondait trois choses. « La sélection est un
parcours mais mal rangée » se corrige en la rangeant ; « ce net se ramifie en
T » ne se corrige pas du tout — il n'a pas deux accès mais trois, et aucun
ordre n'existe ; « la sélection est en morceaux » est encore autre chose.
Répondre la même phrase aux trois, c'est demander à l'un l'impossible et taire
à l'autre ce qu'il suffirait de faire. `_topologie()` rend maintenant un genre
— `chaine`, `desordre`, `ramifiee`, `eparse`, `boucle`, `sans_coordonnees` — et
la phrase suit le genre.

Le second, et c'est le pire : la courbe s'affichait quand même. Elle a l'air
d'un résultat, on l'exporte en `.s2p`, **et le `.s2p` ne porte pas
l'avertissement**. Un chiffre faux qui voyage est pire qu'un chiffre absent.
Les paramètres S et le Touchstone ne sortent plus quand la sélection n'est pas
une chaîne ; le panneau écrit à la place de la courbe ce qui a été refusé, où
sont les points de dérivation, et ce qui reste valable — les impédances par
tronçon et la carte de chaleur, qui ne dépendent d'aucun ordre. Le retard et
les pertes cumulés restent affichés mais **barrés** : sur un T, la somme des
longueurs n'est le trajet de personne.

**Et l'éditeur PCB range enfin sa sélection.** Il parcourait `S.tracks` dans
l'ordre du DOCUMENT, c'est-à-dire de création : juste par accident tant qu'on
route une liaison d'un bout à l'autre en une fois, faux dès qu'on retouche. La
visionneuse chaînait déjà (`simChainePistes`), et c'est ce qui a caché le
défaut ici — là-bas le désordre est visible, ici il ne l'est pas. Au passage :
**inverser une piste échange sa gauche et sa droite**, donc `gap_left` et
`gap_right` doivent suivre. Ça ne change pas Z₀, la géométrie étant symétrique,
mais ça faisait mentir la fiche sur quel bord longe quoi.

**2. La pastille que personne n'avait lue.** `ipc2581_parser.py` fabrique la
pastille d'un via à « perçage + 0,3 mm » quand aucun `<PadstackDef>` ne porte
son nom — soit un anneau de 0,15 mm posé par convention. Sur la carte
mesurée : perçage ⌀0,25, « anneau 0,15 », pastille ⌀0,55. Ces trois chiffres
n'en font qu'un, et **aucun ne vient du fichier**. La fiche du perçage
l'affichait avec l'aplomb d'une cote déclarée par le fabricant ; le contrôle
d'isolation mesure ses distances contre elle ; la simulation la fait entrer
dans la capacité du via.

La pastille devinée est désormais marquée (`pad_supposee`), l'aveu voyage
jusqu'à la page (`pad_sup`, `a_sup`), et la fiche écrit « supposé » à côté du
chiffre.

**Et la page fabriquait la sienne.** Faute de pastille connue, `simViasIpc`
envoyait `perçage × 2,5` — très exactement le repli que le serveur applique
lui-même. Le chiffre était donc le même ; ce qui changeait, c'est qu'il
arrivait DÉCLARÉ PAR LA PAGE. Or `_cotes_via` écrit la provenance selon que
`pad_diameter` est présent ou absent : `pastille_source` passait de « repli » à
« page » et `cotes_supposees` à faux. Le résultat ne bougeait pas d'un micron,
**la fiche cessait de prévenir**. Le serveur connaît maintenant trois
provenances — `page`, `supposee`, `repli` — et la page ne fabrique plus rien.

Reste ouvert, et non tranché : les **0,275 mm de cuivre absent** entre le bout
de piste et le bord de l'anneau. Les bouts de piste convergent à 0,5500 mm du
centre du perçage, soit exactement le diamètre de la pastille inventée. Si la
vraie pastille faisait ⌀1,10, les pistes s'arrêteraient pile à son bord et il
n'y aurait pas de trou. C'est un indice sérieux que la pastille réelle est plus
grande que la devinette — mais tant que le fichier ne déclare pas son padstack,
on ne peut pas le savoir. **La simulation marche dans les deux cas** ; l'affichage
et le contrôle d'isolation, eux, sont concernés.

**3. « Current Return Path » a sa propre section.** Le chemin de retour vivait
en pièces détachées sous l'onglet « Impédance » : une colonne du tableau des
discontinuités, quelques notes en bas de fiche, un chevelu sur la carte. Trois
endroits, aucun qui réponde à la question qu'on se pose — « par où revient le
courant de ce via, et est-ce que ça se ferme ». On lisait une impédance et on
trouvait, en marge, de quoi s'inquiéter d'autre chose.

Ce ne sont pas les mêmes questions. L'impédance caractéristique est une
propriété de la SECTION DROITE ; le chemin de retour, une propriété de la
LIAISON VERTICALE. **Une piste parfaitement à 50 Ω peut avoir un retour
catastrophique**, et c'est précisément le cas qu'on ne voyait pas.

La sélection se fait comme pour l'impédance, le calcul est le même — le serveur
rend les deux dans une seule réponse, changer d'onglet ne relance rien. Ce qui
change est ce qu'on montre : un via par ligne, sa position, ses couches, ses
vias de masse un par un avec distance et part du courant, l'inductance de
boucle et sa source. Le chevelu se dessine sous cet onglet et **plus sous
l'impédance**.

La coupure a demandé de séparer les notes en deux : le MOIGNON et l'ANTIPAD
sont des cotes du via — elles chargent la liaison, elles entrent dans la
cascade, elles expliquent la capacité et la phase du tableau des
discontinuités — et restent donc sous l'impédance (`simViaNotes`). Le reste
part avec le retour.

**Un trou trouvé en le vérifiant** : la fiche d'un via hors parcours recopiait
`cotes` — où chaque champ porte sa provenance — mais pas le booléen
`cotes_supposees`, sur lequel le panneau filtre. Les provenances partaient
complètes, et personne ne les lisait.

**Ce qui reste, et qui n'a pas bougé :** le chaînage s'arrête toujours à la
dérivation, et les tronçons non vus partent dans l'ordre du fichier. Les
impédances par tronçon restent justes ; leur ordre, non — mais les paramètres S
ne sortent plus, donc plus rien ne dépend de cet ordre-là.

### La visionneuse : le parcours, et le chevelu du retour — 2026-08-30

**Un défaut de fond, trois symptômes qui n'en avaient pas l'air.**
`simZPistes` rend les pistes du net dans l'ordre où l'IPC-2581 les a écrites,
et le sens de chaque polyligne y est arbitraire — rien dans le format ne dit
par quel bout on entre. Tout l'aval supposait pourtant une chaîne parcourue
dans l'ordre envoyé.

| le panneau disait | c'était |
|---|---|
| « 2 raccord(s) manquent » | deux tronçons voisins dans la **liste**, pas sur le cuivre |
| « coude 168° » | l'angle se prend entre vecteurs : **un demi-tour** sur une piste droite |
| « non envoyé », cotes par défaut, moignon inconnu | le via n'avait **jamais** été accroché |

Le dernier coûtait le plus. `simAccrocherViasIpc` ne pose un via que là où la
fin d'un tronçon rejoint le début du suivant, à 20 µm près. Le test échouait,
donc rien ne partait — ni perçage, ni pastille, ni portée, ni **vias de masse
voisins**. Le serveur remplaçait tout par des replis, et disait « non envoyé » :
vrai, mais sans dire pourquoi.

**`simChainePistes`** chaîne par les extrémités et **retourne** les pistes qu'il
faut. Deux bouts au même point sont un raccord ; deux bouts au même point sur
des couches différentes sont un via — c'est le même test, et c'est ce qui fait
que le via se pose tout seul une fois l'ordre rétabli. Une piste retournée
entraîne tout : ses plages sortent en ordre inverse, bout pour bout, et
**gauche et droite s'échangent** — `simEcartsEn` les mesure par rapport à la
tangente du parcours. Sans cet échange, le panneau écrivait « 0,187 / 2,325 »
en miroir un tronçon sur deux.

**Rien n'est forcé.** À un nœud où trois pistes se rejoignent il n'y a plus de
parcours unique : la marche s'arrête, le reste part dans l'ordre du fichier, et
le serveur continue d'annoncer les raccords manquants. Une sélection ramifiée
doit rester visiblement ramifiée.

**Le chevelu, et pourquoi il est LU et non recalculé.** L'éditeur PCB recalcule
le sien à chaque image : on y route, il faut répondre pendant qu'on déplace le
via. La visionneuse lit une carte faite, où rien ne bouge — le seul chevelu qui
vaille y est celui que le modèle a **réellement employé**. `simCheveluRes`
(commun) le lit dans le résultat : position du via, chaque via de masse avec sa
part et, s'il est écarté, le motif. Le trait et le chiffre viennent de la même
source ; il ne peut pas y avoir de désaccord entre le dessin et la fiche.

Il fallait pour cela que la fiche dise **où** est le via : `retour` porte
désormais `x` et `y`, et la clé est **absente** quand la page ne l'envoie pas —
un zéro, lui, se dessinerait.

Une mention propre à cette page : l'IPC-2581 ne déclare pas la portée d'un
perçage. Les retours y sont **supposés traversants**, un enterré pris pour
traversant rend une boucle trop petite de près de vingt pour cent, et le
chevelu le dit sur le dessin — pas seulement en note de bas de panneau.

**Non-régression** : trois cas tiennent le chaînage — et j'ai vérifié qu'ils
**échouent** sans lui —, cinq le contrat de lecture du chevelu, un la
conversion millimètres → unités du fichier (sur une carte en pouces, une
conversion oubliée poserait le chevelu vingt-cinq fois trop loin, donc hors
carte, où personne ne le trouverait pour s'en plaindre), et deux, côté serveur,
la position rendue et le refus de l'inventer.

### La sélection à plusieurs morceaux, et les lots — FAIT le 2026-08-31

**Le cas qui l'a demandée, et il est ordinaire en RF.** Une ligne 50 Ω coupée
par trois condensateurs de liaison n'est pas un net : c'est quatre nets bout à
bout, séparés par des boîtiers. La question, elle, ne se pose qu'une fois —
« fait-elle 50 Ω sur toute sa longueur ? » — et il fallait la poser quatre fois,
cliquer quatre fois, relire quatre fiches et se souvenir des chiffres
entre-temps. Le même besoin revient partout où le cuivre est coupé sans que la
LIAISON le soit : té de polarisation, filtre, résistance série, pont de mesure.

**Ce qui a été fait.**

| Où | Quoi |
|---|---|
| `visionneuse-ipc2581/js/02-modele.js` | `V.sel` : la liste des morceaux retenus, `{s, mev}` chacun, et les fonctions d'état qui la rangent (`selPoser`, `selRefleter`, `selMeme`, `selNets`, `selRefs`) |
| `js/04-interaction.js` | Ctrl+clic ajoute ou retire ; Ctrl+Maj+clic ajoute un net entier ; le vide ne vide plus une sélection qu'on construit |
| `js/03-rendu.js` | tous les morceaux s'allument ensemble, boîtiers compris |
| `js/05-panneaux.js` | la fiche « Sélection » : liste numérotée, chaque ligne se retire seule ; Ctrl+clic dans les listes de nets et de composants |
| `commun/simulation-em.js` | **les lots** : `SIM.lots`, le lot actif reflété dans `SIM.res`, le tableau de synthèse, le calcul lot par lot, le `.csv` de tous les lots |
| `js/07-simulation.js`, `editeur-pcb/js/19-simulation.js` | `problemes()` : un document par parcours continu, et la carte de chaleur qui peint TOUS les lots |

**Un lot est un parcours continu** : le même net, et du cuivre qui se touche —
deux bouts au même point sur deux couches comptent comme un via, exactement
comme pour le chaînage. Un net qui se ramifie reste donc un lot, avec l'arrêt
de marche que le panneau annonçait déjà ; on ne découpe pas les branches, on
découpe ce qui ne se touche pas.

**Pourquoi séparément et non bout à bout.** La cascade ABCD suppose que la
sortie d'un tronçon soit l'entrée du suivant. Entre deux lots il y a un
composant, dont ce panneau ne sait rien : les additionner rendrait un S₂₁ qui
aurait l'air d'être celui de la ligne entière en l'ignorant. Envoyés séparément,
ils rendent quatre résultats justes, et la fiche dit sous le tableau ce qu'elle
ne modélise pas.

**`SIM.res` survit, et c'est ce qui a rendu la chose petite.** Tout ce qui
affiche, peint et exporte le lit depuis toujours. Le lot actif s'y REFLÈTE :
la fiche complète, la courbe S, la section résolue, le `.csv`, le `.s2p` et les
deux canevas fonctionnent sans une ligne de changement, et un seul morceau
désigné se comporte exactement comme avant. Ce qui s'ajoute est au-dessus.

**Deux replis, tous les deux dits.** Un morceau posé sur une couche absente de
l'empilage n'a pas d'impédance : son lot est écarté, et la note le nomme. Et
au-delà de **seize lots** — un Ctrl+A, un lasso sur la carte entière, un net de
masse en cinquante îlots — tout repart dans un seul document plutôt qu'en seize
requêtes : les impédances par tronçon restent justes, la cascade sera refusée
par le serveur, et la note dit que la comparaison n'a pas eu lieu. Aucun
plafond silencieux.

**Non-régression** : neuf cas côté visionneuse (`test/harness-sim.js`, 92 au
total) et cinq côté éditeur (`test/harness.js`, 513 au total). Les deux qui
comptent le plus sont ceux qui protègent l'ancien comportement : « un seul
morceau désigné rend un seul lot, par le chemin d'avant » et « une liaison
continue reste un seul lot, et le document est celui d'avant ». Vient ensuite
« la même piste prise deux fois ne part qu'une fois » — cliquer une piste puis
Ctrl+Maj+clic pour prendre son net la mettait dans deux entrées, et sans
dédoublonnage elle se chaînait avec elle-même.

**Ce qui reste à faire.** Le chevelu du retour et la carte de chute continue ne
peignent que le lot déplié : c'est défendable — six chevelus superposés ne se
lisent pas — mais ce n'est pas dit à l'écran. Et le `.s2p` reste par lot, ce qui
est la seule chose juste : un Touchstone de la ligne entière demanderait le
modèle des composants qui la coupent.

### À faire : un rapport de santé de la liaison

**Le constat, et il est juste.** Le panneau d'impédance affiche aujourd'hui une
quinzaine de notes dont la plupart ne parlent pas d'impédance : le chemin de
retour, les moignons, la couture de vias, le cuivre voisin, les ports déduits,
les plans non déclarés. Ce sont de bonnes informations posées au mauvais
endroit — on vient y chercher un nombre en ohms et on lit un diagnostic.

**Ce que ce serait.** Une analyse à part, à côté d'« Impédance » et de
« Chute DC », qui prend une liaison **ou un bus** et rend un verdict structuré
plutôt qu'une liste : ce qui est sain, ce qui est douteux, ce qui est faux, et
pour chaque point le chiffre qui le dit et le geste qui le corrige. La matière
existe déjà — c'est exactement ce que les notes actuelles contiennent — et il
s'agit de la **déplacer et de la hiérarchiser**, pas de la recalculer.

**Ce qu'il faudrait décider avant d'écrire une ligne** : ce qui compte comme un
défaut (une phase de via de 0,03° n'en est pas un), comment on classe (par
gravité ? par tronçon ?), et ce qu'un bus ajoute à une liaison seule —
l'appariement des longueurs, la diaphonie, le fait que N liaisons partagent
leurs vias de retour. La diaphonie, elle, a désormais sa réponse : l'onglet du
même nom la chiffre agresseur par agresseur et **cumule** — il reste à la faire
entrer dans un verdict d'ensemble plutôt que dans sa propre fiche.

**Et le panneau d'impédance redeviendrait ce qu'il annonce** : Z₀ par tronçon,
la courbe S, et les seules notes qui portent sur la section calculée.


### La section résolue est désormais lisible

Chaque tronçon rend `h`, `er`, `tan_delta`, `couverture`, `entre_plans` et
`cuivre` ([python/simulation_em.py](python/simulation_em.py) 2.4.0), et la fiche
les écrit en une ligne par section distincte (`simSection()`,
[commun/simulation-em.js](commun/simulation-em.js)), avec la provenance de
chaque cote fournie par l'outil (`provenance()` de l'adaptateur).

C'était un trou réel : le panneau montrait Z₀ sans montrer ses entrées, si bien
que diagnostiquer trois ohms d'écart avec une carte mesurée demandait d'INVERSER
le résultat pour retrouver la hauteur au plan. Le solveur n'étant en cause dans
aucun de ces cas — 0,25 % contre la transformation conforme, 0,42 % contre
Hammerstad-Jensen —, c'est toujours dans ses entrées que la réponse se trouve.

**Ce qui reste à faire de ce côté** : l'écart nominal/pressé n'est qu'un
avertissement. Rien ne permet de saisir l'empilage RÉEL mesuré par le fabricant
à côté du nominal, ni de dire lequel des deux le calcul emploie. C'est ce qui
transformerait la simulation en outil de corrélation plutôt qu'en outil de
prédiction.

### Ce que la masse coplanaire suppose

Une piste noyée dans un plan arrosé n'est pas un microruban : le cuivre qui la
borde sur sa propre couche fait tomber son impédance de vingt pour cent et
davantage. C'est le cas ordinaire d'un tracé RF, et il est traité. Mais le
traiter demande de répondre à trois questions que le cuivre ne répond pas seul,
et les trois réponses étaient tacites — et fausses — avant la 1.3.0 de
`ligne_mom.py` :

**1. Quel cuivre est de la masse ?** La règle était « tout net différent de
celui de la piste ». Un îlot d'un autre signal comptait donc comme plan de
retour, ce qu'il n'est pas. Les nets de masse sont maintenant DÉCLARÉS : chaque
outil en propose une liste, le panneau l'affiche en pastilles cliquables, et le
document d'échange l'emporte sous `reference_nets` pour que le `.csv` et
l'entête Touchstone disent sous quelle hypothèse le chiffre a été obtenu
(`simRefSet()`, [commun/simulation-em.js](commun/simulation-em.js)).

L'éditeur PCB déduit sa proposition du RÔLE de ses couches et du nom des nets de
zone ; la visionneuse la DEVINE sur le cuivre livré — nom, part de la carte
couverte, nombre de perçages — parce qu'un fichier IPC-2581 ne déclare pas quel
net est la masse. Une proposition devinée se trompe parfois : c'est pour cela
qu'elle se corrige d'un clic, et qu'un décochage tient.

**2. De quel côté, et sur quelle longueur ?** L'écart était mesuré au point le
plus serré, sur toute la longueur et les deux côtés confondus, puis posé à
gauche ET à droite. Une piste qui longe une découpe d'un côté et du plan serré
de l'autre était donc calculée comme si elle avait du plan serré des deux côtés.
Désormais : deux écarts indépendants (`gap_left` / `gap_right`), et la piste
DÉCOUPÉE en plages d'écart constant, chacune partant au solveur avec le sien
(`simPlagesDe()`, partagé par les deux outils pour que « plage » veuille dire la
même chose des deux côtés). Le solveur construit une bande de masse par côté ;
un côté sans masse est un côté sans panneaux, pas un écart infini à borner.

**3. Ce cuivre latéral est-il vraiment à la masse ?** Le solveur le tient à zéro
volt — c'est sa condition aux limites. Sur une carte, il ne l'est qu'autant que
des vias le ramènent au plan d'en face ; sans couture il flotte et finit par
résonner. **Ce n'est pas modélisé et ne le sera pas ici** : il faudrait l'onde
complète. C'est en revanche CONTRÔLÉ — le plus grand espacement entre deux
coutures consécutives, par côté, comparé à λ/20 et λ/10 dans le stratifié en
haut de la bande analysée (`simCouture()`).

**Ce qui reste tacite, et qu'il faut savoir :**

- le contrôle de couture ne vérifie pas que le via ATTEINT le plan de
  référence. Côté éditeur il exige seulement que la plage de couches du via
  contienne celle de la piste ; côté visionneuse, un perçage ne dit même pas sa
  plage. Un via borgne qui s'arrête avant compte donc comme une couture ;
- le couloir de couture est fixé à 2 mm depuis le bord du cuivre, et non déduit
  de la hauteur au plan. Sur un stratifié très épais, des coutures utiles
  tombent hors du couloir et le verdict est pessimiste ;
- la portée de l'effet coplanaire est plafonnée à 3 mm (`SIM_GAP_MAX`,
  `SIM_ECART_MAX`). Au-delà, l'écart est rendu nul. C'est juste sur un
  stratifié courant ; sur un diélectrique de plus de 0,3 mm, un plan à 4 mm
  compte encore un peu et n'est pas compté ;
- côté visionneuse, la mesure lit les ARÊTES des polygones de plan. Deux trous
  de plan qui se CHEVAUCHENT auraient des arêtes intérieures au cuivre absent,
  prises pour des bords de plan. Un fichier IPC-2581 conforme n'en produit pas —
  l'union est faite en amont — mais rien ici ne le vérifie ;
- la mesure écarte le cuivre qui se trouve DEVANT la piste plutôt qu'à côté
  (composante longitudinale dominante) : c'est ce qui ferme le couloir au bout
  d'une piste, et le compter donnait une plage fantôme à chaque extrémité. Le
  revers est qu'un plan qui borde la piste à quarante-cinq degrés est compté
  pour ce qu'il est, mais qu'un plan à plus de quarante-cinq degrés ne l'est
  plus du tout.

### Ce que le modèle de ligne ignore

- **la largeur variable au sein d'un tronçon.** Une piste qui s'évase — une
  transition vers une pastille, un col — porte une seule largeur dans le
  modèle, donc une seule impédance. C'est fidèle au document ; ce n'est pas
  fidèle au cuivre gravé ;
- **la piste VOISINE — dans la CASCADE.** Elle est calculée depuis le
  2026-08-31, mais **à côté** : `solve_multiline` rend Z différentielle et
  diaphonie dans leurs deux onglets, et le Z₀ de la colonne « Impédance » reste
  celui de la piste prise seule. C'est défendable — une piste couplée n'a pas
  UNE impédance, elle en a deux, une par mode — et c'est écrit dans la fiche ;
  ce qui manque est le **choix du mode** dans la cascade, pour que S₂₁ soit celui
  du signal différentiel quand c'en est un ;
- **le couplage entre COUCHES.** Deux pistes superposées sur deux couches
  voisines couplent, parfois plus que deux pistes côte à côte, et la section
  droite de ce solveur n'a qu'un plan de conducteurs : elle ne sait pas le dire.
  C'est le domaine du 2,5D, et c'est écrit dans les hypothèses que la fiche de
  diaphonie affiche ;
- **les découpes du plan de référence, EN FACE de la piste.** Une piste qui
  franchit une fente du plan d'en face n'a plus de référence sous elle sur cette
  longueur : le calcul continue de rendre la valeur du plan plein. Les découpes
  du cuivre COPLANAIRE, sur la couche de la piste, sont en revanche vues des
  deux côtés depuis que l'écart est mesuré côté par côté ;
- ~~**le masque de soudure**~~ — **traité depuis le 2026-08-28**, et
  *justement* depuis le 2026-08-29 : la Green à trois régions le compte, une
  piste extérieure vernie voit son Z₀ baisser de 2 à 3 %. Reste une réserve à
  connaître : le masque est modélisé en **nappe uniforme**, alors que le vrai
  est conforme — plus mince sur le sommet du cuivre que dans l'écart. Second
  ordre devant les 2–3 %, mais ce n'est pas rien sur une ligne serrée ;
- **les vias**, pour la même raison : la transition verticale manque au modèle,
  et les deux panneaux la comptent sous le résultat plutôt que de la taire ;
- **la topologie de la liaison.** La mise en cascade ABCD suppose une CHAÎNE,
  parcourue dans l'ordre envoyé. Le produit de matrices n'est pas commutatif :
  les mêmes tronçons dans un autre ordre donnent un autre S₁₁ (mesuré : −1,65
  contre −2,31 dB sur trois sections 75/25/48 Ω permutées). Un net qui se
  ramifie en T n'est pas une chaîne du tout. Le serveur vérifie désormais la
  topologie de la sélection (`_topologie()`,
  [python/simulation_em.py](python/simulation_em.py)) et distingue le parcours
  MAL RANGÉ — que la page corrige en le rangeant — du net RAMIFIÉ, qu'aucun
  ordre ne sauve. **Fait le 2026-08-30** : les deux pages ordonnent leur
  sélection en parcours, et les paramètres S ne sortent plus du tout quand ce
  n'en est pas un — la courbe cède la place à la raison du refus, et le `.s2p`
  n'est pas écrit. Les impédances par tronçon et la carte de chaleur restent
  rendues : elles ne dépendent d'aucun ordre.

### Les deux modes, et pourquoi ils doivent se recouper

Cliquer une piste donne son impédance sans serveur (`ltZ0()`) ; le panneau
« Simulation EM » la donne par le solveur de section. Ce sont deux modes
voulus, pas une redondance — mais ils ne valent que s'ils s'accordent là où ils
devraient. Trois choses ont été remises d'aplomb :

- `ltZ0()` ignorait l'épaisseur du cuivre et lisait donc **6 % trop haut**
  (51,0 Ω contre 48,0). Avec la correction de Wheeler — la même
  qu'applique `_largeur_effective()` côté solveur — les deux s'accordent
  maintenant à **0,2 %** sur tout le domaine courant ;
- `dpZ0()`, qui sert les paires différentielles, appliquait sa propre forme
  IPC-2141A au microruban et sortait **45,9 Ω** sur la piste où `ltZ0()`
  sortait 51,0 : deux panneaux du même éditeur, 11 % d'écart, rien pour
  trancher. `dpZ0()` passe désormais par `ltZ0()` pour le microruban ;
- **la piste interne était calculée comme si elle affleurait**, avec de l'air
  au-dessus. Elle a du stratifié : `green_spectral_micro_couvert()`
  ([python/ligne_mom.py](python/ligne_mom.py)) traite le cas, vérifié contre
  deux limites exactes (réduction au microruban nu à la précision machine,
  et ε_eff = εr avec Z₀ = Z₀(air)/√εr en enterré profond). Sur une couche
  interne courante, Z₀ passe de 47,98 à 43,73 Ω.

Ce qui **reste** un écart légitime entre les deux modes : la triplaque
décentrée (le mode léger suppose le ruban centré et sort au-dessus), et la
piste interne couverte, que seule la formule légère continue de voir comme un
microruban nu. Les deux sont dits dans le panneau.

### Le rouge de la carte de chaleur est celui du DRC

`SIM_Z_ROUGE` ([commun/simulation-em.js](commun/simulation-em.js)) vaut
`#e8443a`, exactement `C_ERR`
([editeur-pcb/js/01-core.js:25](editeur-pcb/js/01-core.js:25)). Les formes
diffèrent — un trait le long de la piste contre des croix — et le choix des
trois couleurs a été demandé tel quel, mais sur une carte qui affiche des
erreurs DRC les deux se confondent au premier coup d'œil. Deux sorties : décaler
la teinte de quelques degrés, ou éteindre l'affichage DRC tant que la carte de
chaleur est en service — la seconde est plus honnête, mais elle éteint quelque
chose sans le dire, ce qui demande au moins une mention au pied de page.

## Éditeur schématique

### Bus et feuilles hiérarchiques

Pas de bus ni de feuilles hiérarchiques — un `D0..D7` se tire à huit fils. Les
nets globaux couvrent le multi-feuille, c'est un demi-lot.
