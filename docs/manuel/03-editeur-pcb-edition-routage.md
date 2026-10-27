# Éditeur PCB : édition, placement et routage

Ce chapitre décrit l'Éditeur PCB de WEB_CAO côté dessin : interface, empilage et couches, empreintes, placement, routage Push & Shove, paires différentielles, vias, zones, règles et contrôle DRC.
Il suppose une carte déjà créée à partir du schéma ([02-editeur-schematique.md](02-editeur-schematique.md)). Les exports, plans de fabrication, contraintes de nets, dossier mécanique, 3D et thermique sont dans [04-editeur-pcb-fabrication.md](04-editeur-pcb-fabrication.md).
Les noms de boutons, de menus et de champs sont ceux de l'écran ; ce qui n'a pu être établi dans le code est marqué `À vérifier`.

## Guide par tâche

### Je veux me repérer dans l'écran

1. La barre du haut porte, à gauche, quatre boutons de navigation : ⬅ (éditeur schématique), ⌕ (composants), 📚 (Gestion LIB), ⌂ (accueil). Le travail en cours reste dans l'onglet quand on change d'outil et revient tel quel (carte, vue, état « modifié »).
2. Viennent ensuite le bouton du profil utilisateur (👤), le bouton 📱 Tactile, puis les menus **Fichier**, **Édition**, **Placer**, **Affichage**, **Outils**. La pastille « OUTIL » à droite des menus rappelle l'outil actif ; un clic dessus ouvre le menu Placer.
3. Sous la barre, la rangée d'onglets liste les couches de cuivre (nom, repère `F.Cu`/`In1.Cu`…/`B.Cu`, rang) et le total « n couches · n segments · n vias · n zones ». Un clic sur un onglet rend la couche active.
4. Le canevas occupe le centre. Les panneaux (Empilage, Propriétés, Nets & composants, Empilage physique…) sont rangés à gauche, à droite et en bas ; le menu **Affichage > Espace de travail** les affiche, les masque et remet la disposition d'usine.
5. Le pied de page donne la couche, le mode (outil actif), les coordonnées du pointeur en mm, le zoom, la grille, les compteurs (empreintes, pistes, vias, non routés), le net sous le pointeur et une ligne d'aide qui change avec l'outil.

### Je veux ouvrir ou démarrer une carte

1. **Fichier > Nouveau** repart d'une carte vide (une confirmation est demandée si des empreintes existent). Les règles et les classes de net restent ; les paires, variantes et contraintes de nets propres à la carte partent. `Ctrl+Z` rend la carte d'avant.
2. **Fichier > Ouvrir** lit un `.json` de carte. On peut aussi glisser-déposer un fichier sur la page : un `.json` de carte s'ouvre, un `.json` de schéma ouvre la fenêtre ECO (voir plus bas), un texte est lu comme netlist.
3. Avec un projet ouvert depuis l'accueil, la carte du dossier se charge d'elle-même au démarrage, sauf si un travail non enregistré est déjà dans l'onglet. Un brouillon plus récent que la carte est proposé à la réouverture.
4. **Fichier > Exemples…** ouvre deux cartes finies (« Commande 12 V — 2 couches » et « Interface IoT & Bus Haute Vitesse — 4 couches ») avec le bouton **Ouvrir cet exemple**. Elles remplacent la carte en cours, après confirmation si elle porte des empreintes.
5. **Fichier > Enregistrer .json** (`Ctrl+S`) écrit dans le dossier du projet quand il y en a un ; sinon le fichier est téléchargé.

### Je veux importer le schéma sur la carte

1. Dans l'éditeur schématique, la netlist est prête (voir [02-editeur-schematique.md](02-editeur-schematique.md)).
2. **Fichier > Importer netlist** ouvre la boîte « Importer une netlist ». Trois façons de la remplir : **Synchroniser directement depuis le schéma ouvert**, coller le texte dans la zone, ou **Choisir un fichier…**. La case « supprimer les empreintes absentes de la netlist » retire de la carte les composants qui n'existent plus au schéma.
3. Cliquer **Importer**. Les empreintes déjà posées gardent leur position ; les nouvelles sont créées à droite de la carte à partir du boîtier nommé au schéma. Le pied de page donne le bilan (créées, mises à jour, nets, renommées, refaites sur un nouveau boîtier).
4. Si des pastilles déjà routées changent de net, la boîte « Changement de brochage sur pistes routées » propose **Conserver les pistes (ignorer)** ou **Supprimer les pistes en conflit**.
5. Pour la suite des modifications du schéma, préférer **Fichier > Schéma ↔ PCB** (voir « Je veux mettre la carte à jour après un changement du schéma »).

### Je veux mettre la carte à jour après un changement du schéma

1. Un badge orange sur **Fichier > Schéma ↔ PCB** (et sur le titre du menu Fichier) indique le nombre de disparités détectées.
2. Ouvrir **Schéma ↔ PCB**. La fenêtre « Mise à jour interactive (ECO) · Schéma ↔ PCB » liste les actions avec une case chacune.
3. Filtrer par catégorie (Nouveaux, Renommés, Boîtiers, Nets, Valeurs, Absents, Contraintes) ou utiliser **Tout cocher** / **Tout décocher**. Les composants « Absents » (sur la carte, pas au schéma) sont décochés d'office.
4. Cocher « Détacher les pistes en conflit direct de net » si des pastilles changent de net sous des pistes existantes.
5. Cliquer **Appliquer l'ECO (n)**. Le routage, les vias et les plans existants sont conservés ; une seule étape d'annulation couvre l'ensemble. **Autre schéma / netlist…** change la source.

### Je veux définir les couches et l'empilage

1. Panneau **Empilage** : choisir le nombre de couches dans « Couches cuivre » (1 à 32, impair compris). Les boutons **Tout**, **Rien**, **Cuivre seul** règlent l'affichage.
2. Sous la liste, « Couche active » donne le nom, la couleur, le rôle (Signal, Mixte, GND, PWR, Blindage) et, pour un plan, le net du plan. Un rôle GND, PWR ou Blindage entretient une zone de cuivre pleine carte sur la couche.
3. Panneau **Empilage physique** : choisir un « Modèle d'usine » pour partir d'un empilage réaliste, puis cliquer chaque ligne de la coupe (cuivre, diélectrique, vernis, sérigraphie) pour l'éditer en dessous.
4. Lire la synthèse « Synthèse — bon pour commande ? » : épaisseur visée contre obtenue, symétrie, rapport d'aspect le plus défavorable, nombre de vias traversants, borgnes, enterrés. **Répartir sur la cible** et **Symétriser** corrigent d'un clic.
5. Choisir la finition du cuivre et le traitement des vias (liste « Traitement des vias »).
6. Les pressages (laminage séquentiel), la rugosité, les modèles de simulation et le contre-perçage se règlent plus bas dans le même panneau ; leur effet sur la fabrication est expliqué dans [04-editeur-pcb-fabrication.md](04-editeur-pcb-fabrication.md).

### Je veux placer les composants

1. À la main : sélectionner une empreinte, la glisser ; `R` la tourne, `F` la retourne sur l'autre face. Les pistes accrochées la suivent (voir « Je veux déplacer des composants déjà routés »).
2. Ajouter une empreinte : **Placer > Empreinte…** (`A`) ouvre le catalogue de la LIB ; l'empreinte choisie est posée sous le pointeur avec un repère libre (`U1`, `R2`…).
3. En masse : sans rien sélectionner, le panneau **Propriétés** propose **Placement auto** (ensemble puis satellites, un seul `Ctrl+Z` pour tout défaire) et **Ranger à côté**.
4. Par blocs fonctionnels : **Outils > Score Placement** ouvre le panneau « Qualité de placement ». Dans « Groupes de placement & Zones », chaque bloc du schéma offre **Grouper** (sélectionner), **Disposer** (compacter autour de son ancre) et **Déposer** (poser en grappe dans une zone libre).
5. Contrôler : HPWL (longueur de chevelu), congestion, découplage HF, orientation optimale de chaque composant (voir la référence du panneau).

### Je veux déplacer des composants déjà routés

1. Glisser une empreinte : les pistes accrochées suivent en gardant leurs 45°. En règle « pousser le cuivre », le cuivre voisin est poussé comme au routage.
2. Maintenir `Alt` pendant le glissement laisse le cuivre en place. `Maj+Espace` change la conduite des pistes (glisser, étirer, arracher) en plein geste.
3. `R` ou `Espace` en plein glissement tourne le boîtier d'un quart de tour sans lâcher.
4. Pour garder un bloc ensemble : sélectionner les composants, `Ctrl+G` crée un groupe ; un clic sur un membre prend tout le groupe. `Ctrl+Maj+G` ou le bouton **Dissoudre** (Propriétés) défait le groupe.

