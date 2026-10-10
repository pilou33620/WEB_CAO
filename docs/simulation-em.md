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
du couplage au **niveau 2** — le pic de bruit relatif de chaque victime,
k_total, NEXT et FEXT en pour-cent de l'agresseur et en décibels, statut vert /
orange / rouge, pour la piste sélectionnée ou pour toute la carte —, et **où**,
le long du parcours, le NEXT se fabrique. Voir
[Crosstalk](#crosstalk--le-niveau-2-scan-normalisé), plus bas.

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
python web_CAO.py
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
chaque exécution (`python/test/banc-ligne-mom.py`) :

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

### Crosstalk : le niveau 2, scan normalisé

**La question : quel pic de bruit relatif une piste victime subit-elle, sans
connaître ni la tension réelle du signal ni le protocole ?** La réponse se lit
en **pour-cent de l'amplitude de l'agresseur**, et en décibels. Un onglet
*Diaphonie* rendait autrefois un chiffre par longement sans dire où ; une
analyse « électrique » (matrice S multi-ports, transformée de Fourier, bande,
fenêtre, volts contre un budget) l'a ensuite remplacé. Les deux sont
**retirés** : l'onglet ***Crosstalk*** ne fait plus que le niveau 2, qui est
l'analyse géométrique complétée par un front.

#### Les hypothèses de départ

- **Tension normalisée** : l'agresseur fait un échelon unitaire (1 V, 100 %).
- **Temps de montée de référence `t_r`** : celui de la **piste sélectionnée** —
  saisi, ou, champ vide, déduit de la **classe** de son net (Horloge 2 ns,
  Rapide 1 ns, RF 100 ps, Analogique 100 ns, Lent 10 ns, Découpage 5 ns ; les
  fronts du tableau des classes de la vérification de carte, et 1 ns si la
  classe n'est pas connue) — ou un **`t_r` global**, 1 ns par défaut, quand on
  scanne **toute la carte**.
- **Lignes adaptées** à leurs deux bouts sur leur Z0 : on évalue le couplage
  direct, sans allers-retours de réflexions.

#### Les grandeurs d'entrée

La coupe de chaque **bloc** du parcours — une portion où les voisines et leurs
écarts ne changent pas — est résolue par la méthode des moments
(`python/ligne_mom.py`) à partir du design (IPC-2581 ou éditeur PCB) : **[C]**
et **[L]**, soit C11 (la diagonale de Maxwell, capacité totale), L11 et les
mutuelles Cm, Lm. La vitesse est `v = c0 / √ε_eff` avec `ε_eff = C11 / C11(vide)`
— égale à `1/√(L11·C11)` pour une ligne seule, sans le biais que ce produit de
deux diagonales prend dès qu'il y a couplage. **T_d** est le retard de la
victime le long du **couplage**, sommé bloc par bloc.

Deux pistes **superposées** sur des couches voisines sans plan entre elles sont
résolues à part — deux rubans à leurs hauteurs, entre les plans qui encadrent
la paire (`ligne_mom.section_deux_niveaux`), milieu homogène donc Kf nul —,
comptées dans le NEXT de la paire, et placées sur la carte locale à l'abscisse
où la victime passe sous (ou sur) l'agresseur.

#### Les formules

| grandeur | formule |
| --- | --- |
| couplage géométrique pur | `k_total = ½ (Cm/C11 + Lm/L11)` |
| NEXT saturé | `Kb = k_total / 2` |
| NEXT, `2·T_d ≥ t_r` (longement long) | `NEXT = Kb` |
| NEXT, `2·T_d < t_r` (longement court) | `NEXT = Kb · 2·T_d / t_r` |
| FEXT | `FEXT = |Kf| · T_d / t_r`, avec `Kf = ½ (Lm/L11 − Cm/C11)` |

Quand l'écart varie le long du longement, chaque bloc compte pour son propre
Kb : `NEXT = min(Kb_max, Σ Kb·2·dT / t_r)`, ce qui redonne exactement les deux
cas ci-dessus pour un couplage uniforme. En stripline homogène,
`Cm/C11 = Lm/L11` et le FEXT s'annule ; en microruban, la différence de vitesse
entre les modes pair et impair donne un FEXT bien réel.

#### Les pertes R et G (option)

La case **pertes R, G** (rangée *Statut DRC*, et la même dans la
vérification de carte) ajoute les pertes de la ligne au niveau 2 : la
résistance du cuivre par effet de peau (R) et la conductance du diélectrique
par tan δ (G), évaluées au **genou du front** `f = 0,35 / t_r`
(`ligne_mom.line_losses_detaillees`), soit une atténuation α par mm, bloc par
bloc. La contribution de chaque bloc au NEXT, qui fait l'aller et le retour
jusqu'à x, est pondérée par `exp(−2·A(x))` (A, l'atténuation cumulée depuis la
source) ; le FEXT, qui co-propage sur toute la liaison, par `exp(−A(L))`.
**Les pertes ne font qu'ôter du bruit** : elles sont coupées d'office, et le
niveau 2 sans pertes reste le pire cas normalisé. Leur effet mesuré, sur des
microrubans FR-4 de 0,2 mm : à 1 ns, −2 % à −10 % du FEXT de 50 à 150 mm, le
NEXT saturé presque inchangé ; à 100 ps, jusqu'à −45 % sur les longs
longements. Elles comptent donc pour les fronts raides et les liaisons
longues, à peine pour le reste.

#### La somme des agresseurs

Une victime longée par **plusieurs** agresseurs reçoit leur bruit à tous. La
liste **Σ agresseurs** choisit comment il se compose, NEXT et FEXT chacun de
leur côté :

- **en phase** (d'office) : la somme arithmétique — tous les agresseurs
  basculent ensemble, le pire cas ;
- **quadratique** : la racine de la somme des carrés (*power sum*) — des
  agresseurs indépendants, ce que rend un scanner comme SIwave en mode RSS.

La somme a son propre statut, aux mêmes seuils, et **le statut de la paire
la compte** : une victime qu'aucun agresseur ne met seul en orange peut y
passer avec tous. La fiche la donne en colonne « Σ agresseurs », le rapport
et le `.csv` aussi ; toute la carte en dresse le tableau, victime par
victime.

#### Ce que l'outil rend, paire par paire

| métrique | unité | signification |
| --- | --- | --- |
| `k_total` | sans unité (affiché en %) | couplage géométrique pur, au bloc le plus serré |
| NEXT | % et dB | tension relative maximale renvoyée vers la source |
| FEXT | % et dB | pic relatif reçu au récepteur distant |
| statut DRC | vert / orange / rouge | vert < 3 %, orange de 3 à 7 %, rouge > 7 % — par métrique, et la paire prend le pire des deux |

Les deux seuils se règlent (rangée **Statut DRC**) et sont **les mêmes** que
ceux de la vérification de carte : changer un seuil re-juge la fiche sans
relancer le calcul. À côté du tableau : T_d, la saturation (et le front sous
lequel elle se produit), le longement, l'écart et la couche.

#### Deux portées, le même calcul

- **Analyser la piste** (`python/crosstalk.py`, route `/api/crosstalk`) : on
  sélectionne l'agresseur, ses voisines sont trouvées seules — la
  **présélection géométrique** (étape 0a, distance et longement mesurés, règle
  3W/3H) puis la **confirmation** (étape 0b : pire du NEXT et du FEXT au-dessus
  de −40 dB) restent deux tableaux distincts, pour distinguer une piste *loin*
  d'une piste *proche et blindée*. La fiche donne le tableau niveau 2 et la
  **carte locale**.
- **Toute la carte** (`python/analyse_carte.py`, règle `diaphonie`) : chaque
  paire de pistes voisines de la carte, sous le `t_r` global, avec les mêmes
  formules et les mêmes seuils. Le tableau montre d'office les paires orange et
  rouges (une case affiche aussi les vertes) ; un clic sur une ligne centre la
  vue sur la paire.

#### La coloration sur le layout

Les deux portées se **peignent sur le cuivre** de l'éditeur PCB comme de la
visionneuse IPC-2581, aux **couleurs du statut DRC** — vert, orange, rouge,
aux seuils courants (changer un seuil re-peint sans relancer) :

- la piste analysée : chaque victime, le long de son cuivre, à la couleur de
  son NEXT local **borné par le NEXT de la paire** — une crête courte ne
  peint pas en rouge une paire que le niveau 2 juge orange ; une abscisse
  sans couplage ne se peint pas ;
- toute la carte : la portion de chaque victime qui fait face à son
  agresseur, à la couleur du statut de la paire, les rouges par-dessus. Les
  vertes ne se peignent qu'avec « montrer aussi les paires vertes » ; la case
  « colorer sur le layout » éteint le tout.

#### La carte locale : où le NEXT se fabrique

Pour la piste sélectionnée, une courbe par victime le long du parcours de
l'agresseur : le **NEXT local** `Kb(x) · min(1, 2·T_d/t_r)`, c'est-à-dire le
NEXT qu'aurait la paire si tout son longement couplait comme à cet endroit. Son
maximum est le NEXT de la paire quand le couplage est uniforme. Les seuils DRC
y sont tracés en tirets, les zones de vigilance du plan de référence en
hachures, et la même grandeur se **peint sur le cuivre** des victimes ; les
**zones à risque** (au-delà de 50 % du pire point de chaque victime, réglable)
désignent les millimètres à reprendre, et la liste **« À faire »** les traduit
en gestes. Le FEXT n'a pas de carte : il co-propage avec l'agresseur, et tout
ce qui se couple le long du longement arrive au même instant au bout lointain.

#### Le plan de masse est à côté, jamais dedans

Le blindage d'un plan continu et de ses vias est déjà dans [C] et [L]. En
parallèle, la fiche contrôle le pas de couture (λ/10 au genou du front), les
fentes du plan sous le parcours et les changements de couche sans via de masse
à portée. Une piste de garde ou un plan arrosé dont la couture dépasse le seuil
est posé **flottant** dans la coupe — il ne blinde pas, il transfère. Un bloc
dont la section n'est pas résoluble (plan absent) n'est **pas** compté comme
découplé : la voisine est dite *non calculée*, et le niveau rendu est un
plancher.

#### Sorties

`.csv` (le tableau niveau 2, puis la carte locale position par position avec
l'espacement mesuré), `.json` (le problème, rejouable), **rapport** texte
(statut, tableau, gestes, réserves, présélection, plan de référence,
hypothèses) et, pour toute la carte, le `.csv` de toutes les paires.


### Le moignon d'un via, et son contre-perçage

Le via d'une transition est un π L-C, avec un **moignon** en dérivation à
chaque bout que le signal n'emprunte pas (`_moignons`, `python/simulation_em.py`) :
la portée percée (`layer_from`, `layer_to`) moins les couches de départ et
d'arrivée, en épaisseur d'empilage, avec sa résonance quart d'onde.

Un via **contre-percé** (*back-drill*, règles de l'empilage de l'éditeur PCB,
ou `<Spec><Backdrill>` d'un fichier IPC-2581 lu par la visionneuse) envoie en
plus, dans sa fiche :

    "contre_percage": {"cote": "dessous" | "dessus",
                       "couche_garde": <indice d'empilage de la couche à ne pas couper>,
                       "moignon_residuel_mm": 0.15}

Le moignon de ce côté va alors de la couche empruntée à la pointe du foret —
`moignon_residuel_mm` sous (ou sur) la couche gardée —, jamais plus loin
qu'avant ; sa fiche porte `contre_perce`, et `moignons.contre_percage` vaut
`"applique"`. Un contre-perçage qui couperait une couche empruntée n'est pas
compté (`"ignore"`, et un avertissement le dit). Sans le champ, rien ne change.
L'éditeur compte parmi les couches empruntées celles où une **zone** du net
touche le fût (liaison directe ou thermique, pas un dégagement) : un foret qui
la couperait est une faute au DRC, et ce via ne part pas contre-percé. La
visionneuse IPC-2581 n'envoie le champ qu'avec la **portée percée** déclarée
par le fichier (`layer_from`, `layer_to`), sans laquelle rien ne se soustrait ;
avec l'option « Portée percée de tous les vias déclarés » de son panneau
(désactivée par défaut), elle envoie aussi la portée des vias qui ne sont pas
contre-percés, et leur moignon est chiffré au lieu de rester « inconnu ».
La vérification de la carte lit la même chose dans le `cp` d'un perçage (voir
[verification-carte.md](verification-carte.md#moignons-de-vias)).


### Pertes, diélectrique causal, via en ligne (`simulation_em` 5.0.0)

`ligne_mom` 2.7.0 sait la hauteur, la topologie, la rugosité et le
diélectrique causal (`line_losses`), et poser le via en tronçon de ligne
(`abcd_via_ligne`). La 5.0.0 de `simulation_em` les branche : cascade simple,
cascade différentielle (donc l'**œil**, qui passe par `simuler`), **RF**
(`rf_reseau` 1.6.0 : branches par `simuler`, sections couplées et piste de
masse en direct) et pertes au genou du **crosstalk** (`crosstalk` 4.2.0).

| Option | Où elle se règle | Défaut | Ce qu'elle change |
| --- | --- | --- | --- |
| Hauteur et topologie | lues dans la section | **active** | `topologie` toujours ; `hauteur` (h au plan, ou b entre plans) pour le ruban seul — pas pour une section coplanaire, un mode de paire ou une triplaque décentrée de plus de 20 %, où la hauteur *déduite* rend mieux le courant resserré |
| Rugosité du cuivre | empilage, par couche | lisse (K = 1) | facteur K sur α_c : Hammerstad-Groiss (Rq) ou Huray (rayon des nodules, rapport de surface) |
| Diélectrique causal | empilage | désactivé | Djordjevic-Sarkar calé sur la fiche à f_ref (1 GHz) : εr(f) dans les pertes **et** dans ε_eff et Z₀ (remplissage constant), donc dans la vitesse de phase |
| Modèle de via | empilage | **« auto »** | « π », « ligne » (barreau réparti) ou « auto » : ligne quand la phase du via au haut de la bande dépasse 0,3 rad |

Ce que l'empilage envoyé porte en plus (le document reste `cao-sim-em-3`) :

    "stackup": {"layers": [
                  {"type": "copper", …,
                   "modele_rugosite": "hammerstad" | "huray",
                   "rugosite_rms_um": 1.0,              // Hammerstad
                   "rayon_nodule_um": 0.5, "rapport_surface": 1.5}, // Huray
                  …],
                "dielectrique_causal": true,
                "f_ref_dielectrique": 1e9,              // Hz
                "modele_via": "pi" | "ligne" | "auto"}

`analyse` peut porter les trois dernières clés pour un « et si » qui ne touche
pas à la carte. Le résultat dit ce qui a servi (`modeles`), chaque transition
son modèle (`modelise.modele_via`, `phase_via_rad`), et le `.s2p` le note dans
son en-tête quand une option s'écarte du défaut.

**Le plan de référence a sa propre rugosité** (`simulation_em` 5.1.0,
`ligne_mom` 2.8.0). `line_losses` sépare la résistance du ruban (`R_ruban`)
de celle du ou des plans (`R_plan`) ; jusqu'ici un seul facteur K, celui de
la couche de la piste, valait pour les deux. `line_losses(…, rugosite_plan=)`
en prend un pour le plan seul — un dict des mêmes options (`{}` : plan
lisse), ou une liste de deux pour une triplaque, dont on moyenne les K — et
ne touche que `R_plan`. `_rugosite_section` le lit sur la couche du plan de
référence : **un plan qui ne déclare rien prend celle de la piste**, comme
avant (même feuillard dans la plupart des empilages) ; déclarée — zéro
compris, `"rugosite_rms_um": 0` dit un plan lisse —, c'est la sienne. Égale à
celle de la piste ou absente : rien de plus ne part, et le calcul est celui
d'avant au bit près. Branché dans la cascade simple (donc la RF qui passe par
`simuler`), `rf_reseau` 1.7.0 et `crosstalk` 4.3.0 ; **pas dans la cascade
différentielle** (l'œil), qui garde la rugosité de la piste pour ses deux
modes. L'éditeur n'a rien à saisir de plus : la rugosité de chaque cuivre
(`stack.cu[i].rug`) part déjà, celle du plan comprise ; un plan « lisse » n'y
envoie rien, et prend donc celle de la piste. Mesuré (microruban 0,58 mm sur
0,3 mm de FR-4, 100 mm, 10 GHz ; le plan porte 25 % de R) : piste HVLP
(Rq 0,3 µm) sur plan ED standard (Rq 2 µm), α_c 4,83 → 5,61 dB/m et perte
totale 3,496 → 3,574 dB, là où l'ancien calcul comptait le plan en HVLP.

**L'éditeur PCB** les saisit dans le panneau *Empilage physique* : sur une
ligne de cuivre, « Rugosité du cuivre » (réglages usuels : lisse, ED standard
Rq 2 µm, traité inversé Rq 1 µm, VLP 0,6 µm, HVLP 0,3 µm, et deux jeux de
Huray), et sous la synthèse, « Modèles de simulation » (case *diélectrique
causal*, fréquence de la fiche, modèle de via). Le document n'écrit
`stack.cu[i].rug` et `stack.sim` que s'ils s'écartent du défaut. **La
visionneuse** lit la rugosité que le fichier IPC-2581 déclare
(`<Conductor type="SURFACE_ROUGHNESS_UPFACING|DOWNFACING|TREATED">` d'une
`<Spec>`, la plus forte des faces, parseur 1.76) ; elle n'a pas de saisie de
rugosité — la plupart des exports n'en portent pas. Les **options de modèle**
(diélectrique causal, fréquence de la fiche, modèle de via) se saisissent dans
son panneau *La carte*, sous « Empilage du calcul » → « Modèles de
simulation », avec les mêmes défauts et le même envoi que l'éditeur ; elles
sont gardées par fichier dans le profil (`simModelesIpc`,
`visionneuse-ipc2581/js/07-simulation.js`).

**Ce que cela change, mesuré** (microruban 0,58 mm sur 0,3 mm de FR-4,
100 mm) : hauteur et topologie, 3,5355 → 3,5378 dB à 10 GHz (+0,07 %) ; sur
une triplaque centrée de 0,47 mm, 4,764 → 4,778 dB (+0,3 %) ; un microruban
couvert, +0,6 %. Rugosité, perte totale (diélectrique compris) multipliée par
1,02 (Rq 0,3 µm) à 1,11 (Rq 2 µm) à 10 GHz. Causal, fiche à 1 GHz : à
10 GHz ε_eff 3,438 → 3,345 et Z₀ 47,56 → 48,21 Ω. Via de 1,34 mm, 0,25 mm
dans 0,8 mm d'antipad : le π à 0,002 dB près à 1 GHz (résistance du barreau), |S₂₁| −7,19 →
−6,56 dB à 40 GHz.

#### La mutuelle des fûts de la paire

En mode impair les deux fûts portent des courants opposés : l'inductance vue
par brin est L − M, d'autant plus basse qu'ils sont proches. Elle se calcule
par l'énergie, comme `inductance_boucle_vias` : les deux fûts et les vias de
masse retenus (ceux du via principal, **renvoyés par symétrie** pour la
partenaire), inductances partielles de Grover, courants de retour qui
minimisent l'énergie ; sans retour, M est exactement la mutuelle partielle des
deux fûts. Le mode commun prend L + M. La capacité mutuelle (ligne bifilaire,
écrantée par les plans en exp(−π s / b)) ajoute 2 C_m par brin en mode
impair. L'écart des fûts : le via de la partenaire trouvé dans le document
(`vias` ou le voisinage), sinon l'écart de la paire, jamais moins que
l'antipad (`s_diff.vias_mutuelle[].ecart_source`).

Mesuré (via traversant de 0,3 mm, 4 couches, sans via de masse,
L = 0,534 nH) : L_impair 0,294 nH à 0,6 mm d'écart, 0,373 à 1 mm, 0,464 à
2,5 mm ; C_m 7,2 / 1,0 / 0,002 fF.

**Étalons** ([banc-ligne-mom.py](../python/test/banc-ligne-mom.py)) : la
rugosité multiplie l'α_c de la cascade par le K attendu (Hammerstad et Huray,
à 0,3 % près) ; le causal rend la fiche à f_ref au bit près et
(β/β₀)² = εr(f)/εr en triplaque, paire comprise ; le via en ligne rejoint le π
à 10 MHz (réactances à 10⁻⁵), garde moignon et contre-perçage, et « auto »
rend le π au bit près sous le seuil ; la rugosité propre du plan ne touche que
`R_plan`, égale ou absente elle rend la même ABCD au bit près ; la mutuelle baisse L_impair quand les
fûts se rapprochent et vaut Grover sans retour. RF : [banc-rf.py](../python/test/banc-rf.py).


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

### Le panneau se range en SI, PI, RF et Audit

Quatre familles d'analyse : **SI**, intégrité du signal — ce qu'un front devient
en parcourant le cuivre —, **PI**, intégrité de l'alimentation — ce que le
réseau de distribution laisse passer —, **RF**, le S₂₁ d'une chaîne
d'adaptation entre deux ports (voir plus bas), et **Audit de la carte**, qui juge toute la
carte sans sélection (voir [Vérification de la carte](#vérification-de-la-carte)).
L'onglet *Santé liaison*, qui agrégeait les diagnostics d'UNE liaison, a été
retiré : la vérification de la carte en reprend l'idée — un constat, sa
sévérité, son geste — pour tous les nets à la fois. SI porte **Impédance**, **Z
différentielle**, **Crosstalk** et **Current Return Path** ; PI
porte **Chute DC** et **Z(ω) PDN**. Le découpage avait été posé quand il n'y avait qu'une
analyse, parce qu'il coûtait moins cher à poser qu'à retailler ensuite autour
de six. Ce qu'il resterait à y mettre est listé dans
[A-FAIRE.md](../A-FAIRE.md).

### Vérification de la carte

> Mode d'emploi pas à pas : [verification-carte.md](verification-carte.md).

**Toute la carte, tous les nets, sans sélection.** Le serveur
(`python/analyse_carte.py`, route `/api/analyse-carte`) reçoit de l'outil ses
pistes et ses arcs des seules couches de cuivre, ses pastilles **déjà
placées** — la visionneuse sait tourner et poser celles des composants, le
serveur n'a pas à le refaire —, le cuivre de ses surfaces (contours et trous),
son contour, ses trous métallisés et les broches de ses composants. Il rend des
constats `{regle, severite, x, y, c, n, msg}` dans les unités de l'outil ; un
constat de carte (l'empilage) a `n` et `x` à null.

Première règle, les angles des pistes, sur tous les nets — c'est une règle de
fabrication, pas de classe de signal :

| Règle | Sévérité | Ce qui la déclenche |
| :--- | :--- | :--- |
| aigu | critique | deux branches à moins de 89° : le fond du V retient le bain de gravure |
| angle droit | vigilance | un coude à 90° ± 1° (les fabricants le tiennent) |
| jonction | vigilance | trois branches ou plus au même point, ou un bout posé au milieu d'une autre piste (T) |
| hors 45° | info | des segments hors des huit directions, une ligne par piste |

**Ce qui n'est pas jugé, et pourquoi.** Un sommet dans le cercle inscrit d'une
pastille ou d'un via : la piste y entre et en repart, le cuivre de la pastille
recouvre l'angle. Sur P01x274, ce seul point faisait passer les « angles
aigus » de 4 477 à 4. Et un V dont une branche est plus courte que
(w/2)/tan(θ/2) : son coin intérieur ne s'ouvre jamais, il est noyé dans le
cuivre — les micro-zigzags de quelques microns que laissent certains exports,
ou un bout qui dépasse d'un coin de moins que ce seuil. Deux bouts à moins
d'un micron sont le même point, limite d'arrondi comprise.

**Deux choses sont rangées à part, repliées.** Le cuivre **sans net** —
texte, logos, repères de couche dessinés en cuivre — est jugé comme le reste
mais ne porte pas de signal. Et les nets de signal classés **Lent par
défaut** : aucun indice ne les a classés, un net rapide au nom automatique s'y
cache, et les règles électriques le jugent comme lent sans le dire.

**Les bouts de piste orphelins** se jugent aussi sur tous les nets : un bout
qui ne touche ni pastille, ni via, ni le cuivre d'une autre piste du net, ni
le versement de son net, se remonte jusqu'à ce qui le retient — rien (piste
isolée, critique), une pastille (antenne), un embranchement (moignon, ou
dépassement s'il fait moins de 0,5 mm). **L'empilage** se juge une fois pour
la carte : plans voisins, couches de signal face à face, cavité alimentation /
masse, symétrie.

**Les règles électriques se jugent à la cadence de chaque classe.** Un net
n'a pas le front qu'on veut : il a celui de la techno qui le pilote — sa
**classe** : un GPIO monte en quelques ns même à 100 kHz —, borné par la
période de sa cadence maximale. Le front effectif est donc min(t_r de la
classe, 0,1 / cadence), et la règle juge au genou 0,35 / t_r : une colonne par
constat. Les trois fréquences communes à la carte ont disparu — elles
donnaient trois colonnes presque toujours identiques. Z₀ (50 Ω), la
diaphonie au niveau 2 (t_r global 1 ns, seuils orange 3 % et rouge 7 % — les
mêmes que l'onglet Crosstalk), Z_diff visée (100 Ω) et, par classe, front et cadence
(Horloge 2 ns / 50 MHz, Rapide 1 ns / 100 MHz, RF 0,1 ns / 1 GHz, Analogique
100 ns / 1 MHz, Lent 10 ns / 10 MHz, nœud de découpage 5 ns / 2 MHz) se
règlent dans le panneau. La classe de chaque net est écrite à côté de son nom
dans le rapport : c'est elle qui fixe le verdict, et un net mal classé par son
nom (LNA_EN pris pour du RF) se voit là.

| Règle | Ce qu'elle juge | Comment |
| :--- | :--- | :--- |
| chemins de retour | chaque via de signal qui change de plan de référence | Même moteur que Current Return Path (`simulation_em`) : plans et leur net au droit du via, vias de masse retenus, inductance de boucle, traversée de cavité quand les plans sont de nets différents — par le modèle modal de la PI (`ligne_mom.cavite_modale` : modes TM, queue inductive, complément de Schur) dès que la page envoie `cavite_rect` et `ponts_carte`, le via au port 0 et chaque pont de la carte (direct, ou chaîne de 0 Ω `ponts_indirects`) à sa position ; et, quand elle envoie aussi `cavite_grille` (le recouvrement balayé en cellules de 0,5 mm), sur sa FORME RÉELLE (`ligne_mom.cavite_grille` : réseau L-C de la paire de plans, modes propres par scipy, queue inductive exacte, correction de Peaceman ; pas choisi selon la taille (`simPasGrille`, 0,25 à 1 mm) et contrôle de convergence au pas double ; bords extérieurs avec leur capacité de débordement (Hammerstad) et leur rayonnement, sommé de façon cohérente sur la sphère par paquets de faces de 2 mm, qui donne le Q de rayonnement de chaque mode et une estimation CISPR 32 du champ que la cavité rayonne (`_rayonnement_cavite`, cavité seule) ; les îlots du recouvrement reliés à la cavité par la self équivalente du réseau multicouche de leurs deux nets (`simReseauNets` côté page, `_liens_par_reseau` côté serveur : plans lus par couverture, pistes, perçages ; 1 nH/mm à défaut), chaque îlot relié aux points où le courant le quitte vraiment (jusqu'à quatre liens), sa self de boucle comptée en PEEC le long du chemin (selfs partielles et mutuelles de Neumann, l'aller et le retour de signes opposés ; la plus petite de la PEEC et de la somme, toutes deux majorantes), et la fourchette du pic quand le via est sur un îlot, du couplage parfait (√L_A − √L_B)² à aucun couplage L_A + L_B. Les envois gros partent en gzip, la grille d'une cavité une seule fois (`simCorpsJson`). Les ponts portent les parasites de la PI (`simPDNParasitesCapa`, `simPDNInductanceMontage`). Toutes les fréquences se résolvent d'un coup (`impedance_traversee_vec`) ; les vias hors parcours chiffrent leur traversée. Le modèle localisé, avec son pont supposé au rayon, n'est plus qu'un repli. Verdict : le pire de la réflexion \|Γ\| = \|Z\| / \|Z + 2Z₀\| (5 % / 10 %) et de la distance du retour face à λ/20 dans le diélectrique (λ/10 pour condamner). Le message donne le front le plus raide que le via supporte |
| diaphonie | chaque couple de pistes voisines de nets différents, même couche ou couches voisines superposées | Niveau 2 : section à deux conducteurs résolue par la méthode des moments à l'écart réel ; k_total = ½(Cm/C11 + Lm/L11), NEXT = min(Kb max, Σ Kb·2T_d/t_r), FEXT = \|Σ Kf·T_d\| / t_r sous le **t_r global** ; vert < 3 %, orange (vigilance) jusqu'à 7 %, rouge (critique) au-delà, NEXT et FEXT chacun leur statut. Hors jeu : la masse, les alimentations (sauf un nœud de découpage), les deux moitiés d'une paire différentielle |
| impédance | chaque net de signal | Chaque section (couche, largeur, écarts à la masse coplanaire mesurés dans le cuivre de la couche) par `solve_line` : Z₀, v, C' ; R, L, C, T_d du net. Chaque tronçon réfléchit \|Z − Z_réf\| / (Z + Z_réf) · min(1, 2T_d / t_r), Z_réf la cible pour Horloge, Rapide, RF, l'impédance dominante du net sinon (5 % / 10 %) |
| fentes | chaque piste de signal au-dessus d'un vide de son plan de référence | Détours d1, d2 le long de la normale (30 mm au plus), impédance de fente d'Ott (`rf_reseau.z_fente`), \|Γ\| comme un via ; dégagement du propre via exclu ; une ligne par net et par plan |
| couture | chaque cavité entre deux couches d'une même masse | Plus grand trou sans via par transformée de distance (`scipy.ndimage`), pas équivalent √2 · d_max face à λ/20 au genou du front le plus rapide de la carte (λ/10 pour condamner) |
| paires | chaque paire différentielle | Z_diff MoM à l'écart réel des morceaux couplés (à moins de 5 h), 2 Z₀ pour les découplés, pondérés par 2T_d / t_r face à la cible ; écart de longueur en temps face au front (10 % / 20 %) ; vias en nombre différent |
| découplage | chaque broche d'alimentation de circuit intégré | Condensateur vers la masse le plus proche sur le même rail, face à λ/40 au genou du front le plus rapide des signaux du circuit (λ/20 pour condamner) ; aucun : critique |
| bord | chaque piste près du contour | Détourage : cuivre à moins de 0,25 mm (critique) ou 0,5 mm (vigilance), tous nets ; CEM : longueur à moins de max(1 mm, 5 h) du bord face à λ/20 ; règle des 20 H en info |

Une seule transition réfléchit peu, même mal refermée : c'est pour cela que la
distance du retour entre dans le verdict. La réflexion dit ce que la ligne
voit ; la boucle dit ce que la carte rayonne. Hors parcours, l'onglet Current
Return Path ne chiffrait pas la cavité d'un via GND → alimentation ; la
vérification la chiffre, en posant les deux plans que la cavité attend.

La ligne de commande juge un fichier sans ouvrir de page :
`python python/analyse_carte.py carte.xml`. Bancs :
[python/test/banc-analyse-carte.py](../python/test/banc-analyse-carte.py),
plus un essai par adaptateur dans les deux harnais.

### Diagramme de l'œil — la liaison vue par le récepteur

L'onglet **Diagramme de l'œil** (famille SI) répond à la question que les
paramètres S laissent ouverte : le récepteur voit une suite de bits, pas une
sinusoïde. Chaque bit déborde sur ses voisins (pertes, réflexions, moignons),
et l'œil est ce qui reste d'ouvert quand on superpose tous les bits. Les
normes jugent aussi la liaison ainsi : un **gabarit** (masque) dans lequel
aucune trace n'a le droit d'entrer.

**La liaison est celle de l'onglet Impédance.** La sélection part dans
`simulation_em.simuler` exactement comme pour Z₀ (MoM 2D sur la section,
dispersion, pertes, coudes, vias, moignons), mais sur une grille régulière de
plusieurs centaines à quelques milliers de fréquences (`freqs_imposees`). En
mode différentiel, c'est la cascade du mode impair de la paire
(`s_diff["abcd_dd"]`), ses vias et ses coudes compris (voir plus bas).
`python/oeil.py` (2.0.0) n'ajoute que ce qui l'entoure :

1. **l'émetteur**, générateur de Thévenin linéaire (ou tampon IBIS, voir plus
   bas) : tension à vide, résistance
   de sortie, front gaussien de temps de montée tᵣ (10–90 %) et, au besoin, une
   pré-accentuation (FFE) ;
2. **le récepteur** : résistance de terminaison (vide = haute impédance) et
   capacité de broche, puis l'**égaliseur de référence** du protocole quand le
   gabarit le suppose (CTLE, DFE) ;
3. la fonction de transfert générateur → broche,
   H = 1 / (A + B·Y_L + Z_s·(C + D·Y_L)), passée en temporel par IFFT : réponse
   à un échelon, puis **réponse à un bit** ;
4. deux yeux tirés de cette réponse :
   - l'**œil PRBS** (PRBS7, 9 ou 15), par superposition — la liaison est
     linéaire, la somme des réponses décalées *est* la forme d'onde ;
   - l'**œil pire cas** (analyse de distorsion crête, PDA) : la pire
     combinaison de bits voisins, toutes séquences confondues ;
5. le gabarit, et sa **marge** : de combien on peut l'agrandir avant qu'il
   touche.

**La grille.** La fenêtre temporelle doit contenir toute la réponse : trente
traversées de la ligne, douze fronts et les constantes de temps du récepteur,
et l'on en prend le double pour que la queue ne revienne pas par l'autre bout
de l'IFFT. Le haut de la grille est 1,6/tᵣ, où le front gaussien ne laisse plus
que 5·10⁻⁴. Au-delà de 8 192 points, la fenêtre est raccourcie et le résultat
le dit. Une réponse qui ne s'est pas éteinte dans la fenêtre est signalée.

**L'instant d'échantillonnage** est au milieu de la plage de phases où l'œil
pire cas est ouvert, entre les deux croisements, là où une récupération
d'horloge le placerait et où les gabarits se posent. La largeur se mesure en
faisant le tour de l'UI, puisque l'œil se répète.

**La marge.** Pour l'œil PRBS, c'est la plus petite *jauge* des traces dans le
polygone convexe du gabarit : la jauge vaut 1 sur le bord, et le gabarit
agrandi d'un facteur k autour de son centre est exactement {jauge ≤ k}. Elle ne
dépend pas des unités des axes. Pour l'œil pire cas, c'est le plus grand k tel
que le gabarit agrandi tienne, phase par phase, entre ses deux frontières. Juger
les points de ces frontières comme des traces serait faux : dans les
croisements elles plongent sous le seuil, là où de vraies traces passent par
zéro, et la marge pire cas dépasserait celle du PRBS.

**Les gabarits** vivent dans `python/oeil.py` (`GABARITS`) et la page les reçoit
par `GET /api/oeil`. Il n'y a donc qu'une source. Chacun porte sa **fiabilité**,
affichée à côté du verdict, parce que les normes sont payantes :

| Fiabilité | Sens | Gabarits |
| :--- | :--- | :--- |
| recoupé | valeurs retrouvées dans une source publique (fiche de fabricant, note d'application, procédure de test), pas dans la norme elle-même | USB 2.0 HS Template 1, USB 3.x Gen 1 (après CTLE), PCIe Gen 1, Gen 2 et Gen 3 (après CTLE et DFE de référence), SATA Gen 1 à 3, SGMII |
| à vérifier | valeurs de la norme non recoupées : aucune source publique ne les reproduit | USB 2.0 HS extrémité (Template 2), HDMI 1.4 (TP2) |
| dérivé | pas de gabarit officiel : seuils VIL/VIH du récepteur et sa fenêtre setup/hold | LVDS, MIPI D-PHY HS, SPI 3,3 V et 1,8 V, QSPI, SD High Speed, eMMC HS |

**La vérification d'octobre 2026.** PCIe Gen 2 (120 mV, 0,60 UI à 10⁻¹²)
et Gen 3 (25 mV, 0,3 UI derrière le CTLE à pôles 2 et 8 GHz, gain continu
−6 à −12 dB, et le DFE à une prise bornée à ±30 mV) sont recoupés ; leurs
valeurs n'ont pas bougé. SATA garde ses hauteurs (325, 275, 240 mVppd) et sa
largeur passe de 0,4 UI à 1 − TJ de la tolérance à la gigue du récepteur :
0,49 UI en Gen 1, 0,43 UI en Gen 2 et 3, en losange. USB 2.0 extrémité et
HDMI 1.4 restent « à vérifier » : les seules valeurs publiques trouvées pour
HDMI sont celles de la source HDMI 2.0 au bout du câble de référence, une
autre exigence, qu'on ne recopie pas. Les gabarits PCIe et SATA portent aussi
leur taux d'erreur (10⁻¹²) : c'est sur ce contour de l'œil statistique qu'ils
se jugent quand la gigue est saisie. Les gabarits dérivés citent maintenant le
composant réel (récepteurs LVDS SN65LVDS32 / DS90LV028A à ±100 mV, D-PHY à
±70 mV en v1.2 et 40 mV chez Efinix en v1.1).

Un gabarit au **connecteur** (USB 2.0 Template 1) se juge à la broche du
connecteur : c'est le bon point quand la piste va du PHY au connecteur. Les
autres se jugent à l'entrée du récepteur. Les bus lents (SPI, QSPI, SD, eMMC)
n'ont pas de masque officiel : le gabarit dérivé interdit la zone entre VIL et
VIH pendant la fenêtre setup/hold du récepteur, avec les limites de tension
absolues. L'œil y est centré au mieux, et le décalage entre donnée et horloge
reste l'affaire de l'onglet *Bus synchrone*.

#### L'œil statistique — gigue, bruit, taux d'erreur (`oeil` 2.0.0)

Le pire cas dit la frontière qu'**aucune** séquence ne franchit ; il ne dit pas
combien de fois on s'en approche. Or une liaison se juge à un **taux
d'erreur** (10⁻¹² pour PCIe et SATA), et deux choses le fixent que la réponse
à un bit ne porte pas : la gigue de l'émetteur, qui déplace l'instant de
lecture, et le bruit, qui déplace la tension lue. Dès qu'on saisit une gigue
aléatoire (RJ, ps rms), une gigue déterministe (DJ, ps crête à crête, en
double Dirac), un bruit de récepteur (mV rms) ou la diaphonie, le serveur
ajoute l'**œil statistique** — sans tirage au sort :

1. à chaque phase, la tension lue pour un « 1 » vaut v_c + A·c₀ + Σ aₖ·A·cₖ
   (aₖ = ±1 indépendants) ; sa densité est le produit de convolution de deux
   Dirac par curseur, construit sur une grille de 2 048 cases **dans le
   domaine des probabilités** — jamais négatives, d'où des queues justes
   jusqu'à 10⁻³⁰⁰, là où une transformée de Fourier plafonnerait vers 10⁻¹⁶.
   L'erreur d'arrondi de chaque curseur est **reportée sur le suivant** :
   l'extrême (tous les bits contre l'œil), là où se lisent les petits taux,
   reste exact à une demi-case près ;
2. le bruit gaussien s'y convolue, et chaque agresseur borné entre comme un
   curseur de plus (deux Dirac à ±sa crête) ;
3. la gigue mélange les phases, avec les probabilités exactes (erfc) de
   chaque case de phase — affinée quatre fois, 1/256 UI, pour que le
   croisement ne soit pas biaisé d'une demi-case ;
4. le taux d'erreur à (τ, v) est ½ P(V₁ < v) + ½ P(V₀ > v) ; les **contours**
   10⁻⁶, 10⁻⁹, 10⁻¹², 10⁻¹⁵ (et le taux visé) se tracent sur l'œil, la
   **baignoire** (taux au seuil, phase par phase, en échelle logarithmique)
   en dessous, et le gabarit se juge **aussi** sur le contour du taux visé —
   c'est là que les gabarits PCIe et SATA, qui portent leur 10⁻¹², ont un
   sens.

Hypothèses, rendues avec le résultat : bits indépendants et équiprobables (pas
la séquence PRBS), gigue rapportée à l'échantillonneur (celle de l'émetteur n'y
est pas filtrée par le canal — prudent sur une liaison à pertes), décisions
du DFE justes.

**La diaphonie, bornée.** Chaque agresseur ajoute sa crête au pire cas, avec
son signe le plus défavorable et au même instant que les autres (somme
arithmétique : la seule qui soit un pire cas), et entre dans l'œil
statistique comme ±sa crête. Les agresseurs se saisissent (`agresseurs` :
crête en volts, ou coefficient × excursion), ou se **reprennent du couplage**
(`agresseurs_auto`) : chaque voisine de la fiche de couplage de
`simulation_em` donne ses modes pair et impair, d'où Kb et Kf — les mêmes que
`crosstalk.coefficients_couple` —, et le **niveau 2** de `crosstalk.py` rend
le NEXT et le FEXT, saturés ou non selon le front. Une voisine qui émet dans
le même sens que la victime lui envoie son FEXT, en sens opposé son NEXT ;
sans le savoir on prend le plus grand. L'excursion de l'agresseur est, faute
de mieux, celle de la victime à sa charge. Derrière un CTLE, la crête passe
par le gain crête du CTLE sous le genou du front. En différentiel, la
partenaire n'est jamais un agresseur, et le bruit d'une piste majore celui de
la paire. L'œil PRBS, lui, reste sans diaphonie : la séquence des voisines
n'est pas connue.

**Sans aucun de ces réglages, rien ne change** : la requête et la réponse sont
celles de la 1.0.0, au chiffre près (c'est un cas du banc).

#### Les modèles IBIS — émetteur et récepteur non linéaires

`python/ibis.py` lit un fichier `.ibs` (ANSI/EIA-656) : de chaque `[Model]`,
`Model_type`, `C_comp` (typ/min/max), `Vinl`/`Vinh`, les références
(`[Voltage Range]`, `[Pullup Reference]`…), les quatre courbes V-I
(`[Pullup]`, `[Pulldown]`, `[GND Clamp]`, `[POWER Clamp]`), `[Ramp]`, autant de
`[Rising Waveform]` / `[Falling Waveform]` qu'il y en a (charge d'essai
R/V/C_fixture), et `[Rgnd]`/`[Rpower]`. Les conventions de la norme sont
tenues : courant positif quand il **entre** par la broche, tensions de
`[Pullup]` et `[POWER Clamp]` relatives à leur référence (V_ref − V_broche),
suffixes T G M k m u n p f (M = méga, m = milli), « NA » renvoyant à typ.
Depuis `ibis` 1.1.0, le boîtier et les broches sont lus aussi (voir plus
bas) ; ce qui reste ignoré (sous-modèles, `[Model Spec]`, boîtiers décrits
par sections) est **dit** dans le résultat.

**Le tampon émetteur, dans le temps** : I_broche = Ku(t)·I_pu(V) + Kd(t)·I_pd(V)
+ I_pc(V) + I_gc(V) + C_comp·dV/dt. Les commandes Ku, Kd viennent des formes
d'onde : deux par front (deux charges d'essai), deux équations à chaque
instant ; une seule, Kd = 1 − Ku ; aucune, `[Ramp]` et un Ku linéaire — la plus
pauvre des trois, dite dans le résultat. Un front qui en interrompt un autre
repart de la commande où le premier s'est arrêté.

**La liaison se simule pas à pas.** Le canal est écrit en ondes de puissance
sur une résistance de référence R₀ (le Z₀ de la ligne) : ses quatre
paramètres S — la cascade ABCD de `simulation_em`, charge linéaire du
récepteur comprise (R, C_comp) — deviennent des réponses impulsionnelles, et
à chaque pas l'histoire est connue ; il reste deux équations à deux inconnues
(les ondes entrantes), celles des bouts — tampon d'un côté, diodes du
récepteur de l'autre —, qu'un Newton résout. Le passage en temporel demande
une bande bornée : les S sont multipliés par une fenêtre gaussienne qui
revient à lisser chaque trajet par un front de la **moitié** de celui du
tampon (le haut de la grille suit ce lissage), **sauf la réflexion
instantanée** de l'entrée, lue à ce qui déborde avant t = 0 et remise en
Dirac — lissée, elle serait non causale et la boucle tampon-canal ne la
verrait plus au bon instant.

Deux simulations, et le reste ne change pas : deux **fronts isolés** (montant
et descendant), dont la moyenne normalisée est la réponse à un échelon dont
le pire cas, l'œil statistique et l'égaliseur ont besoin (l'écart entre les
deux est rendu et signalé au-delà de 5 %) ; et la **séquence PRBS** elle-même,
en régime établi, qui fait l'œil PRBS sans aucune linéarisation (PRBS7 ou 9 :
PRBS15 serait trop long pas à pas, et le pire cas couvre de toute façon les
longues suites). Un récepteur IBIS sans diode n'est que son C_comp : le
calcul reste alors linéaire.

#### Le boîtier et les broches (`oeil` 2.1.0, `ibis` 1.1.0)

**Ce qui est lu.** `[Package]` (R_pkg, L_pkg, C_pkg typ/min/max, la colonne
suit le coin du tampon) est le boîtier moyen ; `[Pin]` donne, broche par
broche, le signal, le modèle et R_pin/L_pin/C_pin, qui **priment** valeur par
valeur (« NA » renvoie à `[Package]`) ; un `[Package Model]` qui renvoie à un
`[Define Package Model]` du même fichier prime sur les deux — on en prend la
**diagonale** (matrices pleine, en bande ou creuse) ; les mutuelles sont lues
pour être **dites** (le plus fort couplage de la broche, k_L et k_C), pas
comptées ; un boîtier décrit par sections (`Len=`) n'est pas lu, et
`[Pin]`/`[Package]` le remplacent. `[Model Selector]` : une broche qui
désigne un sélecteur prend le modèle choisi s'il en fait partie, le premier
sinon. Les broches POWER, GND et NC sont refusées.

**Où il se pose.** Topologie des simulateurs IBIS : C_comp au die, puis
R_pkg et L_pkg en série, puis C_pkg à la broche. Le boîtier est **linéaire** :
on le fond dans la cascade ABCD du canal, entre le die (où le tampon et
C_comp restent au Newton) et la piste, côté émetteur (die → broche) et côté
récepteur (broche → die, avant la charge R/C_comp). Rien n'est ajouté au pas
de temps — ni inconnue, ni intégration —, et le boîtier passe par le même
chemin que la piste (paramètres S, fenêtre, réponses impulsionnelles) ; le
prix est que ses résonances au-delà du haut de la grille sont lissées comme
le reste, ce qui ne touche pas les boîtiers usuels (L_pkg / R₀ et R₀·C_pkg
sont bien plus longs que le lissage). Un boîtier nul ne touche pas la
cascade : l'œil est celui d'avant, au bit près. `boitier: false` le retire.

**Dans l'interface**, la liste des `[Pin]` (et, en différentiel, celle des
`[Diff Pin]`) s'ajoute au choix du modèle ; choisir une broche choisit son
modèle et son boîtier.

#### La paire de tampons : deux brins, et le mode commun

Le demi-circuit du mode impair supposait deux tampons parfaitement opposés.
Depuis la 2.1.0, en différentiel avec un tampon IBIS (ou un `decalage_n`
saisi), **chaque tampon attaque son brin**. La paire symétrique de
`simulation_em` est donnée par ses deux modes, sans couplage entre eux : la
cascade du mode impair (`abcd_dd`, V_d = V_p − V_n, I_d = (I_p − I_n)/2) et
celle du mode commun, **reconstruite exactement des S_cc** que `s_diff` rend
(V_c = (V_p + V_n)/2, I_c = I_p + I_n, sur Z_diff/4) — `simulation_em` n'est
pas modifié. On les remet par brin (V = T_V·V_modes, I = T_I·I_modes : quatre
accès, ondes de tension sur R₀ = Z_diff/2 par brin), et ce qui est propre à
un brin s'y pose tel quel : boîtier de chaque broche, C_comp de chaque
entrée, surlongueur d'un brin (le `delta_l_mm` de la paire, posé comme une
ligne seule sur le brin inverse — le dessin ne dit pas lequel est le plus
long). La terminaison du récepteur est la résistance différentielle et, au
besoin, une impédance de mode commun (`r_charge_mc`, prise médiane ; 0 =
flottante). Le pas de temps est celui de la ligne seule, avec quatre ondes
entrantes : les deux bouts se résolvent à tour de rôle (deux Newton 2×2 en
scalaires, jusqu'à ce que rien ne bouge), le Newton 4×4 en recours.

**`[Diff Pin]`.** En différentiel, la broche choisie désigne une paire
(broche, broche inverse, vdiff, tdelay typ/min/max) : chaque brin prend le
modèle et le boîtier de **sa** broche ; sans broche, la première paire dont
le modèle est celui choisi est prise d'office (et dit). Le brin inverse
reçoit la séquence inverse **retardée de tdelay** (colonne du coin) ;
`decalage_n` le remplace. Le vdiff du fichier du **récepteur** est son seuil :
`marge_vdiff_prbs` et `marge_vdiff_pire` (demi-hauteur − vdiff), signalés
quand ils sont négatifs ; à défaut, le `Rx_Receiver_Sensitivity` d'un .ami.
Un coin ou un modèle différent pour le brin inverse : `coin_n`, `modele_n`.

**Ce qui est rendu** (`mode_commun`) : le mode commun au récepteur (continu,
crête à crête, crête, efficace), celui de l'émetteur, la **conversion**
20·log(V_cm,cc / V_diff,cc), les 40 premiers bits du PRBS en courbe (mode
commun et différentiel), les dissymétries trouvées, et — dès qu'il y en a —
la hauteur d'œil brute (sans égaliseur, meilleure phase) de la paire réelle
**et** de la même paire rendue symétrique (brin n = brin p, sans décalage) :
c'est l'effet de la dissymétrie sur l'œil différentiel. Sans S_cc (paire
sans cascade de mode commun), on retombe sur le demi-circuit, et on le dit.

#### Les vias de la paire (`simulation_em` 4.4.0)

La cascade différentielle ne portait que les tronçons : une paire qui change
de couche rendait le même S_dd — et le même œil — qu'une paire restée sur la
sienne. Les modèles déjà calculés pour la piste principale (le π du via : L
de boucle de Grover, C des antipads et des pastilles, moignons à chaque bout ;
le T de Gupta des coudes) sont maintenant posés au même rang, **sur les deux
brins** : en mode impair [A, 2B ; C/2, D], en mode commun [A, B/2 ; 2C, D].
La traversée de cavité (chemin du retour) n'est comptée qu'en mode commun —
en mode impair les retours des deux brins s'annulent. **Depuis la 5.0.0, la
mutuelle entre les deux fûts est comptée** (voir « La mutuelle des fûts de la
paire » plus bas) : L − M en mode impair, L + M en mode commun. `s_diff` dit
combien de vias et de coudes il porte, et l'œil le répète.

#### IBIS-AMI : le .ami lu, pas exécuté

Un `[Algorithmic Model]` renvoie à une bibliothèque binaire du fabricant
(.dll, .so) et à un fichier `.ami`. **La bibliothèque n'est pas exécutée** —
du code natif venu d'un fichier téléversé n'est pas une option. Le renvoi est
lu (plateforme, bibliothèque, .ami) et dit ; le `.ami`, chargé à côté du
.ibs, est lu (`ibis.lire_ami`) : syntaxe en arbre à parenthèses, chaînes entre
guillemets, paramètres réservés (`Reserved_Parameters`) et propres au modèle
(`Model_Specific`), chacun avec son chemin, son Usage, son Type, sa valeur
(Value, Default ou typ d'un Range), sa plage et sa liste. L'interface le
montre. `ibis.proposer_egaliseur` en tire, **par des noms usuels et en le
disant**, une proposition pour l'égaliseur de référence de l'œil : FFE des
prises numérotées (−1, 0, 1… ou pre/main/post) ramenées à Σ|c| = 1 (refusée
si ce sont des codes de réglage) ; DFE du nombre de prises et de leur plage ;
CTLE d'une liste ou d'une plage de gains en dB (forme `pcie3`, **pôles
supposés** fp1 = débit/4, fp2 = débit) ; RJ (Tx_Rj, Rx_Rj en quadrature), DJ
(Tx_Dj, Tx_DCD, Rx_Dj, Rx_DCD), bruit (Rx_Noise), seuil
(Rx_Receiver_Sensitivity). Avec `ami_regler`, la proposition est appliquée
(la gigue et le bruit saisis l'emportent). Une FFE avec un émetteur IBIS se
pose linéairement sur la forme d'onde simulée — c'est ce que fait le flot
AMI sur la réponse du canal analogique. L'adaptation et la récupération
d'horloge du modèle ne sont pas reproduites.

**Hors du modèle**, et dit dans chaque résultat : condensateurs de liaison
(couplage AC), mutuelles d'un `[Package Model]` (dites, pas comptées) et
boîtiers par sections, exécution des modèles AMI, géométrie dissymétrique
de la paire (les deux brins restent de même section dans la cascade).
L'Ethernet cuivre (MLT-3, PAM-5) n'est pas binaire et n'a pas de gabarit.
L'I²C (drain ouvert, front montant RC) n'a pas de gabarit non plus — mais son
tampon IBIS se simule maintenant.

**Étalons** ([python/test/banc-oeil.py](../python/test/banc-oeil.py), 45 cas) :
la ligne adaptée sans pertes rend un œil parfait (demi-excursion, 1 UI, retard
de la ligne) ; une ligne ouverte attaquée par 30 Ω rend l'œil pire cas du
diagramme en treillis à 0,3 % près ; avec 10 Ω, l'œil fermé se dit fermé ; le
pire cas n'est jamais plus ouvert que le PRBS, ni en hauteur ni en marge ; un
CTLE, une FFE ou un DFE ouvrent un œil fermé par les pertes ; la grille imposée
rend la même cascade que la grille de la page. **2.0.0** : sous RJ seule,
l'œil se ferme de σ·Q⁻¹(2·BER) de chaque côté à 0,004 UI près, et sous
DJ + RJ de DJ + 2σ·Q⁻¹(4·BER) (double Dirac) ; un bruit gaussien ferme
l'ouverture de σ·Q⁻¹(2·BER) à deux cases près ; l'œil statistique du treillis
de Bewley **est** le pire cas dès 10⁻⁶ ; un agresseur de crête A ferme le
pire cas d'exactement 2A ; les voisines reprises du couplage portent le NEXT
et le FEXT de `crosstalk.niveau2` ; un tampon IBIS aux courbes droites et au
front gaussien rend l'œil du générateur de Thévenin à 1 % près (front composé
avec le lissage), et sa forme d'onde PRBS simulée est, au pas près, la
superposition de ses réponses à un échelon ; un récepteur IBIS sans diode
rend l'œil de sa capacité ; des diodes franches tiennent le dépassement d'une
ligne ouverte sous 0,55 V au-delà des rails ; deux vias traversants qui
laissent des moignons de 2,6 mm ferment l'œil différentiel à 16 Gb/s.
**2.1.0** : un boîtier nul rend l'œil d'avant au bit près ; L_pkg = 5 nH
derrière 50 Ω ralentit le front selon la loi exponentielle-gaussienne
(τ = L/(R_s + Z₀)) à 3 % près ; C_pkg = 2 pF à la broche d'un récepteur
adapté renvoie l'écho −e^(−t/τ), τ = Z₀C/2, dont le creux simulé est le creux
calculé à 3 % près ; `[Pin]` prime sur `[Package]` et la diagonale d'un
`[Package Model]` sur les deux ; le tdelay de `[Diff Pin]` (40 ps) se mesure
entre les deux brins du récepteur à 2 % près ; une paire symétrique n'a pas
de mode commun (< 1 µV), décalée de 30 ps elle en a un de
V_cc·erf(Δ/(2√2·σ)) à 2 % près ; une paire dessinée passe tout le chemin
(S_cc → mode commun) ; un `.ami` d'exemple se lit et propose FFE, DFE, CTLE
et gigue.

### RF — le S₂₁ d'un réseau entre deux ports

La famille **RF** porte un onglet, **S21**, et une question : on sort d'une
puce radio dont la sortie vaut 14 + 8j Ω, on traverse un réseau d'adaptation,
on arrive sur un connecteur U.FL ou une antenne — quelle part de la puissance
disponible arrive au bout, et que faut-il retoucher ?

**Les deux outils, chacun son empilage.** L'onglet existe dans l'éditeur PCB
et dans la visionneuse IPC-2581. Le réseau se construit dans le panneau
commun ; chaque outil ne fait que décrire sa carte (`rfPlateau`), et surtout
SON EMPILAGE : celui saisi dans « Empilage physique » pour l'éditeur, celui
lu dans le fichier et complété dans « La carte » pour la visionneuse. C'est lui
qui fait qu'une piste de 0,35 mm vaut 114 Ω sur un deux couches de 1,6 mm et
50 Ω à 0,21 mm de son plan — la fiche montre, piste par piste, la couche, la
hauteur au plan et l'εr qui ont servi. Dans la visionneuse, l'état RF (ports,
modèles importés, broches annexes) est gardé dans le navigateur, sous le nom du
fichier : le fichier lu n'est pas modifié, et rouvrir la carte le retrouve.

**Les ports.** 🎯 puis un clic sur une pastille, et l'impédance en R + jX. Au
port 1, l'impédance de **sortie** de la puce ; au port 2, celle de la charge.

**Le réseau, trouvé par la page.** Depuis le net du port 1, la marche traverse
chaque composant qui y touche, puis les nets de ses autres broches ; la masse
et les alimentations l'arrêtent (une alimentation découplée est une masse RF,
et la fiche le dit). Chaque net est découpé en **branches** de piste d'une
pastille ou d'une dérivation à la suivante. Une piste sur laquelle aboutit une
autre en T, ou qui traverse une pastille, est **coupée** au point d'accroche
— un arc en deux arcs qui se partagent son angle — (une copie pour le calcul,
la carte n'est pas touchée). Le contact se juge au
CUIVRE et non aux coordonnées, parce que c'est ainsi que les exports réels
sont faits : un bout de piste touche une pastille, une zone ou un autre bout
dès que sa demi-largeur le recouvre. Une pastille qui n'est reliée ni par une
piste ni par une zone est refusée, avec son nom.

**Les zones de cuivre du net** — un raccord de broche en polygone, une plage
RF — sont **maillées** au serveur, sur le CUIVRE RÉELLEMENT REMPLI : dans
l'éditeur, le masque de remplissage que l'outil calcule déjà (`zoneMask`,
dégagements et liaisons thermiques compris) part avec la zone et écarte les
cellules sans cuivre ; dans la visionneuse, les plans IPC-2581 sont déjà le
cuivre posé, trous compris. Le maillage est **adaptatif**, en arbre
quaternaire : fin près des accès (la moitié de la hauteur au plan), il grossit
avec la distance jusqu'à λ/40 à la fréquence haute ; le bord du cuivre est
raffiné à la moitié de la taille visée localement, et une cellule à cheval
garde sa fraction de cuivre. Un carré que traverse un bord est toujours
subdivisé, si bien qu'un cuivre plus étroit que l'échantillonnage n'est pas
perdu. Ce sont des volumes finis : chaque cellule porte sa capacité au plan —
une part de SURFACE et une part de BORD libre, tirées de deux résolutions MoM
(C′(W) = c_s W + 2 c_b) — ; chaque lien entre voisines, de tailles
quelconques, sa résistance de peau et sa self PAR DUALITÉ QUASI-TEM,
L′ = μ₀ε₀ / C′_vide : la « rangée » de cuivre que porte le lien a pour
capacité dans le vide sa surface plus la frange de ses bords libres
parallèles au courant — c'est ce qui donne à un cuivre étroit sa vraie self,
qu'une plaque surestimerait d'un facteur trois. La matrice est creuse et
factorisée en LU creuse (scipy) : une coulée de 60 × 60 mm, 6 500 cellules et
36 vias, se résout en moins d'une seconde ; le plafond est à 30 000 cellules,
et la fiche dit s'il a fallu desserrer. Chaque contact — un bout de piste, une
pastille — est un accès accroché à la cellule qui le contient. Étalonné : une
zone de 0,3, 1 et 3 mm de large sur 5 mm rend la phase de S₂₁ de la ligne MoM
de même largeur à 3° près et sa Z d'entrée à 15 % près ; une plage de 3 × 20 mm
rend son |S₂₁| à 1 % près jusqu'à 1,5 GHz.

**Les pastilles** portent leur capacité au plan, en dérivation à leur nœud,
**résolue en 3D** : méthode des moments sur la plaque (panneaux serrés vers les
bords et sous la moitié de la hauteur au plan, interactions exactes par la
primitive de 1/r sur un rectangle), avec la fonction de Green quasi-statique
EXACTE d'une charge posée sur un stratifié au-dessus de son plan — une série
d'images de raison K = (εr − 1)/(εr + 1) —, ou les images de deux plans en
triplaque. Bouts, coins et bords : tout y est. Ce modèle 3D ne connaît qu'un
stratifié homogène et un cuivre mince ; il est donc ÉTALONNÉ sur l'empilage
réel par la ligne infinie — C = C₃D(pastille) × C′₂D / C′₃D —, ce qui y ramène
le vernis épargne, l'épaisseur du cuivre et les diélectriques empilés. Le
morceau de piste qui entre dans la pastille est ôté. Étalonné : le carré
isolé (0,36679 × 4πε₀a, Read 1997) à 0,5 % près ; la capacité par mètre du
microruban contre Hammerstad-Jensen à 1 % près, dans le vide comme sur FR-4 ;
l'allongement de bout ouvert entre Hammerstad-Bekkadal et Kirschning-Jansen,
qui diffèrent déjà entre eux.

**Le couplage entre pistes du réseau.** Les tronçons droits sur la même
couche, parallèles à 15° près, à moins de trois hauteurs au plan de cuivre à
cuivre (la règle des 3H), forment des **groupes**. Deux pistes presque
parallèles n'ont pas un écart mais un écart par abscisse : chaque intervalle
est recoupé tant que l'écart y varie de plus de 5 % (ou de 10 µm), et chaque
morceau est une section droite à son propre écart. Les groupes — trois pistes côte à côte en
font un. Chaque groupe est découpé le long de son axe, et chaque intervalle où
plusieurs conducteurs sont présents devient une ligne couplée à 2N ports : [L]
et [C] par `ligne_mom.solve_multiline` (masse coplanaire du groupe comprise,
côté par côté), les pertes du cuivre par effet de peau et celles du
diélectrique, la **dispersion** du microruban appliquée MODE PAR MODE — la base
modale symétrique diagonalise [L] et [C] ensemble, chaque mode reçoit
l'ε_eff(f) et le Z(f) de Getsinger comme une ligne seule —, et la matrice de
chaîne par l'exponentielle des équations des
télégraphistes (Padé, stable même quand tous les modes vont à la même
vitesse ; sans pertes, elle redonne `crosstalk.chaine_mtl` à 1e-7 près). Aux
bords de chaque morceau couplé, un raccord d'un micron rend le coude ou le via
qui s'y trouve à la chaîne voisine, où `simuler` le compte. La fiche liste
chaque longement, ses conducteurs, sa longueur, son écart et son NEXT
saturé ; une case permet de le couper pour voir ce qu'il coûte au S₂₁.

**Les pistes des autres nets.** Une piste d'un autre net — ni masse, ni du
réseau — qui passe à moins de 2 mm du réseau part avec lui (60 au plus). Si la
règle des 3H la range dans un groupe, elle y entre comme un conducteur à part
entière : elle change l'impédance des lignes qu'elle longe, et ce qu'elle
reçoit s'en va, parce que ses deux bouts sont fermés sur sa propre impédance
caractéristique (ce qu'il y a au bout est hors du réseau ; la fermer adaptée,
c'est compter que l'énergie couplée ne revient pas). La fiche donne, par net,
la part de la puissance disponible de la puce qui y part. Le banc vérifie
qu'une voisine rend exactement la même piste posée en branche et fermée sur
son Z₀. Une voisine en arc n'entre pas dans les groupes.

**Le couplage magnétique des selfs.** Chaque self à deux broches devient un
**solénoïde** d'axe horizontal, d'une pastille à l'autre — la géométrie d'une
self bobinée CMS (LQW) : diamètre 70 % de la largeur du boîtier, longueur 60 %
de l'entraxe, centre à mi-hauteur du boîtier. Son nombre de tours se tire de
sa self par Wheeler : la mutuelle ne dépend que de la géométrie et des
valeurs. Les mutuelles se calculent par **Neumann** sur des segments, avec
l'**image** dans le plan de référence (le banc rend la formule exacte de
Maxwell pour deux spires coaxiales à 0,2 % près) : entre deux selfs à moins de
6 mm d'entraxe, et entre une self et chaque branche du réseau qui passe à
moins de 3 mm sur sa couche — la tension induite se pose au départ de la
branche, qui est courte devant la longueur d'onde. Tout se pose en impédance,
propres et mutuelles dans une même matrice. Deux 0402 côte à côte à 1 mm
d'axe à axe : k ≈ −0,5 % ; bout à bout à 0,6 mm : +0,4 %. Deux limites : le
sens d'enroulement n'est pas sur le dessin — il ne change rien entre deux
selfs d'une même série, mais fixe le signe de la mutuelle avec une piste ; il
est pris droit, et c'est dit —, et une self multicouche à axe vertical est
traitée comme une bobinée. Les capacités ne se couplent pas : leur champ
électrique reste entre leurs électrodes.

**Les fentes du plan de référence.** Sous chaque branche, la page suit le
plan qui lui sert de retour — le plus proche au-dessus et au-dessous — et
cherche où son cuivre manque. Un manque au milieu de la branche est une
**fente franchie** : on mesure de chaque côté la distance jusqu'où le plan se
referme sur la ligne de la piste, c'est-à-dire le détour du courant de retour.
Chaque détour d est une self par la formule de Ott (EMC Engineering, 2009),
L = (μ₀/π)·2d·ln(2d/W), les deux en parallèle ; en fréquence, chacun est un
tronçon de fente court-circuité, Z = jωL·tan(βd)/(βd), dans la permittivité
moyenne des deux faces du plan, avec une perte (Q ≈ 50) qui tient lieu de son
rayonnement. C'est une estimation d'ingénieur : une fente vraie rayonne. Un
plan coupé de bord à bord plafonne le détour à 30 mm et le dit — le retour y
passe par des condensateurs ou des coutures que le calcul ne voit pas. Un
trou plus petit que deux largeurs de piste (un antipad) est ignoré ; un manque
au BOUT d'une branche — la découpe d'usage sous une pastille RF — est signalé,
pas chiffré. Un changement de plan sous la piste par un via relève déjà du
modèle de via (retour par les vias de masse voisins, référence qui change de
net nommée). Un plan sans aucune zone dessinée est tenu pour plein.

**Les broches annexes.** Une autre broche de la puce (ou du connecteur) qui
touche le réseau — l'entrée RX d'un émetteur-récepteur dont la sortie TX est
le port, par exemple — y entre avec sa piste, comme un moignon. Elle est
ouverte par défaut, et la fiche accepte l'impédance R + jX qu'elle présente.

**Les pistes, par le solveur de l'onglet Impédance.** Chaque branche part dans
`simulation_em.simuler` exactement comme une sélection : section par MoM,
dispersion, pertes, coudes, vias et moignons. On lui demande sa matrice ABCD à
chaque fréquence (`garder_abcd`) et l'on n'y retouche pas — une piste a donc ici
le même Z₀ qu'à l'onglet Impédance, au chiffre près ; le banc le vérifie.

**Les composants.** Dans l'ordre : un modèle importé pour ce composant dans le
projet (📂, gardé avec la carte) ; sinon celui de la colonne « Modèle
Simulation », lu dans `LIB/lib_simulation` — celle que porte l'empreinte
posée depuis la bibliothèque, à défaut celle de la **ligne du catalogue**
(`LIB_composants.csv`) retrouvée par la référence fabricant ou le nom de
pièce : c'est ainsi que la visionneuse, dont le fichier IPC-2581 ne porte que
le nom de pièce, trouve les vrais modèles ; sinon le modèle rangé sous la
référence fabricant ; sinon un R, L ou C idéal tiré de la valeur. Un modèle
générique (`capacitor.sub`…) n'est qu'un gabarit à paramètres : c'est l'idéal
tiré de la valeur qui le remplace. Les sous-circuits SPICE sont lus **en linéaire**
(R, L, C, sous-circuits imbriqués, `PARAMS:`) : un transistor ou une diode
SPICE est refusé — il lui faudrait un point de polarisation — et la fiche
demande son `.sNp`. Les Touchstone v1 et v2 sont lus en S, Y ou Z, en MA, DB
ou RI, sans extrapolation hors de leur bande. Sous un composant en dérivation,
les vias qui descendent sa pastille de masse au plan comptent pour leur self
partielle (mutuelles comprises). Un via atteint par une **piste de masse** —
bout à bout sur quatre tronçons au plus — ajoute ce chemin : la self et la
résistance de peau de la piste au-dessus de son plan, en parallèle avec les
autres. Une pastille posée dans une **coulée de masse** voit la coulée
**maillée entière**, sur son cuivre réellement rempli, une seule fois pour
toutes les pastilles qui s'y posent, et chacun de ses vias la descend au
plan. Sans aucun via, la masse est idéale et
c'est dit.

**Le calcul.** Une analyse nodale : chaque branche devient un quadripôle Y,
chaque composant son admittance ; un bloc Touchstone se pose directement en S,
ses courants de broche en inconnues — un « thru » mesuré n'a pas de matrice Y.
Un 0 Ω fusionne ses deux nœuds. Chaque port est fermé sur sa référence et
attaqué à son tour, ce qui donne les paramètres S **généralisés** (ondes de
puissance) :

$$a = \frac{V + Z I}{2\sqrt{\Re Z}}, \qquad b = \frac{V - Z^* I}{2\sqrt{\Re Z}}$$

|S₂₁|² est alors le **gain transducique** — la part de la puissance disponible
de la puce qui arrive dans la charge —, et S₁₁ = 0 veut dire que la puce voit
le conjugué de sa sortie. Avec deux références réelles égales, on retombe sur
les S ordinaires.

**La fiche.** S₂₁ à f₀ et en pour-cent de la puissance disponible ; la Z vue
par la puce face à sa **cible** (le conjugué de sa sortie) ; la perte
d'insertion partagée entre **désadaptation** et **dissipation** — les confondre,
c'est retoucher une self quand c'est la piste qui chauffe. Les courbes S₂₁,
S₁₁, S₂₂ sur la bande, l'abaque de Smith de la Z vue par la puce, le tableau
des pistes (Z₀, pertes) et des vias de masse. Le `.s2p` exporté est
**renormalisé à 50 Ω** — Touchstone n'accepte pas de référence complexe — et
son en-tête porte les impédances réelles du calcul.

**« Et si ».** Chaque composant du chemin accepte une autre valeur (pF, nH,
Ω) : il devient un idéal de cette valeur le temps du calcul, la carte ne change
pas. On peut aussi exclure un composant (une diode ESD, un point de test).

**Le domaine de validité.** Ce simulateur est quasi-statique — sections en
2D, pastilles en 3D — avec la dispersion de Getsinger par-dessus : il ne voit
ni les modes supérieurs, ni les ondes de surface, ni le rayonnement, qui
demandent un solveur pleine onde (voir « Pourquoi pas l'onde complète »,
plus bas). Il calcule en revanche, sur la géométrie qu'il résout, OÙ il cesse
de valoir, et le dit : la coupure du premier mode supérieur de chaque piste,
c₀ / (2 W_eff √εr), W_eff étant la largeur équivalente tirée de la capacité
MoM ; la résonance propre de chaque pastille, au-delà de laquelle ce n'est
plus une capacité ; le couplage fort aux ondes de surface de chaque stratifié
en microruban (Bahl et Trivedi) et la coupure de son mode TE₁ ; et la
fréquence où (k₀h)², dont croissent les pertes par rayonnement des
discontinuités, atteint 1 %. La fiche porte la plus basse (« Validité :
quasi-statique jusqu'à … ») et un avertissement sort dès que la bande la
dépasse. Pour une piste de 0,35 mm sur 0,2 mm de FR-4, c'est 23,9 GHz ; pour
le réseau du SX1261 de la carte d'exemple, 12,9 GHz.

### PI — Impédance fréquentielle du PDN (Z(ω))

L'onglet **Z(ω) PDN** calcule et trace le profil d'impédance fréquentielle $|Z(f)|$
du réseau de distribution d'énergie (*Power Distribution Network*) de 10 kHz à 1 GHz
pour n'importe quel rail d'alimentation (+3V3, +5V, VDD...) présent sur la carte.

1. **Impédance cible ($Z_{target}$)** :
   $$Z_{target} = \frac{V_{dd} \cdot \text{ripple\%}}{\Delta I_{transient}}$$
   Elle définit le plafond au-delà duquel les appels de courant transitoires
   provoquent un dépassement du gabarit de tension admissible.

   **L'assistant ΔI est une option**, activée par la case « Calculer ΔI
   (assistant) » à côté du champ ΔI. Elle est décochée par défaut, et le choix
   est gardé dans le profil (`pdnOptions`). Décochée, le panneau reste simple :
   ΔI se saisit, le verdict compare Z à une cible unique, la courbe ne porte
   pas de repères, et l'assistant n'est qu'une ligne grisée qui dit comment
   l'activer. Cochée, ΔI est repris de l'assistant, comme décrit ci-dessous.

   **L'assistant ΔI.** « Combien de courant d'un coup ? » est la question que
   personne ne sait remplir, et un ΔI unique appliqué à toutes les fréquences
   est à la fois trop sévère et muet. L'assistant décrit donc les appels de
   courant comme des **événements**, chacun défini par deux grandeurs faciles à
   trouver : combien de courant, et en combien de temps.

   | Événement | ΔI | Fréquence |
   |---|---|---|
   | Réveil (veille → actif) | courant actif de la charge (datasheet, IDD) | $0{,}35 / t$, $t \approx 1$ µs |
   | Horloge | courant actif | fréquence d'horloge |
   | Sorties qui basculent ensemble | $N \cdot C \cdot V_{dd} / t$ | $0{,}35 / t$, $t$ = front (≈ 5 ns) |
   | Charge commutée (LED, relais…) | son courant | $0{,}35 / t$ |

   $0{,}35/t$ est la bande d'un front de durée $t$ : c'est là que l'événement
   tombe sur la courbe. Chacun est vérifié **à sa fréquence** :
   $\Delta V = \Delta I \times |Z(f)|$ doit rester sous $V_{dd}\cdot$ondulation.
   Les événements sont reportés sur la courbe par un repère numéroté, placé à
   la hauteur de leur propre cible (vert s'il tient, orange sinon).

   **Ondulation admise, ondulation estimée, ΔI.** Le champ « Ondulation
   admise » est une tolérance : ce que la tension a le *droit* de faire. Ce
   qu'elle *fait* est l'**ondulation estimée**, le plus gros
   $\Delta V = \Delta I \times |Z(f)|$ des appels de courant. C'est elle qui
   donne le verdict principal, et le verdict nomme l'appel fautif et sa
   fréquence. Le champ ΔI du haut n'est plus une saisie de plus : il **reprend
   automatiquement le plus gros appel de courant** de l'assistant
   (`simPDNSynchroDeltaI`), et sert à la vérification unique la plus sévère
   (ΔI max à toutes les fréquences), affichée en second. Le taper à la main le
   fixe (« manuel · ↺ assistant » pour revenir).

   **La fiche de la charge.** L'utilisateur ne décrit pas les événements : il
   recopie des valeurs de datasheet dans la fiche de la charge
   (`SIM_PDN_FICHE`), et chaque champ dit où les trouver :

   | Champ | Sert à | Défaut |
   |---|---|---|
   | Fréquence d'horloge (MHz) | fréquence de l'événement « horloge » | 16, à vérifier |
   | Consommation max en fonctionnement (mA) | ΔI du réveil et de l'horloge | 10, à vérifier |
   | Consommation en veille (µA) | retranchée du réveil | 0 |
   | Montée du courant au réveil (µs) | fréquence du réveil | 1 |
   | Sorties qui basculent ensemble | $N$ des sorties | 8, à vérifier |
   | Temps de montée des sorties (ns) | $t$ des sorties | 5 |
   | Charge par sortie (pF) | $C$ des sorties | 20 |
   | Courant max par sortie (mA) | borne $C\cdot V/t$ par broche | 0 (pas de borne) |
   | Tension min de fonctionnement (V) | situe la marge d'ondulation | 0 (non renseignée) |

   L'outil en déduit le réveil, l'horloge et les sorties
   (`simPDNEvenementsDepuisFiche`) ; seules les charges ajoutées à la main (LED,
   relais) se renseignent ligne par ligne. La fiche est enregistrée dans le
   **profil utilisateur** (section `pdnFiches`), sous la **référence de la
   pièce** (MPN, valeur, à défaut repère). Remplie une fois pour un
   microcontrôleur, elle resert sur toutes les cartes qui le portent, dans
   l'éditeur comme dans la visionneuse. Dans l'éditeur, le courant et l'horloge
   sont d'abord repris de la fiche bibliothèque du composant quand elle les
   donne (`pdnInfosCharge`). Le fichier IPC-2581 ne porte pas de consommation :
   dans la visionneuse, la fiche se remplit à la main la première fois.

2. **Branche VRM (Régulateur)** :
   Modélisée en basse fréquence par sa résistance série équivalente $R_{vrm}$ et son
   inductance de boucle $L_{vrm} = \frac{R_{vrm}}{2\pi f_{vrm}}$ :
   $$Y_{vrm}(\omega) = \frac{1}{R_{vrm} + j\omega L_{vrm}}$$

3. **Branches Condensateurs de découplage (Modèles réels Murata / Catalogue)** :
   Chaque condensateur connecté entre le rail et la masse est détecté automatiquement
   sur le PCB (`SIM_PCB.pdnCondensateurs(net)`, `SIM_IPC.pdnCondensateurs(net)`).
   Les deux outils appliquent les mêmes règles, qui vivent dans
   `commun/simulation-em.js` :
   - **ce qui est un condensateur** (`simPDNEstCondensateur`) : le type déclaré
     s'il dit quelque chose, puis une référence `C` suivie d'un chiffre, puis une
     valeur en farads si la référence ne désigne pas une autre famille ; au-delà de
     quatre broches, ce n'en est pas un. Le test historique `/^[cC]/` prenait `CN1`
     ou `CR1` pour des condensateurs, et l'éditeur typait « capacitor » toute
     empreinte sans type : un circuit intégré alimenté entrait dans la liste comme
     un 100 nF ;
   - **ses parasites** (`simPDNParasitesCapa`) : la base Murata par modèle SPICE,
     MPN (le champ `part` d'un IPC-2581) ou nom de pièce, puis des valeurs typiques
     par boîtier et par capacité. La copie embarquée de la base est dans `commun/` :
     la visionneuse n'en avait aucune dans le navigateur ;
   - **son inductance de montage** (`simPDNInductanceMontage`) : la table par
     boîtier (0,35 nH en 0201 à 1,3 nH en 1206) suppose le plan à 0,2 mm sous la
     face. Quand la cavité est connue, elle est corrigée par la longueur $h$ de la
     paire de vias entre la face du composant et le premier plan de la cavité :
     $L_{mount} = L_{table} + 0{,}76\ \text{nH/mm}\cdot(h - 0{,}2\ \text{mm})$,
     soit $(\mu_0/\pi)\ln(s/r)$ pour $s = 1$ mm et $r = 0{,}15$ mm. Un
     condensateur posé sur la face qui porte elle-même un plan de la cavité a
     $h = 0$ ;
   - **sa piste jusqu'à la charge** (`simPDNCheminsPiste`), comptée **seulement
     sans cavité**. Le plus court chemin dans le cuivre du rail (pistes, arcs,
     jonctions en T) relie les pastilles du condensateur à celles de la charge
     détectée. Le long de ce chemin, on cumule l'inductance
     $L' = Z_0^{air}/c$ (Hammerstad, hauteur jusqu'au plan de masse le plus
     proche) et la résistance DC du cuivre. Les deux s'ajoutent en série à $Z_k$.
     Une piste de 0,5 mm à 1,5 mm de la masse vaut 0,64 nH/mm : un 1 µF au bout
     de 30 mm porte une vingtaine de nH, et sa résonance série (0603) descend
     d'environ 4 MHz à environ 1 MHz. Sans ce terme, le modèle localisé posait chaque
     condensateur au pied de la charge. Un condensateur que le cuivre ne relie
     pas reçoit une distance à vol d'oiseau, signalée « ≈ » dans le tableau.
     Les **polygones de cuivre** du rail conduisent aussi : un export réel
     dessine volontiers une piste épaisse comme un polygone. Chaque polygone
     est tramé (trous compris), les nœuds qui tombent dedans sont reliés par le
     plus court chemin *dans* le cuivre, et la largeur équivalente vaut
     aire / plus longue traversée. Dans la visionneuse, un composant dont les
     pastilles ne sont rattachées à personne (pastilles libres de l'export) est
     relié au net par ses **broches** (`pins`), placées comme des pastilles.
     Avec une cavité, c'est l'épandage qui porte ce trajet : la piste n'est pas
     comptée une seconde fois.

   L'impédance de chaque branche :
   $$Z_k(\omega) = \text{ESR}_k + j \left(\omega (\text{ESL}_k + L_{mount,k}) - \frac{1}{\omega C_k}\right)$$
   $$Y_k(\omega) = \frac{1}{Z_k(\omega)}$$

4. **Branche Capacité inter-plans de la cavité** :
    **La cavité est détectée, elle n'est plus supposée** (`simPDNChoisirCavite`).
    Pour chaque couche, on retient le plus grand versement du rail et le plus grand
    versement de masse (au moins 1 cm²). Parmi les couples qui se font face, la
    cavité est le plus rapproché. $d$, $\varepsilon_r$ et $\tan\delta$ sont ceux des
    diélectriques qui séparent **ces deux couches**, moyennés à l'épaisseur.
    $A_{plane}$ est la surface en regard, approchée par la plus petite de ces trois
    valeurs : aire du rail, aire de la masse, recouvrement de leurs boîtes.
    L'emprise $a \times b$ et l'origine sont celles de ce recouvrement, et les
    positions des composants sont ramenées à ce coin. Sans paire (carte deux
    couches, rail routé en pistes), le plan est décoché, le solveur reste localisé
    et le panneau dit pourquoi. Avant, l'éditeur lisait `S.stackup`, qui n'existe
    pas (100 µm sur toutes les cartes), la visionneuse prenait le premier
    diélectrique de l'empilage, et les deux supposaient partout une cavité
    pleine carte.
    La capacité répartie et les pertes diélectriques $\tan\delta$ sont intégrées :
    $$C_{plane} = \frac{\varepsilon_0 \varepsilon_r A_{plane}}{d_{dielectrique}}$$
    $$Z_{C,plane}(\omega) = \frac{1}{\omega C_{plane}\tan\delta + j\omega C_{plane}}$$
    C'est le terme $(0,0)$ du développement modal ci-dessous, et le point de départ
    de la somme : la branche cavité s'accumule en **impédance**, et n'est convertie
    en admittance qu'une fois complète, pour la mise en parallèle finale.

5. **Résonances spatiales 2D de cavité entre plans (Modes $TM_{mn0}$)** :
   Une paire de plans continus (largeur $a$, longueur $b$, espacement $d$) forme une cavité résonante 2D ouverte sur les bords.
   - **Fréquences propres des modes $TM_{mn0}$** :
     $$f_{mn} = \frac{c}{2\sqrt{\varepsilon_r}} \sqrt{\left(\frac{m}{a}\right)^2 + \left(\frac{n}{b}\right)^2}$$
     avec $m, n \ge 0$ et $m + n \ge 1$ (modes longitudinaux $TM_{m0}$, transversaux $TM_{0n}$, et diagonaux $TM_{mn}$).
   - **Pertes et Facteurs de qualité $Q_{mn}$** :
     Le facteur $Q$ combine les pertes diélectriques $Q_d = \frac{1}{\tan\delta}$ et l'effet de peau dans le cuivre $Q_c \approx \frac{d}{\delta_s(f_{mn})}$ (où $\delta_s = \frac{1}{\sqrt{\pi f \mu_0 \sigma_{cu}}}$) :
     $$\frac{1}{Q_{mn}} = \tan\delta + \frac{\delta_s(f_{mn})}{d}, \quad \Delta f_{3\text{dB}} = \frac{f_{mn}}{Q_{mn}}$$
   - **Distribution spatiale des ondes stationnaires & Points chauds HF** :
     $$V_{mn}(x, y) = V_0 \cos\left(\frac{m\pi x}{a}\right) \cos\left(\frac{n\pi y}{b}\right)$$
     Les quatre coins $(0,0), (a,0), (0,b), (a,b)$ et les arêtes présentent systématiquement des ventres d'onde ($|V|=1$, points chauds), sources d'émission et de rayonnement CEM de bord de carte.
   - **Impédance modale vue au port, sommée en série** :
     Chaque mode se comporte comme un circuit RLC parallèle, et le développement
     d'Okoshi / Novak fait s'**additionner ces impédances** à celle de la capacité
     statique — ce n'est pas une mise en parallèle d'admittances :
     $$Z_{plane}(\omega) = Z_{C,plane}(\omega) + \sum_{m,n \ne 0,0} \frac{j\omega\, c_m^2 c_n^2 / C_{plane}}{\omega_{mn}^2 - \omega^2 + j\omega\omega_{mn}/Q_{mn}}, \quad c_m = \begin{cases} 1 & m = 0 \\ \sqrt{2} & m \ge 1\end{cases}$$
     À la résonance le terme vaut $|Z_{mn}| = Q_{mn} c_m^2 c_n^2 / (\omega_{mn} C_{plane})$ : c'est le pic
     d'anti-résonance du plan. Loin sous le premier mode, tous les termes s'effacent
     et il ne reste que $1/(\omega C_{plane})$ — le plan redevient un simple condensateur.
     Sommer les **admittances** modales à la place inverse le comportement : le pic
     disparaît (à la résonance $Z_{mn}$ est grand, donc $Y_{mn} \approx 0$) et le plan
     dégénère en court-circuit partout ailleurs.
   - **Amortissement par les condensateurs du PCB** :
     L'efficacité locale d'amortissement de chaque condensateur dépend de sa position : $\kappa = |\cos(m\pi x_i/a)\cos(n\pi y_i/b)|$. Un condensateur placé sur une ligne nodale ($V=0$) n'amortit pas ce mode, tandis qu'un composant placé aux coins ou en bordure l'atténue fortement.

6. **La cavité est un réseau à $(1+n)$ ports, pas un nœud** :
   Une paire de plans ne relie pas les composants entre eux, elle les sépare. Le
   solveur en fait donc un réseau dont les ports sont le **point observé** — le
   composant alimenté dont on mesure $Z(\omega)$, aux coordonnées $(x_0, y_0)$ — et
   un port par condensateur, à sa position réelle sur la carte :
   $$Z_{ij}(\omega) = \underbrace{\frac{1}{j\omega C_{plane}}}_{\text{mode }(0,0)} + j\omega L_{ij}^{\infty}
     + \sum_{m,n} \frac{j\omega\, c_m^2 c_n^2 / C_{plane} \cdot \kappa_{i,mn}\kappa_{j,mn}}{\omega_{mn}^2 - \omega^2 + j\omega\omega_{mn}/Q_{mn}}$$
   $$\kappa_{i,mn} = \cos\frac{m\pi x_i}{a}\cos\frac{n\pi y_i}{b}
     \cdot \mathrm{sinc}\frac{m\pi w}{2a}\cdot\mathrm{sinc}\frac{n\pi w}{2b}$$
   Chaque condensateur **termine** son port avec sa propre impédance $Z_k$, et le
   réseau se réduit à un 1-port par complément de Schur :
   $$Z_{in}(\omega) = Z_{00} - Z_{0L}\,(Z_{LL} + \mathrm{diag}(Z_k))^{-1}\,Z_{L0}$$
   La cavité est réciproque, donc $Z_{L0} = Z_{0L}^{T}$ et un seul vecteur suffit.
   Le VRM reste en parallèle sur le point observé — sa position n'est pas connue du
   modèle, et là où il pèse, sous le mégahertz, la cavité est de toute façon
   équipotentielle :
   $$Y_{tot}(\omega) = G_{tot} + j B_{tot} = Y_{vrm} + \frac{1}{Z_{in}(\omega)},
     \qquad |Z_{pdn}(\omega)| = \frac{1}{\sqrt{G_{tot}^2 + B_{tot}^2}}$$
   **Ce modèle dégénère exactement en l'ancien** partout où la cavité est
   équipotentielle : quand seul le terme $(0,0)$ compte, tous les $Z_{ij}$ valent
   $1/(j\omega C_{plane})$, le réseau se réduit à un shunt unique et la réduction
   redonne, au bit près, la mise en parallèle du VRM, des condensateurs et du plan.
   C'est ce que le banc vérifie en deçà de 100 kHz. Un condensateur dont on ignore
   les coordonnées est posé sur le port observé : on ne lui invente pas de distance,
   il redevient simplement parallèle.

   **Inductance d'épandage $L_{ij}^{\infty}$.** Sous sa résonance, un mode n'oscille
   plus, il inducte : son terme tend vers $j\omega K_{mn}/\omega_{mn}^2$, une
   inductance pure. Or ce sont les modes d'ordre élevé, très au-dessus de la bande
   tracée, qui portent l'essentiel de l'inductance locale. Tout ce que la liste des
   modes résonants ne couvre pas est donc sommé analytiquement, une fois pour
   toutes, hors de la boucle en fréquence :
   $$L_{ij}^{\infty} = \frac{\mu_0 d}{\pi^2 a b}\sum_{m,n}
     \frac{c_m^2 c_n^2\,\kappa_{i,mn}\kappa_{j,mn}}{(m/a)^2 + (n/b)^2}$$
   $\varepsilon_r$ disparaît, comme il se doit pour une inductance, et la somme est
   symétrique et linéaire en $d$ — trois invariants que le banc éprouve.

   **Pourquoi l'ouverture du port n'est pas un détail.** L'auto-impédance d'un port
   *ponctuel* diverge : $\sum 1/((m/a)^2+(n/b)^2)$ croît sans limite, et $Z_{00}$ avec
   elle. Mesuré sur un plan de 100 × 80 mm, $Z_{00} - Z_{0L}$ passait de 1,07 · 10⁻²
   Ω à l'ordre 4 à 2,23 · 10⁻² Ω à l'ordre 45, sans se stabiliser : le chiffre
   mesurait la troncature, pas la carte. C'est la taille finie du port — l'écartement
   $w$ de la paire de vias qui traverse les plans — qui fait converger la somme, via
   le facteur $\mathrm{sinc}$ porté par $\kappa$ : il éteint les modes plus courts que
   le port lui-même. L'ordre de troncature est donc choisi d'après $w$, là où ce
   facteur a fait son office ($\approx 1{,}6\,a/w$). Avec $w = 1{,}5$ mm par défaut,
   l'auto-inductance d'un coin vaut 0,34 nH et celle du centre 0,07 nH : un coin est
   confiné par deux bords, le centre ne l'est pas.

   Le solveur identifie ensuite les fréquences d'anti-résonance (pics d'impédance
   créés par l'interaction inductive/capacitive entre condensateurs, épandage et
   modes de cavité) et vérifie la stricte conformité face à $Z_{target}$.

   **Maillage en fréquence.** La grille est logarithmique (200 points par défaut sur
   les cinq décades, soit 40 par décade), mais un pic modal à $Q \approx 30$ est plus
   étroit que ce pas : il tomberait entre deux échantillons et $Z_{max}$ dépendrait de
   la grille au lieu de la physique. Le solveur ajoute donc un point exactement sur
   chaque $f_{mn}$ de la bande, plus ses deux flancs à $f_{mn}(1 \pm 1/2Q_{mn})$.
   `freqs` n'est donc pas strictement uniforme en log, et sa longueur dépasse
   `nbPoints` : tout consommateur doit lire `result.freqs`, jamais reconstruire la grille.

   **Le point observé.** Il se règle dans le panneau (`portXmm`, `portYmm`) et
   apparaît en réticule blanc sur la cartographie 2D. Il se saisit **dans le
   repère affiché par l'outil** : origine utilisateur dans l'éditeur,
   coordonnées du fichier dans la visionneuse. Le solveur le ramène à la cavité
   en retranchant l'origine de celle-ci (`caviteX0Carte`, `caviteY0Carte`). Il le
   lisait auparavant dans le repère de la cavité, dont l'origine est un coin du
   versement retenu : sur un plan partiel, une coordonnée recopiée de l'écran
   tombait ailleurs. La détection le pose sur le
   composant que le rail alimente (`simPDNChoisirCharge`) : parmi ceux qui touchent
   le rail et la masse, passifs et connecteurs écartés, celui qui a le plus de
   broches. Un microcontrôleur l'emporte ainsi sur son régulateur. Sans candidat,
   il reste à un coin, qui est un ventre pour **tous** les modes : c'est le cas le
   plus défavorable. L'efficacité $\kappa$ d'un
   condensateur ne se lit pas dans l'absolu mais par rapport à ce point : c'est la
   différence $Z_{00} - Z_{0L}$ qui le pénalise, pas sa distance en millimètres.

   **Ce que le modèle ne fait pas.** Le VRM n'a pas de position : il reste en
   parallèle sur le point observé (voir ci-dessus). Les modes résonants sont tous
   ceux dont la fréquence tombe sous $\max(1{,}5\,f_{max},\ 2{,}5\ \text{GHz})$, et
   leur ordre suit donc la taille de la carte. La liste était bornée à
   $m, n \le 4$ : sur une carte de 400 mm, TM₅₀ (≈ 903 MHz) passait pour une
   inductance pure. Les pertes ohmiques du cuivre dans le plan (résistance DC
   d'épandage) ne sont pas modélisées : seules le sont les pertes diélectriques et
   l'effet de peau, à travers $Q_{mn}$. Enfin le développement modal suppose un
   rectangle **plein**. Un plan partiel ou découpé est traité comme le rectangle
   de même emprise, avec la capacité de sa surface réelle ; les fréquences des
   modes restent celles de l'emprise. Un condensateur hors de l'emprise est ramené
   sur son bord.

7. **Interactivité, Cartographie 2D & What-If** :
   - Tracé SVG logarithmique (décades 10 kHz à 1 GHz vs 1 mΩ à 100 Ω) avec ligne de jauge $Z_{target}$ et repères verticaux des modes 2D ($TM_{10}, TM_{01}, \dots$).
   - Curseur de mesure interactif au survol de la souris sur la courbe $Z(\omega)$.
   - Cartographie spatiale 2D (Heatmap SVG) affichant l'onde stationnaire $|V_{mn}(x,y)|$, les lignes nodales ($V=0$), les points chauds aux coins, le réticule du point observé et l'incrustation des condensateurs réels avec leur efficacité locale.
   - Sélecteur de mode interactif ($TM_{10}, TM_{01}, TM_{11}, TM_{20}, \dots$), sonde de tension spatiale au survol du plan, tableau de synthèse modale et export unifié CSV/JSON.
   - Tableau interactif des condensateurs avec cases à cocher pour activer/désactiver chaque composant et observer instantanément la déformation du profil $Z(\omega)$.


Changer de famille n'efface pas le résultat : la carte de chaleur s'éteint —
elle appartient à l'analyse d'impédance et n'a rien à dire sous un autre onglet
— et revenir la rallume telle quelle, sans recalcul.

### Régler les simulations depuis une datasheet

Dans l'éditeur PCB et la visionneuse, l'assistant IA lit une datasheet jointe
(📎, ou PDF glissé sur le volet) et propose des valeurs pour **toutes** les
simulations. Le bouton « ⚙️ Paramétrer les simulations avec cette datasheet »
pose la question pour vous.

| Simulation | Ce que la datasheet règle |
|---|---|
| PDN, fiche de la charge | fréquence d'horloge, IDD actif / veille, temps de réveil, front et courant des sorties, VDD min |
| PDN, cible et régulateur | Vdd, ondulation admise, R_vrm (load regulation), f_vrm (bande passante de boucle), ΔI s'il est donné tel quel |
| PDN, stratifié et condensateurs | εr, tanδ ; ESR, ESL et capacité effective, par repère, MPN ou valeur |
| SI (impédance, Z diff, crosstalk, retour, santé) | temps de montée, amplitude, marge de bruit, impédances visées et tolérances, f₀ |
| Bus synchrone | protocole, fréquence, tsu / th du récepteur, tco min / max de l'émetteur, pull-up I2C, débit UART |
| Chute DC | courant total par composant (réparti sur ses broches), tension des sources, budgets, ambiante, conductivité du stratifié |

**La liste est fermée** (`commun/simulation-datasheet.js`) : chaque clé a son
unité et ses bornes physiques, et l'IA reçoit ce catalogue avec les valeurs en
cours. **Rien ne s'applique sans être vu** : « 🔍 Vérifier et appliquer… »
affiche chaque valeur à côté de la valeur actuelle, avec la page et la citation
de la datasheet. On coche ce qu'on garde. Une valeur hors bornes, une clé
inconnue ou un composant absent de la carte est refusé, motif affiché. Une
valeur donnée en confiance basse arrive décochée.

Après application, ce qu'un réglage invalide est oublié (f₀ ou front changé →
résultat SI à relancer), Z(ω) se recalcule, et l'assistant ΔI s'allume si la
fiche de la charge a été remplie. Les condensateurs réglés portent le badge
« Datasheet », les bornes DC le badge « DS ». Les parasites relevés sont gardés
dans le profil **par MPN** et survivent à « ⚡ Détecter » ; sans MPN, ils ne
valent que pour la session.

Les trois modèles du sélecteur lisent le PDF, Gemma 4 compris. Il part chez
Google AI Studio avec le message : à éviter pour un document sous NDA.

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
constantes. Le banc le mesure, dont la comparaison d'ε_eff contre
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

Le détail, les mesures et le cas de non-régression sont dans
[HISTORIQUE_DEVELOPPEMENT.md](HISTORIQUE_DEVELOPPEMENT.md) et [A-FAIRE.md](../A-FAIRE.md).
Le jour où ce port sera là, le moteur apportera ce
que le modèle de ligne ne peut pas donner — les coudes réels, les résonances,
le rayonnement, le couplage entre pistes non parallèles — et les deux se
compléteront.

