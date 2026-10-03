# Vérification de la carte — tutoriel

> **Guide d'utilisation** de l'analyse « Audit de la carte » du panneau Simulation EM,
> commune à l'**éditeur PCB** et à la **visionneuse IPC-2581**. Les dérivations
> physiques et les étalons des moteurs réutilisés sont dans
> [simulation-em.md](simulation-em.md) ; le reste à faire, dans
> [A-FAIRE.md](../A-FAIRE.md).

---

## 1. À quoi ça sert

Les autres onglets de simulation répondent à une question sur **une liaison
que vous avez choisie**. La vérification de la carte fait l'inverse : elle
passe **toute la carte, tous les nets, sans sélection**, et rend la liste de ce
qui mérite un regard, du plus grave au moins grave, chaque ligne cliquable pour
aller voir sur le cuivre.

Elle couvre seize familles de règles :

| Règle | Ce qu'elle cherche | Sévérité |
| :--- | :--- | :--- |
| **Angles des pistes** | angles aigus, angles droits, jonctions en T ou en étoile, segments hors 45° | critique / vigilance / vigilance / info |
| **Bouts de piste orphelins** | piste reliée à rien, bout libre au départ d'une pastille (antenne), moignon, dépassement après un coin | critique ou vigilance, et à sa cadence sur un signal |
| **Empilage** | couche de signal sans plan collé contre elle, deux couches de signal face à face, alimentation loin de sa masse, empilage dissymétrique | selon le cas (constat de carte) |
| **Impédance des nets** | Z₀, R, L, C de chaque net ; les tronçons qui s'écartent de la référence | à la cadence |
| **Chemins de retour** | chaque via de signal qui change de plan de référence : son courant de retour a-t-il un chemin court ? | à la cadence |
| **Fentes et vides des plans** | une piste qui passe au-dessus d'un vide de son plan de référence | à la cadence |
| **Vias de couture** | le plus grand trou sans via entre deux couches de la même masse | à la cadence |
| **Diaphonie** | chaque couple de pistes voisines de nets différents, sur la même couche ou entre deux couches voisines, et la somme des agresseurs d'une victime | à la cadence |
| **Paires différentielles** | Z_diff le long de la paire (masse coplanaire comprise), écart de longueur, plan sous une seule moitié, vias en nombre différent | à la cadence |
| **Découplage** | un condensateur vers la masse au pied de chaque broche d'alimentation de circuit intégré, par le chemin réel ; sa résonance selon sa valeur | à la cadence |
| **Bord de carte** | cuivre trop près du détourage, piste rapide qui longe le bord, clôture de vias, règle des 20 H | critique / vigilance, à la cadence, info |
| **Moignons de vias** | le bout de perçage que le signal n'emprunte pas | à la cadence |
| **Branches en T** | une dérivation vers une deuxième charge, hors pastille | à la cadence |
| **Quartz** | pistes longues vers l'oscillateur, autre chose que la masse dessous | vigilance / critique |
| **Protection ESD** | un signal de connecteur sans protection vers la masse à moins de 10 mm | vigilance, info si le connecteur n'a rien de protégé |
| **Courant des rails** | ce que la piste la plus étroite d'un rail tient (IPC-2221) face au courant donné ; les étranglements | vigilance / critique, info sans courant |

C'est l'outil de **revue avant fabrication** : sur un fichier IPC-2581 reçu
d'un fabricant ou d'un collègue, il dit en une vingtaine de secondes où
regarder (P01x274 : 20 s, dont 10 pour la diaphonie et 8 pour les impédances).

---

## 2. Lancer une vérification

**Dans la visionneuse IPC-2581**

1. Ouvrez le fichier (`Ouvrir un fichier…`). La fenêtre de classification des
   nets s'ouvre : vérifiez-la (voir [§ 6](#6-corriger-la-classe-dun-net)), puis
   fermez-la.
2. Vérifiez l'**empilage** dans le panneau « La carte » : les règles
   électriques en ont besoin (plans de référence, épaisseurs, εr). Sans
   empilage, seuls les angles, les bouts orphelins et le découplage sont
   jugés, et le rapport le dit.
3. `Simulation EM…` → famille **Audit de la carte** → onglet **Vérification**.
4. Réglez si besoin (§ 3), puis **▶ Vérifier la carte**.

La visionneuse envoie tout ce que le fichier décrit : pistes et arcs, pastilles
placées, surfaces de cuivre (plans et versements, dégagements compris), contour
de la carte, trous métallisés et leur portée quand le fichier la déclare,
broches de chaque composant avec leur net.

**Dans l'éditeur PCB** : même chemin, bouton `Simulation EM…`. L'empilage est
celui de la carte (rôles de couches, nets des plans) ; les zones partent comme
surfaces de cuivre, les découpes comme trous. Une carte deux couches sans plan
ne se juge qu'en partie — pas de ligne sans référence —, et le rapport le
signale.

**En ligne de commande** (angles seulement, sans empilage) :

```bash
python python/analyse_carte.py IPC2581_Exemple/P01x274PCB-C.xml
```

---

## 3. Les réglages

Chaque classe de net a sa **cadence maximale** : la fréquence la plus haute à
laquelle ses nets basculent (une horloge à 50 MHz, un I2C sous 1 MHz). Les
règles électriques se jugent **à cette cadence**, une colonne par constat. Le
front de montée pris en compte est :

> **t_r effectif = min(front de la classe, 10 % de la période de sa cadence)**

