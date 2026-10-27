# Éditeur schématique

L'Éditeur Schématique dessine le schéma d'une carte : symboles, fils, étiquettes, bus, feuilles hiérarchiques. Il en tire la netlist, la nomenclature (BOM) et les variantes de montage, puis met à jour la carte de l'éditeur PCB.
Il vérifie aussi le brochage, reconnaît les blocs fonctionnels (alimentations, bus, quartz, filtres), classe les nets et porte les contraintes que le PCB devra tenir.
Cette page décrit chaque tâche, puis chaque menu, bouton, raccourci et option, tels qu'ils apparaissent à l'écran.

## Guide par tâche

### Je veux poser un composant

1. Appuyer sur `A`, ou choisir **Placer → Composant…** : l'**Explorateur Visuel de Bibliothèque** s'ouvre (recherche par référence, valeur, boîtier ou MPN ; filtres « Modèle SPICE », « CMS / SMD », « Traversant / THT »).
2. Sélectionner une carte du catalogue, puis **✔ Placer sur le schéma** (ou double-clic sur la carte : pose immédiate).
3. Cliquer sur la feuille pour poser le composant. `R` pivote le symbole avant la pose ; `Maj`+clic en pose plusieurs à la suite ; `Échap` ou clic droit annule.
4. Autre voie : le panneau **Bibliothèque** (à gauche) liste les symboles intégrés par catégorie ; un clic sur un symbole, puis un clic sur la feuille.
5. Le composant reçoit un repère libre (`R100`, `C100`… : la centaine de sa feuille), la valeur et le boîtier du symbole ou de la ligne du catalogue.

### Je veux tracer un fil

1. Appuyer sur `W` (ou **Placer → Fil**).
2. Cliquer pour démarrer, cliquer pour poser un coude, cliquer sur une broche pour terminer. Les fils sont orthogonaux (en L). Une broche proche (12 px à la souris, 20 px au toucher) attire le point.
3. `Échap`, clic droit ou double-clic arrête le tracé en cours.
4. Une extrémité de fil posée en plein milieu d'un autre segment le scinde ; deux fils qui se croisent sans extrémité commune restent distincts (le point rouge indique une jonction réelle).
5. Deux broches posées bout à bout sont reliées sans fil (le point rouge les signale aussi).
6. Arriver sur une broche termine le fil ; sinon le tracé continue depuis le dernier point.

### Je veux nommer un net ou relier deux feuilles

1. Net nommé : sélectionner un fil, saisir le nom (32 caractères au plus) dans le champ **Net** du panneau **Propriétés** et valider (`Entrée` ou sortie du champ). Vider le champ, ou saisir un nom de la forme `N$…`, rend le net anonyme.
2. Ou poser un symbole **Étiquette / net** (local à la feuille), **Étiquette globale** (même nom = même net sur toutes les feuilles), **Alimentation** ou **Masse** (leur valeur nomme le net, globalement).
3. Un symbole **Étiquette / net** se transforme en global (et inversement) par **Étendre à tout le document** / **Restreindre à cette feuille** dans ses propriétés.
4. Le bouton **Nets : …** (`N`) change l'affichage des noms sur la feuille : `aucun`, `nommés`, `tous`.

### Je veux tracer un bus et y piquer des signaux

1. Appuyer sur `B` (**Placer → Bus**) et tracer le bus (trait épais).
2. Sélectionner le segment, nommer le bus dans **Net** avec une syntaxe développable : `D[0..7]` (ou `D[0:7]`) donne `D0` à `D7` ; `SPI{MOSI,MISO,SCK,CS}` donne `SPI_MOSI`, `SPI_MISO`… ; `CLK,DATA,EN` ; ou un protocole nu (`SPI`, `I2C`, `UART`, `CAN`, `USB`, qui développent leurs signaux usuels, par exemple `SPI_MOSI`, `SPI_MISO`, `SPI_SCK`, `SPI_CS`). Un bus non nommé s'appelle `BUS$n`.
3. Le panneau **Propriétés** liste le **Faisceau de bus (n signaux)** ; le bouton **⚡ Piquer un signal** ouvre la fenêtre **Piquage de bus**.
4. Autre voie : en mode Fil, partir d'un bus ou y arriver ouvre la même fenêtre. Un clic sur un signal (suggestion en surbrillance, signaux déjà pris marqués « (occupé) ») le valide aussitôt ; sinon saisir le nom dans **Signal à dériver :** (pré-rempli avec la suggestion), puis **✓ Valider le piquage** (`Entrée`). `Échap`, **Annuler** ou ✕ ferment sans nommer.
5. Un fil piqué sur un bus porte une pastille cyan à centre blanc et affiche, dans ses propriétés, le menu **Piquage du bus « … »**. Les bus ne figurent pas dans la netlist.

### Je veux organiser un schéma en plusieurs feuilles

1. L'onglet de gauche **Hiérarchie** (⬡) est la feuille racine : elle montre un bloc par sous-feuille. Il ne peut être ni supprimé ni dupliqué.
2. **+ Feuille** ajoute une feuille ; **Dupliquer** copie la feuille courante. Un double-clic sur l'onglet la renomme ; ✕ la supprime (confirmation si elle contient des composants, des fils, des traits ou des zones). Il reste toujours au moins une feuille de schéma.
3. Dans une sous-feuille, poser des **Étiquette / net** ou **Étiquette globale** : elles deviennent des broches du bloc sur la feuille Hiérarchie (alimentations à gauche, bus à droite, signaux répartis).
4. Sur la feuille Hiérarchie : glisser un bloc le déplace, double-clic (ou **Ouvrir cette feuille ➔**) l'ouvre. `PageUp` / `PageDown` passent d'une feuille à l'autre.
5. Clic droit sur un onglet : premier numéro des repères de la feuille (par défaut 100 pour la feuille 1, 200 pour la 2…), avec renumération facultative des composants déjà posés.

### Je veux renseigner un composant (valeur, boîtier, référence du catalogue)

1. Sélectionner le composant : le panneau **Propriétés** s'affiche. Saisir **Référence** et **Valeur**.
2. **Boîtier** : choisir une base (SOIC, SOT-23, 0603…), puis le nombre de broches ; les choix marqués ✓ correspondent au symbole. **Personnalisé…** accepte un nom libre.
3. **Catalogue LIB** : taper dans le champ de recherche, choisir une ligne de la liste. Le choix recopie sur le composant la valeur, le boîtier, l'empreinte PCB, le symbole, le modèle de simulation, le fabricant, le MPN, les caractéristiques et le brochage.
4. Pour un symbole générique (AOP, transistor, régulateur), le badge **⚠ Référence à choisir (n)** invite à choisir la référence réelle : elle apporte la patte du boîtier de chaque broche.
5. Un double-clic sur le composant (ou **✎ Détails du composant…**) ouvre la fenêtre **Édition du composant** : référence, valeur, symbole, boîtier, MPN, fabricant, nom, patte et net de chaque broche.

### Je veux enrichir un composant depuis les distributeurs (JLCPCB, Mouser, DigiKey)

