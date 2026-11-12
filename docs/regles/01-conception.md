# Conception de la carte

Ce qui se décide avant de router, et qui coûte cher à changer après.

## Cadrage du projet

- **C1 — Classe IPC et niveau de producibilité.** Les fixer avant le premier symbole et les écrire dans les notes de fabrication.
  - *Pourquoi* : la classe change l'anneau minimal, les tolérances et les contrôles demandés au fabricant ; une carte dessinée en classe 2 ne passe pas une réception en classe 3.
  - *Réf.* : IPC-2221, IPC-6012.
- **C2 — Fabricant choisi tôt.** Charger son profil (largeur, isolement, perçage minimal, empilages) avant le routage.
  - *Pourquoi* : router avec des règles plus fines que le fabricant donne une carte infabricable ; plus larges, une carte plus grande et plus chère qu'utile.
- **C3 — Contraintes mécaniques d'abord.** Contour, trous de fixation, connecteurs en face avant, zones interdites et hauteurs maximales viennent du boîtier, avant tout placement.
  - *Pourquoi* : ce sont les seules positions imposées ; tout le reste s'organise autour.
- **C4 — Environnement.** Noter la plage de température, l'humidité, les vibrations, l'altitude et la tension maximale.
  - *Pourquoi* : ils fixent le matériau (Tg), l'isolement électrique, le vernis de tropicalisation et la tenue des soudures.
- **C5 — Normes de sécurité.** Pour une carte reliée au secteur, appliquer les distances d'isolement de la norme produit (IEC 62368-1, IEC 60664…), pas seulement IPC-2221.
  - *Pourquoi* : IPC-2221 fixe un isolement fonctionnel, pas une protection des personnes.
- **C6 — Budget de signaux.** Lister les interfaces rapides, les nets d'impédance contrôlée, les rails et leurs courants avant de choisir l'empilage.
  - *Pourquoi* : le nombre de couches et leur ordre découlent de ces besoins, pas l'inverse.

## Empilage et matériaux

- **C7 — Empilage symétrique.** Même épaisseur de diélectrique et même poids de cuivre de part et d'autre du milieu de la carte.
  - *Pourquoi* : une dissymétrie fait vriller la carte au refroidissement ; la planéité exigée pour les CMS est de l'ordre de 0,75 % de la diagonale.
  - *Réf.* : IPC-2221, IPC-6012 (voilage et vrillage).
- **C8 — Chaque couche de signal contre un plan.** Toute couche de signal rapide a un plan de référence (masse de préférence) immédiatement voisin.
  - *Pourquoi* : le courant de retour circule dans le plan juste sous la piste ; sans plan voisin, la boucle grandit, l'impédance devient incontrôlable et la carte rayonne.
- **C9 — Plans d'alimentation et de masse couplés.** Placer un plan d'alimentation contre un plan de masse avec un diélectrique fin.
  - *Pourquoi* : la paire de plans forme un condensateur réparti à très faible inductance qui découple les hautes fréquences mieux que les condensateurs discrets.
- **C10 — Matériau selon l'assemblage.** Pour un assemblage sans plomb, choisir un stratifié IPC-4101 à Tg élevé (≥ 150 °C) et température de décomposition (Td) élevée.
  - *Pourquoi* : les refusions sans plomb montent vers 245–260 °C ; un Tg bas fait gonfler la carte en Z et fissure les fûts des vias.
  - *Réf.* : IPC-4101.
- **C11 — Matériau selon la fréquence.** Au-delà de quelques GHz ou pour les liaisons très longues, choisir un matériau à faibles pertes (Df) et à Dk stable.
  - *Pourquoi* : les pertes diélectriques croissent avec la fréquence et ferment l'œil des liaisons rapides ; la dispersion du Dk décale les impédances.
- **C12 — Empilage validé par le fabricant.** Faire confirmer les épaisseurs, les Dk et les largeurs d'impédance par le fabricant avant de router.
  - *Pourquoi* : le fabricant ajuste les largeurs à ses préimprégnés réels ; une impédance calculée sur un empilage théorique tombe à côté.
  - *Réf.* : IPC-2141.
