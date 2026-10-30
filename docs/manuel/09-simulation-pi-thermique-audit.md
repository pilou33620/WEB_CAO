# Simulation PI, thermique et audit de la carte

Ce chapitre couvre la famille **PI** (intégrité de l'alimentation) du panneau « Simulation EM… » : la **Chute DC** avec son échauffement, et l'impédance du réseau d'alimentation **Z(ω) PDN**. Il décrit aussi l'estimation d'**échauffement des composants** de l'Éditeur PCB et la famille **AUDIT** (vérification de toute la carte, règle par règle).
Le panneau lui-même (ouverture, familles, repli des réglages) et la famille SI sont au chapitre [Simulation SI](08-simulation-si.md) ; la famille RF est au chapitre [Simulation RF et EM](10-simulation-rf-em.md).
Les deux outils qui portent le panneau, l'[Éditeur PCB](03-editeur-pcb-edition-routage.md) et la [Visionneuse IPC-2581](07-visionneuse-ipc2581.md), l'ouvrent de la même façon ; les différences sont signalées.

## Guide par tâche

### Je veux ouvrir la famille PI ou la famille AUDIT

1. Cliquer sur **Simulation EM…** (barre d'outils de l'Éditeur PCB ou de la Visionneuse IPC-2581). Le panneau « Simulation EM » s'ouvre.
2. Choisir la famille dans la première rangée d'onglets : **PI Intégrité de l'alimentation** ou **AUDIT Audit de la carte**.
3. Choisir l'analyse dans la seconde rangée : **Chute DC** ou **Z(ω) PDN** pour PI ; **Vérification** pour AUDIT.
4. Le bouton **▾ réglages** (en bout de rangée) replie les réglages pour laisser la place aux résultats ; la rangée qui porte le bouton de calcul reste visible.

Changer de famille n'efface pas le résultat d'une analyse.

### Je veux savoir si un rail d'alimentation tient (chute DC)

1. Ouvrir **PI**, onglet **Chute DC**.
2. Poser les bornes :
   - dans l'Éditeur PCB, sélectionner d'abord une piste du rail (ou surligner son net), puis **⚡ Du schéma** : les sources et les charges des composants du schéma sont importées avec leurs valeurs ;
   - dans la Visionneuse, choisir le net du rail, puis **⚡ Des composants** : les sources et les charges sont lues dans la nomenclature du fichier et dans le catalogue ;
   - ou à la main : **+ source (V)**, cliquer la pastille de l'alimentation, puis **+ charge (A)**, cliquer la pastille de chaque consommateur. Une borne posée ainsi part à 3,3 V (source) ou 1 A (charge), à corriger tout de suite.
3. Régler la **tension** de chaque source et le **courant** de chaque charge dans la liste des bornes (les badges d'origine disent d'où vient chaque valeur). Renommer une borne si besoin (« U7 VDD » se lit mieux que « pastille 32.1 ; 72.34 »).
4. Régler les budgets (**Budget** : chute en %, échauffement en °C) et l'**Ambiante**.
5. Cliquer **▶ Calculer**. Lire d'abord la ligne de verdict, puis le tableau des bornes (colonne « Perdu »).
   Refus « nœud(s) de cuivre n'atteignent aucune référence » : il nomme les bornes posées sur le cuivre détaché. Avec la masse, il dit aussi si la trame s'est trop élargie pour les pastilles fines du rail : décocher **masse** pour ce rail. Un îlot sans borne (par exemple une masse cousue par des vias sans net) ne bloque pas : il est tenu à la consigne de son net, et un avertissement le compte.
6. Pour voir **où** : choisir dans la liste « Carte » la grandeur peinte (**Échauffement (étalement)**, **Densité**, **Potentiel**, **Réf. IPC-2221**), survoler le cuivre pour lire la valeur, et choisir la **Couche peinte** si le rail est sur plusieurs couches.
7. Pour décider d'ajouter un via : lire le tableau des vias (les plus chargés d'abord) et les notes sous lui.

> [!NOTE]
> Les bornes peuvent être sur plusieurs nets seulement si un composant en série les relie (voir ci-dessous) : sinon le courant ne passe pas d'un net à l'autre, et le calcul est refusé (« Les bornes ne sont pas toutes sur le même net »). Sans courant dans au moins une charge, le calcul est refusé (« Aucune charge ne tire de courant. »).

### Je veux suivre un rail à travers une ferrite, un fusible ou un régulateur

