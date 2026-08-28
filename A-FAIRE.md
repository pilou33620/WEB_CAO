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

## Simulation électromagnétique

**Ce qui marche** : l'impédance. Le panneau « Simulation EM » des deux outils
envoie la section droite des tronçons sélectionnés à
[python/ligne_mom.py](python/ligne_mom.py), qui la
résout par méthode des moments, et rend l'impédance, la permittivité effective,
le retard, les pertes, puis les paramètres S de la liaison par mise en cascade.
Vérifié à 0,42 % contre Hammerstad-Jensen et à 0,30 % contre la solution exacte
en intégrales elliptiques ; 51 cas dans
[python/test/banc-ligne-mom.py](python/test/banc-ligne-mom.py).

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
| **Z différentielle, Z commune** | `ligne_mom` → N conducteurs | **petit** | 0,3 % |
| **Diaphonie entre pistes parallèles** | idem + lignes multiconducteurs | **petit** | 0,3 % |
| Diaphonie croisée, via, changement de couche | moteur 2,5D | gros | quelques % |
| **Chute continue, densité de courant DC** | nouveau solveur résistif surfacique | moyen, simple | bonne |
| **R_AC, effet de peau, resserrement** | section, à l'intérieur du cuivre | moyen | bonne |
| Résonances de plan, Z du PDN en fréquence | 2,5D, ou modèle de cavité | gros | quelques % |
| Ampacité, échauffement | modèle IPC-2152, pas un solveur | petit | ±20 % par nature |

Trois physiques différentes, et le moteur 2,5D n'est le bon outil pour aucune
des trois lignes en gras.

#### 1. `ligne_mom` à N conducteurs — Z différentielle ET diaphonie, même chantier

**Le meilleur rapport valeur/effort de tout ce fichier**, et la machinerie est
déjà là. `capacitance_coplanaire`
([python/ligne_mom.py](python/ligne_mom.py)) **assemble déjà une matrice
multi-conducteurs** : plusieurs blocs de panneaux à la même hauteur, une seule
matrice, et un vecteur de conditions aux limites —

    [A] [q] = [V]     avec V = 1 sur le ruban, 0 sur les plans coplanaires

Ce qui manque est la généralisation du **second membre**. Au lieu d'un vecteur,
en résoudre N — potentiel unité sur le conducteur *i*, zéro sur les autres — et
relever la charge portée par chacun. On obtient la **matrice de capacité de
Maxwell** (dite aussi de court-circuit) [C], celle-là même que la théorie des
lignes multiconducteurs demande : Q = [C] V, diagonale positive, hors-diagonale
négative, somme de ligne égale à la capacité vers la référence.

On refait avec εr = 1 → [C₀], et comme le milieu est non magnétique,

    [L] = μ₀ ε₀ [C₀]⁻¹

De ces deux matrices sortent, **sans aucun solveur de plus** :

- Z différentielle et Z commune — modes pair/impair pour une paire,
  décomposition modale de [L][C] pour N > 2 ;
- la diaphonie : NEXT, FEXT, longueur de couplage, par la théorie MTL ;
- les coefficients de couplage par paire, donc ce qu'on affiche.

**Ce que ça coûte.** `_matrice` — la partie chère, avec sa quadrature
spectrale — est construite **une seule fois** ; une factorisation LU réutilisée
pour les N résolutions. Le surcoût sur le calcul actuel est négligeable, et la
précision est la même, parce que c'est la même discrétisation avec les mêmes
panneaux resserrés.

**Non-régression, à écrire dans
[python/test/banc-ligne-mom.py](python/test/banc-ligne-mom.py) :**

- N = 1 doit redonner le chiffre actuel **au bit près** ;
- deux rubans très éloignés doivent se découpler : hors-diagonale → 0, et chaque
  diagonale → la capacité du ruban seul ;
- la matrice doit être **symétrique**, à diagonale positive et hors-diagonale
  négative — trois invariants gratuits qui attrapent une erreur de signe ;
- une paire symétrique : Z_diff contre la forme fermée de Garg-Bahl pour le
  microruban couplé par les arêtes, qui vaut à quelques pour cent — c'est un
  étalon **extérieur**, et il en faut un ;
- Z_diff → 2 Z₀ quand l'écart devient grand devant la hauteur.