- **C13 — Poids de cuivre.** Garder du 35 µm (1 oz) sur les couches de signal fines ; monter en épaisseur seulement sur les couches de puissance.
  - *Pourquoi* : un cuivre épais se grave moins finement (largeur et isolement minimaux plus grands) et alourdit le placage.

## Empreintes et bibliothèque

- **C14 — Empreintes IPC-7351.** Dessiner les pastilles à partir des cotes min/max de la datasheet selon IPC-7351, et choisir la densité : M (large), N (nominale), L (dense).
  - *Pourquoi* : les formules IPC-7351 donnent le bon congé de soudure côté pointe, talon et côté ; une pastille au hasard donne des ponts, des tombstones ou des joints secs.
  - *Réf.* : IPC-7351.
- **C15 — Nommage normalisé.** Nommer l'empreinte avec son boîtier, son pas, ses dimensions et sa densité (convention IPC-7351).
  - *Pourquoi* : le nom suffit pour savoir si deux composants partagent la même empreinte, sans ouvrir le dessin.
- **C16 — Origine au centre, broche 1 marquée.** Origine au centroïde du boîtier, rotation 0 selon IPC-7351, repère de broche 1 visible en sérigraphie et en assemblage.
  - *Pourquoi* : les machines de pose lisent le centroïde et la rotation ; une origine ou une rotation fausse place tous les composants de travers.
- **C17 — Zone d'encombrement (courtyard).** Chaque empreinte porte son encombrement physique avec une marge ; deux encombrements ne se chevauchent pas.
  - *Pourquoi* : la marge laisse la place à la buse de pose, à l'inspection et à la reprise.
- **C18 — Pastilles thermiques exposées.** Pour un QFN ou un boîtier à pad exposé, fenêtrer la pâte (pavés multiples, 50 à 80 % de surface) et prévoir des vias thermiques.
  - *Pourquoi* : trop de pâte fait flotter le boîtier et court-circuiter les broches ; les vias évacuent la chaleur vers les plans.
- **C19 — Modèle 3D et hauteur.** Chaque empreinte porte sa hauteur réelle (ou son modèle 3D).
  - *Pourquoi* : le contrôle de hauteur sous le capot et les collisions avec le boîtier en dépendent.

## Placement

- **C20 — Ordre de placement.** Placer d'abord les pièces imposées (connecteurs, fixations, voyants, boutons), puis les composants critiques (processeur, mémoires, alimentations, RF), puis le reste par fonction.
  - *Pourquoi* : les pièces critiques fixent les longueurs des liaisons sensibles ; les placer en dernier les condamne à des chemins longs.
- **C21 — Placement par fonction, suivant le schéma.** Regrouper chaque bloc du schéma (alimentation, analogique, numérique, RF) dans sa zone, en suivant le flux du signal.
  - *Pourquoi* : des liaisons courtes et sans croisement, et des zones bruyantes éloignées des zones sensibles.
- **C22 — Partitionner sans couper le plan de masse.** Séparer analogique, numérique et puissance par la position des composants et le routage, avec un plan de masse continu.
  - *Pourquoi* : un plan coupé force les retours de courant à contourner la fente et crée des antennes ; c'est le placement qui sépare les courants.
- **C23 — Découplage au plus près.** Le condensateur de découplage le plus petit se place contre la broche d'alimentation, ses vias contre ses pastilles.
  - *Pourquoi* : c'est l'inductance de la boucle broche–condensateur–vias–plan qui limite l'efficacité, pas la valeur du condensateur.
- **C24 — Quartz contre son circuit.** Quartz et condensateurs de charge contre les broches de l'oscillateur, sans piste qui passe dessous, avec une masse locale.
  - *Pourquoi* : les pistes de l'oscillateur sont à haute impédance et très sensibles aux couplages ; une longueur de trop décale la fréquence ou empêche le démarrage.
