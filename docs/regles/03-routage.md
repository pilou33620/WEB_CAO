# Routage

Le routage transforme la netlist en cuivre. Ses règles viennent du courant, de la tension, de la vitesse des fronts et de ce que le fabricant sait graver.

## Préparation

- **R1 — Règles avant la première piste.** Saisir les classes de nets, largeurs, isolements, vias et impédances dans les contraintes avant de router.
  - *Pourquoi* : le DRC contrôle pendant le routage au lieu de révéler cent écarts à la fin.
- **R2 — Ordre de routage.** Router dans l'ordre : liaisons critiques (horloges, paires, RF, impédance contrôlée), alimentations, puis signaux lents.
  - *Pourquoi* : les liaisons critiques ont besoin des chemins directs ; routées en dernier, elles prennent les restes.
- **R3 — Sens préférentiel par couche.** Sur les couches internes de signal, alterner les directions (horizontale sur l'une, verticale sur la suivante).
  - *Pourquoi* : deux couches voisines parallèles se couplent sur de grandes longueurs ; l'alternance laisse aussi des canaux libres.
- **R4 — Grille de routage.** Router sur une grille cohérente avec le pas des composants.
  - *Pourquoi* : les pistes s'alignent, l'espace se gère mieux et les modifications sont plus propres.

## Largeur et courant

- **R5 — Largeur selon le courant.** Dimensionner chaque piste de puissance pour son courant et l'échauffement admis (souvent +10 °C), avec IPC-2152.
  - *Pourquoi* : une piste trop fine chauffe, décolle ou fond ; IPC-2152 tient compte des plans et du stratifié, plus réaliste que les anciennes abaques IPC-2221.
  - *Réf.* : IPC-2152. À titre d'ordre de grandeur, l'abaque IPC-2221 donne environ 0,3 mm pour 1 A en couche externe, cuivre 35 µm, +10 °C.
- **R6 — Chute de tension.** Vérifier la chute de tension sur les longues pistes et les plans, pas seulement l'échauffement.
  - *Pourquoi* : une piste peut rester froide et faire perdre 100 mV à un rail de 1,2 V, hors tolérance de la puce.
- **R7 — Plusieurs vias pour le courant.** Doubler ou multiplier les vias sur les nets de puissance, selon leur tenue en courant.
  - *Pourquoi* : un via de 0,3 mm tient environ 1 A ; il est souvent le maillon faible d'un rail bien dimensionné.

## Isolement électrique

- **R8 — Isolement selon la tension.** Écarter les conducteurs selon la tension entre eux et leur situation (couche interne, externe nue, externe vernie).
  - *Pourquoi* : l'air et la surface de la carte claquent ou cheminent au-delà d'une certaine tension par millimètre ; l'humidité et la pollution baissent ce seuil.
  - *Réf.* : IPC-2221 (table d'isolement des conducteurs). Valeurs typiques, au niveau de la mer :

| Tension crête entre conducteurs | Couche interne (B1) | Externe nue (B2) | Externe vernie ou masquée (B4) |
|---|---|---|---|
| 0 à 15 V | 0,05 mm | 0,1 mm | 0,13 mm |
| 16 à 30 V | 0,05 mm | 0,1 mm | 0,13 mm |
| 31 à 50 V | 0,1 mm | 0,6 mm | 0,13 mm |
| 51 à 100 V | 0,1 mm | 0,6 mm | 0,13 mm |
| 101 à 150 V | 0,2 mm | 0,6 mm | 0,4 mm |
| 151 à 300 V | 0,2 mm | 1,25 mm | 0,4 mm |
| 301 à 500 V | 0,25 mm | 2,5 mm | 0,8 mm |

- **R9 — Le fabricant prime aux basses tensions.** Sous 30 V, l'isolement réel est celui du fabricant (souvent 0,1 à 0,15 mm), plus grand que la table.
  - *Pourquoi* : à basse tension, c'est la gravure qui limite, pas le claquage.
- **R10 — Haute tension : la norme produit.** Au secteur ou au-delà de quelques dizaines de volts accessibles, appliquer les lignes de fuite et distances dans l'air de la norme de sécurité ; fendre la carte si besoin.
  - *Pourquoi* : la table IPC-2221 assure le fonctionnement, pas la protection des personnes.

## Géométrie des pistes

- **R11 — Angles à 45° ou arrondis.** Pas d'angle droit ni aigu dans une piste.
  - *Pourquoi* : les angles aigus piègent l'acide de gravure ; à très haute fréquence, l'angle droit ajoute une petite discontinuité d'impédance.
- **R12 — Entrée dans les pastilles.** Entrer dans une pastille par son axe, avec une piste plus fine que la pastille ; pas de piste qui longe une pastille de CMS.
  - *Pourquoi* : une piste large en biais tire la soudure et fait pivoter le composant (tombstone) ; une sortie symétrique équilibre la chaleur.
- **R13 — Pas de moignons.** Aucun bout de piste qui ne mène nulle part ; pas de dérivation (stub) sur une ligne rapide.
  - *Pourquoi* : un moignon est une antenne et, sur une ligne rapide, un réflecteur qui creuse la réponse à sa fréquence quart d'onde.
- **R14 — Larmes (teardrops).** Ajouter des larmes à la jonction piste–pastille et piste–via, surtout pour les pistes fines.
  - *Pourquoi* : si le perçage dérive, la larme garde la liaison ; elle renforce aussi la jonction contre les contraintes mécaniques et thermiques.
- **R15 — Pas de piste sous les pièces sensibles.** Pas de piste rapide sous un quartz, une inductance de découpage ou une entrée analogique haute impédance.
  - *Pourquoi* : le couplage capacitif ou magnétique sous la pièce injecte le bruit directement dans le nœud sensible.

## Vias

- **R16 — Anneau suffisant.** Pastille de via ≥ perçage + 2 × anneau + tolérance de fabrication.
  - *Pourquoi* : à la réception, la classe 3 exige un anneau mesurable (environ 50 µm en externe, 25 µm en interne) ; les classes 1 et 2 tolèrent une rupture partielle à ne jamais viser en conception.
  - *Réf.* : IPC-2221, IPC-6012.
- **R17 — Rapport d'aspect.** Épaisseur de carte / diamètre de perçage ≤ 8:1 en standard (10:1 chez un fabricant avancé) ; microvias ≤ 1:1.
  - *Pourquoi* : au-delà, le placage ne pénètre pas jusqu'au milieu du trou : fût mince, fissure en cyclage thermique.
  - *Réf.* : IPC-2221, IPC-2226, IPC-6012.
- **R18 — Via dans la pastille : rempli et bouché.** Un via dans une pastille de CMS est rempli puis recouvert de cuivre (type VII), ou décalé hors de la pastille.
  - *Pourquoi* : un via ouvert aspire la soudure : joint vide, composant mal soudé, billes de BGA manquantes.
  - *Réf.* : IPC-4761, IPC-7095.
- **R19 — Vias couverts ou ouverts : un choix.** Recouvrir les vias de masque (tenting) ou les boucher, sauf ceux qui servent de point de test.
  - *Pourquoi* : un via découvert près d'une pastille attire la soudure et crée des ponts.
  - *Réf.* : IPC-4761.
- **R20 — Moins de vias sur les lignes rapides.** Limiter les changements de couche des lignes rapides ; à très haut débit, raccourcir le fût inutilisé (contre-perçage ou vias borgnes).
  - *Pourquoi* : chaque via est une discontinuité d'impédance ; la partie de fût qui dépasse la couche utile est un moignon résonant.
- **R21 — Via de retour à chaque changement de couche.** Quand un signal change de plan de référence, placer un via de masse (ou un condensateur entre plans différents) à côté de son via.
  - *Pourquoi* : le courant de retour doit aussi changer de plan ; sans chemin proche, il fait un détour et la boucle rayonne.
- **R22 — Vias de couture.** Coudre les plans de masse entre eux et les coulées de cuivre par des vias réguliers, plus serrés près des bords et des lignes RF.
  - *Pourquoi* : des plans non cousus résonnent ; un îlot de cuivre non relié devient une antenne.

## Chemins de retour et plans

- **R23 — Plan de référence continu sous chaque ligne rapide.** Ne jamais faire passer une ligne rapide au-dessus d'une fente, d'un vide ou d'une coupure de plan.
  - *Pourquoi* : en haute fréquence, le retour suit exactement le dessous de la piste ; une fente l'oblige à contourner, ce qui crée une grande boucle, de la diaphonie et du rayonnement.
- **R24 — Pas de fente créée par les vias.** Écarter les antipastilles des vias alignés pour ne pas découper le plan en fente continue.
  - *Pourquoi* : une rangée d'antipastilles qui se touchent coupe le plan aussi sûrement qu'une fente dessinée.
- **R25 — Pas de piste au bord d'un plan.** Garder une ligne rapide à plusieurs largeurs du bord de son plan de référence.
  - *Pourquoi* : au bord, le champ déborde : l'impédance monte et la ligne rayonne.
- **R26 — Plans en retrait du bord de carte.** Retirer légèrement les plans d'alimentation par rapport aux plans de masse (règle des 20 H, approximative).
  - *Pourquoi* : le champ de bord entre plans rayonne ; le retrait le réduit. L'effet réel dépend de la fréquence : à vérifier plutôt qu'appliquer à l'aveugle.
- **R27 — Coulées de masse reliées.** Toute coulée de cuivre est reliée à la masse par plusieurs vias, ou supprimée.
  - *Pourquoi* : un cuivre isolé capte et réémet le bruit.
- **R28 — Points de liaison entre masses.** Relier les masses séparées (analogique, numérique, châssis) en un point décidé au schéma, sous le composant qui franchit la frontière.
  - *Pourquoi* : la liaison au bon endroit donne aux signaux qui traversent un retour court.

## Impédance contrôlée et signaux rapides

- **R29 — Ligne de transmission dès que la longueur compte.** Traiter en impédance contrôlée toute ligne plus longue qu'environ 1/6 de la longueur parcourue pendant le temps de montée (≈ 15 cm/ns en FR-4).
  - *Pourquoi* : au-delà, les réflexions arrivent après le front et déforment le signal ; c'est le temps de montée qui compte, pas la fréquence d'horloge.
- **R30 — Géométrie de l'empilage validé.** Router les nets à impédance contrôlée avec la largeur et l'écart calculés sur l'empilage du fabricant, sur une couche fixe.
  - *Pourquoi* : l'impédance dépend de la largeur, de l'épaisseur de diélectrique et du Dk ; changer de couche change l'impédance.
  - *Réf.* : IPC-2141. Tolérance courante : ± 10 %.
- **R31 — Largeur constante.** Pas d'étranglement ni d'élargissement sur une ligne à impédance contrôlée, sauf transition calculée.
  - *Pourquoi* : chaque changement de largeur est une discontinuité qui réfléchit une partie du signal.
- **R32 — Topologie adaptée.** Point à point si possible ; en multipoint, chaîne (fly-by) ou étoile équilibrée selon la datasheet ; pas de branche en T non calculée.
  - *Pourquoi* : une branche renvoie une réflexion à chaque jonction ; la topologie détermine où placer la terminaison.
- **R33 — Appariement de longueur.** Égaliser les longueurs des bus synchrones (données avec leur horloge ou strobe) selon le budget de temps de l'interface.
  - *Pourquoi* : l'écart de longueur devient un écart de temps d'arrivée, qui mange la fenêtre d'échantillonnage.
- **R34 — Méandres propres.** Méandres d'appariement avec un écart entre boucles d'au moins 3 à 4 fois la largeur, près de la source de l'écart.
  - *Pourquoi* : des boucles trop serrées se couplent entre elles et raccourcissent le retard réel.
- **R35 — Horloges isolées.** Horloges courtes, en couche interne entre plans si possible, loin des bords et des connecteurs, avec un espacement accru.
  - *Pourquoi* : une horloge est le signal le plus énergétique et le plus périodique de la carte ; c'est la première source d'émissions.
- **R36 — Lignes rapides en couche interne.** Router les signaux très rapides en stripline (entre deux plans) plutôt qu'en surface quand l'empilage le permet.
  - *Pourquoi* : entre deux plans, le champ est confiné : moins de rayonnement et de diaphonie, au prix de vias.

## Paires différentielles

- **R37 — Paire routée ensemble.** Deux conducteurs côte à côte, écart constant, même couche, mêmes vias, du départ à l'arrivée.
  - *Pourquoi* : l'impédance différentielle dépend de l'écart ; la réjection du mode commun repose sur la symétrie des deux brins.
- **R38 — Appariement intra-paire.** Égaliser les longueurs des deux brins à la tolérance de l'interface, en compensant l'écart près de son origine.
  - *Pourquoi* : un écart de longueur transforme une partie du signal différentiel en mode commun, qui rayonne et ferme l'œil.
- **R39 — Écartement des pastilles et des vias symétrique.** Séparer les deux brins le moins longtemps possible et de manière symétrique (autour d'un via, d'une pastille).
  - *Pourquoi* : chaque séparation est une discontinuité d'impédance différentielle.
- **R40 — Impédance différentielle de l'interface.** 90 Ω pour l'USB, 100 Ω pour l'Ethernet et le LVDS, 85 ou 100 Ω pour le PCIe selon la génération ; à confirmer dans la norme de l'interface.
  - *Pourquoi* : l'émetteur, le câble et le récepteur sont adaptés à cette valeur ; un écart crée des réflexions.
- **R41 — Espacement avec les autres signaux.** Écarter les autres pistes d'au moins 3 à 5 fois l'écart intra-paire.
  - *Pourquoi* : un voisin trop proche se couple plus à un brin qu'à l'autre et casse la symétrie.

## Diaphonie

- **R42 — Règle des 3 W.** Entre deux pistes rapides, un entraxe d'au moins 3 fois la largeur de piste (davantage pour les signaux très sensibles).
  - *Pourquoi* : le couplage décroît vite avec l'écart ; à 3 W, la majeure partie du champ reste sur la piste.
- **R43 — Longueurs parallèles courtes.** Limiter la longueur sur laquelle deux pistes rapides cheminent côte à côte, sur la même couche ou sur deux couches voisines.
  - *Pourquoi* : la diaphonie croît avec la longueur couplée ; sur deux couches voisines sans plan entre elles, le couplage est large.
- **R44 — Agresseurs et victimes séparés.** Écarter les signaux forts (horloges, découpage, puissance commutée) des signaux faibles (analogiques, entrées haute impédance, RF en réception).
  - *Pourquoi* : quelques millivolts de couplage ne gênent pas un signal logique mais noient un signal analogique.

## Alimentation (PDN)

- **R45 — Plans ou pistes larges pour les rails.** Distribuer les alimentations par plans ou coulées larges, pas par pistes fines en chaîne.
  - *Pourquoi* : l'impédance de la distribution fait chuter la tension à chaque appel de courant ; un plan a une résistance et une inductance minimales.
- **R46 — Découplage relié court.** Vias du condensateur contre ses pastilles, piste courte et large vers la broche ; partage d'un via entre plusieurs condensateurs évité.
  - *Pourquoi* : 1 mm de piste ajoute environ 1 nH, qui annule l'effet d'un petit condensateur au-delà de quelques dizaines de MHz.
- **R47 — Boucle de découpage minimale.** Pour un régulateur à découpage, la boucle à fort di/dt (condensateur d'entrée, interrupteur, diode ou interrupteur bas) est la plus petite possible, sur une seule face.
  - *Pourquoi* : c'est l'aire de cette boucle qui rayonne ; elle s'étudie avant tout le reste du régulateur.
- **R48 — Nœud de commutation compact.** Le nœud de commutation (SW) est petit en cuivre et loin des signaux sensibles et de la contre-réaction.
  - *Pourquoi* : il porte des fronts de plusieurs volts par nanoseconde : chaque mm² de cuivre est une antenne capacitive.

## Analogique, RF et signaux sensibles

- **R49 — Contre-réaction courte.** Pont diviseur de contre-réaction près de la broche FB, piste éloignée de l'inductance et du nœud SW.
  - *Pourquoi* : le bruit capté sur FB devient une erreur de tension de sortie.
- **R50 — Mesure en Kelvin.** Résistances de mesure de courant et références de tension reliées par des pistes de mesure séparées des pistes de puissance.
  - *Pourquoi* : la chute de tension du courant fort dans la piste fausse la mesure.
- **R51 — Lignes RF en 50 Ω, courtes et directes.** Coplanaire avec masse ou microstrip calculée, rayons de courbure larges, masse cousue de part et d'autre.
  - *Pourquoi* : à ces fréquences, chaque millimètre et chaque discontinuité change le gain et l'adaptation.
- **R52 — Zone d'antenne dégagée.** Respecter le dégagement de cuivre et de composants demandé par le fabricant de l'antenne ou du module.
  - *Pourquoi* : le cuivre proche désaccorde l'antenne et réduit fortement la portée.
- **R53 — Signaux sensibles gardés.** Entourer d'un anneau de garde les entrées à très haute impédance ou à très faible courant.
  - *Pourquoi* : l'anneau, au même potentiel, intercepte les fuites de surface qui fausseraient la mesure.

## Cuivre et équilibrage

- **R54 — Cuivre réparti.** Remplir les zones vides avec du cuivre relié à la masse, de façon équilibrée entre faces et entre couches symétriques.
  - *Pourquoi* : un cuivre déséquilibré déforme la carte et rend le placage irrégulier (pistes isolées sur-gravées).
- **R55 — Pas d'îlot ni de pointe.** Supprimer les îlots non reliés et les languettes étroites des coulées.
  - *Pourquoi* : un îlot rayonne ; une languette fine se décolle ou casse à la gravure.
- **R56 — Rayons de raccordement aux coulées.** Relier les pastilles aux coulées par des rayons, sauf pour le courant ou la dissipation.
  - *Pourquoi* : même raison que C45 : la soudure.
- **R57 — Isolement des coulées.** Isolement coulée–piste au moins égal à l'isolement des pistes, souvent plus.
  - *Pourquoi* : une coulée suit les pistes de près sur de grandes longueurs ; une petite marge en plus évite des courts-circuits de gravure.

## Bord de carte et circuits flexibles

- **R58 — Rien de rapide en bord.** Garder les lignes rapides et les horloges à distance du bord, les bords bordés de vias de masse si nécessaire.
  - *Pourquoi* : le bord est l'endroit où le champ s'échappe le plus facilement.
- **R59 — Connecteurs de bord.** Pour un connecteur encartable, doigts dorés chanfreinés, sans masque ni sérigraphie, pistes perpendiculaires au bord.
  - *Pourquoi* : le chanfrein évite d'arracher le contact à l'insertion ; l'or dur supporte les insertions répétées.
- **R60 — Flex : pistes perpendiculaires au pli.** Dans une zone de pliage, pistes perpendiculaires à l'axe de pli, décalées d'une couche à l'autre, sans via ni angle, avec rayon de pli minimal respecté.
  - *Pourquoi* : le cuivre se fissure à la flexion répétée ; empiler les pistes ou poser un via dans le pli concentre les contraintes.
  - *Réf.* : IPC-2223.

Dans WEB_CAO : [DRC de l'Éditeur PCB](../manuel/manuel.html#03-editeur-pcb-edition-routage--je-veux-contrôler-la-carte-drc) et [Vérification de la carte](../verification-carte.md).