**La réserve à écrire dans le code.** Ceci couvre le couplage entre pistes
**parallèles** — l'immense majorité de la diaphonie qui compte sur une carte.
Deux pistes qui se croisent sur des couches différentes, ou qui couplent par un
champ de vias, ne sont plus une section : là, et là seulement, il faut le 2,5D.

**Côté pages**, il faut aussi savoir *quelles* pistes sont parallèles et sur
quelle longueur. La géométrie qui mesure la section par tronçons existe déjà
(`section_de_couche`, [python/simulation_em.py](python/simulation_em.py), et les
bancs de `editeur-pcb/test/harness.js`) ; ce qui manque est l'appariement de
tronçons voisins et la longueur de recouvrement.

#### 2. Le solveur DC — chute continue et densité de courant

**Ce n'est pas de l'électromagnétisme du tout** : c'est un problème résistif sur
les formes de cuivre, réel, sans fréquence, à matrice symétrique définie
positive — donc un gradient conjugué et rien de plus. C'est le point 1 de la
famille PI ci-dessous, et il est **indépendant de tout le reste** : il ne
partage aucun code avec `ligne_mom` ni avec `mom_solver`, donc il peut se faire
en parallèle sans conflit.

Ce qu'il demande, et qui n'existe pas encore :

- un maillage **surfacique** des polygones de cuivre par couche — pas la section
  droite, et pas non plus le maillage RWG de `mom_solver` : un réseau de
  résistances ou du Laplace 2D suffit ;
- les **vias** comme résistances localisées entre couches, y compris les
  coutures de masse ;
- les **points d'injection et d'extraction** : les pastilles des composants, avec
  le courant que le schéma leur attribue — c'est la donnée qui manque le plus,
  et elle vient du schéma, pas du PCB ;
- la sortie : une carte de chaleur de potentiel, et la chute pire-cas par net.

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

1. **`ligne_mom` à N conducteurs.** Un seul chantier débloque Z différentielle
   *et* diaphonie, à la précision déjà acquise.
2. **Le solveur DC.** Indépendant, simple, parallélisable avec le reste.
3. ~~R_AC par la section~~ **FAIT.** Le modèle industriel est maintenant utilisé.
4. **Le port vertical du moteur 2,5D** — en dernier. Il ne débloque aucun des
   besoins ci-dessus à 5 GHz. Sa raison d'exister reste les discontinuités
   au-delà de 2 à 3 GHz, et c'est le point 1 de « Réparer l'onde complète ».

Autrement dit : **ce qui reste à ajouter tire vers le solveur de SECTION, pas
vers l'onde complète.** Le moteur 2,5D est maintenant juste et mesuré — il
attend son port — mais il n'est sur le chemin d'aucune des fonctions demandées.


### La famille PI est vide, et c'est un emplacement, pas un oubli

