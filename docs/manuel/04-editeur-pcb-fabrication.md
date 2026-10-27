# Éditeur PCB : contraintes, fabrication, plans, 3D et thermique

Seconde moitié de l'Éditeur PCB : ce qui se règle (gestionnaire de contraintes, zones interdites, trous NPTH, sérigraphie, échauffement) et ce qui sort de la carte (dossier de fabrication, IPC-2581, PCBA JLCPCB, plans Draftsman, DXF, dossier mécanique, fiche de mesure, animation 3D).
L'édition, le placement, le routage et le DRC sont décrits dans [l'édition et le routage](03-editeur-pcb-edition-routage.md).
Le détail technique (formats, structure des fichiers) est dans [editeur-pcb/README.md](../../editeur-pcb/README.md) ; ce chapitre dit où cliquer et ce qui en sort.

## Guide par tâche

### Je veux fixer une impédance cible pour une classe de nets et obtenir la bonne largeur de piste

1. Ouvrez **Outils → Gestionnaire de contraintes…**, onglet **Classes**.
2. Dans la ligne de la classe, saisissez **Z cible Ω** (et **Tol. %** si les 10 % par défaut ne conviennent pas).
3. La colonne **Largeur pour Z cible** propose, pour chaque couche de signal, la largeur qui donne cette impédance d'après l'empilage (`L1 0,120`, `L2 0,090`…). Un clic sur une couche la pose pour la classe sur cette couche ; **→ toutes** les pose sur toutes les couches de signal où la cible est atteignable.
4. Une couche notée `L3 —` n'a pas de plan de référence, ou la cible est hors d'atteinte (entre 0,03 et 5 mm).
5. Le routeur prend ensuite la largeur de la couche active et en change au via ; le DRC juge chaque piste à la largeur de sa couche.

> [!NOTE]
> La largeur par couche est lue dans la colonne **Par couche**. Une couche laissée vide reprend la largeur générale de la classe (colonne **Largeur**).

### Je veux limiter la longueur, le nombre de vias ou les couches d'un net

1. Ouvrez le gestionnaire, onglet **Nets**.
2. Dans la ligne du net, remplissez **L min**, **L max**, **Vias max** ou **Couches** (`1,4` pour L1 et L4 ; vide : toutes). Une case vide hérite du schéma (marque `sch`), puis de la classe ; la valeur qui s'applique est affichée en grisé.
3. La pastille d'**État** passe au vert (tenue), au rouge (non tenue) ou reste grise (net non routé, ou aucune contrainte). La colonne **Écarts** dit ce qui manque.
4. Pour la même contrainte sur toute une classe, saisissez-la dans l'onglet **Classes**.

### Je veux régler plusieurs nets d'un coup