et la règle juge au **genou** 0,35 / t_r, là où s'arrête l'énergie du front.
Pourquoi : c'est d'abord la **techno** qui fixe le front (un GPIO de
microcontrôleur monte en quelques ns même s'il ne bascule qu'à 100 kHz) ; mais
un net cadencé vite ne peut pas avoir de front lent (à 100 MHz, pas plus de
1 ns).

Il n'y a plus de « fréquences d'analyse » communes à toute la carte : elles
donnaient trois colonnes presque toujours identiques, et la cadence d'un net
dépend de sa classe, pas de la carte.

Les réglages se lisent dans un **tableau, une ligne par classe** (front,
cadence max, Z₀ visée, exemples de nets) :

| Classe | Front | Cadence max | Exemples |
| :--- | :--- | :--- | :--- |
| Horloge | 2 ns | 50 MHz | oscillateur, CLK, MCLK, XIN/XOUT d'un quartz |
| Rapide | 1 ns | 100 MHz | USB, Ethernet, DDR, HDMI, LVDS |
| RF | 100 ps | 1 GHz | antenne LoRa, Wi-Fi/BLE, vers un SMA |
| Analogique | 100 ns | 1 MHz | entrée d'ADC, capteur, référence, audio |
| Lent | 10 ns | 10 MHz | GPIO, LED, bouton, reset, I2C, UART ; tout net non classé |
| Découpage | 5 ns | 2 MHz | nœud SW d'un hacheur, qui agresse ses voisins |

Chaque cadence par défaut reste sous 0,1 / t_r : à réglages par défaut, c'est
le **front** de la classe qui juge, la cadence ne l'écrase pas. Une horloge
déclarée à 100 MHz, elle, voit son front ramené à 1 ns (genou 350 MHz).

| Autre réglage | Défaut | Sert à |
| :--- | :--- | :--- |
| Z₀ des lignes | 50 Ω | juger la réflexion d'un via ou d'une fente ; la cible des nets Horloge, Rapide et RF |
| Z diff des paires | 100 Ω | la cible des paires différentielles (USB : 90 Ω) |
| diaphonie tolérée | 5 % | budget de diaphonie (vigilance au-delà de la moitié) |
| porteuse des nets RF | vide | remplie (868 MHz pour du LoRa), les nets RF se jugent à cette porteuse, au lieu de leur front et de leur cadence |

Un front plus long que la demi-période de sa cadence, ou sous 10 ps, est
signalé sous le tableau : c'est presque toujours une faute d'unité.

Chaque cadence et chaque front a sa **liste d'unités** (Hz à GHz, ps à µs) :
en changer **convertit** la valeur affichée, elle ne la réinterprète pas.

Changer un réglage ne relance rien : cliquez de nouveau sur **▶ Vérifier la
carte**. Les réglages employés sont écrits en tête du rapport.

---

## 4. Lire le rapport