1. Sélectionner le composant, puis **⌕ Rechercher & Enrichir** (section **Recherche en ligne** des propriétés).
2. La requête est déduite de la valeur et du boîtier, et la recherche se lance dès l'ouverture ; la modifier au besoin, puis **Chercher**. Cocher **Basic / Sans frais d'abord** pour privilégier les pièces JLCPCB sans frais d'installation. **Mouser / DigiKey ↗** force la recherche chez ces deux distributeurs ; elle est lancée d'office si JLCPCB ne trouve rien.
3. Sélectionner un candidat : stocks et prix (1+) des trois distributeurs, puis les données à reprendre (cases à cocher : MPN, fabricant, boîtier, datasheet, code LCSC, références Mouser et DigiKey, brochage officiel). **Tout cocher** / **Essentiel seul** accélèrent le choix.
4. Le tableau **Brochage schématique officiel** compare le brochage officiel au câblage actuel ; la section **Vérification du câblage schématique** propose des corrections à cocher (inversions de signal, court-circuit alimentation/masse évité).
5. **✓ Valider et enrichir** applique. S'il existe d'autres composants identiques, la case « Appliquer également aux n autre(s) composant(s) identique(s) » (même symbole, même valeur, sur la feuille courante) étend le résultat.
6. Une fois enrichi, **✕** (en haut de la section) efface les données enrichies.

> [!NOTE]
> Cette recherche passe par la passerelle locale du serveur (`/api/tool`). Sans serveur, elle échoue avec un message d'erreur. La recherche autonome est décrite dans [06-recherche-composants.md](06-recherche-composants.md).

### Je veux importer un schéma ou une bibliothèque

1. Schéma enregistré : **Fichier → Ouvrir**, choisir un `.json` (25 Mo au plus, 200 feuilles au plus). Aucune confirmation n'est demandée, mais `Ctrl+Z` annule l'ouverture. Les éléments illisibles sont ignorés et comptés dans le pied de page. Un fichier sans feuille Hiérarchie en reçoit une.
2. Schémas d'exemple : **Fichier → Exemples…**, puis **Ouvrir cet exemple** (« Interface IoT & Bus Haute Vitesse — 4 couches » ou « Commande 12 V — 2 couches »). Si le schéma en cours n'est pas vide, une confirmation prévient qu'il sera perdu ; l'ouverture s'annule par `Ctrl+Z`.
3. Catalogue de composants : le fichier `LIB_composants.csv` est chargé automatiquement (API du serveur, sinon fichiers de repli). S'il n'est pas chargé, le panneau Propriétés propose **Charger le CSV manuellement**.
4. Sans projet ouvert, la page démarre sur le schéma de démonstration (le premier exemple : deux feuilles, « Microcontrôleur & Bus » et « Alimentation & RF »). Avec un projet, elle démarre sur une feuille Hiérarchie et une « Feuille 1 » vierge, puis charge le schéma du dossier du projet s'il en contient un.

### Je veux lire la nomenclature et la liste des nets

1. Panneau **Nomenclature & Nets**, onglet **Nomenclature** : une ligne par composant (Rep., Composant, Valeur, boîtier). Un clic sélectionne le composant (et change de feuille si besoin).
2. Case **tout le doc.** : toutes les feuilles au lieu de la feuille courante.
3. Onglet **Nets** : une ligne par net (nom, source du nom, classe, nombre de nœuds). Un clic sélectionne les fils du net ; le survol l'éclaire sur la feuille.
4. La liste d'un net global (⇄) indique les feuilles qu'il traverse.

### Je veux monter une carte en plusieurs variantes (DNP)

1. **Fichier → Variantes de montage…** (ou **◫** dans le panneau Nomenclature).
2. À gauche, saisir un nom (« Lite », « Pro »…, 40 caractères au plus), choisir « vierge » ou « copie de … », **＋ Ajouter**. 20 variantes au plus. La variante créée devient la variante active.
3. À droite, décocher « monté » pour chaque composant retiré de la variante ; ✓ / ✗ en tête de colonne montent ou retirent tous les composants affichés.
4. Choisir la variante active (rond à gauche de son nom, ou menu déroulant du panneau Nomenclature). Ses non-montés sont barrés (NM) dans la liste et voilés d'une croix rouge sur la feuille.
5. Plusieurs composants sélectionnés : **Monter** / **Ne pas monter** (propriétés) agissent d'un coup dans la variante active.
6. **Nomenclature .csv** et **Nomenclature .xlsx** suivent la variante active ; **⇩ Exporter la BOM de chaque variante** produit un CSV par variante, carte complète comprise.

### Je veux exporter la nomenclature, la netlist ou une image

1. **Fichier → Exporter → Netlist .txt** : une section par feuille, nets globaux à part, boîtier en troisième colonne, remarques de brochage en commentaire. Les numéros de feuille de la netlist, du CSV (colonne Feuille) et des cartes de Claude comptent la Hiérarchie pour 1 : la première feuille de schéma y est la feuille 2 (`f2`), alors que son onglet porte `01`.
2. **Nomenclature .csv** : une ligne par composant, récapitulatif des quantités (composants montés seulement), liste des non-montés.
3. **Nomenclature .xlsx** : classeur à trois onglets (Presentation, History, BOM), non-montés en rouge `[Not Fitted]`.
4. **Exporter .png** : image de la feuille courante (page entière si un cartouche est défini).
5. Les fichiers prennent le nom du document du projet (`<projet>-SCH.json`, `-SCH-netlist.txt`, `-SCH-nomenclature.csv`…) ; une variante s'ajoute au nom (`-nomenclature-Lite.csv`). Le classeur Excel s'appelle `<projet>BOM.xlsx`. Sans projet : `schema.json`, `netlist.txt`, `nomenclature.csv`, `schema.png`, `carteBOM.xlsx`.

### Je veux envoyer le schéma à l'éditeur PCB