1. Onglet **Nets** : cochez les nets (la case **✓** de l'en-tête coche ou décoche tous les nets affichés ; **Filtrer : net ou classe** et **en faute seulement** réduisent la liste).
2. En haut à droite, la liste **→ classe** rattache les nets cochés à une classe ; la liste **groupe** les ajoute à un groupe d'appariement existant.

### Je veux apparier la longueur d'un bus (groupe d'appariement)

1. Gestionnaire de contraintes, onglet **Groupes d'appariement**, bloc **Nouveau groupe**.
2. Donnez un nom (ex. `DDR_DQ0-7`), choisissez **en longueur (mm)** ou **en délai (ps)** et saisissez la tolérance ± (le champ affiche 0,5 en grisé ; laissé vide, il crée un groupe à ± 0).
3. Cochez au moins deux nets dans la liste (filtre : `DQ`), ou cliquez **Depuis la sélection** après avoir sélectionné des pistes sur la carte.
4. Cliquez **Créer le groupe (n)**.
5. Chaque groupe affiche, net par net, la longueur, le délai, l'**Écart** à la référence et **À ajouter (mm)**. La référence est le plus long net routé, ou le net choisi dans la liste **référence**.
6. Pour rattraper le retard, posez un serpentin (Placer → Serpentin, voir [03](03-editeur-pcb-edition-routage.md)) sur le net court : il prend pour cible ce qui lui manque.

### Je veux exiger une forme de net (point à point, chaîne, étoile, fly-by) et limiter les moignons

1. Gestionnaire de contraintes, onglet **Topologie et moignons**.
2. En tête, réglez la règle par **classe** : **Topologie**, **Moignon max mm**, **Moignon de via max mm**, **Tol. étoile mm**, **Contre-perçage**.
3. Plus bas, la ligne d'un net précise ces champs pour lui seul, plus **Ordre imposé** (`U1, U4, U5` ; le premier repère est la source).
4. Lisez à gauche ce qui est mesuré : **Forme du cuivre**, **Broches**, **Ordre le long du cuivre**, **Moignon max mesuré**, **Moignon via mesuré**.
5. La colonne **Écarts** dit pourquoi un net est refusé ; le message propose un via borgne ou un contre-perçage pour un moignon de via.

### Je veux imposer une isolation minimale entre deux classes (ex. Alimentation ↔ RF)

1. Gestionnaire de contraintes, onglet **Isolation entre classes**.
2. Dans la matrice, saisissez la distance en mm à l'intersection des deux classes. Vide : la plus exigeante des deux classes.
3. Le routeur, le DRC, le remplissage des zones et les Gerber appliquent cette valeur. Elle ne peut que relever l'isolation, jamais l'abaisser.

### Je veux voir les écarts aux contraintes au DRC ou les exporter

1. Dans la fenêtre du gestionnaire, **✔ DRC** ferme la fenêtre et lance le contrôle ; chaque écart est listé (`Contrainte SPI_CS : longueur 45,00 mm, au-delà du maximum de 30,00 mm (classe Défaut)`).
2. **⬇ CSV** télécharge `<projet>-contraintes.csv` (`contraintes.csv` sans projet) : les nets, leurs contraintes et leurs mesures.
3. Un clic sur un nom de net ferme la fenêtre et sélectionne son routage.

### Je veux reprendre les contraintes saisies dans le schéma

1. Dans l'éditeur schématique, saisissez-les dans **Outils → Contraintes de nets…** (voir [02](02-editeur-schematique.md)).
2. Elles sont reprises à l'ouverture du gestionnaire (message `Contraintes du schéma reprises : …`), par la synchronisation Schéma ↔ PCB (ligne `⊞ CONTRAINTES`) et à l'export vers le PCB.
3. Un champ rempli dans le PCB passe devant celui du schéma ; un champ vide prend celui du schéma, puis celui de la classe. Les groupes du schéma (étiquette `schéma`) se modifient dans le schéma. Chaque reprise s'annule par `Ctrl+Z`.

### Je veux interdire une zone d'une face (boîtier, LED, pièce voisine)

1. **Placer → Zone interdite** (bouton `⊘`).
2. Cliquez un sommet après l'autre, ou deux coins opposés puis `Entrée` pour un rectangle ; revenez sur le premier point pour fermer. `Échap` abandonne. La face est celle que vous regardez (dessous si la vue est retournée ou si la couche active est la dernière).
3. La zone est sélectionnée : dans **Propriétés**, réglez **Nom**, **Face** (Dessus / Dessous) et **Hauteur permise (mm)**. Vide : aucun composant n'y est permis.
4. Lancez le **Contrôle DRC** : une patte traversante qui ressort sur la face de la zone, un composant posé dans la zone, ou un composant trop haut sont signalés.
5. Pour une limite sur toute la carte, sélectionnez le contour et renseignez **Hauteur max dessus (mm)** / **Hauteur max dessous (mm)**.

> [!NOTE]
> La hauteur d'un composant vient du dossier mécanique : valeur saisie dans la fenêtre Plans, sinon colonne « Maximun Height » de la LIB. Inconnue, elle est signalée à titre d'information et jamais supposée.

### Je veux poser un trou de fixation (NPTH) sur la carte

1. **Placer → Trou NPTH** (`○`), puis un clic à l'endroit voulu (accroché à la grille).
2. Dans **Propriétés**, réglez **Diamètre de perçage (mm)** (0,4 à 30) ou cliquez **M2 (2,2 mm)**, **M2.5 (2,7 mm)**, **M3 (3,2 mm)**, **M4 (4,2 mm)**.
3. Une **Longueur (mm)** supérieure au diamètre en fait une fente, avec son **Angle (°)** ; 0 ou moins que le diamètre : trou rond.
4. Réglez **X (mm)** / **Y (mm)**, cochez **Verrouiller la position** si besoin.
5. Le trou sort dans le fichier `*-NPTH.TXT` de l'Excellon, dans les plans et dans le dossier mécanique.

### Je veux dessiner de la sérigraphie

1. **Placer → Sérigraphie** ouvre un petit menu : **Trait (segment)**, **Rectangle (cadre)**, **Aplat plein (logo, bandeau)**, **Texte libre**. Au clavier, `Maj+S` entre dans le mode et passe à la forme suivante dans cet ordre : trait, rectangle, aplat, texte. `S` seul ramène à la sélection ; le bouton et le titre du menu affichent `Maj+S`.
2. Trait : cliquez-glissez (ou deux clics), `Maj` contraint à l'horizontale, la verticale ou 45°. Rectangle : deux coins. Aplat : un clic par sommet (retour sur le premier point pour fermer), ou deux coins puis `Entrée`. Texte : un clic, puis une boîte demande le texte (`TEXT` proposé).
3. Dans **Propriétés**, choisissez la couche (**F.SilkS** dessus, **B.SilkS** dessous), l'épaisseur de trait et, pour un texte, le texte, la hauteur de police et l'orientation.
4. Le contour du boîtier, le point de broche 1 et le repère de chaque composant sont imprimés d'office (case **Sérigraphie automatique** des propriétés du composant). Le contour est rogné autour des ouvertures du vernis : l'encre ne couvre pas les pastilles.
5. La sérigraphie part dans `.GTO` (dessus) et `.GBO` (dessous).

### Je veux estimer l'échauffement d'un composant qui dissipe

1. Sélectionnez le composant, saisissez **Puissance dissipée (W)** dans ses propriétés.
2. Cliquez **Estimer l'échauffement** (le serveur doit tourner : `python web_CAO.py`). La fiche affiche `≈ n K au-dessus de l'ambiante (… mm² de cuivre relié, … K/W)` : un ordre de grandeur, ±30 %.
3. Le DRC signale ensuite tout composant dont l'échauffement dépasse la limite, tant que la carte n'a pas été retouchée. Réglez la limite avec le contour sélectionné : **Échauffement max (K)** (40 par défaut).

### Je veux produire le dossier de fabrication

1. Par défaut, l'origine des fichiers est le coin inférieur gauche de la carte. Pour la prendre ailleurs : posez l'origine avec **Placer → Origine** (`O`), puis, dans **Outils → Règles…**, page **Dimensions et origine**, réglez **Repère des fichiers de fabrication** sur **origine utilisateur**.
2. Si le projet a des variantes de montage, choisissez-en une dans **Fichier → Variante de montage…** : les empreintes non montées sortent de `bom.csv` et `positions.csv`.
3. **Fichier → Fabrication .zip** ouvre la fenêtre **Dossier de fabrication** : cochez les familles de fichiers voulues (**Tout cocher** les rétablit), puis **Exporter le .zip**. Le choix est gardé avec la carte.
4. Le navigateur télécharge `<projet>-fabrication.zip` (`<projet>-fabrication-<variante>.zip` avec une variante). Ici et plus bas, `<projet>` est le nom du document PCB, c'est-à-dire le nom du projet suivi de `-PCB` (« carte PIR-PCB ») ; sans projet ouvert, le zip s'appelle `fabrication.zip` et les fichiers qu'il contient commencent par `carte` (`carte.GTL`, `carte-PLANS.pdf`…). La barre d'état donne le nombre de fichiers, de trous, d'outils de perçage et d'empreintes, et, avec une variante, son nom et le nombre de composants non montés.
5. Le `LISEZ-MOI.txt` du zip décrit les fichiers de perçage, le contour, la netlist de test, les fichiers d'assemblage, la variante, liste les fichiers du zip puis les règles de la carte (voir « LISEZ-MOI.txt : contenu »).

### Je veux commander la carte montée chez JLCPCB

1. **Fichier → PCBA JLCPCB .zip**.
2. Le zip `<projet>-PCBA-JLCPCB.zip` (`PCBA-JLCPCB.zip` sans projet) contient `<projet>-gerber.zip` (Gerber et perçage), `<projet>-BOM-JLCPCB.csv`, `<projet>-CPL-JLCPCB.csv` et `LISEZ-MOI-JLCPCB.txt`. Avec une variante active, le nom du zip et des trois premiers fichiers prend le suffixe `-<variante>` (`<projet>-PCBA-JLCPCB-<variante>.zip`).
3. Le code LCSC de chaque pièce vient du schéma (champ `lcsc`, ou « vendor reference » de la LIB). Les lignes de BOM sans code sont listées dans le `LISEZ-MOI-JLCPCB.txt` : JLCPCB ne les posera pas.
4. Suivez les quatre étapes du `LISEZ-MOI-JLCPCB.txt` sur jlcpcb.com et vérifiez l'orientation de chaque pièce dans l'aperçu de placement.

### Je veux exporter toute la carte en IPC-2581

1. **Fichier → IPC-2581 .xml** télécharge `<projet>.xml` (`carte.xml` sans projet), révision C.
2. Le même fichier est dans **Fabrication .zip** (famille **Carte complète IPC-2581 (.xml)**).
3. Il peut être rouvert dans la [visionneuse IPC-2581](07-visionneuse-ipc2581.md) : classes et paires sont retrouvées sans reclassement.

### Je veux produire les plans de fabrication et d'assemblage (Draftsman)

1. **Fichier → Plans (Draftsman)…** ouvre une fenêtre à deux volets : réglages à gauche, feuille à droite.
2. Dans **Feuilles**, cochez celles à produire (le plan de fabrication, les deux assemblages et la nomenclature sont cochés par défaut). La feuille « face dessous » n'est produite que si une empreinte est posée dessous ; les feuilles « vernis » et « pâte » comptent une feuille par face (une seule sur une carte à une couche).
3. Choisissez le **Format** (A4, A3 ou A2 paysage) et le **Cartouche** ; **▭ Cartouche…** ouvre la saisie société, titre, noms et dates. Le cartouche « Mon cartouche » est choisi d'office dès que votre profil porte un nom de société, le cartouche standard sinon.
4. Ajoutez des **Notes ajoutées au plan de fabrication** (une par ligne) : elles sont numérotées à la suite des notes tirées de la carte.
5. Parcourez les feuilles par les onglets (le numéro et le titre de chaque feuille y figurent) ; **+**, **−** et le pourcentage règlent le zoom (le pourcentage ramène à la page entière).
6. **⬇ Exporter PDF** télécharge `<projet>-PLANS.pdf` (`plans.pdf` sans projet) : une page par feuille, au format choisi, avec un signet par feuille. Le même fichier part dans **Fabrication .zip**. Sans feuille cochée, rien n'est exporté (« Aucune feuille choisie : rien à exporter. ») et le zip part sans plans.

### Je veux retrouver un repère, une valeur ou un net dans les plans

1. Dans la fenêtre Plans, saisissez dans **Chercher : repère, valeur, net, référence…**.
2. La liste **Résultats** dit ce qui a été trouvé et où (`catégorie · lieu · f. n`, par exemple `net · U1 · broche 5 · f. 2` ; la catégorie est repère, valeur, boîtier, réf. fabricant, fabricant, description, net, nomenclature, perçage, empilage, note, cartouche, titre, tableau, légende, cote, non monté, symbole, zone, impédance, détail ou mesure) ; les onglets comptent les résultats par feuille ; l'aperçu surligne les endroits.
3. `Entrée` passe au résultat suivant, `Maj+Entrée` au précédent. La recherche ignore la casse et les accents.
4. Dans le PDF exporté, `Ctrl+F` d'un lecteur trouve les mêmes textes, y compris ce qui est posé en texte invisible : sur chaque composant des feuilles d'assemblage, sa valeur, son boîtier, sa référence fabricant, son fabricant et sa description ; sur chaque pastille de ces feuilles, son net ; sur les feuilles de cuivre, le nom de chaque net (sur sa plus longue piste et sur chaque zone) ; sur la feuille PTST, le net de chaque point de test. Le PDF a aussi un signet par feuille et, sous chaque assemblage, un signet par composant (`U1 — STM32 (NM)` pour un non-monté).

### Je veux coter un plan et fixer des tolérances

1. Dans la fenêtre Plans, utilisez la barre d'outils au-dessus de la feuille : **Cote horizontale**, **verticale**, **alignée** (deux points accrochés, puis la ligne), **Diamètre**, **Rayon**, **Cote angulaire**, **Cotes en chaîne**, **Cotes d'ordonnée**.
2. Les points s'aimantent (à 9 pixels d'écran près) sur les trous de fixation, trous d'empreinte, vias, centre et bords (gauche, droit, haut, bas) des pastilles, et sommets ou bords du contour et des découpes ; le nom du point visé s'affiche sous la souris. Une cote est enregistrée par référence : elle suit le composant déplacé ; si sa référence disparaît, elle devient rouge, en tirets, `(orpheline)`.
3. Double-clic sur une cote (outil **Sélection**) : le volet de gauche montre sa **Tolérance** (**± symétrique**, **+ / − écarts**, **limites max / min**, **( ) de référence**, **▭ théoriquement exacte**).
4. Pour une chaîne ou une ordonnée, la liste **Valeur** règle la tolérance commune ou celle d'un seul point.
5. `Suppr` (ou `Retour arrière`) efface la cote choisie ; `Échap` défait le geste en cours puis rend l'outil de sélection.
6. Une cote s'écrit sans unité, avec la virgule et deux décimales (`12,34`), `Ø` ou `R` devant un diamètre ou un rayon, une décimale et `°` pour un angle (`45,0°`). Les cotes hors tout du plan de fabrication, elles, s'écrivent avec l'unité (`100,00 mm`). La ligne d'une cote en chaîne ou d'ordonnée se place au clic suivant hors accroche, ou avec `Entrée` à la position de la souris.

### Je veux agrandir une zone (vue de détail) ou déplacer une vue

1. Outil **Détail circulaire** (centre puis rayon) ou **Détail rectangulaire** (deux coins) sur une vue de la carte ; l'échelle se choisit dans la liste à côté (2:1 à 20:1, 5:1 au départ). Une zone de moins de 0,2 mm est refusée (« Zone trop petite. »). Un détail agrandit une vue de la carte, jamais un autre détail ; 52 détails au plus.
2. Le détail se pose à la première place libre ; glissez-le comme les autres vues. Les cotes s'y posent aussi. La vue mère porte un cercle (ou un cadre) et une lettre (A, B…) ; le détail s'intitule « DÉTAIL A — ÉCHELLE 5:1 ». Sur le plan de fabrication, les pastilles et les trous à leur vraie taille s'y ajoutent.
3. Choisi avec l'outil **Sélection**, la liste **Feuille du détail** le place sur une autre feuille (renvois « FEUILLE n » sous la lettre de la vue mère et « — VOIR FEUILLE n » dans le titre du détail).
4. Pour déplacer une vue (carte, tableau de perçage, coupe, notes…), glissez-la : les vues recouvertes s'écartent, un aperçu orange montre le résultat avant de lâcher. **Replacer automatiquement** rend la disposition calculée.

### Je veux exporter la carte en DXF pour la mécanique

1. Dans la fenêtre Plans, **⬇ DXF carte 1:1** télécharge `<projet>-CARTE.dxf` : la carte seule, en millimètres, dans le repère des Gerber.
2. **⬇ DXF feuille** exporte la feuille affichée (`<projet>-PLAN-<n>.dxf`).
3. Les deux DXF sont aussi dans **Fabrication .zip** (famille **DXF pour la mécanique**) ; le zip prend `-CARTE.dxf` et `-PLAN-FABRICATION.dxf`.
4. Chaque outil de perçage a son calque avec un `POINT` au centre de chaque trou (`TROUS_PTH_0_80`, `TROUS_NPTH_3_20`, `VIAS_0_30`…).

### Je veux donner à un mécanicien ce qu'il faut pour dessiner le boîtier

1. Dans la fenêtre Plans, cochez **Plan mécanique**.
2. Un tableau **Dossier méca : hauteurs (mm) et ouvertures** apparaît sous les réglages : saisissez la hauteur des composants qui n'en ont pas (la valeur retenue et sa source sont en grisé), cochez ou décochez **Ouv.** pour une ouverture dans le boîtier.
3. **⬇ Dossier méca .zip** télécharge `<projet>-MECA.zip` (`meca.zip` sans projet) : `<projet>-PLAN-MECA.pdf`, `<projet>-MECA.json` et `<projet>-MECA.dxf` (`carte-…` sans projet). Le PDF est celui du plan mécanique seul, indépendamment des feuilles cochées.
4. Le JSON (format `web_cao-meca-1`) est conçu pour un script ou une IA ; il est décrit dans [SPEC-dossier-meca.md](../../SPEC-dossier-meca.md).

### Je veux faire mesurer des points de la carte à un technicien (fiche de mesure)

1. Fenêtre Plans, bloc **Fiche de mesure (technicien)**.
2. Renseignez **Sonde + (couleur)** (`U3.12`, `TP2`, ou un net : `GND`) et **Sonde − (noire)** (`C6.2`) ; ou cliquez des pastilles sur la feuille de mesure avec l'outil Sélection (la sonde active se remplit, puis l'autre).
3. Choisissez **Mesure** (Tension DC, Résistance, Continuité, Oscilloscope), puis **Attendu** (`3,3 V`), **Tolérance** (`± 5 %`), **Échelle des détails** (auto ou 2:1 à 10:1) et **Note pour le technicien**.
4. **+ Ajouter la mesure** (ou `Entrée` dans un champ). La feuille « fiche de mesure » est cochée d'office et affichée ; chaque mesure se supprime par **✕**.
5. La feuille montre la carte (et la face dessous, en miroir, si un point y est), cercle sur la carte chaque détail agrandi (lettre A, B…), relie les deux points de chaque mesure par un trait en tirets (quand ils sont sur la même face) et une bulle numérotée, et agrandit chaque point dans un détail avec la sonde « + » (couleur de la mesure) ou « − » (noire). En bas, un tableau (N°, Sonde +, Sonde −, Mesure, Attendu, Tol., Détails, Note) et trois consignes ; la consigne « d'abord hors tension (résistance, continuité), puis sous tension » n'est ajoutée que si la feuille mêle ohms et volts. Au-delà de quatre mesures, la feuille continue sur une feuille « (suite) ».

### Je veux joindre au dossier de fabrication une animation 3D de la carte

1. **Fichier → Animation 3D dans le .zip** est une bascule (bouton allumé = actif). Elle est éteinte à chaque ouverture de l'éditeur.
2. Lancez **Fichier → Fabrication .zip**, puis **Exporter le .zip**. Une animation joue dans un voile (une vingtaine de secondes, en temps réel) : gardez l'onglet au premier plan.
3. Le dossier contient en plus `<projet>-ASSEMBLAGE-3D.html` (page autonome, orientable à la souris) et `<projet>-ASSEMBLAGE-3D.mp4` ou `.webm` (vidéo 1280 × 720).
4. Les composants dont la LIB a un « Modèle 3D » (STEP) sont dessinés avec ce modèle ; les autres sont des pavés à la hauteur du dossier mécanique.
5. Un modèle mal posé se corrige dans la LIB, colonne « Position 3D » (voir [05](05-gestion-lib.md)).

### Je veux exporter une image de la carte

1. **Fichier → Exporter .png** : image de la vue courante (couches visibles, orientation courante) à 12 px/mm, avec le cartouche si la page en a un.
2. Le fichier est `<projet>.png` (`carte.png` sans projet).

## Référence

### Menu Fichier : exports

| Bouton ou menu | Raccourci | Effet | Limites |
|---|---|---|---|
| Exporter .png | | Télécharge la vue courante en PNG, couches visibles, orientation courante. | « Export impossible : image trop grande. » si le canevas est trop grand. |
| Fabrication .zip | | Ouvre la fenêtre **Dossier de fabrication** puis télécharge le zip. | Refusé sur une carte sans empreinte ni piste (« Rien à fabriquer : la carte est vide. »). Pendant l'enregistrement de l'animation 3D, le dossier part à la fin. |
| PCBA JLCPCB .zip | | Dossier JLCPCB : archive Gerber, BOM, CPL, LISEZ-MOI. | Carte vide refusée. Ne prend que cuivre, vernis, pâte, sérigraphie, contour (`.GM1`) et perçage. |
| Animation 3D dans le .zip | | Bascule : ajoute au Fabrication .zip la page HTML et la vidéo de l'assemblage 3D. | Éteinte à chaque ouverture. Enregistrement en temps réel ; sans `MediaRecorder` la page part seule. Un second Fabrication .zip pendant l'enregistrement ne relance rien. |
| IPC-2581 .xml | | Écrit toute la carte en un fichier XML IPC-2581, révision C. | Carte vide refusée. La stratégie de remplissage des zones ne part pas (seul le résultat). |
| Plans (Draftsman)… | | Ouvre la fenêtre des plans. | Voir « Fenêtre Plans ». |
| Variante de montage… | | Choisit la variante active : ses empreintes non montées sont barrées sur la carte et retirées de `bom.csv`, `positions.csv` et des fichiers JLCPCB. Choix : **Carte complète** (aucune variante) ou une variante du schéma ; boutons **⟳ Reprendre du schéma**, **Fermer**. | Les variantes se créent dans le schéma (Fichier → Variantes de montage…). Le cuivre ne change pas : les pastilles restent gravées. |

### Menu Placer : zones et mécanique

| Bouton ou menu | Raccourci | Effet | Limites |
|---|---|---|---|
| Zone interdite | | Mode de tracé d'un polygone interdit sur la face regardée. | Pas de raccourci clavier. Un clic par sommet, ou deux coins puis `Entrée` ; rectangle de moins de 0,05 mm de côté : « Rectangle trop fin : zone interdite abandonnée. » |
| Trou NPTH | | Pose un trou mécanique non métallisé autonome, hors empreinte. | Pas de raccourci clavier. Diamètre posé : dernier diamètre utilisé, 3,2 mm au départ. Un trou d'empreinte se pose depuis la LIB, pas ici. |
| Sérigraphie | `Maj+S` | Ouvre le menu des formes de sérigraphie et passe en mode sérigraphie. | Voir « Menu Sérigraphie ». `S` seul revient à la sélection ; `Maj+S` passe d'une forme à la suivante. |
| Origine | `O` | Pose l'origine utilisateur, un clic (une pastille proche l'attire, sinon accrochée à la grille), puis revient à la sélection. | Les fichiers de fabrication ne la prennent que si **Outils → Règles… → Dimensions et origine → Repère des fichiers de fabrication** vaut **origine utilisateur** (par défaut : **coin de la carte**). Le bouton **Remettre à zéro** de la même page ramène l'origine en (0 ; 0) ; **Placer l'origine** y refait le geste. Voir [03](03-editeur-pcb-edition-routage.md). |
| Serpentin | `M` | Pose un serpentin d'appariement ; la flèche ▾ règle amplitude, pas et allongement forcé. | Cible : ce qui manque au net dans son groupe d'appariement. |

#### Menu Sérigraphie

| Bouton | Raccourci | Effet | Limites |
|---|---|---|---|
| ─ Trait (segment) | | Trace un segment sur F.SilkS ou B.SilkS (la face regardée). | Cliquer-glisser ou deux clics ; `Maj` contraint à l'horizontale, la verticale, 45°. |
| ▢ Rectangle (cadre) | | Trace un cadre rectangulaire. | Deux coins. |
| ▰ Aplat plein (logo, bandeau) | | Polygone plein (région Gerber). | Un clic par sommet, ou deux coins puis `Entrée` ; `Maj` : 45°/90° ; `Échap` abandonne. |
| T Texte libre | | Pose un texte vectoriel. | Un clic, puis une boîte de saisie (`TEXT` proposé) ; hauteur 1,5 mm et trait 0,15 mm au départ. |

### Outils → Gestionnaire de contraintes… : fenêtre

| Bouton ou champ | Raccourci | Effet | Limites |
|---|---|---|---|
| Gestionnaire de contraintes… (menu Outils) | | Ouvre la fenêtre, reprend d'abord les contraintes du schéma. | Pas de raccourci clavier. |
| Résumé (en-tête) | | Compte les nets tenus / en faute. | |
| ⬇ CSV | | Exporte `<projet>-contraintes.csv` (séparateur `;`, UTF-8 avec BOM). | Contenu : nets, contraintes, mesures, forme, moignons, contre-perçage, état, écarts. |
| ✔ DRC | | Ferme la fenêtre et lance le contrôle DRC. | |
| ✕ | `Échap` | Ferme la fenêtre. | Un clic hors de la boîte ferme aussi. |
| Onglets | | **Nets**, **Classes**, **Paires diff.**, **Groupes d'appariement**, **Topologie et moignons**, **Isolation entre classes**. | |
| Champ numérique | `Entrée` | Valide la saisie (le champ perd le focus). | Vide : le net revient à sa classe. La virgule vaut un point. Chaque modification est une étape `Ctrl+Z`. |

#### Onglet Nets

| Colonne ou commande | Effet | Limites |
|---|---|---|
| ✓ (en-tête) | Coche ou décoche les nets affichés. | |
| État | Pastille : ● rouge « contrainte non tenue », ● verte « contraintes tenues », ○ « non routé », · « aucune contrainte ». | |
| Net | Nom (clic : ferme la fenêtre et sélectionne le routage). Étiquettes : nom de la paire différentielle, `sch` (contraintes du schéma). | |
| Classe | Liste : classe du net (modifiable). | |
| Long. mm, Délai ps, Vias, Z₀ Ω | Longueur du cuivre routé, délai (vias compris), nombre de vias, impédance calculée (plage `min–max`). | Z₀ : formules de ligne (Hammerstad, Wheeler, IPC-2141A) sur l'empilage ; `—` sans plan de référence. Audit complet : Simulation EM. |
| Z cible Ω, Tol. % | Impédance exigée du net et sa tolérance (10 % par défaut). | Vide : celle du schéma, puis de la classe. |
| L min, L max | Longueurs minimale et maximale en mm. | |
| Vias max | Nombre maximal de vias. | |
| Couches | Couches permises : `1,4` ou `L1 L4`. | Vide : toutes. |
| Groupes | Groupes d'appariement auxquels le net appartient. | Lecture seule. |
| Écarts | Messages d'écart (contraintes et groupes). | |
| Filtrer : net ou classe | Filtre la liste (sans accents ni casse). | 1500 nets au plus affichés : « … n net(s) de plus : filtrez. » |
| en faute seulement | Ne garde que les nets en faute. | |
| n coché(s) → classe | Rattache les nets cochés à la classe choisie. | |
| groupe | Ajoute les nets cochés au groupe choisi. | N'apparaît que s'il existe un groupe du PCB. |

#### Onglet Classes

| Colonne ou commande | Effet | Limites |
|---|---|---|
| Règles… | Ferme la fenêtre et ouvre la fenêtre des règles (onglet des classes). | Voir [03](03-editeur-pcb-edition-routage.md). |
| Classe, Nets | Nom de la classe et nombre de nets qu'elle porte. | |
| Largeur | Largeur de piste générale, mm. | Nombre positif, 50 mm au plus. Partagé avec la fenêtre des règles. |
| Par couche | Largeur propre à chaque couche de signal. | 0,05 à 50 mm ; vide : largeur de la classe. |
| Isolation | Isolation de la classe, mm. | Partagé avec la fenêtre des règles. |
| Via Ø, Perçage | Diamètre de via et perçage, mm. | Le perçage est ramené sous le diamètre si besoin. |
| Z cible Ω, Tol. % | Impédance cible de la classe et tolérance. | |
| L min, L max, Vias max, Couches | Contraintes électriques de la classe. | |
| Largeur pour Z cible | Boutons `L1 0,120`… et **→ toutes** : posent la largeur qui donne la Z cible. | Couches de signal seulement ; `L3 —` si pas de plan de référence ou cible hors d'atteinte. |

#### Onglet Paires diff.

| Colonne ou commande | Effet | Limites |
|---|---|---|
| Règles de paire… | Ferme la fenêtre et ouvre la fenêtre des règles (paires). | Largeur, écart et longueur découplée se règlent là. |
| État, Paire, P, N, Règle | Identité et règle de chaque paire. | Message « Aucune paire différentielle sur cette carte. » s'il n'y en a pas. |
| Long. P, Long. N | Longueurs de chaque brin. | |
| Écart mm, Écart ps | Différence de longueur entre brins, en mm et en ps. | Faute au-delà de 0,5 mm. |
| Découplé mm, Admis | Longueur découplée mesurée et admise par la règle. | |
| Largeur, Écart | Plage de largeur de piste (min – max) et plage d'écart entre brins (min – max) admises par la règle de la paire, en mm. | Lecture seule : ce sont les bornes de la règle, pas un verdict. Le verdict est la pastille d'**État** (faute si découplé > admis, ou écart de longueur > 0,5 mm). |

#### Onglet Groupes d'appariement

| Commande | Effet | Limites |
|---|---|---|
| Nom du groupe, en longueur (mm) / en délai (ps), ± tolérance, référence | Réglage d'un groupe existant. Référence : « le plus long » ou un net. | Une tolérance vide ou illisible est ignorée. |
| 🗑 | Supprime le groupe. | |
| Tableau État, Net, Long. mm, Délai ps, Écart, À ajouter (mm) | Mesure de chaque membre ; `réf.` marque la référence, `absent` un net absent de la carte. | « À ajouter » : longueur que le serpentin propose. En délai, convertie avec le retard par mm du net. |
| × | Retire le net du groupe. | |
| Nouveau groupe : Nom, mode, tolérance | Création d'un groupe. | Nom vide : « Groupe n ». Tolérance : saisissez-la (grisé 0,5) ; vide, elle vaut 0 depuis cette fenêtre, alors que 0,5 mm ou 10 ps sont les valeurs prévues par le code. |
| Depuis la sélection | Coche les nets des pistes sélectionnées sur la carte. | « Sélectionnez des pistes sur la carte : leurs nets cocheront la liste. » |
| Filtrer les nets (ex. DQ) | Filtre la liste des nets à cocher. | 600 nets au plus affichés. |
| Créer le groupe (n) | Crée le groupe avec les n nets cochés. | Deux nets au moins. |
| Groupes du schéma | Affichés avec l'étiquette `schéma`. | Non modifiables ici. |

#### Onglet Topologie et moignons

| Colonne ou commande | Effet | Limites |
|---|---|---|
| Classe : Topologie, Moignon max mm, Moignon de via max mm, Tol. étoile mm, Contre-perçage | Règle appliquée à tous les nets de la classe. | Valeurs de topologie : point à point, chaîne, étoile, fly-by. Contre-perçage : une règle de l'empilage physique, **aucun**, ou vide (hérite). |
| Net : État, Net, Classe | Identification. | 600 nets au plus affichés. |
| Forme du cuivre, Broches, Ordre le long du cuivre | Ce qui est lu sur le cuivre (point à point, chaîne, chaîne à dérivations courtes, étoile, arbre, maillé, incomplet, plan). | Un net portant une zone de cuivre (plan) n'est pas jugé. |
| Moignon max mesuré, Moignon via mesuré | Plus longue dérivation, plus long moignon de via. | |
| Topologie, Ordre imposé, Moignon max, Via max, Tol. étoile, Contre-perçage | Exigences propres au net. | Ordre imposé : repères séparés par des virgules, le premier est la source. |
| Écarts | Raisons du refus. | Moignon par défaut d'une chaîne : 1 mm ; tolérance d'étoile par défaut : 1 mm. |

Contraintes contrôlées par topologie :

| Contrainte | Ce qui est contrôlé |
|---|---|
| Point à point | Deux broches exactement, un seul chemin. |
| Chaîne | Pas d'étoile ni de boucle ; aucune dérivation au-delà du moignon admis ; l'ordre imposé, dans un sens ou dans l'autre. |
| Étoile | Un centre ; branches de même longueur à la tolérance près, sauf celle de la source. |
| Fly-by | Une chaîne, terminée au bout opposé à la source par une résistance `R…` ou le dernier repère de l'ordre. |
| Moignon max | Chaque dérivation et chaque bout libre ; 0 interdit tout moignon. |
| Moignon de via max | Chaque via du net, contre-perçage déduit. |

#### Onglet Isolation entre classes

| Élément | Effet | Limites |
|---|---|---|
| Matrice classe × classe | Isolation minimale entre deux classes, en mm ; vide : la plus exigeante des deux. | Moitié supérieure seule. S'ajoute aux classes et à la matrice des natures de cuivre. Les deux nets d'une paire différentielle gardent leur écart. |

### Propriétés : zone interdite, trou NPTH, sérigraphie, contour, composant

| Panneau (objet) | Champ ou bouton | Effet | Limites |
|---|---|---|---|
| Zone interdite | Nom | Nom affiché sur la carte. | 60 caractères. |
| | Face | Dessus ou Dessous. | |
| | Hauteur permise (mm) | Hauteur maximale d'un composant dans la zone. | Vide : aucun composant. 100 mm au plus. |
| | Emprise, Sommets | Lecture seule. | |
| | Supprimer la zone / `Suppr` | Retire la zone. | Un sommet se glisse pour le déplacer. Une zone se prend par son bord. |
| Trou NPTH | Diamètre de perçage (mm) | Diamètre du trou fini. | 0,4 à 30. |
| | M2 (2,2 mm), M2.5 (2,7 mm), M3 (3,2 mm), M4 (4,2 mm) | Préréglages de diamètre. | |
| | Longueur (mm), Angle (°) | Fente : longueur hors tout et orientation. | Longueur 0 à 60 ; 0 ou ≤ diamètre : trou rond. |
| | X (mm), Y (mm) | Position. | |
| | Verrouiller la position | Empêche le déplacement. | |
| | Supprimer le trou NPTH | Retire le trou. | |
| Sérigraphie (trait, rectangle) | Forme, Couche sérigraphie, Épaisseur de trait | Change la forme (trait, rectangle, texte), la couche (F.SilkS / B.SilkS) et l'épaisseur. | Épaisseurs : 0,10 (Fine), 0,15 (Standard KiCad), 0,20, 0,25, 0,30 (Épaisse), 0,50 mm. |
| | X1, Y1, X2, Y2 | Coordonnées en mm. | |
| | Supprimer le trait / le rectangle | | |
| Sérigraphie (texte) | Texte de sérigraphie, Couche, Hauteur de police (mm), Épaisseur de trait (mm), Orientation / Rotation, X, Y | Réglage du texte. | Hauteur 0,5 à 25 mm ; trait 0,05 à 5 mm ; rotation 0, 90, 180, 270°. |
| Sérigraphie (aplat) | Couche sérigraphie, Largeur, Hauteur, Sommets, Trous, Supprimer l'aplat | Lecture seule sauf la couche et la suppression. | `R` fait tourner l'aplat avec la sélection. |
| Contour de carte (sélectionné) | Hauteur max dessus (mm), Hauteur max dessous (mm) | Hauteur au-delà de laquelle le DRC signale un composant. | Vide : pas de limite. 100 mm au plus. |
| | Échauffement max (K) | Seuil du DRC pour l'échauffement estimé. | 40 par défaut ; 1 à 500. |
| | Disque | Contour rond inscrit dans la largeur et la hauteur actuelles. | Écrit en arcs dans Gerber, DXF et IPC-2581. |
| Composant | Sérigraphie automatique | Contour du boîtier, point de broche 1 et repère imprimés d'office. | À décocher quand l'empreinte dessine sa sérigraphie à part. |
| | Puissance dissipée (W) | Puissance que dissipe le composant. | 100 W au plus ; vide : supprimée. |
| | Estimer l'échauffement | Lance l'estimation sur le serveur. | Désactivé sans puissance. Erreurs : « Aucun composant ne dissipe… », « Estimation thermique refusée… ». |

Messages de contrôle ajoutés au DRC par ce chapitre :

| Origine | Message type |
|---|---|
| Contraintes de net | `Contrainte <net> : longueur … mm, au-delà du maximum de … mm (classe …)`, `… en deçà du minimum`, `… via(s) pour … admis`, `routé sur …, hors des couches permises`, `Z₀ … Ω, hors de … Ω ± … %`, impédance non calculable (information). |
| Groupes | `Groupe <nom> : <net> à +… mm de <réf>, tolérance ± … mm`, `Groupe <nom> : … absent(s) de la carte`. |
| Zones interdites | `Patte traversante U1.3 : elle ressort sur le dessous dans « … »`, `<ref> (dessus) dans « … » : aucun composant n'y est permis`, `<ref> trop haut dans « … » : h mm pour h mm permis`, hauteur inconnue (information). |
| Hauteur de carte | `<ref> (dessus) trop haut : … mm pour … mm permis sur la carte`. |
| Thermique | `<ref> : échauffement estimé … K pour … W (limite … K)` ; information si l'estimation date d'avant la dernière retouche. |

### Fenêtre « Dossier de fabrication » (Fichier → Fabrication .zip)

| Case ou bouton | Fichiers concernés | Limites |
|---|---|---|
| Cuivre (Gerber .GTL, .GBL, couches internes) | `<projet>.GTL`, `.GBL`, `.GL2`… | |
| Vernis épargne (.GTS, .GBS) | Ouvertures de masque. | `.GBS` si plus d'une couche. |
| Pâte à braser (.GTP, .GBP) | Pochoir. | Pastilles brasées en surface seulement, jamais un trou métallisé. |
| Sérigraphie (.GTO, .GBO) | Légende. | |
| Contour de découpe (.GM1, .GKO) | `.GM1` = profil de découpe (fait foi pour l'usinage), `.GKO` = keep-out, même géométrie. | |
| Perçage (Excellon, contre-perçage) | `<projet>-<a>-<b>.TXT` par portée, `<projet>-NPTH.TXT`, `<projet>-BACKDRILL-….DRL` et `.gbr` (Gerber X2). | Couches numérotées à partir de 1 ; trous oblongs en G85. |
| Netlist de test (.ipc) | IPC-D-356, pour le test électrique. | Pastilles et vias sans net non testés. |
| Carte complète IPC-2581 (.xml) | `<projet>.xml`. | |
| Plans Draftsman (PDF) | `<projet>-PLANS.pdf`. | Absent du zip si aucune feuille n'est cochée dans la fenêtre Plans. |
| DXF pour la mécanique | `-CARTE.dxf`, `-PLAN-FABRICATION.dxf`. | Le second seulement si la feuille de fabrication est cochée (suites comprises, côte à côte dans un même dessin). |
| Master Drawing (PDF) | `<projet>-MASTER-DRAWING.pdf`. | Annonce les fichiers du zip (voir « Master Drawing »). |
| Empilage (EMPILAGE.txt) | Coupe complète, symétrie, rapport d'aspect, laminage, contre-perçage. | |
| Positions de placement (positions.csv) | `Designator,Value,Package,X,Y,Rotation,Side`. | Rotation horaire de 0 à 360, même origine que les Gerber, variante active respectée. |
| Nomenclature (bom.csv) | `Reference,Value,Package`, puis récapitulatif `Qty,Value,Package,References`. | Variante active respectée. |
| LISEZ-MOI.txt | Légende des fichiers de perçage, contour, netlist, assemblage, variante, liste des fichiers du zip, règles de la carte. | Voir « LISEZ-MOI.txt : contenu ». Écrit en dernier : il liste tous les autres fichiers, pas lui-même. |
| Tout cocher | Coche toutes les familles. | |
| Annuler | Ferme sans exporter. | Un clic hors de la boîte ferme aussi. |
| Exporter le .zip | Télécharge `<projet>-fabrication.zip`. | « Cochez au moins un fichier. » si tout est décoché. |

Conventions des fichiers : Gerber RS-274X en millimètres, format 4.6, polarité positive ; zones à dégagements en polarité négative (LPC). Excellon métrique. Origine : celle posée par l'utilisateur, sinon le coin inférieur gauche de la carte. Les libellés des fichiers texte (`LISEZ-MOI.txt`, `EMPILAGE.txt`) sont écrits sans accents, en UTF-8 sans BOM (seuls les `.csv` portent un BOM) ; ce que vous avez saisi (noms de projet, de classe, de variante, de couche, de net) y passe tel quel.

#### LISEZ-MOI.txt : contenu

Le fichier est écrit sans accents, dans cet ordre :

1. Titre « Editeur PCB — dossier de fabrication » et la date et l'heure de l'export (format français).
2. La carte : dimensions (`L x l mm`), « rectangle » ou « contour libre, n sommets », nombre de découpes intérieures, nombre de couches de cuivre ; l'empilage (épaisseur totale, finition, renvoi à `EMPILAGE.txt`) ; l'origine des coordonnées (« origine utilisateur (les coordonnees peuvent etre negatives) » ou « coin inferieur gauche de la carte »).
3. Les conventions : « Gerber RS-274X, millimetres, format 4.6, polarite positive. » et « Percage Excellon metrique, trous metallises. ».
4. La légende des fichiers de perçage, une ligne par fichier : nature (traversant, borgne, enterré, ou non métallisé NPTH), portée `L<a>-L<b>`, nombre de trous et d'outils ; pour un contre-perçage, la couche d'où l'on repasse, la couche à ne pas couper, la profondeur de chaque outil, et la ligne du `.gbr` jumeau. Dès qu'il y a un contre-perçage, une dizaine de lignes expliquent pourquoi le Gerber X2 porte la profondeur et la couche gardée en attributs utilisateur (`BackDrill_StartLayer`, `BackDrill_MustNotCutLayer`, `BackDrill_MaxStubLengthMM`, `BackDrill_DepthMM`).
5. Le contour : le `.GM1` (Mechanical Layer 1, attribut `Profile,NP`) est le profil de découpe et fait foi pour l'usinage ; le `.GKO` reprend la même géométrie en keep-out. Puis la netlist IPC-D-356 et son utilité pour le test électrique.
6. Un paragraphe par fichier optionnel présent dans le zip : IPC-2581 (révision C, les Gerber et l'Excellon font foi en cas de désaccord), DXF (`-CARTE.dxf` à 1:1 dans le repère des Gerber, `-PLAN-FABRICATION.dxf`, calques d'outils de perçage avec un `POINT` par trou), animation 3D (HTML et vidéo, « illustration seulement : elle ne fait pas foi »).
7. `positions.csv` et `bom.csv` : millimètres, rotation en degrés dans le sens horaire (convention JLCPCB), de 0 à 360, même origine que les Gerber ; ils ne concernent pas le fabricant du circuit nu.
8. La variante de montage (« carte complete (tout est monte) » sans variante) et, s'il y en a, la liste des composants NON MONTÉS (DNP), absents de `bom.csv` et `positions.csv`, dont les pastilles restent gravées.
9. « Fichiers : » la liste de tous les fichiers du zip, sauf lui-même.
10. « Regles : » une ligne par classe (piste, isolation, via/perçage, en mm), la dilatation du masque, le retrait de la pâte, le traitement des vias, le nombre d'outils et de trous de perçage ; puis une phrase sur la polarité négative (LPC) des dégagements de zones.

Chaque paragraphe n'est écrit que si son fichier est dans le zip (la légende des perçages avec la famille **Perçage**, le contour avec **Contour**, la netlist avec **Netlist de test**, le renvoi à `EMPILAGE.txt`, `positions.csv` et `bom.csv` chacun avec sa case, les lignes Gerber et LPC s'il reste un Gerber), et sous le vrai nom du fichier (`<projet>.GM1`, `<projet>.ipc`… ; `carte.GM1` sans projet).

### Master Drawing (`<projet>-MASTER-DRAWING.pdf`)

| Page | Contenu |
|---|---|
| Page 1, titre « Printed Circuit Board (PCB) Master Drawing » | **Document information** : numéro (`<projet>-MASTER-DRAWING`), date du jour (`YYYY-MM-DD`), révision. **Fabrication notes** : IPC Performance Class 2, RoHS 3. **PCB details** : nombre de couches, carte rectangulaire ou « Freeform: n points », longueur × largeur (mm), épaisseur finie (±10 %), cuivre de base et cuivre final (95 % du cuivre de base, extérieur et, au-delà de 2 couches, intérieur), couleur du vernis, classe IPC 2, RoHS, sans plomb, UL94 V-0, CTI ≥ 100 V. **Material details** : matériau du premier diélectrique, Tg minimale de l'empilage, matériaux agréés. **Pattern** : largeur de piste minimale (la plus petite des classes et des pistes posées) et isolation minimale (la plus petite des classes), perçage minimal, anneau minimal (avec un petit schéma si la place le permet), types de trous et de vias, protection des vias (IPC-4761). **Surface details** : finition, nickel, or, classe de finition. |
| Page 2 | **Solder mask (IPC-SM-840)** (couleur, ouvertures 1:1, pont minimal 100 µm), **Silk screen** (couleur), **Electrical test** (100 % E-TEST, netlist `<projet>.ipc`), **Surface examination** (IPC-A-600H classe 2), **General notes** (6 notes, dont le `.GM1` qui définit le profil de découpe). |
| Page 3, « Files included in data package » | Tableau **Included / Filename / Description** : Gerber présents dans le zip, fichiers de perçage (nature, portée, contre-perçage et son `.gbr` juste dessous), netlist `.ipc`, IPC-2581, `positions.csv`, `bom.csv`, `EMPILAGE.txt` (la netlist et ces trois-là toujours listés, marqués `X` seulement s'ils sont dans le zip), le Master Drawing lui-même, les plans, les DXF et l'animation 3D. Si les plans sont dans le zip, un second tableau « Content of `<projet>-PLANS.pdf` » coche ce qu'ils contiennent : fabrication, assemblages, nomenclature, couches de cuivre. |
| Page 4 | **Stack layer** (tableau # / Name / Type / Material / Thickness / Tolerance : `Layer1_TOP`… `LayerN_BOTTOM`, diélectriques, vernis, sérigraphie, épaisseur totale), **Via summary** (traversants, borgnes, enterrés, total, laminage séquentiel et sa séquence, avertissement si un via n'est pas réalisable), **Board outline drawing** (contour et découpes mis à l'échelle dans un cadre de 110 × 64 mm, cotes largeur et hauteur en `mm`). |

Chaque page porte en bas un cartouche : `CHECKED` et `APPR.` (vides), `TITLE: <numéro>`, `DATE`, `BOARD REFERENCE (IdPCB): <projet>`, `REV`, `SHEET: n / N`, la note « If not specified all dimensions are in mm » et une mention de confidentialité (au nom de la société du cartouche, sans nom si le champ est vide). Le document est entièrement en anglais, en A4 portrait ; il compte quatre pages au moins (une section qui ne tient pas passe à la page suivante, et le `SHEET: n / N` suit : la page 3 se prolonge quand la liste des fichiers est longue, et la page 4 quand il y a beaucoup de couches). La fonte est la même que celle des plans (option **Fonte embarquée**) ; sans elle, Helvetica en WinAnsi. Le texte est cherchable ; il n'y a ni signet ni titre de document.

Le tableau des fichiers coche toujours (`X`) `positions.csv`, `bom.csv`, `EMPILAGE.txt` et le Master Drawing, même si leur famille est décochée dans la fenêtre ; les autres lignes ne figurent que si le fichier est dans le zip (la ligne `.ipc` figure toujours, cochée seulement si le fichier est présent).

### Fenêtre Plans (Fichier → Plans (Draftsman)…)

#### En-tête et volet de gauche

| Bouton ou champ | Raccourci | Effet | Limites |
|---|---|---|---|
| Chercher : repère, valeur, net, référence… | `Entrée` / `Maj+Entrée` | Recherche plein texte dans les plans (invisibles compris). | Sans casse ni accents. 200 résultats au plus listés. |
| ⬇ Exporter PDF | | Télécharge `<projet>-PLANS.pdf` (`plans.pdf` sans projet), une page par feuille. | « Aucune feuille choisie : rien à exporter. » Message de fin : nombre de feuilles exportées. |
| ⬇ DXF carte 1:1 | | Télécharge `<projet>-CARTE.dxf` (`carte.dxf` sans projet). | Message de fin : nombre d'arcs du contour, de trous, de calques d'outil et de composants. |
| ⬇ DXF feuille | | Télécharge la feuille affichée en DXF, entière, en millimètres, au format de la feuille. | `<projet>-PLAN-<n>.dxf` (`plan-<n>.dxf` sans projet), `n` étant le rang de la feuille dans les onglets. |
| ⬇ Dossier méca .zip | | Télécharge `<projet>-MECA.zip` (`meca.zip` sans projet). | Voir « Dossier mécanique ». |
| ✕ | `Échap` | Ferme la fenêtre. | Les raccourcis de l'éditeur sont inactifs dans la fenêtre. |
| Feuilles (cases) | | **Plan de fabrication**, **Assemblage — face dessus**, **Assemblage — face dessous**, **Nomenclature** (cochées par défaut) ; **Couches de cuivre**, **Vernis épargne (Solder_Mask)**, **Pâte à braser (Solder_Paste)**, **Points de test (PTST)**, **Contour seul (BOARD)**, **Fiche de mesure (technicien)**, **Plan mécanique** (décochées par défaut). | L'assemblage dessous n'existe que si une empreinte est dessous. Les feuilles vernis et pâte n'ont une feuille « dessous » que si la carte a plus d'une couche. Cocher une feuille revient à la première page ; chaque case est une étape `Ctrl+Z`. |
| Format | | **A4 paysage (297 × 210 mm)**, **A3 paysage (420 × 297 mm)** (défaut), **A2 paysage (594 × 420 mm)**. | |
| PDF : Fonte embarquée | | Embarque la fonte PlansSans (Liberation Sans) : même rendu partout, Ω ≤ ≥ écrits tels quels, texte cherchable. Vaut aussi pour le Master Drawing. | Cochée par défaut. Décochée : Helvetica en WinAnsi (Ω devient `Ohm`, ≥ devient `>=`). |
| Cartouche | | **Mon cartouche (DESIGN TITLE, DRAWN / CHECKED…)** ou **Cartouche standard**. | Par défaut, « Mon cartouche » dès que le profil porte une société. |
| ▭ Cartouche… | | Saisie société, adresse (lignes séparées par `;`), téléphone, site, mention de confidentialité et logo (ces six champs sont dans votre profil, communs à tous les projets), puis titre, dessiné par et date, vérifié par et date, n° du schéma et n° du PCB (propres à la carte). | Même fenêtre que le cadre de l'éditeur : son « Format de page » (aucun, A4, A3) règle le cadre de l'éditeur, pas les plans. Le n° du schéma n'est pas utilisé par les plans. |
| Approuvé par (cartouche standard) | | Champ du cartouche standard, enregistré avec la carte. | 120 caractères. Absent du cartouche « Mon cartouche ». |
| Notes ajoutées au plan de fabrication | | Une note par ligne (lignes vides ignorées), numérotée après la dernière des notes tirées de la carte (« Cotes en millimètres, vue de dessus… »). | 4000 caractères. |
| Cotes et détails | | Compte les cotes, détails et vues déplacées ; liste les cotes (orphelines en rouge `⚠ … orpheline`) ; un clic y mène. | |

#### Feuilles produites

| Feuille | Ce qu'elle porte |
|---|---|
| Plan de fabrication | À gauche, « VUE DE DESSUS — ÉCHELLE n:1 » : contour et découpes, cotes hors tout (largeur et hauteur, `100,00 mm`), origine des fichiers (cercle et croix, `0,0`), un symbole sur chaque trou, et les repères `H1`, `H2`… des trous non métallisés. À droite, dans cet ordre : Tableau de perçage, Contre-perçage (s'il y en a), Trous non métallisés (s'il y en a), Impédances contrôlées (si une classe a une Z cible), Coupe d'empilage, Notes de fabrication. |
| Assemblage dessus / dessous | Contour, pastilles en gris, corps des composants, broche 1 (point plein), repère centré (tourné de 90° pour un composant plus haut que large) ; non-montés de la variante en tirets, repère en gris et « NM ». Dessous : vue en miroir. Sous le titre, une ligne donne le nombre de composants de la face et les non-montés. |
| Nomenclature | Titre « Nomenclature — n composant(s), m référence(s) » (et la variante) ; tableau N°, Qté, Repères, Valeur, Boîtier, Réf. fabricant, Fabricant, Face. Une ligne par valeur + boîtier + référence fabricant, composants montés seulement, rangés par famille de repère (C, D, J, R, U…) puis par premier repère ; les non-montés sont listés à part sous « Non montés dans la variante ». |
| Couches de cuivre | Une feuille par couche, toujours vue de dessus (même pour la dernière couche), dans la couleur de la couche : zones en teinte claire, contour, pistes (arcs compris), pastilles, vias (anneau et perçage), noms de nets en texte invisible. |
| Vernis épargne, pâte à braser | Une feuille par face (une seule si la carte a une couche), contour et ouvertures en noir, avec le nombre d'ouvertures. Les ouvertures sont celles des Gerber (dilatation du masque, retrait de la pâte compris). |
| Points de test (PTST) | Contour, pastilles de test en noir (perçage en blanc), repère à côté, net en texte invisible ; la légende donne le nombre et les repères. La feuille existe même sans point de test. |
| Contour seul (BOARD) | Contour et découpes, rien d'autre. |
| Fiche de mesure | Voir « Fiche de mesure ». |
| Plan mécanique | Voir « Dossier mécanique ». |

L'ordre des feuilles est : fabrication, assemblage dessus, assemblage dessous, nomenclature, couches de cuivre, vernis (dessus puis dessous), pâte (dessus puis dessous), PTST, BOARD, fiche de mesure, plan mécanique. Avec le cartouche « Mon cartouche », les feuilles prennent les noms et l'ordre des dossiers de couches : Layer_1 (Top)… Layer_n (Bottom) (les couches internes `Layer_2`…), Solder_Mask Top / Bottom, Solder_Paste Top / Bottom, Equipement Top / Bottom, PTST, Drilling (le plan de fabrication), BOARD, puis nomenclature, fiche de mesure et plan mécanique. Avec le cartouche standard, les titres sont « Couche n — nom », « Vernis épargne dessus / dessous », « Pâte à braser dessus / dessous », « PTST » et « Contour de carte ». Une colonne qui ne tient pas (beaucoup d'outils de perçage, longue nomenclature, notes) continue sur une feuille « (suite) » en pleine largeur, l'en-tête des tableaux répété.

#### Plan de fabrication : tableaux, coupe, notes

| Bloc | Contenu | Limites |
|---|---|---|
| Tableau de perçage | Une ligne par outil : **Symb.** (dessin du symbole), **Ø fini (mm)** (deux décimales, `× L oblong` pour une fente), **Qté**, **Métallisé** (`Oui` / `Non`), **Portée** (`L1–L4`, ou `—` pour un trou non métallisé), **Usage** (`pastilles`, `vias`, `fixation`, `centrage`, regroupés). Dernière ligne **Total**. | Un outil = un diamètre + métallisation + portée (+ longueur de fente) : un via borgne et un traversant de même Ø font deux lignes. Ordre : métallisés avant non métallisés, puis Ø croissant, puis portée. Dix symboles dessinés (croix dans un cercle, X, carré, triangle, losange, rond plein, plus, triangle inversé, hexagone, carré barré), puis les lettres A, B… |
| Contre-perçage | Colonnes **Symb.**, **Ø foret (mm)**, **Depuis** (couche d'où l'on repasse), **Ne pas couper**, **Prof. (mm)**, **Moignon admis (mm)**, **Qté**. Ses symboles, plus grands, continuent la numérotation de ceux du perçage. | Seulement s'il y a des règles de contre-perçage appliquées à des vias. |
| Trous non métallisés | **N°** (`H1`…), **X (mm)** et **Y (mm)** (trois décimales, depuis l'origine des fichiers, Y vers le haut), **Ø (mm)** (`× L oblong` pour une fente), **Usage** (`fixation` pour un trou posé sur la carte, `centrage U1` pour un trou d'empreinte). | Seulement s'il y en a. Les mêmes trous sont dans `*-NPTH.TXT`. |
| Impédances contrôlées | Une ligne par classe qui a une Z cible : **Classe**, **Z cible** (`50,0 Ω ± 10 %`), **Couches et largeurs (mm)** (`L1 : 0,120 ; L2 : …`, couches de signal seulement ; la largeur de la classe sur chaque couche, ou `aucune couche de signal`), **Nets** (nombre). | Seulement si une classe a une Z cible. |
| Coupe d'empilage | Une tranche par couche, de la sérigraphie dessus à la sérigraphie dessous : nom (`L1 Top`, `Cœur`, `Préimprégné`, `Vernis épargne dessus`…) et détail (`Cuivre 1 oz — 35 µm`, `FR-4 — 0,200 mm — εr 4,20`, couleur et épaisseur du vernis, encre), puis « Épaisseur totale : x,xxx mm ± 10 % ». Les passes de contre-perçage y sont tracées en rouge. | Les épaisseurs sont arrondies pour rester lisibles (3 mm pour un cuivre, 3,2 à 7 mm pour un diélectrique) : elles ne sont pas à l'échelle. |
| Notes de fabrication | Numérotées : IPC-6012 classe 2 et IPC-A-600 ; matériau, Tg, UL 94 V-0, RoHS ; épaisseur finie ± 10 %, nombre de couches, cuivre extérieur ; finition, vernis (couleur), sérigraphie ; traitement des vias et laminage séquentiel ; diamètres de perçage finis et tolérances (± 0,08 mm métallisés, ± 0,05 mm non métallisés) ; contour défini par le `.GM1` (± 0,15 mm) ; test électrique d'après le `.ipc` ; note de contre-perçage (s'il y en a) ; « Cotes en millimètres, vue de dessus, sauf indication contraire. » ; enfin vos notes. | Les noms de fichiers cités sont ceux du zip. |

#### Mise en page : cadre, échelles, cartouches, PDF

| Élément | Règle |
|---|---|
| Page | Chaque feuille est une page au format choisi (A4 297 × 210, A3 420 × 297 ou A2 594 × 420 mm, paysage) ; toutes les feuilles d'un PDF ont le même format. |
| Cadre | Deux traits, à 10 et 15 mm du bord. Entre eux, des repères de zones répétés sur les quatre côtés : des chiffres en colonnes et des lettres A, B… en lignes, une zone tous les 50 mm environ (deux au moins par sens). Le dessin occupe l'intérieur, à 3 mm du second trait. |
| Échelle | La vue de la carte prend la plus grande des échelles normalisées 20:1, 10:1, 5:1, 4:1, 3:1, 2:1, 1,5:1, 1:1, 1:1,33, 1:2, 1:2,5, 1:4, 1:5, 1:10, 1:20, 1:50 qui tient dans sa zone (marge de 16 mm autour sur le plan de fabrication pour les cotes, 8 mm ailleurs). Une carte qui ne tient pas à 1:50 prend l'échelle exacte. L'échelle est écrite dans le titre de la vue et, au cartouche standard, dans la case **Échelle** (`—` sur une feuille sans vue à l'échelle, comme la nomenclature). |
| Cartouche standard | En bas à droite, 36 mm de haut, de 118 à 190 mm de large (36 % de la zone de dessin). Quatre rangées : **Société** et **Projet** ; **Titre de la feuille** ; **Dessiné par**, **Vérifié par**, **Approuvé par**, **Date** (jour de l'export, `AAAA-MM-JJ`) ; **N° de document** (`<projet>-PLANS`), **Rév.** (révision du projet, « A » par défaut), **Échelle**, **Format**, **Feuille** (`n / N`). Une case vide affiche `—` ; un texte trop long est coupé à la largeur de la case (première ligne seulement). |
| Mon cartouche | 180 mm de large, 50 mm de haut. En tête « UNLESS OTHERWISE SPECIFIED DIMENSIONS ARE IN MM ». À gauche : société en capitales, adresse (quatre lignes au plus), logo du profil, `TEL :`, site. Au milieu : **DATE** / **NAME** pour **DRAWN** (date saisie, sinon la date du jour `jj/mm/aa`), **CHECKED** (date saisie, sinon la date du jour si un nom est saisi) et **PCB NO.** (le numéro saisi, sinon `<projet>-<révision>`). À droite : **DESIGN TITLE** (le titre saisi, sinon le nom du projet) et **DRAWING NAME** (le titre de la feuille, deux lignes au plus). En pied, trois lignes au plus de mention de confidentialité (un texte d'usage au nom de la société si le champ est vide). Sous le cadre, à droite : `A3   n / N`. L'échelle n'y figure pas. |
| Variante | Une variante de montage active ajoute « Variante de montage : nom » au-dessus du cartouche, et dans les titres de la nomenclature. |
| PDF | Texte réel (opérateur `Tj`), jamais des traits ; texte invisible pour la recherche ; un signet par feuille (« 1. Plan de fabrication »…) et un par composant sous les assemblages, le panneau des signets ouvert à l'ouverture. Propriétés : titre « <projet> — plans de fabrication et d'assemblage », auteur (dessiné par, sinon société), sujet (`<projet>-PLANS` et révision), mots-clés (jusqu'à 400 repères), langue fr-FR. Le logo du profil (« Mon cartouche ») est embarqué en image ; s'il n'est pas encore décodé par le navigateur, la feuille part sans lui. |
| Texte trop long | Les colonnes et les paragraphes sont coupés au mot, un mot plus long que la colonne à la lettre. Le titre d'une feuille de plus de deux lignes dans « Mon cartouche » est tronqué. |

#### Barre d'outils au-dessus de la feuille

| Bouton | Raccourci | Effet | Limites |
|---|---|---|---|
| ↖ Sélection | `Échap` (retour) | Glisse une vue ou une cote ; double-clic sur une cote : sa tolérance ; `Suppr` (ou `Retour arrière`) efface la cote ou le détail choisi, ou rend sa place calculée à la vue choisie. | Une vue se pose sur une grille de 2,5 mm, dans le cadre et hors du cartouche. |
| ↔ Cote horizontale | | Deux points accrochés, puis la ligne. | |
| ↕ Cote verticale | | Idem. | |
| ⤢ Cote alignée | | Idem. | |
| Ø Diamètre | | Un trou de fixation ou d'empreinte, un via, une pastille percée ou une pastille ronde, puis le texte. | La valeur est le diamètre du trou (ou de la pastille ronde sans trou). |
| R Rayon | | Idem. | La moitié de ce diamètre. |
| ∠ Cote angulaire | | Le sommet puis un point sur chaque côté, ou deux arêtes du contour ; puis l'arc. | Angle de 0 à 180° ; deux arêtes parallèles refusées. |
| ⊢⊣ Cotes en chaîne | `Entrée` | Points accrochés, puis un clic hors accroche (ou `Entrée`) pour la ligne commune. | 2 à 60 points. |
| ⌖ Cotes d'ordonnée | `Entrée` | L'origine, des points, puis un clic hors accroche (ou `Entrée`). | 1 à 60 points, l'origine non comprise. |
| ◯ Détail circulaire | | Centre, puis rayon. | Zone de moins de 0,2 mm : « Zone trop petite. » |
| ▭ Détail rectangulaire | | Deux coins opposés. | Idem (plus petit côté). |
| Échelle des vues de détail (liste) | | 2:1, 3:1, 4:1, 5:1, 10:1, 20:1. | 5:1 au départ. |
| Sens horizontal (X) / vertical (Y) | | Sens d'une chaîne ou d'une ordonnée. | Visible avec ces deux outils. |
| Origine : premier point cliqué / des fichiers de fabrication | | Origine d'une ordonnée. | Visible avec l'outil ordonnée. |
| Replacer automatiquement | | Les vues de la feuille reviennent à la disposition calculée. | |
| − / pourcentage / + | | Zoom (0,5 à 8, par pas de 1,4) ; le pourcentage revient à la page entière. | |
| Onglets de feuilles | | Passe d'une feuille à l'autre (`n. titre`) ; un nombre en italique compte les résultats de recherche. | |
| Ligne de consigne (à droite des listes) | | Dit ce que le prochain clic attend, et les refus. | « Pas de point d'accroche ici. », « Pas de trou ici. », « Pas d'arête du contour ici. », « Choisissez un autre point. », « Ce point est déjà coté. », « Choisissez une autre arête. », « Arêtes parallèles : pas d'angle à coter. », « Angle nul : choisissez d'autres points. », « Pas assez de points. », « Cliquez sur une vue de la carte. », « Zone trop petite. », « Pas de place libre pour … : recouvrement réduit au plus petit. », « … écartée(s) pour faire place. ». |
| `Ctrl+Z`, `Ctrl+Y` | `Ctrl+Z`, `Ctrl+Y` (ou `Ctrl+Maj+Z`) | Historique de la carte, depuis la fenêtre. | |

#### Tolérance d'une cote (volet de gauche)

| Champ | Effet | Limites |
|---|---|---|
| Valeur | Chaîne et ordonnée : **Toutes les valeurs (tolérance commune)** ou un point (« Point 2 : 10,00 — J1.3 (centre) »). | Un point peut suivre la commune, n'avoir **aucune** tolérance, ou la sienne. |
| Tolérance | **± symétrique**, **+ / − écarts**, **limites max / min**, **( ) de référence**, **▭ théoriquement exacte**, ou aucune. | |
| Écart ± ; Écart supérieur / Écart inférieur ; Max = valeur + / Min = valeur + | Écarts signés, en mm (degrés pour un angle). Les limites sont « valeur + écart ». | Écart vide : l'écart d'avant, sinon +0,1 / −0,05 mm (+0,5 / −0,5° pour un angle) ; pour **± symétrique**, ±0,1 mm (±0,5°). Un écart symétrique nul revient à « aucune tolérance ». Un écart fin garde ses décimales (±0,005). |
| Feuille du détail | Place le détail choisi sur une autre feuille : **Feuille de la vue mère** (défaut) ou l'une des feuilles de la liste. | La liste ne propose que les feuilles qui reçoivent un détail : la fabrication, les deux assemblages, la nomenclature, une couche de cuivre et le plan mécanique. Le détail se pose sur la première feuille de ce genre (pas une « suite ») et oublie sa place d'avant ; il renvoie à l'autre feuille. Feuille décochée : le détail reste sur celle de sa vue mère. |

> [!NOTE]
> Le DXF `-PLAN-FABRICATION.dxf` du zip ne prend que les feuilles de fabrication : un détail posé sur une autre feuille n'y figure pas (exportez sa feuille par **DXF feuille**). Le zip MECA ne construit que ses propres vues.

### DXF pour la mécanique

| Fichier | Contenu | Limites |
|---|---|---|
| `<projet>-CARTE.dxf` | Carte à 1:1 en millimètres, repère des Gerber (Y vers le haut) : contour et découpes (arcs retrouvés), un cercle par trou (le contour d'une fente pour un trou oblong), un calque par outil de perçage avec un `POINT` par trou, encombrement (polyligne fermée) et repère de chaque composant, une croix d'origine (calque `ORIGINE`), cotes hors tout (largeur et hauteur, sans unité : `100,00`), tableau de perçage à 20 mm à droite de la carte (colonnes **Outil** `T1`…, **Ø fini (mm)**, **Qté**, **Métallisé**, **Portée**, **Usage**, ligne **Total**). | AutoCAD R12 ASCII, Windows-1252 ; `°`, `±` et `Ø` en `%%d`, `%%p`, `%%c`. Composants non montés en tirets. Une couleur par diamètre d'outil. |
| `<projet>-PLAN-FABRICATION.dxf` (zip) / `<projet>-PLAN-<n>.dxf` (**DXF feuille**) | La feuille entière : cadre, cartouche, vue cotée, symboles et tableaux, notes. Dans le zip, toutes les feuilles de fabrication (suites comprises) côte à côte dans un même dessin, 20 mm entre elles. | Le texte invisible du PDF n'y va pas. Calques : `CADRE`, `CARTOUCHE`, `CONTOUR`, `PERCAGE`, `COTES`, `PASTILLES`, `COMPOSANTS`, `REPERES`, `TABLEAUX`, `EMPILAGE`, `NOTES`, `TEXTES`, `DESSIN`. Les textes ont le style `PLANS` (Arial). |

Calques de la carte : `CONTOUR`, `DECOUPES`, `TROUS_METALLISES`, `TROUS_NON_METALLISES`, `COMPOSANTS_DESSUS` / `_DESSOUS`, `REPERES_DESSUS` / `_DESSOUS`, `COTES`, `ORIGINE`, `TABLEAU_PERCAGE`, et par outil : `TROUS_PTH_<Ø>`, `TROUS_NPTH_<Ø>`, `VIAS_<Ø>`, `VIAS_L1-L2_<Ø>`, `CONTRE_PERCAGE_<DESSUS|DESSOUS>_<Ø>` (Ø écrit `0_30`, trois décimales si besoin : `0_254`). Une fente ajoute `X<longueur>` au nom de son calque, métallisée ou non (`TROUS_NPTH_2_00X5_00`). Le contre-perçage a aussi un cercle au diamètre du foret.

### Dossier mécanique

| Élément | Effet | Limites |
|---|---|---|
| Plan mécanique (case) | Ajoute la feuille aux plans : vue de dessus cotée (hors tout, et position X / Y de chaque fixation depuis l'origine des fichiers), vue de face (depuis le bord S) et vue de gauche (depuis le bord O) avec la carte à son épaisseur et chaque composant en pavé à sa hauteur (cotes de l'épaisseur, de la hauteur dessus, dessous et totale), les trois à la même échelle. À droite, quatre blocs : **Carte** (encombrement du contour X × Y, épaisseur, plus haut composant dessus et dessous, hauteur totale), **Trous de fixation** (N°, X, Y, Ø, Métallisé, Ø dégagement), **Ouvertures dans le boîtier** (Repère, Où : `bord N` ou `face dessus`, De, À, Z min, Z max ; ou « Aucune. »), **Notes** (repère utilisé, lecture de De / À, avertissements). Les composants à ouverture sont en rouge. | Décochée par défaut. Une colonne qui déborde continue sur une feuille « (suite) ». |
| Tableau Repère / Hauteur / Ouv. | Hauteur saisie (mm) et case d'ouverture, par composant. | Hauteur strictement positive, 100 mm au plus ; une valeur hors de ces bornes est ignorée. Le texte grisé du champ vide donne la hauteur retenue et sa source (`9,50 (lib)`), ou `?` si elle est inconnue. La case **Ouv.** reflète l'ouverture proposée. Le tableau n'apparaît que si la feuille est cochée. |
| ⬇ Dossier méca .zip | `-PLAN-MECA.pdf`, `-MECA.json`, `-MECA.dxf`. | Message de fin : nombre de fixations et d'ouvertures, composants sans hauteur. Le PDF ne contient que le plan mécanique, au format et avec le cartouche choisis. |

Règles de calcul :

| Sujet | Règle |
|---|---|
| Hauteur d'un composant | Saisie dans le tableau, sinon colonne « Maximun Height » de la LIB (par Part Name, puis par référence fabricant : colonnes « Part Number » et « manufacturer part Number »). Sans l'une ni l'autre : citée dans les notes (30 repères au plus nommés), dessinée en tirets. |
| Fixation | Trou non métallisé posé sur la carte, ou empreinte `H…` / `MH…` (suivi d'un chiffre) ou dont le boîtier dit « MOUNT » / « TROU », qui n'a qu'un seul trou (pastille percée ou trou d'empreinte). Ø de dégagement : la pastille si elle dépasse le trou, sinon le trou + 2 mm. Nommée `H1`, `H2`… pour un trou libre, du repère pour une empreinte. |
| Ouverture | Proposée pour les connecteurs dont le repère commence par `USB`, `CN`, `J`, `P` ou `X` suivi d'un chiffre, pour `SW`, `LED`, `DS`, `BT` suivis d'un chiffre, et pour les `D` + chiffre dont la valeur, le boîtier ou le Part Name contient « LED ». Sur le bord (N, S, E ou O, avec l'intervalle De / À et les Z min / max) si le corps est à moins de 2 mm du contour, sinon sur sa face (au-dessus ou au-dessous du corps). La case **Ouv.** du tableau remplace la proposition. |
| Repère | Origine des Gerber, Y vers le haut, vue de dessus ; Z = 0 sur la face dessus, face dessous à −épaisseur. |
| Non-montés | Gardés, en tirets et « NM », comptés dans la hauteur maximale. |

Calques du `-MECA.dxf` : `CONTOUR`, `DECOUPES`, `FIXATIONS`, `DEGAGEMENTS`, `REPERES_FIXATIONS`, `CORPS_DESSUS_H<h>` / `CORPS_DESSOUS_H<h>` (un par face et par hauteur, ex. `CORPS_DESSUS_H9_50` ; `_H_INCONNUE` sans hauteur), `OUVERTURES`, `REPERES_DESSUS` / `REPERES_DESSOUS` (repères des composants) et `COTES` (hors tout).

### Fiche de mesure (fenêtre Plans)

| Champ ou bouton | Effet | Limites |
|---|---|---|
| Sonde + (couleur) | Point de la sonde « + », dessinée de la couleur de la mesure (rouge, bleu, vert, orange, violet, sarcelle, puis on recommence) : repère et pastille (`U3.12`, `u3-12`, `U3:12`, `J1 3` ; séparateur point, deux-points, espace ou tiret), repère seul pour une empreinte à une pastille (`TP2`), ou un net (`GND`). | Majuscules ou minuscules. Un net : le point le plus accessible est pris (un point de test `TP…` d'abord, puis face dessus ou traversant, puis la plus grande pastille). Une liste de suggestions s'affiche (5000 pastilles au plus). 60 caractères. |
| Sonde − (noire) | Idem, pour la sonde noire. | Les deux sondes ne peuvent pas être sur la même pastille. Refus affichés en rouge : « Sonde + : … » ou « Sonde − : … » (point vide, repère à plusieurs pastilles à préciser, pastille inconnue, ni repère ni net), « Les deux sondes sont sur la même pastille. » |
| Mesure | **Tension DC**, **Résistance**, **Continuité**, **Oscilloscope**. | Résistance et continuité comptent comme « ohms » pour les consignes. |
| Attendu, Tolérance | Textes libres (`3,3 V`, `± 5 %`). | 40 et 30 caractères ; `—` au tableau si vides. |
| Échelle des détails | **auto**, 2:1, 3:1, 4:1, 5:1, 10:1. | En auto, un seul détail pour les deux points s'ils tiennent ensemble à 4:1 au moins, sinon un détail par point. |
| Note pour le technicien | Texte libre. | 200 caractères. |
| + Ajouter la mesure | Ajoute la mesure, coche la feuille et l'affiche. | 40 mesures au plus ; quatre par feuille. Au-delà, l'ajout est refusé (« Fiche pleine », en rouge) et les champs gardent la saisie. Une mesure saisie par net garde le net (son meilleur point peut changer). Une mesure dont un point est devenu introuvable reste dans la liste (message en rouge) mais n'est pas dessinée : une consigne « ATTENTION » le dit sur la première feuille. |
| ✕ (liste) | Supprime la mesure. | La numérotation des mesures suit la liste. |
| Clic sur une pastille de la feuille (outil Sélection) | Remplit la sonde active (+ d'abord), puis passe à l'autre ; le champ actif est entouré. | |

### Animation 3D

| Élément | Effet | Limites |
|---|---|---|
| Fichier → Animation 3D dans le .zip | Bascule (bouton allumé). | Éteinte à chaque ouverture de l'éditeur. |
| `<projet>-ASSEMBLAGE-3D.html` | Animation en boucle, orientable (glisser, molette, double-clic pour revenir), three.js embarqué. | S'ouvre hors ligne. Illustration seulement : ne fait pas foi. |
| `<projet>-ASSEMBLAGE-3D.mp4` / `.webm` | Vidéo 1280 × 720, enregistrée dans le navigateur. | MP4 (H.264) si le navigateur l'encode, sinon WebM. Sans `MediaRecorder`, pas de vidéo. |
| Ordre de la scène | Carte nue, cuivre des faces externes, vernis et sérigraphie, composants du plus gros au plus petit (dessus puis dessous), tour complet. | |
| Modèles de composants | « Modèle 3D » (STEP de `LIB/Models`, maillé d'avance dans `LIB/Models/maillages`) posé selon « Position 3D » ; sinon pavé extrudé du corps. | Maillages demandés au serveur. Un maillage absent laisse le pavé. Hauteur du pavé : dossier mécanique, sinon 0,4 × le côté moyen entre 0,3 et 3 mm. |
| Message de fin | Format de la vidéo, images par seconde, nombre de composants avec modèle. | |

### Export IPC-2581

| Section du fichier | Contenu |
|---|---|
| `Content`, `LogisticHeader`, `HistoryRecord` | Calques, dictionnaires de formes, émetteur, révision, date. |
| `Bom` | Une ligne par référence de commande ; `populate="false"` pour ce que la variante active ne pose pas. |
| `CadHeader` | Une `<Spec>` par couche d'empilage (cuivre, diélectrique, masque), la finition, les contre-perçages, et les règles : `CLASSE_*`, `CONTRAINTE_*`, `PAIRE_*`, `APPARIEMENT_*`, `ISOLATION_CLASSES`. |
| `Layer`, `Stackup` | Sérigraphie, pâte, masque, cuivres, diélectriques, contour, un calque `DRILL` par portée, `PERCAGE_NPTH`, contre-perçage. |
| `Step` | Pastilles et vias, contour, empreintes, composants (place, rotation, face), nets (classe, paire, règles), points de sonde, entités de chaque calque (pistes, arcs, pastilles, zones remplies, sérigraphie, ouvertures de masque et de pâte, trous). |

Les zones partent remplies (cuivre calculé en géométrie exacte, dégagements circonscrits). Les arcs du contour sont gardés. La rugosité de Huray part en `<Property>` nommées `HURAY_NODULE_RADIUS` et `HURAY_SURFACE_RATIO`.

## Limites connues

- Le gestionnaire de contraintes ne juge pas un net qui porte une zone de cuivre (un plan) ; un net dont une broche n'est pas encore reliée n'est jugé que pour information.
- Les impédances (Z₀) du gestionnaire sont des formules de ligne ; elles ne remplacent pas l'audit par la méthode des moments de **Simulation EM** (voir [08](08-simulation-si.md)). Pas de plan de référence : Z₀ non calculable.
- Les groupes d'appariement du schéma se lisent mais ne se modifient que dans le schéma.
- L'estimation thermique est un ordre de grandeur (±30 %), calculée par le serveur (`python web_CAO.py`) : sans lui, elle est refusée. Elle ne vaut que pour la révision de carte courante. Voir aussi [09](09-simulation-pi-thermique-audit.md).
- Une zone interdite se pose sur une face seule ; sa hauteur permise vaut pour toute la zone. Une hauteur de composant inconnue n'est jamais supposée : elle est signalée.
- Le trou NPTH autonome ne se pose que sur la carte ; les trous d'une empreinte viennent de la LIB et ne se modifient pas dans l'éditeur PCB (voir [SPEC-trous-npth.md](../../SPEC-trous-npth.md)). Aucun trou NPTH ne figure dans l'IPC-D-356.
- Les Gerber ne dégagent pas les zones autour d'un trou NPTH ; l'IPC-2581 non plus.
- Le fichier IPC-2581 est écrit en révision C ; si Gerber et IPC-2581 divergent, les Gerber et l'Excellon font foi.
- Le dossier PCBA JLCPCB ne contient pas de `.GKO` (le `.GM1` seul définit le contour) ; le zéro des pièces de la bibliothèque JLCPCB n'est pas toujours celui de l'empreinte : vérifier l'orientation dans l'aperçu de JLCPCB.
- L'animation 3D s'enregistre en temps réel dans le navigateur : l'onglet doit rester au premier plan ; un navigateur sans `MediaRecorder` ne produit que la page HTML.
- Une cote dont la référence disparaît n'est jamais corrigée en silence : elle est signalée orpheline.
- La feuille de fabrication du zip DXF ne prend pas les détails posés sur d'autres feuilles ; le zip MECA ne contient que ses propres vues.
- Pas d'aperçu 3D interactif ni de coupe dynamique dans l'éditeur PCB en dehors de l'animation du dossier de fabrication. La visionneuse 3D de WEB_3D est un autre outil de la suite, hors de ce chapitre.
- Les libellés des fichiers texte du dossier de fabrication (LISEZ-MOI, EMPILAGE) sont écrits sans accents ; les noms saisis (projet, classes, variante) y gardent les leurs.
- Un détail ne se pose pas sur les feuilles vernis, pâte, PTST, BOARD ni sur la fiche de mesure : la liste « Feuille du détail » ne les propose pas.

## Voir aussi

- [Éditeur PCB : édition, routage, DRC, placement](03-editeur-pcb-edition-routage.md) : fenêtre des règles, empilage, contre-perçage, serpentin, paires différentielles, origine, cartouche.
- [Éditeur schématique](02-editeur-schematique.md) : contraintes de nets, variantes de montage, champs LCSC.
- [Gestion LIB](05-gestion-lib.md) : colonnes « Maximun Height », « Modèle 3D », « Position 3D » ; empreintes à trous NPTH.
- [Visionneuse IPC-2581](07-visionneuse-ipc2581.md) : relecture du fichier exporté, même dossier mécanique.
- [Simulation SI](08-simulation-si.md) et [Simulation PI, thermique, audit](09-simulation-pi-thermique-audit.md) : Z₀ par la méthode des moments, échauffement.
- [Claude et le MCP](11-claude-mcp.md) : outils `cao_contraintes_ecrire`, `cao_interdits_ecrire`, `cao_serigraphie_ecrire`, `cao_thermique`.
- [editeur-pcb/README.md](../../editeur-pcb/README.md) : détail technique.
- [SPEC-dossier-meca.md](../../SPEC-dossier-meca.md), [SPEC-trous-npth.md](../../SPEC-trous-npth.md).
- [Simulation EM (calcul)](../simulation-em.md).