1. **⚡ Du schéma** (Éditeur PCB) ou **⚡ Des composants** (Visionneuse) sur le rail : l'import suit les composants **en série** à deux pastilles entre deux nets d'alimentation (ferrite ou self `FB`/`L`, fusible `F`, shunt `R` d'au plus 1 Ω). Leurs nets entrent dans le même calcul, et chacun devient une résistance entre ses deux pastilles. Le message dit « Nets +3V3 → +3V3_A ».
2. Sur le rail qui **nourrit un régulateur**, la broche d'entrée du régulateur devient une charge (badge **cascade**). Son courant est celui que consomme le rail de sortie, ramené à l'entrée : Iin = Iout pour un régulateur linéaire, Iin = Vout·Iout/(η·Vin) avec η = 0,85 pour un régulateur à découpage.
3. Les notes sous la fiche disent la résistance de chaque composant en série, et le calcul de chaque entrée de régulateur. Le tableau des nets est suivi d'une ligne par composant en série : son courant et sa chute.

### Je veux compter le retour par la masse

1. Poser les bornes du rail (par exemple **⚡ Du schéma** ou **⚡ Des composants**), puis cocher **masse** dans la rangée « Ajouter ».
2. Cliquer **▶ Calculer**. Chaque charge rend son courant par les broches de masse de **son** composant. Les broches de masse des sources sont tenues à 0 V. Le cuivre de masse entre dans le calcul, rogné à 5 mm autour du cuivre du rail (une note le dit).
3. Lire le tableau **Composant / Rail / Masse / Vu / Perdu** : la tension que voit vraiment le composant entre ses broches, et ce qu'il perd au total. Le verdict prend ce total.

### Je veux vérifier tous les rails d'un coup

1. Ouvrir **PI**, onglet **Chute DC**, régler les budgets (et cocher **masse** si le retour doit compter).
2. Cliquer **▶ Tous les rails**. Chaque rail du schéma (Éditeur PCB) ou de classe Alimentation (Visionneuse) est importé (cascade comprise) et calculé à son tour ; un rail que l'aval d'une ferrite a déjà pris ne repart pas seul.
3. Lire le tableau : une ligne par rail, avec son courant, sa pire charge, ce qu'elle perd, l'échauffement et les vias en défaut. La teinte du nom du rail est son verdict.
4. Cliquer une ligne pour recalculer ce rail seul, avec toute sa fiche. Les bornes posées avant le balayage sont rendues à la fin.

### Je veux savoir si un via tient son courant

1. Faire le calcul de chute DC.
2. Dans le tableau des vias, la colonne **Tenue** dit le courant que chaque via tient et le pourcentage qu'il en porte (rouge au-delà, ambre à 80 %). Une note liste tous les vias en défaut, même au-delà des quinze premières lignes, et le verdict les compte.
3. Par défaut la tenue vient d'IPC-2221 sur la section du tube (perçage et placage), en couche interne, au budget d'échauffement : 0,95 A pour un via percé à 0,3 mm avec 25 µm de placage, à +10 °C. Pour imposer une valeur, la saisir dans **Tenue** (A/via).

### Je veux savoir si une piste chauffe trop

1. Faire le calcul de chute DC ci-dessus : l'échauffement vient du même calcul.
2. Dans le verdict, lire « +x °C sur NET → y °C » : le premier chiffre est l'écart, le second la température absolue (écart + ambiante). C'est ce dernier qu'on compare à un Tg ou à la cote d'un boîtier.
3. Dans le tableau « Échauffement (étalement) », lire le pire point de chaque net, la **Section** à cet endroit et la **Densité de pointe**.
4. Comparer avec la colonne **Réf. IPC-2221** : si les deux se ressemblent, la carte n'évacue rien ; si elles s'écartent, un plan ou le stratifié travaille.
5. Si le stratifié n'est pas du FR-4 courant, saisir sa conductivité thermique dans le champ **Stratifié** (W/(m·K)) puis relancer.

### Je veux vérifier l'impédance du réseau d'alimentation (Z(ω) PDN)

1. Ouvrir **PI**, onglet **Z(ω) PDN**. Le calcul part seul à l'ouverture.
2. Choisir le rail dans la liste **Rail PDN** (ou sélectionner le net sur la carte, puis **⚡ Détecter**).
3. Régler **Vdd**, **Ondulation admise** et **ΔI** (ou cocher « Calculer ΔI (assistant) », voir plus bas). Le badge « Z_target = … » se met à jour.
4. Régler le régulateur (**R_vrm**, **f_vrm**) et, si la carte a des plans, vérifier la cavité détectée (ligne de note sous le verdict ; cases **Plan** et **Modes 2D**).
5. Cliquer **▶ Calculer Z(ω)**. Lire le verdict en tête, puis la courbe : la ligne rouge en pointillés est Z_target ; tout pic au-dessus est un dépassement.
6. Survoler la courbe pour lire la fréquence, |Z| et la marge ou le dépassement par rapport à Z_target.
7. Pour renforcer le découplage, décocher un condensateur dans le tableau (colonne **Actif**) et observer la déformation de la courbe.

### Je veux vérifier chaque appel de courant à sa fréquence (assistant ΔI)

1. Dans l'onglet **Z(ω) PDN**, cocher **Calculer ΔI (assistant)**. Le choix est gardé dans le profil.
2. Dans le bloc « Fiche de la charge », recopier les valeurs de la datasheet du composant alimenté (chaque champ a une infobulle ⓘ qui dit où les trouver). Un badge **à vérifier** reste, sur la fréquence d'horloge, la consommation max et le nombre de sorties, tant que la valeur est restée à son défaut.
3. Lire le tableau « Appels de courant sur le rail » : pour chaque événement, ΔV = ΔI × Z(f) doit rester sous la marge (Vdd × ondulation). La colonne « Verdict » dit **✓ tient** ou **✗ … × la marge**.
4. Ajouter une charge qui s'allume d'un coup (LED, relais, module radio) avec **+ Charge**, puis régler son courant et la durée de son front.
5. Le champ **ΔI** du haut reprend le plus gros appel de courant. Le taper à la main le fixe (« manuel · ↺ assistant » pour revenir).

### Je veux estimer l'échauffement d'un composant qui dissipe

1. Éditeur PCB : sélectionner le composant, ouvrir ses propriétés.
2. Saisir **Puissance dissipée (W)**, puis **Estimer l'échauffement**.
3. Lire « ≈ x K au-dessus de l'ambiante (… mm² de cuivre relié, … K/W) » sous le bouton, et le détail dans la ligne d'aide.
4. Fixer la limite de la carte dans les propriétés de la carte (**Échauffement max (K)**, 40 par défaut) : le DRC signale tout composant qui la dépasse.

### Je veux vérifier toute la carte

1. Ouvrir **AUDIT**, onglet **Vérification**.
2. Dans la Visionneuse IPC-2581, contrôler d'abord la classification des nets (bouton **⚡ Nets (PWR/GND/Sig)**) et l'empilage ; dans l'Éditeur PCB, les classes de nets font partie de la carte.
3. Régler si besoin le tableau des classes (front, cadence, Z₀ visée, Z_diff visée), la porteuse RF et le courant des rails.
4. Cliquer **▶ Vérifier la carte**.
5. Lire l'en-tête (compte par sévérité, ce qui a été jugé, réserves en encadré), puis les blocs de règles, du plus grave au moins grave.
6. Cliquer une ligne : la vue se centre sur le point, qui est marqué à la couleur de la sévérité.
7. Ouvrir les deux sections repliées : « Marquages : cuivre sans net » et « Nets classés Lent par défaut, non vérifiés ».

> [!NOTE]
> Les réserves en tête de rapport disent ce qui n'a **pas** été vérifié (empilage absent, contour absent, plan sans cuivre…). Un rapport vide ne veut pas dire une carte sans défaut, seulement sans défaut de ces règles.

### Je veux corriger la classe d'un net mal classé

La classe fixe le front, donc le verdict des règles électriques. Elle est écrite à côté de chaque net dans le rapport.

1. Repérer le net (par exemple un reset classé RF à cause de son nom).
2. Corriger la classe : Visionneuse IPC-2581, **⚡ Nets (PWR/GND/Sig)** ; Éditeur PCB, champ **Classe du net** de l'inspecteur de piste ou liste des nets ; Éditeur Schématique, voir le chapitre [Éditeur schématique](02-editeur-schematique.md).
3. Relancer **▶ Vérifier la carte**.

### Je veux accepter un constat, comparer deux révisions, exporter

1. **Accepter** : survoler une ligne et cliquer **✓** ; le constat quitte le compte et passe dans « Dérogations acceptées » (replié). **Tout rétablir** annule.
2. **Comparer** : après une première vérification, cliquer **📌 Référence** ; relancer après retouche ; l'en-tête indique « n nouveaux, m résolus ».
3. **Exporter** : **Rapport ↗** écrit `<carte>-verification-carte.txt`, un texte brut qui se colle dans un courriel et se compare avec n'importe quel diff.
4. **Voir tout** : **◎ Tout peindre** pose un anneau sur la carte à chaque constat.

### Je veux évaluer le placement des composants

1. Éditeur PCB : cliquer **Score Placement**.
2. Lire HPWL, congestion, découplage HF, composants les plus étirés (voir la référence « Score de placement »).

## Référence

### Les bornes de la Chute DC

| Bouton ou champ | Effet | Limites |
|---|---|---|
| **+ source (V)** | Arme la désignation : le clic suivant sur une pastille de la carte pose une source (alimentation dont on règle la tension). | Éditeur PCB : l'aide dit « Cliquez la pastille de la SOURCE ». Autant de sources qu'on veut ; plusieurs sources tiennent chacune leur tension. Valeur de départ : 3,3 V (reprise du schéma si le composant en donne une). Recliquer la même pastille remplace la borne en gardant sa valeur, son unité et son nom. |
| **+ charge (A)** | Idem pour un consommateur dont on règle le courant. | Un rail qui nourrit dix composants en porte dix. Valeur de départ : 1 A (reprise du schéma si le composant en donne une). Clic hors d'une pastille : « Aucune pastille sous le clic : visez le cuivre d'une pastille. » |
| **⚡ Du schéma** | Importe les sources et les charges du schéma pour le net de la piste sélectionnée (à défaut, le net surligné, celui des bornes déjà posées, un rail reconnu par son nom, ou celui d'un régulateur). | Éditeur PCB (dans la Visionneuse, le bouton devient **⚡ Des composants**). Les bornes dont la valeur a été saisie à la main (badge Manuel) sont conservées. Sans courant connu, une LED ou diode reçoit 0,015 A et les autres charges 0,030 A (badge Défaut) ; le courant d'un composant est réparti entre ses broches sur le rail. Refus : « Aucun net d'alimentation sélectionné ou détecté » et « Aucun composant (source ou charge) trouvé sur le net … dans le schéma ». |
| **Effacer** | Oublie toutes les bornes. | |
| **⚡ Des composants** | Visionneuse : importe les sources, les charges, les composants en série et les entrées de régulateur du rail, lus dans la nomenclature IPC-2581 (valeur, référence, propriétés) puis dans le catalogue. Le rail : le net choisi s'il est de classe Alimentation, sinon celui des bornes, sinon le premier rail. | Les broches du fichier n'ont qu'un numéro : leur nom vient de la colonne « Brochage » du catalogue. Un connecteur (`J`, `CON`, `BAT`) est une source, à la tension écrite dans le nom du net (3,3 V sinon). Un circuit (`U`, `IC`) est une charge, à 30 mA sans courant connu. Un régulateur se reconnaît à sa description (`LDO`, `régulateur`, `DC-DC`, `buck`, `boost`). |
| Case **masse** | Ajoute le retour par la masse au calcul : chaque charge rend son courant par les broches de masse de son composant, la masse des sources est à 0 V. Le cuivre de masse est rogné à 5 mm autour du cuivre du rail. | Refus si aucune source n'a de broche de masse. Une charge posée sans composant ne rend pas son courant. Avec la masse, la trame s'élargit : un rail aux pastilles très fines peut s'en détacher (le refus le dit). |
| **▶ Tous les rails** | Importe et calcule chaque rail, puis affiche une ligne par rail. Cliquer une ligne recalcule ce rail seul. | Garde les bornes posées et les rend à la fin. Visionneuse : un rail est un net de classe Alimentation (à corriger dans la fenêtre des nets). |
| Badge d'origine | Dit d'où vient la valeur : **Défaut**, **LIB**, **API**, **Motif**, **Manuel**, **DS** (datasheet). Infobulle « Origine : … » ; elle précise « Partagé sur n broches » quand une borne regroupe plusieurs broches. | Saisir la valeur à la main (Éditeur PCB) passe l'origine à **Manuel**. Dans la Visionneuse, les bornes restent « Défaut » même corrigées. |
| Nom de la borne | Champ texte repris dans les tableaux et l'export. | Vide : retour au nom proposé par la carte. |
| Valeur et unité | Source : **V** ou **mV**. Charge : **A**, **mA** ou **µA**. Changer l'unité garde le nombre écrit. | La valeur est stockée en V et en A. |
| **×** | Retire la borne. | |
| **Stratifié** (W/(m·K)) | Conductivité thermique du stratifié dans le plan. Vide : 0,8 (FR-4). | Entrée du calcul : le modifier sans relancer laisse une alerte « Le λ saisi (…) n'est pas celui de ce résultat (…) : relancez le calcul ». |
| **Trame** (mm) | Côté du carreau de maillage. Vide (« auto ») : choisi pour que la forme la plus étroite reçoive au moins quatre carreaux. | Trop fine ou trop grossière : le serveur refuse avec un message (« Trame trop fine… », « Trame trop grossière… », « Maillage trop lourd… »). |
| **▶ Calculer** | Lance le solveur (réseau résistif sur tout le cuivre du net, gradient conjugué, densité, échauffement). | Refus avec conseil : « Il faut au moins une source et une charge », « Les bornes ne sont pas toutes sur le même net », « Sans net : … », « Aucune charge ne tire de courant ». |
| **.csv** | Les tableaux du résultat (bornes, nets, pire point, vias) précédés des réglages. Nom : `chute-<net>-dc.csv`. | Exporte le résultat affiché, sans recalcul. |
| **.json** | Le problème (cuivre envoyé, bornes, cotes thermiques) et le résultat, pour rejouer et comparer. Nom : `chute-<net>-dc.json`. | Si la sélection a changé depuis le calcul, seul le résultat est écrit. |
| **Budget** : chute (%) | Seuil du verdict, en % de la tension de la source (5 par défaut). | Ne relance pas le calcul. |
| **Budget** : échauffement (°C) | Seuil du verdict (10 par défaut). | Ne relance pas le calcul. |
| **Tenue** : A/via | Courant admis par via. Vide (« auto ») : IPC-2221 sur la section du tube, couche interne, au budget d'échauffement. | Ne relance pas le calcul. |
| **Tenue** : A/mm² | Densité de courant admise. Vide : non jugée. Un dépassement met le verdict en ambre et nomme le net, jamais en « Hors budget ». | Le pic de densité croît quand on affine la trame : c'est un endroit à regarder, pas un verdict. |
| **Ambiante** (°C) | Sert à écrire la température absolue du point chaud. Peut être négative (20 par défaut). | Ne change aucun calcul : l'échauffement est un écart. |
| Liste **Carte** | Grandeur peinte : **Échauffement (étalement)** (°C), **Densité** (A/mm²), **Potentiel** (mV), **Réf. IPC-2221** (°C). | Changer de grandeur ne relance rien. |
| **estomper le reste** | Estompe le cuivre qui n'est pas dans le calcul. | Éteint d'office. |
| **Couche peinte** | Liste « auto » + une entrée par couche calculée ; « auto » suit la charge la plus mal servie. | Apparaît s'il y a au moins deux couches calculées. Une seule couche est peinte à la fois. |

### Lire le résultat de la Chute DC

| Élément | Ce qu'on lit | Limites |
|---|---|---|
| Verdict | « Hors budget : la chute et/ou l'échauffement », « Dans le budget, sans marge » (au-delà de 80 % d'un budget) ou « Dans le budget ». Détail : « x mV à REPÈRE (p % de V V, budget n %) · +x °C sur NET → y °C (budget n °C, IPC-2221 en annoncerait z °C) ». | Sans source déclarée, le pourcentage n'existe pas : seule la température est jugée. Barre de gauche : bleu « Dans le budget », ambre « sans marge », jaune « Hors budget » (le rouge est réservé aux tableaux). |
| Ligne de contexte | Nets, nombre de couches, courant total (A), trame (mm), nombre de nœuds et de trous. | |
| Légende | Échelle de la grandeur peinte, trois valeurs (minimum, milieu, maximum) sur une rampe cyan (bas de l'échelle) - violet - ambre (maximum). | Le maximum de la **Densité** dépend du maillage (singulière à un angle vif) : c'est un repère. |
| Tableau des bornes | Colonnes Borne, Couche, Réglage, Tension, Perdu (mV et %). Teinte de « Perdu » : bleu jusqu'à 80 % du budget de chute, ambre de 80 % à 100 %, rouge au-delà. | Les bornes hors de la couche peinte sont signalées : leur cuivre n'est pas coloré, mais les chiffres sont ceux de tout le calcul. |
| Tableau des nets | Net, Courant, Chute (mV). « (réf.) » marque un net de référence. | |
| Pire point par net | Échauffement (étalement) et température absolue, Réf. IPC-2221, Écart, Section, Densité de pointe. Infobulle de l'échauffement : lieu en mm et couche. | La densité dit où regarder, pas combien. L'échauffement prend la même teinte que « Perdu », sur le budget d'échauffement. |
| Tableau des vias | Via, Couches, Courant, Tenue (et le pourcentage porté), Chute, R (mΩ), les plus chargés d'abord, quinze lignes au plus. Une note liste tous les vias au-delà de leur tenue. « hors calcul » pour un via non relié, « ? » sur un perçage ou une portée supposés. | Un perçage déduit de la pastille fausse R (R varie comme 1/section). |
| Notes sous les tableaux | Déséquilibre entre vias du même couple de couches ; part du passage vertical portée par des portées supposées traversantes ; culs-de-sac (courant nul vérifié) ; cuivre analysé ; trame ; paramètres thermiques ; couches prises pour extérieures ; ambiante ; notes de l'outil. | Une alerte signale une forme plus étroite que quatre carreaux : sa résistance est échantillonnée, pas maillée. |
| Avertissements du solveur | Par exemple « EMBALLEMENT THERMIQUE » (rendu en rouge) : la température rendue est un plancher, à refaire. « Aucun courant injecté… », « n via(s) n'ont pas été montés… ». | |
| Survol de la carte | Valeur de la grandeur peinte au nœud survolé et, sur un via, une ligne « REPÈRE a→b courant, chute, résistance ». | Un via seul suffit à répondre, même sans cuivre du net sur la couche peinte. |

> [!NOTE]
> La conduction de la chaleur par le stratifié et les plans (étalement) est le modèle qui décide ; la charte IPC-2221 (conducteur isolé à l'air calme) est calculée à côté pour comparaison. Le panneau cite la campagne IPC-2152 comme justification du modèle d'étalement, mais ne produit pas de lecture d'abaque IPC-2152.

### Z(ω) PDN : champs et boutons

| Bouton ou champ | Effet | Limites |
|---|---|---|
| **Rail PDN** | Liste des rails. Groupes « Rails d'alimentation détectés » (nets reconnus par leur nom ou portés par un condensateur vers la masse) et « Tous les autres nets de la carte ». Changer de rail recalcule. | Sans carte, quatre noms par défaut sont proposés (`+3V3`, `+5V`, `VCC`, `VDD`). |
| **⚡ Détecter** | Reprend le net sélectionné sur la carte (hors masse) et rescanne les condensateurs du rail, puis recalcule. | |
| **Vdd** (V) | Tension nominale du rail (3,3 par défaut). | Plancher 0,1 V dans le calcul. |
| **Ondulation admise** (%) | Ce que la tension a le droit de faire, en % de Vdd (5 par défaut). | Tolérance saisie, pas une mesure. Plancher 0,1 %. |
| **ΔI** (A) | Saut de courant transitoire maximal (1 par défaut). Sert à Z_target = Vdd × ondulation / ΔI. | Repris de l'assistant quand il est coché, sauf saisie manuelle. Plancher 0,01 A. |
| **Calculer ΔI (assistant)** | Active l'assistant : fiche de la charge et appels de courant vérifiés chacun à sa fréquence. | Décoché par défaut ; le choix est gardé dans le profil. |
| Badge **Z_target = …** | Impédance cible courante. | |
| **R_vrm** (mΩ) | Résistance du régulateur (2 par défaut ; l'infobulle dit « typiquement 1 à 10 mΩ »). | Le VRM est en parallèle sur le point observé. |
| **f_vrm** (kHz) | Bande passante de la boucle du régulateur (100 par défaut ; « typiquement 50 à 200 kHz »). | |
| **Cavité** (cm²) et (µm) | Surface de cuivre en regard et distance diélectrique au plan de référence. | Renseignés par la détection quand une cavité est trouvée. |
| **Plan** | Inclut la capacité inter-plans et les pertes. | Cochée d'office ; décochée quand aucune paire de plans n'est trouvée. |
| **Dim X (a)**, **Dim Y (b)** (mm), **ε_r**, **tanδ** | Emprise de la cavité et diélectrique (50 × 50 mm, ε_r 4,3, tanδ 0,02 par défaut avant détection). | Le modèle modal traite le plan comme un rectangle plein de même emprise. |
| **Modes 2D** | Calcule et trace les modes TM de cavité (repères violets sur la courbe, cartographie, tableau). | Cochée d'office. |
| **Point observé** X, Y, **Ouverture** (mm) | Composant alimenté dont on mesure Z(ω), dans le repère affiché par l'outil ; ouverture = écartement de la paire de vias traversant les plans (1,5 mm par défaut). | Détecté : le composant du rail qui a le plus de broches (hors passifs et connecteurs). Sans candidat : un coin, cas le plus défavorable. |
| **▶ Calculer Z(ω)** | Relit les champs et calcule de 10 kHz à 1 GHz. | |
| **.csv**, **.json** | Exportent la courbe, les condensateurs et les modes. Noms : `pdn-<rail>-z_omega.csv` / `.json`. | Message « Aucun calcul à exporter : lancez d'abord le calcul Z(ω). » avant tout calcul. |

### Z(ω) PDN : le résultat

| Élément | Ce qu'on lit | Limites |
|---|---|---|
| Verdict (assistant coché) | « ONDULATION ESTIMÉE : x mV (p %) pour y mV admis (n %) » avec le nom de l'appel de courant le plus exigeant, ou la liste des appels en dépassement. Dessous, « Vérification la plus sévère » (ΔI max à toutes les fréquences). | Encadré vert si tous les appels tiennent, rouge sinon. |
| Verdict (assistant décoché) | « PDN CONFORME » ou « DÉPASSEMENT DE L'IMPÉDANCE CIBLE (+n%) » avec le pic et sa fréquence. | Une seule cible, toutes fréquences. Encadré vert ou rouge. |
| Note de cavité | Plans retenus et surface en regard, ou raison de leur absence (par exemple : pas de versement de rail d'au moins 1 cm², pas de plan de masse, plans qui ne se font pas face). | Sans cavité, chaque condensateur est relié par sa piste (colonne « Piste ») et le solveur reste localisé. |
| Ligne de résumé | Rail, impédance cible, impédance max, fréquence du pic, condensateurs actifs, capacité plan, point observé, surface en regard, épandage, mode fondamental. | |
| Courbe | \|Z_pdn(ω)\| total (cyan), Z_target (rouge, pointillés), VRM (orange, pointillés), Plan (violet, pointillés), repères des Modes 2D (violet). Axes logarithmiques. Repères numérotés des appels de courant, verts s'ils tiennent, orange sinon, posés à la hauteur de leur propre cible. | Plage fixe 10 kHz à 1 GHz. |
| Lecture au survol | « f = … · \|Z\| = … (marge +x % ou dépassement +x %) ». | |
| Bloc assistant | « Fiche de la charge » (9 champs), puis « Appels de courant sur le rail » : colonnes #, Événement, Comment il est calculé, ΔI, Fréquence, Z carte, ΔV = ΔI × Z, Verdict. | Voir le tableau suivant. |
| Tableau « Condensateurs de découplage du rail (n) » | Actif (case), Réf, Valeur, Boîtier, ESR, ESL, L_mount, Piste, f₀ (SRF), Modèle / Provenance (**Murata SPICE**, **Catalogue**, **Datasheet**, **Générique**). Cocher ou décocher recalcule. | « ≈ » devant une piste : distance à vol d'oiseau faute de chemin de cuivre. Un composant marqué « Non monté » est ignoré. |
| Résonances 2D de cavité | Boutons des huit premiers modes (`TM10 (f)`), fiche du mode actif (fréquence propre, facteur Q, bande passante, impédance crête, type, ventres), cartographie de \|V(x, y)\| avec lignes nodales, points chauds, point observé et condensateurs, tableau de tous les modes. | La cartographie donne l'efficacité d'amortissement locale d'un condensateur : sur une ligne nodale, elle est nulle. |

#### Les appels de courant de l'assistant

| Événement | ΔI | Fréquence |
|---|---|---|
| Réveil (veille → actif) | consommation en fonctionnement moins consommation en veille | 0,35 / durée de montée |
| Horloge | consommation en fonctionnement | fréquence d'horloge |
| Sorties qui basculent ensemble | N × C × Vdd / t, bornée par le courant max par sortie si renseigné | 0,35 / temps de montée |
| Charge commutée | courant saisi (ajoutée par **+ Charge** ; 10 mA et front de 10 ns par défaut) | 0,35 / durée du front |

Chaque ligne a une case (cochée d'office) pour l'inclure ou non ; un **✕** retire une charge ajoutée. Un ⚠ après la fréquence signale un événement hors de la bande tracée (Z lue au bord).

| Champ de la fiche de la charge | Unité | Défaut |
|---|---|---|
| Fréquence d'horloge | MHz | 16 |
| Consommation max en fonctionnement | mA | 10 |
| Consommation en veille | µA | 0 |
| Montée du courant au réveil | µs | 1 |
| Sorties qui basculent ensemble | | 8 |
| Temps de montée des sorties | ns | 5 |
| Charge par sortie | pF | 20 |
| Courant max par sortie | mA | 0 (pas de borne) |
| Tension min de fonctionnement | V | 0 (non renseignée) |

La fiche est enregistrée dans le profil, sous la référence de la pièce : remplie une fois, elle sert sur toutes les cartes qui portent la pièce. Une ligne sous la fiche dit si la source est « fiche enregistrée dans ton profil », « en partie lue dans la bibliothèque » ou « valeurs par défaut ». Si la tension minimale est renseignée, une note compare la chute tolérée par la charge à l'ondulation réglée.

### Identification des alimentations

Le panneau cherche tout seul les rails et leurs acteurs.

| Ce qui est identifié | Comment | Limites |
|---|---|---|
| Rails (liste **Rail PDN**, Éditeur PCB) | Net sélectionné sur la carte, net porté par un condensateur dont l'autre broche est à la masse, ou nom reconnu (commençant par `+` et un chiffre, de la forme `3V3` ou `12V`, ou contenant `VCC`, `VDD`, `VBAT`, `VBUS`, `VIN`, `VSYS`, `VREF`, `PWR`, `ALIM`…). La masse est reconnue par son nom (`GND`, `0V`, `VSS`, `GROUND`, `EARTH`, `masse`, `AGND`…). | Nom hors usage : choisir le net dans « Tous les autres nets de la carte ». Aucun rail reconnu : tous les nets hors masse sont proposés. |
| Condensateurs d'un rail | Composants entre le rail et la masse : le type déclaré, sinon une référence `C` suivie d'un chiffre, avec une valeur en farads ; au-delà de quatre broches, ce n'est pas un condensateur. Parasites (ESR, ESL) : base Murata par modèle, MPN ou nom, sinon valeurs typiques par boîtier et capacité. | Provenance visible dans la colonne « Modèle / Provenance ». |
| Charge observée | Le composant du rail qui a le plus de broches, hors passifs et connecteurs. | Modifiable par les champs X, Y du point observé. |
| Cavité | Plus grand versement du rail et plus grand versement de masse (au moins 1 cm² chacun) qui se font face ; couple le plus rapproché. | Carte deux couches ou rail routé en pistes : pas de cavité, le solveur reste localisé. |
| Sources et charges de la Chute DC | Voir **⚡ Du schéma**. L'entrée d'un régulateur (broche `VIN`, `IN`, `VCC`…, ou net dont la tension écrite n'est pas sa sortie) n'est plus prise pour une source. | Sans nom de broche ni tension lisible dans le nom du net, la broche reste une source. |
| Composants en série (cascade) | Deux pastilles sur deux nets d'alimentation : ferrite ou self (DCR du catalogue ou de la nomenclature, sinon 50 mΩ), fusible (sinon 100 mΩ), shunt `R` ≤ 1 Ω, strap `R` de 0 Ω. | Une valeur supposée est dite dans les notes. |
| Rendement d'un régulateur | 1 (linéaire) si son nom évoque un LDO (`LDO`, `1117`, `78xx`, `LM317`, `TPS7…`…), sinon 0,85. | Reconnu au nom seulement. |
| Rails jugés par l'Audit | Nets de classe **Alimentation** ou **Découpage**. | Voir « Courant et largeur des rails ». |

### Estimation d'échauffement d'un composant (Éditeur PCB)

| Bouton ou champ | Effet | Limites |
|---|---|---|
| **Puissance dissipée (W)** (propriétés du composant) | Puissance en service. Vider le champ retire la donnée. | Valeur plafonnée à 100 W. |
| **Estimer l'échauffement** | Envoie au serveur la puissance, le cuivre relié aux pastilles (pastilles, îlots de zone touchés par un cuivre réel, pistes des nets) et la surface de la carte. Affiche « ≈ x K au-dessus de l'ambiante (… mm² de cuivre relié, … K/W) — un ordre de grandeur, ±30 % ». | Désactivé tant que la puissance est vide. Refus : « Aucun composant ne dissipe : donnez sa puissance (W) dans ses propriétés. » |
| **Échauffement max (K)** (propriétés de la carte) | Limite au-delà de laquelle le DRC signale un composant (40 par défaut, de 1 à 500). | Le résultat n'est valable que pour la révision de la carte où il a été calculé. |
| Ligne du DRC | « REF : échauffement estimé x K pour y W (limite z K) — plus de cuivre relié (zone, liaison directe, vias vers un plan) ou moins de puissance ». | Si la carte a bougé depuis, une info demande de relancer l'estimation (propriétés d'un composant qui dissipe, ou `cao_thermique`). |

Le détail chiffré donne, par composant, la résistance thermique en K/W répartie entre l'étalement dans l'îlot de cuivre et la sortie par les faces et l'ailette de la carte. Le champ **Stratifié** de la Chute DC ne s'applique pas à cette estimation ; les valeurs non fournies (conductivité 0,8 W/(m·K), échange 12 W/(m²·K) par face) sont des replis, et la phrase du modèle les nomme (« Supposé faute de mieux : … »). Quand une zone ne peut pas être rastérisée, la zone entière est prise pour l'îlot et la phrase dit « Approché sur … ».

### Audit : réglages

| Bouton ou champ | Effet | Limites |
|---|---|---|
| **▶ Vérifier la carte** | Envoie toute la carte au serveur (`/api/analyse-carte`) et juge toutes les règles. | Ne dépend pas de la sélection. Les réglages changés ne relancent rien. |
| **Rapport ↗** | Écrit `<carte>-verification-carte.txt`. | Actif seulement après une vérification. |
| **📌 Référence** | Garde la vérification affichée comme référence de comparaison. | Actif seulement après une vérification. |
| **◎ Tout peindre** | Anneau sur la carte à chaque constat, à la couleur de la sévérité (dérogations et marquages exceptés). | Bascule. |
| **Z₀ des lignes** (Ω) | Impédance supposée pour juger la réflexion d'un via quand la classe n'a pas sa cible (50 par défaut). | |
| **Z diff des paires** (Ω) | Z_diff visée (100 par défaut). | |
| **t_r diaphonie** (ps, ns, µs) | Front global de la diaphonie, niveau 2 (1 ns par défaut). | Le même que « toute la carte » de l'onglet Crosstalk. |
| **orange dès** / **rouge au-delà de** (%) | Seuils de diaphonie en % de l'agresseur (3 et 7). | |
| **pertes R, G** | Pertes de la ligne au genou du front dans la diaphonie. | Coché : n'ôte que du bruit. Décoché d'office. |
| **Σ agresseurs** | **en phase** (somme arithmétique) ou **quadratique**. | « en phase » d'office. |
| Tableau « Classe de net » | Une ligne par classe : **Front de montée**, **Cadence max**, **Z₀ visée**, **Z_diff visée**, **Exemples de nets**. | Voir le tableau ci-dessous. Un front plus long que la demi-période de sa cadence, ou sous 10 ps, déclenche un avertissement sous le tableau (« Unité du front, ou de la cadence ? »). |
| **porteuse des nets RF** (Hz à GHz) | Remplie, les nets RF se jugent à cette porteuse, au lieu de leur front et de leur cadence. | Vide (« aucune ») : front RF. |
| **porteuse d'un net** | Porteuse propre à un net, au format `NET=valeur unité` séparés par des points-virgules (exemple `NFC_ANT=13,56 MHz ; LORA_RF=868 MHz`). | Sans unité : MHz. |
| **courant d'un rail** | Courant que tire chaque rail, `NET=valeur` en A ou mA, séparés par des points-virgules (exemple `VCC=0,5 ; 3V3=1,2 A`). | Sans courant, seuls les étranglements sortent, en info. |
| **← Chute DC** | Reprend les courants des charges posées dans l'onglet Chute DC, additionnés par rail. | Sans charge dans la Chute DC, l'infobulle le dit. |

Les unités de chaque cadence et de chaque front se changent par une liste ; en changer **convertit** la valeur affichée sans la réinterpréter. Les réglages sont gardés **par carte**, dans ce navigateur, sous le nom de la carte : une autre carte repart des défauts et son rapport est effacé.

| Classe | Front | Cadence max | Exemples |
|---|---|---|---|
| Horloge | 2 ns | 50 MHz | oscillateur, CLK, MCLK, XIN/XOUT d'un quartz |
| Rapide | 1 ns | 100 MHz | DDR, HDMI, SDIO ; USB, Ethernet et LVDS ont leur classe d'interface |
| RF | 100 ps | 1 GHz | antenne LoRa 868 MHz, Wi-Fi/BLE 2,4 GHz, vers un SMA |
| Analogique | 100 ns | 1 MHz | entrée d'ADC, capteur, référence, audio |
| Lent | 10 ns | 10 MHz | GPIO, LED, bouton, reset, I2C, UART ; tout net non classé |
| Découpage | 5 ns | 2 MHz | nœud SW d'un buck ou d'un boost (détecté seul) |

Le front effectif est le plus petit du front de la classe et de 10 % de la période de sa cadence ; les règles électriques jugent au genou 0,35 / t_r.

Le champ **Z₀ visée** n'existe que pour Horloge, Rapide, RF, Analogique et les classes d'interface (vide : le « Z₀ des lignes » ; pour une interface, aucune cible de brin). Le champ **Z_diff visée** n'existe que pour les classes d'interface (leur norme par défaut).

Les **classes d'interface** ajoutent une ligne chacune, avec la Z_diff de leur norme et sans Z₀ de brin :

| Classe | Nom | Front | Cadence | Z_diff |
|---|---|---|---|---|
| USB FS | USB 2.0 Full Speed | 4 ns | 6 MHz | 90 Ω |
| USB HS | USB 2.0 High Speed | 500 ps | 200 MHz | 90 Ω |
| ETH 100 | Ethernet 100BASE-TX | 3 ns | 31,25 MHz | 100 Ω |
| ETH 1000 | Ethernet 1000BASE-T | 2 ns | 50 MHz | 100 Ω |
| LVDS | LVDS (TIA-644) | 300 ps | 330 MHz | 100 Ω |
| CAN | CAN (ISO 11898) | 50 ns | 500 kHz | 120 Ω |
| RS-485 | RS-485 (TIA-485) | 20 ns | 5 MHz | 120 Ω |

### Audit : lire le rapport

| Élément | Ce qu'on lit | Limites |
|---|---|---|
| Badges de l'en-tête | Compte par sévérité : critique, vigilance, info (sur les nets, marquages à part). | |
| Ligne de contexte | Pistes et tolérance d'angle, vias jugés, couples voisins, nets chiffrés, vides de plan, cavités, paires, circuits et broches d'alimentation, bouts libres, branches, quartz, connecteurs, rails ; puis les réglages employés (Z₀, diaphonie, cadence par classe, porteuses). | Sans elle, un rapport exporté ne se vérifie plus. |
| Réserves | Encadrés rouges : ce qui n'a pas été vérifié. | Ne pas les lire comme « tout va bien ». |
| Comparaison | « Comparé à la référence … : n nouveau(x), m résolu(s) » et lien **oublier**. Chaque constat absent de la référence porte **nouveau**. | La clé d'un constat est la règle, le net, la couche et la position au demi-millimètre (pas ses chiffres). |
| Bloc de règle | Titre, nombre de constats et de nets, phrase « pourquoi », puis constats par net avec la **classe** du net. Le plus grave d'abord ; les blocs non « info » sont ouverts. | La classe fixe le front : un net mal classé se voit là. |
| Ligne de constat | Couche (ou « couche → couche »), position en mm, message chiffré, et pastille(s) « fréquence · valeur » pour les règles électriques, colorées par verdict. | La valeur est un pourcentage, ou un rapport « × λ/20 » ou « × λ/40 ». Au survol : front effectif, genou, et selon la règle distance de retour, écart de longueur, résonance du condensateur. |
| **✓** (au survol) | Accepte le constat (dérogation). | Gardé pour cette carte, dans ce navigateur. |
| Section « Résolus depuis la référence » | Constats disparus depuis la référence. | |
| Section « Dérogations acceptées » | Constats acceptés, **Tout rétablir**. | |
| Section « Marquages : cuivre sans net » | Texte, logos, repères de couche en cuivre, rangés à part. | Jugés comme le reste, mais ne portent pas de signal. |
| Section « Nets classés Lent par défaut, non vérifiés » | Nets que rien n'a classés. | À parcourir à chaque nouvelle carte. |

Au clic sur une ligne, une marque (cercle et quatre traits) se pose sur la carte à la couleur de la sévérité (rouge critique, ambre vigilance, cyan info).

### Audit : les règles, une par une

Le détail de chaque règle, avec des exemples et la manière de corriger, est dans [../verification-carte.md](../verification-carte.md) ; la physique est dans [../simulation-em.md](../simulation-em.md). Les blocs du rapport, dans l'ordre des règles :

| Bloc (titre à l'écran) | Ce qu'il cherche | Sévérité | Limites |
|---|---|---|---|
| Angles aigus | Deux branches à moins de 89° (le fond du V retient le bain de gravure). | critique | Un sommet dans une pastille ou un via n'est pas jugé. |
| Angles droits | Coude à 90° ± 1°. | vigilance | Correction dans l'Éditeur PCB : **Angle droit → 45° (D)** dans l'inspecteur. |
| Bouts de piste orphelins | Piste isolée, bout libre au départ d'une pastille (antenne), dépassement après un coin (moins de 0,5 mm), moignon. Sur un net de signal, jugé aussi à la cadence (2T_d face au front). | critique ou vigilance | Le cuivre sans net et les bouts plus courts que l'arrondi de la piste ne sont pas signalés. |
| Jonctions | Trois branches ou plus au même point, ou un T. | vigilance | |
| Segments hors 45° | Segments hors des huit directions, une ligne par piste. | info | |
| Empilage | Couche de signal sans plan de référence, plan derrière une autre couche de cuivre, plan à plus de 0,5 mm pour des nets rapides, deux couches de signal face à face, alimentation séparée de sa masse par un signal, cavité alimentation/masse de plus de 0,25 mm, empilage dissymétrique (nombre impair de couches de cuivre, épaisseurs en miroir à plus de 10 %, plan face à un signal en miroir). | critique (couche sans plan portant un net rapide), vigilance ou info | Constats de carte, sans position. |
| Chemins de retour | Chaque via de signal qui change de plan de référence : réflexion \|Γ\| et taille de la boucle face à λ/20. | selon le cas | Même moteur que l'onglet Current Return Path ; sans portée de perçage déclarée, le via est supposé traversant. |
| Fentes et vides des plans | Piste de signal au-dessus d'un vide de son plan de référence (détours plafonnés à 30 mm). | selon \|Γ\| | Une ligne par net et par plan. |
| Vias de couture | Plus grand trou sans via entre deux couches de la même masse, face à λ/20. | selon le rapport | Le pire trou de chaque cavité seulement ; aucun via : critique. |
| Impédance des nets | Z₀, retard, R, L, C de chaque net ; tronçons qui s'écartent de la référence. | selon \|Γ\| (5 % / 10 %) | Cible Z₀ de la carte pour Horloge, Rapide et RF ; les autres classes se comparent à l'impédance dominante de leur net, sauf si on leur donne une « Z₀ visée » dans le tableau des classes. |
| Diaphonie | Couples de pistes voisines de nets différents (même couche, ou couches voisines superposées) et somme des agresseurs : k_total, NEXT, FEXT en % de l'agresseur. | vert / orange (vigilance) / rouge (critique) | Un couple dont l'écart dépasse le seuil de distance (3 × la largeur, ou 5 h) de moins de 1,5 fois est nommé dans une note, pas chiffré. |
| Paires différentielles | Z_diff le long de la paire, écart de longueur, plan sous une seule moitié, vias en nombre différent. | vigilance ou critique | |
| Découplage | Un condensateur vers la masse au pied de chaque broche d'alimentation de circuit intégré, à moins de λ/40 par le chemin réel ; résonance selon sa valeur. | vigilance au-delà de λ/40, critique au-delà de λ/20 ou si aucun condensateur sur le rail ; vigilance aussi si aucun condensateur du rail ne résonne à moins d'une décade sous le genou | Ne juge que les rails de classe Alimentation. Un rail sans condensateur est souvent une sortie qui alimente une autre puce : la classer en signal. |
| Bord de carte | Cuivre à moins de 0,25 mm (critique) ou 0,5 mm (vigilance) du détourage, tous nets ; piste rapide qui longe le bord (λ/20) ; clôture de vias de la bande de 2 mm ; règle des 20 H. | critique / vigilance (détourage) ; selon le rapport (CEM, clôture) ; info (20 H) | La règle des 20 H se discute, surtout valable au-delà du GHz. |
| Moignons de vias | Bout de perçage non emprunté, face à λ/20. | selon le rapport | Contre-perçage (backdrill) pris en compte. Une broche traversante n'est pas jugée. |
| Branches en T | Dérivation hors pastille vers une deuxième charge (2T_d face au front, 10 % / 20 %). | vigilance ou critique | |
| Quartz | Pistes vers l'oscillateur au-delà de 10 mm (25 mm : critique) ; autre net que la masse dessous ou à moins de 1 mm. | vigilance ou critique | Un filtre SAW n'est pas un quartz. |
| Protection ESD des connecteurs | Signal de connecteur sans protection vers la masse à moins de 10 mm. | vigilance ; info si aucun signal du connecteur n'est protégé | Un connecteur interne et un connecteur de façade se ressemblent. |
| Courant et largeur des rails | Pour chaque rail (classe Alimentation ou Découpage), la piste la plus étroite face à ce qu'elle tient à +10 °C et +20 °C par IPC-2221 ; étranglements. | vigilance (+10 °C), critique (+20 °C) ; info pour un étranglement sans courant | Étranglement : piste plus de deux fois plus étroite que le reste du rail. Plus prudent que l'étalement de la Chute DC, qui reste l'outil du chiffre exact. |

La classe **Antenne** est jugée en fabrication seulement (angles, détourage, piste isolée) ; l'en-tête du rapport nomme les nets ainsi exclus.

### Score de placement

Ce n'est pas une règle de la vérification de carte mais un panneau de l'Éditeur PCB (bouton **Score Placement** : « Qualité de placement : chevelu minimal HPWL, découplage et congestion »), recalculé par le serveur (`python/pcb_scoring.py`) à chaque retouche. Les composants à placer sont traités au chapitre [Éditeur PCB : édition et routage](03-editeur-pcb-edition-routage.md).

| Élément | Ce qu'on lit | Limites |
|---|---|---|
| **HPWL (Cuivre)** (mm) | Longueur minimale estimée du cuivre (demi-périmètre de la boîte de chaque net), avec l'écart de tendance (vert si le total baisse de 0,1 mm ou plus depuis le dernier calcul, rouge s'il monte). **🔄** recalcule. | La masse générale (nets contenant `GND`, `VSS` ou `0V`) est exclue du total. |
| **Congestion max** | Plus grand nombre de pastilles dans une case de 5 × 5 mm. **📍** centre la vue sur le point chaud à partir de 4. | Seuils de teinte : vert sous 4, jaune dès 4, rouge dès 6. |
| **Orientation de REF** / **Optimisations d'angle** | Pour le composant sélectionné, croisements de chevelu aux quatre angles ; **✨ Tourner à …°** applique le meilleur. Sans sélection, jusqu'à cinq suggestions. | |
| **Découplage HF** | Pourcentage de condensateurs conformes, distance moyenne (cible 3,5 mm au plus), liste « Capas éloignées de leur CI ». | Distance à vol d'oiseau en mm, de la pastille du condensateur à la broche d'alimentation de circuit la plus proche du même net. Ne regarde que les rails dont le nom contient `VCC`, `VDD`, `VEE`, `VBAT`, `3V3`, `5V`, `12V`, `PWR`, `AVCC`, `DVCC` ou `+V`. Pourcentage vert dès 80 %, jaune dès 50 %, rouge dessous. |
| **Composants les plus étirés** | Les cinq composants qui étirent le plus le chevelu, avec leur déplacement moyen. | |
| **Groupes de placement & Zones** | Blocs fonctionnels reconnus au schéma : **🖐 Grouper** (sélectionner), **📐 Disposer** (compacter autour de l'ancre), **🎯 Déposer** (grappe compacte dans un emplacement libre). | Nécessite les motifs du schéma. |
| **Ordre suggéré de placement (Tiers 1 à 4)** | Ancres, actifs, flexibles, passifs libres. | Classement par préfixe de repère suivi d'un chiffre : Tier 1 `J`, `P`, `CONN`, `USB`, `SMA`, `HEADER`, `H`, `MH`, `TP` ; Tier 2 `U`, `IC`, `VR`, `REG`, `Q`, `T` ; Tier 3 `Y`, `X`, `OSC`, `K`, `RLY`, `L`, `TRANS` ; Tier 4 tout le reste. |

## Limites connues

- **Chute DC** : problème résistif sans fréquence. Plusieurs nets ne se calculent ensemble que reliés par un composant en série, ou avec la masse. Avec la masse, seul le cuivre de masse à moins de 5 mm du rail compte. Dans l'Éditeur PCB, un plan est alors pris plein dans son contour : le cuivre des nets hors du calcul n'y est pas découpé. Dans la Visionneuse, les dégagements des plans viennent du fichier. Les courants viennent de l'utilisateur, du schéma, ou de la nomenclature et du catalogue, jamais du cuivre. Les perçages supposés (déduits de la pastille) et les portées supposées traversantes sont signalés mais restent des hypothèses. La densité de pointe croît avec le raffinement du maillage. L'échauffement dépend de la conductivité du stratifié, de l'épaisseur de stratifié et du cuivre étaleur ; le cuivre étaleur est pris nul s'il n'est pas déclaré (carte la plus chaude que le modèle décrive).
- **Chute DC dans la Visionneuse** : le fichier IPC-2581 ne dit pas toujours entre quelles couches court un perçage ; il est alors supposé traversant (notes dans le résultat). Le bouton **⚡ Du schéma** n'existe pas dans la Visionneuse. Elle refuse le calcul tant que l'**Empilage du calcul** (panneau « La carte ») n'est pas complet : sans épaisseur de cuivre, une résistance n'a pas de valeur. Les bornes y se posent à la pastille la plus proche, à moins d'un millimètre du clic.
- **Z(ω) PDN** : le VRM n'a pas de position (en parallèle sur le point observé). Le développement modal suppose un rectangle plein : un plan partiel ou découpé est traité comme le rectangle de même emprise, avec la capacité de sa surface réelle. Un condensateur hors de l'emprise est ramené sur son bord. Les pertes ohmiques du cuivre dans le plan ne sont pas modélisées. Le fichier IPC-2581 ne porte pas de consommation : dans la Visionneuse, la fiche de la charge se remplit à la main la première fois.
- **Estimation d'échauffement d'un composant** : un ordre de grandeur (±30 %), îlot pris rond, carte uniforme, sans voisin qui chauffe. Éditeur PCB seulement.
- **Audit** : l'IPC-2221 pour le courant des rails, pas l'étalement. Une seule porteuse RF pour tous les nets RF (sauf `porteuse d'un net`). Horloge, Rapide et RF partagent par défaut la même cible Z₀ (« Z₀ des lignes »), sauf « Z₀ visée » donnée à une classe. λ/20, λ/40, 5 h et 20 H sont des règles de pouce, pas un calcul de rayonnement. Le découplage d'un rail passé par un plan se mesure à vol d'oiseau. Dans l'Éditeur PCB, les zones partent remplies mais en polygones à 8 côtés, et une pastille ronde ou polygonale part en rectangle. Diaphonie entre couches voisines : milieu homogène. Ni l'Éditeur PCB ni la Visionneuse n'envoient de courant par rail : sans le champ **courant d'un rail**, seuls les étranglements sortent.
- **Réglages et dérogations** sont gardés dans ce navigateur (par nom de carte) : un navigateur privé repart des défauts.
- Valeurs de précision, durées et performances de calcul : `À vérifier` (non établies dans le code lu).

## Voir aussi

- [Simulation SI](08-simulation-si.md) : le panneau en général, Impédance, Z différentielle, Crosstalk, Current Return Path, Bus synchrone, Diagramme de l'œil.
- [Simulation RF et EM](10-simulation-rf-em.md) : la famille RF.
- [Éditeur PCB : édition et routage](03-editeur-pcb-edition-routage.md) et [Éditeur PCB : contraintes et fabrication](04-editeur-pcb-fabrication.md) : classes de nets, DRC, propriétés des composants et de la carte.
- [Visionneuse IPC-2581](07-visionneuse-ipc2581.md) : ouverture d'un fichier, classification des nets.
- [Éditeur schématique](02-editeur-schematique.md) : motifs, classes de nets.
- [Claude et le MCP](11-claude-mcp.md) : `cao_thermique`, `cao_score`, `cao_sim_lire`, `cao_sim_ecrire`.
- [../verification-carte.md](../verification-carte.md) : tutoriel détaillé de l'audit.
- [../simulation-em.md](../simulation-em.md) : physique du PDN et des moteurs.
