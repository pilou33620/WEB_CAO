# Simulation EM & Intégrité du Signal (SI / PI)

> **Document de référence technique** extrait du projet [WEB_CAO](../README.md).
> Ce document détaille l'intégralité des principes physiques, modèles numériques (MoM 2D, cascade S-paramètres, réflectométrie spatiale de diaphonie) et arbitrages de conception du panneau de simulation commun à l'éditeur PCB et à la visionneuse IPC-2581.

---

## Simulation

Le bouton **« Simulation EM… »** de l'éditeur PCB et de la visionneuse IPC-2581
ouvre le même panneau, rangé en deux familles — **SI** (intégrité du signal) et
**PI** (intégrité de l'alimentation). SI porte quatre onglets, dont **trois
lisent la même réponse du serveur** : *Impédance*, *Z différentielle* et
*Current Return Path*. Changer d'onglet ne relance rien.

Le quatrième, ***Crosstalk***, est à part et c'est assumé : il a sa propre
route, son propre calcul et son propre résultat. Il répond seul à la question
du couplage — **combien** une voisine prend, en pour cent de l'agresseur, en
décibels et **en volts sur sa broche**, et **où**, le long des quarante
millimètres qui longent, ce couplage se fabrique. Voir
[Crosstalk](#crosstalk--où-le-couplage-se-fabrique), plus bas.

> **Un onglet *Diaphonie* a existé, et il a été retiré.** Il résolvait une
> section droite unique et rendait *un* coefficient par longement : il disait
> combien, jamais où, et sa carte de chaleur **attribuait** le bruit aux
> tronçons au prorata du couplage local au lieu de le mesurer le long de la
> piste. *Crosstalk* rend le même « combien » avec une abscisse en plus.
> Garder les deux laissait **deux verdicts concurrents sur le même cuivre**,
> obtenus par deux physiques différentes, et rien pour les arbitrer.

Le serveur résout la **section droite** de chaque tronçon par méthode des
moments (`python/ligne_mom.py`), rend son impédance caractéristique
à la fréquence choisie, et les paramètres S de la liaison entière par mise en
cascade. La page peint le résultat **sur la piste** et y écrit la valeur.

```bash
pip install numpy scipy      # les deux seules dépendances du dépôt, facultatives
python serveur.py
```

### La carte de chaleur

On saisit une **impédance visée**, une **tolérance** et une **fréquence
centrale** — c'est à celle-ci que l'impédance est donnée et la carte peinte.
Le cuivre sélectionné se colore :

- **bleu** — dans la tolérance ;
- **rouge** — trop élevé : piste trop étroite, ou trop loin de son plan ;
- **vert** — trop faible : piste trop large, ou trop près de son plan.

**Le vert ne veut donc pas dire « bon »** mais « trop bas » : sur une carte de
chaleur ce sont les deux *sens* de l'écart qu'il faut distinguer d'un coup
d'œil, et la légende du panneau le redit en toutes lettres. La clarté porte
l'écart — pâle en bord de bande, pleine une tolérance plus loin.

La valeur est écrite sur la piste, dans un cartouche : une étiquette par
valeur distincte, posée sur le plus long tronçon qui la porte — cinquante fois
« 48,0 Ω » empilés ne se liraient pas. Au-delà de huit valeurs distinctes, les
huit plus éloignées de la cible sont gardées.

### Deux cartes, une par question

Chaque onglet peint **la grandeur dont il parle**, sur le même cuivre :

| Onglet | Ce qui est peint | Échelle |
| --- | --- | --- |
| *Impédance* | Z₀ tronçon par tronçon | la cible ± sa tolérance |
| *Z différentielle* | **Z_diff tronçon par tronçon** | la cible différentielle ± sa tolérance |

*Crosstalk* ne peint pas ce cuivre-là : sa figure est **dans le panneau** — une
courbe par victime et par sens, sur un axe commun —, et ce qu'il pose sur la
carte, ce sont les **plages à risque** et la **chaleur** le long du cuivre des
*victimes*, pas de la sélection. Deux victimes sur deux tracés différents ne se
comparent qu'alignées sur un même axe, et c'est ce que la figure fait.

La carte de Z_diff répond à ce qu'un chiffre unique ne pouvait pas dire. Le
tableau chiffre **un longement** sur une section dont l'écart est la
**moyenne** de ce qui longe ; or trois millimètres à 0,8 mm et un
demi-millimètre à 0,12 mm donnent la même moyenne, et ce n'est pas la même
paire. Le serveur résout donc, pour chaque tronçon, une section à **deux
conducteurs** à son écart **réel** — même empilage, même masse coplanaire, même
solveur —, plafonnée à vingt-quatre résolutions par calcul et mise en cache au
pas de cinq microns. Le **gris** n'y est pas une valeur nulle : c'est l'absence
de voisine, et c'est ainsi qu'on voit où la paire se sépare.

La paire peinte est celle qui est **déclarée** — suffixes `_P`/`_N`, ou paire
nommée dans l'éditeur ; à défaut, la voisine **la plus proche**, et la carte le
dit. Un repli qui se donnerait pour une déclaration ferait lire « ma paire fait
92 Ω » sur deux pistes qui n'en forment pas une.

#### La masse qui s'interpose

Les deux pages mesurent l'écart de chaque piste au cuivre de masse, côté par
côté. **Quand une voisine se trouve plus loin que là où ce cuivre commence, il y
a du plan entre les deux** — c'est le geste de routage le plus banal : on glisse
une garde, ou du plan arrosé cousu de vias, entre un signal rapide et son
voisin.

Ce cuivre-là est **posé dans la section comme une garde**, à zéro
volt, large de ce que laissent les deux dégagements mesurés ; la coupe le
marque « garde déduite » — il sort de deux mesures, il n'est pas lu dans le
fichier comme l'est une piste de garde routée.

Auparavant il était **purement jeté** : la masse était repoussée au bord du
groupe, son écart devenait négatif, on le ramenait à zéro, et deux pistes
séparées par un plan arrosé se résolvaient comme deux pistes face à face
au-dessus du diélectrique nu. Le couplage annoncé était celui d'un routage qu'on
n'avait pas fait, et rien ne le disait. Sur un cas contrôlé — deux voisines à
1,19 mm de la même piste, l'une derrière un plan, l'autre à nu — le blindage
vaut un facteur **3 à 5** selon la largeur de la bande.

Le modèle suppose ce cuivre **tenu à zéro volt sur toute la longueur** : c'est ce
qu'un plan cousu de vias fait, et ce qu'une garde sans vias ne fait pas — sans
couture elle peut résonner, et le couplage revient. La fiche le dit sous la
coupe.

### Choisir sa paire

La détection lit les suffixes — `_P`/`_N`, `+`/`−`, `_DP`/`_DM` — et les paires
déclarées dans l'éditeur. Une paire nommée `CLK`/`CLKB`, ou deux nets baptisés
par un fabricant de connecteur, n'y entrent pas : la fiche les rangeait sous
« ce ne sont pas des paires », avec des impédances pourtant justes.

La liste **« Paire »** de l'onglet *Z différentielle* laisse la désigner. Le net
choisi part dans `doc.paires`, au même endroit et au même format que ceux de
l'éditeur : le serveur ne les distingue pas, et c'est ce qui en fait *la* paire,
carte de chaleur comprise. Les candidats proposés sont **ce qui longe**, avant
même le premier calcul — sans quoi il faudrait calculer pour pouvoir demander le
bon calcul. Une sélection à cheval sur deux nets ne peut rien déclarer : on ne
saurait pas laquelle de ses moitiés est le « P ».

***Z différentielle* ne demande pas de fréquence.** La section est
quasi-statique : ni [C], ni [L], ni les modes pair et impair ne dépendent de f₀.
L'onglet posait le champ f₀ et, avec lui, l'avertissement de bande S, lequel
parle des pertes et des paramètres S de l'onglet *Impédance* : un avertissement
portant sur un calcul qui n'a pas lieu là, sous des chiffres qu'il ne concerne
pas.

**Les gestes de sélection commandent l'étendue du calcul.** Dans l'éditeur
PCB : clic pour le tronçon seul, `Maj`+clic pour la piste entière, `Maj`+clic à
nouveau pour la piste sur toutes les couches. Dans la visionneuse : clic pour
la piste sur sa couche, `Maj`+clic pour tout le net. La case **« suivre »**,
armée dès le premier calcul, relance à chaque changement de sélection.

Le panneau donne aussi le bilan de la liaison (minimum, maximum, moyenne
pondérée par la longueur, retard, pertes), la courbe S₁₁ / S₂₁ sur la bande
avec le repère de la fréquence centrale, et trois exports : `.csv` (le tableau
des tronçons), `.s2p` (Touchstone) et `.json` (le problème lui-même).

### Ce que vaut le calcul, et ce qu'il ne couvre pas

Ce n'est pas une formule fermée de plus : c'est un calcul de champ sur la
section, qui converge quand on raffine et qui traite des cas que les formules
ne savent pas traiter — à commencer par la **triplaque décentrée**, que la
formule IPC suppose centrée alors qu'un empilage 4 couches ne l'est jamais.

Il est vérifié contre des étalons extérieurs, et le banc d'essai le refait à
chaque exécution (`python/test/banc-ligne-mom.py`, 149 cas) :

| Géométrie | Étalon | Écart maximal |
| --- | --- | --- |
| Microruban, εr de 2,2 à 10,2, w/h de 0,5 à 5 | Hammerstad-Jensen (±1 %) | **0,42 %** |
| Triplaque, εr 3,5 et 4,5, w/b de 0,3 à 2,5 | solution exacte, intégrales elliptiques | **0,30 %** |
| Piste interne couverte, enterrée | ε_eff = εr et Z₀ = Z₀(air)/√εr, exacts en milieu homogène | **0,06 %** |
| Ligne coplanaire sur plan, écarts serrés | transformation conforme (Wen) | **0,4 %** |
| Masse coplanaire d'un seul côté | encadrée par le microruban nu et le coplanaire symétrique, et miroir gauche/droite | **exact** |
| Paire de microruban couplée, w/h et s/h de 0,5 à 2 | Garg-Bahl (forme fermée, quelques %) | **2,2 %** |
| Couplage avant en milieu homogène (triplaque) | il est **nul**, k_C = k_L terme à terme | **4·10⁻¹⁷** |

Les topologies traitées : microruban nu (couche extérieure), **microruban
couvert** (couche interne qui n'a de plan que d'un côté — elle a du stratifié
au-dessus, pas de l'air, et la prendre pour un microruban nu coûtait une
dizaine de pour cent), triplaque y compris décentrée, et **ligne coplanaire**.

Cette dernière n'est pas un cas d'école : une piste noyée dans un plan arrosé
— le tracé RF ordinaire — a du cuivre de masse sur sa propre couche à deux ou
trois dixièmes de millimètre, et le prendre pour un microruban surestime Z₀ de
**vingt à vingt-cinq pour cent**, avec le signe de l'écart inversé. L'écart au
cuivre n'est pas saisi : l'éditeur PCB le tient de la règle d'isolation qui
creuse le plan, la visionneuse le **mesure** sur le cuivre du fichier, au point
le plus serré.

Ce qu'il ne voit pas, et le panneau le dit sous chaque résultat :

- **une suite de sections uniformes**, rien d'autre. Les coudes, les moignons,
  les transitions de via et le rayonnement n'y sont pas — ce qui se passe *au
  raccord* entre deux tronçons n'est pas modélisé ;
- le calcul de section est **quasi-statique** ; la dispersion est ajoutée par
  le modèle de Getsinger, qui est un modèle et non un calcul. Au-delà de
  quelques gigahertz sur stratifié courant, l'écart se creuse ;
- le **couplage aux pistes voisines** est calculé, mais **à part** : la Z
  différentielle a son onglet, ce qu'une voisine *prend* a le sien
  (*Crosstalk*), et le Z₀ de la colonne « Impédance » reste celui de la piste
  prise seule. Une piste couplée n'a pas une impédance mais deux, une par mode.
  Toutes les voisines d'une même piste entrent dans **une seule section** — une
  piste et ses deux voisines font un problème à trois conducteurs —, avec le
  plan coplanaire qui borde le groupe et les pistes de masse posées en
  **gardes**, à zéro volt. Une voisine que l'épaisseur du cuivre ferait toucher
  sa propre voisine est **écartée en le disant** : elle emportait auparavant la
  section entière, donc tous les longements, pour deux conducteurs qui
  n'étaient même pas la sélection ;
- ce couplage n'est **chiffré** qu'entre pistes **parallèles et de la même
  couche** — c'est ce qu'une section droite sait décrire, elle pose tous ses
  conducteurs à la même hauteur. Les pistes **superposées** sur deux couches
  couplent aussi, souvent plus que les mêmes côte à côte : elles sont
  désormais **cherchées et signalées** avec leur longueur en regard, leur
  décalage et le diélectrique qui les sépare, et la fiche annonce alors ses
  chiffres comme un **plancher**. Celles qu'un **plan de référence** sépare ne
  le sont pas — le plan est un écran, et c'est la raison d'être de l'empilage.
  **Une voisine rencontrée des deux façons est une voisine LATÉRALE** : quand
  l'agresseur change de couche en cours de route, la même piste est vue
  superposée sur une portion et à plat sur une autre, et les deux mesures sont
  comptées à part. Deux pistes de la même couche ne peuvent pas être séparées
  par un plan — les fondre écartait un longement bien réel avec le motif « un
  plan de référence sépare les deux couches ».
  Les pistes qui se **croisent** ne sont ni chiffrées ni cherchées : l'aire de
  recouvrement d'une traversée orthogonale est minuscule, et c'est justement
  pourquoi la règle est de router deux couches adossées à angle droit ;
- **le plan de retour est supposé CONTINU sous les deux pistes**, et c'est
  l'hypothèse la plus lourde de toute la section : `[C]` et `[L]` sortent d'une
  section droite quasi-TEM, qui n'existe que si le courant de retour passe
  juste en dessous. Là où le plan est **percé, fendu ou absent**, le retour fait
  un détour dont l'aire de boucle n'apparaît nulle part dans la section, et les
  deux pistes se **partagent** ce retour : le couplage par **impédance
  commune** qui en résulte n'est pas un terme que ce modèle chiffre mal, c'est
  un terme qu'il ne **contient pas** — l'écart n'est donc pas borné par ce
  calcul, et l'outil ne le chiffre pas. Trois garde-fous, parce que ce cas rendait
  auparavant un couplage **exactement nul** sans un mot — le pire résultat que
  cet outil puisse produire, puisqu'il ressemble en tout point à une bonne
  nouvelle : une **fente sondée qui tombe sur un longement** lève une réserve
  (une fente ailleurs n'en lève pas, sans quoi l'alerte serait permanente et
  cesserait d'être lue) ; un **bloc dont la section n'est pas résoluble** n'est
  plus compté comme découplé — sa longueur est mesurée et dite ; et le **seuil
  de présélection ne se rétrécit plus** faute de hauteur au plan, il s'ouvre à
  toute la portée du voisinage, parce que sans plan le champ porte plus loin,
  pas moins ;
- **la mise en cascade suppose une chaîne**, parcourue dans l'ordre envoyé. Un
  net qui se ramifie n'en est pas une : les impédances par tronçon et la carte
  de chaleur restent justes — chacune ne dépend que de sa section —, mais les
  paramètres S, le retard total et les pertes totales ne veulent alors rien
  dire. Le serveur vérifie la continuité de la sélection et le dit quand elle
  n'y est pas.

### Crosstalk : où le couplage se fabrique

Un onglet *Diaphonie* résolvait la section droite et rendait **un chiffre par
longement**. Quand ce chiffre est mauvais, il ne dit pas lequel des quarante
millimètres qui longent en est responsable — et c'est pourtant la seule chose
dont on ait besoin pour corriger le dessin. Il a été **retiré**, et l'onglet
***Crosstalk*** répond seul aux deux questions.

Les termes croisés d'une
matrice S multi-ports portent, en fréquence, tout ce que le couplage fait le
long du parcours ; leur transformée de Fourier inverse est une **réponse
impulsionnelle**, et le retard s'y convertit en **position** dès qu'on connaît
la vitesse de propagation. C'est la réflectométrie temporelle, appliquée aux
termes *croisés* plutôt qu'à la réflexion :

| | terme lu | trajet | loi d'arrivée |
| --- | --- | --- | --- |
| **NEXT** | S(victime proche, agresseur proche) | contre-propage | `t = τa(x) + τv(x)`, soit `x = v·t/2` à vitesses égales |
| **FEXT** | S(victime lointaine, agresseur proche) | co-propage | `t = τa(x) + τv(L) − τv(x)` — **plate** à vitesses égales |

**Le FEXT n'a pas toujours d'axe, et la carte ne lui en fabrique pas.** Le
bruit avant *co-propage* avec l'agresseur : ce qui se couple en `x` arrive au
bout lointain à `τa(x) + τv(L) − τv(x)`, et quand les deux pistes ont la même
vitesse cette somme ne dépend plus de `x` — tout arrive au **même instant**, et
aucune transformée ne peut séparer ce qui s'est superposé. La carte ne porte
alors **pas** de courbe FEXT, et la fiche dit laquelle des deux raisons l'en
empêche, avec ses chiffres. Le *niveau* du FEXT, lui, ne dépend d'aucun axe :
il reste au tableau des couples, qui est ce qu'un budget de bruit consomme.

**La matrice vient du design, et de nulle part ailleurs.** Il n'y a rien à
importer : le **réseau de lignes couplées** est synthétisé à partir de la même
section droite que *Z différentielle*, mise en cascade le long du parcours.
Chaque bloc
de la cascade est une portion où l'ensemble des voisines et leurs écarts ne
changent pas — c'est ce découpage qui donne à la carte sa structure spatiale.

**Aucun fichier de paramètres S n'est accepté en entrée, et ce retrait est
délibéré.** Un `.sNp` importé apportait une physique qu'on ne sait pas calculer
— pertes conductrices, coudes, transitions de via —, mais il apportait surtout
l'**ordre de ses ports**, que rien dans le fichier ne donne : il fallait une
table à composer, une case à cocher et un refus total tant qu'elle n'était pas
confirmée, faute de quoi on lisait le couplage d'un couple pour celui d'un
autre sans qu'aucun chiffre ne paraisse anormal. Les ports sont maintenant
posés **ici**, à partir de la géométrie : ils sont *connus*, et la table qui
reste est un compte rendu. Le `.sNp`, lui, demeure en **sortie** — pour aller
comparer ailleurs le réseau à ce qu'un solveur pleine onde rendrait de la même
géométrie. Un document qui porterait encore une matrice extérieure est **refusé
en le disant**, jamais ignoré : l'ignorer ferait croire à la page que son
fichier a été calculé, alors que la carte viendrait d'ailleurs.

#### Le bruit en volts, et pas seulement en pour cent

« VIC_G prend 3,00 % de CLK » est exact et **ne décide rien** : un récepteur ne
connaît pas les pour-cent, il connaît la distance entre la tension qui lui
arrive et son seuil de basculement. Le même 3 % vaut **99 mV** sur un LVCMOS
3,3 V — invisible devant 700 mV de marge — et **10,5 mV** sur un LVDS 350 mV, où
la marge est de 50.

La rangée **Signal** du panneau porte donc trois champs :

| Champ | Ce qu'il fait | Unité |
| --- | --- | --- |
| **amplitude** | l'excursion du front de l'**agresseur** : elle convertit les rapports en volts | V / mV |
| **budget** | ce qu'on s'autorise, en pour cent de l'amplitude | % |
| **ou marge** | la marge de bruit du récepteur de la **victime** ; remplie, elle **remplace** le budget | mV |

La tension apparaît alors **partout où le pour-cent apparaît**, à côté de lui
et jamais à sa place : sur les cases des victimes (NEXT, FEXT, pire bout), dans
la colonne « bruit » du tableau de l'étape 0b, dans le verdict, dans le `.csv`
(une colonne `*_V` par courbe) et dans le rapport texte.

**Et sur la courbe elle-même, de deux façons.** Le pour-cent se lit sur l'axe
de **gauche**, la tension sur celui de **droite** — trois crans chacun, le
haut, la moitié et zéro, la moitié étant celle que le trait de grille porte
déjà. C'est le même trait lu deux fois, et n'importe quelle hauteur se
convertit d'un coup d'œil. Empilées à gauche comme elles l'étaient d'abord,
les deux unités ne donnaient qu'**une** valeur — le haut du graphe — et il
fallait la réglette pour tout le reste.

Chaque courbe porte en plus **sa tension écrite à son pic**, dans la couleur de
sa victime : c'est la valeur qu'on cherche en premier, et l'aller chercher à la
réglette était un geste de trop. La couleur y prime sur la convention ambre des
autres volts — sur un graphe à cinq courbes, savoir *à qui* appartient un
chiffre passe avant savoir de quelle famille il est. L'étiquette se pose
au-dessus du pic, ou **dessous** quand celui-ci touche le haut du graphe et
qu'elle irait se loger dans le titre ; deux pics trop proches s'écartent l'un
de l'autre plutôt que de se recouvrir exactement là où l'on regarde.

La **réglette**, elle, reste ce qui répond à « et à *cet* endroit-là, combien ?»
— position par position le long du parcours. L'unité **suit l'ordre de grandeur** : volts, millivolts,
microvolts. Sous le microvolt on écrit l'inégalité plutôt qu'un zéro — un bruit
de quelques dizaines de nanovolts n'est pas nul, il est négligeable, et ces
deux faits ne se corrigent pas de la même façon.

Le **seuil qui juge** se trace en travers de chaque graphe, en ambre tireté :
une courbe qui monte n'est pas une mauvaise nouvelle en soi, ce qui compte est
de savoir si elle **passe au-dessus de la marge**, et cela ne se lit pas en
comparant deux nombres écrits à deux endroits. Hors échelle, on ne trace rien
plutôt qu'un trait collé au plafond, qui se lirait comme un seuil atteint.

**Ces trois champs sont les seuls du panneau qui ne relancent rien.** Le
serveur ne connaît que des **rapports** — le couplage ne bouge pas d'un pour
cent quand on passe de 3,3 V à 1,8 V —, et l'amplitude ne fait que les
convertir : recalculer trente secondes de matrice S pour une multiplication
serait absurde. Tout le reste du panneau, lui, jette le résultat affiché en le
disant.

#### Trois cases : ce que la figure trace, et dans quelle unité

Trois cases à cocher, collées à la figure — **NEXT**, **FEXT**, **mV** — et
aucune ne relance quoi que ce soit : les deux courbes et les deux unités sont
déjà dans le résultat.

| Case | Décochée |
| --- | --- |
| **NEXT** | le graphe du bruit du bout proche disparaît, **avec le profil d'espacement et les pics recoupés** — ils n'ont de sens que là |
| **FEXT** | le graphe du bout lointain disparaît |
| **mV** | il ne reste que le pour-cent, qui ne dépend que du cuivre |

**Pourquoi éteindre un sens.** Les deux graphes ont chacun **leur échelle** —
le FEXT vaut souvent une fraction du NEXT —, et deux échelles l'une sous
l'autre se comparent mal : on croit lire deux reliefs quand on lit deux zooms.
Quand on suit l'un des deux, l'autre prend la moitié de la hauteur pour rien.
La figure **se resserre** sur ce qui reste plutôt que de garder un cadre vide,
qui se lirait comme un couplage nul.

**Pourquoi éteindre les volts.** Le pour-cent ne dépend que du cuivre ; la
tension le multiplie par une amplitude *saisie*. Qui compare deux dessins ne
veut que le premier — deux chiffres par case et deux graduations par graphe
font alors du bruit sur ce qu'il regarde. Qui prépare une revue de conception
veut le second.

Ce sont des **cases** et non des boutons, à la différence de « peindre » juste
à côté : celui-là est un choix *exclusif* — la couleur du cuivre montre un sens
ou l'autre —, ceux-ci sont indépendants et cumulables.

**Les deux sens peuvent s'éteindre ensemble, et la figure le dit** plutôt que
de disparaître : les cases restent au-dessus du message, les chiffres restent
dans les cases des victimes — c'est eux qui disent si un sens vaut la peine
d'être rallumé —, et la **réglette reste** aussi : elle promène le point blanc
sur le cuivre, où la chaleur est toujours peinte. Une commande qui partirait en
laissant son effet serait pire que la figure vide.

#### Deux étapes zéro, et elles restent deux

On ne désigne que **l'agresseur**. Le reste se cherche, en deux temps qui
restent **deux tableaux** :

- **(a) la présélection géométrique** trouve ce qui longe, avec sa **distance**
  et sa **longueur de parallélisme** mesurées le long du cuivre, arcs
  développés compris — couche de la sélection *et* couches adjacentes, parce
  que deux pistes superposées couplent souvent plus que les mêmes côte à côte.
  Elle est obligatoire : elle borne le nombre de ports du réseau simulé. Elle
  rend aussi, pour chaque candidate, son **profil d'espacement** : la distance
  à l'agresseur *en fonction de l'abscisse*, et non une distance moyenne — une
  piste qui contourne un composant s'écarte puis revient ;
- **(b) la confirmation par simulation** lit NEXT et FEXT de chaque candidate
  et n'en retient que ce qui dépasse un seuil (**−40 dB** par défaut,
  réglable).

**Une piste écartée garde son chiffre — et ses courbes.** Écartée en (a), elle
garde sa distance et sa longueur ; écartée en (b), elle garde son niveau de
couplage **et sa carte** : les deux courbes sont tracées pour toute candidate
qui a une géométrie, confirmée ou non. Une figure vide sous « aucun couple
confirmé » se lit *« aucun couplage »*, alors que le fait est *« du couplage,
sous le seuil que vous avez posé »* — et le seuil, lui, ne se voit pas. Ce qui
reste réservé aux confirmées est ce qui **porte un verdict** : la liste des
victimes, le recoupement pic par pic, les plages peintes sur le cuivre. Une
candidate sous le seuil a donc sa case, marquée *sous le seuil* et éteinte tant
qu'il y a une confirmée à regarder ; quand il n'y en a **aucune**, tout
s'allume, parce que c'est justement là qu'il faut voir ce qu'il y a. C'est ce
qui permet de distinguer une piste **loin** d'une piste **proche et blindée** —
deux situations qui appellent des gestes de routage opposés, et qu'une décision
unique rendrait indiscernables.

#### Les zones à risque, posées sur le cuivre

La carte du panneau range les victimes en lignes sur un axe commun : c'est ce
qu'il faut pour les **comparer**. Devant le dessin, la question n'est plus
« laquelle prend le plus » mais **« quel millimètre de celle-ci dois-je
reprendre »** — et une abscisse en millimètres le long d'un parcours ne répond
pas à ça sans une règle.

Le simulateur rend donc, pour chaque victime confirmée, les **portions du
parcours où son couplage se fabrique** — celles qui dépassent une fraction de
son propre pire point (50 % par défaut, soit −6 dB sous sa crête, réglable) —
et la page les peint **sur le cuivre de cette victime-là**, en surimpression.
Deux couleurs, parce qu'elles ne demandent pas le même geste : **ambre** quand
le dessin des pistes l'explique — ça se corrige en écartant — et **rouge** quand
rien ne l'explique, auquel cas écarter ne servirait à rien.

**La position de la victime n'est jamais reconstruite par décalage latéral**, et
c'est ce qui rend la surimpression fiable. On aurait pu prendre le point du
parcours à l'abscisse *s* et le décaler de l'entre-axes mesuré : il aurait fallu
retrouver exactement la convention de signe du serveur, dans les deux outils, et
un signe inversé aurait posé le trait sur la piste d'en face — visiblement
juste, et faux. On fait l'inverse, qui ne suppose rien : on parcourt le cuivre de
la victime, on le **projette** sur le parcours de l'agresseur, et l'on garde ce
qui tombe dans la plage. Un trou reste un trou — une victime qui contourne un
composant au milieu d'une plage donne deux morceaux, pas un trait qui traverse
le vide.

L'algorithme vit dans `commun/simulation-em.js`, une seule fois ; chaque outil ne
fournit que deux formes neutres en millimètres — le parcours de l'agresseur et
les polylignes d'un net. Deux copies auraient fini par ne plus désigner le même
cuivre sur la même carte.

#### Le profil d'espacement : le témoin indépendant de la carte

Une courbe de couplage seule **ne se vérifie pas** : elle a des pics, ils sont
quelque part, et rien à l'écran ne dit s'ils sont à leur place. C'est le défaut
de toute réflectométrie — la lecture est plausible quoi qu'il arrive.

Le profil d'espacement vient de la **géométrie** et non du calcul
électromagnétique : les deux ne peuvent pas se tromper de la même façon. Il se
superpose à la carte, en trait clair sur la ligne de sa victime, **axe
inversé** — il monte quand les deux pistes se rapprochent, pour qu'un
resserrement se lise au même endroit et dans le même sens qu'un pic. Là où il
s'interrompt, la victime ne longe pas.

Un pic doit tomber là où quelque chose *change* entre les deux pistes : un
longement qui commence, un resserrement, un écartement. Un pic là où
l'espacement est **large et constant** n'est pas expliqué par le dessin des
pistes, et il est signalé — sauf si une zone de vigilance du plan de référence
tombe à la même abscisse, auquel cas ce n'est plus un désaccord mais son
**explication**, et les deux verdicts sont distingués parce qu'ils n'appellent
pas le même geste : reprendre le blindage, ou aller regarder. La règle est
volontairement prudente et ses deux seuils sont réglables : une alerte qui se
déclenche à tort ferait ignorer toutes les autres.

**Ce qui cesse d'être une anomalie : l'écart entre deux victimes symétriques.**
Un agresseur équidistant de ses deux voisines *à tout instant* est l'exception,
pas la règle — il suffit qu'il contourne un composant d'un côté. L'écart reste
affiché ; il n'est **alerté** que lorsque les profils d'espacement sont
comparables et que les couplages, eux, ne le sont pas — auquel cas il désigne
une dissymétrie du plan.

#### Ce qui ne se devine jamais en silence

- **la vitesse de chaque piste**, calculée séparément depuis l'empilage ou
  saisie à la main, **jamais supposée égale** à celle de l'agresseur ;
- **la bande**, dont les deux bouts ne disent pas la même chose : le bas fixe la
  fenêtre temporelle — ce qui met plus longtemps à revenir se replie au début de
  la carte —, le haut fixe la résolution spatiale. Elle part du continu **par
  construction**, puisque c'est le simulateur qui choisit où échantillonner ;
- **une bande qui s'arrête bien avant le front annoncé**, et c'est le silence le
  plus trompeur de l'outil. Le couplage **croît avec la fréquence** tant que la
  liaison est courte devant la longueur d'onde, à raison d'environ **6 dB par
  octave** : analysée jusqu'à 100 MHz, une liaison de 30 mm rend des décibels
  vingt à trente dB sous ce que la **même** géométrie donne au genou d'un front
  de 25 ps, et le verdict devient « aucun couple confirmé » *par construction*.
  Quand le haut de bande est plus de deux fois sous le genou du front saisi, la
  fiche le dit comme une **réserve** — avec les deux fréquences, l'écart en
  octaves, et le geste : cocher « déduite de la carte », ou monter la bande ;
- **la résolution spatiale**, affichée à côté du résultat. Deux pics plus
  proches que cette valeur sont un seul pic, quelle que soit la finesse de la
  courbe à l'écran ; le zero-padding interpole, il ne distingue pas. Une
  résolution **voulue** se saisit : la fiche dit alors jusqu'à quelle fréquence
  il faudrait monter pour l'atteindre — ce sur quoi on peut agir, là où « la
  carte est floue » ne se corrige pas ;
- **le couplage vertical**, entre deux pistes superposées de couches voisines,
  **n'est pas modélisé** : le solveur de section range ses conducteurs côte à
  côte et ne sait pas les empiler. Ces pistes ressortiraient au plancher, ce qui
  est le contraire de la réalité sous un empilage mince — la fiche le dit plutôt
  que de les rendre « électriquement découplées », et leur distance mesurée
  reste au tableau de l'étape (a) ;
- **dans la visionneuse, la portée des perçages est LUE quand le fichier la
  déclare, et supposée traversante sinon.** IPC-2581 la porte sur le calque de
  perçage — `<Layer layerFunction="DRILL"><Span fromLayer toLayer/>` —, que le
  padstack désigne par le `layerRef` de son `<LayerHole>` ; le parseur la suit
  depuis le 2026-09-03. Un export qui ne la déclare pas laisse ses trous
  supposés traversants, et là un via enterré compté comme traversant fait
  passer pour refermé un retour qui ne l'est pas : le contrôle des changements
  de couche est **optimiste pour ceux-là**, et la note du document ne parle
  plus que d'eux. Rien n'est deviné d'après un nom de calque : une portée
  devinée à tort coupe un chemin réel, ce qui est bien pire. L'éditeur PCB, qui
  connaît la portée de ses vias, n'a jamais eu cette limite.

#### Les deux outils, et ce qui les sépare

L'onglet existe **dans l'éditeur PCB et dans la visionneuse IPC-2581** : c'est
le même panneau, le même serveur et le même calcul. Seule change la façon dont
la page mesure les trois choses que le serveur ne peut pas deviner — positions
des vias de couture sur l'abscisse du parcours, discontinuités du plan sondées
sous la piste, perçages de masse aux changements de couche. L'éditeur les lit
dans ses propres objets ; la visionneuse les mesure sur une carte livrée, où le
plan est un contour et où un perçage ne déclare sa portée que si l'exportateur
a écrit le `<Span>` de son calque.

La **fenêtre** est réglable — Kaiser (défaut, β réglable), Hann, rectangulaire —
et le compromis est dit à chaque fois : la rectangulaire donne la meilleure
résolution et un ringing de Gibbs qui fabrique des lobes se lisant comme des
zones de couplage inexistantes ; Kaiser 8,6 les écrase au prix d'un pic environ
2,9 fois plus large. La résolution annoncée tient compte de cet élargissement.

#### Le plan de masse est à côté, jamais dedans

Le blindage d'un plan continu et de ses vias est **déjà dans les paramètres S** :
la section droite de chaque bloc est résolue *avec* son plan de référence et ses
écarts au cuivre de masse. Le modéliser une seconde fois le compterait deux
fois. Ce que le panneau ajoute sont des **causes** possibles, superposées à la
carte en bandes hachurées :

- le **pas de couture** le long du parcours, comparé au plus sévère de deux
  seuils — λ/10 au haut de la bande analysée, et le trou au-delà duquel le
  cuivre latéral cesse d'être tenu au temps de montée ;
- les **discontinuités du plan de référence** sous le parcours, sondées couche
  par couche ;
- les **changements de couche sans via de masse** à portée.

Un pic de couplage à la même abscisse qu'un trou de couture n'est plus un
mystère, c'en est l'explication. Et **quand la page n'a pas pu regarder, elle le
dit** : une liste vide de zones se lirait « rien à signaler », ce qui est
exactement le contraire.

#### Ce que la carte ne peut pas faire

La ligne **FEXT ne localise rien quand les deux vitesses sont égales**. Le bruit
avant co-propage avec l'agresseur : ce qui se couple en *x* arrive au bout
lointain à `τ_a(x) + (τ_v(L) − τ_v(x))`, une somme qui ne dépend plus de *x* dès
que les deux pistes vont à la même vitesse. Tout arrive au même instant, et
aucune transformée ne sépare ce qui s'est superposé. La ligne montre alors la
longueur électrique de la liaison, et **la fiche le dit à chaque fois** — une
ligne qui ne localise rien ressemble exactement à une ligne qui localise. Elle
se met à localiser en milieu inhomogène, c'est-à-dire sur un microruban et
jamais sur une triplaque ; la ligne **NEXT**, elle, localise dans les deux cas.

#### Sorties

Les **zones à risque peintes sur le cuivre des victimes**, portion par portion ;
la figure elle-même — les **deux courbes** (NEXT puis FEXT, une par victime,
sur le même axe), et une **réglette** qui les traverse ; la **chaleur du
couplage peinte le long du cuivre** de chaque victime, du bleu au rouge, et le
**point blanc** de la réglette qui s'y promène, sur la vraie piste du design,
au même millimètre que sur les courbes. C'est lui qui recoud « ce pic-ci » et
« ce millimètre-là de cette piste » — un schéma de piste dans le panneau était
un doublon du dessin et laissait la correspondance à faire de tête. L'axe
commun est la moitié de l'intérêt : un pic à la même abscisse sur deux victimes
désigne un accident du plan, un pic sur une seule désigne le tracé de cette
victime-là. Une **case par victime** l'allume ou l'éteint partout à la fois,
courbes, chaleur, point et plages — y compris celles qui sont **sous le seuil**,
marquées comme telles et éteintes par défaut tant qu'une confirmée reste à
regarder. Le profil d'espacement et les zones de vigilance restent superposés
aux courbes ; le bouton **« réglages »**, au bout de la rangée des onglets,
replie les commandes pour laisser toute la hauteur aux résultats — la rangée qui
porte le bouton d'action, elle, ne se replie jamais ;
le **`.csv`** des données brutes — position, amplitude **et tension**,
**espacement mesuré**, la zone de vigilance de chaque position et les pics
recoupés — pour recouper avec le layout ; le **`.sNp`** du réseau synthétisé, ports nommés en en-tête ; et le
**`.json`** du problème, rejouable. Chaque **pic non justifié** est nommé avec
son abscisse, et chaque écart entre deux victimes du même agresseur est rendu
avec ce que la géométrie en dit.

### La bande se déduit du dessin

**Deux grandeurs indépendantes, et on les confond tout le temps.** Le **haut de
bande** fixe la **résolution** : deux couplages séparés de moins de
`W·v / (4·f_max)` — pour le NEXT, `W` étant l'élargissement dû à la fenêtre —
sont une seule tache. Le **pas fréquentiel** fixe la **fenêtre temporelle**
`T = 1/Δf`, donc la longueur au-delà de laquelle ce qui se couple *revient se
poser* au début de la carte par repliement. Ajouter des points à bande
constante allonge la fenêtre et **ne change pas la résolution d'un cheveu** —
l'erreur coûte cher dans les deux sens : on ajoute des points en espérant un pic
plus fin, et l'on garde une bande trop étroite pour le voir.

**La case « déduite de la carte »** calcule les deux depuis la géométrie, les
écrit dans les champs — ils restent corrigeables — et dit ce qu'elle a fait.
Trois mesures les fixent :

- le **plus court longement** donne ce qu'il y a de plus fin à montrer : une
  portion plus courte que la résolution ne se lira pas comme un motif. Trois
  échantillons en travers, et c'en est un ;
- la **longueur du parcours** donne l'aller-retour, donc la fenêtre minimale,
  donc Δf, donc le nombre de points ;
- l'**épaisseur du diélectrique** pose le plafond, et c'est la borne la plus
  importante des trois : au-delà de λ/10 dedans, la section droite quasi-TEM ne
  décrit plus la ligne. Monter la bande au-delà affine la carte **en apparence**
  et la fabrique en réalité.

La fiche nomme **laquelle des trois a mordu**, parce que c'est elle qui dit quoi
changer. *Plafonnée par le modèle* veut dire qu'aucun réglage n'affinera
davantage sans mentir ; *plafonnée par les points* veut dire qu'on a préféré une
carte floue à une carte repliée — une carte floue est honnête, une carte repliée
fabrique des pics qui n'existent pas et rien à l'écran ne les distingue des
vrais.

Sur une liaison de 40 mm dont la victime ne longe que 8 mm, cela donne
**44,7 GHz × 34 points** : 2,67 mm de résolution, fenêtre à 1,5 fois
l'aller-retour, pas de repliement. Sur 120 mm avec un longement de 12 mm,
**29,7 GHz × 67 points** — même finesse relative, plus de points parce que le
parcours est plus long.

### Le verdict, et le rapport

**Quatre choses à l'écran : le verdict, ce qu'il y a à faire, ce qui rend le
résultat douteux, la carte.** Le reste — les deux tableaux de l'étape zéro, le
recoupement, la validation de la matrice, le plan de référence, les ports, les
hypothèses — est là, replié. Une fiche qui déroule tout met la matrice non
passive et un écart de vitesse de 0,3 % sur la même ligne, et se lit alors en
diagonale, c'est-à-dire pas du tout.

**La carte porte au-dessus d'elle de quoi la lire** — deux courbes par
victime, l'axe est le parcours de l'agresseur, et la couleur peinte sur le
cuivre est la quantité de couplage qui se fabrique là. Une figure qu'on doit
déplier pour comprendre est une figure qu'on ne lit pas. **Une carte
de chaleur montre OÙ, jamais COMBIEN** : c'est la réglette qui répond « et ici,
ça fait combien », victime par victime et pour les deux sens à la fois — le
NEXT au bout proche, le FEXT au bout lointain, jamais additionnés puisqu'ils
n'arrivent pas au même point. Et **la méthode tient en une ligne**, sous le verdict, avec
les chiffres de *ce* calcul-ci : le dessin des pistes → un réseau de lignes
couplées mis en cascade le long du parcours → sa matrice S multi-ports (du
continu à f_max, N points) → transformée de Fourier inverse (fenêtre) de ses
termes croisés → le retard converti en position par la vitesse de chaque tronçon
(NEXT : `t = τa+τv` ; FEXT : `t = τa(x) + τv(L) − τv(x)`, plate à vitesses
égales). C'est elle qu'on relit quand un chiffre surprend,
et c'est dans cet ordre que se cherche l'erreur.

**Des hachures qui recouvrent tout ne se peignent pas.** Quand les zones de
vigilance couvrent plus de la moitié du parcours, les superposer à la carte
revient à hachurer la figure entière : le motif ne désigne plus rien et détruit
ce qu'il recouvre. La légende dit alors pourquoi elles ont disparu — c'est la
même règle que le verdict « expliqué par le plan », qui cesse de rien dire dans
exactement le même cas.

**Chaque chose tient sur une ligne, sa version longue attend dessous.** Une
réserve en soixante mots n'est pas lue, et une réserve non lue vaut une réserve
absente — le défaut même que toute cette section cherche à ne jamais produire.
Le serveur rend donc chaque réserve en DEUX longueurs : un titre qui dit le
fait (« la carte ne localise rien : 11,8 mm de résolution pour 40 mm de
liaison »), et le texte qui dit pourquoi cela compte et quoi en faire. Le
premier s'affiche, le second se déplie, et le fichier exporté garde les deux.
La légende de la carte suit la même règle : la résolution reste à découvert —
sans elle on lit la figure au dixième de millimètre —, le mode d'emploi se
replie.

**« À faire » est la seule partie qui se lit comme une consigne**, et elle
n'ajoute aucun calcul : chaque ligne est une relecture de ce qui a déjà été
mesuré, tournée du côté de la main. *Écarter VIC de 12,4 à 18,0 mm* ; *coudre
le plan de 5,4 à 17,1 mm* ; *aller voir SW_2 de 30,0 à 33,0 mm*. L'ordre est
celui de l'**effet**, pas celui de la gravité : écarter une piste sous un pic
que le dessin n'explique pas ne changerait rien, et ces plages-là passent donc
après le plan de référence, qui en est la cause probable. Elle vit côté serveur,
pas dans la page : le fichier exporté et la fiche doivent dire la même chose, et
deux listes écrites à deux endroits auraient fini par diverger. Une liste vide
est une réponse — le couplage est réparti sur tout le longement sans point
chaud, il se corrige en écartant partout.

**Le niveau se lit contre VOTRE budget, pas contre un barème maison.** Un
couplage en décibels *est* un rapport : −26 dB valent 5 % de l'agresseur, et
cela ne demande de connaître ni l'amplitude ni la technologie. La seule
convention est celle de la rangée **Signal** du panneau — un budget en pour
cent, ou une **marge de récepteur en millivolts** qui le remplace —, et la fiche
dit lequel des deux elle applique. Trois niveaux — **sous le budget**, **à surveiller** (au-delà de la
moitié), **au-dessus du budget** — plus un quatrième qui n'en est pas un :
*aucun couple confirmé* est un constat, pas un bon résultat, et il ne se peint
pas en vert.

**Le verdict porte ses réserves.** Les avertissements qui changent la lecture —
matrice non passive, fenêtre qui replie, carte qui ne localise rien, zones de
vigilance partout, pire point hors bande du signal — sont marqués **par le
serveur**, au moment où il sait pourquoi ils comptent ; la page ne les reconnaît
pas à leur texte, ce qui aurait fini par en manquer un. Ils s'affichent sous le
verdict, et le niveau s'écrit alors « sous réserve ».

**Le bouton `rapport`** écrit tout dans un fichier texte, et il se lit en deux
temps. Les quatre premières sections — verdict, à faire, réserves, réglages —
tiennent sur un écran et répondent seules aux trois questions qu'on se pose :
*y a-t-il un risque*, *qu'est-ce que je reprends*, *de quoi dois-je me méfier*.
Ce qui suit, ce sont les **pièces** : les deux tableaux de l'étape zéro, le
recoupement pic par pic, les plages peintes, la validation de la matrice, le
plan de référence, les ports, les hypothèses. On n'y descend que pour contester
un chiffre du haut, ou pour relire le dossier six mois plus tard — et c'est
exactement pour ces deux moments-là que le fichier existe.

Texte brut, délibérément : il se colle dans un courriel ou un ticket, et se
compare d'une version à l'autre avec n'importe quel outil de diff — ce qu'aucun
PDF ne permet. Les réglages y sont écrits : sorti de la page, un rapport qui ne
dit pas sous quelles règles il a été produit n'est plus vérifiable.

### Ce que la fiche refuse de conclure

Trois choses peuvent rendre un résultat **exact et trompeur**, et c'est le pire
cas pour cet outil. Elles sont dites plutôt que subies.

**Une coïncidence certaine d'avance n'explique rien.** Un pic que le dessin des
pistes ne justifie pas est dit « expliqué par le plan » quand une zone de
vigilance tombe à la même abscisse. Encore faut-il que cette rencontre ait pu
ne pas avoir lieu : le seuil de pas de couture se déduit du **haut de bande**,
on monte le haut de bande pour affiner la carte, le seuil tombe au dixième de
millimètre, et le parcours entier devient une zone de vigilance. Chaque pic y
tombe alors — forcément —, et le verdict s'est rendu tout seul. La fiche mesure
donc l'**union** des zones (les deux côtés du parcours sont regardés séparément,
et les additionner annoncerait couramment plus de cent pour cent) : au-delà de
la moitié du parcours couverte, le verdict devient **indécidable**. Ce qui reste
vrai est écrit — le dessin des pistes n'explique pas ce pic —, ce qui n'est pas
établi l'est aussi.

**Les décibels disent de quelle bande ils parlent.** Le niveau de l'étape 0b est
un maximum sur *toute* la bande analysée, et la bande analysée se règle pour la
**résolution spatiale** : elle n'a aucune raison de s'arrêter où le signal
s'arrête. Quand un temps de montée est saisi, la fiche donne donc la fréquence
du **pire point** et le couplage **sous le genou** du front (0,35 / t<sub>r</sub>).
Un couplage annoncé à −13 dB qui n'existe qu'à 80 GHz sur un front de 9 ns est
exact, et trompeur. Quand la grille n'a aucun point utile sous le genou — le cas
ordinaire dès qu'on monte la bande —, la fiche le dit au lieu de lire le zéro du
continu et de l'annoncer comme une mesure.

**Le seuil de couture dit de quelle règle il sort.** Deux règles s'appliquent —
le front et λ/10 dans la bande analysée —, la plus sévère gagne, et la fiche
écrit ce que l'autre aurait donné *quand les deux diffèrent*. Quatorze alarmes
de couture qui apparaissent sans que le cuivre ait bougé viennent d'un champ du
panneau, pas du dessin ; sans cette ligne, on les cherche dans le cuivre.

**Une plage qui ne localise rien ne se peint pas.** Quand la résolution
spatiale dépasse le quart du parcours, la plage couvrirait le tracé entier *en
ayant l'air de désigner un endroit* : on irait chercher sur le cuivre un
millimètre que le calcul n'a jamais su nommer. Un trait ambre sur toute la piste
est plus trompeur que pas de trait du tout, alors il n'y en a pas — mais le
bouton **ne disparaît pas en silence** : sa place porte « sur le cuivre : rien à
peindre » et, en infobulle, la raison chiffrée. Une commande absente est un bug
aux yeux de qui s'en servait la veille.

**Rien ne s'agrège.** Deux victimes d'un même agresseur sont deux nets, chacun
avec son budget : une victime *additionne* ses agresseurs, un agresseur
n'additionne pas ses victimes. La seule somme offerte est celle de plusieurs
agresseurs **en phase** vers une victime — le cas d'un bus qui commute d'un
bloc — et elle ne se fait que sur demande explicite.

43 cas au banc Python ([python/test/banc-crosstalk.py](../python/test/banc-crosstalk.py)),
49 au banc de l'éditeur : la ligne adaptée contre `S₁₁ = 0` et
`S₂₁ = exp(−jβL)` à la précision machine, la cascade contre la ligne entière,
**le pic de NEXT qui tombe là où le longement commence** — c'est le seul cas qui
vérifie l'axe lui-même, et un facteur deux oublié y mettrait le pic à la
moitié —, le `.sNp` exporté relu par un lecteur écrit dans le banc, qui ne
partage aucune ligne de code avec l'écrivain et vérifie d'un coup l'ordre des
rangées et la table des ports, et le recoupement carte ↔ géométrie **dans les
deux sens** : il doit signaler un pic que rien ne resserre, et surtout ne
**rien** signaler sur un longement franc.

### Lire la courbe

Deux traces : **S₁₁** (ce que le port d'entrée réfléchit) et **S₂₁** (ce qui
passe). S₁₂ n'est pas tracé — le modèle est réciproque, il vaut S₂₁ — et S₂₂
non plus : sur une piste de largeur constante il égale S₁₁ et viendrait le
masquer. Quand la liaison est dissymétrique, l'écart S₂₂ − S₁₁ est signalé sous
la courbe, et les deux sont dans le `.s2p`.

**Au survol**, la courbe donne la fréquence, les deux modules en décibels, le
ROS et surtout **l'impédance vue par le port** — Z = Z_réf(1+S₁₁)/(1−S₁₁), en
complexe. C'est ce qu'un circuit d'attaque trouverait devant lui : sur une
piste de 61 Ω lue à travers 50 Ω, le quart d'onde affiche 73,8 − j0,2 Ω, très
exactement le Z₀²/Z_réf = 74,7 Ω du transformateur quart d'onde. La lecture se
cale sur le point **calculé** le plus proche, jamais sur une interpolation.

Si le pas de la bande est trop large pour la ligne — moins de vingt points par
période de résonance —, le panneau le dit et propose un nombre. Ce n'est pas
cosmétique : sur une piste de 28,7 mm, 21 points **ratent** le creux de S₁₁ et
l'annoncent à −33 dB au lieu de −39,5.

### Le panneau se range en SI et PI

Deux familles d'analyse : **SI**, intégrité du signal — ce qu'un front devient
en parcourant le cuivre — et **PI**, intégrité de l'alimentation — ce que le
réseau de distribution laisse passer. SI porte **Impédance**, **Z
différentielle**, **Crosstalk** et **Current Return Path** ; PI
porte **Chute DC**. Le découpage avait été posé quand il n'y avait qu'une
analyse, parce qu'il coûtait moins cher à poser qu'à retailler ensuite autour
de six. Ce qu'il resterait à y mettre est listé dans
[A-FAIRE.md](../A-FAIRE.md).

Changer de famille n'efface pas le résultat : la carte de chaleur s'éteint —
elle appartient à l'analyse d'impédance et n'a rien à dire sous un autre onglet
— et revenir la rallume telle quelle, sans recalcul.

### Deux modes, et ils ne répondent pas à la même question

Cliquer une piste donne son impédance tout de suite, sans serveur : c'est
`ltZ0()`, Hammerstad-Jensen avec la correction d'épaisseur de Wheeler, la même
expression dans les deux outils. Le panneau « Simulation EM » passe, lui, par
le solveur de section. Sur un microruban courant les deux s'accordent à **0,2 %**
— l'aperçu n'est pas une version dégradée, c'est la même physique par un chemin
plus court. Ils divergent là où la formule sort de son domaine : triplaque
décentrée, piste interne couverte, section inhabituelle. **C'est le désaccord
qui informe**, et c'est pourquoi les deux existent.

### Pourquoi pas l'onde complète, et ce qui tient `mom_solver/` à l'écart

Le paquet `mom_solver/` vise la 2,5D pleine onde : maillage triangulaire,
fonctions de base RWG, matrice d'impédance, paramètres S. Il n'est pas dans le
chemin de calcul, et rien de la simulation n'en dépend — pas même pour
démarrer. Mais la raison a changé, et il faut la dire à jour.

**Son noyau est désormais juste, et mesuré.** La formulation est la MPIE
complète, terme de potentiel scalaire compris ; les deux potentiels ont chacun
leur fonction de Green — c'était le défaut principal, et il pesait 26 % sur
ε_eff ; les images complexes sont ajustées par un vrai GPOF à deux niveaux sur
la Green spectrale exacte du milieu stratifié, et non posées sur des
constantes. 56 essais le mesurent, dont la comparaison d'ε_eff contre
`ligne_mom` : **0,49 %** — deux méthodes qui ne partagent aucun code tombent
sur le même chiffre, ce qui est un certificat de validité et non un concours
de précision.

**Ce qui le tient à l'écart est le MODÈLE DE PORT.** Un port de microruban est
une tension entre la piste et le plan de masse : il demande un courant
**vertical**, donc un via. Le port actuel est une coupe complète du
conducteur, c'est-à-dire une fente **en série** — elle ne couple au mode guidé
que sur une ligne longue devant la longueur d'onde, et c'est mesuré
(|S₂₁| = 0,007 à L/λ_g = 0,07, 0,540 à 1,50). Tant que ce port n'existe pas,
|S₂₁| mesure le couplage de la fente et non la ligne.

Le détail, les mesures et le cas de non-régression à viser sont dans
[A-FAIRE.md](../A-FAIRE.md). Le jour où ce port sera là, le moteur apportera ce
que le modèle de ligne ne peut pas donner — les coudes réels, les résonances,
le rayonnement, le couplage entre pistes non parallèles — et les deux se
compléteront.