### Je veux router une piste

1. Choisir **Placer > Piste** (`T`) ou l'onglet de la couche voulue.
2. Cliquer une pastille pour partir. Chaque clic suivant pose un coude ; le tracé suit l'angle imposé (45° par défaut) et se tient à l'isolation exigée tant que **Anti-collision** est actif.
3. `/` ou `Espace` bascule l'arrangement du coude (diagonale d'abord ou portion droite d'abord). `V` pose un via et bascule entre la couche du dessus et celle du dessous (depuis une couche interne, vers le dessus) ; `1` à `9`, `0`, `Page ↑`/`Page ↓` changent de couche en posant un via, tout comme un clic sur un onglet de couche en plein tracé.
4. Terminer avec `Entrée`, `Échap`, le double-clic ou le clic droit. `Retour arrière` recule d'un coude.
5. Face à un obstacle, le comportement dépend de la « Conduite » choisie dans **Outils > Règles… > Face à un obstacle** : pousser le cuivre, contourner ou signaler. Une pastille n'est jamais poussée.
6. `Tab` ouvre la saisie de coordonnées au clavier (Absolu, Relatif, Polaire) : taper X/Y, `Entrée` pose le point.
7. `D` (ou « Angle droit → 45° » dans Propriétés) adoucit un angle droit de la piste sélectionnée.

### Je veux router une paire différentielle

1. Déclarer la paire : **Outils > Règles… > Règle et paires**. Choisir « Net P » et « Net N » puis **Créer la paire**, ou cliquer **Détecter** pour reconnaître les noms usuels (`USB_DP`/`USB_DM`, `CAN-P`/`CAN-N`…).
2. Vérifier la règle (largeur et écart mini / préféré / maxi, longueur découplée maxi, profil d'impédance). Sans règle écrite, la règle d'usine s'applique (0,20 mm de piste, 0,15 mm d'écart).
3. Choisir **Placer > Paire diff.** (`P`) et cliquer sur une pastille de la paire : l'autre net est trouvé tout seul.
4. Tracer comme une piste. `V` pose les deux vias en éventail, `/` bascule la posture, `1` à `9`, `0`, `Page ↑`/`Page ↓` changent de couche (deux vias au passage), `Retour arrière` recule d'un coude.
5. Arriver sur les deux pastilles d'en face pour terminer ; `Échap` ou `Entrée` dépose ce qui est tracé. Si les pastilles d'arrivée sont dans l'ordre inverse, l'aperçu passe au rouge et le dépôt est refusé.
6. Le DRC signale les largeurs hors bornes, la longueur découplée excessive, les deux vias de la paire trop proches (jugés à l'isolation ordinaire, pas à l'écart de la paire), puis en remarque l'écart de longueur entre les deux pistes (au-delà de 0,5 mm) et un net de la paire absent de la carte. L'écart de longueur se corrige avec le serpentin (voir la tâche suivante).

### Je veux égaliser des longueurs

1. Choisir **Placer > Serpentin** (`M`). Le triangle ▾ du bouton ouvre « Réglages du Serpentin » : amplitude max, pas, allongement forcé ΔL.
2. Cliquer une portion droite de piste et étirer : un accordéon est généré. La cible vient de l'écart de la paire si elle en a un, sinon de la longueur qui manque au net pour rejoindre son groupe d'appariement (Gestionnaire de contraintes), sinon de ΔL (0 = étirement libre à la souris).
3. Pour un bus synchrone, **Simuler appariement de bus (Skew)…** (ou le bouton du même nom dans les propriétés de plusieurs pistes) calcule les marges de Setup et de Hold et arme le serpentin sur le net à corriger (bouton **Régler serpentin**).

### Je veux poser un via, y compris borgne ou enterré

1. **Placer > Via** (`V`) : un clic pose un via traversant accroché à la pastille ou à la piste la plus proche. Diamètre et perçage viennent de la classe du net.
2. Sélectionner le via ; dans Propriétés, la liste « Type de via » propose Traversant, Borgne dessus, Borgne dessous, Enterré (borgne à partir de 3 couches, enterré à partir de 4). « De la couche » et « À la couche » affinent la portée.
3. Le texte sous les champs dit comment la portée sera fabriquée (par exemple borgne au laser dans le prépreg extérieur) et prévient quand un seul pressage ne suffit pas.
4. Voir les erreurs de portée avec **Contrôle DRC**. La séquence de pressages se décrit dans l'Empilage physique (voir [04-editeur-pcb-fabrication.md](04-editeur-pcb-fabrication.md)).

### Je veux poser un plan ou une zone de cuivre

1. Plan pleine carte : dans « Couche active », régler le rôle sur GND ou PWR et choisir le « Net du plan ». La zone suit le contour de la carte.
2. Zone libre : **Placer > Zone cuivre** (`Z`) puis cliquer chaque sommet ; retour sur le premier point ou `Entrée` ferme, `Maj` contraint à 45°, `Échap` abandonne. Une fenêtre demande le « Net de la zone de cuivre ».
3. Le triangle ▾ du bouton ouvre le menu de la couche : rôle, net du plan, **Zone à main levée**, **Zone pleine carte (libre)**, **Sélectionner le cuivre de la couche**.
4. Propriétés d'une zone : couche, net rattaché, « Liaison des pastilles du net » (bras thermiques, directe pour les CMS, directe pour toutes, aucune).
5. Pour percer un trou dans une zone sans la supprimer : **Placer > Découpe zone** (`X`), même geste de tracé.

### Je veux contrôler la carte (DRC)

1. **Outils > Contrôle DRC** lance le contrôle. La liste « DRC » du panneau Nets & composants s'ouvre ; les erreurs sont aussi peintes sur la carte.
2. Cliquer une ligne centre la vue sur l'écart, sélectionne le via ou passe sur la couche fautive.
3. Pour savoir à quelle règle se rattache un écart, ouvrir **Outils > Règles…** : chaque page affiche le nombre de défauts relevés au dernier contrôle, et **Contrôler maintenant** relance sans quitter la fenêtre.

> [!NOTE]
> Le contrôle DRC n'est pas continu : il se lance par le bouton (ou par « Contrôler maintenant »), et la liste reste celle du dernier contrôle tant qu'on ne le relance pas. Il repart aussi de lui-même après certaines opérations : application d'un ECO, rechargement d'une empreinte depuis la LIB, suppression des pistes en conflit après un import, action « DRC » du Gestionnaire de contraintes. Ce qui agit en continu, c'est le routeur, qui juge au même seuil que le contrôle tant que **Anti-collision** est actif.

### Je veux régler les règles et les aligner sur un fabricant

1. **Outils > Règles…** : la fenêtre « Règles & Fabrication » a deux onglets, « Règles de conception » (arbre des règles) et « Capabilités Fabricant ».
2. Dans « Classe de net », régler piste, isolation, via et perçage de chaque classe ; **Recaler le routage posé** aligne les pistes et vias déjà posés sur leur classe ; **Classes du schéma** déduit les classes depuis les motifs du schéma.
3. Dans « Capabilités Fabricant », choisir le « Profil de fabrication actif » (JLCPCB, Générique, Eurocircuits, PCBWay ou profil importé), lire les limites d'usine, puis **Aligner règles du projet aux minima …**.
4. **Outils > Capabilités & Règles…** ouvre la même fenêtre directement sur ce profil.

### Je veux changer ou recharger l'empreinte d'un composant

1. Sélectionner le composant. Dans Propriétés, saisir un nom dans « Boîtier » : un boîtier connu (`0603`, `SOIC-8`, `TQFP-64`…) repose les pastilles ; un nom inconnu ne change rien.
2. Pour une empreinte de la LIB : choisir dans « Empreinte Catalogue LIB » puis **Appliquer**, ou **🔍** pour parcourir visuellement.
3. Pour la dessiner ou la corriger : **📐 Ouvrir dans Gestion LIB ↗** ouvre l'éditeur d'empreintes (voir [05-gestion-lib.md](05-gestion-lib.md)). Au retour, **🔄 Recharger depuis la LIB** apparaît quand la LIB est plus récente que la carte.
4. Si les cotes ont été retouchées à la main puis regrettées, **Reposer l'empreinte sur le boîtier** les remet.

### Je veux vérifier le brochage schéma contre carte

1. Le bouton **⚡ Pinout : Vérifier** (menu Outils) change d'état tout seul : « Schéma en attente », « Conforme ✓ » ou « n anomalie(s) ».
2. Un clic ouvre « Inspection & Conformité du Pinout » : par composant, pas des pastilles, taille du boîtier, nombre de pastilles, puis table des broches.
3. Pour une anomalie : **Reposer l'empreinte sur les cotes du boîtier**, **Acquitter (faux positif)** ou **Copier le rapport**.