1. Cliquer sur **⇉ PCB** (barre d'en-tête) ou **Fichier → Exporter → Exporter vers le PCB**.
2. Le schéma est enregistré en local dans le dossier du projet, puis l'éditeur PCB s'ouvre et met la carte à jour (empreintes, boîtiers, valeurs, nets) ; placement et routage sont conservés.
3. Rien n'est envoyé sur GitHub : **Sauvegarder le projet → GitHub** (`Ctrl+Maj+S`) le fait, en un seul commit. Ce bouton n'apparaît que lorsque l'éditeur est lancé par WEB_SUITE.
4. Autre voie : exporter la netlist `.txt` et l'importer dans l'éditeur PCB. Détails côté PCB : [03-editeur-pcb-edition-routage.md](03-editeur-pcb-edition-routage.md).

### Je veux voir un composant ou un net sur le PCB

1. Sélectionner un composant (un seul) ou un fil.
2. Cliquer sur **➔** (en-tête) : le PCB s'ouvre dans l'onglet, sur ce repère ou ce net. Sans sélection, le bouton change simplement de page.
3. PCB déjà ouvert dans un autre onglet : **Outils → Montrer au PCB** (`L`) le fait sauter sur la sélection sans que celui-ci bouge. Le pied de page dit si l'élément a été montré, s'il n'est pas sur la carte, ou si aucun onglet PCB n'est ouvert.

### Je veux détecter les blocs fonctionnels et classer les nets

1. Le panneau **Blocs et Motifs** (dock de droite, sous Propriétés et Nomenclature & Nets) affiche l'analyse, lancée au chargement de la page ; elle se relance seule à chaque modification de zone ou annulation. **Outils → Motifs & Blocs** la relance et rouvre le panneau s'il était fermé ou replié.
2. Chaque bloc reconnu liste ses composants (un clic les sélectionne sur le schéma), ses nets, la classe suggérée et, pour une alimentation, la tension inférée.
3. Dépliant **Classes de nets** : un menu par net nommé (`Auto (…)` ou une classe imposée). Une correction manuelle ressort en jaune et part avec le document.
4. **Valider pour PI** enregistre les courants DC estimés pour le solveur d'intégrité d'alimentation.
5. L'analyse demande le serveur : sans lui, le panneau affiche « Serveur non disponible » ; seules la masse et les alimentations (reconnues par leur nom) gardent une classe.

### Je veux saisir des contraintes de nets pour le PCB

1. **Outils → Contraintes de nets…**, ou **Contraintes du net…** dans les propriétés d'un net nommé.
2. Filtrer la liste, puis saisir pour chaque net : classe, topologie, impédance, tolérance, longueurs, vias, couches, ordre des repères, moignons.
3. En bas, créer un **groupe d'appariement** : nom, mode (en longueur mm / en délai ps), tolérance, référence (« le plus long » ou un net), puis cocher les nets et **Créer avec les nets cochés**.
4. Les contraintes partent au PCB avec le schéma (export **⇉ PCB**, ECO, gestionnaire de contraintes). Les valeurs hors bornes sont écartées.
5. Un net renommé ou supprimé apparaît sous **À revoir**, avec **Effacer**.

### Je veux contrôler le brochage

1. Le contrôle est affiché dans le panneau **Propriétés** de chaque composant (⛔ erreur, ⚠ alerte) et reporté dans la netlist (section « Contrôle du brochage »). L'export de la netlist rappelle le nombre de remarques dans le pied de page.
2. Corriger en choisissant la référence du catalogue (**⚠ Référence à choisir**), ou en renseignant les pattes (**✎ Modifier les pattes…** ouvre **Édition du composant**).
3. Composant à plusieurs parties (LM358) : menu **Partie** et bouton **+ U3B** pour poser la partie suivante, même repère et même boîtier.

### Je veux poser un cadre, un cartouche, un trait ou une zone

1. **Affichage → Cartouche : …** : choisir le format de page (aucun, A4 paysage, A3 paysage), le titre, les noms, les dates, les numéros et la société (la société est mémorisée dans le profil).
2. **Placer → Trait** (`T`) : cliquer deux points. Le menu **Forme du tracé** (flèche ▾) choisit trait, rectangle ou zone fonctionnelle.
3. Une **zone fonctionnelle (Room)** a une catégorie (Alimentation, Microcontrôleur, Analogique, Puissance, Communication, Filtrage) : elle entre dans l'analyse des blocs fonctionnels.

### Je veux mesurer une distance

1. Appuyer sur `K`, cliquer le départ, cliquer l'arrivée : distance, ΔX et ΔY s'affichent sur la feuille, l'angle dans le pied de page.
2. Un troisième clic repart d'ailleurs ; `Échap` efface.
3. Une case vaut 1 mm par convention de dessin, pas par cote de fabrication.

### Je veux faire dessiner le schéma par Claude

1. Le serveur de pilotage (MCP) envoie une **carte** dans l'onglet : liste d'opérations (poser, déplacer, tourner, miroir, supprimer, fil, relier, étiqueter, supprimer_fil, feuille, renumeroter, cadre), 40 au plus.
2. Chaque carte montre ce qui sera fait ; **Appliquer** l'exécute en une seule étape d'historique (`Ctrl+Z` la défait), **Refuser** l'écarte. L'interrupteur **Appliquer directement (cet onglet)** supprime le clic.
3. Détails du pilotage : [11-claude-mcp.md](11-claude-mcp.md).

### Je veux travailler au doigt ou au stylet

1. Activer **📱 Tactile** (en-tête). Deux doigts zooment et déplacent la vue ; un appui long ouvre la **roulette** de commandes de ce qui est touché (composant, fil, vide, tracé en cours). Le bouton **Roulette** de l'en-tête (à côté de Tactile) l'ouvre aussi, au centre de la feuille, sur la sélection.
2. **Multi** (groupe Sélection) tient lieu de `Ctrl` : chaque toucher ajoute ou retire un élément ; glisser sur le vide trace un lasso.
3. Détails : [01-accueil-projets-tactile.md](01-accueil-projets-tactile.md).

### Je veux enregistrer et reprendre mon travail

1. `Ctrl+S` (**Enregistrer .json**) écrit `<projet>-SCH.json` dans le dossier du projet ; sans projet ouvert, le fichier est téléchargé.
2. Projet ouvert : un brouillon `<nom>-SCH.brouillon.json` est écrit toutes les 30 s si le schéma est modifié ; à la réouverture, un brouillon plus récent que le document est proposé.
3. Changer d'outil (PCB, Composants, Accueil) met le schéma de côté dans l'onglet ; il est repris au retour sans rien demander, mais l'historique d'annulation (`Ctrl+Z`) repart à zéro.
4. Fermer l'onglet avec un schéma modifié déclenche une demande de confirmation.

## Référence

### En-tête

| Bouton ou menu | Raccourci | Effet | Limites |
|---|---|---|---|
| ➔ | | Ouvre l'éditeur PCB ; le schéma reste dans l'onglet. Avec un composant ou un fil sélectionné, le PCB s'ouvre sur ce repère ou ce net. | Un seul composant, ou le net du premier fil. |
| ⌕ | | Ouvre la recherche de composants ; le schéma reste dans l'onglet. | |
| 📚 | | Ouvre Gestion LIB (catalogue, empreintes, symboles). | |
| ⌂ | | Retour à l'accueil. | |
| 👤 … | | Menu du profil : panneaux, réglages et derniers documents appartiennent à l'utilisateur. | Voir [01-accueil-projets-tactile.md](01-accueil-projets-tactile.md). |
| 📱 Tactile | | Active le mode tactile (adaptation CSS, stylet, roulette). | |
| Roulette | | Ouvre la roulette de commandes au centre de la feuille, sur ce qui est sélectionné ; un second clic la ferme. | Voir *Roulette tactile*. |
| ⇉ PCB | | Met à jour la carte du projet avec ce schéma, en local, puis ouvre l'éditeur PCB. | Version un seul fichier : message d'erreur, passer par la netlist. |
| OUTIL (pastille) | | Rappelle l'outil actif ; un clic ouvre le menu Placer. | |

### Menu Fichier

| Bouton | Raccourci | Effet | Limites |
|---|---|---|---|
| Nouveau | | Efface le contenu de la feuille courante (confirmation). | Agit sur la feuille courante seulement ; annulable. |
| Ouvrir | | Charge un `.json`. | 25 Mo au plus ; 200 feuilles au plus ; éléments invalides ignorés et comptés ; pas de confirmation, annulable par `Ctrl+Z`. |
| Enregistrer .json | `Ctrl+S` | Écrit le document dans le dossier du projet ; sinon le télécharge. | Lancé par WEB_SUITE : écrit dans un projet, jamais en téléchargement. |
| Sauvegarder le projet → GitHub | `Ctrl+Maj+S` | Enregistre puis envoie tout le projet sur GitHub en un commit. | Visible seulement lancé par WEB_SUITE ; sinon `Ctrl+Maj+S` équivaut à l'enregistrement simple. |
| Exemples… | | Fenêtre « Exemples de schémas » : deux schémas complets ; **Ouvrir cet exemple**, **Fermer**. | Remplace le schéma en cours ; confirmation seulement s'il n'est pas vide. |
| Exporter vers le PCB | | Comme **⇉ PCB**. | |
| Exporter .png | | Image 2x de la feuille courante (page entière avec cartouche, variante active dessinée). | Feuille vide : « rien à exporter » ; image trop grande refusée. |
| Netlist .txt | | Netlist lisible, une section par feuille ; annonce la netlist au PCB. | Les noms de net en double prennent le suffixe `_fN` de leur feuille (Hiérarchie = 1). Le pied de page rappelle les remarques de brochage. |
| Nomenclature .csv | | CSV (séparateur `;`, UTF-8 avec BOM) de la variante active. | Document vide : rien à exporter. |
| Nomenclature .xlsx | | Classeur Presentation / History / BOM de la variante active. | « xx » dans les cellules quand le catalogue ne renseigne pas la valeur. |
| Variantes de montage… | | Ouvre la fenêtre des variantes (voir plus bas). | 20 variantes au plus. |

Colonnes du CSV : Repère, Composant, Valeur, Boîtier, Empreinte PCB, Réf Bibliothèque, Part Number, Fabricant, Code LCSC, Réf Mouser, Réf DigiKey, Spécifications, Datasheet, Feuille, Montage (« Monté » ou « Non monté (DNP) »). Fin de fichier : récapitulatif `Qté`, puis variante, composants montés et non montés (DNP).

### Menu Édition

| Bouton | Raccourci | Effet | Limites |
|---|---|---|---|
| Annuler | `Ctrl+Z` | Annule la dernière étape. | 60 étapes. |
| Rétablir | `Ctrl+Y` ou `Ctrl+Maj+Z` | Rétablit. | |
| Copier | `Ctrl+C` | Copie la sélection (composants, fils, traits). | Sur du texte sélectionné dans la page, `Ctrl+C` reste au navigateur. |
| (Couper) | `Ctrl+X` | Copie puis supprime. | Pas de bouton de menu. |
| Coller | `Ctrl+V` | Colle sous le pointeur ; repères libres, noms de net conservés. | La copie passe par le stockage local : possible entre feuilles et onglets. |
| Dupliquer | `D` | Duplique la sélection, décalée de 2 cases ; les copies reçoivent un repère libre et restent sélectionnées. | |
| Pivoter | `R` | Pivote de 90° (avant une pose : pivote le symbole à poser). | |
| Miroir | `M` | Miroir de la sélection. | |
| Supprimer les fils | `U` | Efface les fils de la sélection, les composants restent. | Sans fil dans la sélection, rien n'est supprimé. |
| Supprimer | `Suppr` ou `Retour arrière` | Supprime la sélection. | |
| (Tout sélectionner) | `Ctrl+A` | Sélectionne composants, fils et traits de la feuille. | Pas de bouton de menu. |

### Menu Placer

| Bouton | Raccourci | Effet | Limites |
|---|---|---|---|
| Sélection | `V` | Mode sélection (par défaut). | |
| Composant… | `A` | Ouvre l'explorateur de la bibliothèque. | |
| Fil | `W` | Mode fil. | |
| Bus | `B` | Mode bus (trait épais). | |
| Trait ▾ | `T` | Mode trait ; la flèche ouvre le menu **Forme du tracé**. | `Maj+T` bascule la forme entre trait et rectangle (voir *Limites connues*). |
| Gomme | `X` | Un clic supprime le composant, le fil ou le trait cliqué. | Un fil : le seul segment cliqué. |
| Mesure | `K` | Mode cote : deux points, distance et deltas. | `Échap` efface la cote avant de quitter le mode. |

Menu **Forme du tracé** : **─ Trait (segment)** (`T`), **▢ Rectangle (cadre)** (`Maj+T`), **🔲 Zone fonctionnelle (Room)** (`Z`).

### Menu Affichage

| Bouton | Raccourci | Effet | Limites |
|---|---|---|---|
| Grille | `G` | Affiche ou masque la grille. | L'accrochage reste actif grille masquée. Affiché par défaut ; enregistré dans le profil. |
| Pas de grille | | Menu : **Grille 0,25 mm**, **0,5 mm**, **1 mm**, **2 mm**, **5 mm**. | 1 mm par défaut ; une case de grille = 1 mm par convention de dessin. Trop serrée à l'écran, la grille n'est tracée qu'une case sur deux, sur quatre… et le pied de page annonce la case visible et le pas d'accrochage. |
| Nets : … | `N` | Cycle l'affichage des noms de net : `aucun`, `nommés`, `tous`. | `tous` par défaut ; enregistré dans le profil. |
| Cartouche : … | | Le libellé du bouton donne le format de la feuille (`Cartouche : aucun`, `A4` ou `A3`). Fenêtre **Cartouche** : format (`aucun`, `A4 paysage`, `A3 paysage`), titre, dessiné par, date, vérifié par, date, n° du schéma, n° du PCB, société, adresse, téléphone, site web, mention de confidentialité, logo (**Choisir une image…**, **Retirer**), **Annuler**, **Appliquer**. | Réglé feuille par feuille pour le format ; la société vit dans le profil. Le logo est limité à 200 Ko. |
| Recadrer | | Cadre la vue sur la page entière si un cartouche est défini, sinon sur le contenu. | Zoom de 25 % à 250 % au recadrage. |
| Espace de travail ▾ | | Liste des panneaux (coche = visible) : Bibliothèque, Propriétés, Nomenclature & Nets, Blocs et Motifs ; **Tout afficher**, **Disposition en colonnes**, **Réinitialiser la disposition**. | |

### Menu Outils

| Bouton | Raccourci | Effet | Limites |
|---|---|---|---|
| Rechercher | `Ctrl+F` | Cherche un repère (toutes feuilles) ou un net par son nom. | Voir ci-dessous. |
| Montrer au PCB | `L` | Fait sauter le PCB ouvert dans un autre onglet sur la sélection. | Désactivé si le navigateur ne partage rien entre onglets (`file://`). |
| Contraintes de nets… | | Fenêtre des contraintes pour le PCB. | Nets nommés seulement. |
| Motifs & Blocs | | Relance l'analyse du panneau **Blocs et Motifs** et rouvre ce panneau s'il était fermé. | Demande le serveur. |

**Boîte de recherche** (`Ctrl+F`) : champ « Repere ou nom de net » ; flèches pour choisir, `Entrée` pour y aller, `Échap` ferme, ✕ ferme. Classement : saisie exacte, puis « commence par », puis « contient » ; le texte tapé est aussi cherché dans la valeur du composant et le nom de la feuille. 14 résultats au plus. Une ligne d'une autre feuille l'annonce et change de feuille. Un symbole sans repère n'est pas listé.

### Raccourcis clavier (hors champ de saisie)

| Raccourci | Effet |
|---|---|
| `V` / `W` / `B` / `T` / `X` / `K` | Modes Sélection / Fil / Bus / Trait / Gomme / Mesure |
| `Z` | Mode trait, forme zone fonctionnelle |
| `Maj+T` | Bascule la forme du tracé entre trait et rectangle |
| `A` | Explorateur de la bibliothèque |
| `R`, `M`, `D` | Pivoter, miroir, dupliquer |
| `U` | Supprimer les fils de la sélection |
| `Suppr`, `Retour arrière` | Supprimer |
| `G`, `N` | Grille, noms de net |
| `L` | Montrer au PCB |
| `Flèches` | Déplacent la sélection d'un pas de grille (une rafale = une étape d'historique) |
| `PageDown` / `PageUp` | Feuille suivante / précédente |
| `Échap` | Quitte le mode en cours, annule la pose ou le tracé, vide la sélection ; en mode Mesure avec une cote affichée, efface d'abord la cote |
| `Ctrl+A`, `Ctrl+C`, `Ctrl+X`, `Ctrl+V` | Tout sélectionner, copier, couper, coller |
| `Ctrl+Z`, `Ctrl+Y` | Annuler, rétablir |
| `Ctrl+S`, `Ctrl+Maj+S` | Enregistrer, sauvegarder le projet sur GitHub |
| `Ctrl+F` | Rechercher |