Le panneau se range désormais en deux familles — **SI** (intégrité du signal)
et **PI** (intégrité de l'alimentation). SI porte « Impédance » ; PI ne porte
rien, et l'affiche en toutes lettres plutôt que d'aligner des onglets grisés.

Le registre est `SIM_FAMILLES` / `SIM_ANALYSES`
([commun/simulation-em.js](commun/simulation-em.js)). Une analyse y déclare
`nom`, `titre`, `corps()` (ses commandes), `brancher()`, `rendre()` et `peint`
— ce dernier commandant `simZActif()`, donc la carte de chaleur. L'onglet
apparaît tout seul.

Ce qu'il y aurait à mettre dans PI, par ordre de ce que le dépôt sait déjà
faire :

1. **la chute continue dans les plans** (IR drop). Ce n'est pas de
   l'électromagnétisme : c'est un problème résistif sur les formes de cuivre,
   réel et sans fréquence — le plus accessible des trois. Cette page disait
   qu'il « n'a besoin d'aucun nouveau solveur, la capacité de `ligne_mom.py` se
   transpose en conductance » ; **c'est faux**, et la confusion est celle de la
   dimension : `ligne_mom` discrétise une SECTION DROITE, l'IR drop demande un
   maillage SURFACIQUE des polygones. Il faut donc bien un solveur, mais le plus
   simple des trois. Le détail — vias, points d'injection, ce qui manque du
   schéma — est au § « Quel solveur pour quel besoin », point 2 ;
2. **l'impédance vue par le composant** (Z du PDN en fréquence), qui demande le
   condensateur de découplage, son inductance parasite d'accès, et la capacité
   plan-plan. Cette dernière tombe directement de l'empilage déjà envoyé ;
3. **les résonances de plan**, qui demandent l'onde complète — donc la section
   ci-dessous.

Et dans SI, à côté d'« Impédance » : la **diaphonie** et l'**impédance
différentielle**, qui sont le même chantier et le meilleur rapport
valeur/effort du fichier — `capacitance_coplanaire` assemble déjà une matrice
multi-conducteurs, il manque la généralisation du second membre. Tout est au
§ « Quel solveur pour quel besoin », point 1. Et le **diagramme de l'œil**, qui
n'est que la réponse impulsionnelle des paramètres S déjà calculés.

### Réparer l'onde complète, ou l'assumer morte

`mom_engine.py` est **hors du chemin de calcul**, et c'est un avertissement en
tête de fichier, pas un oubli. Ce qui l'en tient écarté a encore changé : le
noyau est maintenant réparé et **mesuré**, et ce qui bloque est ailleurs — dans
le modèle de port, dont on sait désormais chiffrer le défaut.

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

**Ce que ça vaut, mesuré.** Trois bancs, 38 essais, une trentaine de secondes.

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
   vrai d'aucune autre cause. **À faire** : un troisième niveau de DCIM dont le
   chemin d'échantillonnage est paramétré en `k_z` de l'air.
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
   microruban.** Un port de microruban est une tension entre la piste et le
   **plan de masse** : il demande un courant **vertical**, donc un via. Entre
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

**Ce qui reste, par ordre de gravité.**

1. **Le port de microruban demande des courants VERTICAUX.** C'est désormais le
   seul blocage entre ce moteur et des paramètres S utilisables sous quelques
   gigahertz. Il faut : des fonctions de base sur un via de port (RWG
   horizontale/verticale à la jonction, ou un élément filaire attaché), la
   fonction de Green `G_A^zz`/`G_A^zx` correspondante — `green_layered` sait
   déjà cascader les deux modes, il faut la composante verticale du dyade —,
   puis le **dé-embarquement par la méthode des deux longueurs** (deux
   résolutions, `T₂T₁⁻¹` dont les valeurs propres donnent γ sans connaître les
   accès). Tant que ce n'est pas fait, la seule grandeur que le moteur rende
   proprement est ε_eff par l'onde stationnaire — ce que `banc_moteur.py`
   mesure, et ce que `ligne_mom.py` donne déjà mille fois plus vite.
2. **Le second point de branchement n'est pas ajusté** (point 1 des démentis
   ci-dessus). Sans conséquence pour une matrice d'impédance — à ces distances
   le noyau vaut six ordres de grandeur de moins qu'en champ proche — décisif
   pour un calcul de rayonnement.
3. **Un seul plan source.** L'ajustement vaut pour la couche des pistes. Un
   empilage à deux couches de signal demande un jeu d'images par couche, et un
   jeu croisé par paire de couches. Même chantier que le point 1 : c'est la
   généralisation de `profil_spectral` à plusieurs plans.
4. **L'assemblage est en Python pur, et ça plafonne vers 300 fonctions de
   base.** 169 RWG en 5 s, 269 en 25 s, en N². Le cache de moments par paire de
   triangles (`MomentsTriangles`) a pris le facteur sept qui était exact ; la
   suite serait de tabuler les deux noyaux sur une grille de ρ par fréquence et
   d'interpoler dans un noyau `nopython`. Ce n'est **pas** exact, et ça demande
   sa propre validation d'erreur d'interpolation.
5. **Le plan de masse est supposé infini et parfait.** Hypothèse ordinaire du
   2,5D, écrite dans `mesher.py` ; elle cesse d'être bonne quand le plan est
   étroit devant la hauteur, ou fendu sous la piste.

**Le cas de non-régression est écrit d'avance** : une ligne microruban 50 Ω de
20 mm doit rendre |S₂₁| proche de 1 et |S₁₁| bas — `ligne_mom.py` le donne déjà,
et sert donc d'étalon. **Cette comparaison attend le point 1** : sans port
vertical, |S₂₁| mesure le couplage de la fente, pas la ligne. La comparaison
qui a *pu* être faite, elle, est celle d'ε_eff, et elle donne 0,49 %.

Les dépendances de maillage (`gmsh`, `meshio`, `pygmsh`) sont installées ; la
chaîne va du JSON au fichier Touchstone.


### Ce qu'il reste au panneau de simulation

Trois chantiers, chiffrés et indépendants. Les trois premiers ont été
spécifiés en détail ; le dernier attend le moteur.