### Je veux poser un trou de fixation (NPTH)

1. **Placer > Trou NPTH**, cliquer : un trou non métallisé est posé et sélectionné (3,2 mm la première fois, puis le dernier diamètre réglé).
2. Dans Propriétés, régler le diamètre (boutons M2, M2.5, M3, M4), une fente éventuelle (Longueur, Angle), la position, et cocher « Verrouiller la position » si besoin.

### Je veux dessiner le contour, une découpe ou une zone interdite

1. **Placer > Contour carte** (`E`) : un clic par sommet, retour sur le premier point pour fermer, `Maj` contraint à 45°.
2. **Placer > Découpe carte** (`Maj+E`) : fenêtre intérieure fraisée ; un clic par sommet, ou deux coins puis `Entrée` pour un rectangle. Une découpe qui sort du contour est refusée.
3. **Placer > Zone interdite** : zone posée sur une face ; le DRC signale toute patte traversante qui en ressort et tout composant qui la touche.
4. Sélectionner le contour (clic sur son trait) pour régler largeur et hauteur, ou utiliser les boutons **Redessiner**, **Revenir au rectangle**, **Disque**.

### Je veux ajouter de la sérigraphie

1. **Placer > Sérigraphie** ouvre un menu : Trait (segment), Rectangle (cadre), Aplat plein (logo, bandeau), Texte libre.
2. Trait et rectangle : cliquer-glisser ou deux clics. Texte : un clic, puis saisie dans une boîte. Aplat : un clic par sommet, ou deux coins puis `Entrée`.
3. La face est B.SilkS quand la vue est retournée ou que la couche active est la dernière, F.SilkS sinon ; elle se change dans Propriétés. Texte posé : 1,5 mm de haut, trait de 0,15 mm au départ (modifiables dans Propriétés).

### Je veux chercher, mesurer, montrer au schéma

1. `Ctrl+F` ouvre la recherche d'un repère (`C47`) ou d'un net (`USB_DP`). Flèches pour choisir, `Entrée` pour y aller, `Échap` pour fermer.
2. `K` (**Mesure**) : un clic pose le départ, le suivant fige la cote (distance, ΔX, ΔY). Un troisième clic repart ailleurs ; `Échap` efface.
3. `L` (**Montrer au schéma**) fait sauter l'onglet du schéma sur l'empreinte ou le net sélectionné.

### Je veux faire router par Claude

1. Quand Claude pilote la page (voir [11-claude-mcp.md](11-claude-mcp.md)), il propose des routes, des paires ou des placements sous forme de cartes. L'aperçu s'affiche en pointillés sur la carte ; le cuivre existant que la poussée déplacerait est montré en rouge.
2. Cliquer la carte l'applique en une seule étape d'annulation (`Ctrl+Z` la défait).
3. Le chercheur de chemin automatique (A* sur grille par couche) n'est utilisable que par ce canal : il n'y a pas de bouton d'autorouteur.

## Référence

### Barre d'en-tête et navigation

| Bouton ou menu | Raccourci | Effet | Limites |
|---|---|---|---|
| ⬅ | | Va à l'éditeur schématique (« le routage en cours reste dans l'onglet »). Si une seule empreinte est sélectionnée, ou à défaut un net mis en évidence, le schéma s'ouvre dessus avec un repère temporaire | Absent de la version fichier unique (`dist/`) |
| ⌕ | | Va à Composants (« la carte reste dans l'onglet ») | Idem |
| 📚 | | Va à Gestion LIB (catalogue, empreintes, symboles) | Idem |
| ⌂ | | Va à l'accueil | Idem |
| 👤 … | | Profil utilisateur : panneaux, réglages et derniers documents lui appartiennent | Voir [01-accueil-projets-tactile.md](01-accueil-projets-tactile.md) |
| 📱 Tactile | | Mode tactile (iPad / tablette) | Voir [01-accueil-projets-tactile.md](01-accueil-projets-tactile.md) |
| OUTIL (pastille) | | Rappelle l'outil actif ; un clic ouvre le menu Placer | |

### Menu Fichier

| Bouton ou menu | Raccourci | Effet | Limites |
|---|---|---|---|
| Nouveau | | Carte vide (voir la tâche ci-dessus) | Confirmation si des empreintes existent |
| Ouvrir | | Ouvre un `.json` de carte | Un `.json` de schéma ouvre la fenêtre ECO au lieu de la carte |
| Enregistrer .json | `Ctrl+S` | Écrit la carte dans le dossier du projet, sinon la télécharge | En cas d'échec d'écriture dans le projet, le fichier est téléchargé |
| Sauvegarder le projet → GitHub | `Ctrl+Maj+S` | Enregistre puis envoie tout le projet en un commit | Visible seulement quand l'application est lancée par WEB_SUITE ; sinon `Ctrl+Maj+S` enregistre simplement |
| Exemples… | | Ouvre le catalogue de deux cartes d'exemple | Remplace la carte en cours après confirmation |
| Importer netlist | | Boîte d'import (voir la tâche ci-dessus) | |
| Schéma ↔ PCB | | Fenêtre ECO ; badge orange = nombre de disparités | |
| Exporter .png | | Image de la carte (couches visibles, orientation courante, cartouche compris) | La cote de mesure et le phare n'y figurent pas |
| Fabrication .zip | | Archive de fabrication | Détail dans [04-editeur-pcb-fabrication.md](04-editeur-pcb-fabrication.md) |
| PCBA JLCPCB .zip | | Gerber, BOM et CPL au format JLCPCB | Idem |
| Animation 3D dans le .zip | | Ajoute l'animation 3D à l'archive de fabrication (bascule, éteinte à chaque ouverture) | Idem |
| IPC-2581 .xml | | Export IPC-2581 révision C | Idem |
| Plans (Draftsman)… | | Plans de fabrication et d'assemblage en PDF | Idem |
| Variante de montage… | | Choisit la variante de montage (voir plus bas) | Les variantes se créent dans le schéma |

### Menu Édition

| Bouton ou menu | Raccourci | Effet | Limites |
|---|---|---|---|
| Annuler | `Ctrl+Z` | Annule la dernière étape | 80 instantanés au plus, dans un budget mémoire ; au moins le plus récent reste |
| Rétablir | `Ctrl+Y` ou `Ctrl+Maj+Z` | Rétablit | |
| Copier | `Ctrl+C` | Copie empreintes, pistes, vias, zones et découpes sélectionnés | Sur du texte sélectionné dans la page, `Ctrl+C` reste celui du navigateur |
| Coller | `Ctrl+V` | Colle sous le pointeur, repères refaits (`R12` devient `R13`), nets conservés | Un groupe copié entier est collé en nouveau groupe (« G1 (copie) ») avec son cuivre interne |
| (Couper) | `Ctrl+X` | Coupe la sélection | Pas de bouton de menu (raccourci seul) |
| Pivoter | `R` | Tourne la sélection d'un quart de tour (`Maj+R` en sens inverse en plein glissement) ; le cuivre accroché suit | |
| Retourner | `F` | Passe un composant sur l'autre face ; un groupe est retourné en miroir autour de l'axe vertical de son cadre | |
| Dérouter | `U` | Supprime les pistes et les vias de la sélection, laisse les empreintes | Les zones, contours et découpes restent ; sans piste ni via sélectionné, rien n'est supprimé |
| Supprimer | `Suppr` | Supprime la sélection | |

### Menu Placer

| Bouton ou menu | Raccourci | Effet | Limites |
|---|---|---|---|
| Sélection | `Échap` | Outil de sélection | `Échap` termine d'abord ce qui est en cours, puis rend la main à la sélection |
| Empreinte… | `A` | Ouvre le catalogue de la LIB et pose l'empreinte choisie | |
| Piste | `T` | Trace une piste (voir la tâche) | |
| Paire diff. | `P` | Trace deux nets en paire différentielle | Une paire n'est tracée que sur une couche à la fois |
| Serpentin ▾ | `M` | Génère un serpentin d'appariement ; ▾ ouvre les réglages | Ne se pose que sur une piste droite (une piste en arc est refusée) |
| Via | `V` | Pose un via traversant ; en plein tracé, pose un via et change de couche | |
| Anti-collision | | Bascule : le tracé se tient (ou non) à la distance d'isolation | Actif d'office ; réglage du profil utilisateur |
| Zone cuivre ▾ | `Z` | Trace une zone de cuivre ; ▾ ouvre le menu de la couche | |
| Sérigraphie ▾ | `Maj+S` | Trait, rectangle, aplat ou texte de sérigraphie | `S` seule active la Sélection (voir la note ci-dessous) |
| Contour carte | `E` | Dessine le contour de la carte | |
| Découpe carte | `Maj+E` | Découpe intérieure de la carte | Doit rester dans le contour |
| Zone interdite | | Zone interdite d'une face | |
| Découpe zone | `X` | Polygone où une zone de cuivre ne se remplit pas | |
| Trou NPTH | | Trou mécanique non métallisé autonome | |
| Origine | `O` | Clic sur le point qui servira d'origine : une pastille, un via ou un bout de piste proche (couche active) l'attire, sinon le point tombe sur la grille. L'outil repasse en Sélection ; la grille et les coordonnées affichées suivent la nouvelle origine | Annulable ; se remet à zéro dans **Règles… > Carte et repères** |
| Mesure | `K` | Mesure une distance | |

> [!NOTE]
> Le bouton Sérigraphie du menu Placer et le titre de son menu déroulant affichent `Maj+S`, ce que fait la touche : `Maj+S` active la Sérigraphie en faisant tourner la forme (trait, rectangle, aplat, texte), et `S` seule active la Sélection. Les entrées Trait et Rectangle n'ont pas de raccourci propre.

### Menu Affichage

| Bouton ou menu | Raccourci | Effet | Limites |
|---|---|---|---|
| Grille | `G` | Affiche ou masque la grille d'accrochage | |
| Pas de grille | | Liste : 0,05 · 0,1 · 0,25 · 0,5 · 1 · 1,27 · 2 · 2,54 · 5 mm (« Grille … mm ») | Pas de 0,1 mm au démarrage ; trop serrée à l'écran, la grille n'est tracée que sur une case sur deux, cinq… (le pied de page dit la case visible) |
| Chevelu | `N` | Affiche ou masque les liaisons non routées | |
| Cartouche : aucun | | Cadre de page et cartouche : aucun, A4 ou A3 paysage, titre, noms, dates, numéro, société | |
| Vue : dessus / dessous | `Y` | Retourne la carte vue de dessous | Retourner la vue en couche externe passe aussi la couche active à l'autre face |
| Contraste | `H` | Cycle : complet, atténué, couche seule, cuivre final | « Cuivre final » montre la couche telle que le Gerber la grave, sans chevelu ni sérigraphie |
| Face opposée | | Cycle : normale, atténuée, masquée (sérigraphie, masque et pâte de la face non regardée) | |
| Rooms : affichées / masquées | | Cadres des blocs fonctionnels du schéma sur la carte | Réglage du profil utilisateur |
| Recadrer | | Cadre la carte entière | |
| Espace de travail ▾ | | Liste les panneaux (case cochée = visible), **Tout afficher**, **Disposition en colonnes**, **Réinitialiser la disposition** | |

### Menu Outils

| Bouton ou menu | Raccourci | Effet | Limites |
|---|---|---|---|
| Rechercher | `Ctrl+F` | Cherche une empreinte (repère) ou un net | Prend le raccourci du navigateur à dessein |
| Montrer au schéma | `L` | Fait sauter l'onglet du schéma sur la sélection | Désactivé en `file://` (deux onglets n'ont pas la même origine) ; sans accusé, le pied de page le dit |
| Contrôle DRC | | Lance le DRC et ouvre la liste DRC | Lancé à la demande |
| ⚡ Pinout : Vérifier | | Contrôle brochage, pas et dimensions du boîtier contre le schéma | |
| Score Placement | | Ouvre le panneau « Qualité de placement » | Voir la référence du panneau |
| Règles… | | Fenêtre « Règles & Fabrication », onglet Règles de conception | |
| Gestionnaire de contraintes… | | Contraintes par net | Voir [04-editeur-pcb-fabrication.md](04-editeur-pcb-fabrication.md) |
| Capabilités & Règles… | | Fenêtre « Règles & Fabrication », onglet Capabilités Fabricant | |
| Simulation EM… | | Paramètres S d'un net par la méthode des moments | Calcul sur le serveur (`python web_CAO.py`) ; voir [08-simulation-si.md](08-simulation-si.md) |