- **C25 — Orientation homogène.** Orienter dans le même sens les composants polarisés et les boîtiers de même famille (0° ou 90°).
  - *Pourquoi* : moins d'erreurs à l'inspection et au contrôle visuel ; en soudure à la vague, l'orientation conditionne l'effet d'ombre.
- **C26 — Espacement d'assemblage.** Respecter l'écart minimal entre composants du fabricant ou de l'assembleur, plus large autour des BGA et des pièces hautes.
  - *Pourquoi* : la buse de pose, l'inspection optique, la sonde de test et le fer de reprise ont besoin de place.
  - *Réf.* : IPC-7351, IPC-7095.
- **C27 — Composants lourds ou hauts sur une face.** Mettre les pièces lourdes, hautes et traversantes sur la face primaire.
  - *Pourquoi* : en double refusion, les pièces lourdes de la face inférieure tombent ; une seule face traversante évite une seconde soudure à la vague.
- **C28 — Pièces sensibles loin des contraintes.** Éloigner les céramiques de grande taille et les BGA des bords, des trous de fixation, des connecteurs et des lignes de découpe.
  - *Pourquoi* : la flexion de la carte fissure les condensateurs céramiques et les billes de BGA.
- **C29 — Dissipation.** Écarter les composants qui chauffent des pièces sensibles à la température (électrolytiques, quartz, références de tension) et les placer là où l'air circule.
  - *Pourquoi* : la durée de vie d'un électrolytique diminue de moitié environ tous les 10 °C.
- **C30 — Points de repère (fiducials).** Au moins trois repères globaux non alignés par face peuplée ; des repères locaux près des boîtiers au pas fin (≤ 0,5 mm).
  - *Pourquoi* : la machine de pose recale l'image de la carte sur ces repères ; deux repères ne corrigent pas la rotation et l'étirement à la fois.

## Fabrication et assemblage (DFM, DFA)

- **C31 — Distance au bord.** Écarter le cuivre du contour (typiquement ≥ 0,3 mm en fraisage, davantage en rainurage en V) et les composants des bords de convoyage.
  - *Pourquoi* : l'outil de détourage arrache le cuivre trop proche et l'expose ; le convoyeur de la machine tient la carte par ses bords.
- **C32 — Panneau.** Prévoir le panneau avec le fabricant : bords de convoyage, ponts ou rainures en V, repères de panneau.
  - *Pourquoi* : une petite carte ne passe pas seule en machine ; les ponts mal placés arrachent les composants voisins à la découpe.
