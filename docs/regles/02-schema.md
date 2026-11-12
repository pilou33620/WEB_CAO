# Schéma

Le schéma est le document de référence de la carte : la netlist, la nomenclature et le contrôle du routage en sortent. Il doit se lire sans son auteur.

## Organisation des feuilles

- **S1 — Une fonction par feuille.** Découper le schéma par bloc fonctionnel (alimentation, processeur, interfaces, analogique…), avec une feuille de garde ou un synoptique.
  - *Pourquoi* : un lecteur trouve un bloc sans parcourir tout le dossier ; chaque feuille se relit et se réutilise seule.
- **S2 — Flux de gauche à droite.** Entrées à gauche, sorties à droite ; alimentations en haut, masse en bas.
  - *Pourquoi* : c'est le sens de lecture attendu ; le signal se suit sans chercher.
- **S3 — Cartouche renseigné.** Titre, numéro de carte, indice de révision, date, auteur, numéro de feuille sur chaque page.
  - *Pourquoi* : une feuille imprimée seule doit se rattacher à son dossier et à sa version.
- **S4 — Notes sur le schéma.** Écrire sur la feuille les choix non évidents : valeur calculée, composant à ne pas remplacer, contrainte de routage, option de montage.
  - *Pourquoi* : la raison d'un choix se perd plus vite que le choix ; la note évite qu'un successeur la défasse.
- **S5 — Lisibilité.** Pas de texte qui chevauche un fil, une grille constante, des symboles alignés, pas de fil en diagonale.
  - *Pourquoi* : une ambiguïté visuelle devient une erreur de lecture, puis une erreur de câblage à la reprise.

## Symboles et repères

- **S6 — Repères normalisés.** R résistance, C condensateur, L inductance, D diode, Q transistor, U circuit intégré, J connecteur fixe, P fiche, Y quartz, F fusible, K relais, S ou SW interrupteur, T transformateur, TP point de test, FB ferrite.
  - *Pourquoi* : tout lecteur, assembleur ou réparateur reconnaît la nature d'une pièce à son repère.
  - *Réf.* : ASME Y14.44, IEEE 315.
- **S7 — Repères uniques et numérotés dans l'ordre.** Numéroter par feuille ou par position, sans trou inutile, sans doublon.
  - *Pourquoi* : un repère en double casse la nomenclature et le fichier de placement.
- **S8 — Symboles fonctionnels.** Regrouper les broches par fonction (alimentations, bus, commandes) plutôt que dans l'ordre physique du boîtier.
  - *Pourquoi* : le schéma montre ce que fait la puce ; l'ordre physique est l'affaire de l'empreinte.
- **S9 — Broches d'alimentation visibles.** Aucune broche d'alimentation cachée ; chaque broche de puissance apparaît et se relie explicitement.
  - *Pourquoi* : une broche cachée se raccorde à un net par défaut qui n'est peut-être pas le bon, sans que personne le voie.
- **S10 — Polarité et brochage vérifiés.** Contrôler le brochage du symbole et de l'empreinte contre la datasheet, en particulier transistors, diodes et régulateurs (SOT-23, SOT-223).
  - *Pourquoi* : un même boîtier existe avec plusieurs brochages ; l'erreur ne se voit qu'à la mise sous tension.

## Nets et connexions

- **S11 — Jonctions en T avec point.** Une jonction est un T marqué d'un point ; jamais de croisement à quatre branches.
  - *Pourquoi* : à l'impression ou à la photocopie, un croisement à quatre branches ne dit pas s'il est connecté.
- **S12 — Nets nommés.** Nommer tout net qui sort d'une feuille, tout bus et tout signal utile au débogage.
  - *Pourquoi* : le nom suit le net au PCB, dans les règles de routage et au débogage ; un nom automatique ne dit rien.
- **S13 — Une convention de noms.** Suffixe ou préfixe unique pour les signaux actifs à l'état bas (`_N`, `n`), pour les paires (`_P` / `_N`), pour les rails (`+3V3`, `+5V`).
  - *Pourquoi* : la polarité d'un signal et l'appartenance à une paire se lisent dans le nom ; l'Éditeur PCB reconnaît les paires par leur suffixe.
- **S14 — Liens entre feuilles explicites.** Ports hiérarchiques ou étiquettes globales avec renvoi de feuille.
  - *Pourquoi* : un lecteur doit savoir où va un signal sans chercher le même nom partout.
- **S15 — Broches non utilisées traitées.** Chaque entrée non utilisée est tirée à un niveau défini selon la datasheet ; chaque broche laissée en l'air porte un marqueur « non connecté ».
  - *Pourquoi* : une entrée CMOS flottante oscille, consomme et rend la carte instable ; le marqueur prouve que l'oubli n'en est pas un.
- **S16 — Pas de net à une seule broche.** Sauf marqueur volontaire, tout net relie au moins deux broches.
  - *Pourquoi* : un net à une broche est presque toujours un fil oublié ou une étiquette mal tapée.
- **S17 — Masses distinguées.** Symboles et noms différents pour masse numérique, analogique, puissance et châssis, avec le point de liaison dessiné.
  - *Pourquoi* : le point de liaison entre masses se décide au schéma ; sinon il se fait n'importe où au routage.

## Alimentation et découplage

- **S18 — Arbre d'alimentation.** Dessiner un synoptique des rails : source, régulateurs, courants et séquencement.
  - *Pourquoi* : il fixe la largeur des pistes, les plans et l'ordre de démarrage ; un rail oublié se découvre au premier essai.