### Raccourcis clavier (carte)

Les touches d'une seule lettre se taisent quand un champ de saisie a le focus. Toute combinaison avec `Ctrl`/`Cmd` ou `Alt` non listée ici appartient au navigateur.

| Raccourci | Effet | Limites |
|---|---|---|
| `Ctrl+Z` | Annuler | |
| `Ctrl+Y`, `Ctrl+Maj+Z` | Rétablir | |
| `Ctrl+S` | Enregistrer .json | |
| `Ctrl+Maj+S` | Sauvegarder le projet sur GitHub | Seulement si lancé par WEB_SUITE |
| `Ctrl+A` | Sélectionne tout (empreintes, pistes, vias, zones, découpes, dessins, trous) | |
| `Ctrl+C`, `Ctrl+X`, `Ctrl+V` | Copier, couper, coller | |
| `Ctrl+G` | Groupe la sélection | |
| `Ctrl+Maj+G` | Dissout les groupes touchés | |
| `Ctrl+F` | Rechercher | |
| `Tab` | Ouvre ou ferme la saisie de coordonnées | Fonctionne en mode Piste, Zone, Contour, Découpe, Zone interdite, et en Sélection d'une seule empreinte |
| `1` à `9`, `0` | Couche 1 à 10 (pose un via si un tracé est en cours) | Seules les couches existantes répondent |
| `Page ↑` / `Page ↓` | Couche voisine | Seule façon d'atteindre les couches au-delà de dix au clavier |
| `S` | Sélection | Voir la note du menu Placer |
| `Maj+S` | Sérigraphie ; fait tourner la forme (trait, rectangle, aplat, texte) | |
| `T` | Piste | |
| `V` | Via ; en tracé de piste ou de paire, pose le via (ou les deux) | |
| `P` | Paire différentielle | |
| `M` | Serpentin | |
| `Z` | Zone cuivre | |
| `X` | Découpe zone | |
| `E` / `Maj+E` | Contour carte / Découpe carte | |
| `O` | Origine | |
| `A` | Empreinte… (catalogue LIB) | |
| `K` | Mesure | |
| `L` | Montrer au schéma | |
| `R` / `Maj+R` | Pivoter ; en plein glissement d'un boîtier, tourne et continue | `Maj+R` : sens inverse en plein glissement |
| `F` | Retourner (miroir pour un groupe) | |
| `D` | Adoucit un angle droit en 45° (chanfrein maximal) | Refuse un coude portant un via ou une pastille, ou deux largeurs différentes |
| `U` | Dérouter la sélection | |
| `G` | Grille | |
| `N` | Chevelu | |
| `Y` | Vue dessus / dessous | |
| `H` | Contraste | |
| `/` ou `Espace` | Bascule la posture du coude en tracé de piste ou de paire ; en plein glissement d'un boîtier, `Espace` fait un quart de tour | |
| `Maj+Espace` | En plein glissement : change la conduite des pistes (glisser, étirer, arracher) | |
| `Entrée` | Termine la piste, la paire, la zone, la découpe, le contour, l'aplat en cours | |
| `Retour arrière` | Recule d'un coude (piste, paire) ou d'un sommet (zone, découpe, contour, aplat) | Ne remet pas en place le cuivre que le coude avait poussé ; `Échap` ou `Ctrl+Z` le font |
| `Échap` | Termine ce qui est en cours, efface la cote, puis revient à la Sélection | Deux appuis en mode Mesure : le premier efface la cote |
| `Suppr` | Supprime la sélection | |

### Souris et tactile