**L'en-tête** donne le compte par sévérité — sur les nets seulement, les
marquages à part —, ce qui a été jugé (pistes, vias de signal, couples
voisins, nets chiffrés en impédance, vides de plan franchis, cavités de masse,
paires, circuits et broches d'alimentation, bouts libres), les réglages, et les
**réserves** du serveur en encadré (empilage absent, contour absent, plan
déclaré sans cuivre…). Une réserve dit ce qui n'a PAS été vérifié : ne la
lisez pas comme un « tout va bien ».

**Un bloc par règle**, le plus grave d'abord. Chaque bloc dit en une phrase
pourquoi la règle compte, puis range ses constats **par net**. À côté du nom
du net : **sa classe** (Horloge, Rapide, RF…). C'est elle qui fixe le front,
donc le verdict — un net mal classé se voit là. Les constats d'**empilage**
n'appartiennent à aucun net et n'ont pas de position : ils se rangent sous
« toute la carte ».

**Chaque ligne** : la couche (ou « couche → couche » pour un via, « couche ↔
couche » pour une cavité), la position en mm, le constat chiffré, et pour les
règles électriques **une pastille**, à la cadence de la classe, colorée selon le
verdict (ambre : vigilance, rouge : critique). La valeur d'une pastille est :

- un **pourcentage** : la réflexion |Γ| (retour, fente, impédance, paire), le
  niveau de diaphonie, l'aller-retour 2T_d d'un moignon rapporté au front ;
- ou un **rapport à une longueur** : « × λ/20 » (couture, bord), « × λ/40 »
  (découplage). Au-delà de 1, vigilance ; au-delà de 2, critique.

Au survol d'une pastille : le front effectif et le genou où l'on a jugé (et,
pour une paire, l'écart de longueur en % du front).

**Un clic sur une ligne** amène la vue sur le point et y pose une marque de la
couleur de la sévérité.

**Deux sections repliées, rangées à part** :

- **Marquages : cuivre sans net** — texte, logos, repères de couche dessinés
  en cuivre. C'est du vrai cuivre, jugé comme le reste, mais il ne porte pas de
  signal. Sur P01x274, 22 des 24 angles droits sont là.
- **Nets classés Lent par défaut, non vérifiés** — aucun indice (nom, motif,
  composant relié) ne les a classés. Un net rapide au nom automatique
  (`$BN000004`) s'y cache, et il serait jugé comme lent sans le dire.
  Parcourez cette liste à chaque nouvelle carte.

---

## 5. Les règles, une par une

### Angles des pistes

- **Angle aigu** (critique) : deux branches à moins de 89°. Le fond du V
  retient le bain de gravure (*acid trap*).
- **Angle droit** (vigilance) : coude à 90° ± 1°. Les fabricants le tiennent ;
  un chanfrein à 45° reste plus propre.
- **Jonction** (vigilance) : trois branches ou plus au même point, ou un bout
  de piste posé au milieu d'une autre (T).
- **Hors 45°** (info) : segments hors des huit directions, une ligne par piste.

Ne sont **pas** jugés : un sommet posé dans une pastille ou un via (la piste y
entre et en repart, le cuivre de la pastille recouvre l'angle), et un V dont
une branche est plus courte que (w/2)/tan(θ/2) — son coin ne s'ouvre jamais,
comme les micro-zigzags de quelques microns que laissent certains exports.

**Corriger** : dans l'éditeur PCB, sélectionnez la piste et **Angle droit →
45° (D)** dans l'inspecteur. Une jonction se déplace dans une pastille ou se
supprime ; un T sur une liaison rapide est aussi un **moignon**.

### Bouts de piste orphelins

Un **bout libre** est une extrémité de piste qui ne touche rien : ni pastille,
ni via, ni une autre piste de son net (un bout posé *dans* le cuivre d'une
autre piste y est relié, même à quelques microns de son extrémité), ni le
versement de son net. On remonte la piste jusqu'à ce qui la retient — y
compris au milieu d'un segment : un T posé sur son corps, une pastille qu'elle
traverse, le versement où elle entre.

| Ce qu'on trouve au bout | Constat | Sévérité de base |
| :--- | :--- | :--- |
| rien : l'autre bout est libre aussi | **Piste isolée**, reliée à rien | critique |
| une pastille | **Bout libre** : la piste est une antenne | vigilance |
| un embranchement, à moins de 0,5 mm (ou 2 w) | **Dépassement** après un coin | vigilance |
| un embranchement, plus loin | **Moignon** en bout de branche | vigilance |

Sur un net de signal, le bout se juge aussi à la cadence de sa classe : un moignon
réfléchit dès que son aller-retour 2T_d dépasse **10 %** du front (**20 %** :
critique). Ne sont pas signalés : les bouts plus courts que le bout arrondi de
la piste elle-même (un arrondi d'export), et le cuivre sans net.

Sur P01x290, la règle trouve la piste de `NBIOT_UART_RX` qui s'arrête à
1,2 mm de la pastille de son connecteur, sans la toucher : 35 mm d'antenne,
critique dès que le front descend à 1 ns.

**Corriger** : raccorder la piste, la raccourcir jusqu'à l'embranchement, ou
la supprimer.

### Empilage

Des constats de **carte**, sans position :

| Ce qu'on regarde | Sévérité |
| :--- | :--- |
| une couche qui porte des signaux n'a **aucun plan** de référence dans l'empilage | critique s'il y passe un net rapide (Horloge, Rapide, RF, Découpage), vigilance sinon |
| le plan le plus proche est **derrière une autre couche de cuivre** | vigilance |
| le plan collé est à plus de **0,5 mm** et la couche porte des nets rapides | vigilance |
| deux couches de **signal face à face** sans plan entre elles | vigilance (couplage large face si des pistes s'y suivent) |
| un plan d'alimentation séparé de sa masse par une couche de signal | vigilance |
| une cavité alimentation / masse de plus de **0,25 mm** | info (avec sa capacité en pF/cm²) |
| nombre impair de couches de cuivre, épaisseurs en miroir à plus de 10 %, plan face à un signal en miroir | vigilance / vigilance / info : la carte voile au refusion |

**Corriger** : ajouter un plan, rapprocher la couche de signal de son plan
(diélectrique plus mince), coller la cavité alimentation / masse, rendre
l'empilage symétrique.

### Impédance des nets

Chaque section d'un net — couche, largeur, **écart à la masse coplanaire** de
sa couche, mesuré de chaque côté dans le cuivre des versements jusqu'à 2 mm —
est résolue par la méthode des moments : Z₀, vitesse, capacité linéique. D'où,
par net : longueur, retard T_d, **R** (cuivre à 20 °C), **L** et **C**.

Un tronçon d'impédance Z dans une ligne de référence Z_ref réfléchit
|Z − Z_ref| / (Z + Z_ref) — mais seulement s'il est assez long pour que le
front le voie : une discontinuité courte réfléchit **Γ · 2T_d / t_r**. La
référence est la **cible Z₀** pour les classes à impédance tenue (Horloge,
Rapide, RF), l'**impédance dominante du net** sinon (un rétrécissement dans une
piste lente se voit, une piste uniforme ne se compare qu'à elle-même). Seuils :
5 % / 10 %, comme un via.

Sur P01x274, la ligne RF `LNA` n'est plus signalée une fois sa masse
coplanaire prise en compte ; `RFID_SIGN0057` (257 mm, 72–82 Ω face à 50 Ω) l'est.

**Corriger** : élargir la piste, la rapprocher de son plan, la noyer dans une
masse coplanaire à écart constant, supprimer les rétrécissements.

### Chemins de retour

Pour chaque via de **signal** (ni masse ni alimentation) qui fait passer son
net d'une couche à une autre, le serveur regarde le plan de référence des deux
côtés. Si c'est le même plan, le retour suit : rien à dire. S'il change :

| Cas | Ce qui porte le retour | Ce que dit le rapport |
| :--- | :--- | :--- |
| même net des deux côtés (GND → GND) | le via de masse le plus proche | la distance, l'inductance de boucle, le front le plus raide supporté |
| nets différents (GND → alimentation) | la **cavité** des deux plans sur sa forme réelle (recouvrement maillé de 0,25 à 1 mm selon sa taille, modes propres et rayonnement des bords compris) et tous les ponts de la carte, chacun à sa position : condensateurs directs, et chaînes de 0 Ω vers un autre rail découplé (VDDIO → R211 → VDD → R229 → Vout sur P01x291) | le pont le plus proche (repère ou chaîne, longueur de la boucle), la résonance de la traversée si elle réfléchit (fréquence, Ω, \|Γ\|) et, quand le via est sur un îlot du recouvrement, sa fourchette selon le lien de l'îlot, ou « aucun découplage entre ces plans sur toute la carte » |
| pas de cuivre de plan au droit du via | rien | critique d'office |
| net des plans inconnu | ? | vigilance : l'empilage ne dit pas si un via de masse suffit |

Le verdict est le **pire de deux critères** :

- la **réflexion** que le via cause sur la ligne, |Γ| = |Z| / |Z + 2 Z₀|
  (vigilance au-delà de 5 %, critique au-delà de 10 %) — ce que le signal voit ; avec la cavité modale, le pire sur les deux décades sous le genou, car un front contient toutes ces fréquences et la traversée peut y résonner ;
- la **distance du retour** comparée à λ/20 au genou dans le diélectrique entre
  les plans (vigilance au-delà, critique au-delà de λ/10) — la taille de la
  boucle, qui excite la cavité et rayonne.

Le premier seul ne suffit pas : une transition isolée réfléchit peu, même mal
refermée. C'est le même moteur que l'onglet **Current Return Path** (plans et
leur net mesurés au droit du via, vias de masse qui touchent les deux plans,
traversée de cavité par les découplages) ; pour le détail d'un net signalé,
sélectionnez-le et ouvrez cet onglet.

**Corriger** : poser un via de masse au pied du via de signal (≤ 1,8 mm est
l'optimum de Current Return Path) ; pour GND → alimentation, un condensateur
entre les deux plans tout près, ou mieux, router le net sur des couches qui
se réfèrent au même plan ; ne pas router sur un vide de plan.

### Fentes et vides des plans

Sous chaque piste de signal, le plan de référence (le plus proche au-dessus,
le plus proche au-dessous) est lu pas à pas dans le cuivre de sa couche. Là où
il manque, le courant de retour contourne le vide par ses deux bouts : on
mesure ces **détours d1 et d2** le long de la normale à la piste, plafonnés à
30 mm (« plan coupé d'un bord à l'autre »). Chaque détour est une self (Ott),
et c'est le moteur de la **simulation RF** (`rf_reseau.z_fente`) qui en donne
l'impédance ; le verdict se lit par la réflexion |Γ|, comme un via.

- Le dégagement du **propre via** ou de la **propre pastille** du net n'est pas
  un vide : la piste y plonge.
- Entre deux plans (triplaque), si l'autre plan reste sous la piste, il porte
  une part du retour : le constat ne dépasse pas la vigilance.
- **Une ligne par net et par plan** : le pire franchissement, et leur nombre.
  Une antenne posée sur une réserve de plan (`RFID_SIGN0057` sur P01x274) en
  franchit 159 : une ligne, pas 159.

**Corriger** : router la piste à côté de la fente, ou refermer la fente sous
elle ; si la coupure est voulue (deux alimentations), poser un condensateur de
pontage au droit du franchissement.

### Vias de couture

Deux couches qui portent le cuivre d'une **même masse** (au moins 1 cm² chacune
et 0,25 cm² en regard) forment une cavité ; les vias de ce net qui traversent
l'une et l'autre la cousent. Entre deux vias, la cavité résonne quand l'écart
approche la demi-longueur d'onde : on garde le pas sous **λ/20** au genou du
front **le plus rapide de la carte** (λ/10 pour condamner).

Le plus grand trou sans via se lit par une transformée de distance sur le
cuivre commun aux deux couches : son rayon d_max donne un pas équivalent
√2 · d_max (maille carrée). Une ligne par cavité, au centre du pire trou, avec
le front le plus raide que la couture tient. Aucun via du tout : critique.

**Corriger** : ajouter des vias de masse dans le trou désigné, et le long des
bords des versements.

### Diaphonie

Pour chaque couple de pistes de nets différents, **sur la même couche**, qui
se font face à moins de cinq fois la hauteur au plan — les arcs comptent, en
cordes de 5° — : la section à deux conducteurs est **résolue par la méthode
des moments** à l'écart réel (pas une formule), d'où Kb et Kf. Puis, avec le front de
l'**agresseur** à sa cadence :

- **NEXT** = min(Kb max, Σ Kb · 2T_d / t_r) — il sature au-delà de t_r·v/2 ;
- **FEXT** = |Σ Kf · T_d| / t_r — il croît avec la longueur.

Le niveau retenu est le plus grand des deux, comparé au **budget** (critique
au-dessus, vigilance au-delà de la moitié). Chaque ligne se lit « victime
(le net de la ligne) ← *Depuis* agresseur », avec la longueur en regard,
l'écart minimal et le Kb. **Une ligne par couple** : quand les deux nets
s'agressent l'un l'autre, le sens le plus grave est gardé et la ligne ajoute
« et réciproquement ».

**Entre deux couches voisines** sans plan entre elles, deux pistes qui se
superposent (décalage d'axe à axe sous trois fois la hauteur) se couplent par
leur largeur : Kb **résolu** par la méthode des moments, chaque ruban à sa
hauteur, entre les plans qui encadrent la paire (le second plan, quand il y
en a un, ferme le domaine et réduit le couplage), en milieu homogène (Kf nul).
La ligne dit « (MoM, un plan) » ou « (MoM, deux plans) ». Le solveur tient
Cohn (exact) à 0,2 % en triplaque et rejoint, sur des rubans étroits et
éloignés, la méthode des images à fil fin — qui ne sert plus que de repli,
écrite « (images, un plan) », quand le budget de résolutions est épuisé.

**La somme des agresseurs** : les niveaux de tous les agresseurs d'une victime
s'ajoutent au pire, en phase. Une ligne de plus, « Somme de N agresseurs »,
quand la somme franchit un seuil qu'aucun ne franchit seul.

Le moteur est celui de l'onglet **Crosstalk** en mode *Analyse géométrique* :
même section MoM (`solve_multiline`), mêmes Kb/Kf (`coefficients_couple`).
Ce qu'on y ajoute : le front de l'agresseur, qui fait d'un Kb un niveau. Ce
qu'on n'y prend pas : la présélection et le profil d'espacement de l'onglet,
et son mode *précis* (lignes couplées en cascade, IFFT).

Hors jeu : la masse (ni victime ni agresseur), les alimentations (sauf un nœud
de découpage, qui agresse), et les deux moitiés d'une **paire
différentielle**, couplées exprès.

**Corriger** : écarter (règle des 3W), raccourcir le longement, rapprocher la
piste de son plan (diélectrique plus mince), glisser une garde de masse ou un
plan entre les deux, ralentir le front de l'agresseur (résistance série). Pour
**où** le long du parcours le couplage se fabrique, onglet **Crosstalk**.

### Paires différentielles

Les paires viennent des motifs reconnus (visionneuse) ou des paires déclarées
(éditeur PCB). Le long de la paire :

- les morceaux **couplés** (P face à N, même couche, à moins de 5 h) : Z_diff
  résolue par la méthode des moments à l'écart réel, avec la **masse
  coplanaire** mesurée dans le cuivre de la couche du côté extérieur de
  chaque moitié (0,1 mm de chaque côté fait tomber une paire de 104 à 96 Ω) ;
- les morceaux **découplés**, qui valent deux lignes seules : 2 Z₀.

Chaque morceau réfléchit |Z − Z_cible| / (Z + Z_cible), pondéré par 2T_d / t_r
comme une discontinuité courte. L'**écart de longueur**, en temps, se compare
au front : il convertit le différentiel en mode commun (10 % du front en
vigilance, 20 % critique). Le **plan de référence doit passer sous les deux
moitiés** : là où une seule le voit, la paire se déséquilibre ; cette longueur
se juge en temps, comme l'écart de longueur. Des **vias en nombre différent**
sur P et N dissymétrisent la paire : vigilance au moins. Le message donne la plage de
Z_diff, la longueur couplée sur la longueur totale et l'écart en mm et en ps.

**Corriger** : tenir l'écart constant, rapprocher les deux moitiés aux
extrémités, compenser l'écart de longueur par un accordéon près de sa cause,
faire changer de couche les deux moitiés ensemble.

### Découplage

Chaque broche d'**alimentation** d'un circuit intégré (repère U, IC, VR, REG,
ou huit broches et plus hors connecteurs) doit trouver, tout près, un
**condensateur** dont une broche est sur ce rail et l'autre à la masse. Un
condensateur ne découple qu'à l'intérieur d'un rayon de **λ/40** à la
fréquence visée (λ/20 pour condamner), λ pris au genou du front le plus rapide
des **signaux du circuit**, dans le diélectrique de la carte.

Ce rayon se mesure sur le **chemin réel** : le plus court chemin sur les
pistes du rail, de la broche au condensateur, vias compris (« 3,2 mm par la
piste, 2,7 à vol d'oiseau »). Quand le rail passe par un plan, pas de piste à
suivre : vol d'oiseau, et le message le dit (« par le plan »).

Le chemin donne une **inductance de boucle** — les pistes (L' de leur section),
les vias (0,76 nH/mm), le montage du boîtier (0402 : 0,5 nH, 0603 : 0,75 nH,
comme l'onglet Z(ω) PDN) —, et avec la **valeur** du condensateur, sa
**résonance**. Au-delà, un condensateur n'est plus qu'une self : si aucun
condensateur du rail dans le rayon ne résonne à moins d'une décade sous le
genou, vigilance (un 10 µF seul au pied d'un circuit rapide). Une ligne par
circuit et par rail, sur la broche la plus mal servie. Aucun condensateur sur
le rail : critique.

Attention au classement : un circuit relié à un net classé RF (même à tort,
comme `RST_RF` sur P01x274) est jugé à la porteuse RF, ou au front RF de
0,1 ns sans porteuse, soit un rayon d'environ 1 mm. Et un rail qui n'a aucun
condensateur sur toute la carte est souvent une **sortie** qui alimente une
autre puce (`PWR_FLASH` sur P01x274) : classez-la en signal.

**Corriger** : rapprocher le condensateur de la broche, au plus court vers sa
masse (via au pied de la pastille) ; ajouter un petit condensateur (10 nF,
100 pF en RF) à côté du gros.

**Corriger** : rapprocher le condensateur de la broche, au plus court vers sa
masse (via au pied de la pastille).

### Bord de carte

- **Fabrication** (tous nets) : le détourage met à nu le cuivre trop proche du
  bord — **0,25 mm** critique, **0,5 mm** vigilance. Une ligne par net et par
  couche, au point le plus proche.
- **CEM** (nets de signal et nœuds de découpage) : le champ d'une piste
  déborde d'environ 5 h de son axe ; près du bord, il déborde du plan de
  référence et rayonne. On cumule par net la longueur qui court à moins de
  max(1 mm, 5 h) du bord, jugée face à **λ/20** au genou (λ/10 pour condamner).
- **Clôture de vias** : une cavité de masse (deux couches d'une même masse)
  s'ouvre sur l'extérieur au bord de la carte. Dans la bande de 2 mm du
  détourage, le plus grand écart entre deux vias de masse se juge face à
  **λ/20** au genou du front le plus rapide de la carte, comme la couture.
- **Règle des 20 H** (info) : un plan d'alimentation se tient en retrait de
  20 fois son écart à la masse sur le bord de celle-ci. La règle se discute,
  elle vaut surtout au-delà du GHz.

**Corriger** : écarter la piste du bord, la faire passer en couche interne
entre deux plans, reculer le plan d'alimentation, poser une rangée de vias de
masse le long du bord.

### Moignons de vias

Un via percé de L1 à L6 dont le signal n'emprunte que L1 à L3 laisse pendre
L3 à L6 en circuit ouvert : un **moignon**, qui résonne au quart d'onde. Les
couches empruntées sont celles où une piste du net arrive dans le via ; la
portée percée vient du document (`de`, `a`), et sans elle le via est **supposé
traversant** (le message le dit). La longueur du moignon se juge face à
**λ/20** au genou (λ/10 pour condamner) : il résonne alors cinq fois plus haut.
Une broche traversante de composant n'est pas jugée. Une ligne par net, sur le
pire via.

**Corriger** : via borgne ou enterré, rétroperçage (*backdrill*), ou router le
signal entre les couches extrêmes du perçage.

### Branches en T

Un net qui se ramifie **hors pastille** vers une deuxième charge n'est plus une
ligne : à chaque embranchement, les deux branches les plus longues font le
tronc, les autres sont des dérivations, et une dérivation qui mène à une
pastille pend comme un moignon — 2T_d / t_r face au front (10 % vigilance,
20 % critique). Un bout de piste posé au milieu d'un segment compte comme un
embranchement. Une dérivation qui finit dans le vide est un **orphelin** (règle
à part).

**Corriger** : router en chaîne (*daisy chain*) de charge en charge, ou
raccourcir la dérivation sous 10 % du front, ou terminer.

### Quartz

Un quartz (repère Y, XT, XTAL, ou X / G avec une valeur en Hz, et deux broches
de signal) est un circuit à gain élevé et à très haute impédance :

- pistes vers l'oscillateur au-delà de **10 mm** : vigilance ; **25 mm** :
  critique (règle de pouce des notes d'application) ;
- toute piste d'un autre net que la masse, sur n'importe quelle couche, ou un
  plan d'un autre net, sous le quartz ou à moins de 1 mm : vigilance.

Un filtre SAW (`FLT`, 868 MHz) n'est pas un quartz.

**Corriger** : coller le quartz à l'oscillateur, et ne laisser que la masse
dessous et autour (anneau de garde relié à la masse de l'oscillateur).

### Protection ESD des connecteurs

Chaque **signal** d'un connecteur (repère J, P, CN, CONN, X) doit trouver, à
moins de **10 mm** de sa broche, une protection vers la masse : un composant
qui touche ce net et la masse, repère D, TVS, ESD, Z, DZ, ou valeur ESD, TVS,
PESD, USBLC, SMAJ, SMBJ, PRTR, TPD, RCLAMP… Une ligne par connecteur :

- protégé en partie, ou protégé trop loin : **vigilance** ;
- aucun signal protégé : **info** — c'est sans doute un connecteur interne
  (programmation, nappe), à confirmer.

**Corriger** : une diode TVS ou un réseau ESD au plus près du connecteur, avant
tout autre composant, avec un via de masse court.

### Courant des rails

Pour chaque rail (Alimentation, nœud de découpage), sa piste **la plus
étroite**, et ce qu'elle tient à +10 °C et +20 °C par **IPC-2221** (couche
externe ou interne) — plus prudent que l'étalement que l'onglet **Chute DC**
résout, qui reste l'outil pour un chiffre exact.

- Avec un **courant** donné pour le rail (champ `courants` du document, en
  ampères) : au-delà de ce que la piste tient à +10 °C, vigilance ; à +20 °C,
  critique.
- Sans courant : un **étranglement** (piste plus de deux fois plus étroite que
  le reste du rail) sort en **info**, avec le courant qu'elle tient.

**Corriger** : élargir la piste, la doubler sur une autre couche, ou passer le
rail en plan.

---

## 6. Corriger la classe d'un net

La classe fixe le front, donc le verdict des règles électriques. Le classement
automatique lit les noms de nets et de broches, les motifs reconnus et les
composants reliés — et il se trompe parfois. Sur P01x274, `LNA_EN` (une
broche d'activation), `LNA_PWR` (une alimentation) et `RST_RF` (un reset)
sortent **RF** à cause du jeton « LNA » ou « RF » : on leur applique un front
de 0,1 ns, et les critiques qui en sortent — retour, fente, impédance, et le
découplage des circuits auxquels ils se relient — n'ont pas lieu d'être.

**La correction se fait à la main**, dans l'outil :

| Outil | Où |
| :--- | :--- |
| Visionneuse IPC-2581 | bouton **Nets (PWR/GND/Sig)** : boutons GND / PWR / Signal, et pour un signal le menu Horloge / Rapide / RF / Analogique / Lent. Ou, un net sélectionné, la ligne **Classification** du détail |
| Éditeur PCB | **Classe du net** dans l'inspecteur de piste, ou la table des nets |
| Éditeur schématique | panneau **Motifs**, section **Classes de nets** — la correction part vers le PCB |

Puis relancez la vérification. Un net corrigé à la main quitte la liste
« Lent par défaut ».

**Dans la visionneuse, le classement manuel est mémorisé par fichier** : GND /
PWR / Signal et la nature, gardés dans ce navigateur sous le nom du fichier.
Rouvrir `P01x274PCB-C.xml` les retrouve. **Réinitialiser** (dans la fenêtre
des nets) efface aussi la mémoire. Un `.json` exporté porte son propre
classement, qui passe devant. Dans l'éditeur PCB, les classes font partie du
document, et les **nœuds de découpage** reconnus par le schéma y arrivent avec
les classes (synchro en direct, gardés dans la carte).

**La classe Antenne.** Une antenne est faite pour rayonner : sur une réserve
de plan, près du bord, ouverte au bout. Classée **Antenne**, elle n'est jugée
qu'en fabrication (angles, détourage, piste isolée) ; l'en-tête du rapport la
nomme, pour que l'exclusion ne passe pas inaperçue. Dans l'éditeur PCB, c'est
une classe de carte dont le nom contient « antenne ».

**Une sortie qui alimente n'est pas un rail.** `PWR_FLASH` ou `LNA_PWR`
sortent d'une broche du microcontrôleur pour alimenter une autre puce :
classés Alimentation, ils demandent un condensateur au pied du µC. Classez-les
en signal (Lent), et classez Alimentation le net qui arrive à la broche VCC
de la puce alimentée. L'en-tête du rapport liste les broches de circuit
reliées à la masse par un condensateur sans être classées Alimentation
(`U300.8 (SIGN00358)`…) : des rails au nom automatique, le plus souvent.

---

## 7. Exporter, comparer, archiver

**Rapport ↗** écrit `<carte>-verification-carte.txt` en texte brut : l'en-tête
(ce qui a été jugé, réglages, réserves), puis chaque règle, chaque net avec sa
classe, chaque constat avec son verdict à la cadence de sa classe et le front
employé. Texte brut exprès : il se colle dans un courriel ou un ticket, et
deux révisions d'une carte **se comparent avec n'importe quel diff** — ce
qu'un PDF ne permet pas.

**Dérogations.** Au survol d'une ligne, **✓** accepte le constat : il quitte le
compte et le rapport, et reste listé dans « Dérogations acceptées »,
repliée, avec **Tout rétablir**. Une dérogation est gardée pour cette carte
(son nom), dans ce navigateur ; elle reconnaît le constat par sa règle, son
net, sa couche et sa position au demi-millimètre — pas par ses chiffres, qui
bougent avec les réglages.

**Comparer deux révisions dans la page.** **📌 Référence** garde la
vérification affichée. Les suivantes — la même carte après retouche, ou une
autre révision (`-B` puis `-C`) — le disent en tête (« 3 nouveaux,
5 résolus »), marquent **nouveau** chaque constat absent de la référence, et
listent à part ceux qui ont disparu. **oublier** arrête la comparaison.

**◎ Tout peindre** pose un anneau sur la carte à chaque constat, à la couleur
de sa sévérité (dérogations et marquages exceptés) : la carte entière d'un
coup d'œil, et le constat choisi reste marqué par-dessus.

---

## 8. Ce que la vérification ne dit pas (aujourd'hui)

- **Diaphonie entre couches voisines** : milieu homogène. Une paire de
  couches extérieures, avec de l'air au-dessus, est stratifiée : le Kb y
  reste une estimation, résolue en largeur.
- **Visionneuse** : un perçage IPC-2581 ne dit pas toujours sa portée ; sans
  elle, il est **supposé traversant** (chemins de retour, moignons).
- **Éditeur** : les zones partent remplies, rognées au bord et avec leurs
  liaisons thermiques, comme le rendu les peint — mais en polygones à 8
  côtés, et une pastille ronde ou polygonale part en rectangle.
- **Découplage** : un T posé au milieu d'un segment du rail n'est pas un
  nœud du plus court chemin (il l'est pour les branches en T) ; un rail passé
  par un plan se mesure à vol d'oiseau.
- **Porteuse RF** : une seule pour toute la carte (LoRa **et** NFC à
  13,56 MHz se jugent tous deux à 868 MHz).
- **Courant** : pas de courant par rail sans le champ `courants` (le panneau
  ne le demande pas encore) ; IPC-2221, pas l'étalement.
- **Protection ESD** : un connecteur interne et un connecteur de façade se
  ressemblent ; seule la protection partielle trahit la façade.
- **Vias de couture** : le pire trou de chaque cavité, pas la liste de tous.
- **Z₀** est la même cible pour toutes les classes tenues (50 Ω par défaut) ;
  λ/20, λ/40, 5 h et 20 H sont des règles de pouce, pas un calcul de
  rayonnement.
- Un rapport vide ne veut pas dire une carte sans défaut, seulement sans
  défaut **de ces familles**.

---

## 9. Ce qu'on peut en faire

- **Revue d'un fichier reçu** : ouvrir l'IPC-2581, vérifier, envoyer le `.txt`
  au routeur avec les positions exactes.
- **Relire un routage** : les bouts libres montrent les pistes qui n'arrivent
  pas à leur pastille, les pistes isolées ce qui a été oublié.
- **Connaître la marge d'une carte** : les vias, les coutures et les
  découplages signalés disent « tient des fronts jusqu'à X ns ». Monter le
  front d'une classe (ex. Lent à 2 ns) montre ce qui casserait si un GPIO
  devenait rapide ; le baisser, ce qui est surdimensionné.
- **Régler les cadences** : une ligne par classe dans le tableau — une
  carte Ethernet déclare ses nets Rapide à 125 MHz plutôt qu'au défaut.
- **Régler la cible des paires** par projet : 90 Ω pour de l'USB, 100 Ω pour
  du LVDS ou de l'Ethernet.
- **Chasser les nets mal classés** : la classe écrite à côté de chaque net et
  la liste « Lent par défaut » sont en soi une revue du classement.
- **Suivre une carte de révision en révision** : diff des deux `.txt`.
- **Aiguiller l'analyse détaillée** : un net signalé s'ouvre ensuite dans
  Current Return Path, Crosstalk, Impédance, Z différentielle ou la
  simulation RF, qui disent où et combien sur ce net-là.

---

## 10. Fait, et reste à faire

| Point de la liste de départ | État |
| :--- | :--- |
| DRC d'angles (aigus, droits, T, hors 45°), tous nets | **fait** |
| 1. Stack-up (plans voisins, couches face à face, cavité, symétrie) | **fait** |
| 2. Impédance parasite (Z₀, R, L, C par net, discontinuités) | **fait** |
| 3. Chemins de retour — via par via, à la cadence de chaque classe | **fait** |
| 4. Plans de référence : piste qui franchit une fente ou un vide | **fait** |
| 5. Vias de couture : plus grand trou sans via face à λ/20 | **fait** |
| 6. Crosstalk — piste par piste, à la cadence de chaque classe, arcs, couches voisines, somme des agresseurs | **fait** |
| 7. Découplage : chemin réel, inductance de boucle, valeur et résonance | **fait** |
| 8. Bord de carte : détourage, pistes rapides, clôture de vias, 20 H | **fait** |
| 9. Paires différentielles : Z_diff avec masse coplanaire, écart de longueur, plan sous les deux moitiés, vias | **fait** |
| Bouts de piste orphelins, pistes isolées, dépassements | **fait** |
| Classes de nets, « Lent par défaut », nœud de découpage bruyant (schéma → PCB), classe Antenne, porteuse RF | **fait** |
| Moignons de vias, branches en T, quartz, protection ESD, courant des rails | **fait** |
| Dérogations, comparaison de révisions dans la page, tous les constats peints, classement mémorisé par fichier | **fait** |
| Courant par rail saisi dans le panneau, porteuse par net, solveur de couplage à deux niveaux | à faire |

Le détail, avec ce que chaque point réutilisera, est dans
[A-FAIRE.md](../A-FAIRE.md#vérification-de-la-carte-entière).

---

## 11. Sous le capot

| Où | Quoi |
| :--- | :--- |
| `python/analyse_carte.py` | les règles : `angles`, `orphelins`, `empilage`, `impedances`, `retours`, `fentes`, `coutures` (et la clôture du bord), `diaphonie`, `paires_diff`, `decouplages` (`_Chemins`), `bords`, `moignons_vias`, `branches_t` (`_graphe_topo`), `quartz`, `esd`, `courants` ; `_Surfaces` peint le cuivre des surfaces une fois ; `analyser_document` les enchaîne et rend la durée de chacune |
| `web_CAO.py` | route `POST /api/analyse-carte` (plafond 32 Mo) |
| `commun/simulation-em.js` | famille « Audit de la carte », réglages, rapport, marque sur la carte, export |
| `visionneuse-ipc2581/js/07-simulation.js`, `editeur-pcb/js/19-simulation.js` | `carteEntiere()` : ce que chaque outil envoie |
| `python/simulation_em.py`, `python/crosstalk.py`, `python/ligne_mom.py`, `python/rf_reseau.py` | les moteurs réutilisés (retour, cavité, section MoM, Kb/Kf, Z_diff, fente d'Ott) |

**Le cuivre des surfaces, peint une fois.** Plans et versements arrivent en
contours ; plusieurs règles posent la même question en des milliers de points
— y a-t-il du cuivre ici, et de quel net ? Le serveur peint donc chaque couche
une fois dans une image (un net par pixel, pas de 0,05 mm au moins, quatre
millions de pixels au plus par couche), par traversées de ligne en numpy, du
plus grand contour au plus petit pour qu'un îlot posé dans le dégagement d'un
autre ne soit pas effacé par lui.

Le document `cao-analyse-carte-1` porte, dans les unités de l'outil
(`unite_mm`) : les pistes et arcs des couches de cuivre, les pastilles
**placées** {x, y, r (rayon inscrit), R (demi-longueur), c, n}, les surfaces
`plans` [{c, n, o, t, isolement}], le `contour` {o, t}, les `percages`
[{x, y, d, n, de, a}], les `composants` [{ref, c, val, pkg, broches [{x, y, n, pin}]}],
l'empilage, les fiches de via de chaque net de signal (même format que
Current Return Path), la nature de chaque net, les nœuds bruyants, les paires
différentielles, la masse de référence, les `courants` par rail (facultatif)
et les réglages (dont `porteuse_rf` et `fmax`). Bancs :
`python/test/banc-analyse-carte.py` (20 cas), `banc-serveur-routes.py`, et
les essais des deux harnais (9 dans l'éditeur, 3 dans la visionneuse).