#### 1. ~~Le masque de soudure dans le calcul~~ **FAIT (2026-08-28)**

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

~~Non-régression : trois réductions exactes (c = 0, εr₂ = εr₁, c → grand) dans~~
~~[python/test/banc-ligne-mom.py](python/test/banc-ligne-mom.py).~~

**Ce qui est fait :**

- `green_spectral_micro_masque` dans `ligne_mom.py` : Green à trois régions
  (substrat/masque/air), avec les formules exactes ci-dessus. Réductions exactes
  vérifiées ;
- `solve_line` prend maintenant `masque = {epaisseur, epsilon_r}` et route vers la
  Green appropriée ;
- `section_de_couche` détecte les couches extérieures et envoie le masque au solveur
  (défaut 25 µm / εr 3.8 si non déclaré) ;
- le segment de sortie porte `"masque"` avec son épaisseur et εr.

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

#### 3. ~~Modéliser les discontinuités~~ **FAIT (2026-08-28)**

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

- `ligne_mom.py` : `abcd_via()` (π L-C), `abcd_coude()` (shunt C),
  `inductance_via()`, `capacite_pastille()`, `capacite_coude()` ;
- `simulation_em.py` : insère les matrices ABCD de discontinuités dans la cascade
  pour chaque coude et chaque transition de couche détectés ;
- enrichit `discontinuites` avec les valeurs modélisées (L en nH, C en fF) ;
- format passent de `cao-sim-em-1` à `cao-sim-em-2` et de
  `cao-sim-em-resultat-2` à `cao-sim-em-resultat-3`.

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
- **la piste VOISINE.** Le plan de masse coplanaire, lui, est désormais traité
  — c'était le gros morceau, et le plus fréquent. Reste le couplage à une autre
  PISTE : deux signaux serrés se voient, et le modèle de ligne ne le dit pas.
  Il est en revanche DÉTECTÉ depuis que les nets de masse sont déclarés : le
  cuivre d'un net non-référence qui longe la piste ne compte plus comme un plan
  de retour, il ressort en note de couplage avec son écart et sa longueur
  (`simVoisins()`, [commun/simulation-em.js](commun/simulation-em.js)). C'est le
  signalement, pas le calcul. Le calcul est le domaine de `dpZdiff()`, qui
  existe pour les paires différentielles et n'est pas branché sur la simulation.
  Le chemin est ouvert : `capacitance_coplanaire()` met déjà plusieurs
  conducteurs dans la même matrice ; il suffit de tenir le second à un potentiel
  au lieu de zéro pour sortir la matrice de capacité complète, donc le mode pair
  et le mode impair ;
- **les découpes du plan de référence, EN FACE de la piste.** Une piste qui
  franchit une fente du plan d'en face n'a plus de référence sous elle sur cette
  longueur : le calcul continue de rendre la valeur du plan plein. Les découpes
  du cuivre COPLANAIRE, sur la couche de la piste, sont en revanche vues des
  deux côtés depuis que l'écart est mesuré côté par côté ;
- **le masque de soudure**, absent de l'empilage envoyé. L'ajouter décale tous
  les indices de couche (`simCuIndex`,
  [editeur-pcb/js/19-simulation.js](editeur-pcb/js/19-simulation.js)) pour un
  effet marginal sur un microruban : à faire d'un coup, pas à moitié ;
- **les vias**, pour la même raison : la transition verticale manque au modèle,
  et les deux panneaux la comptent sous le résultat plutôt que de la taire ;
- **la topologie de la liaison.** La mise en cascade ABCD suppose une CHAÎNE,
  parcourue dans l'ordre envoyé. Le produit de matrices n'est pas commutatif :
  les mêmes tronçons dans un autre ordre donnent un autre S₁₁ (mesuré : −1,65
  contre −2,31 dB sur trois sections 75/25/48 Ω permutées). Un net qui se
  ramifie en T n'est pas une chaîne du tout. Le serveur vérifie désormais la
  continuité de la sélection (`_ruptures()`,
  [python/simulation_em.py](python/simulation_em.py)) et le dit quand elle
  manque — les impédances par tronçon et la carte de chaleur restent justes,
  seuls les paramètres S et les cumuls perdent leur sens. **Ce qui reste à
  faire** : ordonner la sélection en parcours quand c'en est un, et refuser
  franchement les paramètres S quand ce n'en est pas un, plutôt que de les
  rendre assortis d'une réserve.

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