Les raccourcis sont inactifs pendant une saisie dans un champ. Toute autre combinaison avec `Ctrl` ou `Alt` reste au navigateur. `Cmd` vaut `Ctrl` sur Mac.

### Souris, stylet et toucher

| Geste | Effet |
|---|---|
| Clic | Sélectionne le composant, le fil, le trait ou l'étiquette de net |
| `Ctrl`+clic ou `Maj`+clic | Ajoute à la sélection, ou en retire (au relâchement, si le geste n'a pas glissé) |
| Glisser sur le vide | Lasso (éléments entièrement inclus) ; avec `Ctrl`/`Maj`, il s'ajoute à la sélection |
| Glisser un élément | Déplace la sélection ; les fils raccordés restent en équerre |
| `Alt`+glisser sur un élément | Détache le câblage pendant le déplacement |
| `Alt`+glisser sur le vide, ou bouton du milieu | Déplace la vue |
| Molette | Zoom (25 % à 400 %) |
| Glisser un repère, une valeur ou une étiquette de net | Déplace le texte (un trait de rappel le relie à son symbole) |
| Double-clic sur un texte ou une étiquette déplacés | Les remet en place |
| Double-clic sur un composant | Ouvre **Édition du composant** |
| Double-clic sur un bloc (feuille Hiérarchie) | Ouvre la sous-feuille |
| Glisser un bloc (feuille Hiérarchie) | Déplace le bloc |
| Double-clic pendant un tracé de fil, de bus ou de trait | Arrête le tracé |
| Mode Mesure : clic | Pose le départ, puis l'arrivée ; un troisième clic repart d'ailleurs |
| Clic droit | Annule le fil, le trait ou la pose en cours ; sinon vide la sélection |
| Poignée d'extrémité d'un fil seul sélectionné | Étire le segment |
| Poignée de coin d'un trait ou rectangle seul sélectionné | Redimensionne |
| Stylet : glisser sur le vide | Lasso (le doigt déplace la vue) |
| Appui long (toucher) | Ouvre la roulette tactile |
| Deux doigts | Zoom et déplacement de la vue |

### Onglets de feuilles

| Élément | Effet | Limites |
|---|---|---|
| Onglet | Ouvre la feuille ; double-clic la renomme ; clic droit règle le premier numéro des repères | Racine « Hiérarchie » : ni supprimable ni dupliquable. |
| ✕ (sur l'onglet) | Supprime la feuille (confirmation si elle contient des composants, fils, traits ou zones) | Au moins une feuille de schéma est conservée. |
| + Feuille | Ajoute une feuille vide | |
| Dupliquer | Copie la feuille courante, nommée « … (copie) » | Impossible sur la racine. |

### Panneau Bibliothèque

Chaque symbole intégré est un bouton : un clic le prépare à la pose (un second clic sur le même symbole annule). Pied de page : « Clic sur la feuille pour poser … · R pour pivoter · Maj+clic pour en poser plusieurs. »

| Catégorie | Symboles |
|---|---|
| Passifs | Résistance, Potentiomètre, Condensateur, Chimique, Bobine, Transfo, Quartz, Fusible, Varistance, Filtre SAW, Perle de ferrite |
| Semi-conducteurs | Diode, LED, Zener, Schottky, NPN, PNP, MOSFET N, MOSFET P, Diode TVS, Réseau ESD, Réseau ESD 4 lignes, Réseau ESD 2 lignes, MOSFET N + P |
| Intégrés | AOP, Circuit intégré, Régulateur |
| Alimentation | Alimentation, Masse, Étiquette / net, Étiquette globale, Pile, Source AC |
| Divers | Interrupteur, Bouton poussoir, Relais, Moteur, Buzzer, Lampe, Antenne, Connecteur 2, Barrette 1x3, 1x4, 1x6, 1x8, 2x5, USB Type-C (Alim), USB Type-C, Micro-USB, Point de test, Point de test percé, Trou mécanique, Mire, Pont de soudure |
| Annotations | Tension, Courant, Texte libre, Note encadrée |

Les symboles issus de la LIB (fichiers du catalogue dont l'« Empreinte Schématique » n'est pas intégrée) se posent par l'explorateur (`A`). Un symbole posé est recopié dans le document, qui s'ouvre donc identique sur un poste dont la LIB ne le contient pas.

Explorateur de la bibliothèque (`A`) : champ de recherche (✕ efface), menu de catégories, filtres **Modèle SPICE**, **CMS / SMD**, **Traversant / THT**, compteur de références, galerie de cartes, volet d'inspection, **Annuler**, **✔ Placer sur le schéma**. Double-clic sur une carte : pose immédiate ; `Échap` annule.

### Panneau Propriétés

Le panneau change selon la sélection. Chaque panneau (Bibliothèque, Propriétés, Nomenclature & Nets, Blocs et Motifs) a quatre boutons d'en-tête : **▾** Replier, **□** Plein écran (**⧉** Restaurer, `Échap`), **⬒** Détacher / rattacher, **✕** Fermer.

**Composant seul**

| Champ ou bouton | Effet | Limites |
|---|---|---|
| Type | Nom du symbole | Lecture seule. |
| Référence | Repère | Absent pour les masses, alimentations et étiquettes. |
| Valeur (ou **Nom du net**, **Tension du rail**, **Nom du net (toutes feuilles)**, **Tension mesurée**, **Courant annoté**, **Texte (\| = nouvelle ligne)**, **Note (\| = nouvelle ligne)**) | Valeur du composant ; pour une étiquette ou une alimentation, elle nomme le net | Une saisie = une étape d'historique. |
| Recherche en ligne : **⌕ Rechercher & Enrichir** / **⌕ Modifier / Ré-enrichir**, ✕ | Ouvre la fenêtre d'enrichissement ; ✕ efface MPN, fabricant, caractéristiques, datasheet, références distributeurs | Voir la fenêtre d'enrichissement. |
| MPN, Fabricant, caractéristiques, **⚡ Brochage validé** | Résumé des données enrichies | |
| **📄 Ouvrir la Datasheet** (« (locale) » ou ↗) | Ouvre la datasheet liée | Visible si une datasheet est connue. |
| Catalogue LIB (n réf) : recherche, liste | Associe une référence du catalogue (valeur, boîtier, empreinte, symbole, simulation, fabricant, MPN, caractéristiques, brochage) | Une centaine de résultats affichés au plus (101). Un symbole générique propose d'abord les références de la LIB qui l'utilisent. |
| Case « toutes les références « P », pas seulement celles du symbole … » | Élargit la liste à tout le préfixe | Visible pour un symbole générique. |
| **Charger le CSV manuellement** | Choisit un `LIB_composants.csv` à la main | Visible si le catalogue n'est pas chargé. |
| Part Name, Symbole, Empreinte PCB, Modèle Simu, MPN / Mfr | Rappel de l'association | |
| **⚠ Version LIB plus récente**, **🔄 Mettre à jour depuis la LIB** | Reporte les changements de la Gestion LIB sur ce composant | Visible après une modification de la LIB. |
| **📚 Ouvrir dans Gestion LIB ↗** | Ouvre le composant dans la Gestion LIB | |
| Brochage (voir plus bas) | Table broche → patte, parties, alertes | |
| Boîtier | Base, puis nombre de broches ; **Personnalisé…** : nom libre | Alerte si le nombre de broches du boîtier ne correspond pas au symbole. |
| Monté dans les variantes | Une case par variante ; **Gérer les variantes de montage…** (ou **Créer des variantes de montage…** s'il n'y en a pas) | |
| **Pivoter**, **Miroir** | Comme `R` et `M` | |
| **✎ Détails du composant…** | Ouvre **Édition du composant** | |
| **Replacer les textes** | Remet repère et valeur à leur place | Visible si un libellé a été déplacé. |
| **Étendre à tout le document** / **Restreindre à cette feuille** | Passe une étiquette locale en globale, et inversement | Étiquettes seulement. |
| **Supprimer** | Supprime le composant | |
| Connexions & Broches | Pour chaque broche : nom éditable (« nom broche », 32 caractères) et net raccordé (un clic sélectionne le net) ; « non connecté » sinon | |

**Fil ou bus (un ou plusieurs segments)**

| Champ ou bouton | Effet | Limites |
|---|---|---|
| Sélection | Nature (Fil ou Bus, horizontal, vertical, oblique) ou nombre de segments (alors **Longueur cumulée** au lieu de Départ / Arrivée) | Lecture seule. |
| Net | Nom du net (saisie = étiquette posée sur le fil) | Désactivé si le nom vient d'un symbole d'alimentation ou d'une étiquette. |
| **Sélectionner le net** | Sélectionne tous les fils du net | |
| **Masquer l'étiquette** / **Étiquette masquée**, **Replacer l'étiquette** | Masque l'étiquette du net (sur tous ses fils) ; la remet en place | |
| Classe du net | Menu `Auto · …` ou une classe imposée | Net nommé seulement. |
| Contraintes pour le PCB, **Contraintes du net…** | Résumé et accès à la fenêtre des contraintes | Net nommé seulement. |
| Faisceau de bus (n signaux), **⚡ Piquer un signal** | Signaux développés du bus ; ouvre le piquage | Bus seulement. |
| Piquage du bus « … » | Choix du signal du fil piqué | Fil raccordé à un bus. |
| Départ, Arrivée, Longueur (en pas de grille) | Géométrie | Lecture seule. |
| **Supprimer** | Supprime la sélection | |

**Plusieurs éléments** : décompte (composants, fils, traits), rappel des raccourcis, **Supprimer les n fils**, et, si une variante est active, **Monter** / **Ne pas monter**.

**Trait ou rectangle seul**

| Champ | Effet |
|---|---|
| Forme | Trait (segment) ou Rectangle (cadre) |
| Zone fonctionnelle (Room) | Rectangle seulement. Case : fait du rectangle une zone. Catégorie et Composants capturés (n) sont affichés pour tout rectangle ; choisir une catégorie coche la case et change la couleur |
| Catégorie | Alimentation / Régulation, Microcontrôleur / Numérique, Analogique / Capteurs / Audio, Étage de puissance / Moteurs, Bus / Communication (I2C, SPI...), Filtrage / Protections ESD |
| Style de trait | Tirets (délimitation), Continu (plein), Pointillés |
| Épaisseur | Fine (1,5 px), Standard (2 px), Épaisse (3 px), Très épaisse (4 px) |
| Couleur | Ambre / Alim, Bleu MCU, Vert Analogique, Rouge Puissance, Violet Bus, Gris délimitation |
| Nom / Libellé de zone | Texte affiché sur la zone |
| Dimensions | Coordonnées et taille en mm (lecture seule) |
| **Supprimer le rectangle** / **Supprimer le trait** | Supprime l'élément |

**Bloc hiérarchique** (feuille Hiérarchie) : **Nom de la sous-feuille**, Contenu (composants et fils), **Ouvrir cette feuille ➔**, **Supprimer cette feuille**.

**Brochage par référence.** Un symbole générique (AOP, transistor, régulateur) ne connaît que ses broches ; la colonne `Brochage` du catalogue dit sur quelle patte du boîtier chacune tombe (par exemple `OUT=1,V-=2,IN+=3,IN-=4,V+=5` ; `A:…|B:…|*:…` pour un composant à parties ; `OUT=2/4` pour une languette). Le choix de la référence copie cette table sur le composant ; la netlist écrit alors la patte et non plus le numéro de broche. Sans table, la broche n va sur la patte n.

| Élément | Effet |
|---|---|
| **⚠ Référence à choisir (n)** | Amène au champ de recherche du catalogue |
| Brochage (source) | Table broche → patte(s) ; `?` si la patte manque |
| Partie, **+ U3B** | Choisit la partie du composant ; pose la suivante à côté, même repère |
| ⛔ / ⚠ (alertes) | Voir ci-dessous |
| **✎ Modifier les pattes…** | Ouvre **Édition du composant** |

Contrôles relevés : symbole à n broches sur un boîtier à plus de pattes sans brochage ; broche absente du brochage de la référence ; broche d'alimentation reliée à la masse ; broche de masse reliée à une alimentation ; broche négative reliée au rail positif ; deux nets sur une même patte ; repère déjà pris par une autre référence ; partie posée deux fois ; partie non posée (alerte).

### Fenêtre Édition du composant

| Élément | Effet |
|---|---|
| Référence, Valeur / Modèle | Saisie directe |
| Symbole / Type | Change le symbole |
| Boîtier / Empreinte | Menu de bases et champ libre |
| Référence fabricant (MPN), Fabricant | Saisie directe |
| **📚 Ouvrir dans Gestion LIB ↗** | Ouvre le composant dans la Gestion LIB |
| Broches connectées (n) | Tableau : N°, Nom de la broche, **Patte** (patte de l'empreinte ; vide : même numéro ; plusieurs : `2/4`), Pos (X,Y), Net connecté |
| **Enregistrer & Fermer** | Ferme la fenêtre : les saisies s'appliquent au fil de la frappe (une seule étape d'historique pour la séance) ; ✕ ou clic hors de la fenêtre ferme aussi |

Le tracé du symbole se gère dans la Gestion LIB ([05-gestion-lib.md](05-gestion-lib.md)).

### Panneau Nomenclature & Nets

| Élément | Effet | Limites |
|---|---|---|
| Onglets **Nomenclature** / **Nets** | Bascule la liste | Enregistré dans le profil. |
| Menu de variante (`Carte complète` + variantes) | Variante de montage active ; la liste, l'export et la feuille la suivent | Onglet Nomenclature. |
| **◫** | Ouvre la fenêtre des variantes | |
| Case **tout le doc.** | Toute la liste du document au lieu de la feuille courante | Enregistré dans le profil. |
| Ligne de nomenclature | Sélectionne le composant (change de feuille si besoin) | Un composant à parties apparaît en une ligne par symbole (`U3A`, `U3B`). |
| Ligne de net | Sélectionne le net ; survol : halo sur la feuille | Vue document : ouvre la feuille et sélectionne. |
| Menu **Classe** | `Auto · …` ou une classe imposée | Net nommé seulement. |

Colonne Source d'un net : `auto`, `label`, `étiq.`, `globale`. ⇄ marque un net global ; ⚠ un conflit de noms. Sous la liste de la feuille : nombre de nets, broches en l'air, nets à noms multiples. En vue document, la nomenclature marque la feuille de chaque ligne (`f2` pour la première feuille de schéma, Hiérarchie = 1).

Classes de net disponibles : Masse, Alimentation, Horloge, Rapide, RF, Analogique, Antenne, USB FS, USB HS, ETH 100, ETH 1000, LVDS, CAN, RS-485, Lent. Les classes d'interface (USB, Ethernet, LVDS, CAN, RS-485) ne se posent qu'à la main.

### Fenêtre Variantes de montage (BOM)

| Élément | Effet | Limites |
|---|---|---|
| Liste des variantes | Rond = variante active ; nom éditable ; compteur de non-montés (`n NM`, `tout` pour la carte complète) | `Carte complète` monte tout et n'est pas modifiable. |
| ⇩ (ligne) | Exporte la BOM de cette variante (CSV) | |
| ✕ (ligne) | Supprime la variante (confirmation) | |
| Nom, copie, **＋ Ajouter** | Crée une variante, vierge ou copiée d'une autre | 20 variantes au plus ; 40 caractères par nom. |
| **⇩ Exporter la BOM de chaque variante** | Un CSV par variante, carte complète comprise | |
| Filtre | Filtre par repère, valeur, boîtier | |
| Matrice | Une case « monté » par composant et par variante ; ✓ / ✗ de colonne | Agit sur les composants affichés. |

Chaque geste s'annule par `Ctrl+Z`, sauf le choix de la variante active (réglage du document, hors historique). La variante active règle aussi la BOM et les positions du PCB à sa prochaine synchronisation. Le document garde `variantes: {liste, active}` et, sur chaque composant, la liste des variantes où il n'est pas monté ; renuméroter les repères ne perd donc rien.

### Fenêtre Contraintes de nets — pour le PCB

| Élément | Effet | Limites |
|---|---|---|
| Filtrer les nets, **Tous les nets** | Filtre la liste | |
| Net, Classe, Topologie | Nom du net ; classe (mêmes choix que le panneau Nets) ; Topologie : `—`, point à point, chaîne, étoile, fly-by | |
| **Z cible Ω** | Impédance cible | 1 à 1000 Ω. |
| **Tol. %** | Tolérance sur l'impédance | 10 % si vide ; 0,1 à 100. |
| **L min mm**, **L max mm** | Longueur minimale / maximale du cuivre | 0,01 à 100 000 mm. |
| **Vias max** | Nombre de vias maximal | 0 à 10 000. |
| **Couches** | Couches permises (`1,4` pour L1 et L4) | Vide : toutes. |
| **Ordre** | Ordre des repères le long du net (`U1, U4, U5`, `U1 > U4 > U5` ou avec `→`), le premier est la source | 64 repères au plus. |
| **Moignon max mm** | Longueur de moignon admise | 0 : aucun. |
| **Via max mm** | Moignon de via admis | 0 à 100 mm. |
| **Tol. étoile mm** | Écart admis entre les branches d'une étoile | 1 mm si vide. |
| Repères | Composants du net | Lecture seule. |
| Groupes d'appariement : nom, mode (`en longueur (mm)` / `en délai (ps)`), ± tolérance, référence (`le plus long` ou un net), 🗑, × par membre | Édition d'un groupe | Tolérance par défaut : 0,5 mm ou 10 ps. |
| Nouveau groupe : nom, mode, tolérance, filtre, cases de nets, **Créer avec les nets cochés** | Crée un groupe | |
| À revoir : **Effacer** | Efface les contraintes d'un net qui n'existe plus | |

Une virgule vaut un point. `Échap` ferme. Seuls les nets nommés sont listés. Le PCB garde le dernier mot : un champ réglé dans le PCB passe devant celui du schéma ; les contraintes de classe, l'isolation entre classes et les largeurs restent au PCB.

### Panneau Blocs et Motifs

| Élément | Effet | Limites |
|---|---|---|
| 🔄 / **🔄 Actualiser** / **🔄 Réessayer** | Relance l'analyse | Messages : « Schéma vide. », « Serveur non disponible », « Analyse refusée par le serveur ». |
| Bloc (nom, classe suggérée) | Alimentation, bus, oscillateur, filtre ou zone | |
| Boutons de repères | Sélectionnent le composant sur le schéma | |
| Nets, Tension inférée | Rappels | Tension pour les alimentations. |
| Classes de nets (n · k corrigée(s)) | Un menu par net nommé ; raison de la classe en légende | |
| Courants DC inférés (Solveur PI) | Source, type, mA | |
| **Valider pour PI** (puis **✓ Enregistré !**) | Enregistre les courants dans l'onglet pour le solveur d'alimentation | |

Motifs reconnus par `python/pattern_recognition.py` :

| Motif | Reconnu par |
|---|---|
| Régulateurs linéaires | Séries 78xx / 79xx, LDO (AMS1117, LM1117, LD1117, LP2985, MCP1700, TLV700, MIC5205, LP5907, TPS7xxxx), réglables (LM317, LM337, LM1086, LT1085) |
| Alimentations à découpage (« Hacheur … ») | LM2596, LM2576, TPS54xxx, MP1584, MP2307, XL4015, MC34063, MT3608 ; nœud de commutation signalé comme agresseur |
| Bus I2C | Noms SDA / SCL ou résistances de pull-up vers l'alimentation |
| Bus SPI | Noms MOSI, MISO, SCK, SCLK, SPI |
| Liaison UART (TX/RX) | Noms TX, RX, UART |
| Oscillateur | Quartz ou résonateur (repère `Y` / `X`, ou valeur en MHz / kHz) et ses deux condensateurs de charge |
| Filtre RC | Résistance et condensateur en passe-bas |
| Zone | Rectangle « Zone fonctionnelle (Room) » dessiné par l'utilisateur |

La classe d'un net est proposée d'après son nom, les motifs, les composants reliés (AOP : Analogique ; antenne ou composant RF : RF), les noms de broches et les paires différentielles. Une classe corrigée à la main (S.netClasses) l'emporte.

### Fenêtre d'enrichissement composant (Rechercher & Enrichir)

| Élément | Effet |
|---|---|
| Champ de recherche, **Chercher** | Recherche JLCPCB (`jlc_search`, 16 résultats), puis Mouser / DigiKey si rien |
| **Basic / Sans frais d'abord** | Filtre les pièces « Basic » JLCPCB |
| **Mouser / DigiKey ↗** | Force la recherche chez ces distributeurs |
| Liste des candidats | Sélection : détail et comparatif distributeurs |
| Section DISTRIBUTEURS & DISPONIBILITÉ | Stock et prix (1+) JLCPCB / LCSC, Mouser, DigiKey |
| Section DONNÉES TECHNIQUES À ENRICHIR | Cases : Référence (MPN), Fabricant, Boîtier / Empreinte, Télécharger la Datasheet, Code LCSC (décoché par défaut), Référence Mouser, Référence DigiKey, Brochage officiel, caractéristiques |
| **Tout cocher**, **Essentiel seul** | Coche tout, ou seulement l'essentiel |
| Brochage schématique officiel | N°, Broche officielle, Type électrique, Fil schématique actuel, Concordance (« Prêt à câbler », « Concordant », « Masse OK », « Alim OK », « Court-circuit VCC/GND »…) |
| Vérification du câblage schématique | Corrections à cocher : inversion de signal, court-circuit alimentation/masse évité |
| Case « Appliquer également aux n autre(s) composant(s) identique(s) » | Propage aux composants de même valeur |
| **Annuler**, **✓ Valider et enrichir** | Ferme ; applique (désactivé tant qu'aucun détail n'est chargé) |
| `Échap`, ✕ | Ferme |

### Synchronisation avec la Gestion LIB

Quand une fiche est modifiée dans la Gestion LIB, un bandeau **Bibliothèque modifiée** annonce le nombre de composants du schéma concernés. **🔄 Mettre à jour** les met tous à jour (message « n composant(s) mis à jour depuis la bibliothèque ») ; ✕ ignore. Chaque composant concerné porte aussi **⚠ Version LIB plus récente** dans ses propriétés. Un brochage retouché à la main n'est pas écrasé.

### Pied de page

| Zone | Contenu |
|---|---|
| Feuille | `Hiérarchie (n feuilles)` ou `Feuille i/n` |
| Mode | Sélection, Fil, Bus, Gomme, Trait, Mesure |
| X · Y | Position du pointeur, en mm |
| Zoom | Niveau de zoom |
| Grille | Valeur d'une case affichée et pas d'accrochage |
| Composants · Fils · Nets | Compteurs de la feuille |
| Net | Nom et nombre de nœuds du net survolé ; sur la feuille Hiérarchie, la broche de bloc survolée |
| Astuce | Conseil du mode en cours et messages d'état |

### Profil

Les réglages d'affichage suivent l'utilisateur et non le schéma : pas de grille, grille affichée ou non, affichage des noms de net, onglet du panneau de liste, case « tout le doc. » de chaque liste, disposition des panneaux, société du cartouche. Changer d'utilisateur les remplace. Voir [01-accueil-projets-tactile.md](01-accueil-projets-tactile.md).

### Roulette tactile (mode Tactile)

Un appui long ouvre la roulette ; ses commandes par défaut dépendent de ce qui est touché.

| Contexte | Commandes par défaut |
|---|---|
| Composant | Propriétés, Pivoter, Miroir, Supprimer ; groupes Édition (Copier, Couper, Coller, Dupliquer), Historique (Annuler, Rétablir), Sélection (Multi, Échap, Montrer ailleurs) |
| Fil | Net entier, Fil, Supprimer ; groupes Édition (Copier, Couper, Coller), Historique ; Noms de nets, Échap |
| Vide | Enregistrer, Vers le PCB, Fil, Coller ; groupes Dessiner (Bibliothèque, Bus, Trait, Zone, Mesure), Vue (Recadrer, Grille, Chercher, Noms de nets), Historique, Sélection (Multi, Tout, Échap) |
| Tracé en cours | Terminer, Échap, Annuler, Grille |

Le secteur ＋ de la roulette ouvre la fenêtre **Roulette de commandes** : onglets par contexte (un composant, un fil / une piste, le vide, un tracé en cours), liste du contenu (monter ↑, descendre ↓, retirer ✕), ajout d'une commande ou d'un groupe (**Créer le groupe**, nom de 14 caractères au plus), **Ma propre commande** (icône, nom, raccourci clavier rejoué par la roulette), options de gestes (l'appui long au doigt ouvre la roulette, ignorer la paume quand le stylet est posé, afficher les noms sous les icônes) et **Revenir aux roulettes d'origine**. Huit éléments au plus par roulette, six commandes au plus par groupe. Les réglages suivent le profil.

### Dessin par Claude (cartes du canal de pilotage)

| Opération | Effet |
|---|---|
| `poser` | Pose un symbole intégré (`type`) ou une ligne du catalogue (`catalogue` = Part Name) |
| `deplacer`, `tourner`, `miroir` | Déplace, pivote (0, 90, 180, 270°), retourne un composant désigné par son repère ou `#id` |
| `fil`, `relier` | Trace un fil ; relie deux broches |
| `etiqueter`, `supprimer_fil` | Pose une étiquette ou alimentation nommant un net ; supprime un fil |
| `feuille` | Crée une feuille (`creer`) ou renomme une feuille (`renommer`) ; vise une feuille avec `feuille` (numéro de page, Hiérarchie = 1) |
| `renumeroter` | Refait les repères par préfixe, feuille par feuille |
| `cadre` | Pose un cadre, éventuellement zone fonctionnelle, avec titre |
| `supprimer` | Supprime un composant |

Un lot compte 40 opérations au plus ; le premier refus l'arrête. Le lot est joué à blanc pour afficher la carte, puis rejoué au clic en une étape d'historique. Le détail des paramètres est dans [11-claude-mcp.md](11-claude-mcp.md).

## Limites connues

- Il n'y a plus de fenêtre **Brochage** dans le schéma : les noms de broches et les pattes se règlent dans **Édition du composant**, le tracé du symbole dans la Gestion LIB.
- `T` entre en mode Trait avec la forme courante ; seul `Maj+T` bascule entre trait et rectangle. Le menu **Forme du tracé** affiche `T` pour le trait et `Maj+T` pour le rectangle : à l'usage, `Maj+T` alterne les deux formes. `T` ou `Maj+T` après `Z` rendent le tracé ordinaire (trait ou rectangle) : le caractère « zone » ne survit ni à `T` ni à la sortie du mode.
- La mesure n'est pas une cote de fabrication : une case vaut 1 mm par convention de dessin.
- La reconnaissance de motifs, la classification automatique des nets et la recherche en ligne demandent le serveur (`python web_CAO.py`). Sans lui, seules la masse et les alimentations reconnues par leur nom reçoivent une classe, et le PCB ne reçoit que les corrections et les évidences.
- Les amplificateurs ne sont pas reconnus comme blocs ; un AOP ou un ampli audio sert seulement d'indice pour classer ses nets en Analogique.
- Un net anonyme (`N$…`) ne se classe ni ne se contraint : son nom change au moindre fil.
- Les contraintes d'un net renommé ne suivent pas : elles passent sous **À revoir**.
- Le CSV, le XLSX et la netlist n'exportent que ce que la LIB et le schéma renseignent ; « xx » signale une valeur manquante.
- 60 étapes d'annulation, 200 feuilles, 25 Mo à l'ouverture, 20 variantes, 40 opérations par carte de Claude.
- Version « un seul fichier » : l'export vers le PCB n'est pas possible (message), la netlist `.txt` fait le lien.
- Sans projet ouvert, il n'y a ni brouillon ni écriture dans un dossier : le fichier est téléchargé et l'avertissement de fermeture reste le seul filet.
- **Ctrl+C** sur du texte sélectionné dans la page reste au navigateur.

## Voir aussi

- [01-accueil-projets-tactile.md](01-accueil-projets-tactile.md) : projets, profils, mode tactile.
- [03-editeur-pcb-edition-routage.md](03-editeur-pcb-edition-routage.md) : import de la netlist, ECO, contraintes côté PCB.
- [04-editeur-pcb-fabrication.md](04-editeur-pcb-fabrication.md) : variantes (BOM, positions), fabrication.
- [05-gestion-lib.md](05-gestion-lib.md) : catalogue, symboles, empreintes.
- [06-recherche-composants.md](06-recherche-composants.md) : recherche autonome de composants.
- [11-claude-mcp.md](11-claude-mcp.md) : pilotage par Claude.
- [../../editeur-schematique/README.md](../../editeur-schematique/README.md) : organisation des modules.