- **C33 — Pastilles de traversants.** Diamètre de pastille ≥ trou fini maximal + 2 × anneau minimal + tolérance de fabrication du niveau choisi.
  - *Pourquoi* : le perçage dérive ; sans réserve, le trou sort de la pastille (rupture de l'anneau) et la liaison avec la piste devient fragile.
  - *Réf.* : IPC-2221 (tolérance de fabrication : environ 0,4 / 0,25 / 0,2 mm pour les niveaux A / B / C), IPC-2222.
- **C34 — Trous de fixation.** Trous de fixation non métallisés ou reliés à la masse châssis, avec une zone sans cuivre ni composant autour de la tête de vis et de la rondelle.
  - *Pourquoi* : la vis écrase et court-circuite ce qu'elle touche ; une liaison voulue à la masse doit être décidée, pas subie.
- **C35 — Masque de soudure.** Ouverture typique de 50 µm de chaque côté de la pastille ; pont de masque (≥ 0,1 mm) entre pastilles au pas fin.
  - *Pourquoi* : le pont empêche la soudure de couler d'une broche à l'autre ; une ouverture trop grande expose les pistes voisines.
- **C36 — Sérigraphie lisible et hors pastilles.** Trait ≥ 0,15 mm, hauteur de texte ≥ 1 mm (0,8 mm au strict minimum), jamais sur une pastille ni sur un repère.
  - *Pourquoi* : l'encre sur une pastille empêche la soudure ; un texte trop fin bave et devient illisible.
- **C37 — Pas de pièges à acide.** Éviter les angles aigus entre pistes ou entre piste et pastille.
  - *Pourquoi* : la solution de gravure stagne dans les angles aigus et ronge le cuivre au-delà du dessin.
- **C38 — Traversants : pastille, trou et broche compatibles.** Trou fini = diamètre de broche maximal + 0,2 à 0,25 mm environ.
  - *Pourquoi* : trop serré, la broche n'entre pas ; trop large, la soudure ne remplit pas le fût (remplissage exigé en classe 3).
  - *Réf.* : IPC-2222, IPC-A-610.

## Testabilité (DFT)

- **C39 — Un point de test par net.** Prévoir un point accessible par net pour le test en circuit, sur une seule face de préférence.
  - *Pourquoi* : un net sans accès n'est pas testable ; deux faces exigent un banc à double face, bien plus cher.
- **C40 — Points de test sondables.** Pastille d'au moins 0,9 mm environ, entraxe ≥ 1,27 mm (2,54 mm idéal), loin des pièces hautes.
  - *Pourquoi* : la pointe de la sonde a une tolérance de position ; une pièce haute dévie la sonde ou se fait écraser.
- **C41 — Accès de programmation et de débogage.** Prévoir le connecteur ou les pastilles de programmation (JTAG, SWD…) et les signaux de débogage utiles.
  - *Pourquoi* : sans accès, une carte bloquée ne se programme ni ne se diagnostique.
- **C42 — Vias non bouchés comme points de test, avec précaution.** Un via peut servir de point de test seulement s'il est découvert du masque et accessible.
  - *Pourquoi* : un via bouché ou couvert de masque ne se sonde pas.

## Thermique

- **C43 — Bilan thermique.** Estimer la puissance dissipée par composant et vérifier la température de jonction.
  - *Pourquoi* : la défaillance la plus courante d'une carte est un composant qui chauffe trop longtemps.
- **C44 — Vias thermiques sous les pads exposés.** Réseau de vias sous chaque pad thermique, bouchés ou de petit diamètre.
  - *Pourquoi* : le cuivre des vias conduit la chaleur vers les plans internes et la face opposée ; bouchés, ils n'aspirent pas la soudure.
  - *Réf.* : IPC-4761.
- **C45 — Pastilles à rayons (thermal relief) sur les plans.** Relier une pastille à un plan par des rayons, sauf besoin de courant ou de dissipation.
  - *Pourquoi* : sans rayons, le plan pompe la chaleur du fer et de la refusion : joints froids, tombstones.

## Documentation et sorties

- **C46 — Plan de fabrication.** Contour coté, empilage, matériau, classe, finition, couleur de masque, tableau de perçage, impédances, tolérances et notes.
  - *Pourquoi* : le fabricant ne devine pas ; une information absente est remplacée par son choix par défaut.
- **C47 — Données de fabrication complètes et cohérentes.** Livrer un jeu unique : IPC-2581 de préférence (ou Gerber et perçage), netlist IPC-D-356 de test, fichier de placement, nomenclature.
  - *Pourquoi* : IPC-2581 porte tout en un seul fichier intelligent ; la netlist permet au fabricant de comparer le cuivre au schéma lors du test électrique.
  - *Réf.* : IPC-2581.
- **C48 — Plan d'assemblage.** Repères, orientation, broche 1, faces, variantes non montées, couple de serrage et notes de câblage.
  - *Pourquoi* : l'assembleur et le réparateur travaillent sur ce plan, pas sur le schéma.
- **C49 — Révision et traçabilité.** Numéro de carte et indice de révision en cuivre ; zone de marquage pour le numéro de série.
  - *Pourquoi* : sans indice gravé, une carte en réparation ne se rattache à aucun dossier.
- **C50 — Exceptions écrites.** Toute règle non respectée est listée dans les notes avec sa justification.
  - *Pourquoi* : une exception connue se contrôle ; une exception cachée devient un défaut.