| Geste | Effet | Limites |
|---|---|---|
| Clic | Sélectionne ; selon l'outil, pose un point | |
| `Ctrl+clic` ou `Maj+clic` | Ajoute à la sélection ou l'en retire | Sur une piste, `Maj+clic` prend la piste entière sur sa couche (et met son net en évidence) |
| `Maj+double-clic` ou double `Maj+clic` rapproché (0,5 s) sur une piste | Prend la piste sur toutes les couches, vias de passage compris | Un via d'un autre net arrête le parcours |
| `Ctrl+Maj+clic` sur une piste | Ajoute la piste entière à la sélection | |
| Glisser dans le vide | Lasso (rectangle de sélection) | Un clic dans le plein d'une zone la sélectionne si le lasso reste fermé |
| Glisser un objet | Déplace (les pistes accrochées suivent à 45°) | `Alt` enfoncé laisse le cuivre sur place |
| `Alt+clic` sur une piste sélectionnée ou une arête de zone, de contour, de découpe | Insère un sommet | |
| `Alt+glisser` sur une extrémité de piste | La détache du coude | |
| `Alt+glisser` dans le vide, ou bouton du milieu | Déplace la vue | |
| Molette | Zoom autour du pointeur | Échelle bornée |
| Double-clic | Termine piste, paire, zone ou contour en cours ; sinon, sur une piste, la prend en entier sur toutes les couches et met son net en évidence | Ne termine pas un aplat, une découpe de zone ni un tracé de sérigraphie |
| Clic droit | Termine la piste, la zone ou le contour en cours ; sinon efface la sélection et la mise en évidence du net | Ne dépose pas une paire en cours (`Entrée`, `Échap` ou double-clic) |
| Appui long (tactile) | Équivaut au clic droit | Environ 0,55 s |
| Deux doigts | Pincer pour zoomer, glisser pour déplacer la vue | |
| `Ctrl` (ou `Cmd`) enfoncé à la pose d'un bout de piste, au départ comme à l'arrivée | Le bout se pose là où l'on vise dans le cuivre de la pastille (sur la grille si elle tombe dans la pastille, au point exact sinon) au lieu d'être attiré au centre ; il garde ce décalage si le boîtier tourne ou se retourne | Hors du cuivre de la pastille, `Ctrl` ne change rien : l'aimant ramène au centre |
| Clic sur le repère (texte) d'une empreinte | Déplace le texte seul quand son empreinte est seule sélectionnée ou pas du tout ; sinon c'est l'empreinte qui part | |
| Clic sur l'étiquette d'une room | Prend tout le bloc ; glisser le déplace d'une pièce, `R` le tourne | `Ctrl`/`Maj` l'ajoute à la sélection |
| `Alt+clic` sur une pastille | Met en évidence le net de la pastille | Un clic simple sur une pastille prend le boîtier, rien d'autre |

### Pied de page, saisie de coordonnées

| Élément | Effet | Limites |
|---|---|---|
| Couche, Mode, X/Y, Zoom, Grille | Indications en lecture seule. « Mode » donne l'outil actif : Sélection, Piste, Via, Trou NPTH, Paire différentielle, Serpentin (Appariement), Zone de cuivre, Sérigraphie, Contour de carte, Découpe de carte, Zone interdite, Origine, Découpe de zone, Mesure | La grille affiche « 1 carré = … mm » ; « · pas … mm » si la case visible n'est pas le pas d'accrochage. |
| Empreintes, Pistes, Vias, Non routés, Net | Compteurs en lecture seule | |
| Zone de saisie : Absolu / Relatif / Polaire | Champs X, Y (absolu) ; dX, dY (relatif) ; L, ∠° (polaire). **Placer** ou `Entrée` valide, `Échap` ferme, `Tab` rouvre | Ouverte par `Tab` ; voir les modes qui l'acceptent |

### Panneau Empilage (couches)