- **S19 — Découplage par broche.** Un condensateur de découplage par broche d'alimentation (souvent 100 nF), plus un réservoir par rail et par circuit, selon la datasheet.
  - *Pourquoi* : chaque broche appelle des pointes de courant que seul un condensateur proche fournit assez vite.
- **S20 — Condensateurs près de leur broche, au schéma aussi.** Dessiner chaque condensateur de découplage à côté de la broche qu'il sert.
  - *Pourquoi* : le placement au PCB suit le schéma ; un groupe de condensateurs anonymes finit regroupé loin des broches.
- **S21 — Marge de tension et de puissance.** Tension nominale des condensateurs céramiques ≥ 1,5 à 2 × la tension de service ; électrolytiques et résistances déclassés selon leur datasheet.
  - *Pourquoi* : un céramique X5R / X7R perd une grande part de sa capacité sous tension continue ; un composant à sa limite vieillit vite.
- **S22 — Protection d'entrée.** Fusible ou limitation, protection contre l'inversion de polarité et les surtensions sur toute alimentation externe.
  - *Pourquoi* : une alimentation externe se branche à l'envers ou surtensionne un jour ; la protection coûte moins que la carte.

## Protection, CEM et interfaces

- **S23 — Protection ESD aux connecteurs.** Diode de protection sur chaque signal qui sort de la carte, placée au schéma contre le connecteur.
  - *Pourquoi* : la décharge entre par le connecteur ; la protection doit la dévier avant qu'elle n'atteigne la puce.
- **S24 — Filtrage aux frontières.** Ferrites, condensateurs ou filtres en mode commun sur les entrées et sorties qui quittent la carte.
  - *Pourquoi* : les câbles sont les antennes de la carte ; filtrer à la frontière limite les émissions et l'immunité aux perturbations.
- **S25 — Terminaisons des lignes rapides.** Prévoir les résistances de terminaison (série, parallèle, AC) selon la topologie et la datasheet.
  - *Pourquoi* : une ligne non adaptée réfléchit et crée dépassements et sonneries ; un emplacement prévu se monte ou non sans refaire la carte.
- **S26 — Options de montage prévues.** Emplacements « non monté » pour les ajustements incertains (terminaison, filtre, gain), marqués comme tels.
  - *Pourquoi* : une pastille vide ne coûte rien ; une modification sans pastille coûte une révision de carte.

## Données de composants et nomenclature

- **S27 — Référence fabricant sur chaque composant.** Fabricant, référence complète, valeur, tolérance, tension ou puissance, boîtier.
  - *Pourquoi* : « 10 µF » ne s'achète pas ; la nomenclature sort du schéma et doit suffire à commander.
- **S28 — Composants disponibles.** Vérifier le cycle de vie et le stock (pas de pièce obsolète ou en fin de vie) ; prévoir une seconde source pour les pièces critiques.
  - *Pourquoi* : une pièce introuvable bloque toute la production.
- **S29 — Empreinte liée et vérifiée.** Chaque symbole pointe vers une empreinte contrôlée de la bibliothèque.
  - *Pourquoi* : le lien symbole–empreinte est la seule passerelle vers le PCB ; une empreinte fausse passe tous les contrôles du schéma.
- **S30 — Variantes déclarées.** Les composants qui changent selon la variante sont marqués au schéma, pas gérés à la main dans la nomenclature.
  - *Pourquoi* : une variante gérée à la main se désynchronise du schéma à la première modification.

## Contraintes transmises au PCB

- **S31 — Classes de nets.** Classer les nets au schéma : alimentation (courant), haute tension (isolement), rapide, impédance contrôlée, paires différentielles, sensibles.
  - *Pourquoi* : les règles de routage se règlent par classe ; une classe posée au schéma suit le net jusqu'au DRC.
- **S32 — Impédances et longueurs demandées.** Écrire l'impédance visée et les appariements de longueur exigés par les interfaces.
  - *Pourquoi* : le routeur ne peut pas les deviner ; elles viennent des datasheets et des normes d'interface (USB, Ethernet, DDR…).
- **S33 — Courants et tensions des nets de puissance.** Noter le courant continu et crête, et la tension maximale des nets de puissance.
  - *Pourquoi* : ils fixent la largeur des pistes (IPC-2152), le nombre de vias et l'isolement (IPC-2221).

## Vérification

- **S34 — ERC sans erreur non justifiée.** Lancer le contrôle électrique ; chaque avertissement restant est compris et justifié.
  - *Pourquoi* : l'ERC trouve sorties en conflit, entrées flottantes, nets à une broche et alimentations non pilotées en quelques secondes.
- **S35 — Relecture croisée.** Faire relire le schéma par une autre personne avec la datasheet des composants clés.
  - *Pourquoi* : l'auteur voit ce qu'il a voulu dessiner ; un relecteur voit ce qui est dessiné.
- **S36 — Synchronisation schéma–PCB.** Toute modification passe par le schéma puis par la mise à jour du PCB, jamais l'inverse sans retour au schéma.
  - *Pourquoi* : un PCB modifié seul ne correspond plus à la netlist de test ni à la documentation.

Dans WEB_CAO : [ERC de l'Éditeur schématique](../manuel/manuel.html#02-editeur-schematique--je-veux-vérifier-le-schéma-erc).