| Bouton ou menu | Effet | Limites |
|---|---|---|
| Couches cuivre (liste 1 à 32) | Nombre de couches de cuivre | Un changement garde l'épaisseur visée tant qu'elle laisse 60 µm par isolant ; annulable |
| Tout / Rien / Cuivre seul | Affiche toutes les couches, aucune, ou le cuivre avec zones et contour | |
| Ligne de couche | Un clic rend la couche active ; ◉/○ la masque ou l'affiche ; le pastillon `PLAN`/`GND`/`PWR` ou le compte de zones sélectionne tout le cuivre plein de la couche | |
| Couches techniques | Sérigraphie dessus/dessous (F.SilkS, B.SilkS), Masque dessus/dessous (F.Mask, B.Mask), Pâte dessus/dessous (F.Paste, B.Paste), Points de test (PTST), Contour de carte (Board Outline), Zones de cuivre (Zones), Chevelu (Ratsnest), Erreurs DRC (DRC) : un clic les affiche ou les masque | PTST marque les composants « Point de test » du schéma (repère `TP…` ou `PTST…`) |
| Nom de la couche, Couleur | Renomme, recolore la couche active | |
| Rôle de la couche | Signal ; Mixte (signal + cuivre) ; GND (Plan de masse) ; PWR (Plan d'alimentation) ; Blindage | Les trois derniers entretiennent une zone pleine carte ; le rôle ne peut pas contredire le cuivre posé |
| Net du plan | Net du plan pour GND, PWR, Blindage | |
| Zones posées | Nombre de zones de la couche (lecture) | |

### Panneau Empilage physique

| Bouton ou menu | Effet | Limites |
|---|---|---|
| Modèle d'usine | Applique un empilage prêt pour le nombre de couches courant | Pour un nombre sans modèle, un empilage générique est proposé |
| Coupe (tableau) | Du dessus vers le dessous : #, Nom, Matière, Rôle, Poids, Épaiss., Dk, Df ; teinte par rôle ; ligne d'épaisseur totale et épaisseur visée | Un clic sur une ligne l'édite dessous |
| Cuivre : Rôle, Cuivre (12, 17,5, 35, 70, 105 µm, « autre… »), Net du plan | Édite une couche de cuivre | « Rôle douteux » signalé si le rôle contredit le cuivre posé |
| Rugosité du cuivre, Modèle, Rugosité RMS Rq, Rayon des nodules, Rapport de surface SR | Rugosité de la couche (lisse, ED, VLP, HVLP, Huray…) pour les simulations | Rien n'est écrit tant que tout est au défaut |
| Diélectrique : Type (Âme (core), Prépreg, Film adhésif), Épaisseur, Dk (εr), Df (tan δ), Matière | Édite un diélectrique | |
| Vernis : Épaisseur (mm/face), Dk du vernis, Couleur (vert, rouge, bleu, noir, blanc, jaune, violet, ambre) | Vernis des deux faces | Même vernis dessus et dessous |
| Sérigraphie : Couleur de l'encre (blanc, noir, jaune) | | Ne compte pas dans l'épaisseur |
| Épaisseur visée, Obtenue, Stratifié nu, Cuivre total | Synthèse d'épaisseur | « Obtenue », « Stratifié nu », « Cuivre total » sont en lecture |
| Répartir sur la cible | Met les diélectriques à l'échelle pour atteindre l'épaisseur visée | Grisé si déjà atteinte ; refuse une cible inatteignable |
| Symétriser | Donne à chaque couche la moyenne de sa jumelle | Grisé si déjà symétrique |
| Exporter la feuille .txt | Enregistre la coupe, matières et rôles dans `empilage.txt` | La feuille est aussi dans l'archive de fabrication (`EMPILAGE.txt`) |
| Finition du cuivre | ENIG (or chimique), HASL étain-plomb, HASL sans plomb, OSP, Argent chimique, Or dur (contacts) | |
| Traitement des vias | Ouverts au masque ; Recouverts de vernis (type II) ; Bouchés résine (type V) ; Bouchés et plaqués, via-in-pad (type VII) | Seul « Ouverts au masque » ouvre le masque ; réglage partagé avec Règles |
| Pressages — laminage séquentiel : Du cuivre, Au cuivre, Ajouter un pressage, Retirer | Décrit une carte pressée en plusieurs fois | Visible à partir de 3 couches ; une plage qui coupe une âme ou en croise une autre est refusée ; détail dans [04-editeur-pcb-fabrication.md](04-editeur-pcb-fabrication.md) |
| Modèles de simulation : Diélectrique causal (Djordjevic-Sarkar), Fréquence de la fiche (GHz), Modèle de via | Options des simulations | Voir [08-simulation-si.md](08-simulation-si.md) |
| Contre-perçage (back-drill) : face percée, Couche à ne pas couper, Surperçage, Moignon résiduel admis, Nouvelle règle de contre-perçage, Supprimer | Règles de contre-perçage | Détail dans [04-editeur-pcb-fabrication.md](04-editeur-pcb-fabrication.md) |

### Panneau Propriétés

Le contenu dépend de la sélection.

| Sélection | Champs et boutons | Limites |
|---|---|---|
| Rien | « n empreinte(s) · n liaison(s) restant à router ». **Placement auto**, **Ranger à côté** | **Placement auto** laisse les points de test (`TP…`, `PTST…`) à la main ; **Ranger à côté** groupe par grappes fonctionnelles ou aligne le long du bord droit |
| Une empreinte | Repère, Valeur, Boîtier ; note du boîtier ; bloc Pinout (**Inspecter…**) ; **📄 Ouvrir la Datasheet** ; Empreinte générique ; Empreinte Catalogue LIB (**Appliquer**, **🔍**) ; **⚠️ Version LIB plus récente** et **🔄 Recharger depuis la LIB** ; **📐 Ouvrir dans Gestion LIB ↗** ; Broches, Pas (mm), Écartement, Face (Dessus, Dessous), X, Y, Rotation, **✨ Auto** ; Sérigraphie automatique ; Non monté (ignoré par les simulations) ; Puissance dissipée (W), **Estimer l'échauffement** ; tableau « Broches et nets » (liaison à la zone : zone, bras, directe, aucune) ; Bras thermiques (mm), Nombre de bras ; Groupe (**Dissoudre**) | Pas et Écartement sont grisés quand l'empreinte est dessinée à la main ; la Datasheet n'apparaît que si le schéma en fournit une ; « Non monté » n'agit que sur les simulations, pas sur `bom.csv` ni `positions.csv` (voir Variantes) |
| Une piste | Couche, Largeur, Longueur, Arc et Rayon (piste courbe), Net, Classe du net ; **Angle droit → 45° (D)**, **Largeur au net**, **Largeur de classe**, **Sélectionner le net (n)**, **Dérouter le net** ; section « Ligne de transmission » | **Dérouter le net** demande confirmation ; la ligne de transmission est décrite dans [08-simulation-si.md](08-simulation-si.md) |
| Une piste entière ou plusieurs segments | Nombre de segments et de vias, nets ; **⚡ Simuler l'appariement du bus (n nets)…** (2 nets ou plus) ; Couche (« — inchangée — »), Largeur (« mixte » si les largeurs diffèrent), Longueur totale ; **Angle droit → 45° (D)**, **Largeur de classe**, **Supprimer** ; tableau de groupes de vias ; « Ligne de transmission » | Un champ resté sur « mixte » n'écrit rien |
| Un via | Diamètre, Perçage, Type de via (Traversant, Borgne dessus, Borgne dessous, Enterré), De la couche, À la couche, Net, « Suit un boîtier déplacé » (automatique, toujours un boîtier, jamais) ; règle de contre-perçage si définie ; verdict de fabrication, rapport d'aspect, self et capacité ajoutées | Borgne proposé à partir de 3 couches, enterré à partir de 4 ; le perçage reste inférieur au diamètre moins 0,1 mm |
| Plusieurs objets | Une ligne par famille et par jeu de cotes identiques ; la ligne choisie ouvre ses champs ; ligne « tous » ; un champ commande le groupe entier | Repère et position ne sont jamais modifiés en lot ; un seul `Ctrl+Z` |
| Une zone | Couche, Net rattaché (« — aucun (cuivre isolé) — »), « Liaison des pastilles du net » : Bras thermiques, Directe pour les CMS bras pour les traversantes, Directe pour toutes, Aucune ; Sommets, Emprise ; **Étendre à la carte**, **Supprimer** | Sans net, la zone est du cuivre isolé qui dégage tout ce qu'elle rencontre ; un plan de couche suit le contour tant qu'on ne le déforme pas |
| Le contour de carte | Largeur, Hauteur ; Hauteur max dessus / dessous ; Échauffement max (K) ; Contour (rectangle ou libre), Sommets ; **Redessiner (E)**, **Revenir au rectangle**, **Disque**, **Retirer les découpes** | Redimensionner un contour libre le met à l'échelle ; Échauffement max vaut 40 K d'office |
| Une découpe de carte | Largeur, Hauteur, Sommets, Coin ; **Supprimer la découpe** | Sommets tirables, `Alt+clic` sur une arête en ajoute un |
| Une zone interdite | Nom, Face (Dessus, Dessous), Hauteur permise (mm), Emprise, Sommets ; **Supprimer la zone** | |
| Un trou NPTH | Diamètre de perçage (mm), **M2 (2,2 mm)**, **M2.5 (2,7 mm)**, **M3 (3,2 mm)**, **M4 (4,2 mm)**, Longueur, Angle, X, Y, Verrouiller la position, **Supprimer le trou NPTH** | Diamètre de 0,4 à 30 mm ; une longueur supérieure au diamètre fait une fente (jusqu'à 60 mm) ; exporté dans le fichier Excellon `*-NPTH.TXT` |
| Un trait, un cadre de sérigraphie | Forme, Couche sérigraphie (F.SilkS, B.SilkS), Épaisseur de trait (0,10 à 0,50 mm), X1, Y1, X2, Y2, Dimensions ; **Supprimer** | |
| Un texte de sérigraphie | Forme, Texte, Couche, Hauteur de police (0,5 à 25 mm), Épaisseur de trait, Orientation (0°, 90°, 180°, 270°), X, Y ; **Supprimer le texte** | |
| Un aplat de sérigraphie | Couche, Largeur, Hauteur, Sommets, Trous ; **Supprimer l'aplat** | Sort en région dans les Gerber `.GTO` / `.GBO` |

### Panneau Nets & composants

| Bouton ou menu | Effet | Limites |
|---|---|---|
| Onglet Nets | Colonnes Net, Classe, État (« routé » ou « n à router ») ; un clic sur la ligne met le net en évidence ; la liste « Classe » rattache le net à une classe | Une classe inexistante proposée (Horloge, RF, Antenne…) est créée avec ses règles d'office |
| Case « non routés » | Ne garde que les nets avec liaisons manquantes | Visible seulement sur l'onglet Nets |
| Onglet Composants | Colonnes Repère, Composant, Br. ; un clic sélectionne et centre la vue | Avec une variante active : résumé « montée(s) / non montée(s) », badge `NM` |
| Onglet DRC | Liste des écarts du dernier contrôle (message, position en mm, couche) ; un clic centre la vue, sélectionne le via visé ou passe sur la couche fautive. Les remarques (sans gravité) sont en texte plus discret | Limitée à 400 lignes, puis « … et n autres écarts non listés » (tous restent peints sur la carte) ; « Contrôle non lancé » avant le premier DRC, « Aucune erreur détectée » si la liste est vide |

### Panneau Qualité de placement

Ouvert par **Outils > Score Placement** (le même bouton le referme) ; il est masqué à l'ouverture de l'éditeur. Il se recalcule de lui-même peu après chaque modification de la carte.

| Bouton ou élément | Effet | Limites |
|---|---|---|
| 🔄 | Recalcule le placement | **🔄 Réessayer** apparaît si le calcul a échoué |
| HPWL (Cuivre) | Longueur totale de chevelu (mm) et sa variation | |
| Congestion max | Maximum de pastilles par case ; **📍** centre la vue sur le point chaud | **📍** n'apparaît qu'à partir de 4 pastilles par case |
| Orientation de REF / Optimisations d'angle | Pour le composant sélectionné : impact (croisements, longueur) aux quatre angles cardinaux ; **✨ Tourner à n°** applique l'optimum. Sans sélection : jusqu'à cinq suggestions | |
| Découplage HF | Pourcentage de condensateurs conformes, distance moyenne (cible ≤ 3,5 mm), liste « Capas éloignées de leur CI » | |
| Composants les plus étirés | Boutons par repère ; un clic cible le composant | |
| Groupes de placement & Zones | Un bloc par motif du schéma : **🖐 Grouper**, **📐 Disposer**, **🎯 Déposer** | **Disposer** compacte autour de l'ancre en résolvant collisions et rotations ; **Déposer** pose en grappe dans un emplacement libre ; le bloc vient des motifs ou des zones du schéma |
| Ordre suggéré de placement (Tiers 1 à 4) | Liste dépliable : Ancres, Actifs, Flexibles, Passifs libres | |

### Fenêtre Règles & Fabrication

Ouverte par **Outils > Règles…** (onglet « Règles de conception ») ou **Capabilités & Règles…** (onglet « Capabilités Fabricant »). `Échap` la ferme ; `Ctrl+Z` et `Ctrl+Y` la traversent. Tout champ affiché se modifie ; ce qui ne se règle pas est montré en valeur lue. Chaque page porte le nombre de défauts du dernier contrôle, **Contrôler maintenant** et **Voir dans la liste**.

| Famille et page | Champs et boutons | Limites |
|---|---|---|
| Classes de net > Classe de net | Nets rattachés ; Piste, Isolation, Via Ø, Perçage (mm) ; **Nouvelle**, **Renommer**, **Supprimer**, **Recaler le routage posé**, **Classes du schéma** | **Recaler le routage posé** est explicite : changer une largeur ne remue pas la carte sans l'avoir demandé |
| Électrique > Isolation | Isolation de la classe (mm) ; matrice des natures (piste, pastille CMS, pastille traversante, via, cuivre plein, trou) dont chaque case ajoute un minimum | Les deux nets d'une paire échappent aux classes et à la matrice |
| Électrique > Court-circuit | Case « Autoriser deux nets à se toucher » | Fait taire la règle partout |
| Électrique > Liaison non routée | Lecture : liaisons manquantes, nets | Pas de champ |
| Routage > Largeur de piste | Largeur (mm) de la classe ; **Recaler le routage posé** | |
| Routage > Angle des pistes | Angle imposé : 45°, 90°, libre, arrondi | Vaut pour la suite du tracé, ne bouge rien de posé ; se range avec le document |
| Routage > Face à un obstacle | Conduite : pousser le cuivre, contourner, signaler ; case Anti-collision ; « Pistes au déplacement d'un boîtier » : glisser, étirer, arracher | La conduite se range avec la carte ; « Pistes au déplacement d'un boîtier » est un réglage de l'utilisateur ; la page ne produit aucun défaut |
| Routage > Écharde de gravure | Lecture | Décrochement plus court que la piste ; remarque |
| Vias et perçage > Style de via | Rondelle Ø, Perçage (mm), Traitement des vias | Lit la couronne restante |
| Vias et perçage > Via à via, trou à trou | Cuivre à cuivre, Trou à trou (mm) ; lectures : appliqué, axe en axe imposé, règle contraignante | |
| Vias et perçage > Rapport d'aspect | Alerte (× : 1), Refus (× : 1) ; lectures : stratifié percé | 8 : 1 et 10 : 1 d'usine |
| Plans et zones > Bras thermique | Bras thermique (mm) | Nombre de bras : 4 (lecture) |
| Plans et zones > Zone de cuivre | Cuivre ↔ piste, via, pastille TH, pastille CMS (mm) ; Cuivre de zone mini (mm) | 0 désactive le cuivre de zone mini (0,2 mm d'usage) |
| Paires différentielles > Règle et paires | Voir la section suivante | |
| Fabrication > Profil fabricant & Capabilités | Voir la section « Profils fabricants » | |
| Fabrication > Règles du Projet (Min / Typique / Max) | Table Min / Typique / Max par règle | |
| Fabrication > Masque et pâte | Masque ± (mm), Retrait de pâte (mm), Traitement des vias | |
| Fabrication > Marge au bord | Marge au bord (mm) ; lecture du contour | Les zones sont rognées à cette marge |
| Carte et repères > Dimensions et origine | Carte L, Carte H, Origine X, Origine Y (mm) ; « Repère des fichiers de fabrication » (coin de la carte ou origine utilisateur) ; « Grille d'accrochage (mm) » ; **Placer l'origine** (`O`), **Remettre à zéro**, **Revenir au rectangle** | **Placer l'origine** ferme la fenêtre : le point se désigne sur la carte |

### Page Règle et paires (paires différentielles)

| Bouton ou menu | Effet | Limites |
|---|---|---|
| Paire, Net P, Net N | Choix des deux nets | Un net déjà apparié reste visible mais grisé |
| Créer la paire | Déclare la paire sur les nets choisis | La polarité est celle des listes |
| Détecter | Reconnaît les couples (suffixes `P`/`N`, `+`/`-`, `DP`/`DM`, `DP`/`DN`, `D+`/`D-`, `TP`/`TN`, `RP`/`RN`, `HSP`/`HSM`) | N'en propose que si les deux nets existent |
| Supprimer | Supprime la paire sélectionnée dans la liste « Paires de la carte », après confirmation | Ne supprime aucune piste ; le bouton n'apparaît que s'il existe une paire |
| Paires de la carte (tableau) | Paire, Net P, Net N, Longueur, Découplé ; un clic sur une ligne sélectionne la paire (le découplé passe en rouge au-delà de la limite de la règle) | « Aucune paire déclarée » tant qu'il n'y en a pas |
| Router la paire (`P`) | Active l'outil Paire diff. (comme `P`) ; le tracé commence ensuite par un clic sur une pastille de la paire | Ne trace rien par lui-même |
| Règle, Nouvelle règle, Supprimer, Paires visées | Gère les règles de paire ; la première règle qui vise la paire l'emporte | Sans règle écrite : 0,20 mm de piste, 0,15 mm d'écart ; la première retouche l'inscrit dans le document. **Nouvelle règle** demande un nom ; **Supprimer** (la règle) n'apparaît qu'à partir de deux règles. Les deux boutons Supprimer de la page ne sont pas les mêmes : l'un efface une règle, l'autre une paire |
| Nom, Commentaire, Objets visés | Entête de la règle et portée | |
| Largeur mini / préférée / maxi, Écart mini / préféré / maxi | Les six cotes | |
| Ces valeurs s'appliquent à toutes les couches | Décochée, chaque couche reçoit ses cotes ; le tableau des couches (Lg et Éc. mini / préf. / maxi) se retouche par un clic sur la ligne (largeur puis écart préférés, en mm) | Cochée, un clic sur une ligne rend seulement la couche active. « retouchée » marque une couche à part |
| Long. découplée maxi | Longueur découplée tolérée (mm) | 500 mil, soit 12,7 mm, d'usage |
| Profil d'impédance, Profil, **Ajuster la largeur**, **Ajuster l'écart** | Cible d'impédance différentielle (D90 USB 2.0, D100 Ethernet et LVDS, D85 PCIe et USB 3, D120 CAN et RS-485) et résolution de la cote | ±10 % au mieux ; sans plan de référence dans l'empilage, le panneau le dit |

### Profils fabricants

Un profil décrit les capacités d'usine d'un fabricant. Quatre profils sont intégrés au code : JLCPCB, Générique, Eurocircuits, PCBWay. Leur structure est la même que celle des fichiers `profils/fabricants/*.json`, versionnés dans le dépôt (voir [../../profils/fabricants/jlcpcb.json](../../profils/fabricants/jlcpcb.json)).

| Clé du profil | Contenu |
|---|---|
| `id`, `name`, `version`, `description`, `vendorUrl` | Identité du profil |
| `general` | Nombre de couches, impédance contrôlée, matériaux, finitions, vernis |
| `dimensions` | Dimensions max et min, tolérances, épaisseurs |
| `copper` | Poids de cuivre (largeur et isolation mini, anneau), tolérance, dégagements |
| `drilling` | Forets, tolérances, vias, fentes, trous borgnes et enterrés, contre-perçage |
| `silkscreen` | Trait et texte minimaux, dégagement pastille à sérigraphie |
| `outline` | Détourage, V-cut, attaches, panélisation |

| Bouton ou menu | Effet | Limites |
|---|---|---|
| Profil de fabrication actif | Choisit le profil | Enregistré dans les règles de la carte ; les fichiers de `profils/fabricants/` remplacent les profils intégrés quand la page est servie |
| 🏭 Capabilités Fabricant (Limites usine) / 🎯 Règles de Conception (Min / Typique / Max) | Deux vues du profil | |
| ⚡ Aligner règles du projet aux minima … | Ajuste classes, dégagements, masque 1:1 et perçages aux minima du profil | |
| 📁 Importer JSON | Importe un profil depuis un fichier | Un profil importé est écrit dans le stockage du navigateur |
| 💾 Exporter | Exporte le profil courant en JSON | |
| ➕ Nouveau | Crée un profil personnalisé dérivé du courant | |
| 🗑 Supprimer | Supprime un profil personnalisé et rend JLCPCB actif | Les quatre profils intégrés ne se suppriment pas |
| ⚡ Appliquer au routage & classes | Applique valeurs typiques et minima au routage | |
| ↺ Recharger recommandations (profil) | Remet les valeurs recommandées | |
| 🏭 Voir Capabilités Usine | Retourne à la fiche d'usine | |

Les règles gérées en Min / Typique / Max sont : Largeur de piste, Isolement & Dégagement, Diamètre de perçage, Diamètre extérieur de via, Anneau annulaire, Marge au contour, Expansion de masque, Retrait de pâte, Bras thermique.

### Menus déroulants des outils

| Menu | Entrées | Limites |
|---|---|---|
| Zone cuivre ▾ | Rôle de la couche ; Net du plan ; **Zone à main levée** (`Z`) ; **Zone pleine carte (libre)** ; **Sélectionner le cuivre de la couche** | La dernière entrée n'apparaît que si la couche porte des zones |
| Sérigraphie ▾ | **Trait (segment)**, **Rectangle (cadre)**, **Aplat plein (logo, bandeau)**, **Texte libre** | |
| Serpentin ▾ | Titre « Réglages du Serpentin » : Amplitude max (mm), Pas / Pitch (mm), Allongement forcé ΔL (mm) ; **⚡ Simuler appariement de bus (Skew)…** | Valeurs d'usine : 1,5 mm, 1,2 mm, 0 ; planchers imposés : 0,5 mm et 0,3 mm |

### Fenêtre Analyse de bus synchrone

Ouverte par **Simuler appariement de bus (Skew)…** : « Analyse de Bus Synchrone (Timing Closure: Setup & Hold) ».

| Élément | Effet | Limites |
|---|---|---|
| Nom du bus, Protocole / Préréglage, Fréquence (MHz), Setup t_su, Hold t_h, T_co min, T_co max | Paramètres de timing | Toute modification passe le préréglage en « custom » |
| Colonne Rôle (choix CLK) | Désigne l'horloge de référence | |
| Tableau Longueur, Temps de vol, Skew Δt, Hold Slack, Setup Slack, Statut | Résultat par net | |
| Régler serpentin (+ n mm) / Centrer (+ n mm) | Arme le serpentin sur le net avec l'allongement conseillé | Le Setup violé n'a pas de correction par serpentin : « Piste trop longue » |
| Ouvrir dans Simulation EM ↗ | Passe à l'analyse bus du panneau de simulation | Voir [08-simulation-si.md](08-simulation-si.md) |
| Fermer | Ferme la fenêtre | `Échap` aussi |

### Fenêtre Schéma ↔ PCB (ECO)

| Élément | Effet | Limites |
|---|---|---|
| Badge de `Fichier > Schéma ↔ PCB` | Nombre de disparités détectées | |
| Catégories : Nouveaux, Renommés, Boîtiers, Nets, Valeurs, Absents, Contraintes | Cochent ou décochent tout un type | « Absents » est décoché d'office |
| Case de chaque action | Choisit les actions à appliquer | |
| Tout cocher / Tout décocher | | |
| Détacher les pistes en conflit direct de net | Détache les pistes des pastilles dont le net change | |
| 📁 Autre schéma / netlist… | Change la source | |
| Annuler | Ferme sans rien changer | |
| 🚀 Appliquer l'ECO (n) | Applique les actions cochées | Routage, vias et plans conservés ; position et orientation des empreintes conservées ; un seul pas d'annulation |
| Importer schéma ou netlist… / Fermer | Affichés quand rien n'est à synchroniser | |

### Autres fenêtres

| Fenêtre | Contenu | Limites |
|---|---|---|
| Importer une netlist | Voir la tâche d'import | |
| Changement de brochage sur pistes routées | **Conserver les pistes (ignorer)**, **✂ Supprimer les pistes en conflit** | |
| Inspection & Conformité du Pinout | Groupes « À corriger », « Acquittées », « Non placés », « Conformes » ; **Acquitter (faux positif)** / **Ne plus acquitter**, **Reposer l'empreinte sur les cotes du boîtier**, **Copier le rapport**, **Fermer** | Un composant acquitté revient dans l'alerte si ses anomalies changent |
| Variante de montage | Choisit une variante ; **⟳ Reprendre du schéma**, **Fermer** | Les variantes se créent dans le schéma ; la variante barre les empreintes non montées et les retire de `bom.csv` et `positions.csv` à l'export ; le cuivre ne change pas |
| Exemples de routage | Description des deux cartes, **Ouvrir cet exemple**, **Fermer** | |
| Cartouche | Format : aucun, A4 paysage, A3 paysage ; titre, noms, dates, numéro, société | Ouverte par le bouton **Cartouche : …** du menu Affichage |

### Réglages qui suivent l'utilisateur

Une carte décrit un circuit ; une manière de travailler appartient à la personne. Ces réglages sont rangés dans le profil de l'utilisateur (fichier `profils/<nom>.json`, voir [../../profils/LISEZ-MOI.md](../../profils/LISEZ-MOI.md)) et non dans le `.json` de la carte :

| Réglage | Origine |
|---|---|
| Pas d'accrochage et affichage de la grille | Affichage > Grille, Pas de grille |
| Anti-collision | Placer > Anti-collision |
| Vue dessus / dessous | Affichage > Vue |
| Contraste, Face opposée | Affichage |
| Rooms affichées ou masquées | Affichage > Rooms |
| Onglet du panneau de listes, filtre « non routés » | Panneau Nets & composants |
| Disposition des panneaux | Affichage > Espace de travail |

La conduite « Pistes au déplacement d'un boîtier » (Règles > Face à un obstacle) est, elle, gardée dans le stockage du navigateur (clé `pcb.moveEtch`).

À l'opposé, l'angle imposé, la conduite face à un obstacle, la matrice des natures, les classes et l'empilage sont dans le document de la carte et se défont avec `Ctrl+Z`.

### Routage par Claude et chemin automatique

| Fonction | Effet | Limites |
|---|---|---|
| Carte de routage (lot de routes) | Claude fournit des points de passage ; le routeur de la page fait le détail (poussée, contournement). Aperçu en pointillés, cuivre poussé en rouge, application au clic en une étape d'annulation | Jusqu'à 20 routes par lot, 200 points par route, 50 vias (constantes du code) ; seulement quand Claude pilote la page |
| Chemin automatique (`cao_chemin`) | A* sur une grille par couche, huit directions, via là où les couches traversées sont libres ; propose les points de passage d'une liaison ou l'axe d'une paire | N'écrit rien ; les liaisons sont cherchées dans l'ordre donné, sans ordonnancement ni reprise d'ensemble ; ne consulte pas la faisabilité d'un via borgne ou enterré |

Voir [11-claude-mcp.md](11-claude-mcp.md) pour le protocole de pilotage.

## Limites connues

- L'éditeur n'est pas livré avec une bibliothèque d'empreintes : les empreintes de départ sont paramétriques, le nom du boîtier venu du schéma fixe style et cotes (`PKG_LIB`). Languettes de dissipation (DPAK, SOT-223), pastilles thermiques centrales (QFN) et brochage réel d'un BGA se dessinent à la main dans Gestion LIB.
- Le dessin d'une empreinte se fait dans Gestion LIB ; `08-empreinte.js` ne garde que la bibliothèque locale des empreintes retouchées.
- Le DRC n'est pas continu : il se lance à la demande. Seul le routeur applique les isolations en direct.
- Le routeur accroche le centre de la pastille et ne reprend pas le décalage « SMART_PADS » de KiCad.
- Pas d'autorouteur à la main : le moteur assiste un geste ; le chercheur de chemin n'est joignable que par Claude.
- Les pistes savent être circulaires, mais les zones, découpes de cuivre et contours restent des polygones : aucun outil ne dessine d'arc dans une zone (elle arrive en sommets ou d'un fichier). Le routeur ne défait jamais un arc et contourne ou refuse de le pousser.
- `Retour arrière` recule d'un coude sans remettre en place le cuivre que ce coude avait poussé ; `Échap` ou `Ctrl+Z` le font en une fois.
- Une paire différentielle ne traverse pas un cuivre étranger qui barre tout son passage et ne vit que sur une couche à la fois.
- Le serpentin ne se pose que sur une portion droite (pas sur un arc).
- Le laminage séquentiel est jugé via par via, d'un seul perçage : pas de micro-vias empilés ou décalés sur plusieurs pressages. Le chercheur de chemin et la pose de vias ne consultent pas la faisabilité : le DRC le dit après coup.
- Sans projet ouvert, il n'y a pas de sauvegarde automatique : fermer l'onglet sans `Enregistrer .json` perd le travail (l'avertissement de fermeture le rappelle). Avec un projet, le brouillon est écrit toutes les 30 secondes ; il ne couvre pas les 30 dernières.
- L'estimation d'échauffement d'un composant est un ordre de grandeur (±30 %), pas une simulation.
- L'impédance différentielle des paires est donnée à ±10 % au mieux ; la ligne de transmission d'une piste à ±5 %.
- En `file://` (double-clic), deux onglets n'ont pas la même origine : « Montrer au schéma » est désactivé.
- Tant que la fenêtre Règles est ouverte, les raccourcis de la carte se taisent : seuls `Échap` (ferme), `Ctrl+Z` et `Ctrl+Y` agissent.

## Voir aussi

- [04-editeur-pcb-fabrication.md](04-editeur-pcb-fabrication.md) : contraintes de nets, exports, Draftsman, 3D, thermique, dossier mécanique.
- [02-editeur-schematique.md](02-editeur-schematique.md) : netlist, classes, blocs et variantes.
- [05-gestion-lib.md](05-gestion-lib.md) : dessin des empreintes, catalogue.
- [08-simulation-si.md](08-simulation-si.md) : ligne de transmission, simulation EM, bus synchrone.
- [11-claude-mcp.md](11-claude-mcp.md) : routage et placement pilotés par Claude.
- [01-accueil-projets-tactile.md](01-accueil-projets-tactile.md) : projets, profils, mode tactile.
- [../../editeur-pcb/README.md](../../editeur-pcb/README.md) : notes techniques détaillées de l'éditeur.
- [../simulation-em.md](../simulation-em.md) et [../verification-carte.md](../verification-carte.md).
